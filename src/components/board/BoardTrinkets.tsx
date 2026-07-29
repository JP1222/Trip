/**
 * Felt / cork photo-wall trinkets — pure SVG, soft 2.5D.
 * Used by BoardDecorIcon for non-vinyl widgets.
 */

type SvgProps = {
  id: string;
  accent: string;
  label?: string;
};

/** Simple mix toward white (t>0) or black (t<0). */
export function shade(hex: string, t: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const mix = (c: number) => {
    if (t >= 0) return Math.round(c + (255 - c) * t);
    return Math.round(c * (1 + t));
  };
  const to = (n: number) =>
    Math.max(0, Math.min(255, mix(n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function softFilter(uid: string) {
  return (
    <filter id={`t-soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow
        dx="0.6"
        dy="1.8"
        stdDeviation="1.3"
        floodColor="#2c2418"
        floodOpacity="0.22"
      />
    </filter>
  );
}

/** Semi-transparent washi tape strip */
export function WashiTapeSvg({
  id,
  accent,
  striped,
}: SvgProps & { striped?: boolean }) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const edge = shade(accent, -0.12);
  const hi = shade(accent, 0.18);

  return (
    <svg viewBox="0 0 96 36" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        {softFilter(uid)}
        <linearGradient id={`tape-body-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hi} stopOpacity="0.92" />
          <stop offset="50%" stopColor={accent} stopOpacity="0.88" />
          <stop offset="100%" stopColor={edge} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <ellipse cx="48" cy="32" rx="38" ry="2.2" fill="#2c2418" opacity="0.1" />
      {/* ragged left edge */}
      <path
        d="M6 6
           C8 4 10 8 12 6
           C14 4 16 8 18 6
           H78
           C80 4 82 8 84 6
           C86 4 88 8 90 6
           V28
           C88 30 86 26 84 28
           C82 30 80 26 78 28
           H18
           C16 30 14 26 12 28
           C10 30 8 26 6 28
           Z"
        fill={`url(#tape-body-${uid})`}
        filter={`url(#t-soft-${uid})`}
      />
      {/* fiber sheen */}
      <path
        d="M14 10 H82"
        stroke={hi}
        strokeWidth="0.8"
        opacity="0.35"
        strokeLinecap="round"
      />
      <path
        d="M16 24 H80"
        stroke={edge}
        strokeWidth="0.6"
        opacity="0.25"
        strokeLinecap="round"
      />
      {striped &&
        [22, 34, 46, 58, 70].map((x) => (
          <line
            key={x}
            x1={x}
            y1="8"
            x2={x + 4}
            y2="26"
            stroke={shade(accent, -0.22)}
            strokeWidth="3.2"
            opacity="0.18"
            strokeLinecap="round"
          />
        ))}
    </svg>
  );
}

/** Movie / admit-one ticket stub */
export function TicketStubSvg({ id, accent, label }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const paper = shade(accent, 0.55);
  const ink = shade(accent, -0.45);
  const short = (label || "ADMIT").slice(0, 10);

  return (
    <svg viewBox="0 0 88 48" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        {softFilter(uid)}
        <linearGradient id={`tix-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={shade(paper, 0.08)} />
          <stop offset="100%" stopColor={paper} />
        </linearGradient>
      </defs>
      <ellipse cx="44" cy="44" rx="28" ry="2.4" fill="#2c2418" opacity="0.12" />
      {/* perforated stub shape */}
      <path
        d="M6 8
           H54
           A4 4 0 0 1 54 16
           A4 4 0 0 1 54 24
           A4 4 0 0 1 54 32
           A4 4 0 0 1 54 40
           H6
           Q4 40 4 38 V10 Q4 8 6 8 Z"
        fill={`url(#tix-${uid})`}
        stroke={shade(accent, -0.15)}
        strokeWidth="0.8"
        filter={`url(#t-soft-${uid})`}
      />
      <path
        d="M58 8 H82 Q84 8 84 10 V38 Q84 40 82 40 H58
           A4 4 0 0 0 58 32
           A4 4 0 0 0 58 24
           A4 4 0 0 0 58 16
           A4 4 0 0 0 58 8 Z"
        fill={accent}
        opacity="0.92"
        filter={`url(#t-soft-${uid})`}
      />
      <text
        x="30"
        y="20"
        textAnchor="middle"
        fill={ink}
        fontSize="6.5"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontWeight="700"
        letterSpacing="0.8"
      >
        {short.toUpperCase()}
      </text>
      <text
        x="30"
        y="30"
        textAnchor="middle"
        fill={shade(ink, 0.25)}
        fontSize="5"
        fontFamily="var(--font-hand), cursive"
      >
        keep forever
      </text>
      <line
        x1="12"
        y1="34"
        x2="48"
        y2="34"
        stroke={shade(accent, -0.2)}
        strokeWidth="0.6"
        strokeDasharray="1.5 1.2"
        opacity="0.5"
      />
      <text
        x="71"
        y="26"
        textAnchor="middle"
        fill="#fffef9"
        fontSize="7"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontWeight="700"
        transform="rotate(90 71 26)"
      >
        ★
      </text>
    </svg>
  );
}

/** Soft enamel heart pin-sticker */
export function HeartStickerSvg({ id, accent }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const deep = shade(accent, -0.22);
  const hi = shade(accent, 0.32);

  return (
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        {softFilter(uid)}
        <radialGradient id={`heart-${uid}`} cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor={hi} />
          <stop offset="55%" stopColor={accent} />
          <stop offset="100%" stopColor={deep} />
        </radialGradient>
      </defs>
      <ellipse cx="24" cy="42" rx="12" ry="2.2" fill="#2c2418" opacity="0.14" />
      <path
        d="M24 40
           C12 30 6 22 6 15
           C6 9 10.5 6 15.5 6
           C19 6 21.5 7.5 24 11
           C26.5 7.5 29 6 32.5 6
           C37.5 6 42 9 42 15
           C42 22 36 30 24 40 Z"
        fill={`url(#heart-${uid})`}
        filter={`url(#t-soft-${uid})`}
      />
      <ellipse cx="16" cy="14" rx="5" ry="3" fill={hi} opacity="0.55" />
      <ellipse cx="14.5" cy="12.5" rx="2" ry="1.2" fill="#fff" opacity="0.45" />
    </svg>
  );
}

/** Gold / enamel star sticker */
export function StarStickerSvg({ id, accent }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const deep = shade(accent, -0.25);
  const hi = shade(accent, 0.35);

  return (
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        {softFilter(uid)}
        <radialGradient id={`star-${uid}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={hi} />
          <stop offset="70%" stopColor={accent} />
          <stop offset="100%" stopColor={deep} />
        </radialGradient>
      </defs>
      <ellipse cx="24" cy="42" rx="11" ry="2" fill="#2c2418" opacity="0.12" />
      <path
        d="M24 6 L28.5 17.5 L40.5 18.5 L31.5 26.5 L34.5 38.5 L24 32 L13.5 38.5 L16.5 26.5 L7.5 18.5 L19.5 17.5 Z"
        fill={`url(#star-${uid})`}
        filter={`url(#t-soft-${uid})`}
      />
      <path
        d="M24 12 L26.2 18 L24 16.5 L21.8 18 Z"
        fill={hi}
        opacity="0.7"
      />
    </svg>
  );
}

/** Round travel passport stamp */
export function TravelStampSvg({ id, accent, label }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const ink = accent;
  const short = (label || "VISITED").slice(0, 9).toUpperCase();

  return (
    <svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>{softFilter(uid)}</defs>
      <ellipse cx="28" cy="50" rx="14" ry="2.2" fill="#2c2418" opacity="0.1" />
      <g filter={`url(#t-soft-${uid})`} opacity="0.9" transform="rotate(-12 28 28)">
        <circle
          cx="28"
          cy="28"
          r="22"
          fill="none"
          stroke={ink}
          strokeWidth="2.2"
        />
        <circle
          cx="28"
          cy="28"
          r="18"
          fill="none"
          stroke={ink}
          strokeWidth="1"
          strokeDasharray="2.5 1.8"
        />
        <text
          x="28"
          y="26"
          textAnchor="middle"
          fill={ink}
          fontSize="6"
          fontFamily="var(--font-sans), system-ui, sans-serif"
          fontWeight="700"
          letterSpacing="1.2"
        >
          {short}
        </text>
        <text
          x="28"
          y="35"
          textAnchor="middle"
          fill={ink}
          fontSize="5"
          fontFamily="var(--font-hand), cursive"
          opacity="0.85"
        >
          ★ trip ★
        </text>
      </g>
    </svg>
  );
}

/** Pressed leaf / botanical */
export function PressedLeafSvg({ id, accent }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const mid = accent;
  const deep = shade(accent, -0.28);
  const hi = shade(accent, 0.2);

  return (
    <svg viewBox="0 0 52 64" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        {softFilter(uid)}
        <linearGradient id={`leaf-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={hi} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={deep} />
        </linearGradient>
      </defs>
      <ellipse cx="26" cy="58" rx="12" ry="2.2" fill="#2c2418" opacity="0.12" />
      <g filter={`url(#t-soft-${uid})`} transform="rotate(-18 26 32)">
        <path
          d="M26 8
             C38 14 44 26 42 40
             C40 50 34 56 26 58
             C18 56 12 50 10 40
             C8 26 14 14 26 8 Z"
          fill={`url(#leaf-${uid})`}
          opacity="0.92"
        />
        <path
          d="M26 12 V54"
          fill="none"
          stroke={deep}
          strokeWidth="1"
          opacity="0.45"
        />
        {[18, 26, 34, 42].map((y, i) => (
          <path
            key={y}
            d={`M26 ${y} Q${18 - i} ${y + 2} ${14 - i} ${y + 6}`}
            fill="none"
            stroke={deep}
            strokeWidth="0.7"
            opacity="0.35"
          />
        ))}
        {[18, 26, 34, 42].map((y, i) => (
          <path
            key={`r-${y}`}
            d={`M26 ${y} Q${34 + i} ${y + 2} ${38 + i} ${y + 6}`}
            fill="none"
            stroke={deep}
            strokeWidth="0.7"
            opacity="0.3"
          />
        ))}
      </g>
    </svg>
  );
}

/** Folded paper airplane */
export function PaperPlaneSvg({ id, accent }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const paper = shade(accent, 0.62);
  const fold = shade(accent, 0.35);
  const edge = shade(accent, -0.05);

  return (
    <svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>{softFilter(uid)}</defs>
      <ellipse cx="32" cy="42" rx="16" ry="2.2" fill="#2c2418" opacity="0.12" />
      <g filter={`url(#t-soft-${uid})`} transform="rotate(-8 32 24)">
        <path
          d="M6 22 L58 8 L36 40 L28 28 Z"
          fill={paper}
          stroke={edge}
          strokeWidth="0.6"
        />
        <path d="M6 22 L28 28 L36 40 Z" fill={fold} opacity="0.85" />
        <path d="M28 28 L58 8 L36 24 Z" fill={shade(paper, 0.1)} />
        <path
          d="M28 28 L36 24"
          stroke={edge}
          strokeWidth="0.5"
          opacity="0.4"
        />
      </g>
    </svg>
  );
}

/** Mini kraft postcard */
export function PostcardSvg({ id, accent, label }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const kraft = accent;
  const short = (label || "wish you were here").slice(0, 16);

  return (
    <svg viewBox="0 0 72 52" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        {softFilter(uid)}
        <linearGradient id={`pc-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(kraft, 0.12)} />
          <stop offset="100%" stopColor={shade(kraft, -0.08)} />
        </linearGradient>
      </defs>
      <ellipse cx="36" cy="48" rx="22" ry="2.2" fill="#2c2418" opacity="0.12" />
      <rect
        x="6"
        y="6"
        width="60"
        height="40"
        rx="2"
        fill={`url(#pc-${uid})`}
        stroke={shade(kraft, -0.18)}
        strokeWidth="0.8"
        filter={`url(#t-soft-${uid})`}
      />
      {/* stamp corner */}
      <rect
        x="50"
        y="10"
        width="12"
        height="14"
        rx="1"
        fill="none"
        stroke={shade(kraft, -0.35)}
        strokeWidth="0.9"
        strokeDasharray="1.2 0.8"
        opacity="0.7"
      />
      <circle cx="56" cy="17" r="3.2" fill={shade(kraft, -0.25)} opacity="0.35" />
      {/* divider */}
      <line
        x1="36"
        y1="10"
        x2="36"
        y2="42"
        stroke={shade(kraft, -0.2)}
        strokeWidth="0.6"
        opacity="0.4"
      />
      {/* address lines */}
      {[28, 34, 40].map((y) => (
        <line
          key={y}
          x1="40"
          y1={y}
          x2="62"
          y2={y}
          stroke={shade(kraft, -0.22)}
          strokeWidth="0.55"
          opacity="0.35"
        />
      ))}
      <text
        x="20"
        y="28"
        textAnchor="middle"
        fill={shade(kraft, -0.45)}
        fontSize="5.5"
        fontFamily="var(--font-hand), cursive"
        opacity="0.85"
      >
        {short.length > 10 ? short.slice(0, 9) + "…" : short}
      </text>
    </svg>
  );
}

/** Short film-strip snippet */
export function FilmStripSvg({ id, accent }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const body = shade(accent, -0.55);
  const frame = shade(accent, 0.15);

  return (
    <svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>{softFilter(uid)}</defs>
      <ellipse cx="40" cy="36" rx="26" ry="2" fill="#2c2418" opacity="0.14" />
      <g filter={`url(#t-soft-${uid})`} transform="rotate(-4 40 20)">
        <rect x="4" y="6" width="72" height="28" rx="2" fill={body} />
        {/* sprocket holes */}
        {[10, 20, 30, 40, 50, 60, 70].map((x) => (
          <g key={x}>
            <rect x={x - 2} y="8" width="4" height="3" rx="0.6" fill="#1a1816" />
            <rect x={x - 2} y="29" width="4" height="3" rx="0.6" fill="#1a1816" />
          </g>
        ))}
        {/* frames */}
        {[12, 32, 52].map((x, i) => (
          <rect
            key={x}
            x={x}
            y="13"
            width="14"
            height="14"
            rx="1"
            fill={i === 1 ? frame : shade(frame, -0.15)}
            opacity={i === 1 ? 0.85 : 0.55}
          />
        ))}
      </g>
    </svg>
  );
}

/** Round enamel badge / button pin */
export function BadgeButtonSvg({ id, accent, label }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const rim = shade(accent, -0.3);
  const hi = shade(accent, 0.25);
  const short = (label || "GO").slice(0, 6);

  return (
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>
        {softFilter(uid)}
        <radialGradient id={`badge-${uid}`} cx="36%" cy="30%" r="68%">
          <stop offset="0%" stopColor={hi} />
          <stop offset="60%" stopColor={accent} />
          <stop offset="100%" stopColor={rim} />
        </radialGradient>
      </defs>
      <ellipse cx="24" cy="42" rx="13" ry="2.2" fill="#2c2418" opacity="0.14" />
      <circle
        cx="24"
        cy="22"
        r="16"
        fill={rim}
        filter={`url(#t-soft-${uid})`}
      />
      <circle cx="24" cy="22" r="14.2" fill={`url(#badge-${uid})`} />
      <circle
        cx="24"
        cy="22"
        r="14.2"
        fill="none"
        stroke={shade(accent, 0.4)}
        strokeWidth="0.8"
        opacity="0.5"
      />
      <ellipse cx="18" cy="16" rx="6" ry="3.5" fill="#fff" opacity="0.22" />
      <text
        x="24"
        y="25"
        textAnchor="middle"
        fill="#fffef9"
        fontSize="7"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontWeight="700"
        letterSpacing="0.5"
      >
        {short}
      </text>
    </svg>
  );
}

/** Washi washi cross / tape X — common on scrapbooks */
export function TapeCrossSvg({ id, accent }: SvgProps) {
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const a = accent;
  const b = shade(accent, -0.12);

  return (
    <svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" className="board-decor__svg">
      <defs>{softFilter(uid)}</defs>
      <ellipse cx="28" cy="50" rx="14" ry="2" fill="#2c2418" opacity="0.1" />
      <g filter={`url(#t-soft-${uid})`} opacity="0.9">
        <rect
          x="6"
          y="22"
          width="44"
          height="10"
          rx="1"
          fill={a}
          transform="rotate(28 28 27)"
          opacity="0.88"
        />
        <rect
          x="6"
          y="22"
          width="44"
          height="10"
          rx="1"
          fill={b}
          transform="rotate(-32 28 27)"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}
