// 설치 하나의 판정을 시험한다. 지금 설치가 14일 넘게 전부터 있었는지(㉮~㉳)와 스킬 위치·MCP 서버의 「썼다, 안 쓴 것이 확인됨, 쓰는지 모름」(설계 11.3 E5·E6, 21.1)
import { describe, expect, it } from "vitest";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { sessionListings } from "../../src/core/installs/listing.ts";
import { calledMcpNames, usedSkillNames } from "../../src/core/installs/signals.ts";
import { recordMap, serverEstablished, serverVerdict, skillEstablished, skillVerdict, type VerdictContext } from "../../src/core/installs/verdict.ts";
import { projectLookup } from "../../src/core/projects.ts";
import type { McpFact, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { mcpServer, project, skill } from "../helpers/facts.ts";
import { summary, type DayInput, type SummaryInput } from "../helpers/summaries.ts";

// 2026-11-13(서울). 14일 넘게 전은 10-29와 그 앞, 30일 넘게 전은 10-13과 그 앞이다
const NOW = Date.UTC(2026, 10, 13, 3, 0);
const windows = makeWindows(NOW, "Asia/Seoul");
const LONG_AGO = Date.UTC(2026, 8, 1);
const LAST_WEEK = Date.UTC(2026, 10, 6);
const lookup = projectLookup([project("/work/app")], { "/work/app": "/work/app" });

interface ContextInput {
  sessions?: SummaryInput[];
  records?: InstallRecord[] | null;
  complete?: boolean;
}
const context = (kind: "skill" | "mcp", input: ContextInput = {}): VerdictContext => {
  const summaries = (input.sessions ?? []).map((s) => summary(s));
  return {
    day: { today: windows.today, timeZone: "Asia/Seoul" },
    windows,
    records: recordMap(input.records ?? null),
    used: kind === "skill" ? usedSkillNames(summaries, windows) : calledMcpNames(summaries, windows),
    listings: sessionListings(summaries, kind, { "/work/app": "/work/app" }, lookup),
    complete: input.complete ?? true,
  };
};
const record = (install: { installKey: string | null }, firstSeen: string, appeared = false): InstallRecord => ({ key: install.installKey!, firstSeen, appeared });
/** 10-20부터 어제까지 그 스킬이 실려 있던 주 세션 */
const loaded = (name: string, extra: Record<string, DayInput> = {}): SummaryInput => ({
  initialSkills: [name],
  days: { "2026-10-20": { responses: 1, loadedSkills: [name] }, "2026-11-12": { responses: 1, loadedSkills: [name] }, ...extra },
});
const old = (name: string, input: Partial<SkillFact> = {}): SkillFact => skill(name, { createdMs: LONG_AGO, ...input });

describe("스킬 위치: 지금 설치가 14일 넘게 전부터 있었나", () => {
  const established = (fact: SkillFact, input: ContextInput = {}) => skillEstablished(fact, context("skill", input));

  it("㉮ 14일 넘게 전부터 빠짐없이 실려 있었고 폴더를 만든 시각도 14일 넘게 앞서면 채운다. 첫 점검에서도 된다", () => {
    expect(established(old("x"), { sessions: [loaded("x")] })).toBe(true);
  });
  it("㉮는 폴더를 만든 시각을 알아야 쓴다. 링크로 걸었으면 링크 자체와 그 대상을 다 본다", () => {
    expect(established(skill("x", { createdMs: null }), { sessions: [loaded("x")] })).toBe(false);
    const link = { isLink: true, realPath: "/store/x" };
    expect(established(old("x", { ...link, targetCreatedMs: LONG_AGO }), { sessions: [loaded("x")] })).toBe(true);
    expect(established(old("x", { ...link, targetCreatedMs: null }), { sessions: [loaded("x")] })).toBe(false);
  });
  it("㉯ 상태 파일에 같은 정체의 기록이 있고 그 첫날이 14일 넘게 앞서면 채운다. 목록에 실리지 않는 스킬은 이것으로만 채운다", () => {
    const quiet = skill("quiet", { listed: false, createdMs: null });
    expect(established(quiet, { records: [record(quiet, "2026-10-29")] })).toBe(true);
    expect(established(quiet, { records: [record(quiet, "2026-10-30")] })).toBe(false);
  });
  it("증거가 없으면 채우지 못한다", () => {
    expect(established(old("x"))).toBe(false);
    expect(established(old("x"), { sessions: [{ initialSkills: ["x"], days: { "2026-11-10": { responses: 1, loadedSkills: ["x"] } } }] })).toBe(false);
  });
  it("프로젝트 범위의 위치는 그 프로젝트로 묶이는 세션의 기록으로 ㉮를 본다", () => {
    const inProject = old("x", { scope: "project", projectRoot: "/work/app", path: "/work/app/.claude/skills/x" });
    expect(established(inProject, { sessions: [{ ...loaded("x"), cwd: "/work/app" }] })).toBe(true);
    expect(established(inProject, { sessions: [{ ...loaded("x"), cwd: "/work/other" }] })).toBe(false);
  });
  it("㉰ 폴더나 링크를 만든 시각이 14일 안이면 다른 증거가 있어도 채우지 못한다", () => {
    const fresh = skill("x", { createdMs: LAST_WEEK });
    expect(established(fresh, { sessions: [loaded("x")], records: [record(fresh, "2026-09-01")] })).toBe(false);
    const relinked = old("x", { isLink: true, realPath: "/store/x", targetCreatedMs: LAST_WEEK });
    expect(established(relinked, { records: [record(relinked, "2026-09-01")] })).toBe(false);
  });
  it("㉱ 세션 기록에 최근 14일 안에 새로 시작됐다는 근거가 있으면 채우지 못한다", () => {
    const fact = old("x");
    const reloaded = loaded("x", { "2026-11-05": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["x"] } });
    expect(established(fact, { sessions: [reloaded], records: [record(fact, "2026-09-01")] })).toBe(false);
    const absentAtStart: SummaryInput = { initialSkills: [], days: { "2026-11-05": { responses: 1, loadedSkills: [] } } };
    expect(established(fact, { sessions: [loaded("x"), absentAtStart], records: [record(fact, "2026-09-01")] })).toBe(false);
  });
  it("㉲ 지난 점검에는 없다가 14일 안의 점검에 새로 나타났으면 채우지 못한다. 새로 나타난 지 14일이 넘었으면 ㉯로 채운다", () => {
    const fact = old("x");
    expect(established(fact, { sessions: [loaded("x")], records: [record(fact, "2026-11-01", true)] })).toBe(false);
    expect(established(fact, { records: [record(fact, "2026-10-01", true)] })).toBe(true);
  });
  it("㉳ 관측 기록은 있는데 이 정체의 기록이 없으면 지난 점검과 정체가 다른 것이다. 첫 점검에는 이 근거가 없다", () => {
    const fact = old("x");
    const other = old("other");
    expect(established(fact, { sessions: [loaded("x")], records: [record(other, "2026-09-01")] })).toBe(false);
    expect(established(fact, { sessions: [loaded("x")], records: [] })).toBe(false);
    expect(established(fact, { sessions: [loaded("x")], records: null })).toBe(true);
  });
  it("같은 날 다시 점검해도 같다. 오늘 적은 날짜는 증거가 되지 못하고, 첫 점검에서 이미 있던 것은 새로 나타난 것이 아니다", () => {
    const fact = old("x");
    const first = established(fact, { sessions: [loaded("x")], records: null });
    const again = established(fact, { sessions: [loaded("x")], records: [record(fact, windows.today, false)] });
    expect([first, again]).toEqual([true, true]);
  });
});

describe("MCP 서버: 지금 설치가 14일 넘게 전부터 있었나", () => {
  const established = (fact: McpFact, input: ContextInput = {}) => serverEstablished(fact, context("mcp", input));
  const listed = (name: string): SummaryInput => ({ initialMcpServers: [name], days: { "2026-10-20": { responses: 1, loadedMcpServers: [name] }, "2026-11-12": { responses: 1, loadedMcpServers: [name] } } });

  it("㉯로만 채운다. 세션 기록에 이름이 오래 실려 있었어도 첫 점검에서는 채우지 못한다", () => {
    const db = mcpServer("db");
    expect(established(db, { sessions: [listed("db")] })).toBe(false);
    expect(established(db, { records: [record(db, "2026-10-29")] })).toBe(true);
    expect(established(db, { records: [record(db, "2026-10-30")] })).toBe(false);
  });
  it("정의가 달라지면 다른 정체라서 앞의 기록이 이어지지 않는다", () => {
    const before = mcpServer("db", { definitionHash: "v1" });
    const after = mcpServer("db", { definitionHash: "v2" });
    expect(established(after, { records: [record(before, "2026-09-01")] })).toBe(false);
  });
  it("㉱와 ㉲도 본다. 이름이 빠졌다가 다시 나타났거나 14일 안의 점검에 새로 나타났으면 채우지 못한다", () => {
    const db = mcpServer("db");
    const reconnected: SummaryInput = { initialMcpServers: ["db"], days: { "2026-11-05": { responses: 1, loadedMcpServers: ["db"], reloadedMcpServers: ["db"] } } };
    expect(established(db, { sessions: [reconnected], records: [record(db, "2026-09-01")] })).toBe(false);
    expect(established(db, { records: [record(db, "2026-11-01", true)] })).toBe(false);
  });
  it("정의를 읽지 못해 정체가 없는 서버는 채우지 못한다", () => {
    expect(established(mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null }), { records: [] })).toBe(false);
  });
});

describe("스킬 위치의 판정", () => {
  const verdict = (fact: SkillFact, input: ContextInput = {}, claudeJson: "ok" | "missing" | "unparsable" | "unreadable" = "ok") => skillVerdict(fact, claudeJson, context("skill", input));
  const signal = (date: string, name: string): SummaryInput => ({ kind: "sub", days: { [date]: { responses: 1, skillSignals: { [name]: { attribution: 1 } } } } });

  it("신호 1~4 가운데 하나라도 점수 구간에 있으면 썼다. 새로 깔았는지, 관측이 빠졌는지, 집계를 읽었는지는 따지지 않는다", () => {
    const fact = skill("x", { createdMs: LAST_WEEK });
    expect(verdict(fact, { sessions: [signal("2026-10-15", "x")], complete: false }, "unreadable")).toBe("used");
    expect(verdict(skill("x", { recordNames: ["declared", "x"] }), { sessions: [signal("2026-11-13", "declared")] })).toBe("used");
  });
  it("다섯 조건을 모두 채우면 안 쓴 것이 확인됨이다", () => {
    expect(verdict(old("x"), { sessions: [loaded("x")] })).toBe("unused");
  });
  it("① 신호가 수집 구간에 있으면(점수 구간 바로 앞) 쓰는지 모름이다", () => {
    expect(verdict(old("x"), { sessions: [loaded("x"), signal("2026-10-12", "x")] })).toBe("unknown");
    expect(verdict(old("x"), { sessions: [loaded("x"), signal("2026-10-09", "x")] })).toBe("unused");
  });
  it("② 도구의 집계가 없거나 마지막 사용이 30일 넘게 전이어야 한다. 시각을 모르는 집계는 30일 안으로 본다", () => {
    const sessions = [loaded("x")];
    expect(verdict(old("x", { usageLastUsedMs: Date.UTC(2026, 9, 13, 14, 59) }), { sessions })).toBe("unused");
    expect(verdict(old("x", { usageLastUsedMs: Date.UTC(2026, 9, 13, 15, 0) }), { sessions })).toBe("unknown");
    expect(verdict(old("x", { usageUndated: true }), { sessions })).toBe("unknown");
    expect(verdict(old("x", { usageLastUsedMs: LONG_AGO, usageUndated: true }), { sessions })).toBe("unknown");
  });
  it("② 집계가 든 파일을 읽지 못했거나 그 파일이 없으면 집계가 없는 것이 아니라 모르는 것이다", () => {
    for (const status of ["missing", "unparsable", "unreadable"] as const) expect(verdict(old("x"), { sessions: [loaded("x")] }, status)).toBe("unknown");
  });
  it("③ 스킬 사용 관측이 빠짐없지 않으면 쓰는지 모름이다", () => {
    expect(verdict(old("x"), { sessions: [loaded("x")], complete: false })).toBe("unknown");
  });
  it("④ 새로 깐 것, 다시 깐 것, 언제 깔았는지 모르는 것은 쓰는지 모름이다", () => {
    expect(verdict(skill("x", { createdMs: LAST_WEEK }), { sessions: [loaded("x")] })).toBe("unknown");
    expect(verdict(skill("x", { createdMs: null }), { sessions: [loaded("x")] })).toBe("unknown");
    expect(verdict(old("x"))).toBe("unknown");
  });
  it("⑤ 훅이 내용을 넣어 주는 스킬은 쓰는지 모름이다. 점수 구간에 쓴 신호가 있어도 썼다로 세지 않는다", () => {
    expect(verdict(old("x", { hookProvided: true }), { sessions: [loaded("x")] })).toBe("unknown");
    expect(verdict(old("x", { hookProvided: true }), { sessions: [loaded("x"), signal("2026-11-13", "x")] })).toBe("unknown");
    expect(verdict(skill("x", { createdMs: LAST_WEEK, hookProvided: true }), { sessions: [signal("2026-10-15", "x")] })).toBe("unknown");
  });
  it("머리말의 이름을 모르는 스킬은 안 쓴 것이 확인될 수 없다. 폴더 이름으로 쓴 신호가 있으면 썼다", () => {
    // 이름 값을 읽지 못했거나 SKILL.md를 읽지 못했으면 기록의 이름 꼴에 폴더 이름만 든다. 머리말 이름으로 남은 신호와 집계를 이 위치에 잇지 못한다
    for (const input of [{ nameUnreadable: true }, { readable: false }]) {
      expect(verdict(old("x", input), { sessions: [loaded("x")] })).toBe("unknown");
      expect(verdict(old("x", input), { sessions: [loaded("x"), signal("2026-11-13", "x")] })).toBe("used");
    }
  });
});

describe("MCP 서버의 판정", () => {
  const verdict = (fact: McpFact, input: ContextInput = {}) => serverVerdict(fact, context("mcp", input));
  const call = (date: string, input: DayInput): SummaryInput => ({ days: { [date]: { responses: 1, ...input } } });
  const watched = (fact: McpFact): InstallRecord[] => [record(fact, "2026-09-01")];

  it("점수 구간에 부른 기록이 있으면 불렀다. 호출한 도구 이름의 서버 자리와 응답의 귀속 가운데 하나에라도 이름 꼴이 있으면 된다", () => {
    const mail = mcpServer("my.mail", { recordNames: ["my.mail", "my_mail"] });
    expect(verdict(mail, { sessions: [call("2026-11-10", { mcpCalls: { my_mail: 1 } })] })).toBe("used");
    expect(verdict(mail, { sessions: [call("2026-10-15", { mcpAttributions: { "my.mail": 1 } })], complete: false })).toBe("used");
  });
  it("수집 구간에 부른 기록이 없고, 관측이 빠짐없고, 같은 정의를 14일 넘게 지켜봤으면 안 부른 것이 확인됨이다", () => {
    const db = mcpServer("db");
    expect(verdict(db, { records: watched(db) })).toBe("unused");
    expect(verdict(db, { records: watched(db), sessions: [call("2026-10-12", { mcpCalls: { db: 1 } })] })).toBe("unknown");
    expect(verdict(db, { records: watched(db), complete: false })).toBe("unknown");
  });
  it("첫 점검에서는 부른 기록이 없는 서버가 모두 쓰는지 모름이다", () => {
    expect(verdict(mcpServer("db"))).toBe("unknown");
  });
  it("정의를 읽지 못하는 서버는 늘 쓰는지 모름이다. 부른 기록이 있어도 같다", () => {
    const remote = mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null, recordNames: ["claude.ai Mail", "claude_ai_Mail"] });
    expect(verdict(remote, { records: [] })).toBe("unknown");
    expect(verdict(remote, { sessions: [call("2026-11-10", { mcpCalls: { claude_ai_Mail: 3 } })] })).toBe("unknown");
  });
});
