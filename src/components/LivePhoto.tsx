"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const HOLD_MS = 280;

type LiveBadgeProps = {
  className?: string;
  size?: "sm" | "md";
  /** Filled when live video is currently playing */
  active?: boolean;
};

/** Apple-style LIVE pill */
export function LiveBadge({
  className = "",
  size = "md",
  active = false,
}: LiveBadgeProps) {
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold tracking-wide uppercase backdrop-blur-[2px] ring-1 ${pad} ${
        active
          ? "bg-white text-ink ring-white/40"
          : "bg-black/50 text-white ring-white/25"
      } ${className}`}
      aria-hidden
    >
      <span
        className={`inline-block rounded-full ${
          size === "sm" ? "h-1.5 w-1.5" : "h-1.5 w-1.5"
        } ${active ? "bg-coral" : "bg-white/90"}`}
      />
      LIVE
    </span>
  );
}

type LivePhotoThumbProps = {
  stillSrc: string;
  videoSrc: string;
  alt: string;
  className?: string;
  /** Hover/long-press play in the grid (default true on desktop hover). */
  interactive?: boolean;
};

/**
 * Grid thumbnail: still by default; desktop hover plays the Live clip muted.
 */
export function LivePhotoThumb({
  stillSrc,
  videoSrc,
  alt,
  className = "",
  interactive = true,
}: LivePhotoThumbProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v || !interactive) return;
    void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [interactive]);

  const stop = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
    setPlaying(false);
  }, []);

  return (
    <span
      className="relative block w-full overflow-hidden"
      onMouseEnter={interactive ? play : undefined}
      onMouseLeave={interactive ? stop : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={stillSrc}
        alt={alt}
        className={`block w-full transition-opacity duration-200 ${
          playing && ready ? "opacity-0" : "opacity-100"
        } ${className}`}
        loading="lazy"
        draggable={false}
      />
      <video
        ref={videoRef}
        src={videoSrc}
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
          playing && ready ? "opacity-100" : "opacity-0"
        }`}
        muted
        playsInline
        loop
        preload="metadata"
        onLoadedData={() => setReady(true)}
        onEnded={stop}
        aria-hidden
      />
      <span className="pointer-events-none absolute top-2 right-2 z-10 sm:top-2.5 sm:right-2.5">
        <LiveBadge size="sm" active={playing} />
      </span>
    </span>
  );
}

type LivePhotoStageProps = {
  stillSrc: string;
  videoSrc: string;
  alt: string;
  resetKey: string;
  /** Still image stage (e.g. ZoomableImage) — receives still only */
  still: ReactNode;
  onPlayingChange?: (playing: boolean) => void;
  /** Toggle chrome visibility on short tap when not holding LIVE */
  onTap?: () => void;
};

/**
 * Lightbox stage for Live Photos:
 * - Still is default (zoomable via `still` slot)
 * - Hold / press LIVE to play the companion muted
 * - Tap LIVE badge to toggle play once through
 */
export function LivePhotoStage({
  stillSrc,
  videoSrc,
  alt,
  resetKey,
  still,
  onPlayingChange,
  onTap,
}: LivePhotoStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  const setPlayState = useCallback((next: boolean) => {
    setPlaying(next);
    onPlayingChangeRef.current?.(next);
  }, []);

  const stop = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    setPlayState(false);
    holding.current = false;
  }, [setPlayState]);

  const start = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    void v
      .play()
      .then(() => setPlayState(true))
      .catch(() => setPlayState(false));
  }, [setPlayState]);

  // Parent remounts via key={photoId}; clear pending hold timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  function clearHoldTimer() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function onBadgePointerDown(e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    holding.current = true;
    clearHoldTimer();
    // Hold to play (Apple style) — short tap handled on pointer up
    holdTimer.current = setTimeout(() => {
      if (holding.current) start();
    }, HOLD_MS);
  }

  function onBadgePointerUp(e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const holdStartedPlay = holdTimer.current == null && playing;
    const wasShortTap = holdTimer.current != null;
    clearHoldTimer();
    holding.current = false;

    // Short tap: toggle play-through
    if (wasShortTap) {
      if (playing) stop();
      else start();
      return;
    }

    // Released after hold-to-play → stop
    if (holdStartedPlay) {
      stop();
    }
  }

  function onBadgePointerCancel() {
    clearHoldTimer();
    if (holding.current && playing) stop();
    holding.current = false;
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 items-center justify-center">
      {/* Still (zoomable) — hidden while playing so video sits on top cleanly */}
      <div
        className={`flex h-full w-full items-center justify-center transition-opacity duration-200 ${
          playing ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {still}
      </div>

      <video
        key={`live-${resetKey}`}
        ref={videoRef}
        src={videoSrc}
        poster={stillSrc}
        className={`media-viewer__media absolute max-h-[min(70vh,720px)] w-auto max-w-full rounded-lg bg-black object-contain shadow-2xl transition-opacity duration-200 lg:max-h-[min(82vh,900px)] ${
          playing ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        muted
        playsInline
        preload="metadata"
        onEnded={stop}
        onClick={() => {
          if (playing) stop();
          else onTap?.();
        }}
        aria-label={alt}
      />

      <button
        type="button"
        className="absolute top-3 left-3 z-20 touch-manipulation sm:top-4 sm:left-4"
        aria-label={playing ? "Stop Live Photo" : "Play Live Photo"}
        aria-pressed={playing}
        onPointerDown={onBadgePointerDown}
        onPointerUp={onBadgePointerUp}
        onPointerCancel={onBadgePointerCancel}
      >
        <LiveBadge active={playing} />
      </button>

      {playing && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-[10px] tracking-wide text-white/80 uppercase backdrop-blur-sm">
          Live Photo
        </p>
      )}
    </div>
  );
}
