// 문구의 언어와 언어의 차례, 숫자의 서식, 문구 틀의 자리 채우기를 본다(설계 11.4의 반올림, 12.2, 13.2)
import { describe, expect, it } from "vitest";
import { fill, formatValue, groupDigits, oneDecimal, slots } from "../../src/core/copy/format.ts";
import { LANGS, pickLang, supportedLang } from "../../src/core/copy/lang.ts";

describe("언어", () => {
  it("지원하는 언어는 영어와 한국어이고 영어가 먼저다", () => {
    expect(LANGS).toEqual(["en", "ko"]);
  });

  it("언어 표기의 앞 언어 부분으로 고른다", () => {
    expect(supportedLang("ko")).toBe("ko");
    expect(supportedLang("ko-KR")).toBe("ko");
    expect(supportedLang("en_US.UTF-8")).toBe("en");
    expect(supportedLang(" EN ")).toBe("en");
    expect(supportedLang("ja-JP")).toBeNull();
    expect(supportedLang("")).toBeNull();
    expect(supportedLang(null)).toBeNull();
    expect(supportedLang("korean")).toBeNull();
  });

  it("--lang, OS의 언어, 영어의 차례로 정한다", () => {
    expect(pickLang("ko", "en-US")).toBe("ko");
    expect(pickLang("en", "ko-KR")).toBe("en");
    expect(pickLang(null, "ko-KR")).toBe("ko");
    // 스킬이 지원하지 않는 대화 언어를 넘겨도 점검을 막지 않고 다음 차례로 넘어간다
    expect(pickLang("ja", "ko-KR")).toBe("ko");
    expect(pickLang("ja", "fr-FR")).toBe("en");
    expect(pickLang(null, null)).toBe("en");
  });
});

describe("숫자의 서식", () => {
  it("정수를 세 자리마다 쉼표로 끊는다", () => {
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1000)).toBe("1,000");
    expect(groupDigits(1234567)).toBe("1,234,567");
  });

  it("소수 한 자리까지 적고 끝의 .0은 뗀다. 0.5는 올린다", () => {
    expect(oneDecimal(0.44)).toBe("0.4");
    expect(oneDecimal(0.45)).toBe("0.5");
    expect(oneDecimal(12)).toBe("12");
    expect(oneDecimal(12.04)).toBe("12");
    expect(oneDecimal(1234.56)).toBe("1,234.6");
  });

  it("잰 값을 종류에 맞춰 적는다. 몫은 백분율이다", () => {
    expect(formatValue("share", 0.96)).toBe("96");
    expect(formatValue("share", 0.9567)).toBe("95.7");
    expect(formatValue("share", 0.0143)).toBe("1.4");
    expect(formatValue("share", 1)).toBe("100");
    expect(formatValue("share", 0)).toBe("0");
    expect(formatValue("rate", 0.4)).toBe("0.4");
    expect(formatValue("rate", 40)).toBe("40");
    expect(formatValue("count", 3)).toBe("3");
    expect(formatValue("amount", 5234.5)).toBe("5,235");
  });

  it("몫을 백분율로 바꿀 때 끝자리 오차로 반올림이 갈리지 않는다", () => {
    // 0.0145 * 1000은 14.499999999999998로 계산된다. 설계 11.4의 반올림은 아홉째 자리에서 맞춘 뒤 올린다
    expect(formatValue("share", 0.0145)).toBe("1.5");
  });
});

describe("문구 틀", () => {
  it("자리를 값으로 바꾼다. 숫자는 세 자리마다 끊고 세지 못한 값은 줄표다", () => {
    expect(fill("{a} of {b}", { a: 1200, b: "all" })).toBe("1,200 of all");
    expect(fill("missing {n}", { n: null })).toBe("missing —");
  });

  it("{이름:하나|여럿}은 값이 1이면 앞의 것이다", () => {
    expect(fill("{n} {n:session|sessions}", { n: 1 })).toBe("1 session");
    expect(fill("{n} {n:session|sessions}", { n: 2 })).toBe("2 sessions");
    expect(fill("{n} {n:session|sessions}", { n: 0 })).toBe("0 sessions");
    expect(fill("{n:session|sessions}", { n: null })).toBe("sessions");
  });

  it("틀에 있는데 값에 없는 자리는 오류다", () => {
    expect(() => fill("{a} {b}", { a: 1 })).toThrow("b");
  });

  it("자리의 이름을 한 번씩 뽑는다", () => {
    expect(slots("{a} and {b:x|y} and {a}")).toEqual(["a", "b"]);
    expect(slots("no slots")).toEqual([]);
  });
});
