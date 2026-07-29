import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CollabPlanShell } from "@/components/CollabPlanShell";
import { Comments } from "@/components/Comments";
import { PhotoGallery } from "@/components/PhotoGallery";
import { PhotoUpload } from "@/components/PhotoUpload";
import { TripPlanner } from "@/components/TripPlanner";
import { TripSectionNav } from "@/components/TripSectionNav";
import { getComments, getTripComments } from "@/lib/comments";
import { getPhotos } from "@/lib/photos";
import {
  formatDateRange,
  getTrip,
  isPlannedTrip,
  tripDurationDays,
} from "@/lib/trips";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
};

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

export default async function TripPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const trip = await getTrip(id);
  if (!trip) notFound();

  const [photos, allComments, tripNotes] = await Promise.all([
    getPhotos(trip.id),
    getComments(trip.id),
    getTripComments(trip.id),
  ]);
  const days = tripDurationDays(trip.startDate, trip.endDate);
  const planned = isPlannedTrip(trip);

  const editParam = (sp.edit || "").trim();
  const verifiedToken =
    trip.collabToken && editParam && editParam === trip.collabToken
      ? editParam
      : null;

  // Never ship collabToken to the public client (page source scrape)
  const publicTrip = { ...trip, collabToken: undefined };

  const navTabs = planned
    ? [
        { id: "plan", label: "Plan" },
        { id: "notes", label: "Notes" },
        { id: "photos", label: "Photos" },
      ]
    : [
        { id: "plan", label: "Itinerary" },
        { id: "photos", label: "Photos" },
        { id: "notes", label: "Notes" },
      ];

  const notesSection = (
    <section id="notes" className="mt-14 scroll-mt-28 pb-2 sm:mt-16">
      <div className="mb-5">
        <h2 className="font-serif text-3xl text-ink">Notes</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          {planned
            ? "Group chat for this trip — who’s in, ideas, reminders."
            : "For the whole group. Photo comments live on each photo."}
        </p>
      </div>
      <Comments tripId={trip.id} initialComments={tripNotes} />
    </section>
  );

  const photosSection = (
    <section id="photos" className="mt-14 scroll-mt-28 sm:mt-16">
      <div className="mb-5">
        <h2 className="font-serif text-3xl text-ink">Photos</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          {planned
            ? photos.length === 0
              ? "Empty until you’re back — plan above, shoot later."
              : "Early frames. Open any shot or clip to preview & comment."
            : "Open photos or videos to preview · starred picks show ★ · comment & download."}
        </p>
      </div>

      {planned && photos.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-sand-300/90 bg-white/40 px-6 py-12 text-center">
          <p className="font-serif text-xl text-ink">Album after the trip</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            Focus on the plan and notes for now. Upload photos when you’re home.
          </p>
        </div>
      ) : (
        <>
          <PhotoGallery
            tripId={trip.id}
            initialPhotos={photos}
            initialComments={allComments}
          />
          <PhotoUpload tripId={trip.id} />
        </>
      )}
    </section>
  );

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
        <div className="relative mx-auto max-w-7xl px-5 pt-14 pb-8 sm:px-8 sm:pt-16 sm:pb-10 xl:px-10">
          <div className="flex flex-wrap items-center gap-2">
            {planned && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/60 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-sea" aria-hidden />
                Planning
              </span>
            )}
            <p className="text-xs tracking-[0.16em] text-ink-soft/80 uppercase sm:text-sm">
              {trip.destination}
            </p>
          </div>

          <h1 className="mt-2 max-w-3xl font-serif text-3xl text-ink sm:text-5xl">
            {trip.title}
          </h1>
          {trip.subtitle && (
            <p className="mt-2 max-w-2xl text-base text-ink-soft sm:text-lg">
              {trip.subtitle}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-white/65 px-3.5 py-1.5 text-ink-soft backdrop-blur-sm">
              {formatDateRange(trip.startDate, trip.endDate)}
              {planned ? " · draft" : ""}
            </span>
            <span className="rounded-full bg-white/65 px-3.5 py-1.5 text-ink-soft backdrop-blur-sm">
              {days} {days === 1 ? "day" : "days"}
            </span>
            {trip.members.map((m) => (
              <span
                key={m}
                className="rounded-full bg-white/65 px-3.5 py-1.5 text-ink-soft backdrop-blur-sm"
              >
                {m}
              </span>
            ))}
          </div>

          {trip.summary && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft/90 sm:text-[15px]">
              {trip.summary}
            </p>
          )}
        </div>
      </section>

      <TripSectionNav tabs={navTabs} />

      {/* Wide workspace on desktop — itinerary | map+budget */}
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 xl:px-10">
        <Suspense
          fallback={
            <TripPlanner
              trip={publicTrip}
              planned={planned}
              dayCount={days}
            />
          }
        >
          <CollabPlanShell
            trip={publicTrip}
            planned={planned}
            dayCount={days}
            collabEnabled={Boolean(trip.collabToken)}
            verifiedToken={verifiedToken}
          />
        </Suspense>

        {planned ? (
          <>
            {notesSection}
            <div className="pb-8">{photosSection}</div>
          </>
        ) : (
          <>
            {photosSection}
            <div className="pb-8">{notesSection}</div>
          </>
        )}
      </div>
    </div>
  );
}
