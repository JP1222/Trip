import { randomUUID } from "crypto";
import path from "path";
import type { PhotoMeta } from "./types";
import { pairLivePhotoFiles, type MediaUploadUnit } from "./photos-client";
import {
  createQueuedMedia,
  getPhotoMetaPage,
  getTripMediaById,
  listPhotoMetaForTrip,
  mediaToPhotoMeta,
  softDeleteMedia,
  updateMediaMetadata,
} from "./media/repository";
import { mediaMetaAfterQueue } from "./media/inline";
import {
  assertStorageKey,
  localMediaStorage,
  mediaAssetKey,
} from "./media/storage";
import type { MediaJobType } from "./media/types";

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

export async function getPhotos(
  tripId: string,
  options: { includePending?: boolean } = {},
): Promise<PhotoMeta[]> {
  return listPhotoMetaForTrip(tripId, options);
}

export async function getPhoto(
  tripId: string,
  photoId: string,
): Promise<PhotoMeta | null> {
  const media = await getTripMediaById(tripId, photoId, {
    includeNonReady: true,
  });
  return media ? mediaToPhotoMeta(media) : null;
}

/**
 * Resolve a gallery filename to an on-disk path.
 * Public derivatives live under MEDIA_PUBLIC_ROOT (/media/...).
 * Legacy import keys may still reference basename files under LEGACY_UPLOADS.
 */
export function photoFilePath(tripId: string, filename: string): string {
  if (filename.startsWith("/media/")) {
    return localMediaStorage.absolutePath(
      "public",
      assertStorageKey(filename.slice("/media/".length)),
    );
  }
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("Invalid media filename");
  }
  const legacyRoot =
    process.env.LEGACY_UPLOADS_ROOT ||
    path.join(process.cwd(), "public", "uploads");
  return path.join(legacyRoot, tripId, filename);
}

export async function getPhotosPage(
  tripId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ items: PhotoMeta[]; nextCursor: string | null; total: number }> {
  return getPhotoMetaPage(tripId, options);
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

export type SavePhotoOptions = {
  uploader?: string;
  caption?: string;
  featured?: boolean;
  liveVideo?: File;
};

function safeOriginalUploadName(name: string, fallback: string): string {
  const basename = path
    .basename(name || fallback)
    .replace(/[\u0000-\u001f\u007f]/g, "_");
  return (basename || fallback).slice(0, 255);
}

function sourceExtension(name: string, isVideo: boolean): string {
  const extension = path.extname(name).toLowerCase();
  const allowed = isVideo
    ? new Set([".mp4", ".webm", ".mov", ".m4v", ".ogg", ".ogv"])
    : new Set([
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".heic",
        ".heif",
        ".avif",
        ".bmp",
        ".tif",
        ".tiff",
      ]);
  if (allowed.has(extension)) return extension;
  return isVideo ? ".video" : ".image";
}

/**
 * Buffer-based ingest used by import tooling and any non-stream callers.
 * Prefer stream staging (queueStagedMedia) for HTTP uploads.
 */
export async function savePhotoBuffer(
  tripId: string,
  raw: Buffer,
  originalFileName: string,
  mimeHint: string,
  options: SavePhotoOptions = {},
): Promise<PhotoMeta> {
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
      throw new Error(
        "Live Photo companion can only be attached to a still image",
      );
    }
  } else if (raw.length > 80 * 1024 * 1024) {
    throw new Error("Each image must be under 80MB");
  } else if (raw.length > MAX_IMAGE_BYTES) {
    // Larger sources are accepted; worker/sharp will downscale derivatives.
  }

  const id = randomUUID();
  const version = 1;
  const originalName = safeOriginalUploadName(
    name,
    isVideo ? "video.mp4" : "photo.jpg",
  );
  const uploader = (options.uploader || "").trim() || "Anonymous traveler";
  const caption = options.caption?.trim() || undefined;
  if (uploader.length > 80) throw new Error("Uploader name is too long");
  if (caption && caption.length > 2000) throw new Error("Caption is too long");

  await localMediaStorage.ensureRoots();
  const staged: string[] = [];
  const promoted: Array<{ key: string; role: string }> = [];
  try {
    const originalExtension = sourceExtension(originalName, isVideo);
    const originalStage = await localMediaStorage.stageBuffer(
      `${id}/original-${randomUUID()}${originalExtension}`,
      raw,
    );
    staged.push(originalStage.key);
    const originalKey = mediaAssetKey(
      tripId,
      id,
      version,
      `original${originalExtension}`,
    );
    await localMediaStorage.promoteStaged(originalStage.key, originalKey);
    staged.splice(staged.indexOf(originalStage.key), 1);
    promoted.push({ key: originalKey, role: "original" });

    const assets: Parameters<typeof createQueuedMedia>[0]["assets"] = [
      {
        role: "original",
        storageKey: originalKey,
        mimeType: mimeHint || "application/octet-stream",
        byteSize: originalStage.byteSize,
        sha256: originalStage.sha256,
        isPublic: false,
      },
    ];

    if (options.liveVideo) {
      const liveRaw = Buffer.from(await options.liveVideo.arrayBuffer());
      if (liveRaw.length > MAX_VIDEO_BYTES) {
        throw new Error("Live Photo video must be under 100MB");
      }
      const liveName = safeOriginalUploadName(options.liveVideo.name, "live.mov");
      const liveExtension = sourceExtension(liveName, true);
      const liveStage = await localMediaStorage.stageBuffer(
        `${id}/live-${randomUUID()}${liveExtension}`,
        liveRaw,
      );
      staged.push(liveStage.key);
      const liveKey = mediaAssetKey(
        tripId,
        id,
        version,
        `live-original${liveExtension}`,
      );
      await localMediaStorage.promoteStaged(liveStage.key, liveKey);
      staged.splice(staged.indexOf(liveStage.key), 1);
      promoted.push({ key: liveKey, role: "live_original" });
      assets.push({
        role: "live_original",
        storageKey: liveKey,
        mimeType: options.liveVideo.type || "video/quicktime",
        byteSize: liveStage.byteSize,
        sha256: liveStage.sha256,
        isPublic: false,
      });
    }

    const kind = options.liveVideo ? "live_photo" : isVideo ? "video" : "image";
    const jobType: MediaJobType =
      kind === "live_photo"
        ? "process_live_photo"
        : kind === "video"
          ? "process_video"
          : "process_image";
    const queued = await createQueuedMedia({
      id,
      tripId,
      kind,
      uploader,
      caption,
      originalName,
      sourceMimeType: mimeHint || "application/octet-stream",
      sourceBytes: raw.length,
      featured: options.featured,
      assets,
      jobType,
    });
    return mediaMetaAfterQueue(id, jobType, queued);
  } catch (error) {
    await Promise.all(staged.map((key) => localMediaStorage.discardStaged(key)));
    await Promise.all(
      promoted.map(({ key, role }) =>
        localMediaStorage.moveToTrash(
          "private",
          key,
          `${tripId}/${id}/failed-ingest/${role}-${path.posix.basename(key)}`,
        ),
      ),
    );
    throw error;
  }
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
 * Save one or more files, auto-pairing Apple Live Photos by basename.
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

export type { MediaUploadUnit };

export function tripUploadsDir(tripId: string) {
  const legacyRoot =
    process.env.LEGACY_UPLOADS_ROOT ||
    path.join(process.cwd(), "public", "uploads");
  return path.join(legacyRoot, tripId);
}

export function photoPublicUrl(tripId: string, filename: string) {
  if (filename.startsWith("/")) return filename;
  return `/uploads/${tripId}/${filename}`;
}

export async function deletePhoto(
  tripId: string,
  photoId: string,
): Promise<boolean> {
  const result = await deletePhotos(tripId, [photoId]);
  return result.deleted.includes(photoId);
}

export async function deletePhotos(
  tripId: string,
  photoIds: string[],
): Promise<{ deleted: string[]; removedUrls: string[] }> {
  const removed = await softDeleteMedia(tripId, photoIds.filter(Boolean));
  const removedUrls: string[] = [];
  for (const media of removed) {
    const meta = mediaToPhotoMeta(media);
    removedUrls.push(photoPublicUrl(tripId, meta.filename));
    if (meta.liveVideoFilename) {
      removedUrls.push(photoPublicUrl(tripId, meta.liveVideoFilename));
    }
  }
  return { deleted: removed.map((media) => media.id), removedUrls };
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

export async function updatePhoto(
  tripId: string,
  photoId: string,
  patch: PhotoPatch,
): Promise<PhotoMeta | null> {
  return updateMediaMetadata(tripId, photoId, patch);
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
