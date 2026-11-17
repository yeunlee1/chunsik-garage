// 다음 등급까지 할 일을 시험한다. 고칠 것을 하나씩 더해 가며 기준 점수와 AQ를 점수 계산 그대로 다시 내고, 다음 등급에 닿는 차례를 고른다(설계 「0.2.0에서 정한 것」)
import { describe, expect, it } from "vitest";
import { nextGrade, NEXT_GRADE_STEPS, type GradeInput } from "../../src/core/next-grade.ts";
import type { Axis, RuleId } from "../../src/core/rules.ts";
import { axisScore, aqOfAxes } from "../../src/core/scoreboard.ts";
import { gradeOf, type Grade } from "../../src/core/score.ts";

const rule = (ruleId: RuleId, axis: Axis, weight: number, score: number | null): GradeInput => ({ ruleId, axis, weight, score, gain: null });
/** 점수판과 같은 계산으로 낸 AQ와 등급 */
function scoreOf(rules: readonly GradeInput[]): { aq: number; grade: Grade } {
  const axes = (["setup", "efficiency", "fit", "intensity"] as const).map((axis) => axisScore(rules.filter((r) => r.axis === axis)));
  const aq = aqOfAxes(axes.filter((score): score is number => score !== null));
  return { aq, grade: gradeOf(aq).grade };
}
const fixed = (rules: readonly GradeInput[], ids: ReadonlySet<RuleId>): GradeInput[] => rules.map((r) => (ids.has(r.ruleId) ? { ...r, score: 1 } : r));

describe("다음 등급까지", () => {
  it("한 번에 기준 점수의 합을 가장 많이 올리는 것부터 고르고, 다음 등급에 닿으면 멈춘다", () => {
    // 셋팅 round((3×0.5+1×1)/4×100)=63, 효율 90, 상황 적합 100, 강도 60 → AQ round(78.25)=78(B), A까지 2점
    const rules = [rule("S1", "setup", 3, 0.5), rule("S2", "setup", 1, 1), rule("E1", "efficiency", 2, 0.9), rule("F1", "fit", 1, 1), rule("I1", "intensity", 1, 0.6)];
    expect(scoreOf(rules)).toEqual({ aq: 78, grade: "B" });
    // I1을 고치면 강도 +40, S1을 고치면 셋팅 +37, E1은 효율 +10이다
    expect(nextGrade(rules, scoreOf(rules))).toEqual({ grade: "A", need: 2, reaches: true, steps: [{ ruleId: "I1", axis: "intensity", aq: 88, grade: "A" }] });
  });

  it("한 가지로 모자라면 차례로 더하고, 각 차례의 AQ는 그때까지 고친 것을 모두 넣어 다시 낸 값이다", () => {
    // 네 기준 모두 50 → AQ 50(C). B(65)까지 15점. 하나마다 기준 +50, AQ +12.5
    const rules = [rule("S1", "setup", 1, 0.5), rule("E1", "efficiency", 1, 0.5), rule("F1", "fit", 1, 0.5), rule("I1", "intensity", 1, 0.5)];
    const next = nextGrade(rules, scoreOf(rules))!;
    expect(next).toMatchObject({ grade: "B", need: 15, reaches: true });
    // 같은 폭이면 들어온 차례대로 고른다
    expect(next.steps.map((step) => [step.ruleId, step.aq, step.grade])).toEqual([
      ["S1", 63, "C"],
      ["E1", 75, "B"],
    ]);
    for (const [index, step] of next.steps.entries()) expect(step.aq).toBe(scoreOf(fixed(rules, new Set(next.steps.slice(0, index + 1).map((s) => s.ruleId)))).aq);
  });

  it("같은 폭이면 그 규칙만 고쳤을 때의 예상 효과가 큰 것을 먼저 고른다", () => {
    const rules = [rule("S1", "setup", 1, 0.5), { ...rule("E1", "efficiency", 1, 0.5), gain: 50 }, rule("F1", "fit", 1, 1), rule("I1", "intensity", 1, 1)];
    expect(nextGrade(rules, scoreOf(rules))!.steps[0]!.ruleId).toBe("E1");
  });

  it("사용자가 그대로 두기로 한 규칙은 차례에 넣지 않지만, 기준 점수와 AQ의 계산에는 그대로 넣는다(0.3.0, 다른 PC 피드백 5번)", () => {
    const rules = [rule("S1", "setup", 3, 0.5), rule("S2", "setup", 1, 1), rule("E1", "efficiency", 2, 0.9), rule("F1", "fit", 1, 0), rule("I1", "intensity", 1, 0.6)];
    const all = nextGrade(rules, scoreOf(rules))!;
    expect(all.steps.map((step) => step.ruleId)).toContain("F1");
    const kept = nextGrade(rules, scoreOf(rules), new Set<RuleId>(["F1"]))!;
    expect(kept.steps.map((step) => step.ruleId)).not.toContain("F1");
    // 각 차례의 AQ는 F1을 0점 그대로 둔 채 다시 낸 값이다
    let done = new Set<RuleId>();
    for (const step of kept.steps) {
      done = new Set([...done, step.ruleId]);
      expect(step.aq).toBe(scoreOf(fixed(rules, done)).aq);
    }
  });

  it("S등급이거나 AQ가 없으면 없다", () => {
    const top = [rule("S1", "setup", 1, 1), rule("E1", "efficiency", 1, 0.95)];
    expect(scoreOf(top).grade).toBe("S");
    expect(nextGrade(top, scoreOf(top))).toBeNull();
    expect(nextGrade([rule("S1", "setup", 1, 0.5)], { aq: null, grade: null })).toBeNull();
  });

  it("못 잰 규칙과 이미 만점인 규칙은 고칠 것에 넣지 않는다", () => {
    const rules = [rule("S1", "setup", 1, null), rule("S2", "setup", 1, 0.4), rule("E1", "efficiency", 1, 1)];
    expect(nextGrade(rules, scoreOf(rules))!.steps.map((step) => step.ruleId)).toEqual(["S2"]);
  });

  it(`차례는 많아야 ${NEXT_GRADE_STEPS}개이고, 그 안에 닿지 못하면 닿지 못했다고 하며 마지막 AQ를 준다`, () => {
    // 효율 하나에 무게 1, 점수 0인 규칙 열둘 → AQ 0(D). 하나마다 효율 +8.33이라 C(50)까지 여섯이 든다
    const ids: RuleId[] = ["S1", "S2", "S3", "S4", "S5", "E1", "E2", "E3", "E4", "E5", "E6", "E7"];
    const rules = ids.map((id) => rule(id, "efficiency", 1, 0));
    expect(scoreOf(rules)).toEqual({ aq: 0, grade: "D" });
    const next = nextGrade(rules, scoreOf(rules))!;
    expect(next.steps).toHaveLength(NEXT_GRADE_STEPS);
    expect(next).toMatchObject({ grade: "C", need: 50, reaches: false });
    expect(next.steps.at(-1)!.aq).toBe(42);
  });
});
