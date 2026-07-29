"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { TripWaypoint } from "@/lib/types";
import { getMapboxToken } from "@/lib/map-config";
import { buildPinHtml, offsetOverlappingCoords } from "@/lib/map-pins";
import "mapbox-gl/dist/mapbox-gl.css";

type Props = {
  stops: TripWaypoint[];
  multi: boolean;
  zoom: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
};

function stopKey(s: TripWaypoint, i: number) {
  return s.id || s.itemId || `i-${i}`;
}

export function TripMapCanvasMapbox({
  stops,
  multi,
  zoom,
  selectedId,
  onSelect,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  onSelectRef.current = onSelect;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    const el = containerRef.current;
    const token = getMapboxToken();
    if (!el || !token || stops.length === 0) return;

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
      // True path uses real coords; markers may be nudged when stacked
      const trueCoords = stops.map((s) => [s.lng, s.lat] as [number, number]);
      const display = offsetOverlappingCoords(
        stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      );

      if (multi && trueCoords.length > 1) {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: trueCoords },
          },
        });
        map.addLayer({
          id: "route-line-halo",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#fffcf7",
            "line-width": 7,
            "line-opacity": 0.9,
          },
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
        });
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

      if (multi && trueCoords.length > 1) {
        const bounds = trueCoords.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(trueCoords[0], trueCoords[0]),
        );
        map.fitBounds(bounds, { padding: 52, maxZoom: 14, duration: 0 });
      }

      map.resize();
    });

    mapRef.current = map;
    const t = window.setTimeout(() => map.resize(), 100);

    return () => {
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
