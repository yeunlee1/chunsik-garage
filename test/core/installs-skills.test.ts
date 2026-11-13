// E5(안 쓰는 스킬)를 시험한다. 위치를 스킬 묶음으로 합치기, 켜진 묶음만 세기, 읽지 못했을 때, 못 재는 까닭의 차례(설계 11.3 E5, 11.4, 21.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
import { sessionListings } from "../../src/core/installs/listing.ts";
import { usedSkillNames } from "../../src/core/installs/signals.ts";
import { judgeSkills } from "../../src/core/installs/skills.ts";
import { recordMap, type VerdictContext } from "../../src/core/installs/verdict.ts";
import type { ToolSetup } from "../../src/core/metrics/setup.ts";
import { projectLookup } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts, plugin, project, skill } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const lookup = projectLookup([], {});

interface Options {
  /** 점수 구간에 쓴 신호가 있는 스킬 이름 */
  used?: string[];
  /** 같은 정체로 14일 넘게 지켜본 스킬 */
  watched?: SkillFact[];
  complete?: boolean;
  coverage?: ToolCoverage;
}
const judge = (setup: Partial<ClaudeSetupFacts>, options: Options = {}) => {
  const sessions: SummaryInput[] = [{ days: { "2026-11-10": { responses: 1, skillSignals: Object.fromEntries((options.used ?? []).map((name) => [name, { tool: 1 }])) } } }];
  const summaries = sessions.map((s) => summary(s));
  const records: InstallRecord[] = (options.watched ?? []).map((fact) => ({ key: fact.installKey, firstSeen: "2026-09-01", appeared: false }));
  const context: VerdictContext = {
    day: { today: windows.today, timeZone: "Asia/Seoul" },
    windows,
    records: recordMap(records),
    used: usedSkillNames(summaries, windows),
    listings: sessionListings(summaries, "skill", {}, lookup),
    complete: options.complete ?? true,
  };
  const tool: ToolSetup = { tool: "claude-code", totals: toolTotals(summaries, windows, []), coverage: options.coverage ?? CLAUDE_COVERAGE, setup: facts(setup), highestVersion: "2.1.300" };
  return judgeSkills(tool, context);
};
const many = (prefix: string, count: number, input: Partial<SkillFact> = {}): SkillFact[] => Array.from({ length: count }, (_, i) => skill(`${prefix}${i + 1}`, input));
const names = (list: SkillFact[]): string[] => list.map((fact) => fact.name);
const verdicts = (judgement: ReturnType<typeof judge>) => judgement.bundles.map((bundle) => [bundle.positions.map((p) => `${p.scope}:${p.name}`).join("+"), bundle.verdict]);

describe("스킬 묶음", () => {
  const inProject = (name: string, input: Partial<SkillFact> = {}) => skill(name, { scope: "project", projectRoot: "/work/app", path: `/work/app/.claude/skills/${name}`, ...input });

  it("실제 경로가 같은 위치들은 스킬 하나다. 실제 경로를 모르는 위치는 그것만으로 하나다", () => {
    const skills = [skill("a", { realPath: "/store/a" }), inProject("a", { isLink: true, realPath: "/store/a" }), skill("b", { realPath: null }), inProject("b", { realPath: null }), skill("c")];
    expect(verdicts(judge({ skills })).map(([positions]) => positions)).toEqual(["user:a+project:a", "user:b", "project:b", "user:c"]);
  });
  it("위치 가운데 하나라도 썼다면 썼다. 모든 위치가 안 쓴 것이 확인됨이면 확인됨이다. 그 밖은 쓰는지 모름이다", () => {
    const linked = (name: string) => [skill(name, { realPath: `/store/${name}` }), inProject(`${name}-link`, { isLink: true, realPath: `/store/${name}`, targetCreatedMs: 0 })] as const;
    const [usedA, usedLink] = linked("used");
    const [idleA, idleLink] = linked("idle");
    const [halfA, halfLink] = linked("half");
    const judgement = judge({ skills: [usedA, usedLink, idleA, idleLink, halfA, halfLink] }, { used: ["used-link"], watched: [usedA, idleA, idleLink, halfA] });
    expect(verdicts(judgement)).toEqual([
      ["user:half+project:half-link", "unknown"],
      ["user:idle+project:idle-link", "unused"],
      ["user:used+project:used-link", "used"],
    ]);
  });
  it("위치 가운데 하나라도 훅이 내용을 넣어 주는 스킬이면 묶음은 쓰는지 모름이고 판정할 수 있는 대상에서 뺀다. 다른 위치에 쓴 신호가 있어도 같다", () => {
    const linked = (name: string) => [skill(name, { realPath: `/store/${name}` }), inProject(`${name}-alias`, { isLink: true, realPath: `/store/${name}`, targetCreatedMs: 0, hookProvided: true })] as const;
    const [idleA, idleAlias] = linked("idle");
    const [usedA, usedAlias] = linked("used");
    const judgement = judge({ skills: [idleA, idleAlias, usedA, usedAlias] }, { used: ["used"], watched: [idleA, idleAlias, usedA, usedAlias] });
    expect(verdicts(judgement)).toEqual([
      ["user:idle+project:idle-alias", "unknown"],
      ["user:used+project:used-alias", "unknown"],
    ]);
    expect(judgement.bundles.map((bundle) => bundle.excluded)).toEqual(["hook_provided", "hook_provided"]);
    expect(judgement.measurement.evidence).toMatchObject({ enabled: 2, judgeable: 0, structural: 2, used: 0, unused: 0 });
  });
  it("묶음 안의 위치는 입력의 차례와 상관없이 정해진다. 플러그인만 다르거나 경로만 다른 위치도 그렇다", () => {
    // 같은 원본을 두 마켓에서 깔면 이름, 범위, 실제 경로, 정체가 모두 같고 플러그인만 다르다
    const shared = (pluginId: string) => skill("p:s", { scope: "plugin", pluginId, path: "/plugins/shared/skills/s" });
    // 한 플러그인이 스킬을 찾는 폴더 둘에 같은 원본을 링크로 걸면 경로만 다르다
    const linked = (dir: string) => skill("q:t", { scope: "plugin", pluginId: "q@m", path: `/plugins/q/${dir}/t`, realPath: "/store/t", isLink: true, targetCreatedMs: 0 });
    const skills = [shared("p@b"), linked("skills"), shared("p@a"), linked("extra")];
    const order = (list: SkillFact[]) => judge({ skills: list, plugins: [plugin("p@a"), plugin("p@b"), plugin("q@m")] }).bundles.map((bundle) => bundle.positions.map((p) => `${p.pluginId} ${p.path}`));
    const expected = [
      ["p@a /plugins/shared/skills/s", "p@b /plugins/shared/skills/s"],
      ["q@m /plugins/q/extra/t", "q@m /plugins/q/skills/t"],
    ];
    expect(order(skills)).toEqual(expected);
    expect(order([...skills].reverse())).toEqual(expected);
  });
  it("이름, 범위, 실제 경로, 플러그인, 경로가 모두 같고 켜짐만 다른 위치 둘도 차례가 정해진다", () => {
    // 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 스캐너가 같은 설치를 두 길로 찾아 사실 둘을 낸다. 한쪽은 프로젝트의 설정만 봐서 꺼져 있다
    const twin = (enabled: boolean) => skill("r:u", { scope: "plugin", pluginId: "r@skills-dir", path: "/home/u/.claude/skills/r/skills/u", enabled, listed: enabled });
    const bundles = (list: SkillFact[]) => judge({ skills: list, plugins: [plugin("r@skills-dir")] }).bundles;
    const forward = bundles([twin(true), twin(false)]);
    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({ enabled: true });
    expect(forward[0]!.positions.map((p) => p.enabled).sort()).toEqual([false, true]);
    expect(JSON.stringify(bundles([twin(false), twin(true)]))).toBe(JSON.stringify(forward));
  });
  it("묶음의 켜짐은 위치 가운데 하나라도 켜져 있으면 켜진 것이다. 꺼 둔 묶음은 세지 않는다", () => {
    const skills = [skill("a", { realPath: "/store/a", enabled: false }), inProject("a", { isLink: true, realPath: "/store/a" }), skill("off", { enabled: false })];
    const judgement = judge({ skills });
    expect(judgement.bundles.map((bundle) => bundle.enabled)).toEqual([true, false]);
    expect(judgement.measurement.evidence).toMatchObject({ enabled: 1 });
  });
});

describe("E5 안 쓰는 스킬", () => {
  it("안 쓴 것이 확인된 스킬을 판정된 스킬로 나눈다. 쓰는지 모름은 분자와 분모에서 뺀다", () => {
    const used = many("used", 2);
    const idle = many("idle", 3);
    const fresh = many("fresh", 1);
    const judgement = judge({ skills: [...used, ...idle, ...fresh] }, { used: names(used), watched: [...used, ...idle] });
    expect(judgement.measurement).toEqual({ status: "scored", value: 0.6, evidence: { enabled: 6, judgeable: 6, judged: 5, structural: 0, unused: 3, used: 2 } });
    expect(judgement.bundles).toHaveLength(6);
  });
  it("꺼 둔 스킬은 안 쓴 것이 확인됐어도 세지 않는다", () => {
    const idle = many("idle", 5);
    const off = many("off", 4, { enabled: false });
    const judgement = judge({ skills: [...idle, ...off] }, { watched: [...idle, ...off] });
    expect(judgement.measurement).toMatchObject({ status: "scored", value: 1, evidence: { enabled: 5, unused: 5 } });
    expect(judgement.bundles.filter((bundle) => !bundle.enabled && bundle.verdict === "unused")).toHaveLength(4);
  });

  describe("못 재는 까닭의 차례", () => {
    const idle = many("idle", 6);
    const blank = { enabled: null, judgeable: null, judged: null, structural: null, unused: null, used: null };

    it("1. 스킬 사용을 기록하지 않는 도구는 unsupported다. 판정하지 않는다", () => {
      const judgement = judge({ skills: idle, claudeJson: "unparsable" }, { watched: idle, coverage: { ...CLAUDE_COVERAGE, skillUsage: "unsupported" } });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unsupported", evidence: blank });
      expect(judgement.bundles).toEqual([]);
    });
    it.each([
      ["~/.claude.json이 풀리지 않는다", { claudeJson: "unparsable" }],
      ["~/.claude.json을 열지 못한다", { claudeJson: "unreadable" }],
      ["~/.claude.json이 없다(도구의 집계를 모른다)", { claudeJson: "missing" }],
      ["사용자 스킬 폴더의 목록", { unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }],
      ["프로젝트의 스킬 폴더의 목록", { unreadableSkillPlaces: { user: false, projects: ["/work/app"], plugins: [] } }],
      ["플러그인의 설치 기록 파일", { pluginsFile: "unparsable" }],
      ["사용자 설정", { settings: { ...facts().settings, user: "unparsable" } }],
      ["관리 정책 파일", { settings: { ...facts().settings, managedParts: [{ path: "/etc/claude-code/managed-settings.d/10.json", status: "unreadable" }] } }],
      ["프로젝트 설정", { projects: [project("/work/app", { hasSettings: true, settingsStatus: "unparsable" })] }],
      ["로컬 설정", { projects: [project("/work/app", { hasLocalSettings: true, localSettingsStatus: "unreadable" })] }],
    ] as [string, Partial<ClaudeSetupFacts>][])("2. 읽지 못한 것이 있으면 unreadable이다. 안 쓴 것이 확인됨이 나오지 않는다: %s", (_name, setup) => {
      const judgement = judge({ skills: idle, ...setup }, { watched: idle, complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unreadable", evidence: blank });
      expect(judgement.bundles).toEqual([]);
    });
    it("프로젝트의 .mcp.json과 없는 파일은 E5와 상관없다", () => {
      const setup = { skills: idle, pluginsFile: "missing" as const, settings: { ...facts().settings, user: "missing" as const }, projects: [project("/work/app", { mcpJsonStatus: "unparsable" })] };
      expect(judge(setup, { watched: idle }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
    it("3. 켜져 있는 스킬이 하나도 없으면 not_applicable이다. 관측이 빠졌어도 같다", () => {
      const zero = { enabled: 0, judgeable: 0, judged: 0, structural: 0, unused: 0, used: 0 };
      expect(judge({}, { complete: false }).measurement).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: zero });
      expect(judge({ skills: many("off", 3, { enabled: false }) }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    });
    it("4. 켜져 있는 스킬은 있는데 판정할 수 있는 대상이 하나도 없으면 unsupported다", () => {
      const hooked = many("hooked", 3, { hookProvided: true });
      expect(judge({ skills: hooked }, { watched: hooked, complete: false }).measurement).toEqual({
        status: "unmeasured",
        reason: "unsupported",
        evidence: { enabled: 3, judgeable: 0, judged: 0, structural: 3, unused: 0, used: 0 },
      });
    });
    it("5. 관측이 빠짐없지 않으면 incomplete다. 쓴 것은 썼다로 남고 안 쓴 것이 확인됨은 나오지 않는다", () => {
      const judgement = judge({ skills: idle }, { used: ["idle1"], watched: idle, complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "incomplete", evidence: { enabled: 6, judgeable: 6, judged: 1, structural: 0, unused: 0, used: 1 } });
      expect(judgement.bundles.some((bundle) => bundle.verdict === "unused")).toBe(false);
    });
    it("6. 판정할 수 있는 대상이 5개에 못 미치면 too_little이다. 모두 판정돼도 분모가 모자란다. 판정은 그대로다", () => {
      const few = many("idle", 4);
      const hooked = many("hooked", 7, { hookProvided: true });
      const judgement = judge({ skills: [...few, ...hooked] }, { watched: few });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 11, judgeable: 4, judged: 4, structural: 7, unused: 4, used: 0 } });
      expect(judgement.bundles.filter((bundle) => bundle.verdict === "unused")).toHaveLength(4);
    });
    it("5와 6이 겹치면 5가 먼저다. 관측이 빠졌으면 판정할 수 있는 대상이 모자라도 incomplete다", () => {
      const few = many("idle", 4);
      expect(judge({ skills: few }, { watched: few, complete: false }).measurement).toEqual({ status: "unmeasured", reason: "incomplete", evidence: { enabled: 4, judgeable: 4, judged: 0, structural: 0, unused: 0, used: 0 } });
      expect(judge({ skills: few }, { watched: few }).measurement).toMatchObject({ status: "unmeasured", reason: "too_little" });
    });
    it("3과 4는 5보다 먼저다. 관측이 빠졌어도 켜져 있는 것이 없으면 not_applicable이고 판정할 수 있는 대상이 없으면 unsupported다", () => {
      expect(judge({ skills: many("off", 2, { enabled: false }) }, { complete: false }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
      expect(judge({ skills: many("hooked", 2, { hookProvided: true }) }, { complete: false }).measurement).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    });
    it("6과 7이 겹치면 6이 먼저다. 판정할 수 있는 대상이 모자라면 판정된 것이 절반에 못 미쳐도 too_little이다", () => {
      expect(judge({ skills: many("s", 4) }, { watched: many("s", 1) }).measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 4, judgeable: 4, judged: 1, structural: 0, unused: 1, used: 0 } });
    });
    it("7. 판정된 것이 판정할 수 있는 대상의 절반에 못 미치면 watching이다", () => {
      const judgement = judge({ skills: many("s", 11) }, { watched: many("s", 5) });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "watching", evidence: { enabled: 11, judgeable: 11, judged: 5, structural: 0, unused: 5, used: 0 } });
      expect(judge({ skills: many("s", 10) }, { watched: many("s", 5) }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
    it("7. 절반을 넘었어도 판정된 것이 5개에 못 미치면 watching이다", () => {
      expect(judge({ skills: many("s", 6) }, { watched: many("s", 4) }).measurement).toMatchObject({ status: "unmeasured", reason: "watching", evidence: { judgeable: 6, judged: 4 } });
    });
  });

  describe("구조상 판정할 수 없는 것", () => {
    const idle = many("idle", 5);
    it("훅이 내용을 넣어 주는 스킬은 판정할 수 있는 대상에서 뺀다. 쓴 신호가 있어도 썼다로 세지 않는다", () => {
      const hooked = [skill("hooked-idle", { hookProvided: true }), skill("hooked-used", { hookProvided: true })];
      const judgement = judge({ skills: [...idle, ...hooked] }, { used: ["hooked-used"], watched: [...idle, ...hooked] });
      expect(judgement.measurement).toEqual({ status: "scored", value: 1, evidence: { enabled: 7, judgeable: 5, judged: 5, structural: 2, unused: 5, used: 0 } });
      expect(judgement.bundles.find((bundle) => bundle.positions[0]!.name === "hooked-idle")).toMatchObject({ verdict: "unknown", excluded: "hook_provided" });
      expect(judgement.bundles.find((bundle) => bundle.positions[0]!.name === "hooked-used")).toMatchObject({ verdict: "unknown", excluded: "hook_provided" });
    });
    it("켜져 있는 스킬 스물 가운데 열일곱이 훅이 내용을 넣어 주는 스킬이면 판정할 수 있는 대상은 셋이라서 too_little이다. 그 가운데 쓴 것이 있어도 같다", () => {
      const few = many("idle", 3);
      const hooked = many("hooked", 17, { hookProvided: true });
      const judgement = judge({ skills: [...few, ...hooked] }, { used: names(hooked).slice(0, 9), watched: [...few, ...hooked] });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 20, judgeable: 3, judged: 3, structural: 17, unused: 3, used: 0 } });
    });
    it("스킬을 찾는 폴더의 목록을 읽지 못한 플러그인의 스킬은 읽힌 것도 세지 않고 잰다", () => {
      const partial = [skill("p:read", { scope: "plugin", pluginId: "p@m", path: "/plugins/p/skills/read" }), skill("p:used", { scope: "plugin", pluginId: "p@m", path: "/plugins/p/extra/used" })];
      const setup = { skills: [...idle, ...partial], plugins: [plugin("p@m")], unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } };
      const judgement = judge(setup, { used: ["p:used"], watched: [...idle, ...partial] });
      expect(judgement.measurement).toEqual({ status: "scored", value: 1, evidence: { enabled: 7, judgeable: 5, judged: 5, structural: 2, unused: 5, used: 0 } });
      expect(judgement.bundles.filter((bundle) => bundle.excluded === "plugin_unread").map((bundle) => bundle.verdict)).toEqual(["unknown", "unknown"]);
    });
    it("구성을 모르는 플러그인이나 훅을 읽지 못한 플러그인이 켜져 있어도 잰다", () => {
      const setup = { skills: idle, plugins: [plugin("unknown@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true }), plugin("nohooks@m", { hooksUnreadable: true })], pluginsWithoutInstall: ["ghost@m"] };
      expect(judge(setup, { watched: idle }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
  });
});
