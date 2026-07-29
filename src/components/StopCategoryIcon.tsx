import type { StopCategoryId } from "@/lib/stop-categories";
import {
  categoryChipClass,
  getStopCategory,
  isStopCategoryId,
} from "@/lib/stop-categories";

type IconProps = {
  category: string;
  className?: string;
  /** pixel size of the SVG */
  size?: number;
};

/**
 * Small line icons per stop category (food, stay, sight, …).
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
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true as const,
  };

  switch (id as StopCategoryId) {
    case "food":
      // utensil / fork-knife simplified
      return (
        <svg {...common}>
          <path d="M8 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
          <path d="M10 13v8" />
          <path d="M16 3v18" />
          <path d="M16 3c2 0 3 1.5 3 4s-1 4-3 4" />
        </svg>
      );
    case "stay":
      // bed
      return (
        <svg {...common}>
          <path d="M3 19V9a2 2 0 0 1 2-2h6v12" />
          <path d="M13 19V7h6a2 2 0 0 1 2 2v10" />
          <path d="M3 19h18" />
          <path d="M3 14h18" />
        </svg>
      );
    case "sight":
      // camera / landmark pin with mountain
      return (
        <svg {...common}>
          <path d="M4 18 9.5 9l3 4.5L15 10l5 8H4z" />
          <circle cx="8" cy="7" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "activity":
      // hiking / person
      return (
        <svg {...common}>
          <circle cx="14" cy="5" r="2" />
          <path d="M12 22v-5l-2.5-3 2-4.5 3.5 2 3 6" />
          <path d="m7 13 3 1.5" />
          <path d="M5 22 8.5 14" />
        </svg>
      );
    case "transport":
      // plane simplified as car/arrow path
      return (
        <svg {...common}>
          <path d="M4 16h12a3 3 0 0 0 0-6H9L5 6" />
          <path d="M4 16 2 20" />
          <path d="m16 10 4-2v8l-4-2" />
          <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="16" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "shop":
      // bag
      return (
        <svg {...common}>
          <path d="M6 8h12l-1 12H7L6 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "other":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4" />
          <circle cx="12" cy="16" r="0.8" fill="currentColor" stroke="none" />
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
