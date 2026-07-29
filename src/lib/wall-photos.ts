import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import convert from "heic-convert";
import sharp from "sharp";
import { getPool, withTransaction } from "./db";
import { localMediaStorage } from "./media/storage";
import type { WallPhotoOrientation } from "./wall";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 2400;
const JPEG_QUALITY = 88;

export type WallFrameStyle = "polaroid" | "borderless" | "thin_white";
export type WallDisplaySize = "sm" | "md" | "lg";
/** auto = use natural image orientation; otherwise force crop ratio */
export type WallAspect = "auto" | WallPhotoOrientation;

export const WALL_FRAME_STYLES: WallFrameStyle[] = [
  "polaroid",
  "borderless",
  "thin_white",
];
export const WALL_DISPLAY_SIZES: WallDisplaySize[] = ["sm", "md", "lg"];
export const WALL_ASPECTS: WallAspect[] = [
  "auto",
  "landscape",
  "portrait",
  "square",
];

export type WallPhoto = {
  id: string;
  position: number;
  /** Empty string = no caption text on the print */
  caption: string;
  /** Empty string = no second line */
  meta: string;
  orientation: WallPhotoOrientation | null;
  frameStyle: WallFrameStyle;
  displaySize: WallDisplaySize;
  aspect: WallAspect;
  /** Public URL path, e.g. /media/wall/{id}/v1/display.jpg */
  src: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
};

type WallPhotoRow = {
  id: string;
  position: number;
  caption: string;
  meta: string;
  orientation: string | null;
  frame_style: string;
  display_size: string;
  aspect: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  byte_size: string | number;
  width: number | null;
  height: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const WALL_PHOTO_SELECT = `
  id, position, caption, meta, orientation,
  frame_style, display_size, aspect, storage_key,
  original_name, mime_type, byte_size, width, height,
  created_at, updated_at
`;

function parseFrameStyle(value: string | null | undefined): WallFrameStyle {
  if (value === "borderless" || value === "thin_white" || value === "polaroid") {
    return value;
  }
  return "polaroid";
}

function parseDisplaySize(value: string | null | undefined): WallDisplaySize {
  if (value === "sm" || value === "md" || value === "lg") return value;
  return "md";
}

function parseAspect(value: string | null | undefined): WallAspect {
  if (
    value === "auto" ||
    value === "landscape" ||
    value === "portrait" ||
    value === "square"
  ) {
    return value;
  }
  return "auto";
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function publicSrc(storageKey: string): string {
  return `/media/${storageKey}`;
}

function mapRow(row: WallPhotoRow): WallPhoto {
  const orientation =
    row.orientation === "landscape" ||
    row.orientation === "portrait" ||
    row.orientation === "square"
      ? row.orientation
      : null;
  return {
    id: row.id,
    position: row.position,
    caption: row.caption ?? "",
    meta: row.meta ?? "",
    orientation,
    frameStyle: parseFrameStyle(row.frame_style),
    displaySize: parseDisplaySize(row.display_size),
    aspect: parseAspect(row.aspect),
    src: publicSrc(row.storage_key),
    storageKey: row.storage_key,
    originalName: row.original_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size) || 0,
    width: row.width,
    height: row.height,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Effective print orientation for layout (user aspect override wins). */
export function wallPhotoDisplayOrientation(
  photo: Pick<WallPhoto, "aspect" | "orientation">,
): WallPhotoOrientation {
  if (photo.aspect !== "auto") return photo.aspect;
  return photo.orientation || "landscape";
}

export function wallPhotoHasLabels(
  photo: Pick<WallPhoto, "caption" | "meta">,
): boolean {
  return Boolean(photo.caption?.trim() || photo.meta?.trim());
}

function orientationFromSize(
  width: number,
  height: number,
): WallPhotoOrientation {
  const ratio = width / height;
  if (ratio >= 1.12) return "landscape";
  if (ratio <= 0.9) return "portrait";
  return "square";
}

function isHeicName(name: string, mime: string): boolean {
  return (
    /image\/hei[cf]/i.test(mime) ||
    /\.hei[cf]$/i.test(name)
  );
}

async function decodeImageBuffer(
  input: Buffer,
  originalName: string,
  mimeType: string,
): Promise<Buffer> {
  if (!isHeicName(originalName, mimeType)) return input;
  const converted = await convert({
    buffer: input,
    format: "JPEG",
    quality: 0.95,
  });
  return Buffer.from(converted);
}

async function processWallImage(
  input: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  orientation: WallPhotoOrientation;
  ext: string;
}> {
  const decoded = await decodeImageBuffer(input, originalName, mimeType);
  const image = sharp(decoded, {
    failOn: "none",
    limitInputPixels: 100_000_000,
  }).rotate();

  const meta = await image.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 32 || height < 32) {
    throw new Error("Image is too small");
  }

  const buffer = await image
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColorspace("srgb")
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const out = await sharp(buffer).metadata();
  const outW = out.width || width;
  const outH = out.height || height;

  return {
    buffer,
    mimeType: "image/jpeg",
    width: outW,
    height: outH,
    orientation: orientationFromSize(outW, outH),
    ext: ".jpg",
  };
}

export async function listWallPhotos(): Promise<WallPhoto[]> {
  const { rows } = await getPool().query<WallPhotoRow>(
    `SELECT ${WALL_PHOTO_SELECT}
     FROM wall_photos
     ORDER BY position ASC, created_at ASC, id ASC`,
  );
  return rows.map(mapRow);
}

export async function getWallPhoto(id: string): Promise<WallPhoto | null> {
  const { rows } = await getPool().query<WallPhotoRow>(
    `SELECT ${WALL_PHOTO_SELECT}
     FROM wall_photos
     WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * First boot: if the board has no photos yet, pin the bundled “Our crew”
 * print so the wall still feels personal.
 */
export async function ensureDefaultWallPhotos(): Promise<WallPhoto[]> {
  const existing = await listWallPhotos();
  if (existing.length > 0) return existing;

  const legacyPath = path.join(process.cwd(), "public", "wall", "our-crew.jpg");
  try {
    await fs.access(legacyPath);
  } catch {
    return existing;
  }

  // Serialize concurrent first-load seeds so we only pin one default print.
  // Heavy image I/O happens outside the lock; we re-check before insert.
  const stillEmpty = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(872341)");
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM wall_photos`,
    );
    return Number(rows[0]?.n || 0) === 0;
  });

  if (!stillEmpty) return listWallPhotos();

  try {
    const buffer = await fs.readFile(legacyPath);
    // createWallPhoto re-checks max position in its own transaction.
    // A second concurrent seed may race after the advisory unlock; tolerate
    // the rare double-seed rather than holding a DB lock over Sharp work.
    const after = await listWallPhotos();
    if (after.length > 0) return after;

    const seeded = await createWallPhoto({
      buffer,
      originalName: "our-crew.jpg",
      mimeType: "image/jpeg",
      caption: "Our crew",
      meta: "Peng · Carlie · Joel · Michelle · Beau · Shreya",
    });
    return [seeded];
  } catch {
    return listWallPhotos();
  }
}

export type CreateWallPhotoInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  caption?: string;
  meta?: string;
};

export async function createWallPhoto(
  input: CreateWallPhotoInput,
): Promise<WallPhoto> {
  if (!input.buffer.length) throw new Error("Empty file");
  if (input.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 20MB or smaller");
  }

  const caption = (input.caption || "").trim().slice(0, 120);
  const meta = (input.meta || "").trim().slice(0, 200);
  const originalName =
    path.basename(input.originalName || "photo.jpg").slice(0, 240) ||
    "photo.jpg";

  const isImage =
    (input.mimeType || "").startsWith("image/") ||
    /\.(jpe?g|png|webp|hei[cf]|gif|avif)$/i.test(originalName);
  if (!isImage) throw new Error("Only image files can be pinned to the board");

  const processed = await processWallImage(
    input.buffer,
    originalName,
    input.mimeType || "application/octet-stream",
  );

  const id = randomUUID();
  const storageKey = `wall/${id}/v1/display${processed.ext}`;

  await localMediaStorage.ensureRoots();
  const target = await localMediaStorage.createAtomicTarget("public", storageKey);
  try {
    await fs.writeFile(target.tempPath, processed.buffer);
    await target.commit();
  } catch (err) {
    await target.abort();
    throw err;
  }

  try {
    const photo = await withTransaction(async (client) => {
      const { rows: posRows } = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM wall_photos`,
      );
      const position = Number(posRows[0]?.next ?? 0);

      const { rows } = await client.query<WallPhotoRow>(
        `INSERT INTO wall_photos (
           id, position, caption, meta, orientation,
           frame_style, display_size, aspect, storage_key,
           original_name, mime_type, byte_size, width, height
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11, $12, $13, $14
         )
         RETURNING ${WALL_PHOTO_SELECT}`,
        [
          id,
          position,
          caption,
          meta,
          processed.orientation,
          "polaroid",
          "md",
          "auto",
          storageKey,
          originalName,
          processed.mimeType,
          processed.buffer.length,
          processed.width,
          processed.height,
        ],
      );
      return mapRow(rows[0]);
    });
    return photo;
  } catch (err) {
    try {
      await fs.unlink(localMediaStorage.absolutePath("public", storageKey));
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

export type UpdateWallPhotoInput = {
  caption?: string;
  meta?: string;
  frameStyle?: WallFrameStyle;
  displaySize?: WallDisplaySize;
  aspect?: WallAspect;
};

export async function updateWallPhoto(
  id: string,
  input: UpdateWallPhotoInput,
): Promise<WallPhoto | null> {
  const current = await getWallPhoto(id);
  if (!current) return null;

  const caption =
    input.caption !== undefined
      ? input.caption.trim().slice(0, 120)
      : current.caption;
  const meta =
    input.meta !== undefined ? input.meta.trim().slice(0, 200) : current.meta;
  const frameStyle =
    input.frameStyle !== undefined
      ? parseFrameStyle(input.frameStyle)
      : current.frameStyle;
  const displaySize =
    input.displaySize !== undefined
      ? parseDisplaySize(input.displaySize)
      : current.displaySize;
  const aspect =
    input.aspect !== undefined ? parseAspect(input.aspect) : current.aspect;

  const { rows } = await getPool().query<WallPhotoRow>(
    `UPDATE wall_photos
     SET caption = $2,
         meta = $3,
         frame_style = $4,
         display_size = $5,
         aspect = $6,
         updated_at = now()
     WHERE id = $1
     RETURNING ${WALL_PHOTO_SELECT}`,
    [id, caption, meta, frameStyle, displaySize, aspect],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

function nextStorageKey(id: string, currentKey: string, ext: string): string {
  const match = /\/v(\d+)\//.exec(currentKey);
  const version = match ? Number(match[1]) + 1 : 2;
  const safeVersion =
    Number.isFinite(version) && version > 0 ? Math.floor(version) : 2;
  return `wall/${id}/v${safeVersion}/display${ext}`;
}

export type ReplaceWallPhotoImageInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

/** Swap the print on an existing board polaroid; keeps caption/meta/position. */
export async function replaceWallPhotoImage(
  id: string,
  input: ReplaceWallPhotoImageInput,
): Promise<WallPhoto | null> {
  const current = await getWallPhoto(id);
  if (!current) return null;

  if (!input.buffer.length) throw new Error("Empty file");
  if (input.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 20MB or smaller");
  }

  const originalName =
    path.basename(input.originalName || "photo.jpg").slice(0, 240) ||
    "photo.jpg";
  const isImage =
    (input.mimeType || "").startsWith("image/") ||
    /\.(jpe?g|png|webp|hei[cf]|gif|avif)$/i.test(originalName);
  if (!isImage) throw new Error("Only image files can be pinned to the board");

  const processed = await processWallImage(
    input.buffer,
    originalName,
    input.mimeType || "application/octet-stream",
  );

  const storageKey = nextStorageKey(id, current.storageKey, processed.ext);
  const oldKey = current.storageKey;

  await localMediaStorage.ensureRoots();
  const target = await localMediaStorage.createAtomicTarget("public", storageKey);
  try {
    await fs.writeFile(target.tempPath, processed.buffer);
    await target.commit();
  } catch (err) {
    await target.abort();
    throw err;
  }

  try {
    const { rows } = await getPool().query<WallPhotoRow>(
      `UPDATE wall_photos
       SET storage_key = $2,
           original_name = $3,
           mime_type = $4,
           byte_size = $5,
           width = $6,
           height = $7,
           orientation = $8,
           updated_at = now()
       WHERE id = $1
       RETURNING ${WALL_PHOTO_SELECT}`,
      [
        id,
        storageKey,
        originalName,
        processed.mimeType,
        processed.buffer.length,
        processed.width,
        processed.height,
        processed.orientation,
      ],
    );

    if (oldKey !== storageKey) {
      try {
        await fs.unlink(localMediaStorage.absolutePath("public", oldKey));
      } catch {
        // old file may already be gone
      }
      try {
        const dir = path.dirname(
          localMediaStorage.absolutePath("public", oldKey),
        );
        await fs.rmdir(dir).catch(() => undefined);
      } catch {
        // ignore
      }
    }

    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    try {
      await fs.unlink(localMediaStorage.absolutePath("public", storageKey));
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function deleteWallPhoto(id: string): Promise<boolean> {
  const current = await getWallPhoto(id);
  if (!current) return false;

  await getPool().query(`DELETE FROM wall_photos WHERE id = $1`, [id]);

  try {
    const abs = localMediaStorage.absolutePath("public", current.storageKey);
    await fs.unlink(abs);
  } catch {
    // File may already be gone; metadata delete is authoritative.
  }

  // Best-effort cleanup of empty parent dirs
  try {
    const dir = path.dirname(
      localMediaStorage.absolutePath("public", current.storageKey),
    );
    await fs.rmdir(dir).catch(() => undefined);
    await fs.rmdir(path.dirname(dir)).catch(() => undefined);
  } catch {
    // ignore
  }

  return true;
}

/** Reorder board photos. Unknown ids ignored; missing ids appended. */
export async function reorderWallPhotos(order: string[]): Promise<WallPhoto[]> {
  const unique = [...new Set(order.map(String).filter(Boolean))];

  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM wall_photos ORDER BY position ASC, created_at ASC, id ASC`,
    );
    const existing = rows.map((r) => r.id);
    const existingSet = new Set(existing);
    const ordered = unique.filter((id) => existingSet.has(id));
    const rest = existing.filter((id) => !ordered.includes(id));
    const finalOrder = [...ordered, ...rest];

    for (let i = 0; i < finalOrder.length; i++) {
      await client.query(
        `UPDATE wall_photos SET position = $2, updated_at = now() WHERE id = $1`,
        [finalOrder[i], i],
      );
    }
  });

  return listWallPhotos();
}
