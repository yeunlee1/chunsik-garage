// Codex 사용자 설정(config.toml)의 줄 단위 편집. 그 서버 표의 enabled 줄만 바꾸거나 더하거나 빼고(문서를 다시 쓰지 않는다), 바꾸기 전 검사의 뜻 비교를 한다(설계 16.3, 「6단계 2부 계획 전 결정」 3·5번)
import { isDeepStrictEqual } from "node:util";
import { isTable, parseCodexConfig } from "../scan/codex-config.ts";
import { headerKey, scanLine, splitDotted, type Multiline } from "./items.ts";

/** 편집 하나. set은 [mcp_servers.<table>]의 enabled를 그 값으로 쓰고, delete는 enabled 줄을 뺀다(되돌리기) */
export type TomlOp = { op: "set"; table: string; value: boolean } | { op: "delete"; table: string };

/** 열쇠가 enabled 하나인 줄(맨 열쇠나 따옴표 열쇠)과 그 참거짓 값. 값 뒤에는 공백과 주석만 온다 */
const ENABLED = /^(\s*(?:enabled|"enabled"|'enabled')\s*=\s*)(true|false)(?=\s*(?:#.*)?$)/;

interface Line {
  text: string;
  eol: string;
  /** 여러 줄 문자열 안에서 시작하는 줄이다 */
  inString: boolean;
}

/** 줄과 그 줄 끝으로 나눈다. 1부의 줄 훑기로 여러 줄 문자열 안의 줄을 가린다. 규칙에 맞지 않으면 null이다 */
function linesOf(text: string): Line[] | null {
  const parts = text.split(/(\r?\n)/);
  const lines: Line[] = [];
  let state: Multiline = null;
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i]!;
    lines.push({ text: line, eol: parts[i + 1] ?? "", inString: state !== null });
    const next = scanLine(line, state);
    if (next === undefined) return null;
    state = next;
  }
  return state === null ? lines : null;
}

const isHeader = (line: Line): boolean => !line.inString && headerKey(line.text) !== null;

function isHeaderOf(line: Line, table: string): boolean {
  if (line.inString) return false;
  const key = headerKey(line.text);
  const keys = key === null ? null : splitDotted(key);
  return keys !== null && keys.length === 2 && keys[0] === "mcp_servers" && keys[1] === table;
}

function editOne(text: string, op: TomlOp): string | null {
  const lines = linesOf(text);
  if (lines === null) return null;
  const heads = lines.flatMap((line, index) => (isHeaderOf(line, op.table) ? [index] : []));
  if (heads.length !== 1) return null;
  const head = heads[0]!;
  let end = head + 1;
  while (end < lines.length && !isHeader(lines[end]!)) end++;
  const found: number[] = [];
  for (let i = head + 1; i < end; i++) if (!lines[i]!.inString && ENABLED.test(lines[i]!.text)) found.push(i);
  if (found.length > 1) return null;
  if (op.op === "delete") {
    if (found.length === 0) return null;
    lines.splice(found[0]!, 1);
  } else if (found.length === 1) {
    const line = lines[found[0]!]!;
    line.text = line.text.replace(ENABLED, (_match, before: string) => `${before}${op.value}`);
  } else {
    // 표 머리 줄 바로 뒤에 더한다. 들여쓰기는 몸의 첫 열쇠 줄을, 줄 끝은 머리 줄을 따른다
    const headLine = lines[head]!;
    let indent = "";
    for (let i = head + 1; i < end; i++) {
      const line = lines[i]!;
      if (!line.inString && /\S/.test(line.text) && !/^\s*#/.test(line.text)) {
        indent = /^[ \t]*/.exec(line.text)![0];
        break;
      }
    }
    const added = { text: `${indent}enabled = ${op.value}`, eol: headLine.eol, inString: false };
    if (headLine.eol === "") {
      headLine.eol = text.includes("\r\n") ? "\r\n" : "\n";
      added.eol = "";
    }
    lines.splice(head + 1, 0, added);
  }
  return lines.map((line) => line.text + line.eol).join("");
}

/** 편집들을 차례로 넣은 후보 글. 그 서버의 표 머리가 한 번이 아니거나, enabled 줄이 둘 이상이거나, 뺄 줄이 없으면 null이다 */
export function editToml(original: string, ops: readonly TomlOp[]): string | null {
  let text: string | null = original;
  for (const op of ops) {
    if (text === null) return null;
    text = editOne(text, op);
  }
  return text;
}

/** 뜻의 차이(16.3). 원본을 푼 것에 승인받은 편집만 넣은 것과 후보를 푼 것이 같아야 한다 */
export function tomlMeaningOk(original: string, candidate: string, ops: readonly TomlOp[]): boolean {
  const expected = parseCodexConfig(original);
  const actual = parseCodexConfig(candidate);
  if (expected === null || actual === null) return false;
  for (const op of ops) {
    const servers = expected.mcp_servers;
    const table = isTable(servers) ? servers[op.table] : undefined;
    if (!isTable(table)) return false;
    if (op.op === "set") table.enabled = op.value;
    else if (!Object.hasOwn(table, "enabled")) return false;
    else delete table.enabled;
  }
  return isDeepStrictEqual(expected, actual);
}
