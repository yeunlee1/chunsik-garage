// 정비 후보를 낸다. A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기다. 판정만으로 내지 않고 꺼도 되는지를 따로 본다. 적용은 하지 않는다(순수 함수, 설계 16.1, 16.2)
import type { ToolId } from "../../adapters/types.ts";
import type { PluginFact } from "../../scan/types.ts";
import type { ToolSetup } from "../metrics/setup.ts";
import { RECENT_USE_DAYS, msOlderThan, type EvalDay } from "./age.ts";
import type { ServerJudgement } from "./servers.ts";
import type { SkillBundle, SkillJudgement } from "./skills.ts";

/** 이 도구 자신. 정비 후보에서 뺀다. 이름뿐 아니라 플러그인과 실제 경로로도 견준다(설계 16.2) */
export interface SelfIdentity {
  /** 이 도구의 스킬 이름 */
  skillNames: readonly string[];
  /** 이 도구의 플러그인 이름(마켓 항목의 이름과 구성 요소의 이름) */
  pluginNames: readonly string[];
  /** 이 도구의 스킬 폴더의 실제 경로(정규화한 것) */
  skillRealPaths: readonly string[];
}

export const NO_SELF: SelfIdentity = { skillNames: [], pluginNames: [], skillRealPaths: [] };

export interface Candidate {
  /** '<단위>:<도구>:<바꾸는 열쇠>' */
  id: string;
  unit: "A1" | "A2" | "A3";
  /** 이 후보가 나온 규칙 */
  rule: "E5" | "E6";
  tool: ToolId;
  /** 바꾸는 열쇠. A1은 스킬 이름(skillOverrides), A2는 설치 ID(enabledPlugins), A3은 서버 이름(deniedMcpServers) */
  target: string;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function candidatesOf(tool: ToolSetup, skills: SkillJudgement, servers: ServerJudgement, day: EvalDay, self: SelfIdentity): Candidate[] {
  const { setup } = tool;
  const enabledPlugins = setup.plugins.filter((plugin) => plugin.enabled);
  // 설정에 켜 두었는데 설치 기록에 없는 플러그인도 구성을 모르는 플러그인이다
  const unknownPlugin = enabledPlugins.some((plugin) => !plugin.compositionKnown) || setup.pluginsWithoutInstall.length > 0;
  // 훅을 볼 수 없는 켜진 플러그인이 있으면 그 훅이 어느 스킬의 경로를 가리키는지 모른다. 스킬을 끄는 후보를 내지 않는다
  const hooksUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.hooksUnreadable);
  // 서버 막기는 이름으로 듣는다. 같은 이름의 서버가 있는지 알 수 없으면 내지 않는다
  const serversUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.mcpUnreadable);
  const selfPaths = new Set(self.skillRealPaths);
  const selfPlugins = new Set(setup.plugins.filter((plugin) => self.pluginNames.includes(plugin.entryName) || self.pluginNames.includes(plugin.name)).map((plugin) => plugin.id));
  /** 이 도구 자신의 스킬이 든 묶음. 위치 가운데 하나라도 실제 경로, 이름 꼴(폴더 이름과 머리말 이름), 플러그인으로 이 도구의 것이면 그렇다 */
  const isSelfBundle = (bundle: SkillBundle): boolean =>
    bundle.positions.some(
      (skill) => (skill.realPath !== null && selfPaths.has(skill.realPath)) || skill.recordNames.some((name) => self.skillNames.includes(name)) || (skill.pluginId !== null && selfPlugins.has(skill.pluginId)),
    );
  /**
   * 사용자 설정에서 그 이름을 끄면 같이 꺼질 수 있는 스킬 묶음. 설정은 스킬의 폴더 이름과 머리말 이름 어느 쪽으로도 듣는다. 스캐너가 켜짐을 정할 때 쓰는 이름 꼴이 그것이다.
   * 엄한 쪽으로 넓게 잡는다. 플러그인 스킬에는 이 설정이 듣지 않는다고 문서에 있지만 실제로 본 것이 아니라서(설계 27) 범위를 가리지 않는다.
   * 꺼 둔 것도 넣는다. 프로젝트의 설정이 다시 켜는 경우까지 따지지 않으려는 것이다
   */
  const turnedOffBy = (target: string): SkillBundle[] => skills.bundles.filter((bundle) => bundle.positions.some((position) => position.recordNames.includes(target)));
  const confirmed = (bundle: SkillBundle): boolean => bundle.verdict === "unused" && bundle.excluded === null;
  // 머리말의 이름을 모르는 스킬이 있으면 그 이름이 끄는 이름과 같을 수 있다. 같이 꺼지는 것을 다 알 수 없다. 범위와 켜짐을 가리지 않는다
  const namesUnknown = setup.skills.some((skill) => skill.nameUnreadable || !skill.readable);

  const a1 = new Set<string>();
  const a2 = new Set<string>();
  const a3 = new Set<string>();

  if (!hooksUnseen) {
    // A1. 사용자 범위 위치의 이름으로 끈다. 이름으로 듣는 설정이라 같이 꺼지는 스킬이 모두 안 쓴 것이 확인됨이어야 하고, 그 가운데 이 도구 자신이 없어야 한다
    if (!namesUnknown) {
      for (const bundle of skills.bundles) {
        if (!bundle.enabled || !confirmed(bundle)) continue;
        for (const skill of bundle.positions) {
          if (skill.scope !== "user" || !skill.enabled || skill.managedFixed) continue;
          // 이 묶음도 같이 꺼지는 것에 든다(그 이름이 이 위치의 이름 꼴이다)
          const affected = turnedOffBy(skill.name);
          if (affected.every(confirmed) && !affected.some(isSelfBundle)) a1.add(skill.name);
        }
      }
    }

    // A2. 스킬만 든 플러그인의 스킬이 모두 안 쓴 것이 확인됨일 때 플러그인을 끈다
    const uncounted = new Set(setup.unreadableSkillPlaces.plugins);
    const usageStale = (plugin: PluginFact): boolean => setup.claudeJson === "ok" && !plugin.usageUndated && (plugin.usageLastUsedMs === null || msOlderThan(day, plugin.usageLastUsedMs, RECENT_USE_DAYS));
    for (const plugin of enabledPlugins) {
      // 사용자 범위로만 깐 플러그인만 낸다. 같은 ID가 프로젝트에도 있으면 같은 열쇠로 켜지고 꺼져서 프로젝트의 것까지 꺼진다
      const sameId = setup.plugins.filter((other) => other.id === plugin.id);
      if (sameId.length !== 1 || plugin.scopes.length !== 1 || plugin.scopes[0] !== "user") continue;
      if (!plugin.exists || !plugin.compositionKnown || plugin.managedFixed || plugin.mcpUnreadable || uncounted.has(plugin.id)) continue;
      if (self.pluginNames.includes(plugin.entryName) || self.pluginNames.includes(plugin.name)) continue;
      // ② 스킬 말고는 아무것도 들어 있지 않다. ③ 알아보지 못한 구성 요소가 없다. ④ 도구의 집계가 없거나 30일 넘게 전이다
      if (plugin.components.some((component) => component !== "skills") || plugin.unknownEntries.length > 0 || !usageStale(plugin)) continue;
      // ⑤ 켜져 있는 다른 플러그인이 기대지 않는다. 기대는지 알 수 없으면 후보가 아니다(구성을 모르는 켜진 플러그인은 위에서 이미 걸렀다)
      if (enabledPlugins.some((other) => other.id !== plugin.id && (other.dependencies === null || other.dependencies.includes(plugin.entryName)))) continue;
      // ① 스킬이 하나 이상이고 모두 안 쓴 것이 확인됨이다. 묶음으로 센다
      const own = skills.bundles.filter((bundle) => bundle.positions.some((skill) => skill.pluginId === plugin.id));
      if (own.length === 0 || !own.every(confirmed) || own.some(isSelfBundle)) continue;
      a2.add(plugin.id);
    }
  }

  if (!serversUnseen) {
    // A3. 사용자 범위 서버를 이름으로 막는다. 같은 이름의 서버가 다른 범위에 켜져 있으면 그것도 안 부른 것이 확인됨이어야 한다
    for (const judged of servers.servers) {
      const { server } = judged;
      if (server.scope !== "user" || !server.enabled || server.managedFixed || judged.verdict !== "unused" || judged.excluded !== null) continue;
      const sameName = servers.servers.filter((other) => other !== judged && other.server.enabled && other.server.name === server.name);
      if (sameName.every((other) => other.verdict === "unused" && other.excluded === null)) a3.add(server.name);
    }
  }

  const make = (unit: Candidate["unit"], rule: Candidate["rule"], targets: ReadonlySet<string>): Candidate[] =>
    [...targets].sort(byText).map((target) => ({ id: `${unit}:${tool.tool}:${target}`, unit, rule, tool: tool.tool, target }));
  return [...make("A1", "E5", a1), ...make("A2", "E5", a2), ...make("A3", "E6", a3)];
}
