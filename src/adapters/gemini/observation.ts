// 제미나이 CLI가 지표마다 무엇을 기록하는지(설계 9.7의 제미나이 열)와, MCP 호출의 관측이 빠짐없는지(설계 9.8)를 가른다(순수 함수, 설계 「0.4.0에서 정한 것」)
import { observeRecords, type Observation } from "../claude/observation.ts";
import type { LineMarker } from "../common/lines.ts";
import type { SessionSummary, ToolCoverage } from "../types.ts";

/**
 * 설계 9.7의 제미나이 열. 기록(v0.68.0)에 사람 요청과 응답, 토큰, 도구 호출과 상태, 하위 에이전트 호출이 남는다.
 * 사람 요청은 도구 결과·명령·맥락·압축 사본을 가려 대신 본다. 셸의 종료 코드는 결과 글 끝의 「Exit Code」 줄로 대신 본다(결과 글이 줄거나 잘리면 보지 못한다).
 * 거절과 끊김(취소 하나로만 남는다), 길이 멈춤, 자동 압축, 추론 강도, 실린 목록, MCP 연결 실패와 훅, 지침 크기는 기록에 남지 않는다.
 * 스킬 사용(activate_skill)은 남지만 안 쓰는 스킬의 판정에 넣지 않는다
 */
export const GEMINI_COVERAGE = {
  responsesAndTokens: "measured",
  humanRequests: "proxy",
  toolCalls: "measured",
  toolErrors: "measured",
  shellExitCodes: "proxy",
  deniedAndLengthStops: "unsupported",
  interruptedTurns: "unsupported",
  autoCompaction: "unsupported",
  effort: "unsupported",
  loadedNames: "unsupported",
  skillUsage: "unsupported",
  mcpCalls: "measured",
  mcpFailuresAndHooks: "unsupported",
  instructionSize: "unsupported",
  subagents: "measured",
} as const satisfies ToolCoverage;

/** 깨진 줄이나 끝 조각이 이 종류로 온전히 읽히면 MCP 호출이 실릴 수 없다. 도구 호출은 gemini 메시지에만 실린다 */
export const GEMINI_MCP_NON_SIGNAL_TYPES: ReadonlySet<string> = new Set(["user", "info", "error", "warning"]);

/** MCP 호출의 관측. unreadableCount는 읽지 못한 파일과 폴더의 수다(설계 9.8 표의 첫 줄) */
export function geminiMcpObservation(summaries: readonly SessionSummary[], unreadableCount: number): Observation {
  return observeRecords(summaries, unreadableCount, GEMINI_MCP_NON_SIGNAL_TYPES, (summary) => summary.missing.tooLongMcpLines ?? summary.missing.tooLongLines);
}

/** 너무 긴 줄에서 찾는 제미나이의 사용 흔적 표지. MCP 도구 이름(mcp_<서버>_<도구>)과 스킬을 부르는 도구다. 맞더라도 판정을 막는 쪽으로만 틀린다 */
export const GEMINI_USAGE_MARKERS: readonly LineMarker[] = [
  { name: "mcp", bytes: Buffer.from('"mcp_', "utf8") },
  { name: "skill", bytes: Buffer.from('"activate_skill"', "utf8") },
];
