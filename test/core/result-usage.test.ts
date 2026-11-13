// 평가 결과의 사용 기록(점수 구간의 주 세션·사용한 날·출력 토큰·캐시 적중·셸 명령 몫, 수집 구간 35일의 달력, 도구별 나눔)을 시험한다(설계 9.8, 12.2, 13.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { resultUsage } from "../../src/core/result/usage.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const collected = (visibleFrom: string | null): CollectedTool => ({
  tool: "claude-code",
  detected: visibleFrom !== null,
  visibleFrom,
  overlappingSessions: 0,
  read: { files: 0, listedBytes: 0, bytes: 0, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
});
const usageOf = (tool: ClaudeToolInput, visibleFrom: string | null = "2026-10-01") => {
  const input = evaluationInput([claudeTool(tool)]);
  return { usage: resultUsage(input, evaluate(input), [collected(visibleFrom)]), evaluation: evaluate(input) };
};

describe("사용 기록", () => {
  it("점수 구간의 주 세션, 사용한 날, 출력 토큰을 더하고 캐시 적중은 E1의 잰 값을 쓴다", () => {
    const { usage, evaluation } = usageOf({
      sessions: [
        { days: { "2026-11-10": { responses: 4, tokens: { input: 100, cacheRead: 900, output: 50 } }, "2026-11-11": { responses: 1, tokens: { output: 5 } } } },
        { days: { "2026-11-10": { responses: 2, tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 7 } } } },
        { kind: "sub", parentSessionId: "x", days: { "2026-11-12": { responses: 3, tokens: { output: 11 } } } },
        // 점수 구간 밖(수집 구간 안)은 점수 구간의 숫자에 들지 않는다
        { days: { "2026-10-12": { responses: 9, tokens: { output: 1000 } } } },
      ],
    });
    const e1 = evaluation.findings.find((finding) => finding.ruleId === "E1")!;
    expect(usage).toMatchObject({ mainSessions: 2, activeDays: 3, outputTokens: 73, cacheHit: e1.value, shellNonZero: null });
    expect(usage.cacheHit).toBe(0.9);
    expect(usage.byTool).toEqual([{ tool: "claude-code", mainSessions: 2, activeDays: 3, outputTokens: 73, cacheHit: 0.9, shellNonZero: null }]);
  });

  it("셸 명령 몫은 점수 구간의 셸 도구 결과 가운데 오류의 몫이다. 셸이 아닌 도구와 구간 밖은 들지 않는다", () => {
    const { usage } = usageOf({
      sessions: [
        { days: { "2026-11-10": { responses: 1, tools: { Bash: { calls: 6, results: 6, errors: 2 }, Read: { calls: 9, results: 9, errors: 9 } } } } },
        { kind: "sub", parentSessionId: "x", days: { "2026-11-11": { responses: 1, tools: { PowerShell: { calls: 4, results: 4, errors: 1 } } } } },
        { days: { "2026-10-11": { responses: 1, tools: { Bash: { calls: 5, results: 5, errors: 5 } } } } },
      ],
    });
    expect(usage.shellNonZero).toBe(3 / 10);
  });

  it("셸 종료 코드를 못 보는 형식이면 셸 명령 몫은 null이다", () => {
    const { usage } = usageOf({ coverage: { ...CLAUDE_COVERAGE, shellExitCodes: "unsupported" }, sessions: [{ days: { "2026-11-10": { responses: 1, tools: { Bash: { calls: 1, results: 1, errors: 1 } } } } }] });
    expect(usage.shellNonZero).toBeNull();
    expect(usage.byTool[0]!.shellNonZero).toBeNull();
  });

  it("달력은 수집 구간 35일을 오래된 날부터 싣고 날마다 응답 수와 쓴 날·안 쓴 날·볼 수 없는 날을 가른다", () => {
    const { usage } = usageOf({ sessions: [{ days: { "2026-10-12": { responses: 2 }, "2026-11-13": { responses: 1 } } }, { kind: "sub", parentSessionId: "x", days: { "2026-11-13": { responses: 4 } } }] }, "2026-10-12");
    expect(usage.calendar).toHaveLength(35);
    expect(usage.calendar[0]).toEqual({ date: "2026-10-10", responses: 0, state: "unseen" });
    expect(usage.calendar[1]).toEqual({ date: "2026-10-11", responses: 0, state: "unseen" });
    expect(usage.calendar[2]).toEqual({ date: "2026-10-12", responses: 2, state: "used" });
    expect(usage.calendar[3]).toEqual({ date: "2026-10-13", responses: 0, state: "unused" });
    expect(usage.calendar[34]).toEqual({ date: "2026-11-13", responses: 5, state: "used" });
  });

  it("기록은 남아 있는데 수집 구간에 응답이 없으면 남아 있는 범위의 날은 안 쓴 날이다", () => {
    const { usage } = usageOf({ sessions: [] }, "2026-09-01");
    expect(new Set(usage.calendar.map((cell) => cell.state))).toEqual(new Set(["unused"]));
  });

  it("남아 있는 기록이 없으면 모든 날이 볼 수 없는 날이고, 점수에 넣는 도구가 없으면 숫자는 0, 캐시 적중은 null, 도구별 나눔은 비어 있다", () => {
    const { usage } = usageOf({ sessions: [] }, null);
    expect(new Set(usage.calendar.map((cell) => cell.state))).toEqual(new Set(["unseen"]));
    expect(usage).toMatchObject({ mainSessions: 0, activeDays: 0, outputTokens: 0, cacheHit: null, shellNonZero: null, byTool: [] });
  });
});
