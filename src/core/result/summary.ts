// 평가 결과에서 터미널에 전할 요약을 만든다. 표준 출력으로 AI에게 가므로 절대 경로와 비밀값은 넣지 않는다. 고칠 대상의 이름(서버, 프로젝트 폴더, 설정의 위치)과 비밀값의 자리는 사용자가 「고쳐 줘」라고 했을 때 AI가 쓸 수 있게 싣는다(0.3.0). 문장은 결과의 언어 하나로 싣는다(순수 함수, 설계 11.5, 12.3, 13.2, 15, 19.1, 「0.3.0에서 정한 것」)
import type { ToolId } from "../../adapters/types.ts";
import { AXIS_NAMES, SUMMARY_COPY, TOOL_NAMES } from "../copy/common.ts";
import { joinValue, ruleValueText } from "../copy/findings.ts";
import { fill } from "../copy/format.ts";
import type { Lang } from "../copy/lang.ts";
import { ruleSpec, type Axis, type RuleId, type ValueKind } from "../rules.ts";
import type { NextGrade } from "../next-grade.ts";
import type { Withheld } from "../scoreboard.ts";
import { settleScore, type Grade } from "../score.ts";
import type { CheckupResult, ResultFinding, SecretPlace } from "./assemble.ts";
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
  /**
   * 고칠 대상의 이름(0.3.0, 다른 PC 피드백 2번). S3은 문제의 위치, S5는 연결에 실패한 서버(실패한 세션이 많은 차례), F3은 지침이 없는 프로젝트,
   * F4는 전역 지침과 가장 많이 겹친 프로젝트, 정비 후보가 있는 규칙은 후보의 이름이다. 값과 절대 경로는 넣지 않는다
   */
  targets: string[];
  /** 지금 잰 값과 규칙 점수(0~1). 못 쟀으면 null이다 */
  value: number | null;
  score: number | null;
  /** 규칙의 0점 기준과 만점 기준(0.3.0, 다른 PC 피드백 4번) */
  zeroAt: number;
  fullAt: number;
}

/** 덧붙이는 말에 쓰는 것 */
export type FixDetailInput = Pick<SummaryFix, "ruleId" | "axis" | "gain" | "measured" | "candidates" | "unmeasuredTools" | "value" | "score">;

/** 이름과 경로를 뺀 알림. detail은 정해진 값(지표, 무엇을 읽지 못했는지, 세지 않은 까닭)이고 count는 대상의 수다 */
export interface SummaryNotice {
  kind: Notice["kind"];
  tool: ToolId | null;
  detail: string | null;
  count: number | null;
}

/** 요약의 문장(결과의 언어). 모델은 이 문장을 그대로 옮기고 숫자를 바꾸거나 더하지 않는다(설계 15) */
export interface SummaryText {
  /** 등급의 별명. AQ를 내지 않았으면 null이다 */
  grade: string | null;
  /** 진단 한 줄 */
  diagnosis: string;
  /** 가장 잘하는 것의 제목과 덧붙이는 말(규칙 이름과 잰 값). 없으면 null이다 */
  best: { title: string; detail: string } | null;
  /** 가장 잘하는 것이 없을 때의 문장 */
  noBest: string | null;
  /** 먼저 고칠 것마다 제목과 덧붙이는 말(fixFirst와 같은 차례) */
  fixFirst: { title: string; detail: string }[];
  /** 먼저 고칠 것이 없을 때의 문장 */
  noFixFirst: string | null;
  /** 다음 등급까지 할 일의 한 문장(0.2.0). 없으면 null이다 */
  nextGrade: string | null;
  /** 설정에 그대로 적힌 비밀값의 자리 수(두 도구를 더한 것)의 한 문장(0.2.0). 없으면 null이다 */
  credentials: string | null;
  /** 알림의 문장(notices와 같은 차례) */
  notices: string[];
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
  /** 다음 등급까지 할 일(규칙과 숫자만). AQ가 없거나 S등급이면 null이다 */
  nextGrade: NextGrade | null;
  notices: SummaryNotice[];
  /** 설정에 그대로 적힌 비밀값의 자리(서버와 항목의 이름, 0.3.0). 값은 없다 */
  credentialPlaces: SecretPlace[];
  /** 사용자가 그대로 두기로 한 규칙(0.3.0). 먼저 고칠 것과 다음 등급 차례에 없다 */
  ignored: RuleId[];
  /** 결과 화면의 경로. 결과 화면을 만들지 않았으면 null */
  reportPath: string | null;
  lang: Lang;
  text: SummaryText;
}

function summaryNotice(notice: Notice): SummaryNotice {
  const tool = "tool" in notice ? notice.tool : null;
  switch (notice.kind) {
    case "score_withheld":
    case "state_reset":
      return { kind: notice.kind, tool, detail: null, count: null };
    case "credentials_in_config":
      return { kind: notice.kind, tool, detail: null, count: notice.places.length };
    case "record_unreadable":
      return { kind: notice.kind, tool, detail: null, count: notice.files.length + notice.dirs.length };
    case "record_skipped":
    case "record_partial":
      return { kind: notice.kind, tool, detail: null, count: notice.files.length };
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
    case "unverified_inheritance":
    case "parent_record_missing":
    case "merged_sessions":
    case "unknown_mtime_sessions":
      return { kind: notice.kind, tool, detail: null, count: notice.sessions };
    case "unclassified":
    case "id_fallbacks":
      return { kind: notice.kind, tool, detail: null, count: notice.counts.reduce((sum, item) => sum + item.count, 0) };
    case "skipped_copies":
    case "unnamed_files":
      return { kind: notice.kind, tool, detail: null, count: notice.count };
  }
}

/** 지금 값이 0점 기준보다 나쁘다(같으면 조금만 고쳐도 오르므로 거짓이다, 0.3.0) */
export function beyondZeroMark(ruleId: RuleId, value: number): boolean {
  const spec = ruleSpec(ruleId);
  const now = settleScore(value);
  const mark = settleScore(spec.zeroAt);
  return spec.zeroAt > spec.fullAt ? now > mark : now < mark;
}

/**
 * 먼저 고칠 것의 덧붙이는 말. 결과 화면의 진단 띠도 같은 말을 쓴다. 규칙 점수가 0이고 지금 값이 0점 기준보다 나쁘면 조금 고쳐서는 오르지 않으므로
 * 지금 값과 점수가 오르기 시작하는 값(0점 기준)을 함께 적는다(0.3.0, 다른 PC 피드백 4번)
 */
export function fixDetail(fix: FixDetailInput, lang: Lang): string {
  const copy = SUMMARY_COPY[lang];
  if (fix.gain !== null) {
    const spec = ruleSpec(fix.ruleId);
    if (fix.value !== null && fix.score !== null && settleScore(fix.score) === 0 && beyondZeroMark(fix.ruleId, fix.value)) {
      const template = spec.zeroAt > spec.fullAt ? copy.gainBelow : copy.gainAbove;
      return fill(template, { axis: AXIS_NAMES[fix.axis][lang], gain: fix.gain, now: ruleValueText(fix.ruleId, fix.value, lang), start: ruleValueText(fix.ruleId, spec.zeroAt, lang) });
    }
    return fill(copy.gain, { axis: AXIS_NAMES[fix.axis][lang], gain: fix.gain });
  }
  if (!fix.measured) return fill(copy.unmeasured, { candidates: fix.candidates });
  if (fix.unmeasuredTools.length > 0) return fill(copy.otherTools, { candidates: fix.candidates, tools: fix.unmeasuredTools.map((tool) => TOOL_NAMES[tool][lang]).join(", ") });
  return fill(copy.candidates, { candidates: fix.candidates });
}

/** 고칠 대상의 이름(SummaryFix.targets). 같은 이름은 한 번만 싣는다 */
function targetsOf(finding: ResultFinding, result: CheckupResult): string[] {
  const names = (() => {
    switch (finding.ruleId) {
      case "S3":
        return result.details.setupProblems.map((problem) => problem.place);
      case "S5":
        return result.details.failedMcpServers.map((server) => server.name);
      case "F3":
        return result.details.missingInstructions.map((project) => project.name);
      case "F4":
        return result.details.worstOverlap === null ? [] : [result.details.worstOverlap.name];
      default:
        return finding.candidates.map((id) => result.candidates.find((candidate) => candidate.id === id)?.target ?? id);
    }
  })();
  return [...new Set(names)];
}

export function checkupSummary(result: CheckupResult, reportPath: string | null): CheckupSummary {
  const lang = result.lang;
  const secretCount = result.notices.reduce((sum, notice) => sum + (notice.kind === "credentials_in_config" ? notice.places.length : 0), 0);
  const strength = result.findings.find((finding) => finding.category === "strength") ?? null;
  // AQ를 내지 않았으면 먼저 고칠 것을 보이지 않는다. 칸은 그대로 두고 비운다. 빈 목록의 문장(noFixFirst)은 결과의 것 그대로라 정비할 것이 실제로 없을 때만 있다(설계 12.3, 「3단계 계획 전 결정」의 6번)
  // 사용자가 그대로 두기로 한 규칙은 먼저 고칠 것에서 뺀다(0.3.0, 다른 PC 피드백 5번)
  const ignored = new Set(result.ignored);
  const repairs = result.score.aq === null ? [] : result.findings.filter((finding) => finding.category === "repair" && !ignored.has(finding.ruleId)).slice(0, FIX_FIRST_LIMIT);
  const fixFirst = repairs.map((finding): SummaryFix => ({
    ruleId: finding.ruleId,
    axis: finding.axis,
    gain: finding.gain,
    measured: finding.status === "scored",
    candidates: finding.candidates.length,
    unmeasuredTools: finding.tools.filter((value) => value.status === "unmeasured" && value.candidates.length > 0).map((value) => value.tool),
    targets: targetsOf(finding, result),
    value: finding.value,
    score: finding.score,
    zeroAt: ruleSpec(finding.ruleId).zeroAt,
    fullAt: ruleSpec(finding.ruleId).fullAt,
  }));
  return {
    aq: result.score.aq,
    grade: result.score.grade,
    tier: result.score.tier,
    withheld: [...result.score.withheld],
    axes: result.axes.map((axis) => ({ axis: axis.axis, score: axis.score })),
    best: strength === null ? null : { ruleId: strength.ruleId, axis: strength.axis, kind: strength.kind, value: strength.value! },
    fixFirst,
    nextGrade: result.nextGrade === null ? null : { grade: result.nextGrade.grade, need: result.nextGrade.need, reaches: result.nextGrade.reaches, steps: result.nextGrade.steps.map((step) => ({ ...step })) },
    notices: result.notices.map(summaryNotice),
    credentialPlaces: result.details.credentialPlaces.map((place) => ({ ...place })),
    ignored: [...result.ignored],
    reportPath,
    lang,
    text: {
      grade: result.text[lang].grade,
      diagnosis: result.text[lang].diagnosis,
      best: strength === null ? null : { title: strength.text[lang].title, detail: fill(SUMMARY_COPY[lang].best, { name: strength.text[lang].name, value: joinValue(strength.text[lang].value!, strength.text[lang].unit!, lang) }) },
      noBest: result.text[lang].noStrengths,
      fixFirst: repairs.map((finding, index) => ({ title: finding.text[lang].title, detail: fixDetail(fixFirst[index]!, lang) })),
      noFixFirst: result.text[lang].noRepairs,
      nextGrade: result.nextGrade?.text[lang] ?? null,
      credentials: secretCount === 0 ? null : fill(SUMMARY_COPY[lang].credentials, { count: secretCount }),
      notices: result.notices.map((notice) => notice.text[lang]),
    },
  };
}
