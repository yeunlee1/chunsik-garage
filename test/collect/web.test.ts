// 넣은 웹 채팅 내보내기를 점검이 모으는 것을 시험한다. 넣지 않음, 파일 없음, 읽지 못함, 다른 서비스, 캐시(넣을 때 만든 것, 바뀌면 다시 읽기, 시계가 거꾸로 가면 쓰지 않기), 내보낸 날(설계 「0.5.0에서 정한 것」)
import { readdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readExport } from "../../src/adapters/web/source.ts";
import { collectWeb, exportKey, primeWebCache, readFull, WEB_PARSER_ID } from "../../src/collect/web.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";
import { makeZip } from "../helpers/zip-writer.ts";

let dir: string;
const NOW = Date.UTC(2026, 10, 13, 3);
const clock = { nowMs: NOW, timeZone: "Asia/Seoul" };

beforeEach(async () => {
  dir = await makeTemp("aq-collect-web-");
});

afterEach(async () => {
  await removeTemp(dir);
});

const T = Date.UTC(2026, 10, 10, 1) / 1000;
const gpt = (id: string, at = T) => ({
  id,
  conversation_id: id,
  create_time: at,
  mapping: {
    u: { id: "u", parent: null, children: ["a"], message: { author: { role: "user" }, create_time: at, content: { content_type: "text", parts: ["x"] }, metadata: {} } },
    a: { id: "a", parent: "u", children: [], message: { author: { role: "assistant" }, create_time: at + 5, content: { content_type: "text", parts: ["y"] }, metadata: { model_slug: "gpt-5" } } },
  },
});
const zipOf = (conversations: unknown[]) => makeZip([{ name: "conversations.json", data: JSON.stringify(conversations) }]);
const entry = (path: string, tool: "web-chatgpt" | "web-claude" = "web-chatgpt") => ({ tool, path, addedAt: "2026-11-13T00:00:00.000Z" });
const options = (cacheDir: string | null = join(dir, "state", "cache"), rescan = false) => ({ env: {}, homedir: dir, clock, cacheDir, rescan });

describe("collectWeb", () => {
  it("넣은 것이 없으면 두 도구 모두 찾지 못한 것이고 요약이 없다", async () => {
    const results = await collectWeb([], options());
    expect(results.map((result) => [result.tool, result.detected, result.summaries.length, result.read.files])).toEqual([
      ["web-chatgpt", false, 0, 0],
      ["web-claude", false, 0, 0],
    ]);
  });

  it("넣은 파일을 읽어 대화마다 요약을 내고 내보낸 날(가장 늦은 사건의 날)을 알린다", async () => {
    const path = join(dir, "chatgpt.zip");
    await writeFile(path, zipOf([gpt("a"), gpt("b", T - 86_400)]));
    const [chat] = await collectWeb([entry(path)], options());
    expect(chat).toMatchObject({ tool: "web-chatgpt", detected: true, state: { path, missing: false, problem: null, skipped: 0, truncated: false, lastDate: "2026-11-10" } });
    expect(chat!.summaries).toHaveLength(2);
    expect(chat!.read).toMatchObject({ files: 1, bytes: chat!.read.listedBytes, fromCache: 0, unreadableFiles: [] });
    expect(chat!.visibleFrom).toBe("2026-11-09");
  });

  it("넣은 파일이 없으면 없다고만 알리고 읽지 못한 파일로 세지 않는다", async () => {
    const [chat] = await collectWeb([entry(join(dir, "gone.zip"))], options());
    expect(chat).toMatchObject({ detected: true, summaries: [], state: { missing: true, problem: null }, read: { files: 0, unreadableFiles: [] } });
  });

  it("읽지 못한 파일과 다른 서비스의 내보내기는 읽지 못한 파일로 세고 까닭을 남긴다", async () => {
    const broken = join(dir, "broken.zip");
    await writeFile(broken, Buffer.from("PK\u0003\u0004 not really a zip"));
    const other = join(dir, "claude.json");
    await writeFile(other, JSON.stringify([{ uuid: "c", chat_messages: [] }]));
    const results = await collectWeb([entry(broken), entry(other, "web-claude")], options());
    expect(results[0]).toMatchObject({ state: { problem: "zip-not-zip" }, read: { files: 1, unreadableFiles: [broken] } });
    expect(results[1]!.state.problem).toBeNull();
    const wrong = await collectWeb([entry(other, "web-chatgpt")], options());
    expect(wrong[0]).toMatchObject({ state: { problem: "unknown-service" }, summaries: [], read: { unreadableFiles: [other] } });
  });

  it("두 번째 점검은 캐시를 쓴다. 파일이 바뀌면 다시 읽고, --rescan이면 캐시를 믿지 않는다. 저장 없는 실행은 캐시를 쓰지 않는다", async () => {
    const path = join(dir, "chatgpt.zip");
    await writeFile(path, zipOf([gpt("a")]));
    const first = (await collectWeb([entry(path)], options()))[0]!;
    const second = (await collectWeb([entry(path)], options()))[0]!;
    expect([first.read.fromCache, second.read.fromCache]).toEqual([0, 1]);
    expect(second.summaries).toEqual(first.summaries);
    expect(second.state).toEqual(first.state);
    await writeFile(path, zipOf([gpt("a"), gpt("b")]));
    await utimes(path, new Date(NOW), new Date(NOW + 1000));
    const changed = (await collectWeb([entry(path)], options()))[0]!;
    expect([changed.read.fromCache, changed.summaries.length]).toEqual([0, 2]);
    expect((await collectWeb([entry(path)], options(join(dir, "state", "cache"), true)))[0]!.read.fromCache).toBe(0);
    expect((await collectWeb([entry(path)], options(null)))[0]!.read.fromCache).toBe(0);
    expect(await readdir(join(dir, "state", "cache", "web"))).toHaveLength(1);
  });

  it("압축을 푼 폴더도 모으고 캐시를 쓴다. 폴더 안의 대화 파일이 바뀌면 다시 읽는다(짝 검토 3 필수 1)", async () => {
    const { mkdir } = await import("node:fs/promises");
    const folder = join(dir, "extracted");
    await mkdir(join(folder, "export"), { recursive: true });
    await writeFile(join(folder, "export", "conversations.json"), JSON.stringify([gpt("a")]));
    const first = (await collectWeb([entry(folder)], options()))[0]!;
    expect(first).toMatchObject({ detected: true, state: { problem: null, missing: false }, read: { files: 1, fromCache: 0, unreadableFiles: [] } });
    expect(first.summaries).toHaveLength(1);
    expect((await collectWeb([entry(folder)], options()))[0]!.read.fromCache).toBe(1);
    await writeFile(join(folder, "export", "conversations.json"), JSON.stringify([gpt("a"), gpt("b")]));
    await utimes(join(folder, "export", "conversations.json"), new Date(NOW), new Date(NOW + 5000));
    const changed = (await collectWeb([entry(folder)], options()))[0]!;
    expect([changed.read.fromCache, changed.summaries.length]).toEqual([0, 2]);
    await mkdir(join(dir, "empty"));
    expect((await collectWeb([entry(join(dir, "empty"))], options()))[0]).toMatchObject({ state: { problem: "no-conversations" }, summaries: [] });
  });

  it("응답을 세는 법을 바꾼 해석기 버전이다. 앞 버전의 캐시는 쓰지 않는다(짝 검토 5 필수 2)", () => {
    expect(WEB_PARSER_ID).toBe("web@2");
  });

  it("폴더 안 파일의 크기와 수정 시각이 같아도 내용이 바뀌면 다시 읽는다(짝 검토 5 필수 4)", async () => {
    const { mkdir } = await import("node:fs/promises");
    const folder = join(dir, "same-size");
    await mkdir(folder, { recursive: true });
    const file = join(folder, "conversations.json");
    const claude = (sender: string) => JSON.stringify([{ uuid: "c1", created_at: "2026-11-10T01:00:00Z", chat_messages: [{ uuid: "1", sender, created_at: "2026-11-10T01:00:00Z" }, { uuid: "2", sender: "assistant", created_at: "2026-11-10T01:00:01Z" }] }]).padEnd(4096, " ");
    const fixed = new Date(NOW - 86_400_000);
    await writeFile(file, claude("human"));
    await utimes(file, fixed, fixed);
    const claudeOf = async () => (await collectWeb([entry(folder, "web-claude")], options())).find((result) => result.tool === "web-claude")!;
    const first = await claudeOf();
    await writeFile(file, claude("assistant"));
    await utimes(file, fixed, fixed);
    const second = await claudeOf();
    const sum = (summaries: typeof first.summaries) => summaries.flatMap((summary) => Object.values(summary.days)).reduce((total, day) => [total[0]! + day.humanRequests, total[1]! + day.responses], [0, 0]);
    expect(sum(first.summaries)).toEqual([1, 1]);
    expect(second.read.fromCache).toBe(0);
    // 두 메시지가 모두 응답이 되었다(Claude.ai는 어시스턴트 메시지마다 응답 하나)
    expect(sum(second.summaries)).toEqual([0, 2]);
  });

  it("앞뒤 지문은 한 번에 덜 읽혀도 다 채울 때까지 읽고, 파일이 먼저 끝나면 실패로 알린다(짝 검토 6 필수 2)", async () => {
    const data = Buffer.from(Array.from({ length: 10_000 }, (_, index) => index % 251));
    let calls = 0;
    // 한 번에 최대 7바이트만 주는 가짜 핸들
    const handle = {
      read: async (buffer: Buffer, offset: number, length: number, position: number) => {
        calls++;
        const take = Math.max(0, Math.min(7, length, data.length - position));
        data.copy(buffer, offset, position, position + take);
        return { bytesRead: take, buffer };
      },
    };
    const head = Buffer.alloc(100);
    expect(await readFull(handle, head, 50)).toBe(true);
    expect(head.equals(data.subarray(50, 150))).toBe(true);
    expect(calls).toBeGreaterThan(10);
    expect(await readFull(handle, Buffer.alloc(100), 9_950)).toBe(false);
  });

  it("넣을 때 만든 캐시를 첫 점검이 쓴다", async () => {
    const path = join(dir, "chatgpt.zip");
    await writeFile(path, zipOf([gpt("a")]));
    const key = await exportKey(path, clock.timeZone);
    const exported = await readExport(path, clock.timeZone, "2026-10-10");
    await primeWebCache(join(dir, "state", "cache"), path, key, exported, "2026-10-10", clock.timeZone);
    const [chat] = await collectWeb([entry(path)], options());
    expect(chat!.read.fromCache).toBe(1);
    expect(chat!.summaries.map((summary) => summary.sessionId)).toEqual(exported.summaries.map((summary) => summary.sessionId));
  });

  it("캐시를 만든 뒤 시계가 거꾸로 가서 수집 구간이 더 이르게 시작하면 캐시를 쓰지 않는다(버린 날이 다시 필요하다)", async () => {
    const path = join(dir, "chatgpt.zip");
    await writeFile(path, zipOf([gpt("a")]));
    await collectWeb([entry(path)], options());
    const earlier = { env: {}, homedir: dir, clock: { ...clock, nowMs: NOW - 10 * 86_400_000 }, cacheDir: join(dir, "state", "cache"), rescan: false };
    expect((await collectWeb([entry(path)], earlier))[0]!.read.fromCache).toBe(0);
  });
});
