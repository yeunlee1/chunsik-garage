// 제미나이 설정의 안전 설정 읽기(샌드박스, 셸 자동 허용)와 층 합치기를 시험한다. 값의 해석은 공개 소스 v0.68.0의 cli/src/config/sandboxConfig.ts·settingsSchema.ts·utils/deepMerge.ts를 따른다(설계 「0.4.0에서 정한 것」, 짝 검토 2차 필수 2·3)
import { describe, expect, it } from "vitest";
import { geminiSafetyOf } from "../../src/scan/gemini-settings.ts";

const sandboxOf = (...layers: Record<string, unknown>[]) => geminiSafetyOf(layers).sandbox;
const shellOf = (...layers: Record<string, unknown>[]) => geminiSafetyOf(layers).shellAutoApproved;

describe("geminiSafetyOf의 샌드박스", () => {
  it("참·거짓과 글을 제미나이처럼 읽는다. 글 false와 0과 빈 글은 끔, true와 1과 명령 이름은 켬이다", () => {
    expect([sandboxOf({ tools: { sandbox: true } }), sandboxOf({ tools: { sandbox: false } })]).toEqual([true, false]);
    expect(["false", "0", "", "  ", "FALSE"].map((value) => sandboxOf({ tools: { sandbox: value } }))).toEqual([false, false, false, false, false]);
    expect(["true", "1", "docker", "sandbox-exec"].map((value) => sandboxOf({ tools: { sandbox: value } }))).toEqual([true, true, true, true]);
    expect(sandboxOf({})).toBe(false);
  });

  it("설정 묶음은 enabled가 참일 때만 켬이다. 층마다의 묶음은 합쳐서 본다", () => {
    expect(sandboxOf({ tools: { sandbox: { enabled: true, command: "docker" } } })).toBe(true);
    expect(sandboxOf({ tools: { sandbox: { enabled: false } } })).toBe(false);
    expect(sandboxOf({ tools: { sandbox: { command: "docker" } } })).toBe(false);
    // 아래 층이 켠 묶음에 위 층이 다른 칸만 더하면 켠 채로 남는다(묶음은 합친다)
    expect(sandboxOf({ tools: { sandbox: { enabled: true } } }, { tools: { sandbox: { networkAccess: false } } })).toBe(true);
    // 묶음이 아닌 값은 바꾼다
    expect(sandboxOf({ tools: { sandbox: { enabled: true } } }, { tools: { sandbox: false } })).toBe(false);
    expect(sandboxOf({ tools: { sandbox: false } }, { tools: { sandbox: { enabled: true } } })).toBe(true);
  });

  it("도구 샌드박스(security.toolSandboxing)가 켜져 있으면 tools.sandbox가 없어도 샌드박스가 있다", () => {
    expect(sandboxOf({ security: { toolSandboxing: true } })).toBe(true);
    expect(sandboxOf({ security: { toolSandboxing: true } }, { security: { toolSandboxing: false } })).toBe(false);
    expect(sandboxOf({ tools: { sandbox: false }, security: { toolSandboxing: true } })).toBe(true);
  });
});

describe("geminiSafetyOf의 셸 자동 허용", () => {
  it("tools.allowed는 합치지 않고 그 칸을 적은 마지막 층의 목록이 정한다", () => {
    expect(shellOf({ tools: { allowed: ["run_shell_command"] } }, { tools: { allowed: ["read_file"] } })).toBe(false);
    expect(shellOf({ tools: { allowed: ["read_file"] } }, { tools: { allowed: ["run_shell_command"] } })).toBe(true);
    expect(shellOf({ tools: { allowed: ["run_shell_command"] } }, { tools: { sandbox: false } })).toBe(true);
    expect(shellOf({ tools: { allowed: ["ShellTool"] } })).toBe(true);
  });

  it("인자가 붙은 셸 허용은 그 명령만 묻지 않으므로 통째로 허용한 것이 아니다", () => {
    expect(shellOf({ tools: { allowed: ["run_shell_command(git status)", "run_shell_command(npm test)"] } })).toBe(false);
    expect(shellOf({})).toBe(false);
  });

  it("승인 방식은 그 칸을 적은 마지막 층의 것이고, 정하지 않았으면 default다", () => {
    expect(geminiSafetyOf([{ general: { defaultApprovalMode: "plan" } }, { general: { defaultApprovalMode: "auto_edit" } }]).approvalMode).toBe("auto_edit");
    expect(geminiSafetyOf([{}]).approvalMode).toBe("default");
  });
});
