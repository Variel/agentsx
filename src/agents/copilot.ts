import type { AgentAdapter } from "../types.js";

export const copilotAdapter: AgentAdapter = {
  key: "copilot",
  displayName: "GitHub Copilot",
  aliases: ["copilot", "github-copilot", "github_copilot"],
  references: [
    "https://code.visualstudio.com/docs/configure/settings",
    "https://code.visualstudio.com/docs/copilot/customization/custom-instructions",
    "https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions",
    "https://code.visualstudio.com/docs/configure/settings-sync"
  ],
  targets: [
    {
      id: "vscode-preferences",
      label: "VS Code 사용자 설정",
      description: "Copilot 포함 VS Code 사용자 설정 (User/settings.json)",
      category: "config",
      kind: "file",
      scope: "home",
      path: {
        darwin: "Library/Application Support/Code/User/settings.json",
        linux: ".config/Code/User/settings.json",
      },
      optional: true,
      includeByDefault: true,
      structured: true,
      format: "json",
    },
    {
      id: "vscode-profiles",
      label: "VS Code 프로필 설정",
      description: "VS Code 프로필별 설정 (User/profiles)",
      category: "config",
      kind: "dir",
      scope: "home",
      path: {
        darwin: "Library/Application Support/Code/User/profiles",
        linux: ".config/Code/User/profiles",
      },
      optional: true,
    },
    {
      id: "vscode-extensions",
      label: "VS Code 확장 상태",
      description: "설치된 확장 정보 (~/.vscode/extensions)",
      category: "plugins",
      kind: "dir",
      scope: "home",
      path: ".vscode/extensions",
      optional: true,
    }
  ]
};
