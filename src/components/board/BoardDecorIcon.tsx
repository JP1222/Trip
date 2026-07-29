import type { ReactNode } from "react";
import type { BoardDecorItem } from "@/lib/board-decor";
import {
  BadgeButtonSvg,
  FilmStripSvg,
  HeartStickerSvg,
  PaperPlaneSvg,
  PostcardSvg,
  PressedLeafSvg,
  StarStickerSvg,
  TapeCrossSvg,
  TicketStubSvg,
  TravelStampSvg,
  WashiTapeSvg,
} from "./BoardTrinkets";
import { VinylRecord, type VinylVariant } from "./VinylRecord";

type Props = {
  item: BoardDecorItem;
  /** Optional sticky text override */
  text?: string;
  className?: string;
  /** Visual size of the SVG viewport wrapper */
  size?: number;
};

function vinylVariantFromId(id: string): VinylVariant {
  if (id === "vinyl-sea") return "sea";
  if (id === "vinyl-rose") return "rose";
  if (id === "vinyl-amber") return "amber";
  if (id === "vinyl-night") return "night";
  if (id === "vinyl-sleeve") return "sleeve";
  return "classic";
}

type WidgetBox = { w: number; h: number; node: ReactNode };

/** Hover motion flavor — paired with CSS in globals.css */
function motionClass(item: BoardDecorItem): string {
  const id = item.id;
  if (item.category === "pin") return "board-decor--bob";
  if (item.category === "clip") return "board-decor--wiggle";
  if (item.category === "note") return "board-decor--lift";
  if (id.startsWith("vinyl-")) return "board-decor--spin";
  if (id.startsWith("tape-")) return "board-decor--peel";
  if (id.startsWith("ticket-") || id.startsWith("postcard-"))
    return "board-decor--lift";
  if (id.startsWith("plane-")) return "board-decor--fly";
  if (id.startsWith("film-")) return "board-decor--nudge";
  if (id.startsWith("sticker-heart")) return "board-decor--pulse";
  if (id.startsWith("sticker-star") || id.startsWith("badge-"))
    return "board-decor--twirl";
  if (id.startsWith("stamp-")) return "board-decor--press";
  if (id.startsWith("leaf-")) return "board-decor--sway";
  return "board-decor--lift";
}

function widgetArt(
  item: BoardDecorItem,
  size: number,
  text?: string,
): WidgetBox | null {
  const accent = item.accent || "#8a847c";
  const label = item.vinylLabel || text || item.label;
  const id = item.id;

  if (id.startsWith("vinyl-")) {
    const sleeve = id === "vinyl-sleeve";
    return {
      w: size * 1.15,
      h: size * (sleeve ? 1.22 : 1.15),
      node: (
        <VinylRecord
          id={id}
          variant={vinylVariantFromId(id)}
          label={label}
          size={size * 1.15}
        />
      ),
    };
  }

  if (id === "tape-cross") {
    return {
      w: size * 1.05,
      h: size * 1.05,
      node: <TapeCrossSvg id={id} accent={accent} />,
    };
  }

  if (id.startsWith("tape-")) {
    return {
      w: size * 1.55,
      h: size * 0.58,
      node: (
        <WashiTapeSvg
          id={id}
          accent={accent}
          striped={id === "tape-striped"}
        />
      ),
    };
  }

  if (id.startsWith("ticket-")) {
    return {
      w: size * 1.45,
      h: size * 0.8,
      node: <TicketStubSvg id={id} accent={accent} label={label} />,
    };
  }

  if (id.startsWith("postcard-")) {
    return {
      w: size * 1.35,
      h: size * 0.98,
      node: <PostcardSvg id={id} accent={accent} label={label} />,
    };
  }

  if (id.startsWith("plane-")) {
    return {
      w: size * 1.25,
      h: size * 0.95,
      node: <PaperPlaneSvg id={id} accent={accent} />,
    };
  }

  if (id.startsWith("film-")) {
    return {
      w: size * 1.5,
      h: size * 0.75,
      node: <FilmStripSvg id={id} accent={accent} />,
    };
  }

  if (id.startsWith("sticker-heart")) {
    return {
      w: size,
      h: size,
      node: <HeartStickerSvg id={id} accent={accent} />,
    };
  }

  if (id.startsWith("sticker-star")) {
    return {
      w: size,
      h: size,
      node: <StarStickerSvg id={id} accent={accent} />,
    };
  }

  if (id.startsWith("stamp-")) {
    return {
      w: size * 1.05,
      h: size * 1.05,
      node: <TravelStampSvg id={id} accent={accent} label={label} />,
    };
  }

  if (id.startsWith("leaf-")) {
    return {
      w: size * 0.95,
      h: size * 1.15,
      node: <PressedLeafSvg id={id} accent={accent} />,
    };
  }

  if (id.startsWith("badge-")) {
    return {
      w: size,
      h: size,
      node: <BadgeButtonSvg id={id} accent={accent} label={label} />,
    };
  }

  return null;
}

/**
 * Renders one catalog decoration as inline SVG
 * (pins, clips, sticky notes, vinyl + felt-wall trinkets).
 */
export function BoardDecorIcon({
  item,
  text,
  className = "",
  size = 56,
}: Props) {
  const accent = item.accent || "#8a847c";
  const motion = motionClass(item);

  if (item.category === "pin") {
    return (
      <span
        className={`board-decor board-decor--pin ${motion} ${className}`}
        style={{ width: size, height: size * 1.3 }}
        aria-hidden
      >
        <PinSvg id={item.id} accent={accent} />
      </span>
    );
  }

  if (item.category === "clip") {
    const wood = item.id.startsWith("clip-wood");
    return (
      <span
        className={`board-decor board-decor--clip ${motion} ${className}`}
        style={{ width: size * 0.95, height: size * 1.15 }}
        aria-hidden
      >
        {wood ? (
          <ClothespinSvg wood={accent} dark={item.id.includes("walnut")} />
        ) : (
          <BinderClipSvg accent={accent} />
        )}
      </span>
    );
  }

  if (item.category === "widget") {
    const art = widgetArt(item, size, text);
    if (art) {
      return (
        <span
          className={`board-decor board-decor--widget ${motion} ${className}`}
          style={{ width: art.w, height: art.h }}
          aria-hidden
        >
          {art.node}
        </span>
      );
    }
  }

  const body = text ?? item.defaultText ?? "";
  return (
    <span
      className={`board-decor board-decor--note ${motion} ${className}`}
      style={{ width: size * 1.15, height: size * 1.15 }}
      aria-hidden
    >
      <StickyNoteSvg
        id={item.id}
        accent={accent}
        text={body}
        lined={item.id === "note-cream"}
      />
    </span>
  );
}

function PinSvg({ id, accent }: { id: string; accent: string }) {
  const needle = "#4a453e";
  const needleHi = "#6a635c";
  const rim = shade(accent, -0.28);
  const mid = accent;
  const hi = shade(accent, 0.28);
  const speck = shade(accent, 0.45);
  const gradId = `pin-head-${id}`;

  return (
    <svg viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        <radialGradient id={gradId} cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor={speck} />
          <stop offset="45%" stopColor={mid} />
          <stop offset="100%" stopColor={rim} />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="48.5" rx="5.5" ry="1.6" fill="#2c2418" opacity="0.18" />
      <rect x="18.2" y="24" width="3.6" height="24" rx="1.2" fill={needle} />
      <rect x="18.5" y="24" width="1.4" height="20" rx="0.5" fill={needleHi} />
      <circle cx="20" cy="18" r="12.2" fill={rim} />
      <circle cx="20" cy="17.2" r="11.2" fill={`url(#${gradId})`} />
      <ellipse cx="15.2" cy="12.8" rx="5.2" ry="3.6" fill={hi} opacity="0.9" />
      <ellipse cx="13.8" cy="11.6" rx="2.4" ry="1.6" fill={speck} />
    </svg>
  );
}

function BinderClipSvg({ accent }: { accent: string }) {
  const metal = accent;
  const dark = shade(accent, -0.35);
  const light = shade(accent, 0.25);
  const wire = shade(accent, -0.15);

  return (
    <svg viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <ellipse cx="24" cy="52" rx="10" ry="2.2" fill="#2c2418" opacity="0.14" />
      <path d="M10 22 V48 Q10 52 14 52 H18 V22 Z" fill={dark} />
      <path d="M30 22 V52 H34 Q38 52 38 48 V22 Z" fill={dark} />
      <path d="M11.5 23 V47.5 Q11.5 50 14.5 50 H17 V23 Z" fill={light} opacity="0.35" />
      <rect x="8" y="10" width="32" height="16" rx="3" fill={metal} />
      <rect x="8" y="10" width="32" height="6" rx="3" fill={light} opacity="0.45" />
      <rect x="10" y="22" width="28" height="3" fill={dark} opacity="0.5" />
      <path
        d="M16 14 C16 8 20 6 24 6 C28 6 32 8 32 14"
        fill="none"
        stroke={wire}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M18 14 C18 10 21 8.5 24 8.5 C27 8.5 30 10 30 14"
        fill="none"
        stroke={light}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.7"
      />
      <rect x="18" y="14" width="12" height="5" rx="1.5" fill={dark} opacity="0.35" />
    </svg>
  );
}

function ClothespinSvg({ wood, dark }: { wood: string; dark?: boolean }) {
  const light = shade(wood, dark ? 0.12 : 0.2);
  const deep = shade(wood, dark ? -0.22 : -0.18);
  const spring = "#8a847c";
  const springHi = "#c4bfb6";

  return (
    <svg viewBox="0 0 40 56" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <ellipse cx="20" cy="53" rx="7" ry="1.8" fill="#2c2418" opacity="0.14" />
      <path d="M8 6 L16 6 L18 30 L14 50 L9 50 L11 30 Z" fill={wood} />
      <path
        d="M9.5 8 L15 8 L16.5 28 L13.2 48 L10.5 48 L12 28 Z"
        fill={light}
        opacity="0.45"
      />
      <path d="M24 6 L32 6 L29 30 L31 50 L26 50 L22 30 Z" fill={deep} />
      <path
        d="M25 8 L30.5 8 L28 28 L29.5 48 L27 48 L23.5 28 Z"
        fill={light}
        opacity="0.25"
      />
      <ellipse cx="20" cy="22" rx="9" ry="5.5" fill={spring} />
      <ellipse cx="20" cy="21" rx="7.5" ry="4" fill={springHi} opacity="0.35" />
      <path
        d="M13 22 Q20 17 27 22"
        fill="none"
        stroke={springHi}
        strokeWidth="1.2"
        opacity="0.7"
      />
      <path d="M12 14 L14 40" stroke={deep} strokeWidth="0.6" opacity="0.25" />
      <path d="M26 14 L28 40" stroke={shade(wood, -0.3)} strokeWidth="0.6" opacity="0.2" />
    </svg>
  );
}

function StickyNoteSvg({
  id,
  accent,
  text,
  lined,
}: {
  id: string;
  accent: string;
  text: string;
  lined?: boolean;
}) {
  const edge = shade(accent, -0.12);
  const curl = shade(accent, -0.2);
  const gradId = `note-grad-${id}`;
  const filterId = `note-soft-${id}`;

  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={shade(accent, 0.08)} />
          <stop offset="100%" stopColor={edge} />
        </linearGradient>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0.5" dy="1.5" stdDeviation="1.2" floodColor="#2c2418" floodOpacity="0.18" />
        </filter>
      </defs>
      <path
        d="M6 4 H54 Q58 4 58 8 V50 L50 58 H6 Q4 58 4 54 V8 Q4 4 6 4 Z"
        fill={`url(#${gradId})`}
        filter={`url(#${filterId})`}
      />
      <path d="M50 58 V50 H58 Z" fill={curl} />
      <path d="M50 50 L58 50 L50 58 Z" fill={shade(accent, 0.15)} opacity="0.5" />
      <rect x="8" y="6" width="46" height="5" rx="1" fill={shade(accent, 0.2)} opacity="0.55" />
      {lined &&
        [22, 30, 38, 46].map((y) => (
          <line
            key={y}
            x1="12"
            y1={y}
            x2="50"
            y2={y}
            stroke="#b8a99a"
            strokeWidth="0.7"
            opacity="0.45"
          />
        ))}
      <text
        x="32"
        y={lined ? 28 : 34}
        textAnchor="middle"
        fill="#4a3c28"
        fontSize="9"
        fontFamily="var(--font-hand), 'Segoe Print', cursive"
        opacity="0.85"
      >
        {truncate(text, 12)}
      </text>
    </svg>
  );
}

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function shade(hex: string, t: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const mix = (c: number) => {
    if (t >= 0) return Math.round(c + (255 - c) * t);
    return Math.round(c * (1 + t));
  };
  const to = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}
