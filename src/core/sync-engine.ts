import path from "node:path";
import type {
  AgentAdapter,
  AgentsxState,
  ConflictItem,
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
  extractStructuredSubtree,
  getSelectorSnapshot,
  isStructuredConfigTarget,
  prefixJsonPath,
  readStructuredFile,
  resolveTargetFormat,
} from "./structured-config.js";
import { promptJsonSubtreeDrilldownSelection } from "../ui/structured-tree.js";
import { select } from "@inquirer/prompts";

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
  subpathSelectionsByTarget: Record<string, string[]>;
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

function actionToDecision(
  command: SyncCommand,
  action: PlannedOp["action"] | "skip"
): PerFileDecision | undefined {
  if (action === "skip") {
    return "skip";
  }

  if (command === "push") {
    return action === "copy-local-to-remote" ? "use-source" : undefined;
  }
  if (command === "pull") {
    return action === "copy-remote-to-local" ? "use-source" : undefined;
  }
  return action === "copy-local-to-remote" ? "use-local" : "use-remote";
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

function normalizeRel(input: string): string {
  return input.replace(/\\/g, "/");
}

function isMatchedSubpath(relPath: string, subpath: string): boolean {
  const normalizedRel = normalizeRel(relPath);
  const normalizedSub = normalizeRel(subpath).replace(/\/+$/, "");
  if (!normalizedSub) {
    return true;
  }
  return normalizedRel === normalizedSub || normalizedRel.startsWith(`${normalizedSub}/`);
}

function filterEntriesBySubpaths(
  entries: SideEntry[],
  targetById: Map<string, TargetSpec>,
  selections: Record<string, string[]>
): SideEntry[] {
  return entries.filter((entry) => {
    const target = targetById.get(entry.targetId);
    if (!target || target.kind !== "dir") {
      return true;
    }

    const subpaths = selections[target.id];
    if (!subpaths || subpaths.length === 0) {
      return true;
    }

    return subpaths.some((subpath) => isMatchedSubpath(entry.relPath, subpath));
  });
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

  const scannedLocalEntries = filterEntriesBySubpaths(
    await scanLocalEntries(options.cwd, options.targets),
    targetById,
    options.subpathSelectionsByTarget
  );
  const scannedRemoteEntries = filterEntriesBySubpaths(
    await scanRemoteEntries(options.mirrorPath, options.adapter, options.targets),
    targetById,
    options.subpathSelectionsByTarget
  );

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
  let preAppliedLocalToRemote = 0;
  let preAppliedRemoteToLocal = 0;

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
      const target = targetById.get(conflict.targetId);
      if (!target) {
        continue;
      }

      const remembered = getRememberedDecision(options.state, options.conflictStateKey, conflict.key);

      if (remembered) {
        const action = opToDecision(options.command, remembered);
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
        continue;
      }

      const localBase = getLocalTargetBase(target, options.cwd);
      const remoteBase = getRemoteTargetBase(options.mirrorPath, options.adapter, target);
      const localDestPath = resolvePathForTarget(localBase, target, conflict.relPath);
      const remoteDestPath = resolvePathForTarget(remoteBase, target, conflict.relPath);
      const localSourcePath = localByKey.get(conflict.key)?.snapshot.absPath;
      const remoteSourcePath = remoteByKey.get(conflict.key)?.snapshot.absPath;

      const resolved = await resolveConflictWithOptionalDrilldown({
        command: options.command,
        conflict,
        target,
        localSourcePath,
        remoteSourcePath,
        localDestPath,
        remoteDestPath,
      });

      if (resolved.drilldownApplied) {
        if (resolved.drilldownDirection === "local-to-remote") {
          preAppliedLocalToRemote += 1;
        } else if (resolved.drilldownDirection === "remote-to-local") {
          preAppliedRemoteToLocal += 1;
        }
        continue;
      }

      const decisionFromAction = actionToDecision(options.command, resolved.action);
      if (decisionFromAction) {
        rememberConflictDecision(options.state, options.conflictStateKey, conflict.key, decisionFromAction);
      }

      if (resolved.action === "skip") {
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
          action: resolved.action,
          reason: "overwrite",
        });
      }
    }
  }

  let copiedLocalToRemote = preAppliedLocalToRemote;
  let copiedRemoteToLocal = preAppliedRemoteToLocal;
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

async function resolveConflictWithOptionalDrilldown(params: {
  command: SyncCommand;
  conflict: ConflictItem;
  target: TargetSpec;
  localSourcePath: string | undefined;
  remoteSourcePath: string | undefined;
  localDestPath: string;
  remoteDestPath: string;
}): Promise<{
  action: PlannedOp["action"] | "skip";
  drilldownApplied: boolean;
  drilldownDirection: "local-to-remote" | "remote-to-local" | undefined;
}> {
  const { command, conflict, target } = params;

  const allowDrilldown =
    target.allowConflictSubSelection === true &&
    target.kind === "file" &&
    isStructuredConfigTarget(target) &&
    typeof conflict.selector === "string";

  if (!allowDrilldown) {
    const decision = await promptPerFileDecision(command, conflict);
    return {
      action: opToDecision(command, decision),
      drilldownApplied: false,
      drilldownDirection: undefined,
    };
  }

  const choice = await select<
    "default-local" | "default-remote" | "skip" | "drilldown-local" | "drilldown-remote"
  >({
    message: `충돌: ${conflict.relPath} (MCP 하위 선택 가능)`,
    choices: command === "sync"
      ? [
        { name: "로컬 버전 사용(항목 전체)", value: "default-local" },
        { name: "원격 버전 사용(항목 전체)", value: "default-remote" },
        { name: "원격 하위 경로 선택", value: "drilldown-remote" },
        { name: "로컬 하위 경로 선택", value: "drilldown-local" },
        { name: "건너뛰기", value: "skip" },
      ]
      : [
        { name: "항목 전체 덮어쓰기", value: "default-local" },
        {
          name: command === "push" ? "로컬 하위 경로 선택" : "원격 하위 경로 선택",
          value: command === "push" ? "drilldown-local" : "drilldown-remote",
        },
        { name: "건너뛰기", value: "skip" },
      ],
  });

  if (choice === "skip") {
    return {
      action: "skip",
      drilldownApplied: false,
      drilldownDirection: undefined,
    };
  }

  if (choice === "default-local" || choice === "default-remote") {
    if (command === "push") {
      return { action: "copy-local-to-remote", drilldownApplied: false, drilldownDirection: undefined };
    }
    if (command === "pull") {
      return { action: "copy-remote-to-local", drilldownApplied: false, drilldownDirection: undefined };
    }
    return {
      action: choice === "default-local" ? "copy-local-to-remote" : "copy-remote-to-local",
      drilldownApplied: false,
      drilldownDirection: undefined,
    };
  }

  const sourcePath = choice === "drilldown-local" ? params.localSourcePath : params.remoteSourcePath;
  const destPath = choice === "drilldown-local" ? params.remoteDestPath : params.localDestPath;
  if (!sourcePath || !conflict.selector) {
    return {
      action: "skip",
      drilldownApplied: false,
      drilldownDirection: undefined,
    };
  }

  const format = resolveTargetFormat(target, sourcePath);
  const sourceDoc = await readStructuredFile(sourcePath, format);
  const subtree = extractStructuredSubtree(sourceDoc, conflict.selector);
  if (subtree === undefined) {
    return {
      action: "skip",
      drilldownApplied: false,
      drilldownDirection: undefined,
    };
  }

  const relativePaths = await promptJsonSubtreeDrilldownSelection(
    `충돌 하위 선택: ${conflict.selector}`,
    subtree
  );
  if (relativePaths.length === 0) {
    return {
      action: "skip",
      drilldownApplied: false,
      drilldownDirection: undefined,
    };
  }

  const absolute = relativePaths.map((item) => prefixJsonPath(conflict.selector, item));
  const result = await applyStructuredSelectionFile(sourcePath, destPath, target, absolute);
  if (result.applied === 0) {
    return {
      action: "skip",
      drilldownApplied: false,
      drilldownDirection: undefined,
    };
  }

  return {
    action: "skip",
    drilldownApplied: true,
    drilldownDirection: choice === "drilldown-local" ? "local-to-remote" : "remote-to-local",
  };
}
