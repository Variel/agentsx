import { describe, expect, it } from "vitest";
import { listSupportedAgents, resolveAgentAdapter } from "../src/agents/registry.js";

describe("agent registry", () => {
  it("지원 에이전트 5종을 포함한다", () => {
    const keys = listSupportedAgents().map((item) => item.key).sort();
    expect(keys).toEqual(["claude", "codex", "copilot", "cursor", "opencode"]);
  });

  it("별칭으로 resolve 가능하다", () => {
    expect(resolveAgentAdapter("claude-code").key).toBe("claude");
    expect(resolveAgentAdapter("open code").key).toBe("opencode");
    expect(resolveAgentAdapter("github-copilot").key).toBe("copilot");
  });

  it("미지원 에이전트는 오류", () => {
    expect(() => resolveAgentAdapter("unknown-agent")).toThrowError("지원하지 않는 에이전트");
  });

  it("동기화 대상은 프로젝트(cwd) 범위를 포함하지 않는다", () => {
    for (const adapter of listSupportedAgents()) {
      for (const target of adapter.targets) {
        expect(target.scope).toBe("home");
      }
    }
  });
});
