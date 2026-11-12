// Claude Code 세션 파일의 줄을 받아 날짜별 세션 요약으로 바꾼다. 파일을 열지 않는 순수 해석부다(설계 9.3, 9.5, 9.8)
import { nameRecord, sortedRecord } from "../common/canonical.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { fnv1a64 } from "../common/hash.ts";
import { outerTypeOf } from "../common/outer-type.ts";
import { maxVersion } from "../common/version.ts";
import {
  canonicalDay,
  emptyDay,
  emptySkillSignalCounts,
  emptyToolCounts,
  type DayCell,
  type SessionKind,
  type SessionSummary,
  type SkillSignalCounts,
  type ToolCounts,
} from "../types.ts";
import { classifyUser, denialOf, isInterruptMarker, slashCommandOf, type DenialKind } from "./classify.ts";
import { ResponseTable } from "./responses.ts";

export const CLAUDE_PARSER_VERSION = 1;

/** 숫자를 세는 종류. 그 밖의 종류는 풀리는지와 날짜만 본다(설계 9.4) */
const COUNTED_TYPES: ReadonlySet<string> = new Set(["assistant", "user", "attachment", "system"]);
const FIRST_RESPONSE_IDS = 20;
export const SHELL_TOOLS: ReadonlySet<string> = new Set(["Bash", "PowerShell"]);
export const SUBAGENT_TOOLS: ReadonlySet<string> = new Set(["Agent", "Task"]);
export const UNKNOWN_TOOL = "?";

/** 도구 이름을 세는 열쇠로 바꾼다. MCP 도구(mcp__<서버>__<도구>)는 서버로 묶는다. */
export function toolKey(name: string): string {
  if (!name.startsWith("mcp__")) return name;
  const parts = name.split("__");
  return `mcp__${parts[1] !== undefined && parts[1] !== "" ? parts[1] : UNKNOWN_TOOL}`;
}

type Json = Record<string, unknown>;

export interface ParserContext {
  sessionId: string;
  kind: SessionKind;
  parentSessionId: string | null;
  timeZone: string;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const obj = (value: unknown): Json | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
const bump = (record: Record<string, number>, key: string, by = 1): void => {
  record[key] = (Object.hasOwn(record, key) ? record[key]! : 0) + by;
};

function parseObject(text: string): Json | null {
  try {
    return obj(JSON.parse(text));
  } catch {
    return null;
  }
}

export class ClaudeSessionParser {
  private readonly days = new Map<LocalDate, DayCell>();
  private readonly responses = new ResponseTable();
  private readonly firstIds: string[] = [];
  private lastDate: LocalDate | null = null;
  private firstDate: LocalDate | null = null;
  private version: string | null = null;
  private cwd: string | null = null;
  private lines = 0;
  private brokenLines = 0;
  private tailFragments = 0;
  private tooLongLines = 0;
  private readonly unconfirmedTypes = nameRecord<number>();
  private responsesWithoutId = 0;
  private undatedLines = 0;
  private readonly unknownHookKinds = nameRecord<number>();
  private readonly toolNames = new Map<string, string>();
  private pendingCommand: { date: LocalDate; mode: string | null } | null = null;
  private readonly slashCommands: Array<{ name: string; date: LocalDate }> = [];
  private lastUserWasUserRejection = false;

  constructor(private readonly ctx: ParserContext) {}

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다. 모든 줄을 JSON으로 풀어 보고, 숫자는 세는 종류의 줄에서만 센다. */
  line(text: string): void {
    if (text.trim() === "") return;
    this.lines++;
    const parsed = parseObject(text);
    if (parsed === null) this.missing(text, "broken");
    else this.accept(parsed);
  }

  /** 상한을 넘은 줄 하나를 받는다. */
  tooLong(): void {
    this.lines++;
    this.tooLongLines++;
  }

  /** 끝 조각을 정리하고 요약을 낸다. 한 번만 부른다. */
  finish(tail: string | null, inProgress: boolean): SessionSummary {
    if (tail !== null && tail.trim() !== "") {
      this.lines++;
      const parsed = parseObject(tail);
      if (parsed !== null) this.accept(parsed);
      else this.missing(tail, inProgress ? "tail" : "broken");
    }
    const syntheticResponses = this.foldResponses();
    const days: Record<LocalDate, DayCell> = {};
    for (const date of [...this.days.keys()].sort()) days[date] = canonicalDay(this.days.get(date)!);
    return {
      tool: "claude-code",
      sessionId: this.ctx.sessionId,
      kind: this.ctx.kind,
      parentSessionId: this.ctx.parentSessionId,
      cwd: this.cwd,
      version: this.version,
      firstDate: this.firstDate,
      days,
      instructionChars: null,
      initialSkills: null,
      initialMcpServers: null,
      missing: {
        lines: this.lines,
        brokenLines: this.brokenLines,
        tailFragments: this.tailFragments,
        tooLongLines: this.tooLongLines,
        unconfirmedTypes: sortedRecord(this.unconfirmedTypes),
      },
      firstResponseIdHashes: this.firstIds.map(fnv1a64),
      notes: {
        syntheticResponses,
        responsesWithoutId: this.responsesWithoutId,
        undatedLines: this.undatedLines,
        unknownHookKinds: sortedRecord(this.unknownHookKinds),
      },
    };
  }

  /** 응답마다 마지막 사용량을 날짜 칸에 더한다. 합성 응답의 수를 돌려준다. */
  private foldResponses(): number {
    let synthetic = 0;
    for (const response of this.responses.fold()) {
      if (response.synthetic) {
        synthetic++;
        continue;
      }
      if (response.date === null) continue;
      const day = this.day(response.date);
      day.responses++;
      if (response.usage !== null) {
        day.tokens.input += response.usage.input;
        day.tokens.cacheRead += response.usage.cacheRead;
        day.tokens.cacheWrite += response.usage.cacheWrite;
        day.tokens.output += response.usage.output;
        day.tokens.thinking += response.usage.thinking;
      }
      if (response.model !== null) bump(day.models, response.model);
      if (response.effort !== null) bump(day.efforts, response.effort);
      else day.unknownEffort++;
      if (response.lengthStop) day.lengthStops++;
      if (response.skill !== null) this.skillSignal(day, response.skill).attribution++;
      if (response.mcpServer !== null) bump(day.mcpAttributions, response.mcpServer);
    }
    return synthetic;
  }

  private missing(text: string, kind: "broken" | "tail"): void {
    if (kind === "broken") this.brokenLines++;
    else this.tailFragments++;
    bump(this.unconfirmedTypes, outerTypeOf(text) ?? "?");
  }

  /** 풀린 줄 하나. 종류와 상관없이 그 줄의 시각을 앞 줄의 날짜와 가장 이른 날짜에 쓰고, 세는 종류면 해석한다. */
  private accept(line: Json): void {
    const own = localDateOfIso(line.timestamp, this.ctx.timeZone);
    if (own !== null) {
      this.lastDate = own;
      if (this.firstDate === null || own < this.firstDate) this.firstDate = own;
    }
    if (typeof line.type === "string" && COUNTED_TYPES.has(line.type)) this.handle(line, this.dateOf(own));
  }

  /** 세는 줄의 날짜. 시각이 없으면 앞 줄(종류와 상관없이)의 날짜를 쓰고, 앞 줄도 없으면 날짜 없는 줄로 센다. */
  private dateOf(own: LocalDate | null): LocalDate | null {
    if (own !== null) return own;
    if (this.lastDate === null) this.undatedLines++;
    return this.lastDate;
  }

  private day(date: LocalDate): DayCell {
    let day = this.days.get(date);
    if (day === undefined) {
      day = emptyDay();
      this.days.set(date, day);
    }
    return day;
  }

  private skillSignal(day: DayCell, name: string): SkillSignalCounts {
    let counts = day.skillSignals[name];
    if (counts === undefined) {
      counts = emptySkillSignalCounts();
      day.skillSignals[name] = counts;
    }
    return counts;
  }

  private handle(line: Json, date: LocalDate | null): void {
    if (this.cwd === null) this.cwd = str(line.cwd);
    if (line.type === "assistant") this.onAssistant(line, date);
    else if (line.type === "user") this.onUser(line, date);
  }

  private onAssistant(line: Json, date: LocalDate | null): void {
    this.lastUserWasUserRejection = false;
    const version = str(line.version);
    if (version !== null) this.version = maxVersion([this.version, version]);
    const message = obj(line.message) ?? {};
    const id = str(message.id);
    if (id === null) {
      this.responsesWithoutId++;
    } else {
      const { row, isNew } = this.responses.row(id, date, message.model === "<synthetic>");
      if (isNew && !this.responses.isSynthetic(row)) {
        if (this.firstIds.length < FIRST_RESPONSE_IDS) this.firstIds.push(id);
        this.resolvePending(true);
      }
      this.responses.fillFirst(row, "model", str(message.model));
      this.responses.fillFirst(row, "effort", str(line.effort));
      const usage = obj(message.usage);
      if (usage !== null) {
        this.responses.setUsage(row, {
          input: num(usage.input_tokens),
          cacheRead: num(usage.cache_read_input_tokens),
          cacheWrite: num(usage.cache_creation_input_tokens),
          output: num(usage.output_tokens),
          thinking: num(obj(usage.output_tokens_details)?.thinking_tokens),
        });
      }
      const stop = str(message.stop_reason);
      if (stop !== null) this.responses.setStop(row, stop);
      this.responses.setLast(row, "skill", str(line.attributionSkill));
      this.responses.setLast(row, "mcpServer", str(line.attributionMcpServer));
    }
    if (date === null || !Array.isArray(message.content)) return;
    for (const raw of message.content) {
      const block = obj(raw);
      if (block === null || block.type !== "tool_use") continue;
      const blockId = str(block.id);
      if (blockId === null || this.toolNames.has(blockId)) continue;
      const name = str(block.name) ?? UNKNOWN_TOOL;
      const key = toolKey(name);
      this.toolNames.set(blockId, key);
      const day = this.day(date);
      this.tool(day, key).calls++;
      if (key.startsWith("mcp__")) bump(day.mcpCalls, key.slice("mcp__".length));
      if (SUBAGENT_TOOLS.has(name)) day.subagentCalls++;
      if (name === "Skill") {
        const skill = str(obj(block.input)?.skill);
        if (skill !== null) this.skillSignal(day, skill).tool++;
      }
    }
  }

  /**
   * user 줄. 사람 요청은 판별표로 가르고(하위 세션은 세지 않는다), 도구 결과·거절·끊은 표지·슬래시 명령은
   * 판별표와 따로 본다. 하위 세션의 도구 결과, 끊은 표지, 슬래시 명령도 센다(설계 9.2, 9.5).
   */
  private onUser(line: Json, date: LocalDate | null): void {
    const verdict = classifyUser(line, this.ctx.kind === "sub");
    const denial = denialOf(line);
    const afterUserRejection = this.lastUserWasUserRejection;
    this.lastUserWasUserRejection = denial !== null && denial.kind === "user";
    if (date === null) return;
    const day = this.day(date);
    this.toolResults(line, day, denial);
    if (isInterruptMarker(line) && !afterUserRejection) day.interruptedTurns++;
    const slash = slashCommandOf(line);
    if (slash !== null) this.slashCommands.push({ name: slash, date });
    switch (verdict.kind) {
      case "human":
        this.resolvePending(false);
        day.humanRequests++;
        if (verdict.weak) day.weakHumanRequests++;
        this.countMode(day, line);
        break;
      case "command":
        this.resolvePending(false);
        this.pendingCommand = { date, mode: str(line.permissionMode) };
        break;
      case "skip":
        bump(day.nonHumanInputs, verdict.reason);
        break;
      case "tool-result":
        break;
    }
  }

  /** 도구 결과를 센다. 거절 표시가 붙은 줄은 한 건으로, 첫 결과의 도구에 종류별로 적는다. 결과도 거절 표시도 없으면 아무것도 세지 않는다. */
  private toolResults(line: Json, day: DayCell, denial: { kind: DenialKind; raw: string | null } | null): void {
    const message = obj(line.message) ?? {};
    const results: Json[] = [];
    if (Array.isArray(message.content)) {
      for (const raw of message.content) {
        const block = obj(raw);
        if (block !== null && block.type === "tool_result") results.push(block);
      }
    }
    if (denial !== null) {
      const first = results[0];
      const counts = this.tool(day, first === undefined ? UNKNOWN_TOOL : this.toolNameOf(first));
      if (denial.kind === "user") counts.deniedByUser++;
      else if (denial.kind === "hook") counts.deniedByHook++;
      else if (denial.kind === "permission") counts.deniedByPermission++;
      else if (denial.kind === "interrupted") counts.interrupted++;
      else {
        counts.unknownDenial++;
        bump(day.unknownDenialKinds, denial.raw ?? UNKNOWN_TOOL);
      }
      return;
    }
    for (const block of results) {
      const counts = this.tool(day, this.toolNameOf(block));
      counts.results++;
      if (block.is_error === true) counts.errors++;
    }
  }

  private toolNameOf(block: Json): string {
    const id = str(block.tool_use_id);
    return (id === null ? undefined : this.toolNames.get(id)) ?? UNKNOWN_TOOL;
  }

  private tool(day: DayCell, name: string): ToolCounts {
    let counts = day.tools[name];
    if (counts === undefined) {
      counts = emptyToolCounts();
      day.tools[name] = counts;
    }
    return counts;
  }

  private countMode(day: DayCell, line: Json): void {
    const mode = str(line.permissionMode);
    if (mode !== null) bump(day.permissionModes, mode);
  }

  /** 기다리는 명령을 정리한다. 응답이 뒤따랐으면 명령의 날짜에 사람 요청으로 센다. */
  private resolvePending(responded: boolean): void {
    if (this.pendingCommand === null) return;
    if (responded) {
      const day = this.day(this.pendingCommand.date);
      day.humanRequests++;
      if (this.pendingCommand.mode !== null) bump(day.permissionModes, this.pendingCommand.mode);
    }
    this.pendingCommand = null;
  }
}
