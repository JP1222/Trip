import { NextRequest, NextResponse } from "next/server";
import { createArticle, listArticles } from "@/lib/articles";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getClientIpHash } from "@/lib/security/request";
import type { ArticleStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  const status: ArticleStatus | "all" =
    statusParam === "draft" || statusParam === "published"
      ? statusParam
      : "all";

  const articles = await listArticles({ status });
  return attachRequestId(NextResponse.json({ articles }), requestId);
}

export async function POST(req: NextRequest) {
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

  try {
    const body = (await req.json()) as {
      title?: unknown;
      slug?: unknown;
      excerpt?: unknown;
      bodyMd?: unknown;
      coverImage?: unknown;
      status?: unknown;
      wallStyle?: unknown;
    };

    if (typeof body.title !== "string" || !body.title.trim()) {
      return attachRequestId(
        NextResponse.json({ error: "title is required" }, { status: 400 }),
        requestId,
      );
    }

    const article = await createArticle({
      title: body.title,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      excerpt: typeof body.excerpt === "string" ? body.excerpt : undefined,
      bodyMd: typeof body.bodyMd === "string" ? body.bodyMd : undefined,
      coverImage:
        body.coverImage === null
          ? null
          : typeof body.coverImage === "string"
            ? body.coverImage
            : undefined,
      status: body.status === "published" ? "published" : "draft",
      wallStyle:
        body.wallStyle === "polaroid" ||
        body.wallStyle === "note" ||
        body.wallStyle === "none"
          ? body.wallStyle
          : undefined,
    });

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "article.created",
      entityType: "article",
      entityId: article.id,
      requestId,
      ipHash: getClientIpHash(req),
      details: {
        slug: article.slug,
        status: article.status,
        wallStyle: article.wallStyle,
      },
    });

    return attachRequestId(
      NextResponse.json(article, { status: 201 }),
      requestId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
