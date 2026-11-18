// aq import add|remove|list. 웹 채팅(ChatGPT, Claude.ai)의 데이터 내보내기 파일을 점검에 넣고 뺀다. 파일은 복사하지 않고 자리만 적으며, 넣을 때 한 번 읽어 어느 서비스의 것인지 가리고 캐시를 만든다(설계 「0.5.0에서 정한 것」)
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { localDateOf, makeWindows } from "../adapters/common/dates.ts";
import type { WebToolId } from "../adapters/web/conversation.ts";
import { ExportError, readExport } from "../adapters/web/source.ts";
import type { EvalClock } from "../collect/claude.ts";
import { exportKey, primeWebCache } from "../collect/web.ts";
import { TOOL_NAMES } from "../core/copy/common.ts";
import { fill } from "../core/copy/format.ts";
import type { Lang } from "../core/copy/lang.ts";
import { readWebExports, withExport, writeWebExports, type WebExportEntry } from "../state/web-exports.ts";

export interface ImportOptions {
  stateDir: string;
  clock: EvalClock;
  lang: Lang;
  /** 캐시를 만든다(저장 없는 실행이 아니다) */
  cache: boolean;
}

export interface ImportAdded {
  tool: WebToolId;
  path: string;
  conversations: number;
  requests: number;
  responses: number;
  /** 가장 이른 사건과 가장 늦은 사건의 현지 날짜. 시각이 없으면 null */
  firstDate: string | null;
  lastDate: string | null;
  /** 읽지 못해 뺀 대화의 수와, 파일이 중간에 끊겼는지 */
  skipped: number;
  truncated: boolean;
  /** 앞서 넣었던 그 도구의 내보내기 파일. 없었으면 null */
  replaced: string | null;
  /** 넣은 목록이 깨져 새로 만들었다(앞서 넣은 다른 내보내기는 다시 넣어야 한다) */
  listReset: boolean;
}

export type ImportOutcome =
  | { action: "add"; added: ImportAdded; run: { text: string } }
  | { action: "remove"; removed: WebExportEntry | null; run: { text: string } }
  | { action: "list"; exports: WebExportEntry[]; run: { text: string } };

const COPY = {
  en: {
    added: "Added the {tool} export: {count} {count:conversation|conversations}{range}. The next checkup counts it.",
    range: " from {first} to {last}",
    replaced: " It replaces the export added before.",
    skipped: " {count} {count:conversation|conversations} could not be read and {count:is|are} left out.",
    truncated: " The file ended early, so only the conversations before the break are counted.",
    listReset: " The list of added exports was broken, so it was started again. Add any other export again.",
    removedReset: "The list of added exports was broken, so it was emptied. Add the exports you want again.",
    removed: "Removed the {tool} export from the checkup. The export file itself was not touched.",
    notAdded: "No {tool} export has been added.",
    list: "Added exports: {tools}.",
    none: "No web chat export has been added.",
  },
  ko: {
    added: "{tool} 내보내기를 넣었습니다. 대화 {count}개{range}. 다음 점검부터 셉니다.",
    range: ", {first}부터 {last}까지입니다",
    replaced: " 앞서 넣은 내보내기를 바꿨습니다.",
    skipped: " 읽지 못한 대화 {count}개는 뺐습니다.",
    truncated: " 파일이 중간에 끊겨 끊기기 전의 대화만 셉니다.",
    listReset: " 넣은 목록이 깨져 새로 만들었습니다. 다른 내보내기는 다시 넣어 주세요.",
    removedReset: "넣은 목록이 깨져 비웠습니다. 셀 내보내기를 다시 넣어 주세요.",
    removed: "{tool} 내보내기를 점검에서 뺐습니다. 내보내기 파일은 그대로 두었습니다.",
    notAdded: "넣은 {tool} 내보내기가 없습니다.",
    list: "넣은 내보내기는 {tools}입니다.",
    none: "넣은 웹 채팅 내보내기가 없습니다.",
  },
} as const;

const failure = (code: string, message: string): Error => Object.assign(new Error(message), { code });

/** 뺄 도구의 이름. chatgpt, claude(claude.ai), 식별자 그대로를 받는다 */
export function webToolOf(text: string | null): WebToolId | null {
  const value = text?.trim().toLowerCase() ?? "";
  if (value === "chatgpt" || value === "web-chatgpt") return "web-chatgpt";
  if (value === "claude" || value === "claude.ai" || value === "web-claude") return "web-claude";
  return null;
}

/** 넣은 목록. 깨졌으면 빈 목록과 깨졌다는 표시다. 목록에는 파일의 자리만 있어 새로 만들어도 내보내기 파일은 그대로다 */
async function entriesFor(stateDir: string): Promise<{ entries: WebExportEntry[]; broken: boolean }> {
  const loaded = await readWebExports(stateDir);
  return { entries: loaded.entries, broken: loaded.status === "broken" };
}

export async function runImportAdd(path: string, options: ImportOptions): Promise<ImportOutcome> {
  const copy = COPY[options.lang];
  const absolute = resolve(path);
  try {
    await stat(absolute);
  } catch {
    throw failure("not-found", `no file at ${absolute}`);
  }
  const { entries, broken } = await entriesFor(options.stateDir);
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const keepFrom = windows.collectDates[0]!;
  // 읽기 전의 열쇠. 읽는 동안 바뀌었으면 캐시를 만들지 않는다
  const before = options.cache ? await exportKey(absolute, options.clock.timeZone).catch(() => null) : null;
  let exported;
  try {
    exported = await readExport(absolute, options.clock.timeZone, keepFrom);
  } catch (error) {
    if (error instanceof ExportError) throw failure(error.problem, `not a readable ChatGPT or Claude.ai export: ${error.problem}`);
    throw error;
  }
  const tool = exported.tool;
  const replaced = entries.find((entry) => entry.tool === tool && entry.path !== absolute)?.path ?? null;
  await writeWebExports(options.stateDir, withExport(entries, { tool, path: absolute, addedAt: new Date(options.clock.nowMs).toISOString() }));
  if (options.cache) await primeWebCache(join(options.stateDir, "cache"), absolute, before, exported, keepFrom, options.clock.timeZone);

  const dateOf = (ms: number | null): string | null => (ms === null ? null : localDateOf(ms, options.clock.timeZone));
  const added: ImportAdded = {
    tool,
    path: absolute,
    conversations: exported.summaries.length,
    requests: exported.totals.requests,
    responses: exported.totals.responses,
    firstDate: dateOf(exported.totals.firstMs),
    lastDate: dateOf(exported.totals.lastMs),
    skipped: exported.skipped.tooLong + exported.skipped.broken + exported.skipped.unrecognized,
    truncated: !exported.complete,
    replaced,
    listReset: broken,
  };
  const name = TOOL_NAMES[tool][options.lang];
  const range = added.firstDate !== null && added.lastDate !== null ? fill(copy.range, { first: added.firstDate, last: added.lastDate }) : "";
  let text = fill(copy.added, { tool: name, count: added.conversations, range });
  if (replaced !== null) text += copy.replaced;
  if (added.skipped > 0) text += fill(copy.skipped, { count: added.skipped });
  if (added.truncated) text += copy.truncated;
  if (broken) text += copy.listReset;
  return { action: "add", added, run: { text } };
}

export async function runImportRemove(which: string | null, options: Omit<ImportOptions, "cache">): Promise<ImportOutcome> {
  const tool = webToolOf(which);
  if (tool === null) throw failure("unknown-tool", `not a web chat: ${which ?? "(none)"}; use chatgpt or claude`);
  const { entries, broken } = await entriesFor(options.stateDir);
  if (broken) {
    await writeWebExports(options.stateDir, []);
    return { action: "remove", removed: null, run: { text: COPY[options.lang].removedReset } };
  }
  const removed = entries.find((entry) => entry.tool === tool) ?? null;
  if (removed !== null) await writeWebExports(options.stateDir, entries.filter((entry) => entry.tool !== tool));
  const name = TOOL_NAMES[tool][options.lang];
  return { action: "remove", removed, run: { text: fill(removed === null ? COPY[options.lang].notAdded : COPY[options.lang].removed, { tool: name }) } };
}

export async function runImportList(options: Omit<ImportOptions, "cache">): Promise<ImportOutcome> {
  const loaded = await readWebExports(options.stateDir);
  const copy = COPY[options.lang];
  const exports = loaded.entries;
  const text = exports.length === 0 ? copy.none : fill(copy.list, { tools: exports.map((entry) => TOOL_NAMES[entry.tool][options.lang]).join(", ") });
  return { action: "list", exports, run: { text } };
}
