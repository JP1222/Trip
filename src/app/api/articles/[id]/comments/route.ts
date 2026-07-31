import { NextRequest, NextResponse } from "next/server";
import { getArticle } from "@/lib/articles";
import {
  addCommentForOwner,
  getCommentsForOwner,
  type CommentScope,
} from "@/lib/comments";
import { articleOwner } from "@/lib/media/owner";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { getArticlePhotos } from "@/lib/photos";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const article = await getArticle(id);
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const photoId = req.nextUrl.searchParams.get("photoId");
  const scopeParam = req.nextUrl.searchParams.get("scope");

  let scope: CommentScope = { kind: "all" };
  if (photoId) {
    scope = { kind: "photo", photoId };
  } else if (scopeParam === "trip") {
    scope = { kind: "trip" };
  }

  return NextResponse.json(
    await getCommentsForOwner(articleOwner(id), scope),
  );
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  const article = await getArticle(id);
  if (!article) {
    return attachRequestId(
      NextResponse.json({ error: "Article not found" }, { status: 404 }),
      requestId,
    );
  }
  if (article.status !== "published") {
    return attachRequestId(
      NextResponse.json({ error: "Article is not published" }, { status: 403 }),
      requestId,
    );
  }

  const rateLimit = await consumeRateLimit({
    bucketKey: createRateLimitKey("comment", getClientIp(req), id),
    limit: 40,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return attachRequestId(
      NextResponse.json(
        { error: "Too many comments. Try again later." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      ),
      requestId,
    );
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
      const photos = await getArticlePhotos(id);
      if (!photos.some((p) => p.id === photoId)) {
        return attachRequestId(
          NextResponse.json({ error: "Photo not found" }, { status: 404 }),
          requestId,
        );
      }
    }

    const comment = await addCommentForOwner(
      articleOwner(id),
      String(body.author || ""),
      String(body.body || ""),
      photoId,
    );
    return attachRequestId(NextResponse.json(comment, { status: 201 }), requestId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
