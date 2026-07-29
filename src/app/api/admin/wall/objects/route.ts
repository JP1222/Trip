import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { getClientIpHash } from "@/lib/security/request";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  createWallObject,
  listWallObjects,
} from "@/lib/wall-objects";

export const runtime = "nodejs";
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
  const objects = await listWallObjects();
  return attachRequestId(NextResponse.json({ objects }), requestId);
}

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

  try {
    const body = (await req.json()) as {
      catalogId?: unknown;
      x?: unknown;
      y?: unknown;
      rotate?: unknown;
      scale?: unknown;
      label?: unknown;
    };
    if (typeof body.catalogId !== "string" || !body.catalogId.trim()) {
      return attachRequestId(
        NextResponse.json({ error: "catalogId required" }, { status: 400 }),
        requestId,
      );
    }

    const object = await createWallObject({
      catalogId: body.catalogId.trim(),
      x: typeof body.x === "number" ? body.x : undefined,
      y: typeof body.y === "number" ? body.y : undefined,
      rotate: typeof body.rotate === "number" ? body.rotate : undefined,
      scale: typeof body.scale === "number" ? body.scale : undefined,
      label: typeof body.label === "string" ? body.label : undefined,
    });

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "wall_object.created",
      entityType: "wall_object",
      entityId: object.id,
      requestId,
      ipHash: getClientIpHash(req),
      details: { catalogId: object.catalogId },
    });

    return attachRequestId(
      NextResponse.json(object, { status: 201 }),
      requestId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
