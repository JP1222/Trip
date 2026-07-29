import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { PhotoMeta } from "./types";
import { processUploadImage } from "./image-process";
import { extractPhotoExif, type PhotoExif } from "./exif";
import { pairLivePhotoFiles, type MediaUploadUnit } from "./photos-client";

const uploadsRoot = path.join(process.cwd(), "public", "uploads");

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/gif",
  "image/avif",
  "image/tiff",
  "image/bmp",
]);

const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/ogg",
]);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|hei[cf]|avif|bmp|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)$/i;

function tripDir(tripId: string) {
  return path.join(uploadsRoot, tripId);
}

function metaPath(tripId: string) {
  return path.join(tripDir(tripId), "photos.json");
}

async function ensureTripDir(tripId: string) {
  await fs.mkdir(tripDir(tripId), { recursive: true });
  try {
    await fs.access(metaPath(tripId));
  } catch {
    await fs.writeFile(metaPath(tripId), "[]", "utf-8");
  }
}

/** Featured first (by featuredAt), then newest upload. */
export function sortPhotos(photos: PhotoMeta[]): PhotoMeta[] {
  return [...photos].sort((a, b) => {
    const af = a.featured ? 1 : 0;
    const bf = b.featured ? 1 : 0;
    if (af !== bf) return bf - af;
    if (a.featured && b.featured) {
      const at = a.featuredAt ? new Date(a.featuredAt).getTime() : 0;
      const bt = b.featuredAt ? new Date(b.featuredAt).getTime() : 0;
      if (at !== bt) return bt - at;
    }
    return (
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  });
}

export async function getPhotos(tripId: string): Promise<PhotoMeta[]> {
  await ensureTripDir(tripId);
  const raw = await fs.readFile(metaPath(tripId), "utf-8");
  const photos = JSON.parse(raw) as PhotoMeta[];
  return sortPhotos(photos);
}

export async function getPhoto(
  tripId: string,
  photoId: string,
): Promise<PhotoMeta | null> {
  const photos = await getPhotos(tripId);
  return photos.find((p) => p.id === photoId) || null;
}

export function photoFilePath(tripId: string, filename: string): string {
  return path.join(tripDir(tripId), filename);
}

export async function getAllPhotos(tripIds: string[]): Promise<PhotoMeta[]> {
  const lists = await Promise.all(tripIds.map((id) => getPhotos(id)));
  return sortPhotos(lists.flat());
}

export function getFeaturedPhotos(photos: PhotoMeta[]): PhotoMeta[] {
  return sortPhotos(photos.filter((p) => p.featured));
}

function isAllowedImage(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (ALLOWED_IMAGE_MIME.has(mime) || mime.startsWith("image/")) return true;
  // Empty MIME from some mobile/folder picks — trust extension
  return IMAGE_EXT.test(file.name);
}

function isAllowedVideo(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (ALLOWED_VIDEO_MIME.has(mime) || mime.startsWith("video/")) return true;
  return VIDEO_EXT.test(file.name);
}

function isAllowedMedia(file: File): boolean {
  return isAllowedImage(file) || isAllowedVideo(file);
}

function videoExtAndMime(file: {
  name: string;
  type?: string;
}): { ext: string; mimeType: string } {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (mime === "video/webm" || name.endsWith(".webm")) {
    return { ext: ".webm", mimeType: "video/webm" };
  }
  if (mime === "video/ogg" || name.endsWith(".ogv") || name.endsWith(".ogg")) {
    return { ext: ".ogv", mimeType: "video/ogg" };
  }
  if (
    mime === "video/quicktime" ||
    name.endsWith(".mov") ||
    mime === "video/x-m4v" ||
    name.endsWith(".m4v")
  ) {
    // Keep .mov for QuickTime; browsers that support it play natively
    if (name.endsWith(".m4v") || mime === "video/x-m4v") {
      return { ext: ".m4v", mimeType: "video/x-m4v" };
    }
    return { ext: ".mov", mimeType: "video/quicktime" };
  }
  return { ext: ".mp4", mimeType: mime.startsWith("video/") ? mime : "video/mp4" };
}

function applyExifToMeta(meta: PhotoMeta, exif: PhotoExif): void {
  if (exif.device) meta.device = exif.device;
  if (exif.aperture != null) meta.aperture = exif.aperture;
  if (exif.shutter) meta.shutter = exif.shutter;
  if (exif.iso != null) meta.iso = exif.iso;
  if (exif.focalLength != null) meta.focalLength = exif.focalLength;
  if (exif.focalLength35 != null) meta.focalLength35 = exif.focalLength35;
  if (exif.lens) meta.lens = exif.lens;
  if (exif.takenAt) meta.takenAt = exif.takenAt;
}

export type SavePhotoOptions = {
  uploader?: string;
  caption?: string;
  featured?: boolean;
  /** Apple Live Photo companion video (only valid with still images). */
  liveVideo?: File;
  /** When true, do not unshift — caller manages photos.json */
  skipMetaWrite?: boolean;
};

/**
 * Write Live Photo companion .mov next to the still and patch meta fields.
 */
async function writeLiveVideoCompanion(
  tripId: string,
  photoId: string,
  liveVideo: File,
): Promise<
  Pick<
    PhotoMeta,
    | "liveVideoFilename"
    | "liveVideoOriginalName"
    | "liveVideoSize"
    | "liveVideoMimeType"
  >
> {
  if (!isAllowedVideo(liveVideo)) {
    throw new Error("Live Photo companion must be a video (.mov / .mp4)");
  }
  if (liveVideo.size > MAX_VIDEO_BYTES) {
    throw new Error("Live Photo video must be under 100MB");
  }
  const raw = Buffer.from(await liveVideo.arrayBuffer());
  const { ext, mimeType } = videoExtAndMime(liveVideo);
  const liveVideoFilename = `${photoId}-live${ext}`;
  const base =
    path.basename(liveVideo.name, path.extname(liveVideo.name)).trim() ||
    "live";
  await fs.writeFile(path.join(tripDir(tripId), liveVideoFilename), raw);
  return {
    liveVideoFilename,
    liveVideoOriginalName: `${base}${ext}`,
    liveVideoSize: raw.length,
    liveVideoMimeType: mimeType,
  };
}

/**
 * Save an image/video buffer into a trip gallery (shared by HTTP upload + import script).
 */
export async function savePhotoBuffer(
  tripId: string,
  raw: Buffer,
  originalFileName: string,
  mimeHint: string,
  options: SavePhotoOptions = {},
): Promise<PhotoMeta> {
  await ensureTripDir(tripId);

  const name = originalFileName || "photo.jpg";
  const mimeLower = (mimeHint || "").toLowerCase();
  const isVideo =
    mimeLower.startsWith("video/") ||
    (!mimeLower.startsWith("image/") && VIDEO_EXT.test(name));

  if (isVideo) {
    if (raw.length > MAX_VIDEO_BYTES) {
      throw new Error("Each video must be under 100MB");
    }
    if (options.liveVideo) {
      throw new Error("Live Photo companion can only be attached to a still image");
    }
  } else if (raw.length > MAX_IMAGE_BYTES) {
    // Allow slightly larger sources; processUploadImage will shrink
    if (raw.length > 80 * 1024 * 1024) {
      throw new Error("Each image must be under 80MB");
    }
  }

  const id = randomUUID();
  const base =
    path.basename(name, path.extname(name)).trim() ||
    (isVideo ? "video" : "photo");

  let filename: string;
  let originalName: string;
  let mimeType: string;
  let size: number;
  let exif: PhotoExif = {};

  if (isVideo) {
    const { ext, mimeType: vMime } = videoExtAndMime({
      name,
      type: mimeHint || "video/mp4",
    });
    filename = `${id}${ext}`;
    originalName = `${base}${ext}`;
    mimeType = vMime;
    size = raw.length;
    await fs.writeFile(path.join(tripDir(tripId), filename), raw);
    exif = await extractPhotoExif(raw, name).catch(() => ({}));
  } else {
    // Read full EXIF before re-encode strips metadata
    exif = await extractPhotoExif(raw, name).catch(() => ({}));
    const processed = await processUploadImage(
      raw,
      name,
      mimeHint || "application/octet-stream",
    );
    filename = `${id}${processed.ext}`;
    originalName = `${base}.jpg`;
    mimeType = processed.mimeType;
    size = processed.buffer.length;
    await fs.writeFile(path.join(tripDir(tripId), filename), processed.buffer);
  }

  const meta: PhotoMeta = {
    id,
    tripId,
    filename,
    originalName,
    uploader: (options.uploader || "").trim() || "Anonymous traveler",
    caption: options.caption?.trim() || undefined,
    mimeType,
    size,
    uploadedAt: new Date().toISOString(),
  };
  applyExifToMeta(meta, exif);

  if (options.featured) {
    meta.featured = true;
    meta.featuredAt = new Date().toISOString();
  }

  // Apple Live Photo: still + companion video → one gallery item
  if (options.liveVideo && !isVideo) {
    const live = await writeLiveVideoCompanion(tripId, id, options.liveVideo);
    Object.assign(meta, live);
  }

  if (!options.skipMetaWrite) {
    const photos = await getPhotos(tripId);
    photos.unshift(meta);
    await fs.writeFile(
      metaPath(tripId),
      JSON.stringify(photos, null, 2),
      "utf-8",
    );
  }

  return meta;
}

export async function savePhoto(
  tripId: string,
  file: File,
  uploader: string,
  caption?: string,
  liveVideo?: File,
): Promise<PhotoMeta> {
  if (!isAllowedMedia(file)) {
    throw new Error("Only images and videos are supported");
  }
  if (liveVideo) {
    if (!isAllowedImage(file)) {
      throw new Error("Live Photos need a still image plus a .mov companion");
    }
    if (!isAllowedVideo(liveVideo)) {
      throw new Error("Live Photo companion must be a video (.mov / .mp4)");
    }
  }
  const raw = Buffer.from(await file.arrayBuffer());
  return savePhotoBuffer(
    tripId,
    raw,
    file.name,
    file.type || "application/octet-stream",
    { uploader, caption, liveVideo },
  );
}

/**
 * Save one or more files, auto-pairing Apple Live Photos by basename
 * (IMG_1234.HEIC + IMG_1234.MOV). Sequential writes avoid photos.json races.
 */
export async function saveMediaFiles(
  tripId: string,
  files: File[],
  uploader: string,
  caption?: string,
): Promise<{ saved: PhotoMeta[]; errors: string[] }> {
  const units = pairLivePhotoFiles(files);
  const saved: PhotoMeta[] = [];
  const errors: string[] = [];

  for (const unit of units) {
    try {
      if (unit.kind === "live") {
        saved.push(
          await savePhoto(tripId, unit.image, uploader, caption, unit.video),
        );
      } else {
        saved.push(await savePhoto(tripId, unit.file, uploader, caption));
      }
    } catch (err) {
      const name =
        unit.kind === "live"
          ? `${unit.image.name} + ${unit.video.name}`
          : unit.file.name;
      errors.push(
        `${name}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }

  return { saved, errors };
}

/** Re-export pairing type for API callers that want unit counts. */
export type { MediaUploadUnit };

/** Replace photos.json entirely (import / sync scripts). */
export async function writePhotosMeta(
  tripId: string,
  photos: PhotoMeta[],
): Promise<void> {
  await ensureTripDir(tripId);
  await fs.writeFile(
    metaPath(tripId),
    JSON.stringify(photos, null, 2),
    "utf-8",
  );
}

export function tripUploadsDir(tripId: string) {
  return tripDir(tripId);
}

export function photoPublicUrl(tripId: string, filename: string) {
  return `/uploads/${tripId}/${filename}`;
}

export async function deletePhoto(
  tripId: string,
  photoId: string,
): Promise<boolean> {
  const result = await deletePhotos(tripId, [photoId]);
  return result.deleted.includes(photoId);
}

/** Batch delete. Returns deleted ids and public URLs that were removed (for cover cleanup). */
export async function deletePhotos(
  tripId: string,
  photoIds: string[],
): Promise<{ deleted: string[]; removedUrls: string[] }> {
  await ensureTripDir(tripId);
  const idSet = new Set(photoIds.filter(Boolean));
  if (idSet.size === 0) return { deleted: [], removedUrls: [] };

  const photos = await getPhotos(tripId);
  const toRemove = photos.filter((p) => idSet.has(p.id));
  if (toRemove.length === 0) return { deleted: [], removedUrls: [] };

  const removeIds = new Set(toRemove.map((p) => p.id));
  const next = photos.filter((p) => !removeIds.has(p.id));
  await fs.writeFile(metaPath(tripId), JSON.stringify(next, null, 2), "utf-8");

  const removedUrls: string[] = [];
  for (const photo of toRemove) {
    removedUrls.push(photoPublicUrl(tripId, photo.filename));
    try {
      await fs.unlink(path.join(tripDir(tripId), photo.filename));
    } catch {
      // file may already be gone
    }
    // Also remove Apple Live Photo companion video
    if (photo.liveVideoFilename) {
      removedUrls.push(photoPublicUrl(tripId, photo.liveVideoFilename));
      try {
        await fs.unlink(path.join(tripDir(tripId), photo.liveVideoFilename));
      } catch {
        // companion may already be gone
      }
    }
  }

  return {
    deleted: toRemove.map((p) => p.id),
    removedUrls,
  };
}

export async function updatePhotoCaption(
  tripId: string,
  photoId: string,
  caption: string,
): Promise<PhotoMeta | null> {
  return updatePhoto(tripId, photoId, {
    caption: caption.trim() || undefined,
  });
}

export type PhotoPatch = {
  caption?: string | undefined;
  featured?: boolean;
};

/**
 * Patch caption and/or featured flag. Pass `caption: undefined` via empty
 * string through updatePhotoCaption; for featured, true stars, false unstars.
 */
export async function updatePhoto(
  tripId: string,
  photoId: string,
  patch: PhotoPatch,
): Promise<PhotoMeta | null> {
  await ensureTripDir(tripId);
  const raw = await fs.readFile(metaPath(tripId), "utf-8");
  const photos = JSON.parse(raw) as PhotoMeta[];
  const index = photos.findIndex((p) => p.id === photoId);
  if (index < 0) return null;

  const prev = photos[index];
  const next: PhotoMeta = { ...prev };

  if ("caption" in patch) {
    next.caption = patch.caption?.trim() || undefined;
  }

  if (typeof patch.featured === "boolean") {
    if (patch.featured) {
      next.featured = true;
      next.featuredAt = prev.featured
        ? prev.featuredAt || new Date().toISOString()
        : new Date().toISOString();
    } else {
      // Drop keys so disk JSON stays clean; response still needs an
      // explicit false (JSON omits undefined, and clients merge by spread).
      delete next.featured;
      delete next.featuredAt;
    }
  }

  photos[index] = next;
  await fs.writeFile(metaPath(tripId), JSON.stringify(photos, null, 2), "utf-8");

  // Always include a boolean so PATCH clients can clear featured via spread merge
  return {
    ...next,
    featured: next.featured === true,
    featuredAt: next.featured ? next.featuredAt : undefined,
  };
}

export async function setPhotoFeatured(
  tripId: string,
  photoId: string,
  featured: boolean,
): Promise<PhotoMeta | null> {
  return updatePhoto(tripId, photoId, { featured });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
