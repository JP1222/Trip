import type { Metadata, Viewport } from "next";
import { GuestbookClient } from "@/components/guestbook/GuestbookClient";
import { isAdmin } from "@/lib/auth";
import { listGuestbookEntries } from "@/lib/guestbook";
import { getSiteName } from "@/lib/site";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#b89568",
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Guestbook · ${getSiteName()}`,
    description: "Leave a note for the travelers — a shared visitor book.",
  };
}

export default async function GuestbookPage() {
  const [entries, canModerate] = await Promise.all([
    listGuestbookEntries(),
    isAdmin(),
  ]);

  return (
    <div className="guestbook-page">
      <div className="guestbook-desk" aria-hidden />
      <div className="guestbook-shell">
        <h1 className="sr-only">Guestbook</h1>
        <GuestbookClient
          initialEntries={entries}
          canModerate={canModerate}
        />
      </div>
    </div>
  );
}
