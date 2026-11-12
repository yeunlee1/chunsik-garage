// 깨졌거나 잘린 JSON 줄에서 맨 바깥 type을 읽는 것을 시험한다(설계 9.8)
import { describe, expect, it } from "vitest";
import { outerTypeOf } from "../../../src/adapters/common/outer-type.ts";

describe("outerTypeOf", () => {
  it("앞에 type이 있으면 뒤가 잘려도 읽는다", () => {
    expect(outerTypeOf('{"type":"system","subtype":"compa')).toBe("system");
  });
  it("중첩된 type은 맨 바깥 type이 아니다", () => {
    expect(outerTypeOf('{"message":{"type":"user"},"type":"assistant","x":')).toBe("assistant");
  });
  it("맨 바깥 type이 나오기 전에 잘리면 null", () => {
    expect(outerTypeOf('{"message":{"content":[{"type":"tool_use","name":"Sk')).toBeNull();
  });
  it("문자열 안의 type 글자에 속지 않는다", () => {
    expect(outerTypeOf('{"a":"\\"type\\":\\"system\\"","type":"user"}')).toBe("user");
  });
  it("type 값이 잘리면 null", () => {
    expect(outerTypeOf('{"type":"sys')).toBeNull();
  });
  it("객체가 아니면 null", () => {
    expect(outerTypeOf('["type","system"]')).toBeNull();
  });
  it("type이 문자열이 아니면 null", () => {
    expect(outerTypeOf('{"type":5}')).toBeNull();
  });
  it("숫자 값 바로 뒤에서 잘리면 null", () => {
    expect(outerTypeOf('{"n":12')).toBeNull();
  });
});
