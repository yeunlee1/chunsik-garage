// 현지 날짜 바꾸기와 점수·수집 구간 계산을 시험한다
import { describe, expect, it } from "vitest";
import { localDateOf, localDateOfIso, makeWindows } from "../../../src/adapters/common/dates.ts";

const ms = (iso: string): number => Date.parse(iso);

describe("localDateOf", () => {
  it("서울(+9)의 자정 경계", () => {
    expect(localDateOf(ms("2026-11-11T14:59:59Z"), "Asia/Seoul")).toBe("2026-11-11");
    expect(localDateOf(ms("2026-11-11T15:00:00Z"), "Asia/Seoul")).toBe("2026-11-12");
  });
  it("카트만두(+5:45)처럼 15분 단위의 시차도 맞다", () => {
    expect(localDateOf(ms("2026-11-11T18:14:59Z"), "Asia/Kathmandu")).toBe("2026-11-11");
    expect(localDateOf(ms("2026-11-11T18:15:00Z"), "Asia/Kathmandu")).toBe("2026-11-12");
  });
  it("뉴욕의 서머타임이 끝나는 날 앞뒤", () => {
    expect(localDateOf(ms("2026-11-01T03:59:59Z"), "America/New_York")).toBe("2026-10-31");
    expect(localDateOf(ms("2026-11-01T04:00:00Z"), "America/New_York")).toBe("2026-11-01");
    expect(localDateOf(ms("2026-11-02T04:59:59Z"), "America/New_York")).toBe("2026-11-01");
    expect(localDateOf(ms("2026-11-02T05:00:00Z"), "America/New_York")).toBe("2026-11-02");
  });
  it("읽지 못하는 시각은 null", () => {
    expect(localDateOfIso("nope", "UTC")).toBeNull();
    expect(localDateOfIso(undefined, "UTC")).toBeNull();
    expect(localDateOfIso("2026-11-12T00:00:00Z", "UTC")).toBe("2026-11-12");
  });
});

describe("makeWindows", () => {
  it("수집 35개, 점수 30개이고 마지막 날이 오늘이다", () => {
    const w = makeWindows(ms("2026-11-12T03:00:00Z"), "Asia/Seoul");
    expect(w.today).toBe("2026-11-12");
    expect(w.collectDates).toHaveLength(35);
    expect(w.scoreDates).toHaveLength(30);
    expect(w.collectDates[0]).toBe("2026-10-09");
    expect(w.collectDates[34]).toBe("2026-11-12");
    expect(w.scoreDates[0]).toBe("2026-10-14");
  });
  it("수정 시각으로 거르는 아래 경계는 첫날 UTC 자정보다 14시간 앞이다", () => {
    const w = makeWindows(ms("2026-11-12T03:00:00Z"), "Asia/Seoul");
    expect(w.collectStartLowerBoundMs).toBe(Date.UTC(2026, 9, 9) - 14 * 3600 * 1000);
  });
});
