// 평가 결과의 알림을 만든다. 점수를 내는 데 쓴 기록과 셋팅에서 빠진 것, 확인하지 못한 것을 종류마다 정해진 모양으로 싣는다(순수 함수, 설계 9.2, 9.5, 9.8, 12.2, 20.1)
import type { ObservationReason } from "../../adapters/claude/observation.ts";
import { compareVersions, parseVersion } from "../../adapters/common/version.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { CodexSetupFacts, FileStatus, ProjectFact, SetupProblem, SecretFact } from "../../scan/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { Withheld } from "../scoreboard.ts";
import type { CollectedCodex, CollectedTool } from "./tools.ts";

/** 도구마다 기록의 해석 규약을 확인한 버전의 범위(설계 9.5). 새 버전의 기록을 확인하면 넓힌다. 이 밖의 버전은 읽을 수 있는 필드로 계산하고 알린다(설계 20.1) */
export const VERIFIED_VERSIONS: Record<ToolId, { from: string; to: string }> = { "claude-code": { from: "2.1.220", to: "2.1.322" }, codex: { from: "0.140.0", to: "0.166.0" } };
/** 점수 구간의 사람 요청 가운데 근거가 약한 것의 몫이 이것을 넘으면 알린다(설계 9.5). 정확히 이 값은 넘지 않은 것이다 */
export const WEAK_REQUEST_SHARE = 0.1;

/** 있는데 읽지 못한 셋팅이 무엇인지. 이 차례로 싣는다. codex_config와 codex_project_config는 Codex의 사용자 config.toml과 신뢰한 프로젝트의 .codex/config.toml이다 */
export type UnreadableSetup =
  | "claude_json"
  | "user_settings"
  | "managed_settings"
  | "project_settings"
  | "local_settings"
  | "mcp_json"
  | "plugins_file"
  | "codex_config"
  | "codex_project_config"
  | "skill_dirs"
  | "instructions"
  | "hook_settings"
  | "skill_files";
/** 켜져 있는 플러그인을 세지 않은 까닭. 이 차례로 싣는다(설계 10 「구성을 모르는 플러그인」, 11.3 E5·E6, 16.2) */
export type UncountedPlugin = "composition_unknown" | "not_installed" | "skills_unreadable" | "mcp_unreadable" | "hooks_unreadable";

export type Notice =
  | { kind: "score_withheld"; reasons: Withheld[] }
  | { kind: "state_reset" }
  /** 설정에 그대로 적힌 비밀값의 자리(0.2.0). 문장에는 수만 넣는다 */
  | { kind: "credentials_in_config"; tool: ToolId; places: SecretFact[] }
  | { kind: "record_unreadable"; tool: ToolId; files: string[]; dirs: string[] }
  | { kind: "record_skipped"; tool: ToolId; files: string[] }
  | { kind: "record_partial"; tool: ToolId; files: string[] }
  | { kind: "observation_incomplete"; tool: ToolId; metric: "skills" | "mcp"; reasons: ObservationReason[] }
  | { kind: "setup_unreadable"; tool: ToolId; what: UnreadableSetup; targets: string[] }
  | { kind: "plugins_uncounted"; tool: ToolId; why: UncountedPlugin; plugins: string[] }
  | { kind: "setup_problems_unscored"; tool: ToolId; problems: { kind: SetupProblem["kind"]; path: string }[] }
  | { kind: "projects_gone"; projects: string[] }
  | { kind: "version_unverified"; tool: ToolId; versions: string[]; verified: { from: string; to: string } }
  | { kind: "weak_human_requests"; tool: ToolId; weak: number; total: number }
  | { kind: "overlapping_responses"; tool: ToolId; sessions: number }
  | { kind: "unverified_inheritance"; tool: ToolId; sessions: number }
  | { kind: "id_fallbacks"; tool: ToolId; counts: { why: string; count: number }[] }
  | { kind: "unclassified"; tool: ToolId; counts: { what: string; count: number }[] }
  | { kind: "orphan_subsessions"; tool: ToolId; sessions: number }
  | { kind: "parent_record_missing"; tool: ToolId; sessions: number }
  | { kind: "merged_sessions"; tool: ToolId; sessions: number }
  | { kind: "unknown_mtime_sessions"; tool: ToolId; sessions: number }
  | { kind: "skipped_copies"; tool: ToolId; count: number }
  | { kind: "unnamed_files"; tool: ToolId; count: number };

/**
 * 알림의 차례. 점수에 닿는 것, 읽지 못한 것, 확인하지 못한 것이다. 같은 종류는 도구 식별자의 차례(도구를 합친 알림이 먼저)이고,
 * 그 안은 만든 차례다(설계 12.2 「차례」)
 */
export const NOTICE_KINDS: readonly Notice["kind"][] = [
  "score_withheld",
  "state_reset",
  "credentials_in_config",
  "record_unreadable",
  "record_skipped",
  "record_partial",
  "observation_incomplete",
  "setup_unreadable",
  "plugins_uncounted",
  "setup_problems_unscored",
  "projects_gone",
  "version_unverified",
  "weak_human_requests",
  "overlapping_responses",
  "unverified_inheritance",
  "id_fallbacks",
  "unclassified",
  "orphan_subsessions",
  "parent_record_missing",
  "merged_sessions",
  "unknown_mtime_sessions",
  "skipped_copies",
  "unnamed_files",
];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const inRange = (date: string, range: { from: string; to: string }): boolean => date >= range.from && date <= range.to;
const toolOf = (notice: Notice): string => ("tool" in notice ? notice.tool : "");

export function sortNotices(notices: readonly Notice[]): Notice[] {
  return notices
    .map((notice, index) => ({ notice, index }))
    .sort((a, b) => NOTICE_KINDS.indexOf(a.notice.kind) - NOTICE_KINDS.indexOf(b.notice.kind) || byText(toolOf(a.notice), toolOf(b.notice)) || a.index - b.index)
    .map((item) => item.notice);
}

/** 있는데 열지 못했거나 열었는데 풀리지 않았다. 없는 것은 읽지 못한 것이 아니다 */
const unread = (status: FileStatus | null): boolean => status === "unparsable" || status === "unreadable";
const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(byText);

/** 도구가 쓰는 파일(.claude.json)의 문제는 읽지 못한 셋팅으로 이미 알린다. 사용자가 고치는 셋팅의 문제는 S3이 센다 */
function unscoredProblems(tool: ToolId, problems: readonly SetupProblem[]): Notice[] {
  const unscored = problems.filter((problem) => problem.owner === "plugin" || problem.owner === "managed").map((problem) => ({ kind: problem.kind, path: problem.path }));
  return unscored.length > 0 ? [{ kind: "setup_problems_unscored", tool, problems: unscored.sort((a, b) => byText(a.path, b.path) || byText(a.kind, b.kind)) }] : [];
}

/**
 * Codex의 셋팅 쪽 알림. 읽지 못한 사용자 config.toml과 신뢰한 프로젝트의 설정, 스킬 폴더, 지침, SKILL.md, 켜져 있는데 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제다.
 * Codex에는 설치 기록 파일과 플러그인 훅이 없다. 프로젝트의 경로는 입력 묶음의 프로젝트 목록에서 얻는다(설계 「5단계 4부 계획 전 결정」 5번)
 */
function codexSetupNotices(setup: CodexSetupFacts, projects: readonly ProjectFact[]): Notice[] {
  const notices: Notice[] = [];
  const rootOf = new Map(projects.map((project) => [project.normRoot, project.root]));
  const unreadable: [UnreadableSetup, boolean, string[]][] = [
    ["codex_config", unread(setup.config), []],
    ["codex_project_config", false, setup.projects.filter((project) => project.trust === "trusted" && unread(project.configStatus)).map((project) => rootOf.get(project.normRoot) ?? project.normRoot)],
    ["skill_dirs", false, setup.unreadableDirs],
    ["instructions", false, [setup.globalInstructions, ...setup.projects.map((project) => project.instructions)].flatMap((set) => [...set.unreadable, ...set.unreadableDirs])],
    ["skill_files", false, setup.skills.filter((skill) => !skill.readable).map((skill) => skill.path)],
  ];
  for (const [what, whole, targets] of unreadable) {
    if (whole || targets.length > 0) notices.push({ kind: "setup_unreadable", tool: "codex", what, targets: sortedUnique(targets) });
  }
  const enabledIds = new Set(setup.plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.id));
  const uncounted: [UncountedPlugin, string[]][] = [
    // 설정으로 켰는데 놓인 곳이나 매니페스트를 읽지 못했거나 Agent Plugins 형식이라 구성을 모르는 것(설계 「5단계 2부 계획 전 결정」 8번)
    ["composition_unknown", setup.plugins.filter((plugin) => plugin.configured && !plugin.compositionKnown).map((plugin) => plugin.id)],
    ["skills_unreadable", setup.unreadableSkillPlaces.plugins.filter((id) => enabledIds.has(id))],
    ["mcp_unreadable", setup.plugins.filter((plugin) => plugin.enabled && plugin.mcpUnreadable).map((plugin) => plugin.id)],
  ];
  for (const [why, plugins] of uncounted) {
    if (plugins.length > 0) notices.push({ kind: "plugins_uncounted", tool: "codex", why, plugins: sortedUnique(plugins) });
  }
  notices.push(...unscoredProblems("codex", setup.problems));
  return notices;
}

/**
 * 셋팅 쪽 알림과 실행 입력 알림. 있는데 읽지 못한 셋팅, 켜져 있는데 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제,
 * 지금 PC에 없는 프로젝트, 상태 파일이 깨져 새로 시작한 것, AQ를 내지 않은 것이다
 */
export function setupNotices(input: EvaluationInput, evaluation: Evaluation, run: { stateBroken: boolean }): Notice[] {
  const notices: Notice[] = [];
  if (evaluation.score.withheld.length > 0) notices.push({ kind: "score_withheld", reasons: [...evaluation.score.withheld] });
  if (run.stateBroken) notices.push({ kind: "state_reset" });

  for (const tool of input.tools) {
    if (tool.setup.secrets.length > 0) notices.push({ kind: "credentials_in_config", tool: tool.tool, places: [...tool.setup.secrets] });
    if (tool.tool === "codex") {
      notices.push(...codexSetupNotices(tool.setup, input.projects));
      continue;
    }
    const id = tool.tool;
    const setup = tool.setup;
    const unreadable: [UnreadableSetup, boolean, string[]][] = [
      ["claude_json", unread(setup.claudeJson), []],
      ["user_settings", unread(setup.settings.user), []],
      ["managed_settings", false, setup.settings.managedParts.filter((part) => unread(part.status)).map((part) => part.path)],
      ["project_settings", false, setup.projects.filter((project) => unread(project.settingsStatus)).map((project) => project.root)],
      ["local_settings", false, setup.projects.filter((project) => unread(project.localSettingsStatus)).map((project) => project.root)],
      ["mcp_json", false, setup.projects.filter((project) => unread(project.mcpJsonStatus)).map((project) => project.root)],
      ["plugins_file", unread(setup.pluginsFile), []],
      ["skill_dirs", false, setup.unreadableDirs],
      ["instructions", false, [setup.globalInstructions, ...setup.projects.map((project) => project.instructions)].flatMap((set) => [...set.unreadable, ...set.unreadableDirs])],
      ["hook_settings", false, setup.hooks.unreadableSettings],
      ["skill_files", false, setup.skills.filter((skill) => !skill.readable).map((skill) => skill.path)],
    ];
    for (const [what, whole, targets] of unreadable) {
      if (whole || targets.length > 0) notices.push({ kind: "setup_unreadable", tool: id, what, targets: sortedUnique(targets) });
    }

    // 켜져 있는 플러그인의 사실에서 고른다. 스캐너의 다른 목록은 쓰임이 달라 범위가 다르다. 스킬 폴더를 읽지 못한 목록에는 꺼진 플러그인도 들고,
    // 훅을 읽지 못한 목록(S2의 확인 훅을 찾는 곳)에는 사용자 범위로 깔아 사용자 설정이나 관리 정책이 켠 것만 든다
    const enabled = setup.plugins.filter((plugin) => plugin.enabled);
    const enabledIds = new Set(enabled.map((plugin) => plugin.id));
    const uncounted: [UncountedPlugin, string[]][] = [
      // 놓인 곳이 지금 없는 플러그인도 구성을 모른다. 2부는 이런 플러그인이 켜져 있으면 스킬 끄기와 서버 막기 후보를 막는다
      ["composition_unknown", enabled.filter((plugin) => !plugin.compositionKnown).map((plugin) => plugin.id)],
      ["not_installed", setup.pluginsWithoutInstall],
      ["skills_unreadable", setup.unreadableSkillPlaces.plugins.filter((id) => enabledIds.has(id))],
      ["mcp_unreadable", enabled.filter((plugin) => plugin.compositionKnown && plugin.mcpUnreadable).map((plugin) => plugin.id)],
      ["hooks_unreadable", enabled.filter((plugin) => plugin.compositionKnown && plugin.hooksUnreadable).map((plugin) => plugin.id)],
    ];
    for (const [why, plugins] of uncounted) {
      if (plugins.length > 0) notices.push({ kind: "plugins_uncounted", tool: id, why, plugins: sortedUnique(plugins) });
    }

    notices.push(...unscoredProblems(id, setup.problems));
  }

  const gone = input.projects.filter((project) => !project.exists).map((project) => project.root);
  if (gone.length > 0) notices.push({ kind: "projects_gone", projects: sortedUnique(gone) });
  return sortNotices(notices);
}

/** Codex만 내는 기록 쪽 알림. 건너뛴 압축 파일과 일부만 읽은 파일, 기록을 묶으며 센 것이다. 종류의 차례는 sortNotices가 맞춘다(설계 「5단계 4부 계획 전 결정」 3번) */
function codexRecordNotices(tool: ToolId, codex: CollectedCodex): Notice[] {
  const notices: Notice[] = [];
  if (codex.skippedFiles.length > 0) notices.push({ kind: "record_skipped", tool, files: [...codex.skippedFiles].sort(byText) });
  if (codex.partialFiles.length > 0) notices.push({ kind: "record_partial", tool, files: [...codex.partialFiles].sort(byText) });
  if (codex.unverifiedInheritance > 0) notices.push({ kind: "unverified_inheritance", tool, sessions: codex.unverifiedInheritance });
  const fallbacks = Object.entries(codex.idFallbacks)
    .filter(([, count]) => count > 0)
    .sort((a, b) => byText(a[0], b[0]))
    .map(([why, count]) => ({ why, count }));
  if (fallbacks.length > 0) notices.push({ kind: "id_fallbacks", tool, counts: fallbacks });
  if (codex.parentRecordMissing > 0) notices.push({ kind: "parent_record_missing", tool, sessions: codex.parentRecordMissing });
  if (codex.mergedSessions > 0) notices.push({ kind: "merged_sessions", tool, sessions: codex.mergedSessions });
  if (codex.unknownMtimeSessions > 0) notices.push({ kind: "unknown_mtime_sessions", tool, sessions: codex.unknownMtimeSessions });
  if (codex.skippedCopies > 0) notices.push({ kind: "skipped_copies", tool, count: codex.skippedCopies });
  if (codex.unnamedFiles > 0) notices.push({ kind: "unnamed_files", tool, count: codex.unnamedFiles });
  return notices;
}

/** 기록 쪽 알림. 읽은 양과 같은 범위(수집 구간에 걸려 읽은 기록)를 보고, 근거가 약한 사람 요청만 점수 구간의 주 세션으로 본다 */
export function recordNotices(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): Notice[] {
  const notices: Notice[] = [];
  for (const tool of input.tools) {
    const id = tool.tool;
    const found = collected.find((item) => item.tool === id);
    if (found !== undefined) {
      const { unreadableFiles, unreadableDirs } = found.read;
      if (unreadableFiles.length > 0 || unreadableDirs.length > 0) notices.push({ kind: "record_unreadable", tool: id, files: [...unreadableFiles].sort(byText), dirs: [...unreadableDirs].sort(byText) });
      for (const metric of ["skills", "mcp"] as const) {
        const observation = found.observation[metric];
        // 그 지표를 기록하지 않는 형식(Codex의 스킬 사용)은 늘 빠짐없지 않다. 읽은 것의 문제가 아니라 알리지 않고, 규칙의 못 잰 이유가 알린다(설계 「5단계 4부 계획 전 결정」 3번)
        if (!observation.complete && !observation.reasons.includes("not-recorded")) notices.push({ kind: "observation_incomplete", tool: id, metric, reasons: [...observation.reasons] });
      }
      if (found.overlappingSessions > 0) notices.push({ kind: "overlapping_responses", tool: id, sessions: found.overlappingSessions });
      if (found.codex !== undefined) notices.push(...codexRecordNotices(id, found.codex));
    }

    const verified = VERIFIED_VERSIONS[id];
    const [from, to] = [parseVersion(verified.from)!, parseVersion(verified.to)!];
    const outside = new Map<string, readonly [number, number, number]>();
    for (const summary of tool.summaries) {
      const version = parseVersion(summary.version);
      if (version !== null && (compareVersions(version, from) < 0 || compareVersions(version, to) > 0)) outside.set(summary.version!, version);
    }
    if (outside.size > 0) notices.push({ kind: "version_unverified", tool: id, versions: [...outside].sort((a, b) => compareVersions(a[1], b[1])).map(([text]) => text), verified: { ...verified } });

    let total = 0;
    let weak = 0;
    for (const summary of tool.summaries) {
      if (summary.kind !== "main") continue;
      for (const [date, day] of Object.entries(summary.days)) {
        if (!inRange(date, evaluation.windows.score)) continue;
        total += day.humanRequests;
        weak += day.weakHumanRequests;
      }
    }
    if (total > 0 && weak / total > WEAK_REQUEST_SHARE) notices.push({ kind: "weak_human_requests", tool: id, weak, total });

    const counts = new Map<string, number>();
    const add = (what: string, count: number): void => {
      if (count > 0) counts.set(what, (counts.get(what) ?? 0) + count);
    };
    for (const summary of tool.summaries) {
      // Codex의 정체 모를 thread_source(세션마다 하나)와 실행 층 종류(종류마다의 수). 그 세션은 주 세션으로 셌다(설계 9.2, 9.6)
      if (summary.codex?.unknownThreadSource != null) add(`thread_source:${summary.codex.unknownThreadSource}`, 1);
      for (const [kind, count] of Object.entries(summary.codex?.unknownItemTypes ?? {})) add(`item:${kind}`, count);
      for (const [kind, count] of Object.entries(summary.notes.unknownHookKinds)) add(`hook:${kind}`, count);
      for (const day of Object.values(summary.days)) {
        for (const [kind, count] of Object.entries(day.unknownDenialKinds)) add(`denial:${kind}`, count);
        add("compaction", day.unknownCompactions);
      }
    }
    if (counts.size > 0) notices.push({ kind: "unclassified", tool: id, counts: [...counts].sort((a, b) => byText(a[0], b[0])).map(([what, count]) => ({ what, count })) });

    const orphans = tool.summaries.filter((summary) => summary.kind === "sub" && summary.parentSessionId === null).length;
    if (orphans > 0) notices.push({ kind: "orphan_subsessions", tool: id, sessions: orphans });
  }
  return sortNotices(notices);
}
