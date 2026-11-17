// Codex가 지표마다 무엇을 기록하는지(설계 9.7)와, 깨진 줄·끝 조각의 맨 바깥 종류를 세는 것, MCP 호출의 관측이 빠짐없는지(설계 9.8)를 시험한다
import { describe, expect, it } from "vitest";
import { CODEX_COVERAGE, CODEX_MCP_NON_SIGNAL_TYPES, codexMcpObservation, CODEX_USAGE_MARKERS } from "../../../src/adapters/codex/observation.ts";
import { CodexSessionParser } from "../../../src/adapters/codex/parser.ts";

const META = JSON.stringify({ timestamp: "2026-11-10T01:00:00Z", type: "session_meta", payload: { id: "s", thread_source: "user" } });
function summaryOf(lines: string[], options: { tail?: string; inProgress?: boolean; tooLong?: number; plainLong?: number } = {}) {
  const parser = new CodexSessionParser({ recordId: "r", timeZone: "Asia/Seoul" });
  for (const text of lines) parser.line(text);
  // tooLong은 MCP 호출의 표지가 든 너무 긴 줄, plainLong은 표지가 없는 너무 긴 줄이다(0.3.0)
  for (let i = 0; i < (options.tooLong ?? 0); i++) parser.tooLong(new Set(["mcp"]));
  for (let i = 0; i < (options.plainLong ?? 0); i++) parser.tooLong(new Set());
  return parser.finish(options.tail ?? null, options.inProgress ?? false);
}

describe("관측 범위", () => {
  it("설계 9.7의 Codex 새 형식 열이다. 사람 요청, 도구 호출 수, 자동 압축은 대신 보고, 거절과 길이 끊김, 실린 이름, 스킬 사용, MCP 연결 실패와 훅, 하위 에이전트는 못 본다", () => {
    expect(CODEX_COVERAGE).toEqual({
      responsesAndTokens: "measured",
      humanRequests: "proxy",
      toolCalls: "proxy",
      toolErrors: "measured",
      shellExitCodes: "measured",
      deniedAndLengthStops: "unsupported",
      interruptedTurns: "measured",
      autoCompaction: "proxy",
      effort: "measured",
      loadedNames: "unsupported",
      skillUsage: "unsupported",
      mcpCalls: "measured",
      mcpFailuresAndHooks: "unsupported",
      instructionSize: "measured",
      subagents: "unsupported",
    });
  });
});

describe("깨진 줄과 끝 조각의 맨 바깥 종류", () => {
  it("해석기는 풀리지 않는 줄과 끝 조각의 맨 바깥 type을, 처음부터 온전히 읽히면 그 값으로, 아니면 ?로 센다(1단계와 같다)", () => {
    const summary = summaryOf([META, '{"type":"world_state","payload":{"state":', '{"payload":{"type":"item_completed"', '{"type":"event_msg","pay'], { tail: '{"type":"compacted","payl', inProgress: true });
    expect(summary.missing).toMatchObject({ brokenLines: 3, tailFragments: 1, unconfirmedTypes: { world_state: 1, "?": 1, event_msg: 1, compacted: 1 } });
  });

  it("쓰는 중이 아닌 파일의 풀리지 않는 끝도 깨진 줄로 종류를 센다. 상한을 넘은 줄은 종류를 세지 않는다", () => {
    const summary = summaryOf([META], { tail: '{"type":"response_item","pay', tooLong: 2 });
    expect(summary.missing).toMatchObject({ brokenLines: 1, tailFragments: 0, tooLongLines: 2, unconfirmedTypes: { response_item: 1 } });
  });
});

describe("MCP 호출의 관측", () => {
  it("사용 신호가 될 수 없는 종류는 설계 9.8 표의 Codex 칸 그대로다. 호출 층(response_item)은 사용 신호가 될 수 있는 종류다", () => {
    expect([...CODEX_MCP_NON_SIGNAL_TYPES].sort()).toEqual(["compacted", "session_meta", "token_usage_record", "turn_context", "world_state"]);
  });

  it("빠진 것이 없으면 빠짐없다", () => {
    expect(codexMcpObservation([summaryOf([META])], 0)).toEqual({ complete: true, reasons: [] });
    expect(codexMcpObservation([], 0)).toEqual({ complete: true, reasons: [] });
  });

  it("읽지 못한 것이 하나라도 있으면 빠짐없지 않다", () => {
    expect(codexMcpObservation([summaryOf([META])], 1)).toEqual({ complete: false, reasons: ["unreadable-files"] });
  });

  it("MCP 호출의 표지가 든 너무 긴 줄이 있으면 빠짐없지 않고, 표지가 없는 긴 줄은 상관없다(0.3.0, 다른 PC 피드백 7번)", () => {
    expect(codexMcpObservation([summaryOf([META], { tooLong: 1 })], 0)).toEqual({ complete: false, reasons: ["too-long-lines"] });
    expect(codexMcpObservation([summaryOf([META], { plainLong: 2 })], 0)).toEqual({ complete: true, reasons: [] });
    // 표지를 세지 않은 옛 요약은 긴 줄이 하나라도 있으면 막는다
    const old = summaryOf([META], { plainLong: 1 });
    const { tooLongMcpLines: _dropped, ...withoutCount } = old.missing;
    expect(codexMcpObservation([{ ...old, missing: withoutCount }], 0).complete).toBe(false);
    expect(CODEX_USAGE_MARKERS.map((marker) => [marker.name, marker.bytes.toString()])).toEqual([["mcp", '"McpToolCall"'], ["mcp", '"mcp__']]);
  });

  it("깨진 줄과 끝 조각이 사용 신호가 될 수 없는 종류로 온전히 읽히면 상관없는 줄이다", () => {
    const pieces = [...CODEX_MCP_NON_SIGNAL_TYPES].map((type) => `{"type":"${type}","payload":{`);
    expect(codexMcpObservation([summaryOf([META, ...pieces], { tail: '{"type":"compacted"', inProgress: true })], 0)).toEqual({ complete: true, reasons: [] });
  });

  it.each([
    ["사용 신호가 실리는 event_msg", '{"type":"event_msg","payload":{"type":"item_completed"'],
    ["사용 신호가 실리는 response_item", '{"type":"response_item","pay'],
    ["목록에 없는 종류", '{"type":"inter_agent_communication_metadata","pay'],
    ["안쪽의 type만 읽히는 것", '{"payload":{"type":"compacted"'],
    ["종류를 읽지 못한 것", '{"ty'],
  ])("깨진 줄의 종류가 %s이면 빠짐없지 않다", (_name, piece) => {
    expect(codexMcpObservation([summaryOf([META, piece])], 0)).toEqual({ complete: false, reasons: ["unconfirmed-pieces"] });
  });

  it("까닭은 읽지 못한 것, 너무 긴 줄, 확인하지 못한 조각의 차례로 한 번씩 낸다", () => {
    const summaries = [summaryOf([META, '{"ty'], { tooLong: 1 }), summaryOf([META, '{"type":"event_msg"'])];
    expect(codexMcpObservation(summaries, 3)).toEqual({ complete: false, reasons: ["unreadable-files", "too-long-lines", "unconfirmed-pieces"] });
  });
});
