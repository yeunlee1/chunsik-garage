// Claude Code 기록을 모아 세션 요약 목록과 읽은 양을 낸다. 바뀐 파일만 다시 읽고, 결과는 정규화한 경로 차례다(설계 8, 9.2~9.4, 9.8, 20.1)
import { join } from "node:path";
import { makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import { readLines } from "../adapters/common/lines.ts";
import { claudeHome, listClaudeFiles, type FileList } from "../adapters/claude/locate.ts";
import { mostlyBroken } from "../adapters/claude/observation.ts";
import { CLAUDE_PARSER_VERSION, ClaudeSessionParser } from "../adapters/claude/parser.ts";
import type { SessionSummary } from "../adapters/types.ts";
import { cacheKeyFor, loadCached, storeCached, type CacheKey } from "../state/cache.ts";

export interface EvalClock {
  nowMs: number;
  timeZone: string;
}

export interface CollectOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  clock: EvalClock;
  /** 캐시 폴더. null이면 캐시를 읽지도 쓰지도 않는다(--no-save). */
  cacheDir: string | null;
  /** 캐시와 수정 시각 거르기를 믿지 않고 모두 다시 읽는다(--rescan). 읽은 결과는 캐시에 다시 쓴다. */
  rescan: boolean;
}

/** 읽은 양(설계 9.8). 읽지 못한 것은 파일과 폴더로 나눈다. 파일 수 기준 비율은 unreadableFiles ÷ files, 바이트 기준은 unreadableFileBytes ÷ listedBytes이고 1을 넘지 않는다. unreadableDirs나 unknownSizeFiles가 있으면 그 비율은 아래 경계다. */
export interface ClaudeReadStats {
  /** 목록에 있는 세션 파일의 수. 크기를 보지 못한 파일도 넣는다 */
  files: number;
  /** 크기를 아는 파일의 바이트를 더한 것 */
  listedBytes: number;
  bytes: number;
  fromCache: number;
  inProgress: number;
  olderThanWindow: number;
  /** 크기를 보지 못했거나, 열거나 읽지 못했거나, 절반 넘게 깨진 파일. 경로 차례다 */
  unreadableFiles: string[];
  /** unreadableFiles 가운데 크기를 아는 것의 바이트 */
  unreadableFileBytes: number;
  /** 크기를 보지 못한 파일의 수(unreadableFiles에도 들어 있다) */
  unknownSizeFiles: number;
  /** 목록을 읽지 못해 안을 모르는 폴더. 경로 차례다 */
  unreadableDirs: string[];
}

export interface ClaudeCollectResult {
  tool: "claude-code";
  home: string;
  detected: boolean;
  summaries: SessionSummary[];
  read: ClaudeReadStats;
  visibleFrom: LocalDate | null;
  overlappingSessions: number;
}

export const CLAUDE_PARSER_ID = `claude-code@${CLAUDE_PARSER_VERSION}`;

/** 관측(설계 9.8)에 넘기는 읽지 못한 것의 수. 파일과 폴더를 더한다. */
export function unreadableCount(read: ClaudeReadStats): number {
  return read.unreadableFiles.length + read.unreadableDirs.length;
}

export async function collectClaude(options: CollectOptions): Promise<ClaudeCollectResult> {
  const home = claudeHome(options.env, options.homedir);
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const list = await listClaudeFiles(home, options.rescan ? null : windows.collectStartLowerBoundMs);
  return collectFromList(home, list, options);
}

/** 파일 목록을 받아 모은다. 목록의 차례와 상관없이 정규화한 경로 차례로 읽고 낸다. */
export async function collectFromList(home: string, list: FileList, options: CollectOptions): Promise<ClaudeCollectResult> {
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const cacheDir = options.cacheDir === null ? null : join(options.cacheDir, "claude-code");
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
        key = await cacheKeyFor(file, CLAUDE_PARSER_ID, options.clock.timeZone);
        if (!options.rescan) {
          const hit = await loadCached(cacheDir, key);
          if (hit !== null) {
            summaries.push(hit.summary);
            bytes += hit.bytesRead;
            fromCache++;
            if (mostlyBroken(hit.summary)) markUnreadable(file.path, file.size);
            continue;
          }
        }
      }
      const parser = new ClaudeSessionParser({
        sessionId: file.sessionId,
        kind: file.kind,
        parentSessionId: file.parentSessionId,
        timeZone: options.clock.timeZone,
      });
      const outcome = await readLines(file.path, options.clock.nowMs, {
        line: (text) => parser.line(text),
        tooLong: () => parser.tooLong(),
      });
      const summary = parser.finish(outcome.tail, outcome.inProgress);
      summaries.push(summary);
      bytes += outcome.bytesRead;
      if (mostlyBroken(summary)) markUnreadable(file.path, file.size);
      if (outcome.inProgress) {
        inProgress++;
        continue;
      }
      if (key !== null && cacheDir !== null && outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs) {
        try {
          await storeCached(cacheDir, { key, summary, bytesRead: outcome.bytesRead });
        } catch {
          // 캐시를 쓰지 못해도 점검은 이어 간다. 다음 점검이 다시 읽는다.
        }
      }
    } catch {
      markUnreadable(file.path, file.size);
    }
  }

  unreadableFiles.sort();
  return {
    tool: "claude-code",
    home,
    detected: list.projectsFound,
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

/** 볼 수 있는 날짜 범위의 시작(설계 9.8). 수집 구간보다 오래된 파일이 있으면 구간 첫날, 없으면 세션마다 가장 이른 기록 날짜 가운데 가장 이른 것이다. 요약의 차례와 상관없다. */
export function visibleFrom(summaries: readonly SessionSummary[], olderThanWindow: number, collectStart: LocalDate): LocalDate | null {
  if (olderThanWindow > 0) return collectStart;
  let earliest: LocalDate | null = null;
  for (const summary of summaries) {
    if (summary.firstDate !== null && (earliest === null || summary.firstDate < earliest)) earliest = summary.firstDate;
  }
  if (earliest === null) return null;
  return earliest < collectStart ? collectStart : earliest;
}

/** 처음 응답 ID의 지문이 다른 세션과 겹치는 세션의 수(설계 9.5). 요약의 차례와 상관없다. */
export function overlappingSessions(summaries: readonly SessionSummary[]): number {
  const owners = new Map<string, Set<number>>();
  summaries.forEach((summary, index) => {
    for (const hash of summary.firstResponseIdHashes) {
      let set = owners.get(hash);
      if (set === undefined) {
        set = new Set();
        owners.set(hash, set);
      }
      set.add(index);
    }
  });
  const overlapping = new Set<number>();
  for (const set of owners.values()) {
    if (set.size > 1) for (const index of set) overlapping.add(index);
  }
  return overlapping.size;
}
