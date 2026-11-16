// 문자열의 64비트 FNV-1a 지문(16자리 16진수)을 만든다. 같은 값인지 견주는 데만 쓰고 원문은 되살릴 수 없다(순수 함수)
const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;
const encoder = new TextEncoder();

export function fnv1a64(text: string): string {
  let hash = OFFSET;
  for (const byte of encoder.encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}
