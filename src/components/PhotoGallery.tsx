"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Comment, PhotoMeta } from "@/lib/types";
import {
  formatCameraSettings,
  isLivePhoto,
  isVideoMedia,
  liveVideoPublicUrl,
  photoDownloadUrl,
  photoPublicUrl,
} from "@/lib/photos-client";
import { openPhotoUpload } from "@/components/PhotoUpload";
import { ZoomableImage } from "@/components/ZoomableImage";
import { LivePhotoStage, LivePhotoThumb } from "@/components/LivePhoto";

type Props = {
  tripId: string;
  /** Server-generated so each page load shuffles without a hydration jump. */
  randomSeed: string;
  initialPhotos: PhotoMeta[];
  /** All comments (trip + photo); used for counts and lightbox */
  initialComments?: Comment[];
};

const GALLERY_BATCH_SIZE = 48;
type GallerySortMode = "random" | "time";

/** Phone = 2 cols (小红书); desktop = 3 */
function useGalleryColumns() {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setCols(mq.matches ? 3 : 2);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return cols;
}

function splitIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const cols: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, i) => {
    cols[i % columnCount].push(item);
  });
  return cols;
}

function photoTimestamp(photo: PhotoMeta): number {
  const parsed = Date.parse(photo.takenAt || photo.uploadedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortGalleryPhotosByTime(list: PhotoMeta[]): PhotoMeta[] {
  return [...list].sort((a, b) => {
    const byCaptureTime = photoTimestamp(b) - photoTimestamp(a);
    if (byCaptureTime !== 0) return byCaptureTime;
    return b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id);
  });
}

function galleryHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic per shuffle key, so ordinary React updates never reshuffle. */
function randomizeGalleryPhotos(
  list: PhotoMeta[],
  shuffleKey: string,
): PhotoMeta[] {
  return [...list].sort((a, b) => {
    const byHash =
      galleryHash(`${shuffleKey}:${a.id}`) -
      galleryHash(`${shuffleKey}:${b.id}`);
    return byHash || a.id.localeCompare(b.id);
  });
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function countsFrom(list: Comment[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of list) {
    if (!c.photoId) continue;
    map[c.photoId] = (map[c.photoId] || 0) + 1;
  }
  return map;
}

function PlayBadge({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? "h-7 w-7" : size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const icon = size === "sm" ? 12 : size === "lg" ? 22 : 16;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-[2px] ring-1 ring-white/25 ${dim} ${className}`}
      aria-hidden
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5.5v13l11-6.5-11-6.5z" />
      </svg>
    </span>
  );
}

function MediaThumb({
  photo,
  className,
  liveBadgeClassName,
  loading = "lazy",
}: {
  photo: PhotoMeta;
  className?: string;
  liveBadgeClassName?: string;
  loading?: "lazy" | "eager";
}) {
  const imageName = photo.thumbnailFilename || photo.filename;
  const url = photoPublicUrl(photo.tripId, imageName);
  const alt = photo.caption || photo.originalName;
  if (isVideoMedia(photo)) {
    if (photo.posterFilename || photo.thumbnailFilename) {
      const poster = photo.posterFilename || photo.thumbnailFilename!;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoPublicUrl(photo.tripId, poster)}
          alt={alt}
          className={className}
          loading={loading}
        />
      );
    }
    // No server poster yet — let the browser paint the first frame.
    return (
      <video
        src={url}
        className={className}
        muted
        playsInline
        preload="metadata"
        aria-label={alt}
      />
    );
  }
  if (isLivePhoto(photo) && photo.liveVideoFilename) {
    return (
      <LivePhotoThumb
        stillSrc={url}
        videoSrc={liveVideoPublicUrl(photo.tripId, photo.liveVideoFilename)}
        alt={alt}
        className={className}
        badgeClassName={liveBadgeClassName}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} loading={loading} />
  );
}

export function PhotoGallery({
  tripId,
  randomSeed,
  initialPhotos,
  initialComments = [],
}: Props) {
  const [photos, setPhotos] = useState(() => initialPhotos);
  const [comments, setComments] = useState(initialComments);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [sortMode, setSortMode] = useState<GallerySortMode>("random");
  const [shuffleVersion, setShuffleVersion] = useState(0);
  const [uiVisible, setUiVisible] = useState(true);
  const [visibleCount, setVisibleCount] = useState(GALLERY_BATCH_SIZE);
  const columnCount = useGalleryColumns();
  const featured = useMemo(
    () => photos.filter((p) => p.featured),
    [photos],
  );
  const orderedPhotos = useMemo(
    () =>
      sortMode === "time"
        ? sortGalleryPhotosByTime(photos)
        : randomizeGalleryPhotos(
            photos,
            `${tripId}:${randomSeed}:${shuffleVersion}`,
          ),
    [photos, randomSeed, shuffleVersion, sortMode, tripId],
  );
  const visiblePhotos = useMemo(
    () => orderedPhotos.slice(0, visibleCount),
    [orderedPhotos, visibleCount],
  );
  const columns = useMemo(
    () => splitIntoColumns(visiblePhotos, columnCount),
    [visiblePhotos, columnCount],
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [photoZoomed, setPhotoZoomed] = useState(false);
  const [livePlaying, setLivePlaying] = useState(false);

  // Lightbox comment form
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [postBusy, setPostBusy] = useState(false);

  const commentCounts = useMemo(() => countsFrom(comments), [comments]);

  const active =
    activeIndex !== null && orderedPhotos[activeIndex]
      ? orderedPhotos[activeIndex]
      : null;
  const activeIsVideo = active ? isVideoMedia(active) : false;
  const activeIsLive = active ? isLivePhoto(active) : false;

  const activeComments = useMemo(() => {
    if (!active) return [];
    return comments
      .filter((c) => c.photoId === active.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [comments, active]);

  const refreshPhotos = useCallback(async () => {
    const res = await fetch(`/api/trips/${tripId}/photos`);
    if (res.ok) {
      setPhotos((await res.json()) as PhotoMeta[]);
    }
  }, [tripId]);

  const refreshComments = useCallback(async () => {
    const res = await fetch(`/api/trips/${tripId}/comments`);
    if (res.ok) {
      setComments((await res.json()) as Comment[]);
    }
  }, [tripId]);

  useEffect(() => {
    const onUploaded = () => void refreshPhotos();
    window.addEventListener("photos:uploaded", onUploaded);
    return () => window.removeEventListener("photos:uploaded", onUploaded);
  }, [refreshPhotos]);

  const closeViewer = useCallback(() => {
    setActiveIndex(null);
    setUiVisible(true);
    setPhotoZoomed(false);
    setLivePlaying(false);
  }, []);

  const goPrev = useCallback(() => {
    setActiveIndex((i) => {
      if (i === null || photos.length === 0) return i;
      return (i - 1 + photos.length) % photos.length;
    });
    setPostError(null);
    setBody("");
    setUiVisible(true);
    setPhotoZoomed(false);
    setLivePlaying(false);
  }, [photos.length]);

  const goNext = useCallback(() => {
    setActiveIndex((i) => {
      if (i === null || photos.length === 0) return i;
      return (i + 1) % photos.length;
    });
    setPostError(null);
    setBody("");
    setUiVisible(true);
    setPhotoZoomed(false);
    setLivePlaying(false);
  }, [photos.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeViewer();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === " " && activeIsVideo && videoRef.current) {
        // Space toggles play when not typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        const v = videoRef.current;
        if (v.paused) void v.play();
        else v.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [activeIndex, closeViewer, goPrev, goNext, activeIsVideo]);

  // Pause video when leaving a slide
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      v?.pause();
    };
  }, [activeIndex]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadBlob(url: string, downloadName?: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    // Prefer server Content-Disposition name when present
    let name = downloadName || "download";
    const cd = res.headers.get("Content-Disposition");
    if (cd) {
      const m =
        /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd) ||
        /filename=([^;]+)/i.exec(cd);
      const raw = m?.[1] || m?.[2];
      if (raw) {
        try {
          name = decodeURIComponent(raw.replace(/['"]/g, "").trim());
        } catch {
          name = raw.replace(/['"]/g, "").trim();
        }
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadOne(photo: PhotoMeta) {
    // Privacy: stills go through strip-metadata API (no EXIF/GPS)
    await downloadBlob(photoDownloadUrl(photo.tripId, photo.id));
    // Live companion video (metadata not stripped — container format)
    if (photo.liveVideoFilename) {
      await new Promise((r) => setTimeout(r, 150));
      await downloadBlob(
        photoDownloadUrl(photo.tripId, photo.id, { part: "live" }),
      );
    }
  }

  async function downloadSelected() {
    const list =
      selectMode && selected.size > 0
        ? orderedPhotos.filter((p) => selected.has(p.id))
        : orderedPhotos;
    for (const photo of list) {
      await downloadOne(photo);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function postPhotoComment(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setPostBusy(true);
    setPostError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author,
          body,
          photoId: active.id,
        }),
      });
      const data = (await res.json()) as Comment & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not post");
      setComments((prev) => [data, ...prev]);
      setBody("");
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Could not post");
    } finally {
      setPostBusy(false);
    }
  }

  function openPhoto(photo: PhotoMeta) {
    const idx = orderedPhotos.findIndex((p) => p.id === photo.id);
    setPostError(null);
    setBody("");
    setUiVisible(true);
    setPhotoZoomed(false);
    setLivePlaying(false);
    setActiveIndex(idx >= 0 ? idx : 0);
    void refreshComments();
  }

  // Video-only swipe (photos use ZoomableImage gestures)
  const videoSwipeStart = useRef<{ x: number; y: number } | null>(null);

  function onVideoTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    videoSwipeStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }

  function onVideoTouchEnd(e: React.TouchEvent) {
    if (!videoSwipeStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - videoSwipeStart.current.x;
    const dy = t.clientY - videoSwipeStart.current.y;
    videoSwipeStart.current = null;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx > 0) goPrev();
    else goNext();
  }

  const videoCount = useMemo(
    () => photos.filter((p) => isVideoMedia(p)).length,
    [photos],
  );
  const liveCount = useMemo(
    () => photos.filter((p) => isLivePhoto(p)).length,
    [photos],
  );
  const photoCount = photos.length - videoCount;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {photos.length > 1 && (
        <div
          className="inline-flex items-center rounded-full border border-sand-300 bg-white/70 p-1 shadow-sm"
          role="group"
          aria-label="Photo order"
        >
          <button
            type="button"
            aria-pressed={sortMode === "random"}
            title={
              sortMode === "random" ? "Shuffle again" : "Show in random order"
            }
            onClick={() => {
              setSortMode("random");
              setShuffleVersion((version) => version + 1);
              setVisibleCount(GALLERY_BATCH_SIZE);
            }}
            className={`rounded-full px-3 py-1 text-sm transition ${
              sortMode === "random"
                ? "bg-sea text-white shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Random
          </button>
          <button
            type="button"
            aria-pressed={sortMode === "time"}
            title="Newest photos first"
            onClick={() => {
              setSortMode("time");
              setVisibleCount(GALLERY_BATCH_SIZE);
            }}
            className={`rounded-full px-3 py-1 text-sm transition ${
              sortMode === "time"
                ? "bg-sea text-white shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Newest
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => openPhotoUpload()}
        className="inline-flex items-center gap-1.5 rounded-full bg-sea px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-soft"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        Share
      </button>
      {photos.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelected(new Set());
            }}
            className={`inline-flex items-center rounded-full border px-4 py-2 text-sm transition ${
              selectMode
                ? "border-sea/40 bg-sea/10 text-sea"
                : "border-sand-300 bg-white/80 text-ink-soft hover:border-sea/40 hover:text-sea"
            }`}
          >
            {selectMode ? "Cancel" : "Select"}
          </button>
          <button
            type="button"
            onClick={() => void downloadSelected()}
            className="inline-flex items-center rounded-full border border-sand-300 bg-white/80 px-4 py-2 text-sm text-ink-soft transition hover:border-sea/40 hover:text-sea"
          >
            {selectMode && selected.size > 0
              ? `Download (${selected.size})`
              : "Download all"}
          </button>
        </>
      )}
    </div>
  );

  if (photos.length === 0) {
    return (
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">0 photos</p>
          {toolbar}
        </div>
        <div className="rounded-3xl border border-dashed border-sand-300 bg-white/40 px-6 py-16 text-center">
          <p className="font-serif text-xl text-ink-soft">No media yet</p>
          <p className="mt-2 text-sm text-ink-muted">
            Share the first shot or clip — use Share above or the button in the
            corner.
          </p>
        </div>
      </div>
    );
  }

  const mediaLabel = (() => {
    const parts: string[] = [];
    if (photoCount > 0) {
      parts.push(`${photoCount} ${photoCount === 1 ? "photo" : "photos"}`);
    }
    if (liveCount > 0) {
      parts.push(`${liveCount} Live`);
    }
    if (videoCount > 0) {
      parts.push(`${videoCount} ${videoCount === 1 ? "video" : "videos"}`);
    }
    if (!parts.length) parts.push(`${photos.length} items`);
    return parts.join(" · ");
  })();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {mediaLabel}
          {featured.length > 0
            ? ` · ${featured.length} starred`
            : ""}
          {selectMode && selected.size > 0
            ? ` · ${selected.size} selected`
            : ""}
        </p>
        {toolbar}
      </div>

      {/* 小红书-style dual columns on phone; 3 on desktop */}
      <div className="photo-grid-xhs">
        {columns.map((col, colIndex) => (
          <div key={colIndex} className="photo-grid-xhs__col">
            {col.map((photo) => {
              const isSelected = selected.has(photo.id);
              const n = commentCounts[photo.id] || 0;
              const isFeatured = Boolean(photo.featured);
              const isVid = isVideoMedia(photo);
              const liveBadgeClassName =
                selectMode || isFeatured
                  ? "top-2 left-10 sm:top-2.5 sm:left-12"
                  : undefined;
              return (
                <figure
                  key={photo.id}
                  className={`group relative overflow-hidden rounded-xl bg-sand-100 shadow-sm ring-1 sm:rounded-2xl ${
                    isFeatured ? "ring-amber-400/50" : "ring-black/5"
                  }`}
                >
                  {selectMode && (
                    <button
                      type="button"
                      onClick={() => toggleSelect(photo.id)}
                      className={`absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs transition sm:left-3 sm:top-3 sm:h-7 sm:w-7 ${
                        isSelected
                          ? "border-sea bg-sea text-white"
                          : "border-white/90 bg-black/25 text-transparent"
                      }`}
                      aria-label="Select media"
                    >
                      ✓
                    </button>
                  )}

                  {isFeatured && !selectMode && (
                    <span
                      className="absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/95 text-[11px] text-ink shadow-sm sm:left-3 sm:top-3"
                      title="Highlight"
                      aria-label="Highlight"
                    >
                      ★
                    </span>
                  )}

                  <button
                    type="button"
                    className="relative block w-full text-left"
                    onClick={() =>
                      selectMode ? toggleSelect(photo.id) : openPhoto(photo)
                    }
                  >
                    <MediaThumb
                      photo={photo}
                      className="block w-full object-cover transition duration-300 group-active:opacity-95 sm:group-hover:scale-[1.02]"
                      liveBadgeClassName={liveBadgeClassName}
                    />
                    {isVid && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <PlayBadge size="md" className="opacity-95" />
                      </span>
                    )}
                    {/* Bottom gradient so white text stays readable */}
                    <span
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 via-black/20 to-transparent sm:h-16"
                      aria-hidden
                    />
                    <span className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-1.5 px-2 pb-1.5 pt-6 sm:px-2.5 sm:pb-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-medium leading-tight text-white drop-shadow-sm sm:text-xs">
                          {photo.uploader}
                          {photo.device ? (
                            <span className="font-normal text-white/75">
                              {" · "}
                              {photo.device}
                            </span>
                          ) : null}
                        </span>
                        {photo.caption && (
                          <span className="mt-0.5 block truncate text-[10px] leading-tight text-white/85 drop-shadow-sm sm:text-[11px]">
                            {photo.caption}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        {isVid && (
                          <span className="mr-0.5 rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white uppercase backdrop-blur-[2px]">
                            Video
                          </span>
                        )}
                        {/* Live badge is on the thumb itself (top-left) */}
                        {n > 0 && (
                          <span className="rounded-full bg-black/35 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-[2px]">
                            {n}
                          </span>
                        )}
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full text-white/95 drop-shadow-sm sm:h-7 sm:w-7"
                          aria-hidden
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path
                              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </span>
                    </span>
                  </button>

                  {/* Desktop: quick download without opening */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void downloadOne(photo);
                    }}
                    className="absolute top-2 right-2 z-20 hidden h-7 w-7 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-black/50 sm:flex"
                    title="Download"
                    aria-label="Download this item"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path
                        d="M12 4v12m0 0l-4-4m4 4l4-4M5 19h14"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </figure>
              );
            })}
          </div>
        ))}
      </div>

      {visiblePhotos.length < photos.length && (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-ink-muted">
            Showing {visiblePhotos.length} of {photos.length}
          </p>
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(current + GALLERY_BATCH_SIZE, photos.length),
              )
            }
            className="rounded-full border border-sand-200 bg-white/80 px-5 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
          >
            Show {Math.min(GALLERY_BATCH_SIZE, photos.length - visibleCount)} more
          </button>
        </div>
      )}

      {/* Full-screen media viewer */}
      {active && activeIndex !== null && (
        <div
          className="media-viewer fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-md"
          role="dialog"
          aria-modal
          aria-label={activeIsVideo ? "Video viewer" : "Photo viewer"}
        >
          {/* Top chrome */}
          <div
            className={`media-viewer__chrome absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-3 py-3 transition-opacity duration-200 sm:px-5 ${
              uiVisible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={closeViewer}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Close"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {active.uploader}
                  {active.featured ? (
                    <span className="ml-2 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                      ★
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-white/60">
                  {activeIndex + 1} / {photos.length}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadOne(active)}
                className="hidden rounded-full bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20 sm:inline-flex"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => void downloadOne(active)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:hidden"
                aria-label="Download"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M12 4v12m0 0l-4-4m4 4l4-4M5 19h14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Stage: media + prev/next */}
          <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center"
              onTouchStart={activeIsVideo ? onVideoTouchStart : undefined}
              onTouchEnd={activeIsVideo ? onVideoTouchEnd : undefined}
            >
              {photos.length > 1 && !photoZoomed && !livePlaying && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goPrev();
                    }}
                    className={`absolute left-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:flex ${
                      uiVisible ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    aria-label="Previous"
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M15 18l-6-6 6-6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goNext();
                    }}
                    className={`absolute right-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:flex ${
                      uiVisible ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    aria-label="Next"
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M9 18l6-6-6-6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </>
              )}

              <div className="media-viewer__stage flex h-full min-h-0 w-full max-w-full flex-1 items-center justify-center px-1 pt-14 pb-2 sm:px-4 sm:pt-16 sm:pb-4 lg:px-12 lg:pb-8">
                {activeIsVideo ? (
                  <video
                    key={active.id}
                    ref={videoRef}
                    src={photoPublicUrl(active.tripId, active.filename)}
                    poster={
                      active.posterFilename
                        ? photoPublicUrl(active.tripId, active.posterFilename)
                        : undefined
                    }
                    className="media-viewer__media max-h-[min(70vh,720px)] w-auto max-w-full rounded-lg bg-black object-contain shadow-2xl lg:max-h-[min(82vh,900px)]"
                    controls
                    playsInline
                    preload="metadata"
                    autoPlay
                    onClick={() => setUiVisible((v) => !v)}
                  />
                ) : activeIsLive && active.liveVideoFilename ? (
                  <LivePhotoStage
                    key={active.id}
                    resetKey={active.id}
                    stillSrc={photoPublicUrl(
                      active.tripId,
                      active.previewFilename || active.filename,
                    )}
                    videoSrc={liveVideoPublicUrl(
                      active.tripId,
                      active.liveVideoFilename,
                    )}
                    alt={active.caption || active.originalName}
                    onPlayingChange={setLivePlaying}
                    onTap={() => setUiVisible((v) => !v)}
                    still={
                      <ZoomableImage
                        resetKey={active.id}
                        src={photoPublicUrl(
                          active.tripId,
                          active.previewFilename || active.filename,
                        )}
                        alt={active.caption || active.originalName}
                        imgClassName="media-viewer__media rounded-lg"
                        onTap={() => setUiVisible((v) => !v)}
                        onSwipe={(dir) => {
                          if (dir === "prev") goPrev();
                          else goNext();
                        }}
                        onZoomChange={setPhotoZoomed}
                      />
                    }
                  />
                ) : (
                  <ZoomableImage
                    key={active.id}
                    resetKey={active.id}
                    src={photoPublicUrl(
                      active.tripId,
                      active.previewFilename || active.filename,
                    )}
                    alt={active.caption || active.originalName}
                    imgClassName="media-viewer__media rounded-lg"
                    onTap={() => setUiVisible((v) => !v)}
                    onSwipe={(dir) => {
                      if (dir === "prev") goPrev();
                      else goNext();
                    }}
                    onZoomChange={setPhotoZoomed}
                  />
                )}
              </div>
            </div>

            {/* Side / bottom panel: meta + comments */}
            <aside
              className={`media-viewer__aside relative z-20 flex max-h-[38vh] w-full shrink-0 flex-col border-t border-white/10 bg-ink/95 transition-[max-height] duration-200 sm:max-h-[42vh] lg:max-h-none lg:w-[340px] lg:border-t-0 lg:border-l lg:border-white/10 ${
                uiVisible ? "" : "max-h-0 overflow-hidden lg:max-h-none"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-5">
                {active.caption ? (
                  <p className="text-sm leading-relaxed text-white/90">
                    {active.caption}
                  </p>
                ) : (
                  <p className="truncate text-sm text-white/50">
                    {active.originalName}
                  </p>
                )}
                <p className="mt-1.5 text-xs text-white/45">
                  {active.device ? (
                    <span className="text-white/60">{active.device}</span>
                  ) : null}
                  {active.device ? " · " : ""}
                  {formatWhen(active.takenAt || active.uploadedAt)}
                  {activeIsVideo
                    ? " · Video"
                    : activeIsLive
                      ? " · Live Photo"
                      : " · Photo"}
                </p>
                {(() => {
                  const settings = formatCameraSettings(active);
                  if (!settings && !active.lens) return null;
                  return (
                    <div className="mt-2.5 space-y-1.5">
                      {settings ? (
                        <p className="flex flex-wrap gap-1.5 font-mono text-[11px] leading-relaxed tracking-wide text-white/75">
                          {settings.split(" · ").map((part) => (
                            <span
                              key={part}
                              className="rounded-md bg-white/10 px-1.5 py-0.5 text-white/80"
                            >
                              {part}
                            </span>
                          ))}
                        </p>
                      ) : null}
                      {active.lens ? (
                        <p className="truncate text-[10px] text-white/40">
                          {active.lens}
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium text-white/90">
                    Comments
                  </h3>
                  <span className="text-xs text-white/40">
                    {activeComments.length}{" "}
                    {activeComments.length === 1 ? "note" : "notes"}
                  </span>
                </div>

                <form
                  onSubmit={(e) => void postPhotoComment(e)}
                  className="mb-4 space-y-2"
                >
                  <div className="grid gap-2 sm:grid-cols-[120px_1fr] lg:grid-cols-1">
                    <input
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      maxLength={40}
                      placeholder="Your name *"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-sea/50 focus:ring-2 focus:ring-sea/20"
                    />
                    <input
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      maxLength={500}
                      placeholder={
                        activeIsVideo
                          ? "Great clip…"
                          : "Love this light…"
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-sea/50 focus:ring-2 focus:ring-sea/20"
                    />
                  </div>
                  {postError && (
                    <p className="text-sm text-coral">{postError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={postBusy}
                    className="rounded-full bg-sea px-4 py-1.5 text-sm text-white transition hover:bg-sea-soft disabled:opacity-60"
                  >
                    {postBusy ? "Posting…" : "Post"}
                  </button>
                </form>

                <div className="space-y-2.5 pb-4">
                  {activeComments.length === 0 ? (
                    <p className="text-sm text-white/40">
                      No comments yet — leave the first note.
                    </p>
                  ) : (
                    activeComments.map((c) => (
                      <article
                        key={c.id}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-white/90">
                            {c.author}
                          </p>
                          <time className="text-[11px] text-white/35">
                            {formatWhen(c.createdAt)}
                          </time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                          {c.body}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>

          {/* Mobile gesture hint */}
          {uiVisible && !photoZoomed && !livePlaying && (
            <p className="pointer-events-none absolute bottom-[40vh] left-1/2 z-10 -translate-x-1/2 text-[10px] tracking-wide text-white/30 uppercase sm:hidden lg:bottom-6">
              {activeIsVideo
                ? photos.length > 1
                  ? "Swipe for next"
                  : ""
                : activeIsLive
                  ? photos.length > 1
                    ? "Tap LIVE · pinch zoom · swipe"
                    : "Tap LIVE to play · pinch to zoom"
                  : photos.length > 1
                    ? "Pinch to zoom · swipe for next"
                    : "Pinch or double-tap to zoom"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
