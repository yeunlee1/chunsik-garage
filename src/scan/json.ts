// 설정·정의 JSON을 다루는 순수 도구. 열쇠를 차례대로 세운 글(같은 내용이면 같은 글)을 만들고, 너무 깊게 중첩된 값은 읽지 못한 것으로 돌려준다(설계 11.3 정의의 지문, 20.1)

/** 이보다 깊게 중첩된 값은 정규화하지 않는다. 깊은 재귀로 스캐너 전체가 멈추지 않게 하려는 것이다. */
export const MAX_JSON_DEPTH = 64;

type Json = Record<string, unknown>;
export const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** 열쇠를 차례대로 세운 JSON 글. 같은 내용이면 열쇠의 차례와 상관없이 같은 글이다. 깊이가 MAX_JSON_DEPTH를 넘으면 null이다. */
export function canonicalJson(value: unknown, depth = 0): string | null {
  if (depth > MAX_JSON_DEPTH) return null;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const part = canonicalJson(item, depth + 1);
      if (part === null) return null;
      parts.push(part);
    }
    return `[${parts.join(",")}]`;
  }
  if (isObject(value)) {
    const parts: string[] = [];
    for (const key of Object.keys(value).sort()) {
      const part = canonicalJson(value[key], depth + 1);
      if (part === null) return null;
      parts.push(`${JSON.stringify(key)}:${part}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
