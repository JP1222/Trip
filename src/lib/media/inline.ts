import { logger } from "@/lib/observability/logger";
import { processMediaJob } from "./processor";
import { getMediaById, mediaToPhotoMeta } from "./repository";
import type { MediaJobType, MediaWithAssets } from "./types";

/**
 * Optional same-process processing for local/dev when no worker is running.
 * Production should keep MEDIA_INLINE_PROCESS unset and run media-worker.
 */
export function inlineProcessEnabled(): boolean {
  return process.env.MEDIA_INLINE_PROCESS === "1";
}

export async function maybeInlineProcessMedia(
  mediaId: string,
  jobType: MediaJobType,
): Promise<MediaWithAssets | null> {
  if (!inlineProcessEnabled()) return null;
  try {
    await processMediaJob({
      id: 0,
      mediaId,
      jobType,
      state: "processing",
      priority: 0,
      attempts: 1,
      maxAttempts: 1,
      payload: {},
      availableAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return (await getMediaById(mediaId)) || null;
  } catch (error) {
    logger.error("media_inline_process_failed", { mediaId, jobType, error });
    return null;
  }
}

export async function mediaMetaAfterQueue(
  mediaId: string,
  jobType: MediaJobType,
  fallback: MediaWithAssets,
) {
  const ready = await maybeInlineProcessMedia(mediaId, jobType);
  return mediaToPhotoMeta(ready || fallback);
}
