"use client";

import { useEffect, useState } from "react";
import {
  closeImageDialog$,
  editorRootElementRef$,
  imageAutocompleteSuggestions$,
  imageDialogState$,
  imageUploadHandler$,
  saveImage$,
  useCellValues,
  usePublisher,
} from "@mdxeditor/editor";
import { useArticleEditorMedia } from "@/components/admin/article-editor-media-context";
import { normalizeArticleImageSrc } from "@/lib/article-media";
import { photoListPublicUrl } from "@/lib/media-url";
import { isVideoMedia } from "@/lib/photos-client";
import type { PhotoMeta } from "@/lib/types";

/**
 * MDXEditor image dialog tailored for article media:
 * upload → media:<uuid>, paste UUID / media: ref, or pick from the album.
 */
export function ArticleImageDialog() {
  const [state, uploadHandler, suggestions, rootEl] = useCellValues(
    imageDialogState$,
    imageUploadHandler$,
    imageAutocompleteSuggestions$,
    editorRootElementRef$,
  );
  const saveImage = usePublisher(saveImage$);
  const closeImageDialog = usePublisher(closeImageDialog$);
  const { photos } = useArticleEditorMedia();

  const [src, setSrc] = useState("");
  const [altText, setAltText] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openToken, setOpenToken] = useState(0);

  useEffect(() => {
    if (state.type === "inactive") return;
    setOpenToken((n) => n + 1);
    if (state.type === "editing") {
      setSrc(state.initialValues.src || "");
      setAltText(state.initialValues.altText || "");
      setTitle(state.initialValues.title || "");
    } else {
      setSrc("");
      setAltText("");
      setTitle("");
    }
    setFile(null);
    setError(null);
    // Only re-seed when the dialog mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.type]);

  // Reset file input when dialog re-opens.
  useEffect(() => {
    setFile(null);
  }, [openToken]);

  if (state.type === "inactive") return null;

  const stills = photos.filter(
    (p) => !isVideoMedia(p) && p.state !== "failed",
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      const normalizedSrc = normalizeArticleImageSrc(src);
      saveImage({
        file: file && file.length > 0 ? file : undefined,
        src: normalizedSrc || undefined,
        altText: altText.trim() || undefined,
        title: title.trim() || undefined,
      });
      setSrc("");
      setAltText("");
      setTitle("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not insert image");
    } finally {
      setBusy(false);
    }
  }

  function pickPhoto(photo: PhotoMeta) {
    setSrc(`media:${photo.id}`);
    if (!altText.trim() && photo.caption) setAltText(photo.caption);
    setFile(null);
  }

  void rootEl; // available if we portal later

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 p-3 backdrop-blur-[1px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Insert image"
      onClick={() => {
        if (!busy) closeImageDialog();
      }}
    >
      <form
        className="flex max-h-[min(90dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-sand-200 bg-[#fffcf8] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <div className="flex items-center justify-between gap-3 border-b border-sand-200/80 px-4 py-3">
          <h2 className="font-serif text-lg text-ink">Insert image</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => closeImageDialog()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-100 text-lg leading-none text-ink-muted hover:bg-sand-200"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {uploadHandler ? (
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-ink-soft">
                Upload from device
              </span>
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => setFile(e.target.files)}
                className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
              <span className="mt-1 block text-[11px] text-ink-muted">
                Saves into Media; markdown becomes {"![…](media:<id>)"}
              </span>
            </label>
          ) : (
            <p className="rounded-xl border border-dashed border-sand-300 px-3 py-3 text-xs text-ink-muted">
              Save the article once to enable uploads from this dialog.
            </p>
          )}

          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">
              Or paste media ID / URL
            </span>
            <input
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              list="article-media-suggestions"
              disabled={busy}
              placeholder="media:… or UUID, or /media/…"
              className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 font-mono text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
            />
            <datalist id="article-media-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          {stills.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-soft">
                From this article’s album
              </p>
              <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {stills.slice(0, 20).map((photo) => {
                  const selected =
                    normalizeArticleImageSrc(src) === `media:${photo.id}`;
                  return (
                    <li key={photo.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => pickPhoto(photo)}
                        className={`relative aspect-square w-full overflow-hidden rounded-lg border-2 transition ${
                          selected
                            ? "border-sea ring-2 ring-sea/25"
                            : "border-transparent hover:border-sand-300"
                        }`}
                        title={photo.id}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoListPublicUrl(photo)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">
              Alt text
            </span>
            <input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sea/50 focus:ring-2 focus:ring-sea/15"
            />
          </label>

          {error ? (
            <p className="text-sm text-coral" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-sand-200/80 px-4 py-3">
          <button
            type="submit"
            disabled={busy || (!file?.length && !src.trim())}
            className="rounded-full bg-sea px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-soft disabled:opacity-50"
          >
            {busy ? "Working…" : "Insert"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => closeImageDialog()}
            className="rounded-full px-3 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
