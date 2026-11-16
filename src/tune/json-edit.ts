// 사용자 설정(JSON)의 최소 편집. 토큰의 위치로 바꿀 자리를 찾아 그 범위만 갈아 끼우고(문서를 다시 쓰지 않는다), 바꾸기 전 검사의 뜻 비교를 한다(설계 16.3, 「6단계 2부 계획 전 결정」 2·4·5번)
import { isDeepStrictEqual } from "node:util";
import { isObject } from "../scan/json.ts";

type EntryParent = "skillOverrides" | "enabledPlugins";

/** 편집 하나. set과 delete는 묶음 안의 열쇠, append와 remove는 목록의 항목이다. delete와 remove는 되돌리기가 쓴다 */
export type JsonOp =
  | { op: "set"; parent: EntryParent; name: string; value: string | boolean }
  | { op: "delete"; parent: EntryParent; name: string }
  | { op: "append"; parent: "deniedMcpServers"; entry: { serverName: string } }
  | { op: "remove"; parent: "deniedMcpServers"; entry: { serverName: string } };

type Token = { type: "{" | "}" | "[" | "]" | ":" | "," | "string" | "scalar"; start: number; end: number };
type Container = { type: "object"; start: number; end: number; members: Member[] } | { type: "array"; start: number; end: number; items: Node[] };
type Node = Container | { type: "value"; start: number; end: number };
interface Member {
  key: string;
  start: number;
  value: Node;
}
interface Edit {
  start: number;
  end: number;
  text: string;
}
interface Style {
  eol: string;
  unit: string;
}
/** 새로 넣을 것 하나. indent는 그것이 놓이는 줄의 들여쓰기이고, null이면 한 줄로 쓴다 */
type Entry = (indent: string | null) => string;

const SCALAR = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;

function tokensOf(text: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      i++;
      continue;
    }
    if (char === "{" || char === "}" || char === "[" || char === "]" || char === ":" || char === ",") {
      tokens.push({ type: char, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (char === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (j >= text.length) return null;
      tokens.push({ type: "string", start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    SCALAR.lastIndex = i;
    const match = SCALAR.exec(text);
    if (match === null) return null;
    tokens.push({ type: "scalar", start: i, end: i + match[0].length });
    i += match[0].length;
  }
  return tokens;
}

/** 값들의 위치. JSON이 아니면 null이다 */
function treeOf(text: string): Node | null {
  const tokens = tokensOf(text);
  if (tokens === null) return null;
  let at = 0;
  const value = (): Node | null => {
    const token = tokens[at++];
    if (token === undefined) return null;
    if (token.type === "string" || token.type === "scalar") return { type: "value", start: token.start, end: token.end };
    if (token.type !== "{" && token.type !== "[") return null;
    const close = token.type === "{" ? "}" : "]";
    const members: Member[] = [];
    const items: Node[] = [];
    const done = (end: number): Container => (token.type === "{" ? { type: "object", start: token.start, end, members } : { type: "array", start: token.start, end, items });
    if (tokens[at]?.type === close) return done(tokens[at++]!.end);
    for (;;) {
      if (token.type === "{") {
        const key = tokens[at++];
        if (key?.type !== "string" || tokens[at++]?.type !== ":") return null;
        const inner = value();
        if (inner === null) return null;
        members.push({ key: JSON.parse(text.slice(key.start, key.end)) as string, start: key.start, value: inner });
      } else {
        const inner = value();
        if (inner === null) return null;
        items.push(inner);
      }
      const sep = tokens[at++];
      if (sep?.type === close) return done(sep.end);
      if (sep?.type !== ",") return null;
    }
  };
  try {
    const root = value();
    return root !== null && at === tokens.length ? root : null;
  } catch {
    return null;
  }
}

const eolOf = (text: string): string => (text.includes("\r\n") ? "\r\n" : "\n");

/** 들여쓰기 한 칸. 그 파일에서 가장 작은 들여쓰기를 따르고(탭이면 탭), 들여쓴 줄이 없으면 두 칸이다 */
function unitOf(text: string): string {
  let unit: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const indent = /^[ \t]+(?=\S)/.exec(line)?.[0];
    if (indent === undefined) continue;
    if (indent.startsWith("\t")) return "\t";
    if (unit === null || indent.length < unit.length) unit = indent;
  }
  return unit ?? "  ";
}

const indentAt = (text: string, pos: number): string => /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", pos - 1) + 1))![0];

const containerText = (open: string, close: string, entries: readonly Entry[], indent: string | null, style: Style): string => {
  if (indent === null) return `${open}${entries.map((entry) => entry(null)).join(", ")}${close}`;
  const inner = indent + style.unit;
  return `${open}${style.eol}${entries.map((entry) => inner + entry(inner)).join(`,${style.eol}`)}${style.eol}${indent}${close}`;
};
const member =
  (key: string, value: Entry): Entry =>
  (indent) =>
    `${JSON.stringify(key)}: ${value(indent)}`;
const scalar =
  (value: string | boolean): Entry =>
  () =>
    JSON.stringify(value);
const serverEntry =
  (serverName: string): Entry =>
  () =>
    `{ "serverName": ${JSON.stringify(serverName)} }`;

const spansOf = (node: Container): { start: number; end: number }[] => (node.type === "object" ? node.members.map((m) => ({ start: m.start, end: m.value.end })) : node.items);
const bracketsOf = (node: Container): [string, string] => (node.type === "object" ? ["{", "}"] : ["[", "]"]);

/** 묶음이나 목록 끝에 넣는다. 여러 줄이면 마지막 것과 같은 들여쓰기로, 한 줄이면 같은 줄에 넣는다. 비어 있으면 맨 바깥이 여러 줄일 때 여러 줄로 연다 */
function insertInto(text: string, node: Container, entry: Entry, style: Style, multiline: boolean): Edit {
  const spans = spansOf(node);
  const [open, close] = bracketsOf(node);
  const last = spans[spans.length - 1];
  if (last === undefined) return { start: node.start, end: node.end, text: containerText(open, close, [entry], multiline ? indentAt(text, node.start) : null, style) };
  if (text.slice(node.start, spans[0]!.start).includes("\n")) {
    const indent = indentAt(text, last.start);
    return { start: last.end, end: last.end, text: `,${style.eol}${indent}${entry(indent)}` };
  }
  return { start: last.end, end: last.end, text: `, ${entry(null)}` };
}

/** 묶음이나 목록에서 index번째를 뺀다. 앞 것과의 쉼표(첫째면 뒤 것 앞까지)를 함께 빼고, 하나뿐이면 빈 것으로 둔다 */
function removeAt(node: Container, index: number): Edit {
  const spans = spansOf(node);
  const [open, close] = bracketsOf(node);
  if (spans.length === 1) return { start: node.start, end: node.end, text: open + close };
  if (index > 0) return { start: spans[index - 1]!.end, end: spans[index]!.end, text: "" };
  return { start: spans[0]!.start, end: spans[1]!.start, text: "" };
}

/** 같은 열쇠가 둘 이상이면 마지막 것이다. JSON.parse와 스캐너가 마지막 것을 읽는다 */
function lastIndexOf(node: Extract<Container, { type: "object" }>, key: string): number {
  for (let i = node.members.length - 1; i >= 0; i--) if (node.members[i]!.key === key) return i;
  return -1;
}

/** 편집 하나를 지금 글에 넣는다. 넣을 수 없는 꼴이면 null이다 */
function editOne(text: string, op: JsonOp): string | null {
  const root = treeOf(text);
  if (root === null || root.type !== "object") return null;
  const style: Style = { eol: eolOf(text), unit: unitOf(text) };
  const multiline = text.slice(root.start, root.end).includes("\n");
  const parentAt = lastIndexOf(root, op.parent);
  let edit: Edit;
  if (parentAt < 0) {
    // 부모가 없으면 더하는 편집만 받는다(뺄 것이 없다)
    if (op.op === "delete" || op.op === "remove") return null;
    const child = op.op === "append" ? serverEntry(op.entry.serverName) : member(op.name, scalar(op.value));
    const open = op.op === "append" ? "[" : "{";
    const close = op.op === "append" ? "]" : "}";
    edit = insertInto(text, root, member(op.parent, (indent) => containerText(open, close, [child], indent, style)), style, multiline);
  } else {
    const node = root.members[parentAt]!.value;
    if (op.op === "append" || op.op === "remove") {
      if (node.type !== "array") return null;
      if (op.op === "append") edit = insertInto(text, node, serverEntry(op.entry.serverName), style, multiline);
      else {
        // 이 도구가 더한 항목({ "serverName": <이름> })과 같은 것만 뺀다. 마지막 것이다
        let index = -1;
        for (let i = node.items.length - 1; i >= 0 && index < 0; i--) {
          const item = node.items[i]!;
          if (isDeepStrictEqual(JSON.parse(text.slice(item.start, item.end)), { serverName: op.entry.serverName })) index = i;
        }
        if (index < 0) return null;
        edit = removeAt(node, index);
      }
    } else {
      if (node.type !== "object") return null;
      const at = lastIndexOf(node, op.name);
      if (op.op === "delete") {
        if (at < 0) return null;
        edit = removeAt(node, at);
      } else if (at >= 0) {
        const value = node.members[at]!.value;
        edit = { start: value.start, end: value.end, text: JSON.stringify(op.value) };
      } else edit = insertInto(text, node, member(op.name, scalar(op.value)), style, multiline);
    }
  }
  return text.slice(0, edit.start) + edit.text + text.slice(edit.end);
}

/**
 * 편집들을 차례로 넣은 후보 글. 원본이 null이면(파일이 없으면) 부모와 항목만 든 표준 JSON을 새로 짓는다(두 칸 들여쓰기, LF, 마지막 줄바꿈).
 * 맨 바깥이 묶음이 아니거나, 부모의 꼴이 다르거나, 뺄 것이 없으면 null이다
 */
export function editJson(original: string | null, ops: readonly JsonOp[]): string | null {
  let text: string | null = original ?? "{\n}\n";
  for (const op of ops) {
    if (text === null) return null;
    text = editOne(text, op);
  }
  return text;
}

const define = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

/** 뜻의 차이(16.3). 원본을 푼 것에 승인받은 편집만 넣은 것과 후보를 푼 것이 같아야 한다. 원본이 null이면 빈 묶음에서 시작한다 */
export function jsonMeaningOk(original: string | null, candidate: string, ops: readonly JsonOp[]): boolean {
  let expected: unknown;
  let actual: unknown;
  try {
    expected = original === null ? {} : JSON.parse(original);
    actual = JSON.parse(candidate);
  } catch {
    return false;
  }
  if (!isObject(expected)) return false;
  for (const op of ops) {
    if (!Object.hasOwn(expected, op.parent)) {
      if (op.op === "delete" || op.op === "remove") return false;
      define(expected, op.parent, op.op === "append" ? [] : {});
    }
    const parent = expected[op.parent];
    if (op.op === "set" || op.op === "delete") {
      if (!isObject(parent)) return false;
      if (op.op === "set") define(parent, op.name, op.value);
      else if (!Object.hasOwn(parent, op.name)) return false;
      else delete parent[op.name];
    } else {
      if (!Array.isArray(parent)) return false;
      if (op.op === "append") parent.push({ serverName: op.entry.serverName });
      else {
        let index = -1;
        for (let i = parent.length - 1; i >= 0 && index < 0; i--) if (isDeepStrictEqual(parent[i], { serverName: op.entry.serverName })) index = i;
        if (index < 0) return false;
        parent.splice(index, 1);
      }
    }
  }
  return isDeepStrictEqual(expected, actual);
}
