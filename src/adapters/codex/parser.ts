// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가르고, 도구는 실행 층에서 이름별로 세되 턴마다 호출 층이 더 많으면 그 차이를 이름 모름으로 더한다. 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기, 깨진 줄과 끝 조각의 맨 바깥 종류도 센다(설계 9.2, 9.6, 9.7, 9.8, 「5단계 계획 전 결정」 1·7번)
import { UNKNOWN_TOOL } from "../claude/parser.ts";
import { nameRecord, sortedRecord } from "../common/canonical.ts";
import { fnv1a64 } from "../common/hash.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { maxVersion } from "../common/version.ts";
import type { CodexIdFallback } from "../types.ts";
import { outerTypeOf } from "../common/outer-type.ts";
import { canonicalDay, emptyDay, emptyToolCounts, type DayCell, type SessionKind, type SessionSummary, type TokenCounts, type ToolCounts } from "../types.ts";

/** 실행 층(item_completed)의 도구 종류와 그 공통 이름. 상태를 보는 종류는 결과와 오류를 낸다(설계 9.6) */
export const EXEC_TOOLS: ReadonlyMap<string, { name: string; status: boolean }> = new Map([
  ["CommandExecution", { name: "shell", status: true }],
  ["FileChange", { name: "file_change", status: true }],
  ["McpToolCall", { name: "mcp", status: true }],
  ["ImageView", { name: "image_view", status: false }],
  ["Extension", { name: "extension", status: false }],
  ["WebSearch", { name: "web_search", status: false }],
]);
/** Codex의 셸 명령 이름. 평가 입력의 shellTools로 넘긴다 */
export const CODEX_SHELL_TOOLS: readonly string[] = ["shell"];
/** 도구가 아닌 실행 층 종류(설계 9.6) */
const NON_TOOL_ITEMS: ReadonlySet<string> = new Set(["UserMessage", "AgentMessage", "Reasoning", "ContextCompaction"]);
/** 호출 층(response_item)의 도구 호출 종류 */
const CALL_TYPES: ReadonlySet<string> = new Set(["function_call", "custom_tool_call", "web_search_call"]);

export const CODEX_PARSER_VERSION = 1;

/** 기록 하나의 지문. 항목의 item.id, 호출 층의 call_id, 옛 구간의 누적값, 새 구간의 response_id를 해시로 둔다(원문은 되살릴 수 없다) */
export interface CodexFingerprints {
  itemIds: ReadonlySet<string>;
  callIds: ReadonlySet<string>;
  totals: ReadonlySet<string>;
  responseIds: ReadonlySet<string>;
}

export interface CodexParserContext {
  /** 파일 이름 끝의 식별자. 첫 줄을 읽지 못하면 세션 ID로 대신 쓴다 */
  recordId: string;
  timeZone: string;
  /** 뺄 지문. 이 기록이 앞부분을 이어받았을 수 있는 기록(하위 세션이면 부모 세션의 기록들, 같은 세션에 기록이 여럿이면 그보다 앞선 기록들)의 지문이다. 그 안에 있는 것은 이 기록의 것으로 세지 않는다. 없으면 다 센다(「5단계 계획 전 결정」 7번) */
  inherited?: CodexFingerprints | null;
}

/** 사람이 연 것이 아니라고 Codex가 밝힌 thread_source(공개 소스의 ThreadSource). 하위 세션이다 */
export const SUB_THREAD_SOURCES: ReadonlySet<string> = new Set(["subagent", "guardian_review", "memory_consolidation"]);

type Json = Record<string, unknown>;
type Usage = TokenCounts;

const obj = (value: unknown): Json | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

function parseObject(text: string): Json | null {
  try {
    return obj(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Codex의 토큰 여섯 칸을 요약의 칸으로 옮긴다. 값은 원래대로 둔다(입력에 캐시가, 출력에 추론이 들어 있다. E1이 도구마다 식을 달리 쓴다) */
function usageOf(value: unknown): Usage | null {
  const raw = obj(value);
  if (raw === null) return null;
  return { input: num(raw.input_tokens), cacheRead: num(raw.cached_input_tokens), cacheWrite: num(raw.cache_write_input_tokens), output: num(raw.output_tokens), thinking: num(raw.reasoning_output_tokens) };
}

const KEYS = ["input", "cacheRead", "cacheWrite", "output", "thinking"] as const;
type Compare = "greater" | "equal" | "smaller";
/** 누적값끼리 견준다. 하나라도 줄었으면 줄어든 것, 모두 같으면 같은 것, 그 밖은 커진 것이다 */
function compareUsage(current: Usage, previous: Usage): Compare {
  if (KEYS.some((key) => current[key] < previous[key])) return "smaller";
  return KEYS.every((key) => current[key] === previous[key]) ? "equal" : "greater";
}

/** 누적값의 지문. 칸의 차례를 고정해 해시한다 */
const totalPrint = (total: Usage): string => fnv1a64(KEYS.map((key) => total[key]).join("|"));

/** 앞선 버전의 꼬리를 떼어 x.y.z로 맞춘다(0.140.0-alpha.19는 0.140.0). 꼴이 다르면 null이다 */
function normalizeVersion(value: unknown): string | null {
  const text = str(value);
  const match = text === null ? null : /^(\d+\.\d+\.\d+)(?:[-+].*)?$/.exec(text.trim());
  return match === null ? null : match[1]!;
}

export class CodexSessionParser {
  private readonly days = new Map<LocalDate, DayCell>();
  private firstDate: LocalDate | null = null;
  /** 시각이 있는 마지막 줄(종류와 상관없이)의 날짜 */
  private lastDate: LocalDate | null = null;
  private sessionId: string | null = null;
  private kind: SessionKind = "main";
  private parentSessionId: string | null = null;
  private cwd: string | null = null;
  private version: string | null = null;
  private unknownThreadSource: string | null = null;
  /** 빈 줄이 아닌 첫 물리적 줄을 받았는지, 그 줄이 session_meta라서 그 줄로 정체를 정하는 중인지, 세션 ID를 기록 파일의 식별자로 대신 쓴 까닭(「5단계 계획 전 결정」 7번) */
  private firstLineSeen = false;
  private identityPending = false;
  private idFallback: CodexIdFallback | null = null;
  private lines = 0;
  private brokenLines = 0;
  private tailFragments = 0;
  private tooLongLines = 0;
  private undatedLines = 0;
  /** 깨진 줄과 끝 조각의 맨 바깥 종류(온전히 읽히지 않으면 ?)별 수. MCP 호출의 관측이 빠짐없는지 가른다(설계 9.8) */
  private readonly unconfirmedTypes = nameRecord<number>();
  /** 새 구간에 들어섰는지(token_usage_record를 한 번이라도 봤는지) */
  private inNew = false;
  /** 옛 구간에서 마지막으로 본 누적값. 새 구간의 첫 기록과 견준다 */
  private lastOldTotal: Usage | null = null;
  private readonly seenResponses = new Set<string>();
  /** 지금 창(앞 턴이 끝난 뒤부터 이 턴이 끝날 때까지)의 turn_context의 모델과 추론 강도, 그 창에서 문맥을 봤는지, 문맥보다 앞에 와서 아직 문맥을 붙이지 못한 응답의 칸 */
  private model: string | null = null;
  private effort: string | null = null;
  private contextSeen = false;
  private readonly pendingCells: DayCell[] = [];
  /** 지금 묶음(턴, 또는 턴 밖)에서 날짜마다 센 호출 층과 실행 층의 도구 수. 날짜를 몰라 세지 못한 줄은 넣지 않는다 */
  private readonly groupCalls = new Map<LocalDate, number>();
  private readonly groupExec = new Map<LocalDate, number>();
  private readonly unknownItemTypes = nameRecord<number>();
  private instructionChars: { ascii: number; other: number } | null = null;
  /** 자기 기록의 지문(이어받아 뺀 것도 넣는다. 손자 세션이 같은 앞부분을 다시 이어받을 수 있다) */
  private readonly myItemIds = new Set<string>();
  private readonly myCallIds = new Set<string>();
  private readonly myTotals = new Set<string>();
  private readonly myResponseIds = new Set<string>();
  private readonly inheritedSkipped = { items: 0, totals: 0, responses: 0 };
  /**
   * 이어받아 뺀 강한 것(도구와 사람 요청의 항목, 호출, 누적값, 응답)의 마지막 줄 자리와, 뺄 지문을 받고 처음 센 옛 구간 누적값의 줄 자리. 뒤의 것이 앞의 것보다 앞이면
   * 복사된 앞부분 안에서 뺄 지문에 없는 누적값을 센 것이라 기준을 찾지 못한 기록이다(「5단계 계획 전 결정」 7번)
   */
  private lastInheritedLine = -1;
  private firstCountedOldLine = -1;

  constructor(private readonly ctx: CodexParserContext) {}

  private tool(cell: DayCell, name: string): ToolCounts {
    let counts = cell.tools[name];
    if (!counts) {
      counts = emptyToolCounts();
      cell.tools[name] = counts;
    }
    return counts;
  }

  /**
   * 묶음을 닫는다. 호출 층이 실행 층보다 많으면 그 차이를 이름 모름의 호출로 더한다(설계 9.6). 차이는 날짜 차례로, 그날 호출 층이 실행 층보다 많은 만큼까지
   * 그날에 나눈다. 날짜를 몰라 세지 못한 줄은 어느 층에도 넣지 않았다(「5단계 1부 계획에서 보완」)
   */
  private closeGroup(): void {
    const sum = (counts: Map<LocalDate, number>): number => [...counts.values()].reduce((total, n) => total + n, 0);
    let extra = sum(this.groupCalls) - sum(this.groupExec);
    for (const date of [...this.groupCalls.keys()].sort()) {
      if (extra <= 0) break;
      const give = Math.min(extra, this.groupCalls.get(date)! - (this.groupExec.get(date) ?? 0));
      if (give <= 0) continue;
      this.tool(this.day(date), UNKNOWN_TOOL).calls += give;
      extra -= give;
    }
    this.groupCalls.clear();
    this.groupExec.clear();
  }

  /** 문맥의 창을 닫는다. 창에서 문맥을 보지 못한 응답은 모델을 모르고 추론 강도를 모르는 것으로 센다(설계 9.6 「그 턴의 응답들에 적용」) */
  private closeContext(): void {
    for (const cell of this.pendingCells.splice(0)) cell.unknownEffort++;
    this.model = null;
    this.effort = null;
    this.contextSeen = false;
  }

  /** 응답 하나의 칸에 지금 창의 모델과 추론 강도를 붙인다 */
  private attribute(cell: DayCell): void {
    if (this.model !== null) cell.models[this.model] = (Object.hasOwn(cell.models, this.model) ? cell.models[this.model]! : 0) + 1;
    if (this.effort !== null) cell.efforts[this.effort] = (Object.hasOwn(cell.efforts, this.effort) ? cell.efforts[this.effort]! : 0) + 1;
    else cell.unknownEffort++;
  }

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다 */
  line(text: string): void {
    if (text.trim() === "") return;
    this.lines++;
    const parsed = parseObject(text);
    this.firstLine(parsed);
    if (parsed === null) this.missing(text, "broken");
    else this.accept(parsed);
  }

  /** 풀리지 않는 줄이나 끝 조각 하나. 맨 바깥 종류를 센다(1단계와 같다) */
  private missing(text: string, kind: "broken" | "tail"): void {
    if (kind === "broken") this.brokenLines++;
    else this.tailFragments++;
    const type = outerTypeOf(text) ?? "?";
    this.unconfirmedTypes[type] = (Object.hasOwn(this.unconfirmedTypes, type) ? this.unconfirmedTypes[type]! : 0) + 1;
  }

  /** 빈 줄이 아닌 첫 물리적 줄 하나만 본다. 풀리지 않거나 너무 길면 첫 줄을 읽지 못한 것이고, 풀렸는데 session_meta가 아니면 정체를 모르는 것이다. 그 뒤의 session_meta로 정체를 정하지 않는다(「5단계 계획 전 결정」 7번) */
  private firstLine(parsed: Json | null): void {
    if (this.firstLineSeen) return;
    this.firstLineSeen = true;
    if (parsed === null) this.idFallback = "first-line-unreadable";
    else if (parsed.type !== "session_meta") this.idFallback = "first-line-not-meta";
    else this.identityPending = true;
  }

  /** 상한을 넘은 줄 하나를 받는다 */
  tooLong(): void {
    this.lines++;
    this.tooLongLines++;
    this.firstLine(null);
  }

  private day(date: LocalDate): DayCell {
    let cell = this.days.get(date);
    if (!cell) {
      cell = emptyDay();
      this.days.set(date, cell);
    }
    return cell;
  }

  /** 세는 줄의 날짜. 시각이 없으면 앞 줄(종류와 상관없이)의 날짜를 쓰고, 앞 줄도 없으면 날짜 없는 줄로 센다(1단계와 같다). 세는 줄마다 한 번만 부른다 */
  private dateOf(): LocalDate | null {
    if (this.lastDate === null) this.undatedLines++;
    return this.lastDate;
  }

  /** 풀린 줄 하나. 종류와 상관없이 그 줄의 시각을 앞 줄의 날짜와 가장 이른 날짜에 쓰고, 종류에 따라 해석한다 */
  private accept(row: Json): void {
    const own = localDateOfIso(row.timestamp, this.ctx.timeZone);
    if (own !== null) {
      this.lastDate = own;
      if (this.firstDate === null || own < this.firstDate) this.firstDate = own;
    }
    const payload = obj(row.payload) ?? {};
    if (row.type === "session_meta") {
      this.meta(payload, this.identityPending);
      this.identityPending = false;
      return;
    }
    if (row.type === "event_msg" && payload.type === "token_count") {
      if (!this.inNew) this.oldCount(usageOf(obj(payload.info)?.total_token_usage));
      return;
    }
    if (row.type === "token_usage_record") return this.newRecord(payload);
    if (row.type === "turn_context") {
      this.model = str(payload.model);
      this.effort = str(payload.effort);
      // 창에서 문맥보다 앞에 온 응답에도 이 문맥을 붙인다
      if (!this.contextSeen) {
        this.contextSeen = true;
        for (const cell of this.pendingCells.splice(0)) this.attribute(cell);
      }
      return;
    }
    if (row.type === "event_msg" && (payload.type === "task_started" || payload.type === "task_complete" || payload.type === "turn_aborted")) {
      this.closeGroup();
      // 턴 시작은 도구 묶음만 닫는다. 문맥은 시작 앞에 오기도 해서 턴이 끝날 때 닫는다
      if (payload.type !== "task_started") this.closeContext();
      if (payload.type === "turn_aborted") {
        const date = this.dateOf();
        if (date !== null) this.day(date).interruptedTurns++;
      }
      return;
    }
    if (row.type === "response_item" && typeof payload.type === "string" && CALL_TYPES.has(payload.type)) {
      const callId = str(payload.call_id);
      if (callId !== null) {
        const print = fnv1a64(callId);
        this.myCallIds.add(print);
        if (this.ctx.inherited?.callIds.has(print)) {
          this.lastInheritedLine = this.lines;
          return;
        }
      }
      const date = this.dateOf();
      if (date !== null) this.groupCalls.set(date, (this.groupCalls.get(date) ?? 0) + 1);
      return;
    }
    if (row.type === "event_msg" && payload.type === "item_completed") return this.item(obj(payload.item));
    if (row.type === "compacted") {
      const date = this.dateOf();
      if (date !== null) this.day(date).autoCompactions++;
      return;
    }
    if (row.type === "world_state" && this.instructionChars === null) {
      const text = obj(obj(obj(payload.state)?.agents_md))?.text;
      if (typeof text === "string") {
        let ascii = 0;
        let other = 0;
        for (const char of text) {
          if (char.codePointAt(0)! < 128) ascii++;
          else other++;
        }
        this.instructionChars = { ascii, other };
      }
    }
  }

  /** 실행 층의 사건 하나. 도구면 이름별로 세고, 사람 요청이면 세고, 도구가 아닌 종류는 넘기며, 모르는 종류는 따로 센다 */
  private item(item: Json | null): void {
    if (item === null) return;
    const type = str(item.type);
    if (type === null) return;
    const itemId = str(item.id);
    if (itemId !== null) {
      const print = fnv1a64(itemId);
      this.myItemIds.add(print);
      if (this.ctx.inherited?.itemIds.has(print)) {
        this.inheritedSkipped.items++;
        if (type === "UserMessage" || EXEC_TOOLS.has(type)) this.lastInheritedLine = this.lines;
        return;
      }
    }
    if (type === "UserMessage") {
      const date = this.dateOf();
      if (date !== null) this.day(date).humanRequests++;
      return;
    }
    if (NON_TOOL_ITEMS.has(type)) return;
    const kind = EXEC_TOOLS.get(type);
    if (kind === undefined) {
      this.unknownItemTypes[type] = (Object.hasOwn(this.unknownItemTypes, type) ? this.unknownItemTypes[type]! : 0) + 1;
      return;
    }
    const date = this.dateOf();
    if (date === null) return;
    this.groupExec.set(date, (this.groupExec.get(date) ?? 0) + 1);
    const cell = this.day(date);
    const server = type === "McpToolCall" ? str(item.server) : null;
    const name = type === "McpToolCall" ? `mcp__${server ?? UNKNOWN_TOOL}` : kind.name;
    const counts = this.tool(cell, name);
    counts.calls++;
    if (type === "McpToolCall" && server !== null) cell.mcpCalls[server] = (Object.hasOwn(cell.mcpCalls, server) ? cell.mcpCalls[server]! : 0) + 1;
    if (!kind.status) return;
    counts.results++;
    const failed = type === "CommandExecution" ? typeof item.exit_code === "number" && item.exit_code !== 0 : item.status === "failed";
    if (failed) counts.errors++;
  }

  /** session_meta 하나. 버전은 모든 session_meta에서 가장 높은 것을 남기고(설계 9.3), 정체(세션 ID, 작업 폴더, 주·하위, 부모)는 첫 줄의 것에서만 정한다 */
  private meta(payload: Json, first: boolean): void {
    this.version = maxVersion([this.version, normalizeVersion(payload.cli_version)]);
    if (!first) return;
    this.sessionId = str(payload.id);
    if (this.sessionId === null) this.idFallback = "meta-without-id";
    this.cwd = str(payload.cwd);
    const source = payload.thread_source;
    if (source === "user") this.kind = "main";
    else if (typeof source === "string" && SUB_THREAD_SOURCES.has(source)) {
      this.kind = "sub";
      this.parentSessionId = str(payload.parent_thread_id);
    } else {
      // 정체 모름. 사람이 연 세션일 수 있어 주 세션으로 센다(설계 9.2)
      this.kind = "main";
      this.unknownThreadSource = typeof source === "string" ? source : "(없음)";
    }
  }

  /** 응답 하나를 그 날의 칸에 더한다. 날짜를 얻지 못하면 세지 않는다(날짜 없는 줄로는 dateOf가 센다) */
  private count(add: Usage): void {
    const date = this.dateOf();
    if (date === null) return;
    const cell = this.day(date);
    cell.responses++;
    for (const key of KEYS) cell.tokens[key] += add[key];
    if (this.contextSeen) this.attribute(cell);
    else this.pendingCells.push(cell);
  }

  private oldCount(total: Usage | null): void {
    if (total === null) return;
    const previous = this.lastOldTotal;
    this.lastOldTotal = total;
    const print = totalPrint(total);
    this.myTotals.add(print);
    if (this.ctx.inherited?.totals.has(print)) {
      this.inheritedSkipped.totals++;
      this.lastInheritedLine = this.lines;
      return;
    }
    if (this.ctx.inherited && this.firstCountedOldLine < 0 && (previous === null || compareUsage(total, previous) !== "equal")) this.firstCountedOldLine = this.lines;
    if (previous === null) return this.count(total);
    const relation = compareUsage(total, previous);
    if (relation === "equal") return;
    if (relation === "smaller") return this.count(total);
    const diff = { ...total };
    for (const key of KEYS) diff[key] = total[key] - previous[key];
    this.count(diff);
  }

  private newRecord(payload: Json): void {
    const responseId = str(payload.response_id);
    const use = usageOf(payload.usage);
    const first = !this.inNew;
    this.inNew = true;
    if (responseId !== null) {
      if (this.seenResponses.has(responseId)) return;
      this.seenResponses.add(responseId);
      const print = fnv1a64(responseId);
      this.myResponseIds.add(print);
      if (this.ctx.inherited?.responseIds.has(print)) {
        this.inheritedSkipped.responses++;
        this.lastInheritedLine = this.lines;
        return;
      }
    }
    if (use === null) return;
    // 넘어가는 자리. 새 구간 첫 기록의 누적값이 옛 구간에서 마지막으로 센 것과 같으면 이미 센 응답이다(설계 9.6)
    if (first && this.lastOldTotal !== null) {
      const thread = usageOf(payload.thread_token_usage);
      if (thread !== null && compareUsage(thread, this.lastOldTotal) === "equal") return;
    }
    this.count(use);
  }

  /** 자기 기록의 지문. finish 뒤에 부른다 */
  fingerprints(): CodexFingerprints {
    return { itemIds: this.myItemIds, callIds: this.myCallIds, totals: this.myTotals, responseIds: this.myResponseIds };
  }

  /** 파일 끝의 줄바꿈 없는 조각을 받고 요약을 낸다. 조각이 풀리면 받아들이고, 안 풀리면 쓰는 중일 때만 끝 조각이고 아니면 깨진 줄이다(1단계와 같다) */
  finish(tail: string | null, inProgress: boolean): SessionSummary {
    if (tail !== null && tail.trim() !== "") {
      this.lines++;
      const parsed = parseObject(tail);
      this.firstLine(parsed);
      if (parsed !== null) this.accept(parsed);
      else this.missing(tail, inProgress ? "tail" : "broken");
    }
    this.closeGroup();
    this.closeContext();
    if (!this.firstLineSeen) this.idFallback = "no-lines";
    const days: Record<LocalDate, DayCell> = {};
    for (const date of [...this.days.keys()].sort()) days[date] = canonicalDay(this.days.get(date)!);
    return {
      tool: "codex",
      sessionId: this.sessionId ?? this.ctx.recordId,
      kind: this.kind,
      parentSessionId: this.kind === "sub" ? this.parentSessionId : null,
      cwd: this.cwd,
      version: this.version,
      firstDate: this.firstDate,
      days,
      instructionChars: this.instructionChars,
      initialSkills: null,
      initialMcpServers: null,
      missing: { lines: this.lines, brokenLines: this.brokenLines, tailFragments: this.tailFragments, tooLongLines: this.tooLongLines, unconfirmedTypes: sortedRecord(this.unconfirmedTypes) },
      firstResponseIdHashes: [],
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback, unknownItemTypes: this.unknownItemTypes, inheritedSkipped: { ...this.inheritedSkipped }, baselineMissing: this.firstCountedOldLine >= 0 && this.firstCountedOldLine < this.lastInheritedLine },
    };
  }
}
