/**
 * Recover camera EXIF (aperture / shutter / ISO / focal / takenAt / device)
 * from the original Desktop trip folders into Postgres `media` rows.
 *
 * Why this works: import re-encoded many iPhone HEICs to JPEG without EXIF.
 * The Desktop sources still have HEIC/JPEG with full metadata.
 *
 * Match key: case-insensitive stem of original_name ↔ desktop filename
 * (IMG_2996.jpg ↔ IMG_2996.HEIC).
 *
 * Usage (local Mac, with Desktop folders present):
 *   set -a && source .env.local && set +a
 *   pnpm exec tsx scripts/reextract-exif-from-desktop.ts           # dry-run
 *   pnpm exec tsx scripts/reextract-exif-from-desktop.ts --commit  # write DB
 *   pnpm exec tsx scripts/reextract-exif-from-desktop.ts --commit beijing
 */

import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import pg from "pg";
import sharp from "sharp";
import {
  extractPhotoExif,
  formatDeviceLabel,
  inferDeviceFromName,
  parseExifBuffer,
  type PhotoExif,
} from "../src/lib/exif";

const execFileAsync = promisify(execFile);

const TRIPS: { id: string; root: string }[] = [
  { id: "beijing", root: "/Users/jp1222/Desktop/Beijing" },
  {
    id: "chinese-new-year-uah",
    root: "/Users/jp1222/Desktop/Chinese New Year（UAH）",
  },
  { id: "dismals-canyon", root: "/Users/jp1222/Desktop/Dismals Canyon" },
  { id: "fall-creek-falls", root: "/Users/jp1222/Desktop/Fall Creek Falls" },
  {
    id: "mother-earth-troll-garden",
    root: "/Users/jp1222/Desktop/Mother Earth Troll Garden (May 29)",
  },
  { id: "pingtan", root: "/Users/jp1222/Desktop/Pingtan" },
  {
    id: "tom-lee-park",
    root: "/Users/jp1222/Desktop/Tom Lee Park（Independence Day on the River）",
  },
];

const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
]);

function stem(name: string): string {
  return path
    .basename(name, path.extname(name))
    .trim()
    .toLowerCase();
}

function hasExposure(p: PhotoExif): boolean {
  return p.aperture != null || Boolean(p.shutter) || p.iso != null;
}

async function walkImages(root: string): Promise<Map<string, string>> {
  const map = new Map<string, string>(); // stem -> absolute path (prefer HEIC)
  async function walk(dir: string) {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;
      const key = stem(ent.name);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, full);
        continue;
      }
      // Prefer HEIC (richest EXIF) over re-exported JPEG
      const prevExt = path.extname(prev).toLowerCase();
      if (
        (ext === ".heic" || ext === ".heif") &&
        prevExt !== ".heic" &&
        prevExt !== ".heif"
      ) {
        map.set(key, full);
      }
    }
  }
  await walk(root);
  return map;
}

async function heicToJpegSips(input: Buffer): Promise<Buffer | null> {
  if (process.platform !== "darwin") return null;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trip-reexif-"));
  const src = path.join(dir, "in.heic");
  const out = path.join(dir, "out.jpg");
  try {
    await fs.writeFile(src, input);
    await execFileAsync(
      "sips",
      ["-s", "format", "jpeg", src, "--out", out],
      { timeout: 120_000 },
    );
    return await fs.readFile(out);
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractFromFile(filePath: string): Promise<PhotoExif> {
  const raw = await fs.readFile(filePath);
  const name = path.basename(filePath);
  let exif = await extractPhotoExif(raw, name);

  if (!hasExposure(exif) && /\.hei[cf]$/i.test(name)) {
    const jpeg = await heicToJpegSips(raw);
    if (jpeg) {
      try {
        const meta = await sharp(jpeg, { failOn: "none" }).metadata();
        if (meta.exif) {
          const p = parseExifBuffer(Buffer.from(meta.exif));
          exif = {
            ...p,
            ...exif,
            device:
              exif.device ||
              p.device ||
              formatDeviceLabel(p.make, p.model) ||
              inferDeviceFromName(name),
          };
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!exif.device) exif.device = inferDeviceFromName(name);
  return exif;
}

type MediaRow = {
  id: string;
  trip_id: string;
  original_name: string;
  aperture: number | null;
  shutter: string | null;
  iso: number | null;
  device: string | null;
};

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const onlyTrip = args.find((a) => !a.startsWith("--"));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Set DATABASE_URL (e.g. source .env.local)");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    let recovered = 0;
    let matched = 0;
    let skippedHas = 0;
    let noSource = 0;
    let noExif = 0;

    for (const trip of TRIPS) {
      if (onlyTrip && trip.id !== onlyTrip) continue;
      console.log(`\n=== ${trip.id} ===`);
      const exists = await fs.stat(trip.root).catch(() => null);
      if (!exists) {
        console.log("  Desktop folder missing:", trip.root);
        continue;
      }

      const sources = await walkImages(trip.root);
      console.log(`  desktop stills: ${sources.size}`);

      const { rows } = await pool.query<MediaRow>(
        `SELECT id, trip_id, original_name, aperture, shutter, iso, device
         FROM media
         WHERE trip_id = $1
           AND state = 'ready'
           AND kind IN ('image', 'live_photo')
         ORDER BY original_name`,
        [trip.id],
      );

      for (const row of rows) {
        if (row.aperture != null || row.shutter || row.iso != null) {
          skippedHas += 1;
          continue;
        }
        const srcPath = sources.get(stem(row.original_name));
        if (!srcPath) {
          noSource += 1;
          continue;
        }
        matched += 1;
        let exif: PhotoExif;
        try {
          exif = await extractFromFile(srcPath);
        } catch (err) {
          console.warn(
            `  fail ${row.original_name}:`,
            err instanceof Error ? err.message : err,
          );
          noExif += 1;
          continue;
        }
        if (!hasExposure(exif)) {
          noExif += 1;
          continue;
        }

        recovered += 1;
        const summary = [
          exif.device,
          exif.aperture != null ? `f/${exif.aperture}` : null,
          exif.shutter,
          exif.iso != null ? `ISO ${exif.iso}` : null,
          exif.focalLength != null ? `${exif.focalLength}mm` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        console.log(
          `  ${commit ? "UPDATE" : "would"} ${row.original_name} ← ${path.basename(srcPath)}  ${summary}`,
        );

        if (!commit) continue;

        await pool.query(
          `UPDATE media SET
             device = COALESCE($2, device),
             aperture = COALESCE($3, aperture),
             shutter = COALESCE($4, shutter),
             iso = COALESCE($5, iso),
             focal_length = COALESCE($6, focal_length),
             focal_length_35 = COALESCE($7, focal_length_35),
             lens = COALESCE($8, lens),
             taken_at = COALESCE($9, taken_at),
             updated_at = now()
           WHERE id = $1`,
          [
            row.id,
            exif.device || null,
            exif.aperture ?? null,
            exif.shutter || null,
            exif.iso ?? null,
            exif.focalLength ?? null,
            exif.focalLength35 ?? null,
            exif.lens || null,
            exif.takenAt || null,
          ],
        );
      }
    }

    console.log("\n--- summary ---");
    console.log("already had exposure:", skippedHas);
    console.log("matched desktop file:", matched);
    console.log("recovered exposure:", recovered);
    console.log("no desktop match:", noSource);
    console.log("matched but no EXIF:", noExif);
    console.log(commit ? "DB updated." : "Dry-run only. Pass --commit to write.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
