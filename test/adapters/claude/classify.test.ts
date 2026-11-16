// user 줄의 판별 차례와 거절 가르기(설계 9.5)를 시험한다
import { describe, expect, it } from "vitest";
import { classifyUser, denialOf, isInterruptMarker, slashCommandOf, userText } from "../../../src/adapters/claude/classify.ts";

const line = (fields: Record<string, unknown>, content: unknown = "hello") => ({ type: "user", message: { role: "user", content }, ...fields });

describe("classifyUser", () => {
  it("1. 하위 세션이거나 isSidechain이면 세지 않는다", () => {
    expect(classifyUser(line({ origin: { kind: "human" } }), true)).toEqual({ kind: "skip", reason: "subagent-input" });
    expect(classifyUser(line({ isSidechain: true }), false)).toEqual({ kind: "skip", reason: "subagent-input" });
  });
  it("2. tool_result 블록이 있으면 도구 결과다", () => {
    expect(classifyUser(line({}, [{ type: "tool_result", tool_use_id: "t1" }]), false)).toEqual({ kind: "tool-result" });
  });
  it("3. isMeta, isCompactSummary, isVisibleInTranscriptOnly는 세지 않는다", () => {
    for (const flag of ["isMeta", "isCompactSummary", "isVisibleInTranscriptOnly"]) {
      expect(classifyUser(line({ [flag]: true, origin: { kind: "human" } }), false)).toEqual({ kind: "skip", reason: "meta" });
    }
  });
  it("4. origin.kind가 human이면 사람 요청이다", () => {
    expect(classifyUser(line({ origin: { kind: "human" }, promptSource: "queued" }), false)).toEqual({ kind: "human", weak: false });
  });
  it("5. origin.kind가 다른 값이면 종류별로 세지 않는다", () => {
    expect(classifyUser(line({ origin: { kind: "task-notification" } }), false)).toEqual({ kind: "skip", reason: "origin:task-notification" });
  });
  it("6. origin이 없고 turnOrigin이 sdk나 scheduled면 세지 않는다", () => {
    expect(classifyUser(line({ turnOrigin: "scheduled" }), false)).toEqual({ kind: "skip", reason: "turn:scheduled" });
  });
  it("7·8. origin이 없고 명령 줄이면 명령이다", () => {
    const text = "<command-name>/superpowers:brainstorming</command-name>\n<command-args></command-args>";
    expect(classifyUser(line({}, text), false)).toEqual({ kind: "command", name: "superpowers:brainstorming" });
  });
  it("7·8. <command-message> 바로 다음에 <command-name>이 오는 줄도 명령 줄이다", () => {
    const text = "<command-message>review is running</command-message>\n<command-name>/review</command-name>";
    expect(classifyUser(line({}, text), false)).toEqual({ kind: "command", name: "review" });
  });
  it("9. origin이 없고 명령 줄이 아닌 꼬리표로 시작하면 꼬리표별로 세지 않는다", () => {
    expect(classifyUser(line({}, "<local-command-stdout>x</local-command-stdout>"), false)).toEqual({ kind: "skip", reason: "tag:local-command-stdout" });
    expect(classifyUser(line({}, "<command-message>x</command-message>\nplain"), false)).toEqual({ kind: "skip", reason: "tag:command-message" });
  });
  it("10. 끊은 턴의 표지는 사람 요청이 아니다", () => {
    expect(classifyUser(line({ interruptedMessageId: "m1" }, [{ type: "text", text: "[Request interrupted by user]" }]), false)).toEqual({ kind: "skip", reason: "interrupt" });
    expect(classifyUser(line({}, "[Request interrupted by user for tool use]"), false)).toEqual({ kind: "skip", reason: "interrupt" });
  });
  it("11. 그 밖의 평문은 근거가 약한 사람 요청이다", () => {
    expect(classifyUser(line({}, "please fix the bug"), false)).toEqual({ kind: "human", weak: true });
  });
});

describe("isInterruptMarker, slashCommandOf", () => {
  it("끊은 표지는 하위 세션의 줄이어도 표지다. 도구 결과나 출처가 있는 줄은 표지가 아니다", () => {
    expect(isInterruptMarker(line({ isSidechain: true }, "[Request interrupted by user]"))).toBe(true);
    expect(isInterruptMarker(line({}, [{ type: "tool_result", tool_use_id: "t1" }]))).toBe(false);
    expect(isInterruptMarker(line({ origin: { kind: "human" } }, "[Request interrupted by user]"))).toBe(false);
  });
  it("슬래시 명령의 이름은 origin과 상관없이 낸다", () => {
    const skill = "<command-message>review is running</command-message>\n<command-name>/review</command-name>";
    expect(slashCommandOf(line({ origin: { kind: "human" } }, skill))).toBe("review");
    expect(slashCommandOf(line({}, "<command-name>/clear</command-name>"))).toBe("clear");
  });
  it("도구가 넣은 글과 도구 결과, 명령 줄이 아닌 글에서는 이름을 내지 않는다", () => {
    expect(slashCommandOf(line({ isMeta: true }, "<command-message>x</command-message>\n<command-name>/review</command-name>"))).toBeNull();
    expect(slashCommandOf(line({}, [{ type: "tool_result", tool_use_id: "t1" }]))).toBeNull();
    expect(slashCommandOf(line({}, "see <command-name>/review</command-name>"))).toBeNull();
  });
});

describe("denialOf", () => {
  it("1. user-rejected는 사람이 거절한 것이다", () => {
    expect(denialOf({ toolDenialKind: "user-rejected" })).toEqual({ kind: "user", raw: null });
  });
  it("2. decision이 reject이고 source가 hook이면 훅이 막은 것이다(permission-rule이 같이 적혀도)", () => {
    expect(denialOf({ toolDenialKind: "permission-rule", permissionDecision: { decision: "reject", source: "hook" } })).toEqual({ kind: "hook", raw: null });
  });
  it("3. interrupted는 끊겨서 끝난 것이다", () => {
    expect(denialOf({ toolDenialKind: "interrupted" })).toEqual({ kind: "interrupted", raw: null });
  });
  it("4. 위의 셋이 아니고 permission-rule이거나 decision이 reject면 권한 검사가 막은 것이다", () => {
    expect(denialOf({ toolDenialKind: "permission-rule" })).toEqual({ kind: "permission", raw: null });
    expect(denialOf({ permissionDecision: { decision: "reject", source: "config" } })).toEqual({ kind: "permission", raw: null });
    expect(denialOf({ permissionDecision: { decision: "reject", source: "something-new" } })).toEqual({ kind: "permission", raw: null });
  });
  it("5. 모르는 toolDenialKind는 모르는 표시다", () => {
    expect(denialOf({ toolDenialKind: "brand-new" })).toEqual({ kind: "unknown", raw: "brand-new" });
  });
  it("허락(accept)만 있거나 표시가 없으면 거절이 아니다(보통 결과)", () => {
    expect(denialOf({ permissionDecision: { decision: "accept", source: "config" } })).toBeNull();
    expect(denialOf({})).toBeNull();
  });
  it("user-rejected는 decision이 accept여도 사람이 거절한 것이다(차례의 1번이 먼저)", () => {
    expect(denialOf({ toolDenialKind: "user-rejected", permissionDecision: { decision: "accept", source: "config" } })).toEqual({ kind: "user", raw: null });
  });
});

describe("userText", () => {
  it("문자열은 그대로, 블록 목록은 첫 text 블록", () => {
    expect(userText("a")).toBe("a");
    expect(userText([{ type: "image" }, { type: "text", text: "b" }])).toBe("b");
    expect(userText(null)).toBe("");
  });
});
