// "14일 넘게 전"과 "30일 넘게 전"의 경계. 평가 시계의 현지 날짜로 세고 시각은 날짜로 바꿔 견준다(순수 함수, 설계 11.3 「날짜의 경계」, 「30일의 경계」)
import { localDateOf, type LocalDate } from "../../adapters/common/dates.ts";

/** 지금 설치가 이만큼 넘게 전부터 있어야 "안 쓴 것이 확인됨"이 될 수 있다(설계 11.3 E5의 ④) */
export const ESTABLISHED_DAYS = 14;
/** 도구의 집계에 적힌 마지막 사용이 이만큼 넘게 전이어야 "안 쓴 것이 확인됨"이 될 수 있다(설계 11.3 E5의 ②) */
export const RECENT_USE_DAYS = 30;

/** 평가 시계의 오늘과 시간대 */
export interface EvalDay {
  today: LocalDate;
  timeZone: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const epochDay = (date: LocalDate): number => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/** 오늘을 0일로 세어 그 날이 며칠 앞선 날인지. 오늘보다 뒤의 날은 음수다. */
export function daysBefore(today: LocalDate, date: LocalDate): number {
  return epochDay(today) - epochDay(date);
}

/** "days일 넘게 전"이다. 오늘보다 days+1일 이상 앞선 날이다. 오늘과 그 앞 days일, 오늘보다 뒤의 날은 "days일 안"이다. */
export function olderThan(today: LocalDate, date: LocalDate, days: number): boolean {
  return daysBefore(today, date) > days;
}

/** 시각(epoch 밀리초)을 평가 시계의 시간대로 날짜로 바꿔 견준다. 같은 날 안의 시각 차이는 결과를 바꾸지 않는다. */
export function msOlderThan(day: EvalDay, epochMs: number, days: number): boolean {
  return olderThan(day.today, localDateOf(epochMs, day.timeZone), days);
}
