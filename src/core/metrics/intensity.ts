// 강도 규칙 넷을 잰다. I1, I2, I3, I4. 도구를 합쳐서 재고 날짜와 프로젝트는 합집합으로 센다(순수 함수, 설계 11.3 「강도」, 11.4 「규칙마다의 이유」)
import type { CoverageKey } from "../../adapters/types.ts";
import { countGate, scored, type Measurement } from "../measure.ts";
import type { ProjectUsage } from "../projects.ts";
import type { ToolUsage } from "../totals.ts";
import { MIN_HUMAN_REQUESTS } from "./usage.ts";

export type IntensityRuleId = "I1" | "I2" | "I3" | "I4";

/** 그 지표들을 모두 보는 도구만 남긴다. 분자와 분모는 같은 관측 범위에서 만든다(설계 9.7) */
const seeing = (tools: readonly ToolUsage[], ...keys: CoverageKey[]): ToolUsage[] => tools.filter((tool) => keys.every((key) => tool.coverage[key] !== "unsupported"));

/** 도구가 있는데 그 지표를 보는 도구가 하나도 없으면 그 사건을 기록하지 않는 것이다. 도구가 처음부터 없으면 기록이 없는 것이다 */
const anySees = (all: readonly ToolUsage[], seen: readonly ToolUsage[]): boolean => seen.length > 0 || all.length === 0;

const activeDays = (tools: readonly ToolUsage[]): number => new Set(tools.flatMap((tool) => tool.totals.activeDates)).size;
const sum = (tools: readonly ToolUsage[], pick: (tool: ToolUsage) => number): number => tools.reduce((total, tool) => total + pick(tool), 0);

function i1(tools: readonly ToolUsage[]): Measurement {
  const days = activeDays(tools);
  return scored(days, { activeDays: days });
}

function i2(tools: readonly ToolUsage[]): Measurement {
  const seen = seeing(tools, "humanRequests");
  const days = activeDays(seen);
  const humanRequests = sum(seen, (tool) => tool.totals.humanRequests);
  const evidence = { activeDays: days, humanRequests };
  return countGate(anySees(tools, seen), days, 1, evidence) ?? scored(humanRequests / days, evidence);
}

function i3(tools: readonly ToolUsage[]): Measurement {
  const seen = seeing(tools, "humanRequests", "toolCalls");
  const humanRequests = sum(seen, (tool) => tool.totals.humanRequests);
  const toolCalls = sum(seen, (tool) => tool.totals.toolCalls);
  const evidence = { humanRequests, toolCalls };
  return countGate(anySees(tools, seen), humanRequests, MIN_HUMAN_REQUESTS, evidence) ?? scored(toolCalls / humanRequests, evidence);
}

function i4(usage: ProjectUsage): Measurement {
  // 프로젝트로 보지 않는 폴더(홈 자체, 임시 폴더 아래 등)는 프로젝트 수에서 뺀다. 지금 PC에 없는 작업 폴더는 세션이 있었으므로 넣는다(설계 10)
  const excludedFolders = usage.projects.filter((use) => use.project.excluded).length;
  const projects = usage.projects.length - excludedFolders;
  const evidence = { excludedFolders, projects, unlinkedSessions: usage.unlinkedSessions };
  return countGate(true, projects, 1, evidence) ?? scored(projects, evidence);
}

/** tools는 점수에 넣는 도구(점수 구간에 응답이 있는 도구)다. usage는 같은 도구들로 만든 것이다. */
export function intensityRules(tools: readonly ToolUsage[], usage: ProjectUsage): Record<IntensityRuleId, Measurement> {
  return { I1: i1(tools), I2: i2(tools), I3: i3(tools), I4: i4(usage) };
}
