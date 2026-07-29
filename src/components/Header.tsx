"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const pill =
  "pointer-events-auto inline-flex h-9 items-center rounded-full bg-white/55 text-[15px] font-medium tracking-tight text-ink/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150 transition-[transform,background-color,box-shadow] duration-200 hover:bg-white/72 active:scale-[0.96] sm:h-10";

/**
 * Public site chrome (admin has AdminChrome).
 * Home → Admin (right). Trip pages → Wall (left).
 */
export function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return null;

  if (isHome) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-end gap-3 px-3 sm:px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
        }}
      >
        <Link
          href="/admin"
          className={`${pill} px-3.5 sm:px-4`}
          aria-label="Open admin"
        >
          Admin
        </Link>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-start px-3 sm:px-5"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
      }}
    >
      <Link
        href="/"
        aria-label="Back to wall"
        className={`${pill} gap-0.5 pl-2 pr-3.5 sm:pl-2.5 sm:pr-4`}
      >
        <svg
          width="20"
          height="20"
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
        <span>Wall</span>
      </Link>
    </div>
  );
}
