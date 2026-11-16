// 정비 후보를 계획 항목(바꿀 파일, 자리, 지금 값, 바꿀 값, 영향 범위, 자동으로 고칠 수 없는 까닭)으로 바꾸고, 바꿀 파일을 읽기만 한다(설계 16.1, 16.3, 16.5의 1번, 「6단계 1부 계획 전 결정」 4·7번)
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Candidate } from "../core/installs/candidates.ts";
import type { JudgedServer } from "../core/installs/servers.ts";
import type { SkillBundle } from "../core/installs/skills.ts";
import { isTable, parseCodexConfig } from "../scan/codex-config.ts";
import { isObject } from "../scan/json.ts";
import { SKILL_OVERRIDE_MODES } from "../scan/settings.ts";

/** 바꾸는 자리. JSON 묶음 안의 열쇠, JSON 목록에 더하는 항목, Codex 서버 표(mcp_servers.<table>) 안의 열쇠다 */
export type TuneKey =
  | { kind: "json-entry"; parent: "skillOverrides" | "enabledPlugins"; name: string }
  | { kind: "json-list-add"; parent: "deniedMcpServers"; entry: { serverName: string } }
  | { kind: "toml-table-key"; table: string; key: "enabled" };

/** 영향 범위. 문장은 문구가 짓는다 */
export type TuneImpact =
  | { unit: "A1"; skills: { user: number; project: number; plugin: number } }
  | { unit: "A2"; skills: number }
  | { unit: "A3"; sameName: { local: number; project: number; claudeAi: number } }
  | { unit: "A4"; projects: number };

/** 자동으로 고칠 수 없는 까닭(16.3 검사표의 앞 두 줄과 16.2 끝의 버전). value-shape는 지금 값이 그 단위가 받는 꼴이 아닌 것이고, 그 값은 계획에 싣지 않는다 */
export type TuneBlock = "unverified-version" | "file-missing" | "file-unreadable" | "not-regular" | "byte-order-mark" | "not-json-object" | "parent-shape" | "value-shape" | "not-toml" | "table-shape";

export interface TuneItem {
  id: string;
  unit: Candidate["unit"];
  rule: Candidate["rule"];
  tool: Candidate["tool"];
  target: string;
  /** 바꿀 파일의 절대 경로 */
  file: string;
  layer: "user";
  key: TuneKey;
  /** 지금 값. 그 자리에 값이 없으면 이 칸이 없다(목록에 더하는 것은 늘 없다) */
  current?: unknown;
  next: string | boolean | { serverName: string };
  impact: TuneImpact;
  blocked: TuneBlock | null;
}

/** 계획 항목을 짓는 데 쓰는 것. 묶음은 스킬 판정의 묶음, 서버는 서버 판정의 서버다(위치와 사실만 본다) */
export interface ItemContext {
  /** 그 도구의 설정 홈(Claude Code는 설정 폴더, Codex는 Codex 홈) */
  home: string;
  bundles: readonly Pick<SkillBundle, "positions">[];
  servers: readonly Pick<JudgedServer, "server">[];
  /** 그 도구의 버전이 정비가 바꾸는 열쇠의 뜻을 확인한 범위 안이다(7번) */
  versionOk: boolean;
}

/**
 * 바꿀 파일을 읽은 것. 바이트는 원본 그대로이고(바이트 순서 표시도 남긴다), regular는 파일과 그 폴더가 링크가 아닌 보통 파일과 보통 폴더라는 것이다.
 * 파일이 없으면 folder가 그 폴더가 링크가 아닌 보통 폴더인지다. 그러면 JSON 설정은 새로 만들 수 있다(「6단계 2부 계획 전 결정」 4번)
 */
export type TargetRead = { status: "ok"; bytes: Buffer; regular: boolean } | { status: "missing"; folder: boolean } | { status: "unreadable" };

export const fingerprintOf = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** 바꿀 파일. 사용자 층의 설정이다 */
export function targetPath(candidate: Candidate, home: string): string {
  return join(home, candidate.unit === "A4" ? "config.toml" : "settings.json");
}

/** 바꿀 파일을 읽기만 한다. 임시 파일에 쓰고 이름을 바꾸면 링크가 보통 파일로 바뀔 수 있어 링크인지 함께 본다(16.3) */
export async function readTarget(path: string): Promise<TargetRead> {
  const folder = await lstat(dirname(path)).then(
    (info) => info.isDirectory(),
    () => false,
  );
  let file;
  try {
    file = await lstat(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return code === "ENOENT" || code === "ENOTDIR" ? { status: "missing", folder } : { status: "unreadable" };
  }
  try {
    return { status: "ok", bytes: await readFile(path), regular: file.isFile() && folder };
  } catch {
    return { status: "unreadable" };
  }
}

const hasBom = (bytes: Buffer): boolean => bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

interface State {
  present: boolean;
  value?: unknown;
  blocked: TuneBlock | null;
}

/** JSON 설정에서 그 자리의 지금 값과 고칠 수 있는 모양인지. 표준 JSON.parse는 주석을 받지 않는다 */
function jsonState(bytes: Buffer, key: Extract<TuneKey, { kind: "json-entry" | "json-list-add" }>): State {
  if (hasBom(bytes)) return { present: false, blocked: "byte-order-mark" };
  let doc: unknown;
  try {
    doc = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { present: false, blocked: "not-json-object" };
  }
  if (!isObject(doc)) return { present: false, blocked: "not-json-object" };
  const parent = doc[key.parent];
  if (parent === undefined) return { present: false, blocked: null };
  if (key.kind === "json-list-add") return { present: false, blocked: Array.isArray(parent) ? null : "parent-shape" };
  if (!isObject(parent)) return { present: false, blocked: "parent-shape" };
  if (!Object.hasOwn(parent, key.name)) return { present: false, blocked: null };
  // 지금 값은 그 단위가 받는 꼴(스킬 끄기는 네 모드의 글, 플러그인 끄기는 참거짓)일 때만 싣는다. 그 밖의 값은 설정의 다른 값일 수 있어 싣지 않고 고치지 않는다(16.3, 16.5의 2번)
  const value = parent[key.name];
  const ok = key.parent === "skillOverrides" ? typeof value === "string" && SKILL_OVERRIDE_MODES.has(value) : typeof value === "boolean";
  return ok ? { present: true, value, blocked: null } : { present: false, blocked: "value-shape" };
}

/** TOML 열쇠 한 조각(맨 열쇠, 큰따옴표 문자열, 작은따옴표 문자열)을 풀어 낸다. 풀지 못하면 null */
function keyPart(text: string): string | null {
  const part = text.trim();
  if (/^[A-Za-z0-9_-]+$/.test(part)) return part;
  if (/^'[^']*'$/.test(part)) return part.slice(1, -1);
  if (/^"(?:[^"\\]|\\.)*"$/.test(part)) {
    // 큰따옴표 조각은 문서를 읽는 해석기로 푼다. JSON으로 풀면 TOML의 8자리 이스케이프(\U)와 따옴표 안의 탭을 받지 않아 정상 표를 놓쳤다(6단계 1부 구현 검증)
    const table = parseCodexConfig(`${part} = 0`);
    const names = table === null ? [] : Object.keys(table);
    return names.length === 1 ? names[0]! : null;
  }
  return null;
}

/** 점으로 이은 TOML 열쇠를 조각들로 나눈다. 따옴표 안의 점은 나누지 않는다 */
export function splitDotted(text: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quote !== null) {
      current += char;
      if (char === "\\" && quote === '"') current += text[++i] ?? "";
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ".") {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (quote !== null) return null;
  parts.push(current);
  const keys = parts.map(keyPart);
  return keys.every((key) => key !== null) ? (keys as string[]) : null;
}

/** 여러 줄 문자열 안이면 그 구분자, 밖이면 null */
export type Multiline = '"""' | "'''" | null;

/**
 * 문자열 밖에서 시작하는 줄이 표 머리([...])면 그 안의 열쇠 글을 낸다. 따옴표 이름 안의 ]와 #는 건너뛰고, 문자열 밖의 첫 ]에서 머리를 닫는다.
 * 그 뒤에는 공백과 주석만 올 수 있다(주석 안의 대괄호도 그렇다). 표 머리가 아니면 null이다(배열 표 [[...]]도 아니다)
 */
export function headerKey(line: string): string | null {
  const start = line.search(/\S/);
  if (start < 0 || line[start] !== "[" || line[start + 1] === "[") return null;
  let i = start + 1;
  while (i < line.length) {
    const char = line[i]!;
    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== char) j += char === '"' && line[j] === "\\" ? 2 : 1;
      if (j >= line.length) return null;
      i = j + 1;
      continue;
    }
    if (char === "]") return /^\s*(?:#.*)?$/.test(line.slice(i + 1)) ? line.slice(start + 1, i) : null;
    i++;
  }
  return null;
}

/** 한 줄을 TOML 규칙대로 훑어 줄 끝의 상태(여러 줄 문자열 안인지)를 낸다. 주석과 한 줄 문자열은 건너뛴다. 한 줄 문자열이 그 줄에서 닫히지 않으면 undefined다(규칙에 맞지 않는다) */
export function scanLine(line: string, start: Multiline): Multiline | undefined {
  let state = start;
  let i = 0;
  while (i < line.length) {
    if (state !== null) {
      // 여러 줄 기본 문자열은 \ 뒤의 글자를 건너뛴다. 끝 구분자 뒤에 같은 따옴표가 두 개까지 더 붙을 수 있다(그것은 내용이다)
      if (state === '"""' && line[i] === "\\") {
        i += 2;
        continue;
      }
      if (line.startsWith(state, i)) {
        let end = i + 3;
        while (end < line.length && end - i < 5 && line[end] === state[0]) end++;
        state = null;
        i = end;
      } else i++;
      continue;
    }
    if (line[i] === "#") return null;
    const triple = line.startsWith('"""', i) ? '"""' : line.startsWith("'''", i) ? "'''" : null;
    if (triple !== null) {
      state = triple;
      i += 3;
      continue;
    }
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i]!;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) j += quote === '"' && line[j] === "\\" ? 2 : 1;
      if (j >= line.length) return undefined;
      i = j + 1;
      continue;
    }
    i++;
  }
  return state;
}

/**
 * 그 서버의 표 머리([mcp_servers.<이름>])가 몇 번 나오는지. 주석과 문자열(한 줄·여러 줄, 기본·리터럴)을 TOML 규칙대로 건너뛰고, 문자열 밖에서 시작하는 줄만 표 머리로 본다.
 * 규칙에 맞지 않는 곳이 있거나 문서가 여러 줄 문자열 안에서 끝나면 -1이다(그 표는 고치지 않는다, 6단계 1부 계획 리뷰 1차)
 */
export function tableHeaderCount(text: string, server: string): number {
  let count = 0;
  let state: Multiline = null;
  for (const line of text.split(/\r?\n/)) {
    if (state === null) {
      const key = headerKey(line);
      const keys = key === null ? null : splitDotted(key);
      if (keys !== null && keys.length === 2 && keys[0] === "mcp_servers" && keys[1] === server) count++;
    }
    const next = scanLine(line, state);
    if (next === undefined) return -1;
    state = next;
  }
  return state === null ? count : -1;
}

/** Codex 설정에서 그 서버 표의 enabled 지금 값과 고칠 수 있는 모양인지. 표가 머리 하나로 여러 줄에 적혀 있어야 한다(16.3) */
function tomlState(bytes: Buffer, server: string): State {
  if (hasBom(bytes)) return { present: false, blocked: "byte-order-mark" };
  const text = bytes.toString("utf8");
  const doc = parseCodexConfig(text);
  if (doc === null) return { present: false, blocked: "not-toml" };
  const servers = doc.mcp_servers;
  const table = isTable(servers) ? servers[server] : undefined;
  if (!isTable(table) || tableHeaderCount(text, server) !== 1) return { present: false, blocked: "table-shape" };
  if (!Object.hasOwn(table, "enabled")) return { present: false, blocked: null };
  // 지금 값은 참거짓일 때만 싣는다
  return typeof table.enabled === "boolean" ? { present: true, value: table.enabled, blocked: null } : { present: false, blocked: "value-shape" };
}

function keyOf(candidate: Candidate): TuneKey {
  switch (candidate.unit) {
    case "A1":
      return { kind: "json-entry", parent: "skillOverrides", name: candidate.target };
    case "A2":
      return { kind: "json-entry", parent: "enabledPlugins", name: candidate.target };
    case "A3":
      return { kind: "json-list-add", parent: "deniedMcpServers", entry: { serverName: candidate.target } };
    case "A4":
      return { kind: "toml-table-key", table: candidate.target, key: "enabled" };
  }
}

function nextOf(candidate: Candidate): TuneItem["next"] {
  switch (candidate.unit) {
    case "A1":
      return "off";
    case "A2":
    case "A4":
      return false;
    case "A3":
      return { serverName: candidate.target };
  }
}

function impactOf(candidate: Candidate, context: ItemContext): TuneImpact {
  const { target } = candidate;
  switch (candidate.unit) {
    case "A1": {
      // 설정은 스킬의 폴더 이름과 머리말 이름 어느 쪽으로도 듣는다. 그 이름 꼴을 가진 위치가 있는 묶음의 위치를 모두 센다(후보 조건과 같은 넓이)
      const skills = { user: 0, project: 0, plugin: 0 };
      for (const bundle of context.bundles) if (bundle.positions.some((position) => position.recordNames.includes(target))) for (const position of bundle.positions) skills[position.scope]++;
      return { unit: "A1", skills };
    }
    case "A2":
      return { unit: "A2", skills: context.bundles.filter((bundle) => bundle.positions.some((position) => position.pluginId === target)).length };
    case "A3": {
      const sameName = { local: 0, project: 0, claudeAi: 0 };
      for (const { server } of context.servers) {
        if (server.name !== target || !server.enabled) continue;
        if (server.scope === "local") sameName.local++;
        else if (server.scope === "project") sameName.project++;
        else if (server.scope === "claude-ai") sameName.claudeAi++;
      }
      return { unit: "A3", sameName };
    }
    case "A4":
      return { unit: "A4", projects: context.servers.filter(({ server }) => server.name === target && server.enabled && server.scope === "project").length };
  }
}

/** 파일의 상태와 모양으로 본 그 자리의 지금 값과 고칠 수 없는 까닭. 없는 JSON 설정은 그 폴더가 보통 폴더면 새로 만들 수 있다(2부 결정 4번) */
function stateOf(read: TargetRead, key: TuneKey): State {
  if (read.status === "missing") return key.kind !== "toml-table-key" && read.folder ? { present: false, blocked: null } : { present: false, blocked: "file-missing" };
  if (read.status === "unreadable") return { present: false, blocked: "file-unreadable" };
  if (!read.regular) return { present: false, blocked: "not-regular" };
  return key.kind === "toml-table-key" ? tomlState(read.bytes, key.table) : jsonState(read.bytes, key);
}

/** 그 자리를 지금 바이트로 고칠 수 있는지(16.3 검사표의 앞 두 줄). 적용과 되돌리기가 바꾸기 바로 앞에서 다시 본다 */
export function blockOf(read: TargetRead, key: TuneKey): TuneBlock | null {
  return stateOf(read, key).blocked;
}

/** 그 자리의 지금 상태. 목록에 더하는 것은 이 도구가 더하는 항목이 목록에 있는지다 */
export type Slot = { present: false } | { present: true; value?: unknown };

/** 두 자리 상태가 같은지 */
export const sameSlot = (a: Slot, b: Slot): boolean => a.present === b.present && isDeepStrictEqual(a.present ? a.value : undefined, b.present ? b.value : undefined);

/** 그 자리의 지금 상태를 읽는다. 파일이 없으면 없음이고, 읽지 못했거나 풀리지 않거나 부모의 꼴이 다르면 null이다(끊긴 작업 맞추기, 되돌리기, 확인이 쓴다) */
export function slotOf(read: TargetRead, key: TuneKey): Slot | null {
  if (read.status === "unreadable") return null;
  if (read.status === "missing") return { present: false };
  if (hasBom(read.bytes)) return null;
  const text = read.bytes.toString("utf8");
  if (key.kind === "toml-table-key") {
    const servers = parseCodexConfig(text)?.mcp_servers;
    const table = isTable(servers) ? servers[key.table] : undefined;
    if (!isTable(table)) return null;
    return Object.hasOwn(table, "enabled") ? { present: true, value: table.enabled } : { present: false };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(doc)) return null;
  if (!Object.hasOwn(doc, key.parent)) return { present: false };
  const parent = doc[key.parent];
  if (key.kind === "json-list-add") {
    if (!Array.isArray(parent)) return null;
    return parent.some((item) => isDeepStrictEqual(item, key.entry)) ? { present: true } : { present: false };
  }
  if (!isObject(parent)) return null;
  return Object.hasOwn(parent, key.name) ? { present: true, value: parent[key.name] } : { present: false };
}

/** 후보 하나를 계획 항목 하나로 바꾼다. 고칠 수 없는 까닭은 버전, 파일의 상태, 모양의 차례로 본다 */
export function tuneItem(candidate: Candidate, context: ItemContext, read: TargetRead): TuneItem {
  const key = keyOf(candidate);
  const state: State = context.versionOk ? stateOf(read, key) : { present: false, blocked: "unverified-version" };
  return {
    id: candidate.id,
    unit: candidate.unit,
    rule: candidate.rule,
    tool: candidate.tool,
    target: candidate.target,
    file: targetPath(candidate, context.home),
    layer: "user",
    key,
    ...(state.present ? { current: state.value } : {}),
    next: nextOf(candidate),
    impact: impactOf(candidate, context),
    blocked: state.blocked,
  };
}
