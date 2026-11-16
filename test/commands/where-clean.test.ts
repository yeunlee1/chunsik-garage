// aq where와 aq clean을 임시 상태 폴더로 시험한다. 링크를 따라가지 않는지, clean이 가장 최근 결과를 남기는지, --all이 이 도구의 것만 지우는지 본다
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli.ts";
import { clean } from "../../src/commands/clean.ts";
import { where } from "../../src/commands/where.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

async function fill(): Promise<void> {
  await put(join(dir, "cache", "claude-code", "a.json"), "12345");
  await put(join(dir, "reports", "20261101-090000.json"), "old");
  await put(join(dir, "reports", "20261101-090000.html"), "old-html");
  await put(join(dir, "reports", "20261113-010203.json"), "newest");
  await put(join(dir, "reports", "20261113-010203.html"), "newest-html");
  await put(join(dir, "history.jsonl"), "{}\n");
  await put(join(dir, "state.json"), "{}");
  await put(join(dir, "notified", "2026-11-13"), "");
  await put(join(dir, "tune", "job-1.json"), "{}");
  await put(join(dir, "someone-else.txt"), "keep me");
}

describe("aq where", () => {
  it("상태 폴더가 없으면 있는 것이 없다고 알린다", async () => {
    const report = await where(dir);
    expect(report.exists).toBe(false);
    expect(report.entries.every((e) => !e.exists && e.files === 0 && e.bytes === 0)).toBe(true);
    expect(report.entries.map((e) => e.name)).toEqual(["cache", "reports", "history.jsonl", "state.json", "notified", "tune"]);
    expect(report.noSaveResultsInOsTemp).toBe(true);
  });

  it("둔 것마다 파일 수와 바이트를 세고, 이 도구의 것이 아닌 이름을 따로 보인다", async () => {
    await fill();
    const report = await where(dir);
    const cache = report.entries.find((e) => e.name === "cache")!;
    expect(cache).toMatchObject({ exists: true, link: false, files: 1, bytes: 5, removedBy: "clean" });
    expect(report.entries.find((e) => e.name === "reports")).toMatchObject({ files: 4, bytes: 3 + 8 + 6 + 11 });
    expect(report.entries.find((e) => e.name === "state.json")).toMatchObject({ kind: "file", files: 1, bytes: 2, removedBy: "all" });
    expect(report.others).toEqual(["someone-else.txt"]);
    expect(report.files).toBe(1 + 4 + 1 + 1 + 1 + 1);
  });

  it("링크는 따라가지 않는다", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "big.bin"), "x".repeat(1000));
    await linkDir(outside, join(dir, "cache"));
    const report = await where(dir);
    expect(report.entries.find((e) => e.name === "cache")).toMatchObject({ exists: true, link: true, files: 0, bytes: 0 });
  });
});

describe("aq clean", () => {
  it("clean은 캐시를 지우고 결과 폴더에서 가장 최근 점검의 결과만 남긴다. 이력과 상태는 남긴다", async () => {
    await fill();
    const report = await clean(dir, "clean");
    expect(await exists(join(dir, "cache"))).toBe(false);
    expect((await readdir(join(dir, "reports"))).sort()).toEqual(["20261113-010203.html", "20261113-010203.json"]);
    expect(await exists(join(dir, "state.json"))).toBe(true);
    expect(await exists(join(dir, "history.jsonl"))).toBe(true);
    expect(await exists(join(dir, "tune", "job-1.json"))).toBe(true);
    expect(report.removed).toEqual([
      { name: "cache", files: 1, bytes: 5 },
      { name: "reports", files: 2, bytes: 3 + 8 },
    ]);
    expect(report.kept.find((k) => k.name === "reports")).toEqual({ name: "reports", files: 2, bytes: 6 + 11 });
  });

  it("--all은 이 도구가 두는 것을 모두 지우고 다른 이름은 남긴다", async () => {
    await fill();
    const report = await clean(dir, "all");
    expect((await readdir(dir)).sort()).toEqual(["someone-else.txt"]);
    expect(report.removed.map((r) => r.name)).toEqual(["cache", "reports", "history.jsonl", "state.json", "notified", "tune"]);
  });

  it("폴더 안의 링크는 링크만 지우고 대상은 남긴다", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "precious.txt"), "do not delete");
    await put(join(dir, "cache", "real.json"), "1");
    await linkDir(outside, join(dir, "cache", "linked"));
    await clean(dir, "clean");
    expect(await exists(join(dir, "cache"))).toBe(false);
    expect(await exists(join(outside, "precious.txt"))).toBe(true);
  });

  it("이 도구가 두는 것 자체가 링크면 링크만 지우고 가리키는 곳은 남긴다", async () => {
    const outside = join(root, "outside-tune");
    await put(join(outside, "job.json"), "{}");
    await put(join(dir, "state.json"), "{}");
    await linkDir(outside, join(dir, "tune"));
    const report = await clean(dir, "all");
    expect(report.unlinked).toEqual(["tune"]);
    expect(await exists(join(outside, "job.json"))).toBe(true);
    expect(await exists(join(dir, "tune"))).toBe(false);
  });

  it("clean에서 결과 폴더가 링크면 가장 최근 결과를 남길 수 없으므로 건드리지 않는다", async () => {
    const outside = join(root, "outside-reports");
    await put(join(outside, "20261101-090000.json"), "old");
    await linkDir(outside, join(dir, "reports"));
    const report = await clean(dir, "clean");
    expect(report.skipped).toEqual(["reports"]);
    expect(await exists(join(outside, "20261101-090000.json"))).toBe(true);
  });

  it("결과 폴더 안에 바깥 폴더를 가리키는 링크가 있을 때 --all은 링크만 지운다", async () => {
    const outside = join(root, "outside-shared");
    await put(join(outside, "keep.txt"), "keep");
    await put(join(dir, "reports", "20261113-010203.json"), "x");
    await linkDir(outside, join(dir, "reports", "shared"));
    await clean(dir, "all");
    expect(await exists(join(dir, "reports"))).toBe(false);
    expect(await exists(join(outside, "keep.txt"))).toBe(true);
  });

  it("상태 폴더 자체가 링크면 아무것도 지우지 않는다", async () => {
    const outside = join(root, "elsewhere");
    await put(join(outside, "cache", "a.json"), "1");
    await linkDir(outside, dir);
    const report = await clean(dir, "all");
    expect(report.link).toBe(true);
    expect(report.removed).toEqual([]);
    expect(await exists(join(outside, "cache", "a.json"))).toBe(true);
  });

  it("상태 폴더가 없으면 지운 것이 없다", async () => {
    expect(await clean(dir, "all")).toEqual({ dir, level: "all", link: false, removed: [], kept: [], unlinked: [], skipped: [], failed: [] });
  });
});

describe("명령 입구", () => {
  it("aq where와 aq clean --all은 JSON을 내고 0을 돌려준다. 모르는 선택지는 64다", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const errors = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await put(join(dir, "cache", "a.json"), "1");
      expect(await main(["where"], { env: {}, homedir: root })).toBe(0);
      expect(JSON.parse(String(write.mock.calls[0]![0])).dir).toBe(dir);
      expect(await main(["clean", "--bogus"], { env: {}, homedir: root })).toBe(64);
      expect(await exists(join(dir, "cache", "a.json"))).toBe(true);
      expect(await main(["clean", "--all"], { env: {}, homedir: root })).toBe(0);
      expect(await exists(join(dir, "cache"))).toBe(false);
    } finally {
      write.mockRestore();
      errors.mockRestore();
    }
  });
});
