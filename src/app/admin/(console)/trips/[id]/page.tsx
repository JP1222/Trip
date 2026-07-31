import { notFound } from "next/navigation";
import { AdminComments } from "@/components/admin/AdminComments";
import { AdminPhotos } from "@/components/admin/AdminPhotos";
import { AdminPlanEditor } from "@/components/admin/AdminPlanEditor";
import { AdminTripShare } from "@/components/admin/AdminTripShare";
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
    getPhotos(id, { includePending: true }),
    getComments(id),
  ]);

  return (
    <div className="min-h-screen bg-sand-50">
      <div className="mx-auto max-w-6xl space-y-8 px-5 pt-20 pb-16 sm:px-8 xl:max-w-7xl">
        <AdminTripShare tripId={trip.id} />

        <TripAdminForm trip={trip} />

        <section>
          <h2 className="font-serif text-xl text-ink">Plan</h2>
          <div className="mt-3 rounded-2xl border border-sand-200 bg-sand-50/50 p-4 sm:p-5">
            <AdminPlanEditor trip={trip} />
          </div>
        </section>

        <section className="rounded-2xl border border-sand-200 bg-white/80 p-5 sm:p-6">
          <AdminPhotos
            tripId={trip.id}
            tripTitle={trip.title}
            photos={photos}
            coverImage={trip.coverImage}
          />
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
    </div>
  );
}
