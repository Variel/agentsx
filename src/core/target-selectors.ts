import { readdir } from "node:fs/promises";
import type { AgentAdapter, SyncCommand, TargetSpec } from "../types.js";
import { exists } from "../utils/fs.js";
import { getLocalTargetBase, getRemoteTargetBase } from "./layout.js";
import {
  extractStructuredSubtree,
  isStructuredConfigTarget,
  parseJsonPathRule,
  prefixJsonPath,
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

function normalizeCliSelector(target: TargetSpec, expression: string): string {
  if (!target.structuredRootPath) {
    return expression;
  }

  if (expression.startsWith(target.structuredRootPath)) {
    return expression;
  }

  return prefixJsonPath(target.structuredRootPath, expression);
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

    pushSelection(result, parsed.targetId, normalizeCliSelector(target, parsed.expression));
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

async function listOneDepthChildren(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export interface InteractiveSelectionResult {
  selectedTargets: TargetSpec[];
  jsonPathSelectionsByTarget: Record<string, string[]>;
  subpathSelectionsByTarget: Record<string, string[]>;
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
      const parsed = await readStructuredFile(sourcePath, format);
      rootValue = target.structuredRootPath
        ? extractStructuredSubtree(parsed, target.structuredRootPath)
        : parsed;
    }

    let subpathChildren: string[] = [];
    if (target.kind === "dir" && target.category === "skills" && await exists(sourcePath)) {
      subpathChildren = await listOneDepthChildren(sourcePath);
    }

    const treeInput: CombinedTreeTargetInput = {
      targetId: target.id,
      label: target.label,
      description: target.description,
      sourceKind,
      sourcePath,
      rootValue,
      subpathChildren,
      defaultSelected: target.includeByDefault ?? !target.sensitive,
      ...(target.structuredSelectionDepth !== undefined
        ? { jsonDepthLimit: target.structuredSelectionDepth }
        : {}),
    };
    inputs.push(treeInput);
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

  const normalizedJsonPathSelections: Record<string, string[]> = {};
  for (const [targetId, expressions] of Object.entries(selection.jsonPathSelectionsByTarget)) {
    const target = byId.get(targetId);
    if (!target) {
      continue;
    }

    for (const expression of expressions) {
      pushSelection(normalizedJsonPathSelections, targetId, normalizeCliSelector(target, expression));
    }
  }

  return {
    selectedTargets,
    jsonPathSelectionsByTarget: normalizedJsonPathSelections,
    subpathSelectionsByTarget: selection.subpathSelectionsByTarget,
  };
}

export function combineJsonPathSelections(
  cliSelections: Record<string, string[]>,
  interactiveSelections: Record<string, string[]>
): Record<string, string[]> {
  return mergeSelections(cliSelections, interactiveSelections);
}
