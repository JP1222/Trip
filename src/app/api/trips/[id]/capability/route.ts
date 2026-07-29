import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import {
  clearTripCapabilityCookie,
  setTripCapabilityCookie,
  TRIP_CAPABILITY_SCOPES,
  verifyTripCapability,
  verifyTripCapabilityCookie,
  type TripCapability,
  type TripCapabilityScope,
} from "@/lib/security/capabilities";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { getClientIp, getClientIpHash } from "@/lib/security/request";
import { getTrip } from "@/lib/trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const tokenSchema = z.object({ token: z.string().trim().min(32).max(128) });

function response(
  requestId: string,
  body: Record<string, unknown>,
  status: number,
  headers?: HeadersInit,
): NextResponse {
  return attachRequestId(
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    }),
    requestId,
  );
}

async function verifyAnyScope(
  tripId: string,
  token: string,
): Promise<TripCapability | null> {
  for (const scope of TRIP_CAPABILITY_SCOPES) {
    const capability = await verifyTripCapability(tripId, token, scope);
    if (capability) return capability;
  }
  return null;
}

async function cookieScopes(tripId: string): Promise<TripCapabilityScope[]> {
  for (const scope of TRIP_CAPABILITY_SCOPES) {
    const capability = await verifyTripCapabilityCookie(tripId, scope);
    if (capability) return capability.scopes;
  }
  return [];
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  const { id } = await ctx.params;
  const scopes = await cookieScopes(id).catch(() => []);
  return response(requestId, { authenticated: scopes.length > 0, scopes }, 200);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return response(requestId, { error: "Forbidden" }, 403);
  }

  const { id } = await ctx.params;
  if (!(await getTrip(id))) {
    return response(requestId, { error: "Trip not found" }, 404);
  }

  const rateLimit = await consumeRateLimit({
    bucketKey: createRateLimitKey("capability-exchange", getClientIp(req), id),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  }).catch(() => null);
  if (!rateLimit) return response(requestId, { error: "Service unavailable" }, 503);
  if (!rateLimit.allowed) {
    return response(
      requestId,
      { error: "Too many attempts. Try again later." },
      429,
      rateLimitHeaders(rateLimit),
    );
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (!Number.isFinite(contentLength) || contentLength > 8 * 1024) {
    return response(requestId, { error: "Invalid request" }, 400);
  }

  let token: string;
  try {
    token = tokenSchema.parse(await req.json()).token;
  } catch {
    return response(requestId, { error: "Invalid access code" }, 400);
  }

  const capability = await verifyAnyScope(id, token);
  if (!capability) {
    return response(
      requestId,
      { error: "Invalid or expired access code" },
      401,
      rateLimitHeaders(rateLimit),
    );
  }

  const result = response(
    requestId,
    { ok: true, scopes: capability.scopes, expiresAt: capability.expiresAt.toISOString() },
    200,
    rateLimitHeaders(rateLimit),
  );
  setTripCapabilityCookie(result, id, token, capability.expiresAt);
  await writeAuditEvent({
    actorType: "capability",
    actorId: capability.id,
    action: "trip_capability.exchanged",
    entityType: "trip",
    entityId: id,
    requestId,
    ipHash: getClientIpHash(req),
  });
  return result;
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return response(requestId, { error: "Forbidden" }, 403);
  }
  const { id } = await ctx.params;
  const result = response(requestId, { ok: true }, 200);
  clearTripCapabilityCookie(result, id);
  return result;
}
