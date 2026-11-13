// 기록 쪽 알림(읽지 못한 기록, 관측이 빠짐없지 않음, 확인한 범위 밖 버전, 겹치는 응답, 근거가 약한 사람 요청, 분류하지 못한 표시, 부모를 모르는 하위 세션)을 시험한다(설계 9.2, 9.5, 9.8, 12.2, 20.1)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { recordNotices, VERIFIED_VERSIONS } from "../../src/core/result/notices.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const base = (): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
});
const noticesOf = (tool: ClaudeToolInput, collected: Partial<CollectedTool> = {}) => {
  const input = evaluationInput([claudeTool(tool)]);
  return recordNotices(input, evaluate(input), [{ ...base(), ...collected }]);
};
const fine = { days: { "2026-11-10": { responses: 3, humanRequests: 10 } } };

describe("기록 쪽 알림", () => {
  it("빠진 것이 없으면 알림이 없다", () => {
    expect(noticesOf({ sessions: [fine] })).toEqual([]);
  });

  it("읽지 못한 기록 파일과 폴더를 경로 차례로 알린다", () => {
    const notices = noticesOf({ sessions: [fine] }, { read: { ...base().read, unreadableFiles: ["/h/p/b.jsonl", "/h/p/a.jsonl"], unreadableDirs: ["/h/q"] } });
    expect(notices).toEqual([{ kind: "record_unreadable", tool: "claude-code", files: ["/h/p/a.jsonl", "/h/p/b.jsonl"], dirs: ["/h/q"] }]);
  });

  it("스킬이나 MCP의 관측이 빠짐없지 않으면 지표마다 까닭과 함께 알린다", () => {
    const notices = noticesOf({ sessions: [fine] }, { observation: { skills: { complete: false, reasons: ["too-long-lines"] }, mcp: { complete: false, reasons: ["unreadable-files", "unconfirmed-pieces"] } } });
    expect(notices).toEqual([
      { kind: "observation_incomplete", tool: "claude-code", metric: "skills", reasons: ["too-long-lines"] },
      { kind: "observation_incomplete", tool: "claude-code", metric: "mcp", reasons: ["unreadable-files", "unconfirmed-pieces"] },
    ]);
  });

  it("확인한 범위 밖 버전의 기록이 있으면 그 버전들을 버전 차례로 알린다. 버전을 모르는 세션은 넣지 않는다", () => {
    expect(VERIFIED_VERSIONS["claude-code"]).toEqual({ from: "2.1.220", to: "2.1.322" });
    const notices = noticesOf({ sessions: [{ ...fine, version: "2.1.323" }, { ...fine, version: "2.1.100" }, { ...fine, version: "2.1.322" }, { ...fine, version: "2.1.220" }, { ...fine, version: null }, { ...fine, version: "2.1.323" }] });
    expect(notices).toEqual([{ kind: "version_unverified", tool: "claude-code", versions: ["2.1.100", "2.1.323"], verified: { from: "2.1.220", to: "2.1.322" } }]);
  });

  it("처음 나온 응답이 다른 세션과 겹치는 세션이 있으면 그 수를 알린다", () => {
    expect(noticesOf({ sessions: [fine] }, { overlappingSessions: 2 })).toEqual([{ kind: "overlapping_responses", tool: "claude-code", sessions: 2 }]);
  });

  it("점수 구간의 사람 요청 가운데 근거가 약한 것이 10%를 넘으면 알린다. 정확히 10%와 구간 밖은 알리지 않는다", () => {
    expect(noticesOf({ sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 10, weakHumanRequests: 1 } } }] })).toEqual([]);
    expect(noticesOf({ sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 10, weakHumanRequests: 2 } } }] })).toEqual([{ kind: "weak_human_requests", tool: "claude-code", weak: 2, total: 10 }]);
    expect(noticesOf({ sessions: [fine, { days: { "2026-10-11": { responses: 1, humanRequests: 5, weakHumanRequests: 5 } } }] })).toEqual([]);
    expect(noticesOf({ sessions: [fine, { kind: "sub", parentSessionId: "x", days: { "2026-11-10": { responses: 1, humanRequests: 5, weakHumanRequests: 5 } } }] })).toEqual([]);
  });

  it("분류하지 못한 거절 표시, 압축, 훅 첨부는 종류마다 수를 더해 알린다", () => {
    const notices = noticesOf({
      sessions: [
        { days: { "2026-11-10": { responses: 1, humanRequests: 10, unknownDenialKinds: { "new-kind": 2 }, unknownCompactions: 1 } }, notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: 0, unknownHookKinds: { hook_odd: 3 } } },
        { days: { "2026-10-11": { responses: 1, unknownDenialKinds: { "new-kind": 1, other: 1 } } } },
      ],
    });
    expect(notices).toEqual([{ kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:new-kind", count: 3 }, { what: "denial:other", count: 1 }, { what: "hook:hook_odd", count: 3 }] }]);
  });

  it("부모를 모르는 하위 세션의 수를 알린다", () => {
    expect(noticesOf({ sessions: [fine, { kind: "sub", parentSessionId: null, days: { "2026-11-10": { responses: 1 } } }, { kind: "sub", parentSessionId: "p", days: { "2026-11-10": { responses: 1 } } }] })).toEqual([{ kind: "orphan_subsessions", tool: "claude-code", sessions: 1 }]);
  });

  it("알림은 종류의 차례로 나온다", () => {
    const notices = noticesOf({ sessions: [{ ...fine, version: "2.1.400" }, { kind: "sub", parentSessionId: null, days: { "2026-11-10": { responses: 1 } } }] }, { overlappingSessions: 1, read: { ...base().read, unreadableFiles: ["/x.jsonl"] } });
    expect(notices.map((notice) => notice.kind)).toEqual(["record_unreadable", "version_unverified", "overlapping_responses", "orphan_subsessions"]);
  });
});
