// Codex 셋팅 스캐너를 임시 홈 폴더로 처음부터 끝까지 시험한다. 사용자 설정과 신뢰한 프로젝트 층, 승인과 샌드박스, 지침, 스킬을 찾는 곳과 켜짐, 플러그인과 그 스킬과 서버, MCP 서버, 문제와 그 위치, 그리고 값과 글이 결과에 남지 않는지(설계 10, 「5단계 2부 계획 전 결정」)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { scanCodexSetup, type CodexScanInput } from "../../src/scan/codex.ts";
import * as fsModule from "../../src/scan/fs.ts";
import type { CodexSetupFacts } from "../../src/scan/types.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let home: string;
let codex: string;
let proj: string;
let other: string;
let input: CodexScanInput;
const SALT = "7d".repeat(32);
const skill = (name: string, extra = "description: 시험용 스킬\n"): string => `---\nname: ${name}\n${extra}---\n\n본문 글은 남지 않는다.\n`;
const quoted = (path: string): string => JSON.stringify(path);
const LONG = "모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다. ".repeat(10);

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  codex = join(home, ".codex");
  proj = join(root, "work", "proj");
  other = join(root, "work", "other");
  input = {
    env: {},
    homedir: home,
    tmpdir: join(root, "os-tmp"),
    platform: process.platform,
    cwds: [join(proj, "sub"), proj, other, home, join(root, "work", "deleted")],
    salt: SALT,
  };
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(proj, "sub", "x.txt"), "x");
  await put(join(other, ".git", "HEAD"), "ref: refs/heads/main\n");

  // 사용자 설정
  await put(
    join(codex, "config.toml"),
    [
      'approval_policy = "on-request"',
      'sandbox_mode = "workspace-write"',
      `[projects.${quoted(proj)}]`,
      'trust_level = "trusted"',
      `[projects.${quoted(other)}]`,
      'trust_level = "untrusted"',
      "[mcp_servers.ctx]",
      'command = "npx"',
      'args = ["ctx"]',
      'env = { API_TOKEN = "TOKEN-VALUE-123" }',
      "[mcp_servers.off]",
      'url = "https://off.example/mcp?key=QUERY-SECRET"',
      "enabled = false",
      '[plugins."pa@m"]',
      "enabled = true",
      '[plugins."ghost@m"]',
      "enabled = true",
      '[plugins."off@m"]',
      "enabled = false",
      "[[skills.config]]",
      'name = "old-skill"',
      "enabled = false",
      "[[skills.config]]",
      `path = ${quoted(join(home, ".agents", "skills", "legacy-path", "SKILL.md"))}`,
      "enabled = false",
    ].join("\n"),
  );
  await put(join(codex, "AGENTS.md"), `${LONG}\n${proj} 에서는 따로 정한 규칙을 따른다.\n`);

  // 사용자 스킬(새 위치와 옛 위치). .system은 보지 않는다
  const userSkills = join(home, ".agents", "skills");
  await put(join(userSkills, "active", "SKILL.md"), skill("active"));
  await put(join(userSkills, "old", "SKILL.md"), skill("old-skill"));
  await put(join(userSkills, "legacy-path", "SKILL.md"), skill("legacy-path"));
  await put(join(userSkills, "nofront", "SKILL.md"), "---\nname: nofront\n---\n");
  await put(join(root, "store", "gone", "SKILL.md"), skill("gone"));
  await linkDir(join(root, "store", "gone"), join(userSkills, "gone"));
  await removeTemp(join(root, "store", "gone"));
  await put(join(codex, "skills", "legacy", "SKILL.md"), skill("legacy"));
  await put(join(codex, "skills", ".system", "builtin", "SKILL.md"), skill("builtin"));

  // 플러그인: pa@m은 깔려 있고 켜져 있다. ghost@m은 켜져 있지만 깔려 있지 않다. off@m은 깔려 있지만 꺼져 있다
  const pa = join(codex, "plugins", "cache", "m", "pa", "1.0.0");
  await put(join(pa, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "pa" }));
  await put(join(pa, "skills", "s1", "SKILL.md"), skill("s1"));
  await put(join(pa, "skills", "broken", "SKILL.md"), "# 머리말 없음\n");
  await put(join(pa, ".mcp.json"), JSON.stringify({ mcpServers: { "pa-srv": { command: "pa", env: { SECRET: "PLUGIN-SECRET" } } } }));
  const off = join(codex, "plugins", "cache", "m", "off", "1.0.0");
  await put(join(off, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "off" }));
  await put(join(off, "skills", "hidden", "SKILL.md"), skill("hidden"));

  // 신뢰한 프로젝트: 승인 없음과 전면 해제를 함께 쓰고, ctx를 다시 적는다
  await put(join(proj, ".codex", "config.toml"), 'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n[mcp_servers.ctx]\nargs = ["ctx", "--project"]\n');
  await put(join(proj, "AGENTS.md"), "이 저장소는 npm test로 시험한다.\n");
  await put(join(proj, ".agents", "skills", "repo-skill", "SKILL.md"), skill("repo-skill"));
  await put(join(proj, ".codex", "skills", "codex-dir", "SKILL.md"), skill("codex-dir"));

  // 신뢰하지 않는다고 적힌 프로젝트: 설정은 쓰이지 않고(깨져 있어도 문제가 아니다), 지침은 실리지 않으며, .codex/skills는 실린다
  await put(join(other, ".codex", "config.toml"), "approval_policy = \n");
  await put(join(other, "AGENTS.md"), "실리지 않는 지침이다.\n");
  await put(join(other, ".codex", "skills", "x", "SKILL.md"), skill("other-skill"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

const scan =(): Promise<CodexSetupFacts> => scanCodexSetup(input);
const projectFact = (facts: CodexSetupFacts, path: string) => facts.projects.find((p) => p.normRoot === normalizePath(path))!;

describe("scanCodexSetup의 비밀값(0.2.0)", () => {
  it("사용자 층과 신뢰한 프로젝트 층의 서버 정의에 그대로 적힌 값의 자리만 내고, 플러그인 서버와 신뢰하지 않은 프로젝트는 빼며, 값은 내지 않는다", async () => {
    // 기본 준비물에는 ctx의 env.API_TOKEN, 꺼 둔 off 주소의 ?key=, 플러그인 서버 pa-srv의 env.SECRET이 있다
    const facts = await scan();
    expect(facts.secrets).toEqual([
      { scope: "user", server: "ctx", projectRoot: null, field: "env", key: "API_TOKEN" },
      { scope: "user", server: "off", projectRoot: null, field: "url", key: "key" },
    ]);
    await put(join(proj, ".codex", "config.toml"), '[mcp_servers.ctx]\nargs = ["ctx", "--project"]\n[mcp_servers.pjs]\nurl = "https://pjs.example/mcp"\nhttp_headers = { "X-API-Key" = "pjs-header-value-1" }\n');
    await put(join(other, ".codex", "config.toml"), '[mcp_servers.untrusted]\ncommand = "u"\nenv = { API_TOKEN = "untrusted-value-1" }\n');
    const again = await scan();
    expect(again.secrets).toEqual([
      { scope: "user", server: "ctx", projectRoot: null, field: "env", key: "API_TOKEN" },
      { scope: "user", server: "off", projectRoot: null, field: "url", key: "key" },
      { scope: "project", server: "pjs", projectRoot: normalizePath(proj), field: "headers", key: "X-API-Key" },
    ]);
    const text = JSON.stringify(again);
    for (const value of ["TOKEN-VALUE-123", "QUERY-SECRET", "PLUGIN-SECRET", "pjs-header-value-1", "untrusted-value-1"]) expect(text).not.toContain(value);
  });
});

describe("scanCodexSetup", () => {
  it("사용자 설정, 전역 지침, 전역 맥락의 승인과 샌드박스를 낸다", async () => {
    const facts = await scan();
    expect(facts.tool).toBe("codex");
    expect(facts.home).toBe(codex);
    expect(facts.config).toBe("ok");
    expect(facts.globalInstructions.files.map((f) => f.path)).toEqual([join(codex, "AGENTS.md")]);
    expect(facts.globalInstructions.bytes).toBeGreaterThanOrEqual(200);
    expect(Object.keys(facts.globalMentions)).toEqual([normalizePath(proj)]);
    expect(facts.safety).toEqual({ approval: "on-request", sandbox: "workspace-write", permissions: null, fullAccess: false });
  });

  it("프로젝트마다 신뢰, 설정 파일의 상태, 지침, 그 맥락의 승인과 샌드박스를 낸다", async () => {
    const facts = await scan();
    const p = projectFact(facts, proj);
    expect([p.trust, p.configStatus]).toEqual(["trusted", "ok"]);
    expect(p.instructions.files.map((f) => f.path)).toEqual([join(proj, "AGENTS.md")]);
    expect(p.safety).toEqual({ approval: "never", sandbox: "danger-full-access", permissions: null, fullAccess: true });
    const o = projectFact(facts, other);
    expect([o.trust, o.configStatus, o.safety, o.instructions.files]).toEqual(["untrusted", null, null, []]);
    // 홈 폴더와 없어진 폴더는 읽지 않는다
    expect(facts.projects.map((x) => x.normRoot).sort()).toEqual([normalizePath(home), normalizePath(other), normalizePath(proj), normalizePath(join(root, "work", "deleted"))].sort());
    for (const path of [home, join(root, "work", "deleted")]) expect([projectFact(facts, path).configStatus, projectFact(facts, path).scanned]).toEqual([null, false]);
    expect([p.scanned, o.scanned]).toEqual([true, true]);
  });

  it("뿌리를 Codex의 꼴로 적은 신뢰 열쇠가 있으면 사전순으로 앞선 다른 표기보다 그것을 본다(계획 리뷰 1차)", async () => {
    const exact = process.platform === "win32" ? proj.replace(/[A-Z]/g, (letter) => letter.toLowerCase()) : proj;
    const variant = process.platform === "win32" ? proj.toUpperCase() : proj.replace(/\/([^/]+)$/, "//$1");
    expect([normalizePath(variant) === normalizePath(proj), variant < exact]).toEqual([true, true]);
    const config = join(codex, "config.toml");
    const before = await readFile(config, "utf8");
    const entry = `[projects.${quoted(proj)}]\ntrust_level = "trusted"`;
    expect(before.includes(entry)).toBe(true);
    await put(config, before.replace(entry, `[projects.${quoted(variant)}]\ntrust_level = "untrusted"\n[projects.${quoted(exact)}]\ntrust_level = "trusted"`));
    const facts = await scan();
    expect(projectFact(facts, proj).trust).toBe("trusted");
    expect(facts.mcpServers.filter((s) => s.scope === "project").map((s) => s.name)).toEqual(["ctx"]);
  });

  it("전면 해제는 층마다 마지막으로 적은 권한 방식으로 본다. 합친 설정만으로 보지 않는다(계획 리뷰 1차)", async () => {
    const config = join(codex, "config.toml");
    const before = await readFile(config, "utf8");
    expect(before.includes('sandbox_mode = "workspace-write"')).toBe(true);
    await put(config, before.replace('sandbox_mode = "workspace-write"', 'default_permissions = ":danger-full-access"'));
    await put(join(proj, ".codex", "config.toml"), 'approval_policy = "never"\nsandbox_mode = "read-only"\n');
    const facts = await scan();
    expect(facts.safety).toEqual({ approval: "on-request", sandbox: null, permissions: "danger-full-access", fullAccess: true });
    expect(projectFact(facts, proj).safety).toEqual({ approval: "never", sandbox: "read-only", permissions: "danger-full-access", fullAccess: false });
  });

  it("스킬을 찾는 곳과 켜짐을 Codex와 같게 본다", async () => {
    const facts = await scan();
    const view = facts.skills.map((s) => [s.scope, s.name, s.enabled]);
    expect(view).toEqual(
      expect.arrayContaining([
        ["user", "active", true],
        ["user", "old-skill", false],
        ["user", "legacy-path", false],
        ["user", "legacy", true],
        ["project", "repo-skill", true],
        ["project", "codex-dir", true],
        ["project", "other-skill", true],
        ["plugin", "pa:s1", true],
      ]),
    );
    expect(facts.skills.map((s) => s.name)).not.toContain("builtin");
    expect(facts.skills.map((s) => s.name)).not.toContain("off:hidden");
    const repo = facts.skills.find((s) => s.name === "repo-skill")!;
    expect([repo.projectRoot, repo.pluginId, repo.recordNames, repo.listed, repo.hookProvided, repo.managedFixed, repo.usageLastUsedMs]).toEqual([normalizePath(proj), null, ["repo-skill"], true, false, false, null]);
    expect(facts.skills.find((s) => s.name === "pa:s1")!.pluginId).toBe("pa@m");
    expect(facts.skills.every((s) => s.installKey.includes("codex"))).toBe(true);
  });

  it("플러그인은 설정의 항목마다 내고, 켜져 있고 Codex가 싣는 것만 켜진 플러그인이다", async () => {
    const facts = await scan();
    const view = facts.plugins.map((p) => [p.id, p.configured, p.enabled, p.install, p.manifest, p.compositionKnown]);
    expect(view).toEqual([
      ["ghost@m", true, false, "missing", "missing", true],
      ["off@m", false, false, "ok", "ok", true],
      ["pa@m", true, true, "ok", "ok", true],
    ]);
    expect(facts.plugins.find((p) => p.id === "pa@m")!.skills).toEqual(["pa:broken", "pa:s1"]);
  });

  it("MCP 서버를 범위마다 내고 켜짐과 정의의 지문을 붙인다", async () => {
    const facts = await scan();
    expect(facts.mcpServers.map((s) => [s.scope, s.name, s.projectRoot, s.pluginId, s.enabled])).toEqual([
      ["user", "ctx", null, null, true],
      ["project", "ctx", normalizePath(proj), null, true],
      ["user", "off", null, null, false],
      ["plugin", "pa-srv", null, "pa@m", true],
    ]);
    expect(facts.mcpServers.every((s) => s.definitionHash !== null && s.installKey !== null && s.installKey.includes("codex"))).toBe(true);
  });

  it("사용자가 고치는 셋팅의 문제와 플러그인 안의 문제를 주인과 위치와 함께 낸다", async () => {
    const facts = await scan();
    const view = facts.problems.map((p) => [p.kind, p.owner, p.place]);
    expect(view).toEqual(
      expect.arrayContaining([
        ["noFrontmatter", "user", "~/.agents/skills/nofront"],
        ["danglingLink", "user", "~/.agents/skills/gone"],
        ["noFrontmatter", "plugin", null],
      ]),
    );
    expect(view).toHaveLength(3);
  });

  it("값과 글은 결과에 남지 않는다", async () => {
    const text = JSON.stringify(await scan());
    for (const secret of ["TOKEN-VALUE-123", "QUERY-SECRET", "PLUGIN-SECRET", "본문 글은", "모든 일은 시험을", "npm test로"]) expect(text).not.toContain(secret);
  });

  it("사용자 설정이 풀리지 않으면 문제로 내고, 그 설정에 기대는 것(신뢰, 승인, 서버, 플러그인, 스킬 끔)은 없는 것으로 본다", async () => {
    await put(join(codex, "config.toml"), "[mcp_servers.a]\nenabled = true\n");
    const facts = await scan();
    expect(facts.config).toBe("unparsable");
    expect(facts.problems.map((p) => [p.kind, p.owner, p.place])).toContainEqual(["unparsable", "user", "~/.codex/config.toml"]);
    expect(facts.safety).toEqual({ approval: null, sandbox: null, permissions: null, fullAccess: false });
    expect(projectFact(facts, proj).trust).toBeNull();
    expect(facts.mcpServers).toEqual([]);
    expect(facts.plugins).toEqual([]);
    expect(facts.skills.find((s) => s.name === "old-skill")!.enabled).toBe(true);
  });

  it("CODEX_HOME으로 옮긴 홈의 문제 위치는 그 이름으로 적는다", async () => {
    const moved = join(root, "moved-codex");
    await put(join(moved, "config.toml"), "approval_policy = \n");
    input = { ...input, env: { CODEX_HOME: moved } };
    const facts = await scan();
    expect(facts.home).toBe(moved);
    expect(facts.problems.map((p) => p.place)).toContain("$CODEX_HOME/config.toml");
  });

  it("신뢰한 프로젝트의 설정이 풀리지 않거나, 사용자 층과 합친 것이 Codex가 시작하지 못하는 꼴이면 그 프로젝트의 설정을 풀리지 않는 것으로 본다", async () => {
    await put(join(proj, ".codex", "config.toml"), '[mcp_servers.ctx]\nurl = "https://e.test"\n');
    const facts = await scan();
    const p = projectFact(facts, proj);
    expect([p.configStatus, p.safety]).toEqual(["unparsable", null]);
    expect(facts.problems.map((x) => [x.kind, x.place])).toContainEqual(["unparsable", "proj/.codex/config.toml"]);
    expect(facts.mcpServers.filter((s) => s.scope === "project")).toEqual([]);
  });

  it("[features]의 plugins가 거짓이면 플러그인을 쓰지 않는다", async () => {
    await put(join(codex, "config.toml"), '[features]\nplugins = false\n[plugins."pa@m"]\nenabled = true\n');
    const facts = await scan();
    expect(facts.plugins.map((p) => [p.id, p.configured, p.enabled])).toEqual([["pa@m", false, false]]);
    expect(facts.skills.filter((s) => s.scope === "plugin")).toEqual([]);
    expect(facts.mcpServers).toEqual([]);
  });

  it("목록을 읽지 못한 스킬 폴더가 누구의 것인지 낸다", async () => {
    expect((await scan()).unreadableSkillPlaces).toEqual({ user: false, projects: [], plugins: [] });
    const blocked = [join(codex, "skills"), join(proj, ".codex", "skills"), join(codex, "plugins", "cache", "m", "pa", "1.0.0", "skills")];
    const original = fsModule.listDir;
    vi.spyOn(fsModule, "listDir").mockImplementation(async (path) => (blocked.includes(path) ? { status: "unreadable" } : original(path)));
    const facts = await scan();
    expect(facts.unreadableSkillPlaces).toEqual({ user: true, projects: [normalizePath(proj)], plugins: ["pa@m"] });
    expect(facts.unreadableDirs).toEqual([...blocked].sort());
    expect(facts.skills.map((s) => s.name)).not.toContain("legacy");
  });
});
