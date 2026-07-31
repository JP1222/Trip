import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { localMediaStorage } from "@/lib/media/storage";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { getClientIpHash } from "@/lib/security/request";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getTrip, updateTrip } from "@/lib/trips";
import {
  parseMediaUpload,
  removeStagedUploads,
  type StagedUpload,
} from "@/lib/upload-stream";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_EDGE = 2400;
const JPEG_QUALITY = 90;

/** Replace trip polaroid cover with a client-edited still. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return attachRequestId(
      NextResponse.json({ error: "Trip not found" }, { status: 404 }),
      requestId,
    );
  }

  let staged: StagedUpload[] = [];
  try {
    const parsed = await parseMediaUpload(req, { maxFiles: 1 });
    staged = parsed.files;
    const file = staged[0];
    if (!file) {
      return attachRequestId(
        NextResponse.json({ error: "No image provided" }, { status: 400 }),
        requestId,
      );
    }

    const input = await fs.readFile(file.path);
    const image = sharp(input, {
      failOn: "none",
      limitInputPixels: 100_000_000,
    }).rotate();
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) {
      throw new Error("Image is too small");
    }

    const buffer = await image
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColorspace("srgb")
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    const storageKey = `trips/${id}/cover/${randomUUID()}.jpg`;
    await localMediaStorage.ensureRoots();
    const target = await localMediaStorage.createAtomicTarget(
      "public",
      storageKey,
    );
    try {
      await fs.writeFile(target.tempPath, buffer);
      await target.commit();
    } catch (err) {
      await target.abort();
      throw err;
    }

    const coverImage = `/media/${storageKey}`;
    await updateTrip(id, { coverImage });

    await removeStagedUploads(staged);
    staged = [];

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "trip.cover_edited",
      entityType: "trip",
      entityId: id,
      requestId,
      ipHash: getClientIpHash(req),
      details: { storageKey },
    });

    return attachRequestId(
      NextResponse.json({ ok: true, coverImage }),
      requestId,
    );
  } catch (err) {
    await removeStagedUploads(staged);
    const message = err instanceof Error ? err.message : "Cover upload failed";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
