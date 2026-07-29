"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  WallAspect,
  WallDisplaySize,
  WallFrameStyle,
} from "@/lib/wall-photos";

export type EditableBoardPhoto = {
  id: string;
  src: string;
  caption: string;
  meta: string;
  frameStyle: WallFrameStyle;
  displaySize: WallDisplaySize;
  aspect: WallAspect;
  orientation?: "landscape" | "portrait" | "square" | null;
};

type Props = {
  photo: EditableBoardPhoto;
  onClose: () => void;
  onSaved: (photo: EditableBoardPhoto) => void;
  onDeleted: (id: string) => void;
};

const FRAME_OPTIONS: { id: WallFrameStyle; label: string; hint: string }[] = [
  { id: "polaroid", label: "Polaroid", hint: "White write-on margin" },
  { id: "borderless", label: "Borderless", hint: "Photo only" },
  { id: "thin_white", label: "Thin white", hint: "Light mat" },
];

const ASPECT_OPTIONS: { id: WallAspect; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "landscape", label: "Wide" },
  { id: "portrait", label: "Tall" },
  { id: "square", label: "Square" },
];

const SIZE_OPTIONS: { id: WallDisplaySize; label: string }[] = [
  { id: "sm", label: "S" },
  { id: "md", label: "M" },
  { id: "lg", label: "L" },
];

function previewOrientation(
  aspect: WallAspect,
  orientation?: EditableBoardPhoto["orientation"],
): "landscape" | "portrait" | "square" {
  if (aspect !== "auto") return aspect;
  return orientation || "landscape";
}

/**
 * Compact modal: optional labels + frame / aspect / size + replace image.
 */
export function AdminWallPhotoEditor({
  photo,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState(photo.caption);
  const [meta, setMeta] = useState(photo.meta);
  const [src, setSrc] = useState(photo.src);
  const [frameStyle, setFrameStyle] = useState<WallFrameStyle>(photo.frameStyle);
  const [displaySize, setDisplaySize] = useState<WallDisplaySize>(
    photo.displaySize,
  );
  const [aspect, setAspect] = useState<WallAspect>(photo.aspect);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCaption(photo.caption);
    setMeta(photo.meta);
    setSrc(photo.src);
    setFrameStyle(photo.frameStyle);
    setDisplaySize(photo.displaySize);
    setAspect(photo.aspect);
    setStatus(null);
    setError(null);
  }, [photo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onClose]);

  const hasLabels = Boolean(caption.trim() || meta.trim());
  const orientation = previewOrientation(aspect, photo.orientation);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/wall/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          meta,
          frameStyle,
          displaySize,
          aspect,
        }),
      });
      const data = (await res.json()) as {
        caption?: string;
        meta?: string;
        frameStyle?: WallFrameStyle;
        displaySize?: WallDisplaySize;
        aspect?: WallAspect;
        orientation?: EditableBoardPhoto["orientation"];
        src?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not save");
      const next: EditableBoardPhoto = {
        id: photo.id,
        src: data.src || src,
        caption: data.caption ?? caption,
        meta: data.meta ?? meta,
        frameStyle: data.frameStyle ?? frameStyle,
        displaySize: data.displaySize ?? displaySize,
        aspect: data.aspect ?? aspect,
        orientation: data.orientation ?? photo.orientation,
      };
      setCaption(next.caption);
      setMeta(next.meta);
      setFrameStyle(next.frameStyle);
      setDisplaySize(next.displaySize);
      setAspect(next.aspect);
      setStatus("Saved");
      onSaved(next);
      window.setTimeout(() => onClose(), 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function replaceImage(file: File) {
    const ok =
      file.type.startsWith("image/") ||
      /\.(jpe?g|png|webp|hei[cf]|gif|avif)$/i.test(file.name);
    if (!ok) {
      setError("Please choose an image file");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Updating photo…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/wall/photos/${photo.id}`, {
        method: "PATCH",
        body: form,
      });
      const data = (await res.json()) as {
        src?: string;
        caption?: string;
        meta?: string;
        frameStyle?: WallFrameStyle;
        displaySize?: WallDisplaySize;
        aspect?: WallAspect;
        orientation?: EditableBoardPhoto["orientation"];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not replace image");

      const nextSrc = data.src
        ? `${data.src}${data.src.includes("?") ? "&" : "?"}t=${Date.now()}`
        : src;
      const next: EditableBoardPhoto = {
        id: photo.id,
        src: nextSrc,
        caption: data.caption ?? caption,
        meta: data.meta ?? meta,
        frameStyle: data.frameStyle ?? frameStyle,
        displaySize: data.displaySize ?? displaySize,
        aspect: data.aspect ?? aspect,
        orientation: data.orientation ?? photo.orientation,
      };
      setSrc(next.src);
      setStatus("Photo updated");
      onSaved(next);
      window.setTimeout(() => setStatus(null), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not replace image");
      setStatus(null);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    if (!confirm("Remove this photo from the board?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/wall/photos/${photo.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onDeleted(photo.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-h-[min(92dvh,720px)] w-full max-w-lg overflow-y-auto rounded-3xl border border-sand-200 bg-[#fffcf8] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-sand-200/80 bg-[#fffcf8]/95 px-4 py-3 backdrop-blur-sm sm:px-5">
          <h2 id={titleId} className="font-serif text-lg text-ink">
            Edit board photo
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-100 text-lg leading-none text-ink-muted transition hover:bg-sand-200 disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid gap-5 p-4 sm:grid-cols-[140px_1fr] sm:gap-5 sm:p-5">
          <div className="mx-auto w-[140px]">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="group relative block w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left disabled:cursor-wait disabled:opacity-70"
              aria-label="Change photo"
              title="Change photo"
            >
              <div
                className={[
                  "instant shadow-md transition group-hover:shadow-lg",
                  `instant--${orientation}`,
                  `instant--frame-${frameStyle}`,
                  `instant--size-${displaySize}`,
                  // Always no-labels for borderless; otherwise only when empty text
                  frameStyle === "borderless" || !hasLabels
                    ? "instant--no-labels"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ ["--w" as string]: "140px" }}
              >
                <div className="instant__pad">
                  <div className="instant__image relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={caption.trim() || "Board photo"} />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/45 text-[11px] font-medium tracking-wide text-white uppercase opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                      Change
                    </span>
                  </div>
                </div>
                {hasLabels && frameStyle !== "borderless" ? (
                  <div className="instant__foot">
                    {caption.trim() ? (
                      <span className="instant__caption">{caption.trim()}</span>
                    ) : null}
                    {meta.trim() ? (
                      <span className="instant__date">{meta.trim()}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <span className="mt-2 block text-center text-[11px] text-ink-muted group-hover:text-sea">
                Tap photo to replace
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void replaceImage(file);
              }}
            />
          </div>

          <form onSubmit={save} className="flex min-w-0 flex-col gap-3.5">
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
                Frame
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {FRAME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setFrameStyle(opt.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      frameStyle === opt.id
                        ? "bg-ink text-white"
                        : "border border-sand-300 bg-white text-ink-soft hover:border-sea/40"
                    }`}
                    title={opt.hint}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
                Aspect
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setAspect(opt.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      aspect === opt.id
                        ? "bg-ink text-white"
                        : "border border-sand-300 bg-white text-ink-soft hover:border-sea/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
                Size on board
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setDisplaySize(opt.id)}
                    className={`min-w-[2.5rem] rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      displaySize === opt.id
                        ? "bg-ink text-white"
                        : "border border-sand-300 bg-white text-ink-soft hover:border-sea/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm">
              <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-ink-soft">
                Caption
                <span className="font-normal text-ink-muted">optional</span>
              </span>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={120}
                disabled={busy}
                placeholder="Leave empty for no text"
                className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-ink-soft">
                Names / note
                <span className="font-normal text-ink-muted">optional</span>
              </span>
              <input
                type="text"
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                maxLength={200}
                disabled={busy}
                placeholder="Leave empty for no text"
                className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
              />
            </label>

            {(status || error) && (
              <p
                className={`text-xs ${error ? "text-coral" : "text-sea"}`}
                role={error ? "alert" : "status"}
              >
                {error || status}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-sea px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-soft disabled:opacity-50"
              >
                {busy ? "Working…" : "Save"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-full px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="ml-auto rounded-full border border-coral/35 px-3 py-1.5 text-xs text-coral transition hover:bg-coral/10 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
