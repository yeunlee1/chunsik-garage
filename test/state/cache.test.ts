// 캐시 열쇠 만들기, 넣고 꺼내기, 열쇠가 하나라도 다르면 꺼내지 않기를 시험한다(설계 9.4, 21.1 반례)
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheKeyFor, loadCached, storeCached } from "../../src/state/cache.ts";
import { parseLines } from "../helpers/claude-lines.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aq-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const MTIME = Date.parse("2026-11-10T00:00:00Z");

async function logFile(name: string, content: string) {
  const path = join(dir, name);
  await writeFile(path, content);
  await utimes(path, MTIME / 1000, MTIME / 1000);
  return { path, normPath: path.toLowerCase(), size: Buffer.byteLength(content), mtimeMs: MTIME };
}

describe("cache", () => {
  it("넣은 것을 같은 열쇠로 꺼낸다", async () => {
    const file = await logFile("a.jsonl", "line\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    const entry = { key, summary: parseLines([]), bytesRead: 5 };
    await storeCached(join(dir, "cache"), entry);
    expect(await loadCached(join(dir, "cache"), key)).toEqual(entry);
  });
  it("크기와 수정 시각이 같은데 앞부분이 다르면 꺼내지 않는다", async () => {
    const file = await logFile("b.jsonl", "AAAA\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 5 });
    const changed = await logFile("b.jsonl", "BBBB\n");
    const newKey = await cacheKeyFor(changed, "claude-code@1", "UTC");
    expect(newKey.head).not.toBe(key.head);
    expect(await loadCached(join(dir, "cache"), newKey)).toBeNull();
  });
  it("해석 버전이나 시간대가 다르면 꺼내지 않는다", async () => {
    const file = await logFile("c.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
    expect(await loadCached(join(dir, "cache"), { ...key, parser: "claude-code@2" })).toBeNull();
    expect(await loadCached(join(dir, "cache"), { ...key, timeZone: "Asia/Seoul" })).toBeNull();
  });
  it("깨진 캐시 파일은 없는 것으로 본다", async () => {
    const file = await logFile("d.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
    const [name] = await readdir(join(dir, "cache"));
    await writeFile(join(dir, "cache", name!), "{broken");
    expect(await loadCached(join(dir, "cache"), key)).toBeNull();
  });
  it("열쇠가 같아도 요약의 모양이 다르면 꺼내지 않는다", async () => {
    const file = await logFile("f.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
    const [name] = await readdir(join(dir, "cache"));
    const path = join(dir, "cache", name!);
    const good = JSON.parse(await readFile(path, "utf8")) as { summary: Record<string, unknown> };
    for (const summary of [{}, null, { ...good.summary, days: null }, { ...good.summary, days: { "2026-11-11": { humanRequests: "1" } } }]) {
      await writeFile(path, JSON.stringify({ ...good, summary }));
      expect(await loadCached(join(dir, "cache"), key)).toBeNull();
    }
  });
  it("빈 파일도 열쇠를 만든다", async () => {
    const file = await logFile("e.jsonl", "");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    expect(key.size).toBe(0);
    expect(key.head).toBe(key.tail);
  });
});
