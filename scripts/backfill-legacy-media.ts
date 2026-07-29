/**
 * Promote legacy /uploads media into the production media model:
 *   1. Copy legacy files into private originals (local storage keys)
 *   2. Enqueue derivative jobs for the media-worker
 *
 * Gallery stays available: items remain `ready` while regenerating; once
 * thumb/preview/playback exist, the API prefers them over legacy_*.
 *
 * Usage:
 *   pnpm media:backfill              # promote + enqueue all needing work
 *   pnpm media:backfill -- --dry-run
 *   pnpm media:backfill -- --limit=50
 *   pnpm media:backfill -- --trip=beijing
 *   pnpm media:backfill -- --kinds=image,live_photo
 */
import path from "path";
import { pathToFileURL } from "url";
import { closeDatabase, query } from "../src/lib/db";
import { enqueueMediaJob } from "../src/lib/media/jobs";
import {
  localMediaStorage,
  mediaAssetKey,
} from "../src/lib/media/storage";
import type { MediaJobType, MediaKind } from "../src/lib/media/types";

type NeedRow = {
  id: string;
  trip_id: string;
  kind: MediaKind;
  version: number;
  original_name: string;
  source_mime_type: string;
  has_original: boolean;
  has_live_original: boolean;
  has_grid: boolean;
  has_playback: boolean;
  has_live_playback: boolean;
  legacy_display_key: string | null;
  legacy_playback_key: string | null;
  legacy_live_key: string | null;
  legacy_display_mime: string | null;
  legacy_playback_mime: string | null;
  legacy_live_mime: string | null;
};

type Options = {
  dryRun: boolean;
  limit: number | null;
  tripId: string | null;
  kinds: MediaKind[] | null;
};

function parseArgs(argv: string[]): Options {
  let dryRun = false;
  let limit: number | null = null;
  let tripId: string | null = null;
  let kinds: MediaKind[] | null = null;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error("--limit must be a positive integer");
      }
    } else if (arg.startsWith("--trip=")) {
      tripId = arg.slice("--trip=".length).trim() || null;
    } else if (arg.startsWith("--kinds=")) {
      const list = arg
        .slice("--kinds=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean) as MediaKind[];
      kinds = list;
    } else if (arg === "--") {
      continue;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { dryRun, limit, tripId, kinds };
}

function jobTypeFor(kind: MediaKind): MediaJobType {
  if (kind === "video") return "process_video";
  if (kind === "live_photo") return "process_live_photo";
  return "process_image";
}

function priorityFor(kind: MediaKind): number {
  // Prefer stills first so the gallery lightens quickly.
  if (kind === "image") return 20;
  if (kind === "live_photo") return 10;
  return 0;
}

function needsWork(row: NeedRow): boolean {
  if (row.kind === "video") return !row.has_playback;
  if (row.kind === "live_photo") {
    // List uses grid-1080; thumb-720 is no longer generated.
    return !row.has_grid || !row.has_live_playback;
  }
  return !row.has_grid;
}

function extensionFrom(key: string, mime: string | null, fallback: string): string {
  const fromKey = path.extname(key).toLowerCase();
  if (fromKey) return fromKey;
  if (mime?.includes("png")) return ".png";
  if (mime?.includes("webp")) return ".webp";
  if (mime?.includes("quicktime") || mime?.includes("mp4")) return ".mov";
  return fallback;
}

async function listCandidates(options: Options): Promise<NeedRow[]> {
  const params: unknown[] = [];
  const filters: string[] = ["m.state <> 'deleted'"];
  if (options.tripId) {
    params.push(options.tripId);
    filters.push(`m.trip_id = $${params.length}`);
  }
  if (options.kinds?.length) {
    params.push(options.kinds);
    filters.push(`m.kind = ANY($${params.length}::media_kind[])`);
  }
  const limitSql = options.limit
    ? `LIMIT ${Math.floor(options.limit)}`
    : "";

  const result = await query<NeedRow>(
    `
    SELECT
      m.id,
      m.trip_id,
      m.kind,
      m.version,
      m.original_name,
      m.source_mime_type,
      EXISTS (
        SELECT 1 FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'original'
      ) AS has_original,
      EXISTS (
        SELECT 1 FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'live_original'
      ) AS has_live_original,
      EXISTS (
        SELECT 1 FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'grid'
      ) AS has_grid,
      EXISTS (
        SELECT 1 FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'playback'
      ) AS has_playback,
      EXISTS (
        SELECT 1 FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'live_playback'
      ) AS has_live_playback,
      (
        SELECT a.storage_key FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'legacy_display'
        LIMIT 1
      ) AS legacy_display_key,
      (
        SELECT a.storage_key FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'legacy_playback'
        LIMIT 1
      ) AS legacy_playback_key,
      (
        SELECT a.storage_key FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'legacy_live'
        LIMIT 1
      ) AS legacy_live_key,
      (
        SELECT a.mime_type FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'legacy_display'
        LIMIT 1
      ) AS legacy_display_mime,
      (
        SELECT a.mime_type FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'legacy_playback'
        LIMIT 1
      ) AS legacy_playback_mime,
      (
        SELECT a.mime_type FROM media_assets a
        WHERE a.media_id = m.id AND a.role = 'legacy_live'
        LIMIT 1
      ) AS legacy_live_mime
    FROM media m
    WHERE ${filters.join(" AND ")}
    ORDER BY
      CASE m.kind
        WHEN 'image' THEN 0
        WHEN 'live_photo' THEN 1
        ELSE 2
      END,
      m.uploaded_at DESC,
      m.id
    ${limitSql}
    `,
    params,
  );
  return result.rows.filter(needsWork);
}

async function upsertOriginalAsset(input: {
  mediaId: string;
  role: "original" | "live_original";
  storageKey: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}): Promise<void> {
  await query(
    `INSERT INTO media_assets (
       media_id, role, storage_provider, storage_key, mime_type,
       byte_size, sha256, is_public
     ) VALUES ($1, $2, 'local', $3, $4, $5, $6, false)
     ON CONFLICT (media_id, role) DO UPDATE SET
       storage_provider = EXCLUDED.storage_provider,
       storage_key = EXCLUDED.storage_key,
       mime_type = EXCLUDED.mime_type,
       byte_size = EXCLUDED.byte_size,
       sha256 = EXCLUDED.sha256,
       is_public = false,
       created_at = now()`,
    [
      input.mediaId,
      input.role,
      input.storageKey,
      input.mimeType,
      input.byteSize,
      input.sha256,
    ],
  );
}

async function promoteRow(row: NeedRow): Promise<void> {
  await localMediaStorage.ensureRoots();

  if (!row.has_original) {
    const legacyKey =
      row.kind === "video" ? row.legacy_playback_key : row.legacy_display_key;
    const legacyMime =
      row.kind === "video" ? row.legacy_playback_mime : row.legacy_display_mime;
    if (!legacyKey) {
      throw new Error(`Media ${row.id} has no legacy still/video source`);
    }
    const sourcePath = localMediaStorage.absolutePathForAsset({
      storageProvider: "legacy",
      storageKey: legacyKey,
      isPublic: true,
      role: row.kind === "video" ? "legacy_playback" : "legacy_display",
    });
    const ext = extensionFrom(
      legacyKey,
      legacyMime || row.source_mime_type,
      row.kind === "video" ? ".mp4" : ".jpg",
    );
    const privateKey = mediaAssetKey(
      row.trip_id,
      row.id,
      row.version,
      `original${ext}`,
    );
    const written = await localMediaStorage.copyIntoPrivate(sourcePath, privateKey);
    await upsertOriginalAsset({
      mediaId: row.id,
      role: "original",
      storageKey: privateKey,
      mimeType: legacyMime || row.source_mime_type || "application/octet-stream",
      byteSize: written.byteSize,
      sha256: written.sha256,
    });
  }

  if (row.kind === "live_photo" && !row.has_live_original) {
    if (!row.legacy_live_key) {
      throw new Error(`Live Photo ${row.id} is missing legacy_live asset`);
    }
    const sourcePath = localMediaStorage.absolutePathForAsset({
      storageProvider: "legacy",
      storageKey: row.legacy_live_key,
      isPublic: true,
      role: "legacy_live",
    });
    const ext = extensionFrom(
      row.legacy_live_key,
      row.legacy_live_mime,
      ".mov",
    );
    const privateKey = mediaAssetKey(
      row.trip_id,
      row.id,
      row.version,
      `live-original${ext}`,
    );
    const written = await localMediaStorage.copyIntoPrivate(sourcePath, privateKey);
    await upsertOriginalAsset({
      mediaId: row.id,
      role: "live_original",
      storageKey: privateKey,
      mimeType: row.legacy_live_mime || "video/quicktime",
      byteSize: written.byteSize,
      sha256: written.sha256,
    });
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required");
  }

  const candidates = await listCandidates(options);
  const summary = {
    mode: options.dryRun ? "dry-run" : "commit",
    candidates: candidates.length,
    byKind: {
      image: candidates.filter((row) => row.kind === "image").length,
      live_photo: candidates.filter((row) => row.kind === "live_photo").length,
      video: candidates.filter((row) => row.kind === "video").length,
    },
    promoted: 0,
    enqueued: 0,
    errors: [] as string[],
  };

  console.info(
    JSON.stringify(
      {
        mode: summary.mode,
        candidates: summary.candidates,
        byKind: summary.byKind,
        tripFilter: options.tripId,
        kindsFilter: options.kinds,
      },
      null,
      2,
    ),
  );

  if (options.dryRun) {
    console.info("[backfill] dry-run only; pass without --dry-run to promote + enqueue");
    return;
  }

  for (const [index, row] of candidates.entries()) {
    try {
      await promoteRow(row);
      summary.promoted += 1;
      await enqueueMediaJob({
        mediaId: row.id,
        jobType: jobTypeFor(row.kind),
        priority: priorityFor(row.kind),
        payload: { source: "legacy-backfill" },
        maxAttempts: 3,
      });
      summary.enqueued += 1;
      if ((index + 1) % 25 === 0 || index + 1 === candidates.length) {
        console.info(
          `[backfill] progress ${index + 1}/${candidates.length} promoted=${summary.promoted} enqueued=${summary.enqueued}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${row.trip_id}/${row.id}: ${message}`);
      console.error(`[backfill] failed ${row.id}`, message);
    }
  }

  console.info(JSON.stringify(summary, null, 2));
  if (summary.errors.length) {
    process.exitCode = 1;
  } else {
    console.info(
      "[backfill] done — keep `pnpm worker:media` running until queue_snapshot pending=0",
    );
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main()
    .catch((error) => {
      console.error("[backfill] crashed", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabase().catch(() => undefined);
    });
}
