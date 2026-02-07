import type { ConflictPolicy, SyncCommand } from "../types.js";
import { resolveAgentAdapter } from "../agents/registry.js";
import { prepareRemoteBranch, stageAll, hasStagedChanges, commitAndPush } from "./git.js";
import { conflictDefaultKey, saveState } from "./state.js";
import { selectTargets } from "./targets.js";
import { executeSyncEngine } from "./sync-engine.js";
import { requireRemote } from "./remote.js";
import {
  combineJsonPathSelections,
  parseCliJsonPathSelections,
  promptInteractiveCombinedSelection,
} from "./target-selectors.js";

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
  conflictPolicy?: ConflictPolicy,
  jsonPathRules: string[] = []
): Promise<void> {
  const adapter = resolveAgentAdapter(agentInput);
  const { state, remote } = await requireRemote();
  const cwd = process.cwd();

  const remoteStatus = prepareRemoteBranch(remote.mirrorPath, remote.defaultBranch);
  if (remoteStatus === "initialized") {
    console.log(`원격 브랜치 origin/${remote.defaultBranch}가 없어 자동 초기화했습니다.`);
  }

  const requestedTargets = targetIds.map((item) => item.trim()).filter(Boolean);

  let selectedTargets = [] as typeof adapter.targets;
  let interactiveTargets = false;
  let interactiveJsonPathSelections: Record<string, string[]> = {};
  let subpathSelectionsByTarget: Record<string, string[]> = {};

  if (requestedTargets.length === 0) {
    const interactiveSelection = await promptInteractiveCombinedSelection(
      command,
      adapter,
      adapter.targets,
      cwd,
      remote.mirrorPath
    );
    selectedTargets = interactiveSelection.selectedTargets;
    interactiveTargets = true;
    interactiveJsonPathSelections = interactiveSelection.jsonPathSelectionsByTarget;
    subpathSelectionsByTarget = interactiveSelection.subpathSelectionsByTarget;
  } else {
    const selection = await selectTargets(adapter, requestedTargets);
    selectedTargets = selection.targets;
    interactiveTargets = selection.interactive;
  }

  if (selectedTargets.length === 0) {
    throw new Error("동기화할 대상을 최소 1개 이상 선택해야 합니다.");
  }

  const cliJsonPathSelections = parseCliJsonPathSelections(selectedTargets, jsonPathRules);
  const jsonPathSelectionsByTarget = combineJsonPathSelections(
    cliJsonPathSelections,
    interactiveJsonPathSelections
  );

  const selectionFingerprint = selectedTargets.map((target) => {
    const selectors = jsonPathSelectionsByTarget[target.id];
    const subpaths = subpathSelectionsByTarget[target.id];

    const parts: string[] = [];
    if (selectors && selectors.length > 0) {
      parts.push(`jp=${selectors.slice().sort().join("&")}`);
    }
    if (subpaths && subpaths.length > 0) {
      parts.push(`sp=${subpaths.slice().sort().join("&")}`);
    }

    return `${target.id}:${parts.length > 0 ? parts.join("|") : "*"}`;
  });
  const conflictKey = conflictDefaultKey(command, adapter.key, selectionFingerprint);

  const summary = await executeSyncEngine({
    command,
    adapter,
    targets: selectedTargets,
    cwd,
    mirrorPath: remote.mirrorPath,
    state,
    conflictStateKey: conflictKey,
    interactiveTargets,
    explicitPolicy: conflictPolicy,
    jsonPathSelectionsByTarget,
    subpathSelectionsByTarget,
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
    Object.keys(jsonPathSelectionsByTarget).length > 0
      ? `세부선택(jsonpath): ${JSON.stringify(jsonPathSelectionsByTarget)}`
      : undefined,
    Object.keys(subpathSelectionsByTarget).length > 0
      ? `세부선택(subpath): ${JSON.stringify(subpathSelectionsByTarget)}`
      : undefined,
    adapter.references.length > 0 ? `참고 문서: ${adapter.references.join(", ")}` : undefined,
  ].filter(Boolean).join("\n"));
}
