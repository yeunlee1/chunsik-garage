// 평가 결과의 도구 목록을 만든다. 찾았는지, 점수와 달력에 넣는지, 기록 형식, 점수 구간의 세션·요청·응답 수, 볼 수 있는 날짜 범위다(순수 함수, 설계 9.8, 12.2)
import type { LocalDate } from "../../adapters/common/dates.ts";
import type { Observation } from "../../adapters/claude/observation.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { ClaudeReadStats } from "../../collect/claude.ts";
import type { WebExportState } from "../../collect/web.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";

/**
 * Codex만 내는 수집 결과. 건너뛴 압축 파일과 일부만 읽은 파일(읽은 양)과, 기록을 묶으며 센 것(알림)이다. Claude Code에는 없다
 * (설계 9.2, 9.8, 「5단계 계획 전 결정」 2·3·7번, 「5단계 4부 계획 전 결정」 2·3번)
 */
export interface CollectedCodex {
  /** 그 Node.js가 zstd를 풀지 못해 열지 않은 정본과 그 바이트. 읽지 못한 비율의 분자에 든다 */
  skippedFiles: string[];
  skippedFileBytes: number;
  /** 앞부분만 읽은 파일. 있으면 읽지 못한 비율은 아래 경계다 */
  partialFiles: string[];
  /** 정본이 아니라 읽지 않은 사본, 이름에서 식별자를 읽지 못한 파일 */
  skippedCopies: number;
  unnamedFiles: number;
  /** 부모 기록을 하나도 읽지 못한 하위 세션, 기록 파일이 둘 이상이라 합친 세션, 수정 시각을 모르는 사본이 있던 세션, 이어받은 것을 확인하지 못한 세션의 수 */
  parentRecordMissing: number;
  mergedSessions: number;
  unknownMtimeSessions: number;
  unverifiedInheritance: number;
  /** 세션 ID를 기록 파일의 식별자로 대신 쓴 기록의 까닭별 수 */
  idFallbacks: Record<string, number>;
}

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
  /** Codex만 내는 것. Claude Code에는 없다 */
  codex?: CollectedCodex;
  /** 웹 채팅만 내는 것. 넣은 내보내기 파일의 상태다(0.5.0) */
  web?: WebExportState;
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

/**
 * 도구마다의 기록 형식. Claude Code는 한 형식이다. Codex는 새 형식과 옛 형식이 한 파일에 이어질 수 있어 하나로 본다(설계 9.6).
 * 제미나이는 줄마다 하나인 JSONL과, 메시지 목록이 든 옛 JSON 파일이 있다(설계 「0.4.0에서 정한 것」)
 */
const FORMATS: Record<ToolId, readonly string[]> = { "claude-code": ["claude-code-jsonl"], codex: ["codex-jsonl"], gemini: ["gemini-jsonl", "gemini-json"], "web-chatgpt": ["chatgpt-export"], "web-claude": ["claude-export"] };

const inRange = (date: string, range: { from: LocalDate; to: LocalDate }): boolean => date >= range.from && date <= range.to;

export function resultTools(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): ResultTool[] {
  return evaluation.tools.map((tool): ResultTool => {
    const found = collected.find((item) => item.tool === tool.tool) ?? null;
    const summaries = input.tools.find((item) => item.tool === tool.tool)?.summaries ?? [];
    const subSessions = summaries.filter((summary) => summary.kind === "sub" && Object.entries(summary.days).some(([date, day]) => inRange(date, evaluation.windows.score) && day.responses > 0)).length;
    const visibleFrom = found?.visibleFrom ?? null;
    // 웹 채팅 내보내기에는 내보낸 날 뒤의 대화가 없다. 볼 수 있는 범위의 끝은 그 마지막 날이다(0.5.0)
    const lastDate = found?.web?.lastDate ?? null;
    const visibleTo = lastDate !== null && lastDate < evaluation.windows.today ? lastDate : evaluation.windows.today;
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
      // 내보내기가 모두 수집 구간보다 오래되면 볼 수 있는 날이 없다(짝 검토 5 필수 8)
      visible: visibleFrom === null || visibleTo < visibleFrom ? null : { from: visibleFrom, to: visibleTo },
    };
  });
}
