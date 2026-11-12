// 도구 호출·결과·오류·거절과 사람 요청 판별을 줄 해석에서 시험한다(설계 9.5, 21.1 반례)
import { describe, expect, it } from "vitest";
import { assistant, parseLines, toolResult, toolUse, user } from "../../helpers/claude-lines.ts";

const D1 = "2026-11-11";
const at = (second: number): string => `${D1}T10:00:${String(second).padStart(2, "0")}Z`;

describe("도구", () => {
  it("도구 호출은 블록 ID로 한 번만 센다", () => {
    const call = toolUse("t1", "Read");
    const s = parseLines([assistant({ id: "m1", at: at(0), content: [call] }), assistant({ id: "m1", at: at(1), content: [call] })]);
    expect(s.days[D1]!.tools.Read!.calls).toBe(1);
  });
  it("결과와 오류는 호출의 도구 이름으로 센다. 셸 도구의 오류는 셸 도구에 따로 쌓인다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Bash"), toolUse("t2", "Read")] }),
      user({ at: at(1), content: [toolResult("t1", true)] }),
      user({ at: at(2), content: [toolResult("t2", true)] }),
    ]);
    expect(s.days[D1]!.tools.Bash).toMatchObject({ calls: 1, results: 1, errors: 1 });
    expect(s.days[D1]!.tools.Read).toMatchObject({ calls: 1, results: 1, errors: 1 });
  });
  it("거절 다섯 종류는 결과와 오류에서 빼고 종류별로 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("a", "Bash"), toolUse("b", "Bash"), toolUse("c", "Edit"), toolUse("d", "Bash"), toolUse("e", "Read")] }),
      user({ at: at(1), content: [toolResult("a", true)], extra: { toolDenialKind: "user-rejected" } }),
      user({ at: at(2), content: [toolResult("b", true)], extra: { toolDenialKind: "permission-rule", permissionDecision: { decision: "reject", source: "hook" } } }),
      user({ at: at(3), content: [toolResult("c", true)], extra: { toolDenialKind: "interrupted" } }),
      user({ at: at(4), content: [toolResult("d", true)], extra: { toolDenialKind: "permission-rule" } }),
      user({ at: at(5), content: [toolResult("e", true)], extra: { toolDenialKind: "brand-new" } }),
    ]);
    const day = s.days[D1]!;
    expect(day.tools.Bash).toMatchObject({ results: 0, errors: 0, deniedByUser: 1, deniedByHook: 1, deniedByPermission: 1 });
    expect(day.tools.Edit).toMatchObject({ results: 0, errors: 0, interrupted: 1 });
    expect(day.tools.Read).toMatchObject({ results: 0, errors: 0, unknownDenial: 1 });
    expect(day.unknownDenialKinds).toEqual({ "brand-new": 1 });
  });
  it("허락(accept) 표시가 붙은 결과는 보통 결과다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Read")] }),
      user({ at: at(1), content: [toolResult("t1", false)], extra: { permissionDecision: { decision: "accept", source: "config" } } }),
    ]);
    expect(s.days[D1]!.tools.Read).toMatchObject({ results: 1, errors: 0, deniedByPermission: 0 });
  });
  it("MCP 도구는 서버로 묶어 세고, 하위 에이전트와 스킬 도구 호출을 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "mcp__srv_a__do_thing"), toolUse("t2", "Agent"), toolUse("t3", "Skill", { skill: "review" })] }),
    ]);
    const day = s.days[D1]!;
    expect(day.mcpCalls).toEqual({ srv_a: 1 });
    expect(day.tools["mcp__srv_a"]!.calls).toBe(1);
    expect(day.subagentCalls).toBe(1);
    expect(day.skillSignals.review!.tool).toBe(1);
  });
});

describe("사람 요청", () => {
  it("origin이 human이면 사람 요청이고 권한 모드를 센다", () => {
    const s = parseLines([user({ at: at(0), content: "do it", origin: "human", extra: { permissionMode: "bypassPermissions" } })]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    expect(s.days[D1]!.permissionModes).toEqual({ bypassPermissions: 1 });
  });
  it("작업 알림은 사람 요청이 아니고 종류별로 센다", () => {
    const s = parseLines([user({ at: at(0), content: "<task-notification>x</task-notification>", origin: "task-notification" })]);
    expect(s.days[D1]!.humanRequests).toBe(0);
    expect(s.days[D1]!.nonHumanInputs).toEqual({ "origin:task-notification": 1 });
  });
  it("origin 없는 평문은 근거가 약한 사람 요청으로도 센다", () => {
    const s = parseLines([user({ at: at(0), content: "old version prompt" })]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    expect(s.days[D1]!.weakHumanRequests).toBe(1);
  });
  it("끊은 턴의 표지는 사람 요청이 아니고 끊은 턴으로 센다", () => {
    const s = parseLines([user({ at: at(0), content: "[Request interrupted by user]" })]);
    expect(s.days[D1]!.humanRequests).toBe(0);
    expect(s.days[D1]!.weakHumanRequests).toBe(0);
    expect(s.days[D1]!.interruptedTurns).toBe(1);
  });
  it("사람이 거절한 결과 바로 뒤의 끊은 표지는 다시 세지 않는다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Bash")] }),
      user({ at: at(1), content: [toolResult("t1", true)], extra: { toolDenialKind: "user-rejected" } }),
      user({ at: at(2), content: "[Request interrupted by user for tool use]" }),
    ]);
    expect(s.days[D1]!.tools.Bash!.deniedByUser).toBe(1);
    expect(s.days[D1]!.interruptedTurns).toBe(0);
  });
  it("표지 앞의 user 줄이 보통의 도구 결과면 끊은 턴으로 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Read")] }),
      user({ at: at(1), content: [toolResult("t1", false)] }),
      user({ at: at(2), content: "[Request interrupted by user]" }),
    ]);
    expect(s.days[D1]!.interruptedTurns).toBe(1);
  });
  it("거절 뒤에 응답이 있었으면 그 뒤의 표지는 끊은 턴이다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Bash")] }),
      user({ at: at(1), content: [toolResult("t1", true)], extra: { toolDenialKind: "user-rejected" } }),
      assistant({ id: "m2", at: at(2) }),
      user({ at: at(3), content: "[Request interrupted by user]" }),
    ]);
    expect(s.days[D1]!.tools.Bash!.deniedByUser).toBe(1);
    expect(s.days[D1]!.interruptedTurns).toBe(1);
  });
  it("응답이 뒤따른 슬래시 명령은 사람 요청이다. <command-message>가 먼저인 명령 줄도 같다", () => {
    const s = parseLines([user({ at: at(0), content: "<command-name>/review</command-name>" }), assistant({ id: "m1", at: at(1) })]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    const t = parseLines([
      user({ at: at(0), content: "<command-message>review is running</command-message>\n<command-name>/review</command-name>" }),
      assistant({ id: "m1", at: at(1) }),
    ]);
    expect(t.days[D1]!.humanRequests).toBe(1);
    expect(t.days[D1]!.nonHumanInputs).toEqual({});
  });
  it("응답이 뒤따르지 않은 슬래시 명령은 사람 요청이 아니다", () => {
    const s = parseLines([
      user({ at: at(0), content: "<command-name>/clear</command-name>" }),
      user({ at: at(1), content: "next", origin: "human" }),
      assistant({ id: "m1", at: at(2) }),
      user({ at: at(3), content: "<command-name>/model</command-name>" }),
    ]);
    expect(s.days[D1]!.humanRequests).toBe(1);
  });
  it("하위 세션에서도 도구 결과·오류·허락 표시 결과·거절을 센다. 사람 요청은 아니다", () => {
    const s = parseLines(
      [
        user({ at: at(0), content: "task", origin: "human" }),
        assistant({ id: "m1", at: at(1), content: [toolUse("t1", "Read"), toolUse("t2", "Read"), toolUse("t3", "Bash")] }),
        user({ at: at(2), content: [toolResult("t1", true)] }),
        user({ at: at(3), content: [toolResult("t2", false)], extra: { permissionDecision: { decision: "accept", source: "config" } } }),
        user({ at: at(4), content: [toolResult("t3", true)], extra: { toolDenialKind: "user-rejected" } }),
      ],
      { kind: "sub" },
    );
    const day = s.days[D1]!;
    expect(day.tools.Read).toMatchObject({ calls: 2, results: 2, errors: 1 });
    expect(day.tools.Bash).toMatchObject({ calls: 1, results: 0, errors: 0, deniedByUser: 1 });
    expect(day.humanRequests).toBe(0);
  });
  it("주 세션 파일의 isSidechain 줄도 도구 결과는 세고 사람 요청은 세지 않는다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Read")] }),
      user({ at: at(1), content: [toolResult("t1", true)], extra: { isSidechain: true } }),
      user({ at: at(2), content: "sub task", origin: "human", extra: { isSidechain: true } }),
    ]);
    expect(s.days[D1]!.tools.Read).toMatchObject({ results: 1, errors: 1 });
    expect(s.days[D1]!.humanRequests).toBe(0);
  });
  it("하위 세션의 끊은 표지도 끊은 턴으로 센다", () => {
    const s = parseLines([user({ at: at(0), content: "[Request interrupted by user]" })], { kind: "sub" });
    expect(s.days[D1]!.interruptedTurns).toBe(1);
    expect(s.days[D1]!.humanRequests).toBe(0);
  });
  it("하위 세션의 user 줄은 사람 요청이 아니다", () => {
    const s = parseLines([user({ at: at(0), content: "task", origin: "human" })], { kind: "sub" });
    expect(s.days[D1]!.humanRequests).toBe(0);
    expect(s.days[D1]!.nonHumanInputs).toEqual({ "subagent-input": 1 });
  });
});
