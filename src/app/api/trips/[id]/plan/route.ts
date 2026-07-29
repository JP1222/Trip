import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { sanitizeBudget } from "@/lib/budget";
import { updateTrip, getTrip, type TripEditable } from "@/lib/trips";
import type { DayPlan, TripLocation } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Collab plan save — requires matching collabToken (or admin session).
 * Can update days, tips, location, budget only (not photos / admin secrets).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  try {
    const body = (await req.json()) as Partial<TripEditable> & {
      token?: string;
    };
    const token = String(body.token || "").trim();
    const admin = await isAdmin();
    const allowed =
      admin ||
      (Boolean(trip.collabToken) &&
        token.length > 0 &&
        token === trip.collabToken);

    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await updateTrip(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }
    // Never echo collabToken to collab clients unnecessarily — strip for non-admin
    if (!admin) {
      const { collabToken: _, ...safe } = updated;
      return NextResponse.json(safe);
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
