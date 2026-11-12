// aq where. 상태 폴더의 위치와, 그 안에 둔 것마다 있는지·파일 수·바이트를 알린다. 링크는 따라가지 않는다(설계 7.4, 19.2)
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { STATE_ENTRIES, treeSize, type CleanLevel } from "../state/folder.ts";

export interface WhereEntry {
  name: string;
  kind: "dir" | "file";
  exists: boolean;
  /** 링크이면 참이다. 링크의 대상은 세지 않는다 */
  link: boolean;
  files: number;
  bytes: number;
  removedBy: CleanLevel;
  /** 세다가 오류가 나서 수가 모자랄 수 있다 */
  unreadable: boolean;
}

export interface WhereReport {
  dir: string;
  exists: boolean;
  /** 상태 폴더 자체가 링크이면 참이다. 그때는 안을 세지 않는다 */
  link: boolean;
  entries: WhereEntry[];
  files: number;
  bytes: number;
  /** 이 도구가 두는 것이 아닌 이름(이름 차례). aq clean은 이것을 지우지 않는다 */
  others: string[];
  /** 저장하지 않고 돌린 실행의 결과 파일은 OS 임시 폴더에 있고 이 도구가 위치를 기억하지 않는다(설계 19.2) */
  noSaveResultsInOsTemp: true;
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

export async function where(dir: string): Promise<WhereReport> {
  const report: WhereReport = { dir, exists: false, link: false, entries: [], files: 0, bytes: 0, others: [], noSaveResultsInOsTemp: true };
  let dirInfo;
  try {
    dirInfo = await lstat(dir);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  report.exists = dirInfo !== undefined;
  report.link = dirInfo?.isSymbolicLink() ?? false;
  const inside = report.exists && !report.link;
  for (const spec of STATE_ENTRIES) {
    const entry: WhereEntry = { name: spec.name, kind: spec.kind, exists: false, link: false, files: 0, bytes: 0, removedBy: spec.removedBy, unreadable: false };
    if (inside) {
      try {
        const info = await lstat(join(dir, spec.name));
        entry.exists = true;
        entry.link = info.isSymbolicLink();
        if (!entry.link) {
          const size = await treeSize(join(dir, spec.name));
          entry.files = size.files;
          entry.bytes = size.bytes;
        }
      } catch (error) {
        // 하나를 세지 못해도 나머지는 센다(설계 20.1)
        if (!isMissing(error)) entry.unreadable = true;
      }
    }
    report.files += entry.files;
    report.bytes += entry.bytes;
    report.entries.push(entry);
  }
  if (inside) {
    const known = new Set(STATE_ENTRIES.map((spec) => spec.name));
    report.others = (await readdir(dir)).filter((name) => !known.has(name)).sort();
  }
  return report;
}
