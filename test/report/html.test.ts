// 결과 화면 HTML을 시험한다. 두 언어를 함께 그리는지, 바깥으로 나가는 요청을 CSP로 막는지, 스크립트가 찾는 요소가 있는지, 경로와 이름을 어떻게 그리는지, AQ가 없을 때 무엇을 숨기는지 본다(설계 13, 14, 19.1, 「3단계 계획 전 결정」의 1·2·5·6·10·12번)
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RULE_COPY, ruleValueText } from "../../src/core/copy/findings.ts";
import type { Lang } from "../../src/core/copy/lang.ts";
import { SCORE_WINDOW_DAYS } from "../../src/adapters/common/dates.ts";
import { RULES, ruleSpec } from "../../src/core/rules.ts";
import { gradeOf } from "../../src/core/score.ts";
import { MIN_DAYS_FOR_AQ, MIN_REQUESTS_FOR_AQ } from "../../src/core/scoreboard.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import type { ReportArt } from "../../src/report/assets.ts";
import { REPORT_COPY, SCENE_ALT } from "../../src/report/copy.ts";
import { reportHtml } from "../../src/report/html.ts";
import { REPORT_SCRIPT, SCRIPT_IDS, type ClientData } from "../../src/report/script.ts";
import { reportView, type ReportRun, type ReportView } from "../../src/report/view.ts";
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

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
const thinSessions = [{ days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }];
const result = (tool: ClaudeToolInput = {}, extra: { collected?: CollectedTool; lang?: Lang } = {}): CheckupResult => {
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [extra.collected ?? collected()], appVersion: "0.1.0", lang: extra.lang ?? "ko", run: { stateBroken: false } });
};
const art: ReportArt = { scene: "data:image/webp;base64,U0NFTkU=", face: "data:image/webp;base64,RkFDRQ==", good: "data:image/webp;base64,R09PRA==", fix: "data:image/webp;base64,RklY" };
const noArt: ReportArt = { scene: null, face: null, good: null, fix: null };
const viewOf = (checked: CheckupResult, run: ReportRun = { saved: true, round: 2 }): ReportView => reportView(checked, run);
const between = (html: string, start: string, end: string): string => {
  const from = html.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  return html.slice(from + start.length, html.indexOf(end, from + start.length));
};
const dataOf = (html: string): ClientData => JSON.parse(between(html, `<script type="application/json" id="${SCRIPT_IDS.data}">`, "</script>")) as ClientData;
const count = (html: string, needle: string): number => html.split(needle).length - 1;
const esc = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

describe("reportHtml", () => {
  it("한 파일에 두 언어를 함께 그린다. 처음 보이는 언어는 결과의 언어이고 두 언어의 칸 수가 같다", () => {
    const ko = reportHtml(viewOf(result()), art);
    expect(ko.startsWith("<!doctype html>")).toBe(true);
    expect(ko).toContain('<html lang="ko" data-ui="ko">');
    expect(count(ko, 'data-l="en"')).toBe(count(ko, 'data-l="ko"'));
    expect(count(ko, 'data-l="ko"')).toBeGreaterThan(50);
    expect(ko).toContain('<button type="button" data-set-lang="ko" aria-pressed="true" lang="ko">');
    const en = reportHtml(viewOf(result({}, { lang: "en" })), art);
    expect(en).toContain('<html lang="en" data-ui="en">');
    expect(en).toContain('<button type="button" data-set-lang="en" aria-pressed="true" lang="en">');
  });

  it("언어를 바꿀 때 옮길 속성은 처음 언어의 값으로 채워 두고 두 언어의 값을 함께 둔다", () => {
    const html = reportHtml(viewOf(result()), art);
    expect(html).toContain(`aria-label="${REPORT_COPY.langGroup.ko}" data-en-aria-label="${REPORT_COPY.langGroup.en}" data-ko-aria-label="${REPORT_COPY.langGroup.ko}"`);
    const title = between(html, "<title", "</title>");
    expect(title).toContain(`data-en-text="${esc(REPORT_COPY.pageTitle.en.replace("{date}", "2026-11-13"))}"`);
    expect(title.endsWith(`>${REPORT_COPY.pageTitle.ko.replace("{date}", "2026-11-13")}`)).toBe(true);
  });

  it("바깥으로 나가는 요청을 CSP로 막고, 스크립트는 그 해시가 맞는 것 하나만 돈다", () => {
    const html = reportHtml(viewOf(result()), art);
    const hash = createHash("sha256").update(REPORT_SCRIPT, "utf8").digest("base64");
    const csp = between(html, '<meta http-equiv="Content-Security-Policy" content="', '">');
    expect(csp).toBe(`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'`);
    expect(count(html, "<script")).toBe(2);
    expect(html).toContain(`<script>${REPORT_SCRIPT}</script>`);
    expect(html).not.toMatch(/https?:\/\/|<link|<iframe|<object|<embed/i);
  });

  it("스크립트가 찾는 요소가 하나씩 있다. 카드 요소와 카드 자료는 AQ를 냈을 때만 있다", () => {
    const scored = reportHtml(viewOf(result()), art);
    for (const id of Object.values(SCRIPT_IDS)) expect(count(scored, `id="${id}"`), id).toBe(1);
    expect(count(scored, 'data-act="card"')).toBe(1);
    expect(dataOf(scored).card).not.toBeNull();
    const thin = reportHtml(viewOf(result({ sessions: thinSessions })), art);
    for (const id of [SCRIPT_IDS.dialog, SCRIPT_IDS.cardImage, SCRIPT_IDS.cardLink, SCRIPT_IDS.cardFail, SCRIPT_IDS.cardClose]) expect(thin).not.toContain(`id="${id}"`);
    expect(thin).not.toContain('data-act="card"');
    expect(dataOf(thin).card).toBeNull();
  });

  it("JSON 자료는 </script>로 끊기지 않게 적고, 카드에는 점수와 기준과 고정 글만 싣는다", () => {
    const checked = result();
    const view = viewOf(checked);
    const html = reportHtml(view, art);
    expect(between(html, `id="${SCRIPT_IDS.data}">`, "</script>")).not.toContain("<");
    const card = dataOf(html).card!;
    expect(card.aq).toBe(checked.score.aq);
    expect(card.grade).toBe(checked.score.grade);
    expect(card.today).toBe("2026-11-13");
    expect(card.file).toBe("chunsik-garage-aq-2026-11-13.png");
    expect(card.nick).toEqual({ en: checked.text.en.grade, ko: checked.text.ko.grade });
    expect(card.axes).toEqual(checked.axes.map((axis) => ({ name: expect.any(Object), score: axis.score })));
    expect(Object.keys(card).sort()).toEqual(["alt", "aqLabel", "aq", "axes", "brand", "file", "grade", "gradeLabel", "nick", "repo", "title", "today"].sort());
  });

  it("경로를 그리지 않고 프로젝트는 폴더 이름으로 그린다", () => {
    const root = "C:/SECRET-PARENT/MyApp";
    const projects = [project(root, { normRoot: "c:/secret-parent/myapp", cwds: ["c:/secret-parent/myapp"] })];
    const local = mcpServer("local-db", { scope: "local", projectRoot: "c:/secret-parent/myapp" });
    const sessions = [...enough, ...Array.from({ length: 3 }, () => ({ cwd: "c:/secret-parent/myapp", days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }))];
    const checked = result({ sessions, setup: { projects, mcpServers: [local] } }, { collected: collected({ read: { ...collected().read, unreadableFiles: ["C:/SECRET-PARENT/logs/s.jsonl"], unreadableDirs: ["C:/SECRET-PARENT/logs"] } }) });
    const html = reportHtml(viewOf(checked), art);
    expect(html.toLowerCase()).not.toContain("secret-parent");
    expect(html).toContain("<li>MyApp</li>");
    expect(html).toContain("<code>local-db</code><small>MyApp</small>");
  });

  it("이름은 글로 넣는다(HTML로 풀리지 않는다)", () => {
    const evil = 'x"><img src=x onerror=alert(1)>';
    const html = reportHtml(viewOf(result({ setup: { mcpServers: [mcpServer(evil)] } })), art);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain(`<code>${esc(evil)}</code>`);
  });

  it("바깥에서 온 이름과 글은 어느 자리에서도 HTML로 풀리지 않고, JSON 자료는 </script>로 끊기지 않는다", () => {
    // 자리마다 다른 표시를 붙여, 그 자리가 실제로 그려졌는지와 HTML로 풀리지 않았는지를 함께 본다
    const evil = (mark: string): string => `${mark}"><img src=x onerror=alert(1)></script><b>&'`;
    const base = viewOf(result({ setup: { mcpServers: [mcpServer("watching")] } }));
    const hostile = (mark: string) => ({ en: evil(`${mark}-en`), ko: evil(`${mark}-ko`) });
    const findings = base.findings.map((finding) => {
      // E6의 정보 줄은 판정에서 뺀 서버 칸에만 그린다
      if (finding.ruleId === "E6") return { ...finding, text: { en: { ...finding.text.en, notes: [evil("note-en")] }, ko: { ...finding.text.ko, notes: [evil("note-ko")] } } };
      if (finding.ruleId !== "E5") return finding;
      const text = (lang: "en" | "ko") => ({ ...finding.text[lang], title: evil(`title-${lang}`), name: evil(`name-${lang}`), description: evil(`description-${lang}`), prescription: evil(`prescription-${lang}`), method: [evil(`method-${lang}`)] });
      return { ...finding, category: "repair" as const, severity: "caution" as const, gain: 3, targets: [evil("target")], text: { en: text("en"), ko: text("ko") } };
    });
    const view: ReportView = {
      ...base,
      findings,
      servers: [
        { tool: "claude-code", name: evil("server"), scope: "local", projectName: evil("server-project"), why: "not_established", daysUntil: 3 },
        { tool: "claude-code", name: evil("connector"), scope: "claude-ai", projectName: null, why: "no_definition", daysUntil: null },
      ],
      setupProblems: [{ tool: "claude-code", kind: "unparsable", place: evil("place") }],
      missingInstructions: [evil("missing")],
      worstOverlap: evil("overlap"),
      notices: [{ kind: "record_unreadable", tool: "claude-code", text: hostile("notice") }, { kind: "credentials_in_config", tool: "claude-code", text: hostile("secrets") }],
      credentialPlaces: [{ tool: "claude-code", scope: "local", server: evil("spot-server"), projectName: evil("spot-project"), field: "env", key: evil("spot-key") }],
      text: { en: { ...base.text.en, grade: evil("grade-en"), diagnosis: evil("diagnosis-en") }, ko: { ...base.text.ko, grade: evil("grade-ko"), diagnosis: evil("diagnosis-ko") } },
    };
    const html = reportHtml(view, art);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>&");
    expect(count(html, "<script")).toBe(2);
    expect(count(html, "</script>")).toBe(2);
    const marks = ["target", "server", "server-project", "connector", "place", "missing", "overlap", "notice-en", "notice-ko", "secrets-ko", "spot-server", "spot-project", "spot-key", "grade-en", "grade-ko", "diagnosis-en", "diagnosis-ko", "title-ko", "name-ko", "description-ko", "prescription-ko", "method-ko", "note-ko"];
    for (const mark of marks) expect(html, mark).toContain(esc(evil(mark)));
    expect(html).toContain(`data-phrase-ko="${esc(REPORT_COPY.phrase.ko.replace("{name}", evil("name-ko")))}"`);
    expect(html).toContain(esc(JSON.stringify(evil("connector"))));
    expect(dataOf(html).card!.nick).toEqual({ en: evil("grade-en"), ko: evil("grade-ko") });
  });

  it("AQ가 있는데 등급이 없으면(평가가 내지 않는 조합) 카드 단추와 창과 자료를 모두 두지 않는다", () => {
    const view = viewOf(result());
    const html = reportHtml({ ...view, score: { ...view.score, grade: null } }, art);
    expect(html).not.toContain('data-act="card"');
    expect(html).not.toContain(`id="${SCRIPT_IDS.dialog}"`);
    expect(dataOf(html).card).toBeNull();
  });

  it("AQ를 냈으면 등급 단계의 장면과 별명, 도장, 먼저 고칠 것을 그린다", () => {
    const checked = result();
    const view = viewOf(checked);
    const html = reportHtml(view, art);
    const alt = SCENE_ALT[`scene-${checked.score.tier}` as keyof typeof SCENE_ALT];
    expect(html).toContain(`<img id="${SCRIPT_IDS.scene}" src="${art.scene}" width="264" height="264" data-tr alt="${esc(alt.ko)}" data-en-alt="${esc(alt.en)}" data-ko-alt="${esc(alt.ko)}">`);
    expect(html).toContain(`<figcaption><span lang="en" data-l="en">${esc(checked.text.en.grade!)}</span><span lang="ko" data-l="ko">${esc(checked.text.ko.grade!)}</span></figcaption>`);
    expect(html).toContain(`<b>${checked.score.grade}</b>`);
    const repairs = view.findings.filter((finding) => finding.category === "repair");
    expect(html.includes(REPORT_COPY.fixFirst.ko)).toBe(repairs.length > 0);
  });

  it("설정 속 비밀값 알림 아래에 그 도구의 자리를 두 언어로 늘어놓는다. 값은 없다(0.2.0)", () => {
    const checked = result({ setup: { projects: [project("/work/shop")], secrets: [{ scope: "user", server: "ctx", projectRoot: null, field: "env", key: "API_TOKEN" }, { scope: "project", server: "pj", projectRoot: "/work/shop", field: "headers", key: "Authorization" }] } });
    const html = reportHtml(viewOf(checked), art);
    const notices = between(html, '<section class="notices"', "</section>");
    expect(count(notices, '<ul class="spots">')).toBe(1);
    expect(notices).toContain('<li><span lang="en" data-l="en">ctx · env API_TOKEN</span><span lang="ko" data-l="ko">ctx · env API_TOKEN</span></li>');
    expect(notices).toContain('<li><span lang="en" data-l="en">pj (shop) · header Authorization</span><span lang="ko" data-l="ko">pj (shop) · 머리말 Authorization</span></li>');
    expect(reportHtml(viewOf(result()), art)).not.toContain('class="spots"');
  });

  it("S5 항목에 연결에 실패한 서버를 실패한 세션 수와 함께 늘어놓는다. 없으면 그리지 않는다(0.3.0, 다른 PC 피드백 2번)", () => {
    const view = viewOf(result());
    const withServers: ReportView = { ...view, failedServers: [{ tool: "claude-code", name: "gone<x>", sessions: 4 }, { tool: "claude-code", name: "auth", sessions: 1 }] };
    const s5 = between(reportHtml(withServers, art), '<div class="it" id="it-S5">', '<div class="it" id="it-');
    expect(s5).toContain(`aria-label="${REPORT_COPY.failedServers.ko}" data-en-aria-label="${REPORT_COPY.failedServers.en}"`);
    expect(s5).toContain(`<li>gone&lt;x&gt;<small><span lang="en" data-l="en">4 sessions</span><span lang="ko" data-l="ko">세션 4개</span></small></li>`);
    expect(s5).toContain(`<li>auth<small><span lang="en" data-l="en">1 session</span><span lang="ko" data-l="ko">세션 1개</span></small></li>`);
    expect(reportHtml({ ...view, failedServers: [] }, art)).not.toContain(`aria-label="${REPORT_COPY.failedServers.ko}"`);
  });

  it("옮긴 설정 폴더를 쓰는 동안 기본 위치의 사본에서 찾은 자리는 사본이라고 붙인다(0.3.0, 다른 PC 피드백 3번)", () => {
    const checked = result({ setup: { secrets: [{ scope: "user", server: "ctx", projectRoot: null, field: "env", key: "API_TOKEN" }, { scope: "user", server: "ctx", projectRoot: null, field: "env", key: "API_TOKEN", copy: "default" }] } });
    expect(checked.details.credentialPlaces.map((place) => place.copy ?? null)).toEqual([null, "default"]);
    const notices = between(reportHtml(viewOf(checked), art), '<section class="notices"', "</section>");
    expect(notices).toContain('<li><span lang="en" data-l="en">ctx · env API_TOKEN</span><span lang="ko" data-l="ko">ctx · env API_TOKEN</span></li>');
    expect(notices).toContain('<li><span lang="en" data-l="en">ctx · env API_TOKEN · copy in the default location</span><span lang="ko" data-l="ko">ctx · env API_TOKEN · 기본 위치의 사본</span></li>');
  });

  it("다음 등급까지의 문장을 진단 칸의 먼저 고칠 것 아래에 두 언어로 그리고, 없으면 그리지 않는다(0.2.0)", () => {
    const checked = result();
    expect(checked.nextGrade).not.toBeNull();
    const html = reportHtml(viewOf(checked), art);
    const verdict = between(html, '<div class="verdict">', "</section>");
    // 화살표와 숫자는 줄이 바뀌어도 떨어지지 않게 묶는다(0.3.0. 문장 자체에는 보통 빈칸을 쓴다)
    const nowrap = (text: string): string => esc(text).replace(/\(→ (\d+)\)/g, '<span class="nw">(→ $1)</span>');
    expect(verdict).toContain(`<span class="nx"><span lang="en" data-l="en">${nowrap(checked.nextGrade!.text.en)}</span><span lang="ko" data-l="ko">${nowrap(checked.nextGrade!.text.ko)}</span></span>`);
    expect(count(verdict, '<span class="nw">(→ ')).toBe(checked.nextGrade!.steps.length * 2);
    expect(count(html, 'class="nx"')).toBe(1);
    // 정비할 것이 없어도 다음 등급이 있으면 그 칸에 따로 보인다
    const view = viewOf(checked);
    const noRepairs: ReportView = { ...view, findings: view.findings.map((finding) => (finding.category === "repair" ? { ...finding, category: "average" as const } : finding)) };
    const alone = reportHtml(noRepairs, art);
    expect(alone).not.toContain(REPORT_COPY.fixFirst.ko);
    expect(between(alone, '<div class="verdict">', "</section>")).toContain(REPORT_COPY.nextGrade.ko);
    expect(count(alone, 'class="nx"')).toBe(1);
    expect(reportHtml({ ...view, nextGrade: null }, art)).not.toContain('class="nx"');
  });

  it("AQ를 내지 않았으면 점수 없음과 장면 아래의 까닭을 보이고, 먼저 고칠 것과 예상 효과 꼬리표와 카드 단추를 그리지 않는다", () => {
    const thin = result({ sessions: thinSessions });
    const view = viewOf(thin, { saved: false, round: null });
    // 정비 항목에 예상 효과가 있다고 해도 꼬리표를 그리지 않는다
    const forced: ReportView = { ...view, findings: [...view.findings, { ...view.findings[0]!, ruleId: "E5", category: "repair", gain: 7, targets: ["old-skill"] }] };
    const html = reportHtml(forced, art);
    expect(html).toContain(`<div class="n none"><span lang="en" data-l="en">${REPORT_COPY.noScore.en}</span>`);
    // 장면 아래의 글이 AQ를 내지 않은 까닭이다(「3단계 계획 전 결정」의 12번). 같은 글을 다른 자리에 또 쓰지 않는다
    expect(between(html, '<figure class="scene">', "</figure>")).toContain(`<figcaption class="why">${pairOf(view.withheldText!)}</figcaption>`);
    expect(count(html, esc(view.withheldText!.ko))).toBe(1);
    expect(html).not.toContain('class="tag up"');
    expect(html).not.toContain(REPORT_COPY.fixFirst.ko);
    expect(html).toContain(`data-ko-alt="${esc(SCENE_ALT["scene-few-records"].ko)}"`);
    const unreadable = result({ sessions: thinSessions }, { collected: collected({ read: { ...collected().read, unreadableFiles: ["C:/x/a.jsonl"] } }) });
    expect(reportHtml(viewOf(unreadable), art)).toContain(`data-ko-alt="${esc(SCENE_ALT["scene-unreadable"].ko)}"`);
  });

  it("그림을 읽지 못하면 그 자리를 대체 글로 그리고, 카드가 쓸 그림 요소를 두지 않는다", () => {
    const html = reportHtml(viewOf(result()), noArt);
    // 카드 창의 그림 자리는 스크립트가 그린 뒤에 채운다
    expect(html).not.toMatch(/<img[^>]*\ssrc=/);
    expect(html).toContain('<div class="ph" role="img" data-tr aria-label=');
    expect(html).not.toContain(`id="${SCRIPT_IDS.scene}"`);
    expect(html).not.toContain(`id="${SCRIPT_IDS.face}"`);
  });

  it("판정에서 뺀 서버는 까닭마다 이름을 적고, 지켜보는 중이면 며칠 뒤부터 판정하는지와 조건을, claude.ai 연결은 막을 때 쓸 설정을 적는다", () => {
    const checked = result({ setup: { mcpServers: [mcpServer("watching"), mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null })] } });
    const saved = reportHtml(viewOf(checked, { saved: true, round: 1 }), art);
    expect(saved).toContain(REPORT_COPY.judgeFrom.ko.replace("{n}", "15"));
    expect(saved).toContain(REPORT_COPY.judgeFrom.en.replace("{n} {n:day|days}", "15 days"));
    expect(saved).toContain(REPORT_COPY.judgeChange.ko);
    expect(saved).not.toContain(REPORT_COPY.judgeNotSaved.ko);
    expect(saved).toContain("<code>claude.ai Mail</code>");
    expect(saved).toContain(`<pre>${esc('[\n  { "serverName": "claude.ai Mail" }\n]')}</pre>`);
    expect(saved).toContain(REPORT_COPY.serversOut.ko.replace("{n}", "2"));
    const unsaved = reportHtml(viewOf(checked, { saved: false, round: null }), art);
    expect(unsaved).toContain(REPORT_COPY.judgeNotSaved.ko);
    // 날을 모르면 0일이나 "곧"으로 바꾸지 않고 정하지 못했다고 적는다
    const view = viewOf(checked);
    const unknown = reportHtml({ ...view, servers: view.servers.map((server) => ({ ...server, daysUntil: null })) }, art);
    expect(unknown).toContain(REPORT_COPY.judgeUnknown.ko);
    expect(unknown).not.toContain(REPORT_COPY.judgeFrom.ko.slice(0, 10));
  });

  it("S3의 위치, F3의 프로젝트, F4의 프로젝트를 이름 칩으로 그린다", () => {
    const view = viewOf(result());
    const html = reportHtml({ ...view, setupProblems: [{ tool: "claude-code", kind: "unparsable", place: "~/.claude/settings.json" }], missingInstructions: ["web", "web (2)"], worstOverlap: "api" }, art);
    expect(html).toContain('<li>~/.claude/settings.json<small><span lang="en" data-l="en">unparsable settings file</span><span lang="ko" data-l="ko">풀리지 않는 설정 파일</span></small></li>');
    expect(html).toContain("<li>web</li><li>web (2)</li>");
    expect(html).toContain("<li>api</li>");
  });

  it("정리하기 단추는 두 언어의 붙여 넣을 말을 가진다", () => {
    const view = viewOf(result());
    const repair = { ...view.findings[0]!, category: "repair" as const, targets: ["old-skill"] };
    const html = reportHtml({ ...view, findings: [repair] }, art);
    expect(html).toContain(`data-act="copy" data-phrase-en="${esc(REPORT_COPY.phrase.en.replace("{name}", repair.text.en.name))}" data-phrase-ko="${esc(REPORT_COPY.phrase.ko.replace("{name}", repair.text.ko.name))}"`);
    expect(html).toContain("<li>old-skill</li>");
  });

  it("달력은 수집 구간의 날마다 한 칸이고 두 언어의 말풍선을 가지며, 표로 보기에도 같은 날이 있다", () => {
    const view = viewOf(result());
    const html = reportHtml(view, art);
    expect(count(html, "data-tip-en=")).toBe(view.usage.calendar.length);
    expect(count(html, "data-tip-ko=")).toBe(view.usage.calendar.length);
    for (const cell of view.usage.calendar) expect(html).toContain(`<td>${cell.date}</td>`);
    expect(html).toContain('<button type="button" class="mini-btn" data-act="table">');
  });

  it("일부만 읽었으면 점수 띠 위에 그 띠를 두 언어로 그린다. 아래 경계면 「적어도」, 비율을 낼 수 없으면 숫자 없이 적는다(설계 9.8, 20.1)", () => {
    const line = (key: "partialRead" | "partialReadAtLeast" | "partialReadUnknown", lang: "en" | "ko", share: string) => esc(REPORT_COPY[key][lang].replace("{tool}", "Claude Code").replace("{share}", share));
    expect(reportHtml(viewOf(result()), art)).not.toContain('class="partial"');
    // 평가 결과에서 실제로 띠의 자료가 나오는 경우(파일 3개 가운데 1개를 읽지 못함)
    const read = collected().read;
    const html = reportHtml(viewOf(result({}, { collected: collected({ read: { ...read, files: 3, listedBytes: 300, unreadableFiles: ["C:/x/a.jsonl"], unreadableFileBytes: 100 } }) })), art);
    expect(html.indexOf('<div class="partial" role="note">')).toBeGreaterThan(html.indexOf("</header>"));
    expect(html.indexOf('<div class="partial" role="note">')).toBeLessThan(html.indexOf('<section class="hero"'));
    expect(html).toContain(line("partialRead", "ko", "33.3%"));
    expect(html).toContain(line("partialRead", "en", "33.3%"));
    const view = viewOf(result());
    expect(reportHtml({ ...view, partialReads: [{ tool: "claude-code", share: 0.05, lowerBound: true }] }, art)).toContain(line("partialReadAtLeast", "ko", "5%"));
    const unknown = reportHtml({ ...view, partialReads: [{ tool: "claude-code", share: null, lowerBound: true }] }, art);
    expect(unknown).toContain(line("partialReadUnknown", "ko", ""));
    expect(unknown).toContain(line("partialReadUnknown", "en", ""));
  });
});

const pairOf = (texts: { en: string; ko: string }): string => `<span lang="en" data-l="en">${esc(texts.en)}</span><span lang="ko" data-l="ko">${esc(texts.ko)}</span>`;

describe("점검 이력 그래프(7단계)", () => {
  const history = [
    { at: "2026-11-01T00:00:00.000Z", aq: 50 },
    { at: "2026-11-03T00:00:00.000Z", aq: null },
    { at: "2026-11-04T00:00:00.000Z", aq: 61 },
  ];
  it("AQ가 있는 저장한 점검이 둘 이상이면 선 그래프와 지난 점검과의 차이를 그리고, 같은 수를 읽기 도구용 글로 둔다", () => {
    const html = reportHtml(viewOf(result(), { saved: true, round: 3, history }), art);
    expect(count(html, '<svg class="histsvg"')).toBe(1);
    expect(count(html, "<circle ")).toBeGreaterThanOrEqual(2);
    expect(html).toContain("지난 점검보다 +11");
    expect(html).toContain("최근 점검의 AQ는 50, 61입니다.");
  });

  it("점이 하나뿐이거나 저장하지 않은 점검이면 그리지 않는다", () => {
    expect(count(reportHtml(viewOf(result(), { saved: true, round: 1, history: history.slice(0, 1) }), art), "<svg class=\"histsvg\"")).toBe(0);
    expect(count(reportHtml(viewOf(result(), { saved: false, round: null, history }), art), "<svg class=\"histsvg\"")).toBe(0);
  });
});

describe("다음 등급으로 가는 셋팅 방법(0.3.0, 사용자 추가 요청)", () => {
  it("다음 등급까지의 차례마다 할 일, 지금 값과 목표 값, 거기까지 고친 AQ, 처방을 두 언어로 그린다. 다음 등급이 없으면 그리지 않는다", () => {
    const checked = result();
    expect(checked.nextGrade).not.toBeNull();
    const view = viewOf(checked);
    const section = between(reportHtml(view, art), '<section class="next"', "</section>");
    expect(section).toContain(`${REPORT_COPY.nextTitle.ko.replace("{grade}", checked.nextGrade!.grade)}`);
    expect(count(section, '<li class="step">')).toBe(checked.nextGrade!.steps.length);
    for (const step of checked.nextGrade!.steps) {
      const finding = checked.findings.find((f) => f.ruleId === step.ruleId)!;
      expect(section).toContain(esc(finding.text.ko.title));
      expect(section).toContain(esc(`여기까지 고치면 AQ ${step.aq}`));
      expect(section).toContain(esc(`지금 ${finding.text.ko.value}${finding.text.ko.unit} → 목표 ${ruleValueText(step.ruleId, ruleSpec(step.ruleId).fullAt, "ko")}`));
      if (finding.text.ko.prescription !== null) expect(section).toContain(esc(finding.text.ko.prescription));
    }
    expect(reportHtml({ ...view, nextPlan: null }, art)).not.toContain('<section class="next"');
  });

  it("도구마다 재는 규칙을 두 도구로 쟀으면 만점이 아닌 도구마다 지금 값과 목표를 적고, 평균값에 목표를 붙이지 않는다(짝 3차 필수 2번)", () => {
    // F1(높은 추론 강도의 몫)을 Claude Code는 30%(만점), Codex는 90%(만점 아님)로 잰다. 다른 규칙은 그대로 두기로 해 F1만 차례에 남긴다
    const sessions = (xhigh: number) => [0, 1, 2].map((index) => ({ days: { [`2026-11-1${index}`]: { responses: 50, humanRequests: 10, efforts: { xhigh, high: 50 - xhigh } } } }));
    const twoTools = (codexXhigh: number): CheckupResult => {
      const input = evaluationInput([claudeTool({ sessions: sessions(15) }), codexTool({ sessions: sessions(codexXhigh) })]);
      return checkupResult({ input, evaluation: evaluate(input), collected: [collected(), collected({ tool: "codex" })], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false }, ignored: RULES.map((spec) => spec.id).filter((id) => id !== "F1") });
    };
    const checked = twoTools(45);
    const f1 = checked.findings.find((f) => f.ruleId === "F1")!;
    expect(checked.nextGrade!.steps.map((step) => step.ruleId)).toEqual(["F1"]);
    expect(f1.tools.map((tool) => [tool.tool, tool.value])).toEqual([["claude-code", 0.3], ["codex", 0.9]]);
    expect(f1.value).toBeCloseTo(0.6, 9);
    const section = between(reportHtml(viewOf(checked), art), '<section class="next"', "</section>");
    expect(section).toContain(esc("Codex 지금 90% → 목표 60%"));
    expect(section).toContain(esc("Codex: now 90% → aim for 60%"));
    expect(section).not.toContain(esc("지금 60% → 목표 60%"));
    expect(section).not.toContain("Claude Code 지금");
    // 점수가 0이고 0점 기준보다 나쁜 도구는 그 줄에 점수가 오르기 시작하는 값을 붙인다
    const zero = between(reportHtml(viewOf(twoTools(49)), art), '<section class="next"', "</section>");
    expect(zero).toContain(esc("Codex 지금 98% → 목표 60% · 95%보다 줄여야 점수가 오르기 시작합니다."));
  });

  it("지금 값과 목표 뒤에 점수가 오르기 시작하는 값을 붙일 때 가운뎃점으로 나눠 숫자 둘이 붙지 않는다", () => {
    // I3(요청 하나에 도구 호출)이 0회로 0점 기준(1회)보다 나쁘다. 다른 차례 후보는 그대로 두기로 해 I3만 남긴다
    const input = evaluationInput([claudeTool({ sessions: enough })]);
    const checked = checkupResult({ input, evaluation: evaluate(input), collected: [collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false }, ignored: ["S1", "I1", "I2"] });
    expect(checked.nextGrade!.steps.map((step) => step.ruleId)).toEqual(["I3"]);
    const section = between(reportHtml(viewOf(checked), art), '<section class="next"', "</section>");
    expect(section).toContain(esc("지금 0회/요청 → 목표 8회/요청 · 1회/요청보다 늘려야 점수가 오르기 시작합니다."));
    expect(section).toContain(esc("Now 0 calls per request → aim for 8 calls per request · The score starts to rise above 1 call per request."));
  });
});

describe("점수 매기는 법(0.3.0, 사용자 추가 요청)", () => {
  it("AQ·기준 점수·규칙 점수의 계산과 등급의 경계, AQ를 내지 않는 조건을 적고, 규칙 스물둘의 무게와 0점·만점 기준을 표로 보인다", () => {
    const html = reportHtml(viewOf(result()), art);
    const section = between(html, '<section class="how-score"', "</section>");
    expect(section).toContain("S 90 이상, A 80~89, B 65~79, C 50~64, D 49 이하");
    expect([gradeOf(90).grade, gradeOf(89).grade, gradeOf(80).grade, gradeOf(79).grade, gradeOf(65).grade, gradeOf(64).grade, gradeOf(50).grade, gradeOf(49).grade]).toEqual(["S", "A", "A", "B", "B", "C", "C", "D"]);
    expect(section).toContain(`최근 ${SCORE_WINDOW_DAYS}일 동안 사람 요청이 ${MIN_REQUESTS_FOR_AQ}개보다 적거나 쓴 날이 ${MIN_DAYS_FOR_AQ}일보다 적으면`);
    expect(count(section, '<tr class="rule">')).toBe(RULES.length);
    for (const spec of RULES) {
      const name = RULE_COPY[spec.id].ko.name;
      const pair = (en: string, ko: string): string => `<span lang="en" data-l="en">${esc(en)}</span><span lang="ko" data-l="ko">${esc(ko)}</span>`;
      const mark = (value: number): string => pair(ruleValueText(spec.id, value, "en"), ruleValueText(spec.id, value, "ko"));
      expect(section).toContain(`<tr class="rule"><th scope="row">${pair(RULE_COPY[spec.id].en.name, name)}</th><td class="n">${spec.weight}</td><td>${mark(spec.zeroAt)}</td><td>${mark(spec.fullAt)}</td></tr>`);
    }
    // 위 비교는 같은 함수의 출력과 견주므로, 반올림으로 바뀌기 쉬운 E7의 두 기준은 글자 그대로 본다(짝 3차 필수 3번)
    expect(section).toContain('<td><span lang="en" data-l="en">0.15 stops per request</span><span lang="ko" data-l="ko">0.15회/요청</span></td><td><span lang="en" data-l="en">0.02 stops per request</span><span lang="ko" data-l="ko">0.02회/요청</span></td>');
    // AQ를 내지 않은 화면에도 같은 설명이 있다
    const withheld = reportHtml({ ...viewOf(result()), score: { aq: null, grade: null, tier: null, withheld: ["too_few_requests"] } }, art);
    expect(withheld).toContain('<section class="how-score"');
  });
});

describe("그대로 두기로 한 규칙(0.3.0, 다른 PC 피드백 5번)", () => {
  it("정비할 것의 항목에 꼬리표를 붙이고, 진단 칸의 먼저 고칠 것에서는 뺀다", () => {
    const view = viewOf(result());
    const repairs = view.findings.filter((finding) => finding.category === "repair");
    expect(repairs.length).toBeGreaterThan(0);
    const first = repairs[0]!;
    const kept: ReportView = { ...view, ignored: [first.ruleId] };
    const html = reportHtml(kept, art);
    const card = between(html, `<div class="it" id="it-${first.ruleId}">`, '<div class="it" id="it-');
    expect(card).toContain(REPORT_COPY.kept.ko);
    const verdict = between(html, '<div class="verdict">', "</section>");
    expect(verdict).not.toContain(esc(first.text.ko.title));
    expect(reportHtml(view, art)).not.toContain(REPORT_COPY.kept.ko);
  });
});
