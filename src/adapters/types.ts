// 기록 어댑터가 내는 날짜별 세션 요약의 모양(설계 9.3)과, 캐시에서 꺼낸 값을 그 모양으로 되살리는 검사. 숫자와 스킬·MCP 이름만 담고 본문은 담지 않는다
import { nameRecord, sortedRecord } from "./common/canonical.ts";
import type { LocalDate } from "./common/dates.ts";

export type ToolId = "claude-code";
export type SessionKind = "main" | "sub";

export interface TokenCounts {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  thinking: number;
}

export interface ToolCounts {
  calls: number;
  /** 거절·끊김·모르는 표시가 붙지 않은 결과 */
  results: number;
  /** results 가운데 is_error가 참인 것. 셸 도구는 0이 아닌 종료 코드다 */
  errors: number;
  deniedByUser: number;
  deniedByPermission: number;
  deniedByHook: number;
  interrupted: number;
  unknownDenial: number;
}

export interface SkillSignalCounts {
  tool: number;
  attribution: number;
  slash: number;
  injected: number;
}

export interface HookCounts {
  runs: number;
  failures: number;
  /** 실패 표지가 없는 hook_blocking_error. S4의 실행과 실패 어디에도 넣지 않는다 */
  unclassifiedBlocks: number;
}

export interface DayCell {
  humanRequests: number;
  weakHumanRequests: number;
  nonHumanInputs: Record<string, number>;
  permissionModes: Record<string, number>;
  responses: number;
  tokens: TokenCounts;
  models: Record<string, number>;
  efforts: Record<string, number>;
  unknownEffort: number;
  tools: Record<string, ToolCounts>;
  unknownDenialKinds: Record<string, number>;
  autoCompactions: number;
  unknownCompactions: number;
  lengthStops: number;
  interruptedTurns: number;
  subagentCalls: number;
  mcpConnectionFailure: boolean;
  skillSignals: Record<string, SkillSignalCounts>;
  mcpCalls: Record<string, number>;
  mcpAttributions: Record<string, number>;
  hooks: Record<string, HookCounts>;
  loadedSkills: string[];
  loadedMcpServers: string[];
  /** 세션 안에서 실린 목록에서 빠졌다가 이날 다시 실린 이름(설계 9.3, 11.3 ㉱) */
  reloadedSkills: string[];
  reloadedMcpServers: string[];
}

export interface MissingCounts {
  /** 빈 줄을 뺀 줄의 수. 너무 긴 줄과 끝 조각을 넣는다(설계 20.1 「절반 넘게 풀리지 않으면」의 분모) */
  lines: number;
  brokenLines: number;
  tailFragments: number;
  tooLongLines: number;
  unconfirmedTypes: Record<string, number>;
}

export interface SessionSummary {
  tool: ToolId;
  sessionId: string;
  kind: SessionKind;
  parentSessionId: string | null;
  cwd: string | null;
  /** 세션 기록에 적힌 버전 가운데 가장 높은 것. 읽을 수 있는 것이 없으면 null(버전 모름) */
  version: string | null;
  /** 종류와 상관없이 맨 바깥 timestamp가 읽히는 줄 가운데 가장 이른 현지 날짜. 달력의 볼 수 있는 범위에만 쓴다(설계 9.8) */
  firstDate: LocalDate | null;
  days: Record<LocalDate, DayCell>;
  /** 세션에서 처음 실린 지침의 글자 수. ASCII와 그 밖의 글자를 나눈다 */
  instructionChars: { ascii: number; other: number } | null;
  /** 세션의 처음 목록. 스킬은 첫 isInitial 목록, MCP 서버는 첫 응답 줄 바로 앞에 실려 있던 이름이다. 없으면 null(설계 9.3, 11.3 ㉱) */
  initialSkills: string[] | null;
  initialMcpServers: string[] | null;
  missing: MissingCounts;
  firstResponseIdHashes: string[];
  /** 알림에 쓰는 수. 모르는 종류의 훅 첨부는 세지 않고 종류별 수만 낸다(설계 9.5 「훅」) */
  notes: { syntheticResponses: number; responsesWithoutId: number; undatedLines: number; unknownHookKinds: Record<string, number> };
}

export function emptyToolCounts(): ToolCounts {
  return { calls: 0, results: 0, errors: 0, deniedByUser: 0, deniedByPermission: 0, deniedByHook: 0, interrupted: 0, unknownDenial: 0 };
}

export function emptySkillSignalCounts(): SkillSignalCounts {
  return { tool: 0, attribution: 0, slash: 0, injected: 0 };
}

export function emptyHookCounts(): HookCounts {
  return { runs: 0, failures: 0, unclassifiedBlocks: 0 };
}

export function emptyDay(): DayCell {
  return {
    humanRequests: 0,
    weakHumanRequests: 0,
    nonHumanInputs: nameRecord(),
    permissionModes: nameRecord(),
    responses: 0,
    tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 },
    models: nameRecord(),
    efforts: nameRecord(),
    unknownEffort: 0,
    tools: nameRecord(),
    unknownDenialKinds: nameRecord(),
    autoCompactions: 0,
    unknownCompactions: 0,
    lengthStops: 0,
    interruptedTurns: 0,
    subagentCalls: 0,
    mcpConnectionFailure: false,
    skillSignals: nameRecord(),
    mcpCalls: nameRecord(),
    mcpAttributions: nameRecord(),
    hooks: nameRecord(),
    loadedSkills: [],
    loadedMcpServers: [],
    reloadedSkills: [],
    reloadedMcpServers: [],
  };
}

/** 칸 안의 모든 기록을 열쇠 차례로 세운다. 같은 내용이면 늘 같은 JSON이다. */
export function canonicalDay(day: DayCell): DayCell {
  return {
    ...day,
    nonHumanInputs: sortedRecord(day.nonHumanInputs),
    permissionModes: sortedRecord(day.permissionModes),
    models: sortedRecord(day.models),
    efforts: sortedRecord(day.efforts),
    tools: sortedRecord(day.tools),
    unknownDenialKinds: sortedRecord(day.unknownDenialKinds),
    skillSignals: sortedRecord(day.skillSignals),
    mcpCalls: sortedRecord(day.mcpCalls),
    mcpAttributions: sortedRecord(day.mcpAttributions),
    hooks: sortedRecord(day.hooks),
  };
}

// ── 캐시에서 꺼낸 값 되살리기(설계 9.4: 캐시가 있을 때와 없을 때 결과가 같다) ──

type Json = Record<string, unknown>;
type Shape = "number" | "boolean" | "names" | "numbers" | "tokens" | "tools" | "skills" | "hooks";

/** 날짜 칸의 열쇠마다 값의 모양. DayCell에 열쇠를 더하면 여기도 더해야 타입 검사를 통과한다. */
const DAY_SHAPE: Record<keyof DayCell, Shape> = {
  humanRequests: "number",
  weakHumanRequests: "number",
  nonHumanInputs: "numbers",
  permissionModes: "numbers",
  responses: "number",
  tokens: "tokens",
  models: "numbers",
  efforts: "numbers",
  unknownEffort: "number",
  tools: "tools",
  unknownDenialKinds: "numbers",
  autoCompactions: "number",
  unknownCompactions: "number",
  lengthStops: "number",
  interruptedTurns: "number",
  subagentCalls: "number",
  mcpConnectionFailure: "boolean",
  skillSignals: "skills",
  mcpCalls: "numbers",
  mcpAttributions: "numbers",
  hooks: "hooks",
  loadedSkills: "names",
  loadedMcpServers: "names",
  reloadedSkills: "names",
  reloadedMcpServers: "names",
};
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === "string";

/** 정해진 열쇠만 가진 숫자 묶음을 그 차례로 만든다. 하나라도 숫자가 아니면 null이다. */
function fixed(v: unknown, fields: readonly string[]): Record<string, number> | null {
  if (!isObject(v)) return null;
  const out: Record<string, number> = {};
  for (const field of fields) {
    const x = v[field];
    if (!isNumber(x)) return null;
    out[field] = x;
  }
  return out;
}

/** 이름을 열쇠로 쓰는 기록을 원형 없는 객체로, 열쇠 차례로 만든다. 값 하나라도 모양이 다르면 null이다. */
function named<T>(v: unknown, each: (x: unknown) => T | null): Record<string, T> | null {
  if (!isObject(v)) return null;
  const out = nameRecord<T>();
  for (const key of Object.keys(v).sort()) {
    const x = each(v[key]);
    if (x === null) return null;
    out[key] = x;
  }
  return out;
}

function names(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? [...v] : null;
}

function reviveValue(v: unknown, shape: Shape): unknown {
  switch (shape) {
    case "number":
      return isNumber(v) ? v : null;
    case "boolean":
      return typeof v === "boolean" ? v : null;
    case "names":
      return names(v);
    case "numbers":
      return named(v, (x) => (isNumber(x) ? x : null));
    case "tokens":
      return fixed(v, Object.keys(emptyDay().tokens));
    case "tools":
      return named(v, (x) => fixed(x, Object.keys(emptyToolCounts())));
    case "skills":
      return named(v, (x) => fixed(x, Object.keys(emptySkillSignalCounts())));
    case "hooks":
      return named(v, (x) => fixed(x, Object.keys(emptyHookCounts())));
  }
}

function reviveDay(v: unknown): DayCell | null {
  if (!isObject(v)) return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(emptyDay()) as (keyof DayCell)[]) {
    const value = reviveValue(v[key], DAY_SHAPE[key]);
    if (value === null) return null;
    out[key] = value;
  }
  return out as unknown as DayCell;
}

/** 캐시에서 꺼낸 값이 세션 요약의 모양이면 같은 모양(열쇠 차례와 원형 없는 기록까지)으로 되살린다. 모양이 다르면 null이다. */
export function reviveSummary(value: unknown): SessionSummary | null {
  if (!isObject(value)) return null;
  const v = value;
  if (v.tool !== "claude-code" || typeof v.sessionId !== "string" || (v.kind !== "main" && v.kind !== "sub")) return null;
  if (!isNullableString(v.parentSessionId) || !isNullableString(v.cwd) || !isNullableString(v.version)) return null;
  if (!isNullableString(v.firstDate) || (v.firstDate !== null && !DATE_KEY.test(v.firstDate))) return null;
  if (!isObject(v.days)) return null;
  const days: Record<LocalDate, DayCell> = {};
  for (const date of Object.keys(v.days).sort()) {
    const day = DATE_KEY.test(date) ? reviveDay(v.days[date]) : null;
    if (day === null) return null;
    days[date] = day;
  }
  const instructionChars = v.instructionChars === null ? null : fixed(v.instructionChars, ["ascii", "other"]);
  if (v.instructionChars !== null && instructionChars === null) return null;
  const missing = fixed(v.missing, ["lines", "brokenLines", "tailFragments", "tooLongLines"]);
  const unconfirmedTypes = isObject(v.missing) ? named(v.missing.unconfirmedTypes, (x) => (isNumber(x) ? x : null)) : null;
  const notes = fixed(v.notes, ["syntheticResponses", "responsesWithoutId", "undatedLines"]);
  const unknownHookKinds = isObject(v.notes) ? named(v.notes.unknownHookKinds, (x) => (isNumber(x) ? x : null)) : null;
  const hashes = names(v.firstResponseIdHashes);
  const initialSkills = v.initialSkills === null ? null : names(v.initialSkills);
  const initialMcpServers = v.initialMcpServers === null ? null : names(v.initialMcpServers);
  if (missing === null || unconfirmedTypes === null || notes === null || unknownHookKinds === null || hashes === null) return null;
  if ((v.initialSkills !== null && initialSkills === null) || (v.initialMcpServers !== null && initialMcpServers === null)) return null;
  return {
    tool: v.tool,
    sessionId: v.sessionId,
    kind: v.kind,
    parentSessionId: v.parentSessionId,
    cwd: v.cwd,
    version: v.version,
    firstDate: v.firstDate,
    days,
    instructionChars: instructionChars === null ? null : { ascii: instructionChars.ascii!, other: instructionChars.other! },
    initialSkills,
    initialMcpServers,
    missing: {
      lines: missing.lines!,
      brokenLines: missing.brokenLines!,
      tailFragments: missing.tailFragments!,
      tooLongLines: missing.tooLongLines!,
      unconfirmedTypes,
    },
    firstResponseIdHashes: hashes,
    notes: {
      syntheticResponses: notes.syntheticResponses!,
      responsesWithoutId: notes.responsesWithoutId!,
      undatedLines: notes.undatedLines!,
      unknownHookKinds,
    },
  };
}
