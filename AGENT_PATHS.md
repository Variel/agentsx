# Agent Paths (Online Sources)

본 문서는 로컬 설치 여부와 무관하게, 온라인 공식 문서 기준의 기본 경로를 정리한다.

## Codex
- `~/.codex/config.toml`
- `~/.codex/AGENTS.md`, `~/.codex/AGENTS.override.md`
- `~/.codex/rules/default.rules`
- `~/.codex/skills/*`
- 출처:
  - https://developers.openai.com/codex/config-basic
  - https://developers.openai.com/codex/guides/agents-md
  - https://developers.openai.com/codex/rules
  - https://developers.openai.com/codex/skills

## Claude Code
- `~/.claude/settings.json`
- `~/.claude/CLAUDE.md`
- `~/.claude/skills/*`
- `~/.claude/agents/*`
- `<repo>/.claude/settings.json`, `<repo>/.mcp.json`, `<repo>/CLAUDE.md`
- 출처:
  - https://docs.anthropic.com/en/docs/claude-code/settings
  - https://docs.anthropic.com/en/docs/claude-code/memory
  - https://docs.anthropic.com/en/docs/claude-code/slash-commands
  - https://docs.anthropic.com/en/docs/claude-code/sub-agents

## Cursor
- `~/.cursor/cli-config.json`
- `<repo>/.cursor/rules/*`, `<repo>/AGENTS.md`
- (IDE user path 참고) macOS `~/Library/Application Support/Cursor/User/*`, Linux `~/.config/Cursor/User/*`
- 출처:
  - https://docs.cursor.com/en/cli/reference/configuration
  - https://docs.cursor.com/en/context
  - https://forum.cursor.com/t/sync-of-keybindings-and-settings/31/115

## OpenCode
- `~/.config/opencode/opencode.json`
- `~/.config/opencode/{agents,commands,plugins,skills,tools,themes}`
- `<repo>/opencode.json`, `<repo>/.opencode/*`, `<repo>/AGENTS.md`
- 출처:
  - https://opencode.ai/docs/config/
  - https://opencode.ai/docs/agents/
  - https://opencode.ai/docs/skills
  - https://opencode.ai/docs/rules/

## GitHub Copilot
- VS Code user settings: macOS `~/Library/Application Support/Code/User/settings.json`, Linux `~/.config/Code/User/settings.json`
- VS Code profile settings: `.../User/profiles/<id>/settings.json`
- Repo instructions: `<repo>/.github/copilot-instructions.md`, `<repo>/.github/instructions/*.instructions.md`, `<repo>/AGENTS.md`
- 출처:
  - https://code.visualstudio.com/docs/configure/settings
  - https://code.visualstudio.com/docs/copilot/customization/custom-instructions
  - https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
  - https://code.visualstudio.com/docs/configure/settings-sync
