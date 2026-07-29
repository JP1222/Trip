import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { sanitizeBudget } from "@/lib/budget";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import {
  actorId,
  actorType,
  authorizeTripWrite,
} from "@/lib/security/access";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { getClientIp, getClientIpHash } from "@/lib/security/request";
import { updateTrip, getTrip, type TripEditable } from "@/lib/trips";
import type { DayPlan, TripLocation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Collab plan save — requires admin session or a trip capability with `plan` scope.
 * Updates days, tips, location, and budget only.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  try {
    const body = (await req.json()) as Partial<TripEditable> & {
      token?: string;
    };

    const rateLimit = await consumeRateLimit({
      bucketKey: createRateLimitKey("plan-write", getClientIp(req), id),
      limit: 120,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return attachRequestId(
        NextResponse.json(
          { error: "Too many saves. Try again later." },
          { status: 429, headers: rateLimitHeaders(rateLimit) },
        ),
        requestId,
      );
    }

    const actor = await authorizeTripWrite(req, id, "plan", body.token);
    if (!actor) {
      return attachRequestId(
        NextResponse.json(
          { error: "Unauthorized" },
          { status: 401, headers: rateLimitHeaders(rateLimit) },
        ),
        requestId,
      );
    }

    const patch: Partial<TripEditable> = {};
    if (Array.isArray(body.days)) patch.days = body.days as DayPlan[];
    if (Array.isArray(body.tips)) {
      patch.tips = body.tips.map((t) => String(t).trim()).filter(Boolean);
    }
    if (body.location && typeof body.location === "object") {
      patch.location = body.location as TripLocation;
    }
    if (body.budget !== undefined) {
      patch.budget = sanitizeBudget(body.budget) ?? {
        currency: "USD",
        items: [],
      };
    }

    if (Object.keys(patch).length === 0) {
      return attachRequestId(
        NextResponse.json({ error: "Nothing to update" }, { status: 400 }),
        requestId,
      );
    }

    const updated = await updateTrip(id, patch);
    if (!updated) {
      return attachRequestId(
        NextResponse.json({ error: "Trip not found" }, { status: 404 }),
        requestId,
      );
    }

    await writeAuditEvent({
      actorType: actorType(actor),
      actorId: actorId(actor),
      action: "trip.plan_updated",
      entityType: "trip",
      entityId: id,
      requestId,
      ipHash: getClientIpHash(req),
      details: { fields: Object.keys(patch) },
    });

    const { collabToken: _, ...safe } = updated;
    return attachRequestId(
      NextResponse.json(safe, {
        headers: {
          "Cache-Control": "no-store",
          ...rateLimitHeaders(rateLimit),
        },
      }),
      requestId,
    );
  } catch {
    return attachRequestId(
      NextResponse.json({ error: "Invalid request" }, { status: 400 }),
      requestId,
    );
  }
}
