// 명령 입구의 aq checkup을 시험한다. 받는 옵션, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 20.1)
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main, type CliContext } from "../../src/cli.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let context: CliContext;
let printed: string;
beforeEach(async () => {
  root = await makeTemp();
  await put(join(root, "home", ".claude", "CLAUDE.md"), "시험을 먼저 돌린다.\n");
  await put(join(root, "tmp", ".keep"), "");
  context = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed") };
  printed = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    printed += String(chunk);
    return true;
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

describe("aq checkup", () => {
  it("요약과 실행 기록만 JSON으로 내고 0을 돌려준다. 평가 결과는 결과 폴더에 쓴다", async () => {
    expect(await main(["checkup", "--no-open"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(Object.keys(output)).toEqual(["summary", "run"]);
    expect(output.run).toMatchObject({ saved: true, reportPath: null, notices: [] });
    expect(await readdir(join(root, "home", ".chunsik-garage", "reports"))).toEqual([output.run.resultPath.split(/[\\/]/).pop()]);
  });

  it("--no-save는 상태 폴더에 쓰지 않고 OS 임시 폴더에 결과를 쓴다. --rescan도 받는다", async () => {
    expect(await main(["checkup", "--no-save", "--rescan", "--no-open"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(output.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }] });
    expect(output.run.resultPath.startsWith(join(root, "tmp"))).toBe(true);
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("모르는 옵션은 64를 돌려주고 아무것도 쓰지 않는다", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["checkup", "--lang", "ko"], context)).toBe(64);
    expect(await main(["checkup", "--bogus"], context)).toBe(64);
    expect(printed).toBe("");
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
