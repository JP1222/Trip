import { NextRequest, NextResponse } from "next/server";
import {
  addGuestbookEntry,
  listGuestbookEntries,
} from "@/lib/guestbook";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 100;
  const entries = await listGuestbookEntries(
    Number.isFinite(limit) ? limit : 100,
  );
  return attachRequestId(
    NextResponse.json(entries, {
      headers: { "Cache-Control": "no-store" },
    }),
    requestId,
  );
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const rateLimit = await consumeRateLimit({
    bucketKey: createRateLimitKey("guestbook", getClientIp(req)),
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return attachRequestId(
      NextResponse.json(
        { error: "Too many notes. Try again later." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      ),
      requestId,
    );
  }

  try {
    const body = (await req.json()) as {
      author?: string;
      body?: string;
    };
    const entry = await addGuestbookEntry(
      String(body.author || ""),
      String(body.body || ""),
    );
    return attachRequestId(
      NextResponse.json(entry, {
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
