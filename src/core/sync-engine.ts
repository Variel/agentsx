import path from "node:path";
import type {
  AgentAdapter,
  AgentsxState,
  ConflictPolicy,
  PerFileDecision,
  PlannedOp,
  SyncCommand,
  TargetSpec,
} from "../types.js";
import { copySingleFile } from "../utils/fs.js";
import { getRememberedDecision, rememberConflictDecision, rememberConflictDefault } from "./state.js";
import { getLocalTargetBase, getRemoteTargetBase } from "./layout.js";
import { buildPlan, mergeEntries } from "./planner.js";
import { scanLocalEntries, scanRemoteEntries } from "./scanner.js";
import { promptConflictPolicy, promptPerFileDecision } from "../ui/prompts.js";

interface SyncEngineOptions {
  command: SyncCommand;
  adapter: AgentAdapter;
  targets: TargetSpec[];
  cwd: string;
  mirrorPath: string;
  state: AgentsxState;
  conflictStateKey: string;
  interactiveTargets: boolean;
  explicitPolicy: ConflictPolicy | undefined;
}

interface ExecutionSummary {
  copiedLocalToRemote: number;
  copiedRemoteToLocal: number;
  skipped: number;
  conflicts: number;
  policy: ConflictPolicy | undefined;
}

function opToDecision(
  command: SyncCommand,
  decision: PerFileDecision
): PlannedOp["action"] | "skip" {
  if (decision === "skip") {
    return "skip";
  }

  if (decision === "use-source") {
    return command === "pull" ? "copy-remote-to-local" : "copy-local-to-remote";
  }

  if (decision === "use-local") {
    return "copy-local-to-remote";
  }

  if (decision === "use-remote") {
    return "copy-remote-to-local";
  }

  return "skip";
}

function resolvePathForTarget(base: string, target: TargetSpec, relPath: string): string {
  if (target.kind === "file") {
    return base;
  }
  return path.join(base, relPath);
}

function createTargetMap(targets: TargetSpec[]): Map<string, TargetSpec> {
  const map = new Map<string, TargetSpec>();
  for (const target of targets) {
    map.set(target.id, target);
  }
  return map;
}

export async function executeSyncEngine(options: SyncEngineOptions): Promise<ExecutionSummary> {
  const localEntries = await scanLocalEntries(options.cwd, options.targets);
  const remoteEntries = await scanRemoteEntries(options.mirrorPath, options.adapter, options.targets);

  const localByKey = new Map(localEntries.map((item) => [`${item.targetId}:${item.relPath}`, item.snapshot]));
  const remoteByKey = new Map(remoteEntries.map((item) => [`${item.targetId}:${item.relPath}`, item.snapshot]));
  const targetById = createTargetMap(options.targets);

  const merged = mergeEntries(localEntries, remoteEntries);

  let selectedPolicy: ConflictPolicy | undefined;
  let ops: PlannedOp[] = [];
  let conflicts = 0;

  if (!options.interactiveTargets) {
    selectedPolicy =
      options.explicitPolicy ??
      options.state.conflictDefaults[options.conflictStateKey] ??
      (await promptConflictPolicy(options.state.conflictDefaults[options.conflictStateKey]));

    rememberConflictDefault(options.state, options.conflictStateKey, selectedPolicy);

    const planned = buildPlan(merged, options.command, selectedPolicy);
    conflicts = planned.conflicts.length;
    if (planned.blocked) {
      const names = planned.conflicts.map((item) => item.relPath).join(", ");
      throw new Error(`충돌로 인해 전체 실패했습니다. 정책: fail-all. 충돌 파일: ${names}`);
    }
    ops = planned.ops;
  } else {
    const planned = buildPlan(merged, options.command, "partial");
    conflicts = planned.conflicts.length;

    const filtered = planned.ops.filter((op) => op.reason !== "conflict-skip");
    ops = [...filtered];

    for (const conflict of planned.conflicts) {
      const remembered = getRememberedDecision(options.state, options.conflictStateKey, conflict.key);
      const decision = remembered ?? (await promptPerFileDecision(options.command, conflict));
      rememberConflictDecision(options.state, options.conflictStateKey, conflict.key, decision);

      const action = opToDecision(options.command, decision);
      if (action === "skip") {
        ops.push({
          key: conflict.key,
          targetId: conflict.targetId,
          relPath: conflict.relPath,
          action: "skip",
          reason: "conflict-skip",
        });
      } else {
        ops.push({
          key: conflict.key,
          targetId: conflict.targetId,
          relPath: conflict.relPath,
          action,
          reason: "overwrite",
        });
      }
    }
  }

  let copiedLocalToRemote = 0;
  let copiedRemoteToLocal = 0;
  let skipped = 0;

  for (const op of ops) {
    const target = targetById.get(op.targetId);
    if (!target) {
      skipped += 1;
      continue;
    }

    const localBase = getLocalTargetBase(target, options.cwd);
    const remoteBase = getRemoteTargetBase(options.mirrorPath, options.adapter, target);
    const localDest = resolvePathForTarget(localBase, target, op.relPath);
    const remoteDest = resolvePathForTarget(remoteBase, target, op.relPath);

    if (op.action === "copy-local-to-remote") {
      const source = localByKey.get(op.key)?.absPath;
      if (!source) {
        skipped += 1;
        continue;
      }
      await copySingleFile(source, remoteDest);
      copiedLocalToRemote += 1;
      continue;
    }

    if (op.action === "copy-remote-to-local") {
      const source = remoteByKey.get(op.key)?.absPath;
      if (!source) {
        skipped += 1;
        continue;
      }
      await copySingleFile(source, localDest);
      copiedRemoteToLocal += 1;
      continue;
    }

    skipped += 1;
  }

  return {
    copiedLocalToRemote,
    copiedRemoteToLocal,
    skipped,
    conflicts,
    policy: selectedPolicy,
  };
}
