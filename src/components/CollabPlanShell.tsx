"use client";

import { useEffect, useMemo, useState } from "react";
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
 * Pattern: Wanderlog-style “shared trip link” without full accounts.
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
  const [editing, setEditing] = useState(Boolean(verifiedToken));
  const [token, setToken] = useState(verifiedToken || "");
  const [codeInput, setCodeInput] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (verifiedToken) {
      storeCollabToken(trip.id, verifiedToken);
      setToken(verifiedToken);
      setEditing(true);
      // Clean token from URL after storing (share link still works once)
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
      // Re-verify by attempting to keep edit mode — server will 401 on save if revoked
      setToken(stored);
    }
  }, [verifiedToken, trip.id, collabEnabled, searchParams]);

  async function tryUnlock(candidate: string) {
    const t = candidate.trim();
    if (!t) return;
    // Soft unlock: probe plan endpoint with empty patch is not allowed;
    // we store and enter edit — first save validates.
    // Better: HEAD or small GET. For now match against enabling presence
    // and let save validate — probe with empty days fail.
    // Probe: PATCH with only tips same as current
    const res = await fetch(`/api/trips/${trip.id}/plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t, tips: trip.tips || [] }),
    });
    if (!res.ok) {
      setMsg("Invalid edit link or code.");
      setTimeout(() => setMsg(null), 2500);
      return;
    }
    storeCollabToken(trip.id, t);
    setToken(t);
    setEditing(true);
    setShowCode(false);
    setMsg("Editing unlocked");
    setTimeout(() => setMsg(null), 2000);
    router.refresh();
  }

  function exitEdit() {
    setEditing(false);
    // keep token stored so they can re-enter without paste
  }

  function forgetAccess() {
    clearStoredCollabToken(trip.id);
    setToken("");
    setEditing(false);
    setMsg("Edit access cleared on this device");
    setTimeout(() => setMsg(null), 2000);
  }

  const canOfferEdit = collabEnabled;

  const bar = (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-sand-200/80 bg-white/70 px-3 py-2 sm:px-4">
      {editing ? (
        <>
          <span className="rounded-full bg-sea/12 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-sea uppercase">
            Editing together
          </span>
          <span className="text-xs text-ink-muted">
            Changes save for everyone with the link
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exitEdit}
              className="rounded-full border border-sand-200 px-3 py-1 text-xs text-ink-soft hover:border-sand-300"
            >
              View only
            </button>
            <button
              type="button"
              onClick={forgetAccess}
              className="rounded-full px-3 py-1 text-xs text-coral hover:bg-coral/10"
            >
              Forget access
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="text-xs text-ink-muted">
            {canOfferEdit
              ? "Have a collab link? Edit the plan & budget together."
              : "Viewing plan"}
          </span>
          {canOfferEdit && (
            <div className="ml-auto flex flex-wrap gap-2">
              {token ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-ink-soft"
                >
                  Edit plan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCode((v) => !v)}
                  className="rounded-full border border-sand-200 bg-white px-3 py-1 text-xs font-medium text-ink-soft hover:border-sea/40 hover:text-sea"
                >
                  Enter edit code
                </button>
              )}
            </div>
          )}
        </>
      )}
      {msg && <p className="w-full text-xs text-sea">{msg}</p>}
      {showCode && !editing && (
        <div className="flex w-full flex-wrap gap-2 pt-1">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Paste token from share link"
            className="min-w-[12rem] flex-1 rounded-xl border border-sand-200 px-3 py-1.5 text-xs text-ink outline-none focus:border-sea/40"
          />
          <button
            type="button"
            onClick={() => void tryUnlock(codeInput)}
            className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white"
          >
            Unlock
          </button>
        </div>
      )}
    </div>
  );

  if (editing && token) {
    return (
      <div id="plan" className="mt-10 scroll-mt-28 sm:mt-12">
        {bar}
        <AdminPlanEditor
          trip={trip}
          mode="collab"
          collabToken={token}
        />
      </div>
    );
  }

  return (
    <div>
      {canOfferEdit && bar}
      <TripPlanner trip={trip} planned={planned} dayCount={dayCount} />
    </div>
  );
}
