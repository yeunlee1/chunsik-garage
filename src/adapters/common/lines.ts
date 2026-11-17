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

export function lineSplitter(sink: LineSink, maxLine: number = MAX_LINE_BYTES, markers: readonly LineMarker[] = []): LineSplitter {
  // 읽은 조각을 넘는 줄만 여기에 모은다. 필요할 때 두 배씩, 상한까지만 키우고 파일 하나 동안 다시 쓴다.
  let carry = Buffer.allocUnsafe(Math.min(maxLine, 64 * 1024));
  let carryBytes = 0;
  let skipping = false; // 상한을 넘은 줄의 나머지를 줄바꿈까지 버리는 중이다
  // 상한을 넘은 줄을 버리면서 표지를 훑는다. 조각 경계에 걸친 표지를 찾으려고 앞 조각의 끝을 표지 길이만큼 남긴다
  const longest = markers.reduce((most, marker) => Math.max(most, marker.bytes.length), 0);
  let found = new Set<string>();
  let edge = Buffer.alloc(0);
  const scan = (piece: Buffer): void => {
    if (markers.length === 0 || piece.length === 0) return;
    const joined = edge.length > 0 ? Buffer.concat([edge, piece]) : piece;
    for (const marker of markers) if (!found.has(marker.name) && joined.indexOf(marker.bytes) !== -1) found.add(marker.name);
    edge = Buffer.from(joined.subarray(Math.max(0, joined.length - (longest - 1))));
  };
  const endLong = (): void => {
    sink.tooLong(found);
    found = new Set();
    edge = Buffer.alloc(0);
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
