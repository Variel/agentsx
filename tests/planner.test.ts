import { describe, expect, it } from "vitest";
import { buildPlan } from "../src/core/planner.js";
import type { SyncEntry } from "../src/types.js";

function entry(partial: Partial<SyncEntry> & { key: string; targetId: string; relPath: string }): SyncEntry {
  return {
    key: partial.key,
    targetId: partial.targetId,
    relPath: partial.relPath,
    selector: partial.selector,
    local: partial.local,
    remote: partial.remote,
  };
}

describe("planner", () => {
  it("push에서 신규 파일은 local->remote 복사", () => {
    const plan = buildPlan(
      [
        entry({
          key: "config:a.toml",
          targetId: "config",
          relPath: "a.toml",
          local: { absPath: "/local/a.toml", hash: "L", mtimeMs: 10 },
        }),
      ],
      "push",
      "fail-all"
    );

    expect(plan.blocked).toBe(false);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.ops[0]?.action).toBe("copy-local-to-remote");
  });

  it("push + fail-all 충돌 시 차단", () => {
    const plan = buildPlan(
      [
        entry({
          key: "config:a.toml",
          targetId: "config",
          relPath: "a.toml",
          local: { absPath: "/local/a.toml", hash: "L", mtimeMs: 10 },
          remote: { absPath: "/remote/a.toml", hash: "R", mtimeMs: 12 },
        }),
      ],
      "push",
      "fail-all"
    );

    expect(plan.blocked).toBe(true);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("pull + overwrite 충돌 시 remote->local", () => {
    const plan = buildPlan(
      [
        entry({
          key: "config:a.toml",
          targetId: "config",
          relPath: "a.toml",
          local: { absPath: "/local/a.toml", hash: "L", mtimeMs: 10 },
          remote: { absPath: "/remote/a.toml", hash: "R", mtimeMs: 12 },
        }),
      ],
      "pull",
      "overwrite"
    );

    expect(plan.blocked).toBe(false);
    expect(plan.ops[0]?.action).toBe("copy-remote-to-local");
  });

  it("sync + overwrite는 더 최신 mtime 우선", () => {
    const plan = buildPlan(
      [
        entry({
          key: "config:a.toml",
          targetId: "config",
          relPath: "a.toml",
          local: { absPath: "/local/a.toml", hash: "L", mtimeMs: 100 },
          remote: { absPath: "/remote/a.toml", hash: "R", mtimeMs: 50 },
        }),
      ],
      "sync",
      "overwrite"
    );

    expect(plan.blocked).toBe(false);
    expect(plan.ops[0]?.action).toBe("copy-local-to-remote");
  });

  it("sync + partial 충돌은 건너뜀", () => {
    const plan = buildPlan(
      [
        entry({
          key: "config:a.toml",
          targetId: "config",
          relPath: "a.toml",
          local: { absPath: "/local/a.toml", hash: "L", mtimeMs: 100 },
          remote: { absPath: "/remote/a.toml", hash: "R", mtimeMs: 200 },
        }),
      ],
      "sync",
      "partial"
    );

    expect(plan.blocked).toBe(false);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.ops[0]?.action).toBe("skip");
    expect(plan.ops[0]?.reason).toBe("conflict-skip");
  });

  it("jsonpath selector 충돌은 selector 단위로 기록된다", () => {
    const plan = buildPlan(
      [
        entry({
          key: "preferences:settings.json#$.editor.theme",
          targetId: "preferences",
          relPath: "settings.json#$.editor.theme",
          selector: "$.editor.theme",
          local: { absPath: "/local/settings.json", hash: "L", mtimeMs: 100 },
          remote: { absPath: "/remote/settings.json", hash: "R", mtimeMs: 110 },
        }),
      ],
      "sync",
      "partial"
    );

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.selector).toBe("$.editor.theme");
    expect(plan.conflicts[0]?.relPath).toContain("#$.editor.theme");
  });
});
