// 셋팅 쪽 알림(읽지 못한 셋팅, 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제, 지금 PC에 없는 프로젝트)과 실행 입력 알림(상태 파일이 깨짐, AQ 보류), 알림 전체의 차례를 시험한다(설계 10, 11.3, 11.4, 12.2, 18.1, 20.1)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { NOTICE_KINDS, setupNotices } from "../../src/core/result/notices.ts";
import { HOME, instructions, plugin, project, skill } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
const noticesOf = (tool: ClaudeToolInput, run = { stateBroken: false }) => {
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return setupNotices(input, evaluate(input), run);
};

describe("셋팅 쪽 알림", () => {
  it("빠진 것이 없으면 알림이 없다", () => {
    expect(noticesOf({})).toEqual([]);
  });

  it("있는데 읽지 못한 셋팅을 무엇인지에 따라 나눠 알린다. 대상은 글자 차례이고 같은 것은 한 번이다", () => {
    const notices = noticesOf({
      setup: {
        claudeJson: "unparsable",
        settings: { user: "unreadable", managedParts: [{ path: "/etc/managed/b.json", status: "unparsable" }, { path: "/etc/managed/a.json", status: "ok" }], defaultMode: { user: null, managed: null } },
        pluginsFile: "unreadable",
        unreadableDirs: [`${HOME}/skills`],
        globalInstructions: instructions({ unreadable: [`${HOME}/CLAUDE.md`], unreadableDirs: [`${HOME}/rules`] }),
        hooks: { guards: [], userDisableAll: false, managedDisableAll: false, managedAllowManagedOnly: false, unreadablePlugins: [], unreadableSettings: ["/etc/managed/b.json"] },
        skills: [skill("locked", { readable: false }), skill("fine")],
        projects: [project("/work/app", { settingsStatus: "unparsable", localSettingsStatus: "unreadable", mcpJsonStatus: "unparsable", instructions: instructions({ unreadable: ["/work/app/CLAUDE.md"] }) })],
      },
    });
    expect(notices).toEqual([
      { kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "user_settings", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "managed_settings", targets: ["/etc/managed/b.json"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "project_settings", targets: ["/work/app"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "local_settings", targets: ["/work/app"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "mcp_json", targets: ["/work/app"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "plugins_file", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "skill_dirs", targets: [`${HOME}/skills`] },
      { kind: "setup_unreadable", tool: "claude-code", what: "instructions", targets: [`${HOME}/CLAUDE.md`, `${HOME}/rules`, "/work/app/CLAUDE.md"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "hook_settings", targets: ["/etc/managed/b.json"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "skill_files", targets: [`${HOME}/skills/locked`] },
    ]);
  });

  it("없는 파일은 읽지 못한 것이 아니다", () => {
    expect(noticesOf({ setup: { claudeJson: "missing", pluginsFile: "missing", projects: [project("/work/app", { settingsStatus: "missing", mcpJsonStatus: "missing" })] } })).toEqual([]);
  });

  it("켜져 있는데 세지 않은 플러그인을 까닭마다 알린다. 꺼진 플러그인은 알리지 않는다", () => {
    const notices = noticesOf({
      setup: {
        plugins: [
          plugin("unknown@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true }),
          // 설치 기록은 있는데 놓인 곳이 지금 없는 플러그인도 구성을 모르는 켜진 플러그인이다. 2부는 이것으로 스킬 끄기와 서버 막기 후보를 막는다
          plugin("gone@m", { exists: false, compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true }),
          plugin("off@m", { compositionKnown: false, enabled: false }),
          plugin("mcp@m", { mcpUnreadable: true }),
          plugin("hooks@m", { hooksUnreadable: true }),
          // 프로젝트 범위로 깔아 켠 것과 기본 켜짐으로 켠 것도 훅을 읽지 못하면 알린다. S2의 확인 훅을 찾는 목록에는 들지 않는다
          plugin("project-hooks@m", { hooksUnreadable: true, scopes: ["project"], projectRoots: ["/work/app"] }),
          plugin("skills@m"),
          plugin("off-skills@m", { enabled: false }),
          plugin("off-hooks@m", { enabled: false, hooksUnreadable: true }),
        ],
        pluginsWithoutInstall: ["ghost@m"],
        hooks: { guards: [], userDisableAll: false, managedDisableAll: false, managedAllowManagedOnly: false, unreadablePlugins: [], unreadableSettings: [] },
        unreadableSkillPlaces: { user: false, projects: [], plugins: ["skills@m", "off-skills@m"] },
      },
    });
    expect(notices).toEqual([
      { kind: "plugins_uncounted", tool: "claude-code", why: "composition_unknown", plugins: ["gone@m", "unknown@m"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "not_installed", plugins: ["ghost@m"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "skills_unreadable", plugins: ["skills@m"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "mcp_unreadable", plugins: ["mcp@m"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "hooks_unreadable", plugins: ["hooks@m", "project-hooks@m"] },
    ]);
  });

  it("플러그인 안의 문제는 점수에 세지 않고 알린다. 도구가 쓰는 파일(.claude.json)의 문제는 읽지 못한 셋팅으로 이미 알려 겹쳐 싣지 않는다", () => {
    const notices = noticesOf({
      setup: {
        claudeJson: "unparsable",
        problems: [
          { kind: "unparsable", owner: "tool", path: `${HOME}/../.claude.json`, realPath: null, place: null },
          { kind: "noFrontmatter", owner: "plugin", path: "/p/b/skills/x", realPath: null, place: null },
          { kind: "danglingLink", owner: "plugin", path: "/p/a/skills/y", realPath: null, place: null },
          { kind: "noFrontmatter", owner: "user", path: `${HOME}/skills/z`, realPath: null, place: "~/.claude/skills/z" },
        ],
      },
    });
    expect(notices.filter((notice) => notice.kind === "setup_problems_unscored")).toEqual([
      { kind: "setup_problems_unscored", tool: "claude-code", problems: [{ kind: "danglingLink", path: "/p/a/skills/y" }, { kind: "noFrontmatter", path: "/p/b/skills/x" }] },
    ]);
  });

  it("작업 폴더가 지금 PC에 없는 프로젝트를 알린다. 프로젝트로 보지 않는 폴더는 알리지 않는다", () => {
    const notices = noticesOf({ setup: { projects: [project("/work/gone", { exists: false }), project("/work/here"), project("/home/u", { excluded: true, exists: true })] } });
    expect(notices).toEqual([{ kind: "projects_gone", projects: ["/work/gone"] }]);
  });
});

describe("실행 입력 알림과 차례", () => {
  it("상태 파일이 깨져 새로 시작했으면 알린다", () => {
    expect(noticesOf({}, { stateBroken: true })).toEqual([{ kind: "state_reset" }]);
  });

  it("AQ를 내지 않았으면 까닭과 함께 알린다", () => {
    const input = evaluationInput([claudeTool({ sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 1 } } }] })]);
    expect(setupNotices(input, evaluate(input), { stateBroken: false })).toEqual([{ kind: "score_withheld", reasons: ["too_few_requests", "too_few_days"] }]);
  });

  it("알림의 차례는 점수에 닿는 것, 읽지 못한 것, 확인하지 못한 것이다", () => {
    expect(NOTICE_KINDS).toEqual([
      "score_withheld",
      "state_reset",
      "record_unreadable",
      "observation_incomplete",
      "setup_unreadable",
      "plugins_uncounted",
      "setup_problems_unscored",
      "projects_gone",
      "version_unverified",
      "weak_human_requests",
      "overlapping_responses",
      "unclassified",
      "orphan_subsessions",
    ]);
  });
});
