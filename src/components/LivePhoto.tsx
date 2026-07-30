"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

/** Grid thumb: hold delay before Live clip (snappier on phones) */
const THUMB_HOLD_MS = 200;
/** Cancel hold if finger moves more than this (scroll / swipe) */
const HOLD_MOVE_MAX = 14;

type LiveBadgeProps = {
  className?: string;
  size?: "sm" | "md";
  /** Filled when live video is currently playing */
  active?: boolean;
  /** Show small buffering pulse */
  buffering?: boolean;
};

/** Apple-style LIVE pill */
export function LiveBadge({
  className = "",
  size = "md",
  active = false,
  buffering = false,
}: LiveBadgeProps) {
  const pad =
    size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2.5 py-1 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold tracking-wide uppercase backdrop-blur-[2px] ring-1 ${pad} ${
        active
          ? "bg-white text-ink ring-white/40"
          : "bg-black/55 text-white ring-white/25"
      } ${className}`}
      aria-hidden
    >
      <span
        className={`inline-block rounded-full ${
          size === "sm" ? "h-1.5 w-1.5" : "h-1.5 w-1.5"
        } ${
          buffering
            ? "animate-pulse bg-white/80"
            : active
              ? "bg-coral"
              : "bg-white/90"
        }`}
      />
      {buffering ? "…" : "LIVE"}
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
 * - Phone (touch/pen): finger on photo ~200ms plays while held; lift stops. Tap opens lightbox.
 * Video starts loading as soon as the finger goes down so hold feels snappy.
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

  const tryPlay = useCallback((gen: number, frame = 0) => {
    if (!wantsPlayback.current || gen !== playGen.current) return;
    const v = videoRef.current;
    if (!v) {
      setVideoRequested(true);
      if (frame < 45) {
        requestAnimationFrame(() => tryPlay(gen, frame + 1));
      }
      return;
    }
    // User gesture (hover/hold) — play with sound. Fall back to muted if
    // the browser blocks unmuted autoplay.
    v.playsInline = true;
    v.muted = false;
    const attempt = (el: HTMLVideoElement, allowMutedFallback: boolean) =>
      el
        .play()
        .then(() => {
          if (!wantsPlayback.current || gen !== playGen.current) {
            el.pause();
            return;
          }
          setPlaying(true);
        })
        .catch(() => {
          if (!wantsPlayback.current || gen !== playGen.current) {
            setPlaying(false);
            return;
          }
          if (allowMutedFallback) {
            el.muted = true;
            void attempt(el, false);
            return;
          }
          window.setTimeout(() => {
            if (!wantsPlayback.current || gen !== playGen.current) return;
            const again = videoRef.current;
            if (!again) return;
            void again.play().then(
              () => {
                if (wantsPlayback.current && gen === playGen.current) {
                  setPlaying(true);
                }
              },
              () => setPlaying(false),
            );
          }, 40);
        });
    void attempt(v, true);
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
    playGen.current += 1;
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
    if (e.pointerType === "mouse") return;
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

    // Warm the video as soon as the finger lands (before hold fires).
    setVideoRequested(true);

    holding.current = true;
    holdOrigin.current = { x: e.clientX, y: e.clientY };
    clearHoldTimer();
    holdTimer.current = setTimeout(() => {
      if (!holding.current) return;
      suppressClick.current = true;
      play("hold");
    }, THUMB_HOLD_MS);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!holding.current || !holdOrigin.current) return;
    const dx = e.clientX - holdOrigin.current.x;
    const dy = e.clientY - holdOrigin.current.y;
    if (Math.hypot(dx, dy) > HOLD_MOVE_MAX) {
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
    if (interactive) e.preventDefault();
  }

  return (
    <span
      className="relative block h-full min-h-0 w-full touch-manipulation overflow-hidden select-none"
      onMouseEnter={interactive ? () => play("hover") : undefined}
      onMouseLeave={
        interactive
          ? () => {
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
        className={`pointer-events-none block w-full transition-opacity duration-150 ${
          playing && ready ? "opacity-0" : "opacity-100"
        } ${className}`}
        loading="lazy"
        draggable={false}
      />
      {videoRequested && (
        <video
          ref={videoRef}
          src={videoSrc}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
            playing && ready ? "opacity-100" : "opacity-0"
          }`}
          playsInline
          loop
          preload="auto"
          onLoadedData={() => setReady(true)}
          onEnded={stop}
          aria-hidden
        />
      )}
      <span className={`pointer-events-none absolute z-10 ${badgeClassName}`}>
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
 * Lightbox Live Photo stage (mobile-first):
 * - Still is default; pinch / swipe / zoom work freely (no stage-wide hold).
 * - Tap the LIVE badge to play muted once through; tap again to stop.
 * - Desktop mouse: optional short hold on badge also starts play.
 * - Video preloads on open so the first tap is quick.
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
  const [buffering, setBuffering] = useState(false);
  const playGen = useRef(0);
  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  const setPlayState = useCallback((next: boolean) => {
    setPlaying(next);
    onPlayingChangeRef.current?.(next);
  }, []);

  const stop = useCallback(() => {
    playGen.current += 1;
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    setBuffering(false);
    setPlayState(false);
  }, [setPlayState]);

  const start = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const gen = ++playGen.current;
    setBuffering(true);
    try {
      v.playsInline = true;
      // Badge tap is a user gesture — play with audio (Live clips keep AAC).
      v.muted = false;
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      // Wait until we can start if the first open is cold.
      if (v.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const onReady = () => {
            cleanup();
            resolve();
          };
          const onErr = () => {
            cleanup();
            reject(new Error("live load failed"));
          };
          const cleanup = () => {
            v.removeEventListener("canplay", onReady);
            v.removeEventListener("loadeddata", onReady);
            v.removeEventListener("error", onErr);
          };
          v.addEventListener("canplay", onReady, { once: true });
          v.addEventListener("loadeddata", onReady, { once: true });
          v.addEventListener("error", onErr, { once: true });
          try {
            v.load();
          } catch {
            /* ignore */
          }
          window.setTimeout(() => {
            if (gen === playGen.current) {
              cleanup();
              resolve();
            }
          }, 4000);
        });
      }
      if (gen !== playGen.current) return;
      try {
        await v.play();
      } catch {
        // Rare: policy still blocks sound — retry muted rather than fail entirely
        v.muted = true;
        await v.play();
      }
      if (gen !== playGen.current) {
        v.pause();
        return;
      }
      setPlayState(true);
    } catch {
      if (gen === playGen.current) setPlayState(false);
    } finally {
      if (gen === playGen.current) setBuffering(false);
    }
  }, [setPlayState]);

  // Reset when navigating between Live photos
  useEffect(() => {
    stop();
  }, [resetKey, stop]);

  function togglePlay(e: ReactPointerEvent | React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (playing || buffering) stop();
    else void start();
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 touch-manipulation items-center justify-center select-none">
      {/* Still (zoomable) — full gesture surface; no stage-wide hold fighting swipe/pinch */}
      <div
        className={`flex h-full w-full items-center justify-center transition-opacity duration-150 ${
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
        className={`media-viewer__media absolute inset-0 m-auto h-auto w-auto max-h-full max-w-full rounded-lg bg-black object-contain shadow-2xl transition-opacity duration-150 ${
          playing ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        playsInline
        preload="auto"
        onEnded={stop}
        onClick={(e) => {
          e.stopPropagation();
          if (playing) stop();
          else onTap?.();
        }}
        aria-label={alt}
      />

      {/* Large hit target — primary mobile control */}
      <button
        type="button"
        className="absolute top-3 left-3 z-20 flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full p-1 sm:top-4 sm:left-4"
        aria-label={playing ? "Stop Live Photo" : "Play Live Photo"}
        aria-pressed={playing}
        aria-busy={buffering}
        onPointerDown={(e) => {
          // Prevent ZoomableImage / stage from treating this as swipe
          e.stopPropagation();
        }}
        onClick={togglePlay}
      >
        <LiveBadge active={playing} buffering={buffering} />
      </button>

      {playing && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-[10px] tracking-wide text-white/80 uppercase backdrop-blur-sm">
          Live · sound on · tap to stop
        </p>
      )}
      {!playing && !buffering && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-1 text-[10px] tracking-wide text-white/50 uppercase backdrop-blur-sm sm:block">
          Tap LIVE to play
        </p>
      )}
    </div>
  );
}
