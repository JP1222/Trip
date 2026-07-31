import { NextResponse } from "next/server";
import { getPublicTrips } from "@/lib/trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const trips = await getPublicTrips();
  return NextResponse.json(trips);
}
