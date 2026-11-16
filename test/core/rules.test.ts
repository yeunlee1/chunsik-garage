// 규칙 표, 규칙 점수, 반올림과 등급, 못 재는 이유의 차례를 시험한다(설계 11.3, 11.4, 11.6, 21.1 「규칙」과 「점수」)
import { describe, expect, it } from "vitest";
import { firstReason, REASONS, ruleReason } from "../../src/core/reasons.ts";
import { RULES, RULES_VERSION, ruleSpec } from "../../src/core/rules.ts";
import { gradeOf, roundHalfUp, ruleScore, settleScore } from "../../src/core/score.ts";

describe("규칙 표", () => {
  it("규칙은 스물둘이고 기준마다 5, 7, 6, 4개다. 표의 차례가 화면의 차례다", () => {
    expect(RULES_VERSION).toBe("1.0.0");
    expect(RULES.map((rule) => rule.id)).toEqual([
      "S1", "S2", "S3", "S4", "S5",
      "E1", "E2", "E3", "E4", "E5", "E6", "E7",
      "F1", "F2", "F3", "F4", "F5", "F6",
      "I1", "I2", "I3", "I4",
    ]);
    const count = (axis: string): number => RULES.filter((rule) => rule.axis === axis).length;
    expect([count("setup"), count("efficiency"), count("fit"), count("intensity")]).toEqual([5, 7, 6, 4]);
  });

  it("무게의 합은 기준마다 12, 16, 11, 9다", () => {
    const weight = (axis: string): number => RULES.filter((rule) => rule.axis === axis).reduce((sum, rule) => sum + rule.weight, 0);
    expect([weight("setup"), weight("efficiency"), weight("fit"), weight("intensity")]).toEqual([12, 16, 11, 9]);
  });

  it("정비할 수 있는 규칙은 E5와 E6뿐이다", () => {
    expect(RULES.filter((rule) => rule.tunable).map((rule) => rule.id)).toEqual(["E5", "E6"]);
  });

  it("설계의 기준값 그대로다", () => {
    expect(ruleSpec("E1")).toEqual({ id: "E1", axis: "efficiency", kind: "share", zeroAt: 0.5, fullAt: 0.9, weight: 3, unit: "perTool", tunable: false });
    expect(ruleSpec("E4")).toMatchObject({ kind: "amount", zeroAt: 16000, fullAt: 4000, weight: 2, unit: "perTool" });
    expect(ruleSpec("F1")).toMatchObject({ zeroAt: 0.95, fullAt: 0.6, weight: 1 });
    expect(ruleSpec("S3")).toMatchObject({ kind: "count", zeroAt: 3, fullAt: 0, unit: "merged" });
    expect(ruleSpec("I2")).toMatchObject({ kind: "rate", zeroAt: 3, fullAt: 40, weight: 3, unit: "merged" });
  });
});

describe("ruleScore", () => {
  it("0점 기준과 만점 기준 사이는 직선이고 바깥은 0이나 1이다", () => {
    expect(ruleScore(0.5, 0.5, 0.9)).toBe(0);
    expect(ruleScore(0.9, 0.5, 0.9)).toBe(1);
    expect(ruleScore(0.7, 0.5, 0.9)).toBeCloseTo(0.5, 12);
    expect(ruleScore(0.2, 0.5, 0.9)).toBe(0);
    expect(ruleScore(0.99, 0.5, 0.9)).toBe(1);
  });
  it("낮을수록 좋은 규칙은 0점 기준이 더 큰 값이다", () => {
    expect(ruleScore(3, 3, 0)).toBe(0);
    expect(ruleScore(0, 3, 0)).toBe(1);
    expect(ruleScore(1, 3, 0)).toBeCloseTo(2 / 3, 12);
    expect(ruleScore(5, 3, 0)).toBe(0);
    expect(ruleScore(10000, 16000, 4000)).toBeCloseTo(0.5, 12);
  });
  it("점수 자체는 맞추지 않는다. 계산한 그대로다", () => {
    // 수학으로는 0.8이지만 (0.82 - 0.5) / 0.4는 0.7999999999999998로 계산된다. 그 값을 그대로 낸다
    expect(ruleScore(0.82, 0.5, 0.9)).toBe((0.82 - 0.5) / (0.9 - 0.5));
    expect(ruleScore(0.82, 0.5, 0.9)).toBeLessThan(0.8);
    expect(ruleScore(1, 3, 0)).toBe(2 / 3);
  });
});

describe("settleScore", () => {
  it("경계와 견줄 때 쓴다. 나눗셈의 끝자리 오차가 경계의 어느 쪽인지를 바꾸지 않는다", () => {
    expect(settleScore(ruleScore(0.82, 0.5, 0.9))).toBe(0.8);
    expect(settleScore(ruleScore(0.04, 0.12, 0.02))).toBe(0.8);
    expect(settleScore(ruleScore(0.44, 0.8, 0.2))).toBe(0.6);
    expect(settleScore(ruleScore(0.62, 0.5, 0.9))).toBe(0.3);
    // 경계에 못 미치는 값을 경계로 올리지는 않는다
    expect(settleScore(ruleScore(0.8199, 0.5, 0.9))).toBeLessThan(0.8);
    expect(settleScore(ruleScore(0.819999999, 0.5, 0.9))).toBeLessThan(0.8);
  });
  it("소수 열두째 자리에서 맞춘다. 그보다 큰 차이는 남긴다", () => {
    expect(settleScore(0.7999999999999998)).toBe(0.8);
    expect(settleScore(0.5999999999999999)).toBe(0.6);
    expect(settleScore(0.8000000000000002)).toBe(0.8);
    expect(settleScore(0.799999999998)).toBe(0.799999999998);
    expect(settleScore(0)).toBe(0);
    expect(settleScore(1)).toBe(1);
  });
  it("아홉째 자리가 아니다. 경계에서 100억 분의 1만큼 못 미치는 값은 경계로 올리지 않는다", () => {
    expect(settleScore(0.7999999999)).toBeLessThan(0.8);
    expect(settleScore(0.7999999999)).toBe(0.7999999999);
  });
});

describe("반올림과 등급", () => {
  it("소수 아홉째 자리에서 한 번 맞춘 뒤 0.5는 올린다", () => {
    expect(roundHalfUp(79.5)).toBe(80);
    expect(roundHalfUp(79.4999999999)).toBe(80);
    expect(roundHalfUp(79.49999)).toBe(79);
    expect(roundHalfUp(64.5)).toBe(65);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(0)).toBe(0);
    // 0.1 + 0.2 같은 끝자리 오차가 결과를 바꾸지 않는다
    expect(roundHalfUp((0.1 + 0.2) * 10 + 0.5)).toBe(4);
  });
  it("등급의 경계는 49와 50, 64와 65, 79와 80, 89와 90이다", () => {
    expect([49, 50, 64, 65, 79, 80, 89, 90, 100, 0].map((aq) => gradeOf(aq).grade)).toEqual(["D", "C", "C", "B", "B", "A", "A", "S", "S", "D"]);
    expect([49, 50, 65, 80, 90].map((aq) => gradeOf(aq).tier)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("못 재는 이유", () => {
  it("차례는 unsupported, unreadable, not_applicable, incomplete, no_data, too_little, watching이다", () => {
    expect([...REASONS]).toEqual(["unsupported", "unreadable", "not_applicable", "incomplete", "no_data", "too_little", "watching"]);
  });
  it("한 도구 안에서는 차례에서 처음 맞는 것 하나다", () => {
    expect(firstReason(["watching", "incomplete", "unreadable"])).toBe("unreadable");
    expect(firstReason(["too_little", "incomplete"])).toBe("incomplete");
    expect(firstReason(["no_data", "unsupported"])).toBe("unsupported");
    expect(firstReason(["watching"])).toBe("watching");
  });
  it("재는 도구가 없으면, 하거나 기다리면 풀리는 이유 가운데 가장 뒤의 것이 규칙의 이유다", () => {
    expect(ruleReason(["watching", "unsupported"])).toBe("watching");
    expect(ruleReason(["unreadable", "not_applicable"])).toBe("unreadable");
    expect(ruleReason(["unreadable", "too_little", "incomplete"])).toBe("too_little");
  });
  it("풀리는 이유가 하나도 없으면 unsupported와 not_applicable 가운데 뒤의 것이다", () => {
    expect(ruleReason(["unsupported", "not_applicable"])).toBe("not_applicable");
    expect(ruleReason(["unsupported", "unsupported"])).toBe("unsupported");
  });
  it("점수에 넣는 도구가 하나도 없으면 no_data다", () => {
    expect(ruleReason([])).toBe("no_data");
  });
});
