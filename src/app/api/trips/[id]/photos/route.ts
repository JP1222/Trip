import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/trips";
import { getPhotos, savePhoto } from "@/lib/photos";

// Node runtime required for sharp / heic-convert
export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }
  const photos = await getPhotos(id);
  return NextResponse.json(photos);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const uploader = String(form.get("uploader") || "");
    const caption = form.get("caption");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please choose an image file" }, { status: 400 });
    }

    const meta = await savePhoto(
      id,
      file,
      uploader,
      typeof caption === "string" ? caption : undefined,
    );
    return NextResponse.json(meta, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
