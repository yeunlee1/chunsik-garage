// 정비 계획의 모양, 정비가 바꾸는 열쇠의 뜻을 확인한 버전 범위, 계획 ID, 상태 폴더에 저장하기(설계 16.2 끝, 16.5의 1번, 「6단계 1부 계획 전 결정」 5·7번)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ToolId } from "../adapters/types.ts";
import { compareVersions, parseVersion } from "../adapters/common/version.ts";
import { resultStamp, writeJson } from "../state/reports.ts";
import type { TargetRead, TuneItem } from "./items.ts";

/** 정비가 바꾸는 열쇠의 뜻을 확인한 범위. Claude Code의 2.1.325는 「6단계 계획 전 결정」 2번의 실측, Codex는 5단계에서 읽은 공개 소스다 */
export const TUNE_VERIFIED: Record<ToolId, { from: string; to: string }> = { "claude-code": { from: "2.1.220", to: "2.1.325" }, codex: { from: "0.166.0", to: "0.166.0" } };

/** 그 도구의 버전(가장 높은 기록 버전)이 확인한 범위 안인지. 버전을 모르면 범위 밖이다 */
export function versionVerified(tool: ToolId, version: string | null): boolean {
  const parsed = parseVersion(version);
  if (parsed === null) return false;
  const range = TUNE_VERIFIED[tool];
  return compareVersions(parsed, parseVersion(range.from)!) >= 0 && compareVersions(parsed, parseVersion(range.to)!) <= 0;
}

/** 바꿀 파일 하나. 지문은 계획 때 읽은 원본 바이트의 SHA-256이고, 읽지 못했으면 null이다 */
export interface TunePlanFile {
  path: string;
  status: TargetRead["status"];
  fingerprint: string | null;
  /** 이 파일의 항목 ID */
  items: string[];
}

export interface TunePlan {
  /** 저장하지 않았거나 저장하지 못했으면 null이다(그 계획은 적용할 수 없다) */
  planId: string | null;
  createdAt: string;
  appVersion: string;
  items: TuneItem[];
  files: TunePlanFile[];
}

/** 계획의 실행 알림. 저장하지 않은 계획과 저장하지 못한 계획은 적용할 수 없다 */
export type TuneRunNotice = { kind: "not_saved" } | { kind: "plan_unsaved"; code: string } | { kind: "unfinished_work"; count: number };

/** 계획 ID. 결과 파일과 같은 시각 꼴에 무작위 여섯 글자를 붙인다 */
export function planIdOf(nowMs: number, random: string): string {
  return `${resultStamp(nowMs)}-${random}`;
}

export const PLANS_DIR = join("tune", "plans");

/** 상태 폴더의 tune/plans/<계획 ID>.json에 임시 파일에 쓰고 이름을 바꾸는 방식으로 쓰고 경로를 돌려준다. 쓰지 못하면 던진다 */
export async function writePlan(stateDir: string, plan: TunePlan & { planId: string }): Promise<string> {
  const dir = join(stateDir, PLANS_DIR);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${plan.planId}.json`);
  await writeJson(path, plan);
  return path;
}
