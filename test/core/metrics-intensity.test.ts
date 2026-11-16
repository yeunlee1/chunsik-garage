// 강도 규칙 넷(I1~I4)을 시험한다. 도구를 합쳐서 재고 날짜와 프로젝트는 합집합으로 센다(설계 11.3 「강도」, 11.4 「규칙마다의 이유」)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { CoverageKey, ToolCoverage, ToolId } from "../../src/adapters/types.ts";
import { intensityRules } from "../../src/core/metrics/intensity.ts";
import { projectLookup, projectUsage } from "../../src/core/projects.ts";
import { toolTotals, type ToolUsage } from "../../src/core/totals.ts";
import type { ProjectFact } from "../../src/scan/types.ts";
import { project } from "../helpers/facts.ts";
import { summary, type DayInput, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const without = (...keys: CoverageKey[]): ToolCoverage => ({ ...CLAUDE_COVERAGE, ...Object.fromEntries(keys.map((key) => [key, "unsupported"])) });
const tool = (id: string, sessions: SummaryInput[], coverage: ToolCoverage = CLAUDE_COVERAGE): ToolUsage => ({
  tool: id as ToolId,
  totals: toolTotals(sessions.map((s) => summary(s)), windows, ["Bash"]),
  coverage,
});
const days = (cells: Record<string, DayInput>): SummaryInput => ({ days: cells });
const rules = (tools: ToolUsage[], projects: ProjectFact[] = []) => {
  const normalized = Object.fromEntries(projects.flatMap((p) => p.cwds.map((cwd) => [cwd, cwd])));
  return intensityRules(tools, projectUsage(tools, projectLookup(projects, normalized)));
};

describe("I1 사용한 날", () => {
  it("어느 도구에서든 응답이 있었던 날을 합집합으로 센다", () => {
    const claude = tool("claude-code", [days({ "2026-11-10": { responses: 1 }, "2026-11-11": { responses: 2 } })]);
    const codex = tool("codex", [days({ "2026-11-11": { responses: 5 }, "2026-11-12": { responses: 1 }, "2026-11-13": { humanRequests: 4 } })]);
    expect(rules([claude, codex]).I1).toEqual({ status: "scored", value: 3, evidence: { activeDays: 3 } });
  });
  it("점수에 넣는 도구가 없어도 잰다. 값은 0이다", () => {
    expect(rules([]).I1).toEqual({ status: "scored", value: 0, evidence: { activeDays: 0 } });
  });
});

describe("I2 하루에 시키는 양", () => {
  it("모든 도구의 사람 요청을 사용한 날로 나눈다", () => {
    const claude = tool("claude-code", [days({ "2026-11-10": { responses: 1, humanRequests: 30 }, "2026-11-11": { responses: 1, humanRequests: 10 } })]);
    const codex = tool("codex", [days({ "2026-11-11": { responses: 1, humanRequests: 20 } })]);
    expect(rules([claude, codex]).I2).toEqual({ status: "scored", value: 30, evidence: { activeDays: 2, humanRequests: 60 } });
  });
  it("사용한 날이 0이면 no_data다", () => {
    expect(rules([]).I2).toEqual({ status: "unmeasured", reason: "no_data", evidence: { activeDays: 0, humanRequests: 0 } });
    expect(rules([tool("claude-code", [days({ "2026-11-10": { humanRequests: 5 } })])]).I2).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
  it("사람 요청을 못 보는 도구는 분자와 분모에서 뺀다. 모든 도구가 못 보면 unsupported다", () => {
    const seen = tool("claude-code", [days({ "2026-11-10": { responses: 1, humanRequests: 8 } })]);
    const blind = tool("codex", [days({ "2026-11-11": { responses: 1, humanRequests: 99 }, "2026-11-12": { responses: 1 } })], without("humanRequests"));
    expect(rules([seen, blind]).I2).toEqual({ status: "scored", value: 8, evidence: { activeDays: 1, humanRequests: 8 } });
    expect(rules([blind]).I2).toEqual({ status: "unmeasured", reason: "unsupported", evidence: { activeDays: null, humanRequests: null } });
  });
});

describe("I3 한 번에 맡기는 깊이", () => {
  it("셸 명령을 넣은 모든 도구 호출을 사람 요청으로 나눈다. 주 세션과 하위 세션의 호출을 합친다", () => {
    const main: SummaryInput = days({ "2026-11-10": { responses: 1, humanRequests: 25, tools: { Bash: { calls: 40 }, Read: { calls: 30 } } } });
    const sub: SummaryInput = { kind: "sub", days: { "2026-11-10": { responses: 1, humanRequests: 7, tools: { Grep: { calls: 30 } } } } };
    expect(rules([tool("claude-code", [main, sub])]).I3).toEqual({ status: "scored", value: 4, evidence: { humanRequests: 25, toolCalls: 100 } });
  });
  it("사람 요청이 0개면 no_data, 1개에서 19개면 too_little, 20개부터 잰다", () => {
    const requests = (humanRequests: number) => rules([tool("claude-code", [days({ "2026-11-10": { responses: 1, humanRequests, tools: { Read: { calls: 5 } } } })])]).I3;
    expect(requests(0)).toEqual({ status: "unmeasured", reason: "no_data", evidence: { humanRequests: 0, toolCalls: 5 } });
    expect(requests(19)).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(requests(20)).toMatchObject({ status: "scored", value: 0.25 });
  });
  it("도구 호출이나 사람 요청을 못 보는 도구는 빼고, 모든 도구가 못 보면 unsupported다", () => {
    const seen = tool("claude-code", [days({ "2026-11-10": { responses: 1, humanRequests: 20, tools: { Read: { calls: 60 } } } })]);
    const blind = tool("codex", [days({ "2026-11-10": { responses: 1, humanRequests: 80 } })], without("toolCalls"));
    expect(rules([seen, blind]).I3).toEqual({ status: "scored", value: 3, evidence: { humanRequests: 20, toolCalls: 60 } });
    expect(rules([blind]).I3).toEqual({ status: "unmeasured", reason: "unsupported", evidence: { humanRequests: null, toolCalls: null } });
  });
});

describe("I4 쓰는 폭", () => {
  const at = (cwd: string | null, input: SummaryInput = {}): SummaryInput => ({ cwd, days: { "2026-11-10": { responses: 1 } }, ...input });
  it("점수 구간에 주 세션이 있었던 프로젝트를 도구를 합친 집합으로 센다", () => {
    const projects = [project("/work/a"), project("/work/b"), project("/work/c"), project("/work/old")];
    const claude = tool("claude-code", [at("/work/a"), at("/work/a"), at("/work/b"), at("/work/c", { kind: "sub" }), at("/work/old", { days: { "2026-10-12": { responses: 3 } } })]);
    const codex = tool("codex", [at("/work/b"), at("/work/c")]);
    expect(rules([claude, codex], projects).I4).toEqual({ status: "scored", value: 3, evidence: { excludedFolders: 0, projects: 3, unlinkedSessions: 0 } });
  });
  it("프로젝트로 보지 않는 폴더는 세지 않고, 지금 PC에 없는 작업 폴더는 센다", () => {
    const projects = [project("/home/u", { excluded: true, kind: "folder" }), project("/work/gone", { exists: false, kind: "folder" }), project("/work/a")];
    const claude = tool("claude-code", [at("/home/u"), at("/work/gone"), at("/work/a"), at(null)]);
    expect(rules([claude], projects).I4).toEqual({ status: "scored", value: 2, evidence: { excludedFolders: 1, projects: 2, unlinkedSessions: 1 } });
  });
  it("그런 프로젝트가 없으면 no_data다", () => {
    const projects = [project("/home/u", { excluded: true, kind: "folder" })];
    expect(rules([tool("claude-code", [at("/home/u"), at(null)])], projects).I4).toEqual({ status: "unmeasured", reason: "no_data", evidence: { excludedFolders: 1, projects: 0, unlinkedSessions: 1 } });
    expect(rules([]).I4).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
});
