"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { PhotoMeta } from "@/lib/types";
import { photoPublicUrl } from "@/lib/photos-client";

type Props = {
  tripId: string;
  tripTitle: string;
  photos: PhotoMeta[];
  coverImage?: string;
};

const MAX_BATCH = 50;

export function AdminPhotos({
  tripId,
  tripTitle,
  photos: initial,
  coverImage: initialCover,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(initial);
  const [cover, setCover] = useState(initialCover || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

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
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set cover");
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
      refresh();
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
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name))
      .slice(0, MAX_BATCH);
    if (!files.length) {
      setError("No image files found");
      return;
    }

    setBusy(true);
    setError(null);
    setUploadProgress(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);

    try {
      // One request, sequential save on server (avoids photos.json races)
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
        setPhotos((prev) => [...saved, ...prev]);
        // Auto-set first cover if none
        if (!cover && saved[0]) {
          const url = photoPublicUrl(saved[0].tripId, saved[0].filename);
          await fetch(`/api/admin/trips/${tripId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coverImage: url }),
          });
          setCover(url);
        }
      }

      if (data.errors?.length) {
        setStatus(`Added ${saved.length}`);
        setError(data.errors.slice(0, 3).join(" · "));
      } else {
        setStatus(
          `Added ${saved.length} photo${saved.length === 1 ? "" : "s"}`,
        );
      }
      setTimeout(() => setStatus(null), 3000);
      refresh();
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
            Photos
            <span className="ml-2 text-base font-sans font-normal text-ink-muted">
              {photos.length}
            </span>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Upload, select a polaroid cover, multi-select to delete.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-full bg-sea px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-soft disabled:opacity-50"
          >
            Add photos
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
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
          <p className="text-sm text-ink-soft">Drop photos here to add</p>
          <p className="mt-1 text-xs text-ink-muted">
            Or use Add photos · HEIC / HDR ok · up to {MAX_BATCH} at once
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

      {/* Photo grid */}
      {photos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sand-300 px-4 py-10 text-center text-sm text-ink-muted">
          No photos yet — add some above.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {photos.map((p) => {
            const url = photoPublicUrl(p.tripId, p.filename);
            const isCover = cover === url;
            const isSelected = selected.has(p.id);
            return (
              <li key={p.id} className="group relative">
                <div
                  className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-sand-100 transition ${
                    isCover
                      ? "border-sea ring-2 ring-sea/25"
                      : isSelected
                        ? "border-coral/70 ring-2 ring-coral/20"
                        : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={p.caption || p.originalName}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />

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

                  {/* Quick delete */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteIds([p.id])}
                    className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-sm leading-none text-white opacity-0 transition hover:bg-coral group-hover:opacity-100"
                    aria-label="Delete photo"
                    title="Delete"
                  >
                    ×
                  </button>

                  {/* Use as cover */}
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
                    {isCover ? "On polaroid" : "Set as polaroid"}
                  </button>
                </div>
                <p className="mt-1 truncate px-0.5 text-[10px] text-ink-muted">
                  {p.uploader}
                </p>
              </li>
            );
          })}
        </ul>
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
    </div>
  );
}
