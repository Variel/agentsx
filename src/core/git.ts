import { mkdir } from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.js";
import { run, runOrThrow } from "../utils/shell.js";

function git(cwd: string, args: string[]): string {
  const result = runOrThrow("git", ["-C", cwd, ...args]);
  return result.stdout.trim();
}

export async function ensureRepoMirror(repoUrl: string, mirrorPath: string): Promise<void> {
  const repoGitDir = path.join(mirrorPath, ".git");
  if (await exists(repoGitDir)) {
    runOrThrow("git", ["-C", mirrorPath, "remote", "set-url", "origin", repoUrl]);
    return;
  }

  await mkdir(path.dirname(mirrorPath), { recursive: true });
  runOrThrow("git", ["clone", repoUrl, mirrorPath]);
}

export function getDefaultBranch(mirrorPath: string): string {
  const result = run("git", ["-C", mirrorPath, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (result.status !== 0) {
    return "main";
  }

  const ref = result.stdout.trim();
  if (!ref.includes("/")) {
    return "main";
  }

  return ref.split("/").at(-1) ?? "main";
}

export function pullLatest(mirrorPath: string, branch: string): void {
  git(mirrorPath, ["fetch", "origin", branch]);
  git(mirrorPath, ["checkout", branch]);
  git(mirrorPath, ["pull", "--rebase", "origin", branch]);
}

export function stageAll(mirrorPath: string): void {
  git(mirrorPath, ["add", "-A"]);
}

export function hasStagedChanges(mirrorPath: string): boolean {
  const result = run("git", ["-C", mirrorPath, "diff", "--cached", "--quiet"]);
  return result.status !== 0;
}

export function commitAndPush(mirrorPath: string, branch: string, message: string): void {
  git(mirrorPath, ["commit", "-m", message]);
  git(mirrorPath, ["push", "origin", branch]);
}
