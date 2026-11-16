// 버전이 쓰이는 여섯 곳(package.json, 프로그램 안의 버전, 두 도구의 플러그인 정보와 마켓 목록)을 읽어 서로 다르거나 읽지 못하면 알리는 검사를 시험한다(설계 7.1, 「4단계 계획에서 보완」, 「5단계 5부 계획 전 결정」 4번)
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readVersions, VERSION_FILES, versionProblems } from "../../scripts/version-scan.mjs";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

/** 여섯 곳에 버전을 쓴다. 바꿀 곳만 넘기면 나머지는 기본 꼴이다 */
async function writeAll(version: string, override: Partial<Record<(typeof VERSION_FILES)[number], string>> = {}): Promise<void> {
  const files: Record<(typeof VERSION_FILES)[number], string> = {
    "package.json": JSON.stringify({ name: "chunsik-garage", version }),
    "src/version.ts": `// 프로그램 버전\nexport const PROGRAM_VERSION = "${version}";\n`,
    ".claude-plugin/plugin.json": JSON.stringify({ name: "chunsik-garage", version }),
    ".claude-plugin/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version }] }),
    ".codex-plugin/plugin.json": JSON.stringify({ name: "chunsik-garage", version }),
    ".agents/plugins/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version }] }),
    ...override,
  };
  for (const [file, text] of Object.entries(files)) await put(join(root, file), text);
}

describe("버전 읽기와 견주기", () => {
  it("여섯 곳의 버전을 정한 차례로 읽고, 모두 같으면 알릴 것이 없다", async () => {
    expect([...VERSION_FILES]).toEqual(["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json"]);
    await writeAll("0.2.0");
    const entries = readVersions(root);
    expect(entries.map((entry) => entry.file)).toEqual([...VERSION_FILES]);
    expect(entries.map((entry) => entry.version)).toEqual(["0.2.0", "0.2.0", "0.2.0", "0.2.0", "0.2.0", "0.2.0"]);
    expect(versionProblems(entries)).toEqual([]);
  });

  /** 한 곳만 0.2.1로 쓴 글 */
  const bumped: Record<(typeof VERSION_FILES)[number], string> = {
    "package.json": JSON.stringify({ name: "chunsik-garage", version: "0.2.1" }),
    "src/version.ts": 'export const PROGRAM_VERSION = "0.2.1";\n',
    ".claude-plugin/plugin.json": JSON.stringify({ name: "chunsik-garage", version: "0.2.1" }),
    ".claude-plugin/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.1" }] }),
    ".codex-plugin/plugin.json": JSON.stringify({ name: "chunsik-garage", version: "0.2.1" }),
    ".agents/plugins/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.1" }] }),
  };
  it.each([...VERSION_FILES])("%s 한 곳만 달라도 어느 파일이 어떤 버전인지 모두 적어 알린다", async (file) => {
    await writeAll("0.2.0", { [file]: bumped[file] });
    const listed = VERSION_FILES.map((name) => `${name} ${name === file ? "0.2.1" : "0.2.0"}`).join(", ");
    expect(versionProblems(readVersions(root))).toEqual([`버전이 다르다: ${listed}`]);
  });

  it("Codex 마켓 목록에도 이 플러그인 항목이 하나가 아니면 찾지 못한 것으로 본다", async () => {
    const twice = { name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.0" }, { name: "chunsik-garage", source: "./", version: "0.2.0" }] };
    await writeAll("0.2.0", { ".agents/plugins/marketplace.json": JSON.stringify(twice) });
    expect(versionProblems(readVersions(root))).toEqual([".agents/plugins/marketplace.json: 버전을 찾지 못함"]);
    await writeAll("0.2.0", { ".agents/plugins/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "other", source: "./", version: "0.2.0" }] }) });
    expect(versionProblems(readVersions(root))).toEqual([".agents/plugins/marketplace.json: 버전을 찾지 못함"]);
  });

  it("마켓 목록에 이 플러그인 항목이 둘이면 버전이 같아도 찾지 못한 것으로 본다", async () => {
    const twice = { name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.0" }, { name: "chunsik-garage", source: "./", version: "0.2.0" }] };
    await writeAll("0.2.0", { ".claude-plugin/marketplace.json": JSON.stringify(twice) });
    expect(versionProblems(readVersions(root))).toEqual([".claude-plugin/marketplace.json: 버전을 찾지 못함"]);
  });

  it("파일이 없거나 JSON으로 풀리지 않으면 그 까닭을 알린다", async () => {
    await writeAll("0.2.0", { ".claude-plugin/plugin.json": "{ not json" });
    await removeTemp(join(root, "package.json"));
    expect(versionProblems(readVersions(root))).toEqual(["package.json: 읽지 못함(ENOENT)", ".claude-plugin/plugin.json: JSON으로 풀리지 않음"]);
  });

  it("버전 꼴(숫자.숫자.숫자)이 아니거나, 프로그램 안의 버전이 한 번이 아니거나, 마켓 목록에 이 플러그인이 하나가 아니면 찾지 못한 것으로 본다", async () => {
    await writeAll("0.2.0", {
      "package.json": JSON.stringify({ version: "0.2" }),
      "src/version.ts": 'export const PROGRAM_VERSION = "0.2.0";\nexport const PROGRAM_VERSION = "0.2.0";\n',
      ".claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "other", version: "0.2.0" }] }),
    });
    expect(versionProblems(readVersions(root))).toEqual(["package.json: 버전을 찾지 못함", "src/version.ts: 버전을 찾지 못함", ".claude-plugin/marketplace.json: 버전을 찾지 못함"]);
  });

  it("주석에 적힌 버전 꼴의 글은 프로그램 안의 버전으로 읽지 않는다", async () => {
    await writeAll("0.2.0", { "src/version.ts": '// export const PROGRAM_VERSION = "9.9.9";\nexport const PROGRAM_VERSION = "0.2.0";\n' });
    expect(readVersions(root)[1]!.version).toBe("0.2.0");
  });

  it("이 저장소의 버전은 모두 같다", () => {
    expect(versionProblems(readVersions(resolve(".")))).toEqual([]);
  });
});

describe("버전 검사 실행", () => {
  it("모두 같으면 통과를 알리고 0으로 끝나며, 다르면 까닭을 알리고 1로 끝난다", async () => {
    const script = resolve("scripts/check-versions.mjs");
    const ok = spawnSync(process.execPath, [script], { cwd: resolve("."), encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim()).toBe("버전 검사 통과");
    await writeAll("0.2.0", { "src/version.ts": 'export const PROGRAM_VERSION = "0.3.0";\n' });
    const bad = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("버전이 다르다: package.json 0.2.0, src/version.ts 0.3.0");
    // package.json만 다를 때와 마켓에 이 플러그인 항목이 둘일 때도 1로 끝난다
    await writeAll("0.2.0", { "package.json": JSON.stringify({ name: "chunsik-garage", version: "0.2.1" }) });
    expect(spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" }).status).toBe(1);
    await writeAll("0.2.0", { ".claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "chunsik-garage", version: "0.2.0" }, { name: "chunsik-garage", version: "0.2.0" }] }) });
    const twice = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(twice.status).toBe(1);
    expect(twice.stderr).toContain(".claude-plugin/marketplace.json: 버전을 찾지 못함");
  });
});
