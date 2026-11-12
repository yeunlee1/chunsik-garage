// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다(설계 9.4)
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";

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
