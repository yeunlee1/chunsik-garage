// 캐시 열쇠 만들기, 넣고 꺼내기, 열쇠가 하나라도 다르면 꺼내지 않기를 시험한다(설계 9.4, 21.1 반례)
import { appendFile, mkdtemp, open, readdir, readFile, rm, stat, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKeyFor, keyStillMatches, loadCached, storeCached } from "../../src/state/cache.ts";
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
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    const entry = { key, summary: parseLines([]), bytesRead: 5 };
    await storeCached(join(dir, "cache"), entry);
    expect(await loadCached(join(dir, "cache"), key)).toEqual(entry);
  });
  it("크기와 수정 시각이 같은데 앞부분이 다르면 꺼내지 않는다", async () => {
    const file = await logFile("b.jsonl", "AAAA\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 5 });
    const changed = await logFile("b.jsonl", "BBBB\n");
    const newKey = (await cacheKeyFor(changed, "claude-code@1", "UTC"))!;
    expect(newKey.head).not.toBe(key.head);
    expect(await loadCached(join(dir, "cache"), newKey)).toBeNull();
  });
  it("해석 버전이나 시간대가 다르면 꺼내지 않는다", async () => {
    const file = await logFile("c.jsonl", "x\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
    expect(await loadCached(join(dir, "cache"), { ...key, parser: "claude-code@2" })).toBeNull();
    expect(await loadCached(join(dir, "cache"), { ...key, timeZone: "Asia/Seoul" })).toBeNull();
  });
  it("캐시의 읽은 바이트가 0 이상의 안전한 정수이고 파일 크기를 넘지 않을 때만 꺼낸다(음수, 소수, 무한대, 파일보다 큰 수, 빈 파일의 1, 안전하지 않은 큰 수는 없는 것으로 본다. 빈 파일의 0은 꺼낸다)", async () => {
    const file = await logFile("bytes.jsonl", "x\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    const folder = join(dir, "cache");
    await storeCached(folder, { key, summary: parseLines([]), bytesRead: 2 });
    const [name] = await readdir(folder);
    const text = await readFile(join(folder, name!), "utf8");
    expect(text).toContain('"bytesRead":2');
    expect(await loadCached(folder, key)).not.toBeNull();
    for (const bad of ["-1", "0.5", "1e999", String(key.size + 1)]) {
      await writeFile(join(folder, name!), text.replace('"bytesRead":2', `"bytesRead":${bad}`));
      expect(await loadCached(folder, key), bad).toBeNull();
    }
    const empty = await logFile("empty.jsonl", "");
    const emptyKey = (await cacheKeyFor(empty, "claude-code@1", "UTC"))!;
    await storeCached(folder, { key: emptyKey, summary: parseLines([]), bytesRead: 0 });
    expect(await loadCached(folder, emptyKey)).not.toBeNull();
    await storeCached(folder, { key: emptyKey, summary: parseLines([]), bytesRead: 1 });
    expect(await loadCached(folder, emptyKey)).toBeNull();
    // 열쇠의 크기가 커도 읽은 바이트가 안전한 정수가 아니면 꺼내지 않는다
    const huge = { ...key, size: 2 ** 53 };
    await storeCached(folder, { key: huge, summary: parseLines([]), bytesRead: 2 ** 53 });
    expect(await loadCached(folder, huge)).toBeNull();
  });
  it("깨진 캐시 파일은 없는 것으로 본다", async () => {
    const file = await logFile("d.jsonl", "x\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
    const [name] = await readdir(join(dir, "cache"));
    await writeFile(join(dir, "cache", name!), "{broken");
    expect(await loadCached(join(dir, "cache"), key)).toBeNull();
  });
  it("열쇠가 같아도 요약의 모양이 다르면 꺼내지 않는다", async () => {
    const file = await logFile("f.jsonl", "x\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
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
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    expect(key.size).toBe(0);
    expect(key.head).toBe(key.tail);
  });
  it("목록에서 본 뒤 크기나 수정 시각이 바뀐 파일은 열쇠를 만들지 않는다(쓰는 동안 수정 시각이 머물러도 크기로 안다)", async () => {
    const grown = await logFile("g.jsonl", "line\n");
    await appendFile(grown.path, "more\n");
    await utimes(grown.path, MTIME / 1000, MTIME / 1000);
    expect(await cacheKeyFor(grown, "claude-code@1", "UTC")).toBeNull();
    const touched = await logFile("h.jsonl", "line\n");
    await utimes(touched.path, (MTIME + 1000) / 1000, (MTIME + 1000) / 1000);
    expect(await cacheKeyFor(touched, "claude-code@1", "UTC")).toBeNull();
    expect(await cacheKeyFor({ ...touched, mtimeMs: MTIME + 1000 }, "claude-code@1", "UTC")).not.toBeNull();
  });
  it("목록에서 본 뒤 줄어든 파일과 수정 시각이 앞당겨진 파일도 열쇠를 만들지 않는다(늘었는지가 아니라 다른지를 본다)", async () => {
    const shrunk = await logFile("i.jsonl", "line\nmore\n");
    await truncate(shrunk.path, 5);
    await utimes(shrunk.path, MTIME / 1000, MTIME / 1000);
    expect(await cacheKeyFor(shrunk, "claude-code@1", "UTC")).toBeNull();
    const older = await logFile("j.jsonl", "line\n");
    await utimes(older.path, (MTIME - 1000) / 1000, (MTIME - 1000) / 1000);
    expect(await cacheKeyFor(older, "claude-code@1", "UTC")).toBeNull();
  });
  it("앞뒤 지문을 읽는 동안 크기나 수정 시각이 바뀌면 열쇠를 만들지 않는다(앞 지문 뒤와 뒤 지문 뒤, 늘거나 줄거나 늦어지거나 앞당겨진 것)", async () => {
    const probe = await open(join(dir, "probe"), "w");
    const proto: { read(...args: unknown[]): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    const changes: Array<[string, (path: string) => Promise<void>]> = [
      ["늘어남", async (path) => {
        await appendFile(path, "more\n");
        await utimes(path, MTIME / 1000, MTIME / 1000);
      }],
      ["줄어듦", async (path) => {
        await truncate(path, 8500);
        await utimes(path, MTIME / 1000, MTIME / 1000);
      }],
      ["늦어짐", (path) => utimes(path, (MTIME + 1000) / 1000, (MTIME + 1000) / 1000)],
      ["앞당겨짐", (path) => utimes(path, (MTIME - 1000) / 1000, (MTIME - 1000) / 1000)],
    ];
    for (const after of [1, 2]) {
      for (const [name, change] of changes) {
        const file = await logFile(`k-${after}-${name}.jsonl`, "x".repeat(9000));
        let reads = 0;
        // 지문을 after번째로 읽은 직후에 파일을 바꾼다
        const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, ...args: unknown[]) {
          const result = await read.apply(this, args);
          if (++reads === after) await change(file.path);
          return result;
        });
        try {
          expect(await cacheKeyFor(file, "claude-code@1", "UTC"), `${after}번째 지문 뒤 ${name}`).toBeNull();
        } finally {
          spy.mockRestore();
        }
      }
    }
  });
  it("넣기 직전 재확인은 바뀌지 않은 파일만 참이다(앞 지문만, 뒤 지문만 바뀌어도, 크기나 수정 시각이 바뀌어 열쇠가 없어도 거짓)", async () => {
    const body = `A${"x".repeat(8998)}Z`;
    const keep = (path: string) => utimes(path, MTIME / 1000, MTIME / 1000);
    const cases: Array<[string, boolean, (path: string) => Promise<void>]> = [
      ["그대로", true, async () => {}],
      ["앞 지문만", false, async (path) => {
        await writeFile(path, `B${body.slice(1)}`);
        await keep(path);
      }],
      ["뒤 지문만", false, async (path) => {
        await writeFile(path, `${body.slice(0, -1)}Y`);
        await keep(path);
      }],
      ["늘어남", false, async (path) => {
        await appendFile(path, "more\n");
        await keep(path);
      }],
      ["줄어듦", false, async (path) => {
        await truncate(path, 8500);
        await keep(path);
      }],
      ["늦어짐", false, (path) => utimes(path, (MTIME + 1000) / 1000, (MTIME + 1000) / 1000)],
      ["앞당겨짐", false, (path) => utimes(path, (MTIME - 1000) / 1000, (MTIME - 1000) / 1000)],
    ];
    for (const [name, expected, change] of cases) {
      const file = await logFile(`r-${name}.jsonl`, body);
      const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
      await change(file.path);
      expect(await keyStillMatches(file.path, key), name).toBe(expected);
    }
  });
  it("큰 파일의 앞 4KB만 바뀌거나 끝 4KB만 바뀌어도 캐시에서 꺼내지 않는다", async () => {
    const body = `A${"x".repeat(8998)}Z`;
    const key = (await cacheKeyFor(await logFile("s.jsonl", body), "claude-code@1", "UTC"))!;
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 9000 });
    for (const changed of [`B${body.slice(1)}`, `${body.slice(0, -1)}Y`]) {
      const other = (await cacheKeyFor(await logFile("s.jsonl", changed), "claude-code@1", "UTC"))!;
      expect(await loadCached(join(dir, "cache"), other), changed.slice(0, 1) + changed.slice(-1)).toBeNull();
    }
  });
  it("앞 지문은 정확히 처음 4096바이트, 끝 지문은 정확히 마지막 4096바이트다(경계의 한 바이트가 바뀌면 그 지문만 다르다)", async () => {
    const body = "x".repeat(9000);
    const at = (index: number) => `${body.slice(0, index)}y${body.slice(index + 1)}`;
    const key = (await cacheKeyFor(await logFile("e.jsonl", body), "claude-code@1", "UTC"))!;
    // [바꾼 자리, 앞 지문이 같은가, 끝 지문이 같은가]. 4095는 앞 지문의 마지막, 4904(크기-4096)는 끝 지문의 첫 바이트다
    const cases: Array<[number, boolean, boolean]> = [
      [4095, false, true],
      [4096, true, true],
      [4903, true, true],
      [4904, true, false],
    ];
    for (const [index, headSame, tailSame] of cases) {
      const other = (await cacheKeyFor(await logFile("e.jsonl", at(index)), "claude-code@1", "UTC"))!;
      expect([other.head === key.head, other.tail === key.tail], String(index)).toEqual([headSame, tailSame]);
    }
  });
  it("한 바이트 파일도 내용이 다르면 지문이 다르고, 목록에서 빈 파일이었다가 커진 파일은 열쇠를 만들지 않는다", async () => {
    const one = (await cacheKeyFor(await logFile("o.jsonl", " "), "claude-code@1", "UTC"))!;
    const other = (await cacheKeyFor(await logFile("o.jsonl", "}"), "claude-code@1", "UTC"))!;
    expect([other.head === one.head, other.tail === one.tail]).toEqual([false, false]);
    const empty = await logFile("z.jsonl", "");
    await writeFile(empty.path, "line\n");
    await utimes(empty.path, MTIME / 1000, MTIME / 1000);
    expect(await cacheKeyFor(empty, "claude-code@1", "UTC")).toBeNull();
  });
  it("한 번의 읽기가 요청보다 짧게 끝나도 앞뒤 지문을 끝까지 채운다(짧은 읽기로 열쇠가 달라지지 않고 경계 바이트의 변경도 본다)", async () => {
    const body = "x".repeat(9000);
    const file = await logFile("p.jsonl", body);
    const full = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    const probe = await open(join(dir, "probe-short"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    // 한 번에 1000바이트까지만 돌려준다(Node.js가 허용하는 짧은 읽기)
    const spy = vi.spyOn(proto, "read").mockImplementation(function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      return read.call(this, buffer, offset, Math.min(1000, length), position);
    });
    try {
      expect(await cacheKeyFor(file, "claude-code@1", "UTC")).toEqual(full);
      const changed = await logFile("p.jsonl", `${body.slice(0, 4095)}y${body.slice(4096)}`);
      expect((await cacheKeyFor(changed, "claude-code@1", "UTC"))!.head).not.toBe(full.head);
    } finally {
      spy.mockRestore();
    }
  });
  it("지문을 채우기 전에 파일이 끝나면 그 뒤 크기와 수정 시각이 되돌아와도 열쇠를 만들지 않는다(앞 지문과 끝 지문의 첫 읽기와 1000바이트를 읽은 뒤)", async () => {
    const body = "x".repeat(9000);
    const probe = await open(join(dir, "probe-eof"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    // 한 번에 1000바이트씩 읽게 하고, 앞 지문(0부터)과 끝 지문(4904부터)의 첫 읽기와 1000바이트를 읽은 뒤의 자리를 읽기 직전에 파일을 거기서 끝낸 뒤 읽고 되돌린다
    for (const [name, at] of [["앞 지문 처음", 0], ["앞 지문 도중", 1000], ["끝 지문 처음", 4904], ["끝 지문 도중", 5904]] as const) {
      const file = await logFile(`eof-${name}.jsonl`, body);
      let ended = false;
      const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
        if (!ended && position === at) {
          ended = true;
          await truncate(file.path, at);
          const result = await read.call(this, buffer, offset, Math.min(1000, length), position);
          expect(result.bytesRead, name).toBe(0);
          await writeFile(file.path, body);
          await utimes(file.path, MTIME / 1000, MTIME / 1000);
          return result;
        }
        return read.call(this, buffer, offset, Math.min(1000, length), position);
      });
      try {
        expect(await cacheKeyFor(file, "claude-code@1", "UTC"), name).toBeNull();
        expect(ended, name).toBe(true);
      } finally {
        spy.mockRestore();
      }
    }
  });
  it("목록에서 본 뒤 수정 시각이 1밀리초보다 작게 바뀌어도 열쇠를 만들지 않는다(밀리초 아래를 버리지 않는다)", async () => {
    const file = await logFile("m.jsonl", "line\n");
    await utimes(file.path, (MTIME + 0.25) / 1000, (MTIME + 0.25) / 1000);
    const changed = (await stat(file.path)).mtimeMs;
    expect(changed).toBeGreaterThan(MTIME);
    expect(Math.round(changed)).toBe(MTIME);
    expect(await cacheKeyFor(file, "claude-code@1", "UTC")).toBeNull();
  });
  it("큰 파일은 앞 4KB와 끝 4KB가 따로 열쇠에 든다(앞만 바뀌면 앞 지문만, 끝만 바뀌면 끝 지문만 다르다)", async () => {
    const body = `A${"x".repeat(8998)}Z`;
    const key = (await cacheKeyFor(await logFile("n.jsonl", body), "claude-code@1", "UTC"))!;
    const front = (await cacheKeyFor(await logFile("n.jsonl", `B${body.slice(1)}`), "claude-code@1", "UTC"))!;
    expect([front.head === key.head, front.tail === key.tail]).toEqual([false, true]);
    const back = (await cacheKeyFor(await logFile("n.jsonl", `${body.slice(0, -1)}Y`), "claude-code@1", "UTC"))!;
    expect([back.head === key.head, back.tail === key.tail]).toEqual([true, false]);
  });
});
