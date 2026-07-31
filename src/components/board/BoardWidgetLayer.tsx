"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AdminChromeActions,
  adminChromePillClass,
} from "@/components/admin/AdminChrome";
import { GuestbookBook } from "@/components/guestbook/GuestbookBook";
import {
  decorColorOptions,
  getDecorById,
  isGuestbookCatalogId,
} from "@/lib/board-decor";
import type { WallObject } from "@/lib/wall-object-layout";
import {
  WALL_LAYOUT_BREAKPOINT,
  wallLayoutFromWidth,
  wallObjectTransform,
  withWallObjectTransform,
  type WallLayout,
} from "@/lib/wall-object-layout";
import { BoardDecorIcon } from "./BoardDecorIcon";
import { WallStickyNote } from "./WallStickyNote";

type Props = {
  objects: WallObject[];
  /** Admin: drag / resize / rotate; click a sticky to edit text */
  editable?: boolean;
  onChange?: (objects: WallObject[]) => void;
  /** Public guestbook link target (omit on admin — drag only). */
  guestbookHref?: string;
};

type MoveState = {
  mode: "move";
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  surfaceW: number;
  surfaceH: number;
};

type ResizeState = {
  mode: "resize";
  id: string;
  pointerId: number;
  originScale: number;
  centerX: number;
  centerY: number;
  startDist: number;
};

type RotateState = {
  mode: "rotate";
  id: string;
  pointerId: number;
  originRotate: number;
  centerX: number;
  centerY: number;
  startAngle: number;
};

type DragState = MoveState | ResizeState | RotateState;

const MIN_SCALE = 0.35;
const MAX_SCALE = 3.5;

/**
 * Free-positioned trinkets on the cork surface (vinyl, pins, washi…).
 * Coordinates are % of the surface box; scale is proportional (aspect locked).
 */
export function BoardWidgetLayer({
  objects: initial,
  editable = false,
  onChange,
  guestbookHref,
}: Props) {
  const router = useRouter();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [objects, setObjects] = useState(initial);
  const [layout, setLayout] = useState<WallLayout>("desktop");
  const layoutRef = useRef<WallLayout>(layout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  /** Public wall: CSS :hover can't fire (pointer-events:none for click-through) */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** Public press feedback (guestbook tap / click) */
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  /** Double-click recolor panel for pins / clips / trinkets / sticky paper. */
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  /**
   * Defer resize/rotate chrome so the 2nd click of a double-click still
   * hits the widget (native dblclick often dies when handles appear).
   */
  const [chromeReadyId, setChromeReadyId] = useState<string | null>(null);
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const objectsRef = useRef(objects);

  useEffect(() => {
    setObjects(initial);
  }, [initial]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(
      `(max-width: ${WALL_LAYOUT_BREAKPOINT - 1}px)`,
    );
    function sync() {
      setLayout(wallLayoutFromWidth(window.innerWidth));
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const root =
      surfaceRef.current?.closest(".cork-board__surface") ?? null;
    setPortalRoot(root instanceof HTMLElement ? root : null);
  }, []);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  // Show transform handles only after a short settle — keeps double-click reliable.
  useEffect(() => {
    if (!editable || !selectedId) {
      setChromeReadyId(null);
      return;
    }
    if (editingNoteId === selectedId || editingColorId === selectedId) {
      setChromeReadyId(selectedId);
      return;
    }
    setChromeReadyId(null);
    const t = window.setTimeout(() => setChromeReadyId(selectedId), 320);
    return () => window.clearTimeout(t);
  }, [editable, selectedId, editingNoteId, editingColorId]);

  const beginWidgetEdit = useCallback(
    (obj: WallObject) => {
      if (isGuestbookCatalogId(obj.catalogId)) {
        router.push("/admin/guestbook");
        return;
      }
      if (obj.kind === "note") {
        setSelectedId(obj.id);
        setEditingNoteId(obj.id);
        setEditingColorId(obj.id);
        setChromeReadyId(obj.id);
        return;
      }
      if (decorColorOptions(obj.catalogId).length > 1) {
        setSelectedId(obj.id);
        setEditingColorId(obj.id);
        setChromeReadyId(obj.id);
      }
    },
    [router],
  );

  /**
   * Public homepage: hit-test widget bounds on pointer move so hover
   * animations work even though the layer has pointer-events: none
   * (clicks still reach polaroids underneath).
   */
  useEffect(() => {
    if (editable) return;
    if (typeof window === "undefined") return;

    const el =
      surfaceRef.current?.closest(".cork-board__surface") ??
      surfaceRef.current?.closest(".gallery-wall") ??
      surfaceRef.current;
    if (!el || !(el instanceof HTMLElement)) return;
    const root: HTMLElement = el;

    let raf = 0;
    let lastX = -1;
    let lastY = -1;

    function hitTest(clientX: number, clientY: number) {
      // Prefer real topmost target: skip widgets buried under polaroids.
      const stack = document.elementsFromPoint(clientX, clientY);
      for (const node of stack) {
        if (!(node instanceof HTMLElement)) continue;
        const widget = node.closest(".board-widget");
        if (widget instanceof HTMLElement && widget.dataset.widgetId) {
          const pe = window.getComputedStyle(widget).pointerEvents;
          if (pe !== "none") {
            setHoveredId(widget.dataset.widgetId);
            return;
          }
        }
        if (
          node.closest(
            "[data-wall-card], .wall-stack, .instant, .wall-item--note, .admin-grid-note",
          )
        ) {
          setHoveredId(null);
          return;
        }
      }

      // Geometry hit-test for pointer-events:none trinkets in cork gaps
      // (include front portal guestbook + back-layer decor).
      const surface =
        surfaceRef.current?.closest(".cork-board__surface") ??
        surfaceRef.current;
      if (!surface) {
        setHoveredId(null);
        return;
      }
      const nodes = surface.querySelectorAll<HTMLElement>(".board-widget");
      let bestId: string | null = null;
      let bestZ = -Infinity;
      nodes.forEach((node) => {
        const id = node.dataset.widgetId;
        if (!id) return;
        const r = node.getBoundingClientRect();
        const pad = 4;
        if (
          clientX < r.left - pad ||
          clientX > r.right + pad ||
          clientY < r.top - pad ||
          clientY > r.bottom + pad
        ) {
          return;
        }
        const z = Number(node.dataset.widgetZ || 0);
        if (z >= bestZ) {
          bestZ = z;
          bestId = id;
        }
      });
      setHoveredId(bestId);
    }

    function onMove(e: Event) {
      const pe = e as PointerEvent;
      lastX = pe.clientX;
      lastY = pe.clientY;
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        hitTest(lastX, lastY);
      });
    }

    function onLeave() {
      setHoveredId(null);
      setPressedId(null);
    }

    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [editable, objects]);

  const persist = useCallback(
    async (
      id: string,
      patch: Partial<{
        x: number;
        y: number;
        rotate: number;
        scale: number;
        label: string;
        catalogId: string;
      }>,
    ) => {
      try {
        const res = await fetch(`/api/admin/wall/objects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layout: layoutRef.current,
            x: patch.x,
            y: patch.y,
            rotate: patch.rotate,
            scale: patch.scale,
            label: patch.label,
            catalogId: patch.catalogId,
            bringToFront: true,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as WallObject;
        setObjects((list) => {
          const next = list.map((o) => (o.id === id ? { ...o, ...data } : o));
          onChange?.(next);
          return next;
        });
      } catch {
        // keep local position
      }
    },
    [onChange],
  );

  const applyCatalogId = useCallback(
    (id: string, catalogId: string) => {
      setObjects((list) => {
        const next = list.map((o) =>
          o.id === id ? { ...o, catalogId, kind: getDecorById(catalogId)?.category ?? o.kind } : o,
        );
        onChange?.(next);
        return next;
      });
      void persist(id, { catalogId });
    },
    [onChange, persist],
  );

  const removeObject = useCallback(
    async (id: string) => {
      if (!editable) return;
      const target = objectsRef.current.find((o) => o.id === id);
      if (target && isGuestbookCatalogId(target.catalogId)) return;
      if (!confirm("Remove this from the board?")) return;
      try {
        const res = await fetch(`/api/admin/wall/objects/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) return;
        setObjects((list) => {
          const next = list.filter((o) => o.id !== id);
          onChange?.(next);
          return next;
        });
        setSelectedId(null);
        setEditingNoteId(null);
        setEditingColorId(null);
        setChromeReadyId(null);
      } catch {
        // ignore
      }
    },
    [editable, onChange],
  );

  useEffect(() => {
    if (!editable || (!selectedId && !editingColorId)) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Backspace" || e.key === "Delete") {
        if (!selectedId) return;
        e.preventDefault();
        void removeObject(selectedId);
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setEditingNoteId(null);
        setEditingColorId(null);
        setChromeReadyId(null);
        lastClickRef.current = null;
        return;
      }
      // Nudge rotation
      if (e.key === "[" || e.key === "]") {
        if (!selectedId) return;
        e.preventDefault();
        const delta = e.key === "[" ? -5 : 5;
        const step = e.shiftKey ? 15 : delta;
        const active = layoutRef.current;
        setObjects((list) => {
          const next = list.map((o) => {
            if (o.id !== selectedId) return o;
            const t = wallObjectTransform(o, active);
            return withWallObjectTransform(o, active, {
              rotate: normalizeDeg(t.rotate + step),
            });
          });
          const obj = next.find((o) => o.id === selectedId);
          if (obj) {
            const t = wallObjectTransform(obj, active);
            void persist(obj.id, { rotate: t.rotate });
          }
          onChange?.(next);
          return next;
        });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editable, selectedId, editingColorId, removeObject, persist, onChange]);

  // Click outside widget deselects
  useEffect(() => {
    if (!editable || (!selectedId && !editingColorId)) return;
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".board-widget")) return;
      setSelectedId(null);
      setEditingNoteId(null);
      setEditingColorId(null);
      setChromeReadyId(null);
      lastClickRef.current = null;
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [editable, selectedId, editingColorId]);

  function bringToFrontLocal(id: string) {
    setObjects((list) => {
      const maxZ = Math.max(0, ...list.map((o) => o.z));
      return list.map((o) => (o.id === id ? { ...o, z: maxZ + 1 } : o));
    });
  }

  function widgetCenter(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  }

  function onMovePointerDown(obj: WallObject, e: React.PointerEvent) {
    if (!editable) return;
    // Don't start move when interacting with chrome
    const t = e.target as HTMLElement;
    if (t.closest(".board-widget__handle, .board-widget__remove, .board-widget__rotate")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const transform = wallObjectTransform(obj, layoutRef.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(obj.id);
    setDraggingId(obj.id);
    dragRef.current = {
      mode: "move",
      id: obj.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: transform.x,
      originY: transform.y,
      surfaceW: rect.width,
      surfaceH: rect.height,
    };
    bringToFrontLocal(obj.id);
  }

  function onResizePointerDown(obj: WallObject, e: React.PointerEvent) {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest(
      ".board-widget",
    ) as HTMLElement | null;
    if (!el) return;
    const { centerX, centerY } = widgetCenter(el);
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    if (startDist < 4) return;
    const transform = wallObjectTransform(obj, layoutRef.current);

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(obj.id);
    setResizingId(obj.id);
    dragRef.current = {
      mode: "resize",
      id: obj.id,
      pointerId: e.pointerId,
      originScale: transform.scale,
      centerX,
      centerY,
      startDist,
    };
    bringToFrontLocal(obj.id);
  }

  function onRotatePointerDown(obj: WallObject, e: React.PointerEvent) {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest(
      ".board-widget",
    ) as HTMLElement | null;
    if (!el) return;
    const { centerX, centerY } = widgetCenter(el);
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const transform = wallObjectTransform(obj, layoutRef.current);

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(obj.id);
    setRotatingId(obj.id);
    dragRef.current = {
      mode: "rotate",
      id: obj.id,
      pointerId: e.pointerId,
      originRotate: transform.rotate,
      centerX,
      centerY,
      startAngle,
    };
    bringToFrontLocal(obj.id);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const active = layoutRef.current;

    if (drag.mode === "move") {
      const dxPct = ((e.clientX - drag.startClientX) / drag.surfaceW) * 100;
      const dyPct = ((e.clientY - drag.startClientY) / drag.surfaceH) * 100;
      const x = clamp(drag.originX + dxPct, -5, 105);
      const y = clamp(drag.originY + dyPct, -5, 105);
      setObjects((list) =>
        list.map((o) =>
          o.id === drag.id ? withWallObjectTransform(o, active, { x, y }) : o,
        ),
      );
      return;
    }

    if (drag.mode === "resize") {
      const dist = Math.hypot(e.clientX - drag.centerX, e.clientY - drag.centerY);
      const ratio = dist / drag.startDist;
      const scale = clamp(drag.originScale * ratio, MIN_SCALE, MAX_SCALE);
      setObjects((list) =>
        list.map((o) =>
          o.id === drag.id
            ? withWallObjectTransform(o, active, { scale })
            : o,
        ),
      );
      return;
    }

    // rotate: delta of pointer angle around center
    const angle = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
    const deltaDeg = ((angle - drag.startAngle) * 180) / Math.PI;
    const rotate = normalizeDeg(drag.originRotate + deltaDeg);
    setObjects((list) =>
      list.map((o) =>
        o.id === drag.id
          ? withWallObjectTransform(o, active, { rotate })
          : o,
      ),
    );
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    const mode = drag.mode;
    const id = drag.id;
    dragRef.current = null;
    setDraggingId(null);
    setResizingId(null);
    setRotatingId(null);

    const obj = objectsRef.current.find((o) => o.id === id);
    if (!obj) return;
    const t = wallObjectTransform(obj, layoutRef.current);
    if (mode === "move") {
      void persist(obj.id, { x: t.x, y: t.y });
    } else if (mode === "resize") {
      void persist(obj.id, { scale: t.scale });
    } else {
      void persist(obj.id, { rotate: t.rotate });
    }
  }

  if (objects.length === 0 && !editable) return null;

  const elevated =
    editable &&
    Boolean(
      selectedId ||
        draggingId ||
        resizingId ||
        rotatingId ||
        editingNoteId ||
        editingColorId,
    );

  const hasGuestbook = objects.some((o) => isGuestbookCatalogId(o.catalogId));
  const backObjects = objects.filter((o) => !isGuestbookCatalogId(o.catalogId));
  const frontObjects = objects.filter((o) => isGuestbookCatalogId(o.catalogId));

  function renderWidget(obj: WallObject) {
    const decor = getDecorById(obj.catalogId);
    if (!decor) return null;
    const transform = wallObjectTransform(obj, layout);
    const selected = selectedId === obj.id;
    const dragging = draggingId === obj.id;
    const resizing = resizingId === obj.id;
    const rotating = rotatingId === obj.id;
    const hovered = !editable && hoveredId === obj.id;
    const pressed = !editable && pressedId === obj.id;
    const isNote = obj.kind === "note";
    const isGuestbook = isGuestbookCatalogId(obj.catalogId);
    const editingNote = editingNoteId === obj.id;
    const colorOptions = decorColorOptions(obj.catalogId);
    const editingColor =
      editingColorId === obj.id && colorOptions.length > 1;
    const showTransformChrome =
      editable && selected && chromeReadyId === obj.id && !editingNote;
    const baseSize = isGuestbook ? 112 : obj.kind === "widget" ? 88 : 52;
    const chromeScale = 1 / Math.max(transform.scale, 0.2);

    const art = isGuestbook ? (
      <GuestbookBook
        countLabel={obj.label || decor.label}
        href={editable ? undefined : guestbookHref || "/guestbook"}
      />
    ) : isNote ? (
      <WallStickyNote
        label={obj.label || decor.defaultText || "Note"}
        paper={decor.accent}
        editing={editable && editingNote}
        onEditStart={
          editable
            ? () => {
                setSelectedId(obj.id);
                setEditingNoteId(obj.id);
                setEditingColorId(obj.id);
                setChromeReadyId(obj.id);
              }
            : undefined
        }
        onSave={(next) => {
          setObjects((list) => {
            const updated = list.map((o) =>
              o.id === obj.id ? { ...o, label: next } : o,
            );
            onChange?.(updated);
            return updated;
          });
          void persist(obj.id, { label: next });
          setEditingNoteId(null);
        }}
        onCancel={() => setEditingNoteId(null)}
      />
    ) : (
      <BoardDecorIcon
        item={{
          ...decor,
          vinylLabel: obj.label || decor.vinylLabel,
          defaultText: obj.label || decor.defaultText,
        }}
        size={baseSize}
      />
    );

    return (
      <div
        key={obj.id}
        data-widget-id={obj.id}
        data-widget-z={obj.z}
        className={[
          "board-widget",
          isNote ? "board-widget--note" : "",
          isGuestbook ? "board-widget--guestbook" : "",
          selected ? "board-widget--selected" : "",
          dragging ? "board-widget--dragging" : "",
          resizing ? "board-widget--resizing" : "",
          rotating ? "board-widget--rotating" : "",
          hovered ? "board-widget--hovered" : "",
          pressed ? "board-widget--pressed" : "",
          editable ? "board-widget--editable" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          left: `${transform.x}%`,
          top: `${transform.y}%`,
          zIndex: 40 + obj.z,
          transform: `translate(-50%, -50%) rotate(${transform.rotate}deg) scale(${transform.scale})`,
        }}
        onPointerDown={(e) => {
          if (!editable && isGuestbook) {
            setPressedId(obj.id);
            return;
          }
          if (editingNote || editingColor) return;
          // Stickies + guestbook: drag from the pin (or Shift+drag).
          if ((isNote || isGuestbook) && editable) {
            const t = e.target as HTMLElement;
            const fromPin = Boolean(
              t.closest(".wall-note__pin, .guestbook-book__pin"),
            );
            if (!fromPin && !e.shiftKey) return;
          }
          onMovePointerDown(obj, e);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          if (!editable) setPressedId(null);
          onPointerUp(e);
        }}
        onPointerCancel={(e) => {
          if (!editable) setPressedId(null);
          onPointerUp(e);
        }}
        onPointerLeave={() => {
          if (!editable) setPressedId((id) => (id === obj.id ? null : id));
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!editable) return;
          const t = e.target as HTMLElement;
          if (
            t.closest(
              ".board-widget__remove, .board-widget__rotate, .board-widget__handle, .board-widget__colors, .board-widget__swatch, .board-widget__edit",
            )
          ) {
            return;
          }
          // Manual double-click: survives the select → re-render between clicks.
          const now = performance.now();
          const last = lastClickRef.current;
          if (last && last.id === obj.id && now - last.at < 450) {
            lastClickRef.current = null;
            beginWidgetEdit(obj);
            return;
          }
          lastClickRef.current = { id: obj.id, at: now };
          setSelectedId(obj.id);
          if (editingColorId && editingColorId !== obj.id) {
            setEditingColorId(null);
          }
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!editable) return;
          lastClickRef.current = null;
          beginWidgetEdit(obj);
        }}
        role={editable ? "button" : isGuestbook ? undefined : "img"}
        aria-label={
          editable
            ? isNote
              ? `${decor.name}. Double-click to edit text and color; drag the pin to move.`
              : isGuestbook
                ? `${decor.name}. Double-click to edit notes; drag the pin to move.`
                : colorOptions.length > 1
                  ? `${decor.name}. Double-click to change color; drag to move.`
                  : `${decor.name}. Drag to move, corners to resize, top handle to rotate.`
            : isGuestbook
              ? undefined
              : decor.name
        }
        tabIndex={editable ? 0 : undefined}
      >
        <div className="board-widget__art">{art}</div>
        {editable && editingColor ? (
          <div
            className="board-widget__colors"
            style={{
              transform: `translateX(-50%) scale(${chromeScale}) rotate(${-transform.rotate}deg)`,
            }}
            role="listbox"
            aria-label={`Color for ${decor.name}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {colorOptions.map((opt) => {
              const active = opt.id === obj.catalogId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={[
                    "board-widget__swatch",
                    active ? "board-widget__swatch--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ background: opt.accent || "#8a847c" }}
                  title={opt.name}
                  aria-label={opt.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (opt.id === obj.catalogId) return;
                    applyCatalogId(obj.id, opt.id);
                  }}
                />
              );
            })}
          </div>
        ) : null}
        {showTransformChrome ? (
          <>
            {isGuestbook ? (
              <button
                type="button"
                className="board-widget__edit"
                style={{
                  transform: `translateX(-50%) scale(${chromeScale}) rotate(${-transform.rotate}deg)`,
                }}
                aria-label="Edit guestbook notes"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push("/admin/guestbook");
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                Edit
              </button>
            ) : (
              <button
                type="button"
                className="board-widget__remove"
                style={{ transform: `scale(${chromeScale})` }}
                aria-label="Remove from board"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeObject(obj.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                ×
              </button>
            )}
            <span
              className="board-widget__rotate"
              style={{ transform: `translateX(-50%) scale(${chromeScale})` }}
              role="slider"
              aria-label={`Rotate ${decor.name}`}
              aria-valuemin={-180}
              aria-valuemax={180}
              aria-valuenow={Math.round(transform.rotate)}
              title="Drag to rotate · [ ] keys"
              onPointerDown={(e) => onRotatePointerDown(obj, e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <RotateGlyph />
            </span>
            {(
              [
                ["nw", "board-widget__handle--nw"],
                ["ne", "board-widget__handle--ne"],
                ["sw", "board-widget__handle--sw"],
                ["se", "board-widget__handle--se"],
              ] as const
            ).map(([corner, cls]) => (
              <span
                key={corner}
                className={`board-widget__handle ${cls}`}
                style={{ transform: `scale(${chromeScale})` }}
                role="slider"
                aria-label={`Resize ${decor.name} (proportional)`}
                aria-valuemin={MIN_SCALE}
                aria-valuemax={MAX_SCALE}
                aria-valuenow={Number(transform.scale.toFixed(2))}
                onPointerDown={(e) => onResizePointerDown(obj, e)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            ))}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {editable ? (
        <AdminChromeActions>
          <p
            className={`${adminChromePillClass} !cursor-default text-ink-soft`}
            title="Widget positions are saved separately for phone and desktop"
          >
            <span className="sm:hidden">
              {layout === "mobile" ? "Phone" : "Desktop"}
            </span>
            <span className="hidden sm:inline">
              {layout === "mobile" ? "Phone layout" : "Desktop layout"}
            </span>
          </p>
        </AdminChromeActions>
      ) : null}
      <div
        ref={surfaceRef}
        className={`board-widget-layer${elevated ? " board-widget-layer--elevated" : ""}`}
        aria-hidden={editable || hasGuestbook ? undefined : true}
      >
        {backObjects.map(renderWidget)}
      </div>
      {frontObjects.length > 0 && portalRoot
        ? createPortal(
            <div className="board-widget-layer board-widget-layer--front">
              {frontObjects.map(renderWidget)}
            </div>,
            portalRoot,
          )
        : null}
    </>
  );
}

function RotateGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden>
      <path
        d="M14.5 7.2A5.5 5.5 0 1 0 15 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M14.2 4.2 L16.6 7.2 L12.8 8" fill="currentColor" />
    </svg>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Keep degrees in a friendly -180…180 range for storage/UI */
function normalizeDeg(deg: number) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return Math.round(d * 10) / 10;
}
