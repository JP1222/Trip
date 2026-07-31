import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { getClientIpHash } from "@/lib/security/request";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  deleteWallObject,
  getWallObject,
  GUESTBOOK_OBJECT_ID,
  updateWallObject,
} from "@/lib/wall-objects";

export const runtime = "nodejs";
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
  if (!(await getWallObject(id))) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }

  try {
    const body = (await req.json()) as {
      layout?: unknown;
      x?: unknown;
      y?: unknown;
      rotate?: unknown;
      scale?: unknown;
      z?: unknown;
      label?: unknown;
      catalogId?: unknown;
      bringToFront?: unknown;
    };
    const patch: {
      layout?: "desktop" | "mobile";
      x?: number;
      y?: number;
      rotate?: number;
      scale?: number;
      z?: number;
      label?: string;
      catalogId?: string;
      bringToFront?: boolean;
    } = {};
    if (body.layout === "mobile" || body.layout === "desktop") {
      patch.layout = body.layout;
    }
    if (typeof body.x === "number") patch.x = body.x;
    if (typeof body.y === "number") patch.y = body.y;
    if (typeof body.rotate === "number") patch.rotate = body.rotate;
    if (typeof body.scale === "number") patch.scale = body.scale;
    if (typeof body.z === "number") patch.z = body.z;
    if (typeof body.label === "string") patch.label = body.label;
    if (typeof body.catalogId === "string") patch.catalogId = body.catalogId;
    if (body.bringToFront === true) patch.bringToFront = true;

    if (
      patch.x === undefined &&
      patch.y === undefined &&
      patch.rotate === undefined &&
      patch.scale === undefined &&
      patch.z === undefined &&
      patch.label === undefined &&
      patch.catalogId === undefined &&
      !patch.bringToFront
    ) {
      return attachRequestId(
        NextResponse.json({ error: "No fields to update" }, { status: 400 }),
        requestId,
      );
    }

    const object = await updateWallObject(id, patch);
    if (!object) {
      return attachRequestId(
        NextResponse.json({ error: "Not found" }, { status: 404 }),
        requestId,
      );
    }

    return attachRequestId(NextResponse.json(object), requestId);
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
  if (id === GUESTBOOK_OBJECT_ID) {
    return attachRequestId(
      NextResponse.json(
        { error: "Guestbook stays on the board" },
        { status: 400 },
      ),
      requestId,
    );
  }
  const ok = await deleteWallObject(id);
  if (!ok) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }

  await writeAuditEvent({
    actorType: "admin",
    actorId: session.id,
    action: "wall_object.deleted",
    entityType: "wall_object",
    entityId: id,
    requestId,
    ipHash: getClientIpHash(req),
  });

  return attachRequestId(NextResponse.json({ ok: true, id }), requestId);
}
