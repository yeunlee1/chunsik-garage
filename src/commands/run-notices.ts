// 실행 기록의 알림 다섯 종류의 문장. 오류 코드와 정해진 낱말만 넣고 경로는 넣지 않는다(순수 함수, 설계 12.3, 20.2)
import type { Lang, Texts } from "../core/copy/lang.ts";
import { fill } from "../core/copy/format.ts";
import type { RunNotice } from "./checkup.ts";

/** 상태 폴더에 쓰다가 막힌 단계 */
const STEP: Record<"result" | "state" | "history", Texts<string>> = {
  result: { en: "the result file", ko: "평가 결과 파일을" },
  state: { en: "the state file", ko: "상태 파일을" },
  history: { en: "the score history", ko: "점수 이력을" },
};

/** 점검 때 정리하는 것 */
const PRUNED: Record<"reports" | "cache", Texts<string>> = {
  reports: { en: "old result files", ko: "오래된 결과 파일을" },
  cache: { en: "cache entries whose source is gone", ko: "원본이 없어진 캐시 항목을" },
};

/** 링크라서 정리하지 않은 폴더 */
const FOLDER: Record<"state" | "reports" | "cache", Texts<string>> = {
  state: { en: "state", ko: "상태" },
  reports: { en: "results", ko: "결과" },
  cache: { en: "cache", ko: "캐시" },
};

const LINES: Texts<Record<RunNotice["kind"], string>> = {
  en: {
    save_failed: "Could not write {step} to the state folder ({code}), so the rest was not saved.",
    prune_failed: "Could not clean up {what} ({code}). Saving itself finished.",
    prune_skipped: "The {link} folder is a link, so {what} were not cleaned up.",
    not_saved: "This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history.",
    result_unwritten: "Could not write the result file to the OS temp folder ({code}), so only the summary is given.",
  },
  ko: {
    save_failed: "상태 폴더에 {step} 쓰지 못해({code}) 남은 저장을 멈췄습니다.",
    prune_failed: "{what} 정리하지 못했습니다({code}). 저장은 끝났습니다.",
    prune_skipped: "{link} 폴더가 링크라서 {what} 정리하지 않았습니다.",
    not_saved: "저장하지 않는 실행이라 상태 폴더에 아무것도 쓰지 않았습니다. 이 점검은 캐시를 쓰지 않았고 점수 이력에도 남지 않습니다.",
    result_unwritten: "평가 결과 파일을 운영체제 임시 폴더에 쓰지 못해({code}) 요약만 냅니다.",
  },
};

export function runNoticeText(notice: RunNotice, lang: Lang): string {
  const lines = LINES[lang];
  switch (notice.kind) {
    case "save_failed":
      return fill(lines.save_failed, { step: STEP[notice.step][lang], code: notice.code });
    case "prune_failed":
      return fill(lines.prune_failed, { what: PRUNED[notice.what][lang], code: notice.code });
    case "prune_skipped":
      return fill(lines.prune_skipped, { link: FOLDER[notice.link][lang], what: PRUNED[notice.what][lang] });
    case "not_saved":
      return lines.not_saved;
    case "result_unwritten":
      return fill(lines.result_unwritten, { code: notice.code });
  }
}
