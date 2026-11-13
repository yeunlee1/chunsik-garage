// 설치 판정의 바탕을 시험한다. 14일과 30일의 경계, 사용 신호를 이름으로 모으기, 실린 목록으로 보는 「계속 실려 있었나」와 「최근에 새로 시작됐나」(설계 9.5, 11.3 E5의 ④·㉮·㉱)
import { describe, expect, it } from "vitest";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { daysBefore, msOlderThan, olderThan } from "../../src/core/installs/age.ts";
import { loadedSince, restartedRecently, sessionListings } from "../../src/core/installs/listing.ts";
import { anyIn, calledMcpNames, usedSkillNames } from "../../src/core/installs/signals.ts";
import { projectLookup } from "../../src/core/projects.ts";
import { project } from "../helpers/facts.ts";
import { summary, type DayInput, type SummaryInput } from "../helpers/summaries.ts";

// 2026-11-13 12:00(서울). 점수 구간은 10-15부터, 수집 구간은 10-10부터다. 14일 넘게 전은 10-29와 그 앞, 30일 넘게 전은 10-13과 그 앞이다
const NOW = Date.UTC(2026, 10, 13, 3, 0);
const windows = makeWindows(NOW, "Asia/Seoul");
const TODAY = windows.today;

describe("날짜의 경계", () => {
  it("오늘을 0일로 세어 며칠 앞선 날인지 센다. 오늘보다 뒤의 날은 음수다", () => {
    expect(daysBefore(TODAY, "2026-11-13")).toBe(0);
    expect(daysBefore(TODAY, "2026-10-29")).toBe(15);
    expect(daysBefore(TODAY, "2025-11-13")).toBe(365);
    expect(daysBefore(TODAY, "2026-11-20")).toBe(-7);
  });
  it("14일 넘게 전은 오늘보다 15일 이상 앞선 날이다. 오늘과 그 앞 14일, 오늘보다 뒤의 날은 14일 안이다", () => {
    expect(olderThan(TODAY, "2026-10-29", 14)).toBe(true);
    expect(olderThan(TODAY, "2026-10-30", 14)).toBe(false);
    expect(olderThan(TODAY, "2026-11-13", 14)).toBe(false);
    expect(olderThan(TODAY, "2027-01-01", 14)).toBe(false);
  });
  it("30일 넘게 전은 오늘보다 31일 이상 앞선 날이다", () => {
    expect(olderThan(TODAY, "2026-10-13", 30)).toBe(true);
    expect(olderThan(TODAY, "2026-10-14", 30)).toBe(false);
  });
  it("시각은 평가 시계의 시간대로 날짜를 얻어 견준다. 같은 날 안의 시각 차이는 결과를 바꾸지 않는다", () => {
    const day = { today: TODAY, timeZone: "Asia/Seoul" };
    // 서울의 10-29 23:59와 10-30 00:00
    expect(msOlderThan(day, Date.UTC(2026, 9, 29, 14, 59), 14)).toBe(true);
    expect(msOlderThan(day, Date.UTC(2026, 9, 29, 15, 0), 14)).toBe(false);
    // 같은 시각도 시간대가 다르면 날짜가 다르다
    expect(msOlderThan({ today: TODAY, timeZone: "UTC" }, Date.UTC(2026, 9, 29, 15, 0), 14)).toBe(true);
  });
});

describe("사용 신호를 이름으로 모으기", () => {
  const cell = (input: DayInput): DayInput => ({ responses: 1, ...input });
  it("스킬은 네 신호 가운데 하나라도 있는 날의 이름이다. 점수 구간과 수집 구간을 따로 모으고 주 세션과 하위 세션을 합친다", () => {
    const main = summary({
      days: {
        "2026-10-09": cell({ skillSignals: { before: { tool: 1 } } }),
        "2026-10-12": cell({ skillSignals: { early: { slash: 1 } } }),
        "2026-10-15": cell({ skillSignals: { tooled: { tool: 2 }, zero: {} } }),
        "2026-11-13": cell({ skillSignals: { attributed: { attribution: 1 }, slashed: { slash: 1 } } }),
      },
    });
    const sub = summary({ kind: "sub", days: { "2026-11-01": cell({ skillSignals: { "plugin:injected": { injected: 3 } } }) } });
    const used = usedSkillNames([main, sub], windows);
    expect([...used.inScore].sort()).toEqual(["attributed", "plugin:injected", "slashed", "tooled"]);
    expect([...used.inCollect].sort()).toEqual(["attributed", "early", "plugin:injected", "slashed", "tooled"]);
  });
  it("MCP 서버는 호출한 도구 이름의 서버 자리와 응답의 귀속 가운데 하나라도 있으면 부른 것이다", () => {
    const main = summary({
      days: {
        "2026-10-12": cell({ mcpCalls: { old_server: 4 } }),
        "2026-11-10": cell({ mcpCalls: { db: 1, zero: 0 }, mcpAttributions: { "claude.ai Mail": 2 } }),
      },
    });
    const called = calledMcpNames([main], windows);
    expect([...called.inScore].sort()).toEqual(["claude.ai Mail", "db"]);
    expect([...called.inCollect].sort()).toEqual(["claude.ai Mail", "db", "old_server"]);
  });
  it("기록의 이름이 설치의 이름 꼴 가운데 하나와 글자 그대로 같으면 그 설치의 것이다", () => {
    const names = new Set(["claude_ai_Mail", "db"]);
    expect(anyIn(["claude.ai Mail", "claude_ai_Mail"], names)).toBe(true);
    expect(anyIn(["DB"], names)).toBe(false);
    expect(anyIn([], names)).toBe(false);
  });
});

describe("실린 목록 읽기", () => {
  const projects = [project("/work/app", { cwds: ["/work/app", "/work/app/web"] }), project("/work/lib")];
  const normalized = { "/work/app": "/work/app", "C:\\Work\\App\\web": "/work/app/web", "/work/lib": "/work/lib", "/elsewhere": "/elsewhere" };
  const lookup = projectLookup(projects, normalized);
  const listings = (sessions: SummaryInput[], kind: "skill" | "mcp" = "skill") => sessionListings(sessions.map((s) => summary(s)), kind, normalized, lookup);
  /** 그날 응답이 있고 그 스킬들이 실려 있던 날 */
  const on = (...loadedSkills: string[]): DayInput => ({ responses: 1, loadedSkills });
  const session = (days: Record<string, DayInput>, input: SummaryInput = {}): SummaryInput => ({ initialSkills: [], days, ...input });

  describe("sessionListings", () => {
    it("주 세션만 담고, 작업 폴더의 정규화한 경로와 묶인 프로젝트, 처음 목록, 날짜마다 실린 이름과 다시 실린 이름을 낸다", () => {
      const out = listings([
        { cwd: "C:\\Work\\App\\web", initialSkills: ["a"], days: { "2026-11-10": { responses: 2, loadedSkills: ["a", "b"], reloadedSkills: ["b"] } } },
        { cwd: "/elsewhere", initialSkills: null, days: {} },
        { cwd: null, days: {} },
        { kind: "sub", initialSkills: ["sub-only"], days: { "2026-11-10": on("sub-only") } },
      ]);
      expect(out).toHaveLength(3);
      expect(out[0]).toMatchObject({ cwdKey: "/work/app/web", projectRoot: "/work/app", firstDate: "2026-11-10" });
      expect([...out[0]!.initial!]).toEqual(["a"]);
      expect(out[0]!.days.map((d) => [d.date, d.responses, [...d.loaded], [...d.reloaded]])).toEqual([["2026-11-10", 2, ["a", "b"], ["b"]]]);
      expect([...out[0]!.everLoaded].sort()).toEqual(["a", "b"]);
      expect(out[1]).toMatchObject({ cwdKey: "/elsewhere", projectRoot: null, initial: null, firstDate: null });
      expect(out[2]).toMatchObject({ cwdKey: null, projectRoot: null });
    });
    it("MCP 서버는 서버의 목록을 본다", () => {
      const out = listings([{ initialSkills: ["skill"], initialMcpServers: ["db"], days: { "2026-11-10": { responses: 1, loadedSkills: ["skill"], loadedMcpServers: ["db", "mail"], reloadedMcpServers: ["mail"] } } }], "mcp");
      expect([...out[0]!.initial!]).toEqual(["db"]);
      expect([...out[0]!.days[0]!.loaded]).toEqual(["db", "mail"]);
      expect([...out[0]!.days[0]!.reloaded]).toEqual(["mail"]);
    });
  });

  describe("loadedSince: 14일 넘게 전의 날부터 오늘까지 주 세션이 있던 날마다 빠짐없이 실려 있었나", () => {
    const since = (sessions: SummaryInput[], names = ["x"], projectRoot: string | null = null) => loadedSince(listings(sessions), names, projectRoot, windows);

    it("14일 넘게 전의 실린 날이 있고 그날부터 빠진 날이 없으면 채운다", () => {
      expect(since([session({ "2026-10-29": on("x"), "2026-11-05": on("x"), "2026-11-13": on("x") })])).toBe(true);
      expect(since([session({ "2026-10-20": on("x") })])).toBe(true);
    });
    it("실린 날이 14일 안에만 있으면 채우지 못한다", () => {
      expect(since([session({ "2026-10-30": on("x"), "2026-11-13": on("x") })])).toBe(false);
      expect(since([])).toBe(false);
    });
    it("빠진 날이 있어도 그 뒤에 14일 넘게 전의 실린 날이 있으면 채운다. 다시 깐 지 14일이 넘은 것이다", () => {
      expect(since([session({ "2026-10-15": on("x"), "2026-10-20": on(), "2026-10-25": on("x"), "2026-11-13": on("x") })])).toBe(true);
    });
    it("가장 늦은 빠진 날 뒤의 실린 날이 14일 안에만 있으면 채우지 못한다", () => {
      expect(since([session({ "2026-10-15": on("x"), "2026-10-29": on(), "2026-10-30": on("x") })])).toBe(false);
      expect(since([session({ "2026-10-15": on("x"), "2026-11-13": on() })])).toBe(false);
    });
    it("그날 응답이 있는 세션 모두에 실려 있어야 실린 날이다. 한 세션에라도 없으면 빠진 날이다", () => {
      const both = [session({ "2026-10-20": on("x"), "2026-11-12": on("x") }), session({ "2026-11-12": on("other") })];
      expect(since(both)).toBe(false);
      expect(since([session({ "2026-10-20": on("x"), "2026-11-12": on("x") }), session({ "2026-11-12": on("x", "other") })])).toBe(true);
    });
    it("처음 목록을 모르는 세션은 견주지 않는다. 그런 세션만 있는 날은 보지 않는 날이다", () => {
      const unknown = session({ "2026-11-12": on() }, { initialSkills: null });
      expect(since([session({ "2026-10-20": on("x") }), unknown])).toBe(true);
      expect(since([session({ "2026-10-20": on("x") }, { initialSkills: null })])).toBe(false);
    });
    it("응답이 없는 날과 수집 구간 밖의 날은 보지 않는다", () => {
      expect(since([session({ "2026-10-20": on("x"), "2026-11-12": { responses: 0, humanRequests: 3 } })])).toBe(true);
      expect(since([session({ "2026-10-09": on("x"), "2026-11-13": on("x") })])).toBe(false);
      expect(since([session({ "2026-10-20": { responses: 0, loadedSkills: ["x"] } })])).toBe(false);
    });
    it("이름 꼴 가운데 하나만 실려 있어도 실린 것이다", () => {
      expect(since([session({ "2026-10-20": on("folder-name") })], ["declared-name", "folder-name"])).toBe(true);
    });
    it("프로젝트 범위의 위치는 작업 폴더가 그 프로젝트로 묶이는 주 세션하고만 견준다. 하위 폴더에서 연 세션도 든다", () => {
      const inApp = session({ "2026-10-20": on("x"), "2026-11-12": on("x") }, { cwd: "C:\\Work\\App\\web" });
      const inLib = session({ "2026-11-12": on() }, { cwd: "/work/lib" });
      expect(since([inApp, inLib], ["x"], "/work/app")).toBe(true);
      expect(since([inApp, inLib], ["x"], null)).toBe(false);
      expect(since([inApp, inLib], ["x"], "/work/lib")).toBe(false);
    });
  });

  describe("restartedRecently: 최근 14일 안에 새로 시작됐다는 근거가 세션 기록에 있나", () => {
    const restarted = (sessions: SummaryInput[], names = ["x"]) => restartedRecently(listings(sessions), names, TODAY);

    it("한 세션 안에서 빠졌다가 14일 안에 다시 실렸으면 근거다. 14일 넘게 전의 것은 아니다", () => {
      expect(restarted([session({ "2026-10-30": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["x"] } }, { initialSkills: ["x"] })])).toBe(true);
      expect(restarted([session({ "2026-10-29": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["x"] } }, { initialSkills: ["x"] })])).toBe(false);
      expect(restarted([session({ "2026-11-10": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["other"] } }, { initialSkills: ["x"] })])).toBe(false);
    });
    it("그 이름이 실리던 작업 폴더에서 최근 14일 안에 시작한 주 세션의 처음 목록에 없었으면 근거다", () => {
      const before = session({ "2026-10-20": on("x") }, { initialSkills: ["x"] });
      const recent = session({ "2026-11-05": on() }, { initialSkills: ["other"] });
      expect(restarted([before, recent])).toBe(true);
      // 세션 도중에 실린 것도 처음 목록에는 없던 것이다
      expect(restarted([session({ "2026-11-05": on("x") }, { initialSkills: [] })])).toBe(true);
    });
    it("14일보다 전에 시작한 세션의 처음 목록에 없던 것은 근거가 아니다", () => {
      const loaded = session({ "2026-11-01": on("x") }, { initialSkills: ["x"] });
      const old = session({ "2026-10-29": on(), "2026-11-10": on() }, { initialSkills: [] });
      expect(restarted([loaded, old])).toBe(false);
    });
    it("그 작업 폴더의 주 세션에 한 번도 실린 적이 없는 이름은 이 몫으로 보지 않는다", () => {
      expect(restarted([session({ "2026-11-05": on("other") }, { initialSkills: ["other"] })])).toBe(false);
    });
    it("다른 작업 폴더의 세션 때문에 걸리지 않는다. 같은 폴더인지는 정규화한 경로로 본다", () => {
      const inApp = session({ "2026-10-20": on("x") }, { cwd: "/work/app", initialSkills: ["x"] });
      const inLib = session({ "2026-11-05": on() }, { cwd: "/work/lib", initialSkills: [] });
      expect(restarted([inApp, inLib])).toBe(false);
      const web = session({ "2026-10-20": on("x") }, { cwd: "C:\\Work\\App\\web", initialSkills: ["x"] });
      const sameWeb = session({ "2026-11-05": on() }, { cwd: "C:\\Work\\App\\web", initialSkills: [] });
      expect(restarted([web, sameWeb])).toBe(true);
    });
    it("처음 목록을 모르는 세션은 견주지 않는다. 빈 목록인 세션은 견준다", () => {
      const loaded = session({ "2026-10-20": on("x") }, { initialSkills: ["x"] });
      expect(restarted([loaded, session({ "2026-11-05": on() }, { initialSkills: null })])).toBe(false);
      expect(restarted([loaded, session({ "2026-11-05": on() }, { initialSkills: [] })])).toBe(true);
    });
    it("시작한 날을 모르는 세션은 최근 14일 안에 시작한 것으로 본다. 모르면 미루는 쪽이다", () => {
      const loaded = session({ "2026-10-20": on("x") }, { initialSkills: ["x"] });
      expect(restarted([loaded, session({}, { initialSkills: [] })])).toBe(true);
      // 날짜를 몰라도 처음 목록에 있었으면 빠진 것이 아니고, 처음 목록을 모르면 견주지 않는다
      expect(restarted([loaded, session({}, { initialSkills: ["x"] })])).toBe(false);
      expect(restarted([loaded, session({}, { initialSkills: null })])).toBe(false);
      // 보는 것은 요약에 적힌 "기록이 있는 가장 이른 날짜"이지 날짜 칸이 있는지가 아니다. 날짜 칸이 오래돼도 그 날짜를 모르면 최근이고, 날짜 칸이 없어도 그 날짜가 오래됐으면 최근이 아니다
      expect(restarted([loaded, session({ "2026-10-20": on() }, { initialSkills: [], firstDate: null })])).toBe(true);
      expect(restarted([loaded, session({}, { initialSkills: [], firstDate: "2026-10-20" })])).toBe(false);
    });
    it("작업 폴더가 없는 세션은 어느 묶음에도 넣지 않는다. 그런 세션끼리도 한 묶음이 아니다", () => {
      const loaded = session({ "2026-10-20": on("x") }, { cwd: null, initialSkills: ["x"] });
      const recent = session({ "2026-11-05": on() }, { cwd: null, initialSkills: [] });
      expect(restarted([loaded, recent])).toBe(false);
      // 작업 폴더가 없는 세션 하나가 처음에는 없다가 뒤에 실은 것도 묶음이 없어서 보지 않는다
      expect(restarted([session({ "2026-11-05": on("x") }, { cwd: null, initialSkills: [] })])).toBe(false);
      // 작업 폴더가 있는 묶음에 실린 적이 있어도, 작업 폴더가 없는 세션의 처음 목록은 그 묶음과 견주지 않는다
      expect(restarted([session({ "2026-10-20": on("x") }, { initialSkills: ["x"] }), recent])).toBe(false);
      // 한 세션 안에서 빠졌다가 다시 실린 것은 작업 폴더와 상관없이 근거다
      expect(restarted([session({ "2026-11-05": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["x"] } }, { cwd: null, initialSkills: ["x"] })])).toBe(true);
    });
    it("이름 꼴 가운데 하나라도 처음 목록에 있으면 실려 있던 것이다", () => {
      const loaded = session({ "2026-10-20": on("folder-name") }, { initialSkills: ["folder-name"] });
      const recent = session({ "2026-11-05": on("folder-name") }, { initialSkills: ["folder-name"] });
      expect(restarted([loaded, recent], ["declared-name", "folder-name"])).toBe(false);
    });
  });
});
