// 평가 결과의 조립(필드와 차례, 도구별 값의 관측 범위, 알림을 합친 차례, 따로 둔 자리와 E6 정보)을 시험한다(설계 12.2, 13.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { findingText } from "../../src/core/copy/findings.ts";
import { resultText } from "../../src/core/copy/grades.ts";
import { noticeText } from "../../src/core/copy/notices.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { nextGrade } from "../../src/core/next-grade.ts";
import { checkupResult, RESULT_SCHEMA, type ResultInput } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import type { SetupProblem } from "../../src/scan/types.ts";
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

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

describe("그대로 두기로 한 규칙(0.3.0, 다른 PC 피드백 5번)", () => {
  it("결과에 목록을 싣고, 다음 등급의 차례에서 빼되 점수는 그대로 둔다", () => {
    const plain = checkupResult(resultInput({}));
    expect(plain.ignored).toEqual([]);
    expect(plain.nextGrade).not.toBeNull();
    const first = plain.nextGrade!.steps[0]!.ruleId;
    const kept = checkupResult({ ...resultInput({}), ignored: [first] });
    expect(kept.ignored).toEqual([first]);
    expect(kept.score).toEqual(plain.score);
    expect(kept.findings.map((f) => [f.ruleId, f.score])).toEqual(plain.findings.map((f) => [f.ruleId, f.score]));
    expect(kept.nextGrade?.steps.map((step) => step.ruleId) ?? []).not.toContain(first);
  });
});

describe("연결에 실패한 MCP 서버(0.3.0, 다른 PC 피드백 2번)", () => {
  it("점수 구간에 응답이 있는 주 세션마다 실패한 서버를 세어, 세션 수가 많은 차례로 싣는다. 점수 구간 밖의 실패와 하위 세션은 세지 않는다", () => {
    const sessions: SummaryInput[] = [
      ...enough,
      { days: { "2026-11-12": { responses: 1, mcpConnectionFailure: true, mcpFailedServers: { gone: 3, auth: 1 } } } },
      { days: { "2026-11-13": { responses: 2, mcpConnectionFailure: true, mcpFailedServers: { gone: 1 } } } },
      { days: { "2026-09-01": { responses: 2, mcpConnectionFailure: true, mcpFailedServers: { old: 9 } } } },
      { kind: "sub", days: { "2026-11-13": { responses: 2, mcpConnectionFailure: true, mcpFailedServers: { sub: 1 } } } },
    ];
    const result = checkupResult(resultInput({ sessions }));
    expect(result.details.failedMcpServers).toEqual([
      { tool: "claude-code", name: "gone", sessions: 2 },
      { tool: "claude-code", name: "auth", sessions: 1 },
    ]);
  });
});

describe("설정 속 비밀값의 자리(0.2.0)", () => {
  it("결과 화면이 그릴 자리 목록은 도구 차례로 두고, 프로젝트 범위에는 프로젝트 폴더 이름을 붙인다. 값은 없다", () => {
    const input = evaluationInput([
      claudeTool({ sessions: enough, setup: { projects: [project("/work/shop")], secrets: [{ scope: "project", server: "pj", projectRoot: "/work/shop", field: "headers", key: "Authorization" }, { scope: "settings", server: null, projectRoot: null, field: "env", key: "ANTHROPIC_API_KEY" }] } }),
      codexTool({ sessions: enough, setup: { secrets: [{ scope: "user", server: "ctx", projectRoot: null, field: "env", key: "API_TOKEN" }] } }),
    ]);
    const result = checkupResult({ input, evaluation: evaluate(input), collected: [collected(), collected({ tool: "codex" })], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    expect(result.details.credentialPlaces).toEqual([
      { tool: "claude-code", scope: "project", server: "pj", projectName: "shop", field: "headers", key: "Authorization" },
      { tool: "claude-code", scope: "settings", server: null, projectName: null, field: "env", key: "ANTHROPIC_API_KEY" },
      { tool: "codex", scope: "user", server: "ctx", projectName: null, field: "env", key: "API_TOKEN" },
    ]);
    expect(result.notices.filter((notice) => notice.kind === "credentials_in_config").map((notice) => ("tool" in notice ? notice.tool : null))).toEqual(["claude-code", "codex"]);
  });
});

describe("다음 등급까지 할 일(0.2.0)", () => {
  it("평가의 규칙 점수로 다시 계산한 차례를 싣고, 두 언어의 문장에 차례마다 규칙 이름과 그때의 AQ가 든다", () => {
    const source = resultInput({});
    const result = checkupResult(source);
    // 이 시험이 헛돌지 않게, 보기 홈의 등급이 S가 아님을 먼저 본다
    expect(result.score.aq).not.toBeNull();
    expect(result.score.grade).not.toBe("S");
    const expected = nextGrade(source.evaluation.findings.map((f) => ({ ruleId: f.ruleId, axis: f.axis, weight: f.weight, score: f.score, gain: f.gain })), source.evaluation.score)!;
    expect(expected.steps.length).toBeGreaterThan(0);
    const { text, ...plan } = result.nextGrade!;
    expect(plan).toEqual(expected);
    for (const lang of ["en", "ko"] as const) {
      for (const step of expected.steps) {
        const name = result.findings.find((f) => f.ruleId === step.ruleId)!.text[lang].name;
        // 화살표와 숫자 사이는 보통 빈칸이다. 모델이 그대로 옮기기 쉽게 하고, 화면에서는 결과 화면이 둘을 묶는다(0.3.0, 다른 PC 피드백 6번)
        expect(text[lang]).toContain(lang === "ko" ? `${name}(→ ${step.aq})` : `${name} (→ ${step.aq})`);
      }
      expect(text[lang]).not.toContain(String.fromCharCode(0xa0));
      expect(text[lang]).toContain(String(expected.need));
    }
  });

  it("AQ를 내지 않았으면 없다", () => {
    const input = evaluationInput([claudeTool({ sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 1 } } }] })]);
    const result = checkupResult({ input, evaluation: evaluate(input), collected: [collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    expect(result.score.aq).toBeNull();
    expect(result.nextGrade).toBeNull();
  });
});

describe("합침 규칙의 어떻게 쟀나(설계 9.7, 「5단계 4부 계획 전 결정」 7번, 4부 계획 리뷰 1차)", () => {
  it("두 도구로 잰 I3과 I2에는 Codex의 가까운 값 줄이, I3에는 도구 호출을 세는 굵기의 줄이 붙는다. 한 도구만이면 굵기의 줄이 없다", () => {
    const days = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`2026-11-1${index}`, { responses: 3, humanRequests: 10, tools: { Bash: { calls: 10 } } }]));
    const sessions = [{ days: days(3) }];
    const both = evaluationInput([claudeTool({ sessions }), codexTool({ sessions })]);
    const result = checkupResult({ input: both, evaluation: evaluate(both), collected: [collected(), collected({ tool: "codex" })], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    const method = (ruleId: string) => result.findings.find((finding) => finding.ruleId === ruleId)!.text.ko.method;
    const proxy = "Codex: 기록이 그대로 남기지 않는 값이라 가까운 값으로 쟀습니다.";
    const grain = "도구 호출을 세는 굵기가 도구마다 다릅니다. Claude Code는 모델이 낸 호출 하나가, Codex는 실제로 실행된 작업 하나가 하나입니다.";
    expect(result.findings.find((finding) => finding.ruleId === "I3")).toMatchObject({ status: "scored", tools: [] });
    expect(method("I3").slice(-2)).toEqual([proxy, grain]);
    expect(method("I2").at(-1)).toBe(proxy);
    const claudeOnly = evaluationInput([claudeTool({ sessions })]);
    const single = checkupResult({ input: claudeOnly, evaluation: evaluate(claudeOnly), collected: [collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    const singleMethod = single.findings.find((finding) => finding.ruleId === "I3")!.text.ko.method;
    expect(singleMethod).not.toContain(grain);
    expect(singleMethod.some((line) => line.includes("가까운 값"))).toBe(false);
  });
});

describe("평가 결과의 조립", () => {
  it("필드를 정해진 차례로 싣고 형식 버전, 규칙 버전, 프로그램 버전, 평가 시계, 시간대, 구간을 담는다", () => {
    const input = resultInput({});
    const result = checkupResult(input);
    expect(Object.keys(result)).toEqual(["schema", "rulesVersion", "appVersion", "evaluatedAt", "timezone", "lang", "window", "tools", "coverage", "score", "text", "axes", "findings", "candidates", "usage", "deepHints", "notices", "details", "nextGrade", "ignored"]);
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
    expect(Object.keys(result.details)).toEqual(["safeguards", "missingInstructions", "worstOverlap", "unjudgedServers", "setupProblems", "credentialPlaces", "failedMcpServers"]);
    expect(result.details.safeguards).toEqual(input.evaluation.safeguards);
    expect(result.details.unjudgedServers).toEqual([
      { tool: "claude-code", name: "alpha", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "not_established", judgeFrom: "2026-11-28" },
      { tool: "claude-code", name: "zeta", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "no_definition", judgeFrom: null },
    ]);
    const incomplete = checkupResult(resultInput({ sessions, setup: { mcpServers: servers }, complete: { mcp: false } }));
    expect(incomplete.details.unjudgedServers.map((server) => [server.why, server.judgeFrom])).toEqual([["observation_incomplete", null], ["no_definition", null]]);
  });

  it("프로젝트 범위의 판정에서 뺀 서버에는 그 프로젝트의 폴더 이름을 함께 싣는다. 경로는 정규화한 것 그대로 둔다", () => {
    const local = mcpServer("local-db", { scope: "local", projectRoot: "c:/work/myapp" });
    const result = checkupResult(resultInput({ setup: { mcpServers: [local], projects: [project("C:/Work/MyApp", { normRoot: "c:/work/myapp", cwds: ["c:/work/myapp"] })] } }));
    expect(result.details.unjudgedServers).toEqual([{ tool: "claude-code", name: "local-db", scope: "local", projectRoot: "c:/work/myapp", projectName: "MyApp", pluginId: null, why: "not_established", judgeFrom: "2026-11-28" }]);
  });

  it("지켜보는 중인 서버를 판정할 수 있게 되는 날은 관측 기록의 첫날로 셈하고, 첫 점검을 저장한 뒤 같은 날 다시 점검해도 같다(설계 12.1의 예외)", () => {
    const watching = mcpServer("watching");
    const seen = (firstSeen: string) => [{ key: watching.installKey!, firstSeen, appeared: false }];
    const judgeFromWith = (installs: { key: string; firstSeen: string; appeared: boolean }[] | null) => {
      const input = evaluationInput([claudeTool({ sessions: enough, setup: { mcpServers: [watching] } })], { installs });
      return checkupResult({ input, evaluation: evaluate(input), collected: [collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } }).details.unjudgedServers.map((server) => server.judgeFrom);
    };
    expect(judgeFromWith(seen("2026-11-03"))).toEqual(["2026-11-18"]);
    expect(judgeFromWith(null)).toEqual(["2026-11-28"]);
    expect(judgeFromWith(seen("2026-11-13"))).toEqual(judgeFromWith(null));
  });

  it("따로 둔 자리에 S3가 센 문제의 도구, 종류, 위치를 S3가 센 차례대로 싣는다. 절대 경로는 싣지 않는다", () => {
    const problems: SetupProblem[] = [
      { kind: "unparsable", owner: "user", path: "/home/u/.claude/settings.json", realPath: "/home/u/.claude/settings.json", place: "~/.claude/settings.json" },
      { kind: "noFrontmatter", owner: "user", path: "/work/app/.claude/skills/x", realPath: "/shared/x", place: "app/.claude/skills/x" },
      { kind: "noFrontmatter", owner: "user", path: "/home/u/.claude/skills/x", realPath: "/shared/x", place: "~/.claude/skills/x" },
      { kind: "noFrontmatter", owner: "plugin", path: "/home/u/.claude/plugins/p/skills/y", realPath: null, place: null },
    ];
    const result = checkupResult(resultInput({ setup: { problems } }));
    expect(result.details.setupProblems).toEqual([
      { tool: "claude-code", kind: "unparsable", place: "~/.claude/settings.json" },
      { tool: "claude-code", kind: "noFrontmatter", place: "app/.claude/skills/x" },
    ]);
    expect(result.findings.find((finding) => finding.ruleId === "S3")!.evidence).toMatchObject({ problems: 2 });
    expect(JSON.stringify(result.details.setupProblems)).not.toMatch(/\/home|\/work|\/shared/);
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
