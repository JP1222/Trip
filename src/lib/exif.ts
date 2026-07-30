/**
 * EXIF reader for camera model + exposure settings.
 * Parses IFD0 + ExifIFD from a sharp metadata.exif buffer (APP1 payload).
 */

export type PhotoExif = {
  /** Short device label, e.g. "iPhone 15 Plus" or "Ricoh GR IV HDF" */
  device?: string;
  make?: string;
  model?: string;
  /** f-number, e.g. 2.8 */
  aperture?: number;
  /** Display shutter, e.g. "1/125" or "2\"" */
  shutter?: string;
  /** Shutter in seconds */
  shutterSpeed?: number;
  iso?: number;
  /** Actual focal length mm */
  focalLength?: number;
  /** 35mm-equivalent focal length */
  focalLength35?: number;
  lens?: string;
  /** Capture time as ISO string when EXIF has DateTimeOriginal */
  takenAt?: string;
};

function readU16(buf: Buffer, o: number, le: boolean) {
  return le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
}

function readU32(buf: Buffer, o: number, le: boolean) {
  return le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
}

function readI32(buf: Buffer, o: number, le: boolean) {
  return le ? buf.readInt32LE(o) : buf.readInt32BE(o);
}

type IfdEntry = { type: number; count: number; value: unknown };

function readIfd(
  buf: Buffer,
  ifdOff: number,
  le: boolean,
): Record<number, IfdEntry> {
  if (ifdOff + 2 > buf.length) return {};
  const n = readU16(buf, ifdOff, le);
  const tags: Record<number, IfdEntry> = {};

  for (let i = 0; i < n; i++) {
    const e = ifdOff + 2 + i * 12;
    if (e + 12 > buf.length) break;
    const tag = readU16(buf, e, le);
    const type = readU16(buf, e + 2, le);
    const count = readU32(buf, e + 4, le);
    const valOff = e + 8;
    let value: unknown;

    if (type === 2 && count >= 1) {
      // ASCII
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
      // RATIONAL
      const so = readU32(buf, valOff, le);
      if (so + 8 <= buf.length) {
        const num = readU32(buf, so, le);
        const den = readU32(buf, so + 4, le);
        value = { num, den, v: den ? num / den : num };
      }
    } else if (type === 10 && count === 1) {
      // SRATIONAL
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

function rational(entry?: IfdEntry): number | undefined {
  if (!entry) return undefined;
  const v = entry.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "v" in v) {
    const n = (v as { v: number }).v;
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function rationalPair(
  entry?: IfdEntry,
): { num: number; den: number; v: number } | undefined {
  if (!entry?.value || typeof entry.value !== "object") return undefined;
  const o = entry.value as { num?: number; den?: number; v?: number };
  if (typeof o.num !== "number" || typeof o.den !== "number") return undefined;
  return { num: o.num, den: o.den, v: o.den ? o.num / o.den : o.num };
}

/** Format shutter seconds as "1/125" or "2s" */
export function formatShutter(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds >= 1) {
    const r = Math.round(seconds * 10) / 10;
    return Number.isInteger(r) ? `${r}s` : `${r}s`;
  }
  const inv = Math.round(1 / seconds);
  if (inv > 0 && Math.abs(1 / inv - seconds) / seconds < 0.05) {
    return `1/${inv}`;
  }
  // Fallback for odd fractions
  const den = Math.round(1 / seconds);
  return den > 0 ? `1/${den}` : `${seconds}s`;
}

export function formatShutterFromRational(
  num: number,
  den: number,
): string | undefined {
  if (!den) return undefined;
  if (num === 0) return undefined;
  if (num === 1 && den > 1) return `1/${den}`;
  if (den === 1) return `${num}s`;
  if (num > den) {
    const s = num / den;
    return Number.isInteger(s) ? `${s}s` : `${(Math.round(s * 10) / 10)}s`;
  }
  // e.g. 2/5 → reduce or show as decimal seconds / fraction
  if (num > 1) return `${num}/${den}`;
  return `1/${Math.round(den / num)}`;
}

/**
 * Format Make/Model into a short, human-readable device name.
 */
export function formatDeviceLabel(
  make?: string | null,
  model?: string | null,
): string | undefined {
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

/**
 * Infer device from original filename when EXIF is missing.
 */
export function inferDeviceFromName(originalName: string): string | undefined {
  const base = (originalName || "").trim();
  if (!base) return undefined;
  if (/^R\d{4,}/i.test(base) || /^R0\d+/i.test(base)) {
    return "Ricoh GR IV HDF";
  }
  if (/^IMG_\d+/i.test(base)) {
    return "iPhone 15 Plus";
  }
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-/i.test(base)) {
    return "iPhone 15 Plus";
  }
  return undefined;
}

/** EXIF DateTimeOriginal "YYYY:MM:DD HH:mm:ss" → ISO-ish UTC local wall time */
export function parseExifDateTime(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s
    .trim()
    .match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se] = m;
  // Keep as local wall-clock with Z omitted — store as ISO without timezone shift
  // so "01:00:25" stays "01:00:25". Use UTC stamp of the same digits.
  return `${y}-${mo}-${d}T${h}:${mi}:${se}`;
}

export function parseExifBuffer(exifBuf: Buffer): PhotoExif {
  const out: PhotoExif = {};
  if (!exifBuf || exifBuf.length < 12) return out;

  let offset = 0;
  if (exifBuf.toString("ascii", 0, 4) === "Exif") offset = 6;
  const buf = exifBuf.subarray(offset);
  if (buf.length < 8) return out;

  const endian = buf.toString("ascii", 0, 2);
  if (endian !== "II" && endian !== "MM") return out;
  const le = endian === "II";

  const ifd0 = readIfd(buf, readU32(buf, 4, le), le);
  const make = ifd0[0x010f]?.value as string | undefined;
  const model = ifd0[0x0110]?.value as string | undefined;
  if (make) out.make = make;
  if (model) out.model = model;
  out.device = formatDeviceLabel(make, model);

  const exifPtr = ifd0[0x8769]?.value;
  const exif =
    typeof exifPtr === "number" ? readIfd(buf, exifPtr, le) : ({} as Record<number, IfdEntry>);

  // ExposureTime 0x829A
  const expPair = rationalPair(exif[0x829a]);
  if (expPair) {
    out.shutterSpeed = expPair.v;
    out.shutter =
      formatShutterFromRational(expPair.num, expPair.den) ||
      formatShutter(expPair.v);
  }

  // FNumber 0x829D
  const f = rational(exif[0x829d]);
  if (f != null && f > 0) {
    out.aperture = Math.round(f * 10) / 10;
  }

  // ISO 0x8827 (PhotographicSensitivity) or 0x8831 / 0x8832
  // Type 3 SHORT may be count>1 — we already take the first short in readIfd.
  const isoRaw =
    exif[0x8827]?.value ?? exif[0x8831]?.value ?? exif[0x8832]?.value;
  if (typeof isoRaw === "number" && isoRaw > 0) out.iso = Math.round(isoRaw);

  // FocalLength 0x920A
  const fl = rational(exif[0x920a]);
  if (fl != null && fl > 0) {
    out.focalLength = Math.round(fl * 10) / 10;
  }

  // FocalLengthIn35mmFilm 0xA405
  const fl35 = exif[0xa405]?.value;
  if (typeof fl35 === "number" && fl35 > 0) out.focalLength35 = fl35;

  // LensModel 0xA434
  const lens = exif[0xa434]?.value;
  if (typeof lens === "string" && lens) out.lens = lens;

  // DateTimeOriginal 0x9003
  const dto = exif[0x9003]?.value;
  if (typeof dto === "string") {
    out.takenAt = parseExifDateTime(dto);
  }

  return out;
}

/**
 * One-line camera settings for UI chips:
 * "f/2.8 · 1/125 · ISO 1250 · 18mm (35mm eq.)"
 */
export function formatCameraSettings(exif: {
  aperture?: number;
  shutter?: string;
  iso?: number;
  focalLength?: number;
  focalLength35?: number;
}): string | undefined {
  const parts: string[] = [];
  if (exif.aperture != null) {
    const a =
      Number.isInteger(exif.aperture) ||
      Math.abs(exif.aperture * 10 - Math.round(exif.aperture * 10)) < 1e-6
        ? (Math.round(exif.aperture * 10) / 10).toString()
        : exif.aperture.toFixed(1);
    parts.push(`f/${a}`);
  }
  if (exif.shutter) parts.push(exif.shutter);
  if (exif.iso != null) parts.push(`ISO ${exif.iso}`);
  if (exif.focalLength != null) {
    const fl =
      exif.focalLength35 != null &&
      Math.abs(exif.focalLength35 - exif.focalLength) > 0.5
        ? `${trimNum(exif.focalLength)}mm · ${exif.focalLength35}mm eq.`
        : `${trimNum(exif.focalLength35 ?? exif.focalLength)}mm`;
    parts.push(fl);
  } else if (exif.focalLength35 != null) {
    parts.push(`${exif.focalLength35}mm eq.`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function trimNum(n: number): string {
  return Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05
    ? String(Math.round(n))
    : (Math.round(n * 10) / 10).toString();
}

function hasExposure(p: PhotoExif): boolean {
  return p.aperture != null || Boolean(p.shutter) || p.iso != null;
}

/**
 * Extract full EXIF from a raw image buffer via sharp.
 * For HEIC (common on iPhone), sharp often omits EXIF on Linux — after the
 * caller converts to JPEG we re-run this on the JPEG. On macOS, `sips` can
 * also dump a few keys when the buffer is a HEIC file.
 */
export async function extractPhotoExif(
  input: Buffer,
  originalName: string,
): Promise<PhotoExif> {
  let parsed: PhotoExif = {};
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(input, {
      failOn: "none",
      limitInputPixels: 100_000_000,
    }).metadata();

    if (meta.exif) {
      parsed = parseExifBuffer(Buffer.from(meta.exif));
    }
  } catch {
    // HEIC may fail before conversion — ignore
  }

  // macOS fallback for HEIC when sharp has no EXIF payload
  if (
    !hasExposure(parsed) &&
    process.platform === "darwin" &&
    /\.hei[cf]$/i.test(originalName)
  ) {
    try {
      const fromSips = await extractExifViaSips(input);
      parsed = { ...fromSips, ...parsed, device: parsed.device || fromSips.device };
    } catch {
      /* ignore */
    }
  }

  if (!parsed.device) {
    parsed.device = inferDeviceFromName(originalName);
  }
  return parsed;
}

/** Best-effort HEIC EXIF via macOS sips (import pipeline on developer Macs). */
async function extractExifViaSips(input: Buffer): Promise<PhotoExif> {
  const fs = await import("fs/promises");
  const os = await import("os");
  const path = await import("path");
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trip-exif-"));
  const src = path.join(dir, "in.heic");
  try {
    await fs.writeFile(src, input);
    // Convert with sips — macOS usually keeps EXIF on the JPEG.
    const jpg = path.join(dir, "out.jpg");
    await execFileAsync(
      "sips",
      ["-s", "format", "jpeg", src, "--out", jpg],
      { timeout: 60_000 },
    );
    const jpegBuf = await fs.readFile(jpg);
    const sharp = (await import("sharp")).default;
    const meta = await sharp(jpegBuf, { failOn: "none" }).metadata();
    if (meta.exif) return parseExifBuffer(Buffer.from(meta.exif));
    return {};
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}


