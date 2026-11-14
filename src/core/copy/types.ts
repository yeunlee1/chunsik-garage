// 규칙 문구 표의 모양. 규칙마다 영어와 한국어의 글을 나란히 둔다. 문장은 프로그램이 이 표에서 골라 숫자를 끼워 만들고 AI가 고쳐 쓰지 않는다(설계 11.5, 12.2)
import type { Reason } from "../reasons.ts";

/** 못 잰 이유의 낱말과 설명. 낱말은 점수 자리에 "잴 수 없음"과 함께 보이고, 설명은 잴 수 없음 목록에 보인다 */
export interface ReasonCopy {
  word: string;
  text: string;
}

/**
 * 규칙 하나의 문구(한 언어). 제목 칸(name, good, fix)과 unit, evidence는 마침표 없이 쓰고 나머지는 문장으로 쓴다.
 * 문장에는 스킬, 서버, 프로젝트의 이름과 경로를 넣지 않는다. 터미널 요약에도 같은 문장이 간다(설계 19.1)
 */
export interface RuleCopy {
  /** 규칙 이름. 짧은 명사구다. 보통과 잴 수 없음의 제목이고, 요약의 "가장 잘하는 것"에서 잰 값 앞에 붙는다 */
  name: string;
  /** 잘하고 있을 때의 제목. 무엇을 잘하는지 적는다 */
  good: string;
  /** 이 규칙이 무엇을 보고 그게 왜 좋은지. 잘하고 있는 것과 보통의 설명이다 */
  why: string;
  /** 정비할 때의 제목. 할 일을 적는다 */
  fix: string;
  /** 정비할 때의 설명. 지금 무엇이 문제인지 적는다. {value}에 단위가 붙은 잰 값이 들어간다 */
  problem: string;
  /** 처방. 직접 고치는 방법이다. 정비할 것과 보통에 보인다 */
  prescription: string;
  /** 어떻게 쟀나의 첫 줄. 무엇을 무엇으로 나눴는지 적는다 */
  method: string;
  /** 어떻게 쟀나의 근거 숫자 줄. 자리는 그 규칙의 근거 숫자 이름이고 모두 쓴다 */
  evidence: string;
  /** 잰 값의 단위. 몫은 % */
  unit: string;
  /** 이 규칙만 따로 쓰는 못 잰 이유의 낱말과 설명. 없는 이유는 공통 문구를 쓴다. 설명의 자리는 근거 숫자 이름이다 */
  reasons?: Partial<Record<Reason, Partial<ReasonCopy> & { text: string }>>;
  /** 못 잰 규칙이 정비 후보 때문에 정비할 것에 실렸을 때의 설명(E5, E6. 설계 11.5). 자리는 {judgeable}(판정할 수 있는 대상의 수)과 {candidates}(후보의 수)다 */
  repairUnmeasured?: Partial<Record<"too_little" | "watching", string>>;
}
