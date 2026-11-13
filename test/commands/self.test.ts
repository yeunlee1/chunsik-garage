// 이 도구 자신의 정체(스킬 이름, 플러그인 이름, 스킬 폴더의 실제 경로)를 실행 파일의 위치에서 얻는 것을 시험한다. 정비 후보에서 이 도구를 빼는 데 쓴다(설계 7.1, 16.2)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { SELF_PLUGIN_NAMES, SELF_SKILL_NAMES, selfIdentity } from "../../src/commands/self.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

describe("이 도구 자신", () => {
  it("스킬 이름은 aq이고 플러그인 이름은 chunsik-garage다", () => {
    expect(SELF_SKILL_NAMES).toEqual(["aq"]);
    expect(SELF_PLUGIN_NAMES).toEqual(["chunsik-garage"]);
  });

  it("실행 파일이 <스킬 폴더>/scripts/aq.mjs이면 그 스킬 폴더의 실제 경로를 싣는다", async () => {
    const entry = join(root, "plugin", "skills", "aq", "scripts", "aq.mjs");
    await put(entry, "// bundle");
    expect(await selfIdentity(entry)).toEqual({ skillNames: ["aq"], pluginNames: ["chunsik-garage"], skillRealPaths: [normalizePath(join(root, "plugin", "skills", "aq"))] });
  });

  it("스킬 폴더가 링크면 링크를 푼 실제 경로다", async () => {
    const real = join(root, "store", "aq");
    await put(join(real, "scripts", "aq.mjs"), "// bundle");
    await linkDir(real, join(root, "skills", "aq"));
    const identity = await selfIdentity(join(root, "skills", "aq", "scripts", "aq.mjs"));
    expect(identity.skillRealPaths).toEqual([normalizePath(real)]);
  });

  it("묶은 실행 파일이 아니면(원본으로 돌릴 때) 스킬 폴더의 경로는 없다", async () => {
    const entry = join(root, "repo", "src", "entry.ts");
    await put(entry, "// source");
    expect((await selfIdentity(entry)).skillRealPaths).toEqual([]);
    expect((await selfIdentity(join(root, "nowhere", "scripts", "aq.mjs"))).skillRealPaths).toEqual([]);
  });
});
