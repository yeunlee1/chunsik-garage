// 가져온 웹 채팅 내보내기 파일을 읽어 도구(ChatGPT, Claude.ai)마다 세션 요약 목록과 읽은 양을 낸다. 바뀌지 않은 파일은 캐시의 요약을 쓴다(설계 9.4, 「0.5.0에서 정한 것」)
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { localDateOf, makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";
import type { WebToolId } from "../adapters/web/conversation.ts";
import { WEB_TOOLS } from "../adapters/web/observation.ts";
import { ExportError, exportFolderFiles, readExport, type ExportProblem, type ExportRead } from "../adapters/web/source.ts";
import { CACHE_FORMAT_VERSION, cacheKeyFor, entryPath, sameKey, type CacheKey } from "../state/cache.ts";
import type { WebExportEntry } from "../state/web-exports.ts";
import { visibleFrom, type ClaudeReadStats, type CollectOptions } from "./claude.ts";

/** 해석이 바뀌면 올린다. 캐시의 열쇠에 든다 */
export const WEB_PARSER_VERSION = 2;
export const WEB_PARSER_ID = `web@${WEB_PARSER_VERSION}`;

/** 내보내기 파일의 상태. 평가 결과의 알림이 쓴다 */
export interface WebExportState {
  /** 넣은 내보내기 파일의 자리. 넣지 않았으면 null */
  path: string | null;
  /** 넣은 파일이 지금 없다 */
  missing: boolean;
  /** 읽지 못한 까닭. 읽었으면 null */
  problem: ExportProblem | "unreadable" | null;
  /** 해석하지 않은 대화의 수(상한보다 큼, JSON이 깨짐, 대화의 꼴이 아님) */
  skipped: number;
  /** 대화 파일이 중간에 끊겼다 */
  truncated: boolean;
  /** 내보내기에서 가장 늦은 사건의 현지 날짜. 그 뒤의 대화는 내보내기에 없다 */
  lastDate: LocalDate | null;
}

export interface WebCollectResult {
  tool: WebToolId;
  /** 내보내기 파일을 넣었다 */
  detected: boolean;
  summaries: SessionSummary[];
  read: ClaudeReadStats;
  visibleFrom: LocalDate | null;
  state: WebExportState;
}

interface WebCacheEntry {
  key: CacheKey;
  /** 이 날보다 이른 날의 칸은 버렸다. 지금 점검의 수집 구간 첫날이 이보다 이르면(시계가 거꾸로 갔으면) 쓰지 않는다 */
  keptFrom: LocalDate;
  summaries: SessionSummary[];
  skipped: number;
  complete: boolean;
  lastMs: number | null;
}

const emptyRead = (): ClaudeReadStats => ({ files: 0, listedBytes: 0, bytes: 0, fromCache: 0, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] });
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function loadWebCached(dir: string, key: CacheKey, keepFrom: LocalDate, tool: WebToolId): Promise<WebCacheEntry | null> {
  try {
    const entry = JSON.parse(await readFile(entryPath(dir, key.normPath), "utf8")) as Partial<WebCacheEntry>;
    if (entry.key === undefined || !sameKey(entry.key, key) || typeof entry.keptFrom !== "string" || !DATE.test(entry.keptFrom) || entry.keptFrom > keepFrom) return null;
    if (!Array.isArray(entry.summaries) || typeof entry.skipped !== "number" || !Number.isSafeInteger(entry.skipped) || entry.skipped < 0 || typeof entry.complete !== "boolean") return null;
    if (entry.lastMs !== null && (typeof entry.lastMs !== "number" || !Number.isFinite(entry.lastMs))) return null;
    const summaries: SessionSummary[] = [];
    for (const value of entry.summaries) {
      const summary = reviveSummary(value);
      // 다른 도구의 요약이 섞였으면 손으로 고쳤거나 깨진 캐시다
      if (summary === null || summary.tool !== tool) return null;
      summaries.push(summary);
    }
    return { key: entry.key, keptFrom: entry.keptFrom, summaries, skipped: entry.skipped, complete: entry.complete, lastMs: entry.lastMs ?? null };
  } catch {
    return null;
  }
}

async function storeWebCached(dir: string, entry: WebCacheEntry): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = entryPath(dir, entry.key.normPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(entry));
  await rename(temporary, target);
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** 파일의 앞뒤 4KB 지문. 캐시 열쇠의 앞뒤 지문과 같은 범위다 */
async function edges(path: string, size: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const length = Math.min(4096, size);
    const head = Buffer.alloc(length);
    const tail = Buffer.alloc(length);
    await handle.read(head, 0, length, 0);
    await handle.read(tail, 0, length, size - length);
    return createHash("sha256").update(head).update(tail).digest("hex");
  } finally {
    await handle.close();
  }
}

/**
 * 내보내기의 캐시 열쇠. 파일이면 다른 기록처럼 경로·크기·수정 시각·앞뒤 지문이고, 폴더면 안의 대화 파일과 안쪽 zip마다의 자리·크기·수정 시각·앞뒤 4KB 지문과 상한에 걸렸는지의 지문이다(크기는 합, 수정 시각은 가장 늦은 것).
 * 크기와 수정 시각을 그대로 둔 채 내용만 바뀐 파일도 앞뒤 지문으로 알아본다(짝 검토 5 필수 4).
 * 읽는 동안 바뀌었거나 파일도 폴더도 아니면 null이다
 */
export async function exportKey(path: string, timeZone: string): Promise<CacheKey | null> {
  const info = await stat(path);
  if (info.isFile()) return cacheKeyFor({ path, normPath: normalizePath(path), size: info.size, mtimeMs: info.mtimeMs }, WEB_PARSER_ID, timeZone);
  if (!info.isDirectory()) return null;
  const { files, limited } = await exportFolderFiles(path);
  const lines: string[] = [];
  for (const file of files) lines.push(`${file.rel}|${file.size}|${file.mtimeMs}|${await edges(file.path, file.size)}`);
  const list = `${limited ? "limited" : "all"}\n${lines.join("\n")}`;
  return {
    normPath: normalizePath(path),
    size: files.reduce((sum, file) => sum + file.size, 0),
    mtimeMs: files.reduce((latest, file) => Math.max(latest, file.mtimeMs), 0),
    head: sha256(list),
    tail: sha256(`folder:${files.length}`),
    cacheFormat: CACHE_FORMAT_VERSION,
    parser: WEB_PARSER_ID,
    timeZone,
  };
}

/** 도구 하나의 내보내기를 모은다. 다른 도구의 내보내기를 넣었으면(파일의 꼴이 다르면) 읽지 못한 것으로 본다 */
async function collectOne(tool: WebToolId, entry: WebExportEntry | undefined, options: CollectOptions): Promise<WebCollectResult> {
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const keepFrom = windows.collectDates[0]!;
  const state: WebExportState = { path: entry?.path ?? null, missing: false, problem: null, skipped: 0, truncated: false, lastDate: null };
  const read = emptyRead();
  const result = (summaries: SessionSummary[]): WebCollectResult => ({ tool, detected: entry !== undefined, summaries, read, visibleFrom: visibleFrom(summaries, 0, keepFrom), state });
  if (entry === undefined) return result([]);

  let info;
  try {
    info = await stat(entry.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") state.missing = true;
    else {
      state.problem = "unreadable";
      read.files = 1;
      read.unreadableFiles = [entry.path];
      read.unknownSizeFiles = 1;
    }
    return result([]);
  }
  read.files = 1;
  read.listedBytes = info.isFile() ? info.size : 0;
  const isFolder = info.isDirectory();
  const fail = (problem: WebExportState["problem"]): WebCollectResult => {
    state.problem = problem;
    read.unreadableFiles = [entry.path];
    read.unreadableFileBytes = read.listedBytes;
    return result([]);
  };
  if (!info.isFile() && !isFolder) return fail("not-file");

  const cacheDir = options.cacheDir === null ? null : join(options.cacheDir, "web");
  let key: CacheKey | null = null;
  try {
    // 폴더는 저장 없는 실행에서도 읽은 양을 알려고 열쇠를 만든다(안의 파일 크기의 합)
    if (cacheDir !== null || isFolder) key = await exportKey(entry.path, options.clock.timeZone);
    if (isFolder && key !== null) read.listedBytes = key.size;
    if (cacheDir !== null) {
      const hit = key === null || options.rescan ? null : await loadWebCached(cacheDir, key, keepFrom, tool);
      if (hit !== null) {
        read.bytes = read.listedBytes;
        read.fromCache = 1;
        state.skipped = hit.skipped;
        state.truncated = !hit.complete;
        state.lastDate = hit.lastMs === null ? null : localDateOf(hit.lastMs, options.clock.timeZone);
        return result(hit.summaries);
      }
    }
  } catch {
    key = null;
  }

  let exported: ExportRead;
  try {
    exported = await readExport(entry.path, options.clock.timeZone, keepFrom);
  } catch (error) {
    return fail(error instanceof ExportError ? error.problem : "unreadable");
  }
  // 넣을 때 가린 서비스와 지금 파일의 서비스가 다르면(그 자리에 다른 내보내기를 덮어썼으면) 이 도구의 기록이 아니다
  if (exported.tool !== tool) return fail("unknown-service");
  read.bytes = read.listedBytes;
  state.skipped = exported.skipped.tooLong + exported.skipped.broken + exported.skipped.unrecognized;
  state.truncated = !exported.complete;
  state.lastDate = exported.totals.lastMs === null ? null : localDateOf(exported.totals.lastMs, options.clock.timeZone);
  if (options.cacheDir !== null) await primeWebCache(options.cacheDir, entry.path, key, exported, keepFrom, options.clock.timeZone);
  return result(exported.summaries);
}

/** 읽은 것으로 캐시를 만든다. before는 읽기 전에 만든 열쇠다. 읽은 뒤의 열쇠가 그것과 다르면(읽는 동안 바뀌었으면) 만들지 않는다 */
export async function primeWebCache(cacheRoot: string, path: string, before: CacheKey | null, exported: ExportRead, keepFrom: LocalDate, timeZone: string): Promise<void> {
  try {
    if (before === null) return;
    const key = await exportKey(path, timeZone);
    if (key === null || !sameKey(key, before)) return;
    const skipped = exported.skipped.tooLong + exported.skipped.broken + exported.skipped.unrecognized;
    await storeWebCached(join(cacheRoot, "web"), { key, keptFrom: keepFrom, summaries: exported.summaries, skipped, complete: exported.complete, lastMs: exported.totals.lastMs });
  } catch {
    // 캐시를 쓰지 못해도 넣기는 끝났다. 다음 점검이 다시 읽는다
  }
}

/** 넣은 내보내기 파일들을 도구마다 모은다(도구 식별자의 차례) */
export async function collectWeb(entries: readonly WebExportEntry[], options: CollectOptions): Promise<WebCollectResult[]> {
  const out: WebCollectResult[] = [];
  for (const tool of WEB_TOOLS) out.push(await collectOne(tool, entries.find((entry) => entry.tool === tool), options));
  return out;
}
