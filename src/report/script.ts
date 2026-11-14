// 결과 화면 안에서 도는 스크립트. 언어 바꾸기, 붙여 넣을 말 복사, 표로 보기, 달력의 말풍선, 공유 카드 그리기만 맡는다. 화면의 글은 Node가 두 언어로 다 그려 두고 여기서는 보이는 언어와 정해 둔 속성만 바꾼다. 바깥으로 요청을 보내지 않고, 글은 textContent와 속성으로만 넣는다(설계 13.2, 13.4, 14, 「3단계 계획 전 결정」의 2번)
import type { Texts } from "../core/copy/lang.ts";

/** 스크립트가 찾는 요소의 id. 화면(html.ts)도 이 이름으로 그린다 */
export const SCRIPT_IDS = {
  /** 스크립트에 넘기는 자료(JSON) */
  data: "aq-data",
  /** 눈에 보이는 알림(화면 읽기 프로그램에는 숨긴다) */
  toast: "toast",
  /** 화면 읽기 프로그램에 알리는 자리 */
  live: "live",
  /** 공유 카드 창과 그 안의 그림, 내려받기, 그리지 못했다는 글, 닫기 */
  dialog: "card-dlg",
  cardImage: "card-img",
  cardLink: "card-dl",
  cardFail: "card-fail",
  cardClose: "card-close",
  /** 카드에 다시 그리는 화면의 장면과 얼굴 그림 */
  scene: "art-scene",
  face: "art-face",
} as const;

/** 언어를 바꿀 때 data-en-<이름>, data-ko-<이름>에서 옮기는 것. text는 글, value는 글상자의 값, 나머지는 같은 이름의 속성이다 */
export const SWAP_TARGETS = ["text", "value", "aria-label", "alt", "title"] as const;

/** 화면이 스크립트에 넘기는 자료. 글은 두 언어를 다 넣고 끼울 값은 미리 채운다 */
export interface ClientData {
  ui: { copied: Texts<string>; copyFail: Texts<string>; copyLabel: Texts<string> };
  /** 공유 카드. AQ를 내지 않았으면 null이고 카드 단추도 없다(설계 14) */
  card: ClientCard | null;
}

/** 공유 카드 1(명세서 꼴)에 그리는 것. 프로젝트·스킬·서버 이름과 경로는 넣지 않는다(설계 14) */
export interface ClientCard {
  aq: number;
  grade: string;
  /** 점검일(YYYY-MM-DD) */
  today: string;
  /** 내려받을 파일 이름 */
  file: string;
  brand: Texts<string>;
  title: Texts<string>;
  aqLabel: Texts<string>;
  gradeLabel: Texts<string>;
  /** 등급의 별명 */
  nick: Texts<string>;
  repo: Texts<string>;
  alt: Texts<string>;
  axes: { name: Texts<string>; score: number | null }[];
}

const ID = SCRIPT_IDS;

/** 결과 화면의 <script>에 그대로 넣는 글. 템플릿 글자와 역슬래시를 쓰지 않는다 */
export const REPORT_SCRIPT = String.raw`(() => {
"use strict";
const root = document.documentElement;
const dataNode = document.getElementById("${ID.data}");
const data = dataNode ? JSON.parse(dataNode.textContent || "{}") : {};
const ui = data.ui || {};
const card = data.card || null;
const SWAP = ${JSON.stringify(SWAP_TARGETS)};
const FONT = 'system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif';
const MONO = 'ui-monospace,"Cascadia Mono",Consolas,monospace';
const lang = () => (root.getAttribute("data-ui") === "en" ? "en" : "ko");
const pick = (texts) => (texts ? texts[lang()] || "" : "");

/* 알림. 눈에 보이는 알림과 화면 읽기 프로그램용 자리를 따로 둔다 */
const toast = document.getElementById("${ID.toast}");
const live = document.getElementById("${ID.live}");
let toastTimer = 0;
let liveTimer = 0;
const hideToast = () => {
  clearTimeout(toastTimer);
  if (toast) toast.style.display = "none";
};
const announce = (message) => {
  if (live) {
    clearTimeout(liveTimer);
    live.textContent = "";
    liveTimer = setTimeout(() => { live.textContent = message; }, 60);
  }
  if (toast) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.style.display = "block";
    toastTimer = setTimeout(hideToast, 2600);
  }
};

/* 언어 바꾸기. 다시 그리지 않으므로 펼친 항목과 초점이 그대로다. 떠 있는 알림과 말풍선은 지난 언어의 글이라 닫는다 */
const setLang = (next) => {
  if (next !== "en" && next !== "ko") return;
  hideToast();
  clearTimeout(liveTimer);
  if (live) live.textContent = "";
  document.querySelectorAll(".tip").forEach((tip) => { tip.style.display = "none"; });
  root.setAttribute("data-ui", next);
  root.setAttribute("lang", next);
  document.querySelectorAll("[data-set-lang]").forEach((button) => button.setAttribute("aria-pressed", String(button.getAttribute("data-set-lang") === next)));
  const prefix = "data-" + next + "-";
  document.querySelectorAll("[data-tr]").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (!attr.name.startsWith(prefix)) return;
      const target = attr.name.slice(prefix.length);
      if (!SWAP.includes(target)) return;
      if (target === "text") el.textContent = attr.value;
      else if (target === "value") el.value = attr.value;
      else el.setAttribute(target, attr.value);
    });
  });
};

/* 두 언어의 글을 담은 요소 */
const both = (texts, tag) => {
  const holder = document.createElement(tag);
  ["en", "ko"].forEach((code) => {
    const span = document.createElement("span");
    span.setAttribute("lang", code);
    span.setAttribute("data-l", code);
    span.textContent = texts ? texts[code] || "" : "";
    holder.appendChild(span);
  });
  return holder;
};

/* 붙여 넣을 말 복사. 막히면 글상자에 골라 놓고 보인다(설계 13.2). 단추 하나에 글상자는 하나다 */
let boxCount = 0;
const removeCopyBox = (button) => {
  const old = button.nextElementSibling;
  if (old && old.classList.contains("copybox")) old.remove();
};
const showCopyBox = (button, phrases) => {
  hideToast();
  /* 앞선 복사 요청이 늦게 거절돼도 글상자가 겹치지 않게 넣기 직전에 다시 지운다 */
  removeCopyBox(button);
  const box = document.createElement("div");
  box.className = "copybox";
  const note = both(ui.copyFail, "p");
  boxCount += 1;
  note.id = "copy-note-" + boxCount;
  const area = document.createElement("textarea");
  area.readOnly = true;
  area.rows = 2;
  area.setAttribute("data-tr", "");
  ["en", "ko"].forEach((code) => {
    area.setAttribute("data-" + code + "-value", phrases[code]);
    area.setAttribute("data-" + code + "-aria-label", ui.copyLabel ? ui.copyLabel[code] || "" : "");
  });
  area.value = phrases[lang()];
  area.setAttribute("aria-label", pick(ui.copyLabel));
  area.setAttribute("aria-describedby", note.id);
  box.appendChild(note);
  box.appendChild(area);
  button.insertAdjacentElement("afterend", box);
  area.focus();
  area.select();
};
const copy = (button) => {
  const phrases = { en: button.getAttribute("data-phrase-en") || "", ko: button.getAttribute("data-phrase-ko") || "" };
  removeCopyBox(button);
  const clip = navigator.clipboard;
  if (!clip || !window.isSecureContext) {
    showCopyBox(button, phrases);
    return;
  }
  clip.writeText(phrases[lang()]).then(() => announce(pick(ui.copied)), () => showCopyBox(button, phrases));
};

/* 표로 보기와 그림으로 보기 */
const toggleTable = (button) => {
  const section = button.closest(".use");
  if (section) section.classList.toggle("as-table");
};

/* 달력의 말풍선(마우스). 키보드와 화면 읽기 프로그램은 표로 보기를 쓴다 */
const isCell = (node) => node instanceof Element && node.closest("[data-tip-en]") !== null;
document.addEventListener("mouseover", (event) => {
  if (!isCell(event.target)) return;
  const cell = event.target.closest("[data-tip-en]");
  const wrap = cell.closest(".heatwrap");
  const tip = wrap ? wrap.querySelector(".tip") : null;
  if (!tip) return;
  const box = cell.getBoundingClientRect();
  const frame = wrap.getBoundingClientRect();
  tip.textContent = cell.getAttribute("data-tip-" + lang()) || "";
  tip.style.left = box.left - frame.left + box.width / 2 + "px";
  tip.style.top = box.top - frame.top + "px";
  tip.style.display = "block";
});
document.addEventListener("mouseout", (event) => {
  if (!isCell(event.target) || isCell(event.relatedTarget)) return;
  const wrap = event.target.closest(".heatwrap");
  const tip = wrap ? wrap.querySelector(".tip") : null;
  if (tip) tip.style.display = "none";
});

/* 공유 카드 1(명세서 꼴). 브라우저 안에서 1200x630 PNG를 그린다(설계 14) */
const dialog = document.getElementById("${ID.dialog}");
let opener = null;
const imageFrom = (id) => new Promise((resolve) => {
  const source = document.getElementById(id);
  const src = source ? source.getAttribute("src") : null;
  if (!src) {
    resolve(null);
    return;
  }
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});
const roundRect = (g, x, y, w, h, r) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};
const drawCard = async () => {
  const [scene, face] = await Promise.all([imageFrom("${ID.scene}"), imageFrom("${ID.face}")]);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas");
  const ink = "#0b0b0b";
  const ink2 = "#52514e";
  const navy = "#2e3566";
  g.fillStyle = "#fcfcfb";
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = "#3ab4aa";
  g.fillRect(0, 0, 1200, 12);
  g.save();
  g.beginPath();
  g.arc(82, 62, 22, 0, Math.PI * 2);
  g.clip();
  if (face) g.drawImage(face, 60, 40, 44, 44);
  else {
    g.fillStyle = "#f3f2ee";
    g.fillRect(60, 40, 44, 44);
  }
  g.restore();
  g.textAlign = "left";
  g.fillStyle = ink2;
  g.font = "800 20px " + FONT;
  g.fillText(pick(card.brand), 118, 62, 560);
  g.fillStyle = ink;
  g.font = "800 26px " + FONT;
  g.fillText(pick(card.title), 118, 90, 560);
  g.save();
  roundRect(g, 60, 130, 400, 400, 28);
  g.clip();
  if (scene) g.drawImage(scene, 60, 130, 400, 400);
  else {
    g.fillStyle = "#f3f2ee";
    g.fillRect(60, 130, 400, 400);
  }
  g.restore();
  g.fillStyle = ink;
  g.font = "800 210px " + FONT;
  g.fillText(String(card.aq), 500, 330, 400);
  g.fillStyle = ink2;
  g.font = "700 20px " + FONT;
  g.fillText(pick(card.aqLabel), 508, 366, 400);
  g.save();
  g.translate(1010, 220);
  g.rotate((-13 * Math.PI) / 180);
  g.strokeStyle = navy;
  g.fillStyle = "rgba(252,252,251,.8)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(0, 0, 78, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, 70, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = navy;
  g.textAlign = "center";
  g.font = "800 70px " + FONT;
  g.fillText(card.grade, 0, 22, 120);
  g.font = "800 12px " + FONT;
  g.fillText(pick(card.gradeLabel), 0, 48, 110);
  g.restore();
  g.textAlign = "left";
  g.fillStyle = ink;
  g.font = "800 34px " + FONT;
  g.fillText(pick(card.nick), 508, 412, 632);
  card.axes.forEach((axis, index) => {
    const y = 456 + index * 34;
    g.textAlign = "left";
    g.fillStyle = ink;
    g.font = "700 22px " + FONT;
    g.fillText(pick(axis.name), 508, y + 9, 140);
    g.fillStyle = "#cde2fb";
    roundRect(g, 658, y - 4, 340, 14, 7);
    g.fill();
    if (axis.score !== null && axis.score > 0) {
      g.fillStyle = "#2a78d6";
      roundRect(g, 658, y - 4, Math.max(14, (340 * axis.score) / 100), 14, 7);
      g.fill();
    }
    g.textAlign = "right";
    g.fillStyle = ink;
    g.font = "700 24px " + MONO;
    g.fillText(axis.score === null ? "—" : String(axis.score), 1058, y + 10);
  });
  g.fillStyle = ink2;
  g.font = "700 20px " + MONO;
  g.textAlign = "left";
  g.fillText(card.today, 60, 600);
  g.textAlign = "right";
  g.fillText(pick(card.repo), 1140, 600);
  return canvas;
};
const openCard = (button) => {
  if (!card || !dialog) return;
  const image = document.getElementById("${ID.cardImage}");
  const link = document.getElementById("${ID.cardLink}");
  const fail = document.getElementById("${ID.cardFail}");
  if (!image || !link || !fail) return;
  opener = button;
  image.hidden = true;
  link.hidden = true;
  fail.hidden = true;
  dialog.showModal();
  drawCard()
    .then((canvas) => {
      const url = canvas.toDataURL("image/png");
      image.src = url;
      image.alt = pick(card.alt);
      image.hidden = false;
      link.href = url;
      link.download = card.file;
      link.hidden = false;
    })
    .catch(() => {
      fail.hidden = false;
    });
};
if (dialog) {
  const close = document.getElementById("${ID.cardClose}");
  if (close) close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (opener) opener.focus();
  });
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const langButton = target.closest("[data-set-lang]");
  if (langButton) {
    setLang(langButton.getAttribute("data-set-lang"));
    return;
  }
  const action = target.closest("[data-act]");
  if (!action) return;
  const kind = action.getAttribute("data-act");
  if (kind === "copy") copy(action);
  else if (kind === "table") toggleTable(action);
  else if (kind === "card") openCard(action);
});
})();`;
