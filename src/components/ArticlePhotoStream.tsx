"use client";

import { useEffect, useMemo, useState } from "react";
import type { ArticleImage } from "@/lib/article-media";

type Props = {
  images: ArticleImage[];
};

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

/** Trip-style waterfall for article photos without a special inline position. */
export function ArticlePhotoStream({ images }: Props) {
  const columnCount = useGalleryColumns();
  const columns = useMemo(
    () => splitIntoColumns(images, columnCount),
    [images, columnCount],
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveIndex(null);
      if (e.key === "ArrowRight") {
        setActiveIndex((i) =>
          i === null ? i : Math.min(images.length - 1, i + 1),
        );
      }
      if (e.key === "ArrowLeft") {
        setActiveIndex((i) => (i === null ? i : Math.max(0, i - 1)));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeIndex, images.length]);

  if (images.length === 0) return null;

  const active = activeIndex !== null ? images[activeIndex] : null;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-serif text-2xl text-ink sm:text-3xl">Photos</h2>
        <p className="text-sm text-ink-muted">
          {images.length} {images.length === 1 ? "photo" : "photos"}
        </p>
      </div>

      <div className="photo-grid-xhs">
        {columns.map((col, colIndex) => (
          <div key={colIndex} className="photo-grid-xhs__col">
            {col.map((image) => {
              const index = images.indexOf(image);
              return (
                <button
                  key={`${image.src}-${index}`}
                  type="button"
                  className="group relative block w-full overflow-hidden rounded-xl bg-sand-100 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Open photo ${index + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.src}
                    alt={image.alt || ""}
                    className="block w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    loading={index < 6 ? "eager" : "lazy"}
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {active ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/92 p-3 sm:p-8"
          role="dialog"
          aria-modal
          aria-label="Photo viewer"
          onClick={() => setActiveIndex(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
            aria-label="Close"
            onClick={() => setActiveIndex(null)}
          >
            ×
          </button>
          {activeIndex !== null && activeIndex > 0 ? (
            <button
              type="button"
              className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex(activeIndex - 1);
              }}
            >
              ‹
            </button>
          ) : null}
          {activeIndex !== null && activeIndex < images.length - 1 ? (
            <button
              type="button"
              className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex(activeIndex + 1);
              }}
            >
              ›
            </button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.src}
            alt={active.alt || ""}
            className="max-h-[min(92dvh,1200px)] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}
