import { getStateDir, loadState, saveState } from "./state.js";
import { ensureRepoMirror, getDefaultBranch } from "./git.js";
import { repoSlugFromUrl } from "../utils/path.js";

export async function initRemote(repoUrl: string): Promise<{ mirrorPath: string; branch: string }> {
  const state = await loadState();
  const stateDir = getStateDir();
  const mirrorPath = `${stateDir}/repos/${repoSlugFromUrl(repoUrl)}`;

  await ensureRepoMirror(repoUrl, mirrorPath);
  const branch = getDefaultBranch(mirrorPath);

  state.remote = {
    repoUrl,
    mirrorPath,
    defaultBranch: branch,
  };

  await saveState(state);
  return { mirrorPath, branch };
}

export async function requireRemote(): Promise<{
  state: Awaited<ReturnType<typeof loadState>>;
  remote: NonNullable<Awaited<ReturnType<typeof loadState>>["remote"]>;
}> {
  const state = await loadState();
  if (!state.remote) {
    throw new Error("원격 저장소가 초기화되지 않았습니다. 먼저 `npx agentsx init <repo-url>`를 실행하세요.");
  }

  return {
    state,
    remote: state.remote,
  };
}
