"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Comment, PhotoMeta } from "@/lib/types";
import {
  isLivePhoto,
  isVideoMedia,
  liveVideoPublicUrl,
  photoDownloadUrl,
  photoPublicUrl,
} from "@/lib/photos-client";
import { photoFullPublicUrl, photoListPublicUrl } from "@/lib/media-url";
import { openPhotoUpload } from "@/components/PhotoUpload";
import { LivePhotoThumb } from "@/components/LivePhoto";
import { MediaViewer } from "@/components/MediaViewer";

type Props = {
  /** Trip id. Prefer ownerKind + ownerId for new call sites. */
  tripId?: string;
  ownerKind?: "trip" | "article";
  ownerId?: string;
  /** Server-generated so each page load shuffles without a hydration jump. */
  randomSeed: string;
  initialPhotos: PhotoMeta[];
  /** All comments (trip + photo); used for counts and lightbox */
  initialComments?: Comment[];
  /** Trip pages: Share upload. Articles: off. */
  allowShare?: boolean;
  /** Trip pages: photo comments. Articles: off. */
  allowComments?: boolean;
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
  // Masonry / waterfall: grid-1080 only (not full original).
  const url = photoListPublicUrl(photo);
  const ownerKey = photo.articleId || photo.tripId || "";
  const alt = photo.caption || photo.originalName;
  if (isVideoMedia(photo)) {
    if (photo.posterFilename || photo.thumbnailFilename) {
      const poster = photo.posterFilename || photo.thumbnailFilename!;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoPublicUrl(ownerKey, poster)}
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
        videoSrc={liveVideoPublicUrl(ownerKey, photo.liveVideoFilename)}
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
  ownerKind: ownerKindProp,
  ownerId: ownerIdProp,
  randomSeed,
  initialPhotos,
  initialComments = [],
  allowShare = true,
  allowComments = true,
}: Props) {
  const ownerKind = ownerKindProp || "trip";
  const ownerId = ownerIdProp || tripId || "";
  const commentsUrl =
    ownerKind === "article"
      ? `/api/articles/${ownerId}/comments`
      : `/api/trips/${ownerId}/comments`;
  const [photos, setPhotos] = useState(() => initialPhotos);
  const [comments, setComments] = useState(initialComments);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<GallerySortMode>("random");
  const [shuffleVersion, setShuffleVersion] = useState(0);
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
            `${ownerId}:${randomSeed}:${shuffleVersion}`,
          ),
    [photos, randomSeed, shuffleVersion, sortMode, ownerId],
  );
  const visiblePhotos = useMemo(
    () => orderedPhotos.slice(0, visibleCount),
    [orderedPhotos, visibleCount],
  );
  const columns = useMemo(
    () => splitIntoColumns(visiblePhotos, columnCount),
    [visiblePhotos, columnCount],
  );

  // Lightbox comment form
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [postBusy, setPostBusy] = useState(false);

  const commentCounts = useMemo(() => countsFrom(comments), [comments]);

  const refreshPhotos = useCallback(async () => {
    if (ownerKind !== "trip" || !ownerId) return;
    const res = await fetch(`/api/trips/${ownerId}/photos`);
    if (res.ok) {
      setPhotos((await res.json()) as PhotoMeta[]);
    }
  }, [ownerId, ownerKind]);

  const refreshComments = useCallback(async () => {
    if (!allowComments || !ownerId) return;
    const res = await fetch(commentsUrl);
    if (res.ok) {
      setComments((await res.json()) as Comment[]);
    }
  }, [allowComments, commentsUrl, ownerId]);

  useEffect(() => {
    const onUploaded = () => void refreshPhotos();
    window.addEventListener("photos:uploaded", onUploaded);
    return () => window.removeEventListener("photos:uploaded", onUploaded);
  }, [refreshPhotos]);

  const closeViewer = useCallback(() => {
    setActiveIndex(null);
  }, []);

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
    if (ownerKind === "article" || photo.articleId) {
      await downloadBlob(
        photoFullPublicUrl(photo) || photoPublicUrl(ownerId, photo.filename),
        photo.originalName,
      );
      return;
    }
    // Privacy: stills go through strip-metadata API (no EXIF/GPS)
    await downloadBlob(photoDownloadUrl(photo.tripId || ownerId, photo.id));
    // Live companion video (metadata not stripped — container format)
    if (photo.liveVideoFilename) {
      await new Promise((r) => setTimeout(r, 150));
      await downloadBlob(
        photoDownloadUrl(photo.tripId || ownerId, photo.id, { part: "live" }),
      );
    }
  }

  async function postPhotoComment(e: React.FormEvent) {
    e.preventDefault();
    if (!allowComments) return;
    const photo =
      activeIndex !== null ? orderedPhotos[activeIndex] : undefined;
    if (!photo) return;
    setPostBusy(true);
    setPostError(null);
    try {
      const res = await fetch(commentsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author,
          body,
          photoId: photo.id,
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
    setActiveIndex(idx >= 0 ? idx : 0);
    void refreshComments();
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
      {allowShare ? (
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
      ) : null}
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
        </p>
        {toolbar}
      </div>

      {/* 小红书-style dual columns on phone; 3 on desktop */}
      <div className="photo-grid-xhs">
        {columns.map((col, colIndex) => (
          <div key={colIndex} className="photo-grid-xhs__col">
            {col.map((photo) => {
              const n = commentCounts[photo.id] || 0;
              const isFeatured = Boolean(photo.featured);
              const isVid = isVideoMedia(photo);
              const liveBadgeClassName = isFeatured
                ? "top-2 left-10 sm:top-2.5 sm:left-12"
                : undefined;
              return (
                <figure
                  key={photo.id}
                  className={`group relative overflow-hidden rounded-xl bg-sand-100 shadow-sm ring-1 sm:rounded-2xl ${
                    isFeatured ? "ring-amber-400/50" : "ring-black/5"
                  }`}
                >
                  {isFeatured && (
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
                    onClick={() => openPhoto(photo)}
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

      {activeIndex !== null && orderedPhotos[activeIndex] ? (
        <MediaViewer
          photos={orderedPhotos}
          index={activeIndex}
          comments={allowComments ? comments : []}
          enableComments={allowComments}
          onClose={closeViewer}
          onIndexChange={(next) => {
            setActiveIndex(next);
            setPostError(null);
            setBody("");
          }}
          onDownload={downloadOne}
          author={author}
          body={body}
          postError={postError}
          postBusy={postBusy}
          onAuthorChange={setAuthor}
          onBodyChange={setBody}
          onPostComment={(e) => void postPhotoComment(e)}
        />
      ) : null}
    </div>
  );
}
