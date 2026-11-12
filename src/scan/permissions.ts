// 전역(사용자 설정)과 한 프로젝트(프로젝트 설정과 로컬 설정)의 권한 규칙이 글자 그대로 부딪히는 쌍의 수를 센다. 규칙의 글은 세고 버린다(순수 함수, 설계 11.3 F6)
export interface RuleLists {
  allow: readonly string[];
  deny: readonly string[];
}

/**
 * 같은 규칙 문자열을 한쪽은 허용에, 다른 쪽은 금지에 둔 쌍의 수.
 * - 전역 쪽은 사용자 설정만이다. 관리 정책의 규칙은 견주지 않는다.
 * - 프로젝트 쪽은 프로젝트 설정과 로컬 설정을 합친다. 같은 규칙이 둘에 다 있어도 한 쌍이다.
 * - 프로젝트 설정과 로컬 설정끼리 부딪히는 것은 세지 않는다.
 */
export function conflictPairs(user: RuleLists, project: RuleLists | null, local: RuleLists | null): number {
  const projectAllow = new Set([...(project?.allow ?? []), ...(local?.allow ?? [])]);
  const projectDeny = new Set([...(project?.deny ?? []), ...(local?.deny ?? [])]);
  let pairs = 0;
  for (const rule of new Set(user.allow)) if (projectDeny.has(rule)) pairs++;
  for (const rule of new Set(user.deny)) if (projectAllow.has(rule)) pairs++;
  return pairs;
}
