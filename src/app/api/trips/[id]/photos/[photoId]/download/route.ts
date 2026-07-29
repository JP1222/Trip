import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import {
  safeDownloadBasename,
  stripImageMetadata,
} from "@/lib/image-process";
import {
  getPhoto,
  photoFilePath,
} from "@/lib/photos";
import { isVideoMedia } from "@/lib/photos-client";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

/**
 * Public download:
 * - Images: re-encoded with EXIF/GPS/camera metadata stripped (privacy)
 * - Videos / Live companion: streamed as-is (container metadata not stripped)
 *
 * Query: ?part=live → companion Live Photo video
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id: tripId, photoId } = await ctx.params;
  const part = req.nextUrl.searchParams.get("part");
  const photo = await getPhoto(tripId, photoId);
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (part === "live") {
    if (!photo.liveVideoFilename) {
      return NextResponse.json({ error: "No Live video" }, { status: 404 });
    }
    try {
      const buf = await fs.readFile(
        photoFilePath(tripId, photo.liveVideoFilename),
      );
      const name =
        photo.liveVideoOriginalName || photo.liveVideoFilename || "live.mov";
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": photo.liveVideoMimeType || "video/quicktime",
          "Content-Disposition": contentDisposition(name),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return NextResponse.json({ error: "File missing" }, { status: 404 });
    }
  }

  try {
    const raw = await fs.readFile(photoFilePath(tripId, photo.filename));

    if (isVideoMedia(photo)) {
      const name = photo.originalName || photo.filename;
      return new NextResponse(new Uint8Array(raw), {
        headers: {
          "Content-Type": photo.mimeType || "video/mp4",
          "Content-Disposition": contentDisposition(name),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const stripped = await stripImageMetadata(raw);
    const base = safeDownloadBasename(
      photo.originalName || photo.filename,
      "photo",
    );
    const downloadName = `${base}${stripped.ext}`;

    return new NextResponse(new Uint8Array(stripped.buffer), {
      headers: {
        "Content-Type": stripped.mimeType,
        "Content-Disposition": contentDisposition(downloadName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Privacy": "metadata-stripped",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/["\r\n\\]/g, "_");
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
