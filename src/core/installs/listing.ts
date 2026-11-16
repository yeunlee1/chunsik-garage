// 주 세션에 실려 있던 스킬과 MCP 서버의 이름으로 두 가지를 본다. 14일 넘게 전부터 빠짐없이 실려 있었는지(㉮의 세션 기록 몫)와, 최근 14일 안에 새로 시작됐다는 근거가 있는지(㉱)다(순수 함수, 설계 11.3)
import type { LocalDate, Windows } from "../../adapters/common/dates.ts";
import type { SessionSummary } from "../../adapters/types.ts";
import type { NormalizedCwds, ProjectLookup } from "../projects.ts";
import { ESTABLISHED_DAYS, olderThan } from "./age.ts";
import { anyIn } from "./signals.ts";

export type ListingKind = "skill" | "mcp";

export interface ListedDay {
  date: LocalDate;
  responses: number;
  /** 그날 그 세션에 한 번이라도 실려 있던 이름 */
  loaded: ReadonlySet<string>;
  /** 세션 안에서 목록에서 빠졌다가 그날 다시 실린 이름 */
  reloaded: ReadonlySet<string>;
}

/** 주 세션 하나의 실린 목록 */
export interface SessionListing {
  /** 작업 폴더의 정규화한 경로. 정규화한 경로를 모르면 기록에 적힌 그대로다. 작업 폴더가 없으면 null이고 그런 세션은 어느 묶음에도 넣지 않는다(설계 9.3) */
  cwdKey: string | null;
  /** 작업 폴더가 묶인 프로젝트의 정규화한 뿌리. 목록의 어느 프로젝트에도 묶이지 않으면 null */
  projectRoot: string | null;
  /** 기록이 있는 가장 이른 날짜. 최근 14일 안에 시작한 세션인지를 가린다 */
  firstDate: LocalDate | null;
  /** 세션이 시작할 때 실려 있던 이름. 알 수 없으면 null */
  initial: ReadonlySet<string> | null;
  days: ListedDay[];
  /** 처음 목록과 모든 날의 실린 이름을 합친 것 */
  everLoaded: ReadonlySet<string>;
}

/** 주 세션의 요약을 실린 목록으로 바꾼다. 하위 세션에 실리는 목록은 주 세션의 것과 달라서 넣지 않는다(설계 11.3 「㉮와 ㉱는 주 세션의 기록만 본다」). */
export function sessionListings(summaries: readonly SessionSummary[], kind: ListingKind, normalizedCwds: NormalizedCwds, lookup: ProjectLookup): SessionListing[] {
  const normalized = new Map(Object.entries(normalizedCwds));
  const out: SessionListing[] = [];
  for (const summary of summaries) {
    if (summary.kind !== "main") continue;
    const initialNames = kind === "skill" ? summary.initialSkills : summary.initialMcpServers;
    const everLoaded = new Set<string>(initialNames ?? []);
    const days: ListedDay[] = [];
    for (const date of Object.keys(summary.days).sort()) {
      const cell = summary.days[date]!;
      const loaded = new Set(kind === "skill" ? cell.loadedSkills : cell.loadedMcpServers);
      for (const name of loaded) everLoaded.add(name);
      days.push({ date, responses: cell.responses, loaded, reloaded: new Set(kind === "skill" ? cell.reloadedSkills : cell.reloadedMcpServers) });
    }
    out.push({
      cwdKey: summary.cwd === null ? null : (normalized.get(summary.cwd) ?? summary.cwd),
      projectRoot: lookup(summary.cwd)?.normRoot ?? null,
      firstDate: summary.firstDate,
      initial: initialNames === null ? null : new Set(initialNames),
      days,
      everLoaded,
    });
  }
  return out;
}

/**
 * ㉮의 세션 기록 몫. 수집 구간에서, 처음 목록을 아는 주 세션이 응답한 날마다 그 세션 모두에 이름 꼴 가운데 하나가 실려 있었는지를 본다.
 * "14일 넘게 전"의 실린 날이 있고 그날부터 오늘까지 빠진 날이 없어야 한다. 가장 늦은 빠진 날보다 뒤에 그런 실린 날이 있으면 된다.
 * projectRoot를 주면(프로젝트 범위의 위치) 작업 폴더가 그 프로젝트로 묶이는 세션하고만 견준다.
 */
export function loadedSince(listings: readonly SessionListing[], recordNames: readonly string[], projectRoot: string | null, windows: Windows): boolean {
  const collect = new Set(windows.collectDates);
  /** 날짜 → 그날 응답한 견주는 세션 모두에 실려 있었는지. 열쇠가 없는 날은 보지 않는 날이다 */
  const loadedOn = new Map<LocalDate, boolean>();
  for (const listing of listings) {
    if (listing.initial === null || (projectRoot !== null && listing.projectRoot !== projectRoot)) continue;
    for (const day of listing.days) {
      if (!collect.has(day.date) || day.responses <= 0) continue;
      loadedOn.set(day.date, (loadedOn.get(day.date) ?? true) && anyIn(recordNames, day.loaded));
    }
  }
  let lastMissing = "";
  for (const [date, loaded] of loadedOn) if (!loaded && date > lastMissing) lastMissing = date;
  for (const [date, loaded] of loadedOn) if (loaded && date > lastMissing && olderThan(windows.today, date, ESTABLISHED_DAYS)) return true;
  return false;
}

/**
 * ㉱. 세션 기록에 최근 14일 안에 새로 시작됐다는 근거가 있다. 둘 가운데 하나다(설계 9.3 「세션과 세션 사이의 빠짐」, 11.3).
 * - 한 세션 안에서 실린 목록에서 빠졌다가 14일 안에 다시 실렸다.
 * - 작업 폴더가 같은 주 세션의 묶음에 그 이름이 실린 적이 있고, 그 묶음에서 최근 14일 안에 시작한 세션의 처음 목록에 그 이름이 없었다.
 * 둘째 몫에서 작업 폴더가 없는 세션은 어느 묶음에도 넣지 않는다. 처음 목록을 모르는 세션은 견주지 않고 빈 목록인 세션은 견준다.
 * 시작한 날(기록이 있는 가장 이른 날짜)을 모르는 세션은 최근 14일 안에 시작한 것으로 본다. 모르면 미루는 쪽이다.
 * 그 묶음의 주 세션에 한 번도 실린 적이 없는 이름은 둘째 몫으로 보지 않는다. 목록에 실리지 않는 설치가 늘 걸리지 않게 하려는 것이다.
 */
export function restartedRecently(listings: readonly SessionListing[], recordNames: readonly string[], today: LocalDate): boolean {
  const recent = (date: LocalDate | null): boolean => date === null || !olderThan(today, date, ESTABLISHED_DAYS);
  const loadedIn = new Set<string>();
  for (const listing of listings) {
    if (listing.days.some((day) => recent(day.date) && anyIn(recordNames, day.reloaded))) return true;
    if (listing.cwdKey !== null && anyIn(recordNames, listing.everLoaded)) loadedIn.add(listing.cwdKey);
  }
  return listings.some((listing) => listing.cwdKey !== null && loadedIn.has(listing.cwdKey) && listing.initial !== null && recent(listing.firstDate) && !anyIn(recordNames, listing.initial));
}

/**
 * ㉱의 근거가 든 날. restartedRecently가 보는 두 몫에서 지금 최근 14일 안인 근거마다 그 날을 낸다(다시 실린 날, 처음 목록에 없던 세션이 시작한 날).
 * 시작한 날을 모르는 세션이 근거이면 null이다. 그 근거는 날이 지나도 최근으로 남는다. 근거가 없으면 빈 목록이다.
 */
export function restartDates(listings: readonly SessionListing[], recordNames: readonly string[], today: LocalDate): LocalDate[] | null {
  const recent = (date: LocalDate): boolean => !olderThan(today, date, ESTABLISHED_DAYS);
  const dates: LocalDate[] = [];
  const loadedIn = new Set<string>();
  for (const listing of listings) {
    for (const day of listing.days) if (recent(day.date) && anyIn(recordNames, day.reloaded)) dates.push(day.date);
    if (listing.cwdKey !== null && anyIn(recordNames, listing.everLoaded)) loadedIn.add(listing.cwdKey);
  }
  for (const listing of listings) {
    if (listing.cwdKey === null || !loadedIn.has(listing.cwdKey) || listing.initial === null || anyIn(recordNames, listing.initial)) continue;
    if (listing.firstDate === null) return null;
    if (recent(listing.firstDate)) dates.push(listing.firstDate);
  }
  return dates;
}
