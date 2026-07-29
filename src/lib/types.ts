/** food | stay | sight | activity | transport | shop | other */
export type StopCategory =
  | "food"
  | "stay"
  | "sight"
  | "activity"
  | "transport"
  | "shop"
  | "other";

export type ItineraryItem = {
  id: string;
  time?: string;
  title: string;
  description?: string;
  /** Place name (shown under the title) */
  location?: string;
  /** Kind of stop — food, stay, sight, … */
  category?: StopCategory;
  /** Optional coords — when set, this stop appears on the map */
  lat?: number;
  lng?: number;
};

export type DayPlan = {
  day: number;
  date: string;
  title: string;
  items: ItineraryItem[];
};

/** One stop on the trip map (ordered = travel path) */
export type TripWaypoint = {
  lat: number;
  lng: number;
  /** Name shown on the pin / list */
  label: string;
  /** Optional day number for “Day 2 · …” */
  day?: number;
  /** Stable id for selection sync (usually itinerary item id) */
  id?: string;
  /** @deprecated prefer id */
  itemId?: string;
  /** For colored / icon pins on the map */
  category?: StopCategory;
};

/** Map shown beside the travel plan — center + optional multi-stop route */
export type TripLocation = {
  lat: number;
  lng: number;
  /** Used when there is only one stop */
  zoom?: number;
  /** Short title under the map */
  label?: string;
  /**
   * Specific places in visit order. When 2+ stops exist, the map draws
   * markers + a path instead of a single city pin.
   */
  stops?: TripWaypoint[];
};

/** lived = memories on the wall; planned = upcoming trip you’re planning together */
export type TripStatus = "lived" | "planned";

/** Expense line for the trip budget */
export type BudgetItem = {
  id: string;
  label: string;
  amount: number;
  /** stay | food | transport | activity | other */
  category?: string;
  paidBy?: string;
};

export type TripBudget = {
  /** ISO-ish code, e.g. USD */
  currency: string;
  /** Optional spending cap */
  limit?: number;
  items: BudgetItem[];
};

export type Trip = {
  id: string;
  title: string;
  subtitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  /**
   * Wall + trip page tone.
   * Omit or "lived" = past trip with photos.
   * "planned" = upcoming plan (dashed polaroid, plan-first page).
   */
  status?: TripStatus;
  coverGradient: string;
  coverEmoji: string;
  /** Optional cover photo URL for the wall */
  coverImage?: string;
  /** Extra showcase images (URLs) until friends upload real shots */
  showcase?: { src: string; caption: string }[];
  /** Optional map (single pin or multi-stop route) */
  location?: TripLocation;
  summary: string;
  members: string[];
  days: DayPlan[];
  /** Planning checklist / tips */
  tips?: string[];
  /**
   * Secret for shared collab edit link: /trips/{id}?edit={collabToken}
   * Anyone with the link can edit plan + budget (not admin photos).
   */
  collabToken?: string;
  /** Shared group budget */
  budget?: TripBudget;
};

export type PhotoMeta = {
  id: string;
  tripId: string;
  filename: string;
  originalName: string;
  uploader: string;
  caption?: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type Comment = {
  id: string;
  tripId: string;
  /** When set, comment is on a single photo; when omitted, trip-level note */
  photoId?: string;
  author: string;
  body: string;
  createdAt: string;
};
