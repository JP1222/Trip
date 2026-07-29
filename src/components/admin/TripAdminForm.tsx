"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PhotoMeta, Trip } from "@/lib/types";
import { photoPublicUrl } from "@/lib/photos-client";

export function TripAdminForm({
  trip,
  photos,
}: {
  trip: Trip;
  photos: PhotoMeta[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(trip.title);
  const [subtitle, setSubtitle] = useState(trip.subtitle);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [summary, setSummary] = useState(trip.summary);
  const [coverImage, setCoverImage] = useState(trip.coverImage || "");
  const [members, setMembers] = useState(trip.members.join(", "));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/trips/${trip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          destination,
          startDate,
          endDate,
          summary,
          coverImage,
          members: members
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStatus("Saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function selectCover(url: string) {
    setCoverImage(url);
    setStatus(null);
  }

  const field =
    "w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-sea/40 focus:ring-2 focus:ring-sea/10";

  return (
    <form onSubmit={(e) => void onSave(e)} className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-ink-muted">Title</span>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-ink-muted">Subtitle</span>
          <input
            className={field}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-ink-muted">Destination</span>
          <input
            className={field}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-muted">Start date</span>
          <input
            type="date"
            className={field}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-muted">End date</span>
          <input
            type="date"
            className={field}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-ink-muted">Summary</span>
          <textarea
            className={field}
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-ink-muted">
            Members (comma-separated)
          </span>
          <input
            className={field}
            value={members}
            onChange={(e) => setMembers(e.target.value)}
          />
        </label>
      </div>

      {/* Polaroid face on the home wall */}
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">
              Polaroid photo (home wall)
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              This is the picture on the trip’s polaroid. Click one, then Save
              trip.
            </p>
          </div>
          {coverImage && (
            <button
              type="button"
              onClick={() => selectCover("")}
              className="text-xs text-ink-muted underline hover:text-coral"
            >
              Clear
            </button>
          )}
        </div>

        {coverImage && (
          <div className="mb-4">
            <div
              className="instant pointer-events-none shadow-md"
              style={{ ["--w" as string]: "180px" }}
            >
              <div className="instant__pad">
                <div className="instant__image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverImage} alt="Polaroid preview" />
                </div>
              </div>
              <div className="instant__foot">
                <span className="instant__caption">{title || "Trip"}</span>
              </div>
            </div>
          </div>
        )}

        {photos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand-300 px-4 py-8 text-center text-sm text-ink-muted">
            No photos yet — upload some, then pick which one sits on the
            polaroid.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {photos.map((p) => {
              const url = photoPublicUrl(p.tripId, p.filename);
              const selected = coverImage === url;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectCover(url)}
                    className={`group relative aspect-square w-full overflow-hidden rounded-lg border-2 transition ${
                      selected
                        ? "border-sea ring-2 ring-sea/30"
                        : "border-transparent hover:border-sand-300"
                    }`}
                    title={p.originalName}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={p.caption || p.originalName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {selected && (
                      <span className="absolute inset-x-0 bottom-0 bg-sea/90 py-1 text-center text-[10px] font-medium tracking-wide text-white uppercase">
                        On polaroid
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-coral">{error}</p>}
      {status && <p className="text-sm text-sea">{status}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-ink px-6 py-2.5 text-sm text-white hover:bg-ink-soft disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save trip"}
      </button>
    </form>
  );
}
