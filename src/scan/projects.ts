// 작업 폴더에서 프로젝트를 정한다. 위로 올라가며 처음 만나는 깃 저장소의 뿌리이고, 따로 떼어 낸 작업 폴더(워크트리)는 본 저장소로 묶으며, 깃이 아니면 작업 폴더 자체다. 프로젝트로 보지 않는 폴더를 가른다(설계 10)
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, readText } from "./fs.ts";

export interface ProjectContext {
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
}

export interface ProjectRef {
  /** 프로젝트 뿌리(정규화하지 않은 절대 경로) */
  root: string;
  normRoot: string;
  kind: "git" | "folder";
  /** 작업 폴더가 지금 PC에 있는지. 없으면 깃 뿌리를 찾지 못해 작업 폴더 자체가 프로젝트다 */
  exists: boolean;
  /** 프로젝트로 보지 않는 폴더(홈 자체, 바탕화면·문서·내려받기 자체, OS 임시 폴더 아래, 드라이브의 뿌리) */
  excluded: boolean;
  /** 이 프로젝트로 묶인 작업 폴더(정규화, 차례대로) */
  cwds: string[];
}

/** .git 파일이 가리키는 깃 폴더의 commondir를 따라가 본 저장소의 뿌리를 찾는다. 하위 모듈처럼 commondir가 없으면 null이다. */
async function mainRootFromGitFile(dir: string, dotGit: string): Promise<string | null> {
  const text = await readText(dotGit);
  if (text.status !== "ok") return null;
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(text.text);
  if (match === null) return null;
  const gitDir = isAbsolute(match[1]!) ? match[1]! : resolve(dir, match[1]!);
  const common = await readText(join(gitDir, "commondir"));
  if (common.status !== "ok") return null;
  const commonDir = resolve(gitDir, common.text.trim());
  return parse(commonDir).base.toLowerCase() === ".git" ? dirname(commonDir) : null;
}

async function gitRootFrom(start: string): Promise<string | null> {
  let dir = start;
  for (;;) {
    const dotGit = join(dir, ".git");
    const info = await entryInfo(dotGit);
    if (info.exists && info.isDir) return dir;
    if (info.exists && info.isFile) return (await mainRootFromGitFile(dir, dotGit)) ?? dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const under = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);

/** 프로젝트로 보지 않는 폴더인지 본다. 경로는 정규화한 것이다. */
export function isExcludedFolder(normRoot: string, normCwd: string, context: ProjectContext): boolean {
  const norm = (path: string): string => normalizePath(path, context.platform);
  const specials = [context.homedir, join(context.homedir, "Desktop"), join(context.homedir, "Documents"), join(context.homedir, "Downloads")].map(norm);
  const tmp = norm(context.tmpdir);
  const driveRoot = /^[a-z]:\/?$/i.test(normRoot) || normRoot === "/";
  return specials.includes(normRoot) || driveRoot || under(normRoot, tmp) || under(normCwd, tmp);
}

export async function resolveProject(cwd: string, context: ProjectContext): Promise<ProjectRef> {
  const absolute = resolve(cwd);
  const info = await entryInfo(absolute);
  const exists = info.exists && info.isDir;
  const gitRoot = exists ? await gitRootFrom(absolute) : null;
  const root = gitRoot ?? absolute;
  const normRoot = normalizePath(root, context.platform);
  const normCwd = normalizePath(absolute, context.platform);
  return { root, normRoot, kind: gitRoot === null ? "folder" : "git", exists, excluded: isExcludedFolder(normRoot, normCwd, context), cwds: [normCwd] };
}

/** 작업 폴더들을 프로젝트로 묶는다. 정규화한 뿌리 차례로 낸다. 같은 뿌리로 묶인 작업 폴더는 cwds에 모이고, 원문 뿌리는 표기 가운데 글자 차례로 가장 앞선 것이다. */
export async function groupProjects(cwds: readonly string[], context: ProjectContext): Promise<ProjectRef[]> {
  // 같은 곳을 다른 표기(Windows의 대소문자 등)로 적은 작업 폴더는 글자 차례로 가장 앞선 표기 하나로 본다. 입력의 차례와 상관없이 같다
  const byNormCwd = new Map<string, string>();
  for (const cwd of cwds) {
    const normCwd = normalizePath(cwd, context.platform);
    const previous = byNormCwd.get(normCwd);
    if (previous === undefined || cwd < previous) byNormCwd.set(normCwd, cwd);
  }
  const byRoot = new Map<string, ProjectRef>();
  for (const normCwd of [...byNormCwd.keys()].sort()) {
    const ref = await resolveProject(byNormCwd.get(normCwd)!, context);
    const existing = byRoot.get(ref.normRoot);
    if (existing === undefined) {
      byRoot.set(ref.normRoot, ref);
      continue;
    }
    existing.cwds.push(normCwd);
    existing.exists ||= ref.exists;
    existing.excluded ||= ref.excluded;
    if (ref.root < existing.root) existing.root = ref.root;
  }
  const out = [...byRoot.values()].sort((x, y) => (x.normRoot < y.normRoot ? -1 : x.normRoot > y.normRoot ? 1 : 0));
  for (const ref of out) ref.cwds.sort();
  return out;
}
