// 버전이 쓰이는 곳을 읽고 서로 견준다. check-versions와 시험이 같이 쓴다(설계 7.1)
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 버전을 읽는 곳(저장소 뿌리에서의 경로)과 차례. Codex 매니페스트 둘은 5단계에서 더한다 */
export const VERSION_FILES = ["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"];

const SEMVER = /^\d+\.\d+\.\d+$/;
/** 프로그램 안의 버전 줄. 줄의 맨 앞에서 시작해야 해서 주석에 적힌 꼴은 읽지 않는다 */
const PROGRAM_VERSION_LINE = /^export const PROGRAM_VERSION = "([^"]*)";\r?$/gm;

/** 파일의 글에서 버전을 뽑는다. 찾지 못하면 undefined이고, JSON이 풀리지 않으면 던진다 */
const READERS = {
  "package.json": (text) => JSON.parse(text).version,
  "src/version.ts": (text) => {
    const found = [...text.matchAll(PROGRAM_VERSION_LINE)];
    return found.length === 1 ? found[0][1] : undefined;
  },
  ".claude-plugin/plugin.json": (text) => JSON.parse(text).version,
  ".claude-plugin/marketplace.json": (text) => {
    const plugins = JSON.parse(text).plugins;
    const own = Array.isArray(plugins) ? plugins.filter((plugin) => plugin?.name === "chunsik-garage") : [];
    return own.length === 1 ? own[0].version : undefined;
  },
};

/** 뿌리 폴더에서 정한 차례로 버전을 읽는다. 읽지 못하면 version이 null이고 problem에 까닭을 적는다 */
export function readVersions(root) {
  return VERSION_FILES.map((file) => {
    let text;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch (error) {
      return { file, version: null, problem: `읽지 못함(${error?.code ?? "unknown"})` };
    }
    let version;
    try {
      version = READERS[file](text);
    } catch {
      return { file, version: null, problem: "JSON으로 풀리지 않음" };
    }
    if (typeof version !== "string" || !SEMVER.test(version)) return { file, version: null, problem: "버전을 찾지 못함" };
    return { file, version, problem: null };
  });
}

/** 알릴 것의 목록. 읽지 못한 곳마다 한 줄, 읽은 버전이 서로 다르면 모두를 적은 한 줄이다. 모두 같으면 빈 목록이다 */
export function versionProblems(entries) {
  const problems = entries.filter((entry) => entry.problem !== null).map((entry) => `${entry.file}: ${entry.problem}`);
  const found = entries.filter((entry) => entry.version !== null);
  if (new Set(found.map((entry) => entry.version)).size > 1) problems.push(`버전이 다르다: ${found.map((entry) => `${entry.file} ${entry.version}`).join(", ")}`);
  return problems;
}
