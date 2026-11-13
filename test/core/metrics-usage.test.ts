// 기록으로 재는 도구별 규칙 여덟(S4, E1, E2, E3, E4, E7, F1, F2)을 시험한다. 기준이 되는 개수의 경계, 분모 0, 못 보는 도구(설계 11.3, 11.4 「규칙마다의 이유」)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { CoverageKey, ToolCoverage } from "../../src/adapters/types.ts";
import { usageRules } from "../../src/core/metrics/usage.ts";
import { toolTotals } from "../../src/core/totals.ts";
import { summary, type DayInput, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const D = "2026-11-10";
const totalsOf = (...sessions: SummaryInput[]) => toolTotals(sessions.map((s) => summary(s)), windows, ["Bash"]);
const one = (cell: DayInput) => totalsOf({ days: { [D]: { responses: 1, ...cell } } });
const without = (...keys: CoverageKey[]): ToolCoverage => ({ ...CLAUDE_COVERAGE, ...Object.fromEntries(keys.map((key) => [key, "unsupported"])) });
const rules = (totals: ReturnType<typeof totalsOf>, coverage: ToolCoverage = CLAUDE_COVERAGE) => usageRules(totals, coverage);

describe("S4 훅이 안정적으로 돈다", () => {
  it("훅 실패를 훅 실행으로 나눈다. 가릴 수 없는 막음은 양쪽에 넣지 않고 수만 싣는다", () => {
    expect(rules(one({ hooks: { PreToolUse: { runs: 200, failures: 10, unclassifiedBlocks: 7 } } })).S4).toEqual({
      status: "scored",
      value: 0.05,
      evidence: { failures: 10, runs: 200, unclassifiedBlocks: 7 },
    });
  });
  it("실행이 0번이면 no_data, 1번에서 99번이면 too_little, 100번부터 잰다", () => {
    expect(rules(one({})).S4).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(one({ hooks: { Stop: { runs: 99, failures: 99 } } })).S4).toMatchObject({ status: "unmeasured", reason: "too_little", evidence: { runs: 99, failures: 99 } });
    expect(rules(one({ hooks: { Stop: { runs: 100 } } })).S4).toMatchObject({ status: "scored", value: 0 });
  });
  it("훅 실행을 못 보는 도구는 unsupported이고 근거 숫자는 비운다", () => {
    expect(rules(one({ hooks: { Stop: { runs: 500 } } }), without("mcpFailuresAndHooks")).S4).toEqual({
      status: "unmeasured",
      reason: "unsupported",
      evidence: { failures: null, runs: null, unclassifiedBlocks: null },
    });
  });
});

describe("E1 캐시 적중", () => {
  it("캐시 읽기를 입력, 캐시 읽기, 캐시 쓰기의 합으로 나눈다", () => {
    expect(rules(one({ tokens: { input: 100, cacheRead: 700, cacheWrite: 200, output: 999 } })).E1).toEqual({
      status: "scored",
      value: 0.7,
      evidence: { cacheRead: 700, cacheWrite: 200, input: 100 },
    });
  });
  it("전체 입력이 0이면 no_data다", () => {
    expect(rules(one({ tokens: { output: 5 } })).E1).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
});

describe("E2 도구 오류", () => {
  it("셸 명령을 뺀 도구 결과 가운데 오류의 몫이다", () => {
    const totals = one({ tools: { Read: { calls: 60, results: 60, errors: 3 }, Bash: { calls: 40, results: 40, errors: 30 } } });
    expect(rules(totals).E2).toEqual({ status: "scored", value: 0.05, evidence: { errors: 3, results: 60 } });
  });
  it("대상 결과가 0개면 no_data, 1개에서 49개면 too_little, 50개부터 잰다", () => {
    expect(rules(one({ tools: { Bash: { calls: 80, results: 80, errors: 80 } } })).E2).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(one({ tools: { Read: { results: 49, errors: 49 } } })).E2).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(rules(one({ tools: { Read: { results: 50, errors: 50 } } })).E2).toMatchObject({ status: "scored", value: 1 });
  });
  it("오류를 못 보는 형식은 unsupported다", () => {
    expect(rules(one({ tools: { Read: { results: 500 } } }), without("toolErrors")).E2).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});

describe("E3 대화 넘침", () => {
  it("주 세션의 자동 압축 횟수를 점수 구간에 응답이 있는 주 세션 수로 나눈다. 1을 넘을 수 있다", () => {
    const totals = totalsOf(
      { days: { [D]: { responses: 1, autoCompactions: 5 } } },
      { days: { [D]: { responses: 1 } } },
      { days: { [D]: { responses: 1, autoCompactions: 1 } } },
      { kind: "sub", days: { [D]: { responses: 1, autoCompactions: 50 } } },
    );
    expect(rules(totals).E3).toEqual({ status: "scored", value: 2, evidence: { autoCompactions: 6, mainSessions: 3 } });
  });
  it("주 세션이 0개면 no_data, 1개나 2개면 too_little이다", () => {
    expect(rules(totalsOf({ kind: "sub", days: { [D]: { responses: 9 } } })).E3).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(totalsOf({ days: { [D]: { responses: 1 } } }, { days: { [D]: { responses: 1 } } })).E3).toMatchObject({ status: "unmeasured", reason: "too_little", evidence: { mainSessions: 2 } });
  });
  it("압축을 못 보는 형식은 unsupported다", () => {
    expect(rules(totalsOf({ days: { [D]: { responses: 1 } } }), without("autoCompaction")).E3).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});

describe("E4 매번 실리는 지침", () => {
  const withChars = (ascii: number, other: number): SummaryInput => ({ instructionChars: { ascii, other }, days: { [D]: { responses: 1 } } });
  it("지침이 실린 주 세션의 어림 토큰의 가운데 값이다. 표본이 짝수 개면 가운데 둘의 평균이다", () => {
    expect(rules(totalsOf(withChars(4000, 0), withChars(0, 9000), withChars(0, 5000))).E4).toMatchObject({ status: "scored", value: 5000 });
    expect(rules(totalsOf(withChars(4000, 0), withChars(0, 9000), withChars(0, 5000), withChars(0, 7000))).E4).toMatchObject({ status: "scored", value: 6000 });
  });
  it("지침 첨부가 남지 않은 세션과 글자가 없는 세션은 0으로 넣지 않고 수만 싣는다", () => {
    const totals = totalsOf(withChars(0, 20000), { days: { [D]: { responses: 1 } } }, { days: { [D]: { responses: 1 } } }, withChars(0, 0));
    expect(rules(totals).E4).toEqual({ status: "scored", value: 20000, evidence: { sampledSessions: 1, skippedSessions: 3 } });
  });
  it("지침이 실린 주 세션이 없으면 no_data, 지침 크기를 못 보는 형식이면 unsupported다", () => {
    expect(rules(totalsOf({ days: { [D]: { responses: 1 } } })).E4).toEqual({ status: "unmeasured", reason: "no_data", evidence: { sampledSessions: 0, skippedSessions: 1 } });
    expect(rules(totalsOf(withChars(0, 100)), without("instructionSize")).E4).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});

describe("E7 멈춘 일", () => {
  it("거절한 도구 실행, 끊은 턴, 길이 제한으로 끊긴 응답을 더해 사람 요청으로 나눈다", () => {
    const totals = one({ humanRequests: 40, interruptedTurns: 2, lengthStops: 1, tools: { Bash: { deniedByUser: 1 }, Edit: { deniedByHook: 1, deniedByPermission: 1, interrupted: 9 } } });
    expect(rules(totals).E7).toEqual({ status: "scored", value: 0.15, evidence: { denied: 3, humanRequests: 40, interruptedTurns: 2, lengthStops: 1 } });
  });
  it("사람 요청이 0개면 no_data, 1개에서 19개면 too_little이다", () => {
    expect(rules(one({ lengthStops: 3 })).E7).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(one({ humanRequests: 19 })).E7).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(rules(one({ humanRequests: 20 })).E7).toMatchObject({ status: "scored", value: 0 });
  });
  it("세 사건을 다 보지는 못하는 도구는 unsupported다", () => {
    expect(rules(one({ humanRequests: 50 }), without("deniedAndLengthStops")).E7).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    expect(rules(one({ humanRequests: 50 }), without("interruptedTurns")).E7).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});

describe("F1 높은 추론 강도에 쏠리지 않는다", () => {
  it("xhigh와 max로 돈 응답을 강도를 아는 응답으로 나눈다. 차례에 없는 값과 강도 모름은 분모에서 빼고 수를 싣는다", () => {
    const totals = one({ efforts: { minimal: 5, low: 5, medium: 10, high: 20, xhigh: 30, max: 30, turbo: 4 }, unknownEffort: 6 });
    expect(rules(totals).F1).toEqual({ status: "scored", value: 0.6, evidence: { highEffort: 60, knownEffort: 100, unknownEffort: 6, unknownLevel: 4 } });
  });
  it("강도를 아는 응답이 0개면 no_data, 1개에서 49개면 too_little이다", () => {
    expect(rules(one({ efforts: { turbo: 80 }, unknownEffort: 80 })).F1).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(one({ efforts: { max: 49 } })).F1).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(rules(one({ efforts: { high: 50 } })).F1).toMatchObject({ status: "scored", value: 0 });
  });
});

describe("F2 긴 일을 나눠 맡긴다", () => {
  const session = (autoCompactions: number, subagentCalls: number): SummaryInput => ({ days: { [D]: { responses: 1, autoCompactions, subagentCalls } } });
  it("자동 압축이 있었던 주 세션 가운데 하위 에이전트를 쓴 세션의 몫이다", () => {
    const totals = totalsOf(session(1, 2), session(3, 0), session(1, 1), session(2, 0), session(0, 9));
    expect(rules(totals).F2).toEqual({ status: "scored", value: 0.5, evidence: { compactedSessions: 4, delegatedSessions: 2 } });
  });
  it("그런 세션이 0개면 no_data, 1개나 2개면 too_little이다", () => {
    expect(rules(totalsOf(session(0, 5))).F2).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(totalsOf(session(1, 1), session(1, 0))).F2).toMatchObject({ status: "unmeasured", reason: "too_little", evidence: { compactedSessions: 2, delegatedSessions: 1 } });
  });
  it("하위 에이전트나 압축을 못 보는 도구는 unsupported다", () => {
    const totals = totalsOf(session(1, 1), session(1, 1), session(1, 1));
    expect(rules(totals, without("subagents")).F2).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    expect(rules(totals, without("autoCompaction")).F2).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});
