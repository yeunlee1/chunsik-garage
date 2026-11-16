// Codex의 MCP 서버를 맥락마다 합쳐 서버 사실로 낸다. 설정의 서버(사용자 층과 신뢰한 프로젝트 층을 깊이 합친 것)가 플러그인의 서버를 이기고, 플러그인끼리는 ID의 사전순으로 앞선 것이 이기며, 이긴 등록이 꺼져 있으면 그 이름이 꺼진다. 정의는 enabled를 뺀 전부를 지문으로만 남긴다(설계 「5단계 2부 계획 전 결정」 7번)
import { isTable, tomlToJson, type TomlTable } from "./codex-config.ts";
import { definitionHash } from "./mcp.ts";
import { secretSpots, sortSecrets } from "./secrets.ts";
import type { McpFact, SecretFact } from "./types.ts";

type Json = Record<string, unknown>;

export interface CodexMcpContext {
  /** 전역 맥락이면 null, 신뢰한 프로젝트의 맥락이면 그 정규화한 뿌리 */
  projectRoot: string | null;
  /** 이 맥락의 합친 설정 */
  merged: TomlTable;
  /** 이 맥락에서 켜져 있고 Codex가 싣는 플러그인의 ID */
  plugins: readonly string[];
}

export interface CodexMcpInput {
  /** 사용자 층(없거나 읽지 못했으면 빈 묶음) */
  user: TomlTable;
  /** 신뢰한 프로젝트의 층 */
  projects: readonly { normRoot: string; layer: TomlTable }[];
  /** 전역 맥락과 신뢰한 프로젝트마다의 맥락 */
  contexts: readonly CodexMcpContext[];
  /** 플러그인마다 선언한 서버(구성을 아는 플러그인만) */
  pluginServers: ReadonlyMap<string, readonly { name: string; definition: Json }[]>;
  /** 상태 파일의 무작위 값(16진 64자) */
  salt: string;
}

const serversOf = (layer: TomlTable): TomlTable => (isTable(layer.mcp_servers) ? layer.mcp_servers : {});
const cmp = (a: string | null, b: string | null): number => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);
const SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 } as const;

/** enabled를 뺀 정의의 지문. 켜고 끈 것은 정의가 아니다 */
function hashOf(salt: string, definition: unknown): string | null {
  if (!isTable(definition)) return null;
  const copy = Object.create(null) as Json;
  for (const [key, value] of Object.entries(definition)) if (key !== "enabled") copy[key] = value;
  return definitionHash(salt, tomlToJson(copy) as Json);
}

/** 그 맥락에서 그 플러그인 서버가 켜져 있는지. [plugins."<ID>".mcp_servers.<서버>] 묶음이 있으면 그 enabled(없으면 참)가 선언을 대신한다(공개 소스 loader.rs의 apply_plugin_mcp_server_policy) */
function pluginServerOn(context: CodexMcpContext, id: string, name: string, declared: Json): boolean {
  const plugins = isTable(context.merged.plugins) ? context.merged.plugins : {};
  const entry = plugins[id];
  const policies = isTable(entry) && isTable(entry.mcp_servers) ? entry.mcp_servers : {};
  const policy = policies[name];
  // 그 묶음에 ema_auth가 있으면 값과 상관없이 서버를 끈다(폐기된 인증 정책이 사라지며 켜지지 않게 한다. 공개 소스 config/src/types.rs의 has_unsupported_ema_auth, 계획 리뷰 1차)
  return isTable(policy) ? policy.enabled !== false && !Object.hasOwn(policy, "ema_auth") : declared.enabled !== false;
}

/** 사용자 층과 신뢰한 프로젝트 층의 서버 정의에 그대로 적힌 비밀값의 자리(0.2.0). 플러그인 서버는 세지 않고, 값은 여기서 버린다 */
export function codexMcpSecrets(user: TomlTable, projects: readonly { normRoot: string; layer: TomlTable }[]): SecretFact[] {
  const secrets: SecretFact[] = [];
  const add = (scope: "user" | "project", projectRoot: string | null, layer: TomlTable): void => {
    for (const [name, definition] of Object.entries(serversOf(layer))) {
      if (!isTable(definition)) continue;
      for (const spot of secretSpots(tomlToJson(definition) as Json)) secrets.push({ scope, server: name, projectRoot, ...spot });
    }
  };
  add("user", null, user);
  for (const project of projects) add("project", project.normRoot, project.layer);
  return sortSecrets(secrets);
}

export function codexMcpFacts(input: CodexMcpInput): Omit<McpFact, "installKey">[] {
  const facts: Omit<McpFact, "installKey">[] = [];
  const base = { managedFixed: false } as const;
  for (const [name, definition] of Object.entries(serversOf(input.user))) {
    facts.push({ ...base, scope: "user", name, recordNames: [name], projectRoot: null, pluginId: null, definitionHash: hashOf(input.salt, definition), enabled: isTable(definition) && definition.enabled !== false });
  }
  for (const project of input.projects) {
    const context = input.contexts.find((c) => c.projectRoot === project.normRoot);
    const merged = context === undefined ? {} : serversOf(context.merged);
    for (const name of Object.keys(serversOf(project.layer))) {
      const definition = merged[name];
      facts.push({ ...base, scope: "project", name, recordNames: [name], projectRoot: project.normRoot, pluginId: null, definitionHash: hashOf(input.salt, definition), enabled: isTable(definition) && definition.enabled !== false });
    }
  }
  for (const [id, servers] of input.pluginServers) {
    for (const server of servers) {
      const enabled = input.contexts.some((context) => {
        if (!context.plugins.includes(id) || Object.hasOwn(serversOf(context.merged), server.name)) return false;
        // 그 이름을 가진 플러그인 가운데 ID의 사전순으로 앞선 것이 이긴 등록이다. 이긴 등록이 꺼져 있으면 그 이름이 꺼진다
        const winner = [...context.plugins].sort().find((other) => (input.pluginServers.get(other) ?? []).some((s) => s.name === server.name));
        return winner === id && pluginServerOn(context, id, server.name, server.definition);
      });
      facts.push({ ...base, scope: "plugin", name: server.name, recordNames: [server.name], projectRoot: null, pluginId: id, definitionHash: hashOf(input.salt, server.definition), enabled });
    }
  }
  return facts.sort((a, b) => cmp(a.name, b.name) || SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || cmp(a.projectRoot, b.projectRoot) || cmp(a.pluginId, b.pluginId) || cmp(a.definitionHash, b.definitionHash));
}
