// 문구의 언어와 처음 보일 언어의 차례. --lang, OS의 언어, 영어의 차례로 정한다(순수 함수, 설계 12.1, 13.2)

/** 지원하는 언어. 문구의 원본은 영어다 */
export const LANGS = ["en", "ko"] as const;
export type Lang = (typeof LANGS)[number];
/** 언어마다의 값 */
export type Texts<T> = Record<Lang, T>;

/** 언어 표기(en, ko-KR, en_US.UTF-8 같은 것)의 앞 언어 부분으로 지원하는 언어를 고른다. 지원하지 않거나 읽을 수 없으면 null이다 */
export function supportedLang(tag: string | null | undefined): Lang | null {
  if (typeof tag !== "string") return null;
  const primary = tag.trim().toLowerCase().split(/[-_.@]/)[0];
  return LANGS.find((lang) => lang === primary) ?? null;
}

/**
 * 처음 보일 언어. --lang이 지원하는 언어이면 그것, 아니면 OS의 언어가 지원하는 언어이면 그것, 아니면 영어다.
 * 스킬은 사용자와 나누는 대화의 언어를 --lang으로 넘기므로 지원하지 않는 언어가 와도 거절하지 않고 다음 차례로 넘어간다
 */
export function pickLang(flag: string | null, osLocale: string | null): Lang {
  return supportedLang(flag) ?? supportedLang(osLocale) ?? "en";
}
