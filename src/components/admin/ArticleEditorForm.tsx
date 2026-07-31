"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import {
  AdminChromeActions,
  adminChromeClusterClass,
  adminChromePillClass,
} from "@/components/admin/AdminChrome";
import { AdminPhotos } from "@/components/admin/AdminPhotos";
import {
  AdminAutosaveStatus,
  type AutosavePhase,
} from "@/components/admin/AdminSaveButton";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import { ArticleEditorMediaProvider } from "@/components/admin/article-editor-media-context";
import { normalizeBodyMediaRefs } from "@/lib/article-media";
import type {
  Article,
  ArticleStatus,
  ArticleWallStyle,
  PhotoMeta,
} from "@/lib/types";

const AUTOSAVE_MS = 1200;
const SAVING_HINT_MS = 450;

const InitializedMDXEditor = dynamic(
  () => import("@/components/admin/InitializedMDXEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[28rem] items-center justify-center text-sm text-ink-muted">
        Loading editor…
      </div>
    ),
  },
);

type Props = {
  article?: Article;
  photos?: PhotoMeta[];
};

const WALL_OPTIONS: { value: ArticleWallStyle; label: string }[] = [
  { value: "none", label: "Hidden" },
  { value: "polaroid", label: "Polaroid" },
  { value: "note", label: "Note" },
];

const VISIBILITY_OPTIONS = [
  { value: "draft" as const, label: "Private" },
  { value: "published" as const, label: "Public" },
];

const EMPTY_PHOTOS: PhotoMeta[] = [];

export function ArticleEditorForm({
  article,
  photos,
}: Props) {
  const router = useRouter();
  const editorRef = useRef<MDXEditorMethods>(null);
  const isNew = !article;
  const photoList = photos ?? EMPTY_PHOTOS;
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [bodyMd, setBodyMd] = useState(article?.bodyMd ?? "");
  const [coverImage, setCoverImage] = useState(article?.coverImage ?? "");
  const [wallStyle, setWallStyle] = useState<ArticleWallStyle>(
    article?.wallStyle ?? "polaroid",
  );
  const [status, setStatus] = useState<ArticleStatus>(
    article?.status ?? "draft",
  );
  const [libraryPhotos, setLibraryPhotos] = useState(photoList);
  const [phase, setPhase] = useState<AutosavePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const ready = useRef(false);
  const lastSaved = useRef("");
  const inFlight = useRef(false);
  const serializedRef = useRef("");
  const creating = useRef(false);

  useEffect(() => {
    if (!photos) return;
    setLibraryPhotos(photos);
  }, [photos]);

  const mergePhoto = useCallback((photo: PhotoMeta) => {
    setLibraryPhotos((prev) => {
      if (prev.some((p) => p.id === photo.id)) {
        return prev.map((p) => (p.id === photo.id ? photo : p));
      }
      return [photo, ...prev];
    });
  }, []);

  const payload = useMemo(() => {
    const latestBody = normalizeBodyMediaRefs(
      editorRef.current?.getMarkdown() ?? bodyMd,
    );
    return {
      title,
      slug: slug.trim() || undefined,
      excerpt,
      bodyMd: latestBody,
      coverImage: coverImage.trim() || null,
      wallStyle,
      status,
    };
  }, [title, slug, excerpt, bodyMd, coverImage, wallStyle, status]);

  const serialized = useMemo(() => JSON.stringify(payload), [payload]);
  serializedRef.current = serialized;

  async function persist() {
    if (inFlight.current || creating.current) return;
    if (!title.trim()) return;

    const body = serializedRef.current;
    if (!isNew && body === lastSaved.current) return;

    inFlight.current = true;
    setError(null);
    const hintTimer = window.setTimeout(() => setPhase("saving"), SAVING_HINT_MS);

    const parsed = JSON.parse(body) as typeof payload;
    // Prefer live editor markdown at request time
    parsed.bodyMd = normalizeBodyMediaRefs(
      editorRef.current?.getMarkdown() ?? parsed.bodyMd,
    );

    try {
      if (isNew) {
        creating.current = true;
        const res = await fetch("/api/admin/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const data = (await res.json()) as Article & { error?: string };
        if (!res.ok) throw new Error(data.error || "Save failed");
        router.replace(`/admin/articles/${data.id}`);
        router.refresh();
        return;
      }

      const res = await fetch(`/api/admin/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = (await res.json()) as Article & { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStatus(data.status);
      setWallStyle(data.wallStyle);
      setSlug(data.slug);
      lastSaved.current = body;
      if (serializedRef.current === body) {
        setPhase("saved");
        window.setTimeout(() => {
          setPhase((p) => (p === "saved" ? "idle" : p));
        }, 1600);
      } else {
        setPhase("idle");
      }
      router.refresh();
    } catch (err) {
      creating.current = false;
      setPhase("error");
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      window.clearTimeout(hintTimer);
      inFlight.current = false;
      queueMicrotask(() => {
        if (!isNew && serializedRef.current !== lastSaved.current) {
          void persist();
        }
      });
    }
  }

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      lastSaved.current = serialized;
      return;
    }
    if (!title.trim()) return;
    if (!isNew && serialized === lastSaved.current) return;

    const timer = window.setTimeout(() => {
      void persist();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, title, isNew]);

  async function remove() {
    if (!article) return;
    if (!window.confirm("Delete this article permanently?")) return;
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch(`/api/admin/articles/${article.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const publicHref =
    status === "published" && slug.trim() ? `/blog/${slug.trim()}` : null;

  const wallHint =
    wallStyle === "polaroid"
      ? "Wall polaroid uses Media cover"
      : wallStyle === "note"
        ? "Sticky note uses title + excerpt"
        : "Not pinned to the cork wall";

  return (
    <>
      <AdminChromeActions>
        <AdminSegmentedControl
          ariaLabel="Visibility"
          value={status}
          options={VISIBILITY_OPTIONS}
          disabled={!title.trim()}
          onChange={setStatus}
        />
        {publicHref ? (
          <Link
            href={publicHref}
            target="_blank"
            className={adminChromePillClass}
          >
            View
          </Link>
        ) : null}
        {!isNew ? (
          <div className={adminChromeClusterClass}>
            <button
              type="button"
              onClick={() => void remove()}
              className="rounded-full px-3 py-1.5 text-[13px] text-coral/80 transition hover:bg-white/70 hover:text-coral"
            >
              Delete
            </button>
          </div>
        ) : null}
      </AdminChromeActions>
      <AdminAutosaveStatus phase={phase} />

      <div className="pb-24">
        <div className="mx-auto max-w-3xl">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Title"
            className="w-full border-0 bg-transparent font-serif text-3xl leading-tight text-ink outline-none placeholder:text-ink-muted/40 sm:text-4xl"
          />
          <div className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
            <span className="shrink-0">/blog/</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-from-title"
              className="min-w-0 flex-1 border-0 bg-transparent font-mono text-sm text-ink-soft outline-none placeholder:text-ink-muted/50"
            />
          </div>

          <div className="mt-5 space-y-3 border-b border-sand-200/70 pb-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                Wall
              </span>
              <div className="flex rounded-md border border-sand-200 bg-white p-0.5">
                {WALL_OPTIONS.map((option) => {
                  const selected = wallStyle === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setWallStyle(option.value)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                        selected
                          ? "bg-ink text-white"
                          : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-ink-muted">{wallHint}</span>
            </div>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Excerpt — lists / sticky notes"
              className="w-full resize-y rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm leading-relaxed text-ink outline-none transition placeholder:text-ink-muted/50 focus:border-sea/40 focus:ring-1 focus:ring-sea/15"
            />
          </div>

          {error ? (
            <p className="mt-3 text-sm text-coral" role="alert">
              {error}
            </p>
          ) : null}

          <ArticleEditorMediaProvider
            value={{
              articleId: article?.id,
              photos: libraryPhotos,
              onPhotoUploaded: mergePhoto,
            }}
          >
            <div className="mt-6 overflow-hidden rounded-2xl border border-sand-200/90 bg-white shadow-[0_1px_0_rgba(28,26,23,0.04)]">
              <InitializedMDXEditor
                ref={editorRef}
                markdown={bodyMd}
                onChange={(next) => setBodyMd(normalizeBodyMediaRefs(next))}
                placeholder="Write the piece… Use the image button or ![alt](media:uuid)"
              />
            </div>
          </ArticleEditorMediaProvider>
        </div>

        <div className="mx-auto mt-14 max-w-6xl border-t border-sand-200/80 pt-10">
          {!isNew && article ? (
            <AdminPhotos
              ownerKind="article"
              ownerId={article.id}
              title={title.trim() || article.title}
              photos={libraryPhotos}
              coverImage={coverImage}
              onCoverChange={setCoverImage}
              onPhotoUploaded={mergePhoto}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-sand-300 px-4 py-8 text-center text-sm text-ink-muted">
              Add a title — it autosaves, then Media unlocks (upload, cover,
              Highlights).
            </p>
          )}
        </div>
      </div>
    </>
  );
}
