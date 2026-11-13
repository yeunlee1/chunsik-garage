// 점검 때의 정리를 실제 진입(pruneReports, pruneCache)으로 불러, 고른 직후 그 자리가 폴더로 바뀌거나 위 폴더가 상태 폴더 안의 다른 곳을 가리키는 링크로 바뀌어도 지우지 않는지 시험한다. 고르기와 지우기 사이에 끼어들려고 파일 함수를 감싼다(설계 19.2)
import type { Stats } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pruneCache } from "../../src/state/cache.ts";
import { pruneReports, resultStamp } from "../../src/state/reports.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

type FsPromises = typeof import("node:fs/promises");

/** 끼어들 함수(lstat 또는 readFile)와 경로, 그때 할 일. 한 번만 한다 */
const swap = vi.hoisted(() => ({ target: "", on: "", done: false, action: null as ((fs: FsPromises) => Promise<void>) | null }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<FsPromises>();
  const lstat = actual.lstat as unknown as (...args: unknown[]) => Promise<Stats>;
  const readFile = actual.readFile as unknown as (...args: unknown[]) => Promise<unknown>;
  const fire = async (on: string, path: unknown): Promise<void> => {
    if (swap.on !== on || swap.done || path !== swap.target || swap.action === null) return;
    swap.done = true;
    await swap.action(actual);
  };
  return {
    ...actual,
    lstat: async (...args: unknown[]) => {
      const info = await lstat(...args);
      if (info.isFile()) await fire("lstat", args[0]);
      return info;
    },
    readFile: async (...args: unknown[]) => {
      const content = await readFile(...args);
      await fire("readFile", args[0]);
      return content;
    },
  };
});

let root: string;
let dir: string;
const reset = (): void => {
  Object.assign(swap, { target: "", on: "", done: false, action: null });
};
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
  reset();
});
afterEach(async () => {
  reset();
  await removeTemp(root);
});

/** 고른 파일을 지우고 같은 자리에 사용자 자료가 든 폴더를 둔다 */
const toFolder =
  (path: string) =>
  async (fs: FsPromises): Promise<void> => {
    await fs.rm(path);
    await fs.mkdir(path);
    await fs.writeFile(join(path, "user-data.txt"), "keep me");
  };

/** 폴더를 옮기고 그 자리에 상태 폴더 안의 다른 폴더를 가리키는 링크를 둔다. 다른 폴더에는 고른 것과 같은 이름의 파일을 둔다 */
const toInnerLink =
  (folder: string, other: string, names: readonly string[]) =>
  async (fs: FsPromises): Promise<void> => {
    await fs.rename(folder, `${folder}-moved`);
    for (const name of names) {
      await fs.mkdir(dirname(join(other, name)), { recursive: true });
      await fs.writeFile(join(other, name), "keep me");
    }
    await fs.symlink(other, folder, process.platform === "win32" ? "junction" : "dir");
  };

describe("정리 진입에서 고른 직후 그 자리나 위 폴더가 바뀜", () => {
  it("오래된 결과를 고른 직후 그 자리가 폴더로 바뀌면 폴더와 그 안을 지우지 않는다", async () => {
    const reports = join(dir, "reports");
    await mkdir(reports, { recursive: true });
    const old = join(reports, `${resultStamp(Date.UTC(2026, 10, 12))}.json`);
    await writeFile(old, "{}");
    await writeFile(join(reports, `${resultStamp(Date.UTC(2026, 10, 13))}.json`), "{}");
    Object.assign(swap, { target: old, on: "lstat", action: toFolder(old) });
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: null });
    expect(swap.done).toBe(true);
    expect(await readFile(join(old, "user-data.txt"), "utf8")).toBe("keep me");
  });

  it("오래된 결과를 고른 직후 결과 폴더가 상태 폴더 안의 다른 폴더를 가리키는 링크로 바뀌면 그 안을 지우지 않고 링크라서 하지 않은 정리로 돌려준다", async () => {
    const reports = join(dir, "reports");
    await mkdir(reports, { recursive: true });
    const oldName = `${resultStamp(Date.UTC(2026, 10, 12))}.json`;
    const newer = join(reports, `${resultStamp(Date.UTC(2026, 10, 13))}.json`);
    await writeFile(join(reports, oldName), "{}");
    await writeFile(newer, "{}");
    const other = join(dir, "tune");
    Object.assign(swap, { target: newer, on: "lstat", action: toInnerLink(reports, other, [oldName]) });
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: "reports" });
    expect(swap.done).toBe(true);
    expect(await readFile(join(other, oldName), "utf8")).toBe("keep me");
  });

  it("원본이 없어진 캐시 항목을 고른 직후 그 자리가 폴더로 바뀌면 폴더와 그 안을 지우지 않는다", async () => {
    const toolDir = join(dir, "cache", "claude-code");
    await mkdir(toolDir, { recursive: true });
    const entry = join(toolDir, `${"a".repeat(32)}.json`);
    await writeFile(entry, JSON.stringify({ key: { normPath: join(root, "gone.jsonl") } }));
    Object.assign(swap, { target: entry, on: "readFile", action: toFolder(entry) });
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: null });
    expect(swap.done).toBe(true);
    expect(await readFile(join(entry, "user-data.txt"), "utf8")).toBe("keep me");
  });

  it("원본이 없어진 캐시 항목을 고른 직후 캐시 폴더가 상태 폴더 안의 다른 폴더를 가리키는 링크로 바뀌면 그 안을 지우지 않고 링크라서 하지 않은 정리로 돌려준다", async () => {
    const cache = join(dir, "cache");
    const name = `${"a".repeat(32)}.json`;
    const entry = join(cache, "claude-code", name);
    await mkdir(dirname(entry), { recursive: true });
    await writeFile(entry, JSON.stringify({ key: { normPath: join(root, "gone.jsonl") } }));
    const other = join(dir, "tune");
    Object.assign(swap, { target: entry, on: "readFile", action: toInnerLink(cache, other, [join("claude-code", name)]) });
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: "cache" });
    expect(swap.done).toBe(true);
    expect(await readFile(join(other, "claude-code", name), "utf8")).toBe("keep me");
  });
});
