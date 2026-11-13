// 상태 파일(state.json)을 읽고 쓴다. 이 PC에서 만든 무작위 값, 마지막 점검 시각, 설치마다의 관측 기록을 둔다. 임시 파일에 쓰고 이름을 바꾼다(설계 18.1, 19.1)
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocalDate } from "../adapters/common/dates.ts";

export const STATE_SCHEMA = 1;
export const STATE_FILE = "state.json";

export interface InstallRecord {
  /** 설치의 정체(installKey로 만든다) */
  key: string;
  /** 이 설치를 계속 봐 온 첫 점검의 날짜 */
  firstSeen: LocalDate;
  /** 그 점검에서 새로 나타난 것인지. 이 도구의 첫 점검에서 이미 있던 것은 거짓이다 */
  appeared: boolean;
}

export interface StateFile {
  schema: typeof STATE_SCHEMA;
  /** 이 PC에서 만든 무작위 값(16진 64자). MCP 서버 정의의 지문에 섞는다. 이 값으로 정의의 원문을 되살릴 수 없다 */
  salt: string;
  /** 마지막 점검을 시작한 시각(ISO). 저장한 점검이 없으면 null */
  lastCheckupAt: string | null;
  /** 설치마다의 관측 기록(열쇠 차례). null이면 이 도구가 아직 관측을 적은 적이 없다(첫 점검) */
  installs: InstallRecord[] | null;
}

export type StateLoad = { status: "missing" } | { status: "broken" } | { status: "ok"; state: StateFile };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SALT = /^[0-9a-f]{64}$/;

export function newState(): StateFile {
  return { schema: STATE_SCHEMA, salt: randomBytes(32).toString("hex"), lastCheckupAt: null, installs: null };
}

function reviveRecord(value: unknown): InstallRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.key !== "string" || typeof v.firstSeen !== "string" || !DATE.test(v.firstSeen) || typeof v.appeared !== "boolean") return null;
  return { key: v.key, firstSeen: v.firstSeen, appeared: v.appeared };
}

/** 풀어 낸 값이 상태 파일의 모양이면 같은 모양으로 되살린다. 하나라도 어긋나면 null이다. */
export function reviveState(value: unknown): StateFile | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.schema !== STATE_SCHEMA || typeof v.salt !== "string" || !SALT.test(v.salt)) return null;
  if (v.lastCheckupAt !== null && (typeof v.lastCheckupAt !== "string" || !Number.isFinite(Date.parse(v.lastCheckupAt)))) return null;
  let installs: InstallRecord[] | null = null;
  if (v.installs !== null) {
    if (!Array.isArray(v.installs)) return null;
    installs = [];
    for (const item of v.installs) {
      const record = reviveRecord(item);
      if (record === null) return null;
      installs.push(record);
    }
    installs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  return { schema: STATE_SCHEMA, salt: v.salt, lastCheckupAt: v.lastCheckupAt, installs };
}

export async function loadState(dir: string): Promise<StateLoad> {
  let text: string;
  try {
    text = await readFile(join(dir, STATE_FILE), "utf8");
  } catch (error) {
    // 상태 폴더 자리에 파일이 있으면(ENOTDIR) 그 안에 상태 파일이 있을 수 없다. 깨진 것이 아니라 없는 것이다
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "missing" };
    return { status: "broken" };
  }
  try {
    const state = reviveState(JSON.parse(text));
    return state === null ? { status: "broken" } : { status: "ok", state };
  } catch {
    return { status: "broken" };
  }
}

export async function saveState(dir: string, state: StateFile): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = join(dir, STATE_FILE);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
    await rename(temporary, target);
  } catch (error) {
    // 쓰다 막히면 임시 파일을 남기지 않는다. 상태 폴더 바로 아래의 임시 파일은 aq clean이 모른다
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}
