// Codex 세션 해석 1. 세션의 정체(session_meta의 id, cwd, 버전, thread_source, parent_thread_id), 토큰 구간(옛 구간의 누적값 차분, 새 구간의 response_id, 넘어가는 자리), 날짜 칸, 깨진 줄을 시험한다(설계 9.2, 9.6, 「5단계 계획 전 결정」 1·7번)
import { describe, expect, it } from "vitest";
import { CodexSessionParser } from "../../../src/adapters/codex/parser.ts";

const TZ = "Asia/Seoul";
const RECORD = "019a0000-0000-7000-8000-0000000000aa";
const usage = (input: number, cached: number, output: number, reasoning: number, write = 0) => ({ input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: write, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output });
const meta = (payload: Record<string, unknown>, timestamp = "2026-11-10T00:00:00Z") => JSON.stringify({ timestamp, type: "session_meta", payload });
const count = (total: ReturnType<typeof usage>, timestamp = "2026-11-10T01:00:00Z") => JSON.stringify({ timestamp, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: total, last_token_usage: total } } });
const record = (responseId: string, use: ReturnType<typeof usage>, thread: ReturnType<typeof usage>, timestamp = "2026-11-10T02:00:00Z") => JSON.stringify({ timestamp, type: "token_usage_record", ordinal: 1, payload: { response_id: responseId, usage: use, thread_token_usage: thread } });
function run(lines: string[]) {
  const parser = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
  for (const line of lines) parser.line(line);
  return parser.finish(null, false);
}
const day = (summary: ReturnType<typeof run>, date: string) => summary.days[date]!;

describe("세션의 정체", () => {
  it("session_meta에서 세션 ID, 작업 폴더, 버전(앞선 버전 꼬리를 뗌)을 정하고 user는 주 세션이다", () => {
    const summary = run([meta({ id: "sess-1", cwd: "C:/work", cli_version: "0.140.0-alpha.19", thread_source: "user" })]);
    expect(summary).toMatchObject({ tool: "codex", sessionId: "sess-1", kind: "main", parentSessionId: null, cwd: "C:/work", version: "0.140.0" });
    expect(summary.codex).toMatchObject({ recordId: RECORD, unknownThreadSource: null, idFallback: null });
  });

  it("subagent, guardian_review, memory_consolidation은 하위 세션이고 부모는 parent_thread_id다. 부모 열쇠가 글자가 아니면 부모를 모른다", () => {
    for (const source of ["subagent", "guardian_review", "memory_consolidation"]) {
      expect(run([meta({ id: "s", thread_source: source, parent_thread_id: "parent-1" })])).toMatchObject({ kind: "sub", parentSessionId: "parent-1" });
    }
    expect(run([meta({ id: "s", thread_source: "subagent", parent_thread_id: 7 })])).toMatchObject({ kind: "sub", parentSessionId: null });
  });

  it("그 밖의 값과 열쇠가 없는 옛 기록은 정체 모름이라 주 세션으로 세고 그 값을 남긴다. 부모는 null이다", () => {
    expect(run([meta({ id: "s", thread_source: "vscode", parent_thread_id: "p" })])).toMatchObject({ kind: "main", parentSessionId: null, codex: { unknownThreadSource: "vscode" } });
    expect(run([meta({ id: "s" })])).toMatchObject({ kind: "main", codex: { unknownThreadSource: "(없음)" } });
  });

  it("첫 물리적 줄로만 정체를 정한다. 첫 줄이 session_meta가 아니거나, 깨졌거나, 너무 길면 뒤의 session_meta를 쓰지 않고 기록 파일 식별자를 세션 ID로 대신 쓰며 까닭을 적는다", () => {
    expect(run([count(usage(10, 0, 5, 0)), meta({ id: "late" })])).toMatchObject({ sessionId: RECORD, kind: "main", codex: { idFallback: "first-line-not-meta" } });
    expect(run(["{broken", meta({ id: "late", thread_source: "subagent", parent_thread_id: "p" })])).toMatchObject({ sessionId: RECORD, kind: "main", parentSessionId: null, codex: { idFallback: "first-line-unreadable" } });
    const long = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
    long.tooLong();
    long.line(meta({ id: "late" }));
    expect(long.finish(null, false)).toMatchObject({ sessionId: RECORD, codex: { idFallback: "first-line-unreadable" } });
  });

  it("첫 줄의 session_meta에 id가 없으면 기록 파일 식별자를 대신 쓰되 나머지 정체는 그 줄에서 정한다. 줄이 하나도 없으면 그렇다고 적는다. 줄바꿈 없는 끝 조각도 첫 줄이 될 수 있다", () => {
    expect(run([meta({ cwd: "C:/w", thread_source: "subagent", parent_thread_id: "p" })])).toMatchObject({ sessionId: RECORD, cwd: "C:/w", kind: "sub", parentSessionId: "p", codex: { idFallback: "meta-without-id" } });
    expect(run([])).toMatchObject({ sessionId: RECORD, codex: { idFallback: "no-lines" } });
    const tailOnly = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
    expect(tailOnly.finish(meta({ id: "t" }), false)).toMatchObject({ sessionId: "t", codex: { idFallback: null } });
  });

  it("버전은 기록에 적힌 session_meta 가운데 가장 높은 것이다. 낮아지거나 읽지 못하는 버전은 바꾸지 않고, 정체는 첫 줄의 것 그대로다", () => {
    expect(run([meta({ id: "s", cli_version: "0.160.0" }), meta({ id: "s", cli_version: "0.166.0-alpha.2" })]).version).toBe("0.166.0");
    expect(run([meta({ id: "s", cli_version: "0.99.0" }), meta({ id: "s", cli_version: "0.100.0" })]).version).toBe("0.100.0");
    expect(run([meta({ id: "s", cli_version: "0.166.0" }), meta({ id: "s", cli_version: "0.150.0" }), meta({ id: "s", cli_version: "nightly" })]).version).toBe("0.166.0");
    expect(run([meta({ id: "s", cwd: "C:/first" }), meta({ id: "other", cwd: "C:/second" })])).toMatchObject({ sessionId: "s", cwd: "C:/first" });
  });
});

describe("토큰 구간", () => {
  it("옛 구간은 누적값이 직전보다 커진 만큼 칸마다 더하고, 커진 것 하나를 응답 하나로 센다. 같으면 0이다", () => {
    const summary = run([meta({ id: "s", thread_source: "user" }), count(usage(100, 40, 10, 4)), count(usage(100, 40, 10, 4)), count(usage(160, 70, 25, 9, 3))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 160, cacheRead: 70, cacheWrite: 3, output: 25, thinking: 9 } });
  });

  it("옛 구간에서 누적값이 줄면 새로 시작된 것으로 보고 그 값을 더한다", () => {
    const summary = run([meta({ id: "s" }), count(usage(100, 0, 10, 0)), count(usage(30, 0, 3, 0))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 130, output: 13 } });
  });

  it("누적값의 칸 하나만 줄어도(캐시 읽기만 줄어도) 새로 시작된 것으로 보고 그 값을 더한다", () => {
    const summary = run([meta({ id: "s" }), count(usage(100, 40, 10, 0)), count(usage(120, 10, 12, 0))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 220, cacheRead: 50 } });
  });

  it("응답 ID는 글자 그대로 가른다. 대소문자가 다르면 다른 응답이다", () => {
    const summary = run([meta({ id: "s" }), record("rA", usage(5, 0, 1, 0), usage(5, 0, 1, 0)), record("ra", usage(7, 0, 1, 0), usage(12, 0, 2, 0))]);
    expect(day(summary, "2026-11-10").responses).toBe(2);
  });

  it("새 구간은 token_usage_record를 response_id로 한 번씩 센다. 그 뒤의 token_count는 쓰지 않는다", () => {
    const summary = run([meta({ id: "s" }), record("r1", usage(50, 20, 5, 1), usage(50, 20, 5, 1)), record("r1", usage(50, 20, 5, 1), usage(50, 20, 5, 1)), count(usage(999, 0, 999, 0)), record("r2", usage(30, 10, 4, 2), usage(80, 30, 9, 3))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 80, cacheRead: 30, output: 9, thinking: 3 } });
  });

  it("넘어가는 자리. 새 구간 첫 기록의 누적값이 옛 구간에서 마지막으로 센 것보다 크면 센다", () => {
    const summary = run([meta({ id: "s" }), count(usage(100, 0, 10, 0)), record("r1", usage(20, 0, 2, 0), usage(120, 0, 12, 0))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 120, output: 12 } });
  });

  it("넘어가는 자리. 같으면 옛 구간에서 이미 센 응답이라 세지 않는다", () => {
    const summary = run([meta({ id: "s" }), count(usage(100, 0, 10, 0)), record("r1", usage(100, 0, 10, 0), usage(100, 0, 10, 0)), record("r2", usage(5, 0, 1, 0), usage(105, 0, 11, 0))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 105, output: 11 } });
  });

  it("넘어가는 자리. 작으면 누적이 새로 시작된 것이라 센다. 옛 구간이 없으면 견주지 않고 센다", () => {
    const smaller = run([meta({ id: "s" }), count(usage(100, 0, 10, 0)), record("r1", usage(7, 0, 1, 0), usage(7, 0, 1, 0))]);
    expect(day(smaller, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 107, output: 11 } });
    const fresh = run([meta({ id: "s" }), record("r1", usage(7, 0, 1, 0), usage(500, 0, 50, 0))]);
    expect(day(fresh, "2026-11-10")).toMatchObject({ responses: 1, tokens: { input: 7, output: 1 } });
  });
});

describe("날짜 칸과 깨진 줄", () => {
  it("응답은 줄의 시각을 현지 날짜로 바꾼 칸에 든다. 시각이 없는 줄은 종류와 상관없이 바로 앞 줄의 날짜를 쓰고, 가장 이른 날짜도 종류와 상관없이 모든 줄에서 고른다(1단계와 같다)", () => {
    const untimed = (n: number) => JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage(n, 0, n / 10, 0) } } });
    const summary = run([
      meta({ id: "s" }),
      count(usage(10, 0, 1, 0), "2026-11-10T14:59:00Z"),
      count(usage(20, 0, 2, 0), "2026-11-10T15:01:00Z"),
      JSON.stringify({ timestamp: "2026-11-12T01:00:00Z", type: "turn_context", payload: { model: "m" } }),
      untimed(30),
      JSON.stringify({ timestamp: "2026-11-09T10:00:00Z", type: "world_state", payload: {} }),
      untimed(40),
    ]);
    expect(Object.fromEntries(Object.entries(summary.days).map(([date, cell]) => [date, cell.responses]))).toEqual({ "2026-11-09": 1, "2026-11-10": 1, "2026-11-11": 1, "2026-11-12": 1 });
    expect(summary.notes.undatedLines).toBe(0);
    expect(summary.firstDate).toBe("2026-11-09");
  });

  it("앞의 줄이 모두 시각이 없을 때만 날짜를 몰라 세지 못한 줄로 센다. 세는 줄(응답)만 그렇게 세고, 그 밖의 줄은 시각이 없어도 세지 않는다", () => {
    const raw = (type: string, payload: Record<string, unknown>) => JSON.stringify({ type, payload });
    const summary = run([
      raw("session_meta", { id: "s", thread_source: "user" }),
      raw("turn_context", { model: "m" }),
      raw("world_state", {}),
      raw("event_msg", { type: "token_count", info: { total_token_usage: usage(10, 0, 1, 0) } }),
      raw("token_usage_record", { response_id: "r1", usage: usage(5, 0, 1, 0), thread_token_usage: usage(15, 0, 2, 0) }),
      record("r2", usage(7, 0, 1, 0), usage(22, 0, 3, 0)),
    ]);
    expect(summary.notes.undatedLines).toBe(2);
    expect(summary.firstDate).toBe("2026-11-10");
    expect(summary.days).toEqual({ "2026-11-10": expect.objectContaining({ responses: 1, tokens: expect.objectContaining({ input: 7, output: 1 }) }) });
  });

  it("풀리지 않는 줄과 상한을 넘은 줄을 센다. 쓰는 중인 파일의 풀리지 않는 끝은 끝 조각이고, 아니면 깨진 줄이다(1단계와 같다). 빈 줄은 세지 않는다", () => {
    const parser = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
    parser.line(meta({ id: "s" }));
    parser.line("{not json");
    parser.line("   ");
    parser.tooLong();
    expect(parser.finish('{"type":"event_msg"', true).missing).toMatchObject({ lines: 4, brokenLines: 1, tooLongLines: 1, tailFragments: 1 });
    const done = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
    done.line(meta({ id: "s" }));
    expect(done.finish('{"type":"event_msg"', false).missing).toMatchObject({ lines: 2, brokenLines: 1, tailFragments: 0 });
  });
});
