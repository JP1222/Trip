import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import type { PhotoMeta } from "@/lib/types";
import { extractPhotoExif } from "@/lib/exif";
import { query, withTransaction } from "@/lib/db";
import { getArticle } from "@/lib/articles";
import { articleOwner, type MediaOwner } from "./owner";
import { localMediaStorage } from "./storage";
import {
  getMediaById,
  listPhotoMetaForOwner,
  mediaToPhotoMeta,
} from "./repository";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

/**
 * Register flat public files already on disk under
 * `articles/{articleId}/*.jpg` as ready media rows (no re-encode, no worker).
 * Skips nested pipeline paths like `articles/{id}/{mediaId}/v1/...`.
 */
export async function importLegacyArticleAlbumFiles(
  articleId: string,
): Promise<{ imported: number; skipped: number }> {
  const article = await getArticle(articleId);
  if (!article) return { imported: 0, skipped: 0 };

  const owner = articleOwner(articleId);
  await localMediaStorage.ensureRoots();
  const root = path.join(localMediaStorage.publicRoot, "articles", articleId);

  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return { imported: 0, skipped: 0 };
  }

  const existing = await listPhotoMetaForOwner(owner, { includePending: true });
  const knownKeys = new Set(
    existing.flatMap((p) => {
      const keys: string[] = [];
      for (const field of [
        p.filename,
        p.previewFilename,
        p.thumbnailFilename,
      ] as const) {
        const v = field;
        if (!v) continue;
        if (v.startsWith("/media/")) keys.push(v.slice("/media/".length));
        else if (v.startsWith("articles/")) keys.push(v);
      }
      return keys;
    }),
  );

  // Also skip storage keys already in media_assets for this article prefix.
  const { rows: assetRows } = await query<{ storage_key: string }>(
    `SELECT a.storage_key
     FROM media_assets a
     JOIN media m ON m.id = a.media_id
     WHERE m.article_id = $1`,
    [articleId],
  );
  for (const row of assetRows) knownKeys.add(row.storage_key);

  let imported = 0;
  let skipped = 0;

  for (const name of names) {
    if (!IMAGE_EXT.test(name)) {
      skipped += 1;
      continue;
    }
    const abs = path.join(root, name);
    let stat;
    try {
      stat = await fs.stat(abs);
      if (!stat.isFile()) {
        skipped += 1;
        continue;
      }
    } catch {
      skipped += 1;
      continue;
    }

    const storageKey = `articles/${articleId}/${name}`;
    if (knownKeys.has(storageKey)) {
      skipped += 1;
      continue;
    }

    const stem = path.parse(name).name;
    const id =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        stem,
      )
        ? stem
        : randomUUID();

    // Idempotent if this id was already claimed.
    const already = await getMediaById(id, { includeDeleted: true });
    if (already) {
      skipped += 1;
      continue;
    }

    let width: number | null = null;
    let height: number | null = null;
    let device: string | null = null;
    let aperture: number | null = null;
    let shutter: string | null = null;
    let iso: number | null = null;
    let takenAt: string | null = null;
    try {
      const buf = await fs.readFile(abs);
      const meta = await sharp(buf, { failOn: "none" }).metadata();
      width = meta.width || null;
      height = meta.height || null;
      const exif = await extractPhotoExif(buf, name);
      device = exif.device || null;
      aperture = exif.aperture ?? null;
      shutter = exif.shutter || null;
      iso = exif.iso ?? null;
      takenAt = exif.takenAt || null;
    } catch {
      /* still register */
    }

    try {
      await insertReadyPublicStill({
        owner,
        id,
        storageKey,
        originalName: name,
        mimeType: "image/jpeg",
        byteSize: stat.size,
        width,
        height,
        device,
        aperture,
        shutter,
        iso,
        takenAt,
        uploader: "Peng",
      });
      knownKeys.add(storageKey);
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  return { imported, skipped };
}

async function insertReadyPublicStill(input: {
  owner: MediaOwner;
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  device: string | null;
  aperture: number | null;
  shutter: string | null;
  iso: number | null;
  takenAt: string | null;
  uploader: string;
}): Promise<PhotoMeta> {
  if (input.owner.kind !== "article") {
    throw new Error("Legacy flat album import is article-only");
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO media (
         id, trip_id, article_id, kind, state, uploader, caption, original_name,
         source_mime_type, source_bytes, taken_at, device, aperture, shutter, iso,
         featured, featured_at
       ) VALUES (
         $1, NULL, $2, 'image', 'ready', $3, NULL, $4,
         $5, $6, $7, $8, $9, $10, $11,
         false, NULL
       )`,
      [
        input.id,
        input.owner.id,
        input.uploader,
        input.originalName,
        input.mimeType,
        input.byteSize,
        input.takenAt,
        input.device,
        input.aperture,
        input.shutter,
        input.iso,
      ],
    );
    await client.query(
      `INSERT INTO media_assets (
         media_id, role, storage_provider, storage_key, mime_type,
         byte_size, width, height, sha256, is_public
       ) VALUES (
         $1, 'download', 'local', $2, $3,
         $4, $5, $6, NULL, true
       )
       ON CONFLICT (storage_provider, storage_key) DO NOTHING`,
      [
        input.id,
        input.storageKey,
        input.mimeType,
        input.byteSize,
        input.width,
        input.height,
      ],
    );
  });

  const media = await getMediaById(input.id);
  if (!media) throw new Error("Imported media could not be read back");
  return mediaToPhotoMeta(media);
}
