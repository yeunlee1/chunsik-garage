// 제미나이 CLI 기록을 모아 세션 요약 목록과 읽은 양을 낸다. 바뀐 파일만 다시 읽고, 결과는 정규화한 경로 차례다(설계 8, 9.2~9.4, 9.8, 「0.4.0에서 정한 것」)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mostlyBroken } from "../adapters/claude/observation.ts";
import { makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import { MAX_LINE_BYTES, readLines } from "../adapters/common/lines.ts";
import { geminiHome, geminiRecordHomes, listGeminiRecordFiles, type GeminiFileList, type GeminiLogFile } from "../adapters/gemini/locate.ts";
import { GEMINI_USAGE_MARKERS } from "../adapters/gemini/observation.ts";
import { GEMINI_PARSER_VERSION, GeminiSessionParser } from "../adapters/gemini/parser.ts";
import type { SessionSummary } from "../adapters/types.ts";
import { cacheKeyFor, keyStillMatches, loadCached, storeCached, type CacheKey } from "../state/cache.ts";
import { overlappingSessions, visibleFrom, type ClaudeReadStats, type CollectOptions } from "./claude.ts";

/** 읽은 양. 꼴은 Claude Code와 같다 */
export type GeminiReadStats = ClaudeReadStats;

export interface GeminiCollectResult {
  tool: "gemini";
  home: string;
  detected: boolean;
  summaries: SessionSummary[];
  read: GeminiReadStats;
  visibleFrom: LocalDate | null;
  overlappingSessions: number;
}

export const GEMINI_PARSER_ID = `gemini@${GEMINI_PARSER_VERSION}`;

export async function collectGemini(options: CollectOptions): Promise<GeminiCollectResult> {
  const home = geminiHome(options.env, options.homedir);
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  // 기록은 전역 폴더와, macOS sandbox-exec 샌드박스가 쓰는 <홈>/.cache/.gemini에서 찾는다
  const list = await listGeminiRecordFiles(geminiRecordHomes(options.env, options.homedir), options.rescan ? null : windows.collectStartLowerBoundMs);
  return collectGeminiFromList(home, list, options);
}

/** 옛 꼴 파일 하나를 읽어 해석한다. 줄 상한보다 크면 풀지 않고 너무 긴 줄 하나로 센다 */
async function parseLegacy(file: GeminiLogFile, parser: GeminiSessionParser): Promise<{ bytesRead: number }> {
  if (file.size > MAX_LINE_BYTES) {
    parser.tooLong();
    return { bytesRead: 0 };
  }
  const text = await readFile(file.path, "utf8");
  parser.legacy(text);
  return { bytesRead: Buffer.byteLength(text) };
}

/** 파일 목록을 받아 모은다. 목록의 차례와 상관없이 정규화한 경로 차례로 읽고 낸다 */
export async function collectGeminiFromList(home: string, list: GeminiFileList, options: CollectOptions): Promise<GeminiCollectResult> {
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const cacheDir = options.cacheDir === null ? null : join(options.cacheDir, "gemini");
  const files = [...list.files].sort((a, b) => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0));
  const summaries: SessionSummary[] = [];
  const unreadableFiles = [...list.unreadableFiles];
  let unreadableFileBytes = 0;
  let bytes = 0;
  let fromCache = 0;
  let inProgress = 0;
  const markUnreadable = (path: string, size: number): void => {
    unreadableFiles.push(path);
    unreadableFileBytes += size;
  };

  for (const file of files) {
    let key: CacheKey | null = null;
    try {
      if (cacheDir !== null) {
        key = await cacheKeyFor(file, GEMINI_PARSER_ID, options.clock.timeZone);
        if (!options.rescan && key !== null) {
          const hit = await loadCached(cacheDir, key);
          if (hit !== null) {
            // 프로젝트 폴더는 파일 밖(.project_root)에서 온 것이라 캐시가 아니라 지금 목록의 것을 쓴다
            summaries.push({ ...hit.summary, cwd: file.cwd });
            bytes += hit.bytesRead;
            fromCache++;
            if (mostlyBroken(hit.summary)) markUnreadable(file.path, file.size);
            continue;
          }
        }
      }
      const parser = new GeminiSessionParser({ sessionId: file.sessionId, kind: file.kind, parentSessionId: file.parentSessionId, cwd: file.cwd, timeZone: options.clock.timeZone });
      if (file.legacy) {
        const outcome = await parseLegacy(file, parser);
        const summary = parser.finish(null, false);
        summaries.push(summary);
        bytes += outcome.bytesRead;
        if (mostlyBroken(summary)) markUnreadable(file.path, file.size);
        continue;
      }
      const outcome = await readLines(file.path, options.clock.nowMs, { line: (text) => parser.line(text), tooLong: (found) => parser.tooLong(found) }, { markers: GEMINI_USAGE_MARKERS });
      const summary = parser.finish(outcome.tail, outcome.inProgress);
      summaries.push(summary);
      bytes += outcome.bytesRead;
      if (mostlyBroken(summary) || outcome.endedEarly) markUnreadable(file.path, file.size);
      if (outcome.inProgress) {
        inProgress++;
        continue;
      }
      if (key !== null && cacheDir !== null && outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs) {
        try {
          if (await keyStillMatches(file.path, key)) await storeCached(cacheDir, { key, summary, bytesRead: outcome.bytesRead });
        } catch {
          // 캐시를 쓰지 못해도 점검은 이어 간다. 다음 점검이 다시 읽는다
        }
      }
    } catch {
      markUnreadable(file.path, file.size);
    }
  }

  unreadableFiles.sort();
  return {
    tool: "gemini",
    home,
    detected: list.tmpFound,
    summaries,
    read: {
      files: files.length + list.unreadableFiles.length,
      listedBytes: files.reduce((sum, file) => sum + file.size, 0),
      bytes,
      fromCache,
      inProgress,
      olderThanWindow: list.olderThanWindow,
      unreadableFiles,
      unreadableFileBytes,
      unknownSizeFiles: list.unreadableFiles.length,
      unreadableDirs: [...list.unreadableDirs].sort(),
    },
    visibleFrom: visibleFrom(summaries, list.olderThanWindow, windows.collectDates[0]!),
    overlappingSessions: overlappingSessions(summaries),
  };
}
