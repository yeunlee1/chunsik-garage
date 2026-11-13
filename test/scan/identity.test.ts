// 설치의 정체 열쇠를 시험한다. 같은 이름이라도 범위·실제 경로·정의가 다르면 다른 설치이고, 정의가 없는 서버는 정체가 없다(설계 11.3, 18.1, 21.1)
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { installKeysOf, mcpInstallKey, skillInstallKey, unseenInUnreadablePlace } from "../../src/scan/identity.ts";
import { emptyInstructionSet } from "../../src/scan/instructions.ts";
import type { ClaudeSetupFacts, McpFact, PluginFact, ProjectFact, SkillFact } from "../../src/scan/types.ts";

const skill = (over: Partial<SkillFact>): SkillFact => ({
  scope: "user",
  name: "a",
  recordNames: ["a"],
  path: "/h/.claude/skills/a",
  realPath: "/h/.claude/skills/a",
  isLink: false,
  contentHash: null,
  createdMs: null,
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
  ...over,
});
const server = (over: Partial<McpFact>): McpFact => ({
  scope: "user",
  name: "s",
  recordNames: ["s"],
  projectRoot: null,
  pluginId: null,
  definitionHash: "h1",
  enabled: true,
  managedFixed: false,
  ...over,
});

describe("설치의 정체", () => {
  it("같은 이름의 스킬이 사용자 범위와 프로젝트 범위에 따로 있으면 다른 설치다", () => {
    expect(skillInstallKey(skill({}))).not.toBe(skillInstallKey(skill({ scope: "project", realPath: "/p/.claude/skills/a" })));
  });
  it("링크의 대상을 바꾸면(이름은 그대로) 다른 설치다", () => {
    expect(skillInstallKey(skill({ isLink: true, realPath: "/store/v1/a" }))).not.toBe(skillInstallKey(skill({ isLink: true, realPath: "/store/v2/a" })));
  });
  it("MCP 서버의 정의가 달라지면 다른 설치이고, 정의가 없는 서버는 정체가 없다", () => {
    expect(mcpInstallKey(server({}))).not.toBe(mcpInstallKey(server({ definitionHash: "h2" })));
    expect(mcpInstallKey(server({ scope: "claude-ai", definitionHash: null }))).toBeNull();
  });
  it("스킬은 범위, 이름, 실제 경로 가운데 하나만 달라도 다른 설치다", () => {
    const keys = [skill({}), skill({ scope: "project" }), skill({ name: "b" }), skill({ realPath: "/h/.claude/skills/other" })].map(skillInstallKey);
    expect(new Set(keys).size).toBe(4);
  });
  it("두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다(프로젝트 스킬의 정체에는 프로젝트가 든다)", () => {
    const a = skill({ scope: "project", projectRoot: "/p1", path: "/p1/.claude/skills/a", realPath: "/store/a", isLink: true });
    const b = skill({ scope: "project", projectRoot: "/p2", path: "/p2/.claude/skills/a", realPath: "/store/a", isLink: true });
    expect(skillInstallKey(a)).not.toBe(skillInstallKey(b));
  });
  it("실제 경로를 모르면 정규화한 경로로 정체를 만든다", () => {
    expect(skillInstallKey(skill({ realPath: null }))).toBe(skillInstallKey(skill({ realPath: normalizePath("/h/.claude/skills/a") })));
    expect(skillInstallKey(skill({ realPath: null }))).not.toBe(skillInstallKey(skill({ realPath: null, path: "/h/.claude/skills/b" })));
  });
  it("MCP 서버는 범위, 프로젝트, 플러그인, 이름, 정의의 지문 가운데 하나만 달라도 다른 설치다", () => {
    const keys = [server({}), server({ scope: "local" }), server({ projectRoot: "/p" }), server({ pluginId: "x@m" }), server({ name: "t" }), server({ definitionHash: "h2" })].map(mcpInstallKey);
    expect(new Set(keys).size).toBe(6);
  });
  it("모든 스킬과 정의가 있는 서버의 열쇠를 차례대로 낸다", () => {
    const facts = { skills: [skill({}), skill({ name: "b", realPath: "/h/.claude/skills/b" })], mcpServers: [server({}), server({ name: "c", scope: "claude-ai", definitionHash: null })] } as ClaudeSetupFacts;
    const keys = installKeysOf(facts);
    expect(keys).toHaveLength(3);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("읽지 못한 곳에 든 설치(설계 18.1 「읽지 못한 곳」)", () => {
  const home = join("/h", ".claude");
  const app = join("/work", "app");
  const norm = normalizePath;
  const plugin = (over: Partial<PluginFact>): PluginFact => ({
    id: "p@m",
    entryName: "p",
    name: "p",
    scopes: ["user"],
    projectRoots: [],
    installPath: join(home, "plugins", "cache", "m", "p", "1"),
    installRealPath: norm(join(home, "plugins", "cache", "m", "p", "1")),
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
    ...over,
  });
  const project = (over: Partial<ProjectFact>): ProjectFact => ({
    root: app,
    normRoot: norm(app),
    kind: "git",
    exists: true,
    excluded: false,
    cwds: [app],
    settingsStatus: "missing",
    localSettingsStatus: "missing",
    mcpJsonStatus: "ok",
    hasSettings: false,
    hasLocalSettings: false,
    instructions: emptyInstructionSet(),
    bypassInProject: false,
    bypassInLocal: false,
    permissionConflicts: 0,
    ...over,
  });
  const facts = (over: Partial<ClaudeSetupFacts>): ClaudeSetupFacts =>
    ({ home, claudeJson: "ok", pluginsFile: "ok", plugins: [], projects: [project({})], unreadableDirs: [], skills: [], mcpServers: [], ...over }) as ClaudeSetupFacts;

  const userServer = mcpInstallKey(server({}))!;
  const localServer = mcpInstallKey(server({ scope: "local", projectRoot: norm(app) }))!;
  const projectServer = mcpInstallKey(server({ scope: "project", projectRoot: norm(app) }))!;
  const pluginServer = mcpInstallKey(server({ scope: "plugin", pluginId: "p@m" }))!;
  const userSkill = skillInstallKey(skill({ realPath: norm(join(home, "skills", "a")) }));
  const projectSkill = skillInstallKey(skill({ scope: "project", projectRoot: norm(app), realPath: norm(join(app, ".claude", "skills", "a")) }));
  const pluginSkill = skillInstallKey(skill({ scope: "plugin", name: "p:a", pluginId: "p@m", realPath: norm(join(home, "plugins", "cache", "m", "p", "1", "skills", "a")) }));

  it("다 읽힌 점검에서는 어느 설치도 읽지 못한 곳에 든 것이 아니다", () => {
    const keep = unseenInUnreadablePlace(facts({ plugins: [plugin({})] }));
    expect([userServer, localServer, projectServer, pluginServer, userSkill, projectSkill, pluginSkill].map(keep)).toEqual([false, false, false, false, false, false, false]);
  });

  it(".claude.json이 풀리지 않거나 열 수 없으면 사용자·로컬 범위 서버가 그렇다. 파일이 없는 것은 읽지 못한 것이 아니다", () => {
    for (const status of ["unparsable", "unreadable"] as const) {
      const keep = unseenInUnreadablePlace(facts({ claudeJson: status }));
      expect([userServer, localServer, projectServer, userSkill].map(keep)).toEqual([true, true, false, false]);
    }
    const missing = unseenInUnreadablePlace(facts({ claudeJson: "missing" }));
    expect([userServer, localServer].map(missing)).toEqual([false, false]);
  });

  it("프로젝트의 .mcp.json을 읽지 못하면 그 프로젝트의 프로젝트 범위 서버만 그렇다", () => {
    const other = mcpInstallKey(server({ scope: "project", projectRoot: norm(join("/work", "other")) }))!;
    const keep = unseenInUnreadablePlace(facts({ projects: [project({ mcpJsonStatus: "unparsable" }), project({ root: join("/work", "other"), normRoot: norm(join("/work", "other")) })] }));
    expect([projectServer, other, userServer].map(keep)).toEqual([true, false, false]);
    expect(unseenInUnreadablePlace(facts({ projects: [project({ mcpJsonStatus: "missing" })] }))(projectServer)).toBe(false);
  });

  it("스캐너가 셋팅을 읽지 않는 프로젝트의 것은 없어진 것이다. .claude.json을 읽지 못한 점검이어도 같다", () => {
    for (const gone of [[], [project({ exists: false, mcpJsonStatus: null })], [project({ excluded: true, mcpJsonStatus: null })]]) {
      const keep = unseenInUnreadablePlace(facts({ claudeJson: "unparsable", projects: gone, unreadableDirs: [join(app, ".claude", "skills")] }));
      expect([localServer, projectServer, projectSkill].map(keep)).toEqual([false, false, false]);
      expect(keep(userServer)).toBe(true);
    }
  });

  it("스킬 폴더의 목록을 읽지 못하면 그 폴더의 스킬이 그렇다", () => {
    expect([userSkill, projectSkill].map(unseenInUnreadablePlace(facts({ unreadableDirs: [join(home, "skills")] })))).toEqual([true, false]);
    expect([userSkill, projectSkill].map(unseenInUnreadablePlace(facts({ unreadableDirs: [join(app, ".claude", "skills")] })))).toEqual([false, true]);
  });

  it("구성을 모르는 플러그인(놓인 곳은 있다)의 스킬과 서버가 그렇다. 놓인 곳이 없거나 설치 기록에서 사라진 플러그인의 것은 없어진 것이다", () => {
    const unknown = unseenInUnreadablePlace(facts({ plugins: [plugin({ compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }));
    expect([pluginSkill, pluginServer, userSkill].map(unknown)).toEqual([true, true, false]);
    const noFolder = unseenInUnreadablePlace(facts({ plugins: [plugin({ exists: false, installRealPath: null, compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }));
    expect([pluginSkill, pluginServer].map(noFolder)).toEqual([false, false]);
    expect([pluginSkill, pluginServer].map(unseenInUnreadablePlace(facts({ plugins: [] })))).toEqual([false, false]);
  });

  it("구성은 아는데 MCP 정의를 읽지 못한 플러그인은 서버만 그렇다. 스킬을 찾는 폴더의 목록을 읽지 못하면 그 안의 스킬이 그렇다", () => {
    const mcp = unseenInUnreadablePlace(facts({ plugins: [plugin({ mcpUnreadable: true })] }));
    expect([pluginServer, pluginSkill].map(mcp)).toEqual([true, false]);
    const dir = unseenInUnreadablePlace(facts({ plugins: [plugin({})], unreadableDirs: [join(home, "plugins", "cache", "m", "p", "1", "skills")] }));
    expect([pluginSkill, pluginServer].map(dir)).toEqual([true, false]);
  });

  it("링크로 건 플러그인의 스킬을 찾는 폴더를 읽지 못하면, 링크의 표기로 적힌 그 폴더를 놓인 곳의 실제 경로로 옮겨 견준다", () => {
    const link = join(app, "links", "p");
    const linked = plugin({ installPath: link, installRealPath: norm(join(home, "plugins", "cache", "m", "p", "1")) });
    const dir = unseenInUnreadablePlace(facts({ plugins: [linked], unreadableDirs: [join(link, "skills")] }));
    expect([pluginSkill, pluginServer].map(dir)).toEqual([true, false]);
    // 읽지 못한 폴더 밖에 있는 그 플러그인의 스킬(매니페스트가 가리킨 다른 폴더의 것)은 아니다
    const elsewhere = skillInstallKey(skill({ scope: "plugin", name: "p:b", pluginId: "p@m", realPath: norm(join(home, "plugins", "cache", "m", "p", "1", "extra", "b")) }));
    expect(dir(elsewhere)).toBe(false);
    // 놓인 곳의 실제 경로를 모르는 플러그인은 옮겨 견줄 수 없다
    const unknownReal = unseenInUnreadablePlace(facts({ plugins: [plugin({ installPath: link, installRealPath: null })], unreadableDirs: [join(link, "skills")] }));
    expect(unknownReal(pluginSkill)).toBe(false);
  });

  it("이름의 앞부분이 같은 옆 폴더는 그 플러그인의 놓인 곳 안이 아니다", () => {
    const sibling = skillInstallKey(skill({ scope: "plugin", name: "p2:a", realPath: norm(join(home, "plugins", "cache", "m", "p", "10", "skills", "a")) }));
    expect(unseenInUnreadablePlace(facts({ plugins: [plugin({ compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }))(sibling)).toBe(false);
  });

  it("같은 설치 ID로 놓인 곳이 여럿이면 하나라도 읽지 못한 것이면 그 서버가 그렇다", () => {
    const two = [plugin({}), plugin({ installPath: join(app, "p"), installRealPath: norm(join(app, "p")), mcpUnreadable: true })];
    expect(unseenInUnreadablePlace(facts({ plugins: two }))(pluginServer)).toBe(true);
  });

  it("설치 기록 파일을 읽지 못한 점검에서는 플러그인의 스킬과 서버를 모두 남긴다. 파일이 없는 것은 읽지 못한 것이 아니다", () => {
    for (const status of ["unparsable", "unreadable"] as const) {
      const keep = unseenInUnreadablePlace(facts({ pluginsFile: status }));
      expect([pluginSkill, pluginServer, userSkill, userServer].map(keep)).toEqual([true, true, false, false]);
    }
    expect([pluginSkill, pluginServer].map(unseenInUnreadablePlace(facts({ pluginsFile: "missing" })))).toEqual([false, false]);
  });

  it("모양이 다른 열쇠는 남기지 않는다", () => {
    const keep = unseenInUnreadablePlace(facts({ claudeJson: "unparsable", pluginsFile: "unparsable", unreadableDirs: [join(home, "skills")] }));
    expect(["not json", "[]", JSON.stringify(["skill", "codex", "user", "", "a", "/x"]), JSON.stringify(["mcp", "claude-code", "user"]), JSON.stringify({ a: 1 })].map(keep)).toEqual([false, false, false, false, false]);
  });
});
