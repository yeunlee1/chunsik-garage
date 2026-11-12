// 줄 읽기(줄 가르기, 끝 조각, 너무 긴 줄, 연 크기까지만 읽기, 진행 중 판정)를 시험한다(설계 9.4)
import { appendFile, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
