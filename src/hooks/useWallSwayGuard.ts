"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { findSideBySideOverlaps } from "@/lib/wall-sway";

/**
 * Extra horizontal padding (px) when two prints on the same row actually
 * collide. Never touches rotation — crushing sway made mobile walls look
 * perfectly square after a bad first measure.
 */
export function useWallSwayGuard(itemKey: string) {
  const listRef = useRef<HTMLUListElement>(null);
  const [gutters, setGutters] = useState<Record<string, number>>({});
  const guttersRef = useRef(gutters);
  guttersRef.current = gutters;

  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;

    let frame = 0;

    const resolve = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Phone is one column — sway can't collide sideways; leave tilt alone.
        if (window.matchMedia("(max-width: 767px)").matches) {
          if (Object.keys(guttersRef.current).length > 0) setGutters({});
          return;
        }

        const cards = [
          ...root.querySelectorAll<HTMLElement>("[data-wall-card]"),
        ];
        if (cards.length < 2) {
          if (Object.keys(guttersRef.current).length > 0) setGutters({});
          return;
        }

        const pads: Record<string, number> = {};
        for (const card of cards) pads[card.dataset.wallId!] = 0;

        const measure = () =>
          cards.map((card) => {
            const id = card.dataset.wallId!;
            // Measure the tilted print itself so underlay/rotation count.
            const target =
              card.matches(".instant, .wall-note")
                ? card
                : card.querySelector<HTMLElement>(".instant, .wall-note") ||
                  card;
            const r = target.getBoundingClientRect();
            const clear = Number(card.dataset.wallClearance || 10);
            return {
              id,
              left: r.left - clear,
              right: r.right + clear,
              top: r.top,
              bottom: r.bottom,
            };
          });

        for (let pass = 0; pass < 6; pass++) {
          for (const card of cards) {
            const id = card.dataset.wallId!;
            const li = card.closest<HTMLElement>(".wall-item");
            const g = pads[id];
            if (li) {
              li.style.paddingLeft = g ? `${g}px` : "";
              li.style.paddingRight = g ? `${g}px` : "";
            }
          }
          void root.offsetWidth;

          const hits = findSideBySideOverlaps(measure());
          if (hits.length === 0) break;

          for (const { a, b, overlap } of hits) {
            const extra = Math.ceil(overlap / 2) + 6;
            pads[a] = Math.max(pads[a], extra);
            pads[b] = Math.max(pads[b], extra);
          }
        }

        for (const card of cards) {
          const li = card.closest<HTMLElement>(".wall-item");
          if (li) {
            li.style.paddingLeft = "";
            li.style.paddingRight = "";
          }
        }

        const changed =
          Object.keys(pads).length !== Object.keys(guttersRef.current).length ||
          Object.keys(pads).some(
            (id) =>
              Math.round(pads[id] || 0) !==
              Math.round(guttersRef.current[id] || 0),
          );
        if (changed) setGutters(pads);
      });
    };

    resolve();

    const ro = new ResizeObserver(resolve);
    ro.observe(root);
    for (const card of root.querySelectorAll("[data-wall-card]")) {
      ro.observe(card);
    }
    window.addEventListener("resize", resolve);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", resolve);
    };
  }, [itemKey]);

  return { listRef, gutters };
}
