"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Pushpin } from "@/components/Pushpin";
import type { WallItem } from "@/lib/wall";

export type AdminWallCard = WallItem & {
  tripId: string;
  startDate: string;
  endDate: string;
  photoCount: number;
  commentCount: number;
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function rotateFor(id: string) {
  const angles = [-2.4, -1.2, -0.6, 0.5, 1.1, 2.0, -1.8, 0.9];
  return angles[hash(id) % angles.length];
}

function moveItem(list: AdminWallCard[], fromId: string, toId: string) {
  if (fromId === toId) return list;
  const from = list.findIndex((i) => i.tripId === fromId);
  const to = list.findIndex((i) => i.tripId === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

type Props = {
  items: AdminWallCard[];
};

export function AdminPolaroidWall({ items: initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** null | newest-first | oldest-first */
  const [dateSort, setDateSort] = useState<"newest" | "oldest" | null>(null);

  const itemsRef = useRef(items);
  const orderBeforeDrag = useRef<string[]>([]);
  const didDrag = useRef(false);
  const dragFrom = useRef<string | null>(null);
  const lastHoverId = useRef<string | null>(null);
  const liRefs = useRef(new Map<string, HTMLElement>());
  const pendingFlip = useRef<Map<string, DOMRect> | null>(null);

  itemsRef.current = items;

  useEffect(() => {
    // Allow entrance animation once, then use FLIP for reorders
    const t = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  // FLIP: after order change, animate others sliding into new slots
  useLayoutEffect(() => {
    const first = pendingFlip.current;
    if (!first) return;
    pendingFlip.current = null;

    liRefs.current.forEach((el, id) => {
      const prev = first.get(id);
      if (!prev) return;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // force reflow
      void el.offsetWidth;
      el.style.transition =
        "transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "";
    });
  }, [items]);

  const captureRects = useCallback(() => {
    const map = new Map<string, DOMRect>();
    liRefs.current.forEach((el, id) => {
      map.set(id, el.getBoundingClientRect());
    });
    return map;
  }, []);

  const persist = useCallback(
    async (next: AdminWallCard[]) => {
      const order = next.map((i) => i.tripId);
      const before = orderBeforeDrag.current.join(",");
      if (order.join(",") === before) return;

      setSaving(true);
      setStatus(null);
      try {
        const res = await fetch("/api/admin/trips/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        });
        if (!res.ok) throw new Error("failed");
        setStatus("Order saved");
        setTimeout(() => setStatus(null), 1800);
        router.refresh();
      } catch {
        setStatus("Could not save order");
      } finally {
        setSaving(false);
      }
    },
    [router],
  );

  /** Live reorder like iOS icons — others make room immediately */
  function squeezeTo(toId: string) {
    const fromId = dragFrom.current;
    if (!fromId || fromId === toId) return;
    if (lastHoverId.current === toId) return;
    lastHoverId.current = toId;

    const current = itemsRef.current;
    const from = current.findIndex((i) => i.tripId === fromId);
    const to = current.findIndex((i) => i.tripId === toId);
    if (from < 0 || to < 0 || from === to) return;

    didDrag.current = true;
    pendingFlip.current = captureRects();
    setItems(moveItem(current, fromId, toId));
  }

  function onDragStart(tripId: string, e: React.DragEvent) {
    didDrag.current = false;
    dragFrom.current = tripId;
    lastHoverId.current = tripId;
    orderBeforeDrag.current = itemsRef.current.map((i) => i.tripId);
    setDragId(tripId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tripId);

    // Semi-transparent ghost (iOS-like floating icon)
    if (e.currentTarget instanceof HTMLElement) {
      const ghost = e.currentTarget.cloneNode(true) as HTMLElement;
      ghost.style.position = "absolute";
      ghost.style.top = "-9999px";
      ghost.style.left = "0";
      ghost.style.width = `${e.currentTarget.offsetWidth}px`;
      ghost.style.transform = "rotate(0deg) scale(1.08)";
      ghost.style.opacity = "0.95";
      ghost.style.boxShadow =
        "0 12px 40px rgba(40,30,15,0.35), 0 4px 12px rgba(40,30,15,0.2)";
      ghost.style.pointerEvents = "none";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(
        ghost,
        e.currentTarget.offsetWidth / 2,
        e.currentTarget.offsetHeight / 3,
      );
      requestAnimationFrame(() => {
        ghost.remove();
      });
    }
  }

  function onDragOver(tripId: string, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    squeezeTo(tripId);
  }

  function onDragEnter(tripId: string, e: React.DragEvent) {
    e.preventDefault();
    squeezeTo(tripId);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDragEnd() {
    const fromId = dragFrom.current;
    setDragId(null);
    dragFrom.current = null;
    lastHoverId.current = null;

    // Clear any leftover FLIP transforms
    liRefs.current.forEach((el) => {
      el.style.transition = "";
      el.style.transform = "";
    });

    if (fromId && didDrag.current) {
      void persist(itemsRef.current);
    }
  }

  function onCardClick(tripId: string) {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    router.push(`/admin/trips/${tripId}`);
  }

  function sortByDate() {
    const nextDir: "newest" | "oldest" =
      dateSort === "newest" ? "oldest" : "newest";
    orderBeforeDrag.current = itemsRef.current.map((i) => i.tripId);
    pendingFlip.current = captureRects();
    const next = [...itemsRef.current].sort((a, b) => {
      const cmp =
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.caption.localeCompare(b.caption);
      return nextDir === "newest" ? -cmp : cmp;
    });
    setDateSort(nextDir);
    setItems(next);
    void persist(next);
  }

  return (
    <div className="gallery-wall gallery-wall--admin">
      <div className="cork-board">
        <div className="cork-board__surface">
          <div className="admin-wall-hint">
            <p className="admin-wall-hint__title">Admin wall</p>
            <p className="admin-wall-hint__text">
              Hold &amp; drag — others slide aside · Tap to edit
            </p>
            <div className="admin-wall-actions">
              <button
                type="button"
                className="admin-wall-sort"
                onClick={sortByDate}
                disabled={saving || items.length < 2}
              >
                {dateSort === "newest"
                  ? "Date ↑ oldest first"
                  : dateSort === "oldest"
                    ? "Date ↓ newest first"
                    : "Sort by date"}
              </button>
            </div>
            {(saving || status) && (
              <p className="admin-wall-hint__status" role="status">
                {saving ? "Saving order…" : status}
              </p>
            )}
          </div>

          <ul
            className="cork-board__photos admin-wall-photos"
            onDragOver={(e) => e.preventDefault()}
          >
            {items.map((item, index) => {
              const rotate = rotateFor(item.id);
              const line2 = item.meta || item.dateLabel;
              const isDragging = dragId === item.tripId;

              return (
                <li
                  key={item.tripId}
                  ref={(el) => {
                    if (el) liRefs.current.set(item.tripId, el);
                    else liRefs.current.delete(item.tripId);
                  }}
                  className={`admin-wall-slot ${
                    ready ? "" : "animate-fade-up"
                  } ${isDragging ? "admin-wall-slot--source" : ""}`}
                  style={
                    ready
                      ? undefined
                      : {
                          animationDelay: `${Math.min(index * 0.05, 0.4)}s`,
                        }
                  }
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(item.tripId, e)}
                    onDragEnter={(e) => onDragEnter(item.tripId, e)}
                    onDragOver={(e) => onDragOver(item.tripId, e)}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    onClick={() => onCardClick(item.tripId)}
                    className={`instant group admin-instant ${
                      item.planned ? "instant--planned" : ""
                    } ${isDragging ? "admin-instant--dragging" : ""}`}
                    style={{
                      // Source slot: keep tilt subtle; ghost follows cursor
                      transform: isDragging
                        ? "rotate(0deg) scale(0.96)"
                        : `rotate(${rotate}deg)`,
                      cursor: isDragging ? "grabbing" : "grab",
                    }}
                    aria-label={`Edit ${item.caption}. Drag to reorder.`}
                  >
                    <Pushpin />
                    {item.planned && (
                      <span className="instant__badge">Planning</span>
                    )}

                    <div className="instant__pad">
                      <div className="instant__image">
                        {item.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.src}
                            alt={item.caption}
                            draggable={false}
                            loading={index < 6 ? "eager" : "lazy"}
                          />
                        ) : (
                          <div
                            className={`instant__cover${item.planned ? " instant__cover--planned" : ""}`}
                            style={
                              item.planned
                                ? undefined
                                : {
                                    background:
                                      "linear-gradient(155deg, #6b5c4a 0%, #2e2820 100%)",
                                  }
                            }
                          >
                            <span className="instant__cover-wash" aria-hidden />
                            <span className="instant__cover-label">
                              {item.planned
                                ? "Up next"
                                : item.sub || "Journey"}
                            </span>
                            <span className="instant__cover-name">
                              {item.caption}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="instant__foot">
                      <span className="instant__caption">{item.caption}</span>
                      {line2 && (
                        <span className="instant__date">{line2}</span>
                      )}
                      <span className="admin-instant__meta">
                        {item.photoCount} photos
                        {item.commentCount > 0
                          ? ` · ${item.commentCount} notes`
                          : ""}
                      </span>
                    </div>

                    <span className="admin-instant__edit" aria-hidden>
                      Edit
                    </span>
                  </button>
                </li>
              );
            })}

            {items.length === 0 && (
              <li className="w-full py-16 text-center">
                <p className="font-serif text-lg italic text-[#5c4a38]/80">
                  No trips yet.
                </p>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
