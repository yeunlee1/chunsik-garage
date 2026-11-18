// zip 파일(또는 바깥 zip 안에 저장만 해서 넣은 안쪽 zip)의 중앙 목록을 읽고, 고른 항목을 풀어 조각으로 낸다. 저장만(0)과 deflate(8)만 풀고 ZIP64를 읽는다. 암호를 건 항목과 여러 디스크로 나뉜 zip은 풀지 않는다(설계 「0.5.0에서 정한 것」)
import { createReadStream } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { pipeline } from "node:stream";
import * as zlib from "node:zlib";

/** zip이 든 바이트 구간. 파일 전체이거나 바깥 zip 안의 저장만 한 항목이다 */
export interface ZipSource {
  path: string;
  start: number;
  size: number;
}

export interface ZipEntry {
  /** 항목 이름. 이름 표시가 UTF-8이면 그대로, 아니면 latin1로 읽는다(이 도구가 찾는 이름은 ASCII다) */
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  crc32: number;
  /** 구간 안에서의 지역 머리 자리 */
  localOffset: number;
  encrypted: boolean;
}

export type ZipErrorCode = "not-zip" | "multi-disk" | "broken-directory" | "encrypted" | "method" | "truncated" | "crc";

export class ZipError extends Error {
  constructor(readonly code: ZipErrorCode) {
    super(`zip: ${code}`);
  }
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
/** 끝 기록(22바이트)과 가장 긴 주석(65535바이트) */
const TAIL_SEARCH = 22 + 0xffff;

async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset === length ? buffer : buffer.subarray(0, offset);
}

const u64 = (buffer: Buffer, offset: number): number => {
  const value = buffer.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError("broken-directory");
  return Number(value);
};

interface Directory {
  offset: number;
  size: number;
  entries: number;
}

/** 끝 기록 후보 하나를 읽는다. 중앙 목록이 끝 기록(ZIP64면 ZIP64 끝 기록) 바로 앞에서 끝나지 않으면 이어지지 않는 후보라 null이다 */
async function candidateDirectory(handle: FileHandle, source: ZipSource, eocdAt: number, record: Buffer): Promise<Directory | null> {
  const disk = record.readUInt16LE(4);
  const directoryDisk = record.readUInt16LE(6);
  let entries = record.readUInt16LE(10);
  let size = record.readUInt32LE(12);
  let offset = record.readUInt32LE(16);
  const needs64 = entries === 0xffff || size === 0xffffffff || offset === 0xffffffff;
  // 중앙 목록이 끝나는 자리. 보통은 끝 기록의 자리이고, ZIP64면 ZIP64 끝 기록의 자리다
  let directoryEnd = eocdAt;
  const locator = eocdAt >= 20 ? await readAt(handle, source.start + eocdAt - 20, 20) : Buffer.alloc(0);
  if (locator.length === 20 && locator.readUInt32LE(0) === ZIP64_LOCATOR) {
    if (locator.readUInt32LE(4) !== 0 || locator.readUInt32LE(16) > 1) throw new ZipError("multi-disk");
    const recordAt = u64(locator, 8);
    if (recordAt + 56 > eocdAt - 20) return null;
    const zip64 = await readAt(handle, source.start + recordAt, 56);
    if (zip64.length < 56 || zip64.readUInt32LE(0) !== ZIP64_EOCD) return null;
    if (zip64.readUInt32LE(16) !== 0 || zip64.readUInt32LE(20) !== 0) throw new ZipError("multi-disk");
    entries = u64(zip64, 32);
    size = u64(zip64, 40);
    offset = u64(zip64, 48);
    directoryEnd = recordAt;
  } else if (needs64) return null;
  if (offset + size !== directoryEnd) return null;
  if (disk !== 0 || directoryDisk !== 0) throw new ZipError("multi-disk");
  return { offset, size, entries };
}

/**
 * 끝 기록을 찾아 중앙 목록의 자리와 크기를 낸다(구간 안의 자리). ZIP64면 ZIP64 끝 기록의 값을 쓴다.
 * 끝 주석에 끝 기록과 같은 바이트가 있을 수 있어, 뒤에서부터 후보를 보며 중앙 목록과 이어지는 첫 후보를 쓴다(짝 검토 3 필수 3)
 */
async function directoryOf(handle: FileHandle, source: ZipSource): Promise<Directory> {
  const from = Math.max(0, source.size - TAIL_SEARCH);
  const tail = await readAt(handle, source.start + from, source.size - from);
  let found = false;
  for (let index = tail.length - 22; index >= 0; index--) {
    if (tail.readUInt32LE(index) !== EOCD || index + 22 + tail.readUInt16LE(index + 20) > tail.length) continue;
    found = true;
    const directory = await candidateDirectory(handle, source, from + index, tail.subarray(index, index + 22));
    if (directory !== null) return directory;
  }
  throw new ZipError(found ? "broken-directory" : "not-zip");
}

/** ZIP64 덧붙임 칸(0x0001)에서 0xffffffff로 적힌 값만 차례대로 꺼낸다 */
function zip64Values(extra: Buffer, wanted: { size: boolean; compressed: boolean; offset: boolean }): { size?: number; compressed?: number; offset?: number } {
  if (!wanted.size && !wanted.compressed && !wanted.offset) return {};
  for (let at = 0; at + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(at);
    const length = extra.readUInt16LE(at + 2);
    const body = extra.subarray(at + 4, at + 4 + length);
    if (id === 0x0001) {
      const out: { size?: number; compressed?: number; offset?: number } = {};
      let cursor = 0;
      const take = (): number => {
        if (cursor + 8 > body.length) throw new ZipError("broken-directory");
        const value = u64(body, cursor);
        cursor += 8;
        return value;
      };
      if (wanted.size) out.size = take();
      if (wanted.compressed) out.compressed = take();
      if (wanted.offset) out.offset = take();
      return out;
    }
    at += 4 + length;
  }
  throw new ZipError("broken-directory");
}

/** 파일 전체를 zip 구간으로 */
export async function wholeFile(path: string): Promise<ZipSource> {
  const handle = await open(path, "r");
  try {
    return { path, start: 0, size: (await handle.stat()).size };
  } finally {
    await handle.close();
  }
}

/** 중앙 목록의 항목들. 폴더 항목(이름이 /로 끝남)도 낸다 */
export async function zipEntries(source: ZipSource): Promise<ZipEntry[]> {
  const handle = await open(source.path, "r");
  try {
    const directory = await directoryOf(handle, source);
    const data = await readAt(handle, source.start + directory.offset, directory.size);
    if (data.length !== directory.size) throw new ZipError("truncated");
    const entries: ZipEntry[] = [];
    let at = 0;
    for (let count = 0; count < directory.entries; count++) {
      if (at + 46 > data.length || data.readUInt32LE(at) !== CENTRAL) throw new ZipError("broken-directory");
      const flags = data.readUInt16LE(at + 8);
      const method = data.readUInt16LE(at + 10);
      const crc32 = data.readUInt32LE(at + 16);
      let compressedSize = data.readUInt32LE(at + 20);
      let size = data.readUInt32LE(at + 24);
      const nameLength = data.readUInt16LE(at + 28);
      const extraLength = data.readUInt16LE(at + 30);
      const commentLength = data.readUInt16LE(at + 32);
      let localOffset = data.readUInt32LE(at + 42);
      const nameStart = at + 46;
      const extraStart = nameStart + nameLength;
      const next = extraStart + extraLength + commentLength;
      if (next > data.length) throw new ZipError("broken-directory");
      const name = data.subarray(nameStart, extraStart).toString((flags & 0x0800) !== 0 ? "utf8" : "latin1");
      const big = zip64Values(data.subarray(extraStart, extraStart + extraLength), { size: size === 0xffffffff, compressed: compressedSize === 0xffffffff, offset: localOffset === 0xffffffff });
      if (big.size !== undefined) size = big.size;
      if (big.compressed !== undefined) compressedSize = big.compressed;
      if (big.offset !== undefined) localOffset = big.offset;
      entries.push({ name, method, compressedSize, size, crc32, localOffset, encrypted: (flags & 0x0001) !== 0 });
      at = next;
    }
    return entries;
  } finally {
    await handle.close();
  }
}

/** 항목의 압축된 바이트가 시작하는 자리(파일 안의 자리) */
async function dataStartOf(source: ZipSource, entry: ZipEntry): Promise<number> {
  const handle = await open(source.path, "r");
  try {
    const header = await readAt(handle, source.start + entry.localOffset, 30);
    if (header.length < 30 || header.readUInt32LE(0) !== LOCAL) throw new ZipError("broken-directory");
    const start = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    if (start + entry.compressedSize > source.size) throw new ZipError("truncated");
    return source.start + start;
  } finally {
    await handle.close();
  }
}

/** 저장만 한 항목을 그 자리의 zip 구간으로 본다(바깥 zip 안의 안쪽 zip). 압축한 항목이면 null이다 */
export async function storedSource(source: ZipSource, entry: ZipEntry): Promise<ZipSource | null> {
  if (entry.method !== 0 || entry.encrypted || entry.compressedSize !== entry.size) return null;
  return { path: source.path, start: await dataStartOf(source, entry), size: entry.size };
}

/** 항목 하나를 풀어 조각으로 낸다. 풀린 크기와 CRC가 중앙 목록과 다르면 ZipError다 */
export async function* zipEntryChunks(source: ZipSource, entry: ZipEntry): AsyncGenerator<Buffer> {
  if (entry.encrypted) throw new ZipError("encrypted");
  if (entry.method !== 0 && entry.method !== 8) throw new ZipError("method");
  const dataStart = await dataStartOf(source, entry);
  if (entry.compressedSize === 0) {
    if (entry.size !== 0) throw new ZipError("truncated");
    return;
  }
  const input = createReadStream(source.path, { start: dataStart, end: dataStart + entry.compressedSize - 1 });
  const output = entry.method === 0 ? input : pipeline(input, zlib.createInflateRaw(), () => {});
  const crc = typeof zlib.crc32 === "function" ? zlib.crc32 : null;
  let produced = 0;
  let check = 0;
  try {
    for await (const chunk of output as AsyncIterable<Buffer>) {
      produced += chunk.length;
      if (produced > entry.size) throw new ZipError("truncated");
      if (crc !== null) check = crc(chunk, check);
      yield chunk;
    }
  } catch (error) {
    if (error instanceof ZipError) throw error;
    throw new ZipError("truncated");
  } finally {
    input.destroy();
    if (output !== input) output.destroy();
  }
  if (produced !== entry.size) throw new ZipError("truncated");
  if (crc !== null && check >>> 0 !== entry.crc32) throw new ZipError("crc");
}
