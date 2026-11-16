// 도구 버전 문자열을 세 숫자로 읽어 견주고, 여럿 가운데 가장 높은 것을 고른다(순수 함수, 설계 9.3)
export type Version = readonly [number, number, number];

export function parseVersion(text: unknown): Version | null {
  if (typeof text !== "string") return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    const diff = a[i]! - b[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

export function formatVersion(version: Version): string {
  return `${version[0]}.${version[1]}.${version[2]}`;
}

/** 읽을 수 있는 버전 가운데 가장 높은 것. 하나도 없으면 null(버전 모름)이다. */
export function maxVersion(values: Iterable<unknown>): string | null {
  let best: Version | null = null;
  for (const value of values) {
    const version = parseVersion(value);
    if (version !== null && (best === null || compareVersions(version, best) > 0)) best = version;
  }
  return best === null ? null : formatVersion(best);
}
