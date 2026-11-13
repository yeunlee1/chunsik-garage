// 스킬 폴더(<이름>/SKILL.md)를 찾아 폴더마다 실제 경로, 링크인지, 만든 시각, 머리말의 몇 가지, 내용 지문을 낸다. 스킬의 글은 버린다(설계 10, 11.3 E5·F5)
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { entryInfo, listDir, readText } from "./fs.ts";

export interface SkillFolder {
  /** 폴더 이름. 사용자·프로젝트 스킬은 이 이름으로도 불린다 */
  dirName: string;
  /** 스킬 폴더의 경로(링크면 링크 자체) */
  path: string;
  /** 링크를 푼 실제 경로(정규화) */
  realPath: string | null;
  isLink: boolean;
  /** 폴더(링크면 링크 자체)를 만든 시각. 알 수 없으면 null */
  createdMs: number | null;
  /** 링크의 대상 폴더를 만든 시각. 링크가 아니면 null */
  targetCreatedMs: number | null;
  /** SKILL.md를 읽었는지. 읽지 못하면 머리말을 판정하지 않는다 */
  readable: boolean;
  hasFrontmatter: boolean;
  /** 머리말의 name. 없거나 읽지 못하면 null */
  declaredName: string | null;
  /** 머리말에 name이 있는데 값을 읽지 못했다(블록 값, 닫히지 않은 인용 등) */
  nameUnreadable: boolean;
  disableModelInvocation: boolean;
  /** 머리말의 user-invocable이 false가 아니면 참 */
  userInvocable: boolean;
  /** 폴더 안 모든 파일의 상대 경로와 내용으로 만든 지문. 폴더 안에 링크가 있거나, 읽지 못하거나, 너무 크면 null(견줄 수 없는 사본) */
  contentHash: string | null;
}

export interface SkillRootScan {
  skills: SkillFolder[];
  /** 가리키는 곳이 없는 링크(S3) */
  danglingLinks: string[];
  /** 목록을 읽지 못한 스킬 폴더 */
  unreadableDirs: string[];
  /** .claude-plugin/plugin.json이 든 폴더(스킬 폴더에 둔 플러그인). pluginDirs 옵션을 켰을 때만 가른다 */
  pluginDirs: string[];
}

export const CONTENT_HASH_MAX_BYTES = 32 * 1024 * 1024;

export interface Frontmatter {
  present: boolean;
  /** 읽은 값(인용을 풀고 인용 밖 주석을 뗀 것) */
  fields: Record<string, string>;
  /** 열쇠는 있는데 값을 읽지 못한 것(블록 값, 흐름 값, 닫히지 않은 인용) */
  unreadable: string[];
}

/** 큰따옴표 안의 한 글자 탈출(YAML 1.2). */
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "\t",
  "\t": "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\u0085",
  _: " ",
  L: " ",
  P: " ",
};
/** 큰따옴표 안의 16진 탈출과 그 자릿수(YAML 1.2). */
const HEX_ESCAPES: Readonly<Record<string, number>> = { x: 2, u: 4, U: 8 };

/**
 * YAML의 한 줄 값 하나를 읽는다. 큰따옴표(\" 등의 탈출 글자)와 작은따옴표('' 는 ')를 풀고, 인용 밖의 주석(# 앞에 공백)을 뗀다.
 * 블록 값(| >), 흐름 값([ {), 닻·별칭·꼬리표(& * !)와 닫히지 않은 인용은 읽지 못한 것(null)으로 둔다.
 */
export function readScalar(raw: string): string | null {
  const s = raw.trim();
  if (s === "" || s.startsWith("#")) return "";
  const rest = (from: number): boolean => {
    const tail = s.slice(from).trim();
    return tail === "" || tail.startsWith("#");
  };
  if (s[0] === '"') {
    let out = "";
    for (let i = 1; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "\\") {
        // YAML 큰따옴표의 탈출 글자(YAML 1.2 「Escaped Characters」). 모르는 탈출 글자는 읽지 못한 값이다(새 이름을 지어내지 않는다)
        const next = s[i + 1];
        if (next === undefined) return null;
        if (Object.hasOwn(SIMPLE_ESCAPES, next)) {
          out += SIMPLE_ESCAPES[next];
          i++;
          continue;
        }
        if (!Object.hasOwn(HEX_ESCAPES, next)) return null;
        const width = HEX_ESCAPES[next]!;
        // 자릿수가 모자라면 글의 끝이라 닫는 따옴표가 없어 아래에서 읽지 못한 값이 된다
        const hex = s.slice(i + 2, i + 2 + width);
        if (!/^[0-9A-Fa-f]+$/.test(hex)) return null;
        const code = Number.parseInt(hex, 16);
        if (code > 0x10ffff) return null;
        out += String.fromCodePoint(code);
        i += 1 + width;
        continue;
      }
      if (ch === '"') return rest(i + 1) ? out : null;
      out += ch;
    }
    return null;
  }
  if (s[0] === "'") {
    let out = "";
    for (let i = 1; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "'") {
        if (s[i + 1] === "'") {
          out += "'";
          i++;
          continue;
        }
        return rest(i + 1) ? out : null;
      }
      out += ch;
    }
    return null;
  }
  if ("|>[{&*!".includes(s[0]!)) return null;
  const comment = s.search(/\s#/);
  return (comment === -1 ? s : s.slice(0, comment)).trim();
}

const YAML_TRUE = new Set(["true", "True", "TRUE"]);
const YAML_FALSE = new Set(["false", "False", "FALSE"]);

/**
 * 맨 앞의 --- 줄과 닫는 --- 줄 사이에서 들여쓰지 않은 "열쇠: 값" 줄만 읽는다. 들여쓴 줄(묶음의 안쪽)은 보지 않는다.
 * 이름을 정할 수 있는 줄을 이 방법으로 다 읽지 못하면 name을 읽지 못한 열쇠로 둔다. 이 방법으로 읽지 못하는 최상위 줄(따옴표로 쓴 열쇠, 여러 줄 열쇠, 흐름 꼴)이 있거나, name의 값이 다음 줄로 이어지거나,
 * 최상위 열쇠 앞에 들여쓴 줄이 있거나(머리말 전체를 들여썼다), 닫는 --- 줄이 들여써 있거나(블록 값 안의 줄일 수 있다), name이 두 번 나올 때다.
 * 이름이 없는 것으로 넘기면 그 스킬의 이름 꼴이 모자란다는 것을 평가가 알 수 없다(설계 11.3 E5)
 */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const none: Frontmatter = { present: false, fields: Object.create(null) as Record<string, string>, unreadable: [] };
  if (lines[0]?.trim() !== "---") return none;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return none;
  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  const unreadable: string[] = [];
  const mark = (key: string): void => {
    if (!unreadable.includes(key)) unreadable.push(key);
  };
  // 닫는 줄이 들여써 있으면 블록 값 안의 줄을 끝으로 본 것일 수 있다. 그 뒤의 name을 읽지 못했을 수 있다
  if (lines[end] !== lines[end]!.trimStart()) mark("name");
  /** 바로 앞의 열쇠. 들여쓴 줄은 그 값이 이어지는 것이거나 그 묶음의 안쪽이다 */
  let previous: string | null = null;
  let nameSeen = false;
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    if (/^\s/.test(line)) {
      if (line.trimStart().startsWith("#")) continue;
      // 최상위 열쇠 앞의 들여쓴 줄이다. 머리말 전체를 들여써서 열쇠를 읽지 못한다
      if (previous === null) mark("name");
      // name의 값이 다음 줄로 이어진다. 읽은 앞부분은 이름이 아니다
      if (previous === "name") {
        mark("name");
        delete fields.name;
      }
      continue;
    }
    if (line.startsWith("#")) continue;
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line);
    if (match === null) {
      // 이 방법으로 읽지 못하는 줄이다. 그 줄이 이름을 정할 수 있다
      mark("name");
      previous = null;
      continue;
    }
    previous = match[1]!;
    if (previous === "name") {
      // name이 두 번 나오면 어느 값이 이름인지 모른다
      if (nameSeen) {
        mark("name");
        delete fields.name;
        continue;
      }
      nameSeen = true;
    }
    const value = readScalar(match[2] ?? "");
    if (value === null) mark(match[1]!);
    else fields[match[1]!] = value;
  }
  return { present: true, fields, unreadable };
}

/** 폴더 안 모든 파일로 지문을 만든다. 링크가 하나라도 있거나 읽지 못하거나 합이 상한을 넘으면 null이다. */
export async function contentHash(dir: string, maxBytes = CONTENT_HASH_MAX_BYTES): Promise<string | null> {
  let base: string;
  try {
    base = await realpath(dir);
  } catch {
    return null;
  }
  const entries: string[] = [];
  let total = 0;
  const walk = async (current: string): Promise<boolean> => {
    let names: string[];
    try {
      names = (await readdir(current)).sort();
    } catch {
      return false;
    }
    for (const name of names) {
      const path = join(current, name);
      let info;
      try {
        info = await lstat(path);
      } catch {
        return false;
      }
      if (info.isSymbolicLink()) return false;
      if (info.isDirectory()) {
        if (!(await walk(path))) return false;
        continue;
      }
      if (!info.isFile()) return false;
      total += info.size;
      if (total > maxBytes) return false;
      let data: Buffer;
      try {
        data = await readFile(path);
      } catch {
        return false;
      }
      const rel = relative(base, path).replace(/\\/g, "/");
      entries.push(`${rel}\u0000${createHash("sha256").update(data).digest("hex")}`);
    }
    return true;
  };
  if (!(await walk(base))) return null;
  return createHash("sha256").update(entries.sort().join("\n")).digest("hex");
}

/** 스킬 하나의 폴더(링크여도 된다)를 본다. SKILL.md가 없으면 null이다. */
export async function readSkillFolder(path: string, dirName: string): Promise<SkillFolder | null> {
  const info = await entryInfo(path);
  if (!info.isDir) return null;
  const skillMd = await readText(join(path, "SKILL.md"));
  if (skillMd.status === "missing") return null;
  const front: Frontmatter =
    skillMd.status === "ok" ? parseFrontmatter(skillMd.text) : { present: false, fields: Object.create(null) as Record<string, string>, unreadable: [] };
  const name = front.fields.name;
  return {
    dirName,
    path,
    realPath: info.realPath,
    isLink: info.isLink,
    createdMs: info.createdMs,
    targetCreatedMs: info.targetCreatedMs,
    readable: skillMd.status === "ok",
    hasFrontmatter: front.present,
    declaredName: name !== undefined && name !== "" ? name : null,
    nameUnreadable: front.unreadable.includes("name"),
    // 읽지 못한 값은 기본값(모델이 부를 수 있음, 사람이 부를 수 있음)으로 둔다
    disableModelInvocation: YAML_TRUE.has(front.fields["disable-model-invocation"] ?? ""),
    userInvocable: !YAML_FALSE.has(front.fields["user-invocable"] ?? ""),
    contentHash: await contentHash(path),
  };
}

export interface ScanSkillRootOptions {
  /** 사용자·프로젝트 스킬 폴더를 훑을 때 참으로 준다. .claude-plugin/plugin.json이 든 폴더를 스킬이 아니라 플러그인 폴더로 가른다(설계 10 「스킬 폴더에 둔 플러그인」) */
  pluginDirs?: boolean;
}

/** 스킬을 두는 폴더 하나(<홈>/skills, <프로젝트>/.claude/skills, 플러그인의 skills)를 훑는다. 이름 차례다. */
export async function scanSkillRoot(dir: string, options: ScanSkillRootOptions = {}): Promise<SkillRootScan> {
  const out: SkillRootScan = { skills: [], danglingLinks: [], unreadableDirs: [], pluginDirs: [] };
  const listing = await listDir(dir);
  if (listing.status === "unreadable") out.unreadableDirs.push(dir);
  if (listing.status !== "ok") return out;
  for (const name of listing.names) {
    const path = join(dir, name);
    const info = await entryInfo(path);
    if (info.dangling) {
      out.danglingLinks.push(path);
      continue;
    }
    // 바로 아래 폴더(링크면 가리키는 곳)에 플러그인 매니페스트가 있으면 보통 스킬이 아니라 스킬 폴더에 둔 플러그인이다(공식 문서 plugins/loading)
    if (options.pluginDirs === true && info.isDir && (await entryInfo(join(path, ".claude-plugin", "plugin.json"))).isFile) {
      out.pluginDirs.push(path);
      continue;
    }
    const skill = await readSkillFolder(path, name);
    if (skill !== null) out.skills.push(skill);
  }
  return out;
}

/** 플러그인의 skills 경로 하나를 본다. 경로 자체에 SKILL.md가 있으면 그 폴더가 스킬 하나이고, 없으면 그 아래의 <이름>/SKILL.md를 훑는다. */
export async function scanSkillPath(path: string): Promise<SkillRootScan> {
  if ((await entryInfo(join(path, "SKILL.md"))).isFile) {
    const single = await readSkillFolder(path, basename(path));
    return { skills: single === null ? [] : [single], danglingLinks: [], unreadableDirs: [], pluginDirs: [] };
  }
  return scanSkillRoot(path);
}
