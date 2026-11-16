// E5와 E6이 함께 쓰는 것. 켜져 있는 설치와 판정을 세어 못 재는 까닭의 차례 3~7을 보고 값을 낸다(순수 함수, 설계 11.3 「못 재는 까닭의 차례」)
import { scored, unmeasured, type Evidence, type Measurement } from "../measure.ts";
import type { Verdict } from "./verdict.ts";

/** 켜져 있는 설치(스킬 묶음이나 서버) 하나를 세는 데 쓰는 것 */
export interface Counted {
  verdict: Verdict;
  /** 구조상 판정할 수 없다. 지켜봐도 판정되지 않으므로 판정할 수 있는 대상에서 뺀다 */
  structural: boolean;
}

/** 근거 숫자. 켜져 있는 것, 판정할 수 있는 대상, 판정된 것, 구조상 판정할 수 없어 뺀 것, 안 쓴 것이 확인된 것, 쓴 것(설계 12.2) */
export const BLANK_INSTALL_EVIDENCE: Evidence = { enabled: null, judgeable: null, judged: null, structural: null, unused: null, used: null };

/**
 * 켜져 있는 설치들로 규칙을 잰다. 못 재는 까닭은 아래 차례로 보고 처음 맞는 것을 낸다(1과 2는 부르는 쪽이 먼저 본다).
 * 3 켜져 있는 설치가 없다. 4 판정할 수 있는 대상이 없다. 5 관측이 빠짐없지 않다. 6 판정할 수 있는 대상이 최소 개수에 못 미친다.
 * 7 판정된 것이 판정할 수 있는 대상의 절반에 못 미치거나 최소 개수에 못 미친다. 분모는 판정된 것의 수라서 no_data를 쓰지 않는다.
 */
export function measureInstalls(enabled: readonly Counted[], complete: boolean, minimum: number): Measurement {
  const structural = enabled.filter((item) => item.structural).length;
  const judgeable = enabled.length - structural;
  const used = enabled.filter((item) => !item.structural && item.verdict === "used").length;
  const unused = enabled.filter((item) => !item.structural && item.verdict === "unused").length;
  const judged = used + unused;
  const evidence = { enabled: enabled.length, judgeable, judged, structural, unused, used };
  if (enabled.length === 0) return unmeasured("not_applicable", evidence);
  if (judgeable === 0) return unmeasured("unsupported", evidence);
  if (!complete) return unmeasured("incomplete", evidence);
  // 6과 7을 가르는 것은 지켜보면 풀리는지다. 대상이 모자라면 모두 판정돼도 분모가 모자란다
  if (judgeable < minimum) return unmeasured("too_little", evidence);
  if (judged * 2 < judgeable || judged < minimum) return unmeasured("watching", evidence);
  return scored(unused / judged, evidence);
}
