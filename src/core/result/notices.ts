// 평가 결과의 알림을 만든다. 점수를 내는 데 쓴 기록과 셋팅에서 빠진 것, 확인하지 못한 것을 종류마다 정해진 모양으로 싣는다(순수 함수, 설계 9.2, 9.5, 9.8, 12.2, 20.1)
import type { ObservationReason } from "../../adapters/claude/observation.ts";
import { compareVersions, parseVersion } from "../../adapters/common/version.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { FileStatus, SetupProblem } from "../../scan/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { Withheld } from "../scoreboard.ts";
import type { CollectedTool } from "./tools.ts";

/** 도구마다 기록의 해석 규약을 확인한 버전의 범위(설계 9.5). 새 버전의 기록을 확인하면 넓힌다. 이 밖의 버전은 읽을 수 있는 필드로 계산하고 알린다(설계 20.1) */
export const VERIFIED_VERSIONS: Record<ToolId, { from: string; to: string }> = { "claude-code": { from: "2.1.220", to: "2.1.322" } };
/** 점수 구간의 사람 요청 가운데 근거가 약한 것의 몫이 이것을 넘으면 알린다(설계 9.5). 정확히 이 값은 넘지 않은 것이다 */
export const WEAK_REQUEST_SHARE = 0.1;

/** 있는데 읽지 못한 셋팅이 무엇인지. 이 차례로 싣는다 */
export type UnreadableSetup = "claude_json" | "user_settings" | "managed_settings" | "project_settings" | "local_settings" | "mcp_json" | "plugins_file" | "skill_dirs" | "instructions" | "hook_settings" | "skill_files";
/** 켜져 있는 플러그인을 세지 않은 까닭. 이 차례로 싣는다(설계 10 「구성을 모르는 플러그인」, 11.3 E5·E6, 16.2) */
export type UncountedPlugin = "composition_unknown" | "not_installed" | "skills_unreadable" | "mcp_unreadable" | "hooks_unreadable";

export type Notice =
  | { kind: "score_withheld"; reasons: Withheld[] }
  | { kind: "state_reset" }
  | { kind: "record_unreadable"; tool: ToolId; files: string[]; dirs: string[] }
  | { kind: "observation_incomplete"; tool: ToolId; metric: "skills" | "mcp"; reasons: ObservationReason[] }
  | { kind: "setup_unreadable"; tool: ToolId; what: UnreadableSetup; targets: string[] }
  | { kind: "plugins_uncounted"; tool: ToolId; why: UncountedPlugin; plugins: string[] }
  | { kind: "setup_problems_unscored"; tool: ToolId; problems: { kind: SetupProblem["kind"]; path: string }[] }
  | { kind: "projects_gone"; projects: string[] }
  | { kind: "version_unverified"; tool: ToolId; versions: string[]; verified: { from: string; to: string } }
  | { kind: "weak_human_requests"; tool: ToolId; weak: number; total: number }
  | { kind: "overlapping_responses"; tool: ToolId; sessions: number }
  | { kind: "unclassified"; tool: ToolId; counts: { what: string; count: number }[] }
  | { kind: "orphan_subsessions"; tool: ToolId; sessions: number };

/**
 * 알림의 차례. 점수에 닿는 것, 읽지 못한 것, 확인하지 못한 것이다. 같은 종류는 도구 식별자의 차례(도구를 합친 알림이 먼저)이고,
 * 그 안은 만든 차례다(설계 12.2 「차례」)
 */
export const NOTICE_KINDS: readonly Notice["kind"][] = [
  "score_withheld",
  "state_reset",
  "record_unreadable",
  "observation_incomplete",
  "setup_unreadable",
  "plugins_uncounted",
  "setup_problems_unscored",
  "projects_gone",
  "version_unverified",
  "weak_human_requests",
  "overlapping_responses",
  "unclassified",
  "orphan_subsessions",
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

/**
 * 셋팅 쪽 알림과 실행 입력 알림. 있는데 읽지 못한 셋팅, 켜져 있는데 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제,
 * 지금 PC에 없는 프로젝트, 상태 파일이 깨져 새로 시작한 것, AQ를 내지 않은 것이다
 */
export function setupNotices(input: EvaluationInput, evaluation: Evaluation, run: { stateBroken: boolean }): Notice[] {
  const notices: Notice[] = [];
  if (evaluation.score.withheld.length > 0) notices.push({ kind: "score_withheld", reasons: [...evaluation.score.withheld] });
  if (run.stateBroken) notices.push({ kind: "state_reset" });

  for (const tool of input.tools) {
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

    // 도구가 쓰는 파일(.claude.json)의 문제는 읽지 못한 셋팅으로 이미 알린다. 사용자가 고치는 셋팅의 문제는 S3이 센다
    const problems = setup.problems.filter((problem) => problem.owner === "plugin" || problem.owner === "managed").map((problem) => ({ kind: problem.kind, path: problem.path }));
    if (problems.length > 0) notices.push({ kind: "setup_problems_unscored", tool: id, problems: problems.sort((a, b) => byText(a.path, b.path) || byText(a.kind, b.kind)) });
  }

  const gone = input.projects.filter((project) => !project.exists).map((project) => project.root);
  if (gone.length > 0) notices.push({ kind: "projects_gone", projects: sortedUnique(gone) });
  return sortNotices(notices);
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
        if (!observation.complete) notices.push({ kind: "observation_incomplete", tool: id, metric, reasons: [...observation.reasons] });
      }
      if (found.overlappingSessions > 0) notices.push({ kind: "overlapping_responses", tool: id, sessions: found.overlappingSessions });
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
