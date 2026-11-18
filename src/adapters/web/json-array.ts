// 맨 바깥이 배열인 큰 JSON을 조각으로 받아 원소를 하나씩 글로 낸다. 메모리에는 원소 하나만 둔다. 원소의 뜻은 보지 않는다(설계 「0.5.0에서 정한 것」)

export interface ArraySink {
  /** 원소 하나의 글(UTF-8로 푼 것) */
  element(text: string): void;
  /** 상한보다 커서 버린 원소 하나 */
  tooLong(): void;
}

export interface ArrayEnd {
  /** 맨 바깥 배열이 닫혔다. 거짓이면 파일이 중간에 끊긴 것이다 */
  closed: boolean;
  /** 맨 바깥이 배열이 아니었다(첫 글자가 [가 아니다) */
  notArray: boolean;
}

const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const isSpace = (byte: number): boolean => byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;

type State = "start" | "between" | "element" | "done" | "notArray";

/**
 * 글자 단위로 깊이와 문자열 안인지를 따라가며 원소의 경계를 찾는다. 따옴표, 역빗금, 괄호는 모두 ASCII라 UTF-8의 여러 바이트 글자 안에 나오지 않는다.
 * 원소가 상한을 넘으면 모은 조각을 버리고 경계만 계속 따라간다
 */
export class JsonArraySplitter {
  private state: State = "start";
  private depth = 0;
  private inString = false;
  private escaped = false;
  /** 원소가 괄호 없는 값(수, 문자열, 참거짓)이다 */
  private bare = false;
  private parts: Buffer[] = [];
  private size = 0;
  private dropped = false;
  private bom = 0;

  constructor(
    private readonly sink: ArraySink,
    private readonly maxElementBytes: number,
  ) {}

  push(chunk: Buffer): void {
    let index = 0;
    // 맨 앞의 UTF-8 BOM(EF BB BF)은 건너뛴다. 조각 경계에 걸쳐도 센다
    while (this.state === "start" && this.bom < 3 && index < chunk.length && chunk[index] === [0xef, 0xbb, 0xbf][this.bom]) {
      this.bom++;
      index++;
    }
    let elementStart = -1;
    for (; index < chunk.length; index++) {
      const byte = chunk[index]!;
      switch (this.state) {
        case "start":
          if (isSpace(byte)) continue;
          if (byte === OPEN_BRACKET) this.state = "between";
          else {
            this.state = "notArray";
            return;
          }
          continue;
        case "between":
          if (isSpace(byte) || byte === COMMA) continue;
          if (byte === CLOSE_BRACKET) {
            this.state = "done";
            return;
          }
          this.state = "element";
          this.depth = 0;
          this.inString = false;
          this.escaped = false;
          this.bare = byte !== OPEN_BRACE && byte !== OPEN_BRACKET;
          this.parts = [];
          this.size = 0;
          this.dropped = false;
          elementStart = index;
          // 첫 글자도 아래에서 같은 규칙으로 따진다
          index--;
          continue;
        case "element": {
          if (this.inString) {
            if (this.escaped) this.escaped = false;
            else if (byte === BACKSLASH) this.escaped = true;
            else if (byte === QUOTE) this.inString = false;
            continue;
          }
          if (byte === QUOTE) {
            this.inString = true;
            continue;
          }
          if (this.bare) {
            if (byte === COMMA || byte === CLOSE_BRACKET || isSpace(byte)) {
              this.finishElement(chunk, elementStart, index);
              elementStart = -1;
              this.state = byte === CLOSE_BRACKET ? "done" : "between";
              if (this.state === "done") return;
            }
            continue;
          }
          if (byte === OPEN_BRACE || byte === OPEN_BRACKET) this.depth++;
          else if (byte === CLOSE_BRACE || byte === CLOSE_BRACKET) {
            this.depth--;
            if (this.depth === 0) {
              this.finishElement(chunk, elementStart, index + 1);
              elementStart = -1;
              this.state = "between";
            }
          }
          continue;
        }
        case "done":
        case "notArray":
          return;
      }
    }
    if (this.state === "element") this.keep(chunk, elementStart === -1 ? 0 : elementStart, chunk.length);
  }

  /** 파일이 끝났다. 닫히지 않은 원소는 내지 않는다 */
  end(): ArrayEnd {
    return { closed: this.state === "done", notArray: this.state === "notArray" || this.state === "start" };
  }

  private keep(chunk: Buffer, from: number, to: number): void {
    if (this.dropped || to <= from) return;
    this.size += to - from;
    if (this.size > this.maxElementBytes) {
      this.dropped = true;
      this.parts = [];
      return;
    }
    // 조각을 복사해 둔다. 들어온 조각은 부르는 쪽이 다시 쓸 수 있다
    this.parts.push(Buffer.from(chunk.subarray(from, to)));
  }

  private finishElement(chunk: Buffer, from: number, to: number): void {
    this.keep(chunk, from === -1 ? 0 : from, to);
    if (this.dropped) this.sink.tooLong();
    else this.sink.element(Buffer.concat(this.parts, this.size).toString("utf8"));
    this.parts = [];
    this.size = 0;
    this.dropped = false;
  }
}
