/**
 * Sync Desktop trip folders → public/uploads/{tripId}
 *
 * - Adds new images/videos (with EXIF device + exposure)
 * - Removes gallery items no longer in the source folders
 * - Skips DNG raw; prefers JPEG over HEIC when both exist
 * - Marks Beijing/featured/* as featured
 *
 * Usage: node scripts/import-desktop-photos.mjs
 */

import { promises as fs } from "fs";
import path from "path";
import { randomUUID, createHash } from "crypto";
import { fileURLToPath } from "url";
import sharp from "sharp";
import convert from "heic-convert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const UPLOADS = path.join(ROOT, "public", "uploads");

const TRIPS = [
  {
    id: "beijing",
    root: "/Users/jp1222/Desktop/Beijing",
    uploader: "Peng",
  },
  {
    id: "chinese-new-year-uah",
    root: "/Users/jp1222/Desktop/Chinese New Year（UAH）",
    uploader: "Peng",
  },
  {
    id: "dismals-canyon",
    root: "/Users/jp1222/Desktop/Dismals Canyon",
    uploader: "Peng",
  },
  {
    id: "fall-creek-falls",
    root: "/Users/jp1222/Desktop/Fall Creek Falls",
    uploader: "Peng",
  },
  {
    id: "mother-earth-troll-garden",
    root: "/Users/jp1222/Desktop/Mother Earth Troll Garden (May 29)",
    uploader: "Peng",
  },
  {
    id: "pingtan",
    root: "/Users/jp1222/Desktop/Pingtan",
    uploader: "Peng",
  },
  {
    id: "tom-lee-park",
    root: "/Users/jp1222/Desktop/Tom Lee Park（Independence Day on the River）",
    uploader: "Peng",
  },
];

const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".gif",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const SKIP_EXT = new Set([".dng", ".raf", ".arw", ".cr2", ".cr3", ".nef", ".orf"]);

const MAX_EDGE = 4096;
const JPEG_QUALITY = 90;
const MAX_IMAGE_BYTES = 80 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// ─── EXIF (mirrors src/lib/exif.ts) ─────────────────────────────────────────

function readU16(buf, o, le) {
  return le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
}
function readU32(buf, o, le) {
  return le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
}
function readI32(buf, o, le) {
  return le ? buf.readInt32LE(o) : buf.readInt32BE(o);
}

function readIfd(buf, ifdOff, le) {
  if (ifdOff + 2 > buf.length) return {};
  const n = readU16(buf, ifdOff, le);
  const tags = {};
  for (let i = 0; i < n; i++) {
    const e = ifdOff + 2 + i * 12;
    if (e + 12 > buf.length) break;
    const tag = readU16(buf, e, le);
    const type = readU16(buf, e + 2, le);
    const count = readU32(buf, e + 4, le);
    const valOff = e + 8;
    let value;
    if (type === 2 && count >= 1) {
      const so = count <= 4 ? valOff : readU32(buf, valOff, le);
      if (so + count <= buf.length) {
        value = buf
          .toString("utf8", so, so + count)
          .replace(/\0/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }
    } else if (type === 3 && count === 1) {
      value = readU16(buf, valOff, le);
    } else if (type === 3 && count > 1) {
      const so = count * 2 <= 4 ? valOff : readU32(buf, valOff, le);
      if (so + 2 <= buf.length) value = readU16(buf, so, le);
    } else if (type === 4 && count === 1) {
      value = readU32(buf, valOff, le);
    } else if (type === 5 && count === 1) {
      const so = readU32(buf, valOff, le);
      if (so + 8 <= buf.length) {
        const num = readU32(buf, so, le);
        const den = readU32(buf, so + 4, le);
        value = { num, den, v: den ? num / den : num };
      }
    } else if (type === 10 && count === 1) {
      const so = readU32(buf, valOff, le);
      if (so + 8 <= buf.length) {
        const num = readI32(buf, so, le);
        const den = readI32(buf, so + 4, le);
        value = { num, den, v: den ? num / den : num };
      }
    }
    tags[tag] = { type, count, value };
  }
  return tags;
}

function formatDeviceLabel(make, model) {
  const m = (make || "").replace(/\s+/g, " ").trim();
  const d = (model || "").replace(/\s+/g, " ").trim();
  if (!m && !d) return undefined;
  if (/apple/i.test(m) && d) return d;
  if (/^iphone/i.test(d) || /^ipad/i.test(d)) return d;
  if (/ricoh/i.test(m) || /ricoh/i.test(d)) {
    let body = d.replace(/^RICOH\s+/i, "").trim() || d;
    if (body && !/^ricoh/i.test(body)) body = `Ricoh ${body}`;
    return body || "Ricoh";
  }
  if (d && m) {
    const brand = m.split(/\s+/)[0];
    if (brand && d.toLowerCase().includes(brand.toLowerCase())) return d;
    return `${m} ${d}`.replace(/\s+/g, " ").trim();
  }
  return d || m || undefined;
}

function inferDeviceFromName(name) {
  const base = (name || "").trim();
  if (/^R\d{4,}/i.test(base) || /^R0\d+/i.test(base)) return "Ricoh GR IV HDF";
  if (/^IMG_\d+/i.test(base)) return "iPhone 15 Plus";
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-/i.test(base))
    return "iPhone 15 Plus";
  return undefined;
}

function formatShutterFromRational(num, den) {
  if (!den) return undefined;
  if (num === 1 && den > 1) return `1/${den}`;
  if (den === 1) return `${num}s`;
  if (num > den) {
    const s = num / den;
    return Number.isInteger(s) ? `${s}s` : `${Math.round(s * 10) / 10}s`;
  }
  if (num > 1) return `${num}/${den}`;
  return `1/${Math.round(den / num)}`;
}

function parseExifDateTime(s) {
  if (!s) return undefined;
  const m = s
    .trim()
    .match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function parseExifBuffer(exifBuf) {
  const out = {};
  if (!exifBuf || exifBuf.length < 12) return out;
  let offset = 0;
  if (exifBuf.toString("ascii", 0, 4) === "Exif") offset = 6;
  const buf = exifBuf.subarray(offset);
  if (buf.length < 8) return out;
  const endian = buf.toString("ascii", 0, 2);
  if (endian !== "II" && endian !== "MM") return out;
  const le = endian === "II";
  const ifd0 = readIfd(buf, readU32(buf, 4, le), le);
  const make = ifd0[0x010f]?.value;
  const model = ifd0[0x0110]?.value;
  if (make) out.make = make;
  if (model) out.model = model;
  out.device = formatDeviceLabel(make, model);

  const exifPtr = ifd0[0x8769]?.value;
  const exif = typeof exifPtr === "number" ? readIfd(buf, exifPtr, le) : {};

  const exp = exif[0x829a]?.value;
  if (exp && typeof exp === "object" && exp.num != null) {
    out.shutterSpeed = exp.v;
    out.shutter = formatShutterFromRational(exp.num, exp.den);
  }
  const f = exif[0x829d]?.value;
  if (f && typeof f === "object" && f.v > 0) {
    out.aperture = Math.round(f.v * 10) / 10;
  } else if (typeof f === "number" && f > 0) {
    out.aperture = Math.round(f * 10) / 10;
  }
  const iso = exif[0x8827]?.value ?? exif[0x8831]?.value;
  if (typeof iso === "number" && iso > 0) out.iso = Math.round(iso);

  const fl = exif[0x920a]?.value;
  if (fl && typeof fl === "object" && fl.v > 0) {
    out.focalLength = Math.round(fl.v * 10) / 10;
  }
  const fl35 = exif[0xa405]?.value;
  if (typeof fl35 === "number" && fl35 > 0) out.focalLength35 = fl35;
  const lens = exif[0xa434]?.value;
  if (typeof lens === "string" && lens) out.lens = lens;
  const dto = exif[0x9003]?.value;
  if (typeof dto === "string") out.takenAt = parseExifDateTime(dto);
  return out;
}

async function extractExif(raw, name) {
  try {
    const meta = await sharp(raw, {
      failOn: "none",
      limitInputPixels: 100_000_000,
    }).metadata();
    if (meta.exif) {
      const p = parseExifBuffer(Buffer.from(meta.exif));
      if (!p.device) p.device = inferDeviceFromName(name);
      return p;
    }
  } catch {
    /* ignore */
  }
  return { device: inferDeviceFromName(name) };
}

// ─── Image process ──────────────────────────────────────────────────────────

async function heicToJpeg(input) {
  const out = await convert({ buffer: input, format: "JPEG", quality: 0.92 });
  return Buffer.from(out);
}

function isHeic(name, mime) {
  if (/heic|heif/i.test(mime || "")) return true;
  return /\.hei[cf]$/i.test(name);
}

async function processImage(raw, name, mime) {
  let working = raw;
  if (isHeic(name, mime)) {
    try {
      working = await heicToJpeg(raw);
    } catch (err) {
      console.warn("  heic convert failed, trying sharp:", name, err.message);
    }
  }
  const { data, info } = await sharp(working, {
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
    .toColorspace("srgb")
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

// ─── Source walk ────────────────────────────────────────────────────────────

function stemKey(filename) {
  return path
    .basename(filename, path.extname(filename))
    .trim()
    .toLowerCase();
}

function extRank(ext) {
  const e = ext.toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return 0;
  if (e === ".png" || e === ".webp") return 1;
  if (e === ".heic" || e === ".heif") return 2;
  if (VIDEO_EXT.has(e)) return 3;
  return 4;
}

async function walkSources(root) {
  /** @type {Map<string, { path: string, name: string, ext: string, featured: boolean, isVideo: boolean }>} */
  const map = new Map();

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith(".")) continue;
        await walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (SKIP_EXT.has(ext)) continue;
      const isVideo = VIDEO_EXT.has(ext);
      const isImage = IMAGE_EXT.has(ext);
      if (!isVideo && !isImage) continue;

      const featured = /[/\\]featured[/\\]/i.test(full) || /\/featured$/i.test(path.dirname(full));
      const key = stemKey(ent.name);
      const prev = map.get(key);
      const cand = {
        path: full,
        name: ent.name,
        ext,
        featured: Boolean(featured),
        isVideo,
      };
      if (!prev) {
        map.set(key, cand);
        continue;
      }
      // Prefer non-video, then better ext rank, merge featured flag
      if (prev.isVideo && !cand.isVideo) {
        map.set(key, { ...cand, featured: prev.featured || cand.featured });
      } else if (!prev.isVideo && cand.isVideo) {
        prev.featured = prev.featured || cand.featured;
      } else if (extRank(cand.ext) < extRank(prev.ext)) {
        map.set(key, { ...cand, featured: prev.featured || cand.featured });
      } else {
        prev.featured = prev.featured || cand.featured;
      }
    }
  }

  await walk(root);
  return map;
}

function mimeFor(name, isVideo) {
  const ext = path.extname(name).toLowerCase();
  if (isVideo) {
    if (ext === ".mov") return "video/quicktime";
    if (ext === ".webm") return "video/webm";
    if (ext === ".m4v") return "video/x-m4v";
    return "video/mp4";
  }
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function ensureDir(tripId) {
  const dir = path.join(UPLOADS, tripId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function readPhotos(tripId) {
  const p = path.join(UPLOADS, tripId, "photos.json");
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return [];
  }
}

async function writePhotos(tripId, photos) {
  const p = path.join(UPLOADS, tripId, "photos.json");
  await fs.writeFile(p, JSON.stringify(photos, null, 2) + "\n", "utf8");
}

function applyExif(meta, exif) {
  if (exif.device) meta.device = exif.device;
  if (exif.aperture != null) meta.aperture = exif.aperture;
  if (exif.shutter) meta.shutter = exif.shutter;
  if (exif.iso != null) meta.iso = exif.iso;
  if (exif.focalLength != null) meta.focalLength = exif.focalLength;
  if (exif.focalLength35 != null) meta.focalLength35 = exif.focalLength35;
  if (exif.lens) meta.lens = exif.lens;
  if (exif.takenAt) meta.takenAt = exif.takenAt;
}

async function importOne(tripId, src, uploader) {
  const raw = await fs.readFile(src.path);
  if (src.isVideo) {
    if (raw.length > MAX_VIDEO_BYTES) {
      throw new Error(`video too large: ${src.name}`);
    }
  } else if (raw.length > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${src.name}`);
  }

  const id = randomUUID();
  const base = path.basename(src.name, path.extname(src.name)).trim() || "photo";
  const mime = mimeFor(src.name, src.isVideo);
  const exif = await extractExif(raw, src.name);

  let filename;
  let originalName;
  let mimeType;
  let size;

  if (src.isVideo) {
    const ext = path.extname(src.name).toLowerCase() || ".mp4";
    filename = `${id}${ext}`;
    originalName = `${base}${ext}`;
    mimeType = mime;
    size = raw.length;
    await fs.writeFile(path.join(UPLOADS, tripId, filename), raw);
  } else {
    const processed = await processImage(raw, src.name, mime);
    filename = `${id}.jpg`;
    originalName = `${base}.jpg`;
    mimeType = "image/jpeg";
    size = processed.buffer.length;
    await fs.writeFile(path.join(UPLOADS, tripId, filename), processed.buffer);
  }

  const meta = {
    id,
    tripId,
    filename,
    originalName,
    uploader,
    mimeType,
    size,
    uploadedAt: new Date().toISOString(),
  };
  applyExif(meta, exif);
  if (src.featured) {
    meta.featured = true;
    meta.featuredAt = new Date().toISOString();
  }
  return meta;
}

async function reextractExifOnto(meta, srcPath) {
  try {
    const raw = await fs.readFile(srcPath);
    const exif = await extractExif(raw, meta.originalName || path.basename(srcPath));
    applyExif(meta, exif);
  } catch {
    /* ignore */
  }
}

async function syncTrip(trip) {
  console.log(`\n========== ${trip.id} ==========`);
  if (!(await fs.stat(trip.root).catch(() => null))) {
    console.log("  MISSING source folder:", trip.root);
    return;
  }

  await ensureDir(trip.id);
  const sources = await walkSources(trip.root);
  console.log(`  source unique stems: ${sources.size}`);

  const existing = await readPhotos(trip.id);
  const byKey = new Map();
  for (const p of existing) {
    byKey.set(stemKey(p.originalName || p.filename), p);
  }

  const next = [];
  let kept = 0;
  let added = 0;
  let removed = 0;
  let refreshed = 0;
  let failed = 0;

  // Keep / refresh photos that still exist in source
  for (const [key, src] of sources) {
    const prev = byKey.get(key);
    if (prev) {
      // File still present — keep record, refresh EXIF + featured, verify file exists
      const disk = path.join(UPLOADS, trip.id, prev.filename);
      let ok = false;
      try {
        await fs.access(disk);
        ok = true;
      } catch {
        ok = false;
      }
      if (ok) {
        // Refresh EXIF from original source (more complete than processed)
        await reextractExifOnto(prev, src.path);
        if (src.featured) {
          prev.featured = true;
          prev.featuredAt = prev.featuredAt || new Date().toISOString();
        } else if (trip.id === "beijing") {
          // Featured folder is the only star source for Beijing
          delete prev.featured;
          delete prev.featuredAt;
        }
        next.push(prev);
        byKey.delete(key);
        kept++;
        refreshed++;
        continue;
      }
      // Disk missing — re-import
      byKey.delete(key);
    }

    try {
      const meta = await importOne(trip.id, src, trip.uploader);
      next.push(meta);
      added++;
      if (added % 20 === 0) {
        console.log(`  … added ${added}/${sources.size} (kept ${kept})`);
      }
    } catch (err) {
      failed++;
      console.warn(`  FAIL ${src.name}:`, err.message || err);
    }
  }

  // Anything left in byKey was removed from source → delete files
  for (const [, p] of byKey) {
    removed++;
    try {
      await fs.unlink(path.join(UPLOADS, trip.id, p.filename));
    } catch {
      /* already gone */
    }
  }

  // Sort: featured first, then takenAt/uploadedAt newest
  next.sort((a, b) => {
    const af = a.featured ? 1 : 0;
    const bf = b.featured ? 1 : 0;
    if (af !== bf) return bf - af;
    if (a.featured && b.featured) {
      const at = a.featuredAt ? new Date(a.featuredAt).getTime() : 0;
      const bt = b.featuredAt ? new Date(b.featuredAt).getTime() : 0;
      if (at !== bt) return bt - at;
    }
    const ta = new Date(a.takenAt || a.uploadedAt).getTime();
    const tb = new Date(b.takenAt || b.uploadedAt).getTime();
    return tb - ta;
  });

  await writePhotos(trip.id, next);

  // Cover: if trip cover points to missing file, leave trips.json alone (admin can fix)
  const devices = {};
  let withSettings = 0;
  for (const p of next) {
    devices[p.device || "(none)"] = (devices[p.device || "(none)"] || 0) + 1;
    if (p.aperture != null || p.shutter || p.iso != null) withSettings++;
  }

  console.log(
    `  done: total=${next.length} kept=${kept} added=${added} removed=${removed} failed=${failed} withExposure=${withSettings}`,
  );
  console.log("  devices:", devices);
}

async function main() {
  console.log("Import / sync Desktop → public/uploads");
  console.log("Root:", ROOT);
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const list = only.length
    ? TRIPS.filter((t) => only.includes(t.id))
    : TRIPS;

  for (const trip of list) {
    await syncTrip(trip);
  }
  console.log("\nAll trips finished.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
