"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pushpin } from "@/components/Pushpin";
import type { WallItem, WallPhotoOrientation } from "@/lib/wall";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (s.charCodeAt(i) + ((h << 5) - h)) | 0;
  return Math.abs(h);
}

function rotateFor(id: string, solo: boolean) {
  if (solo) return -1;
  const angles = [-3.2, 2.4, -1.7, 3.6, -2.6, 1.4, -0.9, 2.9];
  return angles[hash(id) % angles.length];
}

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
};

export function PolaroidWall({ items }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<WallItem | null>(null);
  const previewDialogRef = useRef<HTMLDialogElement>(null);
  const [photoOrientations, setPhotoOrientations] = useState<
    Record<string, WallPhotoOrientation>
  >({});
  const tripCount = items.filter((i) => i.kind === "trip").length;
  const solo = tripCount === 1 && items.length <= 3;

  const laidOut = useMemo(
    () =>
      items.map((item) => ({
        item,
        rotate: rotateFor(item.id, solo && item.kind === "trip"),
      })),
    [items, solo],
  );

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

  function closePreview() {
    if (previewDialogRef.current?.open) previewDialogRef.current.close();
    setPreviewPhoto(null);
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

          <ul className="cork-board__photos">
            {laidOut.map(({ item, rotate }, index) => {
              const active = hoverId === item.id;
              const delay = `${Math.min(index * 0.05, 0.55)}s`;

              if (item.kind === "note") {
                return (
                  <li
                    key={item.id}
                    className="animate-fade-up wall-item wall-item--note wall-note-wrap"
                    style={{ animationDelay: delay }}
                  >
                    <div
                      className="wall-note"
                      style={{ transform: `rotate(${rotate * 0.6}deg)` }}
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
                  </li>
                );
              }

              if (item.kind === "empty") {
                return (
                  <li
                    key={item.id}
                    className="animate-fade-up wall-item wall-item--empty"
                    style={{ animationDelay: delay }}
                  >
                    <div
                      className="instant instant--empty"
                      style={{ transform: `rotate(${rotate}deg)` }}
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
              const orientation =
                item.orientation ||
                (item.src
                  ? photoOrientations[item.id] || "landscape"
                  : item.planned
                    ? "portrait"
                    : "square");
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
                          alt={item.caption}
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
                          Open trip <span>↗</span>
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
                  <div className="instant__foot">
                    <span className="instant__caption">{item.caption}</span>
                    {line2 && <span className="instant__date">{line2}</span>}
                  </div>
                </>
              );
              const itemTypeClass =
                item.kind === "photo"
                  ? "wall-item--photo"
                  : item.planned
                    ? "wall-item--planned"
                    : "wall-item--trip";

              return (
                <li
                  key={item.id}
                  className={`animate-fade-up wall-item ${itemTypeClass} wall-item--${orientation}${active ? " wall-item--active" : ""}`}
                  style={{ animationDelay: delay }}
                >
                  <div
                    className={`wall-stack${active ? " wall-stack--active" : ""}`}
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
                        className={`instant instant--${orientation} group${item.planned ? " instant--planned" : ""}`}
                        style={{
                          transform: active
                            ? "rotate(0deg)"
                            : `rotate(${rotate}deg)`,
                        }}
                      >
                        {inner}
                      </Link>
                    ) : item.kind === "photo" ? (
                      <button
                        type="button"
                        className={`instant instant--standalone instant--${orientation}`}
                        style={{
                          transform: active
                            ? "rotate(0deg)"
                            : `rotate(${rotate}deg)`,
                        }}
                        aria-label={`Enlarge ${item.caption}`}
                        onClick={() => setPreviewPhoto(item)}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div
                        className={`instant instant--${orientation}${item.planned ? " instant--planned" : ""}`}
                        style={{
                          transform: active
                            ? "rotate(0deg)"
                            : `rotate(${rotate}deg)`,
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
        onClose={() => setPreviewPhoto(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePreview();
        }}
      >
        {previewPhoto && (
          <figure className="wall-lightbox__frame">
            <button
              type="button"
              className="wall-lightbox__close"
              aria-label="Close enlarged photo"
              autoFocus
              onClick={closePreview}
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="wall-lightbox__image"
              src={previewPhoto.src}
              alt={previewPhoto.caption}
            />
            <figcaption className="wall-lightbox__caption">
              <span id="wall-lightbox-title">{previewPhoto.caption}</span>
              {previewPhoto.meta && <small>{previewPhoto.meta}</small>}
            </figcaption>
          </figure>
        )}
      </dialog>
    </div>
  );
}
