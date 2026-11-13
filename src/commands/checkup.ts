// aq checkup을 돌린다. 상태를 열고, 입력 묶음을 모아 평가하고, 평가 결과를 결과 폴더(저장하지 않는 실행이면 OS 임시 폴더)에 쓰고, 상태와 이력을 고치고, 오래된 결과와 원본이 없어진 캐시를 정리한다. 상태 폴더에 쓰다가 막히면 남은 저장을 멈추고 저장 없는 실행으로 바꾼다(설계 7.4, 12.2, 12.3, 18.1, 19.2, 20.1, 20.2)
import { join } from "node:path";
import type { EvalClock } from "../collect/claude.ts";
import { evaluate } from "../core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../core/result/assemble.ts";
import { checkupSummary, type CheckupSummary } from "../core/result/summary.ts";
import { pruneCache } from "../state/cache.ts";
import { appendHistory, historyEntry } from "../state/history.ts";
import { nextState, openState } from "../state/next-state.ts";
import { KEEP_REPORTS, pruneReports, resultStamp, writeResult, writeTempResult } from "../state/reports.ts";
import { saveState } from "../state/state.ts";
import { PROGRAM_VERSION } from "../version.ts";
import { gatherCheckupInput } from "./checkup-input.ts";
import { selfIdentity } from "./self.ts";

export interface CheckupOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 평가 시계. 점검을 시작한 시각과 시간대 */
  clock: EvalClock;
  stateDir: string;
  /** 상태 폴더에 캐시, 결과, 이력, 상태를 쓴다. --no-save면 거짓이다 */
  save: boolean;
  /** 캐시를 믿지 않고 모두 다시 읽는다 */
  rescan: boolean;
  /** 실행한 파일의 경로. 이 도구 자신을 알아보는 데 쓴다 */
  entryFile: string;
  /** 관리 정책 파일의 폴더. 주지 않으면 OS의 자리다 */
  managedDir?: string;
  /** 걸린 시간을 재는 시계(밀리초). 주지 않으면 Date.now다 */
  now?: () => number;
}

/** 실행 기록의 알림. 평가 결과가 아니라 이번 실행에서 생긴 것이다 */
export type RunNotice =
  /** 상태 폴더에 쓰다가 막혀 그 뒤의 저장을 멈추고 저장 없는 실행으로 바꿨다 */
  | { kind: "save_failed"; step: "result" | "state" | "history"; code: string }
  /** 오래된 결과나 원본이 없어진 캐시를 정리하지 못했다. 저장은 끝났다 */
  | { kind: "prune_failed"; what: "reports" | "cache"; code: string }
  /** 상태 폴더나 그 안의 폴더가 링크라서 정리하지 않았다 */
  | { kind: "prune_skipped"; what: "reports" | "cache"; link: "state" | "reports" | "cache" }
  /** 저장하지 않는 실행이다. 이력 비교와 캐시가 없다 */
  | { kind: "not_saved" }
  /** OS 임시 폴더에도 평가 결과 파일을 쓰지 못했다 */
  | { kind: "result_unwritten"; code: string };

export interface RunRecord {
  durationMs: number;
  /** 캐시를 쓴 기록 파일의 수 */
  cachedFiles: number;
  /** 결과, 상태, 이력을 모두 상태 폴더에 썼다 */
  saved: boolean;
  /** 결과 화면의 경로. 결과 화면은 3단계에 만든다 */
  reportPath: string | null;
  /** 평가 결과 파일의 경로. 쓰지 못했으면 null */
  resultPath: string | null;
  notices: RunNotice[];
}

export interface CheckupOutcome {
  summary: CheckupSummary;
  run: RunRecord;
  result: CheckupResult;
}

const codeOf = (error: unknown): string => (error as NodeJS.ErrnoException | null)?.code ?? "unknown";

export async function runCheckup(options: CheckupOptions): Promise<CheckupOutcome> {
  const now = options.now ?? Date.now;
  const started = now();
  // 저장하지 않는 실행도 지난 상태는 읽는다. 무작위 값과 관측 기록이 판정에 든다
  const opened = await openState(options.stateDir);
  const gathered = await gatherCheckupInput({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    clock: options.clock,
    cacheDir: options.save ? join(options.stateDir, "cache") : null,
    rescan: options.rescan,
    state: opened.state,
    self: await selfIdentity(options.entryFile),
    ...(options.managedDir === undefined ? {} : { managedDir: options.managedDir }),
  });
  const evaluation = evaluate(gathered.input);
  const result = checkupResult({ input: gathered.input, evaluation, collected: gathered.tools, appVersion: PROGRAM_VERSION, run: { stateBroken: opened.broken } });
  const stamp = resultStamp(options.clock.nowMs);

  const notices: RunNotice[] = [];
  let saved = false;
  let resultPath: string | null = null;
  if (options.save) {
    let step: "result" | "state" | "history" = "result";
    try {
      resultPath = await writeResult(options.stateDir, stamp, result);
      step = "state";
      await saveState(options.stateDir, nextState(opened.state, gathered.facts, evaluation.windows.today, new Date(options.clock.nowMs).toISOString()));
      step = "history";
      await appendHistory(options.stateDir, historyEntry(evaluation, options.clock.nowMs));
      saved = true;
    } catch (error) {
      notices.push({ kind: "save_failed", step, code: codeOf(error) });
    }
    if (saved) {
      // 이번 점검의 결과는 시계가 뒤로 가 있어도 남긴다
      for (const [what, prune] of [["reports", () => pruneReports(options.stateDir, KEEP_REPORTS, stamp)], ["cache", () => pruneCache(options.stateDir)]] as const) {
        try {
          const report = await prune();
          if (report.skipped !== null) notices.push({ kind: "prune_skipped", what, link: report.skipped });
        } catch (error) {
          notices.push({ kind: "prune_failed", what, code: codeOf(error) });
        }
      }
    }
  } else {
    notices.push({ kind: "not_saved" });
  }
  if (resultPath === null) {
    try {
      resultPath = await writeTempResult(options.tmpdir, stamp, result);
    } catch (error) {
      notices.push({ kind: "result_unwritten", code: codeOf(error) });
    }
  }

  const run: RunRecord = { durationMs: now() - started, cachedFiles: gathered.collected.read.fromCache, saved, reportPath: null, resultPath, notices };
  return { summary: checkupSummary(result, null), run, result };
}
