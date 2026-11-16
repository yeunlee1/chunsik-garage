// aq tune apply·verify·undo를 임시 홈 폴더로 시험한다. 점검이 관측 기록을 남긴 뒤 계획하고, 그 계획대로 바꾸고, 확인하고, 되돌린다(설계 7.4, 16.4~16.7, 「6단계 2부 계획 전 결정」)
import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheckup, type CheckupOptions } from "../../src/commands/checkup.ts";
import { runTunePlan } from "../../src/commands/tune-plan.ts";
import { runTuneApply, runTuneUndo, runTuneVerify, type TuneRunOptions } from "../../src/commands/tune-run.ts";
import { fingerprintOf } from "../../src/tune/items.ts";
import { loadWork, saveWork, takeLock } from "../../src/tune/work.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
const DAY = 86_400_000;
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");
const ORIGINAL = '{\n  "permissions": {}\n}\n';
const ITEM = "A3:claude-code:idle-db";

let root: string;
let home: string;
let stateDir: string;
let settings: string;

const common = () => ({ env: {}, homedir: home, tmpdir: join(root, "os-tmp"), platform: process.platform, lang: "ko" as const, stateDir, rescan: false, entryFile: join(root, "repo", "src", "entry.ts"), managedDir: join(root, "managed") });
const run = (overrides: Partial<TuneRunOptions> = {}): TuneRunOptions => ({ ...common(), clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, random: () => "fed321", ...overrides });
/** 20일 전의 점검이 그 서버의 관측 기록을 남기고, 지금 계획을 저장한다 */
async function planned(): Promise<string> {
  await runCheckup({ ...common(), clock: { nowMs: NOW - 20 * DAY, timeZone: "Asia/Seoul" }, save: true } satisfies CheckupOptions);
  const plan = await runTunePlan({ ...common(), clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, save: true, random: () => "abc123" });
  expect(plan.plan.items.map((item) => item.id)).toEqual([ITEM]);
  return plan.plan.planId!;
}

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  stateDir = join(home, ".chunsik-garage");
  settings = join(home, ".claude", "settings.json");
  const proj = join(root, "work", "proj");
  await mkdir(join(root, "os-tmp"), { recursive: true });
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(settings, ORIGINAL);
  await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "idle-db": { command: "db-server", env: { TOKEN: "secret-value" } } } }));
  for (const [id, at] of [["s1", "2026-11-11T01:00:00Z"], ["s2", "2026-11-10T01:00:00Z"]] as const) {
    const dir = join(home, ".claude", "projects", "p-proj");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${id}.jsonl`);
    await writeFile(path, `${[user({ at, content: "고쳐 줘", origin: "human", extra: { cwd: proj } }), assistant({ id: `${id}-a`, at, cwd: proj, usage: { input: 10, cacheRead: 80, cacheWrite: 10, output: 5 } })].join("\n")}\n`);
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
  }
});
afterEach(async () => removeTemp(root));

describe("계획부터 되돌리기까지", () => {
  it("계획대로 바꾸고 기록을 남긴다. 확인하면 꺼져 있고, 되돌리면 그 항목만 빠진다", async () => {
    const planId = await planned();
    const applied = await runTuneApply({ ...run(), planId, itemIds: [ITEM] });
    expect(applied.work.items.map((item) => [item.id, item.state, item.before, item.after])).toEqual([[ITEM, "written", { present: false }, { present: true }]]);
    expect(await readFile(settings, "utf8")).toBe('{\n  "permissions": {},\n  "deniedMcpServers": [\n    { "serverName": "idle-db" }\n  ]\n}\n');
    expect(applied.run.text.items[ITEM]).toBe("바꿨습니다.");
    expect(applied.run.notices.map((notice) => notice.kind)).toEqual(["new-session"]);
    // 기록에는 설정의 다른 값이 들지 않는다
    const record = await readFile(join(stateDir, "tune", `${applied.work.workId}.json`), "utf8");
    expect(record).not.toContain("secret-value");
    expect(applied.work.files[0]!.candidate).toBe(fingerprintOf(await readFile(settings)));

    const verified = await runTuneVerify({ ...run({ random: () => "000001" }), workId: applied.work.workId });
    expect(verified.run.results).toEqual([{ id: ITEM, kept: true, stillOn: false }]);
    expect((await loadWork(stateDir, applied.work.workId))!.items[0]!.state).toBe("verified");

    const undone = await runTuneUndo({ ...run({ random: () => "000002" }), workId: applied.work.workId, itemIds: [] });
    expect(undone.work.items.map((item) => [item.state, item.before, item.after])).toEqual([["written", { present: true }, { present: false }]]);
    expect(await readFile(settings, "utf8")).toBe('{\n  "permissions": {},\n  "deniedMcpServers": []\n}\n');
    expect(undone.run.text.items[ITEM]).toBe("되돌렸습니다.");
    expect((await loadWork(stateDir, applied.work.workId))!.items[0]!.state).toBe("undone");
  });

  it("작업 ID 없이 되돌리면 아직 되돌릴 것이 남은 가장 최근 적용을 되돌리고, 남은 것이 없으면 오류로 끝낸다(0.1.1)", async () => {
    const planId = await planned();
    const applied = await runTuneApply({ ...run(), planId, itemIds: [ITEM] });
    // 같은 항목을 바꾼 더 이른 적용과, 더 늦은 되돌림 기록을 둔다. 되돌림 기록은 고르지 않는다
    const older = { ...structuredClone(applied.work), workId: "2026-11-12T02-00-00-000Z-aaaaaa", createdAt: "2026-11-12T02:00:00.000Z" };
    const later = { ...structuredClone(applied.work), workId: "2026-11-12T04-00-00-000Z-bbbbbb", createdAt: "2026-11-12T04:00:00.000Z", kind: "undo" as const, planId: null, of: older.workId };
    await saveWork(stateDir, older);
    await saveWork(stateDir, later);
    expect((await loadWork(stateDir, older.workId))?.kind).toBe("apply");
    expect((await loadWork(stateDir, later.workId))?.kind).toBe("undo");

    const first = await runTuneUndo({ ...run({ random: () => "000002" }), workId: null, itemIds: [] });
    expect(first.work.of).toBe(applied.work.workId);
    expect(first.run.text.items[ITEM]).toBe("되돌렸습니다.");
    expect(await readFile(settings, "utf8")).toBe('{\n  "permissions": {},\n  "deniedMcpServers": []\n}\n');
    expect((await loadWork(stateDir, applied.work.workId))!.items[0]!.state).toBe("undone");

    // 가장 최근 적용을 다 되돌렸으니 그 앞의 적용을 고른다. 이미 원래 값이라 쓰지 않고, 그 적용도 되돌림으로 적는다
    const second = await runTuneUndo({ ...run({ random: () => "000003" }), workId: null, itemIds: [] });
    expect(second.work.of).toBe(older.workId);
    expect([second.work.items[0]!.state, second.work.items[0]!.reason]).toEqual(["not_applied", "already-set"]);
    expect(second.run.text.items[ITEM]).toBe("이미 그 값이라 바꾸지 않았습니다.");
    expect(await readFile(settings, "utf8")).toBe('{\n  "permissions": {},\n  "deniedMcpServers": []\n}\n');
    expect((await loadWork(stateDir, older.workId))!.items[0]!.state).toBe("undone");

    await expect(runTuneUndo({ ...run({ random: () => "000004" }), workId: null, itemIds: [] })).rejects.toMatchObject({ code: "nothing-to-undo" });
  });

  it("최근 정비를 사용자가 직접 되돌려 놓았으면 그 정비를 되돌림으로 적고, 다음 번호 없는 되돌리기는 그 앞 정비를 되돌린다(0.1.1 짝 검토)", async () => {
    const planId = await planned();
    const recent = await runTuneApply({ ...run(), planId, itemIds: [ITEM] });
    // 더 이른 정비가 다른 서버를 꺼 두었다. 기록의 이름을 그 서버로 바꿔 둔다
    const other = ITEM.replace("idle-db", "other-db");
    const older = { ...JSON.parse(JSON.stringify(recent.work).replaceAll("idle-db", "other-db")), workId: "2026-11-12T02-00-00-000Z-aaaaaa", createdAt: "2026-11-12T02:00:00.000Z" };
    await saveWork(stateDir, older);
    expect((await loadWork(stateDir, older.workId))?.items.map((item) => item.id)).toEqual([other]);
    // 사용자가 최근 정비의 서버만 직접 다시 켰다. 더 이른 정비의 서버는 아직 꺼져 있다
    await writeFile(settings, '{\n  "permissions": {},\n  "deniedMcpServers": [\n    { "serverName": "other-db" }\n  ]\n}\n');

    const first = await runTuneUndo({ ...run({ random: () => "000002" }), workId: null, itemIds: [] });
    expect(first.work.of).toBe(recent.work.workId);
    expect(first.run.text.items[ITEM]).toBe("이미 그 값이라 바꾸지 않았습니다.");
    expect((await loadWork(stateDir, recent.work.workId))!.items[0]!.state).toBe("undone");
    expect(await readFile(settings, "utf8")).toBe('{\n  "permissions": {},\n  "deniedMcpServers": [\n    { "serverName": "other-db" }\n  ]\n}\n');

    const second = await runTuneUndo({ ...run({ random: () => "000003" }), workId: null, itemIds: [] });
    expect(second.work.of).toBe(older.workId);
    expect(second.run.text.items[other]).toBe("되돌렸습니다.");
    expect(await readFile(settings, "utf8")).toBe('{\n  "permissions": {},\n  "deniedMcpServers": []\n}\n');
    await expect(runTuneUndo({ ...run({ random: () => "000004" }), workId: null, itemIds: [] })).rejects.toMatchObject({ code: "nothing-to-undo" });
  });

  it("계획 뒤 설정 파일이 바뀌었으면 바꾸지 않고 다시 계획하라고 알린다", async () => {
    const planId = await planned();
    await writeFile(settings, '{\n  "permissions": {"allow": []}\n}\n');
    const applied = await runTuneApply({ ...run(), planId, itemIds: [ITEM] });
    expect(applied.work.items.map((item) => [item.state, item.reason])).toEqual([["not_applied", "changed-since-plan"]]);
    expect(applied.run.notices.map((notice) => notice.kind)).toEqual(["replan"]);
    expect(await readFile(settings, "utf8")).toBe('{\n  "permissions": {"allow": []}\n}\n');
  });
});

describe("오류와 끊긴 작업", () => {
  it("잠금이 살아 있거나, 계획이 없거나, 항목이 그 계획에 없으면 오류로 끝내고 아무것도 바꾸지 않는다", async () => {
    const planId = await planned();
    const lock = await takeLock(stateDir);
    await expect(runTuneApply({ ...run(), planId, itemIds: [ITEM] })).rejects.toMatchObject({ code: "locked" });
    await lock!.release();
    await expect(runTuneApply({ ...run(), planId: "2026-11-12T03-00-00-000Z-000000", itemIds: [ITEM] })).rejects.toMatchObject({ code: "plan-not-found" });
    await expect(runTuneApply({ ...run(), planId, itemIds: ["A1:claude-code:nope"] })).rejects.toMatchObject({ code: "item-not-in-plan" });
    await expect(runTuneUndo({ ...run(), workId: "2026-11-12T03-00-00-000Z-000000", itemIds: [] })).rejects.toMatchObject({ code: "work-not-found" });
    expect(await readFile(settings, "utf8")).toBe(ORIGINAL);
  });

  it("끊긴 작업이 있으면 계획은 알리기만 하고, 다음 적용이 먼저 실제 파일로 맞춘다", async () => {
    const planId = await planned();
    const stuck = {
      workId: "2026-11-11T00-00-00-000Z-aaaaaa",
      kind: "apply" as const,
      planId,
      of: null,
      createdAt: "2026-11-11T00:00:00.000Z",
      appVersion: "0.0.0",
      items: [{ id: ITEM, unit: "A3" as const, tool: "claude-code" as const, target: "idle-db", file: settings, key: { kind: "json-list-add" as const, parent: "deniedMcpServers" as const, entry: { serverName: "idle-db" } }, before: { present: false as const }, after: { present: true as const }, state: "writing" as const, reason: null }],
      files: [{ path: settings, items: [ITEM], before: fingerprintOf(Buffer.from(ORIGINAL)), candidate: "0".repeat(64) }],
    };
    await saveWork(stateDir, stuck);
    const plan = await runTunePlan({ ...common(), clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, save: false });
    expect(plan.run.notices).toContainEqual({ kind: "unfinished_work", count: 1 });
    const applied = await runTuneApply({ ...run(), planId, itemIds: [ITEM] });
    expect(applied.run.notices[0]).toEqual({ kind: "reconciled", count: 1 });
    expect((await loadWork(stateDir, stuck.workId))!.items[0]!.state).toBe("not_applied");
    expect(applied.work.items[0]!.state).toBe("written");
  });
});
