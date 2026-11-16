// 결과 화면 안의 스크립트를 실제로 만든 HTML 위에서 돌려 본다. 언어 바꾸기, 복사와 막힐 때의 글상자, 떠 있는 알림과 말풍선 닫기, 표로 보기, 공유 카드 그리기와 초점을 문서 대역에서 본다(설계 13.2, 13.4, 14, 「3단계 2부 계획에서 보완」의 2·9·10번)
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import type { ReportArt } from "../../src/report/assets.ts";
import { REPORT_COPY } from "../../src/report/copy.ts";
import { reportHtml } from "../../src/report/html.ts";
import { REPORT_SCRIPT, SCRIPT_IDS, SWAP_TARGETS } from "../../src/report/script.ts";
import { reportView, type ReportView } from "../../src/report/view.ts";
import { parseHtml, runScript, settle, type FakeDocument, type FakeElement, type ScriptWorld } from "../helpers/fake-dom.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";

const collected: CollectedTool = {
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
};
const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
const result = (sessions = enough): CheckupResult => {
  const input = evaluationInput([claudeTool({ sessions })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
};
const art: ReportArt = { scene: "data:image/webp;base64,U0NFTkU=", face: "data:image/webp;base64,RkFDRQ==", good: "data:image/webp;base64,R09PRA==", fix: "data:image/webp;base64,RklY" };
const scoredView = (): ReportView => reportView(result(), { saved: true, round: 1 });
/** 정리할 것이 있는 정비 항목을 하나 넣은 자료(작성자 PC에 없는 경우라 지어낸다) */
const withRepair = (view: ReportView): ReportView => ({
  ...view,
  findings: view.findings.map((finding) => (finding.ruleId === "E5" ? { ...finding, category: "repair" as const, severity: "caution" as const, gain: 4, targets: ["old-skill"] } : finding)),
});

function open(view: ReportView, clipboard?: ScriptWorld["clipboard"], pictures: ReportArt = art): FakeDocument {
  const doc = parseHtml(reportHtml(view, pictures));
  runScript(REPORT_SCRIPT, { doc, clipboard });
  return doc;
}
const byId = (doc: FakeDocument, id: string): FakeElement => {
  const element = doc.getElementById(id);
  if (element === null) throw new Error(`요소가 없다: ${id}`);
  return element;
};
const action = (doc: FakeDocument, kind: string): FakeElement => doc.querySelectorAll("[data-act]").find((element) => element.getAttribute("data-act") === kind)!;
const langButton = (doc: FakeDocument, code: "en" | "ko"): FakeElement => doc.querySelectorAll("[data-set-lang]").find((element) => element.getAttribute("data-set-lang") === code)!;
const click = (doc: FakeDocument, element: FakeElement): void => doc.dispatch("click", element);

afterEach(() => {
  vi.useRealTimers();
});

describe("언어 바꾸기", () => {
  it("언어 단추를 누르면 문서의 언어, 단추의 눌림, 정해 둔 속성이 모두 그 언어로 바뀌고 펼친 항목은 그대로다", () => {
    const doc = open(scoredView());
    const details = doc.querySelectorAll("details")[0]!;
    details.setAttribute("open", "");
    for (const code of ["en", "ko"] as const) {
      click(doc, langButton(doc, code));
      expect(doc.documentElement.getAttribute("data-ui")).toBe(code);
      expect(doc.documentElement.getAttribute("lang")).toBe(code);
      expect(langButton(doc, code).getAttribute("aria-pressed")).toBe("true");
      expect(langButton(doc, code === "en" ? "ko" : "en").getAttribute("aria-pressed")).toBe("false");
      let swapped = 0;
      for (const element of doc.querySelectorAll("[data-tr]")) {
        for (const target of SWAP_TARGETS) {
          const want = element.getAttribute(`data-${code}-${target}`);
          if (want === null) continue;
          swapped++;
          const now = target === "text" ? element.textContent : target === "value" ? element.value : element.getAttribute(target);
          expect(now, `${element.tagName} ${target}`).toBe(want);
        }
      }
      // 옮길 속성을 단 요소마다 적어도 하나를 옮겼다
      expect(swapped).toBeGreaterThanOrEqual(doc.querySelectorAll("[data-tr]").length);
      expect(swapped).toBeGreaterThan(0);
      expect(details.hasAttribute("open")).toBe(true);
    }
  });

  it("정해 둔 다섯 밖의 속성은 옮기지 않는다", () => {
    const doc = open(scoredView());
    const element = doc.querySelectorAll("[data-tr]")[0]!;
    element.setAttribute("data-en-onclick", "alert(1)");
    click(doc, langButton(doc, "en"));
    expect(element.hasAttribute("onclick")).toBe(false);
  });
});

describe("붙여 넣을 말 복사", () => {
  it("복사가 막히면(클립보드가 없다) 단추 아래 글상자에 붙여 넣을 말을 골라 두고 초점을 옮긴다. 언어를 바꾸면 그 말도 바뀌고, 다시 누르면 글상자는 하나다", () => {
    const doc = open(withRepair(scoredView()));
    const button = action(doc, "copy");
    click(doc, button);
    const box = button.nextElementSibling!;
    expect(box.classList.contains("copybox")).toBe(true);
    const area = box.querySelector("textarea")!;
    expect(area.value).toBe(button.getAttribute("data-phrase-ko"));
    expect(area.readOnly).toBe(true);
    expect(area.selected).toBe(true);
    expect(doc.activeElement).toBe(area);
    expect(area.getAttribute("aria-label")).toBe(REPORT_COPY.copyLabel.ko);
    click(doc, langButton(doc, "en"));
    expect(area.value).toBe(button.getAttribute("data-phrase-en"));
    expect(area.getAttribute("aria-label")).toBe(REPORT_COPY.copyLabel.en);
    click(doc, button);
    expect(doc.querySelectorAll(".copybox")).toHaveLength(1);
  });

  it("브라우저가 복사를 거절해도 글상자를 보인다", async () => {
    const doc = open(withRepair(scoredView()), { writeText: () => Promise.reject(new Error("denied")) });
    click(doc, action(doc, "copy"));
    await settle();
    expect(doc.querySelectorAll(".copybox")).toHaveLength(1);
  });

  it("복사 요청이 겹쳐 서로 다른 때에 늦게 거절돼도 글상자는 하나다", async () => {
    const rejects: (() => void)[] = [];
    const doc = open(withRepair(scoredView()), { writeText: () => new Promise<void>((_, reject) => void rejects.push(() => reject(new Error("denied")))) });
    const button = action(doc, "copy");
    click(doc, button);
    click(doc, button);
    expect(rejects).toHaveLength(2);
    rejects[0]!();
    await settle();
    rejects[1]!();
    await settle();
    expect(doc.querySelectorAll(".copybox")).toHaveLength(1);
  });

  it("복사에 성공하면 지금 언어로 알리고, 언어를 바꾸면 떠 있는 알림과 화면 읽기 프로그램용 글을 비운다", async () => {
    vi.useFakeTimers();
    const written: string[] = [];
    const doc = open(withRepair(scoredView()), { writeText: async (text) => void written.push(text) });
    const button = action(doc, "copy");
    const toast = byId(doc, SCRIPT_IDS.toast);
    const live = byId(doc, SCRIPT_IDS.live);
    click(doc, button);
    await settle();
    expect(written).toEqual([button.getAttribute("data-phrase-ko")]);
    expect(toast.style.display).toBe("block");
    expect(toast.textContent).toBe(REPORT_COPY.copied.ko);
    vi.advanceTimersByTime(60);
    expect(live.textContent).toBe(REPORT_COPY.copied.ko);
    click(doc, langButton(doc, "en"));
    expect(toast.style.display).toBe("none");
    expect(live.textContent).toBe("");
    // 알린 바로 뒤에 언어를 바꿔도 지난 언어의 글이 나중에 들어오지 않는다
    click(doc, button);
    await settle();
    click(doc, langButton(doc, "ko"));
    vi.advanceTimersByTime(3000);
    expect(live.textContent).toBe("");
    expect(written).toEqual([button.getAttribute("data-phrase-ko"), button.getAttribute("data-phrase-en")]);
  });
});

describe("표로 보기와 달력의 말풍선", () => {
  it("표로 보기 단추는 사용 기록 칸을 표로 바꾸고 다시 누르면 되돌린다", () => {
    const doc = open(scoredView());
    const use = doc.querySelectorAll(".use")[0]!;
    click(doc, action(doc, "table"));
    expect(use.classList.contains("as-table")).toBe(true);
    click(doc, action(doc, "table"));
    expect(use.classList.contains("as-table")).toBe(false);
  });

  it("달력 칸에 마우스를 올리면 지금 언어의 말풍선이 뜨고, 칸 밖으로 나가거나 언어를 바꾸면 닫힌다", () => {
    const doc = open(scoredView());
    const cell = doc.querySelectorAll("[data-tip-en]")[0]!;
    const tip = doc.querySelectorAll(".tip")[0]!;
    doc.dispatch("mouseover", cell);
    expect(tip.style.display).toBe("block");
    expect(tip.textContent).toBe(cell.getAttribute("data-tip-ko"));
    doc.dispatch("mouseout", cell, cell.parent);
    expect(tip.style.display).toBe("none");
    doc.dispatch("mouseover", cell);
    click(doc, langButton(doc, "en"));
    expect(tip.style.display).toBe("none");
    doc.dispatch("mouseover", cell);
    expect(tip.textContent).toBe(cell.getAttribute("data-tip-en"));
  });
});

describe("공유 카드", () => {
  it("카드 단추는 1200×630 그림을 그려 창에 넣고 내려받기 이름을 단다. 창을 닫으면 단추로 초점이 돌아온다", async () => {
    const view = scoredView();
    const doc = open(view);
    const share = action(doc, "card");
    share.focus();
    click(doc, share);
    // 모달 창으로 열어 초점이 창 안(닫기 단추)으로 간다. 그냥 열면 창이 화면 밖에 붙고 초점도 남는다
    expect(byId(doc, SCRIPT_IDS.dialog).open).toBe(true);
    expect(byId(doc, SCRIPT_IDS.dialog).modal).toBe(true);
    expect(doc.activeElement).toBe(byId(doc, SCRIPT_IDS.cardClose));
    await settle();
    // 카드에 점수, 등급, 점검일을 실제로 그렸다(대역은 화면 스크립트가 쓰는 그리기 함수만 받는다)
    const drawn = doc.canvasCalls.filter((call) => call[0] === "fillText").map((call) => call[1]);
    expect(drawn).toEqual(expect.arrayContaining([String(view.score.aq), view.score.grade, view.today]));
    // 그리는 동안 넣은 속성 값(글꼴, 색, 정렬, 선 굵기)이 모두 받는 값이었다. 브라우저는 받지 않는 값을 알리지 않고 앞의 값을 쓰므로 어느 하나만 틀려도 카드가 어긋난다
    expect(doc.canvasRejected).toEqual([]);
    // 저장과 복원이 짝을 이루고, 글은 모두 잘라내기 밖에서 그렸다(잘라내기는 얼굴과 장면 그림에만 쓴다). 복원을 빠뜨리면 뒤의 글이 잘려 사라진다
    expect(doc.canvasDepth).toBe(0);
    expect(doc.canvasUnbalanced).toBe(0);
    expect(doc.canvasTexts.filter((item) => item.clipped)).toEqual([]);
    // 큰 AQ 숫자, 등급, 별명은 정한 글꼴 크기로 그렸다
    const fontOf = (text: string): string | undefined => doc.canvasTexts.find((item) => item.text === text)?.font;
    expect(fontOf(String(view.score.aq))).toMatch(/^800 210px /);
    expect(fontOf(view.score.grade!)).toMatch(/^800 70px /);
    expect(fontOf(view.text.ko.grade!)).toMatch(/^800 34px /);
    const image = byId(doc, SCRIPT_IDS.cardImage);
    const link = byId(doc, SCRIPT_IDS.cardLink);
    expect(image.src).toBe("data:image/png;base64,FAKE-1200x630");
    expect(image.hidden).toBe(false);
    expect(image.alt).toContain(`AQ ${view.score.aq}`);
    expect(link.href).toBe(image.src);
    expect(link.download).toBe(`chunsik-garage-aq-${view.today}.png`);
    expect(link.hidden).toBe(false);
    expect(byId(doc, SCRIPT_IDS.cardFail).hidden).toBe(true);
    click(doc, byId(doc, SCRIPT_IDS.cardClose));
    expect(byId(doc, SCRIPT_IDS.dialog).open).toBe(false);
    expect(doc.activeElement).toBe(share);
  });

  it("그림이 없어도 카드를 그리고, 그리기 문맥이 없으면 그림 대신 그리지 못했다는 글을 보인다", async () => {
    const plain = open(scoredView(), undefined, { scene: null, face: null, good: null, fix: null });
    click(plain, action(plain, "card"));
    await settle();
    expect(byId(plain, SCRIPT_IDS.cardImage).src).toBe("data:image/png;base64,FAKE-1200x630");
    // 그림 대신 칠하는 길에서도 받지 않은 값이 없고, 저장과 복원이 짝을 이루며, 글이 잘라내기 밖에 있다
    expect(plain.canvasRejected).toEqual([]);
    expect(plain.canvasDepth).toBe(0);
    expect(plain.canvasUnbalanced).toBe(0);
    expect(plain.canvasTexts.filter((item) => item.clipped)).toEqual([]);
    const broken = open(scoredView());
    broken.canvasBroken = true;
    click(broken, action(broken, "card"));
    await settle();
    expect(byId(broken, SCRIPT_IDS.cardFail).hidden).toBe(false);
    expect(byId(broken, SCRIPT_IDS.cardImage).hidden).toBe(true);
    expect(byId(broken, SCRIPT_IDS.cardLink).hidden).toBe(true);
  });

  it("AQ가 없는 화면에도 스크립트가 돌고 카드 요소가 없다", () => {
    const doc = open(reportView(result([{ days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }]), { saved: false, round: null }));
    expect(doc.getElementById(SCRIPT_IDS.dialog)).toBeNull();
    expect(doc.querySelectorAll("[data-act]").some((element) => element.getAttribute("data-act") === "card")).toBe(false);
    click(doc, langButton(doc, "en"));
    expect(doc.documentElement.getAttribute("data-ui")).toBe("en");
  });
});
