"use client";

import { useCallback, useEffect, useState } from "react";
import type { PhotoMeta } from "@/lib/types";
import { formatFileSize, photoPublicUrl } from "@/lib/photos-client";

type Props = {
  tripId: string;
  initialPhotos: PhotoMeta[];
};

export function PhotoGallery({ tripId, initialPhotos }: Props) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [active, setActive] = useState<PhotoMeta | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/trips/${tripId}/photos`);
    if (res.ok) {
      const data = (await res.json()) as PhotoMeta[];
      setPhotos(data);
    }
  }, [tripId]);

  useEffect(() => {
    const onUploaded = () => void refresh();
    window.addEventListener("photos:uploaded", onUploaded);
    return () => window.removeEventListener("photos:uploaded", onUploaded);
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      selected.size > 0
        ? photos.filter((p) => selected.has(p.id))
        : photos;
    for (const photo of list) {
      await downloadOne(photo);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-sand-300 bg-white/40 px-6 py-16 text-center">
        <p className="font-serif text-xl text-ink-soft">No photos yet</p>
        <p className="mt-2 text-sm text-ink-muted">
          Tap the Share photos button in the corner to add the first shot.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {photos.length} {photos.length === 1 ? "photo" : "photos"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelected(new Set());
            }}
            className="rounded-full border border-sand-300 bg-white/70 px-4 py-2 text-sm text-ink-soft transition hover:border-sea/40 hover:text-sea"
          >
            {selectMode ? "Cancel select" : "Select to download"}
          </button>
          <button
            type="button"
            onClick={() => void downloadSelected()}
            className="rounded-full bg-sea px-4 py-2 text-sm text-white transition hover:bg-sea-soft"
          >
            {selectMode && selected.size > 0
              ? `Download selected (${selected.size})`
              : "Download all"}
          </button>
        </div>
      </div>

      <div className="photo-grid">
        {photos.map((photo) => {
          const url = photoPublicUrl(photo.tripId, photo.filename);
          const isSelected = selected.has(photo.id);
          return (
            <figure
              key={photo.id}
              className="group relative overflow-hidden rounded-2xl border border-sand-200/80 bg-white/50 shadow-sm"
            >
              {selectMode && (
                <button
                  type="button"
                  onClick={() => toggleSelect(photo.id)}
                  className={`absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
                    isSelected
                      ? "border-sea bg-sea text-white"
                      : "border-white/90 bg-black/20 text-transparent"
                  }`}
                  aria-label="Select photo"
                >
                  ✓
                </button>
              )}
              <button
                type="button"
                className="block w-full text-left"
                onClick={() =>
                  selectMode ? toggleSelect(photo.id) : setActive(photo)
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={photo.caption || photo.originalName}
                  className="w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                  loading="lazy"
                />
              </button>
              <figcaption className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{photo.uploader}</p>
                  {photo.caption && (
                    <p className="truncate text-xs text-ink-muted">
                      {photo.caption}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void downloadOne(photo)}
                  className="shrink-0 rounded-full p-1.5 text-ink-muted transition hover:bg-sand-100 hover:text-sea"
                  title="Download"
                  aria-label="Download this photo"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </figcaption>
            </figure>
          );
        })}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-sand-50 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPublicUrl(active.tripId, active.filename)}
              alt={active.caption || active.originalName}
              className="max-h-[75vh] w-full object-contain bg-sand-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium text-ink">{active.uploader}</p>
                <p className="text-sm text-ink-muted">
                  {active.caption || active.originalName}
                  {" · "}
                  {formatFileSize(active.size)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void downloadOne(active)}
                  className="rounded-full bg-sea px-4 py-2 text-sm text-white transition hover:bg-sea-soft"
                >
                  Download original
                </button>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded-full border border-sand-300 px-4 py-2 text-sm text-ink-soft"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
