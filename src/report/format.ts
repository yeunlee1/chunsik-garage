// 결과 화면의 숫자 서식. 출력 토큰의 줄임과 백분율이다. 실행 환경의 로캘에 기대지 않고 core의 반올림과 자리 끊기를 쓴다(순수 함수, 설계 11.4, 13.1)
import { groupDigits, oneDecimal } from "../core/copy/format.ts";
import type { Lang } from "../core/copy/lang.ts";
import { roundHalfUp } from "../core/score.ts";

/** 몫(0~1)을 소수 한 자리 백분율로 적는다 */
export function percent(share: number): string {
  return `${oneDecimal(share * 100)}%`;
}

/**
 * 출력 토큰을 줄여 적는다. 한국어는 만 단위로 반올림한 뒤 1만 만이 차면 억으로 올린다(1억 10,000만으로 쓰지 않는다).
 * 영어는 원래 값이 속한 단위(K·M·B)를 먼저 고르고 소수 한 자리로 반올림하며, 반올림한 값이 1,000이 될 때만 한 단계 올린다(950,000은 950K, 999,950은 1M).
 * 표에는 줄이지 않은 정수를 쓴다
 */
export function shortTokens(value: number, lang: Lang): string {
  if (lang === "ko") {
    if (value < 1e4) return groupDigits(value);
    const man = roundHalfUp(value / 1e4);
    if (man < 1e4) return `${groupDigits(man)}만`;
    const eok = Math.floor(man / 1e4);
    const rest = man % 1e4;
    return `${groupDigits(eok)}억${rest ? ` ${groupDigits(rest)}만` : ""}`;
  }
  if (value < 1e3) return groupDigits(value);
  const units: [number, string][] = [
    [1e3, "K"],
    [1e6, "M"],
    [1e9, "B"],
  ];
  let index = value >= 1e9 ? 2 : value >= 1e6 ? 1 : 0;
  let tenths = roundHalfUp((value / units[index]![0]) * 10);
  if (tenths >= 10_000 && index < units.length - 1) {
    index += 1;
    tenths = roundHalfUp((value / units[index]![0]) * 10);
  }
  return `${groupDigits(Math.floor(tenths / 10))}${tenths % 10 ? `.${tenths % 10}` : ""}${units[index]![1]}`;
}
