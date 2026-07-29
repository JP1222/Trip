import { AdminPolaroidWall } from "@/components/admin/AdminPolaroidWall";
import { getComments } from "@/lib/comments";
import { getPhotos } from "@/lib/photos";
import { getTrips } from "@/lib/trips";
import {
  coverGradientToCss,
  formatPolaroidMeta,
  formatPolaroidPlace,
} from "@/lib/wall";
import { photoPublicUrl } from "@/lib/photos-client";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const trips = await getTrips();
  const items = await Promise.all(
    trips.map(async (t) => {
      const [photos, comments] = await Promise.all([
        getPhotos(t.id),
        getComments(t.id),
      ]);
      const fallback =
        photos[0] != null
          ? photoPublicUrl(t.id, photos[0].filename)
          : undefined;

      const planned = t.status === "planned";
      const meta = planned
        ? `Planning · ${formatPolaroidPlace(t.destination) || "TBD"}`
        : formatPolaroidMeta(t.startDate, t.endDate, t.destination);

      return {
        kind: "trip" as const,
        id: `admin-trip-${t.id}`,
        tripId: t.id,
        href: `/admin/trips/${t.id}`,
        src: planned ? t.coverImage || undefined : t.coverImage || fallback,
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

  return (
    <>
      <h1 className="sr-only">Admin — manage trips</h1>
      <AdminPolaroidWall items={items} />
    </>
  );
}
