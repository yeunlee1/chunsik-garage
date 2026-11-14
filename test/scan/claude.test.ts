// 셋팅 스캐너를 임시 홈 폴더로 처음부터 끝까지 시험한다. 설정 층 합치기, 스킬·플러그인·MCP 서버의 켜짐, 훅의 겉모양, 프로젝트와 파일의 읽기 상태, 문제와 그 주인, 그리고 값과 글이 결과에 남지 않는지(설계 10, 11.3, 19.1, 21.1)
import { mkdir, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { scanClaudeSetup, type ScanInput } from "../../src/scan/claude.ts";
import { installKeysOf, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { ClaudeSetupFacts } from "../../src/scan/types.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let input: ScanInput;
const SALT = "5a".repeat(32);
const skill = (name: string, extra = ""): string => `---\nname: ${name}\ndescription: 시험용 스킬\n${extra}---\n\n본문 글은 남지 않는다.\n`;
const json = (value: unknown): string => JSON.stringify(value, null, 2);

beforeEach(async () => {
  root = await makeTemp();
  const home = join(root, "home");
  const claude = join(home, ".claude");
  const proj = join(root, "work", "proj");
  input = {
    env: {},
    homedir: home,
    tmpdir: join(root, "os-tmp"),
    platform: process.platform,
    cwds: [join(proj, "sub"), proj, home, join(root, "work", "deleted")],
    claudeAiNames: ["claude.ai Drive", "not-claude-ai"],
    salt: SALT,
    managedDir: join(root, "managed"),
  };
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(proj, "sub", "x.txt"), "x");

  // 전역 지침과 사용자 설정
  await put(join(claude, "CLAUDE.md"), `# 전역 지침\n${"모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다. ".repeat(8)}\n${proj} 에서는 따로 정한 규칙을 따른다.\n`);
  await put(join(claude, "rules", "style.md"), "Keep replies short and in Korean every time.\n");
  await put(
    join(claude, "settings.json"),
    json({
      permissions: { defaultMode: "bypassPermissions", deny: ["Bash(rm -rf *)"], allow: [] },
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node C:/secret/guard-secret.mjs" }] }],
        SessionStart: [{ hooks: [{ type: "command", command: `node ${join(claude, "skills", "hooked", "inject.mjs")}` }] }],
      },
      skillOverrides: { "old-skill": "off", "quiet-skill": "user-invocable-only" },
      enabledPlugins: { "pa@m": true, "ghost@m": true, "off@m": false },
      deniedMcpServers: [{ serverName: "blocked" }],
    }),
  );
  // 사용자 스킬
  await put(join(claude, "skills", "active-skill", "SKILL.md"), skill("active-skill"));
  await put(join(claude, "skills", "old-skill", "SKILL.md"), skill("old-skill"));
  await put(join(claude, "skills", "quiet-skill", "SKILL.md"), skill("quiet-skill"));
  await put(join(claude, "skills", "manual", "SKILL.md"), skill("manual", "disable-model-invocation: true\n"));
  await put(join(claude, "skills", "hooked", "SKILL.md"), skill("hooked"));
  await put(join(claude, "skills", "nofront", "SKILL.md"), "# 머리말 없음\n");
  await put(join(root, "store", "gone", "SKILL.md"), skill("gone"));
  await linkDir(join(root, "store", "gone"), join(claude, "skills", "gone"));
  await rm(join(root, "store", "gone"), { recursive: true, force: true });

  // .claude.json. 같은 뿌리를 다르게 적은 열쇠 둘(구분 기호만 다름, 끝에 /. 를 붙임)에 같은 정의를 열쇠 차례만 바꿔 둔다.
  // 하위 폴더의 열쇠는 본 저장소의 뿌리가 아니므로 보지 않는다(설계 10 「프로젝트를 세는 단위와 셋팅을 읽는 곳은 같다」)
  await put(
    join(home, ".claude.json"),
    json({
      oauthAccount: { emailAddress: "someone@example.com" },
      mcpServers: {
        ctx: { type: "stdio", command: "npx", args: ["ctx"], env: { API_TOKEN: "TOKEN-VALUE-123" } },
        blocked: { type: "http", url: "https://blocked.example/mcp?key=QUERY-SECRET" },
      },
      projects: {
        [proj.replace(/\\/g, "/")]: { mcpServers: { loc: { command: "loc-server" }, twin: { command: "x", args: ["a"] } }, enabledMcpjsonServers: ["pj"], disabledMcpjsonServers: [], disabledMcpServers: ["ctx"] },
        [`${proj}/.`]: { mcpServers: { twin: { args: ["a"], command: "x" } } },
        [join(proj, "sub")]: { mcpServers: { "sub-only": { command: "s" } }, disabledMcpjsonServers: ["pj"] },
      },
      skillUsage: { "active-skill": { usageCount: 2, lastUsedAt: 1_760_000_000_000 }, "pa:s1": { usageCount: 1, lastUsedAt: 1_760_000_500_000 } },
      pluginUsage: { "pa@m": { usageCount: 1, lastUsedAt: 1_760_000_600_000 } },
      claudeAiMcpEverConnected: ["claude.ai Gmail"],
    }),
  );

  // 플러그인 둘(사용자가 켠 것, 관리 정책이 강제로 켠 것)과 그 마켓
  const pa = join(claude, "plugins", "cache", "m", "pa", "1.0.0");
  await put(join(pa, ".claude-plugin", "plugin.json"), json({ name: "pa", dependencies: ["helper"] }));
  await put(join(pa, "skills", "s1", "SKILL.md"), skill("s1"));
  await put(join(pa, "hooks", "hooks.json"), json({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }));
  await put(join(pa, ".mcp.json"), json({ mcpServers: { db: { command: "${CLAUDE_PLUGIN_ROOT}/db" } } }));
  const forced = join(claude, "plugins", "cache", "m", "forced", "2.0.0");
  await put(join(forced, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [{ type: "command", command: "check.sh" }] }] } }));
  await put(
    join(claude, "plugins", "installed_plugins.json"),
    json({ version: 2, plugins: { "pa@m": [{ scope: "user", installPath: pa, version: "1.0.0" }], "forced@m": [{ scope: "user", installPath: forced, version: "2.0.0" }] } }),
  );
  const market = join(root, "market-m");
  await put(join(market, ".claude-plugin", "marketplace.json"), json({ name: "m", plugins: [{ name: "pa", source: "./pa" }, { name: "forced", source: "./forced" }] }));
  await put(join(claude, "plugins", "known_marketplaces.json"), json({ m: { source: { source: "github" }, installLocation: market } }));
  await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true } }));

  // 프로젝트
  await put(join(proj, "CLAUDE.md"), "프로젝트 지침입니다. 이 저장소에서는 계획 문서를 먼저 읽는다.\n");
  await put(join(proj, ".claude", "settings.json"), json({ permissions: { allow: ["Bash(rm -rf *)"] } }));
  await put(join(proj, ".claude", "settings.local.json"), json({ permissions: { defaultMode: "bypassPermissions" } }));
  await put(join(proj, ".mcp.json"), json({ mcpServers: { pj: { command: "pj" }, unapproved: { command: "u" } } }));
  await put(join(proj, ".claude", "skills", "ps", "SKILL.md"), skill("ps"));
});
afterEach(async () => removeTemp(root));

const find = <T extends { name: string }>(list: T[], name: string, scope?: string): T => {
  const hit = list.find((x) => x.name === name && (scope === undefined || (x as unknown as { scope: string }).scope === scope));
  if (hit === undefined) throw new Error(`없음: ${name}`);
  return hit;
};

describe("scanClaudeSetup", () => {
  let facts: ClaudeSetupFacts;
  beforeEach(async () => {
    facts = await scanClaudeSetup(input);
  });

  it("전역 지침은 CLAUDE.md와 규칙 파일이고 프로젝트가 나온 횟수를 센다", () => {
    expect(facts.globalInstructions.files.map((f) => f.path)).toEqual([join(input.homedir, ".claude", "CLAUDE.md"), join(input.homedir, ".claude", "rules", "style.md")]);
    expect(facts.globalInstructions.bytes).toBeGreaterThan(200);
    expect(facts.globalInstructions.unreadableDirs).toEqual([]);
    const proj = normalizePath(join(root, "work", "proj"));
    expect(facts.globalMentions[proj]).toBeGreaterThanOrEqual(1);
  });

  it("프로젝트: 깃 뿌리로 묶고, 홈은 프로젝트로 보지 않고, 없어진 폴더는 없다고 적고 읽지 않는다", () => {
    const byRoot = Object.fromEntries(facts.projects.map((p) => [p.root, p]));
    const proj = byRoot[join(root, "work", "proj")]!;
    expect(proj).toMatchObject({ kind: "git", exists: true, excluded: false, settingsStatus: "ok", localSettingsStatus: "ok", mcpJsonStatus: "ok", hasSettings: true, hasLocalSettings: true, bypassInProject: false, bypassInLocal: true, permissionConflicts: 1 });
    expect(proj.cwds).toHaveLength(2);
    expect(proj.instructions.files.map((f) => f.path)).toEqual([join(root, "work", "proj", "CLAUDE.md")]);
    expect(byRoot[input.homedir]).toMatchObject({ excluded: true, settingsStatus: null });
    expect(byRoot[join(root, "work", "deleted")]).toMatchObject({ exists: false, kind: "folder", settingsStatus: null, localSettingsStatus: null, mcpJsonStatus: null });
  });

  it("프로젝트 폴더 이름은 정규화하기 전 뿌리 경로의 마지막 이름이다. 하위 폴더에서 연 세션도 깃 뿌리의 이름이고 대소문자가 그대로다", async () => {
    expect(facts.projects.find((p) => p.root === join(root, "work", "proj"))!.name).toBe("proj");
    const mixed = join(root, "work", "MyApp");
    await put(join(mixed, ".git", "HEAD"), "ref: refs/heads/main\n");
    await put(join(mixed, "src", "x.txt"), "x");
    const scanned = await scanClaudeSetup({ ...input, cwds: [join(mixed, "src")] });
    expect(scanned.projects.map((p) => p.name)).toEqual(["MyApp"]);
  });

  it("읽는 프로젝트 가운데 폴더 이름이 같은 것(대소문자를 가리지 않는다)은 정규화한 뿌리 차례로 둘째부터 차례 번호를 붙인다. 읽지 않는 폴더는 세지 않는다", async () => {
    const first = join(root, "a", "app");
    const second = join(root, "b", "App");
    const third = join(root, "c", "app");
    for (const dir of [first, second, third]) await put(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    const gone = join(root, "0", "app");
    const scanned = await scanClaudeSetup({ ...input, cwds: [third, gone, first, second] });
    const nameOf = (dir: string) => scanned.projects.find((p) => p.root === dir)!.name;
    expect([nameOf(first), nameOf(second), nameOf(third)]).toEqual(["app", "App (2)", "app (3)"]);
    expect(nameOf(gone)).toBe("app");
  });

  it("붙인 번호는 다른 읽는 프로젝트의 원래 이름과도 겹치지 않는다. 원래 이름을 먼저 잡아 두고 비어 있는 가장 작은 번호를 고른다", async () => {
    const first = join(root, "a", "app");
    const second = join(root, "b", "app");
    const numbered = join(root, "c", "app (2)");
    const twice = join(root, "d", "App (2)");
    for (const dir of [first, second, numbered, twice]) await put(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    const scanned = await scanClaudeSetup({ ...input, cwds: [twice, numbered, second, first] });
    const names = [first, second, numbered, twice].map((dir) => scanned.projects.find((p) => p.root === dir)!.name);
    expect(names).toEqual(["app", "app (3)", "app (2)", "App (2) (2)"]);
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
  });

  it("사용자 범위 위치의 앞머리(~, $CLAUDE_CONFIG_DIR)와 같은 이름의 프로젝트에도 번호를 붙인다. S3 위치가 사용자 설정과 같은 글이 되지 않게 한다", async () => {
    const tilde = join(root, "x", "~");
    const config = join(root, "y", "$claude_config_dir");
    for (const dir of [tilde, config]) await put(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    const scanned = await scanClaudeSetup({ ...input, cwds: [tilde, config] });
    expect([tilde, config].map((dir) => scanned.projects.find((p) => p.root === dir)!.name)).toEqual(["~ (2)", "$claude_config_dir (2)"]);
  });

  it("있지만 프로젝트로 보지 않는 폴더(홈)는 이름을 받지 않아, 같은 이름의 읽는 프로젝트가 번호 없이 이름을 받는다. 입력 차례와 상관없다", async () => {
    const namesake = join(root, "x", "home");
    await put(join(namesake, ".git", "HEAD"), "ref: refs/heads/main\n");
    for (const cwds of [[input.homedir, namesake], [namesake, input.homedir]]) {
      const scanned = await scanClaudeSetup({ ...input, cwds });
      expect(scanned.projects.find((p) => p.root === input.homedir)).toMatchObject({ excluded: true, name: "home" });
      expect(scanned.projects.find((p) => p.root === namesake)).toMatchObject({ excluded: false, name: "home" });
    }
  });

  it("스킬: skillOverrides의 off는 꺼짐, user-invocable-only와 disable-model-invocation은 켜져 있지만 목록에 실리지 않는다", () => {
    expect(find(facts.skills, "active-skill")).toMatchObject({ scope: "user", enabled: true, listed: true, hookProvided: false, nameUnreadable: false, usageLastUsedMs: 1_760_000_000_000 });
    expect(find(facts.skills, "old-skill")).toMatchObject({ enabled: false, listed: false });
    expect(find(facts.skills, "quiet-skill")).toMatchObject({ enabled: true, listed: false });
    expect(find(facts.skills, "manual")).toMatchObject({ enabled: true, listed: false });
    expect(find(facts.skills, "ps")).toMatchObject({ scope: "project", projectRoot: normalizePath(join(root, "work", "proj")), enabled: true });
  });

  it("스킬: 훅 명령에 경로가 나오는 스킬과 훅을 가진 플러그인의 스킬은 훅이 내용을 넣어 주는 스킬이다", () => {
    expect(find(facts.skills, "hooked").hookProvided).toBe(true);
    expect(find(facts.skills, "pa:s1")).toMatchObject({ scope: "plugin", pluginId: "pa@m", enabled: true, hookProvided: true, recordNames: ["pa:s1"], usageLastUsedMs: 1_760_000_500_000 });
  });

  it("문제: 머리말이 없는 스킬과 가리키는 곳이 없는 링크를 주인과 실제 경로와 함께 낸다", async () => {
    const nofront = join(input.homedir, ".claude", "skills", "nofront");
    expect(facts.problems).toEqual([
      { kind: "danglingLink", owner: "user", path: join(input.homedir, ".claude", "skills", "gone"), realPath: null, place: "~/.claude/skills/gone" },
      { kind: "noFrontmatter", owner: "user", path: nofront, realPath: normalizePath(await realpath(nofront)), place: "~/.claude/skills/nofront" },
    ]);
  });

  it("사용자의 문제에는 결과 화면에 보일 위치를 붙인다. 프로젝트의 것은 프로젝트 폴더 이름부터, 사용자 범위의 것은 설정 폴더부터이고 그 밖의 주인은 위치가 없다", async () => {
    const proj = join(root, "work", "proj");
    await put(join(proj, ".claude", "settings.json"), "{ 깨짐");
    await put(join(proj, ".claude", "settings.local.json"), "{ 깨짐");
    await put(join(proj, ".mcp.json"), "{ 깨짐");
    await put(join(proj, ".claude", "skills", "bare", "SKILL.md"), "# 머리말 없음\n");
    await put(join(root, "managed", "managed-settings.json"), "{ 깨짐");
    const scanned = await scanClaudeSetup(input);
    const places = scanned.problems.map((p) => [p.owner, p.place]);
    expect(places).toEqual(expect.arrayContaining([
      ["user", "proj/.claude/settings.json"],
      ["user", "proj/.claude/settings.local.json"],
      ["user", "proj/.mcp.json"],
      ["user", "proj/.claude/skills/bare"],
      ["user", "~/.claude/skills/nofront"],
      ["managed", null],
    ]));
    // 위치에는 사용자 이름이 든 홈 경로나 프로젝트의 위 폴더가 없다
    for (const problem of scanned.problems) if (problem.place !== null) expect(problem.place).not.toContain(root.replace(/\\/g, "/"));
  });

  it("설정 폴더를 CLAUDE_CONFIG_DIR로 옮겼으면 사용자 범위의 위치를 그 이름부터 적는다. 이름이 같은 프로젝트는 차례 번호가 붙은 이름부터 적는다", async () => {
    const config = join(root, "elsewhere", "claude-config");
    await put(join(config, "settings.json"), "{ 깨짐");
    const first = join(root, "a", "app");
    const second = join(root, "b", "app");
    for (const dir of [first, second]) {
      await put(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
      await put(join(dir, ".mcp.json"), "{ 깨짐");
    }
    const scanned = await scanClaudeSetup({ ...input, env: { CLAUDE_CONFIG_DIR: config }, cwds: [first, second] });
    expect(scanned.problems.filter((p) => p.owner === "user").map((p) => p.place).sort()).toEqual(["$CLAUDE_CONFIG_DIR/settings.json", "app (2)/.mcp.json", "app/.mcp.json"]);
  });

  it("이름이 ~인 프로젝트의 설정 문제는 사용자 설정의 문제와 다른 위치로 적는다", async () => {
    await put(join(input.homedir, ".claude", "settings.json"), "{ 깨짐");
    const tilde = join(root, "x", "~");
    await put(join(tilde, ".git", "HEAD"), "ref: refs/heads/main\n");
    await put(join(tilde, ".claude", "settings.json"), "{ 깨짐");
    const scanned = await scanClaudeSetup({ ...input, cwds: [tilde] });
    const places = scanned.problems.filter((p) => p.owner === "user" && p.kind === "unparsable").map((p) => p.place).sort();
    expect(places).toEqual(["~ (2)/.claude/settings.json", "~/.claude/settings.json"]);
  });

  it("같은 원본을 두 곳에서 링크로 걸었으면 문제의 경로는 둘이고 실제 경로는 하나다(S3은 한 번만 센다). 위치는 링크를 푼 실제 경로가 아니라 링크가 놓인 경로로 만든다", async () => {
    const store = join(root, "store", "bare");
    await put(join(store, "SKILL.md"), "# 머리말 없음\n");
    await linkDir(store, join(input.homedir, ".claude", "skills", "bare"));
    await linkDir(store, join(root, "work", "proj", ".claude", "skills", "bare"));
    const bare = (await scanClaudeSetup(input)).problems.filter((p) => p.kind === "noFrontmatter" && p.path.endsWith("bare"));
    expect(bare).toHaveLength(2);
    expect([...new Set(bare.map((p) => p.realPath))]).toEqual([normalizePath(await realpath(store))]);
    // 원본은 설정 폴더와 프로젝트 밖(store)에 있다. 위치에 원본 쪽 폴더 이름이 나오면 안 된다
    expect(bare.map((p) => p.place).sort()).toEqual(["proj/.claude/skills/bare", "~/.claude/skills/bare"]);
  });

  it("MCP 서버: 막은 것, 승인하지 않은 .mcp.json 서버는 꺼져 있고, claude.ai 서버는 정의가 없다", () => {
    expect(find(facts.mcpServers, "ctx")).toMatchObject({ scope: "user", enabled: true, recordNames: ["ctx"] });
    expect(find(facts.mcpServers, "blocked")).toMatchObject({ enabled: false });
    expect(find(facts.mcpServers, "loc")).toMatchObject({ scope: "local", enabled: true });
    expect(find(facts.mcpServers, "pj")).toMatchObject({ scope: "project", enabled: true });
    expect(find(facts.mcpServers, "unapproved")).toMatchObject({ scope: "project", enabled: false });
    expect(find(facts.mcpServers, "db")).toMatchObject({ scope: "plugin", pluginId: "pa@m", enabled: true, recordNames: ["plugin:pa:db", "plugin_pa_db"] });
    expect(find(facts.mcpServers, "claude.ai Gmail")).toMatchObject({ scope: "claude-ai", definitionHash: null, enabled: true });
    expect(find(facts.mcpServers, "claude.ai Drive").scope).toBe("claude-ai");
    expect(facts.mcpServers.some((s) => s.name === "not-claude-ai")).toBe(false);
    expect(find(facts.mcpServers, "ctx").definitionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("같은 뿌리를 다르게 적은 열쇠 둘에 정의가 같은 로컬 서버는 열쇠의 차례와 상관없이 하나다", () => {
    expect(facts.mcpServers.filter((s) => s.name === "twin")).toHaveLength(1);
  });

  it("~/.claude.json의 프로젝트 값은 본 저장소 뿌리의 열쇠로만 찾는다. 하위 폴더나 워크트리의 열쇠는 보지 않는다", () => {
    expect(facts.mcpServers.some((s) => s.name === "sub-only")).toBe(false);
    // 하위 폴더 열쇠의 거절 표시도 듣지 않는다
    expect(find(facts.mcpServers, "pj").enabled).toBe(true);
  });

  it("SKILL.md를 읽지 못한 스킬은 머리말이 없는 문제로 세지 않고, 읽지 못했다는 것을 위치의 사실로 낸다", async () => {
    // SKILL.md가 폴더라 글로 읽지 못한다
    await mkdir(join(input.homedir, ".claude", "skills", "unreadable-skill", "SKILL.md"), { recursive: true });
    await mkdir(join(input.homedir, ".claude", "plugins", "cache", "m", "pa", "1.0.0", "skills", "s-bad", "SKILL.md"), { recursive: true });
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.skills, "unreadable-skill")).toMatchObject({ scope: "user", readable: false });
    expect(find(scanned.skills, "pa:s-bad")).toMatchObject({ scope: "plugin", readable: false });
    expect(find(scanned.skills, "active-skill").readable).toBe(true);
    expect(scanned.problems.some((p) => p.path.endsWith("unreadable-skill") || p.path.endsWith("s-bad"))).toBe(false);
  });

  it("스킬과 MCP 서버의 사실에 설치의 정체 열쇠가 실려 있다. 모으면 installKeysOf와 같고 정의가 없는 서버는 null이다(설계 11.3 「설치의 정체」)", () => {
    expect(facts.skills.every((s) => s.installKey === skillInstallKey(s))).toBe(true);
    expect(facts.mcpServers.every((s) => s.installKey === mcpInstallKey(s))).toBe(true);
    expect(find(facts.mcpServers, "claude.ai Gmail").installKey).toBeNull();
    expect(find(facts.mcpServers, "ctx").installKey).toContain(find(facts.mcpServers, "ctx").definitionHash);
    const keys = [...facts.skills.map((s) => s.installKey), ...facts.mcpServers.flatMap((s) => (s.installKey === null ? [] : [s.installKey]))];
    expect([...new Set(keys)].sort()).toEqual(installKeysOf(facts));
  });

  it("켜져 있는데 설치 기록이 없는 플러그인은 따로 적는다(꺼 둔 것은 넣지 않는다)", () => {
    expect(facts.pluginsWithoutInstall).toEqual(["ghost@m"]);
  });

  it("사용자 범위 서버를 한 프로젝트에서만 껐으면 사용자 범위에서는 켜져 있다", () => {
    expect(find(facts.mcpServers, "ctx").enabled).toBe(true);
  });

  it("플러그인: 켜짐, 관리 정책이 강제로 켬, 구성 요소, 사용 집계", () => {
    expect(find(facts.plugins, "pa")).toMatchObject({ id: "pa@m", entryName: "pa", scopes: ["user"], marketplaceEntry: "ok", enabled: true, compositionKnown: true, managedForced: false, hasHooks: true, components: ["hooks", "mcpServers", "skills"], dependencies: ["helper"], skills: ["pa:s1"], usageLastUsedMs: 1_760_000_600_000 });
    expect(find(facts.plugins, "forced")).toMatchObject({ enabled: true, managedForced: true, managedFixed: true });
  });

  it("훅의 겉모양: 관리 정책이 강제로 켠 플러그인과 사용자 설정의 셸 훅을 출처와 함께 낸다", () => {
    expect(facts.hooks.guards).toEqual([
      { source: "managed-plugin", pluginId: "forced@m", coversShell: true, canBlock: true },
      { source: "user", pluginId: null, coversShell: true, canBlock: true },
    ]);
    expect(facts.settings).toMatchObject({ user: "ok", defaultMode: { user: "bypass", managed: null } });
    expect(facts.settings.managedParts).toEqual([{ path: join(root, "managed", "managed-settings.json"), status: "ok" }]);
    expect(facts.hooks.unreadableSettings).toEqual([]);
  });

  it("설정 파일의 훅은 파일마다 본다. 뼈대나 처리기 검사에 걸린 파일의 확인 훅은 세지 않고 훅을 읽지 못한 설정 파일로 낸다(관리 정책은 그 출처의 hooks를 통째로 버리기도 한다)", async () => {
    const guard = { matcher: "Bash", hooks: [{ type: "command", command: "g" }] };
    const managedFile = join(root, "managed", "managed-settings.json");
    const userFile = join(input.homedir, ".claude", "settings.json");
    // 관리 정책 파일에는 맞는 확인 훅과 type이 없는 처리기가 함께 있고, 드롭인 파일에는 맞는 확인 훅만 있다
    await put(managedFile, json({ enabledPlugins: { "forced@m": true }, hooks: { PreToolUse: [guard, { matcher: "Bash", hooks: [{ command: "x" }] }] } }));
    await put(join(root, "managed", "managed-settings.d", "20-guard.json"), json({ hooks: { PreToolUse: [guard] } }));
    // 사용자 설정에는 맞는 확인 훅과, 다른 사건의 command가 없는 처리기가 함께 있다
    await put(userFile, json({ permissions: { defaultMode: "bypassPermissions" }, enabledPlugins: { "pa@m": true }, hooks: { PreToolUse: [guard], SessionStart: [{ hooks: [{ type: "command" }] }] } }));
    const scanned = await scanClaudeSetup(input);
    expect(scanned.hooks.guards).toEqual([
      { source: "managed", pluginId: null, coversShell: true, canBlock: true },
      { source: "managed-plugin", pluginId: "forced@m", coversShell: true, canBlock: true },
    ]);
    expect(scanned.hooks.unreadableSettings).toEqual([managedFile, userFile]);
    // 사용자 설정의 hooks가 묶음이 아니어도 그 파일의 훅을 읽지 못한 것이다
    await put(userFile, json({ hooks: "x" }));
    expect((await scanClaudeSetup(input)).hooks.unreadableSettings).toEqual([managedFile, userFile]);
  });

  it("훅 명령이 스킬 경로를 가리키는지는 관리 정책 파일마다 본다. 뒤 드롭인의 틀린 hooks가 앞 파일의 명령을 지우지 않는다(설계 11.3 E5 ⑤)", async () => {
    const skillDir = join(input.homedir, ".claude", "skills", "managed-hooked");
    await put(join(skillDir, "SKILL.md"), skill("managed-hooked"));
    await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true }, hooks: { SessionStart: [{ hooks: [{ type: "command", command: `node ${join(skillDir, "inject.mjs")}` }] }] } }));
    for (const bad of ["x", [], { SessionStart: false }]) {
      await put(join(root, "managed", "managed-settings.d", "20-bad.json"), json({ hooks: bad }));
      expect(find((await scanClaudeSetup(input)).skills, "managed-hooked")).toMatchObject({ hookProvided: true });
    }
  });

  it("결과에는 설정의 값, 훅 명령, 권한 규칙, 지침과 스킬의 글, 메일이 남지 않는다", () => {
    const text = JSON.stringify(facts);
    for (const secret of ["TOKEN-VALUE-123", "QUERY-SECRET", "guard-secret", "check.sh", "Bash(rm -rf *)", "시험을 먼저 돌린", "본문 글은", "someone@example.com", "echo hi"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("같은 입력이면 같은 사실이다", async () => {
    const again = await scanClaudeSetup({ ...input, cwds: [...input.cwds].reverse() });
    expect(JSON.stringify(again)).toBe(JSON.stringify(facts));
  });

  it(".claude.json이 풀리지 않으면 주인을 도구(tool)로 적고, 사용자 셋팅의 문제로 적지 않는다", async () => {
    await put(join(input.homedir, ".claude.json"), "{\"mcpServers\": {");
    const broken = await scanClaudeSetup(input);
    expect(broken.claudeJson).toBe("unparsable");
    expect(broken.problems.filter((p) => p.kind === "unparsable")).toEqual([
      { kind: "unparsable", owner: "tool", path: join(input.homedir, ".claude.json"), realPath: normalizePath(await realpath(join(input.homedir, ".claude.json"))), place: null },
    ]);
    expect(broken.mcpServers.some((s) => s.scope === "user")).toBe(false);
  });

  it("관리 정책이 기본 모드를 정하지 않은 것과 다른 모드로 정한 것을 가른다(설계 11.3 S2 ㉡)", async () => {
    await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true }, permissions: { defaultMode: "default" } }));
    const overridden = await scanClaudeSetup(input);
    expect(facts.settings.defaultMode).toEqual({ user: "bypass", managed: null });
    expect(overridden.settings.defaultMode).toEqual({ user: "bypass", managed: "other" });
  });

  it("프로젝트 설정·로컬 설정·.mcp.json을 읽지 못하면 그 상태를 적는다. 깨진 것으로 세지 않는다", async () => {
    const proj = join(root, "work", "proj");
    for (const file of [join(proj, ".claude", "settings.json"), join(proj, ".claude", "settings.local.json"), join(proj, ".mcp.json")]) {
      await rm(file, { force: true });
      await mkdir(file, { recursive: true });
    }
    const unreadable = await scanClaudeSetup(input);
    expect(unreadable.projects.find((p) => p.root === proj)).toMatchObject({ settingsStatus: "unreadable", localSettingsStatus: "unreadable", mcpJsonStatus: "unreadable", hasSettings: true, permissionConflicts: 0 });
    expect(unreadable.problems.some((p) => p.path.startsWith(proj))).toBe(false);
  });

  it("아주 깊게 중첩된 값이 설정·관리 정책 드롭인·.claude.json·플러그인 정의에 있어도 끝까지 읽고, 그 정의의 지문만 null이다", async () => {
    const deepList = `${"[".repeat(200_000)}${"]".repeat(200_000)}`;
    const deepObject = `${'{"a":'.repeat(200_000)}1${"}".repeat(200_000)}`;
    await put(join(input.homedir, ".claude", "settings.json"), `{"permissions":{"deny":[${deepList}]},"env":${deepObject},"hooks":{"PreToolUse":[${deepList}]}}`);
    await put(join(root, "managed", "managed-settings.d", "10-deep.json"), `{"permissions":{"deny":[${deepList}]},"env":${deepObject}}`);
    await put(join(root, "managed", "managed-settings.d", "20-deep.json"), `{"permissions":{"deny":[${deepList},"x"]},"env":${deepObject}}`);
    await put(join(input.homedir, ".claude.json"), `{"mcpServers":{"deep":{"command":"x","args":${deepList}},"plain":{"command":"y"}}}`);
    await put(join(input.homedir, ".claude", "plugins", "cache", "m", "pa", "1.0.0", ".mcp.json"), `{"mcpServers":{"db":{"command":"z","env":${deepObject}}}}`);
    const deep = await scanClaudeSetup(input);
    expect(deep.settings.user).toBe("ok");
    expect(deep.settings.managedParts.map((p) => p.status)).toEqual(["ok", "ok", "ok"]);
    expect(find(deep.mcpServers, "deep").definitionHash).toBeNull();
    expect(find(deep.mcpServers, "plain").definitionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(find(deep.mcpServers, "db").definitionHash).toBeNull();
  });
});

describe("scanClaudeSetup의 플러그인", () => {
  const readJsonFile = async (path: string): Promise<Record<string, any>> => JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
  /** 설치 기록과 마켓 항목을 더한다. 마켓이 없으면 known_marketplaces.json에도 더한다 */
  const addPlugin = async (id: string, path: string, marketEntry: Record<string, unknown>): Promise<void> => {
    const plugins = join(input.homedir, ".claude", "plugins");
    const installed = await readJsonFile(join(plugins, "installed_plugins.json"));
    installed.plugins[id] = [{ scope: "user", installPath: path }];
    await put(join(plugins, "installed_plugins.json"), json(installed));
    const market = id.slice(id.indexOf("@") + 1);
    const location = join(root, `market-${market}`);
    const marketFile = join(location, ".claude-plugin", "marketplace.json");
    let file: Record<string, any> = { name: market, plugins: [] };
    try {
      file = await readJsonFile(marketFile);
    } catch {
      const known = await readJsonFile(join(plugins, "known_marketplaces.json"));
      known[market] = { source: { source: "github" }, installLocation: location };
      await put(join(plugins, "known_marketplaces.json"), json(known));
    }
    file.plugins.push(marketEntry);
    await put(marketFile, json(file));
  };
  const setEnabled = async (id: string, value: boolean): Promise<void> => {
    const path = join(input.homedir, ".claude", "settings.json");
    const settings = await readJsonFile(path);
    settings.enabledPlugins[id] = value;
    await put(path, json(settings));
  };

  it("두 이름이 다르면 기록의 이름 꼴을 두 이름으로 만들고 집계도 두 이름으로 찾는다. 열쇠는 마켓 항목의 이름이다", async () => {
    const p = join(root, "plugins", "store-alias");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "runtime-name" }));
    await put(join(p, "skills", "one", "SKILL.md"), skill("one"));
    await put(join(p, ".mcp.json"), json({ mcpServers: { db2: { command: "d" } } }));
    await addPlugin("store-alias@demo", p, { name: "store-alias", source: "./store-alias" });
    const claudeJson = await readJsonFile(join(input.homedir, ".claude.json"));
    claudeJson.pluginUsage["runtime-name@demo"] = { usageCount: 1, lastUsedAt: 1_760_000_900_000 };
    claudeJson.skillUsage["store-alias:one"] = { usageCount: 1, lastUsedAt: 1_760_000_800_000 };
    await put(join(input.homedir, ".claude.json"), json(claudeJson));
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.skills, "runtime-name:one")).toMatchObject({ pluginId: "store-alias@demo", recordNames: ["runtime-name:one", "store-alias:one"], usageLastUsedMs: 1_760_000_800_000 });
    expect(find(scanned.mcpServers, "db2").recordNames).toEqual(["plugin:runtime-name:db2", "plugin:store-alias:db2", "plugin_runtime-name_db2", "plugin_store-alias_db2"]);
    expect(find(scanned.plugins, "runtime-name")).toMatchObject({ id: "store-alias@demo", entryName: "store-alias", usageLastUsedMs: 1_760_000_900_000, usageUndated: false });
  });

  it("집계의 항목은 있는데 시각을 읽을 수 없으면 시각 모름으로 낸다. 이름 꼴 하나라도 그러면 그렇다(설계 11.3 「30일의 경계」)", async () => {
    const p = join(root, "plugins", "store-alias");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "runtime-name" }));
    await put(join(p, "skills", "one", "SKILL.md"), skill("one"));
    await addPlugin("store-alias@demo", p, { name: "store-alias", source: "./store-alias" });
    const claudeJson = await readJsonFile(join(input.homedir, ".claude.json"));
    claudeJson.pluginUsage["runtime-name@demo"] = { usageCount: 1, lastUsedAt: 1_760_000_900_000 };
    claudeJson.pluginUsage["store-alias@demo"] = { usageCount: 3 };
    claudeJson.skillUsage["store-alias:one"] = { usageCount: 1, lastUsedAt: 1_760_000_800_000 };
    claudeJson.skillUsage["runtime-name:one"] = { usageCount: 1, lastUsedAt: "yesterday" };
    claudeJson.skillUsage["active-skill"] = { usageCount: 1, lastUsedAt: 9_000_000_000_000_000 };
    await put(join(input.homedir, ".claude.json"), json(claudeJson));
    const scanned = await scanClaudeSetup(input);
    // 읽힌 시각은 그대로 남기고, 시각 모름이 하나라도 있었다는 것을 따로 낸다
    expect(find(scanned.skills, "runtime-name:one")).toMatchObject({ usageLastUsedMs: 1_760_000_800_000, usageUndated: true });
    expect(find(scanned.plugins, "runtime-name")).toMatchObject({ usageLastUsedMs: 1_760_000_900_000, usageUndated: true });
    expect(find(scanned.skills, "active-skill")).toMatchObject({ usageLastUsedMs: null, usageUndated: true });
    // 집계에 항목이 없는 것은 시각 모름이 아니다
    expect(find(scanned.skills, "pa:s1")).toMatchObject({ usageLastUsedMs: 1_760_000_500_000, usageUndated: false });
  });

  it("플러그인의 놓인 곳이 링크이면 실제 경로를 따로 낸다. 그 플러그인의 스킬은 실제 경로가 그 안에 있다(설계 18.1 「읽지 못한 곳」)", async () => {
    const real = join(root, "store", "linked-plugin");
    await put(join(real, ".claude-plugin", "plugin.json"), json({ name: "linked" }));
    await put(join(real, "skills", "one", "SKILL.md"), skill("one"));
    const link = join(root, "plugins", "linked");
    await linkDir(real, link);
    await addPlugin("linked@demo", link, { name: "linked", source: "./linked" });
    const scanned = await scanClaudeSetup(input);
    const plugin = find(scanned.plugins, "linked");
    expect(plugin.installPath).toBe(link);
    expect(plugin.installRealPath).toBe(normalizePath(await realpath(real)));
    expect(find(scanned.skills, "linked:one").realPath!.startsWith(`${plugin.installRealPath}/`)).toBe(true);
    // 놓인 곳이 없으면 실제 경로도 없다
    await addPlugin("gone@demo", join(root, "plugins", "gone"), { name: "gone", source: "./gone" });
    expect(find((await scanClaudeSetup(input)).plugins, "gone")).toMatchObject({ exists: false, installRealPath: null });
  });

  it("enabledPlugins에 @builtin으로 끝나는 ID가 켜져 있어도 설치 기록이 없는 플러그인으로 세지 않는다", async () => {
    await setEnabled("cc-plugin-agents-md@builtin", true);
    expect((await scanClaudeSetup(input)).pluginsWithoutInstall).toEqual(["ghost@m"]);
  });

  it("마켓 항목의 hooks가 경로로 적힌 플러그인은 훅이 든 플러그인이다. 그 훅은 셸 명령을 덮는 확인 훅이 아니다", async () => {
    const p = join(root, "plugins", "ph");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "ph" }));
    await put(join(p, "skills", "s2", "SKILL.md"), skill("s2"));
    await put(join(p, "h.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await addPlugin("ph@m", p, { name: "ph", source: "./ph", hooks: "./h.json" });
    await setEnabled("ph@m", true);
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.plugins, "ph")).toMatchObject({ hasHooks: true, hooksUnreadable: false, components: ["hooks", "skills"] });
    expect(find(scanned.skills, "ph:s2").hookProvided).toBe(true);
    expect(scanned.hooks.guards.some((g) => g.pluginId === "ph@m")).toBe(false);
  });

  it("㉠의 플러그인 훅은 사용자 설정에서 켠 플러그인만 본다. 기본 켜짐으로 켜진 플러그인의 훅은 넣지 않는다", async () => {
    const p = join(root, "plugins", "dg");
    await put(join(p, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await addPlugin("dg@m", p, { name: "dg", source: "./dg" });
    const byDefault = await scanClaudeSetup(input);
    expect(find(byDefault.plugins, "dg").enabled).toBe(true);
    expect(byDefault.hooks.guards.some((g) => g.pluginId === "dg@m")).toBe(false);
    await setEnabled("dg@m", true);
    expect((await scanClaudeSetup(input)).hooks.guards).toContainEqual({ source: "user-plugin", pluginId: "dg@m", coversShell: true, canBlock: true });
  });

  it("스킬 폴더에 둔 플러그인(@skills-dir)은 스킬로 세지 않고 플러그인으로 낸다. 설치 기록이 없어도 구성을 안다", async () => {
    const userTool = join(input.homedir, ".claude", "skills", "my-tool");
    await put(join(userTool, ".claude-plugin", "plugin.json"), json({ name: "my-tool" }));
    await put(join(userTool, "SKILL.md"), skill("my-tool"));
    await put(join(userTool, "skills", "inner", "SKILL.md"), skill("inner"));
    // 그 플러그인의 훅 명령이 사용자 스킬의 경로를 가리킨다
    await put(join(userTool, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `node ${join(input.homedir, ".claude", "skills", "active-skill", "x.mjs")}` }] }] } }));
    const projTool = join(root, "work", "proj", ".claude", "skills", "proj-tool");
    await put(join(projTool, ".claude-plugin", "plugin.json"), json({ name: "proj-tool", defaultEnabled: false }));
    await setEnabled("my-tool@skills-dir", false);
    const off = await scanClaudeSetup(input);
    expect(off.skills.some((s) => s.name === "my-tool")).toBe(false);
    expect(find(off.plugins, "my-tool")).toMatchObject({ id: "my-tool@skills-dir", scopes: ["user"], compositionKnown: true, enabled: false, unknownEntries: ["SKILL.md"], skills: ["my-tool:inner"] });
    expect(find(off.skills, "my-tool:inner")).toMatchObject({ scope: "plugin", pluginId: "my-tool@skills-dir", hookProvided: true });
    expect(find(off.skills, "active-skill").hookProvided).toBe(true);
    expect(find(off.plugins, "proj-tool")).toMatchObject({ scopes: ["project"], projectRoots: [normalizePath(join(root, "work", "proj"))], enabled: false });
    expect(off.pluginsWithoutInstall).toEqual(["ghost@m"]);
    // ㉠: 사용자 스킬 폴더의 것이 사용자 설정에 참으로 적혀 있을 때만 넣는다
    expect(off.hooks.guards.some((g) => g.pluginId === "my-tool@skills-dir")).toBe(false);
    await setEnabled("my-tool@skills-dir", true);
    const on = await scanClaudeSetup(input);
    expect(find(on.plugins, "my-tool").enabled).toBe(true);
    expect(on.pluginsWithoutInstall).toEqual(["ghost@m"]);
    expect(on.hooks.guards).toContainEqual({ source: "user-plugin", pluginId: "my-tool@skills-dir", coversShell: true, canBlock: true });
  });

  it("플러그인 스킬은 위치마다 사실을 낸다. 실제 경로가 다르면 이름이 같아도 따로, 같은 원본을 다른 이름의 링크로 찾으면 그 링크도 위치 하나다", async () => {
    const p = join(root, "plugins", "dup");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "dup", skills: ["./extra", "./alias"] }));
    await put(join(p, "skills", "s", "SKILL.md"), skill("s"));
    await put(join(p, "extra", "s", "SKILL.md"), skill("other-s"));
    await put(join(p, "skills", "real", "SKILL.md"), skill("real"));
    await linkDir(join(p, "skills", "real"), join(p, "alias"));
    await addPlugin("dup@m", p, { name: "dup", source: "./dup" });
    // 집계에는 링크의 이름 꼴로만 남았고, 사용자 설정의 훅 명령은 링크 경로만 가리킨다
    const claudeJson = await readJsonFile(join(input.homedir, ".claude.json"));
    claudeJson.skillUsage["dup:alias"] = { usageCount: 1, lastUsedAt: 1_760_000_700_000 };
    await put(join(input.homedir, ".claude.json"), json(claudeJson));
    const settingsPath = join(input.homedir, ".claude", "settings.json");
    const settings = await readJsonFile(settingsPath);
    settings.hooks.SessionStart.push({ hooks: [{ type: "command", command: `node ${join(p, "alias", "SKILL.md")}` }] });
    await put(settingsPath, json(settings));
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.plugins, "dup").skills).toEqual(["dup:alias", "dup:real", "dup:s", "dup:s"]);
    expect(scanned.skills.filter((s) => s.name === "dup:s").map((s) => s.recordNames)).toContainEqual(["dup:other-s", "dup:s"]);
    const real = find(scanned.skills, "dup:real");
    const alias = find(scanned.skills, "dup:alias");
    // 두 위치의 실제 경로는 같고(2부가 스킬 하나로 묶는다), 링크 위치는 자기 이름 꼴·집계·링크 시각·훅 표시를 따로 갖는다
    expect(alias.realPath).toBe(real.realPath);
    expect(real).toMatchObject({ isLink: false, recordNames: ["dup:real"], usageLastUsedMs: null, hookProvided: false });
    expect(alias).toMatchObject({ isLink: true, recordNames: ["dup:alias", "dup:real"], usageLastUsedMs: 1_760_000_700_000, hookProvided: true });
    expect(alias.targetCreatedMs).not.toBeNull();
  });

  it("관리 정책이 강제로 켰어도 한 프로젝트에서만 도는 플러그인(프로젝트 스킬 폴더에 둔 것)의 훅은 ㉠으로 내지 않는다", async () => {
    const projGuard = join(root, "work", "proj", ".claude", "skills", "proj-guard");
    await put(join(projGuard, ".claude-plugin", "plugin.json"), json({ name: "proj-guard" }));
    await put(join(projGuard, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true, "proj-guard@skills-dir": true } }));
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.plugins, "proj-guard")).toMatchObject({ enabled: true, managedForced: true, scopes: ["project"] });
    expect(scanned.hooks.guards.some((g) => g.pluginId === "proj-guard@skills-dir")).toBe(false);
    expect(scanned.hooks.guards.some((g) => g.pluginId === "forced@m")).toBe(true);
  });

  it("관리 정책의 skillOverrides가 정하면 다른 층과 상관없이 그 값이다", async () => {
    await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true }, skillOverrides: { "active-skill": "off", "old-skill": "on" } }));
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.skills, "active-skill")).toMatchObject({ enabled: false, managedFixed: true });
    expect(find(scanned.skills, "old-skill")).toMatchObject({ enabled: true, managedFixed: true });
  });

  it("플러그인의 skills 경로가 스킬 하나를 바로 가리키면 그것이 위치 하나다. 이미 찾은 위치를 다시 가리키면 한 번만 센다", async () => {
    const p = join(root, "plugins", "sk");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "sk", skills: ["./extra/uno", "./skills/one", "./alias"] }));
    await put(join(p, "skills", "one", "SKILL.md"), skill("one"));
    await put(join(p, "skills", "two", "SKILL.md"), skill("two"));
    await put(join(p, "extra", "uno", "SKILL.md"), skill("uno"));
    await linkDir(join(p, "skills", "one"), join(p, "alias"));
    await addPlugin("sk@m", p, { name: "sk", source: "./sk" });
    expect(find((await scanClaudeSetup(input)).plugins, "sk")).toMatchObject({ skills: ["sk:alias", "sk:one", "sk:two", "sk:uno"], unknownEntries: [] });
  });
});
