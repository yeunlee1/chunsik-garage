// 정체가 같은 설치의 사실을 하나로 묶는다. 스캐너가 같은 플러그인을 두 길로 찾으면 그 플러그인이 넣은 서버의 사실이 둘 온다. 설치는 하나다(순수 함수, 설계 11.3 「설치의 정체」)

/**
 * 정체 열쇠가 같은 것끼리 묶는다. 묶음과 그 안의 차례는 받은 차례 그대로다.
 * 열쇠가 null이면(정체를 만들 수 없다) 같은 설치인지 견줄 수 없으므로 그것만으로 한 묶음이다.
 */
export function sameInstall<T>(items: readonly T[], keyOf: (item: T) => string | null): T[][] {
  const byKey = new Map<string, T[]>();
  const groups: T[][] = [];
  for (const item of items) {
    const key = keyOf(item);
    const group = key === null ? undefined : byKey.get(key);
    if (group !== undefined) {
      group.push(item);
      continue;
    }
    const fresh = [item];
    groups.push(fresh);
    if (key !== null) byKey.set(key, fresh);
  }
  return groups;
}
