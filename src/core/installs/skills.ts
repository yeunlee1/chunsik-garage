// E5(안 쓰는 스킬)를 도구 하나에서 잰다. 위치마다 판정한 뒤 실제 경로가 같은 위치들을 스킬 묶음 하나로 합쳐 센다(순수 함수, 설계 10 「위치와 스킬 묶음」, 11.3 E5)
import type { SkillFact } from "../../scan/types.ts";
import { blank, unmeasured, type Measurement } from "../measure.ts";
import type { ToolSetup } from "../metrics/setup.ts";
import { byContent } from "../order.ts";
import { enablementUnread, unread } from "../readability.ts";
import { BLANK_INSTALL_EVIDENCE, measureInstalls } from "./gate.ts";
import { skillVerdict, type Verdict, type VerdictContext } from "./verdict.ts";

/** E5의 분모(판정된 스킬)와 판정할 수 있는 대상의 최소 개수 */
export const MIN_JUDGED_SKILLS = 5;

/** 스킬 하나. 한 도구 안에서 실제 경로가 같은 위치들이다 */
export interface SkillBundle {
  /** 이름, 범위(사용자, 프로젝트, 플러그인), 경로의 차례다 */
  positions: SkillFact[];
  /** 위치 가운데 하나라도 켜져 있다. E5는 켜져 있는 묶음만 센다 */
  enabled: boolean;
  /** 위치 가운데 하나라도 썼다면 썼다. 모든 위치가 안 쓴 것이 확인됨이면 확인됨이다. 그 밖은 쓰는지 모름이다. 구조상 판정할 수 없는 묶음은 늘 쓰는지 모름이다 */
  verdict: Verdict;
  /**
   * 구조상 판정할 수 없어 판정할 수 있는 대상에서 뺀 까닭. plugin_unread는 스킬을 찾는 폴더의 목록을 읽지 못한 플러그인의 스킬이고(읽힌 것도 세지 않는다),
   * hook_provided는 위치 가운데 하나라도 훅이 내용을 넣어 주는 스킬인 묶음이다(다른 위치에 쓴 신호가 있어도 뺀다. 같은 내용이 훅으로 실린다). 판정할 수 있으면 null이다
   */
  excluded: "plugin_unread" | "hook_provided" | null;
}

export interface SkillJudgement {
  measurement: Measurement;
  /** 판정한 묶음 모두(꺼 둔 것도 든다). 읽지 못했거나 스킬 사용을 기록하지 않는 도구에서는 판정하지 않아 비어 있다 */
  bundles: SkillBundle[];
}

const SCOPE_ORDER = { user: 0, project: 1, plugin: 2 } as const;
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/**
 * 위치의 차례. 이름, 범위, 실제 경로의 차례이고(설계 11.5) 그것이 같으면 정체, 플러그인, 경로, 내용까지 견줘 끝까지 정한다.
 * 같은 원본을 두 마켓에서 깐 플러그인의 스킬은 플러그인만 다르고, 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 켜짐만 다른 사실 둘이 온다.
 */
const byPosition = (a: SkillFact, b: SkillFact): number =>
  byText(a.name, b.name) ||
  SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
  byText(a.realPath ?? a.path, b.realPath ?? b.path) ||
  byText(a.installKey, b.installKey) ||
  byText(a.pluginId ?? "", b.pluginId ?? "") ||
  byText(a.path, b.path) ||
  byContent(a, b);

/** 설치를 찾는 곳, 설정 파일, 도구의 집계 가운데 읽지 못한 것이 있다. 집계가 든 파일은 없을 때도 모르는 것이다(설계 11.3 「설치를 찾는 곳을 읽지 못했을 때」) */
function skillsUnread(tool: ToolSetup): boolean {
  const { setup } = tool;
  const places = setup.unreadableSkillPlaces;
  return setup.claudeJson !== "ok" || places.user || places.projects.length > 0 || unread(setup.pluginsFile) || enablementUnread(setup);
}

export function judgeSkills(tool: ToolSetup, context: VerdictContext): SkillJudgement {
  const { setup } = tool;
  if (tool.coverage.skillUsage === "unsupported") return { measurement: unmeasured("unsupported", blank(BLANK_INSTALL_EVIDENCE)), bundles: [] };
  // 대상을 모르면 분모가 몇인지도 따질 수 없다. 판정하지 않으므로 안 쓴 것이 확인됨도 정비 후보도 나오지 않는다
  if (skillsUnread(tool)) return { measurement: unmeasured("unreadable", blank(BLANK_INSTALL_EVIDENCE)), bundles: [] };

  const uncounted = new Set(setup.unreadableSkillPlaces.plugins);
  const grouped = new Map<string, SkillFact[]>();
  for (const skill of [...setup.skills].sort(byPosition)) {
    // 실제 경로를 알 수 없는 위치는 다른 위치와 묶지 않는다
    const key = skill.realPath ?? `\u0000${skill.installKey}`;
    const positions = grouped.get(key);
    if (positions === undefined) grouped.set(key, [skill]);
    else positions.push(skill);
  }
  const bundles: SkillBundle[] = [];
  for (const positions of grouped.values()) {
    const fromUnreadPlugin = positions.some((skill) => skill.pluginId !== null && uncounted.has(skill.pluginId));
    const excluded = fromUnreadPlugin ? "plugin_unread" : positions.some((skill) => skill.hookProvided) ? "hook_provided" : null;
    const verdicts = positions.map((skill) => skillVerdict(skill, setup.claudeJson, context));
    const verdict: Verdict = excluded !== null ? "unknown" : verdicts.includes("used") ? "used" : verdicts.every((v) => v === "unused") ? "unused" : "unknown";
    bundles.push({ positions, enabled: positions.some((skill) => skill.enabled), verdict, excluded });
  }
  const counted = bundles.filter((bundle) => bundle.enabled).map((bundle) => ({ verdict: bundle.verdict, structural: bundle.excluded !== null }));
  return { measurement: measureInstalls(counted, context.complete, MIN_JUDGED_SKILLS), bundles };
}
