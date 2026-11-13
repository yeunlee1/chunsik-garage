// 셋팅 사실에서 설치마다의 정체 열쇠를 만든다. 스킬은 (도구, 범위, 프로젝트, 이름, 링크를 푼 실제 경로), MCP 서버는 (도구, 범위, 프로젝트, 플러그인, 이름, 정의의 지문)이다. 정의의 지문이 없는 서버는 정체를 만들 수 없어 넣지 않는다(설계 11.3, 18.1)
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { installKey } from "../state/observations.ts";
import type { ClaudeSetupFacts, FileStatus, McpFact, SkillFact } from "./types.ts";

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

/** 있는데 열지 못했거나 열었는데 풀리지 않았다. 없는 것(missing)은 읽지 못한 것이 아니다. */
const unread = (status: FileStatus | null | undefined): boolean => status === "unparsable" || status === "unreadable";
/** path가 base 자신이거나 그 아래다. 이름의 앞부분이 같은 옆 폴더는 밖이다. 둘 다 정규화한 경로다. */
const inside = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);

/**
 * 관측 기록에만 있고 이번 점검에 보이지 않는 설치가 "읽지 못한 곳에 든 것"인지 가르는 함수를 만든다(설계 18.1 「읽지 못한 곳」).
 * 참이면 그 기록을 고치지 않는다(updateInstalls의 keepUnseen). 읽지 못했다고 확인되지 않으면 거짓이다. 지우는 쪽이 미루는 쪽이다.
 * - 사용자·로컬 범위 서버: .claude.json이 풀리지 않거나 열 수 없었다.
 * - 프로젝트 범위 서버: 그 프로젝트의 .mcp.json이 풀리지 않거나 열 수 없었다.
 * - 사용자·프로젝트 스킬: 그 스킬 폴더의 목록을 읽지 못했다.
 * - 플러그인 서버: 그 플러그인이 놓인 곳은 있는데 구성을 모르거나 MCP 정의를 읽지 못했다(같은 ID의 놓인 곳 가운데 하나라도).
 * - 플러그인 스킬: 실제 경로가 구성을 모르는 플러그인의 놓인 곳 안이거나, 목록을 읽지 못한 폴더 안이다.
 * - 플러그인의 것 모두: 설치 기록 파일이 풀리지 않거나 열 수 없었다.
 * 스캐너가 셋팅을 읽지 않는 프로젝트(지금 PC에 없다, 목록에서 빠졌다, 프로젝트로 보지 않는 폴더다)의 것은 없어진 것이라 거짓이다.
 * 스킬의 열쇠에는 실제 경로가 들어 있다. 링크로 건 플러그인의 읽지 못한 폴더는 링크의 표기로 적혀 있으므로, 놓인 곳의 실제 경로로 옮긴 꼴로도 견준다.
 * 놓인 곳 안쪽의 폴더가 다시 링크이면 그 실제 경로는 알 수 없어서 견주지 못한다(읽지 못했으므로 풀 수도 없다).
 */
export function unseenInUnreadablePlace(facts: ClaudeSetupFacts): (key: string) => boolean {
  const unreadableDirs = facts.unreadableDirs.map((dir) => normalizePath(dir));
  const linkedRoots = facts.plugins.flatMap((plugin) => {
    const shown = normalizePath(plugin.installPath);
    return plugin.installRealPath === null || plugin.installRealPath === shown ? [] : [{ shown, real: plugin.installRealPath }];
  });
  const unreadablePluginDirs = unreadableDirs.flatMap((dir) => [dir, ...linkedRoots.filter((root) => inside(dir, root.shown)).map((root) => `${root.real}${dir.slice(root.shown.length)}`)]);
  const userSkillsDir = normalizePath(join(facts.home, "skills"));
  const scanned = new Map(facts.projects.filter((project) => project.exists && !project.excluded).map((project) => [project.normRoot, project]));
  const claudeJsonUnread = unread(facts.claudeJson);
  const pluginsFileUnread = unread(facts.pluginsFile);
  const unknownPluginRoots = facts.plugins.filter((plugin) => plugin.exists && !plugin.compositionKnown).map((plugin) => plugin.installRealPath ?? normalizePath(plugin.installPath));
  // 구성을 모르는 플러그인은 MCP 정의도 읽지 못한 것으로 적혀 있다(plugins.ts)
  const mcpUnreadPlugins = new Set(facts.plugins.filter((plugin) => plugin.exists && plugin.mcpUnreadable).map((plugin) => plugin.id));

  return (key) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(key);
    } catch {
      return false;
    }
    if (!Array.isArray(parsed) || !parsed.every((part): part is string => typeof part === "string") || parsed[1] !== "claude-code") return false;
    const scope = parsed[2] ?? "";
    const projectRoot = parsed[3] ?? "";
    if (parsed[0] === "skill" && parsed.length === 6) {
      const realPath = parsed[5] ?? "";
      if (scope === "user") return unreadableDirs.includes(userSkillsDir);
      if (scope === "project") {
        const project = scanned.get(projectRoot);
        return project !== undefined && unreadableDirs.includes(normalizePath(join(project.root, ".claude", "skills")));
      }
      if (scope === "plugin") return pluginsFileUnread || unknownPluginRoots.some((root) => inside(realPath, root)) || unreadablePluginDirs.some((dir) => inside(realPath, dir));
      return false;
    }
    if (parsed[0] === "mcp" && parsed.length === 7) {
      if (scope === "user") return claudeJsonUnread;
      if (scope === "local") return scanned.has(projectRoot) && claudeJsonUnread;
      if (scope === "project") return unread(scanned.get(projectRoot)?.mcpJsonStatus);
      if (scope === "plugin") return pluginsFileUnread || mcpUnreadPlugins.has(parsed[4] ?? "");
      return false;
    }
    return false;
  };
}
