// 점수 이력(history.jsonl)의 한 줄 만들기와 덧붙이기를 시험한다(설계 12.3, 18.1)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxisScore, Overall } from "../../src/core/scoreboard.ts";
import { appendHistory, HISTORY_FILE, historyCount, historyEntry } from "../../src/state/history.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

const axes = (setup: number | null, efficiency: number | null, fit: number | null, intensity: number | null): AxisScore[] => [
  { axis: "setup", score: setup, strengths: 0, repairs: 0 },
  { axis: "efficiency", score: efficiency, strengths: 0, repairs: 0 },
  { axis: "fit", score: fit, strengths: 0, repairs: 0 },
  { axis: "intensity", score: intensity, strengths: 0, repairs: 0 },
];
const scored: Overall = { aq: 82, grade: "A", tier: 4, withheld: [], missingAxes: [] };

describe("이력의 한 줄", () => {
  it("평가 시계의 시각, AQ, 기준 점수, 빠진 기준, 규칙 버전을 담는다", () => {
    const entry = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13, 1, 2, 3, 4));
    expect(entry).toEqual({ at: "2026-11-13T01:02:03.004Z", aq: 82, axes: { setup: 88, efficiency: 74, fit: 69, intensity: 97 }, missingAxes: [], rulesVersion: "1.0.0" });
  });

  it("점수를 못 낸 기준은 null이고 빠진 기준에 기준의 차례로 든다. AQ를 내지 않았으면 null이다", () => {
    const entry = historyEntry({ rulesVersion: "1.0.0", score: { aq: null, grade: null, tier: null, withheld: ["too_few_days"], missingAxes: ["setup", "fit"] }, axes: axes(null, 74, null, 97) }, Date.UTC(2026, 10, 13));
    expect(entry.aq).toBeNull();
    expect(entry.axes).toEqual({ setup: null, efficiency: 74, fit: null, intensity: 97 });
    expect(entry.missingAxes).toEqual(["setup", "fit"]);
  });
});

describe("이력에 덧붙이기", () => {
  it("폴더와 파일을 만들어 한 줄을 쓰고, 다음 점검은 줄을 더한다", async () => {
    const first = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13));
    const second = { ...first, at: "2026-11-14T00:00:00.000Z", aq: 83 };
    await appendHistory(dir, first);
    await appendHistory(dir, second);
    const text = await readFile(join(dir, HISTORY_FILE), "utf8");
    expect(text).toBe(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
  });

  it("앞 줄이 줄바꿈 없이 끝나 있으면 줄바꿈을 먼저 넣어 새 줄이 붙지 않게 한다", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, HISTORY_FILE), '{"at":"2026-11-12T00:00:00.000Z","aq":80');
    const entry = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13));
    await appendHistory(dir, entry);
    const lines = (await readFile(join(dir, HISTORY_FILE), "utf8")).split("\n");
    expect(lines).toEqual(['{"at":"2026-11-12T00:00:00.000Z","aq":80', JSON.stringify(entry), ""]);
  });

  it("빈 파일에는 줄바꿈 없이 바로 쓴다", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, HISTORY_FILE), "");
    const entry = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13));
    await appendHistory(dir, entry);
    expect(await readFile(join(dir, HISTORY_FILE), "utf8")).toBe(`${JSON.stringify(entry)}\n`);
  });
});

describe("이력의 줄 수(결과 화면의 회차)", () => {
  it("파일이 없으면 0이고, 덧붙인 줄을 센다. 빈 줄은 세지 않는다", async () => {
    expect(await historyCount(dir)).toBe(0);
    const entry = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13));
    await appendHistory(dir, entry);
    await appendHistory(dir, entry);
    expect(await historyCount(dir)).toBe(2);
    await writeFile(join(dir, HISTORY_FILE), `${JSON.stringify(entry)}\n\n${JSON.stringify(entry)}\n  \n`);
    expect(await historyCount(dir)).toBe(2);
  });
});
