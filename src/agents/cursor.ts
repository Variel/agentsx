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
      id: "preferences",
      label: "사용자 설정",
      description: "Cursor IDE 설정 (User/settings.json)",
      category: "config",
      kind: "file",
      scope: "home",
      path: {
        darwin: "Library/Application Support/Cursor/User/settings.json",
        linux: ".config/Cursor/User/settings.json",
      },
      optional: true,
      includeByDefault: true,
      structured: true,
      format: "json",
    },
    {
      id: "keybindings",
      label: "키바인딩",
      description: "Cursor 단축키 설정 (User/keybindings.json)",
      category: "config",
      kind: "file",
      scope: "home",
      path: {
        darwin: "Library/Application Support/Cursor/User/keybindings.json",
        linux: ".config/Cursor/User/keybindings.json",
      },
      optional: true,
      includeByDefault: true,
      structured: true,
      format: "json",
    },
    {
      id: "cli-config",
      label: "CLI 설정",
      description: "Cursor CLI 설정 (~/.cursor/cli-config.json)",
      category: "config",
      kind: "file",
      scope: "home",
      path: ".cursor/cli-config.json",
      optional: true,
      includeByDefault: true,
      structured: true,
      format: "json",
    },
    {
      id: "extensions",
      label: "확장(Extensions)",
      description: "Cursor 확장 설치 상태 (~/.cursor/extensions)",
      category: "plugins",
      kind: "dir",
      scope: "home",
      path: ".cursor/extensions",
      optional: true,
    },
    {
      id: "mcp",
      label: "MCP 설정",
      description: "Cursor MCP 설정 (~/.cursor/mcp.json)",
      category: "mcp",
      kind: "file",
      scope: "home",
      path: ".cursor/mcp.json",
      optional: true,
      includeByDefault: true,
      structured: true,
      format: "json",
    }
  ]
};
