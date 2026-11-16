// 규칙 하나를 도구 하나에서(합침 규칙이면 전체에서) 잰 결과의 모양(순수, 설계 11.4, 12.2)
import type { Reason } from "./reasons.ts";

/** 근거 숫자. 센 것만 숫자이고 세지 못한 것은 null이다. 0으로 바꾸지 않는다(설계 12.2) */
export type Evidence = Record<string, number | null>;

export type Measurement = { status: "scored"; value: number; evidence: Evidence } | { status: "unmeasured"; reason: Reason; evidence: Evidence };

export const scored = (value: number, evidence: Evidence): Measurement => ({ status: "scored", value, evidence });
export const unmeasured = (reason: Reason, evidence: Evidence): Measurement => ({ status: "unmeasured", reason, evidence });

/** 근거 숫자를 모두 비운다. 그 도구가 그 사건을 기록하지 않아 세지 못한 때에 쓴다. */
export const blank = (evidence: Evidence): Evidence => Object.fromEntries(Object.keys(evidence).map((key) => [key, null]));

/**
 * 기록의 개수로 정하는 조건을 차례대로 본다. 그 도구가 그 사건을 못 보면 unsupported(근거 숫자는 비운다),
 * 분모가 0이면 no_data, 0은 아닌데 최소 개수에 못 미치면 too_little이다(설계 11.4 「규칙마다의 이유」). 잴 수 있으면 null이다.
 */
export function countGate(sees: boolean, denominator: number, minimum: number, evidence: Evidence): Measurement | null {
  if (!sees) return unmeasured("unsupported", blank(evidence));
  if (denominator <= 0) return unmeasured("no_data", evidence);
  if (denominator < minimum) return unmeasured("too_little", evidence);
  return null;
}
