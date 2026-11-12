// 묶음의 네트워크 검사가 node: 접두 없는 가져오기, 동적 가져오기, require, 전역 호출을 잡는지와 보수적인 한계를 시험한다(설계 2, 21.1)
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { bannedGlobals, bannedImports } from "../../scripts/bundle-scan.mjs";

async function scan(contents: string): Promise<{ imports: string[]; globals: string[] }> {
  const result = await build({
    stdin: { contents, loader: "ts", resolveDir: process.cwd() },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  return { imports: bannedImports(result.metafile), globals: bannedGlobals(result.outputFiles[0]!.text) };
}

describe("묶음의 네트워크 검사", () => {
  it("node: 접두가 없는 가져오기와 하위 경로도 잡는다", async () => {
    expect((await scan('import https from "https"; console.log(typeof https);')).imports).toEqual(["import-statement:https"]);
    expect((await scan('import { lookup } from "node:dns/promises"; console.log(typeof lookup);')).imports).toEqual(["import-statement:node:dns/promises"]);
  });
  it("문자열로 정한 동적 가져오기와 require도 잡는다", async () => {
    expect((await scan('const m = await import("node:https"); console.log(typeof m);')).imports).toEqual(["dynamic-import:node:https"]);
    expect((await scan('const h = require("http2"); console.log(typeof h);')).imports).toEqual(["require-call:http2"]);
  });
  it("전역 fetch를 호출하는 여러 꼴과 경로를 글자로 정하지 않은 동적 가져오기를 잡고, 파일을 읽는 내장 모듈은 통과시킨다", async () => {
    for (const code of ['await fetch("x");', 'await fetch?.("x");', "const f = fetch; await f(\"x\");", 'await globalThis["fetch"]("x");']) {
      expect((await scan(code)).globals).toEqual([String(/\bfetch\b/)]);
    }
    expect((await scan('const name = "node:https"; const m = await import(name); console.log(typeof m);')).globals).toEqual([String(/\bimport\s*\(/)]);
    expect(await scan('import { readFile } from "node:fs/promises"; console.log(typeof readFile);')).toEqual({ imports: [], globals: [] });
  });
  it("글자 검사는 보수적이다. 문자열 속의 같은 글자도 걸리므로 그런 문구는 쓰지 않는다", async () => {
    expect((await scan('console.log("docs fetch(");')).globals).toHaveLength(1);
  });
});
