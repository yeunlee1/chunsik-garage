// aq clean [--all]. 캐시와 오래된 결과를 지우고, --all이면 이력·상태·알림 표식·정비 작업 기록까지 지운다. 상태 폴더 밖과 링크의 대상은 건드리지 않는다(설계 7.4, 19.2)
import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { expectedRealDir, removeTree, STATE_ENTRIES, treeSize, type CleanLevel, type StateEntrySpec } from "../state/folder.ts";

export interface CleanItem {
  name: string;
  files: number;
  bytes: number;
}

export interface CleanReport {
  dir: string;
  level: CleanLevel;
  /** 상태 폴더 자체가 링크이거나 실제 경로가 있어야 할 곳과 다르면 참이고 아무것도 지우지 않는다 */
  link: boolean;
  removed: CleanItem[];
  /** 지우지 않고 남긴 것. clean에서는 가장 최근 점검의 결과가 남는다 */
  kept: CleanItem[];
  /** 링크라서 링크 자체만 지운 것. 링크가 가리키는 곳은 그대로다 */
  unlinked: string[];
  /** 링크라서 건드리지 않은 것. clean에서 결과 폴더가 링크면 가장 최근 결과를 남기며 지울 수 없어 그대로 둔다 */
  skipped: string[];
  /** 지우다가 오류가 난 항목과 오류 코드. 그 항목의 일부는 지워졌을 수 있다. 다른 항목은 계속 지운다(설계 20.1). EOUTSIDE는 지우는 도중에 상태 폴더 밖을 가리키게 된 것이다 */
  failed: { name: string; code: string }[];
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

async function lstatOrNull(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** 결과 폴더에서 이름의 끝 확장자를 뗀 것이 가장 큰(가장 최근 시각) 보통 파일들만 남기고 나머지를 지운다. */
async function cleanReports(path: string, boundary: string): Promise<{ removed: CleanItem; kept: CleanItem }> {
  const names = (await readdir(path)).sort();
  const base = (name: string): string => name.replace(/\.[^.]*$/, "");
  let latest: string | null = null;
  for (const name of names) {
    const info = await lstat(join(path, name));
    if (info.isFile() && (latest === null || base(name) > latest)) latest = base(name);
  }
  const removed: CleanItem = { name: "reports", files: 0, bytes: 0 };
  const kept: CleanItem = { name: "reports", files: 0, bytes: 0 };
  for (const name of names) {
    const full = join(path, name);
    const info = await lstat(full);
    if (info.isFile() && base(name) === latest) {
      kept.files++;
      kept.bytes += info.size;
      continue;
    }
    const size = await removeTree(full, boundary);
    removed.files += size.files;
    removed.bytes += size.bytes;
  }
  return { removed, kept };
}

/** 상태 폴더에 두는 것 하나를 수준에 따라 지우거나 남긴다. */
async function cleanEntry(dir: string, boundary: string, spec: StateEntrySpec, level: CleanLevel, report: CleanReport): Promise<void> {
  const path = join(dir, spec.name);
  const info = await lstatOrNull(path);
  if (info === null) return;
  if (spec.name === "reports" && level === "clean") {
    // 가장 최근 점검의 결과를 남기며 지운다. 결과 폴더가 링크면 안을 지우지 않는다
    if (info.isSymbolicLink()) {
      report.skipped.push(spec.name);
    } else if (info.isDirectory()) {
      const { removed, kept } = await cleanReports(path, boundary);
      if (removed.files > 0) report.removed.push(removed);
      if (kept.files > 0) report.kept.push(kept);
    }
    return;
  }
  if (spec.removedBy === "clean" || level === "all") {
    const size = await removeTree(path, boundary);
    // 항목이 링크면 removeTree는 링크 자체만 지운다
    if (info.isSymbolicLink()) report.unlinked.push(spec.name);
    else report.removed.push({ name: spec.name, files: size.files, bytes: size.bytes });
    return;
  }
  const size = await treeSize(path);
  report.kept.push({ name: spec.name, files: size.files, bytes: size.bytes });
}

export async function clean(dir: string, level: CleanLevel): Promise<CleanReport> {
  const report: CleanReport = { dir, level, link: false, removed: [], kept: [], unlinked: [], skipped: [], failed: [] };
  const dirInfo = await lstatOrNull(dir);
  if (dirInfo === null) return report;
  // 상태 폴더가 있어야 할 실제 경로. 검사한 뒤에 링크로 바뀌었어도 실제 경로가 달라져 알아본다
  const boundary = await expectedRealDir(dir);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath(dir)) !== boundary) {
    report.link = true;
    return report;
  }
  for (const spec of STATE_ENTRIES) {
    try {
      await cleanEntry(dir, boundary, spec, level, report);
    } catch (error) {
      report.failed.push({ name: spec.name, code: (error as NodeJS.ErrnoException).code ?? "unknown" });
    }
  }
  return report;
}
