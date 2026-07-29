"use client";

import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();

  if (pathname === "/" || pathname.startsWith("/admin")) return null;

  return (
    <footer className="mt-auto border-t border-sand-200/70 bg-sand-100/50">
      <div className="mx-auto flex max-w-6xl justify-end px-5 py-6 sm:px-8">
        <p className="text-xs text-ink-muted">© {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
