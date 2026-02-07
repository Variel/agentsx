import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function hashFile(absPath: string): Promise<string> {
  const data = await readFile(absPath);
  return createHash("sha256").update(data).digest("hex");
}
