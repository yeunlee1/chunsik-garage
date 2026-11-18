// 점검의 입력 묶음을 모은다. 세 도구(Claude Code, Codex, Gemini CLI)의 기록을 읽고, 셋팅을 스캔하고, 지난 점검까지의 관측 기록을 붙여 core가 받는 모양으로 만든다. 경로의 정규화처럼 순수하지 않은 일은 여기서 끝낸다(설계 7.2, 8, 10 「프로젝트 목록」, 12.1, 「5단계 3부 계획 전 결정」 2·3번)
import { normalizePath } from "../adapters/claude/locate.ts";
import { claudeObservation, CLAUDE_COVERAGE, type Observation } from "../adapters/claude/observation.ts";
import { SHELL_TOOLS } from "../adapters/claude/parser.ts";
import { CODEX_COVERAGE, codexMcpObservation } from "../adapters/codex/observation.ts";
import { CODEX_SHELL_TOOLS } from "../adapters/codex/parser.ts";
import { GEMINI_COVERAGE, geminiMcpObservation } from "../adapters/gemini/observation.ts";
import { GEMINI_SHELL_TOOLS } from "../adapters/gemini/parser.ts";
import { makeWindows } from "../adapters/common/dates.ts";
import type { ToolCoverage } from "../adapters/types.ts";
import { collectClaude, unreadableCount, type ClaudeCollectResult, type ClaudeReadStats, type EvalClock } from "../collect/claude.ts";
import { codexUnreadableCount, collectCodex, type CodexCollectResult, type CodexReadStats } from "../collect/codex.ts";
import { collectGemini, type GeminiCollectResult } from "../collect/gemini.ts";
import { collectWeb, type WebCollectResult } from "../collect/web.ts";
import { WEB_COVERAGE, WEB_OBSERVATION } from "../adapters/web/observation.ts";
import type { WebExportEntry } from "../state/web-exports.ts";
import type { EvaluationInput } from "../core/evaluate.ts";
import type { SelfIdentity } from "../core/installs/candidates.ts";
import type { CollectedTool } from "../core/result/tools.ts";
import { scanClaudeSetup } from "../scan/claude.ts";
import { scanCodexSetup } from "../scan/codex.ts";
import { scanGeminiSetup } from "../scan/gemini.ts";
import type { ClaudeSetupFacts, CodexSetupFacts, GeminiSetupFacts } from "../scan/types.ts";
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
  /** 가져온 웹 채팅 내보내기 파일의 자리(상태 폴더의 web-exports.json). 주지 않으면 웹 채팅이 없는 점검이다 */
  webExports?: readonly WebExportEntry[];
}

export interface CheckupInput {
  input: EvaluationInput;
  /** 도구마다 모은 기록 */
  collected: { claude: ClaudeCollectResult; codex: CodexCollectResult; gemini: GeminiCollectResult; web: WebCollectResult[] };
  /** 도구마다의 셋팅 사실. 관측 기록을 고칠 때 쓴다(제미나이는 관측 기록에 넣는 설치가 없다) */
  facts: { claude: ClaudeSetupFacts; codex: CodexSetupFacts; gemini: GeminiSetupFacts };
  /** 평가 결과에 싣는 수집 결과(도구마다). 캐시를 쓴 파일 수처럼 실행마다 다른 것은 뺐다 */
  tools: CollectedTool[];
}

const CLAUDE_AI_PREFIX = "claude.ai ";

/** Codex는 스킬 사용을 기록하지 않아 스킬의 관측은 늘 빠짐없지 않다(설계 「5단계 2부 계획 전 결정」 6번, 「5단계 4부 계획 전 결정」 3번) */
const CODEX_SKILL_OBSERVATION: Observation = { complete: false, reasons: ["not-recorded"] };

/** 제미나이는 스킬 사용을 이 버전에서 보지 않아 스킬의 관측은 늘 빠짐없지 않다(설계 「0.4.0에서 정한 것」) */
const GEMINI_SKILL_OBSERVATION: Observation = { complete: false, reasons: ["not-recorded"] };

/** 이어받은 것을 확인하지 못한 세션이 있으면 대신 보는 것으로 낮추는 Codex의 관측 범위(「5단계 4부 계획 전 결정」 4번) */
const INHERITED_METRICS = ["responsesAndTokens", "toolCalls", "toolErrors", "shellExitCodes"] as const;

/** 이어받은 것을 확인하지 못한 세션의 숫자는 대신 본 것이다. 그런 세션이 있으면 그 점검의 Codex 관측 범위에서 응답과 토큰, 도구 호출과 그 결과를 낮춘다. 못 봄은 그대로 둔다 */
function codexCoverage(unverifiedInheritance: number): ToolCoverage {
  if (unverifiedInheritance === 0) return CODEX_COVERAGE;
  const coverage: ToolCoverage = { ...CODEX_COVERAGE };
  for (const key of INHERITED_METRICS) if (coverage[key] === "measured") coverage[key] = "proxy";
  return coverage;
}

/** 결과에 싣는 Codex의 읽은 양 가운데 Claude Code와 같은 칸 */
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
  const gemini = await collectGemini(collectOptions);
  const web = await collectWeb(options.webExports ?? [], collectOptions);

  // 프로젝트 목록은 세 도구의 주 세션 가운데 수집 구간에 응답이 있는 것의 작업 폴더(세션마다 처음 적힌 것 하나)로 만든다. 하위 세션과 작업 폴더가 없는 세션은 넣지 않는다
  const collectDates = new Set(makeWindows(options.clock.nowMs, options.clock.timeZone).collectDates);
  const cwds = new Set<string>();
  const normalizedCwds: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const summary of [...claude.summaries, ...codex.summaries, ...gemini.summaries]) {
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
  const geminiFacts = await scanGeminiSetup({ env: options.env, homedir: options.homedir, tmpdir: options.tmpdir, platform: options.platform, cwds: sortedCwds, salt: options.state.salt });

  const claudeUnreadable = unreadableCount(claude.read);
  const claudeObserved = { skills: claudeObservation(claude.summaries, claudeUnreadable, "skill"), mcp: claudeObservation(claude.summaries, claudeUnreadable, "mcp") };
  const codexObserved = { skills: CODEX_SKILL_OBSERVATION, mcp: codexMcpObservation(codex.summaries, codexUnreadableCount(codex.read)) };
  const geminiObserved = { skills: GEMINI_SKILL_OBSERVATION, mcp: geminiMcpObservation(gemini.summaries, unreadableCount(gemini.read)) };
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
        coverage: codexCoverage(codex.unverifiedInheritance),
        shellTools: [...CODEX_SHELL_TOOLS].sort(),
        complete: { skills: codexObserved.skills.complete, mcp: codexObserved.mcp.complete },
        setup: codexFacts,
      },
      {
        tool: "gemini",
        summaries: gemini.summaries,
        coverage: GEMINI_COVERAGE,
        shellTools: [...GEMINI_SHELL_TOOLS].sort(),
        complete: { skills: geminiObserved.skills.complete, mcp: geminiObserved.mcp.complete },
        setup: geminiFacts,
      },
      // 웹 채팅은 셋팅이 없고 작업 폴더도 없어 프로젝트 목록에 들지 않는다(설계 「0.5.0에서 정한 것」)
      ...web.map((item) => ({ tool: item.tool, summaries: item.summaries, coverage: WEB_COVERAGE, shellTools: [], complete: { skills: false, mcp: false }, setup: null })),
    ],
    // Codex와 제미나이의 프로젝트 몫은 정규화한 뿌리로 잇는다(「5단계 2부 계획 전 결정」 9번)
    projects: claudeFacts.projects,
    normalizedCwds: { ...normalizedCwds },
    installs: options.state.installs,
    self: options.self,
  };
  const { fromCache: _fromCache, ...claudeRead } = claude.read;
  const { fromCache: _geminiFromCache, ...geminiRead } = gemini.read;
  const tools: CollectedTool[] = [
    { tool: "claude-code", detected: claude.detected, visibleFrom: claude.visibleFrom, overlappingSessions: claude.overlappingSessions, read: claudeRead, observation: claudeObserved },
    // Codex는 다른 기록에서 이어받은 앞부분을 빼고 세므로 다른 세션과 겹쳐 세는 응답이 없다(설계 「5단계 계획 전 결정」 7번)
    {
      tool: "codex",
      detected: codex.detected,
      visibleFrom: codex.visibleFrom,
      overlappingSessions: 0,
      read: codexSharedRead(codex.read),
      observation: codexObserved,
      codex: {
        skippedFiles: codex.read.skippedFiles,
        skippedFileBytes: codex.read.skippedFileBytes,
        partialFiles: codex.read.partialFiles,
        skippedCopies: codex.read.skippedCopies,
        unnamedFiles: codex.read.unnamedFiles,
        parentRecordMissing: codex.parentRecordMissing,
        mergedSessions: codex.mergedSessions,
        unknownMtimeSessions: codex.unknownMtimeSessions,
        unverifiedInheritance: codex.unverifiedInheritance,
        idFallbacks: codex.idFallbacks,
      },
    },
    { tool: "gemini", detected: gemini.detected, visibleFrom: gemini.visibleFrom, overlappingSessions: gemini.overlappingSessions, read: geminiRead, observation: geminiObserved },
    ...web.map((item): CollectedTool => {
      const { fromCache: _webFromCache, ...read } = item.read;
      return { tool: item.tool, detected: item.detected, visibleFrom: item.visibleFrom, overlappingSessions: 0, read, observation: { skills: WEB_OBSERVATION, mcp: WEB_OBSERVATION }, web: item.state };
    }),
  ];
  return { input, collected: { claude, codex, gemini, web }, facts: { claude: claudeFacts, codex: codexFacts, gemini: geminiFacts }, tools };
}
