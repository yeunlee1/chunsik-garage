// 제미나이 CLI 세션 기록(JSONL)의 줄을 받아 날짜별 세션 요약으로 바꾼다. 파일을 열지 않는 순수 해석부다. 기록의 모양은 공개 소스 v0.68.0의 chatRecordingTypes.ts·chatRecordingService.ts다(설계 「0.4.0에서 정한 것」)
import { nameRecord, sortedRecord } from "../common/canonical.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { fnv1a64 } from "../common/hash.ts";
import { outerTypeOf } from "../common/outer-type.ts";
import { canonicalDay, emptyDay, emptySkillSignalCounts, emptyToolCounts, type DayCell, type SessionKind, type SessionSummary, type SkillSignalCounts, type ToolCounts } from "../types.ts";

/** 해석 버전. 캐시 열쇠에 들어가, 읽기나 해석이 바뀌어 예전 버전이 넣은 캐시가 틀릴 수 있으면 올린다(설계 9.4) */
export const GEMINI_PARSER_VERSION = 1;

/** 셸 명령 도구(run_shell_command). 도구 오류(E2)에서 뺀다 */
export const GEMINI_SHELL_TOOLS: readonly string[] = ["run_shell_command"];
const SUBAGENT_TOOLS: ReadonlySet<string> = new Set(["invoke_agent"]);
const SKILL_TOOL = "activate_skill";
const MCP_PREFIX = "mcp_";
/** 세는 메시지 종류. 그 밖의 종류는 확인하지 못한 조각이다 */
const MESSAGE_TYPES: ReadonlySet<string> = new Set(["user", "gemini", "info", "error", "warning"]);
const FIRST_RESPONSE_IDS = 20;
const UNKNOWN_TOOL = "?";

export interface GeminiParserContext {
  /** 세션 정보 줄에 sessionId가 없을 때 쓰는 파일의 식별자 */
  sessionId: string;
  kind: SessionKind;
  parentSessionId: string | null;
  /** 기록 폴더의 .project_root에 적힌 프로젝트 폴더. 모르면 null */
  cwd: string | null;
  timeZone: string;
}

type Json = Record<string, unknown>;

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const obj = (value: unknown): Json | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
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

/** MCP 도구 이름(mcp_<서버>_<도구>)의 서버 마디. mcp_ 뒤 첫 밑줄까지다. 서버 이름에 밑줄이 있으면 앞 마디만 남는다(소스 tools/mcp-tool.ts의 parseMcpToolName과 같다) */
export function geminiMcpServerKey(toolName: string): string | null {
  if (!toolName.startsWith(MCP_PREFIX)) return null;
  const rest = toolName.slice(MCP_PREFIX.length);
  const cut = rest.indexOf("_");
  const server = cut === -1 ? rest : rest.slice(0, cut);
  return server === "" ? null : server;
}

/** 사람이 친 글이 아닌 조각의 머리. 슬래시·물음표 명령, 세션·훅 맥락(환경과 지침), 압축 요약이다(소스 utils/sessionUtils.ts의 isIgnoredUserContent, context/chatCompressionService.ts) */
const NOT_HUMAN_HEADS: readonly string[] = ["/", "?", "<session_context>", "<hook_context>", "<state_snapshot>"];
const humanText = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed.length > 0 && !NOT_HUMAN_HEADS.some((head) => trimmed.startsWith(head));
};

/**
 * 사람이 친 요청인지. 글 조각 가운데 하나라도 사람 글이면 그렇다. 첫 요청은 세션 맥락 조각과 한 메시지에 함께 올 수 있어 조각마다 본다.
 * 도구 결과(functionResponse)만 든 메시지, 빈 것, 명령, 맥락, 압축 요약만 든 메시지는 아니다
 */
export function isHumanContent(content: unknown): boolean {
  if (typeof content === "string") return humanText(content);
  const parts = Array.isArray(content) ? content : [content];
  return parts.some((part) => {
    if (typeof part === "string") return humanText(part);
    const piece = obj(part);
    return piece !== null && typeof piece.text === "string" && piece.thought !== true && humanText(piece.text);
  });
}

/**
 * 셸 결과 글의 종료 코드. 셸 도구는 「Output: …」 뒤에 0이 아닐 때만 「Exit Code: N」 줄을 붙이고, 그 뒤에는 Signal, Background PIDs, Process Group PGID 줄만 온다.
 * 명령의 출력 안에 같은 글이 있어도 속지 않게 글 끝의 꼬리에서만 찾는다. 0이 아닌 종료 코드도 도구 상태는 success일 수 있다(소스 tools/shell.ts, scheduler/tool-executor.ts)
 */
const EXIT_CODE = /\nExit Code: (-?\d+)(?:\n(?:Signal|Background PIDs|Process Group PGID): [^\n]*)*\s*$/;
/** 정책이 막은 호출의 오류 글(소스 scheduler/policy.ts의 getPolicyDenialError) */
const POLICY_DENIAL = "Tool execution denied by policy";

/** 도구 결과(Part 목록)의 functionResponse.response에 든 글들 */
function responseTexts(result: unknown): string[] {
  const parts = Array.isArray(result) ? result : [result];
  const texts: string[] = [];
  for (const part of parts) {
    const response = obj(obj(obj(part)?.functionResponse)?.response);
    if (response === null) continue;
    for (const value of Object.values(response)) if (typeof value === "string") texts.push(value);
  }
  return texts;
}

export class GeminiSessionParser {
  private readonly days = new Map<LocalDate, DayCell>();
  /** 메시지 ID → 마지막 줄. 같은 ID가 다시 적히면 뒤의 줄이 이긴다(소스 chatRecordingService의 pushMessage). Map은 처음 나온 차례를 지킨다 */
  private readonly messages = new Map<string, Json>();
  private readonly toolIds = new Set<string>();
  /** 메시지 ID → 처음 나온 차례 */
  private readonly firstSeen = new Map<string, number>();
  /** 이력 동기화가 새 ID로 다시 적은 user 메시지(압축 요약, 남겨 둔 대화의 사본). 사람 요청으로 세지 않는다 */
  private readonly copies = new Set<string>();
  private readonly firstIds: string[] = [];
  private readonly unconfirmedTypes: Record<string, number> = nameRecord();
  private metaSessionId: string | null = null;
  private firstDate: LocalDate | null = null;
  private lines = 0;
  private brokenLines = 0;
  private tailFragments = 0;
  private tooLongLines = 0;
  private tooLongSkillLines = 0;
  private tooLongMcpLines = 0;
  private undatedLines = 0;
  private withoutId = 0;

  constructor(private readonly ctx: GeminiParserContext) {}

  /** 줄바꿈으로 끝난 줄 하나. 빈 줄은 세지 않는다 */
  line(text: string): void {
    if (text.trim() === "") return;
    this.lines++;
    const parsed = parseObject(text);
    if (parsed === null) this.missing(text, "broken");
    else this.accept(parsed);
  }

  /** 옛 꼴(.json) 파일 하나. 세션 정보와 메시지 목록이 든 JSON 한 덩어리다. 풀리지 않으면 깨진 줄 하나로 센다 */
  legacy(text: string): void {
    const parsed = parseObject(text);
    if (parsed === null) {
      this.lines++;
      this.missing(text, "broken");
      return;
    }
    const { messages, ...meta } = parsed;
    this.lines++;
    this.accept(meta);
    if (!Array.isArray(messages)) return;
    for (const message of messages) {
      this.lines++;
      const record = obj(message);
      if (record === null) {
        this.brokenLines++;
        bump(this.unconfirmedTypes, "?");
      } else this.accept(record);
    }
  }

  /** 상한을 넘은 줄 하나. found는 줄의 바이트에서 찾은 사용 흔적의 표지다 */
  tooLong(found?: ReadonlySet<string>): void {
    this.lines++;
    this.tooLongLines++;
    if (found?.has("skill")) this.tooLongSkillLines++;
    if (found?.has("mcp")) this.tooLongMcpLines++;
  }

  /** 끝 조각을 정리하고 요약을 낸다. 한 번만 부른다 */
  finish(tail: string | null, inProgress: boolean): SessionSummary {
    if (tail !== null && tail.trim() !== "") {
      this.lines++;
      const parsed = parseObject(tail);
      if (parsed !== null) this.accept(parsed);
      else this.missing(tail, inProgress ? "tail" : "broken");
    }
    for (const [id, record] of this.messages) this.count(id, record);
    const days: Record<LocalDate, DayCell> = {};
    for (const date of [...this.days.keys()].sort()) days[date] = canonicalDay(this.days.get(date)!);
    return {
      tool: "gemini",
      sessionId: this.metaSessionId ?? this.ctx.sessionId,
      kind: this.ctx.kind,
      parentSessionId: this.ctx.parentSessionId,
      cwd: this.ctx.cwd,
      // 제미나이 CLI는 세션 기록에 자기 버전을 적지 않는다
      version: null,
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
        tooLongSkillLines: this.tooLongSkillLines,
        tooLongMcpLines: this.tooLongMcpLines,
        unconfirmedTypes: sortedRecord(this.unconfirmedTypes),
      },
      firstResponseIdHashes: this.firstIds.map(fnv1a64),
      notes: { syntheticResponses: 0, responsesWithoutId: this.withoutId, undatedLines: this.undatedLines, unknownHookKinds: nameRecord() },
    };
  }

  private missing(text: string, kind: "broken" | "tail"): void {
    if (kind === "broken") this.brokenLines++;
    else this.tailFragments++;
    bump(this.unconfirmedTypes, outerTypeOf(text) ?? "?");
  }

  /** 고침 줄의 도구 결과를 이미 읽은 메시지에 얹는다(셸의 종료 코드가 결과로 나중에 붙을 수 있다). 내용 고침, 지우기, 차례 바꾸기는 세는 것을 바꾸지 않아 보지 않는다 */
  private patch(patch: Json): void {
    const single = (update: Json): void => {
      const target = this.messages.get(str(update.id) ?? "");
      if (target === undefined || !Array.isArray(update.toolCalls) || !Array.isArray(target.toolCalls)) return;
      for (const raw of update.toolCalls) {
        const change = obj(raw);
        const callId = str(change?.id);
        if (change === null || callId === null || !Object.hasOwn(change, "result")) continue;
        for (const call of target.toolCalls) {
          const shaped = obj(call);
          if (shaped !== null && shaped.id === callId) shaped.result = change.result;
        }
      }
    };
    single(patch);
    if (Array.isArray(patch.updates)) for (const update of patch.updates) if (obj(update) !== null) single(obj(update)!);
    if (Array.isArray(patch.removeIds)) this.markCopies(new Set(patch.removeIds.filter((id): id is string => typeof id === "string")));
  }

  /**
   * 압축 뒤 이력 동기화는 남길 대화를 새 ID로 다시 적고(모델 이름과 토큰이 없는 gemini 메시지와 그 앞의 user 메시지) 옛 메시지를 지우는 고침 줄(removeIds)을 붙인다.
   * 지운 메시지 가운데 마지막 것보다 뒤에 처음 나온 메시지 가운데, 바로 다음이 모델 이름도 토큰도 없는 gemini 메시지인 user 메시지가 그 사본이다(소스 geminiChat.ts의 생성자와 initialize, chatRecordingService.ts의 updateMessagesFromHistory)
   */
  private markCopies(removed: ReadonlySet<string>): void {
    let last = -1;
    for (const id of removed) last = Math.max(last, this.firstSeen.get(id) ?? -1);
    if (last < 0) return;
    const window = [...this.messages.keys()].filter((id) => !removed.has(id) && this.firstSeen.get(id)! > last);
    for (let index = 0; index < window.length - 1; index++) {
      const record = this.messages.get(window[index]!)!;
      const next = this.messages.get(window[index + 1]!)!;
      if (record.type === "user" && next.type === "gemini" && str(next.model) === null && obj(next.tokens) === null) this.copies.add(window[index]!);
    }
  }

  /** 풀린 줄 하나. 되감기·설정 줄은 세지 않는다(되감은 메시지도 사용량이 든 것이라 센다). 고침 줄은 도구 결과만 얹는다. 종류가 없는 줄은 세션 정보 줄이다 */
  private accept(record: Json): void {
    if (Object.hasOwn(record, "$patch")) {
      const patch = obj(record.$patch);
      if (patch !== null) this.patch(patch);
      return;
    }
    if (Object.hasOwn(record, "$rewindTo") || Object.hasOwn(record, "$set")) return;
    const type = str(record.type);
    if (type === null) {
      if (typeof record.sessionId === "string" && this.metaSessionId === null) this.metaSessionId = record.sessionId;
      this.noteDate(localDateOfIso(record.startTime, this.ctx.timeZone));
      return;
    }
    if (!MESSAGE_TYPES.has(type)) {
      bump(this.unconfirmedTypes, type);
      return;
    }
    const id = str(record.id);
    if (id === null) {
      // ID가 없으면 다시 적힌 것과 맞출 수 없어 따로 하나로 센다
      this.withoutId++;
      this.messages.set(`#${this.withoutId}`, record);
      return;
    }
    if (!this.firstSeen.has(id)) this.firstSeen.set(id, this.firstSeen.size);
    this.messages.set(id, record);
  }

  private noteDate(date: LocalDate | null): void {
    if (date !== null && (this.firstDate === null || date < this.firstDate)) this.firstDate = date;
  }

  private day(date: LocalDate): DayCell {
    let cell = this.days.get(date);
    if (cell === undefined) {
      cell = emptyDay();
      this.days.set(date, cell);
    }
    return cell;
  }

  private tool(day: DayCell, name: string): ToolCounts {
    let counts = day.tools[name];
    if (counts === undefined) {
      counts = emptyToolCounts();
      day.tools[name] = counts;
    }
    return counts;
  }

  private skillSignal(day: DayCell, name: string): SkillSignalCounts {
    let counts = day.skillSignals[name];
    if (counts === undefined) {
      counts = emptySkillSignalCounts();
      day.skillSignals[name] = counts;
    }
    return counts;
  }

  /** 메시지 하나(그 ID의 마지막 줄)를 날짜 칸에 센다 */
  private count(id: string, record: Json): void {
    const date = localDateOfIso(record.timestamp, this.ctx.timeZone);
    if (date === null) {
      this.undatedLines++;
      return;
    }
    this.noteDate(date);
    const day = this.day(date);
    if (record.type === "user") {
      // 하위 에이전트 세션의 user 메시지는 부모가 맡긴 일이다
      if (this.ctx.kind === "main" && !this.copies.has(id) && isHumanContent(record.content)) day.humanRequests++;
      return;
    }
    if (record.type !== "gemini") return;
    const model = str(record.model);
    const tokens = obj(record.tokens);
    // 모델 이름도 토큰도 없는 gemini 메시지는 합성 메시지다(바이너리 받음, 압축 확인, 이력 동기화의 사본). 응답으로 세지 않는다.
    // 내용이 빈 응답은 모델 이름 없이 적히지만 토큰이 붙는다(소스 geminiChat.ts의 recordSyntheticMessage, chatRecordingService.ts의 recordMessage)
    if (model !== null || tokens !== null) {
      day.responses++;
      const responseId = str(record.id);
      if (responseId !== null && this.firstIds.length < FIRST_RESPONSE_IDS) this.firstIds.push(responseId);
      if (tokens !== null) {
        // input은 promptTokenCount라 캐시된 것이 들어 있다(Gemini API usageMetadata). 캐시는 cacheRead로 따로 적는다
        day.tokens.input += num(tokens.input);
        day.tokens.cacheRead += num(tokens.cached);
        day.tokens.output += num(tokens.output);
        day.tokens.thinking += num(tokens.thoughts);
      }
      if (model !== null) bump(day.models, model);
      // 추론 강도는 기록에 남지 않는다
      day.unknownEffort++;
    }
    // 도구 호출은 마지막 gemini 메시지에 붙어 모델 이름이 없는 메시지에도 올 수 있다(소스 chatRecordingService.ts의 recordToolCalls)
    if (!Array.isArray(record.toolCalls)) return;
    for (const raw of record.toolCalls) {
      const call = obj(raw);
      if (call === null) continue;
      const callId = str(call.id);
      if (callId !== null) {
        if (this.toolIds.has(callId)) continue;
        this.toolIds.add(callId);
      }
      const name = str(call.name) ?? UNKNOWN_TOOL;
      const server = geminiMcpServerKey(name);
      // MCP 도구는 서버마다 묶어 센다(Claude Code의 mcp__<서버>와 같은 뜻)
      const counts = this.tool(day, server === null ? name : `${MCP_PREFIX}${server}`);
      counts.calls++;
      const status = str(call.status);
      const texts = responseTexts(call.result);
      if (status === "error" && texts.some((text) => text.startsWith(POLICY_DENIAL))) {
        // 정책이 막은 호출은 결과가 아니라 권한 거절이다
        counts.deniedByPermission++;
      } else if (status === "success" || status === "error") {
        counts.results++;
        const failedExit = GEMINI_SHELL_TOOLS.includes(name) && texts.some((text) => Number(EXIT_CODE.exec(text)?.[1] ?? 0) !== 0);
        if (status === "error" || failedExit) counts.errors++;
      } else if (status === "cancelled") {
        // 사용자가 거절했는지 끊었는지는 기록으로 가를 수 없다
        counts.unknownDenial++;
      }
      if (server !== null) bump(day.mcpCalls, server);
      if (name === SKILL_TOOL) {
        const skill = str(obj(call.args)?.name);
        if (skill !== null) this.skillSignal(day, skill).tool++;
      }
      if (SUBAGENT_TOOLS.has(name)) day.subagentCalls++;
    }
  }
}
