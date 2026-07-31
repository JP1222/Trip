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
  AdminChromeActions,
  adminChromePillClass,
} from "@/components/admin/AdminChrome";
import {
  AdminWallPhotoEditor,
  type EditableBoardPhoto,
} from "@/components/admin/AdminWallPhotoEditor";
import { BoardWidgetLayer } from "@/components/board/BoardWidgetLayer";
import { WallStickyNote } from "@/components/board/WallStickyNote";
import { Pushpin } from "@/components/Pushpin";
import { parseStickyNoteLabel } from "@/lib/sticky-note";
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
  /** ISO date for board “Sort by date” (published → updated → created). */
  sortDate?: string;
};

/** Grid sticky — one cell in the polaroid row (not a floating trinket). */
export type AdminNoteCard = Omit<WallItem, "kind"> & {
  kind: "note";
  noteId: string;
  label: string;
};

export type AdminWallCard =
  | AdminTripCard
  | AdminPhotoCard
  | AdminArticleCard
  | AdminNoteCard;

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
  if (item.kind === "note") return `note:${item.noteId}`;
  return `article:${item.articleId}`;
}

function isDatedPin(
  item: AdminWallCard,
): item is AdminTripCard | AdminArticleCard {
  return item.kind === "trip" || item.kind === "article";
}

/** Stable ISO-ish key for sorting trips + articles together. */
function pinSortDate(item: AdminTripCard | AdminArticleCard): string {
  if (item.kind === "trip") return item.startDate || item.endDate || "";
  return item.sortDate || "";
}

const decorPins = [
  { top: "8%", left: "6%", tone: "rose" },
  { top: "12%", left: "92%", tone: "gold" },
  { top: "78%", left: "90%", tone: "sage" },
  { top: "86%", left: "8%", tone: "blue" },
] as const;

function moveSlot(list: AdminWallCard[], fromKey: string, toKey: string) {
  if (fromKey === toKey) return list;
  const from = list.findIndex((i) => slotKey(i) === fromKey);
  const to = list.findIndex((i) => slotKey(i) === toKey);
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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

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

  const persistWallOrder = useCallback(
    async (next: AdminWallCard[]) => {
      const order = next.map(slotKey);
      const before = orderBeforeDrag.current.join(",");
      if (order.join(",") === before) return;

      setSaving(true);
      setStatus(null);
      try {
        const res = await fetch("/api/admin/wall/reorder", {
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

  function squeezeTo(toKey: string) {
    const fromKey = dragFrom.current;
    if (!fromKey || fromKey === toKey) return;
    if (lastHoverId.current === toKey) return;
    lastHoverId.current = toKey;

    const current = itemsRef.current;
    const from = current.findIndex((i) => slotKey(i) === fromKey);
    const to = current.findIndex((i) => slotKey(i) === toKey);
    if (from < 0 || to < 0 || from === to) return;

    didDrag.current = true;
    pendingFlip.current = captureRects();
    setItems(moveSlot(current, fromKey, toKey));
  }

  function onDragStart(key: string, e: React.DragEvent) {
    didDrag.current = false;
    dragFrom.current = key;
    lastHoverId.current = key;
    orderBeforeDrag.current = itemsRef.current.map(slotKey);
    setDragId(key);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);

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

  function onDragOver(key: string, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    squeezeTo(key);
  }

  function onDragEnter(key: string, e: React.DragEvent) {
    e.preventDefault();
    squeezeTo(key);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDragEnd() {
    const fromKey = dragFrom.current;
    setDragId(null);
    dragFrom.current = null;
    lastHoverId.current = null;

    liRefs.current.forEach((el) => {
      el.style.transition = "";
      el.style.transform = "";
    });

    if (fromKey && didDrag.current) {
      void persistWallOrder(itemsRef.current);
    }
  }

  function rememberOrientation(itemId: string, image: HTMLImageElement) {
    const next = orientationFor(image);
    setPhotoOrientations((current) =>
      current[itemId] === next ? current : { ...current, [itemId]: next },
    );
  }

  function suppressClickAfterDrag() {
    if (!didDrag.current) return false;
    didDrag.current = false;
    return true;
  }

  function onTripClick(tripId: string) {
    if (suppressClickAfterDrag()) return;
    router.push(`/admin/trips/${tripId}`);
  }

  function onPhotoClick(item: AdminPhotoCard) {
    if (suppressClickAfterDrag()) return;
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
    orderBeforeDrag.current = itemsRef.current.map(slotKey);
    pendingFlip.current = captureRects();

    const current = itemsRef.current;
    const dated = current.filter(isDatedPin);
    const sortedDated = [...dated].sort((a, b) => {
      const cmp =
        pinSortDate(a).localeCompare(pinSortDate(b)) ||
        a.caption.localeCompare(b.caption) ||
        slotKey(a).localeCompare(slotKey(b));
      return nextDir === "newest" ? -cmp : cmp;
    });
    let datedIdx = 0;
    // Keep notes/photos fixed; reshuffle trips + articles into those slots.
    const next = current.map((item) =>
      isDatedPin(item) ? sortedDated[datedIdx++]! : item,
    );
    setDateSort(nextDir);
    setItems(next);
    void persistWallOrder(next);
  }

  const datedPinCount = items.filter(isDatedPin).length;

  function openArticle(articleId: string) {
    if (suppressClickAfterDrag()) return;
    router.push(`/admin/articles/${articleId}`);
  }

  async function saveBoardNote(noteId: string, label: string) {
    try {
      const res = await fetch(`/api/admin/wall/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("failed");
      const { title, lines, signature } = parseStickyNoteLabel(label);
      setItems((list) =>
        list.map((item) =>
          item.kind === "note" && item.noteId === noteId
            ? {
                ...item,
                label,
                caption: title,
                noteLines: lines,
                noteSignature: signature,
              }
            : item,
        ),
      );
      setEditingNoteId(null);
      setStatus("Note saved");
      setTimeout(() => setStatus(null), 1800);
      router.refresh();
    } catch {
      setStatus("Could not save note");
    }
  }

  const sortLabel =
    dateSort === "newest"
      ? "Oldest first"
      : dateSort === "oldest"
        ? "Newest first"
        : "Sort by date";

  return (
    <div className="gallery-wall gallery-wall--admin">
      <AdminChromeActions>
        <button
          type="button"
          className={adminChromePillClass}
          onClick={sortByDate}
          disabled={saving || datedPinCount < 2}
          title="Sort trips and articles by date"
        >
          {sortLabel}
        </button>
        {(saving || status) && (
          <p
            className="rounded-full bg-white/70 px-3 py-1.5 text-[12px] font-medium text-ink-soft shadow-sm ring-1 ring-black/[0.06]"
            role="status"
          >
            {saving ? "Saving…" : status}
          </p>
        )}
      </AdminChromeActions>
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
            {items.map((item, index) => {
              const key = slotKey(item);
              const rotate = swayForItem(item.id, index);

              if (item.kind === "note") {
                const isDragging = dragId === key;
                const editing = editingNoteId === item.noteId;
                return (
                  <li
                    key={key}
                    ref={(el) => {
                      if (el) liRefs.current.set(key, el);
                      else liRefs.current.delete(key);
                    }}
                    className={`admin-wall-slot wall-item wall-item--note wall-note-wrap ${
                      ready ? "" : "animate-fade-up"
                    } ${isDragging ? "admin-wall-slot--source" : ""}`}
                    style={
                      ready
                        ? undefined
                        : {
                            animationDelay: `${Math.min(index * 0.05, 0.4)}s`,
                          }
                    }
                    onDragEnter={(e) => onDragEnter(key, e)}
                    onDragOver={(e) => onDragOver(key, e)}
                    onDrop={onDrop}
                  >
                    <div
                      className="admin-grid-note"
                      draggable={!editing}
                      onDragStart={(e) => {
                        if (editing) {
                          e.preventDefault();
                          return;
                        }
                        onDragStart(key, e);
                      }}
                      onDragEnd={onDragEnd}
                      style={{
                        transform: isDragging
                          ? "rotate(0deg) scale(0.96)"
                          : `rotate(${rotate * 0.6}deg)`,
                        cursor: editing
                          ? "default"
                          : isDragging
                            ? "grabbing"
                            : "grab",
                      }}
                    >
                      <WallStickyNote
                        label={item.label}
                        editing={editing}
                        onEditStart={() => {
                          if (suppressClickAfterDrag()) return;
                          setEditingNoteId(item.noteId);
                        }}
                        onSave={(next) => void saveBoardNote(item.noteId, next)}
                        onCancel={() => setEditingNoteId(null)}
                      />
                    </div>
                  </li>
                );
              }

              if (item.kind === "article" && item.wallStyle === "note") {
                const isDragging = dragId === key;
                return (
                  <li
                    key={key}
                    ref={(el) => {
                      if (el) liRefs.current.set(key, el);
                      else liRefs.current.delete(key);
                    }}
                    className={`admin-wall-slot wall-item wall-item--note wall-note-wrap ${
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
                      className="block w-full cursor-grab text-left active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => onDragStart(key, e)}
                      onDragEnter={(e) => onDragEnter(key, e)}
                      onDragOver={(e) => onDragOver(key, e)}
                      onDrop={onDrop}
                      onDragEnd={onDragEnd}
                      onClick={() => openArticle(item.articleId)}
                      aria-label={`Edit article ${item.caption}. Drag to reorder.`}
                    >
                      <div
                        className="wall-note"
                        style={{
                          transform: isDragging
                            ? "rotate(0deg) scale(0.96)"
                            : `rotate(${rotate * 0.6}deg)`,
                        }}
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
              const isDragging = dragId === key;
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
                      draggable
                      onDragStart={(e) => onDragStart(key, e)}
                      onDragEnter={(e) => onDragEnter(key, e)}
                      onDragOver={(e) => onDragOver(key, e)}
                      onDrop={onDrop}
                      onDragEnd={onDragEnd}
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
                        cursor: isDragging ? "grabbing" : "grab",
                      }}
                      aria-label={
                        isTrip
                          ? `Edit trip ${item.caption}. Drag to reorder.`
                          : isArticle
                            ? `Edit article ${item.caption}. Drag to reorder.`
                            : `Edit board photo ${altText}. Drag to reorder.`
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
