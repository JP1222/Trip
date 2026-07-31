import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import {
  deleteGuestbookEntry,
  updateGuestbookEntry,
} from "@/lib/guestbook";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { validateRequestOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function requireAdmin(req: NextRequest, requestId: string) {
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
  return null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  const denied = await requireAdmin(req, requestId);
  if (denied) return denied;

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      author?: string;
      body?: string;
    };
    const entry = await updateGuestbookEntry(
      id,
      String(body.author || ""),
      String(body.body || ""),
    );
    if (!entry) {
      return attachRequestId(
        NextResponse.json({ error: "Entry not found" }, { status: 404 }),
        requestId,
      );
    }
    return attachRequestId(NextResponse.json(entry), requestId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update";
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  const denied = await requireAdmin(req, requestId);
  if (denied) return denied;

  const { id } = await ctx.params;
  const ok = await deleteGuestbookEntry(id);
  if (!ok) {
    return attachRequestId(
      NextResponse.json({ error: "Entry not found" }, { status: 404 }),
      requestId,
    );
  }
  return attachRequestId(NextResponse.json({ ok: true }), requestId);
}
