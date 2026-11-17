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
    expect(Object.keys(summary)).toEqual(["aq", "grade", "tier", "withheld", "axes", "best", "fixFirst", "nextGrade", "notices", "credentialPlaces", "ignored", "reportPath", "lang", "text"]);
    expect(summary).toMatchObject({ aq: result.score.aq, grade: result.score.grade, tier: result.score.tier, withheld: result.score.withheld, reportPath: null });
    expect(summary.axes).toEqual(result.axes.map((axis) => ({ axis: axis.axis, score: axis.score })));
  });

  it("다음 등급까지는 결과의 것을 규칙과 숫자로만 싣고, 문장은 결과의 언어 하나다(0.2.0)", () => {
    const result = baseResult();
    const next = { grade: "A" as const, need: 3, reaches: true, steps: [{ ruleId: "E3" as const, axis: "efficiency" as const, aq: 81, grade: "A" as const }], text: { en: "3 points to grade A. Fix in this order: x (→ 81).", ko: "A등급까지 3점입니다. 고칠 차례: x(→ 81)." } };
    const summary = checkupSummary({ ...result, nextGrade: next }, null);
    expect(summary.nextGrade).toEqual({ grade: "A", need: 3, reaches: true, steps: [{ ruleId: "E3", axis: "efficiency", aq: 81, grade: "A" }] });
    expect(summary.text.nextGrade).toBe(next.text.en);
    expect(checkupSummary({ ...result, nextGrade: null }, null)).toMatchObject({ nextGrade: null, text: { nextGrade: null } });
  });

  it("설정 속 비밀값은 두 도구의 자리 수를 더한 한 문장으로 싣고, 자리(서버와 항목의 이름)는 값 없이 따로 싣는다. 없으면 null과 빈 목록이다(0.2.0, 0.3.0 다른 PC 피드백 2번)", () => {
    const place = (server: string) => ({ scope: "user" as const, server, projectRoot: null, field: "env" as const, key: "API_TOKEN" });
    const notices: Notice[] = [
      { kind: "credentials_in_config", tool: "claude-code", places: [place("secret-a"), place("secret-b")] },
      { kind: "credentials_in_config", tool: "codex", places: [place("secret-c")] },
    ];
    const withText = notices.map((notice) => ({ ...notice, text: { en: noticeText(notice, "en"), ko: noticeText(notice, "ko") } }));
    const base = baseResult();
    const places = [
      { tool: "claude-code" as const, scope: "user" as const, server: "secret-a", projectName: null, field: "env" as const, key: "API_TOKEN" },
      { tool: "codex" as const, scope: "user" as const, server: "secret-c", projectName: null, field: "env" as const, key: "API_TOKEN", copy: "default" as const },
    ];
    const en = checkupSummary({ ...base, notices: withText, details: { ...base.details, credentialPlaces: places } }, null);
    expect(en.text.credentials).toBe("3 places in your settings have an API key or token written as it is. See where in the report page and move them into environment variables.");
    const ko = checkupSummary({ ...baseResult(), lang: "ko", notices: withText }, null);
    expect(ko.text.credentials).toBe("설정 3곳에 API 키나 토큰이 그대로 적혀 있습니다. 결과 화면에서 위치를 보고 환경 변수로 옮기세요.");
    // 고칠 자리를 AI가 알 수 있게 이름은 싣는다(값은 사실에도 없다). 알림 칸에는 여전히 수만 싣는다
    expect(en.credentialPlaces).toEqual(places);
    expect(JSON.stringify(en.notices)).not.toContain("secret-");
    expect(checkupSummary(baseResult(), null).text.credentials).toBeNull();
    expect(checkupSummary(baseResult(), null).credentialPlaces).toEqual([]);
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
      { ruleId: "E3", axis: "efficiency", gain: 6, measured: true, candidates: 0, unmeasuredTools: [], targets: [], value: 0.5, score: 0.5, tools: [], zeroAt: 3, fullAt: 0.2 },
      { ruleId: "E5", axis: "efficiency", gain: null, measured: false, candidates: 1, unmeasuredTools: ["claude-code"], targets: ["A1:claude-code:x"], value: null, score: null, tools: [], zeroAt: 0.8, fullAt: 0.2 },
      { ruleId: "E6", axis: "efficiency", gain: null, measured: true, candidates: 2, unmeasuredTools: [], targets: ["A3:claude-code:a", "A3:claude-code:b"], value: 0, score: 1, tools: [], zeroAt: 0.7, fullAt: 0.1 },
    ]);
  });

  it("도구마다 재는 규칙은 잰 도구마다의 값과 점수를 싣는다. value는 응답 수로 평균한 값이라 만점 기준과 견줄 수 없다(짝 3차 필수 2번)", () => {
    const scored = (tool: "claude-code" | "codex", value: number, score: number) => ({ tool, status: "scored" as const, reason: null, value, score, evidence: {}, candidates: [], observed: "measured" as const });
    const f1 = finding("F1", {
      axis: "fit",
      category: "repair",
      gain: 1,
      value: 0.6,
      score: 0.5714,
      tools: [scored("claude-code", 0.3, 1), scored("codex", 0.9, 0.1429), { tool: "claude-code", status: "unmeasured", reason: "too_little", value: null, score: null, evidence: {}, candidates: [], observed: "measured" }],
    });
    const fix = checkupSummary({ ...baseResult(), findings: [f1] }, null).fixFirst[0]!;
    expect(fix.value).toBe(0.6);
    expect(fix.tools).toEqual([
      { tool: "claude-code", value: 0.3, score: 1 },
      { tool: "codex", value: 0.9, score: 0.1429 },
    ]);
  });

  it("사용자가 그대로 두기로 한 규칙은 먼저 고칠 것에서 빼고 그 목록을 따로 싣는다(0.3.0, 다른 PC 피드백 5번)", () => {
    const result = { ...baseResult(), ignored: ["E3" as const], findings: [finding("E3", { category: "repair", gain: 6 }), finding("F1", { axis: "fit", category: "repair", gain: 2 }), finding("E2", { category: "repair", gain: 1 })] };
    const summary = checkupSummary(result, null);
    expect(summary.fixFirst.map((fix) => fix.ruleId)).toEqual(["F1", "E2"]);
    expect(summary.text.fixFirst).toHaveLength(2);
    expect(summary.ignored).toEqual(["E3"]);
    expect(checkupSummary(baseResult(), null).ignored).toEqual([]);
  });

  it("먼저 고칠 것마다 고칠 대상의 이름을 싣는다. S3은 문제의 위치, S5는 연결에 실패한 서버, F3은 지침이 없는 프로젝트, F4는 가장 많이 겹친 프로젝트다(0.3.0, 다른 PC 피드백 2번)", () => {
    const base = baseResult();
    const result = {
      ...base,
      findings: [
        finding("S3", { axis: "setup", kind: "count", category: "repair", gain: 2 }),
        finding("S5", { axis: "setup", category: "repair", gain: 3 }),
        finding("F3", { axis: "fit", category: "repair", gain: 1 }),
        finding("F4", { axis: "fit", category: "repair", gain: 1 }),
      ],
      details: {
        ...base.details,
        setupProblems: [{ tool: "claude-code" as const, kind: "unparsable" as const, place: "~/.claude/settings.json" }],
        failedMcpServers: [{ tool: "claude-code" as const, name: "gone", sessions: 4 }, { tool: "codex" as const, name: "gone", sessions: 1 }, { tool: "claude-code" as const, name: "auth", sessions: 1 }],
        missingInstructions: [{ normRoot: "/w/a", name: "app" }],
        worstOverlap: { normRoot: "/w/b", name: "site", lines: 3 },
      },
    } as unknown as CheckupResult;
    const summary = checkupSummary({ ...result, findings: result.findings.slice(0, 3) }, null);
    expect(summary.fixFirst.map((fix) => [fix.ruleId, fix.targets])).toEqual([
      ["S3", ["~/.claude/settings.json"]],
      ["S5", ["gone", "auth"]],
      ["F3", ["app"]],
    ]);
    expect(checkupSummary({ ...result, findings: [result.findings[3]!] }, null).fixFirst[0]!.targets).toEqual(["site"]);
  });

  it("규칙 점수가 0이면 덧붙이는 말에 지금 값과 점수가 오르기 시작하는 값을 함께 적는다(0.3.0, 다른 PC 피드백 4번)", () => {
    const result = {
      ...baseResult(),
      lang: "ko" as const,
      findings: [finding("E4", { category: "repair", kind: "amount", value: 24400, score: 0, gain: 11 }), finding("F2", { axis: "fit", category: "repair", value: 0.05, score: 0, gain: 2 }), finding("E3", { category: "repair", kind: "rate", value: 2, score: 0.4, gain: 5 })],
    };
    // 지금 값이 0점 기준과 같으면 조금만 고쳐도 오르므로 덧붙이지 않는다(합성 홈에서 「0% 위로 올려야」가 나왔다)
    const atMark = { ...result, findings: [finding("S1", { axis: "setup", category: "repair", value: 0, score: 0, gain: 37 })] };
    expect(checkupSummary(atMark, null).text.fixFirst.map((fix) => fix.detail)).toEqual(["셋팅 최대 +37"]);
    expect(checkupSummary(result, null).text.fixFirst.map((fix) => fix.detail)).toEqual(["효율 최대 +11 · 지금 24,400토큰(어림), 16,000토큰(어림) 아래로 줄여야 오르기 시작", "상황 적합 최대 +2 · 지금 5%, 10% 위로 올려야 오르기 시작", "효율 최대 +5"]);
    expect(checkupSummary({ ...result, lang: "en" }, null).text.fixFirst.map((fix) => fix.detail)).toEqual(["Efficiency up to +11 · now 24,400 tokens (est.), rises only below 16,000 tokens (est.)", "Fit up to +2 · now 5%, rises only above 10%", "Efficiency up to +5"]);
  });

  it("두 도구로 잰 도구별 규칙은 평균값을 0점 기준과 견주지 않고, 도구마다의 지금 값과 도구마다 오르기 시작하는 값을 적는다(짝 4차 필수 2번)", () => {
    // Claude Code 98%, Codex 99%면 평균 98.5%다. Claude Code만 92%로 내려도 평균은 95.5%로 95%보다 높지만 점수는 오른다
    const scored = (tool: "claude-code" | "codex", value: number) => ({ tool, status: "scored" as const, reason: null, value, score: 0, evidence: {}, candidates: [], observed: "measured" as const });
    const f1 = finding("F1", { axis: "fit", category: "repair", value: 0.985, score: 0, gain: 100, tools: [scored("claude-code", 0.98), scored("codex", 0.99)] });
    const result = { ...baseResult(), lang: "ko" as const, findings: [f1] };
    expect(checkupSummary(result, null).text.fixFirst.map((fix) => fix.detail)).toEqual(["상황 적합 최대 +100 · 지금 Claude Code 98%·Codex 99%, 도구마다 95% 아래로 줄여야 오르기 시작"]);
    expect(checkupSummary({ ...result, lang: "en" }, null).text.fixFirst.map((fix) => fix.detail)).toEqual(["Fit up to +100 · now Claude Code 98% and Codex 99%, each rises only below 95%"]);
    // 도구 하나만 쟀으면 지금처럼 그 값 하나를 적는다
    const one = { ...result, findings: [{ ...f1, value: 0.99, tools: [scored("codex", 0.99)] }] };
    expect(checkupSummary(one, null).text.fixFirst.map((fix) => fix.detail)).toEqual(["상황 적합 최대 +100 · 지금 99%, 95% 아래로 줄여야 오르기 시작"]);
  });

  it("알림 스물세 종류마다 정해진 값과 대상의 수만 싣고, 알림에 든 경로와 이름은 싣지 않는다", () => {
    const notices: Notice[] = [
      { kind: "score_withheld", reasons: ["too_few_days"] },
      { kind: "state_reset" },
      { kind: "credentials_in_config", tool: "claude-code", places: [{ scope: "user", server: "secret-server", projectRoot: null, field: "env", key: "SECRET_KEY" }, { scope: "local", server: "secret-local", projectRoot: "/secret/p", field: "args", key: "--secret-token" }] },
      { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl"], dirs: ["/secret/d"] },
      { kind: "record_skipped", tool: "codex", files: ["/secret/a.jsonl.zst", "/secret/b.jsonl.zst"] },
      { kind: "record_partial", tool: "codex", files: ["/secret/p.jsonl.zst"] },
      { kind: "observation_incomplete", tool: "claude-code", metric: "mcp", reasons: ["unreadable-files"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "mcp_json", targets: ["/secret/proj"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "composition_unknown", plugins: ["secret@m"] },
      { kind: "setup_problems_unscored", tool: "claude-code", problems: [{ kind: "noFrontmatter", path: "/secret/p" }] },
      { kind: "projects_gone", projects: ["/secret/gone", "/secret/gone-too"] },
      { kind: "version_unverified", tool: "claude-code", versions: ["2.1.400"], verified: { from: "2.1.220", to: "2.1.322" } },
      { kind: "weak_human_requests", tool: "claude-code", weak: 3, total: 10 },
      { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
      { kind: "unverified_inheritance", tool: "codex", sessions: 5 },
      { kind: "id_fallbacks", tool: "codex", counts: [{ why: "no-lines", count: 2 }, { why: "meta-without-id", count: 1 }] },
      { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:secret-kind", count: 2 }] },
      { kind: "orphan_subsessions", tool: "claude-code", sessions: 4 },
      { kind: "parent_record_missing", tool: "codex", sessions: 6 },
      { kind: "merged_sessions", tool: "codex", sessions: 7 },
      { kind: "unknown_mtime_sessions", tool: "codex", sessions: 8 },
      { kind: "skipped_copies", tool: "codex", count: 9 },
      { kind: "unnamed_files", tool: "codex", count: 10 },
    ];
    const summary = checkupSummary({ ...baseResult(), notices: notices.map((notice) => ({ ...notice, text: { en: noticeText(notice, "en"), ko: noticeText(notice, "ko") } })) }, null);
    expect(summary.notices).toEqual([
      { kind: "score_withheld", tool: null, detail: null, count: null },
      { kind: "state_reset", tool: null, detail: null, count: null },
      { kind: "credentials_in_config", tool: "claude-code", detail: null, count: 2 },
      { kind: "record_unreadable", tool: "claude-code", detail: null, count: 2 },
      { kind: "record_skipped", tool: "codex", detail: null, count: 2 },
      { kind: "record_partial", tool: "codex", detail: null, count: 1 },
      { kind: "observation_incomplete", tool: "claude-code", detail: "mcp", count: null },
      { kind: "setup_unreadable", tool: "claude-code", detail: "claude_json", count: null },
      { kind: "setup_unreadable", tool: "claude-code", detail: "mcp_json", count: 1 },
      { kind: "plugins_uncounted", tool: "claude-code", detail: "composition_unknown", count: 1 },
      { kind: "setup_problems_unscored", tool: "claude-code", detail: null, count: 1 },
      { kind: "projects_gone", tool: null, detail: null, count: 2 },
      { kind: "version_unverified", tool: "claude-code", detail: null, count: 1 },
      { kind: "weak_human_requests", tool: "claude-code", detail: null, count: 3 },
      { kind: "overlapping_responses", tool: "claude-code", detail: null, count: 2 },
      { kind: "unverified_inheritance", tool: "codex", detail: null, count: 5 },
      { kind: "id_fallbacks", tool: "codex", detail: null, count: 3 },
      { kind: "unclassified", tool: "claude-code", detail: null, count: 3 },
      { kind: "orphan_subsessions", tool: "claude-code", detail: null, count: 4 },
      { kind: "parent_record_missing", tool: "codex", detail: null, count: 6 },
      { kind: "merged_sessions", tool: "codex", detail: null, count: 7 },
      { kind: "unknown_mtime_sessions", tool: "codex", detail: null, count: 8 },
      { kind: "skipped_copies", tool: "codex", detail: null, count: 9 },
      { kind: "unnamed_files", tool: "codex", detail: null, count: 10 },
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
    // 같은 결과에서 AQ만 냈다고 바꾸면 먼저 고칠 것이 나온다. AQ 0점도 낸 점수라서 비우지 않는다(0과 null을 가른다)
    const repairs = result.findings.filter((finding) => finding.category === "repair").slice(0, 3).map((finding) => finding.ruleId);
    for (const [aq, grade, tier] of [[70, "B", 3], [0, "D", 1]] as const) {
      const scored = checkupSummary({ ...result, score: { ...result.score, aq, grade, tier, withheld: [] } as CheckupResult["score"] }, null);
      expect(scored.fixFirst.map((fix) => fix.ruleId), `AQ ${aq}`).toEqual(repairs);
      expect(scored.text.fixFirst, `AQ ${aq}`).toHaveLength(repairs.length);
    }
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
