// Codex 세션 해석 2. 도구(실행 층의 이름별 호출·결과·오류, 턴마다 호출 층과 실행 층 가운데 큰 쪽), 정체 모를 항목 종류, 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기, 시각이 없는 세는 줄을 시험한다(설계 9.6, 9.7)
import { describe, expect, it } from "vitest";
import { CodexSessionParser } from "../../../src/adapters/codex/parser.ts";

const TZ = "Asia/Seoul";
const T = "2026-11-10T01:00:00Z";
const line = (type: string, payload: Record<string, unknown>, timestamp = T) => JSON.stringify({ timestamp, type, payload });
const meta = () => line("session_meta", { id: "s", thread_source: "user" });
const item = (item: Record<string, unknown>, timestamp = T) => line("event_msg", { type: "item_completed", item }, timestamp);
const started = () => line("event_msg", { type: "task_started", turn_id: "t" });
const completed = () => line("event_msg", { type: "task_complete", turn_id: "t" });
const call = (name: string, timestamp = T) => line("response_item", { type: "custom_tool_call", name, call_id: `c-${name}` }, timestamp);
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: n + 1 });
const record = (id: string, n: number) => line("token_usage_record", { response_id: id, usage: usage(n), thread_token_usage: usage(n) });
function run(lines: string[]) {
  const parser = new CodexSessionParser({ recordId: "r", timeZone: TZ });
  for (const text of lines) parser.line(text);
  return parser.finish(null, false);
}
const day = (lines: string[]) => run(lines).days["2026-11-10"]!;

describe("도구", () => {
  it("실행 층의 종류를 공통 이름으로 세고, 상태를 보는 종류만 결과와 오류를 낸다(셸은 0이 아닌 종료 코드, 파일 고치기와 MCP 호출은 failed)", () => {
    const tools = day([
      meta(),
      item({ type: "CommandExecution", id: "1", exit_code: 0, status: "completed" }),
      item({ type: "CommandExecution", id: "2", exit_code: 2, status: "failed" }),
      item({ type: "FileChange", id: "3", status: "completed" }),
      item({ type: "FileChange", id: "4", status: "failed" }),
      item({ type: "McpToolCall", id: "5", server: "github", status: "completed" }),
      item({ type: "ImageView", id: "6" }),
      item({ type: "WebSearch", id: "7" }),
      item({ type: "Extension", id: "8" }),
    ]).tools;
    expect(tools.shell).toMatchObject({ calls: 2, results: 2, errors: 1 });
    expect(tools.file_change).toMatchObject({ calls: 2, results: 2, errors: 1 });
    expect(tools.mcp__github).toMatchObject({ calls: 1, results: 1, errors: 0 });
    expect(tools.image_view).toMatchObject({ calls: 1, results: 0, errors: 0 });
    expect(tools.web_search).toMatchObject({ calls: 1, results: 0 });
    expect(tools.extension).toMatchObject({ calls: 1, results: 0 });
  });

  it("턴마다 호출 층이 실행 층보다 많으면 그 차이를 이름 모름(?)의 호출로 더한다. 실행 층이 많거나 같으면 실행 층만이다", () => {
    const more = day([meta(), started(), call("apply_patch"), call("shell"), call("shell"), item({ type: "CommandExecution", id: "1", exit_code: 0 }), item({ type: "FileChange", id: "2", status: "completed" }), completed()]).tools;
    expect(more.shell!.calls + more.file_change!.calls + (more["?"]?.calls ?? 0)).toBe(3);
    expect(more["?"]).toMatchObject({ calls: 1, results: 0 });
    const fewer = day([meta(), started(), call("shell"), item({ type: "CommandExecution", id: "1", exit_code: 0 }), item({ type: "CommandExecution", id: "2", exit_code: 0 }), completed()]).tools;
    expect(fewer.shell!.calls).toBe(2);
    expect(fewer["?"]).toBeUndefined();
  });

  it("턴 밖의 사건은 한 묶음으로 같은 방법을 쓴다", () => {
    const tools = day([meta(), call("a"), call("b"), item({ type: "CommandExecution", id: "1", exit_code: 0 })]).tools;
    expect(tools.shell!.calls + (tools["?"]?.calls ?? 0)).toBe(2);
  });

  it("정체 모를 항목 종류는 도구 수에 넣지 않고 종류별로 센다. 도구가 아닌 종류는 세지 않는다", () => {
    const summary = run([meta(), item({ type: "Teleport", id: "1" }), item({ type: "Teleport", id: "2" }), item({ type: "AgentMessage", id: "3" }), item({ type: "Reasoning", id: "4" }), item({ type: "ContextCompaction", id: "5" })]);
    expect(summary.days["2026-11-10"]?.tools ?? {}).toEqual({});
    expect(summary.codex?.unknownItemTypes).toEqual({ Teleport: 2 });
  });
});

describe("도구 묶음의 날짜와 경계", () => {
  it("날짜를 넘는 턴은 이름 모름의 호출을 날짜 차례로, 그날 호출 층이 실행 층보다 많은 만큼까지 그날에 나눈다", () => {
    const summary = run([meta(), started(), call("a", "2026-11-11T14:59:00Z"), call("b", "2026-11-11T15:01:00Z"), completed()]);
    expect(summary.days["2026-11-11"]?.tools["?"]).toMatchObject({ calls: 1 });
    expect(summary.days["2026-11-12"]?.tools["?"]).toMatchObject({ calls: 1 });
    const mixed = run([meta(), started(), call("a", "2026-11-11T14:59:00Z"), item({ type: "CommandExecution", id: "1", exit_code: 0 }, "2026-11-11T14:59:30Z"), call("b", "2026-11-11T15:01:00Z"), call("c", "2026-11-11T15:02:00Z"), completed()]);
    expect(mixed.days["2026-11-11"]?.tools["?"]).toBeUndefined();
    expect(mixed.days["2026-11-12"]?.tools["?"]).toMatchObject({ calls: 2 });
  });

  it("날짜마다 나눈 이름 모름의 합은 턴 전체에서 호출 층이 실행 층보다 많은 만큼이다. 호출 층이 많은 날과 실행 층이 많은 날이 따로 있어도 넘지 않는다", () => {
    const summary = run([meta(), started(), call("a", "2026-11-11T14:58:00Z"), call("b", "2026-11-11T14:59:00Z"), item({ type: "CommandExecution", id: "1", exit_code: 0 }, "2026-11-11T15:01:00Z"), completed()]);
    expect(summary.days["2026-11-11"]?.tools["?"]).toMatchObject({ calls: 1 });
    expect(summary.days["2026-11-12"]?.tools["?"]).toBeUndefined();
    expect(summary.days["2026-11-12"]?.tools.shell).toMatchObject({ calls: 1 });
    const calls = Object.values(summary.days).reduce((sum, cell) => sum + Object.values(cell.tools).reduce((inner, tool) => inner + tool.calls, 0), 0);
    expect(calls).toBe(2);
  });

  it("턴이 세 날짜를 넘으면 남은 차이를 이른 날짜부터 나눈다", () => {
    const summary = run([meta(), started(), call("a", "2026-11-10T01:00:00Z"), call("b", "2026-11-11T01:00:00Z"), item({ type: "CommandExecution", id: "1", exit_code: 0 }, "2026-11-12T01:00:00Z"), completed()]);
    expect(summary.days["2026-11-10"]?.tools["?"]).toMatchObject({ calls: 1 });
    expect(summary.days["2026-11-11"]?.tools["?"]).toBeUndefined();
    expect(summary.days["2026-11-12"]?.tools.shell).toMatchObject({ calls: 1 });
  });

  it("날짜를 몰라 세지 못한 호출은 이름 모름의 호출로 다시 세지 않는다", () => {
    const raw = (type: string, payload: Record<string, unknown>) => JSON.stringify({ type, payload });
    const summary = run([raw("session_meta", { id: "s", thread_source: "user" }), raw("response_item", { type: "custom_tool_call", name: "x", call_id: "u1" }), call("y")]);
    expect(summary.notes.undatedLines).toBe(1);
    expect(summary.days["2026-11-10"]?.tools["?"]).toMatchObject({ calls: 1 });
  });

  it("호출 층은 function_call, custom_tool_call, web_search_call 셋이다", () => {
    for (const type of ["function_call", "custom_tool_call", "web_search_call"]) {
      const tools = day([meta(), line("response_item", { type, name: "x", call_id: `c-${type}` })]).tools;
      expect(tools["?"], type).toMatchObject({ calls: 1 });
    }
  });

  it("턴 시작은 도구 묶음을 닫는다. 턴 밖의 호출과 다음 턴의 실행을 한 묶음으로 상쇄하지 않는다", () => {
    const tools = day([meta(), call("a"), started(), item({ type: "CommandExecution", id: "1", exit_code: 0 }), completed()]).tools;
    expect(tools["?"]).toMatchObject({ calls: 1 });
    expect(tools.shell).toMatchObject({ calls: 1 });
  });
});

describe("시각이 없는 줄", () => {
  const raw = (type: string, payload: Record<string, unknown>) => JSON.stringify({ type, payload });
  const bare = (item: Record<string, unknown>) => raw("event_msg", { type: "item_completed", item });

  it("시각이 없는 사람 요청, 도구, 끊은 턴, 압축은 바로 앞 줄의 날짜 칸에 든다(1단계와 같다)", () => {
    const cell = day([meta(), bare({ type: "UserMessage", id: "u1" }), bare({ type: "CommandExecution", id: "x1", exit_code: 1 }), raw("event_msg", { type: "turn_aborted", turn_id: "t" }), raw("compacted", {})]);
    expect(cell).toMatchObject({ humanRequests: 1, interruptedTurns: 1, autoCompactions: 1 });
    expect(cell.tools.shell).toMatchObject({ calls: 1, results: 1, errors: 1 });
  });

  it("앞의 줄이 모두 시각이 없으면 사람 요청, 도구, 호출 층, 끊은 턴, 압축의 줄을 날짜를 몰라 세지 못한 줄로 센다. 도구가 아닌 종류와 정체 모를 종류는 세지 않는다", () => {
    const summary = run([
      raw("session_meta", { id: "s", thread_source: "user" }),
      bare({ type: "AgentMessage", id: "a1" }),
      bare({ type: "Teleport", id: "t1" }),
      bare({ type: "UserMessage", id: "u1" }),
      raw("response_item", { type: "custom_tool_call", name: "shell", call_id: "c1" }),
      bare({ type: "CommandExecution", id: "x1", exit_code: 0 }),
      raw("event_msg", { type: "turn_aborted", turn_id: "t" }),
      raw("compacted", {}),
      item({ type: "UserMessage", id: "u2" }),
    ]);
    expect(summary.notes.undatedLines).toBe(5);
    expect(summary.days).toEqual({ "2026-11-10": expect.objectContaining({ humanRequests: 1, tools: {}, interruptedTurns: 0, autoCompactions: 0 }) });
  });
});

describe("그 밖의 지표", () => {
  it("사람 요청은 UserMessage다", () => {
    expect(day([meta(), item({ type: "UserMessage", id: "u1" }), item({ type: "UserMessage", id: "u2" })]).humanRequests).toBe(2);
  });

  it("turn_context의 모델과 추론 강도를 그 창(앞 턴이 끝난 뒤부터 이 턴이 끝날 때까지)의 응답에 붙인다. 창에서 문맥보다 앞에 온 응답에도 붙이고, 강도가 없으면 모르는 강도로 센다", () => {
    const cell = day([meta(), record("r0", 5), line("turn_context", { model: "gpt-6.1-sol", effort: "xhigh" }), record("r1", 10), record("r2", 20), line("turn_context", { model: "gpt-6.1-sol" }), record("r3", 30)]);
    expect(cell.models).toEqual({ "gpt-6.1-sol": 4 });
    expect(cell.efforts).toEqual({ xhigh: 3 });
    expect(cell.unknownEffort).toBe(1);
  });

  it("문맥은 턴이 끝나면 닫힌다. 다음 창에 문맥이 없으면 앞 턴의 모델과 강도를 쓰지 않고 모르는 것으로 센다. 턴 시작 앞에 온 문맥은 그 턴의 것이다", () => {
    const cell = day([
      meta(),
      started(),
      line("turn_context", { model: "m", effort: "high" }),
      record("r1", 10),
      completed(),
      started(),
      record("r2", 20),
      completed(),
      line("turn_context", { model: "m", effort: "low" }),
      started(),
      record("r3", 30),
      completed(),
    ]);
    expect(cell.efforts).toEqual({ high: 1, low: 1 });
    expect(cell.unknownEffort).toBe(1);
    expect(cell.models).toEqual({ m: 2 });
  });
  it("창에서 문맥보다 앞에 온 응답이 같은 날에 여럿이면 하나하나 그 창의 문맥을 붙인다", () => {
    const cell = day([meta(), record("r1", 10), record("r2", 10), line("turn_context", { model: "m", effort: "high" })]);
    expect(cell.models).toEqual({ m: 2 });
    expect(cell.efforts).toEqual({ high: 2 });
    expect(cell.unknownEffort).toBe(0);
  });

  it("같은 창의 새 문맥에 모델이 없으면 앞 문맥의 모델을 이어 쓰지 않는다", () => {
    const cell = day([meta(), line("turn_context", { model: "m", effort: "high" }), record("r1", 10), line("turn_context", { effort: "low" }), record("r2", 10)]);
    expect(cell.models).toEqual({ m: 1 });
    expect(cell.efforts).toEqual({ high: 1, low: 1 });
  });

  it("compacted는 압축으로, turn_aborted는 끊은 턴으로 센다", () => {
    const cell = day([meta(), line("compacted", {}), line("event_msg", { type: "turn_aborted", turn_id: "t" })]);
    expect(cell).toMatchObject({ autoCompactions: 1, interruptedTurns: 1 });
  });

  it("MCP 호출은 McpToolCall의 server로 센다", () => {
    expect(day([meta(), item({ type: "McpToolCall", id: "1", server: "github", status: "completed" }), item({ type: "McpToolCall", id: "2", server: "github", status: "completed" })]).mcpCalls).toEqual({ github: 2 });
  });

  it("지침 크기는 world_state의 agents_md 글자 수다(아스키와 그 밖으로 나눠 센다). 처음 것만 쓴다", () => {
    const summary = run([meta(), line("world_state", { state: { agents_md: { text: "ab가" } } }), line("world_state", { state: { agents_md: { text: "zzzz" } } })]);
    expect(summary.instructionChars).toEqual({ ascii: 2, other: 1 });
  });
});
