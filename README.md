# agentsx

여러 컴퓨터에서 코딩 에이전트 설정을 Git 저장소로 동기화하는 CLI입니다.

## 시작
```bash
pnpm i
pnpm build
```

## 명령
```bash
npx agentsx init <repo-url>
npx agentsx agents
npx agentsx targets <agent>
npx agentsx push <agent> [targets...] [--conflict fail-all|overwrite|partial]
npx agentsx pull <agent> [targets...] [--conflict fail-all|overwrite|partial]
npx agentsx sync <agent> [targets...] [--conflict fail-all|overwrite|partial]
```

- `targets`를 생략하면 TUI 선택 UI가 열립니다.
- 선택/충돌 결정은 `~/.agentsx/state.json`에 저장되어 재사용됩니다.

## 품질 검증
```bash
pnpm check
```

## 문서
- 요구사항: `REQUIREMENTS.md`
- 에이전트 작업 가이드: `AGENTS.md`
- 온라인 기반 경로 조사: `AGENT_PATHS.md`
