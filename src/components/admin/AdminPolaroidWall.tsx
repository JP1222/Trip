"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AdminWallPhotoEditor,
  type EditableBoardPhoto,
} from "@/components/admin/AdminWallPhotoEditor";
import { BoardWidgetLayer } from "@/components/board/BoardWidgetLayer";
import { Pushpin } from "@/components/Pushpin";
import type { WallItem, WallPhotoOrientation } from "@/lib/wall";
import type { WallObject } from "@/lib/wall-objects";
import type {
  WallAspect,
  WallDisplaySize,
  WallFrameStyle,
} from "@/lib/wall-photos";
import { swayForItem } from "@/lib/wall-sway";

export type AdminTripCard = WallItem & {
  kind: "trip";
  tripId: string;
  startDate: string;
  endDate: string;
  photoCount: number;
  commentCount: number;
};

export type AdminPhotoCard = WallItem & {
  kind: "photo";
  photoId: string;
  frameStyle?: WallFrameStyle;
  displaySize?: WallDisplaySize;
  aspect?: WallAspect;
  naturalOrientation?: WallPhotoOrientation | null;
};

export type AdminArticleCard = Omit<WallItem, "kind"> & {
  kind: "article";
  articleId: string;
  /** `none` = hidden from public wall; still shown on the admin board for editing */
  wallStyle: "polaroid" | "note" | "none";
  draft?: boolean;
};

export type AdminWallCard = AdminTripCard | AdminPhotoCard | AdminArticleCard;

/** @deprecated use AdminTripCard / AdminWallCard */
export type AdminWallCardLegacy = AdminTripCard;

function orientationFor(image: HTMLImageElement): WallPhotoOrientation {
  const ratio = image.naturalWidth / image.naturalHeight;
  if (ratio >= 1.12) return "landscape";
  if (ratio <= 0.9) return "portrait";
  return "square";
}

function slotKey(item: AdminWallCard): string {
  if (item.kind === "trip") return `trip:${item.tripId}`;
  if (item.kind === "photo") return `photo:${item.photoId}`;
  return `article:${item.articleId}`;
}

const decorPins = [
  { top: "8%", left: "6%", tone: "rose" },
  { top: "12%", left: "92%", tone: "gold" },
  { top: "78%", left: "90%", tone: "sage" },
  { top: "86%", left: "8%", tone: "blue" },
] as const;

function moveTrip(list: AdminWallCard[], fromTripId: string, toTripId: string) {
  if (fromTripId === toTripId) return list;
  const from = list.findIndex(
    (i) => i.kind === "trip" && i.tripId === fromTripId,
  );
  const to = list.findIndex((i) => i.kind === "trip" && i.tripId === toTripId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

type Props = {
  items: AdminWallCard[];
  widgets?: WallObject[];
};

export function AdminPolaroidWall({
  items: initial,
  widgets: initialWidgets = [],
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [widgets, setWidgets] = useState(initialWidgets);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [photoOrientations, setPhotoOrientations] = useState<
    Record<string, WallPhotoOrientation>
  >({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** null | newest-first | oldest-first */
  const [dateSort, setDateSort] = useState<"newest" | "oldest" | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<EditableBoardPhoto | null>(
    null,
  );

  const itemsRef = useRef(items);
  const orderBeforeDrag = useRef<string[]>([]);
  const didDrag = useRef(false);
  const dragFrom = useRef<string | null>(null);
  const lastHoverId = useRef<string | null>(null);
  const liRefs = useRef(new Map<string, HTMLElement>());
  const pendingFlip = useRef<Map<string, DOMRect> | null>(null);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  useEffect(() => {
    setWidgets(initialWidgets);
  }, [initialWidgets]);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);

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

  const persistTripOrder = useCallback(
    async (next: AdminWallCard[]) => {
      const order = next
        .filter((i): i is AdminTripCard => i.kind === "trip")
        .map((i) => i.tripId);
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

  function squeezeTo(toTripId: string) {
    const fromId = dragFrom.current;
    if (!fromId || fromId === toTripId) return;
    if (lastHoverId.current === toTripId) return;
    lastHoverId.current = toTripId;

    const current = itemsRef.current;
    const from = current.findIndex(
      (i) => i.kind === "trip" && i.tripId === fromId,
    );
    const to = current.findIndex(
      (i) => i.kind === "trip" && i.tripId === toTripId,
    );
    if (from < 0 || to < 0 || from === to) return;

    didDrag.current = true;
    pendingFlip.current = captureRects();
    setItems(moveTrip(current, fromId, toTripId));
  }

  function onDragStart(tripId: string, e: React.DragEvent) {
    didDrag.current = false;
    dragFrom.current = tripId;
    lastHoverId.current = tripId;
    orderBeforeDrag.current = itemsRef.current
      .filter((i): i is AdminTripCard => i.kind === "trip")
      .map((i) => i.tripId);
    setDragId(tripId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tripId);

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

    liRefs.current.forEach((el) => {
      el.style.transition = "";
      el.style.transform = "";
    });

    if (fromId && didDrag.current) {
      void persistTripOrder(itemsRef.current);
    }
  }

  function rememberOrientation(itemId: string, image: HTMLImageElement) {
    const next = orientationFor(image);
    setPhotoOrientations((current) =>
      current[itemId] === next ? current : { ...current, [itemId]: next },
    );
  }

  function onTripClick(tripId: string) {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    router.push(`/admin/trips/${tripId}`);
  }

  function onPhotoClick(item: AdminPhotoCard) {
    setEditingPhoto({
      id: item.photoId,
      src: item.src || "",
      caption: item.caption || "",
      meta: item.meta || "",
      frameStyle: item.frameStyle || "polaroid",
      displaySize: item.displaySize || "md",
      aspect: item.aspect || "auto",
      orientation: item.naturalOrientation ?? item.orientation ?? null,
    });
  }

  function onPhotoSaved(next: EditableBoardPhoto) {
    setItems((list) =>
      list.map((item) =>
        item.kind === "photo" && item.photoId === next.id
          ? {
              ...item,
              src: next.src || item.src,
              caption: next.caption.trim(),
              meta: next.meta.trim() || undefined,
              frameStyle: next.frameStyle,
              displaySize: next.displaySize,
              aspect: next.aspect,
              hideLabels: !next.caption.trim() && !next.meta.trim(),
              orientation:
                next.aspect !== "auto"
                  ? next.aspect
                  : next.orientation || item.orientation,
              naturalOrientation:
                next.orientation ?? item.naturalOrientation ?? null,
            }
          : item,
      ),
    );
    setEditingPhoto((current) =>
      current && current.id === next.id ? { ...current, ...next } : current,
    );
    router.refresh();
  }

  function onPhotoDeleted(id: string) {
    setItems((list) =>
      list.filter((item) => !(item.kind === "photo" && item.photoId === id)),
    );
    router.refresh();
  }

  function sortByDate() {
    const nextDir: "newest" | "oldest" =
      dateSort === "newest" ? "oldest" : "newest";
    orderBeforeDrag.current = itemsRef.current
      .filter((i): i is AdminTripCard => i.kind === "trip")
      .map((i) => i.tripId);
    pendingFlip.current = captureRects();

    const trips = itemsRef.current.filter(
      (i): i is AdminTripCard => i.kind === "trip",
    );
    const photos = itemsRef.current.filter(
      (i): i is AdminPhotoCard => i.kind === "photo",
    );
    const articles = itemsRef.current.filter(
      (i): i is AdminArticleCard => i.kind === "article",
    );
    const sortedTrips = [...trips].sort((a, b) => {
      const cmp =
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.caption.localeCompare(b.caption);
      return nextDir === "newest" ? -cmp : cmp;
    });
    // Keep board photos first, then articles, then sorted trips
    const next: AdminWallCard[] = [...photos, ...articles, ...sortedTrips];
    setDateSort(nextDir);
    setItems(next);
    void persistTripOrder(next);
  }

  const tripCount = items.filter((i) => i.kind === "trip").length;

  function openArticle(articleId: string) {
    router.push(`/admin/articles/${articleId}`);
  }

  return (
    <div className="gallery-wall gallery-wall--admin">
      <div className="cork-board">
        <div className="cork-board__surface">
          <div className="cork-board__pins" aria-hidden>
            {decorPins.map((pin, index) => (
              <span
                key={index}
                className={`cork-pin cork-pin--${pin.tone}`}
                style={{ top: pin.top, left: pin.left }}
              />
            ))}
          </div>

          <div className="cork-board__tape" aria-hidden>
            <span className="cork-tape cork-tape--a" />
            <span className="cork-tape cork-tape--b" />
          </div>

          <BoardWidgetLayer
            objects={widgets}
            editable
            onChange={setWidgets}
          />

          <ul
            className="cork-board__photos admin-wall-photos"
            onDragOver={(e) => e.preventDefault()}
          >
            <li className="wall-item wall-item--note wall-note-wrap admin-wall-tools">
              <section className="wall-note admin-wall-hint">
                <span className="wall-note__pin" aria-hidden />
                <p className="admin-wall-hint__title">Your board</p>
                <p className="admin-wall-hint__text">
                  Tap a trip or photo to edit
                </p>
                <p className="admin-wall-hint__text admin-wall-hint__text--soft">
                  + trinkets &amp; photos · drag · corners resize · top rotate
                </p>
                <div className="admin-wall-actions">
                  <button
                    type="button"
                    className="admin-wall-sort"
                    onClick={sortByDate}
                    disabled={saving || tripCount < 2}
                  >
                    {dateSort === "newest"
                      ? "Date ↑ oldest first"
                      : dateSort === "oldest"
                        ? "Date ↓ newest first"
                        : "Sort trips by date"}
                  </button>
                </div>
                {(saving || status) && (
                  <p className="admin-wall-hint__status" role="status">
                    {saving ? "Saving order…" : status}
                  </p>
                )}
              </section>
            </li>

            {items.map((item, index) => {
              const key = slotKey(item);
              const rotate = swayForItem(item.id, index);

              if (item.kind === "article" && item.wallStyle === "note") {
                return (
                  <li
                    key={key}
                    ref={(el) => {
                      if (el) liRefs.current.set(key, el);
                      else liRefs.current.delete(key);
                    }}
                    className={`admin-wall-slot wall-item wall-item--note wall-note-wrap ${
                      ready ? "" : "animate-fade-up"
                    }`}
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
                      className="block w-full text-left"
                      onClick={() => openArticle(item.articleId)}
                      aria-label={`Edit article ${item.caption}`}
                    >
                      <div
                        className="wall-note"
                        style={{ transform: `rotate(${rotate * 0.6}deg)` }}
                      >
                        <span className="wall-note__pin" aria-hidden />
                        {item.draft ? (
                          <p className="wall-note__line">Draft</p>
                        ) : null}
                        <p className="wall-note__title">{item.caption}</p>
                        {item.noteLines?.map((line) => (
                          <p key={line} className="wall-note__line">
                            {line}
                          </p>
                        ))}
                        {item.noteSignature ? (
                          <p className="wall-note__signature">
                            {item.noteSignature}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              }

              const line2 = item.meta || item.dateLabel;
              const isTrip = item.kind === "trip";
              const isArticle = item.kind === "article";
              const isDragging = isTrip && dragId === item.tripId;
              const active = hoverId === item.id && !isDragging;
              const orientation =
                item.orientation ||
                (item.src
                  ? photoOrientations[item.id] || "landscape"
                  : item.planned
                    ? "portrait"
                    : isArticle
                      ? "square"
                      : "square");
              const frameStyle =
                item.kind === "photo" ? item.frameStyle || "polaroid" : undefined;
              const displaySize =
                item.kind === "photo" ? item.displaySize || "md" : undefined;
              const showLabels =
                isTrip ||
                isArticle ||
                (frameStyle !== "borderless" &&
                  !item.hideLabels &&
                  Boolean(item.caption?.trim() || line2?.trim()));
              const printClasses = [
                `instant--${orientation}`,
                item.kind === "photo" ? "instant--standalone" : "",
                frameStyle ? `instant--frame-${frameStyle}` : "",
                displaySize ? `instant--size-${displaySize}` : "",
                item.kind === "photo" && !showLabels ? "instant--no-labels" : "",
                item.planned ? "instant--planned" : "",
                isDragging ? "admin-instant--dragging" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const altText =
                item.caption?.trim() ||
                (item.kind === "photo" ? "Board photo" : "Photo");
              const itemTypeClass =
                item.kind === "photo"
                  ? "wall-item--photo"
                  : item.kind === "article"
                    ? "wall-item--article"
                    : item.planned
                      ? "wall-item--planned"
                      : "wall-item--trip";

              return (
                <li
                  key={key}
                  ref={(el) => {
                    if (el) liRefs.current.set(key, el);
                    else liRefs.current.delete(key);
                  }}
                  className={`admin-wall-slot wall-item ${itemTypeClass} wall-item--${orientation} ${
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
                  <div
                    className={`wall-stack${active ? " wall-stack--active" : ""}`}
                    style={{
                      transform: active
                        ? "translateY(-7px) scale(1.025)"
                        : undefined,
                    }}
                  >
                    <button
                      type="button"
                      draggable={isTrip}
                      onDragStart={
                        isTrip
                          ? (e) => onDragStart(item.tripId, e)
                          : undefined
                      }
                      onDragEnter={
                        isTrip
                          ? (e) => onDragEnter(item.tripId, e)
                          : undefined
                      }
                      onDragOver={
                        isTrip
                          ? (e) => onDragOver(item.tripId, e)
                          : undefined
                      }
                      onDrop={isTrip ? onDrop : undefined}
                      onDragEnd={isTrip ? onDragEnd : undefined}
                      onMouseEnter={() => setHoverId(item.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => setHoverId(item.id)}
                      onBlur={() => setHoverId(null)}
                      onClick={() => {
                        if (isTrip) onTripClick(item.tripId);
                        else if (isArticle) openArticle(item.articleId);
                        else onPhotoClick(item);
                      }}
                      className={`instant group admin-instant ${printClasses}`}
                      style={{
                        transform: isDragging
                          ? "rotate(0deg) scale(0.96)"
                          : active
                            ? "rotate(0deg)"
                            : `rotate(${rotate}deg)`,
                        cursor: isDragging
                          ? "grabbing"
                          : isTrip
                            ? "grab"
                            : "pointer",
                      }}
                      aria-label={
                        isTrip
                          ? `Edit trip ${item.caption}. Drag to reorder.`
                          : isArticle
                            ? `Edit article ${item.caption}`
                            : `Edit board photo ${altText}`
                      }
                    >
                      <Pushpin />
                      {item.planned && (
                        <span className="instant__badge">Planning</span>
                      )}
                      {item.kind === "photo" && (
                        <span className="instant__badge instant__badge--photo">
                          Photo
                        </span>
                      )}
                      {isArticle && (
                        <span className="instant__badge instant__badge--photo">
                          {item.wallStyle === "none"
                            ? "Hidden"
                            : item.draft
                              ? "Draft"
                              : "Article"}
                        </span>
                      )}

                      <div className="instant__pad">
                        <div className="instant__image">
                          {item.src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.src}
                              alt={altText}
                              draggable={false}
                              loading={index < 6 ? "eager" : "lazy"}
                              ref={(image) => {
                                if (
                                  !item.orientation &&
                                  image?.complete &&
                                  image.naturalWidth > 0
                                ) {
                                  rememberOrientation(item.id, image);
                                }
                              }}
                              onLoad={({ currentTarget }) => {
                                if (!item.orientation) {
                                  rememberOrientation(item.id, currentTarget);
                                }
                              }}
                            />
                          ) : (
                            <div
                              className={`instant__cover${item.planned ? " instant__cover--planned" : ""}`}
                              style={
                                item.planned
                                  ? item.coverGradient
                                    ? { background: item.coverGradient }
                                    : undefined
                                  : {
                                      background:
                                        item.coverGradient ||
                                        "linear-gradient(155deg, #5a8582 0%, #2a4543 100%)",
                                    }
                              }
                            >
                              <span className="instant__cover-wash" aria-hidden />
                              {item.planned && (
                                <span className="instant__cover-art" aria-hidden>
                                  <span className="instant__cover-emoji">
                                    {item.coverEmoji || "✦"}
                                  </span>
                                  <svg
                                    className="instant__cover-route"
                                    viewBox="0 0 180 88"
                                    fill="none"
                                  >
                                    <path
                                      d="M12 67C42 25 67 79 99 45C121 22 142 27 168 12"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeDasharray="4 7"
                                    />
                                    <circle cx="12" cy="67" r="4" fill="currentColor" />
                                    <circle cx="168" cy="12" r="5" fill="currentColor" />
                                    <circle cx="168" cy="12" r="2" fill="white" />
                                  </svg>
                                </span>
                              )}
                              <span className="instant__cover-label">
                                {item.planned
                                  ? "Up next"
                                  : item.sub || (isArticle ? "Essay" : "Journey")}
                              </span>
                              <span className="instant__cover-name">
                                {item.caption}
                              </span>
                            </div>
                          )}
                          <span
                            className="instant__hint instant__hint--edit"
                            aria-hidden="true"
                          >
                            Edit <span>↗</span>
                          </span>
                        </div>
                      </div>

                      {showLabels ? (
                        <div className="instant__foot">
                          {item.caption?.trim() ? (
                            <span className="instant__caption">
                              {item.caption}
                            </span>
                          ) : null}
                          {line2?.trim() ? (
                            <span className="instant__date">{line2}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  </div>
                </li>
              );
            })}

            {items.length === 0 && (
              <li className="w-full py-16 text-center">
                <p className="font-serif text-lg italic text-[#5c4a38]/80">
                  Nothing on the board yet — tap + to pin something.
                </p>
              </li>
            )}
          </ul>
        </div>
      </div>

      {editingPhoto && (
        <AdminWallPhotoEditor
          photo={editingPhoto}
          onClose={() => setEditingPhoto(null)}
          onSaved={onPhotoSaved}
          onDeleted={onPhotoDeleted}
        />
      )}
    </div>
  );
}
