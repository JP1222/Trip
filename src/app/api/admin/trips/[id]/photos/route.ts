import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deletePhotos, saveMediaFiles } from "@/lib/photos";
import { getTrip, updateTrip } from "@/lib/trips";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Admin multi-upload: multipart with one or more `files` (or `file`) fields.
 * Same-basename image + .mov pairs become Apple Live Photos automatically.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  try {
    const form = await req.formData();
    const uploader =
      String(form.get("uploader") || "").trim() || "Admin";
    const caption =
      typeof form.get("caption") === "string"
        ? String(form.get("caption"))
        : undefined;

    const files: File[] = [];
    for (const [key, value] of form.entries()) {
      if (
        (key === "file" || key === "files" || key === "files[]") &&
        value instanceof File &&
        value.size > 0
      ) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Please choose at least one photo or video" },
        { status: 400 },
      );
    }

    const { saved, errors } = await saveMediaFiles(
      id,
      files,
      uploader,
      caption,
    );

    return NextResponse.json(
      {
        ok: true,
        photos: saved,
        count: saved.length,
        errors: errors.length ? errors : undefined,
      },
      { status: saved.length ? 201 : 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Batch delete: { ids: string[] } */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  try {
    const body = (await req.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { error: "Expected { ids: string[] }" },
        { status: 400 },
      );
    }
    const ids = body.ids.map((x) => String(x)).filter(Boolean);
    const result = await deletePhotos(id, ids);

    // If the polaroid cover was deleted, clear it
    let coverCleared = false;
    if (
      trip.coverImage &&
      result.removedUrls.includes(trip.coverImage)
    ) {
      await updateTrip(id, { coverImage: "" });
      coverCleared = true;
    }

    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      count: result.deleted.length,
      coverCleared,
    });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 400 });
  }
}
