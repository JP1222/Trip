import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { PoolClient } from "pg";
import {
  closeDatabase,
  migrateDatabase,
  query,
  withTransaction,
} from "../src/lib/db";
import type {
  BudgetItem,
  Comment,
  DayPlan,
  PhotoMeta,
  Trip,
  TripBudget,
} from "../src/lib/types";

type SourceDocument = {
  relativePath: string;
  contents: string;
};

type LegacyTripMedia = {
  tripId: string;
  photos: PhotoMeta[];
};

type LegacyTripComments = {
  tripId: string;
  comments: Comment[];
};

export type LegacyOrphanDirectory = {
  tripId: string;
  mediaItems: number;
  binaryFiles: number;
};

export type LegacyOrphanCommentFile = {
  tripId: string;
  comments: number;
};

export type LegacyImportReport = {
  sourceFingerprint: string;
  trips: number;
  members: number;
  tips: number;
  days: number;
  itineraryItems: number;
  budgets: number;
  budgetItems: number;
  media: number;
  assets: number;
  comments: number;
  skippedComments: number;
  invalidatedCollabTokenTripIds: string[];
  orphanDirectories: LegacyOrphanDirectory[];
  orphanCommentFiles: LegacyOrphanCommentFile[];
  missingReferencedFiles: string[];
  unreferencedFiles: string[];
  warnings: string[];
  errors: string[];
};

export type LegacyImportPlan = {
  root: string;
  trips: Trip[];
  media: LegacyTripMedia[];
  comments: LegacyTripComments[];
  report: LegacyImportReport;
};

export type LegacyCommitResult = {
  runId: string;
  skipped: boolean;
};

async function readJsonDocument<T>(
  absolutePath: string,
  relativePath: string,
  documents: SourceDocument[],
): Promise<T> {
  const contents = await fs.readFile(absolutePath, "utf8");
  documents.push({ relativePath, contents });
  return JSON.parse(contents) as T;
}

function sourceFingerprint(documents: SourceDocument[]): string {
  const hash = createHash("sha256");
  for (const document of [...documents].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  )) {
    hash.update(document.relativePath);
    hash.update("\0");
    hash.update(document.contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function ensurePlainFilename(
  tripId: string,
  filename: string,
  label: string,
  errors: string[],
): void {
  if (!filename || path.basename(filename) !== filename) {
    errors.push(`${tripId}: invalid ${label} filename ${JSON.stringify(filename)}`);
  }
}

function mediaAssetCount(photo: PhotoMeta): number {
  return photo.liveVideoFilename ? 2 : 1;
}

function legacyMediaKind(photo: PhotoMeta): "image" | "video" | "live_photo" {
  if (photo.liveVideoFilename) return "live_photo";
  return photo.mimeType.startsWith("video/") ? "video" : "image";
}

function dayId(tripId: string, day: DayPlan, position: number): string {
  return `legacy:${tripId}:day:${day.day}:${position}`;
}

function jsonValue(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function timestamp(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return parsed.toISOString();
}

function validateTripGraph(trips: Trip[], errors: string[]): void {
  const tripIds = new Set<string>();
  const itemIds = new Set<string>();
  const budgetItemIds = new Set<string>();

  for (const trip of trips) {
    if (tripIds.has(trip.id)) errors.push(`duplicate trip id: ${trip.id}`);
    tripIds.add(trip.id);
    const dayNumbers = new Set<number>();
    for (const [dayPosition, day] of trip.days.entries()) {
      if (dayNumbers.has(day.day)) {
        errors.push(`${trip.id}: duplicate day number ${day.day}`);
      }
      dayNumbers.add(day.day);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
        errors.push(`${trip.id}: days[${dayPosition}] has invalid date ${day.date}`);
      }
      for (const item of day.items) {
        if (itemIds.has(item.id)) {
          errors.push(`duplicate global itinerary item id: ${item.id}`);
        }
        itemIds.add(item.id);
      }
    }
    for (const item of trip.budget?.items || []) {
      if (budgetItemIds.has(item.id)) {
        errors.push(`duplicate global budget item id: ${item.id}`);
      }
      budgetItemIds.add(item.id);
    }
  }
}

export async function buildLegacyImportPlan(
  root = process.cwd(),
): Promise<LegacyImportPlan> {
  const dataRoot = path.join(root, "data");
  const commentsRoot = path.join(dataRoot, "comments");
  const uploadsRoot = path.join(root, "public", "uploads");
  const documents: SourceDocument[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const trips = await readJsonDocument<Trip[]>(
    path.join(dataRoot, "trips.json"),
    "data/trips.json",
    documents,
  );
  if (!Array.isArray(trips)) throw new Error("data/trips.json must be an array");
  validateTripGraph(trips, errors);
  const tripIds = new Set(trips.map((trip) => trip.id));

  const commentEntries = await fs.readdir(commentsRoot, { withFileTypes: true });
  const comments: LegacyTripComments[] = [];
  const orphanCommentFiles: LegacyOrphanCommentFile[] = [];
  let skippedComments = 0;
  for (const entry of commentEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const tripId = entry.name.slice(0, -".json".length);
    const list = await readJsonDocument<Comment[]>(
      path.join(commentsRoot, entry.name),
      `data/comments/${entry.name}`,
      documents,
    );
    if (!Array.isArray(list)) {
      errors.push(`data/comments/${entry.name} must contain an array`);
      continue;
    }
    if (!tripIds.has(tripId)) {
      orphanCommentFiles.push({ tripId, comments: list.length });
      skippedComments += list.length;
      continue;
    }
    for (const comment of list) {
      if (comment.tripId !== tripId) {
        errors.push(
          `${entry.name}: comment ${comment.id} declares tripId ${comment.tripId}`,
        );
      }
    }
    comments.push({ tripId, comments: list });
  }

  const uploadEntries = await fs.readdir(uploadsRoot, { withFileTypes: true });
  const media: LegacyTripMedia[] = [];
  const orphanDirectories: LegacyOrphanDirectory[] = [];
  const missingReferencedFiles: string[] = [];
  const unreferencedFiles: string[] = [];
  const globalMediaIds = new Set<string>();
  const knownMediaByTrip = new Map<string, Set<string>>();

  for (const entry of uploadEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const tripId = entry.name;
    const directory = path.join(uploadsRoot, tripId);
    const metadataPath = path.join(directory, "photos.json");
    let photos: PhotoMeta[] = [];
    try {
      photos = await readJsonDocument<PhotoMeta[]>(
        metadataPath,
        `public/uploads/${tripId}/photos.json`,
        documents,
      );
      if (!Array.isArray(photos)) {
        errors.push(`public/uploads/${tripId}/photos.json must contain an array`);
        photos = [];
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        warnings.push(`${tripId}: no photos.json; directory will not be imported`);
      } else {
        throw error;
      }
    }

    const diskFiles = new Set(
      (await fs.readdir(directory, { withFileTypes: true }))
        .filter((file) => file.isFile() && file.name !== "photos.json")
        .map((file) => file.name),
    );
    const referencedFiles = new Set<string>();
    for (const photo of photos) {
      if (photo.tripId !== tripId) {
        errors.push(
          `${tripId}: media ${photo.id} declares tripId ${photo.tripId}`,
        );
      }
      if (globalMediaIds.has(photo.id)) {
        errors.push(`duplicate global media id: ${photo.id}`);
      }
      globalMediaIds.add(photo.id);
      ensurePlainFilename(tripId, photo.filename, "primary", errors);
      referencedFiles.add(photo.filename);
      if (photo.liveVideoFilename) {
        ensurePlainFilename(tripId, photo.liveVideoFilename, "live", errors);
        referencedFiles.add(photo.liveVideoFilename);
      }
    }

    for (const filename of referencedFiles) {
      if (!diskFiles.has(filename)) {
        missingReferencedFiles.push(`${tripId}/${filename}`);
      }
    }
    for (const filename of diskFiles) {
      if (!referencedFiles.has(filename)) {
        unreferencedFiles.push(`${tripId}/${filename}`);
      }
    }

    if (!tripIds.has(tripId)) {
      orphanDirectories.push({
        tripId,
        mediaItems: photos.length,
        binaryFiles: diskFiles.size,
      });
      continue;
    }
    media.push({ tripId, photos });
    knownMediaByTrip.set(tripId, new Set(photos.map((photo) => photo.id)));
  }

  if (missingReferencedFiles.length > 0) {
    errors.push(`${missingReferencedFiles.length} referenced media files are missing`);
  }
  if (unreferencedFiles.length > 0) {
    warnings.push(
      `${unreferencedFiles.length} unreferenced files were found and will not be deleted`,
    );
  }

  for (const source of comments) {
    const mediaIds = knownMediaByTrip.get(source.tripId) || new Set<string>();
    source.comments = source.comments.filter((comment) => {
      if (!comment.photoId || mediaIds.has(comment.photoId)) return true;
      skippedComments += 1;
      warnings.push(
        `${source.tripId}: comment ${comment.id} references missing media ${comment.photoId} and will be skipped`,
      );
      return false;
    });
  }

  const invalidatedCollabTokenTripIds = trips
    .filter((trip) => Boolean(trip.collabToken))
    .map((trip) => trip.id)
    .sort();
  if (invalidatedCollabTokenTripIds.length > 0) {
    warnings.push(
      `${invalidatedCollabTokenTripIds.length} plaintext collaboration token(s) will be invalidated, not imported`,
    );
  }
  if (orphanDirectories.length > 0) {
    warnings.push(
      `${orphanDirectories.length} orphan upload director${orphanDirectories.length === 1 ? "y" : "ies"} will be reported and left untouched`,
    );
  }
  if (orphanCommentFiles.length > 0) {
    warnings.push(
      `${orphanCommentFiles.length} orphan comment file(s) will be reported and left untouched`,
    );
  }

  const report: LegacyImportReport = {
    sourceFingerprint: sourceFingerprint(documents),
    trips: trips.length,
    members: trips.reduce((sum, trip) => sum + trip.members.length, 0),
    tips: trips.reduce((sum, trip) => sum + (trip.tips?.length || 0), 0),
    days: trips.reduce((sum, trip) => sum + trip.days.length, 0),
    itineraryItems: trips.reduce(
      (sum, trip) =>
        sum + trip.days.reduce((daySum, day) => daySum + day.items.length, 0),
      0,
    ),
    budgets: trips.filter((trip) => trip.budget != null).length,
    budgetItems: trips.reduce(
      (sum, trip) => sum + (trip.budget?.items.length || 0),
      0,
    ),
    media: media.reduce((sum, source) => sum + source.photos.length, 0),
    assets: media.reduce(
      (sum, source) =>
        sum + source.photos.reduce((count, photo) => count + mediaAssetCount(photo), 0),
      0,
    ),
    comments: comments.reduce((sum, source) => sum + source.comments.length, 0),
    skippedComments,
    invalidatedCollabTokenTripIds,
    orphanDirectories,
    orphanCommentFiles,
    missingReferencedFiles: missingReferencedFiles.sort(),
    unreferencedFiles: unreferencedFiles.sort(),
    warnings,
    errors,
  };

  return { root, trips, media, comments, report };
}

async function replaceTripChildren(
  client: PoolClient,
  trip: Trip,
): Promise<void> {
  await client.query("DELETE FROM trip_members WHERE trip_id = $1", [trip.id]);
  await client.query("DELETE FROM trip_tips WHERE trip_id = $1", [trip.id]);
  await client.query("DELETE FROM trip_days WHERE trip_id = $1", [trip.id]);
  await client.query("DELETE FROM trip_budgets WHERE trip_id = $1", [trip.id]);

  for (const [position, name] of trip.members.entries()) {
    await client.query(
      "INSERT INTO trip_members (trip_id, position, name) VALUES ($1, $2, $3)",
      [trip.id, position, name],
    );
  }
  for (const [position, body] of (trip.tips || []).entries()) {
    await client.query(
      "INSERT INTO trip_tips (trip_id, position, body) VALUES ($1, $2, $3)",
      [trip.id, position, body],
    );
  }
  for (const [dayPosition, day] of trip.days.entries()) {
    const recordId = dayId(trip.id, day, dayPosition);
    await client.query(
      `
        INSERT INTO trip_days (id, trip_id, position, day_number, date, title)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [recordId, trip.id, dayPosition, day.day, day.date, day.title],
    );
    for (const [itemPosition, item] of day.items.entries()) {
      await client.query(
        `
          INSERT INTO itinerary_items (
            id, day_id, trip_id, position, time_label, title, description,
            location_label, category, latitude, longitude
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          item.id,
          recordId,
          trip.id,
          itemPosition,
          item.time || null,
          item.title,
          item.description || null,
          item.location || null,
          item.category || null,
          item.lat ?? null,
          item.lng ?? null,
        ],
      );
    }
  }
  if (trip.budget) await insertBudget(client, trip.id, trip.budget);
}

async function insertBudget(
  client: PoolClient,
  tripId: string,
  budget: TripBudget,
): Promise<void> {
  await client.query(
    `INSERT INTO trip_budgets (trip_id, currency, limit_amount) VALUES ($1, $2, $3)`,
    [tripId, budget.currency, budget.limit ?? null],
  );
  for (const [position, item] of budget.items.entries()) {
    await insertBudgetItem(client, tripId, item, position);
  }
}

async function insertBudgetItem(
  client: PoolClient,
  tripId: string,
  item: BudgetItem,
  position: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO budget_items (
        id, trip_id, position, label, amount, category, paid_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      item.id,
      tripId,
      position,
      item.label,
      item.amount,
      item.category || null,
      item.paidBy || null,
    ],
  );
}

async function upsertTrip(
  client: PoolClient,
  trip: Trip,
  position: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO trips (
        id, position, title, subtitle, destination, start_date, end_date,
        status, cover_gradient, cover_emoji, cover_image, showcase, location,
        summary
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12::jsonb, $13::jsonb, $14
      )
      ON CONFLICT (id) DO UPDATE SET
        position = EXCLUDED.position,
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        destination = EXCLUDED.destination,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        status = EXCLUDED.status,
        cover_gradient = EXCLUDED.cover_gradient,
        cover_emoji = EXCLUDED.cover_emoji,
        cover_image = EXCLUDED.cover_image,
        showcase = EXCLUDED.showcase,
        location = EXCLUDED.location,
        summary = EXCLUDED.summary,
        version = trips.version + 1,
        updated_at = now()
    `,
    [
      trip.id,
      position,
      trip.title,
      trip.subtitle,
      trip.destination,
      trip.startDate,
      trip.endDate,
      trip.status === "planned" ? "planned" : "lived",
      trip.coverGradient,
      trip.coverEmoji,
      trip.coverImage || null,
      jsonValue(trip.showcase),
      jsonValue(trip.location),
      trip.summary,
    ],
  );
  await replaceTripChildren(client, trip);
}

async function upsertMedia(
  client: PoolClient,
  tripId: string,
  photo: PhotoMeta,
): Promise<void> {
  const kind = legacyMediaKind(photo);
  const uploadedAt = timestamp(photo.uploadedAt, `${tripId}/${photo.id}.uploadedAt`);
  const featuredAt = photo.featured
    ? timestamp(photo.featuredAt || photo.uploadedAt, `${tripId}/${photo.id}.featuredAt`)
    : null;

  await client.query(
    `
      INSERT INTO media (
        id, trip_id, kind, state, uploader, caption, original_name,
        source_mime_type, source_bytes, uploaded_at, taken_at, device,
        aperture, shutter, iso, focal_length, focal_length_35, lens,
        featured, featured_at
      )
      VALUES (
        $1, $2, $3, 'ready', $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19
      )
      ON CONFLICT (id) DO UPDATE SET
        trip_id = EXCLUDED.trip_id,
        kind = EXCLUDED.kind,
        state = 'ready',
        uploader = EXCLUDED.uploader,
        caption = EXCLUDED.caption,
        original_name = EXCLUDED.original_name,
        source_mime_type = EXCLUDED.source_mime_type,
        source_bytes = EXCLUDED.source_bytes,
        uploaded_at = EXCLUDED.uploaded_at,
        taken_at = EXCLUDED.taken_at,
        device = EXCLUDED.device,
        aperture = EXCLUDED.aperture,
        shutter = EXCLUDED.shutter,
        iso = EXCLUDED.iso,
        focal_length = EXCLUDED.focal_length,
        focal_length_35 = EXCLUDED.focal_length_35,
        lens = EXCLUDED.lens,
        featured = EXCLUDED.featured,
        featured_at = EXCLUDED.featured_at,
        failure_code = NULL,
        failure_message = NULL,
        deleted_at = NULL,
        version = media.version + 1,
        updated_at = now()
    `,
    [
      photo.id,
      tripId,
      kind,
      photo.uploader,
      photo.caption || null,
      photo.originalName,
      photo.mimeType,
      photo.size,
      uploadedAt,
      photo.takenAt || null,
      photo.device || null,
      photo.aperture ?? null,
      photo.shutter || null,
      photo.iso ?? null,
      photo.focalLength ?? null,
      photo.focalLength35 ?? null,
      photo.lens || null,
      photo.featured === true,
      featuredAt,
    ],
  );

  await client.query(
    `
      DELETE FROM media_assets
      WHERE media_id = $1
        AND role IN ('legacy_display', 'legacy_playback', 'legacy_live')
    `,
    [photo.id],
  );
  await client.query(
    `
      INSERT INTO media_assets (
        media_id, role, storage_provider, storage_key, mime_type, byte_size,
        is_public
      )
      VALUES ($1, $2, 'legacy', $3, $4, $5, true)
    `,
    [
      photo.id,
      kind === "video" ? "legacy_playback" : "legacy_display",
      `${tripId}/${photo.filename}`,
      photo.mimeType,
      photo.size,
    ],
  );
  if (photo.liveVideoFilename) {
    await client.query(
      `
        INSERT INTO media_assets (
          media_id, role, storage_provider, storage_key, mime_type, byte_size,
          is_public
        )
        VALUES ($1, 'legacy_live', 'legacy', $2, $3, $4, true)
      `,
      [
        photo.id,
        `${tripId}/${photo.liveVideoFilename}`,
        photo.liveVideoMimeType || "video/quicktime",
        photo.liveVideoSize || 0,
      ],
    );
  }
}

async function upsertComment(
  client: PoolClient,
  sourceTripId: string,
  comment: Comment,
): Promise<void> {
  await client.query(
    `
      INSERT INTO comments (id, trip_id, media_id, author, body, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        trip_id = EXCLUDED.trip_id,
        media_id = EXCLUDED.media_id,
        author = EXCLUDED.author,
        body = EXCLUDED.body,
        created_at = EXCLUDED.created_at
    `,
    [
      comment.id,
      sourceTripId,
      comment.photoId || null,
      comment.author,
      comment.body,
      timestamp(comment.createdAt, `${sourceTripId}/${comment.id}.createdAt`),
    ],
  );
}

async function markFailedImport(
  fingerprint: string,
  report: LegacyImportReport,
  error: unknown,
): Promise<void> {
  const failure = error instanceof Error ? error.message : "Unknown import failure";
  const failedReport = { ...report, failure };
  await query(
    `
      INSERT INTO legacy_import_runs (
        id, source_fingerprint, completed_at, status, report
      )
      VALUES ($1, $2, now(), 'failed', $3::jsonb)
      ON CONFLICT (source_fingerprint) DO UPDATE SET
        completed_at = now(),
        status = 'failed',
        report = EXCLUDED.report
      WHERE legacy_import_runs.status <> 'completed'
    `,
    [randomUUID(), fingerprint, JSON.stringify(failedReport)],
  );
}

export async function commitLegacyImport(
  plan: LegacyImportPlan,
): Promise<LegacyCommitResult> {
  if (plan.report.errors.length > 0) {
    throw new Error(
      `Legacy import refused: ${plan.report.errors.length} validation error(s)`,
    );
  }
  await migrateDatabase();
  const runId = randomUUID();

  try {
    return await withTransaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('trip:legacy-import:v1'))",
      );
      const existing = await client.query<{ id: string; status: string }>(
        `
          SELECT id, status
          FROM legacy_import_runs
          WHERE source_fingerprint = $1
          FOR UPDATE
        `,
        [plan.report.sourceFingerprint],
      );
      if (existing.rows[0]?.status === "completed") {
        return { runId: existing.rows[0].id, skipped: true };
      }

      await client.query(
        `
          INSERT INTO legacy_import_runs (
            id, source_fingerprint, status, report
          )
          VALUES ($1, $2, 'running', $3::jsonb)
          ON CONFLICT (source_fingerprint) DO UPDATE SET
            id = EXCLUDED.id,
            started_at = now(),
            completed_at = NULL,
            status = 'running',
            report = EXCLUDED.report
        `,
        [runId, plan.report.sourceFingerprint, JSON.stringify(plan.report)],
      );

      await client.query("SET CONSTRAINTS trips_position_unique DEFERRED");
      for (const [position, trip] of plan.trips.entries()) {
        await upsertTrip(client, trip, position);
      }
      for (const source of plan.media) {
        for (const photo of source.photos) {
          await upsertMedia(client, source.tripId, photo);
        }
      }
      for (const source of plan.comments) {
        for (const comment of source.comments) {
          await upsertComment(client, source.tripId, comment);
        }
      }

      await client.query(
        `
          UPDATE legacy_import_runs
          SET completed_at = now(), status = 'completed', report = $2::jsonb
          WHERE id = $1
        `,
        [runId, JSON.stringify(plan.report)],
      );
      return { runId, skipped: false };
    }, { isolationLevel: "serializable" });
  } catch (error) {
    await markFailedImport(plan.report.sourceFingerprint, plan.report, error).catch(
      (reportError) => {
        console.error("[legacy-import] could not record failed run", reportError);
      },
    );
    throw error;
  }
}

function parseMode(args: string[]): "dry-run" | "commit" {
  const known = new Set(["--dry-run", "--commit"]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  }
  if (args.includes("--dry-run") && args.includes("--commit")) {
    throw new Error("Choose either --dry-run or --commit, not both");
  }
  return args.includes("--commit") ? "commit" : "dry-run";
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const plan = await buildLegacyImportPlan();
  console.info(JSON.stringify({ mode, ...plan.report }, null, 2));
  if (plan.report.errors.length > 0) {
    throw new Error("Dry-run validation failed; no database changes were made");
  }
  if (mode === "dry-run") {
    console.info("[legacy-import] dry-run only; pass --commit to write PostgreSQL");
    return;
  }
  const result = await commitLegacyImport(plan);
  console.info(
    result.skipped
      ? `[legacy-import] source already imported as run ${result.runId}`
      : `[legacy-import] committed run ${result.runId}`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main()
    .catch((error) => {
      console.error("[legacy-import] failed", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabase();
    });
}
