// Codex가 지표마다 무엇을 기록하는지(설계 9.7의 Codex 새 형식 열)와, MCP 호출의 관측이 빠짐없는지(설계 9.8)를 가른다. 스킬 사용은 Codex가 기록하지 않아 늘 빠짐없지 않다(평가 입력에 넣는 것은 5단계 3부, 순수 함수)
import type { LineMarker } from "../common/lines.ts";
import { observeRecords, type Observation } from "../claude/observation.ts";
import type { SessionSummary, ToolCoverage } from "../types.ts";

/** 설계 9.7의 Codex 새 형식 열. 옛 형식에서 셸 명령의 종료 코드처럼 남지 않는 것은 실행 층에 그 사건이 없어 분자와 분모에 함께 들지 않는다 */
export const CODEX_COVERAGE = {
  responsesAndTokens: "measured",
  humanRequests: "proxy",
  toolCalls: "proxy",
  toolErrors: "measured",
  shellExitCodes: "measured",
  deniedAndLengthStops: "unsupported",
  interruptedTurns: "measured",
  autoCompaction: "proxy",
  effort: "measured",
  loadedNames: "unsupported",
  skillUsage: "unsupported",
  mcpCalls: "measured",
  mcpFailuresAndHooks: "unsupported",
  instructionSize: "measured",
  subagents: "unsupported",
} as const satisfies ToolCoverage;

/**
 * 깨진 줄이나 끝 조각이 이 종류로 온전히 읽히면 MCP 호출이 실릴 수 없다(설계 9.8 표의 Codex 칸). 해석기는 MCP 호출을 event_msg의 McpToolCall에서만 세지만,
 * response_item(호출 층)은 사용 신호가 될 수 있는 종류로 둔다. 호출 층에만 남고 McpToolCall이 남지 않는 MCP 호출이 없다는 것을 확인하지 못했다(「5단계 1부 계획에서 보완」)
 */
export const CODEX_MCP_NON_SIGNAL_TYPES: ReadonlySet<string> = new Set(["session_meta", "turn_context", "token_usage_record", "world_state", "compacted"]);

/** MCP 호출의 관측. unreadableCount는 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더한 수다(설계 9.8 표의 첫 줄) */
export function codexMcpObservation(summaries: readonly SessionSummary[], unreadableCount: number): Observation {
  // MCP 호출의 표지를 센 요약은 그 수로, 세지 않은 옛 요약은 너무 긴 줄 모두로 본다(0.3.0)
  return observeRecords(summaries, unreadableCount, CODEX_MCP_NON_SIGNAL_TYPES, (summary) => summary.missing.tooLongMcpLines ?? summary.missing.tooLongLines);
}

/**
 * 너무 긴 줄에서 찾는 Codex의 MCP 호출 표지(0.3.0, 다른 PC 피드백 7번). 실행 층의 McpToolCall과, 호출 층에 남을 수 있는 mcp__ 이름을 덮는다.
 * 맞더라도 판정을 막는 쪽으로만 틀린다
 */
export const CODEX_USAGE_MARKERS: readonly LineMarker[] = [
  { name: "mcp", bytes: Buffer.from('"McpToolCall"', "utf8") },
  { name: "mcp", bytes: Buffer.from('"mcp__', "utf8") },
];
