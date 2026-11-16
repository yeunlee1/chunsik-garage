// 세션 시작 알림의 몸(알림용 이름 목록, 알릴지 판단, 오늘 표식)을 임시 홈으로 시험한다(설계 18.1, 18.2)
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hookMessage, nextNames, notifyNames, sessionStart } from "../../src/hook/notify.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-16T03:00:00Z");
const DAY = 86_400_000;
let home: string;
beforeEach(async () => {
  home = await makeTemp();
});
afterEach(async () => removeTemp(home));

describe("알림용 이름 목록(18.1)", () => {
  it("사용자 스킬 폴더 바로 아래의 이름, 사용자 설정의 플러그인, 사용자 범위 MCP 서버의 이름을 차례로 낸다. 없는 파일은 읽지 못한 것이 아니다", async () => {
    expect(notifyNames({}, home)).toEqual({ names: [], complete: true });
    await mkdir(join(home, ".claude", "skills", "idle"), { recursive: true });
    await put(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "p@m": true, "q@m": false } }));
    await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { db: { command: "x" } } }));
    expect(notifyNames({}, home)).toEqual({ names: ["mcp:db", "plugin:p@m", "plugin:q@m", "skill:idle"], complete: true });
  });

  it("설정 폴더를 바꿨으면 그 폴더를 읽고, 풀리지 않는 파일이 있으면 다 읽지 못한 것이다", async () => {
    const config = join(home, "config");
    await put(join(config, "settings.json"), "{");
    await put(join(config, ".claude.json"), JSON.stringify({ mcpServers: { other: {} } }));
    expect(notifyNames({ CLAUDE_CONFIG_DIR: config }, home)).toEqual({ names: ["mcp:other"], complete: false });
  });

  it("다 읽었으면 지금 목록을, 읽지 못한 곳이 있으면 전의 목록과 합친 것을 둔다", () => {
    expect(nextNames(["skill:a"], { names: ["skill:b"], complete: true })).toEqual(["skill:b"]);
    expect(nextNames(["skill:a"], { names: ["skill:b"], complete: false })).toEqual(["skill:a", "skill:b"]);
    expect(nextNames(null, { names: ["skill:b"], complete: false })).toEqual(["skill:b"]);
  });
});

describe("알릴지 판단(18.2)", () => {
  const on = (names: string[] | null = ["skill:a"]) => ({ on: true, lang: "ko" as const, names });
  const now = (names: string[]) => () => ({ names, complete: true });
  it("꺼져 있으면 알리지 않는다. 마지막 점검 뒤 7일이 지났거나 저장한 점검이 없으면 알린다", () => {
    expect(hookMessage({ lastCheckupAt: null, notify: null }, now([]), NOW)).toBeNull();
    expect(hookMessage({ lastCheckupAt: null, notify: { ...on(), on: false } }, now([]), NOW)).toBeNull();
    expect(hookMessage({ lastCheckupAt: new Date(NOW - 9 * DAY).toISOString(), notify: on() }, now([]), NOW)).toBe("🔧 춘식이: 마지막 점검 뒤 9일 지났습니다. AQ 점검해 달라고 말해 보세요.");
    expect(hookMessage({ lastCheckupAt: null, notify: on() }, now([]), NOW)).toBe("🔧 춘식이: 아직 저장한 점검이 없습니다. AQ 점검해 달라고 말해 보세요.");
  });

  it("7일이 안 지났으면 목록에 없던 이름이 하나라도 있을 때만 알린다. 개수가 아니라 이름으로 견주고, 목록을 만든 적이 없으면 알리지 않는다", () => {
    const recent = new Date(NOW - 2 * DAY).toISOString();
    expect(hookMessage({ lastCheckupAt: recent, notify: on(["skill:a"]) }, now(["skill:a"]), NOW)).toBeNull();
    expect(hookMessage({ lastCheckupAt: recent, notify: on(["skill:a"]) }, now(["skill:b"]), NOW)).toBe("🔧 춘식이: 새로 깐 스킬이나 플러그인, MCP 서버가 있습니다. AQ 점검해 달라고 말해 보세요.");
    expect(hookMessage({ lastCheckupAt: recent, notify: on(null) }, now(["skill:b"]), NOW)).toBeNull();
    expect(hookMessage({ lastCheckupAt: recent, notify: { on: true, lang: "en", names: [] } }, now(["mcp:x"]), NOW)).toBe("🔧 Chunsik: There are newly installed skills, plugins, or MCP servers. Ask for an AQ checkup.");
  });
});

describe("세션 시작 훅(18.2의 5번)", () => {
  const writeState = (state: unknown): Promise<void> => put(join(home, ".chunsik-garage", "state.json"), JSON.stringify(state));
  it("알릴 것이 있으면 오늘 표식을 없을 때만 만들고 만든 훅만 한 줄을 낸다. 7일이 지난 표식은 지운다", async () => {
    await writeState({ lastCheckupAt: new Date(NOW - 9 * DAY).toISOString(), notify: { on: true, lang: "ko", names: [] } });
    const old = join(home, ".chunsik-garage", "notified", "2026-11-01");
    await put(old, "");
    const first = sessionStart({}, home, NOW);
    expect(JSON.parse(first!)).toEqual({ systemMessage: "🔧 춘식이: 마지막 점검 뒤 9일 지났습니다. AQ 점검해 달라고 말해 보세요." });
    expect(sessionStart({}, home, NOW)).toBeNull();
    expect(existsSync(old)).toBe(false);
  });

  it("상태 파일이 없거나 깨졌거나 알림이 꺼져 있으면 아무것도 내지 않고 표식도 만들지 않는다", async () => {
    expect(sessionStart({}, home, NOW)).toBeNull();
    await put(join(home, ".chunsik-garage", "state.json"), "{");
    expect(sessionStart({}, home, NOW)).toBeNull();
    await writeState({ lastCheckupAt: null, notify: { on: false, lang: "ko", names: [] } });
    expect(sessionStart({}, home, NOW)).toBeNull();
    expect(existsSync(join(home, ".chunsik-garage", "notified"))).toBe(false);
    await writeFile(join(home, "dummy"), "");
  });
});
