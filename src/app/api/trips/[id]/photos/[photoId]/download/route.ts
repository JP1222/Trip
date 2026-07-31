import { NextRequest, NextResponse } from "next/server";
import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import {
  safeDownloadBasename,
  stripImageMetadata,
} from "@/lib/image-process";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import {
  getPhoto,
  photoFilePath,
} from "@/lib/photos";
import { isVideoMedia } from "@/lib/photos-client";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { getTrip, isPublicTrip } from "@/lib/trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

/**
 * Public download:
 * - Images: re-encoded with EXIF/GPS/camera metadata stripped (privacy)
 * - Videos / Live companion: streamed as-is (container metadata not stripped)
 *
 * Query: ?part=live → companion Live Photo video
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  const { id: tripId, photoId } = await ctx.params;

  const rateLimit = await consumeRateLimit({
    bucketKey: createRateLimitKey("photo-download", getClientIp(req), tripId),
    limit: 120,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return attachRequestId(
      NextResponse.json(
        { error: "Too many downloads. Try again later." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      ),
      requestId,
    );
  }

  const trip = await getTrip(tripId);
  if (!trip || !isPublicTrip(trip)) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }

  const part = req.nextUrl.searchParams.get("part");
  const photo = await getPhoto(tripId, photoId);
  if (!photo) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }

  const headersBase: HeadersInit = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ...rateLimitHeaders(rateLimit),
  };

  if (part === "live") {
    if (!photo.liveVideoFilename) {
      return attachRequestId(
        NextResponse.json({ error: "No Live video" }, { status: 404 }),
        requestId,
      );
    }
    try {
      const filePath = photoFilePath(tripId, photo.liveVideoFilename);
      const stat = await fs.stat(filePath);
      const stream = createReadStream(filePath);
      const name =
        photo.liveVideoOriginalName || photo.liveVideoFilename || "live.mov";
      return attachRequestId(
        new NextResponse(Readable.toWeb(stream) as ReadableStream, {
          headers: {
            ...headersBase,
            "Content-Type": photo.liveVideoMimeType || "video/quicktime",
            "Content-Length": String(stat.size),
            "Content-Disposition": contentDisposition(name),
          },
        }),
        requestId,
      );
    } catch {
      return attachRequestId(
        NextResponse.json({ error: "File missing" }, { status: 404 }),
        requestId,
      );
    }
  }

  try {
    const filePath = photoFilePath(tripId, photo.filename);

    if (isVideoMedia(photo)) {
      const stat = await fs.stat(filePath);
      const stream = createReadStream(filePath);
      const name = photo.originalName || photo.filename;
      return attachRequestId(
        new NextResponse(Readable.toWeb(stream) as ReadableStream, {
          headers: {
            ...headersBase,
            "Content-Type": photo.mimeType || "video/mp4",
            "Content-Length": String(stat.size),
            "Content-Disposition": contentDisposition(name),
          },
        }),
        requestId,
      );
    }

    // Prefer a pre-stripped download derivative when the path is under /media/
    // and a sibling download asset might exist — otherwise strip on the fly.
    const raw = await fs.readFile(filePath);
    const stripped = await stripImageMetadata(raw);
    const base = safeDownloadBasename(
      photo.originalName || photo.filename,
      "photo",
    );
    const downloadName = `${base}${stripped.ext}`;

    return attachRequestId(
      new NextResponse(new Uint8Array(stripped.buffer), {
        headers: {
          ...headersBase,
          "Content-Type": stripped.mimeType,
          "Content-Disposition": contentDisposition(downloadName),
          "X-Privacy": "metadata-stripped",
        },
      }),
      requestId,
    );
  } catch {
    return attachRequestId(
      NextResponse.json({ error: "File missing" }, { status: 404 }),
      requestId,
    );
  }
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/["\r\n\\]/g, "_");
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
