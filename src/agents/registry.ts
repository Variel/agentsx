import type { AgentAdapter, AgentKey } from "../types.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { copilotAdapter } from "./copilot.js";
import { cursorAdapter } from "./cursor.js";
import { opencodeAdapter } from "./opencode.js";

const adapters: AgentAdapter[] = [
  codexAdapter,
  claudeAdapter,
  cursorAdapter,
  opencodeAdapter,
  copilotAdapter,
];

const byAlias = new Map<string, AgentAdapter>();

for (const adapter of adapters) {
  byAlias.set(adapter.key, adapter);
  for (const alias of adapter.aliases) {
    byAlias.set(alias, adapter);
  }
}

export function listSupportedAgents(): AgentAdapter[] {
  return adapters;
}

export function resolveAgentAdapter(input: string): AgentAdapter {
  const normalized = input.trim().toLowerCase();
  const adapter = byAlias.get(normalized);
  if (!adapter) {
    const supported = adapters.map((item) => item.key).join(", ");
    throw new Error(`지원하지 않는 에이전트입니다: ${input}. 지원 목록: ${supported}`);
  }
  return adapter;
}

export function isSupportedAgentKey(input: string): input is AgentKey {
  return adapters.some((adapter) => adapter.key === input);
}
