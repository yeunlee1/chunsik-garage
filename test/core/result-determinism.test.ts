// 평가 결과의 결정성을 시험한다. 같은 입력 묶음이면 연달아 두 번 만들어도, 세션 요약·셋팅 사실·읽지 못한 파일의 차례를 섞어도 글자 하나 다르지 않다(설계 2, 12.2, 21.1 「결정성」)
import { describe, expect, it } from "vitest";
import { evaluate, type EvaluationInput } from "../../src/core/evaluate.ts";
import { checkupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { HOME, instructions, mcpServer, plugin, project, skill } from "../helpers/facts.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

const sessions: SummaryInput[] = [
  { sessionId: "m1", version: "2.1.400", days: { "2026-11-10": { responses: 3, humanRequests: 10, weakHumanRequests: 3, unknownDenialKinds: { odd: 1 } } } },
  { sessionId: "m2", days: { "2026-11-11": { responses: 2, humanRequests: 10, tools: { Bash: { calls: 2, results: 2, errors: 1 } } } } },
  { sessionId: "m3", days: { "2026-11-12": { responses: 2, humanRequests: 10, mcpCalls: { used: 1 } } } },
  { sessionId: "s1", kind: "sub", parentSessionId: null, days: { "2026-11-12": { responses: 1 } } },
];
const setup = {
  claudeJson: "ok" as const,
  skills: [skill("beta"), skill("alpha"), skill("locked", { readable: false })],
  mcpServers: [mcpServer("zeta", { definitionHash: null }), mcpServer("alpha"), mcpServer("used")],
  plugins: [plugin("b@m", { compositionKnown: false }), plugin("a@m", { compositionKnown: false })],
  projects: [project("/work/b", { exists: false }), project("/work/a", { mcpJsonStatus: "unparsable", instructions: instructions({ lineHashes: ["x1", "x2", "x3"] }) }), project("/work/c", { instructions: instructions({ lineHashes: ["x1", "x2", "x3"] }) })],
  unreadableDirs: [`${HOME}/skills/zz`, `${HOME}/skills/aa`],
  globalMentions: { "/work/c": 4, "/work/a": 3 },
};
const collected = (files: string[]): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 1,
  read: { files: 9, listedBytes: 900, bytes: 800, inProgress: 0, olderThanWindow: 2, unreadableFiles: files, unreadableFileBytes: 100, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: false, reasons: ["unreadable-files"] }, mcp: { complete: false, reasons: ["unreadable-files"] } },
});
const resultText = (input: EvaluationInput, files: string[]): string => JSON.stringify(checkupResult({ input, evaluation: evaluate(input), collected: [collected(files)], appVersion: "0.1.0", lang: "en", run: { stateBroken: true } }));

describe("평가 결과의 결정성", () => {
  it("연달아 두 번 만들어도 글자 하나 다르지 않다", () => {
    const input = evaluationInput([claudeTool({ sessions, setup })]);
    expect(resultText(input, ["/x/b.jsonl", "/x/a.jsonl"])).toBe(resultText(input, ["/x/b.jsonl", "/x/a.jsonl"]));
  });

  it("세션 요약, 셋팅 사실, 읽지 못한 파일의 차례를 뒤집어도 글자 하나 다르지 않다", () => {
    const forward = evaluationInput([claudeTool({ sessions, setup })]);
    const backward = evaluationInput([
      claudeTool({
        sessions: [...sessions].reverse(),
        setup: { ...setup, skills: [...setup.skills].reverse(), mcpServers: [...setup.mcpServers].reverse(), plugins: [...setup.plugins].reverse(), projects: [...setup.projects].reverse(), unreadableDirs: [...setup.unreadableDirs].reverse() },
      }),
    ]);
    expect(resultText(backward, ["/x/a.jsonl", "/x/b.jsonl"])).toBe(resultText(forward, ["/x/b.jsonl", "/x/a.jsonl"]));
  });
});
