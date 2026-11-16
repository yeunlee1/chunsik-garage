// Claude Code의 user 줄이 사람 요청인지, 도구 결과인지, 세지 않을 입력인지 가르고(판별표), 끊은 표지와 슬래시 명령을 판별표와 따로 알아보며, 도구 결과의 거절 종류를 가른다(순수 함수, 설계 9.5)
export type UserVerdict =
  | { kind: "tool-result" }
  | { kind: "human"; weak: boolean }
  | { kind: "command"; name: string }
  | { kind: "skip"; reason: string };

export type DenialKind = "user" | "hook" | "interrupted" | "permission" | "unknown";

const INTERRUPT_PREFIX = "[Request interrupted by user";
/** 명령 줄. 앞머리가 <command-name> 꼬리표이거나, 앞머리의 <command-message> 꼬리표 바로 다음이 <command-name> 꼬리표다(설계 9.5) */
const COMMAND = /^(?:<command-message>[\s\S]*?<\/command-message>\s*)?<command-name>\/?([^<]*)<\/command-name>/;
const TAG = /^<([A-Za-z][\w-]*)>/;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);

export function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (isObject(block) && block.type === "text") return typeof block.text === "string" ? block.text : "";
    }
  }
  return "";
}

function hasToolResult(content: unknown): boolean {
  return Array.isArray(content) && content.some((block) => isObject(block) && block.type === "tool_result");
}

const toolInserted = (line: Json): boolean =>
  line.isMeta === true || line.isCompactSummary === true || line.isVisibleInTranscriptOnly === true;

/** 글이 명령 줄이면 명령의 이름을 낸다. */
export function commandNameOf(text: string): string | null {
  const command = COMMAND.exec(text.trimStart());
  return command === null ? null : command[1]!.trim();
}

/** 판별표의 2번부터 11번. 하위 세션인지(1번)는 보지 않는다. */
function classifyOwnUser(line: Json): UserVerdict {
  const message = isObject(line.message) ? line.message : {};
  if (hasToolResult(message.content)) return { kind: "tool-result" };
  if (toolInserted(line)) return { kind: "skip", reason: "meta" };
  if (isObject(line.origin)) {
    const kind = line.origin.kind;
    if (kind === "human") return { kind: "human", weak: false };
    return { kind: "skip", reason: `origin:${typeof kind === "string" ? kind : "?"}` };
  }
  if (line.turnOrigin === "sdk" || line.turnOrigin === "scheduled") return { kind: "skip", reason: `turn:${line.turnOrigin}` };
  const text = userText(message.content).trimStart();
  const command = commandNameOf(text);
  if (command !== null) return { kind: "command", name: command };
  const tag = TAG.exec(text);
  if (tag !== null) return { kind: "skip", reason: `tag:${tag[1]}` };
  if (text.startsWith(INTERRUPT_PREFIX)) return { kind: "skip", reason: "interrupt" };
  return { kind: "human", weak: true };
}

/** 사람 요청 판별표(설계 9.5)의 1번부터 11번. */
export function classifyUser(line: Json, isSubSession: boolean): UserVerdict {
  if (isSubSession || line.isSidechain === true) return { kind: "skip", reason: "subagent-input" };
  return classifyOwnUser(line);
}

/** 끊은 턴의 표지 줄(판별표 10번)인지. 하위 세션의 줄이어도 본다. 끊은 턴은 주 세션과 하위 세션을 합쳐 센다(설계 9.2). */
export function isInterruptMarker(line: Json): boolean {
  const verdict = classifyOwnUser(line);
  return verdict.kind === "skip" && verdict.reason === "interrupt";
}

/** 스킬 신호 3을 볼 명령의 이름. 도구 결과와 도구가 넣은 글(판별표 2·3번)이 아닌 명령 줄이면 낸다. origin과 하위 세션인지는 따지지 않는다(설계 9.2, 9.5). */
export function slashCommandOf(line: Json): string | null {
  const message = isObject(line.message) ? line.message : {};
  if (hasToolResult(message.content) || toolInserted(line)) return null;
  return commandNameOf(userText(message.content));
}

export function denialOf(line: Json): { kind: DenialKind; raw: string | null } | null {
  const kind = line.toolDenialKind;
  const decision = isObject(line.permissionDecision) ? line.permissionDecision : null;
  const rejected = decision !== null && decision.decision === "reject";
  if (kind === "user-rejected") return { kind: "user", raw: null };
  if (rejected && decision.source === "hook") return { kind: "hook", raw: null };
  if (kind === "interrupted") return { kind: "interrupted", raw: null };
  if (kind === "permission-rule" || rejected) return { kind: "permission", raw: null };
  if (typeof kind === "string" && kind !== "") return { kind: "unknown", raw: kind };
  return null;
}
