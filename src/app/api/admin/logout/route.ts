import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  clearAdminSessionCookies,
  revokeAdminSessionToken,
} from "@/lib/auth";
import { logger } from "@/lib/observability/logger";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const origin = validateRequestOrigin(req);
  if (!origin.ok) {
    logger.warn("admin_logout_origin_rejected", {
      requestId,
      reason: origin.reason,
    });
    return attachRequestId(
      NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
      requestId,
    );
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  let status = 200;
  try {
    const revoked = await revokeAdminSessionToken(token);
    logger.info("admin_logout", { requestId, revoked });
  } catch (error) {
    status = 503;
    logger.error("admin_logout_revoke_failed", { requestId, error });
  }

  const response = attachRequestId(
    NextResponse.json(
      status === 200 ? { ok: true } : { error: "Service unavailable" },
      { status, headers: { "Cache-Control": "no-store" } },
    ),
    requestId,
  );
  clearAdminSessionCookies(response);
  return response;
}

