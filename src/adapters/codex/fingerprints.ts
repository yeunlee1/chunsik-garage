// Codex 기록의 지문을 캐시에 넣는 목록으로 바꾸고 되돌리며, 기록 파일 여럿의 지문을 합치고, 요약이 기대는 뺄 지문(부모 세션의 기록과 같은 세션의 앞 기록)과의 겹침을 지문 하나(sharedDigest)로 줄인다(설계 9.4, 12.2, 「5단계 계획 전 결정」 7번)
import { createHash } from "node:crypto";
import type { CodexFingerprints } from "./parser.ts";

const KINDS = ["itemIds", "callIds", "totals", "responseIds"] as const;
const PRINT = /^[0-9a-f]{16}$/;
const DIGEST = /^[0-9a-f]{64}$/;

/** 지문을 종류마다 차례로 늘어놓은 목록. 캐시 파일에 그대로 쓴다 */
export type FingerprintLists = Record<(typeof KINDS)[number], string[]>;

/** 캐시의 Codex 칸. 자기 기록의 지문 목록과, 해석할 때 뺀 지문 가운데 이 기록에도 있던 것의 지문이다 */
export interface CodexCacheExtra {
  fingerprints: FingerprintLists;
  sharedDigest: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function toLists(prints: CodexFingerprints): FingerprintLists {
  return { itemIds: [...prints.itemIds].sort(), callIds: [...prints.callIds].sort(), totals: [...prints.totals].sort(), responseIds: [...prints.responseIds].sort() };
}

/** 캐시에서 꺼낸 목록을 지문으로 되돌린다. 네 종류가 다 있고 모두 지문 꼴의 글자 목록일 때만 되돌린다 */
export function fromLists(value: unknown): CodexFingerprints | null {
  if (!isObject(value)) return null;
  const out: Record<string, Set<string>> = {};
  for (const kind of KINDS) {
    const list = value[kind];
    if (!Array.isArray(list) || !list.every((print) => typeof print === "string" && PRINT.test(print))) return null;
    out[kind] = new Set(list as string[]);
  }
  return { itemIds: out.itemIds!, callIds: out.callIds!, totals: out.totals!, responseIds: out.responseIds! };
}

/** 기록 파일 여럿의 지문을 합친다. 해석기에 뺄 지문(부모 세션의 기록들과 같은 세션의 앞 기록들)으로 넘긴다 */
export function unionOf(list: readonly CodexFingerprints[]): CodexFingerprints {
  const merge = (kind: (typeof KINDS)[number]): Set<string> => new Set(list.flatMap((prints) => [...prints[kind]]));
  return { itemIds: merge("itemIds"), callIds: merge("callIds"), totals: merge("totals"), responseIds: merge("responseIds") };
}

/**
 * 뺄 지문 가운데 이 기록의 지문에도 있는 것을 종류마다 차례로 이어 해시한다. 해석기는 자기 지문이 뺄 지문에 드는지만 보므로,
 * 기록이 그대로이고 이 값이 같으면 요약도 같다. 뺄 지문이 없으면 겹침이 없는 것과 같다
 */
export function sharedDigest(own: CodexFingerprints, inherited: CodexFingerprints | null): string {
  const hash = createHash("sha256");
  for (const kind of KINDS) {
    const shared = inherited === null ? [] : [...own[kind]].filter((print) => inherited[kind].has(print)).sort();
    hash.update(`${kind}:${shared.join(",")};`);
  }
  return hash.digest("hex");
}

/** 캐시에서 꺼낸 Codex 칸을 되살린다. 모양이 다르면 null이다 */
export function reviveCodexExtra(value: unknown): CodexCacheExtra | null {
  if (!isObject(value) || typeof value.sharedDigest !== "string" || !DIGEST.test(value.sharedDigest)) return null;
  const prints = fromLists(value.fingerprints);
  return prints === null ? null : { fingerprints: toLists(prints), sharedDigest: value.sharedDigest };
}
