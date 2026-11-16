// 설치된 플러그인 읽기를 시험한다. 매니페스트와 마켓 항목을 합친 유효 구성, 유효 이름, 알아보지 못한 것, 기대는 플러그인, 훅·MCP 정의, 구성을 모르는 플러그인(설계 10 「플러그인의 구성」, 16.2 A2)
import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcpMapOf, readSkillsDirPlugins, scanPlugins } from "../../src/scan/plugins.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, readdir: vi.fn(real.readdir) };
});
const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

let home: string;
let root: string;
beforeEach(async () => {
  root = await makeTemp();
  home = join(root, ".claude");
});
afterEach(async () => {
  vi.mocked(fsp.readdir).mockImplementation(actual.readdir as never);
  await removeTemp(root);
});

const json = (value: unknown): string => JSON.stringify(value);
const writeInstalled = async (plugins: Record<string, unknown[]>): Promise<void> => put(join(home, "plugins", "installed_plugins.json"), json({ version: 2, plugins }));
/** 마켓 하나의 목록 파일과 known_marketplaces.json을 쓴다. */
const writeMarket = async (market: string, entries: Record<string, unknown>[]): Promise<void> => {
  const location = join(root, "markets", market);
  await put(join(location, ".claude-plugin", "marketplace.json"), json({ name: market, plugins: entries }));
  const knownPath = join(home, "plugins", "known_marketplaces.json");
  let known: Record<string, unknown> = {};
  try {
    known = JSON.parse(await actual.readFile(knownPath, "utf8")) as Record<string, unknown>;
  } catch {
    known = {};
  }
  known[market] = { source: { source: "github" }, installLocation: location };
  await put(knownPath, json(known));
};
const entry = (name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ name, source: `./${name}`, description: "d", ...extra });

describe("scanPlugins", () => {
  it("설치 기록이 없거나 풀리지 않으면 플러그인이 없다", async () => {
    expect(await scanPlugins(home)).toEqual({ file: "missing", plugins: [] });
    await put(join(home, "plugins", "installed_plugins.json"), "{");
    expect((await scanPlugins(home)).file).toBe("unparsable");
  });

  it("구성 요소를 기본 자리와 매니페스트로 알아보고, 나머지 뿌리 항목은 알아보지 못한 것이다", async () => {
    const p1 = join(root, "cache", "m", "p1", "1.0.0");
    await put(join(p1, ".claude-plugin", "plugin.json"), json({ name: "p1", version: "1.0.0", author: { name: "a" }, dependencies: ["p2@m", { name: "p3", version: "~1" }] }));
    await put(join(p1, "skills", "s1", "SKILL.md"), "---\nname: s1\n---\n");
    await put(join(p1, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "x" }] }] } }));
    await put(join(p1, ".mcp.json"), json({ mcpServers: { db: { command: "srv" }, broken: "nope" } }));
    await put(join(p1, "tool.json"), "{}");
    await put(join(p1, "README.md"), "x");
    await put(join(p1, ".orphaned_at"), "x");
    const p2 = join(root, "cache", "m", "p2", "2.0.0");
    await put(join(p2, "skills", "only", "SKILL.md"), "---\nname: only\n---\n");
    await put(join(p2, "LICENSE"), "MIT");
    await writeMarket("m", [entry("p1"), entry("p2"), entry("gone")]);
    await writeInstalled({
      "p2@m": [{ scope: "user", installPath: p2, version: "2.0.0" }],
      "p1@m": [{ scope: "user", installPath: p1, version: "1.0.0" }],
      "gone@m": [{ scope: "project", installPath: join(root, "missing"), projectPath: join(root, "proj") }],
    });
    const scan = await scanPlugins(home);
    expect(scan.plugins.map((p) => p.id)).toEqual(["gone@m", "p1@m", "p2@m"]);
    const [gone, one, two] = scan.plugins;
    expect(gone).toMatchObject({ exists: false, compositionKnown: false, dependencies: null, scopes: ["project"], name: "gone", hooksUnreadable: true });
    expect(one).toMatchObject({ name: "p1", manifest: "ok", marketplaceEntry: "ok", compositionKnown: true, components: ["hooks", "mcpServers", "skills"], unknownEntries: ["tool.json"], dependencies: ["p2", "p3"] });
    expect(one!.mcpServers.map((s) => [s.name, s.definition !== null])).toEqual([
      ["broken", false],
      ["db", true],
    ]);
    // 매니페스트가 없어도 구성을 아는 플러그인이다(마켓 항목이 매니페스트 노릇을 한다)
    expect(two).toMatchObject({ manifest: "missing", compositionKnown: true, components: ["skills"], unknownEntries: [], dependencies: [], defaultEnabled: true });
  });

  it("매니페스트가 가리키는 폴더는 알아보지 못한 것이 아니고, 인라인 훅과 MCP 정의도 읽는다", async () => {
    const p = join(root, "p");
    await put(
      join(p, ".claude-plugin", "plugin.json"),
      json({ name: "p", defaultEnabled: false, skills: "./extra-skills/", commands: ["./cmds/a.md"], hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "y" }] }] }, mcpServers: { inline: { url: "https://e.example/mcp" } }, experimental: { themes: "./my-themes/" } }),
    );
    await put(join(p, "extra-skills", "x", "SKILL.md"), "---\nname: x\n---\n");
    await put(join(p, "cmds", "a.md"), "x");
    await put(join(p, "my-themes", "t.json"), "{}");
    await put(join(p, "workflows", "w.js"), "x");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ defaultEnabled: false, unknownEntries: [], components: ["commands", "hooks", "mcpServers", "skills", "themes", "workflows"] });
    expect(plugin!.skillRoots).toEqual([join(p, "skills"), join(p, "extra-skills")]);
    expect(plugin!.mcpServers.map((s) => s.name)).toEqual(["inline"]);
  });

  it("훅 파일이 풀리지 않으면 훅을 읽지 못했다고 적는다. 구성은 안다", async () => {
    const p = join(root, "p");
    await put(join(p, "hooks", "hooks.json"), "{");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ compositionKnown: true, hooksUnreadable: true, components: ["hooks"] });
  });

  it("매니페스트가 있는데 풀리지 않으면 구성을 모르는 플러그인이다. 구성과 스킬을 보지 않는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), "{");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ manifest: "unparsable", compositionKnown: false, dependencies: null, components: [], skillRoots: [], hooksUnreadable: true, mcpUnreadable: true });
  });

  it("뿌리에 바로 놓인 SKILL.md와 소개도 구성 요소도 아닌 매니페스트 열쇠, 상속된 이름의 뿌리 항목은 알아보지 못한 것이다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", description: "d", keywords: ["k"], futureThing: true, experimental: { themes: "./t/", gadgets: "./g/" } }));
    await put(join(p, "SKILL.md"), "---\nname: single\n---\n");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await put(join(p, "constructor"), "x");
    await put(join(p, "toString"), "x");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.unknownEntries).toEqual(["SKILL.md", "constructor", "manifest:experimental.gadgets", "manifest:futureThing", "toString"]);
    expect(plugin!.components).toEqual(["skills", "themes"]);
    expect(plugin!.components.every((c) => typeof c === "string")).toBe(true);
  });

  it("유효 이름은 plugin.json의 name이고, 설치·켜짐의 이름은 마켓 항목의 이름이다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "runtime-name" }));
    await put(join(p, "skills", "one", "SKILL.md"), "---\nname: one\n---\n");
    await writeMarket("demo", [entry("store-alias")]);
    await writeInstalled({ "store-alias@demo": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ id: "store-alias@demo", entryName: "store-alias", name: "runtime-name" });
  });

  it("plugin.json이 없으면 마켓 항목이 매니페스트다. 구성 요소와 알아보지 못한 열쇠를 거기서 읽는다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p", { category: "dev", lspServers: { ts: { command: "tsls" } }, mcpServers: { live: { command: "srv" } }, dependencies: ["helper@other"], gizmo: 1 })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ manifest: "missing", compositionKnown: true, components: ["lspServers", "mcpServers", "skills"], dependencies: ["helper"], unknownEntries: ["entry:gizmo"] });
    expect(plugin!.mcpServers.map((s) => s.name)).toEqual(["live"]);
  });

  it("plugin.json이 있으면 마켓 항목의 skills·hooks 같은 구성 요소가 더해진다. strict가 거짓이면 뜨지 않는 조합이라 구성을 모른다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await put(join(p, "more", "extra", "SKILL.md"), "---\nname: extra\n---\n");
    await writeMarket("m", [entry("p", { skills: ["./more/extra"], hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "guard" }] }] }, dependencies: ["dep"] })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ compositionKnown: true, components: ["hooks", "skills"], dependencies: ["dep"], unknownEntries: [] });
    expect(plugin!.skillRoots).toEqual([join(p, "skills"), join(p, "more", "extra")]);
    await writeMarket("m", [entry("p", { strict: false, skills: ["./more/extra"] })]);
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ compositionKnown: false });
  });

  it("마켓 항목을 읽지 못하면(마켓 목록이 없음, 그 이름의 항목이 없음) 구성을 모르는 플러그인이다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ marketplaceEntry: "missing", compositionKnown: false });
    await writeMarket("m", [entry("other")]);
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ marketplaceEntry: "missing", compositionKnown: false });
  });

  it("기본 켜짐은 마켓 항목의 값이 매니페스트보다 앞선다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", defaultEnabled: true }));
    await writeMarket("m", [entry("p", { defaultEnabled: false })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]!.defaultEnabled).toBe(false);
  });

  it("같은 id·같은 설치 위치의 기록은 범위를 합쳐 하나로 본다. 기록의 차례와 상관없이 같다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }, { scope: "project", installPath: p, projectPath: join(root, "proj") }] });
    const a = await scanPlugins(home);
    await writeInstalled({ "p@m": [{ scope: "project", installPath: p, projectPath: join(root, "proj") }, { scope: "user", installPath: p }] });
    const b = await scanPlugins(home);
    expect(a.plugins).toHaveLength(1);
    expect(a.plugins[0]!.scopes).toEqual(["project", "user"]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("뿌리의 문서(.md, SKILL.md 제외)와 보조 폴더 일곱(대소문자를 가리지 않음)은 소개 쪽이다. 꼴이 다르면 알아보지 못한 것이다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    for (const doc of ["AGENTS.md", "CLAUDE.md", "CODE_OF_CONDUCT.md", "notes.MD"]) await put(join(p, doc), "x");
    for (const dir of ["Docs", "tests", "test", "examples", "assets", "images", "scripts"]) await put(join(p, dir, "f.txt"), "x");
    // 다른 도구가 읽는 설정 파일, 이름을 모르는 폴더, 뿌리의 스킬 파일, 소개 이름으로 시작하는 폴더, .md로 끝나는 폴더
    await put(join(p, "gemini-extension.json"), "{}");
    await put(join(p, "tools", "f.txt"), "x");
    await put(join(p, "skill.md"), "---\nname: root\n---\n");
    await put(join(p, "readme-dir", "f.txt"), "x");
    await put(join(p, "guide.md", "f.txt"), "x");
    // 보조 폴더의 이름이지만 파일이다
    const q = join(root, "q");
    await put(join(q, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await put(join(q, "scripts"), "x");
    await writeMarket("m", [entry("p"), entry("q")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }], "q@m": [{ scope: "user", installPath: q }] });
    const [plugin, other] = (await scanPlugins(home)).plugins;
    expect(plugin!.unknownEntries).toEqual(["gemini-extension.json", "guide.md", "readme-dir", "skill.md", "tools"]);
    expect(other!.unknownEntries).toEqual(["scripts"]);
  });

  it("매니페스트에 name이 없거나 글자가 아니거나 비었으면 풀리지 않는 매니페스트다. 구성을 모른다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    for (const manifest of [{ description: "d" }, { name: 3 }, { name: "" }]) {
      await put(join(p, ".claude-plugin", "plugin.json"), json(manifest));
      expect((await scanPlugins(home)).plugins[0]).toMatchObject({ manifest: "unparsable", compositionKnown: false, name: "p" });
    }
  });

  it("마켓의 installLocation이 파일이면 그 파일이 마켓 파일이다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    const file = join(root, "markets", "url-market.json");
    await put(file, json({ name: "u", plugins: [entry("p")] }));
    await put(join(home, "plugins", "known_marketplaces.json"), json({ u: { source: { source: "url" }, installLocation: file } }));
    await writeInstalled({ "p@u": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ marketplaceEntry: "ok", compositionKnown: true });
  });

  it("마켓 항목의 source가 마켓의 뿌리이고 skills를 적었으면 기본 skills/는 찾지 않는다. 뿌리가 아니면 더한다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "other", "SKILL.md"), "---\nname: other\n---\n");
    await put(join(p, "a", "SKILL.md"), "---\nname: a\n---\n");
    await put(join(p, "b", "one", "SKILL.md"), "---\nname: one\n---\n");
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    for (const source of [".", "./"]) {
      await writeMarket("m", [{ name: "p", source, skills: ["./a", "./b"] }]);
      expect((await scanPlugins(home)).plugins[0]!.skillRoots).toEqual([join(p, "a"), join(p, "b")]);
    }
    await writeMarket("m", [{ name: "p", source: "./p", skills: ["./a"] }]);
    expect((await scanPlugins(home)).plugins[0]!.skillRoots).toEqual([join(p, "skills"), join(p, "a")]);
  });

  it("skills가 플러그인 뿌리 자신을 가리키면 스킬 경로로 보지 않고 알아보지 못한 것으로 둔다", async () => {
    const p = join(root, "p");
    await put(join(p, "SKILL.md"), "---\nname: root\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    for (const skills of [".", "./", ["./", "./skills"]]) {
      await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", skills }));
      const [plugin] = (await scanPlugins(home)).plugins;
      expect(plugin!.skillRoots).toEqual([join(p, "skills")]);
      expect(plugin!.unknownEntries).toEqual(["SKILL.md", "manifest:skills=."]);
    }
  });

  it("마켓 항목의 hooks를 경로로 적었으면 훅이 든 플러그인이지만 그 훅은 돌지 않는다. 읽지 못한 것이 아니다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await put(join(p, "more-hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await writeMarket("m", [entry("p", { hooks: "./more-hooks.json" })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ compositionKnown: true, hooksUnreadable: false, components: ["hooks", "skills"], unknownEntries: [] });
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
  });

  it("plugin.json이 있어도 마켓 항목의 모르는 열쇠는 알아보지 못한 것이다. 항목의 mcpServers·userConfig는 듣지 않으므로 세지 않는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p", { category: "dev", gizmo: 1, mcpServers: { live: { command: "srv" } }, userConfig: { k: {} } })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ components: ["skills"], unknownEntries: ["entry:gizmo"] });
    expect(plugin!.mcpServers).toEqual([]);
  });

  it("설치 ID가 @builtin으로 끝나는 것은 플러그인으로 세지 않는다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }], "tool-thing@builtin": [{ scope: "user", installPath: join(root, "builtin") }] });
    expect((await scanPlugins(home)).plugins.map((x) => x.id)).toEqual(["p@m"]);
  });

  it("스킬 폴더에 둔 플러그인(@skills-dir)은 마켓 항목 없이 매니페스트와 폴더로 구성을 안다. 뿌리의 SKILL.md는 알아보지 못한 것이다", async () => {
    const p = join(root, "skills", "tool-folder");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "my-tool" }));
    await put(join(p, "SKILL.md"), "---\nname: my-tool\n---\n");
    await put(join(p, "skills", "inner", "SKILL.md"), "---\nname: inner\n---\n");
    const [plugin] = await readSkillsDirPlugins([{ path: p, scope: "user", projectRoot: null }]);
    expect(plugin).toMatchObject({ id: "my-tool@skills-dir", entryName: "my-tool", name: "my-tool", marketplace: "skills-dir", marketplaceEntry: "none", compositionKnown: true, scopes: ["user"], projectPaths: [], unknownEntries: ["SKILL.md"], components: ["skills"], defaultEnabled: true });
  });

  it("스킬 폴더에 둔 플러그인의 매니페스트가 풀리지 않거나 name이 없으면 구성을 모르고 이름은 폴더 이름이다", async () => {
    const p = join(root, "skills", "broken-tool");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ description: "d" }));
    const [plugin] = await readSkillsDirPlugins([{ path: p, scope: "project", projectRoot: "/proj" }]);
    expect(plugin).toMatchObject({ id: "broken-tool@skills-dir", manifest: "unparsable", compositionKnown: false, scopes: ["project"], projectPaths: ["/proj"] });
  });

  it("MCP 서버는 기본 .mcp.json 다음에 매니페스트의 선언을 차례대로 읽고 같은 이름은 나중 것이 통째로 대신한다. 목록에 경로와 인라인을 섞을 수 있고 주소는 읽지 못한다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", mcpServers: ["./servers.json", { db: { command: "inline-db" }, extra: { command: "e" } }, "https://example.com/mcp.json"] }));
    await put(join(p, ".mcp.json"), json({ mcpServers: { db: { command: "default-db", env: { K: "1" } }, keep: { command: "k" } } }));
    await put(join(p, "servers.json"), json({ mcpServers: { db: { command: "file-db" } } }));
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.mcpServers.map((s) => [s.name, s.definition])).toEqual([
      ["db", { command: "inline-db" }],
      ["extra", { command: "e" }],
      ["keep", { command: "k" }],
    ]);
    expect(plugin!.mcpUnreadable).toBe(true);
    expect(plugin!.unknownEntries).toEqual([]);
  });

  it("같은 MCP 파일을 두 번 선언하면 나중 자리에서 다시 대신한다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", mcpServers: ["./a.json", "./b.json", "./a.json"] }));
    await put(join(p, "a.json"), json({ mcpServers: { db: { command: "from-a" } } }));
    await put(join(p, "b.json"), json({ mcpServers: { db: { command: "from-b" } } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]!.mcpServers).toEqual([{ name: "db", definition: { command: "from-a" } }]);
  });

  it("매니페스트의 hooks 목록은 경로와 인라인 묶음을 섞을 수 있고, 기본 hooks/hooks.json 뒤에 차례대로 더해진다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: ["./extra-hooks.json", { PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "inline" }] }] }] }));
    await put(join(p, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "default" }] }] } }));
    await put(join(p, "extra-hooks.json"), json({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "file" }] }] } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    const events = plugin!.hookEvents[0] as Record<string, { matcher?: string }[]>;
    expect(events.PreToolUse!.map((g) => g.matcher)).toEqual(["Bash", "Write"]);
    expect(Object.keys(events).sort()).toEqual(["PreToolUse", "SessionStart"]);
    expect(plugin).toMatchObject({ hooksUnreadable: false, unknownEntries: [] });
  });

  it("skills가 플러그인 뿌리를 가리키는 링크여도 뿌리 자신으로 보고 스킬 경로에서 뺀다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", skills: ["./alias"] }));
    await put(join(p, "SKILL.md"), "---\nname: root\n---\n");
    await linkDir(p, join(p, "alias"));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.skillRoots).toEqual([join(p, "skills")]);
    expect(plugin!.unknownEntries).toEqual(["SKILL.md", "manifest:skills=."]);
  });

  it("기본 skills/가 플러그인 뿌리를 가리키는 링크면 훑지 않고 알아보지 못한 것(skills=.)으로 둔다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await put(join(p, "SKILL.md"), "---\nname: root\n---\n");
    await linkDir(p, join(p, "skills"));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.skillRoots).toEqual([]);
    expect(plugin!.unknownEntries).toEqual(["SKILL.md", "skills=."]);
  });

  it("매니페스트가 기본 훅 파일을 다시 가리켜도 그 파일은 한 번만 읽는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./hooks/hooks.json" }));
    await put(join(p, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "x" }] }] } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect((plugin!.hookEvents[0] as Record<string, unknown[]>).PreToolUse).toHaveLength(1);
  });

  it("매니페스트가 선언한 훅·MCP 파일이 없으면 그 종류를 읽지 못한 것이다. 기본 파일이 없는 것은 정상이다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./missing-hooks.json", mcpServers: "./missing-mcp.json" }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ hooksUnreadable: true, mcpUnreadable: true, mcpServers: [] });
    // 기본 파일을 다시 가리켰는데 그 파일도 없다(먼저 기본 파일로 읽었어도 선언한 것은 없다고 알린다)
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./hooks/hooks.json", mcpServers: "./.mcp.json" }));
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ hooksUnreadable: true, mcpUnreadable: true });
    // 선언하지 않았고 기본 파일도 없다
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ hooksUnreadable: false, mcpUnreadable: false });
  });

  it("훅 파일에 hooks 감싸개가 없거나 처리기 하나라도 형식에 맞지 않으면 그 파일의 훅은 하나도 넣지 않고 읽지 못한 것이다", async () => {
    const p = join(root, "p");
    const guard = { matcher: "Bash", hooks: [{ type: "command", command: "g" }] };
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./extra.json" }));
    await put(join(p, "hooks", "hooks.json"), json({ PreToolUse: [guard] }));
    await put(join(p, "extra.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }, { type: "command" }] }] } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ compositionKnown: true, hooksUnreadable: true, components: ["hooks"] });
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
  });

  it("매니페스트와 마켓 항목의 인라인 훅은 감싸개 없는 사건 묶음이다. 감싸개를 씌우면 읽지 못한 것이고 그 묶음은 넣지 않는다", async () => {
    const p = join(root, "p");
    const map = { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] };
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: { hooks: map } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    let [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.hooksUnreadable).toBe(true);
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
    // 매니페스트의 인라인은 맞고 마켓 항목의 것에 감싸개를 씌웠다. 항목의 것은 사건을 대신하지 못한다
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: map }));
    await writeMarket("m", [entry("p", { hooks: { hooks: map } })]);
    [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.hooksUnreadable).toBe(true);
    expect(JSON.stringify(plugin!.hookEvents)).toBe(JSON.stringify([map]));
  });

  it("선언한 구성 요소 경로가 플러그인 뿌리 밖으로 풀리면 도구가 버리므로 읽지 않는다. 훅·MCP는 읽지 못한 것, 스킬 경로는 알아보지 못한 것(skills=..)이다", async () => {
    const p = join(root, "p");
    // 이름이 뿌리 이름으로 시작하는 옆 폴더(p-shared)도 밖이다
    const outside = join(root, "p-shared");
    await put(join(outside, "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await put(join(outside, "mcp.json"), json({ mcpServers: { far: { command: "f" } } }));
    await put(join(outside, "skills", "far", "SKILL.md"), "---\nname: far\n---\n");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "../p-shared/hooks.json", mcpServers: "../p-shared/mcp.json", skills: "../p-shared/skills" }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const check = async (): Promise<void> => {
      const [plugin] = (await scanPlugins(home)).plugins;
      expect(plugin).toMatchObject({ hooksUnreadable: true, mcpUnreadable: true, mcpServers: [], skillRoots: [join(p, "skills")] });
      expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
      expect(plugin!.unknownEntries).toContain("manifest:skills=..");
    };
    await check();
    // 뿌리 안의 링크가 밖을 가리켜도 밖이다
    await linkDir(outside, join(p, "linked"));
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./linked/hooks.json", mcpServers: "./linked/mcp.json", skills: "./linked/skills" }));
    await check();
    // 밖을 가리키는 스킬 경로는 없어도 알아보지 못한 것이다. 안쪽의 없는 경로는 밖이 아니다
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", skills: "../gone" }));
    let [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ hooksUnreadable: false, mcpUnreadable: false, skillRoots: [join(p, "skills")] });
    expect(plugin!.unknownEntries).toContain("manifest:skills=..");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", skills: "./nope" }));
    [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.skillRoots).toEqual([join(p, "skills"), join(p, "nope")]);
    expect(plugin!.unknownEntries).not.toContain("manifest:skills=..");
  });

  it("기본 hooks/hooks.json도 플러그인 뿌리 밖으로 풀리면 도구가 건너뛰므로 읽지 않고 읽지 못한 것이다. 매니페스트가 같은 경로를 다시 적어도 같다", async () => {
    const p = join(root, "p");
    const outside = join(root, "dotfiles");
    await put(join(outside, "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await linkDir(outside, join(p, "hooks"));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    let [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ hooksUnreadable: true, components: ["hooks"] });
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./hooks/hooks.json" }));
    [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.hooksUnreadable).toBe(true);
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
  });

  it("선언한 경로는 ./로 시작하고 .. 부분이 없어야 한다. 안쪽을 가리켜도 절대 경로나 .. 부분이 있는 MCP 파일은 도구가 읽지 않으므로 앞의 정의를 덮지 않는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".mcp.json"), json({ mcpServers: { db: { command: "default-db" } } }));
    await put(join(p, "x.json"), json({ mcpServers: { db: { command: "file-db" } } }));
    await put(join(p, "sub", "keep.txt"), "x");
    await put(join(p, "h.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await put(join(p, "extra", "one", "SKILL.md"), "---\nname: one\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const scan = async (manifest: Record<string, unknown>) => {
      await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", ...manifest }));
      return (await scanPlugins(home)).plugins[0]!;
    };
    for (const bad of ["./sub/../x.json", join(p, "x.json"), "x.json"]) {
      expect(await scan({ mcpServers: bad })).toMatchObject({ mcpUnreadable: true, mcpServers: [{ name: "db", definition: { command: "default-db" } }] });
    }
    for (const bad of ["./sub/../h.json", join(p, "h.json"), "h.json"]) {
      const plugin = await scan({ hooks: bad });
      expect(plugin.hooksUnreadable).toBe(true);
      expect(JSON.stringify(plugin.hookEvents)).toBe("[{}]");
    }
    for (const bad of ["./sub/../extra", join(p, "extra"), "extra"]) {
      const plugin = await scan({ skills: bad });
      expect(plugin.skillRoots).toEqual([join(p, "skills")]);
      expect(plugin.unknownEntries).toContain("manifest:skills=..");
    }
    // 바른 꼴은 읽는다. 이름에 ..이 든 폴더(a..b)는 .. 부분이 아니다
    await put(join(p, "a..b", "y.json"), json({ mcpServers: { more: { command: "m" } } }));
    const ok = await scan({ mcpServers: ["./x.json", "./a..b/y.json"], hooks: "./h.json", skills: "./extra" });
    expect(ok).toMatchObject({ mcpUnreadable: false, hooksUnreadable: false, skillRoots: [join(p, "skills"), join(p, "extra")] });
    expect(ok.mcpServers).toEqual([
      { name: "db", definition: { command: "file-db" } },
      { name: "more", definition: { command: "m" } },
    ]);
  });

  it("hooks·mcpServers 목록의 요소가 글자도 묶음도 아니면 읽지 못한 것이다. 나머지 요소는 읽는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: [3], mcpServers: [true, { db: { command: "d" } }] }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ hooksUnreadable: true, mcpUnreadable: true });
    expect(plugin!.mcpServers.map((s) => s.name)).toEqual(["db"]);
  });

  it("known_marketplaces.json이 풀리지 않거나 모양이 틀리면 마켓 항목을 읽지 못한 것이다. 파일이 없으면 없는 것이다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]!.marketplaceEntry).toBe("missing");
    for (const broken of ["{", "[]"]) {
      await put(join(home, "plugins", "known_marketplaces.json"), broken);
      expect((await scanPlugins(home)).plugins[0]).toMatchObject({ marketplaceEntry: "unreadable", compositionKnown: false });
    }
  });

  it("뿌리의 목록을 읽지 못하면 구성을 모르는 플러그인이다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    vi.mocked(fsp.readdir).mockImplementation((async (path: unknown, ...rest: unknown[]) => {
      if (String(path) === p) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return (actual.readdir as (...args: unknown[]) => unknown)(path, ...rest);
    }) as never);
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ exists: true, compositionKnown: false, unknownEntries: [] });
  });
});

describe("mcpMapOf", () => {
  it("{ mcpServers: … }와 이름 묶음 그대로를 다 받는다", () => {
    expect(mcpMapOf({ mcpServers: { a: { command: "x" } } })!.map((e) => e.name)).toEqual(["a"]);
    expect(mcpMapOf({ b: { url: "u" } })!.map((e) => e.name)).toEqual(["b"]);
  });
  it("mcpServers 열쇠가 있는데 객체가 아니면 풀리지 않은 것이다. 가짜 서버를 만들지 않는다", () => {
    for (const bad of [{ mcpServers: [] }, { mcpServers: null }, { mcpServers: "x" }, "x", null]) expect(mcpMapOf(bad)).toBeNull();
  });
});
