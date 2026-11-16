// 정비 작업 기록과 잠금, 끊긴 작업 맞추기를 임시 상태 폴더로 시험한다(설계 16.4, 16.5의 3.1, 「6단계 2부 계획 전 결정」 6·7·9번)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fingerprintOf } from "../../src/tune/items.ts";
import { listWorks, loadWork, reconcileWorks, saveWork, takeLock, type TuneWork, type WorkItem } from "../../src/tune/work.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let stateDir: string;
beforeEach(async () => {
  root = await makeTemp();
  stateDir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

const item = (id: string, file: string, state: WorkItem["state"]): WorkItem => ({
  id,
  unit: "A1",
  tool: "claude-code",
  target: "idle",
  file,
  key: { kind: "json-entry", parent: "skillOverrides", name: "idle" },
  before: { present: false },
  after: { present: true, value: "off" },
  state,
  reason: null,
});
const work = (input: Partial<TuneWork> = {}): TuneWork => ({ workId: "2026-11-16T00-00-00-000Z-abc123", kind: "apply", planId: "2026-11-16T00-00-00-000Z-def456", of: null, createdAt: "2026-11-16T00:00:00.000Z", appVersion: "0.0.0", items: [], files: [], ...input });
const fp = (text: string): string => fingerprintOf(Buffer.from(text));

describe("작업 기록", () => {
  it("tune/<작업 ID>.json에 쓰고 읽는다. 목록은 작업 ID 꼴의 파일만 읽고 풀리지 않는 것은 건너뛴다", async () => {
    const one = work();
    await saveWork(stateDir, one);
    expect(await loadWork(stateDir, one.workId)).toEqual(one);
    await put(join(stateDir, "tune", "2026-11-16T00-00-00-000Z-bad000.json"), "{");
    await put(join(stateDir, "tune", "notes.json"), "{}");
    expect((await listWorks(stateDir)).map((x) => x.workId)).toEqual([one.workId]);
    expect(await loadWork(stateDir, "2026-11-16T00-00-00-000Z-fff999")).toBeNull();
    expect(await loadWork(stateDir, "../escape")).toBeNull();
  });
});

describe("잠금(16.5의 3.1)", () => {
  it("한 번에 하나만 잡는다. 끝난 프로세스가 남긴 잠금은 지우고 다시 잡고, 읽지 못하는 잠금은 살아 있는 것으로 본다", async () => {
    const first = await takeLock(stateDir);
    expect(first).not.toBeNull();
    expect(await takeLock(stateDir)).toBeNull();
    await first!.release();
    const again = await takeLock(stateDir);
    expect(again).not.toBeNull();
    await again!.release();
    await put(join(stateDir, "tune", "lock"), JSON.stringify({ pid: 424242, at: "x" }));
    expect(await takeLock(stateDir, () => true)).toBeNull();
    const stale = await takeLock(stateDir, () => false);
    expect(stale).not.toBeNull();
    await stale!.release();
    await put(join(stateDir, "tune", "lock"), "?");
    expect(await takeLock(stateDir, () => false)).toBeNull();
  });
});

describe("끊긴 작업 맞추기(16.4)", () => {
  it("예정·쓰는 중으로 남은 항목을 파일마다 실제 지문으로 맞추고, 끝난 항목은 그대로 둔다", async () => {
    const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((name) => join(root, `${name}.json`)) as [string, string, string, string, string];
    await put(a, "after");
    await put(b, "before");
    await put(c, "other");
    const unfinished = work({
      items: [item("1", a, "writing"), item("2", b, "writing"), item("3", c, "writing"), item("4", d, "planned"), item("5", e, "writing"), item("6", a, "written")],
      files: [
        { path: a, items: ["1", "6"], before: fp("before"), candidate: fp("after") },
        { path: b, items: ["2"], before: fp("before"), candidate: fp("after") },
        { path: c, items: ["3"], before: fp("before"), candidate: fp("after") },
        { path: d, items: ["4"], before: null, candidate: null },
        { path: e, items: ["5"], before: null, candidate: fp("new") },
      ],
    });
    await saveWork(stateDir, unfinished);
    expect(await reconcileWorks(stateDir)).toEqual([unfinished.workId]);
    const back = await loadWork(stateDir, unfinished.workId);
    expect(back!.items.map((x) => [x.id, x.state, x.reason])).toEqual([
      ["1", "written", "interrupted"],
      ["2", "not_applied", "interrupted"],
      ["3", "unknown", "interrupted"],
      ["4", "not_applied", "interrupted"],
      ["5", "not_applied", "interrupted"],
      ["6", "written", null],
    ]);
    expect(await reconcileWorks(stateDir)).toEqual([]);
  });
});
