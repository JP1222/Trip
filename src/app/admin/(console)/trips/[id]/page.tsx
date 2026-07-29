import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminComments } from "@/components/admin/AdminComments";
import { AdminPhotos } from "@/components/admin/AdminPhotos";
import { TripAdminForm } from "@/components/admin/TripAdminForm";
import { getComments } from "@/lib/comments";
import { getPhotos } from "@/lib/photos";
import { getTrip } from "@/lib/trips";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function AdminTripPage({ params }: Props) {
  const { id } = await params;
  const trip = await getTrip(id);
  if (!trip) notFound();

  const [photos, comments] = await Promise.all([
    getPhotos(id),
    getComments(id),
  ]);

  return (
    <div className="space-y-12">
      <div>
        <Link
          href="/admin"
          className="text-sm text-ink-muted transition hover:text-sea"
        >
          ← All trips
        </Link>
        <h1 className="mt-3 font-serif text-3xl text-ink">{trip.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          <Link href={`/trips/${trip.id}`} className="hover:text-sea">
            Open public page
          </Link>
        </p>
      </div>

      <section>
        <h2 className="font-serif text-xl text-ink">Trip details</h2>
        <div className="mt-4 rounded-2xl border border-sand-200 bg-white/80 p-5 sm:p-6">
          <TripAdminForm trip={trip} photos={photos} />
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Day-by-day itinerary still lives in{" "}
          <code className="rounded bg-sand-200/60 px-1">data/trips.json</code>{" "}
          for now (structured editor can come later).
        </p>
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink">
          Uploaded photos ({photos.length})
        </h2>
        <div className="mt-4">
          <AdminPhotos
            tripId={trip.id}
            photos={photos}
            coverImage={trip.coverImage}
          />
        </div>
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink">
          Comments ({comments.length})
        </h2>
        <div className="mt-4">
          <AdminComments tripId={trip.id} comments={comments} />
        </div>
      </section>
    </div>
  );
}
