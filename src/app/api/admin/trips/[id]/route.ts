import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { sanitizeBudget } from "@/lib/budget";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getClientIpHash } from "@/lib/security/request";
import { updateTrip, type TripEditable } from "@/lib/trips";
import type { DayPlan, TripLocation } from "@/lib/types";

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
  try {
    const body = (await req.json()) as Partial<TripEditable>;
    const patch: Partial<TripEditable> = {};

    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.subtitle === "string") patch.subtitle = body.subtitle.trim();
    if (typeof body.destination === "string")
      patch.destination = body.destination.trim();
    if (typeof body.startDate === "string") patch.startDate = body.startDate;
    if (typeof body.endDate === "string") patch.endDate = body.endDate;
    if (typeof body.summary === "string") patch.summary = body.summary.trim();
    if (typeof body.coverImage === "string")
      patch.coverImage = body.coverImage.trim() || undefined;
    if (typeof body.coverEmoji === "string")
      patch.coverEmoji = body.coverEmoji.trim();
    if (Array.isArray(body.members)) {
      patch.members = body.members
        .map((m) => String(m).trim())
        .filter(Boolean);
    }
    if (Array.isArray(body.tips)) {
      patch.tips = body.tips.map((t) => String(t).trim()).filter(Boolean);
    }
    if (body.status === "planned" || body.status === "lived") {
      patch.status = body.status;
    }
    if (body.visibility === "public" || body.visibility === "private") {
      patch.visibility = body.visibility;
    }
    if (Array.isArray(body.days)) {
      patch.days = body.days as DayPlan[];
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

    const trip = await updateTrip(id, patch);
    if (!trip) {
      return attachRequestId(
        NextResponse.json({ error: "Trip not found" }, { status: 404 }),
        requestId,
      );
    }

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "trip.updated",
      entityType: "trip",
      entityId: id,
      requestId,
      ipHash: getClientIpHash(req),
      details: { fields: Object.keys(patch) },
    });

    return attachRequestId(NextResponse.json(trip), requestId);
  } catch {
    return attachRequestId(
      NextResponse.json({ error: "Invalid request" }, { status: 400 }),
      requestId,
    );
  }
}
