// 기록 파일을 한 줄씩 흘려 읽는다. 연 순간의 크기까지만 읽고, 너무 긴 줄을 가르고, 줄바꿈 없는 끝 조각을 따로 돌려주며, 진행 중인 파일을 알아낸다(설계 9.4)
import { open, stat } from "node:fs/promises";

export const MAX_LINE_BYTES = 16 * 1024 * 1024;
export const IN_PROGRESS_WINDOW_MS = 2000;

export interface LineSink {
  /** 줄바꿈으로 끝난 줄. 끝의 \r은 뗐다. */
  line(text: string): void;
  /** 상한을 넘은 줄 하나. 풀지 않고 센다. found는 그 줄의 바이트에서 찾은 표지의 이름이다(0.3.0. 표지를 주지 않았으면 비어 있다) */
  tooLong(found?: ReadonlySet<string>): void;
}

/** 상한을 넘은 줄에서 찾을 바이트 표지. 사용 흔적이 실릴 수 있는 줄인지 가를 때 쓴다(0.3.0, 다른 PC 피드백 7번) */
export interface LineMarker {
  name: string;
  bytes: Buffer;
}

export interface ReadOutcome {
  sizeAtOpen: number;
  mtimeMsAtOpen: number;
  bytesRead: number;
  /** 파일 끝의 줄바꿈 없는 조각. 없거나 상한을 넘었으면 null이다. */
  tail: string | null;
  /** 읽는 동안 크기나 수정 시각이 바뀌었거나, 연 크기까지 다 읽기 전에 파일이 끝났거나(그 뒤 되돌아와도), 수정 시각이 평가 시각에서 2초 안쪽이다. */
  inProgress: boolean;
  /** 연 크기까지 다 읽기 전에 파일이 끝났다(읽는 동안 줄었다). 그 뒤 크기와 수정 시각이 되돌아왔어도 참이고, 앞부분만 읽은 것이다. */
  endedEarly: boolean;
}

export interface ReadOptions {
  maxLineBytes?: number;
  chunkBytes?: number;
  /** 시험용. 파일을 연 직후에 부른다. */
  afterOpen?: () => Promise<void>;
  /** 상한을 넘은 줄에서 찾을 표지 */
  markers?: readonly LineMarker[];
}

/** 버퍼의 [start, end)를 UTF-8로 푼다. 끝의 \r은 뗀다. */
function decode(buffer: Buffer, start: number, end: number): string {
  return buffer.toString("utf8", start, end > start && buffer[end - 1] === 0x0d ? end - 1 : end);
}

/** 조각을 차례로 받아 줄로 나눈다. 파일에서 읽은 조각과 압축을 푼 조각이 같이 쓴다 */
export interface LineSplitter {
  push(view: Buffer): void;
  /** 끝의 줄바꿈 없는 조각. 없거나 상한을 넘었으면 null이다. 상한을 넘은 끝 줄은 여기서 센다 */
  finish(): string | null;
}

const BACKSLASH = 0x5c;
const LOWER_U = 0x75;

/** 16진 숫자 하나의 값. 16진이 아니면 -1이다 */
function hexValue(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
  return -1;
}

/**
 * 너무 긴 줄의 바이트를 표지와 견줄 꼴로 푼다(짝 4차 필수 1번). JSON 이스케이프 \uXXXX가 ASCII 글자면 그 글자로 풀고, 따옴표와 역빗금이면
 * 이스케이프한 꼴(\" \\)로 둬 글 안의 따옴표가 구조의 따옴표와 맞지 않게 한다. 다른 이스케이프와 ASCII가 아닌 \uXXXX는 그대로 둔다.
 * 앞에서부터 이스케이프를 짝지어 읽으므로 \\ 뒤의 u0053은 풀지 않는다. 조각 끝에 걸린 이스케이프는 다음 조각과 이어 푼다
 */
function escapeDecoder(): { push(piece: Buffer): Buffer; reset(): void } {
  let held = Buffer.alloc(0);
  return {
    push(piece: Buffer): Buffer {
      const input = held.length > 0 ? Buffer.concat([held, piece]) : piece;
      held = Buffer.alloc(0);
      if (input.indexOf(BACKSLASH) === -1) return input;
      // 이스케이프를 풀면 짧아지기만 하므로 입력 길이면 넉넉하다
      const out = Buffer.allocUnsafe(input.length);
      let written = 0;
      let index = 0;
      while (index < input.length) {
        const slash = input.indexOf(BACKSLASH, index);
        written += input.copy(out, written, index, slash === -1 ? input.length : slash);
        if (slash === -1) break;
        if (slash + 1 >= input.length || (input[slash + 1] === LOWER_U && slash + 6 > input.length)) {
          held = Buffer.from(input.subarray(slash));
          break;
        }
        if (input[slash + 1] !== LOWER_U) {
          out[written++] = BACKSLASH;
          out[written++] = input[slash + 1]!;
          index = slash + 2;
          continue;
        }
        let code = 0;
        for (let at = slash + 2; at < slash + 6; at++) {
          const digit = hexValue(input[at]!);
          code = digit < 0 || code < 0 ? -1 : code * 16 + digit;
        }
        if (code < 0) {
          // 16진이 아닌 \u는 JSON이 아니다. 두 바이트만 옮기고 뒤는 다시 본다
          out[written++] = BACKSLASH;
          out[written++] = LOWER_U;
          index = slash + 2;
          continue;
        }
        if (code === 0x22 || code === BACKSLASH) {
          out[written++] = BACKSLASH;
          out[written++] = code;
        } else if (code < 0x80) {
          out[written++] = code;
        } else {
          written += input.copy(out, written, slash, slash + 6);
        }
        index = slash + 6;
      }
      return out.subarray(0, written);
    },
    reset(): void {
      held = Buffer.alloc(0);
    },
  };
}

export function lineSplitter(sink: LineSink, maxLine: number = MAX_LINE_BYTES, markers: readonly LineMarker[] = []): LineSplitter {
  // 읽은 조각을 넘는 줄만 여기에 모은다. 필요할 때 두 배씩, 상한까지만 키우고 파일 하나 동안 다시 쓴다.
  let carry = Buffer.allocUnsafe(Math.min(maxLine, 64 * 1024));
  let carryBytes = 0;
  let skipping = false; // 상한을 넘은 줄의 나머지를 줄바꿈까지 버리는 중이다
  // 상한을 넘은 줄을 버리면서 JSON 이스케이프를 풀어 표지를 훑는다. 조각 경계에 걸친 표지를 찾으려고 앞 조각(푼 것)의 끝을 표지 길이만큼 남긴다
  const longest = markers.reduce((most, marker) => Math.max(most, marker.bytes.length), 0);
  const decoder = escapeDecoder();
  let found = new Set<string>();
  let edge = Buffer.alloc(0);
  const scan = (raw: Buffer): void => {
    if (markers.length === 0 || raw.length === 0) return;
    const piece = decoder.push(raw);
    const joined = edge.length > 0 ? Buffer.concat([edge, piece]) : piece;
    for (const marker of markers) if (!found.has(marker.name) && joined.indexOf(marker.bytes) !== -1) found.add(marker.name);
    edge = Buffer.from(joined.subarray(Math.max(0, joined.length - (longest - 1))));
  };
  const endLong = (): void => {
    sink.tooLong(found);
    found = new Set();
    edge = Buffer.alloc(0);
    decoder.reset();
  };
  return {
    push(view: Buffer): void {
      let start = 0;
      for (;;) {
        const newline = view.indexOf(0x0a, start);
        const end = newline === -1 ? view.length : newline;
        if (!skipping) {
          const length = end - start;
          if (carryBytes + length > maxLine) {
            skipping = true;
            scan(carry.subarray(0, carryBytes));
            scan(view.subarray(start, end));
            carryBytes = 0;
          } else if (newline !== -1 && carryBytes === 0) {
            sink.line(decode(view, start, end)); // 조각 하나 안에서 끝난 줄은 복사하지 않고 바로 푼다
            start = newline + 1;
            continue;
          } else if (length > 0) {
            if (carry.length < carryBytes + length) {
              const grown = Buffer.allocUnsafe(Math.min(maxLine, Math.max(carryBytes + length, carry.length * 2)));
              carry.copy(grown, 0, 0, carryBytes);
              carry = grown;
            }
            view.copy(carry, carryBytes, start, end);
            carryBytes += length;
          }
        } else {
          scan(view.subarray(start, end));
        }
        if (newline === -1) break;
        if (skipping) {
          endLong();
          skipping = false;
        } else {
          sink.line(decode(carry, 0, carryBytes));
        }
        carryBytes = 0;
        start = newline + 1;
      }
    },
    finish(): string | null {
      if (skipping) {
        endLong();
        return null;
      }
      return carryBytes > 0 ? decode(carry, 0, carryBytes) : null;
    },
  };
}

export async function readLines(path: string, nowMs: number, sink: LineSink, options: ReadOptions = {}): Promise<ReadOutcome> {
  const maxLine = options.maxLineBytes ?? MAX_LINE_BYTES;
  const chunkSize = options.chunkBytes ?? 1024 * 1024;
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat();
    const sizeAtOpen = opened.size;
    const mtimeMsAtOpen = opened.mtimeMs;
    if (options.afterOpen) await options.afterOpen();

    const buffer = Buffer.allocUnsafe(chunkSize);
    const splitter = lineSplitter(sink, maxLine, options.markers ?? []);
    let position = 0;

    while (position < sizeAtOpen) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(chunkSize, sizeAtOpen - position), position);
      if (bytesRead === 0) break;
      position += bytesRead;
      splitter.push(buffer.subarray(0, bytesRead));
    }

    const tail = splitter.finish();

    const after = await stat(path);
    const inProgress =
      after.size !== sizeAtOpen || after.mtimeMs !== mtimeMsAtOpen || nowMs - mtimeMsAtOpen < IN_PROGRESS_WINDOW_MS;
    // 연 크기까지 다 읽기 전에 파일이 끝났으면(읽는 동안 줄었으면) 그 뒤 크기와 수정 시각이 되돌아와도 진행 중이고, 앞부분만 읽은 것이다
    return { sizeAtOpen, mtimeMsAtOpen, bytesRead: position, tail, inProgress: inProgress || position < sizeAtOpen, endedEarly: position < sizeAtOpen };
  } finally {
    await handle.close();
  }
}
