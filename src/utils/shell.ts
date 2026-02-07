import { spawnSync } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: number;
}

export function runOrThrow(command: string, args: string[], cwd?: string): ExecResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const status = result.status ?? 1;

  if (status !== 0) {
    const argText = args.join(" ");
    throw new Error([
      `명령 실행 실패: ${command} ${argText}`,
      stderr.trim() || stdout.trim() || "원인을 확인할 수 없습니다."
    ].join("\n"));
  }

  return { stdout, stderr, status };
}

export function run(command: string, args: string[], cwd?: string): ExecResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}
