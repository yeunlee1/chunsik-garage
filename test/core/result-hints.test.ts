// 정밀 점검 단서 셋(전역 지침에 프로젝트가 여러 번 나온다, 여러 프로젝트 지침에 같은 줄이 되풀이된다, 전역 지침이 크다)을 시험한다. 점수에 넣지 않는 약한 신호다(설계 17)
import { describe, expect, it } from "vitest";
import { deepFiles, deepHints, LARGE_GLOBAL_TOKENS, MENTION_HINT_MIN, REPEATED_LINES_HINT_MIN } from "../../src/core/result/hints.ts";
import { codexProject, instructions, project } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const hintsOf = (tool: ClaudeToolInput) => deepHints(evaluationInput([claudeTool(tool)]));

describe("정밀 점검 단서", () => {
  it("기준값은 3번, 3줄, E4의 만점 기준(어림 4,000토큰)이다", () => {
    expect([MENTION_HINT_MIN, REPEATED_LINES_HINT_MIN, LARGE_GLOBAL_TOKENS]).toEqual([3, 3, 4000]);
  });

  it("Codex의 단서 셋을 Codex의 셋팅 사실로 낸다. 프로젝트의 경로는 입력 묶음의 프로젝트 목록에서 얻고, 스캐너가 읽지 않은 프로젝트의 지침은 보지 않는다(설계 「5단계 4부 계획 전 결정」 8번)", () => {
    const big = instructions({ chars: { ascii: 0, other: LARGE_GLOBAL_TOKENS + 1 }, lineHashes: ["a", "b", "c"] });
    const lines = instructions({ lineHashes: ["x", "y", "z", "a"] });
    const codex = codexTool({
      setup: {
        globalInstructions: big,
        globalMentions: { "/work/a": MENTION_HINT_MIN, "/work/b": MENTION_HINT_MIN - 1 },
        projects: [codexProject("/work/a", { instructions: lines }), codexProject("/work/b", { instructions: lines }), codexProject("/work/c", { scanned: false, instructions: lines })],
      },
    });
    const input = evaluationInput([codex], { projects: [project("C:/Work/A", { normRoot: "/work/a" }), project("C:/Work/B", { normRoot: "/work/b" })] });
    expect(deepHints(input)).toEqual([
      { kind: "global_mentions_project", tool: "codex", projects: [{ root: "C:/Work/A", mentions: MENTION_HINT_MIN }] },
      { kind: "repeated_project_lines", tool: "codex", lines: 3, projects: ["C:/Work/A", "C:/Work/B"] },
      { kind: "large_global_instructions", tool: "codex", tokens: LARGE_GLOBAL_TOKENS + 1 },
    ]);
  });

  it("두 도구의 전역 지침이 같은 원본이 아니고 겹치는 줄이 줄이 적은 쪽의 절반에 못 미치면 두 도구 단서를 낸다(설계 17, 「5단계 4부 계획 전 결정」 8번)", () => {
    const file = (realPath: string) => ({ path: realPath, realPath, bytes: 10, hasContent: true, sameAsGlobal: false });
    const both = (claude: Partial<Parameters<typeof instructions>[0]>, codex: Partial<Parameters<typeof instructions>[0]>) =>
      deepHints(evaluationInput([claudeTool({ setup: { globalInstructions: instructions(claude) } }), codexTool({ setup: { globalInstructions: instructions(codex) } })])).filter((hint) => hint.kind === "tools_instructions_differ");
    // 넷 가운데 하나만 겹친다(절반에 못 미친다)
    expect(both({ files: [file("/h/.claude/CLAUDE.md")], lineHashes: ["a", "b", "c", "d"] }, { files: [file("/h/.codex/AGENTS.md")], lineHashes: ["a", "x", "y", "z", "w"] })).toEqual([
      { kind: "tools_instructions_differ", shared: 1, lines: { "claude-code": 4, codex: 5 } },
    ]);
    // 정확히 절반은 못 미친 것이 아니다
    expect(both({ files: [file("/h/.claude/CLAUDE.md")], lineHashes: ["a", "b", "c", "d"] }, { files: [file("/h/.codex/AGENTS.md")], lineHashes: ["a", "b", "x", "y"] })).toEqual([]);
    // 실제 경로가 같은 파일을 나누면 같은 원본이다
    expect(both({ files: [file("/h/.claude/CLAUDE.md")], lineHashes: ["a", "b"] }, { files: [{ ...file("/h/.claude/CLAUDE.md"), path: "/h/.codex/AGENTS.md" }], lineHashes: ["x", "y"] })).toEqual([]);
    // 한 도구라도 줄 지문이 없으면 내지 않는다
    expect(both({ files: [file("/h/.claude/CLAUDE.md")], lineHashes: ["a"] }, { files: [], lineHashes: [] })).toEqual([]);
  });
  it("셋팅에 단서가 없으면 빈 목록이다", () => {
    expect(hintsOf({ setup: { projects: [project("/work/a")] } })).toEqual([]);
  });

  it("전역 지침에 3번 이상 나온 프로젝트를 경로 차례로 낸다", () => {
    const hints = hintsOf({ setup: { projects: [project("/work/b"), project("/work/a"), project("/work/c")], globalMentions: { "/work/b": 3, "/work/a": 5, "/work/c": 2 } } });
    expect(hints).toEqual([{ kind: "global_mentions_project", tool: "claude-code", projects: [{ root: "/work/a", mentions: 5 }, { root: "/work/b", mentions: 3 }] }]);
  });

  it("둘 이상의 프로젝트 지침에 나오는 줄이 3줄 이상이면 낸다. 전역 지침에도 있는 줄은 세지 않는다", () => {
    const shared = ["h1", "h2", "h3"];
    const setup = (globalLines: string[]) => ({
      globalInstructions: instructions({ lineHashes: globalLines }),
      projects: [project("/work/a", { instructions: instructions({ lineHashes: [...shared, "a-only"] }) }), project("/work/b", { instructions: instructions({ lineHashes: ["h1", "h2", "h3"] }) }), project("/work/c", { instructions: instructions({ lineHashes: ["c-only"] }) })],
    });
    expect(hintsOf({ setup: setup([]) })).toEqual([{ kind: "repeated_project_lines", tool: "claude-code", lines: 3, projects: ["/work/a", "/work/b"] }]);
    expect(hintsOf({ setup: setup(["h3"]) })).toEqual([]);
  });

  it("전역 지침의 어림 토큰이 4,000을 넘으면 낸다. 정확히 4,000은 넘지 않은 것이다", () => {
    expect(hintsOf({ setup: { globalInstructions: instructions({ chars: { ascii: 16000, other: 0 } }) } })).toEqual([]);
    expect(hintsOf({ setup: { globalInstructions: instructions({ chars: { ascii: 4, other: 4000 } }) } })).toEqual([{ kind: "large_global_instructions", tool: "claude-code", tokens: 4001 }]);
  });

  it("단서는 종류의 차례로 나온다", () => {
    const hints = hintsOf({
      setup: {
        globalInstructions: instructions({ chars: { ascii: 0, other: 5000 } }),
        globalMentions: { "/work/a": 4 },
        projects: [project("/work/a", { instructions: instructions({ lineHashes: ["x1", "x2", "x3"] }) }), project("/work/b", { instructions: instructions({ lineHashes: ["x1", "x2", "x3"] }) })],
      },
    });
    expect(hints.map((hint) => hint.kind)).toEqual(["global_mentions_project", "repeated_project_lines", "large_global_instructions"]);
  });
});

describe("정밀 점검의 파일 목록(7단계)", () => {
  it("내용이 있는 지침 파일을 낸다. 전역은 골라 두고 프로젝트는 고르지 않으며, 전역과 같은 파일과 두 도구가 같이 읽는 파일은 한 번만 낸다", () => {
    const file = (path: string, input: { hasContent?: boolean; sameAsGlobal?: boolean } = {}) => ({ path, realPath: path, bytes: 10, hasContent: true, sameAsGlobal: false, ...input });
    const claude = claudeTool({
      setup: {
        globalInstructions: instructions({ files: [file("/h/.claude/CLAUDE.md"), file("/h/.claude/empty.md", { hasContent: false })] }),
        projects: [project("/work/a", { instructions: instructions({ files: [file("/work/a/CLAUDE.md"), file("/work/a/link.md", { sameAsGlobal: true })] }) })],
      },
    });
    const codex = codexTool({ setup: { globalInstructions: instructions({ files: [file("/h/.codex/AGENTS.md"), file("/h/.claude/CLAUDE.md")] }) } });
    expect(deepFiles(evaluationInput([claude, codex]))).toEqual([
      { tool: "claude-code", scope: "global", project: null, path: "/h/.claude/CLAUDE.md", bytes: 10, selected: true },
      { tool: "claude-code", scope: "project", project: "/work/a", path: "/work/a/CLAUDE.md", bytes: 10, selected: false },
      { tool: "codex", scope: "global", project: null, path: "/h/.codex/AGENTS.md", bytes: 10, selected: true },
    ]);
  });
});
