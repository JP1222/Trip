import { randomUUID } from "crypto";
import path from "path";
import { mediaMetaAfterQueue } from "./inline";
import { createQueuedMedia, mediaToPhotoMeta } from "./repository";
import {
  localMediaStorage,
  mediaAssetKey,
  type LocalMediaStorage,
} from "./storage";
import type { MediaJobType, MediaKind, QueuedMediaInput } from "./types";

export type StagedMediaSource = {
  path: string;
  originalName: string;
  declaredMimeType: string;
  byteSize: number;
  sha256: string;
};

export type QueueStagedMediaInput = {
  tripId: string;
  uploader: string;
  caption?: string;
  primary: StagedMediaSource;
  liveVideo?: StagedMediaSource;
  featured?: boolean;
};

const IMAGE_EXTENSION = new Set([
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
const VIDEO_EXTENSION = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
  ".ogg",
  ".ogv",
]);

function cleanName(value: string, fallback: string): string {
  const basename = path
    .basename(value || fallback)
    .replace(/[\u0000-\u001f\u007f]/g, "_");
  return (basename || fallback).slice(0, 255);
}

function mediaKind(source: StagedMediaSource, live: boolean): MediaKind {
  if (live) return "live_photo";
  const mime = source.declaredMimeType.toLowerCase();
  const extension = path.extname(source.originalName).toLowerCase();
  if (mime.startsWith("video/") || VIDEO_EXTENSION.has(extension)) return "video";
  if (mime.startsWith("image/") || IMAGE_EXTENSION.has(extension)) return "image";
  throw new Error("Only images and videos are supported");
}

function extensionForSource(source: StagedMediaSource, video: boolean): string {
  const extension = path.extname(source.originalName).toLowerCase();
  if ((video ? VIDEO_EXTENSION : IMAGE_EXTENSION).has(extension)) return extension;
  return video ? ".video" : ".image";
}

function validateSource(source: StagedMediaSource): void {
  if (!Number.isSafeInteger(source.byteSize) || source.byteSize <= 0) {
    throw new Error("Staged upload has an invalid byte size");
  }
  if (!/^[a-f0-9]{64}$/i.test(source.sha256)) {
    throw new Error("Staged upload has an invalid SHA-256 digest");
  }
}

export async function queueStagedMedia(
  input: QueueStagedMediaInput,
  options: { storage?: LocalMediaStorage } = {},
) {
  const storage = options.storage || localMediaStorage;
  validateSource(input.primary);
  if (input.liveVideo) validateSource(input.liveVideo);
  const kind = mediaKind(input.primary, Boolean(input.liveVideo));
  if (input.liveVideo) {
    const companionKind = mediaKind(input.liveVideo, false);
    if (companionKind !== "video") {
      throw new Error("Live Photo companion must be a video");
    }
    const primaryKind = mediaKind(input.primary, false);
    if (primaryKind !== "image") {
      throw new Error("Live Photos need a still image plus a video companion");
    }
  }
  const uploader = input.uploader.trim();
  const caption = input.caption?.trim() || undefined;
  if (!uploader || uploader.length > 80) throw new Error("Invalid uploader name");
  if (caption && caption.length > 2000) throw new Error("Caption is too long");

  const id = randomUUID();
  const version = 1;
  const originalName = cleanName(
    input.primary.originalName,
    kind === "video" ? "video.mp4" : "photo.jpg",
  );
  const originalExtension = extensionForSource(input.primary, kind === "video");
  const originalKey = mediaAssetKey(
    input.tripId,
    id,
    version,
    `original${originalExtension}`,
  );
  const promoted: Array<{ key: string; role: string }> = [];

  await storage.ensureRoots();
  try {
    await storage.adoptStagedFile(input.primary.path, originalKey);
    promoted.push({ key: originalKey, role: "original" });
    const assets: QueuedMediaInput["assets"] = [
      {
        role: "original",
        storageKey: originalKey,
        mimeType: input.primary.declaredMimeType || "application/octet-stream",
        byteSize: input.primary.byteSize,
        sha256: input.primary.sha256.toLowerCase(),
        isPublic: false,
      },
    ];

    if (input.liveVideo) {
      const liveExtension = extensionForSource(input.liveVideo, true);
      const liveKey = mediaAssetKey(
        input.tripId,
        id,
        version,
        `live-original${liveExtension}`,
      );
      await storage.adoptStagedFile(input.liveVideo.path, liveKey);
      promoted.push({ key: liveKey, role: "live_original" });
      assets.push({
        role: "live_original",
        storageKey: liveKey,
        mimeType: input.liveVideo.declaredMimeType || "application/octet-stream",
        byteSize: input.liveVideo.byteSize,
        sha256: input.liveVideo.sha256.toLowerCase(),
        isPublic: false,
      });
    }

    const jobType: MediaJobType =
      kind === "live_photo"
        ? "process_live_photo"
        : kind === "video"
          ? "process_video"
          : "process_image";
    const queued = await createQueuedMedia({
      id,
      tripId: input.tripId,
      kind,
      uploader,
      caption,
      originalName,
      sourceMimeType:
        input.primary.declaredMimeType || "application/octet-stream",
      sourceBytes: input.primary.byteSize,
      featured: input.featured,
      assets,
      jobType,
    });
    return mediaMetaAfterQueue(id, jobType, queued);
  } catch (error) {
    await Promise.all(
      promoted.map(({ key, role }) =>
        storage.moveToTrash(
          "private",
          key,
          `${input.tripId}/${id}/failed-ingest/${role}-${path.posix.basename(key)}`,
        ),
      ),
    );
    throw error;
  }
}

