// 상태 폴더(~/.chunsik-garage)의 위치와 그 안에 두는 것, 크기 재기와 지우기. 링크(심볼릭 링크·정션)는 따라가지 않는다(설계 7.4, 19.2)
import { lstat, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";

export const STATE_DIR_NAME = ".chunsik-garage";

export function stateDir(homedir: string): string {
  return join(homedir, STATE_DIR_NAME);
}

export type CleanLevel = "clean" | "all";

export interface StateEntrySpec {
  name: string;
  kind: "dir" | "file";
  /** 이 수준의 지우기부터 지운다. reports는 clean에서 가장 최근 점검의 결과만 남긴다 */
  removedBy: CleanLevel;
}

/** 상태 폴더에 두는 것(설계 19.2). 차례는 aq where가 보이는 차례다. 새 종류를 두는 단계는 여기에 더한다(로드맵). */
export const STATE_ENTRIES: readonly StateEntrySpec[] = [
  { name: "cache", kind: "dir", removedBy: "clean" },
  { name: "reports", kind: "dir", removedBy: "clean" },
  { name: "history.jsonl", kind: "file", removedBy: "all" },
  { name: "state.json", kind: "file", removedBy: "all" },
  { name: "notified", kind: "dir", removedBy: "all" },
  { name: "tune", kind: "dir", removedBy: "all" },
];

export interface TreeSize {
  files: number;
  bytes: number;
  /** 따라가지 않은 링크의 수 */
  links: number;
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

/** 경로 아래의 파일 수와 바이트를 센다. 링크는 따라가지 않고 수만 센다. 없으면 0이다. */
export async function treeSize(path: string): Promise<TreeSize> {
  const total: TreeSize = { files: 0, bytes: 0, links: 0 };
  const walk = async (current: string): Promise<void> => {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      total.links++;
      return;
    }
    if (info.isDirectory()) {
      for (const name of (await readdir(current)).sort()) await walk(join(current, name));
      return;
    }
    total.files++;
    total.bytes += info.size;
  };
  await walk(path);
  return total;
}

/** 링크 자체를 지운다. 대상은 건드리지 않는다. Windows의 폴더 링크(정션)는 unlink가 막히면 rmdir로 지운다. */
async function removeLink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EISDIR") {
      await rmdir(path);
      return;
    }
    throw error;
  }
}

/**
 * 상태 폴더가 있어야 할 실제 경로(정규화). 위 폴더의 실제 경로에 폴더 이름을 붙인 것이다.
 * 상태 폴더 자체가 링크로 바뀌면 그 폴더의 실제 경로가 이것과 달라지므로 알아볼 수 있다.
 */
export async function expectedRealDir(dir: string): Promise<string> {
  return normalizePath(join(await realpath(dirname(dir)), basename(dir)));
}

const outside = (path: string): NodeJS.ErrnoException => Object.assign(new Error(`outside of the state folder: ${path}`), { code: "EOUTSIDE" });

/** 경로의 실제 경로가 boundary 안인지 본다. allowEqual이면 boundary 자체도 된다. 벗어나면 EOUTSIDE로 던진다. */
async function assertInside(path: string, boundary: string, allowEqual: boolean): Promise<void> {
  const real = normalizePath(await realpath(path));
  if (real === boundary ? allowEqual : real.startsWith(`${boundary}/`)) return;
  throw outside(path);
}

export interface RemoveFilesReport {
  /** 지운 파일의 수 */
  removed: number;
  /** 고른 뒤 위 폴더가 상태 폴더 안의 다른 곳을 가리키는 링크로 바뀌어 지우지 않은 파일의 수 */
  linked: number;
}

/**
 * 보통 파일만 지운다. 폴더 안으로 내려가지 않는다. 고른 뒤 지우기 전에 다른 프로그램이 그 자리를 폴더나 링크로 바꿨으면 지우지 않고 넘긴다.
 * 지우기 직전에 다시 보통 파일인지와 위 폴더의 실제 경로가 boundary 안인지 본다. 벗어나면 EOUTSIDE로 던진다.
 * 위 폴더의 실제 경로가 있어야 할 자리(root에서 그 폴더까지의 이름을 boundary 아래에 둔 것)와 다르면, 그 사이의 폴더가 상태 폴더 안의 다른 곳을 가리키는 링크로 바뀐 것이라 넘기고 linked로 센다.
 * 없어진 것은 넘긴다. 지운 파일과 링크 때문에 넘긴 파일의 수를 돌려준다. root는 상태 폴더, boundary는 그 실제 경로(expectedRealDir)다.
 * 점검 때의 정리(오래된 결과, 원본이 없어진 캐시)가 쓴다. 사용자가 시킨 aq clean의 지우기는 removeTree다(설계 19.2).
 */
export async function removeFiles(paths: readonly string[], root: string, boundary: string): Promise<RemoveFilesReport> {
  const report: RemoveFilesReport = { removed: 0, linked: 0 };
  for (const path of paths) {
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    if (!info.isFile()) continue;
    const parent = dirname(path);
    await assertInside(parent, boundary, true);
    if (normalizePath(await realpath(parent)) !== normalizePath(join(boundary, relative(root, parent)))) {
      report.linked++;
      continue;
    }
    await unlink(path);
    report.removed++;
  }
  return report;
}

/**
 * 경로를 지운다. 폴더 안의 링크는 링크 자체만 지우고 따라가지 않는다. 지운 파일 수와 바이트를 돌려준다.
 * 걸음마다(폴더를 읽기 전과 지우기 전, 파일과 링크를 지우기 전) 실제 경로가 boundary(상태 폴더의 실제 경로) 안인지 다시 본다.
 * 다른 프로그램이 지우는 도중에 폴더를 바깥을 가리키는 링크로 바꿔치면 그 걸음에서 EOUTSIDE로 멈춘다.
 * 다시 본 바로 뒤에 바꿔치는 틈은 막지 못한다(Node.js는 폴더 핸들을 기준으로 지우는 수단을 주지 않는다).
 */
export async function removeTree(path: string, boundary: string): Promise<TreeSize> {
  const removed: TreeSize = { files: 0, bytes: 0, links: 0 };
  const walk = async (current: string): Promise<void> => {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      await assertInside(dirname(current), boundary, true);
      await removeLink(current);
      removed.links++;
      return;
    }
    if (info.isDirectory()) {
      await assertInside(current, boundary, false);
      for (const name of await readdir(current)) await walk(join(current, name));
      await assertInside(current, boundary, false);
      await rmdir(current);
      return;
    }
    await assertInside(dirname(current), boundary, true);
    await unlink(current);
    removed.files++;
    removed.bytes += info.size;
  };
  await walk(path);
  return removed;
}
