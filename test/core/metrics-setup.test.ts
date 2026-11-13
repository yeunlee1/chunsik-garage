// 셋팅 규칙 넷(S1, S2, S3, S5)을 시험한다. 안전장치의 두 조건과 훅을 제한하는 설정, 버전으로 가르는 기본 모드, 읽지 못한 설정(설계 11.3 「셋팅」, 11.4 「규칙마다의 이유」, 21.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolCoverage, ToolId } from "../../src/adapters/types.ts";
import { highestMainVersion, mergedSetupRules, setupToolRules, type ToolSetup } from "../../src/core/metrics/setup.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { HookSource, ShellGuard } from "../../src/scan/hooks.ts";
import type { ClaudeSetupFacts, FileStatus, SetupProblem } from "../../src/scan/types.ts";
import { facts, instructionFile, instructions, mcpServer, plugin, project } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const D = "2026-11-10";

interface ToolOptions {
  id?: string;
  sessions?: SummaryInput[];
  coverage?: ToolCoverage;
  version?: string | null;
}
const tool = (setup: Partial<ClaudeSetupFacts> = {}, options: ToolOptions = {}): ToolSetup => ({
  tool: (options.id ?? "claude-code") as ToolId,
  totals: toolTotals((options.sessions ?? []).map((s) => summary(s)), windows, ["Bash"]),
  coverage: options.coverage ?? CLAUDE_COVERAGE,
  setup: facts(setup),
  highestVersion: options.version === undefined ? "2.1.300" : options.version,
});
const hooks = (input: Partial<ClaudeSetupFacts["hooks"]> = {}): ClaudeSetupFacts["hooks"] => ({ ...facts().hooks, ...input });
const guard = (source: HookSource = "user", input: Partial<ShellGuard> = {}): ShellGuard => ({ source, pluginId: null, coversShell: true, canBlock: true, ...input });
const mode = (user: "bypass" | "other" | null, managed: "bypass" | "other" | null = null, status: FileStatus = "ok"): ClaudeSetupFacts["settings"] => ({
  user: status,
  managedParts: [],
  defaultMode: { user, managed },
});
const BYPASS = mode("bypass");

describe("S1 전역 지침이 있다", () => {
  const withBytes = (bytes: number): Partial<ClaudeSetupFacts> => ({ globalInstructions: instructions({ files: [instructionFile("/home/u/.claude/CLAUDE.md", { bytes })] }) });
  it("전역 지침 파일들의 크기를 합쳐 200바이트 이상인 도구의 몫이다", () => {
    expect(mergedSetupRules([tool(withBytes(200))]).S1).toEqual({ status: "scored", value: 1, evidence: { tools: 1, withInstructions: 1 } });
    expect(mergedSetupRules([tool(withBytes(199))]).S1).toEqual({ status: "scored", value: 0, evidence: { tools: 1, withInstructions: 0 } });
    expect(mergedSetupRules([tool(withBytes(5000)), tool({}, { id: "codex" })]).S1).toMatchObject({ status: "scored", value: 0.5 });
  });
  it("크기는 파일을 합쳐서 본다. 규칙 파일로만 나눠 둔 지침도 지침이다", () => {
    const split = instructions({ files: [instructionFile("/home/u/.claude/rules/a.md", { bytes: 120 }), instructionFile("/home/u/.claude/rules/b.md", { bytes: 80 })] });
    expect(mergedSetupRules([tool({ globalInstructions: split })]).S1).toMatchObject({ status: "scored", value: 1 });
  });
  it("쓰는 도구가 없으면 no_data다", () => {
    expect(mergedSetupRules([]).S1).toEqual({ status: "unmeasured", reason: "no_data", evidence: { tools: 0, withInstructions: 0 } });
  });
});

describe("S2 안전장치가 있다", () => {
  const s2 = (setup: Partial<ClaudeSetupFacts>, options: ToolOptions = {}) => mergedSetupRules([tool(setup, options)]);

  it("기본 모드가 권한 우회가 아니면 권한 규칙이나 훅이 없어도 안전장치가 있다(㉡)", () => {
    for (const settings of [mode(null), mode("other"), mode(null, "other")]) {
      const result = s2({ settings });
      expect(result.S2).toEqual({ status: "scored", value: 1, evidence: { guarded: 1, tools: 1 } });
      expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: true }]);
    }
  });
  it("㉡은 훅을 보지 않는다. 훅을 모두 꺼 두어도 채운다", () => {
    expect(s2({ settings: mode("other"), hooks: hooks({ userDisableAll: true, managedDisableAll: true }) }).S2).toMatchObject({ status: "scored", value: 1 });
  });
  it("기본 모드가 권한 우회이고 확인 훅이 없으면 안전장치가 없다", () => {
    const result = s2({ settings: BYPASS });
    expect(result.S2).toEqual({ status: "scored", value: 0, evidence: { guarded: 0, tools: 1 } });
    expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: false }]);
  });
  it("권한 우회 모드라도 셸 명령을 덮고 실행을 막을 수 있는 확인 훅이 있으면 안전장치가 있다(㉠)", () => {
    const result = s2({ settings: BYPASS, hooks: hooks({ guards: [guard("user")] }) });
    expect(result.S2).toMatchObject({ status: "scored", value: 1 });
    expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: true, permissionChecks: false }]);
  });
  it("셸 명령 도구에 걸려 있지 않거나 뒤에서 도는 훅은 확인 훅이 아니다", () => {
    expect(s2({ settings: BYPASS, hooks: hooks({ guards: [guard("user", { coversShell: false })] }) }).S2).toMatchObject({ value: 0 });
    expect(s2({ settings: BYPASS, hooks: hooks({ guards: [guard("user", { canBlock: false })] }) }).S2).toMatchObject({ value: 0 });
    expect(s2({ settings: BYPASS, hooks: hooks({ guards: [guard("user", { coversShell: false }), guard("user", { canBlock: false })] }) }).S2).toMatchObject({ value: 0 });
  });

  const SOURCES: HookSource[] = ["managed", "managed-plugin", "user", "user-plugin"];
  it.each([
    ["제한하는 설정이 없다", {}, [true, true, true, true]],
    ["사용자 설정의 disableAllHooks", { userDisableAll: true }, [true, true, false, false]],
    ["관리 정책의 allowManagedHooksOnly", { managedAllowManagedOnly: true }, [true, true, false, false]],
    ["관리 정책의 disableAllHooks", { managedDisableAll: true }, [false, false, false, false]],
    ["사용자 설정의 disableAllHooks와 관리 정책의 disableAllHooks", { userDisableAll: true, managedDisableAll: true }, [false, false, false, false]],
  ] as const)("훅을 제한하는 설정: %s", (_name, limits, runs) => {
    const guarded = SOURCES.map((source) => s2({ settings: BYPASS, hooks: hooks({ guards: [guard(source)], ...limits }) }).safeguards[0]!.guardHook);
    expect(guarded).toEqual(runs);
  });

  it("사용자 설정과 관리 정책이 기본 모드를 둘 다 정했으면 관리 정책의 값이다", () => {
    expect(s2({ settings: mode("other", "bypass") }).S2).toMatchObject({ status: "scored", value: 0 });
    expect(s2({ settings: mode("bypass", "other") }).S2).toMatchObject({ status: "scored", value: 1 });
  });

  describe("프로젝트 설정과 로컬 설정에 적은 권한 우회는 버전으로 갈라 본다", () => {
    const inProject = { settings: mode(null), projects: [project("/work/a"), project("/work/b", { hasSettings: true, settingsStatus: "ok" as const, bypassInProject: true })] };
    const inLocal = { settings: mode(null), projects: [project("/work/b", { hasLocalSettings: true, localSettingsStatus: "ok" as const, bypassInLocal: true })] };
    it("가장 높은 버전이 2.1.257 이상이면 사용자 설정과 관리 정책만 본다", () => {
      expect(s2(inProject, { version: "2.1.257" }).S2).toMatchObject({ status: "scored", value: 1 });
      expect(s2(inLocal, { version: "2.2.0" }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("그보다 낮으면 한 곳에라도 있으면 기본 모드를 권한 우회로 본다. 숫자로 견준다", () => {
      expect(s2(inProject, { version: "2.1.256" }).S2).toMatchObject({ status: "scored", value: 0 });
      expect(s2(inLocal, { version: "2.1.99" }).S2).toMatchObject({ status: "scored", value: 0 });
    });
    it("버전을 아는 주 세션이 하나도 없으면 옛 버전처럼 본다", () => {
      expect(s2(inProject, { version: null }).S2).toMatchObject({ status: "scored", value: 0 });
    });
    it("그때에도 확인 훅이 있으면 안전장치가 있다(㉠만 남는다)", () => {
      const result = s2({ ...inProject, hooks: hooks({ guards: [guard("managed")] }) }, { version: "2.1.200" });
      expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: true, permissionChecks: false }]);
      expect(result.S2).toMatchObject({ status: "scored", value: 1 });
    });
  });

  describe("안전장치를 정하는 설정 파일 가운데 있는데 읽지 못한 것이 있으면 unreadable이다", () => {
    const unread = { status: "unmeasured", reason: "unreadable", evidence: { guarded: null, tools: 1 } };
    it("사용자 설정이 풀리지 않거나 열리지 않는다", () => {
      for (const status of ["unparsable", "unreadable"] as const) {
        const result = s2({ settings: mode(null, null, status) });
        expect(result.S2).toEqual(unread);
        expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: null, permissionChecks: null }]);
      }
    });
    it("관리 정책을 이룬 파일 가운데 하나를 읽지 못했다", () => {
      const settings = { ...mode("other"), managedParts: [{ path: "/etc/claude-code/managed-settings.json", status: "ok" as const }, { path: "/etc/claude-code/managed-settings.d/10.json", status: "unreadable" as const }] };
      expect(s2({ settings }).S2).toEqual(unread);
    });
    it("프로젝트 설정이나 로컬 설정은 옛 버전에서만 안전장치를 정한다", () => {
      const projects = [project("/work/a", { hasLocalSettings: true, localSettingsStatus: "unparsable" })];
      expect(s2({ projects }, { version: "2.1.256" }).S2).toEqual(unread);
      expect(s2({ projects }, { version: null }).S2).toEqual(unread);
      expect(s2({ projects }, { version: "2.1.257" }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("없는 설정 파일은 읽지 못한 것이 아니다", () => {
      const settings = { ...mode(null, null, "missing"), managedParts: [] };
      expect(s2({ settings, projects: [project("/work/a")] }, { version: null }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("훅을 읽지 못한 플러그인과 설정 파일은 그 훅이 없는 것으로 볼 뿐이다", () => {
      const unreadableHooks = hooks({ unreadablePlugins: ["guard@market"], unreadableSettings: ["/home/u/.claude/settings.json"] });
      expect(s2({ settings: BYPASS, hooks: unreadableHooks }).S2).toMatchObject({ status: "scored", value: 0 });
      expect(s2({ settings: mode("other"), hooks: unreadableHooks }).S2).toMatchObject({ status: "scored", value: 1 });
    });
  });

  it("안전장치가 있는 도구 수를 쓰는 도구 수로 나눈다. 쓰는 도구가 없으면 no_data다", () => {
    const result = mergedSetupRules([tool({ settings: BYPASS }), tool({ settings: mode("other") }, { id: "codex" })]);
    expect(result.S2).toEqual({ status: "scored", value: 0.5, evidence: { guarded: 1, tools: 2 } });
    expect(result.safeguards.map((s) => s.tool)).toEqual(["claude-code", "codex"]);
    expect(mergedSetupRules([]).S2).toEqual({ status: "unmeasured", reason: "no_data", evidence: { guarded: 0, tools: 0 } });
    expect(mergedSetupRules([]).safeguards).toEqual([]);
  });
});

describe("highestMainVersion", () => {
  const versions = (...list: (string | null)[]) => list.map((version) => summary({ version }));
  it("주 세션의 버전 가운데 숫자로 견주어 가장 높은 것이다. 읽는 차례와 상관없다", () => {
    expect(highestMainVersion(versions("2.1.250", "2.1.300"))).toBe("2.1.300");
    expect(highestMainVersion(versions("2.1.300", "2.1.250"))).toBe("2.1.300");
    expect(highestMainVersion(versions("2.1.99", "2.1.257"))).toBe("2.1.257");
  });
  it("버전을 읽지 못한 세션과 하위 세션은 뺀다. 남는 것이 없으면 null이다", () => {
    expect(highestMainVersion([...versions(null, "next", "2.1.300"), summary({ kind: "sub", version: "9.0.0" })])).toBe("2.1.300");
    expect(highestMainVersion([...versions(null, "2.1"), summary({ kind: "sub", version: "2.1.300" })])).toBeNull();
    expect(highestMainVersion([])).toBeNull();
  });
});

describe("S3 설정이 깨지지 않았다", () => {
  const problem = (kind: SetupProblem["kind"], path: string, input: Partial<SetupProblem> = {}): SetupProblem => ({ kind, owner: "user", path, realPath: path, ...input });
  it("사용자가 직접 고치는 셋팅의 문제만 센다", () => {
    const problems = [
      problem("unparsable", "/home/u/.claude/settings.json"),
      problem("unparsable", "/work/a/.mcp.json"),
      problem("noFrontmatter", "/home/u/.claude/skills/x"),
      problem("danglingLink", "/home/u/.claude/skills/gone", { realPath: null }),
      problem("unparsable", "/etc/claude-code/managed-settings.json", { owner: "managed" }),
      problem("noFrontmatter", "/home/u/.claude/plugins/cache/p/skills/y", { owner: "plugin" }),
      problem("unparsable", "/home/u/.claude.json", { owner: "tool" }),
    ];
    expect(mergedSetupRules([tool({ problems })]).S3).toEqual({ status: "scored", value: 4, evidence: { danglingLinks: 1, noFrontmatter: 1, problems: 4, unparsable: 2 } });
  });
  it("같은 실제 파일이나 폴더는 한 번만 센다", () => {
    const linked = [problem("noFrontmatter", "/home/u/.claude/skills/x", { realPath: "/shared/x" }), problem("noFrontmatter", "/work/a/.claude/skills/x", { realPath: "/shared/x" })];
    expect(mergedSetupRules([tool({ problems: linked })]).S3).toMatchObject({ status: "scored", value: 1 });
    const twoTools = [tool({ problems: [problem("unparsable", "/work/a/.mcp.json")] }), tool({ problems: [problem("unparsable", "/work/a/.mcp.json")] }, { id: "codex" })];
    expect(mergedSetupRules(twoTools).S3).toMatchObject({ status: "scored", value: 1 });
  });
  it("문제가 없어도, 쓰는 도구가 없어도 잰다", () => {
    expect(mergedSetupRules([tool()]).S3).toEqual({ status: "scored", value: 0, evidence: { danglingLinks: 0, noFrontmatter: 0, problems: 0, unparsable: 0 } });
    expect(mergedSetupRules([]).S3).toMatchObject({ status: "scored", value: 0 });
  });
});

describe("S5 MCP 연결이 안정적이다", () => {
  const session = (mcpConnectionFailure: boolean, input: SummaryInput = {}): SummaryInput => ({ days: { [D]: { responses: 1, mcpConnectionFailure } }, ...input });
  const SESSIONS = [session(true), session(false), session(false), session(false), session(true, { kind: "sub" })];
  const s5 = (setup: Partial<ClaudeSetupFacts>, options: ToolOptions = {}) => setupToolRules(tool(setup, { sessions: SESSIONS, ...options })).S5;
  const SERVER = { mcpServers: [mcpServer("db")] };

  it("점수 구간에 응답이 있는 주 세션 가운데 연결 실패가 있었던 세션의 몫이다", () => {
    expect(s5(SERVER)).toEqual({ status: "scored", value: 0.25, evidence: { enabledServers: 1, failedSessions: 1, mainSessions: 4 } });
  });
  it("켜져 있는 서버가 하나도 없으면 지난 연결 실패가 있어도 not_applicable이다", () => {
    expect(s5({})).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { enabledServers: 0, failedSessions: 1, mainSessions: 4 } });
    expect(s5({ mcpServers: [mcpServer("db", { enabled: false })] })).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it("범위를 가리지 않고 켜져 있는 서버를 모두 본다. 정의가 PC에 없는 연결도 서버다", () => {
    expect(s5({ mcpServers: [mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null })] })).toMatchObject({ status: "scored", value: 0.25 });
    expect(s5({ mcpServers: [mcpServer("db", { enabled: false }), mcpServer("p", { scope: "plugin", pluginId: "p@m" })] })).toMatchObject({ status: "scored", evidence: { enabledServers: 1 } });
  });
  it.each([
    ["~/.claude.json이 풀리지 않는다", { claudeJson: "unparsable" }],
    ["~/.claude.json을 열지 못한다", { claudeJson: "unreadable" }],
    ["프로젝트의 .mcp.json을 읽지 못한다", { projects: [project("/work/a", { mcpJsonStatus: "unparsable" })] }],
    ["플러그인의 설치 기록 파일을 읽지 못한다", { pluginsFile: "unreadable" }],
    ["켜져 있는 플러그인의 구성을 모른다", { plugins: [plugin("p@m", { compositionKnown: false })] }],
    ["켜져 있는 플러그인의 MCP 정의를 읽지 못한다", { plugins: [plugin("p@m", { mcpUnreadable: true })] }],
    ["설정에 켜 둔 플러그인이 설치 기록에 없다", { pluginsWithoutInstall: ["p@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("서버를 찾는 곳을 읽지 못했다: %s", (_name, setup) => {
    // 보이는 켜진 서버가 없으면 없다고 할 수 없다. 보이는 켜진 서버가 하나라도 있으면 잰다
    expect(s5(setup)).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { enabledServers: null, failedSessions: 1, mainSessions: 4 } });
    expect(s5({ ...setup, ...SERVER })).toMatchObject({ status: "scored", value: 0.25 });
  });
  it("없는 파일과 꺼 둔 플러그인은 읽지 못한 곳이 아니다", () => {
    const setup: Partial<ClaudeSetupFacts> = {
      claudeJson: "missing",
      pluginsFile: "missing",
      projects: [project("/work/a")],
      plugins: [plugin("off@m", { enabled: false, compositionKnown: false, mcpUnreadable: true })],
    };
    expect(s5(setup)).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it.each([
    ["사용자 설정", { settings: mode(null, null, "unparsable") }],
    ["관리 정책 파일", { settings: { ...mode(null), managedParts: [{ path: "/etc/claude-code/managed-settings.json", status: "unreadable" }] } }],
    ["프로젝트 설정", { projects: [project("/work/a", { hasSettings: true, settingsStatus: "unreadable" })] }],
    ["로컬 설정", { projects: [project("/work/a", { hasLocalSettings: true, localSettingsStatus: "unparsable" })] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("켜짐을 정하는 설정 파일을 읽지 못했으면 켜진 서버가 보여도 unreadable이다: %s", (_name, setup) => {
    expect(s5({ ...setup, ...SERVER })).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { enabledServers: null, failedSessions: 1, mainSessions: 4 } });
  });
  it("켜져 있는 서버는 있는데 점수 구간에 응답이 있는 주 세션이 없으면 no_data다", () => {
    expect(s5(SERVER, { sessions: [session(true, { kind: "sub" })] })).toEqual({ status: "unmeasured", reason: "no_data", evidence: { enabledServers: 1, failedSessions: 0, mainSessions: 0 } });
  });
  it("연결 실패를 못 보는 도구는 unsupported이고, 그것이 다른 까닭보다 앞선다", () => {
    const blind: ToolCoverage = { ...CLAUDE_COVERAGE, mcpFailuresAndHooks: "unsupported" };
    expect(s5({ settings: mode(null, null, "unparsable") }, { coverage: blind })).toEqual({ status: "unmeasured", reason: "unsupported", evidence: { enabledServers: null, failedSessions: null, mainSessions: null } });
  });
});
