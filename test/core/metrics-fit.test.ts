// 셋팅으로 재는 상황 적합 규칙 넷(F3, F4, F5, F6)을 시험한다. 대상과 주로 쓴 도구, 견주는 것을 읽지 못했을 때, 남는 사본의 점수(설계 11.3 「상황 적합」, 11.4 「규칙마다의 이유」)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolId } from "../../src/adapters/types.ts";
import { fitToolRules, mergedFitRules } from "../../src/core/metrics/fit.ts";
import type { ToolSetup } from "../../src/core/metrics/setup.ts";
import { projectLookup, projectUsage } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, ProjectFact } from "../../src/scan/types.ts";
import { facts, instructionFile, instructions, project, skill } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const at = (cwd: string, count = 1): SummaryInput[] => Array.from({ length: count }, () => ({ cwd, days: { "2026-11-10": { responses: 1 } } }));
const tool = (setup: Partial<ClaudeSetupFacts> = {}, sessions: SummaryInput[] = [], id = "claude-code"): ToolSetup => ({
  tool: id as ToolId,
  totals: toolTotals(sessions.map((s) => summary(s)), windows, ["Bash"]),
  coverage: CLAUDE_COVERAGE,
  setup: facts(setup),
  highestVersion: "2.1.300",
});
/** 프로젝트 목록은 첫 도구의 것이다. 세션의 작업 폴더는 이미 정규화한 꼴로 적는다 */
const merged = (...tools: ToolSetup[]) => {
  const projects = tools[0]?.setup.projects ?? [];
  const normalized = Object.fromEntries(projects.flatMap((p) => p.cwds.map((cwd) => [cwd, cwd])));
  return mergedFitRules(tools, projectUsage(tools, projectLookup(projects, normalized)));
};
const written = (path: string, lineHashes: string[] = []) => instructions({ files: [instructionFile(path)], lineHashes });
const withGuide = (root: string, input: Partial<ProjectFact> = {}): ProjectFact => project(root, { instructions: written(`${root}/CLAUDE.md`), ...input });

describe("F3 자주 쓰는 프로젝트에 지침이 있다", () => {
  it("점수 구간에 주 세션이 3개 이상인 프로젝트 가운데 프로젝트 지침이 있는 몫이다", () => {
    const projects = [withGuide("/work/a"), project("/work/b"), withGuide("/work/c"), project("/work/rare")];
    const result = merged(tool({ projects }, [...at("/work/a", 3), ...at("/work/b", 4), ...at("/work/c", 5), ...at("/work/rare", 2)]));
    expect(result.F3).toEqual({ status: "scored", value: 2 / 3, evidence: { targets: 3, withInstructions: 2 } });
    expect(result.missingInstructions).toEqual([{ normRoot: "/work/b", tools: ["claude-code"] }]);
  });
  it("대상은 깃 저장소 뿌리이거나, 깃이 아니어도 프로젝트 지침이나 설정이 이미 있는 폴더다", () => {
    const projects = [
      project("/work/plain", { kind: "folder" }),
      project("/work/has-settings", { kind: "folder", hasSettings: true, settingsStatus: "ok" }),
      project("/work/has-local", { kind: "folder", hasLocalSettings: true, localSettingsStatus: "ok" }),
      withGuide("/work/has-guide", { kind: "folder" }),
      project("/work/unread-guide", { kind: "folder", instructions: instructions({ unreadable: ["/work/unread-guide/CLAUDE.md"] }) }),
    ];
    const sessions = projects.flatMap((p) => at(p.normRoot, 3));
    const result = merged(tool({ projects }, sessions));
    expect(result.F3).toMatchObject({ status: "scored", value: 0.25, evidence: { targets: 4, withInstructions: 1 } });
    expect(result.missingInstructions.map((m) => m.normRoot)).toEqual(["/work/has-local", "/work/has-settings", "/work/unread-guide"]);
  });
  it("프로젝트로 보지 않는 폴더와 지금 PC에 없는 작업 폴더는 대상에서 뺀다", () => {
    const projects = [withGuide("/home/u", { excluded: true }), project("/work/gone", { exists: false, kind: "folder" }), withGuide("/work/a")];
    expect(merged(tool({ projects }, [...at("/home/u", 9), ...at("/work/gone", 9), ...at("/work/a", 3)])).F3).toMatchObject({ status: "scored", value: 1, evidence: { targets: 1 } });
  });
  it("대상 프로젝트가 없으면 not_applicable이다. 주 세션 3개는 최소 개수가 아니라 자주 쓴다는 뜻이다", () => {
    const projects = [project("/work/a")];
    expect(merged(tool({ projects }, at("/work/a", 2))).F3).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { targets: 0, withInstructions: 0 } });
    expect(merged().F3).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it("지침이 있다는 것은 내용이 있는 파일이 하나라도 있는 것이다. 빈 파일과 읽지 못한 파일은 세지 않는다", () => {
    const empty = instructions({ files: [instructionFile("/work/a/CLAUDE.md", { bytes: 3, hasContent: false })] });
    const unreadable = instructions({ unreadable: ["/work/b/CLAUDE.md"] });
    const mixed = instructions({ files: [instructionFile("/work/c/CLAUDE.md", { hasContent: false }), instructionFile("/work/c/.claude/rules/x.md", { bytes: 12 })] });
    const projects = [project("/work/a", { instructions: empty }), project("/work/b", { instructions: unreadable }), project("/work/c", { instructions: mixed })];
    const result = merged(tool({ projects }, projects.flatMap((p) => at(p.normRoot, 3))));
    expect(result.F3).toMatchObject({ status: "scored", evidence: { targets: 3, withInstructions: 1 } });
    expect(result.missingInstructions.map((m) => m.normRoot)).toEqual(["/work/a", "/work/b"]);
  });
  it("전역 지침과 같은 파일뿐인 프로젝트 지침도 지침이다", () => {
    const linked = instructions({ files: [instructionFile("/work/a/CLAUDE.md", { sameAsGlobal: true })] });
    expect(merged(tool({ projects: [project("/work/a", { instructions: linked })] }, at("/work/a", 3))).F3).toMatchObject({ status: "scored", value: 1 });
  });

  describe("지침은 그 프로젝트에서 주로 쓴 도구마다 본다", () => {
    const claudeOnly = (root: string) => [withGuide(root)];
    it("대상은 도구를 합쳐 세고, 주 세션이 3개 이상인 도구마다 그 도구가 읽는 지침이 있어야 한다", () => {
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3));
      const codex = tool({ projects: [project("/work/a")] }, at("/work/a", 3), "codex");
      const result = merged(claude, codex);
      expect(result.F3).toMatchObject({ status: "scored", value: 0, evidence: { targets: 1, withInstructions: 0 } });
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
    it("한 도구로 여러 번 일하고 다른 도구를 한 번 열어 본 프로젝트는 여러 번 쓴 도구만 본다", () => {
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 20));
      const codex = tool({ projects: [project("/work/a")] }, at("/work/a", 1), "codex");
      expect(merged(claude, codex).F3).toMatchObject({ status: "scored", value: 1 });
    });
    it("어느 도구도 3개에 못 미치면 주 세션이 가장 많은 도구를 본다. 수가 같으면 그 도구들 모두다", () => {
      const more = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 2)), tool({ projects: [project("/work/a")] }, at("/work/a", 1), "codex"));
      expect(more.F3).toMatchObject({ status: "scored", value: 1 });
      const tie = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 2)), tool({ projects: [project("/work/a")] }, at("/work/a", 2), "codex"));
      expect(tie.F3).toMatchObject({ status: "scored", value: 0 });
      expect(tie.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
    it("그 도구의 셋팅 사실에 그 프로젝트가 없으면 그 도구의 지침은 없는 것이다", () => {
      const result = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3)), tool({ projects: [] }, at("/work/a", 3), "codex"));
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
  });
});

describe("F4 전역과 프로젝트 지침이 겹치지 않는다", () => {
  const GLOBAL = written("/home/u/.claude/CLAUDE.md", ["g1", "g2", "g3", "g4"]);
  const withLines = (root: string, lineHashes: string[], input: Partial<ProjectFact> = {}) => project(root, { instructions: written(`${root}/CLAUDE.md`, lineHashes), ...input });

  it("전역 지침의 줄 가운데 프로젝트 지침에 다시 나오는 몫이고, 프로젝트 가운데 가장 큰 값이다", () => {
    const projects = [withLines("/work/a", ["g1", "x"]), withLines("/work/b", ["g1", "g2", "g3", "y"]), withLines("/work/c", [])];
    const result = merged(tool({ globalInstructions: GLOBAL, projects }));
    expect(result.F4).toEqual({ status: "scored", value: 0.75, evidence: { comparedProjects: 3, globalLines: 4, overlappingLines: 3 } });
    expect(result.worstOverlap).toEqual({ tool: "claude-code", normRoot: "/work/b" });
  });
  it("세션을 세지 않는다. 점수 구간에 쓰지 않은 프로젝트의 지침도 견준다", () => {
    expect(merged(tool({ globalInstructions: GLOBAL, projects: [withLines("/work/idle", ["g1", "g2", "g3", "g4"])] })).F4).toMatchObject({ status: "scored", value: 1 });
  });
  it("지금 PC에 없는 작업 폴더, 프로젝트로 보지 않는 폴더, 견줄 지침이 없는 프로젝트는 뺀다", () => {
    const sameFile = instructions({ files: [instructionFile("/work/link/CLAUDE.md", { sameAsGlobal: true })] });
    const projects = [withLines("/work/a", ["g1"]), withLines("/home/u", ["g1", "g2", "g3"], { excluded: true }), project("/work/none"), project("/work/link", { instructions: sameFile }), project("/work/gone", { exists: false })];
    const result = merged(tool({ globalInstructions: GLOBAL, projects }));
    expect(result.F4).toEqual({ status: "scored", value: 0.25, evidence: { comparedProjects: 1, globalLines: 4, overlappingLines: 1 } });
  });
  it("가장 큰 값이 같은 프로젝트가 여럿이면 정규화한 뿌리가 앞선 것을 가리킨다", () => {
    const projects = [withLines("/work/b", ["g1", "g2"]), withLines("/work/a", ["g3", "g4"])];
    expect(merged(tool({ globalInstructions: GLOBAL, projects })).worstOverlap).toEqual({ tool: "claude-code", normRoot: "/work/a" });
  });
  it("한쪽 지침이 없거나 전역 지침에 견줄 줄이 없으면 not_applicable이다", () => {
    const NA = { status: "unmeasured", reason: "not_applicable" };
    expect(merged(tool({ projects: [withLines("/work/a", ["g1"])] })).F4).toMatchObject(NA);
    expect(merged(tool({ globalInstructions: GLOBAL, projects: [project("/work/a")] })).F4).toMatchObject(NA);
    expect(merged(tool({ globalInstructions: GLOBAL })).F4).toMatchObject(NA);
    expect(merged(tool({ globalInstructions: written("/home/u/.claude/CLAUDE.md", []), projects: [withLines("/work/a", ["g1"])] })).F4).toMatchObject(NA);
    expect(merged(tool({ globalInstructions: GLOBAL })).F4).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { comparedProjects: 0, globalLines: 4, overlappingLines: 0 } });
    expect(merged().F4).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { comparedProjects: 0, globalLines: 0, overlappingLines: 0 } });
    expect(merged().worstOverlap).toBeNull();
  });
  it.each([
    ["전역 지침 파일", { globalInstructions: { ...GLOBAL, unreadable: ["/home/u/.claude/rules/x.md"] } }],
    ["전역 규칙 폴더의 목록", { globalInstructions: { ...GLOBAL, unreadableDirs: ["/home/u/.claude/rules"] } }],
    ["프로젝트 지침 파일", { globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"]), project("/work/b", { instructions: instructions({ unreadable: ["/work/b/CLAUDE.md"] }) })] }],
    ["프로젝트 규칙 폴더의 목록", { globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"], {}), project("/work/b", { instructions: instructions({ unreadableDirs: ["/work/b/.claude/rules"] }) })] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("견주는 것을 하나라도 읽지 못하면 보이는 것이 있어도 unreadable이다: %s", (_name, setup) => {
    const result = merged(tool(setup));
    expect(result.F4).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { comparedProjects: null, globalLines: null, overlappingLines: null } });
    expect(result.worstOverlap).toBeNull();
  });
  it("읽지 못한 것이 견줄 것이 없는 까닭보다 앞선다", () => {
    const setup = { projects: [project("/work/b", { instructions: instructions({ unreadable: ["/work/b/CLAUDE.md"] }) })] };
    expect(merged(tool(setup)).F4).toMatchObject({ status: "unmeasured", reason: "unreadable" });
  });
  it("도구가 여럿이면 도구마다 제 전역 지침과 제 프로젝트 지침을 견주어 가장 큰 값을 낸다", () => {
    const claude = tool({ globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"])] });
    const codex = tool({ globalInstructions: written("/home/u/.codex/AGENTS.md", ["c1", "c2"]), projects: [withLines("/work/a", ["c1", "c2"])] }, [], "codex");
    const result = merged(claude, codex);
    expect(result.F4).toEqual({ status: "scored", value: 1, evidence: { comparedProjects: 2, globalLines: 2, overlappingLines: 2 } });
    expect(result.worstOverlap).toEqual({ tool: "codex", normRoot: "/work/a" });
    expect(merged(claude, tool({}, [], "codex")).F4).toMatchObject({ status: "scored", value: 0.25 });
  });
});

describe("F5 같은 이름 스킬이 한 곳에만 있다", () => {
  const f5 = (setup: Partial<ClaudeSetupFacts>) => fitToolRules(tool(setup)).F5;
  const inProject = (name: string, root: string, input = {}) => skill(name, { scope: "project", projectRoot: root, path: `${root}/.claude/skills/${name}`, ...input });

  it("남는 사본의 점수 합을 스킬 종 수로 나눈다. 내용이 모두 같으면 하나에 1점, 다르면 2점이다", () => {
    const skills = [
      skill("same"),
      inProject("same", "/work/a"),
      inProject("same", "/work/b"),
      skill("differs"),
      inProject("differs", "/work/a", { contentHash: "other" }),
      skill("single"),
      inProject("only-project", "/work/a"),
    ];
    expect(f5({ skills })).toEqual({ status: "scored", value: 1, evidence: { differingCopies: 1, identicalCopies: 2, skillKinds: 4 } });
  });
  it("내용 지문을 만들지 못한 사본이 있으면 견줄 수 없으므로 2점으로 친다", () => {
    expect(f5({ skills: [skill("x"), inProject("x", "/work/a", { contentHash: null })] })).toMatchObject({ status: "scored", value: 2, evidence: { differingCopies: 1, identicalCopies: 0 } });
    expect(f5({ skills: [skill("x", { contentHash: null }), inProject("x", "/work/a", { contentHash: null })] })).toMatchObject({ status: "scored", value: 2 });
  });
  it("링크와 실제 경로가 같은 위치는 사본이 아니다. 종에는 든다", () => {
    const skills = [
      skill("linked"),
      inProject("linked", "/work/a", { isLink: true, realPath: "/home/u/.claude/skills/linked" }),
      skill("alias", { realPath: "/store/alias" }),
      inProject("alias", "/work/a", { realPath: "/store/alias" }),
      inProject("link-only", "/work/a", { isLink: true, realPath: "/store/link-only" }),
    ];
    expect(f5({ skills })).toEqual({ status: "scored", value: 0, evidence: { differingCopies: 0, identicalCopies: 0, skillKinds: 3 } });
  });
  it("플러그인이 넣은 스킬은 사본으로도 종으로도 세지 않는다", () => {
    const fromPlugin = skill("p:same", { scope: "plugin", pluginId: "p@m", path: "/home/u/.claude/plugins/cache/p/skills/same" });
    expect(f5({ skills: [skill("same"), fromPlugin, skill("same", { scope: "plugin", pluginId: "q@m", path: "/q/skills/same" })] })).toMatchObject({ status: "scored", value: 0, evidence: { skillKinds: 1 } });
    expect(f5({ skills: [fromPlugin] })).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it("꺼 둔 스킬도 놓여 있는 사본이다", () => {
    expect(f5({ skills: [skill("x", { enabled: false }), inProject("x", "/work/a")] })).toMatchObject({ status: "scored", value: 1 });
  });
  it("스킬 종 수가 0이면 not_applicable이다", () => {
    expect(f5({})).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { differingCopies: 0, identicalCopies: 0, skillKinds: 0 } });
  });
  it("사용자나 프로젝트의 스킬 폴더의 목록을 읽지 못했으면 보이는 스킬에 남는 사본이 없어도 unreadable이다", () => {
    const unread = { status: "unmeasured", reason: "unreadable", evidence: { differingCopies: null, identicalCopies: null, skillKinds: null } };
    expect(f5({ skills: [skill("x")], unreadableSkillPlaces: { user: false, projects: ["/work/a"], plugins: [] } })).toEqual(unread);
    expect(f5({ unreadableSkillPlaces: { user: true, projects: [], plugins: [] } })).toEqual(unread);
  });
  it("플러그인의 스킬을 찾는 폴더는 상관없다. 플러그인이 넣은 사본은 처음부터 세지 않는다", () => {
    expect(f5({ skills: [skill("x")], unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } })).toMatchObject({ status: "scored", value: 0 });
  });
});

describe("F6 전역과 프로젝트 설정이 부딪히지 않는다", () => {
  const withSettings = (root: string, permissionConflicts: number, input: Partial<ProjectFact> = {}) => project(root, { hasSettings: true, settingsStatus: "ok", permissionConflicts, ...input });

  it("목록의 프로젝트마다 사용자 설정과 부딪히는 쌍의 수를 더한다", () => {
    const projects = [withSettings("/work/a", 2), withSettings("/work/b", 0), project("/work/c", { hasLocalSettings: true, localSettingsStatus: "ok", permissionConflicts: 1 }), project("/work/none")];
    expect(merged(tool({ projects })).F6).toEqual({ status: "scored", value: 3, evidence: { conflicts: 3, projectsWithSettings: 3 } });
  });
  it("목록의 프로젝트 어디에도 프로젝트 설정과 로컬 설정이 없으면 not_applicable이다", () => {
    const NA = { status: "unmeasured", reason: "not_applicable", evidence: { conflicts: 0, projectsWithSettings: 0 } };
    expect(merged(tool({ projects: [project("/work/a")] })).F6).toEqual(NA);
    expect(merged(tool()).F6).toEqual(NA);
    expect(merged().F6).toEqual(NA);
  });
  it("사용자 설정이 없어도 프로젝트 쪽 설정이 있으면 잰다. 부딪히는 쌍은 없다", () => {
    const settings = { ...facts().settings, user: "missing" as const };
    expect(merged(tool({ settings, projects: [withSettings("/work/a", 0)] })).F6).toMatchObject({ status: "scored", value: 0 });
  });
  it.each([
    ["사용자 설정이 풀리지 않는다", { settings: { ...facts().settings, user: "unparsable" }, projects: [withSettings("/work/a", 0)] }],
    ["사용자 설정을 열지 못한다", { settings: { ...facts().settings, user: "unreadable" } }],
    ["프로젝트 설정", { projects: [withSettings("/work/a", 1), withSettings("/work/b", 0, { settingsStatus: "unparsable" })] }],
    ["로컬 설정", { projects: [withSettings("/work/a", 1, { hasLocalSettings: true, localSettingsStatus: "unreadable" })] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("견주는 설정 파일을 하나라도 읽지 못하면 unreadable이다: %s", (_name, setup) => {
    expect(merged(tool(setup)).F6).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { conflicts: null, projectsWithSettings: null } });
  });
  it("관리 정책 파일은 처음부터 견주지 않는다. 읽지 못해도 잰다", () => {
    const settings = { ...facts().settings, managedParts: [{ path: "/etc/claude-code/managed-settings.json", status: "unreadable" as const }] };
    expect(merged(tool({ settings, projects: [withSettings("/work/a", 1)] })).F6).toMatchObject({ status: "scored", value: 1 });
  });
  it("도구가 여럿이면 부딪히는 쌍을 더하고, 한 도구의 설정만 읽지 못해도 규칙 전체가 unreadable이다", () => {
    const claude = tool({ projects: [withSettings("/work/a", 2)] });
    expect(merged(claude, tool({ projects: [withSettings("/work/a", 1)] }, [], "codex")).F6).toEqual({ status: "scored", value: 3, evidence: { conflicts: 3, projectsWithSettings: 2 } });
    expect(merged(claude, tool({}, [], "codex")).F6).toMatchObject({ status: "scored", value: 2 });
    expect(merged(claude, tool({ settings: { ...facts().settings, user: "unreadable" } }, [], "codex")).F6).toMatchObject({ status: "unmeasured", reason: "unreadable" });
  });
});
