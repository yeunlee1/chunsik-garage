// Claude Code의 .claude.json(CLAUDE_CONFIG_DIR가 있으면 그 폴더 안, 없으면 홈)에서 MCP 서버 정의, 프로젝트마다의 MCP 승인·끄기, 도구가 세는 사용 집계, 연결한 적 있는 claude.ai 서버의 이름만 읽는다(설계 10 「~/.claude.json」)
import { join, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { readJson } from "./fs.ts";
import { mcpMapOf, type McpDefinitionEntry } from "./plugins.ts";

export function claudeJsonPath(env: Record<string, string | undefined>, homedir: string): string {
  const fromEnv = env.CLAUDE_CONFIG_DIR?.trim();
  return fromEnv ? join(resolve(fromEnv), ".claude.json") : join(homedir, ".claude.json");
}

export interface ClaudeJsonProject {
  /** .claude.json에 적힌 그대로의 열쇠 */
  key: string;
  normKey: string;
  mcpServers: McpDefinitionEntry[];
  enabledMcpjsonServers: string[];
  disabledMcpjsonServers: string[];
  disabledMcpServers: string[];
}

export interface ClaudeJsonFacts {
  status: "ok" | "missing" | "unparsable" | "unreadable";
  userMcpServers: McpDefinitionEntry[];
  /** 정규화한 열쇠 차례. 같은 곳을 가리키는 열쇠가 여럿이면 따로 둔다 */
  projects: ClaudeJsonProject[];
  /** 스킬 이름(사용자 스킬은 맨이름, 플러그인 스킬은 '<플러그인>:<스킬>') → 마지막 사용 시각(밀리초) */
  skillUsage: Record<string, number>;
  /** '<이름>@<마켓>' → 마지막 사용 시각(밀리초) */
  pluginUsage: Record<string, number>;
  claudeAiEverConnected: string[];
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function lastUsed(v: unknown): Record<string, number> {
  const out: Record<string, number> = Object.create(null) as Record<string, number>;
  if (!isObject(v)) return out;
  for (const [name, entry] of Object.entries(v)) {
    if (isObject(entry) && typeof entry.lastUsedAt === "number" && Number.isFinite(entry.lastUsedAt)) out[name] = entry.lastUsedAt;
  }
  return out;
}

export function emptyClaudeJson(status: ClaudeJsonFacts["status"]): ClaudeJsonFacts {
  return {
    status,
    userMcpServers: [],
    projects: [],
    skillUsage: Object.create(null) as Record<string, number>,
    pluginUsage: Object.create(null) as Record<string, number>,
    claudeAiEverConnected: [],
  };
}

/**
 * .claude.json은 Claude Code가 수시로 다시 쓰는 파일이라, 쓰는 순간에 읽으면 덜 쓴 글이 풀리지 않을 수 있다.
 * 풀리지 않으면 한 번 더 읽는다. 그래도 풀리지 않으면 unparsable로 알린다(S3의 문제로는 세지 않는다).
 */
export async function readClaudeJson(path: string): Promise<ClaudeJsonFacts> {
  let read = await readJson(path);
  if (read.status === "unparsable") read = await readJson(path);
  if (read.status !== "ok") return emptyClaudeJson(read.status);
  if (!isObject(read.value)) return emptyClaudeJson("unparsable");
  const v = read.value;
  const facts = emptyClaudeJson("ok");
  facts.userMcpServers = isObject(v.mcpServers) ? (mcpMapOf({ mcpServers: v.mcpServers }) ?? []) : [];
  if (isObject(v.projects)) {
    for (const key of Object.keys(v.projects)) {
      const entry = v.projects[key];
      if (!isObject(entry)) continue;
      facts.projects.push({
        key,
        normKey: normalizePath(key),
        mcpServers: isObject(entry.mcpServers) ? (mcpMapOf({ mcpServers: entry.mcpServers }) ?? []) : [],
        enabledMcpjsonServers: strings(entry.enabledMcpjsonServers),
        disabledMcpjsonServers: strings(entry.disabledMcpjsonServers),
        disabledMcpServers: strings(entry.disabledMcpServers),
      });
    }
    facts.projects.sort((a, b) => (a.normKey !== b.normKey ? (a.normKey < b.normKey ? -1 : 1) : a.key < b.key ? -1 : 1));
  }
  facts.skillUsage = lastUsed(v.skillUsage);
  facts.pluginUsage = lastUsed(v.pluginUsage);
  facts.claudeAiEverConnected = [...new Set(strings(v.claudeAiMcpEverConnected))].sort();
  return facts;
}
