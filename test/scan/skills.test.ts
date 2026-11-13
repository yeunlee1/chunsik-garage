// 스킬 폴더 훑기를 시험한다. 머리말 읽기, 내용 지문(같은 사본·다른 사본·견줄 수 없는 사본), 링크와 가리키는 곳이 없는 링크(설계 10, 11.3 F5, 21.1)
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { contentHash, parseFrontmatter, readScalar, readSkillFolder, scanSkillPath, scanSkillRoot } from "../../src/scan/skills.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

const skillMd = (fields: string): string => `---\n${fields}\n---\n\n# 본문\n이 글은 남지 않는다.\n`;

describe("parseFrontmatter", () => {
  it("--- 사이의 열쇠: 값만 읽고 따옴표를 뗀다. CRLF도 읽는다", () => {
    expect(parseFrontmatter("---\r\nname: \"deploy\"\r\ndisable-model-invocation: true\r\n---\r\nbody")).toEqual({
      present: true,
      fields: { name: "deploy", "disable-model-invocation": "true" },
      unreadable: [],
    });
  });
  it("맨 앞이 ---가 아니거나 닫는 줄이 없으면 머리말이 없다", () => {
    expect(parseFrontmatter("# 제목\n---\nname: x\n---\n").present).toBe(false);
    expect(parseFrontmatter("---\nname: x\n").present).toBe(false);
  });
});

describe("contentHash", () => {
  it("상대 경로와 내용이 모두 같아야 같은 지문이다. SKILL.md만 같고 딸린 스크립트가 다르면 다르다", async () => {
    for (const dir of ["a", "b", "c"]) await put(join(root, dir, "SKILL.md"), skillMd("name: s"));
    await put(join(root, "a", "scripts", "run.sh"), "echo 1");
    await put(join(root, "b", "scripts", "run.sh"), "echo 1");
    await put(join(root, "c", "scripts", "run.sh"), "echo 2");
    const [a, b, c] = await Promise.all(["a", "b", "c"].map((dir) => contentHash(join(root, dir))));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("폴더 안에 링크가 있으면 견줄 수 없다(null)", async () => {
    await put(join(root, "s", "SKILL.md"), skillMd("name: s"));
    await put(join(root, "shared", "x.md"), "x");
    await linkDir(join(root, "shared"), join(root, "s", "refs"));
    expect(await contentHash(join(root, "s"))).toBeNull();
  });
});

describe("readSkillFolder", () => {
  it("머리말의 name, disable-model-invocation, user-invocable을 읽는다", async () => {
    await put(join(root, "deploy-staging", "SKILL.md"), skillMd("name: deploy\ndisable-model-invocation: true\nuser-invocable: false"));
    const skill = await readSkillFolder(join(root, "deploy-staging"), "deploy-staging");
    expect(skill).toMatchObject({ dirName: "deploy-staging", declaredName: "deploy", disableModelInvocation: true, userInvocable: false, hasFrontmatter: true, readable: true, isLink: false });
    expect(skill!.realPath).toBe(normalizePath(join(root, "deploy-staging")));
    expect(skill!.createdMs === null || typeof skill!.createdMs === "number").toBe(true);
    expect(JSON.stringify(skill)).not.toContain("남지 않는다");
  });
  it("머리말이 없는 SKILL.md는 hasFrontmatter가 거짓이다. SKILL.md가 없는 폴더는 스킬이 아니다", async () => {
    await put(join(root, "plain", "SKILL.md"), "# 머리말 없음\n");
    expect(await readSkillFolder(join(root, "plain"), "plain")).toMatchObject({ hasFrontmatter: false, declaredName: null, readable: true });
    await put(join(root, "notes", "README.md"), "x");
    expect(await readSkillFolder(join(root, "notes"), "notes")).toBeNull();
  });
});

describe("scanSkillRoot", () => {
  it("스킬 폴더와 링크로 건 스킬을 이름 차례로 내고, 가리키는 곳이 없는 링크를 따로 적는다", async () => {
    const skills = join(root, "skills");
    await put(join(skills, "a", "SKILL.md"), skillMd("name: a"));
    await put(join(root, "store", "b", "SKILL.md"), skillMd("name: b"));
    await linkDir(join(root, "store", "b"), join(skills, "b"));
    await put(join(skills, "c-not-skill", "notes.md"), "x");
    await put(join(root, "store", "d", "SKILL.md"), skillMd("name: d"));
    await linkDir(join(root, "store", "d"), join(skills, "d"));
    await rm(join(root, "store", "d"), { recursive: true, force: true });
    await put(join(skills, "e.txt"), "x");
    const scan = await scanSkillRoot(skills);
    expect(scan.skills.map((s) => [s.dirName, s.isLink])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(scan.skills[1]!.realPath).toBe(normalizePath(join(root, "store", "b")));
    expect(scan.danglingLinks).toEqual([join(skills, "d")]);
  });
  it("폴더가 없으면 아무것도 없다", async () => {
    expect(await scanSkillRoot(join(root, "none"))).toEqual({ skills: [], danglingLinks: [], unreadableDirs: [], pluginDirs: [] });
  });
  it("사용자·프로젝트 스킬 폴더를 훑을 때 .claude-plugin/plugin.json이 든 폴더(링크 포함)는 스킬이 아니라 플러그인 폴더로 따로 낸다", async () => {
    const skills = join(root, "skills");
    await put(join(skills, "plain", "SKILL.md"), skillMd("name: plain"));
    await put(join(skills, "my-tool", ".claude-plugin", "plugin.json"), "{}");
    await put(join(skills, "my-tool", "SKILL.md"), skillMd("name: my-tool"));
    await put(join(root, "store", "linked-tool", ".claude-plugin", "plugin.json"), "{}");
    await linkDir(join(root, "store", "linked-tool"), join(skills, "linked-tool"));
    const scan = await scanSkillRoot(skills, { pluginDirs: true });
    expect(scan.skills.map((s) => s.dirName)).toEqual(["plain"]);
    expect(scan.pluginDirs).toEqual([join(skills, "linked-tool"), join(skills, "my-tool")]);
    // 플러그인 안의 스킬 폴더를 훑을 때(기본)는 가르지 않는다
    const inside = await scanSkillRoot(skills);
    expect(inside.skills.map((s) => s.dirName)).toEqual(["my-tool", "plain"]);
    expect(inside.pluginDirs).toEqual([]);
  });
});

describe("머리말 값 읽기(YAML 한 줄 값)", () => {
  it("큰따옴표의 탈출 글자는 YAML대로 풀고, 모르는 탈출 글자나 모자란 16진은 읽지 못한 것이다", () => {
    expect(readScalar('"\\u0064eploy"')).toBe("deploy");
    expect(readScalar('"\\x41b"')).toBe("Ab");
    expect(readScalar('"\\U00000041"')).toBe("A");
    expect(readScalar('"a\\\\b\\"c\\/d"')).toBe('a\\b"c/d');
    expect(readScalar('"tab\\there"')).toBe("tab\there");
    expect(readScalar('"\\q"')).toBeNull();
    expect(readScalar('"\\u00"')).toBeNull();
    expect(readScalar('"\\u00zz"')).toBeNull();
    expect(parseFrontmatter('---\nname: "\\q"\n---\n')).toMatchObject({ unreadable: ["name"] });
  });
  it("인용 밖의 주석을 떼고, 인용 안의 #은 남기고, 따옴표를 푼다", () => {
    expect(readScalar("sample # PRIVATE-COMMENT-123")).toBe("sample");
    expect(readScalar('"a # b" # note')).toBe("a # b");
    expect(readScalar("'it''s'")).toBe("it's");
    expect(readScalar('"q\\"x"')).toBe('q"x');
    expect(readScalar("a#b")).toBe("a#b");
    expect(readScalar("")).toBe("");
    expect(readScalar("# only comment")).toBe("");
  });
  it("블록 값, 흐름 값, 닫히지 않은 인용, 인용 뒤의 다른 글은 읽지 못한 것이다", () => {
    for (const raw of [">-", "|", "[a, b]", "{a: 1}", '"open', "'open", '"a" b', "&anchor x", "*alias"]) expect(readScalar(raw)).toBeNull();
  });
  it("주석이 붙은 제어 값은 주석을 떼고 읽는다. 블록 값의 name은 읽지 못한 열쇠로 남는다", () => {
    const front = parseFrontmatter("---\nname: >-\n  folded-name\ndisable-model-invocation: true # disabled\nuser-invocable: False\n---\n");
    expect(front.fields["disable-model-invocation"]).toBe("true");
    expect(front.fields["user-invocable"]).toBe("False");
    expect(front.unreadable).toEqual(["name"]);
    expect(front.fields.name).toBeUndefined();
  });
  it("이름을 정할 수 있는 줄을 이 방법으로 다 읽지 못하면 이름을 모르는 것으로 둔다. 따옴표로 쓴 열쇠, 열쇠 뒤의 공백, 여러 줄 열쇠, 흐름 꼴이다", () => {
    for (const text of ['---\n"name": idle\ndescription: x\n---\n', "---\n'name': idle\n---\n", "---\nname : idle\n---\n", "---\n? name\n: idle\n---\n", "---\n{name: idle}\n---\n"]) {
      expect(parseFrontmatter(text).unreadable).toEqual(["name"]);
    }
    // name의 값이 다음 줄로 이어지면 읽은 앞부분은 이름이 아니다. 앞부분만 이름 꼴에 넣으면 다른 스킬의 기록을 이을 수 있다
    for (const text of ["---\nname:\n  idle\n---\n", "---\nname: idle\n  more\n---\n", "---\nname: idle\n\n  more\n---\n"]) {
      const front = parseFrontmatter(text);
      expect(front.unreadable).toEqual(["name"]);
      expect(front.fields.name).toBeUndefined();
    }
  });
  it("최상위 열쇠 앞의 들여쓴 줄, 들여쓴 닫는 경계, 두 번 나온 name도 이름을 모르는 것으로 둔다", () => {
    // 머리말 전체를 들여써 적었다. 열쇠를 하나도 읽지 못한다
    expect(parseFrontmatter("---\n  name: idle\n  description: x\n---\n").unreadable).toEqual(["name"]);
    // 블록 값 안의 들여쓴 --- 줄을 머리말의 끝으로 봤다. 그 뒤의 name을 읽지 못했을 수 있다
    expect(parseFrontmatter("---\ndescription: |\n  설명\n  ---\n  이어지는 설명\nname: idle\n---\n").unreadable).toContain("name");
    // 같은 열쇠가 두 번 나오면 어느 값이 이름인지 모른다
    const twice = parseFrontmatter("---\nname: a\nname: b\n---\n");
    expect(twice.unreadable).toEqual(["name"]);
    expect(twice.fields.name).toBeUndefined();
  });
  it("다른 열쇠의 값이 다음 줄로 이어지거나 묶음이면 이름은 그대로 읽는다. 들여쓴 주석 줄과 맨 앞의 주석 줄도 그렇다", () => {
    const front = parseFrontmatter("---\n# 맨 앞의 주석\nname: idle\n  # 들여쓴 주석\ndescription: |\n  여러 줄\n  설명\nmetadata:\n  version: 1\n\n---\n");
    expect(front.fields.name).toBe("idle");
    expect(front.unreadable).not.toContain("name");
    // 값을 비운 name은 이름이 없는 것이다(YAML의 빈 값)
    const empty = parseFrontmatter("---\nname:\ndescription: x\n---\n");
    expect(empty.fields.name).toBe("");
    expect(empty.unreadable).toEqual([]);
    // 묶음 안의 name은 최상위 이름이 아니다
    const nested = parseFrontmatter("---\nmetadata:\n  name: other\nname: idle\n---\n");
    expect(nested.fields.name).toBe("idle");
    expect(nested.unreadable).toEqual([]);
  });
  it("이름에 붙은 주석은 셋팅 사실로 넘어가지 않고, 읽지 못한 name은 표시한다", async () => {
    await put(join(root, "c", "SKILL.md"), "---\nname: sample # PRIVATE-COMMENT-123\ndisable-model-invocation: true # off\n---\n");
    const commented = await readSkillFolder(join(root, "c"), "c");
    expect(commented).toMatchObject({ declaredName: "sample", nameUnreadable: false, disableModelInvocation: true });
    expect(JSON.stringify(commented)).not.toContain("PRIVATE-COMMENT-123");
    await put(join(root, "b", "SKILL.md"), "---\nname: |\n  multi\n---\n");
    expect(await readSkillFolder(join(root, "b"), "b")).toMatchObject({ declaredName: null, nameUnreadable: true });
    await put(join(root, "q", "SKILL.md"), '---\n"name": idle\n---\n');
    expect(await readSkillFolder(join(root, "q"), "q")).toMatchObject({ declaredName: null, nameUnreadable: true });
  });
});

describe("내용 지문의 상한", () => {
  it("합이 상한과 같으면 지문을 내고, 넘으면 견줄 수 없다", async () => {
    await put(join(root, "s", "SKILL.md"), "12345");
    await put(join(root, "s", "data.bin"), "67890");
    expect(await contentHash(join(root, "s"), 10)).toMatch(/^[0-9a-f]{64}$/);
    expect(await contentHash(join(root, "s"), 11)).toMatch(/^[0-9a-f]{64}$/);
    expect(await contentHash(join(root, "s"), 9)).toBeNull();
  });
});

describe("scanSkillPath", () => {
  it("경로 자체에 SKILL.md가 있으면 그 폴더가 스킬 하나다", async () => {
    await put(join(root, "extra", "one", "SKILL.md"), skillMd("name: one"));
    const single = await scanSkillPath(join(root, "extra", "one"));
    expect(single.skills.map((s) => s.dirName)).toEqual(["one"]);
  });
  it("없으면 그 아래의 <이름>/SKILL.md를 훑는다", async () => {
    await put(join(root, "extra", "one", "SKILL.md"), skillMd("name: one"));
    await put(join(root, "extra", "two", "SKILL.md"), skillMd("name: two"));
    expect((await scanSkillPath(join(root, "extra"))).skills.map((s) => s.dirName)).toEqual(["one", "two"]);
  });
});
