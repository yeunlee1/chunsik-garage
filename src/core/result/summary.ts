// 평가 결과에서 터미널에 전할 요약을 만든다. 표준 출력으로 AI에게 가므로 스킬·서버·프로젝트의 이름과 경로를 넣지 않는다. 문장은 4부(문구)가 이 재료로 만든다(순수 함수, 설계 11.5, 12.3, 15, 19.1)
import type { ToolId } from "../../adapters/types.ts";
import type { Axis, RuleId, ValueKind } from "../rules.ts";
import type { Withheld } from "../scoreboard.ts";
import type { Grade } from "../score.ts";
import type { CheckupResult } from "./assemble.ts";
import type { Notice } from "./notices.ts";

/** 먼저 고칠 것을 이만큼까지 싣는다 */
export const FIX_FIRST_LIMIT = 3;

export interface SummaryFix {
  ruleId: RuleId;
  axis: Axis;
  /** 예상 효과. 없으면 null이고 덧붙이는 말은 후보의 수로 만든다(설계 11.5 「터미널의 요약에 실릴 때」) */
  gain: number | null;
  /** 규칙을 쟀다. 거짓이면 "비율은 잴 수 없음"이다 */
  measured: boolean;
  /** 정비 후보의 수 */
  candidates: number;
  /** 후보가 나왔는데 비율을 못 잰 도구. 규칙은 다른 도구로 쟀을 때 "{도구}의 비율은 잴 수 없음"이다 */
  unmeasuredTools: ToolId[];
}

/** 이름과 경로를 뺀 알림. detail은 정해진 값(지표, 무엇을 읽지 못했는지, 세지 않은 까닭)이고 count는 대상의 수다 */
export interface SummaryNotice {
  kind: Notice["kind"];
  tool: ToolId | null;
  detail: string | null;
  count: number | null;
}

export interface CheckupSummary {
  aq: number | null;
  grade: Grade | null;
  tier: 1 | 2 | 3 | 4 | 5 | null;
  withheld: Withheld[];
  axes: { axis: Axis; score: number | null }[];
  /** 가장 잘하는 것(잘하고 있는 것의 첫 항목). 없으면 null */
  best: { ruleId: RuleId; axis: Axis; kind: ValueKind; value: number } | null;
  fixFirst: SummaryFix[];
  notices: SummaryNotice[];
  /** 결과 화면의 경로. 결과 화면을 만들지 않았으면 null */
  reportPath: string | null;
}

function summaryNotice(notice: Notice): SummaryNotice {
  const tool = "tool" in notice ? notice.tool : null;
  switch (notice.kind) {
    case "score_withheld":
    case "state_reset":
      return { kind: notice.kind, tool, detail: null, count: null };
    case "record_unreadable":
      return { kind: notice.kind, tool, detail: null, count: notice.files.length + notice.dirs.length };
    case "observation_incomplete":
      return { kind: notice.kind, tool, detail: notice.metric, count: null };
    case "setup_unreadable":
      return { kind: notice.kind, tool, detail: notice.what, count: notice.targets.length > 0 ? notice.targets.length : null };
    case "plugins_uncounted":
      return { kind: notice.kind, tool, detail: notice.why, count: notice.plugins.length };
    case "setup_problems_unscored":
      return { kind: notice.kind, tool, detail: null, count: notice.problems.length };
    case "projects_gone":
      return { kind: notice.kind, tool, detail: null, count: notice.projects.length };
    case "version_unverified":
      return { kind: notice.kind, tool, detail: null, count: notice.versions.length };
    case "weak_human_requests":
      return { kind: notice.kind, tool, detail: null, count: notice.weak };
    case "overlapping_responses":
    case "orphan_subsessions":
      return { kind: notice.kind, tool, detail: null, count: notice.sessions };
    case "unclassified":
      return { kind: notice.kind, tool, detail: null, count: notice.counts.reduce((sum, item) => sum + item.count, 0) };
  }
}

export function checkupSummary(result: CheckupResult, reportPath: string | null): CheckupSummary {
  const strength = result.findings.find((finding) => finding.category === "strength") ?? null;
  const fixFirst = result.findings
    .filter((finding) => finding.category === "repair")
    .slice(0, FIX_FIRST_LIMIT)
    .map((finding): SummaryFix => ({
      ruleId: finding.ruleId,
      axis: finding.axis,
      gain: finding.gain,
      measured: finding.status === "scored",
      candidates: finding.candidates.length,
      unmeasuredTools: finding.tools.filter((value) => value.status === "unmeasured" && value.candidates.length > 0).map((value) => value.tool),
    }));
  return {
    aq: result.score.aq,
    grade: result.score.grade,
    tier: result.score.tier,
    withheld: [...result.score.withheld],
    axes: result.axes.map((axis) => ({ axis: axis.axis, score: axis.score })),
    best: strength === null ? null : { ruleId: strength.ruleId, axis: strength.axis, kind: strength.kind, value: strength.value! },
    fixFirst,
    notices: result.notices.map(summaryNotice),
    reportPath,
  };
}
