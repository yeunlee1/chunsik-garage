// 입력 묶음에서 평가까지를 시험한다. 규칙 스물둘이 제 입력에 이어졌는지, 점수에 넣는 도구에서만 재는지, 같은 입력이면 글자 하나 다르지 않은지(설계 9.3, 12.1, 12.2, 21.1 「결정성」)
import { describe, expect, it } from "vitest";
import type { ToolId } from "../../src/adapters/types.ts";
import { evaluate, type EvaluationInput } from "../../src/core/evaluate.ts";
import { RULES } from "../../src/core/rules.ts";
import { instructionFile, instructions, mcpServer, plugin, project, skill } from "../helpers/facts.ts";
import { CLOCK, claudeTool, evaluationInput, watched } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

const APP = "/work/app";
const SESSIONS: SummaryInput[] = [
  {
    sessionId: "a",
    cwd: APP,
    instructionChars: { ascii: 4000, other: 3000 },
    days: {
      "2026-11-10": {
        responses: 20,
        humanRequests: 10,
        tokens: { input: 100, cacheRead: 800, cacheWrite: 100, output: 50 },
        tools: { Read: { calls: 30, results: 30, errors: 3 }, Bash: { calls: 10, results: 10, errors: 9 } },
        hooks: { PreToolUse: { runs: 100, failures: 1 } },
        efforts: { high: 20 },
        autoCompactions: 1,
        subagentCalls: 1,
      },
    },
  },
  { sessionId: "b", cwd: APP, days: { "2026-11-11": { responses: 20, humanRequests: 10, tools: { Read: { calls: 20, results: 20 } }, efforts: { xhigh: 20 }, mcpConnectionFailure: true } } },
  { sessionId: "c", cwd: APP, days: { "2026-11-12": { responses: 20, humanRequests: 10, efforts: { max: 20 } } } },
];
const IDLE_SKILL = skill("idle");
const DB = mcpServer("db");
const SETUP = {
  globalInstructions: instructions({ files: [instructionFile("/home/u/.claude/CLAUDE.md", { bytes: 300 })], lineHashes: ["g1", "g2"] }),
  projects: [project(APP, { instructions: instructions({ files: [instructionFile(`${APP}/CLAUDE.md`)], lineHashes: ["g1", "p1"] }) })],
  skills: [IDLE_SKILL],
  mcpServers: [DB],
};
const INPUT = (): EvaluationInput => evaluationInput([claudeTool({ sessions: SESSIONS, setup: SETUP })], { installs: watched(IDLE_SKILL, DB) });
const finding = (result: ReturnType<typeof evaluate>, id: string) => result.findings.find((f) => f.ruleId === id)!;
const toolValue = (result: ReturnType<typeof evaluate>, id: string) => finding(result, id).tools[0]!;

describe("evaluate", () => {
  it("규칙 스물둘을 한 번씩 재고, 구간과 점수에 넣는 도구를 함께 낸다", () => {
    const result = evaluate(INPUT());
    expect(result.findings.map((f) => f.ruleId).sort()).toEqual(RULES.map((rule) => rule.id).sort());
    expect(result.rulesVersion).toBe("1.0.0");
    expect(result.windows).toEqual({ today: "2026-11-13", score: { from: "2026-10-15", to: "2026-11-13" }, collect: { from: "2026-10-10", to: "2026-11-13" } });
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.inCalendar, tool.totals.responses])).toEqual([["claude-code", true, true, 60]]);
  });
  it("도구를 합쳐서 재는 규칙은 값과 근거 숫자를 규칙에 싣고 도구별 값은 비운다", () => {
    const result = evaluate(INPUT());
    expect(finding(result, "S1")).toMatchObject({ status: "scored", value: 1, score: 1, tools: [], evidence: { tools: 1, withInstructions: 1 } });
    expect(finding(result, "S2")).toMatchObject({ value: 1 });
    expect(finding(result, "S3")).toMatchObject({ value: 0, score: 1 });
    expect(finding(result, "F3")).toMatchObject({ value: 1, evidence: { targets: 1, withInstructions: 1 } });
    expect(finding(result, "F4")).toMatchObject({ value: 0.5, score: 0, evidence: { comparedProjects: 1, globalLines: 2, overlappingLines: 1 } });
    expect(finding(result, "F6")).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    expect(finding(result, "I1")).toMatchObject({ value: 3 });
    expect(finding(result, "I2")).toMatchObject({ value: 10 });
    expect(finding(result, "I3")).toMatchObject({ value: 2, evidence: { humanRequests: 30, toolCalls: 60 } });
    expect(finding(result, "I4")).toMatchObject({ value: 1, score: 0 });
    expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: true }]);
    expect(result.worstOverlap).toEqual({ tool: "claude-code", normRoot: APP });
    expect(result.missingInstructions).toEqual([]);
    expect(result.projects.projects.map((use) => [use.project.normRoot, use.total])).toEqual([[APP, 3]]);
  });
  it("도구마다 재는 규칙은 도구별 값에 그 도구의 값과 근거 숫자를 싣는다", () => {
    const result = evaluate(INPUT());
    expect(toolValue(result, "S4")).toMatchObject({ tool: "claude-code", status: "scored", value: 0.01, evidence: { failures: 1, runs: 100 } });
    expect(toolValue(result, "S5")).toMatchObject({ value: 1 / 3, score: 0, evidence: { enabledServers: 1, failedSessions: 1, mainSessions: 3 } });
    expect(toolValue(result, "E1")).toMatchObject({ value: 0.8 });
    expect(toolValue(result, "E2")).toMatchObject({ value: 0.06, evidence: { errors: 3, results: 50 } });
    expect(toolValue(result, "E3")).toMatchObject({ value: 1 / 3 });
    expect(toolValue(result, "E4")).toMatchObject({ value: 4000, score: 1, evidence: { sampledSessions: 1, skippedSessions: 2 } });
    expect(toolValue(result, "E7")).toMatchObject({ value: 0, score: 1 });
    expect(toolValue(result, "F1")).toMatchObject({ value: 40 / 60 });
    expect(toolValue(result, "F2")).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(toolValue(result, "F5")).toMatchObject({ value: 0, evidence: { skillKinds: 1 } });
    expect(finding(result, "E1")).toMatchObject({ status: "scored", value: 0.8, evidence: {} });
  });
  it("설치를 판정해 E5와 E6을 재고, 정비 후보를 그 규칙과 도구별 값에 잇는다", () => {
    const result = evaluate(INPUT());
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["A1:claude-code:idle", "A3:claude-code:db"]);
    expect(finding(result, "E5")).toMatchObject({ status: "unmeasured", reason: "too_little", category: "repair", severity: "info", gain: null, candidates: ["A1:claude-code:idle"] });
    expect(toolValue(result, "E5")).toMatchObject({ reason: "too_little", candidates: ["A1:claude-code:idle"], evidence: { enabled: 1, judgeable: 1, judged: 1, unused: 1 } });
    expect(finding(result, "E6")).toMatchObject({ reason: "too_little", category: "repair", candidates: ["A3:claude-code:db"] });
    expect(result.tools[0]!.skills.map((bundle) => [bundle.positions[0]!.name, bundle.verdict])).toEqual([["idle", "unused"]]);
    expect(result.tools[0]!.servers.map((judged) => [judged.server.name, judged.verdict])).toEqual([["db", "unused"]]);
  });
  it("E5를 watching으로 못 쟀어도 안 쓴 것이 확인된 스킬의 후보는 나오고 규칙을 정비할 것에 싣는다", () => {
    // 켜져 있는 스킬 열하나 가운데 둘만 오래 지켜봤다. 판정된 것이 절반에 못 미쳐 E5는 못 재지만 그 둘은 끄자고 할 수 있다
    const idle = [skill("idle-a"), skill("idle-b")];
    const fresh = Array.from({ length: 9 }, (_, i) => skill(`fresh-${i + 1}`));
    const result = evaluate(evaluationInput([claudeTool({ sessions: SESSIONS, setup: { ...SETUP, skills: [...idle, ...fresh], mcpServers: [] } })], { installs: watched(...idle) }));
    expect(finding(result, "E5")).toMatchObject({ status: "unmeasured", reason: "watching", value: null, score: null, category: "repair", severity: "info", gain: null, candidates: ["A1:claude-code:idle-a", "A1:claude-code:idle-b"] });
    expect(toolValue(result, "E5").evidence).toEqual({ enabled: 11, judgeable: 11, judged: 2, structural: 0, unused: 2, used: 0 });
  });
  it("정체가 같은 MCP 서버 사실 둘은 설치 하나로 센다. E6이 서버 하나로 재지지 않는다", () => {
    // 스캐너가 같은 플러그인을 두 길로 찾은 경우다. 그 서버를 부른 기록이 있어도 판정할 수 있는 서버는 하나라서 too_little이다
    const twin = () => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", recordNames: ["plugin:r:db", "plugin_r_db"] });
    const sessions: SummaryInput[] = [{ sessionId: "dup", cwd: APP, days: { "2026-11-12": { responses: 1, mcpCalls: { plugin_r_db: 1 } } } }];
    const setup = { mcpServers: [twin(), twin()], plugins: [plugin("r@skills-dir", { components: ["mcpServers"] })] };
    const result = evaluate(evaluationInput([claudeTool({ sessions, setup })], { installs: watched(twin()) }));
    expect(finding(result, "E6")).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(toolValue(result, "E6").evidence).toEqual({ enabled: 1, judgeable: 1, judged: 1, structural: 0, unused: 0, used: 1 });
    expect(toolValue(result, "S5").evidence).toMatchObject({ enabledServers: 1 });
  });
  it("첫 점검에서는 관측 기록이 없어 MCP 서버가 쓰는지 모름이고 서버 막기 후보가 없다", () => {
    const result = evaluate({ ...INPUT(), installs: null });
    expect(result.tools[0]!.servers.map((judged) => judged.verdict)).toEqual(["unknown"]);
    expect(result.candidates.map((candidate) => candidate.unit)).not.toContain("A3");
  });
  it("관측이 빠짐없지 않은 지표의 규칙만 incomplete가 된다", () => {
    const tool = claudeTool({ sessions: SESSIONS, setup: { ...SETUP, skills: Array.from({ length: 6 }, (_, i) => skill(`s${i}`)) }, complete: { skills: false } });
    const result = evaluate(evaluationInput([tool], { installs: watched(DB) }));
    expect(finding(result, "E5")).toMatchObject({ status: "unmeasured", reason: "incomplete", category: "unmeasured" });
    expect(finding(result, "E6").reason).toBe("too_little");
  });
  it("이 도구 자신은 정비 후보에서 뺀다", () => {
    const result = evaluate({ ...INPUT(), self: { skillNames: ["idle"], pluginNames: [], skillRealPaths: [] } });
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["A3:claude-code:db"]);
  });
  it("기록의 숫자에서 낸 점수가 분류의 경계와 같으면 경계에 든다", () => {
    // 캐시 읽기 820/1000과 오류 40/1000은 규칙 점수가 꼭 0.8이다. 나눗셈의 끝자리 오차 때문에 보통으로 떨어지지 않는다
    const sessions: SummaryInput[] = [{ sessionId: "edge", cwd: APP, days: { "2026-11-12": { responses: 1, tokens: { input: 180, cacheRead: 820, cacheWrite: 0 }, tools: { Read: { calls: 1000, results: 1000, errors: 40 } } } } }];
    const result = evaluate(evaluationInput([claudeTool({ sessions })]));
    expect(finding(result, "E1")).toMatchObject({ value: 0.82, category: "strength" });
    expect(finding(result, "E2")).toMatchObject({ value: 0.04, category: "strength" });
  });
  it("기록의 숫자에서 낸 기준 점수와 예상 효과는 정확한 분수로 계산한 것과 같다", () => {
    // 캐시 읽기 19468/30001, 도구 오류 6370/66197. 효율에서 이 둘만 재진다. 정확한 기준 점수는 30.5 - 1/(30001 × 66197)이라서 30이다
    const sessions: SummaryInput[] = [{ sessionId: "rational", days: { "2026-11-13": { responses: 1, tokens: { input: 10533, cacheRead: 19468 }, tools: { Read: { calls: 66197, results: 66197, errors: 6370 } } } } }];
    const result = evaluate(evaluationInput([claudeTool({ sessions })]));
    expect(result.findings.filter((f) => f.axis === "efficiency" && f.status === "scored").map((f) => f.ruleId).sort()).toEqual(["E1", "E2"]);
    expect(result.axes.find((axis) => axis.axis === "efficiency")!.score).toBe(30);
    expect([finding(result, "E1").gain, finding(result, "E2").gain]).toEqual([32, 39]);
  });
  it("기준 점수와 AQ, 등급을 낸다. 화면의 숫자로 검산할 수 있다", () => {
    const result = evaluate(INPUT());
    expect(result.axes.map((axis) => axis.axis)).toEqual(["setup", "efficiency", "fit", "intensity"]);
    const scores = result.axes.map((axis) => axis.score!);
    expect(scores.every((score) => Number.isInteger(score) && score >= 0 && score <= 100)).toBe(true);
    expect(result.score.aq).toBe(Math.floor(scores.reduce((sum, score) => sum + score, 0) / scores.length + 0.5));
    expect(result.score).toMatchObject({ withheld: [], missingAxes: [] });
    expect(result.score.grade).not.toBeNull();
  });
});

describe("점수에 넣는 도구", () => {
  const before: SummaryInput = { cwd: APP, days: { "2026-10-11": { responses: 50, humanRequests: 30 } } };

  it("점수 구간에 응답이 없는 도구는 달력에만 넣는다. 그 도구의 설치는 판정하지 않고 정비 후보도 내지 않는다", () => {
    const result = evaluate(evaluationInput([claudeTool({ sessions: [before], setup: SETUP })], { installs: watched(IDLE_SKILL, DB) }));
    expect(result.tools.map((tool) => [tool.scored, tool.inCalendar, tool.skills, tool.servers])).toEqual([[false, true, [], []]]);
    expect(result.candidates).toEqual([]);
    expect(finding(result, "E5")).toMatchObject({ status: "unmeasured", reason: "no_data", tools: [] });
    expect(finding(result, "S1")).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(finding(result, "I1")).toMatchObject({ status: "scored", value: 0 });
    expect(result.score).toMatchObject({ aq: null, grade: null, tier: null, withheld: ["too_few_requests", "too_few_days"] });
  });
  it("도구가 하나도 없어도 평가를 낸다. 도구별 규칙은 no_data이고 AQ는 없다", () => {
    const result = evaluate(evaluationInput([]));
    expect(result.tools).toEqual([]);
    expect(result.findings).toHaveLength(22);
    expect(result.findings.filter((f) => f.tools.length > 0)).toEqual([]);
    expect(finding(result, "S4").reason).toBe("no_data");
    expect(result.score.aq).toBeNull();
  });
  it("기록이 같아도 평가 시계의 날짜가 다르면 구간이 달라진다", () => {
    const later = evaluate({ ...INPUT(), clock: { nowMs: CLOCK.nowMs + 40 * 24 * 60 * 60 * 1000, timeZone: CLOCK.timeZone } });
    expect(later.windows.today).toBe("2026-12-23");
    expect(later.tools.map((tool) => [tool.scored, tool.inCalendar])).toEqual([[false, false]]);
  });
  it("도구는 식별자의 차례로 낸다. 점수에 넣는 도구만 도구별 값에 싣는다", () => {
    const codex = { ...claudeTool({ sessions: [before] }), tool: "codex" as ToolId };
    const result = evaluate(evaluationInput([codex, claudeTool({ sessions: SESSIONS, setup: SETUP })], { projects: SETUP.projects }));
    expect(result.tools.map((tool) => [tool.tool, tool.scored])).toEqual([["claude-code", true], ["codex", false]]);
    expect(finding(result, "E1").tools.map((value) => value.tool)).toEqual(["claude-code"]);
    expect(finding(result, "S1")).toMatchObject({ evidence: { tools: 1 } });
  });
});

describe("결정성", () => {
  const reversed = <T>(list: readonly T[]): T[] => [...list].reverse();

  it("같은 입력 묶음을 연달아 두 번 평가하면 글자 하나 다르지 않다", () => {
    expect(JSON.stringify(evaluate(INPUT()))).toBe(JSON.stringify(evaluate(INPUT())));
  });
  it("세션 요약, 스킬, 서버, 프로젝트, 관측 기록의 차례를 뒤집어 넣어도 같다", () => {
    const skills = [skill("zeta"), skill("alpha"), skill("mid", { scope: "project", projectRoot: APP, path: `${APP}/.claude/skills/mid` })];
    const servers = [mcpServer("zeta"), mcpServer("alpha"), mcpServer("alpha", { scope: "project", projectRoot: APP, definitionHash: "other" })];
    const projects = [...SETUP.projects, project("/work/lib"), project("/work/gone", { exists: false, kind: "folder" })];
    const sessions = [...SESSIONS, { sessionId: "d", cwd: "/work/lib", days: { "2026-11-01": { responses: 5, humanRequests: 2, skillSignals: { zeta: { tool: 1 } } } } }];
    const build = (flip: boolean): EvaluationInput => {
      const order = <T>(list: readonly T[]): T[] => (flip ? reversed(list) : [...list]);
      const setup = { ...SETUP, skills: order(skills), mcpServers: order(servers), projects: order(projects) };
      return evaluationInput([claudeTool({ sessions: order(sessions), setup })], { installs: order(watched(...skills, ...servers)), projects: order(projects) });
    };
    expect(JSON.stringify(evaluate(build(true)))).toBe(JSON.stringify(evaluate(build(false))));
  });
  it("이름, 범위, 실제 경로가 모두 같고 플러그인만 다른 스킬 위치의 차례를 뒤집어 넣어도 같다", () => {
    // 같은 원본을 두 마켓에서 깐 플러그인이 그렇다. 스캐너는 설치 ID마다 스킬 사실을 하나씩 낸다
    const shared = (pluginId: string) => skill("p:s", { scope: "plugin", pluginId, path: "/plugins/shared/skills/s" });
    const pair = [shared("p@a"), shared("p@b")];
    const run = (skills: typeof pair): string => JSON.stringify(evaluate(evaluationInput([claudeTool({ sessions: SESSIONS, setup: { ...SETUP, skills, plugins: [plugin("p@a"), plugin("p@b")] } })], { installs: watched(...pair) })));
    expect(run(reversed(pair))).toBe(run(pair));
  });
  it("이름, 범위, 경로, 플러그인이 모두 같고 켜짐만 다른 스킬 위치 둘과 서버 둘의 차례를 뒤집어 넣어도 같다", () => {
    // 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 스캐너가 같은 설치를 두 길로 찾는다. 한쪽은 프로젝트의 설정만 봐서 꺼져 있다
    const twinSkill = (enabled: boolean) => skill("r:u", { scope: "plugin", pluginId: "r@skills-dir", path: "/home/u/.claude/skills/r/skills/u", enabled, listed: enabled });
    const twinServer = (enabled: boolean) => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", recordNames: ["plugin:r:db", "plugin_r_db"], enabled });
    const skills = [twinSkill(true), twinSkill(false)];
    const servers = [twinServer(true), twinServer(false)];
    const run = (flip: boolean): string => {
      const order = <T>(list: readonly T[]): T[] => (flip ? reversed(list) : [...list]);
      const setup = { ...SETUP, skills: order(skills), mcpServers: order(servers), plugins: [plugin("r@skills-dir", { components: ["skills", "mcpServers"] })] };
      return JSON.stringify(evaluate(evaluationInput([claudeTool({ sessions: SESSIONS, setup })], { installs: watched(...skills, ...servers) })));
    };
    expect(run(true)).toBe(run(false));
  });
  it("세션 ID가 같은 주 세션 요약 둘의 차례를 뒤집어 넣어도 같다", () => {
    const twins: SummaryInput[] = [
      { sessionId: "same", cwd: APP, days: { "2026-11-10": { responses: 3, humanRequests: 2, autoCompactions: 1 } } },
      { sessionId: "same", cwd: "/work/lib", days: { "2026-11-11": { responses: 5, humanRequests: 1 } } },
    ];
    const run = (sessions: SummaryInput[]): string => JSON.stringify(evaluate(evaluationInput([claudeTool({ sessions, setup: SETUP })])));
    expect(run(reversed(twins))).toBe(run(twins));
  });
  it("입력을 고치지 않는다", () => {
    const input = INPUT();
    const before = JSON.stringify(input);
    evaluate(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
