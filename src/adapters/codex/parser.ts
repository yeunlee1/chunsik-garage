// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가른다(설계 9.2, 9.6, 「5단계 계획 전 결정」 1·7번)
import { nameRecord } from "../common/canonical.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { maxVersion } from "../common/version.ts";
import type { CodexIdFallback } from "../types.ts";
import { canonicalDay, emptyDay, type DayCell, type SessionKind, type SessionSummary, type TokenCounts } from "../types.ts";

export const CODEX_PARSER_VERSION = 1;

export interface CodexParserContext {
  /** 파일 이름 끝의 식별자. 첫 줄을 읽지 못하면 세션 ID로 대신 쓴다 */
  recordId: string;
  timeZone: string;
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
  /** 새 구간에 들어섰는지(token_usage_record를 한 번이라도 봤는지) */
  private inNew = false;
  /** 옛 구간에서 마지막으로 본 누적값. 새 구간의 첫 기록과 견준다 */
  private lastOldTotal: Usage | null = null;
  private readonly seenResponses = new Set<string>();

  constructor(private readonly ctx: CodexParserContext) {}

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다 */
  line(text: string): void {
    if (text.trim() === "") return;
    this.lines++;
    const parsed = parseObject(text);
    this.firstLine(parsed);
    if (parsed === null) this.brokenLines++;
    else this.accept(parsed);
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
    if (row.type === "token_usage_record") this.newRecord(payload);
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
  }

  private oldCount(total: Usage | null): void {
    if (total === null) return;
    const previous = this.lastOldTotal;
    this.lastOldTotal = total;
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
    }
    if (use === null) return;
    // 넘어가는 자리. 새 구간 첫 기록의 누적값이 옛 구간에서 마지막으로 센 것과 같으면 이미 센 응답이다(설계 9.6)
    if (first && this.lastOldTotal !== null) {
      const thread = usageOf(payload.thread_token_usage);
      if (thread !== null && compareUsage(thread, this.lastOldTotal) === "equal") return;
    }
    this.count(use);
  }

  /** 파일 끝의 줄바꿈 없는 조각을 받고 요약을 낸다. 조각이 풀리면 받아들이고, 안 풀리면 쓰는 중일 때만 끝 조각이고 아니면 깨진 줄이다(1단계와 같다) */
  finish(tail: string | null, inProgress: boolean): SessionSummary {
    if (tail !== null && tail.trim() !== "") {
      this.lines++;
      const parsed = parseObject(tail);
      this.firstLine(parsed);
      if (parsed !== null) this.accept(parsed);
      else if (inProgress) this.tailFragments++;
      else this.brokenLines++;
    }
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
      instructionChars: null,
      initialSkills: null,
      initialMcpServers: null,
      missing: { lines: this.lines, brokenLines: this.brokenLines, tailFragments: this.tailFragments, tooLongLines: this.tooLongLines, unconfirmedTypes: nameRecord<number>() },
      firstResponseIdHashes: [],
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback },
    };
  }
}
