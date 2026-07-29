import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { revokeTripCapability } from "@/lib/security/capabilities";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getClientIpHash } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; capabilityId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  const respond = (body: Record<string, unknown>, status: number) =>
    attachRequestId(
      NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
      }),
      requestId,
    );

  if (!validateRequestOrigin(req).ok) return respond({ error: "Forbidden" }, 403);
  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) return respond({ error: "Unauthorized" }, 401);

  const { id, capabilityId } = await ctx.params;
  const revoked = await revokeTripCapability(id, capabilityId);
  if (!revoked) return respond({ error: "Invite not found" }, 404);

  await writeAuditEvent({
    actorType: "admin",
    actorId: session.id,
    action: "trip_capability.revoked",
    entityType: "trip_capability",
    entityId: capabilityId,
    requestId,
    ipHash: getClientIpHash(req),
    details: { tripId: id },
  });
  return respond({ ok: true }, 200);
}
