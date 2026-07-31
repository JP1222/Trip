import { NextRequest, NextResponse } from "next/server";
import {
  deleteArticle,
  getArticle,
  updateArticle,
  type ArticleEditable,
} from "@/lib/articles";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getClientIpHash } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  const article = await getArticle(id);
  if (!article) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }
  return attachRequestId(NextResponse.json(article), requestId);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as Partial<ArticleEditable>;
    const patch: Partial<ArticleEditable> = {};

    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.slug === "string") patch.slug = body.slug;
    if (typeof body.excerpt === "string") patch.excerpt = body.excerpt;
    if (typeof body.bodyMd === "string") patch.bodyMd = body.bodyMd;
    if (body.coverImage === null) patch.coverImage = null;
    else if (typeof body.coverImage === "string") patch.coverImage = body.coverImage;
    if (body.status === "draft" || body.status === "published") {
      patch.status = body.status;
    }
    if (
      body.wallStyle === "none" ||
      body.wallStyle === "polaroid" ||
      body.wallStyle === "note"
    ) {
      patch.wallStyle = body.wallStyle;
    }

    const article = await updateArticle(id, patch);
    if (!article) {
      return attachRequestId(
        NextResponse.json({ error: "Not found" }, { status: 404 }),
        requestId,
      );
    }

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "article.updated",
      entityType: "article",
      entityId: id,
      requestId,
      ipHash: getClientIpHash(req),
      details: { fields: Object.keys(patch) },
    });

    return attachRequestId(NextResponse.json(article), requestId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  const ok = await deleteArticle(id);
  if (!ok) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }

  await writeAuditEvent({
    actorType: "admin",
    actorId: session.id,
    action: "article.deleted",
    entityType: "article",
    entityId: id,
    requestId,
    ipHash: getClientIpHash(req),
  });

  return attachRequestId(NextResponse.json({ ok: true }), requestId);
}
