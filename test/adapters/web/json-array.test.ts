// 큰 JSON 배열을 조각으로 받아 원소를 하나씩 내는 것을 시험한다. 조각 경계, 문자열 안의 괄호와 역빗금, BOM, 상한을 넘는 원소, 닫히지 않은 배열, 배열이 아닌 파일(설계 「0.5.0에서 정한 것」)
import { describe, expect, it } from "vitest";
import { JsonArraySplitter } from "../../../src/adapters/web/json-array.ts";

function split(chunks: (string | Buffer)[], max = 1 << 20) {
  const elements: string[] = [];
  let tooLong = 0;
  const splitter = new JsonArraySplitter({ element: (text) => elements.push(text), tooLong: () => tooLong++ }, max);
  for (const chunk of chunks) splitter.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
  return { elements, tooLong, end: splitter.end() };
}

/** 글을 바이트 하나씩 자른다(조각 경계가 모든 자리에 온다) */
const bytes = (text: string): Buffer[] => [...Buffer.from(text, "utf8")].map((byte) => Buffer.from([byte]));

describe("JsonArraySplitter", () => {
  it("배열의 원소를 차례로 낸다. 문자열 안의 괄호·쉼표·따옴표 이스케이프와 여러 바이트 글자를 건드리지 않는다", () => {
    const items = [{ a: "}]{[", b: 'say "hi"\\' }, { 한글: "가나다 ]", n: [1, [2, { c: 3 }]] }, [1, 2], {}];
    const text = JSON.stringify(items, null, 2);
    const whole = split([text]);
    expect(whole.elements.map((element) => JSON.parse(element))).toEqual(items);
    expect(whole.end).toEqual({ closed: true, notArray: false });
    // 바이트 하나씩 들어와도 같다
    const tiny = split(bytes(text));
    expect(tiny.elements.map((element) => JSON.parse(element))).toEqual(items);
    expect(tiny.end.closed).toBe(true);
  });

  it("괄호 없는 원소(수, 문자열, 참거짓, null)도 낸다", () => {
    const result = split(['[1, "a,]b", true ,null,{"x":1}]']);
    expect(result.elements.map((element) => JSON.parse(element))).toEqual([1, "a,]b", true, null, { x: 1 }]);
    expect(result.end.closed).toBe(true);
  });

  it("맨 앞의 BOM과 빈칸을 건너뛴다. BOM이 조각 경계에 걸쳐도 같다", () => {
    const text = '﻿ \n [{"a":1}]';
    expect(split([text]).elements).toEqual(['{"a":1}']);
    expect(split(bytes(text)).elements).toEqual(['{"a":1}']);
  });

  it("상한을 넘는 원소는 버리고 센다. 그 뒤 원소는 그대로 낸다", () => {
    const big = { text: "x".repeat(200) };
    const result = split([JSON.stringify([{ a: 1 }, big, { b: 2 }])], 100);
    expect(result.elements).toEqual(['{"a":1}', '{"b":2}']);
    expect(result.tooLong).toBe(1);
    expect(result.end.closed).toBe(true);
    // 여러 조각에 걸친 큰 원소도 같다
    const chunked = split(bytes(JSON.stringify([big, { b: 2 }])), 100);
    expect(chunked.elements).toEqual(['{"b":2}']);
    expect(chunked.tooLong).toBe(1);
  });

  it("닫히지 않은 배열은 끝난 원소만 내고 닫히지 않았다고 알린다", () => {
    const result = split(['[{"a":1},{"b":', "2"]);
    expect(result.elements).toEqual(['{"a":1}']);
    expect(result.end).toEqual({ closed: false, notArray: false });
  });

  it("맨 바깥이 배열이 아니거나 빈 파일이면 배열이 아니라고 알린다. 빈 배열은 닫힌 배열이다", () => {
    expect(split(['{"conversations":[]}']).end).toEqual({ closed: false, notArray: true });
    expect(split([""]).end).toEqual({ closed: false, notArray: true });
    expect(split(["  [ ]  "]).end).toEqual({ closed: true, notArray: false });
  });

  it("배열이 닫힌 뒤의 글은 보지 않는다", () => {
    const result = split(['[{"a":1}] [{"b":2}]']);
    expect(result.elements).toEqual(['{"a":1}']);
  });
});
