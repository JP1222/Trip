import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { PhotoMeta } from "./types";
import { processUploadImage } from "./image-process";

const uploadsRoot = path.join(process.cwd(), "public", "uploads");

const MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/gif",
  "image/avif",
  "image/tiff",
  "image/bmp",
]);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|hei[cf]|avif|bmp|tiff?)$/i;

function tripDir(tripId: string) {
  return path.join(uploadsRoot, tripId);
}

function metaPath(tripId: string) {
  return path.join(tripDir(tripId), "photos.json");
}

async function ensureTripDir(tripId: string) {
  await fs.mkdir(tripDir(tripId), { recursive: true });
  try {
    await fs.access(metaPath(tripId));
  } catch {
    await fs.writeFile(metaPath(tripId), "[]", "utf-8");
  }
}

export async function getPhotos(tripId: string): Promise<PhotoMeta[]> {
  await ensureTripDir(tripId);
  const raw = await fs.readFile(metaPath(tripId), "utf-8");
  const photos = JSON.parse(raw) as PhotoMeta[];
  return photos.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );
}

export async function getAllPhotos(tripIds: string[]): Promise<PhotoMeta[]> {
  const lists = await Promise.all(tripIds.map((id) => getPhotos(id)));
  return lists
    .flat()
    .sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
}

function isAllowedImage(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (ALLOWED_MIME.has(mime) || mime.startsWith("image/")) return true;
  // Empty MIME from some mobile/folder picks — trust extension
  return IMAGE_EXT.test(file.name);
}

export async function savePhoto(
  tripId: string,
  file: File,
  uploader: string,
  caption?: string,
): Promise<PhotoMeta> {
  await ensureTripDir(tripId);

  if (!isAllowedImage(file)) {
    throw new Error("Only image files are supported");
  }

  if (file.size > MAX_BYTES) {
    throw new Error("Each image must be under 20MB");
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const processed = await processUploadImage(
    raw,
    file.name,
    file.type || "application/octet-stream",
  );

  const id = randomUUID();
  const filename = `${id}${processed.ext}`;
  await fs.writeFile(path.join(tripDir(tripId), filename), processed.buffer);

  // Keep human-readable name but use .jpg after conversion (HEIC → jpg, etc.)
  const base =
    path.basename(file.name, path.extname(file.name)).trim() || "photo";
  const originalName = `${base}.jpg`;

  const meta: PhotoMeta = {
    id,
    tripId,
    filename,
    originalName,
    uploader: uploader.trim() || "Anonymous traveler",
    caption: caption?.trim() || undefined,
    mimeType: processed.mimeType,
    size: processed.buffer.length,
    uploadedAt: new Date().toISOString(),
  };

  const photos = await getPhotos(tripId);
  photos.unshift(meta);
  await fs.writeFile(metaPath(tripId), JSON.stringify(photos, null, 2), "utf-8");
  return meta;
}

export function photoPublicUrl(tripId: string, filename: string) {
  return `/uploads/${tripId}/${filename}`;
}

export async function deletePhoto(
  tripId: string,
  photoId: string,
): Promise<boolean> {
  await ensureTripDir(tripId);
  const photos = await getPhotos(tripId);
  const photo = photos.find((p) => p.id === photoId);
  if (!photo) return false;

  const next = photos.filter((p) => p.id !== photoId);
  await fs.writeFile(metaPath(tripId), JSON.stringify(next, null, 2), "utf-8");

  try {
    await fs.unlink(path.join(tripDir(tripId), photo.filename));
  } catch {
    // file may already be gone
  }
  return true;
}

export async function updatePhotoCaption(
  tripId: string,
  photoId: string,
  caption: string,
): Promise<PhotoMeta | null> {
  await ensureTripDir(tripId);
  const photos = await getPhotos(tripId);
  const index = photos.findIndex((p) => p.id === photoId);
  if (index < 0) return null;
  photos[index] = {
    ...photos[index],
    caption: caption.trim() || undefined,
  };
  await fs.writeFile(metaPath(tripId), JSON.stringify(photos, null, 2), "utf-8");
  return photos[index];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
