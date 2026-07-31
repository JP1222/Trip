"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoardWidgetLayer } from "@/components/board/BoardWidgetLayer";
import { Pushpin } from "@/components/Pushpin";
import { useWallSwayGuard } from "@/hooks/useWallSwayGuard";
import type { WallItem, WallPhotoOrientation } from "@/lib/wall";
import type { WallObject } from "@/lib/wall-object-layout";
import { randomSway } from "@/lib/wall-sway";

function orientationFor(image: HTMLImageElement): WallPhotoOrientation {
  const ratio = image.naturalWidth / image.naturalHeight;
  if (ratio >= 1.12) return "landscape";
  if (ratio <= 0.9) return "portrait";
  return "square";
}

const decorPins = [
  { top: "8%", left: "6%", tone: "rose" as const },
  { top: "12%", left: "92%", tone: "gold" as const },
  { top: "78%", left: "90%", tone: "sage" as const },
  { top: "86%", left: "8%", tone: "blue" as const },
];

type Props = {
  items: WallItem[];
  widgets?: WallObject[];
};

export function PolaroidWall({ items, widgets = [] }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<WallItem | null>(null);
  const previewDialogRef = useRef<HTMLDialogElement>(null);
  const [photoOrientations, setPhotoOrientations] = useState<
    Record<string, WallPhotoOrientation>
  >({});
  const tripCount = items.filter((i) => i.kind === "trip").length;
  const solo = tripCount === 1 && items.length <= 3;
  /** Fresh angles each visit — not tied to item ids. */
  const [swayById, setSwayById] = useState<Record<string, number>>({});
  const itemIdsKey = items.map((i) => i.id).join("|");

  // Roll new tilts on each visit (mount) and when the pinned set changes.
  useEffect(() => {
    const next: Record<string, number> = {};
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      next[item.id] = randomSway(index, {
        solo: solo && item.kind === "trip",
      });
    }
    setSwayById(next);
    // itemIdsKey stands in for `items` so a new array ref alone won't re-roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally visit-scoped
  }, [itemIdsKey, solo]);

  const layoutKey = useMemo(
    () =>
      [
        itemIdsKey,
        Object.entries(photoOrientations)
          .map(([id, o]) => `${id}:${o}`)
          .join(","),
        Object.values(swayById).join(","),
      ].join("::"),
    [itemIdsKey, photoOrientations, swayById],
  );
  const { listRef, gutters } = useWallSwayGuard(layoutKey);

  const laidOut = useMemo(
    () =>
      items.map((item) => ({
        item,
        rotate: swayById[item.id] ?? 0,
      })),
    [items, swayById],
  );

  const dismissPreviewByPointerRef = useRef(false);

  useEffect(() => {
    const dialog = previewDialogRef.current;
    if (!dialog) return;

    if (previewPhoto && !dialog.open) dialog.showModal();
    if (!previewPhoto && dialog.open) dialog.close();
  }, [previewPhoto]);

  function rememberOrientation(itemId: string, image: HTMLImageElement) {
    const next = orientationFor(image);
    setPhotoOrientations((current) =>
      current[itemId] === next ? current : { ...current, [itemId]: next },
    );
  }

  function closePreview(fromPointer = true) {
    dismissPreviewByPointerRef.current = fromPointer;
    if (previewDialogRef.current?.open) previewDialogRef.current.close();
    setPreviewPhoto(null);
  }

  function onPreviewDialogClose() {
    setPreviewPhoto(null);
    // Native <dialog> restores focus to the opener; after a pointer dismiss that
    // leaves a sticky :focus-visible ring + Enlarge hint. Blur for mouse/touch.
    if (dismissPreviewByPointerRef.current) {
      queueMicrotask(() => {
        const el = document.activeElement;
        if (
          el instanceof HTMLElement &&
          el.matches("button.instant--standalone")
        ) {
          el.blur();
        }
      });
    }
    dismissPreviewByPointerRef.current = false;
  }

  return (
    <div className="gallery-wall gallery-wall--public">
      <div className={`cork-board${solo ? " cork-board--solo" : ""}`}>
        <div className="cork-board__surface">
          <div className="cork-board__pins" aria-hidden>
            {decorPins.map((p, i) => (
              <span
                key={i}
                className={`cork-pin cork-pin--${p.tone}`}
                style={{ top: p.top, left: p.left }}
              />
            ))}
          </div>

          {/* Washi / tape scraps — pure decoration */}
          <div className="cork-board__tape" aria-hidden>
            <span className="cork-tape cork-tape--a" />
            <span className="cork-tape cork-tape--b" />
          </div>

          <BoardWidgetLayer objects={widgets} guestbookHref="/guestbook" />

          <ul ref={listRef} className="cork-board__photos">
            {laidOut.map(({ item, rotate }, index) => {
              const active = hoverId === item.id;
              const delay = `${Math.min(index * 0.05, 0.55)}s`;
              const sway = rotate;
              const gutter = gutters[item.id] ?? 0;
              const clearance =
                item.kind === "article" ? 18 : item.kind === "note" ? 8 : 12;
              const slotPad =
                gutter > 0
                  ? ({
                      paddingLeft: gutter,
                      paddingRight: gutter,
                    } as const)
                  : undefined;

              if (item.kind === "note") {
                const noteBody = (
                  <div
                    className="wall-note"
                    data-wall-card
                    data-wall-id={item.id}
                    data-wall-sway={rotate * 0.6}
                    data-wall-clearance={clearance}
                    style={{ transform: `rotate(${sway * 0.6}deg)` }}
                  >
                    <span className="wall-note__pin" aria-hidden />
                    <p className="wall-note__title">{item.caption}</p>
                    {item.noteLines?.map((line) => (
                      <p key={line} className="wall-note__line">
                        {line}
                      </p>
                    ))}
                    {item.noteSignature && (
                      <p className="wall-note__signature">
                        {item.noteSignature}
                      </p>
                    )}
                  </div>
                );
                return (
                  <li
                    key={item.id}
                    className="animate-fade-up wall-item wall-item--note wall-note-wrap"
                    style={{ animationDelay: delay, ...slotPad }}
                  >
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="block rounded-sm outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sea"
                        aria-label={`Open article: ${item.caption}`}
                      >
                        {noteBody}
                      </Link>
                    ) : (
                      noteBody
                    )}
                  </li>
                );
              }

              if (item.kind === "empty") {
                return (
                  <li
                    key={item.id}
                    className="animate-fade-up wall-item wall-item--empty"
                    style={{ animationDelay: delay, ...slotPad }}
                  >
                    <div
                      className="instant instant--empty"
                      data-wall-card
                      data-wall-id={item.id}
                      data-wall-sway={rotate}
                      data-wall-clearance={clearance}
                      style={{ transform: `rotate(${sway}deg)` }}
                      aria-label={`${item.caption}. ${item.meta || ""}`}
                    >
                      <Pushpin />
                      <div className="instant__pad">
                        <div className="instant__image instant__image--empty">
                          <div className="instant__empty-inner">
                            <span className="instant__empty-plus" aria-hidden>
                              +
                            </span>
                            <span className="instant__empty-hint">
                              Next adventure
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="instant__foot">
                        <span className="instant__caption">{item.caption}</span>
                        {item.meta && (
                          <span className="instant__date">{item.meta}</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              }

              // Trip card or standalone wall photo.
              const line2 = item.meta || item.dateLabel;
              const frameStyle = item.frameStyle || "polaroid";
              const displaySize = item.displaySize || "md";
              const showLabels =
                item.kind !== "photo" ||
                (frameStyle !== "borderless" &&
                  !item.hideLabels &&
                  Boolean(item.caption?.trim() || line2?.trim()));
              const orientation =
                item.orientation ||
                (item.src
                  ? photoOrientations[item.id] || "landscape"
                  : item.planned
                    ? "portrait"
                    : "square");
              const printClasses = [
                `instant--${orientation}`,
                item.kind === "photo" ? `instant--frame-${frameStyle}` : "",
                item.kind === "photo" ? `instant--size-${displaySize}` : "",
                item.kind === "photo" && !showLabels ? "instant--no-labels" : "",
                item.planned ? "instant--planned" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const altText =
                item.caption?.trim() ||
                (item.kind === "photo" ? "Board photo" : "Photo");
              const inner = (
                <>
                  <Pushpin />
                  {item.planned && (
                    <span className="instant__badge">Planning</span>
                  )}
                  <div className="instant__pad">
                    <div className="instant__image">
                      {item.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.src}
                          alt={altText}
                          loading={index < 6 ? "eager" : "lazy"}
                          ref={(image) => {
                            if (
                              !item.orientation &&
                              image?.complete &&
                              image.naturalWidth > 0
                            ) {
                              rememberOrientation(item.id, image);
                            }
                          }}
                          onLoad={({ currentTarget }) => {
                            if (!item.orientation) {
                              rememberOrientation(item.id, currentTarget);
                            }
                          }}
                        />
                      ) : (
                        <div
                          className={`instant__cover${item.planned ? " instant__cover--planned" : ""}`}
                          style={
                            item.planned
                              ? item.coverGradient
                                ? { background: item.coverGradient }
                                : undefined
                              : {
                                  background:
                                    "linear-gradient(155deg, #6b5c4a 0%, #2e2820 100%)",
                                }
                          }
                        >
                          <span className="instant__cover-wash" aria-hidden />
                          {item.planned && (
                            <span className="instant__cover-art" aria-hidden>
                              <span className="instant__cover-emoji">
                                {item.coverEmoji || "✦"}
                              </span>
                              <svg
                                className="instant__cover-route"
                                viewBox="0 0 180 88"
                                fill="none"
                              >
                                <path
                                  d="M12 67C42 25 67 79 99 45C121 22 142 27 168 12"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeDasharray="4 7"
                                />
                                <circle cx="12" cy="67" r="4" fill="currentColor" />
                                <circle cx="168" cy="12" r="5" fill="currentColor" />
                                <circle cx="168" cy="12" r="2" fill="white" />
                              </svg>
                            </span>
                          )}
                          <span className="instant__cover-label">
                            {item.planned
                              ? "Up next"
                              : item.sub || "Journey"}
                          </span>
                          <span className="instant__cover-name">
                            {item.caption}
                          </span>
                        </div>
                      )}
                      {item.href && (
                        <span
                          className="instant__hint instant__hint--trip"
                          aria-hidden="true"
                        >
                          {item.kind === "article" ? "Read" : "Open trip"}{" "}
                          <span>↗</span>
                        </span>
                      )}
                      {item.kind === "photo" && (
                        <span
                          className="instant__hint instant__hint--photo"
                          aria-hidden="true"
                        >
                          Enlarge <span>⤢</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {showLabels ? (
                    <div className="instant__foot">
                      {item.caption?.trim() ? (
                        <span className="instant__caption">{item.caption}</span>
                      ) : null}
                      {line2?.trim() ? (
                        <span className="instant__date">{line2}</span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              );
              const itemTypeClass =
                item.kind === "photo"
                  ? "wall-item--photo"
                  : item.kind === "article"
                    ? "wall-item--article"
                    : item.planned
                      ? "wall-item--planned"
                      : "wall-item--trip";

              return (
                <li
                  key={item.id}
                  className={`animate-fade-up wall-item ${itemTypeClass} wall-item--${orientation}${active ? " wall-item--active" : ""}`}
                  style={{ animationDelay: delay, ...slotPad }}
                >
                  <div
                    className={`wall-stack${active ? " wall-stack--active" : ""}`}
                    data-wall-card
                    data-wall-id={item.id}
                    data-wall-sway={rotate}
                    data-wall-clearance={clearance}
                    style={{
                      transform: active
                        ? "translateY(-7px) scale(1.025)"
                        : undefined,
                    }}
                    onMouseEnter={() => setHoverId(item.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(item.id)}
                    onBlur={() => setHoverId(null)}
                  >
                    {item.href ? (
                      <Link
                        href={item.href}
                        className={`instant ${printClasses} group`}
                        style={{
                          transform: active
                            ? "rotate(0deg)"
                            : `rotate(${sway}deg)`,
                        }}
                      >
                        {inner}
                      </Link>
                    ) : item.kind === "photo" ? (
                      <button
                        type="button"
                        className={`instant instant--standalone ${printClasses}`}
                        style={{
                          transform: active
                            ? "rotate(0deg)"
                            : `rotate(${sway}deg)`,
                        }}
                        aria-label={`Enlarge ${altText}`}
                        onClick={() => setPreviewPhoto(item)}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div
                        className={`instant ${printClasses}`}
                        style={{
                          transform: active
                            ? "rotate(0deg)"
                            : `rotate(${sway}deg)`,
                        }}
                      >
                        {inner}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}

            {items.length === 0 && (
              <li className="w-full py-16 text-center">
                <p className="font-serif text-lg italic text-[#5c4a38]/80">
                  Pin a trip here when you&apos;re ready.
                </p>
              </li>
            )}
          </ul>
        </div>
      </div>

      <dialog
        ref={previewDialogRef}
        className="wall-lightbox"
        aria-labelledby="wall-lightbox-title"
        onClose={onPreviewDialogClose}
        onCancel={() => {
          // Escape — keep focus on the photo for keyboard users.
          dismissPreviewByPointerRef.current = false;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePreview(true);
        }}
      >
        {previewPhoto && (
          <figure className="wall-lightbox__frame">
            <button
              type="button"
              className="wall-lightbox__close"
              aria-label="Close enlarged photo"
              autoFocus
              onClick={() => closePreview(true)}
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="wall-lightbox__image"
              src={previewPhoto.src}
              alt={previewPhoto.caption?.trim() || "Board photo"}
            />
            {(previewPhoto.caption?.trim() || previewPhoto.meta?.trim()) && (
              <figcaption className="wall-lightbox__caption">
                <span id="wall-lightbox-title">
                  {previewPhoto.caption?.trim() || "Photo"}
                </span>
                {previewPhoto.meta?.trim() ? (
                  <small>{previewPhoto.meta}</small>
                ) : null}
              </figcaption>
            )}
          </figure>
        )}
      </dialog>
    </div>
  );
}
