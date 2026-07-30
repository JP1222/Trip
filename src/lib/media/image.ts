import convert from "heic-convert";
import sharp from "sharp";
import { extractPhotoExif } from "@/lib/exif";
import { localMediaStorage, mediaAssetKey, type LocalMediaStorage } from "./storage";
import type {
  MediaAsset,
  MediaAssetRole,
  MediaWithAssets,
  ProcessedMediaPatch,
} from "./types";

const MAX_INPUT_PIXELS = 100_000_000;

/**
 * List/admin derivative only (longest edge 1080).
 * Lightbox preview + download use a full-resolution public `full.jpg` (no downscale).
 * No thumb-720 — list uses grid only.
 */
const LIST_VARIANTS = [
  {
    role: "grid" as const,
    filename: "grid-1080.webp",
    width: 1080,
    format: "webp" as const,
    quality: 88,
  },
] as const satisfies ReadonlyArray<{
  role: MediaAssetRole;
  filename: string;
  width: number;
  format: "webp" | "jpeg";
  quality: number;
}>;

function isHeic(media: MediaWithAssets, sourceMimeType: string): boolean {
  return (
    /image\/hei[cf]/i.test(sourceMimeType) ||
    /\.hei[cf]$/i.test(media.originalName)
  );
}

async function decodeInput(
  media: MediaWithAssets,
  source: Buffer,
  sourceMimeType: string,
): Promise<Buffer> {
  if (!isHeic(media, sourceMimeType)) return source;
  const converted = await convert({
    buffer: source,
    format: "JPEG",
    quality: 0.95,
  });
  return Buffer.from(converted);
}

function sourceImageAsset(media: MediaWithAssets): MediaAsset {
  const asset = media.assets.original || media.assets.legacy_display;
  if (!asset) throw new Error(`Media ${media.id} has no still-image source asset`);
  return asset;
}

function exifPatch(exif: Awaited<ReturnType<typeof extractPhotoExif>>): ProcessedMediaPatch {
  return {
    device: exif.device,
    aperture: exif.aperture,
    shutter: exif.shutter,
    iso: exif.iso,
    focalLength: exif.focalLength,
    focalLength35: exif.focalLength35,
    lens: exif.lens,
    takenAt: exif.takenAt,
  };
}

export type ImageProcessingResult = {
  assets: MediaAsset[];
  metadata: ProcessedMediaPatch;
};

export async function generateImageVariants(
  media: MediaWithAssets,
  options: { storage?: LocalMediaStorage; signal?: AbortSignal } = {},
): Promise<ImageProcessingResult> {
  const storage = options.storage || localMediaStorage;
  const sourceAsset = sourceImageAsset(media);
  if (options.signal?.aborted) throw options.signal.reason;
  const raw = await storage.readAsset(sourceAsset);
  if (options.signal?.aborted) throw options.signal.reason;

  const decoded = await decodeInput(media, raw, sourceAsset.mimeType);
  if (options.signal?.aborted) throw options.signal.reason;

  // Prefer EXIF from the raw capture (HEIC/JPEG). If HEIC→JPEG conversion
  // produced a buffer that still carries EXIF (e.g. macOS sips), merge that
  // too — many iPhone imports only get exposure tags after convert.
  let exif = await extractPhotoExif(raw, media.originalName).catch(() => ({}));
  if (
    decoded !== raw &&
    (exif as { aperture?: number }).aperture == null &&
    !(exif as { shutter?: string }).shutter &&
    (exif as { iso?: number }).iso == null
  ) {
    const fromDecoded = await extractPhotoExif(
      decoded,
      media.originalName.replace(/\.hei[cf]$/i, ".jpg"),
    ).catch(() => ({}));
    exif = { ...fromDecoded, ...exif };
  }

  const inputMetadata = await sharp(decoded, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  }).metadata();
  if (!inputMetadata.width || !inputMetadata.height) {
    throw new Error("Image decoder did not report valid dimensions");
  }

  const assets: MediaAsset[] = [];

  // Full-resolution public still — used for lightbox preview + download (no resize).
  if (options.signal?.aborted) throw options.signal.reason;
  // Keep EXIF on the public full still when the decoded buffer still carries it
  // (e.g. JPEG with APP1). HEIC converted without EXIF stays clean. Download
  // route still strips GPS for privacy on explicit download.
  const fullPipeline = sharp(decoded, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .toColorspace("srgb");
  if (inputMetadata.exif) {
    fullPipeline.withMetadata();
  }
  const full = await fullPipeline
    .jpeg({
      quality: 92,
      mozjpeg: true,
      chromaSubsampling: "4:2:0",
    })
    .toBuffer({ resolveWithObject: true });
  const fullKey = mediaAssetKey(
    media.tripId,
    media.id,
    media.version,
    "full.jpg",
  );
  const fullPublished = await storage.writeAtomic("public", fullKey, full.data);
  // One public full-size file. API maps both preview + download fields to this role
  // (storage_key is unique — cannot insert two roles for the same key).
  assets.push({
    mediaId: media.id,
    role: "download",
    storageProvider: "local",
    storageKey: fullKey,
    mimeType: "image/jpeg",
    byteSize: fullPublished.byteSize,
    width: full.info.width,
    height: full.info.height,
    sha256: fullPublished.sha256,
    isPublic: true,
  });

  for (const variant of LIST_VARIANTS) {
    if (options.signal?.aborted) throw options.signal.reason;
    let pipeline = sharp(decoded, {
      failOn: "warning",
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: variant.width,
        height: variant.width,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColorspace("srgb");

    pipeline =
      variant.format === "webp"
        ? pipeline.webp({
            quality: variant.quality,
            effort: 3,
            smartSubsample: true,
          })
        : pipeline.jpeg({
            quality: variant.quality,
            mozjpeg: true,
            chromaSubsampling: "4:2:0",
          });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const storageKey = mediaAssetKey(
      media.tripId,
      media.id,
      media.version,
      variant.filename,
    );
    const published = await storage.writeAtomic("public", storageKey, data);
    assets.push({
      mediaId: media.id,
      role: variant.role,
      storageProvider: "local",
      storageKey,
      mimeType: variant.format === "webp" ? "image/webp" : "image/jpeg",
      byteSize: published.byteSize,
      width: info.width,
      height: info.height,
      sha256: published.sha256,
      isPublic: true,
    });
  }

  return { assets, metadata: exifPatch(exif) };
}
