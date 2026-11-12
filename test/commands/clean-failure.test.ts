// aq clean이 지우지 못하는 항목을 만나도 다른 항목은 계속 지우고 알리는지, aq where가 세지 못한 항목을 표시하고 나머지를 세는지, 명령이 던지면 이유를 담은 JSON과 종료 코드 1을 내는지, 지우는 도중의 바꿔치기에 멈추는지 시험한다(설계 19.2, 20.1). 파일 시스템 오류는 꾸며서 낸다
import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli.ts";
import { clean } from "../../src/commands/clean.ts";
import { where } from "../../src/commands/where.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, unlink: vi.fn(real.unlink), lstat: vi.fn(real.lstat) };
});
const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const busy = (message: string): NodeJS.ErrnoException => Object.assign(new Error(message), { code: "EBUSY" });

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => {
  vi.mocked(fsp.unlink).mockImplementation(actual.unlink);
  vi.mocked(fsp.lstat).mockImplementation(actual.lstat);
  vi.restoreAllMocks();
  await removeTemp(root);
});

describe("지우다가 오류가 날 때", () => {
  it("한 항목에서 지우지 못해도 다른 항목은 지우고, 오류 난 항목과 코드를 알린다", async () => {
    await put(join(dir, "cache", "locked.json"), "1");
    await put(join(dir, "tune", "job.json"), "{}");
    vi.mocked(fsp.unlink).mockImplementation(async (path) => {
      if (String(path).endsWith("locked.json")) throw busy("EBUSY: resource busy or locked");
      return actual.unlink(path);
    });
    const report = await clean(dir, "all");
    expect(report.failed).toEqual([{ name: "cache", code: "EBUSY" }]);
    expect(report.removed.map((r) => r.name)).toEqual(["tune"]);
    await expect(actual.access(join(dir, "tune"))).rejects.toThrow();
  });

  it("명령이 던지면 표준 출력에 이유를 담은 JSON을 내고 1을 돌려준다", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.mocked(fsp.lstat).mockImplementationOnce(async () => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    });
    expect(await main(["where"], { env: {}, homedir: root })).toBe(1);
    expect(JSON.parse(String(write.mock.calls[0]![0]))).toEqual({ error: { code: "EACCES", message: "EACCES: permission denied" } });
  });
});

describe("세다가 오류가 날 때", () => {
  it("aq where는 한 항목을 세지 못해도 그 항목에 표시하고 나머지를 센다", async () => {
    await put(join(dir, "cache", "a.json"), "12");
    await put(join(dir, "state.json"), "{}");
    vi.mocked(fsp.lstat).mockImplementation(async (path) => {
      if (String(path) === join(dir, "cache")) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return actual.lstat(path);
    });
    const report = await where(dir);
    expect(report.entries.find((e) => e.name === "cache")).toMatchObject({ unreadable: true, files: 0, bytes: 0 });
    expect(report.entries.find((e) => e.name === "state.json")).toMatchObject({ exists: true, unreadable: false, files: 1, bytes: 2 });
  });
});

describe("지우는 도중의 바꿔치기", () => {
  const linkType = process.platform === "win32" ? "junction" : "dir";
  const exists = (path: string): Promise<boolean> => actual.access(path).then(() => true, () => false);

  it("검사한 바로 뒤에 상태 폴더가 바깥을 가리키는 링크로 바뀌면 아무것도 지우지 않는다", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "cache", "protected.txt"), "keep");
    await put(join(dir, "cache", "a.json"), "1");
    vi.mocked(fsp.lstat).mockImplementationOnce(async (path) => {
      const stats = await actual.lstat(path);
      await actual.rename(dir, `${dir}.moved`);
      await actual.symlink(outside, dir, linkType);
      return stats;
    });
    const report = await clean(dir, "all");
    expect(report.link).toBe(true);
    expect(await exists(join(outside, "cache", "protected.txt"))).toBe(true);
  });

  it("한 항목을 지우기 직전에 바뀌면 그 항목을 EOUTSIDE로 멈추고 바깥 파일을 지우지 않는다", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "cache", "protected.txt"), "keep");
    await put(join(dir, "cache", "a.json"), "1");
    vi.mocked(fsp.lstat).mockImplementation(async (path) => {
      if (String(path) === join(dir, "cache") && !(await exists(`${dir}.moved`))) {
        const stats = await actual.lstat(path);
        await actual.rename(dir, `${dir}.moved`);
        await actual.symlink(outside, dir, linkType);
        return stats;
      }
      return actual.lstat(path);
    });
    const report = await clean(dir, "all");
    expect(report.failed).toContainEqual({ name: "cache", code: "EOUTSIDE" });
    expect(await exists(join(outside, "cache", "protected.txt"))).toBe(true);
  });

  it("다시 본 바로 뒤, 지우기 전에 바꿔치면 이 도구는 알지 못하고 바깥 파일이 지워진다(설계 19.2의 한계를 드러내는 시험)", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "cache", "victim.txt"), "x");
    await put(join(dir, "cache", "victim.txt"), "1");
    let swapped = false;
    vi.mocked(fsp.unlink).mockImplementation(async (path) => {
      if (!swapped && String(path).endsWith("victim.txt")) {
        swapped = true;
        await actual.rename(dir, `${dir}.moved`);
        await actual.symlink(outside, dir, linkType);
      }
      return actual.unlink(path);
    });
    await clean(dir, "all");
    expect(swapped).toBe(true);
    expect(await exists(join(outside, "cache", "victim.txt"))).toBe(false);
  });
});
