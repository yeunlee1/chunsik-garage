// 다음 등급까지 할 일의 문장. 영어가 원본이고 한국어를 나란히 둔다. 규칙 이름과 숫자만 넣고 사용자의 스킬·서버·프로젝트 이름은 넣지 않는다(설계 「0.2.0에서 정한 것」)
import type { NextGrade } from "../next-grade.ts";
import type { RuleId } from "../rules.ts";
import { fill } from "./format.ts";
import type { Lang, Texts } from "./lang.ts";

const COPY: Texts<{ reaches: string; partial: string; step: string; join: string }> = {
  en: {
    reaches: "{need} {need:point|points} to grade {grade}. Fix in this order: {steps}.",
    partial: "{need} {need:point|points} to grade {grade}. Fix in this order: {steps}. These alone reach {last}.",
    // 화살표와 숫자 사이는 줄바꿈 없는 빈칸이다(화면에서 둘이 떨어지지 않게)
    step: "{name} (→ {aq})",
    join: ", ",
  },
  ko: {
    reaches: "{grade}등급까지 {need}점입니다. 고칠 차례: {steps}.",
    partial: "{grade}등급까지 {need}점입니다. 고칠 차례: {steps}. 이것만으로는 {last}점입니다.",
    step: "{name}(→ {aq})",
    join: ", ",
  },
};

/** 차례마다 「규칙 이름(→ 그때의 AQ)」을 이은 한 문장. 다음 등급에 닿지 못하면 마지막 AQ를 덧붙인다 */
export function nextGradeText(next: NextGrade, nameOf: (ruleId: RuleId) => string, lang: Lang): string {
  const copy = COPY[lang];
  const steps = next.steps.map((step) => fill(copy.step, { name: nameOf(step.ruleId), aq: step.aq })).join(copy.join);
  return fill(next.reaches ? copy.reaches : copy.partial, { need: next.need, grade: next.grade, steps, last: next.steps.at(-1)!.aq });
}
