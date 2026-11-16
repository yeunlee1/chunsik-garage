// 결과 화면의 고정 글을 시험한다. 두 언어가 다 있고 끼우는 자리가 같은지, 버전을 뜻하는 "판"이나 콜론으로 끝나는 한국어 문장이 없는지, 꼬리의 약속 문장이 설계와 글자 그대로인지(설계 13.2, 19.1, 「3단계 계획 전 결정」의 11번)
import { describe, expect, it } from "vitest";
import { slots } from "../../src/core/copy/format.ts";
import { PROBLEM_KIND_COPY, REPORT_COPY, SCENE_ALT, STATUS_COPY, WEEKDAYS, copyOf } from "../../src/report/copy.ts";

const TABLES = { REPORT_COPY, STATUS_COPY, PROBLEM_KIND_COPY, SCENE_ALT } as const;
const cells = Object.entries(TABLES).flatMap(([table, entries]) => Object.entries(entries).map(([key, texts]) => ({ id: `${table}.${key}`, en: texts.en as string, ko: texts.ko as string })));

describe("결과 화면의 고정 글", () => {
  it("칸마다 두 언어가 다 있고 끼우는 자리가 같다", () => {
    expect(cells.length).toBeGreaterThan(90);
    for (const cell of cells) {
      expect(cell.en.trim(), cell.id).not.toBe("");
      expect(cell.ko.trim(), cell.id).not.toBe("");
      expect(slots(cell.ko).sort(), cell.id).toEqual(slots(cell.en).sort());
    }
    expect(WEEKDAYS.en).toHaveLength(7);
    expect(WEEKDAYS.ko).toHaveLength(7);
  });
  it("한국어에 버전을 뜻하는 \"판\"이 없고, 한국어 문장이 콜론으로 끝나지 않는다", () => {
    for (const cell of cells) {
      expect(cell.ko, cell.id).not.toMatch(/판(?!정|단)/);
      expect(cell.ko, cell.id).not.toMatch(/[:：]\s*$/);
    }
  });
  it("꼬리의 약속 문장은 설계 19.1의 통일 문장 그대로다", () => {
    expect(copyOf("footPromise", "ko")).toBe("프로그램과 결과 화면은 바깥으로 아무것도 보내지 않습니다. AI에게는 점수와 집계, 정비할 것의 이름이 전해집니다. 대화 내용과 지침의 글은 전해지지 않습니다. 정밀 점검을 시키면 고른 지침 파일을 AI가 읽습니다.");
  });
  it("시안에만 있던 글(합성 예시, 임시 그림, 후보 띠, 각주)은 없다", () => {
    const all = cells.map((cell) => `${cell.en} ${cell.ko}`).join("\n");
    for (const word of ["합성 예시", "임시 그림", "Synthetic", "Temporary art", "후보", "각주"]) expect(all).not.toContain(word);
  });
  it("장면 일곱 장마다 그림이 무엇을 하는지 적은 대체 글이 있다", () => {
    expect(Object.keys(SCENE_ALT).sort()).toEqual(["scene-1", "scene-2", "scene-3", "scene-4", "scene-5", "scene-few-records", "scene-unreadable"]);
  });
  it("「일부만 읽었다」 띠는 아래 경계 문장에만 「적어도」를 달고, 비율을 낼 수 없는 문장에는 숫자 자리가 없다(설계 20.1)", () => {
    expect(REPORT_COPY.partialReadAtLeast.ko).toContain("적어도 {share}");
    expect(REPORT_COPY.partialReadAtLeast.en).toContain("At least {share}");
    for (const lang of ["en", "ko"] as const) {
      expect(REPORT_COPY.partialRead[lang], lang).not.toMatch(/적어도|at least/i);
      expect(slots(REPORT_COPY.partialRead[lang]).sort(), lang).toEqual(["share", "tool"]);
      expect(slots(REPORT_COPY.partialReadUnknown[lang]), lang).toEqual(["tool"]);
    }
  });
});
