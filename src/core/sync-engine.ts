import path from "node:path";
import type {
  AgentAdapter,
  AgentsxState,
  ConflictPolicy,
  PerFileDecision,
  PlannedOp,
  SideEntry,
  SyncCommand,
  TargetSpec,
} from "../types.js";
import { copySingleFile } from "../utils/fs.js";
import { getRememberedDecision, rememberConflictDecision, rememberConflictDefault } from "./state.js";
import { getLocalTargetBase, getRemoteTargetBase } from "./layout.js";
import { buildPlan, mergeEntries } from "./planner.js";
import { scanLocalEntries, scanRemoteEntries } from "./scanner.js";
import { promptConflictPolicy, promptPerFileDecision } from "../ui/prompts.js";
import {
  applyStructuredSelectionFile,
  getSelectorSnapshot,
  isStructuredConfigTarget,
  readStructuredFile,
  resolveTargetFormat,
} from "./structured-config.js";

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
  jsonPathSelectionsByTarget: Record<string, string[]>;
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

function sideEntryKey(entry: SideEntry): string {
  return `${entry.targetId}:${entry.relPath}`;
}

function dedupeSelectors(input: string[]): string[] {
  return [...new Set(input.map((item) => item.trim()).filter(Boolean))];
}

async function buildSelectorEntries(
  target: TargetSpec,
  selectors: string[],
  localFileEntry: SideEntry | undefined,
  remoteFileEntry: SideEntry | undefined,
  localBasePath: string,
  remoteBasePath: string
): Promise<{ local: SideEntry[]; remote: SideEntry[] }> {
  const local: SideEntry[] = [];
  const remote: SideEntry[] = [];

  const fileName = path.basename(localBasePath || remoteBasePath || target.id);
  const formatFromPath = localFileEntry?.snapshot.absPath ?? remoteFileEntry?.snapshot.absPath ?? localBasePath;
  const format = resolveTargetFormat(target, formatFromPath);

  const localDoc = localFileEntry
    ? await readStructuredFile(localFileEntry.snapshot.absPath, format)
    : undefined;
  const remoteDoc = remoteFileEntry
    ? await readStructuredFile(remoteFileEntry.snapshot.absPath, format)
    : undefined;

  for (const selector of dedupeSelectors(selectors)) {
    const relPath = `${fileName}#${selector}`;

    if (localDoc && localFileEntry) {
      const snapshot = getSelectorSnapshot(localDoc, selector);
      if (snapshot.exists && snapshot.hash) {
        local.push({
          targetId: target.id,
          relPath,
          selector,
          snapshot: {
            absPath: localFileEntry.snapshot.absPath,
            hash: snapshot.hash,
            mtimeMs: localFileEntry.snapshot.mtimeMs,
          },
        });
      }
    }

    if (remoteDoc && remoteFileEntry) {
      const snapshot = getSelectorSnapshot(remoteDoc, selector);
      if (snapshot.exists && snapshot.hash) {
        remote.push({
          targetId: target.id,
          relPath,
          selector,
          snapshot: {
            absPath: remoteFileEntry.snapshot.absPath,
            hash: snapshot.hash,
            mtimeMs: remoteFileEntry.snapshot.mtimeMs,
          },
        });
      }
    }
  }

  return { local, remote };
}

async function expandEntriesByStructuredSelectors(
  options: SyncEngineOptions,
  localEntries: SideEntry[],
  remoteEntries: SideEntry[],
  targetById: Map<string, TargetSpec>
): Promise<{ localEntries: SideEntry[]; remoteEntries: SideEntry[] }> {
  const expandedLocal: SideEntry[] = [];
  const expandedRemote: SideEntry[] = [];

  const selectedTargets = new Set(
    Object.entries(options.jsonPathSelectionsByTarget)
      .filter(([, selectors]) => selectors.length > 0)
      .map(([targetId]) => targetId)
  );

  const localByTarget = new Map<string, SideEntry[]>();
  const remoteByTarget = new Map<string, SideEntry[]>();

  for (const entry of localEntries) {
    const arr = localByTarget.get(entry.targetId) ?? [];
    arr.push(entry);
    localByTarget.set(entry.targetId, arr);
  }

  for (const entry of remoteEntries) {
    const arr = remoteByTarget.get(entry.targetId) ?? [];
    arr.push(entry);
    remoteByTarget.set(entry.targetId, arr);
  }

  const handledTargets = new Set<string>();

  for (const targetId of selectedTargets) {
    const target = targetById.get(targetId);
    if (!target || !isStructuredConfigTarget(target)) {
      continue;
    }

    const selectors = options.jsonPathSelectionsByTarget[targetId] ?? [];
    if (selectors.length === 0) {
      continue;
    }

    const localTargetEntries = localByTarget.get(targetId) ?? [];
    const remoteTargetEntries = remoteByTarget.get(targetId) ?? [];

    const localFileEntry = localTargetEntries.find((entry) => entry.selector === undefined);
    const remoteFileEntry = remoteTargetEntries.find((entry) => entry.selector === undefined);

    const localBasePath = getLocalTargetBase(target, options.cwd);
    const remoteBasePath = getRemoteTargetBase(options.mirrorPath, options.adapter, target);

    const selectorEntries = await buildSelectorEntries(
      target,
      selectors,
      localFileEntry,
      remoteFileEntry,
      localBasePath,
      remoteBasePath
    );

    expandedLocal.push(...selectorEntries.local);
    expandedRemote.push(...selectorEntries.remote);
    handledTargets.add(targetId);
  }

  for (const entry of localEntries) {
    if (!handledTargets.has(entry.targetId)) {
      expandedLocal.push(entry);
    }
  }

  for (const entry of remoteEntries) {
    if (!handledTargets.has(entry.targetId)) {
      expandedRemote.push(entry);
    }
  }

  return {
    localEntries: expandedLocal,
    remoteEntries: expandedRemote,
  };
}

export async function executeSyncEngine(options: SyncEngineOptions): Promise<ExecutionSummary> {
  const targetById = createTargetMap(options.targets);

  const scannedLocalEntries = await scanLocalEntries(options.cwd, options.targets);
  const scannedRemoteEntries = await scanRemoteEntries(options.mirrorPath, options.adapter, options.targets);

  const expanded = await expandEntriesByStructuredSelectors(
    options,
    scannedLocalEntries,
    scannedRemoteEntries,
    targetById
  );

  const localEntries = expanded.localEntries;
  const remoteEntries = expanded.remoteEntries;

  const localByKey = new Map(localEntries.map((item) => [sideEntryKey(item), item]));
  const remoteByKey = new Map(remoteEntries.map((item) => [sideEntryKey(item), item]));

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
          selector: conflict.selector,
          action: "skip",
          reason: "conflict-skip",
        });
      } else {
        ops.push({
          key: conflict.key,
          targetId: conflict.targetId,
          relPath: conflict.relPath,
          selector: conflict.selector,
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
      const sourceEntry = localByKey.get(op.key);
      const source = sourceEntry?.snapshot.absPath;
      if (!source) {
        skipped += 1;
        continue;
      }

      if (op.selector && isStructuredConfigTarget(target)) {
        const structuredResult = await applyStructuredSelectionFile(source, remoteDest, target, [op.selector]);
        if (structuredResult.missingSelectors.length > 0) {
          console.warn(
            `경고: ${target.id}에서 매칭되지 않은 jsonpath: ${structuredResult.missingSelectors.join(", ")}`
          );
        }
        if (structuredResult.applied === 0) {
          skipped += 1;
          continue;
        }
      } else {
        await copySingleFile(source, remoteDest);
      }

      copiedLocalToRemote += 1;
      continue;
    }

    if (op.action === "copy-remote-to-local") {
      const sourceEntry = remoteByKey.get(op.key);
      const source = sourceEntry?.snapshot.absPath;
      if (!source) {
        skipped += 1;
        continue;
      }

      if (op.selector && isStructuredConfigTarget(target)) {
        const structuredResult = await applyStructuredSelectionFile(source, localDest, target, [op.selector]);
        if (structuredResult.missingSelectors.length > 0) {
          console.warn(
            `경고: ${target.id}에서 매칭되지 않은 jsonpath: ${structuredResult.missingSelectors.join(", ")}`
          );
        }
        if (structuredResult.applied === 0) {
          skipped += 1;
          continue;
        }
      } else {
        await copySingleFile(source, localDest);
      }

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
