import readline from "node:readline";

export interface CombinedTreeTargetInput {
  targetId: string;
  label: string;
  description: string;
  sourceKind: "local" | "remote";
  sourcePath: string;
  rootValue: unknown | undefined;
  subpathChildren: string[];
  defaultSelected: boolean;
  jsonDepthLimit?: number;
}

export interface CombinedTreeSelection {
  selectedTargetIds: string[];
  jsonPathSelectionsByTarget: Record<string, string[]>;
  subpathSelectionsByTarget: Record<string, string[]>;
}

interface TreeNode {
  id: string;
  parentId: string | undefined;
  children: string[];
  kind: "target" | "json" | "subpath";
  targetId: string;
  label: string;
  jsonPath: string | undefined;
  subpath: string | undefined;
  value: unknown;
}

function nodeSummary(value: unknown): string {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return "";
  }
  const text = JSON.stringify(value);
  if (!text) {
    return "null";
  }
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

function toJsonPath(segments: Array<string | number>): string {
  let output = "$";
  for (const segment of segments) {
    if (typeof segment === "number") {
      output += `[${segment}]`;
      continue;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
      output += `.${segment}`;
      continue;
    }

    const escaped = segment.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    output += `['${escaped}']`;
  }
  return output;
}

function childEntries(value: unknown): Array<{ key: string | number; value: unknown }> {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({ key: index, value: item }));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => ({ key, value: item }));
    const rank = (item: unknown): number => {
      if (Array.isArray(item)) {
        return 2;
      }
      if (item && typeof item === "object") {
        return 1;
      }
      return 0;
    };
    return entries.sort((a, b) => {
      const rankDiff = rank(a.value) - rank(b.value);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return a.key.localeCompare(b.key);
    });
  }

  return [];
}

function buildTree(inputs: CombinedTreeTargetInput[]): { nodes: Map<string, TreeNode>; rootId: string; defaultSelectedNodeIds: string[] } {
  const nodes = new Map<string, TreeNode>();
  let seq = 0;
  const defaultSelectedNodeIds: string[] = [];

  const createNode = (partial: Omit<TreeNode, "id" | "children">): string => {
    const id = `n${seq}`;
    seq += 1;
    nodes.set(id, { id, children: [], ...partial });

    if (partial.parentId) {
      const parent = nodes.get(partial.parentId);
      if (parent) {
        parent.children.push(id);
      }
    }

    return id;
  };

  const rootId = createNode({
    parentId: undefined,
    kind: "target",
    targetId: "__root__",
    label: "root",
    jsonPath: undefined,
    subpath: undefined,
    value: null,
  });

  const addJsonChildren = (
    parentId: string,
    targetId: string,
    value: unknown,
    segments: Array<string | number>,
    depth: number,
    depthLimit: number | undefined
  ): void => {
    if (depthLimit !== undefined && depth >= depthLimit) {
      return;
    }

    for (const entry of childEntries(value)) {
      const nextSegments = [...segments, entry.key];
      const nextPath = toJsonPath(nextSegments);
      const childId = createNode({
        parentId,
        kind: "json",
        targetId,
        label: String(entry.key),
        jsonPath: nextPath,
        subpath: undefined,
        value: entry.value,
      });
      addJsonChildren(childId, targetId, entry.value, nextSegments, depth + 1, depthLimit);
    }
  };

  for (const input of inputs) {
    const targetNodeId = createNode({
      parentId: rootId,
      kind: "target",
      targetId: input.targetId,
      label: input.label,
      jsonPath: undefined,
      subpath: undefined,
      value: `source=${input.sourceKind}`,
    });

    if (input.defaultSelected) {
      defaultSelectedNodeIds.push(targetNodeId);
    }

    if (input.rootValue !== undefined) {
      addJsonChildren(
        targetNodeId,
        input.targetId,
        input.rootValue,
        [],
        0,
        input.jsonDepthLimit
      );
    }

    for (const child of input.subpathChildren) {
      createNode({
        parentId: targetNodeId,
        kind: "subpath",
        targetId: input.targetId,
        label: child,
        jsonPath: undefined,
        subpath: child,
        value: child,
      });
    }
  }

  return { nodes, rootId, defaultSelectedNodeIds };
}

function visibleRows(
  rootId: string,
  nodes: Map<string, TreeNode>,
  expanded: Set<string>
): Array<{ id: string; depth: number }> {
  const rows: Array<{ id: string; depth: number }> = [];

  const walk = (nodeId: string, depth: number): void => {
    rows.push({ id: nodeId, depth });
    if (!expanded.has(nodeId)) {
      return;
    }

    const node = nodes.get(nodeId);
    if (!node) {
      return;
    }

    for (const childId of node.children) {
      walk(childId, depth + 1);
    }
  };

  walk(rootId, 0);
  return rows;
}

function descendants(nodeId: string, nodes: Map<string, TreeNode>): string[] {
  const out: string[] = [];
  const stack = [nodeId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    out.push(current);

    const node = nodes.get(current);
    if (!node) {
      continue;
    }

    for (const childId of node.children) {
      stack.push(childId);
    }
  }

  return out;
}

function selectionState(nodeId: string, nodes: Map<string, TreeNode>, selected: Set<string>): "none" | "all" | "partial" {
  const node = nodes.get(nodeId);
  if (!node) {
    return "none";
  }

  if (selected.has(nodeId)) {
    return "all";
  }

  if (node.children.length === 0) {
    return "none";
  }

  let any = false;
  let all = true;

  for (const childId of node.children) {
    const child = selectionState(childId, nodes, selected);
    if (child !== "none") {
      any = true;
    }
    if (child !== "all") {
      all = false;
    }
  }

  if (all) {
    return "all";
  }
  if (any) {
    return "partial";
  }
  return "none";
}

function render(
  title: string,
  rows: Array<{ id: string; depth: number }>,
  focusIndex: number,
  nodes: Map<string, TreeNode>,
  expanded: Set<string>,
  selected: Set<string>
): void {
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);

  const lines: string[] = [title];
  lines.push("←/→ 접기/펼치기, ↑/↓ 이동, Space 선택(하위 포함), Enter 확정");
  lines.push("");

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) {
      continue;
    }

    const node = nodes.get(row.id);
    if (!node) {
      continue;
    }

    const state = selectionState(node.id, nodes, selected);
    const marker = state === "all" ? "◉" : state === "partial" ? "◐" : "◯";
    const branch = node.children.length > 0 ? (expanded.has(node.id) ? "▾" : "▸") : " ";
    const focus = i === focusIndex ? "❯" : " ";
    const indent = " ".repeat(row.depth * 2);

    let detail = "";
    if (node.kind === "target") {
      detail = typeof node.value === "string" ? ` / ${node.value}` : "";
    } else if (node.kind === "json") {
      const summary = nodeSummary(node.value);
      detail = summary ? `: ${summary}` : "";
    }

    lines.push(`${focus}${indent}${branch} ${marker} ${node.label}${detail}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function canonicalize(nodes: Map<string, TreeNode>, selected: Set<string>): string[] {
  const list: string[] = [];

  for (const nodeId of selected) {
    let parentId = nodes.get(nodeId)?.parentId;
    let hasSelectedAncestor = false;

    while (parentId) {
      if (selected.has(parentId)) {
        hasSelectedAncestor = true;
        break;
      }
      parentId = nodes.get(parentId)?.parentId;
    }

    if (!hasSelectedAncestor) {
      list.push(nodeId);
    }
  }

  return list;
}

function collectSelection(nodes: Map<string, TreeNode>, selected: Set<string>): CombinedTreeSelection {
  const selectedTargetIds = new Set<string>();
  const jsonPathSelectionsByTarget: Record<string, string[]> = {};
  const subpathSelectionsByTarget: Record<string, string[]> = {};

  for (const nodeId of canonicalize(nodes, selected)) {
    const node = nodes.get(nodeId);
    if (!node || node.targetId === "__root__") {
      continue;
    }

    selectedTargetIds.add(node.targetId);

    if (node.kind === "json" && node.jsonPath) {
      const arr = jsonPathSelectionsByTarget[node.targetId] ?? [];
      if (!arr.includes(node.jsonPath)) {
        arr.push(node.jsonPath);
      }
      jsonPathSelectionsByTarget[node.targetId] = arr;
      continue;
    }

    if (node.kind === "subpath" && node.subpath) {
      const arr = subpathSelectionsByTarget[node.targetId] ?? [];
      if (!arr.includes(node.subpath)) {
        arr.push(node.subpath);
      }
      subpathSelectionsByTarget[node.targetId] = arr;
    }
  }

  for (const key of Object.keys(jsonPathSelectionsByTarget)) {
    jsonPathSelectionsByTarget[key] = jsonPathSelectionsByTarget[key]?.sort() ?? [];
  }
  for (const key of Object.keys(subpathSelectionsByTarget)) {
    subpathSelectionsByTarget[key] = subpathSelectionsByTarget[key]?.sort() ?? [];
  }

  return {
    selectedTargetIds: [...selectedTargetIds].sort(),
    jsonPathSelectionsByTarget,
    subpathSelectionsByTarget,
  };
}

export async function promptCombinedTargetAndJsonTreeSelection(
  title: string,
  inputs: CombinedTreeTargetInput[]
): Promise<CombinedTreeSelection> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      selectedTargetIds: inputs.map((item) => item.targetId),
      jsonPathSelectionsByTarget: {},
      subpathSelectionsByTarget: {},
    };
  }

  const { nodes, rootId, defaultSelectedNodeIds } = buildTree(inputs);
  const expanded = new Set<string>([rootId]);
  let rows = visibleRows(rootId, nodes, expanded).filter((row) => row.id !== rootId);
  let focusIndex = 0;
  const selected = new Set<string>();
  for (const nodeId of defaultSelectedNodeIds) {
    for (const descendant of descendants(nodeId, nodes)) {
      selected.add(descendant);
    }
  }

  return await new Promise<CombinedTreeSelection>((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    output.write("\x1B[?25l");

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      try {
        if (typeof input.setRawMode === "function") {
          input.setRawMode(false);
        }
      } catch {
        // Ignore raw mode reset failures during teardown.
      }
      input.pause();
      output.write("\x1B[?25h");
      output.write("\n");
    };

    const onKeypress = (_str: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("사용자가 트리 선택을 중단했습니다."));
        return;
      }

      const row = rows[focusIndex];
      const currentNode = row ? nodes.get(row.id) : undefined;

      if (key.name === "up") {
        focusIndex = Math.max(0, focusIndex - 1);
      } else if (key.name === "down") {
        focusIndex = Math.min(rows.length - 1, focusIndex + 1);
      } else if (key.name === "right") {
        if (currentNode && currentNode.children.length > 0) {
          if (!expanded.has(currentNode.id)) {
            expanded.add(currentNode.id);
            rows = visibleRows(rootId, nodes, expanded).filter((item) => item.id !== rootId);
          } else {
            focusIndex = Math.min(rows.length - 1, focusIndex + 1);
          }
        }
      } else if (key.name === "left") {
        if (currentNode) {
          if (expanded.has(currentNode.id) && currentNode.children.length > 0) {
            expanded.delete(currentNode.id);
            rows = visibleRows(rootId, nodes, expanded).filter((item) => item.id !== rootId);
            focusIndex = Math.min(focusIndex, rows.length - 1);
          } else if (currentNode.parentId) {
            const parentIndex = rows.findIndex((item) => item.id === currentNode.parentId);
            if (parentIndex >= 0) {
              focusIndex = parentIndex;
            }
          }
        }
      } else if (key.name === "space") {
        if (currentNode) {
          const desc = descendants(currentNode.id, nodes);
          const allSelected = desc.every((nodeId) => selected.has(nodeId));
          if (allSelected) {
            for (const nodeId of desc) {
              selected.delete(nodeId);
            }
          } else {
            for (const nodeId of desc) {
              selected.add(nodeId);
            }
          }
        }
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(collectSelection(nodes, selected));
        return;
      }

      rows = visibleRows(rootId, nodes, expanded).filter((item) => item.id !== rootId);
      if (rows.length === 0) {
        focusIndex = 0;
      } else {
        focusIndex = Math.min(focusIndex, rows.length - 1);
      }
      render(title, rows, focusIndex, nodes, expanded, selected);
    };

    render(title, rows, focusIndex, nodes, expanded, selected);
    input.on("keypress", onKeypress);
  });
}

export async function promptJsonSubtreeDrilldownSelection(
  title: string,
  rootValue: unknown
): Promise<string[]> {
  const selection = await promptCombinedTargetAndJsonTreeSelection(title, [
    {
      targetId: "__drilldown__",
      label: "충돌 하위 선택",
      description: "conflict subtree",
      sourceKind: "local",
      sourcePath: "subtree.json",
      rootValue,
      subpathChildren: [],
      defaultSelected: false,
    },
  ]);

  return (selection.jsonPathSelectionsByTarget["__drilldown__"] ?? [])
    .filter((item) => item !== "$")
    .sort();
}
