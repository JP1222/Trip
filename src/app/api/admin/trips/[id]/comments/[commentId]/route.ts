import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { deleteComment } from "@/lib/comments";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
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
  const { id, commentId } = await ctx.params;
  const ok = await deleteComment(id, commentId);
  if (!ok) {
    return attachRequestId(
      NextResponse.json({ error: "Comment not found" }, { status: 404 }),
      requestId,
    );
  }
  return attachRequestId(NextResponse.json({ ok: true }), requestId);
}
