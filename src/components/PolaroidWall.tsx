"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WallItem } from "@/lib/wall";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function rotateFor(id: string, solo: boolean) {
  if (solo) return -1.5;
  // Subtle tilts only — same physical size for every polaroid
  const angles = [-2.4, -1.2, -0.6, 0.5, 1.1, 2.0, -1.8, 0.9];
  return angles[hash(id) % angles.length];
}

/**
 * One short place label for the polaroid strip.
 * "USA · Alabama · Phil Campbell" → "Alabama"
 * "USA · Mother Earth Troll Garden" → skip (same as title)
 */
function shortPlace(sub?: string, title?: string) {
  if (!sub) return undefined;
  const parts = sub
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  // Drop leading country
  const withoutCountry =
    parts[0]?.toUpperCase() === "USA" || parts[0]?.toUpperCase() === "US"
      ? parts.slice(1)
      : parts;
  if (withoutCountry.length === 0) return undefined;
  // Prefer state/region (first remaining), not the full multi-part address
  let place = withoutCountry[0];
  // If only one part and it repeats the title, omit
  if (
    title &&
    place.toLowerCase() === title.toLowerCase()
  ) {
    return undefined;
  }
  return place;
}

const decorPins = [
  { top: "10%", left: "7%", tone: "rose" as const },
  { top: "14%", left: "90%", tone: "gold" as const },
  { top: "82%", left: "88%", tone: "sage" as const },
];

type Props = {
  items: WallItem[];
};

export function PolaroidWall({ items }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const solo = items.length === 1;

  const laidOut = useMemo(
    () =>
      items.map((item) => ({
        item,
        rotate: rotateFor(item.id, solo),
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

          <ul className="cork-board__photos">
            {laidOut.map(({ item, rotate }, index) => {
              const active = hoverId === item.id;
              const place = shortPlace(item.sub, item.caption);
              const line2 = [item.dateLabel, place].filter(Boolean).join(" · ");

              return (
                <li
                  key={item.id}
                  className="animate-fade-up"
                  style={{
                    animationDelay: `${Math.min(index * 0.06, 0.5)}s`,
                  }}
                >
                  <Link
                    href={item.href}
                    className="instant group"
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
                    <span className="instant__thumbtack" aria-hidden />

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
                            className="instant__cover"
                            style={{
                              background:
                                "linear-gradient(155deg, #6b5c4a 0%, #2e2820 100%)",
                            }}
                          >
                            <span className="instant__cover-wash" aria-hidden />
                            <span className="instant__cover-label">
                              {item.sub || "Journey"}
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
                      {line2 && (
                        <span className="instant__date">{line2}</span>
                      )}
                    </div>
                  </Link>
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
