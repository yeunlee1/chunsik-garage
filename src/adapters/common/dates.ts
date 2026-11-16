// 시각을 평가 시간대의 현지 날짜로 바꾸고, 점수 구간(30개 날짜)과 수집 구간(35개 날짜)을 만든다(순수 함수, 설계 9.3)
export type LocalDate = string;

export const SCORE_WINDOW_DAYS = 30;
export const COLLECT_WINDOW_DAYS = 35;

const QUARTER_MS = 15 * 60 * 1000;
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;
const formatters = new Map<string, Intl.DateTimeFormat>();
const quarterDates = new Map<string, LocalDate>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** epoch 밀리초를 그 시간대의 YYYY-MM-DD로 바꾼다. 실제 시간대의 차이는 모두 15분의 배수라서 15분 칸마다 한 번만 계산한다. */
export function localDateOf(epochMs: number, timeZone: string): LocalDate {
  const quarter = Math.floor(epochMs / QUARTER_MS);
  const key = `${timeZone}|${quarter}`;
  const cached = quarterDates.get(key);
  if (cached !== undefined) return cached;
  const parts = formatterFor(timeZone).formatToParts(new Date(quarter * QUARTER_MS));
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  quarterDates.set(key, date);
  return date;
}

/** ISO 시각 문자열을 현지 날짜로 바꾼다. 읽지 못하면 null이다. */
export function localDateOfIso(iso: unknown, timeZone: string): LocalDate | null {
  if (typeof iso !== "string") return null;
  const epochMs = Date.parse(iso);
  return Number.isFinite(epochMs) ? localDateOf(epochMs, timeZone) : null;
}

function shiftDate(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface Windows {
  today: LocalDate;
  /** 오래된 날짜부터. 마지막이 오늘이다. */
  scoreDates: LocalDate[];
  /** 오래된 날짜부터. 마지막이 오늘이다. */
  collectDates: LocalDate[];
  /** 수집 구간 첫날이 시작하는 순간보다 늦지 않은 epoch 밀리초. 파일 수정 시각으로 거를 때 쓰고, 넉넉하게 14시간 앞으로 잡는다. */
  collectStartLowerBoundMs: number;
}

export function makeWindows(nowMs: number, timeZone: string): Windows {
  const today = localDateOf(nowMs, timeZone);
  const span = (count: number): LocalDate[] => Array.from({ length: count }, (_, i) => shiftDate(today, i - (count - 1)));
  const collectDates = span(COLLECT_WINDOW_DAYS);
  const [y, m, d] = collectDates[0]!.split("-").map(Number) as [number, number, number];
  return {
    today,
    scoreDates: span(SCORE_WINDOW_DAYS),
    collectDates,
    collectStartLowerBoundMs: Date.UTC(y, m - 1, d) - MAX_UTC_OFFSET_MS,
  };
}
