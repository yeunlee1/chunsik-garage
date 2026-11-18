// aq doctor의 보고(Claude Code와 Codex의 기록 폴더, 세션 파일 수, 상태 폴더에 쓸 수 있는지, 압축 풀기 기능)를 시험한다(설계 6.3, 7.4, 9.1, 9.2)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 파일 하나의 stat만 실패하게 하려고 stat을 감싼다. 평소에는 실제 stat을 그대로 부른다
const failPaths = vi.hoisted(() => new Set<string>());
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: async (...args: Parameters<typeof actual.stat>) => {
      if (failPaths.has(String(args[0]))) throw new Error("stat 실패");
      return actual.stat(...args);
    },
  };
});
import { main } from "../../src/cli.ts";
import { doctor } from "../../src/commands/doctor.ts";
import { stateDir } from "../../src/state/folder.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 닥터 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
  failPaths.clear();
});

describe("doctor", () => {
  it("기록 폴더와 세션 파일 수, 상태 폴더에 쓸 수 있는지를 낸다", async () => {
    await mkdir(join(root, ".claude", "projects", "p"), { recursive: true });
    await writeFile(join(root, ".claude", "projects", "p", "s.jsonl"), "{}\n");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(report.claudeCode).toEqual({ home: join(root, ".claude"), projectsFound: true, sessionFiles: 1, unreadable: 0 });
    expect(report.state).toEqual({ dir: join(root, ".chunsik-garage"), writable: true });
    expect(typeof report.zstd).toBe("boolean");
    expect(report.node).toEqual({ version: "v24.0.0", ok: true });
  });
  it("기록 폴더를 읽지 못하면 찾았지만 읽지 못한 폴더의 수를 낸다", async () => {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "projects"), "x");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(report.claudeCode).toMatchObject({ projectsFound: true, sessionFiles: 0, unreadable: 1 });
  });
  it("상태 폴더를 만들 수 없으면 쓸 수 없다고 낸다", async () => {
    const blocker = join(root, "file");
    await writeFile(blocker, "x");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: join(blocker, "state") });
    expect(report.state.writable).toBe(false);
  });
  it("Codex 기록 폴더, 같은 식별자의 사본을 하나로 센 기록 파일 수, 압축본만 있는 기록의 수, 읽지 못한 것의 수를 낸다", async () => {
    const day = join(root, ".codex", "sessions", "2026", "11", "10");
    await mkdir(day, { recursive: true });
    const name = (n: number) => `rollout-2026-11-10T01-00-00-019a0000-0000-7000-8000-${String(n).padStart(12, "0")}.jsonl`;
    await writeFile(join(day, name(1)), "{}\n");
    await writeFile(join(day, `${name(1)}.zst`), "x");
    await writeFile(join(day, `${name(2)}.zst`), "x");
    await writeFile(join(day, "rollout-이름없음.jsonl"), "{}\n");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(report.codex).toEqual({ home: join(root, ".codex"), sessionsFound: true, recordFiles: 2, compressedOnly: 1, unreadable: 0 });
  });
  it("Gemini CLI 기록 폴더와 세션 파일 수를 낸다. GEMINI_CLI_HOME을 따르고, 없으면 찾지 못한 것이다(설계 「0.4.0에서 정한 것」)", async () => {
    const chats = join(root, ".gemini", "tmp", "proj", "chats");
    await mkdir(join(chats, "parent-1"), { recursive: true });
    await writeFile(join(chats, "session-2026-11-10T01-00-aaaa1111.jsonl"), "{}\n");
    await writeFile(join(chats, "parent-1", "agent-1.jsonl"), "{}\n");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(report.gemini).toEqual({ home: join(root, ".gemini"), tmpFound: true, sessionFiles: 2, unreadable: 0 });
    const elsewhere = join(root, "gemini 다른 곳");
    const missing = await doctor({ env: { GEMINI_CLI_HOME: elsewhere }, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(missing.gemini).toEqual({ home: join(elsewhere, ".gemini"), tmpFound: false, sessionFiles: 0, unreadable: 0 });
  });
  it("Codex 기록 폴더는 CODEX_HOME을 따르고, 없으면 찾지 못한 것이며, 날짜 폴더 자리에 파일이 있으면 읽지 못한 것으로 센다", async () => {
    const elsewhere = join(root, "codex 다른 곳");
    const missing = await doctor({ env: { CODEX_HOME: elsewhere }, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(missing.codex).toEqual({ home: elsewhere, sessionsFound: false, recordFiles: 0, compressedOnly: 0, unreadable: 0 });
    await mkdir(join(elsewhere, "sessions"), { recursive: true });
    await writeFile(join(elsewhere, "sessions", "2026"), "x");
    const blocked = await doctor({ env: { CODEX_HOME: elsewhere }, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(blocked.codex).toMatchObject({ sessionsFound: true, recordFiles: 0, unreadable: 1 });
  });
  it("Codex 기록 파일의 크기와 수정 시각을 보지 못하면 읽지 못한 것으로 센다", async () => {
    const day = join(root, ".codex", "sessions", "2026", "11", "10");
    await mkdir(day, { recursive: true });
    const path = join(day, "rollout-2026-11-10T01-00-00-019a0000-0000-7000-8000-000000000001.jsonl");
    await writeFile(path, "{}\n");
    failPaths.add(path);
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(report.codex).toMatchObject({ recordFiles: 1, unreadable: 1 });
  });
  it("aq doctor는 JSON을 내고 0을 돌려준다", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await main(["doctor"], { env: {}, homedir: root });
    expect(code).toBe(0);
    const printed = JSON.parse(String(write.mock.calls[0]![0]));
    expect(printed.claudeCode.projectsFound).toBe(false);
    expect(printed.codex.sessionsFound).toBe(false);
    expect(printed.gemini.tmpFound).toBe(false);
    expect(Object.keys(printed)).toEqual(["node", "zstd", "claudeCode", "codex", "gemini", "web", "state"]);
    expect(printed.web).toEqual({ list: "missing", exports: [] });
  });

  it("넣은 웹 채팅 내보내기 파일마다 있는지와 크기를 낸다. 파일을 열지 않는다. 목록이 깨졌으면 broken이다(0.5.0)", async () => {
    const state = stateDir(root);
    await mkdir(state, { recursive: true });
    const there = join(root, "chatgpt.zip");
    await writeFile(there, "12345");
    await writeFile(join(state, "web-exports.json"), JSON.stringify({ schema: 1, exports: [{ tool: "web-chatgpt", path: there, addedAt: "2026-11-18T00:00:00Z" }, { tool: "web-claude", path: join(root, "gone.zip"), addedAt: "2026-11-18T00:00:00Z" }] }));
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: state });
    expect(report.web).toEqual({ list: "ok", exports: [{ tool: "web-chatgpt", path: there, exists: true, bytes: 5 }, { tool: "web-claude", path: join(root, "gone.zip"), exists: false, bytes: null }] });
    await writeFile(join(state, "web-exports.json"), "{");
    expect((await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: state })).web).toEqual({ list: "broken", exports: [] });
  });
});
