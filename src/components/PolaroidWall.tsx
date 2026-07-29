"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pushpin } from "@/components/Pushpin";
import type { WallItem } from "@/lib/wall";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (s.charCodeAt(i) + ((h << 5) - h)) | 0;
  return Math.abs(h);
}

function rotateFor(id: string, solo: boolean) {
  if (solo) return -1.5;
  const angles = [-2.4, -1.2, -0.6, 0.5, 1.1, 2.0, -1.8, 0.9, -1.5, 1.6];
  return angles[hash(id) % angles.length];
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

  return (
    <div className="gallery-wall">
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
                    className="animate-fade-up wall-note-wrap"
                    style={{
                      animationDelay: delay,
                      transform: `rotate(${rotate * 0.6}deg)`,
                    }}
                  >
                    <div className="wall-note">
                      <span className="wall-note__pin" aria-hidden />
                      <p className="wall-note__title">{item.caption}</p>
                      {item.noteLines?.map((line) => (
                        <p key={line} className="wall-note__line">
                          {line}
                        </p>
                      ))}
                    </div>
                  </li>
                );
              }

              if (item.kind === "empty") {
                return (
                  <li
                    key={item.id}
                    className="animate-fade-up"
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

              // trip (lived or planned)
              const line2 = item.meta || item.dateLabel;
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
                        />
                      ) : (
                        <div
                          className={`instant__cover${item.planned ? " instant__cover--planned" : ""}`}
                          style={
                            item.planned
                              ? undefined
                              : {
                                  background:
                                    "linear-gradient(155deg, #6b5c4a 0%, #2e2820 100%)",
                                }
                          }
                        >
                          <span className="instant__cover-wash" aria-hidden />
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
                    </div>
                  </div>
                  <div className="instant__foot">
                    <span className="instant__caption">{item.caption}</span>
                    {line2 && <span className="instant__date">{line2}</span>}
                  </div>
                </>
              );

              return (
                <li
                  key={item.id}
                  className="animate-fade-up"
                  style={{ animationDelay: delay }}
                >
                  {item.href ? (
                    <Link
                      href={item.href}
                      className={`instant group${item.planned ? " instant--planned" : ""}`}
                      style={{
                        transform: active
                          ? "rotate(0deg) translateY(-6px) scale(1.04)"
                          : `rotate(${rotate}deg)`,
                      }}
                      onMouseEnter={() => setHoverId(item.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => setHoverId(item.id)}
                      onBlur={() => setHoverId(null)}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      className={`instant${item.planned ? " instant--planned" : ""}`}
                      style={{ transform: `rotate(${rotate}deg)` }}
                    >
                      {inner}
                    </div>
                  )}
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
    </div>
  );
}
