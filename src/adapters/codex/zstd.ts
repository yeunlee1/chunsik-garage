// Codex 압축 기록(.jsonl.zst)을 다룬다. 실행 중인 Node.js가 zstd를 풀 수 있는지, 프레임이 끝까지 있는지(RFC 8878의 프레임 머리와 블록 머리만 따라감), 흘려 풀어 한 줄씩 읽기다. Node.js의 zstd 풀기는 여러 프레임 가운데 첫 프레임만 풀고 오류를 내지 않으므로, 프레임 훑기로 자리를 알아 프레임마다 따로 풀어 잇는다(설계 9.8, 「5단계 계획 전 결정」 2번)
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import type { Transform } from "node:stream";
import * as zlib from "node:zlib";
import { IN_PROGRESS_WINDOW_MS, lineSplitter, MAX_LINE_BYTES, type LineSink } from "../common/lines.ts";

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MASK = 0xfffffff0;
const SKIPPABLE_MAGIC = 0x184d2a50;
/** 자료 프레임 매직의 바이트(리틀 엔디언) */
const MAGIC_BYTES = [0x28, 0xb5, 0x2f, 0xfd];
/** 건너뛸 수 있는 프레임 매직(0x184D2A50~0x184D2A5F)의 바이트(리틀 엔디언). 첫 바이트는 위 네 비트만 본다(RFC 8878 3.1.2) */
const SKIPPABLE_BYTES = [0x50, 0x2a, 0x4d, 0x18];

/** 매직보다 짧은 바이트가 자료 프레임 매직이나 건너뛸 수 있는 프레임 매직의 앞부분인지 본다. 파일 끝에 이것만 남았으면 잘린 것이다 */
function magicPrefix(bytes: Buffer): boolean {
  const data = bytes.every((byte, index) => byte === MAGIC_BYTES[index]);
  const skippable = bytes.every((byte, index) => (index === 0 ? (byte & 0xf0) === SKIPPABLE_BYTES[0] : byte === SKIPPABLE_BYTES[index]));
  return data || skippable;
}

/** 실행 중인 Node.js에 zstd 풀기가 있는지. 22 계열은 22.15.0, 23 계열은 23.8.0부터 있다. 버전 글자가 아니라 기능으로 가린다 */
export function zstdAvailable(): boolean {
  return typeof (zlib as { createZstdDecompress?: unknown }).createZstdDecompress === "function";
}

export type ZstdFrameStatus = "complete" | "truncated" | "invalid";

/** 압축 파일의 프레임을 처음부터 끝까지 따라간다. 자료 프레임의 수와, 끝까지 맞으면 완결, 프레임 도중에 파일이 끝나면 잘림, 꼴이 틀리면 깨짐이다 */
export interface ZstdFrames {
  status: ZstdFrameStatus;
  /** 끝까지 있는 자료 프레임의 수 */
  frames: number;
  /** 끝까지 있는 자료 프레임마다의 [시작, 끝) 바이트 자리. 건너뛸 수 있는 프레임은 넣지 않는다 */
  ranges: Array<[number, number]>;
  /** 잘렸거나 깨진 곳이 자료 프레임 안이면 그 프레임의 시작 자리, 아니면 null이다 */
  brokenFrameStart: number | null;
}

/** 프레임을 훑는다. maxBytes를 주면 그 바이트까지만 본다(압축 읽기는 연 순간의 크기를 준다). seen에는 그 크기에 닿기 전에 파일이 끝났는지(연 뒤나 훑는 동안 줄었는지)를 적는다 */
export async function scanZstdFrames(path: string, maxBytes = Infinity, seen: { endedEarly: boolean } = { endedEarly: false }): Promise<ZstdFrames> {
  const handle = await open(path, "r");
  try {
    const size = Math.min((await handle.stat()).size, maxBytes);
    // 훑기가 잰 크기가 받은 상한(연 순간의 크기)보다 작으면 연 뒤에 줄었다. 그 뒤 되돌아와도 쓰는 중이다
    if (Number.isFinite(maxBytes) && size < maxBytes) seen.endedEarly = true;
    const small = Buffer.alloc(18);
    // 한 번의 읽기는 요청보다 짧게 끝날 수 있어 채울 때까지 읽는다. 채우기 전에 파일이 끝나면(훑는 동안 줄었으면) 읽은 만큼만 돌려주고, 부르는 쪽이 길이를 견줘 그 자리에서 끝낸다
    const readAt = async (position: number, length: number): Promise<Buffer> => {
      let offset = 0;
      while (offset < length) {
        const { bytesRead } = await handle.read(small, offset, length - offset, position + offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset < length) seen.endedEarly = true;
      return small.subarray(0, offset);
    };
    let position = 0;
    let frames = 0;
    const ranges: Array<[number, number]> = [];
    let frameStart: number | null = null;
    if (size === 0) return { status: "invalid", frames: 0, ranges, brokenFrameStart: null };
    while (position < size) {
      const left = size - position;
      // 남은 바이트가 매직보다 적거나 훑는 동안 줄어 매직을 다 읽지 못했으면, 읽은 바이트가 매직의 앞부분일 때 잘림이고 아니면 깨짐이다
      const lead = await readAt(position, Math.min(4, left));
      if (lead.length < 4) return { status: magicPrefix(lead) ? "truncated" : "invalid", frames, ranges, brokenFrameStart: null };
      const magic = lead.readUInt32LE(0);
      frameStart = null;
      if ((magic & SKIPPABLE_MASK) >>> 0 === SKIPPABLE_MAGIC) {
        if (left < 8) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        const field = await readAt(position + 4, 4);
        if (field.length < 4) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        const length = field.readUInt32LE(0);
        position += 8 + length;
        if (position > size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        continue;
      }
      if (magic !== ZSTD_MAGIC) return { status: "invalid", frames, ranges, brokenFrameStart: null };
      frameStart = position;
      position += 4;
      if (position >= size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
      const descriptorByte = await readAt(position, 1);
      if (descriptorByte.length < 1) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
      const descriptor = descriptorByte[0]!;
      const fcsFlag = descriptor >> 6;
      const singleSegment = (descriptor >> 5) & 1;
      const reserved = (descriptor >> 3) & 1;
      const checksum = (descriptor >> 2) & 1;
      const dictFlag = descriptor & 3;
      if (reserved !== 0) return { status: "invalid", frames, ranges, brokenFrameStart: frameStart };
      const headerBytes = 1 + (singleSegment ? 0 : 1) + [0, 1, 2, 4][dictFlag]! + [singleSegment ? 1 : 0, 2, 4, 8][fcsFlag]!;
      position += headerBytes;
      if (position > size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
      for (;;) {
        if (size - position < 3) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        const head = await readAt(position, 3);
        if (head.length < 3) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        const value = head[0]! | (head[1]! << 8) | (head[2]! << 16);
        const last = value & 1;
        const type = (value >> 1) & 3;
        const blockSize = value >>> 3;
        if (type === 3) return { status: "invalid", frames, ranges, brokenFrameStart: frameStart };
        position += 3 + (type === 1 ? 1 : blockSize);
        if (position > size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        if (last) break;
      }
      if (checksum) {
        position += 4;
        if (position > size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
      }
      frames++;
      ranges.push([frameStart, position]);
      frameStart = null;
    }
    return { status: frames > 0 ? "complete" : "invalid", frames, ranges, brokenFrameStart: null };
  } finally {
    await handle.close();
  }
}

export interface ZstdReadOutcome {
  sizeAtOpen: number;
  mtimeMsAtOpen: number;
  /** 압축 파일에서 읽은 바이트와 풀린 바이트 */
  bytesRead: number;
  decodedBytes: number;
  /** 파일 끝의 줄바꿈 없는 조각. 없거나 상한을 넘었으면 null이다 */
  tail: string | null;
  /** 읽는 동안 크기나 수정 시각이 바뀌었거나, 훑거나 푸는 동안 연 크기에 닿기 전에 파일이 끝났거나(그 뒤 되돌아와도), 수정 시각이 평가 시각에서 2초 안쪽이다 */
  inProgress: boolean;
  /** 훑거나 푸는 동안 연 크기에 닿기 전에 파일이 끝났다(연 뒤나 읽는 동안 줄었다). 그 뒤 되돌아왔어도 참이고, 앞부분만 읽은 것이다 */
  endedEarly: boolean;
  /** 풀다가 난 오류의 코드나 글. 없으면 null이다. 디코더가 조용히 끝났어도 풀 범위를 다 받지 못했으면 SHORT_INPUT이다. 오류가 없어도 끝까지 풀렸다는 보증은 아니다(frames.status로 가린다) */
  decodeError: string | null;
  /** 프레임 훑기의 결과. 잘렸거나 깨졌으면 일부만 읽은 파일이다 */
  frames: ZstdFrames;
}

/** 바이트 자리 [start, end)의 프레임 하나를 따로 풀어 줄 나누기에 잇는다 */
async function decodeRange(path: string, start: number, end: number, push: (chunk: Buffer) => void): Promise<{ bytesRead: number; decodedBytes: number; error: string | null }> {
  const source = createReadStream(path, { start, end: end - 1 });
  let bytesRead = 0;
  let decodedBytes = 0;
  source.on("data", (chunk: Buffer | string) => {
    bytesRead += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
  });
  const decoder = (zlib as unknown as { createZstdDecompress(): Transform }).createZstdDecompress();
  source.on("error", (error) => decoder.destroy(error));
  source.pipe(decoder);
  try {
    for await (const chunk of decoder as AsyncIterable<Buffer>) {
      decodedBytes += chunk.length;
      push(chunk);
    }
    // 디코더가 조용히 끝나도 풀 범위를 다 받지 못했으면(훑은 뒤 읽는 동안 줄었으면) 끝까지 푼 것이 아니다
    return { bytesRead, decodedBytes, error: bytesRead === end - start ? null : "SHORT_INPUT" };
  } catch (error) {
    source.destroy();
    return { bytesRead, decodedBytes, error: (error as NodeJS.ErrnoException).code ?? String((error as Error).message ?? error) };
  }
}

/** 연 순간의 크기까지만, 프레임마다 따로 흘려 풀어 한 줄씩 낸다. 끝까지 있는 프레임을 차례로 풀고, 잘렸거나 깨진 프레임은 나오는 만큼 푼다. 풀다가 오류가 나면(풀 범위를 다 받지 못한 것도 든다) 그 앞까지의 줄만 내고 오류를 돌려준다 */
export async function readZstdLines(path: string, nowMs: number, sink: LineSink, options: { maxLineBytes?: number; afterOpen?: () => Promise<void> } = {}): Promise<ZstdReadOutcome> {
  const opened = await stat(path);
  const sizeAtOpen = opened.size;
  const mtimeMsAtOpen = opened.mtimeMs;
  // 시험용. 연 순간의 크기와 수정 시각을 잡은 직후에 부른다(1단계 readLines와 같다)
  if (options.afterOpen) await options.afterOpen();
  // 프레임 훑기도 연 순간의 크기까지만 한다(연 뒤에 덧붙거나 완성된 프레임이 그 앞의 판정을 바꾸지 않게)
  const seen = { endedEarly: false };
  const frames = await scanZstdFrames(path, sizeAtOpen, seen);
  const splitter = lineSplitter(sink, options.maxLineBytes ?? MAX_LINE_BYTES);
  let bytesRead = 0;
  let decodedBytes = 0;
  let decodeError: string | null = sizeAtOpen === 0 ? "EMPTY" : null;
  const targets: Array<[number, number]> = [...frames.ranges];
  if (frames.brokenFrameStart !== null) targets.push([frames.brokenFrameStart, sizeAtOpen]);
  for (const [start, end] of targets) {
    const result = await decodeRange(path, start, end, (chunk) => splitter.push(chunk));
    bytesRead += result.bytesRead;
    decodedBytes += result.decodedBytes;
    if (result.error !== null) {
      decodeError = result.error;
      break;
    }
  }
  // 자료 프레임이 하나도 없는 깨진 파일은 풀 것이 없다
  if (decodeError === null && frames.status === "invalid" && targets.length === 0) decodeError = "INVALID";
  const tail = splitter.finish();
  const after = await stat(path);
  const inProgress = after.size !== sizeAtOpen || after.mtimeMs !== mtimeMsAtOpen || nowMs - mtimeMsAtOpen < IN_PROGRESS_WINDOW_MS;
  // 훑거나 푸는 동안 연 크기에 닿기 전에 파일이 끝났으면(읽는 동안 줄었으면) 그 뒤 크기와 수정 시각이 되돌아와도 쓰는 중이고, 앞부분만 읽은 것이다
  return { sizeAtOpen, mtimeMsAtOpen, bytesRead, decodedBytes, tail, inProgress: inProgress || seen.endedEarly || decodeError === "SHORT_INPUT", endedEarly: seen.endedEarly || decodeError === "SHORT_INPUT", decodeError, frames };
}
