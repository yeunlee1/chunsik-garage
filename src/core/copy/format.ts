// 문장에 끼우는 숫자의 서식과 문구 틀의 자리 채우기. 실행 환경의 로캘에 기대지 않아 같은 입력이면 늘 같은 글이다(순수 함수, 설계 11.4의 반올림, 12.2)
import type { ValueKind } from "../rules.ts";
import { roundHalfUp } from "../score.ts";

/** 세지 못한 근거 숫자의 자리에 넣는 글 */
export const UNCOUNTED = "—";

/** 0 이상의 정수를 세 자리마다 쉼표로 끊는다 */
export function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 소수 한 자리까지 적고 끝의 .0은 뗀다. 반올림은 설계 11.4의 절차다 */
export function oneDecimal(value: number): string {
  const tenths = roundHalfUp(value * 10);
  const whole = groupDigits(Math.floor(tenths / 10));
  const rest = tenths % 10;
  return rest === 0 ? whole : `${whole}.${rest}`;
}

/** 잰 값을 종류에 맞춰 적는다. 몫은 백분율(소수 한 자리), 횟수는 소수 한 자리, 개수와 양은 정수다 */
export function formatValue(kind: ValueKind, value: number): string {
  if (kind === "share") return oneDecimal(value * 100);
  if (kind === "rate") return oneDecimal(value);
  return groupDigits(roundHalfUp(value));
}

const SLOT = /\{([A-Za-z]+)(?::([^|{}]*)\|([^|{}]*))?\}/g;

/** 문구 틀에 든 자리의 이름. 처음 나온 차례로 한 번씩이다 */
export function slots(template: string): string[] {
  return [...new Set([...template.matchAll(SLOT)].map((match) => match[1]!))];
}

/**
 * 문구 틀의 {이름}을 값으로 바꾼다. 숫자는 세 자리마다 끊고, null(세지 못함)은 줄표다.
 * {이름:하나|여럿}은 값이 1이면 앞의 것, 아니면 뒤의 것이다(영어의 단수와 복수). 틀에 있는데 값에 없는 자리는 오류다
 */
export function fill(template: string, values: Readonly<Record<string, string | number | null>>): string {
  return template.replace(SLOT, (_match, name: string, one: string | undefined, other: string | undefined) => {
    if (!(name in values)) throw new Error(`no value for {${name}} in "${template}"`);
    const value = values[name]!;
    if (one !== undefined && other !== undefined) return value === 1 ? one : other;
    if (value === null) return UNCOUNTED;
    return typeof value === "number" ? groupDigits(value) : value;
  });
}
