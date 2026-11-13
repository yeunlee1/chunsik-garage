// 평가 결과의 도구 목록을 만든다. 찾았는지, 점수와 달력에 넣는지, 기록 형식, 점수 구간의 세션·요청·응답 수, 볼 수 있는 날짜 범위다(순수 함수, 설계 9.8, 12.2)
import type { LocalDate } from "../../adapters/common/dates.ts";
import type { Observation } from "../../adapters/claude/observation.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { ClaudeReadStats } from "../../collect/claude.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";

/** 수집이 도구마다 낸 것 가운데 평가 결과에 싣는 것. 캐시를 쓴 파일 수처럼 실행마다 다른 것은 넣지 않는다(설계 12.2, 12.3) */
export interface CollectedTool {
  tool: ToolId;
  /** 기록 폴더를 찾았다 */
  detected: boolean;
  /** 그 도구에 실제로 남아 있는 가장 오래된 기록의 날짜. 기록이 없으면 null(설계 9.8 「달력의 날짜 범위」) */
  visibleFrom: LocalDate | null;
  /** 처음 나온 응답 ID가 다른 세션과 겹치는 세션의 수(설계 9.5 「다른 파일에 복사된 응답」) */
  overlappingSessions: number;
  read: Omit<ClaudeReadStats, "fromCache">;
  /** 스킬 사용과 MCP 호출의 관측이 빠짐없는지와 까닭(설계 9.8) */
  observation: { skills: Observation; mcp: Observation };
}

export interface ResultTool {
  tool: ToolId;
  detected: boolean;
  /** 점수에 넣는 도구다(점수 구간에 응답이 있다) */
  scored: boolean;
  /** 달력에 넣는 도구다(수집 구간에 응답이 있다) */
  inCalendar: boolean;
  /** 기록 형식. 두 형식이 섞였으면 둘 다다 */
  formats: string[];
  /** 점수 구간에 응답이 있는 주 세션과 하위 세션의 수 */
  mainSessions: number;
  subSessions: number;
  /** 점수 구간의 사람 요청(주 세션만)과 응답(주 세션과 하위 세션) */
  humanRequests: number;
  responses: number;
  /** 볼 수 있는 날짜 범위. 기록이 없으면 null */
  visible: { from: LocalDate; to: LocalDate } | null;
}

/** 도구마다의 기록 형식. Claude Code는 한 형식이다 */
const FORMATS: Record<ToolId, readonly string[]> = { "claude-code": ["claude-code-jsonl"] };

const inRange = (date: string, range: { from: LocalDate; to: LocalDate }): boolean => date >= range.from && date <= range.to;

export function resultTools(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): ResultTool[] {
  return evaluation.tools.map((tool): ResultTool => {
    const found = collected.find((item) => item.tool === tool.tool) ?? null;
    const summaries = input.tools.find((item) => item.tool === tool.tool)?.summaries ?? [];
    const subSessions = summaries.filter((summary) => summary.kind === "sub" && Object.entries(summary.days).some(([date, day]) => inRange(date, evaluation.windows.score) && day.responses > 0)).length;
    const visibleFrom = found?.visibleFrom ?? null;
    return {
      tool: tool.tool,
      detected: found?.detected ?? false,
      scored: tool.scored,
      inCalendar: tool.inCalendar,
      formats: [...FORMATS[tool.tool]],
      mainSessions: tool.totals.mainSessions.length,
      subSessions,
      humanRequests: tool.totals.humanRequests,
      responses: tool.totals.responses,
      visible: visibleFrom === null ? null : { from: visibleFrom, to: evaluation.windows.today },
    };
  });
}
