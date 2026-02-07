import type { ConflictPolicy } from "../types.js";
import { runSyncCommand } from "../core/run-sync-command.js";

export async function runPull(
  agent: string,
  targets: string[],
  conflictPolicy?: ConflictPolicy,
  jsonPathRules: string[] = []
): Promise<void> {
  await runSyncCommand("pull", agent, targets, conflictPolicy, jsonPathRules);
}
