import type { ConflictPolicy } from "../types.js";
import { runSyncCommand } from "../core/run-sync-command.js";

export async function runPush(
  agent: string,
  targets: string[],
  conflictPolicy?: ConflictPolicy,
  jsonPathRules: string[] = []
): Promise<void> {
  await runSyncCommand("push", agent, targets, conflictPolicy, jsonPathRules);
}
