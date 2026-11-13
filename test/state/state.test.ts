// 상태 파일 읽기·쓰기와 설치마다의 관측 기록 고치기를 시험한다(설계 18.1, 21.1의 다시 깐 것·상태를 지운 것)
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installKey, updateInstalls } from "../../src/state/observations.ts";
import { loadState, newState, reviveState, saveState, type StateFile } from "../../src/state/state.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let dir: string;
beforeEach(async () => {
  dir = join(await makeTemp(), ".chunsik-garage");
});
afterEach(async () => removeTemp(join(dir, "..")));

describe("상태 파일", () => {
  it("새 상태는 무작위 값을 가지고 관측 기록이 아직 없다", () => {
    const a = newState();
    const b = newState();
    expect(a.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(a.salt).not.toBe(b.salt);
    expect(a).toMatchObject({ schema: 1, lastCheckupAt: null, installs: null });
  });

  it("쓰고 다시 읽으면 같다. 임시 파일이 남지 않는다", async () => {
    const state: StateFile = {
      ...newState(),
      lastCheckupAt: "2026-11-13T01:00:00.000Z",
      installs: [
        { key: installKey(["b"]), firstSeen: "2026-10-01", appeared: false },
        { key: installKey(["a"]), firstSeen: "2026-11-10", appeared: true },
      ],
    };
    await saveState(dir, state);
    const loaded = await loadState(dir);
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.state.salt).toBe(state.salt);
      expect(loaded.state.installs!.map((r) => r.key)).toEqual([installKey(["a"]), installKey(["b"])]);
    }
    expect(await readdir(dir)).toEqual(["state.json"]);
  });

  it("없으면 missing, 풀리지 않거나 모양이 다르면 broken이다", async () => {
    expect(await loadState(dir)).toEqual({ status: "missing" });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "state.json"), "{not json");
    expect(await loadState(dir)).toEqual({ status: "broken" });
    await writeFile(join(dir, "state.json"), JSON.stringify({ schema: 1, salt: "xyz", lastCheckupAt: null, installs: null }));
    expect(await loadState(dir)).toEqual({ status: "broken" });
  });

  it("관측 기록의 날짜가 날짜 꼴이 아니면 모양이 다른 것이다", () => {
    const base = { schema: 1, salt: "0".repeat(64), lastCheckupAt: null };
    expect(reviveState({ ...base, installs: [{ key: "k", firstSeen: "11/13", appeared: true }] })).toBeNull();
    expect(reviveState({ ...base, installs: [{ key: "k", firstSeen: "2026-11-13", appeared: "yes" }] })).toBeNull();
    expect(reviveState({ ...base, installs: null })).toEqual({ ...base, installs: null });
  });

  it("저장한 파일에 무작위 값 말고 MCP 정의 원문이 들어갈 자리가 없다", async () => {
    await saveState(dir, newState());
    const text = await readFile(join(dir, "state.json"), "utf8");
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["installs", "lastCheckupAt", "salt", "schema"]);
  });
});

describe("관측 기록 고치기", () => {
  const A = installKey(["skill", "claude-code", "user", "a", "c:/h/.claude/skills/a"]);
  const B = installKey(["mcp", "claude-code", "user", "", "srv", "h1"]);

  it("첫 점검에서 이미 있던 설치는 오늘 날짜로 적되 새로 나타난 것이 아니다", () => {
    // 열쇠 차례로 낸다(B의 열쇠가 A의 열쇠보다 앞선다)
    expect(updateInstalls(null, [A, B, A], "2026-11-13")).toEqual([
      { key: B, firstSeen: "2026-11-13", appeared: false },
      { key: A, firstSeen: "2026-11-13", appeared: false },
    ]);
  });

  it("지난 점검에도 같은 정체로 있던 설치는 첫날이 그대로 남는다", () => {
    const previous = [{ key: A, firstSeen: "2026-10-01", appeared: false }];
    expect(updateInstalls(previous, [A], "2026-11-13")).toEqual(previous);
  });

  it("지난 점검에 없던 설치는 오늘 새로 나타난 것으로 적는다", () => {
    const previous = [{ key: A, firstSeen: "2026-10-01", appeared: false }];
    expect(updateInstalls(previous, [A, B], "2026-11-13")).toEqual([
      { key: B, firstSeen: "2026-11-13", appeared: true },
      { key: A, firstSeen: "2026-10-01", appeared: false },
    ]);
  });

  it("보이지 않은 설치는 지우고, 다시 나타나면 옛 날짜를 잇지 않고 새로 적는다", () => {
    const previous = [{ key: A, firstSeen: "2026-08-01", appeared: false }];
    const gone = updateInstalls(previous, [], "2026-11-01");
    expect(gone).toEqual([]);
    expect(updateInstalls(gone, [A], "2026-11-10")).toEqual([{ key: A, firstSeen: "2026-11-10", appeared: true }]);
  });

  it("관측 기록이 빈 목록이면 첫 점검이 아니다", () => {
    expect(updateInstalls([], [A], "2026-11-13")).toEqual([{ key: A, firstSeen: "2026-11-13", appeared: true }]);
  });

  it("정체의 한 부분이라도 다르면 다른 설치다", () => {
    const old = installKey(["mcp", "claude-code", "user", "", "srv", "h1"]);
    const changed = installKey(["mcp", "claude-code", "user", "", "srv", "h2"]);
    expect(updateInstalls([{ key: old, firstSeen: "2026-09-01", appeared: false }], [changed], "2026-11-13")).toEqual([
      { key: changed, firstSeen: "2026-11-13", appeared: true },
    ]);
  });

  it("읽지 못한 곳에 든 보이지 않는 설치의 기록은 고치지 않는다. 첫날과 새로 나타남 표시가 그대로 남는다(설계 18.1)", () => {
    const previous = [
      { key: B, firstSeen: "2026-10-01", appeared: true },
      { key: A, firstSeen: "2026-09-01", appeared: false },
    ];
    // B가 든 곳만 읽지 못했다. A는 든 곳을 읽었는데 보이지 않으므로 지운다
    expect(updateInstalls(previous, [], "2026-11-13", (key) => key === B)).toEqual([{ key: B, firstSeen: "2026-10-01", appeared: true }]);
  });

  it("남겨 둔 기록은 그 곳이 다시 읽힌 점검에서 평소대로 견준다", () => {
    const kept = updateInstalls([{ key: B, firstSeen: "2026-10-01", appeared: false }], [], "2026-11-01", () => true);
    // 같은 정체로 있으면 첫날이 이어지고, 없으면 그때 지운다
    expect(updateInstalls(kept, [B], "2026-11-16")).toEqual([{ key: B, firstSeen: "2026-10-01", appeared: false }]);
    expect(updateInstalls(kept, [], "2026-11-16")).toEqual([]);
  });

  it("이번에 보인 설치는 남길지를 묻지 않는다. 첫 점검에는 남길 기록이 없다", () => {
    const asked: string[] = [];
    const keep = (key: string): boolean => {
      asked.push(key);
      return true;
    };
    expect(updateInstalls([{ key: A, firstSeen: "2026-10-01", appeared: false }], [A, B], "2026-11-13", keep)).toHaveLength(2);
    expect(updateInstalls(null, [A], "2026-11-13", keep)).toEqual([{ key: A, firstSeen: "2026-11-13", appeared: false }]);
    expect(asked).toEqual([]);
  });

  it("남긴 기록과 이번에 본 기록을 함께 열쇠 차례로 낸다", () => {
    const previous = [{ key: A, firstSeen: "2026-09-01", appeared: false }];
    expect(updateInstalls(previous, [B], "2026-11-13", () => true)).toEqual([
      { key: B, firstSeen: "2026-11-13", appeared: true },
      { key: A, firstSeen: "2026-09-01", appeared: false },
    ]);
  });
});
