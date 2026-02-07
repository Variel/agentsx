# Agent Paths (Online Sources)

본 문서는 온라인 공식 문서를 기준으로 정리한 경로이며, **v1 동기화 대상은 사용자 전역(home) 설정만** 포함한다.

## Codex (global only)
- `~/.codex/config.toml`
- `~/.codex/AGENTS.md`, `~/.codex/AGENTS.override.md`
- `~/.codex/rules/*`
- `~/.codex/skills/*`
- 출처:
  - https://developers.openai.com/codex/config-basic
  - https://developers.openai.com/codex/guides/agents-md
  - https://developers.openai.com/codex/rules
  - https://developers.openai.com/codex/skills

## Claude Code (global only)
- `~/.claude/settings.json`
- `~/.claude/CLAUDE.md`
- `~/.claude/skills/*`
- `~/.claude/agents/*`
- `~/.claude/plugins/{config.json,installed_plugins.json,known_marketplaces.json}`
- `~/.claude.json` (MCP 포함 가능, 민감정보 주의)
- 출처:
  - https://docs.anthropic.com/en/docs/claude-code/settings
  - https://docs.anthropic.com/en/docs/claude-code/memory
  - https://docs.anthropic.com/en/docs/claude-code/slash-commands
  - https://docs.anthropic.com/en/docs/claude-code/sub-agents

## Cursor (global only)
- `~/Library/Application Support/Cursor/User/{settings.json,keybindings.json}` (macOS)
- `~/.config/Cursor/User/{settings.json,keybindings.json}` (Linux)
- `~/.cursor/cli-config.json`
- `~/.cursor/mcp.json`
- `~/.cursor/extensions/*`
- 출처:
  - https://docs.cursor.com/en/cli/reference/configuration
  - https://docs.cursor.com/en/context
  - https://forum.cursor.com/t/sync-of-keybindings-and-settings/31/115

## OpenCode (global only)
- `~/.config/opencode/opencode.json`
- `~/.config/opencode/{skills,plugins,agents,commands,tools,themes}`
- `~/.config/opencode/AGENTS.md`
- 출처:
  - https://opencode.ai/docs/config/
  - https://opencode.ai/docs/agents/
  - https://opencode.ai/docs/skills
  - https://opencode.ai/docs/rules/

## GitHub Copilot (global only)
- VS Code user settings
  - macOS: `~/Library/Application Support/Code/User/settings.json`
  - Linux: `~/.config/Code/User/settings.json`
- VS Code profile settings: `.../User/profiles/*`
- VS Code extension state: `~/.vscode/extensions/*`
- 출처:
  - https://code.visualstudio.com/docs/configure/settings
  - https://code.visualstudio.com/docs/copilot/customization/custom-instructions
  - https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
  - https://code.visualstudio.com/docs/configure/settings-sync

## Excluded in v1
- 프로젝트 로컬 설정 (`<repo>/**`)
