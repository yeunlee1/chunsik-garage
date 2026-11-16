// aq tune apply, aq tune undo, aq tune verify. 잠금을 잡고 끊긴 작업을 맞춘 뒤, 계획이나 작업 기록대로 파일마다 바꾸거나 되돌리거나 확인한다(설계 7.4, 16.4~16.7, 「6단계 2부 계획 전 결정」 6~10번)
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { verifyText, workItemText, workNoticeText, type WorkNotice } from "../tune/copy.ts";
import { replaceSetting, runFiles, type EngineIo, type EngineNotice } from "../tune/engine.ts";
import { readTarget, sameSlot, slotOf, type Slot, type TuneItem } from "../tune/items.ts";
import { PLANS_DIR, planIdOf, type TunePlan } from "../tune/plan.ts";
import { ID_PATTERN, LOCK_FILE, listWorks, loadWork, reconcileWorks, saveWork, takeLock, type TuneWork, type WorkFile, type WorkItem } from "../tune/work.ts";
import { PROGRAM_VERSION } from "../version.ts";
import { judgeTune, type Judged, type TunePlanOptions } from "./tune-plan.ts";

export type TuneRunOptions = Omit<TunePlanOptions, "save"> & {
  /** 시험이 파일 읽기·쓰기와 끼어듦 자리를 바꿔 끼운다 */
  io?: Partial<EngineIo>;
  /** 잠금을 잡은 프로세스가 살아 있는지. 시험이 고정한다 */
  alive?: (pid: number) => boolean;
};

export interface TuneWorkOutcome {
  /** 이번 작업의 기록(되돌리기면 되돌리기 작업의 기록) */
  work: TuneWork;
  run: { durationMs: number; notices: WorkNotice[]; text: { items: Record<string, string>; notices: string[] } };
}

export interface VerifyResult {
  id: string;
  /** 그 자리의 지금 값이 이 작업이 쓴 값과 같다 */
  kept: boolean;
  /** 다시 한 판정에서 그 대상이 아직 켜져 있다. 사용자 층을 바꿔도 다른 층(프로젝트 설정 같은 것)이 다시 켜면 켜진 것이다(16.7) */
  stillOn: boolean;
}

export interface TuneVerifyOutcome {
  work: TuneWork;
  run: { durationMs: number; results: VerifyResult[]; notices: WorkNotice[]; text: { items: Record<string, string>; notices: string[] } };
}

/** 이 명령을 끝내는 오류. 점검의 오류와 같은 꼴(code, message)로 나간다 */
const failure = (code: string, message: string): Error => Object.assign(new Error(message), { code });

async function withLock<T>(options: TuneRunOptions, body: () => Promise<T>): Promise<T> {
  const lock = await takeLock(options.stateDir, options.alive);
  if (lock === null) throw failure("locked", `another tune run holds the lock: ${join(options.stateDir, LOCK_FILE)}`);
  try {
    return await body();
  } finally {
    await lock.release();
  }
}

/** 저장한 계획. 계획 ID 꼴이 아니거나, 없거나, 풀리지 않으면 null이다 */
async function loadPlan(stateDir: string, planId: string): Promise<TunePlan | null> {
  if (!ID_PATTERN.test(planId)) return null;
  try {
    const plan = JSON.parse(await readFile(join(stateDir, PLANS_DIR, `${planId}.json`), "utf8")) as TunePlan;
    return plan !== null && plan.planId === planId && Array.isArray(plan.items) && Array.isArray(plan.files) ? plan : null;
  } catch {
    return null;
  }
}

const afterOf = (item: TuneItem): Slot => (item.key.kind === "json-list-add" ? { present: true } : { present: true, value: item.next });
const filesOf = (items: readonly WorkItem[]): WorkFile[] => [...new Set(items.map((item) => item.file))].map((path) => ({ path, items: items.filter((item) => item.file === path).map((item) => item.id), before: null, candidate: null }));
const newWork = (options: TuneRunOptions, kind: TuneWork["kind"], planId: string | null, of: string | null): TuneWork => ({
  workId: planIdOf(options.clock.nowMs, options.random?.() ?? randomBytes(3).toString("hex")),
  kind,
  planId,
  of,
  createdAt: new Date(options.clock.nowMs).toISOString(),
  appVersion: PROGRAM_VERSION,
  items: [],
  files: [],
});
const engineIo = (options: TuneRunOptions): EngineIo => ({ read: readTarget, replace: replaceSetting, save: (work) => saveWork(options.stateDir, work), ...options.io });
const isUndoable = (item: WorkItem): boolean => item.state === "written" || item.state === "verified";

/** 다시 계획하라는 까닭(계획과 지금이 다른 것) */
const REPLAN = new Set(["no-longer-candidate", "plan-differs", "changed-since-plan", "changed-before-write"]);

function noticesOf(work: TuneWork, engine: readonly EngineNotice[], reconciled: readonly string[]): WorkNotice[] {
  const notices: WorkNotice[] = [];
  if (reconciled.length > 0) notices.push({ kind: "reconciled", count: reconciled.length });
  notices.push(...engine);
  if (work.kind === "apply" && work.items.some((item) => item.state === "not_applied" && item.reason !== null && REPLAN.has(item.reason))) notices.push({ kind: "replan" });
  const written = work.items.filter((item) => item.state === "written");
  if (written.some((item) => item.tool === "claude-code")) notices.push({ kind: "new-session" });
  if (written.some((item) => item.tool === "codex")) notices.push({ kind: "restart-codex" });
  return notices;
}

function outcomeOf(options: TuneRunOptions, started: number, work: TuneWork, notices: WorkNotice[]): TuneWorkOutcome {
  const now = options.now ?? Date.now;
  const text = { items: Object.fromEntries(work.items.map((item) => [item.id, workItemText(item, work.kind, options.lang)])), notices: notices.map((notice) => workNoticeText(notice, options.lang)) };
  return { work, run: { durationMs: now() - started, notices, text } };
}

/** aq tune apply <계획 ID> <항목 ID…>. 판정을 다시 해, 승인받은 항목이 여전히 후보이고 바꿀 변경이 계획과 같을 때만 바꾼다(「6단계 계획 전 결정」 6번) */
export async function runTuneApply(options: TuneRunOptions & { planId: string; itemIds: readonly string[] }): Promise<TuneWorkOutcome> {
  const started = (options.now ?? Date.now)();
  return withLock(options, async () => {
    const reconciled = await reconcileWorks(options.stateDir);
    const plan = await loadPlan(options.stateDir, options.planId);
    if (plan === null) throw failure("plan-not-found", `no saved plan: ${options.planId}`);
    const unknown = options.itemIds.filter((id) => !plan.items.some((item) => item.id === id));
    if (unknown.length > 0) throw failure("item-not-in-plan", `not in the plan: ${unknown.join(", ")}`);
    const { items: fresh } = await judgeTune({ ...options, cache: true });
    const work = newWork(options, "apply", plan.planId, null);
    for (const id of options.itemIds) {
      const planned = plan.items.find((item) => item.id === id)!;
      const now = fresh.find((item) => item.id === id);
      // 바꿀 파일의 경로는 계획 파일을 믿지 않고 다시 한 판정의 것을 쓴다(2부 결정 8번)
      const base = now ?? planned;
      let state: WorkItem["state"] = "planned";
      let reason: string | null = null;
      if (now === undefined) [state, reason] = ["not_applied", "no-longer-candidate"];
      else if (now.blocked !== null) [state, reason] = ["rejected", now.blocked];
      else if (now.file !== planned.file || !isDeepStrictEqual(now.key, planned.key) || !isDeepStrictEqual(now.next, planned.next)) [state, reason] = ["not_applied", "plan-differs"];
      work.items.push({ id, unit: base.unit, tool: base.tool, target: base.target, file: base.file, key: base.key, before: "current" in base ? { present: true, value: base.current } : { present: false }, after: afterOf(base), state, reason });
    }
    work.files = filesOf(work.items);
    // 기록을 먼저 쓰고 나서 바꾼다(16.4)
    await saveWork(options.stateDir, work);
    const engine = await runFiles(work, engineIo(options), new Map(plan.files.map((file) => [file.path, file.fingerprint])));
    return outcomeOf(options, started, work, noticesOf(work, engine, reconciled));
  });
}

/** 아직 되돌릴 것이 남은 가장 최근 적용. 작업 ID가 시각으로 시작하므로 ID 차례의 마지막이 가장 최근이다. 다 되돌린 적용은 건너뛰어, 되풀이해 부르면 한 단계씩 앞의 정비로 간다 */
async function latestUndoable(stateDir: string): Promise<TuneWork | null> {
  return (await listWorks(stateDir)).filter((work) => work.kind === "apply" && work.items.some(isUndoable)).at(-1) ?? null;
}

/**
 * aq tune undo [<작업 ID> [항목 ID…]]. 열쇠 단위로 되돌리고, 그 사이 값이 달라졌으면 덮어쓰지 않는다(16.6). 항목을 주지 않으면 그 작업에서 쓴 것 모두다.
 * 작업 ID가 null이면 아직 되돌릴 것이 남은 가장 최근 적용을 되돌린다(작업 번호를 모르는 새 세션, 0.1.1)
 */
export async function runTuneUndo(options: TuneRunOptions & { workId: string | null; itemIds: readonly string[] }): Promise<TuneWorkOutcome> {
  const started = (options.now ?? Date.now)();
  return withLock(options, async () => {
    const reconciled = await reconcileWorks(options.stateDir);
    const target = options.workId === null ? await latestUndoable(options.stateDir) : await loadWork(options.stateDir, options.workId);
    if (target === null && options.workId === null) throw failure("nothing-to-undo", "no apply run has changes left to undo");
    if (target === null || target.kind !== "apply") throw failure("work-not-found", `no apply run: ${options.workId}`);
    const unknown = options.itemIds.filter((id) => !target.items.some((item) => item.id === id));
    if (unknown.length > 0) throw failure("item-not-in-work", `not in the run: ${unknown.join(", ")}`);
    const chosen = options.itemIds.length > 0 ? target.items.filter((item) => options.itemIds.includes(item.id)) : target.items.filter(isUndoable);
    const work = newWork(options, "undo", null, target.workId);
    work.items = chosen.map((item) => ({ ...item, before: item.after, after: item.before, state: isUndoable(item) ? "planned" : "not_applied", reason: isUndoable(item) ? null : "not-written" }));
    work.files = filesOf(work.items);
    await saveWork(options.stateDir, work);
    const engine = await runFiles(work, engineIo(options), null);
    // 되돌린 항목은 적용의 기록에도 되돌림으로 적는다. 이미 원래 값이던 항목도 그 적용은 더 남아 있지 않으므로 같게 적어, 번호 없는 되돌리기가 그 앞 정비로 가게 한다(0.1.1)
    for (const item of work.items) {
      if (item.state !== "written" && item.reason !== "already-set") continue;
      const original = target.items.find((x) => x.id === item.id)!;
      original.state = "undone";
    }
    await saveWork(options.stateDir, target);
    return outcomeOf(options, started, work, noticesOf(work, engine, reconciled));
  });
}

/** 다시 한 판정에서 그 대상이 아직 켜져 있는지. 후보로 다시 나오는지가 아니라 실제 켜짐을 본다(프로젝트 층이 다시 켠 Codex 서버는 후보가 아니어도 켜져 있다, 6단계 나머지 구현 검증) */
export function stillOn(item: Pick<WorkItem, "unit" | "tool" | "target">, judged: Pick<Judged, "evaluation" | "input">): boolean {
  const tool = judged.evaluation.tools.find((x) => x.tool === item.tool);
  if (tool === undefined) return false;
  switch (item.unit) {
    case "A1":
      return tool.skills.some((bundle) => bundle.enabled && bundle.positions.some((position) => position.recordNames.includes(item.target)));
    case "A2": {
      const input = judged.input.tools.find((x) => x.tool === "claude-code");
      return input !== undefined && input.tool === "claude-code" && input.setup.plugins.some((plugin) => plugin.id === item.target && plugin.enabled);
    }
    case "A3":
    case "A4":
      return tool.servers.some(({ server }) => server.name === item.target && server.enabled);
  }
}

/** aq tune verify <작업 ID>. 쓴 값이 그대로인지 보고, 다시 판정해 그 대상이 어느 층에서도 켜져 있지 않은지 본다(16.7의 바로 하는 확인). 둘 다 맞으면 확인됨으로 적는다 */
export async function runTuneVerify(options: TuneRunOptions & { workId: string }): Promise<TuneVerifyOutcome> {
  const now = options.now ?? Date.now;
  const started = now();
  return withLock(options, async () => {
    const reconciled = await reconcileWorks(options.stateDir);
    const target = await loadWork(options.stateDir, options.workId);
    if (target === null || target.kind !== "apply") throw failure("work-not-found", `no apply run: ${options.workId}`);
    const judged = await judgeTune({ ...options, cache: true });
    const results: VerifyResult[] = [];
    for (const item of target.items) {
      if (!isUndoable(item)) continue;
      const slot = slotOf(await readTarget(item.file), item.key);
      const result = { id: item.id, kept: slot !== null && sameSlot(slot, item.after), stillOn: stillOn(item, judged) };
      if (result.kept && !result.stillOn) item.state = "verified";
      results.push(result);
    }
    await saveWork(options.stateDir, target);
    const notices: WorkNotice[] = reconciled.length > 0 ? [{ kind: "reconciled", count: reconciled.length }] : [];
    const text = { items: Object.fromEntries(results.map((result) => [result.id, verifyText(result, options.lang)])), notices: notices.map((notice) => workNoticeText(notice, options.lang)) };
    return { work: target, run: { durationMs: now() - started, results, notices, text } };
  });
}
