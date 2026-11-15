// Codex 설정 파일(TOML)을 읽어 묶음으로 푼다. 스캐너가 읽는 자리의 값의 종류와 MCP 서버의 전송 꼴이 Codex가 시작하지 못하는 꼴이면 풀리지 않는 것으로 보고, 층을 Codex와 같이 합치며, 지문용으로 TOML 값을 JSON 꼴로 바꾼다. 값은 메모리에서만 쓴다(설계 10, 「5단계 2부 계획 전 결정」 1·3·7번)
import { parse } from "smol-toml";
import { readText } from "./fs.ts";
import { isObject } from "./json.ts";

export type TomlTable = Record<string, unknown>;
export type CodexConfigRead = { status: "ok"; value: TomlTable } | { status: "missing" } | { status: "unparsable" } | { status: "unreadable" };

/** TOML의 묶음(표)인지. 해석기는 날짜와 시각도 객체(Date)로 주므로 뺀다 */
export const isTable = (value: unknown): value is TomlTable => isObject(value) && !(value instanceof Date);
const isBool = (value: unknown): boolean => typeof value === "boolean";
const isText = (value: unknown): boolean => typeof value === "string";
/** 없거나(플러그인의 JSON 선언에서는 null도 없는 것이다) 맞는 종류다. TOML에는 null이 없다 */
const optional = (value: unknown, check: (value: unknown) => boolean): boolean => value === undefined || value === null || check(value);
const tableOf = (value: unknown, each: (value: unknown) => boolean): boolean => isTable(value) && Object.values(value).every(each);
const isNonNegativeInteger = (value: unknown): boolean => (typeof value === "number" && Number.isInteger(value) && value >= 0) || (typeof value === "bigint" && value >= 0n);

/**
 * 묶음과 목록이 이보다 많이 겹친 TOML 설정은 풀리지 않는 것으로 본다. 뒤의 재귀(층 합치기, 지문)가 스택을 넘기지 않게 하려는 것이고, Codex의 TOML 해석기가 받는 깊이는
 * 확인하지 못했다(설계 27절). 플러그인의 JSON 파일은 Codex의 JSON 해석기에 맞춘 한도를 따로 쓴다(codex-plugins.ts)
 */
export const MAX_CONFIG_DEPTH = 128;
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;

/** 묶음과 목록이 maxDepth단보다 깊게 중첩됐거나, TOML의 정수 범위(64비트 부호 있는 정수)를 넘는 정수가 있다. 깊은 값에서도 스택을 쓰지 않게 되풀이로 본다 */
export function exceedsLimits(value: unknown, maxDepth: number = MAX_CONFIG_DEPTH): boolean {
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [item, depth] = stack.pop()!;
    if (typeof item === "bigint") {
      if (item < I64_MIN || item > I64_MAX) return true;
      continue;
    }
    const children = Array.isArray(item) ? item : isTable(item) ? Object.values(item) : null;
    if (children === null) continue;
    if (depth >= maxDepth) return true;
    for (const child of children) stack.push([child, depth + 1]);
  }
  return false;
}

/**
 * TOML 1.1로 푼다. 2^53을 넘는 정수는 큰 정수(bigint)로 받아 문서 전체를 거부하지 않는다. Codex의 해석기가 거부하는 64비트 밖의 정수와,
 * 너무 깊게 중첩된 문서는 풀리지 않는 것으로 본다(공개 소스의 toml 0.9는 i64를 넘는 정수에서 실패한다). 풀리지 않으면 null이다
 */
export function parseCodexConfig(text: string): TomlTable | null {
  let value: TomlTable;
  try {
    value = parse(text, { integersAsBigInt: "asNeeded" }) as TomlTable;
  } catch {
    return null;
  }
  return exceedsLimits(value) ? null : value;
}

/** stdio 전송과 함께 둘 수 없는 열쇠와 HTTP 전송과 함께 둘 수 없는 열쇠(공개 소스 config/src/mcp_types.rs의 전송 검사) */
const HTTP_KEYS = ["url", "bearer_token_env_var", "bearer_token", "http_headers_helper", "http_headers", "env_http_headers", "oauth", "oauth_resource", "auth"];
const STDIO_KEYS = ["args", "env", "env_vars", "cwd", "bearer_token"];

/** MCP 서버 정의 하나가 Codex가 받는 꼴인지. enabled의 종류와 전송만 본다(oauth의 세부 조건은 보지 않는다). 플러그인의 서버 선언에도 쓴다 */
export function codexServerShapeOk(server: unknown): boolean {
  if (!isTable(server) || !optional(server.enabled, isBool)) return false;
  const has = (key: string): boolean => server[key] !== undefined && server[key] !== null;
  if (has("command")) return isText(server.command) && !HTTP_KEYS.some(has);
  if (has("url")) return isText(server.url) && !STDIO_KEYS.some(has);
  return false;
}

/** 글자이거나 granular 하나를 담은 묶음이다 */
const approvalShapeOk = (value: unknown): boolean => value === undefined || isText(value) || (isTable(value) && Object.keys(value).length === 1 && isTable(value.granular));
const pluginShapeOk = (plugin: unknown): boolean =>
  isTable(plugin) && optional(plugin.enabled, isBool) && optional(plugin.mcp_servers, (servers) => tableOf(servers, (server) => isTable(server) && optional(server.enabled, isBool)));
const skillsShapeOk = (skills: unknown): boolean =>
  optional(skills, (value) => isTable(value) && optional(value.config, (list) => Array.isArray(list) && list.every((entry) => isTable(entry) && isBool(entry.enabled) && optional(entry.path, isText) && optional(entry.name, isText))));

/** 스캐너가 읽는 자리의 값의 종류가 맞는지. 모르는 열쇠와 모르는 글자 값은 틀린 것이 아니다(「5단계 2부 계획 전 결정」 3번) */
export function codexConfigShapeOk(doc: TomlTable): boolean {
  return (
    approvalShapeOk(doc.approval_policy) &&
    optional(doc.sandbox_mode, isText) &&
    optional(doc.default_permissions, isText) &&
    optional(doc.mcp_servers, (servers) => tableOf(servers, codexServerShapeOk)) &&
    optional(doc.plugins, (plugins) => tableOf(plugins, pluginShapeOk)) &&
    skillsShapeOk(doc.skills) &&
    optional(doc.features, (features) => isTable(features) && optional(features.plugins, isBool)) &&
    optional(doc.projects, (projects) => tableOf(projects, (project) => isTable(project) && optional(project.trust_level, isText))) &&
    optional(doc.project_doc_fallback_filenames, (names) => Array.isArray(names) && names.every(isText)) &&
    optional(doc.project_doc_max_bytes, isNonNegativeInteger)
  );
}

/** 설정 파일 하나를 읽는다. 맨 앞의 BOM은 뗀다. 풀리지 않거나 읽는 자리의 모양이 틀리면 unparsable이다 */
export async function readCodexConfig(path: string): Promise<CodexConfigRead> {
  const read = await readText(path);
  if (read.status !== "ok") return read;
  const value = parseCodexConfig(read.text);
  return value !== null && codexConfigShapeOk(value) ? { status: "ok", value } : { status: "unparsable" };
}

/** 위 층을 아래 층에 얹는다. 묶음은 열쇠마다 깊이 합치고, 목록과 종류가 다른 값은 위 층이 통째로 대신한다. 아래 층의 묶음은 바꾸지 않는다 */
function mergeInto(base: TomlTable, top: TomlTable): TomlTable {
  const out = Object.create(null) as TomlTable;
  for (const [key, value] of Object.entries(base)) out[key] = value;
  for (const [key, value] of Object.entries(top)) {
    const below = out[key];
    out[key] = isTable(below) && isTable(value) ? mergeInto(below, value) : value;
  }
  return out;
}

/** 층을 아래에서 위의 차례로 합친다(공개 소스의 merge_toml_values와 같은 규칙) */
export function mergeCodexLayers(layers: readonly TomlTable[]): TomlTable {
  return layers.reduce<TomlTable>((merged, layer) => mergeInto(merged, layer), Object.create(null) as TomlTable);
}

/** 지문용으로 TOML 값을 JSON의 꼴로 바꾼다. 큰 정수, 무한대와 숫자 아님, 날짜와 시각을 서로 가르는 묶음으로 적는다. 원래 묶음은 바꾸지 않는다 */
export function tomlToJson(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (typeof value === "number" && !Number.isFinite(value)) return { $float: Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf" };
  if (value instanceof Date) return { $datetime: value.toISOString() };
  if (Array.isArray(value)) return value.map(tomlToJson);
  if (isTable(value)) {
    const out = Object.create(null) as TomlTable;
    for (const [key, item] of Object.entries(value)) out[key] = tomlToJson(item);
    return out;
  }
  return value;
}
