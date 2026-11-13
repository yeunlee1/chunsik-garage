// 구간 합계를 시험한다. 점수 구간의 칸만 더하고, 어느 숫자에 주 세션만 넣고 어느 숫자에 하위 세션을 합치는지를 본다(설계 9.2, 9.3)
import { describe, expect, it } from "vitest";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { instructionTokens, toolTotals } from "../../src/core/totals.ts";
import { summary } from "../helpers/summaries.ts";

// 2026-11-13 12:00(서울). 점수 구간은 10-15부터 11-13까지, 수집 구간은 10-10부터다
const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const SHELL = ["Bash", "PowerShell"];

describe("toolTotals", () => {
  it("점수 구간의 칸만 더한다. 수집 구간에만 든 날은 달력 쪽 응답 수에만 든다", () => {
    const totals = toolTotals(
      [
        summary({
          days: {
            "2026-10-09": { responses: 100, humanRequests: 50 },
            "2026-10-12": { responses: 7, humanRequests: 3 },
            "2026-10-15": { responses: 2, humanRequests: 1, tokens: { input: 10, cacheRead: 30, cacheWrite: 5, output: 4 } },
            "2026-11-13": { responses: 3, humanRequests: 2, tokens: { input: 1, cacheRead: 2, cacheWrite: 3, output: 4 } },
          },
        }),
      ],
      windows,
      SHELL,
    );
    expect(totals.responses).toBe(5);
    expect(totals.collectResponses).toBe(12);
    expect(totals.humanRequests).toBe(3);
    expect(totals.tokens).toEqual({ input: 11, cacheRead: 32, cacheWrite: 8, output: 8, thinking: 0 });
    expect(totals.activeDates).toEqual(["2026-10-15", "2026-11-13"]);
  });

  it("응답·토큰·도구·강도·훅·멈춘 일은 주 세션과 하위 세션을 합치고, 사람 요청은 주 세션만 센다", () => {
    const main = summary({
      sessionId: "m",
      days: {
        "2026-11-10": {
          responses: 4,
          humanRequests: 2,
          efforts: { xhigh: 3, weird: 1 },
          unknownEffort: 1,
          lengthStops: 1,
          interruptedTurns: 1,
          tools: { Read: { calls: 5, results: 5, errors: 1 } },
          hooks: { PreToolUse: { runs: 10, failures: 1, unclassifiedBlocks: 2 } },
        },
      },
    });
    const sub = summary({
      sessionId: "m-sub",
      kind: "sub",
      parentSessionId: "m",
      days: {
        "2026-11-11": {
          responses: 6,
          humanRequests: 9,
          efforts: { xhigh: 1, low: 2 },
          lengthStops: 2,
          interruptedTurns: 3,
          tools: { Read: { calls: 2, results: 2 }, Grep: { calls: 1, results: 1, errors: 1 } },
          hooks: { PostToolUse: { runs: 5, failures: 2 } },
        },
      },
    });
    const totals = toolTotals([sub, main], windows, SHELL);
    expect(totals.responses).toBe(10);
    expect(totals.humanRequests).toBe(2);
    expect(totals.toolCalls).toBe(8);
    expect(totals.efforts).toEqual({ low: 2, weird: 1, xhigh: 4 });
    expect(totals.unknownEffort).toBe(1);
    expect(totals.lengthStops).toBe(3);
    expect(totals.interruptedTurns).toBe(4);
    expect({ runs: totals.hookRuns, failures: totals.hookFailures, unclassified: totals.hookUnclassified }).toEqual({ runs: 15, failures: 3, unclassified: 2 });
    expect(totals.activeDates).toEqual(["2026-11-10", "2026-11-11"]);
    // 주 세션의 줄은 주 세션만이다
    expect(totals.mainSessions.map((s) => s.sessionId)).toEqual(["m"]);
  });

  it("도구 오류의 재료에서 셸 명령을 뺀다. 거절은 종류를 합쳐 모든 도구에서 센다", () => {
    const totals = toolTotals(
      [
        summary({
          days: {
            "2026-11-01": {
              responses: 1,
              tools: {
                Bash: { calls: 10, results: 8, errors: 6, deniedByUser: 1, deniedByHook: 1 },
                PowerShell: { calls: 2, results: 2, errors: 2 },
                Edit: { calls: 5, results: 3, errors: 1, deniedByPermission: 1, interrupted: 1 },
                mcp__ctx__search: { calls: 4, results: 4, errors: 2, unknownDenial: 3 },
              },
            },
          },
        }),
      ],
      windows,
      SHELL,
    );
    expect(totals.toolCalls).toBe(21);
    expect(totals.nonShellResults).toBe(7);
    expect(totals.nonShellErrors).toBe(3);
    // 끊겨서 끝난 결과와 모르는 거절 표시는 거절로 세지 않는다(설계 11.3 E7)
    expect(totals.denied).toBe(3);
  });

  it("주 세션의 줄은 점수 구간에 응답이 있는 주 세션마다 하나다. 압축과 하위 에이전트 호출은 점수 구간의 칸만 더하고, 연결 실패는 그 구간에 하루라도 있었는지다", () => {
    const totals = toolTotals(
      [
        summary({
          sessionId: "b",
          cwd: "/work/b",
          days: {
            "2026-10-12": { responses: 1, autoCompactions: 5, subagentCalls: 5, mcpConnectionFailure: true },
            "2026-10-20": { responses: 2, autoCompactions: 1 },
            "2026-10-21": { responses: 1, autoCompactions: 2, subagentCalls: 1 },
          },
        }),
        summary({ sessionId: "a", cwd: null, days: { "2026-11-12": { responses: 1, mcpConnectionFailure: true } } }),
        // 점수 구간에 응답이 없는 주 세션과, 응답 없이 요청만 있는 주 세션은 들지 않는다
        summary({ sessionId: "old", days: { "2026-10-11": { responses: 9 } } }),
        summary({ sessionId: "quiet", days: { "2026-11-12": { humanRequests: 1 } } }),
      ],
      windows,
      SHELL,
    );
    expect(totals.mainSessions).toEqual([
      { sessionId: "a", cwd: null, autoCompactions: 0, subagentCalls: 0, mcpConnectionFailure: true, instructionTokens: null },
      { sessionId: "b", cwd: "/work/b", autoCompactions: 3, subagentCalls: 1, mcpConnectionFailure: false, instructionTokens: null },
    ]);
    // 응답이 없는 세션의 사람 요청도 점수 구간의 것이면 센다
    expect(totals.humanRequests).toBe(1);
  });

  it("요약의 차례를 섞어도 결과가 같다", () => {
    const list = [
      summary({ sessionId: "x", days: { "2026-11-02": { responses: 1, efforts: { high: 1 } } } }),
      summary({ sessionId: "y", days: { "2026-11-01": { responses: 2, efforts: { low: 1 } } } }),
      summary({ sessionId: "z", kind: "sub", days: { "2026-11-03": { responses: 3 } } }),
    ];
    expect(JSON.stringify(toolTotals([...list].reverse(), windows, SHELL))).toBe(JSON.stringify(toolTotals(list, windows, SHELL)));
  });
  it("세션 ID가 같은 주 세션 요약이 둘이어도 차례가 넣은 차례에 기대지 않는다", () => {
    // 같은 ID의 기록 파일이 두 폴더에 있으면 요약이 둘 온다. 주 세션의 줄은 둘 다 남기고 내용으로 차례를 정한다
    const list = [
      summary({ sessionId: "same", cwd: "/work/a", days: { "2026-11-02": { responses: 1, autoCompactions: 2 } } }),
      summary({ sessionId: "same", cwd: "/work/b", days: { "2026-11-03": { responses: 4 } } }),
    ];
    const totals = toolTotals(list, windows, SHELL);
    expect(totals.mainSessions.map((s) => s.sessionId)).toEqual(["same", "same"]);
    expect(JSON.stringify(toolTotals([...list].reverse(), windows, SHELL))).toBe(JSON.stringify(totals));
  });
});

describe("instructionTokens", () => {
  it("ASCII 글자는 4글자를 1토큰으로, 그 밖의 글자는 1글자를 1토큰으로 어림한다", () => {
    expect(instructionTokens({ ascii: 400, other: 250 })).toBe(350);
    expect(instructionTokens({ ascii: 3, other: 0 })).toBe(0.75);
  });
  it("지침 첨부가 남지 않았거나 글자가 없으면 표본이 아니다", () => {
    expect(instructionTokens(null)).toBeNull();
    expect(instructionTokens({ ascii: 0, other: 0 })).toBeNull();
  });
  it("주 세션의 줄에 어림 토큰을 싣는다", () => {
    const totals = toolTotals([summary({ sessionId: "i", instructionChars: { ascii: 8000, other: 1000 }, days: { "2026-11-05": { responses: 1 } } })], windows, SHELL);
    expect(totals.mainSessions[0]!.instructionTokens).toBe(3000);
  });
});
