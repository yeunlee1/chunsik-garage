// Codex 셋팅 사실의 설치 열쇠 모으기와, 관측 기록에만 있고 이번 점검에 보이지 않는 Codex 설치가 읽지 못한 곳에 든 것인지 가르는 함수를 시험한다(설계 18.1, 「5단계 2부 계획 전 결정」 9번)
import { describe, expect, it } from "vitest";
import { emptyInstructionSet } from "../../src/scan/instructions.ts";
import { codexInstallKeysOf, codexMcpInstallKey, codexSkillInstallKey, codexUnseenInUnreadablePlace, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { CodexPluginFact, CodexProjectFact, CodexSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";

const P = "c:/work/p";
const Q = "c:/work/q";
const GONE = "c:/work/gone";

const skill = (scope: SkillFact["scope"], name: string, projectRoot: string | null = null, pluginId: string | null = null): Omit<SkillFact, "installKey"> => ({
  scope,
  name,
  recordNames: [name],
  path: `c:/x/${name}`,
  realPath: `c:/x/${name}`,
  isLink: false,
  contentHash: null,
  createdMs: null,
  targetCreatedMs: null,
  projectRoot,
  pluginId,
  enabled: true,
  listed: true,
  readable: true,
  nameUnreadable: false,
  managedFixed: false,
  hookProvided: false,
  usageLastUsedMs: null,
  usageUndated: false,
});
const server = (scope: McpFact["scope"], name: string, projectRoot: string | null = null, pluginId: string | null = null, definitionHash: string | null = "h"): Omit<McpFact, "installKey"> => ({
  scope,
  name,
  recordNames: [name],
  projectRoot,
  pluginId,
  definitionHash,
  enabled: true,
  managedFixed: false,
});
const plugin = (id: string, extra: Partial<CodexPluginFact> = {}): CodexPluginFact => ({ id, configured: true, enabled: true, idValid: true, install: "ok", manifest: "ok", namespace: id.split("@")[0]!, compositionKnown: true, mcpUnreadable: false, skills: [], ...extra });
const project = (normRoot: string, configStatus: CodexProjectFact["configStatus"] = "ok"): CodexProjectFact => ({ normRoot, scanned: true, trust: "trusted", configStatus, instructions: emptyInstructionSet(), safety: null });

function facts(extra: Partial<CodexSetupFacts> = {}): CodexSetupFacts {
  return {
    tool: "codex",
    home: "c:/home/.codex",
    config: "ok",
    globalInstructions: emptyInstructionSet(),
    globalMentions: {},
    safety: { approval: null, sandbox: null, permissions: null, fullAccess: false },
    skills: [],
    mcpServers: [],
    plugins: [plugin("a@m"), plugin("b@m")],
    projects: [project(P), project(Q), { ...project(GONE), scanned: false, configStatus: null }],
    problems: [],
    secrets: [],
    unreadableDirs: [],
    unreadableSkillPlaces: { user: false, projects: [], plugins: [] },
    ...extra,
  };
}

const keys = {
  userSkill: codexSkillInstallKey(skill("user", "u")),
  pSkill: codexSkillInstallKey(skill("project", "ps", P)),
  qSkill: codexSkillInstallKey(skill("project", "qs", Q)),
  pluginSkill: codexSkillInstallKey(skill("plugin", "a:s", null, "a@m")),
  userServer: codexMcpInstallKey(server("user", "us"))!,
  pServer: codexMcpInstallKey(server("project", "psrv", P))!,
  qServer: codexMcpInstallKey(server("project", "qsrv", Q))!,
  goneServer: codexMcpInstallKey(server("project", "gsrv", GONE))!,
  aServer: codexMcpInstallKey(server("plugin", "as", null, "a@m"))!,
  bServer: codexMcpInstallKey(server("plugin", "bs", null, "b@m"))!,
};
const unseen = (f: CodexSetupFacts): Record<keyof typeof keys, boolean> => {
  const check = codexUnseenInUnreadablePlace(f);
  return Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, check(key)])) as Record<keyof typeof keys, boolean>;
};

describe("Codex 설치의 정체 열쇠", () => {
  it("도구 칸이 codex이고 Claude Code의 열쇠와 다르다", () => {
    expect(JSON.parse(keys.userSkill)[1]).toBe("codex");
    expect(keys.userSkill).not.toBe(skillInstallKey(skill("user", "u")));
    expect(keys.userServer).not.toBe(mcpInstallKey(server("user", "us")));
    expect(codexMcpInstallKey(server("user", "x", null, null, null))).toBeNull();
  });

  it("codexInstallKeysOf는 사실에 붙은 열쇠를 중복 없이 차례대로 모으고 정의가 없는 서버는 뺀다", () => {
    const withKeys = facts({
      skills: [skill("user", "b"), skill("user", "a"), skill("user", "a")].map((s) => ({ ...s, installKey: codexSkillInstallKey(s) })),
      mcpServers: [server("user", "s"), server("user", "n", null, null, null)].map((s) => ({ ...s, installKey: codexMcpInstallKey(s) })),
    });
    expect(codexInstallKeysOf(withKeys)).toEqual([codexSkillInstallKey(skill("user", "a")), codexSkillInstallKey(skill("user", "b")), codexMcpInstallKey(server("user", "s"))!].sort());
  });
});

describe("codexUnseenInUnreadablePlace", () => {
  it("모두 읽었으면 어느 것도 읽지 못한 곳에 든 것이 아니다", () => {
    expect(Object.values(unseen(facts())).every((value) => !value)).toBe(true);
  });

  it("사용자 설정을 읽지 못하면 서버(신뢰와 플러그인 항목도 그 파일에서 얻는다)와 플러그인 스킬이 읽지 못한 곳에 든 것이다. 찾는 곳의 스킬은 상관없다", () => {
    for (const config of ["unparsable", "unreadable"] as const) {
      const result = unseen(facts({ config }));
      expect([result.userServer, result.pServer, result.qServer, result.aServer, result.bServer, result.pluginSkill]).toEqual([true, true, true, true, true, true]);
      expect([result.userSkill, result.pSkill, result.goneServer]).toEqual([false, false, false]);
    }
    expect(unseen(facts({ config: "missing" })).userServer).toBe(false);
  });

  it("신뢰한 프로젝트의 설정을 읽지 못하면 그 프로젝트의 서버만 읽지 못한 곳에 든 것이다. 읽지 않는 프로젝트의 것은 없어진 것이다", () => {
    const result = unseen(facts({ projects: [project(P, "unreadable"), project(Q), { ...project(GONE), scanned: false, configStatus: null }] }));
    expect([result.pServer, result.qServer, result.goneServer, result.userServer]).toEqual([true, false, false, false]);
    expect(unseen(facts({ projects: [project(P, "unparsable"), project(Q)] })).pServer).toBe(true);
  });

  it("구성을 모르거나 MCP 정의를 읽지 못한 플러그인의 서버, 스킬 폴더를 다 읽지 못한 플러그인과 구성을 모르는 플러그인이 있으면 플러그인 스킬이 읽지 못한 곳에 든 것이다", () => {
    const unknown = unseen(facts({ plugins: [plugin("a@m", { compositionKnown: false }), plugin("b@m")] }));
    expect([unknown.aServer, unknown.bServer, unknown.pluginSkill]).toEqual([true, false, true]);
    const noMcp = unseen(facts({ plugins: [plugin("a@m"), plugin("b@m", { mcpUnreadable: true })] }));
    expect([noMcp.aServer, noMcp.bServer, noMcp.pluginSkill]).toEqual([false, true, false]);
    expect(unseen(facts({ unreadableSkillPlaces: { user: false, projects: [], plugins: ["a@m"] } })).pluginSkill).toBe(true);
    // 꺼진 플러그인의 구성을 모르는 것은 상관없다
    expect(unseen(facts({ plugins: [plugin("a@m", { compositionKnown: false, configured: false, enabled: false }), plugin("b@m")] })).pluginSkill).toBe(false);
  });

  it("목록을 다 읽지 못한 찾는 곳의 스킬이 읽지 못한 곳에 든 것이다", () => {
    const result = unseen(facts({ unreadableSkillPlaces: { user: true, projects: [P], plugins: [] } }));
    expect([result.userSkill, result.pSkill, result.qSkill, result.pluginSkill]).toEqual([true, true, false, false]);
  });

  it("Claude Code의 열쇠와 깨진 열쇠는 상관없다", () => {
    const check = codexUnseenInUnreadablePlace(facts({ config: "unreadable" }));
    expect(check(mcpInstallKey(server("user", "us"))!)).toBe(false);
    expect(check("{깨진")).toBe(false);
    expect(check(JSON.stringify(["mcp", "codex"]))).toBe(false);
  });
});
