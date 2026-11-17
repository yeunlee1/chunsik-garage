// 제미나이 CLI 세션 기록(JSONL)을 날짜별 세션 요약으로 바꾸는 것을 시험한다. 줄의 모양은 공개 소스 v0.68.0의 chatRecordingTypes.ts·chatRecordingService.ts를 따른 합성 기록이다(설계 「0.4.0에서 정한 것」)
import { describe, expect, it } from "vitest";
import { GEMINI_PARSER_VERSION, GeminiSessionParser, type GeminiParserContext } from "../../../src/adapters/gemini/parser.ts";

const ctx = (input: Partial<GeminiParserContext> = {}): GeminiParserContext => ({ sessionId: "file-id", kind: "main", parentSessionId: null, cwd: "c:/work/app", timeZone: "Asia/Seoul", ...input });
const meta = (input: Record<string, unknown> = {}) => JSON.stringify({ sessionId: "s-1", projectHash: "app", startTime: "2026-11-10T01:00:00.000Z", lastUpdated: "2026-11-10T01:10:00.000Z", kind: "main", ...input });
const user = (id: string, timestamp: string, content: unknown) => JSON.stringify({ id, timestamp, type: "user", content });
const gemini = (id: string, timestamp: string, extra: Record<string, unknown> = {}) => JSON.stringify({ id, timestamp, type: "gemini", content: "", model: "gemini-3-pro", ...extra });
const call = (id: string, name: string, status: string, args: Record<string, unknown> = {}) => ({ id, name, args, status, timestamp: "2026-11-10T01:00:05.000Z" });
const tokens = { input: 1000, output: 200, cached: 600, thoughts: 50, tool: 0, total: 1250 };

function parse(lines: string[], context = ctx()) {
  const parser = new GeminiSessionParser(context);
  for (const line of lines) parser.line(line);
  return parser.finish(null, false);
}

describe("GeminiSessionParser", () => {
  it("해석 버전이 있다. 짝 검토 2·3차 반영으로 세는 법이 바뀌어 2로 올렸다(이전 후보의 캐시를 쓰지 않게, 짝 검토 3차 필수 3)", () => {
    expect(GEMINI_PARSER_VERSION).toBe(2);
  });

  it("사람 요청, 응답, 토큰, 모델, 도구 호출과 결과·오류·취소를 날짜 칸에 센다. 입력 토큰은 캐시를 포함한 값 그대로 두고 캐시는 따로 적는다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", [{ text: "이 버그 고쳐 줘" }]),
      gemini("g1", "2026-11-10T01:00:04.000Z", {
        tokens,
        toolCalls: [call("t1", "read_file", "success", { file_path: "a.ts" }), call("t2", "replace", "error"), call("t3", "run_shell_command", "error", { command: "npm test" }), call("t4", "write_file", "cancelled")],
      }),
    ]);
    expect(summary.tool).toBe("gemini");
    expect(summary.sessionId).toBe("s-1");
    expect(summary.cwd).toBe("c:/work/app");
    expect(summary.version).toBeNull();
    const day = summary.days["2026-11-10"]!;
    expect([day.humanRequests, day.responses]).toEqual([1, 1]);
    expect(day.tokens).toEqual({ input: 1000, cacheRead: 600, cacheWrite: 0, output: 200, thinking: 50 });
    expect(day.models).toEqual({ "gemini-3-pro": 1 });
    expect(day.tools["read_file"]).toMatchObject({ calls: 1, results: 1, errors: 0 });
    expect(day.tools["replace"]).toMatchObject({ calls: 1, results: 1, errors: 1 });
    expect(day.tools["run_shell_command"]).toMatchObject({ calls: 1, results: 1, errors: 1 });
    expect(day.tools["write_file"]).toMatchObject({ calls: 1, results: 0, errors: 0, unknownDenial: 1 });
  });

  it("같은 메시지 ID가 다시 적히면 마지막 줄의 값으로 한 번만 센다(토큰과 도구 상태가 나중에 붙는다)", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", "고쳐 줘"),
      gemini("g1", "2026-11-10T01:00:04.000Z", { toolCalls: [call("t1", "read_file", "executing")] }),
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens, toolCalls: [call("t1", "read_file", "success")] }),
    ]);
    const day = summary.days["2026-11-10"]!;
    expect([day.humanRequests, day.responses, day.tokens.input]).toEqual([1, 1, 1000]);
    expect(day.tools["read_file"]).toMatchObject({ calls: 1, results: 1 });
  });

  it("도구 결과, 슬래시·물음표 명령, 세션·훅 맥락, 빈 메시지는 사람 요청이 아니다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", [{ functionResponse: { id: "t1", name: "read_file", response: { output: "x" } } }]),
      user("u2", "2026-11-10T01:00:02.000Z", "/stats"),
      user("u3", "2026-11-10T01:00:03.000Z", [{ text: "?help" }]),
      user("u4", "2026-11-10T01:00:04.000Z", [{ text: "<session_context>\n이 프로젝트는…" }]),
      user("u5", "2026-11-10T01:00:05.000Z", [{ text: "<hook_context>x" }]),
      user("u6", "2026-11-10T01:00:06.000Z", [{ text: "   " }]),
      user("u7", "2026-11-10T01:00:07.000Z", [{ text: "진짜 요청" }]),
      user("u8", "2026-11-10T01:00:08.000Z", [{ text: "<state_snapshot>\n요약" }]),
      // 훅 맥락은 요청 뒤에 붙는다(소스 core/client.ts)
      user("u9", "2026-11-10T01:00:09.000Z", [{ text: "둘째 요청" }, { text: "<hook_context>x</hook_context>" }]),
    ]);
    expect(summary.days["2026-11-10"]!.humanRequests).toBe(2);
  });

  it("정책이 막은 호출(error와 정책 거절 글)은 결과가 아니라 권한 거절이다", () => {
    const denied = { ...call("t1", "run_shell_command", "error", { command: "rm -rf x" }), result: [{ functionResponse: { id: "t1", name: "run_shell_command", response: { error: "Tool execution denied by policy. 막힌 명령" } } }] };
    const summary = parse([meta(), user("u1", "2026-11-10T01:00:01.000Z", "지워 줘"), gemini("g1", "2026-11-10T01:00:04.000Z", { tokens, toolCalls: [denied] })]);
    expect(summary.days["2026-11-10"]!.tools["run_shell_command"]).toMatchObject({ calls: 1, results: 0, errors: 0, deniedByPermission: 1 });
  });

  it("셸 도구는 상태가 success여도 결과 글 끝의 Exit Code가 0이 아니면 오류다. 명령 출력 안의 같은 글에는 속지 않는다", () => {
    const shell = (id: string, output: string) => ({ ...call(id, "run_shell_command", "success", { command: "npm test" }), result: [{ functionResponse: { id, name: "run_shell_command", response: { output } } }] });
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", "시험 돌려 줘"),
      gemini("g1", "2026-11-10T01:00:04.000Z", {
        tokens,
        toolCalls: [
          shell("t1", "Output: 2 failed\nExit Code: 1\nProcess Group PGID: 77"),
          shell("t2", "Output: 앞 단계 Exit Code: 3\nExit Code: 2 (출력 안의 글)\n끝"),
          shell("t3", "Output: ok"),
        ],
      }),
    ]);
    expect(summary.days["2026-11-10"]!.tools["run_shell_command"]).toMatchObject({ calls: 3, results: 3, errors: 1 });
  });

  it("셸 결과 글이 untrusted_context로 감싸져 있어도 끝의 종료 코드를 읽는다(짝 검토 2차 필수 1)", () => {
    const shell = (id: string, output: string) => ({ ...call(id, "run_shell_command", "success", { command: "npm test" }), result: [{ functionResponse: { id, name: "run_shell_command", response: { output } } }] });
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", "시험 돌려 줘"),
      gemini("g1", "2026-11-10T01:00:04.000Z", {
        tokens,
        toolCalls: [
          shell("t1", "<untrusted_context>\nOutput: 2 failed\nExit Code: 1\nProcess Group PGID: 77\n</untrusted_context>"),
          shell("t2", '<untrusted_context source="shell">\nOutput: x\nExit Code: 127\n</untrusted_context>'),
          shell("t3", "<untrusted_context>\nOutput: 앞 단계 Exit Code: 3\n&lt;/untrusted_context&gt;\n</untrusted_context>"),
          shell("t4", "<untrusted_context>\nOutput: ok\n</untrusted_context>"),
        ],
      }),
    ]);
    expect(summary.days["2026-11-10"]!.tools["run_shell_command"]).toMatchObject({ calls: 4, results: 4, errors: 2 });
  });

  it("옛 전체 이력 체크포인트($set.messages)의 메시지도 같은 ID로 한 번만 센다(짝 검토 2차 필수 5)", () => {
    const summary = parse([
      meta(),
      JSON.stringify({ $set: { messages: [JSON.parse(user("u1", "2026-11-10T01:00:01.000Z", "요청")), JSON.parse(gemini("g1", "2026-11-10T01:00:04.000Z", { tokens }))] } }),
      // 체크포인트 뒤에 같은 메시지가 다시 적혀도 두 번 세지 않는다
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens }),
      JSON.stringify({ $set: { lastUpdated: "2026-11-10T01:10:00.000Z" } }),
    ]);
    const day = summary.days["2026-11-10"]!;
    expect([day.humanRequests, day.responses, day.tokens.input]).toEqual([1, 1, 1000]);
    expect(summary.missing.brokenLines).toBe(0);
  });

  it("고침 줄($patch)이 나중에 붙인 도구 결과를 읽는다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", "빌드해 줘"),
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens, toolCalls: [call("t1", "run_shell_command", "success", { command: "make" })] }),
      JSON.stringify({ $patch: { updates: [{ id: "g1", toolCalls: [{ id: "t1", result: [{ functionResponse: { id: "t1", name: "run_shell_command", response: { output: "Output: x\nExit Code: 2" } } }] }] }] } }),
    ]);
    expect(summary.days["2026-11-10"]!.tools["run_shell_command"]).toMatchObject({ calls: 1, results: 1, errors: 1 });
  });

  it("모델 이름도 토큰도 없는 gemini 메시지는 응답이 아니다. 모델 이름 없이 토큰만 붙은 빈 응답은 응답이고, 모델 이름 없는 메시지의 도구 호출도 센다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", "그림 봐 줘"),
      JSON.stringify({ id: "g1", timestamp: "2026-11-10T01:00:02.000Z", type: "gemini", content: "Binary received" }),
      JSON.stringify({ id: "g2", timestamp: "2026-11-10T01:00:03.000Z", type: "gemini", content: "", tokens }),
      JSON.stringify({ id: "g3", timestamp: "2026-11-10T01:00:04.000Z", type: "gemini", content: "", toolCalls: [call("t1", "read_file", "success")] }),
    ]);
    const day = summary.days["2026-11-10"]!;
    expect([day.responses, day.tokens.input, day.unknownEffort]).toEqual([1, 1000, 1]);
    expect(day.models).toEqual({});
    expect(day.tools["read_file"]).toMatchObject({ calls: 1, results: 1 });
  });

  it("압축 뒤 이력 동기화가 새 ID로 다시 적은 요약과 남겨 둔 대화는 사람 요청과 응답으로 다시 세지 않는다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", [{ text: "첫 요청" }]),
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens }),
      user("u2", "2026-11-10T01:01:01.000Z", [{ text: "둘째 요청" }]),
      gemini("g2", "2026-11-10T01:01:04.000Z", { tokens }),
      // 압축: 요약(user)과 확인(gemini), 남겨 둔 대화의 사본이 새 ID로 적히고, 옛 메시지를 지우는 고침 줄이 붙는다
      JSON.stringify({ id: "s1", timestamp: "2026-11-10T01:02:00.000Z", type: "user", content: [{ text: "이제까지의 일: 첫 요청과 둘째 요청을 처리함" }] }),
      JSON.stringify({ id: "s2", timestamp: "2026-11-10T01:02:00.001Z", type: "gemini", content: [{ text: "Got it. Thanks for the additional context!" }] }),
      JSON.stringify({ id: "k1", timestamp: "2026-11-10T01:02:00.002Z", type: "user", content: [{ text: "둘째 요청" }] }),
      JSON.stringify({ id: "k2", timestamp: "2026-11-10T01:02:00.003Z", type: "gemini", content: [{ text: "답" }] }),
      JSON.stringify({ $patch: { removeIds: ["u1", "g1", "u2", "g2"], orderIds: ["s1", "s2", "k1", "k2"] } }),
      user("u3", "2026-11-10T01:03:01.000Z", [{ text: "셋째 요청" }]),
      gemini("g3", "2026-11-10T01:03:04.000Z", { tokens }),
    ]);
    const day = summary.days["2026-11-10"]!;
    expect([day.humanRequests, day.responses]).toEqual([3, 3]);
  });

  it("압축할 이력이 응답 없는 요청으로 끝나 그 요청의 사본이 맨 끝에 와도 다시 세지 않는다(짝 검토 2차 필수 4)", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", [{ text: "첫 요청" }]),
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens }),
      user("u2", "2026-11-10T01:01:01.000Z", [{ text: "응답을 못 받은 요청" }]),
      JSON.stringify({ id: "s1", timestamp: "2026-11-10T01:02:00.000Z", type: "user", content: [{ text: "이제까지의 일" }] }),
      JSON.stringify({ id: "s2", timestamp: "2026-11-10T01:02:00.001Z", type: "gemini", content: [{ text: "Got it. Thanks for the additional context!" }] }),
      JSON.stringify({ id: "k1", timestamp: "2026-11-10T01:02:00.002Z", type: "user", content: [{ text: "응답을 못 받은 요청" }] }),
      JSON.stringify({ $patch: { removeIds: ["u1", "g1", "u2"], orderIds: ["s1", "s2", "k1"] } }),
    ]);
    expect(summary.days["2026-11-10"]!.humanRequests).toBe(2);
  });

  it("남겨 둔 대화에 사람 요청이 이어져 있어도(다음이 합성 응답이 아니어도) 지운 요청과 글이 같은 사본은 다시 세지 않는다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", [{ text: "첫 요청" }]),
      user("u2", "2026-11-10T01:00:02.000Z", [{ text: "이어 붙인 요청" }]),
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens }),
      JSON.stringify({ id: "k1", timestamp: "2026-11-10T01:02:00.002Z", type: "user", content: [{ text: "첫 요청" }] }),
      JSON.stringify({ id: "k2", timestamp: "2026-11-10T01:02:00.003Z", type: "user", content: [{ text: "이어 붙인 요청" }] }),
      JSON.stringify({ id: "k3", timestamp: "2026-11-10T01:02:00.004Z", type: "gemini", content: [{ text: "답" }] }),
      JSON.stringify({ $patch: { removeIds: ["u1", "u2", "g1"] } }),
    ]);
    expect(summary.days["2026-11-10"]!.humanRequests).toBe(2);
  });

  it("압축이 아닌 이력 고침(지우기)에서는 지운 요청과 글이 같은 새 요청도 그대로 센다(짝 검토 3차 필수 1)", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", [{ text: "계속해 줘" }]),
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens }),
      user("u2", "2026-11-10T01:05:01.000Z", [{ text: "계속해 줘" }]),
      gemini("g2", "2026-11-10T01:05:04.000Z", { tokens }),
      JSON.stringify({ $patch: { removeIds: ["u1", "g1"] } }),
    ]);
    expect(summary.days["2026-11-10"]!.humanRequests).toBe(2);
  });

  it("지우는 고침 줄 뒤라도 모델 이름이 있는 응답이 따르는 user 메시지는 그대로 사람 요청이다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", "옛 요청"),
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens }),
      user("u2", "2026-11-10T01:01:01.000Z", "남은 요청"),
      gemini("g2", "2026-11-10T01:01:04.000Z", { tokens }),
      JSON.stringify({ $patch: { removeIds: ["u1", "g1"] } }),
    ]);
    expect(summary.days["2026-11-10"]!.humanRequests).toBe(2);
  });

  it("MCP 도구는 mcp_ 뒤 첫 마디를 서버 이름으로 세고, activate_skill은 스킬 사용, invoke_agent는 하위 에이전트 호출로 센다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", "찾아 줘"),
      gemini("g1", "2026-11-10T01:00:04.000Z", { tokens, toolCalls: [call("t1", "mcp_github_create_issue", "success"), call("t2", "mcp_github_list_issues", "success"), call("t3", "activate_skill", "success", { name: "pdf" }), call("t4", "invoke_agent", "success")] }),
    ]);
    const day = summary.days["2026-11-10"]!;
    expect(day.mcpCalls).toEqual({ github: 2 });
    expect(day.skillSignals["pdf"]).toMatchObject({ tool: 1 });
    expect(day.subagentCalls).toBe(1);
  });

  it("되감기·고침·설정 줄은 세지 않고 깨진 것으로도 보지 않는다. 깨진 줄과 모르는 메시지 종류는 확인하지 못한 조각으로 센다", () => {
    const summary = parse([
      meta(),
      user("u1", "2026-11-10T01:00:01.000Z", "a"),
      JSON.stringify({ $rewindTo: "u1" }),
      JSON.stringify({ $patch: { id: "u1", content: "b" } }),
      JSON.stringify({ $set: { memoryScratchpad: { version: 1 } } }),
      '{"id":"x","type":"gemini",',
      JSON.stringify({ id: "y", timestamp: "2026-11-10T01:00:09.000Z", type: "tool_group" }),
    ]);
    expect(summary.missing.lines).toBe(7);
    expect(summary.missing.brokenLines).toBe(1);
    expect(summary.missing.unconfirmedTypes).toEqual({ gemini: 1, tool_group: 1 });
    // 되감은 메시지도 사용량이 든 것이라 센다
    expect(summary.days["2026-11-10"]!.humanRequests).toBe(1);
  });

  it("하위 에이전트 세션의 user 메시지는 사람 요청이 아니다. 응답과 토큰은 센다", () => {
    const summary = parse([meta({ kind: "subagent" }), user("u1", "2026-11-10T01:00:01.000Z", "부모가 맡긴 일"), gemini("g1", "2026-11-10T01:00:04.000Z", { tokens })], ctx({ kind: "sub", parentSessionId: "parent-1" }));
    const day = summary.days["2026-11-10"]!;
    expect([summary.kind, summary.parentSessionId, day.humanRequests, day.responses]).toEqual(["sub", "parent-1", 0, 1]);
  });

  it("날짜는 메시지 시각의 현지 날짜다. 가장 이른 날짜와 처음 응답 ID의 지문을 낸다", () => {
    const summary = parse([meta(), user("u1", "2026-11-10T14:59:00.000Z", "a"), gemini("g1", "2026-11-10T15:01:00.000Z", { tokens })]);
    expect(Object.keys(summary.days)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(summary.firstDate).toBe("2026-11-10");
    expect(summary.days["2026-11-11"]!.responses).toBe(1);
    expect(summary.firstResponseIdHashes).toHaveLength(1);
  });

  it("너무 긴 줄은 세고, 찾은 표지를 지표마다 센다", () => {
    const parser = new GeminiSessionParser(ctx());
    parser.tooLong(new Set(["mcp"]));
    parser.tooLong(new Set(["skill", "mcp"]));
    parser.tooLong(new Set());
    const missing = parser.finish(null, false).missing;
    expect([missing.lines, missing.tooLongLines, missing.tooLongSkillLines, missing.tooLongMcpLines]).toEqual([3, 3, 1, 2]);
  });

  it("옛 꼴(.json)은 세션 정보와 메시지 목록이 든 덩어리 하나로 읽는다. 풀리지 않으면 깨진 줄 하나다", () => {
    const parser = new GeminiSessionParser(ctx());
    parser.legacy(JSON.stringify({ ...JSON.parse(meta({ sessionId: "old-1" })), messages: [JSON.parse(user("u1", "2026-11-10T01:00:01.000Z", "a")), JSON.parse(gemini("g1", "2026-11-10T01:00:04.000Z", { tokens })), 3] }));
    const summary = parser.finish(null, false);
    expect(summary.sessionId).toBe("old-1");
    expect([summary.days["2026-11-10"]!.humanRequests, summary.days["2026-11-10"]!.responses]).toEqual([1, 1]);
    expect([summary.missing.lines, summary.missing.brokenLines]).toEqual([4, 1]);
    const broken = new GeminiSessionParser(ctx());
    broken.legacy("{not json");
    expect(broken.finish(null, false).missing).toMatchObject({ lines: 1, brokenLines: 1 });
  });

  it("세션 정보 줄이 없으면 파일의 식별자를 세션 ID로 쓴다. 끝의 줄바꿈 없는 조각도 풀리면 센다", () => {
    const parser = new GeminiSessionParser(ctx());
    parser.line(user("u1", "2026-11-10T01:00:01.000Z", "a"));
    const summary = parser.finish(gemini("g1", "2026-11-10T01:00:04.000Z", { tokens }), false);
    expect(summary.sessionId).toBe("file-id");
    expect(summary.days["2026-11-10"]!.responses).toBe(1);
  });
});
