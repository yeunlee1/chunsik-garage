// Claude Code가 지표마다 무엇을 기록하는지(설계 9.7)와, 스킬 사용·MCP 호출의 관측이 빠짐없는지(설계 9.8), 절반 넘게 깨진 파일인지(설계 20.1)를 가른다(순수 함수)
import type { SessionSummary } from "../types.ts";

export type Coverage = "measured" | "proxy" | "unsupported";

/** 설계 9.7의 Claude Code 열. Claude Code는 모든 지표를 기록한다. */
export const CLAUDE_COVERAGE = {
  responsesAndTokens: "measured",
  humanRequests: "measured",
  toolCalls: "measured",
  toolErrors: "measured",
  shellExitCodes: "measured",
  deniedAndLengthStops: "measured",
  interruptedTurns: "measured",
  autoCompaction: "measured",
  effort: "measured",
  loadedNames: "measured",
  skillUsage: "measured",
  mcpCalls: "measured",
  mcpFailuresAndHooks: "measured",
  instructionSize: "measured",
  subagents: "measured",
} as const satisfies Record<string, Coverage>;

/** 깨진 줄이나 끝 조각이 이 종류로 온전히 읽히면 그 지표의 사용 신호가 실릴 수 없다(설계 9.8 표). */
export const SKILL_NON_SIGNAL_TYPES: ReadonlySet<string> = new Set([
  "system",
  "api-request",
  "api-request-blob",
  "mode",
  "permission-mode",
  "ai-title",
  "session-owner",
  "pr-link",
  "last-prompt",
  "cost-state",
]);
export const MCP_NON_SIGNAL_TYPES: ReadonlySet<string> = new Set([...SKILL_NON_SIGNAL_TYPES, "user", "attachment"]);

export type ObservationReason = "unreadable-files" | "too-long-lines" | "unconfirmed-pieces";

export interface Observation {
  complete: boolean;
  reasons: ObservationReason[];
}

const REASON_ORDER: readonly ObservationReason[] = ["unreadable-files", "too-long-lines", "unconfirmed-pieces"];

/** 깨진 줄이 줄 수의 절반을 넘으면 그 파일은 읽지 못한 파일로 센다(설계 20.1). 정확히 절반은 넘지 않은 것이다. */
export function mostlyBroken(summary: SessionSummary): boolean {
  return summary.missing.brokenLines * 2 > summary.missing.lines;
}

export function claudeObservation(summaries: readonly SessionSummary[], unreadableCount: number, metric: "skill" | "mcp"): Observation {
  const harmless = metric === "skill" ? SKILL_NON_SIGNAL_TYPES : MCP_NON_SIGNAL_TYPES;
  const found = new Set<ObservationReason>();
  if (unreadableCount > 0) found.add("unreadable-files");
  for (const summary of summaries) {
    if (summary.missing.tooLongLines > 0) found.add("too-long-lines");
    for (const [type, count] of Object.entries(summary.missing.unconfirmedTypes)) {
      if (count > 0 && !harmless.has(type)) found.add("unconfirmed-pieces");
    }
  }
  const reasons = REASON_ORDER.filter((reason) => found.has(reason));
  return { complete: reasons.length === 0, reasons };
}
