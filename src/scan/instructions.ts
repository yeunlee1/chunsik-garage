// 지침 파일을 읽어 크기, 글자 종류별 글자 수, 줄마다의 지문만 남기고 글은 버린다. 전역 지침에 프로젝트의 경로나 이름이 몇 번 나오는지도 센다(설계 10 「지침 파일의 범위」, 11.3 S1·F3·F4, 17)
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { basename, join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, listDir, readText } from "./fs.ts";

export interface InstructionFile {
  path: string;
  /** 링크를 푼 실제 경로(정규화). 전역과 프로젝트가 같은 파일인지 견줄 때 쓴다 */
  realPath: string | null;
  bytes: number;
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
 * 파일 목록을 읽어 지침 묶음을 만든다. 없는 파일은 건너뛴다. 글은 메모리에서 세고 버린다.
 * mentionTargets가 있으면 그 횟수도 센다. 실제 경로가 sameAsGlobal에 든 파일은 목록과 크기에는 넣고 줄 지문에서만 뺀다.
 */
export async function readInstructionSet(
  paths: readonly string[],
  mentionTargets: readonly MentionTarget[] = [],
  sameAsGlobal: ReadonlySet<string> = new Set(),
): Promise<{ set: InstructionSet; mentions: Record<string, number> }> {
  const set = emptyInstructionSet();
  const hashes = new Set<string>();
  const mentions: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const path of [...new Set(paths)].sort()) {
    const read = await readText(path);
    if (read.status === "missing") continue;
    if (read.status === "unreadable") {
      set.unreadable.push(path);
      continue;
    }
    const info = await entryInfo(path);
    const same = info.realPath !== null && sameAsGlobal.has(info.realPath);
    const bytes = Buffer.byteLength(read.text, "utf8");
    set.files.push({ path, realPath: info.realPath, bytes, sameAsGlobal: same });
    set.bytes += bytes;
    const chars = countChars(read.text);
    set.chars.ascii += chars.ascii;
    set.chars.other += chars.other;
    if (!same) for (const hash of linesForOverlap(read.text)) hashes.add(hash);
    for (const [key, count] of Object.entries(countMentions(read.text, mentionTargets))) mentions[key] = (mentions[key] ?? 0) + count;
  }
  set.lineHashes = [...hashes].sort();
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

/** 전역 지침을 읽는다. 전역 지침에 목록의 프로젝트가 나온 횟수도 센다. */
export async function readGlobalInstructions(claudeHome: string, mentionTargets: readonly MentionTarget[]): Promise<{ set: InstructionSet; mentions: Record<string, number> }> {
  const found = await globalInstructionPaths(claudeHome);
  const read = await readInstructionSet(found.paths, mentionTargets);
  read.set.unreadableDirs = found.unreadableDirs;
  return read;
}

/** 프로젝트 지침을 읽는다. 전역 지침과 같은 파일은 표시하고 줄 지문에서만 뺀다. */
export async function readProjectInstructions(root: string, global: InstructionSet): Promise<InstructionSet> {
  const found = await projectInstructionPaths(root);
  const { set } = await readInstructionSet(found.paths, [], realPaths(global));
  set.unreadableDirs = found.unreadableDirs;
  return set;
}

/** 정규화한 실제 경로들의 집합(같은 파일인지 견줄 때 쓴다). */
export function realPaths(set: InstructionSet): Set<string> {
  return new Set(set.files.map((file) => file.realPath ?? normalizePath(file.path)));
}
