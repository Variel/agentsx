import path from "node:path";
import type { AgentAdapter, TargetSpec } from "../types.js";
import { resolveTargetAbsolutePath } from "../utils/path.js";

export function getRemoteTargetBase(
  mirrorPath: string,
  agent: AgentAdapter,
  target: TargetSpec
): string {
  return path.join(mirrorPath, "agents", agent.key, target.id);
}

export function getLocalTargetBase(target: TargetSpec, cwd: string): string {
  return resolveTargetAbsolutePath(target, cwd);
}
