import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { collectBackendMetrics } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only operational snapshot: media job backlog, failure rates, disk usage.
 * Intended for dashboards / on-call checks, not public monitoring scrapers.
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  try {
    const metrics = await collectBackendMetrics();
    return attachRequestId(
      NextResponse.json(metrics, {
        headers: { "Cache-Control": "no-store" },
      }),
      requestId,
    );
  } catch (error) {
    logger.error("ops_metrics_failed", { requestId, error });
    return attachRequestId(
      NextResponse.json({ error: "Could not collect metrics" }, { status: 500 }),
      requestId,
    );
  }
}
