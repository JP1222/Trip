import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import {
  assertStorageKey,
  localMediaStorage,
} from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

const CACHE_CONTROL = "public, max-age=31536000, immutable";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Public media derivatives (grid-1080, full.jpg, live-playback, posters, …).
 * Production: Traefik routes /media/ to the nginx `media` service first.
 * This route is the local-dev / fallback path when nginx is not in front.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const segments = (await ctx.params).path;
  if (!segments?.length) {
    return new NextResponse("Not found", { status: 404 });
  }

  let key: string;
  try {
    key = assertStorageKey(segments.join("/"));
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  // Block staging/trash from public serving
  if (
    key.startsWith(".staging/") ||
    key.startsWith(".trash/") ||
    key.includes("/.")
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  let filePath: string;
  try {
    filePath = localMediaStorage.absolutePath("public", key);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!stat.isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || "application/octet-stream";
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": CACHE_CONTROL,
      },
    });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
    ETag: etag,
    "Last-Modified": stat.mtime.toUTCString(),
  };

  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${stat.size}`,
        },
      });
    }

    let start = match[1] === "" ? NaN : Number(match[1]);
    let end = match[2] === "" ? NaN : Number(match[2]);

    if (Number.isNaN(start) && Number.isNaN(end)) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }

    // suffix: bytes=-500
    if (Number.isNaN(start)) {
      const suffix = end;
      start = Math.max(0, stat.size - suffix);
      end = stat.size - 1;
    } else if (Number.isNaN(end)) {
      end = stat.size - 1;
    }

    if (
      start < 0 ||
      end < start ||
      start >= stat.size ||
      !Number.isFinite(start) ||
      !Number.isFinite(end)
    ) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }

    end = Math.min(end, stat.size - 1);
    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(stat.size),
    },
  });
}

export async function HEAD(req: NextRequest, ctx: Ctx) {
  const res = await GET(req, ctx);
  // Drop body for HEAD while keeping status/headers
  return new NextResponse(null, {
    status: res.status,
    headers: res.headers,
  });
}
