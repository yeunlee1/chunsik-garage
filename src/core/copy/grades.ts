// 등급의 별명과 진단 한 줄, AQ를 내지 않았을 때의 한 줄, 빈 목록의 문장. 낮은 점수에서도 사용자를 탓하지 않고 정비소가 일하는 쪽으로 쓴다(순수 함수, 설계 11.4의 7, 11.5, 11.6)
import type { Category, Overall } from "../scoreboard.ts";
import type { Lang, Texts } from "./lang.ts";

/** 장면의 단계(5가 S)마다 별명과 진단. 별명은 사용자가 정한 것이다(설계 11.6) */
export const GRADE_COPY: Record<1 | 2 | 3 | 4 | 5, Texts<{ name: string; diagnosis: string }>> = {
  5: {
    en: { name: "Graduation Day", diagnosis: "Your AQ is in the highest grade band. Check each item's result as well." },
    ko: { name: "명세서 졸업식", diagnosis: "AQ가 가장 높은 등급입니다. 항목마다의 결과도 함께 보세요." },
  },
  4: {
    en: { name: "Stamp of Approval", diagnosis: "Your AQ is in a high grade band. Check each item's result as well." },
    ko: { name: "합격 도장", diagnosis: "AQ가 높은 등급입니다. 항목마다의 결과도 함께 보세요." },
  },
  3: {
    en: { name: "Sleeves Up", diagnosis: "Let's go through the results item by item. If anything needs work, Chunsik will help fix it." },
    ko: { name: "팔 걷고 수리", diagnosis: "점검 결과를 항목마다 살펴봅시다. 손볼 곳이 있으면 춘식이가 함께 고칩니다." },
  },
  2: {
    en: { name: "Who did this?", diagnosis: "Let's look at the checked items one by one. Chunsik will go through them with you." },
    ko: { name: "누가 이랬어?", diagnosis: "점검한 항목을 하나씩 살펴봅시다. 춘식이가 함께 확인합니다." },
  },
  1: {
    en: { name: "Lightning Slash", diagnosis: "There is a lot to fix. Chunsik is starting right away." },
    ko: { name: "번개 베기", diagnosis: "손볼 곳이 많습니다. 춘식이가 바로 시작합니다." },
  },
};

/** AQ를 내지 않았을 때의 한 줄. 기록이 모자라면 필요한 기록이 부족하다고 하고(쌓이기만 하면 점수가 나온다고 약속하지 않는다), 잰 기준이 없을 뿐이면 그렇게 말한다 */
const WITHHELD_COPY: Texts<{ records: string; noAxes: string }> = {
  en: { records: "There are not enough records for a score yet. Try another checkup after more use has been recorded.", noAxes: "No criterion could be measured, so there is no score." },
  ko: { records: "점수를 내는 데 필요한 기록이 부족합니다. 사용 기록이 더 쌓인 뒤 다시 점검해 보세요.", noAxes: "잴 수 있는 기준이 없어 점수를 내지 못했습니다." },
};

/** 빈 목록의 문장(설계 11.5 「빈 목록」) */
const EMPTY_COPY: Texts<{ strengths: string; repairs: string }> = {
  en: { strengths: "No clear strength was found yet. Let's start with the fixes, one at a time.", repairs: "Nothing needs fixing right now." },
  ko: { strengths: "아직 뚜렷한 강점을 찾지 못했습니다. 고칠 것부터 하나씩 해 봅시다.", repairs: "지금은 고칠 것이 없습니다." },
};

/** 평가 결과 전체의 문장(한 언어) */
export interface ResultText {
  /** 등급의 별명. AQ를 내지 않았으면 null이다 */
  grade: string | null;
  /** 진단 한 줄. AQ를 내지 않았으면 그 까닭의 한 줄이다 */
  diagnosis: string;
  /** 잘하고 있는 것이 하나도 없을 때 그 단에 적는 문장. 있으면 null이다 */
  noStrengths: string | null;
  /** 정비할 것이 하나도 없을 때 그 단에 적는 문장. 있으면 null이다 */
  noRepairs: string | null;
}

export function resultText(score: Overall, categories: readonly Category[], lang: Lang): ResultText {
  const fewRecords = score.withheld.includes("too_few_requests") || score.withheld.includes("too_few_days");
  return {
    grade: score.tier === null ? null : GRADE_COPY[score.tier][lang].name,
    diagnosis: score.tier !== null ? GRADE_COPY[score.tier][lang].diagnosis : fewRecords ? WITHHELD_COPY[lang].records : WITHHELD_COPY[lang].noAxes,
    noStrengths: categories.includes("strength") ? null : EMPTY_COPY[lang].strengths,
    noRepairs: categories.includes("repair") ? null : EMPTY_COPY[lang].repairs,
  };
}
