import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import convert from "heic-convert";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

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
 * macOS sips uses Apple codecs — best Display P3 / Smart HDR → JPEG
 * tone mapping for iPhone HEIC (keeps P3 ICC). Unavailable on Linux servers.
 */
async function heicToJpegViaSips(input: Buffer): Promise<Buffer | null> {
  if (process.platform !== "darwin") return null;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trip-heic-"));
  const src = path.join(dir, "in.heic");
  const out = path.join(dir, "out.jpg");
  try {
    await fs.writeFile(src, input);
    await execFileAsync(
      "sips",
      ["-s", "format", "jpeg", "-s", "formatOptions", "92", src, "--out", out],
      { timeout: 120_000 },
    );
    return await fs.readFile(out);
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Decode HEIC via libheif-js. Often only the SDR base layer (no gain map),
 * and may drop Display P3 — prefer sips on macOS when available.
 */
async function heicToJpegLibheif(input: Buffer): Promise<Buffer> {
  const out = await convert({
    buffer: input,
    format: "JPEG",
    quality: 0.92,
  });
  return Buffer.from(out);
}

async function heicToJpeg(input: Buffer): Promise<Buffer> {
  const viaSips = await heicToJpegViaSips(input);
  if (viaSips?.length) return viaSips;
  return heicToJpegLibheif(input);
}

/**
 * Normalize uploads for the web:
 * - HEIC/HEIF → JPEG (browsers can't show Apple HEIC reliably)
 * - Prefer macOS sips so iPhone Display P3 / Smart HDR tone looks closer to Photos
 * - Auto-rotate from EXIF
 * - Keep ICC profile (Display P3) for wide-gamut screens — do NOT force sRGB
 * - Cap long edge, mozjpeg encode
 *
 * Note: True HDR gain maps are not portable as plain JPEG on all browsers.
 * We preserve the best SDR+P3 bake from Apple's decoder when possible.
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
      const msg = err instanceof Error ? err.message : "HEIC decode failed";
      console.warn("[image-process] HEIC convert failed, trying sharp:", msg);
    }
  }

  try {
    const pipeline = sharp(working, {
      failOn: "none",
      limitInputPixels: 100_000_000,
    })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      // Keep Display P3 / embedded ICC — forcing sRGB flattens iPhone colors
      .keepIccProfile()
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
  const base = path.basename(name || fallback).replace(/\.[^.]+$/, "") || fallback;
  return base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 80) || fallback;
}
