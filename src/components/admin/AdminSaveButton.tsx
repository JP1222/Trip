"use client";

export type AutosavePhase = "idle" | "saving" | "saved" | "error";

type StatusProps = {
  phase: AutosavePhase;
};

/**
 * Floating autosave toast under the chrome.
 * Saved only after a settled successful write (not mid-typing).
 */
export function AdminAutosaveStatus({ phase }: StatusProps) {
  if (phase === "idle") return null;

  const label =
    phase === "saving" ? "Saving…" : phase === "saved" ? "Saved" : "Error";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-3"
      style={{
        top: "max(3.25rem, calc(env(safe-area-inset-top, 0px) + 2.75rem))",
      }}
      aria-live="polite"
    >
      <span
        className={`rounded-full bg-white/80 px-3.5 py-1.5 text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150 ${
          phase === "saved"
            ? "text-sea"
            : phase === "error"
              ? "text-coral"
              : "text-ink-soft"
        }`}
        style={{ animation: "admin-saved-in 0.28s ease-out both" }}
      >
        {label}
      </span>
    </div>
  );
}
