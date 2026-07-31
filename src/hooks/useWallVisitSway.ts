"use client";

import { useEffect, useRef, useState } from "react";
import { rollWallSway, type WallSwayItem } from "@/lib/wall-sway";

/**
 * Visit-scoped random tilts shared by the public wall and admin edit board.
 * Re-rolls when the item *set* changes (not reorder) or bfcache restores.
 */
export function useWallVisitSway(
  items: WallSwayItem[],
  soloTrip = false,
): Record<string, number> {
  const [swayById, setSwayById] = useState<Record<string, number>>({});
  const itemSetKey = [...items.map((i) => i.id)].sort().join("|");
  const itemsRef = useRef(items);
  const soloRef = useRef(soloTrip);
  itemsRef.current = items;
  soloRef.current = soloTrip;

  useEffect(() => {
    function roll() {
      setSwayById(rollWallSway(itemsRef.current, soloRef.current));
    }
    roll();
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) roll();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [itemSetKey, soloTrip]);

  return swayById;
}
