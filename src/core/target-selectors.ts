import { select } from "@inquirer/prompts";
import type { AgentAdapter, SyncCommand, TargetSpec } from "../types.js";
import { exists } from "../utils/fs.js";
import { getLocalTargetBase, getRemoteTargetBase } from "./layout.js";
import {
  isStructuredConfigTarget,
  parseJsonPathRule,
  resolveTargetFormat,
} from "./structured-config.js";
import { promptTreeJsonPathSelection } from "../ui/structured-tree.js";

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

function resolveSourcePathForTree(
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

export async function promptInteractiveJsonPathSelections(
  command: SyncCommand,
  adapter: AgentAdapter,
  targets: TargetSpec[],
  cwd: string,
  mirrorPath: string
): Promise<Record<string, string[]>> {
  const selected: Record<string, string[]> = {};

  for (const target of targets) {
    if (!isStructuredConfigTarget(target)) {
      continue;
    }

    const source = resolveSourcePathForTree(command, adapter, target, cwd, mirrorPath);
    let sourcePath = source.path;
    let sourceKind = source.sourceKind;

    if (command === "sync" && !(await exists(sourcePath))) {
      const remotePath = getRemoteTargetBase(mirrorPath, adapter, target);
      if (await exists(remotePath)) {
        sourcePath = remotePath;
        sourceKind = "remote";
      }
    }

    if (!(await exists(sourcePath))) {
      continue;
    }

    const mode = await select<"all" | "tree" | "skip">({
      message: `${target.label}(${target.id}) 동기화 방식 선택`,
      choices: [
        { name: "전체 항목 동기화", value: "all" },
        { name: "트리 탐색으로 세부 경로 선택", value: "tree" },
        { name: "이 항목 건너뛰기", value: "skip" },
      ],
    });

    if (mode === "skip") {
      continue;
    }

    if (mode === "all") {
      continue;
    }

    const format = resolveTargetFormat(target, sourcePath);
    const expressions = await promptTreeJsonPathSelection(
      sourcePath,
      format,
      `${target.label} / source=${sourceKind}`
    );

    if (expressions.length > 0) {
      selected[target.id] = expressions;
    }
  }

  return selected;
}

export function combineJsonPathSelections(
  cliSelections: Record<string, string[]>,
  interactiveSelections: Record<string, string[]>
): Record<string, string[]> {
  return mergeSelections(cliSelections, interactiveSelections);
}
