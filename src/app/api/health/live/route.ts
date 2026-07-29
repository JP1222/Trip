import { NextRequest, NextResponse } from "next/server";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return attachRequestId(
    NextResponse.json(
      {
        status: "ok",
        service: "trip-web",
        uptimeSeconds: Math.floor(process.uptime()),
      },
      { headers: { "Cache-Control": "no-store" } },
    ),
    requestId,
  );
}

