// 시험에 쓰는 합성 Claude Code 기록 줄을 만든다. 필드 이름만 실제 기록(설계 부록 A)을 따르고 값은 지어낸 것이다
import { ClaudeSessionParser } from "../../src/adapters/claude/parser.ts";
import type { SessionKind, SessionSummary } from "../../src/adapters/types.ts";

export interface UsageInput {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  thinking?: number;
}

export function assistant(o: {
  id: string;
  at: string;
  model?: string;
  effort?: string;
  stop?: string | null;
  usage?: UsageInput;
  content?: unknown[];
  version?: string;
  cwd?: string;
  skill?: string;
  mcpServer?: string;
}): string {
  const usage =
    o.usage === undefined
      ? undefined
      : {
          input_tokens: o.usage.input ?? 0,
          output_tokens: o.usage.output ?? 0,
          cache_read_input_tokens: o.usage.cacheRead ?? 0,
          cache_creation_input_tokens: o.usage.cacheWrite ?? 0,
          output_tokens_details: { thinking_tokens: o.usage.thinking ?? 0 },
        };
  // 실제 기록처럼 맨 바깥 type을 본문 뒤에 둔다
  return JSON.stringify({
    parentUuid: null,
    cwd: o.cwd ?? "C:/work/proj",
    sessionId: "s1",
    version: o.version ?? "2.1.300",
    message: { id: o.id, type: "message", role: "assistant", model: o.model ?? "claude-test", content: o.content ?? [], stop_reason: o.stop ?? null, usage },
    ...(o.effort === undefined ? {} : { effort: o.effort }),
    ...(o.skill === undefined ? {} : { attributionSkill: o.skill }),
    ...(o.mcpServer === undefined ? {} : { attributionMcpServer: o.mcpServer }),
    type: "assistant",
    timestamp: o.at,
  });
}

export function user(o: { at: string; content: unknown; origin?: string; extra?: Record<string, unknown> }): string {
  return JSON.stringify({
    type: "user",
    ...(o.origin === undefined ? {} : { origin: { kind: o.origin } }),
    message: { role: "user", content: o.content },
    timestamp: o.at,
    ...o.extra,
  });
}

export function toolUse(id: string, name: string, input: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: "tool_use", id, name, input };
}

export function toolResult(toolUseId: string, isError = false): Record<string, unknown> {
  return { type: "tool_result", tool_use_id: toolUseId, is_error: isError, content: "result" };
}

export function attachment(at: string, body: Record<string, unknown>): string {
  return JSON.stringify({ type: "attachment", attachment: body, timestamp: at });
}

export function system(at: string, subtype: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: "system", subtype, timestamp: at, ...extra });
}

export function parseLines(
  lines: string[],
  options: { kind?: SessionKind; tail?: string | null; inProgress?: boolean; timeZone?: string } = {},
): SessionSummary {
  const kind = options.kind ?? "main";
  const parser = new ClaudeSessionParser({
    sessionId: "s1",
    kind,
    parentSessionId: kind === "sub" ? "parent" : null,
    timeZone: options.timeZone ?? "UTC",
  });
  for (const text of lines) parser.line(text);
  return parser.finish(options.tail ?? null, options.inProgress ?? false);
}
