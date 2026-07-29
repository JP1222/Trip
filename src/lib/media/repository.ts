import type { PhotoMeta } from "@/lib/types";
import { query, withTransaction, type DbExecutor } from "@/lib/db";
import {
  filenameForTripStorageKey,
} from "./storage";
import type {
  MediaAsset,
  MediaAssetRole,
  MediaKind,
  MediaRecord,
  MediaWithAssets,
  ProcessedMediaPatch,
  QueuedMediaInput,
} from "./types";

type MediaRow = {
  id: string;
  trip_id: string;
  kind: MediaKind;
  state: MediaRecord["state"];
  uploader: string;
  caption: string | null;
  original_name: string;
  source_mime_type: string;
  source_bytes: string | number;
  uploaded_at: Date | string;
  taken_at: string | null;
  device: string | null;
  aperture: number | null;
  shutter: string | null;
  iso: number | null;
  focal_length: number | null;
  focal_length_35: number | null;
  lens: string | null;
  featured: boolean;
  featured_at: Date | string | null;
  version: number;
  failure_code: string | null;
  failure_message: string | null;
  deleted_at: Date | string | null;
  assets: Record<string, AssetJson> | null;
};

type AssetJson = {
  id: number;
  role: MediaAssetRole;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  byteSize: string | number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sha256: string | null;
  isPublic: boolean;
  createdAt: string;
};

const MEDIA_SELECT = `
  SELECT
    m.id,
    m.trip_id,
    m.kind,
    m.state,
    m.uploader,
    m.caption,
    m.original_name,
    m.source_mime_type,
    m.source_bytes,
    m.uploaded_at,
    m.taken_at,
    m.device,
    m.aperture,
    m.shutter,
    m.iso,
    m.focal_length,
    m.focal_length_35,
    m.lens,
    m.featured,
    m.featured_at,
    m.version,
    m.failure_code,
    m.failure_message,
    m.deleted_at,
    COALESCE(
      jsonb_object_agg(
        a.role,
        jsonb_build_object(
          'id', a.id,
          'role', a.role,
          'storageProvider', a.storage_provider,
          'storageKey', a.storage_key,
          'mimeType', a.mime_type,
          'byteSize', a.byte_size,
          'width', a.width,
          'height', a.height,
          'durationMs', a.duration_ms,
          'sha256', a.sha256,
          'isPublic', a.is_public,
          'createdAt', a.created_at
        )
      ) FILTER (WHERE a.id IS NOT NULL),
      '{}'::jsonb
    ) AS assets
  FROM media m
  LEFT JOIN media_assets a ON a.media_id = m.id
`;

function iso(value: Date | string | null): string | undefined {
  if (value == null) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

function optionalNumber(value: number | null): number | undefined {
  return value == null ? undefined : Number(value);
}

function mapAsset(mediaId: string, asset: AssetJson): MediaAsset {
  return {
    id: asset.id,
    mediaId,
    role: asset.role,
    storageProvider: asset.storageProvider,
    storageKey: asset.storageKey,
    mimeType: asset.mimeType,
    byteSize: Number(asset.byteSize),
    width: optionalNumber(asset.width),
    height: optionalNumber(asset.height),
    durationMs: optionalNumber(asset.durationMs),
    sha256: asset.sha256 || undefined,
    isPublic: asset.isPublic,
    createdAt: asset.createdAt,
  };
}

function mapMediaRow(row: MediaRow): MediaWithAssets {
  const assets: MediaWithAssets["assets"] = {};
  for (const [role, asset] of Object.entries(row.assets || {})) {
    assets[role as MediaAssetRole] = mapAsset(row.id, asset);
  }
  return {
    id: row.id,
    tripId: row.trip_id,
    kind: row.kind,
    state: row.state,
    uploader: row.uploader,
    caption: row.caption || undefined,
    originalName: row.original_name,
    sourceMimeType: row.source_mime_type,
    sourceBytes: Number(row.source_bytes),
    uploadedAt: iso(row.uploaded_at) || new Date(0).toISOString(),
    takenAt: row.taken_at || undefined,
    device: row.device || undefined,
    aperture: optionalNumber(row.aperture),
    shutter: row.shutter || undefined,
    iso: optionalNumber(row.iso),
    focalLength: optionalNumber(row.focal_length),
    focalLength35: optionalNumber(row.focal_length_35),
    lens: row.lens || undefined,
    featured: row.featured,
    featuredAt: iso(row.featured_at),
    version: row.version,
    failureCode: row.failure_code || undefined,
    failureMessage: row.failure_message || undefined,
    deletedAt: iso(row.deleted_at),
    assets,
  };
}

function preferredAsset(media: MediaWithAssets): MediaAsset | undefined {
  if (media.kind === "video") {
    return media.assets.playback || media.assets.legacy_playback;
  }
  return (
    media.assets.preview ||
    media.assets.download ||
    media.assets.grid ||
    media.assets.thumb ||
    media.assets.legacy_display
  );
}

export function mediaToPhotoMeta(media: MediaWithAssets): PhotoMeta {
  const primary = preferredAsset(media);
  const live = media.assets.live_playback || media.assets.legacy_live;
  const publicFilename = (asset: MediaAsset | undefined, fallback: string) => {
    if (!asset) return fallback;
    return asset.role.startsWith("legacy_")
      ? filenameForTripStorageKey(media.tripId, asset.storageKey)
      : `/media/${asset.storageKey}`;
  };
  const filename = publicFilename(
    primary,
    `/media/trips/${media.tripId}/${media.id}/v${media.version}/preview.webp`,
  );
  const result: PhotoMeta & {
    thumbnailFilename?: string;
    previewFilename?: string;
    posterFilename?: string;
  } = {
    id: media.id,
    tripId: media.tripId,
    filename,
    originalName: media.originalName,
    uploader: media.uploader,
    caption: media.caption,
    device: media.device,
    aperture: media.aperture,
    shutter: media.shutter,
    iso: media.iso,
    focalLength: media.focalLength,
    focalLength35: media.focalLength35,
    lens: media.lens,
    takenAt: media.takenAt,
    mimeType:
      primary?.mimeType ||
      (media.kind === "video" ? "video/mp4" : "image/webp"),
    size: primary?.byteSize || 0,
    uploadedAt: media.uploadedAt,
    featured: media.featured,
    featuredAt: media.featuredAt,
  };
  const thumbnail = media.assets.thumb || media.assets.grid;
  const preview = media.assets.preview || media.assets.download;
  if (thumbnail) result.thumbnailFilename = publicFilename(thumbnail, filename);
  if (preview) result.previewFilename = publicFilename(preview, filename);
  if (media.assets.poster) {
    result.posterFilename = publicFilename(media.assets.poster, filename);
  }
  if (media.kind === "live_photo" && live) {
    result.liveVideoFilename = publicFilename(live, live.storageKey);
    result.liveVideoOriginalName = media.assets.live_original
      ? media.originalName.replace(/\.[^.]+$/, ".mov")
      : undefined;
    result.liveVideoSize = live.byteSize;
    result.liveVideoMimeType = live.mimeType;
  }
  return result;
}

async function selectMedia(
  db: DbExecutor,
  whereSql: string,
  params: readonly unknown[],
): Promise<MediaWithAssets[]> {
  const result = await db.query<MediaRow>(
    `${MEDIA_SELECT} WHERE ${whereSql} GROUP BY m.id`,
    [...params],
  );
  return result.rows.map(mapMediaRow);
}

async function selectMediaFromPool(
  whereSql: string,
  params: readonly unknown[],
): Promise<MediaWithAssets[]> {
  const result = await query<MediaRow>(
    `${MEDIA_SELECT} WHERE ${whereSql} GROUP BY m.id`,
    params,
  );
  return result.rows.map(mapMediaRow);
}

export async function listMediaForTrip(
  tripId: string,
  options: { includePending?: boolean } = {},
): Promise<MediaWithAssets[]> {
  const stateSql = options.includePending
    ? "m.state IN ('ready', 'pending', 'processing')"
    : "m.state = 'ready'";
  const result = await query<MediaRow>(
    `${MEDIA_SELECT}
     WHERE m.trip_id = $1 AND ${stateSql}
     GROUP BY m.id
     ORDER BY m.featured DESC, m.featured_at DESC NULLS LAST,
              m.uploaded_at DESC, m.id DESC`,
    [tripId],
  );
  return result.rows.map(mapMediaRow);
}

export async function listPhotoMetaForTrip(
  tripId: string,
  options: { includePending?: boolean } = {},
): Promise<PhotoMeta[]> {
  return (await listMediaForTrip(tripId, options)).map(mediaToPhotoMeta);
}

type MediaCursor = {
  version: 1;
  featured: boolean;
  featuredAt: string | null;
  uploadedAt: string;
  id: string;
};

function encodeCursor(media: MediaWithAssets): string {
  const cursor: MediaCursor = {
    version: 1,
    featured: media.featured,
    featuredAt: media.featuredAt || null,
    uploadedAt: media.uploadedAt,
    id: media.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): MediaCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<MediaCursor>;
    if (
      parsed.version !== 1 ||
      typeof parsed.featured !== "boolean" ||
      (parsed.featuredAt !== null && typeof parsed.featuredAt !== "string") ||
      typeof parsed.uploadedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.uploadedAt)) ||
      (parsed.featuredAt != null && !Number.isFinite(Date.parse(parsed.featuredAt))) ||
      typeof parsed.id !== "string" ||
      !parsed.id ||
      parsed.id.length > 100
    ) {
      throw new Error("invalid fields");
    }
    return parsed as MediaCursor;
  } catch {
    throw new Error("Invalid media cursor");
  }
}

export async function getPhotoMetaPage(
  tripId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ items: PhotoMeta[]; nextCursor: string | null; total: number }> {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit || 48)));
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;
  const params: unknown[] = [tripId];
  let cursorWhere = "";
  if (cursor) {
    params.push(
      cursor.featured ? 1 : 0,
      cursor.featuredAt,
      cursor.uploadedAt,
      cursor.id,
    );
    cursorWhere = `
      AND (
        m.featured::integer,
        COALESCE(m.featured_at, '-infinity'::timestamptz),
        m.uploaded_at,
        m.id
      ) < (
        $2::integer,
        COALESCE($3::timestamptz, '-infinity'::timestamptz),
        $4::timestamptz,
        $5::text
      )`;
  }
  params.push(limit + 1);
  const limitParam = params.length;
  const [pageResult, totalResult] = await Promise.all([
    query<MediaRow>(
      `${MEDIA_SELECT}
       WHERE m.trip_id = $1 AND m.state = 'ready' ${cursorWhere}
       GROUP BY m.id
       ORDER BY m.featured DESC,
                COALESCE(m.featured_at, '-infinity'::timestamptz) DESC,
                m.uploaded_at DESC, m.id DESC
       LIMIT $${limitParam}`,
      params,
    ),
    query<{ total: string | number }>(
      `SELECT count(*) AS total
       FROM media
       WHERE trip_id = $1 AND state = 'ready'`,
      [tripId],
    ),
  ]);
  const mapped = pageResult.rows.map(mapMediaRow);
  const hasMore = mapped.length > limit;
  const page = hasMore ? mapped.slice(0, limit) : mapped;
  return {
    items: page.map(mediaToPhotoMeta),
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
    total: Number(totalResult.rows[0]?.total || 0),
  };
}

export async function getMediaById(
  mediaId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<MediaWithAssets | null> {
  const where = options.includeDeleted
    ? "m.id = $1"
    : "m.id = $1 AND m.state <> 'deleted'";
  const rows = await selectMediaFromPool(where, [mediaId]);
  return rows[0] || null;
}

export async function getTripMediaById(
  tripId: string,
  mediaId: string,
  options: { includeNonReady?: boolean } = {},
): Promise<MediaWithAssets | null> {
  const state = options.includeNonReady
    ? "m.state <> 'deleted'"
    : "m.state = 'ready'";
  const rows = await selectMediaFromPool(
    `m.trip_id = $1 AND m.id = $2 AND ${state}`,
    [tripId, mediaId],
  );
  return rows[0] || null;
}

export async function createQueuedMedia(
  input: QueuedMediaInput,
): Promise<MediaWithAssets> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO media (
         id, trip_id, kind, state, uploader, caption, original_name,
         source_mime_type, source_bytes, uploaded_at, featured, featured_at
       ) VALUES (
         $1, $2, $3, 'pending', $4, $5, $6, $7, $8,
         COALESCE($9::timestamptz, now()), $10,
         CASE WHEN $10 THEN COALESCE($9::timestamptz, now()) ELSE NULL END
       )`,
      [
        input.id,
        input.tripId,
        input.kind,
        input.uploader,
        input.caption || null,
        input.originalName,
        input.sourceMimeType,
        input.sourceBytes,
        input.uploadedAt || null,
        input.featured === true,
      ],
    );
    for (const asset of input.assets) {
      await client.query(
        `INSERT INTO media_assets (
           media_id, role, storage_provider, storage_key, mime_type,
           byte_size, sha256, is_public
         ) VALUES ($1, $2, 'local', $3, $4, $5, $6, $7)`,
        [
          input.id,
          asset.role,
          asset.storageKey,
          asset.mimeType,
          asset.byteSize,
          asset.sha256 || null,
          asset.isPublic,
        ],
      );
    }
    await client.query(
      `INSERT INTO media_jobs (media_id, job_type, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (media_id, job_type) DO NOTHING`,
      [input.id, input.jobType, JSON.stringify(input.jobPayload || {})],
    );
  });
  const created = await getMediaById(input.id);
  if (!created) throw new Error("Queued media could not be read back");
  return created;
}

export async function markMediaProcessing(mediaId: string): Promise<void> {
  // Keep already-published (ready) rows visible while regenerating derivatives.
  await query(
    `UPDATE media
     SET state = CASE
           WHEN state = 'ready' THEN 'ready'::media_state
           ELSE 'processing'::media_state
         END,
         failure_code = NULL,
         failure_message = NULL,
         updated_at = now()
     WHERE id = $1 AND state IN ('pending', 'processing', 'failed', 'ready')`,
    [mediaId],
  );
}

async function upsertAsset(db: DbExecutor, asset: MediaAsset): Promise<void> {
  await db.query(
    `INSERT INTO media_assets (
       media_id, role, storage_provider, storage_key, mime_type, byte_size,
       width, height, duration_ms, sha256, is_public
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (media_id, role) DO UPDATE SET
       storage_provider = EXCLUDED.storage_provider,
       storage_key = EXCLUDED.storage_key,
       mime_type = EXCLUDED.mime_type,
       byte_size = EXCLUDED.byte_size,
       width = EXCLUDED.width,
       height = EXCLUDED.height,
       duration_ms = EXCLUDED.duration_ms,
       sha256 = EXCLUDED.sha256,
       is_public = EXCLUDED.is_public,
       created_at = now()`,
    [
      asset.mediaId,
      asset.role,
      asset.storageProvider,
      asset.storageKey,
      asset.mimeType,
      asset.byteSize,
      asset.width ?? null,
      asset.height ?? null,
      asset.durationMs ?? null,
      asset.sha256 || null,
      asset.isPublic,
    ],
  );
}

export async function publishProcessedMedia(
  mediaId: string,
  assets: MediaAsset[],
  patch: ProcessedMediaPatch = {},
): Promise<void> {
  await withTransaction(async (client) => {
    for (const asset of assets) await upsertAsset(client, asset);
    await client.query(
      `UPDATE media SET
         state = 'ready',
         taken_at = COALESCE($2, taken_at),
         device = COALESCE($3, device),
         aperture = COALESCE($4, aperture),
         shutter = COALESCE($5, shutter),
         iso = COALESCE($6, iso),
         focal_length = COALESCE($7, focal_length),
         focal_length_35 = COALESCE($8, focal_length_35),
         lens = COALESCE($9, lens),
         failure_code = NULL,
         failure_message = NULL,
         updated_at = now()
       WHERE id = $1 AND state <> 'deleted'`,
      [
        mediaId,
        patch.takenAt || null,
        patch.device || null,
        patch.aperture ?? null,
        patch.shutter || null,
        patch.iso ?? null,
        patch.focalLength ?? null,
        patch.focalLength35 ?? null,
        patch.lens || null,
      ],
    );
  });
}

export async function markMediaRetry(mediaId: string, message: string): Promise<void> {
  await query(
    `UPDATE media
     SET state = 'pending', failure_code = 'processing_retry',
         failure_message = left($2, 2000), updated_at = now()
     WHERE id = $1 AND state <> 'deleted'`,
    [mediaId, message],
  );
}

export async function markMediaFailed(
  mediaId: string,
  code: string,
  message: string,
): Promise<void> {
  // Ready items (legacy backfill) stay ready so the gallery keeps working.
  await query(
    `UPDATE media
     SET state = CASE
           WHEN state = 'ready' THEN 'ready'::media_state
           ELSE 'failed'::media_state
         END,
         failure_code = left($2, 200),
         failure_message = left($3, 2000),
         updated_at = now()
     WHERE id = $1 AND state <> 'deleted'`,
    [mediaId, code, message],
  );
}

export async function updateMediaMetadata(
  tripId: string,
  mediaId: string,
  patch: { caption?: string; featured?: boolean },
): Promise<PhotoMeta | null> {
  const result = await query<{ id: string }>(
    `UPDATE media SET
       caption = CASE WHEN $3::boolean THEN NULLIF(btrim($4), '') ELSE caption END,
       featured = COALESCE($5, featured),
       featured_at = CASE
         WHEN $5 IS TRUE AND featured IS FALSE THEN now()
         WHEN $5 IS TRUE THEN COALESCE(featured_at, now())
         WHEN $5 IS FALSE THEN NULL
         ELSE featured_at
       END,
       version = version + 1,
       updated_at = now()
     WHERE trip_id = $1 AND id = $2 AND state <> 'deleted'
     RETURNING id`,
    [
      tripId,
      mediaId,
      Object.prototype.hasOwnProperty.call(patch, "caption"),
      patch.caption || "",
      typeof patch.featured === "boolean" ? patch.featured : null,
    ],
  );
  if (!result.rowCount) return null;
  const media = await getTripMediaById(tripId, mediaId, { includeNonReady: true });
  return media ? mediaToPhotoMeta(media) : null;
}

export async function softDeleteMedia(
  tripId: string,
  mediaIds: string[],
): Promise<MediaWithAssets[]> {
  if (!mediaIds.length) return [];
  return withTransaction(async (client) => {
    const existing = await selectMedia(
      client,
      "m.trip_id = $1 AND m.id = ANY($2::text[]) AND m.state <> 'deleted'",
      [tripId, mediaIds],
    );
    if (!existing.length) return [];
    const ids = existing.map((item) => item.id);
    await client.query(
      `UPDATE media SET
         state = 'deleted', deleted_at = now(), featured = false,
         featured_at = NULL, updated_at = now()
       WHERE trip_id = $1 AND id = ANY($2::text[])`,
      [tripId, ids],
    );
    await client.query(
      `UPDATE media_jobs SET
         state = 'cancelled', finished_at = now(), leased_until = NULL,
         worker_id = NULL, updated_at = now()
       WHERE media_id = ANY($1::text[])
         AND job_type <> 'purge_media'
         AND state IN ('pending', 'processing')`,
      [ids],
    );
    await client.query(
      `INSERT INTO media_jobs (media_id, job_type, priority)
       SELECT unnest($1::text[]), 'purge_media', 10
       ON CONFLICT (media_id, job_type) DO UPDATE SET
         state = 'pending', available_at = now(), leased_until = NULL,
         worker_id = NULL, last_error = NULL, finished_at = NULL,
         updated_at = now()`,
      [ids],
    );
    return existing;
  });
}
