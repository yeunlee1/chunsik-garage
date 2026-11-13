// 셋팅 사실에서 "있는데 읽지 못한 것"을 가른다. 없는 파일과 폴더는 읽지 못한 것이 아니다(순수 함수, 설계 11.3, 11.4, 20.1)
import type { ClaudeSetupFacts, FileStatus } from "../scan/types.ts";

/** 있는데 열지 못했거나, 열었는데 풀리지 않았다. 읽지 않은 곳(null)과 없는 파일은 아니다 */
export const unread = (status: FileStatus | null): boolean => status === "unparsable" || status === "unreadable";

/** 사용자 설정이나 관리 정책을 이룬 파일 가운데 읽지 못한 것이 있다 */
export function globalSettingsUnread(facts: ClaudeSetupFacts): boolean {
  return unread(facts.settings.user) || facts.settings.managedParts.some((part) => unread(part.status));
}

/** 스캐너가 셋팅을 읽는 프로젝트의 프로젝트 설정이나 로컬 설정 가운데 읽지 못한 것이 있다 */
export function projectSettingsUnread(facts: ClaudeSetupFacts): boolean {
  return facts.projects.some((project) => unread(project.settingsStatus) || unread(project.localSettingsStatus));
}

/**
 * 설치가 켜져 있는지를 정하는 설정 파일(사용자 설정, 관리 정책 파일, 프로젝트 설정, 로컬 설정) 가운데 읽지 못한 것이 있다.
 * 그 점검에서는 꺼 두거나 막아 둔 것이 켜져 있는 것으로 보인다(설계 11.3 「읽지 못했을 때」, 20.1).
 */
export function enablementUnread(facts: ClaudeSetupFacts): boolean {
  return globalSettingsUnread(facts) || projectSettingsUnread(facts);
}

/**
 * MCP 서버를 찾는 곳 가운데 읽지 못한 곳이 있다. ~/.claude.json, 프로젝트의 .mcp.json, 플러그인의 설치 기록 파일,
 * 켜져 있는 플러그인의 구성과 MCP 정의다. 켜 둔 플러그인이 설치 기록에 없는 것도 구성을 모르는 플러그인이다(설계 10, 11.3 S5).
 */
export function mcpPlacesUnread(facts: ClaudeSetupFacts): boolean {
  return (
    unread(facts.claudeJson) ||
    unread(facts.pluginsFile) ||
    facts.projects.some((project) => unread(project.mcpJsonStatus)) ||
    facts.plugins.some((plugin) => plugin.enabled && (!plugin.compositionKnown || plugin.mcpUnreadable)) ||
    facts.pluginsWithoutInstall.length > 0
  );
}
