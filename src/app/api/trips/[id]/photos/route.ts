import { NextRequest, NextResponse } from "next/server";
import { queueStagedMedia } from "@/lib/media/ingest";
import { pairStagedUploads, stagedToSource } from "@/lib/media/pairing";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { logger } from "@/lib/observability/logger";
import { getPhotos } from "@/lib/photos";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { getTrip, isPublicTrip } from "@/lib/trips";
import {
  parseMediaUpload,
  removeStagedUploads,
  uploadLimits,
  type StagedUpload,
} from "@/lib/upload-stream";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip || !isPublicTrip(trip)) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }
  const photos = await getPhotos(id);
  return NextResponse.json(photos);
}

/**
 * Public gallery upload (product: open album for friends).
 * Streamed to disk, enqueued for media-worker. Rate-limited per IP + trip.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip || !isPublicTrip(trip)) {
    return attachRequestId(
      NextResponse.json({ error: "Trip not found" }, { status: 404 }),
      requestId,
    );
  }

  const rateLimit = await consumeRateLimit({
    bucketKey: createRateLimitKey("photo-upload", getClientIp(req), id),
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return attachRequestId(
      NextResponse.json(
        { error: "Too many uploads. Try again later." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      ),
      requestId,
    );
  }

  let staged: StagedUpload[] = [];
  try {
    const parsed = await parseMediaUpload(req, {
      maxFiles: uploadLimits.publicFiles,
    });
    staged = parsed.files;

    const units = pairStagedUploads(parsed.files);
    if (units.length !== 1) {
      throw new Error("Upload one photo/video (or one Live Photo pair) at a time");
    }
    const unit = units[0];
    const primary = unit.kind === "live" ? unit.still : unit.file;
    const liveVideo = unit.kind === "live" ? unit.live : undefined;

    const meta = await queueStagedMedia({
      tripId: id,
      uploader: parsed.fields.uploader || "Anonymous traveler",
      caption: parsed.fields.caption,
      primary: stagedToSource(primary),
      liveVideo: liveVideo ? stagedToSource(liveVideo) : undefined,
    });

    const adopted = new Set(
      [primary.path, liveVideo?.path].filter(Boolean) as string[],
    );
    await removeStagedUploads(staged.filter((file) => !adopted.has(file.path)));
    staged = [];

    logger.info("media_public_upload", {
      requestId,
      tripId: id,
      mediaId: meta.id,
    });

    return attachRequestId(
      NextResponse.json(meta, {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          ...rateLimitHeaders(rateLimit),
        },
      }),
      requestId,
    );
  } catch (err) {
    await removeStagedUploads(staged);
    const message = err instanceof Error ? err.message : "Upload failed";
    logger.warn("media_public_upload_failed", {
      requestId,
      tripId: id,
      error: message,
    });
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
