import convert from "heic-convert";
import sharp from "sharp";

/** Long edge cap — keeps phone 48MP dumps web-friendly */
const MAX_EDGE = 4096;
const JPEG_QUALITY = 90;

export type ProcessedImage = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  ext: ".jpg";
  width: number;
  height: number;
  /** Original was HEIC/HEIF or needed color/tone normalization */
  converted: boolean;
};

const HEIC_MIME = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

function isHeic(name: string, mime: string): boolean {
  if (HEIC_MIME.has(mime.toLowerCase())) return true;
  return /\.hei[cf]$/i.test(name);
}

/**
 * Decode HEIC (Apple / HEVC) via libheif-js when sharp can't.
 * Returns a JPEG buffer from the primary image (SDR base of HDR HEIC).
 */
async function heicToJpeg(input: Buffer): Promise<Buffer> {
  const out = await convert({
    buffer: input,
    format: "JPEG",
    quality: 0.92,
  });
  return Buffer.from(out);
}

/**
 * Normalize uploads for the web:
 * - HEIC/HEIF → JPEG (browsers can't show Apple HEIC reliably)
 * - Auto-rotate from EXIF
 * - Display P3 / wide gamut → sRGB
 * - HDR gain-map sources: keep the SDR primary layer for universal display
 * - Cap long edge, mozjpeg encode
 */
export async function processUploadImage(
  input: Buffer,
  originalName: string,
  mimeType: string,
): Promise<ProcessedImage> {
  let working = input;
  let converted = false;

  if (isHeic(originalName, mimeType)) {
    try {
      working = await heicToJpeg(input);
      converted = true;
    } catch (err) {
      // Fall through to sharp — some builds can decode HEIF/AVIF
      const msg = err instanceof Error ? err.message : "HEIC decode failed";
      console.warn("[image-process] heic-convert failed, trying sharp:", msg);
    }
  }

  try {
    const pipeline = sharp(working, {
      failOn: "none",
      // Limit decoder memory on huge phone dumps
      limitInputPixels: 100_000_000,
    })
      // Apply EXIF orientation, then strip orientation tag
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      // Wide-gamut (Display P3) and odd profiles → sRGB for consistent web color
      .toColorspace("srgb")
      .jpeg({
        quality: JPEG_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      mimeType: "image/jpeg",
      ext: ".jpg",
      width: info.width,
      height: info.height,
      converted:
        converted ||
        !/^image\/jpe?g$/i.test(mimeType) ||
        !/\.jpe?g$/i.test(originalName),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image processing failed";
    throw new Error(
      `Could not process image (${originalName}): ${msg}. Try exporting as JPG from Photos.`,
    );
  }
}

/** Prefer a .jpg download name after server-side conversion */
export function webSafeDownloadName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.jpg`;
}
