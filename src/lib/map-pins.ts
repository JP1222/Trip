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

/** Minimal SVG path (viewBox 0 0 24 24) for pin glyphs — match list icon set */
function glyphPath(category?: string | null): string {
  const id =
    category && isStopCategoryId(category) ? category : ("other" as const);
  const s = `fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"`;
  switch (id) {
    case "food":
      return `<path d="M5 9h11v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 4.5c.5 1 .5 2 0 3M11 4.5c.5 1 .5 2 0 3" ${s}/>`;
    case "stay":
      return `<path d="M4 11 12 4l8 7M6 10.5V20h12v-9.5M10 20v-5h4v5" ${s}/>`;
    case "sight":
      return `<rect x="3" y="7" width="18" height="13" rx="2" ${s}/><path d="M8 7 9.5 4.5h5L16 7" ${s}/><circle cx="12" cy="13.5" r="3.25" ${s}/>`;
    case "activity":
      return `<path d="M12 3.5 14.4 9.2l6.1.5-4.7 4 1.5 6-5.3-3.2L6.7 19.7l1.5-6-4.7-4 6.1-.5L12 3.5z" ${s}/>`;
    case "transport":
      return `<path d="M4 14h16v3.5a1 1 0 0 1-1 1h-1.2M5.5 14 7.5 8.5h9L18.5 14M8 11.5h8" ${s}/><circle cx="8" cy="17.5" r="1.75" ${s}/><circle cx="16" cy="17.5" r="1.75" ${s}/>`;
    case "shop":
      return `<path d="M6 8h12l-1.1 12.5a1 1 0 0 1-1 .9H8.1a1 1 0 0 1-1-.9L6 8zM9 8V6.2A3 3 0 0 1 12 3.2 3 3 0 0 1 15 6.2V8" ${s}/>`;
    default:
      return `<path d="M12 21s6.5-5 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 16 12 21 12 21z" ${s}/><circle cx="12" cy="10.5" r="2.25" ${s}/>`;
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
