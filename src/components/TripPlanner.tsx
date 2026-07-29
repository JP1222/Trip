"use client";

import { useEffect, useMemo, useState } from "react";
import { TripMap } from "@/components/TripMap";
import type { Trip, TripLocation } from "@/lib/types";
import {
  buildPlanStops,
  filterPlanStops,
  pinNumberForStop,
  planStopsToWaypoints,
  type DayFilter,
  type PlanStop,
} from "@/lib/plan";
import { StopCategoryBadge } from "@/components/StopCategoryIcon";
import { TripBudgetPanel } from "@/components/TripBudgetPanel";

type Props = {
  trip: Trip;
  planned: boolean;
  dayCount: number;
};

function formatDayChipDate(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function checklistKey(tripId: string) {
  return `trip-checklist:${tripId}`;
}

/**
 * Full trip planner — day filter, list↔map sync, share, checklist.
 * Pattern language from Wanderlog / TripIt / Roadtrippers.
 */
export function TripPlanner({ trip, planned, dayCount }: Props) {
  const allStops = useMemo(() => buildPlanStops(trip), [trip]);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(checklistKey(trip.id));
      if (raw) setChecked(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, [trip.id]);

  function toggleCheck(tip: string) {
    setChecked((prev) => {
      const next = { ...prev, [tip]: !prev[tip] };
      try {
        localStorage.setItem(checklistKey(trip.id), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const filtered = useMemo(
    () => filterPlanStops(allStops, dayFilter),
    [allStops, dayFilter],
  );

  const mapWaypoints = useMemo(
    () => planStopsToWaypoints(filtered),
    [filtered],
  );

  const location: TripLocation | undefined = trip.location;
  const hasMap =
    Boolean(location) &&
    (mapWaypoints.length > 0 ||
      (location != null &&
        Number.isFinite(location.lat) &&
        Number.isFinite(location.lng)));

  const days = trip.days;
  const members = trip.members;
  const tips = trip.tips ?? [];

  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);

  function onListSelect(stop: PlanStop) {
    setSelectedId(stop.id);
    setMapSelectedId(stop.pinId || null);
    requestAnimationFrame(() => {
      document
        .getElementById(`stop-${stop.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function onMapSelect(pinId: string) {
    setMapSelectedId(pinId);
    const match =
      filtered.find((s) => s.pinId === pinId || s.id === pinId) ||
      allStops.find((s) => s.pinId === pinId || s.id === pinId);
    if (match) {
      setSelectedId(match.id);
      if (dayFilter !== "all" && match.day !== dayFilter) {
        setDayFilter(match.day);
      }
      requestAnimationFrame(() => {
        document
          .getElementById(`stop-${match.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  async function sharePlan() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `${trip.title} — ${trip.destination}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: trip.title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied");
      setTimeout(() => setShareMsg(null), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg("Link copied");
        setTimeout(() => setShareMsg(null), 2000);
      } catch {
        setShareMsg("Could not share");
        setTimeout(() => setShareMsg(null), 2000);
      }
    }
  }

  // Group filtered stops by day for rendering
  const byDay = useMemo(() => {
    const map = new Map<number, PlanStop[]>();
    for (const s of filtered) {
      const list = map.get(s.day) || [];
      list.push(s);
      map.set(s.day, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const checkedCount = tips.filter((t) => checked[t]).length;

  return (
    <section id="plan" className="mt-10 scroll-mt-28 sm:mt-12">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-3xl text-ink">
            {planned ? "Plan" : "Itinerary"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {planned
              ? "Switch days · tap a stop · map follows."
              : "Switch days to focus the map. Tap stops or pins."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dl className="flex flex-wrap gap-2 text-xs sm:text-sm">
            <div className="rounded-full border border-sand-200/90 bg-white/80 px-3 py-1.5 text-ink-soft">
              <dd>
                {dayCount} {dayCount === 1 ? "day" : "days"}
              </dd>
            </div>
            {allStops.length > 0 && (
              <div className="rounded-full border border-sand-200/90 bg-white/80 px-3 py-1.5 text-ink-soft">
                <dd>
                  {allStops.length}{" "}
                  {allStops.length === 1 ? "stop" : "stops"}
                </dd>
              </div>
            )}
            {mapWaypoints.length > 0 && dayFilter !== "all" && (
              <div className="rounded-full border border-sea/20 bg-sea/10 px-3 py-1.5 text-sea">
                <dd>
                  {mapWaypoints.length} on map
                </dd>
              </div>
            )}
          </dl>
          <button
            type="button"
            onClick={() => void sharePlan()}
            className="rounded-full border border-sand-200/90 bg-white px-3.5 py-1.5 text-xs font-medium text-ink-soft transition hover:border-sea/30 hover:text-sea sm:text-sm"
          >
            {shareMsg || "Share"}
          </button>
        </div>
      </div>

      {/* Day chips */}
      {days.length > 1 && (
        <div
          className="mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filter by day"
        >
          <button
            type="button"
            role="tab"
            aria-selected={dayFilter === "all"}
            onClick={() => {
              setDayFilter("all");
              setSelectedId(null);
              setMapSelectedId(null);
            }}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition ${
              dayFilter === "all"
                ? "bg-ink text-white shadow-sm"
                : "border border-sand-200/90 bg-white/70 text-ink-soft hover:border-sand-300 hover:text-ink"
            }`}
          >
            All days
          </button>
          {days.map((d) => {
            const active = dayFilter === d.day;
            const n = allStops.filter((s) => s.day === d.day).length;
            return (
              <button
                key={d.day}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setDayFilter(d.day);
                  setSelectedId(null);
                  setMapSelectedId(null);
                }}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-ink text-white shadow-sm"
                    : "border border-sand-200/90 bg-white/70 text-ink-soft hover:border-sand-300 hover:text-ink"
                }`}
              >
                <span>Day {d.day}</span>
                {d.date && (
                  <span
                    className={`ml-1.5 ${active ? "text-white/70" : "text-ink-muted"}`}
                  >
                    {formatDayChipDate(d.date)}
                  </span>
                )}
                {n > 0 && (
                  <span
                    className={`ml-1.5 tabular-nums ${active ? "text-white/55" : "text-ink-muted/80"}`}
                  >
                    · {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Desktop: itinerary left · map/budget right (Wanderlog-style workspace) */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)] 2xl:gap-10">
        {/* Map first on mobile */}
        <div className="order-1 space-y-3 lg:order-2 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-4">
          {hasMap && location ? (
            <TripMap
              lat={location.lat}
              lng={location.lng}
              zoom={location.zoom}
              label={location.label}
              destination={trip.destination}
              stops={
                mapWaypoints.length > 0
                  ? mapWaypoints
                  : [
                      {
                        id: "center",
                        lat: location.lat,
                        lng: location.lng,
                        label: location.label || trip.destination,
                      },
                    ]
              }
              showStopList={false}
              dayHint={
                dayFilter === "all" ? undefined : `Day ${dayFilter}`
              }
              selectedId={mapSelectedId}
              onSelectStop={onMapSelect}
            />
          ) : (
            <aside className="overflow-hidden rounded-3xl border border-dashed border-sand-300/90 bg-white/55">
              <div className="border-b border-sand-200/60 px-4 py-3 sm:px-5">
                <h3 className="font-serif text-lg text-ink">Map</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Add coordinates on stops in admin
                </p>
              </div>
              <div className="flex aspect-[5/4] flex-col items-center justify-center gap-2 bg-[linear-gradient(160deg,#f3ebe0,#e4d9c8)] px-6 text-center sm:aspect-square">
                <p className="text-sm font-medium text-ink-soft">
                  {trip.destination && trip.destination !== "TBD"
                    ? trip.destination
                    : "No place on the map yet"}
                </p>
                <p className="max-w-[16rem] text-xs leading-relaxed text-ink-muted">
                  In admin, set lat/lng on each stop — pins and route appear
                  automatically.
                </p>
              </div>
            </aside>
          )}

          {members.length > 0 && (
            <div className="rounded-2xl border border-sand-200/80 bg-white/60 px-4 py-3">
              <p className="text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
                Going
              </p>
              <p className="mt-1 text-sm text-ink-soft">{members.join(" · ")}</p>
            </div>
          )}

          {tips.length > 0 && (
            <div className="rounded-2xl border border-sand-200/80 bg-white/60 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium tracking-[0.12em] text-sea uppercase">
                  {planned ? "Checklist" : "Tips"}
                </p>
                {planned && (
                  <span className="text-[11px] text-ink-muted">
                    {checkedCount}/{tips.length}
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-2">
                {tips.map((tip) => (
                  <li key={tip}>
                    {planned ? (
                      <label className="flex cursor-pointer gap-2.5 text-xs leading-snug text-ink-soft">
                        <input
                          type="checkbox"
                          checked={Boolean(checked[tip])}
                          onChange={() => toggleCheck(tip)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-sand-300 text-sea focus:ring-sea/30"
                        />
                        <span
                          className={
                            checked[tip] ? "text-ink-muted line-through" : ""
                          }
                        >
                          {tip}
                        </span>
                      </label>
                    ) : (
                      <span className="flex gap-2 text-xs leading-snug text-ink-soft">
                        <span
                          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sea/45"
                          aria-hidden
                        />
                        {tip}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className="order-2 min-w-0 lg:order-1">
          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-sand-300/90 bg-white/45 px-6 py-12 text-center">
              <p className="font-serif text-xl text-ink">No stops yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
                {planned
                  ? "Open admin → Plan editor to add days and stops."
                  : "This trip has no day-by-day plan."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {byDay.map(([dayNum, items]) => {
                const meta = items[0];
                return (
                  <article
                    key={dayNum}
                    id={`day-${dayNum}`}
                    className="overflow-hidden rounded-3xl border border-sand-200/80 bg-white/75 shadow-[0_4px_24px_rgba(42,38,34,0.03)]"
                  >
                    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-sand-200/70 bg-sand-50/90 px-4 py-3.5 sm:px-5">
                      <span className="rounded-full bg-sea/12 px-2.5 py-0.5 text-xs font-semibold text-sea">
                        Day {dayNum}
                      </span>
                      <h3 className="font-serif text-lg text-ink sm:text-xl">
                        {meta?.dayTitle || `Day ${dayNum}`}
                      </h3>
                      {meta?.date && (
                        <span className="text-xs text-ink-muted sm:text-sm">
                          {formatDayChipDate(meta.date)}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-ink-muted">
                        {items.length}{" "}
                        {items.length === 1 ? "stop" : "stops"}
                      </span>
                    </header>

                    <ol className="divide-y divide-sand-100">
                      {items.map((stop) => {
                        const pinN = pinNumberForStop(stop, filtered);
                        const active = selectedId === stop.id;
                        return (
                          <li key={stop.id} id={`stop-${stop.id}`}>
                            <button
                              type="button"
                              onClick={() => onListSelect(stop)}
                              className={`flex w-full gap-3 px-4 py-3.5 text-left transition sm:gap-4 sm:px-5 sm:py-4 ${
                                active
                                  ? "bg-sea/[0.07]"
                                  : "hover:bg-sand-50/80"
                              }`}
                            >
                              <div className="flex w-12 shrink-0 flex-col items-center pt-0.5 sm:w-14">
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold shadow-sm ${
                                    active
                                      ? "bg-coral text-white"
                                      : pinN != null
                                        ? "bg-sea text-white"
                                        : "border border-sand-300 bg-white text-ink-muted"
                                  }`}
                                >
                                  {pinN ?? "·"}
                                </span>
                                {stop.time ? (
                                  <time className="mt-1.5 text-[11px] tabular-nums leading-tight text-coral">
                                    {stop.time}
                                  </time>
                                ) : (
                                  <span className="mt-1.5 text-[10px] text-ink-muted/60">
                                    —
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <h4 className="font-medium leading-snug text-ink">
                                    {stop.title}
                                  </h4>
                                  <StopCategoryBadge category={stop.category} />
                                </div>
                                {stop.place && (
                                  <p className="mt-1 text-xs text-ink-muted">
                                    {stop.place}
                                    {pinN != null && (
                                      <span className="text-ink-muted/70">
                                        {" "}
                                        · pin {pinN}
                                      </span>
                                    )}
                                  </p>
                                )}
                                {stop.description && (
                                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                                    {stop.description}
                                  </p>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Budget as its own full-width block under the workspace */}
      {trip.budget &&
        (trip.budget.items.length > 0 ||
          (trip.budget.limit != null && trip.budget.limit > 0)) && (
          <div className="mt-6 lg:mt-8">
            <TripBudgetPanel budget={trip.budget} />
          </div>
        )}
    </section>
  );
}
