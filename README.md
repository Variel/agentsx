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
npx agentsx push <agent> [targets...] [--conflict fail-all|overwrite|partial] [--jsonpath targetId=$.path]
npx agentsx pull <agent> [targets...] [--conflict fail-all|overwrite|partial] [--jsonpath targetId=$.path]
npx agentsx sync <agent> [targets...] [--conflict fail-all|overwrite|partial] [--jsonpath targetId=$.path]
```

- `targets`를 생략하면 TUI 선택 UI가 열립니다.
- 선택 단위는 파일 자체가 아니라 에이전트별 **설정 항목(예: skills, plugins, mcp, instructions)** 입니다.
- v1 동기화 범위는 사용자 전역 설정(`home`)이며, 프로젝트 로컬 설정은 제외됩니다.
- CLI 세부 선택: `--jsonpath targetId=$.path`를 반복해 JSONPath 단위 부분 동기화 가능
- TUI 세부 선택: 파일+JSON 트리 결합 뷰에서 `←/→` 펼침/접기, `↑/↓` 이동, `Space` 선택(하위 포함), `Enter` 확정
- JSONPath를 선택한 구조화 설정은 충돌도 JSONPath 단위로 판정되며, TUI에서 `파일#jsonpath` 형태로 표시됩니다.
- 선택/충돌 결정은 `~/.agentsx/state.json`에 저장되어 재사용됩니다.
- 원격 기본 브랜치가 비어 있으면 첫 `push/pull/sync` 실행 시 자동 초기화됩니다.

## 품질 검증
```bash
pnpm check
```

## 문서
- 요구사항: `REQUIREMENTS.md`
- 에이전트 작업 가이드: `AGENTS.md`
- 온라인 기반 경로 조사: `AGENT_PATHS.md`
