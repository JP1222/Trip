"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BoardDecorIcon } from "@/components/board/BoardDecorIcon";
import { DecorCatalogSheet } from "@/components/board/DecorCatalogSheet";
import {
  BOARD_CLIPS,
  BOARD_NOTES,
  BOARD_PINS,
  BOARD_WIDGETS,
  type BoardDecorItem,
  type DecorCategory,
} from "@/lib/board-decor";
import type { WallPhoto } from "@/lib/wall-photos";

const MAX_BATCH = 12;

type MenuId = "photo" | DecorCategory | null;

/**
 * Bottom-right + control on the admin wall.
 * Opens a short menu for what to pin next (board photo + decor catalogs).
 */
export function AdminAddFab() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<MenuId>(null);
  const [caption, setCaption] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setPanel(null);
    setError(null);
    setStatus(null);
    setDragOver(false);
  }

  function openMenu() {
    setOpen(true);
    setPanel(null);
    setError(null);
    setStatus(null);
  }

  async function placeDecor(item: BoardDecorItem) {
    setBusy(true);
    setError(null);
    setStatus(`Placing ${item.name}…`);
    try {
      const res = await fetch("/api/admin/wall/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId: item.id }),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) throw new Error(data.error || "Could not place");
      setStatus("On the board — drag · corners resize · top handle rotate");
      router.refresh();
      window.setTimeout(() => {
        close();
      }, 650);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
      .filter(
        (f) =>
          f.type.startsWith("image/") ||
          /\.(jpe?g|png|webp|hei[cf]|gif|avif)$/i.test(f.name),
      )
      .slice(0, MAX_BATCH);
    if (!files.length) {
      setError("No image files found");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(
      `Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`,
    );

    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      if (caption.trim()) form.append("caption", caption.trim());
      if (meta.trim()) form.append("meta", meta.trim());

      const res = await fetch("/api/admin/wall/photos", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        photos?: WallPhoto[];
        errors?: string[];
        error?: string;
      };
      if (!res.ok && !data.photos?.length) {
        throw new Error(data.error || data.errors?.[0] || "Upload failed");
      }

      const saved = data.photos || [];
      if (data.errors?.length) {
        setError(data.errors.slice(0, 3).join(" · "));
      }

      if (saved.length) {
        setStatus(
          `Pinned ${saved.length} photo${saved.length === 1 ? "" : "s"}`,
        );
        setCaption("");
        setMeta("");
        router.refresh();
        window.setTimeout(() => {
          close();
        }, 700);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus(null);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const pinPreview = BOARD_PINS[1]; // rose
  const clipPreview = BOARD_CLIPS[3]; // wood
  const notePreview = BOARD_NOTES[0]; // butter
  const widgetPreview = BOARD_WIDGETS[0]; // classic vinyl

  return (
    <>
      <div
        className="pointer-events-none fixed right-5 bottom-5 z-[60] flex flex-col items-end gap-3 sm:right-8 sm:bottom-8"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {open && !panel && (
          <div
            className="pointer-events-auto flex w-[min(18rem,calc(100vw-2.5rem))] flex-col gap-1.5 rounded-2xl border border-sand-200/90 bg-white/95 p-2 shadow-[0_12px_40px_rgba(40,30,15,0.18)] backdrop-blur-xl"
            role="menu"
            aria-label="Add to board"
          >
            <button
              type="button"
              role="menuitem"
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-sand-50"
              onClick={() => setPanel("photo")}
            >
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sea/12 text-sea"
                aria-hidden
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7.5A2.5 2.5 0 0 1 6.5 5h2l1.2-1.6A1.5 1.5 0 0 1 10.9 3h2.2c.5 0 1 .24 1.2.64L15.5 5h2A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <circle
                    cx="12"
                    cy="12.5"
                    r="3.2"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                </svg>
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">
                  Board photo
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Polaroid for the home cork board
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-sand-50"
              onClick={() => setPanel("pin")}
            >
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full bg-[#f3ebe4]"
                aria-hidden
              >
                <BoardDecorIcon item={pinPreview} size={28} />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">
                  Pins
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {BOARD_PINS.length} styles — metal & enamel
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-sand-50"
              onClick={() => setPanel("clip")}
            >
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full bg-[#f3ebe4]"
                aria-hidden
              >
                <BoardDecorIcon item={clipPreview} size={26} />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">
                  Clips
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {BOARD_CLIPS.length} styles — binder & wood
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-sand-50"
              onClick={() => setPanel("note")}
            >
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full bg-[#f3ebe4]"
                aria-hidden
              >
                <BoardDecorIcon item={notePreview} size={28} />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">
                  Sticky notes
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {BOARD_NOTES.length} paper colors
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-sand-50"
              onClick={() => setPanel("widget")}
            >
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full bg-[#f3ebe4]"
                aria-hidden
              >
                <BoardDecorIcon item={widgetPreview} size={30} />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">
                  Vinyl & trinkets
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {BOARD_WIDGETS.length} styles — tape, tickets, stickers…
                </span>
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => (open ? close() : openMenu())}
          aria-label={open ? "Close add menu" : "Add to board"}
          aria-expanded={open}
          className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgba(61,102,100,0.35)] transition hover:shadow-[0_12px_36px_rgba(61,102,100,0.45)] active:scale-[0.96] ${
            open
              ? "bg-ink-soft hover:bg-ink"
              : "bg-sea hover:bg-sea-soft"
          }`}
        >
          <span
            className={`block text-3xl leading-none font-light transition-transform duration-200 ${
              open ? "rotate-45" : ""
            }`}
            aria-hidden
          >
            +
          </span>
        </button>
      </div>

      {open && panel === "photo" && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
          role="dialog"
          aria-modal
          aria-labelledby="admin-add-photo-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) close();
          }}
        >
          <div
            ref={sheetRef}
            className="max-h-[min(92dvh,720px)] w-full max-w-lg overflow-y-auto rounded-3xl border border-sand-200 bg-[#fffcf8] p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPanel(null)}
                  className="text-sm text-ink-muted transition hover:text-sea"
                >
                  ← Back
                </button>
                <h2
                  id="admin-add-photo-title"
                  className="mt-1 font-serif text-xl text-ink"
                >
                  Pin a board photo
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Shows on the home cork board like a trip polaroid. You can
                  edit caption after upload.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={close}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand-100 text-lg text-ink-muted hover:bg-sand-200"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium tracking-wide text-ink-muted uppercase">
                  Caption
                </span>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={120}
                  placeholder="Our crew"
                  disabled={busy}
                  className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium tracking-wide text-ink-muted uppercase">
                  Names / note
                </span>
                <input
                  type="text"
                  value={meta}
                  onChange={(e) => setMeta(e.target.value)}
                  maxLength={200}
                  placeholder="Peng · Carlie · …"
                  disabled={busy}
                  className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
                />
              </label>
            </div>

            <div
              className={`mt-4 flex min-h-[160px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                dragOver
                  ? "border-sea bg-mist/50"
                  : "border-sand-300 bg-white/70 hover:border-sea/35"
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
              <p className="text-sm text-ink-soft">Drop photos here</p>
              <p className="mt-1 text-xs text-ink-muted">
                JPEG · PNG · HEIC · WebP · up to {MAX_BATCH} · 20MB
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="mt-4 rounded-full bg-sea px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sea-soft disabled:opacity-50"
              >
                Choose photos
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
            </div>

            {(status || error) && (
              <div className="mt-3 space-y-1">
                {status && <p className="text-sm text-sea">{status}</p>}
                {error && <p className="text-sm text-coral">{error}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {open &&
        (panel === "pin" ||
          panel === "clip" ||
          panel === "note" ||
          panel === "widget") && (
          <DecorCatalogSheet
            category={panel}
            onClose={close}
            onBack={() => setPanel(null)}
            onSelect={(item) => {
              if (!busy) void placeDecor(item);
            }}
          />
        )}

      {open && busy && panel && panel !== "photo" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[75] flex justify-center px-4">
          <p className="rounded-full bg-ink/85 px-4 py-2 text-xs font-medium text-white shadow-lg">
            {status || "Working…"}
          </p>
        </div>
      )}
    </>
  );
}
