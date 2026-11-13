// 지침 파일 읽기를 시험한다. 글자 종류별 수, 겹침 비교의 줄, 전역과 같은 파일, 규칙 폴더와 AGENTS.md, 읽지 못한 폴더, 프로젝트가 나온 횟수(설계 10, 11.3, 17)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import {
  countChars,
  countMentions,
  globalInstructionPaths,
  lineHash,
  linesForOverlap,
  markdownFilesUnder,
  projectInstructionPaths,
  readGlobalInstructions,
  readInstructionSet,
  readProjectInstructions,
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
