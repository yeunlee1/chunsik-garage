// 합성 사용자 다섯이 기대한 등급을 받는지 시험한다. 기록과 셋팅에서 등급까지 한 번에 이어 본다(설계 11.6, 21.1 「점수」)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { PERSONAS, personaInput, type Persona } from "../helpers/personas.ts";

const run = (persona: Persona) => evaluate(personaInput(persona));
const finding = (result: ReturnType<typeof evaluate>, id: string) => result.findings.find((f) => f.ruleId === id)!;

describe("합성 사용자", () => {
  it.each([
    ["S", 5],
    ["A", 4],
    ["B", 3],
    ["C", 2],
    ["D", 1],
  ] as const)("등급 %s의 사용자는 그 등급을 받는다", (grade, tier) => {
    const result = run(PERSONAS[grade]);
    expect({ grade: result.score.grade, tier: result.score.tier, withheld: result.score.withheld }).toEqual({ grade, tier, withheld: [] });
  });
  it.each([
    ["S", 100, [100, 100, 100, 100]],
    ["A", 87, [98, 88, 88, 75]],
    ["B", 71, [87, 68, 68, 61]],
    ["C", 56, [79, 55, 48, 41]],
    ["D", 12, [7, 19, 8, 14]],
  ] as const)("등급 %s의 사용자는 AQ %i이고 기준 점수는 셋팅, 효율, 상황 적합, 강도의 차례로 %j다", (grade, aq, axes) => {
    // 등급만 보면 문턱에서 먼 사용자의 작은 점수 변화를 놓친다. 기준 점수까지 고정해 둔다. 값이 옳은지는 규칙마다의 시험이 보고, 이 시험은 달라졌는지를 본다
    const result = run(PERSONAS[grade]);
    expect(result.axes.map((axis) => axis.score)).toEqual(axes);
    expect(result.score.aq).toBe(aq);
    expect(result.score.aq).toBe(Math.floor(axes.reduce((sum, score) => sum + score, 0) / axes.length + 0.5));
  });
  it("등급이 높은 사용자일수록 AQ가 높다", () => {
    const aq = (["D", "C", "B", "A", "S"] as const).map((grade) => run(PERSONAS[grade]).score.aq!);
    expect([...aq].sort((a, b) => a - b)).toEqual(aq);
    expect(new Set(aq).size).toBe(5);
  });
  it("적은 값이 그대로 잰 값으로 나온다. 지어낸 기록이 규칙에 제대로 이어졌는지 본다", () => {
    const b = PERSONAS.B;
    const result = run(b);
    const value = (id: string): number => finding(result, id).value!;
    expect(result.findings.filter((f) => f.status === "unmeasured").map((f) => f.ruleId)).toEqual([]);
    expect([value("I1"), value("I2"), value("I3"), value("I4")]).toEqual([b.activeDays, b.requestsPerDay, b.callsPerRequest, b.projects]);
    expect([value("S1"), value("S2"), value("S3")]).toEqual([1, 1, b.problems]);
    expect(value("S4")).toBeCloseTo(b.hookFailures / 1000, 12);
    expect(value("S5")).toBeCloseTo(b.mcpFailedSessions / 12, 12);
    expect(value("E1")).toBeCloseTo(b.cacheRead / 1000, 12);
    expect(value("E2")).toBeCloseTo(b.toolErrors / 1000, 12);
    expect(value("E3")).toBeCloseTo(b.compactions / 12, 12);
    expect(value("E4")).toBe(b.instructionTokens);
    expect(value("E5")).toBeCloseTo(b.unusedSkills / 10, 12);
    expect(value("E6")).toBeCloseTo(b.unusedServers / 4, 12);
    // 거절한 도구 실행은 정수로 맞춰 넣으므로 소수 둘째 자리까지 본다
    expect(value("E7")).toBeCloseTo(b.stoppedPerThousand / 1000, 2);
    expect(value("F1")).toBeCloseTo(b.highEffort / 1000, 12);
    // 자동 압축은 세션마다 하나씩 나눠 두었으므로 압축이 있었던 세션의 수는 압축 횟수와 같다(열둘까지)
    expect(value("F2")).toBeCloseTo(b.delegatedSessions / Math.min(b.compactions, 12), 12);
    expect(value("F3")).toBeCloseTo(b.guidedProjects / b.projects, 12);
    expect(value("F4")).toBeCloseTo(b.overlappingLines / 20, 12);
    expect(value("F5")).toBeCloseTo(b.copiedSkills / 10, 12);
    expect(value("F6")).toBe(b.conflicts);
  });
});
