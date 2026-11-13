// 점검의 입력 묶음을 모은다. 기록을 읽고, 셋팅을 스캔하고, 지난 점검까지의 관측 기록을 붙여 core가 받는 모양으로 만든다. 경로의 정규화처럼 순수하지 않은 일은 여기서 끝낸다(설계 7.2, 8, 10 「프로젝트 목록」, 12.1)
import { normalizePath } from "../adapters/claude/locate.ts";
import { claudeObservation, CLAUDE_COVERAGE } from "../adapters/claude/observation.ts";
import { SHELL_TOOLS } from "../adapters/claude/parser.ts";
import { makeWindows } from "../adapters/common/dates.ts";
import { collectClaude, unreadableCount, type ClaudeCollectResult, type EvalClock } from "../collect/claude.ts";
import type { EvaluationInput } from "../core/evaluate.ts";
import type { SelfIdentity } from "../core/installs/candidates.ts";
import type { CollectedTool } from "../core/result/tools.ts";
import { scanClaudeSetup } from "../scan/claude.ts";
import type { ClaudeSetupFacts } from "../scan/types.ts";
import type { StateFile } from "../state/state.ts";

export interface CheckupInputOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 평가 시계. 점검을 시작한 시각과 시간대 */
  clock: EvalClock;
  /** 캐시 폴더. null이면 캐시를 읽지도 쓰지도 않는다 */
  cacheDir: string | null;
  /** 캐시와 수정 시각 거르기를 믿지 않고 모두 다시 읽는다 */
  rescan: boolean;
  /** 지난 점검까지의 상태. 무작위 값은 MCP 서버 정의의 지문에 섞고, 관측 기록은 설치 판정에 쓴다 */
  state: Pick<StateFile, "salt" | "installs">;
  /** 이 도구 자신. 정비 후보에서 뺀다 */
  self: SelfIdentity;
  /** 관리 정책 파일의 폴더. 주지 않으면 OS의 자리다 */
  managedDir?: string;
}

export interface CheckupInput {
  input: EvaluationInput;
  collected: ClaudeCollectResult;
  facts: ClaudeSetupFacts;
  /** 평가 결과에 싣는 수집 결과(도구마다). 캐시를 쓴 파일 수처럼 실행마다 다른 것은 뺐다 */
  tools: CollectedTool[];
}

const CLAUDE_AI_PREFIX = "claude.ai ";

export async function gatherCheckupInput(options: CheckupInputOptions): Promise<CheckupInput> {
  const collected = await collectClaude({ env: options.env, homedir: options.homedir, clock: options.clock, cacheDir: options.cacheDir, rescan: options.rescan });
  const { summaries } = collected;

  // 프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더(세션마다 처음 적힌 것 하나)로 만든다. 하위 세션과 작업 폴더가 없는 세션은 넣지 않는다
  const collectDates = new Set(makeWindows(options.clock.nowMs, options.clock.timeZone).collectDates);
  const cwds = new Set<string>();
  const claudeAiNames = new Set<string>();
  const normalizedCwds: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const summary of summaries) {
    if (summary.cwd !== null) normalizedCwds[summary.cwd] = normalizePath(summary.cwd, options.platform);
    const days = Object.entries(summary.days);
    if (summary.kind === "main" && summary.cwd !== null && days.some(([date, day]) => collectDates.has(date) && day.responses > 0)) cwds.add(summary.cwd);
    // 정의가 PC에 없는 claude.ai 연결은 기록에 남은 이름으로만 알 수 있다
    for (const [, day] of days) {
      for (const name of [...day.loadedMcpServers, ...Object.keys(day.mcpAttributions)]) if (name.startsWith(CLAUDE_AI_PREFIX)) claudeAiNames.add(name);
    }
  }

  const facts = await scanClaudeSetup({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    cwds: [...cwds].sort(),
    claudeAiNames: [...claudeAiNames].sort(),
    salt: options.state.salt,
    ...(options.managedDir === undefined ? {} : { managedDir: options.managedDir }),
  });

  const unreadable = unreadableCount(collected.read);
  const observation = { skills: claudeObservation(summaries, unreadable, "skill"), mcp: claudeObservation(summaries, unreadable, "mcp") };
  const input: EvaluationInput = {
    clock: options.clock,
    tools: [
      {
        tool: "claude-code",
        summaries,
        coverage: CLAUDE_COVERAGE,
        shellTools: [...SHELL_TOOLS].sort(),
        complete: { skills: observation.skills.complete, mcp: observation.mcp.complete },
        setup: facts,
      },
    ],
    projects: facts.projects,
    normalizedCwds: { ...normalizedCwds },
    installs: options.state.installs,
    self: options.self,
  };
  const { fromCache: _fromCache, ...read } = collected.read;
  const tools: CollectedTool[] = [{ tool: "claude-code", detected: collected.detected, visibleFrom: collected.visibleFrom, overlappingSessions: collected.overlappingSessions, read, observation }];
  return { input, collected, facts, tools };
}
