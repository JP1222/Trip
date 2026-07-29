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

/**
 * Gallery media item (photo, video, or Apple Live Photo). Named PhotoMeta
 * for history; use mimeType / isVideoMedia() / isLivePhoto() to distinguish.
 */
export type PhotoMeta = {
  id: string;
  tripId: string;
  filename: string;
  originalName: string;
  uploader: string;
  caption?: string;
  /**
   * Camera / phone model from EXIF (or inferred), e.g. "iPhone 15 Plus",
   * "Ricoh GR IV HDF". Shown next to the uploader name in the gallery.
   */
  device?: string;
  /** f-number, e.g. 2.8 */
  aperture?: number;
  /** Display shutter speed, e.g. "1/125" or "2s" */
  shutter?: string;
  /** ISO sensitivity */
  iso?: number;
  /** Focal length in mm (actual) */
  focalLength?: number;
  /** 35mm-equivalent focal length */
  focalLength35?: number;
  /** Lens model string when present */
  lens?: string;
  /** Capture time from EXIF DateTimeOriginal (local wall clock, no TZ) */
  takenAt?: string;
  /** image/* or video/* */
  mimeType: string;
  size: number;
  uploadedAt: string;
  /**
   * Admin-starred pick — shows ★ in the gallery and sorts first.
   */
  featured?: boolean;
  /** ISO time when starred — newest featured first among picks */
  featuredAt?: string;
  /**
   * Apple Live Photo companion video (short clip stored next to the still).
   * When set, the still is the primary gallery item; video plays on press/hover.
   */
  liveVideoFilename?: string;
  /** Original name of the Live companion (for downloads). */
  liveVideoOriginalName?: string;
  liveVideoSize?: number;
  liveVideoMimeType?: string;
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
