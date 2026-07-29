"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

type ChromeCtx = {
  setRightExtra: (node: ReactNode | null) => void;
};

const AdminChromeContext = createContext<ChromeCtx | null>(null);

/** Register content next to Log out (e.g. Share edit on trip pages). */
export function useAdminChromeRight(node: ReactNode | null) {
  const ctx = useContext(AdminChromeContext);
  const setRightExtra = ctx?.setRightExtra;
  useEffect(() => {
    if (!setRightExtra) return;
    setRightExtra(node);
    return () => setRightExtra(null);
  }, [setRightExtra, node]);
}

export function AdminChrome({ children }: { children: ReactNode }) {
  const [rightExtra, setRightExtraState] = useState<ReactNode | null>(null);
  const setRightExtra = useCallback((node: ReactNode | null) => {
    setRightExtraState(node);
  }, []);
  const value = useMemo(() => ({ setRightExtra }), [setRightExtra]);

  return (
    <AdminChromeContext.Provider value={value}>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-3 sm:px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
        }}
      >
        <Link
          href="/"
          aria-label="Back to wall"
          className="pointer-events-auto inline-flex h-9 items-center gap-0.5 rounded-full bg-white/60 pl-2 pr-3.5 text-[13px] font-medium tracking-tight text-ink/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150 transition hover:bg-white/75 active:scale-[0.96] sm:h-10 sm:pl-2.5 sm:pr-4 sm:text-[15px]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="-ml-0.5 text-ink/80"
            aria-hidden
          >
            <path
              d="M14.5 6.5L9 12l5.5 5.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Wall
        </Link>

        <div className="pointer-events-auto flex items-center gap-1.5">
          {rightExtra}
          <div className="rounded-full bg-white/60 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150">
            <AdminLogoutButton />
          </div>
        </div>
      </div>
      {children}
    </AdminChromeContext.Provider>
  );
}
