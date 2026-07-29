import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSession,
  setAdminSessionCookie,
  verifyCredentials,
} from "@/lib/auth";
import { logger } from "@/lib/observability/logger";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { readLimitedJson } from "@/lib/security/body";
import { getSecurityEnvironment } from "@/lib/security/env";
import { validateRequestOrigin } from "@/lib/security/origin";
import {
  consumeRateLimit,
  createRateLimitKey,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/security/rate-limit";
import {
  getClientIp,
  getClientIpHash,
  getSafeUserAgent,
} from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function json(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
  headers?: HeadersInit,
): NextResponse {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return attachRequestId(
    NextResponse.json(body, {
      status,
      headers: responseHeaders,
    }),
    requestId,
  );
}

function stricterLimit(
  first: RateLimitResult,
  second: RateLimitResult,
): RateLimitResult {
  if (!first.allowed) return first;
  if (!second.allowed) return second;
  return first.remaining <= second.remaining ? first : second;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const origin = validateRequestOrigin(req);
  if (!origin.ok) {
    logger.warn("admin_login_origin_rejected", {
      requestId,
      reason: origin.reason,
    });
    return json({ error: "Forbidden" }, 403, requestId);
  }

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (
    !contentType.startsWith("application/json") ||
    !Number.isFinite(contentLength) ||
    contentLength > 8 * 1024
  ) {
    return json({ error: "Invalid request" }, 400, requestId);
  }

  let username = "";
  let password = "";
  try {
    const body = (await readLimitedJson(req, 8 * 1024)) as {
      username?: unknown;
      password?: unknown;
    };
    username = typeof body.username === "string" ? body.username.trim() : "";
    password = typeof body.password === "string" ? body.password : "";
    if (username.length > 128 || password.length > 1024) {
      throw new Error("Credential field too long");
    }
  } catch {
    return json({ error: "Invalid request" }, 400, requestId);
  }

  const clientIp = getClientIp(req);
  const ipHash = getClientIpHash(req);
  let appliedLimit: RateLimitResult;
  try {
    const ipLimit = await consumeRateLimit({
      bucketKey: createRateLimitKey("admin-login:ip", clientIp),
      limit: 10,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!ipLimit.allowed) {
      appliedLimit = ipLimit;
    } else {
      const principalLimit = await consumeRateLimit({
        bucketKey: createRateLimitKey(
          "admin-login:principal",
          clientIp,
          username.toLowerCase(),
        ),
        limit: 5,
        windowMs: LOGIN_WINDOW_MS,
      });
      appliedLimit = stricterLimit(ipLimit, principalLimit);
    }
  } catch (error) {
    logger.error("admin_login_rate_limit_failed", { requestId, error });
    return json({ error: "Service unavailable" }, 503, requestId);
  }

  if (!appliedLimit.allowed) {
    logger.warn("admin_login_rate_limited", { requestId, ipHash });
    return json(
      { error: "Too many attempts. Try again later." },
      429,
      requestId,
      rateLimitHeaders(appliedLimit),
    );
  }

  const environment = getSecurityEnvironment();
  if (!environment.adminPassword) {
    logger.error("admin_login_not_configured", { requestId });
    return json({ error: "Service unavailable" }, 503, requestId);
  }

  if (!verifyCredentials(username, password)) {
    logger.warn("admin_login_rejected", { requestId, ipHash });
    return json(
      { error: "Wrong username or password" },
      401,
      requestId,
      rateLimitHeaders(appliedLimit),
    );
  }

  try {
    const session = await createAdminSession({
      username: environment.adminUsername,
      ipHash,
      userAgent: getSafeUserAgent(req),
    });
    const response = json(
      { ok: true },
      200,
      requestId,
      rateLimitHeaders(appliedLimit),
    );
    setAdminSessionCookie(
      response,
      session.token,
      Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
    );
    logger.info("admin_login_succeeded", {
      requestId,
      ipHash,
      adminSessionId: session.id,
    });
    return response;
  } catch (error) {
    logger.error("admin_login_session_create_failed", { requestId, error });
    return json({ error: "Service unavailable" }, 503, requestId);
  }
}
