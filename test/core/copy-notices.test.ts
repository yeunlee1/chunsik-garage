// 평가 결과의 알림 스물세 종류의 문장을 본다. 두 언어로 만들고, 수와 정해진 값만 넣고 이름과 경로는 넣지 않는다(설계 12.2, 19.1, 20.1)
import { describe, expect, it } from "vitest";
import { noticeText } from "../../src/core/copy/notices.ts";
import { LANGS } from "../../src/core/copy/lang.ts";
import { NOTICE_KINDS, type Notice } from "../../src/core/result/notices.ts";

/** 알림 스물세 종류. 경로와 이름에는 secret을 넣어 문장에 새지 않는지 본다 */
const ALL: Notice[] = [
  { kind: "score_withheld", reasons: ["too_few_requests", "too_few_days"] },
  { kind: "state_reset" },
  {
    kind: "credentials_in_config",
    tool: "claude-code",
    places: [
      { scope: "user", server: "secret-server", projectRoot: null, field: "env", key: "SECRET_TOKEN" },
      { scope: "project", server: "secret-two", projectRoot: "/secret/p", field: "headers", key: "Authorization" },
    ],
  },
  { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl", "/secret/b.jsonl"], dirs: ["/secret/dir"] },
  { kind: "record_skipped", tool: "codex", files: ["/secret/a.jsonl.zst"] },
  { kind: "record_partial", tool: "codex", files: ["/secret/p.jsonl.zst", "/secret/q.jsonl.zst"] },
  { kind: "observation_incomplete", tool: "claude-code", metric: "skills", reasons: ["unreadable-files", "too-long-lines"] },
  { kind: "setup_unreadable", tool: "claude-code", what: "project_settings", targets: ["/secret/p1", "/secret/p2"] },
  { kind: "plugins_uncounted", tool: "claude-code", why: "composition_unknown", plugins: ["secret@market"] },
  { kind: "setup_problems_unscored", tool: "claude-code", problems: [{ kind: "unparsable", path: "/secret/plugin/hooks.json" }, { kind: "danglingLink", path: "/secret/link" }] },
  { kind: "projects_gone", projects: ["/secret/gone"] },
  { kind: "version_unverified", tool: "claude-code", versions: ["2.1.400"], verified: { from: "2.1.220", to: "2.1.322" } },
  { kind: "weak_human_requests", tool: "claude-code", weak: 5, total: 40 },
  { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
  { kind: "unverified_inheritance", tool: "codex", sessions: 2 },
  { kind: "id_fallbacks", tool: "codex", counts: [{ why: "first-line-unreadable", count: 2 }, { why: "no-lines", count: 1 }] },
  { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:odd", count: 2 }, { what: "denial:other", count: 1 }, { what: "hook:x", count: 4 }] },
  { kind: "orphan_subsessions", tool: "claude-code", sessions: 1 },
  { kind: "parent_record_missing", tool: "codex", sessions: 1 },
  { kind: "merged_sessions", tool: "codex", sessions: 3 },
  { kind: "unknown_mtime_sessions", tool: "codex", sessions: 1 },
  { kind: "skipped_copies", tool: "codex", count: 4 },
  { kind: "unnamed_files", tool: "codex", count: 1 },
];
const of = (kind: Notice["kind"]): Notice => ALL.find((notice) => notice.kind === kind)!;
const numbers = (text: string): string[] => (text.match(/\d+(?:\.\d+)*/g) ?? []).sort();

describe("알림의 문장", () => {
  it("스물세 종류를 모두 담았다", () => {
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
    expect(noticeText(of("score_withheld"), "ko")).toBe("AQ를 내지 않았습니다. 점수 구간의 사람 요청이 20개에 못 미칩니다. 점수 구간에 쓴 날이 3일에 못 미칩니다.");
    expect(noticeText(of("record_unreadable"), "ko")).toBe("Claude Code 기록 가운데 읽지 못한 파일 2개와 폴더 1개가 있습니다. 읽은 것만으로 계산했습니다.");
    expect(noticeText(of("record_unreadable"), "en")).toBe("Claude Code: 2 files and 1 folder of records could not be read. Only what was read is counted.");
    expect(noticeText(of("observation_incomplete"), "ko")).toBe("Claude Code의 스킬 사용 기록을 빠짐없이 읽지 못해(읽지 못한 파일, 너무 긴 줄) 안 쓰는 것을 판정하지 않았습니다.");
    expect(noticeText(of("setup_unreadable"), "ko")).toBe("Claude Code에서 읽지 못한 셋팅이 있습니다(프로젝트 설정 2곳). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] }, "ko")).toBe("Claude Code에서 읽지 못한 셋팅이 있습니다(.claude.json). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "codex", what: "codex_config", targets: [] }, "ko")).toBe("Codex에서 읽지 못한 셋팅이 있습니다(config.toml). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "codex", what: "codex_project_config", targets: ["/secret/p"] }, "ko")).toBe("Codex에서 읽지 못한 셋팅이 있습니다(프로젝트의 config.toml 1곳). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "codex", what: "codex_project_config", targets: ["/secret/p"] }, "en")).toBe("Codex: some setup could not be read (project config.toml, 1 place). Only what was read is counted.");
    expect(noticeText(of("version_unverified"), "ko")).toBe("Claude Code 기록에 확인한 범위(2.1.220~2.1.322) 밖의 버전이 1개 있습니다. 읽을 수 있는 필드만으로 계산했습니다.");
    expect(noticeText(of("unclassified"), "ko")).toBe("Claude Code에 분류하지 못한 기록이 있습니다(압축 1개, 거절 표시 3개, 훅 첨부 4개).");
    expect(noticeText(of("unclassified"), "en")).toBe("Claude Code: some records could not be classified (1 compaction, 3 denial markers, 4 hook attachments).");
  });

  it("Codex의 알림. 건너뛴 압축 파일은 zstd를 풀 수 있는 Node.js를 알리고, 세션 ID를 대신 쓴 기록은 까닭별 수를 더한다(설계 「5단계 4부 계획 전 결정」 3번)", () => {
    expect(noticeText(of("record_skipped"), "ko")).toBe("Codex 기록 가운데 이 Node.js가 zstd 압축을 풀지 못해 건너뛴 파일이 1개 있습니다. Node.js 22는 22.15.0 이상, 23은 23.8.0 이상, 24부터는 모든 버전에서 읽힙니다.");
    expect(noticeText(of("record_skipped"), "en")).toBe("Codex: 1 compressed record file was skipped because this Node.js cannot unpack zstd. Node.js 22.15.0 or later on 22, 23.8.0 or later on 23, and any version from 24 read them.");
    expect(noticeText(of("record_partial"), "ko")).toBe("Codex 기록 가운데 앞부분만 읽은 파일이 2개 있습니다. 읽은 부분만 계산해서 읽지 못한 비율은 적어도 보이는 값입니다.");
    expect(noticeText(of("unverified_inheritance"), "ko")).toBe("Codex에서 다른 기록에서 이어받은 앞부분을 확인하지 못한 세션이 2개 있습니다. 그 숫자는 가까운 값입니다.");
    expect(noticeText(of("id_fallbacks"), "ko")).toBe("Codex 기록 가운데 첫 줄에서 세션 ID를 얻지 못해 파일 이름으로 세션을 가른 것이 3개 있습니다. 같은 세션이 둘로 나뉘거나 앞부분을 다시 셌을 수 있습니다.");
    expect(noticeText(of("id_fallbacks"), "en")).toBe("Codex: the session ID could not be taken from the first line of 3 records, so the file name stood in for it. A session may be split in two, or an earlier part counted again.");
    // 첫 줄은 읽었는데 세션 ID만 없는 기록도 같은 문장이다. 첫 줄을 읽지 못했다고 하지 않는다(4부 계획 리뷰 1차)
    const metaWithoutId: Notice = { kind: "id_fallbacks", tool: "codex", counts: [{ why: "meta-without-id", count: 1 }] };
    expect(noticeText(metaWithoutId, "ko")).not.toContain("읽지 못해");
    expect(noticeText(metaWithoutId, "en")).not.toContain("could not be read");
    expect(noticeText(of("parent_record_missing"), "ko")).toBe("Codex에 부모 세션의 기록을 찾지 못한 하위 세션이 1개 있습니다.");
    expect(noticeText(of("merged_sessions"), "ko")).toBe("Codex에서 기록 파일이 둘 이상인 세션 3개는 세션 하나씩으로 합쳐 셌습니다.");
    expect(noticeText(of("unknown_mtime_sessions"), "ko")).toBe("Codex에서 수정 시각을 보지 못한 사본이 있는 세션이 1개 있습니다. 수정 시각을 아는 사본을 먼저 읽었습니다.");
    expect(noticeText(of("skipped_copies"), "ko")).toBe("Codex에서 같은 기록의 다른 사본 4개는 읽지 않았습니다. 기록마다 사본 하나만 읽습니다.");
    expect(noticeText(of("unnamed_files"), "ko")).toBe("Codex 기록 폴더에서 이름으로 기록을 알아볼 수 없는 파일 1개는 읽지 않았습니다.");
    expect(noticeText(of("unnamed_files"), "en")).toBe("Codex: 1 file in the records folder could not be recognized by name and was not read.");
    const unclassified: Notice = { kind: "unclassified", tool: "codex", counts: [{ what: "item:Plan", count: 3 }, { what: "thread_source:secret", count: 2 }] };
    expect(noticeText(unclassified, "ko")).toBe("Codex에 분류하지 못한 기록이 있습니다(주 세션으로 센 출처 모를 세션 2개, 종류를 모르는 실행 항목 3개).");
    expect(noticeText(unclassified, "en")).toBe("Codex: some records could not be classified (2 sessions of unknown origin counted as main, 3 work items of an unknown kind).");
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
