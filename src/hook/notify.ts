// 세션 시작 알림의 몸. 알림용 이름 목록(설계 18.1)을 짓고, 알릴지 정하고, 오늘 표식을 "없을 때만 만들기"로 만들어 한 줄을 낸다. 훅과 점검이 같은 함수로 이름을 짓는다(18.2)
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fill } from "../core/copy/format.ts";
import type { NotifySettings } from "../state/state.ts";

/** 알림용 이름 목록. complete가 거짓이면 이름을 찾는 곳 가운데 있는데 읽지 못한 것이 있다 */
export interface NotifyNames {
  names: string[];
  complete: boolean;
}

const isMissing = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};

/** JSON 파일의 맨 바깥 묶음. 없으면 null, 있는데 읽지 못하거나 풀리지 않으면 undefined다 */
function readObject(path: string): Record<string, unknown> | null | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch (error) {
    return isMissing(error) ? null : undefined;
  }
}

const keysOf = (value: unknown): string[] => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : []);

/**
 * 알림용 이름 목록(18.1). 사용자 스킬 폴더 바로 아래의 이름, 사용자 설정에 적힌 플러그인의 이름, 사용자 범위 MCP 서버의 이름이다.
 * 훅이 세션마다 돌리므로 파일 두 개를 풀고 폴더 하나의 목록만 읽는다
 */
export function notifyNames(env: Record<string, string | undefined>, homedir: string): NotifyNames {
  const configDir = env.CLAUDE_CONFIG_DIR || join(homedir, ".claude");
  const names = new Set<string>();
  let complete = true;
  try {
    for (const entry of readdirSync(join(configDir, "skills"), { withFileTypes: true })) if (entry.isDirectory() || entry.isSymbolicLink()) names.add(`skill:${entry.name}`);
  } catch (error) {
    if (!isMissing(error)) complete = false;
  }
  const settings = readObject(join(configDir, "settings.json"));
  if (settings === undefined) complete = false;
  for (const id of keysOf(settings?.enabledPlugins)) names.add(`plugin:${id}`);
  const global = readObject(env.CLAUDE_CONFIG_DIR ? join(env.CLAUDE_CONFIG_DIR, ".claude.json") : join(homedir, ".claude.json"));
  if (global === undefined) complete = false;
  for (const name of keysOf(global?.mcpServers)) names.add(`mcp:${name}`);
  return { names: [...names].sort(), complete };
}

/** 다음에 둘 목록. 다 읽었으면 지금 것이고, 읽지 못한 곳이 있으면 전의 것과 합친다. 읽지 못한 곳의 이름이 빠져 그 뒤의 훅이 새로 깐 것으로 알리지 않게 한다(18.1의 남은 결정) */
export function nextNames(previous: readonly string[] | null, current: NotifyNames): string[] {
  return current.complete || previous === null ? current.names : [...new Set([...previous, ...current.names])].sort();
}

export const HOOK_COPY = {
  en: { prefix: "🔧 Chunsik: ", days: "It has been {days} days since the last checkup. Ask for an AQ checkup.", never: "There is no saved checkup yet. Ask for an AQ checkup.", fresh: "There are newly installed skills, plugins, or MCP servers. Ask for an AQ checkup." },
  ko: { prefix: "🔧 춘식이: ", days: "마지막 점검 뒤 {days}일 지났습니다. AQ 점검해 달라고 말해 보세요.", never: "아직 저장한 점검이 없습니다. AQ 점검해 달라고 말해 보세요.", fresh: "새로 깐 스킬이나 플러그인, MCP 서버가 있습니다. AQ 점검해 달라고 말해 보세요." },
} as const;

const DAY = 86_400_000;
/** 알림 표식을 남겨 두는 날 수(설계 19.2) */
const KEEP_MARKERS_DAYS = 7;

/** 알릴 문장. 알림이 꺼졌거나, 마지막 점검 뒤 7일이 안 지났고 새로 깐 것도 없으면 null이다(18.2의 1~4번) */
export function hookMessage(state: { lastCheckupAt: string | null; notify: NotifySettings | null }, current: () => NotifyNames, nowMs: number): string | null {
  const notify = state.notify;
  if (notify === null || !notify.on) return null;
  const copy = HOOK_COPY[notify.lang];
  if (state.lastCheckupAt === null) return copy.prefix + copy.never;
  const days = Math.floor((nowMs - Date.parse(state.lastCheckupAt)) / DAY);
  if (days >= 7) return copy.prefix + fill(copy.days, { days });
  if (notify.names === null) return null;
  const known = new Set(notify.names);
  return current().names.some((name) => !known.has(name)) ? copy.prefix + copy.fresh : null;
}

const localDate = (nowMs: number): string => {
  const date = new Date(nowMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/**
 * 세션 시작 훅의 판단(18.2). 알릴 것이 있으면 오늘 표식(notified/<날짜>)을 없을 때만 만들고, 만든 훅만 systemMessage 한 줄의 JSON을 돌려준다.
 * 세션 여러 개가 동시에 떠도 한 번만 알린다. 어떤 오류도 밖으로 내지 않고 null이다
 */
export function sessionStart(env: Record<string, string | undefined>, homedir: string, nowMs: number): string | null {
  try {
    const stateDir = join(homedir, ".chunsik-garage");
    const state = JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8")) as { lastCheckupAt?: string | null; notify?: NotifySettings | null };
    const message = hookMessage({ lastCheckupAt: state.lastCheckupAt ?? null, notify: state.notify ?? null }, () => notifyNames(env, homedir), nowMs);
    if (message === null) return null;
    const dir = join(stateDir, "notified");
    mkdirSync(dir, { recursive: true });
    const today = localDate(nowMs);
    try {
      writeFileSync(join(dir, today), "", { flag: "wx" });
    } catch {
      return null;
    }
    // 7일이 지난 표식은 지운다
    const oldest = localDate(nowMs - KEEP_MARKERS_DAYS * DAY);
    for (const name of readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name < oldest) unlinkSync(join(dir, name));
    return JSON.stringify({ systemMessage: message });
  } catch {
    return null;
  }
}
