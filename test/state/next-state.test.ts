// 점검을 시작할 때 상태 파일을 여는 것과 점검 뒤에 상태(마지막 점검 시각, 설치마다의 관측 기록)를 고치는 것을 시험한다(설계 18.1, 20.1, 2단계 1부 계획의 깨진 상태 파일)
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexMcpInstallKey, codexSkillInstallKey, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { ClaudeSetupFacts, CodexSetupFacts } from "../../src/scan/types.ts";
import { nextState, openState } from "../../src/state/next-state.ts";
import { newState, saveState, type StateFile } from "../../src/state/state.ts";
import { CODEX_HOME, codexFacts, codexProject, facts, HOME, mcpServer, skill } from "../helpers/facts.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

describe("상태 열기", () => {
  it("상태 파일이 없으면 새 상태로 연다. 관측 기록이 없는 첫 점검이다", async () => {
    const opened = await openState(dir);
    expect(opened.fresh).toBe(true);
    expect(opened.broken).toBe(false);
    expect(opened.state).toMatchObject({ schema: 1, lastCheckupAt: null, installs: null });
    expect(opened.state.salt).toMatch(/^[0-9a-f]{64}$/);
  });

  it("상태 파일이 깨졌으면 새 상태로 열고 깨졌다고 알린다", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "state.json"), "{broken");
    const opened = await openState(dir);
    expect(opened).toMatchObject({ fresh: false, broken: true });
    expect(opened.state.installs).toBeNull();
  });

  it("상태 파일이 있으면 그대로 연다", async () => {
    const saved: StateFile = { ...newState(), lastCheckupAt: "2026-11-12T00:00:00.000Z", installs: [{ key: "k", firstSeen: "2026-11-01", appeared: true }] };
    await saveState(dir, saved);
    const opened = await openState(dir);
    expect(opened).toEqual({ state: saved, fresh: false, broken: false });
  });
});

// 관측 기록의 열쇠는 스캐너의 열쇠(skillInstallKey, mcpInstallKey)다. 시험 도우미가 사실에 넣는 열쇠는 글자가 달라서 쓰지 않는다
describe("점검 뒤의 상태", () => {
  const started = "2026-11-13T09:00:00.000Z";
  /** Claude Code의 셋팅 사실로 고친다. Codex에는 아무것도 없다 */
  const next = (state: StateFile, claude: ClaudeSetupFacts, today: string, at: string, codex: CodexSetupFacts = codexFacts()) => nextState(state, { claude, codex }, today, at);

  it("마지막 점검 시각을 적고 무작위 값은 그대로 둔다", () => {
    const state = newState();
    const after = next(state, facts(), "2026-11-13", started);
    expect(after.salt).toBe(state.salt);
    expect(after.lastCheckupAt).toBe(started);
    expect(after.installs).toEqual([]);
  });

  it("첫 점검에서 본 설치는 새로 나타난 것이 아니고, 다음 점검에서 처음 본 설치는 새로 나타난 것이다", () => {
    const first = next(newState(), facts({ skills: [skill("alpha")], mcpServers: [mcpServer("db")] }), "2026-11-01", started);
    expect(first.installs!.map((record) => record.appeared)).toEqual([false, false]);
    const second = next(first, facts({ skills: [skill("alpha"), skill("beta")], mcpServers: [mcpServer("db")] }), "2026-11-13", started);
    const beta = second.installs!.find((record) => record.key === skillInstallKey(skill("beta")))!;
    expect(beta).toEqual({ key: skillInstallKey(skill("beta")), firstSeen: "2026-11-13", appeared: true });
    const alpha = second.installs!.find((record) => record.key === skillInstallKey(skill("alpha")))!;
    expect(alpha).toEqual({ key: skillInstallKey(skill("alpha")), firstSeen: "2026-11-01", appeared: false });
  });

  it("정의를 읽지 못한 서버는 적지 않는다. 켜져 있는지와 상관없이 본 설치를 모두 적는다", () => {
    const after = next(newState(), facts({ skills: [skill("off", { enabled: false })], mcpServers: [mcpServer("cloud", { definitionHash: null }), mcpServer("db", { enabled: false })] }), "2026-11-13", started);
    expect(after.installs!.map((record) => record.key).sort()).toEqual([skillInstallKey(skill("off", { enabled: false })), mcpInstallKey(mcpServer("db", { enabled: false }))!].sort());
  });

  it("이번에 보이지 않은 설치의 기록은 지우되, 읽지 못한 곳에 든 설치의 기록은 남긴다", () => {
    const before = next(newState(), facts({ skills: [skill("gone"), skill("hidden")] }), "2026-11-01", started);
    const read = next(before, facts({ skills: [skill("hidden")] }), "2026-11-13", started);
    expect(read.installs!.map((record) => record.key)).toEqual([skillInstallKey(skill("hidden"))]);
    const unread = next(before, facts({ skills: [], unreadableDirs: [`${HOME}/skills`], unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }), "2026-11-13", started);
    expect(unread.installs).toEqual(before.installs);
  });

  describe("Codex 설치(설계 「5단계 3부 계획 전 결정」 12번)", () => {
    const codexSkill = (name: string) => {
      const fact = skill(name, { path: `/home/u/.agents/skills/${name}`, realPath: `/home/u/.agents/skills/${name}/SKILL.md` });
      return { ...fact, installKey: codexSkillInstallKey(fact) };
    };
    const codexServer = (name: string) => {
      const fact = mcpServer(name);
      return { ...fact, installKey: codexMcpInstallKey(fact) };
    };

    it("두 도구의 설치를 함께 적는다. Codex의 열쇠는 도구 칸이 codex다", () => {
      const after = nextState(newState(), { claude: facts({ skills: [skill("alpha")] }), codex: codexFacts({ skills: [codexSkill("beta")], mcpServers: [codexServer("db")] }) }, "2026-11-13", started);
      expect(after.installs!.map((record) => JSON.parse(record.key)[1]).sort()).toEqual(["claude-code", "codex", "codex"]);
      expect(after.installs!.every((record) => !record.appeared)).toBe(true);
    });

    it("읽지 못한 곳에 든 것인지는 열쇠의 도구로 가린다. Codex의 설정을 읽지 못하면 Codex 서버의 기록만 남는다", () => {
      const before = nextState(newState(), { claude: facts({ skills: [skill("gone")] }), codex: codexFacts({ mcpServers: [codexServer("db")] }) }, "2026-11-01", started);
      const after = nextState(before, { claude: facts(), codex: codexFacts({ config: "unparsable" }) }, "2026-11-13", started);
      expect(after.installs).toEqual(before.installs!.filter((record) => JSON.parse(record.key)[1] === "codex"));
      // Codex를 다 읽었으면 보이지 않는 Codex 서버의 기록도 지운다
      expect(nextState(before, { claude: facts(), codex: codexFacts() }, "2026-11-13", started).installs).toEqual([]);
    });

    it("Claude Code의 읽지 못한 곳은 Codex 설치의 기록을 남기지 않는다", () => {
      const before = nextState(newState(), { claude: facts(), codex: codexFacts({ skills: [codexSkill("beta")] }) }, "2026-11-01", started);
      const claudeUnread = facts({ unreadableDirs: [`${HOME}/skills`], unreadableSkillPlaces: { user: true, projects: [], plugins: [] } });
      expect(nextState(before, { claude: claudeUnread, codex: codexFacts() }, "2026-11-13", started).installs).toEqual([]);
      // Codex의 사용자 스킬 폴더를 읽지 못하면 남긴다
      const codexUnread = codexFacts({ unreadableDirs: [`${CODEX_HOME}/skills`], unreadableSkillPlaces: { user: true, projects: [], plugins: [] } });
      expect(nextState(before, { claude: facts(), codex: codexUnread }, "2026-11-13", started).installs).toEqual(before.installs);
    });

    it("앞 점검에 Claude Code의 기록만 있었으면 이미 깔려 있던 Codex 설치도 새로 나타난 것으로 적힌다(설계 27절)", () => {
      const before = nextState(newState(), { claude: facts({ skills: [skill("alpha")] }), codex: codexFacts() }, "2026-11-01", started);
      const after = nextState(before, { claude: facts({ skills: [skill("alpha")] }), codex: codexFacts({ projects: [codexProject("/work/a")], mcpServers: [codexServer("db")] }) }, "2026-11-13", started);
      expect(after.installs!.find((record) => record.key === codexServer("db").installKey)).toEqual({ key: codexServer("db").installKey, firstSeen: "2026-11-13", appeared: true });
    });
  });
});
