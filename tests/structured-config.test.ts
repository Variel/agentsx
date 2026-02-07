import path from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parse as parseToml } from "@iarna/toml";
import {
  applyStructuredSelectionFile,
  copyStructuredFileNormalized,
  hashStructuredFile,
  parseJsonPathRule,
} from "../src/core/structured-config.js";
import { parseCliJsonPathSelections } from "../src/core/target-selectors.js";
import type { TargetSpec } from "../src/types.js";

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "agentsx-test-"));
}

function makeStructuredTarget(filePath: string, format: "json" | "yaml" | "toml"): TargetSpec {
  return {
    id: "structured",
    label: "structured",
    description: "structured",
    category: "config",
    kind: "file",
    scope: "home",
    path: filePath,
    structured: true,
    format,
  };
}

describe("structured config", () => {
  it("jsonpath 규칙 파싱", () => {
    const parsed = parseJsonPathRule("preferences=$.editor.theme");
    expect(parsed).toEqual({ targetId: "preferences", expression: "$.editor.theme" });
  });

  it("json 파일에서 선택 경로만 병합 동기화", async () => {
    const dir = await makeTmpDir();
    const src = path.join(dir, "src.json");
    const dst = path.join(dir, "dst.json");

    await writeFile(src, JSON.stringify({ a: { b: 1, c: 2 }, x: 3 }, null, 2), "utf8");
    await writeFile(dst, JSON.stringify({ a: { b: 0, d: 9 }, z: true }, null, 2), "utf8");

    const target: TargetSpec = {
      id: "preferences",
      label: "사용자 설정",
      description: "test",
      category: "config",
      kind: "file",
      scope: "home",
      path: "x.json",
      structured: true,
      format: "json",
    };

    const result = await applyStructuredSelectionFile(src, dst, target, ["$.a.b", "$.x"]);
    expect(result.applied).toBeGreaterThan(0);

    const after = JSON.parse(await readFile(dst, "utf8")) as Record<string, unknown>;
    expect((after.a as Record<string, unknown>).b).toBe(1);
    expect((after.a as Record<string, unknown>).d).toBe(9);
    expect(after.x).toBe(3);
    expect(after.z).toBe(true);
  });

  it("toml 파일에서도 선택 경로 동기화", async () => {
    const dir = await makeTmpDir();
    const src = path.join(dir, "src.toml");
    const dst = path.join(dir, "dst.toml");

    await writeFile(src, 'name = "alpha"\n[editor]\ntab = 2\n', "utf8");
    await writeFile(dst, 'name = "beta"\n[editor]\ntab = 8\nfont = "mono"\n', "utf8");

    const target: TargetSpec = {
      id: "config",
      label: "config",
      description: "toml",
      category: "config",
      kind: "file",
      scope: "home",
      path: "config.toml",
      structured: true,
      format: "toml",
    };

    const result = await applyStructuredSelectionFile(src, dst, target, ["$.editor.tab"]);
    expect(result.applied).toBe(1);

    const parsed = parseToml(await readFile(dst, "utf8")) as Record<string, unknown>;
    const editor = parsed.editor as Record<string, unknown>;
    expect(editor.tab).toBe(2);
    expect(editor.font).toBe("mono");
    expect(parsed.name).toBe("beta");
  });

  it("매칭 없는 jsonpath는 applied 0", async () => {
    const dir = await makeTmpDir();
    const src = path.join(dir, "src.json");
    const dst = path.join(dir, "dst.json");

    await writeFile(src, JSON.stringify({ a: 1 }, null, 2), "utf8");
    await writeFile(dst, JSON.stringify({ b: 2 }, null, 2), "utf8");

    const target: TargetSpec = {
      id: "preferences",
      label: "설정",
      description: "test",
      category: "config",
      kind: "file",
      scope: "home",
      path: "x.json",
      structured: true,
      format: "json",
    };

    const result = await applyStructuredSelectionFile(src, dst, target, ["$.notFound"]);
    expect(result.applied).toBe(0);
    expect(result.missingSelectors).toEqual(["$.notFound"]);
  });

  it("jsonc를 정규화 복사할 때 주석과 trailing comma가 제거된다", async () => {
    const dir = await makeTmpDir();
    const src = path.join(dir, "src.json");
    const dst = path.join(dir, "dst.json");

    await writeFile(
      src,
      `{
  // comment
  "editor": {
    "tabSize": 2,
  },
  "enabled": true,
}
`,
      "utf8"
    );

    await copyStructuredFileNormalized(src, dst, makeStructuredTarget("settings.json", "json"));

    const afterText = await readFile(dst, "utf8");
    expect(afterText.includes("//")).toBe(false);
    expect(afterText.includes("/*")).toBe(false);
    expect(JSON.parse(afterText)).toEqual({
      editor: {
        tabSize: 2,
      },
      enabled: true,
    });
  });

  it("yaml/toml도 정규화 복사 시 주석이 제거된다", async () => {
    const dir = await makeTmpDir();

    const yamlSrc = path.join(dir, "src.yaml");
    const yamlDst = path.join(dir, "dst.yaml");
    await writeFile(yamlSrc, "# comment\neditor:\n  tabSize: 2\n", "utf8");
    await copyStructuredFileNormalized(yamlSrc, yamlDst, makeStructuredTarget("settings.yaml", "yaml"));
    const yamlText = await readFile(yamlDst, "utf8");
    expect(yamlText.includes("# comment")).toBe(false);

    const tomlSrc = path.join(dir, "src.toml");
    const tomlDst = path.join(dir, "dst.toml");
    await writeFile(tomlSrc, '# comment\nname = "alpha"\n[editor]\ntab = 2\n', "utf8");
    await copyStructuredFileNormalized(tomlSrc, tomlDst, makeStructuredTarget("config.toml", "toml"));
    const tomlText = await readFile(tomlDst, "utf8");
    expect(tomlText.includes("# comment")).toBe(false);
    expect(parseToml(tomlText)).toEqual(parseToml('name = "alpha"\n[editor]\ntab = 2\n'));
  });

  it("구조화 해시는 주석/포맷 차이를 무시한다", async () => {
    const dir = await makeTmpDir();
    const left = path.join(dir, "left.json");
    const right = path.join(dir, "right.json");

    await writeFile(
      left,
      `{
  // local comment
  "mcpServers": {
    "context7": { "enabled": true, },
  },
}
`,
      "utf8"
    );
    await writeFile(right, '{"mcpServers":{"context7":{"enabled":true}}}\n', "utf8");

    const leftHash = await hashStructuredFile(left, "json");
    const rightHash = await hashStructuredFile(right, "json");
    expect(leftHash).toBe(rightHash);
  });
});

describe("cli jsonpath rules", () => {
  it("구조화 대상이 아닌 항목은 jsonpath 지정 불가", () => {
    const targets: TargetSpec[] = [
      {
        id: "skills",
        label: "skills",
        description: "dir",
        category: "skills",
        kind: "dir",
        scope: "home",
        path: ".claude/skills",
      },
    ];

    expect(() => parseCliJsonPathSelections(targets, ["skills=$.a"]))
      .toThrowError("구조화 설정 파일이 아닙니다");
  });

  it("structuredRootPath가 있으면 jsonpath를 해당 루트로 정규화", () => {
    const targets: TargetSpec[] = [
      {
        id: "mcp",
        label: "MCP",
        description: "mcp",
        category: "mcp",
        kind: "file",
        scope: "home",
        path: ".claude.json",
        structured: true,
        format: "json",
        structuredRootPath: "$.mcpServers",
      },
    ];

    const selection = parseCliJsonPathSelections(targets, ["mcp=$.context7"]);
    expect(selection.mcp).toEqual(["$.mcpServers.context7"]);
  });
});
