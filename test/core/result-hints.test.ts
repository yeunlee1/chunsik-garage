// 정밀 점검 단서 셋(전역 지침에 프로젝트가 여러 번 나온다, 여러 프로젝트 지침에 같은 줄이 되풀이된다, 전역 지침이 크다)을 시험한다. 점수에 넣지 않는 약한 신호다(설계 17)
import { describe, expect, it } from "vitest";
import { deepHints, LARGE_GLOBAL_TOKENS, MENTION_HINT_MIN, REPEATED_LINES_HINT_MIN } from "../../src/core/result/hints.ts";
import { instructions, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const hintsOf = (tool: ClaudeToolInput) => deepHints(evaluationInput([claudeTool(tool)]));

describe("정밀 점검 단서", () => {
  it("기준값은 3번, 3줄, E4의 만점 기준(어림 4,000토큰)이다", () => {
    expect([MENTION_HINT_MIN, REPEATED_LINES_HINT_MIN, LARGE_GLOBAL_TOKENS]).toEqual([3, 3, 4000]);
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
