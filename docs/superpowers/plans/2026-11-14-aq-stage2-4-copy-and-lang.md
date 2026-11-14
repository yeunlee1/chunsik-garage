# AQ 점검 2단계 4부 — 문구와 --lang 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 문구 전수 판정, 이 PC의 기록으로 돌린 점검의 실제 문장 읽기로 검증한다.

**Goal:** 3부가 조립한 평가 결과와 요약에 영어와 한국어의 문장(규칙 스물둘의 제목·설명·처방·어떻게 쟀나, 잰 값의 단위, 못 잰 이유, 알림, 등급의 별명과 진단, 빈 목록, 덧붙이는 말, E6의 정보)과 실행 알림의 문장을 붙이고, `aq checkup`이 `--lang`과 OS의 언어로 처음 보일 언어를 정하게 한다. 이것으로 로드맵 2단계의 "끝나면 돌려 볼 수 있는 것"이 모두 갖춰진다.

**Architecture:** 문구 표와 문장 만들기는 `src/core/copy/`의 순수한 자료와 함수다(설계 7.2). 문구는 항목마다 영어(원본)와 한국어를 나란히 둔다. `findingText`, `noticeText`, `resultText`가 3부의 평가 결과에서 언어 하나의 문장을 만들고, `checkupResult`는 지원하는 두 언어의 문장을 모두 실어 결과 화면(3단계)이 한 파일에서 언어를 바꿀 수 있게 한다. 요약과 실행 기록은 처음 보일 언어 하나로 문장을 싣는다. OS의 언어는 명령 입구(`src/cli.ts`)가 읽어 넘긴다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 1단계, 2단계 1~3부와 같다. 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계의 7.4(`aq checkup [--lang en|ko]`), 11.3(규칙마다의 정의와 처방의 근거), 11.4(못 잰 이유와 반올림), 11.5(분류마다의 문장, 못 잰 도구의 후보, 터미널 요약의 덧붙이는 말, 빈 목록, 진단, 말투), 11.6(등급의 별명), 12.1(입력 묶음의 언어), 12.2(문장과 단위), 12.3(요약과 실행 기록), 13.1(E6 항목의 정보), 13.2(언어의 차례), 15(터미널에 전하는 숫자와 문장), 16.1(claude.ai에 연결한 서버를 직접 막는 방법), 20.2(저장하지 못했을 때 알림)를 구현한다. 로드맵은 `docs/superpowers/plans/2026-11-12-aq-roadmap.md`, 앞 계획은 `2026-11-13-aq-stage2-3-checkup-result.md`다. 3부 계획 끝의 「4부에 넘기는 것」을 이어받는다.

## 4부의 범위

| 넣는 것 | 넣지 않는 것(그 단계) |
|---|---|
| 규칙 스물둘의 문장, 잰 값의 단위, 못 잰 이유의 낱말과 설명, E4의 "지침 크기가 기록에 남지 않은 세션", E5·E6의 못 잰 때 문장과 다른 도구의 덧붙임, 알림 열셋, 실행 알림 다섯, 등급의 별명과 진단, 빈 목록의 두 문장, 덧붙이는 말 세 꼴, E6 항목의 정보와 claude.ai에 연결한 서버를 직접 막는 방법, `--lang`과 언어의 차례, 3부 구현 짝 검증의 남은 권장(저장 실패 알림의 오류 코드) | 결과 화면의 고정 글(단의 제목, 단추 글, "잴 수 없음" 같은 화면 낱말, 꼬리 문장, 공유 카드)과 E6의 "며칠 뒤부터 판정하는지"(3단계), 터미널의 머리표·글자 얼굴·말투(설계 15. 4단계의 스킬), Codex의 처방과 알림(5단계) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- **`src/core/`는 순수하다**(설계 7.2). 문구 표와 문장 만들기(`src/core/copy/`)도 파일을 열지 않고, 시계와 실행 환경의 로캘을 읽지 않고, Node.js 모듈과 바깥 패키지를 값으로 가져오지 않는다. OS의 언어는 명령 입구가 읽어 넘긴다. 2부 과제 20의 순수성 검사가 새 파일도 그대로 본다.
- **같은 입력 묶음이면 평가 결과는 글자 하나 다르지 않다**(설계 12.1, 12.2). 입력 묶음에는 처음 보일 언어가 든다. 숫자는 실행 환경의 로캘에 기대지 않고 직접 적는다.
- **문장은 프로그램이 문구 표에서 골라 숫자를 끼워 만든다. AI가 고쳐 쓰지 않는다**(설계 12.2). 문구는 영어가 원본이고 한국어를 나란히 둔다(설계 13.2).
- **문장에는 스킬, 서버, 프로젝트의 이름과 경로를 넣지 않는다**(설계 19.1). 수, 종류, 정해진 값(도구 이름, 확인한 버전의 범위, 오류 코드)만 넣는다. 이름 목록은 평가 결과의 따로 둔 자리에 있고 결과 화면이 그린다.
- **문구는 공개되는 글이다.** 효과를 약속하거나 결과를 단정하는 말, 뜻이 흐린 꾸밈말, 사용자를 탓하는 말을 쓰지 않는다(설계 11.5 「말투」). 처방은 Claude Code 공식 문서에서 확인한 명령과 설정만 쓴다. 한국어는 버전을 "판"이라 쓰지 않고, 문장을 콜론으로 끝내지 않는다. 설계에 글자로 정한 문장은 그대로 쓴다.
- **못 잰 것은 0이 아니다**(설계 12.2). 못 잰 규칙의 잰 값 자리는 비우고 이유의 낱말을 낸다. 예상 효과가 없는 자리에 0이나 "최대 +0"을 넣지 않는다(설계 11.5).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더와 OS의 관리 정책 폴더를 읽지도 쓰지도 않는다(설계 21.1). OS의 언어는 시험이 고정한다.
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `2단계-4-문구` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증은 병합 앞의 관문이다.
- 이 PC의 기록과 셋팅에서 잰 숫자, 경로, 이름은 저장소와 병합 요청에 넣지 않는다(설계 머리말).

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `D56D840A4BCE52E655E40E37B033BE9A1E972FACCD688D8F32A6EAF9B4D77F45`, 3,814줄)이다. 이 계획을 쓰며 정한 것은 「2단계 4부 계획에서 보완(2026-11-14, 주 세션)」의 번호로 과제마다 적었다. 계획은 저장소 밖의 연습 작업 폴더에서 과제마다 시험과 구현을 실제로 쓰고 돌려서 만들었다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/core/copy/lang.ts` | 1 | 지원하는 언어와 처음 보일 언어의 차례 |
| `src/core/copy/format.ts` | 1 | 숫자의 서식과 문구 틀의 자리 채우기(영어의 단수와 복수) |
| `src/core/copy/types.ts` | 2 | 규칙 문구의 모양 |
| `src/core/copy/rules-setup.ts` | 2 | 셋팅 규칙(S1~S5)의 문구 |
| `src/core/copy/rules-efficiency.ts` | 3 | 효율 규칙(E1~E7)의 문구 |
| `src/core/copy/rules-fit.ts` | 4 | 상황 적합 규칙(F1~F6)의 문구 |
| `src/core/copy/rules-intensity.ts` | 5 | 강도 규칙(I1~I4)의 문구 |
| `src/core/copy/common.ts` | 6, 9 | 도구와 기준의 이름, 못 잰 이유, 도구별 값의 줄, 다른 도구의 덧붙임, 안전장치의 조건, E6의 정보, 요약의 덧붙이는 말 |
| `src/core/copy/findings.ts` | 6 | 규칙 하나의 문장 |
| `src/core/copy/notices.ts` | 7 | 알림 열세 종류의 문장 |
| `src/core/copy/grades.ts` | 8 | 등급의 별명과 진단, 빈 목록의 문장 |
| `src/core/result/assemble.ts`(고침) | 8 | 평가 결과에 두 언어의 문장과 처음 보일 언어 싣기 |
| `src/core/result/summary.ts`(고침) | 9 | 요약의 문장 |
| `src/commands/checkup.ts`(고침) | 8, 10 | 언어를 넘기고 실행 기록에 실행 알림의 문장 싣기 |
| `src/commands/run-notices.ts` | 10 | 실행 알림 다섯의 문장 |
| `src/cli.ts`(고침), `skills/aq/scripts/aq.mjs`(다시 묶음) | 8, 10 | OS의 언어와 `--lang` |
| `test/commands/checkup.test.ts`(고침) | 8, 10, 11 | 옵션의 언어, 실행 기록의 문장, 저장 단계마다 실제 오류 코드 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다. 과제 11은 구현이 이미 맞고 시험만 보강하는 과제라서 시험을 쓰고 통과와 변이를 확인한 뒤 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/3`처럼 차례를 적었고 적힌 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 10의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 마지막 과제에서 돌린다.

---

### Task 1: 문구의 언어와 숫자 서식, 문구 틀의 자리 채우기

**Files:**
- Create: `src/core/copy/format.ts`
- Create: `src/core/copy/lang.ts`
- Test: `test/core/copy-format.test.ts`

**Interfaces:**
- Consumes: 2부의 `roundHalfUp`(`src/core/score.ts`), `ValueKind`(`src/core/rules.ts`).
- Produces: `LANGS`(`["en", "ko"]`), `Lang`, `Texts<T>`(`Record<Lang, T>`), `supportedLang(tag): Lang | null`, `pickLang(flag: string | null, osLocale: string | null): Lang`(`src/core/copy/lang.ts`). `groupDigits(value: number): string`, `oneDecimal(value: number): string`, `formatValue(kind: ValueKind, value: number): string`, `slots(template: string): string[]`, `fill(template: string, values: Readonly<Record<string, string | number | null>>): string`, `UNCOUNTED`(`"—"`)(`src/core/copy/format.ts`). 뒤의 모든 과제가 쓴다.

설계 「2단계 4부 계획에서 보완」의 5번(언어의 차례)과 6번(숫자 서식)이다.

- 언어는 영어와 한국어 둘이고 영어가 원본이다(설계 13.2). 언어 표기는 앞 언어 부분(`ko-KR`의 `ko`, `en_US.UTF-8`의 `en`)으로 읽는다. 처음 보일 언어는 `--lang`, OS의 언어, 영어의 차례다. 스킬은 사용자와 나누는 대화의 언어를 `--lang`으로 넘기므로 지원하지 않는 언어(`ja`)가 와도 거절하지 않고 다음 차례로 넘어간다.
- 숫자는 실행 환경의 로캘에 기대지 않고 직접 적는다. 같은 입력이면 어느 PC에서나 같은 글이어야 한다(설계 12.1). 몫은 백분율로 바꿔 소수 한 자리, 횟수는 소수 한 자리, 개수와 양은 정수이고 끝의 `.0`은 뗀다. 반올림은 설계 11.4의 절차(`roundHalfUp`, 아홉째 자리에서 맞춘 뒤 0.5는 올림)라서 `0.0145`의 백분율이 끝자리 오차로 `1.4`가 되지 않는다.
- 문구 틀의 자리는 `{이름}`이고, `{이름:하나|여럿}`은 값이 1이면 앞의 것이다(영어의 단수와 복수). 숫자 값은 세 자리마다 쉼표로 끊고, `null`(세지 못한 근거 숫자)은 줄표다. 틀에 있는데 값에 없는 자리는 오류로 낸다. 처방 글의 `{ "serverName": ... }`처럼 중괄호 뒤가 글자가 아닌 것은 자리가 아니다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-format.test.ts`(새 파일):

```ts
// 문구의 언어와 언어의 차례, 숫자의 서식, 문구 틀의 자리 채우기를 본다(설계 11.4의 반올림, 12.2, 13.2)
import { describe, expect, it } from "vitest";
import { fill, formatValue, groupDigits, oneDecimal, slots } from "../../src/core/copy/format.ts";
import { LANGS, pickLang, supportedLang } from "../../src/core/copy/lang.ts";

describe("언어", () => {
  it("지원하는 언어는 영어와 한국어이고 영어가 먼저다", () => {
    expect(LANGS).toEqual(["en", "ko"]);
  });

  it("언어 표기의 앞 언어 부분으로 고른다", () => {
    expect(supportedLang("ko")).toBe("ko");
    expect(supportedLang("ko-KR")).toBe("ko");
    expect(supportedLang("en_US.UTF-8")).toBe("en");
    expect(supportedLang(" EN ")).toBe("en");
    expect(supportedLang("ja-JP")).toBeNull();
    expect(supportedLang("")).toBeNull();
    expect(supportedLang(null)).toBeNull();
    expect(supportedLang("korean")).toBeNull();
  });

  it("--lang, OS의 언어, 영어의 차례로 정한다", () => {
    expect(pickLang("ko", "en-US")).toBe("ko");
    expect(pickLang("en", "ko-KR")).toBe("en");
    expect(pickLang(null, "ko-KR")).toBe("ko");
    // 스킬이 지원하지 않는 대화 언어를 넘겨도 점검을 막지 않고 다음 차례로 넘어간다
    expect(pickLang("ja", "ko-KR")).toBe("ko");
    expect(pickLang("ja", "fr-FR")).toBe("en");
    expect(pickLang(null, null)).toBe("en");
  });
});

describe("숫자의 서식", () => {
  it("정수를 세 자리마다 쉼표로 끊는다", () => {
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1000)).toBe("1,000");
    expect(groupDigits(1234567)).toBe("1,234,567");
  });

  it("소수 한 자리까지 적고 끝의 .0은 뗀다. 0.5는 올린다", () => {
    expect(oneDecimal(0.44)).toBe("0.4");
    expect(oneDecimal(0.45)).toBe("0.5");
    expect(oneDecimal(12)).toBe("12");
    expect(oneDecimal(12.04)).toBe("12");
    expect(oneDecimal(1234.56)).toBe("1,234.6");
  });

  it("잰 값을 종류에 맞춰 적는다. 몫은 백분율이다", () => {
    expect(formatValue("share", 0.96)).toBe("96");
    expect(formatValue("share", 0.9567)).toBe("95.7");
    expect(formatValue("share", 0.0143)).toBe("1.4");
    expect(formatValue("share", 1)).toBe("100");
    expect(formatValue("share", 0)).toBe("0");
    expect(formatValue("rate", 0.4)).toBe("0.4");
    expect(formatValue("rate", 40)).toBe("40");
    expect(formatValue("count", 3)).toBe("3");
    expect(formatValue("amount", 5234.5)).toBe("5,235");
  });

  it("몫을 백분율로 바꿀 때 끝자리 오차로 반올림이 갈리지 않는다", () => {
    // 0.0145 * 1000은 14.499999999999998로 계산된다. 설계 11.4의 반올림은 아홉째 자리에서 맞춘 뒤 올린다
    expect(formatValue("share", 0.0145)).toBe("1.5");
  });
});

describe("문구 틀", () => {
  it("자리를 값으로 바꾼다. 숫자는 세 자리마다 끊고 세지 못한 값은 줄표다", () => {
    expect(fill("{a} of {b}", { a: 1200, b: "all" })).toBe("1,200 of all");
    expect(fill("missing {n}", { n: null })).toBe("missing —");
  });

  it("{이름:하나|여럿}은 값이 1이면 앞의 것이다", () => {
    expect(fill("{n} {n:session|sessions}", { n: 1 })).toBe("1 session");
    expect(fill("{n} {n:session|sessions}", { n: 2 })).toBe("2 sessions");
    expect(fill("{n} {n:session|sessions}", { n: 0 })).toBe("0 sessions");
    expect(fill("{n:session|sessions}", { n: null })).toBe("sessions");
  });

  it("틀에 있는데 값에 없는 자리는 오류다", () => {
    expect(() => fill("{a} {b}", { a: 1 })).toThrow("b");
  });

  it("자리의 이름을 한 번씩 뽑는다", () => {
    expect(slots("{a} and {b:x|y} and {a}")).toEqual(["a", "b"]);
    expect(slots("no slots")).toEqual([]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-format.test.ts`
Expected: FAIL. `src/core/copy/format.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/copy/format.ts`(새 파일):

```ts
// 문장에 끼우는 숫자의 서식과 문구 틀의 자리 채우기. 실행 환경의 로캘에 기대지 않아 같은 입력이면 늘 같은 글이다(순수 함수, 설계 11.4의 반올림, 12.2)
import type { ValueKind } from "../rules.ts";
import { roundHalfUp } from "../score.ts";

/** 세지 못한 근거 숫자의 자리에 넣는 글 */
export const UNCOUNTED = "—";

/** 0 이상의 정수를 세 자리마다 쉼표로 끊는다 */
export function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 소수 한 자리까지 적고 끝의 .0은 뗀다. 반올림은 설계 11.4의 절차다 */
export function oneDecimal(value: number): string {
  const tenths = roundHalfUp(value * 10);
  const whole = groupDigits(Math.floor(tenths / 10));
  const rest = tenths % 10;
  return rest === 0 ? whole : `${whole}.${rest}`;
}

/** 잰 값을 종류에 맞춰 적는다. 몫은 백분율(소수 한 자리), 횟수는 소수 한 자리, 개수와 양은 정수다 */
export function formatValue(kind: ValueKind, value: number): string {
  if (kind === "share") return oneDecimal(value * 100);
  if (kind === "rate") return oneDecimal(value);
  return groupDigits(roundHalfUp(value));
}

const SLOT = /\{([A-Za-z]+)(?::([^|{}]*)\|([^|{}]*))?\}/g;

/** 문구 틀에 든 자리의 이름. 처음 나온 차례로 한 번씩이다 */
export function slots(template: string): string[] {
  return [...new Set([...template.matchAll(SLOT)].map((match) => match[1]!))];
}

/**
 * 문구 틀의 {이름}을 값으로 바꾼다. 숫자는 세 자리마다 끊고, null(세지 못함)은 줄표다.
 * {이름:하나|여럿}은 값이 1이면 앞의 것, 아니면 뒤의 것이다(영어의 단수와 복수). 틀에 있는데 값에 없는 자리는 오류다
 */
export function fill(template: string, values: Readonly<Record<string, string | number | null>>): string {
  return template.replace(SLOT, (_match, name: string, one: string | undefined, other: string | undefined) => {
    if (!(name in values)) throw new Error(`no value for {${name}} in "${template}"`);
    const value = values[name]!;
    if (one !== undefined && other !== undefined) return value === 1 ? one : other;
    if (value === null) return UNCOUNTED;
    return typeof value === "number" ? groupDigits(value) : value;
  });
}
```

`src/core/copy/lang.ts`(새 파일):

```ts
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
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-format.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 11개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-format.test.ts src/core/copy/format.ts src/core/copy/lang.ts
git commit -m "feat: 문구의 언어와 숫자 서식 추가"
```

---

### Task 2: 셋팅 규칙(S1~S5)의 문구

**Files:**
- Create: `src/core/copy/rules-setup.ts`
- Create: `src/core/copy/types.ts`
- Test: `test/core/copy-rules.test.ts`

**Interfaces:**
- Consumes: 과제 1의 `Texts`, `slots`, `LANGS`. 2부의 `RULES`, `RuleId`, `Axis`(`src/core/rules.ts`), `Reason`(`src/core/reasons.ts`), `evaluate`(`src/core/evaluate.ts`)와 시험 도우미 `PERSONAS`, `personaInput`.
- Produces: `RuleCopy`, `ReasonCopy`(`src/core/copy/types.ts`), `SETUP_COPY: Record<"S1" | … | "S5", Texts<RuleCopy>>`(`src/core/copy/rules-setup.ts`). 과제 3~5가 같은 모양으로 기준마다의 문구를 더하고 과제 6이 합친다.

설계 11.5와 12.2의 규칙 문장(제목, 설명, 처방, 어떻게 쟀나)이다. 「2단계 4부 계획에서 보완」의 7번(단위), 8번(분류마다의 문장), 11번(처방)을 따른다.

- 규칙 하나의 문구는 칸 아홉이다. 규칙 이름(`name`), 잘하고 있을 때의 제목(`good`, 무엇을 잘하는지), 왜 좋은지(`why`. 잘하고 있는 것과 보통의 설명), 정비할 때의 제목(`fix`, 할 일), 무엇이 문제인지(`problem`, `{value}`에 단위를 붙인 잰 값), 처방(`prescription`), 어떻게 쟀나의 첫 줄(`method`), 근거 숫자 줄(`evidence`), 단위(`unit`)다. 규칙만 따로 쓰는 못 잰 이유(`reasons`)와 정비할 것에 실린 못 잰 규칙의 설명(`repairUnmeasured`. E5와 E6)은 있을 때만 둔다.
- 영어가 원본이고 한국어를 규칙마다 나란히 둔다. 문장에는 스킬, 서버, 프로젝트의 이름과 경로를 넣지 않는다(「2단계 4부 계획에서 보완」의 4번). 효과를 약속하거나 결과를 단정하는 말, 사용자를 탓하는 말을 쓰지 않는다(설계 11.5 「말투」).
- 처방은 Claude Code 공식 문서에서 확인한 명령과 설정만 쓴다. `/hooks`는 등록된 훅을 보기만 하는 메뉴라서 "보고"라고 쓴다. 정비 기능(6단계)을 가리키지 않는다. S1과 S2의 처방은 지금 도구가 Claude Code 하나라서 Claude Code의 방법만 적는다(Codex의 방법은 5단계에 더한다).
- **문구는 잰 범위를 넘지 않는다**(「2단계 4부 계획에서 보완」의 14번. 계획 리뷰 1차에서 짝 Codex 둘이 찾았다). 잘하고 있을 때의 제목은 만점이 아니어도 붙으므로 "없음"이나 "만"이라고 하지 않는다(S4는 "훅 실패가 드묾"). 설명은 이 규칙이 보는 사실을 말하고 효과는 가능성으로 쓴다(S2는 셸 명령에 걸리는 훅만 본다는 것, S5는 다시 연결될 때까지라는 것). 못 잰 이유의 설명은 계산에서 뺀 기록이나 대상이 있어도 맞아야 한다(S4의 기록 없음은 막음만 있어도 나오므로 "실패율에 넣을 훅 실행이 없습니다"). S2의 처방은 실행을 기다렸다가 막을 수 있는 켜진 훅이라고 적는다(비동기 훅과 꺼 둔 훅은 조건을 채우지 못한다. 설계 11.3).
- 시험은 기준마다 그 기준의 규칙을 빠짐없이 담는지, 두 언어가 칸마다 같은 자리를 쓰는지, 자리가 정해진 것만 쓰고 근거 숫자를 모두 보이는지(근거 숫자 이름의 표는 실제 평가가 내는 이름과 맞춘다), 제목은 마침표 없이 끝나고 설명은 문장으로 끝나는지 본다. 단위는 영어에서만 `{value:하나|여럿}`을 쓴다. 문장이 사실과 맞는지는 시험이 아니라 짝의 칸마다 판정으로 본다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-rules.test.ts`(새 파일):

```ts
// 규칙 문구 표를 본다. 기준마다 규칙이 빠짐없고, 두 언어가 같은 자리를 쓰고, 자리가 그 규칙의 근거 숫자이고, 제목과 문장의 끝이 정해진 꼴이다(설계 11.5, 12.2)
import { describe, expect, it } from "vitest";
import { slots } from "../../src/core/copy/format.ts";
import { LANGS, type Texts } from "../../src/core/copy/lang.ts";
import { SETUP_COPY } from "../../src/core/copy/rules-setup.ts";
import type { RuleCopy } from "../../src/core/copy/types.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { RULES, type Axis, type RuleId } from "../../src/core/rules.ts";
import { PERSONAS, personaInput } from "../helpers/personas.ts";

/** 규칙마다의 근거 숫자 이름. 아래 시험이 실제 평가와 맞춘다 */
const EVIDENCE_KEYS: Record<RuleId, string[]> = {
  S1: ["tools", "withInstructions"],
  S2: ["guarded", "tools"],
  S3: ["danglingLinks", "noFrontmatter", "problems", "unparsable"],
  S4: ["failures", "runs", "unclassifiedBlocks"],
  S5: ["enabledServers", "failedSessions", "mainSessions"],
  E1: ["cacheRead", "cacheWrite", "input"],
  E2: ["errors", "results"],
  E3: ["autoCompactions", "mainSessions"],
  E4: ["sampledSessions", "skippedSessions"],
  E5: ["enabled", "judgeable", "judged", "structural", "unused", "used"],
  E6: ["enabled", "judgeable", "judged", "structural", "unused", "used"],
  E7: ["denied", "humanRequests", "interruptedTurns", "lengthStops"],
  F1: ["highEffort", "knownEffort", "unknownEffort", "unknownLevel"],
  F2: ["compactedSessions", "delegatedSessions"],
  F3: ["targets", "withInstructions"],
  F4: ["comparedProjects", "globalLines", "overlappingLines"],
  F5: ["differingCopies", "identicalCopies", "skillKinds"],
  F6: ["conflicts", "projectsWithSettings"],
  I1: ["activeDays"],
  I2: ["activeDays", "humanRequests"],
  I3: ["humanRequests", "toolCalls"],
  I4: ["excludedFolders", "projects", "unlinkedSessions"],
};

/** 기준마다의 규칙 문구. 기준의 문구를 더할 때마다 여기에 더한다 */
const AXES: [Axis, Partial<Record<RuleId, Texts<RuleCopy>>>][] = [["setup", SETUP_COPY]];

const TITLES = ["name", "good", "fix"] as const;
const SENTENCES = ["why", "problem", "prescription", "method"] as const;
const FIELDS = [...TITLES, ...SENTENCES, "evidence", "unit"] as const;
/** 단위는 영어에서만 단수와 복수를 가른다({value:하나|여럿}). 잰 값의 숫자는 단위에 넣지 않는다 */
const unitOk = (unit: string): boolean => (slots(unit).length === 0 || (slots(unit).length === 1 && slots(unit)[0] === "value")) && !/{value}/.test(unit);
const endsAsSentence = (text: string): boolean => /[.!?]$/.test(text) && !/[:：]$/.test(text);
const endsAsTitle = (text: string): boolean => !/[.!?:：]$/.test(text);

describe("근거 숫자 이름의 표", () => {
  it("실제 평가가 내는 근거 숫자의 이름과 같다", () => {
    const seen = new Map<RuleId, Set<string>>();
    for (const persona of Object.values(PERSONAS)) {
      for (const finding of evaluate(personaInput(persona)).findings) {
        const keys = seen.get(finding.ruleId) ?? new Set<string>();
        for (const key of Object.keys(finding.evidence)) keys.add(key);
        for (const value of finding.tools) for (const key of Object.keys(value.evidence)) keys.add(key);
        seen.set(finding.ruleId, keys);
      }
    }
    expect(Object.fromEntries([...seen].map(([id, keys]) => [id, [...keys].sort()]))).toEqual(EVIDENCE_KEYS);
  });
});

describe.each(AXES)("%s 규칙 문구", (axis, copy) => {
  const ids = RULES.filter((spec) => spec.axis === axis).map((spec) => spec.id);

  it("그 기준의 규칙을 빠짐없이, 그 기준의 것만 담는다", () => {
    expect(Object.keys(copy)).toEqual(ids);
  });

  it.each(ids)("%s: 칸마다 두 언어가 있고 같은 자리를 쓴다", (id) => {
    const texts = copy[id]!;
    for (const field of FIELDS) {
      for (const lang of LANGS) expect(texts[lang][field].trim().length, `${id} ${lang} ${field}`).toBeGreaterThan(0);
      if (field !== "unit") expect(slots(texts.ko[field]).sort(), `${id} ${field}`).toEqual(slots(texts.en[field]).sort());
    }
    expect(Object.keys(texts.ko.reasons ?? {}), `${id} reasons`).toEqual(Object.keys(texts.en.reasons ?? {}));
    for (const reason of Object.keys(texts.en.reasons ?? {}) as (keyof NonNullable<RuleCopy["reasons"]>)[]) {
      expect(slots(texts.ko.reasons![reason]!.text).sort(), `${id} ${reason}`).toEqual(slots(texts.en.reasons![reason]!.text).sort());
      expect(texts.ko.reasons![reason]!.word === undefined, `${id} ${reason} word`).toBe(texts.en.reasons![reason]!.word === undefined);
    }
    expect(Object.keys(texts.ko.repairUnmeasured ?? {}), `${id} repairUnmeasured`).toEqual(Object.keys(texts.en.repairUnmeasured ?? {}));
    for (const reason of Object.keys(texts.en.repairUnmeasured ?? {}) as ("too_little" | "watching")[]) {
      expect(slots(texts.ko.repairUnmeasured![reason]!).sort(), `${id} ${reason}`).toEqual(slots(texts.en.repairUnmeasured![reason]!).sort());
    }
  });

  it.each(ids)("%s: 자리는 정해진 것만 쓰고 근거 숫자는 모두 보인다", (id) => {
    for (const lang of LANGS) {
      const text = copy[id]![lang];
      for (const field of [...TITLES, "why", "prescription", "method"] as const) expect(slots(text[field]), `${id} ${lang} ${field}`).toEqual([]);
      expect(unitOk(text.unit), `${id} ${lang} unit: ${text.unit}`).toBe(true);
      expect(slots(text.problem), `${id} ${lang} problem`).toEqual(["value"]);
      expect(slots(text.evidence).sort(), `${id} ${lang} evidence`).toEqual(EVIDENCE_KEYS[id]);
      for (const [reason, reasonCopy] of Object.entries(text.reasons ?? {})) {
        for (const slot of slots(reasonCopy!.text)) expect(EVIDENCE_KEYS[id], `${id} ${lang} ${reason}`).toContain(slot);
      }
      for (const [reason, sentence] of Object.entries(text.repairUnmeasured ?? {})) {
        for (const slot of slots(sentence!)) expect(["judgeable", "candidates"], `${id} ${lang} ${reason}`).toContain(slot);
      }
    }
  });

  it.each(ids)("%s: 제목은 마침표 없이, 설명은 문장으로 끝난다", (id) => {
    for (const lang of LANGS) {
      const text = copy[id]![lang];
      for (const field of [...TITLES, "evidence", "unit"] as const) expect(endsAsTitle(text[field]), `${id} ${lang} ${field}: ${text[field]}`).toBe(true);
      for (const field of SENTENCES) expect(endsAsSentence(text[field]), `${id} ${lang} ${field}: ${text[field]}`).toBe(true);
      for (const [reason, reasonCopy] of Object.entries(text.reasons ?? {})) {
        expect(endsAsSentence(reasonCopy!.text), `${id} ${lang} ${reason}`).toBe(true);
        if (reasonCopy!.word !== undefined) expect(endsAsTitle(reasonCopy!.word), `${id} ${lang} ${reason} word`).toBe(true);
      }
      for (const [reason, sentence] of Object.entries(text.repairUnmeasured ?? {})) expect(endsAsSentence(sentence!), `${id} ${lang} ${reason}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-rules.test.ts`
Expected: FAIL. `src/core/copy/rules-setup.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/copy/rules-setup.ts`(새 파일):

```ts
// 셋팅 기준(S1~S5) 규칙의 문구. 영어가 원본이고 한국어를 나란히 둔다(설계 11.3, 11.5, 12.2)
import type { Texts } from "./lang.ts";
import type { RuleCopy } from "./types.ts";

const NO_TOOL = {
  en: { text: "No tool was used in the last 30 days, so this was not measured." },
  ko: { text: "최근 30일 안에 쓴 도구가 없어 재지 않았습니다." },
};

export const SETUP_COPY: Record<"S1" | "S2" | "S3" | "S4" | "S5", Texts<RuleCopy>> = {
  S1: {
    en: {
      name: "Global instructions",
      good: "Keeps instructions that load everywhere",
      why: "Global instructions load in every session, in every project. Writing your working style and rules there once means you do not repeat them in each project.",
      fix: "Write global instructions",
      problem: "{value} of the tools you use have global instructions.",
      prescription: "For Claude Code, write at least 200 bytes in CLAUDE.md in its config folder (~/.claude by default). A few lines on how you work and what to avoid are enough.",
      method: "Share of the tools you use that have global instructions (instruction files totaling 200 bytes or more).",
      evidence: "Tools with global instructions {withInstructions} · tools in use {tools}",
      unit: "%",
      reasons: { no_data: NO_TOOL.en },
    },
    ko: {
      name: "전역 지침",
      good: "어디서나 실리는 전역 지침을 둠",
      why: "전역 지침은 어느 프로젝트에서든 세션마다 실립니다. 일하는 방식과 지킬 규칙을 한곳에 적어 두면 프로젝트마다 다시 적지 않아도 됩니다.",
      fix: "전역 지침 쓰기",
      problem: "쓰는 도구 가운데 전역 지침이 있는 도구는 {value}입니다.",
      prescription: "Claude Code는 설정 폴더(기본은 ~/.claude)의 CLAUDE.md에 200바이트 이상 적습니다. 일하는 방식과 피할 것을 몇 줄 적으면 됩니다.",
      method: "쓰는 도구 가운데 전역 지침(지침 파일의 크기를 합쳐 200바이트 이상)이 있는 도구의 몫입니다.",
      evidence: "전역 지침이 있는 도구 {withInstructions} · 쓰는 도구 {tools}",
      unit: "%",
      reasons: { no_data: NO_TOOL.ko },
    },
  },
  S2: {
    en: {
      name: "Safeguard",
      good: "Has permission checks or a hook for shell commands",
      why: "This looks for permission checks in the default mode, or a confirming hook that can block shell commands. With one of them in place, a command you did not mean to run can be stopped before it runs. What the hook actually filters is not checked.",
      fix: "Add a check before shell commands",
      problem: "{value} of the tools you use have a safeguard. A tool runs with permission checks bypassed and no confirming hook covers shell commands.",
      prescription: "In Claude Code, add an enabled PreToolUse hook in your user settings that can block shell commands (Bash or PowerShell) before they run, or choose a default mode that does not bypass permissions. If you keep bypassing permissions, use the blocking hook.",
      method: "Share of the tools you use that have a safeguard. Claude Code has one if its default mode does not bypass permissions, or if a PreToolUse hook that can block covers shell commands.",
      evidence: "Tools with a safeguard {guarded} · tools in use {tools}",
      unit: "%",
      reasons: {
        no_data: NO_TOOL.en,
        unreadable: { text: "A settings file that decides the safeguard could not be read, so this was not measured." },
      },
    },
    ko: {
      name: "안전장치",
      good: "권한 확인이나 셸 명령 확인 훅을 둠",
      why: "기본 모드의 권한 확인이나, 셸 명령의 실행을 막을 수 있는 확인 훅이 있는지 봅니다. 그런 자리가 있으면 뜻하지 않은 명령을 실행 전에 멈출 수 있습니다. 훅이 무엇을 걸러 내는지는 보지 않습니다.",
      fix: "셸 명령 앞에 확인 두기",
      problem: "쓰는 도구 가운데 안전장치가 있는 도구는 {value}입니다. 권한 확인을 건너뛰는데 셸 명령을 덮는 확인 훅이 없는 도구가 있습니다.",
      prescription: "Claude Code에서 셸 명령(Bash 또는 PowerShell)의 실행 전에 결과를 기다리며 실행을 막을 수 있는 PreToolUse 훅을 사용자 설정에 두고 켜거나, 기본 모드를 권한 우회가 아닌 것으로 바꾸세요. 권한 우회 모드를 계속 쓰려면 실행을 막을 수 있는 확인 훅을 두세요.",
      method: "쓰는 도구 가운데 안전장치가 있는 도구의 몫입니다. Claude Code는 기본 모드가 권한 우회가 아니거나, 셸 명령에 걸리고 실행을 막을 수 있는 도구 실행 전 확인 훅이 있으면 안전장치가 있는 것으로 봅니다.",
      evidence: "안전장치가 있는 도구 {guarded} · 쓰는 도구 {tools}",
      unit: "%",
      reasons: {
        no_data: NO_TOOL.ko,
        unreadable: { text: "안전장치를 정하는 설정 파일 가운데 읽지 못한 것이 있어 재지 않았습니다." },
      },
    },
  },
  S3: {
    en: {
      name: "Broken settings",
      good: "No broken user-editable settings found",
      why: "This checks settings-file syntax, skill headers, and link targets in the setup you edit yourself.",
      fix: "Fix broken settings",
      problem: "Found {value} in the settings checked.",
      prescription: "Fix the JSON in settings files that do not parse, add a header with name and description at the top of each SKILL.md, and remove links that point nowhere.",
      method: "Count of unparsable settings files, skills without a header, and links that point nowhere, in the setup you edit yourself. Files inside plugins and managed policy files are not counted.",
      evidence: "Unparsable settings files {unparsable} · skills without a header {noFrontmatter} · links that point nowhere {danglingLinks} · total {problems}",
      unit: "{value:problem|problems}",
    },
    ko: {
      name: "깨진 설정",
      good: "직접 고치는 설정에서 문제를 찾지 못함",
      why: "직접 고치는 설정에서 설정 파일의 형식, 스킬 머리말, 링크 대상을 확인합니다.",
      fix: "깨진 설정 고치기",
      problem: "점검한 설정에서 문제를 {value} 찾았습니다.",
      prescription: "풀리지 않는 설정 파일은 JSON 꼴을 바로잡고, 스킬은 SKILL.md 맨 위에 name과 description이 든 머리말을 넣고, 가리키는 곳이 없는 링크는 지우세요.",
      method: "사용자가 직접 고치는 셋팅에서 풀리지 않는 설정 파일, 머리말이 없는 스킬, 가리키는 곳이 없는 링크의 수입니다. 플러그인 안의 것과 관리 정책 파일은 세지 않습니다.",
      evidence: "풀리지 않는 설정 파일 {unparsable} · 머리말이 없는 스킬 {noFrontmatter} · 가리키는 곳이 없는 링크 {danglingLinks} · 합계 {problems}",
      unit: "개",
    },
  },
  S4: {
    en: {
      name: "Hook failures",
      good: "Hooks rarely fail",
      why: "When a hook fails, the check or automation you gave it may not complete. This rule tracks the share of hook runs that failed.",
      fix: "Fix failing hooks",
      problem: "{value} of hook runs failed.",
      prescription: "Open /hooks to see the registered hooks, run the command of a failing hook in a terminal to find why it fails, and remove hooks you no longer use.",
      method: "Share of hook runs in the scoring window that failed. Blocks that could be on purpose or a failure are counted as neither a run nor a failure.",
      evidence: "Failures {failures} · runs {runs} · blocks not classified {unclassifiedBlocks}",
      unit: "%",
      reasons: {
        no_data: { text: "There were no hook runs to include in the failure rate. Blocks that may have been on purpose are not included." },
        too_little: { text: "Fewer than 100 hook runs to include in the failure rate, so this was not measured." },
      },
    },
    ko: {
      name: "훅 실패",
      good: "훅 실패가 드묾",
      why: "훅이 실패하면 그 훅에 맡긴 확인이나 자동 작업이 제대로 되지 않을 수 있습니다. 이 항목은 훅 실행 가운데 실패한 몫을 봅니다.",
      fix: "실패하는 훅 고치기",
      problem: "훅 실행 가운데 {value}가 실패했습니다.",
      prescription: "/hooks에서 등록된 훅을 보고, 실패하는 훅의 명령을 터미널에서 직접 돌려 까닭을 찾으세요. 더 쓰지 않는 훅은 지우세요.",
      method: "점수 구간의 훅 실행 가운데 실패한 몫입니다. 일부러 막은 것인지 실패해서 막힌 것인지 가릴 수 없는 막음은 실행에도 실패에도 넣지 않습니다.",
      evidence: "실패 {failures} · 실행 {runs} · 가리지 못한 막음 {unclassifiedBlocks}",
      unit: "%",
      reasons: {
        no_data: { text: "실패율에 넣을 훅 실행이 없습니다. 일부러 막은 것인지 가릴 수 없는 막음은 넣지 않습니다." },
        too_little: { text: "실패율에 넣을 훅 실행이 100번에 못 미쳐 재지 않았습니다." },
      },
    },
  },
  S5: {
    en: {
      name: "MCP connection failures",
      good: "MCP connection failures are uncommon",
      why: "When a server connection fails, calls to its tools may fail until a connection succeeds.",
      fix: "Fix MCP servers that fail to connect",
      problem: "{value} of sessions had an MCP connection failure.",
      prescription: "Open /mcp to find the servers that fail to connect, then fix their settings or turn off the ones you do not use.",
      method: "Share of main sessions with responses in the scoring window that had a connection failure. Servers waiting for sign-in or still connecting are not failures.",
      evidence: "Sessions with a failure {failedSessions} · main sessions with responses {mainSessions} · servers turned on {enabledServers}",
      unit: "%",
      reasons: {
        not_applicable: { text: "No MCP server is turned on." },
        unreadable: { text: "A settings file that decides which servers are on, or a place where servers are defined, could not be read." },
        no_data: { text: "No main session had responses in the scoring window." },
      },
    },
    ko: {
      name: "MCP 연결 실패",
      good: "MCP 연결 실패가 드묾",
      why: "서버 연결에 실패하면 다시 연결될 때까지 그 서버의 도구 호출도 실패할 수 있습니다.",
      fix: "연결에 실패하는 MCP 서버 고치기",
      problem: "응답이 있는 세션 가운데 {value}에서 MCP 연결 실패가 있었습니다.",
      prescription: "/mcp에서 연결에 실패하는 서버를 찾아 설정을 고치거나, 쓰지 않는 서버는 꺼 두세요.",
      method: "점수 구간에 응답이 있는 주 세션 가운데 연결 실패가 있었던 세션의 몫입니다. 인증을 기다리거나 연결하는 중인 서버는 실패로 세지 않습니다.",
      evidence: "실패가 있었던 세션 {failedSessions} · 응답이 있는 주 세션 {mainSessions} · 켜져 있는 서버 {enabledServers}",
      unit: "%",
      reasons: {
        not_applicable: { text: "켜져 있는 MCP 서버가 없습니다." },
        unreadable: { text: "서버의 켜짐을 정하는 설정 파일이나 서버를 찾는 곳 가운데 읽지 못한 것이 있습니다." },
        no_data: { text: "점수 구간에 응답이 있는 주 세션이 없습니다." },
      },
    },
  },
};
```

`src/core/copy/types.ts`(새 파일):

```ts
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
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-rules.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 17개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-rules.test.ts src/core/copy/rules-setup.ts src/core/copy/types.ts
git commit -m "feat: 셋팅 규칙 문구 추가"
```

---

### Task 3: 효율 규칙(E1~E7)의 문구

**Files:**
- Create: `src/core/copy/rules-efficiency.ts`
- Modify: `test/core/copy-rules.test.ts`

**Interfaces:**
- Consumes: 과제 2의 `RuleCopy`, 시험(`test/core/copy-rules.test.ts`).
- Produces: `EFFICIENCY_COPY: Record<"E1" | … | "E7", Texts<RuleCopy>>`(`src/core/copy/rules-efficiency.ts`).

- E5와 E6의 못 잰 때 문장은 설계 11.5의 표를 글자 그대로 따른다. `too_little`의 낱말은 "가릴 수 있는 것이 적음"이고, 판정할 수 있는 대상의 수(`{judgeable}`)를 적는다. 켜 둔 설치의 수가 아니다. `too_little`에는 기다리면 잰다고 하지 않고 "아직"을 쓰지 않는다. `watching`에만 지켜보는 중이라고 한다. 정비할 것에 실린 못 잰 규칙의 설명은 정리할 수 있는 수(`{candidates}`)를 함께 말한다.
- E4의 `no_data`는 지침이 없다고 단정하지 않는다. 기록에서 지침 크기를 찾지 못했다고 쓰고, 세션을 시작할 때의 입력 정보를 남기지 않는 실행 방식이 있다고 적는다. 표본에서 뺀 세션을 "지침 크기가 기록에 남지 않은 세션"이라고 부른다(설계 「2단계 3부 계획 전 확인」의 2번).
- E1의 잘하고 있을 때 제목은 설계 15의 "같은 내용을 다시 계산시키지 않음"이다. E3의 처방은 `/compact`, `/clear`, 하위 에이전트, E4는 `.claude/rules/`의 `paths`, E5는 사용자 설정의 `skillOverrides`(`"off"`)와 플러그인 스킬의 `/plugin`, E6은 `/mcp`와 `deniedMcpServers`(설계 16.1), E7은 `/permissions`의 허용 규칙이다.
- 계획 리뷰 1차에서 고친 것. E6의 계산 설명은 첫 점검에서도 점수 구간에 부른 서버는 "불렀다"로 판정된다는 것을 적는다(첫 점검에 판정된 서버가 없는 것이 아니라, 안 부른 것이 확인되는 서버가 없다. 2부의 `serverVerdict`가 부른 기록을 먼저 본다). E5와 E6의 설명은 사용자만 부르게 한 스킬과 처음 부를 때 연결되는 서버가 있다는 것을 넣어 "세션마다 실린다·연결된다"고 단정하지 않는다. E4의 처방은 매번 실리는 CLAUDE.md에서 `@`로 가져온 것이 그대로 실린다고 범위를 좁힌다. E6의 처방은 정의가 이 PC에 있는 서버가 대상이라서 데스크톱 앱이 직접 넘기는 연결의 예외(과제 6의 E6 정보)를 적지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-rules.test.ts`(찾을 곳 1/2):

```ts
import { LANGS, type Texts } from "../../src/core/copy/lang.ts";
import { SETUP_COPY } from "../../src/core/copy/rules-setup.ts";
```

`test/core/copy-rules.test.ts`(바꾼 뒤 1/2):

```ts
import { LANGS, type Texts } from "../../src/core/copy/lang.ts";
import { EFFICIENCY_COPY } from "../../src/core/copy/rules-efficiency.ts";
import { SETUP_COPY } from "../../src/core/copy/rules-setup.ts";
```

`test/core/copy-rules.test.ts`(찾을 곳 2/2):

```ts
/** 기준마다의 규칙 문구. 기준의 문구를 더할 때마다 여기에 더한다 */
const AXES: [Axis, Partial<Record<RuleId, Texts<RuleCopy>>>][] = [["setup", SETUP_COPY]];

```

`test/core/copy-rules.test.ts`(바꾼 뒤 2/2):

```ts
/** 기준마다의 규칙 문구. 기준의 문구를 더할 때마다 여기에 더한다 */
const AXES: [Axis, Partial<Record<RuleId, Texts<RuleCopy>>>][] = [
  ["setup", SETUP_COPY],
  ["efficiency", EFFICIENCY_COPY],
];

```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-rules.test.ts`
Expected: FAIL. `src/core/copy/rules-efficiency.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/copy/rules-efficiency.ts`(새 파일):

```ts
// 효율 기준(E1~E7) 규칙의 문구. 영어가 원본이고 한국어를 나란히 둔다. E5와 E6의 못 잰 때 문장은 설계 11.5의 표를 따른다(설계 11.3, 11.5, 12.2)
import type { Texts } from "./lang.ts";
import type { RuleCopy } from "./types.ts";

const WATCHING = {
  en: { word: "Still watching", text: "Some are still being watched, so the unused share was not given." },
  ko: { word: "지켜보는 중", text: "아직 지켜보는 중인 것이 있어 안 쓰는 비율은 내지 않았습니다." },
};
const WATCHING_REPAIR = {
  en: "Some are still being watched, so the unused share was not given. {candidates} of the ones confirmed unused can be cleaned up now.",
  ko: "아직 지켜보는 중인 것이 있어 안 쓰는 비율은 내지 않았습니다. 안 쓰는 것으로 확인된 것 가운데 {candidates}개는 지금 정리할 수 있습니다.",
};
const FEW = { en: "Few eligible for assessment", ko: "가릴 수 있는 것이 적음" };

export const EFFICIENCY_COPY: Record<"E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7", Texts<RuleCopy>> = {
  E1: {
    en: {
      name: "Cache hits",
      good: "Reuses cached context instead of recomputing it",
      why: "Cached conversation prefixes are reused rather than processed again. This rule measures the share of input read from that cache.",
      fix: "Keep the start of sessions stable",
      problem: "{value} of input was read from the cache.",
      prescription: "Keep one task in one session, and avoid turning MCP servers on and off in the middle of a session. After a long pause the cache expires and is built again.",
      method: "Share of input read from the cache. For Claude Code, the whole input is plain input plus cache reads plus cache writes.",
      evidence: "Cache reads {cacheRead} · input {input} · cache writes {cacheWrite} (tokens)",
      unit: "%",
      reasons: { no_data: { text: "No input tokens were recorded in the scoring window." } },
    },
    ko: {
      name: "캐시 적중",
      good: "같은 내용을 다시 계산시키지 않음",
      why: "캐시에서 읽은 대화 앞부분은 다시 계산하지 않고 재사용합니다. 이 항목은 입력 가운데 그렇게 캐시에서 읽은 몫을 봅니다.",
      fix: "세션의 앞부분을 자주 바꾸지 않기",
      problem: "입력 가운데 캐시에서 읽은 몫이 {value}입니다.",
      prescription: "한 가지 일은 한 세션에서 이어 하고, 세션 도중에 MCP 서버를 켜고 끄는 일을 줄이세요. 오래 쉬면 캐시가 만료되어 다시 만들어집니다.",
      method: "입력 가운데 캐시에서 읽은 몫입니다. Claude Code는 입력, 캐시 읽기, 캐시 쓰기를 더한 것이 전체 입력입니다.",
      evidence: "캐시 읽기 {cacheRead} · 입력 {input} · 캐시 쓰기 {cacheWrite} (토큰)",
      unit: "%",
      reasons: { no_data: { text: "점수 구간에 입력 토큰이 기록되지 않았습니다." } },
    },
  },
  E2: {
    en: {
      name: "Tool errors",
      good: "Tools rarely end in errors",
      why: "A tool call that ends in an error has to be retried or worked around, which spends turns and tokens. Shell commands are left out, because a non-zero exit is usually the result of the work, such as a failing test.",
      fix: "Reduce tool errors",
      problem: "{value} of tool results ended in an error.",
      prescription: "Look at which tools fail most often. Reading a file that has moved, editing text that has already changed, and an MCP server that does not answer are examples. If the same cause keeps coming back, such as an old path in your instructions, fix that cause.",
      method: "Share of tool results that ended in an error. Shell commands, and results that were denied or interrupted, are left out of both counts.",
      evidence: "Errors {errors} · tool results {results}",
      unit: "%",
      reasons: {
        no_data: { text: "There were no tool results to count in the scoring window." },
        too_little: { text: "Fewer than 50 tool results, so this was not measured." },
      },
    },
    ko: {
      name: "도구 오류",
      good: "도구가 오류로 끝나는 일이 드묾",
      why: "오류로 끝난 도구 호출은 다시 하거나 돌아가야 해서 턴과 토큰이 듭니다. 셸 명령은 뺍니다. 0이 아닌 값으로 끝나는 것은 실패한 시험처럼 대개 일의 결과이기 때문입니다.",
      fix: "도구 오류 줄이기",
      problem: "도구 결과 가운데 {value}가 오류로 끝났습니다.",
      prescription: "어느 도구가 자주 실패하는지 보세요. 옮겨진 파일을 읽거나, 이미 바뀐 글을 고치려 하거나, MCP 서버가 응답하지 않는 것이 그런 예입니다. 지침에 남은 옛 경로처럼 같은 까닭이 되풀이되면 그 까닭을 고치세요.",
      method: "도구 결과 가운데 오류로 끝난 몫입니다. 셸 명령과, 거절되거나 끊겨서 끝난 결과는 두 수에서 모두 뺍니다.",
      evidence: "오류 {errors} · 도구 결과 {results}",
      unit: "%",
      reasons: {
        no_data: { text: "점수 구간에 셀 도구 결과가 없습니다." },
        too_little: { text: "도구 결과가 50개에 못 미쳐 재지 않았습니다." },
      },
    },
  },
  E3: {
    en: {
      name: "Context overflow",
      good: "Rarely needs automatic compaction",
      why: "When a conversation fills the context window, Claude Code compacts it automatically and earlier details are shortened.",
      fix: "Split long sessions",
      problem: "Automatic compaction averaged {value}.",
      prescription: "Run /compact yourself before the context fills, or start a new conversation with /clear when the task changes. Hand large file reads and long searches to a subagent, which works in its own context window.",
      method: "Automatic compactions in main sessions divided by main sessions with responses in the scoring window.",
      evidence: "Automatic compactions {autoCompactions} · main sessions {mainSessions}",
      unit: "{value:compaction|compactions} per session",
      reasons: {
        no_data: { text: "No main session had responses in the scoring window." },
        too_little: { text: "Fewer than 3 main sessions with responses, so this was not measured." },
      },
    },
    ko: {
      name: "대화 넘침",
      good: "자동 압축이 드묾",
      why: "대화가 대화 창을 채우면 Claude Code가 자동으로 압축하고 앞의 자세한 내용이 줄어듭니다.",
      fix: "긴 세션 나누기",
      problem: "주 세션의 자동 압축이 평균 {value}입니다.",
      prescription: "대화 창이 차기 전에 /compact로 직접 줄이거나, 일이 바뀌면 /clear로 새 대화를 시작하세요. 큰 파일 읽기나 긴 조사는 자기 대화 창에서 일하는 하위 에이전트에 맡기세요.",
      method: "주 세션의 자동 압축 횟수를 점수 구간에 응답이 있는 주 세션 수로 나눈 값입니다.",
      evidence: "자동 압축 {autoCompactions} · 주 세션 {mainSessions}",
      unit: "회/세션",
      reasons: {
        no_data: { text: "점수 구간에 응답이 있는 주 세션이 없습니다." },
        too_little: { text: "응답이 있는 주 세션이 3개에 못 미쳐 재지 않았습니다." },
      },
    },
  },
  E4: {
    en: {
      name: "Always-loaded instructions",
      good: "Keeps always-loaded instructions light",
      why: "Instructions load at the start of every session and take room in the context window for the whole session. Lighter instructions leave that much more room for the work.",
      fix: "Trim always-loaded instructions",
      problem: "Instructions loaded in a main session come to {value} at the median.",
      prescription: "Move instructions you do not need every time into .claude/rules/ files with paths frontmatter, so they load when Claude works on matching files. Importing a file with @ from an always-loaded CLAUDE.md does not make it load on demand.",
      method: "Median size of the instructions loaded in main sessions. One token is estimated per 4 ASCII characters and per other character, such as Korean. Sessions whose instruction size was not left in the records are not in the sample.",
      evidence: "Sessions in the sample {sampledSessions} · sessions whose instruction size was not recorded {skippedSessions}",
      unit: "{value:token|tokens} (est.)",
      reasons: {
        no_data: {
          word: "Size not recorded",
          text: "The instruction size was not found in the records. Some ways of running Claude Code do not record the input sent at the start of a session, including instructions.",
        },
      },
    },
    ko: {
      name: "매번 실리는 지침",
      good: "매번 실리는 지침을 가볍게 둠",
      why: "지침은 세션마다 처음에 실려 세션 내내 대화 창의 자리를 차지합니다. 지침이 가벼우면 일에 쓸 자리가 그만큼 남습니다.",
      fix: "매번 실리는 지침 줄이기",
      problem: "주 세션에 실린 지침이 가운데 값으로 {value}입니다.",
      prescription: "늘 필요하지는 않은 지침은 .claude/rules/ 아래의 규칙 파일로 옮기고 머리말의 paths로 해당 파일을 다룰 때 실리게 하세요. 매번 실리는 CLAUDE.md에서 @로 가져오는 것만으로는 필요할 때 실리는 규칙이 되지 않습니다.",
      method: "주 세션에 실린 지침의 어림 토큰 수의 가운데 값입니다. ASCII 글자는 4글자를, 한글 같은 그 밖의 글자는 1글자를 1토큰으로 어림합니다. 지침 크기가 기록에 남지 않은 세션은 표본에서 뺍니다.",
      evidence: "표본에 넣은 세션 {sampledSessions} · 지침 크기가 기록에 남지 않은 세션 {skippedSessions}",
      unit: "토큰(어림)",
      reasons: {
        no_data: {
          word: "크기가 기록되지 않음",
          text: "기록에서 지침 크기를 찾지 못했습니다. 세션을 시작할 때의 입력 정보(지침 포함)를 기록에 남기지 않는 실행 방식이 있습니다.",
        },
      },
    },
  },
  E5: {
    en: {
      name: "Unused skills",
      good: "Uses most of the skills whose use was judged",
      why: "Automatically invocable skills can add names and descriptions to the session skill list. Visibility settings and user-only invocation can change what is listed.",
      fix: "Turn off unused skills",
      problem: "{value} of the judged skills went unused.",
      prescription: "Turn off a skill you do not use by setting its name to \"off\" under skillOverrides in your user settings (~/.claude/settings.json). Skills inside a plugin are managed with /plugin.",
      method: "Skills confirmed unused, divided by skills used plus skills confirmed unused. A skill is confirmed unused only when it has been installed for more than 14 days with no sign of use. Skills whose use cannot be told are left out.",
      evidence: "Turned on {enabled} · can be judged {judgeable} · judged {judged} (used {used}, unused {unused}) · cannot be judged by design {structural}",
      unit: "%",
      reasons: {
        too_little: { word: FEW.en, text: "Only {judgeable} {judgeable:skill is|skills are} eligible for use assessment, so the unused share was not calculated." },
        watching: WATCHING.en,
        unsupported: { text: "Whether these skills are used cannot be told from the records." },
        unreadable: { text: "A place where skills are found, a settings file, or the tool's usage counts could not be read." },
        not_applicable: { text: "No skill is turned on." },
        incomplete: { text: "The records of skill use could not all be read." },
      },
      repairUnmeasured: {
        too_little: "Only {judgeable} {judgeable:skill is|skills are} eligible for use assessment, so the unused share was not calculated. Found {candidates} that can be cleaned up.",
        watching: WATCHING_REPAIR.en,
      },
    },
    ko: {
      name: "안 쓰는 스킬",
      good: "판정된 스킬 가운데 대부분을 쓰고 있음",
      why: "자동으로 부를 수 있는 스킬은 세션의 스킬 목록에 이름과 설명을 더할 수 있습니다. 표시 설정이나 사용자만 부르는 설정에 따라 목록에 실리는 내용은 달라집니다.",
      fix: "안 쓰는 스킬 끄기",
      problem: "쓰는지 판정된 스킬 가운데 {value}는 쓰지 않은 것으로 확인됐습니다.",
      prescription: "쓰지 않는 스킬은 사용자 설정(~/.claude/settings.json)의 skillOverrides에서 그 이름을 \"off\"로 적어 꺼 두세요. 플러그인에 든 스킬은 /plugin에서 관리합니다.",
      method: "안 쓴 것이 확인된 스킬을, 쓴 스킬과 안 쓴 것이 확인된 스킬의 합으로 나눈 값입니다. 깐 지 14일이 넘었는데 쓴 흔적이 없어야 안 쓴 것이 확인되고, 쓰는지 가릴 수 없는 스킬은 뺍니다.",
      evidence: "켜져 있음 {enabled} · 판정할 수 있음 {judgeable} · 판정됨 {judged}(씀 {used}, 안 씀 {unused}) · 구조상 판정할 수 없음 {structural}",
      unit: "%",
      reasons: {
        too_little: { word: FEW.ko, text: "쓰는지 가릴 수 있는 스킬이 {judgeable}개뿐이어서 안 쓰는 비율은 내지 않았습니다." },
        watching: WATCHING.ko,
        unsupported: { text: "기록으로는 이 스킬들을 쓰는지 가릴 수 없습니다." },
        unreadable: { text: "스킬을 찾는 곳, 설정 파일, 도구의 사용 집계 가운데 읽지 못한 것이 있습니다." },
        not_applicable: { text: "켜져 있는 스킬이 없습니다." },
        incomplete: { text: "스킬 사용 기록을 빠짐없이 읽지 못했습니다." },
      },
      repairUnmeasured: {
        too_little: "쓰는지 가릴 수 있는 스킬이 {judgeable}개뿐이어서 안 쓰는 비율은 내지 않았습니다. 정리할 수 있는 것은 {candidates}개 찾았습니다.",
        watching: WATCHING_REPAIR.ko,
      },
    },
  },
  E6: {
    en: {
      name: "Unused MCP servers",
      good: "Calls most of the servers whose use was judged",
      why: "Enabled MCP servers can be connected to provide tools. Some connect at session start and others on first use.",
      fix: "Turn off unused MCP servers",
      problem: "{value} of the servers whose use was judged were confirmed uncalled.",
      prescription: "Turn off a server you do not call in /mcp, or block it by adding { \"serverName\": \"<name>\" } to the deniedMcpServers list in your user settings (~/.claude/settings.json).",
      method: "Servers confirmed uncalled, divided by the sum of servers called and servers confirmed uncalled. Confirming non-use requires this tool to have watched the same definition for more than 14 days; a call in the scoring window can establish use on the first checkup. Servers whose definition is not on this PC, such as those connected through claude.ai, are left out.",
      evidence: "Turned on {enabled} · can be judged {judgeable} · judged {judged} (called {used}, uncalled {unused}) · cannot be judged by design {structural}",
      unit: "%",
      reasons: {
        too_little: { word: FEW.en, text: "Only {judgeable} MCP {judgeable:server is|servers are} eligible for use assessment, so the unused share was not calculated." },
        watching: WATCHING.en,
        unsupported: { text: "Whether these servers are called cannot be told from the records." },
        unreadable: { text: "A place where servers are defined or a settings file could not be read." },
        not_applicable: { text: "No MCP server is turned on." },
        incomplete: { text: "The records of MCP calls could not all be read." },
      },
      repairUnmeasured: {
        too_little: "Only {judgeable} MCP {judgeable:server is|servers are} eligible for use assessment, so the unused share was not calculated. Found {candidates} that can be cleaned up.",
        watching: WATCHING_REPAIR.en,
      },
    },
    ko: {
      name: "안 쓰는 MCP 서버",
      good: "판정된 서버 가운데 대부분을 부르고 있음",
      why: "켜 둔 MCP 서버는 도구를 제공하기 위해 연결될 수 있습니다. 세션을 시작할 때 연결되는 서버도 있고 처음 부를 때 연결되는 서버도 있습니다.",
      fix: "안 쓰는 MCP 서버 끄기",
      problem: "부르는지 판정된 서버 가운데 {value}는 부르지 않은 것으로 확인됐습니다.",
      prescription: "부르지 않는 서버는 /mcp에서 끄거나, 사용자 설정(~/.claude/settings.json)의 deniedMcpServers 목록에 { \"serverName\": \"<이름>\" }을 더해 막으세요.",
      method: "안 부른 것이 확인된 서버를, 부른 서버와 안 부른 것이 확인된 서버의 합으로 나눈 값입니다. 안 부른 것을 확인하려면 이 도구가 같은 정의의 서버를 14일 넘게 지켜봐야 하지만, 점수 구간에 부른 기록이 있으면 첫 점검에서도 부른 것으로 판정할 수 있습니다. claude.ai에 연결한 서버처럼 정의가 이 PC에 없는 서버는 뺍니다.",
      evidence: "켜져 있음 {enabled} · 판정할 수 있음 {judgeable} · 판정됨 {judged}(부름 {used}, 안 부름 {unused}) · 구조상 판정할 수 없음 {structural}",
      unit: "%",
      reasons: {
        too_little: { word: FEW.ko, text: "쓰는지 가릴 수 있는 MCP 서버가 {judgeable}개뿐이어서 안 쓰는 비율은 내지 않았습니다." },
        watching: WATCHING.ko,
        unsupported: { text: "기록으로는 이 서버들을 부르는지 가릴 수 없습니다." },
        unreadable: { text: "서버를 찾는 곳이나 설정 파일 가운데 읽지 못한 것이 있습니다." },
        not_applicable: { text: "켜져 있는 MCP 서버가 없습니다." },
        incomplete: { text: "MCP 호출 기록을 빠짐없이 읽지 못했습니다." },
      },
      repairUnmeasured: {
        too_little: "쓰는지 가릴 수 있는 MCP 서버가 {judgeable}개뿐이어서 안 쓰는 비율은 내지 않았습니다. 정리할 수 있는 것은 {candidates}개 찾았습니다.",
        watching: WATCHING_REPAIR.ko,
      },
    },
  },
  E7: {
    en: {
      name: "Stopped work",
      good: "Work rarely stops midway",
      why: "A denied tool call, an interrupted turn, or a reply cut off by the length limit stops work that was underway, and it has to be picked up again.",
      fix: "Reduce stopped work",
      problem: "Recorded stops averaged {value}.",
      prescription: "If you often deny the same safe command, allow it with a rule in /permissions, such as Bash(npm run test *). If replies get cut off by the length limit, ask for smaller pieces of work.",
      method: "Denied tool calls, interrupted turns, and replies cut off by the length limit, divided by requests from you. Denials include those by you, by hooks, and by permission checks.",
      evidence: "Denied {denied} · interrupted turns {interruptedTurns} · cut off by length {lengthStops} · requests from you {humanRequests}",
      unit: "{value:stop|stops} per request",
      reasons: {
        no_data: { text: "There were no requests from you in the scoring window." },
        too_little: { text: "Fewer than 20 requests from you, so this was not measured." },
      },
    },
    ko: {
      name: "멈춘 일",
      good: "일이 중간에 잘 멈추지 않음",
      why: "거절한 도구 실행, 끊은 턴, 길이 제한으로 끊긴 응답은 하던 일을 멈추게 하고 다시 이어 가야 합니다.",
      fix: "멈추는 일 줄이기",
      problem: "일이 멈춘 횟수가 평균 {value}입니다.",
      prescription: "같은 안전한 명령을 자주 거절한다면 /permissions에서 Bash(npm run test *) 같은 허용 규칙으로 더하세요. 응답이 길이 제한으로 끊기면 일을 작게 나눠 맡기세요.",
      method: "거절한 도구 실행, 끊은 턴, 길이 제한으로 끊긴 응답을 더해 사람 요청 수로 나눈 값입니다. 거절에는 사람이 거절한 것, 훅이 막은 것, 권한 검사가 막은 것이 모두 듭니다.",
      evidence: "거절 {denied} · 끊은 턴 {interruptedTurns} · 길이 제한으로 끊김 {lengthStops} · 사람 요청 {humanRequests}",
      unit: "회/요청",
      reasons: {
        no_data: { text: "점수 구간에 사람 요청이 없습니다." },
        too_little: { text: "사람 요청이 20개에 못 미쳐 재지 않았습니다." },
      },
    },
  },
};
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-rules.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 39개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-rules.test.ts src/core/copy/rules-efficiency.ts
git commit -m "feat: 효율 규칙 문구 추가"
```

---

### Task 4: 상황 적합 규칙(F1~F6)의 문구

**Files:**
- Create: `src/core/copy/rules-fit.ts`
- Modify: `test/core/copy-rules.test.ts`

**Interfaces:**
- Consumes: 과제 2의 `RuleCopy`, 시험.
- Produces: `FIT_COPY: Record<"F1" | … | "F6", Texts<RuleCopy>>`(`src/core/copy/rules-fit.ts`).

- F1은 일이 얼마나 어려웠는지 모르는 대신 지표라서 무게가 낮다는 것을 설명에 적는다(설계 11.3 「F1의 한계와 무게」). 처방은 `/effort`다.
- F5는 정비하지 않는 규칙이라 직접 정리하는 방법만 알린다. 사본 하나를 치우면 그 사본만 보이던 곳에서 스킬이 사라질 수 있다는 것과, 두 도구를 함께 쓰면 원본 하나를 링크로 묶을 수 있다는 것을 적는다(설계 16.1).
- F3의 처방은 `/init`, F6은 `/permissions`다. F4와 F6의 처방은 사용자가 할 수 있는 일만 적는다(관리 정책은 견주지 않는다).
- 계획 리뷰 1차에서 고친 것. 못 잰 이유의 설명은 계산에서 뺀 것이 있어도 맞게 쓴다. F1의 기록 없음은 모르는 강도 단계만 있어도 나오므로 "알아볼 수 있는 추론 강도가 기록된 응답이 없습니다", F3의 해당 없음은 작업 폴더가 없어졌거나 프로젝트로 보지 않는 폴더를 대상에서 뺀다는 것, F4의 해당 없음은 전역 지침과 같은 원본뿐인 프로젝트 지침도 견주지 않는다는 것, F5의 해당 없음은 플러그인에 든 스킬을 세지 않는다는 것을 적는다. F5의 계산은 내용을 견줄 수 없는 사본도 다른 사본으로 친다. F6의 설명은 같은 규칙이 허용과 금지에 함께 있으면 금지가 이긴다는 것(Claude Code 공식 문서의 권한 규칙)을 적는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-rules.test.ts`(찾을 곳 1/2):

```ts
import { EFFICIENCY_COPY } from "../../src/core/copy/rules-efficiency.ts";
import { SETUP_COPY } from "../../src/core/copy/rules-setup.ts";
```

`test/core/copy-rules.test.ts`(바꾼 뒤 1/2):

```ts
import { EFFICIENCY_COPY } from "../../src/core/copy/rules-efficiency.ts";
import { FIT_COPY } from "../../src/core/copy/rules-fit.ts";
import { SETUP_COPY } from "../../src/core/copy/rules-setup.ts";
```

`test/core/copy-rules.test.ts`(찾을 곳 2/2):

```ts
  ["efficiency", EFFICIENCY_COPY],
];
```

`test/core/copy-rules.test.ts`(바꾼 뒤 2/2):

```ts
  ["efficiency", EFFICIENCY_COPY],
  ["fit", FIT_COPY],
];
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-rules.test.ts`
Expected: FAIL. `src/core/copy/rules-fit.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/copy/rules-fit.ts`(새 파일):

```ts
// 상황 적합 기준(F1~F6) 규칙의 문구. 영어가 원본이고 한국어를 나란히 둔다(설계 11.3, 11.5, 12.2)
import type { Texts } from "./lang.ts";
import type { RuleCopy } from "./types.ts";

export const FIT_COPY: Record<"F1" | "F2" | "F3" | "F4" | "F5" | "F6", Texts<RuleCopy>> = {
  F1: {
    en: {
      name: "Highest effort share",
      good: "Does not lean on the highest effort for everything",
      why: "This shows how often responses use xhigh or max. It does not judge task difficulty, so it carries a low weight.",
      fix: "Lower the everyday effort",
      problem: "{value} of responses with a known effort ran at the highest levels (xhigh, max).",
      prescription: "Set a lower everyday effort with /effort and raise it only for hard tasks.",
      method: "Share of responses with a known effort level that ran at xhigh or max. Responses with no effort recorded and unknown levels are left out.",
      evidence: "Highest effort {highEffort} · known effort {knownEffort} · effort not recorded {unknownEffort} · unknown level {unknownLevel}",
      unit: "%",
      reasons: {
        no_data: { text: "No response had a recognized effort level." },
        too_little: { text: "Fewer than 50 responses with a known effort, so this was not measured." },
      },
    },
    ko: {
      name: "가장 높은 추론 강도의 몫",
      good: "가장 높은 추론 강도에 쏠리지 않음",
      why: "응답에서 xhigh나 max를 얼마나 자주 썼는지 봅니다. 이 규칙은 일이 얼마나 어려웠는지 모르므로 무게를 낮게 둡니다.",
      fix: "평소 추론 강도 낮추기",
      problem: "강도를 아는 응답 가운데 {value}가 가장 높은 강도(xhigh, max)로 돌았습니다.",
      prescription: "/effort로 평소 강도를 낮추고 어려운 일에서만 높이세요.",
      method: "강도를 아는 응답 가운데 xhigh나 max로 돈 몫입니다. 강도가 기록되지 않은 응답과 모르는 단계는 뺍니다.",
      evidence: "가장 높은 강도 {highEffort} · 강도를 앎 {knownEffort} · 강도가 기록되지 않음 {unknownEffort} · 모르는 단계 {unknownLevel}",
      unit: "%",
      reasons: {
        no_data: { text: "알아볼 수 있는 추론 강도가 기록된 응답이 없습니다." },
        too_little: { text: "강도를 아는 응답이 50개에 못 미쳐 재지 않았습니다." },
      },
    },
  },
  F2: {
    en: {
      name: "Delegating long work",
      good: "Hands parts of long work to subagents",
      why: "A subagent works in a separate context window and returns its results. This rule checks whether main sessions with automatic compaction used subagents.",
      fix: "Hand parts of long work to subagents",
      problem: "Subagents were used in {value} of the sessions that were compacted automatically.",
      prescription: "In long sessions, ask Claude to give searches and large file reads to a subagent. You can also write your own subagents as Markdown files in .claude/agents/ or ~/.claude/agents/.",
      method: "Share of main sessions with an automatic compaction that also used a subagent.",
      evidence: "Sessions that used a subagent {delegatedSessions} · sessions with automatic compaction {compactedSessions}",
      unit: "%",
      reasons: {
        no_data: { text: "No main session was compacted automatically." },
        too_little: { text: "Fewer than 3 main sessions were compacted automatically, so this was not measured." },
      },
    },
    ko: {
      name: "긴 일 나눠 맡기기",
      good: "긴 일을 하위 에이전트에 나눠 맡김",
      why: "하위 에이전트는 별도 대화 창에서 일하고 결과를 돌려줍니다. 이 항목은 자동 압축이 있었던 주 세션에서 하위 에이전트를 썼는지 봅니다.",
      fix: "긴 일을 하위 에이전트에 나눠 맡기기",
      problem: "자동 압축이 있었던 세션 가운데 하위 에이전트를 쓴 세션은 {value}입니다.",
      prescription: "긴 세션에서는 조사나 큰 파일 읽기를 하위 에이전트에 맡겨 달라고 하세요. 하위 에이전트는 .claude/agents/나 ~/.claude/agents/에 마크다운 파일로 직접 만들 수도 있습니다.",
      method: "자동 압축이 있었던 주 세션 가운데 하위 에이전트를 쓴 세션의 몫입니다.",
      evidence: "하위 에이전트를 쓴 세션 {delegatedSessions} · 자동 압축이 있었던 세션 {compactedSessions}",
      unit: "%",
      reasons: {
        no_data: { text: "자동 압축이 있었던 주 세션이 없습니다." },
        too_little: { text: "자동 압축이 있었던 주 세션이 3개에 못 미쳐 재지 않았습니다." },
      },
    },
  },
  F3: {
    en: {
      name: "Project instructions",
      good: "Projects you use often have their own instructions",
      why: "Project instructions give the tool a reference for how a project is built and run. This rule checks whether often-used projects have those instructions.",
      fix: "Add instructions to projects you use often",
      problem: "{value} of the projects you use often have project instructions.",
      prescription: "In a project you use often, run /init to create a CLAUDE.md, then keep only what that project needs.",
      method: "Among target projects with 3 or more main sessions in the scoring window, the share that have project instructions for each tool mainly used there. Targets are folders on this PC that are Git repositories or have project instructions or settings. Folders not treated as projects, such as the home folder, are left out.",
      evidence: "Projects with instructions {withInstructions} · projects used often {targets}",
      unit: "%",
      reasons: { not_applicable: { text: "No target project had 3 or more main sessions in the scoring window. Folders that are gone or not treated as projects are not targets." } },
    },
    ko: {
      name: "프로젝트 지침",
      good: "자주 쓰는 프로젝트에 지침을 둠",
      why: "프로젝트 지침은 프로젝트를 어떻게 빌드하고 실행하는지 참고할 내용을 줍니다. 이 항목은 자주 쓰는 프로젝트에 그런 지침이 있는지 봅니다.",
      fix: "자주 쓰는 프로젝트에 지침 두기",
      problem: "자주 쓰는 프로젝트 가운데 지침이 있는 프로젝트는 {value}입니다.",
      prescription: "자주 쓰는 프로젝트에서 /init으로 CLAUDE.md를 만들고 그 프로젝트에 필요한 것만 남기세요.",
      method: "점수 구간에 주 세션이 3개 이상인 대상 프로젝트 가운데, 거기서 주로 쓴 도구마다 프로젝트 지침이 있는 프로젝트의 몫입니다. 대상은 지금 이 PC에 있고 깃 저장소이거나 프로젝트 지침·설정이 있는 폴더입니다. 홈 폴더처럼 프로젝트로 보지 않는 폴더는 뺍니다.",
      evidence: "지침이 있는 프로젝트 {withInstructions} · 자주 쓰는 프로젝트 {targets}",
      unit: "%",
      reasons: { not_applicable: { text: "점수 구간에 주 세션이 3개 이상인 대상 프로젝트가 없습니다. 작업 폴더가 지금 없거나 프로젝트로 보지 않는 폴더는 대상에서 뺍니다." } },
    },
  },
  F4: {
    en: {
      name: "Instruction overlap",
      good: "Keeps overlap between global and project instructions low",
      why: "A line that is in both global and project instructions loads twice in that project and has to be kept the same in two places.",
      fix: "Remove repeated instruction lines",
      problem: "In the project with the most overlap, {value} of global instruction lines appear again in its instructions.",
      prescription: "Keep each line in one place. Rules for everywhere go in global instructions, and rules only one project needs go in that project.",
      method: "Share of distinct global instruction lines, at least 20 characters after trimming, that appear word for word in a project's instructions. The project with the highest share is used.",
      evidence: "Repeated lines {overlappingLines} · global lines {globalLines} · projects compared {comparedProjects}",
      unit: "%",
      reasons: {
        not_applicable: { text: "There are no global instruction lines or separate project instructions to compare." },
        unreadable: { text: "An instruction file to compare could not be read." },
      },
    },
    ko: {
      name: "지침 겹침",
      good: "전역 지침과 프로젝트 지침의 겹침이 적음",
      why: "전역 지침과 프로젝트 지침에 같은 줄이 있으면 그 프로젝트에서 두 번 실리고, 고칠 때도 두 곳을 맞춰야 합니다.",
      fix: "겹치는 지침 줄 정리하기",
      problem: "가장 많이 겹치는 프로젝트에서 전역 지침 줄의 {value}가 프로젝트 지침에 다시 나옵니다.",
      prescription: "한 줄은 한 곳에만 두세요. 어디서나 통하는 규칙은 전역 지침에, 그 프로젝트에만 필요한 규칙은 프로젝트 지침에 둡니다.",
      method: "앞뒤 공백을 떼고 20자 이상인 서로 다른 전역 지침 줄 가운데 프로젝트 지침에 글자 그대로 다시 나오는 몫입니다. 몫이 가장 큰 프로젝트의 값을 씁니다.",
      evidence: "겹치는 줄 {overlappingLines} · 전역 지침 줄 {globalLines} · 견준 프로젝트 {comparedProjects}",
      unit: "%",
      reasons: {
        not_applicable: { text: "견줄 전역 지침 줄이나 별도의 프로젝트 지침이 없습니다." },
        unreadable: { text: "견주는 지침 파일 가운데 읽지 못한 것이 있습니다." },
      },
    },
  },
  F5: {
    en: {
      name: "Duplicate skills",
      good: "Limits extra copies of skills sharing a name",
      why: "Copies of a skill can drift apart across folders, making it harder to track which copy is loaded.",
      fix: "Keep one copy of each skill",
      problem: "Extra copies score {value} on average.",
      prescription: "Keep one original and remove the other copies or replace them with links to the original. Before removing a copy, check that no project sees only that copy. If you use both Claude Code and Codex, one original can be linked from both tools' folders.",
      method: "Within one tool, each extra copy of a skill name scores 1 point if all copies are identical and 2 points if any differ or cannot be compared, divided by the number of skill names. Links and copies placed by plugins are not counted.",
      evidence: "Extra identical copies {identicalCopies} · extra differing copies {differingCopies} · skill names {skillKinds}",
      unit: "{value:point|points} per skill",
      reasons: {
        not_applicable: { text: "There are no user or project skills to compare for copies. Skills inside plugins are not counted." },
        unreadable: { text: "A skill folder searched for copies could not be listed." },
      },
    },
    ko: {
      name: "같은 이름의 스킬 사본",
      good: "같은 이름의 스킬 사본을 적게 둠",
      why: "스킬을 여러 폴더에 복사해 두면 내용이 달라질 수 있고 어느 사본이 실리는지 파악하기 어려울 수 있습니다.",
      fix: "스킬 사본을 하나로 정리하기",
      problem: "남는 사본의 점수가 평균 {value}입니다.",
      prescription: "원본 하나만 남기고 나머지 사본은 지우거나 원본을 가리키는 링크로 바꾸세요. 사본을 치우기 전에 그 사본만 보이는 프로젝트가 없는지 보세요. Claude Code와 Codex를 함께 쓰면 원본 하나를 두 도구의 폴더에서 링크로 걸 수 있습니다.",
      method: "같은 도구 안에서 한 이름의 남는 사본마다, 사본이 모두 같으면 1점, 하나라도 다르거나 내용을 견줄 수 없으면 2점으로 쳐서 스킬 종 수로 나눈 값입니다. 링크와 플러그인이 넣은 사본은 세지 않습니다.",
      evidence: "같은 사본 {identicalCopies} · 내용이 다른 사본 {differingCopies} · 스킬 종 수 {skillKinds}",
      unit: "점/스킬",
      reasons: {
        not_applicable: { text: "사본을 견줄 사용자·프로젝트 스킬이 없습니다. 플러그인에 든 스킬은 세지 않습니다." },
        unreadable: { text: "사본을 찾는 스킬 폴더 가운데 목록을 읽지 못한 것이 있습니다." },
      },
    },
  },
  F6: {
    en: {
      name: "Settings conflicts",
      good: "Global and project settings do not contradict each other",
      why: "When the same permission rule is allowed on one side and denied on the other, the deny wins. The allow then has no effect, which may not be what you meant.",
      fix: "Resolve conflicting permission rules",
      problem: "Found {value} of conflicting rules.",
      prescription: "Look at each rule that is allowed in one place and denied in another, and keep it on one side only. /permissions shows the rules by scope.",
      method: "Number of pairs where the same rule text is allowed on one side and denied on the other, between your user settings and each project's project and local settings. Managed policy is not compared.",
      evidence: "Conflicting pairs {conflicts} · projects with settings {projectsWithSettings}",
      unit: "{value:pair|pairs}",
      reasons: {
        not_applicable: { text: "No listed project has project or local settings." },
        unreadable: { text: "A settings file to compare could not be read." },
      },
    },
    ko: {
      name: "설정 충돌",
      good: "전역 설정과 프로젝트 설정이 부딪히지 않음",
      why: "같은 권한 규칙이 한쪽에서는 허용, 다른 쪽에서는 금지되어 있으면 금지가 이깁니다. 허용해 둔 쪽은 듣지 않으므로 뜻과 다르게 동작할 수 있습니다.",
      fix: "부딪히는 권한 규칙 정리하기",
      problem: "부딪히는 규칙이 {value} 있습니다.",
      prescription: "한쪽에서 허용하고 다른 쪽에서 금지한 규칙을 보고 한쪽에만 남기세요. /permissions에서 범위별로 규칙을 볼 수 있습니다.",
      method: "사용자 설정과 각 프로젝트의 프로젝트 설정·로컬 설정 사이에서, 같은 규칙 문자열을 한쪽은 허용에 다른 쪽은 금지에 둔 쌍의 수입니다. 관리 정책은 견주지 않습니다.",
      evidence: "부딪히는 쌍 {conflicts} · 설정이 있는 프로젝트 {projectsWithSettings}",
      unit: "쌍",
      reasons: {
        not_applicable: { text: "목록의 프로젝트 어디에도 프로젝트 설정이나 로컬 설정이 없습니다." },
        unreadable: { text: "견주는 설정 파일 가운데 읽지 못한 것이 있습니다." },
      },
    },
  },
};
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-rules.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 58개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-rules.test.ts src/core/copy/rules-fit.ts
git commit -m "feat: 상황 적합 규칙 문구 추가"
```

---

### Task 5: 강도 규칙(I1~I4)의 문구

**Files:**
- Create: `src/core/copy/rules-intensity.ts`
- Modify: `test/core/copy-rules.test.ts`

**Interfaces:**
- Consumes: 과제 2의 `RuleCopy`, 시험.
- Produces: `INTENSITY_COPY: Record<"I1" | … | "I4", Texts<RuleCopy>>`(`src/core/copy/rules-intensity.ts`).

- 강도는 양과 깊이만 본다(설계 11.2). 많이 쓰라고 다그치지 않고, 맡길 수 있는 일의 예를 든다.
- I1은 다른 숫자를 읽을 때 함께 볼 정보라고 적는다. 쓴 날이 많다고 다른 숫자가 늘 더 믿을 만해진다고 단정하지 않는다(계획 리뷰 1차).
- 계획 리뷰 1차에서 고친 것. I3의 영어 단위는 보이는 수가 1이면 단수(`call per request`)다. I4의 기록 없음은 홈 폴더처럼 프로젝트로 보지 않는 폴더와 프로젝트에 잇지 못한 세션을 세지 않는다는 것을 적는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-rules.test.ts`(찾을 곳 1/2):

```ts
import { FIT_COPY } from "../../src/core/copy/rules-fit.ts";
import { SETUP_COPY } from "../../src/core/copy/rules-setup.ts";
```

`test/core/copy-rules.test.ts`(바꾼 뒤 1/2):

```ts
import { FIT_COPY } from "../../src/core/copy/rules-fit.ts";
import { INTENSITY_COPY } from "../../src/core/copy/rules-intensity.ts";
import { SETUP_COPY } from "../../src/core/copy/rules-setup.ts";
```

`test/core/copy-rules.test.ts`(찾을 곳 2/2):

```ts
  ["fit", FIT_COPY],
];
```

`test/core/copy-rules.test.ts`(바꾼 뒤 2/2):

```ts
  ["fit", FIT_COPY],
  ["intensity", INTENSITY_COPY],
];
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-rules.test.ts`
Expected: FAIL. `src/core/copy/rules-intensity.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/copy/rules-intensity.ts`(새 파일):

```ts
// 강도 기준(I1~I4) 규칙의 문구. 영어가 원본이고 한국어를 나란히 둔다. 강도는 많이 쓰라고 다그치지 않고 맡길 수 있는 일을 알려 준다(설계 11.2, 11.3, 11.5, 12.2)
import type { Texts } from "./lang.ts";
import type { RuleCopy } from "./types.ts";

export const INTENSITY_COPY: Record<"I1" | "I2" | "I3" | "I4", Texts<RuleCopy>> = {
  I1: {
    en: {
      name: "Days used",
      good: "Uses the tools regularly",
      why: "This counts days with a response from any tool in the 30-day scoring window. It gives context for reading the other measurements.",
      fix: "Use the tools on more days",
      problem: "Tools were used on {value} in the last 30 days.",
      prescription: "Try handing everyday tasks to the tools too, such as reading logs, drafting messages, or tidying files.",
      method: "Days in the 30-day scoring window on which any tool had a response.",
      evidence: "Days with responses {activeDays}",
      unit: "{value:day|days}",
    },
    ko: {
      name: "사용한 날",
      good: "꾸준히 씀",
      why: "점수 구간 30일 가운데 어느 도구에서든 응답이 있었던 날을 셉니다. 다른 측정값을 해석할 때 함께 볼 정보입니다.",
      fix: "쓰는 날 늘리기",
      problem: "최근 30일 가운데 쓴 날이 {value}입니다.",
      prescription: "기록 읽기, 글 초안, 파일 정리처럼 날마다 하는 일도 맡겨 보세요.",
      method: "점수 구간 30일 가운데 어느 도구에서든 응답이 있었던 날의 수입니다.",
      evidence: "응답이 있었던 날 {activeDays}",
      unit: "일",
    },
  },
  I2: {
    en: {
      name: "Requests per day",
      good: "Hands over plenty of work each day",
      why: "This is the average number of requests on days when you used the tools. It shows how often you handed work to them on those days.",
      fix: "Hand over more work on the days you use them",
      problem: "You sent {value} on average.",
      prescription: "Break your work into pieces you can hand over, such as \"write a test for this function\" or \"summarize this log\".",
      method: "Requests from you across all tools, divided by days used.",
      evidence: "Requests from you {humanRequests} · days used {activeDays}",
      unit: "{value:request|requests} per day",
      reasons: { no_data: { text: "There were no days of use in the scoring window." } },
    },
    ko: {
      name: "하루에 시키는 양",
      good: "하루에 많은 일을 맡김",
      why: "쓴 날 하루에 보낸 평균 요청 수입니다. 도구를 쓴 날에 얼마나 자주 일을 맡겼는지 보여 줍니다.",
      fix: "쓰는 날 더 많은 일 맡기기",
      problem: "쓴 날 하루에 보낸 요청이 평균 {value}입니다.",
      prescription: "\"이 함수의 시험을 써 줘\", \"이 기록을 요약해 줘\"처럼 맡길 수 있는 단위로 일을 나눠 보세요.",
      method: "모든 도구의 사람 요청 수를 사용한 날로 나눈 값입니다.",
      evidence: "사람 요청 {humanRequests} · 사용한 날 {activeDays}",
      unit: "개/일",
      reasons: { no_data: { text: "점수 구간에 쓴 날이 없습니다." } },
    },
  },
  I3: {
    en: {
      name: "Depth per request",
      good: "Lets each request run several steps",
      why: "Tool calls per request show how much one request carries, such as reading, editing, and testing in one go.",
      fix: "Hand over whole tasks",
      problem: "Tool calls averaged {value}.",
      prescription: "Instead of asking for one small step at a time, describe the whole task and how to check it, such as \"fix this bug and run the tests\".",
      method: "Tool calls across all tools, divided by requests from you.",
      evidence: "Tool calls {toolCalls} · requests from you {humanRequests}",
      unit: "{value:call|calls} per request",
      reasons: {
        no_data: { text: "There were no requests from you in the scoring window." },
        too_little: { text: "Fewer than 20 requests from you, so this was not measured." },
      },
    },
    ko: {
      name: "한 번에 맡기는 깊이",
      good: "한 번에 여러 단계를 맡김",
      why: "요청 하나에 도구 호출이 몇 번 있었는지로, 읽고 고치고 시험하는 일을 한 번에 얼마나 맡기는지 봅니다.",
      fix: "일을 통째로 맡기기",
      problem: "요청 하나에 도구 호출이 평균 {value}입니다.",
      prescription: "작은 단계를 하나씩 시키기보다 \"이 버그를 고치고 시험을 돌려 줘\"처럼 할 일과 확인 방법을 한 번에 알려 주세요.",
      method: "모든 도구의 도구 호출 수를 사람 요청 수로 나눈 값입니다.",
      evidence: "도구 호출 {toolCalls} · 사람 요청 {humanRequests}",
      unit: "회/요청",
      reasons: {
        no_data: { text: "점수 구간에 사람 요청이 없습니다." },
        too_little: { text: "사람 요청이 20개에 못 미쳐 재지 않았습니다." },
      },
    },
  },
  I4: {
    en: {
      name: "Projects in use",
      good: "Uses the tools across several projects",
      why: "This counts the projects that had a main session in the scoring window. Using the tools in more places puts the setup you built to wider use.",
      fix: "Try the tools in more projects",
      problem: "Main sessions ran in {value}.",
      prescription: "Try the tools in another project or folder you work in, too.",
      method: "Number of projects with a main session in the scoring window, counted across tools. Folders not treated as projects, such as the home folder, are left out.",
      evidence: "Projects {projects} · folders left out {excludedFolders} · sessions not linked to a project {unlinkedSessions}",
      unit: "{value:project|projects}",
      reasons: { no_data: { text: "No project had a main session in the scoring window. Folders not treated as projects, such as the home folder, and sessions not linked to a project are not counted." } },
    },
    ko: {
      name: "쓰는 폭",
      good: "여러 프로젝트에서 씀",
      why: "점수 구간에 주 세션이 있었던 프로젝트의 수입니다. 여러 곳에서 쓰면 갖춰 둔 셋팅을 그만큼 넓게 씁니다.",
      fix: "다른 프로젝트에서도 써 보기",
      problem: "주 세션이 있었던 프로젝트가 {value}입니다.",
      prescription: "일하는 다른 프로젝트나 폴더에서도 써 보세요.",
      method: "점수 구간에 주 세션이 있었던 프로젝트의 수입니다. 도구를 합쳐 세고, 홈 폴더처럼 프로젝트로 보지 않는 폴더는 뺍니다.",
      evidence: "프로젝트 {projects} · 뺀 폴더 {excludedFolders} · 프로젝트에 잇지 못한 세션 {unlinkedSessions}",
      unit: "개",
      reasons: { no_data: { text: "점수 구간에 주 세션이 있었던 프로젝트가 없습니다. 홈 폴더처럼 프로젝트로 보지 않는 폴더와 프로젝트에 잇지 못한 세션은 세지 않습니다." } },
    },
  },
};
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-rules.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 71개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-rules.test.ts src/core/copy/rules-intensity.ts
git commit -m "feat: 강도 규칙 문구 추가"
```

---

### Task 6: 규칙 하나의 문장

**Files:**
- Create: `src/core/copy/common.ts`
- Create: `src/core/copy/findings.ts`
- Test: `test/core/copy-findings.test.ts`

**Interfaces:**
- Consumes: 과제 1~5의 것. 3부의 `ResultFinding`, `ResultToolValue`, `UnjudgedServer`(`src/core/result/assemble.ts`, 타입만), 2부의 `ruleSpec`, `ToolSafeguard`, `Reason`, `Evidence`.
- Produces: `RULE_COPY: Record<RuleId, Texts<RuleCopy>>`, `FindingInput`(`Omit<ResultFinding, "text">`), `FindingText`(`{ name, title, value, unit, reason, description, prescription, method: string[], notes: string[] }`), `FindingDetails`(`{ safeguards, unjudgedServers }`), `joinValue(value: string, unit: string, lang: Lang): string`, `findingText(finding: FindingInput, details: FindingDetails, lang: Lang): FindingText`(`src/core/copy/findings.ts`). `TOOL_NAMES`, `REASON_COPY`, `TOOL_LINE`, `OTHER_TOOL_COPY`, `SAFEGUARD_COPY`, `UNJUDGED_COPY`(`src/core/copy/common.ts`). 과제 8이 결과에, 과제 9가 요약에 쓴다.

설계 11.5, 12.2, 13.1과 「2단계 4부 계획에서 보완」의 8번(분류마다의 문장)과 9번(이유의 낱말)이다.

- 제목은 분류로 고른다. 잘하고 있는 것은 잘하는 것(`good`), 정비할 것은 할 일(`fix`), 보통과 잴 수 없음은 규칙 이름이다. 설명은 잘하고 있는 것과 보통이 왜 좋은지(`why`), 정비할 것이 잰 값을 끼운 문제(`problem`), 잴 수 없음이 못 잰 이유의 설명이다. 처방은 보통과 정비할 것에만 있다.
- 잰 값은 규칙을 쟀을 때만 숫자와 단위로 낸다. 못 쟀으면 `null`이고 대신 이유의 낱말이 있다(설계 11.5의 표 「점수 자리의 글」). 이유의 설명과 낱말은 규칙이 따로 쓴 것이 있으면 그것, 없으면 공통 문구다. 설명에 끼우는 근거 숫자는 합침 규칙이면 규칙의 것, 도구별 규칙이면 규칙의 이유와 같은 이유를 낸 첫 도구의 것이다.
- 정비할 것에 실린 못 잰 규칙(E5, E6)은 후보가 나온 도구마다 `repairUnmeasured`의 문장을 만든다. 규칙은 다른 도구로 쟀는데 비율을 못 잰 도구에서 후보가 나왔으면 평소 설명(`problem`) 뒤에 그 도구의 덧붙임을 붙인다(설계 11.5의 표). 후보가 나온 도구가 둘 이상이면 문장 앞에 도구 이름을 붙인다. 지금은 도구가 하나라서 이 경우는 시험으로 가르지 못한다.
- 어떻게 쟀나는 계산식 한 줄과 근거 숫자 줄이다. 합침 규칙은 근거 숫자를 한 줄로, 도구별 규칙은 도구마다 한 줄(`Claude Code: 96% · 캐시 읽기 …`)로 낸다. S2에는 도구마다 어느 조건으로 인정됐는지(설계 11.3 「S2의 근거와 처방」. 훅의 명령은 싣지 않는다), E6에는 판정에서 뺀 서버를 까닭마다 센 줄과, claude.ai에 연결한 서버가 있으면 직접 막는 방법(설계 13.1, 16.1)을 낸다. 서버의 이름은 넣지 않는다. 결과 화면이 따로 둔 자리(`details.unjudgedServers`)에서 그린다.
- 며칠 뒤의 점검부터 판정하는지(설계 13.1)는 3부의 결정 15번대로 결과 화면을 만들 때(3단계) 정한다.
- claude.ai에 연결한 서버를 직접 막는 방법은 Claude Code가 직접 가져오는 연결에만 듣는다. 데스크톱 앱이 세션에 직접 넘기는 연결에는 MCP 설정이 닿지 않으므로 claude.ai/customize/connectors에서 끊으라고 함께 적는다(Claude Code 공식 문서의 MCP와 관리 정책 문서. 계획 리뷰 1차에서 짝 Codex 2가 찾았다). 판정에서 뺀 까닭 가운데 "정의를 읽지 못한 플러그인의 것"은 구성을 모르는 플러그인도 든다.
- 영어 단위의 단수와 복수는 반올림해 보이는 수로 가른다. I3이 `0.96`이면 `1`로 보이므로 `call per request`다(계획 리뷰 1차에서 짝 Codex 1이 찾았다).
- 문구에 순수성 검사가 막는 낱말(`process`, `fetch` 같은 것)을 글자로 넣지 않는다. 그 검사는 문자열 안도 본다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-findings.test.ts`(새 파일):

```ts
// 평가 결과의 규칙 하나에서 문장을 만드는 것을 본다. 분류와 상태에 따라 제목·설명·처방을 고르고, 잰 값과 단위, 못 잰 이유, 어떻게 쟀나, E6의 정보를 만든다(설계 11.5, 12.2, 13.1)
import { describe, expect, it } from "vitest";
import { findingText, joinValue, RULE_COPY, type FindingInput } from "../../src/core/copy/findings.ts";
import type { ResultToolValue, UnjudgedServer } from "../../src/core/result/assemble.ts";
import { RULES } from "../../src/core/rules.ts";

const toolValue = (input: Partial<ResultToolValue>): ResultToolValue => ({ tool: "claude-code", status: "scored", reason: null, value: 0.5, score: 0.5, evidence: {}, candidates: [], observed: "measured", ...input });
const finding = (ruleId: FindingInput["ruleId"], input: Partial<FindingInput>): FindingInput => ({ ruleId, axis: "efficiency", kind: "share", weight: 2, status: "scored", reason: null, value: 0.5, score: 0.5, category: "average", severity: null, gain: null, evidence: {}, tools: [], candidates: [], ...input });
const NONE = { safeguards: [], unjudgedServers: [] };
const E5_EVIDENCE = { enabled: 6, judgeable: 3, judged: 1, structural: 3, unused: 1, used: 0 };

describe("규칙 문구 표", () => {
  it("규칙 스물둘을 규칙 표의 차례로 담는다", () => {
    expect(Object.keys(RULE_COPY)).toEqual(RULES.map((spec) => spec.id));
  });
});

describe("잰 값과 단위", () => {
  it("%는 붙여 쓰고 그 밖의 단위는 영어만 띄어 쓴다", () => {
    expect(joinValue("96", "%", "en")).toBe("96%");
    expect(joinValue("0.4", "per session", "en")).toBe("0.4 per session");
    expect(joinValue("0.4", "회/세션", "ko")).toBe("0.4회/세션");
  });

  it("영어 단위는 보이는 수가 1이면 단수다", () => {
    const one = finding("S3", { axis: "setup", kind: "count", value: 1, category: "repair", evidence: { danglingLinks: 1, noFrontmatter: 0, problems: 1, unparsable: 0 } });
    expect(findingText(one, NONE, "en")).toMatchObject({ value: "1", unit: "problem" });
    expect(findingText({ ...one, value: 2 }, NONE, "en")).toMatchObject({ value: "2", unit: "problems" });
    expect(findingText(one, NONE, "ko")).toMatchObject({ value: "1", unit: "개" });
  });

  it("횟수의 영어 단위도 보이는 수로 가른다. 반올림해서 1로 보이면 단수다", () => {
    const i3 = (value: number) => findingText(finding("I3", { axis: "intensity", kind: "rate", value, category: "average", evidence: { humanRequests: 100, toolCalls: 100 } }), NONE, "en");
    expect(i3(1)).toMatchObject({ value: "1", unit: "call per request" });
    expect(i3(0.96)).toMatchObject({ value: "1", unit: "call per request" });
    expect(i3(1.1)).toMatchObject({ value: "1.1", unit: "calls per request" });
    expect(i3(0.94)).toMatchObject({ value: "0.9", unit: "calls per request" });
  });
});

describe("분류마다의 문장", () => {
  const cache = toolValue({ value: 0.96, score: 1, evidence: { cacheRead: 1200, cacheWrite: 20, input: 30 } });

  it("잘하고 있는 것은 잘하는 것을 제목으로, 왜 좋은지를 설명으로 하고 처방이 없다", () => {
    const text = findingText(finding("E1", { value: 0.96, score: 1, category: "strength", tools: [cache] }), NONE, "ko");
    expect(text).toEqual({
      name: "캐시 적중",
      title: "같은 내용을 다시 계산시키지 않음",
      value: "96",
      unit: "%",
      reason: null,
      description: RULE_COPY.E1.ko.why,
      prescription: null,
      method: [RULE_COPY.E1.ko.method, "Claude Code: 96% · 캐시 읽기 1,200 · 입력 30 · 캐시 쓰기 20 (토큰)"],
      notes: [],
    });
  });

  it("보통은 규칙 이름을 제목으로 하고 처방을 붙인다", () => {
    const text = findingText(finding("E1", { value: 0.75, category: "average", tools: [cache] }), NONE, "en");
    expect(text).toMatchObject({ title: "Cache hits", description: RULE_COPY.E1.en.why, prescription: RULE_COPY.E1.en.prescription });
  });

  it("정비할 것은 할 일을 제목으로, 잰 값을 끼운 문제를 설명으로 한다", () => {
    const text = findingText(finding("E1", { value: 0.4, score: 0, category: "repair", severity: "critical", gain: 9, tools: [toolValue({ value: 0.4, score: 0, evidence: { cacheRead: 40, cacheWrite: 10, input: 50 } })] }), NONE, "ko");
    expect(text).toMatchObject({ title: "세션의 앞부분을 자주 바꾸지 않기", value: "40", unit: "%", description: "입력 가운데 캐시에서 읽은 몫이 40%입니다.", prescription: RULE_COPY.E1.ko.prescription });
  });

  it("잴 수 없음은 이유의 낱말과 설명을 내고 값과 처방이 없다. 규칙이 따로 쓴 설명이 있으면 그것이다", () => {
    const tooLittle = findingText(finding("E2", { status: "unmeasured", reason: "too_little", value: null, score: null, category: "unmeasured", tools: [toolValue({ status: "unmeasured", reason: "too_little", value: null, score: null, evidence: { errors: 1, results: 12 } })] }), NONE, "ko");
    expect(tooLittle).toMatchObject({ title: "도구 오류", value: null, unit: null, reason: "기록이 적음", description: "도구 결과가 50개에 못 미쳐 재지 않았습니다.", prescription: null });
    expect(tooLittle.method).toEqual([RULE_COPY.E2.ko.method, "Claude Code: 잴 수 없음(기록이 적음) · 오류 1 · 도구 결과 12"]);
    const unsupported = findingText(finding("E1", { status: "unmeasured", reason: "unsupported", value: null, score: null, category: "unmeasured", tools: [toolValue({ status: "unmeasured", reason: "unsupported", value: null, score: null, evidence: { cacheRead: null, cacheWrite: null, input: null } })] }), NONE, "en");
    expect(unsupported).toMatchObject({ reason: "Not recorded", description: "This tool or record format does not record what this rule needs." });
    expect(unsupported.method[1]).toBe("Claude Code: not measured (Not recorded) · Cache reads — · input — · cache writes — (tokens)");
  });

  it("E4의 기록 없음은 지침이 없다고 하지 않는다", () => {
    const text = findingText(finding("E4", { kind: "amount", status: "unmeasured", reason: "no_data", value: null, score: null, category: "unmeasured", tools: [toolValue({ status: "unmeasured", reason: "no_data", value: null, score: null, evidence: { sampledSessions: 0, skippedSessions: 4 } })] }), NONE, "ko");
    expect(text.reason).toBe("크기가 기록되지 않음");
    expect(text.description).toBe("기록에서 지침 크기를 찾지 못했습니다. 세션을 시작할 때의 입력 정보(지침 포함)를 기록에 남기지 않는 실행 방식이 있습니다.");
    expect(text.method[1]).toBe("Claude Code: 잴 수 없음(크기가 기록되지 않음) · 표본에 넣은 세션 0 · 지침 크기가 기록에 남지 않은 세션 4");
  });

  it("합침 규칙은 근거 숫자를 한 줄로 내고, 도구별 값이 없는 도구별 규칙은 계산식만 낸다", () => {
    const s1 = findingText(finding("S1", { axis: "setup", value: 1, score: 1, category: "strength", evidence: { tools: 1, withInstructions: 1 } }), NONE, "ko");
    expect(s1.method).toEqual([RULE_COPY.S1.ko.method, "전역 지침이 있는 도구 1 · 쓰는 도구 1"]);
    const noTool = findingText(finding("E1", { status: "unmeasured", reason: "no_data", value: null, score: null, category: "unmeasured" }), NONE, "ko");
    expect(noTool).toMatchObject({ reason: "기록 없음", description: "점수 구간에 입력 토큰이 기록되지 않았습니다." });
    expect(noTool.method).toEqual([RULE_COPY.E1.ko.method]);
  });
});

describe("못 잰 도구의 정비 후보(설계 11.5)", () => {
  it("규칙을 못 쟀는데 후보가 있으면 비율을 못 낸 까닭과 정리할 수 있는 수를 함께 말한다", () => {
    const value = toolValue({ status: "unmeasured", reason: "too_little", value: null, score: null, evidence: E5_EVIDENCE, candidates: ["c1", "c2"] });
    const e5 = finding("E5", { status: "unmeasured", reason: "too_little", value: null, score: null, category: "repair", severity: "info", tools: [value], candidates: ["c1", "c2"] });
    expect(findingText(e5, NONE, "ko")).toMatchObject({
      title: "안 쓰는 스킬 끄기",
      value: null,
      reason: "가릴 수 있는 것이 적음",
      description: "쓰는지 가릴 수 있는 스킬이 3개뿐이어서 안 쓰는 비율은 내지 않았습니다. 정리할 수 있는 것은 2개 찾았습니다.",
      prescription: RULE_COPY.E5.ko.prescription,
    });
    const e6 = { ...e5, ruleId: "E6" as const, tools: [{ ...value, evidence: { ...E5_EVIDENCE, judgeable: 1 } }] };
    expect(findingText(e6, NONE, "ko").description).toBe("쓰는지 가릴 수 있는 MCP 서버가 1개뿐이어서 안 쓰는 비율은 내지 않았습니다. 정리할 수 있는 것은 2개 찾았습니다.");
    const watching = { ...e5, reason: "watching" as const, tools: [{ ...value, reason: "watching" as const }] };
    expect(findingText(watching, NONE, "ko")).toMatchObject({
      reason: "지켜보는 중",
      description: "아직 지켜보는 중인 것이 있어 안 쓰는 비율은 내지 않았습니다. 안 쓰는 것으로 확인된 것 가운데 2개는 지금 정리할 수 있습니다.",
    });
    expect(findingText(e5, NONE, "en").description).toBe("Only 3 skills are eligible for use assessment, so the unused share was not calculated. Found 2 that can be cleaned up.");
  });

  it("규칙은 다른 도구로 쟀으면 평소 설명 뒤에 후보가 나온 도구의 몫을 붙인다", () => {
    const measured = toolValue({ value: 0.1, score: 1, evidence: { ...E5_EVIDENCE, judgeable: 10, judged: 10, unused: 1, used: 9 } });
    const other = toolValue({ status: "unmeasured", reason: "too_little", value: null, score: null, evidence: E5_EVIDENCE, candidates: ["c1", "c2"] });
    const e5 = finding("E5", { value: 0.1, score: 1, category: "repair", severity: "info", tools: [measured, other], candidates: ["c1", "c2"] });
    expect(findingText(e5, NONE, "ko").description).toBe("쓰는지 판정된 스킬 가운데 10%는 쓰지 않은 것으로 확인됐습니다. Claude Code는 쓰는지 가릴 수 있는 것이 3개뿐이어서 비율을 내지 않았지만 정리할 수 있는 것이 2개 있습니다.");
    const watching = { ...e5, tools: [measured, { ...other, reason: "watching" as const }] };
    expect(findingText(watching, NONE, "ko").description).toBe("쓰는지 판정된 스킬 가운데 10%는 쓰지 않은 것으로 확인됐습니다. Claude Code는 아직 지켜보는 중인 것이 있어 비율을 내지 않았지만 안 쓰는 것으로 확인된 것 가운데 2개는 지금 정리할 수 있습니다.");
  });
});

describe("규칙마다 덧붙는 것", () => {
  it("안전장치(S2)의 어떻게 쟀나에 도구마다 인정된 조건을 적는다", () => {
    const s2 = finding("S2", { axis: "setup", value: 1, score: 1, category: "strength", evidence: { guarded: 1, tools: 1 } });
    const line = (guardHook: boolean | null, permissionChecks: boolean | null) => findingText(s2, { safeguards: [{ tool: "claude-code", guardHook, permissionChecks }], unjudgedServers: [] }, "ko").method[2];
    expect(line(true, false)).toBe("Claude Code: 셸 명령을 덮는 도구 실행 전 확인 훅이 있음");
    expect(line(false, true)).toBe("Claude Code: 기본 모드가 권한 우회가 아님");
    expect(line(true, true)).toBe("Claude Code: 기본 모드가 권한 우회가 아니고 셸 명령을 덮는 확인 훅도 있음");
    expect(line(false, false)).toBe("Claude Code: 안전장치 없음(권한 우회 모드이고 셸 명령을 덮는 확인 훅이 없음)");
    expect(line(null, true)).toBe("Claude Code: 설정 파일을 읽지 못해 가리지 못함");
  });

  it("E6에는 판정에서 뺀 서버를 까닭마다 세어 적고, claude.ai에 연결한 서버가 있으면 직접 막는 방법을 적는다. 이름은 넣지 않는다", () => {
    const server = (name: string, why: UnjudgedServer["why"], scope: UnjudgedServer["scope"] = "user"): UnjudgedServer => ({ tool: "claude-code", name, scope, projectRoot: null, pluginId: null, why });
    const unjudgedServers = [server("secret-a", "not_established"), server("secret-b", "not_established"), server("claude.ai secret", "no_definition", "claude-ai")];
    const e6 = finding("E6", { status: "unmeasured", reason: "watching", value: null, score: null, category: "unmeasured", tools: [toolValue({ status: "unmeasured", reason: "watching", value: null, score: null, evidence: E5_EVIDENCE })] });
    const notes = findingText(e6, { safeguards: [], unjudgedServers }, "ko").notes;
    expect(notes).toEqual([
      "판정에서 뺀 서버 가운데 부른 기록이 없는 것입니다. 끄자고 하지 않습니다.",
      "Claude Code: 정의가 이 PC에 없거나 다 읽히지 않음 1개",
      "Claude Code: 아직 지켜보는 중 2개",
      "Claude Code가 직접 가져오는 claude.ai 연결을 막으려면 사용자 설정(~/.claude/settings.json)의 deniedMcpServers 목록에 { \"serverName\": \"<이름>\" }을 더하세요. 데스크톱 앱이 직접 넘기는 연결은 이렇게 막히지 않습니다. 그런 연결은 claude.ai/customize/connectors에서 끊으세요.",
    ]);
    expect(JSON.stringify(findingText(e6, { safeguards: [], unjudgedServers }, "en"))).not.toMatch(/secret/);
    expect(findingText(e6, NONE, "ko").notes).toEqual([]);
    expect(findingText(finding("E5", {}), { safeguards: [], unjudgedServers }, "ko").notes).toEqual([]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-findings.test.ts`
Expected: FAIL. `src/core/copy/findings.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/copy/common.ts`(새 파일):

```ts
// 규칙 문장에 함께 쓰는 문구. 도구 이름, 못 잰 이유의 낱말과 설명, 도구별 값의 줄, 다른 도구로 쟀을 때의 덧붙임, 안전장치의 조건, E6 항목의 정보다(설계 11.4, 11.5, 12.2, 13.1)
import type { ToolId } from "../../adapters/types.ts";
import type { Reason } from "../reasons.ts";
import type { UnjudgedServer } from "../result/assemble.ts";
import type { Texts } from "./lang.ts";
import type { ReasonCopy } from "./types.ts";

export const TOOL_NAMES: Record<ToolId, Texts<string>> = {
  "claude-code": { en: "Claude Code", ko: "Claude Code" },
};

/** 못 잰 이유의 낱말과 설명. 규칙이 따로 쓴 것이 없을 때 쓴다(설계 11.4) */
export const REASON_COPY: Record<Reason, Texts<ReasonCopy>> = {
  unsupported: {
    en: { word: "Not recorded", text: "This tool or record format does not record what this rule needs." },
    ko: { word: "기록되지 않음", text: "이 도구나 기록 형식은 이 규칙이 보는 것을 남기지 않습니다." },
  },
  unreadable: {
    en: { word: "Could not read", text: "A file this rule needs could not be read. See the notices as well." },
    ko: { word: "읽지 못함", text: "이 규칙에 필요한 파일을 읽지 못했습니다. 알림도 함께 보세요." },
  },
  not_applicable: {
    en: { word: "Not applicable", text: "There is nothing for this rule to look at." },
    ko: { word: "해당 없음", text: "이 규칙이 볼 것이 없습니다." },
  },
  incomplete: {
    en: { word: "Incomplete records", text: "The records could not all be read, so this was not measured." },
    ko: { word: "기록이 빠짐", text: "기록을 빠짐없이 읽지 못해 재지 않았습니다." },
  },
  no_data: {
    en: { word: "No records", text: "There is nothing in the records to measure yet." },
    ko: { word: "기록 없음", text: "잴 기록이 아직 없습니다." },
  },
  too_little: {
    en: { word: "Too few records", text: "Not enough records have built up to measure this." },
    ko: { word: "기록이 적음", text: "잴 만큼 기록이 쌓이지 않았습니다." },
  },
  watching: {
    en: { word: "Still watching", text: "Still watching before judging." },
    ko: { word: "지켜보는 중", text: "아직 지켜보는 중입니다." },
  },
};

/** 도구별 값의 줄. {value}는 단위를 붙인 잰 값, {reason}은 못 잰 이유의 낱말, {evidence}는 그 도구의 근거 숫자 줄이다 */
export const TOOL_LINE: Texts<{ measured: string; unmeasured: string }> = {
  en: { measured: "{tool}: {value} · {evidence}", unmeasured: "{tool}: not measured ({reason}) · {evidence}" },
  ko: { measured: "{tool}: {value} · {evidence}", unmeasured: "{tool}: 잴 수 없음({reason}) · {evidence}" },
};

/** 규칙은 다른 도구로 쟀는데 정비 후보가 나온 도구는 비율을 못 쟀을 때, 규칙의 평소 설명 뒤에 붙인다(설계 11.5의 표) */
export const OTHER_TOOL_COPY: Record<"too_little" | "watching", Texts<string>> = {
  too_little: {
    en: "Only {judgeable} {judgeable:installation|installations} in {tool} can be assessed for use, so its share was not calculated, but {candidates} can be cleaned up.",
    ko: "{tool}는 쓰는지 가릴 수 있는 것이 {judgeable}개뿐이어서 비율을 내지 않았지만 정리할 수 있는 것이 {candidates}개 있습니다.",
  },
  watching: {
    en: "Some installations in {tool} are still being observed, so its share was not calculated, but {candidates} of those confirmed unused can be cleaned up now.",
    ko: "{tool}는 아직 지켜보는 중인 것이 있어 비율을 내지 않았지만 안 쓰는 것으로 확인된 것 가운데 {candidates}개는 지금 정리할 수 있습니다.",
  },
};

/** 안전장치(S2)가 도구마다 어느 조건으로 인정됐는지(설계 11.3 S2의 근거와 처방). 훅의 명령은 싣지 않는다 */
export const SAFEGUARD_COPY: Texts<{ line: string; hook: string; permissions: string; both: string; none: string; unknown: string }> = {
  en: {
    line: "{tool}: {condition}",
    hook: "a PreToolUse hook that can block covers shell commands",
    permissions: "the default mode does not bypass permissions",
    both: "the default mode does not bypass permissions, and a confirming hook covers shell commands too",
    none: "no safeguard (permissions are bypassed and no confirming hook covers shell commands)",
    unknown: "could not tell, because a settings file could not be read",
  },
  ko: {
    line: "{tool}: {condition}",
    hook: "셸 명령을 덮는 도구 실행 전 확인 훅이 있음",
    permissions: "기본 모드가 권한 우회가 아님",
    both: "기본 모드가 권한 우회가 아니고 셸 명령을 덮는 확인 훅도 있음",
    none: "안전장치 없음(권한 우회 모드이고 셸 명령을 덮는 확인 훅이 없음)",
    unknown: "설정 파일을 읽지 못해 가리지 못함",
  },
};

/** E6 항목의 정보. 판정에서 뺀 켜진 서버 가운데 부른 기록이 없는 것을 까닭마다 센다. 이름은 결과 화면이 따로 그린다(설계 13.1, 16.1) */
export const UNJUDGED_COPY: Texts<{ intro: string; line: string; why: Record<UnjudgedServer["why"], string>; deny: string }> = {
  en: {
    intro: "Servers left out of the judgment that have no record of being called. They are not suggested for turning off.",
    line: "{tool}: {why} ({count})",
    why: {
      no_definition: "definition not on this PC or not fully read",
      plugin_unread: "plugin configuration or MCP definitions could not be read",
      not_established: "still being watched",
      observation_incomplete: "records could not all be read",
    },
    deny: "To block a claude.ai connector that Claude Code loads itself, add { \"serverName\": \"<name>\" } to the deniedMcpServers list in your user settings (~/.claude/settings.json). Connectors that the desktop app passes in directly are not blocked this way. Disconnect those at claude.ai/customize/connectors.",
  },
  ko: {
    intro: "판정에서 뺀 서버 가운데 부른 기록이 없는 것입니다. 끄자고 하지 않습니다.",
    line: "{tool}: {why} {count}개",
    why: {
      no_definition: "정의가 이 PC에 없거나 다 읽히지 않음",
      plugin_unread: "플러그인 구성이나 MCP 정의를 읽지 못함",
      not_established: "아직 지켜보는 중",
      observation_incomplete: "기록을 빠짐없이 읽지 못함",
    },
    deny: "Claude Code가 직접 가져오는 claude.ai 연결을 막으려면 사용자 설정(~/.claude/settings.json)의 deniedMcpServers 목록에 { \"serverName\": \"<이름>\" }을 더하세요. 데스크톱 앱이 직접 넘기는 연결은 이렇게 막히지 않습니다. 그런 연결은 claude.ai/customize/connectors에서 끊으세요.",
  },
};
```

`src/core/copy/findings.ts`(새 파일):

```ts
// 평가 결과의 규칙 하나에서 문장(제목, 설명, 처방, 어떻게 쟀나)을 만든다. 분류와 상태에 따라 문구 표에서 고르고 숫자를 끼운다. 이름과 경로는 넣지 않는다(순수 함수, 설계 11.5, 12.2, 13.1, 19.1)
import type { Evidence } from "../measure.ts";
import type { ToolSafeguard } from "../metrics/setup.ts";
import type { Reason } from "../reasons.ts";
import type { ResultFinding, ResultToolValue, UnjudgedServer } from "../result/assemble.ts";
import { ruleSpec, type RuleId, type ValueKind } from "../rules.ts";
import { OTHER_TOOL_COPY, REASON_COPY, SAFEGUARD_COPY, TOOL_LINE, TOOL_NAMES, UNJUDGED_COPY } from "./common.ts";
import { fill, formatValue, slots } from "./format.ts";
import type { Lang, Texts } from "./lang.ts";
import { EFFICIENCY_COPY } from "./rules-efficiency.ts";
import { FIT_COPY } from "./rules-fit.ts";
import { INTENSITY_COPY } from "./rules-intensity.ts";
import { SETUP_COPY } from "./rules-setup.ts";
import type { ReasonCopy, RuleCopy } from "./types.ts";

/** 규칙 스물둘의 문구(규칙 표의 차례) */
export const RULE_COPY: Record<RuleId, Texts<RuleCopy>> = { ...SETUP_COPY, ...EFFICIENCY_COPY, ...FIT_COPY, ...INTENSITY_COPY };

/** 규칙 하나의 문장(한 언어) */
export interface FindingText {
  /** 규칙 이름 */
  name: string;
  /** 분류에 맞는 제목. 잘하고 있는 것은 잘하는 것, 정비할 것은 할 일, 보통과 잴 수 없음은 규칙 이름이다 */
  title: string;
  /** 잰 값(숫자 부분). 못 쟀으면 null이다 */
  value: string | null;
  /** 잰 값의 단위. 못 쟀으면 null이다 */
  unit: string | null;
  /** 못 잰 이유의 낱말. 점수 자리에 "잴 수 없음"과 함께 보인다. 쟀으면 null이다 */
  reason: string | null;
  description: string;
  /** 처방. 보통과 정비할 것에만 있다 */
  prescription: string | null;
  /** 어떻게 쟀나. 계산식 한 줄과 근거 숫자의 줄(도구별 규칙은 도구마다 한 줄) */
  method: string[];
  /** 덧붙이는 정보. E6 항목의 판정에서 뺀 서버다 */
  notes: string[];
}

/** 문장을 붙이기 전의 규칙 하나 */
export type FindingInput = Omit<ResultFinding, "text">;

/** 규칙의 근거 가운데 문장에 쓰는 것 */
export interface FindingDetails {
  safeguards: readonly ToolSafeguard[];
  unjudgedServers: readonly UnjudgedServer[];
}

/** 잰 값에 단위를 붙인 글. %는 두 언어 모두 붙여 쓰고, 그 밖의 단위는 영어만 띄어 쓴다 */
export function joinValue(value: string, unit: string, lang: Lang): string {
  return unit === "%" || lang === "ko" ? `${value}${unit}` : `${value} ${unit}`;
}

/** 틀의 자리를 근거 숫자로 채운다. 근거 숫자에 없는 자리는 세지 못한 것으로 둔다 */
function fillEvidence(template: string, evidence: Evidence, extra: Readonly<Record<string, string | number>> = {}): string {
  return fill(template, { ...Object.fromEntries(slots(template).map((slot) => [slot, null])), ...evidence, ...extra });
}

function reasonOf(copy: RuleCopy, reason: Reason, lang: Lang): ReasonCopy {
  const own = copy.reasons?.[reason];
  const common = REASON_COPY[reason][lang];
  return { word: own?.word ?? common.word, text: own?.text ?? common.text };
}

/** 잰 값과 단위. 영어 단위의 단수와 복수는 보이는 수로 가른다 */
function measured(kind: ValueKind, value: number, copy: RuleCopy): { value: string; unit: string } {
  const shown = formatValue(kind, value);
  return { value: shown, unit: fill(copy.unit, { value: shown === "1" ? 1 : 0 }) };
}

function toolLine(kind: ValueKind, value: ResultToolValue, copy: RuleCopy, lang: Lang): string {
  const tool = TOOL_NAMES[value.tool][lang];
  const evidence = fillEvidence(copy.evidence, value.evidence);
  if (value.status === "scored") {
    const shown = measured(kind, value.value!, copy);
    return fill(TOOL_LINE[lang].measured, { tool, value: joinValue(shown.value, shown.unit, lang), evidence });
  }
  return fill(TOOL_LINE[lang].unmeasured, { tool, reason: reasonOf(copy, value.reason!, lang).word, evidence });
}

/** 못 잰 이유를 낸 근거 숫자. 도구별 규칙은 규칙의 이유와 같은 이유를 낸 첫 도구의 것이다 */
function reasonEvidence(finding: FindingInput): Evidence {
  if (finding.tools.length === 0) return finding.evidence;
  return finding.tools.find((value) => value.reason === finding.reason)?.evidence ?? {};
}

/** 비율은 못 쟀는데 정비 후보가 나온 도구(설계 11.5) */
const candidateSources = (finding: FindingInput): (ResultToolValue & { reason: "too_little" | "watching" })[] =>
  finding.tools.filter((value): value is ResultToolValue & { reason: "too_little" | "watching" } => value.status === "unmeasured" && value.candidates.length > 0 && (value.reason === "too_little" || value.reason === "watching"));

function description(finding: FindingInput, copy: RuleCopy, lang: Lang, shown: { value: string; unit: string } | null): string {
  if (finding.category === "strength" || finding.category === "average") return copy.why;
  if (finding.category === "unmeasured") return fillEvidence(reasonOf(copy, finding.reason!, lang).text, reasonEvidence(finding));
  const sources = candidateSources(finding);
  if (finding.status === "unmeasured") {
    const sentences = sources.map((value) => {
      const sentence = fillEvidence(copy.repairUnmeasured?.[value.reason] ?? reasonOf(copy, value.reason, lang).text, value.evidence, { candidates: value.candidates.length });
      return sources.length > 1 ? `${TOOL_NAMES[value.tool][lang]}: ${sentence}` : sentence;
    });
    return sentences.length > 0 ? sentences.join(" ") : fillEvidence(reasonOf(copy, finding.reason!, lang).text, reasonEvidence(finding));
  }
  const others = sources.map((value) => fillEvidence(OTHER_TOOL_COPY[value.reason][lang], value.evidence, { tool: TOOL_NAMES[value.tool][lang], candidates: value.candidates.length }));
  return [fill(copy.problem, { value: joinValue(shown!.value, shown!.unit, lang) }), ...others].join(" ");
}

function safeguardLine(safeguard: ToolSafeguard, lang: Lang): string {
  const copy = SAFEGUARD_COPY[lang];
  const { guardHook, permissionChecks } = safeguard;
  const condition = guardHook === null || permissionChecks === null ? copy.unknown : guardHook && permissionChecks ? copy.both : guardHook ? copy.hook : permissionChecks ? copy.permissions : copy.none;
  return fill(copy.line, { tool: TOOL_NAMES[safeguard.tool][lang], condition });
}

const WHY_ORDER: readonly UnjudgedServer["why"][] = ["no_definition", "plugin_unread", "not_established", "observation_incomplete"];

/** E6 항목의 정보. 도구마다 까닭마다 수를 적고, claude.ai에 연결한 서버가 있으면 직접 막는 방법을 적는다 */
function unjudgedNotes(servers: readonly UnjudgedServer[], lang: Lang): string[] {
  if (servers.length === 0) return [];
  const copy = UNJUDGED_COPY[lang];
  const lines = [copy.intro];
  for (const tool of [...new Set(servers.map((server) => server.tool))].sort()) {
    for (const why of WHY_ORDER) {
      const count = servers.filter((server) => server.tool === tool && server.why === why).length;
      if (count > 0) lines.push(fill(copy.line, { tool: TOOL_NAMES[tool][lang], why: copy.why[why], count }));
    }
  }
  if (servers.some((server) => server.scope === "claude-ai")) lines.push(copy.deny);
  return lines;
}

export function findingText(finding: FindingInput, details: FindingDetails, lang: Lang): FindingText {
  const copy = RULE_COPY[finding.ruleId][lang];
  const shown = finding.status === "scored" ? measured(finding.kind, finding.value!, copy) : null;
  const method = [copy.method];
  if (ruleSpec(finding.ruleId).unit === "merged") method.push(fillEvidence(copy.evidence, finding.evidence));
  for (const value of finding.tools) method.push(toolLine(finding.kind, value, copy, lang));
  if (finding.ruleId === "S2") for (const safeguard of details.safeguards) method.push(safeguardLine(safeguard, lang));
  return {
    name: copy.name,
    title: finding.category === "strength" ? copy.good : finding.category === "repair" ? copy.fix : copy.name,
    value: shown?.value ?? null,
    unit: shown?.unit ?? null,
    reason: finding.status === "unmeasured" ? reasonOf(copy, finding.reason!, lang).word : null,
    description: description(finding, copy, lang, shown),
    prescription: finding.category === "average" || finding.category === "repair" ? copy.prescription : null,
    method,
    notes: finding.ruleId === "E6" ? unjudgedNotes(details.unjudgedServers, lang) : [],
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-findings.test.ts test/core/purity.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 111개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-findings.test.ts src/core/copy/common.ts src/core/copy/findings.ts
git commit -m "feat: 규칙 문장 만들기 추가"
```

---

### Task 7: 알림 열세 종류의 문장

**Files:**
- Create: `src/core/copy/notices.ts`
- Test: `test/core/copy-notices.test.ts`

**Interfaces:**
- Consumes: 과제 1의 것, 과제 6의 `TOOL_NAMES`. 3부의 `Notice`, `NOTICE_KINDS`, `UnreadableSetup`, `UncountedPlugin`(`src/core/result/notices.ts`), `Withheld`(`src/core/scoreboard.ts`), `ObservationReason`(`src/adapters/claude/observation.ts`). 모두 타입이거나 값이다.
- Produces: `WITHHELD_COPY: Record<Withheld, Texts<string>>`, `noticeText(notice: Notice, lang: Lang): string`(`src/core/copy/notices.ts`). 과제 8이 결과의 알림에 쓴다.

설계 「2단계 3부 계획에서 보완」의 알림 표(열세 종류와 싣는 것)에 문장을 붙인다.

- 문장에는 종류, 정해진 값(무엇을 읽지 못했는지, 세지 않은 까닭, 지표, 확인한 버전의 범위), 수만 넣는다. 경로와 이름(파일, 프로젝트, 플러그인)은 넣지 않는다. 터미널 요약에도 같은 문장이 간다(설계 19.1).
- 문장은 그 알림을 만드는 처리와 뜻이 맞아야 한다. 읽지 못한 기록과 셋팅은 읽은 것만으로 계산했다고, 관측이 빠짐없지 않으면 안 쓰는 것을 판정하지 않았다고, 처음 나온 응답이 겹치는 세션은 겹친 응답을 빼지 않고 셌다고(설계 9.5 「다른 파일에 복사된 응답」) 쓴다.
- 분류하지 못한 기록은 압축, 거절 표시, 훅 첨부로 묶어 수를 센다(알림의 `what`은 `compaction`, `denial:<종류>`, `hook:<종류>`). 기록에 적힌 종류 이름은 넣지 않는다.
- 켜져 있는데 세지 않은 플러그인의 알림은 까닭이 MCP 정의나 훅을 읽지 못한 것일 때 구성은 알고 일부만 못 읽었으므로, "세지 않았다"가 아니라 "확인하지 못한 정보가 있다"고 쓴다(계획 리뷰 1차).
- 사람 요청 알림은 근거가 약한 몫이 10%를 넘으면 요청이 한 건이어도 나온다. 영어는 명사를 요청 수로, 동사를 근거가 약한 수로 고른다(구현 검증 1차에서 짝 Codex 1이 찾았다).
- 시험은 열세 종류 모두가 두 언어에서 문장으로 끝나고, 두 언어가 같은 숫자를 싣고, 경로와 이름이 없는지 본다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-notices.test.ts`(새 파일):

```ts
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
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-notices.test.ts`
Expected: FAIL. `src/core/copy/notices.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/copy/notices.ts`(새 파일):

```ts
// 평가 결과의 알림 열세 종류의 문장. 종류, 정해진 값, 수만 넣고 이름과 경로는 넣지 않아 터미널 요약에도 같은 문장이 간다(순수 함수, 설계 12.2, 19.1, 20.1, 「2단계 3부 계획에서 보완」의 알림 표)
import type { ObservationReason } from "../../adapters/claude/observation.ts";
import type { Notice, UncountedPlugin, UnreadableSetup } from "../result/notices.ts";
import type { Withheld } from "../scoreboard.ts";
import { TOOL_NAMES } from "./common.ts";
import { fill } from "./format.ts";
import type { Lang, Texts } from "./lang.ts";

/** AQ를 내지 않은 까닭 */
export const WITHHELD_COPY: Record<Withheld, Texts<string>> = {
  too_few_requests: { en: "There were fewer than 20 requests from you in the scoring window.", ko: "점수 구간의 사람 요청이 20개에 못 미칩니다." },
  too_few_days: { en: "The tools were used on fewer than 3 days in the scoring window.", ko: "점수 구간에 쓴 날이 3일에 못 미칩니다." },
  no_axes: { en: "None of the four criteria could be measured.", ko: "잴 수 있는 기준이 하나도 없습니다." },
};

const METRIC: Record<"skills" | "mcp", Texts<string>> = {
  skills: { en: "skill use", ko: "스킬 사용" },
  mcp: { en: "MCP calls", ko: "MCP 호출" },
};

const OBSERVATION_REASON: Record<ObservationReason, Texts<string>> = {
  "unreadable-files": { en: "unreadable files", ko: "읽지 못한 파일" },
  "too-long-lines": { en: "lines too long", ko: "너무 긴 줄" },
  "unconfirmed-pieces": { en: "unconfirmed pieces", ko: "확인하지 못한 조각" },
};

const UNREADABLE_SETUP: Record<UnreadableSetup, Texts<string>> = {
  claude_json: { en: ".claude.json", ko: ".claude.json" },
  user_settings: { en: "user settings", ko: "사용자 설정" },
  managed_settings: { en: "managed policy", ko: "관리 정책" },
  project_settings: { en: "project settings", ko: "프로젝트 설정" },
  local_settings: { en: "local settings", ko: "로컬 설정" },
  mcp_json: { en: "project .mcp.json", ko: "프로젝트의 .mcp.json" },
  plugins_file: { en: "plugin install records", ko: "플러그인 설치 기록" },
  skill_dirs: { en: "skill folders", ko: "스킬 폴더" },
  instructions: { en: "instruction files", ko: "지침 파일" },
  hook_settings: { en: "settings with hooks", ko: "훅을 적은 설정" },
  skill_files: { en: "SKILL.md files", ko: "SKILL.md" },
};

const UNCOUNTED: Record<UncountedPlugin, Texts<string>> = {
  composition_unknown: { en: "contents unknown", ko: "구성을 모름" },
  not_installed: { en: "not in the install records", ko: "설치 기록에 없음" },
  skills_unreadable: { en: "skill folder could not be read", ko: "스킬 폴더를 읽지 못함" },
  mcp_unreadable: { en: "MCP definitions could not be read", ko: "MCP 정의를 읽지 못함" },
  hooks_unreadable: { en: "hooks could not be read", ko: "훅을 읽지 못함" },
};

/** 분류하지 못한 기록의 묶음. 알림의 what은 compaction, denial:<종류>, hook:<종류>다 */
const UNCLASSIFIED: Record<"compaction" | "denial" | "hook", Texts<string>> = {
  compaction: { en: "{count} {count:compaction|compactions}", ko: "압축 {count}개" },
  denial: { en: "{count} {count:denial marker|denial markers}", ko: "거절 표시 {count}개" },
  hook: { en: "{count} {count:hook attachment|hook attachments}", ko: "훅 첨부 {count}개" },
};

/** 알림마다의 틀 */
const LINES: Texts<Record<Exclude<Notice["kind"], "score_withheld">, string> & { withheld: string; setupCounted: string }> = {
  en: {
    withheld: "No AQ was given. {reasons}",
    state_reset: "The state file was broken, so a new one was started. The record of watched installs builds up again from the start.",
    record_unreadable: "{tool}: {files} {files:file|files} and {dirs} {dirs:folder|folders} of records could not be read. Only what was read is counted.",
    observation_incomplete: "{tool}: the records of {metric} could not all be read ({reasons}), so unused ones were not judged.",
    setup_unreadable: "{tool}: some setup could not be read ({what}). Only what was read is counted.",
    setupCounted: "{tool}: some setup could not be read ({what}, {count} {count:place|places}). Only what was read is counted.",
    plugins_uncounted: "{tool}: {count} enabled {count:plugin has|plugins have} information that could not be fully inspected ({why}).",
    setup_problems_unscored: "{tool}: {count} {count:problem was|problems were} found in places that scores do not count (inside plugins, managed policy, files the tool writes).",
    projects_gone: "{count} {count:project|projects} whose folder is no longer on this PC {count:was|were} left out of the rules that look at instructions and settings.",
    version_unverified: "{tool}: the records include {count} {count:version|versions} outside the verified range ({from} to {to}). Only the fields that could be read are counted.",
    weak_human_requests: "{tool}: {weak} of {total} {total:request|requests} in the scoring window {weak:has|have} weak evidence of coming from a person.",
    overlapping_responses: "{tool}: {sessions} {sessions:session starts|sessions start} with responses that also appear in another session. The overlap was not removed from the counts.",
    unclassified: "{tool}: some records could not be classified ({items}).",
    orphan_subsessions: "{tool}: {sessions} {sessions:subsession has|subsessions have} no known parent session.",
  },
  ko: {
    withheld: "AQ를 내지 않았습니다. {reasons}",
    state_reset: "상태 파일이 깨져 새로 시작했습니다. 설치를 지켜본 기록이 처음부터 다시 쌓입니다.",
    record_unreadable: "{tool} 기록 가운데 읽지 못한 파일 {files}개와 폴더 {dirs}개가 있습니다. 읽은 것만으로 계산했습니다.",
    observation_incomplete: "{tool}의 {metric} 기록을 빠짐없이 읽지 못해({reasons}) 안 쓰는 것을 판정하지 않았습니다.",
    setup_unreadable: "{tool}에서 읽지 못한 셋팅이 있습니다({what}). 읽은 것만으로 계산했습니다.",
    setupCounted: "{tool}에서 읽지 못한 셋팅이 있습니다({what} {count}곳). 읽은 것만으로 계산했습니다.",
    plugins_uncounted: "{tool}에서 켜져 있는 플러그인 {count}개에 확인하지 못한 정보가 있습니다({why}).",
    setup_problems_unscored: "{tool}에서 점수에 세지 않는 곳(플러그인 안, 관리 정책, 도구가 쓰는 파일)에 문제가 {count}개 있습니다.",
    projects_gone: "작업 폴더가 지금 PC에 없는 프로젝트 {count}개는 지침과 설정을 보는 규칙에서 뺐습니다.",
    version_unverified: "{tool} 기록에 확인한 범위({from}~{to}) 밖의 버전이 {count}개 있습니다. 읽을 수 있는 필드만으로 계산했습니다.",
    weak_human_requests: "{tool}의 점수 구간 사람 요청 {total}개 가운데 {weak}개는 사람이 보냈다는 근거가 약합니다.",
    overlapping_responses: "{tool}에서 처음 나온 응답이 다른 세션과 겹치는 세션이 {sessions}개 있습니다. 겹친 응답을 빼지 않고 셌습니다.",
    unclassified: "{tool}에 분류하지 못한 기록이 있습니다({items}).",
    orphan_subsessions: "{tool}에 부모 세션을 모르는 하위 세션이 {sessions}개 있습니다.",
  },
};

const LIST_JOIN = ", ";

function unclassifiedItems(counts: readonly { what: string; count: number }[], lang: Lang): string {
  const groups = (["compaction", "denial", "hook"] as const).map((group) => ({ group, count: counts.filter((item) => item.what.split(":")[0] === group).reduce((sum, item) => sum + item.count, 0) }));
  return groups
    .filter((item) => item.count > 0)
    .map((item) => fill(UNCLASSIFIED[item.group][lang], { count: item.count }))
    .join(LIST_JOIN);
}

export function noticeText(notice: Notice, lang: Lang): string {
  const lines = LINES[lang];
  const tool = "tool" in notice ? TOOL_NAMES[notice.tool][lang] : "";
  switch (notice.kind) {
    case "score_withheld":
      return fill(lines.withheld, { reasons: notice.reasons.map((reason) => WITHHELD_COPY[reason][lang]).join(" ") });
    case "state_reset":
      return lines.state_reset;
    case "record_unreadable":
      return fill(lines.record_unreadable, { tool, files: notice.files.length, dirs: notice.dirs.length });
    case "observation_incomplete":
      return fill(lines.observation_incomplete, { tool, metric: METRIC[notice.metric][lang], reasons: notice.reasons.map((reason) => OBSERVATION_REASON[reason][lang]).join(LIST_JOIN) });
    case "setup_unreadable": {
      const what = UNREADABLE_SETUP[notice.what][lang];
      return notice.targets.length > 0 ? fill(lines.setupCounted, { tool, what, count: notice.targets.length }) : fill(lines.setup_unreadable, { tool, what });
    }
    case "plugins_uncounted":
      return fill(lines.plugins_uncounted, { tool, count: notice.plugins.length, why: UNCOUNTED[notice.why][lang] });
    case "setup_problems_unscored":
      return fill(lines.setup_problems_unscored, { tool, count: notice.problems.length });
    case "projects_gone":
      return fill(lines.projects_gone, { count: notice.projects.length });
    case "version_unverified":
      return fill(lines.version_unverified, { tool, count: notice.versions.length, from: notice.verified.from, to: notice.verified.to });
    case "weak_human_requests":
      return fill(lines.weak_human_requests, { tool, weak: notice.weak, total: notice.total });
    case "overlapping_responses":
      return fill(lines.overlapping_responses, { tool, sessions: notice.sessions });
    case "unclassified":
      return fill(lines.unclassified, { tool, items: unclassifiedItems(notice.counts, lang) });
    case "orphan_subsessions":
      return fill(lines.orphan_subsessions, { tool, sessions: notice.sessions });
  }
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-notices.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 16개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-notices.test.ts src/core/copy/notices.ts
git commit -m "feat: 알림 열세 종류의 문장 추가"
```

---

### Task 8: 평가 결과에 두 언어의 문장과 처음 보일 언어 싣기

**Files:**
- Create: `src/core/copy/grades.ts`
- Modify: `test/commands/checkup.test.ts`
- Modify: `test/core/result-assemble.test.ts`
- Modify: `test/core/result-determinism.test.ts`
- Modify: `test/core/result-summary.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/commands/checkup.ts`
- Modify: `src/core/result/assemble.ts`
- Test: `test/core/copy-grades.test.ts`

**Interfaces:**
- Consumes: 과제 1~7의 것. 3부의 `checkupResult`, `CheckupResult`, `ResultInput`(`src/core/result/assemble.ts`), `runCheckup`, `CheckupOptions`(`src/commands/checkup.ts`), `Overall`, `Category`(`src/core/scoreboard.ts`).
- Produces: `GRADE_COPY`, `ResultText`(`{ grade, diagnosis, noStrengths, noRepairs }`), `resultText(score: Overall, categories: readonly Category[], lang: Lang): ResultText`(`src/core/copy/grades.ts`). `ResultInput.lang`, `CheckupResult.lang`, `CheckupResult.text: Texts<ResultText>`, `ResultFinding.text: Texts<FindingText>`, `ResultNotice`(`Notice & { text: Texts<string> }`), `CheckupOptions.lang`. 과제 9와 과제 10이 쓴다.

「2단계 4부 계획에서 보완」의 2번(두 언어를 모두 싣는다)과 10번(별명과 진단)이다.

- 평가 결과에는 지원하는 두 언어의 문장을 모두 싣는다. 결과 화면은 한 파일에서 언어를 바꾸므로(설계 13.2) 결과 파일 하나로 두 언어를 다 그릴 수 있어야 한다. 처음 보일 언어(`lang`)를 시간대 다음 자리에 싣는다. 설계 12.1의 입력 묶음의 "언어"가 이것이다. 언어만 다르면 평가 결과는 `lang` 한 칸만 다르다.
- 결과 전체의 문장은 등급의 별명(설계 11.6의 표), 진단 한 줄(등급마다), 빈 목록의 두 문장(설계 11.5)이다. AQ를 내지 않았으면 별명은 `null`이고, 진단은 기록이 모자라면 점수를 내는 데 필요한 기록이 부족하니 더 쓴 뒤 다시 점검해 보라고 하고(설계 11.4의 7. 기록이 쌓이기만 하면 점수가 나온다고 약속하지 않는다), 잰 기준이 없을 뿐이면 그렇게 말한다. 낮은 등급의 진단도 사용자를 탓하지 않고 정비소가 일하는 쪽으로 쓴다(설계 11.5 「말투」의 예문이 가장 낮은 등급의 진단이다).
- 진단은 등급만으로 손볼 곳의 수나 기준이 고른지를 단정하지 않는다(계획 리뷰 1차에서 짝 Codex 2가 찾았다). 보통만 있는 C 등급에서는 정비할 것이 없어 "지금은 고칠 것이 없습니다."와 함께 나올 수 있고, 기준 하나가 낮아도 S 등급일 수 있다. 가장 낮은 등급은 어떤 규칙이 0.6 미만이어야 닿으므로 정비할 것이 늘 있어 설계의 예문을 그대로 쓴다.
- 필드의 차례는 `schema`, `rulesVersion`, `appVersion`, `evaluatedAt`, `timezone`, `lang`, `window`, `tools`, `coverage`, `score`, `text`, `axes`, `findings`, `candidates`, `usage`, `deepHints`, `notices`, `details`다. 규칙의 문장은 `findings[].text`, 알림의 문장은 `notices[].text`다.
- 명령은 아직 `--lang`을 받지 않는다. 이 과제에서는 OS의 언어(실행 환경의 로캘)로 정하고, `--lang`은 과제 10이 더한다. 3부의 시험은 입력과 옵션에 언어를 넣고, 결과의 필드 차례와 문장이 붙은 모양에 맞춘다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup.test.ts`(찾을 곳):

```ts
    clock: { nowMs: NOW, timeZone: "Asia/Seoul" },
    stateDir,
```

`test/commands/checkup.test.ts`(바꾼 뒤):

```ts
    clock: { nowMs: NOW, timeZone: "Asia/Seoul" },
    lang: "en",
    stateDir,
```

`test/core/copy-grades.test.ts`(새 파일):

```ts
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
```

`test/core/result-assemble.test.ts`(찾을 곳 1/5):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { evaluate } from "../../src/core/evaluate.ts";
```

`test/core/result-assemble.test.ts`(바꾼 뒤 1/5):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { findingText } from "../../src/core/copy/findings.ts";
import { resultText } from "../../src/core/copy/grades.ts";
import { noticeText } from "../../src/core/copy/notices.ts";
import { evaluate } from "../../src/core/evaluate.ts";
```

`test/core/result-assemble.test.ts`(찾을 곳 2/5):

```ts
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return { input, evaluation: evaluate(input), collected: [collected()], appVersion: "0.1.0", run: { stateBroken: false }, ...extra };
};
```

`test/core/result-assemble.test.ts`(바꾼 뒤 2/5):

```ts
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return { input, evaluation: evaluate(input), collected: [collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false }, ...extra };
};
```

`test/core/result-assemble.test.ts`(찾을 곳 3/5):

```ts
    const result = checkupResult(input);
    expect(Object.keys(result)).toEqual(["schema", "rulesVersion", "appVersion", "evaluatedAt", "timezone", "window", "tools", "coverage", "score", "axes", "findings", "candidates", "usage", "deepHints", "notices", "details"]);
    expect(RESULT_SCHEMA).toBe(1);
    expect(result).toMatchObject({ schema: 1, rulesVersion: "1.0.0", appVersion: "0.1.0", evaluatedAt: "2026-11-13T03:00:00.000Z", timezone: "Asia/Seoul", window: input.evaluation.windows });
    expect(result.score).toEqual(input.evaluation.score);
```

`test/core/result-assemble.test.ts`(바꾼 뒤 3/5):

```ts
    const result = checkupResult(input);
    expect(Object.keys(result)).toEqual(["schema", "rulesVersion", "appVersion", "evaluatedAt", "timezone", "lang", "window", "tools", "coverage", "score", "text", "axes", "findings", "candidates", "usage", "deepHints", "notices", "details"]);
    expect(RESULT_SCHEMA).toBe(1);
    expect(result).toMatchObject({ schema: 1, rulesVersion: "1.0.0", appVersion: "0.1.0", evaluatedAt: "2026-11-13T03:00:00.000Z", timezone: "Asia/Seoul", lang: "ko", window: input.evaluation.windows });
    expect(result.score).toEqual(input.evaluation.score);
```

`test/core/result-assemble.test.ts`(찾을 곳 4/5):

```ts
    expect(result.findings.find((finding) => finding.ruleId === "S1")!.tools).toEqual([]);
    const { tools, ...rest } = f1;
    const { tools: originalTools, ...originalRest } = input.evaluation.findings.find((finding) => finding.ruleId === "F1")!;
```

`test/core/result-assemble.test.ts`(바꾼 뒤 4/5):

```ts
    expect(result.findings.find((finding) => finding.ruleId === "S1")!.tools).toEqual([]);
    const { tools, text: _text, ...rest } = f1;
    const { tools: originalTools, ...originalRest } = input.evaluation.findings.find((finding) => finding.ruleId === "F1")!;
```

`test/core/result-assemble.test.ts`(찾을 곳 5/5):

```ts
  });
});
```

`test/core/result-assemble.test.ts`(바꾼 뒤 5/5):

```ts
  });

  it("규칙, 알림, 결과에 두 언어의 문장을 싣는다. 문장은 문구 표에서 만든 그대로이고 이름과 경로가 없다", () => {
    const servers = [mcpServer("secret-server", { scope: "claude-ai", definitionHash: null })];
    const result = checkupResult(resultInput({ setup: { mcpServers: servers, pluginsWithoutInstall: ["secret-plugin@m"] } }, { collected: [collected({ read: { ...collected().read, unreadableFiles: ["/secret/s.jsonl"] } })] }));
    const details = { safeguards: result.details.safeguards, unjudgedServers: result.details.unjudgedServers };
    for (const finding of result.findings) {
      const { text, ...rest } = finding;
      expect(text).toEqual({ en: findingText(rest, details, "en"), ko: findingText(rest, details, "ko") });
    }
    for (const notice of result.notices) {
      const { text, ...rest } = notice;
      expect(text).toEqual({ en: noticeText(rest, "en"), ko: noticeText(rest, "ko") });
    }
    const categories = result.findings.map((finding) => finding.category);
    expect(result.text).toEqual({ en: resultText(result.score, categories, "en"), ko: resultText(result.score, categories, "ko") });
    expect(result.details.unjudgedServers.length).toBeGreaterThan(0);
    expect(result.notices.length).toBeGreaterThan(0);
    expect(JSON.stringify([result.text, result.findings.map((finding) => finding.text), result.notices.map((notice) => notice.text)])).not.toMatch(/secret/);
  });

  it("언어만 다르면 처음 보일 언어만 다르다", () => {
    const korean = checkupResult(resultInput({}));
    const english = checkupResult(resultInput({}, { lang: "en" }));
    expect(english.lang).toBe("en");
    expect({ ...english, lang: "ko" }).toEqual(korean);
  });
});
```

`test/core/result-determinism.test.ts`(찾을 곳):

```ts
const resultText = (input: EvaluationInput, files: string[]): string => JSON.stringify(checkupResult({ input, evaluation: evaluate(input), collected: [collected(files)], appVersion: "0.1.0", run: { stateBroken: true } }));
```

`test/core/result-determinism.test.ts`(바꾼 뒤):

```ts
const resultText = (input: EvaluationInput, files: string[]): string => JSON.stringify(checkupResult({ input, evaluation: evaluate(input), collected: [collected(files)], appVersion: "0.1.0", lang: "en", run: { stateBroken: true } }));
```

`test/core/result-summary.test.ts`(찾을 곳 1/3):

```ts
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
```

`test/core/result-summary.test.ts`(바꾼 뒤 1/3):

```ts
import { describe, expect, it } from "vitest";
import { findingText, type FindingInput } from "../../src/core/copy/findings.ts";
import { noticeText } from "../../src/core/copy/notices.ts";
import { evaluate } from "../../src/core/evaluate.ts";
```

`test/core/result-summary.test.ts`(찾을 곳 2/3):

```ts
  const input = evaluationInput([claudeTool({ sessions: enough, setup: { pluginsWithoutInstall: ["secret-plugin@m"] } })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", run: { stateBroken: false } });
}
const finding = (ruleId: ResultFinding["ruleId"], input: Partial<ResultFinding>): ResultFinding => ({ ruleId, axis: "efficiency", kind: "share", weight: 2, status: "scored", reason: null, value: 0.5, score: 0.5, category: "average", severity: null, gain: null, evidence: {}, tools: [], candidates: [], ...input });

```

`test/core/result-summary.test.ts`(바꾼 뒤 2/3):

```ts
  const input = evaluationInput([claudeTool({ sessions: enough, setup: { pluginsWithoutInstall: ["secret-plugin@m"] } })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", lang: "en", run: { stateBroken: false } });
}
const finding = (ruleId: ResultFinding["ruleId"], input: Partial<FindingInput>): ResultFinding => {
  const source: FindingInput = { ruleId, axis: "efficiency", kind: "share", weight: 2, status: "scored", reason: null, value: 0.5, score: 0.5, category: "average", severity: null, gain: null, evidence: {}, tools: [], candidates: [], ...input };
  const details = { safeguards: [], unjudgedServers: [] };
  return { ...source, text: { en: findingText(source, details, "en"), ko: findingText(source, details, "ko") } };
};

```

`test/core/result-summary.test.ts`(찾을 곳 3/3):

```ts
    ];
    const summary = checkupSummary({ ...baseResult(), notices }, null);
    expect(summary.notices).toEqual([
```

`test/core/result-summary.test.ts`(바꾼 뒤 3/3):

```ts
    ];
    const summary = checkupSummary({ ...baseResult(), notices: notices.map((notice) => ({ ...notice, text: { en: noticeText(notice, "en"), ko: noticeText(notice, "ko") } })) }, null);
    expect(summary.notices).toEqual([
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-grades.test.ts test/core/result-assemble.test.ts test/core/result-summary.test.ts test/core/result-determinism.test.ts test/commands/checkup.test.ts`
Expected: FAIL. `src/core/copy/grades.ts`를 찾지 못해 `test/core/copy-grades.test.ts`와 `test/core/result-assemble.test.ts`가 실패한다. 나머지 셋은 통과한다(입력에 언어를 더하고 알림에 문장을 붙인 것뿐이라 지금 코드로도 돈다).

- [ ] **Step 3: 구현한다**

`src/cli.ts`(찾을 곳 1/2):

```ts
import { runCheckup } from "./commands/checkup.ts";
import { clean } from "./commands/clean.ts";
```

`src/cli.ts`(바꾼 뒤 1/2):

```ts
import { runCheckup } from "./commands/checkup.ts";
import { pickLang } from "./core/copy/lang.ts";
import { clean } from "./commands/clean.ts";
```

`src/cli.ts`(찾을 곳 2/2):

```ts
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      stateDir: stateDir(context.homedir),
```

`src/cli.ts`(바꾼 뒤 2/2):

```ts
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      lang: pickLang(null, Intl.DateTimeFormat().resolvedOptions().locale),
      stateDir: stateDir(context.homedir),
```

`src/commands/checkup.ts`(찾을 곳 1/3):

```ts
import type { EvalClock } from "../collect/claude.ts";
import { evaluate } from "../core/evaluate.ts";
```

`src/commands/checkup.ts`(바꾼 뒤 1/3):

```ts
import type { EvalClock } from "../collect/claude.ts";
import type { Lang } from "../core/copy/lang.ts";
import { evaluate } from "../core/evaluate.ts";
```

`src/commands/checkup.ts`(찾을 곳 2/3):

```ts
  clock: EvalClock;
  stateDir: string;
```

`src/commands/checkup.ts`(바꾼 뒤 2/3):

```ts
  clock: EvalClock;
  /** 처음 보일 언어(설계 13.2) */
  lang: Lang;
  stateDir: string;
```

`src/commands/checkup.ts`(찾을 곳 3/3):

```ts
  const evaluation = evaluate(gathered.input);
  const result = checkupResult({ input: gathered.input, evaluation, collected: gathered.tools, appVersion: PROGRAM_VERSION, run: { stateBroken: opened.broken } });
  const stamp = resultStamp(options.clock.nowMs);
```

`src/commands/checkup.ts`(바꾼 뒤 3/3):

```ts
  const evaluation = evaluate(gathered.input);
  const result = checkupResult({ input: gathered.input, evaluation, collected: gathered.tools, appVersion: PROGRAM_VERSION, lang: options.lang, run: { stateBroken: opened.broken } });
  const stamp = resultStamp(options.clock.nowMs);
```

`src/core/copy/grades.ts`(새 파일):

```ts
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
```

`src/core/result/assemble.ts`(찾을 곳 1/12):

```ts
// 평가와 수집 결과에서 평가 결과(결과 파일에 저장하는 것)를 조립한다. 입력 묶음이 같으면 글자 하나 다르지 않다. 문장과 잰 값의 단위는 4부(문구)가 더한다(순수 함수, 설계 12.1, 12.2, 13.1)
import { makeWindows } from "../../adapters/common/dates.ts";
import type { Coverage, ToolId } from "../../adapters/types.ts";
import type { McpFact } from "../../scan/types.ts";
```

`src/core/result/assemble.ts`(바꾼 뒤 1/12):

```ts
// 평가와 수집 결과에서 평가 결과(결과 파일에 저장하는 것)를 조립한다. 입력 묶음이 같으면 글자 하나 다르지 않다. 규칙, 알림, 결과 전체에 두 언어의 문장을 싣는다(순수 함수, 설계 12.1, 12.2, 13.1, 13.2)
import { makeWindows } from "../../adapters/common/dates.ts";
import type { Coverage, ToolId } from "../../adapters/types.ts";
import { findingText, type FindingText } from "../copy/findings.ts";
import { resultText, type ResultText } from "../copy/grades.ts";
import type { Lang, Texts } from "../copy/lang.ts";
import { noticeText } from "../copy/notices.ts";
import type { McpFact } from "../../scan/types.ts";
```

`src/core/result/assemble.ts`(찾을 곳 2/12):

```ts

/** 평가 결과의 입력. 입력 묶음(설계 12.1)과, 그것으로 낸 평가와 수집 결과다. 실행 입력은 상태 파일이 깨졌는지뿐이다 */
export interface ResultInput {
```

`src/core/result/assemble.ts`(바꾼 뒤 2/12):

```ts

/** 평가 결과의 입력. 입력 묶음(설계 12.1)과, 그것으로 낸 평가와 수집 결과다. 언어는 처음 보일 언어다. 실행 입력은 상태 파일이 깨졌는지뿐이다 */
export interface ResultInput {
```

`src/core/result/assemble.ts`(찾을 곳 3/12):

```ts
  appVersion: string;
  run: { stateBroken: boolean };
```

`src/core/result/assemble.ts`(바꾼 뒤 3/12):

```ts
  appVersion: string;
  lang: Lang;
  run: { stateBroken: boolean };
```

`src/core/result/assemble.ts`(찾을 곳 4/12):

```ts
export type ResultToolValue = ToolValue & { observed: Coverage };
export type ResultFinding = Omit<Finding, "tools"> & { tools: ResultToolValue[] };

```

`src/core/result/assemble.ts`(바꾼 뒤 4/12):

```ts
export type ResultToolValue = ToolValue & { observed: Coverage };
/** 규칙 하나. 문장은 지원하는 두 언어 모두 싣는다. 결과 화면이 한 파일에서 언어를 바꾼다(설계 13.2) */
export type ResultFinding = Omit<Finding, "tools"> & { tools: ResultToolValue[]; text: Texts<FindingText> };
/** 알림 하나와 그 문장 */
export type ResultNotice = Notice & { text: Texts<string> };

```

`src/core/result/assemble.ts`(찾을 곳 5/12):

```ts
  timezone: string;
  window: Evaluation["windows"];
```

`src/core/result/assemble.ts`(바꾼 뒤 5/12):

```ts
  timezone: string;
  /** 처음 보일 언어. 터미널 요약도 이 언어다(설계 13.2) */
  lang: Lang;
  window: Evaluation["windows"];
```

`src/core/result/assemble.ts`(찾을 곳 6/12):

```ts
  score: Overall;
  axes: AxisScore[];
```

`src/core/result/assemble.ts`(바꾼 뒤 6/12):

```ts
  score: Overall;
  /** 등급의 별명, 진단, 빈 목록의 문장 */
  text: Texts<ResultText>;
  axes: AxisScore[];
```

`src/core/result/assemble.ts`(찾을 곳 7/12):

```ts
  deepHints: DeepHint[];
  notices: Notice[];
  /** 규칙의 근거 가운데 따로 둔 것과 결과 화면이 그리는 이름 목록 */
```

`src/core/result/assemble.ts`(바꾼 뒤 7/12):

```ts
  deepHints: DeepHint[];
  notices: ResultNotice[];
  /** 규칙의 근거 가운데 따로 둔 것과 결과 화면이 그리는 이름 목록 */
```

`src/core/result/assemble.ts`(찾을 곳 8/12):

```ts
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** 이름 목록의 범위 차례(설계 11.5 「차례」) */
```

`src/core/result/assemble.ts`(바꾼 뒤 8/12):

```ts
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const textsOf = <T>(make: (lang: Lang) => T): Texts<T> => ({ en: make("en"), ko: make("ko") });
/** 이름 목록의 범위 차례(설계 11.5 「차례」) */
```

`src/core/result/assemble.ts`(찾을 곳 9/12):

```ts
  const coverageByTool = new Map(input.tools.map((tool) => [tool.tool, tool.coverage]));
  const findings = evaluation.findings.map((finding): ResultFinding => ({
    ...finding,
    tools: finding.tools.map((value) => ({ ...value, observed: observedOf(finding.ruleId as ToolRuleId, coverageByTool.get(value.tool)!) })),
  }));
  return {
```

`src/core/result/assemble.ts`(바꾼 뒤 9/12):

```ts
  const coverageByTool = new Map(input.tools.map((tool) => [tool.tool, tool.coverage]));
  const details = { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation) };
  const findings = evaluation.findings.map((finding): ResultFinding => {
    const source = { ...finding, tools: finding.tools.map((value) => ({ ...value, observed: observedOf(finding.ruleId as ToolRuleId, coverageByTool.get(value.tool)!) })) };
    return { ...source, text: textsOf((lang) => findingText(source, details, lang)) };
  });
  const notices = sortNotices([...recordNotices(input, evaluation, collected), ...setupNotices(input, evaluation, source.run)]);
  const categories = findings.map((finding) => finding.category);
  return {
```

`src/core/result/assemble.ts`(찾을 곳 10/12):

```ts
    timezone: input.clock.timeZone,
    window: evaluation.windows,
```

`src/core/result/assemble.ts`(바꾼 뒤 10/12):

```ts
    timezone: input.clock.timeZone,
    lang: source.lang,
    window: evaluation.windows,
```

`src/core/result/assemble.ts`(찾을 곳 11/12):

```ts
    score: evaluation.score,
    axes: evaluation.axes,
```

`src/core/result/assemble.ts`(바꾼 뒤 11/12):

```ts
    score: evaluation.score,
    text: textsOf((lang) => resultText(evaluation.score, categories, lang)),
    axes: evaluation.axes,
```

`src/core/result/assemble.ts`(찾을 곳 12/12):

```ts
    deepHints: deepHints(input),
    notices: sortNotices([...recordNotices(input, evaluation, collected), ...setupNotices(input, evaluation, source.run)]),
    details: { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation) },
  };
```

`src/core/result/assemble.ts`(바꾼 뒤 12/12):

```ts
    deepHints: deepHints(input),
    notices: notices.map((notice): ResultNotice => ({ ...notice, text: textsOf((lang) => noticeText(notice, lang)) })),
    details,
  };
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core test/commands`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 38개, 시험 699개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/commands/checkup.test.ts test/core/copy-grades.test.ts test/core/result-assemble.test.ts test/core/result-determinism.test.ts test/core/result-summary.test.ts src/cli.ts src/commands/checkup.ts src/core/copy/grades.ts src/core/result/assemble.ts
git commit -m "feat: 평가 결과에 두 언어 문장 싣기"
```

---

### Task 9: 터미널 요약의 문장

**Files:**
- Modify: `test/core/result-summary.test.ts`
- Modify: `src/core/copy/common.ts`
- Modify: `src/core/result/summary.ts`

**Interfaces:**
- Consumes: 과제 6의 `joinValue`, `TOOL_NAMES`, 과제 8의 `CheckupResult.text`와 `findings[].text`, `notices[].text`. 3부의 `checkupSummary`, `SummaryFix`(`src/core/result/summary.ts`).
- Produces: `AXIS_NAMES`, `SUMMARY_COPY`(`src/core/copy/common.ts`), `SummaryText`(`{ grade, diagnosis, best: { title, detail } | null, noBest, fixFirst: { title, detail }[], noFixFirst, notices: string[] }`), `CheckupSummary.lang`, `CheckupSummary.text`. 과제 10이 표준 출력으로 낸다.

설계 11.5 「터미널의 요약에 실릴 때」, 12.3, 15와 「2단계 4부 계획에서 보완」의 3번(요약은 한 언어)이다.

- 요약의 문장은 결과의 언어 하나로 싣는다. 별명, 진단, 알림, 빈 목록의 문장은 결과의 문장을 그대로 옮긴다.
- 가장 잘하는 것은 잘하는 것의 제목과, 규칙 이름에 붙인 잰 값(설계 15의 "같은 내용을 다시 계산시키지 않음 (캐시 적중 96%)")이다. 먼저 고칠 것은 할 일의 제목과 덧붙이는 말이다. 덧붙이는 말은 예상 효과가 있으면 "{기준} 최대 +{N}", 없으면 후보의 수를 적는다. 규칙을 못 쟀으면 "정리할 것 {N}개 · 비율은 잴 수 없음", 다른 도구로 쟀으면 "정리할 것 {N}개 · {도구}의 비율은 잴 수 없음"이다(설계 11.5). 예상 효과의 자리에 0을 넣지 않는다.
- 기준의 영어 이름은 Setup, Efficiency, Fit, Intensity다(「2단계 4부 계획에서 보완」의 10번).
- 요약은 3부와 같이 이름과 경로를 싣지 않는다. 요약 전체를 문자열로 바꿔 보는 3부의 시험이 문장까지 본다.
- 영어의 "다른 도구로 쟀다" 꼴은 도구 이름이 여럿이어도 읽히게 `share for {tools} not measured`로 쓴다(계획 리뷰 1차).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-summary.test.ts`(찾을 곳 1/2):

```ts
    const summary = checkupSummary(result, null);
    expect(Object.keys(summary)).toEqual(["aq", "grade", "tier", "withheld", "axes", "best", "fixFirst", "notices", "reportPath"]);
    expect(summary).toMatchObject({ aq: result.score.aq, grade: result.score.grade, tier: result.score.tier, withheld: result.score.withheld, reportPath: null });
```

`test/core/result-summary.test.ts`(바꾼 뒤 1/2):

```ts
    const summary = checkupSummary(result, null);
    expect(Object.keys(summary)).toEqual(["aq", "grade", "tier", "withheld", "axes", "best", "fixFirst", "notices", "reportPath", "lang", "text"]);
    expect(summary).toMatchObject({ aq: result.score.aq, grade: result.score.grade, tier: result.score.tier, withheld: result.score.withheld, reportPath: null });
```

`test/core/result-summary.test.ts`(찾을 곳 2/2):

```ts
});
```

`test/core/result-summary.test.ts`(바꾼 뒤 2/2):

```ts
});

describe("요약의 문장", () => {
  const e5Value = { tool: "claude-code" as const, status: "unmeasured" as const, reason: "too_little" as const, value: null, score: null, evidence: { enabled: 4, judgeable: 2, judged: 2, structural: 2, unused: 1, used: 1 }, candidates: ["A1:claude-code:x"], observed: "measured" as const };

  it("결과의 언어로 만든다. 별명, 진단, 알림은 결과의 문장 그대로다", () => {
    const korean = baseResult();
    const summary = checkupSummary({ ...korean, lang: "ko" }, null);
    expect(summary.lang).toBe("ko");
    expect(summary.text).toMatchObject({ grade: korean.text.ko.grade, diagnosis: korean.text.ko.diagnosis, notices: korean.notices.map((notice) => notice.text.ko) });
    expect(checkupSummary(korean, null).text.diagnosis).toBe(korean.text.en.diagnosis);
  });

  it("가장 잘하는 것은 잘하는 것의 제목과 규칙 이름에 붙인 잰 값이다", () => {
    const result = { ...baseResult(), lang: "ko" as const, findings: [finding("E1", { category: "strength", value: 0.96, score: 1 })] };
    expect(checkupSummary(result, null).text).toMatchObject({ best: { title: "같은 내용을 다시 계산시키지 않음", detail: "캐시 적중 96%" }, noBest: null });
    expect(checkupSummary({ ...result, lang: "en" }, null).text.best).toEqual({ title: "Reuses cached context instead of recomputing it", detail: "Cache hits 96%" });
  });

  it("먼저 고칠 것은 할 일의 제목과 덧붙이는 말이다. 예상 효과가 없으면 후보의 수를 적고 0을 넣지 않는다(설계 11.5)", () => {
    const measured = { ...e5Value, status: "scored" as const, reason: null, value: 0.1, score: 1, candidates: [] };
    const result = {
      ...baseResult(),
      lang: "ko" as const,
      findings: [
        finding("E3", { category: "repair", gain: 5, severity: "critical", kind: "rate", value: 2 }),
        finding("E5", { category: "repair", status: "unmeasured", reason: "too_little", value: null, score: null, severity: "info", candidates: ["A1:claude-code:x"], tools: [e5Value] }),
        finding("E6", { category: "repair", value: 0.1, score: 1, severity: "info", candidates: ["A3:claude-code:a", "A3:claude-code:b"], tools: [measured, { ...e5Value, candidates: ["A3:claude-code:a", "A3:claude-code:b"] }] }),
      ],
    };
    expect(checkupSummary(result, null).text.fixFirst).toEqual([
      { title: "긴 세션 나누기", detail: "효율 최대 +5" },
      { title: "안 쓰는 스킬 끄기", detail: "정리할 것 1개 · 비율은 잴 수 없음" },
      { title: "안 쓰는 MCP 서버 끄기", detail: "정리할 것 2개 · Claude Code의 비율은 잴 수 없음" },
    ]);
    expect(checkupSummary({ ...result, lang: "en" }, null).text.fixFirst.map((fix) => fix.detail)).toEqual(["Efficiency up to +5", "1 to clean up · share not measured", "2 to clean up · share for Claude Code not measured"]);
    expect(checkupSummary(result, null).text.noFixFirst).toBeNull();
  });

  it("가장 잘하는 것이나 먼저 고칠 것이 없으면 빈 목록의 문장을 싣는다", () => {
    const result = { ...baseResult(), lang: "ko" as const, findings: [finding("E1", { category: "average" })] };
    const text = { ...result.text, ko: { ...result.text.ko, noStrengths: "아직 뚜렷한 강점을 찾지 못했습니다. 고칠 것부터 하나씩 해 봅시다.", noRepairs: "지금은 고칠 것이 없습니다." } };
    expect(checkupSummary({ ...result, text }, null).text).toMatchObject({ best: null, noBest: "아직 뚜렷한 강점을 찾지 못했습니다. 고칠 것부터 하나씩 해 봅시다.", fixFirst: [], noFixFirst: "지금은 고칠 것이 없습니다." });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-summary.test.ts`
Expected: FAIL. 요약 시험 다섯이 실패한다(필드의 차례에 `lang`과 `text`가 없음, 요약의 문장 넷).

- [ ] **Step 3: 구현한다**

`src/core/copy/common.ts`(찾을 곳 1/2):

```ts
// 규칙 문장에 함께 쓰는 문구. 도구 이름, 못 잰 이유의 낱말과 설명, 도구별 값의 줄, 다른 도구로 쟀을 때의 덧붙임, 안전장치의 조건, E6 항목의 정보다(설계 11.4, 11.5, 12.2, 13.1)
import type { ToolId } from "../../adapters/types.ts";
import type { Reason } from "../reasons.ts";
import type { UnjudgedServer } from "../result/assemble.ts";
```

`src/core/copy/common.ts`(바꾼 뒤 1/2):

```ts
// 규칙 문장과 요약에 함께 쓰는 문구. 도구와 기준의 이름, 못 잰 이유의 낱말과 설명, 도구별 값의 줄, 다른 도구로 쟀을 때의 덧붙임, 안전장치의 조건, E6 항목의 정보, 요약의 덧붙이는 말이다(설계 11.4, 11.5, 12.2, 13.1, 15)
import type { ToolId } from "../../adapters/types.ts";
import type { Reason } from "../reasons.ts";
import type { Axis } from "../rules.ts";
import type { UnjudgedServer } from "../result/assemble.ts";
```

`src/core/copy/common.ts`(찾을 곳 2/2):

```ts

/** 못 잰 이유의 낱말과 설명. 규칙이 따로 쓴 것이 없을 때 쓴다(설계 11.4) */
```

`src/core/copy/common.ts`(바꾼 뒤 2/2):

```ts

export const AXIS_NAMES: Record<Axis, Texts<string>> = {
  setup: { en: "Setup", ko: "셋팅" },
  efficiency: { en: "Efficiency", ko: "효율" },
  fit: { en: "Fit", ko: "상황 적합" },
  intensity: { en: "Intensity", ko: "강도" },
};

/**
 * 터미널 요약의 덧붙이는 말. 가장 잘하는 것은 규칙 이름에 잰 값을 붙이고, 먼저 고칠 것은 예상 효과가 있으면 그것을,
 * 없으면 후보의 수를 적는다. 예상 효과의 자리에 0을 넣지 않는다(설계 11.5 「터미널의 요약에 실릴 때」, 15)
 */
export const SUMMARY_COPY: Texts<{ best: string; gain: string; unmeasured: string; otherTools: string; candidates: string }> = {
  en: { best: "{name} {value}", gain: "{axis} up to +{gain}", unmeasured: "{candidates} to clean up · share not measured", otherTools: "{candidates} to clean up · share for {tools} not measured", candidates: "{candidates} to clean up" },
  ko: { best: "{name} {value}", gain: "{axis} 최대 +{gain}", unmeasured: "정리할 것 {candidates}개 · 비율은 잴 수 없음", otherTools: "정리할 것 {candidates}개 · {tools}의 비율은 잴 수 없음", candidates: "정리할 것 {candidates}개" },
};

/** 못 잰 이유의 낱말과 설명. 규칙이 따로 쓴 것이 없을 때 쓴다(설계 11.4) */
```

`src/core/result/summary.ts`(찾을 곳 1/5):

```ts
// 평가 결과에서 터미널에 전할 요약을 만든다. 표준 출력으로 AI에게 가므로 스킬·서버·프로젝트의 이름과 경로를 넣지 않는다. 문장은 4부(문구)가 이 재료로 만든다(순수 함수, 설계 11.5, 12.3, 15, 19.1)
import type { ToolId } from "../../adapters/types.ts";
import type { Axis, RuleId, ValueKind } from "../rules.ts";
```

`src/core/result/summary.ts`(바꾼 뒤 1/5):

```ts
// 평가 결과에서 터미널에 전할 요약을 만든다. 표준 출력으로 AI에게 가므로 스킬·서버·프로젝트의 이름과 경로를 넣지 않는다. 문장은 결과의 언어 하나로 싣는다(순수 함수, 설계 11.5, 12.3, 13.2, 15, 19.1)
import type { ToolId } from "../../adapters/types.ts";
import { AXIS_NAMES, SUMMARY_COPY, TOOL_NAMES } from "../copy/common.ts";
import { joinValue } from "../copy/findings.ts";
import { fill } from "../copy/format.ts";
import type { Lang } from "../copy/lang.ts";
import type { Axis, RuleId, ValueKind } from "../rules.ts";
```

`src/core/result/summary.ts`(찾을 곳 2/5):

```ts

export interface CheckupSummary {
```

`src/core/result/summary.ts`(바꾼 뒤 2/5):

```ts

/** 요약의 문장(결과의 언어). 모델은 이 문장을 그대로 옮기고 숫자를 바꾸거나 더하지 않는다(설계 15) */
export interface SummaryText {
  /** 등급의 별명. AQ를 내지 않았으면 null이다 */
  grade: string | null;
  /** 진단 한 줄 */
  diagnosis: string;
  /** 가장 잘하는 것의 제목과 덧붙이는 말(규칙 이름과 잰 값). 없으면 null이다 */
  best: { title: string; detail: string } | null;
  /** 가장 잘하는 것이 없을 때의 문장 */
  noBest: string | null;
  /** 먼저 고칠 것마다 제목과 덧붙이는 말(fixFirst와 같은 차례) */
  fixFirst: { title: string; detail: string }[];
  /** 먼저 고칠 것이 없을 때의 문장 */
  noFixFirst: string | null;
  /** 알림의 문장(notices와 같은 차례) */
  notices: string[];
}

export interface CheckupSummary {
```

`src/core/result/summary.ts`(찾을 곳 3/5):

```ts
  reportPath: string | null;
}
```

`src/core/result/summary.ts`(바꾼 뒤 3/5):

```ts
  reportPath: string | null;
  lang: Lang;
  text: SummaryText;
}
```

`src/core/result/summary.ts`(찾을 곳 4/5):

```ts

export function checkupSummary(result: CheckupResult, reportPath: string | null): CheckupSummary {
  const strength = result.findings.find((finding) => finding.category === "strength") ?? null;
  const fixFirst = result.findings
    .filter((finding) => finding.category === "repair")
    .slice(0, FIX_FIRST_LIMIT)
    .map((finding): SummaryFix => ({
      ruleId: finding.ruleId,
      axis: finding.axis,
      gain: finding.gain,
      measured: finding.status === "scored",
      candidates: finding.candidates.length,
      unmeasuredTools: finding.tools.filter((value) => value.status === "unmeasured" && value.candidates.length > 0).map((value) => value.tool),
    }));
  return {
```

`src/core/result/summary.ts`(바꾼 뒤 4/5):

```ts

function fixDetail(fix: SummaryFix, lang: Lang): string {
  const copy = SUMMARY_COPY[lang];
  if (fix.gain !== null) return fill(copy.gain, { axis: AXIS_NAMES[fix.axis][lang], gain: fix.gain });
  if (!fix.measured) return fill(copy.unmeasured, { candidates: fix.candidates });
  if (fix.unmeasuredTools.length > 0) return fill(copy.otherTools, { candidates: fix.candidates, tools: fix.unmeasuredTools.map((tool) => TOOL_NAMES[tool][lang]).join(", ") });
  return fill(copy.candidates, { candidates: fix.candidates });
}

export function checkupSummary(result: CheckupResult, reportPath: string | null): CheckupSummary {
  const lang = result.lang;
  const strength = result.findings.find((finding) => finding.category === "strength") ?? null;
  const repairs = result.findings.filter((finding) => finding.category === "repair").slice(0, FIX_FIRST_LIMIT);
  const fixFirst = repairs.map((finding): SummaryFix => ({
    ruleId: finding.ruleId,
    axis: finding.axis,
    gain: finding.gain,
    measured: finding.status === "scored",
    candidates: finding.candidates.length,
    unmeasuredTools: finding.tools.filter((value) => value.status === "unmeasured" && value.candidates.length > 0).map((value) => value.tool),
  }));
  return {
```

`src/core/result/summary.ts`(찾을 곳 5/5):

```ts
    reportPath,
  };
```

`src/core/result/summary.ts`(바꾼 뒤 5/5):

```ts
    reportPath,
    lang,
    text: {
      grade: result.text[lang].grade,
      diagnosis: result.text[lang].diagnosis,
      best: strength === null ? null : { title: strength.text[lang].title, detail: fill(SUMMARY_COPY[lang].best, { name: strength.text[lang].name, value: joinValue(strength.text[lang].value!, strength.text[lang].unit!, lang) }) },
      noBest: result.text[lang].noStrengths,
      fixFirst: repairs.map((finding, index) => ({ title: finding.text[lang].title, detail: fixDetail(fixFirst[index]!, lang) })),
      noFixFirst: result.text[lang].noRepairs,
      notices: result.notices.map((notice) => notice.text[lang]),
    },
  };
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/result-summary.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 9개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-summary.test.ts src/core/copy/common.ts src/core/result/summary.ts
git commit -m "feat: 터미널 요약의 문장 추가"
```

---

### Task 10: --lang 옵션과 실행 알림의 문장

**Files:**
- Create: `src/commands/run-notices.ts`
- Modify: `test/commands/checkup-cli.test.ts`
- Modify: `test/commands/checkup.test.ts`
- Modify: `skills/aq/scripts/aq.mjs`
- Modify: `src/cli.ts`
- Modify: `src/commands/checkup.ts`
- Test: `test/commands/run-notices.test.ts`

**Interfaces:**
- Consumes: 과제 1의 `pickLang`, `fill`, 과제 8의 `CheckupOptions.lang`, 3부의 `RunNotice`, `RunRecord`(`src/commands/checkup.ts`), `main`, `CliContext`(`src/cli.ts`).
- Produces: `runNoticeText(notice: RunNotice, lang: Lang): string`(`src/commands/run-notices.ts`), `RunRecord.text: { notices: string[] }`, `CliContext.locale`, `aq checkup [--lang <언어>] [--no-open] [--no-save] [--rescan]`. 묶은 실행 파일을 다시 만든다.

설계 7.4, 13.2와 「2단계 4부 계획에서 보완」의 5번(언어의 차례)과 12번(실행 알림의 문장)이다.

- `--lang`은 값 하나를 받는다. 값이 없거나 값 자리에 `-`로 시작하는 것(`--no-save`, `-h`)이 오면 모르는 옵션처럼 64를 돌려주고 아무것도 쓰지 않는다. `-h`를 언어 값으로 삼켜 저장하는 점검을 돌리지 않게 하려는 것이다(계획 리뷰 1차에서 짝 Codex 1이 찾았다). `--lang=ko` 꼴은 받지 않는다. 여럿이면 마지막 것이고, 마지막 값을 지원하지 않으면 앞의 값이 아니라 OS의 언어로 넘어간다. 값은 과제 1의 차례로 읽는다.
- OS의 언어는 실행 환경의 로캘(`Intl.DateTimeFormat().resolvedOptions().locale`)이다. 환경 변수 `LANG`을 먼저 보지 않는다. 작성자 PC는 한국어 Windows인데 셸의 `LANG`이 `en_US.UTF-8`이었다. 시험은 `CliContext.locale`로 고정한다.
- 실행 알림 다섯(저장 실패, 정리 실패, 링크라서 하지 않은 정리, 저장하지 않는 실행, 결과 파일을 쓰지 못함)에도 문장을 붙여 실행 기록의 `text.notices`에 요약의 언어로 싣는다. 오류 코드와 정해진 낱말만 넣고 경로는 넣지 않는다. 문장은 그 알림이 나오는 때와 맞아야 한다. 저장 실패는 남은 저장을 멈춘 것이고, 정리 실패와 링크라서 하지 않은 정리는 저장이 끝난 뒤의 일이다. 결과 파일을 쓰지 못함은 저장하지 않는 실행에서 상태 폴더를 거치지 않고도 나오므로 "임시 폴더에도"라고 하지 않는다(계획 리뷰 1차). 저장하지 않는 실행의 알림은 캐시를 쓰지 않았고 점수 이력에도 남지 않는다는 것을 함께 알린다(설계 20.2. 구현 검증 1차에서 짝 Codex 1이 찾았다).
- 3부의 시험 가운데 `--lang ko`를 모르는 옵션으로 거절하던 것을 값이 없는 `--lang`, 값 자리의 옵션, `--lang=ko`를 거절하는 것으로 바꾼다. 실행 기록을 통째로 견주는 시험 둘에 문장 칸을 더한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup-cli.test.ts`(찾을 곳 1/5):

```ts
// 명령 입구의 aq checkup을 시험한다. 받는 옵션, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 20.1)
import { readdir } from "node:fs/promises";
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 1/5):

```ts
// 명령 입구의 aq checkup을 시험한다. 받는 옵션, 처음 보일 언어의 차례, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 13.2, 20.1)
import { readdir, readFile } from "node:fs/promises";
```

`test/commands/checkup-cli.test.ts`(찾을 곳 2/5):

```ts
  context = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed") };
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 2/5):

```ts
  context = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed"), locale: "en-US" };
```

`test/commands/checkup-cli.test.ts`(찾을 곳 3/5):

```ts
    expect(output.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }] });
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 3/5):

```ts
    expect(output.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }], text: { notices: ["This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history."] } });
```

`test/commands/checkup-cli.test.ts`(찾을 곳 4/5):

```ts
  it("모르는 옵션은 64를 돌려주고 아무것도 쓰지 않는다", async () => {
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 4/5):

```ts
  it("--lang은 요약, 실행 알림, 결과가 처음 보일 언어를 정한다", async () => {
    expect(await main(["checkup", "--no-save", "--lang", "ko"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(output.summary.lang).toBe("ko");
    expect(output.summary.text.diagnosis).toMatch(/[가-힣]/);
    expect(output.run.text.notices).toEqual(["저장하지 않는 실행이라 상태 폴더에 아무것도 쓰지 않았습니다. 이 점검은 캐시를 쓰지 않았고 점수 이력에도 남지 않습니다."]);
    expect(JSON.parse(await readFile(output.run.resultPath, "utf8")).lang).toBe("ko");
  });

  it("--lang이 없거나 지원하지 않는 언어이면 OS의 언어, 그것도 아니면 영어다", async () => {
    const langOf = async (args: string[], locale: string): Promise<string> => {
      printed = "";
      expect(await main(["checkup", "--no-save", ...args], { ...context, locale })).toBe(0);
      return JSON.parse(printed).summary.lang;
    };
    expect(await langOf([], "ko-KR")).toBe("ko");
    expect(await langOf(["--lang", "ja"], "ko-KR")).toBe("ko");
    expect(await langOf(["--lang", "ja"], "fr-FR")).toBe("en");
    expect(await langOf(["--lang", "en"], "ko-KR")).toBe("en");
  });

  it("--lang을 여러 번 주면 마지막 값이다. 마지막 값을 지원하지 않으면 앞의 값이 아니라 OS의 언어다", async () => {
    const langOf = async (args: string[], locale: string): Promise<string> => {
      printed = "";
      expect(await main(["checkup", "--no-save", ...args], { ...context, locale })).toBe(0);
      return JSON.parse(printed).summary.lang;
    };
    expect(await langOf(["--lang", "en", "--lang", "ko"], "en-US")).toBe("ko");
    expect(await langOf(["--lang", "ko", "--lang", "en"], "ko-KR")).toBe("en");
    expect(await langOf(["--lang", "ko", "--lang", "ja"], "en-US")).toBe("en");
  });

  it("모르는 옵션과 값이 없는 --lang(값 자리에 -로 시작하는 것이 와도)은 64를 돌려주고 아무것도 쓰지 않는다", async () => {
```

`test/commands/checkup-cli.test.ts`(찾을 곳 5/5):

```ts
    expect(await main(["checkup", "--lang", "ko"], context)).toBe(64);
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 5/5):

```ts
    expect(await main(["checkup", "--lang"], context)).toBe(64);
    expect(await main(["checkup", "--lang", "--no-save"], context)).toBe(64);
    expect(await main(["checkup", "--lang=ko"], context)).toBe(64);
    expect(await main(["checkup", "--lang", "-h"], context)).toBe(64);
```

`test/commands/checkup.test.ts`(찾을 곳 1/2):

```ts
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: true, reportPath: null, resultPath, notices: [] });
```

`test/commands/checkup.test.ts`(바꾼 뒤 1/2):

```ts
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: true, reportPath: null, resultPath, notices: [], text: { notices: [] } });
```

`test/commands/checkup.test.ts`(찾을 곳 2/2):

```ts
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: false, reportPath: null, resultPath: join(tmp, `chunsik-garage-result-${STAMP}.json`), notices: [{ kind: "not_saved" }] });
```

`test/commands/checkup.test.ts`(바꾼 뒤 2/2):

```ts
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: false, reportPath: null, resultPath: join(tmp, `chunsik-garage-result-${STAMP}.json`), notices: [{ kind: "not_saved" }], text: { notices: ["This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history."] } });
```

`test/commands/run-notices.test.ts`(새 파일):

```ts
// 실행 기록의 알림 다섯 종류의 문장을 본다. 두 언어로 만들고 오류 코드와 정해진 낱말만 넣는다(설계 12.3, 20.2)
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
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/run-notices.test.ts test/commands/checkup-cli.test.ts test/commands/checkup.test.ts`
Expected: FAIL. `src/commands/run-notices.ts`를 찾지 못해 `test/commands/run-notices.test.ts`가 실패하고, `test/commands/checkup-cli.test.ts`의 넷(실행 기록의 문장, `--lang`, OS의 언어, `--lang`을 여러 번 줌)과 `test/commands/checkup.test.ts`의 둘(실행 기록에 문장 칸이 없음)이 실패한다.

- [ ] **Step 3: 구현한다**

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

`src/cli.ts`(찾을 곳 1/3):

```ts
  managedDir?: string;
}

/** aq checkup이 받는 옵션. --no-open은 결과 화면(3단계)을 열지 않는 것이라 지금은 할 일이 없다. --lang은 문구(4부)와 함께 받는다 */
const CHECKUP_FLAGS: ReadonlySet<string> = new Set(["--no-open", "--no-save", "--rescan"]);

const printJson = (value: unknown): void => {
```

`src/cli.ts`(바꾼 뒤 1/3):

```ts
  managedDir?: string;
  /** OS의 언어. 주지 않으면 실행 환경의 로캘이다. 시험이 고정한다 */
  locale?: string;
}

/** aq checkup이 받는 옵션. --no-open은 결과 화면(3단계)을 열지 않는 것이라 지금은 할 일이 없다. --lang은 값을 하나 받는다 */
const CHECKUP_FLAGS: ReadonlySet<string> = new Set(["--no-open", "--no-save", "--rescan"]);

/** aq checkup의 옵션을 읽는다. 모르는 옵션이 있거나 --lang 뒤에 값이 없으면(값 자리에 -로 시작하는 것이 와도) null이다. --lang이 여럿이면 마지막 것이다 */
function checkupArgs(rest: readonly string[]): { flags: Set<string>; lang: string | null } | null {
  const flags = new Set<string>();
  let lang: string | null = null;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]!;
    if (arg === "--lang") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("-")) return null;
      lang = value;
      index++;
    } else if (CHECKUP_FLAGS.has(arg)) {
      flags.add(arg);
    } else {
      return null;
    }
  }
  return { flags, lang };
}

const printJson = (value: unknown): void => {
```

`src/cli.ts`(찾을 곳 2/3):

```ts
  }
  if (command === "checkup" && rest.every((flag) => CHECKUP_FLAGS.has(flag))) {
    const outcome = await runCheckup({
```

`src/cli.ts`(바꾼 뒤 2/3):

```ts
  }
  const args = command === "checkup" ? checkupArgs(rest) : null;
  if (args !== null) {
    const outcome = await runCheckup({
```

`src/cli.ts`(찾을 곳 3/3):

```ts
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      lang: pickLang(null, Intl.DateTimeFormat().resolvedOptions().locale),
      stateDir: stateDir(context.homedir),
      save: !rest.includes("--no-save"),
      rescan: rest.includes("--rescan"),
      entryFile: context.entryFile ?? process.argv[1] ?? "",
```

`src/cli.ts`(바꾼 뒤 3/3):

```ts
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale),
      stateDir: stateDir(context.homedir),
      save: !args.flags.has("--no-save"),
      rescan: args.flags.has("--rescan"),
      entryFile: context.entryFile ?? process.argv[1] ?? "",
```

`src/commands/checkup.ts`(찾을 곳 1/3):

```ts
import { gatherCheckupInput } from "./checkup-input.ts";
import { selfIdentity } from "./self.ts";
```

`src/commands/checkup.ts`(바꾼 뒤 1/3):

```ts
import { gatherCheckupInput } from "./checkup-input.ts";
import { runNoticeText } from "./run-notices.ts";
import { selfIdentity } from "./self.ts";
```

`src/commands/checkup.ts`(찾을 곳 2/3):

```ts
  notices: RunNotice[];
}
```

`src/commands/checkup.ts`(바꾼 뒤 2/3):

```ts
  notices: RunNotice[];
  /** 실행 알림의 문장(notices와 같은 차례, 요약의 언어) */
  text: { notices: string[] };
}
```

`src/commands/checkup.ts`(찾을 곳 3/3):

```ts

  const run: RunRecord = { durationMs: now() - started, cachedFiles: gathered.collected.read.fromCache, saved, reportPath: null, resultPath, notices };
  return { summary: checkupSummary(result, null), run, result };
```

`src/commands/checkup.ts`(바꾼 뒤 3/3):

```ts

  const run: RunRecord = { durationMs: now() - started, cachedFiles: gathered.collected.read.fromCache, saved, reportPath: null, resultPath, notices, text: { notices: notices.map((notice) => runNoticeText(notice, options.lang)) } };
  return { summary: checkupSummary(result, null), run, result };
```

`src/commands/run-notices.ts`(새 파일):

```ts
// 실행 기록의 알림 다섯 종류의 문장. 오류 코드와 정해진 낱말만 넣고 경로는 넣지 않는다(순수 함수, 설계 12.3, 20.2)
import type { Lang, Texts } from "../core/copy/lang.ts";
import { fill } from "../core/copy/format.ts";
import type { RunNotice } from "./checkup.ts";

/** 상태 폴더에 쓰다가 막힌 단계 */
const STEP: Record<"result" | "state" | "history", Texts<string>> = {
  result: { en: "the result file", ko: "평가 결과 파일을" },
  state: { en: "the state file", ko: "상태 파일을" },
  history: { en: "the score history", ko: "점수 이력을" },
};

/** 점검 때 정리하는 것 */
const PRUNED: Record<"reports" | "cache", Texts<string>> = {
  reports: { en: "old result files", ko: "오래된 결과 파일을" },
  cache: { en: "cache entries whose source is gone", ko: "원본이 없어진 캐시 항목을" },
};

/** 링크라서 정리하지 않은 폴더 */
const FOLDER: Record<"state" | "reports" | "cache", Texts<string>> = {
  state: { en: "state", ko: "상태" },
  reports: { en: "results", ko: "결과" },
  cache: { en: "cache", ko: "캐시" },
};

const LINES: Texts<Record<RunNotice["kind"], string>> = {
  en: {
    save_failed: "Could not write {step} to the state folder ({code}), so the rest was not saved.",
    prune_failed: "Could not clean up {what} ({code}). Saving itself finished.",
    prune_skipped: "The {link} folder is a link, so {what} were not cleaned up.",
    not_saved: "This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history.",
    result_unwritten: "Could not write the result file to the OS temp folder ({code}), so only the summary is given.",
  },
  ko: {
    save_failed: "상태 폴더에 {step} 쓰지 못해({code}) 남은 저장을 멈췄습니다.",
    prune_failed: "{what} 정리하지 못했습니다({code}). 저장은 끝났습니다.",
    prune_skipped: "{link} 폴더가 링크라서 {what} 정리하지 않았습니다.",
    not_saved: "저장하지 않는 실행이라 상태 폴더에 아무것도 쓰지 않았습니다. 이 점검은 캐시를 쓰지 않았고 점수 이력에도 남지 않습니다.",
    result_unwritten: "평가 결과 파일을 운영체제 임시 폴더에 쓰지 못해({code}) 요약만 냅니다.",
  },
};

export function runNoticeText(notice: RunNotice, lang: Lang): string {
  const lines = LINES[lang];
  switch (notice.kind) {
    case "save_failed":
      return fill(lines.save_failed, { step: STEP[notice.step][lang], code: notice.code });
    case "prune_failed":
      return fill(lines.prune_failed, { what: PRUNED[notice.what][lang], code: notice.code });
    case "prune_skipped":
      return fill(lines.prune_skipped, { link: FOLDER[notice.link][lang], what: PRUNED[notice.what][lang] });
    case "not_saved":
      return lines.not_saved;
    case "result_unwritten":
      return fill(lines.result_unwritten, { code: notice.code });
  }
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/commands test/cli.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 9개, 시험 63개.

- [ ] **Step 5: 묶은 실행 파일을 다시 만들고 묶음 검사를 돌린다**

Run: `npm run build && node scripts/check-bundle.mjs`
Expected: `묶음 완료: skills/aq/scripts/aq.mjs`와 `묶음 검사 통과`. 과제 8부터 바뀐 명령 입구와 문구가 묶은 파일에 들어간다. 이 단계의 묶은 파일은 아래 커밋에 함께 넣는다.

- [ ] **Step 6: 커밋한다**

```bash
git add test/commands/checkup-cli.test.ts test/commands/checkup.test.ts test/commands/run-notices.test.ts skills/aq/scripts/aq.mjs src/cli.ts src/commands/checkup.ts src/commands/run-notices.ts
git commit -m "feat: --lang 옵션과 실행 알림 문장 추가"
```

---

### Task 11: 저장 실패 알림의 오류 코드를 단계마다 실제 연산과 견주기

**Files:**
- Modify: `test/commands/checkup.test.ts`

**Interfaces:**
- Consumes: 3부의 `saveState`, `newState`(`src/state/state.ts`), `appendHistory`(`src/state/history.ts`), `writeResult`(`src/state/reports.ts`), `runCheckup`.
- Produces: 없다. 시험만 고친다.

3부 구현 짝 검증 2차의 남은 권장이다(설계 「2단계 3부 구현에서 보완」의 둘째 항목). 3부는 상태 폴더 자리에 파일이 있는 경우와 OS 임시 폴더가 없는 경우만 실제 코드와 견주고, 상태·이력·결과 파일 자리가 막힌 단계는 오류 코드의 꼴(`E`로 시작하는 대문자)만 봤다. 그래서 그 단계의 코드를 다른 유효한 코드로 바꿔도 시험이 가르지 못했다.

- 같은 막힘을 시험의 다른 폴더에 만들고 같은 저장 함수(`saveState`, `appendHistory`, `writeResult`)를 불러 실제로 나는 코드를 얻은 뒤, 실행 알림의 코드가 그것과 같은지 본다. 코드는 운영체제마다 다르므로(폴더 자리로 이름을 바꿀 때 Windows는 `EPERM`) 같은 연산의 코드와 견주면 운영체제와 상관없이 맞다.
- 구현은 이미 맞다. 이 과제는 시험만 고치므로 시험을 놓으면 바로 통과한다. 대신 시험이 잡는지를 변이로 본다(Step 2).

- [ ] **Step 1: 시험을 보강한다**

`test/commands/checkup.test.ts`(찾을 곳 1/5):

```ts
import { runCheckup, type CheckupOptions } from "../../src/commands/checkup.ts";
import { resultStamp } from "../../src/state/reports.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
```

`test/commands/checkup.test.ts`(바꾼 뒤 1/5):

```ts
import { runCheckup, type CheckupOptions } from "../../src/commands/checkup.ts";
import { appendHistory } from "../../src/state/history.ts";
import { resultStamp, writeResult } from "../../src/state/reports.ts";
import { newState, saveState } from "../../src/state/state.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
```

`test/commands/checkup.test.ts`(찾을 곳 2/5):

```ts
}
const turn = (id: string, at: string): string[] => [
```

`test/commands/checkup.test.ts`(바꾼 뒤 2/5):

```ts
}
/**
 * 다른 폴더에 같은 막힘을 만들고 같은 저장 함수를 불러 실제로 나는 오류 코드를 얻는다. 폴더 자리로 이름을 바꿀 때 Windows는 EPERM을 내는 것처럼
 * 코드는 운영체제마다 다르므로, 실행 알림이 그 단계에서 난 코드를 그대로 싣는지를 운영체제와 상관없이 견주려는 것이다
 */
async function blockedCode(block: (dir: string) => Promise<unknown>, write: (dir: string) => Promise<unknown>): Promise<string> {
  const dir = join(root, "probe-state");
  await rm(dir, { recursive: true, force: true });
  await block(dir);
  const code = await write(dir).then(
    () => "none",
    (error: NodeJS.ErrnoException) => error.code ?? "unknown",
  );
  await rm(dir, { recursive: true, force: true });
  expect(code).toMatch(/^E[A-Z]+$/);
  return code;
}
const turn = (id: string, at: string): string[] => [
```

`test/commands/checkup.test.ts`(찾을 곳 3/5):

```ts
    for (let index = 0; index < 21; index++) await put(join(stateDir, "reports", `${resultStamp(NOW - (index + 1) * 60_000)}.json`), "{}");
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "state", code: expect.stringMatching(/^E[A-Z]+$/) }]);
    expect(outcome.run.resultPath).toBe(join(stateDir, "reports", `${STAMP}.json`));
```

`test/commands/checkup.test.ts`(바꾼 뒤 3/5):

```ts
    for (let index = 0; index < 21; index++) await put(join(stateDir, "reports", `${resultStamp(NOW - (index + 1) * 60_000)}.json`), "{}");
    const expected = await blockedCode(
      (dir) => mkdir(join(dir, "state.json"), { recursive: true }),
      (dir) => saveState(dir, newState()),
    );
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "state", code: expected }]);
    expect(outcome.run.resultPath).toBe(join(stateDir, "reports", `${STAMP}.json`));
```

`test/commands/checkup.test.ts`(찾을 곳 4/5):

```ts
    await mkdir(join(stateDir, "history.jsonl"), { recursive: true });
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "history", code: expect.stringMatching(/^E[A-Z]+$/) }]);
    expect(JSON.parse(await readFile(join(stateDir, "state.json"), "utf8")).lastCheckupAt).toBe("2026-11-12T03:00:00.000Z");
```

`test/commands/checkup.test.ts`(바꾼 뒤 4/5):

```ts
    await mkdir(join(stateDir, "history.jsonl"), { recursive: true });
    const expected = await blockedCode(
      (dir) => mkdir(join(dir, "history.jsonl"), { recursive: true }),
      (dir) => appendHistory(dir, { at: "2026-11-12T03:00:00.000Z", aq: null, axes: { setup: null, efficiency: null, fit: null, intensity: null }, missingAxes: [], rulesVersion: "1.0.0" }),
    );
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "history", code: expected }]);
    expect(JSON.parse(await readFile(join(stateDir, "state.json"), "utf8")).lastCheckupAt).toBe("2026-11-12T03:00:00.000Z");
```

`test/commands/checkup.test.ts`(찾을 곳 5/5):

```ts
    await mkdir(join(stateDir, "reports", `${STAMP}.json`), { recursive: true });
    const outcome = await runCheckup(options());
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "result", code: expect.stringMatching(/^E[A-Z]+$/) }]);
    expect(outcome.run.resultPath).toBe(join(tmp, `chunsik-garage-result-${STAMP}.json`));
```

`test/commands/checkup.test.ts`(바꾼 뒤 5/5):

```ts
    await mkdir(join(stateDir, "reports", `${STAMP}.json`), { recursive: true });
    const expected = await blockedCode(
      (dir) => mkdir(join(dir, "reports", `${STAMP}.json`), { recursive: true }),
      (dir) => writeResult(dir, STAMP, {}),
    );
    const outcome = await runCheckup(options());
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "result", code: expected }]);
    expect(outcome.run.resultPath).toBe(join(tmp, `chunsik-garage-result-${STAMP}.json`));
```

- [ ] **Step 2: 시험과 타입 검사가 통과하는지 확인한다**

구현은 고치지 않는다. 시험이 잘못을 잡는지 보려면 `src/commands/checkup.ts`의 `notices.push({ kind: "save_failed", step, code: codeOf(error) });`를 잠시 아래 넷으로 하나씩 바꿔 이 과제의 확인 명령이 실패하는지 보고 되돌린다. 코드를 늘 `EPERM`으로 냄, 상태 단계만 `EISDIR`, 이력 단계만 `EPERM`, 결과 단계만 `ENOTDIR`. 작성자 PC(Windows)에서 넷 모두 실패했다. 이 넷은 Windows에서 그 단계가 실제로 내는 코드와 다른 값이라 뜻이 있다. 다른 실행 환경에서는 시험이 얻은 그 단계의 실제 코드를 먼저 보고, 그것과 다른 값으로 바꿔야 변이가 된다(실제 코드와 같은 값으로 바꾸면 동작이 그대로라 통과하는 것이 맞다).

Run: `npx tsc --noEmit && npx vitest run test/commands/checkup.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 14개.

- [ ] **Step 3: 커밋한다**

```bash
git add test/commands/checkup.test.ts
git commit -m "test: 저장 단계마다 오류 코드를 실제 연산과 견줌"
```

---

### Task 12: 전체 검사, 이 PC의 기록으로 돌려 보기, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~11의 결과물 전부.
- Produces: `develop`에 병합된 2단계 4부. 3단계(결과 화면)가 기대는 것은 `CheckupResult`의 `lang`, `text`, `findings[].text`, `notices[].text`와 `FindingText`, `ResultText`의 모양이다.

- [ ] **Step 1: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 파일 74개·시험 1,133개 통과(2단계 3부까지의 68개·1,001개에 이 계획이 더한 것), 마지막 줄이 `묶음 검사 통과`. Windows 밖에서는 1부의 시험 1개를 건너뛴다.

- [ ] **Step 2: 묶음을 다시 만들어도 그대로인지 확인한다**

과제 10에서 묶어 커밋한 실행 파일이 원본과 맞는지 본다.

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 3: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS. 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 4: 이 PC의 기록으로 두 언어로 저장 없이 돌려 본다**

묶은 실행 파일로 이 PC의 실제 기록과 셋팅을 점검한다. 상태 폴더에는 쓰지 않는다.

Run: `node skills/aq/scripts/aq.mjs checkup --no-save --no-open --lang ko`
Run: `node skills/aq/scripts/aq.mjs checkup --no-save --no-open --lang en`
Expected: 둘 다 종료 코드 0. 표준 출력의 JSON에 `summary`와 `run` 둘만 있고, `summary.lang`이 넘긴 언어이고, `summary.text`의 별명, 진단, 가장 잘하는 것, 먼저 고칠 것, 알림과 `run.text.notices`(`not_saved`의 문장)가 그 언어다. `run.resultPath`의 파일은 `lang`이 넘긴 언어이고, 규칙 스물둘마다 `text.en`과 `text.ko`가 있다. 표준 출력에 이 PC의 스킬·서버·프로젝트 이름이 없다(결과 파일의 경로에는 계정의 폴더 이름이 든다. 경로를 알려 주는 것은 설계 12.3이 정한 것이다). 문장이 실제 숫자와 함께 자연스럽게 읽히는지 본다. 숫자와 이름은 저장소 밖 작업 기록에만 적고, 결과 파일은 확인한 뒤 지운다.

- [ ] **Step 5: 원장을 고치고 커밋한다**

원장의 2단계 4부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 과제에 병합까지 들어 있으므로 끝남은 Step 8에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 2단계 4부 구현 결과를 적음"
```

- [ ] **Step 6: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage2-4.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~11의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 이 PC의 기록으로 두 언어로 돌린 점검의 모양), 「확인하지 못한 것」이다. 확인하지 못한 것에는 아래를 적는다. macOS와 Linux의 실제 기기에서 돌려 보지 않았고 그곳의 OS 언어 읽기도 보지 않았다. 도구가 하나라서 후보가 나온 도구가 둘 이상일 때의 문장과 도구 둘의 처방은 시험으로 가르지 못했다. 결과 파일의 문장을 결과 화면이 그려 보는 것은 3단계에서 한다. 이 PC의 숫자, 경로, 이름은 넣지 않는다.

```bash
git push -u origin 2단계-4-문구
gh pr create --base develop --head 2단계-4-문구 --title "feat: 2단계 4부 문구와 --lang" --body-file "$TEMP/aq-pr-stage2-4.md"
```

- [ ] **Step 7: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(2단계 4부 구현 전용, 검증량이 많으므로 둘) 다음을 나눠 맡긴다. 한 짝은 코드 정독이다. 설계 7.4, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 13.1, 13.2, 15, 16.1, 20.2와 「2단계 4부 계획에서 보완」을 이 계획의 코드와 대조하고, 문장을 고르는 경우마다 반례를 따로 지어 본다. 다른 짝은 실행과 문구다. `npm run check`를 다시 돌리고, 문구의 모든 칸을 다시 판정하고(계획 리뷰에서 판정한 것과 달라진 칸이 있는지), 이 PC의 기록으로 두 언어로 돌린 점검의 문장이 실제 숫자와 함께 자연스럽게 읽히는지 본다. 두 짝에게 서로의 결론을 미리 알려 주지 않는다. 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 2단계-4-문구 --body-file "$TEMP/aq-pr-stage2-4.md"`).

- [ ] **Step 8: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 사용자가 병합을 주 세션에 맡겼지만, 그것은 묻지 않고 병합할 권한이지 검증을 미룰 근거가 아니어서 Step 7 뒤에 둔다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 2단계-4-문구 --merge --subject "feat: 2단계 4부 문구와 --lang을 develop에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 2단계 4부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 3단계와 그 뒤에 넘기는 것

4부가 만들지 않고 뒤 단계가 다룰 것이다.

| 무엇 | 단계 | 4부가 남긴 재료 |
|---|---|---|
| 결과 화면의 고정 글(단의 제목, 단추 글, "잴 수 없음" 같은 화면 낱말, 꼬리의 문장, 공유 카드)과 그 두 언어 | 3단계 | 평가 결과의 `lang`과 두 언어의 문장 |
| 규칙 문장의 "어떻게 쟀나" 줄과 E6의 정보 줄을 화면에 어떻게 놓을지, 점수나 예상 효과가 없는 정비 항목의 모양(설계 13.1) | 3단계 | `FindingText`의 `method`, `notes`, `reason` |
| E6의 "며칠 뒤의 점검부터 판정하는지"(설계 13.1. 3부의 결정 15번) | 3단계 | `details.unjudgedServers`의 까닭 |
| S3의 문제가 어느 파일인지. 평가 결과에 문제의 위치 목록이 없어 처방이 파일을 가리키지 못한다 | 3단계 전 | S3의 근거 숫자(종류별 수) |
| claude.ai에 연결한 서버를 직접 막을 때 `serverName`에 쓸 이름이 결과 파일에 실린 이름과 같은지 | 3단계 | `details.unjudgedServers`의 이름과 범위 |
| 요약의 문장을 터미널에 옮기는 말투(머리표, 글자 얼굴, 여섯 줄)와 스킬이 `--lang`에 대화의 언어를 넘기는 것(설계 15) | 4단계 | `CheckupSummary`의 `lang`과 `text` |
| Codex의 문구. S1과 S2의 처방, E3의 압축을 세는 법, 도구 이름, Codex의 알림, 후보가 나온 도구가 둘 이상일 때의 문장 | 5단계 | `TOOL_NAMES`, 규칙 문구 표, `findingText`의 도구 이름 앞붙임 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 7.4 | `aq checkup [--lang en\|ko]` | 10 |
| 11.4 | 못 잰 이유 일곱의 낱말과 설명, 반올림 | 1, 6 |
| 11.5 | 분류마다의 문장(잘하고 있는 것, 보통, 정비할 것, 잴 수 없음), 못 잰 도구의 후보(점수 자리의 낱말, 설명 넷, 덧붙임 둘), 터미널 요약의 덧붙이는 말 셋, 빈 목록 둘, 진단, 말투 | 2~6, 8, 9 |
| 11.6 | 등급의 별명(영어와 한국어) | 8 |
| 12.1 | 입력 묶음의 언어 | 8, 10 |
| 12.2 | 규칙의 문장(제목, 설명, 처방, 어떻게 쟀나), 잰 값의 종류와 단위, 문장은 문구 표에서 골라 숫자를 끼운다 | 1~6, 8 |
| 12.3 | 요약(별명, 가장 잘하는 것, 먼저 고칠 것의 덧붙이는 말, 알림)과 실행 기록 | 9, 10 |
| 13.1 | E6 항목의 정보와 claude.ai에 연결한 서버를 직접 막는 방법, S2의 인정된 조건 | 6 |
| 13.2 | 언어의 차례(`--lang`, OS의 언어, 영어), 한 파일에 두 언어 | 1, 8, 10 |
| 15 | 요약의 숫자와 문장(모델이 그대로 옮긴다), 예상 효과가 없으면 후보의 수 | 9 |
| 16.1 | `deniedMcpServers`로 막는 방법, `skillOverrides`로 끄는 방법 | 3, 6 |
| 19.1 | 이름과 경로는 문장에 넣지 않는다 | 6~10 |
| 20.2 | 저장하지 못했을 때의 알림(실행 알림의 문장, 오류 코드) | 10, 11 |

4부에 넣지 않은 것은 「3단계와 그 뒤에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드는 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`2da4bfe`)에서 과제 1부터 11까지 차례대로 만들었다(Windows 11, Node.js 24). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1~10은 시험만 놓고 돌리면 실패하고(실패의 까닭과 개수는 시험 커밋마다 따로 세어 과제의 Expected와 맞는지 봤다), 구현을 놓으면 그 과제의 확인 명령(타입 검사와 관계있는 시험)이 통과했다. 과제 11은 시험만 있는 과제라 시험을 놓으면 바로 통과했다. 과제 10의 묶은 실행 파일 다시 만들기와 묶음 검사도 통과했다. 과제 11 뒤의 `npm run check`는 시험 파일 74개·시험 1,133개가 통과했고 `묶음 검사 통과`였다. 다시 묶어도 묶은 실행 파일은 달라지지 않았다. 다 만든 복제본의 파일 194개는 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다.

연습 작업 폴더에서 따로 확인한 것은 이렇다. 과제 11의 변이 넷(코드를 늘 `EPERM`으로 냄, 상태 단계만 `EISDIR`, 이력 단계만 `EPERM`, 결과 단계만 `ENOTDIR`)을 시험이 모두 잡았다. 문구 728칸(영어 364, 한국어 364)을 짝 Codex 2가 칸마다 판정했고(1차 고침 104칸), 짝 Codex 1이 문장을 고르는 논리와 설계를 정독했다(1차 필수 넷). 고친 뒤 순수성 검사가 문구 안의 금지 낱말(`process`)을 잡아 그 칸을 쉬운 말로 바꿨다. 묶은 실행 파일로 이 PC의 기록과 셋팅을 `--lang ko`와 `--lang en`으로 저장 없이 점검했고, 둘 다 종료 코드 0으로 끝나 요약과 실행 알림이 그 언어로 나오고 결과 파일의 규칙마다 두 언어의 문장이 있었다(숫자는 저장소 밖 기록에만 둔다).

확인하지 못한 것은 이렇다. macOS와 Linux에서는 돌려 보지 않았고, 그곳에서 실행 환경의 로캘이 무엇을 따르는지도 확인하지 못했다. 도구가 하나라서 후보가 나온 도구가 둘 이상일 때의 문장(도구 이름을 앞에 붙인다)과 도구 둘의 처방은 시험으로 가르지 못했다. 문장이 사실과 맞는지는 시험이 아니라 짝의 칸마다 판정과 공식 문서 대조로 봤다. 처방을 실제로 적용해 효과를 본 것은 아니다. 결과 파일의 문장을 결과 화면이 그려 보는 것은 3단계에서 한다.
