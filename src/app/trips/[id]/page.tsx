import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Comments } from "@/components/Comments";
import { Itinerary } from "@/components/Itinerary";
import { PhotoGallery } from "@/components/PhotoGallery";
import { OpenUploadButton, PhotoUpload } from "@/components/PhotoUpload";
import { getComments } from "@/lib/comments";
import { getPhotos } from "@/lib/photos";
import { formatDateRange, getTrip, tripDurationDays } from "@/lib/trips";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const trip = await getTrip(id);
  if (!trip) return { title: "Trip not found" };
  return {
    title: trip.title,
    description: trip.summary,
  };
}

export default async function TripPage({ params }: Props) {
  const { id } = await params;
  const trip = await getTrip(id);
  if (!trip) notFound();

  const [photos, comments] = await Promise.all([
    getPhotos(trip.id),
    getComments(trip.id),
  ]);
  const days = tripDurationDays(trip.startDate, trip.endDate);

  return (
    <div className="relative overflow-hidden pb-20">
      <div
        className="ambient -left-16 top-20 h-72 w-72 bg-sea/15"
        aria-hidden
      />
      <div
        className="ambient right-0 top-40 h-64 w-64 bg-coral/15"
        aria-hidden
      />

      <section
        className={`relative border-b border-sand-200/60 bg-gradient-to-br ${trip.coverGradient}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.5),transparent_50%)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-ink-soft transition hover:text-sea"
          >
            ← Wall
          </Link>

          <div className="mt-6 max-w-2xl">
            <p className="text-sm tracking-[0.18em] text-ink-soft/80 uppercase">
              {trip.destination}
            </p>
            <h1 className="mt-2 font-serif text-4xl text-ink sm:text-5xl">
              {trip.title}
            </h1>
            <p className="mt-3 text-lg text-ink-soft">{trip.subtitle}</p>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
              {trip.summary}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2 text-sm sm:gap-3">
            <span className="rounded-full bg-white/60 px-4 py-2 text-ink-soft backdrop-blur-sm">
              {formatDateRange(trip.startDate, trip.endDate)}
            </span>
            <span className="rounded-full bg-white/60 px-4 py-2 text-ink-soft backdrop-blur-sm">
              {days} {days === 1 ? "day" : "days"}
            </span>
            {trip.members.map((m) => (
              <span
                key={m}
                className="rounded-full bg-white/60 px-4 py-2 text-ink-soft backdrop-blur-sm"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <section id="plan" className="mt-14 scroll-mt-24">
          <div className="mb-6">
            <p className="text-sm tracking-[0.18em] text-sea uppercase">
              Itinerary
            </p>
            <h2 className="mt-1 font-serif text-3xl text-ink">Travel plan</h2>
          </div>
          <Itinerary days={trip.days} />
        </section>

        <section id="photos" className="mt-16 scroll-mt-24">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm tracking-[0.18em] text-sea uppercase">
                Gallery
              </p>
              <h2 className="mt-1 font-serif text-3xl text-ink">Trip photos</h2>
              <p className="mt-2 text-sm text-ink-muted">
                Share yours, or browse and download the group’s shots.
              </p>
            </div>
            <OpenUploadButton className="hidden rounded-full bg-sea px-5 py-2.5 text-sm text-white transition hover:bg-sea-soft sm:inline-flex" />
          </div>

          <PhotoGallery tripId={trip.id} initialPhotos={photos} />
          {/* FAB + upload sheet — does not take layout space */}
          <PhotoUpload tripId={trip.id} />
        </section>

        <section id="comments" className="mt-16 scroll-mt-24 pb-8">
          <div className="mb-6">
            <p className="text-sm tracking-[0.18em] text-sea uppercase">
              Notes
            </p>
            <h2 className="mt-1 font-serif text-3xl text-ink">Comments</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Leave a short note for everyone on this trip.
            </p>
          </div>
          <Comments tripId={trip.id} initialComments={comments} />
        </section>
      </div>
    </div>
  );
}
