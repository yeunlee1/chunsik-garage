// 규칙 표. 규칙 스물둘의 기준, 값의 종류, 0점 기준과 만점 기준, 무게, 계산 단위를 자료로 둔다(설계 11.1, 11.3). 기준값을 고치면 규칙 버전을 올린다
export const RULES_VERSION = "1.0.0";

export type Axis = "setup" | "efficiency" | "fit" | "intensity";
/** 잰 값의 종류. share는 몫(0에서 1), rate는 횟수(1을 넘을 수 있다), count는 개수, amount는 어림한 양이다 */
export type ValueKind = "share" | "rate" | "count" | "amount";
export type RuleId =
  | "S1" | "S2" | "S3" | "S4" | "S5"
  | "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7"
  | "F1" | "F2" | "F3" | "F4" | "F5" | "F6"
  | "I1" | "I2" | "I3" | "I4";

export interface RuleSpec {
  id: RuleId;
  axis: Axis;
  kind: ValueKind;
  /** 잰 값이 이 값이면(또는 이 값보다 나쁘면) 규칙 점수가 0이다 */
  zeroAt: number;
  /** 잰 값이 이 값이면(또는 이 값보다 좋으면) 규칙 점수가 1이다 */
  fullAt: number;
  weight: number;
  /** merged는 점수에 넣는 도구를 모두 합쳐 한 번 계산하고, perTool은 도구마다 계산해 응답 수를 무게로 평균한다 */
  unit: "merged" | "perTool";
  /** 정비 후보를 낼 수 있는 규칙이다 */
  tunable: boolean;
}

const rule = (id: RuleId, axis: Axis, kind: ValueKind, zeroAt: number, fullAt: number, weight: number, unit: RuleSpec["unit"], tunable = false): RuleSpec => ({ id, axis, kind, zeroAt, fullAt, weight, unit, tunable });

/** 표의 차례가 화면에 내는 차례의 마지막 기준이다(설계 11.5 「차례」) */
export const RULES: readonly RuleSpec[] = [
  rule("S1", "setup", "share", 0, 1, 3, "merged"),
  rule("S2", "setup", "share", 0, 1, 3, "merged"),
  rule("S3", "setup", "count", 3, 0, 2, "merged"),
  rule("S4", "setup", "share", 0.1, 0.01, 2, "perTool"),
  rule("S5", "setup", "share", 0.3, 0.02, 2, "perTool"),
  rule("E1", "efficiency", "share", 0.5, 0.9, 3, "perTool"),
  rule("E2", "efficiency", "share", 0.12, 0.02, 3, "perTool"),
  rule("E3", "efficiency", "rate", 3, 0.2, 3, "perTool"),
  rule("E4", "efficiency", "amount", 16000, 4000, 2, "perTool"),
  rule("E5", "efficiency", "share", 0.8, 0.2, 2, "perTool", true),
  rule("E6", "efficiency", "share", 0.7, 0.1, 2, "perTool", true),
  rule("E7", "efficiency", "rate", 0.15, 0.02, 1, "perTool"),
  rule("F1", "fit", "share", 0.95, 0.6, 1, "perTool"),
  rule("F2", "fit", "share", 0.1, 0.6, 1, "perTool"),
  rule("F3", "fit", "share", 0.2, 0.8, 3, "merged"),
  rule("F4", "fit", "share", 0.25, 0.02, 2, "merged"),
  rule("F5", "fit", "rate", 0.4, 0, 2, "perTool"),
  rule("F6", "fit", "count", 3, 0, 2, "merged"),
  rule("I1", "intensity", "count", 2, 20, 3, "merged"),
  rule("I2", "intensity", "rate", 3, 40, 3, "merged"),
  rule("I3", "intensity", "rate", 1, 8, 2, "merged"),
  rule("I4", "intensity", "count", 1, 4, 1, "merged"),
];

export function ruleSpec(id: RuleId): RuleSpec {
  const found = RULES.find((spec) => spec.id === id);
  if (found === undefined) throw new Error(`unknown rule: ${id}`);
  return found;
}
