import type { ConflictPolicy, SyncCommand } from "../types.js";
import { resolveAgentAdapter } from "../agents/registry.js";
import { prepareRemoteBranch, stageAll, hasStagedChanges, commitAndPush } from "./git.js";
import { conflictDefaultKey, saveState } from "./state.js";
import { selectTargets } from "./targets.js";
import { executeSyncEngine } from "./sync-engine.js";
import { requireRemote } from "./remote.js";

function timestampIso(): string {
  return new Date().toISOString();
}

function commitMessage(command: SyncCommand, agent: string): string {
  return `agentsx(${command}): ${agent} @ ${timestampIso()}`;
}

export async function runSyncCommand(
  command: SyncCommand,
  agentInput: string,
  targetIds: string[],
  conflictPolicy?: ConflictPolicy
): Promise<void> {
  const adapter = resolveAgentAdapter(agentInput);
  const { state, remote } = await requireRemote();

  const remoteStatus = prepareRemoteBranch(remote.mirrorPath, remote.defaultBranch);
  if (remoteStatus === "initialized") {
    console.log(
      `원격 브랜치 origin/${remote.defaultBranch}가 없어 자동 초기화했습니다.`
    );
  }

  const selection = await selectTargets(adapter, targetIds);
  if (selection.targets.length === 0) {
    throw new Error("동기화할 대상을 최소 1개 이상 선택해야 합니다.");
  }

  const conflictKey = conflictDefaultKey(command, adapter.key, selection.targets.map((target) => target.id));

  const summary = await executeSyncEngine({
    command,
    adapter,
    targets: selection.targets,
    cwd: process.cwd(),
    mirrorPath: remote.mirrorPath,
    state,
    conflictStateKey: conflictKey,
    interactiveTargets: selection.interactive,
    explicitPolicy: conflictPolicy,
  });

  state.lastSyncAtByAgent[adapter.key] = new Date().toISOString();
  await saveState(state);

  const remoteChanged = summary.copiedLocalToRemote > 0;
  if (remoteChanged && (command === "push" || command === "sync")) {
    stageAll(remote.mirrorPath);
    if (hasStagedChanges(remote.mirrorPath)) {
      commitAndPush(remote.mirrorPath, remote.defaultBranch, commitMessage(command, adapter.key));
    }
  }

  console.log([
    `명령: ${command}`,
    `에이전트: ${adapter.displayName} (${adapter.key})`,
    `충돌: ${summary.conflicts}`,
    `복사(local->remote): ${summary.copiedLocalToRemote}`,
    `복사(remote->local): ${summary.copiedRemoteToLocal}`,
    `건너뜀: ${summary.skipped}`,
    summary.policy ? `충돌정책: ${summary.policy}` : undefined,
    adapter.references.length > 0 ? `참고 문서: ${adapter.references.join(", ")}` : undefined,
  ].filter(Boolean).join("\n"));
}
