// aq tune plan의 실행(입력 모으기, 평가, 계획 항목, 바꿀 파일의 지문, 저장하거나 저장하지 않음, 실행 알림)을 임시 홈 폴더로 시험한다(설계 16.5의 1번, 「6단계 1부 계획 전 결정」 5·6번)
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheckup, type CheckupOptions } from "../../src/commands/checkup.ts";
import { runTunePlan, type TunePlanOptions } from "../../src/commands/tune-plan.ts";
import { resultStamp } from "../../src/state/reports.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
const DAY = 86_400_000;
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");

let root: string;
let home: string;
let stateDir: string;
let tmp: string;
let proj: string;
let settings: string;

const common = () => ({ env: {}, homedir: home, tmpdir: tmp, platform: process.platform, lang: "en" as const, stateDir, rescan: false, entryFile: join(root, "repo", "src", "entry.ts"), managedDir: join(root, "managed") });
const checkup = (nowMs: number): Promise<unknown> => runCheckup({ ...common(), clock: { nowMs, timeZone: "Asia/Seoul" }, save: true } satisfies CheckupOptions);
const options = (overrides: Partial<TunePlanOptions> = {}): TunePlanOptions => {
  let tick = 1000;
  return { ...common(), clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, save: true, now: () => (tick += 250), random: () => "abc123", ...overrides };
};

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  stateDir = join(home, ".chunsik-garage");
  tmp = join(root, "os-tmp");
  proj = join(root, "work", "proj");
  settings = join(home, ".claude", "settings.json");
  await mkdir(tmp, { recursive: true });
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(settings, '{\n  "permissions": {}\n}\n');
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

describe("저장하는 계획", () => {
  it("지켜본 지 14일이 넘은 안 부른 사용자 서버는 서버 막기 항목이 되고, 계획을 상태 폴더에 저장한다. 바꿀 파일의 지문을 싣고 상태는 고치지 않는다", async () => {
    // 20일 전의 점검이 그 서버의 관측 기록을 남긴다
    await checkup(NOW - 20 * DAY);
    const stateBefore = await readFile(join(stateDir, "state.json"));
    const outcome = await runTunePlan(options());
    expect(outcome.plan.planId).toBe(`${resultStamp(NOW)}-abc123`);
    expect(outcome.plan.items.map((item) => [item.id, item.file, item.blocked])).toEqual([["A3:claude-code:idle-db", settings, null]]);
    const fingerprint = createHash("sha256").update(await readFile(settings)).digest("hex");
    expect(outcome.plan.files).toEqual([{ path: settings, status: "ok", fingerprint, items: ["A3:claude-code:idle-db"] }]);
    expect(JSON.parse(await readFile(join(stateDir, "tune", "plans", `${outcome.plan.planId}.json`), "utf8"))).toEqual(outcome.plan);
    expect(outcome.run).toMatchObject({ saved: true, notices: [], text: { notices: [] } });
    // 실행 기록에 항목마다 요청한 언어의 문장이 든다. 저장한 계획에는 문장이 없다
    expect(outcome.run.text.items["A3:claude-code:idle-db"]!.title).toBe("Block an unused MCP server: idle-db");
    expect(JSON.stringify(JSON.parse(await readFile(join(stateDir, "tune", "plans", `${outcome.plan.planId}.json`), "utf8")))).not.toContain("Block an unused");
    expect(await readFile(join(stateDir, "state.json"))).toEqual(stateBefore);
    // 계획에는 설정 파일의 다른 내용(서버 정의의 환경 변수 값)이 없다
    expect(JSON.stringify(outcome)).not.toContain("secret-value");
  });

  it("첫 점검 전이면 관측 기록이 없어 항목이 없다. 그래도 계획은 저장한다", async () => {
    const outcome = await runTunePlan(options());
    expect(outcome.plan.items).toEqual([]);
    expect(outcome.plan.files).toEqual([]);
    expect(await readdir(join(stateDir, "tune", "plans"))).toEqual([`${outcome.plan.planId}.json`]);
  });
});

describe("저장하지 않는 계획", () => {
  it("저장하지 않으면 계획 ID가 없고 상태 폴더에 아무것도 쓰지 않는다", async () => {
    await checkup(NOW - 20 * DAY);
    const before = (await readdir(stateDir)).sort();
    const outcome = await runTunePlan(options({ save: false }));
    expect(outcome.plan.planId).toBeNull();
    expect(outcome.plan.items.map((item) => item.id)).toEqual(["A3:claude-code:idle-db"]);
    expect(outcome.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }], text: { notices: ["This plan was not saved, so it cannot be applied. To apply it, run aq tune plan again without --no-save."] } });
    expect((await readdir(stateDir)).sort()).toEqual(before);
  });

  it("상태 폴더에 쓰지 못하면 계획 ID 없이 목록을 내고 그 까닭을 알린다", async () => {
    await checkup(NOW - 20 * DAY);
    await put(join(stateDir, "tune"), "막음");
    const outcome = await runTunePlan(options());
    expect(outcome.plan.planId).toBeNull();
    expect(outcome.plan.items.map((item) => item.id)).toEqual(["A3:claude-code:idle-db"]);
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "plan_unsaved", code: expect.stringMatching(/^E[A-Z]+$/) }]);
  });
});
