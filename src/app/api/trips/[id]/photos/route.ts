import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { queueStagedMedia } from "@/lib/media/ingest";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { getPhotos, savePhoto } from "@/lib/photos";
import { authorizeTripWrite } from "@/lib/security/access";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { getClientIp, getClientIpHash } from "@/lib/security/request";
import { getTrip } from "@/lib/trips";
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

function databaseMediaEnabled(): boolean {
  const configured = (process.env.MEDIA_BACKEND || "").toLowerCase();
  if (configured === "legacy" || configured === "json") return false;
  return (
    configured === "db" ||
    configured === "postgres" ||
    Boolean(process.env.DATABASE_URL)
  );
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }
  const photos = await getPhotos(id);
  return NextResponse.json(photos);
}

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
  if (!trip) {
    return attachRequestId(
      NextResponse.json({ error: "Trip not found" }, { status: 404 }),
      requestId,
    );
  }

  const rateLimit = await consumeRateLimit({
    bucketKey: createRateLimitKey("photo-upload", getClientIp(req), id),
    limit: 30,
    windowMs: 15 * 60 * 1000,
  }).catch(() => null);
  if (!rateLimit) {
    return attachRequestId(
      NextResponse.json({ error: "Service unavailable" }, { status: 503 }),
      requestId,
    );
  }
  if (!rateLimit.allowed) {
    return attachRequestId(
      NextResponse.json(
        { error: "Too many uploads. Try again later." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      ),
      requestId,
    );
  }

  if (databaseMediaEnabled()) {
    let staged: StagedUpload[] = [];
    try {
      const parsed = await parseMediaUpload(req, {
        maxFiles: uploadLimits.publicFiles,
      });
      staged = parsed.files;

      // Public gallery stays open. A supplied invite token must be valid.
      if (parsed.fields.token) {
        const actor = await authorizeTripWrite(
          req,
          id,
          "upload",
          parsed.fields.token,
        );
        if (!actor) {
          await removeStagedUploads(staged);
          return attachRequestId(
            NextResponse.json(
              { error: "Invalid upload access" },
              { status: 401 },
            ),
            requestId,
          );
        }
      }

      const primary =
        parsed.files.find((file) => file.fieldName === "file") ||
        parsed.files.find((file) => file.fieldName === "files") ||
        parsed.files[0];
      const liveVideo = parsed.files.find(
        (file) => file.fieldName === "liveVideo",
      );
      if (!primary) {
        await removeStagedUploads(staged);
        return attachRequestId(
          NextResponse.json(
            { error: "Please choose a photo or video file" },
            { status: 400 },
          ),
          requestId,
        );
      }

      const meta = await queueStagedMedia({
        tripId: id,
        uploader: parsed.fields.uploader || "Anonymous traveler",
        caption: parsed.fields.caption,
        primary: {
          path: primary.path,
          originalName: primary.originalName,
          declaredMimeType: primary.declaredMimeType,
          byteSize: primary.byteSize,
          sha256: primary.sha256,
        },
        liveVideo: liveVideo
          ? {
              path: liveVideo.path,
              originalName: liveVideo.originalName,
              declaredMimeType: liveVideo.declaredMimeType,
              byteSize: liveVideo.byteSize,
              sha256: liveVideo.sha256,
            }
          : undefined,
      });
      staged = staged.filter(
        (file) => file.path !== primary.path && file.path !== liveVideo?.path,
      );
      await removeStagedUploads(staged);

      const actor = await authorizeTripWrite(
        req,
        id,
        "upload",
        parsed.fields.token,
      );
      if (actor) {
        await writeAuditEvent({
          actorType:
            actor.kind === "admin"
              ? "admin"
              : actor.kind === "capability"
                ? "capability"
                : "system",
          actorId:
            actor.kind === "admin"
              ? actor.session.id
              : actor.kind === "capability"
                ? actor.capability.id
                : "legacy-collab",
          action: "media.uploaded",
          entityType: "media",
          entityId: meta.id,
          requestId,
          ipHash: getClientIpHash(req),
          details: { tripId: id },
        });
      }

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
      return attachRequestId(
        NextResponse.json({ error: message }, { status: 400 }),
        requestId,
      );
    }
  }

  // Legacy JSON/file backend (local without DATABASE_URL).
  try {
    const form = await req.formData();
    const file = form.get("file");
    const uploader = String(form.get("uploader") || "");
    const caption = form.get("caption");
    const liveRaw = form.get("liveVideo");
    const liveVideo =
      liveRaw instanceof File && liveRaw.size > 0 ? liveRaw : undefined;

    if (!(file instanceof File)) {
      return attachRequestId(
        NextResponse.json(
          { error: "Please choose a photo or video file" },
          { status: 400 },
        ),
        requestId,
      );
    }

    const meta = await savePhoto(
      id,
      file,
      uploader,
      typeof caption === "string" ? caption : undefined,
      liveVideo,
    );
    return attachRequestId(
      NextResponse.json(meta, {
        status: 201,
        headers: rateLimitHeaders(rateLimit),
      }),
      requestId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
