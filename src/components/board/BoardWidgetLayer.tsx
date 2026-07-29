"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDecorById } from "@/lib/board-decor";
import type { WallObject } from "@/lib/wall-objects";
import { BoardDecorIcon } from "./BoardDecorIcon";

type Props = {
  objects: WallObject[];
  /** Admin: drag / resize / rotate; double-click or Delete to remove */
  editable?: boolean;
  onChange?: (objects: WallObject[]) => void;
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
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [objects, setObjects] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  /** Public wall: CSS :hover can't fire (pointer-events:none for click-through) */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const objectsRef = useRef(objects);

  useEffect(() => {
    setObjects(initial);
  }, [initial]);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  /**
   * Public homepage: hit-test widget bounds on pointer move so hover
   * animations work even though the layer has pointer-events: none
   * (clicks still reach polaroids underneath).
   */
  useEffect(() => {
    if (editable) return;
    if (typeof window === "undefined") return;
    // Touch / coarse pointers don't get sticky hover — skip work
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches) return;

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
      const layer = surfaceRef.current;
      if (!layer) {
        setHoveredId(null);
        return;
      }
      const nodes = layer.querySelectorAll<HTMLElement>(".board-widget");
      let bestId: string | null = null;
      let bestZ = -Infinity;
      nodes.forEach((node) => {
        const id = node.dataset.widgetId;
        if (!id) return;
        const r = node.getBoundingClientRect();
        // Small pad so thin washi / edges still catch
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
    async (id: string, patch: Partial<WallObject>) => {
      try {
        const res = await fetch(`/api/admin/wall/objects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x: patch.x,
            y: patch.y,
            rotate: patch.rotate,
            scale: patch.scale,
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

  const removeObject = useCallback(
    async (id: string) => {
      if (!editable) return;
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
      } catch {
        // ignore
      }
    },
    [editable, onChange],
  );

  useEffect(() => {
    if (!editable || !selectedId) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        void removeObject(selectedId!);
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      // Nudge rotation
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        const delta = e.key === "[" ? -5 : 5;
        const step = e.shiftKey ? 15 : delta;
        setObjects((list) => {
          const next = list.map((o) =>
            o.id === selectedId
              ? { ...o, rotate: normalizeDeg(o.rotate + step) }
              : o,
          );
          const obj = next.find((o) => o.id === selectedId);
          if (obj) void persist(obj.id, { rotate: obj.rotate });
          onChange?.(next);
          return next;
        });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editable, selectedId, removeObject, persist, onChange]);

  // Click outside widget deselects
  useEffect(() => {
    if (!editable || !selectedId) return;
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".board-widget")) return;
      setSelectedId(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [editable, selectedId]);

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
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(obj.id);
    setDraggingId(obj.id);
    dragRef.current = {
      mode: "move",
      id: obj.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: obj.x,
      originY: obj.y,
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

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(obj.id);
    setResizingId(obj.id);
    dragRef.current = {
      mode: "resize",
      id: obj.id,
      pointerId: e.pointerId,
      originScale: obj.scale,
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

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(obj.id);
    setRotatingId(obj.id);
    dragRef.current = {
      mode: "rotate",
      id: obj.id,
      pointerId: e.pointerId,
      originRotate: obj.rotate,
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

    if (drag.mode === "move") {
      const dxPct = ((e.clientX - drag.startClientX) / drag.surfaceW) * 100;
      const dyPct = ((e.clientY - drag.startClientY) / drag.surfaceH) * 100;
      const x = clamp(drag.originX + dxPct, -5, 105);
      const y = clamp(drag.originY + dyPct, -5, 105);
      setObjects((list) =>
        list.map((o) => (o.id === drag.id ? { ...o, x, y } : o)),
      );
      return;
    }

    if (drag.mode === "resize") {
      const dist = Math.hypot(e.clientX - drag.centerX, e.clientY - drag.centerY);
      const ratio = dist / drag.startDist;
      const scale = clamp(drag.originScale * ratio, MIN_SCALE, MAX_SCALE);
      setObjects((list) =>
        list.map((o) => (o.id === drag.id ? { ...o, scale } : o)),
      );
      return;
    }

    // rotate: delta of pointer angle around center
    const angle = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
    const deltaDeg = ((angle - drag.startAngle) * 180) / Math.PI;
    const rotate = normalizeDeg(drag.originRotate + deltaDeg);
    setObjects((list) =>
      list.map((o) => (o.id === drag.id ? { ...o, rotate } : o)),
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
    if (mode === "move") {
      void persist(obj.id, { x: obj.x, y: obj.y });
    } else if (mode === "resize") {
      void persist(obj.id, { scale: obj.scale });
    } else {
      void persist(obj.id, { rotate: obj.rotate });
    }
  }

  if (objects.length === 0 && !editable) return null;

  return (
    <div
      ref={surfaceRef}
      className="board-widget-layer"
      aria-hidden={!editable}
    >
      {objects.map((obj) => {
        const decor = getDecorById(obj.catalogId);
        if (!decor) return null;
        const selected = selectedId === obj.id;
        const dragging = draggingId === obj.id;
        const resizing = resizingId === obj.id;
        const rotating = rotatingId === obj.id;
        const hovered = !editable && hoveredId === obj.id;
        const baseSize =
          obj.kind === "widget" ? 88 : obj.kind === "note" ? 72 : 52;
        // Counter-scale chrome so handles stay finger-friendly
        const chromeScale = 1 / Math.max(obj.scale, 0.2);

        return (
          <div
            key={obj.id}
            data-widget-id={obj.id}
            data-widget-z={obj.z}
            className={[
              "board-widget",
              selected ? "board-widget--selected" : "",
              dragging ? "board-widget--dragging" : "",
              resizing ? "board-widget--resizing" : "",
              rotating ? "board-widget--rotating" : "",
              hovered ? "board-widget--hovered" : "",
              editable ? "board-widget--editable" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${obj.x}%`,
              top: `${obj.y}%`,
              zIndex: 40 + obj.z,
              transform: `translate(-50%, -50%) rotate(${obj.rotate}deg) scale(${obj.scale})`,
            }}
            onPointerDown={(e) => onMovePointerDown(obj, e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => {
              e.stopPropagation();
              if (editable) setSelectedId(obj.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (editable) void removeObject(obj.id);
            }}
            role={editable ? "button" : "img"}
            aria-label={
              editable
                ? `${decor.name}. Drag to move, corners to resize, top handle to rotate.`
                : decor.name
            }
            tabIndex={editable ? 0 : undefined}
          >
            <BoardDecorIcon
              item={{
                ...decor,
                vinylLabel: obj.label || decor.vinylLabel,
                defaultText: obj.label || decor.defaultText,
              }}
              size={baseSize}
            />
            {editable && selected && (
              <>
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
                <span
                  className="board-widget__rotate"
                  style={{ transform: `translateX(-50%) scale(${chromeScale})` }}
                  role="slider"
                  aria-label={`Rotate ${decor.name}`}
                  aria-valuemin={-180}
                  aria-valuemax={180}
                  aria-valuenow={Math.round(obj.rotate)}
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
                    aria-valuenow={Number(obj.scale.toFixed(2))}
                    onPointerDown={(e) => onResizePointerDown(obj, e)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
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
