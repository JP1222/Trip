/**
 * 2.5D vinyl disc for the cork board — pure SVG, no images.
 * Sits flat with a soft contact shadow; optional sleeve card behind.
 */

export type VinylVariant =
  | "classic"
  | "sea"
  | "rose"
  | "amber"
  | "night"
  | "sleeve";

type Props = {
  id: string;
  variant?: VinylVariant;
  /** Center label text (short) */
  label?: string;
  className?: string;
  /** Outer size in CSS px */
  size?: number;
};

const VARIANT: Record<
  Exclude<VinylVariant, "sleeve">,
  { vinyl: string; groove: string; label: string; ring: string; gloss: string }
> = {
  classic: {
    vinyl: "#1a1816",
    groove: "#2e2a26",
    label: "#e8dfd0",
    ring: "#c4a574",
    gloss: "rgba(255,255,255,0.14)",
  },
  sea: {
    vinyl: "#1e3332",
    groove: "#2d4a48",
    label: "#dfecea",
    ring: "#5a8582",
    gloss: "rgba(180,220,210,0.16)",
  },
  rose: {
    vinyl: "#3a2220",
    groove: "#523430",
    label: "#f3e0db",
    ring: "#c47a6a",
    gloss: "rgba(255,200,190,0.14)",
  },
  amber: {
    vinyl: "#2c2214",
    groove: "#433520",
    label: "#f3e8d4",
    ring: "#c9a24a",
    gloss: "rgba(255,220,150,0.14)",
  },
  night: {
    vinyl: "#16141c",
    groove: "#2a2638",
    label: "#e4dff0",
    ring: "#8b7bb8",
    gloss: "rgba(200,190,255,0.12)",
  },
};

export function VinylRecord({
  id,
  variant = "classic",
  label = "Trips",
  className = "",
  size = 96,
}: Props) {
  const withSleeve = variant === "sleeve";
  const skin = VARIANT[withSleeve ? "classic" : variant];
  const uid = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const short = truncateLabel(label, 10);

  return (
    <span
      className={`board-vinyl ${withSleeve ? "board-vinyl--sleeve" : ""} ${className}`}
      style={{ width: size, height: withSleeve ? size * 1.08 : size }}
      aria-hidden
    >
      <svg
        viewBox={withSleeve ? "0 0 120 128" : "0 0 100 100"}
        className="board-vinyl__svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id={`vinyl-body-${uid}`} cx="42%" cy="38%" r="62%">
            <stop offset="0%" stopColor={shade(skin.vinyl, 0.22)} />
            <stop offset="55%" stopColor={skin.vinyl} />
            <stop offset="100%" stopColor={shade(skin.vinyl, -0.18)} />
          </radialGradient>
          <radialGradient id={`vinyl-label-${uid}`} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor={shade(skin.label, 0.12)} />
            <stop offset="100%" stopColor={shade(skin.label, -0.08)} />
          </radialGradient>
          <linearGradient id={`vinyl-gloss-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={skin.gloss} />
            <stop offset="45%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
          </linearGradient>
          <filter
            id={`vinyl-soft-${uid}`}
            x="-20%"
            y="-15%"
            width="140%"
            height="140%"
          >
            <feDropShadow
              dx="0.8"
              dy="2.2"
              stdDeviation="1.6"
              floodColor="#2c2418"
              floodOpacity="0.28"
            />
          </filter>
        </defs>

        {withSleeve && (
          <g className="board-vinyl__sleeve">
            <rect
              x="8"
              y="10"
              width="78"
              height="78"
              rx="3"
              fill="#f0e6d6"
              stroke="#d4c4ae"
              strokeWidth="1"
              transform="rotate(-8 47 49)"
              filter={`url(#vinyl-soft-${uid})`}
            />
            <rect
              x="14"
              y="16"
              width="66"
              height="66"
              rx="2"
              fill="#e4d5c0"
              transform="rotate(-8 47 49)"
              opacity="0.9"
            />
            <text
              x="47"
              y="52"
              textAnchor="middle"
              fill="#6a5a48"
              fontSize="7"
              fontFamily="var(--font-hand), 'Segoe Print', cursive"
              transform="rotate(-8 47 49)"
              opacity="0.75"
            >
              mixtape
            </text>
          </g>
        )}

        <g transform={withSleeve ? "translate(28 30)" : undefined}>
          {/* contact shadow stays put while disc spins */}
          <ellipse
            cx="50"
            cy="93"
            rx="34"
            ry="5.5"
            fill="#2c2418"
            opacity="0.16"
          />

          <g
            className="board-vinyl__disc"
            filter={withSleeve ? undefined : `url(#vinyl-soft-${uid})`}
          >
            {/* disc body */}
            <circle cx="50" cy="50" r="46" fill={`url(#vinyl-body-${uid})`} />

            {/* grooves */}
            {[40, 36, 32, 28, 24, 20].map((r) => (
              <circle
                key={r}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={skin.groove}
                strokeWidth="0.7"
                opacity="0.55"
              />
            ))}
            {[38, 34, 30, 26, 22].map((r) => (
              <circle
                key={`h-${r}`}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={shade(skin.vinyl, 0.12)}
                strokeWidth="0.45"
                opacity="0.35"
              />
            ))}

            {/* outer rim ring */}
            <circle
              cx="50"
              cy="50"
              r="45.2"
              fill="none"
              stroke={shade(skin.vinyl, 0.35)}
              strokeWidth="1.1"
              opacity="0.5"
            />

            {/* center label */}
            <circle
              cx="50"
              cy="50"
              r="15.5"
              fill={`url(#vinyl-label-${uid})`}
            />
            <circle
              cx="50"
              cy="50"
              r="15.5"
              fill="none"
              stroke={skin.ring}
              strokeWidth="1.4"
            />
            <circle
              cx="50"
              cy="50"
              r="13.8"
              fill="none"
              stroke={shade(skin.ring, -0.15)}
              strokeWidth="0.5"
              opacity="0.6"
            />

            {/* spindle hole */}
            <circle cx="50" cy="50" r="2.4" fill="#1c1a17" />
            <circle
              cx="50"
              cy="50"
              r="2.4"
              fill="none"
              stroke="#4a453e"
              strokeWidth="0.5"
            />

            {/* label text */}
            <text
              x="50"
              y="47.5"
              textAnchor="middle"
              fill="#3d342c"
              fontSize="4.2"
              fontFamily="var(--font-hand), 'Segoe Print', cursive"
              opacity="0.9"
            >
              {short}
            </text>
            <text
              x="50"
              y="53.5"
              textAnchor="middle"
              fill="#7a6e62"
              fontSize="3.2"
              fontFamily="var(--font-sans), system-ui, sans-serif"
              letterSpacing="0.4"
            >
              SIDE A
            </text>

            {/* gloss wedge — 2.5D sheen */}
            <path
              d="M18 28 A38 38 0 0 1 72 22 L62 42 A18 18 0 0 0 32 48 Z"
              fill={`url(#vinyl-gloss-${uid})`}
              opacity="0.95"
            />
            <ellipse
              cx="36"
              cy="32"
              rx="10"
              ry="5"
              fill="rgba(255,255,255,0.12)"
              transform="rotate(-28 36 32)"
            />
          </g>
        </g>
      </svg>
    </span>
  );
}

function truncateLabel(s: string, max: number) {
  const t = s.trim();
  if (!t) return "♪";
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
  const to = (n: number) => Math.max(0, Math.min(255, mix(n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
