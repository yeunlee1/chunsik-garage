// 도구별 값의 관측 범위를 정한다. 규칙마다 재는지를 가르는 지표(설계 9.7의 표의 줄)를 두고, 그 도구가 그 지표를 봤는지(봄, 대신 봄, 못 봄) 가운데 가장 약한 것을 낸다(순수 함수, 설계 9.7, 12.2)
import type { Coverage, CoverageKey, ToolCoverage } from "../../adapters/types.ts";
import type { ToolRuleId } from "../scoreboard.ts";

/**
 * 도구별 규칙마다 재는지를 가르는 지표. 규칙이 그 지표를 못 보면 그 도구에서 unsupported가 된다(시험이 실제 규칙과 맞춘다).
 * F5는 셋팅으로 재고 기록의 지표를 쓰지 않는다. E5와 E6의 판정에 쓰는 실린 이름은 이 표에 없다. 그것을 못 봐도 규칙은 재기 때문이다(Codex는 스캐너의 목록으로 대신한다. 5단계)
 */
export const RULE_METRICS: Record<ToolRuleId, readonly CoverageKey[]> = {
  S4: ["mcpFailuresAndHooks"],
  S5: ["mcpFailuresAndHooks"],
  E1: ["responsesAndTokens"],
  E2: ["toolErrors"],
  E3: ["autoCompaction"],
  E4: ["instructionSize"],
  E5: ["skillUsage"],
  E6: ["mcpCalls"],
  E7: ["deniedAndLengthStops", "interruptedTurns"],
  F1: ["effort"],
  F2: ["subagents", "autoCompaction"],
  F5: [],
};

const STRENGTH: Record<Coverage, number> = { unsupported: 0, proxy: 1, measured: 2 };

/** 그 규칙이 쓰는 지표를 그 도구가 봤는지. 지표가 여럿이면 가장 약한 것이고, 지표를 쓰지 않는 규칙은 봄이다 */
export function observedOf(rule: ToolRuleId, coverage: ToolCoverage): Coverage {
  return RULE_METRICS[rule].reduce<Coverage>((weakest, key) => (STRENGTH[coverage[key]] < STRENGTH[weakest] ? coverage[key] : weakest), "measured");
}
