// 세션 요약의 빈 칸 만들기, 이름 기록, 열쇠 차례 고정, 지문, 캐시에서 꺼낸 값 되살리기를 시험한다
import { describe, expect, it } from "vitest";
import { nameRecord, sortedRecord } from "../../src/adapters/common/canonical.ts";
import { fnv1a64 } from "../../src/adapters/common/hash.ts";
import {
  canonicalDay,
  emptyDay,
  emptyHookCounts,
  emptySkillSignalCounts,
  emptyToolCounts,
  reviveSummary,
  type SessionSummary,
} from "../../src/adapters/types.ts";

const PROTO_NAMES: string[] = ["constructor", "__proto__", "toString"];

describe("fnv1a64", () => {
  it("같은 글은 같은 지문, 다른 글은 다른 지문이고 16자리다", () => {
    expect(fnv1a64("msg_1")).toBe(fnv1a64("msg_1"));
    expect(fnv1a64("msg_1")).not.toBe(fnv1a64("msg_2"));
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("한글")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("nameRecord, sortedRecord, canonicalDay", () => {
  it("열쇠를 사전순으로 세운다", () => {
    expect(Object.keys(sortedRecord({ b: 1, a: 2, c: 3 }))).toEqual(["a", "b", "c"]);
  });
  it("기본 속성과 같은 이름도 보통 열쇠이고 JSON에 그대로 남는다", () => {
    const record = nameRecord<number>();
    PROTO_NAMES.forEach((name, i) => {
      record[name] = (record[name] ?? 0) + i + 1;
    });
    expect(Object.keys(sortedRecord(record))).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.keys(JSON.parse(JSON.stringify(record)) as object).sort()).toEqual(["__proto__", "constructor", "toString"]);
  });
  it("넣은 차례가 달라도 같은 JSON이 나온다", () => {
    const one = emptyDay();
    one.models.zeta = 1;
    one.models.alpha = 2;
    const two = emptyDay();
    two.models.alpha = 2;
    two.models.zeta = 1;
    expect(JSON.stringify(canonicalDay(one))).toBe(JSON.stringify(canonicalDay(two)));
  });
  it("빈 칸은 모두 0이고 목록은 비어 있으며 연결 실패는 거짓이다", () => {
    const day = emptyDay();
    expect(day.humanRequests).toBe(0);
    expect(day.tokens).toEqual({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 });
    expect(day.loadedSkills).toEqual([]);
    expect(day.reloadedMcpServers).toEqual([]);
    expect(day.mcpConnectionFailure).toBe(false);
  });
});

/** 모든 칸에 기본값이 아닌 값을 넣은 요약. 되살리기가 칸 하나라도 빠뜨리면 시험이 잡는다. */
function fullSummary(): SessionSummary {
  const day = emptyDay();
  day.humanRequests = 2;
  day.weakHumanRequests = 1;
  day.nonHumanInputs.meta = 1;
  day.permissionModes.plan = 2;
  day.responses = 3;
  day.tokens = { input: 1, cacheRead: 2, cacheWrite: 3, output: 4, thinking: 5 };
  day.models["claude-a"] = 3;
  day.efforts.high = 2;
  day.unknownEffort = 1;
  day.tools.Bash = { ...emptyToolCounts(), calls: 2, results: 1, errors: 1, deniedByUser: 1 };
  day.unknownDenialKinds["brand-new"] = 1;
  day.autoCompactions = 1;
  day.unknownCompactions = 1;
  day.lengthStops = 1;
  day.interruptedTurns = 1;
  day.subagentCalls = 1;
  day.mcpConnectionFailure = true;
  day.skillSignals.review = { ...emptySkillSignalCounts(), tool: 1, slash: 1 };
  day.mcpCalls.srv = 2;
  day.mcpAttributions.srv = 1;
  day.hooks.PreToolUse = { ...emptyHookCounts(), runs: 2, failures: 1, unclassifiedBlocks: 1 };
  day.loadedSkills = ["review"];
  day.loadedMcpServers = ["srv"];
  day.reloadedSkills = ["review"];
  day.reloadedMcpServers = ["srv"];
  for (const name of PROTO_NAMES) day.models[name] = 1;
  return {
    tool: "claude-code",
    sessionId: "s1",
    kind: "main",
    parentSessionId: null,
    cwd: "C:/work",
    version: "2.1.300",
    firstDate: "2026-11-10",
    days: { "2026-11-11": canonicalDay(day) },
    instructionChars: { ascii: 3, other: 1 },
    initialSkills: ["review"],
    initialMcpServers: [],
    missing: { lines: 9, brokenLines: 1, tailFragments: 1, tooLongLines: 1, unconfirmedTypes: sortedRecord({ system: 1 }) },
    firstResponseIdHashes: ["0123456789abcdef"],
    notes: { syntheticResponses: 1, responsesWithoutId: 1, undatedLines: 1, unknownHookKinds: sortedRecord({ hook_new: 1 }) },
  };
}

describe("reviveSummary", () => {
  it("JSON으로 갔다 온 요약을 글자 하나 다르지 않게 되살린다", () => {
    const summary = fullSummary();
    const back = reviveSummary(JSON.parse(JSON.stringify(summary)));
    expect(JSON.stringify(back)).toBe(JSON.stringify(summary));
    expect(back).toEqual(summary);
  });
  it("날짜 칸의 열쇠를 하나도 빠뜨리지 않고, 기본 속성과 같은 이름도 숫자로 되살린다", () => {
    const back = reviveSummary(JSON.parse(JSON.stringify(fullSummary())))!;
    const day = back.days["2026-11-11"]!;
    expect(Object.keys(day)).toEqual(Object.keys(emptyDay()));
    for (const name of PROTO_NAMES) expect(day.models[name]).toBe(1);
  });
  it("모양이 다르면 null이다", () => {
    const base = JSON.parse(JSON.stringify(fullSummary())) as Record<string, any>;
    const cell = base.days["2026-11-11"];
    const broken: unknown[] = [
      {},
      null,
      [],
      { ...base, kind: "other" },
      { ...base, days: null },
      { ...base, days: { "11-11": cell } },
      { ...base, days: { "2026-11-11": { ...cell, tools: { Bash: { ...cell.tools.Bash, calls: "2" } } } } },
      { ...base, days: { "2026-11-11": { ...cell, loadedSkills: [1] } } },
      { ...base, days: { "2026-11-11": { ...cell, humanRequests: undefined } } },
      { ...base, missing: { ...base.missing, lines: undefined } },
      { ...base, notes: { ...base.notes, unknownHookKinds: null } },
      { ...base, firstDate: "yesterday" },
      { ...base, initialSkills: [1] },
      { ...base, initialMcpServers: undefined },
    ];
    for (const value of broken) expect(reviveSummary(value)).toBeNull();
  });
});
