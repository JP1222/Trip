import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deletePhoto, updatePhotoCaption } from "@/lib/photos";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, photoId } = await ctx.params;
  const ok = await deletePhoto(id, photoId);
  if (!ok) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, photoId } = await ctx.params;
  try {
    const body = (await req.json()) as { caption?: string };
    const photo = await updatePhotoCaption(
      id,
      photoId,
      String(body.caption || ""),
    );
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }
    return NextResponse.json(photo);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
