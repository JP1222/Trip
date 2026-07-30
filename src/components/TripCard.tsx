import Link from "next/link";
import type { Trip } from "@/lib/types";
import { formatDateRange, tripDurationDays } from "@/lib/trips";
import { coverGradientToCss } from "@/lib/wall";

export function TripCard({ trip, index = 0 }: { trip: Trip; index?: number }) {
  const days = tripDurationDays(trip.startDate, trip.endDate);
  const coverBg =
    coverGradientToCss(trip.coverGradient) ??
    "linear-gradient(145deg, #efeae2 0%, #e0d8cc 100%)";

  return (
    <Link
      href={`/trips/${trip.id}`}
      className={`group animate-fade-up delay-${Math.min(index + 1, 4)} block overflow-hidden rounded-3xl border border-sand-200/80 bg-white/60 shadow-[0_8px_30px_rgba(42,38,34,0.04)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(42,38,34,0.08)]`}
    >
      <div
        className="relative flex h-48 items-end overflow-hidden sm:h-56"
        style={{ background: coverBg }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
        <span className="absolute right-6 top-6 text-5xl opacity-80 transition duration-500 group-hover:scale-110 group-hover:opacity-100 sm:text-6xl">
          {trip.coverEmoji}
        </span>
        <div className="relative z-10 w-full p-6">
          <p className="text-xs tracking-[0.18em] text-ink-soft/80 uppercase">
            {trip.destination}
          </p>
          <h3 className="mt-1 font-serif text-2xl text-ink sm:text-[1.7rem]">
            {trip.title}
          </h3>
        </div>
      </div>

      <div className="space-y-3 p-6">
        <p className="text-sm leading-relaxed text-ink-soft">{trip.subtitle}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
          <span className="hidden h-1 w-1 rounded-full bg-sand-300 sm:inline" />
          <span>
            {days} {days === 1 ? "day" : "days"}
          </span>
          <span className="hidden h-1 w-1 rounded-full bg-sand-300 sm:inline" />
          <span>
            {trip.members.length}{" "}
            {trip.members.length === 1 ? "traveler" : "travelers"}
          </span>
        </div>
        <div className="flex items-center justify-end pt-1">
          <span className="text-sm text-coral transition group-hover:translate-x-0.5">
            View trip →
          </span>
        </div>
      </div>
    </Link>
  );
}
