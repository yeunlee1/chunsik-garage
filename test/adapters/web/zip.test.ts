// zip 읽기를 시험한다. 저장만·deflate 항목, ZIP64 끝 기록, 끝 주석, 안쪽 zip 구간, 암호·모르는 압축·끊긴 파일·CRC 어긋남, zip이 아닌 파일(설계 「0.5.0에서 정한 것」)
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storedSource, wholeFile, ZipError, zipEntries, zipEntryChunks, type ZipSource } from "../../../src/adapters/web/zip.ts";
import { makeZip } from "../../helpers/zip-writer.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq-zip-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = async (name: string, data: Buffer): Promise<string> => {
  const path = join(root, name);
  await writeFile(path, data);
  return path;
};

async function text(source: ZipSource, name: string): Promise<string> {
  const entry = (await zipEntries(source)).find((item) => item.name === name);
  if (entry === undefined) throw new Error(`no entry ${name}`);
  const parts: Buffer[] = [];
  for await (const chunk of zipEntryChunks(source, entry)) parts.push(chunk);
  return Buffer.concat(parts).toString("utf8");
}

const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
    return "ok";
  } catch (error) {
    return error instanceof ZipError ? error.code : `other:${(error as Error).message}`;
  }
};

describe("zipEntries와 zipEntryChunks", () => {
  it("저장만 한 항목과 deflate 항목의 이름·크기를 읽고 원래 글로 푼다. UTF-8 이름도 그대로다", async () => {
    const big = "가나다".repeat(50_000);
    const path = await put("a.zip", makeZip([{ name: "conversations.json", data: "[1,2]", method: 0 }, { name: "폴더/큰.json", data: big, method: 8 }]));
    const source = await wholeFile(path);
    const entries = await zipEntries(source);
    expect(entries.map((entry) => [entry.name, entry.method, entry.size])).toEqual([
      ["conversations.json", 0, 5],
      ["폴더/큰.json", 8, Buffer.byteLength(big)],
    ]);
    expect(await text(source, "conversations.json")).toBe("[1,2]");
    expect(await text(source, "폴더/큰.json")).toBe(big);
  });

  it("ZIP64 끝 기록과 덧붙임 칸으로 적은 크기·자리를 읽는다", async () => {
    const path = await put("b.zip", makeZip([{ name: "x.json", data: "[]" }, { name: "conversations-000.json", data: "[{}]" }], { zip64: true }));
    const source = await wholeFile(path);
    expect((await zipEntries(source)).map((entry) => entry.name)).toEqual(["x.json", "conversations-000.json"]);
    expect(await text(source, "conversations-000.json")).toBe("[{}]");
  });

  it("끝에 주석이 있어도 끝 기록을 찾는다", async () => {
    const path = await put("c.zip", makeZip([{ name: "conversations.json", data: "[]" }], { comment: "PK\u0005\u0006 가짜 표지가 든 주석" }));
    expect(await text(await wholeFile(path), "conversations.json")).toBe("[]");
  });

  it("바깥 zip 안에 저장만 한 안쪽 zip은 그 자리를 구간으로 읽는다. 압축한 안쪽 zip은 구간으로 보지 않는다", async () => {
    const inner = makeZip([{ name: "conversations-001.json", data: '[{"a":1}]' }]);
    const path = await put("outer.zip", makeZip([{ name: "Conversations__part-001.zip", data: inner, method: 0 }, { name: "Files__part-001.zip", data: inner, method: 8 }]));
    const outer = await wholeFile(path);
    const entries = await zipEntries(outer);
    const stored = await storedSource(outer, entries[0]!);
    expect(stored).not.toBeNull();
    expect(await text(stored!, "conversations-001.json")).toBe('[{"a":1}]');
    expect(await storedSource(outer, entries[1]!)).toBeNull();
  });

  it("암호를 건 항목, 모르는 압축, 끊긴 파일, CRC가 다른 항목, zip이 아닌 파일은 각각의 까닭으로 멈춘다", async () => {
    const encrypted = await put("e.zip", makeZip([{ name: "conversations.json", data: "[]", encrypted: true }]));
    expect(await codeOf(async () => text(await wholeFile(encrypted), "conversations.json"))).toBe("encrypted");

    const method = makeZip([{ name: "conversations.json", data: "[]", method: 0 }]);
    // 중앙 목록과 지역 머리의 압축 방식을 12(bzip2)로 바꾼다
    method.writeUInt16LE(12, 8);
    method.writeUInt16LE(12, method.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 10);
    expect(await codeOf(async () => text(await wholeFile(await put("m.zip", method)), "conversations.json"))).toBe("method");

    // 끝 기록이 잘린 파일
    const whole = makeZip([{ name: "conversations.json", data: "x".repeat(10_000), method: 8 }]);
    expect(await codeOf(async () => zipEntries(await wholeFile(await put("t.zip", whole.subarray(0, whole.length - 10)))))).toBe("not-zip");
    // 끝 기록은 있는데 내용이 잘린 파일. 중앙 목록의 자리가 파일 밖이다
    const cut = Buffer.concat([whole.subarray(0, 20), whole.subarray(whole.length - 22)]);
    expect(await codeOf(async () => zipEntries(await wholeFile(await put("t2.zip", cut))))).toBe("broken-directory");

    const crc = makeZip([{ name: "conversations.json", data: "[1]", method: 0 }]);
    crc[30 + "conversations.json".length + 1] = 0x32; // 내용 "[1]"을 "[2]"로 바꾼다
    expect(await codeOf(async () => text(await wholeFile(await put("crc.zip", crc)), "conversations.json"))).toBe("crc");

    expect(await codeOf(async () => zipEntries(await wholeFile(await put("plain.json", Buffer.from("[]")))))).toBe("not-zip");
  });

  it("압축된 바이트가 망가지면 끊긴 것으로 멈춘다", async () => {
    const zip = makeZip([{ name: "conversations.json", data: "y".repeat(5000), method: 8 }]);
    const dataAt = 30 + "conversations.json".length;
    zip.fill(0xff, dataAt, dataAt + 8);
    expect(await codeOf(async () => text(await wholeFile(await put("d.zip", zip)), "conversations.json"))).toBe("truncated");
  });

  it("빈 항목은 조각 없이 끝난다", async () => {
    const path = await put("empty.zip", makeZip([{ name: "conversations.json", data: "", method: 0 }]));
    expect(await text(await wholeFile(path), "conversations.json")).toBe("");
    expect((await readFile(path)).length).toBeGreaterThan(0);
  });
});
