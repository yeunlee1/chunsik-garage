// 시험에서 셋팅 사실을 손으로 짓는 도구. 적지 않은 것은 "다 읽었고 아무것도 없다"의 값이다
import { emptyInstructionSet, type InstructionFile, type InstructionSet } from "../../src/scan/instructions.ts";
import type { ClaudeSetupFacts, McpFact, PluginFact, ProjectFact, SkillFact } from "../../src/scan/types.ts";

export const HOME = "/home/u/.claude";

/** 내용이 있는 지침 파일 하나 */
export function instructionFile(path: string, input: Partial<InstructionFile> = {}): InstructionFile {
  return { path, realPath: path, bytes: 500, hasContent: true, sameAsGlobal: false, ...input };
}

/** 지침 묶음. bytes를 적지 않으면 파일 크기의 합이다 */
export function instructions(input: Partial<InstructionSet> = {}): InstructionSet {
  const files = input.files ?? [];
  return { ...emptyInstructionSet(), bytes: files.reduce((sum, file) => sum + file.bytes, 0), ...input };
}

/** 깃 저장소 뿌리인 프로젝트 하나. 설정 파일도 지침도 없다 */
export function project(root: string, input: Partial<ProjectFact> = {}): ProjectFact {
  return {
    root,
    name: root.split(/[\/]/).filter(Boolean).pop() ?? root,
    normRoot: root,
    kind: "git",
    exists: true,
    excluded: false,
    cwds: [root],
    settingsStatus: "missing",
    localSettingsStatus: "missing",
    mcpJsonStatus: "missing",
    hasSettings: false,
    hasLocalSettings: false,
    instructions: emptyInstructionSet(),
    bypassInProject: false,
    bypassInLocal: false,
    permissionConflicts: 0,
    ...input,
  };
}

/** 사용자 범위의 켜져 있는 스킬 하나. 만든 지 오래됐고 집계에는 없다 */
export function skill(name: string, input: Partial<SkillFact> = {}): SkillFact {
  const path = input.path ?? `${HOME}/skills/${name}`;
  const fact: Omit<SkillFact, "installKey"> = {
    scope: "user",
    name,
    recordNames: [name],
    path,
    realPath: path,
    isLink: false,
    contentHash: `hash-${name}`,
    createdMs: 0,
    targetCreatedMs: null,
    projectRoot: null,
    pluginId: null,
    enabled: true,
    listed: true,
    readable: true,
    nameUnreadable: false,
    managedFixed: false,
    hookProvided: false,
    usageLastUsedMs: null,
    usageUndated: false,
    ...input,
  };
  // 정체는 (범위, 프로젝트, 이름, 실제 경로)다. 스캐너의 열쇠와 글자는 다르지만 같은 것끼리 같고 다른 것끼리 다르다
  return { ...fact, installKey: input.installKey ?? JSON.stringify(["skill", fact.scope, fact.projectRoot ?? "", fact.name, fact.realPath ?? fact.path]) };
}

/** 사용자 범위의 켜져 있는 MCP 서버 하나. 정의의 지문이 없으면 정체도 없다 */
export function mcpServer(name: string, input: Partial<McpFact> = {}): McpFact {
  const fact: Omit<McpFact, "installKey"> = { scope: "user", name, recordNames: [name], projectRoot: null, pluginId: null, definitionHash: `def-${name}`, enabled: true, managedFixed: false, ...input };
  const key = fact.definitionHash === null ? null : JSON.stringify(["mcp", fact.scope, fact.projectRoot ?? "", fact.pluginId ?? "", fact.name, fact.definitionHash]);
  return { ...fact, installKey: input.installKey === undefined ? key : input.installKey };
}

/** 사용자 범위로 설치해 켜 둔 플러그인 하나. 구성을 알고 스킬만 든다 */
export function plugin(id: string, input: Partial<PluginFact> = {}): PluginFact {
  const entryName = id.split("@")[0]!;
  const installPath = `${HOME}/plugins/cache/${id}`;
  return {
    id,
    entryName,
    name: entryName,
    scopes: ["user"],
    projectRoots: [],
    installPath,
    installRealPath: installPath,
    exists: true,
    manifest: "ok",
    marketplaceEntry: "ok",
    compositionKnown: true,
    enabled: true,
    managedFixed: false,
    managedForced: false,
    components: ["skills"],
    unknownEntries: [],
    dependencies: [],
    hasHooks: false,
    hooksUnreadable: false,
    mcpUnreadable: false,
    skills: [],
    usageLastUsedMs: null,
    usageUndated: false,
    ...input,
  };
}

/** Claude Code의 셋팅 사실. 모든 파일을 읽었고 설치, 프로젝트, 지침, 훅이 하나도 없다 */
export function facts(input: Partial<ClaudeSetupFacts> = {}): ClaudeSetupFacts {
  return {
    tool: "claude-code",
    home: HOME,
    claudeJson: "ok",
    globalInstructions: emptyInstructionSet(),
    globalMentions: {},
    settings: { user: "ok", managedParts: [], defaultMode: { user: null, managed: null } },
    hooks: { guards: [], userDisableAll: false, managedDisableAll: false, managedAllowManagedOnly: false, unreadablePlugins: [], unreadableSettings: [] },
    pluginsFile: "ok",
    plugins: [],
    pluginsWithoutInstall: [],
    skills: [],
    mcpServers: [],
    projects: [],
    problems: [],
    unreadableDirs: [],
    unreadableSkillPlaces: { user: false, projects: [], plugins: [] },
    ...input,
  };
}
