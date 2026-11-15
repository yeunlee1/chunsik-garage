// Codex 플러그인 읽기를 시험한다. 설치 ID의 꼴, 버전 폴더 고르기, 매니페스트를 찾는 차례와 실패하는 꼴, 구성 요소의 이름, 스킬을 찾는 폴더, MCP 정의(인라인, 파일, 기본 .mcp.json)(설계 「5단계 2부 계획 전 결정」 7·8번)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codexPluginIdValid, compareCodexPluginVersions, readCodexPlugin } from "../../src/scan/codex-plugins.ts";
import * as fsModule from "../../src/scan/fs.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let home: string;
beforeEach(async () => {
  root = await makeTemp();
  home = join(root, ".codex");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

const cache = (market: string, name: string, version: string): string => join(home, "plugins", "cache", market, name, version);
const manifest = (dir: string, value: unknown, place = ".codex-plugin"): Promise<void> => put(join(dir, place, "plugin.json"), typeof value === "string" ? value : JSON.stringify(value));

describe("codexPluginIdValid", () => {
  it("마지막 @로 나눈 이름과 마켓이 Codex의 꼴이어야 한다", () => {
    for (const id of ["a@m", "my-plugin_1.v2@open-ai_x"]) expect(codexPluginIdValid(id)).toBe(true);
    for (const id of ["am", "@m", "a@", "a..b@m", ".a@m", "a.@m", "a@m.x", "x@y@m", "한글@m", "a b@m"]) expect(codexPluginIdValid(id)).toBe(false);
  });
});

describe("compareCodexPluginVersions", () => {
  it("둘 다 SemVer 꼴이면 SemVer의 차례이고, 아니면 글자의 차례다", () => {
    expect(compareCodexPluginVersions("2.0.0", "10.0.0")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0-alpha.2", "1.0.0-alpha.10")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0-alpha", "1.0.0-1")).toBeGreaterThan(0);
    expect(compareCodexPluginVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareCodexPluginVersions("v2", "v10")).toBeGreaterThan(0);
    expect(compareCodexPluginVersions("10.0.0", "1x")).toBeLessThan(0);
  });

  it("빌드 꼬리도 semver 1.0.27의 차례로 견준다(계획 리뷰 1차)", () => {
    expect(compareCodexPluginVersions("1.0.0+2", "1.0.0+10")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0", "1.0.0+1")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0+1", "1.0.0+a")).toBeLessThan(0);
    // 앞의 0을 뗀 값이 같으면 원래 길이가 긴 쪽이 높다(0 < 00 < 1 < 01)
    expect(compareCodexPluginVersions("1.0.0+1", "1.0.0+01")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0+0", "1.0.0+00")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0+1", "1.0.0+1.a")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0+b", "1.0.0+a.z")).toBeGreaterThan(0);
    expect(compareCodexPluginVersions("1.0.0+x.1", "1.0.0+x.1")).toBe(0);
    // pre-release가 먼저 견주어진다
    expect(compareCodexPluginVersions("1.0.0-a+9", "1.0.0-b+1")).toBeLessThan(0);
  });
});

describe("readCodexPlugin의 놓인 곳", () => {
  it("버전 폴더 가운데 local이 있으면 그것이고, 없으면 가장 높은 버전이다", async () => {
    for (const version of ["1.0.0", "local", "2.0.0"]) await manifest(cache("m", "p", version), { name: "p" });
    expect((await readCodexPlugin(home, "p@m")).root).toBe(cache("m", "p", "local"));
    for (const version of ["2.0.0", "10.0.0", "9.9.9"]) await manifest(cache("m", "q", version), { name: "q" });
    expect((await readCodexPlugin(home, "q@m")).root).toBe(cache("m", "q", "10.0.0"));
  });

  it("이름이 맞지 않는 폴더, 파일, 폴더 링크는 버전으로 보지 않는다", async () => {
    await manifest(cache("m", "p", "1.0.0"), { name: "p" });
    await mkdir(cache("m", "p", "9 9"), { recursive: true });
    await put(cache("m", "p", "9.0.0"), "파일이다");
    await manifest(join(root, "elsewhere"), { name: "p" });
    await linkDir(join(root, "elsewhere"), cache("m", "p", "8.0.0"));
    expect((await readCodexPlugin(home, "p@m")).root).toBe(cache("m", "p", "1.0.0"));
  });

  it("그 이름의 폴더나 버전 폴더가 없으면 깔리지 않은 것이고, 목록을 읽지 못하면 읽지 못한 것이다", async () => {
    expect((await readCodexPlugin(home, "none@m")).install).toBe("missing");
    await mkdir(join(home, "plugins", "cache", "m", "empty"), { recursive: true });
    expect((await readCodexPlugin(home, "empty@m")).install).toBe("missing");
    await manifest(cache("m", "p", "1.0.0"), { name: "p" });
    const original = fsModule.listDir;
    vi.spyOn(fsModule, "listDir").mockImplementation(async (path) => (path === join(home, "plugins", "cache", "m", "p") ? { status: "unreadable" } : original(path)));
    const read = await readCodexPlugin(home, "p@m");
    expect([read.install, read.root, read.manifest]).toEqual(["unreadable", null, "missing"]);
  });

  it("설치 ID가 Codex의 꼴이 아니면 놓인 곳을 찾지 않는다", async () => {
    const read = await readCodexPlugin(home, "bad id");
    expect([read.idValid, read.install, read.root]).toEqual([false, "missing", null]);
  });
});

describe("readCodexPlugin의 매니페스트", () => {
  it(".codex-plugin, .claude-plugin, .cursor-plugin의 차례로 첫 파일이다", async () => {
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, { name: "from-claude" }, ".claude-plugin");
    await manifest(dir, { name: "from-cursor" }, ".cursor-plugin");
    expect((await readCodexPlugin(home, "p@m")).namespace).toBe("from-claude");
    await manifest(dir, { name: "from-codex" });
    expect((await readCodexPlugin(home, "p@m")).namespace).toBe("from-codex");
  });

  it("뿌리의 plugin.json은 $schema가 agent-plugins.org를 가리킬 때만 쓰고 맨 먼저다", async () => {
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, { name: "from-codex" });
    await put(join(dir, "plugin.json"), JSON.stringify({ name: "unrelated" }));
    expect((await readCodexPlugin(home, "p@m")).namespace).toBe("from-codex");
    await put(join(dir, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "agent" }));
    expect((await readCodexPlugin(home, "p@m")).namespace).toBe("agent");
  });

  it("매니페스트 자리가 폴더이거나 매니페스트 폴더가 파일이면 Codex는 매니페스트가 없다고 본다", async () => {
    const a = cache("m", "a", "1.0.0");
    await mkdir(join(a, "plugin.json"), { recursive: true });
    await manifest(a, { name: "a" });
    expect((await readCodexPlugin(home, "a@m")).manifest).toBe("missing");
    const b = cache("m", "b", "1.0.0");
    await put(join(b, ".codex-plugin"), "파일이다");
    await manifest(b, { name: "b" }, ".claude-plugin");
    expect((await readCodexPlugin(home, "b@m")).manifest).toBe("missing");
  });

  it("풀리지 않거나 name이 글자가 아니면 맞지 않는 매니페스트다. name이 비면 뿌리 폴더의 이름이다", async () => {
    await manifest(cache("m", "a", "1.0.0"), "{ 깨진");
    expect((await readCodexPlugin(home, "a@m")).manifest).toBe("unparsable");
    await manifest(cache("m", "b", "1.0.0"), { name: 3 });
    expect((await readCodexPlugin(home, "b@m")).manifest).toBe("unparsable");
    await manifest(cache("m", "c", "2.1.0"), { name: "  " });
    const read = await readCodexPlugin(home, "c@m");
    expect([read.manifest, read.namespace]).toEqual(["ok", "2.1.0"]);
  });
});

describe("readCodexPlugin의 구성", () => {
  it("스킬을 찾는 폴더는 매니페스트의 skills 가운데 맞는 경로이고, 없으면 skills/다. 옮겨 둔 명령 스킬 폴더를 더한다", async () => {
    const a = cache("m", "a", "1.0.0");
    await manifest(a, { name: "a", skills: ["./custom", "../out", "/abs", "./", "./more"] });
    await mkdir(join(a, "skills"), { recursive: true });
    await mkdir(join(a, ".codex-plugin", "migrated-command-skills"), { recursive: true });
    expect((await readCodexPlugin(home, "a@m")).skillRoots).toEqual([join(a, ".codex-plugin", "migrated-command-skills"), join(a, "custom"), join(a, "more")].sort());
    const b = cache("m", "b", "1.0.0");
    await manifest(b, { name: "b", skills: 3 });
    await mkdir(join(b, "skills"), { recursive: true });
    expect((await readCodexPlugin(home, "b@m")).skillRoots).toEqual([join(b, "skills")]);
    const c = cache("m", "c", "1.0.0");
    await manifest(c, { name: "c", skills: "./only" });
    expect((await readCodexPlugin(home, "c@m")).skillRoots).toEqual([join(c, "only")]);
    const d = cache("m", "d", "1.0.0");
    await manifest(d, { name: "d" });
    expect((await readCodexPlugin(home, "d@m")).skillRoots).toEqual([]);
    // 글자 아닌 항목이 섞인 목록은 Codex가 통째로 버린다(계획 리뷰 1차)
    const e = cache("m", "e", "1.0.0");
    await manifest(e, { name: "e", skills: ["./custom", 3] });
    await mkdir(join(e, "skills"), { recursive: true });
    await mkdir(join(e, "custom"), { recursive: true });
    expect((await readCodexPlugin(home, "e@m")).skillRoots).toEqual([join(e, "skills")]);
  });

  it("MCP 정의는 인라인 묶음이거나, 매니페스트가 가리키는 파일이거나, 기본 .mcp.json이다", async () => {
    const inline = cache("m", "inline", "1.0.0");
    await manifest(inline, { name: "inline", mcpServers: { s: { command: "x" }, bad: 3 } });
    await put(join(inline, ".mcp.json"), JSON.stringify({ mcpServers: { ignored: { command: "y" } } }));
    expect((await readCodexPlugin(home, "inline@m")).mcpServers).toEqual([{ name: "s", definition: { command: "x" } }]);
    const file = cache("m", "file", "1.0.0");
    await manifest(file, { name: "file", mcpServers: "./conf/mcp.json" });
    await put(join(file, "conf", "mcp.json"), JSON.stringify({ a: { url: "https://e.test" } }));
    expect((await readCodexPlugin(home, "file@m")).mcpServers).toEqual([{ name: "a", definition: { url: "https://e.test" } }]);
    const def = cache("m", "def", "1.0.0");
    await manifest(def, { name: "def" });
    await put(join(def, ".mcp.json"), JSON.stringify({ mcpServers: { b: { command: "z", args: ["1"] } } }));
    const read = await readCodexPlugin(home, "def@m");
    expect([read.mcpServers, read.mcpUnreadable]).toEqual([[{ name: "b", definition: { command: "z", args: ["1"] } }], false]);
  });

  it("MCP 파일이 풀리지 않거나 읽지 못하면 MCP 정의를 읽지 못한 것이다. 선언한 파일이 없으면 서버가 없다", async () => {
    const broken = cache("m", "broken", "1.0.0");
    await manifest(broken, { name: "broken" });
    await put(join(broken, ".mcp.json"), "{ 깨진");
    expect((await readCodexPlugin(home, "broken@m")).mcpUnreadable).toBe(true);
    const list = cache("m", "list", "1.0.0");
    await manifest(list, { name: "list" });
    await put(join(list, ".mcp.json"), "[1, 2]");
    expect((await readCodexPlugin(home, "list@m")).mcpUnreadable).toBe(true);
    const gone = cache("m", "gone", "1.0.0");
    await manifest(gone, { name: "gone", mcpServers: "./none.json" });
    const read = await readCodexPlugin(home, "gone@m");
    expect([read.mcpServers, read.mcpUnreadable]).toEqual([[], false]);
    const locked = cache("m", "locked", "1.0.0");
    await manifest(locked, { name: "locked" });
    await put(join(locked, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
    const original = fsModule.readText;
    vi.spyOn(fsModule, "readText").mockImplementation(async (path) => (path === join(locked, ".mcp.json") ? { status: "unreadable" } : original(path)));
    expect((await readCodexPlugin(home, "locked@m")).mcpUnreadable).toBe(true);
  });

  it("매니페스트가 맞지 않으면 구성을 읽지 않는다", async () => {
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, "{");
    await mkdir(join(dir, "skills"), { recursive: true });
    await put(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { s: { command: "x" } } }));
    const read = await readCodexPlugin(home, "p@m");
    expect([read.skillRoots, read.mcpServers, read.namespace]).toEqual([[], [], null]);
  });

  it("Codex가 버리는 서버 선언(전송을 정할 수 없음, 전송과 맞지 않는 열쇠, ema_auth)은 서버가 아니다. type 열쇠, null 칸, 묶음이 아니거나 빈 oauth는 Codex처럼 보지 않는다(계획 리뷰 1차)", async () => {
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, {
      name: "p",
      mcpServers: {
        empty: {},
        both: { command: "x", url: "https://e.test" },
        stdioWithHeaders: { command: "x", http_headers: { H: "v" } },
        stdioWithOauth: { command: "x", oauth: { client_id: "a" } },
        ema: { url: "https://e.test", auth: "ema_auth" },
        typed: { type: "stdio", command: "x" },
        nulls: { command: "x", url: null, enabled: null },
        http: { type: "http", url: "https://e.test", args: null },
        emptyOauth: { command: "x", oauth: {} },
        textOauth: { command: "x", oauth: "x" },
      },
    });
    expect((await readCodexPlugin(home, "p@m")).mcpServers.map((s) => s.name)).toEqual(["emptyOauth", "http", "nulls", "textOauth", "typed"]);
  });

  it("인라인 묶음도 파일처럼 그 안의 mcpServers 묶음을 푼다(계획 리뷰 1차)", async () => {
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, { name: "p", mcpServers: { mcpServers: { s: { command: "x" } }, t: { command: "y" } } });
    expect((await readCodexPlugin(home, "p@m")).mcpServers).toEqual([{ name: "s", definition: { command: "x" } }]);
  });

  it("기존 형식 매니페스트의 필드 꼴이 Codex가 받지 않는 꼴이면 맞지 않는 매니페스트다(계획 리뷰 1차)", async () => {
    const cases: [string, unknown, string][] = [
      ["version", { name: "a", version: 3 }, "unparsable"],
      ["name-null", { name: null }, "unparsable"],
      ["keywords", { name: "a", keywords: "x" }, "unparsable"],
      ["keywords-null", { name: "a", keywords: null }, "unparsable"],
      ["interface", { name: "a", interface: 3 }, "unparsable"],
      ["apps", { name: "a", apps: [] }, "unparsable"],
      ["description-null", { name: "a", description: null, version: null, interface: null }, "ok"],
      ["paths-any", { name: "a", skills: 3, mcpServers: [1], hooks: true, extensions: { any: 1 } }, "ok"],
    ];
    for (const [name, value, status] of cases) {
      await manifest(cache("m", name, "1.0.0"), value);
      expect([name, (await readCodexPlugin(home, `${name}@m`)).manifest]).toEqual([name, status]);
    }
  });

  it("뿌리의 plugin.json을 쓰는 형식(Agent Plugins)은 구성을 모르는 플러그인이다. 스킬과 MCP 정의를 읽지 않는다(계획 리뷰 1차)", async () => {
    const dir = cache("m", "p", "1.0.0");
    await put(join(dir, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "agent" }));
    await put(join(dir, "mcp.json"), JSON.stringify({ mcpServers: { server: { type: "stdio", command: "x" } } }));
    await put(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "y" } } }));
    await mkdir(join(dir, "skills", "s"), { recursive: true });
    const read = await readCodexPlugin(home, "p@m");
    expect([read.manifest, read.namespace, read.compositionKnown, read.skillRoots, read.mcpServers]).toEqual(["ok", "agent", false, [], []]);
  });

  it("Codex의 JSON 해석기처럼 묶음과 목록이 128단 겹치면 풀리지 않는 것으로 본다. 기존 형식 매니페스트는 Codex가 푸는 칸만 세고 모르는 칸의 깊이는 보지 않는다(계획 리뷰 1차의 재확인)", async () => {
    const nest = (n: number): string => `${'{"x":'.repeat(n)}0${"}".repeat(n)}`;
    // MCP 파일은 문서 전체로 센다. 바깥 묶음 셋(문서, mcpServers, server)에 n단을 더 겹친다
    for (const [n, unreadable] of [
      [124, false],
      [125, true],
    ] as const) {
      const dir = cache("m", `file${n}`, "1.0.0");
      await manifest(dir, { name: "p" });
      await put(join(dir, ".mcp.json"), `{"mcpServers":{"server":{"command":"x","note":${nest(n)}}}}`);
      const read = await readCodexPlugin(home, `file${n}@m`);
      expect([n, read.mcpUnreadable, read.mcpServers.length]).toEqual([n, unreadable, unreadable ? 0 : 1]);
    }
    // 기존 형식 매니페스트. Codex가 값을 통째로 푸는 칸(extensions)과 인라인 서버는 문서의 맨 바깥과 함께 세고, 모르는 칸은 아무리 깊어도 보지 않는다
    const cases: [string, string, string][] = [
      ["ext126", `{"name":"a","extensions":${nest(126)}}`, "ok"],
      ["ext127", `{"name":"a","extensions":${nest(127)}}`, "unparsable"],
      ["inline124", `{"name":"a","mcpServers":{"s":{"command":"x","note":${nest(124)}}}}`, "ok"],
      ["inline125", `{"name":"a","mcpServers":{"s":{"command":"x","note":${nest(125)}}}}`, "unparsable"],
      ["unknown", `{"name":"a","note":${nest(5000)}}`, "ok"],
    ];
    for (const [name, text, status] of cases) {
      await manifest(cache("m", name, "1.0.0"), text);
      expect([name, (await readCodexPlugin(home, `${name}@m`)).manifest]).toEqual([name, status]);
    }
    // 뿌리의 plugin.json은 문서 전체로 센다. 너무 깊으면 Agent Plugins 매니페스트가 아니라 다음 자리를 본다
    for (const [n, namespace] of [
      [126, "agent"],
      [127, "legacy"],
    ] as const) {
      const dir = cache("m", `root${n}`, "1.0.0");
      await put(join(dir, "plugin.json"), `{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"agent","note":${nest(n)}}`);
      await manifest(dir, { name: "legacy" });
      expect([n, (await readCodexPlugin(home, `root${n}@m`)).namespace]).toEqual([n, namespace]);
    }
  });

  it("놓인 곳이나 매니페스트를 읽지 못했을 때만 구성을 모른다. 없는 것은 구성을 아는 것이다", async () => {
    expect((await readCodexPlugin(home, "none@m")).compositionKnown).toBe(true);
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, { name: "p" });
    expect((await readCodexPlugin(home, "p@m")).compositionKnown).toBe(true);
    const original = fsModule.readText;
    vi.spyOn(fsModule, "readText").mockImplementation(async (path) => (path === join(dir, ".codex-plugin", "plugin.json") ? { status: "unreadable" } : original(path)));
    const read = await readCodexPlugin(home, "p@m");
    expect([read.manifest, read.compositionKnown]).toEqual(["unreadable", false]);
  });
});
