// 정비 작업 기록(tune/<작업 ID>.json), 잠금(tune/lock), 끊긴 작업 맞추기(설계 16.4, 16.5의 3.1, 「6단계 2부 계획 전 결정」 6·7·9번)
import { chmod, mkdir, open, readdir, readFile, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ToolId } from "../adapters/types.ts";
import { fingerprintOf, readTarget, type Slot, type TargetRead, type TuneItem, type TuneKey } from "./items.ts";

/** 확인됨(verified)과 되돌림(undone)은 확인과 되돌리기가 적는다 */
export type WorkState = "planned" | "writing" | "written" | "rejected" | "not_applied" | "unknown" | "verified" | "undone";

export interface WorkItem {
  id: string;
  unit: TuneItem["unit"];
  tool: ToolId;
  target: string;
  file: string;
  key: TuneKey;
  /** 바꾸기 전과 쓸 것. 되돌리기는 적용의 둘을 맞바꾼 것이다 */
  before: Slot;
  after: Slot;
  state: WorkState;
  /** 거절됨, 적용 안 됨, 모름의 까닭. 고칠 수 없는 까닭(TuneBlock), 이 단계의 까닭, 쓰기의 오류 코드다 */
  reason: string | null;
}

export interface WorkFile {
  path: string;
  items: string[];
  /** 바꾸기 전 지문. 파일이 없었으면 null이다 */
  before: string | null;
  /** 후보의 지문. 후보를 만들지 않았으면 null이다 */
  candidate: string | null;
}

export interface TuneWork {
  workId: string;
  kind: "apply" | "undo";
  planId: string | null;
  /** 되돌리기면 되돌린 적용의 작업 ID다 */
  of: string | null;
  createdAt: string;
  appVersion: string;
  items: WorkItem[];
  files: WorkFile[];
}

/** 계획 ID와 작업 ID의 꼴. 경로로 쓰이는 글이라 이 밖의 글자는 받지 않는다 */
export const ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{6}$/;
export const TUNE_DIR = "tune";
export const LOCK_FILE = join(TUNE_DIR, "lock");

/** 임시 파일에 쓰고 fsync한 뒤 이름을 바꾼다. mode를 주면 POSIX에서 그 권한 비트를 옮긴다. 실패하면 임시 파일을 남기지 않는다 */
export async function writeDurable(path: string, data: string, mode?: number): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    const handle = await open(temporary, "w");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (mode !== undefined && process.platform !== "win32") await chmod(temporary, mode);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export const workPath = (stateDir: string, workId: string): string => join(stateDir, TUNE_DIR, `${workId}.json`);

export async function saveWork(stateDir: string, work: TuneWork): Promise<void> {
  await mkdir(join(stateDir, TUNE_DIR), { recursive: true });
  await writeDurable(workPath(stateDir, work.workId), `${JSON.stringify(work, null, 2)}\n`);
}

const isWork = (value: unknown): value is TuneWork => {
  const work = value as TuneWork | null;
  return typeof work === "object" && work !== null && typeof work.workId === "string" && Array.isArray(work.items) && Array.isArray(work.files);
};

/** 작업 기록 하나. 작업 ID 꼴이 아니거나, 없거나, 풀리지 않으면 null이다 */
export async function loadWork(stateDir: string, workId: string): Promise<TuneWork | null> {
  if (!ID_PATTERN.test(workId)) return null;
  try {
    const value: unknown = JSON.parse(await readFile(workPath(stateDir, workId), "utf8"));
    return isWork(value) && value.workId === workId ? value : null;
  } catch {
    return null;
  }
}

/** 작업 기록 전부(작업 ID 차례). 작업 ID 꼴이 아닌 파일과 풀리지 않는 것은 건너뛴다 */
export async function listWorks(stateDir: string): Promise<TuneWork[]> {
  let names: string[];
  try {
    names = await readdir(join(stateDir, TUNE_DIR));
  } catch {
    return [];
  }
  const works: TuneWork[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    const work = await loadWork(stateDir, name.slice(0, -".json".length));
    if (work !== null) works.push(work);
  }
  return works;
}

export const unfinished = (work: TuneWork): boolean => work.items.some((item) => item.state === "planned" || item.state === "writing");

export interface Lock {
  release(): Promise<void>;
}

/** 그 번호의 프로세스가 살아 있는지. 권한이 없어 못 보는 것도 살아 있는 것이다 */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** 잠금을 잡는다(16.5의 3.1). 살아 있는 프로세스가 잡고 있으면 null이다. 끝난 프로세스가 남긴 잠금은 지우고 한 번 더 잡는다. 내용을 읽지 못하는 잠금은 살아 있는 것으로 본다 */
export async function takeLock(stateDir: string, alive: (pid: number) => boolean = isAlive): Promise<Lock | null> {
  const path = join(stateDir, LOCK_FILE);
  await mkdir(join(stateDir, TUNE_DIR), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      } finally {
        await handle.close();
      }
      return { release: () => unlink(path).catch(() => undefined) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    let pid: unknown;
    try {
      pid = (JSON.parse(await readFile(path, "utf8")) as { pid?: unknown }).pid;
    } catch {
      return null;
    }
    if (typeof pid !== "number" || alive(pid)) return null;
    await unlink(path).catch(() => undefined);
  }
  return null;
}

/**
 * 끊긴 작업 맞추기(16.4). 예정이나 쓰는 중으로 남은 항목을 파일마다 실제 파일의 지문으로 맞추고 기록을 다시 쓴다. 맞춘 작업 ID를 돌려준다.
 * 후보를 만들기 전에 끊겼으면 적용 안 됨, 지문이 후보와 같으면 썼음, 바꾸기 전과 같으면(없던 파일이 여전히 없는 것을 포함한다) 적용 안 됨, 어느 쪽도 아니거나 읽지 못하면 모름이다
 */
export async function reconcileWorks(stateDir: string, read: (path: string) => Promise<TargetRead> = readTarget): Promise<string[]> {
  const done: string[] = [];
  for (const work of await listWorks(stateDir)) {
    if (!unfinished(work)) continue;
    for (const file of work.files) {
      const pending = work.items.filter((item) => item.file === file.path && (item.state === "planned" || item.state === "writing"));
      if (pending.length === 0) continue;
      let state: WorkState = "not_applied";
      if (file.candidate !== null) {
        const now = await read(file.path);
        const fingerprint = now.status === "ok" ? fingerprintOf(now.bytes) : now.status === "missing" ? null : undefined;
        state = fingerprint === file.candidate ? "written" : fingerprint === file.before ? "not_applied" : "unknown";
      }
      for (const item of pending) {
        item.state = state;
        item.reason = "interrupted";
      }
    }
    // 파일로 묶기 전에 끊긴 항목은 손대지 않은 것이다
    for (const item of work.items) {
      if (item.state !== "planned" && item.state !== "writing") continue;
      item.state = "not_applied";
      item.reason = "interrupted";
    }
    await saveWork(stateDir, work);
    done.push(work.workId);
  }
  return done;
}
