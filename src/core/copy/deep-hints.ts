// 정밀 점검 단서의 문장(두 언어). 규칙으로 찾은 약한 신호라 "~일 수 있다"로 쓴다(설계 17)
import type { DeepHint } from "../result/hints.ts";
import { TOOL_NAMES } from "./common.ts";
import { fill } from "./format.ts";
import type { Lang, Texts } from "./lang.ts";

export const DEEP_HINT_COPY: Texts<Record<DeepHint["kind"], string>> = {
  en: {
    global_mentions_project: "The global instructions of {tool} mention project paths or names several times ({projects}). Project-only content may have slipped into the global file.",
    repeated_project_lines: "{lines} lines repeat across the project instructions of {tool} ({projects}). They may belong in the global instructions.",
    large_global_instructions: "The global instructions of {tool} are about {tokens} tokens. Some of it may move into skills or project documents.",
    tools_instructions_differ: "The global instructions of Claude Code and Codex are not the same file and share only {shared} lines (Claude Code {claude}, Codex {codex}). The two tools may get different directions.",
  },
  ko: {
    global_mentions_project: "{tool}의 전역 지침에 프로젝트 경로나 이름이 여러 번 나옵니다({projects}). 그 프로젝트 전용 내용이 전역에 섞였을 수 있습니다.",
    repeated_project_lines: "{tool}의 프로젝트 지침 여러 곳({projects})에 같은 줄이 {lines}개 되풀이됩니다. 전역으로 올릴 내용일 수 있습니다.",
    large_global_instructions: "{tool}의 전역 지침이 어림잡아 {tokens} 토큰입니다. 스킬이나 프로젝트 문서로 내릴 내용이 있을 수 있습니다.",
    tools_instructions_differ: "Claude Code와 Codex의 전역 지침이 같은 파일이 아니고 겹치는 줄이 {shared}줄뿐입니다(Claude Code {claude}줄, Codex {codex}줄). 두 도구가 다른 지시를 받고 있을 수 있습니다.",
  },
};

export function deepHintText(hint: DeepHint, lang: Lang): string {
  const text = DEEP_HINT_COPY[lang][hint.kind];
  switch (hint.kind) {
    case "global_mentions_project":
      return fill(text, { tool: TOOL_NAMES[hint.tool][lang], projects: hint.projects.map((project) => `${project.root} ${project.mentions}`).join(", ") });
    case "repeated_project_lines":
      return fill(text, { tool: TOOL_NAMES[hint.tool][lang], lines: hint.lines, projects: hint.projects.join(", ") });
    case "large_global_instructions":
      return fill(text, { tool: TOOL_NAMES[hint.tool][lang], tokens: Math.round(hint.tokens) });
    case "tools_instructions_differ":
      return fill(text, { shared: hint.shared, claude: hint.lines["claude-code"], codex: hint.lines.codex });
  }
}
