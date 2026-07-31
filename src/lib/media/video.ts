import { execFile } from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";
import os from "os";
import path from "path";
import sharp from "sharp";
import {
  localMediaStorage,
  mediaAssetKey,
  type AtomicTarget,
  type LocalMediaStorage,
} from "./storage";
import { ownerFromIds } from "./owner";
import type { MediaAsset, MediaWithAssets } from "./types";

const execFileAsync = promisify(execFile);
const PROCESS_TIMEOUT_MS = Number(
  process.env.MEDIA_FFMPEG_TIMEOUT_MS || 30 * 60 * 1000,
);
const MAX_DURATION_SECONDS = Number(
  process.env.MEDIA_MAX_VIDEO_DURATION_SECONDS || 30 * 60,
);

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  duration?: string;
  avg_frame_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
};

type ProbeOutput = {
  format?: {
    format_name?: string;
    duration?: string;
    size?: string;
  };
  streams?: ProbeStream[];
};

export type VideoProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: string;
  pixelFormat: string;
  audioCodec?: string;
  formatNames: string[];
  compatibleMp4: boolean;
};

function finiteNumber(value: string | number | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function runBinary(
  executable: string,
  args: string[],
  options: { signal?: AbortSignal; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(executable, args, {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: options.timeout || PROCESS_TIMEOUT_MS,
      signal: options.signal,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { stderr?: string; code?: string };
    const detail = failure.stderr?.trim();
    throw new Error(
      `${executable} failed${failure.code ? ` (${failure.code})` : ""}: ${
        detail || failure.message
      }`,
    );
  }
}

export async function probeVideo(
  filePath: string,
  options: { signal?: AbortSignal } = {},
): Promise<VideoProbe> {
  const { stdout } = await runBinary(
    process.env.FFPROBE_PATH || "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=format_name,duration,size:stream=codec_type,codec_name,pix_fmt,width,height,duration,avg_frame_rate:stream_tags=rotate:stream_side_data=rotation",
      "-of",
      "json",
      filePath,
    ],
    options,
  );
  const parsed = JSON.parse(stdout) as ProbeOutput;
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  if (!video || !video.width || !video.height || !video.codec_name) {
    throw new Error("Uploaded file does not contain a valid video stream");
  }
  const durationSeconds = finiteNumber(video.duration || parsed.format?.duration);
  if (durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(
      `Video duration must be between 0 and ${MAX_DURATION_SECONDS} seconds`,
    );
  }
  if (video.width > 8192 || video.height > 8192) {
    throw new Error("Video dimensions exceed the supported 8192px limit");
  }
  const rotation =
    finiteNumber(video.tags?.rotate) ||
    finiteNumber(video.side_data_list?.find((item) => item.rotation)?.rotation);
  const rotated = Math.abs(rotation) % 180 === 90;
  const width = rotated ? video.height : video.width;
  const height = rotated ? video.width : video.height;
  const formats = (parsed.format?.format_name || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const compatibleMp4 =
    video.codec_name === "h264" &&
    ["yuv420p", "yuvj420p"].includes(video.pix_fmt || "") &&
    (!audio || audio.codec_name === "aac") &&
    formats.some((format) => ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].includes(format));
  return {
    durationSeconds,
    width,
    height,
    videoCodec: video.codec_name,
    pixelFormat: video.pix_fmt || "",
    audioCodec: audio?.codec_name,
    formatNames: formats,
    compatibleMp4,
  };
}

function sourceVideoAsset(media: MediaWithAssets, live: boolean): MediaAsset {
  const asset = live
    ? media.assets.live_original || media.assets.legacy_live
    : media.assets.original || media.assets.legacy_playback;
  if (!asset) {
    throw new Error(`Media ${media.id} has no ${live ? "Live Photo" : "video"} source`);
  }
  return asset;
}

async function runIntoTarget(
  target: AtomicTarget,
  args: string[],
  signal?: AbortSignal,
): Promise<void> {
  try {
    await runBinary(process.env.FFMPEG_PATH || "ffmpeg", [...args, target.tempPath], {
      signal,
    });
    await target.commit();
  } catch (error) {
    await target.abort();
    throw error;
  }
}

async function makePlayback(
  inputPath: string,
  outputKey: string,
  sourceProbe: VideoProbe,
  options: {
    storage: LocalMediaStorage;
    live: boolean;
    signal?: AbortSignal;
  },
): Promise<void> {
  const common = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
  ];

  if (sourceProbe.compatibleMp4) {
    const target = await options.storage.createAtomicTarget("public", outputKey);
    try {
      await runIntoTarget(
        target,
        [
          ...common,
          "-c",
          "copy",
          "-map_metadata",
          "-1",
          "-movflags",
          "+faststart",
          "-f",
          "mp4",
        ],
        options.signal,
      );
      return;
    } catch {
      // A nominally compatible MOV can still fail to remux; transcode below.
    }
  }

  const maxWidth = options.live ? 1280 : 1920;
  const crf = options.live ? "25" : "23";
  const audioBitrate = options.live ? "96k" : "128k";
  const target = await options.storage.createAtomicTarget("public", outputKey);
  await runIntoTarget(
    target,
    [
      ...common,
      "-vf",
      `scale=w='min(${maxWidth},iw)':h=-2:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=fps='min(source_fps,30)'`,
      "-c:v",
      "libx264",
      "-preset",
      process.env.MEDIA_FFMPEG_PRESET || "fast",
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      audioBitrate,
      "-map_metadata",
      "-1",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
    ],
    options.signal,
  );
}

async function makePoster(
  videoPath: string,
  outputKey: string,
  durationSeconds: number,
  storage: LocalMediaStorage,
  signal?: AbortSignal,
): Promise<void> {
  // Homebrew ffmpeg often lacks libwebp; pull a JPEG frame then convert with sharp.
  const seek = Math.min(2, Math.max(0.1, durationSeconds * 0.1)).toFixed(3);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "trip-poster-"));
  const framePath = path.join(tempDir, "frame.jpg");
  try {
    await runBinary(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        seek,
        "-i",
        videoPath,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-vf",
        "scale=w='min(960,iw)':h=-2:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-q:v",
        "3",
        framePath,
      ],
      { signal },
    );
    const webp = await sharp(framePath, { failOn: "none" })
      .rotate()
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
    await storage.writeAtomic("public", outputKey, webp);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function posterAssetFromFile(
  media: MediaWithAssets,
  posterKey: string,
  storage: LocalMediaStorage,
  signal?: AbortSignal,
): Promise<MediaAsset> {
  const posterPath = storage.absolutePath("public", posterKey);
  const posterStat = await fs.stat(posterPath);
  const { stdout } = await runBinary(
    process.env.FFPROBE_PATH || "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=s=x:p=0",
      posterPath,
    ],
    { signal },
  );
  const [width, height] = stdout.trim().split("x").map(Number);
  return {
    mediaId: media.id,
    role: "poster",
    storageProvider: "local",
    storageKey: posterKey,
    mimeType: "image/webp",
    byteSize: posterStat.size,
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
    sha256: await storage.hash("public", posterKey),
    isPublic: true,
  };
}

/**
 * Fast path: extract a gallery poster from the original / legacy video
 * without waiting for full remux/transcode. Publish this first for UX.
 */
export async function generateVideoPoster(
  media: MediaWithAssets,
  options: {
    storage?: LocalMediaStorage;
    signal?: AbortSignal;
  } = {},
): Promise<MediaAsset> {
  const storage = options.storage || localMediaStorage;
  const source = sourceVideoAsset(media, false);
  const sourcePath = storage.absolutePathForAsset(source);
  const sourceProbe = await probeVideo(sourcePath, { signal: options.signal });
  const posterKey = mediaAssetKey(
    ownerFromIds(media),
    media.id,
    media.version,
    "poster-960.webp",
  );
  await makePoster(
    sourcePath,
    posterKey,
    sourceProbe.durationSeconds,
    storage,
    options.signal,
  );
  return posterAssetFromFile(media, posterKey, storage, options.signal);
}

export async function generateVideoAssets(
  media: MediaWithAssets,
  options: {
    live?: boolean;
    storage?: LocalMediaStorage;
    signal?: AbortSignal;
    /** When true, skip poster (caller already published one). */
    skipPoster?: boolean;
  } = {},
): Promise<MediaAsset[]> {
  const storage = options.storage || localMediaStorage;
  const live = options.live === true;
  const source = sourceVideoAsset(media, live);
  const sourcePath = storage.absolutePathForAsset(source);
  const sourceProbe = await probeVideo(sourcePath, { signal: options.signal });
  const playbackFilename = live ? "live-playback.mp4" : "playback.mp4";
  const playbackKey = mediaAssetKey(
    ownerFromIds(media),
    media.id,
    media.version,
    playbackFilename,
  );
  await makePlayback(sourcePath, playbackKey, sourceProbe, {
    storage,
    live,
    signal: options.signal,
  });
  const playbackPath = storage.absolutePath("public", playbackKey);
  const outputProbe = await probeVideo(playbackPath, { signal: options.signal });
  const playbackStat = await fs.stat(playbackPath);
  const assets: MediaAsset[] = [
    {
      mediaId: media.id,
      role: live ? "live_playback" : "playback",
      storageProvider: "local",
      storageKey: playbackKey,
      mimeType: "video/mp4",
      byteSize: playbackStat.size,
      width: outputProbe.width,
      height: outputProbe.height,
      durationMs: Math.round(outputProbe.durationSeconds * 1000),
      sha256: await storage.hash("public", playbackKey),
      isPublic: true,
    },
  ];

  if (!live && !options.skipPoster) {
    const posterKey = mediaAssetKey(
    ownerFromIds(media),
      media.id,
      media.version,
      "poster-960.webp",
    );
    await makePoster(
      playbackPath,
      posterKey,
      outputProbe.durationSeconds,
      storage,
      options.signal,
    );
    assets.push(
      await posterAssetFromFile(media, posterKey, storage, options.signal),
    );
  }

  return assets;
}

