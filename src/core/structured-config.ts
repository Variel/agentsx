import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { JSONPath } from "jsonpath-plus";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "@iarna/toml";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import type { ConfigFormat, TargetSpec } from "../types.js";
import { ensureDir, exists } from "../utils/fs.js";

export interface ParsedJsonPathRule {
  targetId: string;
  expression: string;
}

export function inferConfigFormatFromPath(filePath: string): ConfigFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") {
    return "json";
  }
  if (ext === ".yaml" || ext === ".yml") {
    return "yaml";
  }
  if (ext === ".toml") {
    return "toml";
  }
  return undefined;
}

export function isStructuredConfigTarget(target: TargetSpec): boolean {
  if (target.kind !== "file") {
    return false;
  }

  if (target.structured) {
    return true;
  }

  if (typeof target.path !== "string") {
    return false;
  }

  return inferConfigFormatFromPath(target.path) !== undefined;
}

export function resolveTargetFormat(target: TargetSpec, filePath: string): ConfigFormat {
  if (target.format) {
    return target.format;
  }

  const inferred = inferConfigFormatFromPath(filePath);
  if (!inferred) {
    throw new Error(`구조화 설정 포맷을 추론할 수 없습니다: ${filePath}`);
  }
  return inferred;
}

function parseStructuredText(text: string, format: ConfigFormat): unknown {
  if (format === "json") {
    return parseJsonWithComments(text);
  }
  if (format === "yaml") {
    return parseYaml(text);
  }
  return parseToml(text);
}

function formatJsoncErrors(errors: ParseError[]): string {
  return errors
    .map((item) => `${printParseErrorCode(item.error)} (offset=${item.offset})`)
    .join(", ");
}

function parseJsonWithComments(text: string): unknown {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0) {
    throw new Error(formatJsoncErrors(errors));
  }

  return parsed;
}

function stringifyStructuredValue(value: unknown, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  if (format === "yaml") {
    return stringifyYaml(value);
  }
  type TomlMap = Parameters<typeof stringifyToml>[0];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return stringifyToml(value as TomlMap);
  }
  return stringifyToml({} as TomlMap);
}

export async function readStructuredFile(filePath: string, format: ConfigFormat): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  try {
    return parseStructuredText(raw, format);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "파싱 오류";
    throw new Error(`구조화 설정 파싱 실패 (${format}): ${filePath}\n${message}`);
  }
}

function parseJsonPathFromResultPath(resultPath: string): Array<string | number> {
  if (resultPath === "$") {
    return [];
  }

  const segments: Array<string | number> = [];
  const bracketRegex = /\[['"]((?:\\.|[^'\\"])*)['"]\]|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = bracketRegex.exec(resultPath)) !== null) {
    const key = match[1];
    const index = match[2];
    if (typeof key === "string") {
      segments.push(key.replace(/\\'/g, "'").replace(/\\"/g, '"'));
    } else if (typeof index === "string") {
      segments.push(Number(index));
    }
  }

  return segments;
}

function createContainer(next: string | number): Record<string, unknown> | Array<unknown> {
  return typeof next === "number" ? [] : {};
}

type MutableContainer = Record<string, unknown> | Array<unknown>;

function getChild(container: MutableContainer, key: string | number): unknown {
  if (Array.isArray(container) && typeof key === "number") {
    return container[key];
  }
  if (!Array.isArray(container) && typeof key === "string") {
    return container[key];
  }
  return undefined;
}

function setChild(container: MutableContainer, key: string | number, value: unknown): void {
  if (Array.isArray(container) && typeof key === "number") {
    container[key] = value;
    return;
  }
  if (!Array.isArray(container) && typeof key === "string") {
    container[key] = value;
    return;
  }
  throw new Error(`경로 타입 불일치: ${String(key)}`);
}

function setBySegments(root: unknown, segments: Array<string | number>, value: unknown): unknown {
  if (segments.length === 0) {
    return structuredClone(value);
  }

  const firstSegment = segments[0];
  if (firstSegment === undefined) {
    return structuredClone(value);
  }

  let base: MutableContainer;
  if (Array.isArray(root)) {
    base = [...root];
  } else if (root && typeof root === "object") {
    base = { ...(root as Record<string, unknown>) };
  } else {
    base = createContainer(firstSegment);
  }

  let cursor: MutableContainer = base;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const current = segments[i];
    const next = segments[i + 1];
    if (current === undefined || next === undefined) {
      continue;
    }
    const existing = getChild(cursor, current);

    if (existing && typeof existing === "object") {
      setChild(cursor, current, Array.isArray(existing) ? [...existing] : { ...existing });
    } else {
      setChild(cursor, current, createContainer(next));
    }
    const nextCursor = getChild(cursor, current);
    if (!nextCursor || typeof nextCursor !== "object") {
      throw new Error(`경로 구성 실패: ${segmentsToJsonPath(segments.slice(0, i + 1))}`);
    }
    cursor = nextCursor as MutableContainer;
  }

  const leaf = segments[segments.length - 1];
  if (leaf === undefined) {
    return base;
  }
  setChild(cursor, leaf, structuredClone(value));
  return base;
}

interface JsonPathMatch {
  path?: string;
  value: unknown;
}

function selectMatches(json: unknown, expression: string): JsonPathMatch[] {
  const jsonInput: string | number | boolean | object | Array<unknown> | null =
    json === null ||
    typeof json === "string" ||
    typeof json === "number" ||
    typeof json === "boolean" ||
    Array.isArray(json) ||
    (typeof json === "object" && json !== null)
      ? (json as string | number | boolean | object | Array<unknown> | null)
      : null;

  const results = JSONPath({
    path: expression,
    json: jsonInput,
    resultType: "all",
    wrap: true,
  });

  if (!Array.isArray(results)) {
    return [];
  }

  return results as JsonPathMatch[];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function hashStructuredValue(value: unknown): string {
  return hashText(stableStringify(value));
}

async function writeStructuredFile(filePath: string, value: unknown, format: ConfigFormat): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, stringifyStructuredValue(value, format), "utf8");
}

export async function hashStructuredFile(filePath: string, format: ConfigFormat): Promise<string> {
  const parsed = await readStructuredFile(filePath, format);
  return hashStructuredValue(parsed);
}

export async function copyStructuredFileNormalized(
  sourceFilePath: string,
  destinationFilePath: string,
  target: TargetSpec
): Promise<void> {
  const format = resolveTargetFormat(target, sourceFilePath);
  const source = await readStructuredFile(sourceFilePath, format);
  await writeStructuredFile(destinationFilePath, source, format);
}

export interface SelectorSnapshot {
  exists: boolean;
  hash: string | undefined;
  matchedCount: number;
}

export function getSelectorSnapshot(doc: unknown, expression: string): SelectorSnapshot {
  const matches = selectMatches(doc, expression);
  if (matches.length === 0) {
    return {
      exists: false,
      hash: undefined,
      matchedCount: 0,
    };
  }

  const canonical = matches
    .map((match) => ({ path: match.path ?? "", value: stableStringify(match.value) }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => `${item.path}=${item.value}`)
    .join("|");

  return {
    exists: true,
    hash: hashText(canonical),
    matchedCount: matches.length,
  };
}

export async function applyStructuredSelectionFile(
  sourceFilePath: string,
  destinationFilePath: string,
  target: TargetSpec,
  selectors: string[]
): Promise<{ applied: number; missingSelectors: string[] }> {
  const format = resolveTargetFormat(target, sourceFilePath);
  const source = await readStructuredFile(sourceFilePath, format);

  let destination: unknown = {};
  if (await exists(destinationFilePath)) {
    destination = await readStructuredFile(destinationFilePath, format);
  }

  let current = destination;
  let applied = 0;
  const missingSelectors: string[] = [];

  for (const selector of selectors) {
    const trimmed = selector.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed === "$") {
      current = structuredClone(source);
      applied += 1;
      continue;
    }

    const matches = selectMatches(source, trimmed);
    if (matches.length === 0) {
      missingSelectors.push(trimmed);
      continue;
    }

    for (const match of matches) {
      if (!match.path) {
        continue;
      }
      const segments = parseJsonPathFromResultPath(match.path);
      current = setBySegments(current, segments, match.value);
      applied += 1;
    }
  }

  if (applied === 0) {
    return {
      applied,
      missingSelectors,
    };
  }

  await writeStructuredFile(destinationFilePath, current, format);

  return {
    applied,
    missingSelectors,
  };
}

export function parseJsonPathRule(input: string): ParsedJsonPathRule {
  const trimmed = input.trim();
  const firstEquals = trimmed.indexOf("=");
  if (firstEquals <= 0 || firstEquals === trimmed.length - 1) {
    throw new Error(`--jsonpath 형식이 잘못되었습니다: '${input}'. 형식: targetId=$.path`);
  }

  const targetId = trimmed.slice(0, firstEquals).trim();
  const expression = trimmed.slice(firstEquals + 1).trim();

  if (!targetId || !expression) {
    throw new Error(`--jsonpath 형식이 잘못되었습니다: '${input}'. 형식: targetId=$.path`);
  }

  return { targetId, expression };
}

export function prefixJsonPath(rootPath: string | undefined, childPath: string): string {
  if (!rootPath || rootPath === "$") {
    return childPath;
  }
  if (childPath === "$") {
    return rootPath;
  }
  if (!childPath.startsWith("$")) {
    throw new Error(`JSONPath 형식이 잘못되었습니다: ${childPath}`);
  }
  return `${rootPath}${childPath.slice(1)}`;
}

export function extractStructuredSubtree(doc: unknown, selector: string): unknown | undefined {
  const matches = selectMatches(doc, selector);
  if (matches.length === 0) {
    return undefined;
  }
  return matches[0]?.value;
}

export function segmentsToJsonPath(segments: Array<string | number>): string {
  let pathText = "$";
  for (const segment of segments) {
    if (typeof segment === "number") {
      pathText += `[${segment}]`;
      continue;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
      pathText += `.${segment}`;
      continue;
    }

    const escaped = segment.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    pathText += `['${escaped}']`;
  }
  return pathText;
}

export function getNodeBySegments(root: unknown, segments: Array<string | number>): unknown {
  let cursor: unknown = root;
  for (const segment of segments) {
    if (cursor == null) {
      return undefined;
    }
    if (Array.isArray(cursor) && typeof segment === "number") {
      cursor = cursor[segment];
      continue;
    }
    if (!Array.isArray(cursor) && typeof cursor === "object" && typeof segment === "string") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return cursor;
}
