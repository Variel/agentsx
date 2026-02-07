import path from "node:path";
import type { AgentAdapter, FileSnapshot, SideEntry, TargetSpec } from "../types.js";
import { exists, listFilesRecursive, statFile } from "../utils/fs.js";
import { hashFile } from "../utils/hash.js";
import { getLocalTargetBase, getRemoteTargetBase } from "./layout.js";

async function toSnapshot(absPath: string, mtimeMs: number): Promise<FileSnapshot> {
  return {
    absPath,
    hash: await hashFile(absPath),
    mtimeMs,
  };
}

export async function scanTargetSide(
  basePath: string,
  target: TargetSpec,
  targetId: string
): Promise<SideEntry[]> {
  if (!(await exists(basePath))) {
    return [];
  }

  if (target.kind === "file") {
    const fileStat = await statFile(basePath);
    if (!fileStat) {
      return [];
    }

    return [
      {
        targetId,
        relPath: path.basename(basePath),
        selector: undefined,
        snapshot: await toSnapshot(basePath, fileStat.mtimeMs),
      },
    ];
  }

  const files = await listFilesRecursive(basePath);
  const entries: SideEntry[] = [];
  for (const file of files) {
    entries.push({
      targetId,
      relPath: file.relPath,
      selector: undefined,
      snapshot: await toSnapshot(file.absPath, file.mtimeMs),
    });
  }

  return entries;
}

export async function scanLocalEntries(
  cwd: string,
  targets: TargetSpec[]
): Promise<SideEntry[]> {
  const all: SideEntry[] = [];
  for (const target of targets) {
    const basePath = getLocalTargetBase(target, cwd);
    const entries = await scanTargetSide(basePath, target, target.id);
    all.push(...entries);
  }
  return all;
}

export async function scanRemoteEntries(
  mirrorPath: string,
  agent: AgentAdapter,
  targets: TargetSpec[]
): Promise<SideEntry[]> {
  const all: SideEntry[] = [];
  for (const target of targets) {
    const basePath = getRemoteTargetBase(mirrorPath, agent, target);
    const entries = await scanTargetSide(basePath, target, target.id);
    all.push(...entries);
  }
  return all;
}
