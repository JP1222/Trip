import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { logger } from "@/lib/observability/logger";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import {
  createTripCapability,
  listTripCapabilities,
  TRIP_CAPABILITY_SCOPES,
  type TripCapability,
} from "@/lib/security/capabilities";
import { getSecurityEnvironment } from "@/lib/security/env";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getClientIpHash } from "@/lib/security/request";
import { getTrip } from "@/lib/trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  label: z.string().trim().min(1).max(120).default("Trip collaboration"),
  scopes: z
    .array(z.enum(TRIP_CAPABILITY_SCOPES))
    .min(1)
    .max(TRIP_CAPABILITY_SCOPES.length)
    .default([...TRIP_CAPABILITY_SCOPES]),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

function serialize(capability: TripCapability) {
  return {
    id: capability.id,
    tripId: capability.tripId,
    label: capability.label,
    scopes: capability.scopes,
    createdAt: capability.createdAt.toISOString(),
    expiresAt: capability.expiresAt.toISOString(),
    lastUsedAt: capability.lastUsedAt?.toISOString() ?? null,
    revokedAt: capability.revokedAt?.toISOString() ?? null,
  };
}

function json(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
): NextResponse {
  return attachRequestId(
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    }),
    requestId,
  );
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) return json({ error: "Unauthorized" }, 401, requestId);

  const { id } = await ctx.params;
  if (!(await getTrip(id))) return json({ error: "Trip not found" }, 404, requestId);

  const now = Date.now();
  const capabilities = (await listTripCapabilities(id)).filter(
    (capability) =>
      !capability.revokedAt && capability.expiresAt.getTime() > now,
  );
  return json(
    { capabilities: capabilities.map(serialize) },
    200,
    requestId,
  );
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  const origin = validateRequestOrigin(req);
  if (!origin.ok) return json({ error: "Forbidden" }, 403, requestId);

  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) return json({ error: "Unauthorized" }, 401, requestId);

  const { id } = await ctx.params;
  if (!(await getTrip(id))) return json({ error: "Trip not found" }, 404, requestId);

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (!Number.isFinite(contentLength) || contentLength > 16 * 1024) {
    return json({ error: "Invalid request" }, 400, requestId);
  }

  try {
    const input = createSchema.parse(await req.json());
    const capability = await createTripCapability({
      tripId: id,
      label: input.label,
      scopes: input.scopes,
      expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
    });
    const inviteUrl = new URL(`/trips/${encodeURIComponent(id)}`, getSecurityEnvironment().appOrigin);
    inviteUrl.searchParams.set("edit", capability.token);

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "trip_capability.created",
      entityType: "trip_capability",
      entityId: capability.id,
      requestId,
      ipHash: getClientIpHash(req),
      details: { tripId: id, scopes: capability.scopes, expiresAt: capability.expiresAt },
    });
    logger.info("trip_capability_created", {
      requestId,
      tripId: id,
      capabilityId: capability.id,
      adminSessionId: session.id,
    });

    return json(
      {
        capability: serialize(capability),
        token: capability.token,
        inviteUrl: inviteUrl.toString(),
      },
      201,
      requestId,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: "Invalid capability settings" }, 400, requestId);
    }
    logger.error("trip_capability_create_failed", { requestId, tripId: id, error });
    return json({ error: "Could not create invite" }, 500, requestId);
  }
}
