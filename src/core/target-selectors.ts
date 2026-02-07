import path from "node:path";
import type { AgentAdapter, SyncCommand, TargetSpec } from "../types.js";
import { exists } from "../utils/fs.js";
import { getLocalTargetBase, getRemoteTargetBase } from "./layout.js";
import {
  isStructuredConfigTarget,
  parseJsonPathRule,
  readStructuredFile,
  resolveTargetFormat,
} from "./structured-config.js";
import {
  promptCombinedTargetAndJsonTreeSelection,
  type CombinedTreeTargetInput,
} from "../ui/structured-tree.js";

function ensureSelectedTargetMap(targets: TargetSpec[]): Map<string, TargetSpec> {
  return new Map(targets.map((target) => [target.id, target]));
}

function pushSelection(result: Record<string, string[]>, targetId: string, expression: string): void {
  const existing = result[targetId] ?? [];
  if (!existing.includes(expression)) {
    existing.push(expression);
  }
  result[targetId] = existing;
}

export function parseCliJsonPathSelections(
  selectedTargets: TargetSpec[],
  rules: string[]
): Record<string, string[]> {
  const map = ensureSelectedTargetMap(selectedTargets);
  const result: Record<string, string[]> = {};

  for (const rule of rules) {
    const parsed = parseJsonPathRule(rule);
    const target = map.get(parsed.targetId);
    if (!target) {
      throw new Error(
        `--jsonpath 대상 '${parsed.targetId}'는 현재 선택된 동기화 대상에 없습니다.`
      );
    }

    if (!isStructuredConfigTarget(target)) {
      throw new Error(
        `--jsonpath 대상 '${parsed.targetId}'는 구조화 설정 파일이 아닙니다.`
      );
    }

    pushSelection(result, parsed.targetId, parsed.expression);
  }

  return result;
}

function mergeSelections(
  base: Record<string, string[]>,
  extra: Record<string, string[]>
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...base };
  for (const [targetId, expressions] of Object.entries(extra)) {
    for (const expression of expressions) {
      pushSelection(merged, targetId, expression);
    }
  }
  return merged;
}

function resolveSourceForTarget(
  command: SyncCommand,
  adapter: AgentAdapter,
  target: TargetSpec,
  cwd: string,
  mirrorPath: string
): { path: string; sourceKind: "local" | "remote" } {
  const localPath = getLocalTargetBase(target, cwd);
  const remotePath = getRemoteTargetBase(mirrorPath, adapter, target);

  if (command === "push") {
    return { path: localPath, sourceKind: "local" };
  }
  if (command === "pull") {
    return { path: remotePath, sourceKind: "remote" };
  }

  return { path: localPath, sourceKind: "local" };
}

export interface InteractiveSelectionResult {
  selectedTargets: TargetSpec[];
  jsonPathSelectionsByTarget: Record<string, string[]>;
}

export async function promptInteractiveCombinedSelection(
  command: SyncCommand,
  adapter: AgentAdapter,
  targets: TargetSpec[],
  cwd: string,
  mirrorPath: string
): Promise<InteractiveSelectionResult> {
  const inputs: CombinedTreeTargetInput[] = [];

  for (const target of targets) {
    const preferred = resolveSourceForTarget(command, adapter, target, cwd, mirrorPath);
    let sourcePath = preferred.path;
    let sourceKind = preferred.sourceKind;

    if (command === "sync" && !(await exists(sourcePath))) {
      const fallbackRemote = getRemoteTargetBase(mirrorPath, adapter, target);
      if (await exists(fallbackRemote)) {
        sourcePath = fallbackRemote;
        sourceKind = "remote";
      }
    }

    let rootValue: unknown = undefined;
    if (target.kind === "file" && isStructuredConfigTarget(target) && await exists(sourcePath)) {
      const format = resolveTargetFormat(target, sourcePath);
      rootValue = await readStructuredFile(sourcePath, format);
    }

    inputs.push({
      targetId: target.id,
      label: target.label,
      description: `${target.description} (${path.basename(sourcePath)})`,
      sourceKind,
      sourcePath,
      rootValue,
    });
  }

  const selection = await promptCombinedTargetAndJsonTreeSelection(
    `? ${adapter.displayName}에서 동기화할 설정 항목을 선택하세요.`,
    inputs
  );

  const byId = ensureSelectedTargetMap(targets);
  const selectedTargets: TargetSpec[] = [];
  for (const targetId of selection.selectedTargetIds) {
    const target = byId.get(targetId);
    if (target) {
      selectedTargets.push(target);
    }
  }

  return {
    selectedTargets,
    jsonPathSelectionsByTarget: selection.jsonPathSelectionsByTarget,
  };
}

export function combineJsonPathSelections(
  cliSelections: Record<string, string[]>,
  interactiveSelections: Record<string, string[]>
): Record<string, string[]> {
  return mergeSelections(cliSelections, interactiveSelections);
}
