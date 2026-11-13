// 셋팅 스캐너가 내는 Claude Code의 셋팅 사실. 숫자, 이름, 경로, 참거짓, 지문만 담고 설정의 값·지침의 글·훅 명령·권한 규칙의 글은 담지 않는다(설계 10, 12.1, 19.1)
import type { ShellGuard } from "./hooks.ts";
import type { InstructionSet } from "./instructions.ts";
import type { ComponentKind } from "./plugins.ts";
import type { ModeFact } from "./settings.ts";

export type FileStatus = "ok" | "missing" | "unparsable" | "unreadable";

export interface SkillFact {
  scope: "user" | "project" | "plugin";
  /** 설치의 이름. 사용자·프로젝트 스킬은 폴더 이름, 플러그인 스킬은 '<플러그인의 유효 이름>:<폴더 이름>' */
  name: string;
  /** 세션 기록의 이름과 맞출 꼴(names.ts의 skillRecordNames) */
  recordNames: string[];
  path: string;
  realPath: string | null;
  isLink: boolean;
  /** 폴더 안 모든 파일의 지문. 견줄 수 없으면 null */
  contentHash: string | null;
  createdMs: number | null;
  targetCreatedMs: number | null;
  /** project 범위면 그 프로젝트의 정규화한 뿌리 */
  projectRoot: string | null;
  /** plugin 범위면 '<마켓 항목 이름>@<마켓>' */
  pluginId: string | null;
  /** 어느 맥락(전역이나 목록의 프로젝트 하나)에서든 켜져 있다 */
  enabled: boolean;
  /** 실린 목록(skill_listing)에 실릴 수 있다. 머리말의 disable-model-invocation이나 skillOverrides의 off·user-invocable-only가 막으면 거짓이다 */
  listed: boolean;
  /** SKILL.md를 글로 읽었는지. 읽지 못했으면 머리말을 판정하지 않았고(머리말 없음 문제로 세지 않는다) 알림의 재료다(설계 11.3 S3, 20.1) */
  readable: boolean;
  /** 머리말에 name이 있는데 값을 읽지 못했다. 기록의 이름 꼴에는 폴더 이름만 들었다 */
  nameUnreadable: boolean;
  /** 관리 정책의 skillOverrides가 이 이름을 정한다(바꿀 수 없음) */
  managedFixed: boolean;
  /** 훅을 가진 플러그인에 들었거나, 어느 훅 명령에 이 스킬의 경로가 나온다(E5 ⑤) */
  hookProvided: boolean;
  /** 도구가 세는 집계(skillUsage)에서 이 스킬의 이름 꼴 가운데 시각이 읽힌 것의 가장 늦은 마지막 사용 시각. 그런 것이 없으면 null. .claude.json을 읽지 못했으면(ClaudeSetupFacts.claudeJson이 ok가 아님) 없는 것이 아니라 모르는 것이다(설계 10) */
  usageLastUsedMs: number | null;
  /** 이름 꼴 가운데 집계의 항목은 있는데 시각을 읽을 수 없는 것이 있다. 참이면 "30일 안"으로 본다(설계 11.3 「30일의 경계」) */
  usageUndated: boolean;
}

export interface McpFact {
  scope: "user" | "local" | "project" | "plugin" | "claude-ai";
  name: string;
  /** 세션 기록의 이름과 맞출 꼴(names.ts의 mcpRecordNames) */
  recordNames: string[];
  projectRoot: string | null;
  pluginId: string | null;
  /** 정의의 지문(이 PC의 무작위 값을 섞은 HMAC). 정의가 PC에 없거나, 읽지 못하거나, 너무 깊게 중첩돼 정규화하지 못하면 null */
  definitionHash: string | null;
  /** 어느 맥락에서든 켜져 있다(막히지 않았고, .mcp.json의 것은 승인됐고, 플러그인의 것은 플러그인이 켜져 있다) */
  enabled: boolean;
  /** 관리 정책이 막거나 허용 목록으로 정한다(바꿀 수 없음) */
  managedFixed: boolean;
}

export interface PluginFact {
  /** '<마켓 항목 이름>@<마켓>'. enabledPlugins·pluginUsage의 열쇠다 */
  id: string;
  /** 마켓 항목의 이름. 다른 플러그인의 dependencies가 가리키는 이름이다 */
  entryName: string;
  /** 구성 요소의 이름 접두로 쓰는 유효 이름(plugin.json의 name, 없으면 마켓 항목의 이름) */
  name: string;
  /** 설치 기록의 범위들 */
  scopes: string[];
  /** 프로젝트·로컬 범위 기록의 프로젝트(정규화) */
  projectRoots: string[];
  installPath: string;
  /** 놓인 곳의 링크를 푼 실제 경로(정규화). 놓인 곳이 없거나 풀지 못하면 null이다. 플러그인 스킬의 실제 경로가 이 안에 있는지로 그 플러그인의 스킬인지 가린다(설계 18.1 「읽지 못한 곳」) */
  installRealPath: string | null;
  exists: boolean;
  manifest: FileStatus;
  /** none은 스킬 폴더에 둔 플러그인(<name>@skills-dir)이라 마켓 항목이 없는 것이 정상이다 */
  marketplaceEntry: "ok" | "missing" | "unreadable" | "none";
  /** 구성을 아는지. 거짓이면 구성 요소와 스킬을 보지 않았다(설계 10 「구성을 모르는 플러그인」) */
  compositionKnown: boolean;
  enabled: boolean;
  /** 관리 정책의 enabledPlugins가 정한다(참이면 강제로 켬, 거짓이면 막음) */
  managedFixed: boolean;
  managedForced: boolean;
  components: ComponentKind[];
  unknownEntries: string[];
  dependencies: string[] | null;
  hasHooks: boolean;
  hooksUnreadable: boolean;
  mcpUnreadable: boolean;
  /** 이 플러그인의 스킬 위치의 설치 이름(SkillFact.name, 이름 차례). 같은 위치는 한 번만 들고, 같은 원본을 가리키는 다른 링크는 위치마다 든다 */
  skills: string[];
  /** 도구의 집계(pluginUsage)에서 두 이름(마켓 항목의 이름, 구성 요소의 이름)으로 찾은 마지막 사용 시각 가운데 늦은 것. 시각이 읽힌 것이 없으면 null. .claude.json을 읽지 못했으면 claudeJson의 상태로 가린다 */
  usageLastUsedMs: number | null;
  /** 두 이름 가운데 집계의 항목은 있는데 시각을 읽을 수 없는 것이 있다. 참이면 "30일 안"으로 본다(설계 11.3 「30일의 경계」, 16.2 A2 ④) */
  usageUndated: boolean;
}

export interface ProjectFact {
  root: string;
  normRoot: string;
  kind: "git" | "folder";
  exists: boolean;
  excluded: boolean;
  cwds: string[];
  /** .claude/settings.json, .claude/settings.local.json, .mcp.json의 읽기 상태. 없어진 폴더와 프로젝트로 보지 않는 폴더는 읽지 않아 null이다 */
  settingsStatus: FileStatus | null;
  localSettingsStatus: FileStatus | null;
  mcpJsonStatus: FileStatus | null;
  /** 설정 파일이 있는지(읽혔는지와 상관없다) */
  hasSettings: boolean;
  hasLocalSettings: boolean;
  /** 프로젝트 지침(전역과 같은 파일은 표시하고 줄 지문에서만 뺀다). 읽지 않은 폴더는 빈 묶음이다 */
  instructions: InstructionSet;
  /** 프로젝트 설정·로컬 설정의 기본 모드가 권한 우회다(S2의 옛 버전 판정에 쓴다) */
  bypassInProject: boolean;
  bypassInLocal: boolean;
  /** 사용자 설정과 이 프로젝트(프로젝트 설정과 로컬 설정)의 권한 규칙이 부딪히는 쌍의 수(F6). 읽은 설정만으로 센다 */
  permissionConflicts: number;
}

export interface ClaudeHooksFacts {
  /** ㉠의 네 출처에서 찾은 PreToolUse 처리기의 겉모양 */
  guards: ShellGuard[];
  userDisableAll: boolean;
  managedDisableAll: boolean;
  managedAllowManagedOnly: boolean;
  /** 훅 정의를 읽지 못한 켜진 플러그인('<이름>@<마켓>'). 그 플러그인의 훅은 읽은 만큼만 있다 */
  unreadablePlugins: string[];
  /**
   * hooks가 뼈대나 처리기 검사에 걸린 설정 파일(관리 정책 파일과 드롭인 파일, 사용자 설정)의 경로. 도구가 그 항목만 버리는지 그 파일의 훅을 통째로 버리는지
   * 가릴 수 없어서 그 파일의 확인 훅은 guards에 넣지 않았다(설계 11.3 ㉠의 「등록돼 있다」)
   */
  unreadableSettings: string[];
}

/** S3의 재료. 누구의 파일인지를 붙인다. 규칙이 어느 것을 셀지는 설계 11.3 S3가 정한다 */
export interface SetupProblem {
  kind: "unparsable" | "noFrontmatter" | "danglingLink";
  /** user는 사용자가 고치는 셋팅(설정 층·.mcp.json·사용자와 프로젝트 스킬), managed는 관리 정책, plugin은 플러그인 안, tool은 도구가 쓰는 상태 파일(.claude.json) */
  owner: "user" | "managed" | "plugin" | "tool";
  path: string;
  /** 링크를 푼 실제 경로(정규화). 가리키는 곳이 없는 링크처럼 풀지 못하면 null이다. 같은 실제 파일을 한 번만 세는 데 쓴다(설계 11.3 S3) */
  realPath: string | null;
}

export interface ClaudeSetupFacts {
  tool: "claude-code";
  home: string;
  claudeJson: FileStatus;
  globalInstructions: InstructionSet;
  /** 전역 지침에 목록의 프로젝트 경로나 이름이 나온 횟수(정규화한 뿌리 → 횟수, 17절 단서) */
  globalMentions: Record<string, number>;
  settings: {
    user: FileStatus;
    /** 관리 정책을 이룬 파일과 상태. 비어 있으면 관리 정책 파일이 없다 */
    managedParts: { path: string; status: FileStatus }[];
    /** 사용자 설정과 관리 정책의 기본 모드. 그 층이 정하지 않았으면 null이다(설계 11.3 S2 ㉡: 둘 다 정했으면 관리 정책의 값) */
    defaultMode: { user: ModeFact; managed: ModeFact };
  };
  hooks: ClaudeHooksFacts;
  pluginsFile: FileStatus;
  plugins: PluginFact[];
  /** 어느 맥락에서 켜져 있는데 설치 기록이 없는 플러그인("<이름>@<마켓>", 구성을 모르는 플러그인) */
  pluginsWithoutInstall: string[];
  skills: SkillFact[];
  mcpServers: McpFact[];
  projects: ProjectFact[];
  /** S3의 재료(종류, 주인, 경로 차례) */
  problems: SetupProblem[];
  /** 목록을 읽지 못한 스킬 폴더 */
  unreadableDirs: string[];
}
