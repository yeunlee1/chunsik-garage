// 지켜보는 중인 MCP 서버를 판정할 수 있게 되는 날을 시험한다. 입력을 그대로 두고 이 점검을 저장한 뒤 날만 지날 때, serverEstablished가 처음 참이 되는 날과 같아야 한다(설계 11.3 E6의 ④, 12.1, 13.1)
import { describe, expect, it } from "vitest";
import { makeWindows, type LocalDate } from "../../src/adapters/common/dates.ts";
import { daysAfter } from "../../src/core/installs/age.ts";
import { restartDates, sessionListings } from "../../src/core/installs/listing.ts";
import { calledMcpNames } from "../../src/core/installs/signals.ts";
import { recordMap, serverEstablished, serverJudgeableFrom, type VerdictContext } from "../../src/core/installs/verdict.ts";
import { projectLookup } from "../../src/core/projects.ts";
import type { McpFact } from "../../src/scan/types.ts";
import { updateInstalls } from "../../src/state/observations.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { mcpServer, project } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

// 2026-11-13(서울)
const NOW = Date.UTC(2026, 10, 13, 3, 0);
const windows = makeWindows(NOW, "Asia/Seoul");
const TODAY = windows.today;
const lookup = projectLookup([project("/work/app")], { "/work/app": "/work/app" });
const DB = mcpServer("db");

interface Scene {
  records?: InstallRecord[] | null;
  sessions?: SummaryInput[];
}
const contextOn = (today: LocalDate, scene: Scene, records: InstallRecord[] | null): VerdictContext => {
  const summaries = (scene.sessions ?? []).map((input) => summary(input));
  return {
    day: { today, timeZone: "Asia/Seoul" },
    windows,
    records: recordMap(records),
    used: calledMcpNames(summaries, windows),
    listings: sessionListings(summaries, "mcp", { "/work/app": "/work/app" }, lookup),
    complete: true,
  };
};
const judgeFrom = (scene: Scene, server: McpFact = DB) => serverJudgeableFrom(server, contextOn(TODAY, scene, scene.records ?? null));
/**
 * 오늘 점검을 저장했다고 보고(관측 기록을 updateInstalls로 고친다) 날을 하루씩 넘기며 serverEstablished가 참이 되는 첫날을 찾는다.
 * 오늘은 고치기 전의 기록으로 본다. limit일 안에 참이 되지 않으면 null이다.
 */
const firstEstablished = (scene: Scene, server: McpFact = DB, limit = 60): LocalDate | null => {
  const before = scene.records ?? null;
  if (serverEstablished(server, contextOn(TODAY, scene, before))) return TODAY;
  const after = updateInstalls(before, [server.installKey!], TODAY);
  for (let n = 1; n <= limit; n++) {
    const day = daysAfter(TODAY, n);
    if (serverEstablished(server, contextOn(day, scene, after))) return day;
  }
  return null;
};
const record = (firstSeen: LocalDate, appeared = false, server: McpFact = DB): InstallRecord => ({ key: server.installKey!, firstSeen, appeared });
const reloadedOn = (date: LocalDate): SummaryInput => ({ initialMcpServers: ["db"], days: { "2026-10-01": { responses: 1, loadedMcpServers: ["db"] }, [date]: { responses: 1, loadedMcpServers: ["db"], reloadedMcpServers: ["db"] } } });
const startedWithout = (date: LocalDate | null): SummaryInput => ({ initialMcpServers: [], firstDate: date, days: date === null ? {} : { [date]: { responses: 1, loadedMcpServers: [] } } });
const loadedBefore: SummaryInput = { initialMcpServers: ["db"], days: { "2026-10-01": { responses: 1, loadedMcpServers: ["db"] } } };

describe("daysAfter", () => {
  it("날을 더하고 뺀다. 달과 해를 넘긴다", () => {
    expect(daysAfter("2026-11-13", 15)).toBe("2026-11-28");
    expect(daysAfter("2026-12-25", 10)).toBe("2027-01-04");
    expect(daysAfter("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysAfter("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("restartDates: ㉱의 근거가 든 날", () => {
  const dates = (sessions: SummaryInput[]) => restartDates(contextOn(TODAY, { sessions }, null).listings, ["db"], TODAY);
  it("한 세션 안에서 다시 실린 날 가운데 최근 14일 안의 것만 낸다", () => {
    expect(dates([reloadedOn("2026-11-05")])).toEqual(["2026-11-05"]);
    expect(dates([reloadedOn("2026-10-30")])).toEqual(["2026-10-30"]);
    expect(dates([reloadedOn("2026-10-29")])).toEqual([]);
  });
  it("그 이름이 실리던 작업 폴더에서 처음 목록에 없이 시작한 최근 세션의 시작한 날을 낸다. 시작한 날을 모르면 null이다", () => {
    expect(dates([loadedBefore, startedWithout("2026-11-08")])).toEqual(["2026-11-08"]);
    expect(dates([loadedBefore, startedWithout("2026-10-29")])).toEqual([]);
    expect(dates([loadedBefore, startedWithout(null)])).toBeNull();
  });
  it("근거가 없으면 빈 목록이다", () => {
    expect(dates([])).toEqual([]);
    expect(dates([loadedBefore])).toEqual([]);
  });
});

describe("serverJudgeableFrom: 판정을 시작할 수 있는 날", () => {
  const scenes: [string, Scene][] = [
    ["첫 점검(관측 기록이 아직 없다)", { records: null }],
    ["관측 기록의 첫날이 사흘 전", { records: [record("2026-11-10")] }],
    ["첫날이 14일 전(아직 14일 넘게 전이 아니다)", { records: [record("2026-10-30")] }],
    ["14일 안의 점검에 새로 나타났다", { records: [record("2026-11-08", true)] }],
    ["정체가 바뀌었다(관측 기록에 이 정체가 없다)", { records: [record("2026-09-01", false, mcpServer("db", { definitionHash: "old" }))] }],
    ["오래전부터 봤지만 최근에 다시 실렸다", { records: [record("2026-09-01")], sessions: [reloadedOn("2026-11-11")] }],
    ["다시 실린 날이 14일 전 경계", { records: [record("2026-09-01")], sessions: [reloadedOn("2026-10-30")] }],
    ["처음 목록에 없이 시작한 최근 세션", { records: [record("2026-09-01")], sessions: [loadedBefore, startedWithout("2026-11-12")] }],
    ["근거가 여럿이면 가장 늦은 날", { records: [record("2026-11-03")], sessions: [reloadedOn("2026-11-01"), loadedBefore, startedWithout("2026-11-09")] }],
    ["시계가 뒤로 가서 첫날이 오늘보다 뒤", { records: [record("2026-11-20")] }],
    ["작업 폴더가 없는 세션에서 다시 실렸다(한 세션 안의 몫은 작업 폴더와 상관없다)", { records: [record("2026-09-01")], sessions: [{ ...reloadedOn("2026-11-11"), cwd: null }] }],
    ["처음 목록을 모르는 최근 세션은 견주지 않는다", { records: [record("2026-11-10")], sessions: [loadedBefore, { initialMcpServers: null, firstDate: "2026-11-12", days: { "2026-11-12": { responses: 1, loadedMcpServers: [] } } }] }],
    ["시계가 뒤로 가서 다시 실린 날이 오늘보다 뒤", { records: [record("2026-09-01")], sessions: [reloadedOn("2026-11-20")] }],
  ];
  for (const [name, scene] of scenes) {
    it(`${name}: 날을 지나 보며 처음 판정할 수 있게 되는 날과 같다`, () => {
      const expected = firstEstablished(scene);
      expect(expected).not.toBeNull();
      expect(judgeFrom(scene)).toBe(expected);
    });
  }
  it("관측 기록의 첫날이 14일 넘게 전이고 근거가 없으면 오늘이 이미 지났다(지켜보는 중이 아니다)", () => {
    const scene = { records: [record("2026-10-29")] };
    expect(firstEstablished(scene)).toBe(TODAY);
    expect(judgeFrom(scene)! <= TODAY).toBe(true);
  });
  it("시작한 날을 모르는 세션이 근거이면 null이고, 날이 지나도 판정하지 못한다", () => {
    const scene = { records: [record("2026-09-01")], sessions: [loadedBefore, startedWithout(null)] };
    expect(judgeFrom(scene)).toBeNull();
    expect(firstEstablished(scene)).toBeNull();
  });
  it("정체가 없는 서버는 null이다", () => {
    expect(judgeFrom({ records: [] }, mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null }))).toBeNull();
  });
  it("첫 점검을 저장한 뒤 같은 날 다시 점검해도 날이 같다", () => {
    const saved = updateInstalls(null, [DB.installKey!], TODAY);
    expect(judgeFrom({ records: saved })).toBe(judgeFrom({ records: null }));
    const changed = [record("2026-09-01", false, mcpServer("db", { definitionHash: "old" }))];
    expect(judgeFrom({ records: updateInstalls(changed, [DB.installKey!], TODAY) })).toBe(judgeFrom({ records: changed }));
  });
});
