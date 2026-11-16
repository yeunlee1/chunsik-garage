// 결과 화면 HTML을 읽어 화면 안의 스크립트를 Node에서 돌려 보는 작은 문서 대역. 이 저장소가 만드는 HTML과 그 스크립트가 쓰는 만큼의 요소, 속성, 사건, 그림, 캔버스만 흉내 낸다(시험 전용)
const VOID = new Set(["meta", "img", "link", "br", "hr", "input"]);
const RAW = new Set(["script", "style"]);
const decode = (text: string): string => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

type Listener = (event: FakeEvent) => void;
export interface FakeEvent {
  type: string;
  target: FakeElement;
  relatedTarget: FakeElement | null;
}

class FakeText {
  constructor(public text: string) {}
}

export class FakeElement {
  attributes: { name: string; value: string }[] = [];
  childNodes: (FakeElement | FakeText)[] = [];
  parent: FakeElement | null = null;
  style: Record<string, string> = {};
  value = "";
  readOnly = false;
  rows = 0;
  open = false;
  selected = false;
  listeners = new Map<string, Listener[]>();
  constructor(
    public tagName: string,
    public ownerDocument: FakeDocument,
  ) {}

  getAttribute(name: string): string | null {
    return this.attributes.find((attr) => attr.name === name)?.value ?? null;
  }
  setAttribute(name: string, value: string): void {
    const found = this.attributes.find((attr) => attr.name === name);
    if (found) found.value = String(value);
    else this.attributes.push({ name, value: String(value) });
  }
  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }
  removeAttribute(name: string): void {
    this.attributes = this.attributes.filter((attr) => attr.name !== name);
  }
  get id(): string {
    return this.getAttribute("id") ?? "";
  }
  set id(value: string) {
    this.setAttribute("id", value);
  }
  set className(value: string) {
    this.setAttribute("class", value);
  }
  get classList() {
    const list = () => (this.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    return {
      contains: (name: string) => list().includes(name),
      toggle: (name: string) => {
        const has = list().includes(name);
        this.setAttribute("class", (has ? list().filter((item) => item !== name) : [...list(), name]).join(" "));
        return !has;
      },
    };
  }
  get hidden(): boolean {
    return this.hasAttribute("hidden");
  }
  set hidden(value: boolean) {
    if (value) this.setAttribute("hidden", "");
    else this.removeAttribute("hidden");
  }
  get src(): string {
    return this.getAttribute("src") ?? "";
  }
  set src(value: string) {
    this.setAttribute("src", value);
  }
  get alt(): string {
    return this.getAttribute("alt") ?? "";
  }
  set alt(value: string) {
    this.setAttribute("alt", value);
  }
  get href(): string {
    return this.getAttribute("href") ?? "";
  }
  set href(value: string) {
    this.setAttribute("href", value);
  }
  get download(): string {
    return this.getAttribute("download") ?? "";
  }
  set download(value: string) {
    this.setAttribute("download", value);
  }
  get textContent(): string {
    return this.childNodes.map((node) => (node instanceof FakeText ? node.text : node.textContent)).join("");
  }
  set textContent(value: string) {
    this.childNodes = value === "" ? [] : [new FakeText(String(value))];
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement);
  }
  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parent = this;
    this.childNodes.push(child);
    return child;
  }
  insertAdjacentElement(where: "afterend", element: FakeElement): FakeElement {
    if (where !== "afterend" || this.parent === null) throw new Error(`대역이 다루지 않는 자리: ${where}`);
    element.remove();
    const siblings = this.parent.childNodes;
    siblings.splice(siblings.indexOf(this) + 1, 0, element);
    element.parent = this.parent;
    return element;
  }
  remove(): void {
    if (this.parent === null) return;
    this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1);
    this.parent = null;
  }
  get nextElementSibling(): FakeElement | null {
    if (this.parent === null) return null;
    const siblings = this.parent.children;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  /** 이 대역은 단순 선택자(`[이름]`, `.이름`, `태그`)만 다룬다 */
  matches(selector: string): boolean {
    const attr = /^\[([\w-]+)\]$/.exec(selector);
    if (attr) return this.hasAttribute(attr[1]!);
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (/^[a-z]+$/.test(selector)) return this.tagName === selector;
    throw new Error(`대역이 다루지 않는 선택자: ${selector}`);
  }
  closest(selector: string): FakeElement | null {
    for (let node: FakeElement | null = this; node !== null; node = node.parent) if (node.matches(selector)) return node;
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = [];
    const walk = (node: FakeElement) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  select(): void {
    this.selected = true;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 10, height: 10 };
  }
  /**
   * 모달 창으로 열고 창 안의 첫 단추로 초점을 옮긴다(이 저장소의 카드 창은 내려받기 고리가 숨어 있어 첫 단추가 닫기다).
   * 닫을 때 브라우저가 이전 초점으로 돌리는 것과 close 사건의 늦은 시점은 흉내 내지 않는다. 화면 스크립트가 직접 단추로 초점을 돌리는지만 본다
   */
  showModal(): void {
    this.open = true;
    this.modal = true;
    this.querySelector("button")?.focus();
  }
  modal = false;
  close(): void {
    this.open = false;
    this.modal = false;
    for (const listener of this.listeners.get("close") ?? []) listener({ type: "close", target: this, relatedTarget: null });
  }
}

/** 화면 스크립트가 쓰는 2D 그리기 함수. 여기 없는 이름을 부르면 실제 브라우저처럼 오류가 난다 */
const CANVAS_METHODS = ["arc", "arcTo", "beginPath", "clip", "closePath", "drawImage", "fill", "fillRect", "fillText", "moveTo", "restore", "rotate", "save", "stroke", "translate"] as const;
/** 색. # 뒤 소문자 16진수 여섯 자리이거나, 0~255 정수 셋과 0~1 알파를 빈칸 없이 쉼표로 이은 rgba다 */
const CANVAS_COLOR = /^(?:#[0-9a-f]{6}|rgba\((?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d),){3}(?:0|1|0?\.\d+)\))$/;
/** 글꼴 이름. 화면 스크립트의 두 글꼴 묶음에 든 이름만 받는다(따옴표까지 같아야 한다) */
const FONT_NAMES = new Set(["system-ui", "-apple-system", '"Segoe UI"', '"Malgun Gothic"', "sans-serif", "ui-monospace", '"Cascadia Mono"', "Consolas", "monospace"]);
/** 글꼴 값. 굵기(선택)와 정수 px 크기를 빈칸 하나씩으로 띄우고, 뒤에 위 이름을 빈칸 없이 쉼표로 잇는다 */
const CANVAS_FONT = /^(?:(?:normal|bold|[1-9]00) )?[1-9]\d*px (.+)$/;
const acceptsFont = (value: unknown): boolean => {
  const match = CANVAS_FONT.exec(String(value));
  return match !== null && match[1]!.split(",").every((name) => FONT_NAMES.has(name));
};
/**
 * 화면 스크립트가 쓰는 2D 속성과 받는 값, 처음 값. 받지 않는 값은 브라우저처럼 무시하고 앞의 값을 그대로 두되, 시험이 볼 수 있게 문서의 기록에 남긴다.
 * 받는 값은 화면 스크립트가 쓰는 꼴뿐이다. 그 밖은 브라우저가 받는 값이어도 받지 않는다. 받지 않는 쪽으로 틀리면 시험이 실패해 사람이 보게 되지만,
 * 받는 쪽으로 틀리면 브라우저가 알리지 않고 앞의 값을 쓰는 잘못을 시험이 숨기기 때문이다. 화면 스크립트가 새 꼴을 쓰게 되면 그 꼴을 여기에 더한다.
 * 받는 값 가운데 다른 값으로 바꾼 것(크기, 색, 글꼴 이름의 순서)은 브라우저가 그대로 그리므로 대역이 아니라 과제 8의 실제 카드 그림 확인이 본다
 */
const CANVAS_PROPERTIES: Record<string, { accepts: (value: unknown) => boolean; initial: unknown }> = {
  font: { accepts: acceptsFont, initial: "10px sans-serif" },
  fillStyle: { accepts: (value) => CANVAS_COLOR.test(String(value)), initial: "#000000" },
  strokeStyle: { accepts: (value) => CANVAS_COLOR.test(String(value)), initial: "#000000" },
  textAlign: { accepts: (value) => ["left", "right", "center"].includes(String(value)), initial: "start" },
  /** 기준선은 화면 스크립트가 쓰지 않아 어떤 값도 받지 않는다 */
  textBaseline: { accepts: () => false, initial: "alphabetic" },
  lineWidth: { accepts: (value) => typeof value === "number" && Number.isFinite(value) && value > 0, initial: 1 },
};

/**
 * 캔버스. 그리기 함수는 부른 것을 문서의 기록에 남기고, 글을 그릴 때의 글꼴과 잘라내기 안인지도 남기며, 그림 주소에 크기를 적는다.
 * 저장(save)과 복원(restore)은 실제 캔버스처럼 속성 값과 잘라내기를 쌓고 되돌린다. 좌표, 변환, 그리기 순서와 겹침, 그림의 실제 픽셀은 보지 않는다(과제 8의 실제 카드 그림 확인이 본다)
 */
export class FakeCanvas extends FakeElement {
  width = 300;
  height = 150;
  getContext(kind: string): unknown {
    if (kind !== "2d" || this.ownerDocument.canvasBroken) return null;
    const doc = this.ownerDocument;
    const context: Record<string, unknown> = {};
    let values: Record<string, unknown> = {};
    let clipped = false;
    const saved: { values: Record<string, unknown>; clipped: boolean }[] = [];
    for (const name of CANVAS_METHODS) context[name] = (...args: unknown[]) => void doc.canvasCalls.push([name, ...args]);
    context.save = () => {
      doc.canvasCalls.push(["save"]);
      saved.push({ values: { ...values }, clipped });
      doc.canvasDepth = saved.length;
    };
    context.restore = () => {
      doc.canvasCalls.push(["restore"]);
      const state = saved.pop();
      if (state === undefined) {
        doc.canvasUnbalanced += 1;
        return;
      }
      values = state.values;
      clipped = state.clipped;
      doc.canvasDepth = saved.length;
    };
    context.clip = () => {
      doc.canvasCalls.push(["clip"]);
      clipped = true;
    };
    context.fillText = (...args: unknown[]) => {
      doc.canvasCalls.push(["fillText", ...args]);
      doc.canvasTexts.push({ text: String(args[0]), font: String(values.font), clipped });
    };
    for (const [name, rule] of Object.entries(CANVAS_PROPERTIES)) {
      values[name] = rule.initial;
      Object.defineProperty(context, name, {
        get: () => values[name],
        set: (value: unknown) => {
          if (rule.accepts(value)) values[name] = value;
          else doc.canvasRejected.push([name, value]);
        },
        enumerable: true,
      });
    }
    return Object.seal(context);
  }
  toDataURL(type: string): string {
    return `data:${type};base64,FAKE-${this.width}x${this.height}`;
  }
}

export class FakeDocument {
  root = new FakeElement("#document", this);
  activeElement: FakeElement | null = null;
  /** 참이면 캔버스가 그리기 문맥을 주지 않는다(카드를 그리지 못하는 브라우저) */
  canvasBroken = false;
  /** 캔버스에서 부른 그리기 함수와 인자 */
  canvasCalls: unknown[][] = [];
  /** 캔버스에 그린 글, 그때의 글꼴, 잘라내기 안이었는지 */
  canvasTexts: { text: string; font: string; clipped: boolean }[] = [];
  /** 아직 복원하지 않은 저장의 수와, 저장 없이 부른 복원의 수 */
  canvasDepth = 0;
  canvasUnbalanced = 0;
  /** 캔버스가 받지 않아 무시한 속성 값(브라우저는 알리지 않고 앞의 값을 쓴다) */
  canvasRejected: unknown[][] = [];
  get documentElement(): FakeElement {
    return this.root.children[0]!;
  }
  getElementById(id: string): FakeElement | null {
    return this.root.querySelectorAll(`[id]`).find((element) => element.id === id) ?? null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    return this.root.querySelectorAll(selector);
  }
  createElement(tag: string): FakeElement {
    return tag === "canvas" ? new FakeCanvas(tag, this) : new FakeElement(tag, this);
  }
  addEventListener(type: string, listener: Listener): void {
    this.root.addEventListener(type, listener);
  }
  /** 사건을 대상에서 문서까지 올려 보낸다 */
  dispatch(type: string, target: FakeElement, relatedTarget: FakeElement | null = null): void {
    for (let node: FakeElement | null = target; node !== null; node = node.parent) for (const listener of node.listeners.get(type) ?? []) listener({ type, target, relatedTarget });
  }
}

/** 이 저장소가 만드는 HTML을 읽는다. 큰따옴표 속성, 빈 속성, 닫는 빗금, 원문 그대로인 script와 style만 다룬다 */
export function parseHtml(html: string): FakeDocument {
  const doc = new FakeDocument();
  const stack: FakeElement[] = [doc.root];
  let index = 0;
  while (index < html.length) {
    if (html.startsWith("<!", index)) {
      index = html.indexOf(">", index) + 1;
      continue;
    }
    if (html.startsWith("</", index)) {
      const end = html.indexOf(">", index);
      const name = html.slice(index + 2, end).trim().toLowerCase();
      while (stack.length > 1 && stack.pop()!.tagName !== name);
      index = end + 1;
      continue;
    }
    if (html[index] === "<" && /[a-zA-Z]/.test(html[index + 1] ?? "")) {
      const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(index))!;
      const element = doc.createElement(tag[1]!.toLowerCase());
      let cursor = index + tag[0].length;
      const attribute = /\s*([^\s=/>]+)(?:="([^"]*)")?/y;
      for (;;) {
        const rest = html.slice(cursor);
        if (/^\s*\/?>/.test(rest)) break;
        attribute.lastIndex = cursor;
        const match = attribute.exec(html);
        if (match === null) throw new Error(`속성을 읽지 못했다: ${html.slice(cursor, cursor + 40)}`);
        element.setAttribute(match[1]!, decode(match[2] ?? ""));
        cursor = attribute.lastIndex;
      }
      const close = html.indexOf(">", cursor);
      const selfClosing = html[close - 1] === "/";
      stack[stack.length - 1]!.appendChild(element);
      index = close + 1;
      if (RAW.has(element.tagName)) {
        const end = html.indexOf(`</${element.tagName}>`, index);
        element.textContent = html.slice(index, end);
        index = end + element.tagName.length + 3;
      } else if (!VOID.has(element.tagName) && !selfClosing) stack.push(element);
      continue;
    }
    const next = html.indexOf("<", index);
    // 태그로 읽지 못한 `<`에서 멈춰 같은 자리를 끝없이 돌지 않게, 읽지 못하는 글이면 그 자리를 알리고 멈춘다
    if (next === index) throw new Error(`대역이 읽지 못하는 글: ${html.slice(index, index + 40)}`);
    const text = html.slice(index, next === -1 ? html.length : next);
    if (text !== "") stack[stack.length - 1]!.childNodes.push(new FakeText(decode(text)));
    index = next === -1 ? html.length : next;
  }
  return doc;
}

/** 그림. 주소를 넣으면 다음 차례에 불러온 것으로 알린다. 빈 주소는 불러오지 못한 것이다 */
export class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    queueMicrotask(() => (value ? this.onload?.() : this.onerror?.()));
  }
}

export interface ScriptWorld {
  doc: FakeDocument;
  clipboard: { writeText: (text: string) => Promise<void> } | undefined;
}

/** 문서 대역 위에서 스크립트를 돌린다. 시계는 지금 전역의 setTimeout이다(시험이 가짜 시계로 바꿀 수 있다) */
export function runScript(script: string, world: ScriptWorld): void {
  const navigator = world.clipboard === undefined ? {} : { clipboard: world.clipboard };
  const window = { isSecureContext: true };
  new Function("document", "window", "navigator", "Image", "Element", "setTimeout", "clearTimeout", script)(world.doc, window, navigator, FakeImage, FakeElement, setTimeout, clearTimeout);
}

/** 기다리고 있는 약속을 모두 풀어 준다 */
export async function settle(): Promise<void> {
  for (let round = 0; round < 20; round++) await Promise.resolve();
}
