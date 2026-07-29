"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PhotoMeta } from "@/lib/types";
import { photoPublicUrl } from "@/lib/photos-client";

export function AdminPhotos({
  tripId,
  photos: initial,
  coverImage,
}: {
  tripId: string;
  photos: PhotoMeta[];
  coverImage?: string;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const [cover, setCover] = useState(coverImage || "");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(photoId: string) {
    if (!confirm("Delete this photo?")) return;
    setBusyId(photoId);
    const res = await fetch(
      `/api/admin/trips/${tripId}/photos/${photoId}`,
      { method: "DELETE" },
    );
    setBusyId(null);
    if (res.ok) {
      setPhotos((p) => p.filter((x) => x.id !== photoId));
      router.refresh();
    } else {
      alert("Could not delete");
    }
  }

  async function saveCaption(photoId: string, caption: string) {
    setBusyId(photoId);
    const res = await fetch(
      `/api/admin/trips/${tripId}/photos/${photoId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      },
    );
    setBusyId(null);
    if (res.ok) {
      const updated = (await res.json()) as PhotoMeta;
      setPhotos((list) =>
        list.map((p) => (p.id === photoId ? updated : p)),
      );
      router.refresh();
    }
  }

  async function setAsCover(url: string) {
    setBusyId("cover");
    const res = await fetch(`/api/admin/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImage: url }),
    });
    setBusyId(null);
    if (res.ok) {
      setCover(url);
      router.refresh();
    } else {
      alert("Could not set cover");
    }
  }

  if (photos.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No uploaded photos yet. Friends add them from the public trip page.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {photos.map((p) => {
        const url = photoPublicUrl(p.tripId, p.filename);
        const isCover = cover === url;
        return (
          <li
            key={p.id}
            className="flex flex-col gap-3 rounded-2xl border border-sand-200 bg-white p-3 sm:flex-row sm:items-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={p.caption || p.originalName}
              className="h-24 w-24 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm text-ink">
                <span className="font-medium">{p.uploader}</span>
                <span className="text-ink-muted"> · {p.originalName}</span>
                {isCover && (
                  <span className="ml-2 rounded-full bg-sea/10 px-2 py-0.5 text-xs text-sea">
                    On polaroid
                  </span>
                )}
              </p>
              <input
                defaultValue={p.caption || ""}
                placeholder="Caption"
                className="w-full rounded-lg border border-sand-200 px-3 py-1.5 text-sm"
                id={`cap-${p.id}`}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === p.id || isCover || busyId === "cover"}
                  className="rounded-full border border-sand-300 px-3 py-1 text-xs text-ink-soft hover:border-sea disabled:opacity-50"
                  onClick={() => void setAsCover(url)}
                >
                  {isCover ? "On polaroid" : "Use on polaroid"}
                </button>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  className="rounded-full border border-sand-300 px-3 py-1 text-xs text-ink-soft hover:border-sea"
                  onClick={() => {
                    const el = document.getElementById(
                      `cap-${p.id}`,
                    ) as HTMLInputElement | null;
                    void saveCaption(p.id, el?.value || "");
                  }}
                >
                  Save caption
                </button>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  className="rounded-full border border-coral/40 px-3 py-1 text-xs text-coral hover:bg-coral/10"
                  onClick={() => void remove(p.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
