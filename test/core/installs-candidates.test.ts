// 정비 후보(A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기)를 내는 조건을 시험한다. 적용은 하지 않고 후보의 유무와 목록만 본다(설계 16.1, 16.2, 21.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { candidatesOf, NO_SELF, type SelfIdentity } from "../../src/core/installs/candidates.ts";
import { sessionListings } from "../../src/core/installs/listing.ts";
import { judgeServers } from "../../src/core/installs/servers.ts";
import { calledMcpNames, usedSkillNames } from "../../src/core/installs/signals.ts";
import { judgeSkills } from "../../src/core/installs/skills.ts";
import { recordMap, type VerdictContext } from "../../src/core/installs/verdict.ts";
import type { ToolSetup } from "../../src/core/metrics/setup.ts";
import { projectLookup } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, McpFact, PluginFact, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts, mcpServer, plugin, skill } from "../helpers/facts.ts";
import { summary } from "../helpers/summaries.ts";

const NOW = Date.UTC(2026, 10, 13, 3, 0);
const windows = makeWindows(NOW, "Asia/Seoul");
const day = { today: windows.today, timeZone: "Asia/Seoul" };
const lookup = projectLookup([], {});

interface Options {
  usedSkills?: string[];
  calledServers?: string[];
  /** 같은 정체로 14일 넘게 지켜본 설치. 적지 않으면 셋팅의 모든 스킬과 서버다 */
  watched?: (SkillFact | McpFact)[];
  complete?: boolean;
  self?: SelfIdentity;
}
const run = (setup: Partial<ClaudeSetupFacts>, options: Options = {}) => {
  const cell = {
    responses: 1,
    skillSignals: Object.fromEntries((options.usedSkills ?? []).map((name) => [name, { tool: 1 }])),
    mcpCalls: Object.fromEntries((options.calledServers ?? []).map((name) => [name, 1])),
  };
  const summaries = [summary({ days: { "2026-11-10": cell } })];
  const all = [...(setup.skills ?? []), ...(setup.mcpServers ?? [])];
  const records: InstallRecord[] = (options.watched ?? all).flatMap((fact) => (fact.installKey === null ? [] : [{ key: fact.installKey, firstSeen: "2026-09-01", appeared: false }]));
  const base = { day, windows, records: recordMap(records), complete: options.complete ?? true };
  const skillContext: VerdictContext = { ...base, used: usedSkillNames(summaries, windows), listings: sessionListings(summaries, "skill", {}, lookup) };
  const serverContext: VerdictContext = { ...base, used: calledMcpNames(summaries, windows), listings: sessionListings(summaries, "mcp", {}, lookup) };
  const tool: ToolSetup = { tool: "claude-code", totals: toolTotals(summaries, windows, []), coverage: CLAUDE_COVERAGE, setup: facts(setup), highestVersion: "2.1.300" };
  const skills = judgeSkills(tool, skillContext);
  const servers = judgeServers(tool, serverContext);
  return { skills, servers, candidates: candidatesOf(tool, skills, servers, day, options.self ?? NO_SELF) };
};
const ids = (result: ReturnType<typeof run>): string[] => result.candidates.map((candidate) => candidate.id);
const inProject = (name: string, input: Partial<SkillFact> = {}) => skill(name, { scope: "project", projectRoot: "/work/app", path: `/work/app/.claude/skills/${name}`, ...input });
const ofPlugin = (pluginId: string, name: string, input: Partial<SkillFact> = {}) => {
  const short = pluginId.split("@")[0]!;
  return skill(`${short}:${name}`, { scope: "plugin", pluginId, path: `/home/u/.claude/plugins/cache/${pluginId}/skills/${name}`, ...input });
};

describe("A1 스킬 끄기", () => {
  it("스킬 묶음이 안 쓴 것이 확인됨이고 사용자 범위의 위치가 있으면 그 이름으로 낸다", () => {
    const result = run({ skills: [skill("idle"), skill("busy")] }, { usedSkills: ["busy"] });
    expect(result.candidates).toEqual([{ id: "A1:claude-code:idle", unit: "A1", rule: "E5", tool: "claude-code", target: "idle" }]);
  });
  it("프로젝트 범위에만 있는 스킬과 플러그인의 스킬은 스킬 끄기 후보가 아니다. 꺼 둔 스킬도 아니다", () => {
    const setup = { skills: [inProject("shared"), ofPlugin("p@m", "s", { hookProvided: false }), skill("off", { enabled: false })], plugins: [plugin("p@m", { components: ["skills", "agents"] })] };
    expect(ids(run(setup)).filter((id) => id.startsWith("A1"))).toEqual([]);
  });
  it("사용자 폴더와 프로젝트 폴더가 같은 원본을 가리키면 한 묶음이다. 묶음이 확인됨이면 사용자 범위 위치의 이름으로 낸다", () => {
    const skills = [skill("tool", { realPath: "/store/tool" }), inProject("tool-link", { isLink: true, realPath: "/store/tool", targetCreatedMs: 0 })];
    expect(ids(run({ skills }))).toEqual(["A1:claude-code:tool"]);
    expect(ids(run({ skills }, { watched: [skills[0]!] }))).toEqual([]);
  });
  it("같은 이름의 스킬이 다른 범위에 따로 있으면 그것도 안 쓴 것이 확인됨이어야 한다. 이름으로 듣는 설정이라 같이 꺼진다", () => {
    const skills = [skill("lint"), inProject("lint")];
    expect(ids(run({ skills }))).toEqual(["A1:claude-code:lint"]);
    expect(ids(run({ skills }, { watched: [skills[0]!] }))).toEqual([]);
    expect(ids(run({ skills: [skill("lint"), inProject("lint", { hookProvided: true })] }))).toEqual([]);
  });
  it("끌 이름을 머리말 이름으로 가진 다른 스킬도 같이 꺼진다. 폴더 이름이 달라도 그 스킬이 안 쓴 것이 확인됨이어야 한다", () => {
    // 설정은 폴더 이름과 머리말 이름 어느 쪽으로도 듣는다. 프로젝트의 y는 머리말 이름이 x라서 x를 끄면 같이 꺼진다
    const skills = [skill("x"), inProject("y", { recordNames: ["x", "y"] })];
    expect(ids(run({ skills }))).toEqual(["A1:claude-code:x"]);
    expect(ids(run({ skills }, { usedSkills: ["y"] }))).toEqual([]);
    expect(ids(run({ skills }, { watched: [skills[0]!] }))).toEqual([]);
    // 사용자 폴더의 다른 스킬이 그 이름을 머리말 이름으로 가져도 같다. 쓰는 쪽의 이름으로는 처음부터 후보가 없다
    const both = [skill("x"), skill("z", { recordNames: ["x", "z"] })];
    expect(ids(run({ skills: both }))).toEqual(["A1:claude-code:x", "A1:claude-code:z"]);
    expect(ids(run({ skills: both }, { usedSkills: ["z"] }))).toEqual([]);
  });
  it("이름 꼴이 같은 플러그인 스킬도 따진다. 이 설정이 플러그인 스킬에 듣지 않는다는 것은 문서로만 봤으므로 엄한 쪽으로 둔다", () => {
    // 사용자 스킬의 이름이 플러그인 스킬의 이름 꼴과 같은 경우다
    const skills = [skill("p:s"), ofPlugin("p@m", "s")];
    const setup = { skills, plugins: [plugin("p@m", { components: ["skills", "agents"] })] };
    expect(ids(run(setup))).toEqual(["A1:claude-code:p:s"]);
    // 플러그인 스킬을 지켜본 기록이 없으면 쓰는지 모름이라 내지 않는다
    expect(ids(run(setup, { watched: [skills[0]!] }))).toEqual([]);
    // 끌 이름이 플러그인 스킬의 이름 꼴이 아니면 그 플러그인 스킬은 같이 꺼지는 것이 아니다
    const other = [skill("mine", { recordNames: ["mine", "p:s"] }), ofPlugin("p@m", "s")];
    expect(ids(run({ ...setup, skills: other }, { watched: [other[0]!] }))).toEqual(["A1:claude-code:mine"]);
  });
  it("같이 꺼지는 스킬 가운데 이 도구 자신이 있으면 내지 않는다. 최근에 쓴 신호가 없어도 같다", () => {
    // 프로젝트에 이 도구의 스킬을 다른 이름의 링크로 걸어 둔 경우다. 이름이 같은 사용자 스킬을 끄면 그것까지 꺼진다
    const skills = [skill("helper"), inProject("helper", { isLink: true, realPath: "/store/aq", targetCreatedMs: 0 })];
    expect(ids(run({ skills }))).toEqual(["A1:claude-code:helper"]);
    expect(ids(run({ skills }, { self: { skillNames: ["aq"], pluginNames: [], skillRealPaths: ["/store/aq"] } }))).toEqual([]);
    // 머리말 이름이 이 도구의 스킬 이름인 것도 자기 자신이다
    const declared = [skill("helper"), inProject("renamed", { recordNames: ["aq", "helper", "renamed"] })];
    expect(ids(run({ skills: declared }))).toEqual(["A1:claude-code:helper"]);
    expect(ids(run({ skills: declared }, { self: { skillNames: ["aq"], pluginNames: [], skillRealPaths: [] } }))).toEqual([]);
    // 끌 이름이 이 도구의 플러그인에 든 스킬의 이름 꼴과 같은 것도 같다
    const withPlugin = { skills: [skill("aq-kit:run"), ofPlugin("aq-kit@m", "run")], plugins: [plugin("aq-kit@m", { components: ["skills", "agents"] })] };
    expect(ids(run(withPlugin))).toEqual(["A1:claude-code:aq-kit:run"]);
    expect(ids(run(withPlugin, { self: { skillNames: [], pluginNames: ["aq-kit"], skillRealPaths: [] } }))).toEqual([]);
  });
  it.each([
    ["구성을 모르는 플러그인", { plugins: [plugin("x@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }],
    ["훅 정의를 읽지 못한 플러그인", { plugins: [plugin("x@m", { hooksUnreadable: true })] }],
    ["설정에 켜 두었는데 설치 기록에 없는 플러그인", { pluginsWithoutInstall: ["ghost@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("훅을 볼 수 없는 켜진 플러그인이 있으면 스킬을 끄는 후보를 내지 않는다. 판정은 그대로다: %s", (_name, setup) => {
    const pluginSkill = ofPlugin("only@m", "s");
    const result = run({ skills: [skill("idle"), pluginSkill], ...setup, plugins: [plugin("only@m"), ...(setup.plugins ?? [])] });
    expect(result.skills.bundles.map((bundle) => bundle.verdict)).toEqual(["unused", "unused"]);
    expect(ids(result)).toEqual([]);
  });
  it("꺼져 있는 플러그인은 훅을 읽지 못해도 상관없다", () => {
    expect(ids(run({ skills: [skill("idle")], plugins: [plugin("x@m", { enabled: false, compositionKnown: false, hooksUnreadable: true })] }))).toEqual(["A1:claude-code:idle"]);
  });
  it("관리 정책이 정한 스킬과 이 도구 자신은 내지 않는다. 자신은 이름과 실제 경로로 견준다", () => {
    expect(ids(run({ skills: [skill("fixed", { managedFixed: true })] }))).toEqual([]);
    const self: SelfIdentity = { skillNames: ["aq"], pluginNames: [], skillRealPaths: ["/home/u/.claude/skills/renamed"] };
    expect(ids(run({ skills: [skill("aq"), skill("renamed"), skill("other")] }, { self }))).toEqual(["A1:claude-code:other"]);
  });
  it("판정할 수 있는 대상이 적어 E5를 못 쟀어도 조건을 채운 후보는 낸다. 관측이 빠졌으면 후보가 없다", () => {
    const few = run({ skills: [skill("idle")] });
    expect(few.skills.measurement).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(ids(few)).toEqual(["A1:claude-code:idle"]);
    expect(ids(run({ skills: [skill("idle")] }, { complete: false }))).toEqual([]);
    expect(ids(run({ skills: [skill("idle")], claudeJson: "unparsable" }))).toEqual([]);
  });
});

describe("A2 플러그인 끄기", () => {
  const SKILLS = [ofPlugin("p@m", "a"), ofPlugin("p@m", "b")];
  const a2 = (pluginInput: Partial<PluginFact> = {}, setup: Partial<ClaudeSetupFacts> = {}, options: Options = {}) =>
    ids(run({ skills: SKILLS, ...setup, plugins: [plugin("p@m", pluginInput), ...(setup.plugins ?? [])] }, options)).filter((id) => id.startsWith("A2"));

  it("스킬만 든 플러그인의 스킬이 모두 안 쓴 것이 확인됨이면 설치 ID로 낸다", () => {
    const result = run({ skills: SKILLS, plugins: [plugin("p@m")] });
    expect(result.candidates).toEqual([{ id: "A2:claude-code:p@m", unit: "A2", rule: "E5", tool: "claude-code", target: "p@m" }]);
  });
  it("① 스킬이 하나라도 쓰였거나 쓰는지 모르면 내지 않는다. 스킬이 없는 플러그인도 내지 않는다", () => {
    expect(a2({}, {}, { usedSkills: ["p:a"] })).toEqual([]);
    expect(a2({}, {}, { watched: [SKILLS[0]!] })).toEqual([]);
    expect(a2({}, { skills: [] })).toEqual([]);
  });
  it("② 스킬 말고 다른 것이 들었거나 ③ 알아보지 못한 것이 있으면 내지 않는다", () => {
    expect(a2({ components: ["skills", "mcpServers"] })).toEqual([]);
    expect(a2({ components: ["skills", "hooks"], hasHooks: true })).toEqual([]);
    expect(a2({ unknownEntries: ["tools"] })).toEqual([]);
  });
  it("④ 도구의 집계가 없거나 마지막 사용이 30일 넘게 전이어야 한다. 집계를 모르면 내지 않는다", () => {
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 1) })).toEqual(["A2:claude-code:p@m"]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 10, 1) })).toEqual([]);
    expect(a2({ usageUndated: true })).toEqual([]);
  });
  it("④의 30일은 날짜로 센다. 마지막 사용이 30일 전이면 내지 않고 31일 전이면 낸다. 같은 날 안의 시각은 결과를 바꾸지 않고 오늘보다 뒤의 시각은 30일 안이다", () => {
    // 평가 시계는 서울의 2026-11-13이다. 30일 전은 10-14이고 31일 전은 10-13이다
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 13, 14, 59) })).toEqual(["A2:claude-code:p@m"]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 12, 15, 0) })).toEqual(["A2:claude-code:p@m"]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 13, 15, 0) })).toEqual([]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 14, 14, 59) })).toEqual([]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 10, 20) })).toEqual([]);
  });
  it("⑤ 켜져 있는 다른 플러그인이 기대거나, 기대는지 알 수 없으면 내지 않는다", () => {
    expect(a2({}, { plugins: [plugin("user@m", { dependencies: ["p"] })] })).toEqual([]);
    expect(a2({}, { plugins: [plugin("user@m", { dependencies: null })] })).toEqual([]);
    expect(a2({}, { plugins: [plugin("user@m", { dependencies: ["p"], enabled: false })] })).toEqual(["A2:claude-code:p@m"]);
    expect(a2({}, { plugins: [plugin("user@m", { dependencies: ["other"] })] })).toEqual(["A2:claude-code:p@m"]);
  });
  it("꺼져 있거나, 관리 정책이 정했거나, 구성을 다 보지 못한 플러그인은 내지 않는다", () => {
    expect(a2({ enabled: false }, { skills: SKILLS.map((s) => ({ ...s, enabled: false })) })).toEqual([]);
    expect(a2({ managedFixed: true })).toEqual([]);
    expect(a2({ mcpUnreadable: true })).toEqual([]);
    expect(a2({}, { unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } })).toEqual([]);
  });
  it("사용자 범위로만 깐 플러그인이어야 한다. 프로젝트에 든 것은 정비하지 않는다", () => {
    expect(a2({ scopes: ["project"], projectRoots: ["/work/app"] })).toEqual([]);
    expect(a2({ scopes: ["project", "user"], projectRoots: ["/work/app"] })).toEqual([]);
  });
  it("같은 설치 ID의 플러그인이 프로젝트의 스킬 폴더에도 따로 있으면 사용자 쪽도 내지 않는다. 같은 열쇠로 켜지고 꺼진다", () => {
    const inUser = plugin("tool@skills-dir", { installPath: "/home/u/.claude/skills/tool" });
    const inProjectDir = plugin("tool@skills-dir", { installPath: "/work/app/.claude/skills/tool", scopes: ["project"], projectRoots: ["/work/app"] });
    const own = [skill("tool:a", { scope: "plugin", pluginId: "tool@skills-dir", path: "/home/u/.claude/skills/tool/skills/a" })];
    const only = ids(run({ skills: own, plugins: [inUser] }));
    expect(only).toEqual(["A2:claude-code:tool@skills-dir"]);
    expect(ids(run({ skills: own, plugins: [inUser, inProjectDir] }))).toEqual([]);
  });
  it("이 도구 자신은 내지 않는다. 플러그인의 두 이름과 스킬의 실제 경로로 견준다", () => {
    expect(a2({}, {}, { self: { skillNames: [], pluginNames: ["p"], skillRealPaths: [] } })).toEqual([]);
    expect(a2({ name: "shown", entryName: "p" }, {}, { self: { skillNames: [], pluginNames: ["shown"], skillRealPaths: [] } })).toEqual([]);
    expect(a2({}, {}, { self: { skillNames: [], pluginNames: [], skillRealPaths: [SKILLS[1]!.realPath!] } })).toEqual([]);
  });
});

describe("A3 서버 막기", () => {
  it("사용자 범위 서버가 안 부른 것이 확인됨이면 그 이름으로 낸다", () => {
    const result = run({ mcpServers: [mcpServer("idle"), mcpServer("busy")] }, { calledServers: ["busy"] });
    expect(result.candidates).toEqual([{ id: "A3:claude-code:idle", unit: "A3", rule: "E6", tool: "claude-code", target: "idle" }]);
  });
  it("로컬 범위, 프로젝트 범위, 플러그인의 서버와 꺼 둔 서버는 서버 막기 후보가 아니다", () => {
    const mcpServers = [mcpServer("loc", { scope: "local", projectRoot: "/work/app" }), mcpServer("proj", { scope: "project", projectRoot: "/work/app" }), mcpServer("plug", { scope: "plugin", pluginId: "p@m" }), mcpServer("off", { enabled: false })];
    expect(ids(run({ mcpServers, plugins: [plugin("p@m", { components: ["mcpServers"] })] }))).toEqual([]);
  });
  it("같은 이름의 서버가 다른 범위에 켜져 있으면 그것도 안 부른 것이 확인됨이어야 한다. 이름으로 막으면 그 서버도 막힌다", () => {
    const own = mcpServer("db");
    const inProject = mcpServer("db", { scope: "project", projectRoot: "/work/app", definitionHash: "other" });
    expect(ids(run({ mcpServers: [own, inProject] }))).toEqual(["A3:claude-code:db"]);
    expect(ids(run({ mcpServers: [own, inProject] }, { watched: [own] }))).toEqual([]);
    expect(ids(run({ mcpServers: [own, { ...inProject, enabled: false }] }, { watched: [own] }))).toEqual(["A3:claude-code:db"]);
  });
  it("플러그인이 넣은 같은 이름의 서버가 쓰이고 있으면 내지 않는다. 부른 기록의 이름 꼴이 달라 사용자 범위 서버는 확인됨일 수 있다", () => {
    const own = mcpServer("db");
    const fromPlugin = mcpServer("db", { scope: "plugin", pluginId: "p@m", recordNames: ["plugin:p:db", "plugin_p_db"], definitionHash: "plugin-def" });
    const setup = { mcpServers: [own, fromPlugin], plugins: [plugin("p@m", { components: ["mcpServers"] })] };
    const result = run(setup, { calledServers: ["plugin_p_db"] });
    expect(result.servers.servers.map((s) => s.verdict)).toEqual(["unused", "used"]);
    expect(ids(result)).toEqual([]);
    expect(ids(run(setup))).toEqual(["A3:claude-code:db"]);
  });
  it("같은 이름의 claude.ai 연결이 켜져 있으면 내지 않는다. 그 연결은 안 부른 것이 확인됨이 되지 않는다", () => {
    const mcpServers = [mcpServer("mail"), mcpServer("mail", { scope: "claude-ai", definitionHash: null })];
    expect(ids(run({ mcpServers }))).toEqual([]);
  });
  it.each([
    ["구성을 모르는 플러그인", { plugins: [plugin("x@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }],
    ["MCP 정의를 읽지 못한 플러그인", { plugins: [plugin("x@m", { mcpUnreadable: true })] }],
    ["설정에 켜 두었는데 설치 기록에 없는 플러그인", { pluginsWithoutInstall: ["ghost@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("같은 이름의 서버가 있는지 알 수 없으면 내지 않는다. E6은 잰다: %s", (_name, setup) => {
    const result = run({ mcpServers: [mcpServer("idle1"), mcpServer("idle2")], ...setup });
    expect(result.servers.measurement).toMatchObject({ status: "scored", value: 1 });
    expect(ids(result)).toEqual([]);
  });
  it("훅 정의만 읽지 못한 플러그인은 서버 막기와 상관없다. 스킬을 끄는 후보만 막는다", () => {
    const result = run({ skills: [skill("idle")], mcpServers: [mcpServer("idle")], plugins: [plugin("x@m", { hooksUnreadable: true })] });
    expect(ids(result)).toEqual(["A3:claude-code:idle"]);
  });
  it("관리 정책이 정한 서버는 내지 않는다. 서버를 하나만 깔아 E6을 못 쟀어도 후보는 낸다", () => {
    expect(ids(run({ mcpServers: [mcpServer("fixed", { managedFixed: true })] }))).toEqual([]);
    const one = run({ mcpServers: [mcpServer("only")] });
    expect(one.servers.measurement).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(ids(one)).toEqual(["A3:claude-code:only"]);
  });
});

describe("후보의 차례", () => {
  it("단위, 그다음 바꾸는 열쇠의 글자 차례로 낸다. 같은 열쇠는 한 번만 낸다", () => {
    const setup = { skills: [skill("zeta"), skill("alpha"), ofPlugin("p@m", "s")], mcpServers: [mcpServer("srv")], plugins: [plugin("p@m")] };
    expect(ids(run(setup))).toEqual(["A1:claude-code:alpha", "A1:claude-code:zeta", "A2:claude-code:p@m", "A3:claude-code:srv"]);
  });
});
