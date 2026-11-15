// Codex 세션 해석 3. 다른 기록(부모)의 앞부분을 이어받은 하위 세션에서 부모에도 있는 항목, 누적값, 응답을 다시 세지 않는 것과, 해석기가 자기 지문을 내는 것을 시험한다(설계 「5단계 계획 전 결정」 7번)
import { describe, expect, it } from "vitest";
import { CodexSessionParser, type CodexFingerprints } from "../../../src/adapters/codex/parser.ts";

const TZ = "Asia/Seoul";
const T = "2026-11-10T01:00:00Z";
const line = (type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp: T, type, payload });
const sub = () => line("session_meta", { id: "child", thread_source: "subagent", parent_thread_id: "mom" });
const item = (item: Record<string, unknown>) => line("event_msg", { type: "item_completed", item });
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: n / 10, reasoning_output_tokens: 0, total_tokens: n + n / 10 });
const count = (n: number) => line("event_msg", { type: "token_count", info: { total_token_usage: usage(n) } });
const record = (id: string, n: number, thread = n) => line("token_usage_record", { response_id: id, usage: usage(n), thread_token_usage: usage(thread) });

/** 부모 기록을 해석기에 먹여 지문을 얻는다 */
function fingerprintsOf(lines: string[]): CodexFingerprints {
  const parser = new CodexSessionParser({ recordId: "mom-record", timeZone: TZ });
  for (const text of lines) parser.line(text);
  parser.finish(null, false);
  return parser.fingerprints();
}
function run(lines: string[], inherited: CodexFingerprints | null) {
  const parser = new CodexSessionParser({ recordId: "child-record", timeZone: TZ, inherited });
  for (const text of lines) parser.line(text);
  return parser.finish(null, false);
}

const MOM = [
  line("session_meta", { id: "mom", thread_source: "user" }),
  item({ type: "UserMessage", id: "u1" }),
  item({ type: "CommandExecution", id: "x1", exit_code: 0 }),
  count(100),
  count(200),
  record("r1", 50, 250),
];

describe("이어받은 것을 다시 세지 않는다", () => {
  it("부모 기록에도 같은 item.id가 있는 항목은 하위 세션의 도구와 사람 요청에서 뺀다. 자기 항목은 센다", () => {
    const summary = run([sub(), item({ type: "UserMessage", id: "u1" }), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), item({ type: "CommandExecution", id: "x2", exit_code: 1 })], fingerprintsOf(MOM));
    const cell = summary.days["2026-11-10"]!;
    expect(cell.humanRequests).toBe(0);
    expect(cell.tools.shell).toMatchObject({ calls: 1, results: 1, errors: 1 });
    expect(summary.codex?.inheritedSkipped).toMatchObject({ items: 2 });
  });

  it("옛 구간에서 부모 기록에도 있는 누적값으로 늘어난 몫은 세지 않고, 그 뒤 부모에 없는 누적값으로 늘어난 몫만 센다", () => {
    const summary = run([sub(), count(100), count(200), count(260)], fingerprintsOf(MOM));
    expect(summary.days["2026-11-10"]).toMatchObject({ responses: 1, tokens: { input: 60, output: 6 } });
    expect(summary.codex?.inheritedSkipped).toMatchObject({ totals: 2 });
  });

  it("새 구간에서 부모 기록에도 있는 response_id의 응답은 세지 않는다", () => {
    const summary = run([sub(), record("r1", 50, 250), record("r9", 20, 270)], fingerprintsOf(MOM));
    expect(summary.days["2026-11-10"]).toMatchObject({ responses: 1, tokens: { input: 20 } });
    expect(summary.codex?.inheritedSkipped).toMatchObject({ responses: 1 });
  });

  it("부모 기록에도 있는 호출 층 호출은 턴의 층 고르기에 넣지 않는다. 이어받은 호출 때문에 이름 모름의 호출이 생기지 않는다", () => {
    const call = (id: string) => line("response_item", { type: "custom_tool_call", name: "exec", call_id: id });
    const mom = fingerprintsOf([line("session_meta", { id: "mom", thread_source: "user" }), call("c1"), item({ type: "CommandExecution", id: "x1", exit_code: 0 })]);
    const summary = run([sub(), call("c1"), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), call("c2"), item({ type: "CommandExecution", id: "x2", exit_code: 0 })], mom);
    expect(summary.days["2026-11-10"]?.tools).toEqual({ shell: expect.objectContaining({ calls: 1 }) });
  });

  it("부모의 누적값이 자기 누적값 사이에 끼면 그 값으로 기준만 옮기고 앞뒤의 자기 몫은 센다", () => {
    const mom = fingerprintsOf([line("session_meta", { id: "mom", thread_source: "user" }), count(200)]);
    const summary = run([sub(), count(100), count(200), count(300)], mom);
    expect(summary.days["2026-11-10"]).toMatchObject({ responses: 2, tokens: { input: 200 } });
  });

  it("부모의 누적값 뒤에 자기 누적값이 줄면 새로 시작된 것으로 그 값을 세고, 뒤에 새 구간이 이어지면 응답 ID로 센다", () => {
    const mom = fingerprintsOf([line("session_meta", { id: "mom", thread_source: "user" }), count(500)]);
    const summary = run([sub(), count(500), count(40), record("r7", 9, 49)], mom);
    expect(summary.days["2026-11-10"]).toMatchObject({ responses: 2, tokens: { input: 49 } });
  });

  it("누적값은 다섯 칸을 모두 견준다. 캐시 쓰기만 다른 누적값은 부모의 것이 아니다", () => {
    const total = (write: number) => line("event_msg", { type: "token_count", info: { total_token_usage: { ...usage(100), cache_write_input_tokens: write } } });
    const mom = fingerprintsOf([line("session_meta", { id: "mom", thread_source: "user" }), total(0)]);
    expect(run([sub(), total(1)], mom).days["2026-11-10"]).toMatchObject({ responses: 1, tokens: { cacheWrite: 1 } });
  });

  it("복사된 앞부분(이어받아 뺀 도구·사람 요청·호출·누적값·응답의 마지막 줄까지) 안에서 뺄 지문에 없는 누적값을 세면 기준을 찾지 못한 기록이다", () => {
    const missing = run([sub(), item({ type: "UserMessage", id: "u1" }), count(150), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), count(400)], fingerprintsOf(MOM));
    expect(missing.codex?.baselineMissing).toBe(true);
    const found = run([sub(), item({ type: "UserMessage", id: "u1" }), count(100), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), count(400)], fingerprintsOf(MOM));
    expect(found.codex?.baselineMissing).toBe(false);
    const weakOnly = run([sub(), count(150), item({ type: "AgentMessage", id: "a1" }), count(400)], fingerprintsOf([...MOM, item({ type: "AgentMessage", id: "a1" })]));
    expect(weakOnly.codex?.baselineMissing).toBe(false);
    expect(run([sub(), count(150)], null).codex?.baselineMissing).toBe(false);
  });

  it("이어받아 뺀 호출 층 호출과 응답도 복사된 앞부분의 끝이다. 그보다 앞에서 뺄 지문에 없는 누적값을 세면 기준을 찾지 못한 기록이다", () => {
    const call = line("response_item", { type: "function_call", name: "x", call_id: "c1" });
    expect(run([sub(), count(150), call], fingerprintsOf([...MOM, call])).codex?.baselineMissing).toBe(true);
    expect(run([sub(), count(150), record("r1", 50, 250)], fingerprintsOf(MOM)).codex?.baselineMissing).toBe(true);
  });

  it("부모 누적값으로 기준을 옮긴 뒤 처음 센 자기 누적값도, 그 뒤에 이어받은 항목이 있으면 기준을 찾지 못한 기록이다", () => {
    const summary = run([sub(), count(100), count(150), item({ type: "CommandExecution", id: "x1", exit_code: 0 })], fingerprintsOf(MOM));
    expect(summary.codex?.baselineMissing).toBe(true);
  });

  it("지문을 받지 않으면 다 센다(부모가 없거나 부모 기록을 읽지 못한 세션)", () => {
    const summary = run([sub(), item({ type: "UserMessage", id: "u1" }), count(100), count(200)], null);
    expect(summary.days["2026-11-10"]).toMatchObject({ humanRequests: 1, responses: 2, tokens: { input: 200 } });
    expect(summary.codex?.inheritedSkipped).toEqual({ items: 0, totals: 0, responses: 0 });
  });
});

describe("지문", () => {
  it("해석기는 자기 기록의 item.id, 누적값, response_id의 지문을 낸다. 원문이 아니라 해시다", () => {
    const prints = fingerprintsOf(MOM);
    expect(prints.itemIds.size).toBe(2);
    expect(prints.totals.size).toBe(2);
    expect(prints.responseIds.size).toBe(1);
    for (const value of [...prints.itemIds, ...prints.totals, ...prints.responseIds]) expect(value).toMatch(/^[0-9a-f]{16}$/);
  });

  it("이어받아 뺀 것은 자기 지문에도 넣는다(손자 세션이 같은 앞부분을 다시 이어받을 수 있다)", () => {
    const parser = new CodexSessionParser({ recordId: "child-record", timeZone: TZ, inherited: fingerprintsOf(MOM) });
    for (const text of [sub(), item({ type: "UserMessage", id: "u1" }), item({ type: "CommandExecution", id: "x2", exit_code: 0 })]) parser.line(text);
    parser.finish(null, false);
    expect(parser.fingerprints().itemIds.size).toBe(2);
  });

  it("이어받아 뺀 응답 ID와 누적값도 자기 지문에 넣는다", () => {
    const parser = new CodexSessionParser({ recordId: "child-record", timeZone: TZ, inherited: fingerprintsOf(MOM) });
    for (const text of [sub(), count(100), record("r1", 50, 250)]) parser.line(text);
    parser.finish(null, false);
    expect(parser.fingerprints().responseIds.size).toBe(1);
    expect(parser.fingerprints().totals.size).toBe(1);
  });
});
