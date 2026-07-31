import type { PhotoMeta } from "@/lib/types";

export const MEDIA_KINDS = ["image", "video", "live_photo"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_STATES = [
  "pending",
  "processing",
  "ready",
  "failed",
  "deleted",
] as const;
export type MediaState = (typeof MEDIA_STATES)[number];

export const MEDIA_ASSET_ROLES = [
  "original",
  "live_original",
  "thumb",
  "grid",
  "preview",
  "download",
  "poster",
  "playback",
  "live_playback",
  "legacy_display",
  "legacy_playback",
  "legacy_live",
] as const;
export type MediaAssetRole = (typeof MEDIA_ASSET_ROLES)[number];

export const MEDIA_JOB_TYPES = [
  "process_image",
  "process_video",
  "process_live_photo",
  "purge_media",
] as const;
export type MediaJobType = (typeof MEDIA_JOB_TYPES)[number];

export type MediaJobState =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type MediaRecord = {
  id: string;
  /** Set when this media belongs to a trip. XOR with articleId. */
  tripId?: string;
  /** Set when this media belongs to an article. XOR with tripId. */
  articleId?: string;
  kind: MediaKind;
  state: MediaState;
  uploader: string;
  caption?: string;
  originalName: string;
  sourceMimeType: string;
  sourceBytes: number;
  uploadedAt: string;
  takenAt?: string;
  device?: string;
  aperture?: number;
  shutter?: string;
  iso?: number;
  focalLength?: number;
  focalLength35?: number;
  lens?: string;
  featured: boolean;
  featuredAt?: string;
  version: number;
  failureCode?: string;
  failureMessage?: string;
  deletedAt?: string;
};

export type MediaAsset = {
  id?: number;
  mediaId: string;
  role: MediaAssetRole;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
  sha256?: string;
  isPublic: boolean;
  createdAt?: string;
};

export type MediaWithAssets = MediaRecord & {
  assets: Partial<Record<MediaAssetRole, MediaAsset>>;
};

export type QueuedMediaInput = {
  id: string;
  tripId?: string;
  articleId?: string;
  kind: MediaKind;
  uploader: string;
  caption?: string;
  originalName: string;
  sourceMimeType: string;
  sourceBytes: number;
  uploadedAt?: string;
  featured?: boolean;
  assets: Array<
    Pick<
      MediaAsset,
      | "role"
      | "storageKey"
      | "mimeType"
      | "byteSize"
      | "sha256"
      | "isPublic"
    >
  >;
  jobType: Exclude<MediaJobType, "purge_media">;
  jobPayload?: Record<string, unknown>;
};

export type ProcessedMediaPatch = {
  takenAt?: string;
  device?: string;
  aperture?: number;
  shutter?: string;
  iso?: number;
  focalLength?: number;
  focalLength35?: number;
  lens?: string;
};

export type MediaJob = {
  id: number;
  mediaId: string;
  jobType: MediaJobType;
  state: MediaJobState;
  priority: number;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
  availableAt: string;
  leasedUntil?: string;
  workerId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
};

export type MediaJobFailure = {
  terminal: boolean;
  attempts: number;
  maxAttempts: number;
};

/** Compatibility envelope used while the existing gallery still consumes PhotoMeta. */
export type MediaPhotoMeta = PhotoMeta;

