"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PhotoMeta } from "@/lib/types";
import {
  formatCameraSettings,
  formatFileSize,
  isLivePhoto,
  isVideoMedia,
  liveVideoPublicUrl,
  photoPublicUrl,
} from "@/lib/photos-client";
import { LiveBadge, LivePhotoStage } from "@/components/LivePhoto";

type Props = {
  tripId: string;
  tripTitle: string;
  photos: PhotoMeta[];
  coverImage?: string;
};

const MAX_BATCH = 50;
const ADMIN_MEDIA_BATCH_SIZE = 60;

function sortAdminPhotos(list: PhotoMeta[]): PhotoMeta[] {
  return [...list].sort((a, b) => {
    const af = a.featured ? 1 : 0;
    const bf = b.featured ? 1 : 0;
    if (af !== bf) return bf - af;
    if (a.featured && b.featured) {
      const at = a.featuredAt ? new Date(a.featuredAt).getTime() : 0;
      const bt = b.featuredAt ? new Date(b.featuredAt).getTime() : 0;
      if (at !== bt) return bt - at;
    }
    return (
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  });
}

export function AdminPhotos({
  tripId,
  tripTitle,
  photos: initial,
  coverImage: initialCover,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(() => sortAdminPhotos(initial));
  const [cover, setCover] = useState(initialCover || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "featured">("all");
  const [visibleCount, setVisibleCount] = useState(ADMIN_MEDIA_BATCH_SIZE);
  /** Index into visiblePhotos for full-screen preview */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const featuredCount = useMemo(
    () => photos.filter((p) => p.featured).length,
    [photos],
  );

  const visiblePhotos = useMemo(() => {
    if (filter === "featured") return photos.filter((p) => p.featured);
    return photos;
  }, [photos, filter]);

  const renderedPhotos = useMemo(
    () => visiblePhotos.slice(0, visibleCount),
    [visiblePhotos, visibleCount],
  );

  const previewPhoto =
    previewIndex != null ? visiblePhotos[previewIndex] ?? null : null;

  const closePreview = useCallback(() => setPreviewIndex(null), []);

  const goPreviewPrev = useCallback(() => {
    setPreviewIndex((i) => {
      if (i == null || visiblePhotos.length === 0) return i;
      return (i - 1 + visiblePhotos.length) % visiblePhotos.length;
    });
  }, [visiblePhotos.length]);

  const goPreviewNext = useCallback(() => {
    setPreviewIndex((i) => {
      if (i == null || visiblePhotos.length === 0) return i;
      return (i + 1) % visiblePhotos.length;
    });
  }, [visiblePhotos.length]);

  useEffect(() => {
    if (previewIndex == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowLeft") goPreviewPrev();
      if (e.key === "ArrowRight") goPreviewNext();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [previewIndex, closePreview, goPreviewPrev, goPreviewNext]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(photos.map((p) => p.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function setAsCover(url: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImage: url }),
      });
      if (!res.ok) throw new Error("Could not set polaroid");
      setCover(url);
      setStatus("Polaroid cover updated");
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set cover");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFeatured(photo: PhotoMeta) {
    const nextFeatured = !photo.featured;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trips/${tripId}/photos/${photo.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ featured: nextFeatured }),
        },
      );
      const data = (await res.json()) as PhotoMeta & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update featured");
      // Explicit featured flag — JSON responses may omit false/undefined keys,
      // so never rely on `{ ...prev, ...data }` alone to clear the star.
      setPhotos((list) =>
        sortAdminPhotos(
          list.map((p) =>
            p.id === photo.id
              ? {
                  ...p,
                  ...data,
                  featured: data.featured === true,
                  featuredAt:
                    data.featured === true ? data.featuredAt : undefined,
                }
              : p,
          ),
        ),
      );
      closePreview();
      setStatus(
        nextFeatured ? "Added to Highlights" : "Removed from Highlights",
      );
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function clearCover() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImage: "" }),
      });
      if (!res.ok) throw new Error("Could not clear cover");
      setCover("");
      setStatus("Polaroid cover cleared");
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear");
    } finally {
      setBusy(false);
    }
  }

  async function deleteIds(ids: string[]) {
    if (ids.length === 0) return;
    const label =
      ids.length === 1
        ? "Delete this photo?"
        : `Delete ${ids.length} photos? This cannot be undone.`;
    if (!confirm(label)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/trips/${tripId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as {
        error?: string;
        deleted?: string[];
        coverCleared?: boolean;
      };
      if (!res.ok) throw new Error(data.error || "Delete failed");

      const gone = new Set(data.deleted || ids);
      setPhotos((list) => list.filter((p) => !gone.has(p.id)));
      closePreview();
      setSelected((prev) => {
        const next = new Set(prev);
        gone.forEach((id) => next.delete(id));
        return next;
      });
      if (data.coverCleared) setCover("");
      setStatus(
        `Deleted ${gone.size} photo${gone.size === 1 ? "" : "s"}`,
      );
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
      .filter(
        (f) =>
          f.type.startsWith("image/") ||
          f.type.startsWith("video/") ||
          /\.(jpe?g|png|webp|heic|heif|gif|mp4|webm|mov|m4v)$/i.test(f.name),
      )
      .slice(0, MAX_BATCH);
    if (!files.length) {
      setError("No image or video files found");
      return;
    }

    setBusy(true);
    setError(null);
    setUploadProgress(
      `Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`,
    );

    try {
      // One multipart request; server pairs Live Photos and queues jobs
      const form = new FormData();
      for (const file of files) form.append("files", file);
      form.append("uploader", "Admin");

      const res = await fetch(`/api/admin/trips/${tripId}/photos`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        photos?: PhotoMeta[];
        count?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok && !data.photos?.length) {
        throw new Error(data.error || data.errors?.[0] || "Upload failed");
      }

      const saved = data.photos || [];
      if (saved.length) {
        setPhotos((prev) => sortAdminPhotos([...saved, ...prev]));
        // Auto-set first cover if none (images only — not video)
        if (!cover) {
          const firstImage = saved.find((p) => !isVideoMedia(p));
          if (firstImage) {
            const url = photoPublicUrl(
              firstImage.tripId,
              firstImage.filename,
            );
            await fetch(`/api/admin/trips/${tripId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ coverImage: url }),
            });
            setCover(url);
          }
        }
      }

      if (data.errors?.length) {
        setStatus(`Added ${saved.length}`);
        setError(data.errors.slice(0, 3).join(" · "));
      } else {
        setStatus(
          `Added ${saved.length} file${saved.length === 1 ? "" : "s"}`,
        );
      }
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadProgress(null);
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const coverUrl = cover;

  return (
    <div className="space-y-5">
      {/* Header + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-ink">
            Media
            <span className="ml-2 text-base font-sans font-normal text-ink-muted">
              {photos.length}
              {featuredCount > 0 ? ` · ${featuredCount} featured` : ""}
            </span>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Upload photos & videos, star Highlights, set polaroid cover,
            multi-select to delete.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-full bg-sea px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-soft disabled:opacity-50"
          >
            Add media
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,.heic,.heif,.mp4,.mov,.webm,.m4v"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
            }}
          />
          {selected.size > 0 ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void deleteIds([...selected])}
                className="rounded-full border border-coral/50 bg-coral/10 px-4 py-2 text-sm text-coral transition hover:bg-coral/15 disabled:opacity-50"
              >
                Delete selected ({selected.size})
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full border border-sand-300 px-3 py-2 text-sm text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            </>
          ) : photos.length > 0 ? (
            <button
              type="button"
              onClick={selectAll}
              className="rounded-full border border-sand-300 px-3 py-2 text-sm text-ink-soft hover:border-sea/40"
            >
              Select all
            </button>
          ) : null}
        </div>
      </div>

      {(status || error || uploadProgress) && (
        <div className="space-y-1">
          {uploadProgress && (
            <p className="text-sm text-sea">{uploadProgress}</p>
          )}
          {status && <p className="text-sm text-sea">{status}</p>}
          {error && <p className="text-sm text-coral">{error}</p>}
        </div>
      )}

      {/* Polaroid + drop zone row */}
      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
            Polaroid cover
          </p>
          {coverUrl ? (
            <div className="relative inline-block">
              <div
                className="instant pointer-events-none shadow-md"
                style={{ ["--w" as string]: "180px" }}
              >
                <div className="instant__pad">
                  <div className="instant__image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coverUrl} alt="Polaroid cover" />
                  </div>
                </div>
                <div className="instant__foot">
                  <span className="instant__caption">
                    {tripTitle || "Trip"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearCover()}
                className="mt-2 text-xs text-ink-muted underline hover:text-coral"
              >
                Clear cover
              </button>
            </div>
          ) : (
            <div className="flex h-[220px] w-[180px] items-center justify-center rounded-xl border border-dashed border-sand-300 bg-sand-50 px-3 text-center text-xs text-ink-muted">
              Click a photo below to set the wall polaroid
            </div>
          )}
        </div>

        <div
          className={`flex min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
            dragOver
              ? "border-sea bg-mist/50"
              : "border-sand-300 bg-white/50 hover:border-sea/35"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) {
              void uploadFiles(e.dataTransfer.files);
            }
          }}
        >
          <p className="text-sm text-ink-soft">Drop photos or videos here</p>
          <p className="mt-1 text-xs text-ink-muted">
            HEIC · Live Photos · MP4 / MOV · up to {MAX_BATCH} · photos 20MB ·
            videos 100MB
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="mt-3 rounded-full border border-sand-300 bg-white px-4 py-2 text-sm text-ink-soft hover:border-sea/40"
          >
            Choose files
          </button>
        </div>
      </div>

      {/* Filter: all / featured */}
      {photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setVisibleCount(ADMIN_MEDIA_BATCH_SIZE);
              setPreviewIndex(null);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === "all"
                ? "bg-ink text-white"
                : "border border-sand-300 bg-white text-ink-soft hover:border-sea/40"
            }`}
          >
            All ({photos.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter("featured");
              setVisibleCount(ADMIN_MEDIA_BATCH_SIZE);
              setPreviewIndex(null);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === "featured"
                ? "bg-sea text-white"
                : "border border-sand-300 bg-white text-ink-soft hover:border-sea/40"
            }`}
          >
            Highlights ({featuredCount})
          </button>
          <p className="text-xs text-ink-muted">
            Star picks show at the top of the public album.
          </p>
        </div>
      )}

      {/* Photo grid */}
      {photos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sand-300 px-4 py-10 text-center text-sm text-ink-muted">
          No media yet — add photos or videos above.
        </p>
      ) : visiblePhotos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sand-300 px-4 py-10 text-center text-sm text-ink-muted">
          No Highlights yet — star items below (★).
        </p>
      ) : (
        <div className="space-y-4">
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {renderedPhotos.map((p, index) => {
            const url = photoPublicUrl(p.tripId, p.filename);
            const gridUrl = photoPublicUrl(
              p.tripId,
              (isVideoMedia(p) ? p.posterFilename : p.thumbnailFilename) ||
                p.filename,
            );
            const isCover = cover === url;
            const isSelected = selected.has(p.id);
            const isFeatured = Boolean(p.featured);
            const isVid = isVideoMedia(p);
            const isLive = isLivePhoto(p);
            return (
              <li key={p.id} className="admin-media-item group relative">
                <div
                  className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-sand-100 transition ${
                    isCover
                      ? "border-sea ring-2 ring-sea/25"
                      : isFeatured
                        ? "border-amber-400/80 ring-2 ring-amber-300/30"
                        : isSelected
                          ? "border-coral/70 ring-2 ring-coral/20"
                          : "border-transparent"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    className="absolute inset-0 z-0 cursor-zoom-in"
                    aria-label={`Preview ${p.originalName || "media"}`}
                  >
                    {isVid && !p.posterFilename ? (
                      <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink via-ink-soft to-sea/80 text-white">
                        <span className="max-w-[80%] truncate px-2 pt-12 text-[9px] text-white/55">
                          {p.originalName}
                        </span>
                      </span>
                    ) : (
                      <Image
                        src={gridUrl}
                        alt={p.caption || p.originalName}
                        className="h-full w-full object-cover"
                        fill
                        sizes="(min-width: 1280px) 190px, (min-width: 1024px) 16vw, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 33vw"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    )}
                  </button>

                  {isVid && (
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      aria-hidden
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M8 5.5v13l11-6.5-11-6.5z" />
                        </svg>
                      </span>
                    </span>
                  )}

                  {/* Select checkbox */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(p.id)}
                    className={`absolute top-1.5 left-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs transition ${
                      isSelected
                        ? "border-coral bg-coral text-white"
                        : "border-white/90 bg-black/25 text-transparent hover:bg-black/40"
                    }`}
                    aria-label={isSelected ? "Deselect" : "Select"}
                  >
                    ✓
                  </button>

                  {/* Feature star */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleFeatured(p)}
                    className={`absolute top-1.5 right-8 z-10 flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none transition ${
                      isFeatured
                        ? "bg-amber-400 text-ink shadow-sm"
                        : "bg-black/45 text-white/90 opacity-0 hover:bg-amber-400/90 hover:text-ink group-hover:opacity-100"
                    }`}
                    aria-label={
                      isFeatured ? "Remove from Highlights" : "Add to Highlights"
                    }
                    title={
                      isFeatured ? "Remove from Highlights" : "Add to Highlights"
                    }
                  >
                    ★
                  </button>

                  {/* Quick delete */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteIds([p.id])}
                    className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-sm leading-none text-white opacity-0 transition hover:bg-coral group-hover:opacity-100"
                    aria-label="Delete"
                    title="Delete"
                  >
                    ×
                  </button>

                  {/* Use as cover — photos only */}
                  {!isVid && (
                    <button
                      type="button"
                      disabled={busy || isCover}
                      onClick={() => void setAsCover(url)}
                      className={`absolute inset-x-0 bottom-0 z-10 py-1.5 text-center text-[10px] font-medium tracking-wide uppercase transition ${
                        isCover
                          ? "bg-sea/95 text-white"
                          : "bg-ink/55 text-white opacity-0 hover:bg-sea/90 group-hover:opacity-100"
                      }`}
                    >
                      {isCover
                        ? "On polaroid"
                        : isFeatured
                          ? "Set polaroid"
                          : "Set as polaroid"}
                    </button>
                  )}
                  {isVid && (
                    <span className="absolute inset-x-0 bottom-0 z-10 bg-ink/55 py-1.5 text-center text-[10px] font-medium tracking-wide text-white uppercase">
                      Video
                    </span>
                  )}
                  {isLive && !isVid && (
                    <span className="pointer-events-none absolute top-1.5 left-8 z-10">
                      <LiveBadge size="sm" />
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate px-0.5 text-[10px] text-ink-muted">
                  {isFeatured ? "★ " : ""}
                  {isVid ? "▶ " : isLive ? "◎ " : ""}
                  {p.uploader}
                  {p.device ? ` · ${p.device}` : ""}
                  {p.aperture != null
                    ? ` · f/${p.aperture}`
                    : p.iso != null
                      ? ` · ISO ${p.iso}`
                      : ""}
                </p>
              </li>
            );
            })}
          </ul>

          {renderedPhotos.length < visiblePhotos.length && (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-xs text-ink-muted">
                Showing {renderedPhotos.length} of {visiblePhotos.length}
              </p>
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((current) =>
                    Math.min(
                      current + ADMIN_MEDIA_BATCH_SIZE,
                      visiblePhotos.length,
                    ),
                  )
                }
                className="rounded-full border border-sand-200 bg-white px-5 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:-translate-y-0.5 hover:border-sand-300 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
              >
                Show{" "}
                {Math.min(
                  ADMIN_MEDIA_BATCH_SIZE,
                  visiblePhotos.length - renderedPhotos.length,
                )}{" "}
                more
              </button>
            </div>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-sand-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
            <span className="px-2 text-sm text-ink-soft">
              {selected.size} selected
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteIds([...selected])}
              className="rounded-full bg-coral px-4 py-1.5 text-sm text-white hover:bg-coral-soft disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-full px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Full-screen admin preview */}
      {previewPhoto && previewIndex != null && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-black/92 backdrop-blur-md"
          role="dialog"
          aria-modal
          aria-label="Photo preview"
          onClick={closePreview}
        >
          <div
            className="flex items-center justify-between gap-3 px-3 py-3 sm:px-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={closePreview}
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
                  {previewPhoto.uploader}
                  {previewPhoto.device ? (
                    <span className="font-normal text-white/65">
                      {" · "}
                      {previewPhoto.device}
                    </span>
                  ) : null}
                  {previewPhoto.featured ? (
                    <span className="ml-2 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                      ★
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-white/60">
                  {previewIndex + 1} / {visiblePhotos.length}
                  {isVideoMedia(previewPhoto)
                    ? " · Video"
                    : isLivePhoto(previewPhoto)
                      ? " · Live"
                      : ""}
                  {" · "}
                  {formatFileSize(
                    previewPhoto.size + (previewPhoto.liveVideoSize || 0),
                  )}
                  {(() => {
                    const s = formatCameraSettings(previewPhoto);
                    return s ? (
                      <span className="hidden text-white/50 sm:inline">
                        {" · "}
                        {s}
                      </span>
                    ) : null;
                  })()}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleFeatured(previewPhoto)}
                className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                  previewPhoto.featured
                    ? "bg-amber-400 text-ink"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {previewPhoto.featured ? "★ Highlight" : "☆ Highlight"}
              </button>
              {!isVideoMedia(previewPhoto) && (
                <button
                  type="button"
                  disabled={
                    busy ||
                    cover ===
                      photoPublicUrl(
                        previewPhoto.tripId,
                        previewPhoto.filename,
                      )
                  }
                  onClick={() =>
                    void setAsCover(
                      photoPublicUrl(
                        previewPhoto.tripId,
                        previewPhoto.filename,
                      ),
                    )
                  }
                  className="hidden rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/20 sm:inline-flex disabled:opacity-40"
                >
                  Set polaroid
                </button>
              )}
            </div>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6 sm:px-10"
            onClick={(e) => e.stopPropagation()}
          >
            {visiblePhotos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPreviewPrev}
                  className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-4"
                  aria-label="Previous"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={goPreviewNext}
                  className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-4"
                  aria-label="Next"
                >
                  ›
                </button>
              </>
            )}

            {isVideoMedia(previewPhoto) ? (
              <video
                key={previewPhoto.id}
                src={photoPublicUrl(
                  previewPhoto.tripId,
                  previewPhoto.filename,
                )}
                className="max-h-[min(78vh,900px)] max-w-full rounded-lg bg-black object-contain shadow-2xl"
                controls
                playsInline
                autoPlay
              />
            ) : isLivePhoto(previewPhoto) &&
              previewPhoto.liveVideoFilename ? (
              <LivePhotoStage
                key={previewPhoto.id}
                resetKey={previewPhoto.id}
                stillSrc={photoPublicUrl(
                  previewPhoto.tripId,
                  previewPhoto.previewFilename || previewPhoto.filename,
                )}
                videoSrc={liveVideoPublicUrl(
                  previewPhoto.tripId,
                  previewPhoto.liveVideoFilename,
                )}
                alt={previewPhoto.caption || previewPhoto.originalName}
                still={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPublicUrl(
                      previewPhoto.tripId,
                      previewPhoto.previewFilename || previewPhoto.filename,
                    )}
                    alt={previewPhoto.caption || previewPhoto.originalName}
                    className="max-h-[min(78vh,900px)] max-w-full rounded-lg object-contain shadow-2xl"
                  />
                }
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={previewPhoto.id}
                src={photoPublicUrl(
                  previewPhoto.tripId,
                  previewPhoto.previewFilename || previewPhoto.filename,
                )}
                alt={previewPhoto.caption || previewPhoto.originalName}
                className="max-h-[min(78vh,900px)] max-w-full rounded-lg object-contain shadow-2xl"
              />
            )}
          </div>

          {(previewPhoto.caption || previewPhoto.originalName) && (
            <p
              className="truncate px-4 pb-4 text-center text-xs text-white/55"
              onClick={(e) => e.stopPropagation()}
            >
              {previewPhoto.caption || previewPhoto.originalName}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
