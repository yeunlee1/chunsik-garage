// 셋팅 규칙 넷을 잰다. 도구를 합치는 S1, S2, S3과 도구별 규칙 S5(순수 함수, 설계 11.3 「셋팅」, 11.4 「규칙마다의 이유」)
import { compareVersions, maxVersion, parseVersion, type Version } from "../../adapters/common/version.ts";
import type { SessionSummary, ToolId } from "../../adapters/types.ts";
import type { ShellGuard } from "../../scan/hooks.ts";
import type { ClaudeHooksFacts, ClaudeSetupFacts, CodexSetupFacts, GeminiSetupFacts, SetupProblem } from "../../scan/types.ts";
import { blank, countGate, scored, unmeasured, type Measurement } from "../measure.ts";
import { sameInstall } from "../installs/same.ts";
import { codexSettingsUnread, enablementUnread, geminiSettingsUnread, globalSettingsUnread, mcpPlacesUnread, projectSettingsUnread } from "../readability.ts";
import type { ToolUsage } from "../totals.ts";

interface ToolSetupCommon extends Omit<ToolUsage, "tool"> {
  /** 읽은 주 세션의 버전 가운데 가장 높은 것(highestMainVersion). 버전을 아는 주 세션이 없으면 null */
  highestVersion: string | null;
}

/** 점수에 넣는 도구 하나의 구간 합계, 관측 범위, 셋팅 사실. 셋팅 사실의 꼴은 도구마다 다르다(설계 「5단계 3부 계획 전 결정」 4번) */
export type ToolSetup = ToolSetupCommon & ({ tool: "claude-code"; setup: ClaudeSetupFacts } | { tool: "codex"; setup: CodexSetupFacts } | { tool: "gemini"; setup: GeminiSetupFacts });
export type ClaudeToolSetup = Extract<ToolSetup, { tool: "claude-code" }>;

/** 전역 지침 파일들의 크기를 합쳐 이만큼이면 전역 지침이 있는 것이다(설계 11.3 S1) */
export const MIN_GLOBAL_INSTRUCTION_BYTES = 200;

/** 프로젝트 설정과 로컬 설정에 적은 권한 우회는 이 버전부터 듣지 않는다(설계 11.3 「㉡을 보는 곳」) */
export const PROJECT_BYPASS_IGNORED_FROM: Version = [2, 1, 257];

/**
 * 읽은 주 세션의 버전 가운데 숫자로 견주어 가장 높은 것. 세 숫자 꼴로 읽히지 않는 버전과 하위 세션은 뺀다.
 * 세션마다의 버전만으로 정해지므로 파일을 읽는 차례나 캐시와 상관없이 같다(설계 9.3, 11.3).
 */
export function highestMainVersion(summaries: readonly SessionSummary[]): string | null {
  return maxVersion(summaries.filter((summary) => summary.kind === "main").map((summary) => summary.version));
}

/** 도구 하나의 안전장치. 설정을 읽지 못해 정하지 못했으면 둘 다 null이다. 훅의 명령과 권한 규칙의 글은 싣지 않는다(설계 12.2) */
export interface ToolSafeguard {
  tool: ToolId;
  /** ㉠ 셸 명령을 덮는 도구 실행 전 확인 훅이 있고 꺼져 있지 않다. Codex는 훅을 안전장치로 치지 않아 늘 거짓이다(설계 11.3) */
  guardHook: boolean | null;
  /** ㉡ 기본 모드가 권한 우회가 아니다(도구의 권한 확인이 돈다). Codex는 승인 없음과 전면 해제를 함께 쓰는 맥락이 없다는 것이다 */
  permissionChecks: boolean | null;
}

/** 훅을 제한하는 설정에 막히지 않는지(설계 11.3의 제한 표). 제한이 둘 이상이면 하나라도 막는 훅은 돌지 않는다 */
function guardRuns(guard: ShellGuard, hooks: ClaudeHooksFacts): boolean {
  if (hooks.managedDisableAll) return false;
  const fromManaged = guard.source === "managed" || guard.source === "managed-plugin";
  return fromManaged || !(hooks.userDisableAll || hooks.managedAllowManagedOnly);
}

function seesProjectBypass(highestVersion: string | null): boolean {
  const version = parseVersion(highestVersion);
  return version === null || compareVersions(version, PROJECT_BYPASS_IGNORED_FROM) < 0;
}

/**
 * Codex의 안전장치. 맥락(전역, 신뢰한 프로젝트마다) 가운데 승인 없음과 전면 해제를 함께 쓰는 것이 하나도 없으면 안전장치가 있다.
 * 신뢰한 프로젝트의 맥락은 그 설정을 읽은 것만 승인과 샌드박스가 있다(설계 「5단계 2부 계획 전 결정」 4번, 「5단계 3부 계획 전 결정」 5번)
 */
function codexSafeguard(setup: CodexSetupFacts): ToolSafeguard {
  if (codexSettingsUnread(setup)) return { tool: "codex", guardHook: null, permissionChecks: null };
  const contexts = [setup.safety, ...setup.projects.flatMap((project) => (project.trust === "trusted" && project.safety !== null ? [project.safety] : []))];
  const unsafe = contexts.some((context) => context.approval === "never" && context.fullAccess);
  return { tool: "codex", guardHook: false, permissionChecks: !unsafe };
}

/**
 * 제미나이의 안전장치. 맥락(전역, 읽은 프로젝트마다) 가운데 셸 도구를 확인 없이 허용(tools.allowed)하면서 샌드박스가 없는 것이 하나도 없으면 안전장치가 있다.
 * 기본 승인 방식(default, auto_edit, plan)은 셸 명령마다 묻는다. 모두 자동 승인(YOLO)은 실행할 때만 켜져 설정으로는 보지 못한다(설계 「0.4.0에서 정한 것」)
 */
function geminiSafeguard(setup: GeminiSetupFacts): ToolSafeguard {
  if (geminiSettingsUnread(setup) || setup.safety.shellAutoApproved === null) return { tool: "gemini", guardHook: null, permissionChecks: null };
  // 신뢰하지 않는 폴더는 프로젝트 층을 쓰지 않아 전역 맥락과 같다
  const contexts = [setup.safety, ...setup.projects.flatMap((project) => (project.scanned && project.trusted && project.safety !== null ? [project.safety] : []))];
  // 셸을 묻지 않고 실행하게 둔 맥락 가운데 샌드박스가 꺼진 곳이 있으면 안전장치가 없다. 꺼진 곳은 없고 샌드박스 값을 모르는 곳(제미나이가 시작하지 못하는 값)이 있으면 모름이다
  const open = contexts.filter((context) => context.shellAutoApproved === true);
  if (open.some((context) => context.sandbox === false)) return { tool: "gemini", guardHook: false, permissionChecks: false };
  if (open.some((context) => context.sandbox === null)) return { tool: "gemini", guardHook: null, permissionChecks: null };
  return { tool: "gemini", guardHook: false, permissionChecks: true };
}

function safeguardOf(tool: ToolSetup): ToolSafeguard {
  if (tool.tool === "codex") return codexSafeguard(tool.setup);
  if (tool.tool === "gemini") return geminiSafeguard(tool.setup);
  const { setup } = tool;
  const old = seesProjectBypass(tool.highestVersion);
  if (globalSettingsUnread(setup) || (old && projectSettingsUnread(setup))) return { tool: tool.tool, guardHook: null, permissionChecks: null };
  const guardHook = setup.hooks.guards.some((guard) => guard.coversShell && guard.canBlock && guardRuns(guard, setup.hooks));
  // 사용자 설정과 관리 정책이 둘 다 정했으면 관리 정책의 값이다. 옛 버전에서는 프로젝트 쪽 한 곳에라도 권한 우회가 있으면 권한 우회로 본다
  const mode = setup.settings.defaultMode.managed ?? setup.settings.defaultMode.user;
  const bypass = mode === "bypass" || (old && setup.projects.some((project) => project.bypassInProject || project.bypassInLocal));
  return { tool: tool.tool, guardHook, permissionChecks: !bypass };
}

function s1(tools: readonly ToolSetup[]): Measurement {
  const withInstructions = tools.filter((tool) => tool.setup.globalInstructions.bytes >= MIN_GLOBAL_INSTRUCTION_BYTES).length;
  const evidence = { tools: tools.length, withInstructions };
  return countGate(true, tools.length, 1, evidence) ?? scored(withInstructions / tools.length, evidence);
}

function s2(safeguards: readonly ToolSafeguard[]): Measurement {
  // 안전장치를 정하는 설정을 읽지 못한 도구만 분자와 분모에서 빼고 남은 도구로 잰다. 남은 도구가 없으면 못 잰다(설계 「5단계 계획 전 결정」 4번)
  const readable = safeguards.filter((safeguard) => safeguard.permissionChecks !== null);
  const unreadTools = safeguards.length - readable.length;
  if (readable.length === 0 && unreadTools > 0) return unmeasured("unreadable", { guarded: null, tools: 0, unreadTools });
  const guarded = readable.filter((safeguard) => safeguard.guardHook === true || safeguard.permissionChecks === true).length;
  const evidence = { guarded, tools: readable.length, unreadTools };
  return countGate(true, readable.length, 1, evidence) ?? scored(guarded / readable.length, evidence);
}

const PROBLEM_COUNTERS = { danglingLink: "danglingLinks", noFrontmatter: "noFrontmatter", unparsable: "unparsable" } as const satisfies Record<SetupProblem["kind"], string>;

/** S3가 센 문제 하나. 결과 화면이 그 위치를 보인다(설계 「3단계 계획 전 결정」의 4번) */
export interface CountedProblem {
  tool: ToolId;
  kind: SetupProblem["kind"];
  /** 도구의 설정 폴더나 프로젝트 폴더 이름부터의 위치(SetupProblem.place). 절대 경로가 아니다 */
  place: string;
}

/**
 * S3가 세는 문제. 사용자가 직접 고치는 셋팅만 세고(플러그인 안의 것, 관리 정책 파일, 도구가 쓰는 상태 파일은 세지 않는다), 같은 실제 파일은 처음 본 것 하나다.
 * 차례는 도구의 차례, 그 안에서는 스캐너의 차례(경로, 종류, 주인)이고 위치로 다시 정렬하지 않는다
 */
export function countedProblems(tools: readonly ToolSetup[]): CountedProblem[] {
  const counted: CountedProblem[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    for (const problem of tool.setup.problems) {
      if (problem.owner !== "user") continue;
      const at = problem.realPath ?? problem.path;
      if (seen.has(at)) continue;
      seen.add(at);
      counted.push({ tool: tool.tool, kind: problem.kind, place: problem.place });
    }
  }
  return counted;
}

function s3(problems: readonly CountedProblem[]): Measurement {
  const counts = { danglingLinks: 0, noFrontmatter: 0, unparsable: 0 };
  for (const problem of problems) counts[PROBLEM_COUNTERS[problem.kind]]++;
  return scored(problems.length, { danglingLinks: counts.danglingLinks, noFrontmatter: counts.noFrontmatter, problems: problems.length, unparsable: counts.unparsable });
}

function s5(tool: ToolSetup): Measurement {
  const { totals } = tool;
  // 정체가 같은 서버 사실은 설치 하나로 센다(E6과 같다)
  const enabledServers = sameInstall(tool.setup.mcpServers.filter((server) => server.enabled), (server) => server.installKey).length;
  const failedSessions = totals.mainSessions.filter((session) => session.mcpConnectionFailure).length;
  const evidence = { enabledServers, failedSessions, mainSessions: totals.mainSessions.length };
  if (tool.coverage.mcpFailuresAndHooks === "unsupported") return unmeasured("unsupported", blank(evidence));
  // Codex는 켜짐과 서버를 정하는 설정이 같은 파일들이다(설계 「5단계 2부 계획 전 결정」 7번)
  const enablementUnknown = tool.tool === "codex" ? codexSettingsUnread(tool.setup) : tool.tool === "gemini" ? geminiSettingsUnread(tool.setup) : enablementUnread(tool.setup);
  const placesUnknown = tool.tool === "codex" ? codexSettingsUnread(tool.setup) : tool.tool === "gemini" ? geminiSettingsUnread(tool.setup) : mcpPlacesUnread(tool.setup);
  // 켜짐을 정하는 설정을 읽지 못한 점검에서는 막아 둔 서버가 켜져 있는 것으로 보인다. 보이는 켜진 서버를 믿을 수 없다
  if (enablementUnknown) return unmeasured("unreadable", { ...evidence, enabledServers: null });
  // 재는지는 지금의 셋팅으로 정한다. 켜져 있는 서버가 없으면 지난 연결 실패가 있어도 재지 않는다. 없다는 것은 다 읽었을 때만 말한다
  if (enabledServers === 0) return placesUnknown ? unmeasured("unreadable", { ...evidence, enabledServers: null }) : unmeasured("not_applicable", evidence);
  return countGate(true, totals.mainSessions.length, 1, evidence) ?? scored(failedSessions / totals.mainSessions.length, evidence);
}

/** 도구를 합쳐서 재는 셋팅 규칙. tools는 점수에 넣는 도구다. safeguards는 S2의 근거이고 도구의 차례 그대로다. setupProblems는 S3가 센 문제다 */
export function mergedSetupRules(tools: readonly ToolSetup[]): Record<"S1" | "S2" | "S3", Measurement> & { safeguards: ToolSafeguard[]; setupProblems: CountedProblem[] } {
  const safeguards = tools.map(safeguardOf);
  const setupProblems = countedProblems(tools);
  // 셋팅을 읽은 도구가 없으면(웹 채팅만 있으면) 문제가 없다고 말할 수 없다. 0개를 만점으로 세지 않는다(설계 「0.5.0에서 정한 것」)
  const S3 = tools.length === 0 ? unmeasured("no_data", { danglingLinks: 0, noFrontmatter: 0, problems: 0, unparsable: 0 }) : s3(setupProblems);
  return { S1: s1(tools), S2: s2(safeguards), S3, safeguards, setupProblems };
}

/** 도구 하나에서 재는 셋팅 규칙 */
export function setupToolRules(tool: ToolSetup): Record<"S5", Measurement> {
  return { S5: s5(tool) };
}
