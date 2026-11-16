// 설정에 그대로 적힌 비밀값(API 키, 토큰, 비밀번호)의 자리를 찾는다. 값은 모양만 보고 그 자리에서 버리며, 밖으로는 어느 칸의 어느 항목인지만 낸다(순수 함수, 설계 「0.2.0에서 정한 것」)

/** env는 환경 변수, headers는 머리말(Claude의 headers, Codex의 http_headers), field는 서버 정의의 맨 위 칸(Codex의 bearer_token 같은 것), args는 인자, url은 주소다 */
export type SecretField = "env" | "headers" | "field" | "args" | "url";

export interface SecretSpot {
  field: SecretField;
  /** 항목의 이름. 환경 변수나 머리말의 이름, 인자의 옵션 이름이나 「#몇 번째」, 주소의 password나 질의 이름이다. 값이 아니다 */
  key: string;
}

/** 잘 알려진 키의 모양. 이름과 상관없이 비밀값으로 본다 */
const KNOWN = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bxox[abeprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /\bhf_[A-Za-z0-9]{30,}/,
  /\bya29\.[A-Za-z0-9_-]{20,}/,
  /\bntn_[A-Za-z0-9]{30,}/,
  /\bsecret_[A-Za-z0-9]{30,}/,
  /\bfigd_[A-Za-z0-9_-]{30,}/,
  /\blin_api_[A-Za-z0-9]{30,}/,
  /\b[sr]k_live_[A-Za-z0-9]{20,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];
/** 이름(소문자, 글자와 숫자만)에 이것이 들면 비밀값의 이름으로 본다. key로 끝나는 이름도 그렇다 */
const SECRET_WORDS = ["token", "secret", "password", "passwd", "apikey", "accesskey", "privatekey", "authorization", "bearer", "credential", "cookie"];
/** 이름이 이것으로 끝나면 값이 아니라 다른 것(환경 변수 이름, 경로, 주소, 종류, 기간)을 담는 항목이다 */
const NOT_VALUE_ENDINGS = ["envvar", "var", "name", "path", "file", "dir", "url", "uri", "type", "id", "mode", "count", "length", "ttl", "expiry", "expires", "timeout"];
/** 서버 정의의 맨 위 칸 가운데 비밀값을 담지 않는 것 */
const PLAIN_FIELDS = new Set(["command", "type", "url", "cwd", "transport", "enabled"]);
const MIN_LENGTH = 8;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const normalized = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

function secretName(name: string): boolean {
  const n = normalized(name);
  if (NOT_VALUE_ENDINGS.some((ending) => n.endsWith(ending))) return false;
  return SECRET_WORDS.some((word) => n.includes(word)) || n.endsWith("key");
}

/** 다른 곳의 값을 가리키는 참조(${VAR}, $VAR, %VAR%)가 든 값 */
const isReference = (value: string): boolean => /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%/.test(value);
/** 채워 넣으라는 자리표시나 한 글자를 되풀이한 값 */
const isPlaceholder = (value: string): boolean => /^(<[^>]*>|\[[^\]]*\]|\{[^}]*\}|your[\s_-].*|.*placeholder.*|(.)\2{5,}|change[\s_-]?me|example|test|dummy|none|null|undefined|true|false|todo|tbd)$/i.test(value.trim());
const isKnown = (value: string): boolean => KNOWN.some((pattern) => pattern.test(value));

/** 이름으로 고른 항목의 값이 그대로 적힌 비밀값인지. 환경 변수 이름, 경로, 주소처럼 보이는 값은 비밀값이 아니다 */
function literalSecret(value: string): boolean {
  const text = value.trim();
  if (text.length < MIN_LENGTH || isReference(text) || isPlaceholder(text)) return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(text)) return false;
  if (/^(\/|~|[A-Za-z]:[\\/]|\.{1,2}[\\/]|https?:\/\/)/.test(text)) return false;
  return true;
}

/** 이름과 값 하나가 비밀값의 자리인지. 값이 잘 알려진 키 모양이면 이름과 상관없다 */
const secretPair = (name: string, value: unknown): boolean => typeof value === "string" && !isReference(value) && (isKnown(value) || (secretName(name) && literalSecret(value)));

function tableSpots(field: SecretField, table: unknown): SecretSpot[] {
  if (!isObject(table)) return [];
  return Object.entries(table)
    .filter(([name, value]) => secretPair(name, value))
    .map(([name]) => ({ field, key: name }));
}

function argSpots(args: unknown): SecretSpot[] {
  if (!Array.isArray(args)) return [];
  const spots: SecretSpot[] = [];
  args.forEach((arg, index) => {
    if (typeof arg !== "string") return;
    const flag = /^(--?[A-Za-z][A-Za-z0-9_-]*)=(.*)$/.exec(arg);
    if (flag !== null) {
      if (secretPair(flag[1]!, flag[2]!)) spots.push({ field: "args", key: flag[1]! });
      return;
    }
    const previous = index > 0 ? args[index - 1] : undefined;
    if (typeof previous === "string" && /^--?[A-Za-z]/.test(previous) && !previous.includes("=") && !arg.startsWith("-") && secretName(previous) && literalSecret(arg) && !isReference(arg)) {
      spots.push({ field: "args", key: previous });
      return;
    }
    if (!isReference(arg) && isKnown(arg)) spots.push({ field: "args", key: `#${index + 1}` });
  });
  return spots;
}

function urlSpots(url: unknown): SecretSpot[] {
  if (typeof url !== "string") return [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  const spots: SecretSpot[] = [];
  if (parsed.password !== "" && !isReference(decodeURIComponent(parsed.password))) spots.push({ field: "url", key: "password" });
  for (const [name, value] of parsed.searchParams) if (secretPair(name, value) || (normalized(name) === "key" && literalSecret(value))) spots.push({ field: "url", key: name });
  return spots;
}

/** MCP 서버 정의 하나에서 그대로 적힌 비밀값의 자리. 같은 칸의 같은 항목은 한 번만 낸다. 값은 내지 않는다 */
export function secretSpots(definition: Record<string, unknown> | null): SecretSpot[] {
  if (definition === null || !isObject(definition)) return [];
  const fields = Object.entries(definition)
    .filter(([name, value]) => !PLAIN_FIELDS.has(name) && typeof value === "string" && secretPair(name, value))
    .map(([name]): SecretSpot => ({ field: "field", key: name }));
  const all = [...tableSpots("env", definition.env), ...tableSpots("headers", definition.headers), ...tableSpots("headers", definition.http_headers), ...fields, ...argSpots(definition.args), ...urlSpots(definition.url)];
  const seen = new Set<string>();
  return all.filter((spot) => {
    const id = `${spot.field}\u0000${spot.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const SCOPE_ORDER = { settings: 0, user: 1, local: 2, project: 3 } as const;
const FIELD_ORDER: Record<SecretField, number> = { env: 0, headers: 1, field: 2, args: 3, url: 4 };
const byText = (a: string | null, b: string | null): number => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);

/** 범위, 프로젝트, 서버, 칸, 항목 이름의 차례. 같은 입력이면 늘 같은 차례다 */
export function sortSecrets<T extends { scope: keyof typeof SCOPE_ORDER; projectRoot: string | null; server: string | null; field: SecretField; key: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || byText(a.projectRoot, b.projectRoot) || byText(a.server, b.server) || FIELD_ORDER[a.field] - FIELD_ORDER[b.field] || byText(a.key, b.key));
}

/** 설정 파일의 env 묶음에서 그대로 적힌 비밀값의 이름 */
export function envSecretKeys(env: unknown): string[] {
  return tableSpots("env", env).map((spot) => spot.key);
}
