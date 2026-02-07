import { resolveAgentAdapter } from "../agents/registry.js";

export function runTargets(agentInput: string): void {
  const adapter = resolveAgentAdapter(agentInput);

  const lines: string[] = [];
  lines.push(`${adapter.displayName} (${adapter.key})`);
  lines.push("settings:");

  for (const target of adapter.targets) {
    lines.push(
      `- ${target.id} | ${target.label} | ${target.category} | default=${target.includeByDefault ? "yes" : "no"} | optional=${target.optional ? "yes" : "no"}`
    );
    lines.push(
      `  ${target.description} (scope=${target.scope}, kind=${target.kind}, structured=${target.structured ? "yes" : "no"}${target.format ? `:${target.format}` : ""})`
    );
  }

  lines.push("references:");
  for (const ref of adapter.references) {
    lines.push(`- ${ref}`);
  }

  console.log(lines.join("\n"));
}
