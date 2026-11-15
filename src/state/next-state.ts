// 점검을 시작할 때 상태 파일을 열고, 점검 뒤에 마지막 점검 시각과 설치마다의 관측 기록을 고친 상태를 만든다. 상태 파일이 깨졌으면 새 상태로 시작한다(설계 18.1, 20.1)
import type { LocalDate } from "../adapters/common/dates.ts";
import { codexInstallKeysOf, codexUnseenInUnreadablePlace, installKeysOf, unseenInUnreadablePlace } from "../scan/identity.ts";
import type { ClaudeSetupFacts, CodexSetupFacts } from "../scan/types.ts";
import { updateInstalls } from "./observations.ts";
import { loadState, newState, type StateFile } from "./state.ts";

export interface OpenedState {
  state: StateFile;
  /** 상태 파일이 없었다. 이 도구의 첫 점검이거나 상태를 지운 뒤다 */
  fresh: boolean;
  /** 상태 파일이 풀리지 않거나 모양이 달라 새 상태로 시작했다. 관측 기록이 처음부터 다시 쌓인다 */
  broken: boolean;
}

export async function openState(stateDir: string): Promise<OpenedState> {
  const loaded = await loadState(stateDir);
  if (loaded.status === "ok") return { state: loaded.state, fresh: false, broken: false };
  return { state: newState(), fresh: loaded.status === "missing", broken: loaded.status === "broken" };
}

/** 설치 열쇠의 도구 칸(installKey로 만든 목록의 둘째 칸). 읽지 못하면 null이다 */
function toolOfKey(key: string): string | null {
  try {
    const parts = JSON.parse(key) as unknown;
    return Array.isArray(parts) && typeof parts[1] === "string" ? parts[1] : null;
  } catch {
    return null;
  }
}

/**
 * 점검 뒤의 상태(순수). 무작위 값은 그대로 두고, 마지막 점검 시각과 관측 기록을 고친다.
 * 관측 기록은 두 도구의 스캐너가 본 모든 설치로 고친다. 점수에 넣는 도구인지, 켜져 있는지와 상관없다. 읽지 못한 곳에 든 설치의 기록은 남기고,
 * 읽지 못한 곳에 든 것인지는 열쇠의 도구 칸으로 도구를 가려 그 도구의 판정으로 본다(설계 18.1, 「5단계 3부 계획 전 결정」 12번).
 */
export function nextState(state: StateFile, facts: { claude: ClaudeSetupFacts; codex: CodexSetupFacts }, today: LocalDate, startedAt: string): StateFile {
  const claudeUnseen = unseenInUnreadablePlace(facts.claude);
  const codexUnseen = codexUnseenInUnreadablePlace(facts.codex);
  const keys = [...installKeysOf(facts.claude), ...codexInstallKeysOf(facts.codex)];
  const keepUnseen = (key: string): boolean => (toolOfKey(key) === "codex" ? codexUnseen(key) : claudeUnseen(key));
  return { ...state, lastCheckupAt: startedAt, installs: updateInstalls(state.installs, keys, today, keepUnseen) };
}
