// 평가 결과의 도구 목록(찾았는지, 점수와 달력에 넣는지, 형식, 점수 구간의 세션·요청·응답 수, 볼 수 있는 날짜 범위)을 시험한다(설계 9.8, 12.2)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { resultTools, type CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";

const collected = (input: Partial<CollectedTool> = {}): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-09-01",
  overlappingSessions: 0,
  read: { files: 0, listedBytes: 0, bytes: 0, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
  ...input,
});

describe("도구 목록", () => {
  it("점수 구간의 주 세션·하위 세션·사람 요청·응답 수와 볼 수 있는 날짜 범위를 싣는다", () => {
    const input = evaluationInput([
      claudeTool({
        sessions: [
          { sessionId: "m1", days: { "2026-11-10": { responses: 5, humanRequests: 2 }, "2026-11-11": { responses: 1, humanRequests: 1 } } },
          { sessionId: "m2", days: { "2026-10-20": { responses: 3, humanRequests: 1 } } },
          { sessionId: "sub1", kind: "sub", parentSessionId: "m1", days: { "2026-11-10": { responses: 4 } } },
          // 점수 구간 밖(수집 구간 안)의 세션은 점수 구간의 숫자에 들지 않는다
          { sessionId: "old", days: { "2026-10-12": { responses: 7, humanRequests: 3 } } },
          { sessionId: "oldsub", kind: "sub", parentSessionId: "old", days: { "2026-10-12": { responses: 2 } } },
        ],
      }),
    ]);
    const evaluation = evaluate(input);
    expect(resultTools(input, evaluation, [collected()])).toEqual([
      {
        tool: "claude-code",
        detected: true,
        scored: true,
        inCalendar: true,
        formats: ["claude-code-jsonl"],
        mainSessions: 2,
        subSessions: 1,
        humanRequests: 4,
        responses: 13,
        visible: { from: "2026-09-01", to: "2026-11-13" },
      },
    ]);
  });

  it("수집 구간에만 응답이 있는 도구는 달력에만 넣는다", () => {
    const input = evaluationInput([claudeTool({ sessions: [{ days: { "2026-10-11": { responses: 2, humanRequests: 1 } } }] })]);
    const [tool] = resultTools(input, evaluate(input), [collected({ visibleFrom: "2026-10-11" })]);
    expect(tool).toMatchObject({ scored: false, inCalendar: true, mainSessions: 0, subSessions: 0, humanRequests: 0, responses: 0, visible: { from: "2026-10-11", to: "2026-11-13" } });
  });

  it("기록 폴더가 없는 도구는 찾지 못했다고 싣고 숫자는 0, 볼 수 있는 범위는 null이다", () => {
    const input = evaluationInput([claudeTool()]);
    const [tool] = resultTools(input, evaluate(input), [collected({ detected: false, visibleFrom: null })]);
    expect(tool).toEqual({ tool: "claude-code", detected: false, scored: false, inCalendar: false, formats: ["claude-code-jsonl"], mainSessions: 0, subSessions: 0, humanRequests: 0, responses: 0, visible: null });
  });
});
