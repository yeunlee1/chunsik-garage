// 줄 읽기(줄 가르기, 끝 조각, 너무 긴 줄, 연 크기까지만 읽기, 진행 중 판정)를 시험한다(설계 9.4)
import { appendFile, mkdtemp, open, rm, stat, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLines, type ReadOptions } from "../../../src/adapters/common/lines.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aq-lines-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const OLD = Date.parse("2026-01-01T00:00:00Z");

async function fileWith(name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content);
  await utimes(path, OLD / 1000, OLD / 1000);
  return path;
}

async function read(path: string, nowMs: number, options: ReadOptions = {}) {
  const lines: string[] = [];
  let tooLong = 0;
  const outcome = await readLines(path, nowMs, { line: (t) => lines.push(t), tooLong: () => { tooLong++; } }, options);
  return { lines, tooLong, outcome };
}

describe("readLines", () => {
  it("줄을 가르고 끝의 \\r을 뗀다. 빈 줄도 넘긴다", async () => {
    const r = await read(await fileWith("a.jsonl", "a\r\nb\n\nc\n"), Date.now());
    expect(r.lines).toEqual(["a", "b", "", "c"]);
    expect(r.outcome.tail).toBeNull();
    expect(r.outcome.inProgress).toBe(false);
  });
  it("줄바꿈 없는 끝 조각은 tail로 돌려준다", async () => {
    const r = await read(await fileWith("b.jsonl", 'a\n{"x":1}'), Date.now());
    expect(r.lines).toEqual(["a"]);
    expect(r.outcome.tail).toBe('{"x":1}');
  });
  it("상한을 넘는 줄은 tooLong으로 세고 다음 줄은 읽는다", async () => {
    const path = await fileWith("c.jsonl", `${"x".repeat(50)}\nok\n${"y".repeat(50)}`);
    const r = await read(path, Date.now(), { maxLineBytes: 10, chunkBytes: 16 });
    expect(r.lines).toEqual(["ok"]);
    expect(r.tooLong).toBe(2);
    expect(r.outcome.tail).toBeNull();
  });
  it("줄은 LF로만 가른다. 본문 안의 U+2028, U+2029, 홀로 있는 \\r에서는 가르지 않는다", async () => {
    const one = '{"type":"user","message":{"content":"a\u2028b\u2029c\rd"}}';
    const r = await read(await fileWith("u.jsonl", `${one}\nnext\n`), Date.now(), { chunkBytes: 8 });
    expect(r.lines).toEqual([one, "next"]);
  });
  it("여러 바이트 글자가 조각 경계에 걸려도 깨지지 않는다", async () => {
    const r = await read(await fileWith("d.jsonl", "가나다라마바사\n"), Date.now(), { chunkBytes: 4 });
    expect(r.lines).toEqual(["가나다라마바사"]);
  });
  it("조각보다 훨씬 긴 줄도 온전히 읽고, 너무 긴 줄 뒤의 줄도 바르게 읽는다", async () => {
    const long = "가".repeat(70_000);
    const path = await fileWith("g.jsonl", `${long}\n${"z".repeat(400_000)}\nok\n`);
    const r = await read(path, Date.now(), { chunkBytes: 4096, maxLineBytes: 300_000 });
    expect(r.lines).toEqual([long, "ok"]);
    expect(r.tooLong).toBe(1);
  });
  it("연 뒤에 커진 파일은 연 크기까지만 읽고 진행 중이다", async () => {
    const path = await fileWith("e.jsonl", "a\n");
    const r = await read(path, Date.now(), { afterOpen: () => appendFile(path, "b\n") });
    expect(r.lines).toEqual(["a"]);
    expect(r.outcome.inProgress).toBe(true);
  });
  it("수정 시각이 평가 시각에서 2초 안쪽이면 진행 중이다", async () => {
    const r = await read(await fileWith("f.jsonl", "a\n"), OLD + 1000);
    expect(r.outcome.inProgress).toBe(true);
  });
  it("연 뒤에 크기만 늘거나 줄거나, 수정 시각만 늦어지거나 앞당겨진 파일도 진행 중이다(늘었는지가 아니라 다른지를 본다). 그 가운데 연 크기까지 다 읽지 못한 것은 줄어든 채 남은 것뿐이다", async () => {
    // 이름, 바꾸기, 연 크기까지 다 읽지 못했는지(읽은 뒤의 크기가 아니라 연 크기와 견준다)
    const changes: Array<[string, (path: string) => Promise<void>, boolean]> = [
      ["늘어남", async (path) => {
        await appendFile(path, "c\n");
        await utimes(path, OLD / 1000, OLD / 1000);
      }, false],
      ["줄어듦", async (path) => {
        await truncate(path, 2);
        await utimes(path, OLD / 1000, OLD / 1000);
      }, true],
      ["늦어짐", (path) => utimes(path, (OLD + 1000) / 1000, (OLD + 1000) / 1000), false],
      ["앞당겨짐", (path) => utimes(path, (OLD - 1000) / 1000, (OLD - 1000) / 1000), false],
    ];
    for (const [name, change, endedEarly] of changes) {
      const path = await fileWith(`g-${name}.jsonl`, "a\nb\n");
      const r = await read(path, OLD + 60_000, { afterOpen: () => change(path) });
      expect(r.outcome.inProgress, name).toBe(true);
      expect(r.outcome.endedEarly, name).toBe(endedEarly);
      expect(r.outcome.bytesRead, name).toBe(endedEarly ? 2 : 4);
    }
  });
  it("수정 시각이 평가 시각에서 1999밀리초 전이거나 평가 시각보다 뒤면 진행 중이고, 2000·2001밀리초 전이면 아니다", async () => {
    const path = await fileWith("h.jsonl", "a\n");
    expect((await read(path, OLD - 5000)).outcome.inProgress).toBe(true);
    expect((await read(path, OLD + 1999)).outcome.inProgress).toBe(true);
    expect((await read(path, OLD + 2000)).outcome.inProgress).toBe(false);
    expect((await read(path, OLD + 2001)).outcome.inProgress).toBe(false);
  });
  it("수정 시각의 밀리초 아래도 2초 안쪽 판정에 든다(평가 시각에서 1999.75밀리초 전이면 진행 중이다)", async () => {
    const path = await fileWith("fraction.jsonl", "a\n");
    await utimes(path, (OLD + 0.25) / 1000, (OLD + 0.25) / 1000);
    const at = (await stat(path)).mtimeMs - OLD;
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(0.5);
    const r = await read(path, OLD + 2000);
    expect(r.lines).toEqual(["a"]);
    expect(r.outcome.inProgress).toBe(true);
  });
  it("읽기가 요청보다 짧게 끝나도 파일이 끝난 것이 아니면 이어 읽어 끝까지 읽는다(첫 읽기만 한 바이트일 때)", async () => {
    const body = '{"a":1}\n{"b":2}\n';
    const path = await fileWith("short-read.jsonl", body);
    const probe = await open(join(dir, "probe-short"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const realRead = proto.read;
    let short = false;
    const spy = vi.spyOn(proto, "read").mockImplementation(function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      if (!short) {
        short = true;
        return realRead.call(this, buffer, offset, 1, position);
      }
      return realRead.call(this, buffer, offset, length, position);
    });
    try {
      const r = await read(path, OLD + 60_000, { chunkBytes: 8 });
      expect(short).toBe(true);
      expect(r.lines).toEqual(['{"a":1}', '{"b":2}']);
      expect(r.outcome.bytesRead).toBe(Buffer.byteLength(body));
      expect(r.outcome.tail).toBeNull();
      expect(r.outcome.inProgress).toBe(false);
      expect(r.outcome.endedEarly).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
  it("연 크기까지 다 읽은 뒤에 줄어든 파일도 진행 중이다(수정 시각이 그대로여도 크기로 안다)", async () => {
    const path = await fileWith("shrink-after-read.jsonl", "a\nb\n");
    const probe = await open(join(dir, "probe-after"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const realRead = proto.read;
    let cut = false;
    // 연 크기까지 다 읽은 읽기 뒤에 파일을 줄이고 수정 시각은 되돌린다
    const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      const result = await realRead.call(this, buffer, offset, length, position);
      if (!cut && position + result.bytesRead === 4) {
        cut = true;
        await truncate(path, 2);
        await utimes(path, OLD / 1000, OLD / 1000);
      }
      return result;
    });
    try {
      const r = await read(path, OLD + 60_000);
      expect(cut).toBe(true);
      expect(r.lines).toEqual(["a", "b"]);
      expect(r.outcome.bytesRead).toBe(4);
      expect(r.outcome.inProgress).toBe(true);
      expect(r.outcome.endedEarly).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
  it("수정 시각이 평가 시각에서 2초 안쪽이거나 평가 시각보다 뒤여도, 연 크기까지 읽기 전에 파일이 끝났으면 덜 읽은 것이다(쓰는 중과 덜 읽음은 따로 안다. 정확히 2초 전과 끝까지 읽은 것도 견준다)", async () => {
    // 이름, 평가 시각에서 수정 시각까지의 거리
    const ages: Array<[string, number]> = [["1초 전", 1000], ["1초 뒤", -1000], ["정확히 2초 전", 2000]];
    for (const [name, age] of ages) {
      const whole = await read(await fileWith(`recent-whole-${age}.jsonl`, "a\nb\n"), OLD + age);
      expect(whole.outcome.endedEarly, name).toBe(false);
      const path = await fileWith(`recent-cut-${age}.jsonl`, "a\nb\n");
      const r = await read(path, OLD + age, {
        afterOpen: async () => {
          await truncate(path, 2);
          await utimes(path, OLD / 1000, OLD / 1000);
        },
      });
      expect(r.outcome, name).toMatchObject({ sizeAtOpen: 4, bytesRead: 2, inProgress: true, endedEarly: true });
    }
  });
  it("연 크기까지 읽기 전에 파일이 끝나면 그 뒤 크기와 수정 시각이 되돌아와도 진행 중이다(처음, 가운데, 한 바이트 모자랄 때)", async () => {
    const body = "a\nb\nc\nd\n";
    const probe = await open(join(dir, "probe"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const realRead = proto.read;
    // [이름, 한 번에 읽는 바이트, 끝낼 자리, 읽힌 줄]
    const cases: Array<[string, number, number, string[]]> = [
      ["처음", 2, 0, []],
      ["가운데", 2, 4, ["a", "b"]],
      ["한 바이트 모자람", 7, 7, ["a", "b", "c"]],
    ];
    for (const [name, chunkBytes, at, lines] of cases) {
      const path = await fileWith(`cut-${name}.jsonl`, body);
      let cut = false;
      // 그 자리를 읽기 직전에 파일을 거기서 끝내고, 읽은 뒤 내용과 수정 시각을 되돌린다
      const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
        if (!cut && position === at) {
          cut = true;
          await truncate(path, at);
          const result = await realRead.call(this, buffer, offset, length, position);
          expect(result.bytesRead, name).toBe(0);
          await writeFile(path, body);
          await utimes(path, OLD / 1000, OLD / 1000);
          return result;
        }
        return realRead.call(this, buffer, offset, length, position);
      });
      try {
        const r = await read(path, OLD + 60_000, { chunkBytes });
        expect(cut, name).toBe(true);
        expect(r.lines, name).toEqual(lines);
        expect(r.outcome.bytesRead, name).toBe(at);
        expect(r.outcome.inProgress, name).toBe(true);
        expect(r.outcome.endedEarly, name).toBe(true);
      } finally {
        spy.mockRestore();
      }
    }
  });
});
