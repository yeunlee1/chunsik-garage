// 설치 하나를 「썼다, 안 쓴 것이 확인됨, 쓰는지 모름」으로 가른다. 스킬은 위치마다, MCP 서버는 서버마다 본다. 이름이 아니라 지금의 설치를 본다(순수 함수, 설계 11.3 E5·E6)
import type { Windows } from "../../adapters/common/dates.ts";
import type { FileStatus, McpFact, SkillFact } from "../../scan/types.ts";
import type { InstallRecord } from "../../state/state.ts";
import { ESTABLISHED_DAYS, RECENT_USE_DAYS, msOlderThan, olderThan, type EvalDay } from "./age.ts";
import { loadedSince, restartedRecently, type SessionListing } from "./listing.ts";
import { anyIn, type UsedNames } from "./signals.ts";

/** used는 썼다(불렀다), unused는 안 쓴 것이 확인됨, unknown은 쓰는지 모름이다 */
export type Verdict = "used" | "unused" | "unknown";

/** 판정에 쓰는 것. 도구 하나의 스킬(또는 MCP 서버) 쪽 기록과 지난 점검까지의 관측 기록이다 */
export interface VerdictContext {
  day: EvalDay;
  windows: Windows;
  /** 지난 점검까지의 관측 기록(정체 열쇠 → 기록). null이면 이 도구가 아직 관측을 적은 적이 없다(첫 점검) */
  records: ReadonlyMap<string, InstallRecord> | null;
  /** 사용 신호가 있었던 기록의 이름 */
  used: UsedNames;
  /** 주 세션에 실려 있던 이름 */
  listings: readonly SessionListing[];
  /** 그 지표(스킬 사용 또는 MCP 호출)의 관측이 빠짐없다(설계 9.8) */
  complete: boolean;
}

export function recordMap(installs: readonly InstallRecord[] | null): ReadonlyMap<string, InstallRecord> | null {
  return installs === null ? null : new Map(installs.map((record) => [record.key, record]));
}

/** 상태 파일이 말해 주는 것. ㉯는 증거이고 ㉲와 ㉳는 최근에 새로 시작됐다는 근거다 */
function observed(key: string | null, context: VerdictContext): { seenLong: boolean; appearedRecently: boolean; changed: boolean } {
  const record = key === null ? undefined : context.records?.get(key);
  const long = record !== undefined && olderThan(context.day.today, record.firstSeen, ESTABLISHED_DAYS);
  return {
    // ㉯ 같은 정체의 설치를 계속 봐 온 첫날이 14일 넘게 앞선다
    seenLong: long,
    // ㉲ 지난 점검에는 없다가 14일 안의 점검에 새로 나타났다
    appearedRecently: record !== undefined && record.appeared && !long,
    // ㉳ 관측 기록은 있는데 이 정체의 기록이 없다. 지난 점검과 정체가 다르다
    changed: context.records !== null && record === undefined,
  };
}

/** 조건 ④(스킬). 지금 설치가 14일 넘게 있었다는 증거가 있고, 최근 14일 안에 새로 시작됐다는 근거가 하나도 없다. */
export function skillEstablished(skill: SkillFact, context: VerdictContext): boolean {
  // 링크로 걸었으면 링크 자체와 그 대상을 만든 시각을 다 본다
  const created = skill.isLink ? [skill.createdMs, skill.targetCreatedMs] : [skill.createdMs];
  const recent = (ms: number | null): boolean => ms !== null && !msOlderThan(context.day, ms, ESTABLISHED_DAYS);
  const state = observed(skill.installKey, context);
  // ㉮ 세션 기록의 이름은 지금 설치의 기록이 아니다. 폴더를 만든 시각이 14일 넘게 앞설 때에만 그 이름이 지금 설치와 이어진다
  const createdLongAgo = created.every((ms) => ms !== null && !recent(ms));
  const loaded = createdLongAgo && loadedSince(context.listings, skill.recordNames, skill.scope === "project" ? skill.projectRoot : null, context.windows);
  if (!loaded && !state.seenLong) return false;
  // ㉰ 만든 시각이 14일 안이다. ㉱ 세션 기록에 새로 시작됐다는 근거가 있다
  return !(created.some(recent) || restartedRecently(context.listings, skill.recordNames, context.day.today) || state.appearedRecently || state.changed);
}

/** 조건 ④(MCP 서버). ㉯로만 채운다. 서버에는 이름이 지금 설치와 이어진다는 근거가 따로 없어서 세션 기록(㉮)을 쓰지 않고, 폴더가 없어서 ㉰도 없다. */
export function serverEstablished(server: McpFact, context: VerdictContext): boolean {
  if (server.installKey === null) return false;
  const state = observed(server.installKey, context);
  return state.seenLong && !(restartedRecently(context.listings, server.recordNames, context.day.today) || state.appearedRecently || state.changed);
}

/** 조건 ②. 도구의 집계가 없거나 그 마지막 사용이 30일 넘게 전이다. 집계가 든 파일을 읽지 못했거나 그 파일이 없으면 모르는 것이라 채우지 못한다 */
function usageStale(skill: SkillFact, claudeJson: FileStatus, day: EvalDay): boolean {
  if (claudeJson !== "ok" || skill.usageUndated) return false;
  return skill.usageLastUsedMs === null || msOlderThan(day, skill.usageLastUsedMs, RECENT_USE_DAYS);
}

/**
 * 스킬 위치 하나의 판정. claudeJson은 도구의 집계가 든 파일(~/.claude.json)의 읽기 상태다.
 * 훅이 내용을 넣어 주는 스킬(조건 ⑤)은 쓴 신호가 있어도 쓰는지 모름이다. 훅으로 실린 내용은 신호를 남기지 않아서 이 스킬은 안 쓴 것이 확인될 수 없다.
 * 쓴 것만 썼다로 세면 판정된 것이 쓴 쪽으로만 모여 값이 실제보다 좋게 나온다. 정의를 읽지 못하는 서버를 부른 기록이 있어도 세지 않는 것과 같은 선이다.
 */
export function skillVerdict(skill: SkillFact, claudeJson: FileStatus, context: VerdictContext): Verdict {
  if (skill.hookProvided) return "unknown"; // ⑤
  if (anyIn(skill.recordNames, context.used.inScore)) return "used";
  // 머리말의 이름을 모르면(값을 읽지 못했거나 SKILL.md를 읽지 못했다) 그 이름으로 남은 신호와 집계를 이 위치에 잇지 못한다. 안 쓴 것이 확인될 수 없다
  if (skill.nameUnreadable || !skill.readable) return "unknown";
  const unused =
    !anyIn(skill.recordNames, context.used.inCollect) && // ①
    usageStale(skill, claudeJson, context.day) && // ②
    context.complete && // ③
    skillEstablished(skill, context); // ④
  return unused ? "unused" : "unknown";
}

/** MCP 서버 하나의 판정. 정의를 읽지 못해 정체가 없는 서버는 같은 설치인지 견줄 수 없어서 부른 기록이 있어도 늘 쓰는지 모름이다. */
export function serverVerdict(server: McpFact, context: VerdictContext): Verdict {
  if (server.installKey === null) return "unknown";
  if (anyIn(server.recordNames, context.used.inScore)) return "used";
  return !anyIn(server.recordNames, context.used.inCollect) && context.complete && serverEstablished(server, context) ? "unused" : "unknown";
}
