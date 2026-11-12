// 줄 해석의 응답·토큰·날짜·깨진 줄 규약을 시험한다(설계 9.4, 9.5, 21.1 반례)
import { describe, expect, it } from "vitest";
import { ClaudeSessionParser } from "../../../src/adapters/claude/parser.ts";
import { assistant, parseLines } from "../../helpers/claude-lines.ts";

const D1 = "2026-11-11";

describe("응답과 토큰", () => {
  it("같은 응답 ID의 뒤 줄에서 사용량이 커지면 마지막 값으로 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, usage: { input: 3, output: 10, cacheRead: 100 } }),
      assistant({ id: "m1", at: `${D1}T10:00:01Z`, usage: { input: 3, output: 50, cacheRead: 100, thinking: 20 } }),
    ]);
    const day = s.days[D1]!;
    expect(day.responses).toBe(1);
    expect(day.tokens).toEqual({ input: 3, cacheRead: 100, cacheWrite: 0, output: 50, thinking: 20 });
  });
  it("응답의 날짜는 그 응답 ID가 처음 나온 줄의 시각이다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: "2026-11-11T23:59:59Z", usage: { output: 1 } }),
      assistant({ id: "m1", at: "2026-11-12T00:00:01Z", usage: { output: 2 } }),
    ]);
    expect(s.days["2026-11-11"]!.responses).toBe(1);
    expect(s.days["2026-11-12"]?.responses ?? 0).toBe(0);
    expect(s.days["2026-11-11"]!.tokens.output).toBe(2);
  });
  it("<synthetic> 응답은 응답과 토큰에서 빼고 따로 센다", () => {
    const s = parseLines([assistant({ id: "m1", at: `${D1}T10:00:00Z`, model: "<synthetic>", usage: { output: 5 } })]);
    expect(s.days[D1]?.responses ?? 0).toBe(0);
    expect(s.notes.syntheticResponses).toBe(1);
  });
  it("추론 강도, 모델, 길이 제한으로 끊긴 응답을 응답마다 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, effort: "xhigh", model: "claude-a", stop: "max_tokens" }),
      assistant({ id: "m2", at: `${D1}T10:00:01Z`, model: "claude-a" }),
    ]);
    const day = s.days[D1]!;
    expect(day.efforts).toEqual({ xhigh: 1 });
    expect(day.unknownEffort).toBe(1);
    expect(day.models).toEqual({ "claude-a": 2 });
    expect(day.lengthStops).toBe(1);
  });
  it("스킬 귀속과 MCP 귀속은 응답마다 한 번 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, skill: "s-x", mcpServer: "srv" }),
      assistant({ id: "m1", at: `${D1}T10:00:01Z`, skill: "s-x", mcpServer: "srv" }),
    ]);
    expect(s.days[D1]!.skillSignals["s-x"]).toEqual({ tool: 0, attribution: 1, slash: 0, injected: 0 });
    expect(s.days[D1]!.mcpAttributions).toEqual({ srv: 1 });
  });
  it("기본 속성과 같은 이름도 숫자로 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, model: "constructor", skill: "toString", mcpServer: "__proto__" }),
      assistant({ id: "m2", at: `${D1}T10:00:01Z`, model: "constructor" }),
    ]);
    const day = s.days[D1]!;
    expect(day.models["constructor"]).toBe(2);
    expect(day.skillSignals["toString"]!.attribution).toBe(1);
    expect(day.mcpAttributions["__proto__"]).toBe(1);
    const back = JSON.parse(JSON.stringify(s)) as typeof s;
    expect(Object.keys(back.days[D1]!.mcpAttributions)).toEqual(["__proto__"]);
  });
  it("버전은 날짜와 상관없이 기록 전체에서 가장 높은 것이다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: "2026-09-01T10:00:00Z", version: "2.1.300" }),
      assistant({ id: "m2", at: `${D1}T10:00:00Z`, version: "2.1.99" }),
    ]);
    expect(s.version).toBe("2.1.300");
  });
  it("가장 이른 날짜는 세지 않는 종류의 줄도 보고, 그 줄로 날짜 칸을 만들지는 않는다", () => {
    const s = parseLines([
      '{"type":"api-request","timestamp":"2026-10-20T05:00:00Z"}',
      '{"type":"ai-title","title":"x"}',
      assistant({ id: "m1", at: `${D1}T10:00:00Z` }),
    ]);
    expect(s.firstDate).toBe("2026-10-20");
    expect(Object.keys(s.days)).toEqual([D1]);
  });
  it("시각이 없는 줄은 종류와 상관없이 앞 줄의 날짜를 쓴다. 세지 않는 줄로 날짜 칸을 만들지는 않는다", () => {
    const undated = (id: string): string => JSON.stringify({ type: "assistant", message: { id, model: "claude-test", content: [] } });
    const first = parseLines(['{"type":"api-request","timestamp":"2026-11-11T05:00:00Z"}', undated("m1")]);
    expect(first.days[D1]!.responses).toBe(1);
    expect(first.notes.undatedLines).toBe(0);
    const second = parseLines([
      assistant({ id: "m0", at: `${D1}T10:00:00Z` }),
      '{"type":"api-request","timestamp":"2026-11-12T05:00:00Z"}',
      undated("m1"),
    ]);
    expect(second.days[D1]!.responses).toBe(1);
    expect(second.days["2026-11-12"]!.responses).toBe(1);
    const alone = parseLines(['{"type":"api-request","timestamp":"2026-11-12T05:00:00Z"}']);
    expect(Object.keys(alone.days)).toEqual([]);
    const none = parseLines([undated("m1")]);
    expect(none.notes.undatedLines).toBe(1);
  });
  it("버전은 가장 높은 것, 작업 폴더는 처음 것이다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, version: "2.1.250", cwd: "C:/a" }),
      assistant({ id: "m2", at: `${D1}T10:00:01Z`, version: "2.1.300", cwd: "C:/b" }),
    ]);
    expect(s.version).toBe("2.1.300");
    expect(s.cwd).toBe("C:/a");
  });
  it("처음 응답 ID 스무 개의 지문만 남긴다", () => {
    const lines = Array.from({ length: 25 }, (_, i) => assistant({ id: `m${i}`, at: `${D1}T10:00:00Z` }));
    const s = parseLines(lines);
    expect(s.firstResponseIdHashes).toHaveLength(20);
    expect(s.firstResponseIdHashes[0]).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("깨진 줄과 끝 조각", () => {
  it("맨 바깥 type을 읽을 수 있는 깨진 줄은 그 종류로 센다", () => {
    const s = parseLines(['{"type":"system","subtype":"compact_boun']);
    expect(s.missing.brokenLines).toBe(1);
    expect(s.missing.unconfirmedTypes).toEqual({ system: 1 });
  });
  it("모든 줄을 풀어 본다. 중괄호로 시작하고 끝나도 풀리지 않으면 깨진 줄이다", () => {
    const s = parseLines(['{"message":{"content":[{"type":"tool_use","name":"Skill"}]}', '{"type":"brand-new-type","payload":}']);
    expect(s.missing.brokenLines).toBe(2);
    expect(s.missing.unconfirmedTypes).toEqual({ "?": 1, "brand-new-type": 1 });
  });
  it("줄 수는 빈 줄(공백만 있는 줄 포함)을 뺀 줄에 너무 긴 줄과 끝 조각을 더한 것이다. 빈 줄은 깨진 줄도 아니다", () => {
    const parser = new ClaudeSessionParser({ sessionId: "s", kind: "main", parentSessionId: null, timeZone: "UTC" });
    parser.line("");
    parser.line("   ");
    parser.line(assistant({ id: "m1", at: `${D1}T10:00:00Z` }));
    parser.line("{broken");
    parser.tooLong();
    const s = parser.finish('{"type":"user"', true);
    expect(s.missing).toMatchObject({ lines: 4, brokenLines: 1, tooLongLines: 1, tailFragments: 1 });
  });
  it("종류를 읽지 못하는 깨진 줄은 종류가 ?다", () => {
    const s = parseLines(['{"parentUuid":null,"message":{"content":"tex']);
    expect(s.missing.brokenLines).toBe(1);
    expect(s.missing.unconfirmedTypes).toEqual({ "?": 1 });
  });
  it("관계없는 종류의 온전한 줄은 세지 않는다", () => {
    const s = parseLines(['{"type":"ai-title","title":"x"}']);
    expect(s.missing.brokenLines).toBe(0);
    expect(Object.keys(s.days)).toEqual([]);
  });
  it("진행 중인 파일의 풀리지 않는 끝 조각은 덜 쓴 끝 조각이다", () => {
    const fragment = assistant({ id: "m9", at: `${D1}T10:00:00Z` }).slice(0, 40);
    const s = parseLines([], { tail: fragment, inProgress: true });
    expect(s.missing.tailFragments).toBe(1);
    expect(s.missing.brokenLines).toBe(0);
    expect(s.missing.unconfirmedTypes).toEqual({ "?": 1 });
  });
  it("진행 중이 아닌 파일의 풀리지 않는 끝 조각은 깨진 줄이다", () => {
    const s = parseLines([], { tail: '{"type":"user","mess', inProgress: false });
    expect(s.missing.brokenLines).toBe(1);
    expect(s.missing.unconfirmedTypes).toEqual({ user: 1 });
  });
  it("줄바꿈 없이 끝났어도 풀리는 끝 조각은 쓴다", () => {
    const s = parseLines([], { tail: assistant({ id: "m1", at: `${D1}T10:00:00Z`, usage: { output: 7 } }) });
    expect(s.days[D1]!.responses).toBe(1);
    expect(s.days[D1]!.tokens.output).toBe(7);
  });
  it("너무 긴 줄은 따로 센다", () => {
    const parser = new ClaudeSessionParser({ sessionId: "s", kind: "main", parentSessionId: null, timeZone: "UTC" });
    parser.tooLong();
    expect(parser.finish(null, false).missing.tooLongLines).toBe(1);
  });
});
