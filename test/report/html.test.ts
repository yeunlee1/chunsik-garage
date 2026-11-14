// 결과 화면 HTML을 시험한다. 두 언어를 함께 그리는지, 바깥으로 나가는 요청을 CSP로 막는지, 스크립트가 찾는 요소가 있는지, 경로와 이름을 어떻게 그리는지, AQ가 없을 때 무엇을 숨기는지 본다(설계 13, 14, 19.1, 「3단계 계획 전 결정」의 1·2·5·6·10·12번)
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Lang } from "../../src/core/copy/lang.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import type { ReportArt } from "../../src/report/assets.ts";
import { REPORT_COPY, SCENE_ALT } from "../../src/report/copy.ts";
import { reportHtml } from "../../src/report/html.ts";
import { REPORT_SCRIPT, SCRIPT_IDS, type ClientData } from "../../src/report/script.ts";
import { reportView, type ReportRun, type ReportView } from "../../src/report/view.ts";
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
      notices: [{ kind: "record_unreadable", text: hostile("notice") }],
      text: { en: { ...base.text.en, grade: evil("grade-en"), diagnosis: evil("diagnosis-en") }, ko: { ...base.text.ko, grade: evil("grade-ko"), diagnosis: evil("diagnosis-ko") } },
    };
    const html = reportHtml(view, art);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>&");
    expect(count(html, "<script")).toBe(2);
    expect(count(html, "</script>")).toBe(2);
    const marks = ["target", "server", "server-project", "connector", "place", "missing", "overlap", "notice-en", "notice-ko", "grade-en", "grade-ko", "diagnosis-en", "diagnosis-ko", "title-ko", "name-ko", "description-ko", "prescription-ko", "method-ko", "note-ko"];
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
