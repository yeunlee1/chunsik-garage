// Codex의 스킬을 찾는 곳 하나를 Codex와 같은 꼴로 훑는지 시험한다. 여섯 단의 폴더까지의 SKILL.md, 숨김 폴더, 폴더 링크와 파일 링크, 깨진 링크, 상한, 플러그인 이름 접두, Codex가 싣는 머리말인지(설계 「5단계 2부 계획 전 결정」 6번)
import { mkdir, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { codexFrontmatterOk, scanCodexSkillRoot } from "../../src/scan/codex-skills.ts";
import * as fsModule from "../../src/scan/fs.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let skills: string;
beforeEach(async () => {
  root = await makeTemp();
  skills = join(root, ".agents", "skills");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

const skill = (name: string | null, description = "시험용 스킬"): string => `---\n${name === null ? "" : `name: ${name}\n`}description: ${description}\n---\n\n본문 글은 남지 않는다.\n`;
const names = async (dir: string): Promise<string[]> => (await scanCodexSkillRoot(dir)).skills.map((s) => s.name).sort();

describe("scanCodexSkillRoot의 찾는 꼴", () => {
  it("찾는 곳 아래 여섯 단의 폴더까지 있는 SKILL.md를 스킬로 보고, 일곱째 단은 보지 않는다", async () => {
    const six = join(skills, "d0", "d1", "d2", "d3", "d4", "d5");
    await put(join(six, "SKILL.md"), skill("six"));
    await put(join(six, "d6", "SKILL.md"), skill("seven"));
    expect(await names(skills)).toEqual(["six"]);
  });

  it("찾는 곳 자신의 SKILL.md와 스킬 폴더 안의 SKILL.md도 따로 스킬이다", async () => {
    await put(join(skills, "SKILL.md"), skill("top"));
    await put(join(skills, "a", "SKILL.md"), skill("outer"));
    await put(join(skills, "a", "inner", "SKILL.md"), skill("inner"));
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => [s.name, s.folder.path]).sort()).toEqual([
      ["inner", join(skills, "a", "inner")],
      ["outer", join(skills, "a")],
      ["top", skills],
    ]);
  });

  it("찾는 곳 아래의 .으로 시작하는 폴더에는 들어가지 않는다. 찾는 곳 자신의 이름은 상관없다", async () => {
    await put(join(skills, ".system", "builtin", "SKILL.md"), skill("builtin"));
    await put(join(skills, "ok", ".git", "SKILL.md"), skill("hidden"));
    await put(join(skills, "ok", "SKILL.md"), skill("ok"));
    expect(await names(skills)).toEqual(["ok"]);
    const dotted = join(root, ".dotted-root");
    await put(join(dotted, "x", "SKILL.md"), skill("x"));
    expect(await names(dotted)).toEqual(["x"]);
  });

  it("이름이 SKILL.md 그대로인 일반 파일만 스킬이다", async () => {
    await put(join(skills, "lower", "skill.md"), skill("lower"));
    await mkdir(join(skills, "dir", "SKILL.md"), { recursive: true });
    expect(await names(skills)).toEqual([]);
  });

  it("폴더 링크는 따라가고, 같은 실제 폴더는 이름 차례로 먼저 만난 한 곳으로만 본다", async () => {
    const store = join(root, "store");
    await put(join(store, "shared", "SKILL.md"), skill("shared"));
    await linkDir(join(store, "shared"), join(skills, "a-link"));
    await linkDir(join(store, "shared"), join(skills, "b-link"));
    await put(join(skills, "plain", "SKILL.md"), skill("plain"));
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => [s.name, s.folder.path, s.viaLink])).toEqual([
      ["shared", join(skills, "a-link"), true],
      ["plain", join(skills, "plain"), false],
    ]);
    expect(scan.skills[0]!.folder.realPath).toBe(normalizePath(await realpath(join(store, "shared"))));
  });

  it("링크로 들어간 폴더 아래의 스킬도 링크로 건 것이다", async () => {
    const store = join(root, "store");
    await put(join(store, "pack", "inner", "SKILL.md"), skill("inner"));
    await linkDir(join(store, "pack"), join(skills, "pack"));
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => [s.name, s.viaLink, s.folder.isLink])).toEqual([["inner", true, false]]);
  });

  it("가리키는 곳이 없는 링크를 낸다", async () => {
    const gone = join(root, "gone");
    await put(join(gone, "SKILL.md"), skill("gone"));
    await linkDir(gone, join(skills, "broken"));
    await removeTemp(gone);
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills).toEqual([]);
    expect(scan.danglingLinks).toEqual([join(skills, "broken")]);
  });

  it("파일 링크인 SKILL.md는 스킬이 아니다", async (ctx) => {
    await put(join(root, "real", "SKILL.md"), skill("real"));
    await mkdir(join(skills, "linked"), { recursive: true });
    try {
      await symlink(join(root, "real", "SKILL.md"), join(skills, "linked", "SKILL.md"), "file");
    } catch {
      // Windows에서 관리자 권한이나 개발자 모드 없이는 파일 링크를 만들 수 없다
      ctx.skip();
    }
    expect(await names(skills)).toEqual([]);
  });

  it("목록을 읽지 못한 폴더를 낸다. 없는 찾는 곳은 빈 결과다", async () => {
    await put(join(skills, "a", "SKILL.md"), skill("a"));
    await put(join(skills, "b", "SKILL.md"), skill("b"));
    const original = fsModule.listDir;
    vi.spyOn(fsModule, "listDir").mockImplementation(async (path) => (path === join(skills, "a") ? { status: "unreadable" } : original(path)));
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => s.name)).toEqual(["b"]);
    expect(scan.unreadableDirs).toEqual([join(skills, "a")]);
    vi.restoreAllMocks();
    expect(await scanCodexSkillRoot(join(root, "none"))).toEqual({ skills: [], danglingLinks: [], unreadableDirs: [], truncated: false });
  });

  it("폴더 수나 항목 수가 상한에 닿으면 다 보지 못한 것으로 적는다(Codex는 거기서 자른다)", async () => {
    await put(join(skills, "a", "SKILL.md"), skill("a"));
    await put(join(skills, "b", "SKILL.md"), skill("b"));
    await put(join(skills, "c", "SKILL.md"), skill("c"));
    // 찾는 곳 자신이 폴더 하나다. 둘까지면 하위 폴더 하나만 내려간다
    const byDirs = await scanCodexSkillRoot(skills, { maxDirectories: 2, maxEntries: 20_000 });
    expect(byDirs.truncated).toBe(true);
    expect(byDirs.skills.map((s) => s.name)).toEqual(["a"]);
    // 항목은 a, b, c와 a/SKILL.md의 차례로 센다
    const byEntries = await scanCodexSkillRoot(skills, { maxDirectories: 2_000, maxEntries: 4 });
    expect(byEntries.truncated).toBe(true);
    expect(byEntries.skills.map((s) => s.name)).toEqual(["a"]);
    const enough = await scanCodexSkillRoot(skills, { maxDirectories: 4, maxEntries: 6 });
    expect(enough.truncated).toBe(false);
    expect(enough.skills.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });
});

describe("scanCodexSkillRoot의 이름", () => {
  it("머리말의 name(공백을 한 칸으로 줄인 것)이고, 없으면 SKILL.md가 든 폴더의 이름이다", async () => {
    await put(join(skills, "folder-a", "SKILL.md"), skill("  spaced   name  "));
    await put(join(skills, "folder-b", "SKILL.md"), skill(null));
    expect(await names(skills)).toEqual(["folder-b", "spaced name"]);
  });

  it("스킬 폴더에서 찾는 곳까지 가장 가까운 플러그인 매니페스트의 이름이 앞에 붙는다", async () => {
    await put(join(skills, "plug", ".codex-plugin", "plugin.json"), JSON.stringify({ name: "sample" }));
    await put(join(skills, "plug", "skills", "search", "SKILL.md"), skill(null));
    await put(join(skills, "plug", "nested", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "deeper" }));
    await put(join(skills, "plug", "nested", "s2", "SKILL.md"), skill(null));
    await put(join(skills, "noname", ".cursor-plugin", "plugin.json"), JSON.stringify({ name: "  " }));
    await put(join(skills, "noname", "x", "SKILL.md"), skill(null));
    await put(join(skills, "broken", ".codex-plugin", "plugin.json"), "{ 깨진 JSON");
    await put(join(skills, "broken", "y", "SKILL.md"), skill(null));
    await put(join(skills, "plain", "SKILL.md"), skill(null));
    expect(await names(skills)).toEqual(["deeper:s2", "noname:x", "plain", "sample:search", "y"]);
  });

  it("같은 폴더에 매니페스트가 여럿이면 .codex-plugin, .claude-plugin, .cursor-plugin의 차례로 첫 파일이다. 깨진 깊은 매니페스트는 건너뛰고 바깥 것을 쓴다", async () => {
    await put(join(skills, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "outer" }));
    await put(join(skills, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "second" }));
    await put(join(skills, "inner", ".claude-plugin", "plugin.json"), "{");
    await put(join(skills, "inner", "s", "SKILL.md"), skill(null));
    expect(await names(skills)).toEqual(["outer:s"]);
  });

  it("SKILL.md 파일의 실제 경로를 낸다([[skills.config]]의 path와 견준다)", async () => {
    await put(join(skills, "a", "SKILL.md"), skill("a"));
    const [found] = (await scanCodexSkillRoot(skills)).skills;
    expect(found!.skillFileRealPath).toBe(normalizePath(await realpath(join(skills, "a", "SKILL.md"))));
  });
});

describe("codexFrontmatterOk", () => {
  it("머리말이 있고 description이 비지 않아야 Codex가 싣는다", () => {
    expect(codexFrontmatterOk(Buffer.from(skill("a")))).toBe(true);
    expect(codexFrontmatterOk(Buffer.from("---\nname: a\n---\n본문\n"))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from("---\nname: a\ndescription:   \n---\n"))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from('---\nname: a\ndescription: ""\n---\n'))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from("---\n---\n"))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from("# 머리말 없음\n"))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from("---\ndescription: 닫는 줄이 없다\n"))).toBe(false);
  });

  it("BOM으로 시작하면 Codex가 머리말을 찾지 못한다", () => {
    expect(codexFrontmatterOk(Buffer.from(`﻿${skill("a")}`))).toBe(false);
  });

  it("description을 스캐너가 읽지 못하는 꼴이면 있는 것으로 본다", () => {
    expect(codexFrontmatterOk(Buffer.from("---\nname: a\ndescription: |\n  여러 줄\n---\n"))).toBe(true);
    expect(codexFrontmatterOk(Buffer.from('---\nname: a\n"description": 따옴표 열쇠\n---\n'))).toBe(true);
  });
});

describe("스킬 위치의 머리말 사실", () => {
  it("읽은 SKILL.md마다 Codex가 싣는 머리말인지를 낸다", async () => {
    await put(join(skills, "good", "SKILL.md"), skill("good"));
    await put(join(skills, "nodesc", "SKILL.md"), "---\nname: nodesc\n---\n");
    await put(join(skills, "bom", "SKILL.md"), `﻿${skill("bom")}`);
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => [s.folder.dirName, s.frontmatterOk, s.folder.readable]).sort()).toEqual([
      ["bom", false, true],
      ["good", true, true],
      ["nodesc", false, true],
    ]);
  });
});
