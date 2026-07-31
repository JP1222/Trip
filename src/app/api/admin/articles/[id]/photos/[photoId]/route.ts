import { NextRequest, NextResponse } from "next/server";
import { getArticle } from "@/lib/articles";
import { articleOwner } from "@/lib/media/owner";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import {
  deletePhotosForOwner,
  updatePhotoForOwner,
  type PhotoPatch,
} from "@/lib/photos";
import { validateRequestOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }
  if (!(await getCurrentAdminSession().catch(() => null))) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }
  const { id, photoId } = await ctx.params;
  if (!(await getArticle(id))) {
    return attachRequestId(
      NextResponse.json({ error: "Article not found" }, { status: 404 }),
      requestId,
    );
  }
  const result = await deletePhotosForOwner(articleOwner(id), [photoId]);
  if (!result.deleted.includes(photoId)) {
    return attachRequestId(
      NextResponse.json({ error: "Photo not found" }, { status: 404 }),
      requestId,
    );
  }
  return attachRequestId(NextResponse.json({ ok: true }), requestId);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }
  if (!(await getCurrentAdminSession().catch(() => null))) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }
  const { id, photoId } = await ctx.params;
  if (!(await getArticle(id))) {
    return attachRequestId(
      NextResponse.json({ error: "Article not found" }, { status: 404 }),
      requestId,
    );
  }
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
      return attachRequestId(
        NextResponse.json(
          { error: "Nothing to update (caption or featured)" },
          { status: 400 },
        ),
        requestId,
      );
    }
    const photo = await updatePhotoForOwner(articleOwner(id), photoId, patch);
    if (!photo) {
      return attachRequestId(
        NextResponse.json({ error: "Photo not found" }, { status: 404 }),
        requestId,
      );
    }
    return attachRequestId(NextResponse.json(photo), requestId);
  } catch {
    return attachRequestId(
      NextResponse.json({ error: "Invalid request" }, { status: 400 }),
      requestId,
    );
  }
}
