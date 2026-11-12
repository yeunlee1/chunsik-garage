// 셋팅 사실에서 설치마다의 정체 열쇠를 만든다. 스킬은 (도구, 범위, 프로젝트, 이름, 링크를 푼 실제 경로), MCP 서버는 (도구, 범위, 프로젝트, 플러그인, 이름, 정의의 지문)이다. 정의의 지문이 없는 서버는 정체를 만들 수 없어 넣지 않는다(설계 11.3, 18.1)
import { normalizePath } from "../adapters/claude/locate.ts";
import { installKey } from "../state/observations.ts";
import type { ClaudeSetupFacts, McpFact, SkillFact } from "./types.ts";

export function skillInstallKey(skill: SkillFact): string {
  // 범위가 프로젝트이면 어느 프로젝트의 것인지도 정체다. 두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다(설계 11.3 「설치의 정체」)
  return installKey(["skill", "claude-code", skill.scope, skill.projectRoot ?? "", skill.name, skill.realPath ?? normalizePath(skill.path)]);
}

/** 정의를 읽지 못했거나 PC에 없는 서버(claude.ai에 연결한 서버 포함)는 null이다. */
export function mcpInstallKey(server: McpFact): string | null {
  if (server.definitionHash === null) return null;
  return installKey(["mcp", "claude-code", server.scope, server.projectRoot ?? "", server.pluginId ?? "", server.name, server.definitionHash]);
}

/** 이번 점검에서 본 모든 스킬과 MCP 서버의 설치 열쇠(켜졌는지와 상관없다). */
export function installKeysOf(facts: ClaudeSetupFacts): string[] {
  const keys = facts.skills.map(skillInstallKey);
  for (const server of facts.mcpServers) {
    const key = mcpInstallKey(server);
    if (key !== null) keys.push(key);
  }
  return [...new Set(keys)].sort();
}
