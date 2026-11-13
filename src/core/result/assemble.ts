// 평가와 수집 결과에서 평가 결과(결과 파일에 저장하는 것)를 조립한다. 입력 묶음이 같으면 글자 하나 다르지 않다. 문장과 잰 값의 단위는 4부(문구)가 더한다(순수 함수, 설계 12.1, 12.2, 13.1)
import { makeWindows } from "../../adapters/common/dates.ts";
import type { Coverage, ToolId } from "../../adapters/types.ts";
import type { McpFact } from "../../scan/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { Candidate } from "../installs/candidates.ts";
import { anyIn, calledMcpNames } from "../installs/signals.ts";
import type { MissingInstructions, WorstOverlap } from "../metrics/fit.ts";
import type { ToolSafeguard } from "../metrics/setup.ts";
import type { AxisScore, Finding, Overall, ToolRuleId, ToolValue } from "../scoreboard.ts";
import { resultCoverage, type ResultCoverage } from "./coverage.ts";
import { deepHints, type DeepHint } from "./hints.ts";
import { recordNotices, setupNotices, sortNotices, type Notice } from "./notices.ts";
import { observedOf } from "./observed.ts";
import { resultTools, type CollectedTool, type ResultTool } from "./tools.ts";
import { resultUsage, type ResultUsage } from "./usage.ts";

/** 평가 결과 파일의 형식 버전 */
export const RESULT_SCHEMA = 1;

/** 평가 결과의 입력. 입력 묶음(설계 12.1)과, 그것으로 낸 평가와 수집 결과다. 실행 입력은 상태 파일이 깨졌는지뿐이다 */
export interface ResultInput {
  input: EvaluationInput;
  evaluation: Evaluation;
  collected: readonly CollectedTool[];
  appVersion: string;
  run: { stateBroken: boolean };
}

export type ResultToolValue = ToolValue & { observed: Coverage };
export type ResultFinding = Omit<Finding, "tools"> & { tools: ResultToolValue[] };

/** 판정에서 뺀 켜진 서버 가운데 부른 기록이 없는 것(E6 항목의 정보, 설계 13.1) */
export interface UnjudgedServer {
  tool: ToolId;
  name: string;
  scope: McpFact["scope"];
  projectRoot: string | null;
  pluginId: string | null;
  /** no_definition은 정의가 PC에 없거나 읽지 못한 것, plugin_unread는 정의를 읽지 못한 플러그인의 것, not_established는 아직 지켜보는 중인 것, observation_incomplete는 관측이 빠짐없지 않은 것이다 */
  why: "no_definition" | "plugin_unread" | "not_established" | "observation_incomplete";
}

export interface CheckupResult {
  schema: typeof RESULT_SCHEMA;
  rulesVersion: string;
  appVersion: string;
  /** 평가 시계(ISO) */
  evaluatedAt: string;
  timezone: string;
  window: Evaluation["windows"];
  tools: ResultTool[];
  coverage: ResultCoverage[];
  score: Overall;
  axes: AxisScore[];
  findings: ResultFinding[];
  candidates: Candidate[];
  usage: ResultUsage;
  deepHints: DeepHint[];
  notices: Notice[];
  /** 규칙의 근거 가운데 따로 둔 것과 결과 화면이 그리는 이름 목록 */
  details: {
    safeguards: ToolSafeguard[];
    missingInstructions: MissingInstructions[];
    worstOverlap: WorstOverlap | null;
    unjudgedServers: UnjudgedServer[];
  };
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** 이름 목록의 범위 차례(설계 11.5 「차례」) */
const SCOPE_ORDER: readonly McpFact["scope"][] = ["user", "local", "project", "plugin", "claude-ai"];

function unjudgedServers(input: EvaluationInput, evaluation: Evaluation): UnjudgedServer[] {
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const servers: UnjudgedServer[] = [];
  for (const tool of evaluation.tools) {
    const source = input.tools.find((item) => item.tool === tool.tool)!;
    const called = calledMcpNames(source.summaries, windows);
    for (const judged of tool.servers) {
      const { server } = judged;
      if (!server.enabled || judged.verdict !== "unknown" || anyIn(server.recordNames, called.inCollect)) continue;
      const why = judged.excluded ?? (source.complete.mcp ? "not_established" : "observation_incomplete");
      servers.push({ tool: tool.tool, name: server.name, scope: server.scope, projectRoot: server.projectRoot, pluginId: server.pluginId, why });
    }
  }
  return servers.sort((a, b) => byText(a.name, b.name) || SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) || byText(a.projectRoot ?? "", b.projectRoot ?? "") || byText(a.pluginId ?? "", b.pluginId ?? "") || byText(a.tool, b.tool));
}

export function checkupResult(source: ResultInput): CheckupResult {
  const { input, evaluation, collected } = source;
  const coverageByTool = new Map(input.tools.map((tool) => [tool.tool, tool.coverage]));
  const findings = evaluation.findings.map((finding): ResultFinding => ({
    ...finding,
    tools: finding.tools.map((value) => ({ ...value, observed: observedOf(finding.ruleId as ToolRuleId, coverageByTool.get(value.tool)!) })),
  }));
  return {
    schema: RESULT_SCHEMA,
    rulesVersion: evaluation.rulesVersion,
    appVersion: source.appVersion,
    evaluatedAt: new Date(input.clock.nowMs).toISOString(),
    timezone: input.clock.timeZone,
    window: evaluation.windows,
    tools: resultTools(input, evaluation, collected),
    coverage: resultCoverage(input, collected),
    score: evaluation.score,
    axes: evaluation.axes,
    findings,
    candidates: evaluation.candidates,
    usage: resultUsage(input, evaluation, collected),
    deepHints: deepHints(input),
    notices: sortNotices([...recordNotices(input, evaluation, collected), ...setupNotices(input, evaluation, source.run)]),
    details: { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation) },
  };
}
