// aq doctor의 보고(기록 폴더, 세션 파일 수, 상태 폴더에 쓸 수 있는지, 압축 풀기 기능)를 시험한다(설계 6.3, 7.4)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli.ts";
import { defaultStateDir, doctor } from "../../src/commands/doctor.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 닥터 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("doctor", () => {
  it("기록 폴더와 세션 파일 수, 상태 폴더에 쓸 수 있는지를 낸다", async () => {
    await mkdir(join(root, ".claude", "projects", "p"), { recursive: true });
    await writeFile(join(root, ".claude", "projects", "p", "s.jsonl"), "{}\n");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: defaultStateDir(root) });
    expect(report.claudeCode).toEqual({ home: join(root, ".claude"), projectsFound: true, sessionFiles: 1, unreadable: 0 });
    expect(report.state).toEqual({ dir: join(root, ".chunsik-garage"), writable: true });
    expect(typeof report.zstd).toBe("boolean");
    expect(report.node).toEqual({ version: "v24.0.0", ok: true });
  });
  it("기록 폴더를 읽지 못하면 찾았지만 읽지 못한 폴더의 수를 낸다", async () => {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "projects"), "x");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: defaultStateDir(root) });
    expect(report.claudeCode).toMatchObject({ projectsFound: true, sessionFiles: 0, unreadable: 1 });
  });
  it("상태 폴더를 만들 수 없으면 쓸 수 없다고 낸다", async () => {
    const blocker = join(root, "file");
    await writeFile(blocker, "x");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: join(blocker, "state") });
    expect(report.state.writable).toBe(false);
  });
  it("aq doctor는 JSON을 내고 0을 돌려준다", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await main(["doctor"], { env: {}, homedir: root });
    expect(code).toBe(0);
    const printed = JSON.parse(String(write.mock.calls[0]![0]));
    expect(printed.claudeCode.projectsFound).toBe(false);
  });
});
