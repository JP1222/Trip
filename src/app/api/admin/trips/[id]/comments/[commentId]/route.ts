import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deleteComment } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, commentId } = await ctx.params;
  const ok = await deleteComment(id, commentId);
  if (!ok) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
