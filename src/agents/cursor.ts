import type { AgentAdapter } from "../types.js";

export const cursorAdapter: AgentAdapter = {
  key: "cursor",
  displayName: "Cursor",
  aliases: ["cursor"],
  references: [
    "https://docs.cursor.com/en/context",
    "https://docs.cursor.com/en/cli/reference/configuration",
    "https://forum.cursor.com/t/sync-of-keybindings-and-settings/31/115"
  ],
  targets: [
    {
      id: "ide-settings",
      label: "IDE settings.json",
      description: "Cursor User/settings.json",
      category: "config",
      kind: "file",
      scope: "home",
      path: {
        darwin: "Library/Application Support/Cursor/User/settings.json",
        linux: ".config/Cursor/User/settings.json",
      },
      optional: true,
      includeByDefault: true,
    },
    {
      id: "ide-keybindings",
      label: "IDE keybindings.json",
      description: "Cursor User/keybindings.json",
      category: "config",
      kind: "file",
      scope: "home",
      path: {
        darwin: "Library/Application Support/Cursor/User/keybindings.json",
        linux: ".config/Cursor/User/keybindings.json",
      },
      optional: true,
      includeByDefault: true,
    },
    {
      id: "cli-config",
      label: "Cursor CLI config",
      description: "~/.cursor/cli-config.json",
      category: "config",
      kind: "file",
      scope: "home",
      path: ".cursor/cli-config.json",
      optional: true,
      includeByDefault: true,
    },
    {
      id: "extensions",
      label: "Cursor extensions",
      description: "~/.cursor/extensions",
      category: "plugins",
      kind: "dir",
      scope: "home",
      path: ".cursor/extensions",
      optional: true,
    },
    {
      id: "project-rules",
      label: "Project rules",
      description: "./.cursor/rules",
      category: "instructions",
      kind: "dir",
      scope: "cwd",
      path: ".cursor/rules",
      optional: true,
      includeByDefault: true,
    },
    {
      id: "project-agents-md",
      label: "Project AGENTS.md",
      description: "./AGENTS.md",
      category: "instructions",
      kind: "file",
      scope: "cwd",
      path: "AGENTS.md",
      optional: true,
      includeByDefault: true,
    }
  ]
};
