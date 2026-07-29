import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { logger } from "@/lib/observability/logger";
import { getClientIpHash } from "@/lib/security/request";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  parseMediaUpload,
  removeStagedUploads,
  uploadLimits,
  type StagedUpload,
} from "@/lib/upload-stream";
import { createWallPhoto, ensureDefaultWallPhotos } from "@/lib/wall-photos";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  const photos = await ensureDefaultWallPhotos();
  return attachRequestId(
    NextResponse.json({ photos }),
    requestId,
  );
}

/**
 * Admin upload of standalone board polaroids.
 * Multipart fields: `file` or `files`, optional `caption`, `meta`.
 */
export async function POST(req: NextRequest) {
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

  let staged: StagedUpload[] = [];
  try {
    const parsed = await parseMediaUpload(req, {
      maxFiles: Math.min(uploadLimits.adminFiles, 12),
    });
    staged = parsed.files;
    if (!staged.length) {
      return attachRequestId(
        NextResponse.json({ error: "No image files provided" }, { status: 400 }),
        requestId,
      );
    }

    const caption = (parsed.fields.caption || "").trim();
    const meta = (parsed.fields.meta || "").trim();
    const saved = [];
    const errors: string[] = [];

    for (const file of staged) {
      try {
        const buffer = await fs.readFile(file.path);
        const photo = await createWallPhoto({
          buffer,
          originalName: file.originalName,
          mimeType: file.declaredMimeType || "application/octet-stream",
          caption: saved.length === 0 ? caption : caption || undefined,
          meta: saved.length === 0 ? meta : meta || undefined,
        });
        saved.push(photo);
      } catch (err) {
        errors.push(
          `${file.originalName}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }

    await removeStagedUploads(staged);
    staged = [];

    if (saved.length) {
      await writeAuditEvent({
        actorType: "admin",
        actorId: session.id,
        action: "wall_photo.uploaded",
        entityType: "wall",
        requestId,
        ipHash: getClientIpHash(req),
        details: { count: saved.length, errors: errors.length },
      });
    }

    logger.info("wall_photo_admin_upload", {
      requestId,
      saved: saved.length,
      errors: errors.length,
    });

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
    logger.warn("wall_photo_admin_upload_failed", {
      requestId,
      error: message,
    });
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
