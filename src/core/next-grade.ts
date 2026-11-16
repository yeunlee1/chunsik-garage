// 다음 등급까지 할 일. 고칠 것을 하나씩 더해 가며 기준 점수와 AQ를 점수 계산 그대로 다시 내어, 다음 등급에 닿는 차례를 고른다(순수 함수, 설계 「0.2.0에서 정한 것」)
import type { Axis, RuleId } from "./rules.ts";
import { AXES, aqOfAxes, axisScore } from "./scoreboard.ts";
import { gradeOf, settleScore, type Grade } from "./score.ts";

/** 차례를 이만큼까지 낸다 */
export const NEXT_GRADE_STEPS = 5;

/** 등급마다 다음 등급과 그 문턱(설계 11.6의 경계) */
const NEXT: Readonly<Record<Exclude<Grade, "S">, { grade: Grade; at: number }>> = { D: { grade: "C", at: 50 }, C: { grade: "B", at: 65 }, B: { grade: "A", at: 80 }, A: { grade: "S", at: 90 } };

/** 다시 계산에 쓰는 규칙 하나. score는 맞추지 않은 규칙 점수(0에서 1), gain은 그 규칙만 고쳤을 때 기준 점수가 오르는 폭이다 */
export interface GradeInput {
  ruleId: RuleId;
  axis: Axis;
  weight: number;
  score: number | null;
  gain: number | null;
}

export interface NextGradeStep {
  ruleId: RuleId;
  axis: Axis;
  /** 이 차례까지 고친 것을 모두 넣어 다시 낸 AQ */
  aq: number;
  grade: Grade;
}

export interface NextGrade {
  /** 다음 등급 */
  grade: Grade;
  /** 다음 등급까지 모자란 점수 */
  need: number;
  steps: NextGradeStep[];
  /** 마지막 차례의 AQ가 다음 등급에 닿는다 */
  reaches: boolean;
}

/** 고친 것을 넣은 기준 점수들. 반올림한 합(AQ를 정함)과 반올림 전의 합(같을 때 가름)을 함께 낸다 */
function totals(rules: readonly GradeInput[], fixed: ReadonlySet<RuleId>): { rounded: number[]; raw: number } {
  const rounded: number[] = [];
  let raw = 0;
  for (const axis of AXES) {
    const own = rules.filter((rule) => rule.axis === axis).map((rule) => ({ weight: rule.weight, score: fixed.has(rule.ruleId) ? 1 : rule.score }));
    const score = axisScore(own);
    if (score === null) continue;
    rounded.push(score);
    const measured = own.filter((rule): rule is { weight: number; score: number } => rule.score !== null);
    raw += (measured.reduce((sum, rule) => sum + rule.weight * rule.score, 0) / measured.reduce((sum, rule) => sum + rule.weight, 0)) * 100;
  }
  return { rounded, raw };
}

/**
 * 다음 등급까지의 차례. AQ가 없거나 S등급이면 null이다.
 * 차례마다 아직 고르지 않은 것 가운데, 넣었을 때 반올림한 기준 점수의 합이 가장 큰 것을 고른다. 같으면 반올림 전의 합, 그 규칙만의 예상 효과, 들어온 차례 순이다.
 * 다음 등급에 닿거나 NEXT_GRADE_STEPS개가 차면 멈춘다
 */
export function nextGrade(rules: readonly GradeInput[], score: { aq: number | null; grade: Grade | null }): NextGrade | null {
  if (score.aq === null || score.grade === null || score.grade === "S") return null;
  const target = NEXT[score.grade];
  const candidates = rules.filter((rule) => rule.score !== null && settleScore(rule.score) < 1);
  const fixed = new Set<RuleId>();
  const steps: NextGradeStep[] = [];
  while (steps.length < NEXT_GRADE_STEPS && (steps.at(-1)?.aq ?? score.aq) < target.at) {
    let best: { rule: GradeInput; rounded: number; raw: number } | null = null;
    for (const rule of candidates) {
      if (fixed.has(rule.ruleId)) continue;
      const after = totals(rules, new Set([...fixed, rule.ruleId]));
      const rounded = after.rounded.reduce((sum, value) => sum + value, 0);
      const better = best === null || rounded > best.rounded || (rounded === best.rounded && (after.raw > best.raw + 1e-9 || (Math.abs(after.raw - best.raw) <= 1e-9 && (rule.gain ?? -1) > (best.rule.gain ?? -1))));
      if (better) best = { rule, rounded, raw: after.raw };
    }
    if (best === null) break;
    fixed.add(best.rule.ruleId);
    const aq = aqOfAxes(totals(rules, fixed).rounded);
    steps.push({ ruleId: best.rule.ruleId, axis: best.rule.axis, aq, grade: gradeOf(aq).grade });
  }
  if (steps.length === 0) return null;
  return { grade: target.grade, need: target.at - score.aq, steps, reaches: steps.at(-1)!.aq >= target.at };
}
