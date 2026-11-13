// 평가 결과 파일의 이름(시각), 결과 폴더에 쓰기와 오래된 결과 정리, 저장 없는 실행의 임시 파일을 시험한다(설계 12.3, 13.2, 19.2)
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeFiles } from "../../src/state/folder.ts";
import { KEEP_REPORTS, pruneReports, resultStamp, staleReports, writeResult, writeTempResult } from "../../src/state/reports.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

const stampAt = (minute: number): string => resultStamp(Date.UTC(2026, 10, 13, 9, minute, 0, 5));

describe("결과 파일의 시각", () => {
  it("평가 시계를 UTC로 적고 콜론과 점을 쓰지 않는다", () => {
    expect(resultStamp(Date.UTC(2026, 10, 13, 13, 23, 34, 938))).toBe("2026-11-13T13-23-34-938Z");
    expect(resultStamp(Date.UTC(2026, 0, 2, 3, 4, 5, 6))).toBe("2026-01-02T03-04-05-006Z");
  });

  it("글자 차례가 시각 차례와 같다", () => {
    const times = [Date.UTC(2026, 10, 13, 9, 0, 0, 999), Date.UTC(2026, 10, 13, 10, 0, 0, 0), Date.UTC(2026, 11, 1, 0, 0, 0, 0), Date.UTC(2027, 0, 1, 0, 0, 0, 0), Date.UTC(2026, 10, 13, 9, 0, 1, 0)];
    const byText = times.map(resultStamp).sort();
    const byTime = [...times].sort((a, b) => a - b).map(resultStamp);
    expect(byText).toEqual(byTime);
  });
});

describe("결과 폴더에 쓰기", () => {
  it("결과 폴더를 만들어 <시각>.json에 쓰고 경로를 돌려준다. 임시 파일이 남지 않는다", async () => {
    const stamp = stampAt(1);
    const path = await writeResult(dir, stamp, { schema: 1, aq: 80 });
    expect(path).toBe(join(dir, "reports", `${stamp}.json`));
    expect(await readFile(path, "utf8")).toBe(`${JSON.stringify({ schema: 1, aq: 80 }, null, 2)}\n`);
    expect(await readdir(join(dir, "reports"))).toEqual([`${stamp}.json`]);
  });

  it("같은 시각의 결과가 이미 있으면 덮어쓴다", async () => {
    const stamp = stampAt(1);
    await writeResult(dir, stamp, { n: 1 });
    await writeResult(dir, stamp, { n: 2 });
    expect(JSON.parse(await readFile(join(dir, "reports", `${stamp}.json`), "utf8"))).toEqual({ n: 2 });
    expect(await readdir(join(dir, "reports"))).toEqual([`${stamp}.json`]);
  });

  it("결과 파일을 쓰지 못하면 임시 파일을 남기지 않는다", async () => {
    const stamp = stampAt(1);
    await mkdir(join(dir, "reports", `${stamp}.json`), { recursive: true });
    await expect(writeResult(dir, stamp, { n: 1 })).rejects.toBeDefined();
    expect(await readdir(join(dir, "reports"))).toEqual([`${stamp}.json`]);
  });

  it("저장 없는 실행은 임시 폴더에 chunsik-garage-result-<시각>.json으로 쓴다", async () => {
    const stamp = stampAt(2);
    const path = await writeTempResult(root, stamp, { schema: 1 });
    expect(path).toBe(join(root, `chunsik-garage-result-${stamp}.json`));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ schema: 1 });
  });
});

describe("오래된 결과 정리", () => {
  it("최근 20번의 점검만 남긴다. 한 점검의 결과 화면과 평가 결과 파일은 한 번으로 센다", async () => {
    expect(KEEP_REPORTS).toBe(20);
    for (let minute = 0; minute < 23; minute++) {
      await put(join(dir, "reports", `${stampAt(minute)}.json`), "{}");
      if (minute % 2 === 0) await put(join(dir, "reports", `${stampAt(minute)}.html`), "<html>");
    }
    // 지우는 점검은 0, 1, 2분의 셋이고 파일로는 다섯이다(0분과 2분에는 결과 화면도 있다)
    const removed = await pruneReports(dir);
    expect(removed).toEqual({ removed: 5, skipped: null });
    const left = (await readdir(join(dir, "reports"))).sort();
    const stamps = [...new Set(left.map((name) => name.replace(/\.[^.]*$/, "")))].sort();
    expect(stamps).toEqual(Array.from({ length: 20 }, (_, index) => stampAt(index + 3)));
    expect(left).toContain(`${stampAt(4)}.html`);
    expect(left).not.toContain(`${stampAt(2)}.html`);
  });

  it("남길 수를 줄 수 있다. 결과 폴더가 없으면 지울 것이 없다", async () => {
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: null });
    await put(join(dir, "reports", `${stampAt(1)}.json`), "{}");
    await put(join(dir, "reports", `${stampAt(2)}.json`), "{}");
    expect(await pruneReports(dir, 1)).toEqual({ removed: 1, skipped: null });
    expect(await readdir(join(dir, "reports"))).toEqual([`${stampAt(2)}.json`]);
  });

  it("시각 꼴이 아닌 이름, 폴더, 링크는 건드리지 않고 세지도 않는다", async () => {
    const reports = join(dir, "reports");
    for (let minute = 0; minute < 3; minute++) await put(join(reports, `${stampAt(minute)}.json`), "{}");
    await put(join(reports, "notes.txt"), "mine");
    await put(join(reports, "2026-11-13.json"), "{}");
    await put(join(reports, `${stampAt(0)}.json.tmp`), "{}");
    await mkdir(join(reports, `${stampAt(9)}.json`));
    const outside = join(root, "outside");
    await put(join(outside, "keep.json"), "{}");
    await linkDir(outside, join(reports, `${stampAt(8)}.html`));
    expect(await pruneReports(dir, 1)).toEqual({ removed: 2, skipped: null });
    expect((await readdir(reports)).sort()).toEqual([`${stampAt(0)}.json.tmp`, `${stampAt(2)}.json`, `${stampAt(8)}.html`, `${stampAt(9)}.json`, "2026-11-13.json", "notes.txt"].sort());
    expect(await readdir(outside)).toEqual(["keep.json"]);
  });

  it("결과 폴더가 링크면 안을 지우지 않는다", async () => {
    const outside = join(root, "elsewhere");
    for (let minute = 0; minute < 3; minute++) await put(join(outside, `${stampAt(minute)}.json`), "{}");
    await mkdir(dir, { recursive: true });
    await linkDir(outside, join(dir, "reports"));
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: "reports" });
    expect((await readdir(outside)).length).toBe(3);
  });

  it("상태 폴더 자체가 링크면 안을 지우지 않는다", async () => {
    const real = join(root, "real-state");
    for (let minute = 0; minute < 3; minute++) await put(join(real, "reports", `${stampAt(minute)}.json`), "{}");
    await linkDir(real, dir);
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: "state" });
    expect((await readdir(join(real, "reports"))).length).toBe(3);
    expect((await lstat(dir)).isSymbolicLink()).toBe(true);
  });

  it("이번 점검의 결과는 시계가 뒤로 가 있어도 늘 남기고 20번에 넣어 센다", async () => {
    for (let minute = 10; minute < 30; minute++) await put(join(dir, "reports", `${stampAt(minute)}.json`), "{}");
    const current = await writeResult(dir, stampAt(5), { now: true });
    expect(await pruneReports(dir, KEEP_REPORTS, stampAt(5))).toEqual({ removed: 1, skipped: null });
    const left = (await readdir(join(dir, "reports"))).sort();
    expect(left).toHaveLength(20);
    expect(left).toContain(`${stampAt(5)}.json`);
    expect(left).not.toContain(`${stampAt(10)}.json`);
    expect(JSON.parse(await readFile(current, "utf8"))).toEqual({ now: true });
  });

  it("이번 점검의 시각에 결과가 없으면 남길 자리를 맡지 않는다. 결과가 있으면 남길 수가 0이어도 남긴다", async () => {
    const reports = join(dir, "reports");
    for (let minute = 0; minute < 3; minute++) await put(join(reports, `${stampAt(minute)}.json`), "{}");
    expect((await staleReports(dir, 1, stampAt(9))).paths).toEqual([join(reports, `${stampAt(0)}.json`), join(reports, `${stampAt(1)}.json`)]);
    expect((await staleReports(dir, 0, stampAt(0))).paths).toEqual([join(reports, `${stampAt(1)}.json`), join(reports, `${stampAt(2)}.json`)]);
  });

  it("고른 뒤 지우기 전에 그 자리가 폴더로 바뀌면 폴더와 그 안은 지우지 않는다", async () => {
    const reports = join(dir, "reports");
    for (let minute = 0; minute < 3; minute++) await put(join(reports, `${stampAt(minute)}.json`), "{}");
    const stale = await staleReports(dir, 1);
    expect(stale.paths).toEqual([join(reports, `${stampAt(0)}.json`), join(reports, `${stampAt(1)}.json`)]);
    await rm(join(reports, `${stampAt(0)}.json`));
    await put(join(reports, `${stampAt(0)}.json`, "user-data.txt"), "keep me");
    expect(await removeFiles(stale.paths, dir, stale.boundary!)).toEqual({ removed: 1, linked: 0 });
    expect(await readFile(join(reports, `${stampAt(0)}.json`, "user-data.txt"), "utf8")).toBe("keep me");
    expect((await readdir(reports)).sort()).toEqual([`${stampAt(0)}.json`, `${stampAt(2)}.json`]);
  });

  it("고른 뒤 결과 폴더가 상태 폴더 안의 다른 폴더를 가리키는 링크로 바뀌면 그 안의 파일은 지우지 않는다", async () => {
    const reports = join(dir, "reports");
    for (let minute = 0; minute < 3; minute++) await put(join(reports, `${stampAt(minute)}.json`), "{}");
    const stale = await staleReports(dir, 1);
    await rename(reports, join(dir, "reports-moved"));
    const other = join(dir, "tune");
    await put(join(other, `${stampAt(0)}.json`), "keep me");
    await linkDir(other, reports);
    // 지우지 않고 넘긴 것을 세어 돌려준다. 정리 함수는 이것을 링크라서 하지 않은 정리로 알린다
    expect(await removeFiles(stale.paths, dir, stale.boundary!)).toEqual({ removed: 0, linked: 1 });
    expect(await readFile(join(other, `${stampAt(0)}.json`), "utf8")).toBe("keep me");
  });

  it("파일만 지우는 함수는 링크와 없는 것을 넘기고, 상태 폴더 밖의 파일은 지우지 않고 멈춘다", async () => {
    await mkdir(dir, { recursive: true });
    const boundary = (await staleReports(dir)).boundary!;
    const outsideFile = join(root, "outside.json");
    await put(outsideFile, "{}");
    await mkdir(join(root, "elsewhere"), { recursive: true });
    await linkDir(join(root, "elsewhere"), join(dir, "reports", "link.json"));
    expect(await removeFiles([join(dir, "reports", "link.json"), join(dir, "reports", "missing.json")], dir, boundary)).toEqual({ removed: 0, linked: 0 });
    await expect(removeFiles([outsideFile], dir, boundary)).rejects.toMatchObject({ code: "EOUTSIDE" });
    expect(await readFile(outsideFile, "utf8")).toBe("{}");
  });

  it("보통 파일만 남길 시각으로 센다. 폴더만 있는 시각은 남길 몫을 차지하지 않는다", async () => {
    const reports = join(dir, "reports");
    await put(join(reports, `${stampAt(1)}.json`), "{}");
    await mkdir(join(reports, `${stampAt(5)}.json`), { recursive: true });
    await writeFile(join(reports, `${stampAt(3)}.json`), "{}");
    expect(await pruneReports(dir, 1)).toEqual({ removed: 1, skipped: null });
    expect((await readdir(reports)).sort()).toEqual([`${stampAt(3)}.json`, `${stampAt(5)}.json`]);
  });
});
