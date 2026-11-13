// 점검을 시작할 때 상태 파일을 열고, 점검 뒤에 마지막 점검 시각과 설치마다의 관측 기록을 고친 상태를 만든다. 상태 파일이 깨졌으면 새 상태로 시작한다(설계 18.1, 20.1)
import type { LocalDate } from "../adapters/common/dates.ts";
import { installKeysOf, unseenInUnreadablePlace } from "../scan/identity.ts";
import type { ClaudeSetupFacts } from "../scan/types.ts";
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

/**
 * 점검 뒤의 상태(순수). 무작위 값은 그대로 두고, 마지막 점검 시각과 관측 기록을 고친다.
 * 관측 기록은 스캐너가 본 모든 설치로 고친다. 점수에 넣는 도구인지, 켜져 있는지와 상관없다. 읽지 못한 곳에 든 설치의 기록은 남긴다(설계 18.1).
 */
export function nextState(state: StateFile, facts: ClaudeSetupFacts, today: LocalDate, startedAt: string): StateFile {
  return { ...state, lastCheckupAt: startedAt, installs: updateInstalls(state.installs, installKeysOf(facts), today, unseenInUnreadablePlace(facts)) };
}
