import { NextRequest, NextResponse } from "next/server";
import { addComment, getComments } from "@/lib/comments";
import { getTrip } from "@/lib/trips";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }
  return NextResponse.json(await getComments(id));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  try {
    const body = (await req.json()) as { author?: string; body?: string };
    const comment = await addComment(
      id,
      String(body.author || ""),
      String(body.body || ""),
    );
    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not post";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
