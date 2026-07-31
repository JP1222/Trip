/** Client-safe media URL helpers for the public /media pipeline. */

import type { PhotoMeta } from "./types";
import { photoPublicUrl } from "./photos-client";

/**
 * Full-resolution public still (`full.jpg`): lightbox preview, download source,
 * home/admin covers. Never use for masonry list chips.
 */
export function photoFullPublicUrl(photo: PhotoMeta): string {
  return photoPublicUrl(
    photo.articleId || photo.tripId || "",
    photo.previewFilename || photo.filename,
  );
}

/**
 * List/masonry waterfall URL: grid-1080 when present.
 * Falls back to full only while the list derivative is still processing.
 */
export function photoListPublicUrl(photo: PhotoMeta): string {
  return photoPublicUrl(
    photo.articleId || photo.tripId || "",
    photo.thumbnailFilename || photo.previewFilename || photo.filename,
  );
}

/** Legacy /uploads paths are dead after the media cutover. */
export function isLegacyUploadUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return url.includes("/uploads/");
}

/**
 * Media id embedded in a cover ref, if any.
 * Supports `/media/trips|articles/{owner}/{id}/...` and obsolete `/uploads/...`.
 */
export function mediaIdFromCoverRef(ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  const media = ref.match(
    /\/media\/(?:trips|articles)\/[^/]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i,
  );
  if (media) return media[1];
  const legacy = ref.match(
    /\/uploads\/[^/]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./i,
  );
  return legacy?.[1];
}

/**
 * Home / admin polaroid cover: always a full public still from the media model.
 * Never returns a dead `/uploads/...` path.
 */
function hasPublicFullStill(photo: PhotoMeta): boolean {
  // previewFilename is mapped from full.jpg (download role) in the media pipeline.
  return Boolean(photo.previewFilename?.includes("/media/"));
}

export function resolveTripCoverUrl(
  coverImage: string | undefined,
  photos: PhotoMeta[],
): string | undefined {
  const preferredId = mediaIdFromCoverRef(coverImage);
  if (preferredId) {
    const match = photos.find((p) => p.id === preferredId);
    if (match && hasPublicFullStill(match)) return photoFullPublicUrl(match);
  }

  if (
    coverImage &&
    !isLegacyUploadUrl(coverImage) &&
    coverImage.startsWith("/media/") &&
    coverImage.includes("/full.jpg")
  ) {
    // Keep stored full cover when the file may still be processing.
    return coverImage;
  }

  const readyFull = photos.find(hasPublicFullStill);
  if (readyFull) return photoFullPublicUrl(readyFull);

  if (photos[0]) return photoFullPublicUrl(photos[0]);
  return undefined;
}
