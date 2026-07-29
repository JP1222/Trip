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

const IMAGE_VARIANTS = [
  { role: "thumb", filename: "thumb-480.webp", width: 480, format: "webp", quality: 72 },
  { role: "grid", filename: "grid-960.webp", width: 960, format: "webp", quality: 78 },
  {
    role: "preview",
    filename: "preview-1920.webp",
    width: 1920,
    format: "webp",
    quality: 82,
  },
  {
    role: "download",
    filename: "download-2560.jpg",
    width: 2560,
    format: "jpeg",
    quality: 85,
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
  const area = sourceAsset.isPublic ? "public" : "private";
  const raw = await storage.read(area, sourceAsset.storageKey);
  if (options.signal?.aborted) throw options.signal.reason;

  const [decoded, exif] = await Promise.all([
    decodeInput(media, raw, sourceAsset.mimeType),
    extractPhotoExif(raw, media.originalName).catch(() => ({})),
  ]);

  // Decode once up front so invalid, enormous, or unsupported files fail before publish.
  const inputMetadata = await sharp(decoded, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  }).metadata();
  if (!inputMetadata.width || !inputMetadata.height) {
    throw new Error("Image decoder did not report valid dimensions");
  }

  const assets: MediaAsset[] = [];
  for (const variant of IMAGE_VARIANTS) {
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
            effort: 4,
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

