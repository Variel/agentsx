import type { ConflictPolicy } from "../types.js";
import { runSyncCommand } from "../core/run-sync-command.js";

export async function runSync(
  agent: string,
  targets: string[],
  conflictPolicy?: ConflictPolicy
): Promise<void> {
  await runSyncCommand("sync", agent, targets, conflictPolicy);
}
