import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";
import { setWallOrder } from "@/lib/wall-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }
  if (!(await getCurrentAdminSession().catch(() => null))) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  try {
    const body = (await req.json()) as { order?: unknown };
    if (!Array.isArray(body.order) || body.order.length === 0) {
      return attachRequestId(
        NextResponse.json(
          { error: "Expected { order: string[] }" },
          { status: 400 },
        ),
        requestId,
      );
    }
    const order = body.order.map((id) => String(id)).filter(Boolean);
    const saved = await setWallOrder(order);
    return attachRequestId(
      NextResponse.json({ ok: true, order: saved }),
      requestId,
    );
  } catch {
    return attachRequestId(
      NextResponse.json({ error: "Could not reorder" }, { status: 400 }),
      requestId,
    );
  }
}
