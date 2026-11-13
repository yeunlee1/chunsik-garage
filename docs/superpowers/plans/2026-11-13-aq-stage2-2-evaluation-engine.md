# AQ 점검 2단계 2부 — 평가 엔진(지표, 규칙 22개, 점수와 등급, 설치 판정, 정비 후보) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 이 PC의 기록과 셋팅에 대한 독립 대조로 검증한다.

**Goal:** 1단계의 세션 요약과 2단계 1부의 셋팅 사실, 상태 파일의 관측 기록에서 규칙 스물둘의 값과 점수, 기준 점수, AQ와 등급, 화면에 내는 분류와 심각도와 예상 효과, 스킬과 MCP 서버마다의 사용 판정, 정비 후보(A1~A3)의 목록을 내는 순수한 평가 엔진을 만든다.

**Architecture:** 평가는 `src/core/`의 순수 함수로만 계산한다(설계 7.2). `evaluate(input)`이 입력 묶음(평가 시계, 도구마다의 세션 요약과 관측 범위와 셋팅 사실, 프로젝트 목록, 정규화한 작업 폴더의 표, 관측 기록) 하나를 받아 평가 하나를 낸다. 안에서는 구간 합계(`totals.ts`) → 규칙마다의 측정(`metrics/`의 넷과 `installs/`의 설치 판정) → 점수판(`scoreboard.ts`)의 차례로 흐른다. 파일을 읽고 시계를 읽고 경로를 푸는 일은 core 밖의 입력 조립(`src/commands/checkup-input.ts`)이 끝내고 넘긴다. 스캐너만 알 수 있는 사실 여섯 가지는 1부의 셋팅 사실에 더한다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 1단계, 2단계 1부와 같다. 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계의 7.2(core의 순수성), 9.2와 9.3(어느 세션을 넣는지, 구간), 9.7(관측 범위), 11(점수 체계 전부), 12.1(입력 묶음), 12.2에서 규칙마다 내는 것(상태와 이유, 값, 점수, 분류, 심각도, 근거 숫자, 도구별 값, 예상 효과, 정비 후보의 ID), 16.2(정비 후보를 내는 조건), 18.1(읽지 못한 곳의 관측 기록), 21.1(규칙, 점수, 결정성의 시험)을 구현한다. 로드맵은 `docs/superpowers/plans/2026-11-12-aq-roadmap.md`, 앞 계획은 `2026-11-12-aq-stage1-claude-code-reader.md`와 `2026-11-13-aq-stage2-1-setup-scanner.md`다.

## 2단계를 셋으로 나눈 까닭

로드맵은 2단계를 둘로 나누고 2부에 지표, 규칙, 점수, 평가 결과, 문구, `aq checkup`을 두었다. 1부(셋팅 스캐너)를 끝내고 2부의 재료를 세어 보니 한 계획으로 쓰면 1부의 두 배쯤이 된다. 1부를 나눌 때와 같은 까닭으로 다시 나눈다. 리뷰가 길어지고, 평가 엔진을 실제 기록에 돌려 보기 전에 문구와 명령을 계획하게 되기 때문이다. 로드맵 문서도 함께 고친다.

| 부분 | 내용 | 끝나면 돌려 볼 수 있는 것 |
|---|---|---|
| 1부(끝남) | 셋팅 스캐너(Claude Code), 상태 파일과 설치마다의 관측 기록, `aq where`·`aq clean` | `aq where`, `aq clean [--all]`, 이 PC의 셋팅을 읽어 종류별 개수를 내는 개발용 스크립트 |
| 2부(이 계획) | 평가 엔진. 구간 합계와 지표, 규칙 22개, 점수와 등급, E5와 E6의 설치 판정, 정비 후보(A1~A3)의 목록, 분류와 심각도와 예상 효과, 입력 조립 | 이 PC의 기록과 셋팅으로 규칙 22개의 값, 점수, 등급을 숫자로 내는 개발용 스크립트(`scripts/dev-evaluate.ts`) |
| 3부(2부 뒤에 쓴다) | 평가 결과의 조립(도구 목록, 읽은 양, 사용 기록, 알림, 정밀 점검 단서), 문구(영어와 한국어), 관측 기록과 이력의 저장, `aq checkup --no-open` | 로드맵 2단계의 "끝나면 돌려 볼 수 있는 것" 전부 |

2부는 명령 입구(`src/cli.ts`)를 고치지 않는다. 평가 엔진은 3부의 `aq checkup`이 부를 때까지 묶은 실행 파일에 들어가지 않는다. 그래서 2부에서는 묶음(`skills/aq/scripts/aq.mjs`)이 달라지지 않는다.

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- **`src/core/`는 순수하다**(설계 7.2). 파일을 열지 않고, 시계를 직접 읽지 않고(평가 시계는 입력으로 받는다), Node.js 모듈과 바깥 패키지를 값으로 가져오지 않는다. 타입만 가져오는 것(`import type`)은 된다. core 밖에서 값으로 가져오는 것은 날짜와 버전을 다루는 순수한 모듈 둘(`src/adapters/common/dates.ts`, `src/adapters/common/version.ts`)뿐이다. 과제 20의 검사가 이것을 지킨다.
- **같은 입력 묶음이면 평가는 글자 하나 다르지 않다**(설계 12.1, 12.2). 목록은 정해진 차례로 낸다. 입력의 차례(세션 요약, 스킬, 서버, 프로젝트, 관측 기록)에 기대지 않는다. 입력을 고치지 않는다.
- **못 잰 것은 0이 아니다**(설계 11.4, 12.2). 못 잰 규칙의 값과 점수는 `null`이고 이유가 하나 붙는다. 세지 못한 근거 숫자도 `null`이다. 없는 예상 효과를 0으로 적지 않는다.
- **읽지 못한 곳 때문에 값이 좋게 나올 수 있는 규칙은 보이는 것만으로 재지 않는다**(설계 20.1). E5, E6, S2, S5, F4, F5, F6이 그렇다. 없는 파일과 폴더는 읽지 못한 것이 아니다.
- **무언가를 끄자는 제안은 판정만으로 내지 않는다**(설계 16.2). 정비 후보는 "안 쓴 것이 확인됨"에서만 나오고, 꺼도 되는지를 따로 본다. 이 계획은 후보의 목록까지만 낸다. 설정을 바꾸지 않는다.
- 평가에는 이름과 경로가 들어 있다(스킬, 서버, 프로젝트). 무엇을 결과 파일과 화면에 싣는지는 3부가 설계 19절에 맞춰 정한다. 2부의 개발용 스크립트는 숫자만 낸다.
- **스캐너와 입력 조립은 읽기만 한다.** 설정 파일, 지침, 스킬, 플러그인 폴더, `.claude.json`, 상태 파일에 쓰지 않는다(설계 8). 2부에서 쓰는 곳은 1단계의 캐시뿐이다.
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더와 OS의 관리 정책 폴더를 읽지도 쓰지도 않는다(설계 21.1).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이다(사용자 전역 지침).
- 깃. `develop`에서 `2단계-2-평가엔진` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증은 병합 앞의 관문이다.
- 이 PC의 기록과 셋팅에서 잰 숫자, 경로, 이름은 저장소와 병합 요청에 넣지 않는다(설계 머리말).

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `DD4476F3F41E3F4116B3AD32B91FC5D04C0E2700B6E34A52F358AF1F7C3B2FAB`, 3,639줄)이다. 2부 계획을 쓰기 전에 설계 세션이 「2단계 2부 계획 전 설계 결정(2026-11-13)」을 더했고(읽지 못한 곳의 관측 기록, 30일의 경계, F3이 보는 지침, 못 재는 이유의 차례, 판정할 수 있는 대상, 정비할 것의 조건), 이 계획을 쓰며 정한 것을 주 세션이 「2단계 2부 계획에서 보완(2026-11-13, 주 세션)」으로 더했다. 계획은 저장소 밖의 연습 작업 폴더에서 과제마다 시험과 구현을 실제로 쓰고 돌려서 만들었고, 그 과정에서 설계가 정하지 않았거나 한계로 남겨 둔 곳이 드러났다.

설계의 본문을 고친 것은 이렇다. 계획을 쓰며 고친 것이 아래 1번이다. 계획 리뷰에서 여섯을 더 고쳤다. 훅이 내용을 넣어 주는 스킬(11.3 E5. 아래 13번), S5의 서버를 찾는 곳의 목록(11.3 S5. 과제 10), 스킬 묶음을 합치는 규칙에 구조상 판정할 수 없는 묶음을 이은 것(11.3. 과제 15), 정체가 같은 서버 사실을 설치 하나로 세는 것(11.3 E6. 과제 16), 규칙 점수를 경계와 견줄 때의 맞춤(11.4의 5. 과제 6과 18), 읽지 못하면 재지 않는 규칙의 요약에 S5를 적은 것(20.1)이다. 21.1의 반례 표에도 줄을 더했다. 리뷰에서 고친 것과 까닭, 짝이 낸 고칠 안과 다르게 정한 것은 설계의 「2단계 2부 계획 리뷰 1차에서 보완」, 「2차에서 보완」, 「3차에서 보완」, 「4차에서 보완」, 「5차에서 보완」에 있다. 순수성 검사가 어디까지 막는지의 기준은 「4차에서 보완」에 있다(과제 20).

1. **설정 파일을 읽지 못한 점검의 S5**(설계 11.3, 11.4, 20.1, 21.1, 27). 켜짐을 정하는 설정 파일(사용자 설정, 관리 정책 파일, 프로젝트 설정, 로컬 설정) 가운데 있는데 읽지 못한 것이 있으면 S5는 `unreadable`이다. 켜진 서버가 보여도 같다. 읽지 못한 설정은 빈 설정으로 읽혀서 막아 둔 서버가 켜져 있는 것으로 보이기 때문이다. E5, E6, S2, F6과 같은 선이다(과제 9).

계획을 쓰며 정한 세부(설계가 정하지 않은 것)는 이렇다. 설계의 보완 절에 같은 번호로 적었다.

2. **S2의 옛 버전.** 옛 버전으로 볼 때에는 관리 정책이 기본 모드를 다른 값으로 정했어도 목록의 프로젝트에 권한 우회가 있으면 기본 모드를 권한 우회로 본다. 설계의 글자대로이고 엄한 쪽이다(과제 9).
3. **S2에서 한 도구의 설정만 읽지 못했을 때.** 그런 도구가 하나라도 있으면 S2를 재지 않는다. 도구가 하나인 동안에는 차이가 없고, Codex의 스캐너를 넣기 전에 다시 정한다(과제 9).
4. **점수에 넣는 도구가 없는 S3.** 문제 0개로 재진다. 그때는 AQ가 나오지 않는다(과제 9).
5. **E4의 표본.** 점수 구간에 응답이 있는 주 세션 가운데 지침이 실린 세션이다(과제 5, 7).
6. **F3의 대상.** "프로젝트 지침이나 프로젝트 설정이 이미 있는 폴더"의 설정에는 로컬 설정도 넣고, 지침에는 읽지 못한 지침 파일과 규칙 폴더도 넣는다(과제 11).
7. **F5의 스킬 종.** 사용자 범위와 프로젝트 범위 스킬의 이름이다. 플러그인이 넣은 스킬은 종으로도 세지 않는다(과제 11).
8. **도구가 여럿일 때의 F4와 F6.** F4는 도구마다 제 것끼리 견준 값 가운데 가장 큰 것이고 F6은 합이다. Codex의 스캐너를 넣기 전에 확정한다(과제 11).
9. **F6에서 권한 규칙 자리의 모양만 틀린 설정.** 규칙이 없는 것으로 본다. 1부의 스캐너가 그렇게 읽는다. 너그러운 쪽이다(과제 11).
10. **㉰.** 링크로 건 스킬은 링크 자체나 그 대상을 만든 시각 가운데 하나라도 14일 안이면 걸린다(과제 14).
11. **㉱의 세부.** 설계 9.3의 「세션과 세션 사이의 빠짐」이 정한 대로다. 작업 폴더가 없는 주 세션은 어느 묶음에도 넣지 않고, 시작한 날을 모르는 세션은 최근 14일 안에 시작한 것으로 본다. 본문이 정하지 않은 것은 둘이다. 정규화한 경로를 모르는 작업 폴더는 기록에 적힌 글자 그대로 견주고, "실린 적이 있는"은 요약의 날짜 칸 전체와 처음 목록으로 본다(과제 13).
12. **㉳.** 관측 기록이 있는데(첫 점검이 아니다) 그 정체의 기록이 없는 것이다(과제 14).
13. **훅이 내용을 넣어 주는 스킬.** 쓴 신호가 있어도 "쓰는지 모름"이고 판정할 수 있는 대상에서 뺀다. 스킬 묶음은 위치 가운데 하나라도 그런 스킬이면 뺀다. 쓴 것만 세면 판정된 것이 쓴 쪽으로만 모인다. 본문 11.3에도 적었다(과제 14, 15).
14. **세지 않는 플러그인의 위치가 든 묶음.** 통째로 세지 않는다(과제 15).
15. **A1.** 켜져 있는 사용자 범위 위치의 이름으로만 낸다. 그 이름을 이름 꼴(폴더 이름이나 머리말 이름)로 가진 스킬 묶음이 같이 꺼지는 것이다. 그 묶음은 켜져 있든 아니든 모두 "안 쓴 것이 확인됨"이어야 하고, 그 가운데 이 도구 자신이 없어야 한다(과제 17).
16. **A2.** 사용자 범위로만 깐 플러그인에서만 낸다. 켜져 있는 다른 플러그인의 기대는 목록을 모르면 후보가 아니다(과제 17).
17. **이 도구 자신.** 정비 후보에서 빼는 이 도구 자신이 무엇인지는 평가의 입력으로 받는다. 값은 3부의 명령이 넣는다(과제 17, 19).
18. **도구별 규칙의 평균.** 도구마다 규칙 점수까지 낸 뒤 응답 수로 평균한다. 잰 값도 같은 무게로 평균한다(과제 18).
19. **`findings`의 차례.** 잘하고 있는 것, 보통, 정비할 것, 잴 수 없음의 차례이고 보통과 잴 수 없음은 규칙 표의 순서다(과제 18).
20. **AQ를 내지 않은 까닭.** 목록으로 낸다(과제 18).
21. **근거 숫자의 이름.** 과제마다 표에 적었고 설계의 보완 절에 모았다. S2의 근거, F3에서 지침이 없다고 센 프로젝트, F4에서 가장 많이 겹친 프로젝트는 평가의 따로 둔 자리에 낸다(과제 7~19).

설계 세션이 2부 계획에 넘긴 것은 이렇게 다뤘다.

| 넘겨받은 것 | 다룬 방법 |
|---|---|
| 설정 파일을 읽지 못한 점검의 S5 | 위 1번. 못 잰 것으로 한다 |
| F6에서 권한 규칙 자리의 모양만 틀린 때 | 위 9번. 규칙이 없는 것으로 본다 |
| 보이는 것만으로 0점 기준을 넘은 F4, F5, F6 | 그대로 둔다. 다른 곳을 읽지 못했으면 못 잰 것이다(설계 27) |
| E4의 표본에 최소 개수가 없다 | 그대로 둔다. 기준값을 조정할 때 함께 본다(설계 26) |
| 지침 첨부가 남지 않는 주 세션의 까닭 | 확인하지 못했다. 3부 계획을 쓰기 전에 먼저 확인할 일로 넘긴다(끝의 「3부에 넘기는 것」) |
| 문구 표 | 3부의 일이다 |
| E5와 E6, E4의 근거 숫자의 이름과 모양 | 위 21번 |

## 1부의 셋팅 사실에 더하는 것

core는 경로를 풀지 않고 파일을 읽지 않는다. 그래서 규칙이 필요로 하는 사실 가운데 스캐너만 알 수 있는 것 여섯 가지를 1부의 코드에 더한다. 과제 1~4, 10, 12가 맡는다. 값과 글을 싣지 않는다는 1부의 약속은 그대로다.

| 과제 | 더하는 것 | 쓰는 곳 |
|---|---|---|
| 1 | 지침 파일마다 내용이 있는지(`InstructionFile.hasContent`) | F3(과제 11) |
| 2 | 집계에 시각을 읽을 수 없는 항목이 있었는지(`usageUndated`). 집계의 항목을 버리지 않는다 | E5의 ②(과제 14), A2의 ④(과제 17) |
| 3 | 플러그인이 놓인 곳의 실제 경로(`installRealPath`) | 과제 4 |
| 4 | 읽지 못한 곳에 든 설치의 관측 기록을 남기는 것(`updateInstalls`의 넷째 인자, `unseenInUnreadablePlace`) | 3부의 `aq checkup`이 관측 기록을 고칠 때 |
| 10 | 목록을 읽지 못한 스킬 폴더가 누구의 것인지(`unreadableSkillPlaces`) | S5(과제 10), F5(과제 11), E5와 E6(과제 15, 16), A2(과제 17) |
| 12 | 스킬과 MCP 서버의 사실마다 설치의 정체 열쇠(`installKey`) | 설치 판정(과제 14) |

과제 10과 12가 과제 9와 11 사이에 끼어 있는 것은 연습 작업 폴더에서 그 사실이 필요해진 차례 그대로다. 차례를 바꾸지 않는다. 과제마다 그 앞까지의 코드로 시험이 통과한다.

## 파일 구조

| 파일 | 맡는 일 |
|---|---|
| `src/core/totals.ts` | 도구 하나의 세션 요약을 점수 구간으로 잘라 더한 구간 합계. 어느 숫자에 주 세션만 넣는지 |
| `src/core/rules.ts` | 규칙 표(규칙 스물둘의 기준, 값의 종류, 0점 기준과 만점 기준, 무게, 단위)와 규칙 버전 |
| `src/core/order.ts` | 목록의 차례를 끝까지 정하는 마지막 견줌 |
| `src/core/score.ts` | 규칙 점수(직선), 경계와 견줄 때의 맞춤, 반올림, 등급 |
| `src/core/reasons.ts` | 못 재는 이유의 차례와 도구 사이에서 고르는 법 |
| `src/core/measure.ts` | 규칙 하나를 잰 결과의 모양(`Measurement`), 근거 숫자, 개수로 정하는 조건 |
| `src/core/metrics/usage.ts` | 기록으로 재는 도구별 규칙 여덟(S4, E1, E2, E3, E4, E7, F1, F2) |
| `src/core/metrics/intensity.ts` | 강도 규칙 넷(I1~I4) |
| `src/core/metrics/setup.ts` | 셋팅 규칙 넷(S1, S2, S3, S5), 안전장치의 두 조건 |
| `src/core/metrics/fit.ts` | 셋팅으로 재는 상황 적합 규칙 넷(F3~F6) |
| `src/core/projects.ts` | 세션의 작업 폴더를 프로젝트에 잇기, 프로젝트마다의 주 세션 수 |
| `src/core/readability.ts` | 셋팅 사실에서 "있는데 읽지 못한 것" 가르기 |
| `src/core/installs/age.ts` | 14일과 30일의 경계 |
| `src/core/installs/signals.ts` | 사용 신호가 있었던 이름을 구간별로 모으기 |
| `src/core/installs/listing.ts` | 주 세션에 실려 있던 이름으로 보는 ㉮의 세션 기록 몫과 ㉱ |
| `src/core/installs/verdict.ts` | 스킬 위치와 MCP 서버 하나의 판정, 조건 ④(㉮~㉳) |
| `src/core/installs/gate.ts` | E5와 E6이 함께 쓰는 못 재는 까닭의 차례 3~7과 값 |
| `src/core/installs/skills.ts` | 스킬 묶음과 E5 |
| `src/core/installs/same.ts` | 정체가 같은 설치의 사실을 하나로 묶기 |
| `src/core/installs/servers.ts` | E6 |
| `src/core/installs/candidates.ts` | 정비 후보 A1, A2, A3 |
| `src/core/scoreboard.ts` | 도구별 평균, 기준 점수, AQ와 등급, 분류, 심각도, 예상 효과, 차례 |
| `src/core/evaluate.ts` | 입력 묶음에서 평가까지 |
| `src/commands/checkup-input.ts` | 입력 묶음을 모은다(기록 읽기, 셋팅 스캔, 정규화한 작업 폴더의 표). core 밖이다 |
| `src/adapters/types.ts`, `src/adapters/claude/observation.ts` | 관측 범위의 타입을 도구에 매이지 않는 자리로 옮긴다 |
| `src/scan/instructions.ts`, `claude-json.ts`, `plugins.ts`, `claude.ts`, `identity.ts`, `types.ts`, `src/state/observations.ts` | 1부의 셋팅 사실에 더하는 것 여섯 |
| `scripts/dev-evaluate.ts` | 개발용. 이 PC의 기록과 셋팅으로 평가를 돌려 숫자만 낸다 |
| `test/helpers/summaries.ts`, `facts.ts`, `evaluation.ts`, `personas.ts` | 시험 도우미. 세션 요약, 셋팅 사실, 입력 묶음, 합성 사용자를 손으로 짓는다 |
| `test/core/*.test.ts`, `test/commands/checkup-input.test.ts`, `test/scan/unreadable-places.test.ts` | 시험 |

설계 7.1의 `core/`에 둔다. 설계 7.2의 "지표 계산(`core/metrics`)"과 "규칙과 점수(`core/rules`, `core/score`)"를 그대로 따르고, 설치 판정은 분량이 커서 `core/installs/`로 따로 둔다. 문구(`text/`)와 평가 결과의 조립은 3부다.

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/3`처럼 차례를 적었고 적힌 차례대로 바꾼다.
- 과제의 확인 명령은 그 과제와 관계있는 시험 폴더와 타입 검사다. 전체 검사(`npm run check`)는 마지막 과제에서 돌린다.

---

### Task 1: 1부 보완. 지침 파일에 내용이 있는지를 사실로 낸다

**Files:**
- Modify: `test/scan/instructions.test.ts`
- Modify: `src/scan/instructions.ts`

**Interfaces:**
- Consumes: 1부의 `InstructionFile`, `readInstructionSet`(`src/scan/instructions.ts`).
- Produces: `InstructionFile.hasContent: boolean`. 공백이 아닌 글자가 하나라도 있으면 참이다. 과제 11의 F3이 "지침이 있다"를 가르는 데 쓴다.

설계 11.3의 F3은 "지침이 있다는 것"을 내용이 있는 파일이 하나라도 있는 것으로 정했다(「2단계 2부 계획 전 설계 결정」의 6번). 0바이트 파일과 공백만 있는 파일은 지침으로 세지 않는다. 1부의 셋팅 사실은 파일의 크기만 내서 공백만 있는 파일을 가르지 못한다. 그래서 스캐너가 글을 읽은 그 자리에서 참거짓 하나를 더 낸다. 글 자체는 전과 같이 버린다.

- 크기의 문턱은 두지 않는다. S1의 200바이트는 전역 지침에만 쓴다.
- 읽지 못한 파일은 `InstructionSet.unreadable`에 들고 `files`에는 없으므로 이 값이 없다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/instructions.test.ts`(찾을 곳 1/2):

```ts
    const project = await readInstructionSet([join(root, "proj", ".claude", "CLAUDE.md")], [], realPaths(global.set));
    expect(project.set.files).toEqual([{ path: join(root, "proj", ".claude", "CLAUDE.md"), realPath: normalizePath(join(root, "global", "CLAUDE.md")), bytes: Buffer.byteLength(line), sameAsGlobal: true }]);
    expect(project.set.lineHashes).toEqual([]);
```

`test/scan/instructions.test.ts`(바꾼 뒤 1/2):

```ts
    const project = await readInstructionSet([join(root, "proj", ".claude", "CLAUDE.md")], [], realPaths(global.set));
    expect(project.set.files).toEqual([
      { path: join(root, "proj", ".claude", "CLAUDE.md"), realPath: normalizePath(join(root, "global", "CLAUDE.md")), bytes: Buffer.byteLength(line), hasContent: true, sameAsGlobal: true },
    ]);
    expect(project.set.lineHashes).toEqual([]);
```

`test/scan/instructions.test.ts`(찾을 곳 2/2):

```ts

  it("폴더처럼 읽을 수 없는 경로는 읽지 못한 것으로 적는다", async () => {
```

`test/scan/instructions.test.ts`(바꾼 뒤 2/2):

```ts

  it("공백이 아닌 글자가 하나라도 있어야 내용이 있는 파일이다(설계 11.3 F3 「지침이 있다는 것」)", async () => {
    await put(join(root, "empty.md"), "");
    await put(join(root, "blank.md"), " \r\n\t\n﻿");
    await put(join(root, "one-line.md"), "\n# 제목\n");
    const { set } = await readInstructionSet([join(root, "empty.md"), join(root, "blank.md"), join(root, "one-line.md")]);
    expect(set.files.map((f) => [f.path, f.hasContent])).toEqual([
      [join(root, "blank.md"), false],
      [join(root, "empty.md"), false],
      [join(root, "one-line.md"), true],
    ]);
  });

  it("폴더처럼 읽을 수 없는 경로는 읽지 못한 것으로 적는다", async () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/instructions.test.ts`
Expected: FAIL. 새로 더한 시험에서 `hasContent`가 `undefined`다(필드가 아직 없다).

- [ ] **Step 3: 구현한다**

`src/scan/instructions.ts`(찾을 곳 1/2):

```ts
  bytes: number;
  /** 전역 지침과 같은 파일(링크이거나 실제 경로가 같음)이다. F4에서 견주지 않으므로 줄 지문에 넣지 않는다(설계 11.3 F4) */
```

`src/scan/instructions.ts`(바꾼 뒤 1/2):

```ts
  bytes: number;
  /** 공백이 아닌 글자가 하나라도 있다. 0바이트 파일과 공백만 있는 파일은 거짓이다(설계 11.3 F3 「지침이 있다는 것」) */
  hasContent: boolean;
  /** 전역 지침과 같은 파일(링크이거나 실제 경로가 같음)이다. F4에서 견주지 않으므로 줄 지문에 넣지 않는다(설계 11.3 F4) */
```

`src/scan/instructions.ts`(찾을 곳 2/2):

```ts
    const bytes = Buffer.byteLength(read.text, "utf8");
    set.files.push({ path, realPath: info.realPath, bytes, sameAsGlobal: same });
    set.bytes += bytes;
```

`src/scan/instructions.ts`(바꾼 뒤 2/2):

```ts
    const bytes = Buffer.byteLength(read.text, "utf8");
    set.files.push({ path, realPath: info.realPath, bytes, hasContent: /\S/u.test(read.text), sameAsGlobal: same });
    set.bytes += bytes;
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 12개, 시험 179개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/instructions.test.ts src/scan/instructions.ts
git commit -m "feat: 지침 파일의 내용 유무를 셋팅 사실에 추가"
```

---

### Task 2: 1부 보완. 집계의 마지막 사용 시각을 「없음, 날짜 있음, 시각 모름」으로 가른다

**Files:**
- Modify: `test/scan/claude.test.ts`
- Modify: `test/scan/identity.test.ts`
- Modify: `test/scan/mcp.test.ts`
- Modify: `src/scan/claude-json.ts`
- Modify: `src/scan/claude.ts`
- Modify: `src/scan/types.ts`

**Interfaces:**
- Consumes: 1부의 `readClaudeJson`, `ClaudeJsonFacts`(`src/scan/claude-json.ts`), `SkillFact.usageLastUsedMs`, `PluginFact.usageLastUsedMs`(`src/scan/types.ts`).
- Produces: `UsageTimes = Record<string, number | null>`(열쇠가 없으면 집계가 없고, 값이 `null`이면 항목은 있는데 시각을 모른다), `MAX_DATE_MS`, `isDateMs(v: unknown): v is number`(`src/scan/claude-json.ts`). `SkillFact.usageUndated: boolean`, `PluginFact.usageUndated: boolean`. 과제 14의 조건 ②와 과제 17의 A2 ④가 쓴다.

설계 11.3의 「30일의 경계」는 집계의 항목은 있는데 마지막 사용 시각을 읽을 수 없으면 "30일 안"으로 보라고 정했다. `lastUsedAt`이 없거나, 숫자가 아니거나, 날짜로 바꿀 수 없는 수(유한하지 않다, 날짜가 나타낼 수 있는 범위 밖이다)인 때다. 1부의 `lastUsed`는 그런 항목을 버려서 "집계가 없다"와 가를 수 없었다. 버리면 언제 썼는지 모르는 것을 안 쓴 것으로 치게 된다.

- `.claude.json`의 집계는 열쇠가 있으면 버리지 않는다. 시각이 읽히면 그 수, 아니면 `null`이다.
- 스킬은 이름 꼴 여럿, 플러그인은 두 이름으로 집계를 찾는다(설계 10). 시각이 읽힌 것 가운데 가장 늦은 것을 `usageLastUsedMs`에, 시각을 모르는 항목이 하나라도 있었는지를 `usageUndated`에 낸다. `usageUndated`가 참이면 `usageLastUsedMs`가 오래전이어도 "30일 안"이다.
- 날짜의 범위는 `Date`가 나타낼 수 있는 ±8,640,000,000,000,000밀리초다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/claude.test.ts`(찾을 곳):

```ts
    expect(find(scanned.plugins, "runtime-name")).toMatchObject({ id: "store-alias@demo", entryName: "store-alias", usageLastUsedMs: 1_760_000_900_000 });
```

`test/scan/claude.test.ts`(바꾼 뒤):

```ts
    expect(find(scanned.plugins, "runtime-name")).toMatchObject({ id: "store-alias@demo", entryName: "store-alias", usageLastUsedMs: 1_760_000_900_000, usageUndated: false });
  });

  it("집계의 항목은 있는데 시각을 읽을 수 없으면 시각 모름으로 낸다. 이름 꼴 하나라도 그러면 그렇다(설계 11.3 「30일의 경계」)", async () => {
    const p = join(root, "plugins", "store-alias");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "runtime-name" }));
    await put(join(p, "skills", "one", "SKILL.md"), skill("one"));
    await addPlugin("store-alias@demo", p, { name: "store-alias", source: "./store-alias" });
    const claudeJson = await readJsonFile(join(input.homedir, ".claude.json"));
    claudeJson.pluginUsage["runtime-name@demo"] = { usageCount: 1, lastUsedAt: 1_760_000_900_000 };
    claudeJson.pluginUsage["store-alias@demo"] = { usageCount: 3 };
    claudeJson.skillUsage["store-alias:one"] = { usageCount: 1, lastUsedAt: 1_760_000_800_000 };
    claudeJson.skillUsage["runtime-name:one"] = { usageCount: 1, lastUsedAt: "yesterday" };
    claudeJson.skillUsage["active-skill"] = { usageCount: 1, lastUsedAt: 9_000_000_000_000_000 };
    await put(join(input.homedir, ".claude.json"), json(claudeJson));
    const scanned = await scanClaudeSetup(input);
    // 읽힌 시각은 그대로 남기고, 시각 모름이 하나라도 있었다는 것을 따로 낸다
    expect(find(scanned.skills, "runtime-name:one")).toMatchObject({ usageLastUsedMs: 1_760_000_800_000, usageUndated: true });
    expect(find(scanned.plugins, "runtime-name")).toMatchObject({ usageLastUsedMs: 1_760_000_900_000, usageUndated: true });
    expect(find(scanned.skills, "active-skill")).toMatchObject({ usageLastUsedMs: null, usageUndated: true });
    // 집계에 항목이 없는 것은 시각 모름이 아니다
    expect(find(scanned.skills, "pa:s1")).toMatchObject({ usageLastUsedMs: 1_760_000_500_000, usageUndated: false });
```

`test/scan/identity.test.ts`(찾을 곳):

```ts
  usageLastUsedMs: null,
  ...over,
```

`test/scan/identity.test.ts`(바꾼 뒤):

```ts
  usageLastUsedMs: null,
  usageUndated: false,
  ...over,
```

`test/scan/mcp.test.ts`(찾을 곳 1/2):

```ts
        skillUsage: { a: { usageCount: 3, lastUsedAt: 1_700_000_000_000 }, "p:b": { usageCount: 1, lastUsedAt: 1_700_000_100_000 }, bad: { lastUsedAt: "x" } },
        pluginUsage: { "p@m": { usageCount: 1, lastUsedAt: 1_700_000_200_000, lastUsedNumStartups: 4 } },
```

`test/scan/mcp.test.ts`(바꾼 뒤 1/2):

```ts
        skillUsage: {
          a: { usageCount: 3, lastUsedAt: 1_700_000_000_000 },
          "p:b": { usageCount: 1, lastUsedAt: 1_700_000_100_000 },
          bad: { lastUsedAt: "x" },
          "no-time": { usageCount: 2 },
          "too-big": { lastUsedAt: 9_000_000_000_000_000 },
          "not-an-entry": 7,
        },
        pluginUsage: { "p@m": { usageCount: 1, lastUsedAt: 1_700_000_200_000, lastUsedNumStartups: 4 }, "q@m": { usageCount: 1 } },
```

`test/scan/mcp.test.ts`(찾을 곳 2/2):

```ts
    expect({ ...facts.skillUsage }).toEqual({ a: 1_700_000_000_000, "p:b": 1_700_000_100_000 });
    expect({ ...facts.pluginUsage }).toEqual({ "p@m": 1_700_000_200_000 });
```

`test/scan/mcp.test.ts`(바꾼 뒤 2/2):

```ts
    // 항목은 있는데 시각을 읽을 수 없으면(없다, 숫자가 아니다, 날짜가 나타낼 수 있는 범위 밖이다) 버리지 않고 null로 남긴다(설계 11.3 「30일의 경계」)
    expect({ ...facts.skillUsage }).toEqual({ a: 1_700_000_000_000, "p:b": 1_700_000_100_000, bad: null, "no-time": null, "too-big": null, "not-an-entry": null });
    expect({ ...facts.pluginUsage }).toEqual({ "p@m": 1_700_000_200_000, "q@m": null });
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/claude.test.ts test/scan/identity.test.ts test/scan/mcp.test.ts`
Expected: FAIL. 시각을 읽을 수 없는 집계 항목이 버려지고(`skillUsage`에 그 열쇠가 없다), 스킬과 플러그인의 사실에 `usageUndated`가 없다.

- [ ] **Step 3: 구현한다**

`src/scan/claude-json.ts`(찾을 곳 1/4):

```ts
  projects: ClaudeJsonProject[];
  /** 스킬 이름(사용자 스킬은 맨이름, 플러그인 스킬은 '<플러그인>:<스킬>') → 마지막 사용 시각(밀리초) */
  skillUsage: Record<string, number>;
  /** '<이름>@<마켓>' → 마지막 사용 시각(밀리초) */
  pluginUsage: Record<string, number>;
  claudeAiEverConnected: string[];
```

`src/scan/claude-json.ts`(바꾼 뒤 1/4):

```ts
  projects: ClaudeJsonProject[];
  /** 스킬 이름(사용자 스킬은 맨이름, 플러그인 스킬은 '<플러그인>:<스킬>') → 마지막 사용 시각(밀리초). 항목은 있는데 시각을 읽을 수 없으면 null이다 */
  skillUsage: UsageTimes;
  /** '<이름>@<마켓>' → 마지막 사용 시각(밀리초). 항목은 있는데 시각을 읽을 수 없으면 null이다 */
  pluginUsage: UsageTimes;
  claudeAiEverConnected: string[];
```

`src/scan/claude-json.ts`(찾을 곳 2/4):

```ts

type Json = Record<string, unknown>;
```

`src/scan/claude-json.ts`(바꾼 뒤 2/4):

```ts

/** 집계의 이름마다 마지막 사용 시각. 열쇠가 없으면 집계가 없는 것이고, 값이 null이면 항목은 있는데 시각을 모르는 것이다(설계 11.3 「30일의 경계」) */
export type UsageTimes = Record<string, number | null>;

/** 날짜가 나타낼 수 있는 가장 먼 밀리초. 이보다 큰 수는 날짜로 바꿀 수 없다 */
export const MAX_DATE_MS = 8_640_000_000_000_000;

type Json = Record<string, unknown>;
```

`src/scan/claude-json.ts`(찾을 곳 3/4):

```ts

function lastUsed(v: unknown): Record<string, number> {
  const out: Record<string, number> = Object.create(null) as Record<string, number>;
  if (!isObject(v)) return out;
  for (const [name, entry] of Object.entries(v)) {
    if (isObject(entry) && typeof entry.lastUsedAt === "number" && Number.isFinite(entry.lastUsedAt)) out[name] = entry.lastUsedAt;
  }
```

`src/scan/claude-json.ts`(바꾼 뒤 3/4):

```ts

/** 날짜로 바꿀 수 있는 시각인지. 유한한 수이고 날짜가 나타낼 수 있는 범위 안이다. */
export function isDateMs(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_DATE_MS;
}

/**
 * 집계의 항목을 버리지 않는다. 시각이 없거나, 숫자가 아니거나, 날짜로 바꿀 수 없는 수이면 null로 남긴다.
 * 그런 항목을 버리면 "집계가 없다"가 되어 언제 썼는지 모르는 것을 안 쓴 것으로 치게 된다.
 */
function lastUsed(v: unknown): UsageTimes {
  const out: UsageTimes = Object.create(null) as UsageTimes;
  if (!isObject(v)) return out;
  for (const [name, entry] of Object.entries(v)) {
    out[name] = isObject(entry) && isDateMs(entry.lastUsedAt) ? entry.lastUsedAt : null;
  }
```

`src/scan/claude-json.ts`(찾을 곳 4/4):

```ts
    projects: [],
    skillUsage: Object.create(null) as Record<string, number>,
    pluginUsage: Object.create(null) as Record<string, number>,
    claudeAiEverConnected: [],
```

`src/scan/claude-json.ts`(바꾼 뒤 4/4):

```ts
    projects: [],
    skillUsage: Object.create(null) as UsageTimes,
    pluginUsage: Object.create(null) as UsageTimes,
    claudeAiEverConnected: [],
```

`src/scan/claude.ts`(찾을 곳 1/4):

```ts
/** 시각들 가운데 가장 늦은 것. 하나도 없으면 null이다. */
const latest = (times: readonly (number | undefined)[]): number | null => times.reduce<number | null>((max, t) => (t === undefined || (max !== null && max >= t) ? max : t), null);
```

`src/scan/claude.ts`(바꾼 뒤 1/4):

```ts
/**
 * 이름들의 집계를 합친다. 시각이 읽힌 것 가운데 가장 늦은 것과, 항목은 있는데 시각을 읽을 수 없는 것(null)이 하나라도 있었는지를 낸다.
 * 집계에 없는 이름(undefined)은 어느 쪽에도 들지 않는다(설계 11.3 「30일의 경계」).
 */
function usageOf(times: readonly (number | null | undefined)[]): { usageLastUsedMs: number | null; usageUndated: boolean } {
  let usageLastUsedMs: number | null = null;
  let usageUndated = false;
  for (const at of times) {
    if (at === undefined) continue;
    if (at === null) usageUndated = true;
    else if (usageLastUsedMs === null || at > usageLastUsedMs) usageLastUsedMs = at;
  }
  return { usageLastUsedMs, usageUndated };
}
```

`src/scan/claude.ts`(찾을 곳 2/4):

```ts
  const usageOf = (names: readonly string[]): number | null => {
    let latest: number | null = null;
    for (const name of names) {
      const at = claudeJson.skillUsage[name];
      if (at !== undefined && (latest === null || at > latest)) latest = at;
    }
    return latest;
  };

```

`src/scan/claude.ts`(바꾼 뒤 2/4): 찾은 줄을 지운다.

`src/scan/claude.ts`(찾을 곳 3/4):

```ts
      usageLastUsedMs: usageOf(fields.recordNames),
```

`src/scan/claude.ts`(바꾼 뒤 3/4):

```ts
      ...usageOf(fields.recordNames.map((name) => claudeJson.skillUsage[name])),
```

`src/scan/claude.ts`(찾을 곳 4/4):

```ts
      usageLastUsedMs: latest(pluginNames.map((pluginName) => claudeJson.pluginUsage[`${pluginName}@${plugin.marketplace}`])),
```

`src/scan/claude.ts`(바꾼 뒤 4/4):

```ts
      ...usageOf(pluginNames.map((pluginName) => claudeJson.pluginUsage[`${pluginName}@${plugin.marketplace}`])),
```

`src/scan/types.ts`(찾을 곳 1/2):

```ts
  hookProvided: boolean;
  /** 도구가 세는 집계(skillUsage)에서 이 스킬의 이름 꼴 가운데 가장 늦은 마지막 사용 시각. 없으면 null. .claude.json을 읽지 못했으면(ClaudeSetupFacts.claudeJson이 ok가 아님) 없는 것이 아니라 모르는 것이다(설계 10) */
  usageLastUsedMs: number | null;
}
```

`src/scan/types.ts`(바꾼 뒤 1/2):

```ts
  hookProvided: boolean;
  /** 도구가 세는 집계(skillUsage)에서 이 스킬의 이름 꼴 가운데 시각이 읽힌 것의 가장 늦은 마지막 사용 시각. 그런 것이 없으면 null. .claude.json을 읽지 못했으면(ClaudeSetupFacts.claudeJson이 ok가 아님) 없는 것이 아니라 모르는 것이다(설계 10) */
  usageLastUsedMs: number | null;
  /** 이름 꼴 가운데 집계의 항목은 있는데 시각을 읽을 수 없는 것이 있다. 참이면 "30일 안"으로 본다(설계 11.3 「30일의 경계」) */
  usageUndated: boolean;
}
```

`src/scan/types.ts`(찾을 곳 2/2):

```ts
  skills: string[];
  /** 도구의 집계(pluginUsage)에서 두 이름(마켓 항목의 이름, 구성 요소의 이름)으로 찾은 마지막 사용 시각 가운데 늦은 것. 없으면 null. .claude.json을 읽지 못했으면 claudeJson의 상태로 가린다 */
  usageLastUsedMs: number | null;
}
```

`src/scan/types.ts`(바꾼 뒤 2/2):

```ts
  skills: string[];
  /** 도구의 집계(pluginUsage)에서 두 이름(마켓 항목의 이름, 구성 요소의 이름)으로 찾은 마지막 사용 시각 가운데 늦은 것. 시각이 읽힌 것이 없으면 null. .claude.json을 읽지 못했으면 claudeJson의 상태로 가린다 */
  usageLastUsedMs: number | null;
  /** 두 이름 가운데 집계의 항목은 있는데 시각을 읽을 수 없는 것이 있다. 참이면 "30일 안"으로 본다(설계 11.3 「30일의 경계」, 16.2 A2 ④) */
  usageUndated: boolean;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 12개, 시험 180개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/claude.test.ts test/scan/identity.test.ts test/scan/mcp.test.ts src/scan/claude-json.ts src/scan/claude.ts src/scan/types.ts
git commit -m "feat: 사용 집계의 시각 모름을 셋팅 사실에 추가"
```

---

### Task 3: 1부 보완. 플러그인이 놓인 곳의 실제 경로를 낸다

**Files:**
- Modify: `test/scan/claude.test.ts`
- Modify: `src/scan/claude.ts`
- Modify: `src/scan/plugins.ts`
- Modify: `src/scan/types.ts`

**Interfaces:**
- Consumes: 1부의 `PluginInstall`, `readPluginInstall`(`src/scan/plugins.ts`), `entryInfo`(`src/scan/fs.ts`), `PluginFact`(`src/scan/types.ts`).
- Produces: `PluginInstall.installRealPath: string | null`, `PluginFact.installRealPath: string | null`. 놓인 곳의 링크를 푼 실제 경로(정규화)다. 놓인 곳이 없거나 풀지 못하면 `null`이다. 과제 4의 `unseenInUnreadablePlace`가 쓴다.

설계 18.1의 「읽지 못한 곳」은 구성을 모르는 플러그인의 스킬을 "읽지 못한 곳에 든 것"으로 본다. 관측 기록의 스킬 열쇠에는 스킬의 실제 경로가 들어 있고(설계 11.3 「설치의 정체」), 플러그인의 놓인 곳(`installPath`)은 링크일 수 있다. 링크로 건 플러그인의 스킬은 실제 경로가 놓인 곳의 글자 그대로의 경로 아래에 있지 않다. 그래서 놓인 곳의 실제 경로를 따로 낸다. 플러그인 뿌리를 보는 곳(`rootReal`)도 이 값을 쓴다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/claude.test.ts`(찾을 곳):

```ts

  it("enabledPlugins에 @builtin으로 끝나는 ID가 켜져 있어도 설치 기록이 없는 플러그인으로 세지 않는다", async () => {
```

`test/scan/claude.test.ts`(바꾼 뒤):

```ts

  it("플러그인의 놓인 곳이 링크이면 실제 경로를 따로 낸다. 그 플러그인의 스킬은 실제 경로가 그 안에 있다(설계 18.1 「읽지 못한 곳」)", async () => {
    const real = join(root, "store", "linked-plugin");
    await put(join(real, ".claude-plugin", "plugin.json"), json({ name: "linked" }));
    await put(join(real, "skills", "one", "SKILL.md"), skill("one"));
    const link = join(root, "plugins", "linked");
    await linkDir(real, link);
    await addPlugin("linked@demo", link, { name: "linked", source: "./linked" });
    const scanned = await scanClaudeSetup(input);
    const plugin = find(scanned.plugins, "linked");
    expect(plugin.installPath).toBe(link);
    expect(plugin.installRealPath).toBe(normalizePath(await realpath(real)));
    expect(find(scanned.skills, "linked:one").realPath!.startsWith(`${plugin.installRealPath}/`)).toBe(true);
    // 놓인 곳이 없으면 실제 경로도 없다
    await addPlugin("gone@demo", join(root, "plugins", "gone"), { name: "gone", source: "./gone" });
    expect(find((await scanClaudeSetup(input)).plugins, "gone")).toMatchObject({ exists: false, installRealPath: null });
  });

  it("enabledPlugins에 @builtin으로 끝나는 ID가 켜져 있어도 설치 기록이 없는 플러그인으로 세지 않는다", async () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/claude.test.ts`
Expected: FAIL. 링크로 건 플러그인의 사실에 `installRealPath`가 없다.

- [ ] **Step 3: 구현한다**

`src/scan/claude.ts`(찾을 곳):

```ts
      installPath: plugin.installPath,
      exists: plugin.exists,
```

`src/scan/claude.ts`(바꾼 뒤):

```ts
      installPath: plugin.installPath,
      installRealPath: plugin.installRealPath,
      exists: plugin.exists,
```

`src/scan/plugins.ts`(찾을 곳 1/4):

```ts
  installPath: string;
  exists: boolean;
```

`src/scan/plugins.ts`(바꾼 뒤 1/4):

```ts
  installPath: string;
  /** 놓인 곳의 링크를 푼 실제 경로(정규화). 놓인 곳이 없거나 풀지 못하면 null이다. 플러그인 스킬을 그 플러그인에 이을 때 쓴다(설계 18.1 「읽지 못한 곳」) */
  installRealPath: string | null;
  exists: boolean;
```

`src/scan/plugins.ts`(찾을 곳 2/4):

```ts
    installPath,
    exists: false,
```

`src/scan/plugins.ts`(바꾼 뒤 2/4):

```ts
    installPath,
    installRealPath: null,
    exists: false,
```

`src/scan/plugins.ts`(찾을 곳 3/4):

```ts

  plugin.exists = (await entryInfo(installPath)).isDir;
  if (!plugin.exists) return unknown();
  const listing = await listDir(installPath);
```

`src/scan/plugins.ts`(바꾼 뒤 3/4):

```ts

  const installInfo = await entryInfo(installPath);
  plugin.exists = installInfo.isDir;
  if (!plugin.exists) return unknown();
  plugin.installRealPath = installInfo.realPath;
  const listing = await listDir(installPath);
```

`src/scan/plugins.ts`(찾을 곳 4/4):

```ts
  const root = normalizePath(installPath);
  const rootReal = (await entryInfo(installPath)).realPath;
  const within = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);
```

`src/scan/plugins.ts`(바꾼 뒤 4/4):

```ts
  const root = normalizePath(installPath);
  const rootReal = plugin.installRealPath;
  const within = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);
```

`src/scan/types.ts`(찾을 곳):

```ts
  installPath: string;
  exists: boolean;
```

`src/scan/types.ts`(바꾼 뒤):

```ts
  installPath: string;
  /** 놓인 곳의 링크를 푼 실제 경로(정규화). 놓인 곳이 없거나 풀지 못하면 null이다. 플러그인 스킬의 실제 경로가 이 안에 있는지로 그 플러그인의 스킬인지 가린다(설계 18.1 「읽지 못한 곳」) */
  installRealPath: string | null;
  exists: boolean;
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 12개, 시험 181개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/claude.test.ts src/scan/claude.ts src/scan/plugins.ts src/scan/types.ts
git commit -m "feat: 플러그인 놓인 곳의 실제 경로를 사실에 추가"
```

---

### Task 4: 1부 보완. 읽지 못한 곳에 든 설치의 관측 기록을 남긴다

**Files:**
- Modify: `test/scan/identity.test.ts`
- Modify: `test/state/state.test.ts`
- Modify: `src/scan/identity.ts`
- Modify: `src/state/observations.ts`

**Interfaces:**
- Consumes: 1부의 `updateInstalls(previous, currentKeys, today)`(`src/state/observations.ts`), `installKey`, `installKeysOf`(`src/scan/identity.ts`), `ClaudeSetupFacts`. 과제 3의 `PluginFact.installRealPath`.
- Produces: `updateInstalls(previous: readonly InstallRecord[] | null, currentKeys: readonly string[], today: LocalDate, keepUnseen: (key: string) => boolean = () => false): InstallRecord[]`. 넷째 인자를 주지 않으면 전과 같다. `unseenInUnreadablePlace(facts: ClaudeSetupFacts): (key: string) => boolean`(`src/scan/identity.ts`). 관측 기록을 갱신해 저장하는 일은 3부의 `aq checkup`이 이 둘로 한다.

설계 18.1(「2단계 2부 계획 전 설계 결정」의 1번)은 이번 점검에 보이지 않는 설치를 둘로 가른다. 그 설치가 든 곳을 이번 점검이 읽었으면 기록을 지우고, 읽지 못했으면 고치지 않는다. 읽기 실패 한 번이 깔린 채로 있는 설치의 관측 기간을 지우지 않게 하려는 것이다. 1부의 `updateInstalls`는 보이지 않으면 늘 지웠다.

- `updateInstalls`는 `keepUnseen(key)`가 참인 기록을 그대로 남긴다. 첫날과 "새로 나타남" 표시를 고치지 않는다. 결과는 전과 같이 열쇠 차례다.
- `unseenInUnreadablePlace`는 설계 18.1의 표를 셋팅 사실로 옮긴 것이다. 열쇠(JSON 배열)를 풀어 범위마다 본다.

  | 설치 | 읽지 못한 곳에 든 것으로 보는 때 |
  |---|---|
  | 사용자 범위와 로컬 범위의 MCP 서버 | `claudeJson`이 `unparsable`이나 `unreadable`이다. 로컬 범위는 스캐너가 셋팅을 읽는 프로젝트의 것일 때만이다 |
  | 프로젝트 범위의 MCP 서버 | 그 프로젝트의 `mcpJsonStatus`가 `unparsable`이나 `unreadable`이다 |
  | 사용자 스킬 | 사용자 스킬 폴더가 `unreadableDirs`에 있다 |
  | 프로젝트 스킬 | 스캐너가 셋팅을 읽는 프로젝트이고 그 스킬 폴더가 `unreadableDirs`에 있다 |
  | 플러그인의 MCP 서버 | 설치 기록 파일을 읽지 못했거나, 그 ID의 플러그인이 놓인 곳은 있는데 MCP 정의를 읽지 못했다(구성을 모르는 것도 든다) |
  | 플러그인의 스킬 | 설치 기록 파일을 읽지 못했거나, 실제 경로가 구성을 모르는 플러그인의 놓인 곳 안이거나, `unreadableDirs`의 폴더 안이다 |

- 스킬의 열쇠에는 링크를 푼 실제 경로가 들어 있고, `unreadableDirs`에는 스캐너가 훑으려던 경로가 그대로 적힌다. 링크로 건 플러그인은 둘의 앞부분이 다르다. 그래서 읽지 못한 폴더가 플러그인이 놓인 곳(`installPath`) 안이면 그 앞부분을 놓인 곳의 실제 경로(`installRealPath`)로 바꾼 꼴로도 견준다. 구성은 읽혔는데 스킬을 찾는 폴더의 목록만 읽지 못한 플러그인이 이 경우다.
- 놓인 곳 안쪽의 폴더가 다시 링크이면 그 폴더의 실제 경로는 알 수 없다. 읽지 못했으므로 풀 수도 없다. 그때는 견주지 못해 기록을 지운다. 놓인 곳의 실제 경로를 모를 때(`installRealPath`가 `null`)도 같다. 지우는 쪽이 판정을 미루는 쪽이다.

- 없는 파일과 폴더는 읽지 못한 것이 아니다(`missing`). 스캐너가 셋팅을 읽지 않는 프로젝트(지금 PC에 없다, 목록에서 빠졌다, 프로젝트로 보지 않는 폴더다)의 설치는 없어진 것으로 본다. 모양이 다른 열쇠는 거짓이다. 읽지 못했다고 확인되지 않으면 지우는 쪽이고, 지우는 쪽이 판정을 미루는 쪽이다.
- 경로를 견주므로 이 함수는 `src/scan/`에 둔다. core는 경로를 다루지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/identity.test.ts`(찾을 곳 1/2):

```ts
// 설치의 정체 열쇠를 시험한다. 같은 이름이라도 범위·실제 경로·정의가 다르면 다른 설치이고, 정의가 없는 서버는 정체가 없다(설계 11.3, 18.1, 21.1)
import { describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { installKeysOf, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { ClaudeSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";

const skill = (over: Partial<SkillFact>): SkillFact => ({
```

`test/scan/identity.test.ts`(바꾼 뒤 1/2):

```ts
// 설치의 정체 열쇠를 시험한다. 같은 이름이라도 범위·실제 경로·정의가 다르면 다른 설치이고, 정의가 없는 서버는 정체가 없다(설계 11.3, 18.1, 21.1)
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { installKeysOf, mcpInstallKey, skillInstallKey, unseenInUnreadablePlace } from "../../src/scan/identity.ts";
import { emptyInstructionSet } from "../../src/scan/instructions.ts";
import type { ClaudeSetupFacts, McpFact, PluginFact, ProjectFact, SkillFact } from "../../src/scan/types.ts";

const skill = (over: Partial<SkillFact>): SkillFact => ({
```

`test/scan/identity.test.ts`(찾을 곳 2/2):

```ts
  });
});
```

`test/scan/identity.test.ts`(바꾼 뒤 2/2):

```ts
  });
});

describe("읽지 못한 곳에 든 설치(설계 18.1 「읽지 못한 곳」)", () => {
  const home = join("/h", ".claude");
  const app = join("/work", "app");
  const norm = normalizePath;
  const plugin = (over: Partial<PluginFact>): PluginFact => ({
    id: "p@m",
    entryName: "p",
    name: "p",
    scopes: ["user"],
    projectRoots: [],
    installPath: join(home, "plugins", "cache", "m", "p", "1"),
    installRealPath: norm(join(home, "plugins", "cache", "m", "p", "1")),
    exists: true,
    manifest: "ok",
    marketplaceEntry: "ok",
    compositionKnown: true,
    enabled: true,
    managedFixed: false,
    managedForced: false,
    components: ["skills"],
    unknownEntries: [],
    dependencies: [],
    hasHooks: false,
    hooksUnreadable: false,
    mcpUnreadable: false,
    skills: [],
    usageLastUsedMs: null,
    usageUndated: false,
    ...over,
  });
  const project = (over: Partial<ProjectFact>): ProjectFact => ({
    root: app,
    normRoot: norm(app),
    kind: "git",
    exists: true,
    excluded: false,
    cwds: [app],
    settingsStatus: "missing",
    localSettingsStatus: "missing",
    mcpJsonStatus: "ok",
    hasSettings: false,
    hasLocalSettings: false,
    instructions: emptyInstructionSet(),
    bypassInProject: false,
    bypassInLocal: false,
    permissionConflicts: 0,
    ...over,
  });
  const facts = (over: Partial<ClaudeSetupFacts>): ClaudeSetupFacts =>
    ({ home, claudeJson: "ok", pluginsFile: "ok", plugins: [], projects: [project({})], unreadableDirs: [], skills: [], mcpServers: [], ...over }) as ClaudeSetupFacts;

  const userServer = mcpInstallKey(server({}))!;
  const localServer = mcpInstallKey(server({ scope: "local", projectRoot: norm(app) }))!;
  const projectServer = mcpInstallKey(server({ scope: "project", projectRoot: norm(app) }))!;
  const pluginServer = mcpInstallKey(server({ scope: "plugin", pluginId: "p@m" }))!;
  const userSkill = skillInstallKey(skill({ realPath: norm(join(home, "skills", "a")) }));
  const projectSkill = skillInstallKey(skill({ scope: "project", projectRoot: norm(app), realPath: norm(join(app, ".claude", "skills", "a")) }));
  const pluginSkill = skillInstallKey(skill({ scope: "plugin", name: "p:a", pluginId: "p@m", realPath: norm(join(home, "plugins", "cache", "m", "p", "1", "skills", "a")) }));

  it("다 읽힌 점검에서는 어느 설치도 읽지 못한 곳에 든 것이 아니다", () => {
    const keep = unseenInUnreadablePlace(facts({ plugins: [plugin({})] }));
    expect([userServer, localServer, projectServer, pluginServer, userSkill, projectSkill, pluginSkill].map(keep)).toEqual([false, false, false, false, false, false, false]);
  });

  it(".claude.json이 풀리지 않거나 열 수 없으면 사용자·로컬 범위 서버가 그렇다. 파일이 없는 것은 읽지 못한 것이 아니다", () => {
    for (const status of ["unparsable", "unreadable"] as const) {
      const keep = unseenInUnreadablePlace(facts({ claudeJson: status }));
      expect([userServer, localServer, projectServer, userSkill].map(keep)).toEqual([true, true, false, false]);
    }
    const missing = unseenInUnreadablePlace(facts({ claudeJson: "missing" }));
    expect([userServer, localServer].map(missing)).toEqual([false, false]);
  });

  it("프로젝트의 .mcp.json을 읽지 못하면 그 프로젝트의 프로젝트 범위 서버만 그렇다", () => {
    const other = mcpInstallKey(server({ scope: "project", projectRoot: norm(join("/work", "other")) }))!;
    const keep = unseenInUnreadablePlace(facts({ projects: [project({ mcpJsonStatus: "unparsable" }), project({ root: join("/work", "other"), normRoot: norm(join("/work", "other")) })] }));
    expect([projectServer, other, userServer].map(keep)).toEqual([true, false, false]);
    expect(unseenInUnreadablePlace(facts({ projects: [project({ mcpJsonStatus: "missing" })] }))(projectServer)).toBe(false);
  });

  it("스캐너가 셋팅을 읽지 않는 프로젝트의 것은 없어진 것이다. .claude.json을 읽지 못한 점검이어도 같다", () => {
    for (const gone of [[], [project({ exists: false, mcpJsonStatus: null })], [project({ excluded: true, mcpJsonStatus: null })]]) {
      const keep = unseenInUnreadablePlace(facts({ claudeJson: "unparsable", projects: gone, unreadableDirs: [join(app, ".claude", "skills")] }));
      expect([localServer, projectServer, projectSkill].map(keep)).toEqual([false, false, false]);
      expect(keep(userServer)).toBe(true);
    }
  });

  it("스킬 폴더의 목록을 읽지 못하면 그 폴더의 스킬이 그렇다", () => {
    expect([userSkill, projectSkill].map(unseenInUnreadablePlace(facts({ unreadableDirs: [join(home, "skills")] })))).toEqual([true, false]);
    expect([userSkill, projectSkill].map(unseenInUnreadablePlace(facts({ unreadableDirs: [join(app, ".claude", "skills")] })))).toEqual([false, true]);
  });

  it("구성을 모르는 플러그인(놓인 곳은 있다)의 스킬과 서버가 그렇다. 놓인 곳이 없거나 설치 기록에서 사라진 플러그인의 것은 없어진 것이다", () => {
    const unknown = unseenInUnreadablePlace(facts({ plugins: [plugin({ compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }));
    expect([pluginSkill, pluginServer, userSkill].map(unknown)).toEqual([true, true, false]);
    const noFolder = unseenInUnreadablePlace(facts({ plugins: [plugin({ exists: false, installRealPath: null, compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }));
    expect([pluginSkill, pluginServer].map(noFolder)).toEqual([false, false]);
    expect([pluginSkill, pluginServer].map(unseenInUnreadablePlace(facts({ plugins: [] })))).toEqual([false, false]);
  });

  it("구성은 아는데 MCP 정의를 읽지 못한 플러그인은 서버만 그렇다. 스킬을 찾는 폴더의 목록을 읽지 못하면 그 안의 스킬이 그렇다", () => {
    const mcp = unseenInUnreadablePlace(facts({ plugins: [plugin({ mcpUnreadable: true })] }));
    expect([pluginServer, pluginSkill].map(mcp)).toEqual([true, false]);
    const dir = unseenInUnreadablePlace(facts({ plugins: [plugin({})], unreadableDirs: [join(home, "plugins", "cache", "m", "p", "1", "skills")] }));
    expect([pluginSkill, pluginServer].map(dir)).toEqual([true, false]);
  });

  it("링크로 건 플러그인의 스킬을 찾는 폴더를 읽지 못하면, 링크의 표기로 적힌 그 폴더를 놓인 곳의 실제 경로로 옮겨 견준다", () => {
    const link = join(app, "links", "p");
    const linked = plugin({ installPath: link, installRealPath: norm(join(home, "plugins", "cache", "m", "p", "1")) });
    const dir = unseenInUnreadablePlace(facts({ plugins: [linked], unreadableDirs: [join(link, "skills")] }));
    expect([pluginSkill, pluginServer].map(dir)).toEqual([true, false]);
    // 읽지 못한 폴더 밖에 있는 그 플러그인의 스킬(매니페스트가 가리킨 다른 폴더의 것)은 아니다
    const elsewhere = skillInstallKey(skill({ scope: "plugin", name: "p:b", pluginId: "p@m", realPath: norm(join(home, "plugins", "cache", "m", "p", "1", "extra", "b")) }));
    expect(dir(elsewhere)).toBe(false);
    // 놓인 곳의 실제 경로를 모르는 플러그인은 옮겨 견줄 수 없다
    const unknownReal = unseenInUnreadablePlace(facts({ plugins: [plugin({ installPath: link, installRealPath: null })], unreadableDirs: [join(link, "skills")] }));
    expect(unknownReal(pluginSkill)).toBe(false);
  });

  it("이름의 앞부분이 같은 옆 폴더는 그 플러그인의 놓인 곳 안이 아니다", () => {
    const sibling = skillInstallKey(skill({ scope: "plugin", name: "p2:a", realPath: norm(join(home, "plugins", "cache", "m", "p", "10", "skills", "a")) }));
    expect(unseenInUnreadablePlace(facts({ plugins: [plugin({ compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }))(sibling)).toBe(false);
  });

  it("같은 설치 ID로 놓인 곳이 여럿이면 하나라도 읽지 못한 것이면 그 서버가 그렇다", () => {
    const two = [plugin({}), plugin({ installPath: join(app, "p"), installRealPath: norm(join(app, "p")), mcpUnreadable: true })];
    expect(unseenInUnreadablePlace(facts({ plugins: two }))(pluginServer)).toBe(true);
  });

  it("설치 기록 파일을 읽지 못한 점검에서는 플러그인의 스킬과 서버를 모두 남긴다. 파일이 없는 것은 읽지 못한 것이 아니다", () => {
    for (const status of ["unparsable", "unreadable"] as const) {
      const keep = unseenInUnreadablePlace(facts({ pluginsFile: status }));
      expect([pluginSkill, pluginServer, userSkill, userServer].map(keep)).toEqual([true, true, false, false]);
    }
    expect([pluginSkill, pluginServer].map(unseenInUnreadablePlace(facts({ pluginsFile: "missing" })))).toEqual([false, false]);
  });

  it("모양이 다른 열쇠는 남기지 않는다", () => {
    const keep = unseenInUnreadablePlace(facts({ claudeJson: "unparsable", pluginsFile: "unparsable", unreadableDirs: [join(home, "skills")] }));
    expect(["not json", "[]", JSON.stringify(["skill", "codex", "user", "", "a", "/x"]), JSON.stringify(["mcp", "claude-code", "user"]), JSON.stringify({ a: 1 })].map(keep)).toEqual([false, false, false, false, false]);
  });
});
```

`test/state/state.test.ts`(찾을 곳):

```ts
    ]);
  });
});
```

`test/state/state.test.ts`(바꾼 뒤):

```ts
    ]);
  });

  it("읽지 못한 곳에 든 보이지 않는 설치의 기록은 고치지 않는다. 첫날과 새로 나타남 표시가 그대로 남는다(설계 18.1)", () => {
    const previous = [
      { key: B, firstSeen: "2026-10-01", appeared: true },
      { key: A, firstSeen: "2026-09-01", appeared: false },
    ];
    // B가 든 곳만 읽지 못했다. A는 든 곳을 읽었는데 보이지 않으므로 지운다
    expect(updateInstalls(previous, [], "2026-11-13", (key) => key === B)).toEqual([{ key: B, firstSeen: "2026-10-01", appeared: true }]);
  });

  it("남겨 둔 기록은 그 곳이 다시 읽힌 점검에서 평소대로 견준다", () => {
    const kept = updateInstalls([{ key: B, firstSeen: "2026-10-01", appeared: false }], [], "2026-11-01", () => true);
    // 같은 정체로 있으면 첫날이 이어지고, 없으면 그때 지운다
    expect(updateInstalls(kept, [B], "2026-11-16")).toEqual([{ key: B, firstSeen: "2026-10-01", appeared: false }]);
    expect(updateInstalls(kept, [], "2026-11-16")).toEqual([]);
  });

  it("이번에 보인 설치는 남길지를 묻지 않는다. 첫 점검에는 남길 기록이 없다", () => {
    const asked: string[] = [];
    const keep = (key: string): boolean => {
      asked.push(key);
      return true;
    };
    expect(updateInstalls([{ key: A, firstSeen: "2026-10-01", appeared: false }], [A, B], "2026-11-13", keep)).toHaveLength(2);
    expect(updateInstalls(null, [A], "2026-11-13", keep)).toEqual([{ key: A, firstSeen: "2026-11-13", appeared: false }]);
    expect(asked).toEqual([]);
  });

  it("남긴 기록과 이번에 본 기록을 함께 열쇠 차례로 낸다", () => {
    const previous = [{ key: A, firstSeen: "2026-09-01", appeared: false }];
    expect(updateInstalls(previous, [B], "2026-11-13", () => true)).toEqual([
      { key: B, firstSeen: "2026-11-13", appeared: true },
      { key: A, firstSeen: "2026-09-01", appeared: false },
    ]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/identity.test.ts test/state/state.test.ts`
Expected: FAIL. `unseenInUnreadablePlace`가 `src/scan/identity.ts`에 없고, `updateInstalls`가 넷째 인자를 보지 않아 읽지 못한 곳의 기록을 지운다.

- [ ] **Step 3: 구현한다**

`src/scan/identity.ts`(찾을 곳 1/2):

```ts
// 셋팅 사실에서 설치마다의 정체 열쇠를 만든다. 스킬은 (도구, 범위, 프로젝트, 이름, 링크를 푼 실제 경로), MCP 서버는 (도구, 범위, 프로젝트, 플러그인, 이름, 정의의 지문)이다. 정의의 지문이 없는 서버는 정체를 만들 수 없어 넣지 않는다(설계 11.3, 18.1)
import { normalizePath } from "../adapters/claude/locate.ts";
import { installKey } from "../state/observations.ts";
import type { ClaudeSetupFacts, McpFact, SkillFact } from "./types.ts";

export function skillInstallKey(skill: SkillFact): string {
```

`src/scan/identity.ts`(바꾼 뒤 1/2):

```ts
// 셋팅 사실에서 설치마다의 정체 열쇠를 만든다. 스킬은 (도구, 범위, 프로젝트, 이름, 링크를 푼 실제 경로), MCP 서버는 (도구, 범위, 프로젝트, 플러그인, 이름, 정의의 지문)이다. 정의의 지문이 없는 서버는 정체를 만들 수 없어 넣지 않는다(설계 11.3, 18.1)
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { installKey } from "../state/observations.ts";
import type { ClaudeSetupFacts, FileStatus, McpFact, SkillFact } from "./types.ts";

export function skillInstallKey(skill: SkillFact): string {
```

`src/scan/identity.ts`(찾을 곳 2/2):

```ts
  return [...new Set(keys)].sort();
}
```

`src/scan/identity.ts`(바꾼 뒤 2/2):

```ts
  return [...new Set(keys)].sort();
}

/** 있는데 열지 못했거나 열었는데 풀리지 않았다. 없는 것(missing)은 읽지 못한 것이 아니다. */
const unread = (status: FileStatus | null | undefined): boolean => status === "unparsable" || status === "unreadable";
/** path가 base 자신이거나 그 아래다. 이름의 앞부분이 같은 옆 폴더는 밖이다. 둘 다 정규화한 경로다. */
const inside = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);

/**
 * 관측 기록에만 있고 이번 점검에 보이지 않는 설치가 "읽지 못한 곳에 든 것"인지 가르는 함수를 만든다(설계 18.1 「읽지 못한 곳」).
 * 참이면 그 기록을 고치지 않는다(updateInstalls의 keepUnseen). 읽지 못했다고 확인되지 않으면 거짓이다. 지우는 쪽이 미루는 쪽이다.
 * - 사용자·로컬 범위 서버: .claude.json이 풀리지 않거나 열 수 없었다.
 * - 프로젝트 범위 서버: 그 프로젝트의 .mcp.json이 풀리지 않거나 열 수 없었다.
 * - 사용자·프로젝트 스킬: 그 스킬 폴더의 목록을 읽지 못했다.
 * - 플러그인 서버: 그 플러그인이 놓인 곳은 있는데 구성을 모르거나 MCP 정의를 읽지 못했다(같은 ID의 놓인 곳 가운데 하나라도).
 * - 플러그인 스킬: 실제 경로가 구성을 모르는 플러그인의 놓인 곳 안이거나, 목록을 읽지 못한 폴더 안이다.
 * - 플러그인의 것 모두: 설치 기록 파일이 풀리지 않거나 열 수 없었다.
 * 스캐너가 셋팅을 읽지 않는 프로젝트(지금 PC에 없다, 목록에서 빠졌다, 프로젝트로 보지 않는 폴더다)의 것은 없어진 것이라 거짓이다.
 * 스킬의 열쇠에는 실제 경로가 들어 있다. 링크로 건 플러그인의 읽지 못한 폴더는 링크의 표기로 적혀 있으므로, 놓인 곳의 실제 경로로 옮긴 꼴로도 견준다.
 * 놓인 곳 안쪽의 폴더가 다시 링크이면 그 실제 경로는 알 수 없어서 견주지 못한다(읽지 못했으므로 풀 수도 없다).
 */
export function unseenInUnreadablePlace(facts: ClaudeSetupFacts): (key: string) => boolean {
  const unreadableDirs = facts.unreadableDirs.map((dir) => normalizePath(dir));
  const linkedRoots = facts.plugins.flatMap((plugin) => {
    const shown = normalizePath(plugin.installPath);
    return plugin.installRealPath === null || plugin.installRealPath === shown ? [] : [{ shown, real: plugin.installRealPath }];
  });
  const unreadablePluginDirs = unreadableDirs.flatMap((dir) => [dir, ...linkedRoots.filter((root) => inside(dir, root.shown)).map((root) => `${root.real}${dir.slice(root.shown.length)}`)]);
  const userSkillsDir = normalizePath(join(facts.home, "skills"));
  const scanned = new Map(facts.projects.filter((project) => project.exists && !project.excluded).map((project) => [project.normRoot, project]));
  const claudeJsonUnread = unread(facts.claudeJson);
  const pluginsFileUnread = unread(facts.pluginsFile);
  const unknownPluginRoots = facts.plugins.filter((plugin) => plugin.exists && !plugin.compositionKnown).map((plugin) => plugin.installRealPath ?? normalizePath(plugin.installPath));
  // 구성을 모르는 플러그인은 MCP 정의도 읽지 못한 것으로 적혀 있다(plugins.ts)
  const mcpUnreadPlugins = new Set(facts.plugins.filter((plugin) => plugin.exists && plugin.mcpUnreadable).map((plugin) => plugin.id));

  return (key) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(key);
    } catch {
      return false;
    }
    if (!Array.isArray(parsed) || !parsed.every((part): part is string => typeof part === "string") || parsed[1] !== "claude-code") return false;
    const scope = parsed[2] ?? "";
    const projectRoot = parsed[3] ?? "";
    if (parsed[0] === "skill" && parsed.length === 6) {
      const realPath = parsed[5] ?? "";
      if (scope === "user") return unreadableDirs.includes(userSkillsDir);
      if (scope === "project") {
        const project = scanned.get(projectRoot);
        return project !== undefined && unreadableDirs.includes(normalizePath(join(project.root, ".claude", "skills")));
      }
      if (scope === "plugin") return pluginsFileUnread || unknownPluginRoots.some((root) => inside(realPath, root)) || unreadablePluginDirs.some((dir) => inside(realPath, dir));
      return false;
    }
    if (parsed[0] === "mcp" && parsed.length === 7) {
      if (scope === "user") return claudeJsonUnread;
      if (scope === "local") return scanned.has(projectRoot) && claudeJsonUnread;
      if (scope === "project") return unread(scanned.get(projectRoot)?.mcpJsonStatus);
      if (scope === "plugin") return pluginsFileUnread || mcpUnreadPlugins.has(parsed[4] ?? "");
      return false;
    }
    return false;
  };
}
```

`src/state/observations.ts`(찾을 곳 1/3):

```ts
 * 정의를 읽지 못해 정체를 만들 수 없는 서버는 부르는 쪽이 넣지 않는다.
```

`src/state/observations.ts`(바꾼 뒤 1/3):

```ts
 * - 다만 그 설치가 든 곳을 이번 점검이 읽지 못했으면(keepUnseen이 참) 기록을 고치지 않는다. 지우지도 새로 적지도 않고,
 *   첫날과 "새로 나타남" 표시가 그대로 남는다. 그 곳이 다시 읽히는 점검에서 위 규칙으로 견준다. 읽지 못한 점검 한 번이
 *   깔린 채로 있는 설치의 관측 기간을 지우지 않게 하려는 것이다.
 * 정의를 읽지 못해 정체를 만들 수 없는 서버는 부르는 쪽이 넣지 않는다. 결과는 열쇠 차례다.
```

`src/state/observations.ts`(찾을 곳 2/3):

```ts
export function updateInstalls(previous: readonly InstallRecord[] | null, currentKeys: readonly string[], today: LocalDate): InstallRecord[] {
```

`src/state/observations.ts`(바꾼 뒤 2/3):

```ts
export function updateInstalls(
  previous: readonly InstallRecord[] | null,
  currentKeys: readonly string[],
  today: LocalDate,
  keepUnseen: (key: string) => boolean = () => false,
): InstallRecord[] {
```

`src/state/observations.ts`(찾을 곳 3/3):

```ts
  return [...new Set(currentKeys)]
    .sort()
    .map((key) => before.get(key) ?? { key, firstSeen: today, appeared: !firstCheckup });
```

`src/state/observations.ts`(바꾼 뒤 3/3):

```ts
  const current = new Set(currentKeys);
  const records: InstallRecord[] = [...current].map((key) => before.get(key) ?? { key, firstSeen: today, appeared: !firstCheckup });
  for (const record of previous ?? []) {
    if (!current.has(record.key) && keepUnseen(record.key)) records.push(record);
  }
  return records.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan test/state`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 14개, 시험 214개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/identity.test.ts test/state/state.test.ts src/scan/identity.ts src/state/observations.ts
git commit -m "feat: 읽지 못한 곳에 든 설치의 관측 기록 유지"
```

---

### Task 5: 도구 하나의 구간 합계

**Files:**
- Create: `src/core/order.ts`
- Create: `src/core/totals.ts`
- Test: `test/core/totals.test.ts`
- Test: `test/helpers/summaries.ts`

**Interfaces:**
- Consumes: 1단계의 `SessionSummary`, `DayCell`, `TokenCounts`, `emptyDay`, `emptyToolCounts`, `emptySkillSignalCounts`, `emptyHookCounts`(`src/adapters/types.ts`), `Windows`, `LocalDate`(`src/adapters/common/dates.ts`).
- Produces: `toolTotals(summaries: readonly SessionSummary[], windows: Windows, shellTools: readonly string[]): ToolTotals`, `instructionTokens(chars: { ascii: number; other: number } | null): number | null`, `ToolTotals`, `MainSessionTotals`(`src/core/totals.ts`). `byContent(a: unknown, b: unknown): number`(`src/core/order.ts`. 과제 15와 16도 쓴다). 시험 도우미 `summary(input?: SummaryInput): SessionSummary`, `day(input?: DayInput): DayCell`(`test/helpers/summaries.ts`). 뒤의 모든 지표 과제가 쓴다.

`src/core/`의 첫 파일이다. core는 순수하다(설계 7.2). 파일을 열지 않고 시계를 직접 읽지 않으며 Node.js 모듈을 값으로 가져오지 않는다. 타입만 가져오는 것은 된다. 과제 20의 순수성 검사가 이것을 지킨다.

`toolTotals`는 도구 하나의 세션 요약을 점수 구간으로 잘라 더한다. 어느 숫자에 주 세션만 넣고 어느 숫자에 하위 세션을 합치는지는 설계 9.2의 표를 따른다.

| 숫자 | 넣는 세션 |
|---|---|
| 응답, 토큰, 도구 호출과 결과와 오류, 거절, 끊은 턴, 길이 제한으로 끊긴 응답, 추론 강도, 훅, 사용한 날 | 주 세션과 하위 세션 |
| 사람 요청 | 주 세션 |
| `mainSessions`(자동 압축, 하위 에이전트 호출, MCP 연결 실패, 지침의 어림 토큰) | 점수 구간에 응답이 있는 주 세션 |

- `responses`는 점수 구간의 응답 수다. 0이면 점수에 넣는 도구가 아니다. `collectResponses`는 수집 구간의 응답 수이고 0보다 크면 달력에 넣는 도구다(설계 9.3).
- 셸 명령 도구의 이름은 도구마다 달라서 인자로 받는다. 셸 명령의 결과와 오류는 E2에서 빼고(`nonShellResults`, `nonShellErrors`), 호출은 I3에 넣는다(`toolCalls`).
- `denied`는 사람이 거절한 것, 훅이 막은 것, 권한 검사가 막은 것을 더한 것이다. 끊겨서 끝난 결과와 모르는 거절 표시는 넣지 않는다(설계 11.3 E7).
- 지침의 어림 토큰은 ASCII 4글자를 1토큰, 그 밖의 글자 1글자를 1토큰으로 센다. 첨부가 남지 않았거나 글자가 없으면 `null`이다. 0으로 넣지 않는다(설계 11.3 「E4의 표본」).
- 결과가 입력의 차례에 달리지 않게 `mainSessions`는 세션 ID 차례, `efforts`는 이름 차례, `activeDates`는 날짜 차례로 낸다(설계 12.2).
- **차례는 끝까지 정한다**(`byContent`). 견주는 열쇠가 모두 같은 둘이 있으면 정렬이 넣은 차례를 그대로 남긴다. 그래서 마지막에는 둘을 통째로 글로 바꿔(`JSON.stringify`) 글자 차례로 견준다. 글까지 같으면 내용이 같은 것이라 어느 쪽이 앞이어도 결과가 같다. 세션 ID가 같은 요약 둘이 그런 경우다(같은 ID의 기록 파일이 두 폴더에 있을 때). 스킬 위치(과제 15)와 서버(과제 16)의 차례도 같은 것으로 끝낸다.

시험의 평가 시계는 2026-11-13 12:00(서울)이다. 점수 구간은 10-15부터 11-13까지, 수집 구간은 10-10부터다. 뒤 과제의 시험도 같은 시계를 쓴다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/totals.test.ts`(새 파일):

```ts
// 구간 합계를 시험한다. 점수 구간의 칸만 더하고, 어느 숫자에 주 세션만 넣고 어느 숫자에 하위 세션을 합치는지를 본다(설계 9.2, 9.3)
import { describe, expect, it } from "vitest";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { instructionTokens, toolTotals } from "../../src/core/totals.ts";
import { summary } from "../helpers/summaries.ts";

// 2026-11-13 12:00(서울). 점수 구간은 10-15부터 11-13까지, 수집 구간은 10-10부터다
const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const SHELL = ["Bash", "PowerShell"];

describe("toolTotals", () => {
  it("점수 구간의 칸만 더한다. 수집 구간에만 든 날은 달력 쪽 응답 수에만 든다", () => {
    const totals = toolTotals(
      [
        summary({
          days: {
            "2026-10-09": { responses: 100, humanRequests: 50 },
            "2026-10-12": { responses: 7, humanRequests: 3 },
            "2026-10-15": { responses: 2, humanRequests: 1, tokens: { input: 10, cacheRead: 30, cacheWrite: 5, output: 4 } },
            "2026-11-13": { responses: 3, humanRequests: 2, tokens: { input: 1, cacheRead: 2, cacheWrite: 3, output: 4 } },
          },
        }),
      ],
      windows,
      SHELL,
    );
    expect(totals.responses).toBe(5);
    expect(totals.collectResponses).toBe(12);
    expect(totals.humanRequests).toBe(3);
    expect(totals.tokens).toEqual({ input: 11, cacheRead: 32, cacheWrite: 8, output: 8, thinking: 0 });
    expect(totals.activeDates).toEqual(["2026-10-15", "2026-11-13"]);
  });

  it("응답·토큰·도구·강도·훅·멈춘 일은 주 세션과 하위 세션을 합치고, 사람 요청은 주 세션만 센다", () => {
    const main = summary({
      sessionId: "m",
      days: {
        "2026-11-10": {
          responses: 4,
          humanRequests: 2,
          efforts: { xhigh: 3, weird: 1 },
          unknownEffort: 1,
          lengthStops: 1,
          interruptedTurns: 1,
          tools: { Read: { calls: 5, results: 5, errors: 1 } },
          hooks: { PreToolUse: { runs: 10, failures: 1, unclassifiedBlocks: 2 } },
        },
      },
    });
    const sub = summary({
      sessionId: "m-sub",
      kind: "sub",
      parentSessionId: "m",
      days: {
        "2026-11-11": {
          responses: 6,
          humanRequests: 9,
          efforts: { xhigh: 1, low: 2 },
          lengthStops: 2,
          interruptedTurns: 3,
          tools: { Read: { calls: 2, results: 2 }, Grep: { calls: 1, results: 1, errors: 1 } },
          hooks: { PostToolUse: { runs: 5, failures: 2 } },
        },
      },
    });
    const totals = toolTotals([sub, main], windows, SHELL);
    expect(totals.responses).toBe(10);
    expect(totals.humanRequests).toBe(2);
    expect(totals.toolCalls).toBe(8);
    expect(totals.efforts).toEqual({ low: 2, weird: 1, xhigh: 4 });
    expect(totals.unknownEffort).toBe(1);
    expect(totals.lengthStops).toBe(3);
    expect(totals.interruptedTurns).toBe(4);
    expect({ runs: totals.hookRuns, failures: totals.hookFailures, unclassified: totals.hookUnclassified }).toEqual({ runs: 15, failures: 3, unclassified: 2 });
    expect(totals.activeDates).toEqual(["2026-11-10", "2026-11-11"]);
    // 주 세션의 줄은 주 세션만이다
    expect(totals.mainSessions.map((s) => s.sessionId)).toEqual(["m"]);
  });

  it("도구 오류의 재료에서 셸 명령을 뺀다. 거절은 종류를 합쳐 모든 도구에서 센다", () => {
    const totals = toolTotals(
      [
        summary({
          days: {
            "2026-11-01": {
              responses: 1,
              tools: {
                Bash: { calls: 10, results: 8, errors: 6, deniedByUser: 1, deniedByHook: 1 },
                PowerShell: { calls: 2, results: 2, errors: 2 },
                Edit: { calls: 5, results: 3, errors: 1, deniedByPermission: 1, interrupted: 1 },
                mcp__ctx__search: { calls: 4, results: 4, errors: 2, unknownDenial: 3 },
              },
            },
          },
        }),
      ],
      windows,
      SHELL,
    );
    expect(totals.toolCalls).toBe(21);
    expect(totals.nonShellResults).toBe(7);
    expect(totals.nonShellErrors).toBe(3);
    // 끊겨서 끝난 결과와 모르는 거절 표시는 거절로 세지 않는다(설계 11.3 E7)
    expect(totals.denied).toBe(3);
  });

  it("주 세션의 줄은 점수 구간에 응답이 있는 주 세션마다 하나다. 압축과 하위 에이전트 호출은 점수 구간의 칸만 더하고, 연결 실패는 그 구간에 하루라도 있었는지다", () => {
    const totals = toolTotals(
      [
        summary({
          sessionId: "b",
          cwd: "/work/b",
          days: {
            "2026-10-12": { responses: 1, autoCompactions: 5, subagentCalls: 5, mcpConnectionFailure: true },
            "2026-10-20": { responses: 2, autoCompactions: 1 },
            "2026-10-21": { responses: 1, autoCompactions: 2, subagentCalls: 1 },
          },
        }),
        summary({ sessionId: "a", cwd: null, days: { "2026-11-12": { responses: 1, mcpConnectionFailure: true } } }),
        // 점수 구간에 응답이 없는 주 세션과, 응답 없이 요청만 있는 주 세션은 들지 않는다
        summary({ sessionId: "old", days: { "2026-10-11": { responses: 9 } } }),
        summary({ sessionId: "quiet", days: { "2026-11-12": { humanRequests: 1 } } }),
      ],
      windows,
      SHELL,
    );
    expect(totals.mainSessions).toEqual([
      { sessionId: "a", cwd: null, autoCompactions: 0, subagentCalls: 0, mcpConnectionFailure: true, instructionTokens: null },
      { sessionId: "b", cwd: "/work/b", autoCompactions: 3, subagentCalls: 1, mcpConnectionFailure: false, instructionTokens: null },
    ]);
    // 응답이 없는 세션의 사람 요청도 점수 구간의 것이면 센다
    expect(totals.humanRequests).toBe(1);
  });

  it("요약의 차례를 섞어도 결과가 같다", () => {
    const list = [
      summary({ sessionId: "x", days: { "2026-11-02": { responses: 1, efforts: { high: 1 } } } }),
      summary({ sessionId: "y", days: { "2026-11-01": { responses: 2, efforts: { low: 1 } } } }),
      summary({ sessionId: "z", kind: "sub", days: { "2026-11-03": { responses: 3 } } }),
    ];
    expect(JSON.stringify(toolTotals([...list].reverse(), windows, SHELL))).toBe(JSON.stringify(toolTotals(list, windows, SHELL)));
  });
  it("세션 ID가 같은 주 세션 요약이 둘이어도 차례가 넣은 차례에 기대지 않는다", () => {
    // 같은 ID의 기록 파일이 두 폴더에 있으면 요약이 둘 온다. 주 세션의 줄은 둘 다 남기고 내용으로 차례를 정한다
    const list = [
      summary({ sessionId: "same", cwd: "/work/a", days: { "2026-11-02": { responses: 1, autoCompactions: 2 } } }),
      summary({ sessionId: "same", cwd: "/work/b", days: { "2026-11-03": { responses: 4 } } }),
    ];
    const totals = toolTotals(list, windows, SHELL);
    expect(totals.mainSessions.map((s) => s.sessionId)).toEqual(["same", "same"]);
    expect(JSON.stringify(toolTotals([...list].reverse(), windows, SHELL))).toBe(JSON.stringify(totals));
  });
});

describe("instructionTokens", () => {
  it("ASCII 글자는 4글자를 1토큰으로, 그 밖의 글자는 1글자를 1토큰으로 어림한다", () => {
    expect(instructionTokens({ ascii: 400, other: 250 })).toBe(350);
    expect(instructionTokens({ ascii: 3, other: 0 })).toBe(0.75);
  });
  it("지침 첨부가 남지 않았거나 글자가 없으면 표본이 아니다", () => {
    expect(instructionTokens(null)).toBeNull();
    expect(instructionTokens({ ascii: 0, other: 0 })).toBeNull();
  });
  it("주 세션의 줄에 어림 토큰을 싣는다", () => {
    const totals = toolTotals([summary({ sessionId: "i", instructionChars: { ascii: 8000, other: 1000 }, days: { "2026-11-05": { responses: 1 } } })], windows, SHELL);
    expect(totals.mainSessions[0]!.instructionTokens).toBe(3000);
  });
});
```

`test/helpers/summaries.ts`(새 파일):

```ts
// 시험에서 날짜별 세션 요약을 손으로 짓는 도구. 적지 않은 숫자는 0이고 적지 않은 목록은 비어 있다
import { emptyDay, emptyHookCounts, emptySkillSignalCounts, emptyToolCounts, type DayCell, type HookCounts, type SessionSummary, type SkillSignalCounts, type ToolCounts } from "../../src/adapters/types.ts";

export type DayInput = Partial<Omit<DayCell, "tokens" | "tools" | "skillSignals" | "hooks">> & {
  tokens?: Partial<DayCell["tokens"]>;
  tools?: Record<string, Partial<ToolCounts>>;
  skillSignals?: Record<string, Partial<SkillSignalCounts>>;
  hooks?: Record<string, Partial<HookCounts>>;
};

export function day(input: DayInput = {}): DayCell {
  const { tokens, tools, skillSignals, hooks, ...rest } = input;
  const cell = { ...emptyDay(), ...rest };
  cell.tokens = { ...cell.tokens, ...tokens };
  for (const [name, counts] of Object.entries(tools ?? {})) cell.tools[name] = { ...emptyToolCounts(), ...counts };
  for (const [name, counts] of Object.entries(skillSignals ?? {})) cell.skillSignals[name] = { ...emptySkillSignalCounts(), ...counts };
  for (const [name, counts] of Object.entries(hooks ?? {})) cell.hooks[name] = { ...emptyHookCounts(), ...counts };
  return cell;
}

let nextId = 0;

export type SummaryInput = Partial<Omit<SessionSummary, "days">> & { days?: Record<string, DayInput> };

/** 세션 요약 하나. sessionId를 주지 않으면 부를 때마다 다른 ID를 붙인다. 날짜 칸의 가장 이른 날이 firstDate다. */
export function summary(input: SummaryInput = {}): SessionSummary {
  const { days, ...rest } = input;
  const cells: SessionSummary["days"] = {};
  for (const date of Object.keys(days ?? {}).sort()) cells[date] = day(days![date]);
  return {
    tool: "claude-code",
    sessionId: `s${++nextId}`,
    kind: "main",
    parentSessionId: null,
    cwd: "/work/app",
    version: "2.1.300",
    firstDate: Object.keys(cells)[0] ?? null,
    days: cells,
    instructionChars: null,
    initialSkills: null,
    initialMcpServers: null,
    missing: { lines: 0, brokenLines: 0, tailFragments: 0, tooLongLines: 0, unconfirmedTypes: {} },
    firstResponseIdHashes: [],
    notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: 0, unknownHookKinds: {} },
    ...rest,
  };
}
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/totals.test.ts`
Expected: FAIL. `../../src/core/totals.ts`를 찾지 못한다(파일이 아직 없다).

- [ ] **Step 3: 구현한다**

`src/core/order.ts`(새 파일):

```ts
// 목록의 차례를 끝까지 정하는 데 쓴다. 같은 입력 묶음이면 넣은 차례와 상관없이 결과의 차례가 같아야 한다(순수 함수, 설계 12.2 「차례가 끝까지 정해져 있다」)

/**
 * 앞의 견줌이 모두 같을 때 마지막으로 쓴다. 둘을 통째로 글로 바꿔 글자 차례로 견준다.
 * 글까지 같으면 내용이 같은 것이라 어느 쪽이 앞이어도 결과가 같다.
 * 이름과 경로가 같아도 내용이 다른 사실이 올 수 있어서 둔다. 스캐너가 같은 설치를 두 길로 찾으면 켜짐만 다른 사실 둘을 낸다.
 */
export function byContent(a: unknown, b: unknown): number {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
```

`src/core/totals.ts`(새 파일):

```ts
// 도구 하나의 날짜별 세션 요약을 점수 구간으로 잘라 더한다(순수 함수, 설계 9.2, 9.3). 어느 숫자에 주 세션만 넣고 어느 숫자에 하위 세션을 합치는지는 9.2절의 표를 따른다
import type { LocalDate, Windows } from "../adapters/common/dates.ts";
import type { SessionSummary, TokenCounts } from "../adapters/types.ts";
import { byContent } from "./order.ts";

/** 점수 구간에 응답이 있는 주 세션 하나의 숫자. 세션을 단위로 따지는 규칙(E3, E4, S5, F2)과 프로젝트를 세는 규칙(F3, I4)이 쓴다 */
export interface MainSessionTotals {
  sessionId: string;
  /** 세션의 작업 폴더(기록에 처음 적힌 것). 없으면 null */
  cwd: string | null;
  autoCompactions: number;
  subagentCalls: number;
  /** 점수 구간에 연결 실패가 있었던 날이 하루라도 있다 */
  mcpConnectionFailure: boolean;
  /** 세션에서 처음 실린 지침의 어림 토큰. 지침 첨부가 남지 않았거나 글자가 없으면 null(E4의 표본이 아니다) */
  instructionTokens: number | null;
}

export interface ToolTotals {
  /** 점수 구간의 응답 수. 0이면 점수에 넣는 도구가 아니다(설계 9.3) */
  responses: number;
  /** 수집 구간의 응답 수. 0보다 크면 달력에 넣는 도구다 */
  collectResponses: number;
  tokens: TokenCounts;
  /** 사람 요청. 주 세션만 센다 */
  humanRequests: number;
  /** 모든 종류의 도구 호출. 셸 명령을 넣는다(I3) */
  toolCalls: number;
  /** 셸 명령을 뺀 도구 결과와 그 가운데 오류. 거절되거나 끊겨서 끝난 것은 처음부터 결과에 들지 않는다(E2) */
  nonShellResults: number;
  nonShellErrors: number;
  /** 거절한 도구 실행. 사람이 거절한 것, 훅이 막은 것, 권한 검사가 막은 것을 더한다(E7) */
  denied: number;
  interruptedTurns: number;
  lengthStops: number;
  /** 추론 강도별 응답 수(이름 차례) */
  efforts: Record<string, number>;
  unknownEffort: number;
  hookRuns: number;
  hookFailures: number;
  /** 일부러 막은 것인지 실패해서 막힌 것인지 가릴 수 없는 막음. 실행에도 실패에도 넣지 않았다(S4) */
  hookUnclassified: number;
  /** 점수 구간에서 응답이 있었던 날(오래된 날부터) */
  activeDates: LocalDate[];
  /** 점수 구간에 응답이 있는 주 세션(세션 ID 차례) */
  mainSessions: MainSessionTotals[];
}

/** ASCII 글자는 4글자를 1토큰으로, 그 밖의 글자는 1글자를 1토큰으로 어림한다. 글자가 없으면 표본이 아니라서 null이다(설계 11.3 E4). */
export function instructionTokens(chars: { ascii: number; other: number } | null): number | null {
  if (chars === null || chars.ascii + chars.other <= 0) return null;
  return chars.ascii / 4 + chars.other;
}

export function toolTotals(summaries: readonly SessionSummary[], windows: Windows, shellTools: readonly string[]): ToolTotals {
  const score = new Set(windows.scoreDates);
  const collect = new Set(windows.collectDates);
  const shell = new Set(shellTools);
  const totals: ToolTotals = {
    responses: 0,
    collectResponses: 0,
    tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 },
    humanRequests: 0,
    toolCalls: 0,
    nonShellResults: 0,
    nonShellErrors: 0,
    denied: 0,
    interruptedTurns: 0,
    lengthStops: 0,
    efforts: {},
    unknownEffort: 0,
    hookRuns: 0,
    hookFailures: 0,
    hookUnclassified: 0,
    activeDates: [],
    mainSessions: [],
  };
  const efforts = new Map<string, number>();
  const active = new Set<LocalDate>();

  for (const summary of summaries) {
    const session: MainSessionTotals = {
      sessionId: summary.sessionId,
      cwd: summary.cwd,
      autoCompactions: 0,
      subagentCalls: 0,
      mcpConnectionFailure: false,
      instructionTokens: instructionTokens(summary.instructionChars),
    };
    let sessionResponses = 0;
    for (const [date, cell] of Object.entries(summary.days)) {
      if (collect.has(date)) totals.collectResponses += cell.responses;
      if (!score.has(date)) continue;
      totals.responses += cell.responses;
      sessionResponses += cell.responses;
      if (cell.responses > 0) active.add(date);
      totals.tokens.input += cell.tokens.input;
      totals.tokens.cacheRead += cell.tokens.cacheRead;
      totals.tokens.cacheWrite += cell.tokens.cacheWrite;
      totals.tokens.output += cell.tokens.output;
      totals.tokens.thinking += cell.tokens.thinking;
      if (summary.kind === "main") totals.humanRequests += cell.humanRequests;
      for (const [name, counts] of Object.entries(cell.tools)) {
        totals.toolCalls += counts.calls;
        totals.denied += counts.deniedByUser + counts.deniedByHook + counts.deniedByPermission;
        if (shell.has(name)) continue;
        totals.nonShellResults += counts.results;
        totals.nonShellErrors += counts.errors;
      }
      totals.interruptedTurns += cell.interruptedTurns;
      totals.lengthStops += cell.lengthStops;
      for (const [name, count] of Object.entries(cell.efforts)) efforts.set(name, (efforts.get(name) ?? 0) + count);
      totals.unknownEffort += cell.unknownEffort;
      for (const counts of Object.values(cell.hooks)) {
        totals.hookRuns += counts.runs;
        totals.hookFailures += counts.failures;
        totals.hookUnclassified += counts.unclassifiedBlocks;
      }
      session.autoCompactions += cell.autoCompactions;
      session.subagentCalls += cell.subagentCalls;
      if (cell.mcpConnectionFailure) session.mcpConnectionFailure = true;
    }
    if (summary.kind === "main" && sessionResponses > 0) totals.mainSessions.push(session);
  }

  for (const name of [...efforts.keys()].sort()) totals.efforts[name] = efforts.get(name)!;
  totals.activeDates = [...active].sort();
  // 세션 ID가 같은 요약이 둘 올 수 있다(같은 ID의 기록 파일이 두 폴더에 있을 때). 그때도 차례가 넣은 차례에 기대지 않게 내용까지 견준다
  totals.mainSessions.sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0) || byContent(a, b));
  return totals;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 9개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/totals.test.ts test/helpers/summaries.ts src/core/order.ts src/core/totals.ts
git commit -m "feat: 도구별 구간 합계 계산 추가"
```

---

### Task 6: 규칙 표, 규칙 점수, 반올림과 등급, 못 재는 이유의 차례

**Files:**
- Create: `src/core/reasons.ts`
- Create: `src/core/rules.ts`
- Create: `src/core/score.ts`
- Test: `test/core/rules.test.ts`

**Interfaces:**
- Consumes: 없다.
- Produces: `RULES: readonly RuleSpec[]`(스물둘, 규칙 표의 차례), `RULES_VERSION = "1.0.0"`, `ruleSpec(id: RuleId): RuleSpec`, `RuleId`, `Axis`, `ValueKind`, `RuleSpec { id, axis, kind, zeroAt, fullAt, weight, unit: "merged" | "perTool", tunable }`(`src/core/rules.ts`). `settleScore(value: number): number`, `ruleScore(value: number, zeroAt: number, fullAt: number): number`, `roundHalfUp(value: number): number`, `gradeOf(aq: number): { grade: Grade; tier: 1 | 2 | 3 | 4 | 5 }`(`src/core/score.ts`). `REASONS`, `Reason`, `firstReason(reasons: readonly Reason[]): Reason`, `ruleReason(toolReasons: readonly Reason[]): Reason`(`src/core/reasons.ts`).

설계 11.3의 규칙 표를 자료로 둔다. 기준값(0점 기준과 만점 기준)과 무게는 표의 값 그대로다. 기준값을 고치면 `RULES_VERSION`을 올린다.

- **규칙 점수.** 잰 값이 0점 기준과 만점 기준 사이에 있으면 직선으로 잇고 바깥이면 0이나 1이다. 낮을수록 좋은 규칙은 0점 기준이 더 큰 값이다. 잰 값은 자르지 않는다(설계 11.3).
- **경계와 견줄 때의 맞춤**(`settleScore`). 규칙 점수를 분류와 심각도의 경계(0.8, 0.6, 0.3, 1)와 견줄 때에는 소수 열두째 자리에서 맞춘 값으로 견준다(과제 18이 쓴다). 맞추지 않으면 나눗셈의 끝자리 오차가 경계의 어느 쪽인지를 바꾼다. 캐시 읽기가 0.82인 E1의 점수는 수학으로 0.8인데 `(0.82 - 0.5) / 0.4`는 `0.7999999999999998`로 계산돼서, 잘하고 있는 것(0.8 이상)이 보통으로 떨어진다.
  - **점수 자체는 맞추지 않는다.** `ruleScore`는 계산한 값을 그대로 낸다. 기준 점수와 예상 효과도 그 값으로 계산한다. 맞춘 값을 다음 계산에 넣으면 어느 자리에서 맞추든 깎인 만큼의 차이가 다음 반올림의 문턱을 넘길 수 있다. 아홉째 자리에서 맞춰 쓰면 점수 1/3(무게 3)과 0.2625(무게 2)로 된 기준이 31에서 30이 되고, 열두째 자리에서 맞춰 쓰면 캐시 읽기 19468/30001과 도구 오류 6370/66197로 된 기준이 30에서 31이 된다. 이 계획은 리뷰에서 두 번 다 그렇게 틀렸다. 과제 18에 두 반례의 시험이 있다.
  - 자리는 열두째다. 아홉째 자리로 견주면 경계에 100억 분의 1만큼 못 미치는 점수까지 경계로 올린다. 그만큼 가까운 값은 분모가 1억쯤이면 나온다(토큰 수가 그렇다).
  - 잰 값도 맞추지 않는다. 근거로 싣는 숫자다.
- **반올림.** 소수 아홉째 자리에서 한 번 맞춘 뒤 0.5는 올린다. 실행 환경에 따라 끝자리가 달라지지 않게 하려는 것이다(설계 11.4의 5).
- **등급.** S는 90 이상, A는 80, B는 65, C는 50, 그 아래는 D다. `tier`는 장면의 단계다(설계 11.6).
- **이유의 차례.** 한 도구 안에서 까닭이 여럿이면 `unsupported`, `unreadable`, `not_applicable`, `incomplete`, `no_data`, `too_little`, `watching`의 차례에서 처음 맞는 것을 낸다(`firstReason`). 도구별 규칙에서 재는 도구가 하나도 없으면 도구마다의 이유에서 하나를 고른다(`ruleReason`). 하거나 기다리면 풀리는 이유(`unreadable`, `incomplete`, `no_data`, `too_little`, `watching`)가 하나라도 있으면 그 가운데 가장 뒤의 것이고, 없으면 `unsupported`와 `not_applicable` 가운데 뒤의 것이다. 점수에 넣는 도구가 하나도 없으면 `no_data`다(설계 11.4의 1과 2).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/rules.test.ts`(새 파일):

```ts
// 규칙 표, 규칙 점수, 반올림과 등급, 못 재는 이유의 차례를 시험한다(설계 11.3, 11.4, 11.6, 21.1 「규칙」과 「점수」)
import { describe, expect, it } from "vitest";
import { firstReason, REASONS, ruleReason } from "../../src/core/reasons.ts";
import { RULES, RULES_VERSION, ruleSpec } from "../../src/core/rules.ts";
import { gradeOf, roundHalfUp, ruleScore, settleScore } from "../../src/core/score.ts";

describe("규칙 표", () => {
  it("규칙은 스물둘이고 기준마다 5, 7, 6, 4개다. 표의 차례가 화면의 차례다", () => {
    expect(RULES_VERSION).toBe("1.0.0");
    expect(RULES.map((rule) => rule.id)).toEqual([
      "S1", "S2", "S3", "S4", "S5",
      "E1", "E2", "E3", "E4", "E5", "E6", "E7",
      "F1", "F2", "F3", "F4", "F5", "F6",
      "I1", "I2", "I3", "I4",
    ]);
    const count = (axis: string): number => RULES.filter((rule) => rule.axis === axis).length;
    expect([count("setup"), count("efficiency"), count("fit"), count("intensity")]).toEqual([5, 7, 6, 4]);
  });

  it("무게의 합은 기준마다 12, 16, 11, 9다", () => {
    const weight = (axis: string): number => RULES.filter((rule) => rule.axis === axis).reduce((sum, rule) => sum + rule.weight, 0);
    expect([weight("setup"), weight("efficiency"), weight("fit"), weight("intensity")]).toEqual([12, 16, 11, 9]);
  });

  it("정비할 수 있는 규칙은 E5와 E6뿐이다", () => {
    expect(RULES.filter((rule) => rule.tunable).map((rule) => rule.id)).toEqual(["E5", "E6"]);
  });

  it("설계의 기준값 그대로다", () => {
    expect(ruleSpec("E1")).toEqual({ id: "E1", axis: "efficiency", kind: "share", zeroAt: 0.5, fullAt: 0.9, weight: 3, unit: "perTool", tunable: false });
    expect(ruleSpec("E4")).toMatchObject({ kind: "amount", zeroAt: 16000, fullAt: 4000, weight: 2, unit: "perTool" });
    expect(ruleSpec("F1")).toMatchObject({ zeroAt: 0.95, fullAt: 0.6, weight: 1 });
    expect(ruleSpec("S3")).toMatchObject({ kind: "count", zeroAt: 3, fullAt: 0, unit: "merged" });
    expect(ruleSpec("I2")).toMatchObject({ kind: "rate", zeroAt: 3, fullAt: 40, weight: 3, unit: "merged" });
  });
});

describe("ruleScore", () => {
  it("0점 기준과 만점 기준 사이는 직선이고 바깥은 0이나 1이다", () => {
    expect(ruleScore(0.5, 0.5, 0.9)).toBe(0);
    expect(ruleScore(0.9, 0.5, 0.9)).toBe(1);
    expect(ruleScore(0.7, 0.5, 0.9)).toBeCloseTo(0.5, 12);
    expect(ruleScore(0.2, 0.5, 0.9)).toBe(0);
    expect(ruleScore(0.99, 0.5, 0.9)).toBe(1);
  });
  it("낮을수록 좋은 규칙은 0점 기준이 더 큰 값이다", () => {
    expect(ruleScore(3, 3, 0)).toBe(0);
    expect(ruleScore(0, 3, 0)).toBe(1);
    expect(ruleScore(1, 3, 0)).toBeCloseTo(2 / 3, 12);
    expect(ruleScore(5, 3, 0)).toBe(0);
    expect(ruleScore(10000, 16000, 4000)).toBeCloseTo(0.5, 12);
  });
  it("점수 자체는 맞추지 않는다. 계산한 그대로다", () => {
    // 수학으로는 0.8이지만 (0.82 - 0.5) / 0.4는 0.7999999999999998로 계산된다. 그 값을 그대로 낸다
    expect(ruleScore(0.82, 0.5, 0.9)).toBe((0.82 - 0.5) / (0.9 - 0.5));
    expect(ruleScore(0.82, 0.5, 0.9)).toBeLessThan(0.8);
    expect(ruleScore(1, 3, 0)).toBe(2 / 3);
  });
});

describe("settleScore", () => {
  it("경계와 견줄 때 쓴다. 나눗셈의 끝자리 오차가 경계의 어느 쪽인지를 바꾸지 않는다", () => {
    expect(settleScore(ruleScore(0.82, 0.5, 0.9))).toBe(0.8);
    expect(settleScore(ruleScore(0.04, 0.12, 0.02))).toBe(0.8);
    expect(settleScore(ruleScore(0.44, 0.8, 0.2))).toBe(0.6);
    expect(settleScore(ruleScore(0.62, 0.5, 0.9))).toBe(0.3);
    // 경계에 못 미치는 값을 경계로 올리지는 않는다
    expect(settleScore(ruleScore(0.8199, 0.5, 0.9))).toBeLessThan(0.8);
    expect(settleScore(ruleScore(0.819999999, 0.5, 0.9))).toBeLessThan(0.8);
  });
  it("소수 열두째 자리에서 맞춘다. 그보다 큰 차이는 남긴다", () => {
    expect(settleScore(0.7999999999999998)).toBe(0.8);
    expect(settleScore(0.5999999999999999)).toBe(0.6);
    expect(settleScore(0.8000000000000002)).toBe(0.8);
    expect(settleScore(0.799999999998)).toBe(0.799999999998);
    expect(settleScore(0)).toBe(0);
    expect(settleScore(1)).toBe(1);
  });
  it("아홉째 자리가 아니다. 경계에서 100억 분의 1만큼 못 미치는 값은 경계로 올리지 않는다", () => {
    expect(settleScore(0.7999999999)).toBeLessThan(0.8);
    expect(settleScore(0.7999999999)).toBe(0.7999999999);
  });
});

describe("반올림과 등급", () => {
  it("소수 아홉째 자리에서 한 번 맞춘 뒤 0.5는 올린다", () => {
    expect(roundHalfUp(79.5)).toBe(80);
    expect(roundHalfUp(79.4999999999)).toBe(80);
    expect(roundHalfUp(79.49999)).toBe(79);
    expect(roundHalfUp(64.5)).toBe(65);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(0)).toBe(0);
    // 0.1 + 0.2 같은 끝자리 오차가 결과를 바꾸지 않는다
    expect(roundHalfUp((0.1 + 0.2) * 10 + 0.5)).toBe(4);
  });
  it("등급의 경계는 49와 50, 64와 65, 79와 80, 89와 90이다", () => {
    expect([49, 50, 64, 65, 79, 80, 89, 90, 100, 0].map((aq) => gradeOf(aq).grade)).toEqual(["D", "C", "C", "B", "B", "A", "A", "S", "S", "D"]);
    expect([49, 50, 65, 80, 90].map((aq) => gradeOf(aq).tier)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("못 재는 이유", () => {
  it("차례는 unsupported, unreadable, not_applicable, incomplete, no_data, too_little, watching이다", () => {
    expect([...REASONS]).toEqual(["unsupported", "unreadable", "not_applicable", "incomplete", "no_data", "too_little", "watching"]);
  });
  it("한 도구 안에서는 차례에서 처음 맞는 것 하나다", () => {
    expect(firstReason(["watching", "incomplete", "unreadable"])).toBe("unreadable");
    expect(firstReason(["too_little", "incomplete"])).toBe("incomplete");
    expect(firstReason(["no_data", "unsupported"])).toBe("unsupported");
    expect(firstReason(["watching"])).toBe("watching");
  });
  it("재는 도구가 없으면, 하거나 기다리면 풀리는 이유 가운데 가장 뒤의 것이 규칙의 이유다", () => {
    expect(ruleReason(["watching", "unsupported"])).toBe("watching");
    expect(ruleReason(["unreadable", "not_applicable"])).toBe("unreadable");
    expect(ruleReason(["unreadable", "too_little", "incomplete"])).toBe("too_little");
  });
  it("풀리는 이유가 하나도 없으면 unsupported와 not_applicable 가운데 뒤의 것이다", () => {
    expect(ruleReason(["unsupported", "not_applicable"])).toBe("not_applicable");
    expect(ruleReason(["unsupported", "unsupported"])).toBe("unsupported");
  });
  it("점수에 넣는 도구가 하나도 없으면 no_data다", () => {
    expect(ruleReason([])).toBe("no_data");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/rules.test.ts`
Expected: FAIL. `../../src/core/reasons.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/reasons.ts`(새 파일):

```ts
// 규칙을 못 잰 이유와 그 차례. 이유는 하나만 낸다(순수 함수, 설계 11.4의 1과 2)

/** 앞의 것이 풀려야 뒤의 것을 따질 수 있는 차례다. 한 도구 안에서 까닭이 여럿이면 처음 맞는 것을 낸다 */
export const REASONS = ["unsupported", "unreadable", "not_applicable", "incomplete", "no_data", "too_little", "watching"] as const;
export type Reason = (typeof REASONS)[number];

/** 사용자가 무엇을 하거나 기다리면 풀리는 이유 */
const RESOLVABLE: ReadonlySet<Reason> = new Set(["unreadable", "incomplete", "no_data", "too_little", "watching"]);

const rank = (reason: Reason): number => REASONS.indexOf(reason);

/** 한 도구 안에서(합침 규칙이면 그 규칙에서) 맞는 까닭들 가운데 차례에서 가장 앞선 것. 까닭이 하나도 없으면 부르지 않는다. */
export function firstReason(reasons: readonly Reason[]): Reason {
  if (reasons.length === 0) throw new Error("firstReason needs at least one reason");
  return reasons.reduce((first, reason) => (rank(reason) < rank(first) ? reason : first));
}

/**
 * 도구별 규칙에서 재는 도구가 하나도 없을 때 규칙의 이유. 도구마다의 이유 가운데 하나를 고른다.
 * 풀리는 이유가 하나라도 있으면 그 가운데 차례에서 가장 뒤의 것이다. 한 도구에서만 재도 규칙이 재지므로 재는 데에 가장 가까운 도구의 까닭을 알린다.
 * 풀리는 이유가 없으면 unsupported와 not_applicable 가운데 뒤의 것이다. 점수에 넣는 도구가 하나도 없으면 no_data다.
 */
export function ruleReason(toolReasons: readonly Reason[]): Reason {
  if (toolReasons.length === 0) return "no_data";
  const resolvable = toolReasons.filter((reason) => RESOLVABLE.has(reason));
  const pool = resolvable.length > 0 ? resolvable : toolReasons;
  return pool.reduce((last, reason) => (rank(reason) > rank(last) ? reason : last));
}
```

`src/core/rules.ts`(새 파일):

```ts
// 규칙 표. 규칙 스물둘의 기준, 값의 종류, 0점 기준과 만점 기준, 무게, 계산 단위를 자료로 둔다(설계 11.1, 11.3). 기준값을 고치면 규칙 버전을 올린다
export const RULES_VERSION = "1.0.0";

export type Axis = "setup" | "efficiency" | "fit" | "intensity";
/** 잰 값의 종류. share는 몫(0에서 1), rate는 횟수(1을 넘을 수 있다), count는 개수, amount는 어림한 양이다 */
export type ValueKind = "share" | "rate" | "count" | "amount";
export type RuleId =
  | "S1" | "S2" | "S3" | "S4" | "S5"
  | "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7"
  | "F1" | "F2" | "F3" | "F4" | "F5" | "F6"
  | "I1" | "I2" | "I3" | "I4";

export interface RuleSpec {
  id: RuleId;
  axis: Axis;
  kind: ValueKind;
  /** 잰 값이 이 값이면(또는 이 값보다 나쁘면) 규칙 점수가 0이다 */
  zeroAt: number;
  /** 잰 값이 이 값이면(또는 이 값보다 좋으면) 규칙 점수가 1이다 */
  fullAt: number;
  weight: number;
  /** merged는 점수에 넣는 도구를 모두 합쳐 한 번 계산하고, perTool은 도구마다 계산해 응답 수를 무게로 평균한다 */
  unit: "merged" | "perTool";
  /** 정비 후보를 낼 수 있는 규칙이다 */
  tunable: boolean;
}

const rule = (id: RuleId, axis: Axis, kind: ValueKind, zeroAt: number, fullAt: number, weight: number, unit: RuleSpec["unit"], tunable = false): RuleSpec => ({ id, axis, kind, zeroAt, fullAt, weight, unit, tunable });

/** 표의 차례가 화면에 내는 차례의 마지막 기준이다(설계 11.5 「차례」) */
export const RULES: readonly RuleSpec[] = [
  rule("S1", "setup", "share", 0, 1, 3, "merged"),
  rule("S2", "setup", "share", 0, 1, 3, "merged"),
  rule("S3", "setup", "count", 3, 0, 2, "merged"),
  rule("S4", "setup", "share", 0.1, 0.01, 2, "perTool"),
  rule("S5", "setup", "share", 0.3, 0.02, 2, "perTool"),
  rule("E1", "efficiency", "share", 0.5, 0.9, 3, "perTool"),
  rule("E2", "efficiency", "share", 0.12, 0.02, 3, "perTool"),
  rule("E3", "efficiency", "rate", 3, 0.2, 3, "perTool"),
  rule("E4", "efficiency", "amount", 16000, 4000, 2, "perTool"),
  rule("E5", "efficiency", "share", 0.8, 0.2, 2, "perTool", true),
  rule("E6", "efficiency", "share", 0.7, 0.1, 2, "perTool", true),
  rule("E7", "efficiency", "rate", 0.15, 0.02, 1, "perTool"),
  rule("F1", "fit", "share", 0.95, 0.6, 1, "perTool"),
  rule("F2", "fit", "share", 0.1, 0.6, 1, "perTool"),
  rule("F3", "fit", "share", 0.2, 0.8, 3, "merged"),
  rule("F4", "fit", "share", 0.25, 0.02, 2, "merged"),
  rule("F5", "fit", "rate", 0.4, 0, 2, "perTool"),
  rule("F6", "fit", "count", 3, 0, 2, "merged"),
  rule("I1", "intensity", "count", 2, 20, 3, "merged"),
  rule("I2", "intensity", "rate", 3, 40, 3, "merged"),
  rule("I3", "intensity", "rate", 1, 8, 2, "merged"),
  rule("I4", "intensity", "count", 1, 4, 1, "merged"),
];

export function ruleSpec(id: RuleId): RuleSpec {
  const found = RULES.find((spec) => spec.id === id);
  if (found === undefined) throw new Error(`unknown rule: ${id}`);
  return found;
}
```

`src/core/score.ts`(새 파일):

```ts
// 잰 값을 규칙 점수로 바꾸고, 점수를 반올림하고, AQ를 등급으로 바꾼다(순수 함수, 설계 11.3, 11.4, 11.6)

/**
 * 규칙 점수를 경계(0.8, 0.6, 0.3, 1)와 견줄 때 쓰는 값. 소수 열두째 자리에서 맞춘다.
 * 나눗셈과 덧셈의 끝자리 오차(0.7999999999999998 같은 것)가 경계의 어느 쪽인지를 바꾸지 않게 하려는 것이다.
 * **견줄 때에만 쓴다.** 점수 자체와 그것으로 내는 기준 점수, 예상 효과는 맞추지 않은 값으로 계산한다.
 * 맞춘 값을 다음 계산에 넣으면 어느 자리에서 맞추든 깎인 만큼의 차이가 다음 반올림의 경계를 넘길 수 있다(과제 18의 시험에 반례가 둘 있다).
 */
export function settleScore(value: number): number {
  return Math.round(value * 1e12) / 1e12;
}

/** 잰 값이 0점 기준과 만점 기준 사이에 있으면 직선으로 잇고, 바깥이면 0이나 1이다. 낮을수록 좋은 규칙은 0점 기준이 더 큰 값이다. 맞추지 않는다. */
export function ruleScore(value: number, zeroAt: number, fullAt: number): number {
  const position = (value - zeroAt) / (fullAt - zeroAt);
  return position <= 0 ? 0 : position >= 1 ? 1 : position;
}

/** 소수 아홉째 자리에서 한 번 맞춘 뒤 0.5는 올린다. 실행 환경에 따라 끝자리가 달라지지 않게 하려는 것이다(설계 11.4의 5). */
export function roundHalfUp(value: number): number {
  return Math.floor(Math.round(value * 1e9) / 1e9 + 0.5);
}

export type Grade = "S" | "A" | "B" | "C" | "D";

/** S는 90 이상, A는 80~89, B는 65~79, C는 50~64, D는 49 이하다. tier는 장면의 단계(5가 S)다(설계 11.6). */
export function gradeOf(aq: number): { grade: Grade; tier: 1 | 2 | 3 | 4 | 5 } {
  if (aq >= 90) return { grade: "S", tier: 5 };
  if (aq >= 80) return { grade: "A", tier: 4 };
  if (aq >= 65) return { grade: "B", tier: 3 };
  if (aq >= 50) return { grade: "C", tier: 2 };
  return { grade: "D", tier: 1 };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 26개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/rules.test.ts src/core/reasons.ts src/core/rules.ts src/core/score.ts
git commit -m "feat: 규칙 표와 점수·등급·이유 차례 추가"
```

---

### Task 7: 기록으로 재는 도구별 규칙 여덟(S4, E1, E2, E3, E4, E7, F1, F2)

**Files:**
- Create: `src/core/measure.ts`
- Create: `src/core/metrics/usage.ts`
- Modify: `src/adapters/claude/observation.ts`
- Modify: `src/adapters/types.ts`
- Test: `test/core/metrics-usage.test.ts`

**Interfaces:**
- Consumes: 과제 5의 `ToolTotals`, 과제 6의 `Reason`. 1단계의 `CLAUDE_COVERAGE`(`src/adapters/claude/observation.ts`).
- Produces: `Coverage`, `CoverageKey`(설계 9.7의 표의 줄 열다섯), `ToolCoverage = Record<CoverageKey, Coverage>`(`src/adapters/types.ts`). `Measurement = { status: "scored"; value: number; evidence: Evidence } | { status: "unmeasured"; reason: Reason; evidence: Evidence }`, `Evidence = Record<string, number | null>`, `scored(value, evidence)`, `unmeasured(reason, evidence)`, `blank(evidence)`, `countGate(sees: boolean, denominator: number, minimum: number, evidence: Evidence): Measurement | null`(`src/core/measure.ts`). `usageRules(totals: ToolTotals, coverage: ToolCoverage): Record<UsageRuleId, Measurement>`, `median`, `EFFORT_LEVELS`, `MIN_HUMAN_REQUESTS`(`src/core/metrics/usage.ts`).

규칙 하나를 도구 하나에서 잰 결과의 모양(`Measurement`)을 정하고, 세션 기록만으로 재는 도구별 규칙 여덟을 잰다. 못 잰 규칙의 값은 없다. 0이나 숫자가 아닌 값을 내지 않는다(설계 11.4).

관측 범위의 타입은 도구에 매이지 않는 자리(`src/adapters/types.ts`)로 옮긴다. 1단계의 `CLAUDE_COVERAGE`는 값이 그대로이고 `satisfies ToolCoverage`로 열쇠 열다섯을 컴파일러가 본다.

| 규칙 | 값 | 못 재는 때(차례대로) | 근거 숫자 |
|---|---|---|---|
| S4 | 훅 실패 ÷ 훅 실행 | 훅을 못 보는 도구 `unsupported`, 실행 0번 `no_data`, 1~99번 `too_little` | `failures`, `runs`, `unclassifiedBlocks` |
| E1 | 캐시 읽기 ÷ (입력 + 캐시 읽기 + 캐시 쓰기) | 전체 입력 0 `no_data` | `cacheRead`, `cacheWrite`, `input` |
| E2 | 셸 명령을 뺀 도구 결과의 오류 ÷ 그 결과 | 오류를 못 보는 형식 `unsupported`, 0개 `no_data`, 1~49개 `too_little` | `errors`, `results` |
| E3 | 주 세션의 자동 압축 ÷ 주 세션 수 | 압축을 못 보는 형식 `unsupported`, 0개 `no_data`, 1~2개 `too_little` | `autoCompactions`, `mainSessions` |
| E4 | 지침이 실린 주 세션의 어림 토큰의 가운데 값 | 지침 크기를 못 보는 형식 `unsupported`, 표본 없음 `no_data` | `sampledSessions`, `skippedSessions` |
| E7 | (거절 + 끊은 턴 + 길이 제한으로 끊긴 응답) ÷ 사람 요청 | 세 사건을 다 보지는 못하는 도구 `unsupported`, 0개 `no_data`, 1~19개 `too_little` | `denied`, `humanRequests`, `interruptedTurns`, `lengthStops` |
| F1 | (xhigh + max) ÷ 강도를 아는 응답 | 강도를 못 보는 도구 `unsupported`, 0개 `no_data`, 1~49개 `too_little` | `highEffort`, `knownEffort`, `unknownEffort`, `unknownLevel` |
| F2 | 자동 압축이 있었던 주 세션 가운데 하위 에이전트를 쓴 세션의 몫 | 하위 에이전트나 압축을 못 보는 도구 `unsupported`, 0개 `no_data`, 1~2개 `too_little` | `compactedSessions`, `delegatedSessions` |

- **근거 숫자.** 분자와 분모 같은 센 숫자를 싣는다. 열쇠는 영어 낱말이고 글자 차례다. 그 도구가 그 사건을 기록하지 않아 세지 못한 때(`unsupported`)에는 모두 `null`로 비운다. 0으로 바꾸지 않는다(설계 12.2). 설계가 무엇이 드는지만 정한 E4, E5, E6의 근거 숫자의 이름은 이 계획이 정한다.
- **S4.** 일부러 막은 것인지 실패해서 막힌 것인지 가릴 수 없는 막음은 실행에도 실패에도 넣지 않고 수만 싣는다(설계 11.3).
- **E4.** 표본은 지침이 실린 주 세션뿐이다. 첨부가 남지 않은 세션과 글자가 없는 세션은 표본에 넣지 않고 수를 싣는다. 표본이 짝수 개면 가운데 둘의 평균이다.
- **F1.** 강도의 차례는 `minimal`, `low`, `medium`, `high`, `xhigh`, `max`다. 차례에 없는 값(모르는 단계)과 강도 필드가 없는 응답(강도를 모름)은 분모에서 빼고 수를 싣는다.
- **E3과 F2는 1을 넘거나 표본이 적을 수 있다.** E3은 횟수라 자르지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/metrics-usage.test.ts`(새 파일):

```ts
// 기록으로 재는 도구별 규칙 여덟(S4, E1, E2, E3, E4, E7, F1, F2)을 시험한다. 기준이 되는 개수의 경계, 분모 0, 못 보는 도구(설계 11.3, 11.4 「규칙마다의 이유」)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { CoverageKey, ToolCoverage } from "../../src/adapters/types.ts";
import { usageRules } from "../../src/core/metrics/usage.ts";
import { toolTotals } from "../../src/core/totals.ts";
import { summary, type DayInput, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const D = "2026-11-10";
const totalsOf = (...sessions: SummaryInput[]) => toolTotals(sessions.map((s) => summary(s)), windows, ["Bash"]);
const one = (cell: DayInput) => totalsOf({ days: { [D]: { responses: 1, ...cell } } });
const without = (...keys: CoverageKey[]): ToolCoverage => ({ ...CLAUDE_COVERAGE, ...Object.fromEntries(keys.map((key) => [key, "unsupported"])) });
const rules = (totals: ReturnType<typeof totalsOf>, coverage: ToolCoverage = CLAUDE_COVERAGE) => usageRules(totals, coverage);

describe("S4 훅이 안정적으로 돈다", () => {
  it("훅 실패를 훅 실행으로 나눈다. 가릴 수 없는 막음은 양쪽에 넣지 않고 수만 싣는다", () => {
    expect(rules(one({ hooks: { PreToolUse: { runs: 200, failures: 10, unclassifiedBlocks: 7 } } })).S4).toEqual({
      status: "scored",
      value: 0.05,
      evidence: { failures: 10, runs: 200, unclassifiedBlocks: 7 },
    });
  });
  it("실행이 0번이면 no_data, 1번에서 99번이면 too_little, 100번부터 잰다", () => {
    expect(rules(one({})).S4).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(one({ hooks: { Stop: { runs: 99, failures: 99 } } })).S4).toMatchObject({ status: "unmeasured", reason: "too_little", evidence: { runs: 99, failures: 99 } });
    expect(rules(one({ hooks: { Stop: { runs: 100 } } })).S4).toMatchObject({ status: "scored", value: 0 });
  });
  it("훅 실행을 못 보는 도구는 unsupported이고 근거 숫자는 비운다", () => {
    expect(rules(one({ hooks: { Stop: { runs: 500 } } }), without("mcpFailuresAndHooks")).S4).toEqual({
      status: "unmeasured",
      reason: "unsupported",
      evidence: { failures: null, runs: null, unclassifiedBlocks: null },
    });
  });
});

describe("E1 캐시 적중", () => {
  it("캐시 읽기를 입력, 캐시 읽기, 캐시 쓰기의 합으로 나눈다", () => {
    expect(rules(one({ tokens: { input: 100, cacheRead: 700, cacheWrite: 200, output: 999 } })).E1).toEqual({
      status: "scored",
      value: 0.7,
      evidence: { cacheRead: 700, cacheWrite: 200, input: 100 },
    });
  });
  it("전체 입력이 0이면 no_data다", () => {
    expect(rules(one({ tokens: { output: 5 } })).E1).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
});

describe("E2 도구 오류", () => {
  it("셸 명령을 뺀 도구 결과 가운데 오류의 몫이다", () => {
    const totals = one({ tools: { Read: { calls: 60, results: 60, errors: 3 }, Bash: { calls: 40, results: 40, errors: 30 } } });
    expect(rules(totals).E2).toEqual({ status: "scored", value: 0.05, evidence: { errors: 3, results: 60 } });
  });
  it("대상 결과가 0개면 no_data, 1개에서 49개면 too_little, 50개부터 잰다", () => {
    expect(rules(one({ tools: { Bash: { calls: 80, results: 80, errors: 80 } } })).E2).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(one({ tools: { Read: { results: 49, errors: 49 } } })).E2).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(rules(one({ tools: { Read: { results: 50, errors: 50 } } })).E2).toMatchObject({ status: "scored", value: 1 });
  });
  it("오류를 못 보는 형식은 unsupported다", () => {
    expect(rules(one({ tools: { Read: { results: 500 } } }), without("toolErrors")).E2).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});

describe("E3 대화 넘침", () => {
  it("주 세션의 자동 압축 횟수를 점수 구간에 응답이 있는 주 세션 수로 나눈다. 1을 넘을 수 있다", () => {
    const totals = totalsOf(
      { days: { [D]: { responses: 1, autoCompactions: 5 } } },
      { days: { [D]: { responses: 1 } } },
      { days: { [D]: { responses: 1, autoCompactions: 1 } } },
      { kind: "sub", days: { [D]: { responses: 1, autoCompactions: 50 } } },
    );
    expect(rules(totals).E3).toEqual({ status: "scored", value: 2, evidence: { autoCompactions: 6, mainSessions: 3 } });
  });
  it("주 세션이 0개면 no_data, 1개나 2개면 too_little이다", () => {
    expect(rules(totalsOf({ kind: "sub", days: { [D]: { responses: 9 } } })).E3).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(totalsOf({ days: { [D]: { responses: 1 } } }, { days: { [D]: { responses: 1 } } })).E3).toMatchObject({ status: "unmeasured", reason: "too_little", evidence: { mainSessions: 2 } });
  });
  it("압축을 못 보는 형식은 unsupported다", () => {
    expect(rules(totalsOf({ days: { [D]: { responses: 1 } } }), without("autoCompaction")).E3).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});

describe("E4 매번 실리는 지침", () => {
  const withChars = (ascii: number, other: number): SummaryInput => ({ instructionChars: { ascii, other }, days: { [D]: { responses: 1 } } });
  it("지침이 실린 주 세션의 어림 토큰의 가운데 값이다. 표본이 짝수 개면 가운데 둘의 평균이다", () => {
    expect(rules(totalsOf(withChars(4000, 0), withChars(0, 9000), withChars(0, 5000))).E4).toMatchObject({ status: "scored", value: 5000 });
    expect(rules(totalsOf(withChars(4000, 0), withChars(0, 9000), withChars(0, 5000), withChars(0, 7000))).E4).toMatchObject({ status: "scored", value: 6000 });
  });
  it("지침 첨부가 남지 않은 세션과 글자가 없는 세션은 0으로 넣지 않고 수만 싣는다", () => {
    const totals = totalsOf(withChars(0, 20000), { days: { [D]: { responses: 1 } } }, { days: { [D]: { responses: 1 } } }, withChars(0, 0));
    expect(rules(totals).E4).toEqual({ status: "scored", value: 20000, evidence: { sampledSessions: 1, skippedSessions: 3 } });
  });
  it("지침이 실린 주 세션이 없으면 no_data, 지침 크기를 못 보는 형식이면 unsupported다", () => {
    expect(rules(totalsOf({ days: { [D]: { responses: 1 } } })).E4).toEqual({ status: "unmeasured", reason: "no_data", evidence: { sampledSessions: 0, skippedSessions: 1 } });
    expect(rules(totalsOf(withChars(0, 100)), without("instructionSize")).E4).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});

describe("E7 멈춘 일", () => {
  it("거절한 도구 실행, 끊은 턴, 길이 제한으로 끊긴 응답을 더해 사람 요청으로 나눈다", () => {
    const totals = one({ humanRequests: 40, interruptedTurns: 2, lengthStops: 1, tools: { Bash: { deniedByUser: 1 }, Edit: { deniedByHook: 1, deniedByPermission: 1, interrupted: 9 } } });
    expect(rules(totals).E7).toEqual({ status: "scored", value: 0.15, evidence: { denied: 3, humanRequests: 40, interruptedTurns: 2, lengthStops: 1 } });
  });
  it("사람 요청이 0개면 no_data, 1개에서 19개면 too_little이다", () => {
    expect(rules(one({ lengthStops: 3 })).E7).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(one({ humanRequests: 19 })).E7).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(rules(one({ humanRequests: 20 })).E7).toMatchObject({ status: "scored", value: 0 });
  });
  it("세 사건을 다 보지는 못하는 도구는 unsupported다", () => {
    expect(rules(one({ humanRequests: 50 }), without("deniedAndLengthStops")).E7).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    expect(rules(one({ humanRequests: 50 }), without("interruptedTurns")).E7).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});

describe("F1 높은 추론 강도에 쏠리지 않는다", () => {
  it("xhigh와 max로 돈 응답을 강도를 아는 응답으로 나눈다. 차례에 없는 값과 강도 모름은 분모에서 빼고 수를 싣는다", () => {
    const totals = one({ efforts: { minimal: 5, low: 5, medium: 10, high: 20, xhigh: 30, max: 30, turbo: 4 }, unknownEffort: 6 });
    expect(rules(totals).F1).toEqual({ status: "scored", value: 0.6, evidence: { highEffort: 60, knownEffort: 100, unknownEffort: 6, unknownLevel: 4 } });
  });
  it("강도를 아는 응답이 0개면 no_data, 1개에서 49개면 too_little이다", () => {
    expect(rules(one({ efforts: { turbo: 80 }, unknownEffort: 80 })).F1).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(one({ efforts: { max: 49 } })).F1).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(rules(one({ efforts: { high: 50 } })).F1).toMatchObject({ status: "scored", value: 0 });
  });
});

describe("F2 긴 일을 나눠 맡긴다", () => {
  const session = (autoCompactions: number, subagentCalls: number): SummaryInput => ({ days: { [D]: { responses: 1, autoCompactions, subagentCalls } } });
  it("자동 압축이 있었던 주 세션 가운데 하위 에이전트를 쓴 세션의 몫이다", () => {
    const totals = totalsOf(session(1, 2), session(3, 0), session(1, 1), session(2, 0), session(0, 9));
    expect(rules(totals).F2).toEqual({ status: "scored", value: 0.5, evidence: { compactedSessions: 4, delegatedSessions: 2 } });
  });
  it("그런 세션이 0개면 no_data, 1개나 2개면 too_little이다", () => {
    expect(rules(totalsOf(session(0, 5))).F2).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(rules(totalsOf(session(1, 1), session(1, 0))).F2).toMatchObject({ status: "unmeasured", reason: "too_little", evidence: { compactedSessions: 2, delegatedSessions: 1 } });
  });
  it("하위 에이전트나 압축을 못 보는 도구는 unsupported다", () => {
    const totals = totalsOf(session(1, 1), session(1, 1), session(1, 1));
    expect(rules(totals, without("subagents")).F2).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    expect(rules(totals, without("autoCompaction")).F2).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/metrics-usage.test.ts`
Expected: FAIL. `../../src/core/metrics/usage.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/claude/observation.ts`(찾을 곳 1/2):

```ts
import type { SessionSummary } from "../types.ts";

export type Coverage = "measured" | "proxy" | "unsupported";
```

`src/adapters/claude/observation.ts`(바꾼 뒤 1/2):

```ts
import type { SessionSummary, ToolCoverage } from "../types.ts";
```

`src/adapters/claude/observation.ts`(찾을 곳 2/2):

```ts
} as const satisfies Record<string, Coverage>;
```

`src/adapters/claude/observation.ts`(바꾼 뒤 2/2):

```ts
} as const satisfies ToolCoverage;
```

`src/adapters/types.ts`(찾을 곳):

```ts

export interface TokenCounts {
```

`src/adapters/types.ts`(바꾼 뒤):

```ts

/** measured는 봄, proxy는 대신 봄(가까운 값), unsupported는 못 봄이다. 못 봄은 0이 아니다(설계 9.7) */
export type Coverage = "measured" | "proxy" | "unsupported";

/** 설계 9.7의 표의 줄. 어댑터가 도구와 형식마다 낸다 */
export type CoverageKey =
  | "responsesAndTokens"
  | "humanRequests"
  | "toolCalls"
  | "toolErrors"
  | "shellExitCodes"
  | "deniedAndLengthStops"
  | "interruptedTurns"
  | "autoCompaction"
  | "effort"
  | "loadedNames"
  | "skillUsage"
  | "mcpCalls"
  | "mcpFailuresAndHooks"
  | "instructionSize"
  | "subagents";

export type ToolCoverage = Record<CoverageKey, Coverage>;

export interface TokenCounts {
```

`src/core/measure.ts`(새 파일):

```ts
// 규칙 하나를 도구 하나에서(합침 규칙이면 전체에서) 잰 결과의 모양(순수, 설계 11.4, 12.2)
import type { Reason } from "./reasons.ts";

/** 근거 숫자. 센 것만 숫자이고 세지 못한 것은 null이다. 0으로 바꾸지 않는다(설계 12.2) */
export type Evidence = Record<string, number | null>;

export type Measurement = { status: "scored"; value: number; evidence: Evidence } | { status: "unmeasured"; reason: Reason; evidence: Evidence };

export const scored = (value: number, evidence: Evidence): Measurement => ({ status: "scored", value, evidence });
export const unmeasured = (reason: Reason, evidence: Evidence): Measurement => ({ status: "unmeasured", reason, evidence });

/** 근거 숫자를 모두 비운다. 그 도구가 그 사건을 기록하지 않아 세지 못한 때에 쓴다. */
export const blank = (evidence: Evidence): Evidence => Object.fromEntries(Object.keys(evidence).map((key) => [key, null]));

/**
 * 기록의 개수로 정하는 조건을 차례대로 본다. 그 도구가 그 사건을 못 보면 unsupported(근거 숫자는 비운다),
 * 분모가 0이면 no_data, 0은 아닌데 최소 개수에 못 미치면 too_little이다(설계 11.4 「규칙마다의 이유」). 잴 수 있으면 null이다.
 */
export function countGate(sees: boolean, denominator: number, minimum: number, evidence: Evidence): Measurement | null {
  if (!sees) return unmeasured("unsupported", blank(evidence));
  if (denominator <= 0) return unmeasured("no_data", evidence);
  if (denominator < minimum) return unmeasured("too_little", evidence);
  return null;
}
```

`src/core/metrics/usage.ts`(새 파일):

```ts
// 기록으로 재는 도구별 규칙 여덟을 도구 하나의 구간 합계에서 잰다. S4, E1, E2, E3, E4, E7, F1, F2(순수 함수, 설계 11.3, 11.4 「규칙마다의 이유」)
import type { CoverageKey, ToolCoverage } from "../../adapters/types.ts";
import { countGate, scored, type Measurement } from "../measure.ts";
import type { ToolTotals } from "../totals.ts";

export type UsageRuleId = "S4" | "E1" | "E2" | "E3" | "E4" | "E7" | "F1" | "F2";

/** 추론 강도의 차례. 높은 강도는 xhigh와 max다. 차례에 없는 값은 모르는 단계로 분모에서 뺀다(설계 11.3 F1) */
export const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
const HIGH_EFFORT: ReadonlySet<string> = new Set(["xhigh", "max"]);

export const MIN_HOOK_RUNS = 100;
export const MIN_TOOL_RESULTS = 50;
export const MIN_MAIN_SESSIONS = 3;
export const MIN_HUMAN_REQUESTS = 20;
export const MIN_KNOWN_EFFORT = 50;
export const MIN_COMPACTED_SESSIONS = 3;

const sees = (coverage: ToolCoverage, ...keys: CoverageKey[]): boolean => keys.every((key) => coverage[key] !== "unsupported");

/** 가운데 값. 개수가 짝수면 가운데 둘의 평균이다. 빈 목록으로 부르지 않는다. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function s4(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const evidence = { failures: totals.hookFailures, runs: totals.hookRuns, unclassifiedBlocks: totals.hookUnclassified };
  return countGate(sees(coverage, "mcpFailuresAndHooks"), totals.hookRuns, MIN_HOOK_RUNS, evidence) ?? scored(totals.hookFailures / totals.hookRuns, evidence);
}

function e1(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const { input, cacheRead, cacheWrite } = totals.tokens;
  const all = input + cacheRead + cacheWrite;
  const evidence = { cacheRead, cacheWrite, input };
  return countGate(sees(coverage, "responsesAndTokens"), all, 1, evidence) ?? scored(cacheRead / all, evidence);
}

function e2(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const evidence = { errors: totals.nonShellErrors, results: totals.nonShellResults };
  return countGate(sees(coverage, "toolErrors"), totals.nonShellResults, MIN_TOOL_RESULTS, evidence) ?? scored(totals.nonShellErrors / totals.nonShellResults, evidence);
}

function e3(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const autoCompactions = totals.mainSessions.reduce((sum, session) => sum + session.autoCompactions, 0);
  const evidence = { autoCompactions, mainSessions: totals.mainSessions.length };
  return countGate(sees(coverage, "autoCompaction"), totals.mainSessions.length, MIN_MAIN_SESSIONS, evidence) ?? scored(autoCompactions / totals.mainSessions.length, evidence);
}

function e4(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  // 표본은 지침이 실린 주 세션뿐이다. 첨부가 남지 않은 세션과 글자가 없는 세션은 0으로 넣지 않는다(설계 11.3 「E4의 표본」)
  const sample = totals.mainSessions.flatMap((session) => (session.instructionTokens === null ? [] : [session.instructionTokens]));
  const evidence = { sampledSessions: sample.length, skippedSessions: totals.mainSessions.length - sample.length };
  return countGate(sees(coverage, "instructionSize"), sample.length, 1, evidence) ?? scored(median(sample), evidence);
}

function e7(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const evidence = { denied: totals.denied, humanRequests: totals.humanRequests, interruptedTurns: totals.interruptedTurns, lengthStops: totals.lengthStops };
  const stopped = totals.denied + totals.interruptedTurns + totals.lengthStops;
  return countGate(sees(coverage, "deniedAndLengthStops", "interruptedTurns"), totals.humanRequests, MIN_HUMAN_REQUESTS, evidence) ?? scored(stopped / totals.humanRequests, evidence);
}

function f1(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  let knownEffort = 0;
  let highEffort = 0;
  let unknownLevel = 0;
  const levels: ReadonlySet<string> = new Set(EFFORT_LEVELS);
  for (const [level, count] of Object.entries(totals.efforts)) {
    if (!levels.has(level)) unknownLevel += count;
    else {
      knownEffort += count;
      if (HIGH_EFFORT.has(level)) highEffort += count;
    }
  }
  const evidence = { highEffort, knownEffort, unknownEffort: totals.unknownEffort, unknownLevel };
  return countGate(sees(coverage, "effort"), knownEffort, MIN_KNOWN_EFFORT, evidence) ?? scored(highEffort / knownEffort, evidence);
}

function f2(totals: ToolTotals, coverage: ToolCoverage): Measurement {
  const compacted = totals.mainSessions.filter((session) => session.autoCompactions > 0);
  const delegatedSessions = compacted.filter((session) => session.subagentCalls > 0).length;
  const evidence = { compactedSessions: compacted.length, delegatedSessions };
  return countGate(sees(coverage, "subagents", "autoCompaction"), compacted.length, MIN_COMPACTED_SESSIONS, evidence) ?? scored(delegatedSessions / compacted.length, evidence);
}

export function usageRules(totals: ToolTotals, coverage: ToolCoverage): Record<UsageRuleId, Measurement> {
  return {
    S4: s4(totals, coverage),
    E1: e1(totals, coverage),
    E2: e2(totals, coverage),
    E3: e3(totals, coverage),
    E4: e4(totals, coverage),
    E7: e7(totals, coverage),
    F1: f1(totals, coverage),
    F2: f2(totals, coverage),
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core test/adapters test/collect`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 15개, 시험 197개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/metrics-usage.test.ts src/adapters/claude/observation.ts src/adapters/types.ts src/core/measure.ts src/core/metrics/usage.ts
git commit -m "feat: 기록으로 재는 도구별 규칙 여덟 추가"
```

---

### Task 8: 세션을 프로젝트에 잇기와 강도 규칙 넷(I1~I4)

**Files:**
- Create: `src/core/metrics/intensity.ts`
- Create: `src/core/projects.ts`
- Modify: `src/core/totals.ts`
- Test: `test/core/metrics-intensity.test.ts`
- Test: `test/core/projects.test.ts`
- Test: `test/helpers/facts.ts`

**Interfaces:**
- Consumes: 과제 5의 `ToolTotals`, 과제 7의 `ToolCoverage`, `countGate`, `scored`, `MIN_HUMAN_REQUESTS`. 1부의 `ProjectFact`, `ClaudeSetupFacts`, `SkillFact`, `McpFact`, `PluginFact`, `InstructionSet`.
- Produces: `ToolUsage { tool: ToolId; totals: ToolTotals; coverage: ToolCoverage }`(`src/core/totals.ts`). `NormalizedCwds = Readonly<Record<string, string>>`, `ProjectLookup = (cwd: string | null) => ProjectFact | null`, `projectLookup(projects: readonly ProjectFact[], normalizedCwds: NormalizedCwds): ProjectLookup`, `projectUsage(tools: readonly { tool: ToolId; totals: ToolTotals }[], lookup: ProjectLookup): ProjectUsage`, `ProjectUse { project; sessions: Record<string, number>; total }`, `ProjectUsage { projects: ProjectUse[]; unlinkedSessions }`(`src/core/projects.ts`). `intensityRules(tools: readonly ToolUsage[], usage: ProjectUsage): Record<"I1" | "I2" | "I3" | "I4", Measurement>`(`src/core/metrics/intensity.ts`). 시험 도우미 `facts`, `project`, `skill`, `mcpServer`, `plugin`, `instructions`, `instructionFile`, `HOME`(`test/helpers/facts.ts`).

세션의 작업 폴더(기록에 처음 적힌 것 하나)를 스캐너의 프로젝트 목록에 잇는다. 프로젝트의 정체(깃 뿌리, 워크트리, 프로젝트로 보지 않는 폴더)는 1부의 스캐너가 이미 정해 `ProjectFact.cwds`에 정규화한 작업 폴더로 적어 두었다(설계 10).

- **core는 경로를 풀지 않는다.** 세션 요약의 작업 폴더는 기록에 적힌 그대로이고, 정규화(`normalizePath`)는 Node.js의 경로 모듈을 쓴다. 그래서 입력을 조립하는 쪽(과제 20)이 「기록에 적힌 작업 폴더 → 정규화한 경로」의 표(`NormalizedCwds`)를 만들어 넘긴다.
- 작업 폴더가 없거나, 정규화한 경로를 모르거나, 목록의 어느 프로젝트에도 묶이지 않는 주 세션은 프로젝트에 넣지 않고 수를 센다(`unlinkedSessions`).
- **입력의 약속.** 요약에 적힌 작업 폴더는 빠짐없이 「기록에 적힌 작업 폴더 → 정규화한 경로」의 표에 있어야 한다. 과제 20의 입력 조립이 작업 폴더가 있는 모든 요약의 것을 채운다. 표에 없는 작업 폴더는 적힌 글자 그대로 견주게 되어, 표기만 다른 같은 폴더(Windows의 대소문자, 구분 기호)를 다른 폴더로 본다. 과제 13의 ㉱가 그러면 새로 시작됐다는 근거를 놓칠 수 있다.
- `projectUsage`는 프로젝트마다 점수 구간에 응답이 있는 주 세션을 도구별로 센다. 프로젝트는 정규화한 뿌리 차례, 도구는 식별자 차례다. F3(과제 11)과 I4가 함께 쓴다.

강도는 도구를 합쳐서 잰다. 같은 양을 두 도구로 나눠 쓴 사람이 한 도구만 쓴 사람보다 낮게 나오면 안 된다. 날짜와 프로젝트는 합집합으로 센다(설계 11.3 「강도」).

| 규칙 | 값 | 못 재는 때 | 근거 숫자 |
|---|---|---|---|
| I1 | 어느 도구에서든 응답이 있었던 날의 수 | 없다. 늘 잰다 | `activeDays` |
| I2 | 사람 요청 ÷ 사용한 날 | 사용한 날 0 `no_data` | `activeDays`, `humanRequests` |
| I3 | 도구 호출(셸 명령 포함, 주 세션과 하위 세션) ÷ 사람 요청 | 0개 `no_data`, 1~19개 `too_little` | `humanRequests`, `toolCalls` |
| I4 | 점수 구간에 주 세션이 있었던 프로젝트 수 | 0개 `no_data` | `excludedFolders`, `projects`, `unlinkedSessions` |

- 분자와 분모는 같은 관측 범위에서 만든다. 사람 요청이나 도구 호출을 못 보는 도구는 그 규칙에서 빼고, 모든 도구가 못 보면 `unsupported`다(설계 9.7). 지금의 도구와 형식은 모두 이 둘을 보거나 대신 본다.
- I4는 프로젝트로 보지 않는 폴더(홈 자체, 임시 폴더 아래 등)를 세지 않고, 지금 PC에 없는 작업 폴더는 센다. 세션은 있었기 때문이다(설계 10).
- `tools`는 점수에 넣는 도구(점수 구간에 응답이 있는 도구)다. 거르는 일은 과제 19의 `evaluate`가 한다.

시험 도우미 `test/helpers/facts.ts`는 셋팅 사실을 손으로 짓는다. 적지 않은 것은 "다 읽었고 아무것도 없다"의 값이다. 과제 10과 12가 셋팅 사실에 필드를 더할 때 이 도우미의 기본값도 함께 더한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/metrics-intensity.test.ts`(새 파일):

```ts
// 강도 규칙 넷(I1~I4)을 시험한다. 도구를 합쳐서 재고 날짜와 프로젝트는 합집합으로 센다(설계 11.3 「강도」, 11.4 「규칙마다의 이유」)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { CoverageKey, ToolCoverage, ToolId } from "../../src/adapters/types.ts";
import { intensityRules } from "../../src/core/metrics/intensity.ts";
import { projectLookup, projectUsage } from "../../src/core/projects.ts";
import { toolTotals, type ToolUsage } from "../../src/core/totals.ts";
import type { ProjectFact } from "../../src/scan/types.ts";
import { project } from "../helpers/facts.ts";
import { summary, type DayInput, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const without = (...keys: CoverageKey[]): ToolCoverage => ({ ...CLAUDE_COVERAGE, ...Object.fromEntries(keys.map((key) => [key, "unsupported"])) });
const tool = (id: string, sessions: SummaryInput[], coverage: ToolCoverage = CLAUDE_COVERAGE): ToolUsage => ({
  tool: id as ToolId,
  totals: toolTotals(sessions.map((s) => summary(s)), windows, ["Bash"]),
  coverage,
});
const days = (cells: Record<string, DayInput>): SummaryInput => ({ days: cells });
const rules = (tools: ToolUsage[], projects: ProjectFact[] = []) => {
  const normalized = Object.fromEntries(projects.flatMap((p) => p.cwds.map((cwd) => [cwd, cwd])));
  return intensityRules(tools, projectUsage(tools, projectLookup(projects, normalized)));
};

describe("I1 사용한 날", () => {
  it("어느 도구에서든 응답이 있었던 날을 합집합으로 센다", () => {
    const claude = tool("claude-code", [days({ "2026-11-10": { responses: 1 }, "2026-11-11": { responses: 2 } })]);
    const codex = tool("codex", [days({ "2026-11-11": { responses: 5 }, "2026-11-12": { responses: 1 }, "2026-11-13": { humanRequests: 4 } })]);
    expect(rules([claude, codex]).I1).toEqual({ status: "scored", value: 3, evidence: { activeDays: 3 } });
  });
  it("점수에 넣는 도구가 없어도 잰다. 값은 0이다", () => {
    expect(rules([]).I1).toEqual({ status: "scored", value: 0, evidence: { activeDays: 0 } });
  });
});

describe("I2 하루에 시키는 양", () => {
  it("모든 도구의 사람 요청을 사용한 날로 나눈다", () => {
    const claude = tool("claude-code", [days({ "2026-11-10": { responses: 1, humanRequests: 30 }, "2026-11-11": { responses: 1, humanRequests: 10 } })]);
    const codex = tool("codex", [days({ "2026-11-11": { responses: 1, humanRequests: 20 } })]);
    expect(rules([claude, codex]).I2).toEqual({ status: "scored", value: 30, evidence: { activeDays: 2, humanRequests: 60 } });
  });
  it("사용한 날이 0이면 no_data다", () => {
    expect(rules([]).I2).toEqual({ status: "unmeasured", reason: "no_data", evidence: { activeDays: 0, humanRequests: 0 } });
    expect(rules([tool("claude-code", [days({ "2026-11-10": { humanRequests: 5 } })])]).I2).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
  it("사람 요청을 못 보는 도구는 분자와 분모에서 뺀다. 모든 도구가 못 보면 unsupported다", () => {
    const seen = tool("claude-code", [days({ "2026-11-10": { responses: 1, humanRequests: 8 } })]);
    const blind = tool("codex", [days({ "2026-11-11": { responses: 1, humanRequests: 99 }, "2026-11-12": { responses: 1 } })], without("humanRequests"));
    expect(rules([seen, blind]).I2).toEqual({ status: "scored", value: 8, evidence: { activeDays: 1, humanRequests: 8 } });
    expect(rules([blind]).I2).toEqual({ status: "unmeasured", reason: "unsupported", evidence: { activeDays: null, humanRequests: null } });
  });
});

describe("I3 한 번에 맡기는 깊이", () => {
  it("셸 명령을 넣은 모든 도구 호출을 사람 요청으로 나눈다. 주 세션과 하위 세션의 호출을 합친다", () => {
    const main: SummaryInput = days({ "2026-11-10": { responses: 1, humanRequests: 25, tools: { Bash: { calls: 40 }, Read: { calls: 30 } } } });
    const sub: SummaryInput = { kind: "sub", days: { "2026-11-10": { responses: 1, humanRequests: 7, tools: { Grep: { calls: 30 } } } } };
    expect(rules([tool("claude-code", [main, sub])]).I3).toEqual({ status: "scored", value: 4, evidence: { humanRequests: 25, toolCalls: 100 } });
  });
  it("사람 요청이 0개면 no_data, 1개에서 19개면 too_little, 20개부터 잰다", () => {
    const requests = (humanRequests: number) => rules([tool("claude-code", [days({ "2026-11-10": { responses: 1, humanRequests, tools: { Read: { calls: 5 } } } })])]).I3;
    expect(requests(0)).toEqual({ status: "unmeasured", reason: "no_data", evidence: { humanRequests: 0, toolCalls: 5 } });
    expect(requests(19)).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(requests(20)).toMatchObject({ status: "scored", value: 0.25 });
  });
  it("도구 호출이나 사람 요청을 못 보는 도구는 빼고, 모든 도구가 못 보면 unsupported다", () => {
    const seen = tool("claude-code", [days({ "2026-11-10": { responses: 1, humanRequests: 20, tools: { Read: { calls: 60 } } } })]);
    const blind = tool("codex", [days({ "2026-11-10": { responses: 1, humanRequests: 80 } })], without("toolCalls"));
    expect(rules([seen, blind]).I3).toEqual({ status: "scored", value: 3, evidence: { humanRequests: 20, toolCalls: 60 } });
    expect(rules([blind]).I3).toEqual({ status: "unmeasured", reason: "unsupported", evidence: { humanRequests: null, toolCalls: null } });
  });
});

describe("I4 쓰는 폭", () => {
  const at = (cwd: string | null, input: SummaryInput = {}): SummaryInput => ({ cwd, days: { "2026-11-10": { responses: 1 } }, ...input });
  it("점수 구간에 주 세션이 있었던 프로젝트를 도구를 합친 집합으로 센다", () => {
    const projects = [project("/work/a"), project("/work/b"), project("/work/c"), project("/work/old")];
    const claude = tool("claude-code", [at("/work/a"), at("/work/a"), at("/work/b"), at("/work/c", { kind: "sub" }), at("/work/old", { days: { "2026-10-12": { responses: 3 } } })]);
    const codex = tool("codex", [at("/work/b"), at("/work/c")]);
    expect(rules([claude, codex], projects).I4).toEqual({ status: "scored", value: 3, evidence: { excludedFolders: 0, projects: 3, unlinkedSessions: 0 } });
  });
  it("프로젝트로 보지 않는 폴더는 세지 않고, 지금 PC에 없는 작업 폴더는 센다", () => {
    const projects = [project("/home/u", { excluded: true, kind: "folder" }), project("/work/gone", { exists: false, kind: "folder" }), project("/work/a")];
    const claude = tool("claude-code", [at("/home/u"), at("/work/gone"), at("/work/a"), at(null)]);
    expect(rules([claude], projects).I4).toEqual({ status: "scored", value: 2, evidence: { excludedFolders: 1, projects: 2, unlinkedSessions: 1 } });
  });
  it("그런 프로젝트가 없으면 no_data다", () => {
    const projects = [project("/home/u", { excluded: true, kind: "folder" })];
    expect(rules([tool("claude-code", [at("/home/u"), at(null)])], projects).I4).toEqual({ status: "unmeasured", reason: "no_data", evidence: { excludedFolders: 1, projects: 0, unlinkedSessions: 1 } });
    expect(rules([]).I4).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
});
```

`test/core/projects.test.ts`(새 파일):

```ts
// 세션을 프로젝트에 잇고 프로젝트마다 점수 구간의 주 세션을 도구별로 세는 것을 시험한다(설계 10 「프로젝트 목록」, 「프로젝트의 정체」)
import { describe, expect, it } from "vitest";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolId } from "../../src/adapters/types.ts";
import { projectLookup, projectUsage } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import { project } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const D = "2026-11-10";
const session = (cwd: string | null, input: SummaryInput = {}): SummaryInput => ({ cwd, days: { [D]: { responses: 1 } }, ...input });
const tool = (id: string, ...sessions: SummaryInput[]) => ({ tool: id as ToolId, totals: toolTotals(sessions.map((s) => summary(s)), windows, []) });

describe("projectLookup", () => {
  const projects = [project("/work/app", { cwds: ["/work/app", "/work/app/web"] }), project("/work/lib")];
  const lookup = projectLookup(projects, { "C:\\Work\\App\\web": "/work/app/web", "/work/lib": "/work/lib", "/somewhere/else": "/somewhere/else" });

  it("세션의 작업 폴더를 정규화한 경로로 바꿔 그 폴더가 묶인 프로젝트를 찾는다", () => {
    expect(lookup("C:\\Work\\App\\web")?.normRoot).toBe("/work/app");
    expect(lookup("/work/lib")?.normRoot).toBe("/work/lib");
  });
  it("작업 폴더가 없거나, 정규화한 경로를 모르거나, 목록의 어느 프로젝트에도 묶이지 않으면 null이다", () => {
    expect(lookup(null)).toBeNull();
    expect(lookup("/work/app/web")).toBeNull();
    expect(lookup("/somewhere/else")).toBeNull();
  });
  it("정규화 표의 열쇠가 객체의 기본 속성 이름이어도 그 이름의 작업 폴더로만 본다", () => {
    expect(projectLookup(projects, {})("constructor")).toBeNull();
    expect(projectLookup(projects, {})("__proto__")).toBeNull();
  });
});

describe("projectUsage", () => {
  const projects = [project("/work/lib"), project("/work/app", { cwds: ["/work/app", "/work/app/web"] }), project("/work/idle")];
  const lookup = projectLookup(projects, { "/work/app": "/work/app", "/work/app/web": "/work/app/web", "/work/lib": "/work/lib", "/work/idle": "/work/idle", "/gone": "/gone" });

  it("프로젝트마다 점수 구간에 응답이 있는 주 세션을 도구별로 센다. 하위 세션과 점수 구간 밖의 세션은 세지 않는다", () => {
    const usage = projectUsage(
      [
        tool("claude-code", session("/work/app"), session("/work/app/web"), session("/work/lib"), session("/work/lib", { kind: "sub" }), session("/work/idle", { days: { "2026-10-12": { responses: 9 } } })),
        tool("codex", session("/work/app")),
      ],
      lookup,
    );
    expect(usage.projects.map((use) => [use.project.normRoot, use.sessions, use.total])).toEqual([
      ["/work/app", { "claude-code": 2, codex: 1 }, 3],
      ["/work/lib", { "claude-code": 1 }, 1],
    ]);
    expect(usage.unlinkedSessions).toBe(0);
  });
  it("프로젝트는 정규화한 뿌리 차례로 내고 도구는 식별자 차례로 싣는다. 입력의 차례와 상관없다", () => {
    const a = projectUsage([tool("codex", session("/work/lib"), session("/work/app")), tool("claude-code", session("/work/app"))], lookup);
    const b = projectUsage([tool("claude-code", session("/work/app")), tool("codex", session("/work/app"), session("/work/lib"))], lookup);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Object.keys(a.projects[0]!.sessions)).toEqual(["claude-code", "codex"]);
  });
  it("작업 폴더가 없는 주 세션과 목록에 묶이지 않은 주 세션은 프로젝트에 넣지 않고 수를 낸다", () => {
    const usage = projectUsage([tool("claude-code", session(null), session("/gone"), session("/work/app"))], lookup);
    expect(usage.projects.map((use) => use.project.normRoot)).toEqual(["/work/app"]);
    expect(usage.unlinkedSessions).toBe(2);
  });
});
```

`test/helpers/facts.ts`(새 파일):

```ts
// 시험에서 셋팅 사실을 손으로 짓는 도구. 적지 않은 것은 "다 읽었고 아무것도 없다"의 값이다
import { emptyInstructionSet, type InstructionFile, type InstructionSet } from "../../src/scan/instructions.ts";
import type { ClaudeSetupFacts, McpFact, PluginFact, ProjectFact, SkillFact } from "../../src/scan/types.ts";

export const HOME = "/home/u/.claude";

/** 내용이 있는 지침 파일 하나 */
export function instructionFile(path: string, input: Partial<InstructionFile> = {}): InstructionFile {
  return { path, realPath: path, bytes: 500, hasContent: true, sameAsGlobal: false, ...input };
}

/** 지침 묶음. bytes를 적지 않으면 파일 크기의 합이다 */
export function instructions(input: Partial<InstructionSet> = {}): InstructionSet {
  const files = input.files ?? [];
  return { ...emptyInstructionSet(), bytes: files.reduce((sum, file) => sum + file.bytes, 0), ...input };
}

/** 깃 저장소 뿌리인 프로젝트 하나. 설정 파일도 지침도 없다 */
export function project(root: string, input: Partial<ProjectFact> = {}): ProjectFact {
  return {
    root,
    normRoot: root,
    kind: "git",
    exists: true,
    excluded: false,
    cwds: [root],
    settingsStatus: "missing",
    localSettingsStatus: "missing",
    mcpJsonStatus: "missing",
    hasSettings: false,
    hasLocalSettings: false,
    instructions: emptyInstructionSet(),
    bypassInProject: false,
    bypassInLocal: false,
    permissionConflicts: 0,
    ...input,
  };
}

/** 사용자 범위의 켜져 있는 스킬 하나. 만든 지 오래됐고 집계에는 없다 */
export function skill(name: string, input: Partial<SkillFact> = {}): SkillFact {
  const path = input.path ?? `${HOME}/skills/${name}`;
  return {
    scope: "user",
    name,
    recordNames: [name],
    path,
    realPath: path,
    isLink: false,
    contentHash: `hash-${name}`,
    createdMs: 0,
    targetCreatedMs: null,
    projectRoot: null,
    pluginId: null,
    enabled: true,
    listed: true,
    readable: true,
    nameUnreadable: false,
    managedFixed: false,
    hookProvided: false,
    usageLastUsedMs: null,
    usageUndated: false,
    ...input,
  };
}

/** 사용자 범위의 켜져 있는 MCP 서버 하나 */
export function mcpServer(name: string, input: Partial<McpFact> = {}): McpFact {
  return { scope: "user", name, recordNames: [name], projectRoot: null, pluginId: null, definitionHash: `def-${name}`, enabled: true, managedFixed: false, ...input };
}

/** 사용자 범위로 설치해 켜 둔 플러그인 하나. 구성을 알고 스킬만 든다 */
export function plugin(id: string, input: Partial<PluginFact> = {}): PluginFact {
  const entryName = id.split("@")[0]!;
  const installPath = `${HOME}/plugins/cache/${id}`;
  return {
    id,
    entryName,
    name: entryName,
    scopes: ["user"],
    projectRoots: [],
    installPath,
    installRealPath: installPath,
    exists: true,
    manifest: "ok",
    marketplaceEntry: "ok",
    compositionKnown: true,
    enabled: true,
    managedFixed: false,
    managedForced: false,
    components: ["skills"],
    unknownEntries: [],
    dependencies: [],
    hasHooks: false,
    hooksUnreadable: false,
    mcpUnreadable: false,
    skills: [],
    usageLastUsedMs: null,
    usageUndated: false,
    ...input,
  };
}

/** Claude Code의 셋팅 사실. 모든 파일을 읽었고 설치, 프로젝트, 지침, 훅이 하나도 없다 */
export function facts(input: Partial<ClaudeSetupFacts> = {}): ClaudeSetupFacts {
  return {
    tool: "claude-code",
    home: HOME,
    claudeJson: "ok",
    globalInstructions: emptyInstructionSet(),
    globalMentions: {},
    settings: { user: "ok", managedParts: [], defaultMode: { user: null, managed: null } },
    hooks: { guards: [], userDisableAll: false, managedDisableAll: false, managedAllowManagedOnly: false, unreadablePlugins: [], unreadableSettings: [] },
    pluginsFile: "ok",
    plugins: [],
    pluginsWithoutInstall: [],
    skills: [],
    mcpServers: [],
    projects: [],
    problems: [],
    unreadableDirs: [],
    ...input,
  };
}
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/metrics-intensity.test.ts test/core/projects.test.ts`
Expected: FAIL. `../../src/core/metrics/intensity.ts`와 `../../src/core/projects.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/metrics/intensity.ts`(새 파일):

```ts
// 강도 규칙 넷을 잰다. I1, I2, I3, I4. 도구를 합쳐서 재고 날짜와 프로젝트는 합집합으로 센다(순수 함수, 설계 11.3 「강도」, 11.4 「규칙마다의 이유」)
import type { CoverageKey } from "../../adapters/types.ts";
import { countGate, scored, type Measurement } from "../measure.ts";
import type { ProjectUsage } from "../projects.ts";
import type { ToolUsage } from "../totals.ts";
import { MIN_HUMAN_REQUESTS } from "./usage.ts";

export type IntensityRuleId = "I1" | "I2" | "I3" | "I4";

/** 그 지표들을 모두 보는 도구만 남긴다. 분자와 분모는 같은 관측 범위에서 만든다(설계 9.7) */
const seeing = (tools: readonly ToolUsage[], ...keys: CoverageKey[]): ToolUsage[] => tools.filter((tool) => keys.every((key) => tool.coverage[key] !== "unsupported"));

/** 도구가 있는데 그 지표를 보는 도구가 하나도 없으면 그 사건을 기록하지 않는 것이다. 도구가 처음부터 없으면 기록이 없는 것이다 */
const anySees = (all: readonly ToolUsage[], seen: readonly ToolUsage[]): boolean => seen.length > 0 || all.length === 0;

const activeDays = (tools: readonly ToolUsage[]): number => new Set(tools.flatMap((tool) => tool.totals.activeDates)).size;
const sum = (tools: readonly ToolUsage[], pick: (tool: ToolUsage) => number): number => tools.reduce((total, tool) => total + pick(tool), 0);

function i1(tools: readonly ToolUsage[]): Measurement {
  const days = activeDays(tools);
  return scored(days, { activeDays: days });
}

function i2(tools: readonly ToolUsage[]): Measurement {
  const seen = seeing(tools, "humanRequests");
  const days = activeDays(seen);
  const humanRequests = sum(seen, (tool) => tool.totals.humanRequests);
  const evidence = { activeDays: days, humanRequests };
  return countGate(anySees(tools, seen), days, 1, evidence) ?? scored(humanRequests / days, evidence);
}

function i3(tools: readonly ToolUsage[]): Measurement {
  const seen = seeing(tools, "humanRequests", "toolCalls");
  const humanRequests = sum(seen, (tool) => tool.totals.humanRequests);
  const toolCalls = sum(seen, (tool) => tool.totals.toolCalls);
  const evidence = { humanRequests, toolCalls };
  return countGate(anySees(tools, seen), humanRequests, MIN_HUMAN_REQUESTS, evidence) ?? scored(toolCalls / humanRequests, evidence);
}

function i4(usage: ProjectUsage): Measurement {
  // 프로젝트로 보지 않는 폴더(홈 자체, 임시 폴더 아래 등)는 프로젝트 수에서 뺀다. 지금 PC에 없는 작업 폴더는 세션이 있었으므로 넣는다(설계 10)
  const excludedFolders = usage.projects.filter((use) => use.project.excluded).length;
  const projects = usage.projects.length - excludedFolders;
  const evidence = { excludedFolders, projects, unlinkedSessions: usage.unlinkedSessions };
  return countGate(true, projects, 1, evidence) ?? scored(projects, evidence);
}

/** tools는 점수에 넣는 도구(점수 구간에 응답이 있는 도구)다. usage는 같은 도구들로 만든 것이다. */
export function intensityRules(tools: readonly ToolUsage[], usage: ProjectUsage): Record<IntensityRuleId, Measurement> {
  return { I1: i1(tools), I2: i2(tools), I3: i3(tools), I4: i4(usage) };
}
```

`src/core/projects.ts`(새 파일):

```ts
// 세션을 프로젝트에 잇고, 프로젝트마다 점수 구간의 주 세션을 도구별로 센다(순수 함수, 설계 10 「프로젝트 목록」, 「프로젝트의 정체」)
import type { ToolId } from "../adapters/types.ts";
import type { ProjectFact } from "../scan/types.ts";
import type { ToolTotals } from "./totals.ts";

/**
 * 세션의 작업 폴더(기록에 적힌 그대로) → 정규화한 경로. 경로를 다루는 일은 입력을 조립하는 쪽이 한다. core는 경로를 풀지 않는다.
 * 요약에 적힌 작업 폴더는 빠짐없이 이 표에 있어야 한다. 표에 없는 작업 폴더는 적힌 글자 그대로 견주게 되어, 표기만 다른 같은 폴더를 다른 폴더로 본다.
 */
export type NormalizedCwds = Readonly<Record<string, string>>;

/** 세션의 작업 폴더가 묶인 프로젝트. 작업 폴더가 없거나 목록의 어느 프로젝트에도 묶이지 않으면 null이다 */
export type ProjectLookup = (cwd: string | null) => ProjectFact | null;

export function projectLookup(projects: readonly ProjectFact[], normalizedCwds: NormalizedCwds): ProjectLookup {
  const byNormCwd = new Map<string, ProjectFact>();
  for (const project of projects) for (const cwd of project.cwds) byNormCwd.set(cwd, project);
  const byRawCwd = new Map<string, ProjectFact>();
  for (const [raw, normalized] of Object.entries(normalizedCwds)) {
    const project = byNormCwd.get(normalized);
    if (project !== undefined) byRawCwd.set(raw, project);
  }
  return (cwd) => (cwd === null ? null : (byRawCwd.get(cwd) ?? null));
}

export interface ProjectUse {
  project: ProjectFact;
  /** 점수 구간에 응답이 있는 주 세션의 수(도구 식별자 차례). 세션이 없던 도구는 싣지 않는다 */
  sessions: Record<string, number>;
  /** sessions의 합 */
  total: number;
}

export interface ProjectUsage {
  /** 점수 구간에 주 세션이 하나라도 있었던 프로젝트(정규화한 뿌리 차례). 프로젝트로 보지 않는 폴더와 지금 PC에 없는 폴더도 든다 */
  projects: ProjectUse[];
  /** 작업 폴더가 없거나 목록의 어느 프로젝트에도 묶이지 않은 주 세션의 수 */
  unlinkedSessions: number;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function projectUsage(tools: readonly { tool: ToolId; totals: ToolTotals }[], lookup: ProjectLookup): ProjectUsage {
  const counts = new Map<string, { project: ProjectFact; byTool: Map<string, number> }>();
  let unlinkedSessions = 0;
  for (const { tool, totals } of tools) {
    for (const session of totals.mainSessions) {
      const project = lookup(session.cwd);
      if (project === null) {
        unlinkedSessions++;
        continue;
      }
      let entry = counts.get(project.normRoot);
      if (entry === undefined) counts.set(project.normRoot, (entry = { project, byTool: new Map() }));
      entry.byTool.set(tool, (entry.byTool.get(tool) ?? 0) + 1);
    }
  }
  const projects = [...counts.keys()].sort(byText).map((normRoot): ProjectUse => {
    const { project, byTool } = counts.get(normRoot)!;
    const sessions: Record<string, number> = {};
    let total = 0;
    for (const tool of [...byTool.keys()].sort(byText)) {
      sessions[tool] = byTool.get(tool)!;
      total += byTool.get(tool)!;
    }
    return { project, sessions, total };
  });
  return { projects, unlinkedSessions };
}
```

`src/core/totals.ts`(찾을 곳 1/2):

```ts
import type { LocalDate, Windows } from "../adapters/common/dates.ts";
import type { SessionSummary, TokenCounts } from "../adapters/types.ts";
import { byContent } from "./order.ts";
```

`src/core/totals.ts`(바꾼 뒤 1/2):

```ts
import type { LocalDate, Windows } from "../adapters/common/dates.ts";
import type { SessionSummary, TokenCounts, ToolCoverage, ToolId } from "../adapters/types.ts";
import { byContent } from "./order.ts";
```

`src/core/totals.ts`(찾을 곳 2/2):

```ts

/** ASCII 글자는 4글자를 1토큰으로, 그 밖의 글자는 1글자를 1토큰으로 어림한다. 글자가 없으면 표본이 아니라서 null이다(설계 11.3 E4). */
```

`src/core/totals.ts`(바꾼 뒤 2/2):

```ts

/** 도구 하나의 구간 합계와 그 도구의 관측 범위. 도구를 합쳐서 재는 규칙이 도구들을 이 모양으로 받는다 */
export interface ToolUsage {
  tool: ToolId;
  totals: ToolTotals;
  coverage: ToolCoverage;
}

/** ASCII 글자는 4글자를 1토큰으로, 그 밖의 글자는 1글자를 1토큰으로 어림한다. 글자가 없으면 표본이 아니라서 null이다(설계 11.3 E4). */
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 5개, 시험 65개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/metrics-intensity.test.ts test/core/projects.test.ts test/helpers/facts.ts src/core/metrics/intensity.ts src/core/projects.ts src/core/totals.ts
git commit -m "feat: 세션의 프로젝트 묶기와 강도 규칙 추가"
```

---

### Task 9: 셋팅 규칙 넷(S1, S2, S3, S5)

**Files:**
- Create: `src/core/metrics/setup.ts`
- Create: `src/core/readability.ts`
- Test: `test/core/metrics-setup.test.ts`

**Interfaces:**
- Consumes: 과제 7의 `Measurement`, `countGate`, `blank`, 과제 8의 `ToolUsage`. 1단계의 `maxVersion`, `parseVersion`, `compareVersions`(`src/adapters/common/version.ts`). 1부의 `ClaudeSetupFacts`, `ClaudeHooksFacts`, `ShellGuard`, `SetupProblem`, `FileStatus`.
- Produces: `unread(status: FileStatus | null): boolean`, `globalSettingsUnread(facts)`, `projectSettingsUnread(facts)`, `enablementUnread(facts)`, `mcpPlacesUnread(facts)`(`src/core/readability.ts`). `ToolSetup extends ToolUsage { setup: ClaudeSetupFacts; highestVersion: string | null }`, `highestMainVersion(summaries: readonly SessionSummary[]): string | null`, `mergedSetupRules(tools: readonly ToolSetup[]): Record<"S1" | "S2" | "S3", Measurement> & { safeguards: ToolSafeguard[] }`, `setupToolRules(tool: ToolSetup): Record<"S5", Measurement>`, `ToolSafeguard { tool; guardHook: boolean | null; permissionChecks: boolean | null }`, `MIN_GLOBAL_INSTRUCTION_BYTES`, `PROJECT_BYPASS_IGNORED_FROM`(`src/core/metrics/setup.ts`).

셋팅 규칙은 갖출 것이 멀쩡한지를 본다(설계 11.2). S1, S2, S3은 도구를 합쳐서 재고 S5는 도구마다 잰다.

**S1 전역 지침이 있다.** 전역 지침 파일들의 크기를 합쳐 200바이트 이상인 도구의 수를 쓰는 도구의 수로 나눈다. 쓰는 도구가 없으면 `no_data`다. 근거 숫자는 `tools`, `withInstructions`다.

**S2 안전장치가 있다.** 안전장치가 있는 도구의 수를 쓰는 도구의 수로 나눈다. Claude Code는 아래 둘 가운데 하나를 채우면 안전장치가 있다(설계 11.3).

| 조건 | 판정 |
|---|---|
| ㉠ 셸 명령을 덮는 도구 실행 전 확인 훅이 있다 | 스캐너가 낸 `hooks.guards` 가운데 `coversShell`과 `canBlock`이 참이고 훅을 제한하는 설정에 막히지 않는 것이 하나라도 있다 |
| ㉡ 기본 모드가 권한 우회가 아니다 | 사용자 설정과 관리 정책의 기본 모드(둘 다 정했으면 관리 정책의 값)가 `bypass`가 아니다 |

- **훅을 제한하는 설정**(설계 11.3의 제한 표). 관리 정책의 `disableAllHooks`는 모든 출처의 훅을 끈다. 사용자 설정의 `disableAllHooks`와 관리 정책의 `allowManagedHooksOnly`는 사용자 설정의 훅과 사용자 설정에서 켠 플러그인의 훅만 끈다. 제한이 둘 이상이면 하나라도 막는 훅은 돌지 않는다.
- **㉡의 버전.** 프로젝트 설정과 로컬 설정에 적은 권한 우회는 Claude Code 2.1.257부터 듣지 않는다. 읽은 주 세션의 버전 가운데 가장 높은 것(`highestMainVersion`)이 2.1.257 이상이면 사용자 설정과 관리 정책만 보고, 그보다 낮거나 버전을 아는 주 세션이 하나도 없으면 목록의 프로젝트 한 곳에라도 권한 우회가 있으면 기본 모드를 권한 우회로 본다. 버전은 숫자로 견주고, 세션마다의 버전만으로 정해지므로 읽는 차례와 상관없다(설계 9.3).
- **읽지 못했을 때.** 안전장치를 정하는 설정 파일 가운데 있는데 읽지 못한 것이 있으면 `unreadable`이다. 사용자 설정과 관리 정책을 이룬 파일이 늘 들고, 옛 버전으로 볼 때에는 목록의 프로젝트의 프로젝트 설정과 로컬 설정도 든다. 없는 파일은 읽지 못한 것이 아니다. 훅을 읽지 못한 플러그인과 설정 파일은 그 훅이 없는 것으로 볼 뿐이다(설계 20.1).
- **S2의 근거.** 도구마다 두 조건을 채웠는지를 `safeguards`로 낸다. 설정을 읽지 못해 정하지 못한 도구는 둘 다 `null`이다. 훅의 명령과 권한 규칙의 글은 싣지 않는다(설계 12.2). 근거 숫자는 `guarded`, `tools`다.

**S3 설정이 깨지지 않았다.** 스캐너가 낸 문제 가운데 주인이 사용자인 것만 센다. 플러그인 안의 것, 관리 정책 파일, 도구가 쓰는 상태 파일은 세지 않는다. 같은 실제 파일이나 폴더는 한 번만 센다. 늘 잰다. 근거 숫자는 `danglingLinks`, `noFrontmatter`, `problems`, `unparsable`이다.

**S5 MCP 연결이 안정적이다.** 점수 구간에 응답이 있는 주 세션 가운데 연결 실패가 있었던 세션의 몫이다. 근거 숫자는 `enabledServers`, `failedSessions`, `mainSessions`다. 켜져 있는 서버의 수는 과제 16에서 설치 단위로 세게 고친다. 정체가 같은 서버 사실 둘을 하나로 세는 것인데, 그 정체 열쇠가 과제 12에서 생긴다. 못 재는 때는 차례대로 아래와 같다.

| 차례 | 조건 | 이유 |
|---|---|---|
| 1 | 연결 실패를 못 보는 도구다 | `unsupported` |
| 2 | 켜짐을 정하는 설정 파일(사용자 설정, 관리 정책 파일, 프로젝트 설정, 로컬 설정) 가운데 읽지 못한 것이 있다 | `unreadable` |
| 3 | 켜져 있는 서버가 보이지 않는데 서버를 찾는 곳 가운데 읽지 못한 곳이 있다 | `unreadable` |
| 4 | 켜져 있는 서버가 하나도 없다 | `not_applicable` |
| 5 | 점수 구간에 응답이 있는 주 세션이 없다 | `no_data` |

- 재는지는 점검할 때의 셋팅으로 정하고 값은 점수 구간의 기록에서 낸다. 켜져 있는 서버가 없으면 지난 연결 실패가 있어도 재지 않는다(설계 11.3). 켜짐은 범위를 가리지 않고 보고, 정의가 PC에 없는 claude.ai 연결도 서버다.
- 서버를 찾는 곳은 `~/.claude.json`, 프로젝트의 `.mcp.json`, 플러그인의 설치 기록 파일, 켜져 있는 플러그인의 구성과 MCP 정의다. 설정에 켜 두었는데 설치 기록에 없는 플러그인도 구성을 모르는 플러그인이다. 사용자 스킬 폴더와 프로젝트의 스킬 폴더도 서버를 찾는 곳인데(그 폴더에 둔 플러그인이 서버를 넣을 수 있다), 그 폴더를 읽지 못했는지는 과제 10이 사실로 내므로 과제 10에서 잇는다.
- **차례 2는 이 계획이 설계에 보탠 것이다.** 설계는 켜져 있는 서버가 하나라도 보이면 잰다고 했고, 설정 파일을 읽지 못한 점검에서는 막아 둔 서버가 켜져 있는 것으로 보여 너그러운 쪽으로 틀린다고 한계로 적어 두었다(설계 27). 읽지 못한 설정은 빈 설정으로 읽히므로 그때의 "보이는 켜진 서버"는 믿을 수 없다. E5, E6, S2, F6이 설정 파일을 읽지 못하면 못 재는 것과 같은 선으로 맞춘다(「이 계획이 기대는 설계 보완」의 1번).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/metrics-setup.test.ts`(새 파일):

```ts
// 셋팅 규칙 넷(S1, S2, S3, S5)을 시험한다. 안전장치의 두 조건과 훅을 제한하는 설정, 버전으로 가르는 기본 모드, 읽지 못한 설정(설계 11.3 「셋팅」, 11.4 「규칙마다의 이유」, 21.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolCoverage, ToolId } from "../../src/adapters/types.ts";
import { highestMainVersion, mergedSetupRules, setupToolRules, type ToolSetup } from "../../src/core/metrics/setup.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { HookSource, ShellGuard } from "../../src/scan/hooks.ts";
import type { ClaudeSetupFacts, FileStatus, SetupProblem } from "../../src/scan/types.ts";
import { facts, instructionFile, instructions, mcpServer, plugin, project } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const D = "2026-11-10";

interface ToolOptions {
  id?: string;
  sessions?: SummaryInput[];
  coverage?: ToolCoverage;
  version?: string | null;
}
const tool = (setup: Partial<ClaudeSetupFacts> = {}, options: ToolOptions = {}): ToolSetup => ({
  tool: (options.id ?? "claude-code") as ToolId,
  totals: toolTotals((options.sessions ?? []).map((s) => summary(s)), windows, ["Bash"]),
  coverage: options.coverage ?? CLAUDE_COVERAGE,
  setup: facts(setup),
  highestVersion: options.version === undefined ? "2.1.300" : options.version,
});
const hooks = (input: Partial<ClaudeSetupFacts["hooks"]> = {}): ClaudeSetupFacts["hooks"] => ({ ...facts().hooks, ...input });
const guard = (source: HookSource = "user", input: Partial<ShellGuard> = {}): ShellGuard => ({ source, pluginId: null, coversShell: true, canBlock: true, ...input });
const mode = (user: "bypass" | "other" | null, managed: "bypass" | "other" | null = null, status: FileStatus = "ok"): ClaudeSetupFacts["settings"] => ({
  user: status,
  managedParts: [],
  defaultMode: { user, managed },
});
const BYPASS = mode("bypass");

describe("S1 전역 지침이 있다", () => {
  const withBytes = (bytes: number): Partial<ClaudeSetupFacts> => ({ globalInstructions: instructions({ files: [instructionFile("/home/u/.claude/CLAUDE.md", { bytes })] }) });
  it("전역 지침 파일들의 크기를 합쳐 200바이트 이상인 도구의 몫이다", () => {
    expect(mergedSetupRules([tool(withBytes(200))]).S1).toEqual({ status: "scored", value: 1, evidence: { tools: 1, withInstructions: 1 } });
    expect(mergedSetupRules([tool(withBytes(199))]).S1).toEqual({ status: "scored", value: 0, evidence: { tools: 1, withInstructions: 0 } });
    expect(mergedSetupRules([tool(withBytes(5000)), tool({}, { id: "codex" })]).S1).toMatchObject({ status: "scored", value: 0.5 });
  });
  it("크기는 파일을 합쳐서 본다. 규칙 파일로만 나눠 둔 지침도 지침이다", () => {
    const split = instructions({ files: [instructionFile("/home/u/.claude/rules/a.md", { bytes: 120 }), instructionFile("/home/u/.claude/rules/b.md", { bytes: 80 })] });
    expect(mergedSetupRules([tool({ globalInstructions: split })]).S1).toMatchObject({ status: "scored", value: 1 });
  });
  it("쓰는 도구가 없으면 no_data다", () => {
    expect(mergedSetupRules([]).S1).toEqual({ status: "unmeasured", reason: "no_data", evidence: { tools: 0, withInstructions: 0 } });
  });
});

describe("S2 안전장치가 있다", () => {
  const s2 = (setup: Partial<ClaudeSetupFacts>, options: ToolOptions = {}) => mergedSetupRules([tool(setup, options)]);

  it("기본 모드가 권한 우회가 아니면 권한 규칙이나 훅이 없어도 안전장치가 있다(㉡)", () => {
    for (const settings of [mode(null), mode("other"), mode(null, "other")]) {
      const result = s2({ settings });
      expect(result.S2).toEqual({ status: "scored", value: 1, evidence: { guarded: 1, tools: 1 } });
      expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: true }]);
    }
  });
  it("㉡은 훅을 보지 않는다. 훅을 모두 꺼 두어도 채운다", () => {
    expect(s2({ settings: mode("other"), hooks: hooks({ userDisableAll: true, managedDisableAll: true }) }).S2).toMatchObject({ status: "scored", value: 1 });
  });
  it("기본 모드가 권한 우회이고 확인 훅이 없으면 안전장치가 없다", () => {
    const result = s2({ settings: BYPASS });
    expect(result.S2).toEqual({ status: "scored", value: 0, evidence: { guarded: 0, tools: 1 } });
    expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: false }]);
  });
  it("권한 우회 모드라도 셸 명령을 덮고 실행을 막을 수 있는 확인 훅이 있으면 안전장치가 있다(㉠)", () => {
    const result = s2({ settings: BYPASS, hooks: hooks({ guards: [guard("user")] }) });
    expect(result.S2).toMatchObject({ status: "scored", value: 1 });
    expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: true, permissionChecks: false }]);
  });
  it("셸 명령 도구에 걸려 있지 않거나 뒤에서 도는 훅은 확인 훅이 아니다", () => {
    expect(s2({ settings: BYPASS, hooks: hooks({ guards: [guard("user", { coversShell: false })] }) }).S2).toMatchObject({ value: 0 });
    expect(s2({ settings: BYPASS, hooks: hooks({ guards: [guard("user", { canBlock: false })] }) }).S2).toMatchObject({ value: 0 });
    expect(s2({ settings: BYPASS, hooks: hooks({ guards: [guard("user", { coversShell: false }), guard("user", { canBlock: false })] }) }).S2).toMatchObject({ value: 0 });
  });

  const SOURCES: HookSource[] = ["managed", "managed-plugin", "user", "user-plugin"];
  it.each([
    ["제한하는 설정이 없다", {}, [true, true, true, true]],
    ["사용자 설정의 disableAllHooks", { userDisableAll: true }, [true, true, false, false]],
    ["관리 정책의 allowManagedHooksOnly", { managedAllowManagedOnly: true }, [true, true, false, false]],
    ["관리 정책의 disableAllHooks", { managedDisableAll: true }, [false, false, false, false]],
    ["사용자 설정의 disableAllHooks와 관리 정책의 disableAllHooks", { userDisableAll: true, managedDisableAll: true }, [false, false, false, false]],
  ] as const)("훅을 제한하는 설정: %s", (_name, limits, runs) => {
    const guarded = SOURCES.map((source) => s2({ settings: BYPASS, hooks: hooks({ guards: [guard(source)], ...limits }) }).safeguards[0]!.guardHook);
    expect(guarded).toEqual(runs);
  });

  it("사용자 설정과 관리 정책이 기본 모드를 둘 다 정했으면 관리 정책의 값이다", () => {
    expect(s2({ settings: mode("other", "bypass") }).S2).toMatchObject({ status: "scored", value: 0 });
    expect(s2({ settings: mode("bypass", "other") }).S2).toMatchObject({ status: "scored", value: 1 });
  });

  describe("프로젝트 설정과 로컬 설정에 적은 권한 우회는 버전으로 갈라 본다", () => {
    const inProject = { settings: mode(null), projects: [project("/work/a"), project("/work/b", { hasSettings: true, settingsStatus: "ok" as const, bypassInProject: true })] };
    const inLocal = { settings: mode(null), projects: [project("/work/b", { hasLocalSettings: true, localSettingsStatus: "ok" as const, bypassInLocal: true })] };
    it("가장 높은 버전이 2.1.257 이상이면 사용자 설정과 관리 정책만 본다", () => {
      expect(s2(inProject, { version: "2.1.257" }).S2).toMatchObject({ status: "scored", value: 1 });
      expect(s2(inLocal, { version: "2.2.0" }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("그보다 낮으면 한 곳에라도 있으면 기본 모드를 권한 우회로 본다. 숫자로 견준다", () => {
      expect(s2(inProject, { version: "2.1.256" }).S2).toMatchObject({ status: "scored", value: 0 });
      expect(s2(inLocal, { version: "2.1.99" }).S2).toMatchObject({ status: "scored", value: 0 });
    });
    it("버전을 아는 주 세션이 하나도 없으면 옛 버전처럼 본다", () => {
      expect(s2(inProject, { version: null }).S2).toMatchObject({ status: "scored", value: 0 });
    });
    it("그때에도 확인 훅이 있으면 안전장치가 있다(㉠만 남는다)", () => {
      const result = s2({ ...inProject, hooks: hooks({ guards: [guard("managed")] }) }, { version: "2.1.200" });
      expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: true, permissionChecks: false }]);
      expect(result.S2).toMatchObject({ status: "scored", value: 1 });
    });
  });

  describe("안전장치를 정하는 설정 파일 가운데 있는데 읽지 못한 것이 있으면 unreadable이다", () => {
    const unread = { status: "unmeasured", reason: "unreadable", evidence: { guarded: null, tools: 1 } };
    it("사용자 설정이 풀리지 않거나 열리지 않는다", () => {
      for (const status of ["unparsable", "unreadable"] as const) {
        const result = s2({ settings: mode(null, null, status) });
        expect(result.S2).toEqual(unread);
        expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: null, permissionChecks: null }]);
      }
    });
    it("관리 정책을 이룬 파일 가운데 하나를 읽지 못했다", () => {
      const settings = { ...mode("other"), managedParts: [{ path: "/etc/claude-code/managed-settings.json", status: "ok" as const }, { path: "/etc/claude-code/managed-settings.d/10.json", status: "unreadable" as const }] };
      expect(s2({ settings }).S2).toEqual(unread);
    });
    it("프로젝트 설정이나 로컬 설정은 옛 버전에서만 안전장치를 정한다", () => {
      const projects = [project("/work/a", { hasLocalSettings: true, localSettingsStatus: "unparsable" })];
      expect(s2({ projects }, { version: "2.1.256" }).S2).toEqual(unread);
      expect(s2({ projects }, { version: null }).S2).toEqual(unread);
      expect(s2({ projects }, { version: "2.1.257" }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("없는 설정 파일은 읽지 못한 것이 아니다", () => {
      const settings = { ...mode(null, null, "missing"), managedParts: [] };
      expect(s2({ settings, projects: [project("/work/a")] }, { version: null }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("훅을 읽지 못한 플러그인과 설정 파일은 그 훅이 없는 것으로 볼 뿐이다", () => {
      const unreadableHooks = hooks({ unreadablePlugins: ["guard@market"], unreadableSettings: ["/home/u/.claude/settings.json"] });
      expect(s2({ settings: BYPASS, hooks: unreadableHooks }).S2).toMatchObject({ status: "scored", value: 0 });
      expect(s2({ settings: mode("other"), hooks: unreadableHooks }).S2).toMatchObject({ status: "scored", value: 1 });
    });
  });

  it("안전장치가 있는 도구 수를 쓰는 도구 수로 나눈다. 쓰는 도구가 없으면 no_data다", () => {
    const result = mergedSetupRules([tool({ settings: BYPASS }), tool({ settings: mode("other") }, { id: "codex" })]);
    expect(result.S2).toEqual({ status: "scored", value: 0.5, evidence: { guarded: 1, tools: 2 } });
    expect(result.safeguards.map((s) => s.tool)).toEqual(["claude-code", "codex"]);
    expect(mergedSetupRules([]).S2).toEqual({ status: "unmeasured", reason: "no_data", evidence: { guarded: 0, tools: 0 } });
    expect(mergedSetupRules([]).safeguards).toEqual([]);
  });
});

describe("highestMainVersion", () => {
  const versions = (...list: (string | null)[]) => list.map((version) => summary({ version }));
  it("주 세션의 버전 가운데 숫자로 견주어 가장 높은 것이다. 읽는 차례와 상관없다", () => {
    expect(highestMainVersion(versions("2.1.250", "2.1.300"))).toBe("2.1.300");
    expect(highestMainVersion(versions("2.1.300", "2.1.250"))).toBe("2.1.300");
    expect(highestMainVersion(versions("2.1.99", "2.1.257"))).toBe("2.1.257");
  });
  it("버전을 읽지 못한 세션과 하위 세션은 뺀다. 남는 것이 없으면 null이다", () => {
    expect(highestMainVersion([...versions(null, "next", "2.1.300"), summary({ kind: "sub", version: "9.0.0" })])).toBe("2.1.300");
    expect(highestMainVersion([...versions(null, "2.1"), summary({ kind: "sub", version: "2.1.300" })])).toBeNull();
    expect(highestMainVersion([])).toBeNull();
  });
});

describe("S3 설정이 깨지지 않았다", () => {
  const problem = (kind: SetupProblem["kind"], path: string, input: Partial<SetupProblem> = {}): SetupProblem => ({ kind, owner: "user", path, realPath: path, ...input });
  it("사용자가 직접 고치는 셋팅의 문제만 센다", () => {
    const problems = [
      problem("unparsable", "/home/u/.claude/settings.json"),
      problem("unparsable", "/work/a/.mcp.json"),
      problem("noFrontmatter", "/home/u/.claude/skills/x"),
      problem("danglingLink", "/home/u/.claude/skills/gone", { realPath: null }),
      problem("unparsable", "/etc/claude-code/managed-settings.json", { owner: "managed" }),
      problem("noFrontmatter", "/home/u/.claude/plugins/cache/p/skills/y", { owner: "plugin" }),
      problem("unparsable", "/home/u/.claude.json", { owner: "tool" }),
    ];
    expect(mergedSetupRules([tool({ problems })]).S3).toEqual({ status: "scored", value: 4, evidence: { danglingLinks: 1, noFrontmatter: 1, problems: 4, unparsable: 2 } });
  });
  it("같은 실제 파일이나 폴더는 한 번만 센다", () => {
    const linked = [problem("noFrontmatter", "/home/u/.claude/skills/x", { realPath: "/shared/x" }), problem("noFrontmatter", "/work/a/.claude/skills/x", { realPath: "/shared/x" })];
    expect(mergedSetupRules([tool({ problems: linked })]).S3).toMatchObject({ status: "scored", value: 1 });
    const twoTools = [tool({ problems: [problem("unparsable", "/work/a/.mcp.json")] }), tool({ problems: [problem("unparsable", "/work/a/.mcp.json")] }, { id: "codex" })];
    expect(mergedSetupRules(twoTools).S3).toMatchObject({ status: "scored", value: 1 });
  });
  it("문제가 없어도, 쓰는 도구가 없어도 잰다", () => {
    expect(mergedSetupRules([tool()]).S3).toEqual({ status: "scored", value: 0, evidence: { danglingLinks: 0, noFrontmatter: 0, problems: 0, unparsable: 0 } });
    expect(mergedSetupRules([]).S3).toMatchObject({ status: "scored", value: 0 });
  });
});

describe("S5 MCP 연결이 안정적이다", () => {
  const session = (mcpConnectionFailure: boolean, input: SummaryInput = {}): SummaryInput => ({ days: { [D]: { responses: 1, mcpConnectionFailure } }, ...input });
  const SESSIONS = [session(true), session(false), session(false), session(false), session(true, { kind: "sub" })];
  const s5 = (setup: Partial<ClaudeSetupFacts>, options: ToolOptions = {}) => setupToolRules(tool(setup, { sessions: SESSIONS, ...options })).S5;
  const SERVER = { mcpServers: [mcpServer("db")] };

  it("점수 구간에 응답이 있는 주 세션 가운데 연결 실패가 있었던 세션의 몫이다", () => {
    expect(s5(SERVER)).toEqual({ status: "scored", value: 0.25, evidence: { enabledServers: 1, failedSessions: 1, mainSessions: 4 } });
  });
  it("켜져 있는 서버가 하나도 없으면 지난 연결 실패가 있어도 not_applicable이다", () => {
    expect(s5({})).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { enabledServers: 0, failedSessions: 1, mainSessions: 4 } });
    expect(s5({ mcpServers: [mcpServer("db", { enabled: false })] })).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it("범위를 가리지 않고 켜져 있는 서버를 모두 본다. 정의가 PC에 없는 연결도 서버다", () => {
    expect(s5({ mcpServers: [mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null })] })).toMatchObject({ status: "scored", value: 0.25 });
    expect(s5({ mcpServers: [mcpServer("db", { enabled: false }), mcpServer("p", { scope: "plugin", pluginId: "p@m" })] })).toMatchObject({ status: "scored", evidence: { enabledServers: 1 } });
  });
  it.each([
    ["~/.claude.json이 풀리지 않는다", { claudeJson: "unparsable" }],
    ["~/.claude.json을 열지 못한다", { claudeJson: "unreadable" }],
    ["프로젝트의 .mcp.json을 읽지 못한다", { projects: [project("/work/a", { mcpJsonStatus: "unparsable" })] }],
    ["플러그인의 설치 기록 파일을 읽지 못한다", { pluginsFile: "unreadable" }],
    ["켜져 있는 플러그인의 구성을 모른다", { plugins: [plugin("p@m", { compositionKnown: false })] }],
    ["켜져 있는 플러그인의 MCP 정의를 읽지 못한다", { plugins: [plugin("p@m", { mcpUnreadable: true })] }],
    ["설정에 켜 둔 플러그인이 설치 기록에 없다", { pluginsWithoutInstall: ["p@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("서버를 찾는 곳을 읽지 못했다: %s", (_name, setup) => {
    // 보이는 켜진 서버가 없으면 없다고 할 수 없다. 보이는 켜진 서버가 하나라도 있으면 잰다
    expect(s5(setup)).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { enabledServers: null, failedSessions: 1, mainSessions: 4 } });
    expect(s5({ ...setup, ...SERVER })).toMatchObject({ status: "scored", value: 0.25 });
  });
  it("없는 파일과 꺼 둔 플러그인은 읽지 못한 곳이 아니다", () => {
    const setup: Partial<ClaudeSetupFacts> = {
      claudeJson: "missing",
      pluginsFile: "missing",
      projects: [project("/work/a")],
      plugins: [plugin("off@m", { enabled: false, compositionKnown: false, mcpUnreadable: true })],
    };
    expect(s5(setup)).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it.each([
    ["사용자 설정", { settings: mode(null, null, "unparsable") }],
    ["관리 정책 파일", { settings: { ...mode(null), managedParts: [{ path: "/etc/claude-code/managed-settings.json", status: "unreadable" }] } }],
    ["프로젝트 설정", { projects: [project("/work/a", { hasSettings: true, settingsStatus: "unreadable" })] }],
    ["로컬 설정", { projects: [project("/work/a", { hasLocalSettings: true, localSettingsStatus: "unparsable" })] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("켜짐을 정하는 설정 파일을 읽지 못했으면 켜진 서버가 보여도 unreadable이다: %s", (_name, setup) => {
    expect(s5({ ...setup, ...SERVER })).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { enabledServers: null, failedSessions: 1, mainSessions: 4 } });
  });
  it("켜져 있는 서버는 있는데 점수 구간에 응답이 있는 주 세션이 없으면 no_data다", () => {
    expect(s5(SERVER, { sessions: [session(true, { kind: "sub" })] })).toEqual({ status: "unmeasured", reason: "no_data", evidence: { enabledServers: 1, failedSessions: 0, mainSessions: 0 } });
  });
  it("연결 실패를 못 보는 도구는 unsupported이고, 그것이 다른 까닭보다 앞선다", () => {
    const blind: ToolCoverage = { ...CLAUDE_COVERAGE, mcpFailuresAndHooks: "unsupported" };
    expect(s5({ settings: mode(null, null, "unparsable") }, { coverage: blind })).toEqual({ status: "unmeasured", reason: "unsupported", evidence: { enabledServers: null, failedSessions: null, mainSessions: null } });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/metrics-setup.test.ts`
Expected: FAIL. `../../src/core/metrics/setup.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/metrics/setup.ts`(새 파일):

```ts
// 셋팅 규칙 넷을 잰다. 도구를 합치는 S1, S2, S3과 도구별 규칙 S5(순수 함수, 설계 11.3 「셋팅」, 11.4 「규칙마다의 이유」)
import { compareVersions, maxVersion, parseVersion, type Version } from "../../adapters/common/version.ts";
import type { SessionSummary, ToolId } from "../../adapters/types.ts";
import type { ShellGuard } from "../../scan/hooks.ts";
import type { ClaudeHooksFacts, ClaudeSetupFacts, SetupProblem } from "../../scan/types.ts";
import { blank, countGate, scored, unmeasured, type Measurement } from "../measure.ts";
import { enablementUnread, globalSettingsUnread, mcpPlacesUnread, projectSettingsUnread } from "../readability.ts";
import type { ToolUsage } from "../totals.ts";

/** 점수에 넣는 도구 하나의 구간 합계, 관측 범위, 셋팅 사실 */
export interface ToolSetup extends ToolUsage {
  setup: ClaudeSetupFacts;
  /** 읽은 주 세션의 버전 가운데 가장 높은 것(highestMainVersion). 버전을 아는 주 세션이 없으면 null */
  highestVersion: string | null;
}

/** 전역 지침 파일들의 크기를 합쳐 이만큼이면 전역 지침이 있는 것이다(설계 11.3 S1) */
export const MIN_GLOBAL_INSTRUCTION_BYTES = 200;

/** 프로젝트 설정과 로컬 설정에 적은 권한 우회는 이 버전부터 듣지 않는다(설계 11.3 「㉡을 보는 곳」) */
export const PROJECT_BYPASS_IGNORED_FROM: Version = [2, 1, 257];

/**
 * 읽은 주 세션의 버전 가운데 숫자로 견주어 가장 높은 것. 세 숫자 꼴로 읽히지 않는 버전과 하위 세션은 뺀다.
 * 세션마다의 버전만으로 정해지므로 파일을 읽는 차례나 캐시와 상관없이 같다(설계 9.3, 11.3).
 */
export function highestMainVersion(summaries: readonly SessionSummary[]): string | null {
  return maxVersion(summaries.filter((summary) => summary.kind === "main").map((summary) => summary.version));
}

/** 도구 하나의 안전장치. 설정을 읽지 못해 정하지 못했으면 둘 다 null이다. 훅의 명령과 권한 규칙의 글은 싣지 않는다(설계 12.2) */
export interface ToolSafeguard {
  tool: ToolId;
  /** ㉠ 셸 명령을 덮는 도구 실행 전 확인 훅이 있고 꺼져 있지 않다 */
  guardHook: boolean | null;
  /** ㉡ 기본 모드가 권한 우회가 아니다(도구의 권한 확인이 돈다) */
  permissionChecks: boolean | null;
}

/** 훅을 제한하는 설정에 막히지 않는지(설계 11.3의 제한 표). 제한이 둘 이상이면 하나라도 막는 훅은 돌지 않는다 */
function guardRuns(guard: ShellGuard, hooks: ClaudeHooksFacts): boolean {
  if (hooks.managedDisableAll) return false;
  const fromManaged = guard.source === "managed" || guard.source === "managed-plugin";
  return fromManaged || !(hooks.userDisableAll || hooks.managedAllowManagedOnly);
}

function seesProjectBypass(highestVersion: string | null): boolean {
  const version = parseVersion(highestVersion);
  return version === null || compareVersions(version, PROJECT_BYPASS_IGNORED_FROM) < 0;
}

function safeguardOf(tool: ToolSetup): ToolSafeguard {
  const { setup } = tool;
  const old = seesProjectBypass(tool.highestVersion);
  if (globalSettingsUnread(setup) || (old && projectSettingsUnread(setup))) return { tool: tool.tool, guardHook: null, permissionChecks: null };
  const guardHook = setup.hooks.guards.some((guard) => guard.coversShell && guard.canBlock && guardRuns(guard, setup.hooks));
  // 사용자 설정과 관리 정책이 둘 다 정했으면 관리 정책의 값이다. 옛 버전에서는 프로젝트 쪽 한 곳에라도 권한 우회가 있으면 권한 우회로 본다
  const mode = setup.settings.defaultMode.managed ?? setup.settings.defaultMode.user;
  const bypass = mode === "bypass" || (old && setup.projects.some((project) => project.bypassInProject || project.bypassInLocal));
  return { tool: tool.tool, guardHook, permissionChecks: !bypass };
}

function s1(tools: readonly ToolSetup[]): Measurement {
  const withInstructions = tools.filter((tool) => tool.setup.globalInstructions.bytes >= MIN_GLOBAL_INSTRUCTION_BYTES).length;
  const evidence = { tools: tools.length, withInstructions };
  return countGate(true, tools.length, 1, evidence) ?? scored(withInstructions / tools.length, evidence);
}

function s2(tools: readonly ToolSetup[], safeguards: readonly ToolSafeguard[]): Measurement {
  // 한 도구라도 설정을 읽지 못했으면 규칙을 재지 않는다. 읽은 도구만으로 재면 읽지 못한 도구의 몫이 빠진다
  if (safeguards.some((safeguard) => safeguard.guardHook === null)) return unmeasured("unreadable", { guarded: null, tools: tools.length });
  const guarded = safeguards.filter((safeguard) => safeguard.guardHook === true || safeguard.permissionChecks === true).length;
  const evidence = { guarded, tools: tools.length };
  return countGate(true, tools.length, 1, evidence) ?? scored(guarded / tools.length, evidence);
}

const PROBLEM_COUNTERS = { danglingLink: "danglingLinks", noFrontmatter: "noFrontmatter", unparsable: "unparsable" } as const satisfies Record<SetupProblem["kind"], string>;

function s3(tools: readonly ToolSetup[]): Measurement {
  const counts = { danglingLinks: 0, noFrontmatter: 0, unparsable: 0 };
  const seen = new Set<string>();
  for (const tool of tools) {
    for (const problem of tool.setup.problems) {
      // 사용자가 직접 고치는 셋팅만 센다. 플러그인 안의 것, 관리 정책 파일, 도구가 쓰는 상태 파일은 세지 않는다
      if (problem.owner !== "user") continue;
      const place = problem.realPath ?? problem.path;
      if (seen.has(place)) continue;
      seen.add(place);
      counts[PROBLEM_COUNTERS[problem.kind]]++;
    }
  }
  return scored(seen.size, { danglingLinks: counts.danglingLinks, noFrontmatter: counts.noFrontmatter, problems: seen.size, unparsable: counts.unparsable });
}

function s5(tool: ToolSetup): Measurement {
  const { setup, totals } = tool;
  const enabledServers = setup.mcpServers.filter((server) => server.enabled).length;
  const failedSessions = totals.mainSessions.filter((session) => session.mcpConnectionFailure).length;
  const evidence = { enabledServers, failedSessions, mainSessions: totals.mainSessions.length };
  if (tool.coverage.mcpFailuresAndHooks === "unsupported") return unmeasured("unsupported", blank(evidence));
  // 켜짐을 정하는 설정을 읽지 못한 점검에서는 막아 둔 서버가 켜져 있는 것으로 보인다. 보이는 켜진 서버를 믿을 수 없다
  if (enablementUnread(setup)) return unmeasured("unreadable", { ...evidence, enabledServers: null });
  // 재는지는 지금의 셋팅으로 정한다. 켜져 있는 서버가 없으면 지난 연결 실패가 있어도 재지 않는다. 없다는 것은 다 읽었을 때만 말한다
  if (enabledServers === 0) return mcpPlacesUnread(setup) ? unmeasured("unreadable", { ...evidence, enabledServers: null }) : unmeasured("not_applicable", evidence);
  return countGate(true, totals.mainSessions.length, 1, evidence) ?? scored(failedSessions / totals.mainSessions.length, evidence);
}

/** 도구를 합쳐서 재는 셋팅 규칙. tools는 점수에 넣는 도구다. safeguards는 S2의 근거이고 도구의 차례 그대로다. */
export function mergedSetupRules(tools: readonly ToolSetup[]): Record<"S1" | "S2" | "S3", Measurement> & { safeguards: ToolSafeguard[] } {
  const safeguards = tools.map(safeguardOf);
  return { S1: s1(tools), S2: s2(tools, safeguards), S3: s3(tools), safeguards };
}

/** 도구 하나에서 재는 셋팅 규칙 */
export function setupToolRules(tool: ToolSetup): Record<"S5", Measurement> {
  return { S5: s5(tool) };
}
```

`src/core/readability.ts`(새 파일):

```ts
// 셋팅 사실에서 "있는데 읽지 못한 것"을 가른다. 없는 파일과 폴더는 읽지 못한 것이 아니다(순수 함수, 설계 11.3, 11.4, 20.1)
import type { ClaudeSetupFacts, FileStatus } from "../scan/types.ts";

/** 있는데 열지 못했거나, 열었는데 풀리지 않았다. 읽지 않은 곳(null)과 없는 파일은 아니다 */
export const unread = (status: FileStatus | null): boolean => status === "unparsable" || status === "unreadable";

/** 사용자 설정이나 관리 정책을 이룬 파일 가운데 읽지 못한 것이 있다 */
export function globalSettingsUnread(facts: ClaudeSetupFacts): boolean {
  return unread(facts.settings.user) || facts.settings.managedParts.some((part) => unread(part.status));
}

/** 스캐너가 셋팅을 읽는 프로젝트의 프로젝트 설정이나 로컬 설정 가운데 읽지 못한 것이 있다 */
export function projectSettingsUnread(facts: ClaudeSetupFacts): boolean {
  return facts.projects.some((project) => unread(project.settingsStatus) || unread(project.localSettingsStatus));
}

/**
 * 설치가 켜져 있는지를 정하는 설정 파일(사용자 설정, 관리 정책 파일, 프로젝트 설정, 로컬 설정) 가운데 읽지 못한 것이 있다.
 * 그 점검에서는 꺼 두거나 막아 둔 것이 켜져 있는 것으로 보인다(설계 11.3 「읽지 못했을 때」, 20.1).
 */
export function enablementUnread(facts: ClaudeSetupFacts): boolean {
  return globalSettingsUnread(facts) || projectSettingsUnread(facts);
}

/**
 * MCP 서버를 찾는 곳 가운데 읽지 못한 곳이 있다. ~/.claude.json, 프로젝트의 .mcp.json, 플러그인의 설치 기록 파일,
 * 켜져 있는 플러그인의 구성과 MCP 정의다. 켜 둔 플러그인이 설치 기록에 없는 것도 구성을 모르는 플러그인이다(설계 10, 11.3 S5).
 */
export function mcpPlacesUnread(facts: ClaudeSetupFacts): boolean {
  return (
    unread(facts.claudeJson) ||
    unread(facts.pluginsFile) ||
    facts.projects.some((project) => unread(project.mcpJsonStatus)) ||
    facts.plugins.some((plugin) => plugin.enabled && (!plugin.compositionKnown || plugin.mcpUnreadable)) ||
    facts.pluginsWithoutInstall.length > 0
  );
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 6개, 시험 111개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/metrics-setup.test.ts src/core/metrics/setup.ts src/core/readability.ts
git commit -m "feat: 셋팅 규칙 S1·S2·S3·S5 추가"
```

---

### Task 10: 1부 보완. 목록을 읽지 못한 스킬 폴더가 누구의 것인지 낸다

**Files:**
- Modify: `test/core/metrics-setup.test.ts`
- Modify: `src/core/readability.ts`
- Modify: `src/scan/claude.ts`
- Modify: `src/scan/types.ts`
- Modify: `test/helpers/facts.ts`
- Test: `test/scan/unreadable-places.test.ts`

**Interfaces:**
- Consumes: 1부의 `scanClaudeSetup`, `ClaudeSetupFacts.unreadableDirs`, `SkillRootScan.unreadableDirs`. 과제 9의 `mcpPlacesUnread`(`src/core/readability.ts`)와 S5의 시험(`test/core/metrics-setup.test.ts`).
- Produces: `ClaudeSetupFacts.unreadableSkillPlaces: { user: boolean; projects: string[]; plugins: string[] }`. `projects`는 정규화한 프로젝트 뿌리, `plugins`는 플러그인 ID이고 둘 다 글자 차례다. 이 과제에서 S5가 쓰고(`mcpPlacesUnread`가 `user`와 `projects`를 본다), 과제 11의 F5, 과제 15의 E5, 과제 16의 E6, 과제 17의 A2가 쓴다.

설계 11.3은 스킬 폴더의 목록을 읽지 못했을 때를 누구의 폴더인지로 가른다. 사용자 스킬 폴더와 프로젝트의 스킬 폴더는 F5, E5, E6을 못 재게 하고, 플러그인의 스킬을 찾는 폴더는 그 플러그인의 스킬만 세지 않게 한다. 1부의 셋팅 사실은 읽지 못한 폴더의 경로만 내서(`unreadableDirs`), 누구의 것인지 알려면 경로를 견줘야 한다. core는 경로를 다루지 않으므로 스캐너가 읽는 그 자리에서 주인을 함께 낸다.

- `unreadableDirs`는 그대로 둔다. 알림과 과제 4의 `unseenInUnreadablePlace`가 쓴다.
- **S5에 잇는다.** 사용자 스킬 폴더와 프로젝트의 스킬 폴더는 MCP 서버를 찾는 곳이기도 하다. 그 폴더에 둔 플러그인은 설정에 열쇠가 없어도 켜지고 서버를 넣을 수 있다(설계 10 「스킬 폴더에 둔 플러그인」). 목록을 읽지 못하면 그런 플러그인을 찾지 못한 것이라, 보이는 켜진 서버가 없어도 없다고 할 수 없다. 과제 9의 `mcpPlacesUnread`에 `unreadableSkillPlaces.user`와 `.projects`를 더한다. 켜진 서버가 하나라도 보이면 전처럼 잰다. 플러그인 안의 스킬을 찾는 폴더(`.plugins`)는 서버를 찾는 곳이 아니라서 넣지 않는다. 과제 9에서 넣지 않은 것은 그때는 이 사실이 없어서다.
- 시험은 폴더 목록 읽기(`readdir`)를 가로채 권한 오류를 낸다. 폴더 자리에 파일을 두는 방법은 쓰지 못한다. 그런 자리는 없는 폴더로 읽힌다(1부의 `listDir`).
- 시험 도우미 `facts`의 기본값에 이 필드를 더한다. 타입이 요구한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/metrics-setup.test.ts`(찾을 곳 1/2):

```ts
    ["켜져 있는 플러그인의 MCP 정의를 읽지 못한다", { plugins: [plugin("p@m", { mcpUnreadable: true })] }],
    ["설정에 켜 둔 플러그인이 설치 기록에 없다", { pluginsWithoutInstall: ["p@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("서버를 찾는 곳을 읽지 못했다: %s", (_name, setup) => {
    // 보이는 켜진 서버가 없으면 없다고 할 수 없다. 보이는 켜진 서버가 하나라도 있으면 잰다
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 1/2):

```ts
    ["켜져 있는 플러그인의 MCP 정의를 읽지 못한다", { plugins: [plugin("p@m", { mcpUnreadable: true })] }],
    ["설정에 켜 둔 플러그인이 설치 기록에 없다", { pluginsWithoutInstall: ["p@m"] }],
    // 스킬 폴더에 둔 플러그인은 설정에 열쇠가 없어도 켜지고 MCP 서버를 넣을 수 있다. 그 폴더의 목록을 읽지 못하면 그런 플러그인을 찾지 못한 것이다
    ["사용자 스킬 폴더의 목록을 읽지 못한다", { unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }],
    ["프로젝트 스킬 폴더의 목록을 읽지 못한다", { unreadableSkillPlaces: { user: false, projects: ["/work/a"], plugins: [] } }],
  ] as [string, Partial<ClaudeSetupFacts>][])("서버를 찾는 곳을 읽지 못했다: %s", (_name, setup) => {
    // 보이는 켜진 서버가 없으면 없다고 할 수 없다. 보이는 켜진 서버가 하나라도 있으면 잰다
```

`test/core/metrics-setup.test.ts`(찾을 곳 2/2):

```ts
    expect(s5(setup)).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it.each([
    ["사용자 설정", { settings: mode(null, null, "unparsable") }],
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 2/2):

```ts
    expect(s5(setup)).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it("플러그인 안의 스킬을 찾는 폴더를 읽지 못한 것은 서버를 찾는 곳을 읽지 못한 것이 아니다", () => {
    const setup: Partial<ClaudeSetupFacts> = { plugins: [plugin("p@m")], unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } };
    expect(s5(setup)).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it.each([
    ["사용자 설정", { settings: mode(null, null, "unparsable") }],
```

`test/scan/unreadable-places.test.ts`(새 파일):

```ts
// 목록을 읽지 못한 스킬 폴더가 누구의 것인지를 스캐너가 가르는지 시험한다. 사용자의 것, 프로젝트의 것, 플러그인의 것(설계 11.3 F5와 E5의 「읽지 못했을 때」)
import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { scanClaudeSetup, type ScanInput } from "../../src/scan/claude.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, readdir: vi.fn(real.readdir) };
});
const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

/** 이 폴더들의 목록 읽기를 권한 오류로 막는다. 폴더 자리에 파일을 두는 것은 없는 폴더로 읽히므로 쓰지 못한다 */
const deny = (...dirs: string[]): void => {
  vi.mocked(fsp.readdir).mockImplementation((async (path: unknown, ...rest: unknown[]) => {
    if (dirs.includes(String(path))) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    return (actual.readdir as (...args: unknown[]) => unknown)(path, ...rest);
  }) as never);
};

const json = (value: unknown): string => JSON.stringify(value);
const skill = (name: string): string => `---\nname: ${name}\ndescription: 시험용 스킬\n---\n`;

let root: string;
let input: ScanInput;
let userSkills: string;
let projectSkills: string;
let pluginSkills: string;
let proj: string;

beforeEach(async () => {
  root = await makeTemp();
  const home = join(root, "home");
  const claude = join(home, ".claude");
  proj = join(root, "work", "proj");
  userSkills = join(claude, "skills");
  projectSkills = join(proj, ".claude", "skills");
  const pa = join(claude, "plugins", "cache", "m", "pa", "1.0.0");
  pluginSkills = join(pa, "skills");
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(userSkills, "us", "SKILL.md"), skill("us"));
  await put(join(projectSkills, "ps", "SKILL.md"), skill("ps"));
  await put(join(pa, ".claude-plugin", "plugin.json"), json({ name: "pa" }));
  await put(join(pluginSkills, "s1", "SKILL.md"), skill("s1"));
  await put(join(claude, "plugins", "installed_plugins.json"), json({ version: 2, plugins: { "pa@m": [{ scope: "user", installPath: pa, version: "1.0.0" }] } }));
  const market = join(root, "market-m");
  await put(join(market, ".claude-plugin", "marketplace.json"), json({ name: "m", plugins: [{ name: "pa", source: "./pa" }] }));
  await put(join(claude, "plugins", "known_marketplaces.json"), json({ m: { source: { source: "github" }, installLocation: market } }));
  await put(join(claude, "settings.json"), json({ enabledPlugins: { "pa@m": true } }));
  input = { env: {}, homedir: home, tmpdir: join(root, "os-tmp"), platform: process.platform, cwds: [proj], claudeAiNames: [], salt: "5a".repeat(32), managedDir: join(root, "managed") };
});
afterEach(async () => {
  vi.mocked(fsp.readdir).mockImplementation(actual.readdir as never);
  await removeTemp(root);
});

describe("ClaudeSetupFacts.unreadableSkillPlaces", () => {
  it("스킬 폴더를 다 읽었으면 비어 있다", async () => {
    const facts = await scanClaudeSetup(input);
    expect(facts.skills.map((s) => s.name)).toEqual(["pa:s1", "ps", "us"]);
    expect(facts.unreadableDirs).toEqual([]);
    expect(facts.unreadableSkillPlaces).toEqual({ user: false, projects: [], plugins: [] });
  });
  it("프로젝트의 스킬 폴더는 정규화한 뿌리로, 플러그인의 스킬을 찾는 폴더는 플러그인 ID로 낸다", async () => {
    deny(projectSkills, pluginSkills);
    const facts = await scanClaudeSetup(input);
    expect(facts.skills.map((s) => s.name)).toEqual(["us"]);
    expect(facts.unreadableDirs).toEqual([projectSkills, pluginSkills].sort());
    expect(facts.unreadableSkillPlaces).toEqual({ user: false, projects: [normalizePath(proj)], plugins: ["pa@m"] });
  });
  it("사용자 스킬 폴더를 읽지 못한 것은 따로 낸다", async () => {
    deny(userSkills);
    const facts = await scanClaudeSetup(input);
    expect(facts.skills.map((s) => s.name)).toEqual(["pa:s1", "ps"]);
    expect(facts.unreadableSkillPlaces).toEqual({ user: true, projects: [], plugins: [] });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/metrics-setup.test.ts test/scan/unreadable-places.test.ts`
Expected: FAIL. 스캐너의 결과에 `unreadableSkillPlaces`가 없다(`undefined`). S5는 스킬 폴더의 목록을 읽지 못했는데도 `not_applicable`을 낸다(`unreadable`이어야 한다).

- [ ] **Step 3: 구현한다**

`src/core/readability.ts`(찾을 곳 1/2):

```ts
 * 켜져 있는 플러그인의 구성과 MCP 정의다. 켜 둔 플러그인이 설치 기록에 없는 것도 구성을 모르는 플러그인이다(설계 10, 11.3 S5).
 */
```

`src/core/readability.ts`(바꾼 뒤 1/2):

```ts
 * 켜져 있는 플러그인의 구성과 MCP 정의다. 켜 둔 플러그인이 설치 기록에 없는 것도 구성을 모르는 플러그인이다(설계 10, 11.3 S5).
 * 사용자 스킬 폴더와 프로젝트의 스킬 폴더도 서버를 찾는 곳이다. 거기에 둔 플러그인은 설정에 열쇠가 없어도 켜지고 서버를 넣을 수 있어서,
 * 그 폴더의 목록을 읽지 못하면 그런 플러그인을 찾지 못한 것이다(설계 10 「스킬 폴더에 둔 플러그인」). 플러그인 안의 스킬을 찾는 폴더는 서버와 상관없다.
 */
```

`src/core/readability.ts`(찾을 곳 2/2):

```ts
    facts.plugins.some((plugin) => plugin.enabled && (!plugin.compositionKnown || plugin.mcpUnreadable)) ||
    facts.pluginsWithoutInstall.length > 0
  );
```

`src/core/readability.ts`(바꾼 뒤 2/2):

```ts
    facts.plugins.some((plugin) => plugin.enabled && (!plugin.compositionKnown || plugin.mcpUnreadable)) ||
    facts.pluginsWithoutInstall.length > 0 ||
    facts.unreadableSkillPlaces.user ||
    facts.unreadableSkillPlaces.projects.length > 0
  );
```

`src/scan/claude.ts`(찾을 곳 1/4):

```ts
  const unreadableDirs: string[] = [];
  const addSkill = (folder: SkillFolder, fields: Pick<SkillFact, "scope" | "name" | "recordNames" | "projectRoot" | "pluginId" | "enabled" | "listed" | "managedFixed" | "hookProvided">): void => {
```

`src/scan/claude.ts`(바꾼 뒤 1/4):

```ts
  const unreadableDirs: string[] = [];
  const unreadableSkillPlaces: ClaudeSetupFacts["unreadableSkillPlaces"] = { user: false, projects: [], plugins: [] };
  const addSkill = (folder: SkillFolder, fields: Pick<SkillFact, "scope" | "name" | "recordNames" | "projectRoot" | "pluginId" | "enabled" | "listed" | "managedFixed" | "hookProvided">): void => {
```

`src/scan/claude.ts`(찾을 곳 2/4):

```ts
    unreadableDirs.push(...scan.unreadableDirs);
    for (const folder of scan.skills) {
```

`src/scan/claude.ts`(바꾼 뒤 2/4):

```ts
    unreadableDirs.push(...scan.unreadableDirs);
    if (scan.unreadableDirs.length > 0) {
      if (projectRoot === null) unreadableSkillPlaces.user = true;
      else unreadableSkillPlaces.projects.push(projectRoot);
    }
    for (const folder of scan.skills) {
```

`src/scan/claude.ts`(찾을 곳 3/4):

```ts
        unreadableDirs.push(...scan.unreadableDirs);
        for (const folder of scan.skills) {
```

`src/scan/claude.ts`(바꾼 뒤 3/4):

```ts
        unreadableDirs.push(...scan.unreadableDirs);
        if (scan.unreadableDirs.length > 0) unreadableSkillPlaces.plugins.push(plugin.id);
        for (const folder of scan.skills) {
```

`src/scan/claude.ts`(찾을 곳 4/4):

```ts
    unreadableDirs: [...new Set(unreadableDirs)].sort(),
  };
```

`src/scan/claude.ts`(바꾼 뒤 4/4):

```ts
    unreadableDirs: [...new Set(unreadableDirs)].sort(),
    unreadableSkillPlaces: { user: unreadableSkillPlaces.user, projects: [...new Set(unreadableSkillPlaces.projects)].sort(), plugins: [...new Set(unreadableSkillPlaces.plugins)].sort() },
  };
```

`src/scan/types.ts`(찾을 곳):

```ts
  unreadableDirs: string[];
}
```

`src/scan/types.ts`(바꾼 뒤):

```ts
  unreadableDirs: string[];
  /**
   * unreadableDirs의 폴더가 누구의 것인지. 사용자 스킬 폴더인지, 어느 프로젝트의 스킬 폴더인지(정규화한 뿌리), 어느 플러그인의 스킬을 찾는 폴더인지(ID)다.
   * 사용자와 프로젝트의 것은 F5와 E5를 못 재게 하고, 플러그인의 것은 그 플러그인의 스킬만 세지 않게 한다(설계 11.3)
   */
  unreadableSkillPlaces: { user: boolean; projects: string[]; plugins: string[] };
}
```

`test/helpers/facts.ts`(찾을 곳):

```ts
    unreadableDirs: [],
    ...input,
```

`test/helpers/facts.ts`(바꾼 뒤):

```ts
    unreadableDirs: [],
    unreadableSkillPlaces: { user: false, projects: [], plugins: [] },
    ...input,
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 19개, 시험 310개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/metrics-setup.test.ts test/scan/unreadable-places.test.ts src/core/readability.ts src/scan/claude.ts src/scan/types.ts test/helpers/facts.ts
git commit -m "feat: 읽지 못한 스킬 폴더의 주인을 사실에 추가"
```

---

### Task 11: 셋팅으로 재는 상황 적합 규칙 넷(F3~F6)

**Files:**
- Create: `src/core/metrics/fit.ts`
- Test: `test/core/metrics-fit.test.ts`

**Interfaces:**
- Consumes: 과제 1의 `InstructionFile.hasContent`, 과제 8의 `ProjectUsage`, `ProjectUse`, 과제 9의 `ToolSetup`, `unread`, `projectSettingsUnread`, 과제 10의 `unreadableSkillPlaces`. 1부의 `ProjectFact`, `InstructionSet`.
- Produces: `mergedFitRules(tools: readonly ToolSetup[], usage: ProjectUsage): Record<"F3" | "F4" | "F6", Measurement> & { missingInstructions: MissingInstructions[]; worstOverlap: WorstOverlap | null }`, `fitToolRules(tool: ToolSetup): Record<"F5", Measurement>`, `MissingInstructions { normRoot; tools: string[] }`, `WorstOverlap { tool; normRoot }`, `FREQUENT_SESSIONS`(`src/core/metrics/fit.ts`).

F1과 F2는 과제 7에서 쟀다. 여기서는 셋팅으로 재는 넷을 잰다. F3, F4, F6은 도구를 합치고 F5는 도구마다 잰다.

**F3 자주 쓰는 프로젝트에 지침이 있다.** 대상 프로젝트 가운데 지침이 있는 프로젝트의 몫이다(설계 11.3).

- 대상은 점수 구간에 주 세션이 3개 이상(도구를 합쳐서)인 프로젝트 가운데, 깃 저장소 뿌리이거나 깃이 아니어도 프로젝트 지침이나 프로젝트 쪽 설정이 이미 있는 폴더다. 프로젝트로 보지 않는 폴더와 지금 PC에 없는 작업 폴더는 뺀다. 대상이 없으면 `not_applicable`이다. 주 세션 3개는 최소 개수가 아니라 "자주 쓰는"의 뜻이다.
- 지침은 그 프로젝트에서 **주로 쓴 도구**마다 본다. 주 세션이 3개 이상인 도구와, 주 세션이 가장 많은 도구(수가 같으면 그 도구들 모두)다. 그 도구마다 그 도구가 읽는 프로젝트 지침에 내용이 있는 파일이 하나라도 있어야 지침이 있는 프로젝트다(과제 1의 `hasContent`). 빈 파일과 읽지 못한 파일은 세지 않는다. 전역 지침과 같은 파일이어도 지침이다.
- 지침이 없다고 센 프로젝트와 어느 도구의 지침이 없는지를 `missingInstructions`로 낸다. 근거 숫자는 `targets`, `withInstructions`다.

**F4 전역과 프로젝트 지침이 겹치지 않는다.** 전역 지침의 줄(20자 이상, 스캐너가 지문으로 낸다) 가운데 프로젝트 지침에 다시 나오는 몫이고, 프로젝트 가운데 가장 큰 값이다.

- 보는 프로젝트는 스캐너의 목록 전체다. 점수 구간으로 거르지 않는다. 지금 PC에 없는 작업 폴더, 프로젝트로 보지 않는 폴더, 프로젝트 지침이 없거나 전역 지침과 같은 파일뿐인 프로젝트는 뺀다.
- 견주는 것(전역 지침 파일, 보는 프로젝트의 지침 파일, 규칙 폴더의 목록)을 하나라도 읽지 못하면 보이는 것이 있어도 `unreadable`이다. 전역 지침이 없거나, 견줄 프로젝트 지침이 없거나, 전역 지침에 견줄 줄이 없으면 `not_applicable`이다. 읽지 못한 것이 앞선다.
- 가장 큰 값을 낸 프로젝트를 `worstOverlap`으로 낸다. 값이 같으면 도구 식별자, 정규화한 뿌리의 차례에서 앞선 것이다. 근거 숫자는 `comparedProjects`, `globalLines`, `overlappingLines`다.

**F5 같은 이름 스킬이 한 곳에만 있다.** 남는 사본의 점수 합을 스킬 종 수로 나눈다. 같은 도구 안에서만 센다.

- 한 이름이 사용자 스킬 폴더와 프로젝트의 스킬 폴더 여러 군데에 실제 사본으로 있을 때, 사본 수에서 1을 뺀 것이 남는 사본이다. 사본들의 내용 지문이 모두 같으면 하나에 1점, 하나라도 다르거나 견줄 수 없으면 2점이다. 링크와 실제 경로가 같은 위치는 사본이 아니다. 꺼 둔 스킬도 놓여 있는 사본이다.
- 사용자나 프로젝트의 스킬 폴더의 목록을 읽지 못했으면 `unreadable`, 스킬 종 수가 0이면 `not_applicable`이다. 플러그인의 스킬을 찾는 폴더는 상관없다. 근거 숫자는 `differingCopies`, `identicalCopies`, `skillKinds`다.

**F6 전역과 프로젝트 설정이 부딪히지 않는다.** 스캐너가 프로젝트마다 낸 부딪히는 쌍의 수(`permissionConflicts`)를 더한다. 전역 쪽은 사용자 설정만이고 프로젝트 쪽에는 프로젝트 설정과 로컬 설정이 든다.

- 사용자 설정이나 목록의 프로젝트의 프로젝트 설정, 로컬 설정을 하나라도 읽지 못하면 `unreadable`이다. 관리 정책 파일은 처음부터 견주지 않는다. 목록의 프로젝트 어디에도 프로젝트 설정과 로컬 설정이 없으면 `not_applicable`이다. 근거 숫자는 `conflicts`, `projectsWithSettings`다.

이 계획이 정한 세부는 「이 계획이 기대는 설계 보완」에 모았다. F3의 대상에서 로컬 설정과 읽지 못한 지침 파일도 "이미 있는 것"으로 보는 것, F5의 종을 사용자와 프로젝트 범위 스킬의 이름으로 세는 것, 도구가 여럿일 때 F4는 도구마다 제 것끼리 견준 값 가운데 가장 큰 것이고 F6은 합이라는 것이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/metrics-fit.test.ts`(새 파일):

```ts
// 셋팅으로 재는 상황 적합 규칙 넷(F3, F4, F5, F6)을 시험한다. 대상과 주로 쓴 도구, 견주는 것을 읽지 못했을 때, 남는 사본의 점수(설계 11.3 「상황 적합」, 11.4 「규칙마다의 이유」)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolId } from "../../src/adapters/types.ts";
import { fitToolRules, mergedFitRules } from "../../src/core/metrics/fit.ts";
import type { ToolSetup } from "../../src/core/metrics/setup.ts";
import { projectLookup, projectUsage } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, ProjectFact } from "../../src/scan/types.ts";
import { facts, instructionFile, instructions, project, skill } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const at = (cwd: string, count = 1): SummaryInput[] => Array.from({ length: count }, () => ({ cwd, days: { "2026-11-10": { responses: 1 } } }));
const tool = (setup: Partial<ClaudeSetupFacts> = {}, sessions: SummaryInput[] = [], id = "claude-code"): ToolSetup => ({
  tool: id as ToolId,
  totals: toolTotals(sessions.map((s) => summary(s)), windows, ["Bash"]),
  coverage: CLAUDE_COVERAGE,
  setup: facts(setup),
  highestVersion: "2.1.300",
});
/** 프로젝트 목록은 첫 도구의 것이다. 세션의 작업 폴더는 이미 정규화한 꼴로 적는다 */
const merged = (...tools: ToolSetup[]) => {
  const projects = tools[0]?.setup.projects ?? [];
  const normalized = Object.fromEntries(projects.flatMap((p) => p.cwds.map((cwd) => [cwd, cwd])));
  return mergedFitRules(tools, projectUsage(tools, projectLookup(projects, normalized)));
};
const written = (path: string, lineHashes: string[] = []) => instructions({ files: [instructionFile(path)], lineHashes });
const withGuide = (root: string, input: Partial<ProjectFact> = {}): ProjectFact => project(root, { instructions: written(`${root}/CLAUDE.md`), ...input });

describe("F3 자주 쓰는 프로젝트에 지침이 있다", () => {
  it("점수 구간에 주 세션이 3개 이상인 프로젝트 가운데 프로젝트 지침이 있는 몫이다", () => {
    const projects = [withGuide("/work/a"), project("/work/b"), withGuide("/work/c"), project("/work/rare")];
    const result = merged(tool({ projects }, [...at("/work/a", 3), ...at("/work/b", 4), ...at("/work/c", 5), ...at("/work/rare", 2)]));
    expect(result.F3).toEqual({ status: "scored", value: 2 / 3, evidence: { targets: 3, withInstructions: 2 } });
    expect(result.missingInstructions).toEqual([{ normRoot: "/work/b", tools: ["claude-code"] }]);
  });
  it("대상은 깃 저장소 뿌리이거나, 깃이 아니어도 프로젝트 지침이나 설정이 이미 있는 폴더다", () => {
    const projects = [
      project("/work/plain", { kind: "folder" }),
      project("/work/has-settings", { kind: "folder", hasSettings: true, settingsStatus: "ok" }),
      project("/work/has-local", { kind: "folder", hasLocalSettings: true, localSettingsStatus: "ok" }),
      withGuide("/work/has-guide", { kind: "folder" }),
      project("/work/unread-guide", { kind: "folder", instructions: instructions({ unreadable: ["/work/unread-guide/CLAUDE.md"] }) }),
    ];
    const sessions = projects.flatMap((p) => at(p.normRoot, 3));
    const result = merged(tool({ projects }, sessions));
    expect(result.F3).toMatchObject({ status: "scored", value: 0.25, evidence: { targets: 4, withInstructions: 1 } });
    expect(result.missingInstructions.map((m) => m.normRoot)).toEqual(["/work/has-local", "/work/has-settings", "/work/unread-guide"]);
  });
  it("프로젝트로 보지 않는 폴더와 지금 PC에 없는 작업 폴더는 대상에서 뺀다", () => {
    const projects = [withGuide("/home/u", { excluded: true }), project("/work/gone", { exists: false, kind: "folder" }), withGuide("/work/a")];
    expect(merged(tool({ projects }, [...at("/home/u", 9), ...at("/work/gone", 9), ...at("/work/a", 3)])).F3).toMatchObject({ status: "scored", value: 1, evidence: { targets: 1 } });
  });
  it("대상 프로젝트가 없으면 not_applicable이다. 주 세션 3개는 최소 개수가 아니라 자주 쓴다는 뜻이다", () => {
    const projects = [project("/work/a")];
    expect(merged(tool({ projects }, at("/work/a", 2))).F3).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { targets: 0, withInstructions: 0 } });
    expect(merged().F3).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it("지침이 있다는 것은 내용이 있는 파일이 하나라도 있는 것이다. 빈 파일과 읽지 못한 파일은 세지 않는다", () => {
    const empty = instructions({ files: [instructionFile("/work/a/CLAUDE.md", { bytes: 3, hasContent: false })] });
    const unreadable = instructions({ unreadable: ["/work/b/CLAUDE.md"] });
    const mixed = instructions({ files: [instructionFile("/work/c/CLAUDE.md", { hasContent: false }), instructionFile("/work/c/.claude/rules/x.md", { bytes: 12 })] });
    const projects = [project("/work/a", { instructions: empty }), project("/work/b", { instructions: unreadable }), project("/work/c", { instructions: mixed })];
    const result = merged(tool({ projects }, projects.flatMap((p) => at(p.normRoot, 3))));
    expect(result.F3).toMatchObject({ status: "scored", evidence: { targets: 3, withInstructions: 1 } });
    expect(result.missingInstructions.map((m) => m.normRoot)).toEqual(["/work/a", "/work/b"]);
  });
  it("전역 지침과 같은 파일뿐인 프로젝트 지침도 지침이다", () => {
    const linked = instructions({ files: [instructionFile("/work/a/CLAUDE.md", { sameAsGlobal: true })] });
    expect(merged(tool({ projects: [project("/work/a", { instructions: linked })] }, at("/work/a", 3))).F3).toMatchObject({ status: "scored", value: 1 });
  });

  describe("지침은 그 프로젝트에서 주로 쓴 도구마다 본다", () => {
    const claudeOnly = (root: string) => [withGuide(root)];
    it("대상은 도구를 합쳐 세고, 주 세션이 3개 이상인 도구마다 그 도구가 읽는 지침이 있어야 한다", () => {
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3));
      const codex = tool({ projects: [project("/work/a")] }, at("/work/a", 3), "codex");
      const result = merged(claude, codex);
      expect(result.F3).toMatchObject({ status: "scored", value: 0, evidence: { targets: 1, withInstructions: 0 } });
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
    it("한 도구로 여러 번 일하고 다른 도구를 한 번 열어 본 프로젝트는 여러 번 쓴 도구만 본다", () => {
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 20));
      const codex = tool({ projects: [project("/work/a")] }, at("/work/a", 1), "codex");
      expect(merged(claude, codex).F3).toMatchObject({ status: "scored", value: 1 });
    });
    it("어느 도구도 3개에 못 미치면 주 세션이 가장 많은 도구를 본다. 수가 같으면 그 도구들 모두다", () => {
      const more = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 2)), tool({ projects: [project("/work/a")] }, at("/work/a", 1), "codex"));
      expect(more.F3).toMatchObject({ status: "scored", value: 1 });
      const tie = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 2)), tool({ projects: [project("/work/a")] }, at("/work/a", 2), "codex"));
      expect(tie.F3).toMatchObject({ status: "scored", value: 0 });
      expect(tie.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
    it("그 도구의 셋팅 사실에 그 프로젝트가 없으면 그 도구의 지침은 없는 것이다", () => {
      const result = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3)), tool({ projects: [] }, at("/work/a", 3), "codex"));
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
  });
});

describe("F4 전역과 프로젝트 지침이 겹치지 않는다", () => {
  const GLOBAL = written("/home/u/.claude/CLAUDE.md", ["g1", "g2", "g3", "g4"]);
  const withLines = (root: string, lineHashes: string[], input: Partial<ProjectFact> = {}) => project(root, { instructions: written(`${root}/CLAUDE.md`, lineHashes), ...input });

  it("전역 지침의 줄 가운데 프로젝트 지침에 다시 나오는 몫이고, 프로젝트 가운데 가장 큰 값이다", () => {
    const projects = [withLines("/work/a", ["g1", "x"]), withLines("/work/b", ["g1", "g2", "g3", "y"]), withLines("/work/c", [])];
    const result = merged(tool({ globalInstructions: GLOBAL, projects }));
    expect(result.F4).toEqual({ status: "scored", value: 0.75, evidence: { comparedProjects: 3, globalLines: 4, overlappingLines: 3 } });
    expect(result.worstOverlap).toEqual({ tool: "claude-code", normRoot: "/work/b" });
  });
  it("세션을 세지 않는다. 점수 구간에 쓰지 않은 프로젝트의 지침도 견준다", () => {
    expect(merged(tool({ globalInstructions: GLOBAL, projects: [withLines("/work/idle", ["g1", "g2", "g3", "g4"])] })).F4).toMatchObject({ status: "scored", value: 1 });
  });
  it("지금 PC에 없는 작업 폴더, 프로젝트로 보지 않는 폴더, 견줄 지침이 없는 프로젝트는 뺀다", () => {
    const sameFile = instructions({ files: [instructionFile("/work/link/CLAUDE.md", { sameAsGlobal: true })] });
    const projects = [withLines("/work/a", ["g1"]), withLines("/home/u", ["g1", "g2", "g3"], { excluded: true }), project("/work/none"), project("/work/link", { instructions: sameFile }), project("/work/gone", { exists: false })];
    const result = merged(tool({ globalInstructions: GLOBAL, projects }));
    expect(result.F4).toEqual({ status: "scored", value: 0.25, evidence: { comparedProjects: 1, globalLines: 4, overlappingLines: 1 } });
  });
  it("가장 큰 값이 같은 프로젝트가 여럿이면 정규화한 뿌리가 앞선 것을 가리킨다", () => {
    const projects = [withLines("/work/b", ["g1", "g2"]), withLines("/work/a", ["g3", "g4"])];
    expect(merged(tool({ globalInstructions: GLOBAL, projects })).worstOverlap).toEqual({ tool: "claude-code", normRoot: "/work/a" });
  });
  it("한쪽 지침이 없거나 전역 지침에 견줄 줄이 없으면 not_applicable이다", () => {
    const NA = { status: "unmeasured", reason: "not_applicable" };
    expect(merged(tool({ projects: [withLines("/work/a", ["g1"])] })).F4).toMatchObject(NA);
    expect(merged(tool({ globalInstructions: GLOBAL, projects: [project("/work/a")] })).F4).toMatchObject(NA);
    expect(merged(tool({ globalInstructions: GLOBAL })).F4).toMatchObject(NA);
    expect(merged(tool({ globalInstructions: written("/home/u/.claude/CLAUDE.md", []), projects: [withLines("/work/a", ["g1"])] })).F4).toMatchObject(NA);
    expect(merged(tool({ globalInstructions: GLOBAL })).F4).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { comparedProjects: 0, globalLines: 4, overlappingLines: 0 } });
    expect(merged().F4).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { comparedProjects: 0, globalLines: 0, overlappingLines: 0 } });
    expect(merged().worstOverlap).toBeNull();
  });
  it.each([
    ["전역 지침 파일", { globalInstructions: { ...GLOBAL, unreadable: ["/home/u/.claude/rules/x.md"] } }],
    ["전역 규칙 폴더의 목록", { globalInstructions: { ...GLOBAL, unreadableDirs: ["/home/u/.claude/rules"] } }],
    ["프로젝트 지침 파일", { globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"]), project("/work/b", { instructions: instructions({ unreadable: ["/work/b/CLAUDE.md"] }) })] }],
    ["프로젝트 규칙 폴더의 목록", { globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"], {}), project("/work/b", { instructions: instructions({ unreadableDirs: ["/work/b/.claude/rules"] }) })] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("견주는 것을 하나라도 읽지 못하면 보이는 것이 있어도 unreadable이다: %s", (_name, setup) => {
    const result = merged(tool(setup));
    expect(result.F4).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { comparedProjects: null, globalLines: null, overlappingLines: null } });
    expect(result.worstOverlap).toBeNull();
  });
  it("읽지 못한 것이 견줄 것이 없는 까닭보다 앞선다", () => {
    const setup = { projects: [project("/work/b", { instructions: instructions({ unreadable: ["/work/b/CLAUDE.md"] }) })] };
    expect(merged(tool(setup)).F4).toMatchObject({ status: "unmeasured", reason: "unreadable" });
  });
  it("도구가 여럿이면 도구마다 제 전역 지침과 제 프로젝트 지침을 견주어 가장 큰 값을 낸다", () => {
    const claude = tool({ globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"])] });
    const codex = tool({ globalInstructions: written("/home/u/.codex/AGENTS.md", ["c1", "c2"]), projects: [withLines("/work/a", ["c1", "c2"])] }, [], "codex");
    const result = merged(claude, codex);
    expect(result.F4).toEqual({ status: "scored", value: 1, evidence: { comparedProjects: 2, globalLines: 2, overlappingLines: 2 } });
    expect(result.worstOverlap).toEqual({ tool: "codex", normRoot: "/work/a" });
    expect(merged(claude, tool({}, [], "codex")).F4).toMatchObject({ status: "scored", value: 0.25 });
  });
});

describe("F5 같은 이름 스킬이 한 곳에만 있다", () => {
  const f5 = (setup: Partial<ClaudeSetupFacts>) => fitToolRules(tool(setup)).F5;
  const inProject = (name: string, root: string, input = {}) => skill(name, { scope: "project", projectRoot: root, path: `${root}/.claude/skills/${name}`, ...input });

  it("남는 사본의 점수 합을 스킬 종 수로 나눈다. 내용이 모두 같으면 하나에 1점, 다르면 2점이다", () => {
    const skills = [
      skill("same"),
      inProject("same", "/work/a"),
      inProject("same", "/work/b"),
      skill("differs"),
      inProject("differs", "/work/a", { contentHash: "other" }),
      skill("single"),
      inProject("only-project", "/work/a"),
    ];
    expect(f5({ skills })).toEqual({ status: "scored", value: 1, evidence: { differingCopies: 1, identicalCopies: 2, skillKinds: 4 } });
  });
  it("내용 지문을 만들지 못한 사본이 있으면 견줄 수 없으므로 2점으로 친다", () => {
    expect(f5({ skills: [skill("x"), inProject("x", "/work/a", { contentHash: null })] })).toMatchObject({ status: "scored", value: 2, evidence: { differingCopies: 1, identicalCopies: 0 } });
    expect(f5({ skills: [skill("x", { contentHash: null }), inProject("x", "/work/a", { contentHash: null })] })).toMatchObject({ status: "scored", value: 2 });
  });
  it("링크와 실제 경로가 같은 위치는 사본이 아니다. 종에는 든다", () => {
    const skills = [
      skill("linked"),
      inProject("linked", "/work/a", { isLink: true, realPath: "/home/u/.claude/skills/linked" }),
      skill("alias", { realPath: "/store/alias" }),
      inProject("alias", "/work/a", { realPath: "/store/alias" }),
      inProject("link-only", "/work/a", { isLink: true, realPath: "/store/link-only" }),
    ];
    expect(f5({ skills })).toEqual({ status: "scored", value: 0, evidence: { differingCopies: 0, identicalCopies: 0, skillKinds: 3 } });
  });
  it("플러그인이 넣은 스킬은 사본으로도 종으로도 세지 않는다", () => {
    const fromPlugin = skill("p:same", { scope: "plugin", pluginId: "p@m", path: "/home/u/.claude/plugins/cache/p/skills/same" });
    expect(f5({ skills: [skill("same"), fromPlugin, skill("same", { scope: "plugin", pluginId: "q@m", path: "/q/skills/same" })] })).toMatchObject({ status: "scored", value: 0, evidence: { skillKinds: 1 } });
    expect(f5({ skills: [fromPlugin] })).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it("꺼 둔 스킬도 놓여 있는 사본이다", () => {
    expect(f5({ skills: [skill("x", { enabled: false }), inProject("x", "/work/a")] })).toMatchObject({ status: "scored", value: 1 });
  });
  it("스킬 종 수가 0이면 not_applicable이다", () => {
    expect(f5({})).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { differingCopies: 0, identicalCopies: 0, skillKinds: 0 } });
  });
  it("사용자나 프로젝트의 스킬 폴더의 목록을 읽지 못했으면 보이는 스킬에 남는 사본이 없어도 unreadable이다", () => {
    const unread = { status: "unmeasured", reason: "unreadable", evidence: { differingCopies: null, identicalCopies: null, skillKinds: null } };
    expect(f5({ skills: [skill("x")], unreadableSkillPlaces: { user: false, projects: ["/work/a"], plugins: [] } })).toEqual(unread);
    expect(f5({ unreadableSkillPlaces: { user: true, projects: [], plugins: [] } })).toEqual(unread);
  });
  it("플러그인의 스킬을 찾는 폴더는 상관없다. 플러그인이 넣은 사본은 처음부터 세지 않는다", () => {
    expect(f5({ skills: [skill("x")], unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } })).toMatchObject({ status: "scored", value: 0 });
  });
});

describe("F6 전역과 프로젝트 설정이 부딪히지 않는다", () => {
  const withSettings = (root: string, permissionConflicts: number, input: Partial<ProjectFact> = {}) => project(root, { hasSettings: true, settingsStatus: "ok", permissionConflicts, ...input });

  it("목록의 프로젝트마다 사용자 설정과 부딪히는 쌍의 수를 더한다", () => {
    const projects = [withSettings("/work/a", 2), withSettings("/work/b", 0), project("/work/c", { hasLocalSettings: true, localSettingsStatus: "ok", permissionConflicts: 1 }), project("/work/none")];
    expect(merged(tool({ projects })).F6).toEqual({ status: "scored", value: 3, evidence: { conflicts: 3, projectsWithSettings: 3 } });
  });
  it("목록의 프로젝트 어디에도 프로젝트 설정과 로컬 설정이 없으면 not_applicable이다", () => {
    const NA = { status: "unmeasured", reason: "not_applicable", evidence: { conflicts: 0, projectsWithSettings: 0 } };
    expect(merged(tool({ projects: [project("/work/a")] })).F6).toEqual(NA);
    expect(merged(tool()).F6).toEqual(NA);
    expect(merged().F6).toEqual(NA);
  });
  it("사용자 설정이 없어도 프로젝트 쪽 설정이 있으면 잰다. 부딪히는 쌍은 없다", () => {
    const settings = { ...facts().settings, user: "missing" as const };
    expect(merged(tool({ settings, projects: [withSettings("/work/a", 0)] })).F6).toMatchObject({ status: "scored", value: 0 });
  });
  it.each([
    ["사용자 설정이 풀리지 않는다", { settings: { ...facts().settings, user: "unparsable" }, projects: [withSettings("/work/a", 0)] }],
    ["사용자 설정을 열지 못한다", { settings: { ...facts().settings, user: "unreadable" } }],
    ["프로젝트 설정", { projects: [withSettings("/work/a", 1), withSettings("/work/b", 0, { settingsStatus: "unparsable" })] }],
    ["로컬 설정", { projects: [withSettings("/work/a", 1, { hasLocalSettings: true, localSettingsStatus: "unreadable" })] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("견주는 설정 파일을 하나라도 읽지 못하면 unreadable이다: %s", (_name, setup) => {
    expect(merged(tool(setup)).F6).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { conflicts: null, projectsWithSettings: null } });
  });
  it("관리 정책 파일은 처음부터 견주지 않는다. 읽지 못해도 잰다", () => {
    const settings = { ...facts().settings, managedParts: [{ path: "/etc/claude-code/managed-settings.json", status: "unreadable" as const }] };
    expect(merged(tool({ settings, projects: [withSettings("/work/a", 1)] })).F6).toMatchObject({ status: "scored", value: 1 });
  });
  it("도구가 여럿이면 부딪히는 쌍을 더하고, 한 도구의 설정만 읽지 못해도 규칙 전체가 unreadable이다", () => {
    const claude = tool({ projects: [withSettings("/work/a", 2)] });
    expect(merged(claude, tool({ projects: [withSettings("/work/a", 1)] }, [], "codex")).F6).toEqual({ status: "scored", value: 3, evidence: { conflicts: 3, projectsWithSettings: 2 } });
    expect(merged(claude, tool({}, [], "codex")).F6).toMatchObject({ status: "scored", value: 2 });
    expect(merged(claude, tool({ settings: { ...facts().settings, user: "unreadable" } }, [], "codex")).F6).toMatchObject({ status: "unmeasured", reason: "unreadable" });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/metrics-fit.test.ts`
Expected: FAIL. `../../src/core/metrics/fit.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/metrics/fit.ts`(새 파일):

```ts
// 셋팅으로 재는 상황 적합 규칙 넷을 잰다. 도구를 합치는 F3, F4, F6과 도구별 규칙 F5(순수 함수, 설계 11.3 「상황 적합」, 11.4 「규칙마다의 이유」)
import type { ToolId } from "../../adapters/types.ts";
import type { InstructionSet } from "../../scan/instructions.ts";
import type { ProjectFact } from "../../scan/types.ts";
import { scored, unmeasured, type Measurement } from "../measure.ts";
import type { ProjectUsage, ProjectUse } from "../projects.ts";
import { projectSettingsUnread, unread } from "../readability.ts";
import type { ToolSetup } from "./setup.ts";

/** 점수 구간에 주 세션이 이만큼이면 자주 쓰는 프로젝트이고, 그 프로젝트에서 주로 쓴 도구다(설계 11.3 F3) */
export const FREQUENT_SESSIONS = 3;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 스캐너가 셋팅을 읽은 프로젝트. 지금 PC에 없는 작업 폴더와 프로젝트로 보지 않는 폴더는 읽지 않았다(설계 10) */
const scanned = (project: ProjectFact): boolean => project.exists && !project.excluded;
const scannedProjects = (tool: ToolSetup): ProjectFact[] => tool.setup.projects.filter(scanned).sort((a, b) => byText(a.normRoot, b.normRoot));
const projectIn = (tool: ToolSetup | undefined, normRoot: string): ProjectFact | undefined => tool?.setup.projects.find((project) => project.normRoot === normRoot);

/** 지침이 없다고 센 프로젝트와, 주로 쓴 도구 가운데 그 도구가 읽는 지침이 없는 도구(도구 식별자 차례) */
export interface MissingInstructions {
  normRoot: string;
  tools: string[];
}

/** 전역 지침과 가장 많이 겹치는 프로젝트 지침 */
export interface WorstOverlap {
  tool: ToolId;
  normRoot: string;
}

const hasInstructionFiles = (set: InstructionSet): boolean => set.files.length > 0 || set.unreadable.length > 0 || set.unreadableDirs.length > 0;
/** 깃 저장소가 아니어도 프로젝트 지침이나 프로젝트 쪽 설정이 이미 있는 폴더는 프로젝트로 다루는 폴더다 */
const treatedAsProject = (project: ProjectFact | undefined): boolean => project !== undefined && (hasInstructionFiles(project.instructions) || project.hasSettings || project.hasLocalSettings);
/** 내용이 있는 지침 파일이 하나라도 있다. 빈 파일과 읽지 못한 파일은 세지 않는다 */
const hasInstructions = (project: ProjectFact | undefined): boolean => project?.instructions.files.some((file) => file.hasContent) ?? false;

/** 그 프로젝트에서 주 세션이 3개 이상인 도구와, 주 세션이 가장 많은 도구(수가 같으면 그 도구들 모두) */
function mainTools(use: ProjectUse): string[] {
  const most = Math.max(...Object.values(use.sessions));
  return Object.keys(use.sessions).filter((tool) => use.sessions[tool]! >= FREQUENT_SESSIONS || use.sessions[tool] === most);
}

function f3(tools: readonly ToolSetup[], usage: ProjectUsage): { measurement: Measurement; missing: MissingInstructions[] } {
  const byId = new Map<string, ToolSetup>(tools.map((tool) => [tool.tool, tool]));
  const missing: MissingInstructions[] = [];
  let targets = 0;
  for (const use of usage.projects) {
    const { project } = use;
    if (use.total < FREQUENT_SESSIONS || !scanned(project)) continue;
    if (project.kind !== "git" && !treatedAsProject(project) && !tools.some((tool) => treatedAsProject(projectIn(tool, project.normRoot)))) continue;
    targets++;
    const without = mainTools(use).filter((tool) => !hasInstructions(projectIn(byId.get(tool), project.normRoot)));
    if (without.length > 0) missing.push({ normRoot: project.normRoot, tools: without });
  }
  const withInstructions = targets - missing.length;
  const evidence = { targets, withInstructions };
  // 대상이 없는 것은 기록이 모자란 것이 아니라 해당하지 않는 것이다(설계 11.4 「F3과 I4」)
  return { measurement: targets === 0 ? unmeasured("not_applicable", evidence) : scored(withInstructions / targets, evidence), missing };
}

const instructionsUnread = (set: InstructionSet): boolean => set.unreadable.length > 0 || set.unreadableDirs.length > 0;

function f4(tools: readonly ToolSetup[]): { measurement: Measurement; worst: WorstOverlap | null } {
  let unreadable = false;
  let globalLines = 0;
  let comparedProjects = 0;
  let worst: (WorstOverlap & { overlapping: number; globalLines: number }) | null = null;
  for (const tool of [...tools].sort((a, b) => byText(a.tool, b.tool))) {
    const global = tool.setup.globalInstructions;
    const projects = scannedProjects(tool);
    if (instructionsUnread(global) || projects.some((project) => instructionsUnread(project.instructions))) unreadable = true;
    const lines = new Set(global.lineHashes);
    globalLines += lines.size;
    // 전역 지침이 없거나 견줄 줄(20자 이상)이 없으면 이 도구에서는 견줄 것이 없다
    if (global.files.length === 0 || lines.size === 0) continue;
    for (const project of projects) {
      // 프로젝트 지침이 없거나 전역 지침과 같은 파일뿐이면 견주지 않는다
      if (!project.instructions.files.some((file) => !file.sameAsGlobal)) continue;
      comparedProjects++;
      const overlapping = new Set(project.instructions.lineHashes.filter((hash) => lines.has(hash))).size;
      if (worst === null || overlapping * worst.globalLines > worst.overlapping * lines.size) worst = { tool: tool.tool, normRoot: project.normRoot, overlapping, globalLines: lines.size };
    }
  }
  // 읽지 못한 곳에 겹치는 줄이 있을 수 있다. 보이는 것만으로 재면 좋게 틀린다(설계 11.3)
  if (unreadable) return { measurement: unmeasured("unreadable", { comparedProjects: null, globalLines: null, overlappingLines: null }), worst: null };
  if (worst === null) return { measurement: unmeasured("not_applicable", { comparedProjects: 0, globalLines, overlappingLines: 0 }), worst: null };
  const evidence = { comparedProjects, globalLines: worst.globalLines, overlappingLines: worst.overlapping };
  return { measurement: scored(worst.overlapping / worst.globalLines, evidence), worst: { tool: worst.tool, normRoot: worst.normRoot } };
}

function f5(tool: ToolSetup): Measurement {
  const places = tool.setup.unreadableSkillPlaces;
  if (places.user || places.projects.length > 0) return unmeasured("unreadable", { differingCopies: null, identicalCopies: null, skillKinds: null });
  // 같은 도구 안에서만 센다. 플러그인이 넣은 스킬은 사본으로도 종으로도 세지 않는다
  const hashesByName = new Map<string, Map<string, string | null>>();
  for (const skill of tool.setup.skills) {
    if (skill.scope === "plugin") continue;
    let copies = hashesByName.get(skill.name);
    if (copies === undefined) hashesByName.set(skill.name, (copies = new Map()));
    // 링크는 사본이 아니다. 실제 경로가 같은 위치는 한 번만 센다
    if (!skill.isLink) copies.set(skill.realPath ?? skill.path, skill.contentHash);
  }
  let identicalCopies = 0;
  let differingCopies = 0;
  for (const copies of hashesByName.values()) {
    const spare = copies.size - 1;
    if (spare <= 0) continue;
    const hashes = [...copies.values()];
    if (hashes.every((hash) => hash !== null && hash === hashes[0])) identicalCopies += spare;
    else differingCopies += spare;
  }
  const evidence = { differingCopies, identicalCopies, skillKinds: hashesByName.size };
  if (hashesByName.size === 0) return unmeasured("not_applicable", evidence);
  return scored((identicalCopies + 2 * differingCopies) / hashesByName.size, evidence);
}

function f6(tools: readonly ToolSetup[]): Measurement {
  let unreadable = false;
  let conflicts = 0;
  let projectsWithSettings = 0;
  for (const tool of tools) {
    // 전역 쪽은 사용자 설정만이다. 관리 정책 파일은 처음부터 견주지 않는다
    if (unread(tool.setup.settings.user) || projectSettingsUnread(tool.setup)) unreadable = true;
    for (const project of scannedProjects(tool)) {
      if (!project.hasSettings && !project.hasLocalSettings) continue;
      projectsWithSettings++;
      conflicts += project.permissionConflicts;
    }
  }
  if (unreadable) return unmeasured("unreadable", { conflicts: null, projectsWithSettings: null });
  const evidence = { conflicts, projectsWithSettings };
  return projectsWithSettings === 0 ? unmeasured("not_applicable", evidence) : scored(conflicts, evidence);
}

/** 도구를 합쳐서 재는 상황 적합 규칙. tools는 점수에 넣는 도구이고 usage는 같은 도구들로 만든 것이다. */
export function mergedFitRules(tools: readonly ToolSetup[], usage: ProjectUsage): Record<"F3" | "F4" | "F6", Measurement> & { missingInstructions: MissingInstructions[]; worstOverlap: WorstOverlap | null } {
  const guides = f3(tools, usage);
  const overlap = f4(tools);
  return { F3: guides.measurement, F4: overlap.measurement, F6: f6(tools), missingInstructions: guides.missing, worstOverlap: overlap.worst };
}

/** 도구 하나에서 셋팅으로 재는 상황 적합 규칙 */
export function fitToolRules(tool: ToolSetup): Record<"F5", Measurement> {
  return { F5: f5(tool) };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 7개, 시험 152개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/metrics-fit.test.ts src/core/metrics/fit.ts
git commit -m "feat: 상황 적합 규칙 F3~F6 추가"
```

---

### Task 12: 1부 보완. 스킬과 MCP 서버의 사실에 설치의 정체 열쇠를 싣는다

**Files:**
- Modify: `test/scan/claude.test.ts`
- Modify: `src/scan/claude.ts`
- Modify: `src/scan/identity.ts`
- Modify: `src/scan/types.ts`
- Modify: `test/helpers/facts.ts`
- Modify: `test/scan/identity.test.ts`

**Interfaces:**
- Consumes: 1부의 `skillInstallKey`, `mcpInstallKey`, `installKeysOf`(`src/scan/identity.ts`), `scanClaudeSetup`.
- Produces: `SkillFact.installKey: string`, `McpFact.installKey: string | null`(정의의 지문이 없어 정체를 만들 수 없으면 `null`). `skillInstallKey(skill: Omit<SkillFact, "installKey">)`, `mcpInstallKey(server: Omit<McpFact, "installKey">)`. 과제 14의 판정이 관측 기록과 견줄 때 쓴다.

설치의 판정(과제 14)은 상태 파일의 관측 기록에서 같은 정체의 기록을 찾는다. 정체 열쇠는 1부의 `skillInstallKey`와 `mcpInstallKey`가 만드는데, 실제 경로를 모르는 스킬에서는 경로를 정규화하므로 Node.js의 경로 모듈에 기댄다. core는 그 모듈을 쓰지 않는다. 그래서 스캐너가 사실을 다 만든 뒤 마지막에 열쇠를 붙여 내고, core는 받아 쓴다. 관측 기록의 열쇠와 같은 함수로 만들므로 어긋나지 않는다.

- 스캐너 안에서는 열쇠가 없는 모양(`Omit<…, "installKey">`)으로 사실을 모으고 돌려주기 직전에 붙인다.
- `installKeysOf`는 그대로다. 사실에 실린 열쇠를 모은 것과 같다는 것을 시험이 본다.
- 시험 도우미(`test/helpers/facts.ts`의 `skill`, `mcpServer`)는 정체를 이루는 필드로 열쇠를 지어낸다. 스캐너의 열쇠와 글자는 다르지만 같은 것끼리 같고 다른 것끼리 다르다. `test/scan/identity.test.ts`의 도우미에는 타입이 요구하는 기본값만 더한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/claude.test.ts`(찾을 곳 1/2):

```ts
import { scanClaudeSetup, type ScanInput } from "../../src/scan/claude.ts";
import type { ClaudeSetupFacts } from "../../src/scan/types.ts";
```

`test/scan/claude.test.ts`(바꾼 뒤 1/2):

```ts
import { scanClaudeSetup, type ScanInput } from "../../src/scan/claude.ts";
import { installKeysOf, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { ClaudeSetupFacts } from "../../src/scan/types.ts";
```

`test/scan/claude.test.ts`(찾을 곳 2/2):

```ts

  it("켜져 있는데 설치 기록이 없는 플러그인은 따로 적는다(꺼 둔 것은 넣지 않는다)", () => {
```

`test/scan/claude.test.ts`(바꾼 뒤 2/2):

```ts

  it("스킬과 MCP 서버의 사실에 설치의 정체 열쇠가 실려 있다. 모으면 installKeysOf와 같고 정의가 없는 서버는 null이다(설계 11.3 「설치의 정체」)", () => {
    expect(facts.skills.every((s) => s.installKey === skillInstallKey(s))).toBe(true);
    expect(facts.mcpServers.every((s) => s.installKey === mcpInstallKey(s))).toBe(true);
    expect(find(facts.mcpServers, "claude.ai Gmail").installKey).toBeNull();
    expect(find(facts.mcpServers, "ctx").installKey).toContain(find(facts.mcpServers, "ctx").definitionHash);
    const keys = [...facts.skills.map((s) => s.installKey), ...facts.mcpServers.flatMap((s) => (s.installKey === null ? [] : [s.installKey]))];
    expect([...new Set(keys)].sort()).toEqual(installKeysOf(facts));
  });

  it("켜져 있는데 설치 기록이 없는 플러그인은 따로 적는다(꺼 둔 것은 넣지 않는다)", () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/claude.test.ts`
Expected: FAIL. 스캐너가 낸 스킬과 서버의 사실에 `installKey`가 없다.

- [ ] **Step 3: 구현한다**

`src/scan/claude.ts`(찾을 곳 1/4):

```ts
import { hookCommandTexts, hookMapValid, preToolUseGuards, type ShellGuard } from "./hooks.ts";
import { emptyInstructionSet, readGlobalInstructions, readProjectInstructions } from "./instructions.ts";
```

`src/scan/claude.ts`(바꾼 뒤 1/4):

```ts
import { hookCommandTexts, hookMapValid, preToolUseGuards, type ShellGuard } from "./hooks.ts";
import { mcpInstallKey, skillInstallKey } from "./identity.ts";
import { emptyInstructionSet, readGlobalInstructions, readProjectInstructions } from "./instructions.ts";
```

`src/scan/claude.ts`(찾을 곳 2/4):

```ts
  // 스킬
  const skills: SkillFact[] = [];
  const unreadableDirs: string[] = [];
```

`src/scan/claude.ts`(바꾼 뒤 2/4):

```ts
  // 스킬
  // 정체 열쇠는 사실을 다 만든 뒤 마지막에 붙인다
  const skills: Omit<SkillFact, "installKey">[] = [];
  const unreadableDirs: string[] = [];
```

`src/scan/claude.ts`(찾을 곳 3/4):

```ts
  const plugins: PluginFact[] = [];
  const mcpServers: McpFact[] = [];
  for (const plugin of allPlugins) {
```

`src/scan/claude.ts`(바꾼 뒤 3/4):

```ts
  const plugins: PluginFact[] = [];
  const mcpServers: Omit<McpFact, "installKey">[] = [];
  for (const plugin of allPlugins) {
```

`src/scan/claude.ts`(찾을 곳 4/4):

```ts
    pluginsWithoutInstall,
    skills,
    mcpServers,
    projects,
```

`src/scan/claude.ts`(바꾼 뒤 4/4):

```ts
    pluginsWithoutInstall,
    skills: skills.map((skill) => ({ ...skill, installKey: skillInstallKey(skill) })),
    mcpServers: mcpServers.map((server) => ({ ...server, installKey: mcpInstallKey(server) })),
    projects,
```

`src/scan/identity.ts`(찾을 곳 1/2):

```ts
export function skillInstallKey(skill: SkillFact): string {
```

`src/scan/identity.ts`(바꾼 뒤 1/2):

```ts
export function skillInstallKey(skill: Omit<SkillFact, "installKey">): string {
```

`src/scan/identity.ts`(찾을 곳 2/2):

```ts
export function mcpInstallKey(server: McpFact): string | null {
```

`src/scan/identity.ts`(바꾼 뒤 2/2):

```ts
export function mcpInstallKey(server: Omit<McpFact, "installKey">): string | null {
```

`src/scan/types.ts`(찾을 곳 1/2):

```ts
  /** 이름 꼴 가운데 집계의 항목은 있는데 시각을 읽을 수 없는 것이 있다. 참이면 "30일 안"으로 본다(설계 11.3 「30일의 경계」) */
  usageUndated: boolean;
}

```

`src/scan/types.ts`(바꾼 뒤 1/2):

```ts
  /** 이름 꼴 가운데 집계의 항목은 있는데 시각을 읽을 수 없는 것이 있다. 참이면 "30일 안"으로 본다(설계 11.3 「30일의 경계」) */
  usageUndated: boolean;
  /** 설치의 정체 열쇠(identity.ts의 skillInstallKey). 관측 기록의 열쇠와 같다(설계 11.3 「설치의 정체」, 18.1) */
  installKey: string;
}

```

`src/scan/types.ts`(찾을 곳 2/2):

```ts
  /** 관리 정책이 막거나 허용 목록으로 정한다(바꿀 수 없음) */
  managedFixed: boolean;
}

```

`src/scan/types.ts`(바꾼 뒤 2/2):

```ts
  /** 관리 정책이 막거나 허용 목록으로 정한다(바꿀 수 없음) */
  managedFixed: boolean;
  /** 설치의 정체 열쇠(identity.ts의 mcpInstallKey). 정의의 지문이 없어 정체를 만들 수 없으면 null이다 */
  installKey: string | null;
}

```

`test/helpers/facts.ts`(찾을 곳 1/2):

```ts
  const path = input.path ?? `${HOME}/skills/${name}`;
  return {
    scope: "user",
```

`test/helpers/facts.ts`(바꾼 뒤 1/2):

```ts
  const path = input.path ?? `${HOME}/skills/${name}`;
  const fact: Omit<SkillFact, "installKey"> = {
    scope: "user",
```

`test/helpers/facts.ts`(찾을 곳 2/2):

```ts
  };
}

/** 사용자 범위의 켜져 있는 MCP 서버 하나 */
export function mcpServer(name: string, input: Partial<McpFact> = {}): McpFact {
  return { scope: "user", name, recordNames: [name], projectRoot: null, pluginId: null, definitionHash: `def-${name}`, enabled: true, managedFixed: false, ...input };
}
```

`test/helpers/facts.ts`(바꾼 뒤 2/2):

```ts
  };
  // 정체는 (범위, 프로젝트, 이름, 실제 경로)다. 스캐너의 열쇠와 글자는 다르지만 같은 것끼리 같고 다른 것끼리 다르다
  return { ...fact, installKey: input.installKey ?? JSON.stringify(["skill", fact.scope, fact.projectRoot ?? "", fact.name, fact.realPath ?? fact.path]) };
}

/** 사용자 범위의 켜져 있는 MCP 서버 하나. 정의의 지문이 없으면 정체도 없다 */
export function mcpServer(name: string, input: Partial<McpFact> = {}): McpFact {
  const fact: Omit<McpFact, "installKey"> = { scope: "user", name, recordNames: [name], projectRoot: null, pluginId: null, definitionHash: `def-${name}`, enabled: true, managedFixed: false, ...input };
  const key = fact.definitionHash === null ? null : JSON.stringify(["mcp", fact.scope, fact.projectRoot ?? "", fact.pluginId ?? "", fact.name, fact.definitionHash]);
  return { ...fact, installKey: input.installKey === undefined ? key : input.installKey };
}
```

`test/scan/identity.test.ts`(찾을 곳 1/2):

```ts
  usageUndated: false,
  ...over,
```

`test/scan/identity.test.ts`(바꾼 뒤 1/2):

```ts
  usageUndated: false,
  installKey: "",
  ...over,
```

`test/scan/identity.test.ts`(찾을 곳 2/2):

```ts
  managedFixed: false,
  ...over,
```

`test/scan/identity.test.ts`(바꾼 뒤 2/2):

```ts
  managedFixed: false,
  installKey: null,
  ...over,
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 20개, 시험 349개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/claude.test.ts src/scan/claude.ts src/scan/identity.ts src/scan/types.ts test/helpers/facts.ts test/scan/identity.test.ts
git commit -m "feat: 스킬과 서버 사실에 설치 정체 열쇠 추가"
```

---

### Task 13: 설치 판정의 바탕. 날짜의 경계, 사용 신호, 실린 목록 읽기

**Files:**
- Create: `src/core/installs/age.ts`
- Create: `src/core/installs/listing.ts`
- Create: `src/core/installs/signals.ts`
- Test: `test/core/installs-basics.test.ts`

**Interfaces:**
- Consumes: 1단계의 `localDateOf`, `LocalDate`, `Windows`(`src/adapters/common/dates.ts`), `SessionSummary`, `DayCell`. 과제 8의 `NormalizedCwds`, `ProjectLookup`.
- Produces: `EvalDay { today; timeZone }`, `ESTABLISHED_DAYS = 14`, `RECENT_USE_DAYS = 30`, `daysBefore(today, date): number`, `olderThan(today, date, days): boolean`, `msOlderThan(day: EvalDay, epochMs: number, days: number): boolean`(`src/core/installs/age.ts`). `UsedNames { inScore; inCollect }`, `usedSkillNames(summaries, windows): UsedNames`, `calledMcpNames(summaries, windows): UsedNames`, `anyIn(recordNames, names): boolean`(`src/core/installs/signals.ts`). `ListingKind = "skill" | "mcp"`, `SessionListing`, `sessionListings(summaries, kind, normalizedCwds, lookup): SessionListing[]`, `loadedSince(listings, recordNames, projectRoot: string | null, windows): boolean`, `restartedRecently(listings, recordNames, today): boolean`(`src/core/installs/listing.ts`).

E5와 E6의 판정(설계 11.3)이 기대는 세 가지를 만든다.

**날짜의 경계.** "14일 넘게 전"은 평가 시계의 현지 날짜로 오늘보다 15일 이상 앞선 날이다. 오늘과 그 앞 14일, 오늘보다 뒤의 날은 "14일 안"이다. "30일 넘게 전"도 같은 방식이고 오늘보다 31일 이상 앞선 날이다. 시각으로 적힌 것(폴더를 만든 시각, 집계의 마지막 사용 시각)은 평가 시계의 시간대로 날짜를 얻어 견준다. 같은 날 안의 시각 차이는 결과를 바꾸지 않는다.

**사용 신호.** 스킬은 신호 1~4(스킬 도구 호출, 스킬 귀속, 사람이 친 슬래시 명령, 스킬 주입) 가운데 하나라도 있는 날의 이름이고, MCP 서버는 호출한 도구 이름의 서버 자리나 응답의 귀속에 있는 이름이다(설계 9.5). 주 세션과 하위 세션을 합친다. 점수 구간의 것(썼다)과 수집 구간의 것(조건 ①)을 따로 모은다. 기록의 이름이 설치의 이름 꼴 가운데 하나와 글자 그대로 같으면 그 설치의 것이다(설계 10).

**실린 목록.** 주 세션에 실려 있던 스킬과 MCP 서버의 이름으로 두 가지를 본다. 하위 세션에 실리는 목록은 주 세션의 것과 달라서 넣지 않는다.

- `loadedSince`는 ㉮의 세션 기록 몫이다. 수집 구간에서, 처음 목록을 아는 주 세션이 응답한 날마다 그 세션 **모두**에 이름 꼴 가운데 하나가 실려 있었으면 실린 날이고 한 세션에라도 없으면 빠진 날이다. 그런 세션이 없는 날은 보지 않는다. "14일 넘게 전"의 실린 날이 있고 가장 늦은 빠진 날이 그보다 앞이면 채운다. 프로젝트 범위의 위치는 작업 폴더가 그 프로젝트로 묶이는 세션하고만 견준다.
- `restartedRecently`는 ㉱다. 한 세션 안에서 빠졌다가 14일 안에 다시 실렸거나, 그 이름이 실린 적이 있는 작업 폴더에서 최근 14일 안에 시작한 주 세션의 처음 목록(알 수 있는 것)에 그 이름이 없었으면 참이다. 그 작업 폴더의 주 세션에 한 번도 실린 적이 없는 이름은 둘째 몫으로 보지 않는다. 목록에 실리지 않는 설치가 늘 걸리지 않게 하려는 것이다. MCP 서버에도 쓴다.

둘째 몫은 설계 9.3의 「세션과 세션 사이의 빠짐」을 그대로 옮긴다. 본문이 정해 둔 것을 놓치기 쉬워서 적는다.

| 본문이 정한 것 | 코드 |
|---|---|
| 작업 폴더가 같은 주 세션끼리 한 묶음이다. 정규화한 경로로 견준다 | `SessionListing.cwdKey`가 같은 것끼리다 |
| 작업 폴더가 없음인 세션은 어느 묶음에도 넣지 않는다 | `cwdKey`가 `null`이다. 그런 세션끼리도 한 묶음이 아니다. 그 세션에 실린 이름은 "실린 적이 있는"에 들지 않고, 그 세션의 처음 목록도 견주지 않는다 |
| 세션이 시작한 날은 기록이 있는 가장 이른 날짜다. 그 날짜를 모르는 세션은 최근 14일 안에 시작한 것으로 본다 | `firstDate`가 `null`이면 최근이다. 모르면 미루는 쪽이다 |
| 처음 목록이 없음인 세션은 견주지 않는다. 빈 목록인 세션은 견준다 | `initial`이 `null`이면 건너뛰고, 빈 집합이면 "없었다"다 |

첫째 몫(한 세션 안에서 다시 실림)은 작업 폴더와 상관없다. 작업 폴더가 없는 세션의 것도 근거다.

이 계획이 정한 세부는 둘이다. "실린 적이 있는"은 요약의 날짜 칸 전체(수집 구간 밖의 칸도)와 처음 목록으로 본다. ㉱에 더 걸리는 쪽이라 판정을 미룬다. 정규화한 경로의 표에 없는 작업 폴더는 기록에 적힌 글자 그대로 견준다. 이쪽은 미루는 쪽이 아니다. 표기만 다른 같은 폴더를 다른 묶음으로 보아 ㉱를 놓칠 수 있다. 그래서 표를 빠짐없이 채우는 것이 입력의 약속이다(과제 8, 20).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/installs-basics.test.ts`(새 파일):

```ts
// 설치 판정의 바탕을 시험한다. 14일과 30일의 경계, 사용 신호를 이름으로 모으기, 실린 목록으로 보는 「계속 실려 있었나」와 「최근에 새로 시작됐나」(설계 9.5, 11.3 E5의 ④·㉮·㉱)
import { describe, expect, it } from "vitest";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { daysBefore, msOlderThan, olderThan } from "../../src/core/installs/age.ts";
import { loadedSince, restartedRecently, sessionListings } from "../../src/core/installs/listing.ts";
import { anyIn, calledMcpNames, usedSkillNames } from "../../src/core/installs/signals.ts";
import { projectLookup } from "../../src/core/projects.ts";
import { project } from "../helpers/facts.ts";
import { summary, type DayInput, type SummaryInput } from "../helpers/summaries.ts";

// 2026-11-13 12:00(서울). 점수 구간은 10-15부터, 수집 구간은 10-10부터다. 14일 넘게 전은 10-29와 그 앞, 30일 넘게 전은 10-13과 그 앞이다
const NOW = Date.UTC(2026, 10, 13, 3, 0);
const windows = makeWindows(NOW, "Asia/Seoul");
const TODAY = windows.today;

describe("날짜의 경계", () => {
  it("오늘을 0일로 세어 며칠 앞선 날인지 센다. 오늘보다 뒤의 날은 음수다", () => {
    expect(daysBefore(TODAY, "2026-11-13")).toBe(0);
    expect(daysBefore(TODAY, "2026-10-29")).toBe(15);
    expect(daysBefore(TODAY, "2025-11-13")).toBe(365);
    expect(daysBefore(TODAY, "2026-11-20")).toBe(-7);
  });
  it("14일 넘게 전은 오늘보다 15일 이상 앞선 날이다. 오늘과 그 앞 14일, 오늘보다 뒤의 날은 14일 안이다", () => {
    expect(olderThan(TODAY, "2026-10-29", 14)).toBe(true);
    expect(olderThan(TODAY, "2026-10-30", 14)).toBe(false);
    expect(olderThan(TODAY, "2026-11-13", 14)).toBe(false);
    expect(olderThan(TODAY, "2027-01-01", 14)).toBe(false);
  });
  it("30일 넘게 전은 오늘보다 31일 이상 앞선 날이다", () => {
    expect(olderThan(TODAY, "2026-10-13", 30)).toBe(true);
    expect(olderThan(TODAY, "2026-10-14", 30)).toBe(false);
  });
  it("시각은 평가 시계의 시간대로 날짜를 얻어 견준다. 같은 날 안의 시각 차이는 결과를 바꾸지 않는다", () => {
    const day = { today: TODAY, timeZone: "Asia/Seoul" };
    // 서울의 10-29 23:59와 10-30 00:00
    expect(msOlderThan(day, Date.UTC(2026, 9, 29, 14, 59), 14)).toBe(true);
    expect(msOlderThan(day, Date.UTC(2026, 9, 29, 15, 0), 14)).toBe(false);
    // 같은 시각도 시간대가 다르면 날짜가 다르다
    expect(msOlderThan({ today: TODAY, timeZone: "UTC" }, Date.UTC(2026, 9, 29, 15, 0), 14)).toBe(true);
  });
});

describe("사용 신호를 이름으로 모으기", () => {
  const cell = (input: DayInput): DayInput => ({ responses: 1, ...input });
  it("스킬은 네 신호 가운데 하나라도 있는 날의 이름이다. 점수 구간과 수집 구간을 따로 모으고 주 세션과 하위 세션을 합친다", () => {
    const main = summary({
      days: {
        "2026-10-09": cell({ skillSignals: { before: { tool: 1 } } }),
        "2026-10-12": cell({ skillSignals: { early: { slash: 1 } } }),
        "2026-10-15": cell({ skillSignals: { tooled: { tool: 2 }, zero: {} } }),
        "2026-11-13": cell({ skillSignals: { attributed: { attribution: 1 }, slashed: { slash: 1 } } }),
      },
    });
    const sub = summary({ kind: "sub", days: { "2026-11-01": cell({ skillSignals: { "plugin:injected": { injected: 3 } } }) } });
    const used = usedSkillNames([main, sub], windows);
    expect([...used.inScore].sort()).toEqual(["attributed", "plugin:injected", "slashed", "tooled"]);
    expect([...used.inCollect].sort()).toEqual(["attributed", "early", "plugin:injected", "slashed", "tooled"]);
  });
  it("MCP 서버는 호출한 도구 이름의 서버 자리와 응답의 귀속 가운데 하나라도 있으면 부른 것이다", () => {
    const main = summary({
      days: {
        "2026-10-12": cell({ mcpCalls: { old_server: 4 } }),
        "2026-11-10": cell({ mcpCalls: { db: 1, zero: 0 }, mcpAttributions: { "claude.ai Mail": 2 } }),
      },
    });
    const called = calledMcpNames([main], windows);
    expect([...called.inScore].sort()).toEqual(["claude.ai Mail", "db"]);
    expect([...called.inCollect].sort()).toEqual(["claude.ai Mail", "db", "old_server"]);
  });
  it("기록의 이름이 설치의 이름 꼴 가운데 하나와 글자 그대로 같으면 그 설치의 것이다", () => {
    const names = new Set(["claude_ai_Mail", "db"]);
    expect(anyIn(["claude.ai Mail", "claude_ai_Mail"], names)).toBe(true);
    expect(anyIn(["DB"], names)).toBe(false);
    expect(anyIn([], names)).toBe(false);
  });
});

describe("실린 목록 읽기", () => {
  const projects = [project("/work/app", { cwds: ["/work/app", "/work/app/web"] }), project("/work/lib")];
  const normalized = { "/work/app": "/work/app", "C:\\Work\\App\\web": "/work/app/web", "/work/lib": "/work/lib", "/elsewhere": "/elsewhere" };
  const lookup = projectLookup(projects, normalized);
  const listings = (sessions: SummaryInput[], kind: "skill" | "mcp" = "skill") => sessionListings(sessions.map((s) => summary(s)), kind, normalized, lookup);
  /** 그날 응답이 있고 그 스킬들이 실려 있던 날 */
  const on = (...loadedSkills: string[]): DayInput => ({ responses: 1, loadedSkills });
  const session = (days: Record<string, DayInput>, input: SummaryInput = {}): SummaryInput => ({ initialSkills: [], days, ...input });

  describe("sessionListings", () => {
    it("주 세션만 담고, 작업 폴더의 정규화한 경로와 묶인 프로젝트, 처음 목록, 날짜마다 실린 이름과 다시 실린 이름을 낸다", () => {
      const out = listings([
        { cwd: "C:\\Work\\App\\web", initialSkills: ["a"], days: { "2026-11-10": { responses: 2, loadedSkills: ["a", "b"], reloadedSkills: ["b"] } } },
        { cwd: "/elsewhere", initialSkills: null, days: {} },
        { cwd: null, days: {} },
        { kind: "sub", initialSkills: ["sub-only"], days: { "2026-11-10": on("sub-only") } },
      ]);
      expect(out).toHaveLength(3);
      expect(out[0]).toMatchObject({ cwdKey: "/work/app/web", projectRoot: "/work/app", firstDate: "2026-11-10" });
      expect([...out[0]!.initial!]).toEqual(["a"]);
      expect(out[0]!.days.map((d) => [d.date, d.responses, [...d.loaded], [...d.reloaded]])).toEqual([["2026-11-10", 2, ["a", "b"], ["b"]]]);
      expect([...out[0]!.everLoaded].sort()).toEqual(["a", "b"]);
      expect(out[1]).toMatchObject({ cwdKey: "/elsewhere", projectRoot: null, initial: null, firstDate: null });
      expect(out[2]).toMatchObject({ cwdKey: null, projectRoot: null });
    });
    it("MCP 서버는 서버의 목록을 본다", () => {
      const out = listings([{ initialSkills: ["skill"], initialMcpServers: ["db"], days: { "2026-11-10": { responses: 1, loadedSkills: ["skill"], loadedMcpServers: ["db", "mail"], reloadedMcpServers: ["mail"] } } }], "mcp");
      expect([...out[0]!.initial!]).toEqual(["db"]);
      expect([...out[0]!.days[0]!.loaded]).toEqual(["db", "mail"]);
      expect([...out[0]!.days[0]!.reloaded]).toEqual(["mail"]);
    });
  });

  describe("loadedSince: 14일 넘게 전의 날부터 오늘까지 주 세션이 있던 날마다 빠짐없이 실려 있었나", () => {
    const since = (sessions: SummaryInput[], names = ["x"], projectRoot: string | null = null) => loadedSince(listings(sessions), names, projectRoot, windows);

    it("14일 넘게 전의 실린 날이 있고 그날부터 빠진 날이 없으면 채운다", () => {
      expect(since([session({ "2026-10-29": on("x"), "2026-11-05": on("x"), "2026-11-13": on("x") })])).toBe(true);
      expect(since([session({ "2026-10-20": on("x") })])).toBe(true);
    });
    it("실린 날이 14일 안에만 있으면 채우지 못한다", () => {
      expect(since([session({ "2026-10-30": on("x"), "2026-11-13": on("x") })])).toBe(false);
      expect(since([])).toBe(false);
    });
    it("빠진 날이 있어도 그 뒤에 14일 넘게 전의 실린 날이 있으면 채운다. 다시 깐 지 14일이 넘은 것이다", () => {
      expect(since([session({ "2026-10-15": on("x"), "2026-10-20": on(), "2026-10-25": on("x"), "2026-11-13": on("x") })])).toBe(true);
    });
    it("가장 늦은 빠진 날 뒤의 실린 날이 14일 안에만 있으면 채우지 못한다", () => {
      expect(since([session({ "2026-10-15": on("x"), "2026-10-29": on(), "2026-10-30": on("x") })])).toBe(false);
      expect(since([session({ "2026-10-15": on("x"), "2026-11-13": on() })])).toBe(false);
    });
    it("그날 응답이 있는 세션 모두에 실려 있어야 실린 날이다. 한 세션에라도 없으면 빠진 날이다", () => {
      const both = [session({ "2026-10-20": on("x"), "2026-11-12": on("x") }), session({ "2026-11-12": on("other") })];
      expect(since(both)).toBe(false);
      expect(since([session({ "2026-10-20": on("x"), "2026-11-12": on("x") }), session({ "2026-11-12": on("x", "other") })])).toBe(true);
    });
    it("처음 목록을 모르는 세션은 견주지 않는다. 그런 세션만 있는 날은 보지 않는 날이다", () => {
      const unknown = session({ "2026-11-12": on() }, { initialSkills: null });
      expect(since([session({ "2026-10-20": on("x") }), unknown])).toBe(true);
      expect(since([session({ "2026-10-20": on("x") }, { initialSkills: null })])).toBe(false);
    });
    it("응답이 없는 날과 수집 구간 밖의 날은 보지 않는다", () => {
      expect(since([session({ "2026-10-20": on("x"), "2026-11-12": { responses: 0, humanRequests: 3 } })])).toBe(true);
      expect(since([session({ "2026-10-09": on("x"), "2026-11-13": on("x") })])).toBe(false);
      expect(since([session({ "2026-10-20": { responses: 0, loadedSkills: ["x"] } })])).toBe(false);
    });
    it("이름 꼴 가운데 하나만 실려 있어도 실린 것이다", () => {
      expect(since([session({ "2026-10-20": on("folder-name") })], ["declared-name", "folder-name"])).toBe(true);
    });
    it("프로젝트 범위의 위치는 작업 폴더가 그 프로젝트로 묶이는 주 세션하고만 견준다. 하위 폴더에서 연 세션도 든다", () => {
      const inApp = session({ "2026-10-20": on("x"), "2026-11-12": on("x") }, { cwd: "C:\\Work\\App\\web" });
      const inLib = session({ "2026-11-12": on() }, { cwd: "/work/lib" });
      expect(since([inApp, inLib], ["x"], "/work/app")).toBe(true);
      expect(since([inApp, inLib], ["x"], null)).toBe(false);
      expect(since([inApp, inLib], ["x"], "/work/lib")).toBe(false);
    });
  });

  describe("restartedRecently: 최근 14일 안에 새로 시작됐다는 근거가 세션 기록에 있나", () => {
    const restarted = (sessions: SummaryInput[], names = ["x"]) => restartedRecently(listings(sessions), names, TODAY);

    it("한 세션 안에서 빠졌다가 14일 안에 다시 실렸으면 근거다. 14일 넘게 전의 것은 아니다", () => {
      expect(restarted([session({ "2026-10-30": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["x"] } }, { initialSkills: ["x"] })])).toBe(true);
      expect(restarted([session({ "2026-10-29": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["x"] } }, { initialSkills: ["x"] })])).toBe(false);
      expect(restarted([session({ "2026-11-10": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["other"] } }, { initialSkills: ["x"] })])).toBe(false);
    });
    it("그 이름이 실리던 작업 폴더에서 최근 14일 안에 시작한 주 세션의 처음 목록에 없었으면 근거다", () => {
      const before = session({ "2026-10-20": on("x") }, { initialSkills: ["x"] });
      const recent = session({ "2026-11-05": on() }, { initialSkills: ["other"] });
      expect(restarted([before, recent])).toBe(true);
      // 세션 도중에 실린 것도 처음 목록에는 없던 것이다
      expect(restarted([session({ "2026-11-05": on("x") }, { initialSkills: [] })])).toBe(true);
    });
    it("14일보다 전에 시작한 세션의 처음 목록에 없던 것은 근거가 아니다", () => {
      const loaded = session({ "2026-11-01": on("x") }, { initialSkills: ["x"] });
      const old = session({ "2026-10-29": on(), "2026-11-10": on() }, { initialSkills: [] });
      expect(restarted([loaded, old])).toBe(false);
    });
    it("그 작업 폴더의 주 세션에 한 번도 실린 적이 없는 이름은 이 몫으로 보지 않는다", () => {
      expect(restarted([session({ "2026-11-05": on("other") }, { initialSkills: ["other"] })])).toBe(false);
    });
    it("다른 작업 폴더의 세션 때문에 걸리지 않는다. 같은 폴더인지는 정규화한 경로로 본다", () => {
      const inApp = session({ "2026-10-20": on("x") }, { cwd: "/work/app", initialSkills: ["x"] });
      const inLib = session({ "2026-11-05": on() }, { cwd: "/work/lib", initialSkills: [] });
      expect(restarted([inApp, inLib])).toBe(false);
      const web = session({ "2026-10-20": on("x") }, { cwd: "C:\\Work\\App\\web", initialSkills: ["x"] });
      const sameWeb = session({ "2026-11-05": on() }, { cwd: "C:\\Work\\App\\web", initialSkills: [] });
      expect(restarted([web, sameWeb])).toBe(true);
    });
    it("처음 목록을 모르는 세션은 견주지 않는다. 빈 목록인 세션은 견준다", () => {
      const loaded = session({ "2026-10-20": on("x") }, { initialSkills: ["x"] });
      expect(restarted([loaded, session({ "2026-11-05": on() }, { initialSkills: null })])).toBe(false);
      expect(restarted([loaded, session({ "2026-11-05": on() }, { initialSkills: [] })])).toBe(true);
    });
    it("시작한 날을 모르는 세션은 최근 14일 안에 시작한 것으로 본다. 모르면 미루는 쪽이다", () => {
      const loaded = session({ "2026-10-20": on("x") }, { initialSkills: ["x"] });
      expect(restarted([loaded, session({}, { initialSkills: [] })])).toBe(true);
      // 날짜를 몰라도 처음 목록에 있었으면 빠진 것이 아니고, 처음 목록을 모르면 견주지 않는다
      expect(restarted([loaded, session({}, { initialSkills: ["x"] })])).toBe(false);
      expect(restarted([loaded, session({}, { initialSkills: null })])).toBe(false);
      // 보는 것은 요약에 적힌 "기록이 있는 가장 이른 날짜"이지 날짜 칸이 있는지가 아니다. 날짜 칸이 오래돼도 그 날짜를 모르면 최근이고, 날짜 칸이 없어도 그 날짜가 오래됐으면 최근이 아니다
      expect(restarted([loaded, session({ "2026-10-20": on() }, { initialSkills: [], firstDate: null })])).toBe(true);
      expect(restarted([loaded, session({}, { initialSkills: [], firstDate: "2026-10-20" })])).toBe(false);
    });
    it("작업 폴더가 없는 세션은 어느 묶음에도 넣지 않는다. 그런 세션끼리도 한 묶음이 아니다", () => {
      const loaded = session({ "2026-10-20": on("x") }, { cwd: null, initialSkills: ["x"] });
      const recent = session({ "2026-11-05": on() }, { cwd: null, initialSkills: [] });
      expect(restarted([loaded, recent])).toBe(false);
      // 작업 폴더가 없는 세션 하나가 처음에는 없다가 뒤에 실은 것도 묶음이 없어서 보지 않는다
      expect(restarted([session({ "2026-11-05": on("x") }, { cwd: null, initialSkills: [] })])).toBe(false);
      // 작업 폴더가 있는 묶음에 실린 적이 있어도, 작업 폴더가 없는 세션의 처음 목록은 그 묶음과 견주지 않는다
      expect(restarted([session({ "2026-10-20": on("x") }, { initialSkills: ["x"] }), recent])).toBe(false);
      // 한 세션 안에서 빠졌다가 다시 실린 것은 작업 폴더와 상관없이 근거다
      expect(restarted([session({ "2026-11-05": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["x"] } }, { cwd: null, initialSkills: ["x"] })])).toBe(true);
    });
    it("이름 꼴 가운데 하나라도 처음 목록에 있으면 실려 있던 것이다", () => {
      const loaded = session({ "2026-10-20": on("folder-name") }, { initialSkills: ["folder-name"] });
      const recent = session({ "2026-11-05": on("folder-name") }, { initialSkills: ["folder-name"] });
      expect(restarted([loaded, recent], ["declared-name", "folder-name"])).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/installs-basics.test.ts`
Expected: FAIL. `../../src/core/installs/age.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/installs/age.ts`(새 파일):

```ts
// "14일 넘게 전"과 "30일 넘게 전"의 경계. 평가 시계의 현지 날짜로 세고 시각은 날짜로 바꿔 견준다(순수 함수, 설계 11.3 「날짜의 경계」, 「30일의 경계」)
import { localDateOf, type LocalDate } from "../../adapters/common/dates.ts";

/** 지금 설치가 이만큼 넘게 전부터 있어야 "안 쓴 것이 확인됨"이 될 수 있다(설계 11.3 E5의 ④) */
export const ESTABLISHED_DAYS = 14;
/** 도구의 집계에 적힌 마지막 사용이 이만큼 넘게 전이어야 "안 쓴 것이 확인됨"이 될 수 있다(설계 11.3 E5의 ②) */
export const RECENT_USE_DAYS = 30;

/** 평가 시계의 오늘과 시간대 */
export interface EvalDay {
  today: LocalDate;
  timeZone: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const epochDay = (date: LocalDate): number => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/** 오늘을 0일로 세어 그 날이 며칠 앞선 날인지. 오늘보다 뒤의 날은 음수다. */
export function daysBefore(today: LocalDate, date: LocalDate): number {
  return epochDay(today) - epochDay(date);
}

/** "days일 넘게 전"이다. 오늘보다 days+1일 이상 앞선 날이다. 오늘과 그 앞 days일, 오늘보다 뒤의 날은 "days일 안"이다. */
export function olderThan(today: LocalDate, date: LocalDate, days: number): boolean {
  return daysBefore(today, date) > days;
}

/** 시각(epoch 밀리초)을 평가 시계의 시간대로 날짜로 바꿔 견준다. 같은 날 안의 시각 차이는 결과를 바꾸지 않는다. */
export function msOlderThan(day: EvalDay, epochMs: number, days: number): boolean {
  return olderThan(day.today, localDateOf(epochMs, day.timeZone), days);
}
```

`src/core/installs/listing.ts`(새 파일):

```ts
// 주 세션에 실려 있던 스킬과 MCP 서버의 이름으로 두 가지를 본다. 14일 넘게 전부터 빠짐없이 실려 있었는지(㉮의 세션 기록 몫)와, 최근 14일 안에 새로 시작됐다는 근거가 있는지(㉱)다(순수 함수, 설계 11.3)
import type { LocalDate, Windows } from "../../adapters/common/dates.ts";
import type { SessionSummary } from "../../adapters/types.ts";
import type { NormalizedCwds, ProjectLookup } from "../projects.ts";
import { ESTABLISHED_DAYS, olderThan } from "./age.ts";
import { anyIn } from "./signals.ts";

export type ListingKind = "skill" | "mcp";

export interface ListedDay {
  date: LocalDate;
  responses: number;
  /** 그날 그 세션에 한 번이라도 실려 있던 이름 */
  loaded: ReadonlySet<string>;
  /** 세션 안에서 목록에서 빠졌다가 그날 다시 실린 이름 */
  reloaded: ReadonlySet<string>;
}

/** 주 세션 하나의 실린 목록 */
export interface SessionListing {
  /** 작업 폴더의 정규화한 경로. 정규화한 경로를 모르면 기록에 적힌 그대로다. 작업 폴더가 없으면 null이고 그런 세션은 어느 묶음에도 넣지 않는다(설계 9.3) */
  cwdKey: string | null;
  /** 작업 폴더가 묶인 프로젝트의 정규화한 뿌리. 목록의 어느 프로젝트에도 묶이지 않으면 null */
  projectRoot: string | null;
  /** 기록이 있는 가장 이른 날짜. 최근 14일 안에 시작한 세션인지를 가린다 */
  firstDate: LocalDate | null;
  /** 세션이 시작할 때 실려 있던 이름. 알 수 없으면 null */
  initial: ReadonlySet<string> | null;
  days: ListedDay[];
  /** 처음 목록과 모든 날의 실린 이름을 합친 것 */
  everLoaded: ReadonlySet<string>;
}

/** 주 세션의 요약을 실린 목록으로 바꾼다. 하위 세션에 실리는 목록은 주 세션의 것과 달라서 넣지 않는다(설계 11.3 「㉮와 ㉱는 주 세션의 기록만 본다」). */
export function sessionListings(summaries: readonly SessionSummary[], kind: ListingKind, normalizedCwds: NormalizedCwds, lookup: ProjectLookup): SessionListing[] {
  const normalized = new Map(Object.entries(normalizedCwds));
  const out: SessionListing[] = [];
  for (const summary of summaries) {
    if (summary.kind !== "main") continue;
    const initialNames = kind === "skill" ? summary.initialSkills : summary.initialMcpServers;
    const everLoaded = new Set<string>(initialNames ?? []);
    const days: ListedDay[] = [];
    for (const date of Object.keys(summary.days).sort()) {
      const cell = summary.days[date]!;
      const loaded = new Set(kind === "skill" ? cell.loadedSkills : cell.loadedMcpServers);
      for (const name of loaded) everLoaded.add(name);
      days.push({ date, responses: cell.responses, loaded, reloaded: new Set(kind === "skill" ? cell.reloadedSkills : cell.reloadedMcpServers) });
    }
    out.push({
      cwdKey: summary.cwd === null ? null : (normalized.get(summary.cwd) ?? summary.cwd),
      projectRoot: lookup(summary.cwd)?.normRoot ?? null,
      firstDate: summary.firstDate,
      initial: initialNames === null ? null : new Set(initialNames),
      days,
      everLoaded,
    });
  }
  return out;
}

/**
 * ㉮의 세션 기록 몫. 수집 구간에서, 처음 목록을 아는 주 세션이 응답한 날마다 그 세션 모두에 이름 꼴 가운데 하나가 실려 있었는지를 본다.
 * "14일 넘게 전"의 실린 날이 있고 그날부터 오늘까지 빠진 날이 없어야 한다. 가장 늦은 빠진 날보다 뒤에 그런 실린 날이 있으면 된다.
 * projectRoot를 주면(프로젝트 범위의 위치) 작업 폴더가 그 프로젝트로 묶이는 세션하고만 견준다.
 */
export function loadedSince(listings: readonly SessionListing[], recordNames: readonly string[], projectRoot: string | null, windows: Windows): boolean {
  const collect = new Set(windows.collectDates);
  /** 날짜 → 그날 응답한 견주는 세션 모두에 실려 있었는지. 열쇠가 없는 날은 보지 않는 날이다 */
  const loadedOn = new Map<LocalDate, boolean>();
  for (const listing of listings) {
    if (listing.initial === null || (projectRoot !== null && listing.projectRoot !== projectRoot)) continue;
    for (const day of listing.days) {
      if (!collect.has(day.date) || day.responses <= 0) continue;
      loadedOn.set(day.date, (loadedOn.get(day.date) ?? true) && anyIn(recordNames, day.loaded));
    }
  }
  let lastMissing = "";
  for (const [date, loaded] of loadedOn) if (!loaded && date > lastMissing) lastMissing = date;
  for (const [date, loaded] of loadedOn) if (loaded && date > lastMissing && olderThan(windows.today, date, ESTABLISHED_DAYS)) return true;
  return false;
}

/**
 * ㉱. 세션 기록에 최근 14일 안에 새로 시작됐다는 근거가 있다. 둘 가운데 하나다(설계 9.3 「세션과 세션 사이의 빠짐」, 11.3).
 * - 한 세션 안에서 실린 목록에서 빠졌다가 14일 안에 다시 실렸다.
 * - 작업 폴더가 같은 주 세션의 묶음에 그 이름이 실린 적이 있고, 그 묶음에서 최근 14일 안에 시작한 세션의 처음 목록에 그 이름이 없었다.
 * 둘째 몫에서 작업 폴더가 없는 세션은 어느 묶음에도 넣지 않는다. 처음 목록을 모르는 세션은 견주지 않고 빈 목록인 세션은 견준다.
 * 시작한 날(기록이 있는 가장 이른 날짜)을 모르는 세션은 최근 14일 안에 시작한 것으로 본다. 모르면 미루는 쪽이다.
 * 그 묶음의 주 세션에 한 번도 실린 적이 없는 이름은 둘째 몫으로 보지 않는다. 목록에 실리지 않는 설치가 늘 걸리지 않게 하려는 것이다.
 */
export function restartedRecently(listings: readonly SessionListing[], recordNames: readonly string[], today: LocalDate): boolean {
  const recent = (date: LocalDate | null): boolean => date === null || !olderThan(today, date, ESTABLISHED_DAYS);
  const loadedIn = new Set<string>();
  for (const listing of listings) {
    if (listing.days.some((day) => recent(day.date) && anyIn(recordNames, day.reloaded))) return true;
    if (listing.cwdKey !== null && anyIn(recordNames, listing.everLoaded)) loadedIn.add(listing.cwdKey);
  }
  return listings.some((listing) => listing.cwdKey !== null && loadedIn.has(listing.cwdKey) && listing.initial !== null && recent(listing.firstDate) && !anyIn(recordNames, listing.initial));
}
```

`src/core/installs/signals.ts`(새 파일):

```ts
// 세션 요약에서 사용 신호가 있었던 이름을 구간별로 모은다. 스킬은 신호 1~4, MCP 서버는 호출과 귀속이다. 주 세션과 하위 세션을 합친다(순수 함수, 설계 9.2, 9.5, 11.3 E5·E6)
import type { Windows } from "../../adapters/common/dates.ts";
import type { DayCell, SessionSummary } from "../../adapters/types.ts";

/** 사용 신호가 있었던 기록의 이름. inScore는 점수 구간, inCollect는 수집 구간이다(점수 구간은 수집 구간에 든다) */
export interface UsedNames {
  inScore: ReadonlySet<string>;
  inCollect: ReadonlySet<string>;
}

function collectNames(summaries: readonly SessionSummary[], windows: Windows, namesOf: (cell: DayCell) => string[]): UsedNames {
  const score = new Set(windows.scoreDates);
  const collect = new Set(windows.collectDates);
  const inScore = new Set<string>();
  const inCollect = new Set<string>();
  for (const summary of summaries) {
    for (const [date, cell] of Object.entries(summary.days)) {
      if (!collect.has(date)) continue;
      for (const name of namesOf(cell)) {
        inCollect.add(name);
        if (score.has(date)) inScore.add(name);
      }
    }
  }
  return { inScore, inCollect };
}

const positive = (record: Record<string, number>): string[] => Object.keys(record).filter((name) => record[name]! > 0);

/** 스킬 도구 호출, 스킬 귀속, 사람이 친 슬래시 명령, 스킬 주입 가운데 하나라도 있었던 스킬의 이름 */
export function usedSkillNames(summaries: readonly SessionSummary[], windows: Windows): UsedNames {
  return collectNames(summaries, windows, (cell) =>
    Object.keys(cell.skillSignals).filter((name) => {
      const counts = cell.skillSignals[name]!;
      return counts.tool + counts.attribution + counts.slash + counts.injected > 0;
    }),
  );
}

/** 호출한 도구 이름의 서버 자리나 응답의 귀속에 있었던 서버의 이름. 두 곳의 꼴은 다를 수 있고 설치의 이름 꼴이 둘을 다 담는다 */
export function calledMcpNames(summaries: readonly SessionSummary[], windows: Windows): UsedNames {
  return collectNames(summaries, windows, (cell) => [...positive(cell.mcpCalls), ...positive(cell.mcpAttributions)]);
}

/** 기록의 이름이 설치의 이름 꼴 가운데 하나와 글자 그대로 같으면 그 설치의 것이다(설계 10 「설치와 기록의 이름을 잇는 법」) */
export function anyIn(recordNames: readonly string[], names: ReadonlySet<string>): boolean {
  return recordNames.some((name) => names.has(name));
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 8개, 시험 179개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/installs-basics.test.ts src/core/installs/age.ts src/core/installs/listing.ts src/core/installs/signals.ts
git commit -m "feat: 설치 판정의 날짜 경계와 신호·목록 읽기 추가"
```

---

### Task 14: 설치 하나의 판정(썼다, 안 쓴 것이 확인됨, 쓰는지 모름)

**Files:**
- Create: `src/core/installs/verdict.ts`
- Test: `test/core/installs-verdict.test.ts`

**Interfaces:**
- Consumes: 과제 2의 `usageUndated`, 과제 12의 `installKey`, 과제 13의 `EvalDay`, `msOlderThan`, `olderThan`, `UsedNames`, `anyIn`, `SessionListing`, `loadedSince`, `restartedRecently`. 1부의 `InstallRecord`(`src/state/state.ts`), `SkillFact`, `McpFact`, `FileStatus`.
- Produces: `Verdict = "used" | "unused" | "unknown"`, `VerdictContext { day; windows; records: ReadonlyMap<string, InstallRecord> | null; used: UsedNames; listings: readonly SessionListing[]; complete: boolean }`, `recordMap(installs: readonly InstallRecord[] | null)`, `skillEstablished(skill: SkillFact, context): boolean`, `serverEstablished(server: McpFact, context): boolean`, `skillVerdict(skill: SkillFact, claudeJson: FileStatus, context): Verdict`, `serverVerdict(server: McpFact, context): Verdict`(`src/core/installs/verdict.ts`).

스킬은 위치마다, MCP 서버는 서버마다 셋 가운데 하나로 가른다(설계 11.3 E5와 E6).

| 판정 | 스킬 위치 | MCP 서버 |
|---|---|---|
| 썼다(`used`) | 신호 1~4 가운데 하나라도 점수 구간에 있다. 훅이 내용을 넣어 주는 스킬은 빼고다 | 점수 구간에 부른 기록이 있다 |
| 안 쓴 것이 확인됨(`unused`) | ① 신호가 수집 구간에 없다 ② 도구의 집계가 없거나 마지막 사용이 30일 넘게 전이다 ③ 관측이 빠짐없다 ④ 지금 설치가 14일 넘게 전부터 있었다 ⑤ 훅이 내용을 넣어 주는 스킬이 아니다 | ① 수집 구간에 부른 기록이 없다 ③ 관측이 빠짐없다 ④ 지금 설치가 14일 넘게 전부터 있었다 |
| 쓰는지 모름(`unknown`) | 그 밖 전부. 훅이 내용을 넣어 주는 스킬은 쓴 신호가 있어도 늘 여기다 | 그 밖 전부. 정의를 읽지 못해 정체가 없는 서버는 부른 기록이 있어도 늘 여기다 |

**조건 ④는 이름이 아니라 지금의 설치를 본다.** 증거가 하나 있고 반대 근거가 하나도 없어야 한다.

| | 스킬 위치 | MCP 서버 |
|---|---|---|
| 증거 ㉮ | 세션 기록에 14일 넘게 전부터 빠짐없이 실려 있었고(`loadedSince`), 폴더를 만든 시각도 14일 넘게 앞선다. 링크로 걸었으면 링크 자체와 그 대상을 다 본다. 만든 시각을 모르면 쓰지 못한다 | 쓰지 않는다. 서버에는 그 이름이 지금 설치와 이어진다는 근거가 따로 없다 |
| 증거 ㉯ | 관측 기록에 같은 정체의 기록이 있고 그 첫날이 14일 넘게 앞선다 | 같다. 서버는 이것으로만 채운다 |
| 반대 근거 ㉰ | 폴더나 링크, 링크의 대상을 만든 시각이 14일 안이다 | 없다 |
| 반대 근거 ㉱ | `restartedRecently` | 같다 |
| 반대 근거 ㉲ | 관측 기록에 "새로 나타남"으로 적혀 있고 그 첫날이 14일 안이다 | 같다 |
| 반대 근거 ㉳ | 관측 기록은 있는데(첫 점검이 아니다) 이 정체의 기록이 없다 | 같다 |

- 첫 점검(`records`가 `null`)에서는 ㉯를 채울 수 없으므로 MCP 서버는 부른 기록이 없으면 모두 쓰는지 모름이다. 스킬은 ㉮로 채울 수 있다.
- 관측 기록은 지난 점검까지의 것이다. 이번 점검이 "오늘 봤다"고 적은 날짜는 14일 넘게 있었다는 증거가 되지 못하고, 첫 점검에서 이미 있던 것은 "새로 나타남"이 아니므로, 같은 날 다시 점검해도 판정이 같다(설계 12.1).
- **조건 ②.** 집계가 든 파일(`~/.claude.json`)을 읽지 못했거나 그 파일이 없으면 집계가 없는 것이 아니라 모르는 것이라 채우지 못한다. 집계의 항목은 있는데 시각을 모르면(과제 2의 `usageUndated`) "30일 안"이다.
- "썼다"는 ①~④를 따지지 않는다. 새로 깔았어도, 관측이 빠졌어도, 집계를 읽지 못했어도 쓴 신호가 있으면 썼다.
- **훅이 내용을 넣어 주는 스킬(⑤)은 맨 먼저 본다.** 쓴 신호가 있어도 쓰는지 모름이다. 훅으로 실린 내용은 신호를 남기지 않아서 이 스킬은 안 쓴 것이 확인될 수 없다. 쓴 것만 "썼다"로 세면 판정된 것이 쓴 쪽으로만 모여 E5가 실제보다 좋게 나온다. 설계가 구조상 판정할 수 없는 것을 판정할 수 있는 대상에서 빼는 까닭이 이것이고(설계 11.3 「판정된 것이 적을 때」), 정의를 읽지 못하는 서버를 부른 기록이 있어도 세지 않는 것과 같은 선이다. 리뷰 1차에서 고쳤다. 처음 계획은 쓴 신호가 있으면 썼다로 셌다.
- 묶음으로 합치는 일과 읽지 못했을 때의 처리는 과제 15와 16이 한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/installs-verdict.test.ts`(새 파일):

```ts
// 설치 하나의 판정을 시험한다. 지금 설치가 14일 넘게 전부터 있었는지(㉮~㉳)와 스킬 위치·MCP 서버의 「썼다, 안 쓴 것이 확인됨, 쓰는지 모름」(설계 11.3 E5·E6, 21.1)
import { describe, expect, it } from "vitest";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { sessionListings } from "../../src/core/installs/listing.ts";
import { calledMcpNames, usedSkillNames } from "../../src/core/installs/signals.ts";
import { recordMap, serverEstablished, serverVerdict, skillEstablished, skillVerdict, type VerdictContext } from "../../src/core/installs/verdict.ts";
import { projectLookup } from "../../src/core/projects.ts";
import type { McpFact, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { mcpServer, project, skill } from "../helpers/facts.ts";
import { summary, type DayInput, type SummaryInput } from "../helpers/summaries.ts";

// 2026-11-13(서울). 14일 넘게 전은 10-29와 그 앞, 30일 넘게 전은 10-13과 그 앞이다
const NOW = Date.UTC(2026, 10, 13, 3, 0);
const windows = makeWindows(NOW, "Asia/Seoul");
const LONG_AGO = Date.UTC(2026, 8, 1);
const LAST_WEEK = Date.UTC(2026, 10, 6);
const lookup = projectLookup([project("/work/app")], { "/work/app": "/work/app" });

interface ContextInput {
  sessions?: SummaryInput[];
  records?: InstallRecord[] | null;
  complete?: boolean;
}
const context = (kind: "skill" | "mcp", input: ContextInput = {}): VerdictContext => {
  const summaries = (input.sessions ?? []).map((s) => summary(s));
  return {
    day: { today: windows.today, timeZone: "Asia/Seoul" },
    windows,
    records: recordMap(input.records ?? null),
    used: kind === "skill" ? usedSkillNames(summaries, windows) : calledMcpNames(summaries, windows),
    listings: sessionListings(summaries, kind, { "/work/app": "/work/app" }, lookup),
    complete: input.complete ?? true,
  };
};
const record = (install: { installKey: string | null }, firstSeen: string, appeared = false): InstallRecord => ({ key: install.installKey!, firstSeen, appeared });
/** 10-20부터 어제까지 그 스킬이 실려 있던 주 세션 */
const loaded = (name: string, extra: Record<string, DayInput> = {}): SummaryInput => ({
  initialSkills: [name],
  days: { "2026-10-20": { responses: 1, loadedSkills: [name] }, "2026-11-12": { responses: 1, loadedSkills: [name] }, ...extra },
});
const old = (name: string, input: Partial<SkillFact> = {}): SkillFact => skill(name, { createdMs: LONG_AGO, ...input });

describe("스킬 위치: 지금 설치가 14일 넘게 전부터 있었나", () => {
  const established = (fact: SkillFact, input: ContextInput = {}) => skillEstablished(fact, context("skill", input));

  it("㉮ 14일 넘게 전부터 빠짐없이 실려 있었고 폴더를 만든 시각도 14일 넘게 앞서면 채운다. 첫 점검에서도 된다", () => {
    expect(established(old("x"), { sessions: [loaded("x")] })).toBe(true);
  });
  it("㉮는 폴더를 만든 시각을 알아야 쓴다. 링크로 걸었으면 링크 자체와 그 대상을 다 본다", () => {
    expect(established(skill("x", { createdMs: null }), { sessions: [loaded("x")] })).toBe(false);
    const link = { isLink: true, realPath: "/store/x" };
    expect(established(old("x", { ...link, targetCreatedMs: LONG_AGO }), { sessions: [loaded("x")] })).toBe(true);
    expect(established(old("x", { ...link, targetCreatedMs: null }), { sessions: [loaded("x")] })).toBe(false);
  });
  it("㉯ 상태 파일에 같은 정체의 기록이 있고 그 첫날이 14일 넘게 앞서면 채운다. 목록에 실리지 않는 스킬은 이것으로만 채운다", () => {
    const quiet = skill("quiet", { listed: false, createdMs: null });
    expect(established(quiet, { records: [record(quiet, "2026-10-29")] })).toBe(true);
    expect(established(quiet, { records: [record(quiet, "2026-10-30")] })).toBe(false);
  });
  it("증거가 없으면 채우지 못한다", () => {
    expect(established(old("x"))).toBe(false);
    expect(established(old("x"), { sessions: [{ initialSkills: ["x"], days: { "2026-11-10": { responses: 1, loadedSkills: ["x"] } } }] })).toBe(false);
  });
  it("프로젝트 범위의 위치는 그 프로젝트로 묶이는 세션의 기록으로 ㉮를 본다", () => {
    const inProject = old("x", { scope: "project", projectRoot: "/work/app", path: "/work/app/.claude/skills/x" });
    expect(established(inProject, { sessions: [{ ...loaded("x"), cwd: "/work/app" }] })).toBe(true);
    expect(established(inProject, { sessions: [{ ...loaded("x"), cwd: "/work/other" }] })).toBe(false);
  });
  it("㉰ 폴더나 링크를 만든 시각이 14일 안이면 다른 증거가 있어도 채우지 못한다", () => {
    const fresh = skill("x", { createdMs: LAST_WEEK });
    expect(established(fresh, { sessions: [loaded("x")], records: [record(fresh, "2026-09-01")] })).toBe(false);
    const relinked = old("x", { isLink: true, realPath: "/store/x", targetCreatedMs: LAST_WEEK });
    expect(established(relinked, { records: [record(relinked, "2026-09-01")] })).toBe(false);
  });
  it("㉱ 세션 기록에 최근 14일 안에 새로 시작됐다는 근거가 있으면 채우지 못한다", () => {
    const fact = old("x");
    const reloaded = loaded("x", { "2026-11-05": { responses: 1, loadedSkills: ["x"], reloadedSkills: ["x"] } });
    expect(established(fact, { sessions: [reloaded], records: [record(fact, "2026-09-01")] })).toBe(false);
    const absentAtStart: SummaryInput = { initialSkills: [], days: { "2026-11-05": { responses: 1, loadedSkills: [] } } };
    expect(established(fact, { sessions: [loaded("x"), absentAtStart], records: [record(fact, "2026-09-01")] })).toBe(false);
  });
  it("㉲ 지난 점검에는 없다가 14일 안의 점검에 새로 나타났으면 채우지 못한다. 새로 나타난 지 14일이 넘었으면 ㉯로 채운다", () => {
    const fact = old("x");
    expect(established(fact, { sessions: [loaded("x")], records: [record(fact, "2026-11-01", true)] })).toBe(false);
    expect(established(fact, { records: [record(fact, "2026-10-01", true)] })).toBe(true);
  });
  it("㉳ 관측 기록은 있는데 이 정체의 기록이 없으면 지난 점검과 정체가 다른 것이다. 첫 점검에는 이 근거가 없다", () => {
    const fact = old("x");
    const other = old("other");
    expect(established(fact, { sessions: [loaded("x")], records: [record(other, "2026-09-01")] })).toBe(false);
    expect(established(fact, { sessions: [loaded("x")], records: [] })).toBe(false);
    expect(established(fact, { sessions: [loaded("x")], records: null })).toBe(true);
  });
  it("같은 날 다시 점검해도 같다. 오늘 적은 날짜는 증거가 되지 못하고, 첫 점검에서 이미 있던 것은 새로 나타난 것이 아니다", () => {
    const fact = old("x");
    const first = established(fact, { sessions: [loaded("x")], records: null });
    const again = established(fact, { sessions: [loaded("x")], records: [record(fact, windows.today, false)] });
    expect([first, again]).toEqual([true, true]);
  });
});

describe("MCP 서버: 지금 설치가 14일 넘게 전부터 있었나", () => {
  const established = (fact: McpFact, input: ContextInput = {}) => serverEstablished(fact, context("mcp", input));
  const listed = (name: string): SummaryInput => ({ initialMcpServers: [name], days: { "2026-10-20": { responses: 1, loadedMcpServers: [name] }, "2026-11-12": { responses: 1, loadedMcpServers: [name] } } });

  it("㉯로만 채운다. 세션 기록에 이름이 오래 실려 있었어도 첫 점검에서는 채우지 못한다", () => {
    const db = mcpServer("db");
    expect(established(db, { sessions: [listed("db")] })).toBe(false);
    expect(established(db, { records: [record(db, "2026-10-29")] })).toBe(true);
    expect(established(db, { records: [record(db, "2026-10-30")] })).toBe(false);
  });
  it("정의가 달라지면 다른 정체라서 앞의 기록이 이어지지 않는다", () => {
    const before = mcpServer("db", { definitionHash: "v1" });
    const after = mcpServer("db", { definitionHash: "v2" });
    expect(established(after, { records: [record(before, "2026-09-01")] })).toBe(false);
  });
  it("㉱와 ㉲도 본다. 이름이 빠졌다가 다시 나타났거나 14일 안의 점검에 새로 나타났으면 채우지 못한다", () => {
    const db = mcpServer("db");
    const reconnected: SummaryInput = { initialMcpServers: ["db"], days: { "2026-11-05": { responses: 1, loadedMcpServers: ["db"], reloadedMcpServers: ["db"] } } };
    expect(established(db, { sessions: [reconnected], records: [record(db, "2026-09-01")] })).toBe(false);
    expect(established(db, { records: [record(db, "2026-11-01", true)] })).toBe(false);
  });
  it("정의를 읽지 못해 정체가 없는 서버는 채우지 못한다", () => {
    expect(established(mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null }), { records: [] })).toBe(false);
  });
});

describe("스킬 위치의 판정", () => {
  const verdict = (fact: SkillFact, input: ContextInput = {}, claudeJson: "ok" | "missing" | "unparsable" | "unreadable" = "ok") => skillVerdict(fact, claudeJson, context("skill", input));
  const signal = (date: string, name: string): SummaryInput => ({ kind: "sub", days: { [date]: { responses: 1, skillSignals: { [name]: { attribution: 1 } } } } });

  it("신호 1~4 가운데 하나라도 점수 구간에 있으면 썼다. 새로 깔았는지, 관측이 빠졌는지, 집계를 읽었는지는 따지지 않는다", () => {
    const fact = skill("x", { createdMs: LAST_WEEK });
    expect(verdict(fact, { sessions: [signal("2026-10-15", "x")], complete: false }, "unreadable")).toBe("used");
    expect(verdict(skill("x", { recordNames: ["declared", "x"] }), { sessions: [signal("2026-11-13", "declared")] })).toBe("used");
  });
  it("다섯 조건을 모두 채우면 안 쓴 것이 확인됨이다", () => {
    expect(verdict(old("x"), { sessions: [loaded("x")] })).toBe("unused");
  });
  it("① 신호가 수집 구간에 있으면(점수 구간 바로 앞) 쓰는지 모름이다", () => {
    expect(verdict(old("x"), { sessions: [loaded("x"), signal("2026-10-12", "x")] })).toBe("unknown");
    expect(verdict(old("x"), { sessions: [loaded("x"), signal("2026-10-09", "x")] })).toBe("unused");
  });
  it("② 도구의 집계가 없거나 마지막 사용이 30일 넘게 전이어야 한다. 시각을 모르는 집계는 30일 안으로 본다", () => {
    const sessions = [loaded("x")];
    expect(verdict(old("x", { usageLastUsedMs: Date.UTC(2026, 9, 13, 14, 59) }), { sessions })).toBe("unused");
    expect(verdict(old("x", { usageLastUsedMs: Date.UTC(2026, 9, 13, 15, 0) }), { sessions })).toBe("unknown");
    expect(verdict(old("x", { usageUndated: true }), { sessions })).toBe("unknown");
    expect(verdict(old("x", { usageLastUsedMs: LONG_AGO, usageUndated: true }), { sessions })).toBe("unknown");
  });
  it("② 집계가 든 파일을 읽지 못했거나 그 파일이 없으면 집계가 없는 것이 아니라 모르는 것이다", () => {
    for (const status of ["missing", "unparsable", "unreadable"] as const) expect(verdict(old("x"), { sessions: [loaded("x")] }, status)).toBe("unknown");
  });
  it("③ 스킬 사용 관측이 빠짐없지 않으면 쓰는지 모름이다", () => {
    expect(verdict(old("x"), { sessions: [loaded("x")], complete: false })).toBe("unknown");
  });
  it("④ 새로 깐 것, 다시 깐 것, 언제 깔았는지 모르는 것은 쓰는지 모름이다", () => {
    expect(verdict(skill("x", { createdMs: LAST_WEEK }), { sessions: [loaded("x")] })).toBe("unknown");
    expect(verdict(skill("x", { createdMs: null }), { sessions: [loaded("x")] })).toBe("unknown");
    expect(verdict(old("x"))).toBe("unknown");
  });
  it("⑤ 훅이 내용을 넣어 주는 스킬은 쓰는지 모름이다. 점수 구간에 쓴 신호가 있어도 썼다로 세지 않는다", () => {
    expect(verdict(old("x", { hookProvided: true }), { sessions: [loaded("x")] })).toBe("unknown");
    expect(verdict(old("x", { hookProvided: true }), { sessions: [loaded("x"), signal("2026-11-13", "x")] })).toBe("unknown");
    expect(verdict(skill("x", { createdMs: LAST_WEEK, hookProvided: true }), { sessions: [signal("2026-10-15", "x")] })).toBe("unknown");
  });
});

describe("MCP 서버의 판정", () => {
  const verdict = (fact: McpFact, input: ContextInput = {}) => serverVerdict(fact, context("mcp", input));
  const call = (date: string, input: DayInput): SummaryInput => ({ days: { [date]: { responses: 1, ...input } } });
  const watched = (fact: McpFact): InstallRecord[] => [record(fact, "2026-09-01")];

  it("점수 구간에 부른 기록이 있으면 불렀다. 호출한 도구 이름의 서버 자리와 응답의 귀속 가운데 하나에라도 이름 꼴이 있으면 된다", () => {
    const mail = mcpServer("my.mail", { recordNames: ["my.mail", "my_mail"] });
    expect(verdict(mail, { sessions: [call("2026-11-10", { mcpCalls: { my_mail: 1 } })] })).toBe("used");
    expect(verdict(mail, { sessions: [call("2026-10-15", { mcpAttributions: { "my.mail": 1 } })], complete: false })).toBe("used");
  });
  it("수집 구간에 부른 기록이 없고, 관측이 빠짐없고, 같은 정의를 14일 넘게 지켜봤으면 안 부른 것이 확인됨이다", () => {
    const db = mcpServer("db");
    expect(verdict(db, { records: watched(db) })).toBe("unused");
    expect(verdict(db, { records: watched(db), sessions: [call("2026-10-12", { mcpCalls: { db: 1 } })] })).toBe("unknown");
    expect(verdict(db, { records: watched(db), complete: false })).toBe("unknown");
  });
  it("첫 점검에서는 부른 기록이 없는 서버가 모두 쓰는지 모름이다", () => {
    expect(verdict(mcpServer("db"))).toBe("unknown");
  });
  it("정의를 읽지 못하는 서버는 늘 쓰는지 모름이다. 부른 기록이 있어도 같다", () => {
    const remote = mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null, recordNames: ["claude.ai Mail", "claude_ai_Mail"] });
    expect(verdict(remote, { records: [] })).toBe("unknown");
    expect(verdict(remote, { sessions: [call("2026-11-10", { mcpCalls: { claude_ai_Mail: 3 } })] })).toBe("unknown");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/installs-verdict.test.ts`
Expected: FAIL. `../../src/core/installs/verdict.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/installs/verdict.ts`(새 파일):

```ts
// 설치 하나를 「썼다, 안 쓴 것이 확인됨, 쓰는지 모름」으로 가른다. 스킬은 위치마다, MCP 서버는 서버마다 본다. 이름이 아니라 지금의 설치를 본다(순수 함수, 설계 11.3 E5·E6)
import type { Windows } from "../../adapters/common/dates.ts";
import type { FileStatus, McpFact, SkillFact } from "../../scan/types.ts";
import type { InstallRecord } from "../../state/state.ts";
import { ESTABLISHED_DAYS, RECENT_USE_DAYS, msOlderThan, olderThan, type EvalDay } from "./age.ts";
import { loadedSince, restartedRecently, type SessionListing } from "./listing.ts";
import { anyIn, type UsedNames } from "./signals.ts";

/** used는 썼다(불렀다), unused는 안 쓴 것이 확인됨, unknown은 쓰는지 모름이다 */
export type Verdict = "used" | "unused" | "unknown";

/** 판정에 쓰는 것. 도구 하나의 스킬(또는 MCP 서버) 쪽 기록과 지난 점검까지의 관측 기록이다 */
export interface VerdictContext {
  day: EvalDay;
  windows: Windows;
  /** 지난 점검까지의 관측 기록(정체 열쇠 → 기록). null이면 이 도구가 아직 관측을 적은 적이 없다(첫 점검) */
  records: ReadonlyMap<string, InstallRecord> | null;
  /** 사용 신호가 있었던 기록의 이름 */
  used: UsedNames;
  /** 주 세션에 실려 있던 이름 */
  listings: readonly SessionListing[];
  /** 그 지표(스킬 사용 또는 MCP 호출)의 관측이 빠짐없다(설계 9.8) */
  complete: boolean;
}

export function recordMap(installs: readonly InstallRecord[] | null): ReadonlyMap<string, InstallRecord> | null {
  return installs === null ? null : new Map(installs.map((record) => [record.key, record]));
}

/** 상태 파일이 말해 주는 것. ㉯는 증거이고 ㉲와 ㉳는 최근에 새로 시작됐다는 근거다 */
function observed(key: string | null, context: VerdictContext): { seenLong: boolean; appearedRecently: boolean; changed: boolean } {
  const record = key === null ? undefined : context.records?.get(key);
  const long = record !== undefined && olderThan(context.day.today, record.firstSeen, ESTABLISHED_DAYS);
  return {
    // ㉯ 같은 정체의 설치를 계속 봐 온 첫날이 14일 넘게 앞선다
    seenLong: long,
    // ㉲ 지난 점검에는 없다가 14일 안의 점검에 새로 나타났다
    appearedRecently: record !== undefined && record.appeared && !long,
    // ㉳ 관측 기록은 있는데 이 정체의 기록이 없다. 지난 점검과 정체가 다르다
    changed: context.records !== null && record === undefined,
  };
}

/** 조건 ④(스킬). 지금 설치가 14일 넘게 있었다는 증거가 있고, 최근 14일 안에 새로 시작됐다는 근거가 하나도 없다. */
export function skillEstablished(skill: SkillFact, context: VerdictContext): boolean {
  // 링크로 걸었으면 링크 자체와 그 대상을 만든 시각을 다 본다
  const created = skill.isLink ? [skill.createdMs, skill.targetCreatedMs] : [skill.createdMs];
  const recent = (ms: number | null): boolean => ms !== null && !msOlderThan(context.day, ms, ESTABLISHED_DAYS);
  const state = observed(skill.installKey, context);
  // ㉮ 세션 기록의 이름은 지금 설치의 기록이 아니다. 폴더를 만든 시각이 14일 넘게 앞설 때에만 그 이름이 지금 설치와 이어진다
  const createdLongAgo = created.every((ms) => ms !== null && !recent(ms));
  const loaded = createdLongAgo && loadedSince(context.listings, skill.recordNames, skill.scope === "project" ? skill.projectRoot : null, context.windows);
  if (!loaded && !state.seenLong) return false;
  // ㉰ 만든 시각이 14일 안이다. ㉱ 세션 기록에 새로 시작됐다는 근거가 있다
  return !(created.some(recent) || restartedRecently(context.listings, skill.recordNames, context.day.today) || state.appearedRecently || state.changed);
}

/** 조건 ④(MCP 서버). ㉯로만 채운다. 서버에는 이름이 지금 설치와 이어진다는 근거가 따로 없어서 세션 기록(㉮)을 쓰지 않고, 폴더가 없어서 ㉰도 없다. */
export function serverEstablished(server: McpFact, context: VerdictContext): boolean {
  if (server.installKey === null) return false;
  const state = observed(server.installKey, context);
  return state.seenLong && !(restartedRecently(context.listings, server.recordNames, context.day.today) || state.appearedRecently || state.changed);
}

/** 조건 ②. 도구의 집계가 없거나 그 마지막 사용이 30일 넘게 전이다. 집계가 든 파일을 읽지 못했거나 그 파일이 없으면 모르는 것이라 채우지 못한다 */
function usageStale(skill: SkillFact, claudeJson: FileStatus, day: EvalDay): boolean {
  if (claudeJson !== "ok" || skill.usageUndated) return false;
  return skill.usageLastUsedMs === null || msOlderThan(day, skill.usageLastUsedMs, RECENT_USE_DAYS);
}

/**
 * 스킬 위치 하나의 판정. claudeJson은 도구의 집계가 든 파일(~/.claude.json)의 읽기 상태다.
 * 훅이 내용을 넣어 주는 스킬(조건 ⑤)은 쓴 신호가 있어도 쓰는지 모름이다. 훅으로 실린 내용은 신호를 남기지 않아서 이 스킬은 안 쓴 것이 확인될 수 없다.
 * 쓴 것만 썼다로 세면 판정된 것이 쓴 쪽으로만 모여 값이 실제보다 좋게 나온다. 정의를 읽지 못하는 서버를 부른 기록이 있어도 세지 않는 것과 같은 선이다.
 */
export function skillVerdict(skill: SkillFact, claudeJson: FileStatus, context: VerdictContext): Verdict {
  if (skill.hookProvided) return "unknown"; // ⑤
  if (anyIn(skill.recordNames, context.used.inScore)) return "used";
  const unused =
    !anyIn(skill.recordNames, context.used.inCollect) && // ①
    usageStale(skill, claudeJson, context.day) && // ②
    context.complete && // ③
    skillEstablished(skill, context); // ④
  return unused ? "unused" : "unknown";
}

/** MCP 서버 하나의 판정. 정의를 읽지 못해 정체가 없는 서버는 같은 설치인지 견줄 수 없어서 부른 기록이 있어도 늘 쓰는지 모름이다. */
export function serverVerdict(server: McpFact, context: VerdictContext): Verdict {
  if (server.installKey === null) return "unknown";
  if (anyIn(server.recordNames, context.used.inScore)) return "used";
  return !anyIn(server.recordNames, context.used.inCollect) && context.complete && serverEstablished(server, context) ? "unused" : "unknown";
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 9개, 시험 205개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/installs-verdict.test.ts src/core/installs/verdict.ts
git commit -m "feat: 스킬 위치와 MCP 서버의 사용 판정 추가"
```

---

### Task 15: 스킬 묶음과 E5(안 쓰는 스킬)

**Files:**
- Create: `src/core/installs/gate.ts`
- Create: `src/core/installs/skills.ts`
- Test: `test/core/installs-skills.test.ts`

**Interfaces:**
- Consumes: 과제 5의 `byContent`, 과제 7의 `Measurement`, `unmeasured`, `blank`, 과제 9의 `ToolSetup`, `enablementUnread`, `unread`, 과제 10의 `unreadableSkillPlaces`, 과제 14의 `skillVerdict`, `Verdict`, `VerdictContext`.
- Produces: `Counted { verdict; structural }`, `BLANK_INSTALL_EVIDENCE`, `measureInstalls(enabled: readonly Counted[], complete: boolean, minimum: number): Measurement`(`src/core/installs/gate.ts`). `SkillBundle { positions: SkillFact[]; enabled: boolean; verdict: Verdict; excluded: "plugin_unread" | "hook_provided" | null }`, `SkillJudgement { measurement; bundles }`, `judgeSkills(tool: ToolSetup, context: VerdictContext): SkillJudgement`, `MIN_JUDGED_SKILLS = 5`(`src/core/installs/skills.ts`).

E5는 안 쓴 것이 확인된 스킬을 판정된 스킬(썼다와 확인됨)로 나눈다. 쓰는지 모름은 분자와 분모에서 뺀다(설계 11.3).

**스킬 묶음.** 한 도구 안에서 실제 경로가 같은 위치들은 스킬 하나다. 실제 경로를 모르는 위치는 그것만으로 하나다(설계 10). 판정은 위치마다 하고(과제 14) 묶음으로 합친다. 위치 가운데 하나라도 썼다면 썼다, 모든 위치가 확인됨이면 확인됨, 그 밖은 쓰는지 모름이다. 구조상 판정할 수 없는 묶음(아래)은 다른 위치에 쓴 신호가 있어도 쓰는지 모름이다. 묶음의 켜짐은 위치 가운데 하나라도 켜져 있으면 켜진 것이고, E5는 켜져 있는 묶음만 센다. 꺼 둔 묶음도 판정은 해서 낸다. 과제 17의 스킬 끄기가 같은 이름의 다른 스킬을 볼 때 쓴다. 묶음과 그 안의 위치는 이름, 범위(사용자, 프로젝트, 플러그인), 경로의 차례다(설계 11.5). 차례는 끝까지 정한다. 이름, 범위, 실제 경로, 정체 열쇠, 플러그인 ID, 놓인 경로를 차례로 견주고 마지막에는 내용을 통째로 견준다(과제 5의 `byContent`). 같은 원본을 두 마켓에서 깐 플러그인의 스킬은 앞의 넷이 모두 같고 플러그인만 달라서, 거기서 멈추면 입력의 차례가 결과에 남는다(스캐너는 설치 ID마다 스킬 사실을 하나씩 낸다). 여섯이 모두 같은 사실도 온다. 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 1부의 스캐너가 같은 설치를 두 길로 찾아, 켜짐만 다른 스킬 사실 둘을 낸다. 그런 둘은 한 묶음에 위치 둘로 실리고 묶음의 켜짐은 하나라도 켜져 있으면 켜진 것이다.

**못 재는 까닭의 차례**(설계 11.3). 처음 맞는 것 하나를 낸다.

| 차례 | 조건 | 이유 |
|---|---|---|
| 1 | 그 도구가 스킬 사용을 기록하지 않는다 | `unsupported` |
| 2 | 설치를 찾는 곳, 설정 파일, 도구의 집계 가운데 읽지 못한 것이 있다 | `unreadable` |
| 3 | 켜져 있는 묶음이 하나도 없다 | `not_applicable` |
| 4 | 켜져 있는 묶음은 있는데 판정할 수 있는 대상이 하나도 없다 | `unsupported` |
| 5 | 스킬 사용 관측이 빠짐없지 않다 | `incomplete` |
| 6 | 판정할 수 있는 대상이 5개에 못 미친다 | `too_little` |
| 7 | 판정된 것이 판정할 수 있는 대상의 절반에 못 미치거나 5개에 못 미친다 | `watching` |

- **차례 2의 읽지 못한 것.** `~/.claude.json`(없을 때도 든다. 도구의 집계를 모른다), 사용자 스킬 폴더와 프로젝트의 스킬 폴더의 목록, 플러그인의 설치 기록 파일, 사용자 설정과 관리 정책 파일, 프로젝트 설정과 로컬 설정이다. 프로젝트의 `.mcp.json`은 상관없다. 이때와 차례 1에서는 판정하지 않는다. 안 쓴 것이 확인됨도 정비 후보도 나오지 않는다.
- **판정할 수 있는 대상.** 켜져 있는 묶음 가운데 구조상 판정할 수 없는 것을 뺀 것이다. 스킬을 찾는 폴더의 목록을 읽지 못한 플러그인의 스킬은 읽힌 것도 세지 않는다(`plugin_unread`). 위치 가운데 하나라도 훅이 내용을 넣어 주는 스킬인 묶음도 뺀다(`hook_provided`). 쓴 신호가 있어도 빼고, 훅이 가리키지 않는 다른 위치에 쓴 신호가 있어도 뺀다. 같은 내용이 훅으로 실리기 때문이다. 구성을 모르는 플러그인의 스킬은 스캐너가 처음부터 설치로 내지 않는다. 구성을 모르거나 훅을 읽지 못한 플러그인이 켜져 있어도 E5는 잰다. 스킬을 끄는 후보만 과제 17이 막는다.
- **근거 숫자.** `enabled`(켜져 있는 묶음), `judgeable`(판정할 수 있는 대상), `judged`(판정된 것), `structural`(구조상 판정할 수 없어 뺀 것), `unused`, `used`다. 못 잰 도구에서도 센 것은 싣고, 차례 1과 2에서는 모두 `null`이다. 설명 문장의 `{M}`은 `judgeable`이다(설계 11.5).
- 차례 3~7과 값의 계산은 E6과 같아서 `measureInstalls`에 둔다. 분모는 판정된 것의 수라서 `no_data`를 쓰지 않는다. 6과 7로 못 잰 도구에서도 묶음마다의 판정은 그대로다.
- **까닭이 겹칠 때의 시험.** 까닭을 하나씩만 일으키는 시험으로는 차례를 바꿔도 통과한다. 앞 까닭과 뒤 까닭이 함께 성립하는 입력을 따로 둔다. 3과 5(꺼 둔 것뿐인데 관측이 빠졌다), 4와 5(훅 스킬뿐인데 관측이 빠졌다), 5와 6(관측이 빠졌고 대상이 넷이다), 6과 7(대상이 넷이고 판정된 것이 하나다)이다. E6은 최소 개수가 달라서 과제 16에 같은 시험을 둔다.

이 계획이 정한 세부는 둘이다. 훅이 내용을 넣어 주는 위치가 든 묶음은 쓴 신호가 있어도 통째로 뺀다(설계 21.1의 반례 "켜져 있는 스킬이 스물이고 그 가운데 열일곱은 훅이 내용을 넣어 주는 스킬이다"는 쓴 신호를 따지지 않고 판정할 수 있는 대상을 셋으로 센다. 본문 11.3에도 한 문장으로 적었다). 세지 않는 플러그인의 위치가 든 묶음도 통째로 세지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/installs-skills.test.ts`(새 파일):

```ts
// E5(안 쓰는 스킬)를 시험한다. 위치를 스킬 묶음으로 합치기, 켜진 묶음만 세기, 읽지 못했을 때, 못 재는 까닭의 차례(설계 11.3 E5, 11.4, 21.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
import { sessionListings } from "../../src/core/installs/listing.ts";
import { usedSkillNames } from "../../src/core/installs/signals.ts";
import { judgeSkills } from "../../src/core/installs/skills.ts";
import { recordMap, type VerdictContext } from "../../src/core/installs/verdict.ts";
import type { ToolSetup } from "../../src/core/metrics/setup.ts";
import { projectLookup } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts, plugin, project, skill } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const lookup = projectLookup([], {});

interface Options {
  /** 점수 구간에 쓴 신호가 있는 스킬 이름 */
  used?: string[];
  /** 같은 정체로 14일 넘게 지켜본 스킬 */
  watched?: SkillFact[];
  complete?: boolean;
  coverage?: ToolCoverage;
}
const judge = (setup: Partial<ClaudeSetupFacts>, options: Options = {}) => {
  const sessions: SummaryInput[] = [{ days: { "2026-11-10": { responses: 1, skillSignals: Object.fromEntries((options.used ?? []).map((name) => [name, { tool: 1 }])) } } }];
  const summaries = sessions.map((s) => summary(s));
  const records: InstallRecord[] = (options.watched ?? []).map((fact) => ({ key: fact.installKey, firstSeen: "2026-09-01", appeared: false }));
  const context: VerdictContext = {
    day: { today: windows.today, timeZone: "Asia/Seoul" },
    windows,
    records: recordMap(records),
    used: usedSkillNames(summaries, windows),
    listings: sessionListings(summaries, "skill", {}, lookup),
    complete: options.complete ?? true,
  };
  const tool: ToolSetup = { tool: "claude-code", totals: toolTotals(summaries, windows, []), coverage: options.coverage ?? CLAUDE_COVERAGE, setup: facts(setup), highestVersion: "2.1.300" };
  return judgeSkills(tool, context);
};
const many = (prefix: string, count: number, input: Partial<SkillFact> = {}): SkillFact[] => Array.from({ length: count }, (_, i) => skill(`${prefix}${i + 1}`, input));
const names = (list: SkillFact[]): string[] => list.map((fact) => fact.name);
const verdicts = (judgement: ReturnType<typeof judge>) => judgement.bundles.map((bundle) => [bundle.positions.map((p) => `${p.scope}:${p.name}`).join("+"), bundle.verdict]);

describe("스킬 묶음", () => {
  const inProject = (name: string, input: Partial<SkillFact> = {}) => skill(name, { scope: "project", projectRoot: "/work/app", path: `/work/app/.claude/skills/${name}`, ...input });

  it("실제 경로가 같은 위치들은 스킬 하나다. 실제 경로를 모르는 위치는 그것만으로 하나다", () => {
    const skills = [skill("a", { realPath: "/store/a" }), inProject("a", { isLink: true, realPath: "/store/a" }), skill("b", { realPath: null }), inProject("b", { realPath: null }), skill("c")];
    expect(verdicts(judge({ skills })).map(([positions]) => positions)).toEqual(["user:a+project:a", "user:b", "project:b", "user:c"]);
  });
  it("위치 가운데 하나라도 썼다면 썼다. 모든 위치가 안 쓴 것이 확인됨이면 확인됨이다. 그 밖은 쓰는지 모름이다", () => {
    const linked = (name: string) => [skill(name, { realPath: `/store/${name}` }), inProject(`${name}-link`, { isLink: true, realPath: `/store/${name}`, targetCreatedMs: 0 })] as const;
    const [usedA, usedLink] = linked("used");
    const [idleA, idleLink] = linked("idle");
    const [halfA, halfLink] = linked("half");
    const judgement = judge({ skills: [usedA, usedLink, idleA, idleLink, halfA, halfLink] }, { used: ["used-link"], watched: [usedA, idleA, idleLink, halfA] });
    expect(verdicts(judgement)).toEqual([
      ["user:half+project:half-link", "unknown"],
      ["user:idle+project:idle-link", "unused"],
      ["user:used+project:used-link", "used"],
    ]);
  });
  it("위치 가운데 하나라도 훅이 내용을 넣어 주는 스킬이면 묶음은 쓰는지 모름이고 판정할 수 있는 대상에서 뺀다. 다른 위치에 쓴 신호가 있어도 같다", () => {
    const linked = (name: string) => [skill(name, { realPath: `/store/${name}` }), inProject(`${name}-alias`, { isLink: true, realPath: `/store/${name}`, targetCreatedMs: 0, hookProvided: true })] as const;
    const [idleA, idleAlias] = linked("idle");
    const [usedA, usedAlias] = linked("used");
    const judgement = judge({ skills: [idleA, idleAlias, usedA, usedAlias] }, { used: ["used"], watched: [idleA, idleAlias, usedA, usedAlias] });
    expect(verdicts(judgement)).toEqual([
      ["user:idle+project:idle-alias", "unknown"],
      ["user:used+project:used-alias", "unknown"],
    ]);
    expect(judgement.bundles.map((bundle) => bundle.excluded)).toEqual(["hook_provided", "hook_provided"]);
    expect(judgement.measurement.evidence).toMatchObject({ enabled: 2, judgeable: 0, structural: 2, used: 0, unused: 0 });
  });
  it("묶음 안의 위치는 입력의 차례와 상관없이 정해진다. 플러그인만 다르거나 경로만 다른 위치도 그렇다", () => {
    // 같은 원본을 두 마켓에서 깔면 이름, 범위, 실제 경로, 정체가 모두 같고 플러그인만 다르다
    const shared = (pluginId: string) => skill("p:s", { scope: "plugin", pluginId, path: "/plugins/shared/skills/s" });
    // 한 플러그인이 스킬을 찾는 폴더 둘에 같은 원본을 링크로 걸면 경로만 다르다
    const linked = (dir: string) => skill("q:t", { scope: "plugin", pluginId: "q@m", path: `/plugins/q/${dir}/t`, realPath: "/store/t", isLink: true, targetCreatedMs: 0 });
    const skills = [shared("p@b"), linked("skills"), shared("p@a"), linked("extra")];
    const order = (list: SkillFact[]) => judge({ skills: list, plugins: [plugin("p@a"), plugin("p@b"), plugin("q@m")] }).bundles.map((bundle) => bundle.positions.map((p) => `${p.pluginId} ${p.path}`));
    const expected = [
      ["p@a /plugins/shared/skills/s", "p@b /plugins/shared/skills/s"],
      ["q@m /plugins/q/extra/t", "q@m /plugins/q/skills/t"],
    ];
    expect(order(skills)).toEqual(expected);
    expect(order([...skills].reverse())).toEqual(expected);
  });
  it("이름, 범위, 실제 경로, 플러그인, 경로가 모두 같고 켜짐만 다른 위치 둘도 차례가 정해진다", () => {
    // 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 스캐너가 같은 설치를 두 길로 찾아 사실 둘을 낸다. 한쪽은 프로젝트의 설정만 봐서 꺼져 있다
    const twin = (enabled: boolean) => skill("r:u", { scope: "plugin", pluginId: "r@skills-dir", path: "/home/u/.claude/skills/r/skills/u", enabled, listed: enabled });
    const bundles = (list: SkillFact[]) => judge({ skills: list, plugins: [plugin("r@skills-dir")] }).bundles;
    const forward = bundles([twin(true), twin(false)]);
    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({ enabled: true });
    expect(forward[0]!.positions.map((p) => p.enabled).sort()).toEqual([false, true]);
    expect(JSON.stringify(bundles([twin(false), twin(true)]))).toBe(JSON.stringify(forward));
  });
  it("묶음의 켜짐은 위치 가운데 하나라도 켜져 있으면 켜진 것이다. 꺼 둔 묶음은 세지 않는다", () => {
    const skills = [skill("a", { realPath: "/store/a", enabled: false }), inProject("a", { isLink: true, realPath: "/store/a" }), skill("off", { enabled: false })];
    const judgement = judge({ skills });
    expect(judgement.bundles.map((bundle) => bundle.enabled)).toEqual([true, false]);
    expect(judgement.measurement.evidence).toMatchObject({ enabled: 1 });
  });
});

describe("E5 안 쓰는 스킬", () => {
  it("안 쓴 것이 확인된 스킬을 판정된 스킬로 나눈다. 쓰는지 모름은 분자와 분모에서 뺀다", () => {
    const used = many("used", 2);
    const idle = many("idle", 3);
    const fresh = many("fresh", 1);
    const judgement = judge({ skills: [...used, ...idle, ...fresh] }, { used: names(used), watched: [...used, ...idle] });
    expect(judgement.measurement).toEqual({ status: "scored", value: 0.6, evidence: { enabled: 6, judgeable: 6, judged: 5, structural: 0, unused: 3, used: 2 } });
    expect(judgement.bundles).toHaveLength(6);
  });
  it("꺼 둔 스킬은 안 쓴 것이 확인됐어도 세지 않는다", () => {
    const idle = many("idle", 5);
    const off = many("off", 4, { enabled: false });
    const judgement = judge({ skills: [...idle, ...off] }, { watched: [...idle, ...off] });
    expect(judgement.measurement).toMatchObject({ status: "scored", value: 1, evidence: { enabled: 5, unused: 5 } });
    expect(judgement.bundles.filter((bundle) => !bundle.enabled && bundle.verdict === "unused")).toHaveLength(4);
  });

  describe("못 재는 까닭의 차례", () => {
    const idle = many("idle", 6);
    const blank = { enabled: null, judgeable: null, judged: null, structural: null, unused: null, used: null };

    it("1. 스킬 사용을 기록하지 않는 도구는 unsupported다. 판정하지 않는다", () => {
      const judgement = judge({ skills: idle, claudeJson: "unparsable" }, { watched: idle, coverage: { ...CLAUDE_COVERAGE, skillUsage: "unsupported" } });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unsupported", evidence: blank });
      expect(judgement.bundles).toEqual([]);
    });
    it.each([
      ["~/.claude.json이 풀리지 않는다", { claudeJson: "unparsable" }],
      ["~/.claude.json을 열지 못한다", { claudeJson: "unreadable" }],
      ["~/.claude.json이 없다(도구의 집계를 모른다)", { claudeJson: "missing" }],
      ["사용자 스킬 폴더의 목록", { unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }],
      ["프로젝트의 스킬 폴더의 목록", { unreadableSkillPlaces: { user: false, projects: ["/work/app"], plugins: [] } }],
      ["플러그인의 설치 기록 파일", { pluginsFile: "unparsable" }],
      ["사용자 설정", { settings: { ...facts().settings, user: "unparsable" } }],
      ["관리 정책 파일", { settings: { ...facts().settings, managedParts: [{ path: "/etc/claude-code/managed-settings.d/10.json", status: "unreadable" }] } }],
      ["프로젝트 설정", { projects: [project("/work/app", { hasSettings: true, settingsStatus: "unparsable" })] }],
      ["로컬 설정", { projects: [project("/work/app", { hasLocalSettings: true, localSettingsStatus: "unreadable" })] }],
    ] as [string, Partial<ClaudeSetupFacts>][])("2. 읽지 못한 것이 있으면 unreadable이다. 안 쓴 것이 확인됨이 나오지 않는다: %s", (_name, setup) => {
      const judgement = judge({ skills: idle, ...setup }, { watched: idle, complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unreadable", evidence: blank });
      expect(judgement.bundles).toEqual([]);
    });
    it("프로젝트의 .mcp.json과 없는 파일은 E5와 상관없다", () => {
      const setup = { skills: idle, pluginsFile: "missing" as const, settings: { ...facts().settings, user: "missing" as const }, projects: [project("/work/app", { mcpJsonStatus: "unparsable" })] };
      expect(judge(setup, { watched: idle }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
    it("3. 켜져 있는 스킬이 하나도 없으면 not_applicable이다. 관측이 빠졌어도 같다", () => {
      const zero = { enabled: 0, judgeable: 0, judged: 0, structural: 0, unused: 0, used: 0 };
      expect(judge({}, { complete: false }).measurement).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: zero });
      expect(judge({ skills: many("off", 3, { enabled: false }) }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    });
    it("4. 켜져 있는 스킬은 있는데 판정할 수 있는 대상이 하나도 없으면 unsupported다", () => {
      const hooked = many("hooked", 3, { hookProvided: true });
      expect(judge({ skills: hooked }, { watched: hooked, complete: false }).measurement).toEqual({
        status: "unmeasured",
        reason: "unsupported",
        evidence: { enabled: 3, judgeable: 0, judged: 0, structural: 3, unused: 0, used: 0 },
      });
    });
    it("5. 관측이 빠짐없지 않으면 incomplete다. 쓴 것은 썼다로 남고 안 쓴 것이 확인됨은 나오지 않는다", () => {
      const judgement = judge({ skills: idle }, { used: ["idle1"], watched: idle, complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "incomplete", evidence: { enabled: 6, judgeable: 6, judged: 1, structural: 0, unused: 0, used: 1 } });
      expect(judgement.bundles.some((bundle) => bundle.verdict === "unused")).toBe(false);
    });
    it("6. 판정할 수 있는 대상이 5개에 못 미치면 too_little이다. 모두 판정돼도 분모가 모자란다. 판정은 그대로다", () => {
      const few = many("idle", 4);
      const hooked = many("hooked", 7, { hookProvided: true });
      const judgement = judge({ skills: [...few, ...hooked] }, { watched: few });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 11, judgeable: 4, judged: 4, structural: 7, unused: 4, used: 0 } });
      expect(judgement.bundles.filter((bundle) => bundle.verdict === "unused")).toHaveLength(4);
    });
    it("5와 6이 겹치면 5가 먼저다. 관측이 빠졌으면 판정할 수 있는 대상이 모자라도 incomplete다", () => {
      const few = many("idle", 4);
      expect(judge({ skills: few }, { watched: few, complete: false }).measurement).toEqual({ status: "unmeasured", reason: "incomplete", evidence: { enabled: 4, judgeable: 4, judged: 0, structural: 0, unused: 0, used: 0 } });
      expect(judge({ skills: few }, { watched: few }).measurement).toMatchObject({ status: "unmeasured", reason: "too_little" });
    });
    it("3과 4는 5보다 먼저다. 관측이 빠졌어도 켜져 있는 것이 없으면 not_applicable이고 판정할 수 있는 대상이 없으면 unsupported다", () => {
      expect(judge({ skills: many("off", 2, { enabled: false }) }, { complete: false }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
      expect(judge({ skills: many("hooked", 2, { hookProvided: true }) }, { complete: false }).measurement).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    });
    it("6과 7이 겹치면 6이 먼저다. 판정할 수 있는 대상이 모자라면 판정된 것이 절반에 못 미쳐도 too_little이다", () => {
      expect(judge({ skills: many("s", 4) }, { watched: many("s", 1) }).measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 4, judgeable: 4, judged: 1, structural: 0, unused: 1, used: 0 } });
    });
    it("7. 판정된 것이 판정할 수 있는 대상의 절반에 못 미치면 watching이다", () => {
      const judgement = judge({ skills: many("s", 11) }, { watched: many("s", 5) });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "watching", evidence: { enabled: 11, judgeable: 11, judged: 5, structural: 0, unused: 5, used: 0 } });
      expect(judge({ skills: many("s", 10) }, { watched: many("s", 5) }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
    it("7. 절반을 넘었어도 판정된 것이 5개에 못 미치면 watching이다", () => {
      expect(judge({ skills: many("s", 6) }, { watched: many("s", 4) }).measurement).toMatchObject({ status: "unmeasured", reason: "watching", evidence: { judgeable: 6, judged: 4 } });
    });
  });

  describe("구조상 판정할 수 없는 것", () => {
    const idle = many("idle", 5);
    it("훅이 내용을 넣어 주는 스킬은 판정할 수 있는 대상에서 뺀다. 쓴 신호가 있어도 썼다로 세지 않는다", () => {
      const hooked = [skill("hooked-idle", { hookProvided: true }), skill("hooked-used", { hookProvided: true })];
      const judgement = judge({ skills: [...idle, ...hooked] }, { used: ["hooked-used"], watched: [...idle, ...hooked] });
      expect(judgement.measurement).toEqual({ status: "scored", value: 1, evidence: { enabled: 7, judgeable: 5, judged: 5, structural: 2, unused: 5, used: 0 } });
      expect(judgement.bundles.find((bundle) => bundle.positions[0]!.name === "hooked-idle")).toMatchObject({ verdict: "unknown", excluded: "hook_provided" });
      expect(judgement.bundles.find((bundle) => bundle.positions[0]!.name === "hooked-used")).toMatchObject({ verdict: "unknown", excluded: "hook_provided" });
    });
    it("켜져 있는 스킬 스물 가운데 열일곱이 훅이 내용을 넣어 주는 스킬이면 판정할 수 있는 대상은 셋이라서 too_little이다. 그 가운데 쓴 것이 있어도 같다", () => {
      const few = many("idle", 3);
      const hooked = many("hooked", 17, { hookProvided: true });
      const judgement = judge({ skills: [...few, ...hooked] }, { used: names(hooked).slice(0, 9), watched: [...few, ...hooked] });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 20, judgeable: 3, judged: 3, structural: 17, unused: 3, used: 0 } });
    });
    it("스킬을 찾는 폴더의 목록을 읽지 못한 플러그인의 스킬은 읽힌 것도 세지 않고 잰다", () => {
      const partial = [skill("p:read", { scope: "plugin", pluginId: "p@m", path: "/plugins/p/skills/read" }), skill("p:used", { scope: "plugin", pluginId: "p@m", path: "/plugins/p/extra/used" })];
      const setup = { skills: [...idle, ...partial], plugins: [plugin("p@m")], unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } };
      const judgement = judge(setup, { used: ["p:used"], watched: [...idle, ...partial] });
      expect(judgement.measurement).toEqual({ status: "scored", value: 1, evidence: { enabled: 7, judgeable: 5, judged: 5, structural: 2, unused: 5, used: 0 } });
      expect(judgement.bundles.filter((bundle) => bundle.excluded === "plugin_unread").map((bundle) => bundle.verdict)).toEqual(["unknown", "unknown"]);
    });
    it("구성을 모르는 플러그인이나 훅을 읽지 못한 플러그인이 켜져 있어도 잰다", () => {
      const setup = { skills: idle, plugins: [plugin("unknown@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true }), plugin("nohooks@m", { hooksUnreadable: true })], pluginsWithoutInstall: ["ghost@m"] };
      expect(judge(setup, { watched: idle }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/installs-skills.test.ts`
Expected: FAIL. `../../src/core/installs/skills.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/installs/gate.ts`(새 파일):

```ts
// E5와 E6이 함께 쓰는 것. 켜져 있는 설치와 판정을 세어 못 재는 까닭의 차례 3~7을 보고 값을 낸다(순수 함수, 설계 11.3 「못 재는 까닭의 차례」)
import { scored, unmeasured, type Evidence, type Measurement } from "../measure.ts";
import type { Verdict } from "./verdict.ts";

/** 켜져 있는 설치(스킬 묶음이나 서버) 하나를 세는 데 쓰는 것 */
export interface Counted {
  verdict: Verdict;
  /** 구조상 판정할 수 없다. 지켜봐도 판정되지 않으므로 판정할 수 있는 대상에서 뺀다 */
  structural: boolean;
}

/** 근거 숫자. 켜져 있는 것, 판정할 수 있는 대상, 판정된 것, 구조상 판정할 수 없어 뺀 것, 안 쓴 것이 확인된 것, 쓴 것(설계 12.2) */
export const BLANK_INSTALL_EVIDENCE: Evidence = { enabled: null, judgeable: null, judged: null, structural: null, unused: null, used: null };

/**
 * 켜져 있는 설치들로 규칙을 잰다. 못 재는 까닭은 아래 차례로 보고 처음 맞는 것을 낸다(1과 2는 부르는 쪽이 먼저 본다).
 * 3 켜져 있는 설치가 없다. 4 판정할 수 있는 대상이 없다. 5 관측이 빠짐없지 않다. 6 판정할 수 있는 대상이 최소 개수에 못 미친다.
 * 7 판정된 것이 판정할 수 있는 대상의 절반에 못 미치거나 최소 개수에 못 미친다. 분모는 판정된 것의 수라서 no_data를 쓰지 않는다.
 */
export function measureInstalls(enabled: readonly Counted[], complete: boolean, minimum: number): Measurement {
  const structural = enabled.filter((item) => item.structural).length;
  const judgeable = enabled.length - structural;
  const used = enabled.filter((item) => !item.structural && item.verdict === "used").length;
  const unused = enabled.filter((item) => !item.structural && item.verdict === "unused").length;
  const judged = used + unused;
  const evidence = { enabled: enabled.length, judgeable, judged, structural, unused, used };
  if (enabled.length === 0) return unmeasured("not_applicable", evidence);
  if (judgeable === 0) return unmeasured("unsupported", evidence);
  if (!complete) return unmeasured("incomplete", evidence);
  // 6과 7을 가르는 것은 지켜보면 풀리는지다. 대상이 모자라면 모두 판정돼도 분모가 모자란다
  if (judgeable < minimum) return unmeasured("too_little", evidence);
  if (judged * 2 < judgeable || judged < minimum) return unmeasured("watching", evidence);
  return scored(unused / judged, evidence);
}
```

`src/core/installs/skills.ts`(새 파일):

```ts
// E5(안 쓰는 스킬)를 도구 하나에서 잰다. 위치마다 판정한 뒤 실제 경로가 같은 위치들을 스킬 묶음 하나로 합쳐 센다(순수 함수, 설계 10 「위치와 스킬 묶음」, 11.3 E5)
import type { SkillFact } from "../../scan/types.ts";
import { blank, unmeasured, type Measurement } from "../measure.ts";
import type { ToolSetup } from "../metrics/setup.ts";
import { byContent } from "../order.ts";
import { enablementUnread, unread } from "../readability.ts";
import { BLANK_INSTALL_EVIDENCE, measureInstalls } from "./gate.ts";
import { skillVerdict, type Verdict, type VerdictContext } from "./verdict.ts";

/** E5의 분모(판정된 스킬)와 판정할 수 있는 대상의 최소 개수 */
export const MIN_JUDGED_SKILLS = 5;

/** 스킬 하나. 한 도구 안에서 실제 경로가 같은 위치들이다 */
export interface SkillBundle {
  /** 이름, 범위(사용자, 프로젝트, 플러그인), 경로의 차례다 */
  positions: SkillFact[];
  /** 위치 가운데 하나라도 켜져 있다. E5는 켜져 있는 묶음만 센다 */
  enabled: boolean;
  /** 위치 가운데 하나라도 썼다면 썼다. 모든 위치가 안 쓴 것이 확인됨이면 확인됨이다. 그 밖은 쓰는지 모름이다. 구조상 판정할 수 없는 묶음은 늘 쓰는지 모름이다 */
  verdict: Verdict;
  /**
   * 구조상 판정할 수 없어 판정할 수 있는 대상에서 뺀 까닭. plugin_unread는 스킬을 찾는 폴더의 목록을 읽지 못한 플러그인의 스킬이고(읽힌 것도 세지 않는다),
   * hook_provided는 위치 가운데 하나라도 훅이 내용을 넣어 주는 스킬인 묶음이다(다른 위치에 쓴 신호가 있어도 뺀다. 같은 내용이 훅으로 실린다). 판정할 수 있으면 null이다
   */
  excluded: "plugin_unread" | "hook_provided" | null;
}

export interface SkillJudgement {
  measurement: Measurement;
  /** 판정한 묶음 모두(꺼 둔 것도 든다). 읽지 못했거나 스킬 사용을 기록하지 않는 도구에서는 판정하지 않아 비어 있다 */
  bundles: SkillBundle[];
}

const SCOPE_ORDER = { user: 0, project: 1, plugin: 2 } as const;
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/**
 * 위치의 차례. 이름, 범위, 실제 경로의 차례이고(설계 11.5) 그것이 같으면 정체, 플러그인, 경로, 내용까지 견줘 끝까지 정한다.
 * 같은 원본을 두 마켓에서 깐 플러그인의 스킬은 플러그인만 다르고, 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 켜짐만 다른 사실 둘이 온다.
 */
const byPosition = (a: SkillFact, b: SkillFact): number =>
  byText(a.name, b.name) ||
  SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
  byText(a.realPath ?? a.path, b.realPath ?? b.path) ||
  byText(a.installKey, b.installKey) ||
  byText(a.pluginId ?? "", b.pluginId ?? "") ||
  byText(a.path, b.path) ||
  byContent(a, b);

/** 설치를 찾는 곳, 설정 파일, 도구의 집계 가운데 읽지 못한 것이 있다. 집계가 든 파일은 없을 때도 모르는 것이다(설계 11.3 「설치를 찾는 곳을 읽지 못했을 때」) */
function skillsUnread(tool: ToolSetup): boolean {
  const { setup } = tool;
  const places = setup.unreadableSkillPlaces;
  return setup.claudeJson !== "ok" || places.user || places.projects.length > 0 || unread(setup.pluginsFile) || enablementUnread(setup);
}

export function judgeSkills(tool: ToolSetup, context: VerdictContext): SkillJudgement {
  const { setup } = tool;
  if (tool.coverage.skillUsage === "unsupported") return { measurement: unmeasured("unsupported", blank(BLANK_INSTALL_EVIDENCE)), bundles: [] };
  // 대상을 모르면 분모가 몇인지도 따질 수 없다. 판정하지 않으므로 안 쓴 것이 확인됨도 정비 후보도 나오지 않는다
  if (skillsUnread(tool)) return { measurement: unmeasured("unreadable", blank(BLANK_INSTALL_EVIDENCE)), bundles: [] };

  const uncounted = new Set(setup.unreadableSkillPlaces.plugins);
  const grouped = new Map<string, SkillFact[]>();
  for (const skill of [...setup.skills].sort(byPosition)) {
    // 실제 경로를 알 수 없는 위치는 다른 위치와 묶지 않는다
    const key = skill.realPath ?? `\u0000${skill.installKey}`;
    const positions = grouped.get(key);
    if (positions === undefined) grouped.set(key, [skill]);
    else positions.push(skill);
  }
  const bundles: SkillBundle[] = [];
  for (const positions of grouped.values()) {
    const fromUnreadPlugin = positions.some((skill) => skill.pluginId !== null && uncounted.has(skill.pluginId));
    const excluded = fromUnreadPlugin ? "plugin_unread" : positions.some((skill) => skill.hookProvided) ? "hook_provided" : null;
    const verdicts = positions.map((skill) => skillVerdict(skill, setup.claudeJson, context));
    const verdict: Verdict = excluded !== null ? "unknown" : verdicts.includes("used") ? "used" : verdicts.every((v) => v === "unused") ? "unused" : "unknown";
    bundles.push({ positions, enabled: positions.some((skill) => skill.enabled), verdict, excluded });
  }
  const counted = bundles.filter((bundle) => bundle.enabled).map((bundle) => ({ verdict: bundle.verdict, structural: bundle.excluded !== null }));
  return { measurement: measureInstalls(counted, context.complete, MIN_JUDGED_SKILLS), bundles };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 10개, 시험 238개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/installs-skills.test.ts src/core/installs/gate.ts src/core/installs/skills.ts
git commit -m "feat: 스킬 묶음 판정과 E5 규칙 추가"
```

---

### Task 16: E6(안 쓰는 MCP 서버)

**Files:**
- Create: `src/core/installs/same.ts`
- Create: `src/core/installs/servers.ts`
- Modify: `test/core/metrics-setup.test.ts`
- Modify: `src/core/metrics/setup.ts`
- Test: `test/core/installs-servers.test.ts`

**Interfaces:**
- Consumes: 과제 5의 `byContent`, 과제 9의 `ToolSetup`, `enablementUnread`, `unread`와 S5(`src/core/metrics/setup.ts`, `test/core/metrics-setup.test.ts`), 과제 12의 `McpFact.installKey`, 과제 14의 `serverVerdict`, 과제 15의 `measureInstalls`, `BLANK_INSTALL_EVIDENCE`, `Counted`.
- Produces: `JudgedServer { server: McpFact; verdict: Verdict; excluded: "no_definition" | "plugin_unread" | null }`, `ServerJudgement { measurement; servers }`, `judgeServers(tool: ToolSetup, context: VerdictContext): ServerJudgement`, `MIN_JUDGED_SERVERS = 2`(`src/core/installs/servers.ts`). `sameInstall<T>(items: readonly T[], keyOf: (item: T) => string | null): T[][]`(`src/core/installs/same.ts`).

E5와 같은 틀이다. 서버 하나가 설치 하나이고 설정 층을 합쳐 켜져 있는 서버만 센다. 분모와 판정할 수 있는 대상의 최소 개수는 2다(설계 11.3).

- **정체가 같은 사실은 설치 하나로 센다**(`sameInstall`). 스캐너의 서버 사실은 대개 설치 하나에 하나다. 그런데 같은 플러그인을 두 길로 찾으면(스킬 폴더에 둔 플러그인을 설치 기록에도 적었을 때) 정체 열쇠가 같은 서버 사실이 둘 온다. 사실마다 세면 서버 하나가 최소 개수 둘을 채워서, 못 재야 할 E6이 재진다. 그래서 켜져 있는 사실을 정체 열쇠로 묶어 설치마다 한 번 센다. 하나라도 켜져 있으면 켜진 설치다. 묶은 것의 판정은 스킬 묶음과 같이 합친다(하나라도 불렀으면 불렀다, 모두 확인됨이면 확인됨). 정체가 같아도 사실마다 판정이 갈릴 수 있어서다. 정체에는 플러그인의 설치 ID가 들고 기록에 남는 이름 꼴에는 매니페스트의 이름이 든다. 같은 설치 ID의 플러그인을 두 경로에서 찾았는데 매니페스트의 이름이 서로 다르면, 한쪽 이름으로 부른 기록은 한쪽 사실만 "불렀다"로 만든다. 정체가 없는 서버(정의를 읽지 못했다)는 같은 설치인지 견줄 수 없으므로 사실마다 하나다. 판정 목록(`servers`)은 사실마다 그대로 낸다.
- **S5도 같이 고친다.** 과제 9의 S5가 세는 켜져 있는 서버의 수(`enabledServers`)도 설치 단위다. `setup.ts`가 `sameInstall`로 세게 바꾼다.
- **읽지 못한 것(차례 2).** `~/.claude.json`이 풀리지 않거나 열 수 없다(없으면 그 파일의 서버가 없는 것이라 잰다), 사용자 스킬 폴더나 프로젝트의 스킬 폴더의 목록(그 폴더에 둔 플러그인이 넣은 서버를 모른다), 프로젝트의 `.mcp.json`, 플러그인의 설치 기록 파일, 사용자 설정과 관리 정책 파일, 프로젝트 설정과 로컬 설정이다.
- **구조상 판정할 수 없는 것.** 정의를 읽지 못해 정체가 없는 서버(`no_definition`. claude.ai에 연결한 서버가 든다)와, MCP 정의를 읽지 못했거나 구성을 모르는 플러그인이 넣은 서버(`plugin_unread`)다. 뒤의 것은 읽힌 것도, 부른 기록이 있어도 세지 않는다. 같은 이름의 서버는 나중에 선언된 것이 통째로 대신하므로 읽지 못한 선언이 읽힌 서버를 덮었을 수 있다.
- 켜져 있는 서버가 claude.ai에 연결한 서버뿐이면 차례 4의 `unsupported`다. 서버를 하나만 깔고 부르지 않으면 `too_little`이다. 첫 점검에서는 부른 기록이 없는 서버가 모두 쓰는지 모름이라 대개 `watching`이다.
- 서버는 이름, 범위(사용자, 로컬, 프로젝트, 플러그인, claude.ai), 프로젝트, 플러그인, 정의의 지문의 차례로 낸다. 그것이 모두 같으면 내용을 통째로 견준다(과제 5의 `byContent`). 같은 플러그인을 스캐너가 두 길로 찾으면 그 플러그인의 서버도 켜짐만 다른 사실이 둘이다. 꺼 둔 서버도 판정해서 낸다. 과제 17의 서버 막기가 같은 이름의 서버를 볼 때 쓴다.
- 까닭이 겹칠 때의 시험을 과제 15와 같이 둔다. 최소 개수가 2라서 입력이 다르다. 3과 5(꺼 둔 서버뿐인데 관측이 빠졌다), 4와 5(claude.ai 연결뿐인데 관측이 빠졌다), 5와 6(관측이 빠졌고 서버가 하나다), 6과 7(서버가 하나이고 첫 점검이다)이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/installs-servers.test.ts`(새 파일):

```ts
// E6(안 쓰는 MCP 서버)을 시험한다. 켜진 서버만 세기, 정의를 읽지 못하는 서버, 읽지 못했을 때, 못 재는 까닭의 차례(설계 11.3 E6, 11.4, 21.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
import { sessionListings } from "../../src/core/installs/listing.ts";
import { judgeServers } from "../../src/core/installs/servers.ts";
import { calledMcpNames } from "../../src/core/installs/signals.ts";
import { recordMap, type VerdictContext } from "../../src/core/installs/verdict.ts";
import type { ToolSetup } from "../../src/core/metrics/setup.ts";
import { projectLookup } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, McpFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts, mcpServer, plugin, project } from "../helpers/facts.ts";
import { summary } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const lookup = projectLookup([], {});

interface Options {
  /** 점수 구간에 부른 기록이 있는 이름(호출한 도구 이름의 서버 자리) */
  called?: string[];
  /** 같은 정의로 14일 넘게 지켜본 서버. null이면 첫 점검이다 */
  watched?: McpFact[] | null;
  complete?: boolean;
  coverage?: ToolCoverage;
}
const judge = (setup: Partial<ClaudeSetupFacts>, options: Options = {}) => {
  const summaries = [summary({ days: { "2026-11-10": { responses: 1, mcpCalls: Object.fromEntries((options.called ?? []).map((name) => [name, 1])) } } })];
  const records: InstallRecord[] | null = options.watched === null ? null : (options.watched ?? []).flatMap((fact) => (fact.installKey === null ? [] : [{ key: fact.installKey, firstSeen: "2026-09-01", appeared: false }]));
  const context: VerdictContext = {
    day: { today: windows.today, timeZone: "Asia/Seoul" },
    windows,
    records: recordMap(records),
    used: calledMcpNames(summaries, windows),
    listings: sessionListings(summaries, "mcp", {}, lookup),
    complete: options.complete ?? true,
  };
  const tool: ToolSetup = { tool: "claude-code", totals: toolTotals(summaries, windows, []), coverage: options.coverage ?? CLAUDE_COVERAGE, setup: facts(setup), highestVersion: "2.1.300" };
  return judgeServers(tool, context);
};
const many = (prefix: string, count: number, input: Partial<McpFact> = {}): McpFact[] => Array.from({ length: count }, (_, i) => mcpServer(`${prefix}${i + 1}`, input));
const remote = (name: string) => mcpServer(name, { scope: "claude-ai", definitionHash: null });

describe("E6 안 쓰는 MCP 서버", () => {
  it("안 부른 것이 확인된 서버를 판정된 서버로 나눈다. 쓰는지 모름은 분자와 분모에서 뺀다", () => {
    const called = many("called", 1);
    const idle = many("idle", 2);
    const fresh = many("fresh", 1);
    const judgement = judge({ mcpServers: [...called, ...idle, ...fresh] }, { called: ["called1"], watched: [...called, ...idle] });
    expect(judgement.measurement).toEqual({ status: "scored", value: 2 / 3, evidence: { enabled: 4, judgeable: 4, judged: 3, structural: 0, unused: 2, used: 1 } });
    expect(judgement.servers.map((s) => [s.server.name, s.verdict])).toEqual([["called1", "used"], ["fresh1", "unknown"], ["idle1", "unused"], ["idle2", "unused"]]);
  });
  it("설정 층을 합쳐 켜져 있는 서버만 센다. 막아 둔 서버는 안 불렀어도 세지 않는다", () => {
    const idle = many("idle", 2);
    const blocked = many("blocked", 3, { enabled: false });
    const judgement = judge({ mcpServers: [...idle, ...blocked] }, { watched: [...idle, ...blocked] });
    expect(judgement.measurement).toMatchObject({ status: "scored", value: 1, evidence: { enabled: 2, unused: 2 } });
    expect(judgement.servers).toHaveLength(5);
  });
  it("플러그인이 넣은 서버는 그 서버의 이름 꼴로 부른 기록을 잇는다. 같은 이름의 사용자 범위 서버와 가려진다", () => {
    const fromPlugin = mcpServer("db", { scope: "plugin", pluginId: "p@m", recordNames: ["plugin:p:db", "plugin_p_db"] });
    const own = mcpServer("db");
    const judgement = judge({ mcpServers: [own, fromPlugin], plugins: [plugin("p@m", { components: ["mcpServers"] })] }, { called: ["plugin_p_db"], watched: [own, fromPlugin] });
    expect(judgement.servers.map((s) => [s.server.scope, s.verdict])).toEqual([["user", "unused"], ["plugin", "used"]]);
    expect(judgement.measurement).toMatchObject({ status: "scored", value: 0.5 });
  });

  it("이름, 범위, 플러그인, 정의가 모두 같고 켜짐만 다른 서버 둘도 차례가 정해진다", () => {
    // 같은 플러그인을 스캐너가 두 길로 찾으면 그 플러그인의 서버도 사실이 둘이다
    const twin = (enabled: boolean) => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", recordNames: ["plugin:r:db", "plugin_r_db"], enabled });
    const judged = (list: McpFact[]) => judge({ mcpServers: list, plugins: [plugin("r@skills-dir", { components: ["mcpServers"] })] }).servers;
    const forward = judged([twin(true), twin(false)]);
    expect(forward.map((item) => item.server.enabled).sort()).toEqual([false, true]);
    expect(JSON.stringify(judged([twin(false), twin(true)]))).toBe(JSON.stringify(forward));
  });

  it("정체가 같은 서버 사실 둘은 설치 하나로 센다. 서버 하나가 최소 개수 둘을 채우지 않는다", () => {
    // 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 스캐너가 그 플러그인을 두 길로 찾아, 정체가 같은 서버 사실 둘을 낸다
    const twin = (enabled: boolean) => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", recordNames: ["plugin:r:db", "plugin_r_db"], enabled });
    const plugins = [plugin("r@skills-dir", { components: ["mcpServers"] })];
    const both = judge({ mcpServers: [twin(true), twin(true)], plugins }, { called: ["plugin_r_db"] });
    expect(both.servers).toHaveLength(2);
    expect(both.measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 1, judgeable: 1, judged: 1, structural: 0, unused: 0, used: 1 } });
    // 한쪽만 켜져 있어도 켜진 설치 하나다. 둘 다 꺼져 있으면 세지 않는다
    expect(judge({ mcpServers: [twin(true), twin(false)], plugins }).measurement.evidence).toMatchObject({ enabled: 1, judgeable: 1 });
    expect(judge({ mcpServers: [twin(false), twin(false)], plugins }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    // 정체가 다른 서버가 하나 더 있으면 설치는 둘이다
    const other = mcpServer("mail");
    expect(judge({ mcpServers: [twin(true), twin(true), other], plugins }, { called: ["plugin_r_db", "mail"] }).measurement).toMatchObject({ status: "scored", value: 0, evidence: { enabled: 2, judged: 2, used: 2 } });
  });
  it("정체가 같아도 기록에 남는 이름 꼴이 다르면 사실마다 판정이 갈린다. 하나라도 불렀으면 그 설치는 부른 것이다", () => {
    // 같은 설치 ID의 플러그인을 두 경로에서 찾았는데 매니페스트의 이름이 서로 다르다. 서버의 이름과 정의가 같아 정체는 같고, 이름 꼴에는 매니페스트의 이름이 들어가서 다르다
    const under = (pluginName: string) => mcpServer("db", { scope: "plugin", pluginId: "r@m", recordNames: [`plugin:${pluginName}:db`, `plugin_${pluginName}_db`] });
    const alpha = under("alpha");
    const beta = under("beta");
    expect(alpha.installKey).toBe(beta.installKey);
    const judged = judge({ mcpServers: [alpha, beta, mcpServer("mail")], plugins: [plugin("r@m", { components: ["mcpServers"] })] }, { called: ["plugin_alpha_db", "mail"] });
    expect(judged.servers.filter((item) => item.server.name === "db").map((item) => item.verdict).sort()).toEqual(["unknown", "used"]);
    expect(judged.measurement).toEqual({ status: "scored", value: 0, evidence: { enabled: 2, judgeable: 2, judged: 2, structural: 0, unused: 0, used: 2 } });
  });
  it("정체가 없는 서버는 같은 설치인지 견줄 수 없으므로 사실마다 하나로 센다", () => {
    expect(judge({ mcpServers: [remote("claude.ai Mail"), remote("claude.ai Mail")] }).measurement.evidence).toMatchObject({ enabled: 2, judgeable: 0, structural: 2 });
  });

  describe("못 재는 까닭의 차례", () => {
    const idle = many("idle", 3);
    const blank = { enabled: null, judgeable: null, judged: null, structural: null, unused: null, used: null };

    it("1. MCP 호출을 기록하지 않는 형식은 unsupported다. 판정하지 않는다", () => {
      const judgement = judge({ mcpServers: idle, claudeJson: "unparsable" }, { watched: idle, coverage: { ...CLAUDE_COVERAGE, mcpCalls: "unsupported" } });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unsupported", evidence: blank });
      expect(judgement.servers).toEqual([]);
    });
    it.each([
      ["~/.claude.json이 풀리지 않는다", { claudeJson: "unparsable" }],
      ["~/.claude.json을 열지 못한다", { claudeJson: "unreadable" }],
      ["사용자 스킬 폴더의 목록(그 폴더에 둔 플러그인이 넣은 서버를 모른다)", { unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }],
      ["프로젝트의 스킬 폴더의 목록", { unreadableSkillPlaces: { user: false, projects: ["/work/app"], plugins: [] } }],
      ["프로젝트의 .mcp.json", { projects: [project("/work/app", { mcpJsonStatus: "unparsable" })] }],
      ["플러그인의 설치 기록 파일", { pluginsFile: "unreadable" }],
      ["사용자 설정", { settings: { ...facts().settings, user: "unreadable" } }],
      ["관리 정책 파일", { settings: { ...facts().settings, managedParts: [{ path: "/etc/claude-code/managed-settings.json", status: "unparsable" }] } }],
      ["프로젝트 설정", { projects: [project("/work/app", { hasSettings: true, settingsStatus: "unreadable" })] }],
      ["로컬 설정", { projects: [project("/work/app", { hasLocalSettings: true, localSettingsStatus: "unparsable" })] }],
    ] as [string, Partial<ClaudeSetupFacts>][])("2. 읽지 못한 것이 있으면 unreadable이다. 안 부른 것이 확인됨이 나오지 않는다: %s", (_name, setup) => {
      const judgement = judge({ mcpServers: idle, ...setup }, { watched: idle, complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unreadable", evidence: blank });
      expect(judgement.servers).toEqual([]);
    });
    it("~/.claude.json이 없으면 그 파일의 서버가 없는 것이므로 잰다. 플러그인의 스킬을 찾는 폴더도 상관없다", () => {
      const setup = { mcpServers: idle, claudeJson: "missing" as const, unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } };
      expect(judge(setup, { watched: idle }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
    it("3. 켜져 있는 서버가 하나도 없으면 not_applicable이다", () => {
      const zero = { enabled: 0, judgeable: 0, judged: 0, structural: 0, unused: 0, used: 0 };
      expect(judge({}, { complete: false }).measurement).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: zero });
      expect(judge({ mcpServers: many("blocked", 2, { enabled: false }) }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    });
    it("4. 켜져 있는 서버가 모두 정의를 읽지 못하는 것이면 unsupported다", () => {
      const judgement = judge({ mcpServers: [remote("claude.ai Mail"), remote("claude.ai Drive")] }, { called: ["claude.ai Mail"], complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "unsupported", evidence: { enabled: 2, judgeable: 0, judged: 0, structural: 2, unused: 0, used: 0 } });
      expect(judgement.servers.map((s) => [s.verdict, s.excluded])).toEqual([["unknown", "no_definition"], ["unknown", "no_definition"]]);
    });
    it("5. 관측이 빠짐없지 않으면 incomplete다", () => {
      const judgement = judge({ mcpServers: idle }, { called: ["idle1"], watched: idle, complete: false });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "incomplete", evidence: { enabled: 3, judgeable: 3, judged: 1, structural: 0, unused: 0, used: 1 } });
    });
    it("5와 6이 겹치면 5가 먼저다. 관측이 빠졌으면 서버가 하나뿐이어도 incomplete다", () => {
      const one = many("idle", 1);
      expect(judge({ mcpServers: one }, { watched: one, complete: false }).measurement).toEqual({ status: "unmeasured", reason: "incomplete", evidence: { enabled: 1, judgeable: 1, judged: 0, structural: 0, unused: 0, used: 0 } });
      expect(judge({ mcpServers: one }, { watched: one }).measurement).toMatchObject({ status: "unmeasured", reason: "too_little" });
    });
    it("3과 4는 5보다 먼저다. 관측이 빠졌어도 켜져 있는 서버가 없으면 not_applicable이고 판정할 수 있는 대상이 없으면 unsupported다", () => {
      expect(judge({ mcpServers: many("off", 2, { enabled: false }) }, { complete: false }).measurement).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
      expect(judge({ mcpServers: [remote("claude.ai Mail")] }, { complete: false }).measurement).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    });
    it("6과 7이 겹치면 6이 먼저다. 서버가 하나뿐이면 첫 점검이어도 too_little이다", () => {
      expect(judge({ mcpServers: many("idle", 1) }, { watched: null }).measurement).toMatchObject({ status: "unmeasured", reason: "too_little", evidence: { judgeable: 1, judged: 0 } });
    });
    it("6. 서버를 하나만 깔고 부르지 않으면 too_little이다. 지켜봐도 분모가 차지 않는다. 판정은 그대로다", () => {
      const one = many("only", 1);
      const judgement = judge({ mcpServers: [...one, remote("claude.ai Mail")] }, { watched: one });
      expect(judgement.measurement).toEqual({ status: "unmeasured", reason: "too_little", evidence: { enabled: 2, judgeable: 1, judged: 1, structural: 1, unused: 1, used: 0 } });
      expect(judgement.servers.find((s) => s.server.name === "only1")).toMatchObject({ verdict: "unused", excluded: null });
    });
    it("7. 첫 점검에서는 부른 기록이 없는 서버가 모두 쓰는지 모름이라 watching이다", () => {
      expect(judge({ mcpServers: idle }, { watched: null }).measurement).toEqual({ status: "unmeasured", reason: "watching", evidence: { enabled: 3, judgeable: 3, judged: 0, structural: 0, unused: 0, used: 0 } });
    });
    it("7. 판정된 것이 절반에 못 미치거나 2개에 못 미치면 watching이고, 절반이고 2개면 잰다", () => {
      expect(judge({ mcpServers: many("s", 5) }, { watched: many("s", 2) }).measurement).toMatchObject({ status: "unmeasured", reason: "watching" });
      expect(judge({ mcpServers: many("s", 2) }, { watched: many("s", 1) }).measurement).toMatchObject({ status: "unmeasured", reason: "watching", evidence: { judgeable: 2, judged: 1 } });
      expect(judge({ mcpServers: many("s", 4) }, { watched: many("s", 2) }).measurement).toMatchObject({ status: "scored", value: 1 });
    });
  });

  describe("구조상 판정할 수 없는 것", () => {
    const idle = many("idle", 2);
    it("정의를 읽지 못하는 서버는 부른 기록이 있어도 세지 않는다", () => {
      const partial = mcpServer("partial", { definitionHash: null });
      const judgement = judge({ mcpServers: [...idle, partial, remote("claude.ai Mail")] }, { called: ["partial", "claude.ai Mail"], watched: idle });
      expect(judgement.measurement).toEqual({ status: "scored", value: 1, evidence: { enabled: 4, judgeable: 2, judged: 2, structural: 2, unused: 2, used: 0 } });
    });
    it("MCP 정의를 읽지 못한 플러그인이 넣은 서버는 읽힌 것도 늘 쓰는지 모름이다. 구성을 모르는 플러그인도 같다", () => {
      const half = mcpServer("half", { scope: "plugin", pluginId: "half@m", recordNames: ["plugin:half:half", "plugin_half_half"] });
      const other = mcpServer("fine", { scope: "plugin", pluginId: "fine@m", recordNames: ["plugin:fine:fine", "plugin_fine_fine"] });
      const setup = {
        mcpServers: [...idle, half, other],
        plugins: [plugin("half@m", { components: ["mcpServers"], mcpUnreadable: true }), plugin("fine@m", { components: ["mcpServers"] }), plugin("unknown@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })],
        pluginsWithoutInstall: ["ghost@m"],
      };
      const judgement = judge(setup, { called: ["plugin_half_half", "plugin_fine_fine"], watched: [...idle, half, other] });
      expect(judgement.measurement).toEqual({ status: "scored", value: 2 / 3, evidence: { enabled: 4, judgeable: 3, judged: 3, structural: 1, unused: 2, used: 1 } });
      expect(judgement.servers.find((s) => s.server.name === "half")).toMatchObject({ verdict: "unknown", excluded: "plugin_unread" });
    });
    it("꺼져 있는 플러그인의 서버는 처음부터 대상이 아니다", () => {
      const off = mcpServer("off", { scope: "plugin", pluginId: "off@m", enabled: false });
      const judgement = judge({ mcpServers: [...idle, off], plugins: [plugin("off@m", { enabled: false, mcpUnreadable: true })] }, { watched: idle });
      expect(judgement.measurement).toMatchObject({ status: "scored", evidence: { enabled: 2, structural: 0 } });
    });
  });
});
```

`test/core/metrics-setup.test.ts`(찾을 곳):

```ts
  });
  it("범위를 가리지 않고 켜져 있는 서버를 모두 본다. 정의가 PC에 없는 연결도 서버다", () => {
```

`test/core/metrics-setup.test.ts`(바꾼 뒤):

```ts
  });
  it("정체가 같은 서버 사실 둘은 켜진 서버 하나로 센다", () => {
    // 스캐너가 같은 플러그인을 두 길로 찾으면 그 서버의 사실이 둘 온다
    const twin = (enabled: boolean) => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", enabled });
    expect(s5({ mcpServers: [twin(true), twin(true)] })).toMatchObject({ status: "scored", evidence: { enabledServers: 1 } });
    expect(s5({ mcpServers: [twin(true), twin(false), mcpServer("mail")] })).toMatchObject({ status: "scored", evidence: { enabledServers: 2 } });
    // 정체가 없는 서버는 견줄 수 없으므로 사실마다 센다
    const remote = () => mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null });
    expect(s5({ mcpServers: [remote(), remote()] })).toMatchObject({ status: "scored", evidence: { enabledServers: 2 } });
  });
  it("범위를 가리지 않고 켜져 있는 서버를 모두 본다. 정의가 PC에 없는 연결도 서버다", () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/installs-servers.test.ts test/core/metrics-setup.test.ts`
Expected: FAIL. `../../src/core/installs/servers.ts`를 찾지 못한다. S5의 시험 하나도 실패한다. 정체가 같은 서버 사실 둘을 켜진 서버 둘로 센다(하나여야 한다).

- [ ] **Step 3: 구현한다**

`src/core/installs/same.ts`(새 파일):

```ts
// 정체가 같은 설치의 사실을 하나로 묶는다. 스캐너가 같은 플러그인을 두 길로 찾으면 그 플러그인이 넣은 서버의 사실이 둘 온다. 설치는 하나다(순수 함수, 설계 11.3 「설치의 정체」)

/**
 * 정체 열쇠가 같은 것끼리 묶는다. 묶음과 그 안의 차례는 받은 차례 그대로다.
 * 열쇠가 null이면(정체를 만들 수 없다) 같은 설치인지 견줄 수 없으므로 그것만으로 한 묶음이다.
 */
export function sameInstall<T>(items: readonly T[], keyOf: (item: T) => string | null): T[][] {
  const byKey = new Map<string, T[]>();
  const groups: T[][] = [];
  for (const item of items) {
    const key = keyOf(item);
    const group = key === null ? undefined : byKey.get(key);
    if (group !== undefined) {
      group.push(item);
      continue;
    }
    const fresh = [item];
    groups.push(fresh);
    if (key !== null) byKey.set(key, fresh);
  }
  return groups;
}
```

`src/core/installs/servers.ts`(새 파일):

```ts
// E6(안 쓰는 MCP 서버)을 도구 하나에서 잰다. 서버 하나가 설치 하나이고, 설정 층을 합쳐 켜져 있는 서버만 센다(순수 함수, 설계 11.3 E6)
import type { McpFact } from "../../scan/types.ts";
import { blank, unmeasured, type Measurement } from "../measure.ts";
import type { ToolSetup } from "../metrics/setup.ts";
import { byContent } from "../order.ts";
import { enablementUnread, unread } from "../readability.ts";
import { BLANK_INSTALL_EVIDENCE, measureInstalls, type Counted } from "./gate.ts";
import { sameInstall } from "./same.ts";
import { serverVerdict, type Verdict, type VerdictContext } from "./verdict.ts";

/** E6의 분모(판정된 서버)와 판정할 수 있는 대상의 최소 개수 */
export const MIN_JUDGED_SERVERS = 2;

export interface JudgedServer {
  server: McpFact;
  verdict: Verdict;
  /**
   * 구조상 판정할 수 없어 판정할 수 있는 대상에서 뺀 까닭. no_definition은 정의를 읽지 못해 같은 설치인지 견줄 수 없는 서버이고(claude.ai에 연결한 서버가 든다),
   * plugin_unread는 MCP 정의를 읽지 못했거나 구성을 모르는 플러그인이 넣은 서버다(읽힌 것도 세지 않는다). 판정할 수 있으면 null이다
   */
  excluded: "no_definition" | "plugin_unread" | null;
}

export interface ServerJudgement {
  measurement: Measurement;
  /** 판정한 서버 모두(꺼 둔 것도 든다). 읽지 못했거나 MCP 호출을 기록하지 않는 형식에서는 판정하지 않아 비어 있다 */
  servers: JudgedServer[];
}

const SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 } as const;
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byServer = (a: McpFact, b: McpFact): number =>
  byText(a.name, b.name) ||
  SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
  byText(a.projectRoot ?? "", b.projectRoot ?? "") ||
  byText(a.pluginId ?? "", b.pluginId ?? "") ||
  byText(a.definitionHash ?? "", b.definitionHash ?? "") ||
  // 같은 플러그인을 두 길로 찾으면 켜짐만 다른 서버 사실 둘이 온다. 내용까지 견줘 차례를 끝까지 정한다
  byContent(a, b);

/**
 * 서버를 찾는 곳이나 설정 파일 가운데 읽지 못한 것이 있다. ~/.claude.json은 없으면 그 파일의 서버가 없는 것이라 읽지 못한 것이 아니다.
 * 사용자와 프로젝트의 스킬 폴더는 그 폴더에 둔 플러그인이 넣은 서버를 모르게 한다(설계 11.3 「설치를 찾는 곳을 읽지 못했을 때」).
 */
function serversUnread(tool: ToolSetup): boolean {
  const { setup } = tool;
  const places = setup.unreadableSkillPlaces;
  return unread(setup.claudeJson) || places.user || places.projects.length > 0 || setup.projects.some((project) => unread(project.mcpJsonStatus)) || unread(setup.pluginsFile) || enablementUnread(setup);
}

export function judgeServers(tool: ToolSetup, context: VerdictContext): ServerJudgement {
  const { setup } = tool;
  if (tool.coverage.mcpCalls === "unsupported") return { measurement: unmeasured("unsupported", blank(BLANK_INSTALL_EVIDENCE)), servers: [] };
  if (serversUnread(tool)) return { measurement: unmeasured("unreadable", blank(BLANK_INSTALL_EVIDENCE)), servers: [] };

  // 같은 이름의 서버는 나중에 선언된 것이 통째로 대신하므로, 읽지 못한 선언이 읽힌 서버를 덮었을 수 있다
  const unreadPlugins = new Set(setup.plugins.filter((plugin) => !plugin.compositionKnown || plugin.mcpUnreadable).map((plugin) => plugin.id));
  const servers = [...setup.mcpServers].sort(byServer).map((server): JudgedServer => {
    if (server.installKey === null) return { server, verdict: "unknown", excluded: "no_definition" };
    if (server.pluginId !== null && unreadPlugins.has(server.pluginId)) return { server, verdict: "unknown", excluded: "plugin_unread" };
    return { server, verdict: serverVerdict(server, context), excluded: null };
  });
  // 정체가 같은 사실은 설치 하나다. 켜져 있는 사실만 모아 설치마다 한 번 센다. 하나라도 켜져 있으면 켜진 설치다.
  // 스캐너가 같은 플러그인을 두 길로 찾으면 그 서버의 사실이 둘 오는데, 사실마다 세면 서버 하나가 최소 개수 둘을 채운다
  const installs = sameInstall(servers.filter((judged) => judged.server.enabled), (judged) => judged.server.installKey);
  const counted = installs.map((facts): Counted => ({
    verdict: facts.some((judged) => judged.verdict === "used") ? "used" : facts.every((judged) => judged.verdict === "unused") ? "unused" : "unknown",
    structural: facts.some((judged) => judged.excluded !== null),
  }));
  return { measurement: measureInstalls(counted, context.complete, MIN_JUDGED_SERVERS), servers };
}
```

`src/core/metrics/setup.ts`(찾을 곳 1/2):

```ts
import { blank, countGate, scored, unmeasured, type Measurement } from "../measure.ts";
import { enablementUnread, globalSettingsUnread, mcpPlacesUnread, projectSettingsUnread } from "../readability.ts";
```

`src/core/metrics/setup.ts`(바꾼 뒤 1/2):

```ts
import { blank, countGate, scored, unmeasured, type Measurement } from "../measure.ts";
import { sameInstall } from "../installs/same.ts";
import { enablementUnread, globalSettingsUnread, mcpPlacesUnread, projectSettingsUnread } from "../readability.ts";
```

`src/core/metrics/setup.ts`(찾을 곳 2/2):

```ts
  const { setup, totals } = tool;
  const enabledServers = setup.mcpServers.filter((server) => server.enabled).length;
  const failedSessions = totals.mainSessions.filter((session) => session.mcpConnectionFailure).length;
```

`src/core/metrics/setup.ts`(바꾼 뒤 2/2):

```ts
  const { setup, totals } = tool;
  // 정체가 같은 서버 사실은 설치 하나로 센다(E6과 같다)
  const enabledServers = sameInstall(setup.mcpServers.filter((server) => server.enabled), (server) => server.installKey).length;
  const failedSessions = totals.mainSessions.filter((session) => session.mcpConnectionFailure).length;
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 11개, 시험 270개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/installs-servers.test.ts test/core/metrics-setup.test.ts src/core/installs/same.ts src/core/installs/servers.ts src/core/metrics/setup.ts
git commit -m "feat: MCP 서버 판정과 E6 규칙 추가"
```

---

### Task 17: 정비 후보(A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기)

**Files:**
- Create: `src/core/installs/candidates.ts`
- Test: `test/core/installs-candidates.test.ts`

**Interfaces:**
- Consumes: 과제 9의 `ToolSetup`, 과제 13의 `EvalDay`, `msOlderThan`, `RECENT_USE_DAYS`, 과제 15의 `SkillJudgement`, `SkillBundle`, 과제 16의 `ServerJudgement`. 과제 2의 `PluginFact.usageUndated`, 과제 10의 `unreadableSkillPlaces`.
- Produces: `SelfIdentity { skillNames; pluginNames; skillRealPaths }`, `NO_SELF`, `Candidate { id: string; unit: "A1" | "A2" | "A3"; rule: "E5" | "E6"; tool: ToolId; target: string }`, `candidatesOf(tool: ToolSetup, skills: SkillJudgement, servers: ServerJudgement, day: EvalDay, self: SelfIdentity): Candidate[]`(`src/core/installs/candidates.ts`). ID는 `<단위>:<도구>:<바꾸는 열쇠>`다.

정비 후보의 유무와 목록만 낸다. 설정을 바꾸는 일은 6단계다(설계 16). 후보는 "안 쓴 것이 확인됨"에서만 나오고, 끄자는 제안은 판정만으로 내지 않고 꺼도 되는지를 따로 본다(설계 16.2).

**A1 스킬 끄기.** 사용자 설정의 `skillOverrides`에서 그 이름을 끄는 후보다. 이름으로 듣는 설정이라 같은 이름의 다른 스킬도 같이 꺼진다.

- 켜져 있는 묶음이 확인됨이고 그 묶음에 켜져 있는 사용자 범위의 위치가 있으면 그 위치의 이름(폴더 이름)으로 낸다.
- **같이 꺼지는 스킬.** 그 이름을 이름 꼴(`recordNames`. 폴더 이름과 머리말 이름)로 가진 위치가 든 묶음 모두다. 후보를 낸 묶음도 여기에 든다. 스캐너가 스킬의 켜짐을 정할 때 설정의 열쇠를 이 이름 꼴로 찾으므로(1부의 `overrideIn`), 폴더 이름이 달라도 머리말 이름이 그 이름인 스킬은 같이 꺼진다. 폴더 이름만 견주면 그런 스킬을 놓친다.
- 같이 꺼지는 묶음은 켜져 있든 아니든 모두 확인됨이어야 한다. 하나라도 썼거나 쓰는지 모르면 내지 않는다.
- 같이 꺼지는 묶음 가운데 이 도구 자신이 하나라도 있으면 내지 않는다. 이 도구 자신은 최근에 쓴 신호가 없어도 끄자고 하지 않는다(설계 16.2).
- 이 설정은 플러그인 스킬에는 듣지 않는다고 공식 문서에 있다. 실제로 본 것은 아니어서(설계 27) 범위를 가리지 않고 이름 꼴이 같으면 같이 꺼지는 것으로 본다. 엄한 쪽이다. 플러그인 스킬의 이름 꼴은 `<플러그인>:<스킬>`이라 겹치는 일은 드물다.
- 훅을 볼 수 없는 켜진 플러그인(구성을 모른다, 훅 정의를 읽지 못했다, 설정에 켜 두었는데 설치 기록에 없다)이 하나라도 있으면 A1과 A2를 내지 않는다. 그 훅이 어느 스킬의 경로를 가리키는지 모른다. E5의 판정과 값은 그대로다.

**A2 플러그인 끄기.** 사용자 설정의 `enabledPlugins`에서 설치 ID를 끄는 후보다. 아래를 모두 채워야 한다.

| 조건 | 판정 |
|---|---|
| ① 스킬이 하나 이상이고 모두 확인됨이다 | 그 플러그인의 스킬이 든 묶음으로 센다 |
| ② 스킬 말고는 아무것도 들어 있지 않다 | `components`가 `skills`뿐이다 |
| ③ 알아보지 못한 구성 요소가 없다 | `unknownEntries`가 비어 있다 |
| ④ 도구의 집계가 없거나 마지막 사용이 30일 넘게 전이다 | `~/.claude.json`을 읽었고, 시각을 모르는 항목이 없고, 마지막 사용이 없거나 30일 넘게 전이다. 30일은 E5의 ②와 같이 날짜로 센다(과제 13의 `msOlderThan`). 30일 전이면 채우지 못하고 31일 전이면 채운다. 같은 상수를 쓰지만 이 조건의 경계는 따로 시험한다 |
| ⑤ 켜져 있는 다른 플러그인이 기대지 않는다 | 켜져 있는 다른 플러그인의 `dependencies`에 이 플러그인의 마켓 항목의 이름이 없다. 기대는지 알 수 없으면(구성을 모르는 켜진 플러그인이 있다, `dependencies`가 `null`이다) 후보가 아니다 |
| ⑥ 훅을 볼 수 없는 켜진 플러그인이 없다 | A1과 같다 |

- 구성을 알고, 놓인 곳이 있고, 관리 정책이 정하지 않았고, 스킬을 찾는 폴더의 목록과 MCP 정의를 다 읽은 플러그인에서만 낸다.

**A3 서버 막기.** 사용자 설정의 `deniedMcpServers`에 그 이름을 더하는 후보다. 이름으로 듣는 설정이라 그 이름의 서버를 어디에 정의했든 막는다.

- 켜져 있는 사용자 범위 서버가 확인됨이면 그 이름으로 낸다.
- 같은 이름(설정에 적힌 이름이 글자 그대로 같다. 플러그인 서버는 플러그인 안의 서버 이름)의 서버가 다른 범위에 켜져 있으면 그것도 확인됨이어야 한다. claude.ai에 연결한 서버는 확인됨이 되지 않으므로 같은 이름이면 후보가 아니다.
- 구성을 모르거나 MCP 정의를 읽지 못한 켜진 플러그인이 있으면 같은 이름의 서버가 있는지 알 수 없어 내지 않는다. 훅 정의만 읽지 못한 플러그인은 상관없다. E6의 값은 그대로다.

공통으로, 관리 정책이 정한 값은 바꾸지 않으므로 그런 스킬, 플러그인, 서버는 내지 않는다. 이 도구 자신도 내지 않는다. 스킬 묶음은 위치 가운데 하나라도 아래에 맞으면 이 도구 자신이다. 실제 경로가 이 도구의 스킬 폴더다, 이름 꼴 가운데 하나가 이 도구의 스킬 이름이다, 이 도구의 플러그인(두 이름 가운데 하나)에 든 스킬이다. A1은 같이 꺼지는 묶음 모두에서, A2는 그 플러그인의 두 이름과 스킬 묶음에서 본다. 이 도구 자신이 무엇인지는 입력으로 받는다(`SelfIdentity`). 값은 3부의 명령과 4단계의 플러그인 이름이 정한다. `too_little`이나 `watching`으로 못 잰 도구에서도 조건을 채운 후보는 나오고, 읽지 못했거나 관측이 빠진 도구에서는 확인됨이 없어 후보가 없다(과제 15, 16). 후보는 단위, 바꾸는 열쇠의 글자 차례이고 같은 열쇠는 한 번만 낸다.

이 계획이 정한 세부는 둘이다. A1은 켜져 있는 사용자 범위 위치의 이름으로만 내고, 같이 꺼지는 묶음(위)은 켜져 있든 아니든 확인됨이어야 한다(엄한 쪽. 꺼 둔 것을 프로젝트의 설정이 다시 켜는 경우까지 따지지 않으려는 것이다). A2는 사용자 범위로만 깐 플러그인(같은 ID의 사실이 하나이고 설치 범위가 `user` 하나)에서만 낸다. 같은 ID가 프로젝트에도 있으면 같은 열쇠로 켜지고 꺼져서 프로젝트의 것까지 꺼진다(설계 16.2가 스킬 폴더에 둔 플러그인에 적은 것을 모든 플러그인에 둔다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/installs-candidates.test.ts`(새 파일):

```ts
// 정비 후보(A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기)를 내는 조건을 시험한다. 적용은 하지 않고 후보의 유무와 목록만 본다(설계 16.1, 16.2, 21.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { candidatesOf, NO_SELF, type SelfIdentity } from "../../src/core/installs/candidates.ts";
import { sessionListings } from "../../src/core/installs/listing.ts";
import { judgeServers } from "../../src/core/installs/servers.ts";
import { calledMcpNames, usedSkillNames } from "../../src/core/installs/signals.ts";
import { judgeSkills } from "../../src/core/installs/skills.ts";
import { recordMap, type VerdictContext } from "../../src/core/installs/verdict.ts";
import type { ToolSetup } from "../../src/core/metrics/setup.ts";
import { projectLookup } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, McpFact, PluginFact, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts, mcpServer, plugin, skill } from "../helpers/facts.ts";
import { summary } from "../helpers/summaries.ts";

const NOW = Date.UTC(2026, 10, 13, 3, 0);
const windows = makeWindows(NOW, "Asia/Seoul");
const day = { today: windows.today, timeZone: "Asia/Seoul" };
const lookup = projectLookup([], {});

interface Options {
  usedSkills?: string[];
  calledServers?: string[];
  /** 같은 정체로 14일 넘게 지켜본 설치. 적지 않으면 셋팅의 모든 스킬과 서버다 */
  watched?: (SkillFact | McpFact)[];
  complete?: boolean;
  self?: SelfIdentity;
}
const run = (setup: Partial<ClaudeSetupFacts>, options: Options = {}) => {
  const cell = {
    responses: 1,
    skillSignals: Object.fromEntries((options.usedSkills ?? []).map((name) => [name, { tool: 1 }])),
    mcpCalls: Object.fromEntries((options.calledServers ?? []).map((name) => [name, 1])),
  };
  const summaries = [summary({ days: { "2026-11-10": cell } })];
  const all = [...(setup.skills ?? []), ...(setup.mcpServers ?? [])];
  const records: InstallRecord[] = (options.watched ?? all).flatMap((fact) => (fact.installKey === null ? [] : [{ key: fact.installKey, firstSeen: "2026-09-01", appeared: false }]));
  const base = { day, windows, records: recordMap(records), complete: options.complete ?? true };
  const skillContext: VerdictContext = { ...base, used: usedSkillNames(summaries, windows), listings: sessionListings(summaries, "skill", {}, lookup) };
  const serverContext: VerdictContext = { ...base, used: calledMcpNames(summaries, windows), listings: sessionListings(summaries, "mcp", {}, lookup) };
  const tool: ToolSetup = { tool: "claude-code", totals: toolTotals(summaries, windows, []), coverage: CLAUDE_COVERAGE, setup: facts(setup), highestVersion: "2.1.300" };
  const skills = judgeSkills(tool, skillContext);
  const servers = judgeServers(tool, serverContext);
  return { skills, servers, candidates: candidatesOf(tool, skills, servers, day, options.self ?? NO_SELF) };
};
const ids = (result: ReturnType<typeof run>): string[] => result.candidates.map((candidate) => candidate.id);
const inProject = (name: string, input: Partial<SkillFact> = {}) => skill(name, { scope: "project", projectRoot: "/work/app", path: `/work/app/.claude/skills/${name}`, ...input });
const ofPlugin = (pluginId: string, name: string, input: Partial<SkillFact> = {}) => {
  const short = pluginId.split("@")[0]!;
  return skill(`${short}:${name}`, { scope: "plugin", pluginId, path: `/home/u/.claude/plugins/cache/${pluginId}/skills/${name}`, ...input });
};

describe("A1 스킬 끄기", () => {
  it("스킬 묶음이 안 쓴 것이 확인됨이고 사용자 범위의 위치가 있으면 그 이름으로 낸다", () => {
    const result = run({ skills: [skill("idle"), skill("busy")] }, { usedSkills: ["busy"] });
    expect(result.candidates).toEqual([{ id: "A1:claude-code:idle", unit: "A1", rule: "E5", tool: "claude-code", target: "idle" }]);
  });
  it("프로젝트 범위에만 있는 스킬과 플러그인의 스킬은 스킬 끄기 후보가 아니다. 꺼 둔 스킬도 아니다", () => {
    const setup = { skills: [inProject("shared"), ofPlugin("p@m", "s", { hookProvided: false }), skill("off", { enabled: false })], plugins: [plugin("p@m", { components: ["skills", "agents"] })] };
    expect(ids(run(setup)).filter((id) => id.startsWith("A1"))).toEqual([]);
  });
  it("사용자 폴더와 프로젝트 폴더가 같은 원본을 가리키면 한 묶음이다. 묶음이 확인됨이면 사용자 범위 위치의 이름으로 낸다", () => {
    const skills = [skill("tool", { realPath: "/store/tool" }), inProject("tool-link", { isLink: true, realPath: "/store/tool", targetCreatedMs: 0 })];
    expect(ids(run({ skills }))).toEqual(["A1:claude-code:tool"]);
    expect(ids(run({ skills }, { watched: [skills[0]!] }))).toEqual([]);
  });
  it("같은 이름의 스킬이 다른 범위에 따로 있으면 그것도 안 쓴 것이 확인됨이어야 한다. 이름으로 듣는 설정이라 같이 꺼진다", () => {
    const skills = [skill("lint"), inProject("lint")];
    expect(ids(run({ skills }))).toEqual(["A1:claude-code:lint"]);
    expect(ids(run({ skills }, { watched: [skills[0]!] }))).toEqual([]);
    expect(ids(run({ skills: [skill("lint"), inProject("lint", { hookProvided: true })] }))).toEqual([]);
  });
  it("끌 이름을 머리말 이름으로 가진 다른 스킬도 같이 꺼진다. 폴더 이름이 달라도 그 스킬이 안 쓴 것이 확인됨이어야 한다", () => {
    // 설정은 폴더 이름과 머리말 이름 어느 쪽으로도 듣는다. 프로젝트의 y는 머리말 이름이 x라서 x를 끄면 같이 꺼진다
    const skills = [skill("x"), inProject("y", { recordNames: ["x", "y"] })];
    expect(ids(run({ skills }))).toEqual(["A1:claude-code:x"]);
    expect(ids(run({ skills }, { usedSkills: ["y"] }))).toEqual([]);
    expect(ids(run({ skills }, { watched: [skills[0]!] }))).toEqual([]);
    // 사용자 폴더의 다른 스킬이 그 이름을 머리말 이름으로 가져도 같다. 쓰는 쪽의 이름으로는 처음부터 후보가 없다
    const both = [skill("x"), skill("z", { recordNames: ["x", "z"] })];
    expect(ids(run({ skills: both }))).toEqual(["A1:claude-code:x", "A1:claude-code:z"]);
    expect(ids(run({ skills: both }, { usedSkills: ["z"] }))).toEqual([]);
  });
  it("이름 꼴이 같은 플러그인 스킬도 따진다. 이 설정이 플러그인 스킬에 듣지 않는다는 것은 문서로만 봤으므로 엄한 쪽으로 둔다", () => {
    // 사용자 스킬의 이름이 플러그인 스킬의 이름 꼴과 같은 경우다
    const skills = [skill("p:s"), ofPlugin("p@m", "s")];
    const setup = { skills, plugins: [plugin("p@m", { components: ["skills", "agents"] })] };
    expect(ids(run(setup))).toEqual(["A1:claude-code:p:s"]);
    // 플러그인 스킬을 지켜본 기록이 없으면 쓰는지 모름이라 내지 않는다
    expect(ids(run(setup, { watched: [skills[0]!] }))).toEqual([]);
    // 끌 이름이 플러그인 스킬의 이름 꼴이 아니면 그 플러그인 스킬은 같이 꺼지는 것이 아니다
    const other = [skill("mine", { recordNames: ["mine", "p:s"] }), ofPlugin("p@m", "s")];
    expect(ids(run({ ...setup, skills: other }, { watched: [other[0]!] }))).toEqual(["A1:claude-code:mine"]);
  });
  it("같이 꺼지는 스킬 가운데 이 도구 자신이 있으면 내지 않는다. 최근에 쓴 신호가 없어도 같다", () => {
    // 프로젝트에 이 도구의 스킬을 다른 이름의 링크로 걸어 둔 경우다. 이름이 같은 사용자 스킬을 끄면 그것까지 꺼진다
    const skills = [skill("helper"), inProject("helper", { isLink: true, realPath: "/store/aq", targetCreatedMs: 0 })];
    expect(ids(run({ skills }))).toEqual(["A1:claude-code:helper"]);
    expect(ids(run({ skills }, { self: { skillNames: ["aq"], pluginNames: [], skillRealPaths: ["/store/aq"] } }))).toEqual([]);
    // 머리말 이름이 이 도구의 스킬 이름인 것도 자기 자신이다
    const declared = [skill("helper"), inProject("renamed", { recordNames: ["aq", "helper", "renamed"] })];
    expect(ids(run({ skills: declared }))).toEqual(["A1:claude-code:helper"]);
    expect(ids(run({ skills: declared }, { self: { skillNames: ["aq"], pluginNames: [], skillRealPaths: [] } }))).toEqual([]);
    // 끌 이름이 이 도구의 플러그인에 든 스킬의 이름 꼴과 같은 것도 같다
    const withPlugin = { skills: [skill("aq-kit:run"), ofPlugin("aq-kit@m", "run")], plugins: [plugin("aq-kit@m", { components: ["skills", "agents"] })] };
    expect(ids(run(withPlugin))).toEqual(["A1:claude-code:aq-kit:run"]);
    expect(ids(run(withPlugin, { self: { skillNames: [], pluginNames: ["aq-kit"], skillRealPaths: [] } }))).toEqual([]);
  });
  it.each([
    ["구성을 모르는 플러그인", { plugins: [plugin("x@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }],
    ["훅 정의를 읽지 못한 플러그인", { plugins: [plugin("x@m", { hooksUnreadable: true })] }],
    ["설정에 켜 두었는데 설치 기록에 없는 플러그인", { pluginsWithoutInstall: ["ghost@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("훅을 볼 수 없는 켜진 플러그인이 있으면 스킬을 끄는 후보를 내지 않는다. 판정은 그대로다: %s", (_name, setup) => {
    const pluginSkill = ofPlugin("only@m", "s");
    const result = run({ skills: [skill("idle"), pluginSkill], ...setup, plugins: [plugin("only@m"), ...(setup.plugins ?? [])] });
    expect(result.skills.bundles.map((bundle) => bundle.verdict)).toEqual(["unused", "unused"]);
    expect(ids(result)).toEqual([]);
  });
  it("꺼져 있는 플러그인은 훅을 읽지 못해도 상관없다", () => {
    expect(ids(run({ skills: [skill("idle")], plugins: [plugin("x@m", { enabled: false, compositionKnown: false, hooksUnreadable: true })] }))).toEqual(["A1:claude-code:idle"]);
  });
  it("관리 정책이 정한 스킬과 이 도구 자신은 내지 않는다. 자신은 이름과 실제 경로로 견준다", () => {
    expect(ids(run({ skills: [skill("fixed", { managedFixed: true })] }))).toEqual([]);
    const self: SelfIdentity = { skillNames: ["aq"], pluginNames: [], skillRealPaths: ["/home/u/.claude/skills/renamed"] };
    expect(ids(run({ skills: [skill("aq"), skill("renamed"), skill("other")] }, { self }))).toEqual(["A1:claude-code:other"]);
  });
  it("판정할 수 있는 대상이 적어 E5를 못 쟀어도 조건을 채운 후보는 낸다. 관측이 빠졌으면 후보가 없다", () => {
    const few = run({ skills: [skill("idle")] });
    expect(few.skills.measurement).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(ids(few)).toEqual(["A1:claude-code:idle"]);
    expect(ids(run({ skills: [skill("idle")] }, { complete: false }))).toEqual([]);
    expect(ids(run({ skills: [skill("idle")], claudeJson: "unparsable" }))).toEqual([]);
  });
});

describe("A2 플러그인 끄기", () => {
  const SKILLS = [ofPlugin("p@m", "a"), ofPlugin("p@m", "b")];
  const a2 = (pluginInput: Partial<PluginFact> = {}, setup: Partial<ClaudeSetupFacts> = {}, options: Options = {}) =>
    ids(run({ skills: SKILLS, ...setup, plugins: [plugin("p@m", pluginInput), ...(setup.plugins ?? [])] }, options)).filter((id) => id.startsWith("A2"));

  it("스킬만 든 플러그인의 스킬이 모두 안 쓴 것이 확인됨이면 설치 ID로 낸다", () => {
    const result = run({ skills: SKILLS, plugins: [plugin("p@m")] });
    expect(result.candidates).toEqual([{ id: "A2:claude-code:p@m", unit: "A2", rule: "E5", tool: "claude-code", target: "p@m" }]);
  });
  it("① 스킬이 하나라도 쓰였거나 쓰는지 모르면 내지 않는다. 스킬이 없는 플러그인도 내지 않는다", () => {
    expect(a2({}, {}, { usedSkills: ["p:a"] })).toEqual([]);
    expect(a2({}, {}, { watched: [SKILLS[0]!] })).toEqual([]);
    expect(a2({}, { skills: [] })).toEqual([]);
  });
  it("② 스킬 말고 다른 것이 들었거나 ③ 알아보지 못한 것이 있으면 내지 않는다", () => {
    expect(a2({ components: ["skills", "mcpServers"] })).toEqual([]);
    expect(a2({ components: ["skills", "hooks"], hasHooks: true })).toEqual([]);
    expect(a2({ unknownEntries: ["tools"] })).toEqual([]);
  });
  it("④ 도구의 집계가 없거나 마지막 사용이 30일 넘게 전이어야 한다. 집계를 모르면 내지 않는다", () => {
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 1) })).toEqual(["A2:claude-code:p@m"]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 10, 1) })).toEqual([]);
    expect(a2({ usageUndated: true })).toEqual([]);
  });
  it("④의 30일은 날짜로 센다. 마지막 사용이 30일 전이면 내지 않고 31일 전이면 낸다. 같은 날 안의 시각은 결과를 바꾸지 않고 오늘보다 뒤의 시각은 30일 안이다", () => {
    // 평가 시계는 서울의 2026-11-13이다. 30일 전은 10-14이고 31일 전은 10-13이다
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 13, 14, 59) })).toEqual(["A2:claude-code:p@m"]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 12, 15, 0) })).toEqual(["A2:claude-code:p@m"]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 13, 15, 0) })).toEqual([]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 9, 14, 14, 59) })).toEqual([]);
    expect(a2({ usageLastUsedMs: Date.UTC(2026, 10, 20) })).toEqual([]);
  });
  it("⑤ 켜져 있는 다른 플러그인이 기대거나, 기대는지 알 수 없으면 내지 않는다", () => {
    expect(a2({}, { plugins: [plugin("user@m", { dependencies: ["p"] })] })).toEqual([]);
    expect(a2({}, { plugins: [plugin("user@m", { dependencies: null })] })).toEqual([]);
    expect(a2({}, { plugins: [plugin("user@m", { dependencies: ["p"], enabled: false })] })).toEqual(["A2:claude-code:p@m"]);
    expect(a2({}, { plugins: [plugin("user@m", { dependencies: ["other"] })] })).toEqual(["A2:claude-code:p@m"]);
  });
  it("꺼져 있거나, 관리 정책이 정했거나, 구성을 다 보지 못한 플러그인은 내지 않는다", () => {
    expect(a2({ enabled: false }, { skills: SKILLS.map((s) => ({ ...s, enabled: false })) })).toEqual([]);
    expect(a2({ managedFixed: true })).toEqual([]);
    expect(a2({ mcpUnreadable: true })).toEqual([]);
    expect(a2({}, { unreadableSkillPlaces: { user: false, projects: [], plugins: ["p@m"] } })).toEqual([]);
  });
  it("사용자 범위로만 깐 플러그인이어야 한다. 프로젝트에 든 것은 정비하지 않는다", () => {
    expect(a2({ scopes: ["project"], projectRoots: ["/work/app"] })).toEqual([]);
    expect(a2({ scopes: ["project", "user"], projectRoots: ["/work/app"] })).toEqual([]);
  });
  it("같은 설치 ID의 플러그인이 프로젝트의 스킬 폴더에도 따로 있으면 사용자 쪽도 내지 않는다. 같은 열쇠로 켜지고 꺼진다", () => {
    const inUser = plugin("tool@skills-dir", { installPath: "/home/u/.claude/skills/tool" });
    const inProjectDir = plugin("tool@skills-dir", { installPath: "/work/app/.claude/skills/tool", scopes: ["project"], projectRoots: ["/work/app"] });
    const own = [skill("tool:a", { scope: "plugin", pluginId: "tool@skills-dir", path: "/home/u/.claude/skills/tool/skills/a" })];
    const only = ids(run({ skills: own, plugins: [inUser] }));
    expect(only).toEqual(["A2:claude-code:tool@skills-dir"]);
    expect(ids(run({ skills: own, plugins: [inUser, inProjectDir] }))).toEqual([]);
  });
  it("이 도구 자신은 내지 않는다. 플러그인의 두 이름과 스킬의 실제 경로로 견준다", () => {
    expect(a2({}, {}, { self: { skillNames: [], pluginNames: ["p"], skillRealPaths: [] } })).toEqual([]);
    expect(a2({ name: "shown", entryName: "p" }, {}, { self: { skillNames: [], pluginNames: ["shown"], skillRealPaths: [] } })).toEqual([]);
    expect(a2({}, {}, { self: { skillNames: [], pluginNames: [], skillRealPaths: [SKILLS[1]!.realPath!] } })).toEqual([]);
  });
});

describe("A3 서버 막기", () => {
  it("사용자 범위 서버가 안 부른 것이 확인됨이면 그 이름으로 낸다", () => {
    const result = run({ mcpServers: [mcpServer("idle"), mcpServer("busy")] }, { calledServers: ["busy"] });
    expect(result.candidates).toEqual([{ id: "A3:claude-code:idle", unit: "A3", rule: "E6", tool: "claude-code", target: "idle" }]);
  });
  it("로컬 범위, 프로젝트 범위, 플러그인의 서버와 꺼 둔 서버는 서버 막기 후보가 아니다", () => {
    const mcpServers = [mcpServer("loc", { scope: "local", projectRoot: "/work/app" }), mcpServer("proj", { scope: "project", projectRoot: "/work/app" }), mcpServer("plug", { scope: "plugin", pluginId: "p@m" }), mcpServer("off", { enabled: false })];
    expect(ids(run({ mcpServers, plugins: [plugin("p@m", { components: ["mcpServers"] })] }))).toEqual([]);
  });
  it("같은 이름의 서버가 다른 범위에 켜져 있으면 그것도 안 부른 것이 확인됨이어야 한다. 이름으로 막으면 그 서버도 막힌다", () => {
    const own = mcpServer("db");
    const inProject = mcpServer("db", { scope: "project", projectRoot: "/work/app", definitionHash: "other" });
    expect(ids(run({ mcpServers: [own, inProject] }))).toEqual(["A3:claude-code:db"]);
    expect(ids(run({ mcpServers: [own, inProject] }, { watched: [own] }))).toEqual([]);
    expect(ids(run({ mcpServers: [own, { ...inProject, enabled: false }] }, { watched: [own] }))).toEqual(["A3:claude-code:db"]);
  });
  it("플러그인이 넣은 같은 이름의 서버가 쓰이고 있으면 내지 않는다. 부른 기록의 이름 꼴이 달라 사용자 범위 서버는 확인됨일 수 있다", () => {
    const own = mcpServer("db");
    const fromPlugin = mcpServer("db", { scope: "plugin", pluginId: "p@m", recordNames: ["plugin:p:db", "plugin_p_db"], definitionHash: "plugin-def" });
    const setup = { mcpServers: [own, fromPlugin], plugins: [plugin("p@m", { components: ["mcpServers"] })] };
    const result = run(setup, { calledServers: ["plugin_p_db"] });
    expect(result.servers.servers.map((s) => s.verdict)).toEqual(["unused", "used"]);
    expect(ids(result)).toEqual([]);
    expect(ids(run(setup))).toEqual(["A3:claude-code:db"]);
  });
  it("같은 이름의 claude.ai 연결이 켜져 있으면 내지 않는다. 그 연결은 안 부른 것이 확인됨이 되지 않는다", () => {
    const mcpServers = [mcpServer("mail"), mcpServer("mail", { scope: "claude-ai", definitionHash: null })];
    expect(ids(run({ mcpServers }))).toEqual([]);
  });
  it.each([
    ["구성을 모르는 플러그인", { plugins: [plugin("x@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true })] }],
    ["MCP 정의를 읽지 못한 플러그인", { plugins: [plugin("x@m", { mcpUnreadable: true })] }],
    ["설정에 켜 두었는데 설치 기록에 없는 플러그인", { pluginsWithoutInstall: ["ghost@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("같은 이름의 서버가 있는지 알 수 없으면 내지 않는다. E6은 잰다: %s", (_name, setup) => {
    const result = run({ mcpServers: [mcpServer("idle1"), mcpServer("idle2")], ...setup });
    expect(result.servers.measurement).toMatchObject({ status: "scored", value: 1 });
    expect(ids(result)).toEqual([]);
  });
  it("훅 정의만 읽지 못한 플러그인은 서버 막기와 상관없다. 스킬을 끄는 후보만 막는다", () => {
    const result = run({ skills: [skill("idle")], mcpServers: [mcpServer("idle")], plugins: [plugin("x@m", { hooksUnreadable: true })] });
    expect(ids(result)).toEqual(["A3:claude-code:idle"]);
  });
  it("관리 정책이 정한 서버는 내지 않는다. 서버를 하나만 깔아 E6을 못 쟀어도 후보는 낸다", () => {
    expect(ids(run({ mcpServers: [mcpServer("fixed", { managedFixed: true })] }))).toEqual([]);
    const one = run({ mcpServers: [mcpServer("only")] });
    expect(one.servers.measurement).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(ids(one)).toEqual(["A3:claude-code:only"]);
  });
});

describe("후보의 차례", () => {
  it("단위, 그다음 바꾸는 열쇠의 글자 차례로 낸다. 같은 열쇠는 한 번만 낸다", () => {
    const setup = { skills: [skill("zeta"), skill("alpha"), ofPlugin("p@m", "s")], mcpServers: [mcpServer("srv")], plugins: [plugin("p@m")] };
    expect(ids(run(setup))).toEqual(["A1:claude-code:alpha", "A1:claude-code:zeta", "A2:claude-code:p@m", "A3:claude-code:srv"]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/installs-candidates.test.ts`
Expected: FAIL. `../../src/core/installs/candidates.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/installs/candidates.ts`(새 파일):

```ts
// 정비 후보를 낸다. A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기다. 판정만으로 내지 않고 꺼도 되는지를 따로 본다. 적용은 하지 않는다(순수 함수, 설계 16.1, 16.2)
import type { ToolId } from "../../adapters/types.ts";
import type { PluginFact } from "../../scan/types.ts";
import type { ToolSetup } from "../metrics/setup.ts";
import { RECENT_USE_DAYS, msOlderThan, type EvalDay } from "./age.ts";
import type { ServerJudgement } from "./servers.ts";
import type { SkillBundle, SkillJudgement } from "./skills.ts";

/** 이 도구 자신. 정비 후보에서 뺀다. 이름뿐 아니라 플러그인과 실제 경로로도 견준다(설계 16.2) */
export interface SelfIdentity {
  /** 이 도구의 스킬 이름 */
  skillNames: readonly string[];
  /** 이 도구의 플러그인 이름(마켓 항목의 이름과 구성 요소의 이름) */
  pluginNames: readonly string[];
  /** 이 도구의 스킬 폴더의 실제 경로(정규화한 것) */
  skillRealPaths: readonly string[];
}

export const NO_SELF: SelfIdentity = { skillNames: [], pluginNames: [], skillRealPaths: [] };

export interface Candidate {
  /** '<단위>:<도구>:<바꾸는 열쇠>' */
  id: string;
  unit: "A1" | "A2" | "A3";
  /** 이 후보가 나온 규칙 */
  rule: "E5" | "E6";
  tool: ToolId;
  /** 바꾸는 열쇠. A1은 스킬 이름(skillOverrides), A2는 설치 ID(enabledPlugins), A3은 서버 이름(deniedMcpServers) */
  target: string;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function candidatesOf(tool: ToolSetup, skills: SkillJudgement, servers: ServerJudgement, day: EvalDay, self: SelfIdentity): Candidate[] {
  const { setup } = tool;
  const enabledPlugins = setup.plugins.filter((plugin) => plugin.enabled);
  // 설정에 켜 두었는데 설치 기록에 없는 플러그인도 구성을 모르는 플러그인이다
  const unknownPlugin = enabledPlugins.some((plugin) => !plugin.compositionKnown) || setup.pluginsWithoutInstall.length > 0;
  // 훅을 볼 수 없는 켜진 플러그인이 있으면 그 훅이 어느 스킬의 경로를 가리키는지 모른다. 스킬을 끄는 후보를 내지 않는다
  const hooksUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.hooksUnreadable);
  // 서버 막기는 이름으로 듣는다. 같은 이름의 서버가 있는지 알 수 없으면 내지 않는다
  const serversUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.mcpUnreadable);
  const selfPaths = new Set(self.skillRealPaths);
  const selfPlugins = new Set(setup.plugins.filter((plugin) => self.pluginNames.includes(plugin.entryName) || self.pluginNames.includes(plugin.name)).map((plugin) => plugin.id));
  /** 이 도구 자신의 스킬이 든 묶음. 위치 가운데 하나라도 실제 경로, 이름 꼴(폴더 이름과 머리말 이름), 플러그인으로 이 도구의 것이면 그렇다 */
  const isSelfBundle = (bundle: SkillBundle): boolean =>
    bundle.positions.some(
      (skill) => (skill.realPath !== null && selfPaths.has(skill.realPath)) || skill.recordNames.some((name) => self.skillNames.includes(name)) || (skill.pluginId !== null && selfPlugins.has(skill.pluginId)),
    );
  /**
   * 사용자 설정에서 그 이름을 끄면 같이 꺼질 수 있는 스킬 묶음. 설정은 스킬의 폴더 이름과 머리말 이름 어느 쪽으로도 듣는다. 스캐너가 켜짐을 정할 때 쓰는 이름 꼴이 그것이다.
   * 엄한 쪽으로 넓게 잡는다. 플러그인 스킬에는 이 설정이 듣지 않는다고 문서에 있지만 실제로 본 것이 아니라서(설계 27) 범위를 가리지 않는다.
   * 꺼 둔 것도 넣는다. 프로젝트의 설정이 다시 켜는 경우까지 따지지 않으려는 것이다
   */
  const turnedOffBy = (target: string): SkillBundle[] => skills.bundles.filter((bundle) => bundle.positions.some((position) => position.recordNames.includes(target)));
  const confirmed = (bundle: SkillBundle): boolean => bundle.verdict === "unused" && bundle.excluded === null;

  const a1 = new Set<string>();
  const a2 = new Set<string>();
  const a3 = new Set<string>();

  if (!hooksUnseen) {
    // A1. 사용자 범위 위치의 이름으로 끈다. 이름으로 듣는 설정이라 같이 꺼지는 스킬이 모두 안 쓴 것이 확인됨이어야 하고, 그 가운데 이 도구 자신이 없어야 한다
    for (const bundle of skills.bundles) {
      if (!bundle.enabled || !confirmed(bundle)) continue;
      for (const skill of bundle.positions) {
        if (skill.scope !== "user" || !skill.enabled || skill.managedFixed) continue;
        // 이 묶음도 같이 꺼지는 것에 든다(그 이름이 이 위치의 이름 꼴이다)
        const affected = turnedOffBy(skill.name);
        if (affected.every(confirmed) && !affected.some(isSelfBundle)) a1.add(skill.name);
      }
    }

    // A2. 스킬만 든 플러그인의 스킬이 모두 안 쓴 것이 확인됨일 때 플러그인을 끈다
    const uncounted = new Set(setup.unreadableSkillPlaces.plugins);
    const usageStale = (plugin: PluginFact): boolean => setup.claudeJson === "ok" && !plugin.usageUndated && (plugin.usageLastUsedMs === null || msOlderThan(day, plugin.usageLastUsedMs, RECENT_USE_DAYS));
    for (const plugin of enabledPlugins) {
      // 사용자 범위로만 깐 플러그인만 낸다. 같은 ID가 프로젝트에도 있으면 같은 열쇠로 켜지고 꺼져서 프로젝트의 것까지 꺼진다
      const sameId = setup.plugins.filter((other) => other.id === plugin.id);
      if (sameId.length !== 1 || plugin.scopes.length !== 1 || plugin.scopes[0] !== "user") continue;
      if (!plugin.exists || !plugin.compositionKnown || plugin.managedFixed || plugin.mcpUnreadable || uncounted.has(plugin.id)) continue;
      if (self.pluginNames.includes(plugin.entryName) || self.pluginNames.includes(plugin.name)) continue;
      // ② 스킬 말고는 아무것도 들어 있지 않다. ③ 알아보지 못한 구성 요소가 없다. ④ 도구의 집계가 없거나 30일 넘게 전이다
      if (plugin.components.some((component) => component !== "skills") || plugin.unknownEntries.length > 0 || !usageStale(plugin)) continue;
      // ⑤ 켜져 있는 다른 플러그인이 기대지 않는다. 기대는지 알 수 없으면 후보가 아니다(구성을 모르는 켜진 플러그인은 위에서 이미 걸렀다)
      if (enabledPlugins.some((other) => other.id !== plugin.id && (other.dependencies === null || other.dependencies.includes(plugin.entryName)))) continue;
      // ① 스킬이 하나 이상이고 모두 안 쓴 것이 확인됨이다. 묶음으로 센다
      const own = skills.bundles.filter((bundle) => bundle.positions.some((skill) => skill.pluginId === plugin.id));
      if (own.length === 0 || !own.every(confirmed) || own.some(isSelfBundle)) continue;
      a2.add(plugin.id);
    }
  }

  if (!serversUnseen) {
    // A3. 사용자 범위 서버를 이름으로 막는다. 같은 이름의 서버가 다른 범위에 켜져 있으면 그것도 안 부른 것이 확인됨이어야 한다
    for (const judged of servers.servers) {
      const { server } = judged;
      if (server.scope !== "user" || !server.enabled || server.managedFixed || judged.verdict !== "unused" || judged.excluded !== null) continue;
      const sameName = servers.servers.filter((other) => other !== judged && other.server.enabled && other.server.name === server.name);
      if (sameName.every((other) => other.verdict === "unused" && other.excluded === null)) a3.add(server.name);
    }
  }

  const make = (unit: Candidate["unit"], rule: Candidate["rule"], targets: ReadonlySet<string>): Candidate[] =>
    [...targets].sort(byText).map((target) => ({ id: `${unit}:${tool.tool}:${target}`, unit, rule, tool: tool.tool, target }));
  return [...make("A1", "E5", a1), ...make("A2", "E5", a2), ...make("A3", "E6", a3)];
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 12개, 시험 304개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/installs-candidates.test.ts src/core/installs/candidates.ts
git commit -m "feat: 정비 후보 A1·A2·A3 목록 추가"
```

---

### Task 18: 점수판. 도구별 평균, 기준 점수, AQ와 등급, 분류, 심각도, 예상 효과, 차례

**Files:**
- Create: `src/core/scoreboard.ts`
- Test: `test/core/scoreboard.test.ts`

**Interfaces:**
- Consumes: 과제 6의 `RULES`, `RuleSpec`, `ruleScore`, `settleScore`, `roundHalfUp`, `gradeOf`, `ruleReason`, 과제 7의 `Measurement`, `Evidence`, 과제 17의 `Candidate`.
- Produces: `MergedRuleId`, `ToolRuleId`, `MERGED_RULES`, `TOOL_RULES`, `ToolMeasured { tool; responses; rules: Record<ToolRuleId, Measurement>; candidates }`, `Measured { merged: Record<MergedRuleId, Measurement>; tools: readonly ToolMeasured[] }`, `scoreboard(measured: Measured): { axes: AxisScore[]; findings: Finding[] }`, `overall(axes: readonly AxisScore[], humanRequests: number, activeDays: number): Overall`, `Finding`, `ToolValue`, `AxisScore`, `Overall { aq; grade; tier; withheld: Withheld[]; missingAxes }`, `Category = "strength" | "average" | "repair" | "unmeasured"`, `Severity = "critical" | "caution" | "info"`, `AXES`, `MIN_REQUESTS_FOR_AQ = 20`, `MIN_DAYS_FOR_AQ = 3`(`src/core/scoreboard.ts`).

잰 것(합침 규칙 열, 도구마다의 규칙 열둘)을 받아 점수판으로 묶는다(설계 11.4, 11.5, 12.2).

- **도구별 규칙의 평균.** 도구마다 규칙 점수를 낸 뒤 그 도구의 점수 구간 응답 수를 무게로 평균한다. 평균한 점수는 맞추지 않는다. 잰 값도 같은 무게로 평균한다. 그 규칙을 못 잰 도구는 평균에서 빼고, 이유와 함께 도구별 값에 남긴다. 재는 도구가 없으면 규칙은 못 잰 것이고 이유는 도구마다의 이유에서 고른다(`ruleReason`). 점수에 넣는 도구가 없으면 `no_data`이고 도구별 값은 빈 목록이다.
- **도구별 값**(`ToolValue`). 도구 식별자, 상태, 이유, 잰 값, 규칙 점수, 근거 숫자, 그 도구에서 나온 정비 후보의 ID다. 못 잰 도구의 값과 점수는 `null`이다. 합침 규칙에서는 빈 목록이고 근거 숫자는 규칙에 싣는다. 도구별 값의 관측 범위(봄, 대신 봄, 못 봄)는 3부에서 싣는다.
- **기준 점수.** `Σ(무게 × 규칙 점수) ÷ Σ(잰 규칙의 무게) × 100`을 정수로 반올림한다. 한 기준의 규칙을 하나도 못 쟀으면 `null`이다. 규칙 점수는 맞추지 않은 값을 쓴다(과제 6).
- **경계와 견줄 때.** 점수를 경계와 견주는 곳은 넷이다. 분류의 0.8과 0.6, 심각도의 0.3과 0.6, 「점수가 1 미만」(정비 후보가 있을 때의 분류와 예상 효과를 낼지), 잘하고 있는 것의 차례(무게 × 점수)다. 넷 모두 소수 열두째 자리에서 맞춘 값으로 견준다(과제 6의 `settleScore`). 두 도구의 점수가 모두 0.6이어도 `(0.6 × 3 + 0.6 × 4) / 7`은 `0.5999999999999999`로 계산되고, F3 0.38의 점수는 `0.29999999999999993`으로, E6 0.34의 점수는 `0.5999999999999999`로 계산된다. E1 0.82와 E2 0.04는 무게 × 점수가 수학으로 같은데 계산한 값은 끝자리가 달라서, 그대로 견주면 규칙 표의 순서가 뒤집힌다. 싣는 점수(`score`)는 계산한 그대로다.
- **이 맞춤의 한계.** 맞춘 값으로 견주므로 수학으로 경계에 아주 조금 못 미치는 점수가 경계로 올라가는 일이 있다. 비율 하나에서는 분모가 수십억을 넘어야 그만큼 가까워진다. 두 도구의 평균에서는 보통 크기의 개수로도 나온다. 캐시 읽기 26381/30227과 25329/30893을 응답 수 1과 500으로 평균한 E1의 점수는 0.8보다 10조 분의 1쯤 작은데 잘하고 있는 것으로 분류된다. 이 절차의 성질로 받아들이고 그 입력을 시험에 고정해 둔다.
- **AQ.** 기준 점수(정수)의 평균을 정수로 반올림한다. 못 잰 기준은 빼고 `missingAxes`에 적는다. 점수 구간의 사람 요청이 20개 미만이거나 사용한 날이 3일 미만이면 AQ와 등급은 `null`이고 까닭을 `withheld`에 적는다. 까닭은 여럿일 수 있다.
- **분류.** 규칙 점수가 0.8 이상이면 잘하고 있는 것, 0.6 이상이면 보통, 그 아래는 정비할 것, 못 쟀으면 잴 수 없음이다. 정비할 수 있는 규칙(E5, E6)은 둘이 더 있다. 점수가 1 미만이고 정비 후보가 하나라도 있으면 점수가 높아도 정비할 것이다. 그 규칙을 못 잰 도구에서 나온 후보가 있으면, 규칙을 못 쟀든 다른 도구로 재서 점수가 1이든 정비할 것이다. 잰 도구에서만 후보가 나왔고 점수가 1이면 싣지 않는다.
- **심각도.** 정비할 것 가운데 점수가 0.3 미만이고 무게가 3이면 심각, 그 밖에 0.6 미만이고 무게가 2 이상이면 주의, 나머지와 점수가 없는 항목은 참고다. 정비할 것이 아닌 규칙에는 없다. 점수가 꼭 0.6인 규칙은 보통이라서, 0.6에서 심각도를 따지는 것은 정비 후보 때문에 정비할 것이 된 E5와 E6뿐이다. 주의의 경계는 그 규칙으로 시험한다.
- **예상 효과.** 그 규칙만 만점으로 바꿔 기준 점수를 다시 계산하고(반올림까지) 지금 기준 점수를 뺀다. 규칙을 쟀고 점수가 1 미만일 때만 낸다. 못 잰 규칙과 점수가 1인 규칙에는 없다. 0으로 적지 않는다.
- **차례.** 잘하고 있는 것, 보통, 정비할 것, 잴 수 없음의 차례로 싣는다. 잘하고 있는 것은 무게 × 점수가 큰 순서, 정비할 것은 예상 효과가 큰 순서, 같으면 심각도가 높은 순서이고, 예상 효과가 없는 항목은 그 뒤다. 그 밖과 같은 자리는 규칙 표의 순서다.

이 계획이 정한 세부는 「이 계획이 기대는 설계 보완」에 모았다. 평균을 내는 것은 규칙 점수라는 것, 분류 사이의 차례, `withheld`의 모양이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/scoreboard.test.ts`(새 파일):

```ts
// 잰 것을 점수판으로 묶는 것을 시험한다. 도구별 규칙의 평균과 이유, 기준 점수, AQ와 등급, 분류, 심각도, 예상 효과, 차례(설계 11.4, 11.5, 11.6, 12.2, 21.1)
import { describe, expect, it } from "vitest";
import type { ToolId } from "../../src/adapters/types.ts";
import type { Candidate } from "../../src/core/installs/candidates.ts";
import { scored, unmeasured, type Measurement } from "../../src/core/measure.ts";
import type { Reason } from "../../src/core/reasons.ts";
import { MERGED_RULES, overall, scoreboard, TOOL_RULES, type Measured, type MergedRuleId, type ToolRuleId } from "../../src/core/scoreboard.ts";

const at = (value: number, evidence = {}): Measurement => scored(value, evidence);
const not = (reason: Reason, evidence = {}): Measurement => unmeasured(reason, evidence);
const NA = not("not_applicable");
const candidate = (unit: "A1" | "A3", tool: string, target: string): Candidate => ({ id: `${unit}:${tool}:${target}`, unit, rule: unit === "A1" ? "E5" : "E6", tool: tool as ToolId, target });

/** 적지 않은 규칙은 모두 해당 없음으로 못 잰 것이다 */
const mergedOf = (rules: Partial<Record<MergedRuleId, Measurement>> = {}): Measured["merged"] => ({ ...(Object.fromEntries(MERGED_RULES.map((id) => [id, NA])) as Record<MergedRuleId, Measurement>), ...rules });
const tool = (id: string, responses: number, rules: Partial<Record<ToolRuleId, Measurement>> = {}, candidates: Candidate[] = []): Measured["tools"][number] => ({
  tool: id as ToolId,
  responses,
  rules: { ...(Object.fromEntries(TOOL_RULES.map((rule) => [rule, NA])) as Record<ToolRuleId, Measurement>), ...rules },
  candidates,
});
const board = (merged: Partial<Record<MergedRuleId, Measurement>> = {}, tools: Measured["tools"] = [tool("claude-code", 100)]) => scoreboard({ merged: mergedOf(merged), tools });
const finding = (result: ReturnType<typeof board>, id: string) => result.findings.find((f) => f.ruleId === id)!;

describe("규칙 점수", () => {
  it("합침 규칙은 잰 값을 0점 기준과 만점 기준 사이의 직선으로 점수로 바꾼다. 잰 값은 자르지 않는다", () => {
    const result = board({ I1: at(11, { activeDays: 11 }), S3: at(7, { problems: 7 }) });
    expect(finding(result, "I1")).toMatchObject({ axis: "intensity", kind: "count", weight: 3, status: "scored", reason: null, value: 11, score: 0.5, evidence: { activeDays: 11 }, tools: [] });
    expect(finding(result, "S3")).toMatchObject({ value: 7, score: 0 });
  });
  it("못 잰 규칙의 값과 점수는 null이고 이유가 붙는다. 0으로 바꾸지 않는다", () => {
    expect(finding(board({ F3: not("not_applicable", { targets: 0 }) }), "F3")).toMatchObject({ status: "unmeasured", reason: "not_applicable", value: null, score: null, gain: null, evidence: { targets: 0 } });
  });

  describe("도구별 규칙", () => {
    it("도구마다 점수를 낸 뒤 점수 구간의 응답 수를 무게로 평균한다. 도구별 값은 도구 식별자의 차례다", () => {
      const result = board({}, [tool("codex", 300, { E1: at(0.9, { cacheRead: 9 }) }), tool("claude-code", 100, { E1: at(0.5) })]);
      const e1 = finding(result, "E1");
      expect(e1).toMatchObject({ status: "scored", reason: null, score: 0.75, evidence: {} });
      expect(e1.value).toBeCloseTo(0.8, 12);
      expect(e1.tools).toEqual([
        { tool: "claude-code", status: "scored", reason: null, value: 0.5, score: 0, evidence: {}, candidates: [] },
        { tool: "codex", status: "scored", reason: null, value: 0.9, score: 1, evidence: { cacheRead: 9 }, candidates: [] },
      ]);
    });
    it("그 규칙을 못 잰 도구는 평균에서 빼고, 이유와 함께 도구별 값에 남긴다", () => {
      const e2 = finding(board({}, [tool("claude-code", 100, { E2: at(0.12) }), tool("codex", 900, { E2: not("unsupported", { errors: null, results: null }) })]), "E2");
      expect(e2).toMatchObject({ status: "scored", reason: null, value: 0.12, score: 0 });
      expect(e2.tools[1]).toEqual({ tool: "codex", status: "unmeasured", reason: "unsupported", value: null, score: null, evidence: { errors: null, results: null }, candidates: [] });
    });
    it("재는 도구가 없으면 도구마다의 이유 가운데 재는 데에 가장 가까운 것을 규칙의 이유로 낸다", () => {
      const both = (a: Reason, b: Reason) => finding(board({}, [tool("claude-code", 10, { E5: not(a) }), tool("codex", 10, { E5: not(b) })]), "E5");
      expect(both("watching", "unsupported")).toMatchObject({ status: "unmeasured", reason: "watching", value: null, score: null });
      expect(both("unreadable", "too_little").reason).toBe("too_little");
      expect(both("unsupported", "not_applicable").reason).toBe("not_applicable");
    });
    it("점수에 넣는 도구가 하나도 없으면 이유는 no_data이고 도구별 값은 빈 목록이다", () => {
      expect(finding(board({}, []), "S4")).toMatchObject({ status: "unmeasured", reason: "no_data", tools: [] });
    });
  });
});

describe("기준 점수", () => {
  it("무게를 곱한 규칙 점수의 합을 잰 규칙의 무게의 합으로 나누어 100을 곱하고 정수로 반올림한다. 못 잰 규칙은 뺀다", () => {
    // 강도: I1 무게 3 점수 1, I2 무게 3 점수 0.5, I4 무게 1 점수 0. I3은 못 쟀다. (3 + 1.5 + 0) / 7 = 64.28…
    const result = board({ I1: at(20), I2: at(21.5), I3: not("too_little"), I4: at(1) });
    expect(result.axes.find((axis) => axis.axis === "intensity")).toEqual({ axis: "intensity", score: 64, strengths: 1, repairs: 2 });
  });
  it("한 기준의 규칙을 하나도 못 쟀으면 그 기준은 null이다. 기준은 셋팅, 효율, 상황 적합, 강도의 차례다", () => {
    const result = board({ I1: at(20) });
    expect(result.axes.map((axis) => [axis.axis, axis.score])).toEqual([["setup", null], ["efficiency", null], ["fit", null], ["intensity", 100]]);
  });
  it("기준 점수와 예상 효과는 맞추지 않은 규칙 점수로 계산한다. 맞춘 점수를 쓰면 반올림의 경계가 달라진다", () => {
    // S1의 점수는 1/3(무게 3), S3의 점수는 0.2625(무게 2)라서 기준 점수는 꼭 30.5이고 31로 올린다. 점수를 소수 아홉째 자리에서 깎아 쓰면 30.49999998이 되어 30이 된다
    expect(board({ S1: at(1 / 3), S3: at(2.2125) }).axes[0]).toMatchObject({ axis: "setup", score: 31 });
    // 캐시 읽기 19468/30001과 도구 오류 6370/66197의 기준 점수는 30.5 - 1/(30001 × 66197)이다. 30.4999999995에 조금 못 미쳐서 30이다. 점수를 열두째 자리에서 맞춰 쓰면 그 문턱을 넘어 31이 된다
    const result = board({}, [tool("claude-code", 100, { E1: at(19468 / 30001), E2: at(6370 / 66197) })]);
    expect(result.axes[1]).toMatchObject({ axis: "efficiency", score: 30 });
    expect([finding(result, "E1").gain, finding(result, "E2").gain]).toEqual([32, 39]);
  });
  it("0.5는 올린다", () => {
    // 셋팅: S1 무게 3 점수 1, S2 무게 3 점수 0.75. (3 + 2.25) / 6 = 87.5
    expect(board({ S1: at(1), S2: at(0.75) }).axes[0]).toMatchObject({ axis: "setup", score: 88 });
  });
});

describe("분류", () => {
  it("규칙 점수가 0.8 이상이면 잘하고 있는 것, 0.6 이상이면 보통, 그 아래는 정비할 것, 못 쟀으면 잴 수 없음이다", () => {
    const result = board({ S1: at(0.8), S2: at(0.79), F3: at(0.5), F4: not("unreadable") });
    expect(["S1", "S2", "F3", "F4"].map((id) => finding(result, id).category)).toEqual(["strength", "average", "repair", "unmeasured"]);
    expect(finding(board({ S2: at(0.6) }), "S2").category).toBe("average");
    expect(finding(board({ S2: at(0.59) }), "S2").category).toBe("repair");
  });
  it("잰 값에서 낸 점수가 수학으로 경계와 같으면 경계에 든다. 나눗셈의 끝자리 오차로 아래 분류로 떨어지지 않는다", () => {
    // E1 0.82의 점수는 0.7999999999999998로, E2 0.04의 점수는 0.7999999999999999로 계산된다. 수학으로는 둘 다 0.8이다
    const result = board({}, [tool("claude-code", 100, { E1: at(0.82), E2: at(0.04) })]);
    expect(finding(result, "E1").category).toBe("strength");
    expect(finding(result, "E2").category).toBe("strength");
    // 싣는 점수는 계산한 그대로다. 견줄 때만 맞춘다
    expect(finding(result, "E1").score).toBe((0.82 - 0.5) / (0.9 - 0.5));
    expect(finding(result, "E1").score).toBeLessThan(0.8);
  });
  it("도구별 점수의 평균도 맞춘 값으로 경계와 견준다", () => {
    // 두 도구의 점수가 모두 0.6이면 평균도 0.6이다. (0.6 × 3 + 0.6 × 4) / 7은 0.5999999999999999로 계산된다
    const e1 = finding(board({}, [tool("claude-code", 3, { E1: at(0.74) }), tool("codex", 4, { E1: at(0.74) })]), "E1");
    expect(e1).toMatchObject({ category: "average", severity: null });
    expect(e1.score).toBeLessThan(0.6);
    expect(e1.score).toBeCloseTo(0.6, 12);
  });
  it("도구가 둘이면 평균이 수학으로 경계에 조금 못 미쳐도 경계로 본다. 맞춘 값으로 견주는 절차의 한계다", () => {
    // 캐시 읽기 26381/30227(응답 1)과 25329/30893(응답 500)의 평균 점수는 0.8보다 10조 분의 1쯤 작다. 견줄 때의 맞춤이 이것을 0.8로 본다.
    // 비율 하나에서는 분모가 수십억을 넘어야 이만큼 가까워지지만, 두 도구의 평균에서는 보통 크기의 개수로도 나온다
    const e1 = finding(board({}, [tool("claude-code", 1, { E1: at(26381 / 30227) }), tool("codex", 500, { E1: at(25329 / 30893) })]), "E1");
    expect(e1.score).toBeLessThan(0.8);
    expect(0.8 - e1.score!).toBeLessThan(5e-13);
    expect(e1.category).toBe("strength");
  });
  it("경계에 못 미치는 점수를 경계로 올리지 않는다. 맞추는 자리는 열두째다", () => {
    expect(finding(board({ S1: at(0.7999999999) }), "S1").category).toBe("average");
    expect(finding(board({ S1: at(0.5999999999) }), "S1").category).toBe("repair");
  });
  it("정비할 수 있는 규칙은 점수가 1 미만이고 정비 후보가 하나라도 있으면 점수가 높아도 정비할 것이다", () => {
    const withCandidate = board({}, [tool("claude-code", 100, { E5: at(0.25) }, [candidate("A1", "claude-code", "idle")])]);
    expect(finding(withCandidate, "E5")).toMatchObject({ category: "repair", severity: "info", candidates: ["A1:claude-code:idle"] });
    expect(finding(withCandidate, "E5").score).toBeCloseTo(0.9167, 3);
    expect(finding(board({}, [tool("claude-code", 100, { E5: at(0.25) })]), "E5").category).toBe("strength");
  });
  it("잰 도구에서만 후보가 나왔고 규칙 점수가 1이면 정비할 것에 싣지 않는다", () => {
    const result = board({}, [tool("claude-code", 100, { E5: at(0.2) }, [candidate("A1", "claude-code", "idle")])]);
    expect(finding(result, "E5")).toMatchObject({ score: 1, category: "strength", gain: null, candidates: ["A1:claude-code:idle"] });
  });
  it("못 잰 도구에서 나온 후보가 있으면 규칙을 못 쟀어도 정비할 것에 싣는다. 값과 점수와 예상 효과는 null이고 심각도는 참고다", () => {
    const result = board({}, [tool("claude-code", 100, { E6: not("too_little", { judgeable: 1 }) }, [candidate("A3", "claude-code", "only")])]);
    expect(finding(result, "E6")).toMatchObject({ status: "unmeasured", reason: "too_little", value: null, score: null, category: "repair", severity: "info", gain: null, candidates: ["A3:claude-code:only"] });
    expect(finding(result, "E6").tools).toEqual([{ tool: "claude-code", status: "unmeasured", reason: "too_little", value: null, score: null, evidence: { judgeable: 1 }, candidates: ["A3:claude-code:only"] }]);
    expect(finding(result, "E5").candidates).toEqual([]);
  });
  it("못 잰 도구에서 후보가 나왔으면 다른 도구의 값만으로 규칙 점수가 1이어도 정비할 것에 싣는다", () => {
    const claude = tool("claude-code", 100, { E6: not("too_little") }, [candidate("A3", "claude-code", "only")]);
    const codex = tool("codex", 100, { E6: at(0) });
    const e6 = finding(board({}, [claude, codex]), "E6");
    expect(e6).toMatchObject({ status: "scored", reason: null, value: 0, score: 1, category: "repair", severity: "info", gain: null });
  });
  it("못 잰 도구에서 후보가 나왔고 다른 도구의 규칙 점수가 1 미만이면 정비할 것이고 예상 효과는 평소대로 낸다", () => {
    const claude = tool("claude-code", 100, { E6: not("watching") }, [candidate("A3", "claude-code", "only")]);
    const codex = tool("codex", 100, { E6: at(0.16) });
    const e6 = finding(board({}, [claude, codex]), "E6");
    expect(e6).toMatchObject({ status: "scored", reason: null, value: 0.16, category: "repair", severity: "info", gain: 10, candidates: ["A3:claude-code:only"] });
    expect(e6.score).toBeCloseTo(0.9, 12);
  });
  it("기준마다 잘하고 있는 것과 정비할 것의 수를 센다", () => {
    const result = board({ S1: at(1), S2: at(1), S3: at(3), F3: at(0.2) }, [tool("claude-code", 100, { S4: at(0.02) })]);
    expect(result.axes.map((axis) => [axis.axis, axis.strengths, axis.repairs])).toEqual([["setup", 3, 1], ["efficiency", 0, 0], ["fit", 0, 1], ["intensity", 0, 0]]);
  });
});

describe("심각도", () => {
  it("정비할 것 가운데 점수가 0.3 미만이고 무게가 3이면 심각, 그 밖에 0.6 미만이고 무게가 2 이상이면 주의, 나머지는 참고다", () => {
    const result = board({ S1: at(0.29), S2: at(0.3), S3: at(3) }, [tool("claude-code", 100, { F1: at(0.95), E7: at(0.15) })]);
    expect(["S1", "S2", "S3", "F1", "E7"].map((id) => finding(result, id).severity)).toEqual(["critical", "caution", "caution", "info", "info"]);
  });
  it("주의는 0.6 미만부터다. 정비 후보 때문에 정비할 것이 된 규칙은 점수가 꼭 0.6이어도 참고다", () => {
    // 점수 0.6인 규칙은 보통이라서, 0.6에서 심각도를 따지는 것은 후보가 있는 E5와 E6뿐이다
    const e5 = (value: number) => finding(board({}, [tool("claude-code", 100, { E5: at(value) }, [candidate("A1", "claude-code", "idle")])]), "E5");
    expect(e5(0.44)).toMatchObject({ category: "repair", severity: "info" });
    expect(e5(0.44).score).toBeCloseTo(0.6, 12);
    expect(e5(0.45)).toMatchObject({ category: "repair", severity: "caution" });
    expect(e5(0.45).score).toBeLessThan(0.6);
  });
  it("심각도의 경계도 맞춘 값으로 견준다. 수학으로 0.3이나 0.6인 점수는 끝자리 오차와 상관없이 그 경계에 든다", () => {
    // F3 0.38의 점수는 0.29999999999999993으로 계산된다. 수학으로는 0.3이라서 심각이 아니라 주의다
    const f3 = finding(board({ F3: at(0.38) }), "F3");
    expect(f3.score).toBeLessThan(0.3);
    expect(f3).toMatchObject({ weight: 3, category: "repair", severity: "caution" });
    // E6 0.34의 점수는 0.5999999999999999로 계산된다. 수학으로는 0.6이라서 후보가 있어도 주의가 아니라 참고이고, 후보가 없으면 보통이다
    const e6 = (candidates: Candidate[]) => finding(board({}, [tool("claude-code", 100, { E6: at(0.34) }, candidates)]), "E6");
    expect(e6([]).score).toBeLessThan(0.6);
    expect(e6([candidate("A3", "claude-code", "db")])).toMatchObject({ category: "repair", severity: "info" });
    expect(e6([])).toMatchObject({ category: "average", severity: null });
  });
  it("정비할 것이 아닌 규칙에는 심각도가 없다", () => {
    const result = board({ S1: at(1), S2: at(0.7), F4: not("unreadable") });
    expect(["S1", "S2", "F4"].map((id) => finding(result, id).severity)).toEqual([null, null, null]);
  });
});

describe("예상 효과", () => {
  it("그 규칙만 만점으로 바꿔 기준 점수를 다시 계산해 지금 기준 점수를 뺀 값이다. 화면에 보이는 점수의 차이와 맞는다", () => {
    // 셋팅: S1(3) 0, S2(3) 1, S3(2) 0.5 → (0 + 3 + 1) / 8 = 50. S1을 만점으로 → (3 + 3 + 1) / 8 = 87.5 → 88. S3을 만점으로 → (0 + 3 + 2) / 8 = 62.5 → 63
    const result = board({ S1: at(0), S2: at(1), S3: at(1.5) });
    expect(result.axes[0]).toMatchObject({ score: 50 });
    expect(finding(result, "S1").gain).toBe(38);
    expect(finding(result, "S3").gain).toBe(13);
    expect(finding(result, "S2").gain).toBeNull();
  });
  it("분류가 점수를 1로 보면 예상 효과도 내지 않는다. 같은 값으로 견준다", () => {
    // 1에서 1조 분의 1 안쪽으로 못 미치는 점수는 견줄 때 1이다. 정비 후보가 있어도 정비할 것이 아니고 예상 효과를 0으로 적지 않는다
    const e5 = finding(board({}, [tool("claude-code", 100, { E5: at(0.2 + 1e-13) }, [candidate("A1", "claude-code", "idle")])]), "E5");
    expect(e5.score).toBeLessThan(1);
    expect(e5).toMatchObject({ category: "strength", gain: null });
  });
  it("규칙을 쟀고 점수가 1 미만이면 분류와 상관없이 낸다. 못 잰 규칙에는 없다", () => {
    const result = board({ I1: at(18.2), I2: not("no_data") });
    expect(finding(result, "I1")).toMatchObject({ category: "strength", gain: 10 });
    expect(finding(result, "I2").gain).toBeNull();
  });
});

describe("차례", () => {
  it("잘하고 있는 것, 보통, 정비할 것, 잴 수 없음의 차례로 싣는다. 스물두 규칙이 모두 한 번씩 나온다", () => {
    const result = board({ S1: at(1), S2: at(0.7), S3: at(3) });
    expect(result.findings.map((f) => f.category).filter((c, i, all) => all.indexOf(c) === i)).toEqual(["strength", "average", "repair", "unmeasured"]);
    expect(result.findings).toHaveLength(22);
    expect(new Set(result.findings.map((f) => f.ruleId)).size).toBe(22);
  });
  it("잘하고 있는 것은 무게 × 점수가 큰 순서이고 같으면 규칙 표의 순서다", () => {
    const result = board({ I4: at(4), I3: at(8), S1: at(1), I1: at(20), S3: at(0) });
    expect(result.findings.filter((f) => f.category === "strength").map((f) => f.ruleId)).toEqual(["S1", "I1", "S3", "I3", "I4"]);
  });
  it("무게 × 점수가 수학으로 같은 둘은 끝자리 오차와 상관없이 규칙 표의 순서다", () => {
    // 둘 다 무게 3에 점수 0.8이다. 계산한 값은 E2 쪽이 끝자리만큼 커서, 그대로 견주면 E2가 앞에 온다
    const result = board({}, [tool("claude-code", 100, { E1: at(0.82), E2: at(0.04) })]);
    expect(finding(result, "E2").score!).toBeGreaterThan(finding(result, "E1").score!);
    expect(result.findings.filter((f) => f.category === "strength").map((f) => f.ruleId)).toEqual(["E1", "E2"]);
  });
  it("정비할 것은 예상 효과가 큰 순서, 같으면 심각도가 높은 순서, 그것도 같으면 규칙 표의 순서다. 예상 효과가 없는 항목은 그 뒤다", () => {
    // 셋팅 S1(3) 0, S2(3) 1 → 50이고 S1을 만점으로 100(+50). 상황 적합 F3(3) 0.5, F6(2) 0.25 → (1.5 + 0.5) / 5 = 40이고 F3을 만점으로 70(+30), F6을 만점으로 70(+30).
    // F3과 F6은 예상 효과도 심각도(주의)도 같아서 규칙 표의 순서다. E6은 못 잰 규칙이라 예상 효과가 없어 맨 뒤다
    const claude = tool("claude-code", 100, { E6: not("too_little") }, [candidate("A3", "claude-code", "only")]);
    const result = board({ S1: at(0), S2: at(1), F3: at(0.5), F6: at(2.25) }, [claude]);
    expect(result.findings.filter((f) => f.category === "repair").map((f) => [f.ruleId, f.gain, f.severity])).toEqual([
      ["S1", 50, "critical"],
      ["F3", 30, "caution"],
      ["F6", 30, "caution"],
      ["E6", null, "info"],
    ]);
  });
  it("보통과 잴 수 없음은 규칙 표의 순서다", () => {
    const result = board({ I2: at(27), S2: at(0.7), F4: not("unreadable"), S1: not("no_data") });
    expect(result.findings.filter((f) => f.category === "average").map((f) => f.ruleId)).toEqual(["S2", "I2"]);
    expect(result.findings.filter((f) => f.category === "unmeasured").map((f) => f.ruleId).slice(0, 3)).toEqual(["S1", "S3", "S4"]);
  });
});

describe("AQ와 등급", () => {
  const axes = (scores: (number | null)[]) => (["setup", "efficiency", "fit", "intensity"] as const).map((axis, i) => ({ axis, score: scores[i]!, strengths: 0, repairs: 0 }));

  it("화면에 보이는 기준 점수의 평균을 정수로 반올림한다. 등급과 단계를 함께 낸다", () => {
    expect(overall(axes([90, 81, 70, 80]), 200, 20)).toEqual({ aq: 80, grade: "A", tier: 4, withheld: [], missingAxes: [] });
    expect(overall(axes([90, 90, 90, 91]), 200, 20)).toMatchObject({ aq: 90, grade: "S", tier: 5 });
    expect(overall(axes([50, 49, 49, 50]), 200, 20)).toMatchObject({ aq: 50, grade: "C", tier: 2 });
  });
  it("못 잰 기준은 빼고 남은 기준으로 내며 빠진 기준을 적는다", () => {
    expect(overall(axes([60, null, 71, null]), 200, 20)).toEqual({ aq: 66, grade: "B", tier: 3, withheld: [], missingAxes: ["efficiency", "intensity"] });
  });
  it("점수 구간의 사람 요청이 20개 미만이거나 사용한 날이 3일 미만이면 AQ와 등급을 내지 않는다", () => {
    expect(overall(axes([90, 90, 90, 90]), 19, 20)).toEqual({ aq: null, grade: null, tier: null, withheld: ["too_few_requests"], missingAxes: [] });
    expect(overall(axes([90, 90, 90, 90]), 20, 2)).toMatchObject({ aq: null, withheld: ["too_few_days"] });
    expect(overall(axes([90, 90, 90, 90]), 0, 0)).toMatchObject({ aq: null, withheld: ["too_few_requests", "too_few_days"] });
    expect(overall(axes([90, 90, 90, 90]), 20, 3)).toMatchObject({ aq: 90 });
  });
  it("기준을 하나도 못 쟀으면 AQ가 없다", () => {
    expect(overall(axes([null, null, null, null]), 200, 20)).toEqual({ aq: null, grade: null, tier: null, withheld: ["no_axes"], missingAxes: ["setup", "efficiency", "fit", "intensity"] });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/scoreboard.test.ts`
Expected: FAIL. `../../src/core/scoreboard.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/core/scoreboard.ts`(새 파일):

```ts
// 잰 것을 점수판으로 묶는다. 도구별 규칙의 평균과 이유, 기준 점수, AQ와 등급, 화면에 내는 분류, 심각도, 예상 효과, 차례(순수 함수, 설계 11.4, 11.5, 11.6, 12.2)
import type { ToolId } from "../adapters/types.ts";
import type { Candidate } from "./installs/candidates.ts";
import type { Evidence, Measurement } from "./measure.ts";
import { ruleReason, type Reason } from "./reasons.ts";
import { RULES, type Axis, type RuleId, type RuleSpec, type ValueKind } from "./rules.ts";
import { gradeOf, roundHalfUp, ruleScore, settleScore, type Grade } from "./score.ts";

export type MergedRuleId = "S1" | "S2" | "S3" | "F3" | "F4" | "F6" | "I1" | "I2" | "I3" | "I4";
export type ToolRuleId = Exclude<RuleId, MergedRuleId>;

const isMerged = (id: RuleId): id is MergedRuleId => RULES.some((spec) => spec.id === id && spec.unit === "merged");
/** 도구를 합쳐 한 번 재는 규칙과 도구마다 재는 규칙(규칙 표의 차례) */
export const MERGED_RULES: readonly MergedRuleId[] = RULES.map((spec) => spec.id).filter(isMerged);
export const TOOL_RULES: readonly ToolRuleId[] = RULES.map((spec) => spec.id).filter((id): id is ToolRuleId => !isMerged(id));

/** 점수에 넣는 도구 하나에서 잰 것 */
export interface ToolMeasured {
  tool: ToolId;
  /** 점수 구간의 응답 수. 도구별 규칙을 평균할 때의 무게다 */
  responses: number;
  rules: Record<ToolRuleId, Measurement>;
  /** 이 도구에서 나온 정비 후보 */
  candidates: readonly Candidate[];
}

export interface Measured {
  merged: Record<MergedRuleId, Measurement>;
  /** 점수에 넣는 도구 */
  tools: readonly ToolMeasured[];
}

/** 도구별 값. 평균에 든 도구와 평균에서 뺀 도구를 모두 싣는다(설계 12.2) */
export interface ToolValue {
  tool: ToolId;
  status: "scored" | "unmeasured";
  reason: Reason | null;
  value: number | null;
  score: number | null;
  evidence: Evidence;
  /** 그 도구에서 나온 정비 후보의 ID */
  candidates: string[];
}

/** strength는 잘하고 있는 것, average는 보통, repair는 정비할 것, unmeasured는 잴 수 없음이다 */
export type Category = "strength" | "average" | "repair" | "unmeasured";
/** critical은 심각, caution은 주의, info는 참고다 */
export type Severity = "critical" | "caution" | "info";

export interface Finding {
  ruleId: RuleId;
  axis: Axis;
  kind: ValueKind;
  weight: number;
  status: "scored" | "unmeasured";
  reason: Reason | null;
  /** 잰 값. 못 쟀으면 null이다. 0으로 바꾸지 않는다 */
  value: number | null;
  /** 규칙 점수(0에서 1) */
  score: number | null;
  category: Category;
  /** 정비할 것에만 있다 */
  severity: Severity | null;
  /** 예상 효과. 그 규칙만 만점으로 바꿨을 때 기준 점수가 오르는 폭이다. 규칙을 쟀고 점수가 1 미만일 때만 있다 */
  gain: number | null;
  /** 합침 규칙의 근거 숫자. 도구별 규칙은 도구별 값에 싣고 여기는 비어 있다 */
  evidence: Evidence;
  /** 도구별 규칙에서만 낸다(도구 식별자의 차례). 합침 규칙에서는 빈 목록이다 */
  tools: ToolValue[];
  /** 도구별 값의 정비 후보를 합친 것 */
  candidates: string[];
}

export interface AxisScore {
  axis: Axis;
  /** 기준 점수(정수). 그 기준의 규칙을 하나도 못 쟀으면 null이다 */
  score: number | null;
  strengths: number;
  repairs: number;
}

export const AXES: readonly Axis[] = ["setup", "efficiency", "fit", "intensity"];
const CATEGORY_ORDER: readonly Category[] = ["strength", "average", "repair", "unmeasured"];
const SEVERITY_ORDER: readonly Severity[] = ["critical", "caution", "info"];
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Rated {
  status: "scored" | "unmeasured";
  reason: Reason | null;
  value: number | null;
  score: number | null;
  evidence: Evidence;
  tools: ToolValue[];
}

function rateMerged(spec: RuleSpec, measurement: Measurement): Rated {
  if (measurement.status === "unmeasured") return { status: "unmeasured", reason: measurement.reason, value: null, score: null, evidence: measurement.evidence, tools: [] };
  return { status: "scored", reason: null, value: measurement.value, score: ruleScore(measurement.value, spec.zeroAt, spec.fullAt), evidence: measurement.evidence, tools: [] };
}

/** 도구마다 점수를 낸 뒤 응답 수를 무게로 평균한다. 못 잰 도구는 평균에서 빼고, 남는 도구가 없으면 도구마다의 이유에서 하나를 고른다. */
function rateTools(spec: RuleSpec, id: ToolRuleId, tools: readonly ToolMeasured[]): Rated {
  const responses = new Map<ToolId, number>(tools.map((tool) => [tool.tool, tool.responses]));
  const values = tools.map((tool): ToolValue => {
    const measurement = tool.rules[id];
    const candidates = tool.candidates.filter((candidate) => candidate.rule === id).map((candidate) => candidate.id);
    if (measurement.status === "unmeasured") return { tool: tool.tool, status: "unmeasured", reason: measurement.reason, value: null, score: null, evidence: measurement.evidence, candidates };
    return { tool: tool.tool, status: "scored", reason: null, value: measurement.value, score: ruleScore(measurement.value, spec.zeroAt, spec.fullAt), evidence: measurement.evidence, candidates };
  });
  const measured = values.filter((value) => value.status === "scored");
  if (measured.length === 0) return { status: "unmeasured", reason: ruleReason(values.map((value) => value.reason!)), value: null, score: null, evidence: {}, tools: values };
  const weight = measured.reduce((sum, value) => sum + responses.get(value.tool)!, 0);
  const mean = (pick: (value: ToolValue) => number): number => measured.reduce((sum, value) => sum + pick(value) * responses.get(value.tool)!, 0) / weight;
  return { status: "scored", reason: null, value: mean((value) => value.value!), score: mean((value) => value.score!), evidence: {}, tools: values };
}

/** 점수를 경계와 견줄 때의 값. 끝자리 오차로 경계의 어느 쪽인지가 바뀌지 않게 맞춘 것이다. 점수가 없으면 null이다 */
const settled = (score: number | null): number | null => (score === null ? null : settleScore(score));

function categoryOf(spec: RuleSpec, rated: Rated, candidates: readonly string[]): Category {
  const score = settled(rated.score);
  // 못 잰 도구에서 나온 후보가 있으면 규칙을 못 쟀든, 다른 도구로 재서 점수가 1이든 정비할 것이다
  const fromUnmeasuredTool = rated.tools.some((tool) => tool.status === "unmeasured" && tool.candidates.length > 0);
  if (spec.tunable && (fromUnmeasuredTool || (score !== null && score < 1 && candidates.length > 0))) return "repair";
  if (score === null) return "unmeasured";
  return score >= 0.8 ? "strength" : score >= 0.6 ? "average" : "repair";
}

function severityOf(category: Category, rawScore: number | null, weight: number): Severity | null {
  const score = settled(rawScore);
  if (category !== "repair") return null;
  if (score === null) return "info";
  if (score < 0.3 && weight === 3) return "critical";
  return score < 0.6 && weight >= 2 ? "caution" : "info";
}

/** 정수로 반올림한 기준 점수. 잰 규칙이 없으면 null이다. */
function axisScore(rules: readonly { weight: number; score: number | null }[]): number | null {
  const measured = rules.filter((rule): rule is { weight: number; score: number } => rule.score !== null);
  if (measured.length === 0) return null;
  const weight = measured.reduce((sum, rule) => sum + rule.weight, 0);
  return roundHalfUp((measured.reduce((sum, rule) => sum + rule.weight * rule.score, 0) / weight) * 100);
}

function compareFindings(a: Finding, b: Finding, order: ReadonlyMap<RuleId, number>): number {
  const byTable = order.get(a.ruleId)! - order.get(b.ruleId)!;
  const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (byCategory !== 0) return byCategory;
  // 무게 × 점수가 수학으로 같은 둘이 끝자리 오차로 갈리지 않게 맞춘 값으로 견준다
  if (a.category === "strength") return settleScore(b.weight * b.score!) - settleScore(a.weight * a.score!) || byTable;
  if (a.category === "repair") {
    // 예상 효과가 없는 항목은 예상 효과가 있는 항목 뒤에 두고, 그런 항목끼리는 규칙 표의 순서다
    if (a.gain === null || b.gain === null) return (a.gain === null ? 1 : 0) - (b.gain === null ? 1 : 0) || byTable;
    return b.gain - a.gain || SEVERITY_ORDER.indexOf(a.severity!) - SEVERITY_ORDER.indexOf(b.severity!) || byTable;
  }
  return byTable;
}

export function scoreboard(measured: Measured): { axes: AxisScore[]; findings: Finding[] } {
  const tools = [...measured.tools].sort((a, b) => byText(a.tool, b.tool));
  const rated = new Map<RuleId, Rated>(RULES.map((spec) => [spec.id, isMerged(spec.id) ? rateMerged(spec, measured.merged[spec.id]) : rateTools(spec, spec.id as ToolRuleId, tools)]));
  const scores = new Map<Axis, number | null>(AXES.map((axis) => [axis, axisScore(RULES.filter((spec) => spec.axis === axis).map((spec) => ({ weight: spec.weight, score: rated.get(spec.id)!.score })))]));

  const findings = RULES.map((spec): Finding => {
    const rule = rated.get(spec.id)!;
    const candidates = rule.tools.flatMap((tool) => tool.candidates);
    const category = categoryOf(spec, rule, candidates);
    // 그 규칙만 만점으로 바꿔 기준 점수를 다시 계산하고(반올림까지) 지금 기준 점수를 뺀다. 화면에 보이는 점수의 차이와 늘 맞는다
    const raised = RULES.filter((other) => other.axis === spec.axis).map((other) => ({ weight: other.weight, score: other.id === spec.id ? 1 : rated.get(other.id)!.score }));
    const gain = rule.score !== null && settleScore(rule.score) < 1 ? axisScore(raised)! - scores.get(spec.axis)! : null;
    return { ruleId: spec.id, axis: spec.axis, kind: spec.kind, weight: spec.weight, status: rule.status, reason: rule.reason, value: rule.value, score: rule.score, category, severity: severityOf(category, rule.score, spec.weight), gain, evidence: rule.evidence, tools: rule.tools, candidates };
  });

  const axes = AXES.map((axis): AxisScore => {
    const own = findings.filter((finding) => finding.axis === axis);
    return { axis, score: scores.get(axis)!, strengths: own.filter((finding) => finding.category === "strength").length, repairs: own.filter((finding) => finding.category === "repair").length };
  });
  const order = new Map<RuleId, number>(RULES.map((spec, index) => [spec.id, index]));
  return { axes, findings: findings.sort((a, b) => compareFindings(a, b, order)) };
}

/** 점수 구간의 사람 요청이 이만큼에 못 미치거나 사용한 날이 이만큼에 못 미치면 AQ와 등급을 내지 않는다(설계 11.4의 7) */
export const MIN_REQUESTS_FOR_AQ = 20;
export const MIN_DAYS_FOR_AQ = 3;

/** AQ를 내지 않은 까닭. 기록이 적거나(사람 요청, 사용한 날) 잰 기준이 하나도 없다 */
export type Withheld = "too_few_requests" | "too_few_days" | "no_axes";

export interface Overall {
  aq: number | null;
  grade: Grade | null;
  tier: 1 | 2 | 3 | 4 | 5 | null;
  withheld: Withheld[];
  /** 못 재서 AQ에서 빠진 기준 */
  missingAxes: Axis[];
}

/** 화면에 보이는 기준 점수(정수)의 평균을 정수로 반올림한다. 사용자가 화면의 숫자로 검산할 수 있다. */
export function overall(axes: readonly AxisScore[], humanRequests: number, activeDays: number): Overall {
  const measured = axes.flatMap((axis) => (axis.score === null ? [] : [axis.score]));
  const missingAxes = axes.filter((axis) => axis.score === null).map((axis) => axis.axis);
  const withheld: Withheld[] = [];
  if (humanRequests < MIN_REQUESTS_FOR_AQ) withheld.push("too_few_requests");
  if (activeDays < MIN_DAYS_FOR_AQ) withheld.push("too_few_days");
  if (measured.length === 0) withheld.push("no_axes");
  if (withheld.length > 0) return { aq: null, grade: null, tier: null, withheld, missingAxes };
  const aq = roundHalfUp(measured.reduce((sum, score) => sum + score, 0) / measured.length);
  return { aq, ...gradeOf(aq), withheld, missingAxes };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 13개, 시험 341개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/scoreboard.test.ts src/core/scoreboard.ts
git commit -m "feat: 기준 점수·AQ·분류를 내는 점수판 추가"
```

---

### Task 19: 입력 묶음에서 평가까지(evaluate)와 합성 사용자 다섯

**Files:**
- Create: `src/core/evaluate.ts`
- Test: `test/core/evaluate.test.ts`
- Test: `test/core/personas.test.ts`
- Test: `test/helpers/evaluation.ts`
- Test: `test/helpers/personas.ts`

**Interfaces:**
- Consumes: 과제 5의 `toolTotals`, 과제 7의 `usageRules`, 과제 8의 `projectLookup`, `projectUsage`, `intensityRules`, 과제 9의 `mergedSetupRules`, `setupToolRules`, `highestMainVersion`, 과제 11의 `mergedFitRules`, `fitToolRules`, 과제 13의 `usedSkillNames`, `calledMcpNames`, `sessionListings`, 과제 14의 `recordMap`, 과제 15의 `judgeSkills`, 과제 16의 `judgeServers`, 과제 17의 `candidatesOf`, 과제 18의 `scoreboard`, `overall`. 1단계의 `makeWindows`.
- Produces: `ToolInput { tool; summaries; coverage; shellTools; complete: { skills: boolean; mcp: boolean }; setup }`, `EvaluationInput { clock: { nowMs; timeZone }; tools; projects; normalizedCwds; installs; self }`, `ToolEvaluation { tool; scored; inCalendar; totals; skills; servers }`, `Evaluation { rulesVersion; windows; tools; score; axes; findings; candidates; safeguards; missingInstructions; worstOverlap; projects }`, `evaluate(input: EvaluationInput): Evaluation`(`src/core/evaluate.ts`). 시험 도우미 `CLOCK`, `claudeTool`, `watched`, `evaluationInput`(`test/helpers/evaluation.ts`), `Persona`, `personaInput`, `PERSONAS`(`test/helpers/personas.ts`).

입력 묶음(설계 12.1)에서 평가까지를 한 함수로 잇는다. 3부가 이 결과에 문구, 사용 기록, 알림을 붙여 평가 결과(설계 12.2)를 조립한다.

- **입력 묶음.** 평가 시계, 도구마다의 세션 요약과 관측 범위와 셋팅 사실, 프로젝트 목록, 「기록에 적힌 작업 폴더 → 정규화한 경로」의 표, 지난 점검까지의 관측 기록, 이 도구 자신이다. 시계를 읽는 일과 경로를 푸는 일은 입력을 조립하는 쪽(과제 20)이 끝내고 넘긴다. `evaluate`는 구간을 평가 시계에서 만든다.
- **점수에 넣는 도구.** 점수 구간에 응답이 하나라도 있는 도구에서만 규칙을 재고 설치를 판정한다(설계 9.3, 11.3). 그렇지 않은 도구는 `tools`에 `scored: false`로만 남고, 그 도구의 설치는 판정하지 않으며 정비 후보도 없다. 수집 구간에 응답이 있으면 달력에 넣는 도구다(`inCalendar`).
- **AQ를 낼지.** 점수에 넣는 도구의 사람 요청의 합과 사용한 날의 합집합으로 정한다.
- **결정성.** 도구는 식별자의 차례로 다루고, 앞 과제의 함수들이 목록을 정해진 차례로 낸다. 같은 입력 묶음이면 결과의 JSON 글이 글자 하나 다르지 않다. 세션 요약, 스킬, 서버, 프로젝트, 관측 기록의 차례를 뒤집어 넣어도 같다. 이름, 범위, 실제 경로가 모두 같고 플러그인만 다른 스킬 위치 둘, 켜짐만 다른 스킬 위치 둘과 서버 둘, 세션 ID가 같은 주 세션 요약 둘의 차례를 뒤집어도 같다(과제 5, 15, 16). 입력을 고치지 않는다. 캐시를 켜고 끈 경우는 과제 20이 본다.
- 관측 기록을 갱신해 저장하는 일은 점수에 넣는 도구인지와 상관없이 하고(설계 18.1), 3부의 명령이 과제 4의 함수로 한다. `evaluate`는 지난 점검까지의 기록을 읽기만 한다.

**합성 사용자 다섯**(설계 21.1 「점수」). 규칙마다 바라는 값을 적으면 그 값이 나오는 세션 요약과 셋팅 사실을 짓는 도우미(`personaInput`)로 등급 D부터 S까지의 사용자를 만들고, `evaluate`를 거쳐 그 등급이 나오는지 본다. 지어낸 기록이 규칙에 제대로 이어졌는지는 적은 값과 잰 값을 견줘 확인한다. 등급의 경계(49와 50, 64와 65, 79와 80, 89와 90)는 과제 6의 시험이 본다. 등급만 보면 문턱에서 먼 사용자의 작은 점수 변화를 놓친다(다섯의 AQ는 100, 87, 71, 56, 12다). 그래서 다섯 사용자의 AQ와 기준 점수 넷도 고정해 둔다. 그 값이 옳은지는 규칙마다의 시험이 보고, 이 시험은 달라졌는지를 본다.

기록의 숫자에서 시작하는 경계도 여기서 본다. 캐시 읽기 820/1000과 도구 오류 40/1000은 규칙 점수가 수학으로 0.8이라서 잘하고 있는 것이어야 한다(과제 6의 경계와 견줄 때의 맞춤). 캐시 읽기 19468/30001과 도구 오류 6370/66197만 재진 효율의 기준 점수는 30이고 예상 효과는 32와 39다. 정확한 분수로 계산한 값이다(과제 18). E5를 `watching`으로 못 쟀는데 안 쓴 것이 확인된 스킬이 둘인 입력에서는 후보 둘이 나오고 규칙이 정비할 것에 실린다(설계 21.1). 정체가 같은 MCP 서버 사실 둘은 설치 하나로 세어서, 그 서버를 부른 기록이 있어도 E6은 `too_little`이고 S5의 켜진 서버는 하나다(과제 16).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/evaluate.test.ts`(새 파일):

```ts
// 입력 묶음에서 평가까지를 시험한다. 규칙 스물둘이 제 입력에 이어졌는지, 점수에 넣는 도구에서만 재는지, 같은 입력이면 글자 하나 다르지 않은지(설계 9.3, 12.1, 12.2, 21.1 「결정성」)
import { describe, expect, it } from "vitest";
import type { ToolId } from "../../src/adapters/types.ts";
import { evaluate, type EvaluationInput } from "../../src/core/evaluate.ts";
import { RULES } from "../../src/core/rules.ts";
import { instructionFile, instructions, mcpServer, plugin, project, skill } from "../helpers/facts.ts";
import { CLOCK, claudeTool, evaluationInput, watched } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

const APP = "/work/app";
const SESSIONS: SummaryInput[] = [
  {
    sessionId: "a",
    cwd: APP,
    instructionChars: { ascii: 4000, other: 3000 },
    days: {
      "2026-11-10": {
        responses: 20,
        humanRequests: 10,
        tokens: { input: 100, cacheRead: 800, cacheWrite: 100, output: 50 },
        tools: { Read: { calls: 30, results: 30, errors: 3 }, Bash: { calls: 10, results: 10, errors: 9 } },
        hooks: { PreToolUse: { runs: 100, failures: 1 } },
        efforts: { high: 20 },
        autoCompactions: 1,
        subagentCalls: 1,
      },
    },
  },
  { sessionId: "b", cwd: APP, days: { "2026-11-11": { responses: 20, humanRequests: 10, tools: { Read: { calls: 20, results: 20 } }, efforts: { xhigh: 20 }, mcpConnectionFailure: true } } },
  { sessionId: "c", cwd: APP, days: { "2026-11-12": { responses: 20, humanRequests: 10, efforts: { max: 20 } } } },
];
const IDLE_SKILL = skill("idle");
const DB = mcpServer("db");
const SETUP = {
  globalInstructions: instructions({ files: [instructionFile("/home/u/.claude/CLAUDE.md", { bytes: 300 })], lineHashes: ["g1", "g2"] }),
  projects: [project(APP, { instructions: instructions({ files: [instructionFile(`${APP}/CLAUDE.md`)], lineHashes: ["g1", "p1"] }) })],
  skills: [IDLE_SKILL],
  mcpServers: [DB],
};
const INPUT = (): EvaluationInput => evaluationInput([claudeTool({ sessions: SESSIONS, setup: SETUP })], { installs: watched(IDLE_SKILL, DB) });
const finding = (result: ReturnType<typeof evaluate>, id: string) => result.findings.find((f) => f.ruleId === id)!;
const toolValue = (result: ReturnType<typeof evaluate>, id: string) => finding(result, id).tools[0]!;

describe("evaluate", () => {
  it("규칙 스물둘을 한 번씩 재고, 구간과 점수에 넣는 도구를 함께 낸다", () => {
    const result = evaluate(INPUT());
    expect(result.findings.map((f) => f.ruleId).sort()).toEqual(RULES.map((rule) => rule.id).sort());
    expect(result.rulesVersion).toBe("1.0.0");
    expect(result.windows).toEqual({ today: "2026-11-13", score: { from: "2026-10-15", to: "2026-11-13" }, collect: { from: "2026-10-10", to: "2026-11-13" } });
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.inCalendar, tool.totals.responses])).toEqual([["claude-code", true, true, 60]]);
  });
  it("도구를 합쳐서 재는 규칙은 값과 근거 숫자를 규칙에 싣고 도구별 값은 비운다", () => {
    const result = evaluate(INPUT());
    expect(finding(result, "S1")).toMatchObject({ status: "scored", value: 1, score: 1, tools: [], evidence: { tools: 1, withInstructions: 1 } });
    expect(finding(result, "S2")).toMatchObject({ value: 1 });
    expect(finding(result, "S3")).toMatchObject({ value: 0, score: 1 });
    expect(finding(result, "F3")).toMatchObject({ value: 1, evidence: { targets: 1, withInstructions: 1 } });
    expect(finding(result, "F4")).toMatchObject({ value: 0.5, score: 0, evidence: { comparedProjects: 1, globalLines: 2, overlappingLines: 1 } });
    expect(finding(result, "F6")).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    expect(finding(result, "I1")).toMatchObject({ value: 3 });
    expect(finding(result, "I2")).toMatchObject({ value: 10 });
    expect(finding(result, "I3")).toMatchObject({ value: 2, evidence: { humanRequests: 30, toolCalls: 60 } });
    expect(finding(result, "I4")).toMatchObject({ value: 1, score: 0 });
    expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: true }]);
    expect(result.worstOverlap).toEqual({ tool: "claude-code", normRoot: APP });
    expect(result.missingInstructions).toEqual([]);
    expect(result.projects.projects.map((use) => [use.project.normRoot, use.total])).toEqual([[APP, 3]]);
  });
  it("도구마다 재는 규칙은 도구별 값에 그 도구의 값과 근거 숫자를 싣는다", () => {
    const result = evaluate(INPUT());
    expect(toolValue(result, "S4")).toMatchObject({ tool: "claude-code", status: "scored", value: 0.01, evidence: { failures: 1, runs: 100 } });
    expect(toolValue(result, "S5")).toMatchObject({ value: 1 / 3, score: 0, evidence: { enabledServers: 1, failedSessions: 1, mainSessions: 3 } });
    expect(toolValue(result, "E1")).toMatchObject({ value: 0.8 });
    expect(toolValue(result, "E2")).toMatchObject({ value: 0.06, evidence: { errors: 3, results: 50 } });
    expect(toolValue(result, "E3")).toMatchObject({ value: 1 / 3 });
    expect(toolValue(result, "E4")).toMatchObject({ value: 4000, score: 1, evidence: { sampledSessions: 1, skippedSessions: 2 } });
    expect(toolValue(result, "E7")).toMatchObject({ value: 0, score: 1 });
    expect(toolValue(result, "F1")).toMatchObject({ value: 40 / 60 });
    expect(toolValue(result, "F2")).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(toolValue(result, "F5")).toMatchObject({ value: 0, evidence: { skillKinds: 1 } });
    expect(finding(result, "E1")).toMatchObject({ status: "scored", value: 0.8, evidence: {} });
  });
  it("설치를 판정해 E5와 E6을 재고, 정비 후보를 그 규칙과 도구별 값에 잇는다", () => {
    const result = evaluate(INPUT());
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["A1:claude-code:idle", "A3:claude-code:db"]);
    expect(finding(result, "E5")).toMatchObject({ status: "unmeasured", reason: "too_little", category: "repair", severity: "info", gain: null, candidates: ["A1:claude-code:idle"] });
    expect(toolValue(result, "E5")).toMatchObject({ reason: "too_little", candidates: ["A1:claude-code:idle"], evidence: { enabled: 1, judgeable: 1, judged: 1, unused: 1 } });
    expect(finding(result, "E6")).toMatchObject({ reason: "too_little", category: "repair", candidates: ["A3:claude-code:db"] });
    expect(result.tools[0]!.skills.map((bundle) => [bundle.positions[0]!.name, bundle.verdict])).toEqual([["idle", "unused"]]);
    expect(result.tools[0]!.servers.map((judged) => [judged.server.name, judged.verdict])).toEqual([["db", "unused"]]);
  });
  it("E5를 watching으로 못 쟀어도 안 쓴 것이 확인된 스킬의 후보는 나오고 규칙을 정비할 것에 싣는다", () => {
    // 켜져 있는 스킬 열하나 가운데 둘만 오래 지켜봤다. 판정된 것이 절반에 못 미쳐 E5는 못 재지만 그 둘은 끄자고 할 수 있다
    const idle = [skill("idle-a"), skill("idle-b")];
    const fresh = Array.from({ length: 9 }, (_, i) => skill(`fresh-${i + 1}`));
    const result = evaluate(evaluationInput([claudeTool({ sessions: SESSIONS, setup: { ...SETUP, skills: [...idle, ...fresh], mcpServers: [] } })], { installs: watched(...idle) }));
    expect(finding(result, "E5")).toMatchObject({ status: "unmeasured", reason: "watching", value: null, score: null, category: "repair", severity: "info", gain: null, candidates: ["A1:claude-code:idle-a", "A1:claude-code:idle-b"] });
    expect(toolValue(result, "E5").evidence).toEqual({ enabled: 11, judgeable: 11, judged: 2, structural: 0, unused: 2, used: 0 });
  });
  it("정체가 같은 MCP 서버 사실 둘은 설치 하나로 센다. E6이 서버 하나로 재지지 않는다", () => {
    // 스캐너가 같은 플러그인을 두 길로 찾은 경우다. 그 서버를 부른 기록이 있어도 판정할 수 있는 서버는 하나라서 too_little이다
    const twin = () => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", recordNames: ["plugin:r:db", "plugin_r_db"] });
    const sessions: SummaryInput[] = [{ sessionId: "dup", cwd: APP, days: { "2026-11-12": { responses: 1, mcpCalls: { plugin_r_db: 1 } } } }];
    const setup = { mcpServers: [twin(), twin()], plugins: [plugin("r@skills-dir", { components: ["mcpServers"] })] };
    const result = evaluate(evaluationInput([claudeTool({ sessions, setup })], { installs: watched(twin()) }));
    expect(finding(result, "E6")).toMatchObject({ status: "unmeasured", reason: "too_little" });
    expect(toolValue(result, "E6").evidence).toEqual({ enabled: 1, judgeable: 1, judged: 1, structural: 0, unused: 0, used: 1 });
    expect(toolValue(result, "S5").evidence).toMatchObject({ enabledServers: 1 });
  });
  it("첫 점검에서는 관측 기록이 없어 MCP 서버가 쓰는지 모름이고 서버 막기 후보가 없다", () => {
    const result = evaluate({ ...INPUT(), installs: null });
    expect(result.tools[0]!.servers.map((judged) => judged.verdict)).toEqual(["unknown"]);
    expect(result.candidates.map((candidate) => candidate.unit)).not.toContain("A3");
  });
  it("관측이 빠짐없지 않은 지표의 규칙만 incomplete가 된다", () => {
    const tool = claudeTool({ sessions: SESSIONS, setup: { ...SETUP, skills: Array.from({ length: 6 }, (_, i) => skill(`s${i}`)) }, complete: { skills: false } });
    const result = evaluate(evaluationInput([tool], { installs: watched(DB) }));
    expect(finding(result, "E5")).toMatchObject({ status: "unmeasured", reason: "incomplete", category: "unmeasured" });
    expect(finding(result, "E6").reason).toBe("too_little");
  });
  it("이 도구 자신은 정비 후보에서 뺀다", () => {
    const result = evaluate({ ...INPUT(), self: { skillNames: ["idle"], pluginNames: [], skillRealPaths: [] } });
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["A3:claude-code:db"]);
  });
  it("기록의 숫자에서 낸 점수가 분류의 경계와 같으면 경계에 든다", () => {
    // 캐시 읽기 820/1000과 오류 40/1000은 규칙 점수가 꼭 0.8이다. 나눗셈의 끝자리 오차 때문에 보통으로 떨어지지 않는다
    const sessions: SummaryInput[] = [{ sessionId: "edge", cwd: APP, days: { "2026-11-12": { responses: 1, tokens: { input: 180, cacheRead: 820, cacheWrite: 0 }, tools: { Read: { calls: 1000, results: 1000, errors: 40 } } } } }];
    const result = evaluate(evaluationInput([claudeTool({ sessions })]));
    expect(finding(result, "E1")).toMatchObject({ value: 0.82, category: "strength" });
    expect(finding(result, "E2")).toMatchObject({ value: 0.04, category: "strength" });
  });
  it("기록의 숫자에서 낸 기준 점수와 예상 효과는 정확한 분수로 계산한 것과 같다", () => {
    // 캐시 읽기 19468/30001, 도구 오류 6370/66197. 효율에서 이 둘만 재진다. 정확한 기준 점수는 30.5 - 1/(30001 × 66197)이라서 30이다
    const sessions: SummaryInput[] = [{ sessionId: "rational", days: { "2026-11-13": { responses: 1, tokens: { input: 10533, cacheRead: 19468 }, tools: { Read: { calls: 66197, results: 66197, errors: 6370 } } } } }];
    const result = evaluate(evaluationInput([claudeTool({ sessions })]));
    expect(result.findings.filter((f) => f.axis === "efficiency" && f.status === "scored").map((f) => f.ruleId).sort()).toEqual(["E1", "E2"]);
    expect(result.axes.find((axis) => axis.axis === "efficiency")!.score).toBe(30);
    expect([finding(result, "E1").gain, finding(result, "E2").gain]).toEqual([32, 39]);
  });
  it("기준 점수와 AQ, 등급을 낸다. 화면의 숫자로 검산할 수 있다", () => {
    const result = evaluate(INPUT());
    expect(result.axes.map((axis) => axis.axis)).toEqual(["setup", "efficiency", "fit", "intensity"]);
    const scores = result.axes.map((axis) => axis.score!);
    expect(scores.every((score) => Number.isInteger(score) && score >= 0 && score <= 100)).toBe(true);
    expect(result.score.aq).toBe(Math.floor(scores.reduce((sum, score) => sum + score, 0) / scores.length + 0.5));
    expect(result.score).toMatchObject({ withheld: [], missingAxes: [] });
    expect(result.score.grade).not.toBeNull();
  });
});

describe("점수에 넣는 도구", () => {
  const before: SummaryInput = { cwd: APP, days: { "2026-10-11": { responses: 50, humanRequests: 30 } } };

  it("점수 구간에 응답이 없는 도구는 달력에만 넣는다. 그 도구의 설치는 판정하지 않고 정비 후보도 내지 않는다", () => {
    const result = evaluate(evaluationInput([claudeTool({ sessions: [before], setup: SETUP })], { installs: watched(IDLE_SKILL, DB) }));
    expect(result.tools.map((tool) => [tool.scored, tool.inCalendar, tool.skills, tool.servers])).toEqual([[false, true, [], []]]);
    expect(result.candidates).toEqual([]);
    expect(finding(result, "E5")).toMatchObject({ status: "unmeasured", reason: "no_data", tools: [] });
    expect(finding(result, "S1")).toMatchObject({ status: "unmeasured", reason: "no_data" });
    expect(finding(result, "I1")).toMatchObject({ status: "scored", value: 0 });
    expect(result.score).toMatchObject({ aq: null, grade: null, tier: null, withheld: ["too_few_requests", "too_few_days"] });
  });
  it("도구가 하나도 없어도 평가를 낸다. 도구별 규칙은 no_data이고 AQ는 없다", () => {
    const result = evaluate(evaluationInput([]));
    expect(result.tools).toEqual([]);
    expect(result.findings).toHaveLength(22);
    expect(result.findings.filter((f) => f.tools.length > 0)).toEqual([]);
    expect(finding(result, "S4").reason).toBe("no_data");
    expect(result.score.aq).toBeNull();
  });
  it("기록이 같아도 평가 시계의 날짜가 다르면 구간이 달라진다", () => {
    const later = evaluate({ ...INPUT(), clock: { nowMs: CLOCK.nowMs + 40 * 24 * 60 * 60 * 1000, timeZone: CLOCK.timeZone } });
    expect(later.windows.today).toBe("2026-12-23");
    expect(later.tools.map((tool) => [tool.scored, tool.inCalendar])).toEqual([[false, false]]);
  });
  it("도구는 식별자의 차례로 낸다. 점수에 넣는 도구만 도구별 값에 싣는다", () => {
    const codex = { ...claudeTool({ sessions: [before] }), tool: "codex" as ToolId };
    const result = evaluate(evaluationInput([codex, claudeTool({ sessions: SESSIONS, setup: SETUP })], { projects: SETUP.projects }));
    expect(result.tools.map((tool) => [tool.tool, tool.scored])).toEqual([["claude-code", true], ["codex", false]]);
    expect(finding(result, "E1").tools.map((value) => value.tool)).toEqual(["claude-code"]);
    expect(finding(result, "S1")).toMatchObject({ evidence: { tools: 1 } });
  });
});

describe("결정성", () => {
  const reversed = <T>(list: readonly T[]): T[] => [...list].reverse();

  it("같은 입력 묶음을 연달아 두 번 평가하면 글자 하나 다르지 않다", () => {
    expect(JSON.stringify(evaluate(INPUT()))).toBe(JSON.stringify(evaluate(INPUT())));
  });
  it("세션 요약, 스킬, 서버, 프로젝트, 관측 기록의 차례를 뒤집어 넣어도 같다", () => {
    const skills = [skill("zeta"), skill("alpha"), skill("mid", { scope: "project", projectRoot: APP, path: `${APP}/.claude/skills/mid` })];
    const servers = [mcpServer("zeta"), mcpServer("alpha"), mcpServer("alpha", { scope: "project", projectRoot: APP, definitionHash: "other" })];
    const projects = [...SETUP.projects, project("/work/lib"), project("/work/gone", { exists: false, kind: "folder" })];
    const sessions = [...SESSIONS, { sessionId: "d", cwd: "/work/lib", days: { "2026-11-01": { responses: 5, humanRequests: 2, skillSignals: { zeta: { tool: 1 } } } } }];
    const build = (flip: boolean): EvaluationInput => {
      const order = <T>(list: readonly T[]): T[] => (flip ? reversed(list) : [...list]);
      const setup = { ...SETUP, skills: order(skills), mcpServers: order(servers), projects: order(projects) };
      return evaluationInput([claudeTool({ sessions: order(sessions), setup })], { installs: order(watched(...skills, ...servers)), projects: order(projects) });
    };
    expect(JSON.stringify(evaluate(build(true)))).toBe(JSON.stringify(evaluate(build(false))));
  });
  it("이름, 범위, 실제 경로가 모두 같고 플러그인만 다른 스킬 위치의 차례를 뒤집어 넣어도 같다", () => {
    // 같은 원본을 두 마켓에서 깐 플러그인이 그렇다. 스캐너는 설치 ID마다 스킬 사실을 하나씩 낸다
    const shared = (pluginId: string) => skill("p:s", { scope: "plugin", pluginId, path: "/plugins/shared/skills/s" });
    const pair = [shared("p@a"), shared("p@b")];
    const run = (skills: typeof pair): string => JSON.stringify(evaluate(evaluationInput([claudeTool({ sessions: SESSIONS, setup: { ...SETUP, skills, plugins: [plugin("p@a"), plugin("p@b")] } })], { installs: watched(...pair) })));
    expect(run(reversed(pair))).toBe(run(pair));
  });
  it("이름, 범위, 경로, 플러그인이 모두 같고 켜짐만 다른 스킬 위치 둘과 서버 둘의 차례를 뒤집어 넣어도 같다", () => {
    // 스킬 폴더에 둔 플러그인을 설치 기록에도 적으면 스캐너가 같은 설치를 두 길로 찾는다. 한쪽은 프로젝트의 설정만 봐서 꺼져 있다
    const twinSkill = (enabled: boolean) => skill("r:u", { scope: "plugin", pluginId: "r@skills-dir", path: "/home/u/.claude/skills/r/skills/u", enabled, listed: enabled });
    const twinServer = (enabled: boolean) => mcpServer("db", { scope: "plugin", pluginId: "r@skills-dir", recordNames: ["plugin:r:db", "plugin_r_db"], enabled });
    const skills = [twinSkill(true), twinSkill(false)];
    const servers = [twinServer(true), twinServer(false)];
    const run = (flip: boolean): string => {
      const order = <T>(list: readonly T[]): T[] => (flip ? reversed(list) : [...list]);
      const setup = { ...SETUP, skills: order(skills), mcpServers: order(servers), plugins: [plugin("r@skills-dir", { components: ["skills", "mcpServers"] })] };
      return JSON.stringify(evaluate(evaluationInput([claudeTool({ sessions: SESSIONS, setup })], { installs: watched(...skills, ...servers) })));
    };
    expect(run(true)).toBe(run(false));
  });
  it("세션 ID가 같은 주 세션 요약 둘의 차례를 뒤집어 넣어도 같다", () => {
    const twins: SummaryInput[] = [
      { sessionId: "same", cwd: APP, days: { "2026-11-10": { responses: 3, humanRequests: 2, autoCompactions: 1 } } },
      { sessionId: "same", cwd: "/work/lib", days: { "2026-11-11": { responses: 5, humanRequests: 1 } } },
    ];
    const run = (sessions: SummaryInput[]): string => JSON.stringify(evaluate(evaluationInput([claudeTool({ sessions, setup: SETUP })])));
    expect(run(reversed(twins))).toBe(run(twins));
  });
  it("입력을 고치지 않는다", () => {
    const input = INPUT();
    const before = JSON.stringify(input);
    evaluate(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
```

`test/core/personas.test.ts`(새 파일):

```ts
// 합성 사용자 다섯이 기대한 등급을 받는지 시험한다. 기록과 셋팅에서 등급까지 한 번에 이어 본다(설계 11.6, 21.1 「점수」)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { PERSONAS, personaInput, type Persona } from "../helpers/personas.ts";

const run = (persona: Persona) => evaluate(personaInput(persona));
const finding = (result: ReturnType<typeof evaluate>, id: string) => result.findings.find((f) => f.ruleId === id)!;

describe("합성 사용자", () => {
  it.each([
    ["S", 5],
    ["A", 4],
    ["B", 3],
    ["C", 2],
    ["D", 1],
  ] as const)("등급 %s의 사용자는 그 등급을 받는다", (grade, tier) => {
    const result = run(PERSONAS[grade]);
    expect({ grade: result.score.grade, tier: result.score.tier, withheld: result.score.withheld }).toEqual({ grade, tier, withheld: [] });
  });
  it.each([
    ["S", 100, [100, 100, 100, 100]],
    ["A", 87, [98, 88, 88, 75]],
    ["B", 71, [87, 68, 68, 61]],
    ["C", 56, [79, 55, 48, 41]],
    ["D", 12, [7, 19, 8, 14]],
  ] as const)("등급 %s의 사용자는 AQ %i이고 기준 점수는 셋팅, 효율, 상황 적합, 강도의 차례로 %j다", (grade, aq, axes) => {
    // 등급만 보면 문턱에서 먼 사용자의 작은 점수 변화를 놓친다. 기준 점수까지 고정해 둔다. 값이 옳은지는 규칙마다의 시험이 보고, 이 시험은 달라졌는지를 본다
    const result = run(PERSONAS[grade]);
    expect(result.axes.map((axis) => axis.score)).toEqual(axes);
    expect(result.score.aq).toBe(aq);
    expect(result.score.aq).toBe(Math.floor(axes.reduce((sum, score) => sum + score, 0) / axes.length + 0.5));
  });
  it("등급이 높은 사용자일수록 AQ가 높다", () => {
    const aq = (["D", "C", "B", "A", "S"] as const).map((grade) => run(PERSONAS[grade]).score.aq!);
    expect([...aq].sort((a, b) => a - b)).toEqual(aq);
    expect(new Set(aq).size).toBe(5);
  });
  it("적은 값이 그대로 잰 값으로 나온다. 지어낸 기록이 규칙에 제대로 이어졌는지 본다", () => {
    const b = PERSONAS.B;
    const result = run(b);
    const value = (id: string): number => finding(result, id).value!;
    expect(result.findings.filter((f) => f.status === "unmeasured").map((f) => f.ruleId)).toEqual([]);
    expect([value("I1"), value("I2"), value("I3"), value("I4")]).toEqual([b.activeDays, b.requestsPerDay, b.callsPerRequest, b.projects]);
    expect([value("S1"), value("S2"), value("S3")]).toEqual([1, 1, b.problems]);
    expect(value("S4")).toBeCloseTo(b.hookFailures / 1000, 12);
    expect(value("S5")).toBeCloseTo(b.mcpFailedSessions / 12, 12);
    expect(value("E1")).toBeCloseTo(b.cacheRead / 1000, 12);
    expect(value("E2")).toBeCloseTo(b.toolErrors / 1000, 12);
    expect(value("E3")).toBeCloseTo(b.compactions / 12, 12);
    expect(value("E4")).toBe(b.instructionTokens);
    expect(value("E5")).toBeCloseTo(b.unusedSkills / 10, 12);
    expect(value("E6")).toBeCloseTo(b.unusedServers / 4, 12);
    // 거절한 도구 실행은 정수로 맞춰 넣으므로 소수 둘째 자리까지 본다
    expect(value("E7")).toBeCloseTo(b.stoppedPerThousand / 1000, 2);
    expect(value("F1")).toBeCloseTo(b.highEffort / 1000, 12);
    // 자동 압축은 세션마다 하나씩 나눠 두었으므로 압축이 있었던 세션의 수는 압축 횟수와 같다(열둘까지)
    expect(value("F2")).toBeCloseTo(b.delegatedSessions / Math.min(b.compactions, 12), 12);
    expect(value("F3")).toBeCloseTo(b.guidedProjects / b.projects, 12);
    expect(value("F4")).toBeCloseTo(b.overlappingLines / 20, 12);
    expect(value("F5")).toBeCloseTo(b.copiedSkills / 10, 12);
    expect(value("F6")).toBe(b.conflicts);
  });
});
```

`test/helpers/evaluation.ts`(새 파일):

```ts
// 시험에서 평가의 입력 묶음을 손으로 짓는 도구. 평가 시계는 2026-11-13 12:00(서울)이다
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
import type { EvaluationInput, ToolInput } from "../../src/core/evaluate.ts";
import { NO_SELF } from "../../src/core/installs/candidates.ts";
import type { ClaudeSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts } from "./facts.ts";
import { summary, type SummaryInput } from "./summaries.ts";

/** 점수 구간은 10-15부터 11-13까지, 수집 구간은 10-10부터다. 14일 넘게 전은 10-29와 그 앞이다 */
export const CLOCK = { nowMs: Date.UTC(2026, 10, 13, 3, 0), timeZone: "Asia/Seoul" };

export interface ClaudeToolInput {
  sessions?: SummaryInput[];
  setup?: Partial<ClaudeSetupFacts>;
  coverage?: ToolCoverage;
  complete?: Partial<ToolInput["complete"]>;
}

/** Claude Code 하나의 입력. 관측은 빠짐없고 셸 명령 도구는 Bash와 PowerShell이다 */
export function claudeTool(input: ClaudeToolInput = {}): ToolInput {
  return {
    tool: "claude-code",
    summaries: (input.sessions ?? []).map((session) => summary(session)),
    coverage: input.coverage ?? CLAUDE_COVERAGE,
    shellTools: ["Bash", "PowerShell"],
    complete: { skills: true, mcp: true, ...input.complete },
    setup: facts(input.setup),
  };
}

/** 같은 정체로 9월 1일부터 지켜본 관측 기록. 정체가 없는 서버는 적지 않는다 */
export function watched(...installs: (SkillFact | McpFact)[]): InstallRecord[] {
  return installs.flatMap((install) => (install.installKey === null ? [] : [{ key: install.installKey, firstSeen: "2026-09-01", appeared: false }]));
}

/** 입력 묶음. 프로젝트 목록은 첫 도구의 셋팅 사실의 것이고, 세션의 작업 폴더는 이미 정규화한 꼴로 적은 것으로 본다. 관측 기록을 주지 않으면 첫 점검이다 */
export function evaluationInput(tools: ToolInput[], input: Partial<Omit<EvaluationInput, "tools">> = {}): EvaluationInput {
  const projects = input.projects ?? tools[0]?.setup.projects ?? [];
  return {
    clock: CLOCK,
    tools,
    projects,
    normalizedCwds: Object.fromEntries(projects.flatMap((project) => project.cwds.map((cwd) => [cwd, cwd]))),
    installs: null,
    self: NO_SELF,
    ...input,
  };
}
```

`test/helpers/personas.ts`(새 파일):

```ts
// 합성 사용자를 짓는 도구. 규칙마다 바라는 값을 적으면 그 값이 나오는 세션 요약과 셋팅 사실을 만든다(설계 21.1 「점수」)
import type { EvaluationInput } from "../../src/core/evaluate.ts";
import type { SetupProblem } from "../../src/scan/types.ts";
import { claudeTool, evaluationInput, watched } from "./evaluation.ts";
import { instructionFile, instructions, mcpServer, project, skill } from "./facts.ts";
import type { DayInput, SummaryInput } from "./summaries.ts";

/** 규칙마다 바라는 값. 세션은 열둘, 스킬은 열, MCP 서버는 넷으로 고정한다 */
export interface Persona {
  /** I1 사용한 날(1에서 30) */
  activeDays: number;
  /** I2 하루의 사람 요청 */
  requestsPerDay: number;
  /** I3 요청 하나의 도구 호출 */
  callsPerRequest: number;
  /** I4 프로젝트 수(1, 2, 3, 4, 6, 12 가운데 하나. 세션 열둘을 고르게 나눈다) */
  projects: number;
  /** S1 전역 지침이 있다 */
  globalInstructions: boolean;
  /** S2 기본 모드가 권한 우회가 아니다 */
  safeguard: boolean;
  /** S3 문제 수 */
  problems: number;
  /** S4 훅 1,000번 가운데 실패 */
  hookFailures: number;
  /** S5 주 세션 열둘 가운데 MCP 연결 실패가 있었던 세션 */
  mcpFailedSessions: number;
  /** E1 입력 토큰 1,000 가운데 캐시에서 읽은 것 */
  cacheRead: number;
  /** E2 도구 결과 1,000 가운데 오류 */
  toolErrors: number;
  /** E3 주 세션 열둘의 자동 압축 횟수의 합 */
  compactions: number;
  /** E4 세션에 실리는 지침의 어림 토큰 */
  instructionTokens: number;
  /** E5 스킬 열 가운데 안 쓴 것이 확인된 것(나머지는 쓴 것) */
  unusedSkills: number;
  /** E6 서버 넷 가운데 안 부른 것이 확인된 것(나머지는 부른 것) */
  unusedServers: number;
  /** E7 사람 요청 1,000 가운데 멈춘 일(거절한 도구 실행) */
  stoppedPerThousand: number;
  /** F1 응답 1,000 가운데 xhigh로 돈 것(나머지는 high) */
  highEffort: number;
  /** F2 자동 압축이 있었던 세션 가운데 하위 에이전트를 쓴 세션 */
  delegatedSessions: number;
  /** F3 프로젝트 가운데 지침이 있는 것 */
  guidedProjects: number;
  /** F4 전역 지침 스무 줄 가운데 프로젝트 지침에 다시 나오는 줄 */
  overlappingLines: number;
  /** F5 스킬 열 가운데 내용이 같은 사본이 프로젝트에 하나 더 있는 것 */
  copiedSkills: number;
  /** F6 부딪히는 설정 쌍 */
  conflicts: number;
}

const SESSIONS = 12;
const pad = (n: number): string => String(n).padStart(2, "0");
/** 오늘(2026-11-13)에서 거꾸로 센 날짜들. 모두 점수 구간 안이다 */
const dateBefore = (daysAgo: number): string => new Date(Date.UTC(2026, 10, 13 - daysAgo)).toISOString().slice(0, 10);

export function personaInput(p: Persona): EvaluationInput {
  const roots = Array.from({ length: p.projects }, (_, i) => `/work/p${pad(i + 1)}`);
  const dates = Array.from({ length: p.activeDays }, (_, i) => dateBefore(i));
  const requests = p.requestsPerDay * p.activeDays;
  const skills = Array.from({ length: 10 }, (_, i) => skill(`skill${pad(i + 1)}`));
  const servers = Array.from({ length: 4 }, (_, i) => mcpServer(`server${i + 1}`));
  const usedSkills = skills.slice(p.unusedSkills).map((fact) => fact.name);
  const calledServers = servers.slice(p.unusedServers).map((fact) => fact.name);

  // 양으로 재는 것은 첫 세션의 첫날에 몰아 둔다. 나머지 칸은 응답 하나씩이다
  const bulk: DayInput = {
    responses: 1000,
    humanRequests: requests,
    tokens: { input: 1000 - p.cacheRead, cacheRead: p.cacheRead, cacheWrite: 0, output: 100 },
    tools: { Read: { calls: requests * p.callsPerRequest, results: 1000, errors: p.toolErrors, deniedByUser: Math.round((requests * p.stoppedPerThousand) / 1000) } },
    hooks: { PreToolUse: { runs: 1000, failures: p.hookFailures } },
    efforts: { high: 1000 - p.highEffort, xhigh: p.highEffort },
    skillSignals: Object.fromEntries(usedSkills.map((name) => [name, { tool: 1 }])),
    mcpCalls: Object.fromEntries(calledServers.map((name) => [name, 1])),
  };
  const sessions: SummaryInput[] = Array.from({ length: SESSIONS }, (_, i) => {
    // 날짜를 세션에 돌아가며 나눈다. 사용한 날이 세션보다 많으면 남는 날은 첫 세션이 쓴다
    const own = dates.filter((_, d) => d % SESSIONS === i || (i === 0 && d >= SESSIONS)).concat(i < dates.length ? [] : [dates[i % dates.length]!]);
    const days: Record<string, DayInput> = Object.fromEntries(own.map((date) => [date, { responses: 1 }]));
    const first = own[0]!;
    days[first] = {
      ...(i === 0 ? bulk : { responses: 1 }),
      autoCompactions: Math.floor(p.compactions / SESSIONS) + (i < p.compactions % SESSIONS ? 1 : 0),
      subagentCalls: i < p.delegatedSessions ? 1 : 0,
      mcpConnectionFailure: i < p.mcpFailedSessions,
    };
    return { sessionId: `session${pad(i + 1)}`, cwd: roots[i % roots.length]!, instructionChars: { ascii: 0, other: p.instructionTokens }, days };
  });

  const globalLines = Array.from({ length: 20 }, (_, i) => `global${pad(i + 1)}`);
  const problems: SetupProblem[] = Array.from({ length: p.problems }, (_, i) => ({ kind: "noFrontmatter", owner: "user", path: `/home/u/.claude/skills/broken${i + 1}`, realPath: `/home/u/.claude/skills/broken${i + 1}` }));
  const copies = skills.slice(0, p.copiedSkills).map((fact) => skill(fact.name, { scope: "project", projectRoot: roots[0]!, path: `${roots[0]}/.claude/skills/${fact.name}`, enabled: false }));
  const setup = {
    globalInstructions: p.globalInstructions ? instructions({ files: [instructionFile("/home/u/.claude/CLAUDE.md", { bytes: 2000 })], lineHashes: globalLines }) : instructions(),
    settings: { user: "ok" as const, managedParts: [], defaultMode: { user: p.safeguard ? null : ("bypass" as const), managed: null } },
    projects: roots.map((root, i) =>
      project(root, {
        instructions: i < p.guidedProjects ? instructions({ files: [instructionFile(`${root}/CLAUDE.md`)], lineHashes: i === 0 ? [...globalLines.slice(0, p.overlappingLines), "own-line"] : ["own-line"] }) : instructions(),
        hasSettings: i === 0,
        settingsStatus: i === 0 ? ("ok" as const) : ("missing" as const),
        permissionConflicts: i === 0 ? p.conflicts : 0,
      }),
    ),
    skills: [...skills, ...copies],
    mcpServers: servers,
    problems,
  };
  return evaluationInput([claudeTool({ sessions, setup })], { installs: watched(...skills, ...copies, ...servers) });
}

const BEST: Persona = {
  activeDays: 22,
  requestsPerDay: 40,
  callsPerRequest: 8,
  projects: 4,
  globalInstructions: true,
  safeguard: true,
  problems: 0,
  hookFailures: 5,
  mcpFailedSessions: 0,
  cacheRead: 930,
  toolErrors: 15,
  compactions: 3,
  instructionTokens: 3500,
  unusedSkills: 1,
  unusedServers: 0,
  stoppedPerThousand: 10,
  highEffort: 500,
  delegatedSessions: 3,
  guidedProjects: 4,
  overlappingLines: 0,
  copiedSkills: 0,
  conflicts: 0,
};

/** 등급 D부터 S까지의 합성 사용자 다섯. 위에서 아래로 갈수록 덜 쓰고, 셋팅이 덜 멀쩡하고, 낭비가 많다 */
export const PERSONAS: Record<"S" | "A" | "B" | "C" | "D", Persona> = {
  S: BEST,
  A: { ...BEST, activeDays: 16, requestsPerDay: 28, callsPerRequest: 6, cacheRead: 850, toolErrors: 35, compactions: 6, unusedSkills: 3, unusedServers: 1, highEffort: 800, guidedProjects: 3, overlappingLines: 1, hookFailures: 20 },
  B: { ...BEST, activeDays: 14, requestsPerDay: 24, callsPerRequest: 5, projects: 3, cacheRead: 800, toolErrors: 50, compactions: 10, instructionTokens: 7000, unusedSkills: 4, unusedServers: 2, stoppedPerThousand: 50, highEffort: 800, delegatedSessions: 4, guidedProjects: 2, overlappingLines: 2, copiedSkills: 1, conflicts: 1, problems: 1, hookFailures: 30, mcpFailedSessions: 1 },
  C: { ...BEST, activeDays: 10, requestsPerDay: 17, callsPerRequest: 4, projects: 2, cacheRead: 740, toolErrors: 65, compactions: 15, instructionTokens: 9000, unusedSkills: 5, unusedServers: 2, stoppedPerThousand: 70, highEffort: 850, delegatedSessions: 3, guidedProjects: 1, overlappingLines: 3, copiedSkills: 2, conflicts: 1, problems: 1, hookFailures: 45, mcpFailedSessions: 2 },
  D: { ...BEST, activeDays: 5, requestsPerDay: 9, callsPerRequest: 2, projects: 1, cacheRead: 600, toolErrors: 100, compactions: 26, instructionTokens: 14000, unusedSkills: 7, unusedServers: 3, stoppedPerThousand: 130, highEffort: 930, delegatedSessions: 2, guidedProjects: 0, overlappingLines: 5, copiedSkills: 3, conflicts: 3, problems: 3, hookFailures: 80, mcpFailedSessions: 3, safeguard: false, globalInstructions: false },
};
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/evaluate.test.ts test/core/personas.test.ts`
Expected: FAIL. `../../src/core/evaluate.ts`를 찾지 못한다(두 시험 파일 모두).

- [ ] **Step 3: 구현한다**

`src/core/evaluate.ts`(새 파일):

```ts
// 입력 묶음에서 평가를 낸다. 규칙 스물둘을 재고 설치를 판정해 점수판으로 묶는다. 입력 묶음이 같으면 결과는 글자 하나 다르지 않다(순수 함수, 설계 9.3, 12.1, 12.2)
import { makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import type { SessionSummary, ToolCoverage, ToolId } from "../adapters/types.ts";
import type { ClaudeSetupFacts, ProjectFact } from "../scan/types.ts";
import type { InstallRecord } from "../state/state.ts";
import { candidatesOf, type Candidate, type SelfIdentity } from "./installs/candidates.ts";
import { sessionListings } from "./installs/listing.ts";
import { judgeServers, type JudgedServer } from "./installs/servers.ts";
import { calledMcpNames, usedSkillNames } from "./installs/signals.ts";
import { judgeSkills, type SkillBundle } from "./installs/skills.ts";
import { recordMap } from "./installs/verdict.ts";
import { fitToolRules, mergedFitRules, type MissingInstructions, type WorstOverlap } from "./metrics/fit.ts";
import { intensityRules } from "./metrics/intensity.ts";
import { highestMainVersion, mergedSetupRules, setupToolRules, type ToolSafeguard, type ToolSetup } from "./metrics/setup.ts";
import { usageRules } from "./metrics/usage.ts";
import { projectLookup, projectUsage, type NormalizedCwds, type ProjectUsage } from "./projects.ts";
import { RULES_VERSION } from "./rules.ts";
import { overall, scoreboard, type AxisScore, type Finding, type Overall, type ToolMeasured } from "./scoreboard.ts";
import { toolTotals, type ToolTotals } from "./totals.ts";

/** 도구 하나의 입력. 어댑터와 스캐너가 낸 것이다 */
export interface ToolInput {
  tool: ToolId;
  /** 날짜별 세션 요약(주 세션과 하위 세션) */
  summaries: readonly SessionSummary[];
  /** 지표마다 이 도구가 그것을 기록하는지 */
  coverage: ToolCoverage;
  /** 셸 명령 도구의 이름. 도구 오류(E2)에서 뺀다 */
  shellTools: readonly string[];
  /** 스킬 사용과 MCP 호출의 관측이 빠짐없는지(설계 9.8) */
  complete: { skills: boolean; mcp: boolean };
  setup: ClaudeSetupFacts;
}

/** 입력 묶음(설계 12.1). 평가 시계와 경로의 정규화처럼 순수하지 않은 것은 조립하는 쪽이 미리 해서 넣는다 */
export interface EvaluationInput {
  /** 평가 시계. 점검을 시작한 시각과 시간대 */
  clock: { nowMs: number; timeZone: string };
  tools: readonly ToolInput[];
  /** 프로젝트 목록(도구를 합친 것) */
  projects: readonly ProjectFact[];
  /** 세션의 작업 폴더(기록에 적힌 그대로) → 정규화한 경로 */
  normalizedCwds: NormalizedCwds;
  /** 지난 점검까지의 설치마다의 관측 기록. null이면 첫 점검이다 */
  installs: readonly InstallRecord[] | null;
  /** 이 도구 자신. 정비 후보에서 뺀다 */
  self: SelfIdentity;
}

export interface ToolEvaluation {
  tool: ToolId;
  /** 점수에 넣는 도구다(점수 구간에 응답이 하나라도 있다) */
  scored: boolean;
  /** 달력에 넣는 도구다(수집 구간에 응답이 하나라도 있다) */
  inCalendar: boolean;
  totals: ToolTotals;
  /** 판정한 스킬 묶음과 서버. 점수에 넣지 않는 도구의 설치는 판정하지 않아 비어 있다 */
  skills: SkillBundle[];
  servers: JudgedServer[];
}

export interface Evaluation {
  rulesVersion: string;
  windows: { today: LocalDate; score: { from: LocalDate; to: LocalDate }; collect: { from: LocalDate; to: LocalDate } };
  /** 도구 식별자의 차례 */
  tools: ToolEvaluation[];
  score: Overall;
  axes: AxisScore[];
  /** 설계 11.5의 차례 */
  findings: Finding[];
  candidates: Candidate[];
  /** S2의 근거. 점수에 넣는 도구마다 안전장치가 있는지와 인정된 조건 */
  safeguards: ToolSafeguard[];
  /** F3에서 지침이 없다고 센 프로젝트 */
  missingInstructions: MissingInstructions[];
  /** F4에서 전역 지침과 가장 많이 겹친 프로젝트 지침 */
  worstOverlap: WorstOverlap | null;
  /** 점수 구간에 주 세션이 있었던 프로젝트 */
  projects: ProjectUsage;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const span = (dates: readonly LocalDate[]): { from: LocalDate; to: LocalDate } => ({ from: dates[0]!, to: dates[dates.length - 1]! });

export function evaluate(input: EvaluationInput): Evaluation {
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const day = { today: windows.today, timeZone: input.clock.timeZone };
  const lookup = projectLookup(input.projects, input.normalizedCwds);
  const records = recordMap(input.installs);

  const all = [...input.tools].sort((a, b) => byText(a.tool, b.tool)).map((tool) => ({ input: tool, totals: toolTotals(tool.summaries, windows, tool.shellTools) }));
  // 점수에 넣는 도구에서만 규칙을 재고 설치를 판정한다. 관측 기록은 이것과 상관없이 부르는 쪽이 적는다
  const scored = all.filter((tool) => tool.totals.responses > 0);
  const setups = scored.map((tool): ToolSetup => ({ tool: tool.input.tool, totals: tool.totals, coverage: tool.input.coverage, setup: tool.input.setup, highestVersion: highestMainVersion(tool.input.summaries) }));
  const usage = projectUsage(setups, lookup);

  const judged = scored.map((tool, index) => {
    const setup = setups[index]!;
    const { summaries } = tool.input;
    const base = { day, windows, records };
    const skills = judgeSkills(setup, { ...base, used: usedSkillNames(summaries, windows), listings: sessionListings(summaries, "skill", input.normalizedCwds, lookup), complete: tool.input.complete.skills });
    const servers = judgeServers(setup, { ...base, used: calledMcpNames(summaries, windows), listings: sessionListings(summaries, "mcp", input.normalizedCwds, lookup), complete: tool.input.complete.mcp });
    const candidates = candidatesOf(setup, skills, servers, day, input.self);
    const measured: ToolMeasured = {
      tool: setup.tool,
      responses: setup.totals.responses,
      rules: { ...usageRules(setup.totals, setup.coverage), ...setupToolRules(setup), ...fitToolRules(setup), E5: skills.measurement, E6: servers.measurement },
      candidates,
    };
    return { tool: setup.tool, skills: skills.bundles, servers: servers.servers, candidates, measured };
  });

  const { S1, S2, S3, safeguards } = mergedSetupRules(setups);
  const { F3, F4, F6, missingInstructions, worstOverlap } = mergedFitRules(setups, usage);
  const board = scoreboard({ merged: { S1, S2, S3, F3, F4, F6, ...intensityRules(setups, usage) }, tools: judged.map((tool) => tool.measured) });

  const humanRequests = scored.reduce((sum, tool) => sum + tool.totals.humanRequests, 0);
  const activeDays = new Set(scored.flatMap((tool) => tool.totals.activeDates)).size;
  const judgedByTool = new Map(judged.map((tool) => [tool.tool, tool]));

  return {
    rulesVersion: RULES_VERSION,
    windows: { today: windows.today, score: span(windows.scoreDates), collect: span(windows.collectDates) },
    tools: all.map((tool): ToolEvaluation => {
      const own = judgedByTool.get(tool.input.tool);
      return { tool: tool.input.tool, scored: tool.totals.responses > 0, inCalendar: tool.totals.collectResponses > 0, totals: tool.totals, skills: own?.skills ?? [], servers: own?.servers ?? [] };
    }),
    score: overall(board.axes, humanRequests, activeDays),
    axes: board.axes,
    findings: board.findings,
    candidates: judged.flatMap((tool) => tool.candidates),
    safeguards,
    missingInstructions,
    worstOverlap,
    projects: usage,
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 15개, 시험 375개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/evaluate.test.ts test/core/personas.test.ts test/helpers/evaluation.ts test/helpers/personas.ts src/core/evaluate.ts
git commit -m "feat: 입력 묶음에서 평가를 내는 evaluate 추가"
```

---

### Task 20: 입력 조립, core의 순수성 검사, 개발용 평가 스크립트

**Files:**
- Create: `scripts/dev-evaluate.ts`
- Create: `src/commands/checkup-input.ts`
- Test: `test/commands/checkup-input.test.ts`
- Test: `test/core/purity.test.ts`

**Interfaces:**
- Consumes: 과제 19의 `evaluate`, `EvaluationInput`, 시험 도우미 `PERSONAS`, `personaInput`(순수성 검사가 합성 사용자 다섯을 빈 실행 환경에서 평가한다), 과제 17의 `SelfIdentity`, `NO_SELF`. 1단계의 `collectClaude`, `unreadableCount`, `EvalClock`, `ClaudeCollectResult`(`src/collect/claude.ts`), `claudeObservation`, `CLAUDE_COVERAGE`, `SHELL_TOOLS`(`src/adapters/claude/parser.ts`), `normalizePath`. 1부의 `scanClaudeSetup`, `StateFile`, `loadState`, `stateDir`.
- Produces: `CheckupInputOptions { env; homedir; tmpdir; platform; clock; cacheDir; rescan; state: Pick<StateFile, "salt" | "installs">; self; managedDir? }`, `CheckupInput { input: EvaluationInput; collected: ClaudeCollectResult; facts: ClaudeSetupFacts }`, `gatherCheckupInput(options: CheckupInputOptions): Promise<CheckupInput>`(`src/commands/checkup-input.ts`). 개발용 명령 `node scripts/run-ts.mjs scripts/dev-evaluate.ts`. 묶음에는 들어가지 않는다. 3부의 `aq checkup`이 `gatherCheckupInput`을 부른다.

core 밖에서 입력 묶음을 모은다(설계 7.2, 8). 기록을 읽고(1단계), 셋팅을 스캔하고(1부), 지난 점검까지의 상태를 붙인다.

- **프로젝트 목록.** 수집 구간에 응답이 있는 주 세션의 작업 폴더(세션마다 처음 적힌 것 하나)로 만든다. 하위 세션과 작업 폴더가 없는 세션은 넣지 않는다(설계 10). 1부의 스캐너가 이 일을 부르는 쪽에 맡겼다.
- **정규화한 경로.** 세션 요약에 적힌 작업 폴더마다 `normalizePath`로 정규화한 경로를 붙인다. 프로젝트 목록에 들지 않은 세션의 것도 붙인다.
- **claude.ai 연결의 이름.** 정의가 PC에 없는 연결은 기록에 남은 이름(실려 있던 서버의 이름, 응답의 귀속)으로만 알 수 있어서 모아 스캐너에 넘긴다.
- **관측이 빠짐없는지.** 1단계의 `claudeObservation`으로 스킬 사용과 MCP 호출을 따로 본다(설계 9.8).
- 상태 파일은 이 함수가 읽지 않는다. 부르는 쪽이 읽어 무작위 값과 관측 기록을 넘긴다. 이 함수는 상태 폴더에 캐시 말고는 쓰지 않는다.
- 기록 폴더가 없어도 입력 묶음을 만든다. 평가는 점수 없이 나온다(설계 20.1).

**결정성**(설계 21.1). 모은 입력으로 평가한 결과의 JSON 글이 캐시를 끈 경우, 켠 첫 실행, 캐시에서 읽은 실행, 다시 읽기(`rescan`)에서 모두 같은지 본다. 파일 목록의 차례는 1단계의 수집이 정규화한 경로 차례로 읽어 지키고, 요약의 차례를 뒤집은 경우는 과제 19가 본다.

**core의 순수성 검사**(`test/core/purity.test.ts`). `src/core/` 아래의 모든 파일과, 거기서 값으로 가져오는 모듈을 끝까지 따라가 본다. Node.js 모듈이나 바깥 패키지를 값으로 가져오지 않는지, core 밖에서 값으로 가져오는 것이 날짜와 버전을 다루는 순수한 모듈 둘(`src/adapters/common/dates.ts`, `version.ts`)뿐인지, 시계나 난수나 실행 환경을 읽는 곳이 없는지다. 타입만 가져오는 것(`import type`)은 실행할 때 지워지므로 어디에서 가져와도 된다. 이 검사는 처음부터 통과한다. core가 이미 순수하기 때문이다. 글로 한 번 보고, 실제로 돌려서 한 번 더 본다.

- **가져오기는 문법으로 읽는다.** 글을 정규식으로 찾으면 작은따옴표로 쓴 가져오기, 가져와서 다시 내보내기, 동적 가져오기를 놓친다. 묶는 도구(`esbuild`. 이미 개발 의존성이다)에 core의 파일을 모두 진입점으로 주고 묶게 해서, 그 결과가 알려 주는 파일마다의 가져오기 목록을 쓴다(`metafile`). 상대 경로가 아닌 것은 모두 바깥의 것으로 남기게 한다(`packages: "external"`). 타입만 가져오는 것은 묶는 도구가 지운다. 파일로 쓰지 않는다(`write: false`).
- **글로 보는 검사.** 금지한 꼴(`Date.now(`)을 찾으면 별명을 붙이거나(`const Clock = Date`) 구조 분해로 꺼낸 것(`const { env } = process`)을 놓친다. 주석과 타입을 지운 코드에서 전역의 이름이 나오는 자리를 모두 찾고, 허용한 꼴이 아니면 걸리게 한다. `Date`는 `Date.UTC(`, `Date.parse(`, 인자가 하나이고 눈에 보이는 `new Date(`만 허용한다. 펼친 인자(`new Date(...list)`)는 비어 있을 수 있고, 인자가 둘 이상이면(`new Date(2026, 0, 1)`) 로컬 시각으로 만든다. 글자 그대로 적은 날짜 글에는 시간대가 있어야 한다(`Date.parse("2026-01-01T00:00:00")`은 실행 환경의 시간대로 풀린다). `Math`는 점으로 이어 부르는 꼴만 허용하고 `Math.random`은 허용하지 않는다. 날짜를 주지 않은 `.format()`과 `.formatToParts()`는 지금 시각을 쓰므로 걸린다. `process`, `performance`, `globalThis`, `require`, `eval`, `Function`, `crypto`, `console`, 타이머 같은 전역과, 값에서 만든 이를 꺼내는 `constructor`는 이름이 나오면 걸린다. 오류의 스택에 닿는 이름(`stack`, `captureStackTrace`, `prepareStackTrace`, `stackTraceLimit`)과 실행 파일의 위치(`import.meta`, `__dirname`, `__filename`)도 걸린다. 오류의 스택에는 실행 환경의 파일 경로와 호출 계층이 든다. **그래서 core에는 생성자 메서드가 있는 클래스를 쓰지 못하고, `stack`이나 `Function` 같은 낱말은 글자 안에도 쓰지 못한다.** core는 함수와 자료만 쓴다. 동적 가져오기(`import(`)도 꼴 자체를 허용하지 않는다. 이름을 계산해서 가져오면 따라갈 수 없다. 글자 안의 낱말도 걸린다. 엄한 쪽이다.
- **글로는 모든 꼴을 막지 못한다.** 받아 온 글이 시간대 없는 날짜 글일 때(`Date.parse(text)`), 시간대를 주지 않은 날짜 꼴, 로컬 시각을 읽는 메서드, 이름을 계산해서 읽는 오류의 스택, 실행 환경이 지원하지 않는 로캘을 준 날짜 꼴은 글의 꼴로 가려내기 어렵다. 꼴을 하나씩 더하는 것으로는 끝이 없다.
- **돌려서 보는 검사.** core를 한 파일로 묶어(`esbuild`의 `iife`) Node.js의 `vm`이 만든 빈 실행 환경에서 평가를 실제로 돌린다. 새 실행 환경에는 Node.js의 전역(`process`, `require`, `crypto`, `performance`, 타이머)이 처음부터 없어서 찾으면 던진다. 언어에 든 것 가운데 시계(`Date.now`, 인자 없는 `new Date`, `Date()`), 난수(`Math.random`), 실행 환경의 시간대와 로캘을 읽는 것(로컬 시각의 메서드, `resolvedOptions`, 시간대를 주지 않은 `Intl.DateTimeFormat`, 날짜를 주지 않은 `format`, `toLocale…`, `supportedLocalesOf`, 시간대를 적지 않은 날짜 글을 푸는 것, 연과 월과 일을 따로 주어 만드는 날짜)은 그 환경을 꾸미는 글이 부르면 던지게 바꿔 둔다. 날짜 꼴은 준 로캘 가운데 그 실행 환경이 지원하는 것이 하나도 없어도 던진다. 로캘을 주지 않았거나, 빈 목록으로 줬거나, 지원하지 않는 로캘만 줬으면 실행 환경의 로캘로 돌아가기 때문이다(ECMA-402). 로캘을 적었는지만 보면 모자라서, 막는 글이 `supportedLocalesOf`를 막기 전에 챙겨 두고 준 맞춤 방식(`localeMatcher`) 그대로 묻는다. 오류의 스택도 읽는 순간 던진다(`Error.prepareStackTrace`가 던지게 해 둔다. 엔진이 던진 오류의 스택도 같다). 오류를 만들고 던지고 메시지를 읽는 것은 그대로다. 받아 온 시각을 다루는 것(`new Date(ms)`, `Date.UTC`, `toISOString`, 시간대를 적은 날짜 글, 시간대를 준 날짜 꼴)은 그대로다. 합성 사용자 다섯의 입력을 JSON으로 건네 평가하고 결과가 밖에서 평가한 것과 글자 하나 다르지 않은지 본다.
- **그 환경에는 바깥 실행 환경의 객체를 하나도 넣지 않는다.** 프로토타입이 없는 객체로 환경을 만들고(`createContext(Object.create(null), …)`), 인자는 글로 넣고 결과는 글로 받는다. 바깥 객체가 하나라도 닿으면 그 생성자를 거슬러 올라가 바깥의 함수 생성자를 얻고, 바깥에서 글을 실행해 막아 두지 않은 진짜 시계를 읽을 수 있다. 보통 객체로 환경을 만들면 전역이 바깥의 것을 물려받아서 그 길이 열린다. 그 환경 안에서 글을 실행하는 것(`eval`, 함수 생성자)도 막는다(`codeGeneration`). 그 환경에서 던진 오류는 메시지만 옮겨 바깥의 오류로 바꿔 던진다. 그 환경의 오류 객체가 그대로 밖으로 나오면 시험 도구가 그 스택을 읽을 때 막는 글이 다시 던지고, 실패 출력에 그 환경의 스택이 실린다.
- **이 검사의 범위.** 개발하다 실수로 넣는 부수 읽기를 잡는 장치다. 순수성을 증명하지 않고, 일부러 빠져나가려고 쓴 코드를 가두지 않는다(`vm`은 보안 장치가 아니다. Node.js 문서). 리뷰에서 범위를 이렇게 정했다.
  1. 흔히 쓰는 API로 시각, 난수, 실행 환경의 시간대와 로캘, 실행 경로(오류의 스택, 실행 파일의 위치)를 읽는 것은 평가가 지나는 길에서 반드시 걸려야 한다. 별명, 구조 분해, 변수로 받은 날짜 글, 펼친 인자로 써도 그렇다.
  2. 걸린 사례와 허용한 꼴을 모두 시험에 고정한다. 정상 평가는 통과하고, 금지한 읽기를 넣으면 실패해야 한다. 막는 줄을 빼면 시험이 실패해야 한다.
  3. 바깥 객체를 넣지 않는 것과 글 실행을 막는 것을 유지한다. 둘을 되돌리면 실패하는 시험을 둔다.
  4. 합성 사용자 다섯이 지나지 않는 갈래는 보증하지 않는다. 그런 갈래에 실행 환경과 닿는 연산을 더할 때에는 그 갈래를 지나는 입력을 더하고 소스를 직접 읽는다.
  5. 속성 이름을 조각내거나 호출을 비틀어 일부러 빠져나가는 코드는 완료 조건이 아니다. 찾은 것과 한계는 적어 둔다. 흔히 쓰는 API를 이 범주로 돌리지 않는다.
- 돌려서 보는 검사는 지나가는 길만 본다. 합성 사용자 다섯이 지나지 않는 갈래에 글로도 걸리지 않는 꼴로 쓴 것은 남는다. 두 검사가 서로의 빈 곳을 메우지만 다 메우지는 못한다.
- **검사가 잡는지를 시험한다.** 검사만 두면 검사가 놓치는 것을 알 수 없다. 금지된 것을 쓴 짧은 글을 core의 파일인 것처럼 두 검사에 넣는다. 가져오기 여덟 꼴과 안의 모듈을 거쳐 가져오는 것은 가져오기 검사가 잡는지 본다. 시계와 난수와 실행 환경을 읽는 서른네 꼴은 글로 보는 검사가 무엇을 내는지(열은 글로 걸리지 않는다)와, 돌려서 보는 검사가 서른넷 모두에서 던지는지를 본다. 던진 까닭이 막아 둔 것을 불렀거나, 그 환경에 없는 전역을 찾았거나, 글을 실행하려 해서인지도 본다. 생성자를 거슬러 올라가는 길 넷(날짜에서, 전역에서, 값에서, 함수 생성자가 돌려준 전역에서)과 오류의 스택을 읽는 길 넷(만든 오류, 엔진이 던진 오류, 이름을 계산해서, 값에 붙여서)이 여기에 든다. 실행 파일의 위치는 빈 실행 환경에 없어서 글로만 걸린다. 오류를 만들고 던지고 메시지를 읽는 것은 두 검사 모두 걸리지 않는지 본다. 로캘을 준 날짜 꼴은 준 로캘 가운데 지원하는 것이 하나라도 있으면(지원하지 않는 로캘 뒤에 지원하는 로캘을 덧붙인 것, 지역만 모르는 로캘) 걸리지 않고 그 로캘로 꼴을 만드는지 본다. 허용한 꼴과 주석, 타입 자리는 두 검사 모두 걸리지 않는지 본다.

**개발용 스크립트**(`scripts/dev-evaluate.ts`). 이 PC의 기록과 셋팅으로 `gatherCheckupInput`과 `evaluate`를 돌려 규칙 스물둘의 값, 점수, 분류, 근거 숫자와 기준 점수, AQ, 등급, 정비 후보의 수를 낸다. 이름, 경로, 글은 내지 않고 아무것도 저장하지 않는다. 상태 파일은 읽기만 하고, 없으면 그 실행에서만 쓰는 무작위 값으로 첫 점검처럼 본다. 결과는 저장소와 병합 요청에 넣지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup-input.test.ts`(새 파일):

```ts
// 점검의 입력 묶음을 모으는 것을 임시 홈 폴더로 시험한다. 기록 읽기와 셋팅 스캔에서 평가까지 이어 보고, 캐시를 켜고 끈 경우와 연달아 두 번 돌린 경우의 결과가 같은지 본다(설계 8, 12.1, 21.1 「결정성」)
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { gatherCheckupInput, type CheckupInputOptions } from "../../src/commands/checkup-input.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { NO_SELF } from "../../src/core/installs/candidates.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");
const SALT = "5a".repeat(32);

let root: string;
let home: string;
let proj: string;
let other: string;

async function session(folder: string, id: string, lines: string[]): Promise<string> {
  const dir = join(home, ".claude", "projects", folder);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  await writeFile(path, `${lines.join("\n")}\n`);
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
  return path;
}
const turn = (id: string, cwd: string, extra: { mcpServer?: string } = {}): string[] => [
  user({ at: "2026-11-11T01:00:00Z", content: "고쳐 줘", origin: "human", extra: { cwd } }),
  assistant({ id, at: "2026-11-11T01:00:05Z", cwd, usage: { input: 10, cacheRead: 80, cacheWrite: 10, output: 5 }, ...extra }),
];
const options = (overrides: Partial<CheckupInputOptions> = {}): CheckupInputOptions => ({
  env: {},
  homedir: home,
  tmpdir: join(root, "os-tmp"),
  platform: process.platform,
  clock: { nowMs: NOW, timeZone: "Asia/Seoul" },
  cacheDir: null,
  rescan: false,
  state: { salt: SALT, installs: null },
  self: NO_SELF,
  managedDir: join(root, "managed"),
  ...overrides,
});

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  proj = join(root, "work", "proj");
  other = join(root, "work", "other");
  const claude = join(home, ".claude");
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(proj, "sub", "x.txt"), "x");
  await put(join(proj, "CLAUDE.md"), "이 저장소에서는 계획 문서를 먼저 읽고 시험을 돌린다.\n");
  await put(join(other, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(claude, "CLAUDE.md"), `${"모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다. ".repeat(12)}\n`);
  await put(join(claude, "settings.json"), JSON.stringify({ permissions: { defaultMode: "acceptEdits" } }));
  await put(join(claude, "skills", "review", "SKILL.md"), "---\nname: review\ndescription: 시험용 스킬\n---\n");
  await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { db: { command: "db-server" } } }));
  await session("p-proj", "s1", turn("a-1", proj));
  await session("p-proj", "s2", turn("b-1", join(proj, "sub"), { mcpServer: "claude.ai Mail" }));
  // 응답이 없는 세션의 작업 폴더는 프로젝트 목록에 넣지 않는다
  await session("p-other", "s3", [user({ at: "2026-11-11T02:00:00Z", content: "열어만 봤다", origin: "human", extra: { cwd: other } })]);
});
afterEach(async () => removeTemp(root));

describe("gatherCheckupInput", () => {
  it("기록을 읽고 셋팅을 스캔해 평가의 입력 묶음을 만든다", async () => {
    const records = [{ key: "k", firstSeen: "2026-10-01", appeared: false }];
    const self = { skillNames: ["aq"], pluginNames: ["chunsik-garage"], skillRealPaths: [] };
    const gathered = await gatherCheckupInput(options({ state: { salt: SALT, installs: records }, self }));
    const { input } = gathered;
    expect(input.clock).toEqual({ nowMs: NOW, timeZone: "Asia/Seoul" });
    expect(input.tools).toHaveLength(1);
    const tool = input.tools[0]!;
    expect(tool).toMatchObject({ tool: "claude-code", coverage: CLAUDE_COVERAGE, shellTools: ["Bash", "PowerShell"], complete: { skills: true, mcp: true } });
    expect(tool.summaries.map((summary) => summary.sessionId).sort()).toEqual(["s1", "s2", "s3"]);
    expect(tool.setup).toBe(gathered.facts);
    expect(tool.setup.skills.map((skill) => skill.name)).toEqual(["review"]);
    expect(input.installs).toBe(records);
    expect(input.self).toBe(self);
    expect(gathered.collected.summaries).toBe(tool.summaries);
  });
  it("프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더로 만든다. 하위 폴더에서 연 세션은 같은 프로젝트로 묶인다", async () => {
    const { input } = await gatherCheckupInput(options());
    expect(input.projects).toBe(input.tools[0]!.setup.projects);
    expect(input.projects.map((project) => [project.normRoot, project.kind, project.cwds])).toEqual([[normalizePath(proj), "git", [normalizePath(proj), normalizePath(join(proj, "sub"))]]]);
  });
  it("세션의 작업 폴더마다 정규화한 경로를 붙인다. 프로젝트 목록에 들지 않은 세션의 것도 붙인다", async () => {
    const { input } = await gatherCheckupInput(options());
    expect(input.normalizedCwds).toEqual({ [proj]: normalizePath(proj), [join(proj, "sub")]: normalizePath(join(proj, "sub")), [other]: normalizePath(other) });
  });
  it("기록에 남은 claude.ai 연결의 이름을 스캐너에 넘긴다. 그 서버는 정의가 없는 서버로 든다", async () => {
    const { facts } = await gatherCheckupInput(options());
    expect(facts.mcpServers.map((server) => [server.name, server.scope, server.installKey === null])).toEqual([["claude.ai Mail", "claude-ai", true], ["db", "user", false]]);
  });
  it("읽지 못한 파일이 있으면 스킬 사용과 MCP 호출의 관측이 빠짐없지 않다", async () => {
    await session("p-proj", "broken", ["{깨진 줄", "{또 깨진 줄", user({ at: "2026-11-11T03:00:00Z", content: "x", origin: "human" })]);
    const { input, collected } = await gatherCheckupInput(options());
    expect(collected.read.unreadableFiles).toHaveLength(1);
    expect(input.tools[0]!.complete).toEqual({ skills: false, mcp: false });
  });
  it("기록 폴더가 없어도 입력 묶음을 만든다. 평가는 점수 없이 나온다", async () => {
    const { input, collected } = await gatherCheckupInput(options({ homedir: join(root, "nobody") }));
    expect(collected.detected).toBe(false);
    expect(input.tools[0]!.summaries).toEqual([]);
    expect(evaluate(input).score).toMatchObject({ aq: null, grade: null });
  });
});

describe("모은 입력으로 평가한 결과", () => {
  it("기록과 셋팅이 규칙에 이어진다", async () => {
    const result = evaluate((await gatherCheckupInput(options())).input);
    const finding = (id: string) => result.findings.find((f) => f.ruleId === id)!;
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses, tool.totals.humanRequests])).toEqual([["claude-code", true, 2, 3]]);
    expect(finding("E1")).toMatchObject({ status: "scored", value: 0.8 });
    expect(finding("S1")).toMatchObject({ status: "scored", value: 1 });
    expect(finding("S2")).toMatchObject({ status: "scored", value: 1 });
    expect(finding("I1")).toMatchObject({ value: 1 });
    expect(finding("I4")).toMatchObject({ value: 1, evidence: { projects: 1, unlinkedSessions: 0 } });
    expect(finding("F3")).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    expect(result.score).toMatchObject({ aq: null, withheld: ["too_few_requests", "too_few_days"] });
  });
  it("캐시를 켜고 끈 경우와 연달아 두 번 돌린 경우에 글자 하나 다르지 않다", async () => {
    const cacheDir = join(root, "state", "cache");
    const run = async (overrides: Partial<CheckupInputOptions>) => {
      const gathered = await gatherCheckupInput(options(overrides));
      return { text: JSON.stringify(evaluate(gathered.input)), fromCache: gathered.collected.read.fromCache };
    };
    const plain = await run({});
    const first = await run({ cacheDir });
    const second = await run({ cacheDir });
    const rescanned = await run({ cacheDir, rescan: true });
    expect([plain.fromCache, first.fromCache, second.fromCache, rescanned.fromCache]).toEqual([0, 0, 3, 0]);
    expect(first.text).toBe(plain.text);
    expect(second.text).toBe(plain.text);
    expect(rescanned.text).toBe(plain.text);
  });
});
```

`test/core/purity.test.ts`(새 파일):

```ts
// core가 순수한지 본다. 파일을 열지 않고, 시계와 난수를 읽지 않고, Node.js에만 있는 것을 쓰지 않는다. 글로 한 번 보고, 빈 실행 환경에서 실제로 돌려서 한 번 더 본다. 검사가 잡는지도 본다(설계 7.2)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createContext, runInContext, type Context } from "node:vm";
import { buildSync, transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { PERSONAS, personaInput } from "../helpers/personas.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CORE = join(ROOT, "src", "core");

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsFiles(path) : name.endsWith(".ts") ? [path] : [];
  });
}

/** 묶을 것. 파일들이거나, core의 파일 하나인 것처럼 넣는 글이다(검사가 잡는지 볼 때 쓴다) */
type Entry = { files: string[] } | { source: string };
const entryOf = (entry: Entry) =>
  "files" in entry ? { entryPoints: entry.files } : { stdin: { contents: entry.source, resolveDir: CORE, sourcefile: join(CORE, "probe.ts"), loader: "ts" as const } };

interface Reach {
  /** 값으로 가져오는 모듈을 끝까지 따라가 닿는 파일(저장소 뿌리 기준 경로) */
  files: string[];
  /** 저장소 밖의 것(Node.js 모듈, 바깥 패키지)을 값으로 가져오는 자리. '<파일> ← <모듈>' */
  outside: string[];
}

/**
 * 진입점에서 값으로 가져오는 모듈을 끝까지 따라간다. 가져오기 문법은 묶는 도구(esbuild)가 읽는다.
 * 그래서 따옴표의 종류, 다시 내보내기, 동적 가져오기, require를 가리지 않는다. 타입만 가져오는 것은 실행할 때 지워지므로 따라가지 않는다.
 */
function follow(entry: Entry): Reach {
  const result = buildSync({
    ...entryOf(entry),
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "neutral",
    // 상대 경로가 아닌 것은 모두 저장소 밖의 것으로 남긴다
    packages: "external",
    outdir: "unused",
    logLevel: "silent",
  });
  const inputs = Object.entries(result.metafile.inputs);
  return {
    files: inputs.map(([path]) => path).sort(),
    outside: inputs.flatMap(([path, input]) => input.imports.filter((item) => item.external === true).map((item) => `${path} ← ${item.path}`)).sort(),
  };
}

/**
 * 이름이 나오기만 해도 걸리는 것. Node.js와 브라우저의 전역, 시계와 난수와 바깥에 닿는 것, 글을 실행하는 것(Function)과 값에서 만든 이를 꺼내는 길(constructor),
 * 오류의 스택(실행 환경의 파일 경로와 호출 계층이 든다)과 실행 파일의 위치다. 그래서 core에는 생성자 메서드가 있는 클래스와 stack이라는 이름을 쓰지 못한다
 */
const FORBIDDEN_NAMES = [
  ...["process", "performance", "globalThis", "require", "eval", "Function", "constructor", "crypto", "console", "navigator", "fetch"],
  ...["setTimeout", "setInterval", "setImmediate", "queueMicrotask", "Buffer", "Temporal", "ShadowRealm"],
  ...["stack", "captureStackTrace", "prepareStackTrace", "stackTraceLimit", "__dirname", "__filename"],
];

/** 날짜 글에 시간대가 적혀 있다. 날짜만 적은 글은 UTC로 풀리고, 끝에 Z나 +09:00 같은 것을 적은 글은 그 시간대로 풀린다. 그 밖의 글은 실행 환경의 시간대로 풀린다 */
const zonedText = (text: string): boolean => /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(text) || /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);

/** 여는 괄호로 시작하는 글에서, 그 괄호가 닫히기 전에 바로 안쪽의 쉼표가 있는지. 따옴표 안과 더 안쪽의 괄호는 건너뛴다 */
function hasSecondArgument(call: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < call.length; i++) {
    const ch = call[i]!;
    if (quote !== null) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (--depth === 0) return false;
    } else if (ch === "," && depth === 1) return true;
  }
  return false;
}

/** 여는 괄호로 시작하는 글의 첫 인자가 글자 그대로 적힌 날짜 글이면 그 글을, 아니면 null을 낸다 */
const firstTextArgument = (call: string): string | null => /^\s*\(\s*(["'`])([^"'`\\]*)\1/.exec(call)?.[2] ?? null;

/**
 * 글로 보는 검사. 주석과 타입을 지운 코드에서 시계와 실행 환경을 읽는 흔한 꼴을 찾는다.
 * 전역을 허용한 꼴로만 쓰게 해서, 별명을 붙이거나 구조 분해로 꺼내 돌려 쓰는 것도 걸리게 한다. 글자 안의 낱말도 걸린다. 엄한 쪽이다.
 * 글로는 모든 꼴을 막지 못한다. 실제로 읽는지는 아래의 sandboxed가 돌려서 본다.
 */
function leaksOf(source: string): string[] {
  const code = transformSync(source, { loader: "ts", legalComments: "none" }).code;
  const found = new Set<string>();
  for (const match of code.matchAll(/\bDate\b/g)) {
    const before = code.slice(0, match.index);
    const after = code.slice(match.index + "Date".length);
    // 받아 온 시각을 다루는 꼴만 허용한다. Date.UTC(...), Date.parse(...), 인자가 하나이고 눈에 보이는 new Date(...).
    // 펼친 인자는 비어 있을 수 있고, 인자가 둘 이상이면 로컬 시각으로 만든다. 글자 그대로 적은 날짜 글에는 시간대가 있어야 한다
    const parse = /^\.parse(\s*\(.*)$/s.exec(after);
    const made = /\bnew\s+$/.test(before) && /^\s*\(\s*[^)\s.]/.test(after) && !hasSecondArgument(after.trimStart());
    const text = parse !== null ? firstTextArgument(parse[1]!) : made ? firstTextArgument(after) : null;
    const allowed = (/^\.UTC\s*\(/.test(after) || parse !== null || made) && (text === null || zonedText(text));
    if (!allowed) found.add("Date");
  }
  // Math는 점으로 이어 부르는 꼴만 허용하고 난수는 허용하지 않는다
  if (/\bMath\b(?!\s*\.\s*(?!random\b)[A-Za-z])/.test(code)) found.add("Math");
  // 날짜 꼴에 날짜를 주지 않으면 지금 시각을 쓴다
  if (/\.format(?:ToParts)?\s*\(\s*\)/.test(code)) found.add("인자 없는 format");
  for (const name of FORBIDDEN_NAMES) if (new RegExp(`\\b${name}\\b`).test(code)) found.add(name);
  // 이름을 계산해서 가져오는 것은 따라갈 수 없으므로 동적 가져오기는 꼴 자체를 허용하지 않는다
  if (/\bimport\s*\(/.test(code)) found.add("import()");
  // 실행 파일의 위치(import.meta.url, import.meta.dirname)는 실행 환경마다 다르다
  if (/\bimport\s*\.\s*meta\b/.test(code)) found.add("import.meta");
  return [...found].sort();
}

/**
 * 빈 실행 환경을 꾸미는 글. 그 환경 안에서 돈다. 새 실행 환경에는 Node.js의 전역(process, require, crypto, performance, 타이머)이 처음부터 없다.
 * 언어에 든 것 가운데 시계, 난수, 실행 환경의 시간대와 로캘을 읽는 것은 부르면 던지게 바꾼다. 받아 온 시각을 다루는 것은 그대로 둔다.
 * 아는 것을 막아 둔 것이다. 언어의 기능을 다 훑은 것은 아니어서 막지 못한 것이 더 있을 수 있다.
 */
const GUARD = String.raw`(() => {
  const refuse = (what) => function () { throw new Error("순수하지 않다: " + what); };
  // 오류의 스택에는 실행 환경의 파일 경로와 호출 계층이 든다. 스택을 읽는 순간 던지게 한다. 오류를 만들고 던지고 메시지를 읽는 것은 그대로다
  Object.defineProperty(Error, "prepareStackTrace", { value: refuse("오류의 스택"), writable: false, configurable: false });
  const RealDate = Date;
  RealDate.now = refuse("Date.now");
  // 시간대를 적지 않은 날짜 글은 실행 환경의 시간대로 풀린다. 날짜만 적은 글(UTC로 푼다)과, 끝에 Z나 +09:00 같은 시간대를 적은 글만 받는다
  const zoned = (text) => /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(text) || /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  const unzoned = (value) => typeof value === "string" && !zoned(value);
  const realParse = RealDate.parse;
  RealDate.parse = function (text) {
    if (typeof text !== "string" || unzoned(text)) throw new Error("순수하지 않다: 시간대를 적지 않은 날짜 글");
    return realParse(text);
  };
  const LOCAL = ["getDate", "getDay", "getFullYear", "getHours", "getMilliseconds", "getMinutes", "getMonth", "getSeconds", "getTimezoneOffset", "getYear",
    "setDate", "setFullYear", "setHours", "setMilliseconds", "setMinutes", "setMonth", "setSeconds", "setYear",
    "toDateString", "toLocaleDateString", "toLocaleString", "toLocaleTimeString", "toString", "toTimeString"];
  for (const name of LOCAL) RealDate.prototype[name] = refuse("Date.prototype." + name);
  const GuardedDate = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      if (args.length === 0) throw new Error("순수하지 않다: 인자 없는 new Date");
      if (args.length === 1 && unzoned(args[0])) throw new Error("순수하지 않다: 시간대를 적지 않은 날짜 글");
      // 연, 월, 일을 따로 주면 실행 환경의 시간대의 시각으로 만든다
      if (args.length > 1) throw new Error("순수하지 않다: 로컬 시각으로 만든 날짜");
      return Reflect.construct(target, args, newTarget === GuardedDate ? target : newTarget);
    },
    apply() { throw new Error("순수하지 않다: Date()"); },
  });
  RealDate.prototype.constructor = GuardedDate;
  globalThis.Date = GuardedDate;

  Math.random = refuse("Math.random");

  const RealFormat = Intl.DateTimeFormat;
  const realParts = RealFormat.prototype.formatToParts;
  RealFormat.prototype.formatToParts = function (date) {
    if (date === undefined) throw new Error("순수하지 않다: 날짜 없는 formatToParts");
    return realParts.call(this, date);
  };
  const realFormat = Object.getOwnPropertyDescriptor(RealFormat.prototype, "format").get;
  Object.defineProperty(RealFormat.prototype, "format", {
    get() {
      const format = realFormat.call(this);
      return (date) => {
        if (date === undefined) throw new Error("순수하지 않다: 날짜 없는 format");
        return format(date);
      };
    },
  });
  RealFormat.prototype.resolvedOptions = refuse("resolvedOptions");
  // 지원하는 로캘을 묻는 것은 막는다. 막는 글이 쓸 것은 그 전에 챙겨 둔다
  const realSupported = RealFormat.supportedLocalesOf;
  RealFormat.supportedLocalesOf = refuse("Intl.DateTimeFormat.supportedLocalesOf");
  const made = (args) => {
    const locales = args[0];
    const options = args[1];
    if (options === undefined || options === null || options.timeZone === undefined) throw new Error("순수하지 않다: 시간대를 주지 않은 Intl.DateTimeFormat");
    // 로캘을 주지 않았거나, 빈 목록으로 줬거나, 준 로캘 가운데 이 실행 환경이 아는 것이 하나도 없으면 실행 환경의 로캘로 돌아간다. 로캘을 적었다는 것만으로는 모자라다
    if (realSupported.call(RealFormat, locales, { localeMatcher: options.localeMatcher }).length === 0) throw new Error("순수하지 않다: 실행 환경의 로캘로 돌아가는 Intl.DateTimeFormat");
    return new RealFormat(...args);
  };
  const GuardedFormat = new Proxy(RealFormat, { construct: (_target, args) => made(args), apply: (_target, _self, args) => made(args) });
  RealFormat.prototype.constructor = GuardedFormat;
  for (const name of Object.getOwnPropertyNames(Intl)) if (typeof Intl[name] === "function") Intl[name] = refuse("Intl." + name);
  Intl.DateTimeFormat = GuardedFormat;

  for (const name of ["localeCompare", "toLocaleLowerCase", "toLocaleUpperCase"]) String.prototype[name] = refuse("String.prototype." + name);
  Number.prototype.toLocaleString = refuse("Number.prototype.toLocaleString");
  BigInt.prototype.toLocaleString = refuse("BigInt.prototype.toLocaleString");
  Array.prototype.toLocaleString = refuse("Array.prototype.toLocaleString");
  for (const name of ["console", "WebAssembly", "WeakRef", "FinalizationRegistry", "Atomics", "SharedArrayBuffer", "Temporal", "ShadowRealm"]) delete globalThis[name];
})();`;

/**
 * 돌려서 보는 검사. 진입점을 한 파일로 묶어 빈 실행 환경에서 돌리고, 내보낸 함수 하나를 JSON으로 준 인자로 부른 결과를 JSON 글로 돌려준다.
 * 가는 길에 막아 둔 것(시계, 난수, 실행 환경의 시간대와 로캘을 읽는 것)을 부르면 던진다. 글의 꼴과 상관없이 부르는 순간 걸린다.
 * 지나가지 않는 길과, 막아 두지 못한 것은 보지 못한다.
 *
 * 그 환경에는 바깥 실행 환경의 객체를 하나도 넣지 않는다. 바깥 객체가 하나라도 닿으면 그 생성자를 거슬러 올라가 바깥의 함수 생성자를 얻고,
 * 바깥에서 글을 실행해 막아 두지 않은 진짜 시계를 읽을 수 있다. 그래서 프로토타입이 없는 객체로 환경을 만들고, 인자는 글로 넣고 결과는 글로 받는다.
 * 그 환경 안에서 글을 실행하는 것(eval, 함수 생성자)도 막는다.
 */
/**
 * 빈 실행 환경에서 글을 돌린다. 그 안에서 던진 오류는 메시지만 옮겨 바깥의 오류로 바꿔 던진다.
 * 그 환경의 오류 객체가 그대로 밖으로 나오면, 시험 도구가 그 스택을 읽을 때 그 환경의 막는 글이 다시 던진다. 스택의 글이 시험 출력에 실리지도 않는다
 */
function inContext(code: string, context: Context): unknown {
  try {
    return runInContext(code, context);
  } catch (error) {
    throw new Error(String((error as { message?: unknown } | null)?.message ?? error));
  }
}

function sandboxed(entry: Entry, call: string, argJson = "null"): string {
  const bundle = buildSync({ ...entryOf(entry), absWorkingDir: ROOT, bundle: true, write: false, format: "iife", globalName: "probe", platform: "neutral", packages: "external", outdir: "unused", logLevel: "silent" });
  const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  inContext(GUARD, context);
  inContext(`var argJson = ${JSON.stringify(argJson)};`, context);
  inContext(bundle.outputFiles[0]!.text, context);
  return inContext(`JSON.stringify(probe.${call}(JSON.parse(argJson)))`, context) as string;
}

describe("core의 순수성", () => {
  const reach = follow({ files: tsFiles(CORE) });

  it("core의 파일을 찾았다", () => {
    expect(reach.files.filter((path) => path.startsWith("src/core/")).length).toBeGreaterThan(15);
  });
  it("core와 core가 값으로 가져오는 모듈은 Node.js 모듈이나 바깥 패키지를 값으로 가져오지 않는다", () => {
    expect(reach.outside).toEqual([]);
  });
  it("core 밖에서 값으로 가져오는 것은 날짜와 버전을 다루는 순수한 모듈 둘뿐이다", () => {
    expect(reach.files.filter((path) => !path.startsWith("src/core/"))).toEqual(["src/adapters/common/dates.ts", "src/adapters/common/version.ts"]);
  });
  it("시계를 직접 읽거나 실행 환경을 보는 글이 없다. 평가 시계는 입력으로 받는다", () => {
    const offending = reach.files.flatMap((path) => leaksOf(readFileSync(join(ROOT, path), "utf8")).map((name) => `${path}: ${name}`));
    expect(offending).toEqual([]);
  });
  it.each(["S", "A", "B", "C", "D"] as const)("시계도 난수도 Node.js의 전역도 없는 빈 실행 환경에서 평가가 끝까지 돌고 결과가 같다: 합성 사용자 %s", (grade) => {
    // 입력은 JSON으로 건넨다. 견주는 쪽도 같은 JSON에서 되살린 입력으로 평가한다
    const inputJson = JSON.stringify(personaInput(PERSONAS[grade]));
    expect(sandboxed({ files: [join(CORE, "evaluate.ts")] }, "evaluate", inputJson)).toBe(JSON.stringify(evaluate(JSON.parse(inputJson))));
  });
});

describe("순수성 검사가 실제로 잡는다", () => {
  it.each([
    ["큰따옴표로 가져온다", `import { join } from "node:path";\nexport const leak = () => join("a", "b");`],
    ["작은따옴표로 가져온다", `import { join } from 'node:path';\nexport const leak = () => join('a', 'b');`],
    ["가져와서 다시 내보낸다", `export { readFileSync as leak } from 'node:fs';`],
    ["동적으로 가져온다", `export const leak = () => import('node:fs');`],
    ["require로 가져온다", `export const leak = () => require('node:fs');`],
    ["node: 없이 가져온다", `import { readFileSync } from 'fs';\nexport const leak = readFileSync;`],
    ["바깥 패키지를 가져온다", `import { build } from 'esbuild';\nexport const leak = build;`],
    ["타입과 함께 값 자리를 남긴다", `import { type Stats } from 'node:fs';\nexport const size = (s: Stats) => s.size;`],
  ])("저장소 밖의 것을 값으로 가져오면 걸린다: %s", (_name, source) => {
    expect(follow({ source }).outside).toHaveLength(1);
  });
  it("타입만 가져오는 것과 저장소 안의 모듈은 걸리지 않는다. 안의 모듈은 끝까지 따라간다", () => {
    expect(follow({ source: `import type { Stats } from 'node:fs';\nexport const size = (s: Stats) => s.size;` })).toEqual({ files: ["src/core/probe.ts"], outside: [] });
    expect(follow({ source: `import { olderThan } from './installs/age.ts';\nexport const x = olderThan;` })).toEqual({
      files: ["src/adapters/common/dates.ts", "src/core/installs/age.ts", "src/core/probe.ts"],
      outside: [],
    });
  });
  it("안의 모듈을 거쳐 가져오는 것도 걸린다", () => {
    // 저장소의 다른 모듈(스캐너)은 Node.js 모듈을 값으로 가져온다. core가 그것을 값으로 가져오면 따라가서 잡는다
    const reach = follow({ source: `import { skillInstallKey } from '../scan/identity.ts';\nexport const x = skillInstallKey;` });
    expect(reach.files).toContain("src/scan/identity.ts");
    expect(reach.outside).not.toEqual([]);
  });

  /** [이름, 글, 글로 보는 검사가 내는 것]. 글로 보는 검사가 못 잡는 것은 빈 목록이다. 돌려서 보는 검사는 모두 잡아야 한다 */
  const LEAKS: [string, string, string[]][] = [
    ["Date.now", `export const run = () => Date.now();`, ["Date"]],
    ["인자 없는 new Date", `export const run = () => new Date().getTime();`, ["Date"]],
    ["빈 인자를 펼친 new Date", `export const run = () => new Date(...([] as [])).getTime();`, ["Date"]],
    ["시계에 별명을 붙인다", `const Clock = Date;\nexport const run = () => Clock.now();`, ["Date"]],
    ["시계를 구조 분해로 꺼낸다", `const { now } = Date;\nexport const run = () => now();`, ["Date"]],
    ["날짜에서 만든 이를 꺼내 지금 시각을 만든다", `export const run = (ms: number) => new (Object.getPrototypeOf(new Date(ms ?? 0)).constructor)().getTime();`, ["constructor"]],
    ["글을 실행해 지금 시각을 읽는다", `export const run = () => eval(["Da", "te.now()"].join(""));`, ["eval"]],
    ["함수 생성자로 글을 실행한다", `export const run = () => Function(["return Da", "te.now()"].join(""))();`, ["Function"]],
    ["전역의 생성자를 거슬러 올라가 바깥에서 글을 실행한다", `export const run = () => Function("return this")().constructor.constructor(["return ", "D", "ate.now()"].join(""))();`, ["Function", "constructor"]],
    ["전역에 물려 든 생성자를 거슬러 올라가 글을 실행한다", `export const run = () => (globalThis as unknown as { constructor: { constructor: (code: string) => () => number } }).constructor.constructor(["return Da", "te.now()"].join(""))();`, ["constructor", "globalThis"]],
    ["값의 생성자를 거슬러 올라가 글을 실행한다", `export const run = () => (0 as unknown as { constructor: { constructor: (code: string) => () => number } }).constructor.constructor(["return Da", "te.now()"].join(""))();`, ["constructor"]],
    ["날짜를 주지 않은 format", `export const run = () => new Intl.DateTimeFormat("en", { timeZone: "UTC", second: "2-digit", fractionalSecondDigits: 3 }).format();`, ["인자 없는 format"]],
    ["시간대를 주지 않은 날짜 꼴", `export const run = () => new Intl.DateTimeFormat("en-US", { year: "numeric" }).formatToParts(new Date(0)).length;`, []],
    ["실행 환경의 시간대를 묻는다", `export const run = () => new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).resolvedOptions().timeZone;`, []],
    ["로컬 시각을 읽는다", `export const run = () => new Date(0).getHours();`, []],
    ["시간대를 적지 않은 날짜 글을 푼다", `export const run = () => Date.parse("2026-11-13T00:00:00");`, ["Date"]],
    ["시간대를 적지 않은 날짜 글로 날짜를 만든다", `export const run = () => new Date("2026-11-13T00:00:00").getTime();`, ["Date"]],
    ["받아 온 글에 시간대가 없다", `export const run = (text: string) => Date.parse(text ?? "2026-11-13T00:00:00");`, []],
    ["연, 월, 일을 따로 주어 로컬 시각으로 날짜를 만든다", `export const run = () => new Date(2026, 10, 13).getTime();`, ["Date"]],
    ["오류의 스택을 읽는다", `export const run = () => new Error("synthetic").stack;`, ["stack"]],
    ["엔진이 던진 오류의 스택을 읽는다", `export const run = () => { try { return (null as unknown as { x: string }).x; } catch (error) { return (error as Error).stack; } };`, ["stack"]],
    ["이름을 계산해서 오류의 스택을 읽는다", `export const run = () => (new RangeError("x") as unknown as Record<string, unknown>)[["st", "ack"].join("")];`, []],
    ["값에 스택을 붙여 읽는다", `export const run = () => { const holder: { stack?: string } = {}; Error.captureStackTrace(holder); return holder.stack; };`, ["captureStackTrace", "stack"]],
    ["지원하는 로캘을 묻는다", `export const run = () => Intl.DateTimeFormat.supportedLocalesOf(["ko", "en"]).length;`, []],
    ["로캘을 빈 목록으로 준 날짜 꼴", `export const run = () => new Intl.DateTimeFormat([], { timeZone: "UTC", month: "long" }).formatToParts(new Date(0)).length;`, []],
    ["로캘을 주지 않은 날짜 꼴", `export const run = () => new Intl.DateTimeFormat(undefined, { timeZone: "UTC", month: "long" }).format(new Date(0));`, []],
    ["실행 환경이 지원하지 않는 로캘을 준 날짜 꼴", `export const run = () => new Intl.DateTimeFormat("zz-ZZ", { timeZone: "UTC", month: "long" }).format(new Date(0));`, []],
    ["지원하지 않는 로캘만 든 목록을 준 날짜 꼴", `export const run = () => new Intl.DateTimeFormat(["zz-ZZ", "qaa"], { localeMatcher: "lookup", timeZone: "UTC", month: "long" }).formatToParts(new Date(0)).length;`, []],
    ["Math.random", `export const run = () => Math.random();`, ["Math"]],
    ["Math에 별명을 붙인다", `const M = Math;\nexport const run = () => M.random();`, ["Math"]],
    ["crypto의 난수", `export const run = () => crypto.randomUUID();`, ["crypto"]],
    ["process", `export const run = () => process.env.HOME ?? null;`, ["process"]],
    ["process를 구조 분해로 꺼낸다", `const { env } = process;\nexport const run = () => Object.keys(env).length;`, ["process"]],
    ["performance.now", `export const run = () => performance.now();`, ["performance"]],
  ];
  it.each(LEAKS)("시계나 난수나 실행 환경을 읽는 글: %s", (_name, source, expected) => {
    expect(leaksOf(source)).toEqual(expected);
  });
  it.each(LEAKS)("빈 실행 환경에서 돌리면 던진다: %s", (_name, source) => {
    // 막아 둔 것을 불렀거나(순수하지 않다), 그 환경에 없는 전역을 찾았거나(is not defined), 글을 실행하려 했다(Code generation from strings disallowed)
    expect(() => sandboxed({ source }, "run")).toThrow(/순수하지 않다|is not defined|Code generation from strings disallowed/);
  });
  it("빈 실행 환경에서는 글을 실행하지 못한다. 시계를 읽지 않는 글이어도 같다", () => {
    expect(() => sandboxed({ source: `export const run = () => eval(["1", "+ 1"].join(" "));` }, "run")).toThrow(/Code generation from strings disallowed/);
    expect(() => sandboxed({ source: `export const run = () => Function(["return", "1"].join(" "))();` }, "run")).toThrow(/Code generation from strings disallowed/);
  });
  it("실행 파일의 위치를 읽는 것은 글로 걸린다. 빈 실행 환경에는 그 위치가 없어서 돌려서는 걸리지 않는다", () => {
    expect(leaksOf(`export const run = () => import.meta.url;`)).toEqual(["import.meta"]);
    expect(leaksOf(`export const run = () => import.meta.dirname;`)).toEqual(["import.meta"]);
    expect(leaksOf(`export const run = () => __dirname + __filename;`)).toEqual(["__dirname", "__filename"]);
    expect(sandboxed({ source: `export const run = () => typeof import.meta.url;` }, "run")).toBe(JSON.stringify("undefined"));
  });
  it("오류를 만들고 던지고 메시지를 읽는 것은 걸리지 않는다. 스택을 읽을 때만 걸린다", () => {
    const source = `export const run = (limit: number): string => { try { if (limit > 0) throw new RangeError("범위를 벗어났다"); return "지나감"; } catch (error) { return (error as Error).name + " " + (error as Error).message; } };`;
    expect(leaksOf(source)).toEqual([]);
    expect(sandboxed({ source }, "run", "1")).toBe(JSON.stringify("RangeError 범위를 벗어났다"));
  });
  it("빈 실행 환경에서 던진 오류는 메시지만 밖으로 나온다. 밖에서 그 스택을 읽어도 던지지 않고, 그 환경의 스택이 실리지 않는다", () => {
    let caught: unknown;
    try {
      sandboxed({ source: `export const run = () => { throw new TypeError("안에서 던졌다"); };` }, "run");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("안에서 던졌다");
    expect(typeof (caught as Error).stack).toBe("string");
  });
  it("준 로캘 가운데 실행 환경이 지원하는 것이 하나라도 있으면 걸리지 않는다. 그 로캘로 꼴을 만든다", () => {
    // 지원하지 않는 로캘 뒤에 지원하는 로캘을 적으면 실행 환경의 로캘로 돌아가지 않는다. 지역을 모르는 로캘(en-ZZ)은 그 언어의 로캘로 푼다
    const source = `export const run = (ms: number) => [["zz-ZZ", "en-US"], ["en-US"], "en-US", "en-ZZ"].map((locales) => new Intl.DateTimeFormat(locales, { timeZone: "UTC", month: "long" }).format(new Date(ms)));`;
    expect(leaksOf(source)).toEqual([]);
    expect(sandboxed({ source }, "run", "0")).toBe(JSON.stringify(["January", "January", "January", "January"]));
  });
  it("이름을 계산해서 가져오는 것은 글로 걸린다. 따라갈 수 없으므로 꼴 자체를 허용하지 않는다", () => {
    expect(leaksOf(`export const run = (name: string) => import(name);`)).toEqual(["import()"]);
  });
  it("globalThis를 거쳐도 글로 걸린다", () => {
    expect(leaksOf(`export const run = () => globalThis.Date.now();`)).toEqual(["Date", "globalThis"]);
  });
  it("받아 온 시각을 다루는 꼴, 주석, 타입 자리는 걸리지 않고, 빈 실행 환경에서도 돈다", () => {
    const source = [
      "// Date.now()와 process.env는 쓰지 않는다",
      "/** new Date()도 Math.random()도 쓰지 않는다 */",
      "const partsOf = (when: Date, timeZone: string): number => new Intl.DateTimeFormat(\"en-US\", { timeZone, year: \"numeric\", month: \"2-digit\" }).formatToParts(when).length;",
      "export const run = (ms: number): string =>",
      "  new Date(Date.UTC(2026, 0, 1) + Date.parse(\"2026-01-01T00:00:00Z\") + Math.floor(ms) + Math.max(0, partsOf(new Date(ms), \"Asia/Seoul\"))).toISOString();",
    ].join("\n");
    expect(leaksOf(source)).toEqual([]);
    expect(sandboxed({ source }, "run", "1.5")).toBe(JSON.stringify(new Date(Date.UTC(2026, 0, 1) + Date.parse("2026-01-01T00:00:00Z") + 1 + 3).toISOString()));
  });
  it("시간대를 적은 날짜 글과 날짜만 적은 글은 빈 실행 환경에서도 풀린다", () => {
    const source = `export const run = () => [Date.parse("2026-11-13T00:00:00Z"), Date.parse("2026-11-13T09:00:00+09:00"), Date.parse("2026-11-13"), new Date("2026-11-13T00:00:00.000Z").getTime()];`;
    const utc = Date.UTC(2026, 10, 13);
    expect(sandboxed({ source }, "run")).toBe(JSON.stringify([utc, utc, utc, utc]));
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/checkup-input.test.ts test/core/purity.test.ts`
Expected: FAIL. `../../src/commands/checkup-input.ts`를 찾지 못한다. `test/core/purity.test.ts`의 시험 아흔여섯은 통과한다(core가 이미 순수하다).

- [ ] **Step 3: 구현한다**

`scripts/dev-evaluate.ts`(새 파일):

```ts
// 개발용. 이 PC의 기록과 셋팅으로 규칙 스물둘을 재서 값, 점수, 등급을 숫자로 낸다. 이름, 경로, 글은 내지 않고 아무것도 저장하지 않는다
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { gatherCheckupInput } from "../src/commands/checkup-input.ts";
import { evaluate } from "../src/core/evaluate.ts";
import { NO_SELF } from "../src/core/installs/candidates.ts";
import { stateDir } from "../src/state/folder.ts";
import { loadState } from "../src/state/state.ts";

const clock = { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
// 상태 파일은 읽기만 한다. 없으면 이 실행에서만 쓰는 무작위 값으로 첫 점검처럼 본다
const loaded = await loadState(stateDir(homedir()));
const state = loaded.status === "ok" ? loaded.state : { salt: randomBytes(32).toString("hex"), installs: null };

const started = performance.now();
const gathered = await gatherCheckupInput({ env: process.env, homedir: homedir(), tmpdir: tmpdir(), platform: process.platform, clock, cacheDir: null, rescan: false, state, self: NO_SELF });
const gatherSeconds = (performance.now() - started) / 1000;
const evaluateStarted = performance.now();
const result = evaluate(gathered.input);
const evaluateSeconds = (performance.now() - evaluateStarted) / 1000;

const tally = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
const rounded = (value: number | null): number | null => (value === null ? null : Number(value.toFixed(4)));

console.log(
  JSON.stringify(
    {
      seconds: { gather: Number(gatherSeconds.toFixed(2)), evaluate: Number(evaluateSeconds.toFixed(3)) },
      rulesVersion: result.rulesVersion,
      windows: result.windows,
      state: { status: loaded.status, records: state.installs === null ? null : state.installs.length },
      score: result.score,
      axes: result.axes,
      findings: result.findings.map((finding) => ({
        ruleId: finding.ruleId,
        category: finding.category,
        status: finding.status,
        reason: finding.reason,
        value: rounded(finding.value),
        score: rounded(finding.score),
        severity: finding.severity,
        gain: finding.gain,
        evidence: finding.evidence,
        tools: finding.tools.map((tool) => ({ tool: tool.tool, status: tool.status, reason: tool.reason, value: rounded(tool.value), score: rounded(tool.score), evidence: tool.evidence, candidates: tool.candidates.length })),
        candidates: finding.candidates.length,
      })),
      candidates: tally(result.candidates, (candidate) => candidate.unit),
      tools: result.tools.map((tool) => ({
        tool: tool.tool,
        scored: tool.scored,
        inCalendar: tool.inCalendar,
        responses: tool.totals.responses,
        humanRequests: tool.totals.humanRequests,
        mainSessions: tool.totals.mainSessions.length,
        activeDays: tool.totals.activeDates.length,
        skillBundles: { enabled: tally(tool.skills.filter((bundle) => bundle.enabled), (bundle) => bundle.verdict), disabled: tool.skills.filter((bundle) => !bundle.enabled).length, excluded: tally(tool.skills.filter((bundle) => bundle.excluded !== null), (bundle) => bundle.excluded!) },
        servers: { enabled: tally(tool.servers.filter((judged) => judged.server.enabled), (judged) => judged.verdict), disabled: tool.servers.filter((judged) => !judged.server.enabled).length, excluded: tally(tool.servers.filter((judged) => judged.excluded !== null), (judged) => judged.excluded!) },
      })),
      safeguards: result.safeguards,
      projects: { used: result.projects.projects.length, unlinkedSessions: result.projects.unlinkedSessions, withoutInstructions: result.missingInstructions.length, overlapFound: result.worstOverlap !== null },
      complete: gathered.input.tools.map((tool) => tool.complete),
    },
    null,
    2,
  ),
);
```

`src/commands/checkup-input.ts`(새 파일):

```ts
// 점검의 입력 묶음을 모은다. 기록을 읽고, 셋팅을 스캔하고, 지난 점검까지의 관측 기록을 붙여 core가 받는 모양으로 만든다. 경로의 정규화처럼 순수하지 않은 일은 여기서 끝낸다(설계 7.2, 8, 10 「프로젝트 목록」, 12.1)
import { normalizePath } from "../adapters/claude/locate.ts";
import { claudeObservation, CLAUDE_COVERAGE } from "../adapters/claude/observation.ts";
import { SHELL_TOOLS } from "../adapters/claude/parser.ts";
import { makeWindows } from "../adapters/common/dates.ts";
import { collectClaude, unreadableCount, type ClaudeCollectResult, type EvalClock } from "../collect/claude.ts";
import type { EvaluationInput } from "../core/evaluate.ts";
import type { SelfIdentity } from "../core/installs/candidates.ts";
import { scanClaudeSetup } from "../scan/claude.ts";
import type { ClaudeSetupFacts } from "../scan/types.ts";
import type { StateFile } from "../state/state.ts";

export interface CheckupInputOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 평가 시계. 점검을 시작한 시각과 시간대 */
  clock: EvalClock;
  /** 캐시 폴더. null이면 캐시를 읽지도 쓰지도 않는다 */
  cacheDir: string | null;
  /** 캐시와 수정 시각 거르기를 믿지 않고 모두 다시 읽는다 */
  rescan: boolean;
  /** 지난 점검까지의 상태. 무작위 값은 MCP 서버 정의의 지문에 섞고, 관측 기록은 설치 판정에 쓴다 */
  state: Pick<StateFile, "salt" | "installs">;
  /** 이 도구 자신. 정비 후보에서 뺀다 */
  self: SelfIdentity;
  /** 관리 정책 파일의 폴더. 주지 않으면 OS의 자리다 */
  managedDir?: string;
}

export interface CheckupInput {
  input: EvaluationInput;
  collected: ClaudeCollectResult;
  facts: ClaudeSetupFacts;
}

const CLAUDE_AI_PREFIX = "claude.ai ";

export async function gatherCheckupInput(options: CheckupInputOptions): Promise<CheckupInput> {
  const collected = await collectClaude({ env: options.env, homedir: options.homedir, clock: options.clock, cacheDir: options.cacheDir, rescan: options.rescan });
  const { summaries } = collected;

  // 프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더(세션마다 처음 적힌 것 하나)로 만든다. 하위 세션과 작업 폴더가 없는 세션은 넣지 않는다
  const collectDates = new Set(makeWindows(options.clock.nowMs, options.clock.timeZone).collectDates);
  const cwds = new Set<string>();
  const claudeAiNames = new Set<string>();
  const normalizedCwds: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const summary of summaries) {
    if (summary.cwd !== null) normalizedCwds[summary.cwd] = normalizePath(summary.cwd, options.platform);
    const days = Object.entries(summary.days);
    if (summary.kind === "main" && summary.cwd !== null && days.some(([date, day]) => collectDates.has(date) && day.responses > 0)) cwds.add(summary.cwd);
    // 정의가 PC에 없는 claude.ai 연결은 기록에 남은 이름으로만 알 수 있다
    for (const [, day] of days) {
      for (const name of [...day.loadedMcpServers, ...Object.keys(day.mcpAttributions)]) if (name.startsWith(CLAUDE_AI_PREFIX)) claudeAiNames.add(name);
    }
  }

  const facts = await scanClaudeSetup({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    cwds: [...cwds].sort(),
    claudeAiNames: [...claudeAiNames].sort(),
    salt: options.state.salt,
    ...(options.managedDir === undefined ? {} : { managedDir: options.managedDir }),
  });

  const unreadable = unreadableCount(collected.read);
  const input: EvaluationInput = {
    clock: options.clock,
    tools: [
      {
        tool: "claude-code",
        summaries,
        coverage: CLAUDE_COVERAGE,
        shellTools: [...SHELL_TOOLS].sort(),
        complete: { skills: claudeObservation(summaries, unreadable, "skill").complete, mcp: claudeObservation(summaries, unreadable, "mcp").complete },
        setup: facts,
      },
    ],
    projects: facts.projects,
    normalizedCwds: { ...normalizedCwds },
    installs: options.state.installs,
    self: options.self,
  };
  return { input, collected, facts };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core test/commands`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 20개, 시험 501개.

- [ ] **Step 5: 순수성 검사가 실제로 잡는지 확인한다**

core의 파일 하나에 금지된 것을 잠깐 넣어 검사가 실패하는지 보고 되돌린다.

```bash
cp src/core/score.ts "$TEMP/score.ts.bak"
printf "import { join } from 'node:path';\nconst Clock = Date;\nexport const leak = (): string => join('a', String(Clock.now()));\n" >> src/core/score.ts
npx vitest run test/core/purity.test.ts
cp "$TEMP/score.ts.bak" src/core/score.ts && rm "$TEMP/score.ts.bak"
git status --short src/core/score.ts
```

Expected: 시험 아흔여섯 가운데 일곱이 FAIL이다. 하나는 `src/core/score.ts ← node:path`를, 하나는 `src/core/score.ts: Date`를 알린다. 작은따옴표로 쓴 가져오기와 별명을 붙인 시계라서 금지한 글을 찾는 검사로는 잡히지 않는 것이다. 나머지 다섯은 빈 실행 환경에서 평가를 돌리다 던진 것이다(합성 사용자 다섯). 되돌린 뒤 `git status`는 아무것도 내지 않는다.

- [ ] **Step 6: 이 PC에서 개발용 스크립트를 돌려 본다**

Run: `node scripts/run-ts.mjs scripts/dev-evaluate.ts`
Expected: JSON 하나가 나온다. `findings`가 22개이고 `ruleId`가 모두 다르다. `score.aq`는 0에서 100 사이의 정수이거나, `null`이고 `withheld`에 까닭이 있다. `axes`의 점수는 정수이거나 `null`이다. 이름, 경로, 글이 없다. 결과는 저장소에 넣지 않는다.

- [ ] **Step 7: 커밋한다**

```bash
git add test/commands/checkup-input.test.ts test/core/purity.test.ts scripts/dev-evaluate.ts src/commands/checkup-input.ts
git commit -m "feat: 점검 입력 조립과 개발용 평가 스크립트 추가"
```

---

### Task 21: 전체 검사, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~20의 결과물 전부.
- Produces: `develop`에 병합된 2단계 2부. 3부 계획이 기대는 것은 `evaluate`, `gatherCheckupInput`, `updateInstalls`와 `unseenInUnreadablePlace`다.

- [ ] **Step 1: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 파일 50개·시험 876개 통과(2단계 1부까지의 32개·374개에 이 계획이 더한 것), 마지막 줄이 `묶음 검사 통과`. Windows 밖에서는 1부의 시험 1개를 건너뛴다.

- [ ] **Step 2: 묶음이 달라지지 않았는지 확인한다**

2부는 명령 입구를 고치지 않으므로 묶은 실행 파일이 그대로여야 한다.

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 아무것도 내지 않는다. 달라졌으면 묶음에 들어가면 안 되는 것이 들어간 것이다. 어느 파일이 명령 입구에서 닿는지 찾아 고친다.

- [ ] **Step 3: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS. 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 4: 원장을 고치고 커밋한다**

원장의 2단계 2부 구현 과제를 끝남으로 적고 커밋 해시와 확인한 것을 세부에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 2단계 2부 구현 결과를 적음"
```

- [ ] **Step 5: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage2-2.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~20의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 순수성 검사가 실제로 잡는지 본 것), 「확인하지 못한 것」이다. 확인하지 못한 것에는 아래를 적는다. macOS와 Linux의 실제 기기에서 돌려 보지 않았다. 도구가 둘일 때의 계산(도구별 평균, F3의 주로 쓴 도구, F4와 F6을 합치는 법)은 지어낸 두 번째 도구로만 시험했다. 기준값과 무게는 설계의 초기값이고 실제 사용자들의 분포로 맞춘 것이 아니다(설계 26). 설치 판정의 ㉯, ㉲, ㉳는 관측 기록이 쌓인 상태 파일이 아직 없어 지어낸 기록으로만 시험했다. 정비 후보는 목록만 내고 실제로 꺼 본 적이 없다. 플러그인 서버를 막는 이름은 확정하지 않았다(설계 16.2). 평가에 든 이름과 경로를 어디까지 싣는지는 3부가 정한다. 이 PC의 숫자, 경로, 이름은 넣지 않는다.

```bash
git push -u origin 2단계-2-평가엔진
gh pr create --base develop --head 2단계-2-평가엔진 --title "feat: 2단계 2부 평가 엔진" --body-file "$TEMP/aq-pr-stage2-2.md"
```

- [ ] **Step 6: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(2단계 2부 전용, 검증량이 많으므로 둘) 다음을 나눠 맡긴다. 한 짝은 코드 정독이다. 설계 9.2, 9.7, 11, 12.1, 12.2, 16.2, 18.1과 이 계획을 `src/core/`와 1부에 더한 것에 대조하고, 규칙마다 못 재는 이유의 차례와 경계값의 반례를 따로 지어 본다. 다른 짝은 실행이다. `npm run check`를 다시 돌리고, 이 PC의 기록과 셋팅을 **구조만**(종류, 열쇠 이름, 개수) 따로 세어 `dev-evaluate`의 근거 숫자와 대조한다. 대조할 것은 점수 구간의 사용한 날 수, 주 세션 수, 사람 요청 수, 응답 수, 훅 실행과 실패의 수, 자동 압축이 있었던 주 세션 수, 지침이 실린 주 세션 수, 켜져 있는 스킬 묶음과 MCP 서버의 수, 점수 구간에 주 세션이 있었던 프로젝트 수, 전역 지침의 줄 수다. 두 짝에게 서로의 결론을 미리 알려 주지 않는다. 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과(돌린 검사와 남은 선택 지적)를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 2단계-2-평가엔진 --body-file "$TEMP/aq-pr-stage2-2.md"`).

- [ ] **Step 7: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 사용자가 병합을 주 세션에 맡겼지만, 그것은 묻지 않고 병합할 권한이지 검증을 미룰 근거가 아니어서 Step 6 뒤에 둔다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 2단계-2-평가엔진 --merge --subject "feat: 2단계 2부 평가 엔진을 develop에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 3부에 넘기는 것

2부가 만들지 않고 3부 계획이 다룰 것이다.

**3부 계획을 쓰기 전에 먼저 확인할 것이 하나 있다.** 지침 첨부가 남지 않는 주 세션의 까닭이다. 작성자 PC에서는 전역 지침을 쓰는데도 응답이 있는 주 세션 다섯에 하나꼴로 지침 첨부가 남지 않았고 까닭은 보지 못했다(설계 11.3 E4, 27). E4는 그런 세션을 표본에서 뺀다(근거 숫자 `skippedSessions`). 빠지는 세션이 한쪽으로 몰려 있으면(짧은 세션, 이어서 연 세션, 어느 버전) E4의 값도 한쪽으로 틀린다. 설계 세션은 이 확인을 2부 계획에 넘겼고 2부는 하지 못했다. 실제 기록을 조사하지 않아서 까닭도 오차의 크기도 모른다. 3부에서는 문구와 조립보다 먼저, 기록의 종류와 열쇠 이름과 개수만으로 까닭을 가릴 수 있는지 본다. 몰려 있다는 것이 확인되면 E4의 표본과 관측 범위를 다시 정하고 설계와 이 계획의 과제 5, 7이 만든 코드를 고친다.

| 무엇 | 2부가 남긴 재료 |
|---|---|
| 평가 결과의 조립(설계 12.2의 `schema`, `appVersion`, `evaluatedAt`, `tools[]`, `coverage`, `usage`, `deepHints[]`, `notices[]`) | `Evaluation`(규칙, 점수, 분류, 후보)과 `ToolEvaluation.totals`, `CheckupInput.collected`(읽은 양), `CheckupInput.facts` |
| 문구(영어와 한국어의 제목, 설명, 처방, 어떻게 쟀나, 못 잰 이유의 낱말) | 규칙마다의 근거 숫자와 이유, S2의 `safeguards`, F3의 `missingInstructions`, F4의 `worstOverlap`, 스킬 묶음과 서버마다의 판정 |
| 도구별 값의 관측 범위(봄, 대신 봄, 못 봄) | 규칙마다 쓰는 관측 범위의 열쇠는 `src/core/metrics/`에 있다. 규칙 표로 옮겨 싣는다 |
| 평가에 든 이름과 경로를 결과 파일과 화면에 어디까지 싣는지(설계 19) | 평가는 스킬, 서버, 프로젝트의 사실을 그대로 담고 있다 |
| 관측 기록을 고쳐 상태 파일에 저장하는 일. 점수에 넣는 도구인지와 상관없이 한다(설계 18.1) | `updateInstalls(previous, installKeysOf(facts), today, unseenInUnreadablePlace(facts))`(과제 4) |
| 이 도구 자신의 정체(`SelfIdentity`)의 값 | `gatherCheckupInput`의 `self`. 스킬 폴더의 실제 경로는 실행 파일의 위치에서 얻는다. 플러그인의 이름은 4단계에서 정해진다 |
| 점수 이력, 결과 파일, `aq checkup --no-open`, 터미널 요약 | `gatherCheckupInput`과 `evaluate` |
| 같은 설치가 사실 둘로 남는 것을 화면에 한 번만 보이기. 스캐너가 같은 플러그인을 두 길로 찾으면 스킬 위치, MCP 서버, 플러그인의 사실이 둘씩 온다(과제 15, 16). 세는 수는 하나로 맞췄고 목록에는 둘로 남는다. 화면에만 닿는 일이 아니다. 플러그인 끄기는 같은 설치 ID의 사실이 둘이면 후보를 내지 않으므로(과제 17), 같은 플러그인을 두 길로 찾은 PC에서는 그 플러그인의 끄기 후보가 나오지 않는다. 후보가 있어야 정비할 것에 실리는 E5의 분류와 기준의 정비할 것 수도 그만큼 달라진다. 기준 점수와 AQ는 같다. 스캐너에서 합친다면 설치 ID만으로 합치지 말고 실제 경로, 범위와 프로젝트, 읽지 못한 것을 함께 본다. 사용자와 프로젝트에 따로 깐 것은 계속 따로다 | 스킬 묶음의 `positions`, 서버 판정 목록의 `installKey`, 플러그인의 설치 ID |
| 원본이 없어진 캐시의 정리(1부에서 넘어온 것) | 1단계의 캐시 |

그 뒤의 단계에서 다시 정할 것은 설계 27에 있다. Codex의 스캐너를 넣기 전(5단계)에 합침 규칙에서 한 도구의 설정만 읽지 못했을 때와 F4가 어느 도구의 것끼리 견주는지를, 정비를 만들기 전(6단계)에 플러그인 서버를 막는 이름을 확정한다.

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 7.2 | core는 순수하다. 평가 시계는 입력으로 받는다 | 5~19(지키는 검사는 20) |
| 9.2, 9.3 | 어느 숫자에 주 세션만 넣고 어느 숫자에 하위 세션을 합치는지. 점수 구간과 수집 구간. 점수에 넣는 도구와 달력에 넣는 도구 | 5, 19 |
| 9.3 | 세션과 세션 사이의 빠짐(작업 폴더가 같은 주 세션의 묶음, 작업 폴더가 없는 세션, 시작한 날을 모르는 세션, 처음 목록이 없는 세션) | 13 |
| 9.7 | 관측 범위. 못 보는 지표는 0이 아니라 그 도구를 그 규칙에서 뺀다 | 7, 8, 9, 15, 16 |
| 10 | 프로젝트 목록(수집 구간에 응답이 있는 주 세션의 작업 폴더), 프로젝트로 보지 않는 폴더와 지금 PC에 없는 폴더를 규칙마다 다르게 다루기, 설치와 기록의 이름 잇기 | 8, 11, 13, 20 |
| 11.3 셋팅 | S1(200바이트), S2(㉠과 ㉡, 훅을 제한하는 설정, 버전으로 가르는 기본 모드, 읽지 못한 설정), S3(사용자가 고치는 것만, 같은 실제 파일은 한 번), S4, S5(켜져 있는 서버, 읽지 못했을 때) | 7, 9, 10 |
| 11.3 효율 | E1, E2(셸 명령 제외), E3, E4(표본), E5와 E6(판정, 조건 ④의 ㉮~㉳, 14일과 30일의 경계, 스킬 묶음, 읽지 못했을 때, 판정할 수 있는 대상, 못 재는 까닭의 차례), E7 | 5, 7, 13~16 |
| 11.3 상황 적합 | F1(강도의 차례), F2, F3(대상, 주로 쓴 도구, 지침이 있다는 것), F4(목록 전체, 줄), F5(사본의 점수), F6(사용자 설정과 프로젝트 쪽), 견주는 것을 읽지 못하면 재지 않는다 | 1, 7, 10, 11 |
| 11.3 강도 | I1~I4. 도구를 합치고 날짜와 프로젝트는 합집합 | 8 |
| 11.4 | 상태와 이유(하나만, 차례), 규칙마다의 이유, 도구별 규칙의 평균과 남는 도구가 없을 때의 이유, 기준 점수, AQ, 반올림, 등급, 점수를 내지 않는 때 | 6, 7~9, 11, 15, 16, 18 |
| 11.5 | 분류(정비할 수 있는 규칙의 두 조건 포함), 심각도, 예상 효과, 차례 | 18 |
| 11.6 | 등급과 단계 | 6, 18 |
| 12.1 | 입력 묶음. 관측 기록은 판정에만 쓰고 같은 날 다시 점검해도 결과가 같다 | 14, 19, 20 |
| 12.2 | 규칙마다 내는 것, 도구별 값, 값이 없는 자리는 `null`, 근거 숫자, 차례가 끝까지 정해져 있다 | 7~9, 11, 15~19 |
| 16.2 | A1, A2, A3의 조건. 같이 꺼지는 스킬, 훅을 볼 수 없는 켜진 플러그인, 같은 이름의 서버, 못 잰 도구의 후보, 이 도구 자신 | 17 |
| 18.1 | 읽지 못한 곳에 든 설치의 관측 기록을 고치지 않는다. 링크로 건 플러그인은 실제 경로로 옮겨 견준다 | 3, 4 |
| 20.1 | 못 재는 까닭이 여럿일 때, 읽지 못했을 때 규칙마다의 처리, 기록 폴더가 없을 때 | 9, 11, 15, 16, 19, 20 |
| 21.1 | 규칙(기준값의 경계, 못 재는 이유마다의 결과, 분모 0, 무게 계산, 도구별 평균과 합침), 점수(합성 사용자 다섯, 등급의 경계), 결정성(캐시를 켜고 끈 경우, 차례를 섞은 경우, 연달아 두 번) | 6~20 |

2부에 넣지 않은 것은 「3부에 넘기는 것」에 적었다. 5단계에서 한다. Codex의 어댑터와 스캐너, Codex의 안전장치 조건, A4. 6단계에서 한다. 정비 후보의 적용과 되돌리기.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드는 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 도구가 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본에서 과제 1부터 20까지 차례대로 만들었다(Windows 11, Node.js 24). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제마다 시험만 놓고 돌리면 실패하고, 구현을 놓으면 그 과제의 확인 명령(타입 검사와 관계있는 시험 폴더)이 통과했다. 과제 20 뒤의 `npm run check`는 시험 파일 50개·시험 876개가 통과했고 `묶음 검사 통과`였다. 묶은 실행 파일은 달라지지 않았다. 다 만든 복제본의 파일은 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다.

연습 작업 폴더에서 따로 확인한 것은 이렇다. 합성 사용자 다섯이 기대한 등급을 받았다. 같은 입력 묶음의 평가는 입력의 차례를 뒤집어도, 캐시를 켜고 꺼도, 연달아 두 번 돌려도 글자 하나 다르지 않았다. core의 파일에 Node.js 모듈과 시계 읽기를 잠깐 넣으면 순수성 검사가 실패했다. 개발용 스크립트는 이 PC의 기록과 셋팅에서 끝까지 돌아 규칙 스물둘의 값과 등급을 냈다(숫자는 저장소 밖 기록에만 둔다).

리뷰에서 고친 곳은 틀린 구현을 하나씩 넣어 시험이 실패하는지 봤다(변이). 여든다섯 가지를 한 번에 하나씩 넣고 되돌렸고 모두 시험이 잡았다. 구현을 틀리게 바꾼 것이 마흔하나다. 맞춘 점수를 기준 점수 계산에 넣은 것(규칙 점수와 도구별 평균), 경계와 견줄 때 맞추지 않은 것(분류, 심각도, 예상 효과, 잘하고 있는 것의 차례), 맞추는 자리를 아홉째로 바꾼 것, 스킬 위치와 서버와 주 세션의 차례에서 마지막 견줌을 뺀 것, 정체가 같은 서버 사실을 사실마다 센 것(E6과 S5), 정체가 없는 서버를 하나로 묶은 것, 정체가 같은 사실의 판정을 모두 불렀을 때만 불렀다로 합친 것, 못 재는 까닭의 차례를 바꾼 것 넷, 심각도 0.6의 등호, A2의 30일을 하루씩 옮긴 것, 같이 꺼지는 스킬을 폴더 이름으로만 찾은 것, 이 도구 자신을 후보를 낸 묶음에서만 본 것, 훅이 내용을 넣어 주는 스킬에 쓴 신호를 센 것, 작업 폴더가 없는 세션을 한 묶음으로 본 것, 시작한 날을 모르는 세션을 뺀 것, S5에서 스킬 폴더를 뺀 것, 링크로 건 플러그인의 읽지 못한 폴더를 옮겨 견주지 않은 것 들이다. 순수성 검사 자체를 틀리게 바꾼 것이 스물아홉이다(펼친 인자나 둘째 인자를 허용한 것, 빈 실행 환경을 보통 객체로 만든 것, 글 실행을 허용한 것, 오류의 스택을 막지 않은 것, 그 환경의 오류를 그대로 밖으로 던진 것, 날짜 꼴의 로캘을 실행 환경이 지원하는지 보지 않거나 준 로캘이 모두 지원돼야 받게 한 것, 지원하는 로캘을 묻는 것을 막은 뒤에 챙긴 것, 막아 둔 것을 하나씩 푼 것). core의 파일에 누출을 넣은 것이 열다섯이다. 그 가운데 열하나는 평가가 지나는 길에 넣었다. 여섯은 두 검사가 모두 잡았고, 다섯은 글로는 걸리지 않는 꼴이라 돌려서 보는 검사만 잡았다.

확인하지 못한 것은 이렇다. 고치지 않은 곳의 변이는 이 문서를 만들며 넣어 보지 않았다(리뷰 1차의 짝 검증이 고치기 전의 계획에 마흔한 가지를 넣었고, 살아남은 아홉 가지를 잡는 시험을 이 계획에 보탰다). 날짜 꼴의 로캘을 볼 때 준 맞춤 방식(`localeMatcher`)을 그대로 넘기는 것은 시험이 가르지 못한다. Node.js 24에서 로캘 사천오백여 개를 견줘 두 방식(`lookup`, `best fit`)의 지원 여부가 갈리는 것을 찾지 못했다. macOS와 Linux, 기본 로캘이 다른 실행 환경에서는 돌려 보지 않았다. 이 PC의 결과가 실제 기록과 맞는지를 따로 세어 대조하는 일은 구현 단계의 짝 검증(과제 21의 Step 6)이 다시 한다.
