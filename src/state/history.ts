// 점수 이력(history.jsonl)에 점검마다 한 줄(시각, AQ, 기준 점수, 빠진 기준, 규칙 버전)을 더한다. 결과 화면의 이력 그래프가 읽는다(설계 12.3, 18.1)
import { appendFile, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { Axis } from "../core/rules.ts";
import { AXES, type AxisScore, type Overall } from "../core/scoreboard.ts";

export const HISTORY_FILE = "history.jsonl";

export interface HistoryEntry {
  /** 평가 시계(점검을 시작한 시각, ISO) */
  at: string;
  aq: number | null;
  /** 기준 점수. 그 기준의 규칙을 하나도 못 쟀으면 null이다 */
  axes: Record<Axis, number | null>;
  /** 점수를 못 낸 기준(기준의 차례) */
  missingAxes: Axis[];
  rulesVersion: string;
}

/** 평가에서 이력의 한 줄을 만든다(순수) */
export function historyEntry(evaluation: { rulesVersion: string; score: Overall; axes: readonly AxisScore[] }, nowMs: number): HistoryEntry {
  const byAxis = new Map(evaluation.axes.map((axis) => [axis.axis, axis.score]));
  const axes = Object.fromEntries(AXES.map((axis) => [axis, byAxis.get(axis) ?? null])) as Record<Axis, number | null>;
  return { at: new Date(nowMs).toISOString(), aq: evaluation.score.aq, axes, missingAxes: [...evaluation.score.missingAxes], rulesVersion: evaluation.rulesVersion };
}

/** 마지막 바이트가 줄바꿈이 아니면 참이다. 파일이 없거나 비었으면 거짓이다 */
async function endsMidLine(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  try {
    const { size } = await handle.stat();
    if (size === 0) return false;
    const last = Buffer.alloc(1);
    await handle.read(last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } finally {
    await handle.close();
  }
}

/** 이력에 한 줄을 더한다. 앞 줄이 줄바꿈 없이 끝나 있으면(쓰다 끊겼다) 줄바꿈을 먼저 넣어 새 줄이 붙지 않게 한다 */
export async function appendHistory(stateDir: string, entry: HistoryEntry): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  const path = join(stateDir, HISTORY_FILE);
  const prefix = (await endsMidLine(path)) ? "\n" : "";
  await appendFile(path, `${prefix}${JSON.stringify(entry)}\n`);
}
