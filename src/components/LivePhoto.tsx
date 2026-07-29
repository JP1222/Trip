"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

/** Apple-style hold delay before Live clip starts */
const HOLD_MS = 280;
/** Cancel hold if finger moves more than this (scroll / swipe) */
const HOLD_MOVE_MAX = 12;

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
  badgeClassName?: string;
  /**
   * Interactive play (default true):
   * desktop = hover; phone = finger press-and-hold.
   */
  interactive?: boolean;
};

/**
 * Grid thumbnail: still by default.
 * - Desktop (mouse): hover plays muted Live; leave stops. Click opens lightbox.
 * - Phone (touch/pen): finger on photo ~280ms plays while held; lift stops. Tap opens lightbox.
 */
export function LivePhotoThumb({
  stillSrc,
  videoSrc,
  alt,
  className = "",
  badgeClassName = "top-2 left-2 sm:top-2.5 sm:left-2.5",
  interactive = true,
}: LivePhotoThumbProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wantsPlayback = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdOrigin = useRef<{ x: number; y: number } | null>(null);
  const holding = useRef(false);
  /** How playback was started — only touch-hold suppresses the parent click. */
  const playSource = useRef<"hover" | "hold" | null>(null);
  /** After touch-hold play, suppress the following click (open lightbox). */
  const suppressClick = useRef(false);
  /** Bumps on each play request so stale async retries don't clobber a newer stop. */
  const playGen = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [videoRequested, setVideoRequested] = useState(false);

  const clearHoldTimer = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  /**
   * Start muted playback. Retries when:
   * - the <video> is not mounted yet (first hover)
   * - play() is aborted while switching thumbs (AbortError)
   */
  const tryPlay = useCallback((gen: number, frame = 0) => {
    if (!wantsPlayback.current || gen !== playGen.current) return;
    const v = videoRef.current;
    if (!v) {
      setVideoRequested(true);
      // Mount is async — retry a few frames until ref exists or cancelled.
      if (frame < 45) {
        requestAnimationFrame(() => tryPlay(gen, frame + 1));
      }
      return;
    }
    v.muted = true;
    void v
      .play()
      .then(() => {
        if (!wantsPlayback.current || gen !== playGen.current) {
          v.pause();
          return;
        }
        setPlaying(true);
      })
      .catch(() => {
        if (!wantsPlayback.current || gen !== playGen.current) {
          setPlaying(false);
          return;
        }
        // Switching between Live thumbs often aborts the previous play(); retry once settled.
        window.setTimeout(() => {
          if (!wantsPlayback.current || gen !== playGen.current) return;
          const el = videoRef.current;
          if (!el) return;
          void el
            .play()
            .then(() => {
              if (wantsPlayback.current && gen === playGen.current) {
                setPlaying(true);
              }
            })
            .catch(() => setPlaying(false));
        }, 40);
      });
  }, []);

  const play = useCallback(
    (source: "hover" | "hold") => {
      if (!interactive) return;
      wantsPlayback.current = true;
      playSource.current = source;
      const gen = ++playGen.current;
      tryPlay(gen);
    },
    [interactive, tryPlay],
  );

  const stop = useCallback(() => {
    wantsPlayback.current = false;
    playSource.current = null;
    playGen.current += 1; // invalidate in-flight retries
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    setPlaying(false);
  }, []);

  // When the video element first mounts, kick playback if hover/hold still active.
  useEffect(() => {
    if (!videoRequested || !interactive) return;
    if (!wantsPlayback.current) return;
    const gen = playGen.current;
    const video = videoRef.current;
    if (!video) return;

    const startIfWanted = () => tryPlay(gen);
    if (video.readyState >= 2) startIfWanted();
    else video.addEventListener("loadeddata", startIfWanted, { once: true });

    return () => video.removeEventListener("loadeddata", startIfWanted);
  }, [interactive, videoRequested, tryPlay]);

  useEffect(() => {
    return () => clearHoldTimer();
  }, [clearHoldTimer]);

  function onPointerDown(e: ReactPointerEvent) {
    if (!interactive) return;
    // Desktop mouse → hover only; never press-and-hold on mouse.
    if (e.pointerType === "mouse") return;
    // Phone: finger on photo → play after short hold while finger stays
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

    holding.current = true;
    holdOrigin.current = { x: e.clientX, y: e.clientY };
    clearHoldTimer();
    holdTimer.current = setTimeout(() => {
      if (!holding.current) return;
      suppressClick.current = true;
      play("hold");
    }, HOLD_MS);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!holding.current || !holdOrigin.current) return;
    const dx = e.clientX - holdOrigin.current.x;
    const dy = e.clientY - holdOrigin.current.y;
    if (Math.hypot(dx, dy) > HOLD_MOVE_MAX) {
      // Scrolling the feed — cancel hold / stop if already playing from hold
      clearHoldTimer();
      holding.current = false;
      holdOrigin.current = null;
      if (playSource.current === "hold") stop();
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (!interactive) return;
    if (e.pointerType === "mouse") return;

    clearHoldTimer();
    holding.current = false;
    holdOrigin.current = null;

    // Finger lifted after press-and-hold → stop + don't open lightbox
    if (playSource.current === "hold") {
      stop();
      suppressClick.current = true;
      e.preventDefault();
      e.stopPropagation();
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  }

  function onPointerCancel() {
    clearHoldTimer();
    holding.current = false;
    holdOrigin.current = null;
    if (playSource.current === "hold") stop();
  }

  function onClickCapture(e: React.MouseEvent) {
    if (!suppressClick.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick.current = false;
  }

  function onContextMenu(e: React.MouseEvent) {
    // Avoid mobile callout / save-image while holding for Live play
    if (interactive) e.preventDefault();
  }

  return (
    <span
      className="relative block h-full min-h-0 w-full touch-manipulation overflow-hidden select-none"
      onMouseEnter={interactive ? () => play("hover") : undefined}
      onMouseLeave={
        interactive
          ? () => {
              // Hover-only stop; touch-hold ends via pointer up
              if (playSource.current === "hover") stop();
            }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={stillSrc}
        alt={alt}
        className={`pointer-events-none block w-full transition-opacity duration-200 ${
          playing && ready ? "opacity-0" : "opacity-100"
        } ${className}`}
        loading="lazy"
        draggable={false}
      />
      {videoRequested && (
        <video
          ref={videoRef}
          src={videoSrc}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            playing && ready ? "opacity-100" : "opacity-0"
          }`}
          muted
          playsInline
          loop
          preload="none"
          onLoadedData={() => setReady(true)}
          onEnded={stop}
          aria-hidden
        />
      )}
      <span
        className={`pointer-events-none absolute z-10 ${badgeClassName}`}
      >
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
 * - Long-press still or LIVE badge to play the companion muted
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
  const holdOrigin = useRef<{ x: number; y: number } | null>(null);
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

  function beginHold(e: ReactPointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    holding.current = true;
    holdOrigin.current = { x: e.clientX, y: e.clientY };
    clearHoldTimer();
    holdTimer.current = setTimeout(() => {
      if (holding.current) start();
    }, HOLD_MS);
  }

  function moveHold(e: ReactPointerEvent) {
    if (!holding.current || !holdOrigin.current) return;
    const dx = e.clientX - holdOrigin.current.x;
    const dy = e.clientY - holdOrigin.current.y;
    if (Math.hypot(dx, dy) > HOLD_MOVE_MAX) {
      // Pinch/pan/swipe — cancel pending Live hold
      clearHoldTimer();
      if (!playing) {
        holding.current = false;
        holdOrigin.current = null;
      }
    }
  }

  function endHold(e: ReactPointerEvent, opts?: { fromBadge?: boolean }) {
    const wasShortTap = holdTimer.current != null;
    const holdStartedPlay = holdTimer.current == null && playing;
    clearHoldTimer();
    holding.current = false;
    holdOrigin.current = null;

    if (opts?.fromBadge) {
      e.preventDefault();
      e.stopPropagation();
      // Short tap on badge: toggle play-through
      if (wasShortTap) {
        if (playing) stop();
        else start();
        return;
      }
      if (holdStartedPlay) stop();
      return;
    }

    // Released after hold-to-play on the stage → stop
    if (holdStartedPlay || playing) {
      stop();
    }
  }

  function cancelHold() {
    clearHoldTimer();
    if (holding.current && playing) stop();
    holding.current = false;
    holdOrigin.current = null;
  }

  function onBadgePointerDown(e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    beginHold(e);
  }

  function onBadgePointerUp(e: ReactPointerEvent) {
    endHold(e, { fromBadge: true });
  }

  function onBadgePointerCancel() {
    cancelHold();
  }

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 touch-manipulation items-center justify-center select-none"
      onPointerDown={beginHold}
      onPointerMove={moveHold}
      onPointerUp={(e) => endHold(e)}
      onPointerCancel={cancelHold}
      onContextMenu={(e) => e.preventDefault()}
    >
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
        onClick={(e) => {
          e.stopPropagation();
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
