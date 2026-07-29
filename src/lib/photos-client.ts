/** Client-safe helpers (no Node fs) */

import type { PhotoMeta } from "./types";

export function photoPublicUrl(tripId: string, filename: string) {
  return `/uploads/${tripId}/${filename}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One-line exposure settings for the lightbox / chips:
 * "f/2.8 · 1/125 · ISO 1250 · 18mm · 35mm eq."
 */
export function formatCameraSettings(
  photo: Pick<
    PhotoMeta,
    "aperture" | "shutter" | "iso" | "focalLength" | "focalLength35"
  >,
): string | undefined {
  const parts: string[] = [];
  if (photo.aperture != null) {
    const a =
      Math.abs(photo.aperture * 10 - Math.round(photo.aperture * 10)) < 1e-6
        ? (Math.round(photo.aperture * 10) / 10).toString()
        : photo.aperture.toFixed(1);
    parts.push(`f/${a}`);
  }
  if (photo.shutter) parts.push(photo.shutter);
  if (photo.iso != null) parts.push(`ISO ${photo.iso}`);
  if (photo.focalLength != null) {
    const fl = trimFocal(photo.focalLength);
    if (
      photo.focalLength35 != null &&
      Math.abs(photo.focalLength35 - photo.focalLength) > 0.5
    ) {
      parts.push(`${fl}mm · ${photo.focalLength35}mm eq.`);
    } else {
      parts.push(`${trimFocal(photo.focalLength35 ?? photo.focalLength)}mm`);
    }
  } else if (photo.focalLength35 != null) {
    parts.push(`${photo.focalLength35}mm eq.`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function trimFocal(n: number): string {
  return Math.abs(n - Math.round(n)) < 0.05
    ? String(Math.round(n))
    : (Math.round(n * 10) / 10).toString();
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|hei[cf]|avif|bmp|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)$/i;
/** Apple Live companion is almost always QuickTime .mov */
const LIVE_PAIR_VIDEO_EXT = /\.(mov|mp4|m4v)$/i;

/** True when this media item is a video (mime or filename). */
export function isVideoMedia(
  media: Pick<PhotoMeta, "mimeType" | "filename" | "originalName"> | string,
): boolean {
  if (typeof media === "string") {
    return media.startsWith("video/") || VIDEO_EXT.test(media);
  }
  const mime = (media.mimeType || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  return VIDEO_EXT.test(media.filename) || VIDEO_EXT.test(media.originalName);
}

/** True when this photo has an Apple Live Photo companion video. */
export function isLivePhoto(
  media: Pick<PhotoMeta, "liveVideoFilename"> | null | undefined,
): boolean {
  return Boolean(media?.liveVideoFilename);
}

export function liveVideoPublicUrl(
  tripId: string,
  liveVideoFilename: string,
): string {
  return photoPublicUrl(tripId, liveVideoFilename);
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return VIDEO_EXT.test(file.name);
}

export function isMediaFile(file: File): boolean {
  return isImageFile(file) || isVideoFile(file);
}

/** Basename without extension, lowercased — used to pair Live Photo files. */
export function mediaBasename(name: string): string {
  return name.replace(/\.[^.]+$/, "").toLowerCase().trim();
}

export function isLivePairVideoFile(file: File): boolean {
  if (!isVideoFile(file)) return false;
  const mime = (file.type || "").toLowerCase();
  if (
    mime === "video/quicktime" ||
    mime === "video/mp4" ||
    mime === "video/x-m4v"
  ) {
    return true;
  }
  return LIVE_PAIR_VIDEO_EXT.test(file.name);
}

/**
 * One upload unit after Live Photo pairing.
 * - live: still + companion .mov → one gallery item
 * - single: regular photo or standalone video
 */
export type MediaUploadUnit =
  | { kind: "live"; image: File; video: File }
  | { kind: "single"; file: File };

/**
 * Pair Apple Live Photos by matching basename
 * (e.g. IMG_1234.HEIC + IMG_1234.MOV → one Live Photo).
 * Unmatched images/videos stay as singles.
 */
export function pairLivePhotoFiles(files: File[]): MediaUploadUnit[] {
  const images = new Map<string, File[]>();
  const videos = new Map<string, File[]>();
  const order: string[] = [];

  for (const file of files) {
    if (!isMediaFile(file)) continue;
    const base = mediaBasename(file.name) || file.name.toLowerCase();
    if (!images.has(base) && !videos.has(base)) order.push(base);

    if (isImageFile(file)) {
      const list = images.get(base) || [];
      list.push(file);
      images.set(base, list);
    } else if (isVideoFile(file)) {
      const list = videos.get(base) || [];
      list.push(file);
      videos.set(base, list);
    }
  }

  const units: MediaUploadUnit[] = [];
  const usedVideo = new WeakSet<File>();
  const usedImage = new WeakSet<File>();

  for (const base of order) {
    const imgs = images.get(base) || [];
    const vids = (videos.get(base) || []).filter(isLivePairVideoFile);

    let vi = 0;
    for (const img of imgs) {
      if (usedImage.has(img)) continue;
      while (vi < vids.length && usedVideo.has(vids[vi])) vi += 1;
      const vid = vi < vids.length ? vids[vi] : null;
      if (vid) {
        usedImage.add(img);
        usedVideo.add(vid);
        units.push({ kind: "live", image: img, video: vid });
        vi += 1;
      }
    }
  }

  for (const file of files) {
    if (!isMediaFile(file)) continue;
    if (usedImage.has(file) || usedVideo.has(file)) continue;
    units.push({ kind: "single", file });
  }

  return units;
}

/** Display label for an upload unit in the picker list. */
export function mediaUnitLabel(unit: MediaUploadUnit): string {
  if (unit.kind === "live") {
    return `${unit.image.name} + LIVE`;
  }
  return unit.file.name;
}

export function mediaUnitKey(unit: MediaUploadUnit): string {
  if (unit.kind === "live") {
    return `live::${unit.image.name}::${unit.image.size}::${unit.video.name}::${unit.video.size}`;
  }
  return `single::${unit.file.name}::${unit.file.size}::${unit.file.lastModified}`;
}

/** Total bytes for size checks / progress. */
export function mediaUnitBytes(unit: MediaUploadUnit): number {
  if (unit.kind === "live") return unit.image.size + unit.video.size;
  return unit.file.size;
}
