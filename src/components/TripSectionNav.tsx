"use client";

import { useEffect, useState } from "react";

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
};

/**
 * Sticky in-page nav — mirrors how travel apps keep Plan / Notes always one tap away.
 */
export function TripSectionNav({ tabs }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

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
      className="sticky top-14 z-30 -mx-5 border-b border-sand-200/70 bg-sand-50/90 px-5 backdrop-blur-md sm:-mx-8 sm:px-8"
      aria-label="Trip sections"
    >
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const isOn = active === t.id;
          return (
            <a
              key={t.id}
              href={`#${t.id}`}
              onClick={() => setActive(t.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                isOn
                  ? "bg-ink text-white"
                  : "text-ink-soft hover:bg-white/80 hover:text-ink"
              }`}
            >
              {t.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
