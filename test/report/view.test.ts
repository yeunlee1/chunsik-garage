// 결과 화면이 그리는 칸 고르기를 시험한다. 절대 경로를 옮기지 않는지, AQ를 내지 않았을 때, 판정을 시작할 수 있는 날까지의 날 수, 회차, 정리할 것의 이름(설계 13.1, 19.1, 「3단계 계획 전 결정」의 5·6·10번)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { reportView } from "../../src/report/view.ts";
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
const result = (tool: ClaudeToolInput = {}, extra: { collected?: CollectedTool } = {}): CheckupResult => {
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [extra.collected ?? collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
};

describe("결과 화면 자료", () => {
  it("절대 경로를 옮기지 않는다. 프로젝트는 폴더 이름으로, 서버는 이름과 프로젝트 이름으로 옮긴다", () => {
    const root = "C:/SECRET-PARENT/MyApp";
    const projects = [project(root, { normRoot: "c:/secret-parent/myapp", cwds: ["c:/secret-parent/myapp"] })];
    const local = mcpServer("local-db", { scope: "local", projectRoot: "c:/secret-parent/myapp" });
    const sessions = [...enough, ...Array.from({ length: 3 }, () => ({ cwd: "c:/secret-parent/myapp", days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }))];
    const checked = result({ sessions, setup: { projects, mcpServers: [local] } }, { collected: collected({ read: { ...collected().read, unreadableFiles: ["C:/SECRET-PARENT/logs/s.jsonl"], unreadableDirs: ["C:/SECRET-PARENT/logs"] } }) });
    // 결과 파일에는 정규화한 경로와 알림의 경로가 있다
    expect(JSON.stringify(checked).toLowerCase()).toContain("secret-parent");
    const view = reportView(checked, { saved: true, round: 2 });
    expect(JSON.stringify(view).toLowerCase()).not.toContain("secret-parent");
    expect(view.missingInstructions).toEqual(["MyApp"]);
    expect(view.servers).toEqual([{ tool: "claude-code", name: "local-db", scope: "local", projectName: "MyApp", why: "not_established", daysUntil: 15 }]);
    expect(view.unreadable).toBe(true);
  });

  it("AQ를 내지 않았으면 그 알림의 문장을 점수 띠에 쓰고 알림 목록에서는 뺀다", () => {
    const thin = result({ sessions: [{ days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }] });
    expect(thin.score.aq).toBeNull();
    const view = reportView(thin, { saved: false, round: null });
    const notice = thin.notices.find((item) => item.kind === "score_withheld")!;
    expect(view.withheldText).toEqual(notice.text);
    expect(view.notices.map((item) => item.kind)).not.toContain("score_withheld");
    expect(view.score).toEqual({ aq: null, grade: null, tier: null, withheld: thin.score.withheld });
    expect(view.unreadable).toBe(false);
    const scored = reportView(result(), { saved: true, round: 1 });
    expect(scored.withheldText).toBeNull();
  });

  it("회차는 저장한 점검만 있다", () => {
    expect(reportView(result(), { saved: true, round: 3 }).round).toBe(3);
    expect(reportView(result(), { saved: false, round: 3 }).round).toBeNull();
  });

  it("읽지 못한 비율이 20%를 넘거나 아래 경계인 도구만 「일부만 읽었다」 띠의 자료로 옮긴다(경로는 옮기지 않는다)", () => {
    const read = collected().read;
    const bands = (input: Partial<CollectedTool["read"]>) => reportView(result({}, { collected: collected({ read: { ...read, ...input } }) }), { saved: true, round: 1 }).partialReads;
    expect(bands({})).toEqual([]);
    // 파일 5개 가운데 1개(20%)는 넘지 않은 것이다
    expect(bands({ files: 5, listedBytes: 500, unreadableFiles: ["C:/SECRET-PARENT/a.jsonl"], unreadableFileBytes: 100 })).toEqual([]);
    expect(bands({ files: 3, listedBytes: 300, unreadableFiles: ["C:/SECRET-PARENT/a.jsonl"], unreadableFileBytes: 100 })).toEqual([{ tool: "claude-code", share: 1 / 3, lowerBound: false }]);
    // 읽지 못한 폴더가 있으면 비율이 작아도 아래 경계로 띄우고, 목록에 파일이 없으면 비율을 내지 않는다
    expect(bands({ unreadableDirs: ["C:/SECRET-PARENT/logs"] })).toEqual([{ tool: "claude-code", share: 0, lowerBound: true }]);
    expect(bands({ files: 0, listedBytes: 0, bytes: 0, unreadableDirs: ["C:/SECRET-PARENT/logs"] })).toEqual([{ tool: "claude-code", share: null, lowerBound: true }]);
  });

  it("판정을 시작할 수 있는 날까지 남은 날 수를 평가 시계의 오늘에서 센다. 날을 모르면 null이다", () => {
    const checked = result({ setup: { mcpServers: [mcpServer("watching"), mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null })] } });
    const view = reportView(checked, { saved: true, round: 1 });
    expect(view.servers.map((server) => [server.name, server.why, server.daysUntil])).toEqual([
      ["claude.ai Mail", "no_definition", null],
      ["watching", "not_established", 15],
    ]);
  });

  it("규칙은 결과의 차례 그대로이고, 정리할 것은 후보의 대상 이름, 문장은 두 언어 그대로다", () => {
    const checked = result();
    const view = reportView(checked, { saved: true, round: 1 });
    expect(view.findings.map((finding) => finding.ruleId)).toEqual(checked.findings.map((finding) => finding.ruleId));
    for (const [index, finding] of view.findings.entries()) {
      const source = checked.findings[index]!;
      expect(finding.text).toEqual(source.text);
      expect(finding.targets).toEqual(source.candidates.map((id) => checked.candidates.find((candidate) => candidate.id === id)!.target));
      expect(finding.measured).toBe(source.status === "scored");
    }
    expect(view.tools).toEqual(["claude-code"]);
    expect(view.window).toEqual({ from: checked.window.score.from, to: checked.window.score.to });
  });
});
