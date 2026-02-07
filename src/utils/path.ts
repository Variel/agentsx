import { homedir } from "node:os";
import path from "node:path";
import type { PlatformPath, TargetSpec } from "../types.js";

export function expandHome(input: string): string {
  if (input === "~") {
    return homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(homedir(), input.slice(2));
  }
  return input;
}

function pickPlatformPath(platformPath: PlatformPath): string {
  if (typeof platformPath === "string") {
    return platformPath;
  }

  const selected =
    platformPath[process.platform as "darwin" | "linux" | "win32"] ??
    platformPath.default ??
    platformPath.linux ??
    platformPath.darwin;

  if (!selected) {
    throw new Error(`현재 플랫폼(${process.platform})에 대한 경로가 정의되지 않았습니다.`);
  }

  return selected;
}

export function resolveTargetAbsolutePath(target: TargetSpec, cwd: string): string {
  const rawPath = pickPlatformPath(target.path);

  if (target.scope === "home") {
    return path.join(homedir(), rawPath);
  }

  return path.join(cwd, rawPath);
}

export function ensureUnixSlashes(input: string): string {
  return input.split(path.sep).join("/");
}

export function repoSlugFromUrl(repoUrl: string): string {
  const normalized = repoUrl
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/:/g, "/")
    .replace(/\.git$/, "")
    .replace(/[^a-zA-Z0-9/._-]/g, "-")
    .replace(/\/{2,}/g, "/");

  return normalized.replace(/\//g, "__");
}
