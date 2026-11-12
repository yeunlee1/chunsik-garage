// Claude Code 설정 층(사용자, 프로젝트, 로컬, 관리 정책)을 읽고 스캐너가 쓰는 열쇠만 뽑는다. 관리 정책은 파일과 드롭인 폴더만 읽는다(설계 10 「관리 정책은 파일로 둔 것만 읽는다」)
import { join } from "node:path";
import { listDir, readJson } from "./fs.ts";
import { canonicalJson, isObject } from "./json.ts";

export type LayerStatus = "ok" | "missing" | "unparsable" | "unreadable";

export interface SettingsPart {
  path: string;
  status: LayerStatus;
}

export interface SettingsLayer {
  /** 이 층을 이룬 파일들. 관리 정책은 managed-settings.json 다음에 드롭인 파일이 이름 차례로 온다 */
  parts: SettingsPart[];
  /** 합친 값. 읽은 파일이 하나도 없으면 null */
  value: Record<string, unknown> | null;
  /**
   * 파일마다의 hooks 값(그 열쇠가 있는 파일만, 층의 파일 차례). 도구는 훅을 출처(파일)마다 싣거나 버리므로 합친 값과 따로 둔다
   * (공식 문서 errors 「Managed settings contain invalid entries」, 설계 11.3). 메모리에서만 쓰고 결과에 싣지 않는다
   */
  hookSources: { path: string; hooks: unknown }[];
}

type Json = Record<string, unknown>;

/** 묶음을 열쇠마다 합치는 깊이의 상한. 그보다 깊으면 뒤의 값을 통째로 쓴다(깊은 재귀로 멈추지 않게) */
const MERGE_MAX_DEPTH = 32;

/** 관리 정책 파일이 놓이는 폴더(공식 문서 managed-settings, 설계 10). */
export function managedSettingsDir(platform: NodeJS.Platform): string {
  if (platform === "win32") return "C:\\Program Files\\ClaudeCode";
  if (platform === "darwin") return "/Library/Application Support/ClaudeCode";
  return "/etc/claude-code";
}

async function readPart(path: string): Promise<{ part: SettingsPart; value: Json | null }> {
  const read = await readJson(path);
  if (read.status !== "ok") return { part: { path, status: read.status }, value: null };
  if (!isObject(read.value)) return { part: { path, status: "unparsable" }, value: null };
  return { part: { path, status: "ok" }, value: read.value };
}

/** 설정 파일 하나로 된 층(사용자, 프로젝트, 로컬). */
export async function readLayer(path: string): Promise<SettingsLayer> {
  const { part, value } = await readPart(path);
  return { parts: [part], value, hookSources: value !== null && Object.hasOwn(value, "hooks") ? [{ path, hooks: value.hooks }] : [] };
}

/** 두 목록을 차례대로 합치고 중복을 뺀다. 같은지는 열쇠를 세운 JSON으로 본다(앞 목록 안, 뒤 목록 안, 둘 사이 모두). 너무 깊어 정규화하지 못한 항목은 견주지 않고 그대로 넣는다 */
function unionList(before: readonly unknown[], next: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of [...before, ...next]) {
    const key = canonicalJson(item);
    if (key === null) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * 드롭인 합치기 규칙(공식 문서): 값 하나는 뒤가 이기고, 목록은 합치고 중복을 빼며, 묶음은 열쇠마다 같은 규칙을 따른다.
 * 앞에 없던 열쇠의 목록과 새 하위 묶음도 같은 규칙으로 정리한다. 결과는 원형이 없는 묶음이고 열쇠는 모두 자기 데이터 속성이라,
 * __proto__ 같은 열쇠가 원형을 바꿔 다른 열쇠를 꾸며 내지 못한다.
 */
export function mergeSettings(base: Json, next: Json, depth = 0): Json {
  const out: Json = Object.create(null) as Json;
  for (const key of Object.keys(base)) out[key] = base[key];
  for (const [key, value] of Object.entries(next)) {
    const before = Object.hasOwn(out, key) ? out[key] : undefined;
    if (Array.isArray(value)) {
      out[key] = unionList(Array.isArray(before) ? before : [], value);
    } else if (isObject(value) && depth < MERGE_MAX_DEPTH) {
      out[key] = mergeSettings(isObject(before) ? before : {}, value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** 엄한 값이 하나인 참거짓 열쇠가 틀린 꼴일 때 읽는 값. "true"·"false" 글자는 그 참거짓이고, 그 밖은 엄한 값이다(공식 문서 managed-settings 「Keys that fail closed」) */
function failClosedBoolean(value: unknown, restrictive: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return restrictive;
}

/** skillOverrides의 값. 이 밖의 값은 정하지 않은 것으로 본다(공식 문서 settings-reference 「skillOverrides」) */
const SKILL_OVERRIDE_MODES = new Set(["on", "name-only", "user-invocable-only", "off"]);
const PERMISSION_LISTS = new Set(["allow", "deny", "ask"]);
/** 곁의 제한 목록(deny·ask)을 전혀 읽지 못하면 보류하는 허용 칸(공식 문서 managed-settings 「Keys that fail closed」) */
const PERMISSION_GRANTS = ["allow", "additionalDirectories"];
const MANAGED_LISTS = new Set(["deniedMcpServers", "enabledMcpjsonServers", "disabledMcpjsonServers"]);

/**
 * 관리 정책 파일 하나에서 스캐너가 읽는 열쇠의 틀린 값을 도구처럼 고친다. 도구는 관리 정책의 틀린 값을 버리거나 엄한 값으로 읽고 나머지를 지킨다
 * (공식 문서 managed-settings 「Find entries Claude Code dropped」). 고치지 않고 합치면 뒤 파일의 틀린 값이 앞 파일의 맞는 값을 덮는다.
 * null은 그 열쇠를 지운다. disableAllHooks는 틀리면(글자 참거짓도) 버리고, allowManagedHooksOnly(엄한 값 참)와 enableAllProjectMcpServers(엄한 값 거짓)는 틀리면 엄한 값이다.
 * permissions는 칸마다 고치고 defaultMode가 틀리면 default로 읽는다. allowedMcpServers가 틀리면 빈 허용 목록이다. enabledPlugins와 skillOverrides는 틀린 항목을 버리고, 다 틀리면 열쇠를 버린다.
 * 파일마다 고친 뒤 합치는 차례는 이 스캐너가 고른 것이다(문서는 차례를 적지 않았다, 설계 27)
 */
export function sanitizeManagedPart(value: Json): Json {
  const out: Json = Object.create(null) as Json;
  for (const [key, v] of Object.entries(value)) {
    if (v === null) continue;
    if (key === "disableAllHooks") {
      if (typeof v === "boolean") out[key] = v;
    } else if (key === "allowManagedHooksOnly") {
      out[key] = failClosedBoolean(v, true);
    } else if (key === "enableAllProjectMcpServers") {
      out[key] = failClosedBoolean(v, false);
    } else if (key === "permissions") {
      if (!isObject(v)) continue;
      const permissions: Json = Object.create(null) as Json;
      for (const [field, fv] of Object.entries(v)) {
        if (fv === null) continue;
        if (field === "defaultMode") permissions[field] = typeof fv === "string" ? fv : "default";
        else if (!PERMISSION_LISTS.has(field) || Array.isArray(fv)) permissions[field] = fv;
      }
      // deny나 ask를 전혀 읽지 못하면 allow와 additionalDirectories를 보류한다. 곁에 적힌 제한 없이 허용만 듣지 않게 하려는 도구의 규칙이다
      if (["deny", "ask"].some((field) => Object.hasOwn(v, field) && v[field] !== null && !Array.isArray(v[field]))) for (const grant of PERMISSION_GRANTS) delete permissions[grant];
      out[key] = permissions;
    } else if (key === "allowedMcpServers") {
      out[key] = Array.isArray(v) ? v : [];
    } else if (MANAGED_LISTS.has(key)) {
      if (Array.isArray(v)) out[key] = v;
    } else if (key === "enabledPlugins" || key === "skillOverrides") {
      if (!isObject(v)) continue;
      const kept = Object.entries(v).filter(([, entry]) => (key === "enabledPlugins" ? typeof entry === "boolean" : typeof entry === "string" && SKILL_OVERRIDE_MODES.has(entry)));
      if (kept.length > 0) out[key] = Object.fromEntries(kept);
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** 관리 정책 층. managed-settings.json을 먼저, 그 옆 managed-settings.d의 숨기지 않은 .json을 이름 차례로 합친다. 파일마다 틀린 값을 고친 뒤 합친다 */
export async function readManagedLayer(dir: string): Promise<SettingsLayer> {
  const parts: SettingsPart[] = [];
  const hookSources: SettingsLayer["hookSources"] = [];
  let merged: Json | null = null;
  const take = async (path: string): Promise<void> => {
    const { part, value } = await readPart(path);
    if (part.status === "missing") return;
    parts.push(part);
    if (value !== null) merged = mergeSettings(merged ?? {}, sanitizeManagedPart(value));
    // null은 그 열쇠를 지우므로 그 파일은 훅의 출처가 아니다
    if (value !== null && Object.hasOwn(value, "hooks") && value.hooks !== null) hookSources.push({ path, hooks: value.hooks });
  };
  await take(join(dir, "managed-settings.json"));
  const dropIns = await listDir(join(dir, "managed-settings.d"));
  if (dropIns.status === "ok") {
    for (const name of dropIns.names) if (!name.startsWith(".") && name.toLowerCase().endsWith(".json")) await take(join(dir, "managed-settings.d", name));
  } else if (dropIns.status === "unreadable") {
    parts.push({ path: join(dir, "managed-settings.d"), status: "unreadable" });
  }
  return { parts, value: merged, hookSources };
}

export interface McpMatcher {
  serverName?: string;
  serverUrl?: string;
  serverCommand?: string[];
}

/** 기본 모드의 값. 권한 우회(bypassPermissions)인지, 그 밖의 값인지, 이 층이 정하지 않았는지(null)다 */
export type ModeFact = "bypass" | "other" | null;

/** 스캐너가 쓰는 열쇠만 뽑은 설정. hooks는 메모리에서만 쓰고 결과에 싣지 않는다. */
export interface SettingsView {
  /** permissions.defaultMode. 문자열이 아니면 정하지 않은 것(null)으로 본다 */
  defaultMode: ModeFact;
  bypass: boolean;
  allow: string[];
  deny: string[];
  skillOverrides: Record<string, string>;
  enabledPlugins: Record<string, boolean>;
  deniedMcpServers: McpMatcher[];
  /** 관리 정책의 허용 목록. 없으면 null(제한 없음) */
  allowedMcpServers: McpMatcher[] | null;
  enabledMcpjsonServers: string[];
  disabledMcpjsonServers: string[];
  /** 프로젝트 .mcp.json의 서버를 모두 승인하는지. 이 층이 정하지 않았으면 null이다(층의 우선순위로 고르려고 정하지 않은 것과 거짓을 가른다) */
  enableAllProjectMcpServers: boolean | null;
  hooks: unknown;
  disableAllHooks: boolean;
  allowManagedHooksOnly: boolean;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function matchers(v: unknown): McpMatcher[] {
  if (!Array.isArray(v)) return [];
  const out: McpMatcher[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const m: McpMatcher = {};
    if (typeof item.serverName === "string") m.serverName = item.serverName;
    if (typeof item.serverUrl === "string") m.serverUrl = item.serverUrl;
    if (Array.isArray(item.serverCommand) && item.serverCommand.every((x) => typeof x === "string")) m.serverCommand = [...(item.serverCommand as string[])];
    if (Object.keys(m).length > 0) out.push(m);
  }
  return out;
}

export function viewOf(value: Record<string, unknown> | null): SettingsView {
  const v = value ?? {};
  const permissions = isObject(v.permissions) ? v.permissions : {};
  const overrides: Record<string, string> = Object.create(null) as Record<string, string>;
  if (isObject(v.skillOverrides)) for (const [name, mode] of Object.entries(v.skillOverrides)) if (typeof mode === "string" && SKILL_OVERRIDE_MODES.has(mode)) overrides[name] = mode;
  const plugins: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
  if (isObject(v.enabledPlugins)) for (const [id, on] of Object.entries(v.enabledPlugins)) if (typeof on === "boolean") plugins[id] = on;
  const mode = permissions.defaultMode;
  const defaultMode: ModeFact = typeof mode !== "string" ? null : mode === "bypassPermissions" ? "bypass" : "other";
  return {
    defaultMode,
    bypass: defaultMode === "bypass",
    allow: strings(permissions.allow),
    deny: strings(permissions.deny),
    skillOverrides: overrides,
    enabledPlugins: plugins,
    deniedMcpServers: matchers(v.deniedMcpServers),
    allowedMcpServers: Array.isArray(v.allowedMcpServers) ? matchers(v.allowedMcpServers) : null,
    enabledMcpjsonServers: strings(v.enabledMcpjsonServers),
    disabledMcpjsonServers: strings(v.disabledMcpjsonServers),
    enableAllProjectMcpServers: typeof v.enableAllProjectMcpServers === "boolean" ? v.enableAllProjectMcpServers : null,
    hooks: v.hooks,
    disableAllHooks: v.disableAllHooks === true,
    allowManagedHooksOnly: v.allowManagedHooksOnly === true,
  };
}

/** 층의 파일 가운데 풀리지 않은 것(S3). 읽지 못한 것은 넣지 않는다(읽지 못한 것은 깨졌다고 할 수 없다). */
export function unparsableParts(layer: SettingsLayer): string[] {
  return layer.parts.filter((part) => part.status === "unparsable").map((part) => part.path);
}
