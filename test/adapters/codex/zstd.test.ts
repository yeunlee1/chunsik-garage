// Codex 압축 기록(.jsonl.zst)의 프레임 훑기(완결·잘림·깨짐)와 흘려 풀어 한 줄씩 읽기를 시험한다. Node.js는 끝 프레임이 잘린 파일을 오류 없이 앞 프레임까지만 풀어 주므로 프레임 훑기가 잘림을 잡아야 한다(설계 9.8, 「5단계 계획 전 결정」 2번)
import { createHash } from "node:crypto";
import { ReadStream, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { appendFile, mkdtemp, open, rm, stat, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lineSplitter, type LineSink } from "../../../src/adapters/common/lines.ts";
import { readZstdLines, scanZstdFrames, zstdAvailable } from "../../../src/adapters/codex/zstd.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 코덱스 zstd "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const has = zstdAvailable();
const compress = (text: string, checksum = false): Buffer =>
  zlib.zstdCompressSync(Buffer.from(text), checksum ? { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } } : undefined);
const skippable = (content: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(0x184d2a53, 0);
  head.writeUInt32LE(content.length, 4);
  return Buffer.concat([head, content]);
};
/** 머리 자리가 정해진 자료 프레임이다. 매직 4바이트, 설명 바이트(한 구간, 내용 크기 1바이트), 내용 크기, 날것 블록의 머리 3바이트, 내용 차례다 */
const rawFrame = (text: string): Buffer => {
  const body = Buffer.from(text);
  const block = Buffer.alloc(3);
  block.writeUIntLE((body.length << 3) | 1, 0, 3);
  return Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, body.length]), block, body]);
};
async function put(name: string, bytes: Buffer): Promise<string> {
  const path = join(root, name);
  await writeFile(path, bytes);
  return path;
}
function collect(): { sink: LineSink; lines: string[]; tooLong: () => number } {
  const lines: string[] = [];
  let tooLong = 0;
  return { sink: { line: (text) => lines.push(text), tooLong: () => tooLong++ }, lines, tooLong: () => tooLong };
}
const ONE = '{"a":1}\n{"a":2}\n';
const TWO = '{"b":1}\n';
const OLD = Date.parse("2026-01-01T00:00:00Z");

describe("lineSplitter", () => {
  it("조각에 걸친 줄을 잇고, 끝의 \\r을 떼며, 상한을 넘은 줄은 풀지 않고 세고, 줄바꿈 없는 끝 조각을 돌려준다", () => {
    const { sink, lines, tooLong } = collect();
    const splitter = lineSplitter(sink, 8);
    splitter.push(Buffer.from('{"x"'));
    splitter.push(Buffer.from(':1}\r\n0123456789abc\nend'));
    expect(splitter.finish()).toBe("end");
    expect(lines).toEqual(['{"x":1}']);
    expect(tooLong()).toBe(1);
  });
});

describe.skipIf(!has)("scanZstdFrames", () => {
  it("프레임 하나, 둘, 체크섬이 있는 프레임, 건너뛸 수 있는 프레임 뒤의 프레임은 완결이고 자료 프레임 수와 프레임마다의 자리를 낸다", async () => {
    const one = compress(ONE);
    const two = compress(TWO);
    expect(await scanZstdFrames(await put("1.zst", one))).toEqual({ status: "complete", frames: 1, ranges: [[0, one.length]], brokenFrameStart: null });
    expect(await scanZstdFrames(await put("2.zst", Buffer.concat([one, two])))).toEqual({ status: "complete", frames: 2, ranges: [[0, one.length], [one.length, one.length + two.length]], brokenFrameStart: null });
    expect(await scanZstdFrames(await put("c.zst", compress(ONE, true)))).toMatchObject({ status: "complete", frames: 1 });
    const meta = skippable(Buffer.from("meta"));
    expect(await scanZstdFrames(await put("s.zst", Buffer.concat([meta, one])))).toEqual({ status: "complete", frames: 1, ranges: [[meta.length, meta.length + one.length]], brokenFrameStart: null });
  });

  it("끝 프레임이 잘렸거나 프레임 중간이 잘렸으면 잘림이다. 잘린 매직도 잘림이다. 잘린 자료 프레임의 시작 자리를 낸다", async () => {
    const first = compress(ONE);
    const both = Buffer.concat([first, compress(TWO, true)]);
    expect(await scanZstdFrames(await put("t1.zst", both.subarray(0, both.length - 3)))).toEqual({ status: "truncated", frames: 1, ranges: [[0, first.length]], brokenFrameStart: first.length });
    const one = compress(ONE);
    expect((await scanZstdFrames(await put("t2.zst", one.subarray(0, Math.floor(one.length / 2))))).status).toBe("truncated");
    expect((await scanZstdFrames(await put("t3.zst", Buffer.concat([one, Buffer.from([0x28, 0xb5])])))).status).toBe("truncated");
  });

  it("완결된 두 프레임의 둘째를 매직 뒤 어느 자리에서 잘라도 잘림이고 잘린 프레임의 시작 자리를 낸다. 블록 머리 3바이트 가운데서 잘린 것도 든다", async () => {
    const first = compress(ONE);
    const both = Buffer.concat([first, compress(TWO.repeat(30))]);
    for (let cut = first.length + 4; cut < both.length; cut++) {
      expect(await scanZstdFrames(await put(`cut-${cut}.zst`, both.subarray(0, cut))), `${cut}바이트`).toEqual({ status: "truncated", frames: 1, ranges: [[0, first.length]], brokenFrameStart: first.length });
    }
  });

  it("RLE 블록은 풀린 크기와 상관없이 압축 자료가 한 바이트다", async () => {
    const rle = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 0x40, 0x03, 0x02, 0x00, 0x61]);
    expect(zlib.zstdDecompressSync(rle).toString()).toBe("a".repeat(64));
    expect(await scanZstdFrames(await put("rle.zst", rle))).toEqual({ status: "complete", frames: 1, ranges: [[0, rle.length]], brokenFrameStart: null });
  });

  it("매직이 틀렸거나, 완결된 프레임 뒤에 다른 것이 붙었거나, 빈 파일이면 깨짐이다", async () => {
    expect((await scanZstdFrames(await put("m.zst", Buffer.from("not zstd at all")))).status).toBe("invalid");
    expect((await scanZstdFrames(await put("g.zst", Buffer.concat([compress(ONE), Buffer.from("junk!")])))).status).toBe("invalid");
    expect((await scanZstdFrames(await put("e.zst", Buffer.alloc(0)))).status).toBe("invalid");
  });
});

describe.skipIf(!has)("readZstdLines", () => {
  it("흘려 풀어 줄을 내고, 프레임 둘의 줄을 모두 낸다", async () => {
    const one = collect();
    const outcome = await readZstdLines(await put("1.zst", compress(ONE)), Date.now() + 60_000, one.sink);
    expect(one.lines).toEqual(['{"a":1}', '{"a":2}']);
    expect(outcome).toMatchObject({ tail: null, decodeError: null, inProgress: false });
    expect(outcome.decodedBytes).toBe(Buffer.byteLength(ONE));
    const two = collect();
    await readZstdLines(await put("2.zst", Buffer.concat([compress(ONE), compress(TWO)])), Date.now() + 60_000, two.sink);
    expect(two.lines).toEqual(['{"a":1}', '{"a":2}', '{"b":1}']);
  });

  it("연 뒤에 덧붙은 프레임은 읽지 않고 진행 중이다(수정 시각을 되돌려도 크기로 안다)", async () => {
    const path = await put("grow.zst", compress(ONE));
    await utimes(path, OLD / 1000, OLD / 1000);
    const one = collect();
    const outcome = await readZstdLines(path, OLD + 60_000, one.sink, {
      afterOpen: async () => {
        await appendFile(path, compress(TWO));
        await utimes(path, OLD / 1000, OLD / 1000);
      },
    });
    expect(one.lines).toEqual(['{"a":1}', '{"a":2}']);
    expect(outcome.inProgress).toBe(true);
    expect(outcome.bytesRead).toBeLessThanOrEqual(outcome.sizeAtOpen);
  });

  it("연 뒤에 줄어든 것과 수정 시각만 늦어지거나 앞당겨진 압축 기록도 진행 중이다(늘었는지가 아니라 다른지를 본다)", async () => {
    const first = compress(ONE);
    const changes: Array<[string, (path: string) => Promise<void>]> = [
      ["줄어듦", async (path) => {
        await truncate(path, first.length);
        await utimes(path, OLD / 1000, OLD / 1000);
      }],
      ["늦어짐", (path) => utimes(path, (OLD + 1000) / 1000, (OLD + 1000) / 1000)],
      ["앞당겨짐", (path) => utimes(path, (OLD - 1000) / 1000, (OLD - 1000) / 1000)],
    ];
    for (const [name, change] of changes) {
      const path = await put(`${name}.zst`, Buffer.concat([first, compress(TWO)]));
      await utimes(path, OLD / 1000, OLD / 1000);
      const outcome = await readZstdLines(path, OLD + 60_000, collect().sink, { afterOpen: () => change(path) });
      expect(outcome.inProgress, name).toBe(true);
    }
  });

  it("수정 시각이 평가 시각에서 2초 안쪽이거나 평가 시각보다 뒤면 진행 중이고, 정확히 2초 전이면 아니다", async () => {
    const path = await put("recent.zst", compress(ONE));
    await utimes(path, OLD / 1000, OLD / 1000);
    expect((await readZstdLines(path, OLD + 1999, collect().sink)).inProgress).toBe(true);
    expect((await readZstdLines(path, OLD + 2000, collect().sink)).inProgress).toBe(false);
    expect((await readZstdLines(path, OLD - 5000, collect().sink)).inProgress).toBe(true);
  });

  it("연 뒤에 덧붙은 잘린 프레임 머리나 쓰레기는 연 크기 안의 프레임 판정을 바꾸지 않는다", async () => {
    const extras: Array<[string, Buffer]> = [
      ["잘린 매직", Buffer.from([0x28, 0xb5])],
      ["쓰레기", Buffer.from("garbage")],
    ];
    for (const [name, extra] of extras) {
      const path = await put(`tail-${name}.zst`, compress(ONE));
      await utimes(path, OLD / 1000, OLD / 1000);
      const one = collect();
      const outcome = await readZstdLines(path, OLD + 60_000, one.sink, { afterOpen: () => appendFile(path, extra) });
      expect(outcome.frames.status, name).toBe("complete");
      expect(outcome.decodeError, name).toBeNull();
      expect(one.lines, name).toEqual(['{"a":1}', '{"a":2}']);
      expect(outcome.inProgress, name).toBe(true);
    }
  });

  it("연 순간에 잘려 있던 끝 프레임이 연 뒤에 완성돼도 연 크기 안에서 풀리던 줄을 그대로 내고 연 크기 밖은 읽지 않는다(앞 프레임이 있을 때와 하나뿐일 때)", async () => {
    const many = `${Array.from({ length: 2000 }, (_, index) => `{"b":${index}}`).join("\n")}\n`;
    const second = compress(many, true);
    const big = compress(`{"first":1}\n${Array.from({ length: 6000 }, (_, index) => JSON.stringify({ noise: createHash("sha256").update(String(index)).digest("hex") })).join("\n")}\n`);
    const layouts: Array<[string, Buffer, Buffer]> = [
      ["앞 프레임 뒤", Buffer.concat([compress(ONE), second.subarray(0, second.length - 2)]), second.subarray(second.length - 2)],
      ["하나뿐", big.subarray(0, big.length - 1), big.subarray(big.length - 1)],
    ];
    for (const [name, bytes, rest] of layouts) {
      const untouched = collect();
      const before = await readZstdLines(await put(`cut-${name}.zst`, bytes), OLD + 60_000, untouched.sink);
      const path = await put(`done-${name}.zst`, bytes);
      const done = collect();
      const after = await readZstdLines(path, OLD + 60_000, done.sink, { afterOpen: () => appendFile(path, rest) });
      expect(before.frames.status, name).toBe("truncated");
      expect(after.frames.status, name).toBe("truncated");
      expect(done.lines.length, name).toBeGreaterThan(2);
      expect(done.lines, name).toEqual(untouched.lines);
      expect(after.bytesRead, name).toBeLessThanOrEqual(after.sizeAtOpen);
    }
  });

  it("연 크기가 0이면 연 뒤에 쓴 프레임도 훑거나 풀지 않는다(0은 상한이 없다는 뜻이 아니다)", async () => {
    const path = await put("empty-open.zst", Buffer.alloc(0));
    const one = collect();
    const outcome = await readZstdLines(path, OLD + 60_000, one.sink, { afterOpen: () => writeFile(path, compress(ONE)) });
    expect([outcome.sizeAtOpen, outcome.bytesRead, one.lines.length, outcome.frames.ranges.length]).toEqual([0, 0, 0, 0]);
  });

  it("정상 자료 프레임 뒤에서 파일 끝에 정확히 닿는 길이 0의 건너뛸 수 있는 프레임도 완결이다", async () => {
    const one = collect();
    const outcome = await readZstdLines(await put("skip-end.zst", Buffer.concat([compress(ONE), skippable(Buffer.alloc(0))])), OLD + 60_000, one.sink);
    expect(outcome.frames.status).toBe("complete");
    expect(outcome.decodeError).toBeNull();
    expect(one.lines).toEqual(['{"a":1}', '{"a":2}']);
  });

  it("잘린 프레임을 풀어도 돌려주는 완결 프레임 목록은 훑기와 같다(잘린 범위를 넣지 않는다)", async () => {
    const big = compress(`${Array.from({ length: 6000 }, (_, index) => JSON.stringify({ noise: createHash("sha256").update(String(index)).digest("hex") })).join("\n")}\n`);
    const path = await put("cut-ranges.zst", big.subarray(0, big.length - 1));
    const scanned = await scanZstdFrames(path);
    const one = collect();
    const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
    expect(scanned.status).toBe("truncated");
    expect(one.lines.length).toBeGreaterThan(0);
    expect(outcome.frames.ranges).toEqual(scanned.ranges);
    expect(outcome.frames.frames).toBe(outcome.frames.ranges.length);
  });

  it("깨진 블록 앞에서 풀 수 있던 줄은 깨짐 판정이어도 낸다", async () => {
    const raw = Buffer.from(`${Array.from({ length: 14000 }, (_, index) => `{"a":${index}}`).join("\n")}\n`);
    const block = raw.subarray(0, 120000);
    // 마지막이 아닌 raw 블록 하나 뒤에 종류 3(금지)의 블록 머리를 둔 프레임이다
    const header = Buffer.alloc(3);
    header.writeUIntLE(block.length << 3, 0, 3);
    const bytes = Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0x38]), header, block, Buffer.from([7, 0, 0])]);
    const one = collect();
    const outcome = await readZstdLines(await put("bad-block.zst", bytes), OLD + 60_000, one.sink);
    expect(outcome.frames.status).toBe("invalid");
    expect(outcome.bytesRead).toBeGreaterThan(0);
    expect(one.lines.length).toBeGreaterThan(0);
  });

  it("한 번의 읽기가 요청보다 짧게 끝나도 프레임 머리를 채워 읽어 같은 훑기 결과를 낸다", async () => {
    const path = await put("short.zst", Buffer.concat([compress(ONE), compress(TWO)]));
    const scanned = await scanZstdFrames(path);
    const probe = await open(join(root, "probe"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    // 한 번에 한 바이트까지만 돌려준다(Node.js가 허용하는 짧은 읽기)
    const spy = vi.spyOn(proto, "read").mockImplementation(function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      return read.call(this, buffer, offset, Math.min(1, length), position);
    });
    try {
      expect(await scanZstdFrames(path)).toEqual(scanned);
    } finally {
      spy.mockRestore();
    }
  });

  it("훑는 동안 파일이 줄어 머리를 다 읽지 못하면 앞의 완결 프레임을 모두 지키고 잘림으로 끝내며, 그 뒤 크기와 수정 시각이 되돌아와도 잘림이고 쓰는 중이다(앞 프레임 0~2개, 매직 0~3바이트, 건너뛸 프레임의 길이 0~3바이트, 설명 바이트, 블록 머리 0~2바이트)", async () => {
    const before = [compress('{"p":1}\n'), compress('{"p":2}\n')];
    const raw = rawFrame(TWO);
    const skip = Buffer.concat([skippable(Buffer.from([1, 2, 3])), raw]);
    type Kind = [string, Buffer, number, number, boolean];
    // [이름, 앞 프레임 뒤의 바이트, 자를 읽기의 자리(앞 프레임 끝에서), 남길 바이트, 잘린 곳이 자료 프레임 안인지]
    const kinds: Kind[] = [
      ...[0, 1, 2, 3].map((keep): Kind => [`매직 ${keep}바이트`, raw, 0, keep, false]),
      ...[0, 1, 2, 3].map((keep): Kind => [`건너뛸 프레임의 길이 ${keep}바이트`, skip, 4, keep, false]),
      ["설명 바이트", raw, 4, 0, true],
      ...[0, 1, 2].map((keep): Kind => [`블록 머리 ${keep}바이트`, raw, 6, keep, true]),
    ];
    const probe = await open(join(root, "probe-shrink"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    for (const count of [0, 1, 2]) {
      const front = before.slice(0, count);
      const base = front.reduce((sum, frame) => sum + frame.length, 0);
      const ranges = front.map((frame, index): [number, number] => {
        const start = front.slice(0, index).reduce((sum, earlier) => sum + earlier.length, 0);
        return [start, start + frame.length];
      });
      const frontLines = ['{"p":1}', '{"p":2}'].slice(0, count);
      for (const [name, rest, at, keep, inFrame] of kinds) {
        for (const restore of [false, true]) {
          const label = `앞 프레임 ${count}개, ${name}${restore ? ", 되돌아옴" : ""}`;
          const bytes = Buffer.concat([...front, rest]);
          const path = await put(`shrink-${count}-${name}-${restore}.zst`, bytes);
          await utimes(path, OLD / 1000, OLD / 1000);
          // 줄지 않으면 자료 프레임이 모두 완결이다
          expect(await scanZstdFrames(path), label).toMatchObject({ status: "complete", frames: count + 1 });
          let cut = false;
          let restored = false;
          // 그 자리를 처음 읽을 때 파일을 줄이고, 되돌리는 경우에는 파일 끝을 본 읽기 뒤에 내용과 수정 시각을 되돌린다
          const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
            if (!cut && position === base + at) {
              cut = true;
              truncateSync(path, base + at + keep);
            }
            const result = await read.call(this, buffer, offset, length, position);
            if (restore && cut && !restored && result.bytesRead === 0) {
              restored = true;
              writeFileSync(path, bytes);
              utimesSync(path, OLD / 1000, OLD / 1000);
            }
            return result;
          });
          try {
            const one = collect();
            const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
            expect(cut && restored === restore, label).toBe(true);
            expect(outcome.frames, label).toEqual({ status: "truncated", frames: count, ranges, brokenFrameStart: inFrame ? base : null });
            // 되돌아왔으면 잘린 자료 프레임의 범위를 다시 풀어 그 줄도 나온다
            expect(one.lines, label).toEqual(restore && inFrame ? [...frontLines, '{"b":1}'] : frontLines);
            expect(outcome.inProgress, label).toBe(true);
          } finally {
            spy.mockRestore();
          }
        }
      }
    }
  });

  it("파일 끝의 매직보다 짧은 바이트는 자료 프레임 매직이나 건너뛸 수 있는 프레임 매직(첫 바이트 0x50~0x5F)의 앞부분일 때만 잘림이고, 한 바이트라도 다르면 깨짐이다(연 뒤에 나머지가 붙어도 연 크기로 본다)", async () => {
    const first = compress(ONE);
    const L = first.length;
    const skipMagic = (low: number): Buffer => Buffer.from([low, 0x2a, 0x4d, 0x18]);
    type Case = [string, Buffer, "truncated" | "invalid", Buffer | null];
    // [이름, 첫 프레임 뒤의 바이트, 판정, 연 뒤에 붙일 바이트]
    const garbage = [[0x28, 0x99], [0x99, 0xb5], [0x28, 0xb5, 0x99], [0x28, 0x99, 0x2f], [0x99, 0xb5, 0x2f], [0x27], [0x28, 0xb4], [0x28, 0xb5, 0x2e], [0x4f], [0x60], [0x4f, 0x2a], [0x60, 0x2a, 0x4d], [0x50, 0x99], [0x5f, 0x2a, 0x99], [0x50, 0x2b], [0x5f, 0x2b, 0x4d], [0x50, 0x2a, 0x4e], [0x2a, 0x4d]];
    const cases: Case[] = [
      ...[1, 2, 3].map((n): Case => [`자료 매직 ${n}바이트`, Buffer.from([0x28, 0xb5, 0x2f]).subarray(0, n), "truncated", null]),
      ...Array.from({ length: 16 }, (_, index) => 0x50 + index).flatMap((low) => [1, 2, 3].map((n): Case => [`건너뛸 매직 ${low.toString(16)} ${n}바이트`, skipMagic(low).subarray(0, n), "truncated", null])),
      ...[1, 2, 3].map((n): Case => [`연 뒤 완성되는 건너뛸 매직 ${n}바이트`, skipMagic(0x5f).subarray(0, n), "truncated", Buffer.concat([skipMagic(0x5f).subarray(n), Buffer.alloc(4)])]),
      ...garbage.map((bytes): Case => [`쓰레기 ${Buffer.from(bytes).toString("hex")}`, Buffer.from(bytes), "invalid", null]),
    ];
    for (const [name, rest, status, after] of cases) {
      const path = await put(`rest-magic-${name}.zst`, Buffer.concat([first, rest]));
      const one = collect();
      const outcome = await readZstdLines(path, OLD + 60_000, one.sink, after ? { afterOpen: () => appendFile(path, after) } : {});
      expect(outcome.frames, name).toEqual({ status, frames: 1, ranges: [[0, L]], brokenFrameStart: null });
      expect(one.lines, name).toEqual(['{"a":1}', '{"a":2}']);
    }
  });

  it("파일 끝의 매직보다 짧은 나머지를 읽는 동안 줄어도 실제로 읽은 바이트로만 가린다(매직의 앞부분이면 잘림, 아니면 깨짐, 하나도 못 읽었으면 잘림)", async () => {
    const first = compress(ONE);
    const L = first.length;
    // [이름, 첫 프레임 뒤의 세 바이트, 남길 바이트, 판정]
    const cases: Array<[string, Buffer, number, "truncated" | "invalid"]> = [
      ["매직 앞부분 두 바이트", Buffer.from([0x28, 0xb5, 0x2f]), 2, "truncated"],
      ["쓰레기 한 바이트", Buffer.from([0x99, 0x11, 0x22]), 1, "invalid"],
      ["하나도 못 읽음", Buffer.from([0x28, 0xb5, 0x2f]), 0, "truncated"],
    ];
    const probe = await open(join(root, "probe-rest"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    for (const [name, rest, keep, status] of cases) {
      const path = await put(`rest-${name}.zst`, Buffer.concat([first, rest]));
      let cut = false;
      const spy = vi.spyOn(proto, "read").mockImplementation(function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
        if (!cut && position === L) {
          cut = true;
          truncateSync(path, L + keep);
        }
        return read.call(this, buffer, offset, length, position);
      });
      try {
        const one = collect();
        const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
        expect(cut, name).toBe(true);
        expect(outcome.frames, name).toEqual({ status, frames: 1, ranges: [[0, L]], brokenFrameStart: null });
        expect(one.lines, name).toEqual(['{"a":1}', '{"a":2}']);
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("첫 읽기만 짧게 끝나고 다음 읽기는 다 채워 와도 남은 양만 청해 연 크기 밖의 바이트를 머리에 섞지 않는다", async () => {
    const first = compress(ONE);
    const L = first.length;
    const path = await put("short-then-full.zst", Buffer.concat([first, Buffer.from([0x28, 0xb5, 0x2f])]));
    const probe = await open(join(root, "probe-short"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    let short = false;
    const spy = vi.spyOn(proto, "read").mockImplementation(function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      if (!short && position === L) {
        short = true;
        return read.call(this, buffer, offset, 1, position);
      }
      return read.call(this, buffer, offset, length, position);
    });
    try {
      const one = collect();
      // 연 뒤에 상한 밖으로 쓰레기 한 바이트를 붙인다
      const outcome = await readZstdLines(path, OLD + 60_000, one.sink, { afterOpen: () => appendFile(path, Buffer.from([0x99])) });
      expect(short).toBe(true);
      expect(outcome.frames).toEqual({ status: "truncated", frames: 1, ranges: [[0, L]], brokenFrameStart: null });
      expect(one.lines).toEqual(['{"a":1}', '{"a":2}']);
    } finally {
      spy.mockRestore();
    }
  });

  it("훑은 뒤 풀며 읽는 동안 파일이 줄면 디코더가 조용히 끝나도 풀 범위를 다 받지 못한 것으로 보고, 그 뒤 크기와 수정 시각이 되돌아와도 쓰는 중이다(첫 프레임과 둘째 프레임, 한 바이트·네 바이트 모자랄 때와 하나도 받지 못할 때)", async () => {
    const frame = rawFrame(TWO);
    const probe = await open(join(root, "probe-decode"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    const emit = ReadStream.prototype.emit;
    for (const front of [Buffer.alloc(0), compress(ONE)]) {
      const L = front.length;
      const bytes = Buffer.concat([front, frame]);
      for (const short of [1, 4, frame.length]) {
        const label = `앞 ${L}바이트, ${short}바이트 모자람`;
        const path = await put(`decode-short-${L}-${short}.zst`, bytes);
        await utimes(path, OLD / 1000, OLD / 1000);
        let cut = false;
        let restored = false;
        // 훑기가 그 프레임의 블록 머리를 읽은 뒤 파일을 줄이고, 그 프레임을 읽은 스트림이 끝날 때 크기와 수정 시각까지 되돌린다
        const readSpy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
          const result = await read.call(this, buffer, offset, length, position);
          if (!cut && position === L + 6 && length === 3) {
            cut = true;
            truncateSync(path, bytes.length - short);
          }
          return result;
        });
        const emitSpy = vi.spyOn(ReadStream.prototype, "emit").mockImplementation(function (this: ReadStream, event: string | symbol, ...args: unknown[]) {
          if (event === "end" && cut && !restored && (this as unknown as { start?: number }).start === L) {
            restored = true;
            writeFileSync(path, bytes);
            utimesSync(path, OLD / 1000, OLD / 1000);
          }
          return emit.call(this, event, ...args);
        });
        try {
          const one = collect();
          const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
          expect(cut && restored, label).toBe(true);
          expect(outcome.frames.status, label).toBe("complete");
          expect(outcome.decodeError, label).toBe("SHORT_INPUT");
          expect(outcome.inProgress, label).toBe(true);
          expect(outcome.endedEarly, label).toBe(true);
          expect(outcome.bytesRead, label).toBe(bytes.length - short);
          expect(one.lines, label).toEqual(L > 0 ? ['{"a":1}', '{"a":2}'] : []);
        } finally {
          emitSpy.mockRestore();
          readSpy.mockRestore();
        }
      }
    }
  });

  it("풀기 오류를 본 뒤에는 다음 프레임을 더 풀지 않는다(훑은 뒤 줄었다 되돌아와 풀 범위를 다 받지 못했을 때와 바뀌지 않은 파일의 체크섬 오류)", async () => {
    const a = rawFrame('{"a":1}\n');
    const b = rawFrame('{"b":2}\n');
    const c = rawFrame('{"c":3}\n');
    const bytes = Buffer.concat([a, b, c]);
    const path = await put("error-stops.zst", bytes);
    await utimes(path, OLD / 1000, OLD / 1000);
    const probe = await open(join(root, "probe-stops"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    const emit = ReadStream.prototype.emit;
    let cut = false;
    let restored = false;
    // 훑기가 셋째 프레임의 블록 머리를 읽은 뒤 파일을 둘째 프레임이 한 바이트 모자라게 줄이고, 둘째 프레임을 읽은 스트림이 끝날 때 되돌린다
    const readSpy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      const result = await read.call(this, buffer, offset, length, position);
      if (!cut && position === a.length + b.length + 6 && length === 3) {
        cut = true;
        truncateSync(path, a.length + b.length - 1);
      }
      return result;
    });
    const emitSpy = vi.spyOn(ReadStream.prototype, "emit").mockImplementation(function (this: ReadStream, event: string | symbol, ...args: unknown[]) {
      if (event === "end" && cut && !restored && (this as unknown as { start?: number }).start === a.length) {
        restored = true;
        writeFileSync(path, bytes);
        utimesSync(path, OLD / 1000, OLD / 1000);
      }
      return emit.call(this, event, ...args);
    });
    try {
      const one = collect();
      const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
      expect(cut && restored).toBe(true);
      expect(outcome.frames.status).toBe("complete");
      expect(outcome.decodeError).toBe("SHORT_INPUT");
      expect(outcome.inProgress).toBe(true);
      expect(one.lines).toEqual(['{"a":1}']);
    } finally {
      emitSpy.mockRestore();
      readSpy.mockRestore();
    }
    const bad = Buffer.from(zlib.zstdCompressSync(Buffer.from('{"b":2}\n'), { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } }));
    bad[bad.length - 1] = bad[bad.length - 1]! ^ 1;
    const stable = await put("checksum-stops.zst", Buffer.concat([a, bad, c]));
    await utimes(stable, OLD / 1000, OLD / 1000);
    const two = collect();
    const outcome = await readZstdLines(stable, OLD + 60_000, two.sink);
    expect(outcome.decodeError).not.toBeNull();
    expect(two.lines[0]).toBe('{"a":1}');
    expect(two.lines).not.toContain('{"c":3}');
    expect(outcome.inProgress).toBe(false);
  });

  it("쓰레기 매직을 읽다 파일이 끝났으면 그 뒤 되돌아와도 깨짐이면서 쓰는 중이다(형식 오류와 읽는 동안의 변경을 따로 본다)", async () => {
    const a = rawFrame('{"a":1}\n');
    const bytes = Buffer.concat([a, Buffer.from([0x99, 0x11, 0x22])]);
    const path = await put("garbage-eof.zst", bytes);
    await utimes(path, OLD / 1000, OLD / 1000);
    const probe = await open(join(root, "probe-garbage"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    let cut = false;
    let restored = false;
    const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      if (!cut && position === a.length) {
        cut = true;
        truncateSync(path, a.length + 1);
      }
      const result = await read.call(this, buffer, offset, length, position);
      if (cut && !restored && result.bytesRead === 0) {
        restored = true;
        writeFileSync(path, bytes);
        utimesSync(path, OLD / 1000, OLD / 1000);
      }
      return result;
    });
    try {
      const one = collect();
      const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
      expect(cut && restored).toBe(true);
      expect(one.lines).toEqual(['{"a":1}']);
      expect(outcome.frames.status).toBe("invalid");
      expect(outcome.decodeError).toBeNull();
      expect(outcome.inProgress).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("바뀌지 않은 파일은 프레임마다 풀 범위를 다 받아 쓰는 중이 아니다(자료 프레임 둘, 앞에 건너뛸 수 있는 프레임)", async () => {
    const cases: Array<[string, Buffer, string[]]> = [
      ["자료 프레임 둘", Buffer.concat([rawFrame('{"a":1}\n'), rawFrame('{"b":2}\n')]), ['{"a":1}', '{"b":2}']],
      ["앞에 건너뛸 수 있는 프레임", Buffer.concat([skippable(Buffer.alloc(0)), rawFrame('{"a":1}\n')]), ['{"a":1}']],
    ];
    for (const [name, bytes, lines] of cases) {
      const path = await put(`stable-${name}.zst`, bytes);
      await utimes(path, OLD / 1000, OLD / 1000);
      const one = collect();
      const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
      expect(one.lines, name).toEqual(lines);
      expect(outcome.frames.status, name).toBe("complete");
      expect(outcome.decodeError, name).toBeNull();
      expect(outcome.inProgress, name).toBe(false);
      expect(outcome.endedEarly, name).toBe(false);
    }
  });

  it("연 뒤 훑기 전에 프레임 경계까지 줄었다가 되돌아온 파일도 쓰는 중이다(훑기가 잰 크기가 연 크기보다 작았던 것을 기억한다)", async () => {
    const first = compress(ONE);
    const bytes = Buffer.concat([first, compress(TWO)]);
    const path = await put("shrink-before-scan-restore.zst", bytes);
    await utimes(path, OLD / 1000, OLD / 1000);
    const emit = ReadStream.prototype.emit;
    let restored = false;
    // 첫 프레임을 읽은 스트림이 끝날 때 크기와 수정 시각까지 되돌린다
    const spy = vi.spyOn(ReadStream.prototype, "emit").mockImplementation(function (this: ReadStream, event: string | symbol, ...args: unknown[]) {
      if (event === "end" && !restored && (this as unknown as { start?: number }).start === 0) {
        restored = true;
        writeFileSync(path, bytes);
        utimesSync(path, OLD / 1000, OLD / 1000);
      }
      return emit.call(this, event, ...args);
    });
    try {
      const one = collect();
      const outcome = await readZstdLines(path, OLD + 60_000, one.sink, { afterOpen: () => truncate(path, first.length) });
      expect(restored).toBe(true);
      expect(outcome.frames).toEqual({ status: "complete", frames: 1, ranges: [[0, first.length]], brokenFrameStart: null });
      expect(one.lines).toEqual(['{"a":1}', '{"a":2}']);
      expect(outcome.sizeAtOpen).toBe(bytes.length);
      expect(outcome.bytesRead).toBe(first.length);
      expect(outcome.inProgress).toBe(true);
      expect(outcome.endedEarly).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("원래 잘렸거나 깨진 프레임이어도, 훑은 뒤 풀며 읽는 동안 파일이 끝났으면 그 뒤 되돌아와도 쓰는 중이다(손상과 읽는 동안의 변경을 따로 본다)", async () => {
    const front = rawFrame('{"a":1}\n');
    const probe = await open(join(root, "probe-damaged"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    const emit = ReadStream.prototype.emit;
    for (const status of ["truncated", "invalid"] as const) {
      const last = rawFrame('{"b":2}\n');
      // 잘림은 끝 한 바이트가 없고, 깨짐은 설명 바이트의 예약 비트가 켜져 있다
      if (status === "invalid") last[4] = last[4]! | 8;
      const initial = status === "truncated" ? Buffer.concat([front, last.subarray(0, last.length - 1)]) : Buffer.concat([front, last]);
      const path = await put(`damaged-${status}.zst`, initial);
      await utimes(path, OLD / 1000, OLD / 1000);
      const at = front.length + (status === "truncated" ? 6 : 4);
      let cut = false;
      let restored = false;
      // 훑기가 판정에 필요한 머리를 다 읽은 뒤 파일을 둘째 프레임 시작까지 줄이고, 둘째 프레임을 읽은 스트림이 끝날 때 되돌린다
      const readSpy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
        const result = await read.call(this, buffer, offset, length, position);
        if (!cut && position === at) {
          cut = true;
          truncateSync(path, front.length);
        }
        return result;
      });
      const emitSpy = vi.spyOn(ReadStream.prototype, "emit").mockImplementation(function (this: ReadStream, event: string | symbol, ...args: unknown[]) {
        if (event === "end" && cut && !restored && (this as unknown as { start?: number }).start === front.length) {
          restored = true;
          writeFileSync(path, initial);
          utimesSync(path, OLD / 1000, OLD / 1000);
        }
        return emit.call(this, event, ...args);
      });
      try {
        const one = collect();
        const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
        expect(cut && restored, status).toBe(true);
        expect(outcome.frames.status, status).toBe(status);
        expect(outcome.bytesRead, status).toBe(front.length);
        expect(outcome.decodeError, status).toBe("SHORT_INPUT");
        expect(one.lines, status).toEqual(['{"a":1}']);
        expect(outcome.inProgress, status).toBe(true);
      } finally {
        emitSpy.mockRestore();
        readSpy.mockRestore();
      }
    }
  });

  it("수정 시각의 밀리초 아래도 2초 안쪽 판정에 든다(평가 시각에서 1999.75밀리초 전이면 쓰는 중이다)", async () => {
    const path = await put("fraction.zst", rawFrame("a\n"));
    await utimes(path, (OLD + 0.25) / 1000, (OLD + 0.25) / 1000);
    const at = (await stat(path)).mtimeMs - OLD;
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(0.5);
    const one = collect();
    const outcome = await readZstdLines(path, OLD + 2000, one.sink);
    expect(one.lines).toEqual(["a"]);
    expect(outcome.inProgress).toBe(true);
  });

  it("다 읽은 뒤에 줄어든 압축 기록도 쓰는 중이다(수정 시각이 그대로여도 크기로 안다)", async () => {
    const first = compress(ONE);
    const bytes = Buffer.concat([first, compress(TWO)]);
    const path = await put("shrink-after-read.zst", bytes);
    await utimes(path, OLD / 1000, OLD / 1000);
    const emit = ReadStream.prototype.emit;
    let cut = false;
    // 마지막 프레임을 읽은 스트림이 끝날 때 파일을 줄이고 수정 시각은 되돌린다
    const spy = vi.spyOn(ReadStream.prototype, "emit").mockImplementation(function (this: ReadStream, event: string | symbol, ...args: unknown[]) {
      if (event === "end" && !cut && (this as unknown as { start?: number }).start === first.length) {
        cut = true;
        truncateSync(path, first.length);
        utimesSync(path, OLD / 1000, OLD / 1000);
      }
      return emit.call(this, event, ...args);
    });
    try {
      const one = collect();
      const outcome = await readZstdLines(path, OLD + 60_000, one.sink);
      expect(cut).toBe(true);
      expect(outcome.frames).toMatchObject({ status: "complete", frames: 2 });
      expect(outcome.decodeError).toBeNull();
      expect(outcome.endedEarly).toBe(false);
      expect(one.lines).toEqual(['{"a":1}', '{"a":2}', '{"b":1}']);
      expect(outcome.inProgress).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("훑기가 잰 크기가 줄었다 되돌아온 압축 기록의 끝이 줄바꿈 없는 완전한 줄이어도 덜 읽은 것이다(끝 조각과 덜 읽음은 따로 안다)", async () => {
    const bytes = compress('{"a":1}');
    const path = await put("stat-shrink-tail.zst", bytes);
    await utimes(path, OLD / 1000, OLD / 1000);
    const probe = await open(join(root, "probe-stat-tail"), "w");
    const proto: { stat(...args: unknown[]): Promise<{ size: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const realStat = proto.stat;
    let observed = -1;
    let restored = false;
    // 훑기가 연 파일의 크기를 잰 직후 원래 바이트와 수정 시각을 되돌린다
    const spy = vi.spyOn(proto, "stat").mockImplementation(async function (this: unknown, ...args: unknown[]) {
      const s = await realStat.apply(this, args);
      if (!restored) {
        observed = s.size;
        restored = true;
        writeFileSync(path, bytes);
        utimesSync(path, OLD / 1000, OLD / 1000);
      }
      return s;
    });
    try {
      const outcome = await readZstdLines(path, OLD + 60_000, collect().sink, { afterOpen: () => truncate(path, bytes.length - 1) });
      expect(observed).toBe(bytes.length - 1);
      expect(outcome.tail).toBe('{"a":1}');
      expect(outcome.decodeError).toBeNull();
      expect(outcome.endedEarly).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
  it("원래 잘렸거나 깨진 압축 기록은 연 크기까지 다 읽었으면 덜 읽은 것이 아니다(일부만 읽은 것은 프레임 상태와 풀기 오류로 따로 안다)", async () => {
    const whole = Buffer.concat([compress(ONE), compress(TWO)]);
    // 이름, 파일 내용, 훑기의 프레임 상태
    const cases: Array<[string, Buffer, string]> = [
      ["끝 프레임이 잘림", whole.subarray(0, whole.length - 3), "truncated"],
      ["정상 뒤 쓰레기", Buffer.concat([whole, Buffer.from("garbage")]), "invalid"],
    ];
    for (const [name, bytes, status] of cases) {
      const path = await put(`natural-${status}.zst`, bytes);
      await utimes(path, OLD / 1000, OLD / 1000);
      const outcome = await readZstdLines(path, OLD + 60_000, collect().sink);
      expect(outcome.frames.status, name).toBe(status);
      expect(outcome.inProgress, name).toBe(false);
      expect(outcome.endedEarly, name).toBe(false);
    }
  });
  it("원래 잘린 압축 기록이 훑은 뒤 더 줄어 풀 범위를 다 받지 못했으면 덜 읽은 것이다(원래 잘림과 읽는 동안 끝남은 따로 안다)", async () => {
    // 압축하지 않은 블록 하나짜리 프레임(매직, 프레임 머리, 창 크기, 블록 머리 3바이트, 자료)의 마지막 한 바이트를 뺀다
    const data = Buffer.from("a\nb\n");
    const head = Buffer.alloc(3);
    head.writeUIntLE((data.length << 3) | 1, 0, 3);
    const whole = Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0]), head, data]);
    const path = await put("natural-short.zst", whole.subarray(0, whole.length - 1));
    await utimes(path, OLD / 1000, OLD / 1000);
    const probe = await open(join(root, "probe-read-natural"), "w");
    const proto: { read(...args: unknown[]): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const realRead = proto.read;
    let cut = false;
    // 훑기가 블록 머리(6바이트 자리)를 읽은 직후 한 바이트 더 줄인다
    const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, ...args: unknown[]) {
      const result = await realRead.apply(this, args);
      if (!cut && args[3] === 6) {
        cut = true;
        truncateSync(path, whole.length - 2);
        utimesSync(path, OLD / 1000, OLD / 1000);
      }
      return result;
    });
    try {
      const outcome = await readZstdLines(path, OLD + 60_000, collect().sink);
      expect(cut).toBe(true);
      expect(outcome.frames.status).toBe("truncated");
      expect(outcome.decodeError).toBe("SHORT_INPUT");
      expect(outcome.endedEarly).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
  it("수정 시각이 평가 시각에서 2초 안쪽이거나 평가 시각보다 뒤여도, 연 뒤 줄어 연 크기까지 받지 못했으면 덜 읽은 것이다(쓰는 중과 덜 읽음은 따로 안다. 정확히 2초 전과 끝까지 읽은 것도 견준다)", async () => {
    const first = compress(ONE);
    const bytes = Buffer.concat([first, compress(TWO)]);
    // 이름, 평가 시각에서 수정 시각까지의 거리
    const ages: Array<[string, number]> = [["1초 전", 1000], ["1초 뒤", -1000], ["정확히 2초 전", 2000]];
    for (const [name, age] of ages) {
      const path = await put(`recent-${age}.zst`, bytes);
      await utimes(path, OLD / 1000, OLD / 1000);
      const whole = await readZstdLines(path, OLD + age, collect().sink);
      expect(whole.endedEarly, name).toBe(false);
      const outcome = await readZstdLines(path, OLD + age, collect().sink, {
        afterOpen: async () => {
          await truncate(path, first.length);
          await utimes(path, OLD / 1000, OLD / 1000);
        },
      });
      expect(outcome.sizeAtOpen, name).toBe(bytes.length);
      expect(outcome.inProgress, name).toBe(true);
      expect(outcome.endedEarly, name).toBe(true);
      expect(outcome.decodeError, name).toBeNull();
    }
  });
  it("연 뒤 훑기 전에 한 바이트만 줄었거나 0바이트가 됐다가, 훑기가 크기를 잰 직후 되돌아와도 쓰는 중이다(훑기가 잰 크기 감소)", async () => {
    const bytes = compress("a\n");
    const probe = await open(join(root, "probe-stat"), "w");
    const proto: { stat(...args: unknown[]): Promise<{ size: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const realStat = proto.stat;
    for (const [name, keep] of [["한 바이트 줄어듦", bytes.length - 1], ["0바이트", 0]] as const) {
      const path = await put(`stat-shrink-${keep}.zst`, bytes);
      await utimes(path, OLD / 1000, OLD / 1000);
      let observed = -1;
      let restored = false;
      // 훑기가 연 파일의 크기를 잰 직후 원래 바이트와 수정 시각을 되돌린다
      const spy = vi.spyOn(proto, "stat").mockImplementation(async function (this: unknown, ...args: unknown[]) {
        const s = await realStat.apply(this, args);
        if (!restored) {
          observed = s.size;
          restored = true;
          writeFileSync(path, bytes);
          utimesSync(path, OLD / 1000, OLD / 1000);
        }
        return s;
      });
      try {
        const one = collect();
        const outcome = await readZstdLines(path, OLD + 60_000, one.sink, { afterOpen: () => truncate(path, keep) });
        expect(observed, name).toBe(keep);
        expect(outcome.sizeAtOpen, name).toBe(bytes.length);
        expect(outcome.inProgress, name).toBe(true);
        expect(outcome.endedEarly, name).toBe(true);
        if (keep > 0) {
          expect(one.lines, name).toEqual(["a"]);
          expect(outcome.frames.status, name).toBe("truncated");
          expect(outcome.decodeError, name).toBeNull();
        } else {
          expect(one.lines, name).toEqual([]);
          expect(outcome.decodeError, name).toBe("INVALID");
        }
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("연 뒤 훑기 전에 프레임 경계까지 줄어든 파일은 남은 완결 프레임으로 훑는다(줄어든 크기를 넘어 보지 않는다)", async () => {
    const first = compress(ONE);
    const path = await put("shrink-boundary.zst", Buffer.concat([first, compress(TWO)]));
    const one = collect();
    const outcome = await readZstdLines(path, OLD + 60_000, one.sink, { afterOpen: () => truncate(path, first.length) });
    expect(outcome.frames).toMatchObject({ status: "complete", frames: 1, ranges: [[0, first.length]], brokenFrameStart: null });
    expect(one.lines).toEqual(['{"a":1}', '{"a":2}']);
    expect(outcome.inProgress).toBe(true);
  });

  it("훑다가 난 읽기 오류는 잘림으로 바꾸지 않고 그대로 던진다(파일이 줄어 끝난 것만 잘림이다)", async () => {
    const first = compress(ONE);
    const path = await put("read-error.zst", Buffer.concat([first, compress(TWO)]));
    const probe = await open(join(root, "probe-error"), "w");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    const spy = vi.spyOn(proto, "read").mockImplementation(function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      if (position === first.length) return Promise.reject(Object.assign(new Error("읽기 오류"), { code: "EIO" }));
      return read.call(this, buffer, offset, length, position);
    });
    try {
      await expect(scanZstdFrames(path)).rejects.toMatchObject({ code: "EIO" });
    } finally {
      spy.mockRestore();
    }
  });

  it("끝 프레임이 잘린 파일은 앞 프레임까지의 줄을 낸다. 오류가 나지 않을 수 있어 잘림은 프레임 훑기로 가린다", async () => {
    const both = Buffer.concat([compress(ONE), compress(TWO, true)]);
    const path = await put("t.zst", both.subarray(0, both.length - 3));
    const seen = collect();
    await readZstdLines(path, Date.now() + 60_000, seen.sink);
    expect(seen.lines.slice(0, 2)).toEqual(['{"a":1}', '{"a":2}']);
    expect((await scanZstdFrames(path)).status).toBe("truncated");
  });

  it("상한을 넘는 줄이 두 프레임에 걸쳐도 한 번만 센다. 프레임 사이에서 줄 나누기를 새로 시작하지 않는다", async () => {
    const seen = collect();
    await readZstdLines(await put("long.zst", Buffer.concat([compress("123456789"), compress("x\n")])), Date.now() + 60_000, seen.sink, { maxLineBytes: 8 });
    expect(seen.tooLong()).toBe(1);
    expect(seen.lines).toEqual([]);
  });

  it("구조가 완결된 프레임이라도 체크섬이 틀리면 풀기 오류를 돌려준다(일부만 읽은 파일로 가리는 근거)", async () => {
    const bad = compress(TWO, true);
    bad.writeUInt8(bad.readUInt8(bad.length - 1) ^ 1, bad.length - 1);
    const bytes = Buffer.concat([compress(ONE), bad]);
    const path = await put("bad.zst", bytes);
    expect((await scanZstdFrames(path)).status).toBe("complete");
    const seen = collect();
    const outcome = await readZstdLines(path, Date.now() + 60_000, seen.sink);
    expect(outcome.decodeError).not.toBeNull();
    expect(seen.lines.slice(0, 2)).toEqual(['{"a":1}', '{"a":2}']);
    // 연 크기까지 다 읽었으니 덜 읽은 것은 아니다(풀기 오류와 따로 알린다)
    expect(outcome.bytesRead).toBe(bytes.length);
    expect(outcome.inProgress).toBe(false);
    expect(outcome.endedEarly).toBe(false);
  });

  it("풀지 못하면 그 오류를 돌려주고 그때까지의 줄만 낸다", async () => {
    const seen = collect();
    const outcome = await readZstdLines(await put("m.zst", Buffer.from("not zstd at all")), Date.now() + 60_000, seen.sink);
    expect(outcome.decodeError).not.toBeNull();
    expect(seen.lines).toEqual([]);
  });
});
