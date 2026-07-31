/**
 * Built-in board decoration catalog (pins, clips, sticky notes, widgets).
 * Free placement on the canvas comes next — assets + metadata ship first.
 */

export type DecorCategory = "pin" | "clip" | "note" | "widget";

export type BoardDecorItem = {
  id: string;
  category: DecorCategory;
  name: string;
  /** Short label for tray */
  label: string;
  description: string;
  /** CSS accent for swatches / recolorable parts */
  accent?: string;
  /** Default sticky-note body (notes only) */
  defaultText?: string;
  /** Center label on vinyl widgets */
  vinylLabel?: string;
  /** Suggested scale on a 1600px canvas (1 = ~48px pin head) */
  defaultScale: number;
};

export const BOARD_PINS: BoardDecorItem[] = [
  {
    id: "pin-metal",
    category: "pin",
    name: "Studio metal",
    label: "Metal",
    description: "Cool gray pushpin — same family as trip polaroids",
    accent: "#8a847c",
    defaultScale: 1,
  },
  {
    id: "pin-rose",
    category: "pin",
    name: "Rose enamel",
    label: "Rose",
    description: "Soft coral head with a tiny specular glint",
    accent: "#c47a6a",
    defaultScale: 1,
  },
  {
    id: "pin-gold",
    category: "pin",
    name: "Brass",
    label: "Brass",
    description: "Warm brass pin for “keepsake” shots",
    accent: "#c9a24a",
    defaultScale: 1,
  },
  {
    id: "pin-sage",
    category: "pin",
    name: "Sage",
    label: "Sage",
    description: "Muted green — sits quietly on cork",
    accent: "#6f8f78",
    defaultScale: 1,
  },
  {
    id: "pin-sea",
    category: "pin",
    name: "Sea glass",
    label: "Sea",
    description: "Matches the site’s sea accent",
    accent: "#3d6664",
    defaultScale: 1,
  },
  {
    id: "pin-ink",
    category: "pin",
    name: "Ink black",
    label: "Ink",
    description: "Near-black head for high-contrast prints",
    accent: "#2c2824",
    defaultScale: 1,
  },
];

export const BOARD_CLIPS: BoardDecorItem[] = [
  {
    id: "clip-binder-silver",
    category: "clip",
    name: "Silver binder",
    label: "Silver",
    description: "Classic office binder clip, silver steel",
    accent: "#9a9590",
    defaultScale: 1.15,
  },
  {
    id: "clip-binder-black",
    category: "clip",
    name: "Matte black binder",
    label: "Black",
    description: "Low-key binder for dark photos",
    accent: "#2a2622",
    defaultScale: 1.15,
  },
  {
    id: "clip-binder-rose",
    category: "clip",
    name: "Rose binder",
    label: "Rose",
    description: "Painted binder clip, coral enamel",
    accent: "#c47a6a",
    defaultScale: 1.15,
  },
  {
    id: "clip-wood",
    category: "clip",
    name: "Wood clothespin",
    label: "Wood",
    description: "Light birch clothespin with metal spring",
    accent: "#d4b896",
    defaultScale: 1.25,
  },
  {
    id: "clip-wood-walnut",
    category: "clip",
    name: "Walnut clothespin",
    label: "Walnut",
    description: "Darker wood pin for warmer boards",
    accent: "#8b6a45",
    defaultScale: 1.25,
  },
];

export const BOARD_NOTES: BoardDecorItem[] = [
  {
    id: "note-butter",
    category: "note",
    name: "Butter sticky",
    label: "Butter",
    description: "Classic yellow sticky — grocery-list energy",
    accent: "#f5e6a8",
    defaultText: "Next trip?",
    defaultScale: 1.4,
  },
  {
    id: "note-blush",
    category: "note",
    name: "Blush sticky",
    label: "Blush",
    description: "Soft pink for birthdays & soft memories",
    accent: "#f3cfc8",
    defaultText: "Remember this",
    defaultScale: 1.4,
  },
  {
    id: "note-mint",
    category: "note",
    name: "Mint sticky",
    label: "Mint",
    description: "Cool mint — pairs with sea accents",
    accent: "#d5e8df",
    defaultText: "Pack list",
    defaultScale: 1.4,
  },
  {
    id: "note-sky",
    category: "note",
    name: "Sky sticky",
    label: "Sky",
    description: "Pale blue, calm on warm cork",
    accent: "#d4e4ef",
    defaultText: "Don’t forget…",
    defaultScale: 1.4,
  },
  {
    id: "note-lilac",
    category: "note",
    name: "Lilac sticky",
    label: "Lilac",
    description: "Quiet purple for evening boards",
    accent: "#e4d8ef",
    defaultText: "♥",
    defaultScale: 1.4,
  },
  {
    id: "note-cream",
    category: "note",
    name: "Cream index",
    label: "Cream",
    description: "Off-white card — more “note” than sticky",
    accent: "#f4efe6",
    defaultText: "Idea",
    defaultScale: 1.35,
  },
];

/**
 * 2.5D trinkets for felt / cork photo walls:
 * vinyl, washi tape, tickets, stickers, botanicals, paper plane…
 */
export const BOARD_WIDGETS: BoardDecorItem[] = [
  // ── Vinyl ──
  {
    id: "vinyl-classic",
    category: "widget",
    name: "Classic black",
    label: "Black",
    description: "Standard LP — grooves, cream label, soft cork shadow",
    accent: "#1a1816",
    vinylLabel: "Trips",
    defaultScale: 1.6,
  },
  {
    id: "vinyl-sea",
    category: "widget",
    name: "Sea glass",
    label: "Sea",
    description: "Deep teal press — pairs with the site sea accent",
    accent: "#1e3332",
    vinylLabel: "Road trip",
    defaultScale: 1.6,
  },
  {
    id: "vinyl-rose",
    category: "widget",
    name: "Rose night",
    label: "Rose",
    description: "Warm dark vinyl with coral center ring",
    accent: "#3a2220",
    vinylLabel: "Late night",
    defaultScale: 1.6,
  },
  {
    id: "vinyl-amber",
    category: "widget",
    name: "Amber press",
    label: "Amber",
    description: "Brass-ring label — keepsake playlist energy",
    accent: "#2c2214",
    vinylLabel: "Mixtape",
    defaultScale: 1.6,
  },
  {
    id: "vinyl-night",
    category: "widget",
    name: "Night violet",
    label: "Night",
    description: "Quiet purple sheen for evening boards",
    accent: "#16141c",
    vinylLabel: "After dark",
    defaultScale: 1.6,
  },
  {
    id: "vinyl-sleeve",
    category: "widget",
    name: "With sleeve",
    label: "Sleeve",
    description: "Disc resting on a tilted kraft sleeve card",
    accent: "#1a1816",
    vinylLabel: "Side A",
    defaultScale: 1.75,
  },
  // ── Washi tape ──
  {
    id: "tape-cream",
    category: "widget",
    name: "Cream washi",
    label: "Cream",
    description: "Soft parchment tape — classic scrapbook strip",
    accent: "#e8dcc8",
    defaultScale: 1.35,
  },
  {
    id: "tape-sea",
    category: "widget",
    name: "Sea washi",
    label: "Sea",
    description: "Muted teal washi, semi-transparent fiber look",
    accent: "#7a9e9a",
    defaultScale: 1.35,
  },
  {
    id: "tape-rose",
    category: "widget",
    name: "Rose washi",
    label: "Rose",
    description: "Blush tape for corners of favorite prints",
    accent: "#d4a09a",
    defaultScale: 1.35,
  },
  {
    id: "tape-mint",
    category: "widget",
    name: "Mint washi",
    label: "Mint",
    description: "Cool mint strip — quiet on warm cork",
    accent: "#a8c4b4",
    defaultScale: 1.35,
  },
  {
    id: "tape-striped",
    category: "widget",
    name: "Striped washi",
    label: "Stripe",
    description: "Diagonal fiber stripes — playful washi energy",
    accent: "#c4b08a",
    defaultScale: 1.35,
  },
  {
    id: "tape-cross",
    category: "widget",
    name: "Tape cross",
    label: "Cross",
    description: "Two washi strips crossed — pin a corner scrapbook-style",
    accent: "#c47a6a",
    defaultScale: 1.2,
  },
  // ── Tickets & paper ──
  {
    id: "ticket-admit",
    category: "widget",
    name: "Admit one",
    label: "Admit",
    description: "Perforated keep-forever ticket stub",
    accent: "#c47a6a",
    vinylLabel: "ADMIT",
    defaultScale: 1.4,
  },
  {
    id: "ticket-movie",
    category: "widget",
    name: "Movie stub",
    label: "Movie",
    description: "Night-out ticket with sea-ink stub",
    accent: "#3d6664",
    vinylLabel: "CINEMA",
    defaultScale: 1.4,
  },
  {
    id: "postcard-kraft",
    category: "widget",
    name: "Kraft postcard",
    label: "Postcard",
    description: "Mini postcard with stamp box — wish you were here",
    accent: "#d4b896",
    vinylLabel: "wish you",
    defaultScale: 1.45,
  },
  {
    id: "plane-paper",
    category: "widget",
    name: "Paper plane",
    label: "Plane",
    description: "Folded paper airplane — travel day energy",
    accent: "#e8e2d6",
    defaultScale: 1.25,
  },
  {
    id: "film-strip",
    category: "widget",
    name: "Film strip",
    label: "Film",
    description: "Short 35mm snippet with sprocket holes",
    accent: "#8a847c",
    defaultScale: 1.35,
  },
  // ── Stickers & charms ──
  {
    id: "sticker-heart",
    category: "widget",
    name: "Heart enamel",
    label: "Heart",
    description: "Soft enamel heart sticker with a tiny glint",
    accent: "#c47a6a",
    defaultScale: 1.15,
  },
  {
    id: "sticker-heart-gold",
    category: "widget",
    name: "Brass heart",
    label: "Brass ♥",
    description: "Warm brass heart for keepsake corners",
    accent: "#c9a24a",
    defaultScale: 1.15,
  },
  {
    id: "sticker-star",
    category: "widget",
    name: "Gold star",
    label: "Star",
    description: "Enamel star — “this one was perfect”",
    accent: "#c9a24a",
    defaultScale: 1.1,
  },
  {
    id: "sticker-star-sea",
    category: "widget",
    name: "Sea star",
    label: "Sea ★",
    description: "Teal star sticker, quieter than brass",
    accent: "#3d6664",
    defaultScale: 1.1,
  },
  {
    id: "stamp-travel",
    category: "widget",
    name: "Travel stamp",
    label: "Stamp",
    description: "Passport-style circular ink stamp",
    accent: "#8b4a42",
    vinylLabel: "VISITED",
    defaultScale: 1.3,
  },
  {
    id: "stamp-sea",
    category: "widget",
    name: "Sea stamp",
    label: "Sea ink",
    description: "Teal travel stamp for coastal boards",
    accent: "#3d6664",
    vinylLabel: "COAST",
    defaultScale: 1.3,
  },
  {
    id: "leaf-sage",
    category: "widget",
    name: "Pressed leaf",
    label: "Leaf",
    description: "Botanical pressed leaf — soft green on cork",
    accent: "#6f8f78",
    defaultScale: 1.35,
  },
  {
    id: "leaf-amber",
    category: "widget",
    name: "Autumn leaf",
    label: "Autumn",
    description: "Warm pressed leaf for fall trips",
    accent: "#c4894a",
    defaultScale: 1.35,
  },
  {
    id: "badge-go",
    category: "widget",
    name: "Go badge",
    label: "Go",
    description: "Round enamel button pin — let’s go",
    accent: "#3d6664",
    vinylLabel: "GO",
    defaultScale: 1.15,
  },
  {
    id: "badge-yay",
    category: "widget",
    name: "Yay badge",
    label: "Yay",
    description: "Coral enamel button for celebration shots",
    accent: "#c47a6a",
    vinylLabel: "YAY",
    defaultScale: 1.15,
  },
];

/** Seeded guestbook book on the cork — not in the add-tray catalog. */
export const GUESTBOOK_CATALOG_ID = "widget-guestbook";

export const GUESTBOOK_DECOR: BoardDecorItem = {
  id: GUESTBOOK_CATALOG_ID,
  category: "widget",
  name: "Guestbook",
  label: "Book",
  description: "Visitor guestbook — drag to place on the cork",
  accent: "#3d6664",
  defaultScale: 1.35,
};

export const ALL_BOARD_DECOR: BoardDecorItem[] = [
  ...BOARD_PINS,
  ...BOARD_CLIPS,
  ...BOARD_NOTES,
  ...BOARD_WIDGETS,
  GUESTBOOK_DECOR,
];

export function getDecorById(id: string): BoardDecorItem | undefined {
  return ALL_BOARD_DECOR.find((d) => d.id === id);
}

export function decorByCategory(category: DecorCategory): BoardDecorItem[] {
  return ALL_BOARD_DECOR.filter((d) => d.category === category);
}

export function isGuestbookCatalogId(id: string): boolean {
  return id === GUESTBOOK_CATALOG_ID;
}

/**
 * Color-swatch family for double-click recolor in edit mode.
 * Same shape / role only — never mix vinyl with washi, binder with wood pin, etc.
 */
export function decorRecolorFamily(id: string): string | null {
  if (isGuestbookCatalogId(id)) return null;
  if (id.startsWith("pin-")) return "pin";
  if (id.startsWith("clip-binder-")) return "clip-binder";
  if (id.startsWith("clip-wood")) return "clip-wood";
  if (id.startsWith("note-")) return "note";
  if (id.startsWith("vinyl-")) return "vinyl";
  if (id === "tape-cross") return null;
  if (id.startsWith("tape-")) return "tape";
  if (id.startsWith("ticket-")) return "ticket";
  if (id.startsWith("sticker-heart")) return "sticker-heart";
  if (id.startsWith("sticker-star")) return "sticker-star";
  if (id.startsWith("stamp-")) return "stamp";
  if (id.startsWith("leaf-")) return "leaf";
  if (id.startsWith("badge-")) return "badge";
  return null;
}

/** Sibling catalog items that differ mainly by accent/color. */
export function decorColorOptions(catalogId: string): BoardDecorItem[] {
  const family = decorRecolorFamily(catalogId);
  if (!family) return [];
  return ALL_BOARD_DECOR.filter((d) => decorRecolorFamily(d.id) === family);
}
