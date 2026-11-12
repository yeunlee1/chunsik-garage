// 기록 파일을 한 줄씩 흘려 읽는다. 연 순간의 크기까지만 읽고, 너무 긴 줄을 가르고, 줄바꿈 없는 끝 조각을 따로 돌려주며, 진행 중인 파일을 알아낸다(설계 9.4)
import { open, stat } from "node:fs/promises";

export const MAX_LINE_BYTES = 16 * 1024 * 1024;
export const IN_PROGRESS_WINDOW_MS = 2000;

export interface LineSink {
  /** 줄바꿈으로 끝난 줄. 끝의 \r은 뗐다. */
  line(text: string): void;
  /** 상한을 넘은 줄 하나. 풀지 않고 센다. */
  tooLong(): void;
}

export interface ReadOutcome {
  sizeAtOpen: number;
  mtimeMsAtOpen: number;
  bytesRead: number;
  /** 파일 끝의 줄바꿈 없는 조각. 없거나 상한을 넘었으면 null이다. */
  tail: string | null;
  /** 읽는 동안 크기나 수정 시각이 바뀌었거나, 수정 시각이 평가 시각에서 2초 안쪽이다. */
  inProgress: boolean;
}

export interface ReadOptions {
  maxLineBytes?: number;
  chunkBytes?: number;
  /** 시험용. 파일을 연 직후에 부른다. */
  afterOpen?: () => Promise<void>;
}

/** 버퍼의 [start, end)를 UTF-8로 푼다. 끝의 \r은 뗀다. */
function decode(buffer: Buffer, start: number, end: number): string {
  return buffer.toString("utf8", start, end > start && buffer[end - 1] === 0x0d ? end - 1 : end);
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
    // 읽은 조각을 넘는 줄만 여기에 모은다. 필요할 때 두 배씩, 상한까지만 키우고 파일 하나 동안 다시 쓴다.
    let carry = Buffer.allocUnsafe(Math.min(maxLine, 64 * 1024));
    let carryBytes = 0;
    let skipping = false; // 상한을 넘은 줄의 나머지를 줄바꿈까지 버리는 중이다
    let position = 0;

    while (position < sizeAtOpen) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(chunkSize, sizeAtOpen - position), position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const view = buffer.subarray(0, bytesRead);
      let start = 0;
      for (;;) {
        const newline = view.indexOf(0x0a, start);
        const end = newline === -1 ? view.length : newline;
        if (!skipping) {
          const length = end - start;
          if (carryBytes + length > maxLine) {
            skipping = true;
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
        }
        if (newline === -1) break;
        if (skipping) {
          sink.tooLong();
          skipping = false;
        } else {
          sink.line(decode(carry, 0, carryBytes));
        }
        carryBytes = 0;
        start = newline + 1;
      }
    }

    let tail: string | null = null;
    if (skipping) sink.tooLong();
    else if (carryBytes > 0) tail = decode(carry, 0, carryBytes);

    const after = await stat(path);
    const inProgress =
      after.size !== sizeAtOpen || after.mtimeMs !== mtimeMsAtOpen || nowMs - mtimeMsAtOpen < IN_PROGRESS_WINDOW_MS;
    return { sizeAtOpen, mtimeMsAtOpen, bytesRead: position, tail, inProgress };
  } finally {
    await handle.close();
  }
}
