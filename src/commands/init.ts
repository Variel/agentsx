import { initRemote } from "../core/remote.js";

export async function runInit(repoUrl: string): Promise<void> {
  const normalized = repoUrl.trim();
  if (!normalized) {
    throw new Error("repo-url이 비어 있습니다.");
  }

  const { mirrorPath, branch } = await initRemote(normalized);

  console.log([
    "초기화 완료",
    `원격 저장소: ${normalized}`,
    `로컬 미러: ${mirrorPath}`,
    `기본 브랜치: ${branch}`,
  ].join("\n"));
}
