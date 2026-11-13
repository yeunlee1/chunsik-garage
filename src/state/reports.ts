// 평가 결과 파일을 결과 폴더(reports/)나 OS 임시 폴더에 쓰고, 결과 폴더에서 최근 20번의 점검만 남긴다. 이름의 시각은 평가 시계를 UTC로 적어 글자 차례가 시각 차례다(설계 12.3, 13.2, 19.2)
import { lstat, mkdir, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { expectedRealDir, removeFiles } from "./folder.ts";

export const REPORTS_DIR = "reports";
/** 결과 폴더에 남기는 점검의 수. 한 점검의 결과 화면과 평가 결과 파일을 한 번으로 센다 */
export const KEEP_REPORTS = 20;
const TEMP_PREFIX = "chunsik-garage-result-";
/** 이 도구가 결과 폴더에 쓰는 이름. 시각 뒤에 결과 화면(.html)이나 평가 결과 파일(.json)이 붙는다 */
const STAMPED = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.(json|html)$/;

/** 평가 시계의 UTC 시각을 파일 이름에 쓸 수 있게 적는다. 2026-11-13T13-23-34-938Z 꼴이다 */
export function resultStamp(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/[:.]/g, "-");
}

/** 임시 파일에 쓰고 이름을 바꾼다. 실패하면 임시 파일을 남기지 않는다 */
async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** 결과 폴더에 <시각>.json으로 쓰고 경로를 돌려준다. 같은 이름이 있으면 덮어쓴다 */
export async function writeResult(stateDir: string, stamp: string, result: unknown): Promise<string> {
  const reports = join(stateDir, REPORTS_DIR);
  await mkdir(reports, { recursive: true });
  const path = join(reports, `${stamp}.json`);
  await writeJson(path, result);
  return path;
}

/** 저장 없는 실행의 평가 결과 파일. OS 임시 폴더에 쓰고 경로를 돌려준다(설계 12.3, 20.2) */
export async function writeTempResult(tmpdir: string, stamp: string, result: unknown): Promise<string> {
  const path = join(tmpdir, `${TEMP_PREFIX}${stamp}.json`);
  await writeJson(path, result);
  return path;
}

export interface StaleReports {
  /** 링크라서 안을 보지 않은 것. state는 상태 폴더 자체, reports는 결과 폴더다 */
  skipped: "state" | "reports" | null;
  /** 상태 폴더가 있어야 할 실제 경로(지우기 전의 경계) */
  boundary: string | null;
  /** 지울 결과 파일(경로 차례) */
  paths: string[];
}

/**
 * 결과 폴더에서 지울 결과 파일을 고른다. 이 도구가 쓴 이름(시각 꼴)의 보통 파일만 보고 시각으로 묶어 최근 keep번만 남긴다.
 * keepStamp(이번 점검의 시각)의 결과가 있으면 시계가 뒤로 가 있어도 늘 남기고 keep번에 넣어 센다. 그 결과가 없으면 자리를 맡지 않는다.
 * 사용자가 둔 다른 이름의 파일, 폴더, 링크는 고르지도 세지도 않는다.
 */
export async function staleReports(stateDir: string, keep: number = KEEP_REPORTS, keepStamp: string | null = null): Promise<StaleReports> {
  let dirInfo;
  try {
    dirInfo = await lstat(stateDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { skipped: null, boundary: null, paths: [] };
    throw error;
  }
  const boundary = await expectedRealDir(stateDir);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath(stateDir)) !== boundary) return { skipped: "state", boundary: null, paths: [] };
  const reports = join(stateDir, REPORTS_DIR);
  let info;
  try {
    info = await lstat(reports);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { skipped: null, boundary, paths: [] };
    throw error;
  }
  if (info.isSymbolicLink()) return { skipped: "reports", boundary: null, paths: [] };
  if (!info.isDirectory()) return { skipped: null, boundary, paths: [] };

  const files: { name: string; stamp: string }[] = [];
  for (const name of await readdir(reports)) {
    const match = STAMPED.exec(name);
    if (match === null) continue;
    if ((await lstat(join(reports, name))).isFile()) files.push({ name, stamp: match[1]! });
  }
  const stamps = new Set(files.map((file) => file.stamp));
  const others = [...stamps].filter((stamp) => stamp !== keepStamp).sort().reverse();
  // 이번 점검의 시각은 그 결과가 결과 폴더에 있을 때만 한 자리를 맡는다. 있으면 남길 수가 0이어도 남긴다
  const kept = new Set(keepStamp !== null && stamps.has(keepStamp) ? [keepStamp, ...others.slice(0, Math.max(keep - 1, 0))] : others.slice(0, keep));
  const paths = files
    .filter((file) => !kept.has(file.stamp))
    .map((file) => join(reports, file.name))
    .sort();
  return { skipped: null, boundary, paths };
}

export interface PruneReport {
  /** 지운 파일의 수 */
  removed: number;
  /** 링크라서 안을 지우지 않은 것. state는 상태 폴더 자체, reports는 결과 폴더다(고른 뒤 결과 폴더가 링크로 바뀐 것도 든다) */
  skipped: "state" | "reports" | null;
}

/**
 * 오래된 결과 파일을 지운다(설계 19.2). 고른 뒤 지우기 직전에 다시 보통 파일인지, 위 폴더가 있어야 할 자리인지 본다. 그 사이 폴더나 링크로 바뀐 것과 위 폴더가 링크로 바뀐 것은 지우지 않는다.
 * keepStamp는 이번 점검의 시각이다. 방금 쓴 결과는 늘 남는다.
 */
export async function pruneReports(stateDir: string, keep: number = KEEP_REPORTS, keepStamp: string | null = null): Promise<PruneReport> {
  const stale = await staleReports(stateDir, keep, keepStamp);
  if (stale.boundary === null || stale.paths.length === 0) return { removed: 0, skipped: stale.skipped };
  const result = await removeFiles(stale.paths, stateDir, stale.boundary);
  // 고른 뒤 결과 폴더가 링크로 바뀌어 지우지 않은 것이 있으면 링크라서 하지 않은 정리로 알린다
  return { removed: result.removed, skipped: result.linked > 0 ? "reports" : null };
}
