// 설치된 플러그인(installed_plugins.json)마다 설치 위치, 매니페스트와 마켓 항목을 합친 유효 구성(알아보지 못한 것 포함), 유효 이름, 기대는 플러그인, 훅·MCP 서버 정의·스킬 경로를 읽는다(설계 10 「플러그인의 구성」, 16.2 A2)
import { basename, join, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, listDir, readJson } from "./fs.ts";
import { hookFileEvents, inlineHookEvents } from "./hooks.ts";
import { isObject } from "./json.ts";

export type ComponentKind =
  | "skills"
  | "commands"
  | "agents"
  | "workflows"
  | "outputStyles"
  | "themes"
  | "monitors"
  | "hooks"
  | "bin"
  | "settings"
  | "mcpServers"
  | "lspServers"
  | "userConfig"
  | "channels";

/** 플러그인 뿌리의 기본 자리(공식 문서 plugins-reference). 뿌리에 바로 놓인 SKILL.md는 여기에 없어서 알아보지 못한 것이 된다(설계 10) */
const DEFAULT_ENTRIES: Readonly<Record<string, ComponentKind>> = {
  skills: "skills",
  commands: "commands",
  agents: "agents",
  workflows: "workflows",
  "output-styles": "outputStyles",
  themes: "themes",
  monitors: "monitors",
  hooks: "hooks",
  bin: "bin",
  "settings.json": "settings",
  ".mcp.json": "mcpServers",
  ".lsp.json": "lspServers",
};

/** 구성 요소를 정하는 매니페스트 열쇠. */
const MANIFEST_COMPONENTS: readonly [string, ComponentKind][] = [
  ["skills", "skills"],
  ["commands", "commands"],
  ["agents", "agents"],
  ["workflows", "workflows"],
  ["outputStyles", "outputStyles"],
  ["hooks", "hooks"],
  ["mcpServers", "mcpServers"],
  ["lspServers", "lspServers"],
  ["userConfig", "userConfig"],
  ["channels", "channels"],
];
const COMPONENT_KEYS = new Set(MANIFEST_COMPONENTS.map(([key]) => key));

/** plugin.json이 있을 때 마켓 항목에서 더해지는 구성 요소(strict가 참일 때. 공식 문서 manifest-reference 「How entry fields combine with plugin.json」) */
const ENTRY_APPENDED = new Set(["commands", "agents", "skills", "hooks", "outputStyles", "themes"]);

/** 소개 파일. 이름이 README·LICENSE·CHANGELOG로 시작하는 파일과 package.json이다. 점으로 시작하는 것은 따로 뺀다(설계 10 「플러그인의 구성」). */
const INTRO_FILES = /^(readme|license|changelog)|^package\.json$/i;

/** 뿌리의 보조 폴더. 도구가 스스로 싣지 않는 폴더다(설계 10 「플러그인의 구성」, 공식 문서 manifest-reference 「Standard layout」). 이름은 대소문자를 가리지 않고 견준다 */
const HELPER_DIRS = new Set(["docs", "tests", "test", "examples", "assets", "images", "scripts"]);

/** 마켓의 뿌리를 뜻하는 source(설계 10). */
const MARKET_ROOT_SOURCES = new Set([".", "./"]);

/** 파일 경로가 아니라 주소로 적은 것(예. https://…). 도구는 내려받아 읽지만 첫 버전의 스캐너는 내려받지 않으므로 정의를 읽지 못한 것으로 둔다. */
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * 선언한 구성 요소 경로의 꼴. ./로 시작하고 .. 부분이 없어야 한다. ./로 시작하지 않으면 검증에 실패하고(공식 문서 plugins-reference 「Path rules」),
 * MCP 파일은 절대 경로이거나 .. 부분이 있으면 안쪽을 가리켜도 읽지 않는다(errors 「Server file path not read」). 훅과 스킬 경로에도 같은 꼴을 요구한다(엄한 쪽, 설계 10)
 */
const wellFormedPath = (path: string): boolean => path.startsWith("./") && !path.split(/[\\/]/).includes("..");

/**
 * 매니페스트의 hooks·mcpServers 선언을 차례대로 편다(공식 문서 plugins-reference 「Hooks」, 「MCP servers」).
 * 글자는 경로, 묶음은 인라인이고 목록은 둘을 섞을 수 있다. 모양이 다른 요소는 null(읽지 못한 것)이다.
 */
function declarationsOf(value: unknown): (string | Json | null)[] {
  if (value === undefined) return [];
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.map((item) => (typeof item === "string" ? item : isObject(item) ? item : null));
}

/** 스킬 폴더에 둔 플러그인의 ID에서 마켓 자리에 오는 이름(공식 문서 marketplace-reference 「Reserved names」). */
const SKILLS_DIR = "skills-dir";

/**
 * 뿌리 항목 하나가 소개 쪽인지. 소개 파일, SKILL.md가 아닌 .md 파일(문서), 보조 폴더다. 링크는 대상의 꼴로 본다.
 * .md는 대소문자를 가리지 않고 보고, 뿌리의 SKILL.md(대소문자 상관없이)는 알아보지 못한 것으로 남긴다(엄한 쪽).
 */
async function isIntroEntry(root: string, name: string): Promise<boolean> {
  const lower = name.toLowerCase();
  const info = await entryInfo(join(root, name));
  if (info.isFile) return INTRO_FILES.test(name) || (lower.endsWith(".md") && lower !== "skill.md");
  if (info.isDir) return HELPER_DIRS.has(lower);
  return false;
}

/** 매니페스트의 소개 열쇠와 dependencies. 이 밖의 열쇠 가운데 구성 요소가 아닌 것은 알아보지 못한 것이다. */
const INTRO_KEYS = new Set(["$schema", "name", "displayName", "version", "description", "author", "homepage", "repository", "license", "keywords", "metadata", "defaultEnabled", "dependencies"]);

/** 마켓 항목의 열쇠 가운데 구성 요소가 아닌 것(공식 문서 marketplace-reference 「Plugin entries」). 마켓 항목이 매니페스트 노릇을 할 때 이 밖의 열쇠는 알아보지 못한 것이다. */
const ENTRY_INTRO_KEYS = new Set([...INTRO_KEYS, "source", "category", "tags", "strict", "relevance", "headers", "headersHelper"]);

type Json = Record<string, unknown>;

export interface McpDefinitionEntry {
  name: string;
  /** 서버 정의(메모리에서만 쓴다) */
  definition: Json | null;
}

export interface PluginInstall {
  /** '<마켓 항목 이름>@<마켓>'. enabledPlugins·pluginUsage·설치 기록의 열쇠다 */
  id: string;
  /** 마켓 항목의 이름(id의 @ 앞). 다른 플러그인의 dependencies가 가리키는 이름이다 */
  entryName: string;
  marketplace: string;
  /** 구성 요소의 이름 접두로 쓰는 유효 이름. plugin.json의 name, 없으면 마켓 항목의 이름이다(공식 문서 plugins-reference 「Required fields」) */
  name: string;
  /** 이 설치 위치를 쓰는 설치 기록의 범위(중복 없이 차례대로) */
  scopes: string[];
  /** 프로젝트·로컬 범위 기록의 프로젝트(정규화, 차례대로) */
  projectPaths: string[];
  installPath: string;
  exists: boolean;
  manifest: "ok" | "missing" | "unparsable" | "unreadable";
  /** 마켓 항목. missing은 마켓의 목록 파일이나 그 이름의 항목이 없는 것이다. none은 마켓에서 오지 않은 플러그인(스킬 폴더에 둔 것)이라 항목이 없는 것이 정상이다 */
  marketplaceEntry: "ok" | "missing" | "unreadable" | "none";
  /** 어느 설정에도 켜고 끈 기록이 없을 때의 값(마켓 항목의 defaultEnabled가 앞서고, 다음은 매니페스트, 없으면 참) */
  defaultEnabled: boolean;
  components: ComponentKind[];
  /** 알아보지 못한 뿌리 항목과 열쇠(매니페스트 열쇠는 "manifest:", 매니페스트 노릇을 하는 마켓 항목의 열쇠는 "entry:" 접두, 이름 차례) */
  unknownEntries: string[];
  /** plugin.json과 마켓 항목의 dependencies를 합친 플러그인 이름(마켓과 버전 조건은 뗀다). 구성을 모르면 null(기대는지 알 수 없음) */
  dependencies: string[] | null;
  /** 구성을 아는지. 놓인 곳이나 그 목록을 읽지 못함, 매니페스트가 있는데 풀리지 않음, 마켓 항목을 읽지 못함, 뜨지 않는 조합(strict가 거짓인데 마켓 항목에도 구성 요소)이면 거짓이다(설계 10) */
  compositionKnown: boolean;
  /** 사건마다 합친 훅 묶음 하나(메모리에서만 쓴다) */
  hookEvents: unknown[];
  hooksUnreadable: boolean;
  mcpServers: McpDefinitionEntry[];
  mcpUnreadable: boolean;
  /** 스킬 경로(기본 skills와 매니페스트·마켓 항목의 skills). 경로 자체가 스킬 폴더일 수도 있다. 구성을 모르면 비어 있다 */
  skillRoots: string[];
}

export interface PluginsScan {
  file: "ok" | "missing" | "unparsable" | "unreadable";
  plugins: PluginInstall[];
}

const pathsOf = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const firstSegment = (path: string): string => path.replace(/\\/g, "/").replace(/^\.\//, "").split("/")[0] ?? "";
const bareName = (name: string): string => (name.includes("@") ? name.slice(0, name.indexOf("@")) : name);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** MCP 정의 묶음({ mcpServers: { 이름: 정의 } } 또는 { 이름: 정의 })을 펼친다. mcpServers 열쇠가 있는데 객체가 아니거나 모양이 다르면 null이다. */
export function mcpMapOf(value: unknown): McpDefinitionEntry[] | null {
  if (!isObject(value)) return null;
  let map: Json = value;
  if (Object.hasOwn(value, "mcpServers")) {
    if (!isObject(value.mcpServers)) return null;
    map = value.mcpServers;
  }
  return Object.keys(map)
    .sort()
    .map((name) => ({ name, definition: isObject(map[name]) ? (map[name] as Json) : null }));
}

export interface MarketplaceEntries {
  /** known_marketplaces.json의 상태. ok가 아니면 마켓을 하나도 모른다. 없는 것(missing)과 풀리지 않거나 읽지 못한 것(unreadable)을 가른다 */
  file: "ok" | "missing" | "unreadable";
  /** 마켓 이름 → 그 마켓의 항목(이름 → 항목). 마켓의 목록 파일을 읽지 못하면 "unreadable", 없으면 "missing" */
  markets: Map<string, Map<string, Json> | "missing" | "unreadable">;
}

/** <홈>/plugins/known_marketplaces.json의 installLocation 아래 .claude-plugin/marketplace.json에서 마켓 항목을 읽는다. */
export async function readMarketplaceEntries(claudeHome: string): Promise<MarketplaceEntries> {
  const markets = new Map<string, Map<string, Json> | "missing" | "unreadable">();
  const known = await readJson(join(claudeHome, "plugins", "known_marketplaces.json"));
  if (known.status === "missing") return { file: "missing", markets };
  if (known.status !== "ok" || !isObject(known.value)) return { file: "unreadable", markets };
  for (const [market, info] of Object.entries(known.value)) {
    if (!isObject(info) || typeof info.installLocation !== "string") {
      markets.set(market, "unreadable");
      continue;
    }
    // installLocation이 폴더이면 그 아래의 .claude-plugin/marketplace.json, 파일이면 그 파일이다(설계 10 「마켓 항목」. 주소로 더한 마켓은 파일 하나일 수 있다)
    const location = info.installLocation;
    const read = await readJson((await entryInfo(location)).isFile ? location : join(location, ".claude-plugin", "marketplace.json"));
    if (read.status === "missing") {
      markets.set(market, "missing");
      continue;
    }
    if (read.status !== "ok" || !isObject(read.value) || !Array.isArray(read.value.plugins)) {
      markets.set(market, "unreadable");
      continue;
    }
    const entries = new Map<string, Json>();
    for (const entry of read.value.plugins) if (isObject(entry) && typeof entry.name === "string" && !entries.has(entry.name)) entries.set(entry.name, entry);
    markets.set(market, entries);
  }
  return { file: "ok", markets };
}

/** 훅 묶음들을 사건마다 합친다. replace에 든 사건은 앞의 것을 대신한다(마켓 항목의 훅). */
function mergeEvents(base: readonly unknown[], replace: unknown): Json {
  const merged: Json = Object.create(null) as Json;
  for (const events of base) {
    if (!isObject(events)) continue;
    for (const [event, groups] of Object.entries(events)) if (Array.isArray(groups)) merged[event] = [...((merged[event] as unknown[] | undefined) ?? []), ...groups];
  }
  if (isObject(replace)) for (const [event, groups] of Object.entries(replace)) if (Array.isArray(groups)) merged[event] = [...groups];
  return merged;
}

export interface InstallGroup {
  id: string;
  installPath: string;
  scopes: Set<string>;
  projectPaths: Set<string>;
}

export async function readPluginInstall(group: InstallGroup, markets: MarketplaceEntries): Promise<PluginInstall> {
  const { id, installPath } = group;
  const at = id.lastIndexOf("@");
  const entryName = at === -1 ? id : id.slice(0, at);
  const marketplace = at === -1 ? "" : id.slice(at + 1);
  const plugin: PluginInstall = {
    id,
    entryName,
    marketplace,
    name: entryName,
    scopes: [...group.scopes].sort(),
    projectPaths: [...group.projectPaths].sort(),
    installPath,
    exists: false,
    manifest: "missing",
    marketplaceEntry: "missing",
    defaultEnabled: true,
    components: [],
    unknownEntries: [],
    dependencies: null,
    compositionKnown: false,
    hookEvents: [],
    hooksUnreadable: false,
    mcpServers: [],
    mcpUnreadable: false,
    skillRoots: [],
  };
  // 구성을 모르는 플러그인은 구성과 스킬을 보지 않는다. 훅과 MCP 정의도 읽지 못한 것으로 적는다(설계 10, 20.1)
  const unknown = (): PluginInstall => {
    plugin.hooksUnreadable = true;
    plugin.mcpUnreadable = true;
    return plugin;
  };

  // 스킬 폴더에 둔 플러그인은 마켓에서 오지 않는다. 마켓 항목 없이(빈 항목으로) 매니페스트와 폴더로 구성을 안다(설계 10 「스킬 폴더에 둔 플러그인」)
  const market = markets.markets.get(marketplace);
  const fromSkillsDir = marketplace === SKILLS_DIR;
  const entry: Json | undefined = fromSkillsDir ? {} : market instanceof Map ? market.get(entryName) : undefined;
  // 마켓 목록 파일(known_marketplaces.json)이 풀리지 않거나 읽지 못했으면 그 마켓이 없는 것이 아니라 읽지 못한 것이다
  const marketUnreadable = market === "unreadable" || (market === undefined && markets.file === "unreadable");
  plugin.marketplaceEntry = fromSkillsDir ? "none" : entry !== undefined ? "ok" : marketUnreadable ? "unreadable" : "missing";

  plugin.exists = (await entryInfo(installPath)).isDir;
  if (!plugin.exists) return unknown();
  const listing = await listDir(installPath);
  const manifestRead = await readJson(join(installPath, ".claude-plugin", "plugin.json"));
  let manifest: Json | null = null;
  // 매니페스트가 있으면 name이 유일한 필수 열쇠다. 없거나 글자가 아니거나 비었으면 도구가 싣지 않으므로 풀리지 않는 매니페스트로 본다(공식 문서 plugins-reference 「Required fields」, 설계 10)
  if (manifestRead.status === "ok" && isObject(manifestRead.value) && typeof manifestRead.value.name === "string" && manifestRead.value.name !== "") {
    plugin.manifest = "ok";
    manifest = manifestRead.value;
    plugin.name = manifestRead.value.name;
  } else {
    plugin.manifest = manifestRead.status === "ok" ? "unparsable" : manifestRead.status;
  }
  // 기본 켜짐: 마켓 항목의 값이 앞서고, 다음은 매니페스트, 없으면 참(공식 문서 plugins-reference 「Default enablement」)
  if (entry !== undefined && typeof entry.defaultEnabled === "boolean") plugin.defaultEnabled = entry.defaultEnabled;
  else if (manifest !== null) plugin.defaultEnabled = manifest.defaultEnabled !== false;

  if (listing.status !== "ok") return unknown();
  if (plugin.manifest === "unparsable" || plugin.manifest === "unreadable") return unknown();
  if (entry === undefined) return unknown();
  if (manifest !== null && entry.strict === false && Object.keys(entry).some((key) => ENTRY_APPENDED.has(key))) return unknown();

  // 유효 구성: plugin.json이 있으면 그것에 마켓 항목의 여섯 구성 요소를 더하고, 없으면 마켓 항목이 곧 매니페스트다
  const base: Json = manifest ?? entry;
  const appended: Json = manifest !== null ? Object.fromEntries(Object.entries(entry).filter(([key]) => ENTRY_APPENDED.has(key))) : {};
  plugin.compositionKnown = true;

  const deps = [...(Array.isArray(base.dependencies) ? base.dependencies : []), ...(manifest !== null && Array.isArray(entry.dependencies) ? entry.dependencies : [])];
  plugin.dependencies = [...new Set(deps.flatMap((d) => (typeof d === "string" ? [bareName(d)] : isObject(d) && typeof d.name === "string" ? [bareName(d.name)] : [])))].sort();

  const kinds = new Set<ComponentKind>();
  const referenced = new Set<string>();
  const addComponents = (source: Json): void => {
    for (const [key, kind] of MANIFEST_COMPONENTS) {
      if (source[key] === undefined) continue;
      kinds.add(kind);
      for (const path of pathsOf(source[key])) referenced.add(firstSegment(path));
    }
    const experimental = isObject(source.experimental) ? source.experimental : {};
    for (const [key, kind] of [["themes", "themes"], ["monitors", "monitors"]] as const) {
      if (experimental[key] === undefined) continue;
      kinds.add(kind);
      for (const path of pathsOf(experimental[key])) referenced.add(firstSegment(path));
    }
    if (source.themes !== undefined) {
      kinds.add("themes");
      for (const path of pathsOf(source.themes)) referenced.add(firstSegment(path));
    }
  };
  addComponents(base);
  addComponents(appended);

  // 알아보지 못한 열쇠. 매니페스트가 있어도 마켓 항목의 열쇠를 본다(설계 10 표의 셋째 줄). 항목의 mcpServers 같은 구성 요소 열쇠는 듣지 않을 뿐 모르는 것이 아니다
  const prefix = manifest !== null ? "manifest" : "entry";
  const unknownKeys = (source: Json, from: string, known: ReadonlySet<string>): void => {
    for (const key of Object.keys(source)) {
      if (key === "experimental") {
        const experimental = isObject(source.experimental) ? source.experimental : {};
        for (const inner of Object.keys(experimental)) if (inner !== "themes" && inner !== "monitors") plugin.unknownEntries.push(`${from}:experimental.${inner}`);
        continue;
      }
      if (!known.has(key) && !COMPONENT_KEYS.has(key) && key !== "themes") plugin.unknownEntries.push(`${from}:${key}`);
    }
  };
  if (manifest !== null) unknownKeys(manifest, "manifest", INTRO_KEYS);
  unknownKeys(entry, "entry", ENTRY_INTRO_KEYS);
  for (const name of listing.names) {
    const kind = Object.hasOwn(DEFAULT_ENTRIES, name) ? DEFAULT_ENTRIES[name] : undefined;
    if (kind !== undefined) {
      kinds.add(kind);
      continue;
    }
    if (name.startsWith(".") || referenced.has(name) || (await isIntroEntry(installPath, name))) continue;
    plugin.unknownEntries.push(name);
  }
  plugin.components = [...kinds].sort();

  // 훅: 기본 hooks/hooks.json을 먼저 읽고 plugin.json의 hooks 선언(경로, 인라인 묶음, 둘을 섞은 목록)을 차례대로 더한다(공식 문서 plugins-reference 「Hooks」).
  // 구성 요소 경로는 플러그인 뿌리 안이어야 한다. 있는 경로의 실제 경로(링크를 푼 곳)가 뿌리의 실제 경로 밖이면 도구가 그 경로를 버리고 나머지를 싣는다. 선언한 경로뿐 아니라 기본 hooks/hooks.json도 같다
  // (공식 문서 plugins loading 「Paths that escape the plugin directory」, errors 「Path escapes plugin directory」). 같은 마켓 안의 다른 플러그인이나 로컬 마켓 안을 가리키는 링크는 도구가 받지만
  // 여기서는 밖으로 본다(엄한 쪽, 설계 27). 선언한 경로는 꼴(wellFormedPath)도 맞아야 하고, 그 꼴이면 표기로 풀어도 뿌리 밖으로 나가지 않는다
  const root = normalizePath(installPath);
  const rootReal = (await entryInfo(installPath)).realPath;
  const within = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);
  const insideRoot = async (path: string): Promise<boolean> => {
    const real = (await entryInfo(path)).realPath;
    return real === null || rootReal === null || within(real, rootReal);
  };
  /** 도구가 받는 선언 경로면 푼 경로, 아니면 null */
  const declaredPath = async (declared: string): Promise<string | null> => {
    if (!wellFormedPath(declared)) return null;
    const path = resolve(installPath, declared);
    return (await insideRoot(path)) ? path : null;
  };

  // 훅 파일은 맨 위 hooks 감싸개 안에 사건 묶음을 두고, 인라인은 사건 묶음 그대로다. 감싸개가 없거나 뼈대가 형식에 맞지 않는 파일·인라인은 도구가 싣지 않으므로 넣지 않고 읽지 못한 것으로 둔다.
  // 같은 경로(정규화한 표기)의 훅 파일을 두 번 적으면 한 번만 읽고 그 결과를 다시 쓴다. 선언한 파일이 없으면 읽지 못한 것이고, 기본 파일이 없는 것은 정상이다.
  // 마켓 항목의 hooks(인라인만)는 plugin.json이 있으면 사건마다 앞의 것을 대신한다
  const hookSources: Json[] = [];
  const hookFileStatus = new Map<string, "ok" | "missing" | "bad">();
  const addHookFile = async (path: string, declared: boolean): Promise<void> => {
    const key = normalizePath(path);
    let status = hookFileStatus.get(key);
    if (status === undefined) {
      const read = await readJson(path);
      const events = read.status === "ok" ? hookFileEvents(read.value) : null;
      status = read.status === "missing" ? "missing" : events !== null ? "ok" : "bad";
      hookFileStatus.set(key, status);
      if (events !== null) hookSources.push(events);
    }
    if (status === "missing" ? declared : status === "bad") plugin.hooksUnreadable = true;
  };
  const addInlineHooks = (inline: unknown): void => {
    const events = inlineHookEvents(inline);
    if (events === null) plugin.hooksUnreadable = true;
    else hookSources.push(events);
  };
  const defaultHooks = join(installPath, "hooks", "hooks.json");
  if (await insideRoot(defaultHooks)) await addHookFile(defaultHooks, false);
  else plugin.hooksUnreadable = true;
  if (manifest !== null) {
    for (const declaration of declarationsOf(manifest.hooks)) {
      if (declaration === null) plugin.hooksUnreadable = true;
      else if (typeof declaration === "string") {
        const path = await declaredPath(declaration);
        if (path !== null) await addHookFile(path, true);
        else plugin.hooksUnreadable = true;
      } else addInlineHooks(declaration);
    }
  }
  // 마켓 항목의 훅은 사건마다 매처를 적은 묶음일 때만 돈다. 경로나 목록으로 적은 것은 돌지 않으므로 훅 묶음에 넣지 않는다.
  // 읽지 못한 것은 아니다. 구성 요소(hooks)로는 위에서 셌다. 인라인 묶음도 뼈대가 형식에 맞지 않으면 읽지 못한 것이고 사건을 대신하지 않는다(공식 문서 marketplace-reference 「Hooks in an entry」, 설계 10)
  const entryHooks = isObject(entry.hooks) ? inlineHookEvents(entry.hooks) : undefined;
  if (entryHooks === null) plugin.hooksUnreadable = true;
  plugin.hookEvents = [manifest !== null ? mergeEvents(hookSources, entryHooks) : mergeEvents([...hookSources, entryHooks], undefined)];

  // MCP 서버: 기본 .mcp.json을 먼저 읽고 매니페스트(없으면 마켓 항목)의 mcpServers 선언(경로, 인라인 묶음, 둘을 섞은 목록)을 차례대로 읽는다.
  // 같은 이름은 나중에 선언된 것이 통째로 대신한다(공식 문서 plugins-reference 「MCP servers」). 그래서 같은 파일을 두 번 선언하면 나중 자리에서 다시 읽는다.
  // 주소나 MCP 묶음으로 적은 것은 정의를 읽지 못한 것이다. 선언한 파일이 없어도 읽지 못한 것이고, 기본 파일이 없는 것은 정상이다. plugin.json이 있으면 마켓 항목의 것은 듣지 않는다
  const servers = new Map<string, McpDefinitionEntry>();
  const addMap = (entries: McpDefinitionEntry[] | null): void => {
    if (entries === null) {
      plugin.mcpUnreadable = true;
      return;
    }
    for (const e of entries) servers.set(e.name, e);
  };
  const addMcpFile = async (path: string, declared: boolean): Promise<void> => {
    const read = await readJson(path);
    if (read.status === "missing") {
      if (declared) plugin.mcpUnreadable = true;
      return;
    }
    addMap(read.status === "ok" ? mcpMapOf(read.value) : null);
  };
  await addMcpFile(join(installPath, ".mcp.json"), false);
  for (const declaration of declarationsOf(base.mcpServers)) {
    if (declaration === null || (typeof declaration === "string" && URL_LIKE.test(declaration))) plugin.mcpUnreadable = true;
    else if (typeof declaration === "string") {
      const path = await declaredPath(declaration);
      if (path !== null) await addMcpFile(path, true);
      else plugin.mcpUnreadable = true;
    }
    else addMap(mcpMapOf({ mcpServers: declaration }));
  }
  plugin.mcpServers = [...servers.values()].sort((a, b) => cmp(a.name, b.name));

  // 스킬 경로: 기본 skills/에 매니페스트와 마켓 항목의 skills를 더한다. 플러그인 뿌리 자신을 가리키면 스킬 경로로 보지 않고 알아보지 못한 것으로 둔다.
  // 마켓 항목이 skills를 적었고 그 source가 마켓의 뿌리이면 적힌 폴더만 찾는다(공식 문서 plugins-reference 「Path behavior rules」, 설계 10)
  // 뿌리 자신인지는 표기와 링크를 푼 실제 경로로 본다. 풀지 못한 경로는 표기로만 견준다. 도구가 받지 않는 경로(꼴이 틀리거나 뿌리 밖으로 풀림)는 훑지 않고 알아보지 못한 것(skills=..)으로 둔다
  const isPluginRoot = async (path: string): Promise<boolean> => {
    if (normalizePath(path) === root) return true;
    const real = (await entryInfo(path)).realPath;
    return real !== null && rootReal !== null && real === rootReal;
  };
  const declared = [...pathsOf(base.skills).map((path) => ({ path, from: prefix })), ...pathsOf(appended.skills).map((path) => ({ path, from: "entry" }))];
  const skillRoots: string[] = [];
  for (const { path, from } of declared) {
    if (await isPluginRoot(resolve(installPath, path))) {
      plugin.unknownEntries.push(`${from}:skills=.`);
      continue;
    }
    const accepted = await declaredPath(path);
    if (accepted === null) plugin.unknownEntries.push(`${from}:skills=..`);
    else skillRoots.push(accepted);
  }
  const defaultSkills = join(installPath, "skills");
  const defaultIsRoot = await isPluginRoot(defaultSkills);
  if (defaultIsRoot) plugin.unknownEntries.push("skills=.");
  const entrySkillsOnly = entry.skills !== undefined && typeof entry.source === "string" && MARKET_ROOT_SOURCES.has(entry.source);
  plugin.skillRoots = [...new Set([...(entrySkillsOnly || defaultIsRoot ? [] : [defaultSkills]), ...skillRoots])];
  plugin.unknownEntries = [...new Set(plugin.unknownEntries)].sort();
  return plugin;
}

/** 스킬 폴더에 둔 플러그인 하나의 자리. 사용자 스킬 폴더의 것이면 사용자 범위, 프로젝트의 것이면 그 프로젝트(정규화한 뿌리)다. */
export interface SkillsDirPluginRef {
  path: string;
  scope: "user" | "project";
  projectRoot: string | null;
}

/**
 * 스킬 폴더에 둔 플러그인(<name>@skills-dir)을 읽는다(설계 10 「스킬 폴더에 둔 플러그인」).
 * 설치 기록에 없어도 구성을 아는 플러그인이다. 이름은 매니페스트의 name이고, 매니페스트가 풀리지 않거나 name이 없으면 폴더 이름이다(그때는 구성을 모른다).
 */
export async function readSkillsDirPlugins(refs: readonly SkillsDirPluginRef[]): Promise<PluginInstall[]> {
  const out: PluginInstall[] = [];
  for (const ref of refs) {
    const read = await readJson(join(ref.path, ".claude-plugin", "plugin.json"));
    const declared = read.status === "ok" && isObject(read.value) ? read.value.name : undefined;
    const name = typeof declared === "string" && declared !== "" ? declared : basename(ref.path);
    const group: InstallGroup = { id: `${name}@${SKILLS_DIR}`, installPath: ref.path, scopes: new Set([ref.scope]), projectPaths: new Set(ref.projectRoot === null ? [] : [ref.projectRoot]) };
    out.push(await readPluginInstall(group, { file: "ok", markets: new Map() }));
  }
  return out;
}

/** <홈>/plugins/installed_plugins.json의 설치 기록을 (id, 설치 위치)마다 하나로 묶어 읽는다. id와 정규화한 설치 위치 차례다. */
export async function scanPlugins(claudeHome: string): Promise<PluginsScan> {
  const read = await readJson(join(claudeHome, "plugins", "installed_plugins.json"));
  if (read.status !== "ok") return { file: read.status, plugins: [] };
  if (!isObject(read.value) || !isObject(read.value.plugins)) return { file: "unparsable", plugins: [] };
  const groups = new Map<string, InstallGroup>();
  for (const id of Object.keys(read.value.plugins)) {
    // 도구에 든 플러그인(@builtin)은 플러그인으로 세지 않는다(설계 10 「도구에 든 플러그인」)
    if (id.endsWith("@builtin")) continue;
    const entries = read.value.plugins[id];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isObject(entry) || typeof entry.installPath !== "string") continue;
      const key = `${id}\u0000${normalizePath(entry.installPath)}`;
      let group = groups.get(key);
      if (group === undefined) {
        group = { id, installPath: entry.installPath, scopes: new Set(), projectPaths: new Set() };
        groups.set(key, group);
      }
      // 같은 곳을 다른 표기로 적었으면 글자 차례로 가장 앞선 표기를 쓴다
      if (entry.installPath < group.installPath) group.installPath = entry.installPath;
      group.scopes.add(typeof entry.scope === "string" ? entry.scope : "unknown");
      if (typeof entry.projectPath === "string") group.projectPaths.add(normalizePath(entry.projectPath));
    }
  }
  const markets = await readMarketplaceEntries(claudeHome);
  const plugins: PluginInstall[] = [];
  for (const key of [...groups.keys()].sort()) plugins.push(await readPluginInstall(groups.get(key)!, markets));
  return { file: "ok", plugins };
}
