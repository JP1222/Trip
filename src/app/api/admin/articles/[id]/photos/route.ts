import { NextRequest, NextResponse } from "next/server";
import { getArticle, updateArticle } from "@/lib/articles";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth";
import { articleOwner } from "@/lib/media/owner";
import { queueStagedMedia } from "@/lib/media/ingest";
import { pairStagedUploads, stagedToSource } from "@/lib/media/pairing";
import { mediaIdFromCoverRef } from "@/lib/media-url";
import { attachRequestId, getRequestId } from "@/lib/observability/request-id";
import { logger } from "@/lib/observability/logger";
import { deletePhotosForOwner } from "@/lib/photos";
import { validateRequestOrigin } from "@/lib/security/origin";
import { getClientIpHash } from "@/lib/security/request";
import {
  parseMediaUpload,
  removeStagedUploads,
  uploadLimits,
  type StagedUpload,
} from "@/lib/upload-stream";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Admin multi-upload for an article album — same ingest pipeline as trips.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  const article = await getArticle(id);
  if (!article) {
    return attachRequestId(
      NextResponse.json({ error: "Article not found" }, { status: 404 }),
      requestId,
    );
  }

  let staged: StagedUpload[] = [];
  try {
    const parsed = await parseMediaUpload(req, {
      maxFiles: uploadLimits.adminFiles,
    });
    staged = parsed.files;
    const uploader =
      (parsed.fields.uploader || "").trim() || session.username || "Peng";
    const caption = parsed.fields.caption;
    const units = pairStagedUploads(parsed.files);
    const used = new Set<string>();
    const saved = [];
    const errors: string[] = [];

    for (const unit of units) {
      const label =
        unit.kind === "live"
          ? `${unit.still.originalName} + ${unit.live.originalName}`
          : unit.file.originalName;
      try {
        const meta = await queueStagedMedia({
          owner: articleOwner(id),
          uploader,
          caption,
          primary: stagedToSource(
            unit.kind === "live" ? unit.still : unit.file,
          ),
          liveVideo:
            unit.kind === "live" ? stagedToSource(unit.live) : undefined,
        });
        if (unit.kind === "live") {
          used.add(unit.still.path);
          used.add(unit.live.path);
        } else {
          used.add(unit.file.path);
        }
        saved.push(meta);
      } catch (err) {
        errors.push(
          `${label}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }

    await removeStagedUploads(staged.filter((file) => !used.has(file.path)));
    staged = [];

    if (saved.length) {
      await writeAuditEvent({
        actorType: "admin",
        actorId: session.id,
        action: "media.batch_uploaded",
        entityType: "article",
        entityId: id,
        requestId,
        ipHash: getClientIpHash(req),
        details: { count: saved.length, errors: errors.length },
      });
    }

    logger.info("media_admin_batch_upload", {
      requestId,
      articleId: id,
      saved: saved.length,
      errors: errors.length,
    });

    return attachRequestId(
      NextResponse.json(
        {
          ok: true,
          photos: saved,
          count: saved.length,
          errors: errors.length ? errors : undefined,
        },
        { status: saved.length ? 201 : 400 },
      ),
      requestId,
    );
  } catch (err) {
    await removeStagedUploads(staged);
    const message = err instanceof Error ? err.message : "Upload failed";
    logger.warn("media_admin_batch_upload_failed", {
      requestId,
      articleId: id,
      error: message,
    });
    return attachRequestId(
      NextResponse.json({ error: message }, { status: 400 }),
      requestId,
    );
  }
}

/** Batch delete: { ids: string[] } */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const requestId = getRequestId(req);
  if (!validateRequestOrigin(req).ok) {
    return attachRequestId(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      requestId,
    );
  }

  const session = await getCurrentAdminSession().catch(() => null);
  if (!session) {
    return attachRequestId(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      requestId,
    );
  }

  const { id } = await ctx.params;
  const article = await getArticle(id);
  if (!article) {
    return attachRequestId(
      NextResponse.json({ error: "Article not found" }, { status: 404 }),
      requestId,
    );
  }

  try {
    const body = (await req.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return attachRequestId(
        NextResponse.json(
          { error: "Expected { ids: string[] }" },
          { status: 400 },
        ),
        requestId,
      );
    }
    const ids = body.ids.map((x) => String(x)).filter(Boolean);
    const result = await deletePhotosForOwner(articleOwner(id), ids);

    let coverCleared = false;
    const coverId = mediaIdFromCoverRef(article.coverImage);
    const deletedCoverById = Boolean(
      coverId && result.deleted.includes(coverId),
    );
    if (
      article.coverImage &&
      (result.removedUrls.includes(article.coverImage) || deletedCoverById)
    ) {
      await updateArticle(id, { coverImage: null });
      coverCleared = true;
    }

    await writeAuditEvent({
      actorType: "admin",
      actorId: session.id,
      action: "media.batch_deleted",
      entityType: "article",
      entityId: id,
      requestId,
      ipHash: getClientIpHash(req),
      details: { count: result.deleted.length, coverCleared },
    });

    return attachRequestId(
      NextResponse.json({
        ok: true,
        deleted: result.deleted,
        count: result.deleted.length,
        coverCleared,
      }),
      requestId,
    );
  } catch {
    return attachRequestId(
      NextResponse.json({ error: "Delete failed" }, { status: 400 }),
      requestId,
    );
  }
}
