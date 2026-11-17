// 한 논리 세션의 기록 파일 여럿(대화를 되돌려 생긴 기록 등)의 요약을 하나로 합친다(순수 함수, 설계 9.2, 「5단계 계획 전 결정」 7번)
import { nameRecord, sortedRecord } from "../common/canonical.ts";
import type { LocalDate } from "../common/dates.ts";
import { maxVersion } from "../common/version.ts";
import { addDayInto, canonicalDay, emptyDay, type DayCell, type SessionSummary } from "../types.ts";

const recordIdOf = (summary: SessionSummary): string => summary.codex?.recordId ?? summary.sessionId;
const byRecordId = (a: SessionSummary, b: SessionSummary): number => (recordIdOf(a) < recordIdOf(b) ? -1 : recordIdOf(a) > recordIdOf(b) ? 1 : 0);

function addNumbers(into: Record<string, number>, from: Record<string, number>): void {
  for (const [key, value] of Object.entries(from)) into[key] = (Object.hasOwn(into, key) ? into[key]! : 0) + value;
}

/**
 * 정체(세션 ID, 주·하위, 부모, 작업 폴더, 지침, 처음 목록)와 기록 파일 식별자, 세션 ID를 대신 쓴 까닭은 식별자가 세션 ID와 같은 원래 기록에서, 없으면 식별자 차례로 첫 기록에서 가져온다
 * (작업 폴더와 지침은 그 기록에 없으면 식별자 차례로 처음 있는 것). 날짜 칸, 빠진 것, 알림의 수, 정체 모를 종류, 이어받아 뺀 수는 더하고,
 * 버전은 가장 높은 것, 가장 이른 날짜는 가장 이른 것이며, 기준을 찾지 못한 기록이 하나라도 있으면 그렇다고 남긴다. 넣은 요약은 바꾸지 않는다.
 * outside는 수집 구간 밖이라 지문을 얻으려고만 읽은 같은 세션의 기록이다. 정체와 기록 파일 식별자, 대신 쓴 까닭, 버전, 가장 이른 날짜에는 쓰고 수에는 넣지 않는다
 */
export function mergeRecords(records: readonly SessionSummary[], outside: readonly SessionSummary[] = []): SessionSummary {
  if (records.length === 1 && outside.length === 0) return records[0]!;
  const sorted = [...records].sort(byRecordId);
  const all = [...records, ...outside].sort(byRecordId);
  const base = all.find((summary) => recordIdOf(summary) === summary.sessionId) ?? all[0]!;
  const first = <T>(pick: (summary: SessionSummary) => T | null): T | null => pick(base) ?? all.map(pick).find((value) => value !== null) ?? null;

  const cells = new Map<LocalDate, DayCell>();
  const unconfirmedTypes = nameRecord<number>();
  const unknownHookKinds = nameRecord<number>();
  const unknownItemTypes = nameRecord<number>();
  const missing = { lines: 0, brokenLines: 0, tailFragments: 0, tooLongLines: 0 };
  let longMcp = 0;
  let mcpCounted = true;
  const notes = { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: 0 };
  const inheritedSkipped = { items: 0, totals: 0, responses: 0 };
  let firstDate: LocalDate | null = null;
  for (const summary of sorted) {
    for (const [date, cell] of Object.entries(summary.days)) {
      let into = cells.get(date);
      if (into === undefined) {
        into = emptyDay();
        cells.set(date, into);
      }
      addDayInto(into, cell);
    }
    missing.lines += summary.missing.lines;
    missing.brokenLines += summary.missing.brokenLines;
    missing.tailFragments += summary.missing.tailFragments;
    missing.tooLongLines += summary.missing.tooLongLines;
    if (summary.missing.tooLongMcpLines === undefined) mcpCounted = false;
    else longMcp += summary.missing.tooLongMcpLines;
    addNumbers(unconfirmedTypes, summary.missing.unconfirmedTypes);
    notes.syntheticResponses += summary.notes.syntheticResponses;
    notes.responsesWithoutId += summary.notes.responsesWithoutId;
    notes.undatedLines += summary.notes.undatedLines;
    addNumbers(unknownHookKinds, summary.notes.unknownHookKinds);
    if (summary.codex !== undefined) {
      addNumbers(unknownItemTypes, summary.codex.unknownItemTypes);
      inheritedSkipped.items += summary.codex.inheritedSkipped.items;
      inheritedSkipped.totals += summary.codex.inheritedSkipped.totals;
      inheritedSkipped.responses += summary.codex.inheritedSkipped.responses;
    }
  }
  for (const summary of all) {
    if (summary.firstDate !== null && (firstDate === null || summary.firstDate < firstDate)) firstDate = summary.firstDate;
  }
  const days: Record<LocalDate, DayCell> = {};
  for (const date of [...cells.keys()].sort()) days[date] = canonicalDay(cells.get(date)!);
  const instructionChars = first((summary) => summary.instructionChars);
  const codex = base.codex;
  return {
    tool: base.tool,
    sessionId: base.sessionId,
    kind: base.kind,
    parentSessionId: base.parentSessionId,
    cwd: first((summary) => summary.cwd),
    version: maxVersion(all.map((summary) => summary.version)),
    firstDate,
    days,
    instructionChars: instructionChars === null ? null : { ascii: instructionChars.ascii, other: instructionChars.other },
    initialSkills: base.initialSkills === null ? null : [...base.initialSkills],
    initialMcpServers: base.initialMcpServers === null ? null : [...base.initialMcpServers],
    missing: { ...missing, ...(mcpCounted ? { tooLongMcpLines: longMcp } : {}), unconfirmedTypes: sortedRecord(unconfirmedTypes) },
    firstResponseIdHashes: [...base.firstResponseIdHashes],
    notes: { ...notes, unknownHookKinds: sortedRecord(unknownHookKinds) },
    ...(codex === undefined
      ? {}
      : {
          codex: {
            recordId: codex.recordId,
            unknownThreadSource: first((summary) => summary.codex?.unknownThreadSource ?? null),
            idFallback: codex.idFallback,
            unknownItemTypes: sortedRecord(unknownItemTypes),
            inheritedSkipped,
            baselineMissing: sorted.some((summary) => summary.codex?.baselineMissing === true),
          },
        }),
  };
}
