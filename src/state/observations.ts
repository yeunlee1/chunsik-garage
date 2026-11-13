// 설치마다의 관측 기록을 점검마다 고친다(순수 함수, 설계 18.1). 이름이 아니라 설치의 정체를 따라간다
import type { LocalDate } from "../adapters/common/dates.ts";
import type { InstallRecord } from "./state.ts";

/** 설치의 정체를 한 줄의 열쇠로 만든다. 같은 부분들이면 늘 같은 열쇠다. */
export function installKey(parts: readonly string[]): string {
  return JSON.stringify(parts);
}

/**
 * 이번 점검에서 본 설치들로 관측 기록을 고친다.
 * - 지난 기록에 같은 열쇠가 있으면 그대로 둔다(계속 봐 온 첫날이 남는다).
 * - 없으면 오늘 날짜로 새로 적는다. 첫 점검(previous가 null)이면 "새로 나타남"이 아니고, 그 뒤에는 "새로 나타남"이다.
 * - 이번에 보이지 않은 설치의 기록은 지운다. 다시 나타나면 새로 적는다(옛 날짜를 이어 붙이지 않는다).
 * - 다만 그 설치가 든 곳을 이번 점검이 읽지 못했으면(keepUnseen이 참) 기록을 고치지 않는다. 지우지도 새로 적지도 않고,
 *   첫날과 "새로 나타남" 표시가 그대로 남는다. 그 곳이 다시 읽히는 점검에서 위 규칙으로 견준다. 읽지 못한 점검 한 번이
 *   깔린 채로 있는 설치의 관측 기간을 지우지 않게 하려는 것이다.
 * 정의를 읽지 못해 정체를 만들 수 없는 서버는 부르는 쪽이 넣지 않는다. 결과는 열쇠 차례다.
 */
export function updateInstalls(
  previous: readonly InstallRecord[] | null,
  currentKeys: readonly string[],
  today: LocalDate,
  keepUnseen: (key: string) => boolean = () => false,
): InstallRecord[] {
  const before = new Map((previous ?? []).map((record) => [record.key, record]));
  const firstCheckup = previous === null;
  const current = new Set(currentKeys);
  const records: InstallRecord[] = [...current].map((key) => before.get(key) ?? { key, firstSeen: today, appeared: !firstCheckup });
  for (const record of previous ?? []) {
    if (!current.has(record.key) && keepUnseen(record.key)) records.push(record);
  }
  return records.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
