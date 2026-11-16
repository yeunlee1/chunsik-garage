// 사용자에게 배포할 플러그인 산출물을 모으는 것을 시험한다. 플러그인이 쓰는 파일만 같은 자리에 같은 내용으로 담고, 개발 도구(package.json, 잠금 파일)와 소스·시험·문서는 담지 않는다(「4단계 계획에서 보완」)
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { packPlugin, PLUGIN_PATHS } from "../../scripts/plugin-files.mjs";
import { ART_FILES } from "../../src/report/assets.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

/** 폴더 안의 파일을 모두 뿌리에서의 경로(빗금)로 늘어놓는다 */
async function filesUnder(dir: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await filesUnder(join(dir, entry.name), path)));
    else found.push(path);
  }
  return found.sort();
}

/** 이 저장소의 산출물에 들어야 할 파일 */
const EXPECTED = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "LICENSE",
  "hooks/hooks.json",
  "hooks/run-hook.cmd",
  "hooks/session-start",
  "hooks/session-start.mjs",
  "skills/aq/SKILL.md",
  "skills/aq/assets/ART-LICENSE.md",
  ...Object.values(ART_FILES).map((file) => `skills/aq/assets/${file}`),
  "skills/aq/scripts/aq.mjs",
].sort();

describe("플러그인 산출물", () => {
  it("담는 곳은 두 도구의 매니페스트와 마켓 목록, 스킬 본문, 묶은 실행 파일, 그림 폴더, 라이선스다(「5단계 5부 계획 전 결정」 5번)", () => {
    expect([...PLUGIN_PATHS]).toEqual([".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json", "skills/aq/SKILL.md", "skills/aq/scripts/aq.mjs", "skills/aq/assets", "hooks", "LICENSE"]);
  });

  it("이 저장소에서 모으면 그 파일만 같은 자리에 같은 내용으로 담고, 담은 파일의 목록을 돌려준다", async () => {
    const out = join(root, "out");
    const files = await packPlugin(resolve("."), out);
    expect([...files].sort()).toEqual(EXPECTED);
    expect(await filesUnder(out)).toEqual(EXPECTED);
    for (const file of EXPECTED) expect(await readFile(join(out, file))).toEqual(await readFile(file));
  });

  it("담을 곳이 비어 있지 않으면 아무것도 쓰지 않고 거절한다", async () => {
    const out = join(root, "out");
    await put(join(out, "keep.txt"), "x");
    await expect(packPlugin(resolve("."), out)).rejects.toThrow("담을 곳이 비어 있지 않다");
    expect(await filesUnder(out)).toEqual(["keep.txt"]);
  });

  it("담을 것 가운데 하나라도 없으면 아무것도 쓰지 않고 거절한다", async () => {
    const source = join(root, "src");
    for (const file of EXPECTED.filter((path) => path !== "LICENSE")) await put(join(source, file), "x");
    const out = join(root, "out");
    await expect(packPlugin(source, out)).rejects.toThrow("LICENSE");
    await expect(readdir(out)).rejects.toThrow();
  });
});

describe("산출물 만들기 실행", () => {
  it("담을 곳을 받아 산출물을 만들고 담은 파일 수를 알린다. 담을 곳이 없으면 쓰는 법을 알리고 1로 끝난다", async () => {
    const script = resolve("scripts/pack-plugin.mjs");
    const out = join(root, "out");
    const ok = spawnSync(process.execPath, [script, out], { cwd: resolve("."), encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim()).toBe(`플러그인 산출물 ${EXPECTED.length}개를 ${out}에 담았다`);
    expect(await filesUnder(out)).toEqual(EXPECTED);
    const usage = spawnSync(process.execPath, [script], { cwd: resolve("."), encoding: "utf8" });
    expect(usage.status).toBe(1);
    expect(usage.stderr).toContain("쓰는 법: node scripts/pack-plugin.mjs <담을 폴더>");
  });
});
