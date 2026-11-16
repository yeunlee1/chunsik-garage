// 도구 실행 전 확인 훅의 겉모양 판정을 시험한다. 설계 21.1의 매처·if·async 반례를 그대로 넣는다(설계 11.3 S2)
import { describe, expect, it } from "vitest";
import { coversShell, hookCommandTexts, hookFileEvents, ifTool, inlineHookEvents, matcherMatches, preToolUseGuards } from "../../src/scan/hooks.ts";

describe("매처", () => {
  it("Bash|PowerShell, ^(Bash|PowerShell)$, 매처 없음은 셋 다 셸 명령 도구에 맞는다", () => {
    for (const matcher of ["Bash|PowerShell", "^(Bash|PowerShell)$", undefined, "", "*"]) {
      expect(matcherMatches(matcher, "Bash")).toBe(true);
      expect(matcherMatches(matcher, "PowerShell")).toBe(true);
    }
  });
  it("mcp__.*와 풀리지 않는 정규식은 맞지 않는다", () => {
    expect(matcherMatches("mcp__.*", "Bash")).toBe(false);
    expect(matcherMatches("(Bash", "Bash")).toBe(false);
  });
  it("이름 목록은 글자 그대로 견준다. 쉼표도 나눈다", () => {
    expect(matcherMatches("Edit, Bash", "Bash")).toBe(true);
    expect(matcherMatches("Bashful", "Bash")).toBe(false);
    expect(matcherMatches(3, "Bash")).toBe(false);
  });
});

describe("if", () => {
  it("권한 규칙 하나에서 도구 이름만 읽는다", () => {
    expect(ifTool(undefined)).toBeNull();
    expect(ifTool("Bash(git push *)")).toBe("Bash");
    expect(ifTool("PowerShell")).toBe("PowerShell");
    expect(ifTool("Bash(unclosed")).toBe("unreadable");
    expect(ifTool(7)).toBe("unreadable");
  });
});

describe("셸 명령을 덮는가", () => {
  it("매처는 *인데 if가 파일 고치기 도구를 가리키면 덮지 않는다", () => {
    expect(coversShell("*", "Edit(src/**)")).toBe(false);
  });
  it("매처가 Bash이고 if가 PowerShell이면(반대도) 덮지 않는다", () => {
    expect(coversShell("Bash", "PowerShell(Remove-Item *)")).toBe(false);
    expect(coversShell("PowerShell", "Bash(rm *)")).toBe(false);
  });
  it("매처가 Bash이고 if도 Bash면 덮는다. 매처가 Bash|PowerShell이고 if가 Bash여도 덮는다", () => {
    expect(coversShell("Bash", "Bash(rm *)")).toBe(true);
    expect(coversShell("Bash|PowerShell", "Bash(rm *)")).toBe(true);
  });
  it("if를 권한 규칙으로 읽지 못하면 덮지 않는다", () => {
    expect(coversShell("Bash", "Bash(rm")).toBe(false);
  });
});

describe("preToolUseGuards", () => {
  const events = {
    PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command: "guard.sh" }, { type: "command", command: "log.sh", async: true }] },
      { matcher: "Write|Edit", hooks: [{ type: "command", command: "fmt.sh" }] },
      { hooks: [{ type: "command", command: "x", asyncRewake: true }] },
      "bad",
    ],
    PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "after.sh" }] }],
  };
  it("PreToolUse 처리기마다 덮는지와 막을 수 있는지를 낸다. 명령은 싣지 않는다", () => {
    const guards = preToolUseGuards(events, "user", null);
    expect(guards).toEqual([
      { source: "user", pluginId: null, coversShell: true, canBlock: true },
      { source: "user", pluginId: null, coversShell: true, canBlock: false },
      { source: "user", pluginId: null, coversShell: false, canBlock: true },
      { source: "user", pluginId: null, coversShell: true, canBlock: false },
    ]);
    expect(JSON.stringify(guards)).not.toContain("guard.sh");
  });
  it("모양이 다른 설정은 처리기가 없는 것이다", () => {
    expect(preToolUseGuards(undefined, "managed", null)).toEqual([]);
    expect(preToolUseGuards({ PreToolUse: "x" }, "managed", null)).toEqual([]);
  });
  it("처리기는 공식 문서의 다섯 종류 가운데 하나이고 그 종류의 필수 값이 있어야 한다. 아니면 확인 훅으로 보지 않는다", () => {
    const at = (handler: unknown) => preToolUseGuards({ PreToolUse: [{ matcher: "Bash", hooks: [handler] }] }, "user", null);
    const bad = [{}, { type: "unknown", command: "x" }, { type: "command" }, { type: "command", command: "" }, { type: "http" }, { type: "mcp_tool", server: "s" }, { type: "prompt" }, { type: "agent", prompt: 3 }];
    for (const handler of bad) expect(at(handler)).toEqual([]);
    const good = [{ type: "command", command: "x" }, { type: "http", url: "http://localhost/hook" }, { type: "mcp_tool", server: "s", tool: "t" }, { type: "prompt", prompt: "p" }, { type: "agent", prompt: "p" }];
    for (const handler of good) expect(at(handler)).toEqual([{ source: "user", pluginId: null, coversShell: true, canBlock: true }]);
  });
  it("훅 파일은 맨 위 hooks 감싸개 안에 사건 묶음을 둔다. 감싸개가 없거나 뼈대가 형식에 맞지 않으면 파일째 읽히지 않는다", () => {
    const valid = { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }], SessionStart: [] };
    expect(hookFileEvents({ description: "d", hooks: valid })).toBe(valid);
    expect(preToolUseGuards(hookFileEvents({ hooks: valid }), "user-plugin", "p@m")).toHaveLength(1);
    expect(hookFileEvents({ hooks: {} })).toEqual({});
    const broken = [valid, {}, "x", { hooks: [] }, { hooks: { PreToolUse: "x" } }, { hooks: { PreToolUse: ["bad"] } }, { hooks: { PreToolUse: [{ matcher: "Bash" }] } }, { hooks: { SessionStart: [{ hooks: [{ type: "command" }] }] } }];
    for (const file of broken) expect(hookFileEvents(file)).toBeNull();
  });
  it("인라인 훅은 감싸개 없이 사건 묶음 그대로다. 감싸개를 씌웠거나 뼈대가 형식에 맞지 않으면 읽히지 않는다", () => {
    const valid = { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] };
    expect(inlineHookEvents(valid)).toBe(valid);
    for (const inline of [{ hooks: valid }, "x", [], { PreToolUse: [{ hooks: [{}] }] }]) expect(inlineHookEvents(inline)).toBeNull();
  });
  it("모든 사건의 명령 글을 모은다", () => {
    expect(hookCommandTexts({ SessionStart: [{ hooks: [{ command: "node", args: ["a.mjs", "--x"] }] }] })).toEqual(["node a.mjs --x"]);
  });
});
