"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdminChromeActions,
  adminChromePillClass,
} from "@/components/admin/AdminChrome";
import {
  AdminAutosaveStatus,
  type AutosavePhase,
} from "@/components/admin/AdminSaveButton";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import type { Trip, TripVisibility } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "lived" as const, label: "Lived" },
  { value: "planned" as const, label: "Planning" },
];

const VISIBILITY_OPTIONS = [
  { value: "public" as const, label: "Public" },
  { value: "private" as const, label: "Private" },
];

const AUTOSAVE_MS = 1200;
/** Only show Saving… if the request is still going after this. */
const SAVING_HINT_MS = 450;

export function TripAdminForm({ trip }: { trip: Trip }) {
  const [title, setTitle] = useState(trip.title);
  const [subtitle, setSubtitle] = useState(trip.subtitle);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [summary, setSummary] = useState(trip.summary);
  const [members, setMembers] = useState(trip.members.join(", "));
  const [tripStatus, setTripStatus] = useState<"lived" | "planned">(
    trip.status === "planned" ? "planned" : "lived",
  );
  const [visibility, setVisibility] = useState<TripVisibility>(
    trip.visibility === "private" ? "private" : "public",
  );
  const [phase, setPhase] = useState<AutosavePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const ready = useRef(false);
  const lastSaved = useRef("");
  const inFlight = useRef(false);
  const serializedRef = useRef("");

  const payload = useMemo(
    () => ({
      title,
      subtitle,
      destination,
      startDate,
      endDate,
      summary,
      status: tripStatus,
      visibility,
      members: members
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    }),
    [
      title,
      subtitle,
      destination,
      startDate,
      endDate,
      summary,
      tripStatus,
      visibility,
      members,
    ],
  );

  const serialized = useMemo(() => JSON.stringify(payload), [payload]);
  serializedRef.current = serialized;

  async function persist() {
    if (inFlight.current) return;
    const body = serializedRef.current;
    if (body === lastSaved.current) return;

    inFlight.current = true;
    setError(null);
    const hintTimer = window.setTimeout(() => setPhase("saving"), SAVING_HINT_MS);
    try {
      const res = await fetch(`/api/admin/trips/${trip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      lastSaved.current = body;
      // Only celebrate if nothing newer was typed during the request.
      if (serializedRef.current === body) {
        setPhase("saved");
        window.setTimeout(() => {
          setPhase((p) => (p === "saved" ? "idle" : p));
        }, 1600);
      } else {
        setPhase("idle");
      }
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      window.clearTimeout(hintTimer);
      inFlight.current = false;
      if (serializedRef.current !== lastSaved.current) {
        void persist();
      }
    }
  }

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      lastSaved.current = serialized;
      return;
    }
    if (serialized === lastSaved.current) return;

    const timer = window.setTimeout(() => {
      void persist();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  const field =
    "w-full rounded-xl border border-sand-200/80 bg-white/70 px-3.5 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-muted/45 hover:border-sand-300 focus:border-sea/35 focus:bg-white focus:ring-2 focus:ring-sea/10";
  const label =
    "mb-1.5 block text-[11px] font-medium tracking-[0.14em] text-ink-muted uppercase";

  return (
    <>
      <AdminChromeActions>
        <AdminSegmentedControl
          ariaLabel="Trip status"
          value={tripStatus}
          options={STATUS_OPTIONS}
          onChange={setTripStatus}
        />
        <AdminSegmentedControl
          ariaLabel="Visibility"
          value={visibility}
          options={VISIBILITY_OPTIONS}
          onChange={setVisibility}
        />
        <Link
          href={`/trips/${trip.id}`}
          target="_blank"
          className={adminChromePillClass}
        >
          View
        </Link>
      </AdminChromeActions>
      <AdminAutosaveStatus phase={phase} />

      <div className="space-y-8">
        <header className="space-y-3 border-b border-sand-200/70 pb-8">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Trip title"
            aria-label="Title"
            className="w-full border-0 bg-transparent font-serif text-3xl leading-tight text-ink outline-none placeholder:text-ink-muted/35 sm:text-4xl"
          />
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Place · Region · Country"
            aria-label="Destination"
            className="w-full border-0 bg-transparent text-base text-ink-soft outline-none placeholder:text-ink-muted/40 sm:text-lg"
          />
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle — a short line under the title"
            aria-label="Subtitle"
            className="w-full border-0 bg-transparent text-sm text-ink-muted outline-none placeholder:text-ink-muted/40"
          />
        </header>

        <section className="space-y-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl text-ink">Details</h2>
            <p className="text-xs text-ink-muted">Autosaves as you edit</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Start</span>
              <input
                type="date"
                className={field}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>End</span>
              <input
                type="date"
                className={field}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>Members</span>
              <input
                className={field}
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                placeholder="Peng, Friends"
              />
            </label>
          </div>

          <label className="block">
            <span className={label}>Summary</span>
            <textarea
              className={`${field} min-h-[5.5rem] resize-y leading-relaxed`}
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What this trip is about — mood, who it’s for, what you’ll remember."
            />
          </label>

          {error ? (
            <p className="text-sm text-coral" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
