import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getWallNote, updateWallNote } from "@/lib/wall-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  const { id } = await ctx.params;
  if (!(await getWallNote(id))) {
    return attachRequestId(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      requestId,
    );
  }

  try {
    const body = (await req.json()) as { label?: unknown };
    if (typeof body.label !== "string") {
      return attachRequestId(
        NextResponse.json({ error: "Expected { label }" }, { status: 400 }),
        requestId,
      );
    }
    const note = await updateWallNote(id, body.label);
    if (!note) {
      return attachRequestId(
        NextResponse.json({ error: "Not found" }, { status: 404 }),
        requestId,
      );
    }
    return attachRequestId(NextResponse.json(note), requestId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}
