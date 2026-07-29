import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";

const MIB = 1024 * 1024;

export const uploadLimits = {
  imageBytes: numberFromEnv("MAX_IMAGE_UPLOAD_BYTES", 30 * MIB),
  videoBytes: numberFromEnv("MAX_VIDEO_UPLOAD_BYTES", 105 * MIB),
  requestBytes: numberFromEnv("MAX_UPLOAD_REQUEST_BYTES", 128 * MIB),
  publicFiles: numberFromEnv("MAX_PUBLIC_UPLOAD_FILES", 2),
  adminFiles: numberFromEnv("MAX_ADMIN_UPLOAD_FILES", 50),
} as const;

export type StagedUpload = {
  fieldName: "file" | "liveVideo" | "files";
  originalName: string;
  declaredMimeType: string;
  byteSize: number;
  sha256: string;
  path: string;
};

export type ParsedMediaUpload = {
  files: StagedUpload[];
  fields: Record<string, string>;
};

type ParseOptions = {
  maxFiles: number;
};

type FileTaskResult =
  | { ok: true; index: number; file: StagedUpload }
  | { ok: false; error: Error };

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function stagingRoot(): string {
  const privateRoot = path.resolve(
    process.env.MEDIA_PRIVATE_ROOT || path.join(process.cwd(), "runtime", "media-private"),
  );
  return path.join(privateRoot, "staging", "incoming");
}

function normalizeFieldName(name: string): StagedUpload["fieldName"] | null {
  if (name === "file") return "file";
  if (name === "liveVideo") return "liveVideo";
  if (name === "files" || name === "files[]") return "files";
  return null;
}

function cleanOriginalName(value: string): string {
  const name = path.basename(value || "upload.bin").replace(/[\u0000-\u001f\u007f]/g, "_");
  return name.slice(0, 240) || "upload.bin";
}

export async function parseMediaUpload(
  request: Request,
  options: ParseOptions,
): Promise<ParsedMediaUpload> {
  if (!request.body) throw new Error("Upload body is required");

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new Error("Expected multipart/form-data");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > uploadLimits.requestBytes + MIB
  ) {
    throw new Error("Upload request is too large");
  }

  const root = stagingRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });

  const stagedPaths: string[] = [];
  const fields: Record<string, string> = {};
  const tasks: Promise<FileTaskResult>[] = [];
  let aggregateBytes = 0;
  let fileIndex = 0;

  const parser = Busboy({
    headers: Object.fromEntries(request.headers.entries()),
    limits: {
      files: options.maxFiles,
      fileSize: uploadLimits.videoBytes,
      fields: 8,
      fieldSize: 4 * 1024,
      parts: options.maxFiles + 8,
      headerPairs: 100,
    },
  });

  const input = Readable.fromWeb(
    request.body as Parameters<typeof Readable.fromWeb>[0],
  );

  const cleanup = async () => {
    await Promise.all(stagedPaths.map((file) => fs.unlink(file).catch(() => undefined)));
  };

  return await new Promise<ParsedMediaUpload>((resolve, reject) => {
    let settled = false;

    const fail = (cause: unknown) => {
      if (settled) return;
      settled = true;
      const error = cause instanceof Error ? cause : new Error("Upload failed");
      input.destroy();
      parser.destroy();
      void cleanup().finally(() => reject(error));
    };

    const onAbort = () => fail(new Error("Upload was cancelled"));
    request.signal.addEventListener("abort", onAbort, { once: true });

    parser.on("field", (name, value) => {
      if (name === "uploader" || name === "caption" || name === "token") {
        fields[name] = value;
      }
    });

    parser.on("file", (rawFieldName, stream, info) => {
      const fieldName = normalizeFieldName(rawFieldName);
      const index = fileIndex++;

      if (!fieldName) {
        stream.resume();
        return;
      }

      const target = path.join(root, `${randomUUID()}.upload`);
      stagedPaths.push(target);
      const hash = createHash("sha256");
      let byteSize = 0;
      let hitFileLimit = false;

      stream.once("limit", () => {
        hitFileLimit = true;
      });

      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          byteSize += chunk.length;
          aggregateBytes += chunk.length;
          if (aggregateBytes > uploadLimits.requestBytes) {
            callback(new Error("Upload request is too large"));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });

      const task = pipeline(
        stream,
        counter,
        createWriteStream(target, { flags: "wx", mode: 0o600 }),
      )
        .then<FileTaskResult>(() => {
          if (hitFileLimit) {
            return { ok: false, error: new Error(`${info.filename || "File"} is too large`) };
          }
          return {
            ok: true,
            index,
            file: {
              fieldName,
              originalName: cleanOriginalName(info.filename),
              declaredMimeType: (info.mimeType || "application/octet-stream").slice(0, 160),
              byteSize,
              sha256: hash.digest("hex"),
              path: target,
            },
          };
        })
        .catch<FileTaskResult>((error) => ({
          ok: false,
          error: error instanceof Error ? error : new Error("Could not stage upload"),
        }));
      tasks.push(task);
    });

    parser.once("filesLimit", () => fail(new Error(`Too many files (max ${options.maxFiles})`)));
    parser.once("fieldsLimit", () => fail(new Error("Too many form fields")));
    parser.once("partsLimit", () => fail(new Error("Too many multipart fields")));
    parser.once("error", fail);
    input.once("error", fail);

    parser.once("finish", () => {
      void Promise.all(tasks)
        .then(async (results) => {
          if (settled) return;
          const failed = results.find((result) => !result.ok);
          if (failed && !failed.ok) {
            fail(failed.error);
            return;
          }
          const files = results
            .filter((result): result is Extract<FileTaskResult, { ok: true }> => result.ok)
            .sort((a, b) => a.index - b.index)
            .map((result) => result.file);
          if (files.length === 0) {
            fail(new Error("Please choose at least one photo or video"));
            return;
          }
          settled = true;
          request.signal.removeEventListener("abort", onAbort);
          resolve({ files, fields });
        })
        .catch(fail);
    });

    input.pipe(parser);
  });
}

export async function removeStagedUploads(files: StagedUpload[]): Promise<void> {
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => undefined)));
}
