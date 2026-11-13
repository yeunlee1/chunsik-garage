// 기록으로 재는 도구별 규칙 여덟을 도구 하나의 구간 합계에서 잰다. S4, E1, E2, E3, E4, E7, F1, F2(순수 함수, 설계 11.3, 11.4 「규칙마다의 이유」)
import type { CoverageKey, ToolCoverage } from "../../adapters/types.ts";
import { countGate, scored, type Measurement } from "../measure.ts";
import type { ToolTotals } from "../totals.ts";

export type UsageRuleId = "S4" | "E1" | "E2" | "E3" | "E4" | "E7" | "F1" | "F2";

/** 추론 강도의 차례. 높은 강도는 xhigh와 max다. 차례에 없는 값은 모르는 단계로 분모에서 뺀다(설계 11.3 F1) */
export const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
const HIGH_EFFORT: ReadonlySet<string> = new Set(["xhigh", "max"]);

export const MIN_HOOK_RUNS = 100;
export const MIN_TOOL_RESULTS = 50;
export const MIN_MAIN_SESSIONS = 3;
export const MIN_HUMAN_REQUESTS = 20;
export const MIN_KNOWN_EFFORT = 50;
export const MIN_COMPACTED_SESSIONS = 3;

const sees = (coverage: ToolCoverage, ...keys: CoverageKey[]): boolean => keys.every((key) => coverage[key] !== "unsupported");

/** 가운데 값. 개수가 짝수면 가운데 둘의 평균이다. 빈 목록으로 부르지 않는다. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function s4(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const evidence = { failures: totals.hookFailures, runs: totals.hookRuns, unclassifiedBlocks: totals.hookUnclassified };
  return countGate(sees(coverage, "mcpFailuresAndHooks"), totals.hookRuns, MIN_HOOK_RUNS, evidence) ?? scored(totals.hookFailures / totals.hookRuns, evidence);
}

function e1(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const { input, cacheRead, cacheWrite } = totals.tokens;
  const all = input + cacheRead + cacheWrite;
  const evidence = { cacheRead, cacheWrite, input };
  return countGate(sees(coverage, "responsesAndTokens"), all, 1, evidence) ?? scored(cacheRead / all, evidence);
}

function e2(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const evidence = { errors: totals.nonShellErrors, results: totals.nonShellResults };
  return countGate(sees(coverage, "toolErrors"), totals.nonShellResults, MIN_TOOL_RESULTS, evidence) ?? scored(totals.nonShellErrors / totals.nonShellResults, evidence);
}

function e3(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const autoCompactions = totals.mainSessions.reduce((sum, session) => sum + session.autoCompactions, 0);
  const evidence = { autoCompactions, mainSessions: totals.mainSessions.length };
  return countGate(sees(coverage, "autoCompaction"), totals.mainSessions.length, MIN_MAIN_SESSIONS, evidence) ?? scored(autoCompactions / totals.mainSessions.length, evidence);
}

function e4(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  // 표본은 지침이 실린 주 세션뿐이다. 첨부가 남지 않은 세션과 글자가 없는 세션은 0으로 넣지 않는다(설계 11.3 「E4의 표본」)
  const sample = totals.mainSessions.flatMap((session) => (session.instructionTokens === null ? [] : [session.instructionTokens]));
  const evidence = { sampledSessions: sample.length, skippedSessions: totals.mainSessions.length - sample.length };
  return countGate(sees(coverage, "instructionSize"), sample.length, 1, evidence) ?? scored(median(sample), evidence);
}

function e7(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const evidence = { denied: totals.denied, humanRequests: totals.humanRequests, interruptedTurns: totals.interruptedTurns, lengthStops: totals.lengthStops };
  const stopped = totals.denied + totals.interruptedTurns + totals.lengthStops;
  return countGate(sees(coverage, "deniedAndLengthStops", "interruptedTurns"), totals.humanRequests, MIN_HUMAN_REQUESTS, evidence) ?? scored(stopped / totals.humanRequests, evidence);
}

function f1(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  let knownEffort = 0;
  let highEffort = 0;
  let unknownLevel = 0;
  const levels: ReadonlySet<string> = new Set(EFFORT_LEVELS);
  for (const [level, count] of Object.entries(totals.efforts)) {
    if (!levels.has(level)) unknownLevel += count;
    else {
      knownEffort += count;
      if (HIGH_EFFORT.has(level)) highEffort += count;
    }
  }
  const evidence = { highEffort, knownEffort, unknownEffort: totals.unknownEffort, unknownLevel };
  return countGate(sees(coverage, "effort"), knownEffort, MIN_KNOWN_EFFORT, evidence) ?? scored(highEffort / knownEffort, evidence);
}

function f2(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const compacted = totals.mainSessions.filter((session) => session.autoCompactions > 0);
  const delegatedSessions = compacted.filter((session) => session.subagentCalls > 0).length;
  const evidence = { compactedSessions: compacted.length, delegatedSessions };
  return countGate(sees(coverage, "subagents", "autoCompaction"), compacted.length, MIN_COMPACTED_SESSIONS, evidence) ?? scored(delegatedSessions / compacted.length, evidence);
}

export function usageRules(totals: ToolTotals, coverage: ToolCoverage): Record<UsageRuleId, Measurement> {
  return {
    S4: s4(totals, coverage),
    E1: e1(totals, coverage),
    E2: e2(totals, coverage),
    E3: e3(totals, coverage),
    E4: e4(totals, coverage),
    E7: e7(totals, coverage),
    F1: f1(totals, coverage),
    F2: f2(totals, coverage),
  };
}
