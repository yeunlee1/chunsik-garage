// aq checkup의 실행(상태 열기, 입력 모으기, 평가, 결과 조립, 저장 또는 임시 폴더, 실행 기록)을 임시 홈 폴더로 시험한다(설계 7.4, 12.2, 12.3, 18.1, 19.2, 20.1, 20.2)
import { mkdir, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheckup, type CheckupOptions } from "../../src/commands/checkup.ts";
import { appendHistory } from "../../src/state/history.ts";
import { resultStamp, writeResult } from "../../src/state/reports.ts";
import { newState, saveState } from "../../src/state/state.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");
const STAMP = resultStamp(NOW);

let root: string;
let home: string;
let stateDir: string;
let tmp: string;
let proj: string;

async function session(folder: string, id: string, lines: string[]): Promise<string> {
  const dir = join(home, ".claude", "projects", folder);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  await writeFile(path, `${lines.join("\n")}\n`);
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
  return path;
}
/**
 * 다른 폴더에 같은 막힘을 만들고 같은 저장 함수를 불러 실제로 나는 오류 코드를 얻는다. 폴더 자리로 이름을 바꿀 때 Windows는 EPERM을 내는 것처럼
 * 코드는 운영체제마다 다르므로, 실행 알림이 그 단계에서 난 코드를 그대로 싣는지를 운영체제와 상관없이 견주려는 것이다
 */
async function blockedCode(block: (dir: string) => Promise<unknown>, write: (dir: string) => Promise<unknown>): Promise<string> {
  const dir = join(root, "probe-state");
  await rm(dir, { recursive: true, force: true });
  await block(dir);
  const code = await write(dir).then(
    () => "none",
    (error: NodeJS.ErrnoException) => error.code ?? "unknown",
  );
  await rm(dir, { recursive: true, force: true });
  expect(code).toMatch(/^E[A-Z]+$/);
  return code;
}
const turn = (id: string, at: string): string[] => [
  user({ at, content: "고쳐 줘", origin: "human", extra: { cwd: proj } }),
  assistant({ id, at, cwd: proj, usage: { input: 10, cacheRead: 80, cacheWrite: 10, output: 5 } }),
];
const options = (overrides: Partial<CheckupOptions> = {}): CheckupOptions => {
  let tick = 1000;
  return {
    env: {},
    homedir: home,
    tmpdir: tmp,
    platform: process.platform,
    clock: { nowMs: NOW, timeZone: "Asia/Seoul" },
    lang: "en",
    stateDir,
    save: true,
    rescan: false,
    entryFile: join(root, "repo", "src", "entry.ts"),
    managedDir: join(root, "managed"),
    now: () => (tick += 250),
    ...overrides,
  };
};

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  stateDir = join(home, ".chunsik-garage");
  tmp = join(root, "os-tmp");
  proj = join(root, "work", "proj");
  await mkdir(tmp, { recursive: true });
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(home, ".claude", "CLAUDE.md"), "모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다.\n");
  await put(join(home, ".claude", "skills", "secret-skill", "SKILL.md"), "---\nname: secret-skill\ndescription: 시험용\n---\n");
  await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "secret-db": { command: "db-server" } } }));
  await session("p-proj", "s1", turn("a-1", "2026-11-11T01:00:00Z"));
  await session("p-proj", "s2", turn("b-1", "2026-11-10T01:00:00Z"));
});
afterEach(async () => removeTemp(root));

describe("저장하는 점검", () => {
  it("결과 파일, 이력 한 줄, 상태(마지막 점검 시각과 관측 기록), 캐시를 남기고 요약과 실행 기록을 낸다", async () => {
    const outcome = await runCheckup(options());
    const resultPath = join(stateDir, "reports", `${STAMP}.json`);
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: true, reportPath: null, resultPath, notices: [], text: { notices: [] } });
    expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual(outcome.result);
    const history = (await readFile(join(stateDir, "history.jsonl"), "utf8")).trim().split("\n");
    expect(history).toHaveLength(1);
    expect(JSON.parse(history[0]!)).toMatchObject({ at: "2026-11-12T03:00:00.000Z", rulesVersion: "1.0.0" });
    const state = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
    expect(state.lastCheckupAt).toBe("2026-11-12T03:00:00.000Z");
    expect(state.installs.length).toBeGreaterThan(0);
    expect(state.installs.every((record: { appeared: boolean }) => record.appeared === false)).toBe(true);
    expect((await readdir(join(stateDir, "cache", "claude-code"))).length).toBe(2);
    expect(outcome.summary).toMatchObject({ aq: outcome.result.score.aq, reportPath: null });
  });

  it("연달아 두 번 돌리면 이력은 두 줄이고, 두 번째는 캐시를 쓰며 평가 결과는 글자 하나 다르지 않다. 무작위 값과 관측 기록을 이어 쓴다", async () => {
    const first = await runCheckup(options());
    const salt = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8")).salt;
    const second = await runCheckup(options());
    expect(second.run.cachedFiles).toBe(2);
    expect(JSON.stringify(second.result)).toBe(JSON.stringify(first.result));
    expect((await readFile(join(stateDir, "history.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
    const state = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
    expect(state.salt).toBe(salt);
    expect(await readdir(join(stateDir, "reports"))).toEqual([`${STAMP}.json`]);
  });

  it("상태 파일이 깨졌으면 새 상태로 시작해 알리고, 저장할 때 새 상태로 덮어쓴다", async () => {
    await put(join(stateDir, "state.json"), "{broken");
    const outcome = await runCheckup(options());
    expect(outcome.result.notices.map((notice) => notice.kind)).toContain("state_reset");
    const state = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
    expect(state).toMatchObject({ schema: 1, lastCheckupAt: "2026-11-12T03:00:00.000Z" });
  });

  it("결과 폴더에는 최근 20번의 점검만 남고, 원본이 없어진 캐시 항목은 지운다", async () => {
    for (let index = 0; index < 21; index++) await put(join(stateDir, "reports", `${resultStamp(NOW - (index + 1) * 60_000)}.json`), "{}");
    await runCheckup(options());
    const reports = await readdir(join(stateDir, "reports"));
    expect(reports).toHaveLength(20);
    expect(reports).toContain(`${STAMP}.json`);
    await rm(join(home, ".claude", "projects", "p-proj", "s2.jsonl"));
    await runCheckup(options());
    expect((await readdir(join(stateDir, "cache", "claude-code"))).length).toBe(1);
  });

  it("상태 폴더에 쓰지 못하면 남은 저장을 멈추고 결과 파일을 OS 임시 폴더에 쓴다. 실패로 끝나지 않는다", async () => {
    await put(stateDir, "not a folder");
    // 실행 알림은 실제 파일 오류 코드를 그대로 싣는다. 같은 자리에 결과 폴더를 만들 때 나는 코드와 같다
    const expected = await mkdir(join(stateDir, "reports"), { recursive: true }).then(
      () => "none",
      (error: NodeJS.ErrnoException) => error.code,
    );
    expect(expected).toMatch(/^E[A-Z]+$/);
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.resultPath).toBe(join(tmp, `chunsik-garage-result-${STAMP}.json`));
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "result", code: expected }]);
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
    // 상태 폴더 자리에 파일이 있으면 상태 파일이 있을 수 없다. 깨진 것이 아니라 없는 것이다
    expect(outcome.result.notices.map((notice) => notice.kind)).not.toContain("state_reset");
  });

  it("상태를 쓰다가 막히면 이력을 쓰지 않고 정리도 하지 않는다. 쓴 결과 파일은 남고 임시 파일은 남지 않는다", async () => {
    await mkdir(join(stateDir, "state.json"), { recursive: true });
    for (let index = 0; index < 21; index++) await put(join(stateDir, "reports", `${resultStamp(NOW - (index + 1) * 60_000)}.json`), "{}");
    const expected = await blockedCode(
      (dir) => mkdir(join(dir, "state.json"), { recursive: true }),
      (dir) => saveState(dir, newState()),
    );
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "state", code: expected }]);
    expect(outcome.run.resultPath).toBe(join(stateDir, "reports", `${STAMP}.json`));
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
    await expect(readFile(join(stateDir, "history.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(join(stateDir, "reports"))).toHaveLength(22);
    expect((await readdir(stateDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("이력을 쓰다가 막히면 결과와 상태는 남고 저장하지 않은 것으로 알린다", async () => {
    await mkdir(join(stateDir, "history.jsonl"), { recursive: true });
    const expected = await blockedCode(
      (dir) => mkdir(join(dir, "history.jsonl"), { recursive: true }),
      (dir) => appendHistory(dir, { at: "2026-11-12T03:00:00.000Z", aq: null, axes: { setup: null, efficiency: null, fit: null, intensity: null }, missingAxes: [], rulesVersion: "1.0.0" }),
    );
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "history", code: expected }]);
    expect(JSON.parse(await readFile(join(stateDir, "state.json"), "utf8")).lastCheckupAt).toBe("2026-11-12T03:00:00.000Z");
    expect(outcome.run.resultPath).toBe(join(stateDir, "reports", `${STAMP}.json`));
  });

  it("결과 파일 자리가 막혀 있으면 결과를 OS 임시 폴더에 쓰고 결과 폴더에 임시 파일을 남기지 않는다", async () => {
    await mkdir(join(stateDir, "reports", `${STAMP}.json`), { recursive: true });
    const expected = await blockedCode(
      (dir) => mkdir(join(dir, "reports", `${STAMP}.json`), { recursive: true }),
      (dir) => writeResult(dir, STAMP, {}),
    );
    const outcome = await runCheckup(options());
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "result", code: expected }]);
    expect(outcome.run.resultPath).toBe(join(tmp, `chunsik-garage-result-${STAMP}.json`));
    expect(await readdir(join(stateDir, "reports"))).toEqual([`${STAMP}.json`]);
  });

  it("결과 폴더에 이번 점검보다 뒤 시각의 결과가 20번 있어도(시계가 뒤로 갔다) 방금 쓴 결과는 남는다", async () => {
    for (let index = 0; index < 20; index++) await put(join(stateDir, "reports", `${resultStamp(NOW + (index + 1) * 60_000)}.json`), "{}");
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(true);
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
    expect(await readdir(join(stateDir, "reports"))).toHaveLength(20);
  });

  it("결과 폴더가 링크면 정리하지 않고 링크라서 하지 않은 정리로 알린다. 저장은 끝난다", async () => {
    const elsewhere = join(root, "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await linkDir(elsewhere, join(stateDir, "reports"));
    for (let index = 0; index < 21; index++) await put(join(elsewhere, `${resultStamp(NOW - (index + 1) * 60_000)}.json`), "{}");
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(true);
    expect(outcome.run.notices).toEqual([{ kind: "prune_skipped", what: "reports", link: "reports" }]);
    expect(await readdir(elsewhere)).toHaveLength(22);
  });
});

describe("저장하지 않는 점검", () => {
  it("상태 폴더에 아무것도 쓰지 않고 캐시도 쓰지 않는다. 결과 파일은 OS 임시 폴더에 쓴다", async () => {
    const outcome = await runCheckup(options({ save: false }));
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: false, reportPath: null, resultPath: join(tmp, `chunsik-garage-result-${STAMP}.json`), notices: [{ kind: "not_saved" }], text: { notices: ["This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history."] } });
    await expect(readdir(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
  });

  it("지난 상태 파일은 읽어 관측 기록과 무작위 값을 쓰지만 고치지 않는다", async () => {
    await runCheckup(options());
    const before = await readFile(join(stateDir, "state.json"), "utf8");
    const outcome = await runCheckup(options({ save: false, clock: { nowMs: NOW + 86_400_000, timeZone: "Asia/Seoul" } }));
    expect(await readFile(join(stateDir, "state.json"), "utf8")).toBe(before);
    expect(outcome.result.notices.map((notice) => notice.kind)).not.toContain("state_reset");
  });

  it("임시 폴더에도 쓰지 못하면 결과 파일 없이 요약만 내고 알린다", async () => {
    const outcome = await runCheckup(options({ save: false, tmpdir: join(root, "missing", "tmp") }));
    expect(outcome.run.resultPath).toBeNull();
    expect(outcome.run.notices).toEqual([{ kind: "not_saved" }, { kind: "result_unwritten", code: "ENOENT" }]);
  });
});

describe("요약과 실행 기록", () => {
  it("요약과 실행 기록에는 스킬·서버·프로젝트의 이름이 들어가지 않는다", async () => {
    const outcome = await runCheckup(options());
    const printed = JSON.stringify({ summary: outcome.summary, run: { ...outcome.run, resultPath: null } });
    expect(printed).not.toContain("secret");
    expect(printed).not.toContain("proj");
  });
});
