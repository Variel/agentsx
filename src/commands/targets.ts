import { resolveAgentAdapter } from "../agents/registry.js";

export function runTargets(agentInput: string): void {
  const adapter = resolveAgentAdapter(agentInput);

  const lines: string[] = [];
  lines.push(`${adapter.displayName} (${adapter.key})`);
  lines.push("targets:");

  for (const target of adapter.targets) {
    lines.push(
      `- ${target.id} | ${target.kind} | ${target.scope} | default=${target.includeByDefault ? "yes" : "no"} | optional=${target.optional ? "yes" : "no"}`
    );
    lines.push(`  ${target.description}`);
  }

  lines.push("references:");
  for (const ref of adapter.references) {
    lines.push(`- ${ref}`);
  }

  console.log(lines.join("\n"));
}
