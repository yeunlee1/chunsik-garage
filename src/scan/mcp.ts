// MCP 서버 정의의 지문(이 PC의 무작위 값을 섞은 HMAC, 원문은 버린다)과, 한 맥락(전역이나 프로젝트 하나)에서 서버가 막혔는지·승인됐는지를 가른다(순수 함수, 설계 10, 11.3 E6, 19.1)
import { createHmac } from "node:crypto";
import type { ClaudeJsonProject } from "./claude-json.ts";
import { canonicalJson } from "./json.ts";
import type { McpMatcher, SettingsView } from "./settings.ts";

type Json = Record<string, unknown>;

/**
 * 서버 정의의 전부(전송 방식, 명령과 인자, 주소 전체, 환경 변수와 머리말의 이름과 값)를 이 PC의 무작위 값을 열쇠로 HMAC-SHA256한다.
 * 정의의 원문은 이 함수 밖으로 나가지 않는다. 지문으로 원문을 되살릴 수 없다.
 * 정의가 너무 깊게 중첩돼 정규화하지 못하면 null이다(정의를 읽지 못한 서버로 다룬다).
 */
export function definitionHash(saltHex: string, definition: Json): string | null {
  const text = canonicalJson(definition);
  return text === null ? null : createHmac("sha256", Buffer.from(saltHex, "hex")).update(text).digest("hex");
}

const wildcard = (pattern: string): RegExp => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

/** 막는 목록·허용 목록의 한 항목이 서버에 맞는지. 이름은 기록에 남는 꼴들 가운데 하나와 맞으면 된다. */
export function matcherHits(matcher: McpMatcher, names: readonly string[], definition: Json | null): boolean {
  if (matcher.serverName !== undefined && names.includes(matcher.serverName)) return true;
  if (matcher.serverUrl !== undefined && definition !== null && typeof definition.url === "string" && wildcard(matcher.serverUrl).test(definition.url)) return true;
  if (matcher.serverCommand !== undefined && definition !== null && typeof definition.command === "string") {
    const args = Array.isArray(definition.args) ? definition.args : [];
    const command = [definition.command, ...args];
    if (command.length === matcher.serverCommand.length && command.every((part, i) => part === matcher.serverCommand![i])) return true;
  }
  return false;
}

/** 한 맥락의 설정 층들과 그 프로젝트의 .claude.json 기록. */
export interface McpContext {
  /** 이 맥락에서 듣는 설정 층(사용자, 프로젝트, 로컬, 관리 정책) */
  layers: readonly SettingsView[];
  managed: SettingsView;
  project: ClaudeJsonProject | null;
}

/** 이 맥락에서 막히지 않았는지. 어느 층의 deniedMcpServers에 걸리거나, 관리 정책의 허용 목록 밖이거나, 그 프로젝트에서 끈 서버면 막힌 것이다. */
export function mcpAllowed(context: McpContext, names: readonly string[], definition: Json | null): boolean {
  for (const layer of context.layers) if (layer.deniedMcpServers.some((m) => matcherHits(m, names, definition))) return false;
  const allow = context.managed.allowedMcpServers;
  if (allow !== null && !allow.some((m) => matcherHits(m, names, definition))) return false;
  if (context.project !== null && names.some((name) => context.project!.disabledMcpServers.includes(name))) return false;
  return true;
}

/** 프로젝트의 .mcp.json에 든 서버가 승인됐는지. 끈 목록에 있으면 아니고, 모두 켜기나 켠 목록에 있으면 승인이다. */
export function projectServerApproved(context: McpContext, name: string): boolean {
  const disabled = new Set([...context.layers.flatMap((l) => l.disabledMcpjsonServers), ...(context.project?.disabledMcpjsonServers ?? [])]);
  if (disabled.has(name)) return false;
  // 일괄 승인은 우선순위가 가장 높은 층이 정한 값이다. 층은 낮은 것부터(사용자, 프로젝트, 로컬, 관리 정책) 온다. 신뢰한 폴더의 규칙이고,
  // 스캐너는 신뢰 기록을 읽지 않으므로 목록의 프로젝트(주 세션이 돈 폴더)를 신뢰한 폴더로 본다(공식 문서 settings-reference 「enableAllProjectMcpServers」, 설계 27)
  let approveAll: boolean | null = null;
  for (const layer of context.layers) if (layer.enableAllProjectMcpServers !== null) approveAll = layer.enableAllProjectMcpServers;
  if (approveAll === true) return true;
  const enabled = new Set([...context.layers.flatMap((l) => l.enabledMcpjsonServers), ...(context.project?.enabledMcpjsonServers ?? [])]);
  return enabled.has(name);
}
