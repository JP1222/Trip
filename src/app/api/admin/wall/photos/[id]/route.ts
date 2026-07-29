import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { getClientIpHash } from "@/lib/security/request";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  parseMediaUpload,
  removeStagedUploads,
  type StagedUpload,
} from "@/lib/upload-stream";
import {
  deleteWallPhoto,
  getWallPhoto,
  replaceWallPhotoImage,
  updateWallPhoto,
} from "@/lib/wall-photos";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
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
  if (!(await getWallPhoto(id))) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }

  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  // Multipart → replace the print image (keeps caption / meta).
  if (contentType.startsWith("multipart/form-data")) {
    let staged: StagedUpload[] = [];
    try {
      const parsed = await parseMediaUpload(req, { maxFiles: 1 });
      staged = parsed.files;
      const file = staged[0];
      if (!file) {
        return attachRequestId(
          NextResponse.json({ error: "No image file provided" }, { status: 400 }),
          requestId,
        );
      }
      const buffer = await fs.readFile(file.path);
      const photo = await replaceWallPhotoImage(id, {
        buffer,
        originalName: file.originalName,
        mimeType: file.declaredMimeType || "application/octet-stream",
      });
      await removeStagedUploads(staged);
      staged = [];
      if (!photo) {
        return attachRequestId(
          NextResponse.json({ error: "Not found" }, { status: 404 }),
          requestId,
        );
      }
      await writeAuditEvent({
        actorType: "admin",
        actorId: session.id,
        action: "wall_photo.image_replaced",
        entityType: "wall_photo",
        entityId: id,
        requestId,
        ipHash: getClientIpHash(req),
        details: { originalName: photo.originalName },
      });
      return attachRequestId(NextResponse.json(photo), requestId);
    } catch (err) {
      await removeStagedUploads(staged);
      const message = err instanceof Error ? err.message : "Replace failed";
      return attachRequestId(
        NextResponse.json({ error: message }, { status: 400 }),
        requestId,
      );
    }
  }

  try {
    const body = (await req.json()) as {
      caption?: unknown;
      meta?: unknown;
      frameStyle?: unknown;
      displaySize?: unknown;
      aspect?: unknown;
    };
    const patch: {
      caption?: string;
      meta?: string;
      frameStyle?: "polaroid" | "borderless" | "thin_white";
      displaySize?: "sm" | "md" | "lg";
      aspect?: "auto" | "landscape" | "portrait" | "square";
    } = {};
    if (typeof body.caption === "string") patch.caption = body.caption;
    if (typeof body.meta === "string") patch.meta = body.meta;
    if (
      body.frameStyle === "polaroid" ||
      body.frameStyle === "borderless" ||
      body.frameStyle === "thin_white"
    ) {
      patch.frameStyle = body.frameStyle;
    }
    if (
      body.displaySize === "sm" ||
      body.displaySize === "md" ||
      body.displaySize === "lg"
    ) {
      patch.displaySize = body.displaySize;
    }
    if (
      body.aspect === "auto" ||
      body.aspect === "landscape" ||
      body.aspect === "portrait" ||
      body.aspect === "square"
    ) {
      patch.aspect = body.aspect;
    }

    if (
      patch.caption === undefined &&
      patch.meta === undefined &&
      patch.frameStyle === undefined &&
      patch.displaySize === undefined &&
      patch.aspect === undefined
    ) {
      return attachRequestId(
        NextResponse.json(
          { error: "Expected at least one field to update" },
          { status: 400 },
        ),
        requestId,
      );
    }

    const photo = await updateWallPhoto(id, patch);
    if (!photo) {
      return attachRequestId(
        NextResponse.json({ error: "Not found" }, { status: 404 }),
        requestId,
      );
    }

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "wall_photo.updated",
      entityType: "wall_photo",
      entityId: id,
      requestId,
      ipHash: getClientIpHash(req),
      details: patch,
    });

    return attachRequestId(NextResponse.json(photo), requestId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}

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
  const ok = await deleteWallPhoto(id);
  if (!ok) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }

  await writeAuditEvent({
    actorType: "admin",
    actorId: session.id,
    action: "wall_photo.deleted",
    entityType: "wall_photo",
    entityId: id,
    requestId,
    ipHash: getClientIpHash(req),
  });

  return attachRequestId(NextResponse.json({ ok: true, id }), requestId);
}
