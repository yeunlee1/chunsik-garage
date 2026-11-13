// 평가 결과의 알림을 만든다. 점수를 내는 데 쓴 기록과 셋팅에서 빠진 것, 확인하지 못한 것을 종류마다 정해진 모양으로 싣는다(순수 함수, 설계 9.2, 9.5, 9.8, 12.2, 20.1)
import type { ObservationReason } from "../../adapters/claude/observation.ts";
import { compareVersions, parseVersion } from "../../adapters/common/version.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { CollectedTool } from "./tools.ts";

/** 도구마다 기록의 해석 규약을 확인한 버전의 범위(설계 9.5). 새 버전의 기록을 확인하면 넓힌다. 이 밖의 버전은 읽을 수 있는 필드로 계산하고 알린다(설계 20.1) */
export const VERIFIED_VERSIONS: Record<ToolId, { from: string; to: string }> = { "claude-code": { from: "2.1.220", to: "2.1.322" } };
/** 점수 구간의 사람 요청 가운데 근거가 약한 것의 몫이 이것을 넘으면 알린다(설계 9.5). 정확히 이 값은 넘지 않은 것이다 */
export const WEAK_REQUEST_SHARE = 0.1;

export type Notice =
  | { kind: "record_unreadable"; tool: ToolId; files: string[]; dirs: string[] }
  | { kind: "observation_incomplete"; tool: ToolId; metric: "skills" | "mcp"; reasons: ObservationReason[] }
  | { kind: "version_unverified"; tool: ToolId; versions: string[]; verified: { from: string; to: string } }
  | { kind: "overlapping_responses"; tool: ToolId; sessions: number }
  | { kind: "weak_human_requests"; tool: ToolId; weak: number; total: number }
  | { kind: "unclassified"; tool: ToolId; counts: { what: string; count: number }[] }
  | { kind: "orphan_subsessions"; tool: ToolId; sessions: number };

/** 알림의 차례. 같은 종류는 도구 식별자의 차례이고, 그 안은 만든 차례다(설계 12.2 「차례」) */
export const NOTICE_KINDS: readonly Notice["kind"][] = ["record_unreadable", "observation_incomplete", "version_unverified", "overlapping_responses", "weak_human_requests", "unclassified", "orphan_subsessions"];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const inRange = (date: string, range: { from: string; to: string }): boolean => date >= range.from && date <= range.to;

export function sortNotices(notices: readonly Notice[]): Notice[] {
  return notices
    .map((notice, index) => ({ notice, index }))
    .sort((a, b) => NOTICE_KINDS.indexOf(a.notice.kind) - NOTICE_KINDS.indexOf(b.notice.kind) || byText(a.notice.tool, b.notice.tool) || a.index - b.index)
    .map((item) => item.notice);
}

/** 기록 쪽 알림. 읽은 양과 같은 범위(수집 구간에 걸려 읽은 기록)를 보고, 근거가 약한 사람 요청만 점수 구간의 주 세션으로 본다 */
export function recordNotices(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): Notice[] {
  const notices: Notice[] = [];
  for (const tool of input.tools) {
    const id = tool.tool;
    const found = collected.find((item) => item.tool === id);
    if (found !== undefined) {
      const { unreadableFiles, unreadableDirs } = found.read;
      if (unreadableFiles.length > 0 || unreadableDirs.length > 0) notices.push({ kind: "record_unreadable", tool: id, files: [...unreadableFiles].sort(byText), dirs: [...unreadableDirs].sort(byText) });
      for (const metric of ["skills", "mcp"] as const) {
        const observation = found.observation[metric];
        if (!observation.complete) notices.push({ kind: "observation_incomplete", tool: id, metric, reasons: [...observation.reasons] });
      }
      if (found.overlappingSessions > 0) notices.push({ kind: "overlapping_responses", tool: id, sessions: found.overlappingSessions });
    }

    const verified = VERIFIED_VERSIONS[id];
    const [from, to] = [parseVersion(verified.from)!, parseVersion(verified.to)!];
    const outside = new Map<string, readonly [number, number, number]>();
    for (const summary of tool.summaries) {
      const version = parseVersion(summary.version);
      if (version !== null && (compareVersions(version, from) < 0 || compareVersions(version, to) > 0)) outside.set(summary.version!, version);
    }
    if (outside.size > 0) notices.push({ kind: "version_unverified", tool: id, versions: [...outside].sort((a, b) => compareVersions(a[1], b[1])).map(([text]) => text), verified: { ...verified } });

    let total = 0;
    let weak = 0;
    for (const summary of tool.summaries) {
      if (summary.kind !== "main") continue;
      for (const [date, day] of Object.entries(summary.days)) {
        if (!inRange(date, evaluation.windows.score)) continue;
        total += day.humanRequests;
        weak += day.weakHumanRequests;
      }
    }
    if (total > 0 && weak / total > WEAK_REQUEST_SHARE) notices.push({ kind: "weak_human_requests", tool: id, weak, total });

    const counts = new Map<string, number>();
    const add = (what: string, count: number): void => {
      if (count > 0) counts.set(what, (counts.get(what) ?? 0) + count);
    };
    for (const summary of tool.summaries) {
      for (const [kind, count] of Object.entries(summary.notes.unknownHookKinds)) add(`hook:${kind}`, count);
      for (const day of Object.values(summary.days)) {
        for (const [kind, count] of Object.entries(day.unknownDenialKinds)) add(`denial:${kind}`, count);
        add("compaction", day.unknownCompactions);
      }
    }
    if (counts.size > 0) notices.push({ kind: "unclassified", tool: id, counts: [...counts].sort((a, b) => byText(a[0], b[0])).map(([what, count]) => ({ what, count })) });

    const orphans = tool.summaries.filter((summary) => summary.kind === "sub" && summary.parentSessionId === null).length;
    if (orphans > 0) notices.push({ kind: "orphan_subsessions", tool: id, sessions: orphans });
  }
  return sortNotices(notices);
}
