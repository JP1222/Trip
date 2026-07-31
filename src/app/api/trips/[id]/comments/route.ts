import { NextRequest, NextResponse } from "next/server";
import {
  addComment,
  getCommentsByScope,
  type CommentScope,
} from "@/lib/comments";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { getPhotos } from "@/lib/photos";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { getTrip, isPublicTrip } from "@/lib/trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip || !isPublicTrip(trip)) {
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
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip || !isPublicTrip(trip)) {
    return attachRequestId(
      NextResponse.json({ error: "Trip not found" }, { status: 404 }),
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
      const photos = await getPhotos(id);
      if (!photos.some((p) => p.id === photoId)) {
        return attachRequestId(
          NextResponse.json({ error: "Photo not found" }, { status: 404 }),
          requestId,
        );
      }
    }

    const comment = await addComment(
      id,
      String(body.author || ""),
      String(body.body || ""),
      photoId,
    );
    return attachRequestId(
      NextResponse.json(comment, {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          ...rateLimitHeaders(rateLimit),
        },
      }),
      requestId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not post";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
