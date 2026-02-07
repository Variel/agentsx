import type { AgentAdapter } from "../types.js";

export const codexAdapter: AgentAdapter = {
  key: "codex",
  displayName: "Codex",
  aliases: ["codex"],
  references: [
    "https://developers.openai.com/codex/config-basic",
    "https://developers.openai.com/codex/guides/agents-md",
    "https://developers.openai.com/codex/rules",
    "https://developers.openai.com/codex/skills"
  ],
  targets: [
    {
      id: "config",
      label: "Codex config",
      description: "~/.codex/config.toml",
      category: "config",
      kind: "file",
      scope: "home",
      path: ".codex/config.toml",
      includeByDefault: true,
    },
    {
      id: "instructions-main",
      label: "Personal AGENTS.md",
      description: "~/.codex/AGENTS.md",
      category: "instructions",
      kind: "file",
      scope: "home",
      path: ".codex/AGENTS.md",
      optional: true,
      includeByDefault: true,
    },
    {
      id: "instructions-override",
      label: "Personal AGENTS override",
      description: "~/.codex/AGENTS.override.md",
      category: "instructions",
      kind: "file",
      scope: "home",
      path: ".codex/AGENTS.override.md",
      optional: true,
      includeByDefault: true,
    },
    {
      id: "rules",
      label: "Approval rules",
      description: "~/.codex/rules",
      category: "config",
      kind: "dir",
      scope: "home",
      path: ".codex/rules",
      optional: true,
      includeByDefault: true,
    },
    {
      id: "skills",
      label: "Skills",
      description: "~/.codex/skills",
      category: "skills",
      kind: "dir",
      scope: "home",
      path: ".codex/skills",
      optional: true,
      includeByDefault: true,
    }
  ]
};
