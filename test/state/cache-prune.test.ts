// 원본 파일이 없어진 캐시 항목을 점검 때 지우는 것을 시험한다. 원본이 있는 항목, 읽지 못한 항목, 이 도구가 쓰지 않은 것은 남기고 폴더 안으로 내려가지 않는다(설계 19.2, 20.1)
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { cacheKeyFor, isStaleCacheEntry, pruneCache, readCacheEntry, staleCacheEntries, storeCached } from "../../src/state/cache.ts";
import { removeFiles } from "../../src/state/folder.ts";
import { parseLines } from "../helpers/claude-lines.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

/** 기록 파일 하나를 만들고 그 캐시 항목을 실제와 같은 꼴로 넣는다. 항목의 파일 이름을 돌려준다 */
async function cached(name: string): Promise<{ log: string; entryName: string }> {
  const log = join(root, "logs", name);
  await put(log, "line\n");
  const key = await cacheKeyFor({ path: log, normPath: normalizePath(log), size: 5, mtimeMs: 0 }, "claude-code@1", "UTC");
  const toolDir = join(dir, "cache", "claude-code");
  const before = new Set(await readdir(toolDir).catch(() => [] as string[]));
  await storeCached(toolDir, { key, summary: parseLines([]), bytesRead: 5 });
  const entryName = (await readdir(toolDir)).find((item) => !before.has(item))!;
  return { log, entryName };
}

describe("원본이 없어진 캐시 정리", () => {
  it("원본이 없어진 항목만 지우고 원본이 있는 항목은 남긴다", async () => {
    const kept = await cached("a.jsonl");
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    expect(await pruneCache(dir)).toEqual({ removed: 1, skipped: null });
    expect(await readdir(join(dir, "cache", "claude-code"))).toEqual([kept.entryName]);
  });

  it("풀리지 않거나 원본 경로가 적혀 있지 않은 항목은 지운다", async () => {
    const kept = await cached("a.jsonl");
    const toolDir = join(dir, "cache", "claude-code");
    await writeFile(join(toolDir, `${"0".repeat(32)}.json`), "{not json");
    await writeFile(join(toolDir, `${"1".repeat(32)}.json`), JSON.stringify({ key: { size: 1 }, summary: {} }));
    expect(await pruneCache(dir)).toEqual({ removed: 2, skipped: null });
    expect(await readdir(toolDir)).toEqual([kept.entryName]);
  });

  it("항목을 읽지 못한 것(남긴다)과 읽었는데 깨진 것(지운다)을 가른다", async () => {
    const kept = await cached("a.jsonl");
    const toolDir = join(dir, "cache", "claude-code");
    expect(await readCacheEntry(join(toolDir, kept.entryName))).toEqual({ status: "ok", normPath: normalizePath(kept.log) });
    expect(await readCacheEntry(join(toolDir, `${"9".repeat(32)}.json`))).toEqual({ status: "unreadable" });
    await writeFile(join(toolDir, `${"0".repeat(32)}.json`), "{not json");
    expect(await readCacheEntry(join(toolDir, `${"0".repeat(32)}.json`))).toEqual({ status: "broken" });
    await writeFile(join(toolDir, `${"1".repeat(32)}.json`), JSON.stringify({ key: { normPath: "" } }));
    expect(await readCacheEntry(join(toolDir, `${"1".repeat(32)}.json`))).toEqual({ status: "broken" });
    // 읽지 못한 항목은 원본이 있는지조차 모르므로 남기고, 깨진 항목은 지운다
    expect(await isStaleCacheEntry(join(toolDir, `${"9".repeat(32)}.json`))).toBe(false);
    expect(await isStaleCacheEntry(join(toolDir, `${"0".repeat(32)}.json`))).toBe(true);
    expect(await isStaleCacheEntry(join(toolDir, kept.entryName))).toBe(false);
  });

  it("고른 뒤 지우기 전에 그 자리가 폴더로 바뀌면 폴더와 그 안은 지우지 않는다", async () => {
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    const stale = await staleCacheEntries(dir);
    const entry = join(dir, "cache", "claude-code", gone.entryName);
    expect(stale.paths).toEqual([entry]);
    await rm(entry);
    await put(join(entry, "user-data.txt"), "keep me");
    expect(await removeFiles(stale.paths, dir, stale.boundary!)).toEqual({ removed: 0, linked: 0 });
    expect(await readFile(join(entry, "user-data.txt"), "utf8")).toBe("keep me");
  });

  it("고른 뒤 캐시 폴더가 상태 폴더 안의 다른 폴더를 가리키는 링크로 바뀌면 그 안의 파일은 지우지 않는다", async () => {
    const gone = await cached("c.jsonl");
    await rm(gone.log);
    const stale = await staleCacheEntries(dir);
    expect(stale.paths).toEqual([join(dir, "cache", "claude-code", gone.entryName)]);
    await rename(join(dir, "cache"), join(dir, "cache-moved"));
    // 바로 위 폴더(도구 폴더)는 링크가 아니고 그 위의 캐시 폴더가 링크다
    const other = join(dir, "tune");
    await put(join(other, "claude-code", gone.entryName), "keep me");
    await linkDir(other, join(dir, "cache"));
    expect(await removeFiles(stale.paths, dir, stale.boundary!)).toEqual({ removed: 0, linked: 1 });
    expect(await readFile(join(other, "claude-code", gone.entryName), "utf8")).toBe("keep me");
  });

  it("항목 꼴이 아닌 이름, 폴더, 다른 도구의 폴더 밖 파일은 건드리지 않는다", async () => {
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    const toolDir = join(dir, "cache", "claude-code");
    await writeFile(join(toolDir, `${gone.entryName}.123.tmp`), "{}");
    await writeFile(join(toolDir, "notes.txt"), "mine");
    await mkdir(join(toolDir, `${"2".repeat(32)}.json`));
    await put(join(dir, "cache", "README.json"), "{}");
    expect(await pruneCache(dir)).toEqual({ removed: 1, skipped: null });
    expect((await readdir(toolDir)).sort()).toEqual([`${"2".repeat(32)}.json`, `${gone.entryName}.123.tmp`, "notes.txt"].sort());
    expect(await readdir(join(dir, "cache"))).toContain("README.json");
  });

  it("캐시 폴더가 없으면 지울 것이 없다", async () => {
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: null });
    await mkdir(dir, { recursive: true });
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: null });
  });

  it("도구의 캐시 폴더가 링크면 안을 지우지 않는다", async () => {
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    const outside = join(root, "outside-tool-cache");
    await rename(join(dir, "cache", "claude-code"), outside);
    await linkDir(outside, join(dir, "cache", "claude-code"));
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: null });
    expect(await readdir(outside)).toEqual([gone.entryName]);
  });

  it("캐시 폴더가 링크면 안을 지우지 않는다", async () => {
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    const outside = join(root, "outside-cache");
    await rename(join(dir, "cache"), outside);
    await linkDir(outside, join(dir, "cache"));
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: "cache" });
    expect(await readdir(join(outside, "claude-code"))).toEqual([gone.entryName]);
  });

  it("상태 폴더 자체가 링크면 안을 지우지 않는다", async () => {
    const real = join(root, "real-state");
    await mkdir(real, { recursive: true });
    await linkDir(real, dir);
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: "state" });
    expect(await readdir(join(real, "cache", "claude-code"))).toEqual([gone.entryName]);
  });
});
