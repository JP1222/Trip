"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import PhotoSwipe, { type PhotoSwipeOptions, type SlideData } from "photoswipe";
import "photoswipe/style.css";
import type { Comment, PhotoMeta } from "@/lib/types";
import {
  formatCameraSettings,
  formatFileSize,
  isLivePhoto,
  isVideoMedia,
  liveVideoPublicUrl,
  photoPublicUrl,
} from "@/lib/photos-client";
import { photoFullPublicUrl, photoListPublicUrl } from "@/lib/media-url";
import { LiveBadge } from "@/components/LivePhoto";

type Props = {
  photos: PhotoMeta[];
  index: number;
  comments: Comment[];
  /** When false, hide the comments form/list (article albums). Default true. */
  enableComments?: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onDownload: (photo: PhotoMeta) => void | Promise<void>;
  author: string;
  body: string;
  postError: string | null;
  postBusy: boolean;
  onAuthorChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onPostComment: (e: FormEvent) => void;
};

type TripSlideData = SlideData & {
  photoId: string;
  kind: "image" | "video" | "live";
  videoSrc?: string;
  posterSrc?: string;
  liveVideoSrc?: string;
};

/** Neutral until natural size is known — never assume landscape (squashes portrait). */
const UNKNOWN_SIZE = 1;

function slideSize(photo: PhotoMeta): { width: number; height: number } {
  if (
    typeof photo.width === "number" &&
    typeof photo.height === "number" &&
    photo.width > 0 &&
    photo.height > 0
  ) {
    return { width: photo.width, height: photo.height };
  }
  return { width: UNKNOWN_SIZE, height: UNKNOWN_SIZE };
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildSlides(photos: PhotoMeta[]): TripSlideData[] {
  return photos.map((photo) => {
    const alt = photo.caption || photo.originalName;
    const { width, height } = slideSize(photo);
    if (isVideoMedia(photo)) {
      return {
        photoId: photo.id,
        kind: "video" as const,
        type: "video",
        width,
        height,
        alt,
        videoSrc: photoPublicUrl(photo.tripId, photo.filename),
        posterSrc: photo.posterFilename
          ? photoPublicUrl(photo.tripId, photo.posterFilename)
          : photo.thumbnailFilename
            ? photoPublicUrl(photo.tripId, photo.thumbnailFilename)
            : undefined,
        msrc: photo.posterFilename
          ? photoPublicUrl(photo.tripId, photo.posterFilename)
          : photoListPublicUrl(photo),
      };
    }

    const src = photoFullPublicUrl(photo);
    const msrc = photoListPublicUrl(photo);
    const live = isLivePhoto(photo) && Boolean(photo.liveVideoFilename);

    return {
      photoId: photo.id,
      kind: live ? ("live" as const) : ("image" as const),
      src,
      msrc,
      width,
      height,
      alt,
      liveVideoSrc:
        live && photo.liveVideoFilename
          ? liveVideoPublicUrl(photo.tripId, photo.liveVideoFilename)
          : undefined,
    };
  });
}

/**
 * Full-screen media viewer: PhotoSwipe 5 for still zoom/swipe physics,
 * custom chrome + comments aside, Live badge overlay, native video slides.
 */
export function MediaViewer({
  photos,
  index,
  comments,
  enableComments = true,
  onClose,
  onIndexChange,
  onDownload,
  author,
  body,
  postError,
  postBusy,
  onAuthorChange,
  onBodyChange,
  onPostComment,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pswpRef = useRef<PhotoSwipe | null>(null);
  const indexRef = useRef(index);
  const onIndexChangeRef = useRef(onIndexChange);
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);

  const [uiVisible, setUiVisible] = useState(true);
  const [currIndex, setCurrIndex] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const [livePlaying, setLivePlaying] = useState(false);
  const [liveBuffering, setLiveBuffering] = useState(false);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const livePlayGen = useRef(0);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  }, [onIndexChange]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const active = photos[currIndex] ?? photos[index] ?? null;
  const activeIsVideo = active ? isVideoMedia(active) : false;
  const activeIsLive = active ? isLivePhoto(active) : false;

  const activeComments = useMemo(() => {
    if (!active) return [];
    return comments
      .filter((c) => c.photoId === active.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [comments, active]);

  const stopLive = useCallback(() => {
    livePlayGen.current += 1;
    const v = liveVideoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      // Restore poster for the next open so the layer isn't a black flash.
      if (v.dataset.posterSrc) {
        v.poster = v.dataset.posterSrc;
      }
    }
    setLiveBuffering(false);
    setLivePlaying(false);
  }, []);

  /**
   * Live playback: show the video layer *before* play(), strip poster so we
   * never hear audio while still looking at a frozen still/poster frame.
   */
  const startLive = useCallback(async () => {
    const v = liveVideoRef.current;
    if (!v) return;
    const gen = ++livePlayGen.current;

    // Reveal layer immediately so PS still is covered.
    setLiveBuffering(true);
    setLivePlaying(true);

    try {
      v.playsInline = true;
      // Badge click is a user gesture — prefer sound; fall back to muted.
      v.muted = false;
      // Drop poster: same frame as the still; keeping it looks "stuck".
      if (v.poster) {
        v.dataset.posterSrc = v.poster;
        v.removeAttribute("poster");
      }
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }

      if (v.readyState < 2) {
        await new Promise<void>((resolve) => {
          const onReady = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            v.removeEventListener("canplay", onReady);
            v.removeEventListener("loadeddata", onReady);
          };
          v.addEventListener("canplay", onReady, { once: true });
          v.addEventListener("loadeddata", onReady, { once: true });
          // Prefer waiting on existing network load; only force load if empty.
          if (!v.src && v.currentSrc === "") {
            try {
              v.load();
            } catch {
              /* ignore */
            }
          }
          window.setTimeout(() => {
            cleanup();
            resolve();
          }, 4000);
        });
      }
      if (gen !== livePlayGen.current) return;

      try {
        await v.play();
      } catch {
        v.muted = true;
        await v.play();
      }
      if (gen !== livePlayGen.current) {
        v.pause();
        return;
      }

      // Wait until we actually advance past the first frame (motion visible).
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve();
        };
        const onTime = () => {
          if (v.currentTime > 0.02) finish();
        };
        const cleanup = () => {
          v.removeEventListener("timeupdate", onTime);
          v.removeEventListener("playing", finish);
        };
        v.addEventListener("timeupdate", onTime);
        v.addEventListener("playing", finish, { once: true });
        // rVFC when available (Safari/Chrome)
        const anyV = v as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        };
        if (typeof anyV.requestVideoFrameCallback === "function") {
          anyV.requestVideoFrameCallback(() => finish());
        }
        window.setTimeout(finish, 600);
      });
    } catch {
      if (gen === livePlayGen.current) {
        setLivePlaying(false);
      }
    } finally {
      if (gen === livePlayGen.current) setLiveBuffering(false);
    }
  }, []);

  const toggleLive = useCallback(
    (e?: React.MouseEvent | React.PointerEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (livePlaying || liveBuffering) stopLive();
      else void startLive();
    },
    [livePlaying, liveBuffering, startLive, stopLive],
  );

  // Init PhotoSwipe once when the viewer mounts
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || photos.length === 0) return;

    closingRef.current = false;
    const slides = buildSlides(photos);
    const startIndex = Math.min(Math.max(0, indexRef.current), slides.length - 1);

    const options: PhotoSwipeOptions = {
      dataSource: slides,
      index: startIndex,
      appendToEl: stage,
      bgOpacity: 1,
      spacing: 0.06,
      loop: photos.length > 2,
      wheelToZoom: true,
      pinchToClose: false,
      // Vertical drag close feels accidental with a bottom meta sheet on phones
      closeOnVerticalDrag: false,
      clickToCloseNonZoomable: false,
      imageClickAction: "zoom",
      bgClickAction: false,
      // Single tap toggles chrome only (never close / never fight Live badge)
      tapAction: () => {
        setUiVisible((v) => !v);
      },
      doubleTapAction: "zoom",
      maxZoomLevel: 4,
      secondaryZoomLevel: 2.5,
      // Full-bleed stage: chrome/aside are siblings or overlays — no letterbox padding
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      preload: [1, 2],
      preloaderDelay: 300,
      showHideAnimationType: "fade",
      showAnimationDuration: 200,
      hideAnimationDuration: 180,
      escKey: true,
      arrowKeys: true,
      trapFocus: true,
      returnFocus: true,
      arrowPrev: false,
      arrowNext: false,
      zoom: false,
      close: false,
      counter: false,
      mainClass: "media-viewer-pswp",
      errorMsg: "This media could not be loaded",
      getViewportSizeFn: () => {
        const el = stageRef.current;
        if (!el) {
          return {
            x: window.innerWidth,
            y: window.innerHeight,
          };
        }
        return {
          x: Math.max(1, el.clientWidth),
          y: Math.max(1, el.clientHeight),
        };
      },
    };

    const pswp = new PhotoSwipe(options);
    pswpRef.current = pswp;

    // Custom video slides
    pswp.on("contentLoad", (e) => {
      const { content } = e;
      const data = content.data as TripSlideData;
      if (data.kind !== "video" && data.type !== "video") return;

      e.preventDefault();
      const wrap = document.createElement("div");
      wrap.className = "media-viewer-pswp__video-wrap";

      const video = document.createElement("video");
      video.className = "media-viewer-pswp__video";
      video.src = data.videoSrc || "";
      if (data.posterSrc) video.poster = data.posterSrc;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("controlsList", "nodownload");
      wrap.appendChild(video);

      content.element = wrap;
      content.state = "loading";
      content.onLoaded();
    });

    pswp.on("contentActivate", ({ content }) => {
      const data = content.data as TripSlideData;
      if (data.kind === "video" || data.type === "video") {
        const video = content.element?.querySelector("video");
        if (video) {
          void video.play().catch(() => {
            /* autoplay may fail without gesture */
          });
        }
      }
    });

    pswp.on("contentDeactivate", ({ content }) => {
      const video = content.element?.querySelector("video");
      video?.pause();
    });

    // Correct size after decode — critical when DB lacks width/height or was 1×1
    pswp.on("loadComplete", (e) => {
      const { content } = e;
      const img = content.element;
      if (!(img instanceof HTMLImageElement)) return;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) return;
      if (content.data.width === nw && content.data.height === nh) return;
      content.data.width = nw;
      content.data.height = nh;
      try {
        content.slide?.updateContentSize(true);
      } catch {
        /* ignore */
      }
      pswp.updateSize(true);
    });

    pswp.on("change", () => {
      const next = pswp.currIndex;
      setCurrIndex(next);
      setZoomed(false);
      stopLive();
      setUiVisible(true);
      if (next !== indexRef.current) {
        onIndexChangeRef.current(next);
      }
    });

    pswp.on("zoomPanUpdate", ({ slide }) => {
      if (slide !== pswp.currSlide) return;
      const z = slide.currZoomLevel > slide.zoomLevels.initial + 0.02;
      setZoomed(z);
    });

    pswp.on("close", () => {
      closingRef.current = true;
      stopLive();
      pswpRef.current = null;
      onCloseRef.current();
    });

    pswp.init();
    setCurrIndex(pswp.currIndex);

    // Stage may still be 0×0 on first paint (flex); reflow after layout.
    const reflow = () => {
      try {
        pswp.updateSize(true);
      } catch {
        /* destroyed */
      }
    };
    const raf1 = window.requestAnimationFrame(() => {
      reflow();
      window.requestAnimationFrame(reflow);
    });
    const t1 = window.setTimeout(reflow, 50);
    const t2 = window.setTimeout(reflow, 200);

    const ro = new ResizeObserver(() => {
      reflow();
    });
    ro.observe(stage);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      pswpRef.current = null;
      try {
        // close() already destroys; unmount without close still needs destroy()
        pswp.destroy();
      } catch {
        /* already torn down */
      }
    };
    // Mount once per open; photo list identity is fixed for this session open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  // External index changes (nav buttons) → PhotoSwipe
  useEffect(() => {
    const pswp = pswpRef.current;
    if (!pswp || closingRef.current) return;
    if (pswp.currIndex === index) return;
    pswp.goTo(index);
  }, [index]);

  // Aside / chrome toggle changes stage box — reflow PhotoSwipe
  useEffect(() => {
    const pswp = pswpRef.current;
    if (!pswp || closingRef.current) return;
    // After CSS max-height transition paints
    const id = window.requestAnimationFrame(() => {
      pswp.updateSize(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [uiVisible]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Space: toggle normal video or Live clip when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (activeIsLive) {
        e.preventDefault();
        toggleLive();
        return;
      }
      if (!activeIsVideo) return;
      const pswp = pswpRef.current;
      const video = pswp?.currSlide?.content?.element?.querySelector("video");
      if (!video) return;
      e.preventDefault();
      if (video.paused) void video.play();
      else video.pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIsVideo, activeIsLive, toggleLive]);

  // Warm Live companion when landing on a Live slide (faster first tap)
  useEffect(() => {
    if (!activeIsLive || !active?.liveVideoFilename) return;
    const v = liveVideoRef.current;
    if (!v) return;
    try {
      v.preload = "auto";
      v.load();
    } catch {
      /* ignore */
    }
  }, [active?.id, activeIsLive, active?.liveVideoFilename]);

  const goPrev = useCallback(() => {
    pswpRef.current?.prev();
  }, []);

  const goNext = useCallback(() => {
    pswpRef.current?.next();
  }, []);

  const requestClose = useCallback(() => {
    const pswp = pswpRef.current;
    if (pswp) {
      pswp.close();
    } else {
      onClose();
    }
  }, [onClose]);

  if (!active) return null;

  const showNav =
    photos.length > 1 && !zoomed && !livePlaying && !liveBuffering;

  return (
    <div
      className="media-viewer fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal
      aria-label={
        activeIsVideo
          ? "Video viewer"
          : activeIsLive
            ? "Live Photo viewer"
            : "Photo viewer"
      }
    >
      {/* Top chrome */}
      <div
        className={`media-viewer__chrome absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 transition-opacity duration-200 sm:px-5 sm:pt-4 ${
          uiVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/60"
            aria-label="Close"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M18 6L6 18M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="min-w-0 rounded-full bg-black/35 px-3 py-1.5 backdrop-blur-md ring-1 ring-white/10">
            <p className="truncate text-sm font-medium text-white">
              {active.uploader}
              {active.featured ? (
                <span className="ml-1.5 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                  ★
                </span>
              ) : null}
            </p>
            <p className="truncate text-[11px] tabular-nums text-white/65">
              {currIndex + 1} / {photos.length}
            </p>
          </div>
          {activeIsLive && active.liveVideoFilename ? (
            <button
              type="button"
              className="flex h-7 shrink-0 touch-manipulation items-center justify-center"
              aria-label={livePlaying ? "Stop Live Photo" : "Play Live Photo"}
              aria-pressed={livePlaying}
              aria-busy={liveBuffering}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleLive}
            >
              <LiveBadge active={livePlaying} buffering={liveBuffering} />
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void onDownload(active)}
            className="hidden rounded-full bg-black/45 px-4 py-2 text-sm text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/60 sm:inline-flex"
          >
            Download
          </button>
          <button
            type="button"
            onClick={() => void onDownload(active)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/60 sm:hidden"
            aria-label="Download"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M12 4v12m0 0l-4-4m4 4l4-4M5 19h14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* PhotoSwipe mounts here */}
          <div
            ref={stageRef}
            className={`media-viewer__stage relative min-h-0 w-full flex-1 ${
              livePlaying || liveBuffering
                ? "media-viewer__stage--live-playing"
                : ""
            }`}
          />

          {/*
            Live companion: keep <video> mounted for preload, but the layer must
            NOT cover the still when idle (bg-black + z-index was blanking photos).
          */}
          {activeIsLive && active.liveVideoFilename ? (
            <div
              className={`media-viewer__live-layer absolute inset-0 z-[5] flex items-center justify-center transition-opacity duration-100 ${
                livePlaying || liveBuffering
                  ? "pointer-events-auto bg-black opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
              aria-hidden={!livePlaying && !liveBuffering}
            >
              <video
                key={`live-${active.id}`}
                ref={liveVideoRef}
                src={liveVideoPublicUrl(
                  active.tripId,
                  active.liveVideoFilename,
                )}
                poster={photoFullPublicUrl(active)}
                className="media-viewer__live-video max-h-full max-w-full bg-black object-contain"
                playsInline
                preload="auto"
                onEnded={stopLive}
                onClick={(e) => {
                  e.stopPropagation();
                  if (livePlaying || liveBuffering) stopLive();
                }}
                aria-label={active.caption || active.originalName}
              />
              {liveBuffering ? (
                <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-[10px] tracking-wide text-white/70 uppercase backdrop-blur-sm">
                  Loading Live…
                </p>
              ) : null}
              {livePlaying && !liveBuffering ? (
                <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-[10px] tracking-wide text-white/80 uppercase backdrop-blur-sm">
                  Live · tap to stop
                </p>
              ) : null}
            </div>
          ) : null}

          {showNav ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className={`media-viewer__nav absolute left-1.5 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/70 active:scale-95 sm:left-3 sm:h-12 sm:w-12 ${
                  uiVisible ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                aria-label="Previous"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M15 18l-6-6 6-6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className={`media-viewer__nav absolute right-1.5 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/70 active:scale-95 sm:right-3 sm:h-12 sm:w-12 ${
                  uiVisible ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                aria-label="Next"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M9 18l6-6-6-6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          ) : null}

          {uiVisible && !zoomed && !livePlaying ? (
            <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-1 text-[10px] tracking-wide text-white/55 uppercase backdrop-blur-sm lg:bottom-6">
              {activeIsVideo
                ? photos.length > 1
                  ? "Swipe or tap ◀ ▶"
                  : ""
                : activeIsLive
                  ? photos.length > 1
                    ? "Tap LIVE to play · swipe"
                    : "Tap LIVE to play"
                  : photos.length > 1
                    ? "Pinch · swipe or ◀ ▶"
                    : "Pinch or double-tap"}
            </p>
          ) : null}
        </div>

        {/* Meta + comments: one scroll column (EXIF scrolls with notes) */}
        <aside
          className={`media-viewer__aside relative z-20 flex w-full shrink-0 flex-col border-t border-white/10 bg-[#121212]/98 transition-[max-height,opacity] duration-200 lg:max-h-none lg:w-[min(340px,36vw)] lg:border-t-0 lg:border-l lg:border-white/10 ${
            uiVisible
              ? "max-h-[min(36dvh,320px)] sm:max-h-[min(38dvh,340px)]"
              : "max-h-0 overflow-hidden opacity-0 lg:max-h-none lg:opacity-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2.5 sm:px-5 sm:py-3">
            <div className="border-b border-white/10 pb-3">
              {active.caption ? (
                <p className="line-clamp-2 text-sm leading-snug text-white/90">
                  {active.caption}
                </p>
              ) : (
                <p className="truncate text-sm text-white/50">
                  {active.originalName}
                </p>
              )}
              <p className="mt-1 truncate text-[11px] text-white/45 sm:text-xs">
                {active.device ? (
                  <span className="text-white/60">{active.device}</span>
                ) : null}
                {active.device ? " · " : ""}
                {formatWhen(active.takenAt || active.uploadedAt)}
                {activeIsVideo
                  ? " · Video"
                  : activeIsLive
                    ? " · Live Photo"
                    : " · Photo"}
              </p>
              {(() => {
                const settings = formatCameraSettings(active);
                // Live: one total (still + companion). Never split Photo/Live sizes.
                const totalBytes =
                  (active.size || 0) +
                  (activeIsLive ? active.liveVideoSize || 0 : 0);
                const sizeLabel =
                  totalBytes > 0 ? formatFileSize(totalBytes) : null;
                if (!settings && !active.lens && !sizeLabel) return null;
                return (
                  <div className="mt-2 space-y-1">
                    <p className="flex flex-wrap items-center gap-1 font-mono text-[10px] leading-relaxed tracking-wide text-white/75 sm:gap-1.5 sm:text-[11px]">
                      {sizeLabel ? (
                        <span className="rounded-md bg-white/10 px-1.5 py-0.5 tabular-nums text-white/80">
                          {sizeLabel}
                        </span>
                      ) : null}
                      {settings
                        ? settings.split(" · ").map((part) => (
                            <span
                              key={part}
                              className="rounded-md bg-white/10 px-1.5 py-0.5 text-white/80"
                            >
                              {part}
                            </span>
                          ))
                        : null}
                    </p>
                    {active.lens ? (
                      <p className="truncate text-[10px] text-white/40">
                        {active.lens}
                      </p>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            <div className="mt-3 mb-2 flex items-baseline justify-between gap-2 sm:mt-4 sm:mb-3">
              {enableComments ? (
                <>
                  <h3 className="text-sm font-medium text-white/90">Comments</h3>
                  <span className="text-xs text-white/40">
                    {activeComments.length}{" "}
                    {activeComments.length === 1 ? "note" : "notes"}
                  </span>
                </>
              ) : (
                <h3 className="text-sm font-medium text-white/90">Details</h3>
              )}
            </div>

            {enableComments ? (
            <>
            <form
              onSubmit={(e) => void onPostComment(e)}
              className="mb-3 space-y-2 sm:mb-4"
            >
              <div className="grid gap-2 sm:grid-cols-[120px_1fr] lg:grid-cols-1">
                <input
                  value={author}
                  onChange={(e) => onAuthorChange(e.target.value)}
                  maxLength={40}
                  placeholder="Your name *"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-sea/50 focus:ring-2 focus:ring-sea/20"
                />
                <input
                  value={body}
                  onChange={(e) => onBodyChange(e.target.value)}
                  maxLength={500}
                  placeholder={
                    activeIsVideo ? "Great clip…" : "Love this light…"
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-sea/50 focus:ring-2 focus:ring-sea/20"
                />
              </div>
              {postError && <p className="text-sm text-coral">{postError}</p>}
              <button
                type="submit"
                disabled={postBusy}
                className="rounded-full bg-sea px-4 py-1.5 text-sm text-white transition hover:bg-sea-soft disabled:opacity-60"
              >
                {postBusy ? "Posting…" : "Post"}
              </button>
            </form>

            <div className="space-y-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {activeComments.length === 0 ? (
                <p className="text-sm text-white/40">
                  No comments yet — leave the first note.
                </p>
              ) : (
                activeComments.map((c) => (
                  <article
                    key={c.id}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-white/90">
                        {c.author}
                      </p>
                      <time className="text-[11px] text-white/35">
                        {formatWhen(c.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                      {c.body}
                    </p>
                  </article>
                ))
              )}
            </div>
            </>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
