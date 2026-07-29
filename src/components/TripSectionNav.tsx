"use client";

import { useEffect, useState, type MouseEvent } from "react";

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
};

/**
 * Sticky in-page nav — mirrors how travel apps keep Plan / Notes always one tap away.
 */
export function TripSectionNav({ tabs }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    setActive(id);

    const target = document.getElementById(id);
    if (!target) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", `#${id}`);
  }

  useEffect(() => {
    const els = tabs
      .map((t) => document.getElementById(t.id))
      .filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [tabs]);

  return (
    <nav
      className="trip-section-nav sticky top-14 z-30 -mx-5 border-b border-sand-200/70 bg-sand-50/90 px-5 backdrop-blur-md sm:-mx-8 sm:px-8"
      aria-label="Trip sections"
    >
      <div className="trip-section-nav__inner mx-auto flex max-w-6xl gap-1 overflow-x-auto py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="trip-section-nav__eyebrow" aria-hidden="true">
          Jump to
        </span>
        {tabs.map((t, index) => {
          const isOn = active === t.id;
          return (
            <a
              key={t.id}
              href={`#${t.id}`}
              onClick={(event) => scrollToSection(event, t.id)}
              className={`trip-section-nav__link shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                isOn
                  ? "trip-section-nav__link--active bg-ink text-white"
                  : "text-ink-soft hover:bg-white/80 hover:text-ink"
              }`}
              aria-current={isOn ? "location" : undefined}
            >
              <span className="trip-section-nav__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{t.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
