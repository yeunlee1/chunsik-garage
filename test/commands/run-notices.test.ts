// 실행 기록의 알림 여덟 종류의 문장을 본다. 두 언어로 만들고 오류 코드와 정해진 낱말만 넣는다(설계 12.3, 20.2)
import { describe, expect, it } from "vitest";
import type { RunNotice } from "../../src/commands/checkup.ts";
import { runNoticeText } from "../../src/commands/run-notices.ts";
import { LANGS } from "../../src/core/copy/lang.ts";

const ALL: RunNotice[] = [
  { kind: "save_failed", step: "state", code: "EACCES" },
  { kind: "prune_failed", what: "cache", code: "EPERM" },
  { kind: "prune_skipped", what: "reports", link: "state" },
  { kind: "not_saved" },
  { kind: "result_unwritten", code: "ENOENT" },
  { kind: "report_failed", code: "EPERM" },
  { kind: "report_unwritten", code: "ENOENT" },
  { kind: "report_unopened" },
];

describe("실행 알림의 문장", () => {
  it.each(ALL)("$kind: 두 언어 모두 문장으로 끝나고 오류 코드를 그대로 싣는다", (notice) => {
    for (const lang of LANGS) {
      const text = runNoticeText(notice, lang);
      expect(text, `${lang}: ${text}`).toMatch(/[.!?]$/);
      if ("code" in notice) expect(text).toContain(`(${notice.code})`);
    }
  });

  it("단계, 정리한 것, 링크인 폴더의 낱말을 끼운다", () => {
    expect(runNoticeText(ALL[0]!, "ko")).toBe("상태 폴더에 상태 파일을 쓰지 못해(EACCES) 남은 저장을 멈췄습니다.");
    expect(runNoticeText({ kind: "save_failed", step: "result", code: "ENOTDIR" }, "en")).toBe("Could not write the result file to the state folder (ENOTDIR), so the rest was not saved.");
    expect(runNoticeText(ALL[1]!, "ko")).toBe("원본이 없어진 캐시 항목을 정리하지 못했습니다(EPERM). 저장은 끝났습니다.");
    expect(runNoticeText(ALL[2]!, "ko")).toBe("상태 폴더가 링크라서 오래된 결과 파일을 정리하지 않았습니다.");
    expect(runNoticeText({ kind: "prune_skipped", what: "cache", link: "cache" }, "en")).toBe("The cache folder is a link, so cache entries whose source is gone were not cleaned up.");
    expect(runNoticeText(ALL[3]!, "ko")).toBe("저장하지 않는 실행이라 상태 폴더에 아무것도 쓰지 않았습니다. 이 점검은 캐시를 쓰지 않았고 점수 이력에도 남지 않습니다.");
    expect(runNoticeText(ALL[4]!, "ko")).toBe("평가 결과 파일을 운영체제 임시 폴더에 쓰지 못해(ENOENT) 요약만 냅니다.");
  });
});
