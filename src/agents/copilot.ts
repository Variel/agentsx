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
      id: "vscode-user-settings",
      label: "VS Code user settings",
      description: "Copilot settings in User/settings.json",
      category: "config",
      kind: "file",
      scope: "home",
      path: {
        darwin: "Library/Application Support/Code/User/settings.json",
        linux: ".config/Code/User/settings.json",
      },
      optional: true,
      includeByDefault: true,
    },
    {
      id: "vscode-profile-settings",
      label: "VS Code profile settings",
      description: "User/profiles",
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
      id: "repo-copilot-instructions",
      label: "Repository instructions",
      description: "./.github/copilot-instructions.md",
      category: "instructions",
      kind: "file",
      scope: "cwd",
      path: ".github/copilot-instructions.md",
      optional: true,
      includeByDefault: true,
    },
    {
      id: "repo-copilot-scoped-instructions",
      label: "Path scoped instructions",
      description: "./.github/instructions",
      category: "instructions",
      kind: "dir",
      scope: "cwd",
      path: ".github/instructions",
      optional: true,
      includeByDefault: true,
    },
    {
      id: "repo-agents-md",
      label: "Repository AGENTS.md",
      description: "./AGENTS.md",
      category: "instructions",
      kind: "file",
      scope: "cwd",
      path: "AGENTS.md",
      optional: true,
      includeByDefault: true,
    },
    {
      id: "repo-vscode-settings",
      label: "Workspace VS Code settings",
      description: "./.vscode/settings.json",
      category: "config",
      kind: "file",
      scope: "cwd",
      path: ".vscode/settings.json",
      optional: true,
      includeByDefault: true,
    }
  ]
};
