// 등급의 별명과 진단 한 줄, AQ를 내지 않았을 때의 한 줄, 빈 목록의 문장을 본다(설계 11.4의 7, 11.5, 11.6)
import { describe, expect, it } from "vitest";
import { GRADE_COPY, resultText } from "../../src/core/copy/grades.ts";
import type { Overall } from "../../src/core/scoreboard.ts";

const scored = (tier: 1 | 2 | 3 | 4 | 5): Overall => ({ aq: 70, grade: "B", tier, withheld: [], missingAxes: [] });
const withheld = (reasons: Overall["withheld"]): Overall => ({ aq: null, grade: null, tier: null, withheld: reasons, missingAxes: [] });

describe("등급의 별명", () => {
  it("설계 11.6의 표 그대로다", () => {
    expect(Object.fromEntries(Object.entries(GRADE_COPY).map(([tier, copy]) => [tier, [copy.ko.name, copy.en.name]]))).toEqual({
      5: ["명세서 졸업식", "Graduation Day"],
      4: ["합격 도장", "Stamp of Approval"],
      3: ["팔 걷고 수리", "Sleeves Up"],
      2: ["누가 이랬어?", "Who did this?"],
      1: ["번개 베기", "Lightning Slash"],
    });
  });

  it("진단은 등급마다 한 줄이고 문장으로 끝난다. 가장 낮은 등급도 사용자를 탓하지 않는다", () => {
    for (const copy of Object.values(GRADE_COPY)) for (const text of [copy.en.diagnosis, copy.ko.diagnosis]) expect(text).toMatch(/[.!?]$/);
    expect(GRADE_COPY[1].ko.diagnosis).toBe("손볼 곳이 많습니다. 춘식이가 바로 시작합니다.");
  });
});

describe("결과의 문장", () => {
  it("점수를 냈으면 등급의 별명과 진단이다", () => {
    expect(resultText(scored(4), ["strength", "repair"], "ko")).toEqual({ grade: "합격 도장", diagnosis: GRADE_COPY[4].ko.diagnosis, noStrengths: null, noRepairs: null });
    expect(resultText(scored(2), ["strength", "repair"], "en")).toMatchObject({ grade: "Who did this?", diagnosis: GRADE_COPY[2].en.diagnosis });
  });

  it("기록이 모자라 AQ를 내지 않았으면 기록이 부족하다고 하고(점수가 나온다고 약속하지 않는다), 잰 기준이 없을 뿐이면 그렇게 말한다", () => {
    expect(resultText(withheld(["too_few_requests"]), [], "ko")).toMatchObject({ grade: null, diagnosis: "점수를 내는 데 필요한 기록이 부족합니다. 사용 기록이 더 쌓인 뒤 다시 점검해 보세요." });
    expect(resultText(withheld(["too_few_days", "no_axes"]), [], "ko").diagnosis).toBe("점수를 내는 데 필요한 기록이 부족합니다. 사용 기록이 더 쌓인 뒤 다시 점검해 보세요.");
    expect(resultText(withheld(["no_axes"]), [], "ko").diagnosis).toBe("잴 수 있는 기준이 없어 점수를 내지 못했습니다.");
    expect(resultText(withheld(["too_few_requests"]), [], "en").diagnosis).toBe("There are not enough records for a score yet. Try another checkup after more use has been recorded.");
  });

  it("잘하고 있는 것이나 정비할 것이 없으면 그 단에 적는 문장을 낸다", () => {
    expect(resultText(scored(3), ["average", "unmeasured"], "ko")).toMatchObject({
      noStrengths: "아직 뚜렷한 강점을 찾지 못했습니다. 고칠 것부터 하나씩 해 봅시다.",
      noRepairs: "지금은 고칠 것이 없습니다.",
    });
    expect(resultText(scored(3), ["repair"], "en")).toMatchObject({ noStrengths: "No clear strength was found yet. Let's start with the fixes, one at a time.", noRepairs: null });
  });
});
