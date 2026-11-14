// 입력 묶음에서 평가를 낸다. 규칙 스물둘을 재고 설치를 판정해 점수판으로 묶는다. 입력 묶음이 같으면 결과는 글자 하나 다르지 않다(순수 함수, 설계 9.3, 12.1, 12.2)
import { makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import type { SessionSummary, ToolCoverage, ToolId } from "../adapters/types.ts";
import type { ClaudeSetupFacts, ProjectFact } from "../scan/types.ts";
import type { InstallRecord } from "../state/state.ts";
import { candidatesOf, type Candidate, type SelfIdentity } from "./installs/candidates.ts";
import { sessionListings } from "./installs/listing.ts";
import { judgeServers, type JudgedServer } from "./installs/servers.ts";
import { calledMcpNames, usedSkillNames } from "./installs/signals.ts";
import { judgeSkills, type SkillBundle } from "./installs/skills.ts";
import { recordMap } from "./installs/verdict.ts";
import { fitToolRules, mergedFitRules, type MissingInstructions, type WorstOverlap } from "./metrics/fit.ts";
import { intensityRules } from "./metrics/intensity.ts";
import { highestMainVersion, mergedSetupRules, setupToolRules, type CountedProblem, type ToolSafeguard, type ToolSetup } from "./metrics/setup.ts";
import { usageRules } from "./metrics/usage.ts";
import { projectLookup, projectUsage, type NormalizedCwds, type ProjectUsage } from "./projects.ts";
import { RULES_VERSION } from "./rules.ts";
import { overall, scoreboard, type AxisScore, type Finding, type Overall, type ToolMeasured } from "./scoreboard.ts";
import { toolTotals, type ToolTotals } from "./totals.ts";

/** 도구 하나의 입력. 어댑터와 스캐너가 낸 것이다 */
export interface ToolInput {
  tool: ToolId;
  /** 날짜별 세션 요약(주 세션과 하위 세션) */
  summaries: readonly SessionSummary[];
  /** 지표마다 이 도구가 그것을 기록하는지 */
  coverage: ToolCoverage;
  /** 셸 명령 도구의 이름. 도구 오류(E2)에서 뺀다 */
  shellTools: readonly string[];
  /** 스킬 사용과 MCP 호출의 관측이 빠짐없는지(설계 9.8) */
  complete: { skills: boolean; mcp: boolean };
  setup: ClaudeSetupFacts;
}

/** 입력 묶음(설계 12.1). 평가 시계와 경로의 정규화처럼 순수하지 않은 것은 조립하는 쪽이 미리 해서 넣는다 */
export interface EvaluationInput {
  /** 평가 시계. 점검을 시작한 시각과 시간대 */
  clock: { nowMs: number; timeZone: string };
  tools: readonly ToolInput[];
  /** 프로젝트 목록(도구를 합친 것) */
  projects: readonly ProjectFact[];
  /** 세션의 작업 폴더(기록에 적힌 그대로) → 정규화한 경로 */
  normalizedCwds: NormalizedCwds;
  /** 지난 점검까지의 설치마다의 관측 기록. null이면 첫 점검이다 */
  installs: readonly InstallRecord[] | null;
  /** 이 도구 자신. 정비 후보에서 뺀다 */
  self: SelfIdentity;
}

export interface ToolEvaluation {
  tool: ToolId;
  /** 점수에 넣는 도구다(점수 구간에 응답이 하나라도 있다) */
  scored: boolean;
  /** 달력에 넣는 도구다(수집 구간에 응답이 하나라도 있다) */
  inCalendar: boolean;
  totals: ToolTotals;
  /** 판정한 스킬 묶음과 서버. 점수에 넣지 않는 도구의 설치는 판정하지 않아 비어 있다 */
  skills: SkillBundle[];
  servers: JudgedServer[];
}

export interface Evaluation {
  rulesVersion: string;
  windows: { today: LocalDate; score: { from: LocalDate; to: LocalDate }; collect: { from: LocalDate; to: LocalDate } };
  /** 도구 식별자의 차례 */
  tools: ToolEvaluation[];
  score: Overall;
  axes: AxisScore[];
  /** 설계 11.5의 차례 */
  findings: Finding[];
  candidates: Candidate[];
  /** S2의 근거. 점수에 넣는 도구마다 안전장치가 있는지와 인정된 조건 */
  safeguards: ToolSafeguard[];
  /** F3에서 지침이 없다고 센 프로젝트 */
  missingInstructions: MissingInstructions[];
  /** F4에서 전역 지침과 가장 많이 겹친 프로젝트 지침 */
  worstOverlap: WorstOverlap | null;
  /** S3가 센 문제(위치와 종류) */
  setupProblems: CountedProblem[];
  /** 점수 구간에 주 세션이 있었던 프로젝트 */
  projects: ProjectUsage;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const span = (dates: readonly LocalDate[]): { from: LocalDate; to: LocalDate } => ({ from: dates[0]!, to: dates[dates.length - 1]! });

export function evaluate(input: EvaluationInput): Evaluation {
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const day = { today: windows.today, timeZone: input.clock.timeZone };
  const lookup = projectLookup(input.projects, input.normalizedCwds);
  const records = recordMap(input.installs);

  const all = [...input.tools].sort((a, b) => byText(a.tool, b.tool)).map((tool) => ({ input: tool, totals: toolTotals(tool.summaries, windows, tool.shellTools) }));
  // 점수에 넣는 도구에서만 규칙을 재고 설치를 판정한다. 관측 기록은 이것과 상관없이 부르는 쪽이 적는다
  const scored = all.filter((tool) => tool.totals.responses > 0);
  const setups = scored.map((tool): ToolSetup => ({ tool: tool.input.tool, totals: tool.totals, coverage: tool.input.coverage, setup: tool.input.setup, highestVersion: highestMainVersion(tool.input.summaries) }));
  const usage = projectUsage(setups, lookup);

  const judged = scored.map((tool, index) => {
    const setup = setups[index]!;
    const { summaries } = tool.input;
    const base = { day, windows, records };
    const skills = judgeSkills(setup, { ...base, used: usedSkillNames(summaries, windows), listings: sessionListings(summaries, "skill", input.normalizedCwds, lookup), complete: tool.input.complete.skills });
    const servers = judgeServers(setup, { ...base, used: calledMcpNames(summaries, windows), listings: sessionListings(summaries, "mcp", input.normalizedCwds, lookup), complete: tool.input.complete.mcp });
    const candidates = candidatesOf(setup, skills, servers, day, input.self);
    const measured: ToolMeasured = {
      tool: setup.tool,
      responses: setup.totals.responses,
      rules: { ...usageRules(setup.totals, setup.coverage), ...setupToolRules(setup), ...fitToolRules(setup), E5: skills.measurement, E6: servers.measurement },
      candidates,
    };
    return { tool: setup.tool, skills: skills.bundles, servers: servers.servers, candidates, measured };
  });

  const { S1, S2, S3, safeguards, setupProblems } = mergedSetupRules(setups);
  const { F3, F4, F6, missingInstructions, worstOverlap } = mergedFitRules(setups, usage);
  const board = scoreboard({ merged: { S1, S2, S3, F3, F4, F6, ...intensityRules(setups, usage) }, tools: judged.map((tool) => tool.measured) });

  const humanRequests = scored.reduce((sum, tool) => sum + tool.totals.humanRequests, 0);
  const activeDays = new Set(scored.flatMap((tool) => tool.totals.activeDates)).size;
  const judgedByTool = new Map(judged.map((tool) => [tool.tool, tool]));

  return {
    rulesVersion: RULES_VERSION,
    windows: { today: windows.today, score: span(windows.scoreDates), collect: span(windows.collectDates) },
    tools: all.map((tool): ToolEvaluation => {
      const own = judgedByTool.get(tool.input.tool);
      return { tool: tool.input.tool, scored: tool.totals.responses > 0, inCalendar: tool.totals.collectResponses > 0, totals: tool.totals, skills: own?.skills ?? [], servers: own?.servers ?? [] };
    }),
    score: overall(board.axes, humanRequests, activeDays),
    axes: board.axes,
    findings: board.findings,
    candidates: judged.flatMap((tool) => tool.candidates),
    safeguards,
    missingInstructions,
    worstOverlap,
    setupProblems,
    projects: usage,
  };
}
