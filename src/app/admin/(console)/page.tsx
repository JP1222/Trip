import { AdminAddFab } from "@/components/admin/AdminAddFab";
import {
  AdminPolaroidWall,
  type AdminWallCard,
} from "@/components/admin/AdminPolaroidWall";
import { listArticles } from "@/lib/articles";
import { getComments } from "@/lib/comments";
import { getPhotos } from "@/lib/photos";
import { resolveTripCoverUrl } from "@/lib/media-url";
import { parseStickyNoteLabel } from "@/lib/sticky-note";
import { getTrips } from "@/lib/trips";
import {
  coverGradientToCss,
  formatPolaroidMeta,
  formatPolaroidPlace,
} from "@/lib/wall";
import {
  applyWallOrder,
  getWallOrder,
  wallSlotKey,
} from "@/lib/wall-order";
import { ensureDefaultWallNotes } from "@/lib/wall-notes";
import { listWallObjects } from "@/lib/wall-objects";
import { ensureDefaultWallPhotos } from "@/lib/wall-photos";

export const dynamic = "force-dynamic";

function formatArticleDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AdminHomePage() {
  const [trips, boardPhotos, widgets, articles, wallOrder] = await Promise.all([
    getTrips(),
    ensureDefaultWallPhotos(),
    listWallObjects(),
    listArticles({ status: "all" }),
    getWallOrder(),
  ]);
  const boardNotes = await ensureDefaultWallNotes({
    trips,
    boardPhotoCount: boardPhotos.length,
  });

  const tripCards: AdminWallCard[] = await Promise.all(
    trips.map(async (t) => {
      const [photos, comments] = await Promise.all([
        getPhotos(t.id),
        getComments(t.id),
      ]);
      const coverSrc = resolveTripCoverUrl(t.coverImage, photos);

      const planned = t.status === "planned";
      const meta = planned
        ? `Planning · ${formatPolaroidPlace(t.destination) || "TBD"}`
        : formatPolaroidMeta(t.startDate, t.endDate, t.destination);

      return {
        kind: "trip" as const,
        id: `admin-trip-${t.id}`,
        tripId: t.id,
        href: `/admin/trips/${t.id}`,
        src: coverSrc,
        caption: t.title,
        sub: t.destination,
        meta,
        dateLabel: meta,
        planned,
        coverGradient: coverGradientToCss(t.coverGradient),
        coverEmoji: t.coverEmoji,
        startDate: t.startDate,
        endDate: t.endDate,
        photoCount: photos.length,
        commentCount: comments.length,
      };
    }),
  );

  const photoCards: AdminWallCard[] = boardPhotos.map((p) => ({
    kind: "photo" as const,
    id: `admin-photo-${p.id}`,
    photoId: p.id,
    src: p.src,
    orientation:
      p.aspect !== "auto" ? p.aspect : p.orientation || undefined,
    caption: p.caption.trim(),
    meta: p.meta.trim() || undefined,
    frameStyle: p.frameStyle,
    displaySize: p.displaySize,
    hideLabels: !p.caption.trim() && !p.meta.trim(),
    aspect: p.aspect,
    naturalOrientation: p.orientation,
  }));

  const noteCards: AdminWallCard[] = boardNotes.map((note) => {
    const { title, lines, signature } = parseStickyNoteLabel(note.label);
    return {
      kind: "note" as const,
      id: `admin-note-${note.id}`,
      noteId: note.id,
      label: note.label,
      caption: title,
      noteLines: lines,
      noteSignature: signature,
    };
  });

  // Admin board keeps Hidden (wallStyle none) so drafts stay editable;
  // public /wall only pins polaroid + note (see listWallArticles).
  const articleCards: AdminWallCard[] = articles.map((article) => {
    const dateLine =
      formatArticleDate(article.publishedAt) ||
      formatArticleDate(article.updatedAt);
    const hidden = article.wallStyle === "none";
    if (article.wallStyle === "note") {
      const noteLines = article.excerpt
        ? article.excerpt
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 4)
        : dateLine
          ? [dateLine, "Tap to edit →"]
          : ["Tap to edit →"];
      return {
        kind: "article" as const,
        id: `admin-article-note-${article.id}`,
        articleId: article.id,
        wallStyle: "note" as const,
        caption: article.title,
        noteLines,
        noteSignature: article.status === "draft" ? "Draft" : "Writing",
        draft: article.status === "draft",
      };
    }
    return {
      kind: "article" as const,
      id: `admin-article-${article.id}`,
      articleId: article.id,
      wallStyle: hidden ? ("none" as const) : ("polaroid" as const),
      src: article.coverImage,
      caption: article.title,
      sub: hidden ? "Hidden" : "Essay",
      meta: hidden ? "Hidden from wall" : dateLine || "Writing",
      dateLabel: hidden ? "Hidden from wall" : dateLine || "Writing",
      coverGradient:
        "linear-gradient(145deg, #5a8582 0%, #3d6664 52%, #2a4543 100%)",
      coverEmoji: "✎",
      draft: article.status === "draft",
    };
  });

  // Default notes → photos → articles → trips; wall_order can interleave.
  const items: AdminWallCard[] = applyWallOrder(
    [...noteCards, ...photoCards, ...articleCards, ...tripCards],
    wallOrder,
    (item) => {
      if (item.kind === "trip") return wallSlotKey("trip", item.tripId);
      if (item.kind === "photo") return wallSlotKey("photo", item.photoId);
      if (item.kind === "note") return wallSlotKey("note", item.noteId);
      return wallSlotKey("article", item.articleId);
    },
  );

  return (
    <>
      <h1 className="sr-only">Admin — manage board</h1>
      <AdminPolaroidWall items={items} widgets={widgets} />
      <AdminAddFab />
    </>
  );
}
