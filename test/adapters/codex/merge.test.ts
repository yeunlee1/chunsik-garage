// 한 논리 세션의 기록 파일 여럿(대화를 되돌려 생긴 기록 등)의 요약을 하나로 합치는 것을 시험한다(설계 9.2, 「5단계 계획 전 결정」 7번)
import { describe, expect, it } from "vitest";
import { mergeRecords } from "../../../src/adapters/codex/merge.ts";
import { CodexSessionParser } from "../../../src/adapters/codex/parser.ts";
import { reviveSummary } from "../../../src/adapters/types.ts";

const line = (timestamp: string, type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp, type, payload });
const item = (timestamp: string, it: Record<string, unknown>) => line(timestamp, "event_msg", { type: "item_completed", item: it });
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: n + 1 });
const record = (timestamp: string, id: string, n: number) => line(timestamp, "token_usage_record", { response_id: id, usage: usage(n), thread_token_usage: usage(n) });
function parse(recordId: string, lines: string[]) {
  const parser = new CodexSessionParser({ recordId, timeZone: "Asia/Seoul" });
  for (const text of lines) parser.line(text);
  return parser.finish(null, false);
}

const D1 = "2026-11-09T01:00:00Z";
const D2 = "2026-11-10T01:00:00Z";
const ORIGINAL = parse("s1", [
  line(D1, "session_meta", { id: "s1", cwd: "C:/work", cli_version: "0.150.0", thread_source: "user" }),
  line(D1, "world_state", { state: { agents_md: { text: "abcd" } } }),
  line(D1, "turn_context", { model: "m1", effort: "high" }),
  record(D1, "r1", 10),
  item(D1, { type: "UserMessage", id: "u1" }),
  item(D1, { type: "Zeta", id: "z1" }),
  item(D2, { type: "CommandExecution", id: "x1", exit_code: 1 }),
  record(D2, "r2", 20),
  "{broken",
]);
const REVERTED = parse("r-2", [
  line(D2, "session_meta", { id: "s1", cwd: "C:/elsewhere", cli_version: "0.166.0", thread_source: "user", history_base: {} }),
  line(D2, "world_state", { state: { agents_md: { text: "zz" } } }),
  line(D2, "turn_context", { model: "m2" }),
  record(D2, "r9", 7),
  item(D2, { type: "UserMessage", id: "u9" }),
  item(D2, { type: "Alpha", id: "a9" }),
  item(D2, { type: "McpToolCall", id: "m9", server: "github", status: "failed" }),
  item(D2, { type: "CommandExecution", id: "x9", exit_code: 0 }),
]);

describe("같은 세션의 기록 파일 합치기", () => {
  it("기록이 하나면 그대로다", () => {
    expect(mergeRecords([ORIGINAL])).toBe(ORIGINAL);
  });

  it("정체(세션 ID, 주·하위, 작업 폴더, 지침)와 기록 파일 식별자는 식별자가 세션 ID와 같은 원래 기록의 것이다. 버전은 가장 높은 것, 가장 이른 날짜는 가장 이른 것이다", () => {
    const merged = mergeRecords([REVERTED, ORIGINAL]);
    expect(merged).toMatchObject({ tool: "codex", sessionId: "s1", kind: "main", parentSessionId: null, cwd: "C:/work", version: "0.166.0", firstDate: "2026-11-09", instructionChars: { ascii: 4, other: 0 } });
    expect(merged.codex).toMatchObject({ recordId: "s1", unknownThreadSource: null, idFallback: null });
  });

  it("가장 이른 날짜는 원래 기록보다 다른 기록이 더 일러도 가장 이른 것이다", () => {
    const later = parse("s1", [line(D2, "session_meta", { id: "s1", cli_version: "0.150.0", thread_source: "user" }), record(D2, "r1", 10)]);
    const earlier = parse("r-0", [line(D1, "session_meta", { id: "s1", cli_version: "0.140.0", thread_source: "user" })]);
    expect(mergeRecords([later, earlier])).toMatchObject({ firstDate: "2026-11-09", version: "0.150.0", codex: { recordId: "s1" } });
  });

  it("날짜 칸의 수는 더한다(응답, 토큰, 사람 요청, 도구, 모델, 추론 강도, MCP 호출)", () => {
    const merged = mergeRecords([ORIGINAL, REVERTED]);
    expect(merged.days["2026-11-09"]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 10 }, models: { m1: 1 }, efforts: { high: 1 } });
    const later = merged.days["2026-11-10"]!;
    expect(later).toMatchObject({ responses: 2, humanRequests: 1, tokens: { input: 27, output: 2 }, models: { m1: 1, m2: 1 }, efforts: { high: 1 }, unknownEffort: 1, mcpCalls: { github: 1 } });
    expect(later.tools.shell).toMatchObject({ calls: 2, results: 2, errors: 1 });
    expect(later.tools.mcp__github).toMatchObject({ calls: 1, results: 1, errors: 1 });
  });

  it("빠진 것, 알림의 수, 정체 모를 종류, 이어받아 뺀 수를 더한다", () => {
    const merged = mergeRecords([ORIGINAL, REVERTED]);
    expect(merged.missing).toEqual({ lines: ORIGINAL.missing.lines + REVERTED.missing.lines, brokenLines: 1, tailFragments: 0, tooLongLines: 0, tooLongMcpLines: 0, unconfirmedTypes: { "?": 1 } });
    expect(merged.codex?.unknownItemTypes).toEqual({ Alpha: 1, Zeta: 1 });
    expect(merged.codex?.inheritedSkipped).toEqual({ items: 0, totals: 0, responses: 0 });
  });

  it("날짜를 몰라 세지 못한 줄의 수와 캐시 쓰기 토큰도 더한다. 기준을 찾지 못한 기록이 하나라도 있으면 그렇다고 남긴다", () => {
    const untimed = (id: string) => JSON.stringify({ type: "token_usage_record", payload: { response_id: id, usage: usage(1), thread_token_usage: usage(1) } });
    const written = (id: string, n: number) => line(D1, "token_usage_record", { response_id: id, usage: { ...usage(1), cache_write_input_tokens: n }, thread_token_usage: usage(1) });
    const head = JSON.stringify({ type: "session_meta", payload: { id: "s1", thread_source: "user" } });
    const a = parse("s1", [head, untimed("u1"), written("w1", 2)]);
    const b = parse("r-9", [head, untimed("u2"), written("w2", 3)]);
    const merged = mergeRecords([a, b]);
    expect(merged.notes.undatedLines).toBe(2);
    expect(merged.days["2026-11-09"]?.tokens.cacheWrite).toBe(5);
    expect(merged.codex?.baselineMissing).toBe(false);
    expect(mergeRecords([a, { ...b, codex: { ...b.codex!, baselineMissing: true } }]).codex?.baselineMissing).toBe(true);
  });

  it("넣은 차례와 상관없이 같은 요약이고, 캐시에서 되살린 것과 JSON 글이 같다(열쇠 차례가 정해져 있다)", () => {
    const a = mergeRecords([ORIGINAL, REVERTED]);
    const b = mergeRecords([REVERTED, ORIGINAL]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(reviveSummary(JSON.parse(JSON.stringify(a))))).toBe(JSON.stringify(a));
  });

  it("구간 밖의 기록(outside)은 정체·기록 파일 식별자·버전·가장 이른 날짜에만 쓰고 수는 더하지 않는다", () => {
    const merged = mergeRecords([REVERTED], [ORIGINAL]);
    expect(merged).toMatchObject({ sessionId: "s1", cwd: "C:/work", instructionChars: { ascii: 4, other: 0 }, codex: { recordId: "s1" } });
    expect(mergeRecords([ORIGINAL], [REVERTED]).version).toBe("0.166.0");
    expect(merged.firstDate).toBe("2026-11-09");
    expect(merged.days).toEqual(mergeRecords([REVERTED]).days);
    expect(merged.missing.brokenLines).toBe(REVERTED.missing.brokenLines);
    expect(mergeRecords([REVERTED], [])).toBe(REVERTED);
  });

  it("구간 밖 원래 기록의 정체 모를 출처, 주·하위, 부모도 합친 정체에 쓴다", () => {
    const original = parse("s1", [line(D1, "session_meta", { id: "s1", thread_source: "future-source" })]);
    const inside = parse("r-9", [line(D2, "session_meta", { id: "s1", thread_source: "user" }), record(D2, "r9", 7)]);
    expect(mergeRecords([inside], [original]).codex?.unknownThreadSource).toBe("future-source");
    const subOriginal = parse("s1", [line(D1, "session_meta", { id: "s1", thread_source: "subagent", parent_thread_id: "mom" })]);
    expect(mergeRecords([inside], [subOriginal])).toMatchObject({ kind: "sub", parentSessionId: "mom" });
  });

  it("원래 기록이 없으면 기록 파일 식별자 차례로 첫 기록의 정체를 쓴다. 합친 요약은 넣은 요약을 바꾸지 않는다", () => {
    const other = parse("r-1", [line(D1, "session_meta", { id: "s1", cwd: "C:/first", cli_version: "0.140.0", thread_source: "user" })]);
    const before = JSON.stringify(REVERTED);
    const merged = mergeRecords([REVERTED, other]);
    expect(merged).toMatchObject({ cwd: "C:/first", version: "0.166.0", codex: { recordId: "r-1" } });
    expect(JSON.stringify(REVERTED)).toBe(before);
  });
});
