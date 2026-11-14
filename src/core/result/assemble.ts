// 평가와 수집 결과에서 평가 결과(결과 파일에 저장하는 것)를 조립한다. 입력 묶음이 같으면 글자 하나 다르지 않다. 규칙, 알림, 결과 전체에 두 언어의 문장을 싣는다(순수 함수, 설계 12.1, 12.2, 13.1, 13.2)
import { makeWindows, type LocalDate } from "../../adapters/common/dates.ts";
import type { Coverage, ToolId } from "../../adapters/types.ts";
import { findingText, type FindingText } from "../copy/findings.ts";
import { resultText, type ResultText } from "../copy/grades.ts";
import type { Lang, Texts } from "../copy/lang.ts";
import { noticeText } from "../copy/notices.ts";
import type { McpFact } from "../../scan/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { Candidate } from "../installs/candidates.ts";
import { anyIn, calledMcpNames } from "../installs/signals.ts";
import type { MissingInstructions, WorstOverlap } from "../metrics/fit.ts";
import type { CountedProblem, ToolSafeguard } from "../metrics/setup.ts";
import type { AxisScore, Finding, Overall, ToolRuleId, ToolValue } from "../scoreboard.ts";
import { resultCoverage, type ResultCoverage } from "./coverage.ts";
import { deepHints, type DeepHint } from "./hints.ts";
import { recordNotices, setupNotices, sortNotices, type Notice } from "./notices.ts";
import { observedOf } from "./observed.ts";
import { resultTools, type CollectedTool, type ResultTool } from "./tools.ts";
import { resultUsage, type ResultUsage } from "./usage.ts";

/** 평가 결과 파일의 형식 버전 */
export const RESULT_SCHEMA = 1;

/** 평가 결과의 입력. 입력 묶음(설계 12.1)과, 그것으로 낸 평가와 수집 결과다. 언어는 처음 보일 언어다. 실행 입력은 상태 파일이 깨졌는지뿐이다 */
export interface ResultInput {
  input: EvaluationInput;
  evaluation: Evaluation;
  collected: readonly CollectedTool[];
  appVersion: string;
  lang: Lang;
  run: { stateBroken: boolean };
}

export type ResultToolValue = ToolValue & { observed: Coverage };
/** 규칙 하나. 문장은 지원하는 두 언어 모두 싣는다. 결과 화면이 한 파일에서 언어를 바꾼다(설계 13.2) */
export type ResultFinding = Omit<Finding, "tools"> & { tools: ResultToolValue[]; text: Texts<FindingText> };
/** 알림 하나와 그 문장 */
export type ResultNotice = Notice & { text: Texts<string> };

/** 판정에서 뺀 켜진 서버 가운데 부른 기록이 없는 것(E6 항목의 정보, 설계 13.1) */
export interface UnjudgedServer {
  tool: ToolId;
  name: string;
  scope: McpFact["scope"];
  projectRoot: string | null;
  /** projectRoot의 프로젝트 폴더 이름(ProjectFact.name). 프로젝트의 것이 아니면 null이다. 결과 화면은 경로 대신 이것을 보인다(설계 19.1) */
  projectName: string | null;
  pluginId: string | null;
  /** no_definition은 정의가 PC에 없거나 읽지 못한 것, plugin_unread는 정의를 읽지 못한 플러그인의 것, not_established는 아직 지켜보는 중인 것, observation_incomplete는 관측이 빠짐없지 않은 것이다 */
  why: "no_definition" | "plugin_unread" | "not_established" | "observation_incomplete";
  /** 지켜보는 중인 서버(not_established)를 판정할 수 있게 되는 날. 그날의 점검부터 판정한다. 날을 모르거나 다른 까닭이면 null이다(설계 12.1의 예외, 13.1) */
  judgeFrom: LocalDate | null;
}

export interface CheckupResult {
  schema: typeof RESULT_SCHEMA;
  rulesVersion: string;
  appVersion: string;
  /** 평가 시계(ISO) */
  evaluatedAt: string;
  timezone: string;
  /** 처음 보일 언어. 터미널 요약도 이 언어다(설계 13.2) */
  lang: Lang;
  window: Evaluation["windows"];
  tools: ResultTool[];
  coverage: ResultCoverage[];
  score: Overall;
  /** 등급의 별명, 진단, 빈 목록의 문장 */
  text: Texts<ResultText>;
  axes: AxisScore[];
  findings: ResultFinding[];
  candidates: Candidate[];
  usage: ResultUsage;
  deepHints: DeepHint[];
  notices: ResultNotice[];
  /** 규칙의 근거 가운데 따로 둔 것과 결과 화면이 그리는 이름 목록 */
  details: {
    safeguards: ToolSafeguard[];
    missingInstructions: MissingInstructions[];
    worstOverlap: WorstOverlap | null;
    unjudgedServers: UnjudgedServer[];
    /** S3가 센 문제의 도구, 종류, 위치(절대 경로가 아니다). 결과 화면이 S3 항목에 보인다 */
    setupProblems: CountedProblem[];
  };
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const textsOf = <T>(make: (lang: Lang) => T): Texts<T> => ({ en: make("en"), ko: make("ko") });
/** 이름 목록의 범위 차례(설계 11.5 「차례」) */
const SCOPE_ORDER: readonly McpFact["scope"][] = ["user", "local", "project", "plugin", "claude-ai"];

function unjudgedServers(input: EvaluationInput, evaluation: Evaluation): UnjudgedServer[] {
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const names = new Map(input.projects.map((project) => [project.normRoot, project.name]));
  const servers: UnjudgedServer[] = [];
  for (const tool of evaluation.tools) {
    const source = input.tools.find((item) => item.tool === tool.tool)!;
    const called = calledMcpNames(source.summaries, windows);
    for (const judged of tool.servers) {
      const { server } = judged;
      if (!server.enabled || judged.verdict !== "unknown" || anyIn(server.recordNames, called.inCollect)) continue;
      const why = judged.excluded ?? (source.complete.mcp ? "not_established" : "observation_incomplete");
      const projectName = server.projectRoot === null ? null : (names.get(server.projectRoot) ?? null);
      servers.push({ tool: tool.tool, name: server.name, scope: server.scope, projectRoot: server.projectRoot, projectName, pluginId: server.pluginId, why, judgeFrom: why === "not_established" ? judged.judgeFrom : null });
    }
  }
  return servers.sort((a, b) => byText(a.name, b.name) || SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) || byText(a.projectRoot ?? "", b.projectRoot ?? "") || byText(a.pluginId ?? "", b.pluginId ?? "") || byText(a.tool, b.tool));
}

export function checkupResult(source: ResultInput): CheckupResult {
  const { input, evaluation, collected } = source;
  const coverageByTool = new Map(input.tools.map((tool) => [tool.tool, tool.coverage]));
  const details = { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation), setupProblems: evaluation.setupProblems };
  const findings = evaluation.findings.map((finding): ResultFinding => {
    const source = { ...finding, tools: finding.tools.map((value) => ({ ...value, observed: observedOf(finding.ruleId as ToolRuleId, coverageByTool.get(value.tool)!) })) };
    return { ...source, text: textsOf((lang) => findingText(source, details, lang)) };
  });
  const notices = sortNotices([...recordNotices(input, evaluation, collected), ...setupNotices(input, evaluation, source.run)]);
  const categories = findings.map((finding) => finding.category);
  return {
    schema: RESULT_SCHEMA,
    rulesVersion: evaluation.rulesVersion,
    appVersion: source.appVersion,
    evaluatedAt: new Date(input.clock.nowMs).toISOString(),
    timezone: input.clock.timeZone,
    lang: source.lang,
    window: evaluation.windows,
    tools: resultTools(input, evaluation, collected),
    coverage: resultCoverage(input, collected),
    score: evaluation.score,
    text: textsOf((lang) => resultText(evaluation.score, categories, lang)),
    axes: evaluation.axes,
    findings,
    candidates: evaluation.candidates,
    usage: resultUsage(input, evaluation, collected),
    deepHints: deepHints(input),
    notices: notices.map((notice): ResultNotice => ({ ...notice, text: textsOf((lang) => noticeText(notice, lang)) })),
    details,
  };
}
