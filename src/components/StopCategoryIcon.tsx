import type { StopCategoryId } from "@/lib/stop-categories";
import {
  categoryChipClass,
  getStopCategory,
  isStopCategoryId,
} from "@/lib/stop-categories";
import { categoryPinColor } from "@/lib/map-pins";

type IconProps = {
  category: string;
  className?: string;
  /** pixel size of the SVG */
  size?: number;
};

/**
 * Small filled/outline icons per stop category.
 * Bold shapes so they stay readable at ~12–14px (list marker badge).
 */
export function StopCategoryIcon({
  category,
  className = "",
  size = 12,
}: IconProps) {
  const id = isStopCategoryId(category) ? category : "other";
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true as const,
  };

  switch (id as StopCategoryId) {
    case "food":
      // coffee cup — reads clearly at small size
      return (
        <svg {...common}>
          <path d="M5 9h11v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9z" />
          <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
          <path d="M8 4.5c.5 1 .5 2 0 3M11 4.5c.5 1 .5 2 0 3" />
        </svg>
      );
    case "stay":
      // house
      return (
        <svg {...common}>
          <path d="M4 11 12 4l8 7" />
          <path d="M6 10.5V20h12v-9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "sight":
      // camera
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7 9.5 4.5h5L16 7" />
          <circle cx="12" cy="13.5" r="3.25" />
        </svg>
      );
    case "activity":
      // star — simple, unmistakable for “event / fun”
      return (
        <svg {...common}>
          <path d="M12 3.5 14.4 9.2l6.1.5-4.7 4 1.5 6-5.3-3.2L6.7 19.7l1.5-6-4.7-4 6.1-.5L12 3.5z" />
        </svg>
      );
    case "transport":
      // car side profile
      return (
        <svg {...common}>
          <path d="M4 14h16v3.5a1 1 0 0 1-1 1h-1.2" />
          <path d="M5.5 14 7.5 8.5h9L18.5 14" />
          <circle cx="8" cy="17.5" r="1.75" />
          <circle cx="16" cy="17.5" r="1.75" />
          <path d="M8 11.5h8" />
        </svg>
      );
    case "shop":
      // shopping bag
      return (
        <svg {...common}>
          <path d="M6 8h12l-1.1 12.5a1 1 0 0 1-1 .9H8.1a1 1 0 0 1-1-.9L6 8z" />
          <path d="M9 8V6.2A3 3 0 0 1 12 3.2 3 3 0 0 1 15 6.2V8" />
        </svg>
      );
    case "other":
    default:
      // map pin
      return (
        <svg {...common}>
          <path d="M12 21s6.5-5 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 16 12 21 12 21z" />
          <circle cx="12" cy="10.5" r="2.25" />
        </svg>
      );
  }
}

type BadgeProps = {
  category?: string | null;
  /** show text label next to icon (default true) */
  showLabel?: boolean;
  className?: string;
};

/** Colored chip with category icon + optional label */
export function StopCategoryBadge({
  category,
  showLabel = true,
  className = "",
}: BadgeProps) {
  const meta = getStopCategory(category);
  if (!meta) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${categoryChipClass(meta.id)} ${className}`}
      title={meta.hint}
    >
      <StopCategoryIcon category={meta.id} size={11} />
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

type ListMarkerProps = {
  /** 1-based order within the day / list (not map pin index) */
  order: number;
  category?: string | null;
  active?: boolean;
  className?: string;
};

/**
 * Itinerary list marker: order number + small SVG category badge (no emoji).
 */
export function StopListMarker({
  order,
  category,
  active = false,
  className = "",
}: ListMarkerProps) {
  const meta = getStopCategory(category);
  // Color always = category (never override on select — that looked like a random orange).
  const color = categoryPinColor(category);
  const title = meta
    ? `${order}. ${meta.label}${active ? " · selected" : ""}`
    : `Stop ${order}`;

  return (
    <span
      className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center ${className}`}
      title={title}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-sm ${
          active
            ? "ring-2 ring-coral ring-offset-2 ring-offset-[#fffcf7]"
            : "ring-2 ring-white/90"
        }`}
        style={{ background: color }}
        aria-hidden
      >
        {order}
      </span>
      {meta ? (
        <span
          className="absolute -right-0.5 -bottom-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/8"
          style={{ color }}
          aria-hidden
        >
          <StopCategoryIcon category={meta.id} size={11} />
        </span>
      ) : null}
      <span className="sr-only">{title}</span>
    </span>
  );
}
