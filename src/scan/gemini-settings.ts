// 제미나이 CLI 설정(settings.json)을 읽고 안전 설정, 지침 파일 이름, MCP 서버 거르개를 꺼낸다. 설정은 주석을 허용하는 JSON이다(공개 소스 v0.68.0의 cli/src/config/settings.ts·settingsSchema.ts, 설계 「0.4.0에서 정한 것」)
import { dirname, posix, win32 } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { readText } from "./fs.ts";
import { isObject } from "./json.ts";
import type { FileStatus, GeminiSafetyFact } from "./types.ts";

type Json = Record<string, unknown>;

const QUOTE = 34;
const BACKSLASH = 92;
const SLASH = 47;
const STAR = 42;
const NEWLINE = 10;

/** JSON 글에서 문자열 밖의 // 줄 주석과 /* 덩어리 주석을 뗀다(제미나이 CLI가 쓰는 strip-json-comments와 같은 뜻). 떼어 낸 자리는 빈칸으로 둔다 */
export function stripJsonComments(text: string): string {
  let out = "";
  let index = 0;
  let inString = false;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (inString) {
      out += text[index];
      if (code === BACKSLASH && index + 1 < text.length) {
        out += text[index + 1];
        index += 2;
        continue;
      }
      if (code === QUOTE) inString = false;
      index++;
      continue;
    }
    if (code === QUOTE) {
      inString = true;
      out += text[index];
      index++;
      continue;
    }
    if (code === SLASH && text.charCodeAt(index + 1) === SLASH) {
      while (index < text.length && text.charCodeAt(index) !== NEWLINE) index++;
      continue;
    }
    if (code === SLASH && text.charCodeAt(index + 1) === STAR) {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
      out += " ";
      continue;
    }
    out += text[index];
    index++;
  }
  return out;
}

/** 설정 파일 하나. 없으면 missing, 주석을 떼도 JSON 객체가 아니면 unparsable이다 */
export async function readGeminiSettings(path: string): Promise<{ status: FileStatus; value: Json }> {
  const read = await readText(path);
  if (read.status !== "ok") return { status: read.status, value: {} };
  try {
    const value: unknown = JSON.parse(stripJsonComments(read.text));
    return isObject(value) ? { status: "ok", value } : { status: "unparsable", value: {} };
  } catch {
    return { status: "unparsable", value: {} };
  }
}

const section = (settings: Json, key: string): Json => (isObject(settings[key]) ? settings[key] : {});
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/**
 * 지침 파일 이름(context.fileName, 문자열이나 목록). 뒤의 층이 정한 이름을 기본 GEMINI.md 앞에 더한다. 이름을 정해도 GEMINI.md는 그대로 읽는다
 * (공개 소스 tools/memoryTool.ts의 setGeminiMdFilename, cli/src/config/config.ts)
 */
export function contextFileNames(layers: readonly Json[]): string[] {
  let names: string[] = [];
  for (const layer of layers) {
    const value = section(layer, "context").fileName;
    if (typeof value === "string" && value.trim() !== "") names = [value.trim()];
    else if (Array.isArray(value)) {
      const list = strings(value)
        .map((name) => name.trim())
        .filter((name) => name !== "");
      if (list.length > 0) names = list;
    }
  }
  return [...new Set([...names, "GEMINI.md"])];
}

/** 지침의 가져오기 경계를 찾는 표지(context.memoryBoundaryMarkers). 목록을 적은 마지막 층의 것이고 기본은 .git이다. 빈 목록이면 위로 찾지 않는다 */
export function boundaryMarkersOf(layers: readonly Json[]): string[] {
  let markers = [".git"];
  for (const layer of layers) {
    const value = section(layer, "context").memoryBoundaryMarkers;
    if (Array.isArray(value)) markers = strings(value);
  }
  return markers;
}

/** 작업 폴더 신뢰 기능(security.folderTrust.enabled)이 켜져 있는지. 기본은 켜짐이고 뒤의 층이 이긴다. 꺼져 있으면 모든 작업 폴더를 신뢰한다(공개 소스 cli/src/config/trustedFolders.ts) */
export function folderTrustOn(layers: readonly Json[]): boolean {
  let on = true;
  for (const layer of layers) {
    const value = section(section(layer, "security"), "folderTrust").enabled;
    if (typeof value === "boolean") on = value;
  }
  return on;
}

const TRUST_LEVELS: ReadonlySet<string> = new Set(["TRUST_FOLDER", "TRUST_PARENT", "DO_NOT_TRUST"]);

/** 신뢰 규칙 파일(trustedFolders.json)의 값이 모두 신뢰 단계인지. 아니면 제미나이가 시작하지 못한다 */
export function trustRulesValid(rules: Json): boolean {
  return Object.values(rules).every((value) => typeof value === "string" && TRUST_LEVELS.has(value));
}

/** 신뢰 규칙마다의 폴더(TRUST_PARENT는 그 부모 폴더). 견주기 전에 실제 경로를 풀 때 쓴다 */
export function trustRuleBases(rules: Json): string[] {
  return Object.entries(rules)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && TRUST_LEVELS.has(entry[1]))
    .map(([rulePath, value]) => (value === "TRUST_PARENT" ? dirname(rulePath) : rulePath));
}

/**
 * 신뢰 규칙으로 본 폴더의 신뢰. 규칙의 폴더(TRUST_PARENT는 그 부모 폴더) 안에 드는 규칙 가운데 경로가 가장 긴 것이 정한다. 맞는 규칙이 없으면 null이고, 제미나이는 그 폴더를 신뢰하지 않는다
 * (공개 소스 utils/trust.ts의 isPathTrusted, config/config.ts의 isTrustedFolder). 제미나이는 두 쪽 모두 연결을 푼 실제 경로로 견주므로, root는 실제 경로로 주고
 * realOf로 규칙 폴더의 실제 경로를 준다. 경로는 Windows와 macOS에서 대소문자를 가리지 않는다
 */
export function geminiTrustOf(rules: Json, root: string, platform: NodeJS.Platform = process.platform, realOf: (base: string) => string = (base) => base): "trusted" | "untrusted" | null {
  const norm = (path: string): string => (platform === "darwin" ? normalizePath(path, platform).toLowerCase() : normalizePath(path, platform));
  const target = norm(root);
  let longest = -1;
  let level: string | null = null;
  for (const [rulePath, value] of Object.entries(rules)) {
    if (typeof value !== "string" || !TRUST_LEVELS.has(value)) continue;
    const base = norm(realOf(value === "TRUST_PARENT" ? dirname(rulePath) : rulePath));
    const inside = target === base || target.startsWith(base.endsWith("/") ? base : `${base}/`);
    if (inside && rulePath.length > longest) {
      longest = rulePath.length;
      level = value;
    }
  }
  return level === null ? null : level === "DO_NOT_TRUST" ? "untrusted" : "trusted";
}

/**
 * 시스템 설정 파일의 자리. 시스템 설정(settings.json)은 모든 층 위에서 덮어쓰고, 시스템 기본값(system-defaults.json)은 사용자 층 아래에 깔린다.
 * GEMINI_CLI_SYSTEM_SETTINGS_PATH, GEMINI_CLI_SYSTEM_DEFAULTS_PATH가 있으면 그 자리다(공개 소스 cli/src/config/settings.ts의 getSystemSettingsPath, getSystemDefaultsPath)
 */
export function geminiSystemPaths(env: Record<string, string | undefined>, platform: NodeJS.Platform): { settings: string; defaults: string } {
  const fixed = platform === "darwin" ? "/Library/Application Support/GeminiCli/settings.json" : platform === "win32" ? "C:\\ProgramData\\gemini-cli\\settings.json" : "/etc/gemini-cli/settings.json";
  const settings = env.GEMINI_CLI_SYSTEM_SETTINGS_PATH?.trim() || fixed;
  const defaults = env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH?.trim() || (platform === "win32" ? win32 : posix).join((platform === "win32" ? win32 : posix).dirname(settings), "system-defaults.json");
  return { settings, defaults };
}

/** 셸 도구의 이름. tools.allowed에 인자 없이 들면 셸 명령이 확인 창 없이 돈다(인자가 붙은 것은 그 명령만 건너뛴다) */
const SHELL_NAMES: ReadonlySet<string> = new Set(["run_shell_command", "ShellTool"]);

/**
 * 합친 tools.sandbox 값이 샌드박스를 켜는지. 참·거짓은 그대로, 글은 false·0·빈 글이면 끔이고 그 밖(true, 1, 명령 이름)은 켬이다.
 * 설정 묶음은 enabled가 참일 때만 켬이다(공개 소스 cli/src/config/sandboxConfig.ts의 loadSandboxConfig, getSandboxCommand)
 */
function sandboxOn(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    return !(text === "" || text === "0" || text === "false");
  }
  if (isObject(value)) return Boolean(value.enabled);
  return false;
}

/**
 * 층들(시스템 기본값, 사용자, 신뢰한 프로젝트, 시스템 설정의 차례)의 안전 설정. 제미나이의 층 합치기를 따른다(공개 소스 cli/src/utils/deepMerge.ts).
 * 승인 방식과 도구 샌드박스(security.toolSandboxing)는 뒤의 층이 정한 값이다. tools.sandbox는 묶음끼리는 칸을 합치고 그 밖에는 뒤의 값으로 바꾼다.
 * tools.allowed는 합치는 방식이 없는 목록이라 그 칸을 적은 마지막 층의 목록이 정한다. 도구 샌드박스가 켜져 있으면 tools.sandbox가 없어도 샌드박스가 있다(core/src/config/config.ts)
 */
export function geminiSafetyOf(layers: readonly Json[]): GeminiSafetyFact {
  let approvalMode = "default";
  let box: unknown = undefined;
  let toolSandboxing = false;
  let allowed: string[] = [];
  for (const layer of layers) {
    const mode = section(layer, "general").defaultApprovalMode;
    if (typeof mode === "string" && mode !== "") approvalMode = mode;
    const tools = section(layer, "tools");
    if (Object.hasOwn(tools, "sandbox")) box = isObject(box) && isObject(tools.sandbox) ? { ...box, ...tools.sandbox } : tools.sandbox;
    if (Object.hasOwn(tools, "allowed")) allowed = strings(tools.allowed);
    const toolLevel = section(layer, "security").toolSandboxing;
    if (typeof toolLevel === "boolean") toolSandboxing = toolLevel;
  }
  // 인자가 붙은 허용(run_shell_command(git) 같은 것)은 그 명령만 묻지 않으므로 통째로 허용한 것이 아니다
  const shellAutoApproved = allowed.some((name) => SHELL_NAMES.has(name.trim()));
  return { approvalMode, sandbox: sandboxOn(box) || toolSandboxing, shellAutoApproved };
}

/** 읽지 못한 층의 안전 설정(모두 모름) */
export function unknownGeminiSafety(): GeminiSafetyFact {
  return { approvalMode: null, sandbox: null, shellAutoApproved: null };
}

/** MCP 서버 거르개(mcp.allowed, mcp.excluded). allowed가 있으면 그 이름만 켜지고, excluded의 이름은 꺼진다. 뒤의 층이 정한 목록이 이긴다 */
export function mcpFilterOf(layers: readonly Json[]): { allowed: string[] | null; excluded: string[] } {
  let allowed: string[] | null = null;
  let excluded: string[] = [];
  for (const layer of layers) {
    const mcp = section(layer, "mcp");
    if (Array.isArray(mcp.allowed)) allowed = strings(mcp.allowed);
    if (Array.isArray(mcp.excluded)) excluded = strings(mcp.excluded);
  }
  return { allowed, excluded };
}

/** 층의 MCP 서버 정의(mcpServers) */
export function serversOfLayer(layer: Json): Json {
  return section(layer, "mcpServers");
}
