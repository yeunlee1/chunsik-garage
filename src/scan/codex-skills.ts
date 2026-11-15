// Codex의 스킬을 찾는 곳 하나를 Codex와 같은 꼴로 훑는다. 여섯 단의 폴더까지의 SKILL.md, 숨김 폴더 건너뛰기, 폴더 링크 따라가기(같은 실제 폴더는 한 번), 파일 링크 무시, 상한, 플러그인 이름 접두, Codex가 싣는 머리말인지를 본다. 스킬의 글은 버린다(설계 「5단계 2부 계획 전 결정」 6번)
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, listDir, readText } from "./fs.ts";
import { parseFrontmatter, readSkillFolder, type SkillFolder } from "./skills.ts";

export interface CodexSkillFolder {
  /** 스킬 폴더(SKILL.md가 든 폴더)의 사실. isLink는 그 폴더 자체가 링크인지다 */
  folder: SkillFolder;
  /** 찾는 곳에서 이 스킬 폴더까지 링크를 지나왔다(스킬 폴더 자체가 링크인 것도 든다). 링크로 건 위치는 사본으로 세지 않는다 */
  viaLink: boolean;
  /** Codex가 싣는 머리말이다(codexFrontmatterOk). 거짓이고 읽은 SKILL.md면 S3의 "머리말이 없는 스킬"이다 */
  frontmatterOk: boolean;
  /** Codex가 부르는 이름. 가장 가까운 플러그인 매니페스트의 이름이 있으면 '<그 이름>:'이 앞에 붙는다 */
  name: string;
  /** SKILL.md 파일의 실제 경로(정규화). [[skills.config]]의 path와 견준다 */
  skillFileRealPath: string | null;
}

export interface CodexSkillRootScan {
  skills: CodexSkillFolder[];
  /** 가리키는 곳이 없는 링크(S3) */
  danglingLinks: string[];
  /** 목록을 읽지 못한 폴더 */
  unreadableDirs: string[];
  /** 폴더 수나 항목 수가 상한에 닿아 다 보지 못했다 */
  truncated: boolean;
}

export interface CodexSkillScanLimits {
  maxDirectories: number;
  maxEntries: number;
}

/** 공개 소스 ext/skills/src/loader(MAX_SCAN_DEPTH, MAX_SKILLS_DIRS_PER_ROOT, MAX_SKILLS_ENTRIES_PER_ROOT)와 같다 */
const MAX_DEPTH = 6;
const LIMITS: CodexSkillScanLimits = { maxDirectories: 2000, maxEntries: 20_000 };
/** 플러그인 뿌리 아래의 매니페스트 자리(차례대로, 공개 소스 exec-server-protocol의 DISCOVERABLE_PLUGIN_MANIFEST_PATHS) */
export const CODEX_MANIFEST_PATHS = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"] as const;
const MANIFEST_DIRS: readonly string[] = CODEX_MANIFEST_PATHS.map((path) => path.split("/")[0]!);

/**
 * Codex가 싣는 머리말인지. 첫 줄이 ---이고 닫는 ---가 있으며 description이 비지 않아야 한다(공개 소스 skills/src/parser.rs). Codex는 BOM을 벗기지 않아
 * BOM으로 시작하면 머리말을 찾지 못한다. description의 값을 이 해석기가 읽지 못하는 꼴이거나 읽지 못한 최상위 줄이 있으면 Codex가 읽는 description이 있을 수 있어 있는 것으로 본다
 */
export function codexFrontmatterOk(bytes: Buffer): boolean {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return false;
  const front = parseFrontmatter(bytes.toString("utf8"));
  if (!front.present) return false;
  const description = front.fields.description;
  if (description !== undefined) return description.split(/\s+/u).some((part) => part !== "");
  return front.unreadable.includes("description") || front.unreadable.includes("name");
}

/** 플러그인 뿌리의 매니페스트 이름. 차례대로 첫 파일을 읽어 name을 낸다. name이 비면 그 폴더의 이름이고, 읽지 못하거나 풀리지 않으면 null이다(공개 소스 utils/plugins의 plugin_namespace_for_root_uri) */
async function manifestNamespace(pluginRoot: string): Promise<string | null> {
  for (const relative of CODEX_MANIFEST_PATHS) {
    const path = join(pluginRoot, ...relative.split("/"));
    if (!(await entryInfo(path)).isFile) continue;
    const read = await readText(path);
    if (read.status !== "ok") return null;
    try {
      const value = JSON.parse(read.text) as { name?: unknown } | null;
      const name = value?.name === undefined ? "" : value.name;
      if (typeof name !== "string") return null;
      return name.trim() === "" ? basename(pluginRoot) : name;
    } catch {
      return null;
    }
  }
  return null;
}

const squash = (text: string): string => text.split(/\s+/u).filter((part) => part !== "").join(" ");

/** 찾는 곳 하나를 훑는다. 스킬은 찾은 차례(폴더를 넓이 차례로, 폴더 안은 이름 차례)다 */
export async function scanCodexSkillRoot(root: string, limits: CodexSkillScanLimits = LIMITS): Promise<CodexSkillRootScan> {
  const out: CodexSkillRootScan = { skills: [], danglingLinks: [], unreadableDirs: [], truncated: false };
  const rootInfo = await entryInfo(root);
  if (!rootInfo.isDir) return out;
  const visited = new Set<string>([rootInfo.realPath ?? normalizePath(root)]);
  const queue: { dir: string; depth: number; viaLink: boolean }[] = [{ dir: root, depth: 0, viaLink: false }];
  const found: { dir: string; viaLink: boolean }[] = [];
  const pluginRoots = new Set<string>();
  let directories = 1;
  let entries = 0;
  walk: while (queue.length > 0) {
    const { dir, depth, viaLink } = queue.shift()!;
    const listing = await listDir(dir);
    if (listing.status === "unreadable") out.unreadableDirs.push(dir);
    if (listing.status !== "ok") continue;
    for (const name of listing.names) {
      if (entries === limits.maxEntries) {
        out.truncated = true;
        break walk;
      }
      entries++;
      const path = join(dir, name);
      const info = await entryInfo(path);
      if (info.dangling) {
        out.danglingLinks.push(path);
        continue;
      }
      // 파일 링크는 따라가지 않는다(SKILL.md도). 폴더 링크만 따라간다
      if (!info.exists || (info.isLink && !info.isDir)) continue;
      if (info.isDir) {
        // 매니페스트 폴더는 숨김 폴더라 들어가지는 않고 그 부모를 플러그인 뿌리로 적는다
        if (MANIFEST_DIRS.includes(name)) pluginRoots.add(dir);
        if (depth >= MAX_DEPTH || name.startsWith(".")) continue;
        const identity = info.realPath ?? normalizePath(path);
        if (visited.has(identity)) continue;
        visited.add(identity);
        if (directories === limits.maxDirectories) {
          out.truncated = true;
          continue;
        }
        directories++;
        queue.push({ dir: path, depth: depth + 1, viaLink: viaLink || info.isLink });
        continue;
      }
      if (info.isFile && name === "SKILL.md") found.push({ dir, viaLink });
    }
  }

  const namespaces = new Map<string, string | null>();
  const namespaceOf = async (dir: string): Promise<string | null> => {
    // 스킬 폴더에서 찾는 곳까지 위로 가며 가장 가까운 유효한 매니페스트다. 찾는 곳보다 위는 보지 않는다
    for (let current = dir; ; current = dirname(current)) {
      if (pluginRoots.has(current)) {
        if (!namespaces.has(current)) namespaces.set(current, await manifestNamespace(current));
        const namespace = namespaces.get(current)!;
        if (namespace !== null) return namespace;
      }
      if (current === root || dirname(current) === current) return null;
    }
  };
  for (const { dir, viaLink } of found) {
    const folder = await readSkillFolder(dir, basename(dir));
    if (folder === null) continue;
    const skillFile = join(dir, "SKILL.md");
    let bytes: Buffer | null = null;
    try {
      bytes = await readFile(skillFile);
    } catch {
      bytes = null;
    }
    const namespace = await namespaceOf(dir);
    const own = folder.declaredName === null ? "" : squash(folder.declaredName);
    const base = own === "" ? folder.dirName : own;
    out.skills.push({
      folder,
      viaLink: viaLink || folder.isLink,
      frontmatterOk: folder.readable && bytes !== null && codexFrontmatterOk(bytes),
      name: namespace === null ? base : `${namespace}:${base}`,
      skillFileRealPath: (await entryInfo(skillFile)).realPath,
    });
  }
  return out;
}
