import { mkdir } from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.js";
import { run, runOrThrow } from "../utils/shell.js";

function git(cwd: string, args: string[]): string {
  const result = runOrThrow("git", ["-C", cwd, ...args]);
  return result.stdout.trim();
}

function listRemoteBranches(mirrorPath: string): string[] {
  const result = run("git", ["-C", mirrorPath, "ls-remote", "--heads", "origin"]);
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[1] ?? "")
    .map((ref) => ref.replace("refs/heads/", ""))
    .filter(Boolean);
}

function remoteBranchExists(mirrorPath: string, branch: string): boolean {
  const result = run("git", ["-C", mirrorPath, "ls-remote", "--heads", "origin", branch]);
  if (result.status !== 0) {
    throw new Error(`원격 브랜치 조회 실패: origin/${branch}\n${result.stderr.trim()}`);
  }
  return result.stdout.trim().length > 0;
}

function localBranchExists(mirrorPath: string, branch: string): boolean {
  const result = run("git", ["-C", mirrorPath, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  return result.status === 0;
}

function hasAnyCommit(mirrorPath: string): boolean {
  const result = run("git", ["-C", mirrorPath, "rev-parse", "--verify", "HEAD"]);
  return result.status === 0;
}

function initRemoteBranch(mirrorPath: string, branch: string): void {
  if (localBranchExists(mirrorPath, branch)) {
    git(mirrorPath, ["checkout", branch]);
    git(mirrorPath, ["push", "-u", "origin", branch]);
    return;
  }

  if (hasAnyCommit(mirrorPath)) {
    git(mirrorPath, ["checkout", "-B", branch]);
    git(mirrorPath, ["push", "-u", "origin", branch]);
    return;
  }

  git(mirrorPath, ["checkout", "--orphan", branch]);
  runOrThrow("git", [
    "-C",
    mirrorPath,
    "-c",
    "user.name=agentsx",
    "-c",
    "user.email=agentsx@users.noreply.github.com",
    "commit",
    "--allow-empty",
    "-m",
    `chore: initialize remote branch ${branch}`,
  ]);
  git(mirrorPath, ["push", "-u", "origin", branch]);
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
  if (result.status === 0) {
    const ref = result.stdout.trim();
    if (ref.includes("/")) {
      return ref.split("/").at(-1) ?? "main";
    }
  }

  const heads = listRemoteBranches(mirrorPath);
  if (heads.includes("main")) {
    return "main";
  }
  if (heads.includes("master")) {
    return "master";
  }
  return heads[0] ?? "main";
}

export function prepareRemoteBranch(mirrorPath: string, branch: string): "ready" | "initialized" {
  git(mirrorPath, ["fetch", "origin", "--prune"]);

  if (!remoteBranchExists(mirrorPath, branch)) {
    initRemoteBranch(mirrorPath, branch);
    return "initialized";
  }

  if (localBranchExists(mirrorPath, branch)) {
    git(mirrorPath, ["checkout", branch]);
  } else {
    git(mirrorPath, ["checkout", "-b", branch, "--track", `origin/${branch}`]);
  }
  git(mirrorPath, ["pull", "--rebase", "origin", branch]);
  return "ready";
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
