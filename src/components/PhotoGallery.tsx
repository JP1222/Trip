"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Comment, PhotoMeta } from "@/lib/types";
import { formatFileSize, photoPublicUrl } from "@/lib/photos-client";
import { openPhotoUpload } from "@/components/PhotoUpload";

type Props = {
  tripId: string;
  initialPhotos: PhotoMeta[];
  /** All comments (trip + photo); used for counts and lightbox */
  initialComments?: Comment[];
};

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

export function PhotoGallery({
  tripId,
  initialPhotos,
  initialComments = [],
}: Props) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [comments, setComments] = useState(initialComments);
  const [active, setActive] = useState<PhotoMeta | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const columnCount = useGalleryColumns();
  const columns = useMemo(
    () => splitIntoColumns(photos, columnCount),
    [photos, columnCount],
  );

  // Lightbox comment form
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [postBusy, setPostBusy] = useState(false);

  const commentCounts = useMemo(() => countsFrom(comments), [comments]);

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

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [active]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadOne(photo: PhotoMeta) {
    const url = photoPublicUrl(photo.tripId, photo.filename);
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = photo.originalName || photo.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadSelected() {
    const list =
      selectMode && selected.size > 0
        ? photos.filter((p) => selected.has(p.id))
        : photos;
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
    setPostError(null);
    setBody("");
    setActive(photo);
    void refreshComments();
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
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
          <p className="font-serif text-xl text-ink-soft">No photos yet</p>
          <p className="mt-2 text-sm text-ink-muted">
            Share the first shot — use Share above or the button in the corner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {photos.length} {photos.length === 1 ? "photo" : "photos"}
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
              const url = photoPublicUrl(photo.tripId, photo.filename);
              const isSelected = selected.has(photo.id);
              const n = commentCounts[photo.id] || 0;
              return (
                <figure
                  key={photo.id}
                  className="group relative overflow-hidden rounded-xl bg-sand-100 shadow-sm ring-1 ring-black/5 sm:rounded-2xl"
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
                      aria-label="Select photo"
                    >
                      ✓
                    </button>
                  )}

                  <button
                    type="button"
                    className="relative block w-full text-left"
                    onClick={() =>
                      selectMode ? toggleSelect(photo.id) : openPhoto(photo)
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={photo.caption || photo.originalName}
                      className="block w-full object-cover transition duration-300 group-active:opacity-95 sm:group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    {/* Bottom gradient so white text stays readable */}
                    <span
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 via-black/20 to-transparent sm:h-16"
                      aria-hidden
                    />
                    <span className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-1.5 px-2 pb-1.5 pt-6 sm:px-2.5 sm:pb-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-medium leading-tight text-white drop-shadow-sm sm:text-xs">
                          {photo.uploader}
                        </span>
                        {photo.caption && (
                          <span className="mt-0.5 block truncate text-[10px] leading-tight text-white/85 drop-shadow-sm sm:text-[11px]">
                            {photo.caption}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5">
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
                    aria-label="Download this photo"
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

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal
          aria-label="Photo detail"
        >
          <div
            className="relative flex max-h-[min(96vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-sand-50 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPublicUrl(active.tripId, active.filename)}
                alt={active.caption || active.originalName}
                className="max-h-[50vh] w-full bg-sand-100 object-contain sm:max-h-[55vh]"
              />

              <div className="border-b border-sand-200/70 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{active.uploader}</p>
                    <p className="text-sm text-ink-muted">
                      {active.caption || active.originalName}
                      {" · "}
                      {formatFileSize(active.size)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadOne(active)}
                      className="rounded-full bg-sea px-4 py-2 text-sm text-white transition hover:bg-sea-soft"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => setActive(null)}
                      className="rounded-full border border-sand-300 px-4 py-2 text-sm text-ink-soft hover:bg-sand-100"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6">
                <div className="mb-4 flex items-baseline justify-between gap-2">
                  <h3 className="font-serif text-lg text-ink">Comments</h3>
                  <span className="text-xs text-ink-muted">
                    {activeComments.length}{" "}
                    {activeComments.length === 1 ? "note" : "notes"}
                  </span>
                </div>

                <form
                  onSubmit={(e) => void postPhotoComment(e)}
                  className="mb-5 rounded-2xl border border-sand-200/80 bg-white/70 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                    <label className="block">
                      <span className="mb-1 block text-xs text-ink-soft">
                        Name *
                      </span>
                      <input
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        maxLength={40}
                        placeholder="Your name"
                        className="w-full rounded-xl border border-sand-200 bg-sand-50/80 px-3 py-2 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-ink-soft">
                        Comment *
                      </span>
                      <input
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        maxLength={500}
                        placeholder="Love this light…"
                        className="w-full rounded-xl border border-sand-200 bg-sand-50/80 px-3 py-2 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
                      />
                    </label>
                  </div>
                  {postError && (
                    <p className="mt-2 text-sm text-coral">{postError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={postBusy}
                    className="mt-3 rounded-full bg-ink px-4 py-2 text-sm text-white transition hover:bg-ink-soft disabled:opacity-60"
                  >
                    {postBusy ? "Posting…" : "Post comment"}
                  </button>
                </form>

                <div className="space-y-3 pb-2">
                  {activeComments.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      No comments yet — leave the first note on this photo.
                    </p>
                  ) : (
                    activeComments.map((c) => (
                      <article
                        key={c.id}
                        className="rounded-xl border border-sand-200/70 bg-white/50 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-ink">
                            {c.author}
                          </p>
                          <time className="text-xs text-ink-muted">
                            {formatWhen(c.createdAt)}
                          </time>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                          {c.body}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
