"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TripWaypoint } from "@/lib/types";
import {
  formatDriveDistance,
  formatDriveDuration,
  type DrivingRoute,
} from "@/lib/driving-route";
import {
  availableMapProviders,
  defaultMapProvider,
  MAP_PROVIDER_STORAGE_KEY,
  type MapProviderId,
} from "@/lib/map-config";

const TripMapCanvasMapbox = dynamic(
  () =>
    import("@/components/map/TripMapCanvasMapbox").then(
      (m) => m.TripMapCanvasMapbox,
    ),
  { ssr: false },
);
const TripMapCanvasGoogle = dynamic(
  () =>
    import("@/components/map/TripMapCanvasGoogle").then(
      (m) => m.TripMapCanvasGoogle,
    ),
  { ssr: false },
);

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
  label?: string;
  destination?: string;
  stops?: TripWaypoint[];
  showStopList?: boolean;
  dayHint?: string;
  selectedId?: string | null;
  onSelectStop?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  /** Shorter map chrome for the admin visual editor */
  compact?: boolean;
};

function openMapHref(
  stops: TripWaypoint[],
  lat: number,
  lng: number,
) {
  const s = stops[0] || { lat, lng };
  if (stops.length <= 1) {
    return `https://www.google.com/maps?q=${s.lat},${s.lng}`;
  }
  const path = stops.map((p) => `${p.lat},${p.lng}`).join("/");
  return `https://www.google.com/maps/dir/${path}`;
}

export function TripMap({
  lat,
  lng,
  zoom = 11,
  label,
  destination,
  stops: stopsProp,
  showStopList = true,
  dayHint,
  selectedId,
  onSelectStop,
  onMapClick,
  compact = false,
}: Props) {
  const providers = useMemo(() => availableMapProviders(), []);
  const [provider, setProvider] = useState<MapProviderId>(defaultMapProvider);
  const [drive, setDrive] = useState<DrivingRoute | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        MAP_PROVIDER_STORAGE_KEY,
      ) as MapProviderId | null;
      if (saved === "mapbox" || saved === "google") {
        const entry = providers.find((p) => p.id === saved);
        if (entry?.ready) setProvider(saved);
      }
    } catch {
      /* ignore */
    }
  }, [providers]);

  function selectProvider(id: MapProviderId) {
    const entry = providers.find((p) => p.id === id);
    if (!entry?.ready) return;
    setProvider(id);
    setDrive(null);
    try {
      localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  const stops = useMemo(() => {
    if (stopsProp && stopsProp.length > 0) return stopsProp;
    return [
      {
        id: "center",
        lat,
        lng,
        label: label || destination || "Trip",
      },
    ] satisfies TripWaypoint[];
  }, [stopsProp, lat, lng, label, destination]);

  // Clear stats when stop set changes (canvas will re-report)
  const stopsKey = stops.map((s) => `${s.id}:${s.lat},${s.lng}`).join("|");
  useEffect(() => {
    setDrive(null);
  }, [stopsKey, provider]);

  const onRouteInfo = useCallback((route: DrivingRoute | null) => {
    setDrive(route);
  }, []);

  const multi = stops.length > 1;
  const caption = label || destination || stops[0]?.label || "Trip location";
  const active = providers.find((p) => p.id === provider);
  const anyReady = providers.some((p) => p.ready);
  const readyCount = providers.filter((p) => p.ready).length;
  const canvasKey = `${provider}-${stopsKey}`;

  const driveLabel =
    multi && drive
      ? `${formatDriveDistance(drive.distanceMeters)} · ${formatDriveDuration(drive.durationSeconds)} drive`
      : null;

  const subtitle = dayHint
    ? `${dayHint} · ${stops.length} ${stops.length === 1 ? "pin" : "pins"}`
    : multi
      ? driveLabel || `${stops.length} stops · driving route`
      : caption;

  return (
    <aside className="overflow-hidden rounded-3xl border border-sand-200/80 bg-white/70 shadow-[0_8px_30px_rgba(42,38,34,0.04)]">
      <div className="border-b border-sand-200/70 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-serif text-lg text-ink sm:text-xl">
              {multi ? "Route" : "Map"}
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
          </div>

          {readyCount > 1 && (
            <div
              className="flex shrink-0 rounded-full border border-sand-200/90 bg-sand-50/90 p-0.5"
              role="tablist"
              aria-label="Map style"
            >
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={provider === p.id}
                  disabled={!p.ready}
                  title={p.hint || p.label}
                  onClick={() => selectProvider(p.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    provider === p.id
                      ? "bg-ink text-white shadow-sm"
                      : p.ready
                        ? "text-ink-soft hover:text-ink"
                        : "cursor-not-allowed text-ink-muted/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!active?.ready && (
          <p className="mt-2 text-[11px] text-coral">
            {active?.hint || "Provider unavailable"}
            {anyReady ? " — pick the other map tab." : "."}
          </p>
        )}
      </div>

      <div
        className={
          compact
            ? "relative aspect-[4/3] w-full bg-sand-100 sm:aspect-[5/4]"
            : "relative aspect-[5/4] min-h-[280px] w-full bg-sand-100 sm:aspect-square sm:min-h-[360px] lg:min-h-[420px]"
        }
      >
        {provider === "mapbox" && active?.ready ? (
          <TripMapCanvasMapbox
            key={canvasKey}
            stops={stops}
            multi={multi}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={onSelectStop}
            onMapClick={onMapClick}
            onRouteInfo={onRouteInfo}
          />
        ) : provider === "google" && active?.ready ? (
          <TripMapCanvasGoogle
            key={canvasKey}
            stops={stops}
            multi={multi}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={onSelectStop}
            onMapClick={onMapClick}
            onRouteInfo={onRouteInfo}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-medium text-ink-soft">Map unavailable</p>
            <p className="text-xs text-ink-muted">
              Add a Mapbox or Google key in{" "}
              <code className="text-[11px]">.env.local</code>.
            </p>
          </div>
        )}
      </div>

      {showStopList && multi && (
        <ol className="max-h-36 space-y-0.5 overflow-y-auto border-b border-sand-200/70 px-2 py-2 sm:px-3">
          {stops.map((s, i) => {
            const id = s.id || s.itemId || `i-${i}`;
            const on = selectedId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelectStop?.(id)}
                  className={`flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition ${
                    on
                      ? "bg-sea/12 text-ink"
                      : "text-ink-soft hover:bg-sand-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                      on ? "bg-sea text-white" : "bg-sea/15 text-sea"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 leading-snug">
                    {s.day != null && (
                      <span className="text-ink-muted">Day {s.day} · </span>
                    )}
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
        <p className="min-w-0 truncate text-sm font-medium text-ink">
          {caption}
        </p>
        <a
          href={openMapHref(stops, lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-ink-soft"
        >
          Directions
        </a>
      </div>
    </aside>
  );
}
