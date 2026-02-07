import path from "node:path";
import readline from "node:readline";
import { readStructuredFile, segmentsToJsonPath } from "../core/structured-config.js";
import type { ConfigFormat } from "../types.js";

interface TreeNode {
  id: string;
  keyLabel: string;
  jsonPath: string;
  value: unknown;
  parentId: string | undefined;
  children: string[];
}

function valueSummary(value: unknown): string {
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (value && typeof value === "object") {
    return `object(${Object.keys(value as Record<string, unknown>).length})`;
  }
  const text = JSON.stringify(value);
  if (!text) {
    return "null";
  }
  return text.length > 32 ? `${text.slice(0, 29)}...` : text;
}

function nodeLabel(node: TreeNode): string {
  if (node.parentId === undefined) {
    return `${node.keyLabel} (${valueSummary(node.value)})`;
  }
  return `${node.keyLabel}: ${valueSummary(node.value)}`;
}

function buildChildrenEntries(value: unknown): Array<{ key: string | number; value: unknown }> {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({ key: index, value: item }));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({ key, value: item }));
  }
  return [];
}

function buildTree(sourceFilePath: string, rootValue: unknown): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>();
  let seq = 0;

  function addNode(
    keyLabel: string,
    jsonPath: string,
    value: unknown,
    parentId: string | undefined
  ): string {
    const id = `n${seq}`;
    seq += 1;
    map.set(id, {
      id,
      keyLabel,
      jsonPath,
      value,
      parentId,
      children: [],
    });
    if (parentId) {
      const parent = map.get(parentId);
      if (parent) {
        parent.children.push(id);
      }
    }
    return id;
  }

  const rootLabel = path.basename(sourceFilePath);
  const rootId = addNode(rootLabel, "$", rootValue, undefined);

  function walk(parentId: string, segments: Array<string | number>, value: unknown): void {
    const entries = buildChildrenEntries(value);
    for (const entry of entries) {
      const nextSegments = [...segments, entry.key];
      const childPath = segmentsToJsonPath(nextSegments);
      const childId = addNode(String(entry.key), childPath, entry.value, parentId);
      walk(childId, nextSegments, entry.value);
    }
  }

  walk(rootId, [], rootValue);
  return map;
}

function selectionState(nodeId: string, tree: Map<string, TreeNode>, selected: Set<string>): "none" | "all" | "partial" {
  const node = tree.get(nodeId);
  if (!node) {
    return "none";
  }

  if (node.children.length === 0) {
    return selected.has(nodeId) ? "all" : "none";
  }

  let allChildrenAll = true;
  let anyChildSelected = false;

  for (const childId of node.children) {
    const childState = selectionState(childId, tree, selected);
    if (childState !== "all") {
      allChildrenAll = false;
    }
    if (childState !== "none") {
      anyChildSelected = true;
    }
  }

  const selfSelected = selected.has(nodeId);
  if (selfSelected && allChildrenAll) {
    return "all";
  }
  if (!selfSelected && !anyChildSelected) {
    return "none";
  }
  return "partial";
}

function gatherDescendants(nodeId: string, tree: Map<string, TreeNode>): string[] {
  const acc: string[] = [];
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    acc.push(current);
    const node = tree.get(current);
    if (!node) {
      continue;
    }
    for (const childId of node.children) {
      stack.push(childId);
    }
  }
  return acc;
}

function visibleRows(
  rootId: string,
  tree: Map<string, TreeNode>,
  expanded: Set<string>
): Array<{ id: string; depth: number }> {
  const rows: Array<{ id: string; depth: number }> = [];

  function walk(nodeId: string, depth: number): void {
    rows.push({ id: nodeId, depth });
    if (!expanded.has(nodeId)) {
      return;
    }
    const node = tree.get(nodeId);
    if (!node) {
      return;
    }
    for (const childId of node.children) {
      walk(childId, depth + 1);
    }
  }

  walk(rootId, 0);
  return rows;
}

function canonicalizeSelectedNodeIds(tree: Map<string, TreeNode>, selected: Set<string>): string[] {
  const canonical: string[] = [];

  for (const nodeId of selected) {
    const node = tree.get(nodeId);
    if (!node) {
      continue;
    }

    let parentId = node.parentId;
    let hasSelectedAncestor = false;
    while (parentId) {
      if (selected.has(parentId)) {
        hasSelectedAncestor = true;
        break;
      }
      parentId = tree.get(parentId)?.parentId;
    }

    if (!hasSelectedAncestor) {
      canonical.push(nodeId);
    }
  }

  return canonical;
}

function render(
  title: string,
  rows: Array<{ id: string; depth: number }>,
  focusIndex: number,
  tree: Map<string, TreeNode>,
  expanded: Set<string>,
  selected: Set<string>
): void {
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);

  const lines: string[] = [];
  lines.push(title);
  lines.push("←/→ 접기/펼치기, ↑/↓ 이동, Space 선택(하위 포함), Enter 확정");
  lines.push("");

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) {
      continue;
    }
    const node = tree.get(row.id);
    if (!node) {
      continue;
    }

    const state = selectionState(node.id, tree, selected);
    const marker = state === "all" ? "[x]" : state === "partial" ? "[~]" : "[ ]";
    const hasChildren = node.children.length > 0;
    const branch = hasChildren ? (expanded.has(node.id) ? "▾" : "▸") : "·";
    const focus = i === focusIndex ? "❯" : " ";
    const indent = "  ".repeat(row.depth);

    lines.push(`${focus} ${indent}${branch} ${marker} ${nodeLabel(node)}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

export async function promptTreeJsonPathSelection(
  sourceFilePath: string,
  format: ConfigFormat,
  title: string
): Promise<string[]> {
  const rootValue = await readStructuredFile(sourceFilePath, format);
  const tree = buildTree(sourceFilePath, rootValue);
  const root = [...tree.values()].find((node) => node.parentId === undefined);

  if (!root) {
    return [];
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return [];
  }

  const expanded = new Set<string>([root.id]);
  const selected = new Set<string>();
  let rows = visibleRows(root.id, tree, expanded);
  let focusIndex = 0;

  return await new Promise<string[]>((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    output.write("\x1B[?25l");

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      output.write("\x1B[?25h");
      output.write("\n");
    };

    const finish = (): void => {
      cleanup();
      const canonicalNodeIds = canonicalizeSelectedNodeIds(tree, selected);
      const paths = canonicalNodeIds
        .map((nodeId) => tree.get(nodeId)?.jsonPath)
        .filter((value): value is string => typeof value === "string")
        .sort();
      resolve(paths);
    };

    const onKeypress = (_str: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("사용자가 트리 선택을 중단했습니다."));
        return;
      }

      const currentRow = rows[focusIndex];
      const currentNode = currentRow ? tree.get(currentRow.id) : undefined;

      if (key.name === "up") {
        focusIndex = Math.max(0, focusIndex - 1);
      } else if (key.name === "down") {
        focusIndex = Math.min(rows.length - 1, focusIndex + 1);
      } else if (key.name === "right") {
        if (!currentNode) {
          return;
        }

        if (currentNode.children.length === 0) {
          return;
        }

        if (!expanded.has(currentNode.id)) {
          expanded.add(currentNode.id);
          rows = visibleRows(root.id, tree, expanded);
        } else {
          focusIndex = Math.min(rows.length - 1, focusIndex + 1);
        }
      } else if (key.name === "left") {
        if (!currentNode) {
          return;
        }

        if (expanded.has(currentNode.id) && currentNode.children.length > 0) {
          expanded.delete(currentNode.id);
          rows = visibleRows(root.id, tree, expanded);
          focusIndex = Math.min(focusIndex, rows.length - 1);
        } else if (currentNode.parentId) {
          const parentIndex = rows.findIndex((row) => row.id === currentNode.parentId);
          if (parentIndex >= 0) {
            focusIndex = parentIndex;
          }
        }
      } else if (key.name === "space") {
        if (!currentNode) {
          return;
        }

        const descendants = gatherDescendants(currentNode.id, tree);
        const allSelected = descendants.every((nodeId) => selected.has(nodeId));

        if (allSelected) {
          for (const nodeId of descendants) {
            selected.delete(nodeId);
          }
        } else {
          for (const nodeId of descendants) {
            selected.add(nodeId);
          }
        }
      } else if (key.name === "return") {
        finish();
        return;
      }

      rows = visibleRows(root.id, tree, expanded);
      focusIndex = Math.min(focusIndex, rows.length - 1);
      render(title, rows, focusIndex, tree, expanded, selected);
    };

    render(title, rows, focusIndex, tree, expanded, selected);
    input.on("keypress", onKeypress);
  });
}
