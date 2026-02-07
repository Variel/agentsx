import { checkbox, select } from "@inquirer/prompts";
import type {
  AgentAdapter,
  ConflictItem,
  ConflictPolicy,
  PerFileDecision,
  SyncCommand,
  TargetSpec,
} from "../types.js";

export async function promptSelectTargets(
  adapter: AgentAdapter,
  targets: TargetSpec[]
): Promise<string[]> {
  const selected = await checkbox({
    message: `${adapter.displayName}에서 동기화할 설정 항목을 선택하세요. (↑/↓ 이동, Space 선택, Enter 확정)`,
    choices: targets.map((target) => ({
      name: `${target.label} [${target.category}] - ${target.description}${target.sensitive ? " [민감]" : ""}`,
      value: target.id,
      checked: target.includeByDefault ?? !target.sensitive,
    })),
    required: true,
  });

  return selected;
}

export async function promptConflictPolicy(defaultPolicy?: ConflictPolicy): Promise<ConflictPolicy> {
  const result = await select<ConflictPolicy>({
    message: "충돌 처리 방식을 선택하세요.",
    default: defaultPolicy,
    choices: [
      {
        value: "fail-all",
        name: "fail-all (충돌이 하나라도 있으면 전체 실패)",
      },
      {
        value: "overwrite",
        name: "overwrite (현재 명령 기준으로 덮어쓰기)",
      },
      {
        value: "partial",
        name: "partial (충돌은 건너뛰고 나머지만 진행)",
      },
    ],
  });

  return result;
}

export async function promptPerFileDecision(
  command: SyncCommand,
  conflict: ConflictItem
): Promise<PerFileDecision> {
  if (command === "push" || command === "pull") {
    const result = await select<PerFileDecision>({
      message: `충돌: ${conflict.relPath}`,
      choices: [
        { value: "use-source", name: "덮어쓰기" },
        { value: "skip", name: "건너뛰기" },
      ],
    });
    return result;
  }

  const result = await select<PerFileDecision>({
    message: `충돌: ${conflict.relPath}`,
    choices: [
      { value: "use-local", name: "로컬 버전 사용" },
      { value: "use-remote", name: "원격 버전 사용" },
      { value: "skip", name: "건너뛰기" },
    ],
  });

  return result;
}
