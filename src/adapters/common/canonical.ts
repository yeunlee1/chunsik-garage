// 이름을 열쇠로 쓰는 기록을 원형 없는 객체로 만들고, 열쇠를 사전순으로 다시 세워 같은 내용이면 늘 같은 JSON이 나오게 한다(순수 함수)

/** 이름(스킬·서버·도구·모델 등)을 열쇠로 쓰는 빈 기록. 원형이 없어서 `constructor`, `toString`, `__proto__` 같은 이름도 보통 열쇠다. */
export function nameRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  const out = nameRecord<T>();
  for (const key of Object.keys(record).sort()) out[key] = record[key]!;
  return out;
}
