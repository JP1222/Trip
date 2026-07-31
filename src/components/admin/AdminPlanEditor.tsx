"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TripMap } from "@/components/TripMap";
import {
  reverseGeocode,
  searchPlaces,
  type PlaceSuggestion,
} from "@/lib/geocode";
import { newItemId } from "@/lib/plan";
import {
  StopCategoryIcon,
  StopListMarker,
} from "@/components/StopCategoryIcon";
import {
  STOP_CATEGORIES,
  categoryChipClass,
  normalizeStopCategory,
} from "@/lib/stop-categories";
import { TripBudgetPanel } from "@/components/TripBudgetPanel";
import type {
  DayPlan,
  ItineraryItem,
  StopCategory,
  Trip,
  TripBudget,
  TripLocation,
} from "@/lib/types";

type Props = {
  trip: Trip;
  /** admin = full admin API; collab = public plan API with token */
  mode?: "admin" | "collab";
  /** Capability invite token (plan scope); sent with collab saves. */
  editToken?: string;
};

type DayFilter = "all" | number;
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

function emptyItem(): ItineraryItem {
  return {
    id: newItemId(),
    title: "New stop",
    time: "",
    location: "",
    description: "",
    category: "sight",
  };
}

function emptyDay(n: number, date = ""): DayPlan {
  return {
    day: n,
    date,
    title: `Day ${n}`,
    items: [emptyItem()],
  };
}

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

function findItem(
  days: DayPlan[],
  id: string,
): { dayIndex: number; itemIndex: number; day: DayPlan; item: ItineraryItem } | null {
  for (let di = 0; di < days.length; di++) {
    const ii = days[di].items.findIndex((it) => it.id === id);
    if (ii >= 0) {
      return { dayIndex: di, itemIndex: ii, day: days[di], item: days[di].items[ii] };
    }
  }
  return null;
}

/**
 * Visual plan editor — same layout as the public Plan page.
 * Click a stop to edit in place; map click drops a pin; changes auto-save.
 */
export function AdminPlanEditor({
  trip,
  mode = "admin",
  editToken,
}: Props) {
  const [days, setDays] = useState<DayPlan[]>(() =>
    trip.days.length > 0
      ? structuredClone(trip.days)
      : [emptyDay(1, trip.startDate)],
  );
  const [tipsText, setTipsText] = useState((trip.tips || []).join("\n"));
  const [budget, setBudget] = useState<TripBudget>(
    () =>
      trip.budget
        ? structuredClone(trip.budget)
        : { currency: "USD", items: [] },
  );
  const [mapCenter, setMapCenter] = useState({
    lat: trip.location?.lat ?? 36.16,
    lng: trip.location?.lng ?? -86.78,
    zoom: trip.location?.zoom ?? 12,
    label: trip.location?.label || trip.destination || "Trip",
  });

  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [placeFocused, setPlaceFocused] = useState(false);
  /** True only after the user types in Place — never on load / stop switch. */
  const [placeSearchArmed, setPlaceSearchArmed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSave = useRef(true);
  const saveGen = useRef(0);

  // Latest payload for save (avoids stale closures in timers)
  const daysRef = useRef(days);
  const tipsRef = useRef(tipsText);
  const budgetRef = useRef(budget);
  const mapRef = useRef(mapCenter);
  daysRef.current = days;
  tipsRef.current = tipsText;
  budgetRef.current = budget;
  mapRef.current = mapCenter;

  const selected = selectedId ? findItem(days, selectedId) : null;

  // Keep place field in sync when selection changes — do not open suggestions
  useEffect(() => {
    if (selected) {
      setPlaceQuery(selected.item.location || selected.item.title || "");
      setSuggestions([]);
      setPlaceFocused(false);
      setPlaceSearchArmed(false);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Place typeahead — only after the user types
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!placeSearchArmed || !placeFocused) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const q = placeQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      setSearching(true);
      void searchPlaces(q, {
        proximity: { lat: mapCenter.lat, lng: mapCenter.lng },
      })
        .then(setSuggestions)
        .finally(() => setSearching(false));
    }, 280);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [placeQuery, placeFocused, placeSearchArmed, mapCenter.lat, mapCenter.lng]);

  const visibleDays = useMemo(() => {
    if (dayFilter === "all") return days;
    return days.filter((d) => d.day === dayFilter);
  }, [days, dayFilter]);

  const listRows = useMemo(() => {
    const rows: {
      day: DayPlan;
      item: ItineraryItem;
      pin: number | null;
    }[] = [];
    let pin = 0;
    for (const day of visibleDays) {
      for (const item of day.items) {
        const hasPin =
          item.lat != null &&
          item.lng != null &&
          Number.isFinite(item.lat) &&
          Number.isFinite(item.lng);
        if (hasPin) pin += 1;
        rows.push({ day, item, pin: hasPin ? pin : null });
      }
    }
    return rows;
  }, [visibleDays]);

  const mapStops = useMemo(() => {
    const stops: {
      id: string;
      lat: number;
      lng: number;
      label: string;
      day?: number;
      category?: StopCategory;
    }[] = [];
    const source =
      dayFilter === "all" ? days : days.filter((d) => d.day === dayFilter);
    for (const day of source) {
      for (const item of day.items) {
        if (
          item.lat != null &&
          item.lng != null &&
          Number.isFinite(item.lat) &&
          Number.isFinite(item.lng)
        ) {
          stops.push({
            id: item.id,
            lat: item.lat,
            lng: item.lng,
            label: item.location || item.title,
            day: day.day,
            category: item.category,
          });
        }
      }
    }
    return stops;
  }, [days, dayFilter]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const persist = useCallback(async () => {
    const gen = ++saveGen.current;
    setSaveState("saving");
    setError(null);
    try {
      const d = daysRef.current;
      const cleaned: DayPlan[] = d.map((day, i) => ({
        day: i + 1,
        date: day.date,
        title: day.title.trim() || `Day ${i + 1}`,
        items: day.items
          .filter((it) => it.title.trim())
          .map((it) => ({
            id: it.id || newItemId(),
            title: it.title.trim(),
            time: it.time?.trim() || undefined,
            location: it.location?.trim() || undefined,
            description: it.description?.trim() || undefined,
            category: normalizeStopCategory(it.category),
            lat:
              it.lat != null && Number.isFinite(Number(it.lat))
                ? Number(it.lat)
                : undefined,
            lng:
              it.lng != null && Number.isFinite(Number(it.lng))
                ? Number(it.lng)
                : undefined,
          })),
      }));

      const tips = tipsRef.current
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);

      const mc = mapRef.current;
      const location: TripLocation = {
        lat: mc.lat,
        lng: mc.lng,
        zoom: mc.zoom,
        label: mc.label,
      };

      const url =
        mode === "collab"
          ? `/api/trips/${trip.id}/plan`
          : `/api/admin/trips/${trip.id}`;
      const body =
        mode === "collab"
          ? {
              token: editToken,
              days: cleaned,
              tips,
              location,
              budget: budgetRef.current,
            }
          : {
              days: cleaned,
              tips,
              location,
              budget: budgetRef.current,
            };

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (gen !== saveGen.current) return;
      setSaveState("saved");
    } catch (err) {
      if (gen !== saveGen.current) return;
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }, [mode, editToken, trip.id]);

  const scheduleSave = useCallback(() => {
    if (skipAutoSave.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("pending");
    saveTimer.current = setTimeout(() => {
      void persist();
    }, 700);
  }, [persist]);

  // Auto-save when plan data changes
  useEffect(() => {
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    scheduleSave();
  }, [days, tipsText, budget, mapCenter, scheduleSave]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function patchItem(id: string, patch: Partial<ItineraryItem>) {
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        items: d.items.map((it) =>
          it.id === id ? { ...it, ...patch } : it,
        ),
      })),
    );
  }

  function patchDay(dayNum: number, patch: Partial<DayPlan>) {
    setDays((prev) =>
      prev.map((d) => (d.day === dayNum ? { ...d, ...patch } : d)),
    );
  }

  function selectStop(id: string) {
    setSelectedId((cur) => (cur === id ? null : id));
    requestAnimationFrame(() => {
      document.getElementById(`admin-stop-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  function addStop(dayNum: number) {
    const item = emptyItem();
    setDays((prev) =>
      prev.map((d) =>
        d.day === dayNum ? { ...d, items: [...d.items, item] } : d,
      ),
    );
    setSelectedId(item.id);
    setDayFilter(dayNum);
  }

  function addDay() {
    setDays((prev) => {
      const n = prev.length + 1;
      const day = emptyDay(n);
      setSelectedId(day.items[0].id);
      setDayFilter(n);
      return [...prev, day];
    });
  }

  function removeStop(id: string) {
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        items: d.items.filter((it) => it.id !== id),
      })),
    );
    if (selectedId === id) setSelectedId(null);
  }

  function removeDay(dayNum: number) {
    setDays((prev) => {
      if (prev.length <= 1) return prev;
      return prev
        .filter((d) => d.day !== dayNum)
        .map((d, i) => ({ ...d, day: i + 1 }));
    });
    setDayFilter("all");
    setSelectedId(null);
  }

  function applySuggestion(s: PlaceSuggestion) {
    if (!selectedId) return;
    patchItem(selectedId, {
      location: s.name,
      lat: s.lat,
      lng: s.lng,
      title:
        findItem(days, selectedId)?.item.title === "New stop" ||
        !findItem(days, selectedId)?.item.title
          ? s.name
          : findItem(days, selectedId)!.item.title,
    });
    setPlaceSearchArmed(false);
    setPlaceQuery(s.placeName);
    setSuggestions([]);
    setMapCenter((c) => ({
      ...c,
      lat: s.lat,
      lng: s.lng,
      label: s.name,
    }));
  }

  async function onMapClick(lat: number, lng: number) {
    if (!selectedId) {
      setHint("Select a stop first, then click the map.");
      setTimeout(() => setHint(null), 2500);
      return;
    }
    const id = selectedId;
    const cur = findItem(days, id)?.item;
    patchItem(id, { lat, lng });
    setHint("Looking up place name…");

    const place = await reverseGeocode(lat, lng);
    if (place) {
      const rename =
        !cur?.title || cur.title === "New stop" || cur.title === cur.location;
      patchItem(id, {
        lat,
        lng,
        location: place.name,
        title: rename ? place.name : cur!.title,
      });
      setPlaceSearchArmed(false);
      setPlaceQuery(place.placeName);
      setSuggestions([]);
      setMapCenter((c) => ({ ...c, lat, lng }));
      setHint("Pin + place set — auto-saving.");
    } else {
      setHint("Pin dropped (no name found).");
    }
    setTimeout(() => setHint(null), 2500);
  }

  function reorderWithinDay(dayNum: number, fromId: string, toId: string) {
    if (fromId === toId) return;
    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayNum) return d;
        const items = [...d.items];
        const from = items.findIndex((it) => it.id === fromId);
        const to = items.findIndex((it) => it.id === toId);
        if (from < 0 || to < 0) return d;
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        return { ...d, items };
      }),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Click a stop to edit · drag to reorder · map click sets pin
        </p>
        <div className="flex items-center gap-2">
          {hint && <p className="text-xs text-ink-muted">{hint}</p>}
          {error && <p className="text-xs text-coral">{error}</p>}
          {saveState === "error" && (
            <button
              type="button"
              onClick={() => void persist()}
              className="rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-white hover:bg-ink-soft"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        <button
          type="button"
          onClick={() => setDayFilter("all")}
          className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition ${
            dayFilter === "all"
              ? "bg-ink text-white shadow-sm"
              : "border border-sand-200 bg-white text-ink-soft hover:text-ink"
          }`}
        >
          All days
        </button>
        {days.map((d) => (
          <button
            key={d.day}
            type="button"
            onClick={() => setDayFilter(d.day)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition ${
              dayFilter === d.day
                ? "bg-ink text-white shadow-sm"
                : "border border-sand-200 bg-white text-ink-soft hover:text-ink"
            }`}
          >
            Day {d.day}
            {d.date && (
              <span
                className={`ml-1.5 ${dayFilter === d.day ? "text-white/70" : "text-ink-muted"}`}
              >
                {formatDayChipDate(d.date)}
              </span>
            )}
            <span
              className={`ml-1.5 tabular-nums ${dayFilter === d.day ? "text-white/55" : "text-ink-muted/80"}`}
            >
              · {d.items.length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,1.05fr)] xl:grid-cols-[minmax(0,1fr)_minmax(420px,1.1fr)]">
        {/* Left: schedule with in-place expand editor */}
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          {visibleDays.map((day) => (
            <article
              key={day.day}
              className="overflow-hidden rounded-3xl border border-sand-200/80 bg-white/80 shadow-[0_4px_24px_rgba(42,38,34,0.03)]"
            >
              <header className="flex flex-wrap items-center gap-2 border-b border-sand-200/70 bg-sand-50/90 px-4 py-3 sm:px-5">
                <span className="rounded-full bg-sea/12 px-2.5 py-0.5 text-xs font-semibold text-sea">
                  Day {day.day}
                </span>
                <input
                  value={day.title}
                  onChange={(e) => patchDay(day.day, { title: e.target.value })}
                  className="min-w-0 flex-1 border-0 bg-transparent font-serif text-lg text-ink outline-none focus:ring-0 sm:text-xl"
                  placeholder="Day title"
                />
                <input
                  type="date"
                  value={day.date}
                  onChange={(e) => patchDay(day.day, { date: e.target.value })}
                  className="rounded-lg border border-sand-200 bg-white px-2 py-1 text-xs text-ink-muted"
                />
                {days.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDay(day.day)}
                    className="text-xs text-coral hover:underline"
                  >
                    Remove day
                  </button>
                )}
              </header>

              <ol className="divide-y divide-sand-100">
                {day.items.map((item, itemIndex) => {
                  const row = listRows.find((r) => r.item.id === item.id);
                  const pin = row?.pin ?? null;
                  const active = selectedId === item.id;
                  const isDragOver =
                    dragOverId === item.id && dragId !== item.id;
                  return (
                    <li
                      key={item.id}
                      id={`admin-stop-${item.id}`}
                      draggable={!active}
                      onDragStart={(e) => {
                        if (active) {
                          e.preventDefault();
                          return;
                        }
                        setDragId(item.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", item.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverId !== item.id) setDragOverId(item.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverId === item.id) setDragOverId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from =
                          e.dataTransfer.getData("text/plain") || dragId;
                        if (from) reorderWithinDay(day.day, from, item.id);
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      className={`${
                        isDragOver
                          ? "bg-sea/10 ring-1 ring-inset ring-sea/25"
                          : ""
                      } ${dragId === item.id ? "opacity-50" : ""} ${
                        active ? "bg-sea/[0.06]" : ""
                      }`}
                    >
                      {/* Summary row */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => selectStop(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectStop(item.id);
                          }
                        }}
                        className={`flex w-full gap-3 px-4 py-3.5 text-left transition sm:gap-4 sm:px-5 sm:py-4 ${
                          active
                            ? "cursor-default"
                            : "cursor-pointer hover:bg-sand-50/80"
                        }`}
                      >
                        <div className="flex w-11 shrink-0 flex-col items-center gap-1.5 pt-0.5 sm:w-12">
                          <StopListMarker
                            order={itemIndex + 1}
                            category={item.category}
                            active={active}
                          />
                          {item.time ? (
                            <span className="text-[11px] tabular-nums leading-tight text-coral">
                              {item.time}
                            </span>
                          ) : (
                            <span className="text-[10px] text-ink-muted/60">
                              —
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">
                            {item.title || "Untitled stop"}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {item.location ||
                              (pin != null
                                ? `Pin ${pin}`
                                : "No place yet — click to edit")}
                          </p>
                          {!active && item.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                              {item.description}
                            </p>
                          )}
                        </div>
                        {!active && (
                          <span
                            className="shrink-0 self-center text-ink-muted/50"
                            title="Drag to reorder"
                            aria-hidden
                          >
                            ⋮⋮
                          </span>
                        )}
                        {active && (
                          <span className="shrink-0 self-center text-[11px] text-sea">
                            Editing
                          </span>
                        )}
                      </div>

                      {/* In-place editor */}
                      {active && (
                        <div
                          className="border-t border-sea/15 bg-white px-4 pb-4 pt-3 sm:px-5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-medium tracking-[0.12em] text-sea uppercase">
                                Day {day.day} · stop
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedId(null)}
                                  className="text-xs text-ink-muted hover:text-ink"
                                >
                                  Done
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeStop(item.id)}
                                  className="text-xs text-coral hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>

                            <label className="block">
                              <span className="mb-1 block text-xs text-ink-muted">
                                Title
                              </span>
                              <input
                                value={item.title}
                                onChange={(e) =>
                                  patchItem(item.id, { title: e.target.value })
                                }
                                className="w-full rounded-xl border border-sand-200 bg-sand-50/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-sea/40 focus:ring-2 focus:ring-sea/10"
                                placeholder="What are you doing?"
                                autoFocus
                              />
                            </label>

                            <div>
                              <span className="mb-1.5 block text-xs text-ink-muted">
                                Category
                              </span>
                              <div
                                className="flex flex-wrap gap-1.5"
                                role="group"
                                aria-label="Stop category"
                              >
                                {STOP_CATEGORIES.map((c) => {
                                  const on = item.category === c.id;
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      title={c.hint}
                                      onClick={() =>
                                        patchItem(item.id, { category: c.id })
                                      }
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition ${
                                        on
                                          ? `${categoryChipClass(c.id)} ring-1 ring-inset ring-black/10`
                                          : "bg-sand-100 text-ink-muted hover:bg-sand-200/80"
                                      }`}
                                    >
                                      <StopCategoryIcon
                                        category={c.id}
                                        size={12}
                                      />
                                      {c.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <label className="block">
                                <span className="mb-1 block text-xs text-ink-muted">
                                  Time
                                </span>
                                <input
                                  value={item.time || ""}
                                  onChange={(e) =>
                                    patchItem(item.id, {
                                      time: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-xl border border-sand-200 bg-sand-50/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-sea/40 focus:ring-2 focus:ring-sea/10"
                                  placeholder="15:00"
                                />
                              </label>
                              <label className="col-span-2 block">
                                <span className="mb-1 block text-xs text-ink-muted">
                                  Place · search or click map
                                </span>
                                <div className="relative">
                                  <input
                                    value={placeQuery}
                                    onChange={(e) => {
                                      setPlaceSearchArmed(true);
                                      setPlaceQuery(e.target.value);
                                      patchItem(item.id, {
                                        location: e.target.value,
                                      });
                                    }}
                                    onFocus={() => {
                                      if (placeBlurTimer.current) {
                                        clearTimeout(placeBlurTimer.current);
                                        placeBlurTimer.current = null;
                                      }
                                      setPlaceFocused(true);
                                    }}
                                    onBlur={() => {
                                      placeBlurTimer.current = setTimeout(
                                        () => {
                                          setPlaceFocused(false);
                                          setSuggestions([]);
                                        },
                                        180,
                                      );
                                    }}
                                    className="w-full rounded-xl border border-sand-200 bg-sand-50/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-sea/40 focus:ring-2 focus:ring-sea/10"
                                    placeholder="Broadway, Nashville"
                                    autoComplete="off"
                                  />
                                  {placeFocused &&
                                    placeSearchArmed &&
                                    (suggestions.length > 0 || searching) && (
                                      <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-sand-200 bg-white py-1 shadow-lg">
                                        {searching &&
                                          suggestions.length === 0 && (
                                            <li className="px-3 py-2 text-xs text-ink-muted">
                                              Searching…
                                            </li>
                                          )}
                                        {suggestions.map((s) => (
                                          <li key={s.id}>
                                            <button
                                              type="button"
                                              onMouseDown={(e) =>
                                                e.preventDefault()
                                              }
                                              onClick={() => {
                                                applySuggestion(s);
                                                setPlaceFocused(false);
                                                setPlaceSearchArmed(false);
                                                setSuggestions([]);
                                              }}
                                              className="w-full px-3 py-2 text-left text-sm hover:bg-sand-50"
                                            >
                                              <span className="block font-medium text-ink">
                                                {s.name}
                                              </span>
                                              <span className="block text-[11px] text-ink-muted">
                                                {s.placeName}
                                              </span>
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                </div>
                              </label>
                            </div>

                            <label className="block">
                              <span className="mb-1 block text-xs text-ink-muted">
                                Notes
                              </span>
                              <textarea
                                value={item.description || ""}
                                onChange={(e) =>
                                  patchItem(item.id, {
                                    description: e.target.value,
                                  })
                                }
                                rows={2}
                                className="w-full resize-y rounded-xl border border-sand-200 bg-sand-50/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-sea/40 focus:ring-2 focus:ring-sea/10"
                                placeholder="Optional detail for friends"
                              />
                            </label>

                            <p className="text-[11px] leading-relaxed text-ink-muted">
                              {item.lat != null && item.lng != null ? (
                                <>
                                  Pin{" "}
                                  <span className="tabular-nums text-ink-soft">
                                    {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                                  </span>
                                  {" · "}
                                  click map to move
                                </>
                              ) : (
                                <>
                                  No coordinates yet — pick a suggestion or
                                  click the map.
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="border-t border-sand-100 px-4 py-2.5 sm:px-5">
                <button
                  type="button"
                  onClick={() => addStop(day.day)}
                  className="text-xs font-medium text-sea hover:underline"
                >
                  + Add stop
                </button>
              </div>
            </article>
          ))}

          <button
            type="button"
            onClick={addDay}
            className="w-full rounded-2xl border border-dashed border-sand-300 bg-white/60 px-4 py-3 text-sm font-medium text-ink-soft transition hover:border-sea/40 hover:bg-white hover:text-sea"
          >
            + Day
          </button>
        </div>

        {/* Right: map only */}
        <div className="order-1 space-y-3 lg:order-2 lg:sticky lg:top-24">
          <TripMap
            lat={
              selected?.item.lat != null && Number.isFinite(selected.item.lat)
                ? selected.item.lat
                : mapCenter.lat
            }
            lng={
              selected?.item.lng != null && Number.isFinite(selected.item.lng)
                ? selected.item.lng
                : mapCenter.lng
            }
            zoom={mapCenter.zoom}
            label={mapCenter.label}
            destination={trip.destination}
            stops={
              mapStops.length > 0
                ? mapStops
                : [
                    {
                      id: "center",
                      lat: mapCenter.lat,
                      lng: mapCenter.lng,
                      label: mapCenter.label,
                    },
                  ]
            }
            showStopList={false}
            dayHint={
              dayFilter === "all"
                ? selected
                  ? "Click map to place selected stop"
                  : "Select a stop, then click map"
                : `Day ${dayFilter}`
            }
            selectedId={selectedId}
            onSelectStop={(id) => setSelectedId(id)}
            onMapClick={onMapClick}
          />
        </div>
      </div>

      <div className="mt-6 space-y-6 lg:mt-8">
        <TripBudgetPanel
          budget={budget}
          members={trip.members}
          editable
          onChange={setBudget}
        />

        <section className="overflow-hidden rounded-3xl border border-sand-200/80 bg-white/70">
          <div className="border-b border-sand-200/70 px-4 py-3.5 sm:px-5">
            <h3 className="font-serif text-xl text-ink">Checklist</h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              One tip per line · on the public trip page
            </p>
          </div>
          <div className="px-4 py-3.5 sm:px-5">
            <textarea
              value={tipsText}
              onChange={(e) => setTipsText(e.target.value)}
              rows={5}
              className="w-full resize-y rounded-2xl border border-sand-200 bg-sand-50/50 px-3.5 py-3 text-sm leading-relaxed text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-sea/40 focus:bg-white focus:ring-2 focus:ring-sea/10"
              placeholder={"Book lodging\nWho’s in?"}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
