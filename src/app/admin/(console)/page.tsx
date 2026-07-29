import { AdminAddFab } from "@/components/admin/AdminAddFab";
import {
  AdminPolaroidWall,
  type AdminWallCard,
} from "@/components/admin/AdminPolaroidWall";
import { getComments } from "@/lib/comments";
import { getPhotos } from "@/lib/photos";
import { resolveTripCoverUrl } from "@/lib/media-url";
import { getTrips } from "@/lib/trips";
import {
  coverGradientToCss,
  formatPolaroidMeta,
  formatPolaroidPlace,
} from "@/lib/wall";
import { listWallObjects } from "@/lib/wall-objects";
import { ensureDefaultWallPhotos } from "@/lib/wall-photos";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const [trips, boardPhotos, widgets] = await Promise.all([
    getTrips(),
    ensureDefaultWallPhotos(),
    listWallObjects(),
  ]);

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

  // Match public wall: board photos, then trips
  const items: AdminWallCard[] = [...photoCards, ...tripCards];

  return (
    <>
      <h1 className="sr-only">Admin — manage board</h1>
      <AdminPolaroidWall items={items} widgets={widgets} />
      <AdminAddFab />
    </>
  );
}
