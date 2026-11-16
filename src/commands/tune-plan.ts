// aq tune plan. 점검과 같은 입력으로 평가해 정비 후보를 계획 항목으로 바꾸고, 바꿀 파일의 지문과 함께 계획을 상태 폴더에 저장한다. 설정과 상태는 읽기만 한다(설계 16.5의 1번, 「6단계 1부 계획 전 결정」 5·6번)
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { EvalClock } from "../collect/claude.ts";
import type { Lang } from "../core/copy/lang.ts";
import { evaluate, type Evaluation, type EvaluationInput } from "../core/evaluate.ts";
import { highestMainVersion } from "../core/metrics/setup.ts";
import { openState } from "../state/next-state.ts";
import { fingerprintOf, readTarget, targetPath, tuneItem, type TargetRead, type TuneItem } from "../tune/items.ts";
import { tuneItemText, tuneNoticeText, type TuneItemText } from "../tune/copy.ts";
import { planIdOf, versionVerified, writePlan, type TunePlan, type TuneRunNotice } from "../tune/plan.ts";
import { listWorks, unfinished } from "../tune/work.ts";
import { PROGRAM_VERSION } from "../version.ts";
import { gatherCheckupInput } from "./checkup-input.ts";
import { selfIdentity } from "./self.ts";

export interface TunePlanOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  clock: EvalClock;
  lang: Lang;
  stateDir: string;
  /** 계획을 상태 폴더에 저장하고 캐시를 쓴다. 거짓이면 목록만 낸다 */
  save: boolean;
  rescan: boolean;
  entryFile: string;
  managedDir?: string;
  /** 걸린 시간을 재는 시계. 시험이 고정한다 */
  now?: () => number;
  /** 계획 ID의 무작위 여섯 글자. 시험이 고정한다 */
  random?: () => string;
}

export interface TunePlanOutcome {
  plan: TunePlan;
  /** 실행 기록. 문장(text)은 요청한 언어이고 저장한 계획에는 들지 않는다 */
  run: { durationMs: number; saved: boolean; notices: TuneRunNotice[]; text: { items: Record<string, TuneItemText>; notices: string[] } };
}

const codeOf = (error: unknown): string => (error as NodeJS.ErrnoException | null)?.code ?? "unknown";

/** 판정에 쓰는 것. cache면 상태 폴더의 캐시를 쓴다 */
export type JudgeOptions = Omit<TunePlanOptions, "lang" | "save" | "now" | "random"> & { cache: boolean };

/** 점검과 같은 입력으로 평가해 정비 후보를 계획 항목으로 짓는다. 바꿀 파일은 파일마다 한 번만 읽는다. 계획과, 적용·확인의 다시 하는 판정이 같이 쓴다(「6단계 계획 전 결정」 6번) */
/** 다시 한 판정. 확인이 대상의 실제 켜짐을 볼 수 있게 평가 결과와 입력도 돌려준다 */
export interface Judged {
  items: TuneItem[];
  reads: Map<string, TargetRead>;
  evaluation: Evaluation;
  input: EvaluationInput;
}

export async function judgeTune(options: JudgeOptions): Promise<Judged> {
  // 판정에 쓰는 지난 상태(무작위 값과 관측 기록)는 읽기만 한다. 계획은 상태와 관측 기록을 고치지 않는다(1부 결정 5번)
  const opened = await openState(options.stateDir);
  const gathered = await gatherCheckupInput({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    clock: options.clock,
    cacheDir: options.cache ? join(options.stateDir, "cache") : null,
    rescan: options.rescan,
    state: opened.state,
    self: await selfIdentity(options.entryFile),
    ...(options.managedDir === undefined ? {} : { managedDir: options.managedDir }),
  });
  const evaluation = evaluate(gathered.input);

  // 파일마다 한 번만 읽는다. 같은 파일의 항목은 같은 바이트로 짓는다
  const reads = new Map<string, TargetRead>();
  const items: TuneItem[] = [];
  for (const candidate of evaluation.candidates) {
    const input = gathered.input.tools.find((tool) => tool.tool === candidate.tool)!;
    const judged = evaluation.tools.find((tool) => tool.tool === candidate.tool)!;
    const home = input.setup.home;
    const path = targetPath(candidate, home);
    if (!reads.has(path)) reads.set(path, await readTarget(path));
    const context = { home, bundles: judged.skills, servers: judged.servers, versionOk: versionVerified(candidate.tool, highestMainVersion(input.summaries)) };
    items.push(tuneItem(candidate, context, reads.get(path)!));
  }
  return { items, reads, evaluation, input: gathered.input };
}

export async function runTunePlan(options: TunePlanOptions): Promise<TunePlanOutcome> {
  const now = options.now ?? Date.now;
  const started = now();
  const { items, reads } = await judgeTune({ ...options, cache: options.save });
  const files = [...reads].map(([path, read]) => ({ path, status: read.status, fingerprint: read.status === "ok" ? fingerprintOf(read.bytes) : null, items: items.filter((item) => item.file === path).map((item) => item.id) }));
  const base = { createdAt: new Date(options.clock.nowMs).toISOString(), appVersion: PROGRAM_VERSION, items, files };

  const notices: TuneRunNotice[] = [];
  // 끝나지 않은 작업은 잠금을 잡는 적용이 먼저 맞춘다. 계획은 맞추지 않고 알리기만 한다(2부 결정 9번)
  const pending = (await listWorks(options.stateDir)).filter(unfinished).length;
  if (pending > 0) notices.push({ kind: "unfinished_work", count: pending });
  let plan: TunePlan = { planId: null, ...base };
  if (options.save) {
    const planId = planIdOf(options.clock.nowMs, options.random?.() ?? randomBytes(3).toString("hex"));
    try {
      await writePlan(options.stateDir, { planId, ...base });
      plan = { planId, ...base };
    } catch (error) {
      notices.push({ kind: "plan_unsaved", code: codeOf(error) });
    }
  } else {
    notices.push({ kind: "not_saved" });
  }
  const text = { items: Object.fromEntries(items.map((item) => [item.id, tuneItemText(item, options.lang)])), notices: notices.map((notice) => tuneNoticeText(notice, options.lang)) };
  return { plan, run: { durationMs: now() - started, saved: plan.planId !== null, notices, text } };
}
