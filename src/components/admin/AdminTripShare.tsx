"use client";

import { CollabShareCard } from "@/components/admin/CollabShareCard";
import {
  AdminChromeShare,
  adminChromeClusterClass,
} from "@/components/admin/AdminChrome";

/** Mounts Share into the admin top bar (next to Log out). */
export function AdminTripShare({ tripId }: { tripId: string }) {
  return (
    <AdminChromeShare>
      <div className={adminChromeClusterClass}>
        <CollabShareCard tripId={tripId} chrome />
      </div>
    </AdminChromeShare>
  );
}
