// 이 도구 자신의 정체를 정한다. 스킬 이름과 플러그인 이름(설계 7.1), 그리고 묶은 실행 파일(<스킬 폴더>/scripts/aq.mjs)의 위치에서 얻은 스킬 폴더의 실제 경로다. 정비 후보에서 이 도구를 빼는 데 쓴다(설계 16.2)
import { realpath } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import type { SelfIdentity } from "../core/installs/candidates.ts";

/** 이 도구의 스킬 이름(스킬 폴더 이름) */
export const SELF_SKILL_NAMES: readonly string[] = ["aq"];
/** 이 도구의 플러그인 이름(.claude-plugin/plugin.json의 name). 플러그인은 4단계에 만들지만, 빼는 쪽이 안전해서 지금부터 넣는다 */
export const SELF_PLUGIN_NAMES: readonly string[] = ["chunsik-garage"];
const BUNDLE_FILE = "aq.mjs";

/** entryFile은 실행한 파일의 경로다. 묶은 실행 파일이 아니거나(원본으로 돌릴 때) 스킬 폴더를 풀지 못하면 스킬 폴더의 경로는 없다 */
export async function selfIdentity(entryFile: string): Promise<SelfIdentity> {
  const skillRealPaths: string[] = [];
  if (basename(entryFile) === BUNDLE_FILE && basename(dirname(entryFile)) === "scripts") {
    try {
      skillRealPaths.push(normalizePath(await realpath(dirname(dirname(entryFile)))));
    } catch {
      // 스킬 폴더가 없으면 이 도구의 스킬 폴더라고 할 것이 없다
    }
  }
  return { skillNames: [...SELF_SKILL_NAMES], pluginNames: [...SELF_PLUGIN_NAMES], skillRealPaths };
}
