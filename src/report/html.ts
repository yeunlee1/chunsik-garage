// 결과 화면 HTML 한 파일을 만든다. 두 언어의 글을 함께 그리고 지금 언어가 아닌 쪽은 스타일이 숨긴다. 스타일, 스크립트, 자료, 그림이 모두 파일 안에 있고 바깥으로 나가는 요청은 CSP로 막는다. 경로는 그리지 않는다(순수 함수, 설계 13, 14, 19.1, 「3단계 계획 전 결정」의 1·2·5·6·10·12번)
import { createHash } from "node:crypto";
import type { LocalDate } from "../adapters/common/dates.ts";
import type { ToolId } from "../adapters/types.ts";
import { AXIS_NAMES, SUMMARY_COPY, TOOL_NAMES, UNJUDGED_COPY } from "../core/copy/common.ts";
import { joinValue } from "../core/copy/findings.ts";
import { fill, groupDigits } from "../core/copy/format.ts";
import { LANGS, type Lang, type Texts } from "../core/copy/lang.ts";
import { fixDetail } from "../core/result/summary.ts";
import type { CalendarCell } from "../core/result/usage.ts";
import { sceneFor, type ReportArt } from "./assets.ts";
import { PROBLEM_KIND_COPY, REPORT_COPY, SCENE_ALT, STATUS_COPY, WEEKDAYS, type CopyKey } from "./copy.ts";
import { percent, shortTokens } from "./format.ts";
import { REPORT_SCRIPT, SCRIPT_IDS, type ClientData, type SWAP_TARGETS } from "./script.ts";
import { REPORT_CSS } from "./style.ts";
import type { ReportView, ViewFinding, ViewServer } from "./view.ts";

type Values = Readonly<Record<string, string | number | null>>;
type Status = keyof typeof STATUS_COPY;
/** 언어를 바꿀 때 스크립트가 옮기는 속성 가운데 같은 이름의 속성인 것 */
type SwapAttr = Exclude<(typeof SWAP_TARGETS)[number], "text" | "value">;

/** 날짜별 응답 수의 진하기(적음에서 많음). 색각 이상 검증을 통과한 자료 색이다(설계 13.2) */
const RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#184f95"] as const;
const TOOL_COLORS: Record<ToolId, string> = { "claude-code": "#2a78d6" };
const REPO = "chunsik-garage";

/** 글과 속성 값을 HTML에 그대로 넣을 수 있게 바꾼다 */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

const textsOf = (make: (lang: Lang) => string): Texts<string> => ({ en: make("en"), ko: make("ko") });
const copy = (key: CopyKey, values?: Values): Texts<string> => textsOf((lang) => (values === undefined ? REPORT_COPY[key][lang] : fill(REPORT_COPY[key][lang], values)));
/** 이미 바꾼 두 언어의 HTML 조각을 언어마다의 span으로 감싼다 */
const pairHtml = (html: Texts<string>): string => LANGS.map((lang) => `<span lang="${lang}" data-l="${lang}">${html[lang]}</span>`).join("");
/** 두 언어의 글 */
const both = (texts: Texts<string>): string => pairHtml(textsOf((lang) => esc(texts[lang])));
/** 언어마다 따로 그리는 요소. 첫 태그에 lang과 data-l을 붙인다 */
const perLang = (make: (lang: Lang) => string): string => LANGS.map((lang) => make(lang).replace(/^<([a-z0-9]+)/, `<$1 lang="${lang}" data-l="${lang}"`)).join("");
/** 언어를 바꿀 때 옮길 속성. 처음 언어의 값을 넣고 두 언어의 값을 함께 둔다 */
const swap = (lang: Lang, attrs: Partial<Record<SwapAttr, Texts<string>>>): string =>
  ` data-tr${Object.entries(attrs)
    .map(([name, texts]) => ` ${name}="${esc(texts[lang])}" data-en-${name}="${esc(texts.en)}" data-ko-${name}="${esc(texts.ko)}"`)
    .join("")}`;
/** 문구 틀을 바꾼 뒤 자리에 HTML 조각을 끼운다 */
const fillHtml = (template: string, values: Readonly<Record<string, string>>): string => fill(esc(template), values);

const dayNumber = (date: LocalDate): number => {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

const ICONS: Record<Status, string> = {
  critical: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.5 17 16H1z" fill="#ec835a"/><rect x="8.1" y="6.2" width="1.8" height="5" fill="#0b0b0b"/><rect x="8.1" y="12.4" width="1.8" height="1.8" fill="#0b0b0b"/></svg>',
  caution: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.5 17 16H1z" fill="#fab219"/><rect x="8.1" y="6.2" width="1.8" height="5" fill="#0b0b0b"/><rect x="8.1" y="12.4" width="1.8" height="1.8" fill="#0b0b0b"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="#898781"/><rect x="8.1" y="7.6" width="1.8" height="5.4" fill="#fff"/><rect x="8.1" y="4.6" width="1.8" height="1.8" fill="#fff"/></svg>',
  good: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="#0ca30c"/><path d="M5 9.2 8 12l5-6" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  average: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="#898781" stroke-width="2"/><rect x="5" y="8.1" width="8" height="1.8" fill="#898781"/></svg>',
  unmeasured: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="#898781" stroke-width="2" stroke-dasharray="3 2.2"/><rect x="8.1" y="12.2" width="1.8" height="1.8" fill="#52514e"/><path d="M6.6 6.8a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1 .8-1 1.6" stroke="#52514e" stroke-width="1.8" fill="none"/></svg>',
};
const LOCK = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="7" width="11" height="7.5" rx="1.5" fill="#52514e"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#52514e" stroke-width="1.8" fill="none"/></svg>';

function statusOf(finding: ViewFinding): Status {
  if (finding.category === "strength") return "good";
  if (finding.category === "average") return "average";
  if (finding.category === "unmeasured") return "unmeasured";
  return finding.severity === "critical" ? "critical" : finding.severity === "caution" ? "caution" : "info";
}

/** 이름 칩. 칸 이름은 화면 읽기 프로그램에 목록의 이름으로 알린다 */
function chips(lang: Lang, label: Texts<string>, items: string[]): string {
  if (items.length === 0) return "";
  return `<ul class="chips"${swap(lang, { "aria-label": label })}><li class="k" aria-hidden="true">${both(label)}</li>${items.join("")}</ul>`;
}

/** 큰 숫자 자리. 못 쟀으면 "잴 수 없음"과 이유의 낱말, 쟀으면 잰 값과 단위다(「3단계 계획 전 결정」의 1번) */
function figure(finding: ViewFinding): string {
  return perLang((lang) => {
    const text = finding.text[lang];
    if (text.value === null) return `<div class="fig nv">${esc(REPORT_COPY.unmeasured[lang])}<small>${esc(text.reason ?? "")}</small></div>`;
    const unit = text.unit === null ? "" : text.unit === "%" ? "%" : `<span class="u">${esc(text.unit)}</span>`;
    const long = `${text.value}${text.unit === "%" ? "%" : ""}`.length >= 6 ? " lg" : "";
    return `<div class="fig${long}">${esc(text.value)}${unit}<small>${esc(text.name)}</small></div>`;
  });
}

/** 판정에서 뺀 서버 한 줄. 지켜보는 중이면 며칠 뒤의 점검부터 판정할 수 있는지 적고, 날을 모르면 정하지 못했다고 적는다(설계 13.1) */
function serverLine(server: ViewServer): string {
  const project = server.projectName === null ? "" : `<small>${esc(server.projectName)}</small>`;
  if (server.why !== "not_established") return `<code>${esc(server.name)}</code>${project}`;
  // 지켜보는 중인 서버의 날은 늘 오늘 뒤다(1부의 serverJudgeableFrom). 그렇지 않은 값은 날을 정하지 못한 것으로 다룬다
  const day = server.daysUntil !== null && server.daysUntil >= 1 ? copy("judgeFrom", { n: server.daysUntil }) : copy("judgeUnknown");
  return `<span class="srv"><code>${esc(server.name)}</code>${project}<span class="when">${both(day)}</span></span>`;
}

/** E6 항목의 「판정에서 뺀 서버 N개」. 정보 줄, 까닭마다의 이름, claude.ai 연결을 막을 때 쓸 설정이다 */
function serversBlock(finding: ViewFinding, view: ReportView): string {
  if (finding.ruleId !== "E6" || view.servers.length === 0) return "";
  const notes = perLang((lang) => `<div>${finding.text[lang].notes.map((line) => `<p>${esc(line)}</p>`).join("")}</div>`);
  const order = Object.keys(UNJUDGED_COPY.en.why) as ViewServer["why"][];
  const groups = order.map((why) => ({ why, servers: view.servers.filter((server) => server.why === why) })).filter((group) => group.servers.length > 0);
  const items = groups
    .map((group) => {
      const watch = group.why === "not_established" ? `<span class="when">${both(copy("judgeChange"))}</span>${view.saved ? "" : `<span class="when">${both(copy("judgeNotSaved"))}</span>`}` : "";
      return `<li><b>${both(textsOf((lang) => UNJUDGED_COPY[lang].why[group.why]))}</b>${group.servers.map(serverLine).join("")}${watch}</li>`;
    })
    .join("");
  const connectors = view.servers.filter((server) => server.scope === "claude-ai");
  const deny = connectors.length === 0 ? "" : `<li><b>${both(copy("blockWith"))}</b><pre>${esc(`[\n${connectors.map((server) => `  { "serverName": ${JSON.stringify(server.name)} }`).join(",\n")}\n]`)}</pre><span class="when">${both(copy("blockNote"))}</span></li>`;
  return `<details class="how"><summary>${both(copy("serversOut", { n: view.servers.length }))}</summary>${notes}<ul class="names">${items}${deny}</ul></details>`;
}

/** 항목 하나. 큰 숫자와 상태, 제목, 설명, 처방, 정리할 것, 위치와 이름, 단추, 어떻게 쟀나다(설계 13.1) */
function item(finding: ViewFinding, view: ReportView, lang: Lang): string {
  const status = statusOf(finding);
  const repair = finding.category === "repair";
  const gain = repair && view.score.aq !== null && finding.gain !== null ? finding.gain : null;
  const tag =
    gain === null
      ? `<span class="tag">${both(AXIS_NAMES[finding.axis])}</span>`
      : `<span class="tag up">${both(textsOf((l) => fill(SUMMARY_COPY[l].gain, { axis: AXIS_NAMES[finding.axis][l], gain })))}</span>`;
  const description = finding.text.en.description || finding.text.ko.description ? `<p>${both(textsOf((l) => finding.text[l].description))}</p>` : "";
  const prescription = finding.category !== "strength" && finding.text.en.prescription !== null ? `<p class="fix">→ ${both(textsOf((l) => finding.text[l].prescription ?? ""))}</p>` : "";
  const targets = repair ? chips(lang, REPORT_COPY.targets, finding.targets.map((name) => `<li>${esc(name)}</li>`)) : "";
  const places = finding.ruleId === "S3" ? chips(lang, REPORT_COPY.places, view.setupProblems.map((problem) => `<li>${esc(problem.place)}<small>${both(PROBLEM_KIND_COPY[problem.kind])}</small></li>`)) : "";
  const missing = finding.ruleId === "F3" ? chips(lang, REPORT_COPY.missingProjects, view.missingInstructions.map((name) => `<li>${esc(name)}</li>`)) : "";
  const overlap = finding.ruleId === "F4" && view.worstOverlap !== null ? chips(lang, REPORT_COPY.overlapProject, [`<li>${esc(view.worstOverlap)}</li>`]) : "";
  const phrase = textsOf((l) => fill(REPORT_COPY.phrase[l], { name: finding.text[l].name }));
  const button = repair && finding.targets.length > 0 ? `<button type="button" class="act" data-act="copy" data-phrase-en="${esc(phrase.en)}" data-phrase-ko="${esc(phrase.ko)}">${both(REPORT_COPY.clean)}</button>` : "";
  const how =
    finding.text.en.method.length + finding.text.ko.method.length === 0
      ? ""
      : `<details class="how"><summary>${both(REPORT_COPY.how)}</summary>${perLang((l) => `<div>${finding.text[l].method.map((line, index) => `<p${index > 0 ? ' class="ln"' : ""}>${esc(line)}</p>`).join("")}</div>`)}</details>`;
  return `<div class="it" id="it-${finding.ruleId}"><div>${figure(finding)}<span class="sev">${ICONS[status]}${both(STATUS_COPY[status])}</span></div><div><div class="top"><h3>${both(textsOf((l) => finding.text[l].title))}</h3><span class="tags">${tag}</span></div>${description}${prescription}${targets}${places}${missing}${overlap}${button}${how}${serversBlock(finding, view)}</div></div>`;
}

function header(view: ReportView, art: ReportArt, lang: Lang): string {
  const face = art.face === null ? '<span class="noart" aria-hidden="true"></span>' : `<img id="${SCRIPT_IDS.face}" src="${esc(art.face)}" alt="" width="32" height="32">`;
  // 낱말 값(찾지 못함, 저장 안 함)은 고정폭 글꼴로 쓰면 한글 사이가 벌어져 본문 글꼴로 쓴다
  const tools = view.tools.length === 0 ? `<dd class="tx">${both(REPORT_COPY.noTools)}</dd>` : `<dd>${both(textsOf((l) => view.tools.map((tool) => TOOL_NAMES[tool][l]).join(" · ")))}</dd>`;
  const round = !view.saved ? `<dd class="tx">${both(REPORT_COPY.notSaved)}</dd>` : `<dd>${view.round === null ? "—" : both(copy("roundValue", { n: view.round }))}</dd>`;
  const langButton = (code: Lang, label: string): string => `<button type="button" data-set-lang="${code}" aria-pressed="${code === lang}" lang="${code}">${label}</button>`;
  return `<header class="hd"><div><div class="brandrow">${face}<div class="brand">${both(REPORT_COPY.brand)}</div></div><h1 class="title" id="h-title">${both(REPORT_COPY.title)}</h1></div><div class="hdr"><div class="langsw" role="group"${swap(lang, { "aria-label": REPORT_COPY.langGroup })}>${langButton("en", "English")}${langButton("ko", "한국어")}</div><dl class="info"><div><dt>${both(REPORT_COPY.date)}</dt><dd>${esc(view.today)}</dd></div><div><dt>${both(REPORT_COPY.tools)}</dt>${tools}</div><div><dt>${both(REPORT_COPY.period)}</dt><dd>${esc(view.window.from.slice(5))} ~ ${esc(view.window.to.slice(5))}</dd></div><div><dt>${both(REPORT_COPY.round)}</dt>${round}</div></dl></div></header>`;
}

/** 점수 띠와 진단 띠. AQ를 내지 않았으면 점수를 못 낸 화면의 그림, "점수 없음"과 까닭이고 먼저 고칠 것은 없다(설계 13.1, 「3단계 계획 전 결정」의 6·12번) */
function hero(view: ReportView, art: ReportArt, lang: Lang): string {
  const scored = view.score.aq !== null;
  const alt = SCENE_ALT[sceneFor(view.score.tier, view.unreadable)];
  const picture = art.scene === null ? `<div class="ph" role="img"${swap(lang, { "aria-label": alt })}>${both(alt)}</div>` : `<img id="${SCRIPT_IDS.scene}" src="${esc(art.scene)}" width="264" height="264"${swap(lang, { alt })}>`;
  // 장면 아래는 AQ를 냈으면 별명, 내지 않았으면 그 까닭이다(「3단계 계획 전 결정」의 12번)
  const caption = scored
    ? `<figcaption>${both(textsOf((l) => view.text[l].grade ?? ""))}</figcaption>`
    : view.withheldText === null
      ? ""
      : `<figcaption class="why">${both(view.withheldText)}</figcaption>`;
  const score = scored
    ? `<div class="score"><div class="n">${view.score.aq}</div><div class="lb">${both(REPORT_COPY.aqLabel)}</div><div class="stamp" role="img"${swap(lang, { "aria-label": copy("gradeAria", { g: view.score.grade }) })}><div><b>${esc(view.score.grade ?? "")}</b><em>${both(REPORT_COPY.grade)}</em></div></div></div>`
    : `<div class="score"><div class="n none">${both(REPORT_COPY.noScore)}</div><div class="lb">${both(REPORT_COPY.aqLabel)}</div></div>`;
  const axes = view.axes
    .map((axis) => {
      const name = AXIS_NAMES[axis.axis];
      const counts = pairHtml(textsOf((l) => fillHtml(REPORT_COPY.axisCounts[l], { g: `<b>${groupDigits(axis.strengths)}</b>`, f: `<b>${groupDigits(axis.repairs)}</b>` })));
      if (axis.score === null) return `<div class="ax"><span class="nm">${both(name)}<span class="ct">${counts}</span></span><span class="tr none" role="img"${swap(lang, { "aria-label": textsOf((l) => fill(REPORT_COPY.axisNone[l], { axis: name[l] })) })}></span><span class="v none">${both(REPORT_COPY.unmeasured)}</span></div>`;
      return `<div class="ax"><span class="nm">${both(name)}<span class="ct">${counts}</span></span><span class="tr" role="img"${swap(lang, { "aria-label": textsOf((l) => fill(REPORT_COPY.axisAria[l], { axis: name[l], v: axis.score })) })}><i style="width:${axis.score}%"></i></span><span class="v">${axis.score}</span></div>`;
    })
    .join("");
  const rows = view.axes.map((axis) => `<tr><th scope="row">${both(AXIS_NAMES[axis.axis])}</th><td>${axis.score === null ? both(REPORT_COPY.unmeasured) : axis.score}</td><td>${axis.strengths}</td><td>${axis.repairs}</td></tr>`).join("");
  const table = `<table class="sr"><caption>${both(REPORT_COPY.axesTable)}</caption><thead><tr><th scope="col">${both(REPORT_COPY.thAxis)}</th><th scope="col">${both(REPORT_COPY.thScore)}</th><th scope="col">${both(REPORT_COPY.thGood)}</th><th scope="col">${both(REPORT_COPY.thFix)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  const best = view.findings.find((finding) => finding.category === "strength") ?? null;
  const first = scored ? (view.findings.find((finding) => finding.category === "repair") ?? null) : null;
  const bestLine =
    best === null
      ? "<div></div>"
      : `<div class="pt">${ICONS.good}<span><b>${both(REPORT_COPY.best)}</b>${both(
          textsOf((l) => {
            const text = best.text[l];
            const value = text.value === null ? REPORT_COPY.unmeasured[l] : text.unit === null ? text.value : joinValue(text.value, text.unit, l);
            return `${text.title} · ${fill(SUMMARY_COPY[l].best, { name: text.name, value })}`;
          }),
        )}</span></div>`;
  const fixLine =
    first === null
      ? ""
      : `<div class="pt">${ICONS[statusOf(first)]}<span><b>${both(REPORT_COPY.fixFirst)}</b>${both(
          textsOf((l) => `${first.text[l].title} · ${fixDetail({ ruleId: first.ruleId, axis: first.axis, gain: first.gain, measured: first.measured, candidates: first.targets.length, unmeasuredTools: first.unmeasuredTools }, l)}`),
        )}</span></div>`;
  return `<section class="hero"${swap(lang, { "aria-label": REPORT_COPY.scoreAria })}><figure class="scene"><div class="pic">${picture}</div>${caption}</figure>${score}<div class="axes">${axes}${table}</div><div class="verdict"><div><h2>${both(REPORT_COPY.verdict)}</h2><p>${both(textsOf((l) => view.text[l].diagnosis))}</p></div>${bestLine}${fixLine}</div></section>`;
}

function columns(view: ReportView, art: ReportArt, lang: Lang): string {
  const strengths = view.findings.filter((finding) => finding.category === "strength");
  const repairs = view.findings.filter((finding) => finding.category === "repair");
  const sticker = (src: string | null): string => (src === null ? "" : `<img class="stk" src="${esc(src)}" alt="" width="56" height="56">`);
  const good = strengths.length > 0 ? strengths.map((finding) => item(finding, view, lang)).join("") : `<p class="empty">${both(textsOf((l) => view.text[l].noStrengths ?? ""))}</p>`;
  const fix = repairs.length > 0 ? repairs.map((finding) => item(finding, view, lang)).join("") : `<p class="empty">${both(textsOf((l) => view.text[l].noRepairs ?? ""))}</p>`;
  return `<div class="cols"><section class="col good" aria-labelledby="h-good"><h2 id="h-good"><span class="no">01</span>${both(REPORT_COPY.colGood)}<span class="cnt">${strengths.length}</span>${sticker(art.good)}</h2>${good}</section><section class="col" aria-labelledby="h-fix"><h2 id="h-fix"><span class="no">02</span>${both(REPORT_COPY.colFix)}<span class="cnt">${repairs.length}</span>${sticker(art.fix)}</h2>${fix}</section></div>`;
}

function lists(view: ReportView, lang: Lang): string {
  const block = (key: "avgList" | "unmList", category: "average" | "unmeasured"): string => {
    const found = view.findings.filter((finding) => finding.category === category);
    const body = found.length > 0 ? found.map((finding) => item(finding, view, lang)).join("") : `<p class="empty">${both(REPORT_COPY.none)}</p>`;
    return `<details><summary>${both(REPORT_COPY[key])} <span class="cnt">${found.length}</span></summary>${body}</details>`;
  };
  return `<div class="lists">${block("avgList", "average")}${block("unmList", "unmeasured")}</div>`;
}

const stateWord = (state: CalendarCell["state"]): Texts<string> => (state === "used" ? REPORT_COPY.stUsed : state === "unused" ? REPORT_COPY.lgUnused : REPORT_COPY.lgUnseen);
const tip = (date: string, texts: Texts<string>): string => ` data-tip-en="${esc(`${date} · ${texts.en}`)}" data-tip-ko="${esc(`${date} · ${texts.ko}`)}"`;

/** 날짜별 응답 수의 달력과 그 표(설계 13.1, 13.4) */
function calendar(view: ReportView, lang: Lang): { chart: string; table: string } {
  const cells = view.usage.calendar;
  if (cells.length === 0) return { chart: `<p class="empty">${both(REPORT_COPY.none)}</p>`, table: `<p class="empty">${both(REPORT_COPY.none)}</p>` };
  const used = cells.filter((cell) => cell.state === "used");
  const busiest = used.length > 0 ? Math.max(...used.map((cell) => cell.responses)) : 0;
  const scale = Math.max(1, busiest);
  const aria = copy("calAria", { from: cells[0]!.date, to: cells.at(-1)!.date, u: used.length, n: cells.filter((cell) => cell.state === "unused").length, x: cells.filter((cell) => cell.state === "unseen").length, max: busiest });
  const pad = (new Date(dayNumber(cells[0]!.date) * 86_400_000).getUTCDay() + 6) % 7;
  const heads = WEEKDAYS.en.map((_, index) => `<span class="wd" aria-hidden="true">${both({ en: WEEKDAYS.en[index]!, ko: WEEKDAYS.ko[index]! })}</span>`).join("");
  const days = cells
    .map((cell) => {
      if (cell.state === "unseen") return `<span class="unseen"${tip(cell.date, REPORT_COPY.lgUnseen)}></span>`;
      if (cell.state === "unused" || cell.responses === 0) return `<span class="unused"${tip(cell.date, REPORT_COPY.lgUnused)}></span>`;
      const level = Math.max(0, Math.min(3, Math.floor((cell.responses / scale) * 4 - 1e-9)));
      const count = groupDigits(cell.responses);
      return `<span style="background:${RAMP[level]}"${tip(cell.date, { en: count, ko: count })}></span>`;
    })
    .join("");
  const legend = `<div class="legend"><span class="k">${both(REPORT_COPY.less)}<span class="ramp">${RAMP.map((color) => `<i style="background:${color}"></i>`).join("")}</span>${both(REPORT_COPY.more)}</span><span class="k"><i class="unused"></i>${both(REPORT_COPY.lgUnused)}</span><span class="k"><i class="unseen"></i>${both(REPORT_COPY.lgUnseen)}</span></div>`;
  const chart = `<div class="heatwrap"><div class="heat" role="img"${swap(lang, { "aria-label": aria })}>${heads}${'<span class="pad" aria-hidden="true"></span>'.repeat(pad)}${days}</div><div class="tip" aria-hidden="true"></div></div>${legend}`;
  const rows = cells.map((cell) => `<tr><td>${cell.date}</td><td class="n">${cell.state === "unseen" ? "—" : groupDigits(cell.responses)}</td><td>${both(stateWord(cell.state))}</td></tr>`).join("");
  const table = `<table class="tv"><caption class="sr">${both(aria)}</caption><thead><tr><th scope="col">${both(REPORT_COPY.thDate)}</th><th scope="col">${both(REPORT_COPY.thReplies)}</th><th scope="col">${both(REPORT_COPY.thState)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  return { chart, table };
}

/** 도구별 나눔과 그 표. 표에는 줄이지 않은 정수를 쓴다(설계 13.4) */
function tools(view: ReportView): { chart: string; table: string } {
  const list = view.usage.byTool;
  if (list.length === 0) return { chart: `<p class="empty">${both(REPORT_COPY.noTools)}</p>`, table: `<p class="empty">${both(REPORT_COPY.noTools)}</p>` };
  const width = (part: number, total: number): number => Math.round((part / (total || 1)) * 10_000) / 100;
  const row = (label: Texts<string>, value: (tool: (typeof list)[number]) => number, format: (count: number, lang: Lang) => string): string => {
    const total = list.reduce((sum, tool) => sum + value(tool), 0);
    return perLang(
      (lang) =>
        `<div class="t"><span>${esc(label[lang])}</span><b>${esc(format(total, lang))}</b><div class="splitbar" role="img" aria-label="${esc(list.map((tool) => `${TOOL_NAMES[tool.tool][lang]} ${format(value(tool), lang)}`).join(", "))}">${list.map((tool) => `<i style="width:${width(value(tool), total)}%;background:${TOOL_COLORS[tool.tool]}"></i>`).join("")}</div>${list.map((tool) => `<small><i class="sw" style="background:${TOOL_COLORS[tool.tool]}"></i>${esc(TOOL_NAMES[tool.tool][lang])} ${esc(format(value(tool), lang))}</small>`).join("")}</div>`,
    );
  };
  const chart = `<div class="tools">${row(REPORT_COPY.kMain, (tool) => tool.mainSessions, (count) => groupDigits(count))}${row(REPORT_COPY.kOut, (tool) => tool.outputTokens, shortTokens)}</div>`;
  const rows = list.map((tool) => `<tr><th scope="row">${both(TOOL_NAMES[tool.tool])}</th><td class="n">${groupDigits(tool.mainSessions)}</td><td class="n">${groupDigits(tool.outputTokens)}</td></tr>`).join("");
  const table = `<table class="tv"><caption class="sr">${both(REPORT_COPY.toolsTable)}</caption><thead><tr><th scope="col">${both(REPORT_COPY.thTool)}</th><th scope="col">${both(REPORT_COPY.kMain)}</th><th scope="col">${both(REPORT_COPY.kOut)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  return { chart, table };
}

/** 03 사용 기록. 숫자 넷, 달력, 도구별 나눔, 셸 명령 몫이다. 점검 이력 그래프는 7단계에서 넣는다(설계 13.1) */
function usage(view: ReportView, lang: Lang): string {
  const days = dayNumber(view.window.to) - dayNumber(view.window.from) + 1;
  const kpi = (value: string, label: Texts<string>): string => `<div class="kpi"><b>${value}</b><span>${both(label)}</span></div>`;
  const kpis = [
    kpi(groupDigits(view.usage.mainSessions), REPORT_COPY.kMain),
    kpi(`${view.usage.activeDays}/${days}`, REPORT_COPY.kDays),
    kpi(both(textsOf((l) => shortTokens(view.usage.outputTokens, l))), REPORT_COPY.kOut),
    kpi(view.usage.cacheHit === null ? "—" : percent(view.usage.cacheHit), REPORT_COPY.kCache),
  ].join("");
  const cal = calendar(view, lang);
  const byTool = tools(view);
  const shell = view.usage.shellNonZero === null ? "" : `<p class="shell">${both(copy("shell", { v: percent(view.usage.shellNonZero) }))}</p>`;
  return `<section class="use" aria-labelledby="h-use"><div class="usehd"><h2 id="h-use"><span class="no">03</span>${both(REPORT_COPY.use)}</h2><button type="button" class="mini-btn" data-act="table"><span class="when-chart">${both(REPORT_COPY.asTable)}</span><span class="when-table">${both(REPORT_COPY.asChart)}</span></button></div><div class="kpis">${kpis}</div><div class="grid2"><div><p class="sub">${both(REPORT_COPY.cal)}</p><div class="chart">${cal.chart}</div><div class="table tvwrap">${cal.table}</div></div><div><p class="sub">${both(REPORT_COPY.byTool)}</p><div class="chart">${byTool.chart}</div><div class="table tvwrap">${byTool.table}</div></div></div>${shell}</section>`;
}

/** 「일부만 읽었다」 띠. 점수 띠 위에 둔다. 아래 경계이면 "적어도", 비율을 낼 수 없으면 숫자 없이 적는다(설계 9.8, 20.1) */
function partialBand(view: ReportView): string {
  if (view.partialReads.length === 0) return "";
  const lines = view.partialReads.map((read) => {
    const key = read.share === null ? "partialReadUnknown" : read.lowerBound ? "partialReadAtLeast" : "partialRead";
    return `<p>${both(textsOf((l) => fill(REPORT_COPY[key][l], { tool: TOOL_NAMES[read.tool][l], share: read.share === null ? null : percent(read.share) })))}</p>`;
  });
  return `<div class="partial" role="note">${ICONS.caution}<div>${lines.join("")}</div></div>`;
}

function notices(view: ReportView): string {
  if (view.notices.length === 0) return "";
  return `<section class="notices" aria-labelledby="h-notice"><h2 id="h-notice">${both(REPORT_COPY.notices)}</h2><ul>${view.notices.map((notice) => `<li>${ICONS.info}<span>${both(notice.text)}</span></li>`).join("")}</ul></section>`;
}

/** hasCard는 카드 자료가 있는지다. 카드 단추와 창은 자료가 있을 때만 둔다 */
function footer(hasCard: boolean): string {
  const share = hasCard ? `<button type="button" class="share" data-act="card" aria-haspopup="dialog">${both(REPORT_COPY.cardBtn)}</button>` : "<span></span>";
  return `<footer class="ft"><span class="lock">${LOCK}<span>${both(textsOf((l) => `${REPORT_COPY.footCalc[l]} ${REPORT_COPY.footPromise[l]}`))}</span></span>${share}<p class="names-note">${both(REPORT_COPY.footNames)}</p></footer>`;
}

/** 공유 카드 창(설계 14). 그림은 스크립트가 그린다. 내려받기가 막히면 창의 그림을 직접 저장한다 */
function cardDialog(hasCard: boolean): string {
  if (!hasCard) return "";
  return `<dialog class="card" id="${SCRIPT_IDS.dialog}" aria-labelledby="card-title"><h2 id="card-title">${both(REPORT_COPY.cardTitle)}</h2><img class="cardimg" id="${SCRIPT_IDS.cardImage}" alt="" width="1200" height="630" hidden><p class="empty" id="${SCRIPT_IDS.cardFail}" hidden>${both(REPORT_COPY.cardFail)}</p><div class="cardft"><span>${both(REPORT_COPY.cardNote)}</span><div class="btns"><a id="${SCRIPT_IDS.cardLink}" href="#" hidden>${both(REPORT_COPY.download)}</a><button type="button" id="${SCRIPT_IDS.cardClose}">${both(REPORT_COPY.close)}</button></div></div></dialog>`;
}

/** 스크립트에 넘기는 자료. 카드에는 점수와 기준, 고정 글만 싣는다(설계 14) */
function clientData(view: ReportView): ClientData {
  const aq = view.score.aq;
  const grade = view.score.grade;
  return {
    ui: { copied: REPORT_COPY.copied, copyFail: REPORT_COPY.copyFail, copyLabel: REPORT_COPY.copyLabel },
    card:
      aq === null || grade === null
        ? null
        : {
            aq,
            grade,
            today: view.today,
            file: `${REPO}-aq-${view.today}.png`,
            brand: textsOf((l) => REPORT_COPY.brand[l].toUpperCase()),
            title: REPORT_COPY.title,
            aqLabel: REPORT_COPY.aqLabel,
            gradeLabel: REPORT_COPY.grade,
            nick: textsOf((l) => view.text[l].grade ?? ""),
            repo: REPORT_COPY.cardRepo,
            alt: textsOf((l) => fill(REPORT_COPY.cardAlt[l], { aq, grade, name: view.text[l].grade ?? "" })),
            axes: view.axes.map((axis) => ({ name: AXIS_NAMES[axis.axis], score: axis.score })),
          },
  };
}

/** 결과 화면 HTML 한 파일 */
export function reportHtml(view: ReportView, art: ReportArt): string {
  const lang = view.lang;
  const hash = createHash("sha256").update(REPORT_SCRIPT, "utf8").digest("base64");
  const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'`;
  const title = copy("pageTitle", { date: view.today });
  const client = clientData(view);
  const data = JSON.stringify(client).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="${lang}" data-ui="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title data-tr data-en-text="${esc(title.en)}" data-ko-text="${esc(title.ko)}">${esc(title[lang])}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="sr" id="${SCRIPT_IDS.live}" role="status" aria-live="polite"></div>
<main><article class="sheet" aria-labelledby="h-title">${header(view, art, lang)}${partialBand(view)}${hero(view, art, lang)}${columns(view, art, lang)}${lists(view, lang)}${usage(view, lang)}${notices(view)}${footer(client.card !== null)}</article></main>
${cardDialog(client.card !== null)}
<div class="toast" id="${SCRIPT_IDS.toast}" aria-hidden="true"></div>
<script type="application/json" id="${SCRIPT_IDS.data}">${data}</script>
<script>${REPORT_SCRIPT}</script>
</body>
</html>
`;
}
