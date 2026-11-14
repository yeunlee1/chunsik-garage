// 평가 결과의 알림 열세 종류의 문장을 본다. 두 언어로 만들고, 수와 정해진 값만 넣고 이름과 경로는 넣지 않는다(설계 12.2, 19.1, 20.1)
import { describe, expect, it } from "vitest";
import { noticeText } from "../../src/core/copy/notices.ts";
import { LANGS } from "../../src/core/copy/lang.ts";
import { NOTICE_KINDS, type Notice } from "../../src/core/result/notices.ts";

/** 알림 열세 종류. 경로와 이름에는 secret을 넣어 문장에 새지 않는지 본다 */
const ALL: Notice[] = [
  { kind: "score_withheld", reasons: ["too_few_requests", "too_few_days"] },
  { kind: "state_reset" },
  { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl", "/secret/b.jsonl"], dirs: ["/secret/dir"] },
  { kind: "observation_incomplete", tool: "claude-code", metric: "skills", reasons: ["unreadable-files", "too-long-lines"] },
  { kind: "setup_unreadable", tool: "claude-code", what: "project_settings", targets: ["/secret/p1", "/secret/p2"] },
  { kind: "plugins_uncounted", tool: "claude-code", why: "composition_unknown", plugins: ["secret@market"] },
  { kind: "setup_problems_unscored", tool: "claude-code", problems: [{ kind: "unparsable", path: "/secret/plugin/hooks.json" }, { kind: "danglingLink", path: "/secret/link" }] },
  { kind: "projects_gone", projects: ["/secret/gone"] },
  { kind: "version_unverified", tool: "claude-code", versions: ["2.1.400"], verified: { from: "2.1.220", to: "2.1.322" } },
  { kind: "weak_human_requests", tool: "claude-code", weak: 5, total: 40 },
  { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
  { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:odd", count: 2 }, { what: "denial:other", count: 1 }, { what: "hook:x", count: 4 }] },
  { kind: "orphan_subsessions", tool: "claude-code", sessions: 1 },
];
const numbers = (text: string): string[] => (text.match(/\d+(?:\.\d+)*/g) ?? []).sort();

describe("알림의 문장", () => {
  it("열세 종류를 모두 담았다", () => {
    expect(ALL.map((notice) => notice.kind)).toEqual(NOTICE_KINDS);
  });

  it.each(ALL)("$kind: 두 언어 모두 문장으로 끝나고 같은 숫자를 싣고 이름과 경로가 없다", (notice) => {
    for (const lang of LANGS) {
      const text = noticeText(notice, lang);
      expect(text, `${lang}: ${text}`).toMatch(/[.!?]$/);
      expect(text).not.toMatch(/secret|market|\/|\\/);
    }
    expect(numbers(noticeText(notice, "ko"))).toEqual(numbers(noticeText(notice, "en")));
  });

  it("수와 정해진 값을 끼운다", () => {
    expect(noticeText(ALL[0]!, "ko")).toBe("AQ를 내지 않았습니다. 점수 구간의 사람 요청이 20개에 못 미칩니다. 점수 구간에 쓴 날이 3일에 못 미칩니다.");
    expect(noticeText(ALL[2]!, "ko")).toBe("Claude Code 기록 가운데 읽지 못한 파일 2개와 폴더 1개가 있습니다. 읽은 것만으로 계산했습니다.");
    expect(noticeText(ALL[2]!, "en")).toBe("Claude Code: 2 files and 1 folder of records could not be read. Only what was read is counted.");
    expect(noticeText(ALL[3]!, "ko")).toBe("Claude Code의 스킬 사용 기록을 빠짐없이 읽지 못해(읽지 못한 파일, 너무 긴 줄) 안 쓰는 것을 판정하지 않았습니다.");
    expect(noticeText(ALL[4]!, "ko")).toBe("Claude Code에서 읽지 못한 셋팅이 있습니다(프로젝트 설정 2곳). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] }, "ko")).toBe("Claude Code에서 읽지 못한 셋팅이 있습니다(.claude.json). 읽은 것만으로 계산했습니다.");
    expect(noticeText(ALL[8]!, "ko")).toBe("Claude Code 기록에 확인한 범위(2.1.220~2.1.322) 밖의 버전이 1개 있습니다. 읽을 수 있는 필드만으로 계산했습니다.");
    expect(noticeText(ALL[11]!, "ko")).toBe("Claude Code에 분류하지 못한 기록이 있습니다(압축 1개, 거절 표시 3개, 훅 첨부 4개).");
    expect(noticeText(ALL[11]!, "en")).toBe("Claude Code: some records could not be classified (1 compaction, 3 denial markers, 4 hook attachments).");
  });

  it("영어는 수가 1이면 단수다", () => {
    expect(noticeText({ kind: "orphan_subsessions", tool: "claude-code", sessions: 1 }, "en")).toBe("Claude Code: 1 subsession has no known parent session.");
    expect(noticeText({ kind: "orphan_subsessions", tool: "claude-code", sessions: 3 }, "en")).toBe("Claude Code: 3 subsessions have no known parent session.");
    // 사람 요청 알림은 요청이 한 건이어도 나온다(근거가 약한 몫이 10%를 넘으면). 요청 수로 명사를, 근거가 약한 수로 동사를 고른다
    const weak = (weakCount: number, total: number) => noticeText({ kind: "weak_human_requests", tool: "claude-code", weak: weakCount, total }, "en");
    expect(weak(1, 1)).toBe("Claude Code: 1 of 1 request in the scoring window has weak evidence of coming from a person.");
    expect(weak(1, 2)).toBe("Claude Code: 1 of 2 requests in the scoring window has weak evidence of coming from a person.");
    expect(weak(2, 2)).toBe("Claude Code: 2 of 2 requests in the scoring window have weak evidence of coming from a person.");
  });
});
