import type {
  ConflictItem,
  ConflictPolicy,
  PlanResult,
  PlannedOp,
  SideEntry,
  SyncCommand,
  SyncEntry,
} from "../types.js";

function makeKey(targetId: string, relPath: string): string {
  return `${targetId}:${relPath}`;
}

export function mergeEntries(local: SideEntry[], remote: SideEntry[]): SyncEntry[] {
  const map = new Map<string, SyncEntry>();

  for (const entry of local) {
    const key = makeKey(entry.targetId, entry.relPath);
    map.set(key, {
      key,
      targetId: entry.targetId,
      relPath: entry.relPath,
      selector: entry.selector,
      local: entry.snapshot,
      remote: map.get(key)?.remote,
    });
  }

  for (const entry of remote) {
    const key = makeKey(entry.targetId, entry.relPath);
    const prev = map.get(key);
    map.set(key, {
      key,
      targetId: entry.targetId,
      relPath: entry.relPath,
      selector: entry.selector ?? prev?.selector,
      local: prev?.local,
      remote: entry.snapshot,
    });
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function isDifferent(entry: SyncEntry): boolean {
  return Boolean(entry.local && entry.remote && entry.local.hash !== entry.remote.hash);
}

function chooseSyncDirection(entry: SyncEntry): "copy-local-to-remote" | "copy-remote-to-local" {
  if (!entry.local || !entry.remote) {
    return "copy-local-to-remote";
  }

  return entry.local.mtimeMs >= entry.remote.mtimeMs
    ? "copy-local-to-remote"
    : "copy-remote-to-local";
}

function addConflict(conflicts: ConflictItem[], entry: SyncEntry): void {
  conflicts.push({
    key: entry.key,
    targetId: entry.targetId,
    relPath: entry.relPath,
    selector: entry.selector,
    local: entry.local,
    remote: entry.remote,
  });
}

function pushLikePlan(
  entries: SyncEntry[],
  command: Extract<SyncCommand, "push" | "pull">,
  policy: ConflictPolicy
): PlanResult {
  const ops: PlannedOp[] = [];
  const conflicts: ConflictItem[] = [];

  for (const entry of entries) {
    const source = command === "push" ? entry.local : entry.remote;
    const dest = command === "push" ? entry.remote : entry.local;

    if (!source) {
      continue;
    }

    if (!dest) {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: command === "push" ? "copy-local-to-remote" : "copy-remote-to-local",
        reason: "new",
      });
      continue;
    }

    if (source.hash === dest.hash) {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: "skip",
        reason: "same",
      });
      continue;
    }

    addConflict(conflicts, entry);

    if (policy === "overwrite") {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: command === "push" ? "copy-local-to-remote" : "copy-remote-to-local",
        reason: "overwrite",
      });
    } else if (policy === "partial") {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: "skip",
        reason: "conflict-skip",
      });
    }
  }

  return {
    ops,
    conflicts,
    blocked: policy === "fail-all" && conflicts.length > 0,
  };
}

function syncPlan(entries: SyncEntry[], policy: ConflictPolicy): PlanResult {
  const ops: PlannedOp[] = [];
  const conflicts: ConflictItem[] = [];

  for (const entry of entries) {
    if (entry.local && !entry.remote) {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: "copy-local-to-remote",
        reason: "new",
      });
      continue;
    }

    if (!entry.local && entry.remote) {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: "copy-remote-to-local",
        reason: "new",
      });
      continue;
    }

    if (!entry.local || !entry.remote) {
      continue;
    }

    if (!isDifferent(entry)) {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: "skip",
        reason: "same",
      });
      continue;
    }

    addConflict(conflicts, entry);

    if (policy === "overwrite") {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: chooseSyncDirection(entry),
        reason: "overwrite",
      });
    } else if (policy === "partial") {
      ops.push({
        key: entry.key,
        targetId: entry.targetId,
        relPath: entry.relPath,
        selector: entry.selector,
        action: "skip",
        reason: "conflict-skip",
      });
    }
  }

  return {
    ops,
    conflicts,
    blocked: policy === "fail-all" && conflicts.length > 0,
  };
}

export function buildPlan(
  entries: SyncEntry[],
  command: SyncCommand,
  policy: ConflictPolicy
): PlanResult {
  if (command === "push" || command === "pull") {
    return pushLikePlan(entries, command, policy);
  }

  return syncPlan(entries, policy);
}
