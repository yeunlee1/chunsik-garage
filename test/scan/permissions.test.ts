// 전역과 프로젝트의 권한 규칙 충돌 세기를 시험한다. 설계 21.1의 F6 반례를 그대로 넣는다(설계 11.3 F6)
import { describe, expect, it } from "vitest";
import { conflictPairs } from "../../src/scan/permissions.ts";

const none = { allow: [], deny: [] };

describe("conflictPairs", () => {
  it("전역이 금지한 규칙과 글자 그대로 같은 규칙이 한 프로젝트의 로컬 설정의 허용에만 있으면 한 쌍이다", () => {
    expect(conflictPairs({ allow: [], deny: ["Bash(rm -rf *)"] }, null, { allow: ["Bash(rm -rf *)"], deny: [] })).toBe(1);
  });
  it("같은 규칙이 프로젝트 설정과 로컬 설정의 허용에 둘 다 있어도 한 쌍이다", () => {
    expect(conflictPairs({ allow: [], deny: ["Bash(curl *)"] }, { allow: ["Bash(curl *)"], deny: [] }, { allow: ["Bash(curl *)"], deny: [] })).toBe(1);
  });
  it("프로젝트 설정이 허용하고 같은 프로젝트의 로컬 설정이 금지한 규칙은, 전역에 없으면 세지 않는다", () => {
    expect(conflictPairs(none, { allow: ["Read(.env)"], deny: [] }, { allow: [], deny: ["Read(.env)"] })).toBe(0);
  });
  it("전역 허용과 프로젝트 금지, 전역 금지와 프로젝트 허용을 모두 센다", () => {
    expect(conflictPairs({ allow: ["A", "B"], deny: ["C"] }, { allow: ["C"], deny: ["A"] }, { allow: [], deny: ["B", "B"] })).toBe(3);
  });
  it("글자가 조금이라도 다르면 부딪힌 것이 아니다", () => {
    expect(conflictPairs({ allow: [], deny: ["Bash(rm *)"] }, { allow: ["Bash(rm  *)", "bash(rm *)"], deny: [] }, null)).toBe(0);
  });
  it("프로젝트 쪽이 없으면 0이다", () => {
    expect(conflictPairs({ allow: ["A"], deny: ["B"] }, null, null)).toBe(0);
  });
});
