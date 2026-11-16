// 정밀 점검 단서의 문장을 두 언어로 시험한다(설계 17)
import { describe, expect, it } from "vitest";
import { deepHintText } from "../../src/core/copy/deep-hints.ts";
import { slots } from "../../src/core/copy/format.ts";
import type { DeepHint } from "../../src/core/result/hints.ts";

const HINTS: DeepHint[] = [
  { kind: "global_mentions_project", tool: "claude-code", projects: [{ root: "/work/a", mentions: 4 }] },
  { kind: "repeated_project_lines", tool: "codex", lines: 3, projects: ["/work/a", "/work/b"] },
  { kind: "large_global_instructions", tool: "claude-code", tokens: 4321.7 },
  { kind: "tools_instructions_differ", shared: 1, lines: { "claude-code": 4, codex: 5 } },
];

describe("정밀 점검 단서의 문장", () => {
  it("두 언어 모두 단서마다 문장이 있고 마침표로 끝나며 채우지 않은 자리가 남지 않는다", () => {
    for (const lang of ["en", "ko"] as const) {
      for (const hint of HINTS) {
        const text = deepHintText(hint, lang);
        expect(text, `${lang} ${hint.kind}`).toMatch(/\.$/);
        expect(slots(text)).toEqual([]);
      }
    }
  });

  it("수는 자릿수를 묶고 어림 토큰은 반올림한다. 프로젝트는 나온 횟수와 함께 적는다", () => {
    expect(deepHintText(HINTS[2]!, "ko")).toBe("Claude Code의 전역 지침이 어림잡아 4,322 토큰입니다. 스킬이나 프로젝트 문서로 내릴 내용이 있을 수 있습니다.");
    expect(deepHintText(HINTS[0]!, "en")).toBe("The global instructions of Claude Code mention project paths or names several times (/work/a 4). Project-only content may have slipped into the global file.");
  });
});
