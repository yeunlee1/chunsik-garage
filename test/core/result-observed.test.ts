// 도구별 값의 관측 범위(봄, 대신 봄, 못 봄)를 시험한다. 규칙마다 쓰는 지표의 표가 실제 규칙이 재는지 가르는 지표와 같은지를, 지표 하나씩 못 봄으로 바꿔 평가를 돌려 본다(설계 9.7, 12.2)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import type { CoverageKey, ToolCoverage } from "../../src/adapters/types.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { observedOf, RULE_METRICS } from "../../src/core/result/observed.ts";
import { TOOL_RULES } from "../../src/core/scoreboard.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";

const KEYS = Object.keys(CLAUDE_COVERAGE) as CoverageKey[];

describe("규칙마다 쓰는 지표", () => {
  it("도구별 규칙마다 하나씩 있고 합침 규칙은 없다", () => {
    expect(Object.keys(RULE_METRICS).sort()).toEqual([...TOOL_RULES].sort());
  });

  it("표의 지표를 못 보면 그 규칙이 못 본 것(unsupported)이 되고, 표에 없는 지표를 못 보면 그렇게 되지 않는다", () => {
    const mismatches: string[] = [];
    for (const key of KEYS) {
      const coverage: ToolCoverage = { ...CLAUDE_COVERAGE, [key]: "unsupported" };
      const evaluation = evaluate(evaluationInput([claudeTool({ coverage, sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 1 } } }] })]));
      for (const rule of TOOL_RULES) {
        const value = evaluation.findings.find((finding) => finding.ruleId === rule)!.tools[0]!;
        const unsupported = value.status === "unmeasured" && value.reason === "unsupported";
        if (unsupported !== RULE_METRICS[rule].includes(key)) mismatches.push(`${rule}:${key}:${unsupported}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("관측 범위", () => {
  it("규칙이 쓰는 지표 가운데 가장 약한 것을 낸다. 지표를 쓰지 않는 규칙은 봄이다", () => {
    expect(observedOf("E7", CLAUDE_COVERAGE)).toBe("measured");
    expect(observedOf("E7", { ...CLAUDE_COVERAGE, interruptedTurns: "proxy" })).toBe("proxy");
    expect(observedOf("E7", { ...CLAUDE_COVERAGE, interruptedTurns: "proxy", deniedAndLengthStops: "unsupported" })).toBe("unsupported");
    expect(observedOf("F2", { ...CLAUDE_COVERAGE, autoCompaction: "proxy" })).toBe("proxy");
    expect(observedOf("F5", { ...CLAUDE_COVERAGE, skillUsage: "unsupported" })).toBe("measured");
  });
});
