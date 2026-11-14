// 평가 결과와 실행 기록에서 결과 화면이 그리는 칸만 고른다. 평가 결과에 있는 절대 경로(따로 둔 자리의 프로젝트 경로, 알림의 경로, 정밀 점검 단서)는 옮기지 않고, 프로젝트는 폴더 이름으로 옮긴다(순수 함수, 설계 13.1, 19.1, 「3단계 계획 전 결정」의 10번)
import type { LocalDate } from "../adapters/common/dates.ts";
import type { ToolId } from "../adapters/types.ts";
import type { FindingText } from "../core/copy/findings.ts";
import type { ResultText } from "../core/copy/grades.ts";
import type { Lang, Texts } from "../core/copy/lang.ts";
import { daysBefore } from "../core/installs/age.ts";
import type { CountedProblem } from "../core/metrics/setup.ts";
import type { CheckupResult, ResultFinding, UnjudgedServer } from "../core/result/assemble.ts";
import type { ResultUsage } from "../core/result/usage.ts";
import type { AxisScore, Withheld } from "../core/scoreboard.ts";

/** 화면에 그리는 규칙 하나. 문장은 결과 파일의 두 언어 문장 그대로다 */
export interface ViewFinding {
  ruleId: ResultFinding["ruleId"];
  axis: ResultFinding["axis"];
  category: ResultFinding["category"];
  severity: ResultFinding["severity"];
  /** 규칙을 쟀다(점수가 있다) */
  measured: boolean;
  /** 예상 효과. 없으면 null이다 */
  gain: number | null;
  /** 정리할 것의 이름(정비 후보의 대상). 후보의 차례 그대로다 */
  targets: string[];
  /** 규칙은 쟀지만 비율을 못 잰 도구 가운데 후보가 나온 도구(먼저 고칠 것의 덧붙이는 말) */
  unmeasuredTools: ToolId[];
  text: Texts<FindingText>;
}

/** 판정에서 뺀 서버 하나. 프로젝트는 폴더 이름만 옮긴다 */
export interface ViewServer {
  tool: ToolId;
  name: string;
  scope: UnjudgedServer["scope"];
  projectName: string | null;
  why: UnjudgedServer["why"];
  /** 판정을 시작할 수 있는 날까지 남은 날 수(평가 시계의 오늘에서). 날을 모르면 null이다 */
  daysUntil: number | null;
}

export interface ReportView {
  /** 처음 보일 언어 */
  lang: Lang;
  today: LocalDate;
  /** 점수 구간 */
  window: { from: LocalDate; to: LocalDate };
  /** 기록을 찾은 도구 */
  tools: ToolId[];
  /** 이 점검을 상태 폴더에 저장했다 */
  saved: boolean;
  /** 저장한 점검의 회차(이력의 줄 수). 저장하지 않았거나 이력을 세지 못했으면 null이다 */
  round: number | null;
  score: { aq: number | null; grade: string | null; tier: number | null; withheld: Withheld[] };
  /** AQ를 내지 않았다는 알림의 문장. AQ를 냈으면 null이다 */
  withheldText: Texts<string> | null;
  /** 기록을 읽지 못했다는 알림이 있다(점수를 못 낸 화면의 장면 고르기) */
  unreadable: boolean;
  text: Texts<ResultText>;
  axes: AxisScore[];
  /** 결과의 차례 그대로(설계 11.5) */
  findings: ViewFinding[];
  usage: ResultUsage;
  /** 알림의 종류와 문장. AQ를 내지 않았다는 알림은 점수 띠에 따로 보이므로 뺀다 */
  notices: { kind: string; text: Texts<string> }[];
  servers: ViewServer[];
  setupProblems: CountedProblem[];
  /** F3에서 지침이 없다고 센 프로젝트의 폴더 이름 */
  missingInstructions: string[];
  /** F4에서 전역 지침과 가장 많이 겹친 프로젝트의 폴더 이름 */
  worstOverlap: string | null;
  /** 「일부만 읽었다」 띠를 띄울 도구마다 읽지 못한 비율(낼 수 없으면 null)과 그 비율이 아래 경계인지다(설계 9.8, 20.1) */
  partialReads: { tool: ToolId; share: number | null; lowerBound: boolean }[];
}

/** 화면이 결과 파일 밖에서 받는 것. 실행 기록의 저장 여부와 이력의 회차다 */
export interface ReportRun {
  saved: boolean;
  round: number | null;
}

export function reportView(result: CheckupResult, run: ReportRun): ReportView {
  const targetsOf = (finding: ResultFinding): string[] => finding.candidates.map((id) => result.candidates.find((candidate) => candidate.id === id)?.target ?? id);
  const withheld = result.score.aq === null ? (result.notices.find((notice) => notice.kind === "score_withheld")?.text ?? null) : null;
  return {
    lang: result.lang,
    today: result.window.today,
    window: { from: result.window.score.from, to: result.window.score.to },
    tools: result.tools.filter((tool) => tool.detected).map((tool) => tool.tool),
    saved: run.saved,
    round: run.saved ? run.round : null,
    score: { aq: result.score.aq, grade: result.score.grade, tier: result.score.tier, withheld: [...result.score.withheld] },
    withheldText: withheld,
    unreadable: result.notices.some((notice) => notice.kind === "record_unreadable"),
    text: result.text,
    axes: result.axes,
    findings: result.findings.map((finding) => ({
      ruleId: finding.ruleId,
      axis: finding.axis,
      category: finding.category,
      severity: finding.severity,
      measured: finding.status === "scored",
      gain: finding.gain,
      targets: targetsOf(finding),
      unmeasuredTools: finding.tools.filter((value) => value.status === "unmeasured" && value.candidates.length > 0).map((value) => value.tool),
      text: finding.text,
    })),
    usage: result.usage,
    notices: result.notices.filter((notice) => !(notice.kind === "score_withheld" && result.score.aq === null)).map((notice) => ({ kind: notice.kind, text: notice.text })),
    servers: result.details.unjudgedServers.map((server) => ({
      tool: server.tool,
      name: server.name,
      scope: server.scope,
      projectName: server.projectName,
      why: server.why,
      daysUntil: server.judgeFrom === null ? null : daysBefore(server.judgeFrom, result.window.today),
    })),
    setupProblems: result.details.setupProblems,
    missingInstructions: result.details.missingInstructions.map((project) => project.name),
    worstOverlap: result.details.worstOverlap?.name ?? null,
    partialReads: result.coverage.filter((coverage) => coverage.partial).map((coverage) => ({ tool: coverage.tool, share: coverage.unreadableShare, lowerBound: coverage.lowerBound })),
  };
}
