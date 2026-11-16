// 사용자에게 배포할 플러그인 산출물(플러그인이 쓰는 파일만)을 한 폴더에 모은다. 저장소 뿌리에는 개발 도구의 package.json과 잠금 파일이 함께 있어, 그대로 설치하면 Claude Code가 개발 의존성을 설치하기 때문이다(「4단계 계획에서 보완」)
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

/** 산출물에 담는 것(저장소 뿌리에서의 경로). 폴더는 안의 파일을 모두 담는다. 배포 때 main에는 이것만 올린다(설계 「8단계에서 정한 것」). README는 담지 않는다 */
export const PLUGIN_PATHS = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json", "skills/aq/SKILL.md", "skills/aq/scripts/aq.mjs", "skills/aq/assets", "hooks", "LICENSE"];

/** 한 경로 아래의 파일을 이름 차례로 늘어놓는다. 없으면 stat이 던진다 */
async function listFiles(root, path) {
  const info = await stat(join(root, path));
  if (!info.isDirectory()) return [path];
  const names = (await readdir(join(root, path))).sort();
  return (await Promise.all(names.map((name) => listFiles(root, `${path}/${name}`)))).flat();
}

/**
 * root의 산출물을 out에 담고 담은 파일(out에서의 경로)을 돌려준다.
 * out이 비어 있지 않거나 담을 것 가운데 하나라도 없으면, 아무것도 쓰기 전에 던진다
 */
export async function packPlugin(root, out) {
  let existing = [];
  try {
    existing = await readdir(out);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (existing.length > 0) throw new Error(`담을 곳이 비어 있지 않다: ${out}`);
  const files = [];
  for (const path of PLUGIN_PATHS) {
    try {
      files.push(...(await listFiles(root, path)));
    } catch (error) {
      throw new Error(`담을 것을 읽지 못했다: ${path} (${error?.code ?? "unknown"})`);
    }
  }
  for (const file of files) {
    await mkdir(dirname(join(out, file)), { recursive: true });
    await copyFile(join(root, file), join(out, file));
  }
  return files;
}
