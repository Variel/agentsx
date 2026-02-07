import type { ConflictPolicy } from "../types.js";
import { runSyncCommand } from "../core/run-sync-command.js";

export async function runPush(
  agent: string,
  targets: string[],
  conflictPolicy?: ConflictPolicy
): Promise<void> {
  await runSyncCommand("push", agent, targets, conflictPolicy);
}
