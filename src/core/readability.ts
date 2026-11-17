// 셋팅 사실에서 "있는데 읽지 못한 것"을 가른다. 없는 파일과 폴더는 읽지 못한 것이 아니다(순수 함수, 설계 11.3, 11.4, 20.1)
import type { ClaudeSetupFacts, CodexSetupFacts, FileStatus, GeminiSetupFacts } from "../scan/types.ts";

/** 있는데 열지 못했거나, 열었는데 풀리지 않았다. 읽지 않은 곳(null)과 없는 파일은 아니다 */
export const unread = (status: FileStatus | null): boolean => status === "unparsable" || status === "unreadable";

/**
 * Codex의 안전장치와 서버를 정하는 설정 파일 가운데 있는데 읽지 못한 것(풀리지 않는 것도)이 있다. 사용자 config.toml과 신뢰한 프로젝트의 .codex/config.toml이다.
 * 신뢰하지 않은 프로젝트의 것은 Codex가 쓰지 않으므로 읽지 않는다(설계 「5단계 2부 계획 전 결정」 2·4·7번, 「5단계 3부 계획 전 결정」 5·10번)
 */
export function codexSettingsUnread(facts: CodexSetupFacts): boolean {
  return unread(facts.config) || facts.projects.some((project) => project.trust === "trusted" && unread(project.configStatus));
}

/**
 * 제미나이의 안전장치와 서버를 정하는 설정 가운데 읽지 못한(풀리지 않은) 것이 있다. 사용자 settings.json, 시스템 기본값과 시스템 설정,
 * 작업 폴더 신뢰가 켜져 있을 때의 신뢰 규칙 파일, 신뢰한 프로젝트의 .gemini/settings.json이다(설계 「0.4.0에서 정한 것」)
 */
export function geminiSettingsUnread(facts: GeminiSetupFacts): boolean {
  return (
    unread(facts.settings) ||
    facts.managedParts.some((part) => unread(part.status)) ||
    (facts.folderTrust && unread(facts.trustedFolders)) ||
    facts.projects.some((project) => project.scanned && project.trusted && unread(project.settingsStatus))
  );
}

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
 * 사용자 스킬 폴더와 프로젝트의 스킬 폴더도 서버를 찾는 곳이다. 거기에 둔 플러그인은 설정에 열쇠가 없어도 켜지고 서버를 넣을 수 있어서,
 * 그 폴더의 목록을 읽지 못하면 그런 플러그인을 찾지 못한 것이다(설계 10 「스킬 폴더에 둔 플러그인」). 플러그인 안의 스킬을 찾는 폴더는 서버와 상관없다.
 */
export function mcpPlacesUnread(facts: ClaudeSetupFacts): boolean {
  return (
    unread(facts.claudeJson) ||
    unread(facts.pluginsFile) ||
    facts.projects.some((project) => unread(project.mcpJsonStatus)) ||
    facts.plugins.some((plugin) => plugin.enabled && (!plugin.compositionKnown || plugin.mcpUnreadable)) ||
    facts.pluginsWithoutInstall.length > 0 ||
    facts.unreadableSkillPlaces.user ||
    facts.unreadableSkillPlaces.projects.length > 0
  );
}
