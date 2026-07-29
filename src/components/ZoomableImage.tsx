"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST = 44;
const DOUBLE_TAP_SCALE = 2.75;
const SWIPE_MIN = 56;
const TAP_MOVE_MAX = 12;

type Point = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

type Props = {
  src: string;
  alt: string;
  /** Change to reset zoom (e.g. photo id) */
  resetKey: string;
  className?: string;
  imgClassName?: string;
  /** Single tap (not used as double-tap / drag) */
  onTap?: () => void;
  /** Horizontal swipe when not zoomed */
  onSwipe?: (dir: "prev" | "next") => void;
  onZoomChange?: (zoomed: boolean) => void;
};

/**
 * Photo stage with pinch / wheel / double-tap zoom and pan when magnified.
 * Swipe left/right only works at 1× so it doesn't fight pan.
 */
export function ZoomableImage({
  src,
  alt,
  resetKey,
  className = "",
  imgClassName = "",
  onTap,
  onSwipe,
  onZoomChange,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const scaleRef = useRef(1);
  const xRef = useRef(0);
  const yRef = useRef(0);

  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<"none" | "pan" | "pinch" | "swipe">("none");

  const pinchStartDistRef = useRef(1);
  const pinchStartScaleRef = useRef(1);
  const pinchStartXRef = useRef(0);
  const pinchStartYRef = useRef(0);
  const pinchFocusRef = useRef<Point>({ x: 0, y: 0 });

  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);

  const lastTapRef = useRef({ t: 0, x: 0, y: 0 });
  const suppressTapRef = useRef(false);

  const [zoomed, setZoomed] = useState(false);
  const [scaleLabel, setScaleLabel] = useState(1);
  const zoomedRef = useRef(false);
  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  // Notify parent after commit — never from inside setState (that updates
  // PhotoGallery while ZoomableImage is still rendering).
  useEffect(() => {
    onZoomChangeRef.current?.(zoomed);
  }, [zoomed]);

  const relativeToCenter = useCallback((clientX: number, clientY: number): Point => {
    const el = viewportRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: clientX - r.left - r.width / 2,
      y: clientY - r.top - r.height / 2,
    };
  }, []);

  const clampPan = useCallback((scale: number, x: number, y: number) => {
    const el = viewportRef.current;
    if (!el || scale <= 1) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    // Allow panning roughly to the edges of the scaled image
    const maxX = ((scale - 1) * r.width) / 2 + 24;
    const maxY = ((scale - 1) * r.height) / 2 + 24;
    return {
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  }, []);

  const paint = useCallback(
    (scale: number, x: number, y: number, animate: boolean) => {
      let s = clamp(scale, MIN_SCALE, MAX_SCALE);
      let tx = x;
      let ty = y;
      if (s <= 1.02) {
        s = 1;
        tx = 0;
        ty = 0;
      } else {
        const c = clampPan(s, tx, ty);
        tx = c.x;
        ty = c.y;
      }

      scaleRef.current = s;
      xRef.current = tx;
      yRef.current = ty;

      const layer = layerRef.current;
      if (layer) {
        layer.style.transition = animate
          ? "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)"
          : "none";
        layer.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
      }

      const isZ = s > 1.02;
      if (zoomedRef.current !== isZ) {
        zoomedRef.current = isZ;
        setZoomed(isZ);
      }
      setScaleLabel(Math.round(s * 10) / 10);
    },
    [clampPan],
  );

  const zoomAt = useCallback(
    (nextScale: number, clientX: number, clientY: number, animate: boolean) => {
      const s0 = scaleRef.current;
      const s1 = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (s1 === s0 && s1 === 1) {
        paint(1, 0, 0, animate);
        return;
      }
      const p = relativeToCenter(clientX, clientY);
      const x0 = xRef.current;
      const y0 = yRef.current;
      // Keep the focal point under the fingers/cursor stable
      const x1 = p.x - ((p.x - x0) * s1) / s0;
      const y1 = p.y - ((p.y - y0) * s1) / s0;
      paint(s1, x1, y1, animate);
    },
    [paint, relativeToCenter],
  );

  const reset = useCallback(() => {
    paint(1, 0, 0, false);
  }, [paint]);

  useEffect(() => {
    reset();
  }, [resetKey, reset]);

  // Non-passive wheel so we can preventDefault (page scroll / browser zoom)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = Math.exp(-e.deltaY * 0.0018);
      const s0 = scaleRef.current;
      const s1 = clamp(s0 * factor, MIN_SCALE, MAX_SCALE);
      if (s1 === s0 && s1 === 1) return;
      const r = el.getBoundingClientRect();
      const p = {
        x: e.clientX - r.left - r.width / 2,
        y: e.clientY - r.top - r.height / 2,
      };
      const x0 = xRef.current;
      const y0 = yRef.current;
      const x1 = p.x - ((p.x - x0) * s1) / s0;
      const y1 = p.y - ((p.y - y0) * s1) / s0;
      // Inline paint to avoid stale closure
      let s = s1;
      let tx = x1;
      let ty = y1;
      if (s <= 1.02) {
        s = 1;
        tx = 0;
        ty = 0;
      } else {
        const maxX = ((s - 1) * r.width) / 2 + 24;
        const maxY = ((s - 1) * r.height) / 2 + 24;
        tx = clamp(tx, -maxX, maxX);
        ty = clamp(ty, -maxY, maxY);
      }
      scaleRef.current = s;
      xRef.current = tx;
      yRef.current = ty;
      const layer = layerRef.current;
      if (layer) {
        layer.style.transition = "none";
        layer.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
      }
      const isZ = s > 1.02;
      if (zoomedRef.current !== isZ) {
        zoomedRef.current = isZ;
        setZoomed(isZ);
      }
      setScaleLabel(Math.round(s * 10) / 10);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [resetKey]);

  function endGesture() {
    gestureRef.current = "none";
    // Snap near-1× back to identity
    if (scaleRef.current < 1.08) {
      paint(1, 0, 0, true);
    } else {
      paint(scaleRef.current, xRef.current, yRef.current, true);
    }
  }

  function onPointerDown(e: ReactPointerEvent) {
    // Only primary + multi-touch on the image surface; ignore right-click
    if (e.button !== 0 && e.pointerType === "mouse") return;

    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = false;
    suppressTapRef.current = false;

    const count = pointersRef.current.size;

    if (count === 2) {
      const pts = [...pointersRef.current.values()];
      gestureRef.current = "pinch";
      pinchStartDistRef.current = Math.max(dist(pts[0], pts[1]), 1);
      pinchStartScaleRef.current = scaleRef.current;
      pinchStartXRef.current = xRef.current;
      pinchStartYRef.current = yRef.current;
      const m = mid(pts[0], pts[1]);
      pinchFocusRef.current = relativeToCenter(m.x, m.y);
      suppressTapRef.current = true;
      return;
    }

    if (count === 1) {
      if (scaleRef.current > 1.02) {
        gestureRef.current = "pan";
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          tx: xRef.current,
          ty: yRef.current,
        };
      } else {
        gestureRef.current = "swipe";
        swipeStartRef.current = { x: e.clientX, y: e.clientY };
      }
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (gestureRef.current === "pinch" && pointersRef.current.size >= 2) {
      e.preventDefault();
      const pts = [...pointersRef.current.values()];
      const d = Math.max(dist(pts[0], pts[1]), 1);
      const ratio = d / pinchStartDistRef.current;
      const next = clamp(
        pinchStartScaleRef.current * ratio,
        MIN_SCALE,
        MAX_SCALE,
      );
      const m = mid(pts[0], pts[1]);
      // Use live midpoint so two-finger pan works while pinching
      const focus = relativeToCenter(m.x, m.y);
      const s0 = pinchStartScaleRef.current;
      const p0 = pinchFocusRef.current;
      // Re-base from pinch start, then follow focus drift
      const xBase =
        p0.x - ((p0.x - pinchStartXRef.current) * next) / s0;
      const yBase =
        p0.y - ((p0.y - pinchStartYRef.current) * next) / s0;
      const x1 = xBase + (focus.x - p0.x);
      const y1 = yBase + (focus.y - p0.y);
      paint(next, x1, y1, false);
      movedRef.current = true;
      return;
    }

    if (gestureRef.current === "pan" && pointersRef.current.size === 1) {
      e.preventDefault();
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (Math.hypot(dx, dy) > TAP_MOVE_MAX) movedRef.current = true;
      paint(
        scaleRef.current,
        panStartRef.current.tx + dx,
        panStartRef.current.ty + dy,
        false,
      );
      return;
    }

    if (gestureRef.current === "swipe" && pointersRef.current.size === 1) {
      const dx = e.clientX - swipeStartRef.current.x;
      const dy = e.clientY - swipeStartRef.current.y;
      if (Math.hypot(dx, dy) > TAP_MOVE_MAX) movedRef.current = true;
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    const had = pointersRef.current.has(e.pointerId);
    pointersRef.current.delete(e.pointerId);

    if (!had) return;

    // Still one finger after pinch — re-enter pan/swipe
    if (pointersRef.current.size === 1) {
      const [pt] = pointersRef.current.values();
      if (scaleRef.current > 1.02) {
        gestureRef.current = "pan";
        panStartRef.current = {
          x: pt.x,
          y: pt.y,
          tx: xRef.current,
          ty: yRef.current,
        };
      } else {
        gestureRef.current = "swipe";
        swipeStartRef.current = { x: pt.x, y: pt.y };
      }
      return;
    }

    if (pointersRef.current.size > 0) return;

    const was = gestureRef.current;
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (was === "swipe" && !suppressTapRef.current && scaleRef.current <= 1.02) {
      const dx = clientX - swipeStartRef.current.x;
      const dy = clientY - swipeStartRef.current.y;
      if (
        Math.abs(dx) >= SWIPE_MIN &&
        Math.abs(dx) > Math.abs(dy) * 1.15
      ) {
        onSwipe?.(dx > 0 ? "prev" : "next");
        endGesture();
        return;
      }
    }

    if (
      was !== "pinch" &&
      !movedRef.current &&
      !suppressTapRef.current
    ) {
      const now = Date.now();
      const last = lastTapRef.current;
      if (
        now - last.t < DOUBLE_TAP_MS &&
        Math.hypot(clientX - last.x, clientY - last.y) < DOUBLE_TAP_DIST
      ) {
        // Second tap — zoom; cancel pending single-tap UI toggle
        lastTapRef.current = { t: 0, x: 0, y: 0 };
        if (scaleRef.current > 1.15) {
          paint(1, 0, 0, true);
        } else {
          zoomAt(DOUBLE_TAP_SCALE, clientX, clientY, true);
        }
        endGesture();
        return;
      }
      // Defer single-tap so double-tap can cancel it
      lastTapRef.current = { t: now, x: clientX, y: clientY };
      window.setTimeout(() => {
        if (lastTapRef.current.t === now) {
          onTap?.();
        }
      }, DOUBLE_TAP_MS);
    }

    endGesture();
  }

  function onPointerCancel(e: ReactPointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) endGesture();
  }

  return (
    <div
      ref={viewportRef}
      className={`zoomable relative flex h-full w-full min-h-0 min-w-0 touch-none items-center justify-center overflow-hidden ${className}`}
      style={{ touchAction: "none", cursor: zoomed ? "grab" : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="presentation"
    >
      <div
        ref={layerRef}
        className="zoomable__layer flex max-h-full max-w-full items-center justify-center will-change-transform"
        style={{ transformOrigin: "center center" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={`zoomable__img max-h-[min(70vh,720px)] w-auto max-w-full select-none object-contain shadow-2xl lg:max-h-[min(82vh,900px)] ${imgClassName}`}
          draggable={false}
          // Avoid browser image drag / long-press save fighting gestures
          onDragStart={(e) => e.preventDefault()}
        />
      </div>

      {zoomed && (
        <div
          className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium tabular-nums tracking-wide text-white/90 backdrop-blur-sm"
          aria-live="polite"
        >
          {scaleLabel.toFixed(1)}× · double-tap to reset
        </div>
      )}
    </div>
  );
}
