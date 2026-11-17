// 스킬 사용과 MCP 호출의 관측이 빠짐없는지 가르는 것을 시험한다(설계 9.8, 21.1 반례)
import { describe, expect, it } from "vitest";
import { CLAUDE_USAGE_MARKERS, claudeObservation, mostlyBroken } from "../../../src/adapters/claude/observation.ts";
import { ClaudeSessionParser } from "../../../src/adapters/claude/parser.ts";
import type { SessionSummary } from "../../../src/adapters/types.ts";
import { parseLines } from "../../helpers/claude-lines.ts";

function withMissing(unconfirmedTypes: Record<string, number>, tooLongLines = 0): SessionSummary {
  const summary = parseLines([]);
  return { ...summary, missing: { lines: 10, brokenLines: 1, tailFragments: 0, tooLongLines, unconfirmedTypes } };
}

describe("claudeObservation", () => {
  it("빠진 것이 없으면 빠짐없다", () => {
    expect(claudeObservation([parseLines([])], 0, "skill")).toEqual({ complete: true, reasons: [] });
  });
  it("읽지 못한 파일이 있으면 미확인이다", () => {
    expect(claudeObservation([parseLines([])], 1, "mcp")).toEqual({ complete: false, reasons: ["unreadable-files"] });
  });
  it("너무 긴 줄이 있으면 두 지표 모두 미확인이다", () => {
    const s = withMissing({}, 1);
    expect(claudeObservation([s], 0, "skill").complete).toBe(false);
    expect(claudeObservation([s], 0, "mcp").reasons).toEqual(["too-long-lines"]);
  });
  it("너무 긴 줄의 표지를 셌으면 그 지표의 표지가 든 긴 줄만 막는다. 세지 않은 옛 요약은 긴 줄이 하나라도 있으면 막는다(0.3.0, 다른 PC 피드백 7번)", () => {
    const base = withMissing({}, 3);
    const counted = { ...base, missing: { ...base.missing, tooLongSkillLines: 0, tooLongMcpLines: 1 } };
    expect(claudeObservation([counted], 0, "skill")).toEqual({ complete: true, reasons: [] });
    expect(claudeObservation([counted], 0, "mcp")).toEqual({ complete: false, reasons: ["too-long-lines"] });
    expect(claudeObservation([base], 0, "skill").complete).toBe(false);
  });
  it("파서는 너무 긴 줄에서 찾은 표지를 지표마다 센다", () => {
    const parser = new ClaudeSessionParser({ sessionId: "s1", kind: "main", parentSessionId: null, timeZone: "UTC" });
    parser.tooLong(new Set(["skill"]));
    parser.tooLong(new Set(["mcp", "skill"]));
    parser.tooLong(new Set());
    parser.tooLong();
    const missing = parser.finish(null, false).missing;
    expect([missing.tooLongLines, missing.tooLongSkillLines, missing.tooLongMcpLines]).toEqual([4, 2, 1]);
    expect(CLAUDE_USAGE_MARKERS.map((marker) => [marker.name, marker.bytes.toString()])).toEqual([
      ["skill", '"name":"Skill"'],
      ["skill", "<command-name>"],
      ["skill", '"attributionSkill":"'],
      ["skill", '"type":"invoked_skills"'],
      ["mcp", '"name":"mcp__'],
      ["mcp", '"attributionMcpServer":"'],
    ]);
  });
  it("깨진 줄이 system으로 온전히 읽히면 상관없는 줄이다", () => {
    const s = withMissing({ system: 1 });
    expect(claudeObservation([s], 0, "skill").complete).toBe(true);
    expect(claudeObservation([s], 0, "mcp").complete).toBe(true);
  });
  it("깨진 user 줄은 스킬에는 미확인, MCP에는 상관없는 줄이다", () => {
    const s = withMissing({ user: 1 });
    expect(claudeObservation([s], 0, "skill")).toEqual({ complete: false, reasons: ["unconfirmed-pieces"] });
    expect(claudeObservation([s], 0, "mcp").complete).toBe(true);
  });
  it("실제 깨진 줄을 해석기부터 넣어도, 종류를 읽지 못하거나 목록에 없으면 미확인이다", () => {
    const unknown = parseLines(['{"message":{"content":[{"type":"tool_use","name":"Skill"}]}']);
    const brandNew = parseLines(['{"type":"brand-new-type","payload":}']);
    const harmless = parseLines(['{"type":"system","subtype":"x",']);
    expect(claudeObservation([unknown], 0, "skill").complete).toBe(false);
    expect(claudeObservation([brandNew], 0, "mcp").complete).toBe(false);
    expect(claudeObservation([harmless], 0, "skill").complete).toBe(true);
  });
  it("종류를 읽지 못했거나 목록에 없는 종류면 미확인이다", () => {
    expect(claudeObservation([withMissing({ "?": 1 })], 0, "mcp").complete).toBe(false);
    expect(claudeObservation([withMissing({ "brand-new-type": 1 })], 0, "skill").complete).toBe(false);
    expect(claudeObservation([withMissing({ assistant: 1 })], 0, "mcp").complete).toBe(false);
  });
});

describe("mostlyBroken", () => {
  it("깨진 줄이 줄 수의 절반을 넘을 때만 참이다", () => {
    const at = (lines: number, brokenLines: number): SessionSummary => {
      const summary = parseLines([]);
      return { ...summary, missing: { ...summary.missing, lines, brokenLines } };
    };
    expect(mostlyBroken(at(10, 5))).toBe(false);
    expect(mostlyBroken(at(10, 6))).toBe(true);
    expect(mostlyBroken(at(0, 0))).toBe(false);
    expect(mostlyBroken(parseLines(["{broken", "{broken", '{"type":"ai-title","title":"x"}']))).toBe(true);
  });
});
