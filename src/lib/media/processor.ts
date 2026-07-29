import path from "path";
import { generateImageVariants } from "./image";
import {
  getMediaById,
  markMediaProcessing,
  publishProcessedMedia,
} from "./repository";
import { localMediaStorage, type LocalMediaStorage } from "./storage";
import type { MediaAsset, MediaJob, MediaWithAssets } from "./types";
import { generateVideoAssets, generateVideoPoster } from "./video";

function processingError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: "media_processing_failed" });
}

async function processImage(
  media: MediaWithAssets,
  storage: LocalMediaStorage,
  signal?: AbortSignal,
): Promise<void> {
  const result = await generateImageVariants(media, { storage, signal });
  await publishProcessedMedia(media.id, result.assets, result.metadata);
}

async function processVideo(
  media: MediaWithAssets,
  storage: LocalMediaStorage,
  signal?: AbortSignal,
): Promise<void> {
  // Poster first so the gallery shows a frame while full remux/transcode runs.
  const poster = await generateVideoPoster(media, { storage, signal });
  await publishProcessedMedia(media.id, [poster]);
  const assets = await generateVideoAssets(media, {
    storage,
    signal,
    skipPoster: true,
  });
  await publishProcessedMedia(media.id, assets);
}

async function processLivePhoto(
  media: MediaWithAssets,
  storage: LocalMediaStorage,
  signal?: AbortSignal,
): Promise<void> {
  // Publish still derivatives first so a video-only failure still leaves thumbs usable.
  const still = await generateImageVariants(media, { storage, signal });
  await publishProcessedMedia(media.id, still.assets, still.metadata);
  const motion = await generateVideoAssets(media, {
    live: true,
    storage,
    signal,
  });
  await publishProcessedMedia(media.id, motion);
}

async function purgeMedia(
  media: MediaWithAssets,
  storage: LocalMediaStorage,
): Promise<void> {
  for (const asset of Object.values(media.assets)) {
    if (!asset || asset.role.startsWith("legacy_")) continue;
    const basename = path.posix.basename(asset.storageKey);
    const trashKey = `${media.tripId}/${media.id}/v${media.version}/${asset.role}-${basename}`;
    await storage.moveToTrash(
      asset.isPublic ? "public" : "private",
      asset.storageKey,
      trashKey,
    );
  }
}

export async function processMediaJob(
  job: MediaJob,
  options: { storage?: LocalMediaStorage; signal?: AbortSignal } = {},
): Promise<void> {
  const storage = options.storage || localMediaStorage;
  await storage.ensureRoots();
  const media = await getMediaById(job.mediaId, {
    includeDeleted: job.jobType === "purge_media",
  });
  if (!media) {
    if (job.jobType === "purge_media") return;
    throw processingError(`Media ${job.mediaId} no longer exists`);
  }
  if (job.jobType !== "purge_media" && media.state === "deleted") return;
  if (job.jobType === "purge_media") {
    if (media.state !== "deleted") return;
    await purgeMedia(media, storage);
    return;
  }

  await markMediaProcessing(media.id);
  switch (job.jobType) {
    case "process_image":
      if (media.kind !== "image") {
        throw processingError(`Expected image media, received ${media.kind}`);
      }
      await processImage(media, storage, options.signal);
      return;
    case "process_video":
      if (media.kind !== "video") {
        throw processingError(`Expected video media, received ${media.kind}`);
      }
      await processVideo(media, storage, options.signal);
      return;
    case "process_live_photo":
      if (media.kind !== "live_photo") {
        throw processingError(`Expected Live Photo media, received ${media.kind}`);
      }
      await processLivePhoto(media, storage, options.signal);
      return;
    default:
      throw processingError(`Unsupported media job type: ${job.jobType}`);
  }
}

export function mediaErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code || "");
    if (/^[a-z0-9_]{1,100}$/i.test(code)) return code.toLowerCase();
  }
  return "media_processing_failed";
}

export function mediaErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 2000);
  return String(error || "Media processing failed").slice(0, 2000);
}

export function publicAssets(media: MediaWithAssets): MediaAsset[] {
  return Object.values(media.assets).filter(
    (asset): asset is MediaAsset => Boolean(asset?.isPublic),
  );
}

