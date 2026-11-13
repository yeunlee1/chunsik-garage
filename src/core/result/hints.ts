// 정밀 점검 단서를 만든다. 규칙으로 찾을 수 있는 약한 신호이고 점수에 넣지 않는다. 두 도구의 전역 지침을 견주는 단서는 Codex를 넣을 때(5단계) 더한다(순수 함수, 설계 17)
import type { ToolId } from "../../adapters/types.ts";
import type { EvaluationInput } from "../evaluate.ts";
import { ruleSpec } from "../rules.ts";

/** 전역 지침에 한 프로젝트의 경로나 이름이 이만큼 이상 나오면 단서다 */
export const MENTION_HINT_MIN = 3;
/** 둘 이상의 프로젝트 지침에 나오는 줄이 이만큼 이상이면 단서다 */
export const REPEATED_LINES_HINT_MIN = 3;
/** 전역 지침의 어림 토큰이 이것을 넘으면 단서다. 매번 실리는 지침(E4)의 만점 기준과 같다 */
export const LARGE_GLOBAL_TOKENS = ruleSpec("E4").fullAt;

export type DeepHint =
  | { kind: "global_mentions_project"; tool: ToolId; projects: { root: string; mentions: number }[] }
  | { kind: "repeated_project_lines"; tool: ToolId; lines: number; projects: string[] }
  | { kind: "large_global_instructions"; tool: ToolId; tokens: number };

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function deepHints(input: EvaluationInput): DeepHint[] {
  const hints: DeepHint[] = [];
  for (const tool of [...input.tools].sort((a, b) => byText(a.tool, b.tool))) {
    const setup = tool.setup;
    const rootOf = new Map(setup.projects.map((project) => [project.normRoot, project.root]));

    const mentioned = Object.entries(setup.globalMentions)
      .filter(([, count]) => count >= MENTION_HINT_MIN)
      .map(([normRoot, count]) => ({ root: rootOf.get(normRoot) ?? normRoot, mentions: count }))
      .sort((a, b) => byText(a.root, b.root));
    if (mentioned.length > 0) hints.push({ kind: "global_mentions_project", tool: tool.tool, projects: mentioned });

    // 전역 지침에도 있는 줄은 전역과 겹치는 것(F4)이라 세지 않는다
    const global = new Set(setup.globalInstructions.lineHashes);
    const seen = new Map<string, string[]>();
    for (const project of setup.projects.filter((item) => item.exists && !item.excluded)) {
      for (const hash of new Set(project.instructions.lineHashes)) {
        if (global.has(hash)) continue;
        seen.set(hash, [...(seen.get(hash) ?? []), project.root]);
      }
    }
    const repeated = [...seen.values()].filter((roots) => roots.length >= 2);
    if (repeated.length >= REPEATED_LINES_HINT_MIN) hints.push({ kind: "repeated_project_lines", tool: tool.tool, lines: repeated.length, projects: [...new Set(repeated.flat())].sort(byText) });

    const { ascii, other } = setup.globalInstructions.chars;
    const tokens = ascii / 4 + other;
    if (tokens > LARGE_GLOBAL_TOKENS) hints.push({ kind: "large_global_instructions", tool: tool.tool, tokens });
  }
  return hints;
}
