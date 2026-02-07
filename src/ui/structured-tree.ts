import { select } from "@inquirer/prompts";
import { readStructuredFile, getNodeBySegments, segmentsToJsonPath } from "../core/structured-config.js";
import type { ConfigFormat } from "../types.js";

function nodeSummary(value: unknown): string {
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (value && typeof value === "object") {
    return `object(${Object.keys(value as Record<string, unknown>).length})`;
  }
  return JSON.stringify(value);
}

function childEntries(node: unknown): Array<{ key: string | number; value: unknown }> {
  if (Array.isArray(node)) {
    return node.map((value, index) => ({ key: index, value }));
  }
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).map(([key, value]) => ({ key, value }));
  }
  return [];
}

export async function promptTreeJsonPathSelection(
  sourceFilePath: string,
  format: ConfigFormat,
  title: string
): Promise<string[]> {
  const root = await readStructuredFile(sourceFilePath, format);
  const selected = new Set<string>();
  let cursor: Array<string | number> = [];

  while (true) {
    const currentNode = getNodeBySegments(root, cursor);
    const currentPath = segmentsToJsonPath(cursor);
    const selectedHere = selected.has(currentPath);
    const children = childEntries(currentNode);

    const choices: Array<{ name: string; value: string }> = [
      {
        name: selectedHere ? "현재 노드 선택 해제" : "현재 노드 선택",
        value: "toggle",
      },
    ];

    if (cursor.length > 0) {
      choices.push({ name: "상위 노드로 이동", value: "up" });
    }

    for (const child of children) {
      const nextPath = segmentsToJsonPath([...cursor, child.key]);
      const mark = selected.has(nextPath) ? "[x]" : "[ ]";
      choices.push({
        name: `${mark} ${String(child.key)} : ${nodeSummary(child.value)}`,
        value: `enter:${String(child.key)}`,
      });
    }

    choices.push({ name: "선택 완료", value: "done" });

    const action = await select({
      message: `${title}\n현재 위치: ${currentPath} (${nodeSummary(currentNode)})\n선택된 경로: ${selected.size}`,
      choices,
    });

    if (action === "toggle") {
      if (selectedHere) {
        selected.delete(currentPath);
      } else {
        selected.add(currentPath);
      }
      continue;
    }

    if (action === "up") {
      cursor = cursor.slice(0, -1);
      continue;
    }

    if (action === "done") {
      return [...selected].sort();
    }

    if (action.startsWith("enter:")) {
      const rawKey = action.slice("enter:".length);
      if (Array.isArray(currentNode)) {
        const parsed = Number(rawKey);
        if (!Number.isNaN(parsed)) {
          cursor = [...cursor, parsed];
        }
      } else {
        cursor = [...cursor, rawKey];
      }
    }
  }
}
