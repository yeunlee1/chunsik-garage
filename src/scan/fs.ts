// 스캐너가 파일 시스템을 읽는 도구. JSON과 글 읽기(없음·풀리지 않음·읽지 못함을 가른다), 항목 정보(링크인지, 만든 시각, 실제 경로), 폴더 목록. 아무것도 쓰지 않는다(설계 10)
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import { normalizePath } from "../adapters/claude/locate.ts";

export type JsonRead = { status: "ok"; value: unknown } | { status: "missing" } | { status: "unparsable" } | { status: "unreadable" };
export type TextRead = { status: "ok"; text: string } | { status: "missing" } | { status: "unreadable" };
export type DirRead = { status: "ok"; names: string[] } | { status: "missing" } | { status: "unreadable" };

const isMissing = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};

const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export async function readText(path: string): Promise<TextRead> {
  try {
    return { status: "ok", text: stripBom(await readFile(path, "utf8")) };
  } catch (error) {
    return isMissing(error) ? { status: "missing" } : { status: "unreadable" };
  }
}

/** JSON 파일을 읽는다. 맨 앞의 BOM은 떼고 푼다. */
export async function readJson(path: string): Promise<JsonRead> {
  const text = await readText(path);
  if (text.status !== "ok") return text;
  try {
    return { status: "ok", value: JSON.parse(text.text) };
  } catch {
    return { status: "unparsable" };
  }
}

/** 폴더의 이름 목록을 이름 차례로 낸다. */
export async function listDir(path: string): Promise<DirRead> {
  try {
    return { status: "ok", names: (await readdir(path)).sort() };
  } catch (error) {
    return isMissing(error) ? { status: "missing" } : { status: "unreadable" };
  }
}

/** 만든 시각(epoch 밀리초). 파일 시스템이 주지 않으면(0이거나 숫자가 아님) null이다. */
export function createdMsOf(info: Stats): number | null {
  const ms = info.birthtimeMs;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export interface EntryInfo {
  exists: boolean;
  isLink: boolean;
  /** 링크면 대상이 폴더인지, 아니면 그 자체가 폴더인지 */
  isDir: boolean;
  isFile: boolean;
  /** 항목 자체(링크면 링크)를 만든 시각 */
  createdMs: number | null;
  /** 링크의 대상을 만든 시각. 링크가 아니거나 대상이 없으면 null */
  targetCreatedMs: number | null;
  /** 링크가 가리키는 곳이 없다 */
  dangling: boolean;
  /** 링크를 푼 실제 경로(정규화). 풀지 못하면 null */
  realPath: string | null;
}

const MISSING: EntryInfo = { exists: false, isLink: false, isDir: false, isFile: false, createdMs: null, targetCreatedMs: null, dangling: false, realPath: null };

export async function entryInfo(path: string): Promise<EntryInfo> {
  let own: Stats;
  try {
    own = await lstat(path);
  } catch {
    return MISSING;
  }
  const isLink = own.isSymbolicLink();
  let target: Stats | null = own;
  if (isLink) {
    try {
      target = await stat(path);
    } catch {
      target = null;
    }
  }
  let real: string | null = null;
  try {
    real = normalizePath(await realpath(path));
  } catch {
    real = null;
  }
  return {
    exists: true,
    isLink,
    isDir: target?.isDirectory() ?? false,
    isFile: target?.isFile() ?? false,
    createdMs: createdMsOf(own),
    targetCreatedMs: isLink && target !== null ? createdMsOf(target) : null,
    dangling: isLink && target === null,
    realPath: real,
  };
}
