// Codex 기록을 모아 논리 세션마다의 요약과 읽은 양을 낸다. 같은 기록 파일의 사본 가운데 정본 하나를 읽고(읽지 못하면 다음 사본), 압축 기록은 그 Node.js가 풀 수 있을 때만 읽는다. 하위 세션은 부모 기록의 지문으로, 같은 세션의 뒤 기록은 앞 기록의 지문으로 이어받은 앞부분을 빼고, 같은 세션의 기록 파일은 합친다. 바뀐 파일만 다시 읽고, 결과는 세션마다 가장 앞선 정본의 정규화한 경로 차례다(설계 8, 9.1~9.4, 9.8, 20.1, 「5단계 계획 전 결정」 2·3·7번)
import { CODEX_USAGE_MARKERS } from "../adapters/codex/observation.ts";
import { join } from "node:path";
import { nameRecord, sortedRecord } from "../adapters/common/canonical.ts";
import { makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import { IN_PROGRESS_WINDOW_MS, readLines } from "../adapters/common/lines.ts";
import { mostlyBroken } from "../adapters/claude/observation.ts";
import { fromLists, sharedDigest, toLists, unionOf } from "../adapters/codex/fingerprints.ts";
import { codexHome, groupCopies, listCodexFiles, type CodexCopyGroup, type CodexFileList, type CodexLogFile, type StatFile } from "../adapters/codex/locate.ts";
import { mergeRecords } from "../adapters/codex/merge.ts";
import { CODEX_PARSER_VERSION, CodexSessionParser, type CodexFingerprints } from "../adapters/codex/parser.ts";
import { readZstdLines, zstdAvailable } from "../adapters/codex/zstd.ts";
import type { SessionSummary } from "../adapters/types.ts";
import { cacheKeyFor, keyStillMatches, loadCached, storeCached, type CacheKey } from "../state/cache.ts";
import { visibleFrom, type CollectOptions } from "./claude.ts";

export const CODEX_PARSER_ID = `codex@${CODEX_PARSER_VERSION}`;

export interface CodexCollectOptions extends CollectOptions {
  /** 시험용. 압축 기록을 풀 수 있는지. 주지 않으면 실행 중인 Node.js로 가린다(「5단계 계획 전 결정」 2번) */
  zstd?: boolean;
  /** 시험용. 파일의 크기와 시각을 읽는다. 주지 않으면 node:fs의 stat이다 */
  statFile?: StatFile;
}

/** 읽은 양(설계 9.8). 분모는 수집 구간에 걸리는 정본이다. 건너뛴 압축 파일은 읽지 못한 파일과 함께 분자에 넣고, 일부만 읽은 파일이 있으면 비율은 아래 경계다(「5단계 계획 전 결정」 2번) */
export interface CodexReadStats {
  /** 수집 구간에 걸리는 기록 파일(정본)의 수. 크기를 보지 못한 정본도 넣는다 */
  files: number;
  /** 기록 파일마다 읽은 사본의 바이트(읽지 못한 기록은 정본의 바이트. 크기를 모르면 넣지 않는다)를 더한 것 */
  listedBytes: number;
  bytes: number;
  fromCache: number;
  inProgress: number;
  /** 정본의 수정 시각이 수집 구간보다 앞서 열지 않은 기록 파일. 하위 세션의 부모이거나 같은 세션의 다른 기록이라서 지문만 읽은 것도 든다 */
  olderThanWindow: number;
  /** 크기를 보지 못했거나, 어느 사본도 열거나 읽지 못했거나, 절반 넘게 깨진 기록 파일. 읽은 사본이 있으면 그 사본의 경로이고 없으면 정본의 경로다. 경로 차례다 */
  unreadableFiles: string[];
  /** unreadableFiles 가운데 크기를 아는 것의 바이트. listedBytes와 같은 사본의 것이라 읽지 못한 비율이 1을 넘지 않는다 */
  unreadableFileBytes: number;
  /** 크기를 보지 못한 사본의 수. 다른 사본을 읽은 기록의 것도 센다(「5단계 계획 전 결정」 3번). 하나라도 있으면 읽지 못한 비율은 아래 경계다 */
  unknownSizeFiles: number;
  unreadableDirs: string[];
  /** 그 Node.js가 zstd를 풀지 못해 열지 않은 정본. 경로 차례다 */
  skippedFiles: string[];
  skippedFileBytes: number;
  /** 끊긴 압축이거나 읽는 동안 줄어 연 크기까지 읽지 못해(보통 기록도 든다) 앞부분만 읽은 파일. 절반 넘게 깨졌으면 여기가 아니라 unreadableFiles에 든다. 경로 차례다 */
  partialFiles: string[];
  /** 정본이 아니라 읽지 않은 사본의 수(설계 9.2) */
  skippedCopies: number;
  /** 이름에서 기록 파일의 식별자를 읽지 못해 보지 않은 파일 */
  unnamedFiles: number;
}

export interface CodexCollectResult {
  tool: "codex";
  home: string;
  detected: boolean;
  summaries: SessionSummary[];
  read: CodexReadStats;
  visibleFrom: LocalDate | null;
  /** 부모 값은 있는데 부모 기록을 하나도 읽지 못해 이어받은 앞부분을 가리지 못한 하위 세션의 수(설계 9.2, 「5단계 계획 전 결정」 7번) */
  parentRecordMissing: number;
  /** 기록 파일이 둘 이상이라 합친 세션의 수. 수집 구간 밖이라 정체에만 쓴 같은 세션의 기록도 센다 */
  mergedSessions: number;
  /** 수정 시각을 보지 못한 사본이 있던 세션의 수. 그 기록을 읽지 못했으면 기록 파일 하나를 하나로 센다(「5단계 계획 전 결정」 3번) */
  unknownMtimeSessions: number;
  /**
   * 이어받은 앞부분을 확인하지 못한 세션의 수. 부모를 모르거나 부모 기록을 하나도 읽지 못했거나 일부를 읽지 못한(부모의 원래 기록을 찾지 못한 것도) 하위 세션,
   * 같은 세션의 다른 기록(수집 구간 밖의 것도)을 읽지 못했거나 일부만 읽은 세션, 원래 기록(식별자가 세션 ID와 같은 기록)을 찾지 못한 세션, 복사된 앞부분 안에서 기준을 찾지 못한 기록이 있는 세션이다. 이 세션들의 숫자는 대신 본 것이다(「5단계 계획 전 결정」 7번)
   */
  unverifiedInheritance: number;
  /** 세션 ID를 기록 파일의 식별자로 대신 쓴 기록의 까닭별 수(「5단계 계획 전 결정」 7번) */
  idFallbacks: Record<string, number>;
}

/** 관측(설계 9.8 표의 첫 줄)에 넘기는 읽지 못한 것의 수. 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더한다 */
export function codexUnreadableCount(read: CodexReadStats): number {
  return read.unreadableFiles.length + read.unreadableDirs.length + read.skippedFiles.length + read.partialFiles.length;
}

/** 기록 파일 하나를 읽은 것 */
interface RecordRead {
  canonical: CodexLogFile;
  /** 실제로 읽은 사본 */
  file: CodexLogFile;
  key: CacheKey | null;
  summary: SessionSummary;
  prints: CodexFingerprints;
  /** 이 요약을 낸 해석에서 뺀 지문 가운데 이 기록에도 있던 것의 지문 */
  digest: string;
  bytesRead: number;
  fromCache: boolean;
  /** 캐시에 넣어도 되는 읽기다(쓰는 중이 아니고, 연 동안 바뀌지 않았고, 끝까지 읽었다) */
  storable: boolean;
  inProgress: boolean;
  partial: boolean;
  /** 뺄 지문을 넣어 다시 읽다가 읽지 못했다 */
  failed: boolean;
}

type Failure = "unknown-size" | "skipped" | "failed";

interface Parsed {
  summary: SessionSummary;
  prints: CodexFingerprints;
  bytesRead: number;
  inProgress: boolean;
  partial: boolean;
  storable: boolean;
}

const byPath = (a: { normPath: string }, b: { normPath: string }): number => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0);
const baseName = (path: string): string => path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
/** 같은 세션의 기록 차례. 식별자가 세션 ID와 같은 원래 기록이 먼저이고, 그다음은 파일 이름(rollout-<시각>-…이라 만든 차례) 차례, 그다음은 경로 차례다 */
const siblingOrder = (a: RecordRead, b: RecordRead): number => {
  const original = (record: RecordRead): number => (record.canonical.recordId === record.summary.sessionId ? 0 : 1);
  if (original(a) !== original(b)) return original(a) - original(b);
  const an = baseName(a.canonical.path);
  const bn = baseName(b.canonical.path);
  return an < bn ? -1 : an > bn ? 1 : byPath(a.canonical, b.canonical);
};
/** 읽지 못한 기록이 어느 세션의 것일 수 있는지. 이름의 식별자와, 대화를 되돌려 생긴 기록이면 이름 앞의 원래 세션 ID다 */
const keysOf = (group: CodexCopyGroup): string[] => [...new Set([group.recordId, ...group.copies.flatMap((copy) => (copy.baseId === null ? [] : [copy.baseId]))])];

/** 수정 시각과 변경 시각 가운데 늦은 것이 평가 시각에서 2초 안쪽이면 쓰는 중이다(쓰는 동안 수정 시각이 머무는 Codex 기록이 있다) */
const recentlyChanged = (file: CodexLogFile, options: CodexCollectOptions): boolean => file.changedMs !== null && options.clock.nowMs - file.changedMs < IN_PROGRESS_WINDOW_MS;

/** 사본 하나를 해석한다. 열거나 읽지 못하거나, 압축 기록에서 아무것도 풀지 못하면 던진다 */
async function parseCopy(file: CodexLogFile, inherited: CodexFingerprints | null, options: CodexCollectOptions): Promise<Parsed> {
  const parser = new CodexSessionParser({ recordId: file.recordId, timeZone: options.clock.timeZone, inherited });
  // 너무 긴 줄은 풀지 않지만 MCP 호출의 표지가 있는지만 훑는다(0.3.0, 다른 PC 피드백 7번)
  const sink = { line: (text: string) => parser.line(text), tooLong: (found?: ReadonlySet<string>) => parser.tooLong(found) };
  if (!file.compressed) {
    const outcome = await readLines(file.path, options.clock.nowMs, sink, { markers: CODEX_USAGE_MARKERS });
    // 목록을 본 뒤 크기나 수정 시각이 바뀌었으면 이번 실행 중에 쓰인 것이라 쓰는 중이다(쓰는 동안 수정 시각이 머무는 기록은 크기로만 드러난다)
    const stable = outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs;
    const inProgress = outcome.inProgress || !stable || recentlyChanged(file, options);
    const summary = parser.finish(outcome.tail, inProgress);
    // 연 크기까지 다 읽기 전에 파일이 끝났으면(읽는 동안 줄었으면) 앞부분만 읽은 것이라 일부만 읽은 파일이다
    return { summary, prints: parser.fingerprints(), bytesRead: outcome.bytesRead, inProgress, partial: outcome.endedEarly, storable: !inProgress };
  }
  const outcome = await readZstdLines(file.path, options.clock.nowMs, sink, { markers: CODEX_USAGE_MARKERS });
  // 프레임이 잘렸거나 깨졌거나 풀다가 오류가 났거나, 연 크기에 닿기 전에 파일이 끝났으면(완결 프레임으로 끝났어도) 일부만 읽은 것이다
  const incomplete = outcome.frames.status !== "complete" || outcome.decodeError !== null || outcome.endedEarly;
  if (incomplete && outcome.decodedBytes === 0) throw new Error(outcome.decodeError ?? outcome.frames.status);
  const stable = outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs;
  const inProgress = outcome.inProgress || !stable || recentlyChanged(file, options);
  const summary = parser.finish(outcome.tail, inProgress);
  return { summary, prints: parser.fingerprints(), bytesRead: outcome.bytesRead, inProgress, partial: incomplete, storable: !inProgress && !incomplete };
}

/** 기록 파일 하나를 정본부터 차례로 읽는다. 캐시가 맞으면 꺼내고, 아니면 뺄 지문 없이 해석한다. 어느 사본도 읽지 못하면 정본의 까닭을 돌려준다 */
async function readGroup(group: CodexCopyGroup, options: CodexCollectOptions, zstd: boolean, cacheDir: string | null): Promise<RecordRead | Failure> {
  const canonical = group.copies[0]!;
  let failure: Failure | null = null;
  for (const file of group.copies) {
    if (file.size === null || file.mtimeMs === null) {
      failure ??= "unknown-size";
      continue;
    }
    if (file.compressed && !zstd) {
      failure ??= "skipped";
      continue;
    }
    try {
      let key: CacheKey | null = null;
      if (cacheDir !== null) {
        key = await cacheKeyFor({ path: file.path, normPath: file.normPath, size: file.size, mtimeMs: file.mtimeMs }, CODEX_PARSER_ID, options.clock.timeZone);
        // 목록을 본 뒤 바뀌어 열쇠가 없거나, 수정 시각과 변경 시각 가운데 늦은 것이 최근이면 쓰는 중일 수 있어 캐시를 꺼내지 않고 다시 읽는다(캐시 열쇠는 그대로여도 끝 조각의 판정이 달라진다)
        if (key !== null && !options.rescan && !recentlyChanged(file, options)) {
          const hit = await loadCached(cacheDir, key);
          const prints = hit?.codex === undefined ? null : fromLists(hit.codex.fingerprints);
          if (hit !== null && hit.codex !== undefined && prints !== null) {
            return { canonical, file, key, summary: hit.summary, prints, digest: hit.codex.sharedDigest, bytesRead: hit.bytesRead, fromCache: true, storable: false, inProgress: false, partial: false, failed: false };
          }
        }
      }
      const parsed = await parseCopy(file, null, options);
      return { canonical, file, key, ...parsed, digest: sharedDigest(parsed.prints, null), fromCache: false, failed: false };
    } catch {
      failure ??= "failed";
    }
  }
  return failure ?? "failed";
}

export async function collectCodex(options: CodexCollectOptions): Promise<CodexCollectResult> {
  const home = codexHome(options.env, options.homedir);
  // 하위 세션의 부모가 수집 구간보다 오래됐을 수 있어 목록은 거르지 않고 받고, 구간은 정본마다 가른다
  return collectCodexFromList(home, await listCodexFiles(home, null, options.statFile), options);
}

/** 파일 목록을 받아 모은다. 목록의 차례와 상관없이 같은 결과를 낸다 */
export async function collectCodexFromList(home: string, list: CodexFileList, options: CodexCollectOptions): Promise<CodexCollectResult> {
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const lowerBound = options.rescan ? null : windows.collectStartLowerBoundMs;
  const cacheDir = options.cacheDir === null ? null : join(options.cacheDir, "codex");
  const zstd = options.zstd ?? zstdAvailable();
  const groups = groupCopies(list.files)
    .map((group) => ({ ...group, copies: [...group.copies] }))
    .sort((a, b) => byPath(a.copies[0]!, b.copies[0]!));
  const inWindow = groups.filter((group) => lowerBound === null || group.copies[0]!.changedMs === null || group.copies[0]!.changedMs >= lowerBound);
  // 구간 밖의 기록은 하위 세션의 부모이거나 구간 안 기록과 같은 세션일 때만 지문을 얻으려고 읽는다. 기록 파일 식별자와, 대화를 되돌려 생긴 기록이면 이름 앞의 원래 세션 ID로 찾는다
  const inside = new Set(inWindow);
  const outside = new Map<string, CodexCopyGroup[]>();
  for (const group of groups) {
    if (inside.has(group)) continue;
    for (const key of keysOf(group)) {
      const found = outside.get(key);
      if (found === undefined) outside.set(key, [group]);
      else found.push(group);
    }
  }

  const read: CodexReadStats = {
    files: inWindow.length,
    listedBytes: 0,
    bytes: 0,
    fromCache: 0,
    inProgress: 0,
    olderThanWindow: list.olderThanWindow + groups.length - inWindow.length,
    unreadableFiles: [],
    unreadableFileBytes: 0,
    unknownSizeFiles: 0,
    unreadableDirs: [...list.unreadableDirs].sort(),
    skippedFiles: [],
    skippedFileBytes: 0,
    partialFiles: [],
    skippedCopies: inWindow.reduce((sum, group) => sum + group.copies.length - 1, 0),
    unnamedFiles: list.unnamedFiles,
  };

  // 1. 정본마다 캐시에서 꺼내거나 뺄 지문 없이 읽는다. 자기 지문은 뺄 지문과 상관없이 정해진다
  const reads: RecordRead[] = [];
  const failedGroups: CodexCopyGroup[] = [];
  const readOf = new Map<CodexCopyGroup, RecordRead>();
  for (const group of inWindow) {
    const result = await readGroup(group, options, zstd, cacheDir);
    read.unknownSizeFiles += group.copies.filter((copy) => copy.size === null).length;
    if (typeof result !== "string") {
      reads.push(result);
      readOf.set(group, result);
      read.listedBytes += result.file.size ?? 0;
      continue;
    }
    failedGroups.push(group);
    const canonical = group.copies[0]!;
    read.listedBytes += canonical.size ?? 0;
    if (result === "skipped") {
      read.skippedFiles.push(canonical.path);
      read.skippedFileBytes += canonical.size ?? 0;
      continue;
    }
    read.unreadableFiles.push(canonical.path);
    read.unreadableFileBytes += canonical.size ?? 0;
  }
  const unknownMtime = new Set<string>();
  for (const group of inWindow) {
    if (!group.copies.some((copy) => copy.mtimeMs === null)) continue;
    const record = readOf.get(group);
    unknownMtime.add(record === undefined ? `record:${group.recordId}` : `session:${record.summary.sessionId}`);
  }

  // 2. 이어받은 앞부분을 뺀다(「5단계 계획 전 결정」 7번). 기록마다 뺄 지문은 하위 세션이면 부모 세션의 기록들과, 같은 세션에 기록이 여럿이면 그보다 앞선 기록들(수집 구간 밖의 것도)의 것이다.
  //    그 지문 가운데 자기 기록에도 있는 것이 해석 때와 다르면 그 지문을 넣어 다시 읽는다
  // 이어받은 것을 확인할 수 없게 하는 것: 읽지 못했거나 건너뛴 기록(어느 세션의 것인지는 이름으로만 안다), 일부만 읽었거나 절반 넘게 깨진 기록의 세션, 원래 기록을 찾지 못한 세션, 부모를 모르는 하위 세션
  const failedKeys = new Set(failedGroups.flatMap(keysOf));
  const damaged = new Set(reads.filter((record) => record.partial || mostlyBroken(record.summary)).map((record) => record.summary.sessionId));
  const extra = new Map<CodexCopyGroup, RecordRead | Failure>();
  const parentPrints = new Map<string, CodexFingerprints | null>();
  /** 부모 세션의 원래 기록(식별자가 세션 ID와 같은 기록)을 찾았는지 */
  const parentOriginal = new Map<string, boolean>();
  const printsOf = async (parentId: string): Promise<CodexFingerprints | null> => {
    if (parentPrints.has(parentId)) return parentPrints.get(parentId)!;
    const found = reads.filter((record) => record.summary.sessionId === parentId);
    for (const old of outside.get(parentId) ?? []) {
      if (!extra.has(old)) extra.set(old, await readGroup(old, options, zstd, cacheDir));
      const result = extra.get(old)!;
      // 이름으로 찾은 기록이라 읽어서 세션 ID가 맞을 때만 쓴다. 읽지 못했으면 부모 기록이 모자란 것이다
      if (typeof result === "string") failedKeys.add(parentId);
      else if (result.summary.sessionId === parentId) {
        found.push(result);
        if (result.partial || mostlyBroken(result.summary)) damaged.add(parentId);
      }
    }
    const prints = found.length === 0 ? null : unionOf(found.map((record) => record.prints));
    parentPrints.set(parentId, prints);
    parentOriginal.set(parentId, found.some((record) => record.canonical.recordId === parentId));
    return prints;
  };
  const siblings = new Map<string, RecordRead[]>();
  for (const record of reads) {
    const list = siblings.get(record.summary.sessionId);
    if (list === undefined) siblings.set(record.summary.sessionId, [record]);
    else list.push(record);
  }
  // 같은 세션의 기록이 수집 구간 밖에도 있으면 지문을 얻으려고 읽고 차례에 넣는다. 그 기록의 수는 요약에 넣지 않고 정체에만 쓴다(4). 이름으로 찾은 기록은 읽어서 세션 ID가 맞을 때만 쓴다
  const outsideOf = new Map<string, SessionSummary[]>();
  for (const [sessionId, list] of siblings) {
    for (const old of outside.get(sessionId) ?? []) {
      if (!extra.has(old)) extra.set(old, await readGroup(old, options, zstd, cacheDir));
      const result = extra.get(old)!;
      if (typeof result === "string") failedKeys.add(sessionId);
      else if (result.summary.sessionId === sessionId) {
        list.push(result);
        outsideOf.set(sessionId, [...(outsideOf.get(sessionId) ?? []), result.summary]);
        if (result.partial || mostlyBroken(result.summary)) damaged.add(sessionId);
      }
    }
  }
  for (const list of siblings.values()) list.sort(siblingOrder);
  const parentOf = (record: RecordRead): string | null =>
    record.summary.kind === "sub" && record.summary.parentSessionId !== null && record.summary.parentSessionId !== record.summary.sessionId ? record.summary.parentSessionId : null;
  // 뺄 지문은 처음 읽은 지문으로 모두 먼저 정한다. 다시 읽기의 차례나 그새 바뀐 파일에 따라 달라지지 않는다
  const plans: Array<{ record: RecordRead; inherited: CodexFingerprints | null }> = [];
  for (const record of reads) {
    const parentId = parentOf(record);
    const parent = parentId === null ? null : await printsOf(parentId);
    const list = siblings.get(record.summary.sessionId)!;
    const sources = [...(parent === null ? [] : [parent]), ...list.slice(0, list.indexOf(record)).map((sibling) => sibling.prints)];
    plans.push({ record, inherited: sources.length === 0 ? null : unionOf(sources) });
  }
  for (const { record, inherited } of plans) {
    const digest = sharedDigest(record.prints, inherited);
    if (digest === record.digest) continue;
    try {
      const parsed = await parseCopy(record.file, inherited, options);
      // 뺄 지문과 세션 묶음은 처음 읽기로 정했으므로, 다시 읽은 요약의 세션 ID가 처음과 다르면(되돌려 생긴 기록이 그새 줄어 첫 줄을 읽지 못하는 등) 다시 읽다가 읽지 못한 것으로 센다
      if (parsed.summary.sessionId !== record.summary.sessionId) throw new Error("다시 읽은 기록의 세션 ID가 처음과 다르다");
      // 캐시에 넣는 겹침 값은 다시 읽은 자기 지문으로 다시 계산한다(첫 읽기가 덜 읽었거나 그새 파일이 바뀌면 두 지문이 달라, 요약과 짝이 맞지 않는다)
      Object.assign(record, parsed, { digest: sharedDigest(parsed.prints, inherited), fromCache: false });
    } catch {
      record.failed = true;
    }
  }
  // 다시 읽다가 읽지 못했거나 다시 읽은 것이 일부만 읽혔으면 그 세션의 기록도 모자란 것이다. 이어받은 것의 확인은 다시 읽기가 모두 끝난 뒤에 한다
  for (const record of reads) {
    if (record.failed) failedKeys.add(record.summary.sessionId);
    else if (record.partial || mostlyBroken(record.summary)) damaged.add(record.summary.sessionId);
  }
  const orphans = new Set<string>();
  const unverified = new Set<string>();
  for (const record of reads) {
    if (record.failed) continue;
    const { sessionId } = record.summary;
    const parentId = parentOf(record);
    const parent = parentId === null ? null : await printsOf(parentId);
    if (parentId !== null && parent === null) orphans.add(sessionId);
    // 하위 세션인데 부모를 모르면(부모 값이 없거나 자기 자신) 뺄 부모 지문을 찾을 수 없다
    if (record.summary.kind === "sub" && parentId === null) unverified.add(sessionId);
    if (parentId !== null && (parent === null || parentOriginal.get(parentId) !== true || failedKeys.has(parentId) || damaged.has(parentId))) unverified.add(sessionId);
    const list = siblings.get(sessionId)!;
    // 원래 기록(식별자가 세션 ID와 같은 기록)을 찾지 못했으면 대화를 되돌려 생긴 기록이 무엇을 이어받았는지 확인할 수 없다
    if (failedKeys.has(sessionId) || (list.length > 1 && damaged.has(sessionId)) || !list.some((sibling) => sibling.canonical.recordId === sessionId)) unverified.add(sessionId);
    if (record.summary.codex?.baselineMissing === true) unverified.add(sessionId);
  }

  // 3. 읽은 양을 세고 캐시에 넣는다
  const kept: RecordRead[] = [];
  const idFallbacks = nameRecord<number>();
  // 읽지 못한 기록은 읽은 사본(목록의 바이트에 넣은 것)의 경로와 바이트로 센다
  const unreadable = (record: RecordRead): void => {
    read.unreadableFiles.push(record.file.path);
    read.unreadableFileBytes += record.file.size ?? 0;
  };
  for (const record of reads) {
    if (record.failed) {
      unreadable(record);
      continue;
    }
    kept.push(record);
    const fallback = record.summary.codex?.idFallback ?? null;
    if (fallback !== null) idFallbacks[fallback] = (Object.hasOwn(idFallbacks, fallback) ? idFallbacks[fallback]! : 0) + 1;
    read.bytes += record.bytesRead;
    if (record.fromCache) read.fromCache++;
    if (record.inProgress) read.inProgress++;
    if (mostlyBroken(record.summary)) unreadable(record);
    else if (record.partial) read.partialFiles.push(record.file.path);
  }
  if (cacheDir !== null) {
    for (const record of [...kept, ...[...extra.values()].filter((result): result is RecordRead => typeof result !== "string")]) {
      if (record.fromCache || !record.storable || record.key === null) continue;
      try {
        // 해석하는 동안 바뀌었으면(크기와 수정 시각을 되돌렸어도 앞뒤 지문이 다르면) 그 요약을 이 열쇠로 넣지 않는다
        if (await keyStillMatches(record.file.path, record.key)) await storeCached(cacheDir, { key: record.key, summary: record.summary, bytesRead: record.bytesRead, codex: { fingerprints: toLists(record.prints), sharedDigest: record.digest } });
      } catch {
        // 캐시를 쓰지 못해도 점검은 이어 간다. 다음 점검이 다시 읽는다
      }
    }
  }

  // 4. 같은 세션의 기록 파일을 합친다. 세션마다 가장 앞선 정본의 경로 차례로 낸다
  const sessions = new Map<string, RecordRead[]>();
  for (const record of kept) {
    const list = sessions.get(record.summary.sessionId);
    if (list === undefined) sessions.set(record.summary.sessionId, [record]);
    else list.push(record);
  }
  const ordered = [...sessions.values()].sort((a, b) => byPath(a[0]!.canonical, b[0]!.canonical));
  const outsideFor = (records: RecordRead[]): SessionSummary[] => outsideOf.get(records[0]!.summary.sessionId) ?? [];
  const summaries = ordered.map((records) => mergeRecords(records.map((record) => record.summary), outsideFor(records)));
  read.unreadableFiles.sort();
  read.skippedFiles.sort();
  read.partialFiles.sort();
  return {
    tool: "codex",
    home,
    detected: list.sessionsFound,
    summaries,
    read,
    visibleFrom: visibleFrom(summaries, read.olderThanWindow, windows.collectDates[0]!),
    parentRecordMissing: orphans.size,
    mergedSessions: ordered.filter((records) => records.length + outsideFor(records).length > 1).length,
    unknownMtimeSessions: unknownMtime.size,
    unverifiedInheritance: unverified.size,
    idFallbacks: sortedRecord(idFallbacks),
  };
}
