"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { TripWaypoint } from "@/lib/types";
import { getMapboxToken } from "@/lib/map-config";
import {
  fetchMapboxDrivingRoute,
  straightLinePath,
  type DrivingRoute,
  type LatLng,
} from "@/lib/driving-route";
import { buildPinHtml, offsetOverlappingCoords } from "@/lib/map-pins";
import "mapbox-gl/dist/mapbox-gl.css";

type Props = {
  stops: TripWaypoint[];
  multi: boolean;
  zoom: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  /** Fires when a driving route (or failure → null) is ready */
  onRouteInfo?: (route: DrivingRoute | null) => void;
};

function stopKey(s: TripWaypoint, i: number) {
  return s.id || s.itemId || `i-${i}`;
}

function toLngLat(path: LatLng[]): [number, number][] {
  return path.map((p) => [p.lng, p.lat]);
}

function setRouteSource(map: mapboxgl.Map, coords: [number, number][]) {
  const data = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: coords },
  };
  const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
    return;
  }
  map.addSource("route", { type: "geojson", data });
  map.addLayer({
    id: "route-line-halo",
    type: "line",
    source: "route",
    paint: {
      "line-color": "#fffcf7",
      "line-width": 7,
      "line-opacity": 0.9,
    },
    layout: { "line-join": "round", "line-cap": "round" },
  });
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    paint: {
      "line-color": "#3d6664",
      "line-width": 3.5,
      "line-opacity": 0.95,
    },
    layout: { "line-join": "round", "line-cap": "round" },
  });
}

export function TripMapCanvasMapbox({
  stops,
  multi,
  zoom,
  selectedId,
  onSelect,
  onMapClick,
  onRouteInfo,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  const onRouteInfoRef = useRef(onRouteInfo);
  onSelectRef.current = onSelect;
  onMapClickRef.current = onMapClick;
  onRouteInfoRef.current = onRouteInfo;

  useEffect(() => {
    const el = containerRef.current;
    const token = getMapboxToken();
    if (!el || !token || stops.length === 0) return;

    let cancelled = false;
    mapboxgl.accessToken = token;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    el.innerHTML = "";

    const center: [number, number] = [stops[0].lng, stops[0].lat];
    const map = new mapboxgl.Map({
      container: el,
      style: "mapbox://styles/mapbox/light-v11",
      center,
      zoom,
      attributionControl: true,
      cooperativeGestures: true,
    });

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("click", (e) => {
      onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });

    map.on("load", () => {
      if (cancelled) return;

      const display = offsetOverlappingCoords(
        stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      );

      // Straight line first so something shows while routing loads
      if (multi && stops.length > 1) {
        const fallback = toLngLat(straightLinePath(stops));
        setRouteSource(map, fallback);
      }

      stops.forEach((s, i) => {
        const id = stopKey(s, i);
        const elPin = document.createElement("div");
        elPin.className = "trip-map-marker";
        elPin.dataset.stopId = id;
        if (s.category) elPin.dataset.category = s.category;
        elPin.innerHTML = buildPinHtml({
          label: s.label,
          index: i + 1,
          multi,
          category: s.category,
        });
        elPin.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current?.(id);
        });
        const title = s.day != null ? `Day ${s.day} · ${s.label}` : s.label;
        const pos = display[i] || s;
        const marker = new mapboxgl.Marker({ element: elPin, anchor: "center" })
          .setLngLat([pos.lng, pos.lat])
          .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(title))
          .addTo(map);
        markersRef.current.push(marker);
      });

      const pinCoords = stops.map((s) => [s.lng, s.lat] as [number, number]);
      if (multi && pinCoords.length > 1) {
        const bounds = pinCoords.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(pinCoords[0], pinCoords[0]),
        );
        map.fitBounds(bounds, { padding: 52, maxZoom: 14, duration: 0 });
      }

      map.resize();

      if (multi && stops.length > 1) {
        void fetchMapboxDrivingRoute(stops, token).then((road) => {
          if (cancelled) return;
          if (!road || !mapRef.current) {
            onRouteInfoRef.current?.(null);
            return;
          }
          const coords = toLngLat(road.path);
          setRouteSource(map, coords);
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new mapboxgl.LngLatBounds(coords[0], coords[0]),
          );
          map.fitBounds(bounds, { padding: 52, maxZoom: 14, duration: 600 });
          onRouteInfoRef.current?.(road);
        });
      } else {
        onRouteInfoRef.current?.(null);
      }
    });

    mapRef.current = map;
    const t = window.setTimeout(() => map.resize(), 100);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    multi,
    zoom,
    stops
      .map(
        (s, i) =>
          `${stopKey(s, i)}:${s.lat},${s.lng}:${s.category || ""}`,
      )
      .join("|"),
  ]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll(".trip-map-marker").forEach((node) => {
      const el = node as HTMLElement;
      const id = el.dataset.stopId;
      el.classList.toggle("trip-map-marker--active", id === selectedId);
    });

    if (!selectedId || !mapRef.current) return;
    const stop = stops.find((s, i) => stopKey(s, i) === selectedId);
    if (stop) {
      mapRef.current.easeTo({
        center: [stop.lng, stop.lat],
        zoom: Math.max(mapRef.current.getZoom(), 12),
        duration: 450,
      });
    }
  }, [selectedId, stops]);

  return (
    <div
      ref={containerRef}
      className="trip-map-canvas trip-map-canvas--mapbox absolute inset-0 z-0 h-full w-full"
    />
  );
}
