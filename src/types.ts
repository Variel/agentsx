export type AgentKey = "codex" | "claude" | "cursor" | "opencode" | "copilot";

export type SyncCommand = "push" | "pull" | "sync";

export type ConflictPolicy = "fail-all" | "overwrite" | "partial";

export type PerFileDecision = "use-source" | "use-local" | "use-remote" | "skip";

export type TargetKind = "file" | "dir";

export type TargetScope = "home" | "cwd";
export type ConfigFormat = "json" | "yaml" | "toml";

export type PlatformPath =
  | string
  | {
      darwin?: string;
      linux?: string;
      win32?: string;
      default?: string;
    };

export interface TargetSpec {
  id: string;
  label: string;
  description: string;
  category: "skills" | "plugins" | "mcp" | "instructions" | "config" | "other";
  kind: TargetKind;
  scope: TargetScope;
  path: PlatformPath;
  optional?: boolean;
  sensitive?: boolean;
  includeByDefault?: boolean;
  structured?: boolean;
  format?: ConfigFormat;
  structuredRootPath?: string;
  structuredSelectionDepth?: number;
  allowConflictSubSelection?: boolean;
}

export interface AgentAdapter {
  key: AgentKey;
  displayName: string;
  aliases: string[];
  references: string[];
  targets: TargetSpec[];
}

export interface RemoteConfig {
  repoUrl: string;
  mirrorPath: string;
  defaultBranch: string;
}

export interface AgentsxState {
  schemaVersion: number;
  remote: RemoteConfig | undefined;
  lastSyncAtByAgent: Partial<Record<AgentKey, string>>;
  conflictDefaults: Record<string, ConflictPolicy>;
  conflictChoices: Record<string, Record<string, PerFileDecision>>;
}

export interface FileSnapshot {
  absPath: string;
  hash: string;
  mtimeMs: number;
}

export interface SideEntry {
  targetId: string;
  relPath: string;
  selector: string | undefined;
  snapshot: FileSnapshot;
}

export interface SyncEntry {
  key: string;
  targetId: string;
  relPath: string;
  selector: string | undefined;
  local: FileSnapshot | undefined;
  remote: FileSnapshot | undefined;
}

export interface PlannedOp {
  key: string;
  targetId: string;
  relPath: string;
  selector: string | undefined;
  action: "copy-local-to-remote" | "copy-remote-to-local" | "skip";
  reason: "new" | "overwrite" | "same" | "conflict-skip";
}

export interface ConflictItem {
  key: string;
  targetId: string;
  relPath: string;
  selector: string | undefined;
  local: FileSnapshot | undefined;
  remote: FileSnapshot | undefined;
}

export interface PlanResult {
  ops: PlannedOp[];
  conflicts: ConflictItem[];
  blocked: boolean;
}
