// 웹 채팅(ChatGPT, Claude.ai)이 평가에 드는 방식을 시험한다. 강도 I1·I2에만 들고, 셋팅 규칙·프로젝트·설치 판정에서는 빠지며, 도구별 규칙은 모두 못 봄이다. 웹 채팅이 없으면 평가는 그대로다(설계 「0.5.0에서 정한 것」)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { TOOL_RULES } from "../../src/core/scoreboard.ts";
import { claudeTool, evaluationInput, webTool } from "../helpers/evaluation.ts";

const dates = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];
/** Claude Code 다섯 날, 날마다 사람 요청 다섯과 응답 열, 도구 호출 마흔 */
const claudeSessions = dates.map((date) => ({ cwd: "/work/app", days: { [date]: { responses: 10, humanRequests: 5, tokens: { input: 100, cacheRead: 800, output: 50 }, tools: { Read: { calls: 40, results: 40 } } } } }));
/** ChatGPT는 Claude Code와 겹치지 않는 다섯 날, 날마다 사람 요청 넷과 응답 넷 */
const chatSessions = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((date) => ({ days: { [date]: { responses: 4, humanRequests: 4, models: { "gpt-5": 4 } } } }));

const claudeOnly = () => evaluate(evaluationInput([claudeTool({ sessions: claudeSessions })]));
const withWeb = () => evaluate(evaluationInput([claudeTool({ sessions: claudeSessions }), webTool("web-chatgpt", chatSessions)]));
const finding = (evaluation: ReturnType<typeof evaluate>, id: string) => evaluation.findings.find((item) => item.ruleId === id)!;

describe("웹 채팅이 든 평가", () => {
  it("응답이 있으면 점수에 넣는 도구다. 도구 목록은 도구 식별자의 차례다", () => {
    const evaluation = withWeb();
    expect(evaluation.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses, tool.totals.humanRequests])).toEqual([
      ["claude-code", true, 50, 25],
      ["web-chatgpt", true, 20, 20],
    ]);
  });

  it("쓴 날(I1)과 하루에 시키는 양(I2)에는 웹 채팅이 든다", () => {
    const evaluation = withWeb();
    expect(finding(evaluation, "I1")).toMatchObject({ status: "scored", value: 10, evidence: { activeDays: 10 } });
    expect(finding(evaluation, "I2")).toMatchObject({ status: "scored", value: 4.5, evidence: { activeDays: 10, humanRequests: 45 } });
    expect(finding(claudeOnly(), "I2")).toMatchObject({ value: 5, evidence: { activeDays: 5, humanRequests: 25 } });
  });

  it("한 번에 맡기는 깊이(I3)는 도구 호출을 세지 않는 웹 채팅을 빼고 잰다", () => {
    expect(finding(withWeb(), "I3")).toMatchObject({ status: "scored", value: 8, evidence: { humanRequests: 25, toolCalls: 200 } });
    expect(finding(withWeb(), "I3").value).toBe(finding(claudeOnly(), "I3").value);
  });

  it("셋팅으로 재는 합침 규칙(S1·S2·S3·F3·F4·F6)과 프로젝트 수(I4)는 웹 채팅이 없을 때와 같다", () => {
    const [web, only] = [withWeb(), claudeOnly()];
    for (const id of ["S1", "S2", "S3", "F3", "F4", "F6", "I4"]) {
      const { tools: _a, ...withWebFinding } = finding(web, id);
      const { tools: _b, ...onlyFinding } = finding(only, id);
      expect({ id, ...withWebFinding }).toEqual({ id, ...onlyFinding });
    }
    expect(web.safeguards.map((safeguard) => safeguard.tool)).toEqual(["claude-code"]);
    expect(web.projects).toEqual(only.projects);
  });

  it("도구별 규칙에서 웹 채팅은 모두 못 봄이고 평균의 무게에 들지 않는다. 정비 후보도 없다", () => {
    const [web, only] = [withWeb(), claudeOnly()];
    for (const id of TOOL_RULES) {
      const value = finding(web, id).tools.find((item) => item.tool === "web-chatgpt");
      expect({ id, status: value?.status, reason: value?.reason }).toEqual({ id, status: "unmeasured", reason: "unsupported" });
      expect(Object.values(value!.evidence).every((number) => number === null)).toBe(true);
      expect({ id, value: finding(web, id).value, score: finding(web, id).score }).toEqual({ id, value: finding(only, id).value, score: finding(only, id).score });
    }
    expect(web.candidates.filter((candidate) => candidate.tool === "web-chatgpt")).toEqual([]);
    expect(web.tools.find((tool) => tool.tool === "web-chatgpt")).toMatchObject({ skills: [], servers: [] });
  });

  it("응답이 없는 웹 채팅은 점수에 넣지 않고 아무 규칙에도 나오지 않는다", () => {
    const evaluation = evaluate(evaluationInput([claudeTool({ sessions: claudeSessions }), webTool("web-claude", [])]));
    expect(evaluation.tools.find((tool) => tool.tool === "web-claude")).toMatchObject({ scored: false });
    expect(evaluation.findings.flatMap((item) => item.tools).some((value) => value.tool === "web-claude")).toBe(false);
    const { tools: _tools, ...rest } = evaluation;
    const { tools: _onlyTools, ...onlyRest } = claudeOnly();
    expect(rest).toEqual(onlyRest);
  });

  it("웹 채팅만 있으면 셋팅·효율·상황 적합은 잴 수 없고 강도만 잰다. 셋팅을 볼 도구가 없어 AQ를 내지 않는다", () => {
    const evaluation = evaluate(evaluationInput([webTool("web-chatgpt", chatSessions)]));
    expect(evaluation.score).toMatchObject({ aq: null, withheld: ["no_setup_tools"] });
    expect(finding(evaluation, "S3")).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(evaluation.axes.map((axis) => [axis.axis, axis.score === null])).toEqual([
      ["setup", true],
      ["efficiency", true],
      ["fit", true],
      ["intensity", false],
    ]);
  });
});
