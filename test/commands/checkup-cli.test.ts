// 명령 입구의 aq checkup과 aq tune plan을 시험한다. 받는 옵션, 결과 화면을 여는지, 처음 보일 언어의 차례, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 13.2, 20.1)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main, tuneRunArgs, type CliContext } from "../../src/cli.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let context: CliContext;
let printed: string;
beforeEach(async () => {
  root = await makeTemp();
  await put(join(root, "home", ".claude", "CLAUDE.md"), "시험을 먼저 돌린다.\n");
  await put(join(root, "tmp", ".keep"), "");
  context = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed"), locale: "en-US", open: async () => true };
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
  it("--no-open이 없으면 쓴 결과 화면을 열고, 있으면 열지 않는다", async () => {
    const open = vi.fn(async () => true);
    expect(await main(["checkup", "--no-save"], { ...context, open })).toBe(0);
    expect(open).toHaveBeenCalledWith(JSON.parse(printed).run.reportPath);
    printed = "";
    open.mockClear();
    expect(await main(["checkup", "--no-save", "--no-open"], { ...context, open })).toBe(0);
    expect(open).not.toHaveBeenCalled();
    expect(JSON.parse(printed).run.reportPath).toMatch(/[.]html$/);
  });

  it("요약과 실행 기록만 JSON으로 내고 0을 돌려준다. 평가 결과와 결과 화면은 결과 폴더에 쓴다", async () => {
    expect(await main(["checkup", "--no-open"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(Object.keys(output)).toEqual(["summary", "run"]);
    expect(output.run).toMatchObject({ saved: true, reportPath: join(root, "home", ".chunsik-garage", "reports", "2026-11-12T03-00-00-000Z.html"), notices: [] });
    expect((await readdir(join(root, "home", ".chunsik-garage", "reports"))).sort()).toEqual([output.run.reportPath, output.run.resultPath].map((path: string) => path.split(/[\\/]/).pop()));
  });

  it("--no-save는 상태 폴더에 쓰지 않고 OS 임시 폴더에 결과를 쓴다. --rescan도 받는다", async () => {
    expect(await main(["checkup", "--no-save", "--rescan", "--no-open"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(output.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }], text: { notices: ["This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history."] } });
    expect(output.run.resultPath.startsWith(join(root, "tmp"))).toBe(true);
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("--lang은 요약, 실행 알림, 결과가 처음 보일 언어를 정한다", async () => {
    expect(await main(["checkup", "--no-save", "--lang", "ko"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(output.summary.lang).toBe("ko");
    expect(output.summary.text.diagnosis).toMatch(/[가-힣]/);
    expect(output.run.text.notices).toEqual(["저장하지 않는 실행이라 상태 폴더에 아무것도 쓰지 않았습니다. 이 점검은 캐시를 쓰지 않았고 점수 이력에도 남지 않습니다."]);
    expect(JSON.parse(await readFile(output.run.resultPath, "utf8")).lang).toBe("ko");
  });

  it("--lang이 없거나 지원하지 않는 언어이면 OS의 언어, 그것도 아니면 영어다", async () => {
    const langOf = async (args: string[], locale: string): Promise<string> => {
      printed = "";
      expect(await main(["checkup", "--no-save", ...args], { ...context, locale })).toBe(0);
      return JSON.parse(printed).summary.lang;
    };
    expect(await langOf([], "ko-KR")).toBe("ko");
    expect(await langOf(["--lang", "ja"], "ko-KR")).toBe("ko");
    expect(await langOf(["--lang", "ja"], "fr-FR")).toBe("en");
    expect(await langOf(["--lang", "en"], "ko-KR")).toBe("en");
  });

  it("--lang을 여러 번 주면 마지막 값이다. 마지막 값을 지원하지 않으면 앞의 값이 아니라 OS의 언어다", async () => {
    const langOf = async (args: string[], locale: string): Promise<string> => {
      printed = "";
      expect(await main(["checkup", "--no-save", ...args], { ...context, locale })).toBe(0);
      return JSON.parse(printed).summary.lang;
    };
    expect(await langOf(["--lang", "en", "--lang", "ko"], "en-US")).toBe("ko");
    expect(await langOf(["--lang", "ko", "--lang", "en"], "ko-KR")).toBe("en");
    expect(await langOf(["--lang", "ko", "--lang", "ja"], "en-US")).toBe("en");
  });

  it("모르는 옵션과 값이 없는 --lang(값 자리에 -로 시작하는 것이 와도)은 64를 돌려주고 아무것도 쓰지 않는다", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["checkup", "--lang"], context)).toBe(64);
    expect(await main(["checkup", "--lang", "--no-save"], context)).toBe(64);
    expect(await main(["checkup", "--lang=ko"], context)).toBe(64);
    expect(await main(["checkup", "--lang", "-h"], context)).toBe(64);
    expect(await main(["checkup", "--bogus"], context)).toBe(64);
    expect(printed).toBe("");
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("aq tune plan(「6단계 1부 계획 전 결정」 6번)", () => {
  it("계획과 실행 기록을 JSON으로 내고 0을 돌려준다. --no-save면 계획 ID가 없고 상태 폴더를 만들지 않는다. --lang과 --rescan도 받는다", async () => {
    expect(await main(["tune", "plan", "--no-save", "--rescan", "--lang", "ko"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(Object.keys(output).sort()).toEqual(["plan", "run"]);
    expect(output.plan).toMatchObject({ planId: null, items: [] });
    expect(output.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }] });
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toThrow();
  });

  it("저장하면 상태 폴더의 tune/plans에 그 계획이 생긴다", async () => {
    expect(await main(["tune", "plan"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(await readdir(join(root, "home", ".chunsik-garage", "tune", "plans"))).toEqual([`${output.plan.planId}.json`]);
  });

  it("모르는 옵션, 값이 없는 --lang, 결과 화면의 옵션(--no-open), 하위 명령이 없는 tune은 64를 돌려주고 아무것도 쓰지 않는다", async () => {
    for (const args of [["tune", "plan", "--all"], ["tune", "plan", "--lang"], ["tune", "plan", "--no-open"], ["tune"]]) expect(await main(args, context)).toBe(64);
    expect(printed).toBe("");
  });
});

describe("aq badge(0.2.0)", () => {
  it("--lang만 받고, 이력이 없으면 no-score 오류를 JSON으로 내며, 있으면 배지를 만든다", async () => {
    expect(await main(["badge", "--bogus"], context)).toBe(64);
    expect(await main(["badge", "--no-save"], context)).toBe(64);
    expect(await main(["badge", "--lang", "ko"], context)).toBe(1);
    expect(JSON.parse(printed).error.code).toBe("no-score");
    await put(join(root, "home", ".chunsik-garage", "history.jsonl"), `${JSON.stringify({ at: "2026-11-12T01:00:00.000Z", aq: 66, axes: {}, missingAxes: [], rulesVersion: "1.0.0" })}
`);
    printed = "";
    expect(await main(["badge"], context)).toBe(0);
    const out = JSON.parse(printed);
    expect(out.badge).toMatchObject({ aq: 66, grade: "B", path: join(root, "home", ".chunsik-garage", "badge.svg") });
    expect(out.run.text.made).toContain("badge");
  });
});

describe("aq tune apply·undo·verify의 인자(6단계 2부 계획 전 결정 10번)", () => {
  const ID = "2026-11-12T03-00-00-000Z-abc123";
  it("첫 위치 인자는 ID 꼴이고, apply는 항목이 하나 이상, verify는 항목이 없으며, 항목은 겹치지 않는다. undo만 ID를 빼도 된다(0.1.1)", () => {
    expect(tuneRunArgs("apply", [ID, "A1:claude-code:idle", "--lang", "ko", "--rescan"])).toEqual({ lang: "ko", rescan: true, id: ID, items: ["A1:claude-code:idle"] });
    expect(tuneRunArgs("undo", [ID])).toEqual({ lang: null, rescan: false, id: ID, items: [] });
    expect(tuneRunArgs("verify", [ID, "--lang", "en"])).toEqual({ lang: "en", rescan: false, id: ID, items: [] });
    // 작업 번호를 모르는 새 세션의 되돌리기는 ID 없이 부른다
    expect(tuneRunArgs("undo", [])).toEqual({ lang: null, rescan: false, id: null, items: [] });
    expect(tuneRunArgs("undo", ["--lang", "ko"])).toEqual({ lang: "ko", rescan: false, id: null, items: [] });
    for (const [command, args] of [
      ["apply", [ID]],
      ["apply", []],
      ["apply", ["../x", "A1:claude-code:idle"]],
      ["apply", [ID, "a", "a"]],
      ["verify", [ID, "a"]],
      ["verify", []],
      ["undo", [ID, "--no-save"]],
      ["undo", [ID, "--lang"]],
      ["undo", ["../x"]],
      ["undo", ["A1:claude-code:idle"]],
    ] as const) expect(tuneRunArgs(command, args)).toBeNull();
  });
});
