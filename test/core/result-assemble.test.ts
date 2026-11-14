// 평가 결과의 조립(필드와 차례, 도구별 값의 관측 범위, 알림을 합친 차례, 따로 둔 자리와 E6 정보)을 시험한다(설계 12.2, 13.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { findingText } from "../../src/core/copy/findings.ts";
import { resultText } from "../../src/core/copy/grades.ts";
import { noticeText } from "../../src/core/copy/notices.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, RESULT_SCHEMA, type ResultInput } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const collected = (input: Partial<CollectedTool> = {}): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
  ...input,
});
const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
const resultInput = (tool: ClaudeToolInput, extra: Partial<ResultInput> = {}): ResultInput => {
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return { input, evaluation: evaluate(input), collected: [collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false }, ...extra };
};

describe("평가 결과의 조립", () => {
  it("필드를 정해진 차례로 싣고 형식 버전, 규칙 버전, 프로그램 버전, 평가 시계, 시간대, 구간을 담는다", () => {
    const input = resultInput({});
    const result = checkupResult(input);
    expect(Object.keys(result)).toEqual(["schema", "rulesVersion", "appVersion", "evaluatedAt", "timezone", "lang", "window", "tools", "coverage", "score", "text", "axes", "findings", "candidates", "usage", "deepHints", "notices", "details"]);
    expect(RESULT_SCHEMA).toBe(1);
    expect(result).toMatchObject({ schema: 1, rulesVersion: "1.0.0", appVersion: "0.1.0", evaluatedAt: "2026-11-13T03:00:00.000Z", timezone: "Asia/Seoul", lang: "ko", window: input.evaluation.windows });
    expect(result.score).toEqual(input.evaluation.score);
    expect(result.axes).toEqual(input.evaluation.axes);
    expect(result.candidates).toEqual(input.evaluation.candidates);
  });

  it("규칙의 차례와 값은 평가 그대로이고, 도구별 규칙의 도구별 값에만 관측 범위를 붙인다", () => {
    const input = resultInput({ coverage: { ...CLAUDE_COVERAGE, effort: "proxy" } });
    const result = checkupResult(input);
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(input.evaluation.findings.map((finding) => finding.ruleId));
    const f1 = result.findings.find((finding) => finding.ruleId === "F1")!;
    expect(f1.tools.map((value) => value.observed)).toEqual(["proxy"]);
    expect(result.findings.find((finding) => finding.ruleId === "E1")!.tools[0]!.observed).toBe("measured");
    expect(result.findings.find((finding) => finding.ruleId === "S1")!.tools).toEqual([]);
    const { tools, text: _text, ...rest } = f1;
    const { tools: originalTools, ...originalRest } = input.evaluation.findings.find((finding) => finding.ruleId === "F1")!;
    expect(rest).toEqual(originalRest);
    expect(tools.map(({ observed: _observed, ...value }) => value)).toEqual(originalTools);
  });

  it("알림은 기록 쪽과 셋팅 쪽을 합쳐 정해진 차례로 싣는다", () => {
    const result = checkupResult(resultInput({ setup: { claudeJson: "unreadable" } }, { collected: [collected({ overlappingSessions: 1 })], run: { stateBroken: true } }));
    expect(result.notices.map((notice) => notice.kind)).toEqual(["state_reset", "setup_unreadable", "overlapping_responses"]);
  });

  it("따로 둔 자리에 S2의 근거, F3과 F4의 프로젝트, E6의 판정에서 뺀 서버 가운데 부른 기록이 없는 것을 까닭과 함께 싣는다", () => {
    const servers = [mcpServer("zeta", { definitionHash: null }), mcpServer("alpha"), mcpServer("called"), mcpServer("off", { enabled: false, definitionHash: null })];
    const sessions = [...enough, { days: { "2026-11-12": { responses: 1, mcpCalls: { called: 2 } } } }];
    const input = resultInput({ sessions, setup: { mcpServers: servers } });
    const result = checkupResult(input);
    expect(Object.keys(result.details)).toEqual(["safeguards", "missingInstructions", "worstOverlap", "unjudgedServers"]);
    expect(result.details.safeguards).toEqual(input.evaluation.safeguards);
    expect(result.details.unjudgedServers).toEqual([
      { tool: "claude-code", name: "alpha", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "not_established" },
      { tool: "claude-code", name: "zeta", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "no_definition" },
    ]);
    const incomplete = checkupResult(resultInput({ sessions, setup: { mcpServers: servers }, complete: { mcp: false } }));
    expect(incomplete.details.unjudgedServers.map((server) => server.why)).toEqual(["observation_incomplete", "no_definition"]);
  });

  it("프로젝트 범위의 판정에서 뺀 서버에는 그 프로젝트의 폴더 이름을 함께 싣는다. 경로는 정규화한 것 그대로 둔다", () => {
    const local = mcpServer("local-db", { scope: "local", projectRoot: "c:/work/myapp" });
    const result = checkupResult(resultInput({ setup: { mcpServers: [local], projects: [project("C:/Work/MyApp", { normRoot: "c:/work/myapp", cwds: ["c:/work/myapp"] })] } }));
    expect(result.details.unjudgedServers).toEqual([{ tool: "claude-code", name: "local-db", scope: "local", projectRoot: "c:/work/myapp", projectName: "MyApp", pluginId: null, why: "not_established" }]);
  });

  it("JSON으로 바꿨다가 되살려도 같다. 값이 없는 자리는 null이다", () => {
    const result = checkupResult(resultInput({}));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("undefined");
  });

  it("규칙, 알림, 결과에 두 언어의 문장을 싣는다. 문장은 문구 표에서 만든 그대로이고 이름과 경로가 없다", () => {
    const servers = [mcpServer("secret-server", { scope: "claude-ai", definitionHash: null })];
    const result = checkupResult(resultInput({ setup: { mcpServers: servers, pluginsWithoutInstall: ["secret-plugin@m"] } }, { collected: [collected({ read: { ...collected().read, unreadableFiles: ["/secret/s.jsonl"] } })] }));
    const details = { safeguards: result.details.safeguards, unjudgedServers: result.details.unjudgedServers };
    for (const finding of result.findings) {
      const { text, ...rest } = finding;
      expect(text).toEqual({ en: findingText(rest, details, "en"), ko: findingText(rest, details, "ko") });
    }
    for (const notice of result.notices) {
      const { text, ...rest } = notice;
      expect(text).toEqual({ en: noticeText(rest, "en"), ko: noticeText(rest, "ko") });
    }
    const categories = result.findings.map((finding) => finding.category);
    expect(result.text).toEqual({ en: resultText(result.score, categories, "en"), ko: resultText(result.score, categories, "ko") });
    expect(result.details.unjudgedServers.length).toBeGreaterThan(0);
    expect(result.notices.length).toBeGreaterThan(0);
    expect(JSON.stringify([result.text, result.findings.map((finding) => finding.text), result.notices.map((notice) => notice.text)])).not.toMatch(/secret/);
  });

  it("언어만 다르면 처음 보일 언어만 다르다", () => {
    const korean = checkupResult(resultInput({}));
    const english = checkupResult(resultInput({}, { lang: "en" }));
    expect(english.lang).toBe("en");
    expect({ ...english, lang: "ko" }).toEqual(korean);
  });
});
