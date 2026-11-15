// Codex 플러그인 하나를 읽는다. 설치 ID의 꼴, 놓인 곳(버전 폴더), 매니페스트, 구성 요소의 이름, 스킬을 찾는 폴더, MCP 정의를 Codex와 같은 규칙으로 본다. 설정에서 켜졌는지는 스캐너가 따로 본다(설계 「5단계 2부 계획 전 결정」 7·8번)
import { join, relative, resolve, sep } from "node:path";
import { lstat } from "node:fs/promises";
import { codexServerShapeOk, exceedsLimits } from "./codex-config.ts";
import { CODEX_MANIFEST_PATHS } from "./codex-skills.ts";
import { entryInfo, listDir, readText } from "./fs.ts";
import { isObject } from "./json.ts";
import type { FileStatus } from "./types.ts";

type Json = Record<string, unknown>;

export interface CodexPluginRead {
  /** '<이름>@<마켓>' */
  id: string;
  /** 설치 ID가 Codex의 꼴이다. 아니면 Codex가 싣지 않고 놓인 곳도 찾지 않는다 */
  idValid: boolean;
  /** 놓인 곳(고른 버전 폴더). 찾지 못했으면 null */
  root: string | null;
  /** ok는 놓인 곳을 찾음, missing은 그 이름의 폴더나 버전 폴더가 없음, unreadable은 버전 폴더의 목록을 읽지 못함 */
  install: "ok" | "missing" | "unreadable";
  /** missing은 매니페스트가 없음(자리가 폴더이거나 매니페스트 폴더가 파일이면 Codex도 없다고 본다), unparsable은 풀리지 않음, unreadable은 읽지 못함. 놓인 곳을 찾지 못했으면 missing이다 */
  manifest: FileStatus;
  /** 구성 요소의 이름(매니페스트의 name, 비면 뿌리 폴더의 이름). 매니페스트가 맞지 않으면 null */
  namespace: string | null;
  /** 스킬을 찾는 폴더(경로 차례) */
  skillRoots: string[];
  /** MCP 서버의 선언(이름 차례). 정의는 메모리에서만 쓴다 */
  mcpServers: { name: string; definition: Json }[];
  /** MCP 정의가 든 파일이 있는데 읽지 못했거나 풀리지 않았다 */
  mcpUnreadable: boolean;
  /**
   * 구성을 안다. 놓인 곳이나 매니페스트가 있는데 읽지 못했으면 거짓이다. 뿌리의 plugin.json을 쓰는 형식(Agent Plugins)도 거짓이다. 그 형식은 스킬과 MCP 정의를
   * 다른 자리와 다른 꼴로 두고(mcp.json, 전용 스키마) 첫 버전은 따라 하지 않는다(계획 리뷰 1차)
   */
  compositionKnown: boolean;
}

/**
 * Codex의 JSON 해석기(serde_json 1.0.149)가 받는 가장 깊은 중첩. 묶음과 목록이 127단까지는 받고 128단째에서 실패한다(remaining_depth 128을 들어갈 때마다 줄여
 * 0이 되면 실패). 모르는 칸은 깊이를 보지 않고 건너뛴다(ignore_value). exceedsLimits의 깊이는 맨 바깥이 0이라 이 수를 그대로 넘긴다(계획 리뷰 1차의 재확인)
 */
const JSON_MAX_NESTING = 127;

const PLUGIN_NAME = /^[A-Za-z0-9_.-]+$/;
const MARKET_NAME = /^[A-Za-z0-9_-]+$/;

/** 설치 ID의 꼴(공개 소스 core-plugin-common/src/plugin_id.rs). 마지막 @로 나누고, 이름은 ASCII 글자·숫자·_·-·.(점은 앞뒤와 연달아 금지), 마켓은 ASCII 글자·숫자·_·-다 */
export function codexPluginIdValid(id: string): boolean {
  const at = id.lastIndexOf("@");
  if (at <= 0 || at === id.length - 1) return false;
  const name = id.slice(0, at);
  const market = id.slice(at + 1);
  if (!PLUGIN_NAME.test(name) || name.startsWith(".") || name.endsWith(".") || name.includes("..")) return false;
  return MARKET_NAME.test(market);
}

const VERSION_SEGMENT = /^[A-Za-z0-9_.+-]+$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const cmpText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpBig = (a: string, b: string): number => {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

/** SemVer의 pre-release 차례. 없는 쪽이 높고, 식별자마다 숫자끼리는 수로, 숫자는 글자보다 낮고, 글자끼리는 글자로, 앞이 같으면 짧은 쪽이 낮다 */
function cmpPre(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
  const xs = a.split(".");
  const ys = b.split(".");
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    const order = xn && yn ? cmpBig(x, y) : xn ? -1 : yn ? 1 : cmpText(x, y);
    if (order !== 0) return order;
  }
  return xs.length - ys.length;
}

/**
 * SemVer의 빌드 꼬리 차례(Codex가 쓰는 semver 1.0.27의 BuildMetadata). 없는 쪽이 낮고, 식별자마다 숫자끼리는 앞의 0을 뗀 길이와 글자로(같으면 원래 길이로),
 * 숫자는 글자보다 낮고, 글자끼리는 글자로, 앞이 같으면 짧은 쪽이 낮다(계획 리뷰 1차)
 */
function cmpBuild(a: string, b: string): number {
  if (a === b) return 0;
  const xs = a.split(".");
  const ys = b.split(".");
  for (let i = 0; i < xs.length; i++) {
    if (i >= ys.length) return 1;
    const x = xs[i]!;
    const y = ys[i]!;
    const xn = /^[0-9]*$/.test(x);
    const yn = /^[0-9]*$/.test(y);
    if (xn !== yn) return xn ? -1 : 1;
    let order: number;
    if (xn) {
      const xv = x.replace(/^0+/, "");
      const yv = y.replace(/^0+/, "");
      order = xv.length - yv.length || cmpText(xv, yv) || x.length - y.length;
    } else order = cmpText(x, y);
    if (order !== 0) return Math.sign(order);
  }
  return ys.length > xs.length ? -1 : 0;
}

const U64_MAX = 2n ** 64n - 1n;

/** SemVer로 풀리는지. Codex가 쓰는 semver 1.0.27은 주·부·패치를 u64로 풀어 넘치면 실패한다(parse.rs의 numeric_identifier. 구현 검증) */
function semverOf(text: string): RegExpExecArray | null {
  const match = SEMVER.exec(text);
  return match !== null && [match[1], match[2], match[3]].every((part) => BigInt(part!) <= U64_MAX) ? match : null;
}

/** 버전 폴더의 차례(공개 소스 installed.rs의 compare_plugin_versions). 둘 다 SemVer로 풀리면 SemVer의 차례(빌드 꼬리까지)이고, 아니면 글자의 차례다 */
export function compareCodexPluginVersions(a: string, b: string): number {
  const x = semverOf(a);
  const y = semverOf(b);
  if (x === null || y === null) return cmpText(a, b);
  for (let i = 1; i <= 3; i++) {
    const order = cmpBig(x[i]!, y[i]!);
    if (order !== 0) return order;
  }
  return cmpPre(x[4], y[4]) || cmpBuild(x[5] ?? "", y[5] ?? "");
}

/** 놓인 곳. 버전 폴더는 이름이 맞는 일반 폴더(링크 아님)이고, local이 있으면 그것, 없으면 가장 높은 버전이다(공개 소스 active_plugin_version) */
async function installRoot(base: string): Promise<{ install: CodexPluginRead["install"]; root: string | null }> {
  const listing = await listDir(base);
  if (listing.status === "unreadable") return { install: "unreadable", root: null };
  if (listing.status !== "ok") return { install: "missing", root: null };
  const versions: string[] = [];
  for (const name of listing.names) {
    if (name === "." || name === ".." || !VERSION_SEGMENT.test(name)) continue;
    const info = await entryInfo(join(base, name));
    if (info.isDir && !info.isLink) versions.push(name);
  }
  if (versions.length === 0) return { install: "missing", root: null };
  const chosen = versions.includes("local") ? "local" : versions.reduce((best, version) => (compareCodexPluginVersions(version, best) > 0 ? version : best));
  return { install: "ok", root: join(base, chosen) };
}

type ManifestFind = { status: "missing" | "unreadable" } | { status: "found"; path: string; agent: boolean };

/** 매니페스트 자리(공개 소스 utils/plugins의 find_plugin_manifest_path). 자리가 링크이거나 일반 파일이 아니면 그 뒤를 보지 않고 없다고 본다 */
async function findManifest(root: string): Promise<ManifestFind> {
  const own = async (path: string): Promise<{ kind: "none" | "file" | "dir" | "other" } | null> => {
    try {
      const info = await lstat(path);
      return { kind: info.isSymbolicLink() ? "other" : info.isFile() ? "file" : info.isDirectory() ? "dir" : "other" };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "none" } : null;
    }
  };
  const agentPath = join(root, "plugin.json");
  const agent = await own(agentPath);
  if (agent === null) return { status: "unreadable" };
  if (agent.kind === "dir" || agent.kind === "other") return { status: "missing" };
  if (agent.kind === "file") {
    const read = await readText(agentPath);
    if (read.status === "unreadable") return { status: "unreadable" };
    if (read.status === "ok") {
      try {
        const value = JSON.parse(read.text) as unknown;
        // Codex는 문서 전체를 풀어 $schema를 본다(공개 소스 utils/plugins/src/plugin_namespace.rs의 agent_plugin_schema_status). 너무 깊어 풀리지 않으면 다른 도구의 파일이다
        if (isObject(value) && !exceedsLimits(value, JSON_MAX_NESTING) && typeof value.$schema === "string" && value.$schema.startsWith("https://agent-plugins.org/schemas/")) return { status: "found", path: agentPath, agent: true };
      } catch {
        // 풀리지 않는 뿌리의 plugin.json은 다른 도구의 파일로 보고 다음 자리를 본다
      }
    }
  }
  for (const relativePath of CODEX_MANIFEST_PATHS) {
    const [dir, file] = relativePath.split("/") as [string, string];
    const parent = await own(join(root, dir));
    if (parent === null) return { status: "unreadable" };
    if (parent.kind === "none") continue;
    if (parent.kind !== "dir") return { status: "missing" };
    const path = join(root, dir, file);
    const manifest = await own(path);
    if (manifest === null) return { status: "unreadable" };
    if (manifest.kind === "none") continue;
    return manifest.kind === "file" ? { status: "found", path, agent: false } : { status: "missing" };
  }
  return { status: "missing" };
}

/** 매니페스트의 경로 하나를 플러그인 뿌리 아래로 푼다. ./로 시작하고 그것만이 아니며 ..와 절대 경로가 없어야 한다(공개 소스 manifest.rs의 resolve_manifest_path) */
function manifestPath(root: string, raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("./")) return null;
  const rest = raw.slice(2);
  if (rest === "" || rest.split(/[\\/]/).includes("..") || rest.startsWith("/") || rest.startsWith("\\") || /^[A-Za-z]:/.test(rest)) return null;
  const resolved = resolve(root, rest);
  const inside = relative(root, resolved);
  return inside !== "" && !inside.startsWith("..") && !inside.startsWith(sep) ? resolved : null;
}

/**
 * 플러그인의 서버 선언이 Codex가 받는 꼴인지. type 열쇠와, 묶음이 아니거나 빈 oauth는 Codex가 지우고 보며, 전송을 정할 수 없거나 ema_auth를 고른 선언은 버린다
 * (공개 소스 codex-mcp/src/plugin_config.rs의 normalize_plugin_mcp_server와 normalize_plugin_mcp_server_value, 계획 리뷰 1차)
 */
function pluginServerOk(definition: Json): boolean {
  const copy: Json = { ...definition };
  delete copy.type;
  if (!isObject(copy.oauth) || Object.keys(copy.oauth).length === 0) delete copy.oauth;
  return codexServerShapeOk(copy) && copy.auth !== "ema_auth";
}

/** MCP 정의 묶음에서 서버를 꺼낸다. mcpServers가 묶음이면 그 안이고, 아니면 묶음 전체가 서버 이름의 묶음이다. Codex가 버리는 선언(묶음이 아니거나 꼴이 맞지 않는 것)은 버린다 */
function serversOf(value: Json): { name: string; definition: Json }[] {
  const map = isObject(value.mcpServers) ? value.mcpServers : value;
  return Object.entries(map)
    .filter((entry): entry is [string, Json] => isObject(entry[1]) && pluginServerOk(entry[1]))
    .map(([name, definition]) => ({ name, definition }))
    .sort((a, b) => cmpText(a.name, b.name));
}

/** 기존 형식 매니페스트에서 Codex가 깊이를 세며 푸는 칸(목록, 값을 통째로 담는 칸). 다른 칸은 글자이거나 Codex가 모르는 칸이라 깊이를 보지 않고 건너뛴다 */
const LEGACY_NESTED_FIELDS = ["keywords", "skills", "mcpServers", "hooks", "extensions"];

/**
 * 기존 형식 매니페스트의 필드 꼴. Codex는 serde로 풀어 이 꼴이 아니면 그 플러그인을 싣지 않는다(공개 소스 core-plugins/src/manifest.rs의 RawPluginManifest, 계획 리뷰 1차).
 * name은 글자, version·description·apps는 글자나 null, keywords는 글자의 목록, interface는 묶음이나 null이다. 깊이를 세며 푸는 칸이 문서의 맨 바깥과 함께 128단 겹치면
 * 풀리지 않는다(그 칸의 맨 바깥이 둘째 단이다). interface 안쪽 칸의 종류와 깊이는 보지 않는다
 */
function legacyManifestOk(manifest: Json): boolean {
  const text = (value: unknown): boolean => value === undefined || typeof value === "string";
  const optionalText = (value: unknown): boolean => value === undefined || value === null || typeof value === "string";
  const texts = (value: unknown): boolean => value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
  return (
    text(manifest.name) &&
    optionalText(manifest.version) &&
    optionalText(manifest.description) &&
    optionalText(manifest.apps) &&
    texts(manifest.keywords) &&
    (manifest.interface === undefined || manifest.interface === null || isObject(manifest.interface)) &&
    !LEGACY_NESTED_FIELDS.some((key) => exceedsLimits(manifest[key], JSON_MAX_NESTING - 1))
  );
}

export async function readCodexPlugin(codexHome: string, id: string): Promise<CodexPluginRead> {
  const out: CodexPluginRead = { id, idValid: codexPluginIdValid(id), root: null, install: "missing", manifest: "missing", namespace: null, skillRoots: [], mcpServers: [], mcpUnreadable: false, compositionKnown: true };
  if (!out.idValid) return out;
  const at = id.lastIndexOf("@");
  const located = await installRoot(join(codexHome, "plugins", "cache", id.slice(at + 1), id.slice(0, at)));
  out.install = located.install;
  out.root = located.root;
  out.compositionKnown = located.install !== "unreadable";
  if (located.root === null) return out;
  const root = located.root;
  const found = await findManifest(root);
  if (found.status !== "found") {
    out.manifest = found.status;
    out.compositionKnown = found.status !== "unreadable";
    return out;
  }
  const read = await readText(found.path);
  if (read.status !== "ok") {
    out.manifest = read.status;
    out.compositionKnown = read.status !== "unreadable";
    return out;
  }
  let manifest: Json;
  try {
    const value = JSON.parse(read.text) as unknown;
    if (!isObject(value)) throw new Error("묶음이 아니다");
    manifest = value;
  } catch {
    out.manifest = "unparsable";
    return out;
  }
  // Agent Plugins 형식은 Codex가 문서 전체를 값으로 풀어 깊이를 문서 전체로 센다(공개 소스 core-plugins/src/agent_plugin_manifest.rs). 기존 형식은 칸마다 본다
  if (found.agent ? exceedsLimits(manifest, JSON_MAX_NESTING) : !legacyManifestOk(manifest)) {
    out.manifest = "unparsable";
    return out;
  }
  const rawName = typeof manifest.name === "string" ? manifest.name : "";
  out.manifest = "ok";
  out.namespace = rawName.trim() === "" ? (root.split(/[\\/]/).pop() ?? rawName) : rawName;
  if (found.agent) {
    out.compositionKnown = false;
    return out;
  }

  // 스킬을 찾는 폴더. 매니페스트의 skills 가운데 맞는 경로이고, 없으면 skills/(폴더일 때)다. 매니페스트 폴더를 쓰는 형식이면 옮겨 둔 명령 스킬 폴더를 더한다(공개 소스 loader.rs의 plugin_skill_roots)
  // skills가 글자도 글자의 목록도 아니면(글자 아닌 항목이 섞인 목록 포함) Codex는 통째로 버린다(공개 소스 manifest.rs의 resolve_manifest_paths, 계획 리뷰 1차)
  const listed = typeof manifest.skills === "string" ? [manifest.skills] : Array.isArray(manifest.skills) && manifest.skills.every((item) => typeof item === "string") ? manifest.skills : [];
  const declared = listed.map((raw) => manifestPath(root, raw)).filter((path): path is string => path !== null);
  const roots = declared.length > 0 ? declared : (await entryInfo(join(root, "skills"))).isDir ? [join(root, "skills")] : [];
  if ((await entryInfo(join(root, ".codex-plugin", "migrated-command-skills"))).isDir) roots.push(join(root, ".codex-plugin", "migrated-command-skills"));
  out.skillRoots = [...new Set(roots)].sort();

  // MCP 정의. 인라인 묶음이면 그것만 쓰고, 아니면 매니페스트가 가리키는 파일이나 기본 .mcp.json이다(공개 소스 loader.rs의 load_plugin_mcp_servers_from_manifest_with_format)
  // 인라인 묶음도 파일과 같은 해석기를 거쳐 그 안의 mcpServers 묶음을 푼다(공개 소스 plugin_config.rs의 PluginMcpFile, 계획 리뷰 1차)
  if (isObject(manifest.mcpServers)) {
    out.mcpServers = serversOf(manifest.mcpServers);
    return out;
  }
  const declaredFile = manifestPath(root, manifest.mcpServers);
  const file = declaredFile ?? ((await entryInfo(join(root, ".mcp.json"))).isFile ? join(root, ".mcp.json") : null);
  if (file === null) return out;
  const text = await readText(file);
  if (text.status === "missing") return out;
  if (text.status === "unreadable") {
    out.mcpUnreadable = true;
    return out;
  }
  try {
    const value = JSON.parse(text.text) as unknown;
    // MCP 파일은 Codex가 문서 전체를 풀어 깊이를 문서 전체로 센다(공개 소스 codex-mcp/src/plugin_config.rs의 PluginMcpFile은 꼴을 가리지 않는 enum이다)
    if (!isObject(value) || exceedsLimits(value, JSON_MAX_NESTING)) throw new Error("묶음이 아니거나 너무 깊다");
    out.mcpServers = serversOf(value);
  } catch {
    out.mcpUnreadable = true;
  }
  return out;
}
