"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Trip } from "@/lib/types";

export function TripAdminForm({ trip }: { trip: Trip }) {
  const router = useRouter();
  const [title, setTitle] = useState(trip.title);
  const [subtitle, setSubtitle] = useState(trip.subtitle);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [summary, setSummary] = useState(trip.summary);
  const [members, setMembers] = useState(trip.members.join(", "));
  const [tripStatus, setTripStatus] = useState<"lived" | "planned">(
    trip.status === "planned" ? "planned" : "lived",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/trips/${trip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          destination,
          startDate,
          endDate,
          summary,
          status: tripStatus,
          members: members
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStatus("Saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-sand-200 bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-sea/40 focus:ring-1 focus:ring-sea/15";
  const label = "mb-0.5 block text-[11px] text-ink-muted";

  return (
    <form onSubmit={(e) => void onSave(e)} className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-6">
        <label className="block sm:col-span-3">
          <span className={label}>Title</span>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-3">
          <span className={label}>Destination</span>
          <input
            className={field}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Place · Region · Country"
          />
        </label>

        <label className="block sm:col-span-6">
          <span className={label}>Subtitle</span>
          <input
            className={field}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className={label}>Start</span>
          <input
            type="date"
            className={field}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>End</span>
          <input
            type="date"
            className={field}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Members</span>
          <input
            className={field}
            value={members}
            onChange={(e) => setMembers(e.target.value)}
            placeholder="Peng, Friends"
          />
        </label>

        <label className="block sm:col-span-6">
          <span className={label}>Summary</span>
          <textarea
            className={`${field} resize-y`}
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
          <span className="text-[11px] text-ink-muted">Status</span>
          {(
            [
              { id: "lived" as const, label: "Lived" },
              { id: "planned" as const, label: "Planning" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTripStatus(opt.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                tripStatus === opt.id
                  ? "bg-ink text-white"
                  : "border border-sand-200 bg-white text-ink-soft hover:border-sand-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          {error && <p className="text-xs text-coral">{error}</p>}
          {status && <p className="text-xs text-sea">{status}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-white hover:bg-ink-soft disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
