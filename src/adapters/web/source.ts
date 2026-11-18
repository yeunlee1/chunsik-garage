// 웹 채팅 내보내기 파일(zip이나 대화 JSON 파일 하나)을 열어 대화 파일을 차례로 흘려 읽고, 어느 서비스의 것인지 가려 대화마다 세션 요약을 낸다. 대화 글은 원소를 해석하는 동안에만 메모리에 있다(설계 「0.5.0에서 정한 것」)
import { createReadStream } from "node:fs";
import { mkdtemp, open, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { LocalDate } from "../common/dates.ts";
import type { SessionSummary } from "../types.ts";
import { chatgptConversation, looksLikeChatgpt } from "./chatgpt.ts";
import { claudeConversation, looksLikeClaude } from "./claude-ai.ts";
import { conversationKey, webSummary, type WebConversation, type WebToolId } from "./conversation.ts";
import { JsonArraySplitter } from "./json-array.ts";
import { storedSource, wholeFile, ZipError, zipEntries, zipEntryChunks, type ZipEntry, type ZipErrorCode, type ZipSource } from "./zip.ts";

/** 대화 하나의 상한. 이보다 큰 대화는 해석하지 않고 버린 대화로 센다 */
export const MAX_CONVERSATION_BYTES = 64 * 1024 * 1024;

/** 대화가 든 파일의 이름. ChatGPT는 크면 conversations-000.json처럼 나눈다(숫자 자리 수는 정하지 않는다) */
const CONVERSATION_FILE = /^conversations(?:-\d+)?\.json$/i;
/** 바깥 zip 안에 대화를 담은 안쪽 zip(Conversations__…part-001.zip 같은 것) */
const CONVERSATION_ZIP = /^conversations.*\.zip$/i;

export type ExportProblem = "not-file" | "no-conversations" | "folder-too-large" | "not-array" | "unknown-service" | `zip-${ZipErrorCode}`;

export class ExportError extends Error {
  constructor(readonly problem: ExportProblem) {
    super(`web export: ${problem}`);
  }
}

export interface ExportRead {
  tool: WebToolId;
  /** 알아본 대화마다(대화를 읽은 차례) */
  summaries: SessionSummary[];
  /** 해석하지 않은 원소. 상한보다 큼, JSON이 깨짐, 대화의 꼴이 아님 */
  skipped: { tooLong: number; broken: number; unrecognized: number };
  /** 읽은 대화 파일(zip 안의 이름이나 파일 이름, 읽은 차례) */
  files: string[];
  /** 풀어 읽은 바이트 */
  bytesRead: number;
  /** 버린 날까지 모든 대화의 사람 요청과 응답 수, 가장 이른 시각과 가장 늦은 시각(가져올 때 알리는 데 쓴다) */
  totals: { requests: number; responses: number; firstMs: number | null; lastMs: number | null };
  /** 대화 파일의 배열이 모두 닫혔다. 거짓이면 파일이 중간에 끊겼다 */
  complete: boolean;
}

interface Collector {
  tool: WebToolId | null;
  summaries: SessionSummary[];
  /** 이미 센 대화의 지문. 같은 대화가 zip과 푼 파일로 함께 있으면 처음 것만 센다(짝 검토 5 필수 3) */
  seen: Set<string>;
  skipped: { tooLong: number; broken: number; unrecognized: number };
  totals: ExportRead["totals"];
  files: string[];
  bytesRead: number;
  complete: boolean;
}

function consume(collector: Collector, text: string, timeZone: string, keepFrom: LocalDate | null): void {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    collector.skipped.broken++;
    return;
  }
  // 첫 대화의 꼴로 서비스를 정한다. 그 뒤 다른 서비스의 꼴은 알아보지 못한 원소다
  if (collector.tool === null) {
    if (looksLikeChatgpt(value)) collector.tool = "web-chatgpt";
    else if (looksLikeClaude(value)) collector.tool = "web-claude";
  }
  const conversation: WebConversation | null = collector.tool === "web-chatgpt" ? chatgptConversation(value) : collector.tool === "web-claude" ? claudeConversation(value) : null;
  if (conversation === null || collector.tool === null) {
    collector.skipped.unrecognized++;
    return;
  }
  const key = conversationKey(collector.tool, conversation.id);
  if (collector.seen.has(key)) return;
  collector.seen.add(key);
  for (const event of conversation.events) {
    if (event.kind === "request") collector.totals.requests++;
    else collector.totals.responses++;
    if (event.atMs === null) continue;
    if (collector.totals.firstMs === null || event.atMs < collector.totals.firstMs) collector.totals.firstMs = event.atMs;
    if (collector.totals.lastMs === null || event.atMs > collector.totals.lastMs) collector.totals.lastMs = event.atMs;
  }
  collector.summaries.push(webSummary(collector.tool, conversation, timeZone, keepFrom));
}

/** 조각들을 대화 배열 하나로 읽는다. 맨 바깥이 배열이 아니면 ExportError다 */
async function readArray(name: string, chunks: AsyncIterable<Buffer>, collector: Collector, timeZone: string, keepFrom: LocalDate | null): Promise<void> {
  const splitter = new JsonArraySplitter({ element: (text) => consume(collector, text, timeZone, keepFrom), tooLong: () => collector.skipped.tooLong++ }, MAX_CONVERSATION_BYTES);
  for await (const chunk of chunks) {
    collector.bytesRead += chunk.length;
    splitter.push(chunk);
  }
  const end = splitter.end();
  if (end.notArray) throw new ExportError("not-array");
  collector.files.push(name);
  if (!end.closed) collector.complete = false;
}

const byName = (a: ZipEntry, b: ZipEntry): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const baseName = (name: string): string => basename(name.replaceAll("\\", "/"));

/** zip 구간 안의 대화 파일을 모두 읽는다. 읽은 대화 파일의 수를 낸다 */
async function readZip(source: ZipSource, prefix: string, collector: Collector, timeZone: string, keepFrom: LocalDate | null): Promise<number> {
  const entries = await zipEntries(source);
  const files = entries.filter((entry) => CONVERSATION_FILE.test(baseName(entry.name))).sort(byName);
  for (const entry of files) await readArray(prefix + entry.name, zipEntryChunks(source, entry), collector, timeZone, keepFrom);
  if (files.length > 0 || prefix !== "") return files.length;
  // 대화 파일이 바깥에 없으면 대화를 담은 안쪽 zip을 한 겹만 연다. 저장만 한 것은 그 자리에서, 압축한 것은 임시 파일로 풀어서 읽고 바로 지운다
  let count = 0;
  for (const entry of entries.filter((item) => CONVERSATION_ZIP.test(baseName(item.name))).sort(byName)) {
    const inner = await storedSource(source, entry);
    if (inner !== null) {
      count += await readZip(inner, `${entry.name}/`, collector, timeZone, keepFrom);
      continue;
    }
    const dir = await mkdtemp(join(tmpdir(), "aq-web-"));
    try {
      const path = join(dir, "inner.zip");
      const handle = await open(path, "w");
      try {
        for await (const chunk of zipEntryChunks(source, entry)) await handle.write(chunk);
      } finally {
        await handle.close();
      }
      count += await readZip(await wholeFile(path), `${entry.name}/`, collector, timeZone, keepFrom);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return count;
}

/** 폴더 안에서 내보내기로 읽는 파일 하나. rel은 폴더에서의 자리(빗금 /)다 */
export interface FolderFile {
  rel: string;
  path: string;
  size: number;
  mtimeMs: number;
  /** 대화를 담은 안쪽 zip이다(아니면 대화 JSON 파일) */
  zip: boolean;
}

/** 폴더를 훑는 깊이(폴더 자체가 0)와 훑는 항목의 상한. 내보내기가 아닌 큰 폴더를 넣어도 오래 돌지 않게 한다 */
const FOLDER_DEPTH = 2;
export const FOLDER_ENTRY_LIMIT = 20_000;

/**
 * 압축을 푼 내보내기 폴더에서 대화 파일(conversations.json, conversations-<숫자>.json)과 대화를 담은 안쪽 zip을 찾는다. 자리 차례다.
 * 두 겹 아래까지만 보고 링크는 따라가지 않는다(짝 검토 3 필수 1). 항목 상한에 걸리면 limited가 참이고, 부르는 쪽은 끝까지 읽지 못한 것으로 알린다(짝 검토 5 필수 5)
 */
export async function exportFolderFiles(dir: string, limit: number = FOLDER_ENTRY_LIMIT): Promise<{ files: FolderFile[]; limited: boolean }> {
  const found: FolderFile[] = [];
  let seen = 0;
  let limited = false;
  const walk = async (path: string, rel: string, depth: number): Promise<void> => {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (limited) return;
      if (++seen > limit) {
        limited = true;
        return;
      }
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        if (depth < FOLDER_DEPTH) await walk(child, childRel, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const zip = CONVERSATION_ZIP.test(entry.name);
      if (!zip && !CONVERSATION_FILE.test(entry.name)) continue;
      const info = await stat(child);
      found.push({ rel: childRel, path: child, size: info.size, mtimeMs: info.mtimeMs, zip });
    }
  };
  await walk(dir, "", 0);
  return { files: found.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0)), limited };
}

const isZip = async (path: string): Promise<boolean> => {
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await handle.read(head, 0, 4, 0);
    return bytesRead === 4 && head.readUInt32LE(0) === 0x04034b50;
  } finally {
    await handle.close();
  }
};

/**
 * 내보내기 파일을 읽는다. keepFrom보다 이른 날의 칸은 요약에서 버린다. 읽을 수 없으면 ExportError다.
 * zip이면 안의 conversations.json(나뉘었으면 conversations-NNN.json 모두, 바깥에 없으면 대화를 담은 안쪽 zip의 것)을, 폴더면 그 안의 대화 파일과 안쪽 zip을, 아니면 그 파일 자체를 대화 배열로 읽는다
 */
export async function readExport(path: string, timeZone: string, keepFrom: LocalDate | null, folderLimit: number = FOLDER_ENTRY_LIMIT): Promise<ExportRead> {
  const info = await stat(path);
  if (!info.isFile() && !info.isDirectory()) throw new ExportError("not-file");
  const collector: Collector = { tool: null, summaries: [], seen: new Set(), skipped: { tooLong: 0, broken: 0, unrecognized: 0 }, totals: { requests: 0, responses: 0, firstMs: null, lastMs: null }, files: [], bytesRead: 0, complete: true };
  try {
    if (info.isDirectory()) {
      const { files, limited } = await exportFolderFiles(path, folderLimit);
      // 대화 파일을 하나도 찾기 전에 상한에 걸렸으면 없다가 아니라 다 보지 못한 것이다(짝 검토 6 참고 1)
      if (files.length === 0) throw new ExportError(limited ? "folder-too-large" : "no-conversations");
      if (limited) collector.complete = false;
      for (const file of files) {
        if (file.zip) await readZip(await wholeFile(file.path), `${file.rel}/`, collector, timeZone, keepFrom);
        else await readArray(file.rel, createReadStream(file.path) as AsyncIterable<Buffer>, collector, timeZone, keepFrom);
      }
    } else if (await isZip(path)) {
      if ((await readZip(await wholeFile(path), "", collector, timeZone, keepFrom)) === 0) throw new ExportError("no-conversations");
    } else await readArray(basename(path), createReadStream(path) as AsyncIterable<Buffer>, collector, timeZone, keepFrom);
  } catch (error) {
    if (error instanceof ZipError) throw new ExportError(`zip-${error.code}`);
    throw error;
  }
  if (collector.tool === null) throw new ExportError("unknown-service");
  return { tool: collector.tool, summaries: collector.summaries, skipped: collector.skipped, files: collector.files, bytesRead: collector.bytesRead, totals: collector.totals, complete: collector.complete };
}
