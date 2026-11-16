// 시험에서 평가의 입력 묶음을 손으로 짓는 도구. 평가 시계는 2026-11-13 12:00(서울)이다
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { CODEX_SHELL_TOOLS } from "../../src/adapters/codex/parser.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
import type { EvaluationInput, ToolInput } from "../../src/core/evaluate.ts";
import { NO_SELF } from "../../src/core/installs/candidates.ts";
import type { ClaudeSetupFacts, CodexSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { codexFacts, facts } from "./facts.ts";
import { summary, type SummaryInput } from "./summaries.ts";

/** 점수 구간은 10-15부터 11-13까지, 수집 구간은 10-10부터다. 14일 넘게 전은 10-29와 그 앞이다 */
export const CLOCK = { nowMs: Date.UTC(2026, 10, 13, 3, 0), timeZone: "Asia/Seoul" };

export interface ClaudeToolInput {
  sessions?: SummaryInput[];
  setup?: Partial<ClaudeSetupFacts>;
  coverage?: ToolCoverage;
  complete?: Partial<ToolInput["complete"]>;
}

/** Claude Code 하나의 입력. 관측은 빠짐없고 셸 명령 도구는 Bash와 PowerShell이다 */
export function claudeTool(input: ClaudeToolInput = {}): ToolInput {
  return {
    tool: "claude-code",
    summaries: (input.sessions ?? []).map((session) => summary(session)),
    coverage: input.coverage ?? CLAUDE_COVERAGE,
    shellTools: ["Bash", "PowerShell"],
    complete: { skills: true, mcp: true, ...input.complete },
    setup: facts(input.setup),
  };
}

export interface CodexToolInput {
  sessions?: SummaryInput[];
  setup?: Partial<CodexSetupFacts>;
  coverage?: ToolCoverage;
  complete?: Partial<ToolInput["complete"]>;
}

/** Codex 하나의 입력. 스킬 관측은 늘 빠짐없지 않고(Codex는 스킬 사용을 기록하지 않는다) MCP 관측은 빠짐없다. 셸 명령 도구는 Codex의 것이다 */
export function codexTool(input: CodexToolInput = {}): ToolInput {
  return {
    tool: "codex",
    summaries: (input.sessions ?? []).map((session) => summary(session)),
    coverage: input.coverage ?? CODEX_COVERAGE,
    shellTools: [...CODEX_SHELL_TOOLS],
    complete: { skills: false, mcp: true, ...input.complete },
    setup: codexFacts(input.setup),
  };
}

/** 같은 정체로 9월 1일부터 지켜본 관측 기록. 정체가 없는 서버는 적지 않는다 */
export function watched(...installs: (SkillFact | McpFact)[]): InstallRecord[] {
  return installs.flatMap((install) => (install.installKey === null ? [] : [{ key: install.installKey, firstSeen: "2026-09-01", appeared: false }]));
}

/** 입력 묶음. 프로젝트 목록은 Claude Code 도구의 셋팅 사실의 것이고(그 도구가 없으면 비었다), 세션의 작업 폴더는 이미 정규화한 꼴로 적은 것으로 본다. 관측 기록을 주지 않으면 첫 점검이다 */
export function evaluationInput(tools: ToolInput[], input: Partial<Omit<EvaluationInput, "tools">> = {}): EvaluationInput {
  const claude = tools.find((tool) => tool.tool === "claude-code");
  const projects = input.projects ?? (claude?.tool === "claude-code" ? claude.setup.projects : []);
  return {
    clock: CLOCK,
    tools,
    projects,
    normalizedCwds: Object.fromEntries(projects.flatMap((project) => project.cwds.map((cwd) => [cwd, cwd]))),
    installs: null,
    self: NO_SELF,
    ...input,
  };
}
