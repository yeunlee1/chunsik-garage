// Codex의 지침 파일 고르기를 시험한다. 전역은 Codex 홈의 AGENTS.override.md와 AGENTS.md 가운데 Codex가 싣는 하나, 프로젝트는 뿌리에서 Codex가 고르는 하나이고, 같은 파일이어도 줄 지문을 낸다(설계 「5단계 2부 계획 전 결정」 5번)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fsModule from "../../src/scan/fs.ts";
import { readCodexGlobalInstructions, readCodexProjectInstructions } from "../../src/scan/codex-instructions.ts";
import { linesForOverlap } from "../../src/scan/instructions.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

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

const LONG = "모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다.";

describe("readCodexGlobalInstructions", () => {
  it("AGENTS.override.md에 내용이 있으면 그것 하나만 싣는다", async () => {
    await put(join(home, "AGENTS.override.md"), `${LONG}\n`);
    await put(join(home, "AGENTS.md"), "다른 지침 파일의 글은 이번에 실리지 않는다.\n");
    const { set } = await readCodexGlobalInstructions(home, []);
    expect(set.files.map((f) => f.path)).toEqual([join(home, "AGENTS.override.md")]);
    expect(set.bytes).toBe(Buffer.byteLength(`${LONG}\n`));
    expect(set.lineHashes).toEqual(linesForOverlap(LONG));
  });

  it("비었거나 공백만 있는 override와 폴더인 override는 건너뛰고 AGENTS.md를 싣는다", async () => {
    await put(join(home, "AGENTS.override.md"), " \n\t\n");
    await put(join(home, "AGENTS.md"), `${LONG}\n`);
    expect((await readCodexGlobalInstructions(home, [])).set.files.map((f) => f.path)).toEqual([join(home, "AGENTS.md")]);
    const other = join(root, "other");
    await mkdir(join(other, "AGENTS.override.md"), { recursive: true });
    await put(join(other, "AGENTS.md"), `${LONG}\n`);
    expect((await readCodexGlobalInstructions(other, [])).set.files.map((f) => f.path)).toEqual([join(other, "AGENTS.md")]);
  });

  it("둘 다 없거나 비었으면 전역 지침이 없다", async () => {
    expect((await readCodexGlobalInstructions(home, [])).set).toEqual({ files: [], bytes: 0, chars: { ascii: 0, other: 0 }, lineHashes: [], unreadable: [], unreadableDirs: [] });
    await put(join(home, "AGENTS.md"), "\n");
    expect((await readCodexGlobalInstructions(home, [])).set.files).toEqual([]);
  });

  it("있는데 읽지 못한 파일은 읽지 못한 것으로 적고 다음 후보를 본다(Codex도 경고하고 다음으로 간다)", async () => {
    await put(join(home, "AGENTS.override.md"), `${LONG}\n`);
    await put(join(home, "AGENTS.md"), `${LONG} 둘째\n`);
    const original = fsModule.readText;
    vi.spyOn(fsModule, "readText").mockImplementation(async (path) => (path === join(home, "AGENTS.override.md") ? { status: "unreadable" } : original(path)));
    const { set } = await readCodexGlobalInstructions(home, []);
    expect(set.files.map((f) => f.path)).toEqual([join(home, "AGENTS.md")]);
    expect(set.unreadable).toEqual([join(home, "AGENTS.override.md")]);
  });

  it("전역 지침에 목록의 프로젝트가 나온 횟수를 센다", async () => {
    const project = join(root, "work", "garage-app");
    await put(join(home, "AGENTS.md"), `garage-app 에서는 따로 정한 규칙을 따른다.\n${project}\n`);
    const { mentions } = await readCodexGlobalInstructions(home, [{ root: project, normRoot: project.replace(/\\/g, "/").toLowerCase() }]);
    expect(Object.values(mentions)).toEqual([2]);
  });
});

describe("readCodexProjectInstructions", () => {
  it("뿌리에서 AGENTS.override.md, AGENTS.md, fallback 이름의 차례로 일반 파일인 첫 하나를 고른다", async () => {
    const p = join(root, "p");
    await put(join(p, "AGENTS.md"), `${LONG}\n`);
    await put(join(p, "CLAUDE.md"), "fallback은 앞의 이름이 없을 때만 본다.\n");
    expect((await readCodexProjectInstructions(p, ["CLAUDE.md"])).files.map((f) => f.path)).toEqual([join(p, "AGENTS.md")]);
    const q = join(root, "q");
    await put(join(q, "CLAUDE.md"), `${LONG}\n`);
    expect((await readCodexProjectInstructions(q, ["CLAUDE.md"])).files.map((f) => f.path)).toEqual([join(q, "CLAUDE.md")]);
    expect((await readCodexProjectInstructions(q, [])).files).toEqual([]);
  });

  it("빈 AGENTS.override.md가 옆의 AGENTS.md를 가린다. 고른 파일이 비었으면 지침이 없다(내용 없음으로 든다)", async () => {
    const p = join(root, "p");
    await put(join(p, "AGENTS.override.md"), "");
    await put(join(p, "AGENTS.md"), `${LONG}\n`);
    const set = await readCodexProjectInstructions(p, []);
    expect(set.files.map((f) => [f.path, f.hasContent])).toEqual([[join(p, "AGENTS.override.md"), false]]);
    expect(set.lineHashes).toEqual([]);
  });

  it("폴더인 이름은 건너뛴다", async () => {
    const p = join(root, "p");
    await mkdir(join(p, "AGENTS.override.md"), { recursive: true });
    await put(join(p, "AGENTS.md"), `${LONG}\n`);
    expect((await readCodexProjectInstructions(p, [])).files.map((f) => f.path)).toEqual([join(p, "AGENTS.md")]);
  });

  it("전역 지침과 같은 파일이어도 같은 파일 표시를 붙이지 않고 줄 지문을 낸다(Codex는 두 번 싣는다)", async () => {
    await put(join(home, "AGENTS.md"), `${LONG}\n`);
    const set = await readCodexProjectInstructions(home, []);
    expect(set.files.map((f) => f.sameAsGlobal)).toEqual([false]);
    expect(set.lineHashes).toEqual(linesForOverlap(LONG));
  });

  it("고른 파일을 읽지 못하면 읽지 못한 것으로 적는다", async () => {
    const p = join(root, "p");
    await put(join(p, "AGENTS.md"), `${LONG}\n`);
    const original = fsModule.readText;
    vi.spyOn(fsModule, "readText").mockImplementation(async (path) => (path === join(p, "AGENTS.md") ? { status: "unreadable" } : original(path)));
    const set = await readCodexProjectInstructions(p, []);
    expect(set.files).toEqual([]);
    expect(set.unreadable).toEqual([join(p, "AGENTS.md")]);
  });
});
