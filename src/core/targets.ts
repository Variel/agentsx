import type { AgentAdapter, TargetSpec } from "../types.js";
import { promptSelectTargets } from "../ui/prompts.js";

export interface TargetSelection {
  targets: TargetSpec[];
  interactive: boolean;
}

export async function selectTargets(
  adapter: AgentAdapter,
  requestedTargetIds: string[]
): Promise<TargetSelection> {
  const requested = requestedTargetIds.map((item) => item.trim()).filter(Boolean);

  if (requested.length === 0) {
    const selectedIds = await promptSelectTargets(adapter, adapter.targets);
    const selectedTargets = adapter.targets.filter((target) => selectedIds.includes(target.id));
    return {
      targets: selectedTargets,
      interactive: true,
    };
  }

  const byId = new Map(adapter.targets.map((target) => [target.id, target]));
  const selectedTargets: TargetSpec[] = [];
  for (const targetId of requested) {
    const target = byId.get(targetId);
    if (!target) {
      throw new Error(
        `대상 '${targetId}'를 찾을 수 없습니다. 사용 가능한 대상: ${adapter.targets
          .map((item) => item.id)
          .join(", ")}`
      );
    }
    selectedTargets.push(target);
  }

  return {
    targets: selectedTargets,
    interactive: false,
  };
}
