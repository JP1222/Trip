"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPlanEditor } from "@/components/admin/AdminPlanEditor";
import { TripPlanner } from "@/components/TripPlanner";
import {
  clearStoredCollabToken,
  readStoredCollabToken,
  storeCollabToken,
} from "@/lib/collab";
import type { Trip } from "@/lib/types";

type Props = {
  trip: Trip;
  planned: boolean;
  dayCount: number;
  /** Server-known token presence only — actual token never sent to pure viewers */
  collabEnabled: boolean;
  /** Real token only when URL ?edit= matches (passed from server after verify) */
  verifiedToken?: string | null;
};

/**
 * Public plan: view by default; collab edit when share link token is valid.
 * Entry UI is a bottom-left floating control so the plan page stays clean.
 */
export function CollabPlanShell({
  trip,
  planned,
  dayCount,
  collabEnabled,
  verifiedToken = null,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(Boolean(verifiedToken));
  const [token, setToken] = useState(verifiedToken || "");
  const [codeInput, setCodeInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (verifiedToken) {
      storeCollabToken(trip.id, verifiedToken);
      setToken(verifiedToken);
      setEditing(true);
      const edit = searchParams.get("edit");
      if (edit) {
        const url = new URL(window.location.href);
        url.searchParams.delete("edit");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
      return;
    }
    const stored = readStoredCollabToken(trip.id);
    if (stored && collabEnabled) {
      setToken(stored);
    }
  }, [verifiedToken, trip.id, collabEnabled, searchParams]);

  // Close unlock panel on outside click / Escape
  useEffect(() => {
    if (!panelOpen || editing) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPanelOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, editing]);

  async function exchangeCapability(candidate: string): Promise<boolean> {
    // Production: hashed capability cookie. Legacy JSON backend has no table —
    // fall through to plan PATCH which still accepts the plaintext token.
    const res = await fetch(`/api/trips/${trip.id}/capability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: candidate }),
    });
    if (res.ok) return true;
    if (res.status === 404 || res.status === 503) {
      const probe = await fetch(`/api/trips/${trip.id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: candidate, tips: trip.tips || [] }),
      });
      return probe.ok;
    }
    return false;
  }

  async function tryUnlock(candidate: string) {
    const t = candidate.trim();
    if (!t || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const ok = await exchangeCapability(t);
      if (!ok) {
        setMsg("Invalid code or link.");
        setTimeout(() => setMsg(null), 2500);
        return;
      }
      storeCollabToken(trip.id, t);
      setToken(t);
      setEditing(true);
      setPanelOpen(false);
      setCodeInput("");
      setMsg("Editing unlocked");
      setTimeout(() => setMsg(null), 2000);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!verifiedToken) return;
    void exchangeCapability(verifiedToken).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exchange once per verified token
  }, [verifiedToken, trip.id]);

  function exitEdit() {
    setEditing(false);
    setPanelOpen(false);
  }

  function forgetAccess() {
    clearStoredCollabToken(trip.id);
    setToken("");
    setEditing(false);
    setPanelOpen(false);
    void fetch(`/api/trips/${trip.id}/capability`, { method: "DELETE" }).catch(
      () => undefined,
    );
    setMsg("Edit access cleared");
    setTimeout(() => setMsg(null), 2000);
  }

  const canOfferEdit = collabEnabled;

  const float = canOfferEdit ? (
    <div
      ref={panelRef}
      className="pointer-events-none fixed bottom-5 left-5 z-40 flex max-w-[min(calc(100vw-2.5rem),18rem)] flex-col items-start gap-2 sm:bottom-8 sm:left-8"
    >
      {msg && (
        <p className="pointer-events-auto rounded-full border border-sand-200/80 bg-white/95 px-3 py-1.5 text-xs text-sea shadow-[0_8px_24px_rgba(42,38,34,0.08)] backdrop-blur-sm">
          {msg}
        </p>
      )}

      {editing ? (
        <div className="pointer-events-auto w-full rounded-2xl border border-sand-200/90 bg-white/95 p-3 shadow-[0_12px_40px_rgba(42,38,34,0.14)] backdrop-blur-md">
          <div className="flex items-start gap-2">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sea/12 text-sea"
              aria-hidden
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink">Editing together</p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                Saves for everyone with the link
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={exitEdit}
              className="rounded-full border border-sand-200 px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:border-sand-300 hover:bg-sand-50"
            >
              View only
            </button>
            <button
              type="button"
              onClick={forgetAccess}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-coral transition hover:bg-coral/10"
            >
              Forget access
            </button>
          </div>
        </div>
      ) : panelOpen ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Enter collab edit code"
          className="pointer-events-auto w-full rounded-2xl border border-sand-200/90 bg-white/95 p-3.5 shadow-[0_12px_40px_rgba(42,38,34,0.14)] backdrop-blur-md"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink">Edit plan together</p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                Paste the code from your share link
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-full p-1 text-ink-muted transition hover:bg-sand-100 hover:text-ink"
              aria-label="Close"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void tryUnlock(codeInput);
            }}
          >
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Edit code"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-xs text-ink outline-none placeholder:text-ink-muted/70 focus:border-sea/40 focus:ring-2 focus:ring-sea/15"
            />
            <button
              type="submit"
              disabled={busy || !codeInput.trim()}
              className="rounded-full bg-ink px-3 py-2 text-xs font-medium text-white transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      ) : token ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-sand-200/90 bg-white/95 py-2.5 pr-4 pl-2.5 text-xs font-medium text-ink shadow-[0_10px_30px_rgba(42,38,34,0.12)] backdrop-blur-md transition hover:border-sea/35 hover:shadow-[0_12px_36px_rgba(42,38,34,0.16)] active:scale-[0.98]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sea/12 text-sea">
            <PencilIcon className="h-3.5 w-3.5" />
          </span>
          Edit plan
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-expanded={panelOpen}
          aria-controls={panelId}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-sand-200/90 bg-white/95 py-2.5 pr-4 pl-2.5 text-xs font-medium text-ink-soft shadow-[0_10px_30px_rgba(42,38,34,0.12)] backdrop-blur-md transition hover:border-sea/35 hover:text-ink hover:shadow-[0_12px_36px_rgba(42,38,34,0.16)] active:scale-[0.98]"
          title="Have a collab link? Enter the edit code"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sand-100 text-ink-muted">
            <KeyIcon className="h-3.5 w-3.5" />
          </span>
          Collaborate
        </button>
      )}
    </div>
  ) : null;

  if (editing && token) {
    return (
      <div id="plan" className="mt-10 scroll-mt-28 sm:mt-12">
        {float}
        <AdminPlanEditor trip={trip} mode="collab" collabToken={token} />
      </div>
    );
  }

  return (
    <div>
      {float}
      <TripPlanner trip={trip} planned={planned} dayCount={dayCount} />
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
