import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { reorderTrips } from "@/lib/trips";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { order?: unknown };
    if (!Array.isArray(body.order) || body.order.length === 0) {
      return NextResponse.json(
        { error: "Expected { order: string[] }" },
        { status: 400 },
      );
    }
    const order = body.order.map((id) => String(id)).filter(Boolean);
    const trips = await reorderTrips(order);
    return NextResponse.json({ ok: true, order: trips.map((t) => t.id) });
  } catch {
    return NextResponse.json({ error: "Could not reorder" }, { status: 400 });
  }
}
