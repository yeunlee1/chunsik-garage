// 점검의 입력 묶음을 모은다. 두 도구의 기록을 읽고, 셋팅을 스캔하고, 지난 점검까지의 관측 기록을 붙여 core가 받는 모양으로 만든다. 경로의 정규화처럼 순수하지 않은 일은 여기서 끝낸다(설계 7.2, 8, 10 「프로젝트 목록」, 12.1, 「5단계 3부 계획 전 결정」 2·3번)
import { normalizePath } from "../adapters/claude/locate.ts";
import { claudeObservation, CLAUDE_COVERAGE, type Observation } from "../adapters/claude/observation.ts";
import { SHELL_TOOLS } from "../adapters/claude/parser.ts";
import { CODEX_COVERAGE, codexMcpObservation } from "../adapters/codex/observation.ts";
import { CODEX_SHELL_TOOLS } from "../adapters/codex/parser.ts";
import { makeWindows } from "../adapters/common/dates.ts";
import { collectClaude, unreadableCount, type ClaudeCollectResult, type ClaudeReadStats, type EvalClock } from "../collect/claude.ts";
import { codexUnreadableCount, collectCodex, type CodexCollectResult, type CodexReadStats } from "../collect/codex.ts";
import type { EvaluationInput } from "../core/evaluate.ts";
import type { SelfIdentity } from "../core/installs/candidates.ts";
import type { CollectedTool } from "../core/result/tools.ts";
import { scanClaudeSetup } from "../scan/claude.ts";
import { scanCodexSetup } from "../scan/codex.ts";
import type { ClaudeSetupFacts, CodexSetupFacts } from "../scan/types.ts";
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
  /** 도구마다 모은 기록 */
  collected: { claude: ClaudeCollectResult; codex: CodexCollectResult };
  /** 도구마다의 셋팅 사실. 관측 기록을 고칠 때 쓴다 */
  facts: { claude: ClaudeSetupFacts; codex: CodexSetupFacts };
  /** 평가 결과에 싣는 수집 결과(도구마다). 캐시를 쓴 파일 수처럼 실행마다 다른 것은 뺐다 */
  tools: CollectedTool[];
}

const CLAUDE_AI_PREFIX = "claude.ai ";

/** Codex는 스킬 사용을 기록하지 않아 스킬의 관측은 늘 빠짐없지 않다. 그 까닭의 문장은 4부가 정한다(설계 「5단계 2부 계획 전 결정」 6번, 「5단계 3부 계획 전 결정」 2·13번) */
const CODEX_SKILL_OBSERVATION: Observation = { complete: false, reasons: [] };

/** 결과에 싣는 Codex의 읽은 양. Claude Code와 같은 칸만 싣는다. Codex에만 있는 칸(건너뛴 압축 파일, 일부만 읽은 파일)은 4부가 잇는다(「5단계 3부 계획 전 결정」 13번) */
function codexSharedRead(read: CodexReadStats): Omit<ClaudeReadStats, "fromCache"> {
  return {
    files: read.files,
    listedBytes: read.listedBytes,
    bytes: read.bytes,
    inProgress: read.inProgress,
    olderThanWindow: read.olderThanWindow,
    unreadableFiles: read.unreadableFiles,
    unreadableFileBytes: read.unreadableFileBytes,
    unknownSizeFiles: read.unknownSizeFiles,
    unreadableDirs: read.unreadableDirs,
  };
}

export async function gatherCheckupInput(options: CheckupInputOptions): Promise<CheckupInput> {
  const collectOptions = { env: options.env, homedir: options.homedir, clock: options.clock, cacheDir: options.cacheDir, rescan: options.rescan };
  const claude = await collectClaude(collectOptions);
  const codex = await collectCodex(collectOptions);

  // 프로젝트 목록은 두 도구의 주 세션 가운데 수집 구간에 응답이 있는 것의 작업 폴더(세션마다 처음 적힌 것 하나)로 만든다. 하위 세션과 작업 폴더가 없는 세션은 넣지 않는다
  const collectDates = new Set(makeWindows(options.clock.nowMs, options.clock.timeZone).collectDates);
  const cwds = new Set<string>();
  const normalizedCwds: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const summary of [...claude.summaries, ...codex.summaries]) {
    if (summary.cwd !== null) normalizedCwds[summary.cwd] = normalizePath(summary.cwd, options.platform);
    if (summary.kind === "main" && summary.cwd !== null && Object.entries(summary.days).some(([date, day]) => collectDates.has(date) && day.responses > 0)) cwds.add(summary.cwd);
  }
  // 정의가 PC에 없는 claude.ai 연결은 Claude Code 기록에 남은 이름으로만 알 수 있다
  const claudeAiNames = new Set<string>();
  for (const summary of claude.summaries) {
    for (const day of Object.values(summary.days)) {
      for (const name of [...day.loadedMcpServers, ...Object.keys(day.mcpAttributions)]) if (name.startsWith(CLAUDE_AI_PREFIX)) claudeAiNames.add(name);
    }
  }

  const sortedCwds = [...cwds].sort();
  const claudeFacts = await scanClaudeSetup({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    cwds: sortedCwds,
    claudeAiNames: [...claudeAiNames].sort(),
    salt: options.state.salt,
    ...(options.managedDir === undefined ? {} : { managedDir: options.managedDir }),
  });
  const codexFacts = await scanCodexSetup({ env: options.env, homedir: options.homedir, tmpdir: options.tmpdir, platform: options.platform, cwds: sortedCwds, salt: options.state.salt });

  const claudeUnreadable = unreadableCount(claude.read);
  const claudeObserved = { skills: claudeObservation(claude.summaries, claudeUnreadable, "skill"), mcp: claudeObservation(claude.summaries, claudeUnreadable, "mcp") };
  const codexObserved = { skills: CODEX_SKILL_OBSERVATION, mcp: codexMcpObservation(codex.summaries, codexUnreadableCount(codex.read)) };
  const input: EvaluationInput = {
    clock: options.clock,
    tools: [
      {
        tool: "claude-code",
        summaries: claude.summaries,
        coverage: CLAUDE_COVERAGE,
        shellTools: [...SHELL_TOOLS].sort(),
        complete: { skills: claudeObserved.skills.complete, mcp: claudeObserved.mcp.complete },
        setup: claudeFacts,
      },
      {
        tool: "codex",
        summaries: codex.summaries,
        coverage: CODEX_COVERAGE,
        shellTools: [...CODEX_SHELL_TOOLS].sort(),
        complete: { skills: codexObserved.skills.complete, mcp: codexObserved.mcp.complete },
        setup: codexFacts,
      },
    ],
    // Codex의 프로젝트 몫은 정규화한 뿌리로 잇는다(「5단계 2부 계획 전 결정」 9번)
    projects: claudeFacts.projects,
    normalizedCwds: { ...normalizedCwds },
    installs: options.state.installs,
    self: options.self,
  };
  const { fromCache: _fromCache, ...claudeRead } = claude.read;
  const tools: CollectedTool[] = [
    { tool: "claude-code", detected: claude.detected, visibleFrom: claude.visibleFrom, overlappingSessions: claude.overlappingSessions, read: claudeRead, observation: claudeObserved },
    // Codex는 다른 기록에서 이어받은 앞부분을 빼고 세므로 다른 세션과 겹쳐 세는 응답이 없다(설계 「5단계 계획 전 결정」 7번)
    { tool: "codex", detected: codex.detected, visibleFrom: codex.visibleFrom, overlappingSessions: 0, read: codexSharedRead(codex.read), observation: codexObserved },
  ];
  return { input, collected: { claude, codex }, facts: { claude: claudeFacts, codex: codexFacts }, tools };
}
