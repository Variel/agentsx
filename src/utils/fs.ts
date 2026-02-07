import path from "node:path";
import { mkdir, readdir, rm, stat, copyFile } from "node:fs/promises";

export interface ListedFile {
  absPath: string;
  relPath: string;
  mtimeMs: number;
}

export interface FileStat {
  mtimeMs: number;
}

export async function exists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

export async function statFile(absPath: string): Promise<FileStat | undefined> {
  try {
    const fileStat = await stat(absPath);
    if (!fileStat.isFile()) {
      return undefined;
    }
    return { mtimeMs: fileStat.mtimeMs };
  } catch {
    return undefined;
  }
}

export async function ensureDir(absPath: string): Promise<void> {
  await mkdir(absPath, { recursive: true });
}

export async function listFilesRecursive(basePath: string): Promise<ListedFile[]> {
  const files: ListedFile[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const fileStat = await stat(fullPath);
        files.push({
          absPath: fullPath,
          relPath: path.relative(basePath, fullPath),
          mtimeMs: fileStat.mtimeMs,
        });
      }
    }
  }

  await walk(basePath);
  return files;
}

export async function resetDirectoryContents(basePath: string): Promise<void> {
  const has = await exists(basePath);
  if (!has) {
    return;
  }

  const entries = await readdir(basePath);
  for (const entry of entries) {
    await rm(path.join(basePath, entry), { recursive: true, force: true });
  }
}

export async function copySingleFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await copyFile(src, dest);
}
