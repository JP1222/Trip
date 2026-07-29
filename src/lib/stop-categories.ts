/** Stop kinds for the itinerary (food, stay, sights, …). */

export const STOP_CATEGORY_IDS = [
  "food",
  "stay",
  "sight",
  "activity",
  "transport",
  "shop",
  "other",
] as const;

export type StopCategoryId = (typeof STOP_CATEGORY_IDS)[number];

export type StopCategoryMeta = {
  id: StopCategoryId;
  /** Short chip label */
  label: string;
  /** One-line hint in the editor */
  hint: string;
  /** Tailwind-ish token for chips (used as class suffixes via map) */
  tone: "coral" | "sea" | "sage" | "gold" | "ink" | "sand" | "sky";
};

export const STOP_CATEGORIES: StopCategoryMeta[] = [
  {
    id: "food",
    label: "Food",
    hint: "Meals, cafés, bars",
    tone: "coral",
  },
  {
    id: "stay",
    label: "Stay",
    hint: "Hotel, Airbnb, camp",
    tone: "gold",
  },
  {
    id: "sight",
    label: "Sight",
    hint: "Landmarks, views, museums",
    tone: "sea",
  },
  {
    id: "activity",
    label: "Activity",
    hint: "Hikes, shows, tours",
    tone: "sage",
  },
  {
    id: "transport",
    label: "Transit",
    hint: "Flights, trains, drives",
    tone: "sky",
  },
  {
    id: "shop",
    label: "Shop",
    hint: "Markets, souvenirs",
    tone: "sand",
  },
  {
    id: "other",
    label: "Other",
    hint: "Anything else",
    tone: "ink",
  },
];

const byId = Object.fromEntries(
  STOP_CATEGORIES.map((c) => [c.id, c]),
) as Record<StopCategoryId, StopCategoryMeta>;

export function isStopCategoryId(v: unknown): v is StopCategoryId {
  return (
    typeof v === "string" &&
    (STOP_CATEGORY_IDS as readonly string[]).includes(v)
  );
}

export function getStopCategory(
  id?: string | null,
): StopCategoryMeta | undefined {
  if (!id || !isStopCategoryId(id)) return undefined;
  return byId[id];
}

/** Normalize free-form or missing values */
export function normalizeStopCategory(
  v: unknown,
): StopCategoryId | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v).trim().toLowerCase();
  if (isStopCategoryId(s)) return s;
  // light aliases
  if (s === "dining" || s === "restaurant" || s === "eat" || s === "meal")
    return "food";
  if (s === "hotel" || s === "lodging" || s === "accommodation") return "stay";
  if (
    s === "attraction" ||
    s === "scenic" ||
    s === "museum" ||
    s === "park"
  )
    return "sight";
  if (s === "flight" || s === "train" || s === "drive" || s === "taxi")
    return "transport";
  if (s === "shopping" || s === "market") return "shop";
  return "other";
}

/** Chip classes for list / editor */
export function categoryChipClass(id?: string | null): string {
  const c = getStopCategory(id);
  if (!c) return "bg-sand-100 text-ink-muted";
  switch (c.tone) {
    case "coral":
      return "bg-coral/15 text-coral";
    case "sea":
      return "bg-sea/15 text-sea";
    case "sage":
      return "bg-emerald-800/10 text-emerald-800";
    case "gold":
      return "bg-amber-700/12 text-amber-900";
    case "sky":
      return "bg-sky-700/12 text-sky-900";
    case "sand":
      return "bg-sand-200/80 text-ink-soft";
    case "ink":
    default:
      return "bg-ink/8 text-ink-soft";
  }
}
