import type { StopCategoryId } from "@/lib/stop-categories";
import { isStopCategoryId } from "@/lib/stop-categories";

/** Fill colors for map pins by category */
export function categoryPinColor(category?: string | null): string {
  if (!category || !isStopCategoryId(category)) return "#3d6664";
  const map: Record<StopCategoryId, string> = {
    food: "#c45c48",
    stay: "#b8893a",
    sight: "#3d6664",
    activity: "#4a7a5c",
    transport: "#4a6f8c",
    shop: "#8a7355",
    other: "#5c564e",
  };
  return map[category];
}

/** Minimal SVG path (viewBox 0 0 24 24) for pin glyphs */
function glyphPath(category?: string | null): string {
  const id =
    category && isStopCategoryId(category) ? category : ("other" as const);
  switch (id) {
    case "food":
      return `<path d="M8 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M10 13v8M16 3v18M16 3c2 0 3 1.5 3 4s-1 4-3 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
    case "stay":
      return `<path d="M3 19V9a2 2 0 0 1 2-2h6v12M13 19V7h6a2 2 0 0 1 2 2v10M3 19h18M3 14h18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
    case "sight":
      return `<path d="M4 18 9.5 9l3 4.5L15 10l5 8H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="8" cy="7" r="1.4" fill="currentColor"/>`;
    case "activity":
      return `<circle cx="14" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 22v-5l-2.5-3 2-4.5 3.5 2 3 6M7 13l3 1.5M5 22 8.5 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
    case "transport":
      return `<path d="M4 16h12a3 3 0 0 0 0-6H9L5 6M4 16 2 20m14-10 4-2v8l-4-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="15" cy="16" r="1.2" fill="currentColor"/>`;
    case "shop":
      return `<path d="M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
    default:
      return `<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 9v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="15.5" r="0.9" fill="currentColor"/>`;
  }
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Mapbox marker HTML: big number in category-colored disc + small icon badge.
 * (Avoids tall icon+number stack that crowds overlapping pins.)
 */
export function buildPinHtml(opts: {
  label: string;
  index?: number;
  multi?: boolean;
  category?: string | null;
}): string {
  const color = categoryPinColor(opts.category);
  const cat =
    opts.category && isStopCategoryId(opts.category) ? opts.category : "other";
  const num =
    opts.multi && opts.index != null
      ? String(opts.index)
      : "";
  const glyph = glyphPath(opts.category);

  return `<button type="button" class="trip-map-marker__pin trip-map-marker__pin--${cat}" style="--pin-color:${color}" aria-label="${escapeAttr(opts.label)}">
    <span class="trip-map-marker__core" style="background:${color}">
      ${num ? `<span class="trip-map-marker__num">${num}</span>` : `<span class="trip-map-marker__glyph trip-map-marker__glyph--solo" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" style="color:#fff">${glyph}</svg></span>`}
    </span>
    ${
      num
        ? `<span class="trip-map-marker__badge" style="color:${color}" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24">${glyph}</svg></span>`
        : ""
    }
  </button>`;
}

/**
 * Nudge markers that sit on (nearly) the same coordinates so pins are readable.
 * Display-only — does not change stored lat/lng.
 * ~0.00012 deg ≈ 13m at mid-latitudes.
 */
export function offsetOverlappingCoords(
  points: { lat: number; lng: number }[],
  minDeg = 0.00018,
): { lat: number; lng: number }[] {
  if (points.length <= 1) return points.map((p) => ({ ...p }));

  const out = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const groups = new Map<string, number[]>();

  for (let i = 0; i < out.length; i++) {
    // quantize so near-identical points share a bucket
    const key = `${out[i].lat.toFixed(4)},${out[i].lng.toFixed(4)}`;
    const g = groups.get(key) || [];
    g.push(i);
    groups.set(key, g);
  }

  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const n = idxs.length;
    idxs.forEach((idx, k) => {
      const angle = (2 * Math.PI * k) / n - Math.PI / 2;
      const r = minDeg * (0.85 + 0.15 * n);
      out[idx] = {
        lat: out[idx].lat + r * Math.sin(angle),
        lng: out[idx].lng + r * Math.cos(angle),
      };
    });
  }

  return out;
}

/** Google Maps SVG pin: category color + number */
export function buildPinSvgDataUrl(opts: {
  index?: number;
  multi?: boolean;
  category?: string | null;
  active?: boolean;
}): string {
  const color = opts.active ? "#b56a4e" : categoryPinColor(opts.category);
  const size = 44;
  const cx = size / 2;
  const cy = size / 2;
  const r = opts.active ? 15 : 14;
  const num =
    opts.multi && opts.index != null
      ? `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="700" font-family="system-ui,sans-serif">${opts.index}</text>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#fffcf7" stroke-width="2.5"/>
    ${num}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
