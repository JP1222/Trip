import { NextRequest, NextResponse } from "next/server";
import { getTrip, isPublicTrip } from "@/lib/trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip || !isPublicTrip(trip)) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }
  return NextResponse.json(trip);
}
