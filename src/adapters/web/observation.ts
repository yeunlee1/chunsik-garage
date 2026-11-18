// 웹 채팅 내보내기가 지표마다 무엇을 기록하는지(설계 9.7의 웹 채팅 열)와, 스킬·MCP 관측이 늘 빠짐없지 않다는 것을 정한다(순수, 설계 「0.5.0에서 정한 것」)
import type { Observation } from "../claude/observation.ts";
import type { ToolCoverage, ToolId } from "../types.ts";
import type { WebToolId } from "./conversation.ts";

export const WEB_TOOLS: readonly WebToolId[] = ["web-chatgpt", "web-claude"];

export const isWebTool = (tool: ToolId): tool is WebToolId => tool === "web-chatgpt" || tool === "web-claude";

/**
 * 설계 9.7의 웹 채팅 열(ChatGPT와 Claude.ai가 같다). 내보내기에는 사람 요청과 응답의 시각만 믿고 쓸 수 있게 남는다.
 * 토큰이 없어 캐시 적중을 재지 않는다. 도구 사용은 최근 내보내기가 빼기도 해서(짝 보고 1의 A6·A7) 이 버전은 세지 않는다.
 * 그 밖의 지표(거절과 멈춤, 압축, 추론 강도, 실린 목록, 스킬, MCP, 훅, 지침 크기, 하위 에이전트)는 남지 않는다
 */
export const WEB_COVERAGE = {
  responsesAndTokens: "unsupported",
  humanRequests: "measured",
  toolCalls: "unsupported",
  toolErrors: "unsupported",
  shellExitCodes: "unsupported",
  deniedAndLengthStops: "unsupported",
  interruptedTurns: "unsupported",
  autoCompaction: "unsupported",
  effort: "unsupported",
  loadedNames: "unsupported",
  skillUsage: "unsupported",
  mcpCalls: "unsupported",
  mcpFailuresAndHooks: "unsupported",
  instructionSize: "unsupported",
  subagents: "unsupported",
} as const satisfies ToolCoverage;

/** 웹 채팅은 스킬과 MCP를 기록하지 않아 관측이 늘 빠짐없지 않다. 읽은 것의 문제가 아니라 알리지 않는다 */
export const WEB_OBSERVATION: Observation = { complete: false, reasons: ["not-recorded"] };
