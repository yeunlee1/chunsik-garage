// Codex의 지침 파일을 고른다. 전역은 Codex 홈의 AGENTS.override.md와 AGENTS.md 가운데 Codex가 싣는 하나, 프로젝트는 뿌리에서 Codex가 고르는 하나다. 크기, 글자 수, 줄 지문만 남기고 글은 버린다(설계 「5단계 2부 계획 전 결정」 5번)
import { join } from "node:path";
import { entryInfo, readText } from "./fs.ts";
import { emptyInstructionSet, readInstructionSet, type InstructionSet, type MentionTarget } from "./instructions.ts";

const NAMES = ["AGENTS.override.md", "AGENTS.md"];

/**
 * 전역 지침. 차례대로 일반 파일이고 앞뒤 공백을 뗀 내용이 있는 첫 파일 하나다. 비었거나 폴더인 것은 건너뛰고, 있는데 읽지 못한 파일은 읽지 못한 것으로 적고
 * 다음 후보를 본다(공개 소스 codex-home/src/instructions/mod.rs). 전역 지침에 목록의 프로젝트가 나온 횟수도 센다
 */
export async function readCodexGlobalInstructions(codexHome: string, mentionTargets: readonly MentionTarget[]): Promise<{ set: InstructionSet; mentions: Record<string, number> }> {
  const unreadable: string[] = [];
  for (const name of NAMES) {
    const path = join(codexHome, name);
    if (!(await entryInfo(path)).isFile) continue;
    const read = await readText(path);
    if (read.status === "unreadable") unreadable.push(path);
    if (read.status !== "ok" || !/\S/u.test(read.text)) continue;
    const found = await readInstructionSet([path], mentionTargets);
    found.set.unreadable.unshift(...unreadable);
    return found;
  }
  const set = emptyInstructionSet();
  set.unreadable.push(...unreadable);
  return { set, mentions: Object.create(null) as Record<string, number> };
}

/**
 * 프로젝트 지침. 뿌리에서 AGENTS.override.md, AGENTS.md, fallback 이름의 차례로 일반 파일인 첫 파일 하나다. 그 파일이 비었으면 지침이 없고, 같은 폴더의 다음 이름은
 * 보지 않는다(공개 소스 core/src/agents_md.rs). Codex는 전역과 같은 파일이어도 두 번 싣으므로 같은 파일 표시를 붙이지 않는다
 */
export async function readCodexProjectInstructions(root: string, fallback: readonly string[]): Promise<InstructionSet> {
  for (const name of [...NAMES, ...fallback]) {
    const path = join(root, name);
    if ((await entryInfo(path)).isFile) return (await readInstructionSet([path])).set;
  }
  return emptyInstructionSet();
}
