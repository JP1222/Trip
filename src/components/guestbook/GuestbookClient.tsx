"use client";

import { useEffect, useState } from "react";
import type { GuestbookEntry } from "@/lib/guestbook";
import { GuestbookComposer } from "./GuestbookComposer";
import { GuestbookFeed } from "./GuestbookFeed";

type Props = {
  initialEntries: GuestbookEntry[];
  canModerate?: boolean;
};

/** Notes per right-hand (or flipped) page — keeps the leaf a fixed height. */
const NOTES_PER_PAGE = 2;

function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let rest = Math.max(1, n);
  let out = "";
  for (const [value, glyph] of map) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

export function GuestbookClient({
  initialEntries,
  canModerate = false,
}: Props) {
  const [entries, setEntries] = useState(initialEntries);
  /** 0 = sign page (mobile); notes pages are 1…n. Desktop ignores 0 for the right leaf. */
  const [page, setPage] = useState(0);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 859px)");
    function sync() {
      setNarrow(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const notePageCount = Math.max(1, Math.ceil(entries.length / NOTES_PER_PAGE));
  /** Mobile: sign + note pages. Desktop: only note pages on the right leaf. */
  const totalFlips = narrow ? 1 + notePageCount : notePageCount;

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalFlips - 1)));
  }, [totalFlips]);

  const notesPageIndex = narrow ? Math.max(0, page - 1) : page;
  const pageEntries = entries.slice(
    notesPageIndex * NOTES_PER_PAGE,
    notesPageIndex * NOTES_PER_PAGE + NOTES_PER_PAGE,
  );

  const showingSign = narrow && page === 0;
  const folioLeft = "i";
  const folioRight = toRoman(notesPageIndex + 2);

  function go(delta: number) {
    setPage((p) => Math.min(totalFlips - 1, Math.max(0, p + delta)));
  }

  function onPosted(entry: GuestbookEntry) {
    setEntries((prev) => [entry, ...prev]);
    // Jump to the first notes page so the new mark is visible.
    setPage(narrow ? 1 : 0);
  }

  return (
    <div className="guestbook-open">
      <div className="guestbook-open__shadow" aria-hidden />
      <div className="guestbook-spread">
        <div className="guestbook-spine" aria-hidden>
          <span className="guestbook-spine__stitch" />
          <span className="guestbook-spine__stitch" />
          <span className="guestbook-spine__stitch" />
          <span className="guestbook-spine__stitch" />
          <span className="guestbook-spine__stitch" />
          <span className="guestbook-spine__stitch" />
        </div>

        {/* Desktop left leaf — always the signing page */}
        {!narrow ? (
          <section
            className="guestbook-leaf guestbook-leaf--write"
            aria-label="Sign the guestbook"
          >
            <p className="guestbook-leaf__folio">{folioLeft}</p>
            <p className="guestbook-leaf__inscription">Guestbook</p>
            <p className="guestbook-leaf__epigraph">
              Friends &amp; travelers — leave a few words.
            </p>
            <GuestbookComposer onPosted={onPosted} />
          </section>
        ) : null}

        {!narrow ? (
          <div className="guestbook-gutter" aria-hidden>
            <span className="guestbook-gutter__stitch" />
            <span className="guestbook-gutter__stitch" />
            <span className="guestbook-gutter__stitch" />
            <span className="guestbook-gutter__stitch" />
          </div>
        ) : null}

        <section
          className={`guestbook-leaf ${showingSign ? "guestbook-leaf--write" : "guestbook-leaf--read"}`}
          aria-label={showingSign ? "Sign the guestbook" : "Visitor notes"}
          aria-live="polite"
        >
          {showingSign ? (
            <>
              <p className="guestbook-leaf__folio">{folioLeft}</p>
              <p className="guestbook-leaf__inscription">Guestbook</p>
              <p className="guestbook-leaf__epigraph">
                Friends &amp; travelers — leave a few words.
              </p>
              <GuestbookComposer onPosted={onPosted} />
            </>
          ) : (
            <>
              <p className="guestbook-leaf__folio">{folioRight}</p>
              <p className="guestbook-leaf__running">
                {entries.length === 0
                  ? "Blank pages"
                  : `Page ${notesPageIndex + 1} of ${notePageCount}`}
              </p>
              <div className="guestbook-leaf__scroll">
                <GuestbookFeed
                  entries={pageEntries}
                  empty={entries.length === 0}
                  canModerate={canModerate}
                  onDeleted={(id) =>
                    setEntries((prev) => prev.filter((e) => e.id !== id))
                  }
                />
              </div>
            </>
          )}

          <nav className="guestbook-turn" aria-label="Turn pages">
            <button
              type="button"
              className="guestbook-turn__btn"
              disabled={page <= 0}
              onClick={() => go(-1)}
            >
              ← Prev
            </button>
            <span className="guestbook-turn__mark">
              {page + 1} / {totalFlips}
            </span>
            <button
              type="button"
              className="guestbook-turn__btn"
              disabled={page >= totalFlips - 1}
              onClick={() => go(1)}
            >
              Next →
            </button>
          </nav>
        </section>
      </div>
    </div>
  );
}
