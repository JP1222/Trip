"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { getCroppedImageBlob } from "@/lib/crop-image";
import type {
  WallAspect,
  WallDisplaySize,
  WallFrameStyle,
} from "@/lib/wall-photos";

type Props = {
  src: string;
  title: string;
  uploadUrl: string;
  onClose: () => void;
  onSaved: (coverImage: string) => void;
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

const SIZE_OPTIONS: { id: WallDisplaySize; label: string; width: number }[] = [
  { id: "sm", label: "S", width: 140 },
  { id: "md", label: "M", width: 180 },
  { id: "lg", label: "L", width: 220 },
];

function cropAspectRatio(aspect: WallAspect): number | undefined {
  if (aspect === "landscape") return 3 / 2;
  if (aspect === "portrait") return 2 / 3;
  if (aspect === "square") return 1;
  return undefined;
}

function previewOrientation(
  aspect: WallAspect,
): "landscape" | "portrait" | "square" {
  if (aspect === "landscape") return "landscape";
  if (aspect === "portrait") return "portrait";
  if (aspect === "square") return "square";
  return "portrait";
}

/**
 * Polaroid-cover editor: CleanShot-style drag crop (react-easy-crop) +
 * iPhone-style degree straighten, with the same Frame / Aspect / Size
 * vocabulary as the board photo editor.
 */
export function AdminCoverEditor({
  src,
  title,
  uploadUrl,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const [frameStyle, setFrameStyle] = useState<WallFrameStyle>("polaroid");
  const [aspect, setAspect] = useState<WallAspect>("auto");
  const [displaySize, setDisplaySize] = useState<WallDisplaySize>("md");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  /** Fine straighten like Photos.app (−45…45). */
  const [straighten, setStraighten] = useState(0);
  /** Quarter turns applied before straighten. */
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotation = quarterTurns * 90 + straighten;
  const aspectRatio = cropAspectRatio(aspect);
  const previewWidth =
    SIZE_OPTIONS.find((o) => o.id === displaySize)?.width ?? 180;
  const orientation = previewOrientation(aspect);
  const hasCaption = Boolean(title.trim());

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

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  // Live board preview from the actual crop (not a CSS fake).
  useEffect(() => {
    if (!croppedAreaPixels) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getCroppedImageBlob(src, croppedAreaPixels, rotation, {
        maxEdge: 720,
        quality: 0.82,
      })
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        })
        .catch(() => {
          /* keep last good preview */
        });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [src, croppedAreaPixels, rotation]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // Only revoke on unmount; live updates revoke the previous URL above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!croppedAreaPixels) {
      setError("Drag the crop area first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await getCroppedImageBlob(src, croppedAreaPixels, rotation);
      const form = new FormData();
      form.append("file", blob, "cover.jpg");
      const res = await fetch(uploadUrl, { method: "POST", body: form });
      const data = (await res.json()) as {
        coverImage?: string;
        error?: string;
      };
      if (!res.ok || !data.coverImage) {
        throw new Error(data.error || "Could not save cover");
      }
      onSaved(data.coverImage);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const printSrc = previewUrl || src;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="flex max-h-[min(94dvh,860px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-sand-200/90 bg-[#fffcf8] shadow-[0_24px_80px_rgba(28,26,23,0.28)]"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void save(e)}
      >
        <div className="flex items-center justify-between gap-3 border-b border-sand-200/80 px-4 py-3 sm:px-5">
          <h2 id={titleId} className="font-serif text-lg text-ink sm:text-xl">
            Edit polaroid cover
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(15.5rem,0.8fr)] lg:gap-6 lg:p-5">
            {/* Crop stage — CleanShot-style drag reframing */}
            <div className="space-y-3">
              <div className="relative h-[min(48dvh,400px)] overflow-hidden rounded-2xl bg-[#1c1a17] ring-1 ring-black/15">
                <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={aspectRatio}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  objectFit="contain"
                  showGrid
                  style={{
                    containerStyle: { borderRadius: "1rem" },
                    cropAreaStyle: {
                      border: "1.5px solid rgba(255,255,255,0.92)",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.52)",
                    },
                  }}
                />
              </div>
              <p className="text-center text-[11px] text-ink-muted">
                Drag to reframe · scroll / pinch to zoom · straighten below
              </p>

              {/* Board print preview — Frame / Aspect / Size are live here */}
              <div className="flex justify-center rounded-2xl border border-dashed border-sand-200 bg-sand-50/90 px-4 py-5">
                <div
                  className={[
                    "instant shadow-md transition-[width] duration-200",
                    `instant--${orientation}`,
                    `instant--frame-${frameStyle}`,
                    frameStyle === "borderless" || !hasCaption
                      ? "instant--no-labels"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ ["--w" as string]: `${previewWidth}px` }}
                >
                  <div className="instant__pad">
                    <div className="instant__image bg-sand-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={printSrc}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                  {hasCaption && frameStyle !== "borderless" ? (
                    <div className="instant__foot">
                      <span className="instant__caption">{title.trim()}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Controls — same pills as Edit board photo */}
            <div className="flex flex-col gap-3.5">
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
                      title={opt.hint}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        frameStyle === opt.id
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
                  Aspect
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {ASPECT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAspect(opt.id);
                        setCrop({ x: 0, y: 0 });
                      }}
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
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  Locks the crop box · preview updates below
                </p>
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

              <fieldset className="min-w-0">
                <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
                  <span>Straighten</span>
                  <span className="font-mono text-[11px] font-normal normal-case tracking-normal text-ink-soft tabular-nums">
                    {straighten > 0 ? "+" : ""}
                    {straighten.toFixed(1)}°
                  </span>
                </legend>
                <input
                  type="range"
                  min={-45}
                  max={45}
                  step={0.5}
                  value={straighten}
                  disabled={busy}
                  onChange={(e) => setStraighten(Number(e.target.value))}
                  className="w-full accent-sea"
                  aria-label="Straighten degrees"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setQuarterTurns((t) => (t + 3) % 4)}
                    className="rounded-full border border-sand-300 bg-white px-3 py-1.5 text-sm text-ink-soft hover:border-sea/40"
                  >
                    ↺ 90°
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setQuarterTurns((t) => (t + 1) % 4)}
                    className="rounded-full border border-sand-300 bg-white px-3 py-1.5 text-sm text-ink-soft hover:border-sea/40"
                  >
                    ↻ 90°
                  </button>
                  <button
                    type="button"
                    disabled={busy || (straighten === 0 && quarterTurns === 0)}
                    onClick={() => {
                      setStraighten(0);
                      setQuarterTurns(0);
                    }}
                    className="rounded-full px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-40"
                  >
                    Reset angle
                  </button>
                </div>
              </fieldset>

              <fieldset className="min-w-0">
                <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
                  <span>Zoom</span>
                  <span className="font-mono text-[11px] font-normal normal-case tracking-normal text-ink-soft tabular-nums">
                    {zoom.toFixed(2)}×
                  </span>
                </legend>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  disabled={busy}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-sea"
                  aria-label="Zoom"
                />
              </fieldset>

              {error ? (
                <p className="text-sm text-coral" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-sand-200/80 px-4 py-3 sm:px-5">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-sea px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-soft disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full px-3 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
