// 파일마다의 적용과 되돌리기를 임시 폴더의 설정 파일로 시험한다. 다른 프로그램의 끼어듦은 적용 함수가 받는 자리로 흉내 낸다(설계 16.3, 16.5, 16.6, 「6단계 2부 계획 전 결정」 5·8·12번)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { replaceSetting, runFiles, type EngineIo } from "../../src/tune/engine.ts";
import { fingerprintOf, readTarget } from "../../src/tune/items.ts";
import type { TuneWork, WorkItem } from "../../src/tune/work.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let settings: string;
let config: string;
let saved: string[][];
beforeEach(async () => {
  root = await makeTemp();
  settings = join(root, "claude", "settings.json");
  config = join(root, "codex", "config.toml");
  saved = [];
});
afterEach(async () => removeTemp(root));

const SETTINGS = '{\n  "skillOverrides": {\n    "idle": "on"\n  }\n}\n';
const CONFIG = '[mcp_servers.db]\ncommand = "x"\n';

const skillItem = (file: string, input: Partial<WorkItem> = {}): WorkItem => ({
  id: "A1:claude-code:idle",
  unit: "A1",
  tool: "claude-code",
  target: "idle",
  file,
  key: { kind: "json-entry", parent: "skillOverrides", name: "idle" },
  before: { present: false },
  after: { present: true, value: "off" },
  state: "planned",
  reason: null,
  ...input,
});
const denyItem = (file: string): WorkItem => ({ ...skillItem(file), id: "A3:claude-code:db", unit: "A3", target: "db", key: { kind: "json-list-add", parent: "deniedMcpServers", entry: { serverName: "db" } }, after: { present: true } });
const serverItem = (file: string, input: Partial<WorkItem> = {}): WorkItem => ({ ...skillItem(file), id: "A4:codex:db", unit: "A4", tool: "codex", target: "db", key: { kind: "toml-table-key", table: "db", key: "enabled" }, after: { present: true, value: false }, ...input });
const workOf = (items: WorkItem[], kind: TuneWork["kind"] = "apply"): TuneWork => ({
  workId: "2026-11-16T00-00-00-000Z-abc123",
  kind,
  planId: null,
  of: null,
  createdAt: "2026-11-16T00:00:00.000Z",
  appVersion: "0.0.0",
  items,
  files: [...new Set(items.map((item) => item.file))].map((path) => ({ path, items: items.filter((item) => item.file === path).map((item) => item.id), before: null, candidate: null })),
});
const io = (extra: Partial<EngineIo> = {}): EngineIo => ({
  read: readTarget,
  replace: replaceSetting,
  save: async (work) => {
    saved.push(work.items.map((item) => item.state));
  },
  ...extra,
});
const plannedOf = async (...paths: string[]): Promise<Map<string, string>> => new Map(await Promise.all(paths.map(async (path) => [path, fingerprintOf(await readFile(path))] as const)));

describe("적용", () => {
  it("파일마다 한 번에 바꾼다. 쓰는 중을 먼저 적고 쓴 뒤 썼음을 적으며, 바꾸기 전 값은 그 바이트의 것이다", async () => {
    await put(settings, SETTINGS);
    await put(config, CONFIG);
    const work = workOf([skillItem(settings), denyItem(settings), serverItem(config)]);
    expect(await runFiles(work, io(), await plannedOf(settings, config))).toEqual([]);
    expect(work.items.map((item) => [item.state, item.before])).toEqual([
      ["written", { present: true, value: "on" }],
      ["written", { present: false }],
      ["written", { present: false }],
    ]);
    expect(await readFile(settings, "utf8")).toBe('{\n  "skillOverrides": {\n    "idle": "off"\n  },\n  "deniedMcpServers": [\n    { "serverName": "db" }\n  ]\n}\n');
    expect(await readFile(config, "utf8")).toBe('[mcp_servers.db]\nenabled = false\ncommand = "x"\n');
    expect(saved).toContainEqual(["writing", "writing", "planned"]);
    expect(work.files.map((file) => file.candidate !== null)).toEqual([true, true]);
  });

  it("계획 뒤 파일이 바뀌었으면 적용 안 됨이고, 다시 보기 전에 바뀌면 바꾸지 않아 그 변경이 남는다", async () => {
    await put(settings, SETTINGS);
    const planned = await plannedOf(settings);
    await writeFile(settings, SETTINGS.replace('"on"', '"name-only"'));
    const first = workOf([skillItem(settings)]);
    await runFiles(first, io(), planned);
    expect([first.items[0]!.state, first.items[0]!.reason]).toEqual(["not_applied", "changed-since-plan"]);

    await put(settings, SETTINGS);
    const second = workOf([skillItem(settings)]);
    await runFiles(second, io({ beforeRecheck: async (path) => writeFile(path, '{"other": true}\n') }), await plannedOf(settings));
    expect([second.items[0]!.state, second.items[0]!.reason]).toEqual(["not_applied", "changed-before-write"]);
    expect(await readFile(settings, "utf8")).toBe('{"other": true}\n');
  });

  it("갈아 끼운 뒤 누가 다시 쓰면 알리고, 갈아 끼우기가 실패하면 적용 안 됨이며 원본은 그대로다", async () => {
    await put(settings, SETTINGS);
    const third = workOf([skillItem(settings)]);
    expect(await runFiles(third, io({ afterReplace: async (path) => writeFile(path, "{}\n") }), await plannedOf(settings))).toEqual([{ kind: "overwritten", path: settings }]);
    expect(third.items[0]!.state).toBe("written");

    await put(settings, SETTINGS);
    const fourth = workOf([skillItem(settings)]);
    const busy = async (): Promise<void> => {
      throw Object.assign(new Error("busy"), { code: "EPERM" });
    };
    await runFiles(fourth, io({ replace: busy }), await plannedOf(settings));
    expect([fourth.items[0]!.state, fourth.items[0]!.reason]).toEqual(["not_applied", "EPERM"]);
    expect(await readFile(settings, "utf8")).toBe(SETTINGS);
  });

  it("그 바이트로 고칠 수 없는 항목만 거절하고 같은 파일의 다른 항목은 계속한다. 이미 쓸 값이면 바꾸지 않는다", async () => {
    await put(settings, '{\n  "skillOverrides": {\n    "idle": 3,\n    "done": "off"\n  }\n}\n');
    const done = skillItem(settings, { id: "A1:claude-code:done", target: "done", key: { kind: "json-entry", parent: "skillOverrides", name: "done" } });
    const work = workOf([skillItem(settings), done, denyItem(settings)]);
    await runFiles(work, io(), await plannedOf(settings));
    expect(work.items.map((item) => [item.state, item.reason])).toEqual([
      ["rejected", "value-shape"],
      ["not_applied", "already-set"],
      ["written", null],
    ]);
    expect(await readFile(settings, "utf8")).toBe('{\n  "skillOverrides": {\n    "idle": 3,\n    "done": "off"\n  },\n  "deniedMcpServers": [\n    { "serverName": "db" }\n  ]\n}\n');
  });

  it("사용자 설정이 없고 그 폴더가 보통 폴더면 새로 만든다", async () => {
    await mkdir(join(root, "claude"), { recursive: true });
    const work = workOf([skillItem(settings)]);
    await runFiles(work, io(), new Map([[settings, null]]));
    expect(work.items[0]!.state).toBe("written");
    expect(work.files[0]!.before).toBeNull();
    expect(await readFile(settings, "utf8")).toBe('{\n  "skillOverrides": {\n    "idle": "off"\n  }\n}\n');
  });
});

describe("되돌리기(16.6)", () => {
  it("지금 값이 그 적용이 쓴 값일 때만 되돌린다. 없던 열쇠는 빼고, 그 사이 바뀐 값은 덮어쓰지 않는다", async () => {
    await put(settings, '{\n  "skillOverrides": {\n    "idle": "off"\n  }\n}\n');
    await put(config, '[mcp_servers.db]\nenabled = false\ncommand = "x"\n');
    const undo = workOf([skillItem(settings, { before: { present: true, value: "off" }, after: { present: false } }), serverItem(config, { before: { present: true, value: false }, after: { present: false } })], "undo");
    await runFiles(undo, io(), null);
    expect(undo.items.map((item) => item.state)).toEqual(["written", "written"]);
    expect(await readFile(settings, "utf8")).toBe('{\n  "skillOverrides": {}\n}\n');
    expect(await readFile(config, "utf8")).toBe(CONFIG);

    await put(settings, SETTINGS);
    const changed = workOf([skillItem(settings, { before: { present: true, value: "off" }, after: { present: false } })], "undo");
    await runFiles(changed, io(), null);
    expect([changed.items[0]!.state, changed.items[0]!.reason]).toEqual(["not_applied", "changed-since-apply"]);
    expect(await readFile(settings, "utf8")).toBe(SETTINGS);
  });

  it("지금 값이 이미 원래 값이면 쓰지 않고 이미 그 값으로 적는다(사용자가 직접 되돌린 경우, 0.1.1)", async () => {
    const original = '{\n  "skillOverrides": {}\n}\n';
    await put(settings, original);
    const undo = workOf([skillItem(settings, { before: { present: true, value: "off" }, after: { present: false } })], "undo");
    await runFiles(undo, io(), null);
    expect([undo.items[0]!.state, undo.items[0]!.reason]).toEqual(["not_applied", "already-set"]);
    expect(await readFile(settings, "utf8")).toBe(original);
  });
});
