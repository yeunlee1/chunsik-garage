// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다(설계 9.4)
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";
import { expectedRealDir, removeFiles } from "./folder.ts";

export const CACHE_FORMAT_VERSION = 1;
const EDGE_BYTES = 4096;

export interface CacheKey {
  normPath: string;
  size: number;
  mtimeMs: number;
  head: string;
  tail: string;
  cacheFormat: number;
  parser: string;
  timeZone: string;
}

export interface CacheEntry {
  key: CacheKey;
  summary: SessionSummary;
  bytesRead: number;
}

export interface KeySource {
  path: string;
  normPath: string;
  size: number;
  mtimeMs: number;
}

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

export async function cacheKeyFor(file: KeySource, parser: string, timeZone: string): Promise<CacheKey> {
  const handle = await open(file.path, "r");
  try {
    const length = Math.min(EDGE_BYTES, file.size);
    const head = Buffer.alloc(length);
    const tail = Buffer.alloc(length);
    if (length > 0) {
      await handle.read(head, 0, length, 0);
      await handle.read(tail, 0, length, file.size - length);
    }
    return {
      normPath: file.normPath,
      size: file.size,
      mtimeMs: file.mtimeMs,
      head: sha256(head),
      tail: sha256(tail),
      cacheFormat: CACHE_FORMAT_VERSION,
      parser,
      timeZone,
    };
  } finally {
    await handle.close();
  }
}

export function sameKey(a: CacheKey, b: CacheKey): boolean {
  return (
    a.normPath === b.normPath &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.head === b.head &&
    a.tail === b.tail &&
    a.cacheFormat === b.cacheFormat &&
    a.parser === b.parser &&
    a.timeZone === b.timeZone
  );
}

function entryPath(dir: string, normPath: string): string {
  return join(dir, `${sha256(normPath).slice(0, 32)}.json`);
}

export async function loadCached(dir: string, key: CacheKey): Promise<CacheEntry | null> {
  try {
    const entry = JSON.parse(await readFile(entryPath(dir, key.normPath), "utf8")) as Partial<CacheEntry>;
    if (entry.key === undefined || typeof entry.bytesRead !== "number" || !sameKey(entry.key, key)) return null;
    // JSON으로 풀려도 요약의 모양이 다르면(손으로 고쳤거나 옛 형식) 없는 것으로 보고 원본을 다시 읽는다
    const summary = reviveSummary(entry.summary);
    return summary === null ? null : { key: entry.key, summary, bytesRead: entry.bytesRead };
  } catch {
    return null;
  }
}

export async function storeCached(dir: string, entry: CacheEntry): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = entryPath(dir, entry.key.normPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(entry));
  await rename(temporary, target);
}

/** 이 도구가 쓴 캐시 항목의 이름(정규화한 원본 경로의 지문 앞 32자) */
const ENTRY_NAME = /^[0-9a-f]{32}\.json$/;

export interface CachePruneReport {
  /** 지운 항목의 수 */
  removed: number;
  /** 링크라서 안을 지우지 않은 것. state는 상태 폴더 자체, cache는 캐시 폴더다(고른 뒤 캐시 폴더나 도구 폴더가 링크로 바뀐 것도 든다) */
  skipped: "state" | "cache" | null;
}

/** 캐시 항목을 읽은 결과. 읽지 못한 것(unreadable)과 읽었는데 풀리지 않거나 원본 경로가 없는 것(broken)을 가른다 */
export type CacheEntryRead = { status: "ok"; normPath: string } | { status: "unreadable" } | { status: "broken" };

export async function readCacheEntry(path: string): Promise<CacheEntryRead> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { status: "unreadable" };
  }
  let normPath: unknown;
  try {
    normPath = (JSON.parse(text) as { key?: { normPath?: unknown } } | null)?.key?.normPath;
  } catch {
    return { status: "broken" };
  }
  return typeof normPath === "string" && normPath !== "" ? { status: "ok", normPath } : { status: "broken" };
}

/** 항목을 지울지. 읽었는데 깨졌으면 지운다. 원본이 없으면 지운다. 항목을 읽지 못했거나 원본이 있는지 모르면(권한 등) 남긴다 */
export async function isStaleCacheEntry(path: string): Promise<boolean> {
  const entry = await readCacheEntry(path);
  if (entry.status === "unreadable") return false;
  if (entry.status === "broken") return true;
  try {
    await lstat(entry.normPath);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

export interface StaleCacheEntries {
  /** 링크라서 안을 보지 않은 것. state는 상태 폴더 자체, cache는 캐시 폴더다 */
  skipped: "state" | "cache" | null;
  /** 상태 폴더가 있어야 할 실제 경로(지우기 전의 경계) */
  boundary: string | null;
  /** 지울 캐시 항목(도구 폴더와 이름의 차례) */
  paths: string[];
}

/**
 * 지울 캐시 항목을 고른다. 캐시 폴더 아래 도구마다의 폴더에서 항목 꼴의 이름을 가진 보통 파일만 본다.
 * 다른 이름의 파일, 폴더, 링크인 도구 폴더는 고르지 않는다.
 */
export async function staleCacheEntries(stateDir: string): Promise<StaleCacheEntries> {
  let dirInfo;
  try {
    dirInfo = await lstat(stateDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { skipped: null, boundary: null, paths: [] };
    throw error;
  }
  const boundary = await expectedRealDir(stateDir);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath(stateDir)) !== boundary) return { skipped: "state", boundary: null, paths: [] };
  const cacheDir = join(stateDir, "cache");
  let info;
  try {
    info = await lstat(cacheDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { skipped: null, boundary, paths: [] };
    throw error;
  }
  if (info.isSymbolicLink()) return { skipped: "cache", boundary: null, paths: [] };
  if (!info.isDirectory()) return { skipped: null, boundary, paths: [] };
  const paths: string[] = [];
  for (const tool of (await readdir(cacheDir)).sort()) {
    const toolDir = join(cacheDir, tool);
    if (!(await lstat(toolDir)).isDirectory()) continue;
    for (const name of (await readdir(toolDir)).sort()) {
      if (!ENTRY_NAME.test(name)) continue;
      const path = join(toolDir, name);
      if (!(await lstat(path)).isFile()) continue;
      if (await isStaleCacheEntry(path)) paths.push(path);
    }
  }
  return { skipped: null, boundary, paths };
}

/**
 * 원본 파일이 없어진 캐시 항목을 지운다(설계 19.2). 항목에 적힌 정규화한 원본 경로가 지금 없으면 지우고, 읽었는데 깨진 항목도 지운다(설계 20.1).
 * 고른 뒤 지우기 직전에 다시 보통 파일인지, 위 폴더가 있어야 할 자리인지 본다. 그 사이 폴더나 링크로 바뀐 것과 위 폴더가 링크로 바뀐 것은 지우지 않는다.
 */
export async function pruneCache(stateDir: string): Promise<CachePruneReport> {
  const stale = await staleCacheEntries(stateDir);
  if (stale.boundary === null || stale.paths.length === 0) return { removed: 0, skipped: stale.skipped };
  const result = await removeFiles(stale.paths, stateDir, stale.boundary);
  // 고른 뒤 캐시 폴더나 도구 폴더가 링크로 바뀌어 지우지 않은 것이 있으면 링크라서 하지 않은 정리로 알린다
  return { removed: result.removed, skipped: result.linked > 0 ? "cache" : null };
}
