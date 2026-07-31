import { createHash, randomUUID } from "crypto";
import {
  constants as fsConstants,
  createReadStream,
  createWriteStream,
  type ReadStream,
} from "fs";
import { promises as fs } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import type { MediaOwner } from "./owner";
import { ownerStorageRoot } from "./owner";

export type StorageArea = "private" | "public";

export type AtomicTarget = {
  finalPath: string;
  tempPath: string;
  commit: () => Promise<void>;
  abort: () => Promise<void>;
};

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertStorageKey(key: string): string {
  if (!key || key.length > 1024 || key.includes("\0") || key.includes("\\")) {
    throw new Error("Invalid media storage key");
  }
  if (path.posix.isAbsolute(key) || path.posix.normalize(key) !== key) {
    throw new Error("Invalid media storage key");
  }
  const segments = key.split("/");
  if (segments.some((segment) => {
    if (segment === ".staging" || segment === ".trash") return false;
    return !segment || segment === "." || segment === ".." || !SAFE_SEGMENT.test(segment);
  })) {
    throw new Error("Invalid media storage key");
  }
  return key;
}

function pathInside(root: string, key: string): string {
  const safeKey = assertStorageKey(key);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...safeKey.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Media storage key escaped its root");
  }
  return resolved;
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(directory, "r");
    await handle.sync();
  } catch {
    // Some filesystems/platforms do not support fsync on directories.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function tempNameFor(finalPath: string): string {
  const extension = path.extname(finalPath);
  const basename = path.basename(finalPath, extension);
  return path.join(
    path.dirname(finalPath),
    `.${basename}.${randomUUID()}.tmp${extension}`,
  );
}

async function fileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

export class LocalMediaStorage {
  readonly privateRoot: string;
  readonly publicRoot: string;
  readonly legacyRoot: string;

  constructor(
    options: {
      privateRoot?: string;
      publicRoot?: string;
      legacyRoot?: string;
    } = {},
  ) {
    this.privateRoot = path.resolve(
      options.privateRoot ||
        process.env.MEDIA_PRIVATE_ROOT ||
        path.join(process.cwd(), "runtime", "media-private"),
    );
    this.publicRoot = path.resolve(
      options.publicRoot ||
        process.env.MEDIA_PUBLIC_ROOT ||
        path.join(process.cwd(), "runtime", "media-public"),
    );
    this.legacyRoot = path.resolve(
      options.legacyRoot ||
        process.env.LEGACY_UPLOADS_ROOT ||
        path.join(process.cwd(), "public", "uploads"),
    );
  }

  root(area: StorageArea): string {
    return area === "public" ? this.publicRoot : this.privateRoot;
  }

  absolutePath(area: StorageArea, key: string): string {
    return pathInside(this.root(area), key);
  }

  /** Resolve on-disk path for a stored asset, including legacy import keys. */
  absolutePathForAsset(asset: {
    storageProvider: string;
    storageKey: string;
    isPublic: boolean;
    role?: string;
  }): string {
    const key = assertStorageKey(asset.storageKey);
    if (
      asset.storageProvider === "legacy" ||
      (asset.role && asset.role.startsWith("legacy_"))
    ) {
      return pathInside(this.legacyRoot, key);
    }
    return this.absolutePath(asset.isPublic ? "public" : "private", key);
  }

  async readAsset(asset: {
    storageProvider: string;
    storageKey: string;
    isPublic: boolean;
    role?: string;
  }): Promise<Buffer> {
    return fs.readFile(this.absolutePathForAsset(asset));
  }

  async copyIntoPrivate(
    sourcePath: string,
    privateKey: string,
  ): Promise<{ byteSize: number; sha256: string }> {
    const target = this.absolutePath("private", privateKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(sourcePath, target);
    const handle = await fs.open(target, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(path.dirname(target));
    const stat = await fs.stat(target);
    return { byteSize: stat.size, sha256: await fileSha256(target) };
  }

  async ensureRoots(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.privateRoot, { recursive: true }),
      fs.mkdir(this.publicRoot, { recursive: true }),
      fs.mkdir(path.join(this.privateRoot, ".staging"), { recursive: true }),
      fs.mkdir(path.join(this.privateRoot, ".trash"), { recursive: true }),
      fs.mkdir(path.join(this.publicRoot, ".trash"), { recursive: true }),
    ]);
  }

  createReadStream(area: StorageArea, key: string): ReadStream {
    return createReadStream(this.absolutePath(area, key));
  }

  read(area: StorageArea, key: string): Promise<Buffer> {
    return fs.readFile(this.absolutePath(area, key));
  }

  async exists(area: StorageArea, key: string): Promise<boolean> {
    try {
      await fs.access(this.absolutePath(area, key));
      return true;
    } catch {
      return false;
    }
  }

  stat(area: StorageArea, key: string) {
    return fs.stat(this.absolutePath(area, key));
  }

  async hash(area: StorageArea, key: string): Promise<string> {
    return fileSha256(this.absolutePath(area, key));
  }

  async createAtomicTarget(area: StorageArea, key: string): Promise<AtomicTarget> {
    const finalPath = this.absolutePath(area, key);
    const directory = path.dirname(finalPath);
    await fs.mkdir(directory, { recursive: true });
    const tempPath = tempNameFor(finalPath);
    let finished = false;
    return {
      finalPath,
      tempPath,
      commit: async () => {
        if (finished) return;
        const handle = await fs.open(tempPath, "r");
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(tempPath, finalPath);
        await syncDirectory(directory);
        finished = true;
      },
      abort: async () => {
        if (finished) return;
        await fs.unlink(tempPath).catch(() => undefined);
        finished = true;
      },
    };
  }

  async writeAtomic(
    area: StorageArea,
    key: string,
    contents: Uint8Array,
  ): Promise<{ byteSize: number; sha256: string }> {
    const target = await this.createAtomicTarget(area, key);
    try {
      const handle = await fs.open(target.tempPath, "wx", 0o640);
      try {
        await handle.writeFile(contents);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await target.commit();
    } catch (error) {
      await target.abort();
      throw error;
    }
    const buffer = Buffer.from(contents.buffer, contents.byteOffset, contents.byteLength);
    return {
      byteSize: contents.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    };
  }

  async writeStreamToStaging(
    stagingKey: string,
    source: NodeJS.ReadableStream,
    options: { maxBytes: number },
  ): Promise<{ byteSize: number; sha256: string }> {
    const key = assertStorageKey(`.staging/${stagingKey}`);
    const targetPath = this.absolutePath("private", key);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const hash = createHash("sha256");
    let byteSize = 0;
    const limiter = async function* () {
      for await (const chunk of source) {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : typeof chunk === "string"
            ? Buffer.from(chunk)
            : Buffer.from(chunk as Uint8Array);
        byteSize += buffer.length;
        if (byteSize > options.maxBytes) throw new Error("Media upload is too large");
        hash.update(buffer);
        yield buffer;
      }
    };
    try {
      await pipeline(limiter(), createWriteStream(targetPath, { flags: "wx", mode: 0o640 }));
      const handle = await fs.open(targetPath, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncDirectory(path.dirname(targetPath));
      return { byteSize, sha256: hash.digest("hex") };
    } catch (error) {
      await fs.unlink(targetPath).catch(() => undefined);
      throw error;
    }
  }

  async stageBuffer(
    stagingKey: string,
    contents: Uint8Array,
  ): Promise<{ key: string; byteSize: number; sha256: string }> {
    const key = assertStorageKey(`.staging/${stagingKey}`);
    const result = await this.writeAtomic("private", key, contents);
    return { key, ...result };
  }

  async promoteStaged(stagingKey: string, privateKey: string): Promise<void> {
    const source = this.absolutePath("private", stagingKey);
    const target = this.absolutePath("private", privateKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(source, target);
    await Promise.all([
      syncDirectory(path.dirname(source)),
      syncDirectory(path.dirname(target)),
    ]);
  }

  async adoptStagedFile(sourcePath: string, privateKey: string): Promise<void> {
    const source = path.resolve(sourcePath);
    const allowedRoots = [
      path.join(this.privateRoot, ".staging"),
      path.join(this.privateRoot, "staging"),
    ].map((root) => path.resolve(root));
    if (
      !allowedRoots.some(
        (root) => source !== root && source.startsWith(`${root}${path.sep}`),
      )
    ) {
      throw new Error("Staged upload is outside the private staging root");
    }
    const target = this.absolutePath("private", privateKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(source, target);
    await Promise.all([
      syncDirectory(path.dirname(source)),
      syncDirectory(path.dirname(target)),
    ]);
  }

  async discardStaged(stagingKey: string): Promise<void> {
    await fs.unlink(this.absolutePath("private", stagingKey)).catch(() => undefined);
  }

  async moveToTrash(
    area: StorageArea,
    key: string,
    trashKey: string,
  ): Promise<void> {
    const source = this.absolutePath(area, key);
    const targetKey = assertStorageKey(`.trash/${trashKey}`);
    const target = this.absolutePath(area, targetKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (await this.exists(area, targetKey)) {
      await fs.unlink(source).catch(() => undefined);
      return;
    }
    try {
      await fs.rename(source, target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      if (code !== "EXDEV") throw error;
      await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL);
      await fs.unlink(source);
    }
    await Promise.all([
      syncDirectory(path.dirname(source)),
      syncDirectory(path.dirname(target)),
    ]);
  }
}

export const localMediaStorage = new LocalMediaStorage();

export function mediaVersionPrefix(
  owner: MediaOwner,
  mediaId: string,
  version: number,
): string {
  return assertStorageKey(
    `${ownerStorageRoot(owner)}/${owner.id}/${mediaId}/v${version}`,
  );
}

export function mediaAssetKey(
  owner: MediaOwner,
  mediaId: string,
  version: number,
  filename: string,
): string {
  return assertStorageKey(
    `${mediaVersionPrefix(owner, mediaId, version)}/${filename}`,
  );
}

export function filenameForOwnerStorageKey(
  owner: MediaOwner,
  key: string,
): string {
  const safeKey = assertStorageKey(key);
  const prefix = `${ownerStorageRoot(owner)}/${owner.id}/`;
  if (safeKey.startsWith(prefix)) return safeKey.slice(prefix.length);
  return path.posix.basename(safeKey);
}

/** Trip-only alias kept for older call sites. */
export function filenameForTripStorageKey(tripId: string, key: string): string {
  return filenameForOwnerStorageKey({ kind: "trip", id: tripId }, key);
}
