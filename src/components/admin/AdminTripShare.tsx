"use client";

import { useMemo } from "react";
import { CollabShareCard } from "@/components/admin/CollabShareCard";
import { useAdminChromeRight } from "@/components/admin/AdminChrome";

/** Mounts Share edit into the admin top bar (next to Log out). */
export function AdminTripShare({
  tripId,
  collabToken,
}: {
  tripId: string;
  collabToken?: string;
}) {
  const node = useMemo(
    () => (
      <div className="rounded-full bg-white/60 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150">
        <CollabShareCard
          tripId={tripId}
          collabToken={collabToken}
          chrome
        />
      </div>
    ),
    [tripId, collabToken],
  );

  useAdminChromeRight(node);
  return null;
}
