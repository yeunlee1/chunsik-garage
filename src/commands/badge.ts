// aq badge. 이력에서 AQ가 있는 가장 최근 점검으로 README·프로필에 붙일 배지 그림을 상태 폴더에 만들고, 붙일 한 줄을 준다. 바깥을 부르지 않는다(설계 「0.2.0에서 정한 것」)
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fill } from "../core/copy/format.ts";
import type { Lang } from "../core/copy/lang.ts";
import { gradeOf, type Grade } from "../core/score.ts";
import { badgeSvg } from "../report/badge.ts";
import { recentAq } from "../state/history.ts";

export const BADGE_FILE = "badge.svg";
/** 배지를 누르면 가는 곳(이 도구의 저장소) */
export const BADGE_LINK = "https://github.com/yeunlee1/chunsik-garage";

const COPY = {
  en: { made: "Made the AQ {aq} · {grade} badge from the checkup of {date}. The file is at {path}.", howTo: "Put this file next to your README and add the line below to the README." },
  ko: { made: "{date} 점검의 AQ {aq} · {grade}로 배지를 만들었습니다. 파일은 {path}에 있습니다.", howTo: "이 파일을 README와 같은 폴더에 두고 아래 줄을 README에 붙이세요." },
} as const;

export interface BadgeOutcome {
  badge: { path: string; aq: number; grade: Grade; at: string; markdown: string };
  run: { text: { made: string; howTo: string } };
}

const failure = (code: string, message: string): Error => Object.assign(new Error(message), { code });

/** 이 PC의 시간대로 본 날짜(YYYY-MM-DD) */
const localDate = (iso: string, timeZone: string): string => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export async function runBadge(options: { stateDir: string; lang: Lang; timeZone: string }): Promise<BadgeOutcome> {
  const scored = (await recentAq(options.stateDir, Number.MAX_SAFE_INTEGER)).filter((entry): entry is { at: string; aq: number } => entry.aq !== null && !Number.isNaN(Date.parse(entry.at)));
  const latest = scored.at(-1);
  if (latest === undefined) throw failure("no-score", "no saved checkup has an AQ");
  const { grade } = gradeOf(latest.aq);
  const path = join(options.stateDir, BADGE_FILE);
  // 쓰다 끊겨도 반쪽 그림이 남지 않게 옆 이름에 쓰고 바꾼다
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await mkdir(options.stateDir, { recursive: true });
    await writeFile(temp, badgeSvg({ aq: latest.aq, grade }));
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw failure("badge-unwritten", `could not write the badge (${(error as NodeJS.ErrnoException).code ?? "unknown"})`);
  }
  const copy = COPY[options.lang];
  return {
    badge: { path, aq: latest.aq, grade, at: latest.at, markdown: `[![AQ ${latest.aq} · ${grade}](${BADGE_FILE})](${BADGE_LINK})` },
    run: { text: { made: fill(copy.made, { aq: latest.aq, grade, date: localDate(latest.at, options.timeZone), path }), howTo: copy.howTo } },
  };
}
