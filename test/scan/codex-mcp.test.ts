// Codex MCP 서버를 맥락마다 합쳐 서버 사실로 내는지 시험한다. 설정의 서버가 플러그인의 서버를 이기고, 플러그인끼리는 ID의 사전순으로 앞선 것이 이기며, 이긴 등록이 꺼지면 그 이름이 꺼지고, 지문은 enabled를 뺀 정의로 만든다(설계 「5단계 2부 계획 전 결정」 7번)
import { describe, expect, it } from "vitest";
import { mergeCodexLayers, parseCodexConfig, type TomlTable } from "../../src/scan/codex-config.ts";
import { codexMcpFacts, type CodexMcpInput } from "../../src/scan/codex-mcp.ts";

const SALT = "3c".repeat(32);
const doc = (text: string): TomlTable => {
  const value = parseCodexConfig(text);
  if (value === null) throw new Error("풀리지 않았다");
  return value;
};

/** 사용자 층과 신뢰한 프로젝트 층으로 입력을 만든다. 플러그인은 맥락마다 켜진 것을 준다 */
function input(user: TomlTable, projects: { normRoot: string; layer: TomlTable; plugins?: string[] }[], globalPlugins: string[], pluginServers: Record<string, { name: string; definition: Record<string, unknown> }[]>): CodexMcpInput {
  return {
    user,
    projects: projects.map(({ normRoot, layer }) => ({ normRoot, layer })),
    contexts: [
      { projectRoot: null, merged: user, plugins: globalPlugins },
      ...projects.map(({ normRoot, layer, plugins }) => ({ projectRoot: normRoot, merged: mergeCodexLayers([user, layer]), plugins: plugins ?? globalPlugins })),
    ],
    pluginServers: new Map(Object.entries(pluginServers)),
    salt: SALT,
  };
}

const view = (facts: ReturnType<typeof codexMcpFacts>): [string, string, string | null, string | null, boolean][] => facts.map((f) => [f.scope, f.name, f.projectRoot, f.pluginId, f.enabled]);

describe("codexMcpFacts의 설정 서버", () => {
  it("사용자 층의 서버는 사용자 범위이고, enabled가 거짓일 때만 꺼져 있다", () => {
    const facts = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\n[mcp_servers.b]\ncommand = "y"\nenabled = false\n'), [], [], {}));
    expect(view(facts)).toEqual([
      ["user", "a", null, null, true],
      ["user", "b", null, null, false],
    ]);
    expect(facts.map((f) => f.recordNames)).toEqual([["a"], ["b"]]);
    expect(facts.every((f) => f.definitionHash !== null && !f.managedFixed)).toBe(true);
  });

  it("신뢰한 프로젝트 층에 있는 이름은 그 프로젝트 범위이고 정의는 사용자 층 위에 합친 것이다", () => {
    const user = doc('[mcp_servers.a]\ncommand = "x"\nargs = ["1"]\n');
    const facts = codexMcpFacts(input(user, [{ normRoot: "c:/work/p", layer: doc('[mcp_servers.a]\nargs = ["2"]\n[mcp_servers.only]\nurl = "https://e.test"\nenabled = false\n') }], [], {}));
    expect(view(facts)).toEqual([
      ["user", "a", null, null, true],
      ["project", "a", "c:/work/p", null, true],
      ["project", "only", "c:/work/p", null, false],
    ]);
    // 합친 정의의 지문은 사용자 층의 것과 다르고, 같은 정의를 따로 적은 것과 같다
    const merged = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nargs = ["2"]\n'), [], [], {}));
    expect(facts[1]!.definitionHash).not.toBe(facts[0]!.definitionHash);
    expect(facts[1]!.definitionHash).toBe(merged[0]!.definitionHash);
  });

  it("지문은 enabled를 뺀 정의로 만든다. 다른 열쇠가 다르면 지문도 다르다", () => {
    const on = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nenv = { TOKEN = "secret-1" }\n'), [], [], {}))[0]!;
    const off = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nenv = { TOKEN = "secret-1" }\nenabled = false\n'), [], [], {}))[0]!;
    const other = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nenv = { TOKEN = "secret-2" }\n'), [], [], {}))[0]!;
    const timeout = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nenv = { TOKEN = "secret-1" }\nstartup_timeout_sec = 9223372036854775807\n'), [], [], {}))[0]!;
    expect(on.definitionHash).toBe(off.definitionHash);
    expect(on.definitionHash).not.toBe(other.definitionHash);
    expect(timeout.definitionHash).not.toBeNull();
    expect(timeout.definitionHash).not.toBe(on.definitionHash);
    expect(JSON.stringify([on, off, other, timeout])).not.toContain("secret");
  });
});

describe("codexMcpFacts의 플러그인 서버", () => {
  const server = (name: string, definition: Record<string, unknown> = { command: name }): { name: string; definition: Record<string, unknown> } => ({ name, definition });

  it("같은 이름의 설정 서버가 있으면 꺼져 있어도 플러그인의 서버를 이긴다", () => {
    const facts = codexMcpFacts(input(doc('[mcp_servers.shared]\ncommand = "x"\nenabled = false\n'), [], ["p@m"], { "p@m": [server("shared"), server("own")] }));
    expect(view(facts)).toEqual([
      ["plugin", "own", null, "p@m", true],
      ["user", "shared", null, null, false],
      ["plugin", "shared", null, "p@m", false],
    ]);
  });

  it("플러그인끼리는 ID의 사전순으로 앞선 것이 이기고, 이긴 등록이 꺼지면 그 이름이 꺼진다", () => {
    const wins = codexMcpFacts(input(doc(""), [], ["b@m", "a@m"], { "a@m": [server("s")], "b@m": [server("s")] }));
    expect(view(wins)).toEqual([
      ["plugin", "s", null, "a@m", true],
      ["plugin", "s", null, "b@m", false],
    ]);
    const vetoed = codexMcpFacts(input(doc(""), [], ["a@m", "b@m"], { "a@m": [server("s", { command: "s", enabled: false })], "b@m": [server("s")] }));
    expect(view(vetoed).map((row) => row[4])).toEqual([false, false]);
  });

  it("맥락의 [plugins.\"<ID>\".mcp_servers.<서버>] 묶음이 있으면 그 enabled(없으면 참)가 선언을 대신한다", () => {
    const user = doc('[plugins."p@m".mcp_servers.off]\ndefault_tools_approval_mode = "prompt"\n[plugins."p@m".mcp_servers.on]\nenabled = false\n');
    const facts = codexMcpFacts(input(user, [], ["p@m"], { "p@m": [server("off", { command: "x", enabled: false }), server("on", { command: "y" }), server("plain", { command: "z", enabled: false })] }));
    expect(view(facts)).toEqual([
      ["plugin", "off", null, "p@m", true],
      ["plugin", "on", null, "p@m", false],
      ["plugin", "plain", null, "p@m", false],
    ]);
  });

  it("플러그인이 켜진 맥락에서만 그 서버가 켜지고, 어느 맥락에서든 켜지면 켜진 것이다", () => {
    const user = doc("");
    const project = { normRoot: "c:/work/p", layer: doc('[mcp_servers.s]\ncommand = "local"\n'), plugins: ["p@m"] };
    // 전역에서는 플러그인이 꺼져 있고, 켜진 프로젝트에서는 설정 서버가 그 이름을 가졌다
    const shadowed = codexMcpFacts(input(user, [project], [], { "p@m": [server("s")] }));
    expect(view(shadowed)).toEqual([
      ["project", "s", "c:/work/p", null, true],
      ["plugin", "s", null, "p@m", false],
    ]);
    const other = { normRoot: "c:/work/q", layer: doc(""), plugins: ["p@m"] };
    const lit = codexMcpFacts(input(user, [project, other], [], { "p@m": [server("s")] }));
    expect(view(lit).find((row) => row[0] === "plugin")![4]).toBe(true);
  });

  it("플러그인 서버의 지문도 enabled를 뺀 선언으로 만든다", () => {
    const a = codexMcpFacts(input(doc(""), [], ["p@m"], { "p@m": [server("s", { command: "x", enabled: false })] }))[0]!;
    const b = codexMcpFacts(input(doc(""), [], ["p@m"], { "p@m": [server("s", { command: "x" })] }))[0]!;
    expect(a.definitionHash).toBe(b.definitionHash);
    expect(a.definitionHash).not.toBeNull();
  });

  it("맥락의 서버 묶음에 ema_auth가 있으면 값과 enabled에 상관없이 그 서버가 꺼진다(계획 리뷰 1차)", () => {
    const user = doc('[plugins."p@m".mcp_servers.a]\nema_auth = false\n[plugins."p@m".mcp_servers.b]\nenabled = true\nema_auth = {}\n');
    const facts = codexMcpFacts(input(user, [], ["p@m"], { "p@m": [server("a"), server("b"), server("c")] }));
    expect(view(facts)).toEqual([
      ["plugin", "a", null, "p@m", false],
      ["plugin", "b", null, "p@m", false],
      ["plugin", "c", null, "p@m", true],
    ]);
  });

  it("지문을 만들 수 없을 만큼 깊은 정의(Codex가 받는 128단 안)는 지문이 없고 멈추지 않는다", () => {
    let note: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) note = { x: note };
    const facts = codexMcpFacts(input(doc(""), [], ["p@m"], { "p@m": [server("s", { command: "x", note })] }));
    expect([facts.length, facts[0]!.definitionHash, facts[0]!.enabled]).toEqual([1, null, true]);
  });
});
