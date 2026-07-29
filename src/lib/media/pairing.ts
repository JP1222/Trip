import path from "path";
import type { StagedUpload } from "@/lib/upload-stream";

export type StagedMediaUnit =
  | {
      kind: "live";
      still: StagedUpload;
      live: StagedUpload;
    }
  | {
      kind: "single";
      file: StagedUpload;
    };

function isVideoUpload(file: StagedUpload): boolean {
  const mime = file.declaredMimeType.toLowerCase();
  const name = file.originalName.toLowerCase();
  return (
    mime.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(name)
  );
}

function isLiveCompanion(file: StagedUpload): boolean {
  return isVideoUpload(file) && /\.(mov|mp4|m4v)$/i.test(file.originalName);
}

function stem(name: string): string {
  return path.basename(name).toLowerCase().replace(/\.[^.]+$/, "");
}

/**
 * Pair staged multipart uploads into gallery units.
 * Same basename image + .mov/.mp4 becomes one Live Photo.
 */
export function pairStagedUploads(files: StagedUpload[]): StagedMediaUnit[] {
  const liveByStem = new Map<string, StagedUpload>();
  const stills: StagedUpload[] = [];
  const videos: StagedUpload[] = [];

  for (const file of files) {
    if (isLiveCompanion(file)) {
      liveByStem.set(stem(file.originalName), file);
    } else if (isVideoUpload(file)) {
      videos.push(file);
    } else {
      stills.push(file);
    }
  }

  const units: StagedMediaUnit[] = [];
  const usedLive = new Set<string>();

  for (const still of stills) {
    const key = stem(still.originalName);
    const live = liveByStem.get(key);
    if (live) {
      usedLive.add(live.path);
      units.push({ kind: "live", still, live });
    } else {
      units.push({ kind: "single", file: still });
    }
  }

  for (const video of videos) {
    units.push({ kind: "single", file: video });
  }

  for (const live of liveByStem.values()) {
    if (usedLive.has(live.path)) continue;
    units.push({ kind: "single", file: live });
  }

  return units;
}

export function stagedToSource(file: StagedUpload) {
  return {
    path: file.path,
    originalName: file.originalName,
    declaredMimeType: file.declaredMimeType,
    byteSize: file.byteSize,
    sha256: file.sha256,
  };
}
