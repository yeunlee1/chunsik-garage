// 첨부와 system 줄(실린 이름, 스킬 신호, MCP 연결 실패, 훅, 지침 크기, 압축)을 줄 해석에서 시험한다(설계 9.5, 21.1 반례)
import { describe, expect, it } from "vitest";
import { assistant, attachment, parseLines, system, user } from "../../helpers/claude-lines.ts";

const D1 = "2026-11-11";
const D2 = "2026-11-12";
const t = (date: string, second = 0): string => `${date}T10:00:${String(second).padStart(2, "0")}Z`;

describe("실린 이름", () => {
  it("처음 목록에 변경분을 더하고, 날짜마다 그날 실려 있던 이름을 적는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a", "b"] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: false, names: ["c"] }),
      assistant({ id: "m1", at: t(D2) }),
    ]);
    expect(s.days[D1]!.loadedSkills).toEqual(["a", "b", "c"]);
    expect(s.days[D2]!.loadedSkills).toEqual(["a", "b", "c"]);
  });
  it("새 처음 목록은 앞 목록을 갈아 치운다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a"] }),
      attachment(t(D2), { type: "skill_listing", isInitial: true, names: ["b"] }),
    ]);
    expect(s.days[D1]!.loadedSkills).toEqual(["a"]);
    expect(s.days[D2]!.loadedSkills).toEqual(["b"]);
  });
  it("MCP 서버 이름은 더한 것과 뺀 것을 따른다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "mcp_instructions_delta", addedNames: ["x", "y"], removedNames: [] }),
      attachment(t(D2), { type: "mcp_instructions_delta", addedNames: [], removedNames: ["x"] }),
    ]);
    expect(s.days[D1]!.loadedMcpServers).toEqual(["x", "y"]);
    expect(s.days[D2]!.loadedMcpServers).toEqual(["y"]);
  });
});

describe("다시 실린 이름", () => {
  it("같은 날 목록에서 빠졌다가 다시 실린 스킬과 MCP 서버를 그날 다시 실린 이름으로 적는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a", "b"] }),
      attachment(t(D1), { type: "mcp_instructions_delta", addedNames: ["x"], removedNames: [] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: true, names: ["b"] }),
      attachment(t(D1, 2), { type: "skill_listing", isInitial: false, names: ["a"] }),
      attachment(t(D1, 3), { type: "mcp_instructions_delta", addedNames: [], removedNames: ["x"] }),
      attachment(t(D1, 4), { type: "mcp_instructions_delta", addedNames: ["x"], removedNames: [] }),
    ]);
    expect(s.days[D1]!.reloadedSkills).toEqual(["a"]);
    expect(s.days[D1]!.reloadedMcpServers).toEqual(["x"]);
    expect(s.days[D1]!.loadedSkills).toEqual(["a", "b"]);
  });
  it("다른 날 다시 실리면 그 날짜에 적고, 계속 실려 있던 이름은 적지 않는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a", "b"] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: true, names: ["b"] }),
      attachment(t(D2), { type: "skill_listing", isInitial: true, names: ["a", "b"] }),
    ]);
    expect(s.days[D1]!.reloadedSkills).toEqual([]);
    expect(s.days[D2]!.reloadedSkills).toEqual(["a"]);
  });
  it("제거 표시만 먼저 있던 서버가 뒤에 더해져도 다시 실린 이름이다. 더하기만 있으면 아니다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "mcp_instructions_delta", addedNames: [], removedNames: ["srv", "srv"] }),
      attachment(t(D1, 1), { type: "mcp_instructions_delta", addedNames: ["srv", "other"], removedNames: [] }),
    ]);
    expect(s.days[D1]!.loadedMcpServers).toEqual(["other", "srv"]);
    expect(s.days[D1]!.reloadedMcpServers).toEqual(["srv"]);
  });
  it("세션의 처음 목록을 남긴다. 스킬은 첫 isInitial 목록, MCP 서버는 첫 응답 줄 바로 앞에 실려 있던 이름이다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["b", "a"] }),
      attachment(t(D1), { type: "mcp_instructions_delta", addedNames: ["x"], removedNames: [] }),
      assistant({ id: "m1", at: t(D1, 1) }),
      attachment(t(D1, 2), { type: "mcp_instructions_delta", addedNames: ["late"], removedNames: [] }),
      attachment(t(D1, 3), { type: "skill_listing", isInitial: true, names: ["c"] }),
    ]);
    expect(s.initialSkills).toEqual(["a", "b"]);
    expect(s.initialMcpServers).toEqual(["x"]);
    expect(s.days[D1]!.loadedMcpServers).toEqual(["late", "x"]);
    expect(parseLines([attachment(t(D1), { type: "mcp_instructions_delta", addedNames: ["x"], removedNames: [] })]).initialMcpServers).toBeNull();
    const bare = parseLines([assistant({ id: "m1", at: t(D1) })]);
    expect(bare.initialSkills).toBeNull();
    expect(bare.initialMcpServers).toEqual([]);
  });
  it("처음 목록에 없다가 뒤에 실린 이름과 처음부터 있던 이름은 요약이 다르다", () => {
    const fromStart = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: false, names: [] }),
    ]);
    const later = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: [] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: false, names: ["review"] }),
    ]);
    expect(fromStart.days[D1]!.loadedSkills).toEqual(later.days[D1]!.loadedSkills);
    expect(fromStart.initialSkills).toEqual(["review"]);
    expect(later.initialSkills).toEqual([]);
  });
  it("처음 목록과 같은 목록이 다시 와도 다시 실린 것이 아니다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a"] }),
      attachment(t(D2), { type: "skill_listing", isInitial: true, names: ["a"] }),
    ]);
    expect(s.days[D1]!.reloadedSkills).toEqual([]);
    expect(s.days[D2]!.reloadedSkills).toEqual([]);
  });
});

describe("스킬 신호", () => {
  it("스킬 주입은 injected로 센다", () => {
    const s = parseLines([attachment(t(D1), { type: "invoked_skills", skills: [{ name: "a", path: "/x", content: "..." }] })]);
    expect(s.days[D1]!.skillSignals.a!.injected).toBe(1);
  });
  it("출처가 사람인 스킬 명령 줄(<command-message>가 먼저)도 사람 요청이자 슬래시 명령 신호다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      user({ at: t(D1, 1), content: "<command-message>review is running</command-message>\n<command-name>/review</command-name>", origin: "human" }),
    ]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    expect(s.days[D1]!.skillSignals.review!.slash).toBe(1);
  });
  it("슬래시 명령 신호는 실린 스킬의 명령 줄에서만 센다. 실린 목록에 없는 이름과 스킬 내용을 넣은 isMeta 줄은 세지 않는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      user({ at: t(D1, 1), content: "<command-message>other is running</command-message>\n<command-name>/other</command-name>", origin: "human" }),
      user({ at: t(D1, 2), content: "<command-name>/review</command-name>" }),
      user({ at: t(D1, 3), content: "<command-message>review</command-message>\n<command-name>review</command-name>\n<skill-format>true</skill-format>", extra: { isMeta: true } }),
    ]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    expect(s.days[D1]!.skillSignals).toEqual({ review: { tool: 0, attribution: 0, slash: 1, injected: 0 } });
  });
  it("하위 세션과 isSidechain 줄의 슬래시 명령도 신호 3이다. 사람 요청은 아니다", () => {
    const lines = (extra: Record<string, unknown>) => [
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      user({ at: t(D1, 1), content: "<command-name>/review</command-name>", extra }),
    ];
    const sub = parseLines(lines({}), { kind: "sub" });
    const sidechain = parseLines(lines({ isSidechain: true }));
    for (const s of [sub, sidechain]) {
      expect(s.days[D1]!.skillSignals.review!.slash).toBe(1);
      expect(s.days[D1]!.humanRequests).toBe(0);
    }
  });
  it("슬래시 명령은 그 세션에 실린 스킬의 이름일 때만 신호다(응답이 뒤따랐는지는 따지지 않는다)", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      user({ at: t(D1, 1), content: "<command-name>/review</command-name>" }),
      user({ at: t(D1, 2), content: "<command-name>/clear</command-name>" }),
    ]);
    expect(s.days[D1]!.skillSignals.review!.slash).toBe(1);
    expect(s.days[D1]!.skillSignals.clear).toBeUndefined();
  });
});

describe("MCP 연결 실패와 훅", () => {
  it("뒤쪽 첨부에만 실패가 있어도 그 날짜에 연결 실패로 적고, 인증 대기와 연결 중은 실패가 아니다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "deferred_tools_delta", failedMcpServers: [], needsAuthMcpServers: ["g"], pendingMcpServers: ["p"] }),
      attachment(t(D2), { type: "deferred_tools_delta", failedMcpServers: ["srv"] }),
    ]);
    expect(s.days[D1]!.mcpConnectionFailure).toBe(false);
    expect(s.days[D2]!.mcpConnectionFailure).toBe(true);
  });
  it("훅은 실행과 실패를 사건별로 세고, 실패 표지가 없는 막음은 따로 세며, 딸린 첨부와 stop_hook_summary는 세지 않는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "hook_success", hookEvent: "PreToolUse", exitCode: 0 }),
      attachment(t(D1), { type: "hook_additional_context", hookEvent: "PreToolUse" }),
      attachment(t(D1), { type: "hook_non_blocking_error", hookEvent: "PreToolUse" }),
      attachment(t(D1), { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: { blockingError: "policy says no; timed out waiting", command: "x" } }),
      attachment(t(D1), { type: "hook_brand_new", hookEvent: "Stop" }),
      system(t(D1), "stop_hook_summary"),
    ]);
    expect(s.days[D1]!.hooks).toEqual({ PreToolUse: { runs: 2, failures: 1, unclassifiedBlocks: 1 } });
    expect(s.notes.unknownHookKinds).toEqual({ hook_brand_new: 1 });
  });
  it("실패 표지가 명령에만 있거나 오류 글이 없는 막음은 가릴 수 없는 막음이고, 오류 글은 요약에 남지 않는다", () => {
    const secret = "unique-hook-text-7f3a9";
    const s = parseLines([
      attachment(t(D1), { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: { blockingError: `denied ${secret}`, command: "echo blocking because onFailure is" } }),
      attachment(t(D1), { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: { command: "x" } }),
      attachment(t(D1), { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: 42 }),
    ]);
    expect(s.days[D1]!.hooks).toEqual({ PreToolUse: { runs: 0, failures: 0, unclassifiedBlocks: 3 } });
    expect(JSON.stringify(s)).not.toContain(secret);
  });
  it("실패 표지가 있는 막음은 실행이면서 실패다", () => {
    const s = parseLines([
      attachment(t(D1), {
        type: "hook_blocking_error",
        hookEvent: "PreToolUse",
        blockingError: { blockingError: 'PreToolUse:Bash hook error: [cmd]: failed; blocking because onFailure is "block"', command: "cmd" },
      }),
      attachment(t(D1), {
        type: "hook_blocking_error",
        hookEvent: "PreToolUse",
        blockingError: "blocking because Git Bash wasn't found, so only exit code 0 or 2 counts as this hook's verdict.",
      }),
    ]);
    expect(s.days[D1]!.hooks).toEqual({ PreToolUse: { runs: 2, failures: 2, unclassifiedBlocks: 0 } });
  });
});

describe("지침 크기와 압축", () => {
  it("처음 실린 지침의 글자를 ASCII와 그 밖으로 나눠 센다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "instructions", files: [{ path: "/a", type: "user", content: "ab가" }, { path: "/b", type: "project", content: "c" }] }),
      attachment(t(D1, 1), { type: "instructions", files: [{ path: "/a", type: "user", content: "zzzz" }] }),
    ]);
    expect(s.instructionChars).toEqual({ ascii: 3, other: 1 });
  });
  it("자동 압축만 세고, 손으로 시킨 압축은 세지 않으며, 계기를 모르면 따로 센다", () => {
    const s = parseLines([
      system(t(D1), "compact_boundary", { compactMetadata: { trigger: "auto" } }),
      system(t(D1, 1), "compact_boundary", { compactMetadata: { trigger: "manual" } }),
      system(t(D1, 2), "compact_boundary", {}),
    ]);
    expect(s.days[D1]!.autoCompactions).toBe(1);
    expect(s.days[D1]!.unknownCompactions).toBe(1);
  });
});
