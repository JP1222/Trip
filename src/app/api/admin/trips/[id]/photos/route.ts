import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { queueStagedMedia } from "@/lib/media/ingest";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { deletePhotos, saveMediaFiles } from "@/lib/photos";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getClientIpHash } from "@/lib/security/request";
import { getTrip, updateTrip } from "@/lib/trips";
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

/**
 * Admin multi-upload: multipart with one or more `files` (or `file`) fields.
 * Same-basename image + .mov pairs become Apple Live Photos automatically
 * on the legacy path; the DB path accepts explicit liveVideo pairing per request.
 */
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

  if (databaseMediaEnabled()) {
    let staged: StagedUpload[] = [];
    try {
      const parsed = await parseMediaUpload(req, {
        maxFiles: uploadLimits.adminFiles,
      });
      staged = parsed.files;
      const uploader =
        (parsed.fields.uploader || "").trim() || session.username || "Admin";
      const caption = parsed.fields.caption;

      const liveByBase = new Map<string, StagedUpload>();
      const stills: StagedUpload[] = [];
      const videos: StagedUpload[] = [];

      for (const file of parsed.files) {
        const lower = file.originalName.toLowerCase();
        const isVideo =
          file.declaredMimeType.startsWith("video/") ||
          /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(lower);
        if (isVideo && /\.(mov|mp4|m4v)$/i.test(lower)) {
          const base = lower.replace(/\.[^.]+$/, "");
          liveByBase.set(base, file);
        } else if (isVideo) {
          videos.push(file);
        } else {
          stills.push(file);
        }
      }

      const used = new Set<string>();
      const saved = [];
      const errors: string[] = [];

      for (const still of stills) {
        const base = still.originalName.toLowerCase().replace(/\.[^.]+$/, "");
        const live = liveByBase.get(base);
        try {
          const meta = await queueStagedMedia({
            tripId: id,
            uploader,
            caption,
            primary: {
              path: still.path,
              originalName: still.originalName,
              declaredMimeType: still.declaredMimeType,
              byteSize: still.byteSize,
              sha256: still.sha256,
            },
            liveVideo: live
              ? {
                  path: live.path,
                  originalName: live.originalName,
                  declaredMimeType: live.declaredMimeType,
                  byteSize: live.byteSize,
                  sha256: live.sha256,
                }
              : undefined,
          });
          used.add(still.path);
          if (live) used.add(live.path);
          saved.push(meta);
        } catch (err) {
          errors.push(
            `${still.originalName}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }

      for (const video of videos) {
        try {
          const meta = await queueStagedMedia({
            tripId: id,
            uploader,
            caption,
            primary: {
              path: video.path,
              originalName: video.originalName,
              declaredMimeType: video.declaredMimeType,
              byteSize: video.byteSize,
              sha256: video.sha256,
            },
          });
          used.add(video.path);
          saved.push(meta);
        } catch (err) {
          errors.push(
            `${video.originalName}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }

      // Unpaired live companions that were not matched to a still
      for (const live of liveByBase.values()) {
        if (used.has(live.path)) continue;
        try {
          const meta = await queueStagedMedia({
            tripId: id,
            uploader,
            caption,
            primary: {
              path: live.path,
              originalName: live.originalName,
              declaredMimeType: live.declaredMimeType,
              byteSize: live.byteSize,
              sha256: live.sha256,
            },
          });
          used.add(live.path);
          saved.push(meta);
        } catch (err) {
          errors.push(
            `${live.originalName}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }

      await removeStagedUploads(staged.filter((file) => !used.has(file.path)));

      if (saved.length) {
        await writeAuditEvent({
          actorType: "admin",
          actorId: session.id,
          action: "media.batch_uploaded",
          entityType: "trip",
          entityId: id,
          requestId,
          ipHash: getClientIpHash(req),
          details: { count: saved.length, errors: errors.length },
        });
      }

      return attachRequestId(
        NextResponse.json(
          {
            ok: true,
            photos: saved,
            count: saved.length,
            errors: errors.length ? errors : undefined,
          },
          { status: saved.length ? 201 : 400 },
        ),
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

  try {
    const form = await req.formData();
    const uploader =
      String(form.get("uploader") || "").trim() || session.username || "Admin";
    const caption =
      typeof form.get("caption") === "string"
        ? String(form.get("caption"))
        : undefined;

    const files: File[] = [];
    for (const [key, value] of form.entries()) {
      if (
        (key === "file" || key === "files" || key === "files[]") &&
        value instanceof File &&
        value.size > 0
      ) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return attachRequestId(
        NextResponse.json(
          { error: "Please choose at least one photo or video" },
          { status: 400 },
        ),
        requestId,
      );
    }

    const { saved, errors } = await saveMediaFiles(
      id,
      files,
      uploader,
      caption,
    );

    return attachRequestId(
      NextResponse.json(
        {
          ok: true,
          photos: saved,
          count: saved.length,
          errors: errors.length ? errors : undefined,
        },
        { status: saved.length ? 201 : 400 },
      ),
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

/** Batch delete: { ids: string[] } */
export async function DELETE(req: NextRequest, ctx: Ctx) {
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

  try {
    const body = (await req.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return attachRequestId(
        NextResponse.json(
          { error: "Expected { ids: string[] }" },
          { status: 400 },
        ),
        requestId,
      );
    }
    const ids = body.ids.map((x) => String(x)).filter(Boolean);
    const result = await deletePhotos(id, ids);

    let coverCleared = false;
    if (trip.coverImage && result.removedUrls.includes(trip.coverImage)) {
      await updateTrip(id, { coverImage: "" });
      coverCleared = true;
    }

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "media.batch_deleted",
      entityType: "trip",
      entityId: id,
      requestId,
      ipHash: getClientIpHash(req),
      details: { count: result.deleted.length, coverCleared },
    });

    return attachRequestId(
      NextResponse.json({
        ok: true,
        deleted: result.deleted,
        count: result.deleted.length,
        coverCleared,
      }),
      requestId,
    );
  } catch {
    return attachRequestId(
      NextResponse.json({ error: "Delete failed" }, { status: 400 }),
      requestId,
    );
  }
}
