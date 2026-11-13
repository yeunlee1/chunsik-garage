// 시험에서 날짜별 세션 요약을 손으로 짓는 도구. 적지 않은 숫자는 0이고 적지 않은 목록은 비어 있다
import { emptyDay, emptyHookCounts, emptySkillSignalCounts, emptyToolCounts, type DayCell, type HookCounts, type SessionSummary, type SkillSignalCounts, type ToolCounts } from "../../src/adapters/types.ts";

export type DayInput = Partial<Omit<DayCell, "tokens" | "tools" | "skillSignals" | "hooks">> & {
  tokens?: Partial<DayCell["tokens"]>;
  tools?: Record<string, Partial<ToolCounts>>;
  skillSignals?: Record<string, Partial<SkillSignalCounts>>;
  hooks?: Record<string, Partial<HookCounts>>;
};

export function day(input: DayInput = {}): DayCell {
  const { tokens, tools, skillSignals, hooks, ...rest } = input;
  const cell = { ...emptyDay(), ...rest };
  cell.tokens = { ...cell.tokens, ...tokens };
  for (const [name, counts] of Object.entries(tools ?? {})) cell.tools[name] = { ...emptyToolCounts(), ...counts };
  for (const [name, counts] of Object.entries(skillSignals ?? {})) cell.skillSignals[name] = { ...emptySkillSignalCounts(), ...counts };
  for (const [name, counts] of Object.entries(hooks ?? {})) cell.hooks[name] = { ...emptyHookCounts(), ...counts };
  return cell;
}

let nextId = 0;

export type SummaryInput = Partial<Omit<SessionSummary, "days">> & { days?: Record<string, DayInput> };

/** 세션 요약 하나. sessionId를 주지 않으면 부를 때마다 다른 ID를 붙인다. 날짜 칸의 가장 이른 날이 firstDate다. */
export function summary(input: SummaryInput = {}): SessionSummary {
  const { days, ...rest } = input;
  const cells: SessionSummary["days"] = {};
  for (const date of Object.keys(days ?? {}).sort()) cells[date] = day(days![date]);
  return {
    tool: "claude-code",
    sessionId: `s${++nextId}`,
    kind: "main",
    parentSessionId: null,
    cwd: "/work/app",
    version: "2.1.300",
    firstDate: Object.keys(cells)[0] ?? null,
    days: cells,
    instructionChars: null,
    initialSkills: null,
    initialMcpServers: null,
    missing: { lines: 0, brokenLines: 0, tailFragments: 0, tooLongLines: 0, unconfirmedTypes: {} },
    firstResponseIdHashes: [],
    notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: 0, unknownHookKinds: {} },
    ...rest,
  };
}
