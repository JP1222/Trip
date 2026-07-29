import { NextRequest, NextResponse } from "next/server";
import {
  addComment,
  getCommentsByScope,
  type CommentScope,
} from "@/lib/comments";
import { getPhotos } from "@/lib/photos";
import { getTrip } from "@/lib/trips";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  const photoId = req.nextUrl.searchParams.get("photoId");
  const scopeParam = req.nextUrl.searchParams.get("scope");

  let scope: CommentScope = { kind: "all" };
  if (photoId) {
    scope = { kind: "photo", photoId };
  } else if (scopeParam === "trip") {
    scope = { kind: "trip" };
  }

  return NextResponse.json(await getCommentsByScope(id, scope));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  try {
    const body = (await req.json()) as {
      author?: string;
      body?: string;
      photoId?: string;
    };
    const photoId =
      typeof body.photoId === "string" && body.photoId.trim()
        ? body.photoId.trim()
        : undefined;

    if (photoId) {
      const photos = await getPhotos(id);
      if (!photos.some((p) => p.id === photoId)) {
        return NextResponse.json(
          { error: "Photo not found" },
          { status: 404 },
        );
      }
    }

    const comment = await addComment(
      id,
      String(body.author || ""),
      String(body.body || ""),
      photoId,
    );
    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not post";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
