"use client";

import { useEffect } from "react";

/**
 * Trip detail: paint html with the cover chrome color so iOS status bar /
 * rubber-band overscroll match the hero instead of the cream page sand.
 */
export function TripChromeTheme({ color }: { color: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("page-trip");
    root.style.setProperty("--trip-chrome", color);

    return () => {
      root.classList.remove("page-trip");
      root.style.removeProperty("--trip-chrome");
    };
  }, [color]);

  return null;
}
