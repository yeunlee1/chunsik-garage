// 세션 요약에서 사용 신호가 있었던 이름을 구간별로 모은다. 스킬은 신호 1~4, MCP 서버는 호출과 귀속이다. 주 세션과 하위 세션을 합친다(순수 함수, 설계 9.2, 9.5, 11.3 E5·E6)
import type { Windows } from "../../adapters/common/dates.ts";
import type { DayCell, SessionSummary } from "../../adapters/types.ts";

/** 사용 신호가 있었던 기록의 이름. inScore는 점수 구간, inCollect는 수집 구간이다(점수 구간은 수집 구간에 든다) */
export interface UsedNames {
  inScore: ReadonlySet<string>;
  inCollect: ReadonlySet<string>;
}

function collectNames(summaries: readonly SessionSummary[], windows: Windows, namesOf: (cell: DayCell) => string[]): UsedNames {
  const score = new Set(windows.scoreDates);
  const collect = new Set(windows.collectDates);
  const inScore = new Set<string>();
  const inCollect = new Set<string>();
  for (const summary of summaries) {
    for (const [date, cell] of Object.entries(summary.days)) {
      if (!collect.has(date)) continue;
      for (const name of namesOf(cell)) {
        inCollect.add(name);
        if (score.has(date)) inScore.add(name);
      }
    }
  }
  return { inScore, inCollect };
}

const positive = (record: Record<string, number>): string[] => Object.keys(record).filter((name) => record[name]! > 0);

/** 스킬 도구 호출, 스킬 귀속, 사람이 친 슬래시 명령, 스킬 주입 가운데 하나라도 있었던 스킬의 이름 */
export function usedSkillNames(summaries: readonly SessionSummary[], windows: Windows): UsedNames {
  return collectNames(summaries, windows, (cell) =>
    Object.keys(cell.skillSignals).filter((name) => {
      const counts = cell.skillSignals[name]!;
      return counts.tool + counts.attribution + counts.slash + counts.injected > 0;
    }),
  );
}

/** 호출한 도구 이름의 서버 자리나 응답의 귀속에 있었던 서버의 이름. 두 곳의 꼴은 다를 수 있고 설치의 이름 꼴이 둘을 다 담는다 */
export function calledMcpNames(summaries: readonly SessionSummary[], windows: Windows): UsedNames {
  return collectNames(summaries, windows, (cell) => [...positive(cell.mcpCalls), ...positive(cell.mcpAttributions)]);
}

/** 기록의 이름이 설치의 이름 꼴 가운데 하나와 글자 그대로 같으면 그 설치의 것이다(설계 10 「설치와 기록의 이름을 잇는 법」) */
export function anyIn(recordNames: readonly string[], names: ReadonlySet<string>): boolean {
  return recordNames.some((name) => names.has(name));
}
