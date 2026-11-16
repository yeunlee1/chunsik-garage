// 설정·정의 JSON의 정규화를 시험한다. 열쇠 차례와 상관없이 같은 글, 목록 차례는 지킴, 깊이의 경계(설계 11.3 정의의 지문, 20.1)
import { describe, expect, it } from "vitest";
import { canonicalJson, isObject } from "../../src/scan/json.ts";

const nest = (n: number): unknown => JSON.parse(`${"[".repeat(n)}${"]".repeat(n)}`);

describe("canonicalJson", () => {
  it("열쇠의 차례와 상관없이 같은 내용은 같은 글이다. 목록의 차례는 지킨다", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe('{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}');
    expect(canonicalJson([2, 1])).toBe("[2,1]");
  });
  it("65겹까지는 정규화하고 더 깊으면 null이다. 아주 깊어도 던지지 않는다", () => {
    expect(canonicalJson(nest(65))).not.toBeNull();
    expect(canonicalJson(nest(66))).toBeNull();
    expect(canonicalJson(nest(200_000))).toBeNull();
  });
  it("isObject는 배열과 null을 객체로 보지 않는다", () => {
    expect([isObject({}), isObject([]), isObject(null), isObject("x")]).toEqual([true, false, false, false]);
  });
});
