// 규칙을 못 잰 이유와 그 차례. 이유는 하나만 낸다(순수 함수, 설계 11.4의 1과 2)

/** 앞의 것이 풀려야 뒤의 것을 따질 수 있는 차례다. 한 도구 안에서 까닭이 여럿이면 처음 맞는 것을 낸다 */
export const REASONS = ["unsupported", "unreadable", "not_applicable", "incomplete", "no_data", "too_little", "watching"] as const;
export type Reason = (typeof REASONS)[number];

/** 사용자가 무엇을 하거나 기다리면 풀리는 이유 */
const RESOLVABLE: ReadonlySet<Reason> = new Set(["unreadable", "incomplete", "no_data", "too_little", "watching"]);

const rank = (reason: Reason): number => REASONS.indexOf(reason);

/** 한 도구 안에서(합침 규칙이면 그 규칙에서) 맞는 까닭들 가운데 차례에서 가장 앞선 것. 까닭이 하나도 없으면 부르지 않는다. */
export function firstReason(reasons: readonly Reason[]): Reason {
  if (reasons.length === 0) throw new Error("firstReason needs at least one reason");
  return reasons.reduce((first, reason) => (rank(reason) < rank(first) ? reason : first));
}

/**
 * 도구별 규칙에서 재는 도구가 하나도 없을 때 규칙의 이유. 도구마다의 이유 가운데 하나를 고른다.
 * 풀리는 이유가 하나라도 있으면 그 가운데 차례에서 가장 뒤의 것이다. 한 도구에서만 재도 규칙이 재지므로 재는 데에 가장 가까운 도구의 까닭을 알린다.
 * 풀리는 이유가 없으면 unsupported와 not_applicable 가운데 뒤의 것이다. 점수에 넣는 도구가 하나도 없으면 no_data다.
 */
export function ruleReason(toolReasons: readonly Reason[]): Reason {
  if (toolReasons.length === 0) return "no_data";
  const resolvable = toolReasons.filter((reason) => RESOLVABLE.has(reason));
  const pool = resolvable.length > 0 ? resolvable : toolReasons;
  return pool.reduce((last, reason) => (rank(reason) > rank(last) ? reason : last));
}
