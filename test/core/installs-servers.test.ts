// E6(안 쓰는 MCP 서버)을 시험한다. 켜진 서버만 세기, 정의를 읽지 못하는 서버, 읽지 못했을 때, 못 재는 까닭의 차례(설계 11.3 E6, 11.4, 21.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
import { sessionListings } from "../../src/core/installs/listing.ts";
import { judgeServers } from "../../src/core/installs/servers.ts";
import { calledMcpNames } from "../../src/core/installs/signals.ts";
import { recordMap, type VerdictContext } from "../../src/core/installs/verdict.ts";
import type { ToolSetup } from "../../src/core/metrics/setup.ts";
import { projectLookup } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, McpFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts, mcpServer, plugin, project } from "../helpers/facts.ts";
import { summary } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const lookup = projectLookup([], {});

interface Options {
  /** 점수 구간에 부른 기록이 있는 이름(호출한 도구 이름의 서버 자리) */
  called?: string[];
  /** 같은 정의로 14일 넘게 지켜본 서버. null이면 첫 점검이다 */
  watched?: McpFact[] | null;
  complete?: boolean;
  coverage?: ToolCoverage;
}
const judge = (setup: Partial<ClaudeSetupFacts>, options: Options = {}) => {
  const summaries = [summary({ days: { "2026-11-10": { responses: 1, mcpCalls: Object.fromEntries((options.called ?? []).map((name) => [name, 1])) } } })];
  const records: InstallRecord[] | null = options.watched === null ? null : (options.watched ?? []).flatMap((fact) => (fact.installKey === null ? [] : [{ key: fact.installKey, firstSeen: "2026-09-01", appeared: false }]));
  const context: VerdictContext = {
    day: { today: windows.today, timeZone: "Asia/Seoul" },
    windows,
    records: recordMap(records),
    used: calledMcpNames(summaries, windows),
    listings: sessionListings(summaries, "mcp", {}, lookup),
    complete: options.complete ?? true,
  };
  const tool: ToolSetup = { tool: "claude-code", totals: toolTotals(summaries, windows, []), coverage: options.coverage ?? CLAUDE_COVERAGE, setup: facts(setup), highestVersion: "2.1.300" };
  return judgeServers(tool, context);
};
const many = (prefix: string, count: number, input: Partial<McpFact> = {}): McpFact[] => Array.from({ length: count }, (_, i) => mcpServer(`${prefix}${i + 1}`, input));
const remote = (name: string) => mcpServer(name, { scope: "claude-ai", definitionHash: null });

describe("E6 안 쓰는 MCP 서버", () => {
  it("안 부른 것이 확인된 서버를 판정된 서버로 나눈다. 쓰는지 모름은 분자와 분모에서 뺀다", () => {
    const called = many("called", 1);
    const idle = many("idle", 2);
    const fresh = many("fresh", 1);
    const judgement = judge({ mcpServers: [...called, ...idle, ...fresh] }, { called: ["called1"], watched: [...called, ...idle] });
    expect(judgement.measurement).toEqual({ status: "scored", value: 2 / 3, evidence: { enabled: 4, judgeable: 4, judged: 3, structural: 0, unused: 2, used: 1 } });
    expect(judgement.servers.map((s) => [s.server.name, s.verdict])).toEqual([["called1", "used"], ["fresh1", "unknown"], ["idle1", "unused"], ["idle2", "unused"]]);
  });
  it("설정 층을 합쳐 켜져 있는 서버만 센다. 막아 둔 서버는 안 불렀어도 세지 않는다", () => {
    const idle = many("idle", 2);
    const blocked = many("blocked", 3, { enabled: false });
    const judgement = judge({ mcpServers: [...idle, ...blocked] }, { watched: [...idle, ...blocked] });
    expect(judgement.measurement).toMatchObject({ status: "scored", value: 1, evidence: { enabled: 2, unused: 2 } });
    expect(judgement.servers).toHaveLength(5);
  });
  it("플러그인이 넣은 서버는 그 서버의 이름 꼴로 부른 기록을 잇는다. 같은 이름의 사용자 범위 서버와 가려진다", () => {
    const fromPlugin = mcpServer("db", { scope: "plugin", pluginId: "p@m", recordNames: ["plugin:p:db", "plugin_p_db"] });
    const own = mcpServer("db");
    const judgement = judge({ mcpServers: [own, fromPlugin], plugins: [plugin("p@m", { components: ["mcpServers"] })] }, { called: ["plugin_p_db"], watched: [own, fromPlugin] });
    expect(judgement.servers.map((s) => [s.server.scope, s.verdict])).toEqual([["user", "unused"], ["plugin", "used"]]);
    expect(judgement.measurement).toMatchObject({ status: "scored", value: 0.5 });
  });

  it("이름, 범위, 플러그인, 정의가 모두 같고 켜짐만 다른 서버 둘도 차례가 정해진다", () => {
    // 같은 플러그인을 스캐너가 두 길로 찾으면 그 플러그인의 서버도 사실이 둘이다
    const twin = (enabled: boolean) => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", recordNames: ["plugin:r:db", "plugin_r_db"], enabled });
    const judged = (list: McpFact[]) => judge({ mcpServers: list, plugins: [plugin("r@skills-dir", { components: ["mcpServers"] })] }).servers;
    const forward = judged([twin(true), twin(false)]);
    expect(forward.map((item) => item.server.enabled).sort()).toEqual([false, true]);
    expect(JSON.stringify(judged([twin(false), twin(true)]))).toBe(JSON.stringify(forward));
  });

  it("정체가 같은 서버 사실 둘은 설치 하나로 센다. 서버 하나가 최소 개수 둘을 채우지 않는다", () => {
    // 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 스캐너가 그 플러그인을 두 길로 찾아, 정체가 같은 서버 사실 둘을 낸다
    const twin = (enabled: boolean) => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", recordNames: ["plugin:r:db", "plugin_r_db"], enabled });
    const plugins = [plugin("r@skills-dir", { components: ["mcpServers"] })];
    const both = judge({ mcpServers: [twin(true), twin(true)], plugins }, { called: ["plugin_r_db"] });
    expect(both.servers).toHaveLength(2);
    expect(both.measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 1, judgeable: 1, judged: 1, structural: 0, unused: 0, used: 1 } });
    // 한쪽만 켜져 있어도 켜진 설치 하나다. 둘 다 꺼져 있으면 세지 않는다
    expect(judge({ mcpServers: [twin(true), twin(false)], plugins }).measurement.evidence).toMatchObject({ enabled: 1, judgeable: 1 });
    expect(judge({ mcpServers: [twin(false), twin(false)], plugins }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    // 정체가 다른 서버가 하나 더 있으면 설치는 둘이다
    const other = mcpServer("mail");
    expect(judge({ mcpServers: [twin(true), twin(true), other], plugins }, { called: ["plugin_r_db", "mail"] }).measurement).toMatchObject({ status: "scored", value: 0, evidence: { enabled: 2, judged: 2, used: 2 } });
  });
  it("정체가 같아도 기록에 남는 이름 꼴이 다르면 사실마다 판정이 갈린다. 하나라도 불렀으면 그 설치는 부른 것이다", () => {
    // 같은 설치 ID의 플러그인을 두 경로에서 찾았는데 매니페스트의 이름이 서로 다르다. 서버의 이름과 정의가 같아 정체는 같고, 이름 꼴에는 매니페스트의 이름이 들어가서 다르다
    const under = (pluginName: string) => mcpServer("db", { scope: "plugin", pluginId: "r@m", recordNames: [`plugin:${pluginName}:db`, `plugin_${pluginName}_db`] });
    const alpha = under("alpha");
    const beta = under("beta");
    expect(alpha.installKey).toBe(beta.installKey);
    const judged = judge({ mcpServers: [alpha, beta, mcpServer("mail")], plugins: [plugin("r@m", { components: ["mcpServers"] })] }, { called: ["plugin_alpha_db", "mail"] });
    expect(judged.servers.filter((item) => item.server.name === "db").map((item) => item.verdict).sort()).toEqual(["unknown", "used"]);
    expect(judged.measurement).toEqual({ status: "scored", value: 0, evidence: { enabled: 2, judgeable: 2, judged: 2, structural: 0, unused: 0, used: 2 } });
  });
  it("정체가 없는 서버는 같은 설치인지 견줄 수 없으므로 사실마다 하나로 센다", () => {
    expect(judge({ mcpServers: [remote("claude.ai Mail"), remote("claude.ai Mail")] }).measurement.evidence).toMatchObject({ enabled: 2, judgeable: 0, structural: 2 });
  });

  describe("못 재는 까닭의 차례", () => {
    const idle = many("idle", 3);
    const blank = { enabled: null, judgeable: null, judged: null, structural: null, unused: null, used: null };

    it("1. MCP 호출을 기록하지 않는 형식은 unsupported다. 판정하지 않는다", () => {
      const judgement = judge({ mcpServers: idle, claudeJson: "unparsable" }, { watched: idle, coverage: { ...CLAUDE_COVERAGE, mcpCalls: "unsupported" } });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unsupported", evidence: blank });
      expect(judgement.servers).toEqual([]);
    });
    it.each([
      ["~/.claude.json이 풀리지 않는다", { claudeJson: "unparsable" }],
      ["~/.claude.json을 열지 못한다", { claudeJson: "unreadable" }],
      ["사용자 스킬 폴더의 목록(그 폴더에 둔 플러그인이 넣은 서버를 모른다)", { unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }],
      ["프로젝트의 스킬 폴더의 목록", { unreadableSkillPlaces: { user: false, projects: ["/work/app"], plugins: [] } }],
      ["프로젝트의 .mcp.json", { projects: [project("/work/app", { mcpJsonStatus: "unparsable" })] }],
      ["플러그인의 설치 기록 파일", { pluginsFile: "unreadable" }],
      ["사용자 설정", { settings: { ...facts().settings, user: "unreadable" } }],
      ["관리 정책 파일", { settings: { ...facts().settings, managedParts: [{ path: "/etc/claude-code/managed-settings.json", status: "unparsable" }] } }],
      ["프로젝트 설정", { projects: [project("/work/app", { hasSettings: true, settingsStatus: "unreadable" })] }],
      ["로컬 설정", { projects: [project("/work/app", { hasLocalSettings: true, localSettingsStatus: "unparsable" })] }],
    ] as [string, Partial<ClaudeSetupFacts>][])("2. 읽지 못한 것이 있으면 unreadable이다. 안 부른 것이 확인됨이 나오지 않는다: %s", (_name, setup) => {
      const judgement = judge({ mcpServers: idle, ...setup }, { watched: idle, complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unreadable", evidence: blank });
      expect(judgement.servers).toEqual([]);
    });
    it("~/.claude.json이 없으면 그 파일의 서버가 없는 것이므로 잰다. 플러그인의 스킬을 찾는 폴더도 상관없다", () => {
      const setup = { mcpServers: idle, claudeJson: "missing" as const, unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } };
      expect(judge(setup, { watched: idle }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
    it("3. 켜져 있는 서버가 하나도 없으면 not_applicable이다", () => {
      const zero = { enabled: 0, judgeable: 0, judged: 0, structural: 0, unused: 0, used: 0 };
      expect(judge({}, { complete: false }).measurement).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: zero });
      expect(judge({ mcpServers: many("blocked", 2, { enabled: false }) }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    });
    it("4. 켜져 있는 서버가 모두 정의를 읽지 못하는 것이면 unsupported다", () => {
      const judgement = judge({ mcpServers: [remote("claude.ai Mail"), remote("claude.ai Drive")] }, { called: ["claude.ai Mail"], complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unsupported", evidence: { enabled: 2, judgeable: 0, judged: 0, structural: 2, unused: 0, used: 0 } });
      expect(judgement.servers.map((s) => [s.verdict, s.excluded])).toEqual([["unknown", "no_definition"], ["unknown", "no_definition"]]);
    });
    it("5. 관측이 빠짐없지 않으면 incomplete다", () => {
      const judgement = judge({ mcpServers: idle }, { called: ["idle1"], watched: idle, complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "incomplete", evidence: { enabled: 3, judgeable: 3, judged: 1, structural: 0, unused: 0, used: 1 } });
    });
    it("5와 6이 겹치면 5가 먼저다. 관측이 빠졌으면 서버가 하나뿐이어도 incomplete다", () => {
      const one = many("idle", 1);
      expect(judge({ mcpServers: one }, { watched: one, complete: false }).measurement).toEqual({ status: "unmeasured", reason: "incomplete", evidence: { enabled: 1, judgeable: 1, judged: 0, structural: 0, unused: 0, used: 0 } });
      expect(judge({ mcpServers: one }, { watched: one }).measurement).toMatchObject({ status: "unmeasured", reason: "too_little" });
    });
    it("3과 4는 5보다 먼저다. 관측이 빠졌어도 켜져 있는 서버가 없으면 not_applicable이고 판정할 수 있는 대상이 없으면 unsupported다", () => {
      expect(judge({ mcpServers: many("off", 2, { enabled: false }) }, { complete: false }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
      expect(judge({ mcpServers: [remote("claude.ai Mail")] }, { complete: false }).measurement).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    });
    it("6과 7이 겹치면 6이 먼저다. 서버가 하나뿐이면 첫 점검이어도 too_little이다", () => {
      expect(judge({ mcpServers: many("idle", 1) }, { watched: null }).measurement).toMatchObject({ status: "unmeasured", reason: "too_little", evidence: { judgeable: 1, judged: 0 } });
    });
    it("6. 서버를 하나만 깔고 부르지 않으면 too_little이다. 지켜봐도 분모가 차지 않는다. 판정은 그대로다", () => {
      const one = many("only", 1);
      const judgement = judge({ mcpServers: [...one, remote("claude.ai Mail")] }, { watched: one });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 2, judgeable: 1, judged: 1, structural: 1, unused: 1, used: 0 } });
      expect(judgement.servers.find((s) => s.server.name === "only1")).toMatchObject({ verdict: "unused", excluded: null });
    });
    it("7. 첫 점검에서는 부른 기록이 없는 서버가 모두 쓰는지 모름이라 watching이다", () => {
      expect(judge({ mcpServers: idle }, { watched: null }).measurement).toEqual({ status: "unmeasured", reason: "watching", evidence: { enabled: 3, judgeable: 3, judged: 0, structural: 0, unused: 0, used: 0 } });
    });
    it("7. 판정된 것이 절반에 못 미치거나 2개에 못 미치면 watching이고, 절반이고 2개면 잰다", () => {
      expect(judge({ mcpServers: many("s", 5) }, { watched: many("s", 2) }).measurement).toMatchObject({ status: "unmeasured", reason: "watching" });
      expect(judge({ mcpServers: many("s", 2) }, { watched: many("s", 1) }).measurement).toMatchObject({ status: "unmeasured", reason: "watching", evidence: { judgeable: 2, judged: 1 } });
      expect(judge({ mcpServers: many("s", 4) }, { watched: many("s", 2) }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
  });

  describe("구조상 판정할 수 없는 것", () => {
    const idle = many("idle", 2);
    it("정의를 읽지 못하는 서버는 부른 기록이 있어도 세지 않는다", () => {
      const partial = mcpServer("partial", { definitionHash: null });
      const judgement = judge({ mcpServers: [...idle, partial, remote("claude.ai Mail")] }, { called: ["partial", "claude.ai Mail"], watched: idle });
      expect(judgement.measurement).toEqual({ status: "scored", value: 1, evidence: { enabled: 4, judgeable: 2, judged: 2, structural: 2, unused: 2, used: 0 } });
    });
    it("MCP 정의를 읽지 못한 플러그인이 넣은 서버는 읽힌 것도 늘 쓰는지 모름이다. 구성을 모르는 플러그인도 같다", () => {
      const half = mcpServer("half", { scope: "plugin", pluginId: "half@m", recordNames: ["plugin:half:half", "plugin_half_half"] });
      const other = mcpServer("fine", { scope: "plugin", pluginId: "fine@m", recordNames: ["plugin:fine:fine", "plugin_fine_fine"] });
      const setup = {
        mcpServers: [...idle, half, other],
        plugins: [plugin("half@m", { components: ["mcpServers"], mcpUnreadable: true }), plugin("fine@m", { components: ["mcpServers"] }), plugin("unknown@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })],
        pluginsWithoutInstall: ["ghost@m"],
      };
      const judgement = judge(setup, { called: ["plugin_half_half", "plugin_fine_fine"], watched: [...idle, half, other] });
      expect(judgement.measurement).toEqual({ status: "scored", value: 2 / 3, evidence: { enabled: 4, judgeable: 3, judged: 3, structural: 1, unused: 2, used: 1 } });
      expect(judgement.servers.find((s) => s.server.name === "half")).toMatchObject({ verdict: "unknown", excluded: "plugin_unread" });
    });
    it("꺼져 있는 플러그인의 서버는 처음부터 대상이 아니다", () => {
      const off = mcpServer("off", { scope: "plugin", pluginId: "off@m", enabled: false });
      const judgement = judge({ mcpServers: [...idle, off], plugins: [plugin("off@m", { enabled: false, mcpUnreadable: true })] }, { watched: idle });
      expect(judgement.measurement).toMatchObject({ status: "scored", evidence: { enabled: 2, structural: 0 } });
    });
  });
});
