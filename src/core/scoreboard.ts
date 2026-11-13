// 잰 것을 점수판으로 묶는다. 도구별 규칙의 평균과 이유, 기준 점수, AQ와 등급, 화면에 내는 분류, 심각도, 예상 효과, 차례(순수 함수, 설계 11.4, 11.5, 11.6, 12.2)
import type { ToolId } from "../adapters/types.ts";
import type { Candidate } from "./installs/candidates.ts";
import type { Evidence, Measurement } from "./measure.ts";
import { ruleReason, type Reason } from "./reasons.ts";
import { RULES, type Axis, type RuleId, type RuleSpec, type ValueKind } from "./rules.ts";
import { gradeOf, roundHalfUp, ruleScore, settleScore, type Grade } from "./score.ts";

export type MergedRuleId = "S1" | "S2" | "S3" | "F3" | "F4" | "F6" | "I1" | "I2" | "I3" | "I4";
export type ToolRuleId = Exclude<RuleId, MergedRuleId>;

const isMerged = (id: RuleId): id is MergedRuleId => RULES.some((spec) => spec.id === id && spec.unit === "merged");
/** 도구를 합쳐 한 번 재는 규칙과 도구마다 재는 규칙(규칙 표의 차례) */
export const MERGED_RULES: readonly MergedRuleId[] = RULES.map((spec) => spec.id).filter(isMerged);
export const TOOL_RULES: readonly ToolRuleId[] = RULES.map((spec) => spec.id).filter((id): id is ToolRuleId => !isMerged(id));

/** 점수에 넣는 도구 하나에서 잰 것 */
export interface ToolMeasured {
  tool: ToolId;
  /** 점수 구간의 응답 수. 도구별 규칙을 평균할 때의 무게다 */
  responses: number;
  rules: Record<ToolRuleId, Measurement>;
  /** 이 도구에서 나온 정비 후보 */
  candidates: readonly Candidate[];
}

export interface Measured {
  merged: Record<MergedRuleId, Measurement>;
  /** 점수에 넣는 도구 */
  tools: readonly ToolMeasured[];
}

/** 도구별 값. 평균에 든 도구와 평균에서 뺀 도구를 모두 싣는다(설계 12.2) */
export interface ToolValue {
  tool: ToolId;
  status: "scored" | "unmeasured";
  reason: Reason | null;
  value: number | null;
  score: number | null;
  evidence: Evidence;
  /** 그 도구에서 나온 정비 후보의 ID */
  candidates: string[];
}

/** strength는 잘하고 있는 것, average는 보통, repair는 정비할 것, unmeasured는 잴 수 없음이다 */
export type Category = "strength" | "average" | "repair" | "unmeasured";
/** critical은 심각, caution은 주의, info는 참고다 */
export type Severity = "critical" | "caution" | "info";

export interface Finding {
  ruleId: RuleId;
  axis: Axis;
  kind: ValueKind;
  weight: number;
  status: "scored" | "unmeasured";
  reason: Reason | null;
  /** 잰 값. 못 쟀으면 null이다. 0으로 바꾸지 않는다 */
  value: number | null;
  /** 규칙 점수(0에서 1) */
  score: number | null;
  category: Category;
  /** 정비할 것에만 있다 */
  severity: Severity | null;
  /** 예상 효과. 그 규칙만 만점으로 바꿨을 때 기준 점수가 오르는 폭이다. 규칙을 쟀고 점수가 1 미만일 때만 있다 */
  gain: number | null;
  /** 합침 규칙의 근거 숫자. 도구별 규칙은 도구별 값에 싣고 여기는 비어 있다 */
  evidence: Evidence;
  /** 도구별 규칙에서만 낸다(도구 식별자의 차례). 합침 규칙에서는 빈 목록이다 */
  tools: ToolValue[];
  /** 도구별 값의 정비 후보를 합친 것 */
  candidates: string[];
}

export interface AxisScore {
  axis: Axis;
  /** 기준 점수(정수). 그 기준의 규칙을 하나도 못 쟀으면 null이다 */
  score: number | null;
  strengths: number;
  repairs: number;
}

export const AXES: readonly Axis[] = ["setup", "efficiency", "fit", "intensity"];
const CATEGORY_ORDER: readonly Category[] = ["strength", "average", "repair", "unmeasured"];
const SEVERITY_ORDER: readonly Severity[] = ["critical", "caution", "info"];
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Rated {
  status: "scored" | "unmeasured";
  reason: Reason | null;
  value: number | null;
  score: number | null;
  evidence: Evidence;
  tools: ToolValue[];
}

function rateMerged(spec: RuleSpec, measurement: Measurement): Rated {
  if (measurement.status === "unmeasured") return { status: "unmeasured", reason: measurement.reason, value: null, score: null, evidence: measurement.evidence, tools: [] };
  return { status: "scored", reason: null, value: measurement.value, score: ruleScore(measurement.value, spec.zeroAt, spec.fullAt), evidence: measurement.evidence, tools: [] };
}

/** 도구마다 점수를 낸 뒤 응답 수를 무게로 평균한다. 못 잰 도구는 평균에서 빼고, 남는 도구가 없으면 도구마다의 이유에서 하나를 고른다. */
function rateTools(spec: RuleSpec, id: ToolRuleId, tools: readonly ToolMeasured[]): Rated {
  const responses = new Map<ToolId, number>(tools.map((tool) => [tool.tool, tool.responses]));
  const values = tools.map((tool): ToolValue => {
    const measurement = tool.rules[id];
    const candidates = tool.candidates.filter((candidate) => candidate.rule === id).map((candidate) => candidate.id);
    if (measurement.status === "unmeasured") return { tool: tool.tool, status: "unmeasured", reason: measurement.reason, value: null, score: null, evidence: measurement.evidence, candidates };
    return { tool: tool.tool, status: "scored", reason: null, value: measurement.value, score: ruleScore(measurement.value, spec.zeroAt, spec.fullAt), evidence: measurement.evidence, candidates };
  });
  const measured = values.filter((value) => value.status === "scored");
  if (measured.length === 0) return { status: "unmeasured", reason: ruleReason(values.map((value) => value.reason!)), value: null, score: null, evidence: {}, tools: values };
  const weight = measured.reduce((sum, value) => sum + responses.get(value.tool)!, 0);
  const mean = (pick: (value: ToolValue) => number): number => measured.reduce((sum, value) => sum + pick(value) * responses.get(value.tool)!, 0) / weight;
  return { status: "scored", reason: null, value: mean((value) => value.value!), score: mean((value) => value.score!), evidence: {}, tools: values };
}

/** 점수를 경계와 견줄 때의 값. 끝자리 오차로 경계의 어느 쪽인지가 바뀌지 않게 맞춘 것이다. 점수가 없으면 null이다 */
const settled = (score: number | null): number | null => (score === null ? null : settleScore(score));

function categoryOf(spec: RuleSpec, rated: Rated, candidates: readonly string[]): Category {
  const score = settled(rated.score);
  // 못 잰 도구에서 나온 후보가 있으면 규칙을 못 쟀든, 다른 도구로 재서 점수가 1이든 정비할 것이다
  const fromUnmeasuredTool = rated.tools.some((tool) => tool.status === "unmeasured" && tool.candidates.length > 0);
  if (spec.tunable && (fromUnmeasuredTool || (score !== null && score < 1 && candidates.length > 0))) return "repair";
  if (score === null) return "unmeasured";
  return score >= 0.8 ? "strength" : score >= 0.6 ? "average" : "repair";
}

function severityOf(category: Category, rawScore: number | null, weight: number): Severity | null {
  const score = settled(rawScore);
  if (category !== "repair") return null;
  if (score === null) return "info";
  if (score < 0.3 && weight === 3) return "critical";
  return score < 0.6 && weight >= 2 ? "caution" : "info";
}

/** 정수로 반올림한 기준 점수. 잰 규칙이 없으면 null이다. */
function axisScore(rules: readonly { weight: number; score: number | null }[]): number | null {
  const measured = rules.filter((rule): rule is { weight: number; score: number } => rule.score !== null);
  if (measured.length === 0) return null;
  const weight = measured.reduce((sum, rule) => sum + rule.weight, 0);
  return roundHalfUp((measured.reduce((sum, rule) => sum + rule.weight * rule.score, 0) / weight) * 100);
}

function compareFindings(a: Finding, b: Finding, order: ReadonlyMap<RuleId, number>): number {
  const byTable = order.get(a.ruleId)! - order.get(b.ruleId)!;
  const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (byCategory !== 0) return byCategory;
  // 무게 × 점수가 수학으로 같은 둘이 끝자리 오차로 갈리지 않게 맞춘 값으로 견준다
  if (a.category === "strength") return settleScore(b.weight * b.score!) - settleScore(a.weight * a.score!) || byTable;
  if (a.category === "repair") {
    // 예상 효과가 없는 항목은 예상 효과가 있는 항목 뒤에 두고, 그런 항목끼리는 규칙 표의 순서다
    if (a.gain === null || b.gain === null) return (a.gain === null ? 1 : 0) - (b.gain === null ? 1 : 0) || byTable;
    return b.gain - a.gain || SEVERITY_ORDER.indexOf(a.severity!) - SEVERITY_ORDER.indexOf(b.severity!) || byTable;
  }
  return byTable;
}

export function scoreboard(measured: Measured): { axes: AxisScore[]; findings: Finding[] } {
  const tools = [...measured.tools].sort((a, b) => byText(a.tool, b.tool));
  const rated = new Map<RuleId, Rated>(RULES.map((spec) => [spec.id, isMerged(spec.id) ? rateMerged(spec, measured.merged[spec.id]) : rateTools(spec, spec.id as ToolRuleId, tools)]));
  const scores = new Map<Axis, number | null>(AXES.map((axis) => [axis, axisScore(RULES.filter((spec) => spec.axis === axis).map((spec) => ({ weight: spec.weight, score: rated.get(spec.id)!.score })))]));

  const findings = RULES.map((spec): Finding => {
    const rule = rated.get(spec.id)!;
    const candidates = rule.tools.flatMap((tool) => tool.candidates);
    const category = categoryOf(spec, rule, candidates);
    // 그 규칙만 만점으로 바꿔 기준 점수를 다시 계산하고(반올림까지) 지금 기준 점수를 뺀다. 화면에 보이는 점수의 차이와 늘 맞는다
    const raised = RULES.filter((other) => other.axis === spec.axis).map((other) => ({ weight: other.weight, score: other.id === spec.id ? 1 : rated.get(other.id)!.score }));
    const gain = rule.score !== null && settleScore(rule.score) < 1 ? axisScore(raised)! - scores.get(spec.axis)! : null;
    return { ruleId: spec.id, axis: spec.axis, kind: spec.kind, weight: spec.weight, status: rule.status, reason: rule.reason, value: rule.value, score: rule.score, category, severity: severityOf(category, rule.score, spec.weight), gain, evidence: rule.evidence, tools: rule.tools, candidates };
  });

  const axes = AXES.map((axis): AxisScore => {
    const own = findings.filter((finding) => finding.axis === axis);
    return { axis, score: scores.get(axis)!, strengths: own.filter((finding) => finding.category === "strength").length, repairs: own.filter((finding) => finding.category === "repair").length };
  });
  const order = new Map<RuleId, number>(RULES.map((spec, index) => [spec.id, index]));
  return { axes, findings: findings.sort((a, b) => compareFindings(a, b, order)) };
}

/** 점수 구간의 사람 요청이 이만큼에 못 미치거나 사용한 날이 이만큼에 못 미치면 AQ와 등급을 내지 않는다(설계 11.4의 7) */
export const MIN_REQUESTS_FOR_AQ = 20;
export const MIN_DAYS_FOR_AQ = 3;

/** AQ를 내지 않은 까닭. 기록이 적거나(사람 요청, 사용한 날) 잰 기준이 하나도 없다 */
export type Withheld = "too_few_requests" | "too_few_days" | "no_axes";

export interface Overall {
  aq: number | null;
  grade: Grade | null;
  tier: 1 | 2 | 3 | 4 | 5 | null;
  withheld: Withheld[];
  /** 못 재서 AQ에서 빠진 기준 */
  missingAxes: Axis[];
}

/** 화면에 보이는 기준 점수(정수)의 평균을 정수로 반올림한다. 사용자가 화면의 숫자로 검산할 수 있다. */
export function overall(axes: readonly AxisScore[], humanRequests: number, activeDays: number): Overall {
  const measured = axes.flatMap((axis) => (axis.score === null ? [] : [axis.score]));
  const missingAxes = axes.filter((axis) => axis.score === null).map((axis) => axis.axis);
  const withheld: Withheld[] = [];
  if (humanRequests < MIN_REQUESTS_FOR_AQ) withheld.push("too_few_requests");
  if (activeDays < MIN_DAYS_FOR_AQ) withheld.push("too_few_days");
  if (measured.length === 0) withheld.push("no_axes");
  if (withheld.length > 0) return { aq: null, grade: null, tier: null, withheld, missingAxes };
  const aq = roundHalfUp(measured.reduce((sum, score) => sum + score, 0) / measured.length);
  return { aq, ...gradeOf(aq), withheld, missingAxes };
}
