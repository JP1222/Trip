"use client";

import {
  BOARD_CLIPS,
  BOARD_NOTES,
  BOARD_PINS,
  BOARD_WIDGETS,
  type BoardDecorItem,
  type DecorCategory,
} from "@/lib/board-decor";
import { BoardDecorIcon } from "./BoardDecorIcon";

type Props = {
  category: DecorCategory;
  onClose: () => void;
  onBack: () => void;
  /** When free-canvas lands, this will place the item. For now: preview only. */
  onSelect?: (item: BoardDecorItem) => void;
};

const COPY: Record<
  DecorCategory,
  { title: string; blurb: string; items: BoardDecorItem[] }
> = {
  pin: {
    title: "Pins",
    blurb: "Enamel & metal pushpins for corners of polaroids.",
    items: BOARD_PINS,
  },
  clip: {
    title: "Clips",
    blurb: "Binder clips and wood clothespins — hang a print without a pin hole.",
    items: BOARD_CLIPS,
  },
  note: {
    title: "Sticky notes",
    blurb: "Write a reminder on the board. Handwriting font on soft paper colors.",
    items: BOARD_NOTES,
  },
  widget: {
    title: "Vinyl & trinkets",
    blurb:
      "Felt-wall classics: vinyl, washi tape, tickets, hearts, stamps, leaves… Drag to place, corners to resize.",
    items: BOARD_WIDGETS,
  },
};

export function DecorCatalogSheet({
  category,
  onClose,
  onBack,
  onSelect,
}: Props) {
  const { title, blurb, items } = COPY[category];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal
      aria-labelledby="decor-catalog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[min(92dvh,760px)] w-full max-w-lg overflow-y-auto rounded-3xl border border-sand-200 bg-[#fffcf8] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-ink-muted transition hover:text-sea"
            >
              ← Back
            </button>
            <h2
              id="decor-catalog-title"
              className="mt-1 font-serif text-xl text-ink"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{blurb}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand-100 text-lg text-ink-muted hover:bg-sand-200"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Live preview strip on faux cork */}
        <div className="decor-catalog-stage mt-4">
          <p className="decor-catalog-stage__label">On cork</p>
          <div className="decor-catalog-stage__row">
            {(category === "widget"
              ? [
                  items.find((i) => i.id === "vinyl-classic"),
                  items.find((i) => i.id === "tape-sea"),
                  items.find((i) => i.id === "ticket-admit"),
                  items.find((i) => i.id === "sticker-heart"),
                  items.find((i) => i.id === "leaf-sage"),
                  items.find((i) => i.id === "stamp-travel"),
                ].filter(Boolean)
              : items.slice(0, 5)
            ).map((item) =>
              item ? (
                <BoardDecorIcon key={item.id} item={item} size={48} />
              ) : null,
            )}
          </div>
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="decor-catalog-card group"
                onClick={() => onSelect?.(item)}
              >
                <span className="decor-catalog-card__art">
                  <BoardDecorIcon item={item} size={52} />
                </span>
                <span className="decor-catalog-card__name">{item.name}</span>
                <span className="decor-catalog-card__desc">{item.description}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-center text-xs text-ink-muted">
          Tap a style to drop it on the board · then drag to place
        </p>
      </div>
    </div>
  );
}
