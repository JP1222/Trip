import path from "path";
import sharp from "sharp";

export type StrippedDownload = {
  buffer: Buffer;
  mimeType: string;
  /** Safe extension including dot, e.g. ".jpg" */
  ext: string;
};

/**
 * Re-encode an image with all EXIF / GPS / camera metadata removed.
 * Used for public downloads (privacy). Keeps orientation baked in.
 * Color is normalized to sRGB (no embedded ICC identity leakage either).
 */
export async function stripImageMetadata(
  input: Buffer,
): Promise<StrippedDownload> {
  const base = sharp(input, {
    failOn: "none",
    limitInputPixels: 100_000_000,
  }).rotate();

  const meta = await base.metadata();
  const format = (meta.format || "jpeg").toLowerCase();

  if (format === "png") {
    const buffer = await base.png({ compressionLevel: 8 }).toBuffer();
    return { buffer, mimeType: "image/png", ext: ".png" };
  }
  if (format === "webp") {
    const buffer = await base.webp({ quality: 90 }).toBuffer();
    return { buffer, mimeType: "image/webp", ext: ".webp" };
  }
  if (format === "gif") {
    // GIF re-encode via sharp loses animation; pass through as JPEG still
    const buffer = await base
      .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return { buffer, mimeType: "image/jpeg", ext: ".jpg" };
  }

  const buffer = await base
    .toColorspace("srgb")
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  return { buffer, mimeType: "image/jpeg", ext: ".jpg" };
}

/** Sanitize a download basename (no path / control chars). */
export function safeDownloadBasename(name: string, fallback = "photo"): string {
  const base =
    path.basename(name || fallback).replace(/\.[^.]+$/, "") || fallback;
  return base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 80) || fallback;
}
