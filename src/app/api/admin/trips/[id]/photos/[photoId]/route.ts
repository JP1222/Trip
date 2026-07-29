import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deletePhoto, updatePhoto, type PhotoPatch } from "@/lib/photos";

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
    const body = (await req.json()) as {
      caption?: string;
      featured?: boolean;
    };
    const patch: PhotoPatch = {};
    if (typeof body.caption === "string") {
      patch.caption = body.caption;
    }
    if (typeof body.featured === "boolean") {
      patch.featured = body.featured;
    }
    if (!("caption" in patch) && !("featured" in patch)) {
      return NextResponse.json(
        { error: "Nothing to update (caption or featured)" },
        { status: 400 },
      );
    }
    const photo = await updatePhoto(id, photoId, patch);
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }
    return NextResponse.json(photo);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
