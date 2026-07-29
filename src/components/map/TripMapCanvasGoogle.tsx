"use client";

import { useEffect, useRef } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { TripWaypoint } from "@/lib/types";
import { getGoogleMapsKey } from "@/lib/map-config";
import {
  fetchGoogleDrivingRoute,
  straightLinePath,
  type DrivingRoute,
} from "@/lib/driving-route";
import { buildPinSvgDataUrl, offsetOverlappingCoords } from "@/lib/map-pins";

type Props = {
  stops: TripWaypoint[];
  multi: boolean;
  zoom: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onRouteInfo?: (route: DrivingRoute | null) => void;
};

function stopKey(s: TripWaypoint, i: number) {
  return s.id || s.itemId || `i-${i}`;
}

const SOFT_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f2eb" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5c564e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f2eb" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#d4cdc2" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#ebe4d8" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#dce8dc" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e0d8cc" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#f0e6d4" }],
  },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#c5d5d4" }],
  },
];

export function TripMapCanvasGoogle({
  stops,
  multi,
  zoom,
  selectedId,
  onSelect,
  onMapClick,
  onRouteInfo,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<
    {
      id: string;
      marker: google.maps.Marker;
      info: google.maps.InfoWindow;
      category?: string;
    }[]
  >([]);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  const onRouteInfoRef = useRef(onRouteInfo);
  onSelectRef.current = onSelect;
  onMapClickRef.current = onMapClick;
  onRouteInfoRef.current = onRouteInfo;

  useEffect(() => {
    const el = containerRef.current;
    const key = getGoogleMapsKey();
    if (!el || !key || stops.length === 0) return;

    let cancelled = false;

    async function init() {
      setOptions({ key, v: "weekly" });
      const { Map } = await importLibrary("maps");
      const { DirectionsService } = await importLibrary("routes");
      if (cancelled || !el) return;

      markersRef.current = [];
      polylineRef.current = null;
      mapRef.current = null;
      el.innerHTML = "";

      const map = new Map(el, {
        center: { lat: stops[0].lat, lng: stops[0].lng },
        zoom,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "cooperative",
        styles: SOFT_STYLES,
      });
      mapRef.current = map;
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        onMapClickRef.current?.(e.latLng.lat(), e.latLng.lng());
      });

      const pinPath = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
      const display = offsetOverlappingCoords(pinPath);

      if (multi && pinPath.length > 1) {
        polylineRef.current = new google.maps.Polyline({
          path: straightLinePath(stops),
          geodesic: true,
          strokeColor: "#3d6664",
          strokeOpacity: 0.95,
          strokeWeight: 4,
          map,
        });
      }

      const bounds = new google.maps.LatLngBounds();
      stops.forEach((s, i) => {
        const id = stopKey(s, i);
        bounds.extend({ lat: s.lat, lng: s.lng });
        const pos = display[i] || s;
        const title = s.day != null ? `Day ${s.day} · ${s.label}` : s.label;
        const iconUrl = buildPinSvgDataUrl({
          index: i + 1,
          multi,
          category: s.category,
        });
        const marker = new google.maps.Marker({
          map,
          position: { lat: pos.lat, lng: pos.lng },
          title,
          icon: {
            url: iconUrl,
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20),
          },
        });
        const info = new google.maps.InfoWindow({
          content: `<strong style="font-family:system-ui,sans-serif;font-size:13px">${title}</strong>`,
        });
        marker.addListener("click", () => {
          onSelectRef.current?.(id);
          info.open({ map, anchor: marker });
        });
        markersRef.current.push({
          id,
          marker,
          info,
          category: s.category,
        });
      });

      if (multi && stops.length > 1) map.fitBounds(bounds, 48);
      window.setTimeout(() => {
        google.maps.event.trigger(map, "resize");
      }, 100);

      if (multi && stops.length > 1) {
        const service = new DirectionsService();
        const road = await fetchGoogleDrivingRoute(stops, service);
        if (cancelled) return;
        if (!road || !polylineRef.current) {
          onRouteInfoRef.current?.(null);
          return;
        }
        polylineRef.current.setPath(road.path);
        const roadBounds = new google.maps.LatLngBounds();
        for (const p of road.path) roadBounds.extend(p);
        map.fitBounds(roadBounds, 48);
        onRouteInfoRef.current?.(road);
      } else {
        onRouteInfoRef.current?.(null);
      }
    }

    void init().catch((err) => {
      console.error("[TripMap Google]", err);
      if (el) {
        el.innerHTML =
          '<p style="padding:1rem;font-size:13px;color:#8a8278;text-align:center">Google Maps failed to load. Check API key &amp; billing.</p>';
      }
    });

    return () => {
      cancelled = true;
      polylineRef.current = null;
      markersRef.current = [];
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
    const map = mapRef.current;
    markersRef.current.forEach(({ id, marker, info, category }, i) => {
      const active = id === selectedId;
      marker.setIcon({
        url: buildPinSvgDataUrl({
          index: i + 1,
          multi,
          category,
          active,
        }),
        scaledSize: new google.maps.Size(active ? 44 : 40, active ? 44 : 40),
        anchor: new google.maps.Point(active ? 22 : 20, active ? 22 : 20),
      });
      if (active && map) {
        info.open({ map, anchor: marker });
        const pos = marker.getPosition();
        if (pos) map.panTo(pos);
      }
    });
  }, [selectedId, multi]);

  return (
    <div
      ref={containerRef}
      className="trip-map-canvas trip-map-canvas--google absolute inset-0 z-0 h-full w-full"
    />
  );
}
