#!/usr/bin/env node
import { or, object } from "@optique/core/constructs";
import { command, constant, argument, option } from "@optique/core/primitives";
import { multiple, optional } from "@optique/core/modifiers";
import { choice, string } from "@optique/core/valueparser";
import { run } from "@optique/run";
import { runInit } from "./commands/init.js";
import { runPull } from "./commands/pull.js";
import { runPush } from "./commands/push.js";
import { runSync } from "./commands/sync.js";
import { runTargets } from "./commands/targets.js";
import { listSupportedAgents } from "./agents/registry.js";

const conflictPolicyParser = choice(
  ["fail-all", "overwrite", "partial"] as const,
  { metavar: "POLICY" }
);

const initCommand = command("init", object({
  action: constant("init"),
  repoUrl: argument(string({ metavar: "REPO_URL" })),
}));

const agentsCommand = command("agents", object({
  action: constant("agents"),
}));

const targetsCommand = command("targets", object({
  action: constant("targets"),
  agent: argument(string({ metavar: "AGENT" })),
}));

const pushCommand = command("push", object({
  action: constant("push"),
  agent: argument(string({ metavar: "AGENT" })),
  targets: multiple(argument(string({ metavar: "TARGET" }))),
  conflict: optional(option("--conflict", conflictPolicyParser)),
  jsonpath: multiple(option("--jsonpath", string({ metavar: "TARGET_ID=$.PATH" }))),
}));

const pullCommand = command("pull", object({
  action: constant("pull"),
  agent: argument(string({ metavar: "AGENT" })),
  targets: multiple(argument(string({ metavar: "TARGET" }))),
  conflict: optional(option("--conflict", conflictPolicyParser)),
  jsonpath: multiple(option("--jsonpath", string({ metavar: "TARGET_ID=$.PATH" }))),
}));

const syncCommand = command("sync", object({
  action: constant("sync"),
  agent: argument(string({ metavar: "AGENT" })),
  targets: multiple(argument(string({ metavar: "TARGET" }))),
  conflict: optional(option("--conflict", conflictPolicyParser)),
  jsonpath: multiple(option("--jsonpath", string({ metavar: "TARGET_ID=$.PATH" }))),
}));

const parser = or(
  initCommand,
  agentsCommand,
  targetsCommand,
  pushCommand,
  pullCommand,
  syncCommand
);

async function main(): Promise<void> {
  try {
    const result = run(parser, {
      programName: "agentsx",
      help: "both",
      version: {
        value: "0.1.8",
        mode: "option",
      },
    });

    if (result.action === "init") {
      await runInit(result.repoUrl);
      return;
    }

    if (result.action === "agents") {
      const lines = listSupportedAgents().map(
        (agent) => `${agent.key} (${agent.displayName})\n  - ${agent.references.join("\n  - ")}`
      );
      console.log(lines.join("\n"));
      return;
    }

    if (result.action === "targets") {
      runTargets(result.agent);
      return;
    }

    if (result.action === "push") {
      await runPush(
        result.agent,
        [...result.targets],
        result.conflict,
        [...result.jsonpath].filter((item): item is string => typeof item === "string" && item.length > 0)
      );
      return;
    }

    if (result.action === "pull") {
      await runPull(
        result.agent,
        [...result.targets],
        result.conflict,
        [...result.jsonpath].filter((item): item is string => typeof item === "string" && item.length > 0)
      );
      return;
    }

    if (result.action === "sync") {
      await runSync(
        result.agent,
        [...result.targets],
        result.conflict,
        [...result.jsonpath].filter((item): item is string => typeof item === "string" && item.length > 0)
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error(`오류: ${message}`);
    process.exitCode = 1;
  } finally {
    try {
      if (typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(false);
      }
    } catch {
      // Ignore raw mode reset failures during process teardown.
    }
    process.stdin.pause();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
  console.error(`오류: ${message}`);
  process.exitCode = 1;
});
