// 잰 값을 규칙 점수로 바꾸고, 점수를 반올림하고, AQ를 등급으로 바꾼다(순수 함수, 설계 11.3, 11.4, 11.6)

/**
 * 규칙 점수를 경계(0.8, 0.6, 0.3, 1)와 견줄 때 쓰는 값. 소수 열두째 자리에서 맞춘다.
 * 나눗셈과 덧셈의 끝자리 오차(0.7999999999999998 같은 것)가 경계의 어느 쪽인지를 바꾸지 않게 하려는 것이다.
 * **견줄 때에만 쓴다.** 점수 자체와 그것으로 내는 기준 점수, 예상 효과는 맞추지 않은 값으로 계산한다.
 * 맞춘 값을 다음 계산에 넣으면 어느 자리에서 맞추든 깎인 만큼의 차이가 다음 반올림의 경계를 넘길 수 있다(과제 18의 시험에 반례가 둘 있다).
 */
export function settleScore(value: number): number {
  return Math.round(value * 1e12) / 1e12;
}

/** 잰 값이 0점 기준과 만점 기준 사이에 있으면 직선으로 잇고, 바깥이면 0이나 1이다. 낮을수록 좋은 규칙은 0점 기준이 더 큰 값이다. 맞추지 않는다. */
export function ruleScore(value: number, zeroAt: number, fullAt: number): number {
  const position = (value - zeroAt) / (fullAt - zeroAt);
  return position <= 0 ? 0 : position >= 1 ? 1 : position;
}

/** 소수 아홉째 자리에서 한 번 맞춘 뒤 0.5는 올린다. 실행 환경에 따라 끝자리가 달라지지 않게 하려는 것이다(설계 11.4의 5). */
export function roundHalfUp(value: number): number {
  return Math.floor(Math.round(value * 1e9) / 1e9 + 0.5);
}

export type Grade = "S" | "A" | "B" | "C" | "D";

/** S는 90 이상, A는 80~89, B는 65~79, C는 50~64, D는 49 이하다. tier는 장면의 단계(5가 S)다(설계 11.6). */
export function gradeOf(aq: number): { grade: Grade; tier: 1 | 2 | 3 | 4 | 5 } {
  if (aq >= 90) return { grade: "S", tier: 5 };
  if (aq >= 80) return { grade: "A", tier: 4 };
  if (aq >= 65) return { grade: "B", tier: 3 };
  if (aq >= 50) return { grade: "C", tier: 2 };
  return { grade: "D", tier: 1 };
}
