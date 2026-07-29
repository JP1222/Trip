"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  tripId: string;
};

const MAX_FILES = 100;
const MAX_BYTES = 20 * 1024 * 1024;
const CONCURRENCY = 4;
const OPEN_EVENT = "photos:open-upload";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function openPhotoUpload() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Header / inline trigger that opens the floating upload sheet */
export function OpenUploadButton({
  className,
  children = "Share photos",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={openPhotoUpload}
      className={
        className ??
        "rounded-full bg-sea px-5 py-2.5 text-sm text-white transition hover:bg-sea-soft"
      }
    >
      {children}
    </button>
  );
}

async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items || []);
  if (!items.length) return Array.from(dt.files || []);

  const out: File[] = [];

  async function walkEntry(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      if (isImageFile(file)) out.push(file);
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });
      let batch = await readBatch();
      while (batch.length) {
        for (const child of batch) {
          await walkEntry(child);
        }
        batch = await readBatch();
      }
    }
  }

  const entries = items
    .map((item) =>
      typeof item.webkitGetAsEntry === "function"
        ? item.webkitGetAsEntry()
        : null,
    )
    .filter((e): e is FileSystemEntry => Boolean(e));

  if (!entries.length) {
    return Array.from(dt.files || []).filter(isImageFile);
  }

  for (const entry of entries) {
    await walkEntry(entry);
  }
  return out;
}

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
}

export function PhotoUpload({ tripId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [uploader, setUploader] = useState("");
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);

    if (typeof window !== "undefined" && window.location.hash === "#upload") {
      setOpen(true);
    }
    const onHash = () => {
      if (window.location.hash === "#upload") setOpen(true);
    };
    window.addEventListener("hashchange", onHash);

    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy]);

  function close() {
    if (busy) return;
    setOpen(false);
    if (window.location.hash === "#upload") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  function mergeFiles(incoming: File[]) {
    if (!incoming.length) {
      setError("No image files found in that selection");
      return;
    }

    setFiles((prev) => {
      const seen = new Set(prev.map(fileKey));
      const next = [...prev];
      let skippedOversize = 0;
      let skippedDup = 0;

      for (const f of incoming) {
        if (f.size > MAX_BYTES) {
          skippedOversize += 1;
          continue;
        }
        const key = fileKey(f);
        if (seen.has(key)) {
          skippedDup += 1;
          continue;
        }
        if (next.length >= MAX_FILES) break;
        seen.add(key);
        next.push(f);
      }

      const messages: string[] = [];
      if (next.length >= MAX_FILES && prev.length + incoming.length > MAX_FILES) {
        messages.push(`Batch capped at ${MAX_FILES} photos`);
      }
      if (skippedOversize) {
        messages.push(`${skippedOversize} over 20MB skipped`);
      }
      if (skippedDup) {
        messages.push(
          `${skippedDup} duplicate${skippedDup === 1 ? "" : "s"} skipped`,
        );
      }
      setError(messages.length ? messages.join(" · ") : null);
      return next;
    });
  }

  function onPick(list: FileList | null) {
    if (!list?.length) return;
    mergeFiles(Array.from(list).filter(isImageFile));
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    try {
      const collected = await filesFromDataTransfer(e.dataTransfer);
      mergeFiles(collected);
    } catch {
      onPick(e.dataTransfer.files);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function clearFiles() {
    setFiles([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) {
      setError("Please choose at least one photo");
      return;
    }
    if (!uploader.trim()) {
      setError("Add your name so everyone knows who took the shot");
      return;
    }

    const batch = [...files];
    setBusy(true);
    setError(null);
    setDone(0);
    setFailed(0);
    setTotal(batch.length);
    setProgress(`Uploading 0 / ${batch.length}…`);

    let success = 0;
    let failCount = 0;
    const failNames: string[] = [];

    await runPool(batch, CONCURRENCY, async (file) => {
      const form = new FormData();
      form.append("file", file);
      form.append("uploader", uploader.trim());
      if (caption.trim()) form.append("caption", caption.trim());

      try {
        const res = await fetch(`/api/trips/${tripId}/photos`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || "failed");
        }
        success += 1;
        setDone(success);
      } catch {
        failCount += 1;
        failNames.push(file.name);
        setFailed(failCount);
      }
      setProgress(
        `Uploading ${success + failCount} / ${batch.length}… (${success} ok${
          failCount ? `, ${failCount} failed` : ""
        })`,
      );
    });

    setBusy(false);
    window.dispatchEvent(new Event("photos:uploaded"));

    if (success > 0) {
      setFiles([]);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }

    if (failCount === 0) {
      setProgress(`Uploaded ${success} photo${success === 1 ? "" : "s"} ✨`);
      setError(null);
      // Auto-close shortly after full success
      setTimeout(() => {
        setProgress(null);
        setOpen(false);
      }, 1200);
    } else if (success === 0) {
      setProgress(null);
      setError(
        `All ${failCount} uploads failed${
          failNames[0] ? ` (e.g. ${failNames[0]})` : ""
        }`,
      );
    } else {
      setProgress(`Uploaded ${success} of ${batch.length}`);
      setError(
        `${failCount} failed: ${failNames.slice(0, 3).join(", ")}${
          failNames.length > 3 ? "…" : ""
        }`,
      );
      setTimeout(() => setProgress(null), 4000);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-sand-200 bg-sand-50/80 px-4 py-2.5 text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-sea/50 focus:ring-2 focus:ring-sea/15";

  const pct =
    busy && total > 0 ? Math.round(((done + failed) / total) * 100) : 0;

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close upload" : "Share photos"}
        aria-expanded={open}
        className={`fixed right-5 bottom-5 z-50 flex h-14 items-center gap-2 rounded-full bg-sea px-5 text-white shadow-[0_10px_30px_rgba(61,102,100,0.35)] transition hover:bg-sea-soft hover:shadow-[0_12px_36px_rgba(61,102,100,0.45)] active:scale-[0.98] sm:right-8 sm:bottom-8 ${
          open ? "bg-ink-soft hover:bg-ink" : ""
        }`}
      >
        {open ? (
          <>
            <span className="text-lg leading-none" aria-hidden>
              ×
            </span>
            <span className="text-sm font-medium">Close</span>
          </>
        ) : (
          <>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span className="text-sm font-medium">Share photos</span>
          </>
        )}
      </button>

      {/* Sheet / modal */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={close}
            disabled={busy}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-sheet-title"
            className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col rounded-t-3xl border border-sand-200/80 bg-sand-50 shadow-2xl sm:rounded-3xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sand-200/70 px-5 py-4 sm:px-6">
              <div>
                <h3
                  id="upload-sheet-title"
                  className="font-serif text-xl text-ink sm:text-2xl"
                >
                  Share your photos
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  HEIC / HDR ok · up to {MAX_FILES} · max 20MB each
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-full px-2 py-1 text-xl leading-none text-ink-muted transition hover:bg-sand-200/60 hover:text-ink disabled:opacity-40"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-ink-soft">
                      Your name *
                    </span>
                    <input
                      type="text"
                      value={uploader}
                      onChange={(e) => setUploader(e.target.value)}
                      placeholder="e.g. Peng"
                      maxLength={40}
                      className={inputClass}
                      disabled={busy}
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-ink-soft">
                      Caption (optional)
                    </span>
                    <input
                      type="text"
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="e.g. Canyon boardwalk"
                      maxLength={120}
                      className={inputClass}
                      disabled={busy}
                    />
                  </label>
                </div>

                <div
                  className={`rounded-xl border-2 border-dashed px-3 py-6 text-center transition ${
                    dragging
                      ? "border-sea bg-mist/60"
                      : "border-sand-300 bg-white/70 hover:border-sea/40"
                  } ${busy ? "pointer-events-none opacity-60" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => void onDrop(e)}
                >
                  <p className="text-sm text-ink-soft">
                    Drop photos or a folder here
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Multi-select, or a whole folder on desktop
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="rounded-full bg-coral/90 px-4 py-2 text-sm text-white transition hover:bg-coral"
                    >
                      Choose photos
                    </button>
                    <button
                      type="button"
                      onClick={() => folderRef.current?.click()}
                      className="rounded-full border border-sand-300 bg-white px-4 py-2 text-sm text-ink-soft transition hover:border-sea/40 hover:text-sea"
                    >
                      Choose folder
                    </button>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      onPick(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={folderRef}
                    type="file"
                    // @ts-expect-error non-standard but widely supported
                    webkitdirectory=""
                    directory=""
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      onPick(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                {files.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-ink-muted">
                      <span>
                        {files.length} photo
                        {files.length === 1 ? "" : "s"} ready
                        {files.length >= MAX_FILES ? ` (max ${MAX_FILES})` : ""}
                      </span>
                      {!busy && (
                        <button
                          type="button"
                          onClick={clearFiles}
                          className="text-ink-muted hover:text-coral"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <ul className="max-h-28 space-y-1.5 overflow-y-auto rounded-xl bg-sand-100/70 p-2.5">
                      {files.map((f, i) => (
                        <li
                          key={fileKey(f)}
                          className="flex items-center justify-between gap-2 text-sm text-ink-soft"
                        >
                          <span className="truncate">{f.name}</span>
                          {!busy && (
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              className="shrink-0 text-ink-muted hover:text-coral"
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {busy && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
                    <div
                      className="h-full rounded-full bg-sea transition-[width] duration-300 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                {error && (
                  <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
                    {error}
                  </p>
                )}
                {progress && (
                  <p className="text-sm text-sea">{progress}</p>
                )}
              </div>

              <div className="shrink-0 border-t border-sand-200/70 px-5 py-4 sm:px-6">
                <button
                  type="submit"
                  disabled={busy || files.length === 0}
                  className="w-full rounded-full bg-sea px-6 py-3 text-sm font-medium text-white transition hover:bg-sea-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy
                    ? `Uploading… ${done + failed}/${total}`
                    : files.length > 0
                      ? `Upload ${files.length} photo${files.length === 1 ? "" : "s"}`
                      : "Choose photos to upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
