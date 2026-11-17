// 지침 파일 읽기를 시험한다. 글자 종류별 수, 겹침 비교의 줄, 전역과 같은 파일, 규칙 폴더와 AGENTS.md, 읽지 못한 폴더, 프로젝트가 나온 횟수(설계 10, 11.3, 17)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import {
  countChars,
  countMentions,
  globalInstructionPaths,
  importsOf,
  importTarget,
  lineHash,
  linesForOverlap,
  markdownFilesUnder,
  projectInstructionPaths,
  readGlobalInstructions,
  readInstructionSet,
  readProjectInstructions,
  reachesNetwork,
  realPaths,
} from "../../src/scan/instructions.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

describe("글자와 줄", () => {
  it("ASCII와 그 밖의 글자를 코드 포인트로 나눠 센다", () => {
    expect(countChars("abc 한글😀")).toEqual({ ascii: 4, other: 3 });
  });
  it("앞뒤 공백을 뗀 20자 이상 줄만 지문을 만든다. CRLF도 같은 줄이다", () => {
    const long = "이 줄은 스무 글자를 넘는 한국어 지침 줄입니다";
    expect(linesForOverlap(`짧은 줄\r\n   ${long}   \r\n${"x".repeat(19)}\n`)).toEqual([lineHash(long)]);
    expect(linesForOverlap("a".repeat(20))).toEqual([lineHash("a".repeat(20))]);
  });
});

describe("readInstructionSet", () => {
  it("파일들의 크기·글자·줄 지문을 합치고 글은 남기지 않는다", async () => {
    const line = "Always run the tests before you say the work is done.";
    await put(join(root, "a.md"), `${line}\n짧다\n`);
    await put(join(root, "b.md"), `${line}\r\n`);
    const { set } = await readInstructionSet([join(root, "b.md"), join(root, "a.md"), join(root, "none.md")]);
    expect(set.files.map((f) => f.path)).toEqual([join(root, "a.md"), join(root, "b.md")]);
    expect(set.bytes).toBe(Buffer.byteLength(`${line}\n짧다\n`) + Buffer.byteLength(`${line}\r\n`));
    expect(set.lineHashes).toEqual([lineHash(line)]);
    expect(JSON.stringify(set)).not.toContain("Always run");
  });

  it("실제 경로가 전역 지침과 같은 파일은 목록과 크기에는 남기고 줄 지문에서만 뺀다(F3에는 있고 F4에서 견주지 않는다)", async () => {
    const line = "global rules line that is long enough to compare";
    await put(join(root, "global", "CLAUDE.md"), line);
    await linkDir(join(root, "global"), join(root, "proj", ".claude"));
    const global = await readInstructionSet([join(root, "global", "CLAUDE.md")]);
    const project = await readInstructionSet([join(root, "proj", ".claude", "CLAUDE.md")], [], realPaths(global.set));
    expect(project.set.files).toEqual([
      { path: join(root, "proj", ".claude", "CLAUDE.md"), realPath: normalizePath(join(root, "global", "CLAUDE.md")), bytes: Buffer.byteLength(line), hasContent: true, sameAsGlobal: true },
    ]);
    expect(project.set.lineHashes).toEqual([]);
    expect(global.set.lineHashes).toEqual([lineHash(line)]);
  });

  it("공백이 아닌 글자가 하나라도 있어야 내용이 있는 파일이다(설계 11.3 F3 「지침이 있다는 것」)", async () => {
    await put(join(root, "empty.md"), "");
    await put(join(root, "blank.md"), " \r\n\t\n﻿");
    await put(join(root, "one-line.md"), "\n# 제목\n");
    const { set } = await readInstructionSet([join(root, "empty.md"), join(root, "blank.md"), join(root, "one-line.md")]);
    expect(set.files.map((f) => [f.path, f.hasContent])).toEqual([
      [join(root, "blank.md"), false],
      [join(root, "empty.md"), false],
      [join(root, "one-line.md"), true],
    ]);
  });

  it("폴더처럼 읽을 수 없는 경로는 읽지 못한 것으로 적는다", async () => {
    await put(join(root, "CLAUDE.md", "inside.txt"), "x");
    const { set } = await readInstructionSet([join(root, "CLAUDE.md")]);
    expect(set.unreadable).toEqual([join(root, "CLAUDE.md")]);
  });
});

describe("지침 파일의 위치", () => {
  it("전역 지침은 CLAUDE.md와 rules 아래의 .md다. 폴더 링크는 따라가지 않는다", async () => {
    const home = join(root, ".claude");
    await put(join(home, "rules", "a.md"), "x");
    await put(join(home, "rules", "deep", "b.md"), "x");
    await put(join(home, "rules", "notes.txt"), "x");
    await put(join(root, "elsewhere", "c.md"), "x");
    await linkDir(join(root, "elsewhere"), join(home, "rules", "linked"));
    expect(await globalInstructionPaths(home)).toEqual({ paths: [join(home, "CLAUDE.md"), join(home, "rules", "a.md"), join(home, "rules", "deep", "b.md")], unreadableDirs: [] });
  });

  it("CLAUDE 파일이 있으면 AGENTS.md를 넣지 않고, 없으면 넣는다. 규칙 파일만 있어도 지침이다", async () => {
    const withClaude = join(root, "p1");
    await put(join(withClaude, "CLAUDE.local.md"), "x");
    await put(join(withClaude, "AGENTS.md"), "x");
    await put(join(withClaude, ".claude", "rules", "r.md"), "x");
    expect((await projectInstructionPaths(withClaude)).paths).toEqual([join(withClaude, "CLAUDE.local.md"), join(withClaude, ".claude", "rules", "r.md")]);
    const agentsOnly = join(root, "p2");
    await put(join(agentsOnly, "AGENTS.md"), "x");
    expect((await projectInstructionPaths(agentsOnly)).paths).toEqual([join(agentsOnly, "AGENTS.md"), join(agentsOnly, ".claude", "AGENTS.md")]);
    const rulesOnly = join(root, "p3");
    await put(join(rulesOnly, ".claude", "rules", "sub", "deep.md"), "x");
    const global = await readGlobalInstructions(join(root, "no-home"), []);
    const set = await readProjectInstructions(rulesOnly, global.set);
    expect(set.files.map((f) => f.path)).toEqual([join(rulesOnly, ".claude", "rules", "sub", "deep.md")]);
  });

  it("목록을 읽지 못한 규칙 폴더는 따로 적는다(없는 폴더는 적지 않는다)", async () => {
    // 경로에 NUL이 들면 Node.js가 목록 읽기를 거절한다. 어느 OS에서나 "읽지 못함"을 만드는 방법이다
    const bad = join(root, "bad\u0000dir");
    expect(await markdownFilesUnder(bad)).toEqual({ paths: [], unreadableDirs: [bad] });
    expect(await markdownFilesUnder(join(root, "none"))).toEqual({ paths: [], unreadableDirs: [] });
  });
});

describe("가져오기(@경로, 0.3.0)", () => {
  it("줄 어디서나 @경로를 찾고, 코드 칸·코드 블록·따옴표·메일 주소는 가져오기가 아니다. 빈칸은 \\로 이은 것을 푼다", () => {
    const text = [
      "See @README.md for the overview and @docs/git.md for git.",
      "@~/.claude/mine.md",
      "Write `@not-this.md` literally.",
      "```",
      "@inside-fence.md",
      "```",
      "@Design\\ Docs/api.md",
      '@"quoted.md"',
      "mail me at someone@example.com",
    ].join("\n");
    expect(importsOf(text)).toEqual(["README.md", "docs/git.md", "~/.claude/mine.md", "Design Docs/api.md"]);
  });

  it("목록·인용 안의 코드 블록과 여러 줄에 걸친 코드 칸 안은 가져오기가 아니다(짝 검토 1차 필수 1)", () => {
    expect(importsOf(["- ```md", "  @AGENTS.md", "  ```", "> ```", "> @quoted.md", "> ```", "1. ~~~", "   @numbered.md", "   ~~~", "@after.md"].join("\n"))).toEqual(["after.md"]);
    expect(importsOf("문장 `\n@AGENTS.md\n끝` 다음\n@real.md")).toEqual(["real.md"]);
    // 빈 줄로 끝난 문단을 넘는 역따옴표는 코드 칸이 아니다
    expect(importsOf("짝이 없는 ` 하나\n\n@kept.md")).toEqual(["kept.md"]);
  });

  it("네트워크 경로(\\\\서버 또는 //서버)는 가져오기 대상으로 풀지 않는다. 파일 조회조차 하지 않는다(짝 검토 1차 필수 3)", () => {
    const from = join(root, "CLAUDE.md");
    expect(importTarget("\\\\review.invalid\\share\\rules.md", from, root)).toBeNull();
    expect(importTarget("//review.invalid/share/rules.md", from, root)).toBeNull();
    expect(importTarget("rules.md", from, root)).toBe(join(root, "rules.md"));
    expect(importTarget("~/x.md", from, join(root, "home"))).toBe(join(root, "home", "x.md"));
  });

  it("경로의 어느 칸이 네트워크를 가리키는 연결이면, 그 연결을 따라가는 조회 없이 알아본다. 그 뒤의 칸은 조회하지 않는다(짝 검토 2차 필수 1)", async () => {
    const links = new Map<string, string>([
      [join(root, "proj", "linked.md"), "\\\\review.invalid\\share\\rules.md"],
      [join(root, "proj", "net"), "//review.invalid/share"],
      [join(root, "proj", "local"), join(root, "elsewhere")],
    ]);
    const looked: string[] = [];
    const ops = {
      lstat: async (path: string) => {
        looked.push(path);
        return { isSymbolicLink: () => links.has(path) };
      },
      readlink: async (path: string) => links.get(path)!,
    };
    expect(await reachesNetwork(join(root, "proj", "linked.md"), ops)).toBe(true);
    looked.length = 0;
    expect(await reachesNetwork(join(root, "proj", "net", "deep", "rules.md"), ops)).toBe(true);
    expect(looked).not.toContain(join(root, "proj", "net", "deep"));
    expect(await reachesNetwork(join(root, "proj", "local", "rules.md"), ops)).toBe(false);
    expect(await reachesNetwork(join(root, "proj", "plain.md"), ops)).toBe(false);
    expect(await reachesNetwork("\\\\server\\share\\x.md", ops)).toBe(true);
  });

  it("프로젝트 안의 연결 폴더를 거쳐 프로젝트 밖을 가리키는 가져오기는 따르지 않는다. 프로젝트 뿌리 자체가 연결이면 안쪽 가져오기는 따른다(짝 검토 1차 필수 2)", async () => {
    const homedir = join(root, "home");
    const project = join(root, "proj");
    await put(join(root, "outside", "rules.md"), "Outside rules that must not be read\n");
    await linkDir(join(root, "outside"), join(project, "linked"));
    await put(join(project, "CLAUDE.md"), "@linked/rules.md\n@inside.md\n");
    await put(join(project, "inside.md"), "Inside rules that are read\n");
    const global = await readGlobalInstructions(join(root, "no-home"), [], { homedir });
    expect((await readProjectInstructions(project, global.set, { homedir })).files.map((f) => f.path)).toEqual([join(project, "CLAUDE.md"), join(project, "inside.md")]);
    // 뿌리를 연결로 열어도 안쪽 가져오기는 그대로 따른다
    await linkDir(project, join(root, "via-link"));
    expect((await readProjectInstructions(join(root, "via-link"), global.set, { homedir })).files.map((f) => f.path)).toEqual([join(root, "via-link", "CLAUDE.md"), join(root, "via-link", "inside.md")]);
  });

  it("전역 지침은 가져온 파일까지 크기와 줄에 넣는다. ~/는 홈, 상대 경로는 그 파일 기준이고, 네 단계까지 따른다. 돌아오는 가져오기는 한 번만 읽는다", async () => {
    const homedir = join(root, "home");
    const profile = join(root, "profile");
    const line = "Imported rule line that is long enough to compare";
    await put(join(profile, "CLAUDE.md"), "@~/.claude/CLAUDE.md\n");
    await put(join(homedir, ".claude", "CLAUDE.md"), `${line}\n@../.agents/rules.md\n`);
    await put(join(homedir, ".agents", "rules.md"), "@two.md\n");
    await put(join(homedir, ".agents", "two.md"), "@three.md\n@rules.md\n");
    await put(join(homedir, ".agents", "three.md"), "@four.md\n");
    await put(join(homedir, ".agents", "four.md"), "fifth hop is not read\n");
    const { set } = await readGlobalInstructions(profile, [], { homedir });
    expect(set.files.map((f) => f.path)).toEqual([join(homedir, ".agents", "rules.md"), join(homedir, ".agents", "three.md"), join(homedir, ".agents", "two.md"), join(homedir, ".claude", "CLAUDE.md"), join(profile, "CLAUDE.md")]);
    // 읽은 다섯 파일의 글(네 단계 너머의 four.md는 읽지 않는다)
    const read = ["@~/.claude/CLAUDE.md\n", `${line}\n@../.agents/rules.md\n`, "@two.md\n", "@three.md\n@rules.md\n", "@four.md\n"];
    expect(set.bytes).toBe(read.reduce((sum, text) => sum + Buffer.byteLength(text), 0));
    expect(set.lineHashes).toContain(lineHash(line));
    // 홈을 주지 않으면 지금처럼 가져오기를 따르지 않는다
    expect((await readGlobalInstructions(profile, [])).set.files.map((f) => f.path)).toEqual([join(profile, "CLAUDE.md")]);
  });

  it("프로젝트 지침은 프로젝트 폴더 안의 가져오기만 따른다(바깥 가져오기는 승인을 받아야 실려 실렸는지 알 수 없다)", async () => {
    const homedir = join(root, "home");
    const project = join(root, "proj");
    await put(join(project, "CLAUDE.md"), "@AGENTS.md\n@~/outside.md\n");
    await put(join(project, "AGENTS.md"), "Project agents rules that are long enough\n");
    await put(join(homedir, "outside.md"), "outside\n");
    const global = await readGlobalInstructions(join(root, "no-home"), [], { homedir });
    const set = await readProjectInstructions(project, global.set, { homedir });
    expect(set.files.map((f) => f.path)).toEqual([join(project, "AGENTS.md"), join(project, "CLAUDE.md")]);
  });
});

describe("countMentions", () => {
  const target = (path: string) => ({ root: path, normRoot: normalizePath(path) });
  it("경로는 구분 기호와 대소문자를 맞춰, 폴더 이름은 낱말로 센다", () => {
    const app = target(join(root, "dev", "billing-app"));
    const text = `Use ${join(root, "dev", "billing-app").toUpperCase()} for invoices. billing-app owns payments. my-billing-apps is different.`;
    expect(countMentions(text, [app])).toEqual({ [app.normRoot]: 2 });
  });
  it("세 글자보다 짧은 폴더 이름은 낱말로 세지 않는다", () => {
    const short = target(join(root, "ui"));
    expect(countMentions("the ui is fine", [short])).toEqual({});
  });
});
