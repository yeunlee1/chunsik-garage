// 목록을 읽지 못한 스킬 폴더가 누구의 것인지를 스캐너가 가르는지 시험한다. 사용자의 것, 프로젝트의 것, 플러그인의 것(설계 11.3 F5와 E5의 「읽지 못했을 때」)
import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { scanClaudeSetup, type ScanInput } from "../../src/scan/claude.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, readdir: vi.fn(real.readdir) };
});
const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

/** 이 폴더들의 목록 읽기를 권한 오류로 막는다. 폴더 자리에 파일을 두는 것은 없는 폴더로 읽히므로 쓰지 못한다 */
const deny = (...dirs: string[]): void => {
  vi.mocked(fsp.readdir).mockImplementation((async (path: unknown, ...rest: unknown[]) => {
    if (dirs.includes(String(path))) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    return (actual.readdir as (...args: unknown[]) => unknown)(path, ...rest);
  }) as never);
};

const json = (value: unknown): string => JSON.stringify(value);
const skill = (name: string): string => `---\nname: ${name}\ndescription: 시험용 스킬\n---\n`;

let root: string;
let input: ScanInput;
let userSkills: string;
let projectSkills: string;
let pluginSkills: string;
let proj: string;

beforeEach(async () => {
  root = await makeTemp();
  const home = join(root, "home");
  const claude = join(home, ".claude");
  proj = join(root, "work", "proj");
  userSkills = join(claude, "skills");
  projectSkills = join(proj, ".claude", "skills");
  const pa = join(claude, "plugins", "cache", "m", "pa", "1.0.0");
  pluginSkills = join(pa, "skills");
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(userSkills, "us", "SKILL.md"), skill("us"));
  await put(join(projectSkills, "ps", "SKILL.md"), skill("ps"));
  await put(join(pa, ".claude-plugin", "plugin.json"), json({ name: "pa" }));
  await put(join(pluginSkills, "s1", "SKILL.md"), skill("s1"));
  await put(join(claude, "plugins", "installed_plugins.json"), json({ version: 2, plugins: { "pa@m": [{ scope: "user", installPath: pa, version: "1.0.0" }] } }));
  const market = join(root, "market-m");
  await put(join(market, ".claude-plugin", "marketplace.json"), json({ name: "m", plugins: [{ name: "pa", source: "./pa" }] }));
  await put(join(claude, "plugins", "known_marketplaces.json"), json({ m: { source: { source: "github" }, installLocation: market } }));
  await put(join(claude, "settings.json"), json({ enabledPlugins: { "pa@m": true } }));
  input = { env: {}, homedir: home, tmpdir: join(root, "os-tmp"), platform: process.platform, cwds: [proj], claudeAiNames: [], salt: "5a".repeat(32), managedDir: join(root, "managed") };
});
afterEach(async () => {
  vi.mocked(fsp.readdir).mockImplementation(actual.readdir as never);
  await removeTemp(root);
});

describe("ClaudeSetupFacts.unreadableSkillPlaces", () => {
  it("스킬 폴더를 다 읽었으면 비어 있다", async () => {
    const facts = await scanClaudeSetup(input);
    expect(facts.skills.map((s) => s.name)).toEqual(["pa:s1", "ps", "us"]);
    expect(facts.unreadableDirs).toEqual([]);
    expect(facts.unreadableSkillPlaces).toEqual({ user: false, projects: [], plugins: [] });
  });
  it("프로젝트의 스킬 폴더는 정규화한 뿌리로, 플러그인의 스킬을 찾는 폴더는 플러그인 ID로 낸다", async () => {
    deny(projectSkills, pluginSkills);
    const facts = await scanClaudeSetup(input);
    expect(facts.skills.map((s) => s.name)).toEqual(["us"]);
    expect(facts.unreadableDirs).toEqual([projectSkills, pluginSkills].sort());
    expect(facts.unreadableSkillPlaces).toEqual({ user: false, projects: [normalizePath(proj)], plugins: ["pa@m"] });
  });
  it("사용자 스킬 폴더를 읽지 못한 것은 따로 낸다", async () => {
    deny(userSkills);
    const facts = await scanClaudeSetup(input);
    expect(facts.skills.map((s) => s.name)).toEqual(["pa:s1", "ps"]);
    expect(facts.unreadableSkillPlaces).toEqual({ user: true, projects: [], plugins: [] });
  });
});
