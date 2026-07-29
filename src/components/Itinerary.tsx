import type { DayPlan } from "@/lib/types";

export function Itinerary({ days }: { days: DayPlan[] }) {
  return (
    <div className="space-y-8">
      {days.map((day) => (
        <article
          key={day.day}
          className="overflow-hidden rounded-3xl border border-sand-200/80 bg-white/50"
        >
          <header className="flex flex-wrap items-baseline gap-3 border-b border-sand-200/70 bg-sand-100/40 px-5 py-4 sm:px-7">
            <span className="rounded-full bg-sea/10 px-3 py-1 text-xs font-medium tracking-wide text-sea">
              Day {day.day}
            </span>
            <h3 className="font-serif text-xl text-ink sm:text-2xl">{day.title}</h3>
            <span className="text-sm text-ink-muted">{day.date}</span>
          </header>

          <ol className="relative space-y-0 px-5 py-2 sm:px-7">
            {day.items.map((item, i) => (
              <li key={item.id} className="relative flex gap-4 py-5 sm:gap-6">
                {i < day.items.length - 1 && (
                  <span
                    className="absolute left-[0.7rem] top-12 bottom-0 w-px bg-sand-200 sm:left-[0.85rem]"
                    aria-hidden
                  />
                )}
                <div className="relative z-10 mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-sea/30 bg-sand-50 sm:h-7 sm:w-7">
                  <span className="h-2 w-2 rounded-full bg-sea" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {item.time && (
                      <time className="text-sm tabular-nums text-coral">
                        {item.time}
                      </time>
                    )}
                    <h4 className="font-medium text-ink">{item.title}</h4>
                  </div>
                  {item.location && (
                    <p className="mt-1 text-xs text-ink-muted">📍 {item.location}</p>
                  )}
                  {item.description && (
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                      {item.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </article>
      ))}
    </div>
  );
}
