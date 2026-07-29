import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/observability/logger";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { runReadinessChecks } from "@/lib/security/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const result = await runReadinessChecks();
    if (!result.ready) {
      logger.warn("readiness_check_failed", {
        requestId,
        checks: result.checks,
      });
    }
    return attachRequestId(
      NextResponse.json(
        {
          status: result.ready ? "ready" : "not_ready",
          checks: result.checks,
          details: result.details,
        },
        {
          status: result.ready ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        },
      ),
      requestId,
    );
  } catch (error) {
    logger.error("readiness_check_crashed", { requestId, error });
    return attachRequestId(
      NextResponse.json(
        { status: "not_ready" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
      requestId,
    );
  }
}

