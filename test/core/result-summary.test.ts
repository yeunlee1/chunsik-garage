// 터미널에 전할 요약(AQ와 등급, 기준 점수, 가장 잘하는 것, 먼저 고칠 것 셋까지, 이름 없는 알림)을 시험한다. 요약에는 스킬·서버·프로젝트의 이름과 경로가 들어가지 않는다(설계 11.5, 12.3, 15, 19.1)
import { describe, expect, it } from "vitest";
import { findingText, type FindingInput } from "../../src/core/copy/findings.ts";
import { noticeText } from "../../src/core/copy/notices.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult, type ResultFinding } from "../../src/core/result/assemble.ts";
import type { Notice } from "../../src/core/result/notices.ts";
import { checkupSummary, FIX_FIRST_LIMIT } from "../../src/core/result/summary.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";

const collected: CollectedTool = {
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: ["/home/u/.claude/projects/secret-app/s.jsonl"], unreadableFileBytes: 10, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
};
const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
function baseResult(): CheckupResult {
  const input = evaluationInput([claudeTool({ sessions: enough, setup: { pluginsWithoutInstall: ["secret-plugin@m"] } })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", lang: "en", run: { stateBroken: false } });
}
const finding = (ruleId: ResultFinding["ruleId"], input: Partial<FindingInput>): ResultFinding => {
  const source: FindingInput = { ruleId, axis: "efficiency", kind: "share", weight: 2, status: "scored", reason: null, value: 0.5, score: 0.5, category: "average", severity: null, gain: null, evidence: {}, tools: [], candidates: [], ...input };
  const details = { safeguards: [], unjudgedServers: [] };
  return { ...source, text: { en: findingText(source, details, "en"), ko: findingText(source, details, "ko") } };
};

describe("요약", () => {
  it("AQ, 등급, 단계, 보류한 까닭, 기준 점수를 평가 결과 그대로 싣는다", () => {
    const result = baseResult();
    const summary = checkupSummary(result, null);
    expect(Object.keys(summary)).toEqual(["aq", "grade", "tier", "withheld", "axes", "best", "fixFirst", "notices", "reportPath", "lang", "text"]);
    expect(summary).toMatchObject({ aq: result.score.aq, grade: result.score.grade, tier: result.score.tier, withheld: result.score.withheld, reportPath: null });
    expect(summary.axes).toEqual(result.axes.map((axis) => ({ axis: axis.axis, score: axis.score })));
  });

  it("가장 잘하는 것은 잘하고 있는 것의 첫 항목이고, 없으면 null이다", () => {
    const result = { ...baseResult(), findings: [finding("E1", { category: "strength", value: 0.95, score: 1 }), finding("S1", { axis: "setup", category: "strength", value: 1, score: 1 })] };
    expect(checkupSummary(result, null).best).toEqual({ ruleId: "E1", axis: "efficiency", kind: "share", value: 0.95 });
    expect(checkupSummary({ ...result, findings: [finding("E2", { category: "repair", gain: 3 })] }, null).best).toBeNull();
  });

  it("먼저 고칠 것은 정비할 것의 앞 셋이고, 덧붙이는 말의 재료(예상 효과, 후보 수, 비율을 못 잰 도구)를 싣는다", () => {
    expect(FIX_FIRST_LIMIT).toBe(3);
    const result = {
      ...baseResult(),
      findings: [
        finding("E3", { category: "repair", gain: 6, severity: "critical" }),
        finding("E5", { category: "repair", status: "unmeasured", reason: "too_little", value: null, score: null, gain: null, severity: "info", candidates: ["A1:claude-code:x"], tools: [{ tool: "claude-code", status: "unmeasured", reason: "too_little", value: null, score: null, evidence: {}, candidates: ["A1:claude-code:x"], observed: "measured" }] }),
        finding("E6", { category: "repair", gain: null, score: 1, value: 0, severity: "info", candidates: ["A3:claude-code:a", "A3:claude-code:b"] }),
        finding("F1", { axis: "fit", category: "repair", gain: 1, severity: "info" }),
        finding("E1", { category: "strength", score: 1 }),
      ],
    };
    expect(checkupSummary(result, null).fixFirst).toEqual([
      { ruleId: "E3", axis: "efficiency", gain: 6, measured: true, candidates: 0, unmeasuredTools: [] },
      { ruleId: "E5", axis: "efficiency", gain: null, measured: false, candidates: 1, unmeasuredTools: ["claude-code"] },
      { ruleId: "E6", axis: "efficiency", gain: null, measured: true, candidates: 2, unmeasuredTools: [] },
    ]);
  });

  it("알림 열세 종류마다 정해진 값과 대상의 수만 싣고, 알림에 든 경로와 이름은 싣지 않는다", () => {
    const notices: Notice[] = [
      { kind: "score_withheld", reasons: ["too_few_days"] },
      { kind: "state_reset" },
      { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl"], dirs: ["/secret/d"] },
      { kind: "observation_incomplete", tool: "claude-code", metric: "mcp", reasons: ["unreadable-files"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "mcp_json", targets: ["/secret/proj"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "composition_unknown", plugins: ["secret@m"] },
      { kind: "setup_problems_unscored", tool: "claude-code", problems: [{ kind: "noFrontmatter", path: "/secret/p" }] },
      { kind: "projects_gone", projects: ["/secret/gone", "/secret/gone-too"] },
      { kind: "version_unverified", tool: "claude-code", versions: ["2.1.400"], verified: { from: "2.1.220", to: "2.1.322" } },
      { kind: "weak_human_requests", tool: "claude-code", weak: 3, total: 10 },
      { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
      { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:secret-kind", count: 2 }] },
      { kind: "orphan_subsessions", tool: "claude-code", sessions: 4 },
    ];
    const summary = checkupSummary({ ...baseResult(), notices: notices.map((notice) => ({ ...notice, text: { en: noticeText(notice, "en"), ko: noticeText(notice, "ko") } })) }, null);
    expect(summary.notices).toEqual([
      { kind: "score_withheld", tool: null, detail: null, count: null },
      { kind: "state_reset", tool: null, detail: null, count: null },
      { kind: "record_unreadable", tool: "claude-code", detail: null, count: 2 },
      { kind: "observation_incomplete", tool: "claude-code", detail: "mcp", count: null },
      { kind: "setup_unreadable", tool: "claude-code", detail: "claude_json", count: null },
      { kind: "setup_unreadable", tool: "claude-code", detail: "mcp_json", count: 1 },
      { kind: "plugins_uncounted", tool: "claude-code", detail: "composition_unknown", count: 1 },
      { kind: "setup_problems_unscored", tool: "claude-code", detail: null, count: 1 },
      { kind: "projects_gone", tool: null, detail: null, count: 2 },
      { kind: "version_unverified", tool: "claude-code", detail: null, count: 1 },
      { kind: "weak_human_requests", tool: "claude-code", detail: null, count: 3 },
      { kind: "overlapping_responses", tool: "claude-code", detail: null, count: 2 },
      { kind: "unclassified", tool: "claude-code", detail: null, count: 3 },
      { kind: "orphan_subsessions", tool: "claude-code", detail: null, count: 4 },
    ]);
    expect(JSON.stringify(summary.notices)).not.toContain("secret");
  });

  it("알림은 종류와 수만 싣고 경로와 이름은 싣지 않는다", () => {
    const summary = checkupSummary(baseResult(), "/report.html");
    expect(summary.notices).toEqual([
      { kind: "record_unreadable", tool: "claude-code", detail: null, count: 1 },
      { kind: "plugins_uncounted", tool: "claude-code", detail: "not_installed", count: 1 },
    ]);
    const text = JSON.stringify(summary);
    expect(text).not.toContain("secret");
    expect(summary.reportPath).toBe("/report.html");
  });
});

describe("요약의 문장", () => {
  const e5Value = { tool: "claude-code" as const, status: "unmeasured" as const, reason: "too_little" as const, value: null, score: null, evidence: { enabled: 4, judgeable: 2, judged: 2, structural: 2, unused: 1, used: 1 }, candidates: ["A1:claude-code:x"], observed: "measured" as const };

  it("결과의 언어로 만든다. 별명, 진단, 알림은 결과의 문장 그대로다", () => {
    const korean = baseResult();
    const summary = checkupSummary({ ...korean, lang: "ko" }, null);
    expect(summary.lang).toBe("ko");
    expect(summary.text).toMatchObject({ grade: korean.text.ko.grade, diagnosis: korean.text.ko.diagnosis, notices: korean.notices.map((notice) => notice.text.ko) });
    expect(checkupSummary(korean, null).text.diagnosis).toBe(korean.text.en.diagnosis);
  });

  it("가장 잘하는 것은 잘하는 것의 제목과 규칙 이름에 붙인 잰 값이다", () => {
    const result = { ...baseResult(), lang: "ko" as const, findings: [finding("E1", { category: "strength", value: 0.96, score: 1 })] };
    expect(checkupSummary(result, null).text).toMatchObject({ best: { title: "같은 내용을 다시 계산시키지 않음", detail: "캐시 적중 96%" }, noBest: null });
    expect(checkupSummary({ ...result, lang: "en" }, null).text.best).toEqual({ title: "Reuses cached context instead of recomputing it", detail: "Cache hits 96%" });
  });

  it("먼저 고칠 것은 할 일의 제목과 덧붙이는 말이다. 예상 효과가 없으면 후보의 수를 적고 0을 넣지 않는다(설계 11.5)", () => {
    const measured = { ...e5Value, status: "scored" as const, reason: null, value: 0.1, score: 1, candidates: [] };
    const result = {
      ...baseResult(),
      lang: "ko" as const,
      findings: [
        finding("E3", { category: "repair", gain: 5, severity: "critical", kind: "rate", value: 2 }),
        finding("E5", { category: "repair", status: "unmeasured", reason: "too_little", value: null, score: null, severity: "info", candidates: ["A1:claude-code:x"], tools: [e5Value] }),
        finding("E6", { category: "repair", value: 0.1, score: 1, severity: "info", candidates: ["A3:claude-code:a", "A3:claude-code:b"], tools: [measured, { ...e5Value, candidates: ["A3:claude-code:a", "A3:claude-code:b"] }] }),
      ],
    };
    expect(checkupSummary(result, null).text.fixFirst).toEqual([
      { title: "긴 세션 나누기", detail: "효율 최대 +5" },
      { title: "안 쓰는 스킬 끄기", detail: "정리할 것 1개 · 비율은 잴 수 없음" },
      { title: "안 쓰는 MCP 서버 끄기", detail: "정리할 것 2개 · Claude Code의 비율은 잴 수 없음" },
    ]);
    expect(checkupSummary({ ...result, lang: "en" }, null).text.fixFirst.map((fix) => fix.detail)).toEqual(["Efficiency up to +5", "1 to clean up · share not measured", "2 to clean up · share for Claude Code not measured"]);
    expect(checkupSummary(result, null).text.noFixFirst).toBeNull();
  });

  it("AQ를 내지 않았으면 먼저 고칠 것의 칸은 두고 숫자 자료와 문장을 비운다. 정비할 것이 있으므로 빈 목록의 문장도 없다(설계 12.3)", () => {
    const input = evaluationInput([claudeTool({ sessions: [{ days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }] })]);
    const result = checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    expect(result.score.aq).toBeNull();
    expect(result.findings.some((finding) => finding.category === "repair")).toBe(true);
    const summary = checkupSummary(result, null);
    expect(Object.keys(summary)).toContain("fixFirst");
    expect(summary.fixFirst).toEqual([]);
    expect(summary.text.fixFirst).toEqual([]);
    expect(summary.text.noFixFirst).toBeNull();
    // 같은 결과에서 AQ만 냈다고 바꾸면 먼저 고칠 것이 나온다
    const scored = { ...result, score: { ...result.score, aq: 70, grade: "B", tier: 3, withheld: [] } as CheckupResult["score"] };
    expect(checkupSummary(scored, null).fixFirst.length).toBeGreaterThan(0);
  });

  it("AQ를 내지 않았고 정비할 것도 없으면 빈 목록의 문장을 그대로 싣는다", () => {
    const base = baseResult();
    const result = { ...base, lang: "ko" as const, score: { ...base.score, aq: null, grade: null, tier: null, withheld: ["too_few_days"] } as CheckupResult["score"], findings: [finding("E1", { category: "average" })] };
    const text = { ...result.text, ko: { ...result.text.ko, noRepairs: "지금은 고칠 것이 없습니다." } };
    expect(checkupSummary({ ...result, text }, null).text).toMatchObject({ fixFirst: [], noFixFirst: "지금은 고칠 것이 없습니다." });
  });

  it("가장 잘하는 것이나 먼저 고칠 것이 없으면 빈 목록의 문장을 싣는다", () => {
    const result = { ...baseResult(), lang: "ko" as const, findings: [finding("E1", { category: "average" })] };
    const text = { ...result.text, ko: { ...result.text.ko, noStrengths: "아직 뚜렷한 강점을 찾지 못했습니다. 고칠 것부터 하나씩 해 봅시다.", noRepairs: "지금은 고칠 것이 없습니다." } };
    expect(checkupSummary({ ...result, text }, null).text).toMatchObject({ best: null, noBest: "아직 뚜렷한 강점을 찾지 못했습니다. 고칠 것부터 하나씩 해 봅시다.", fixFirst: [], noFixFirst: "지금은 고칠 것이 없습니다." });
  });
});
