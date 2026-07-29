import Link from "next/link";
import { getComments } from "@/lib/comments";
import { getPhotos } from "@/lib/photos";
import { getTrips } from "@/lib/trips";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const trips = await getTrips();
  const stats = await Promise.all(
    trips.map(async (t) => {
      const [photos, comments] = await Promise.all([
        getPhotos(t.id),
        getComments(t.id),
      ]);
      return { trip: t, photoCount: photos.length, commentCount: comments.length };
    }),
  );

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink">Trips</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Edit trip info, remove photos, and moderate comments. Friends only
        upload and comment on the public pages.
      </p>

      <ul className="mt-8 space-y-3">
        {stats.map(({ trip, photoCount, commentCount }) => (
          <li key={trip.id}>
            <Link
              href={`/admin/trips/${trip.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sand-200/80 bg-white/80 px-5 py-4 transition hover:border-sea/30 hover:shadow-sm"
            >
              <div>
                <p className="font-medium text-ink">{trip.title}</p>
                <p className="text-sm text-ink-muted">{trip.destination}</p>
              </div>
              <div className="flex gap-4 text-xs text-ink-muted">
                <span>{photoCount} photos</span>
                <span>{commentCount} comments</span>
                <span className="text-sea">Edit →</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
