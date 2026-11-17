// 문장에 끼우는 숫자의 서식과 문구 틀의 자리 채우기. 실행 환경의 로캘에 기대지 않아 같은 입력이면 늘 같은 글이다(순수 함수, 설계 11.4의 반올림, 12.2)
import type { RuleSpec, ValueKind } from "../rules.ts";
import { roundHalfUp } from "../score.ts";

/** 세지 못한 근거 숫자의 자리에 넣는 글 */
export const UNCOUNTED = "—";

/** 0 이상의 정수를 세 자리마다 쉼표로 끊는다 */
export function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 소수 places 자리까지 적고 끝의 0은 뗀다. 반올림은 설계 11.4의 절차다 */
export function decimalText(value: number, places: number): string {
  const scale = 10 ** places;
  const scaled = roundHalfUp(value * scale);
  const whole = groupDigits(Math.floor(scaled / scale));
  const rest = places === 0 ? "" : String(scaled % scale).padStart(places, "0").replace(/0+$/, "");
  return rest === "" ? whole : `${whole}.${rest}`;
}

/** 소수 한 자리까지 적고 끝의 .0은 뗀다 */
export function oneDecimal(value: number): string {
  return decimalText(value, 1);
}

/** 값을 반올림 없이 적는 데 드는 소수 자리(여섯 자리까지) */
function placesOf(value: number): number {
  for (let places = 0; places < 6; places++) {
    const scaled = value * 10 ** places;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return places;
  }
  return 6;
}

/** 규칙의 값을 적는 소수 자리. 한 자리를 기본으로, 0점·만점 기준을 반올림 없이 적는 데 드는 만큼 늘린다(지금은 E7만 두 자리다, 0.3.0 짝 3차 필수 3번) */
export function rulePlaces(spec: Pick<RuleSpec, "kind" | "zeroAt" | "fullAt">): number {
  const scale = spec.kind === "share" ? 100 : 1;
  return Math.max(1, placesOf(spec.zeroAt * scale), placesOf(spec.fullAt * scale));
}

/** 잰 값을 종류에 맞춰 적는다. 몫은 백분율, 횟수는 소수 places 자리(기본 한 자리)이고, 개수와 양은 정수다 */
export function formatValue(kind: ValueKind, value: number, places = 1): string {
  if (kind === "share") return decimalText(value * 100, places);
  if (kind === "rate") return decimalText(value, places);
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
