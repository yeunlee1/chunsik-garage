// 지침 파일을 읽어 크기, 글자 종류별 글자 수, 줄마다의 지문만 남기고 글은 버린다. 전역 지침에 프로젝트의 경로나 이름이 몇 번 나오는지도 센다(설계 10 「지침 파일의 범위」, 11.3 S1·F3·F4, 17)
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, listDir, readText } from "./fs.ts";

export interface InstructionFile {
  path: string;
  /** 링크를 푼 실제 경로(정규화). 전역과 프로젝트가 같은 파일인지 견줄 때 쓴다 */
  realPath: string | null;
  bytes: number;
  /** 공백이 아닌 글자가 하나라도 있다. 0바이트 파일과 공백만 있는 파일은 거짓이다(설계 11.3 F3 「지침이 있다는 것」) */
  hasContent: boolean;
  /** 전역 지침과 같은 파일(링크이거나 실제 경로가 같음)이다. F4에서 견주지 않으므로 줄 지문에 넣지 않는다(설계 11.3 F4) */
  sameAsGlobal: boolean;
}

export interface InstructionSet {
  /** 읽은 파일(경로 차례). 전역과 같은 파일도 든다(F3과 정밀 점검의 파일 목록에 쓴다) */
  files: InstructionFile[];
  bytes: number;
  chars: { ascii: number; other: number };
  /** 전역과 같은 파일을 뺀 파일들에서, 앞뒤 공백을 뗀 20자 이상 줄의 지문(SHA-256 앞 16바이트, 16진). 중복 없이 차례대로 */
  lineHashes: string[];
  /** 있지만 읽지 못한 파일 */
  unreadable: string[];
  /** 목록을 읽지 못한 규칙 폴더. 그 안의 지침은 보지 못했다 */
  unreadableDirs: string[];
}

export const MIN_LINE_CHARS = 20;
const RULES_MAX_DEPTH = 8;
/** Claude Code가 가져오기(@경로)를 따르는 깊이. 문서의 「maximum depth of four hops」다(설계 「0.3.0에서 정한 것」) */
export const MAX_IMPORT_HOPS = 4;

/** 가져오기를 따르는 법. 주지 않으면 따르지 않는다 */
export interface ImportOptions {
  /** `@~/`를 풀 홈 폴더 */
  homedir: string;
  /** 가져온 파일이 이 폴더 안일 때만 따른다(프로젝트 지침). null이면 어디든 따른다(전역 지침) */
  within: string | null;
}

export function emptyInstructionSet(): InstructionSet {
  return { files: [], bytes: 0, chars: { ascii: 0, other: 0 }, lineHashes: [], unreadable: [], unreadableDirs: [] };
}

export function lineHash(line: string): string {
  return createHash("sha256").update(line).digest("hex").slice(0, 32);
}

/** 글자 종류별 글자 수. ASCII와 그 밖의 글자(코드 포인트 단위)를 나눈다. */
export function countChars(text: string): { ascii: number; other: number } {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.codePointAt(0)! < 0x80) ascii++;
    else other++;
  }
  return { ascii, other };
}

/** 겹침 비교에 쓰는 줄의 지문들. 줄은 LF로 가르고 끝의 CR과 앞뒤 공백을 뗀다. */
export function linesForOverlap(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if ([...line].length >= MIN_LINE_CHARS) out.push(lineHash(line));
  }
  return out;
}

export interface FoundFiles {
  /** 찾은 파일(경로 차례) */
  paths: string[];
  /** 목록을 읽지 못한 폴더(경로 차례) */
  unreadableDirs: string[];
}

/** 폴더 아래의 .md 파일을 찾는다. 폴더 링크는 따라가지 않고 깊이를 묶는다. 목록을 읽지 못한 폴더를 함께 낸다. */
export async function markdownFilesUnder(dir: string): Promise<FoundFiles> {
  const paths: string[] = [];
  const unreadableDirs: string[] = [];
  const walk = async (current: string, depth: number): Promise<void> => {
    const listing = await listDir(current);
    if (listing.status === "unreadable") unreadableDirs.push(current);
    if (listing.status !== "ok") return;
    for (const name of listing.names) {
      const path = join(current, name);
      let info;
      try {
        info = await lstat(path);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        if (depth < RULES_MAX_DEPTH) await walk(path, depth + 1);
        continue;
      }
      if (name.toLowerCase().endsWith(".md") && (info.isFile() || info.isSymbolicLink())) paths.push(path);
    }
  };
  await walk(dir, 0);
  return { paths: paths.sort(), unreadableDirs: unreadableDirs.sort() };
}

export interface MentionTarget {
  normRoot: string;
  root: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 글 안에 프로젝트의 경로(구분 기호를 맞춰 대소문자 없이)나 폴더 이름(앞뒤가 글자·숫자가 아닌 낱말, 3자 이상)이 나온 횟수. */
export function countMentions(text: string, targets: readonly MentionTarget[]): Record<string, number> {
  const unified = text.replace(/\\/g, "/").toLowerCase();
  const out: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const target of targets) {
    const path = target.normRoot.toLowerCase();
    let count = unified.split(path).length - 1;
    const name = basename(target.root).toLowerCase();
    if ([...name].length >= 3) {
      const word = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "gu");
      const withoutPaths = path.length > 0 ? unified.split(path).join(" ") : unified;
      count += (withoutPaths.match(word) ?? []).length;
    }
    if (count > 0) out[target.normRoot] = count;
  }
  return out;
}

/**
 * 지침 글의 가져오기(@경로). 줄 어디서나 찾고, 코드 블록과 코드 칸 안, 따옴표로 감싼 경로, 앞이 빈칸이 아닌 @(메일 주소 같은 것)는 뺀다.
 * 역빗금 뒤의 빈칸은 경로의 빈칸으로 푼다(Claude Code 문서의 「Import additional files」)
 */
export function importsOf(text: string): string[] {
  // 코드 블록을 지운다. 줄 앞의 들여쓰기, 목록 표시(-, *, +, 1. 같은 것), 인용 표시(>)를 걷어 낸 뒤 ```나 ~~~로 열고, 같은 글자의 같거나 긴 울타리만 있는 줄에서 닫는다(짝 검토 1차 필수 1)
  const prose: string[] = [];
  let fence: string | null = null;
  for (const raw of text.split("\n")) {
    const body = raw.replace(/^(?:[ \t]*(?:[-*+]|\d{1,9}[.)]|>)(?=[ \t]|$))*[ \t]*/, "");
    const marker = /^(`{3,}|~{3,})/.exec(body)?.[1] ?? null;
    if (fence !== null) {
      if (marker !== null && marker[0] === fence[0] && marker.length >= fence.length && body.slice(marker.length).trim() === "") fence = null;
      prose.push("");
      continue;
    }
    if (marker !== null) {
      fence = marker;
      prose.push("");
      continue;
    }
    prose.push(raw);
  }
  // 코드 칸을 지운다. 같은 길이의 역따옴표 사이이고, 여러 줄에 걸칠 수 있지만 빈 줄(문단의 끝)은 넘지 않는다
  const cleaned = prose.join("\n").replace(/(`+)(?:(?!\n[ \t]*\n)[\s\S])*?\1/g, " ");
  const out: string[] = [];
  for (const match of cleaned.matchAll(/(?<!\S)@((?:\\ |\S)+)/g)) {
    const token = match[1]!.replace(/\\ /g, " ");
    if (token.startsWith('"') || token.startsWith("'")) continue;
    out.push(token);
  }
  return out;
}

const NETWORK_PATH = /^(\\\\|\/\/)/;

/**
 * 가져오기 경로를 푼다. ~/는 홈, 상대 경로는 가져오는 파일의 폴더 기준이다.
 * 네트워크 경로(\\서버, //서버)는 파일 조회만으로도 네트워크에 닿을 수 있어 null로 두고 따르지 않는다(짝 검토 1차 필수 3)
 */
export function importTarget(token: string, from: string, homedir: string): string | null {
  if (NETWORK_PATH.test(token)) return null;
  const target = token.startsWith("~/") || token.startsWith("~\\") ? join(homedir, token.slice(2)) : isAbsolute(token) ? token : resolve(dirname(from), token);
  return NETWORK_PATH.test(target) ? null : target;
}

const insideOf = (path: string, folder: string): boolean => normalizePath(path).startsWith(`${normalizePath(folder).replace(/\/$/, "")}/`);

/**
 * 파일 목록을 읽어 지침 묶음을 만든다. 없는 파일은 건너뛴다. 글은 메모리에서 세고 버린다.
 * mentionTargets가 있으면 그 횟수도 센다. 실제 경로가 sameAsGlobal에 든 파일은 목록과 크기에는 넣고 줄 지문에서만 뺀다.
 */
export async function readInstructionSet(
  paths: readonly string[],
  mentionTargets: readonly MentionTarget[] = [],
  sameAsGlobal: ReadonlySet<string> = new Set(),
  imports: ImportOptions | null = null,
): Promise<{ set: InstructionSet; mentions: Record<string, number> }> {
  const set = emptyInstructionSet();
  const hashes = new Set<string>();
  const mentions: Record<string, number> = Object.create(null) as Record<string, number>;
  // 처음 받은 파일은 0단계다. 가져온 파일은 가져온 파일의 단계에 하나를 더하고, 같은 파일(경로나 실제 경로)은 한 번만 읽는다
  const queue = [...new Set(paths)].sort().map((path) => ({ path, hops: 0 }));
  const seen = new Set(queue.map((item) => normalizePath(item.path)));
  const readReal = new Set<string>();
  // 프로젝트 지침이면 연결을 푼 프로젝트 뿌리의 실제 경로. 가져올 파일의 실제 경로도 이 안이어야 한다(짝 검토 1차 필수 2)
  const rootReal = imports?.within ? ((await entryInfo(imports.within)).realPath ?? normalizePath(imports.within)).replace(/\/$/, "") : null;
  for (let index = 0; index < queue.length; index++) {
    const { path, hops } = queue[index]!;
    if (hops > 0) {
      // 가져오기의 대상이 파일이 아니면(없는 경로, 폴더, 경로가 아닌 낱말) 건너뛰고, 프로젝트 지침은 연결 폴더를 거쳐 밖으로 나가는 대상을 읽기 전에 거른다
      const target = await entryInfo(path);
      if (!target.isFile) continue;
      if (rootReal !== null && (target.realPath === null || !target.realPath.startsWith(`${rootReal}/`))) continue;
    }
    const read = await readText(path);
    if (read.status === "missing") continue;
    if (read.status === "unreadable") {
      set.unreadable.push(path);
      continue;
    }
    const info = await entryInfo(path);
    if (hops > 0 && info.realPath !== null && readReal.has(info.realPath)) continue;
    if (info.realPath !== null) readReal.add(info.realPath);
    if (imports !== null && hops < MAX_IMPORT_HOPS) {
      for (const token of importsOf(read.text)) {
        const target = importTarget(token, path, imports.homedir);
        if (target === null) continue;
        if (imports.within !== null && !insideOf(target, imports.within)) continue;
        const key = normalizePath(target);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ path: target, hops: hops + 1 });
      }
    }
    const same = info.realPath !== null && sameAsGlobal.has(info.realPath);
    const bytes = Buffer.byteLength(read.text, "utf8");
    set.files.push({ path, realPath: info.realPath, bytes, hasContent: /\S/u.test(read.text), sameAsGlobal: same });
    set.bytes += bytes;
    const chars = countChars(read.text);
    set.chars.ascii += chars.ascii;
    set.chars.other += chars.other;
    if (!same) for (const hash of linesForOverlap(read.text)) hashes.add(hash);
    for (const [key, count] of Object.entries(countMentions(read.text, mentionTargets))) mentions[key] = (mentions[key] ?? 0) + count;
  }
  set.lineHashes = [...hashes].sort();
  set.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  set.unreadable.sort();
  return { set, mentions };
}

/** Claude Code의 전역 지침 파일: <홈>/CLAUDE.md와 <홈>/rules 아래의 .md(설계 10 「지침 파일의 범위」). */
export async function globalInstructionPaths(claudeHome: string): Promise<FoundFiles> {
  const rules = await markdownFilesUnder(join(claudeHome, "rules"));
  return { paths: [join(claudeHome, "CLAUDE.md"), ...rules.paths], unreadableDirs: rules.unreadableDirs };
}

/**
 * 프로젝트 뿌리의 지침 파일: CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md, .claude/rules 아래의 .md.
 * 앞의 셋이 하나도 없으면 Claude Code가 대신 읽는 AGENTS.md와 .claude/AGENTS.md를 넣는다(기본 설정, 설계 10 「지침 파일의 범위」).
 */
export async function projectInstructionPaths(root: string): Promise<FoundFiles> {
  const claudeFiles = [join(root, "CLAUDE.md"), join(root, ".claude", "CLAUDE.md"), join(root, "CLAUDE.local.md")];
  const present: string[] = [];
  for (const path of claudeFiles) if ((await entryInfo(path)).isFile) present.push(path);
  const rules = await markdownFilesUnder(join(root, ".claude", "rules"));
  const paths = present.length > 0 ? [...present, ...rules.paths] : [join(root, "AGENTS.md"), join(root, ".claude", "AGENTS.md"), ...rules.paths];
  return { paths, unreadableDirs: rules.unreadableDirs };
}

/** 전역 지침을 읽는다. 홈을 주면 가져오기를 어디든 따른다(사용자 범위의 가져오기는 승인 없이 실린다). 전역 지침에 목록의 프로젝트가 나온 횟수도 센다. */
export async function readGlobalInstructions(
  claudeHome: string,
  mentionTargets: readonly MentionTarget[],
  options: { homedir: string } | null = null,
): Promise<{ set: InstructionSet; mentions: Record<string, number> }> {
  const found = await globalInstructionPaths(claudeHome);
  const read = await readInstructionSet(found.paths, mentionTargets, new Set(), options === null ? null : { homedir: options.homedir, within: null });
  read.set.unreadableDirs = found.unreadableDirs;
  return read;
}

/** 프로젝트 지침을 읽는다. 홈을 주면 프로젝트 폴더 안의 가져오기만 따른다(바깥 가져오기는 승인을 받아야 실려 실렸는지 알 수 없다). 전역 지침과 같은 파일은 표시하고 줄 지문에서만 뺀다. */
export async function readProjectInstructions(root: string, global: InstructionSet, options: { homedir: string } | null = null): Promise<InstructionSet> {
  const found = await projectInstructionPaths(root);
  const { set } = await readInstructionSet(found.paths, [], realPaths(global), options === null ? null : { homedir: options.homedir, within: root });
  set.unreadableDirs = found.unreadableDirs;
  return set;
}

/** 정규화한 실제 경로들의 집합(같은 파일인지 견줄 때 쓴다). */
export function realPaths(set: InstructionSet): Set<string> {
  return new Set(set.files.map((file) => file.realPath ?? normalizePath(file.path)));
}
