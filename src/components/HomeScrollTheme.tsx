"use client";

import { useEffect } from "react";

/**
 * Home cork wall: paint html/body with the cork base so iOS rubber-band
 * overscroll doesn't flash the cream page background.
 */
export function HomeScrollTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("page-home");
    return () => {
      root.classList.remove("page-home");
    };
  }, []);

  return null;
}
