import { homedir } from "node:os";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { AgentsxState, ConflictPolicy, PerFileDecision } from "../types.js";

const STATE_DIR = path.join(homedir(), ".agentsx");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const SCHEMA_VERSION = 1;

export function getStateDir(): string {
  return STATE_DIR;
}

export function getStateFile(): string {
  return STATE_FILE;
}

export function createDefaultState(): AgentsxState {
  return {
    schemaVersion: SCHEMA_VERSION,
    remote: undefined,
    lastSyncAtByAgent: {},
    conflictDefaults: {},
    conflictChoices: {},
  };
}

export async function loadState(): Promise<AgentsxState> {
  await mkdir(STATE_DIR, { recursive: true });

  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentsxState>;

    return {
      schemaVersion: SCHEMA_VERSION,
      remote: parsed.remote,
      lastSyncAtByAgent: parsed.lastSyncAtByAgent ?? {},
      conflictDefaults: parsed.conflictDefaults ?? {},
      conflictChoices: parsed.conflictChoices ?? {},
    };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const defaultState = createDefaultState();
      await saveState(defaultState);
      return defaultState;
    }

    throw new Error(
      `상태 파일을 읽을 수 없습니다. 파일: ${STATE_FILE}. 파일이 손상되었을 수 있습니다.`
    );
  }
}

export async function saveState(state: AgentsxState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  const tmpFile = `${STATE_FILE}.tmp`;
  await writeFile(tmpFile, JSON.stringify(state, null, 2), "utf8");
  await rename(tmpFile, STATE_FILE);
}

export function conflictDefaultKey(command: string, agent: string, targetIds: string[]): string {
  return `${command}:${agent}:${targetIds.slice().sort().join(",")}`;
}

export function rememberConflictDefault(
  state: AgentsxState,
  key: string,
  policy: ConflictPolicy
): void {
  state.conflictDefaults[key] = policy;
}

export function rememberConflictDecision(
  state: AgentsxState,
  key: string,
  relKey: string,
  decision: PerFileDecision
): void {
  const existing = state.conflictChoices[key] ?? {};
  existing[relKey] = decision;
  state.conflictChoices[key] = existing;
}

export function getRememberedDecision(
  state: AgentsxState,
  key: string,
  relKey: string
): PerFileDecision | undefined {
  return state.conflictChoices[key]?.[relKey];
}
