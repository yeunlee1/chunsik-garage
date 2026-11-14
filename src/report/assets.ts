// 결과 화면에 넣을 그림(WebP)을 그림 폴더에서 골라 data URI로 읽는다. 화면마다 필요한 그림만 넣는다(설계 13.3, 「3단계 계획 전 결정」의 12번)
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** 그림의 이름과 그림 폴더의 파일 이름(skills/aq/assets) */
export const ART_FILES = {
  "scene-1": "scene-1.webp",
  "scene-2": "scene-2.webp",
  "scene-3": "scene-3.webp",
  "scene-4": "scene-4.webp",
  "scene-5": "scene-5.webp",
  "scene-few-records": "scene-few-records.webp",
  "scene-unreadable": "scene-unreadable.webp",
  face: "face.webp",
  "sticker-good": "sticker-good.webp",
  "sticker-fix": "sticker-fix.webp",
  "sticker-done": "sticker-done.webp",
} as const;
export type ArtName = keyof typeof ART_FILES;

/** 한 화면에 넣는 그림. 읽지 못한 그림은 null이고 화면은 그 자리를 대체 글로 그린다 */
export interface ReportArt {
  scene: string | null;
  face: string | null;
  /** 「잘하고 있는 것」 옆의 춘삼이 스티커 */
  good: string | null;
  /** 「정비할 것」 옆의 춘식이 스티커(고칠 것이 있을 때와 없을 때) */
  fix: string | null;
}

/** AQ를 냈으면 등급 단계의 장면, 내지 않았으면 기록을 읽지 못했다는 알림이 있을 때 읽지 못함, 없으면 모자람이다 */
export function sceneFor(tier: number | null, unreadable: boolean): ArtName {
  if (tier !== null) return `scene-${tier}` as ArtName;
  return unreadable ? "scene-unreadable" : "scene-few-records";
}

/** 정비할 것이 있으면 고칠 것 스티커, 없으면 다 고침 스티커다 */
export function stickerFor(repairs: number): ArtName {
  return repairs > 0 ? "sticker-fix" : "sticker-done";
}

/** 묶은 실행 파일(<스킬 폴더>/scripts/aq.mjs)이면 그 스킬 폴더의 assets 폴더, 아니면(원본으로 돌릴 때) null이다 */
export function assetsDirOf(entryFile: string): string | null {
  if (basename(entryFile) !== "aq.mjs" || basename(dirname(entryFile)) !== "scripts") return null;
  return join(dirname(dirname(entryFile)), "assets");
}

async function dataUri(dir: string | null, name: ArtName): Promise<string | null> {
  if (dir === null) return null;
  try {
    return `data:image/webp;base64,${(await readFile(join(dir, ART_FILES[name]))).toString("base64")}`;
  } catch {
    return null;
  }
}

/** 화면 하나에 넣을 그림 넷을 읽는다. tier는 등급 단계(AQ가 없으면 null), unreadable은 기록을 읽지 못했다는 알림이 있는지, repairs는 정비할 것의 수다 */
export async function loadArt(dir: string | null, pick: { tier: number | null; unreadable: boolean; repairs: number }): Promise<ReportArt> {
  const [scene, face, good, fix] = await Promise.all([
    dataUri(dir, sceneFor(pick.tier, pick.unreadable)),
    dataUri(dir, "face"),
    dataUri(dir, "sticker-good"),
    dataUri(dir, stickerFor(pick.repairs)),
  ]);
  return { scene, face, good, fix };
}
