// 스캐너의 파일 읽기 도구를 시험한다. 없음·풀리지 않음·읽지 못함을 가르는지, 링크와 가리키는 곳이 없는 링크를 알아보는지 본다
import type { Stats } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { createdMsOf, entryInfo, listDir, readJson, readText } from "../../src/scan/fs.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

describe("readJson과 readText", () => {
  it("없는 파일, 풀리지 않는 파일, 폴더를 가른다", async () => {
    expect(await readJson(join(root, "none.json"))).toEqual({ status: "missing" });
    await put(join(root, "bad.json"), "{ nope");
    expect(await readJson(join(root, "bad.json"))).toEqual({ status: "unparsable" });
    await mkdir(join(root, "dir.json"));
    expect(await readJson(join(root, "dir.json"))).toEqual({ status: "unreadable" });
  });
  it("맨 앞의 BOM을 떼고 푼다", async () => {
    await put(join(root, "bom.json"), "﻿{\"a\":1}");
    expect(await readJson(join(root, "bom.json"))).toEqual({ status: "ok", value: { a: 1 } });
    expect(await readText(join(root, "bom.json"))).toEqual({ status: "ok", text: "{\"a\":1}" });
  });
});

describe("listDir", () => {
  it("이름 차례로 내고, 없는 폴더는 missing이다", async () => {
    await put(join(root, "d", "b.txt"), "");
    await put(join(root, "d", "a.txt"), "");
    expect(await listDir(join(root, "d"))).toEqual({ status: "ok", names: ["a.txt", "b.txt"] });
    expect(await listDir(join(root, "nope"))).toEqual({ status: "missing" });
  });
});

describe("entryInfo", () => {
  it("보통 폴더와 파일", async () => {
    await put(join(root, "skill", "SKILL.md"), "x");
    const dir = await entryInfo(join(root, "skill"));
    expect(dir).toMatchObject({ exists: true, isLink: false, isDir: true, dangling: false, targetCreatedMs: null });
    expect(dir.realPath).toBe(normalizePath(join(root, "skill")));
    expect((await entryInfo(join(root, "skill", "SKILL.md"))).isFile).toBe(true);
    expect((await entryInfo(join(root, "nothing"))).exists).toBe(false);
  });
  it("폴더 링크는 링크로 알아보고 실제 경로는 대상이다", async () => {
    await put(join(root, "real", "SKILL.md"), "x");
    await linkDir(join(root, "real"), join(root, "linked"));
    const info = await entryInfo(join(root, "linked"));
    expect(info).toMatchObject({ exists: true, isLink: true, isDir: true, dangling: false });
    expect(info.realPath).toBe(normalizePath(join(root, "real")));
  });
  it("가리키는 곳이 없는 링크는 dangling이다", async () => {
    await put(join(root, "gone", "SKILL.md"), "x");
    await linkDir(join(root, "gone"), join(root, "broken"));
    await rm(join(root, "gone"), { recursive: true, force: true });
    const info = await entryInfo(join(root, "broken"));
    expect(info).toMatchObject({ exists: true, isLink: true, isDir: false, dangling: true, targetCreatedMs: null });
  });
});

describe("createdMsOf", () => {
  const stats = (birthtimeMs: number): Stats => ({ birthtimeMs }) as Stats;
  it("0, 음수, NaN, 무한은 파일 시스템이 시각을 주지 않은 것이다", () => {
    for (const ms of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(createdMsOf(stats(ms))).toBeNull();
  });
  it("정상 시각은 그대로 낸다", () => {
    expect(createdMsOf(stats(1_760_000_000_000))).toBe(1_760_000_000_000);
  });
});
