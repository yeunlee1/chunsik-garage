// 평가 결과의 사용 기록을 만든다. 점수 구간의 주 세션·사용한 날·출력 토큰·캐시 적중·셸 명령 몫, 수집 구간 35일의 달력, 도구별 나눔이다(순수 함수, 설계 9.2, 9.8, 12.2, 13.1)
import { makeWindows, type LocalDate } from "../../adapters/common/dates.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { Evaluation, EvaluationInput, ToolInput } from "../evaluate.ts";
import type { CollectedTool } from "./tools.ts";

export type CalendarState = "used" | "unused" | "unseen";

export interface CalendarCell {
  date: LocalDate;
  /** 그날의 응답 수(도구를 합치고 주 세션과 하위 세션을 합친다) */
  responses: number;
  /** used는 쓴 날, unused는 기록을 볼 수 있는데 응답이 없는 날, unseen은 기록이 남아 있는 도구 모두에서 볼 수 있는 범위 밖의 날이다 */
  state: CalendarState;
}

export interface ToolUsageShare {
  tool: ToolId;
  mainSessions: number;
  activeDays: number;
  outputTokens: number;
  cacheHit: number | null;
  shellNonZero: number | null;
}

export interface ResultUsage {
  /** 점수 구간. 점수에 넣는 도구를 합친다 */
  mainSessions: number;
  activeDays: number;
  outputTokens: number;
  /** 캐시 적중. E1의 잰 값이다(도구마다 식이 달라 토큰을 더하지 않는다). 못 쟀으면 null */
  cacheHit: number | null;
  /** 셸 명령이 0이 아닌 값으로 끝난 몫. 점수에 넣지 않고 정보로만 보인다. 셸 결과가 없거나 못 보는 형식이면 null */
  shellNonZero: number | null;
  /** 수집 구간의 날마다(오래된 날부터) */
  calendar: CalendarCell[];
  /** 점수에 넣는 도구마다(도구 식별자의 차례) */
  byTool: ToolUsageShare[];
}

const inRange = (date: string, range: { from: LocalDate; to: LocalDate }): boolean => date >= range.from && date <= range.to;

/** 점수 구간의 셸 도구 결과와 그 가운데 오류. 거절되거나 끊겨서 끝난 것은 결과에 들지 않는다(9.5) */
function shellCounts(tool: ToolInput, score: { from: LocalDate; to: LocalDate }): { results: number; errors: number } | null {
  if (tool.coverage.shellExitCodes === "unsupported") return null;
  const shell = new Set(tool.shellTools);
  let results = 0;
  let errors = 0;
  for (const summary of tool.summaries) {
    for (const [date, day] of Object.entries(summary.days)) {
      if (!inRange(date, score)) continue;
      for (const [name, counts] of Object.entries(day.tools)) {
        if (!shell.has(name)) continue;
        results += counts.results;
        errors += counts.errors;
      }
    }
  }
  return { results, errors };
}

const share = (counts: { results: number; errors: number } | null): number | null => (counts === null || counts.results === 0 ? null : counts.errors / counts.results);

export function resultUsage(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): ResultUsage {
  const score = evaluation.windows.score;
  const e1 = evaluation.findings.find((finding) => finding.ruleId === "E1") ?? null;
  const scored = evaluation.tools.filter((tool) => tool.scored);
  const inputs = new Map(input.tools.map((tool) => [tool.tool, tool]));

  const byTool = scored.map((tool): ToolUsageShare => ({
    tool: tool.tool,
    mainSessions: tool.totals.mainSessions.length,
    activeDays: tool.totals.activeDates.length,
    outputTokens: tool.totals.tokens.output,
    cacheHit: e1?.tools.find((value) => value.tool === tool.tool)?.value ?? null,
    shellNonZero: share(shellCounts(inputs.get(tool.tool)!, score)),
  }));
  const shells = scored.map((tool) => shellCounts(inputs.get(tool.tool)!, score)).filter((counts): counts is { results: number; errors: number } => counts !== null);

  // 달력: 응답 수는 모든 도구를 합치고, 볼 수 있는지는 기록이 남아 있는 도구의 가장 오래된 기록의 날짜로 가른다
  const responsesByDate = new Map<string, number>();
  for (const tool of input.tools) {
    for (const summary of tool.summaries) {
      for (const [date, day] of Object.entries(summary.days)) responsesByDate.set(date, (responsesByDate.get(date) ?? 0) + day.responses);
    }
  }
  const visibleFroms = collected.map((tool) => tool.visibleFrom).filter((date): date is LocalDate => date !== null);
  const calendar = makeWindows(input.clock.nowMs, input.clock.timeZone).collectDates.map((date): CalendarCell => {
    const responses = responsesByDate.get(date) ?? 0;
    const state: CalendarState = responses > 0 ? "used" : visibleFroms.some((from) => from <= date) ? "unused" : "unseen";
    return { date, responses, state };
  });

  return {
    mainSessions: byTool.reduce((sum, tool) => sum + tool.mainSessions, 0),
    activeDays: new Set(scored.flatMap((tool) => tool.totals.activeDates)).size,
    outputTokens: byTool.reduce((sum, tool) => sum + tool.outputTokens, 0),
    cacheHit: e1?.value ?? null,
    shellNonZero: shells.length === 0 ? null : share({ results: shells.reduce((sum, counts) => sum + counts.results, 0), errors: shells.reduce((sum, counts) => sum + counts.errors, 0) }),
    calendar,
    byTool,
  };
}
