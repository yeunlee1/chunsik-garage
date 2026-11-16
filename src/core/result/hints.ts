// 정밀 점검 단서를 만든다. 규칙으로 찾을 수 있는 약한 신호이고 점수에 넣지 않는다. 도구마다의 단서 셋과 두 도구의 전역 지침을 견주는 단서다(순수 함수, 설계 17, 「5단계 4부 계획 전 결정」 8번)
import type { ToolId } from "../../adapters/types.ts";
import type { InstructionSet } from "../../scan/instructions.ts";
import type { EvaluationInput, ToolInput } from "../evaluate.ts";
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
  | { kind: "large_global_instructions"; tool: ToolId; tokens: number }
  | { kind: "tools_instructions_differ"; shared: number; lines: Record<ToolId, number> };

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 도구 하나의 단서에 쓰는 셋팅. 프로젝트는 그 도구가 셋팅을 읽은 것만이고 경로는 입력 묶음의 프로젝트 목록과 같다 */
interface HintSetup {
  globalInstructions: InstructionSet;
  globalMentions: Record<string, number>;
  projects: { root: string; instructions: InstructionSet }[];
  rootOf: Map<string, string>;
}

function hintSetup(tool: ToolInput, input: EvaluationInput): HintSetup {
  if (tool.tool === "claude-code") {
    const { setup } = tool;
    return {
      globalInstructions: setup.globalInstructions,
      globalMentions: setup.globalMentions,
      projects: setup.projects.filter((item) => item.exists && !item.excluded).map((project) => ({ root: project.root, instructions: project.instructions })),
      rootOf: new Map(setup.projects.map((project) => [project.normRoot, project.root])),
    };
  }
  // Codex의 프로젝트 사실에는 경로가 없어 입력 묶음의 프로젝트 목록에서 얻는다. 스캐너가 읽지 않은 프로젝트의 지침은 보지 않는다
  const rootOf = new Map(input.projects.map((project) => [project.normRoot, project.root]));
  const { setup } = tool;
  return {
    globalInstructions: setup.globalInstructions,
    globalMentions: setup.globalMentions,
    projects: setup.projects.filter((project) => project.scanned).map((project) => ({ root: rootOf.get(project.normRoot) ?? project.normRoot, instructions: project.instructions })),
    rootOf,
  };
}

function toolHints(tool: ToolId, setup: HintSetup): DeepHint[] {
  const hints: DeepHint[] = [];
  const mentioned = Object.entries(setup.globalMentions)
    .filter(([, count]) => count >= MENTION_HINT_MIN)
    .map(([normRoot, count]) => ({ root: setup.rootOf.get(normRoot) ?? normRoot, mentions: count }))
    .sort((a, b) => byText(a.root, b.root));
  if (mentioned.length > 0) hints.push({ kind: "global_mentions_project", tool, projects: mentioned });

  // 전역 지침에도 있는 줄은 전역과 겹치는 것(F4)이라 세지 않는다
  const global = new Set(setup.globalInstructions.lineHashes);
  const seen = new Map<string, string[]>();
  for (const project of setup.projects) {
    for (const hash of new Set(project.instructions.lineHashes)) {
      if (global.has(hash)) continue;
      seen.set(hash, [...(seen.get(hash) ?? []), project.root]);
    }
  }
  const repeated = [...seen.values()].filter((roots) => roots.length >= 2);
  if (repeated.length >= REPEATED_LINES_HINT_MIN) hints.push({ kind: "repeated_project_lines", tool, lines: repeated.length, projects: [...new Set(repeated.flat())].sort(byText) });

  const { ascii, other } = setup.globalInstructions.chars;
  const tokens = ascii / 4 + other;
  if (tokens > LARGE_GLOBAL_TOKENS) hints.push({ kind: "large_global_instructions", tool, tokens });
  return hints;
}

/**
 * 두 도구의 전역 지침이 같은 원본이 아니고 겹치는 줄이 적다. 같은 원본은 실제 경로가 같은 파일을 하나라도 나누는 것이고, 적다는 것은 두 지침에 모두 있는 줄이
 * 줄이 적은 쪽의 절반에 못 미치는 것이다. 한 도구라도 줄 지문이 없으면 견주지 않는다
 */
function toolsDiffer(claude: InstructionSet, codex: InstructionSet): DeepHint | null {
  if (claude.lineHashes.length === 0 || codex.lineHashes.length === 0) return null;
  const codexReal = new Set(codex.files.map((file) => file.realPath).filter((realPath): realPath is string => realPath !== null));
  if (claude.files.some((file) => file.realPath !== null && codexReal.has(file.realPath))) return null;
  // 줄 지문은 지침마다 중복이 없다
  const codexLines = new Set(codex.lineHashes);
  const shared = claude.lineHashes.filter((hash) => codexLines.has(hash)).length;
  const fewer = Math.min(claude.lineHashes.length, codex.lineHashes.length);
  return shared * 2 < fewer ? { kind: "tools_instructions_differ", shared, lines: { "claude-code": claude.lineHashes.length, codex: codex.lineHashes.length } } : null;
}

export function deepHints(input: EvaluationInput): DeepHint[] {
  const tools = [...input.tools].sort((a, b) => byText(a.tool, b.tool));
  const hints = tools.flatMap((tool) => toolHints(tool.tool, hintSetup(tool, input)));
  const claude = tools.find((tool) => tool.tool === "claude-code");
  const codex = tools.find((tool) => tool.tool === "codex");
  const differ = claude === undefined || codex === undefined ? null : toolsDiffer(claude.setup.globalInstructions, codex.setup.globalInstructions);
  if (differ !== null) hints.push(differ);
  return hints;
}

/** 정밀 점검에서 읽을 수 있는 지침 파일 하나(설계 17). 전역 지침은 처음부터 골라 두고, 프로젝트 지침은 사용자가 고른 것만 읽는다 */
export interface DeepFile {
  tool: ToolId;
  scope: "global" | "project";
  /** 프로젝트 지침이면 그 프로젝트의 뿌리다 */
  project: string | null;
  path: string;
  bytes: number;
  selected: boolean;
}

/** 내용이 있는 지침 파일의 목록. 전역과 같은 프로젝트 파일은 빼고, 두 도구가 같은 파일을 읽으면 앞의 것 하나만 둔다 */
export function deepFiles(input: EvaluationInput): DeepFile[] {
  const files: DeepFile[] = [];
  const seen = new Set<string>();
  const add = (file: InstructionSet["files"][number], entry: Omit<DeepFile, "path" | "bytes">): void => {
    const key = file.realPath ?? file.path;
    if (!file.hasContent || seen.has(key)) return;
    seen.add(key);
    files.push({ ...entry, path: file.path, bytes: file.bytes });
  };
  for (const tool of [...input.tools].sort((a, b) => byText(a.tool, b.tool))) {
    const setup = hintSetup(tool, input);
    for (const file of setup.globalInstructions.files) add(file, { tool: tool.tool, scope: "global", project: null, selected: true });
    for (const project of setup.projects) for (const file of project.instructions.files) if (!file.sameAsGlobal) add(file, { tool: tool.tool, scope: "project", project: project.root, selected: false });
  }
  return files;
}
