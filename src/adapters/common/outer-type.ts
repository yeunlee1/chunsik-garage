// 깨졌거나 잘린 JSON 줄에서 맨 바깥 객체의 type 값을, 처음부터 중첩을 따라가며 온전히 읽힐 때만 꺼낸다(순수 함수, 설계 9.8)
const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
const LITERAL = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/;

export function outerTypeOf(text: string): string | null {
  const n = text.length;
  let i = 0;

  const skipWhitespace = (): void => {
    while (i < n) {
      const code = text.charCodeAt(i);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) i++;
      else break;
    }
  };

  // i가 여는 따옴표에 있을 때 문자열 하나를 읽는다. 닫는 따옴표까지 읽히지 않으면 null이다.
  const readString = (keep: boolean): string | null => {
    i++;
    let out = "";
    while (i < n) {
      const ch = text[i]!;
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\\") {
        if (i + 1 >= n) return null;
        const escape = text[i + 1]!;
        if (escape === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
          if (keep) out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          continue;
        }
        const simple = SIMPLE_ESCAPES[escape];
        if (simple === undefined) return null;
        if (keep) out += simple;
        i += 2;
        continue;
      }
      if (keep) out += ch;
      i++;
    }
    return null;
  };

  // 값 하나를 건너뛴다. 잘렸거나 모양이 틀리면 false다.
  const skipValue = (): boolean => {
    skipWhitespace();
    if (i >= n) return false;
    const ch = text[i]!;
    if (ch === '"') return readString(false) !== null;
    if (ch === "{" || ch === "[") {
      let depth = 0;
      while (i < n) {
        const c = text[i]!;
        if (c === '"') {
          if (readString(false) === null) return false;
          continue;
        }
        if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            i++;
            return true;
          }
        }
        i++;
      }
      return false;
    }
    const literal = LITERAL.exec(text.slice(i, i + 400));
    if (literal === null) return false;
    i += literal[0].length;
    skipWhitespace();
    return i < n; // 값 뒤에 무엇이 더 와야 잘리지 않은 값이다
  };

  skipWhitespace();
  if (text[i] !== "{") return null;
  i++;
  for (;;) {
    skipWhitespace();
    if (i >= n || text[i] !== '"') return null;
    const key = readString(true);
    if (key === null) return null;
    skipWhitespace();
    if (text[i] !== ":") return null;
    i++;
    skipWhitespace();
    if (key === "type") return text[i] === '"' ? readString(true) : null;
    if (!skipValue()) return null;
    skipWhitespace();
    if (text[i] === ",") {
      i++;
      continue;
    }
    return null; // type 없이 끝났거나 모양이 틀렸다
  }
}
