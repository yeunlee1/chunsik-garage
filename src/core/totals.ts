// 도구 하나의 날짜별 세션 요약을 점수 구간으로 잘라 더한다(순수 함수, 설계 9.2, 9.3). 어느 숫자에 주 세션만 넣고 어느 숫자에 하위 세션을 합치는지는 9.2절의 표를 따른다
import type { LocalDate, Windows } from "../adapters/common/dates.ts";
import type { SessionSummary, TokenCounts, ToolCoverage, ToolId } from "../adapters/types.ts";
import { byContent } from "./order.ts";

/** 점수 구간에 응답이 있는 주 세션 하나의 숫자. 세션을 단위로 따지는 규칙(E3, E4, S5, F2)과 프로젝트를 세는 규칙(F3, I4)이 쓴다 */
export interface MainSessionTotals {
  sessionId: string;
  /** 세션의 작업 폴더(기록에 처음 적힌 것). 없으면 null */
  cwd: string | null;
  autoCompactions: number;
  subagentCalls: number;
  /** 점수 구간에 연결 실패가 있었던 날이 하루라도 있다 */
  mcpConnectionFailure: boolean;
  /** 세션에서 처음 실린 지침의 어림 토큰. 지침 첨부가 남지 않았거나 글자가 없으면 null(E4의 표본이 아니다) */
  instructionTokens: number | null;
}

export interface ToolTotals {
  /** 점수 구간의 응답 수. 0이면 점수에 넣는 도구가 아니다(설계 9.3) */
  responses: number;
  /** 수집 구간의 응답 수. 0보다 크면 달력에 넣는 도구다 */
  collectResponses: number;
  tokens: TokenCounts;
  /** 사람 요청. 주 세션만 센다 */
  humanRequests: number;
  /** 모든 종류의 도구 호출. 셸 명령을 넣는다(I3) */
  toolCalls: number;
  /** 셸 명령을 뺀 도구 결과와 그 가운데 오류. 거절되거나 끊겨서 끝난 것은 처음부터 결과에 들지 않는다(E2) */
  nonShellResults: number;
  nonShellErrors: number;
  /** 거절한 도구 실행. 사람이 거절한 것, 훅이 막은 것, 권한 검사가 막은 것을 더한다(E7) */
  denied: number;
  interruptedTurns: number;
  lengthStops: number;
  /** 추론 강도별 응답 수(이름 차례) */
  efforts: Record<string, number>;
  unknownEffort: number;
  hookRuns: number;
  hookFailures: number;
  /** 일부러 막은 것인지 실패해서 막힌 것인지 가릴 수 없는 막음. 실행에도 실패에도 넣지 않았다(S4) */
  hookUnclassified: number;
  /** 점수 구간에서 응답이 있었던 날(오래된 날부터) */
  activeDates: LocalDate[];
  /** 점수 구간에 응답이 있는 주 세션(세션 ID 차례) */
  mainSessions: MainSessionTotals[];
}

/** 도구 하나의 구간 합계와 그 도구의 관측 범위. 도구를 합쳐서 재는 규칙이 도구들을 이 모양으로 받는다 */
export interface ToolUsage {
  tool: ToolId;
  totals: ToolTotals;
  coverage: ToolCoverage;
}

/** ASCII 글자는 4글자를 1토큰으로, 그 밖의 글자는 1글자를 1토큰으로 어림한다. 글자가 없으면 표본이 아니라서 null이다(설계 11.3 E4). */
export function instructionTokens(chars: { ascii: number; other: number } | null): number | null {
  if (chars === null || chars.ascii + chars.other <= 0) return null;
  return chars.ascii / 4 + chars.other;
}

export function toolTotals(summaries: readonly SessionSummary[], windows: Windows, shellTools: readonly string[]): ToolTotals {
  const score = new Set(windows.scoreDates);
  const collect = new Set(windows.collectDates);
  const shell = new Set(shellTools);
  const totals: ToolTotals = {
    responses: 0,
    collectResponses: 0,
    tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 },
    humanRequests: 0,
    toolCalls: 0,
    nonShellResults: 0,
    nonShellErrors: 0,
    denied: 0,
    interruptedTurns: 0,
    lengthStops: 0,
    efforts: {},
    unknownEffort: 0,
    hookRuns: 0,
    hookFailures: 0,
    hookUnclassified: 0,
    activeDates: [],
    mainSessions: [],
  };
  const efforts = new Map<string, number>();
  const active = new Set<LocalDate>();

  for (const summary of summaries) {
    const session: MainSessionTotals = {
      sessionId: summary.sessionId,
      cwd: summary.cwd,
      autoCompactions: 0,
      subagentCalls: 0,
      mcpConnectionFailure: false,
      instructionTokens: instructionTokens(summary.instructionChars),
    };
    let sessionResponses = 0;
    for (const [date, cell] of Object.entries(summary.days)) {
      if (collect.has(date)) totals.collectResponses += cell.responses;
      if (!score.has(date)) continue;
      totals.responses += cell.responses;
      sessionResponses += cell.responses;
      if (cell.responses > 0) active.add(date);
      totals.tokens.input += cell.tokens.input;
      totals.tokens.cacheRead += cell.tokens.cacheRead;
      totals.tokens.cacheWrite += cell.tokens.cacheWrite;
      totals.tokens.output += cell.tokens.output;
      totals.tokens.thinking += cell.tokens.thinking;
      if (summary.kind === "main") totals.humanRequests += cell.humanRequests;
      for (const [name, counts] of Object.entries(cell.tools)) {
        totals.toolCalls += counts.calls;
        totals.denied += counts.deniedByUser + counts.deniedByHook + counts.deniedByPermission;
        if (shell.has(name)) continue;
        totals.nonShellResults += counts.results;
        totals.nonShellErrors += counts.errors;
      }
      totals.interruptedTurns += cell.interruptedTurns;
      totals.lengthStops += cell.lengthStops;
      for (const [name, count] of Object.entries(cell.efforts)) efforts.set(name, (efforts.get(name) ?? 0) + count);
      totals.unknownEffort += cell.unknownEffort;
      for (const counts of Object.values(cell.hooks)) {
        totals.hookRuns += counts.runs;
        totals.hookFailures += counts.failures;
        totals.hookUnclassified += counts.unclassifiedBlocks;
      }
      session.autoCompactions += cell.autoCompactions;
      session.subagentCalls += cell.subagentCalls;
      if (cell.mcpConnectionFailure) session.mcpConnectionFailure = true;
    }
    if (summary.kind === "main" && sessionResponses > 0) totals.mainSessions.push(session);
  }

  for (const name of [...efforts.keys()].sort()) totals.efforts[name] = efforts.get(name)!;
  totals.activeDates = [...active].sort();
  // 세션 ID가 같은 요약이 둘 올 수 있다(같은 ID의 기록 파일이 두 폴더에 있을 때). 그때도 차례가 넣은 차례에 기대지 않게 내용까지 견준다
  totals.mainSessions.sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0) || byContent(a, b));
  return totals;
}
