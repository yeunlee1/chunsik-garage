// Codex 기록 폴더를 찾고, 수집 구간에 걸리는 세션 파일(압축본 포함)의 목록과 같은 기록 파일의 사본을 정본 차례로 묶는다(설계 9.1, 9.2, 「5단계 계획 전 결정」 3·7번)
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { normalizePath } from "../claude/locate.ts";

/** 세션 파일 하나. 세션 ID와 주·하위 세션은 첫 줄(session_meta)을 읽어야 알아서 여기에는 없다 */
export interface CodexLogFile {
  path: string;
  normPath: string;
  /** 크기와 수정 시각을 보지 못했으면 null이다. 그런 파일도 정본 후보로 남긴다. 캐시 열쇠와 연 동안 바뀌었는지는 크기와 이 수정 시각으로 본다 */
  size: number | null;
  mtimeMs: number | null;
  /**
   * 수정 시각과 변경 시각 가운데 늦은 것. 작성자 PC(Windows)의 Codex 기록은 쓰는 동안 수정 시각이 만든 시각에 머물고 마지막으로 쓴 시각은 변경 시각에만 남았다.
   * 수집 구간, 정본 차례, 쓰는 중인지는 이것으로 가른다. 크기와 수정 시각을 보지 못했으면 null이다
   */
  changedMs: number | null;
  /** 파일 이름 끝의 식별자. 기록 파일의 식별자다(세션 ID는 session_meta의 id) */
  recordId: string;
  /** 이름이 rollout-<시각>-<UUID1>_<UUID2> 꼴이면 앞의 UUID1. 대화를 되돌려 같은 세션의 기록 파일이 하나 더 생긴 기록에서 원래 세션의 ID였다(이 PC 실측). 아니면 null */
  baseId: string | null;
  /** `.jsonl.zst`이면 참 */
  compressed: boolean;
}

export interface CodexFileList {
  sessionsFound: boolean;
  files: CodexLogFile[];
  /** 수정 시각과 변경 시각 가운데 늦은 것이 아래 경계보다 앞서 열지 않은 파일의 수 */
  olderThanWindow: number;
  /** 목록을 읽지 못해 안을 모르는 폴더(설계 9.8) */
  unreadableDirs: string[];
  /** rollout 파일인데 이름에서 기록 파일 식별자를 읽지 못해 세지 않은 수 */
  unnamedFiles: number;
}

/** 같은 기록 파일의 사본 묶음. copies는 정본 차례다(앞의 것을 먼저 읽고, 읽지 못하면 다음 것) */
export interface CodexCopyGroup {
  recordId: string;
  copies: CodexLogFile[];
}

export function codexHome(env: Record<string, string | undefined>, homedir: string): string {
  const fromEnv = env.CODEX_HOME?.trim();
  return fromEnv ? resolve(fromEnv) : join(homedir, ".codex");
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
const DIGITS = /^\d+$/;
const ROLLOUT = /^rollout-.*?-(?:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(\.zst)?$/i;

/** 파일의 크기와 시각을 읽는다. 시험이 바꿔 끼운다(utimes는 변경 시각을 지금으로 바꾼다) */
export type StatFile = (path: string) => Promise<{ size: number; mtimeMs: number; ctimeMs: number }>;

export async function listCodexFiles(home: string, minChangedMs: number | null, statFile: StatFile = stat): Promise<CodexFileList> {
  const sessions = join(home, "sessions");
  const files: CodexLogFile[] = [];
  const unreadableDirs: string[] = [];
  let olderThanWindow = 0;
  let unnamedFiles = 0;

  // 날짜 폴더(연, 월, 일)만 따라 내려간다. 숫자가 아닌 폴더와 날짜 폴더가 아닌 깊이의 파일은 보지 않는다(설계 9.1)
  const walk = async (dir: string, depth: number): Promise<boolean> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (depth === 0 && isMissing(error)) return false;
      if (!isMissing(error)) unreadableDirs.push(dir);
      return true;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (depth < 3) {
        if (DIGITS.test(entry.name) && !entry.isFile()) await walk(path, depth + 1);
        else if (DIGITS.test(entry.name) && entry.isFile()) unreadableDirs.push(path);
        continue;
      }
      if (!entry.isFile() || !/^rollout-.*\.jsonl(\.zst)?$/i.test(entry.name)) continue;
      const match = ROLLOUT.exec(entry.name);
      if (match === null) {
        unnamedFiles++;
        continue;
      }
      const baseId = match[1]?.toLowerCase() ?? null;
      const recordId = match[2]!.toLowerCase();
      const compressed = match[3] !== undefined;
      try {
        const info = await statFile(path);
        const changedMs = Math.max(info.mtimeMs, info.ctimeMs);
        if (minChangedMs !== null && changedMs < minChangedMs) {
          olderThanWindow++;
          continue;
        }
        files.push({ path, normPath: normalizePath(path), size: info.size, mtimeMs: info.mtimeMs, changedMs, recordId, baseId, compressed });
      } catch {
        // 크기와 수정 시각을 모르면 수집 구간에 걸리는 것으로 본다(설계 9.8). 정본 후보로 남긴다(결정 3)
        files.push({ path, normPath: normalizePath(path), size: null, mtimeMs: null, changedMs: null, recordId, baseId, compressed });
      }
    }
    return true;
  };

  const found = await walk(sessions, 0);
  if (!found) return { sessionsFound: false, files: [], olderThanWindow: 0, unreadableDirs: [], unnamedFiles: 0 };
  files.sort((a, b) => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0));
  unreadableDirs.sort();
  return { sessionsFound: true, files, olderThanWindow, unreadableDirs, unnamedFiles };
}

/** 정본 차례. 압축하지 않은 것, 수정 시각(변경 시각과 견줘 늦은 것)이 늦은 것(모르는 것은 아는 것 뒤), 경로 사전순이다(설계 9.2, 결정 3) */
function canonicalOrder(a: CodexLogFile, b: CodexLogFile): number {
  if (a.compressed !== b.compressed) return a.compressed ? 1 : -1;
  if (a.changedMs !== b.changedMs) {
    if (a.changedMs === null) return 1;
    if (b.changedMs === null) return -1;
    return b.changedMs - a.changedMs;
  }
  return a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0;
}

export function groupCopies(files: readonly CodexLogFile[]): CodexCopyGroup[] {
  const groups = new Map<string, CodexLogFile[]>();
  for (const file of files) {
    const list = groups.get(file.recordId);
    if (list) list.push(file);
    else groups.set(file.recordId, [file]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([recordId, copies]) => ({ recordId, copies: [...copies].sort(canonicalOrder) }));
}
