// 평가 결과의 알림 열세 종류의 문장. 종류, 정해진 값, 수만 넣고 이름과 경로는 넣지 않아 터미널 요약에도 같은 문장이 간다(순수 함수, 설계 12.2, 19.1, 20.1, 「2단계 3부 계획에서 보완」의 알림 표)
import type { ObservationReason } from "../../adapters/claude/observation.ts";
import type { Notice, UncountedPlugin, UnreadableSetup } from "../result/notices.ts";
import type { Withheld } from "../scoreboard.ts";
import { TOOL_NAMES } from "./common.ts";
import { fill } from "./format.ts";
import type { Lang, Texts } from "./lang.ts";

/** AQ를 내지 않은 까닭 */
export const WITHHELD_COPY: Record<Withheld, Texts<string>> = {
  too_few_requests: { en: "There were fewer than 20 requests from you in the scoring window.", ko: "점수 구간의 사람 요청이 20개에 못 미칩니다." },
  too_few_days: { en: "The tools were used on fewer than 3 days in the scoring window.", ko: "점수 구간에 쓴 날이 3일에 못 미칩니다." },
  no_axes: { en: "None of the four criteria could be measured.", ko: "잴 수 있는 기준이 하나도 없습니다." },
};

const METRIC: Record<"skills" | "mcp", Texts<string>> = {
  skills: { en: "skill use", ko: "스킬 사용" },
  mcp: { en: "MCP calls", ko: "MCP 호출" },
};

const OBSERVATION_REASON: Record<ObservationReason, Texts<string>> = {
  "unreadable-files": { en: "unreadable files", ko: "읽지 못한 파일" },
  "too-long-lines": { en: "lines too long", ko: "너무 긴 줄" },
  "unconfirmed-pieces": { en: "unconfirmed pieces", ko: "확인하지 못한 조각" },
};

const UNREADABLE_SETUP: Record<UnreadableSetup, Texts<string>> = {
  claude_json: { en: ".claude.json", ko: ".claude.json" },
  user_settings: { en: "user settings", ko: "사용자 설정" },
  managed_settings: { en: "managed policy", ko: "관리 정책" },
  project_settings: { en: "project settings", ko: "프로젝트 설정" },
  local_settings: { en: "local settings", ko: "로컬 설정" },
  mcp_json: { en: "project .mcp.json", ko: "프로젝트의 .mcp.json" },
  plugins_file: { en: "plugin install records", ko: "플러그인 설치 기록" },
  skill_dirs: { en: "skill folders", ko: "스킬 폴더" },
  instructions: { en: "instruction files", ko: "지침 파일" },
  hook_settings: { en: "settings with hooks", ko: "훅을 적은 설정" },
  skill_files: { en: "SKILL.md files", ko: "SKILL.md" },
};

const UNCOUNTED: Record<UncountedPlugin, Texts<string>> = {
  composition_unknown: { en: "contents unknown", ko: "구성을 모름" },
  not_installed: { en: "not in the install records", ko: "설치 기록에 없음" },
  skills_unreadable: { en: "skill folder could not be read", ko: "스킬 폴더를 읽지 못함" },
  mcp_unreadable: { en: "MCP definitions could not be read", ko: "MCP 정의를 읽지 못함" },
  hooks_unreadable: { en: "hooks could not be read", ko: "훅을 읽지 못함" },
};

/** 분류하지 못한 기록의 묶음. 알림의 what은 compaction, denial:<종류>, hook:<종류>다 */
const UNCLASSIFIED: Record<"compaction" | "denial" | "hook", Texts<string>> = {
  compaction: { en: "{count} {count:compaction|compactions}", ko: "압축 {count}개" },
  denial: { en: "{count} {count:denial marker|denial markers}", ko: "거절 표시 {count}개" },
  hook: { en: "{count} {count:hook attachment|hook attachments}", ko: "훅 첨부 {count}개" },
};

/** 알림마다의 틀 */
const LINES: Texts<Record<Exclude<Notice["kind"], "score_withheld">, string> & { withheld: string; setupCounted: string }> = {
  en: {
    withheld: "No AQ was given. {reasons}",
    state_reset: "The state file was broken, so a new one was started. The record of watched installs builds up again from the start.",
    record_unreadable: "{tool}: {files} {files:file|files} and {dirs} {dirs:folder|folders} of records could not be read. Only what was read is counted.",
    observation_incomplete: "{tool}: the records of {metric} could not all be read ({reasons}), so unused ones were not judged.",
    setup_unreadable: "{tool}: some setup could not be read ({what}). Only what was read is counted.",
    setupCounted: "{tool}: some setup could not be read ({what}, {count} {count:place|places}). Only what was read is counted.",
    plugins_uncounted: "{tool}: {count} enabled {count:plugin has|plugins have} information that could not be fully inspected ({why}).",
    setup_problems_unscored: "{tool}: {count} {count:problem was|problems were} found in places that scores do not count (inside plugins, managed policy, files the tool writes).",
    projects_gone: "{count} {count:project|projects} whose folder is no longer on this PC {count:was|were} left out of the rules that look at instructions and settings.",
    version_unverified: "{tool}: the records include {count} {count:version|versions} outside the verified range ({from} to {to}). Only the fields that could be read are counted.",
    weak_human_requests: "{tool}: {weak} of {total} requests in the scoring window have weak evidence of coming from a person.",
    overlapping_responses: "{tool}: {sessions} {sessions:session starts|sessions start} with responses that also appear in another session. The overlap was not removed from the counts.",
    unclassified: "{tool}: some records could not be classified ({items}).",
    orphan_subsessions: "{tool}: {sessions} {sessions:subsession has|subsessions have} no known parent session.",
  },
  ko: {
    withheld: "AQ를 내지 않았습니다. {reasons}",
    state_reset: "상태 파일이 깨져 새로 시작했습니다. 설치를 지켜본 기록이 처음부터 다시 쌓입니다.",
    record_unreadable: "{tool} 기록 가운데 읽지 못한 파일 {files}개와 폴더 {dirs}개가 있습니다. 읽은 것만으로 계산했습니다.",
    observation_incomplete: "{tool}의 {metric} 기록을 빠짐없이 읽지 못해({reasons}) 안 쓰는 것을 판정하지 않았습니다.",
    setup_unreadable: "{tool}에서 읽지 못한 셋팅이 있습니다({what}). 읽은 것만으로 계산했습니다.",
    setupCounted: "{tool}에서 읽지 못한 셋팅이 있습니다({what} {count}곳). 읽은 것만으로 계산했습니다.",
    plugins_uncounted: "{tool}에서 켜져 있는 플러그인 {count}개에 확인하지 못한 정보가 있습니다({why}).",
    setup_problems_unscored: "{tool}에서 점수에 세지 않는 곳(플러그인 안, 관리 정책, 도구가 쓰는 파일)에 문제가 {count}개 있습니다.",
    projects_gone: "작업 폴더가 지금 PC에 없는 프로젝트 {count}개는 지침과 설정을 보는 규칙에서 뺐습니다.",
    version_unverified: "{tool} 기록에 확인한 범위({from}~{to}) 밖의 버전이 {count}개 있습니다. 읽을 수 있는 필드만으로 계산했습니다.",
    weak_human_requests: "{tool}의 점수 구간 사람 요청 {total}개 가운데 {weak}개는 사람이 보냈다는 근거가 약합니다.",
    overlapping_responses: "{tool}에서 처음 나온 응답이 다른 세션과 겹치는 세션이 {sessions}개 있습니다. 겹친 응답을 빼지 않고 셌습니다.",
    unclassified: "{tool}에 분류하지 못한 기록이 있습니다({items}).",
    orphan_subsessions: "{tool}에 부모 세션을 모르는 하위 세션이 {sessions}개 있습니다.",
  },
};

const LIST_JOIN = ", ";

function unclassifiedItems(counts: readonly { what: string; count: number }[], lang: Lang): string {
  const groups = (["compaction", "denial", "hook"] as const).map((group) => ({ group, count: counts.filter((item) => item.what.split(":")[0] === group).reduce((sum, item) => sum + item.count, 0) }));
  return groups
    .filter((item) => item.count > 0)
    .map((item) => fill(UNCLASSIFIED[item.group][lang], { count: item.count }))
    .join(LIST_JOIN);
}

export function noticeText(notice: Notice, lang: Lang): string {
  const lines = LINES[lang];
  const tool = "tool" in notice ? TOOL_NAMES[notice.tool][lang] : "";
  switch (notice.kind) {
    case "score_withheld":
      return fill(lines.withheld, { reasons: notice.reasons.map((reason) => WITHHELD_COPY[reason][lang]).join(" ") });
    case "state_reset":
      return lines.state_reset;
    case "record_unreadable":
      return fill(lines.record_unreadable, { tool, files: notice.files.length, dirs: notice.dirs.length });
    case "observation_incomplete":
      return fill(lines.observation_incomplete, { tool, metric: METRIC[notice.metric][lang], reasons: notice.reasons.map((reason) => OBSERVATION_REASON[reason][lang]).join(LIST_JOIN) });
    case "setup_unreadable": {
      const what = UNREADABLE_SETUP[notice.what][lang];
      return notice.targets.length > 0 ? fill(lines.setupCounted, { tool, what, count: notice.targets.length }) : fill(lines.setup_unreadable, { tool, what });
    }
    case "plugins_uncounted":
      return fill(lines.plugins_uncounted, { tool, count: notice.plugins.length, why: UNCOUNTED[notice.why][lang] });
    case "setup_problems_unscored":
      return fill(lines.setup_problems_unscored, { tool, count: notice.problems.length });
    case "projects_gone":
      return fill(lines.projects_gone, { count: notice.projects.length });
    case "version_unverified":
      return fill(lines.version_unverified, { tool, count: notice.versions.length, from: notice.verified.from, to: notice.verified.to });
    case "weak_human_requests":
      return fill(lines.weak_human_requests, { tool, weak: notice.weak, total: notice.total });
    case "overlapping_responses":
      return fill(lines.overlapping_responses, { tool, sessions: notice.sessions });
    case "unclassified":
      return fill(lines.unclassified, { tool, items: unclassifiedItems(notice.counts, lang) });
    case "orphan_subsessions":
      return fill(lines.orphan_subsessions, { tool, sessions: notice.sessions });
  }
}
