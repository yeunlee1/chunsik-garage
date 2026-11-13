# AQ 점검 2단계 3부 — 점검 결과의 조립과 저장(aq checkup) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 이 PC의 기록으로 돌린 점검의 독립 대조로 검증한다.

**Goal:** 2부의 평가와 수집 결과에서 설계 12.2의 평가 결과(문장과 단위는 빼고)를 조립하고, 터미널에 전할 요약과 실행 기록을 내고, 평가 결과 파일·점수 이력·상태(관측 기록)를 저장하고 캐시를 정리하는 `aq checkup [--no-open] [--no-save] [--rescan]`을 만든다.

**Architecture:** 평가 결과의 조립은 `src/core/result/`의 순수 함수로만 한다(설계 7.2). `checkupResult(source)`가 입력 묶음, 2부의 평가, 도구마다의 수집 결과, 프로그램 버전, 상태 파일이 깨졌는지를 받아 평가 결과 하나를 낸다. 안에서는 도구 목록, 읽은 양, 사용 기록, 관측 범위, 알림, 정밀 점검 단서를 따로 만들어 합친다. `checkupSummary(result)`가 그 결과에서 이름과 경로를 뺀 요약을 낸다. 파일을 읽고 쓰는 일은 `src/state/`(결과 파일, 이력, 상태, 캐시 정리)와 `src/commands/checkup.ts`(`runCheckup`)가 맡고, `src/cli.ts`가 옵션을 받아 요약과 실행 기록을 표준 출력에 낸다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 1단계, 2단계 1부·2부와 같다. 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계의 7.4(`aq checkup`), 9.7과 9.8(관측 범위, 읽은 양, 달력의 날짜 범위), 12.2(평가 결과 가운데 문장과 단위를 뺀 것), 12.3(실행 기록과 요약), 13.1(달력의 세 상태, E6 항목의 정보), 17(정밀 점검 단서), 18.1(이력과 관측 기록의 저장), 19.1과 19.2(무엇이 어디까지 가나, 결과 폴더와 캐시의 정리), 20.1과 20.2(알림, 쓸 수 없는 곳)를 구현한다. 로드맵은 `docs/superpowers/plans/2026-11-12-aq-roadmap.md`, 앞 계획은 `2026-11-13-aq-stage2-1-setup-scanner.md`와 `2026-11-13-aq-stage2-2-evaluation-engine.md`다.

## 3부를 둘로 나눈 까닭

로드맵은 2단계 3부에 평가 결과의 조립, 문구(영어와 한국어), 관측 기록과 이력의 저장, `aq checkup --no-open`을 두었다. 2부를 끝내고 3부의 재료를 세어 보니 한 계획으로 쓰면 2부만큼 커진다. 2부를 나눌 때와 같은 까닭으로 다시 나눈다. 문구는 결과의 모양과 근거 숫자가 정해지고 실제 기록에 돌려 본 뒤에 써야 칸이 정해진다. 로드맵 문서와 설계(「2단계 3부 계획에서 보완」)를 함께 고친다.

| 부분 | 내용 | 끝나면 돌려 볼 수 있는 것 |
|---|---|---|
| 3부(이 계획) | 평가 결과의 조립(문장과 단위를 뺀 전부), 터미널 요약과 실행 기록, 결과 파일·이력·상태의 저장과 캐시 정리, `aq checkup [--no-open] [--no-save] [--rescan]` | `aq checkup --no-open`이 평가 결과 파일과 요약(문장은 아직 없다)을 낸다 |
| 4부(3부 뒤에 쓴다) | 문구(영어와 한국어의 제목, 설명, 처방, 어떻게 쟀나, 못 잰 이유의 낱말, 알림, 진단과 별명, 덧붙이는 말), 잰 값의 단위, `--lang`과 언어의 차례 | 로드맵 2단계의 "끝나면 돌려 볼 수 있는 것" 전부 |

3부는 명령 입구를 고치므로 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)이 달라진다. 과제 16에서 다시 묶어 커밋한다.

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- **`src/core/`는 순수하다**(설계 7.2). 평가 결과의 조립(`src/core/result/`)도 파일을 열지 않고, 시계를 직접 읽지 않고, Node.js 모듈과 바깥 패키지를 값으로 가져오지 않는다. 타입만 가져오는 것(`import type`)은 된다. core 밖에서 값으로 가져오는 것은 2부와 같이 `src/adapters/common/dates.ts`와 `src/adapters/common/version.ts`뿐이다. 2부 과제 20의 순수성 검사가 새 파일도 그대로 본다.
- **같은 입력 묶음이면 평가 결과는 글자 하나 다르지 않다**(설계 12.1, 12.2). 목록은 정해진 차례로 낸다. 입력의 차례에 기대지 않는다. 캐시를 쓴 파일 수처럼 실행마다 다른 것은 평가 결과가 아니라 실행 기록에 둔다(설계 12.3).
- **못 잰 것은 0이 아니다**(설계 12.2). 값이 없는 자리는 `null`이다. 모르는 것을 아는 것처럼 지어내지 않는다(예. 수집 결과가 없는 도구에 "관측이 빠짐없다"를 지어내지 않는다).
- **표준 출력에는 요약과 실행 기록만 낸다**(설계 12.3, 19.1). 스킬, 서버, 프로젝트의 이름과 경로가 든 평가 결과 전체는 파일로만 둔다. 요약의 알림은 종류, 정해진 값, 수만 싣는다.
- **상태 폴더 안의 것을 지우기 전에 실제 경로가 상태 폴더 안인지 본다**(설계 19.2). 점검 때의 정리는 이 도구가 쓴 것(시각 꼴의 결과 파일, 항목 꼴의 캐시 파일)만 지운다. 링크인 폴더의 안은 지우지 않는다.
- **상태 폴더에 쓰지 못해도 실패로 끝내지 않는다**(설계 20.2). 남은 저장을 멈추고 저장 없는 실행으로 바꾸고 알린다.
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더와 OS의 관리 정책 폴더를 읽지도 쓰지도 않는다(설계 21.1).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이다(사용자 전역 지침).
- 깃. `develop`에서 `2단계-3-점검결과` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증은 병합 앞의 관문이다.
- 이 PC의 기록과 셋팅에서 잰 숫자, 경로, 이름은 저장소와 병합 요청에 넣지 않는다(설계 머리말).

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `5EDE7AB0C19A676DE66560725430D52FD1AB0E800066736C80FD423C3FF37FFD`, 3,756줄)이다. 3부 계획을 쓰기 전에 「2단계 3부 계획 전 확인(2026-11-13, 주 세션)」을 더했다(지침 첨부가 남지 않는 주 세션의 까닭. 2부의 코드는 고치지 않는다). 이 계획을 쓰며 정한 것은 「2단계 3부 계획에서 보완(2026-11-13, 주 세션)」의 열여덟 가지와 알림 표다. 과제마다 그 번호를 적었다. 계획은 저장소 밖의 연습 작업 폴더에서 과제마다 시험과 구현을 실제로 쓰고 돌려서 만들었다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/state/reports.ts` | 1 | 평가 결과 파일의 이름(시각), 결과 폴더와 OS 임시 폴더에 쓰기, 최근 20번만 남기기(이번 점검의 결과는 늘 남긴다) |
| `src/state/folder.ts`(고침) | 1 | 점검 때의 정리가 쓰는 재귀 없는 파일 지우기(지우기 직전에 위 폴더의 자리를 다시 본다) |
| `src/state/history.ts` | 2 | 점수 이력의 한 줄과 덧붙이기 |
| `src/state/cache.ts`(고침) | 3 | 원본이 없어진 캐시 항목의 정리(읽지 못한 항목은 남긴다) |
| `src/state/next-state.ts` | 4 | 상태 열기(깨졌으면 새 상태)와 점검 뒤의 상태(마지막 점검 시각, 관측 기록) |
| `src/core/result/tools.ts` | 5 | 수집 결과의 모양(`CollectedTool`)과 평가 결과의 도구 목록 |
| `src/core/result/coverage.ts` | 6 | 읽은 양, 읽지 못한 비율과 아래 경계, 지표마다의 관측 |
| `src/core/result/usage.ts` | 7 | 사용 기록, 35일 달력, 도구별 나눔 |
| `src/core/result/observed.ts` | 8 | 규칙마다 쓰는 지표의 표와 도구별 값의 관측 범위 |
| `src/core/result/notices.ts` | 9, 10 | 알림 열세 종류와 차례 |
| `src/core/result/hints.ts` | 11 | 정밀 점검 단서 셋 |
| `src/core/result/assemble.ts` | 12 | 평가 결과의 조립과 따로 둔 자리(E6 항목의 정보) |
| `src/core/result/summary.ts` | 13 | 이름과 경로를 뺀 터미널 요약 |
| `src/commands/self.ts` | 14 | 이 도구 자신의 정체 |
| `src/commands/checkup.ts` | 15 | 점검 실행과 저장, 실행 기록 |
| `src/commands/checkup-input.ts`, `src/state/state.ts`(고침) | 15 | 수집 결과를 더 내기, 상태 폴더 자리의 파일을 상태 파일이 없는 것으로 보기, 상태를 쓰다 막히면 임시 파일 지우기 |
| `src/cli.ts`(고침), `skills/aq/scripts/aq.mjs`(다시 묶음) | 16 | `aq checkup` 명령 입구 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/3`처럼 차례를 적었고 적힌 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 16의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험 폴더와 타입 검사다. 전체 검사(`npm run check`)는 마지막 과제에서 돌린다.

---

### Task 1: 평가 결과 파일의 이름(시각)과 결과 폴더 정리, 저장 없는 실행의 임시 파일

**Files:**
- Create: `src/state/reports.ts`
- Modify: `src/state/folder.ts`
- Test: `test/state/reports.test.ts`

**Interfaces:**
- Consumes: 1부의 `expectedRealDir`(`src/state/folder.ts`), `normalizePath`(`src/adapters/claude/locate.ts`).
- Produces: `resultStamp(nowMs: number): string`, `writeResult(stateDir: string, stamp: string, result: unknown): Promise<string>`, `writeTempResult(tmpdir: string, stamp: string, result: unknown): Promise<string>`, `staleReports(stateDir: string, keep?: number, keepStamp?: string | null): Promise<StaleReports>`(고르기), `pruneReports(stateDir: string, keep?: number, keepStamp?: string | null): Promise<PruneReport>`(`{ removed: number; skipped: "state" | "reports" | null }`), `KEEP_REPORTS`(20), `REPORTS_DIR`. `src/state/folder.ts`에 `removeFiles(paths: readonly string[], root: string, boundary: string): Promise<RemoveFilesReport>`(`{ removed: number; linked: number }`. 재귀 없는 파일 지우기. root는 상태 폴더, boundary는 그 실제 경로)를 더한다. 과제 3과 과제 15가 쓴다.

설계 「2단계 3부 계획에서 보완」의 2번과 3번이다. 평가 시계를 UTC로 `2026-11-13T13-23-34-938Z` 꼴로 적어 글자 차례가 시각 차례가 되게 한다. `aq clean`(1부)은 이미 이름의 확장자를 뗀 것이 가장 큰 쌍을 남기므로 이 꼴과 맞는다.

- 점검 때의 정리는 이 도구가 쓰는 이름(시각 꼴의 `.json`과 `.html`)인 보통 파일만 본다. 사용자가 둔 다른 이름의 파일, 폴더, 링크는 건드리지도 세지도 않는다. `aq clean`과 기준이 다른 까닭은 사용자가 시킨 지우기가 아니기 때문이다.
- 남기는 수는 점검의 수다. 한 점검의 결과 화면과 평가 결과 파일은 한 번으로 센다. 결과 화면은 3단계에 만든다.
- 고르기(`staleReports`)와 지우기(`removeFiles`)를 나눈다. 지우기는 보통 파일만 지우고 폴더 안으로 내려가지 않는다. 고른 뒤 다른 프로그램이 그 자리를 폴더나 링크로 바꿨으면 지우지 않고 넘긴다. 지우기 직전에 다시 보통 파일인지, 위 폴더의 실제 경로가 상태 폴더 안이고 있어야 할 자리(상태 폴더의 실제 경로 아래 같은 이름)인지 본다. 고른 뒤 위 폴더가 상태 폴더 안의 다른 곳을 가리키는 링크로 바뀌었으면 지우지 않는다(짝 Codex 1의 계획 리뷰 2차). 그 수(`linked`)를 돌려주고, 정리 함수는 그것을 링크라서 하지 않은 정리(`skipped`)로 돌려줘 실행 알림에 남게 한다(계획 리뷰 3차). 1부의 `removeTree`(재귀)는 사용자가 시킨 `aq clean`만 쓴다. 상태 폴더나 결과 폴더가 링크면 지우지 않고 그것을 돌려준다(설계 19.2).
- 이번 점검의 시각(`keepStamp`)은 시계가 뒤로 가 있어도 늘 남기고 20번에 넣어 센다. 결과 폴더에 이번보다 뒤 시각의 결과가 20번 있어도 방금 쓴 결과가 지워지지 않는다(짝 Codex 1의 계획 리뷰 1차). 그 시각의 결과가 결과 폴더에 없으면 자리를 맡지 않는다(계획 리뷰 2차).
- 쓰기는 임시 파일에 쓰고 이름을 바꾼다. 같은 이름(같은 평가 시계)이면 덮어쓴다. 쓰다가 막히면 임시 파일을 지운다(지우기마저 막히면 남는다). 임시 파일 이름에는 프로세스 번호가 들어가 다른 프로세스의 임시 파일은 건드리지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/state/reports.test.ts`(새 파일):

```ts
// 평가 결과 파일의 이름(시각), 결과 폴더에 쓰기와 오래된 결과 정리, 저장 없는 실행의 임시 파일을 시험한다(설계 12.3, 13.2, 19.2)
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeFiles } from "../../src/state/folder.ts";
import { KEEP_REPORTS, pruneReports, resultStamp, staleReports, writeResult, writeTempResult } from "../../src/state/reports.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

const stampAt = (minute: number): string => resultStamp(Date.UTC(2026, 10, 13, 9, minute, 0, 5));

describe("결과 파일의 시각", () => {
  it("평가 시계를 UTC로 적고 콜론과 점을 쓰지 않는다", () => {
    expect(resultStamp(Date.UTC(2026, 10, 13, 13, 23, 34, 938))).toBe("2026-11-13T13-23-34-938Z");
    expect(resultStamp(Date.UTC(2026, 0, 2, 3, 4, 5, 6))).toBe("2026-01-02T03-04-05-006Z");
  });

  it("글자 차례가 시각 차례와 같다", () => {
    const times = [Date.UTC(2026, 10, 13, 9, 0, 0, 999), Date.UTC(2026, 10, 13, 10, 0, 0, 0), Date.UTC(2026, 11, 1, 0, 0, 0, 0), Date.UTC(2027, 0, 1, 0, 0, 0, 0), Date.UTC(2026, 10, 13, 9, 0, 1, 0)];
    const byText = times.map(resultStamp).sort();
    const byTime = [...times].sort((a, b) => a - b).map(resultStamp);
    expect(byText).toEqual(byTime);
  });
});

describe("결과 폴더에 쓰기", () => {
  it("결과 폴더를 만들어 <시각>.json에 쓰고 경로를 돌려준다. 임시 파일이 남지 않는다", async () => {
    const stamp = stampAt(1);
    const path = await writeResult(dir, stamp, { schema: 1, aq: 80 });
    expect(path).toBe(join(dir, "reports", `${stamp}.json`));
    expect(await readFile(path, "utf8")).toBe(`${JSON.stringify({ schema: 1, aq: 80 }, null, 2)}\n`);
    expect(await readdir(join(dir, "reports"))).toEqual([`${stamp}.json`]);
  });

  it("같은 시각의 결과가 이미 있으면 덮어쓴다", async () => {
    const stamp = stampAt(1);
    await writeResult(dir, stamp, { n: 1 });
    await writeResult(dir, stamp, { n: 2 });
    expect(JSON.parse(await readFile(join(dir, "reports", `${stamp}.json`), "utf8"))).toEqual({ n: 2 });
    expect(await readdir(join(dir, "reports"))).toEqual([`${stamp}.json`]);
  });

  it("결과 파일을 쓰지 못하면 임시 파일을 남기지 않는다", async () => {
    const stamp = stampAt(1);
    await mkdir(join(dir, "reports", `${stamp}.json`), { recursive: true });
    await expect(writeResult(dir, stamp, { n: 1 })).rejects.toBeDefined();
    expect(await readdir(join(dir, "reports"))).toEqual([`${stamp}.json`]);
  });

  it("저장 없는 실행은 임시 폴더에 chunsik-garage-result-<시각>.json으로 쓴다", async () => {
    const stamp = stampAt(2);
    const path = await writeTempResult(root, stamp, { schema: 1 });
    expect(path).toBe(join(root, `chunsik-garage-result-${stamp}.json`));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ schema: 1 });
  });
});

describe("오래된 결과 정리", () => {
  it("최근 20번의 점검만 남긴다. 한 점검의 결과 화면과 평가 결과 파일은 한 번으로 센다", async () => {
    expect(KEEP_REPORTS).toBe(20);
    for (let minute = 0; minute < 23; minute++) {
      await put(join(dir, "reports", `${stampAt(minute)}.json`), "{}");
      if (minute % 2 === 0) await put(join(dir, "reports", `${stampAt(minute)}.html`), "<html>");
    }
    // 지우는 점검은 0, 1, 2분의 셋이고 파일로는 다섯이다(0분과 2분에는 결과 화면도 있다)
    const removed = await pruneReports(dir);
    expect(removed).toEqual({ removed: 5, skipped: null });
    const left = (await readdir(join(dir, "reports"))).sort();
    const stamps = [...new Set(left.map((name) => name.replace(/\.[^.]*$/, "")))].sort();
    expect(stamps).toEqual(Array.from({ length: 20 }, (_, index) => stampAt(index + 3)));
    expect(left).toContain(`${stampAt(4)}.html`);
    expect(left).not.toContain(`${stampAt(2)}.html`);
  });

  it("남길 수를 줄 수 있다. 결과 폴더가 없으면 지울 것이 없다", async () => {
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: null });
    await put(join(dir, "reports", `${stampAt(1)}.json`), "{}");
    await put(join(dir, "reports", `${stampAt(2)}.json`), "{}");
    expect(await pruneReports(dir, 1)).toEqual({ removed: 1, skipped: null });
    expect(await readdir(join(dir, "reports"))).toEqual([`${stampAt(2)}.json`]);
  });

  it("시각 꼴이 아닌 이름, 폴더, 링크는 건드리지 않고 세지도 않는다", async () => {
    const reports = join(dir, "reports");
    for (let minute = 0; minute < 3; minute++) await put(join(reports, `${stampAt(minute)}.json`), "{}");
    await put(join(reports, "notes.txt"), "mine");
    await put(join(reports, "2026-11-13.json"), "{}");
    await put(join(reports, `${stampAt(0)}.json.tmp`), "{}");
    await mkdir(join(reports, `${stampAt(9)}.json`));
    const outside = join(root, "outside");
    await put(join(outside, "keep.json"), "{}");
    await linkDir(outside, join(reports, `${stampAt(8)}.html`));
    expect(await pruneReports(dir, 1)).toEqual({ removed: 2, skipped: null });
    expect((await readdir(reports)).sort()).toEqual([`${stampAt(0)}.json.tmp`, `${stampAt(2)}.json`, `${stampAt(8)}.html`, `${stampAt(9)}.json`, "2026-11-13.json", "notes.txt"].sort());
    expect(await readdir(outside)).toEqual(["keep.json"]);
  });

  it("결과 폴더가 링크면 안을 지우지 않는다", async () => {
    const outside = join(root, "elsewhere");
    for (let minute = 0; minute < 3; minute++) await put(join(outside, `${stampAt(minute)}.json`), "{}");
    await mkdir(dir, { recursive: true });
    await linkDir(outside, join(dir, "reports"));
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: "reports" });
    expect((await readdir(outside)).length).toBe(3);
  });

  it("상태 폴더 자체가 링크면 안을 지우지 않는다", async () => {
    const real = join(root, "real-state");
    for (let minute = 0; minute < 3; minute++) await put(join(real, "reports", `${stampAt(minute)}.json`), "{}");
    await linkDir(real, dir);
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: "state" });
    expect((await readdir(join(real, "reports"))).length).toBe(3);
    expect((await lstat(dir)).isSymbolicLink()).toBe(true);
  });

  it("이번 점검의 결과는 시계가 뒤로 가 있어도 늘 남기고 20번에 넣어 센다", async () => {
    for (let minute = 10; minute < 30; minute++) await put(join(dir, "reports", `${stampAt(minute)}.json`), "{}");
    const current = await writeResult(dir, stampAt(5), { now: true });
    expect(await pruneReports(dir, KEEP_REPORTS, stampAt(5))).toEqual({ removed: 1, skipped: null });
    const left = (await readdir(join(dir, "reports"))).sort();
    expect(left).toHaveLength(20);
    expect(left).toContain(`${stampAt(5)}.json`);
    expect(left).not.toContain(`${stampAt(10)}.json`);
    expect(JSON.parse(await readFile(current, "utf8"))).toEqual({ now: true });
  });

  it("이번 점검의 시각에 결과가 없으면 남길 자리를 맡지 않는다. 결과가 있으면 남길 수가 0이어도 남긴다", async () => {
    const reports = join(dir, "reports");
    for (let minute = 0; minute < 3; minute++) await put(join(reports, `${stampAt(minute)}.json`), "{}");
    expect((await staleReports(dir, 1, stampAt(9))).paths).toEqual([join(reports, `${stampAt(0)}.json`), join(reports, `${stampAt(1)}.json`)]);
    expect((await staleReports(dir, 0, stampAt(0))).paths).toEqual([join(reports, `${stampAt(1)}.json`), join(reports, `${stampAt(2)}.json`)]);
  });

  it("고른 뒤 지우기 전에 그 자리가 폴더로 바뀌면 폴더와 그 안은 지우지 않는다", async () => {
    const reports = join(dir, "reports");
    for (let minute = 0; minute < 3; minute++) await put(join(reports, `${stampAt(minute)}.json`), "{}");
    const stale = await staleReports(dir, 1);
    expect(stale.paths).toEqual([join(reports, `${stampAt(0)}.json`), join(reports, `${stampAt(1)}.json`)]);
    await rm(join(reports, `${stampAt(0)}.json`));
    await put(join(reports, `${stampAt(0)}.json`, "user-data.txt"), "keep me");
    expect(await removeFiles(stale.paths, dir, stale.boundary!)).toEqual({ removed: 1, linked: 0 });
    expect(await readFile(join(reports, `${stampAt(0)}.json`, "user-data.txt"), "utf8")).toBe("keep me");
    expect((await readdir(reports)).sort()).toEqual([`${stampAt(0)}.json`, `${stampAt(2)}.json`]);
  });

  it("고른 뒤 결과 폴더가 상태 폴더 안의 다른 폴더를 가리키는 링크로 바뀌면 그 안의 파일은 지우지 않는다", async () => {
    const reports = join(dir, "reports");
    for (let minute = 0; minute < 3; minute++) await put(join(reports, `${stampAt(minute)}.json`), "{}");
    const stale = await staleReports(dir, 1);
    await rename(reports, join(dir, "reports-moved"));
    const other = join(dir, "tune");
    await put(join(other, `${stampAt(0)}.json`), "keep me");
    await linkDir(other, reports);
    // 지우지 않고 넘긴 것을 세어 돌려준다. 정리 함수는 이것을 링크라서 하지 않은 정리로 알린다
    expect(await removeFiles(stale.paths, dir, stale.boundary!)).toEqual({ removed: 0, linked: 1 });
    expect(await readFile(join(other, `${stampAt(0)}.json`), "utf8")).toBe("keep me");
  });

  it("파일만 지우는 함수는 링크와 없는 것을 넘기고, 상태 폴더 밖의 파일은 지우지 않고 멈춘다", async () => {
    await mkdir(dir, { recursive: true });
    const boundary = (await staleReports(dir)).boundary!;
    const outsideFile = join(root, "outside.json");
    await put(outsideFile, "{}");
    await mkdir(join(root, "elsewhere"), { recursive: true });
    await linkDir(join(root, "elsewhere"), join(dir, "reports", "link.json"));
    expect(await removeFiles([join(dir, "reports", "link.json"), join(dir, "reports", "missing.json")], dir, boundary)).toEqual({ removed: 0, linked: 0 });
    await expect(removeFiles([outsideFile], dir, boundary)).rejects.toMatchObject({ code: "EOUTSIDE" });
    expect(await readFile(outsideFile, "utf8")).toBe("{}");
  });

  it("보통 파일만 남길 시각으로 센다. 폴더만 있는 시각은 남길 몫을 차지하지 않는다", async () => {
    const reports = join(dir, "reports");
    await put(join(reports, `${stampAt(1)}.json`), "{}");
    await mkdir(join(reports, `${stampAt(5)}.json`), { recursive: true });
    await writeFile(join(reports, `${stampAt(3)}.json`), "{}");
    expect(await pruneReports(dir, 1)).toEqual({ removed: 1, skipped: null });
    expect((await readdir(reports)).sort()).toEqual([`${stampAt(3)}.json`, `${stampAt(5)}.json`]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/state/reports.test.ts`
Expected: FAIL. `src/state/reports.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/state/folder.ts`(찾을 곳 1/2):

```ts
// 상태 폴더(~/.chunsik-garage)의 위치와 그 안에 두는 것, 크기 재기와 지우기. 링크(심볼릭 링크·정션)는 따라가지 않는다(설계 7.4, 19.2)
import { lstat, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";

```

`src/state/folder.ts`(바꾼 뒤 1/2):

```ts
// 상태 폴더(~/.chunsik-garage)의 위치와 그 안에 두는 것, 크기 재기와 지우기. 링크(심볼릭 링크·정션)는 따라가지 않는다(설계 7.4, 19.2)
import { lstat, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";

```

`src/state/folder.ts`(찾을 곳 2/2):

```ts
}

/**
 * 경로를 지운다. 폴더 안의 링크는 링크 자체만 지우고 따라가지 않는다. 지운 파일 수와 바이트를 돌려준다.
```

`src/state/folder.ts`(바꾼 뒤 2/2):

```ts
}

export interface RemoveFilesReport {
  /** 지운 파일의 수 */
  removed: number;
  /** 고른 뒤 위 폴더가 상태 폴더 안의 다른 곳을 가리키는 링크로 바뀌어 지우지 않은 파일의 수 */
  linked: number;
}

/**
 * 보통 파일만 지운다. 폴더 안으로 내려가지 않는다. 고른 뒤 지우기 전에 다른 프로그램이 그 자리를 폴더나 링크로 바꿨으면 지우지 않고 넘긴다.
 * 지우기 직전에 다시 보통 파일인지와 위 폴더의 실제 경로가 boundary 안인지 본다. 벗어나면 EOUTSIDE로 던진다.
 * 위 폴더의 실제 경로가 있어야 할 자리(root에서 그 폴더까지의 이름을 boundary 아래에 둔 것)와 다르면, 그 사이의 폴더가 상태 폴더 안의 다른 곳을 가리키는 링크로 바뀐 것이라 넘기고 linked로 센다.
 * 없어진 것은 넘긴다. 지운 파일과 링크 때문에 넘긴 파일의 수를 돌려준다. root는 상태 폴더, boundary는 그 실제 경로(expectedRealDir)다.
 * 점검 때의 정리(오래된 결과, 원본이 없어진 캐시)가 쓴다. 사용자가 시킨 aq clean의 지우기는 removeTree다(설계 19.2).
 */
export async function removeFiles(paths: readonly string[], root: string, boundary: string): Promise<RemoveFilesReport> {
  const report: RemoveFilesReport = { removed: 0, linked: 0 };
  for (const path of paths) {
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    if (!info.isFile()) continue;
    const parent = dirname(path);
    await assertInside(parent, boundary, true);
    if (normalizePath(await realpath(parent)) !== normalizePath(join(boundary, relative(root, parent)))) {
      report.linked++;
      continue;
    }
    await unlink(path);
    report.removed++;
  }
  return report;
}

/**
 * 경로를 지운다. 폴더 안의 링크는 링크 자체만 지우고 따라가지 않는다. 지운 파일 수와 바이트를 돌려준다.
```

`src/state/reports.ts`(새 파일):

```ts
// 평가 결과 파일을 결과 폴더(reports/)나 OS 임시 폴더에 쓰고, 결과 폴더에서 최근 20번의 점검만 남긴다. 이름의 시각은 평가 시계를 UTC로 적어 글자 차례가 시각 차례다(설계 12.3, 13.2, 19.2)
import { lstat, mkdir, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { expectedRealDir, removeFiles } from "./folder.ts";

export const REPORTS_DIR = "reports";
/** 결과 폴더에 남기는 점검의 수. 한 점검의 결과 화면과 평가 결과 파일을 한 번으로 센다 */
export const KEEP_REPORTS = 20;
const TEMP_PREFIX = "chunsik-garage-result-";
/** 이 도구가 결과 폴더에 쓰는 이름. 시각 뒤에 결과 화면(.html)이나 평가 결과 파일(.json)이 붙는다 */
const STAMPED = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.(json|html)$/;

/** 평가 시계의 UTC 시각을 파일 이름에 쓸 수 있게 적는다. 2026-11-13T13-23-34-938Z 꼴이다 */
export function resultStamp(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/[:.]/g, "-");
}

/** 임시 파일에 쓰고 이름을 바꾼다. 실패하면 임시 파일을 남기지 않는다 */
async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** 결과 폴더에 <시각>.json으로 쓰고 경로를 돌려준다. 같은 이름이 있으면 덮어쓴다 */
export async function writeResult(stateDir: string, stamp: string, result: unknown): Promise<string> {
  const reports = join(stateDir, REPORTS_DIR);
  await mkdir(reports, { recursive: true });
  const path = join(reports, `${stamp}.json`);
  await writeJson(path, result);
  return path;
}

/** 저장 없는 실행의 평가 결과 파일. OS 임시 폴더에 쓰고 경로를 돌려준다(설계 12.3, 20.2) */
export async function writeTempResult(tmpdir: string, stamp: string, result: unknown): Promise<string> {
  const path = join(tmpdir, `${TEMP_PREFIX}${stamp}.json`);
  await writeJson(path, result);
  return path;
}

export interface StaleReports {
  /** 링크라서 안을 보지 않은 것. state는 상태 폴더 자체, reports는 결과 폴더다 */
  skipped: "state" | "reports" | null;
  /** 상태 폴더가 있어야 할 실제 경로(지우기 전의 경계) */
  boundary: string | null;
  /** 지울 결과 파일(경로 차례) */
  paths: string[];
}

/**
 * 결과 폴더에서 지울 결과 파일을 고른다. 이 도구가 쓴 이름(시각 꼴)의 보통 파일만 보고 시각으로 묶어 최근 keep번만 남긴다.
 * keepStamp(이번 점검의 시각)의 결과가 있으면 시계가 뒤로 가 있어도 늘 남기고 keep번에 넣어 센다. 그 결과가 없으면 자리를 맡지 않는다.
 * 사용자가 둔 다른 이름의 파일, 폴더, 링크는 고르지도 세지도 않는다.
 */
export async function staleReports(stateDir: string, keep: number = KEEP_REPORTS, keepStamp: string | null = null): Promise<StaleReports> {
  let dirInfo;
  try {
    dirInfo = await lstat(stateDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { skipped: null, boundary: null, paths: [] };
    throw error;
  }
  const boundary = await expectedRealDir(stateDir);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath(stateDir)) !== boundary) return { skipped: "state", boundary: null, paths: [] };
  const reports = join(stateDir, REPORTS_DIR);
  let info;
  try {
    info = await lstat(reports);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { skipped: null, boundary, paths: [] };
    throw error;
  }
  if (info.isSymbolicLink()) return { skipped: "reports", boundary: null, paths: [] };
  if (!info.isDirectory()) return { skipped: null, boundary, paths: [] };

  const files: { name: string; stamp: string }[] = [];
  for (const name of await readdir(reports)) {
    const match = STAMPED.exec(name);
    if (match === null) continue;
    if ((await lstat(join(reports, name))).isFile()) files.push({ name, stamp: match[1]! });
  }
  const stamps = new Set(files.map((file) => file.stamp));
  const others = [...stamps].filter((stamp) => stamp !== keepStamp).sort().reverse();
  // 이번 점검의 시각은 그 결과가 결과 폴더에 있을 때만 한 자리를 맡는다. 있으면 남길 수가 0이어도 남긴다
  const kept = new Set(keepStamp !== null && stamps.has(keepStamp) ? [keepStamp, ...others.slice(0, Math.max(keep - 1, 0))] : others.slice(0, keep));
  const paths = files
    .filter((file) => !kept.has(file.stamp))
    .map((file) => join(reports, file.name))
    .sort();
  return { skipped: null, boundary, paths };
}

export interface PruneReport {
  /** 지운 파일의 수 */
  removed: number;
  /** 링크라서 안을 지우지 않은 것. state는 상태 폴더 자체, reports는 결과 폴더다(고른 뒤 결과 폴더가 링크로 바뀐 것도 든다) */
  skipped: "state" | "reports" | null;
}

/**
 * 오래된 결과 파일을 지운다(설계 19.2). 고른 뒤 지우기 직전에 다시 보통 파일인지, 위 폴더가 있어야 할 자리인지 본다. 그 사이 폴더나 링크로 바뀐 것과 위 폴더가 링크로 바뀐 것은 지우지 않는다.
 * keepStamp는 이번 점검의 시각이다. 방금 쓴 결과는 늘 남는다.
 */
export async function pruneReports(stateDir: string, keep: number = KEEP_REPORTS, keepStamp: string | null = null): Promise<PruneReport> {
  const stale = await staleReports(stateDir, keep, keepStamp);
  if (stale.boundary === null || stale.paths.length === 0) return { removed: 0, skipped: stale.skipped };
  const result = await removeFiles(stale.paths, stateDir, stale.boundary);
  // 고른 뒤 결과 폴더가 링크로 바뀌어 지우지 않은 것이 있으면 링크라서 하지 않은 정리로 알린다
  return { removed: result.removed, skipped: result.linked > 0 ? "reports" : null };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/state`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 38개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/state/reports.test.ts src/state/folder.ts src/state/reports.ts
git commit -m "feat: 평가 결과 파일의 이름과 결과 폴더 정리 추가"
```

---

### Task 2: 점수 이력 한 줄

**Files:**
- Create: `src/state/history.ts`
- Test: `test/state/history.test.ts`

**Interfaces:**
- Consumes: 2부의 `Overall`, `AxisScore`, `AXES`(`src/core/scoreboard.ts`), `Axis`(`src/core/rules.ts`).
- Produces: `historyEntry(evaluation: { rulesVersion; score: Overall; axes: readonly AxisScore[] }, nowMs: number): HistoryEntry`, `appendHistory(stateDir: string, entry: HistoryEntry): Promise<void>`, `HISTORY_FILE`(`history.jsonl`). `HistoryEntry`는 `{ at, aq, axes: Record<Axis, number | null>, missingAxes: Axis[], rulesVersion }`이다. 과제 15가 쓴다.

설계 18.1의 한 줄(시각, AQ, 기준 점수, 빠진 기준, 규칙 버전)이다(「2단계 3부 계획에서 보완」의 4번). 시각은 평가 시계다. 빠진 기준은 2부의 `Overall.missingAxes`를 그대로 쓴다.

- 앞 줄이 줄바꿈 없이 끝나 있으면(쓰다 끊겼다) 줄바꿈을 먼저 넣어 새 줄이 붙지 않게 한다. 빈 파일에는 바로 쓴다.
- 이력을 읽는 것은 결과 화면(3단계)의 몫이라 이 과제에 없다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/state/history.test.ts`(새 파일):

```ts
// 점수 이력(history.jsonl)의 한 줄 만들기와 덧붙이기를 시험한다(설계 12.3, 18.1)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxisScore, Overall } from "../../src/core/scoreboard.ts";
import { appendHistory, HISTORY_FILE, historyEntry } from "../../src/state/history.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

const axes = (setup: number | null, efficiency: number | null, fit: number | null, intensity: number | null): AxisScore[] => [
  { axis: "setup", score: setup, strengths: 0, repairs: 0 },
  { axis: "efficiency", score: efficiency, strengths: 0, repairs: 0 },
  { axis: "fit", score: fit, strengths: 0, repairs: 0 },
  { axis: "intensity", score: intensity, strengths: 0, repairs: 0 },
];
const scored: Overall = { aq: 82, grade: "A", tier: 4, withheld: [], missingAxes: [] };

describe("이력의 한 줄", () => {
  it("평가 시계의 시각, AQ, 기준 점수, 빠진 기준, 규칙 버전을 담는다", () => {
    const entry = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13, 1, 2, 3, 4));
    expect(entry).toEqual({ at: "2026-11-13T01:02:03.004Z", aq: 82, axes: { setup: 88, efficiency: 74, fit: 69, intensity: 97 }, missingAxes: [], rulesVersion: "1.0.0" });
  });

  it("점수를 못 낸 기준은 null이고 빠진 기준에 기준의 차례로 든다. AQ를 내지 않았으면 null이다", () => {
    const entry = historyEntry({ rulesVersion: "1.0.0", score: { aq: null, grade: null, tier: null, withheld: ["too_few_days"], missingAxes: ["setup", "fit"] }, axes: axes(null, 74, null, 97) }, Date.UTC(2026, 10, 13));
    expect(entry.aq).toBeNull();
    expect(entry.axes).toEqual({ setup: null, efficiency: 74, fit: null, intensity: 97 });
    expect(entry.missingAxes).toEqual(["setup", "fit"]);
  });
});

describe("이력에 덧붙이기", () => {
  it("폴더와 파일을 만들어 한 줄을 쓰고, 다음 점검은 줄을 더한다", async () => {
    const first = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13));
    const second = { ...first, at: "2026-11-14T00:00:00.000Z", aq: 83 };
    await appendHistory(dir, first);
    await appendHistory(dir, second);
    const text = await readFile(join(dir, HISTORY_FILE), "utf8");
    expect(text).toBe(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
  });

  it("앞 줄이 줄바꿈 없이 끝나 있으면 줄바꿈을 먼저 넣어 새 줄이 붙지 않게 한다", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, HISTORY_FILE), '{"at":"2026-11-12T00:00:00.000Z","aq":80');
    const entry = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13));
    await appendHistory(dir, entry);
    const lines = (await readFile(join(dir, HISTORY_FILE), "utf8")).split("\n");
    expect(lines).toEqual(['{"at":"2026-11-12T00:00:00.000Z","aq":80', JSON.stringify(entry), ""]);
  });

  it("빈 파일에는 줄바꿈 없이 바로 쓴다", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, HISTORY_FILE), "");
    const entry = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13));
    await appendHistory(dir, entry);
    expect(await readFile(join(dir, HISTORY_FILE), "utf8")).toBe(`${JSON.stringify(entry)}\n`);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/state/history.test.ts`
Expected: FAIL. `src/state/history.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/state/history.ts`(새 파일):

```ts
// 점수 이력(history.jsonl)에 점검마다 한 줄(시각, AQ, 기준 점수, 빠진 기준, 규칙 버전)을 더한다. 결과 화면의 이력 그래프가 읽는다(설계 12.3, 18.1)
import { appendFile, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { Axis } from "../core/rules.ts";
import { AXES, type AxisScore, type Overall } from "../core/scoreboard.ts";

export const HISTORY_FILE = "history.jsonl";

export interface HistoryEntry {
  /** 평가 시계(점검을 시작한 시각, ISO) */
  at: string;
  aq: number | null;
  /** 기준 점수. 그 기준의 규칙을 하나도 못 쟀으면 null이다 */
  axes: Record<Axis, number | null>;
  /** 점수를 못 낸 기준(기준의 차례) */
  missingAxes: Axis[];
  rulesVersion: string;
}

/** 평가에서 이력의 한 줄을 만든다(순수) */
export function historyEntry(evaluation: { rulesVersion: string; score: Overall; axes: readonly AxisScore[] }, nowMs: number): HistoryEntry {
  const byAxis = new Map(evaluation.axes.map((axis) => [axis.axis, axis.score]));
  const axes = Object.fromEntries(AXES.map((axis) => [axis, byAxis.get(axis) ?? null])) as Record<Axis, number | null>;
  return { at: new Date(nowMs).toISOString(), aq: evaluation.score.aq, axes, missingAxes: [...evaluation.score.missingAxes], rulesVersion: evaluation.rulesVersion };
}

/** 마지막 바이트가 줄바꿈이 아니면 참이다. 파일이 없거나 비었으면 거짓이다 */
async function endsMidLine(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  try {
    const { size } = await handle.stat();
    if (size === 0) return false;
    const last = Buffer.alloc(1);
    await handle.read(last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } finally {
    await handle.close();
  }
}

/** 이력에 한 줄을 더한다. 앞 줄이 줄바꿈 없이 끝나 있으면(쓰다 끊겼다) 줄바꿈을 먼저 넣어 새 줄이 붙지 않게 한다 */
export async function appendHistory(stateDir: string, entry: HistoryEntry): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  const path = join(stateDir, HISTORY_FILE);
  const prefix = (await endsMidLine(path)) ? "\n" : "";
  await appendFile(path, `${prefix}${JSON.stringify(entry)}\n`);
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/state`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 4개, 시험 43개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/state/history.test.ts src/state/history.ts
git commit -m "feat: 점수 이력 한 줄 덧붙이기 추가"
```

---

### Task 3: 원본이 없어진 캐시 정리

**Files:**
- Modify: `src/state/cache.ts`
- Test: `test/state/cache-prune.test.ts`
- Test: `test/state/prune-entry.test.ts`

**Interfaces:**
- Consumes: 1단계의 캐시(`src/state/cache.ts`의 `storeCached`, 항목 이름은 정규화한 원본 경로의 지문 앞 32자), 1부의 `expectedRealDir`, 과제 1의 `removeFiles`.
- Produces: `readCacheEntry(path: string): Promise<CacheEntryRead>`(`ok`, `unreadable`, `broken`), `isStaleCacheEntry(path: string): Promise<boolean>`, `staleCacheEntries(stateDir: string): Promise<StaleCacheEntries>`(고르기), `pruneCache(stateDir: string): Promise<CachePruneReport>`(`{ removed: number; skipped: "state" | "cache" | null }`). 과제 15가 쓴다.

설계 19.2의 「원본 파일이 없어진 것은 점검 때 정리한다」(1부에서 넘어온 것)이고 「2단계 3부 계획에서 보완」의 7번이다.

- 캐시 폴더 아래 도구마다의 폴더에서 항목 꼴의 이름(`<32자 16진>.json`)인 보통 파일만 본다. 항목에 적힌 정규화한 원본 경로를 `lstat`해서 없으면(ENOENT) 지운다. 있으면 남기고, 있는지 모르면(권한 같은 다른 오류) 남긴다.
- 읽었는데 풀리지 않거나 원본 경로가 적혀 있지 않은 항목은 지운다. 캐시가 깨지면 버리고 다시 만든다(설계 20.1). 항목을 읽지 못하면(권한 같은 오류) 원본이 있는지조차 모르므로 남긴다(짝 Codex 1의 계획 리뷰 1차).
- 고르기와 지우기를 나누고, 지우기는 과제 1의 `removeFiles`(재귀 없는 파일 지우기)를 쓴다.
- 정리 진입 시험(`test/state/prune-entry.test.ts`)은 정리 함수가 쓰는 파일 함수를 감싸, 고른 직후 그 자리를 사용자 자료가 든 폴더로 바꾸거나 위 폴더를 상태 폴더 안의 다른 폴더를 가리키는 링크로 바꾼다. 결과 정리와 캐시 정리가 실제 진입에서 재귀 없는 파일 지우기를 부르는지(짝 Codex 2의 계획 리뷰 2차), 위 폴더가 바뀌어 지우지 않은 것을 링크라서 하지 않은 정리로 돌려주는지(계획 리뷰 3차) 본다. 결과 쪽 정리는 과제 1에서 만들었지만 캐시 쪽과 같은 감싸기를 쓰므로 이 과제에 둔다.
- 다른 이름(쓰다 남은 임시 파일 포함), 폴더, 도구 폴더 밖의 파일, 링크인 도구 폴더는 건드리지 않는다. 캐시 폴더나 상태 폴더 자체가 링크면 지우지 않고 그것을 돌려준다.
- 이 함수는 명령에서 부르기 전에는 묶은 실행 파일에 들어가지 않아 묶음 검사는 그대로 통과한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/state/cache-prune.test.ts`(새 파일):

```ts
// 원본 파일이 없어진 캐시 항목을 점검 때 지우는 것을 시험한다. 원본이 있는 항목, 읽지 못한 항목, 이 도구가 쓰지 않은 것은 남기고 폴더 안으로 내려가지 않는다(설계 19.2, 20.1)
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { cacheKeyFor, isStaleCacheEntry, pruneCache, readCacheEntry, staleCacheEntries, storeCached } from "../../src/state/cache.ts";
import { removeFiles } from "../../src/state/folder.ts";
import { parseLines } from "../helpers/claude-lines.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

/** 기록 파일 하나를 만들고 그 캐시 항목을 실제와 같은 꼴로 넣는다. 항목의 파일 이름을 돌려준다 */
async function cached(name: string): Promise<{ log: string; entryName: string }> {
  const log = join(root, "logs", name);
  await put(log, "line\n");
  const key = await cacheKeyFor({ path: log, normPath: normalizePath(log), size: 5, mtimeMs: 0 }, "claude-code@1", "UTC");
  const toolDir = join(dir, "cache", "claude-code");
  const before = new Set(await readdir(toolDir).catch(() => [] as string[]));
  await storeCached(toolDir, { key, summary: parseLines([]), bytesRead: 5 });
  const entryName = (await readdir(toolDir)).find((item) => !before.has(item))!;
  return { log, entryName };
}

describe("원본이 없어진 캐시 정리", () => {
  it("원본이 없어진 항목만 지우고 원본이 있는 항목은 남긴다", async () => {
    const kept = await cached("a.jsonl");
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    expect(await pruneCache(dir)).toEqual({ removed: 1, skipped: null });
    expect(await readdir(join(dir, "cache", "claude-code"))).toEqual([kept.entryName]);
  });

  it("풀리지 않거나 원본 경로가 적혀 있지 않은 항목은 지운다", async () => {
    const kept = await cached("a.jsonl");
    const toolDir = join(dir, "cache", "claude-code");
    await writeFile(join(toolDir, `${"0".repeat(32)}.json`), "{not json");
    await writeFile(join(toolDir, `${"1".repeat(32)}.json`), JSON.stringify({ key: { size: 1 }, summary: {} }));
    expect(await pruneCache(dir)).toEqual({ removed: 2, skipped: null });
    expect(await readdir(toolDir)).toEqual([kept.entryName]);
  });

  it("항목을 읽지 못한 것(남긴다)과 읽었는데 깨진 것(지운다)을 가른다", async () => {
    const kept = await cached("a.jsonl");
    const toolDir = join(dir, "cache", "claude-code");
    expect(await readCacheEntry(join(toolDir, kept.entryName))).toEqual({ status: "ok", normPath: normalizePath(kept.log) });
    expect(await readCacheEntry(join(toolDir, `${"9".repeat(32)}.json`))).toEqual({ status: "unreadable" });
    await writeFile(join(toolDir, `${"0".repeat(32)}.json`), "{not json");
    expect(await readCacheEntry(join(toolDir, `${"0".repeat(32)}.json`))).toEqual({ status: "broken" });
    await writeFile(join(toolDir, `${"1".repeat(32)}.json`), JSON.stringify({ key: { normPath: "" } }));
    expect(await readCacheEntry(join(toolDir, `${"1".repeat(32)}.json`))).toEqual({ status: "broken" });
    // 읽지 못한 항목은 원본이 있는지조차 모르므로 남기고, 깨진 항목은 지운다
    expect(await isStaleCacheEntry(join(toolDir, `${"9".repeat(32)}.json`))).toBe(false);
    expect(await isStaleCacheEntry(join(toolDir, `${"0".repeat(32)}.json`))).toBe(true);
    expect(await isStaleCacheEntry(join(toolDir, kept.entryName))).toBe(false);
  });

  it("고른 뒤 지우기 전에 그 자리가 폴더로 바뀌면 폴더와 그 안은 지우지 않는다", async () => {
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    const stale = await staleCacheEntries(dir);
    const entry = join(dir, "cache", "claude-code", gone.entryName);
    expect(stale.paths).toEqual([entry]);
    await rm(entry);
    await put(join(entry, "user-data.txt"), "keep me");
    expect(await removeFiles(stale.paths, dir, stale.boundary!)).toEqual({ removed: 0, linked: 0 });
    expect(await readFile(join(entry, "user-data.txt"), "utf8")).toBe("keep me");
  });

  it("고른 뒤 캐시 폴더가 상태 폴더 안의 다른 폴더를 가리키는 링크로 바뀌면 그 안의 파일은 지우지 않는다", async () => {
    const gone = await cached("c.jsonl");
    await rm(gone.log);
    const stale = await staleCacheEntries(dir);
    expect(stale.paths).toEqual([join(dir, "cache", "claude-code", gone.entryName)]);
    await rename(join(dir, "cache"), join(dir, "cache-moved"));
    // 바로 위 폴더(도구 폴더)는 링크가 아니고 그 위의 캐시 폴더가 링크다
    const other = join(dir, "tune");
    await put(join(other, "claude-code", gone.entryName), "keep me");
    await linkDir(other, join(dir, "cache"));
    expect(await removeFiles(stale.paths, dir, stale.boundary!)).toEqual({ removed: 0, linked: 1 });
    expect(await readFile(join(other, "claude-code", gone.entryName), "utf8")).toBe("keep me");
  });

  it("항목 꼴이 아닌 이름, 폴더, 다른 도구의 폴더 밖 파일은 건드리지 않는다", async () => {
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    const toolDir = join(dir, "cache", "claude-code");
    await writeFile(join(toolDir, `${gone.entryName}.123.tmp`), "{}");
    await writeFile(join(toolDir, "notes.txt"), "mine");
    await mkdir(join(toolDir, `${"2".repeat(32)}.json`));
    await put(join(dir, "cache", "README.json"), "{}");
    expect(await pruneCache(dir)).toEqual({ removed: 1, skipped: null });
    expect((await readdir(toolDir)).sort()).toEqual([`${"2".repeat(32)}.json`, `${gone.entryName}.123.tmp`, "notes.txt"].sort());
    expect(await readdir(join(dir, "cache"))).toContain("README.json");
  });

  it("캐시 폴더가 없으면 지울 것이 없다", async () => {
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: null });
    await mkdir(dir, { recursive: true });
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: null });
  });

  it("도구의 캐시 폴더가 링크면 안을 지우지 않는다", async () => {
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    const outside = join(root, "outside-tool-cache");
    await rename(join(dir, "cache", "claude-code"), outside);
    await linkDir(outside, join(dir, "cache", "claude-code"));
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: null });
    expect(await readdir(outside)).toEqual([gone.entryName]);
  });

  it("캐시 폴더가 링크면 안을 지우지 않는다", async () => {
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    const outside = join(root, "outside-cache");
    await rename(join(dir, "cache"), outside);
    await linkDir(outside, join(dir, "cache"));
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: "cache" });
    expect(await readdir(join(outside, "claude-code"))).toEqual([gone.entryName]);
  });

  it("상태 폴더 자체가 링크면 안을 지우지 않는다", async () => {
    const real = join(root, "real-state");
    await mkdir(real, { recursive: true });
    await linkDir(real, dir);
    const gone = await cached("b.jsonl");
    await rm(gone.log);
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: "state" });
    expect(await readdir(join(real, "cache", "claude-code"))).toEqual([gone.entryName]);
  });
});
```

`test/state/prune-entry.test.ts`(새 파일):

```ts
// 점검 때의 정리를 실제 진입(pruneReports, pruneCache)으로 불러, 고른 직후 그 자리가 폴더로 바뀌거나 위 폴더가 상태 폴더 안의 다른 곳을 가리키는 링크로 바뀌어도 지우지 않는지 시험한다. 고르기와 지우기 사이에 끼어들려고 파일 함수를 감싼다(설계 19.2)
import type { Stats } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pruneCache } from "../../src/state/cache.ts";
import { pruneReports, resultStamp } from "../../src/state/reports.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

type FsPromises = typeof import("node:fs/promises");

/** 끼어들 함수(lstat 또는 readFile)와 경로, 그때 할 일. 한 번만 한다 */
const swap = vi.hoisted(() => ({ target: "", on: "", done: false, action: null as ((fs: FsPromises) => Promise<void>) | null }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<FsPromises>();
  const lstat = actual.lstat as unknown as (...args: unknown[]) => Promise<Stats>;
  const readFile = actual.readFile as unknown as (...args: unknown[]) => Promise<unknown>;
  const fire = async (on: string, path: unknown): Promise<void> => {
    if (swap.on !== on || swap.done || path !== swap.target || swap.action === null) return;
    swap.done = true;
    await swap.action(actual);
  };
  return {
    ...actual,
    lstat: async (...args: unknown[]) => {
      const info = await lstat(...args);
      if (info.isFile()) await fire("lstat", args[0]);
      return info;
    },
    readFile: async (...args: unknown[]) => {
      const content = await readFile(...args);
      await fire("readFile", args[0]);
      return content;
    },
  };
});

let root: string;
let dir: string;
const reset = (): void => {
  Object.assign(swap, { target: "", on: "", done: false, action: null });
};
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
  reset();
});
afterEach(async () => {
  reset();
  await removeTemp(root);
});

/** 고른 파일을 지우고 같은 자리에 사용자 자료가 든 폴더를 둔다 */
const toFolder =
  (path: string) =>
  async (fs: FsPromises): Promise<void> => {
    await fs.rm(path);
    await fs.mkdir(path);
    await fs.writeFile(join(path, "user-data.txt"), "keep me");
  };

/** 폴더를 옮기고 그 자리에 상태 폴더 안의 다른 폴더를 가리키는 링크를 둔다. 다른 폴더에는 고른 것과 같은 이름의 파일을 둔다 */
const toInnerLink =
  (folder: string, other: string, names: readonly string[]) =>
  async (fs: FsPromises): Promise<void> => {
    await fs.rename(folder, `${folder}-moved`);
    for (const name of names) {
      await fs.mkdir(dirname(join(other, name)), { recursive: true });
      await fs.writeFile(join(other, name), "keep me");
    }
    await fs.symlink(other, folder, process.platform === "win32" ? "junction" : "dir");
  };

describe("정리 진입에서 고른 직후 그 자리나 위 폴더가 바뀜", () => {
  it("오래된 결과를 고른 직후 그 자리가 폴더로 바뀌면 폴더와 그 안을 지우지 않는다", async () => {
    const reports = join(dir, "reports");
    await mkdir(reports, { recursive: true });
    const old = join(reports, `${resultStamp(Date.UTC(2026, 10, 12))}.json`);
    await writeFile(old, "{}");
    await writeFile(join(reports, `${resultStamp(Date.UTC(2026, 10, 13))}.json`), "{}");
    Object.assign(swap, { target: old, on: "lstat", action: toFolder(old) });
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: null });
    expect(swap.done).toBe(true);
    expect(await readFile(join(old, "user-data.txt"), "utf8")).toBe("keep me");
  });

  it("오래된 결과를 고른 직후 결과 폴더가 상태 폴더 안의 다른 폴더를 가리키는 링크로 바뀌면 그 안을 지우지 않고 링크라서 하지 않은 정리로 돌려준다", async () => {
    const reports = join(dir, "reports");
    await mkdir(reports, { recursive: true });
    const oldName = `${resultStamp(Date.UTC(2026, 10, 12))}.json`;
    const newer = join(reports, `${resultStamp(Date.UTC(2026, 10, 13))}.json`);
    await writeFile(join(reports, oldName), "{}");
    await writeFile(newer, "{}");
    const other = join(dir, "tune");
    Object.assign(swap, { target: newer, on: "lstat", action: toInnerLink(reports, other, [oldName]) });
    expect(await pruneReports(dir, 1)).toEqual({ removed: 0, skipped: "reports" });
    expect(swap.done).toBe(true);
    expect(await readFile(join(other, oldName), "utf8")).toBe("keep me");
  });

  it("원본이 없어진 캐시 항목을 고른 직후 그 자리가 폴더로 바뀌면 폴더와 그 안을 지우지 않는다", async () => {
    const toolDir = join(dir, "cache", "claude-code");
    await mkdir(toolDir, { recursive: true });
    const entry = join(toolDir, `${"a".repeat(32)}.json`);
    await writeFile(entry, JSON.stringify({ key: { normPath: join(root, "gone.jsonl") } }));
    Object.assign(swap, { target: entry, on: "readFile", action: toFolder(entry) });
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: null });
    expect(swap.done).toBe(true);
    expect(await readFile(join(entry, "user-data.txt"), "utf8")).toBe("keep me");
  });

  it("원본이 없어진 캐시 항목을 고른 직후 캐시 폴더가 상태 폴더 안의 다른 폴더를 가리키는 링크로 바뀌면 그 안을 지우지 않고 링크라서 하지 않은 정리로 돌려준다", async () => {
    const cache = join(dir, "cache");
    const name = `${"a".repeat(32)}.json`;
    const entry = join(cache, "claude-code", name);
    await mkdir(dirname(entry), { recursive: true });
    await writeFile(entry, JSON.stringify({ key: { normPath: join(root, "gone.jsonl") } }));
    const other = join(dir, "tune");
    Object.assign(swap, { target: entry, on: "readFile", action: toInnerLink(cache, other, [join("claude-code", name)]) });
    expect(await pruneCache(dir)).toEqual({ removed: 0, skipped: "cache" });
    expect(swap.done).toBe(true);
    expect(await readFile(join(other, "claude-code", name), "utf8")).toBe("keep me");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/state/cache-prune.test.ts test/state/prune-entry.test.ts`
Expected: FAIL. `pruneCache`, `readCacheEntry`, `isStaleCacheEntry`, `staleCacheEntries`가 없어 캐시 정리 시험 열이 모두 실패한다. 정리 진입 시험 넷 가운데 결과 쪽 둘은 과제 1의 구현이 이미 만족해 통과하고(진입을 잇는 회귀 시험이다) 캐시 쪽 둘은 실패한다.

- [ ] **Step 3: 구현한다**

`src/state/cache.ts`(찾을 곳 1/2):

```ts
// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다(설계 9.4)
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";

export const CACHE_FORMAT_VERSION = 1;
```

`src/state/cache.ts`(바꾼 뒤 1/2):

```ts
// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다(설계 9.4)
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";
import { expectedRealDir, removeFiles } from "./folder.ts";

export const CACHE_FORMAT_VERSION = 1;
```

`src/state/cache.ts`(찾을 곳 2/2):

```ts
  await rename(temporary, target);
}
```

`src/state/cache.ts`(바꾼 뒤 2/2):

```ts
  await rename(temporary, target);
}

/** 이 도구가 쓴 캐시 항목의 이름(정규화한 원본 경로의 지문 앞 32자) */
const ENTRY_NAME = /^[0-9a-f]{32}\.json$/;

export interface CachePruneReport {
  /** 지운 항목의 수 */
  removed: number;
  /** 링크라서 안을 지우지 않은 것. state는 상태 폴더 자체, cache는 캐시 폴더다(고른 뒤 캐시 폴더나 도구 폴더가 링크로 바뀐 것도 든다) */
  skipped: "state" | "cache" | null;
}

/** 캐시 항목을 읽은 결과. 읽지 못한 것(unreadable)과 읽었는데 풀리지 않거나 원본 경로가 없는 것(broken)을 가른다 */
export type CacheEntryRead = { status: "ok"; normPath: string } | { status: "unreadable" } | { status: "broken" };

export async function readCacheEntry(path: string): Promise<CacheEntryRead> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { status: "unreadable" };
  }
  let normPath: unknown;
  try {
    normPath = (JSON.parse(text) as { key?: { normPath?: unknown } } | null)?.key?.normPath;
  } catch {
    return { status: "broken" };
  }
  return typeof normPath === "string" && normPath !== "" ? { status: "ok", normPath } : { status: "broken" };
}

/** 항목을 지울지. 읽었는데 깨졌으면 지운다. 원본이 없으면 지운다. 항목을 읽지 못했거나 원본이 있는지 모르면(권한 등) 남긴다 */
export async function isStaleCacheEntry(path: string): Promise<boolean> {
  const entry = await readCacheEntry(path);
  if (entry.status === "unreadable") return false;
  if (entry.status === "broken") return true;
  try {
    await lstat(entry.normPath);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

export interface StaleCacheEntries {
  /** 링크라서 안을 보지 않은 것. state는 상태 폴더 자체, cache는 캐시 폴더다 */
  skipped: "state" | "cache" | null;
  /** 상태 폴더가 있어야 할 실제 경로(지우기 전의 경계) */
  boundary: string | null;
  /** 지울 캐시 항목(도구 폴더와 이름의 차례) */
  paths: string[];
}

/**
 * 지울 캐시 항목을 고른다. 캐시 폴더 아래 도구마다의 폴더에서 항목 꼴의 이름을 가진 보통 파일만 본다.
 * 다른 이름의 파일, 폴더, 링크인 도구 폴더는 고르지 않는다.
 */
export async function staleCacheEntries(stateDir: string): Promise<StaleCacheEntries> {
  let dirInfo;
  try {
    dirInfo = await lstat(stateDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { skipped: null, boundary: null, paths: [] };
    throw error;
  }
  const boundary = await expectedRealDir(stateDir);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath(stateDir)) !== boundary) return { skipped: "state", boundary: null, paths: [] };
  const cacheDir = join(stateDir, "cache");
  let info;
  try {
    info = await lstat(cacheDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { skipped: null, boundary, paths: [] };
    throw error;
  }
  if (info.isSymbolicLink()) return { skipped: "cache", boundary: null, paths: [] };
  if (!info.isDirectory()) return { skipped: null, boundary, paths: [] };
  const paths: string[] = [];
  for (const tool of (await readdir(cacheDir)).sort()) {
    const toolDir = join(cacheDir, tool);
    if (!(await lstat(toolDir)).isDirectory()) continue;
    for (const name of (await readdir(toolDir)).sort()) {
      if (!ENTRY_NAME.test(name)) continue;
      const path = join(toolDir, name);
      if (!(await lstat(path)).isFile()) continue;
      if (await isStaleCacheEntry(path)) paths.push(path);
    }
  }
  return { skipped: null, boundary, paths };
}

/**
 * 원본 파일이 없어진 캐시 항목을 지운다(설계 19.2). 항목에 적힌 정규화한 원본 경로가 지금 없으면 지우고, 읽었는데 깨진 항목도 지운다(설계 20.1).
 * 고른 뒤 지우기 직전에 다시 보통 파일인지, 위 폴더가 있어야 할 자리인지 본다. 그 사이 폴더나 링크로 바뀐 것과 위 폴더가 링크로 바뀐 것은 지우지 않는다.
 */
export async function pruneCache(stateDir: string): Promise<CachePruneReport> {
  const stale = await staleCacheEntries(stateDir);
  if (stale.boundary === null || stale.paths.length === 0) return { removed: 0, skipped: stale.skipped };
  const result = await removeFiles(stale.paths, stateDir, stale.boundary);
  // 고른 뒤 캐시 폴더나 도구 폴더가 링크로 바뀌어 지우지 않은 것이 있으면 링크라서 하지 않은 정리로 알린다
  return { removed: result.removed, skipped: result.linked > 0 ? "cache" : null };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/state`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 6개, 시험 57개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/state/cache-prune.test.ts test/state/prune-entry.test.ts src/state/cache.ts
git commit -m "feat: 원본이 없어진 캐시 항목 정리 추가"
```

---

### Task 4: 상태 열기와 점검 뒤의 상태(마지막 점검 시각, 관측 기록)

**Files:**
- Create: `src/state/next-state.ts`
- Test: `test/state/next-state.test.ts`

**Interfaces:**
- Consumes: 1부의 `loadState`, `newState`, `StateFile`(`src/state/state.ts`), `updateInstalls`(`src/state/observations.ts`), 2부 과제 4의 `installKeysOf`, `unseenInUnreadablePlace`(`src/scan/identity.ts`).
- Produces: `openState(stateDir: string): Promise<OpenedState>`(`{ state: StateFile; fresh: boolean; broken: boolean }`), `nextState(state: StateFile, facts: ClaudeSetupFacts, today: LocalDate, startedAt: string): StateFile`. 과제 15가 쓴다.

「2단계 3부 계획에서 보완」의 5번이다. 2부 계획의 「3부에 넘기는 것」이 넘긴 `updateInstalls(previous, installKeysOf(facts), today, unseenInUnreadablePlace(facts))`로 관측 기록을 고친다. 관측 기록은 점수에 넣는 도구인지, 켜져 있는지와 상관없이 스캐너가 본 모든 설치로 고친다(설계 18.1).

- 상태 파일이 없으면 새 상태로 연다(첫 점검). 깨졌으면 새 상태로 열고 `broken`을 참으로 돌려준다. 1부 계획이 정한 대로 부르는 쪽(과제 15)이 알리고 저장할 때 덮어쓴다.
- 무작위 값은 그대로 둔다. 바꾸면 MCP 서버의 지문이 모두 달라져 관측 기록이 끊긴다.
- 관측 기록의 열쇠는 스캐너의 열쇠(`skillInstallKey`, `mcpInstallKey`)다. 시험 도우미(`test/helpers/facts.ts`)가 사실에 넣는 `installKey`는 core 시험을 위해 글자가 다르게 지어져 있어서 시험의 기대값은 스캐너의 열쇠로 만든다. 실제 스캐너 출력에서는 둘이 같다(`src/scan/claude.ts`).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/state/next-state.test.ts`(새 파일):

```ts
// 점검을 시작할 때 상태 파일을 여는 것과 점검 뒤에 상태(마지막 점검 시각, 설치마다의 관측 기록)를 고치는 것을 시험한다(설계 18.1, 20.1, 2단계 1부 계획의 깨진 상태 파일)
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import { nextState, openState } from "../../src/state/next-state.ts";
import { newState, saveState, type StateFile } from "../../src/state/state.ts";
import { facts, HOME, mcpServer, skill } from "../helpers/facts.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

describe("상태 열기", () => {
  it("상태 파일이 없으면 새 상태로 연다. 관측 기록이 없는 첫 점검이다", async () => {
    const opened = await openState(dir);
    expect(opened.fresh).toBe(true);
    expect(opened.broken).toBe(false);
    expect(opened.state).toMatchObject({ schema: 1, lastCheckupAt: null, installs: null });
    expect(opened.state.salt).toMatch(/^[0-9a-f]{64}$/);
  });

  it("상태 파일이 깨졌으면 새 상태로 열고 깨졌다고 알린다", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "state.json"), "{broken");
    const opened = await openState(dir);
    expect(opened).toMatchObject({ fresh: false, broken: true });
    expect(opened.state.installs).toBeNull();
  });

  it("상태 파일이 있으면 그대로 연다", async () => {
    const saved: StateFile = { ...newState(), lastCheckupAt: "2026-11-12T00:00:00.000Z", installs: [{ key: "k", firstSeen: "2026-11-01", appeared: true }] };
    await saveState(dir, saved);
    const opened = await openState(dir);
    expect(opened).toEqual({ state: saved, fresh: false, broken: false });
  });
});

// 관측 기록의 열쇠는 스캐너의 열쇠(skillInstallKey, mcpInstallKey)다. 시험 도우미가 사실에 넣는 열쇠는 글자가 달라서 쓰지 않는다
describe("점검 뒤의 상태", () => {
  const started = "2026-11-13T09:00:00.000Z";

  it("마지막 점검 시각을 적고 무작위 값은 그대로 둔다", () => {
    const state = newState();
    const next = nextState(state, facts(), "2026-11-13", started);
    expect(next.salt).toBe(state.salt);
    expect(next.lastCheckupAt).toBe(started);
    expect(next.installs).toEqual([]);
  });

  it("첫 점검에서 본 설치는 새로 나타난 것이 아니고, 다음 점검에서 처음 본 설치는 새로 나타난 것이다", () => {
    const first = nextState(newState(), facts({ skills: [skill("alpha")], mcpServers: [mcpServer("db")] }), "2026-11-01", started);
    expect(first.installs!.map((record) => record.appeared)).toEqual([false, false]);
    const second = nextState(first, facts({ skills: [skill("alpha"), skill("beta")], mcpServers: [mcpServer("db")] }), "2026-11-13", started);
    const beta = second.installs!.find((record) => record.key === skillInstallKey(skill("beta")))!;
    expect(beta).toEqual({ key: skillInstallKey(skill("beta")), firstSeen: "2026-11-13", appeared: true });
    const alpha = second.installs!.find((record) => record.key === skillInstallKey(skill("alpha")))!;
    expect(alpha).toEqual({ key: skillInstallKey(skill("alpha")), firstSeen: "2026-11-01", appeared: false });
  });

  it("정의를 읽지 못한 서버는 적지 않는다. 켜져 있는지와 상관없이 본 설치를 모두 적는다", () => {
    const next = nextState(newState(), facts({ skills: [skill("off", { enabled: false })], mcpServers: [mcpServer("cloud", { definitionHash: null }), mcpServer("db", { enabled: false })] }), "2026-11-13", started);
    expect(next.installs!.map((record) => record.key).sort()).toEqual([skillInstallKey(skill("off", { enabled: false })), mcpInstallKey(mcpServer("db", { enabled: false }))!].sort());
  });

  it("이번에 보이지 않은 설치의 기록은 지우되, 읽지 못한 곳에 든 설치의 기록은 남긴다", () => {
    const before = nextState(newState(), facts({ skills: [skill("gone"), skill("hidden")] }), "2026-11-01", started);
    const read = nextState(before, facts({ skills: [skill("hidden")] }), "2026-11-13", started);
    expect(read.installs!.map((record) => record.key)).toEqual([skillInstallKey(skill("hidden"))]);
    const unread = nextState(before, facts({ skills: [], unreadableDirs: [`${HOME}/skills`], unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }), "2026-11-13", started);
    expect(unread.installs).toEqual(before.installs);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/state/next-state.test.ts`
Expected: FAIL. `src/state/next-state.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/state/next-state.ts`(새 파일):

```ts
// 점검을 시작할 때 상태 파일을 열고, 점검 뒤에 마지막 점검 시각과 설치마다의 관측 기록을 고친 상태를 만든다. 상태 파일이 깨졌으면 새 상태로 시작한다(설계 18.1, 20.1)
import type { LocalDate } from "../adapters/common/dates.ts";
import { installKeysOf, unseenInUnreadablePlace } from "../scan/identity.ts";
import type { ClaudeSetupFacts } from "../scan/types.ts";
import { updateInstalls } from "./observations.ts";
import { loadState, newState, type StateFile } from "./state.ts";

export interface OpenedState {
  state: StateFile;
  /** 상태 파일이 없었다. 이 도구의 첫 점검이거나 상태를 지운 뒤다 */
  fresh: boolean;
  /** 상태 파일이 풀리지 않거나 모양이 달라 새 상태로 시작했다. 관측 기록이 처음부터 다시 쌓인다 */
  broken: boolean;
}

export async function openState(stateDir: string): Promise<OpenedState> {
  const loaded = await loadState(stateDir);
  if (loaded.status === "ok") return { state: loaded.state, fresh: false, broken: false };
  return { state: newState(), fresh: loaded.status === "missing", broken: loaded.status === "broken" };
}

/**
 * 점검 뒤의 상태(순수). 무작위 값은 그대로 두고, 마지막 점검 시각과 관측 기록을 고친다.
 * 관측 기록은 스캐너가 본 모든 설치로 고친다. 점수에 넣는 도구인지, 켜져 있는지와 상관없다. 읽지 못한 곳에 든 설치의 기록은 남긴다(설계 18.1).
 */
export function nextState(state: StateFile, facts: ClaudeSetupFacts, today: LocalDate, startedAt: string): StateFile {
  return { ...state, lastCheckupAt: startedAt, installs: updateInstalls(state.installs, installKeysOf(facts), today, unseenInUnreadablePlace(facts)) };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/state`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 7개, 시험 64개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/state/next-state.test.ts src/state/next-state.ts
git commit -m "feat: 상태 열기와 점검 뒤 상태 고침 추가"
```

---

### Task 5: 평가 결과의 도구 목록

**Files:**
- Create: `src/core/result/tools.ts`
- Test: `test/core/result-tools.test.ts`

**Interfaces:**
- Consumes: 2부의 `evaluate`, `Evaluation`, `EvaluationInput`(`src/core/evaluate.ts`), 1단계의 `ClaudeReadStats`, `Observation`(타입만).
- Produces: `CollectedTool`(`{ tool; detected; visibleFrom; overlappingSessions; read: Omit<ClaudeReadStats, "fromCache">; observation: { skills: Observation; mcp: Observation } }`), `ResultTool`, `resultTools(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): ResultTool[]`. `CollectedTool`은 과제 6~12가 입력으로 받고 과제 15의 `gatherCheckupInput`이 만든다.

설계 12.2의 `tools[]`(찾았는지, 점수에 넣는지와 달력에 넣는지, 기록 형식, 주 세션 수와 하위 세션 수, 사람 요청 수, 응답 수, 볼 수 있는 날짜 범위)다. 숫자는 규칙과 같은 점수 구간의 것이다. 하위 세션은 점수 구간에 응답이 있는 것만 센다.

- 평가 결과에 들어가는 것은 입력 묶음이 같으면 같아야 하므로, 수집 결과 가운데 캐시를 쓴 파일 수(`fromCache`)는 `CollectedTool`에서 뺀다. 그 수는 과제 15의 실행 기록에 둔다(설계 12.3).
- 관측이 빠짐없는지의 까닭(`Observation`)은 어댑터가 계산한다. core는 core 밖의 함수를 값으로 가져오지 못하므로(순수성 검사) 수집 결과에 넣어 받는다.
- 기록 형식의 이름은 Claude Code가 `claude-code-jsonl` 하나다. Codex(5단계)는 새 형식과 옛 형식을 둘 다 낼 수 있다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-tools.test.ts`(새 파일):

```ts
// 평가 결과의 도구 목록(찾았는지, 점수와 달력에 넣는지, 형식, 점수 구간의 세션·요청·응답 수, 볼 수 있는 날짜 범위)을 시험한다(설계 9.8, 12.2)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { resultTools, type CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";

const collected = (input: Partial<CollectedTool> = {}): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-09-01",
  overlappingSessions: 0,
  read: { files: 0, listedBytes: 0, bytes: 0, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
  ...input,
});

describe("도구 목록", () => {
  it("점수 구간의 주 세션·하위 세션·사람 요청·응답 수와 볼 수 있는 날짜 범위를 싣는다", () => {
    const input = evaluationInput([
      claudeTool({
        sessions: [
          { sessionId: "m1", days: { "2026-11-10": { responses: 5, humanRequests: 2 }, "2026-11-11": { responses: 1, humanRequests: 1 } } },
          { sessionId: "m2", days: { "2026-10-20": { responses: 3, humanRequests: 1 } } },
          { sessionId: "sub1", kind: "sub", parentSessionId: "m1", days: { "2026-11-10": { responses: 4 } } },
          // 점수 구간 밖(수집 구간 안)의 세션은 점수 구간의 숫자에 들지 않는다
          { sessionId: "old", days: { "2026-10-12": { responses: 7, humanRequests: 3 } } },
          { sessionId: "oldsub", kind: "sub", parentSessionId: "old", days: { "2026-10-12": { responses: 2 } } },
        ],
      }),
    ]);
    const evaluation = evaluate(input);
    expect(resultTools(input, evaluation, [collected()])).toEqual([
      {
        tool: "claude-code",
        detected: true,
        scored: true,
        inCalendar: true,
        formats: ["claude-code-jsonl"],
        mainSessions: 2,
        subSessions: 1,
        humanRequests: 4,
        responses: 13,
        visible: { from: "2026-09-01", to: "2026-11-13" },
      },
    ]);
  });

  it("수집 구간에만 응답이 있는 도구는 달력에만 넣는다", () => {
    const input = evaluationInput([claudeTool({ sessions: [{ days: { "2026-10-11": { responses: 2, humanRequests: 1 } } }] })]);
    const [tool] = resultTools(input, evaluate(input), [collected({ visibleFrom: "2026-10-11" })]);
    expect(tool).toMatchObject({ scored: false, inCalendar: true, mainSessions: 0, subSessions: 0, humanRequests: 0, responses: 0, visible: { from: "2026-10-11", to: "2026-11-13" } });
  });

  it("기록 폴더가 없는 도구는 찾지 못했다고 싣고 숫자는 0, 볼 수 있는 범위는 null이다", () => {
    const input = evaluationInput([claudeTool()]);
    const [tool] = resultTools(input, evaluate(input), [collected({ detected: false, visibleFrom: null })]);
    expect(tool).toEqual({ tool: "claude-code", detected: false, scored: false, inCalendar: false, formats: ["claude-code-jsonl"], mainSessions: 0, subSessions: 0, humanRequests: 0, responses: 0, visible: null });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-tools.test.ts`
Expected: FAIL. `src/core/result/tools.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/tools.ts`(새 파일):

```ts
// 평가 결과의 도구 목록을 만든다. 찾았는지, 점수와 달력에 넣는지, 기록 형식, 점수 구간의 세션·요청·응답 수, 볼 수 있는 날짜 범위다(순수 함수, 설계 9.8, 12.2)
import type { LocalDate } from "../../adapters/common/dates.ts";
import type { Observation } from "../../adapters/claude/observation.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { ClaudeReadStats } from "../../collect/claude.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";

/** 수집이 도구마다 낸 것 가운데 평가 결과에 싣는 것. 캐시를 쓴 파일 수처럼 실행마다 다른 것은 넣지 않는다(설계 12.2, 12.3) */
export interface CollectedTool {
  tool: ToolId;
  /** 기록 폴더를 찾았다 */
  detected: boolean;
  /** 그 도구에 실제로 남아 있는 가장 오래된 기록의 날짜. 기록이 없으면 null(설계 9.8 「달력의 날짜 범위」) */
  visibleFrom: LocalDate | null;
  /** 처음 나온 응답 ID가 다른 세션과 겹치는 세션의 수(설계 9.5 「다른 파일에 복사된 응답」) */
  overlappingSessions: number;
  read: Omit<ClaudeReadStats, "fromCache">;
  /** 스킬 사용과 MCP 호출의 관측이 빠짐없는지와 까닭(설계 9.8) */
  observation: { skills: Observation; mcp: Observation };
}

export interface ResultTool {
  tool: ToolId;
  detected: boolean;
  /** 점수에 넣는 도구다(점수 구간에 응답이 있다) */
  scored: boolean;
  /** 달력에 넣는 도구다(수집 구간에 응답이 있다) */
  inCalendar: boolean;
  /** 기록 형식. 두 형식이 섞였으면 둘 다다 */
  formats: string[];
  /** 점수 구간에 응답이 있는 주 세션과 하위 세션의 수 */
  mainSessions: number;
  subSessions: number;
  /** 점수 구간의 사람 요청(주 세션만)과 응답(주 세션과 하위 세션) */
  humanRequests: number;
  responses: number;
  /** 볼 수 있는 날짜 범위. 기록이 없으면 null */
  visible: { from: LocalDate; to: LocalDate } | null;
}

/** 도구마다의 기록 형식. Claude Code는 한 형식이다 */
const FORMATS: Record<ToolId, readonly string[]> = { "claude-code": ["claude-code-jsonl"] };

const inRange = (date: string, range: { from: LocalDate; to: LocalDate }): boolean => date >= range.from && date <= range.to;

export function resultTools(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): ResultTool[] {
  return evaluation.tools.map((tool): ResultTool => {
    const found = collected.find((item) => item.tool === tool.tool) ?? null;
    const summaries = input.tools.find((item) => item.tool === tool.tool)?.summaries ?? [];
    const subSessions = summaries.filter((summary) => summary.kind === "sub" && Object.entries(summary.days).some(([date, day]) => inRange(date, evaluation.windows.score) && day.responses > 0)).length;
    const visibleFrom = found?.visibleFrom ?? null;
    return {
      tool: tool.tool,
      detected: found?.detected ?? false,
      scored: tool.scored,
      inCalendar: tool.inCalendar,
      formats: [...FORMATS[tool.tool]],
      mainSessions: tool.totals.mainSessions.length,
      subSessions,
      humanRequests: tool.totals.humanRequests,
      responses: tool.totals.responses,
      visible: visibleFrom === null ? null : { from: visibleFrom, to: evaluation.windows.today },
    };
  });
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 17개, 시험 477개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-tools.test.ts src/core/result/tools.ts
git commit -m "feat: 평가 결과의 도구 목록 추가"
```

---

### Task 6: 평가 결과의 읽은 양

**Files:**
- Create: `src/core/result/coverage.ts`
- Test: `test/core/result-coverage.test.ts`

**Interfaces:**
- Consumes: 과제 5의 `CollectedTool`, 2부의 `EvaluationInput`(세션 요약의 `missing`).
- Produces: `ResultCoverage`, `resultCoverage(input: EvaluationInput, collected: readonly CollectedTool[]): ResultCoverage[]`, `PARTIAL_READ_SHARE`(0.2). 과제 12가 쓴다.

설계 9.8과 12.2의 `coverage`다. 읽지 못한 비율은 파일 수 기준(`unreadableFiles ÷ files`)과 바이트 기준(`unreadableFileBytes ÷ listedBytes`) 가운데 큰 쪽이고, 분모가 0인 기준은 뺀다. 둘 다 0이면 비율을 내지 않는다(null).

- 읽지 못한 폴더나 크기를 모르는 파일이 하나라도 있으면 비율은 아래 경계이고, 비율이 작아도 "일부만 읽었다" 띠를 띄운다(`partial`). 비율이 20%를 넘어도 띄운다. 정확히 20%는 넘지 않은 것이다(설계 20.1).
- 깨진 줄, 너무 긴 줄, 덜 쓴 끝 조각은 세션 요약마다의 수를 더한다. 일부만 읽은 파일과 건너뛴 압축 파일은 Claude Code의 기록에 없어 0이다(Codex 몫).
- 수집 결과가 없는 도구가 입력에 있으면 관측이 빠짐없다고 지어내지 않고 던진다. 입력 묶음의 도구는 모두 수집 결과가 있다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-coverage.test.ts`(새 파일):

```ts
// 평가 결과의 읽은 양(읽은 파일과 바이트, 빠진 것의 수, 읽지 못한 비율과 아래 경계, "일부만 읽었다" 띠, 지표마다의 관측)을 시험한다(설계 9.8, 12.2, 20.1)
import { describe, expect, it } from "vitest";
import { resultCoverage } from "../../src/core/result/coverage.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

const read = (input: Partial<CollectedTool["read"]> = {}): CollectedTool["read"] => ({ files: 10, listedBytes: 1000, bytes: 1000, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [], ...input });
const collected = (input: Partial<CollectedTool> = {}): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-09-01",
  overlappingSessions: 0,
  read: read(),
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
  ...input,
});
const missing = (brokenLines: number, tooLongLines: number, tailFragments: number) => ({ missing: { lines: 100, brokenLines, tailFragments, tooLongLines, unconfirmedTypes: {} } });
const coverageOf = (tool: CollectedTool, sessions: SummaryInput[] = []) => resultCoverage(evaluationInput([claudeTool({ sessions })]), [tool])[0]!;

describe("읽은 양", () => {
  it("읽은 양을 싣고, 깨진 줄·너무 긴 줄·덜 쓴 끝 조각은 세션 요약마다의 수를 더한다", () => {
    const coverage = coverageOf(
      collected({
        read: read({ files: 12, listedBytes: 4000, bytes: 3900, inProgress: 1, olderThanWindow: 30, unreadableFiles: ["/x/a.jsonl"], unreadableFileBytes: 100 }),
        observation: { skills: { complete: false, reasons: ["unreadable-files"] }, mcp: { complete: false, reasons: ["unreadable-files", "too-long-lines"] } },
      }),
      [{ ...missing(2, 1, 0), days: { "2026-11-10": { responses: 1 } } }, { ...missing(3, 0, 1), days: { "2026-10-11": { responses: 1 } } }],
    );
    expect(coverage).toEqual({
      tool: "claude-code",
      files: 12,
      listedBytes: 4000,
      readBytes: 3900,
      olderThanWindow: 30,
      inProgress: 1,
      unreadableFiles: 1,
      unreadableDirs: 0,
      unknownSizeFiles: 0,
      partialFiles: 0,
      skippedFiles: 0,
      brokenLines: 5,
      tooLongLines: 1,
      tailFragments: 1,
      unreadableShare: 1 / 12,
      lowerBound: false,
      partial: false,
      observation: { skills: { complete: false, reasons: ["unreadable-files"] }, mcp: { complete: false, reasons: ["unreadable-files", "too-long-lines"] } },
    });
  });

  it("읽지 못한 비율은 파일 수 기준과 바이트 기준 가운데 큰 쪽이다", () => {
    const byBytes = coverageOf(collected({ read: read({ files: 10, listedBytes: 1000, unreadableFiles: ["/x/big.jsonl"], unreadableFileBytes: 300 }) }));
    expect(byBytes.unreadableShare).toBe(0.3);
    expect(byBytes.partial).toBe(true);
    const byFiles = coverageOf(collected({ read: read({ files: 4, listedBytes: 1000, unreadableFiles: ["/x/a.jsonl"], unreadableFileBytes: 10 }) }));
    expect(byFiles.unreadableShare).toBe(0.25);
  });

  it("정확히 20%는 넘지 않은 것이라 띠를 띄우지 않는다", () => {
    const edge = coverageOf(collected({ read: read({ files: 10, listedBytes: 1000, unreadableFiles: ["/x/a.jsonl", "/x/b.jsonl"], unreadableFileBytes: 200 }) }));
    expect(edge).toMatchObject({ unreadableShare: 0.2, lowerBound: false, partial: false });
  });

  it("읽지 못한 폴더나 크기를 모르는 파일이 있으면 비율은 아래 경계이고 비율이 작아도 띠를 띄운다", () => {
    const dirs = coverageOf(collected({ read: read({ unreadableDirs: ["/x/locked"] }) }));
    expect(dirs).toMatchObject({ unreadableDirs: 1, unreadableShare: 0, lowerBound: true, partial: true });
    const unknown = coverageOf(collected({ read: read({ files: 10, unreadableFiles: ["/x/q.jsonl"], unknownSizeFiles: 1 }) }));
    expect(unknown).toMatchObject({ unknownSizeFiles: 1, unreadableShare: 0.1, lowerBound: true, partial: true });
  });

  it("목록에 파일이 없으면 비율을 내지 않는다. 그래도 읽지 못한 폴더가 있으면 숫자 없이 띠를 띄운다", () => {
    expect(coverageOf(collected({ read: read({ files: 0, listedBytes: 0, bytes: 0 }) }))).toMatchObject({ unreadableShare: null, lowerBound: false, partial: false });
    expect(coverageOf(collected({ read: read({ files: 0, listedBytes: 0, bytes: 0, unreadableDirs: ["/x"] }) }))).toMatchObject({ unreadableShare: null, lowerBound: true, partial: true });
  });

  it("수집 결과가 없는 도구가 있으면 관측이 빠짐없다고 지어내지 않고 멈춘다", () => {
    expect(() => resultCoverage(evaluationInput([claudeTool()]), [])).toThrow(/no collected result for claude-code/);
  });

  it("크기를 아는 파일이 없으면 바이트 기준은 빼고 파일 수 기준만 쓴다", () => {
    expect(coverageOf(collected({ read: read({ files: 2, listedBytes: 0, bytes: 0, unreadableFiles: ["/x/a.jsonl", "/x/b.jsonl"], unknownSizeFiles: 2 }) })).unreadableShare).toBe(1);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-coverage.test.ts`
Expected: FAIL. `src/core/result/coverage.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/coverage.ts`(새 파일):

```ts
// 평가 결과의 읽은 양을 만든다. 읽은 파일과 바이트, 빠진 것의 수, 읽지 못한 비율과 아래 경계, "일부만 읽었다" 띠, 지표마다 관측이 빠짐없는지다(순수 함수, 설계 9.8, 12.2, 20.1)
import type { Observation } from "../../adapters/claude/observation.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { EvaluationInput } from "../evaluate.ts";
import type { CollectedTool } from "./tools.ts";

/** 읽지 못한 비율이 이것을 넘으면 "일부만 읽었다" 띠를 띄운다(설계 20.1). 정확히 이 값은 넘지 않은 것이다 */
export const PARTIAL_READ_SHARE = 0.2;

export interface ResultCoverage {
  tool: ToolId;
  /** 목록에 있는 세션 파일의 수(크기를 보지 못한 파일 포함), 크기를 아는 파일의 바이트, 읽은 바이트 */
  files: number;
  listedBytes: number;
  readBytes: number;
  /** 수정 시각이 수집 구간보다 앞서 열지 않은 파일 */
  olderThanWindow: number;
  /** 쓰는 중이라 열 때의 크기까지만 읽은 파일 */
  inProgress: number;
  unreadableFiles: number;
  unreadableDirs: number;
  unknownSizeFiles: number;
  /** 일부만 읽은 파일(끊긴 압축)과 건너뛴 압축 파일. Claude Code의 기록에는 없다 */
  partialFiles: number;
  skippedFiles: number;
  brokenLines: number;
  tooLongLines: number;
  tailFragments: number;
  /** 읽지 못한 비율. 파일 수 기준과 바이트 기준 가운데 큰 쪽이고, 분모가 둘 다 0이면 null이다 */
  unreadableShare: number | null;
  /** 비율이 "적어도 이만큼"이다. 읽지 못한 폴더나 크기를 모르는 파일이 있다 */
  lowerBound: boolean;
  /** "일부만 읽었다" 띠를 띄운다. 비율이 20%를 넘거나 아래 경계다 */
  partial: boolean;
  observation: { skills: Observation; mcp: Observation };
}

export function resultCoverage(input: EvaluationInput, collected: readonly CollectedTool[]): ResultCoverage[] {
  const tools = [...input.tools].sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0));
  return tools.map((tool): ResultCoverage => {
    // 입력 묶음의 도구는 모두 수집 결과가 있다. 없으면 관측이 빠짐없다고 지어내지 않고 멈춘다
    const found = collected.find((item) => item.tool === tool.tool);
    if (found === undefined) throw new Error(`no collected result for ${tool.tool}`);
    const { read } = found;
    const sum = (pick: (missing: (typeof tool.summaries)[number]["missing"]) => number): number => tool.summaries.reduce((total, summary) => total + pick(summary.missing), 0);
    const shares = [read.files > 0 ? read.unreadableFiles.length / read.files : null, read.listedBytes > 0 ? read.unreadableFileBytes / read.listedBytes : null].filter((share): share is number => share !== null);
    const unreadableShare = shares.length === 0 ? null : Math.max(...shares);
    const lowerBound = read.unreadableDirs.length > 0 || read.unknownSizeFiles > 0;
    return {
      tool: tool.tool,
      files: read.files,
      listedBytes: read.listedBytes,
      readBytes: read.bytes,
      olderThanWindow: read.olderThanWindow,
      inProgress: read.inProgress,
      unreadableFiles: read.unreadableFiles.length,
      unreadableDirs: read.unreadableDirs.length,
      unknownSizeFiles: read.unknownSizeFiles,
      partialFiles: 0,
      skippedFiles: 0,
      brokenLines: sum((missing) => missing.brokenLines),
      tooLongLines: sum((missing) => missing.tooLongLines),
      tailFragments: sum((missing) => missing.tailFragments),
      unreadableShare,
      lowerBound,
      partial: lowerBound || (unreadableShare !== null && unreadableShare > PARTIAL_READ_SHARE),
      observation: found.observation,
    };
  });
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 18개, 시험 484개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-coverage.test.ts src/core/result/coverage.ts
git commit -m "feat: 평가 결과의 읽은 양 추가"
```

---

### Task 7: 평가 결과의 사용 기록(35일 달력, 도구별 나눔, 셸 명령 몫)

**Files:**
- Create: `src/core/result/usage.ts`
- Test: `test/core/result-usage.test.ts`

**Interfaces:**
- Consumes: 2부의 `Evaluation`(도구별 구간 합계와 E1의 값), 1단계의 `makeWindows`(`src/adapters/common/dates.ts`, core가 값으로 가져올 수 있는 둘 가운데 하나), 과제 5의 `CollectedTool`.
- Produces: `ResultUsage`, `CalendarCell`, `resultUsage(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): ResultUsage`. 과제 12가 쓴다.

설계 12.2의 `usage`와 13.1의 달력이다(「2단계 3부 계획에서 보완」의 9번과 10번).

- 주 세션 수, 사용한 날, 출력 토큰은 점수에 넣는 도구를 합친 점수 구간의 것이다. 캐시 적중은 E1의 잰 값을 그대로 쓴다. 두 도구의 식이 달라 토큰을 더하지 않는다.
- 셸 명령이 0이 아닌 값으로 끝난 몫은 점수 구간의 셸 도구 결과(거절과 끊김은 결과에 들지 않는다. 주 세션과 하위 세션을 합친다) 가운데 오류의 몫이다. 셸 결과가 없거나 그 도구가 셸 종료 코드를 못 보면 null이다. 점수에 넣지 않고 정보로만 보인다.
- 달력은 수집 구간 35일을 오래된 날부터 싣는다. 응답 수는 모든 도구를 합친다. 응답이 있으면 쓴 날, 없으면 기록이 남아 있는 도구 가운데 하나라도 그날을 볼 수 있으면 안 쓴 날, 아니면 볼 수 없는 날이다. 기록은 남아 있는데 수집 구간에 응답이 없는 도구도 범위에 넣는다(본문 9.8, 13.1을 고쳤다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-usage.test.ts`(새 파일):

```ts
// 평가 결과의 사용 기록(점수 구간의 주 세션·사용한 날·출력 토큰·캐시 적중·셸 명령 몫, 수집 구간 35일의 달력, 도구별 나눔)을 시험한다(설계 9.8, 12.2, 13.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { resultUsage } from "../../src/core/result/usage.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const collected = (visibleFrom: string | null): CollectedTool => ({
  tool: "claude-code",
  detected: visibleFrom !== null,
  visibleFrom,
  overlappingSessions: 0,
  read: { files: 0, listedBytes: 0, bytes: 0, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
});
const usageOf = (tool: ClaudeToolInput, visibleFrom: string | null = "2026-10-01") => {
  const input = evaluationInput([claudeTool(tool)]);
  return { usage: resultUsage(input, evaluate(input), [collected(visibleFrom)]), evaluation: evaluate(input) };
};

describe("사용 기록", () => {
  it("점수 구간의 주 세션, 사용한 날, 출력 토큰을 더하고 캐시 적중은 E1의 잰 값을 쓴다", () => {
    const { usage, evaluation } = usageOf({
      sessions: [
        { days: { "2026-11-10": { responses: 4, tokens: { input: 100, cacheRead: 900, output: 50 } }, "2026-11-11": { responses: 1, tokens: { output: 5 } } } },
        { days: { "2026-11-10": { responses: 2, tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 7 } } } },
        { kind: "sub", parentSessionId: "x", days: { "2026-11-12": { responses: 3, tokens: { output: 11 } } } },
        // 점수 구간 밖(수집 구간 안)은 점수 구간의 숫자에 들지 않는다
        { days: { "2026-10-12": { responses: 9, tokens: { output: 1000 } } } },
      ],
    });
    const e1 = evaluation.findings.find((finding) => finding.ruleId === "E1")!;
    expect(usage).toMatchObject({ mainSessions: 2, activeDays: 3, outputTokens: 73, cacheHit: e1.value, shellNonZero: null });
    expect(usage.cacheHit).toBe(0.9);
    expect(usage.byTool).toEqual([{ tool: "claude-code", mainSessions: 2, activeDays: 3, outputTokens: 73, cacheHit: 0.9, shellNonZero: null }]);
  });

  it("셸 명령 몫은 점수 구간의 셸 도구 결과 가운데 오류의 몫이다. 셸이 아닌 도구와 구간 밖은 들지 않는다", () => {
    const { usage } = usageOf({
      sessions: [
        { days: { "2026-11-10": { responses: 1, tools: { Bash: { calls: 6, results: 6, errors: 2 }, Read: { calls: 9, results: 9, errors: 9 } } } } },
        { kind: "sub", parentSessionId: "x", days: { "2026-11-11": { responses: 1, tools: { PowerShell: { calls: 4, results: 4, errors: 1 } } } } },
        { days: { "2026-10-11": { responses: 1, tools: { Bash: { calls: 5, results: 5, errors: 5 } } } } },
      ],
    });
    expect(usage.shellNonZero).toBe(3 / 10);
  });

  it("셸 종료 코드를 못 보는 형식이면 셸 명령 몫은 null이다", () => {
    const { usage } = usageOf({ coverage: { ...CLAUDE_COVERAGE, shellExitCodes: "unsupported" }, sessions: [{ days: { "2026-11-10": { responses: 1, tools: { Bash: { calls: 1, results: 1, errors: 1 } } } } }] });
    expect(usage.shellNonZero).toBeNull();
    expect(usage.byTool[0]!.shellNonZero).toBeNull();
  });

  it("달력은 수집 구간 35일을 오래된 날부터 싣고 날마다 응답 수와 쓴 날·안 쓴 날·볼 수 없는 날을 가른다", () => {
    const { usage } = usageOf({ sessions: [{ days: { "2026-10-12": { responses: 2 }, "2026-11-13": { responses: 1 } } }, { kind: "sub", parentSessionId: "x", days: { "2026-11-13": { responses: 4 } } }] }, "2026-10-12");
    expect(usage.calendar).toHaveLength(35);
    expect(usage.calendar[0]).toEqual({ date: "2026-10-10", responses: 0, state: "unseen" });
    expect(usage.calendar[1]).toEqual({ date: "2026-10-11", responses: 0, state: "unseen" });
    expect(usage.calendar[2]).toEqual({ date: "2026-10-12", responses: 2, state: "used" });
    expect(usage.calendar[3]).toEqual({ date: "2026-10-13", responses: 0, state: "unused" });
    expect(usage.calendar[34]).toEqual({ date: "2026-11-13", responses: 5, state: "used" });
  });

  it("기록은 남아 있는데 수집 구간에 응답이 없으면 남아 있는 범위의 날은 안 쓴 날이다", () => {
    const { usage } = usageOf({ sessions: [] }, "2026-09-01");
    expect(new Set(usage.calendar.map((cell) => cell.state))).toEqual(new Set(["unused"]));
  });

  it("남아 있는 기록이 없으면 모든 날이 볼 수 없는 날이고, 점수에 넣는 도구가 없으면 숫자는 0, 캐시 적중은 null, 도구별 나눔은 비어 있다", () => {
    const { usage } = usageOf({ sessions: [] }, null);
    expect(new Set(usage.calendar.map((cell) => cell.state))).toEqual(new Set(["unseen"]));
    expect(usage).toMatchObject({ mainSessions: 0, activeDays: 0, outputTokens: 0, cacheHit: null, shellNonZero: null, byTool: [] });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-usage.test.ts`
Expected: FAIL. `src/core/result/usage.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/usage.ts`(새 파일):

```ts
// 평가 결과의 사용 기록을 만든다. 점수 구간의 주 세션·사용한 날·출력 토큰·캐시 적중·셸 명령 몫, 수집 구간 35일의 달력, 도구별 나눔이다(순수 함수, 설계 9.2, 9.8, 12.2, 13.1)
import { makeWindows, type LocalDate } from "../../adapters/common/dates.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { Evaluation, EvaluationInput, ToolInput } from "../evaluate.ts";
import type { CollectedTool } from "./tools.ts";

export type CalendarState = "used" | "unused" | "unseen";

export interface CalendarCell {
  date: LocalDate;
  /** 그날의 응답 수(도구를 합치고 주 세션과 하위 세션을 합친다) */
  responses: number;
  /** used는 쓴 날, unused는 기록을 볼 수 있는데 응답이 없는 날, unseen은 기록이 남아 있는 도구 모두에서 볼 수 있는 범위 밖의 날이다 */
  state: CalendarState;
}

export interface ToolUsageShare {
  tool: ToolId;
  mainSessions: number;
  activeDays: number;
  outputTokens: number;
  cacheHit: number | null;
  shellNonZero: number | null;
}

export interface ResultUsage {
  /** 점수 구간. 점수에 넣는 도구를 합친다 */
  mainSessions: number;
  activeDays: number;
  outputTokens: number;
  /** 캐시 적중. E1의 잰 값이다(도구마다 식이 달라 토큰을 더하지 않는다). 못 쟀으면 null */
  cacheHit: number | null;
  /** 셸 명령이 0이 아닌 값으로 끝난 몫. 점수에 넣지 않고 정보로만 보인다. 셸 결과가 없거나 못 보는 형식이면 null */
  shellNonZero: number | null;
  /** 수집 구간의 날마다(오래된 날부터) */
  calendar: CalendarCell[];
  /** 점수에 넣는 도구마다(도구 식별자의 차례) */
  byTool: ToolUsageShare[];
}

const inRange = (date: string, range: { from: LocalDate; to: LocalDate }): boolean => date >= range.from && date <= range.to;

/** 점수 구간의 셸 도구 결과와 그 가운데 오류. 거절되거나 끊겨서 끝난 것은 결과에 들지 않는다(9.5) */
function shellCounts(tool: ToolInput, score: { from: LocalDate; to: LocalDate }): { results: number; errors: number } | null {
  if (tool.coverage.shellExitCodes === "unsupported") return null;
  const shell = new Set(tool.shellTools);
  let results = 0;
  let errors = 0;
  for (const summary of tool.summaries) {
    for (const [date, day] of Object.entries(summary.days)) {
      if (!inRange(date, score)) continue;
      for (const [name, counts] of Object.entries(day.tools)) {
        if (!shell.has(name)) continue;
        results += counts.results;
        errors += counts.errors;
      }
    }
  }
  return { results, errors };
}

const share = (counts: { results: number; errors: number } | null): number | null => (counts === null || counts.results === 0 ? null : counts.errors / counts.results);

export function resultUsage(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): ResultUsage {
  const score = evaluation.windows.score;
  const e1 = evaluation.findings.find((finding) => finding.ruleId === "E1") ?? null;
  const scored = evaluation.tools.filter((tool) => tool.scored);
  const inputs = new Map(input.tools.map((tool) => [tool.tool, tool]));

  const byTool = scored.map((tool): ToolUsageShare => ({
    tool: tool.tool,
    mainSessions: tool.totals.mainSessions.length,
    activeDays: tool.totals.activeDates.length,
    outputTokens: tool.totals.tokens.output,
    cacheHit: e1?.tools.find((value) => value.tool === tool.tool)?.value ?? null,
    shellNonZero: share(shellCounts(inputs.get(tool.tool)!, score)),
  }));
  const shells = scored.map((tool) => shellCounts(inputs.get(tool.tool)!, score)).filter((counts): counts is { results: number; errors: number } => counts !== null);

  // 달력: 응답 수는 모든 도구를 합치고, 볼 수 있는지는 기록이 남아 있는 도구의 가장 오래된 기록의 날짜로 가른다
  const responsesByDate = new Map<string, number>();
  for (const tool of input.tools) {
    for (const summary of tool.summaries) {
      for (const [date, day] of Object.entries(summary.days)) responsesByDate.set(date, (responsesByDate.get(date) ?? 0) + day.responses);
    }
  }
  const visibleFroms = collected.map((tool) => tool.visibleFrom).filter((date): date is LocalDate => date !== null);
  const calendar = makeWindows(input.clock.nowMs, input.clock.timeZone).collectDates.map((date): CalendarCell => {
    const responses = responsesByDate.get(date) ?? 0;
    const state: CalendarState = responses > 0 ? "used" : visibleFroms.some((from) => from <= date) ? "unused" : "unseen";
    return { date, responses, state };
  });

  return {
    mainSessions: byTool.reduce((sum, tool) => sum + tool.mainSessions, 0),
    activeDays: new Set(scored.flatMap((tool) => tool.totals.activeDates)).size,
    outputTokens: byTool.reduce((sum, tool) => sum + tool.outputTokens, 0),
    cacheHit: e1?.value ?? null,
    shellNonZero: shells.length === 0 ? null : share({ results: shells.reduce((sum, counts) => sum + counts.results, 0), errors: shells.reduce((sum, counts) => sum + counts.errors, 0) }),
    calendar,
    byTool,
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 19개, 시험 490개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-usage.test.ts src/core/result/usage.ts
git commit -m "feat: 평가 결과의 사용 기록 추가"
```

---

### Task 8: 도구별 값의 관측 범위

**Files:**
- Create: `src/core/result/observed.ts`
- Test: `test/core/result-observed.test.ts`

**Interfaces:**
- Consumes: 1단계의 `Coverage`, `CoverageKey`, `ToolCoverage`(`src/adapters/types.ts`), 2부의 `ToolRuleId`, `TOOL_RULES`(`src/core/scoreboard.ts`).
- Produces: `RULE_METRICS: Record<ToolRuleId, readonly CoverageKey[]>`, `observedOf(rule: ToolRuleId, coverage: ToolCoverage): Coverage`. 과제 12가 도구별 값마다 붙인다.

설계 12.2의 도구별 값의 「관측 범위」(9.7의 봄, 대신 봄, 못 봄)다(「2단계 3부 계획에서 보완」의 11번). 규칙마다 재는지를 가르는 지표를 표로 두고, 그 가운데 가장 약한 것을 낸다. 지표를 쓰지 않는 규칙(F5)은 봄이다.

- 표는 2부의 규칙이 실제로 보는 지표와 같아야 한다. 시험이 지표 열다섯을 하나씩 못 봄으로 바꿔 평가를 돌리고, 도구별 규칙 열둘이 못 본 것(`unsupported`)이 되는지를 표와 견준다. 표를 틀리게 바꾸면 이 시험이 잡는다(S5를 비우기, F2에서 하나 빼기, E5에 실린 이름 더하기를 넣어 봤다).
- E5와 E6의 판정에 쓰는 실린 이름(`loadedNames`)은 표에 없다. 그것을 못 봐도 2부의 규칙은 잰다. Codex(5단계)에서는 스캐너의 목록으로 대신하므로 그때 "대신 봄"으로 보일지를 다시 본다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-observed.test.ts`(새 파일):

```ts
// 도구별 값의 관측 범위(봄, 대신 봄, 못 봄)를 시험한다. 규칙마다 쓰는 지표의 표가 실제 규칙이 재는지 가르는 지표와 같은지를, 지표 하나씩 못 봄으로 바꿔 평가를 돌려 본다(설계 9.7, 12.2)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import type { CoverageKey, ToolCoverage } from "../../src/adapters/types.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { observedOf, RULE_METRICS } from "../../src/core/result/observed.ts";
import { TOOL_RULES } from "../../src/core/scoreboard.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";

const KEYS = Object.keys(CLAUDE_COVERAGE) as CoverageKey[];

describe("규칙마다 쓰는 지표", () => {
  it("도구별 규칙마다 하나씩 있고 합침 규칙은 없다", () => {
    expect(Object.keys(RULE_METRICS).sort()).toEqual([...TOOL_RULES].sort());
  });

  it("표의 지표를 못 보면 그 규칙이 못 본 것(unsupported)이 되고, 표에 없는 지표를 못 보면 그렇게 되지 않는다", () => {
    const mismatches: string[] = [];
    for (const key of KEYS) {
      const coverage: ToolCoverage = { ...CLAUDE_COVERAGE, [key]: "unsupported" };
      const evaluation = evaluate(evaluationInput([claudeTool({ coverage, sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 1 } } }] })]));
      for (const rule of TOOL_RULES) {
        const value = evaluation.findings.find((finding) => finding.ruleId === rule)!.tools[0]!;
        const unsupported = value.status === "unmeasured" && value.reason === "unsupported";
        if (unsupported !== RULE_METRICS[rule].includes(key)) mismatches.push(`${rule}:${key}:${unsupported}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("관측 범위", () => {
  it("규칙이 쓰는 지표 가운데 가장 약한 것을 낸다. 지표를 쓰지 않는 규칙은 봄이다", () => {
    expect(observedOf("E7", CLAUDE_COVERAGE)).toBe("measured");
    expect(observedOf("E7", { ...CLAUDE_COVERAGE, interruptedTurns: "proxy" })).toBe("proxy");
    expect(observedOf("E7", { ...CLAUDE_COVERAGE, interruptedTurns: "proxy", deniedAndLengthStops: "unsupported" })).toBe("unsupported");
    expect(observedOf("F2", { ...CLAUDE_COVERAGE, autoCompaction: "proxy" })).toBe("proxy");
    expect(observedOf("F5", { ...CLAUDE_COVERAGE, skillUsage: "unsupported" })).toBe("measured");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-observed.test.ts`
Expected: FAIL. `src/core/result/observed.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/observed.ts`(새 파일):

```ts
// 도구별 값의 관측 범위를 정한다. 규칙마다 재는지를 가르는 지표(설계 9.7의 표의 줄)를 두고, 그 도구가 그 지표를 봤는지(봄, 대신 봄, 못 봄) 가운데 가장 약한 것을 낸다(순수 함수, 설계 9.7, 12.2)
import type { Coverage, CoverageKey, ToolCoverage } from "../../adapters/types.ts";
import type { ToolRuleId } from "../scoreboard.ts";

/**
 * 도구별 규칙마다 재는지를 가르는 지표. 규칙이 그 지표를 못 보면 그 도구에서 unsupported가 된다(시험이 실제 규칙과 맞춘다).
 * F5는 셋팅으로 재고 기록의 지표를 쓰지 않는다. E5와 E6의 판정에 쓰는 실린 이름은 이 표에 없다. 그것을 못 봐도 규칙은 재기 때문이다(Codex는 스캐너의 목록으로 대신한다. 5단계)
 */
export const RULE_METRICS: Record<ToolRuleId, readonly CoverageKey[]> = {
  S4: ["mcpFailuresAndHooks"],
  S5: ["mcpFailuresAndHooks"],
  E1: ["responsesAndTokens"],
  E2: ["toolErrors"],
  E3: ["autoCompaction"],
  E4: ["instructionSize"],
  E5: ["skillUsage"],
  E6: ["mcpCalls"],
  E7: ["deniedAndLengthStops", "interruptedTurns"],
  F1: ["effort"],
  F2: ["subagents", "autoCompaction"],
  F5: [],
};

const STRENGTH: Record<Coverage, number> = { unsupported: 0, proxy: 1, measured: 2 };

/** 그 규칙이 쓰는 지표를 그 도구가 봤는지. 지표가 여럿이면 가장 약한 것이고, 지표를 쓰지 않는 규칙은 봄이다 */
export function observedOf(rule: ToolRuleId, coverage: ToolCoverage): Coverage {
  return RULE_METRICS[rule].reduce<Coverage>((weakest, key) => (STRENGTH[coverage[key]] < STRENGTH[weakest] ? coverage[key] : weakest), "measured");
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 20개, 시험 493개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-observed.test.ts src/core/result/observed.ts
git commit -m "feat: 도구별 값의 관측 범위 추가"
```

---

### Task 9: 기록 쪽 알림

**Files:**
- Create: `src/core/result/notices.ts`
- Test: `test/core/result-notices-record.test.ts`

**Interfaces:**
- Consumes: 과제 5의 `CollectedTool`, 2부의 `Evaluation`(점수 구간), 1단계의 세션 요약(`weakHumanRequests`, `unknownDenialKinds`, `unknownCompactions`, `notes.unknownHookKinds`, `version`, `parentSessionId`), `compareVersions`, `parseVersion`(`src/adapters/common/version.ts`, core가 값으로 가져올 수 있다).
- Produces: `Notice`(기록 쪽 일곱 종류), `NOTICE_KINDS`, `sortNotices(notices: readonly Notice[]): Notice[]`, `recordNotices(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): Notice[]`, `VERIFIED_VERSIONS`, `WEAK_REQUEST_SHARE`. 과제 10이 종류를 더하고 과제 12가 쓴다.

설계 12.2의 `notices[]`와 본문 곳곳의 "알린다"를 모은 것이다(「2단계 3부 계획에서 보완」의 12번과 13번, 알림 표). 이 과제는 기록 쪽 일곱이다.

- 읽지 못한 기록 파일과 폴더(경로), 스킬과 MCP의 관측이 빠짐없지 않은 것(지표와 까닭), 다른 세션과 겹치는 응답의 세션 수(설계 9.5)를 수집 결과에서 낸다.
- 확인한 범위 밖 버전(설계 20.1). 확인한 범위(9.5의 2.1.220~2.1.322)를 core의 상수로 둔다. 어댑터의 값은 core가 가져오지 못한다. 세션의 버전이 그 밖이면 그 버전들을 버전 차례로 싣는다. 버전을 모르는 세션은 넣지 않는다.
- 근거가 약한 사람 요청(설계 9.5)은 점수 구간의 주 세션에서 센다. 그 몫이 10%를 넘으면 알린다. 정확히 10%는 넘지 않은 것이다.
- 분류하지 못한 거절 표시, 압축, 훅 첨부(설계 9.5의 "종류별 수만 낸다")를 종류마다 더해 싣는다. 모르는 강도는 F1의 근거 숫자에 이미 있어 넣지 않는다.
- 부모를 모르는 하위 세션의 수(설계 9.2).
- 알림의 차례는 종류의 차례, 같으면 도구 식별자의 차례, 그 안은 만든 차례다. 과제 10이 종류를 더하며 차례를 다시 정한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-notices-record.test.ts`(새 파일):

```ts
// 기록 쪽 알림(읽지 못한 기록, 관측이 빠짐없지 않음, 확인한 범위 밖 버전, 겹치는 응답, 근거가 약한 사람 요청, 분류하지 못한 표시, 부모를 모르는 하위 세션)을 시험한다(설계 9.2, 9.5, 9.8, 12.2, 20.1)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { recordNotices, VERIFIED_VERSIONS } from "../../src/core/result/notices.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const base = (): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
});
const noticesOf = (tool: ClaudeToolInput, collected: Partial<CollectedTool> = {}) => {
  const input = evaluationInput([claudeTool(tool)]);
  return recordNotices(input, evaluate(input), [{ ...base(), ...collected }]);
};
const fine = { days: { "2026-11-10": { responses: 3, humanRequests: 10 } } };

describe("기록 쪽 알림", () => {
  it("빠진 것이 없으면 알림이 없다", () => {
    expect(noticesOf({ sessions: [fine] })).toEqual([]);
  });

  it("읽지 못한 기록 파일과 폴더를 경로 차례로 알린다", () => {
    const notices = noticesOf({ sessions: [fine] }, { read: { ...base().read, unreadableFiles: ["/h/p/b.jsonl", "/h/p/a.jsonl"], unreadableDirs: ["/h/q"] } });
    expect(notices).toEqual([{ kind: "record_unreadable", tool: "claude-code", files: ["/h/p/a.jsonl", "/h/p/b.jsonl"], dirs: ["/h/q"] }]);
  });

  it("스킬이나 MCP의 관측이 빠짐없지 않으면 지표마다 까닭과 함께 알린다", () => {
    const notices = noticesOf({ sessions: [fine] }, { observation: { skills: { complete: false, reasons: ["too-long-lines"] }, mcp: { complete: false, reasons: ["unreadable-files", "unconfirmed-pieces"] } } });
    expect(notices).toEqual([
      { kind: "observation_incomplete", tool: "claude-code", metric: "skills", reasons: ["too-long-lines"] },
      { kind: "observation_incomplete", tool: "claude-code", metric: "mcp", reasons: ["unreadable-files", "unconfirmed-pieces"] },
    ]);
  });

  it("확인한 범위 밖 버전의 기록이 있으면 그 버전들을 버전 차례로 알린다. 버전을 모르는 세션은 넣지 않는다", () => {
    expect(VERIFIED_VERSIONS["claude-code"]).toEqual({ from: "2.1.220", to: "2.1.322" });
    const notices = noticesOf({ sessions: [{ ...fine, version: "2.1.323" }, { ...fine, version: "2.1.100" }, { ...fine, version: "2.1.322" }, { ...fine, version: "2.1.220" }, { ...fine, version: null }, { ...fine, version: "2.1.323" }] });
    expect(notices).toEqual([{ kind: "version_unverified", tool: "claude-code", versions: ["2.1.100", "2.1.323"], verified: { from: "2.1.220", to: "2.1.322" } }]);
  });

  it("처음 나온 응답이 다른 세션과 겹치는 세션이 있으면 그 수를 알린다", () => {
    expect(noticesOf({ sessions: [fine] }, { overlappingSessions: 2 })).toEqual([{ kind: "overlapping_responses", tool: "claude-code", sessions: 2 }]);
  });

  it("점수 구간의 사람 요청 가운데 근거가 약한 것이 10%를 넘으면 알린다. 정확히 10%와 구간 밖은 알리지 않는다", () => {
    expect(noticesOf({ sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 10, weakHumanRequests: 1 } } }] })).toEqual([]);
    expect(noticesOf({ sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 10, weakHumanRequests: 2 } } }] })).toEqual([{ kind: "weak_human_requests", tool: "claude-code", weak: 2, total: 10 }]);
    expect(noticesOf({ sessions: [fine, { days: { "2026-10-11": { responses: 1, humanRequests: 5, weakHumanRequests: 5 } } }] })).toEqual([]);
    expect(noticesOf({ sessions: [fine, { kind: "sub", parentSessionId: "x", days: { "2026-11-10": { responses: 1, humanRequests: 5, weakHumanRequests: 5 } } }] })).toEqual([]);
  });

  it("분류하지 못한 거절 표시, 압축, 훅 첨부는 종류마다 수를 더해 알린다", () => {
    const notices = noticesOf({
      sessions: [
        { days: { "2026-11-10": { responses: 1, humanRequests: 10, unknownDenialKinds: { "new-kind": 2 }, unknownCompactions: 1 } }, notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: 0, unknownHookKinds: { hook_odd: 3 } } },
        { days: { "2026-10-11": { responses: 1, unknownDenialKinds: { "new-kind": 1, other: 1 } } } },
      ],
    });
    expect(notices).toEqual([{ kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:new-kind", count: 3 }, { what: "denial:other", count: 1 }, { what: "hook:hook_odd", count: 3 }] }]);
  });

  it("부모를 모르는 하위 세션의 수를 알린다", () => {
    expect(noticesOf({ sessions: [fine, { kind: "sub", parentSessionId: null, days: { "2026-11-10": { responses: 1 } } }, { kind: "sub", parentSessionId: "p", days: { "2026-11-10": { responses: 1 } } }] })).toEqual([{ kind: "orphan_subsessions", tool: "claude-code", sessions: 1 }]);
  });

  it("알림은 종류의 차례로 나온다", () => {
    const notices = noticesOf({ sessions: [{ ...fine, version: "2.1.400" }, { kind: "sub", parentSessionId: null, days: { "2026-11-10": { responses: 1 } } }] }, { overlappingSessions: 1, read: { ...base().read, unreadableFiles: ["/x.jsonl"] } });
    expect(notices.map((notice) => notice.kind)).toEqual(["record_unreadable", "version_unverified", "overlapping_responses", "orphan_subsessions"]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-notices-record.test.ts`
Expected: FAIL. `src/core/result/notices.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/notices.ts`(새 파일):

```ts
// 평가 결과의 알림을 만든다. 점수를 내는 데 쓴 기록과 셋팅에서 빠진 것, 확인하지 못한 것을 종류마다 정해진 모양으로 싣는다(순수 함수, 설계 9.2, 9.5, 9.8, 12.2, 20.1)
import type { ObservationReason } from "../../adapters/claude/observation.ts";
import { compareVersions, parseVersion } from "../../adapters/common/version.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { CollectedTool } from "./tools.ts";

/** 도구마다 기록의 해석 규약을 확인한 버전의 범위(설계 9.5). 새 버전의 기록을 확인하면 넓힌다. 이 밖의 버전은 읽을 수 있는 필드로 계산하고 알린다(설계 20.1) */
export const VERIFIED_VERSIONS: Record<ToolId, { from: string; to: string }> = { "claude-code": { from: "2.1.220", to: "2.1.322" } };
/** 점수 구간의 사람 요청 가운데 근거가 약한 것의 몫이 이것을 넘으면 알린다(설계 9.5). 정확히 이 값은 넘지 않은 것이다 */
export const WEAK_REQUEST_SHARE = 0.1;

export type Notice =
  | { kind: "record_unreadable"; tool: ToolId; files: string[]; dirs: string[] }
  | { kind: "observation_incomplete"; tool: ToolId; metric: "skills" | "mcp"; reasons: ObservationReason[] }
  | { kind: "version_unverified"; tool: ToolId; versions: string[]; verified: { from: string; to: string } }
  | { kind: "overlapping_responses"; tool: ToolId; sessions: number }
  | { kind: "weak_human_requests"; tool: ToolId; weak: number; total: number }
  | { kind: "unclassified"; tool: ToolId; counts: { what: string; count: number }[] }
  | { kind: "orphan_subsessions"; tool: ToolId; sessions: number };

/** 알림의 차례. 같은 종류는 도구 식별자의 차례이고, 그 안은 만든 차례다(설계 12.2 「차례」) */
export const NOTICE_KINDS: readonly Notice["kind"][] = ["record_unreadable", "observation_incomplete", "version_unverified", "overlapping_responses", "weak_human_requests", "unclassified", "orphan_subsessions"];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const inRange = (date: string, range: { from: string; to: string }): boolean => date >= range.from && date <= range.to;

export function sortNotices(notices: readonly Notice[]): Notice[] {
  return notices
    .map((notice, index) => ({ notice, index }))
    .sort((a, b) => NOTICE_KINDS.indexOf(a.notice.kind) - NOTICE_KINDS.indexOf(b.notice.kind) || byText(a.notice.tool, b.notice.tool) || a.index - b.index)
    .map((item) => item.notice);
}

/** 기록 쪽 알림. 읽은 양과 같은 범위(수집 구간에 걸려 읽은 기록)를 보고, 근거가 약한 사람 요청만 점수 구간의 주 세션으로 본다 */
export function recordNotices(input: EvaluationInput, evaluation: Evaluation, collected: readonly CollectedTool[]): Notice[] {
  const notices: Notice[] = [];
  for (const tool of input.tools) {
    const id = tool.tool;
    const found = collected.find((item) => item.tool === id);
    if (found !== undefined) {
      const { unreadableFiles, unreadableDirs } = found.read;
      if (unreadableFiles.length > 0 || unreadableDirs.length > 0) notices.push({ kind: "record_unreadable", tool: id, files: [...unreadableFiles].sort(byText), dirs: [...unreadableDirs].sort(byText) });
      for (const metric of ["skills", "mcp"] as const) {
        const observation = found.observation[metric];
        if (!observation.complete) notices.push({ kind: "observation_incomplete", tool: id, metric, reasons: [...observation.reasons] });
      }
      if (found.overlappingSessions > 0) notices.push({ kind: "overlapping_responses", tool: id, sessions: found.overlappingSessions });
    }

    const verified = VERIFIED_VERSIONS[id];
    const [from, to] = [parseVersion(verified.from)!, parseVersion(verified.to)!];
    const outside = new Map<string, readonly [number, number, number]>();
    for (const summary of tool.summaries) {
      const version = parseVersion(summary.version);
      if (version !== null && (compareVersions(version, from) < 0 || compareVersions(version, to) > 0)) outside.set(summary.version!, version);
    }
    if (outside.size > 0) notices.push({ kind: "version_unverified", tool: id, versions: [...outside].sort((a, b) => compareVersions(a[1], b[1])).map(([text]) => text), verified: { ...verified } });

    let total = 0;
    let weak = 0;
    for (const summary of tool.summaries) {
      if (summary.kind !== "main") continue;
      for (const [date, day] of Object.entries(summary.days)) {
        if (!inRange(date, evaluation.windows.score)) continue;
        total += day.humanRequests;
        weak += day.weakHumanRequests;
      }
    }
    if (total > 0 && weak / total > WEAK_REQUEST_SHARE) notices.push({ kind: "weak_human_requests", tool: id, weak, total });

    const counts = new Map<string, number>();
    const add = (what: string, count: number): void => {
      if (count > 0) counts.set(what, (counts.get(what) ?? 0) + count);
    };
    for (const summary of tool.summaries) {
      for (const [kind, count] of Object.entries(summary.notes.unknownHookKinds)) add(`hook:${kind}`, count);
      for (const day of Object.values(summary.days)) {
        for (const [kind, count] of Object.entries(day.unknownDenialKinds)) add(`denial:${kind}`, count);
        add("compaction", day.unknownCompactions);
      }
    }
    if (counts.size > 0) notices.push({ kind: "unclassified", tool: id, counts: [...counts].sort((a, b) => byText(a[0], b[0])).map(([what, count]) => ({ what, count })) });

    const orphans = tool.summaries.filter((summary) => summary.kind === "sub" && summary.parentSessionId === null).length;
    if (orphans > 0) notices.push({ kind: "orphan_subsessions", tool: id, sessions: orphans });
  }
  return sortNotices(notices);
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 21개, 시험 502개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-notices-record.test.ts src/core/result/notices.ts
git commit -m "feat: 기록 쪽 알림 추가"
```

---

### Task 10: 셋팅 쪽 알림, 실행 입력 알림, 알림의 차례

**Files:**
- Modify: `src/core/result/notices.ts`
- Test: `test/core/result-notices-setup.test.ts`

**Interfaces:**
- Consumes: 과제 9의 `Notice`, `sortNotices`, 1부의 셋팅 사실(`claudeJson`, `settings`, `pluginsFile`, `unreadableDirs`, 지침의 `unreadable`·`unreadableDirs`, `hooks.unreadableSettings`·`unreadablePlugins`, `skills[].readable`, `plugins`, `pluginsWithoutInstall`, `unreadableSkillPlaces`, `problems`, `projects`), 2부의 `Withheld`.
- Produces: `Notice`에 여섯 종류(`score_withheld`, `state_reset`, `setup_unreadable`, `plugins_uncounted`, `setup_problems_unscored`, `projects_gone`)를 더한다. `UnreadableSetup`, `UncountedPlugin`, `setupNotices(input: EvaluationInput, evaluation: Evaluation, run: { stateBroken: boolean }): Notice[]`. 과제 12가 쓴다.

알림 표의 나머지 여섯이다(「2단계 3부 계획에서 보완」의 12번).

- 있는데 읽지 못한 셋팅(풀리지 않거나 열 수 없다)을 무엇인지에 따라 나눠 싣는다. 없는 파일은 읽지 못한 것이 아니다(설계 18.1 「읽지 못한 곳」과 같은 뜻). 대상은 글자 차례이고 같은 것은 한 번이다.
- 켜져 있는데 세지 않은 플러그인을 까닭(구성을 모름, 설치 기록에 없음, 스킬 폴더를 읽지 못함, MCP 정의를 읽지 못함, 훅을 읽지 못함)마다 싣는다(설계 11.3 E5·E6, 16.2, 20.1). 꺼진 플러그인은 대상이 아니다. 켜진 플러그인의 사실(`enabled`, `hooksUnreadable`)에서 고른다. 스캐너의 다른 목록은 쓰임이 달라 범위가 다르다. 스킬 폴더를 읽지 못한 목록에는 꺼진 플러그인도 들고, 훅을 읽지 못한 목록(S2의 확인 훅을 찾는 곳)에는 사용자 범위로 깔아 사용자 설정이나 관리 정책이 켠 것만 든다(짝 Codex 1의 계획 리뷰 1차). 구성을 모르는 플러그인은 훅·MCP를 읽지 못한 것으로도 적히므로 그 둘에서는 구성을 아는 것만 싣는다. 설치 기록은 있는데 놓인 곳이 지금 없는 플러그인도 구성을 모르는 것으로 싣는다. 2부는 켜진 플러그인 가운데 구성을 모르는 것이 하나라도 있으면 스킬 끄기와 서버 막기 후보를 막으므로(`candidatesOf`), 알림이 그 까닭을 빠짐없이 보여야 한다(주 세션의 2차 자기 검토).
- 점수에 세지 않는 플러그인과 관리 정책 안의 문제(S3이 세지 않고 알리는 것)를 싣는다. 도구가 쓰는 파일(`.claude.json`)의 문제는 읽지 못한 셋팅으로 이미 알리므로 겹쳐 싣지 않는다. 사용자가 고치는 셋팅의 문제는 S3이 센다.
- 작업 폴더가 지금 PC에 없는 프로젝트(설계 10, F3·F4·F6·S2의 프로젝트 쪽에서 뺀다), 상태 파일이 깨져 새로 시작한 것, AQ를 내지 않은 것과 그 까닭이다.
- 알림의 차례를 점수에 닿는 것, 읽지 못한 것, 확인하지 못한 것으로 정한다. 도구를 합친 알림(도구 식별자가 없는 것)은 같은 종류에서 먼저다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-notices-setup.test.ts`(새 파일):

```ts
// 셋팅 쪽 알림(읽지 못한 셋팅, 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제, 지금 PC에 없는 프로젝트)과 실행 입력 알림(상태 파일이 깨짐, AQ 보류), 알림 전체의 차례를 시험한다(설계 10, 11.3, 11.4, 12.2, 18.1, 20.1)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { NOTICE_KINDS, setupNotices } from "../../src/core/result/notices.ts";
import { HOME, instructions, plugin, project, skill } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
const noticesOf = (tool: ClaudeToolInput, run = { stateBroken: false }) => {
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return setupNotices(input, evaluate(input), run);
};

describe("셋팅 쪽 알림", () => {
  it("빠진 것이 없으면 알림이 없다", () => {
    expect(noticesOf({})).toEqual([]);
  });

  it("있는데 읽지 못한 셋팅을 무엇인지에 따라 나눠 알린다. 대상은 글자 차례이고 같은 것은 한 번이다", () => {
    const notices = noticesOf({
      setup: {
        claudeJson: "unparsable",
        settings: { user: "unreadable", managedParts: [{ path: "/etc/managed/b.json", status: "unparsable" }, { path: "/etc/managed/a.json", status: "ok" }], defaultMode: { user: null, managed: null } },
        pluginsFile: "unreadable",
        unreadableDirs: [`${HOME}/skills`],
        globalInstructions: instructions({ unreadable: [`${HOME}/CLAUDE.md`], unreadableDirs: [`${HOME}/rules`] }),
        hooks: { guards: [], userDisableAll: false, managedDisableAll: false, managedAllowManagedOnly: false, unreadablePlugins: [], unreadableSettings: ["/etc/managed/b.json"] },
        skills: [skill("locked", { readable: false }), skill("fine")],
        projects: [project("/work/app", { settingsStatus: "unparsable", localSettingsStatus: "unreadable", mcpJsonStatus: "unparsable", instructions: instructions({ unreadable: ["/work/app/CLAUDE.md"] }) })],
      },
    });
    expect(notices).toEqual([
      { kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "user_settings", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "managed_settings", targets: ["/etc/managed/b.json"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "project_settings", targets: ["/work/app"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "local_settings", targets: ["/work/app"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "mcp_json", targets: ["/work/app"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "plugins_file", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "skill_dirs", targets: [`${HOME}/skills`] },
      { kind: "setup_unreadable", tool: "claude-code", what: "instructions", targets: [`${HOME}/CLAUDE.md`, `${HOME}/rules`, "/work/app/CLAUDE.md"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "hook_settings", targets: ["/etc/managed/b.json"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "skill_files", targets: [`${HOME}/skills/locked`] },
    ]);
  });

  it("없는 파일은 읽지 못한 것이 아니다", () => {
    expect(noticesOf({ setup: { claudeJson: "missing", pluginsFile: "missing", projects: [project("/work/app", { settingsStatus: "missing", mcpJsonStatus: "missing" })] } })).toEqual([]);
  });

  it("켜져 있는데 세지 않은 플러그인을 까닭마다 알린다. 꺼진 플러그인은 알리지 않는다", () => {
    const notices = noticesOf({
      setup: {
        plugins: [
          plugin("unknown@m", { compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true }),
          // 설치 기록은 있는데 놓인 곳이 지금 없는 플러그인도 구성을 모르는 켜진 플러그인이다. 2부는 이것으로 스킬 끄기와 서버 막기 후보를 막는다
          plugin("gone@m", { exists: false, compositionKnown: false, hooksUnreadable: true, mcpUnreadable: true }),
          plugin("off@m", { compositionKnown: false, enabled: false }),
          plugin("mcp@m", { mcpUnreadable: true }),
          plugin("hooks@m", { hooksUnreadable: true }),
          // 프로젝트 범위로 깔아 켠 것과 기본 켜짐으로 켠 것도 훅을 읽지 못하면 알린다. S2의 확인 훅을 찾는 목록에는 들지 않는다
          plugin("project-hooks@m", { hooksUnreadable: true, scopes: ["project"], projectRoots: ["/work/app"] }),
          plugin("skills@m"),
          plugin("off-skills@m", { enabled: false }),
          plugin("off-hooks@m", { enabled: false, hooksUnreadable: true }),
        ],
        pluginsWithoutInstall: ["ghost@m"],
        hooks: { guards: [], userDisableAll: false, managedDisableAll: false, managedAllowManagedOnly: false, unreadablePlugins: [], unreadableSettings: [] },
        unreadableSkillPlaces: { user: false, projects: [], plugins: ["skills@m", "off-skills@m"] },
      },
    });
    expect(notices).toEqual([
      { kind: "plugins_uncounted", tool: "claude-code", why: "composition_unknown", plugins: ["gone@m", "unknown@m"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "not_installed", plugins: ["ghost@m"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "skills_unreadable", plugins: ["skills@m"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "mcp_unreadable", plugins: ["mcp@m"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "hooks_unreadable", plugins: ["hooks@m", "project-hooks@m"] },
    ]);
  });

  it("플러그인 안의 문제는 점수에 세지 않고 알린다. 도구가 쓰는 파일(.claude.json)의 문제는 읽지 못한 셋팅으로 이미 알려 겹쳐 싣지 않는다", () => {
    const notices = noticesOf({
      setup: {
        claudeJson: "unparsable",
        problems: [
          { kind: "unparsable", owner: "tool", path: `${HOME}/../.claude.json`, realPath: null },
          { kind: "noFrontmatter", owner: "plugin", path: "/p/b/skills/x", realPath: null },
          { kind: "danglingLink", owner: "plugin", path: "/p/a/skills/y", realPath: null },
          { kind: "noFrontmatter", owner: "user", path: `${HOME}/skills/z`, realPath: null },
        ],
      },
    });
    expect(notices.filter((notice) => notice.kind === "setup_problems_unscored")).toEqual([
      { kind: "setup_problems_unscored", tool: "claude-code", problems: [{ kind: "danglingLink", path: "/p/a/skills/y" }, { kind: "noFrontmatter", path: "/p/b/skills/x" }] },
    ]);
  });

  it("작업 폴더가 지금 PC에 없는 프로젝트를 알린다. 프로젝트로 보지 않는 폴더는 알리지 않는다", () => {
    const notices = noticesOf({ setup: { projects: [project("/work/gone", { exists: false }), project("/work/here"), project("/home/u", { excluded: true, exists: true })] } });
    expect(notices).toEqual([{ kind: "projects_gone", projects: ["/work/gone"] }]);
  });
});

describe("실행 입력 알림과 차례", () => {
  it("상태 파일이 깨져 새로 시작했으면 알린다", () => {
    expect(noticesOf({}, { stateBroken: true })).toEqual([{ kind: "state_reset" }]);
  });

  it("AQ를 내지 않았으면 까닭과 함께 알린다", () => {
    const input = evaluationInput([claudeTool({ sessions: [{ days: { "2026-11-10": { responses: 1, humanRequests: 1 } } }] })]);
    expect(setupNotices(input, evaluate(input), { stateBroken: false })).toEqual([{ kind: "score_withheld", reasons: ["too_few_requests", "too_few_days"] }]);
  });

  it("알림의 차례는 점수에 닿는 것, 읽지 못한 것, 확인하지 못한 것이다", () => {
    expect(NOTICE_KINDS).toEqual([
      "score_withheld",
      "state_reset",
      "record_unreadable",
      "observation_incomplete",
      "setup_unreadable",
      "plugins_uncounted",
      "setup_problems_unscored",
      "projects_gone",
      "version_unverified",
      "weak_human_requests",
      "overlapping_responses",
      "unclassified",
      "orphan_subsessions",
    ]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-notices-setup.test.ts`
Expected: FAIL. `setupNotices`가 없어 시험 아홉이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/notices.ts`(찾을 곳 1/6):

```ts
import type { ToolId } from "../../adapters/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { CollectedTool } from "./tools.ts";
```

`src/core/result/notices.ts`(바꾼 뒤 1/6):

```ts
import type { ToolId } from "../../adapters/types.ts";
import type { FileStatus, SetupProblem } from "../../scan/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { Withheld } from "../scoreboard.ts";
import type { CollectedTool } from "./tools.ts";
```

`src/core/result/notices.ts`(찾을 곳 2/6):

```ts

export type Notice =
  | { kind: "record_unreadable"; tool: ToolId; files: string[]; dirs: string[] }
  | { kind: "observation_incomplete"; tool: ToolId; metric: "skills" | "mcp"; reasons: ObservationReason[] }
  | { kind: "version_unverified"; tool: ToolId; versions: string[]; verified: { from: string; to: string } }
  | { kind: "overlapping_responses"; tool: ToolId; sessions: number }
  | { kind: "weak_human_requests"; tool: ToolId; weak: number; total: number }
  | { kind: "unclassified"; tool: ToolId; counts: { what: string; count: number }[] }
```

`src/core/result/notices.ts`(바꾼 뒤 2/6):

```ts

/** 있는데 읽지 못한 셋팅이 무엇인지. 이 차례로 싣는다 */
export type UnreadableSetup = "claude_json" | "user_settings" | "managed_settings" | "project_settings" | "local_settings" | "mcp_json" | "plugins_file" | "skill_dirs" | "instructions" | "hook_settings" | "skill_files";
/** 켜져 있는 플러그인을 세지 않은 까닭. 이 차례로 싣는다(설계 10 「구성을 모르는 플러그인」, 11.3 E5·E6, 16.2) */
export type UncountedPlugin = "composition_unknown" | "not_installed" | "skills_unreadable" | "mcp_unreadable" | "hooks_unreadable";

export type Notice =
  | { kind: "score_withheld"; reasons: Withheld[] }
  | { kind: "state_reset" }
  | { kind: "record_unreadable"; tool: ToolId; files: string[]; dirs: string[] }
  | { kind: "observation_incomplete"; tool: ToolId; metric: "skills" | "mcp"; reasons: ObservationReason[] }
  | { kind: "setup_unreadable"; tool: ToolId; what: UnreadableSetup; targets: string[] }
  | { kind: "plugins_uncounted"; tool: ToolId; why: UncountedPlugin; plugins: string[] }
  | { kind: "setup_problems_unscored"; tool: ToolId; problems: { kind: SetupProblem["kind"]; path: string }[] }
  | { kind: "projects_gone"; projects: string[] }
  | { kind: "version_unverified"; tool: ToolId; versions: string[]; verified: { from: string; to: string } }
  | { kind: "weak_human_requests"; tool: ToolId; weak: number; total: number }
  | { kind: "overlapping_responses"; tool: ToolId; sessions: number }
  | { kind: "unclassified"; tool: ToolId; counts: { what: string; count: number }[] }
```

`src/core/result/notices.ts`(찾을 곳 3/6):

```ts

/** 알림의 차례. 같은 종류는 도구 식별자의 차례이고, 그 안은 만든 차례다(설계 12.2 「차례」) */
export const NOTICE_KINDS: readonly Notice["kind"][] = ["record_unreadable", "observation_incomplete", "version_unverified", "overlapping_responses", "weak_human_requests", "unclassified", "orphan_subsessions"];

```

`src/core/result/notices.ts`(바꾼 뒤 3/6):

```ts

/**
 * 알림의 차례. 점수에 닿는 것, 읽지 못한 것, 확인하지 못한 것이다. 같은 종류는 도구 식별자의 차례(도구를 합친 알림이 먼저)이고,
 * 그 안은 만든 차례다(설계 12.2 「차례」)
 */
export const NOTICE_KINDS: readonly Notice["kind"][] = [
  "score_withheld",
  "state_reset",
  "record_unreadable",
  "observation_incomplete",
  "setup_unreadable",
  "plugins_uncounted",
  "setup_problems_unscored",
  "projects_gone",
  "version_unverified",
  "weak_human_requests",
  "overlapping_responses",
  "unclassified",
  "orphan_subsessions",
];

```

`src/core/result/notices.ts`(찾을 곳 4/6):

```ts
const inRange = (date: string, range: { from: string; to: string }): boolean => date >= range.from && date <= range.to;

```

`src/core/result/notices.ts`(바꾼 뒤 4/6):

```ts
const inRange = (date: string, range: { from: string; to: string }): boolean => date >= range.from && date <= range.to;
const toolOf = (notice: Notice): string => ("tool" in notice ? notice.tool : "");

```

`src/core/result/notices.ts`(찾을 곳 5/6):

```ts
    .map((notice, index) => ({ notice, index }))
    .sort((a, b) => NOTICE_KINDS.indexOf(a.notice.kind) - NOTICE_KINDS.indexOf(b.notice.kind) || byText(a.notice.tool, b.notice.tool) || a.index - b.index)
    .map((item) => item.notice);
```

`src/core/result/notices.ts`(바꾼 뒤 5/6):

```ts
    .map((notice, index) => ({ notice, index }))
    .sort((a, b) => NOTICE_KINDS.indexOf(a.notice.kind) - NOTICE_KINDS.indexOf(b.notice.kind) || byText(toolOf(a.notice), toolOf(b.notice)) || a.index - b.index)
    .map((item) => item.notice);
```

`src/core/result/notices.ts`(찾을 곳 6/6):

```ts

/** 기록 쪽 알림. 읽은 양과 같은 범위(수집 구간에 걸려 읽은 기록)를 보고, 근거가 약한 사람 요청만 점수 구간의 주 세션으로 본다 */
```

`src/core/result/notices.ts`(바꾼 뒤 6/6):

```ts

/** 있는데 열지 못했거나 열었는데 풀리지 않았다. 없는 것은 읽지 못한 것이 아니다 */
const unread = (status: FileStatus | null): boolean => status === "unparsable" || status === "unreadable";
const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(byText);

/**
 * 셋팅 쪽 알림과 실행 입력 알림. 있는데 읽지 못한 셋팅, 켜져 있는데 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제,
 * 지금 PC에 없는 프로젝트, 상태 파일이 깨져 새로 시작한 것, AQ를 내지 않은 것이다
 */
export function setupNotices(input: EvaluationInput, evaluation: Evaluation, run: { stateBroken: boolean }): Notice[] {
  const notices: Notice[] = [];
  if (evaluation.score.withheld.length > 0) notices.push({ kind: "score_withheld", reasons: [...evaluation.score.withheld] });
  if (run.stateBroken) notices.push({ kind: "state_reset" });

  for (const tool of input.tools) {
    const id = tool.tool;
    const setup = tool.setup;
    const unreadable: [UnreadableSetup, boolean, string[]][] = [
      ["claude_json", unread(setup.claudeJson), []],
      ["user_settings", unread(setup.settings.user), []],
      ["managed_settings", false, setup.settings.managedParts.filter((part) => unread(part.status)).map((part) => part.path)],
      ["project_settings", false, setup.projects.filter((project) => unread(project.settingsStatus)).map((project) => project.root)],
      ["local_settings", false, setup.projects.filter((project) => unread(project.localSettingsStatus)).map((project) => project.root)],
      ["mcp_json", false, setup.projects.filter((project) => unread(project.mcpJsonStatus)).map((project) => project.root)],
      ["plugins_file", unread(setup.pluginsFile), []],
      ["skill_dirs", false, setup.unreadableDirs],
      ["instructions", false, [setup.globalInstructions, ...setup.projects.map((project) => project.instructions)].flatMap((set) => [...set.unreadable, ...set.unreadableDirs])],
      ["hook_settings", false, setup.hooks.unreadableSettings],
      ["skill_files", false, setup.skills.filter((skill) => !skill.readable).map((skill) => skill.path)],
    ];
    for (const [what, whole, targets] of unreadable) {
      if (whole || targets.length > 0) notices.push({ kind: "setup_unreadable", tool: id, what, targets: sortedUnique(targets) });
    }

    // 켜져 있는 플러그인의 사실에서 고른다. 스캐너의 다른 목록은 쓰임이 달라 범위가 다르다. 스킬 폴더를 읽지 못한 목록에는 꺼진 플러그인도 들고,
    // 훅을 읽지 못한 목록(S2의 확인 훅을 찾는 곳)에는 사용자 범위로 깔아 사용자 설정이나 관리 정책이 켠 것만 든다
    const enabled = setup.plugins.filter((plugin) => plugin.enabled);
    const enabledIds = new Set(enabled.map((plugin) => plugin.id));
    const uncounted: [UncountedPlugin, string[]][] = [
      // 놓인 곳이 지금 없는 플러그인도 구성을 모른다. 2부는 이런 플러그인이 켜져 있으면 스킬 끄기와 서버 막기 후보를 막는다
      ["composition_unknown", enabled.filter((plugin) => !plugin.compositionKnown).map((plugin) => plugin.id)],
      ["not_installed", setup.pluginsWithoutInstall],
      ["skills_unreadable", setup.unreadableSkillPlaces.plugins.filter((id) => enabledIds.has(id))],
      ["mcp_unreadable", enabled.filter((plugin) => plugin.compositionKnown && plugin.mcpUnreadable).map((plugin) => plugin.id)],
      ["hooks_unreadable", enabled.filter((plugin) => plugin.compositionKnown && plugin.hooksUnreadable).map((plugin) => plugin.id)],
    ];
    for (const [why, plugins] of uncounted) {
      if (plugins.length > 0) notices.push({ kind: "plugins_uncounted", tool: id, why, plugins: sortedUnique(plugins) });
    }

    // 도구가 쓰는 파일(.claude.json)의 문제는 읽지 못한 셋팅으로 이미 알린다. 사용자가 고치는 셋팅의 문제는 S3이 센다
    const problems = setup.problems.filter((problem) => problem.owner === "plugin" || problem.owner === "managed").map((problem) => ({ kind: problem.kind, path: problem.path }));
    if (problems.length > 0) notices.push({ kind: "setup_problems_unscored", tool: id, problems: problems.sort((a, b) => byText(a.path, b.path) || byText(a.kind, b.kind)) });
  }

  const gone = input.projects.filter((project) => !project.exists).map((project) => project.root);
  if (gone.length > 0) notices.push({ kind: "projects_gone", projects: sortedUnique(gone) });
  return sortNotices(notices);
}

/** 기록 쪽 알림. 읽은 양과 같은 범위(수집 구간에 걸려 읽은 기록)를 보고, 근거가 약한 사람 요청만 점수 구간의 주 세션으로 본다 */
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 22개, 시험 511개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-notices-setup.test.ts src/core/result/notices.ts
git commit -m "feat: 셋팅 쪽 알림과 알림의 차례 추가"
```

---

### Task 11: 정밀 점검 단서 셋

**Files:**
- Create: `src/core/result/hints.ts`
- Test: `test/core/result-hints.test.ts`

**Interfaces:**
- Consumes: 1부의 셋팅 사실(`globalMentions`, 지침의 `lineHashes`와 `chars`), 2부의 `ruleSpec`(E4의 만점 기준).
- Produces: `DeepHint`(세 종류), `deepHints(input: EvaluationInput): DeepHint[]`, `MENTION_HINT_MIN`(3), `REPEATED_LINES_HINT_MIN`(3), `LARGE_GLOBAL_TOKENS`(E4의 만점 기준, 4,000). 과제 12가 쓴다.

설계 17의 단서 넷 가운데 Claude Code 하나로 셀 수 있는 셋이다(「2단계 3부 계획에서 보완」의 14번). 점수에 넣지 않는 약한 신호다.

- 전역 지침에 한 프로젝트의 경로나 이름이 3번 이상 나온다. 1부의 스캐너가 이미 센 `globalMentions`(정규화한 뿌리 → 횟수)를 쓰고, 프로젝트의 경로는 목록에서 찾는다.
- 둘 이상의 프로젝트 지침에 나오는 줄이 3줄 이상이다. 줄 지문은 1부가 20자 이상 줄로 만들고 전역과 같은 파일은 뺀 것이다. 전역 지침에도 있는 줄은 F4(전역과 겹침)의 몫이라 세지 않는다.
- 전역 지침의 어림 토큰(E4와 같은 어림. ASCII 4글자에 1토큰, 그 밖의 글자는 1글자에 1토큰)이 E4의 만점 기준을 넘는다. 정확히 그 값은 넘지 않은 것이다.
- 두 도구의 전역 지침을 견주는 단서는 Codex를 넣을 때(5단계) 더한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-hints.test.ts`(새 파일):

```ts
// 정밀 점검 단서 셋(전역 지침에 프로젝트가 여러 번 나온다, 여러 프로젝트 지침에 같은 줄이 되풀이된다, 전역 지침이 크다)을 시험한다. 점수에 넣지 않는 약한 신호다(설계 17)
import { describe, expect, it } from "vitest";
import { deepHints, LARGE_GLOBAL_TOKENS, MENTION_HINT_MIN, REPEATED_LINES_HINT_MIN } from "../../src/core/result/hints.ts";
import { instructions, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const hintsOf = (tool: ClaudeToolInput) => deepHints(evaluationInput([claudeTool(tool)]));

describe("정밀 점검 단서", () => {
  it("기준값은 3번, 3줄, E4의 만점 기준(어림 4,000토큰)이다", () => {
    expect([MENTION_HINT_MIN, REPEATED_LINES_HINT_MIN, LARGE_GLOBAL_TOKENS]).toEqual([3, 3, 4000]);
  });

  it("셋팅에 단서가 없으면 빈 목록이다", () => {
    expect(hintsOf({ setup: { projects: [project("/work/a")] } })).toEqual([]);
  });

  it("전역 지침에 3번 이상 나온 프로젝트를 경로 차례로 낸다", () => {
    const hints = hintsOf({ setup: { projects: [project("/work/b"), project("/work/a"), project("/work/c")], globalMentions: { "/work/b": 3, "/work/a": 5, "/work/c": 2 } } });
    expect(hints).toEqual([{ kind: "global_mentions_project", tool: "claude-code", projects: [{ root: "/work/a", mentions: 5 }, { root: "/work/b", mentions: 3 }] }]);
  });

  it("둘 이상의 프로젝트 지침에 나오는 줄이 3줄 이상이면 낸다. 전역 지침에도 있는 줄은 세지 않는다", () => {
    const shared = ["h1", "h2", "h3"];
    const setup = (globalLines: string[]) => ({
      globalInstructions: instructions({ lineHashes: globalLines }),
      projects: [project("/work/a", { instructions: instructions({ lineHashes: [...shared, "a-only"] }) }), project("/work/b", { instructions: instructions({ lineHashes: ["h1", "h2", "h3"] }) }), project("/work/c", { instructions: instructions({ lineHashes: ["c-only"] }) })],
    });
    expect(hintsOf({ setup: setup([]) })).toEqual([{ kind: "repeated_project_lines", tool: "claude-code", lines: 3, projects: ["/work/a", "/work/b"] }]);
    expect(hintsOf({ setup: setup(["h3"]) })).toEqual([]);
  });

  it("전역 지침의 어림 토큰이 4,000을 넘으면 낸다. 정확히 4,000은 넘지 않은 것이다", () => {
    expect(hintsOf({ setup: { globalInstructions: instructions({ chars: { ascii: 16000, other: 0 } }) } })).toEqual([]);
    expect(hintsOf({ setup: { globalInstructions: instructions({ chars: { ascii: 4, other: 4000 } }) } })).toEqual([{ kind: "large_global_instructions", tool: "claude-code", tokens: 4001 }]);
  });

  it("단서는 종류의 차례로 나온다", () => {
    const hints = hintsOf({
      setup: {
        globalInstructions: instructions({ chars: { ascii: 0, other: 5000 } }),
        globalMentions: { "/work/a": 4 },
        projects: [project("/work/a", { instructions: instructions({ lineHashes: ["x1", "x2", "x3"] }) }), project("/work/b", { instructions: instructions({ lineHashes: ["x1", "x2", "x3"] }) })],
      },
    });
    expect(hints.map((hint) => hint.kind)).toEqual(["global_mentions_project", "repeated_project_lines", "large_global_instructions"]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-hints.test.ts`
Expected: FAIL. `src/core/result/hints.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/hints.ts`(새 파일):

```ts
// 정밀 점검 단서를 만든다. 규칙으로 찾을 수 있는 약한 신호이고 점수에 넣지 않는다. 두 도구의 전역 지침을 견주는 단서는 Codex를 넣을 때(5단계) 더한다(순수 함수, 설계 17)
import type { ToolId } from "../../adapters/types.ts";
import type { EvaluationInput } from "../evaluate.ts";
import { ruleSpec } from "../rules.ts";

/** 전역 지침에 한 프로젝트의 경로나 이름이 이만큼 이상 나오면 단서다 */
export const MENTION_HINT_MIN = 3;
/** 둘 이상의 프로젝트 지침에 나오는 줄이 이만큼 이상이면 단서다 */
export const REPEATED_LINES_HINT_MIN = 3;
/** 전역 지침의 어림 토큰이 이것을 넘으면 단서다. 매번 실리는 지침(E4)의 만점 기준과 같다 */
export const LARGE_GLOBAL_TOKENS = ruleSpec("E4").fullAt;

export type DeepHint =
  | { kind: "global_mentions_project"; tool: ToolId; projects: { root: string; mentions: number }[] }
  | { kind: "repeated_project_lines"; tool: ToolId; lines: number; projects: string[] }
  | { kind: "large_global_instructions"; tool: ToolId; tokens: number };

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function deepHints(input: EvaluationInput): DeepHint[] {
  const hints: DeepHint[] = [];
  for (const tool of [...input.tools].sort((a, b) => byText(a.tool, b.tool))) {
    const setup = tool.setup;
    const rootOf = new Map(setup.projects.map((project) => [project.normRoot, project.root]));

    const mentioned = Object.entries(setup.globalMentions)
      .filter(([, count]) => count >= MENTION_HINT_MIN)
      .map(([normRoot, count]) => ({ root: rootOf.get(normRoot) ?? normRoot, mentions: count }))
      .sort((a, b) => byText(a.root, b.root));
    if (mentioned.length > 0) hints.push({ kind: "global_mentions_project", tool: tool.tool, projects: mentioned });

    // 전역 지침에도 있는 줄은 전역과 겹치는 것(F4)이라 세지 않는다
    const global = new Set(setup.globalInstructions.lineHashes);
    const seen = new Map<string, string[]>();
    for (const project of setup.projects.filter((item) => item.exists && !item.excluded)) {
      for (const hash of new Set(project.instructions.lineHashes)) {
        if (global.has(hash)) continue;
        seen.set(hash, [...(seen.get(hash) ?? []), project.root]);
      }
    }
    const repeated = [...seen.values()].filter((roots) => roots.length >= 2);
    if (repeated.length >= REPEATED_LINES_HINT_MIN) hints.push({ kind: "repeated_project_lines", tool: tool.tool, lines: repeated.length, projects: [...new Set(repeated.flat())].sort(byText) });

    const { ascii, other } = setup.globalInstructions.chars;
    const tokens = ascii / 4 + other;
    if (tokens > LARGE_GLOBAL_TOKENS) hints.push({ kind: "large_global_instructions", tool: tool.tool, tokens });
  }
  return hints;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 23개, 시험 517개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-hints.test.ts src/core/result/hints.ts
git commit -m "feat: 정밀 점검 단서 셋 추가"
```

---

### Task 12: 평가 결과 조립

**Files:**
- Create: `src/core/result/assemble.ts`
- Test: `test/core/result-assemble.test.ts`

**Interfaces:**
- Consumes: 과제 5~11의 함수, 2부의 `Evaluation`(점수, 기준, 규칙, 후보, S2의 근거, F3과 F4의 프로젝트, 판정한 서버), `calledMcpNames`, `anyIn`(`src/core/installs/signals.ts`).
- Produces: `RESULT_SCHEMA`(1), `ResultInput`(`{ input; evaluation; collected; appVersion; run: { stateBroken } }`), `CheckupResult`, `ResultFinding`, `ResultToolValue`, `UnjudgedServer`, `checkupResult(source: ResultInput): CheckupResult`. 과제 13과 과제 15가 쓴다.

설계 12.2의 평가 결과다. 필드의 차례는 `schema`, `rulesVersion`, `appVersion`, `evaluatedAt`, `timezone`, `window`, `tools`, `coverage`, `score`, `axes`, `findings`, `candidates`, `usage`, `deepHints`, `notices`, `details`로 정해 둔다. 문장과 잰 값의 단위는 4부가 더한다(「2단계 3부 계획에서 보완」의 1번).

- 규칙의 차례와 값은 2부의 평가 그대로이고, 도구별 규칙의 도구별 값에만 관측 범위(과제 8)를 붙인다. 합침 규칙은 도구별 값이 빈 목록이다.
- 알림은 기록 쪽과 셋팅 쪽을 합쳐 정해진 차례로 싣는다.
- 따로 둔 자리(`details`)에는 2부가 낸 S2의 근거, F3에서 지침이 없다고 센 프로젝트, F4에서 가장 많이 겹친 프로젝트와, E6 항목의 정보를 싣는다. E6의 정보는 켜져 있는 서버 가운데 판정이 "쓰는지 모름"이고 수집 구간에 부른 기록이 없는 것이고, 까닭은 판정에서 뺀 까닭(정의가 없음, 정의를 읽지 못한 플러그인), 그렇지 않으면 관측이 빠짐없는지에 따라 지켜보는 중이나 관측이 빠짐없지 않음이다(「2단계 3부 계획에서 보완」의 15번). 차례는 설계 11.5의 이름 목록 차례(이름, 범위, 경로)다.
- 평가 결과는 JSON으로 바꿨다가 되살려도 같고 값이 없는 자리는 null이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-assemble.test.ts`(새 파일):

```ts
// 평가 결과의 조립(필드와 차례, 도구별 값의 관측 범위, 알림을 합친 차례, 따로 둔 자리와 E6 정보)을 시험한다(설계 12.2, 13.1)
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, RESULT_SCHEMA, type ResultInput } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { mcpServer } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const collected = (input: Partial<CollectedTool> = {}): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
  ...input,
});
const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
const resultInput = (tool: ClaudeToolInput, extra: Partial<ResultInput> = {}): ResultInput => {
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return { input, evaluation: evaluate(input), collected: [collected()], appVersion: "0.1.0", run: { stateBroken: false }, ...extra };
};

describe("평가 결과의 조립", () => {
  it("필드를 정해진 차례로 싣고 형식 버전, 규칙 버전, 프로그램 버전, 평가 시계, 시간대, 구간을 담는다", () => {
    const input = resultInput({});
    const result = checkupResult(input);
    expect(Object.keys(result)).toEqual(["schema", "rulesVersion", "appVersion", "evaluatedAt", "timezone", "window", "tools", "coverage", "score", "axes", "findings", "candidates", "usage", "deepHints", "notices", "details"]);
    expect(RESULT_SCHEMA).toBe(1);
    expect(result).toMatchObject({ schema: 1, rulesVersion: "1.0.0", appVersion: "0.1.0", evaluatedAt: "2026-11-13T03:00:00.000Z", timezone: "Asia/Seoul", window: input.evaluation.windows });
    expect(result.score).toEqual(input.evaluation.score);
    expect(result.axes).toEqual(input.evaluation.axes);
    expect(result.candidates).toEqual(input.evaluation.candidates);
  });

  it("규칙의 차례와 값은 평가 그대로이고, 도구별 규칙의 도구별 값에만 관측 범위를 붙인다", () => {
    const input = resultInput({ coverage: { ...CLAUDE_COVERAGE, effort: "proxy" } });
    const result = checkupResult(input);
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(input.evaluation.findings.map((finding) => finding.ruleId));
    const f1 = result.findings.find((finding) => finding.ruleId === "F1")!;
    expect(f1.tools.map((value) => value.observed)).toEqual(["proxy"]);
    expect(result.findings.find((finding) => finding.ruleId === "E1")!.tools[0]!.observed).toBe("measured");
    expect(result.findings.find((finding) => finding.ruleId === "S1")!.tools).toEqual([]);
    const { tools, ...rest } = f1;
    const { tools: originalTools, ...originalRest } = input.evaluation.findings.find((finding) => finding.ruleId === "F1")!;
    expect(rest).toEqual(originalRest);
    expect(tools.map(({ observed: _observed, ...value }) => value)).toEqual(originalTools);
  });

  it("알림은 기록 쪽과 셋팅 쪽을 합쳐 정해진 차례로 싣는다", () => {
    const result = checkupResult(resultInput({ setup: { claudeJson: "unreadable" } }, { collected: [collected({ overlappingSessions: 1 })], run: { stateBroken: true } }));
    expect(result.notices.map((notice) => notice.kind)).toEqual(["state_reset", "setup_unreadable", "overlapping_responses"]);
  });

  it("따로 둔 자리에 S2의 근거, F3과 F4의 프로젝트, E6의 판정에서 뺀 서버 가운데 부른 기록이 없는 것을 까닭과 함께 싣는다", () => {
    const servers = [mcpServer("zeta", { definitionHash: null }), mcpServer("alpha"), mcpServer("called"), mcpServer("off", { enabled: false, definitionHash: null })];
    const sessions = [...enough, { days: { "2026-11-12": { responses: 1, mcpCalls: { called: 2 } } } }];
    const input = resultInput({ sessions, setup: { mcpServers: servers } });
    const result = checkupResult(input);
    expect(Object.keys(result.details)).toEqual(["safeguards", "missingInstructions", "worstOverlap", "unjudgedServers"]);
    expect(result.details.safeguards).toEqual(input.evaluation.safeguards);
    expect(result.details.unjudgedServers).toEqual([
      { tool: "claude-code", name: "alpha", scope: "user", projectRoot: null, pluginId: null, why: "not_established" },
      { tool: "claude-code", name: "zeta", scope: "user", projectRoot: null, pluginId: null, why: "no_definition" },
    ]);
    const incomplete = checkupResult(resultInput({ sessions, setup: { mcpServers: servers }, complete: { mcp: false } }));
    expect(incomplete.details.unjudgedServers.map((server) => server.why)).toEqual(["observation_incomplete", "no_definition"]);
  });

  it("JSON으로 바꿨다가 되살려도 같다. 값이 없는 자리는 null이다", () => {
    const result = checkupResult(resultInput({}));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("undefined");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-assemble.test.ts`
Expected: FAIL. `src/core/result/assemble.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/assemble.ts`(새 파일):

```ts
// 평가와 수집 결과에서 평가 결과(결과 파일에 저장하는 것)를 조립한다. 입력 묶음이 같으면 글자 하나 다르지 않다. 문장과 잰 값의 단위는 4부(문구)가 더한다(순수 함수, 설계 12.1, 12.2, 13.1)
import { makeWindows } from "../../adapters/common/dates.ts";
import type { Coverage, ToolId } from "../../adapters/types.ts";
import type { McpFact } from "../../scan/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { Candidate } from "../installs/candidates.ts";
import { anyIn, calledMcpNames } from "../installs/signals.ts";
import type { MissingInstructions, WorstOverlap } from "../metrics/fit.ts";
import type { ToolSafeguard } from "../metrics/setup.ts";
import type { AxisScore, Finding, Overall, ToolRuleId, ToolValue } from "../scoreboard.ts";
import { resultCoverage, type ResultCoverage } from "./coverage.ts";
import { deepHints, type DeepHint } from "./hints.ts";
import { recordNotices, setupNotices, sortNotices, type Notice } from "./notices.ts";
import { observedOf } from "./observed.ts";
import { resultTools, type CollectedTool, type ResultTool } from "./tools.ts";
import { resultUsage, type ResultUsage } from "./usage.ts";

/** 평가 결과 파일의 형식 버전 */
export const RESULT_SCHEMA = 1;

/** 평가 결과의 입력. 입력 묶음(설계 12.1)과, 그것으로 낸 평가와 수집 결과다. 실행 입력은 상태 파일이 깨졌는지뿐이다 */
export interface ResultInput {
  input: EvaluationInput;
  evaluation: Evaluation;
  collected: readonly CollectedTool[];
  appVersion: string;
  run: { stateBroken: boolean };
}

export type ResultToolValue = ToolValue & { observed: Coverage };
export type ResultFinding = Omit<Finding, "tools"> & { tools: ResultToolValue[] };

/** 판정에서 뺀 켜진 서버 가운데 부른 기록이 없는 것(E6 항목의 정보, 설계 13.1) */
export interface UnjudgedServer {
  tool: ToolId;
  name: string;
  scope: McpFact["scope"];
  projectRoot: string | null;
  pluginId: string | null;
  /** no_definition은 정의가 PC에 없거나 읽지 못한 것, plugin_unread는 정의를 읽지 못한 플러그인의 것, not_established는 아직 지켜보는 중인 것, observation_incomplete는 관측이 빠짐없지 않은 것이다 */
  why: "no_definition" | "plugin_unread" | "not_established" | "observation_incomplete";
}

export interface CheckupResult {
  schema: typeof RESULT_SCHEMA;
  rulesVersion: string;
  appVersion: string;
  /** 평가 시계(ISO) */
  evaluatedAt: string;
  timezone: string;
  window: Evaluation["windows"];
  tools: ResultTool[];
  coverage: ResultCoverage[];
  score: Overall;
  axes: AxisScore[];
  findings: ResultFinding[];
  candidates: Candidate[];
  usage: ResultUsage;
  deepHints: DeepHint[];
  notices: Notice[];
  /** 규칙의 근거 가운데 따로 둔 것과 결과 화면이 그리는 이름 목록 */
  details: {
    safeguards: ToolSafeguard[];
    missingInstructions: MissingInstructions[];
    worstOverlap: WorstOverlap | null;
    unjudgedServers: UnjudgedServer[];
  };
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** 이름 목록의 범위 차례(설계 11.5 「차례」) */
const SCOPE_ORDER: readonly McpFact["scope"][] = ["user", "local", "project", "plugin", "claude-ai"];

function unjudgedServers(input: EvaluationInput, evaluation: Evaluation): UnjudgedServer[] {
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const servers: UnjudgedServer[] = [];
  for (const tool of evaluation.tools) {
    const source = input.tools.find((item) => item.tool === tool.tool)!;
    const called = calledMcpNames(source.summaries, windows);
    for (const judged of tool.servers) {
      const { server } = judged;
      if (!server.enabled || judged.verdict !== "unknown" || anyIn(server.recordNames, called.inCollect)) continue;
      const why = judged.excluded ?? (source.complete.mcp ? "not_established" : "observation_incomplete");
      servers.push({ tool: tool.tool, name: server.name, scope: server.scope, projectRoot: server.projectRoot, pluginId: server.pluginId, why });
    }
  }
  return servers.sort((a, b) => byText(a.name, b.name) || SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) || byText(a.projectRoot ?? "", b.projectRoot ?? "") || byText(a.pluginId ?? "", b.pluginId ?? "") || byText(a.tool, b.tool));
}

export function checkupResult(source: ResultInput): CheckupResult {
  const { input, evaluation, collected } = source;
  const coverageByTool = new Map(input.tools.map((tool) => [tool.tool, tool.coverage]));
  const findings = evaluation.findings.map((finding): ResultFinding => ({
    ...finding,
    tools: finding.tools.map((value) => ({ ...value, observed: observedOf(finding.ruleId as ToolRuleId, coverageByTool.get(value.tool)!) })),
  }));
  return {
    schema: RESULT_SCHEMA,
    rulesVersion: evaluation.rulesVersion,
    appVersion: source.appVersion,
    evaluatedAt: new Date(input.clock.nowMs).toISOString(),
    timezone: input.clock.timeZone,
    window: evaluation.windows,
    tools: resultTools(input, evaluation, collected),
    coverage: resultCoverage(input, collected),
    score: evaluation.score,
    axes: evaluation.axes,
    findings,
    candidates: evaluation.candidates,
    usage: resultUsage(input, evaluation, collected),
    deepHints: deepHints(input),
    notices: sortNotices([...recordNotices(input, evaluation, collected), ...setupNotices(input, evaluation, source.run)]),
    details: { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation) },
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 24개, 시험 522개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-assemble.test.ts src/core/result/assemble.ts
git commit -m "feat: 평가 결과 조립 추가"
```

---

### Task 13: 터미널 요약

**Files:**
- Create: `src/core/result/summary.ts`
- Test: `test/core/result-summary.test.ts`

**Interfaces:**
- Consumes: 과제 12의 `CheckupResult`, 과제 9·10의 `Notice`.
- Produces: `CheckupSummary`, `SummaryFix`, `SummaryNotice`, `checkupSummary(result: CheckupResult, reportPath: string | null): CheckupSummary`, `FIX_FIRST_LIMIT`(3). 과제 15가 쓴다.

설계 12.3의 요약이다(「2단계 3부 계획에서 보완」의 18번). 표준 출력으로 AI에게 가므로 스킬, 서버, 프로젝트의 이름과 경로를 넣지 않는다(설계 19.1).

- AQ, 등급, 단계, 보류한 까닭, 기준 점수, 가장 잘하는 것(잘하고 있는 것의 첫 항목), 먼저 고칠 것(정비할 것의 앞 셋)을 싣는다. 별명과 문장은 4부가 단계와 규칙으로 만든다.
- 먼저 고칠 것에는 덧붙이는 말(설계 11.5 「터미널의 요약에 실릴 때」)의 재료를 싣는다. 예상 효과, 규칙을 쟀는지, 후보의 수, 후보가 나왔는데 비율을 못 잰 도구다.
- 알림은 종류, 도구, 정해진 값(지표, 무엇을 읽지 못했는지, 세지 않은 까닭), 대상의 수만 싣는다. 시험이 알림 열세 종류를 모두 넣어 이것을 본다(짝 Codex 2의 계획 리뷰 1차).
- 결과 화면의 경로는 부르는 쪽이 준다. 결과 화면은 3단계에 만들므로 지금은 null이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-summary.test.ts`(새 파일):

```ts
// 터미널에 전할 요약(AQ와 등급, 기준 점수, 가장 잘하는 것, 먼저 고칠 것 셋까지, 이름 없는 알림)을 시험한다. 요약에는 스킬·서버·프로젝트의 이름과 경로가 들어가지 않는다(설계 11.5, 12.3, 15, 19.1)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult, type ResultFinding } from "../../src/core/result/assemble.ts";
import type { Notice } from "../../src/core/result/notices.ts";
import { checkupSummary, FIX_FIRST_LIMIT } from "../../src/core/result/summary.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";

const collected: CollectedTool = {
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: ["/home/u/.claude/projects/secret-app/s.jsonl"], unreadableFileBytes: 10, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
};
const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
function baseResult(): CheckupResult {
  const input = evaluationInput([claudeTool({ sessions: enough, setup: { pluginsWithoutInstall: ["secret-plugin@m"] } })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", run: { stateBroken: false } });
}
const finding = (ruleId: ResultFinding["ruleId"], input: Partial<ResultFinding>): ResultFinding => ({ ruleId, axis: "efficiency", kind: "share", weight: 2, status: "scored", reason: null, value: 0.5, score: 0.5, category: "average", severity: null, gain: null, evidence: {}, tools: [], candidates: [], ...input });

describe("요약", () => {
  it("AQ, 등급, 단계, 보류한 까닭, 기준 점수를 평가 결과 그대로 싣는다", () => {
    const result = baseResult();
    const summary = checkupSummary(result, null);
    expect(Object.keys(summary)).toEqual(["aq", "grade", "tier", "withheld", "axes", "best", "fixFirst", "notices", "reportPath"]);
    expect(summary).toMatchObject({ aq: result.score.aq, grade: result.score.grade, tier: result.score.tier, withheld: result.score.withheld, reportPath: null });
    expect(summary.axes).toEqual(result.axes.map((axis) => ({ axis: axis.axis, score: axis.score })));
  });

  it("가장 잘하는 것은 잘하고 있는 것의 첫 항목이고, 없으면 null이다", () => {
    const result = { ...baseResult(), findings: [finding("E1", { category: "strength", value: 0.95, score: 1 }), finding("S1", { axis: "setup", category: "strength", value: 1, score: 1 })] };
    expect(checkupSummary(result, null).best).toEqual({ ruleId: "E1", axis: "efficiency", kind: "share", value: 0.95 });
    expect(checkupSummary({ ...result, findings: [finding("E2", { category: "repair", gain: 3 })] }, null).best).toBeNull();
  });

  it("먼저 고칠 것은 정비할 것의 앞 셋이고, 덧붙이는 말의 재료(예상 효과, 후보 수, 비율을 못 잰 도구)를 싣는다", () => {
    expect(FIX_FIRST_LIMIT).toBe(3);
    const result = {
      ...baseResult(),
      findings: [
        finding("E3", { category: "repair", gain: 6, severity: "critical" }),
        finding("E5", { category: "repair", status: "unmeasured", reason: "too_little", value: null, score: null, gain: null, severity: "info", candidates: ["A1:claude-code:x"], tools: [{ tool: "claude-code", status: "unmeasured", reason: "too_little", value: null, score: null, evidence: {}, candidates: ["A1:claude-code:x"], observed: "measured" }] }),
        finding("E6", { category: "repair", gain: null, score: 1, value: 0, severity: "info", candidates: ["A3:claude-code:a", "A3:claude-code:b"] }),
        finding("F1", { axis: "fit", category: "repair", gain: 1, severity: "info" }),
        finding("E1", { category: "strength", score: 1 }),
      ],
    };
    expect(checkupSummary(result, null).fixFirst).toEqual([
      { ruleId: "E3", axis: "efficiency", gain: 6, measured: true, candidates: 0, unmeasuredTools: [] },
      { ruleId: "E5", axis: "efficiency", gain: null, measured: false, candidates: 1, unmeasuredTools: ["claude-code"] },
      { ruleId: "E6", axis: "efficiency", gain: null, measured: true, candidates: 2, unmeasuredTools: [] },
    ]);
  });

  it("알림 열세 종류마다 정해진 값과 대상의 수만 싣고, 알림에 든 경로와 이름은 싣지 않는다", () => {
    const notices: Notice[] = [
      { kind: "score_withheld", reasons: ["too_few_days"] },
      { kind: "state_reset" },
      { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl"], dirs: ["/secret/d"] },
      { kind: "observation_incomplete", tool: "claude-code", metric: "mcp", reasons: ["unreadable-files"] },
      { kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] },
      { kind: "setup_unreadable", tool: "claude-code", what: "mcp_json", targets: ["/secret/proj"] },
      { kind: "plugins_uncounted", tool: "claude-code", why: "composition_unknown", plugins: ["secret@m"] },
      { kind: "setup_problems_unscored", tool: "claude-code", problems: [{ kind: "noFrontmatter", path: "/secret/p" }] },
      { kind: "projects_gone", projects: ["/secret/gone", "/secret/gone-too"] },
      { kind: "version_unverified", tool: "claude-code", versions: ["2.1.400"], verified: { from: "2.1.220", to: "2.1.322" } },
      { kind: "weak_human_requests", tool: "claude-code", weak: 3, total: 10 },
      { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
      { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:secret-kind", count: 2 }] },
      { kind: "orphan_subsessions", tool: "claude-code", sessions: 4 },
    ];
    const summary = checkupSummary({ ...baseResult(), notices }, null);
    expect(summary.notices).toEqual([
      { kind: "score_withheld", tool: null, detail: null, count: null },
      { kind: "state_reset", tool: null, detail: null, count: null },
      { kind: "record_unreadable", tool: "claude-code", detail: null, count: 2 },
      { kind: "observation_incomplete", tool: "claude-code", detail: "mcp", count: null },
      { kind: "setup_unreadable", tool: "claude-code", detail: "claude_json", count: null },
      { kind: "setup_unreadable", tool: "claude-code", detail: "mcp_json", count: 1 },
      { kind: "plugins_uncounted", tool: "claude-code", detail: "composition_unknown", count: 1 },
      { kind: "setup_problems_unscored", tool: "claude-code", detail: null, count: 1 },
      { kind: "projects_gone", tool: null, detail: null, count: 2 },
      { kind: "version_unverified", tool: "claude-code", detail: null, count: 1 },
      { kind: "weak_human_requests", tool: "claude-code", detail: null, count: 3 },
      { kind: "overlapping_responses", tool: "claude-code", detail: null, count: 2 },
      { kind: "unclassified", tool: "claude-code", detail: null, count: 3 },
      { kind: "orphan_subsessions", tool: "claude-code", detail: null, count: 4 },
    ]);
    expect(JSON.stringify(summary.notices)).not.toContain("secret");
  });

  it("알림은 종류와 수만 싣고 경로와 이름은 싣지 않는다", () => {
    const summary = checkupSummary(baseResult(), "/report.html");
    expect(summary.notices).toEqual([
      { kind: "record_unreadable", tool: "claude-code", detail: null, count: 1 },
      { kind: "plugins_uncounted", tool: "claude-code", detail: "not_installed", count: 1 },
    ]);
    const text = JSON.stringify(summary);
    expect(text).not.toContain("secret");
    expect(summary.reportPath).toBe("/report.html");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-summary.test.ts`
Expected: FAIL. `src/core/result/summary.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/summary.ts`(새 파일):

```ts
// 평가 결과에서 터미널에 전할 요약을 만든다. 표준 출력으로 AI에게 가므로 스킬·서버·프로젝트의 이름과 경로를 넣지 않는다. 문장은 4부(문구)가 이 재료로 만든다(순수 함수, 설계 11.5, 12.3, 15, 19.1)
import type { ToolId } from "../../adapters/types.ts";
import type { Axis, RuleId, ValueKind } from "../rules.ts";
import type { Withheld } from "../scoreboard.ts";
import type { Grade } from "../score.ts";
import type { CheckupResult } from "./assemble.ts";
import type { Notice } from "./notices.ts";

/** 먼저 고칠 것을 이만큼까지 싣는다 */
export const FIX_FIRST_LIMIT = 3;

export interface SummaryFix {
  ruleId: RuleId;
  axis: Axis;
  /** 예상 효과. 없으면 null이고 덧붙이는 말은 후보의 수로 만든다(설계 11.5 「터미널의 요약에 실릴 때」) */
  gain: number | null;
  /** 규칙을 쟀다. 거짓이면 "비율은 잴 수 없음"이다 */
  measured: boolean;
  /** 정비 후보의 수 */
  candidates: number;
  /** 후보가 나왔는데 비율을 못 잰 도구. 규칙은 다른 도구로 쟀을 때 "{도구}의 비율은 잴 수 없음"이다 */
  unmeasuredTools: ToolId[];
}

/** 이름과 경로를 뺀 알림. detail은 정해진 값(지표, 무엇을 읽지 못했는지, 세지 않은 까닭)이고 count는 대상의 수다 */
export interface SummaryNotice {
  kind: Notice["kind"];
  tool: ToolId | null;
  detail: string | null;
  count: number | null;
}

export interface CheckupSummary {
  aq: number | null;
  grade: Grade | null;
  tier: 1 | 2 | 3 | 4 | 5 | null;
  withheld: Withheld[];
  axes: { axis: Axis; score: number | null }[];
  /** 가장 잘하는 것(잘하고 있는 것의 첫 항목). 없으면 null */
  best: { ruleId: RuleId; axis: Axis; kind: ValueKind; value: number } | null;
  fixFirst: SummaryFix[];
  notices: SummaryNotice[];
  /** 결과 화면의 경로. 결과 화면을 만들지 않았으면 null */
  reportPath: string | null;
}

function summaryNotice(notice: Notice): SummaryNotice {
  const tool = "tool" in notice ? notice.tool : null;
  switch (notice.kind) {
    case "score_withheld":
    case "state_reset":
      return { kind: notice.kind, tool, detail: null, count: null };
    case "record_unreadable":
      return { kind: notice.kind, tool, detail: null, count: notice.files.length + notice.dirs.length };
    case "observation_incomplete":
      return { kind: notice.kind, tool, detail: notice.metric, count: null };
    case "setup_unreadable":
      return { kind: notice.kind, tool, detail: notice.what, count: notice.targets.length > 0 ? notice.targets.length : null };
    case "plugins_uncounted":
      return { kind: notice.kind, tool, detail: notice.why, count: notice.plugins.length };
    case "setup_problems_unscored":
      return { kind: notice.kind, tool, detail: null, count: notice.problems.length };
    case "projects_gone":
      return { kind: notice.kind, tool, detail: null, count: notice.projects.length };
    case "version_unverified":
      return { kind: notice.kind, tool, detail: null, count: notice.versions.length };
    case "weak_human_requests":
      return { kind: notice.kind, tool, detail: null, count: notice.weak };
    case "overlapping_responses":
    case "orphan_subsessions":
      return { kind: notice.kind, tool, detail: null, count: notice.sessions };
    case "unclassified":
      return { kind: notice.kind, tool, detail: null, count: notice.counts.reduce((sum, item) => sum + item.count, 0) };
  }
}

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
    aq: result.score.aq,
    grade: result.score.grade,
    tier: result.score.tier,
    withheld: [...result.score.withheld],
    axes: result.axes.map((axis) => ({ axis: axis.axis, score: axis.score })),
    best: strength === null ? null : { ruleId: strength.ruleId, axis: strength.axis, kind: strength.kind, value: strength.value! },
    fixFirst,
    notices: result.notices.map(summaryNotice),
    reportPath,
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 25개, 시험 527개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/result-summary.test.ts src/core/result/summary.ts
git commit -m "feat: 터미널 요약 추가"
```

---

### Task 14: 이 도구 자신의 정체

**Files:**
- Create: `src/commands/self.ts`
- Test: `test/commands/self.test.ts`

**Interfaces:**
- Consumes: 2부의 `SelfIdentity`(`src/core/installs/candidates.ts`), `normalizePath`.
- Produces: `selfIdentity(entryFile: string): Promise<SelfIdentity>`, `SELF_SKILL_NAMES`(`["aq"]`), `SELF_PLUGIN_NAMES`(`["chunsik-garage"]`). 과제 15가 쓴다.

2부 계획의 「3부에 넘기는 것」의 「이 도구 자신의 정체」다(「2단계 3부 계획에서 보완」의 16번). 2부는 정비 후보에서 이 도구를 빼는 데 실제 경로, 이름 꼴, 플러그인 이름을 본다.

- 스킬 이름은 `aq`, 플러그인 이름은 설계 7.1의 `chunsik-garage`다. 플러그인은 4단계에 만들지만 빼는 쪽이 안전해서 지금부터 넣는다.
- 실행한 파일이 `<스킬 폴더>/scripts/aq.mjs`이면 그 스킬 폴더의 링크를 푼 실제 경로(정규화)를 싣는다. 원본으로 돌릴 때(`src/entry.ts`)나 스킬 폴더를 풀지 못하면 싣지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/self.test.ts`(새 파일):

```ts
// 이 도구 자신의 정체(스킬 이름, 플러그인 이름, 스킬 폴더의 실제 경로)를 실행 파일의 위치에서 얻는 것을 시험한다. 정비 후보에서 이 도구를 빼는 데 쓴다(설계 7.1, 16.2)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { SELF_PLUGIN_NAMES, SELF_SKILL_NAMES, selfIdentity } from "../../src/commands/self.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

describe("이 도구 자신", () => {
  it("스킬 이름은 aq이고 플러그인 이름은 chunsik-garage다", () => {
    expect(SELF_SKILL_NAMES).toEqual(["aq"]);
    expect(SELF_PLUGIN_NAMES).toEqual(["chunsik-garage"]);
  });

  it("실행 파일이 <스킬 폴더>/scripts/aq.mjs이면 그 스킬 폴더의 실제 경로를 싣는다", async () => {
    const entry = join(root, "plugin", "skills", "aq", "scripts", "aq.mjs");
    await put(entry, "// bundle");
    expect(await selfIdentity(entry)).toEqual({ skillNames: ["aq"], pluginNames: ["chunsik-garage"], skillRealPaths: [normalizePath(join(root, "plugin", "skills", "aq"))] });
  });

  it("스킬 폴더가 링크면 링크를 푼 실제 경로다", async () => {
    const real = join(root, "store", "aq");
    await put(join(real, "scripts", "aq.mjs"), "// bundle");
    await linkDir(real, join(root, "skills", "aq"));
    const identity = await selfIdentity(join(root, "skills", "aq", "scripts", "aq.mjs"));
    expect(identity.skillRealPaths).toEqual([normalizePath(real)]);
  });

  it("묶은 실행 파일이 아니면(원본으로 돌릴 때) 스킬 폴더의 경로는 없다", async () => {
    const entry = join(root, "repo", "src", "entry.ts");
    await put(entry, "// source");
    expect((await selfIdentity(entry)).skillRealPaths).toEqual([]);
    expect((await selfIdentity(join(root, "nowhere", "scripts", "aq.mjs"))).skillRealPaths).toEqual([]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/self.test.ts`
Expected: FAIL. `src/commands/self.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/commands/self.ts`(새 파일):

```ts
// 이 도구 자신의 정체를 정한다. 스킬 이름과 플러그인 이름(설계 7.1), 그리고 묶은 실행 파일(<스킬 폴더>/scripts/aq.mjs)의 위치에서 얻은 스킬 폴더의 실제 경로다. 정비 후보에서 이 도구를 빼는 데 쓴다(설계 16.2)
import { realpath } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import type { SelfIdentity } from "../core/installs/candidates.ts";

/** 이 도구의 스킬 이름(스킬 폴더 이름) */
export const SELF_SKILL_NAMES: readonly string[] = ["aq"];
/** 이 도구의 플러그인 이름(.claude-plugin/plugin.json의 name). 플러그인은 4단계에 만들지만, 빼는 쪽이 안전해서 지금부터 넣는다 */
export const SELF_PLUGIN_NAMES: readonly string[] = ["chunsik-garage"];
const BUNDLE_FILE = "aq.mjs";

/** entryFile은 실행한 파일의 경로다. 묶은 실행 파일이 아니거나(원본으로 돌릴 때) 스킬 폴더를 풀지 못하면 스킬 폴더의 경로는 없다 */
export async function selfIdentity(entryFile: string): Promise<SelfIdentity> {
  const skillRealPaths: string[] = [];
  if (basename(entryFile) === BUNDLE_FILE && basename(dirname(entryFile)) === "scripts") {
    try {
      skillRealPaths.push(normalizePath(await realpath(dirname(dirname(entryFile)))));
    } catch {
      // 스킬 폴더가 없으면 이 도구의 스킬 폴더라고 할 것이 없다
    }
  }
  return { skillNames: [...SELF_SKILL_NAMES], pluginNames: [...SELF_PLUGIN_NAMES], skillRealPaths };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/commands`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 5개, 시험 34개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/commands/self.test.ts src/commands/self.ts
git commit -m "feat: 이 도구 자신의 정체 추가"
```

---

### Task 15: 점검 실행과 저장

**Files:**
- Create: `src/commands/checkup.ts`
- Modify: `src/commands/checkup-input.ts`
- Modify: `src/state/state.ts`
- Test: `test/commands/checkup.test.ts`

**Interfaces:**
- Consumes: 과제 1~4의 저장 함수, 과제 12·13의 `checkupResult`, `checkupSummary`, 과제 14의 `selfIdentity`, 2부의 `gatherCheckupInput`과 `evaluate`, 1단계의 `claudeObservation`.
- Produces: `runCheckup(options: CheckupOptions): Promise<CheckupOutcome>`(`{ summary; run: RunRecord; result }`), `RunRecord`(`{ durationMs, cachedFiles, saved, reportPath, resultPath, notices }`), `RunNotice`. `CheckupInput.tools: CollectedTool[]`. 과제 16이 쓴다.

설계 7.4의 `aq checkup`, 12.3의 실행 기록, 20.2의 쓸 수 없는 곳이다(「2단계 3부 계획에서 보완」의 5번, 6번, 8번).

- 상태를 열고(저장하지 않는 실행도 지난 상태는 읽는다), 입력을 모아 평가하고, 평가 결과를 조립한다. 2부의 `gatherCheckupInput`은 관측의 까닭까지 담은 수집 결과(`CollectedTool`)를 더 내도록 고친다.
- 저장하는 실행은 결과 파일, 상태, 이력의 차례로 쓴다. 하나라도 막히면 남은 쓰기를 멈추고 저장 없는 실행으로 바꾸며, 결과 파일을 아직 못 썼으면 OS 임시 폴더에 쓴다. 실패로 끝내지 않는다. 시험이 단계마다(결과 파일, 상태, 이력 자리를 폴더로 막아) 실패를 따로 본다(짝 Codex 2의 계획 리뷰 1차). 그 뒤 오래된 결과(이번 점검의 결과는 남긴다)와 원본이 없어진 캐시를 정리하고, 정리가 실패하거나 링크라서 하지 않았으면 알림만 남긴다. 결과 폴더가 링크인 경우의 알림을 시험이 본다(계획 리뷰 3차에서 더했다. 그 전에는 정리 알림을 보는 시험이 없었다).
- 1부의 `saveState`는 이름 바꾸기가 실패하면 임시 파일(`state.json.<pid>.tmp`)을 상태 폴더 바로 아래에 남겼다. `aq clean --all`도 그 파일을 모른다. 실패하면 지우게 고친다(지우기마저 막히면 남는다).
- 저장하지 않는 실행은 캐시를 읽지도 쓰지도 않고 결과 파일을 OS 임시 폴더에 쓴다. 거기에도 쓰지 못하면 결과 파일 없이 요약만 낸다.
- 1부의 `loadState`는 상태 폴더 자리에 파일이 있을 때(ENOTDIR) 깨진 것으로 봤다. 그 경로에는 상태 파일이 있을 수 없으니 없는 것으로 고친다. 그대로 두면 "상태 파일이 깨져 새로 시작했다"는 틀린 알림이 나온다.
- 실행 기록의 캐시를 쓴 파일 수는 수집 결과의 `fromCache`다. 결과 화면의 경로는 3단계 전에는 null이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup.test.ts`(새 파일):

```ts
// aq checkup의 실행(상태 열기, 입력 모으기, 평가, 결과 조립, 저장 또는 임시 폴더, 실행 기록)을 임시 홈 폴더로 시험한다(설계 7.4, 12.2, 12.3, 18.1, 19.2, 20.1, 20.2)
import { mkdir, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheckup, type CheckupOptions } from "../../src/commands/checkup.ts";
import { resultStamp } from "../../src/state/reports.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");
const STAMP = resultStamp(NOW);

let root: string;
let home: string;
let stateDir: string;
let tmp: string;
let proj: string;

async function session(folder: string, id: string, lines: string[]): Promise<string> {
  const dir = join(home, ".claude", "projects", folder);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  await writeFile(path, `${lines.join("\n")}\n`);
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
  return path;
}
const turn = (id: string, at: string): string[] => [
  user({ at, content: "고쳐 줘", origin: "human", extra: { cwd: proj } }),
  assistant({ id, at, cwd: proj, usage: { input: 10, cacheRead: 80, cacheWrite: 10, output: 5 } }),
];
const options = (overrides: Partial<CheckupOptions> = {}): CheckupOptions => {
  let tick = 1000;
  return {
    env: {},
    homedir: home,
    tmpdir: tmp,
    platform: process.platform,
    clock: { nowMs: NOW, timeZone: "Asia/Seoul" },
    stateDir,
    save: true,
    rescan: false,
    entryFile: join(root, "repo", "src", "entry.ts"),
    managedDir: join(root, "managed"),
    now: () => (tick += 250),
    ...overrides,
  };
};

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  stateDir = join(home, ".chunsik-garage");
  tmp = join(root, "os-tmp");
  proj = join(root, "work", "proj");
  await mkdir(tmp, { recursive: true });
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(home, ".claude", "CLAUDE.md"), "모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다.\n");
  await put(join(home, ".claude", "skills", "secret-skill", "SKILL.md"), "---\nname: secret-skill\ndescription: 시험용\n---\n");
  await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "secret-db": { command: "db-server" } } }));
  await session("p-proj", "s1", turn("a-1", "2026-11-11T01:00:00Z"));
  await session("p-proj", "s2", turn("b-1", "2026-11-10T01:00:00Z"));
});
afterEach(async () => removeTemp(root));

describe("저장하는 점검", () => {
  it("결과 파일, 이력 한 줄, 상태(마지막 점검 시각과 관측 기록), 캐시를 남기고 요약과 실행 기록을 낸다", async () => {
    const outcome = await runCheckup(options());
    const resultPath = join(stateDir, "reports", `${STAMP}.json`);
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: true, reportPath: null, resultPath, notices: [] });
    expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual(outcome.result);
    const history = (await readFile(join(stateDir, "history.jsonl"), "utf8")).trim().split("\n");
    expect(history).toHaveLength(1);
    expect(JSON.parse(history[0]!)).toMatchObject({ at: "2026-11-12T03:00:00.000Z", rulesVersion: "1.0.0" });
    const state = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
    expect(state.lastCheckupAt).toBe("2026-11-12T03:00:00.000Z");
    expect(state.installs.length).toBeGreaterThan(0);
    expect(state.installs.every((record: { appeared: boolean }) => record.appeared === false)).toBe(true);
    expect((await readdir(join(stateDir, "cache", "claude-code"))).length).toBe(2);
    expect(outcome.summary).toMatchObject({ aq: outcome.result.score.aq, reportPath: null });
  });

  it("연달아 두 번 돌리면 이력은 두 줄이고, 두 번째는 캐시를 쓰며 평가 결과는 글자 하나 다르지 않다. 무작위 값과 관측 기록을 이어 쓴다", async () => {
    const first = await runCheckup(options());
    const salt = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8")).salt;
    const second = await runCheckup(options());
    expect(second.run.cachedFiles).toBe(2);
    expect(JSON.stringify(second.result)).toBe(JSON.stringify(first.result));
    expect((await readFile(join(stateDir, "history.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
    const state = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
    expect(state.salt).toBe(salt);
    expect(await readdir(join(stateDir, "reports"))).toEqual([`${STAMP}.json`]);
  });

  it("상태 파일이 깨졌으면 새 상태로 시작해 알리고, 저장할 때 새 상태로 덮어쓴다", async () => {
    await put(join(stateDir, "state.json"), "{broken");
    const outcome = await runCheckup(options());
    expect(outcome.result.notices.map((notice) => notice.kind)).toContain("state_reset");
    const state = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
    expect(state).toMatchObject({ schema: 1, lastCheckupAt: "2026-11-12T03:00:00.000Z" });
  });

  it("결과 폴더에는 최근 20번의 점검만 남고, 원본이 없어진 캐시 항목은 지운다", async () => {
    for (let index = 0; index < 21; index++) await put(join(stateDir, "reports", `${resultStamp(NOW - (index + 1) * 60_000)}.json`), "{}");
    await runCheckup(options());
    const reports = await readdir(join(stateDir, "reports"));
    expect(reports).toHaveLength(20);
    expect(reports).toContain(`${STAMP}.json`);
    await rm(join(home, ".claude", "projects", "p-proj", "s2.jsonl"));
    await runCheckup(options());
    expect((await readdir(join(stateDir, "cache", "claude-code"))).length).toBe(1);
  });

  it("상태 폴더에 쓰지 못하면 남은 저장을 멈추고 결과 파일을 OS 임시 폴더에 쓴다. 실패로 끝나지 않는다", async () => {
    await put(stateDir, "not a folder");
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.resultPath).toBe(join(tmp, `chunsik-garage-result-${STAMP}.json`));
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "result", code: expect.any(String) }]);
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
    // 상태 폴더 자리에 파일이 있으면 상태 파일이 있을 수 없다. 깨진 것이 아니라 없는 것이다
    expect(outcome.result.notices.map((notice) => notice.kind)).not.toContain("state_reset");
  });

  it("상태를 쓰다가 막히면 이력을 쓰지 않고 정리도 하지 않는다. 쓴 결과 파일은 남고 임시 파일은 남지 않는다", async () => {
    await mkdir(join(stateDir, "state.json"), { recursive: true });
    for (let index = 0; index < 21; index++) await put(join(stateDir, "reports", `${resultStamp(NOW - (index + 1) * 60_000)}.json`), "{}");
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "state", code: expect.any(String) }]);
    expect(outcome.run.resultPath).toBe(join(stateDir, "reports", `${STAMP}.json`));
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
    await expect(readFile(join(stateDir, "history.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(join(stateDir, "reports"))).toHaveLength(22);
    expect((await readdir(stateDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("이력을 쓰다가 막히면 결과와 상태는 남고 저장하지 않은 것으로 알린다", async () => {
    await mkdir(join(stateDir, "history.jsonl"), { recursive: true });
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "history", code: expect.any(String) }]);
    expect(JSON.parse(await readFile(join(stateDir, "state.json"), "utf8")).lastCheckupAt).toBe("2026-11-12T03:00:00.000Z");
    expect(outcome.run.resultPath).toBe(join(stateDir, "reports", `${STAMP}.json`));
  });

  it("결과 파일 자리가 막혀 있으면 결과를 OS 임시 폴더에 쓰고 결과 폴더에 임시 파일을 남기지 않는다", async () => {
    await mkdir(join(stateDir, "reports", `${STAMP}.json`), { recursive: true });
    const outcome = await runCheckup(options());
    expect(outcome.run.notices).toEqual([{ kind: "save_failed", step: "result", code: expect.any(String) }]);
    expect(outcome.run.resultPath).toBe(join(tmp, `chunsik-garage-result-${STAMP}.json`));
    expect(await readdir(join(stateDir, "reports"))).toEqual([`${STAMP}.json`]);
  });

  it("결과 폴더에 이번 점검보다 뒤 시각의 결과가 20번 있어도(시계가 뒤로 갔다) 방금 쓴 결과는 남는다", async () => {
    for (let index = 0; index < 20; index++) await put(join(stateDir, "reports", `${resultStamp(NOW + (index + 1) * 60_000)}.json`), "{}");
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(true);
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
    expect(await readdir(join(stateDir, "reports"))).toHaveLength(20);
  });

  it("결과 폴더가 링크면 정리하지 않고 링크라서 하지 않은 정리로 알린다. 저장은 끝난다", async () => {
    const elsewhere = join(root, "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await linkDir(elsewhere, join(stateDir, "reports"));
    for (let index = 0; index < 21; index++) await put(join(elsewhere, `${resultStamp(NOW - (index + 1) * 60_000)}.json`), "{}");
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(true);
    expect(outcome.run.notices).toEqual([{ kind: "prune_skipped", what: "reports", link: "reports" }]);
    expect(await readdir(elsewhere)).toHaveLength(22);
  });
});

describe("저장하지 않는 점검", () => {
  it("상태 폴더에 아무것도 쓰지 않고 캐시도 쓰지 않는다. 결과 파일은 OS 임시 폴더에 쓴다", async () => {
    const outcome = await runCheckup(options({ save: false }));
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: false, reportPath: null, resultPath: join(tmp, `chunsik-garage-result-${STAMP}.json`), notices: [{ kind: "not_saved" }] });
    await expect(readdir(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
  });

  it("지난 상태 파일은 읽어 관측 기록과 무작위 값을 쓰지만 고치지 않는다", async () => {
    await runCheckup(options());
    const before = await readFile(join(stateDir, "state.json"), "utf8");
    const outcome = await runCheckup(options({ save: false, clock: { nowMs: NOW + 86_400_000, timeZone: "Asia/Seoul" } }));
    expect(await readFile(join(stateDir, "state.json"), "utf8")).toBe(before);
    expect(outcome.result.notices.map((notice) => notice.kind)).not.toContain("state_reset");
  });

  it("임시 폴더에도 쓰지 못하면 결과 파일 없이 요약만 내고 알린다", async () => {
    const outcome = await runCheckup(options({ save: false, tmpdir: join(root, "missing", "tmp") }));
    expect(outcome.run.resultPath).toBeNull();
    expect(outcome.run.notices).toEqual([{ kind: "not_saved" }, { kind: "result_unwritten", code: expect.any(String) }]);
  });
});

describe("요약과 실행 기록", () => {
  it("요약과 실행 기록에는 스킬·서버·프로젝트의 이름이 들어가지 않는다", async () => {
    const outcome = await runCheckup(options());
    const printed = JSON.stringify({ summary: outcome.summary, run: { ...outcome.run, resultPath: null } });
    expect(printed).not.toContain("secret");
    expect(printed).not.toContain("proj");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/checkup.test.ts`
Expected: FAIL. `src/commands/checkup.ts`를 찾지 못해 시험 파일이 실패한다.

- [ ] **Step 3: 구현한다**

`src/commands/checkup-input.ts`(찾을 곳 1/5):

```ts
import type { SelfIdentity } from "../core/installs/candidates.ts";
import { scanClaudeSetup } from "../scan/claude.ts";
```

`src/commands/checkup-input.ts`(바꾼 뒤 1/5):

```ts
import type { SelfIdentity } from "../core/installs/candidates.ts";
import type { CollectedTool } from "../core/result/tools.ts";
import { scanClaudeSetup } from "../scan/claude.ts";
```

`src/commands/checkup-input.ts`(찾을 곳 2/5):

```ts
  facts: ClaudeSetupFacts;
}
```

`src/commands/checkup-input.ts`(바꾼 뒤 2/5):

```ts
  facts: ClaudeSetupFacts;
  /** 평가 결과에 싣는 수집 결과(도구마다). 캐시를 쓴 파일 수처럼 실행마다 다른 것은 뺐다 */
  tools: CollectedTool[];
}
```

`src/commands/checkup-input.ts`(찾을 곳 3/5):

```ts
  const unreadable = unreadableCount(collected.read);
  const input: EvaluationInput = {
```

`src/commands/checkup-input.ts`(바꾼 뒤 3/5):

```ts
  const unreadable = unreadableCount(collected.read);
  const observation = { skills: claudeObservation(summaries, unreadable, "skill"), mcp: claudeObservation(summaries, unreadable, "mcp") };
  const input: EvaluationInput = {
```

`src/commands/checkup-input.ts`(찾을 곳 4/5):

```ts
        shellTools: [...SHELL_TOOLS].sort(),
        complete: { skills: claudeObservation(summaries, unreadable, "skill").complete, mcp: claudeObservation(summaries, unreadable, "mcp").complete },
        setup: facts,
```

`src/commands/checkup-input.ts`(바꾼 뒤 4/5):

```ts
        shellTools: [...SHELL_TOOLS].sort(),
        complete: { skills: observation.skills.complete, mcp: observation.mcp.complete },
        setup: facts,
```

`src/commands/checkup-input.ts`(찾을 곳 5/5):

```ts
  };
  return { input, collected, facts };
}
```

`src/commands/checkup-input.ts`(바꾼 뒤 5/5):

```ts
  };
  const { fromCache: _fromCache, ...read } = collected.read;
  const tools: CollectedTool[] = [{ tool: "claude-code", detected: collected.detected, visibleFrom: collected.visibleFrom, overlappingSessions: collected.overlappingSessions, read, observation }];
  return { input, collected, facts, tools };
}
```

`src/commands/checkup.ts`(새 파일):

```ts
// aq checkup을 돌린다. 상태를 열고, 입력 묶음을 모아 평가하고, 평가 결과를 결과 폴더(저장하지 않는 실행이면 OS 임시 폴더)에 쓰고, 상태와 이력을 고치고, 오래된 결과와 원본이 없어진 캐시를 정리한다. 상태 폴더에 쓰다가 막히면 남은 저장을 멈추고 저장 없는 실행으로 바꾼다(설계 7.4, 12.2, 12.3, 18.1, 19.2, 20.1, 20.2)
import { join } from "node:path";
import type { EvalClock } from "../collect/claude.ts";
import { evaluate } from "../core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../core/result/assemble.ts";
import { checkupSummary, type CheckupSummary } from "../core/result/summary.ts";
import { pruneCache } from "../state/cache.ts";
import { appendHistory, historyEntry } from "../state/history.ts";
import { nextState, openState } from "../state/next-state.ts";
import { KEEP_REPORTS, pruneReports, resultStamp, writeResult, writeTempResult } from "../state/reports.ts";
import { saveState } from "../state/state.ts";
import { PROGRAM_VERSION } from "../version.ts";
import { gatherCheckupInput } from "./checkup-input.ts";
import { selfIdentity } from "./self.ts";

export interface CheckupOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 평가 시계. 점검을 시작한 시각과 시간대 */
  clock: EvalClock;
  stateDir: string;
  /** 상태 폴더에 캐시, 결과, 이력, 상태를 쓴다. --no-save면 거짓이다 */
  save: boolean;
  /** 캐시를 믿지 않고 모두 다시 읽는다 */
  rescan: boolean;
  /** 실행한 파일의 경로. 이 도구 자신을 알아보는 데 쓴다 */
  entryFile: string;
  /** 관리 정책 파일의 폴더. 주지 않으면 OS의 자리다 */
  managedDir?: string;
  /** 걸린 시간을 재는 시계(밀리초). 주지 않으면 Date.now다 */
  now?: () => number;
}

/** 실행 기록의 알림. 평가 결과가 아니라 이번 실행에서 생긴 것이다 */
export type RunNotice =
  /** 상태 폴더에 쓰다가 막혀 그 뒤의 저장을 멈추고 저장 없는 실행으로 바꿨다 */
  | { kind: "save_failed"; step: "result" | "state" | "history"; code: string }
  /** 오래된 결과나 원본이 없어진 캐시를 정리하지 못했다. 저장은 끝났다 */
  | { kind: "prune_failed"; what: "reports" | "cache"; code: string }
  /** 상태 폴더나 그 안의 폴더가 링크라서 정리하지 않았다 */
  | { kind: "prune_skipped"; what: "reports" | "cache"; link: "state" | "reports" | "cache" }
  /** 저장하지 않는 실행이다. 이력 비교와 캐시가 없다 */
  | { kind: "not_saved" }
  /** OS 임시 폴더에도 평가 결과 파일을 쓰지 못했다 */
  | { kind: "result_unwritten"; code: string };

export interface RunRecord {
  durationMs: number;
  /** 캐시를 쓴 기록 파일의 수 */
  cachedFiles: number;
  /** 결과, 상태, 이력을 모두 상태 폴더에 썼다 */
  saved: boolean;
  /** 결과 화면의 경로. 결과 화면은 3단계에 만든다 */
  reportPath: string | null;
  /** 평가 결과 파일의 경로. 쓰지 못했으면 null */
  resultPath: string | null;
  notices: RunNotice[];
}

export interface CheckupOutcome {
  summary: CheckupSummary;
  run: RunRecord;
  result: CheckupResult;
}

const codeOf = (error: unknown): string => (error as NodeJS.ErrnoException | null)?.code ?? "unknown";

export async function runCheckup(options: CheckupOptions): Promise<CheckupOutcome> {
  const now = options.now ?? Date.now;
  const started = now();
  // 저장하지 않는 실행도 지난 상태는 읽는다. 무작위 값과 관측 기록이 판정에 든다
  const opened = await openState(options.stateDir);
  const gathered = await gatherCheckupInput({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    clock: options.clock,
    cacheDir: options.save ? join(options.stateDir, "cache") : null,
    rescan: options.rescan,
    state: opened.state,
    self: await selfIdentity(options.entryFile),
    ...(options.managedDir === undefined ? {} : { managedDir: options.managedDir }),
  });
  const evaluation = evaluate(gathered.input);
  const result = checkupResult({ input: gathered.input, evaluation, collected: gathered.tools, appVersion: PROGRAM_VERSION, run: { stateBroken: opened.broken } });
  const stamp = resultStamp(options.clock.nowMs);

  const notices: RunNotice[] = [];
  let saved = false;
  let resultPath: string | null = null;
  if (options.save) {
    let step: "result" | "state" | "history" = "result";
    try {
      resultPath = await writeResult(options.stateDir, stamp, result);
      step = "state";
      await saveState(options.stateDir, nextState(opened.state, gathered.facts, evaluation.windows.today, new Date(options.clock.nowMs).toISOString()));
      step = "history";
      await appendHistory(options.stateDir, historyEntry(evaluation, options.clock.nowMs));
      saved = true;
    } catch (error) {
      notices.push({ kind: "save_failed", step, code: codeOf(error) });
    }
    if (saved) {
      // 이번 점검의 결과는 시계가 뒤로 가 있어도 남긴다
      for (const [what, prune] of [["reports", () => pruneReports(options.stateDir, KEEP_REPORTS, stamp)], ["cache", () => pruneCache(options.stateDir)]] as const) {
        try {
          const report = await prune();
          if (report.skipped !== null) notices.push({ kind: "prune_skipped", what, link: report.skipped });
        } catch (error) {
          notices.push({ kind: "prune_failed", what, code: codeOf(error) });
        }
      }
    }
  } else {
    notices.push({ kind: "not_saved" });
  }
  if (resultPath === null) {
    try {
      resultPath = await writeTempResult(options.tmpdir, stamp, result);
    } catch (error) {
      notices.push({ kind: "result_unwritten", code: codeOf(error) });
    }
  }

  const run: RunRecord = { durationMs: now() - started, cachedFiles: gathered.collected.read.fromCache, saved, reportPath: null, resultPath, notices };
  return { summary: checkupSummary(result, null), run, result };
}
```

`src/state/state.ts`(찾을 곳 1/3):

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
```

`src/state/state.ts`(바꾼 뒤 1/3):

```ts
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
```

`src/state/state.ts`(찾을 곳 2/3):

```ts
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
```

`src/state/state.ts`(바꾼 뒤 2/3):

```ts
    // 상태 폴더 자리에 파일이 있으면(ENOTDIR) 그 안에 상태 파일이 있을 수 없다. 깨진 것이 아니라 없는 것이다
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "missing" };
```

`src/state/state.ts`(찾을 곳 3/3):

```ts
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, target);
```

`src/state/state.ts`(바꾼 뒤 3/3):

```ts
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
    await rename(temporary, target);
  } catch (error) {
    // 쓰다 막히면 임시 파일을 남기지 않는다. 상태 폴더 바로 아래의 임시 파일은 aq clean이 모른다
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/commands test/state`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 13개, 시험 112개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/commands/checkup.test.ts src/commands/checkup-input.ts src/commands/checkup.ts src/state/state.ts
git commit -m "feat: 점검 실행과 저장 추가"
```

---

### Task 16: aq checkup 명령 입구, 결정성, 묶은 실행 파일

**Files:**
- Modify: `skills/aq/scripts/aq.mjs`
- Modify: `src/cli.ts`
- Test: `test/commands/checkup-cli.test.ts`
- Test: `test/core/result-determinism.test.ts`

**Interfaces:**
- Consumes: 과제 15의 `runCheckup`, 1부의 명령 입구(`src/cli.ts`).
- Produces: `aq checkup [--no-open] [--no-save] [--rescan]`. `CliContext`에 `tmpdir`, `platform`, `clock`, `entryFile`, `managedDir`(주지 않으면 실제 값)를 더한다.

설계 7.4와 12.3이다. 표준 출력에는 요약과 실행 기록만 JSON으로 낸다. 평가 결과 전체(이름 목록이 든 것)는 파일로만 둔다(설계 19.1). 정상이면 0이다.

- `--no-open`은 결과 화면(3단계)을 열지 않는 것이라 지금은 할 일이 없지만 받는다. `--lang`은 4부가 문구와 함께 받는다. 그 밖의 인자는 모르는 명령으로 64를 돌려주고 아무것도 쓰지 않는다.
- 결정성 시험은 같은 입력 묶음을 연달아 두 번 만들어도, 세션 요약·셋팅 사실·읽지 못한 파일의 차례를 뒤집어도 평가 결과가 글자 하나 다르지 않은지 본다. 이 시험은 앞 과제의 구현이 이미 만족해 구현 전에도 통과한다. 정렬을 하나씩 빼는 변이 다섯 가운데 넷을 잡았다. E6 정보의 이름 정렬을 뺀 변이는 2부의 서버 판정 목록이 이미 같은 차례라서 지금의 입력으로는 갈리지 않는다(도구가 둘일 때 의미가 있다).
- 명령 입구가 점검을 부르게 되어 묶은 실행 파일에 결과 조립과 저장이 들어간다. 다시 묶어 커밋한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup-cli.test.ts`(새 파일):

```ts
// 명령 입구의 aq checkup을 시험한다. 받는 옵션, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 20.1)
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main, type CliContext } from "../../src/cli.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let context: CliContext;
let printed: string;
beforeEach(async () => {
  root = await makeTemp();
  await put(join(root, "home", ".claude", "CLAUDE.md"), "시험을 먼저 돌린다.\n");
  await put(join(root, "tmp", ".keep"), "");
  context = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed") };
  printed = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    printed += String(chunk);
    return true;
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

describe("aq checkup", () => {
  it("요약과 실행 기록만 JSON으로 내고 0을 돌려준다. 평가 결과는 결과 폴더에 쓴다", async () => {
    expect(await main(["checkup", "--no-open"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(Object.keys(output)).toEqual(["summary", "run"]);
    expect(output.run).toMatchObject({ saved: true, reportPath: null, notices: [] });
    expect(await readdir(join(root, "home", ".chunsik-garage", "reports"))).toEqual([output.run.resultPath.split(/[\\/]/).pop()]);
  });

  it("--no-save는 상태 폴더에 쓰지 않고 OS 임시 폴더에 결과를 쓴다. --rescan도 받는다", async () => {
    expect(await main(["checkup", "--no-save", "--rescan", "--no-open"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(output.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }] });
    expect(output.run.resultPath.startsWith(join(root, "tmp"))).toBe(true);
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("모르는 옵션은 64를 돌려주고 아무것도 쓰지 않는다", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["checkup", "--lang", "ko"], context)).toBe(64);
    expect(await main(["checkup", "--bogus"], context)).toBe(64);
    expect(printed).toBe("");
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
```

`test/core/result-determinism.test.ts`(새 파일):

```ts
// 평가 결과의 결정성을 시험한다. 같은 입력 묶음이면 연달아 두 번 만들어도, 세션 요약·셋팅 사실·읽지 못한 파일의 차례를 섞어도 글자 하나 다르지 않다(설계 2, 12.2, 21.1 「결정성」)
import { describe, expect, it } from "vitest";
import { evaluate, type EvaluationInput } from "../../src/core/evaluate.ts";
import { checkupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { HOME, instructions, mcpServer, plugin, project, skill } from "../helpers/facts.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

const sessions: SummaryInput[] = [
  { sessionId: "m1", version: "2.1.400", days: { "2026-11-10": { responses: 3, humanRequests: 10, weakHumanRequests: 3, unknownDenialKinds: { odd: 1 } } } },
  { sessionId: "m2", days: { "2026-11-11": { responses: 2, humanRequests: 10, tools: { Bash: { calls: 2, results: 2, errors: 1 } } } } },
  { sessionId: "m3", days: { "2026-11-12": { responses: 2, humanRequests: 10, mcpCalls: { used: 1 } } } },
  { sessionId: "s1", kind: "sub", parentSessionId: null, days: { "2026-11-12": { responses: 1 } } },
];
const setup = {
  claudeJson: "ok" as const,
  skills: [skill("beta"), skill("alpha"), skill("locked", { readable: false })],
  mcpServers: [mcpServer("zeta", { definitionHash: null }), mcpServer("alpha"), mcpServer("used")],
  plugins: [plugin("b@m", { compositionKnown: false }), plugin("a@m", { compositionKnown: false })],
  projects: [project("/work/b", { exists: false }), project("/work/a", { mcpJsonStatus: "unparsable", instructions: instructions({ lineHashes: ["x1", "x2", "x3"] }) }), project("/work/c", { instructions: instructions({ lineHashes: ["x1", "x2", "x3"] }) })],
  unreadableDirs: [`${HOME}/skills/zz`, `${HOME}/skills/aa`],
  globalMentions: { "/work/c": 4, "/work/a": 3 },
};
const collected = (files: string[]): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 1,
  read: { files: 9, listedBytes: 900, bytes: 800, inProgress: 0, olderThanWindow: 2, unreadableFiles: files, unreadableFileBytes: 100, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: false, reasons: ["unreadable-files"] }, mcp: { complete: false, reasons: ["unreadable-files"] } },
});
const resultText = (input: EvaluationInput, files: string[]): string => JSON.stringify(checkupResult({ input, evaluation: evaluate(input), collected: [collected(files)], appVersion: "0.1.0", run: { stateBroken: true } }));

describe("평가 결과의 결정성", () => {
  it("연달아 두 번 만들어도 글자 하나 다르지 않다", () => {
    const input = evaluationInput([claudeTool({ sessions, setup })]);
    expect(resultText(input, ["/x/b.jsonl", "/x/a.jsonl"])).toBe(resultText(input, ["/x/b.jsonl", "/x/a.jsonl"]));
  });

  it("세션 요약, 셋팅 사실, 읽지 못한 파일의 차례를 뒤집어도 글자 하나 다르지 않다", () => {
    const forward = evaluationInput([claudeTool({ sessions, setup })]);
    const backward = evaluationInput([
      claudeTool({
        sessions: [...sessions].reverse(),
        setup: { ...setup, skills: [...setup.skills].reverse(), mcpServers: [...setup.mcpServers].reverse(), plugins: [...setup.plugins].reverse(), projects: [...setup.projects].reverse(), unreadableDirs: [...setup.unreadableDirs].reverse() },
      }),
    ]);
    expect(resultText(backward, ["/x/a.jsonl", "/x/b.jsonl"])).toBe(resultText(forward, ["/x/b.jsonl", "/x/a.jsonl"]));
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/checkup-cli.test.ts test/core/result-determinism.test.ts`
Expected: FAIL. 명령 입구 시험 둘이 실패한다(`checkup`을 모르는 명령으로 보고 64를 돌려준다). 모르는 옵션 시험과 결정성 시험 둘은 앞 과제의 구현이 이미 만족해 통과한다(회귀를 막는 시험이다).

- [ ] **Step 3: 구현한다**

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

`src/cli.ts`(찾을 곳 1/3):

```ts
// aq 명령의 입구. Node.js 버전을 확인하고 하위 명령으로 나눠 보낸다. 예상하지 못한 오류는 이유를 담은 JSON과 종료 코드 1로 낸다(설계 20.1)
import { homedir } from "node:os";
import { clean } from "./commands/clean.ts";
```

`src/cli.ts`(바꾼 뒤 1/3):

```ts
// aq 명령의 입구. Node.js 버전을 확인하고 하위 명령으로 나눠 보낸다. 예상하지 못한 오류는 이유를 담은 JSON과 종료 코드 1로 낸다(설계 20.1)
import { homedir, tmpdir } from "node:os";
import type { EvalClock } from "./collect/claude.ts";
import { runCheckup } from "./commands/checkup.ts";
import { clean } from "./commands/clean.ts";
```

`src/cli.ts`(찾을 곳 2/3):

```ts
  homedir: string;
}

const printJson = (value: unknown): void => {
```

`src/cli.ts`(바꾼 뒤 2/3):

```ts
  homedir: string;
  /** 아래는 주지 않으면 실제 값이다. 시험이 고정한다 */
  tmpdir?: string;
  platform?: NodeJS.Platform;
  /** 평가 시계. 주지 않으면 지금 시각과 이 PC의 시간대다 */
  clock?: EvalClock;
  /** 실행한 파일. 주지 않으면 process.argv[1]이다 */
  entryFile?: string;
  managedDir?: string;
}

/** aq checkup이 받는 옵션. --no-open은 결과 화면(3단계)을 열지 않는 것이라 지금은 할 일이 없다. --lang은 문구(4부)와 함께 받는다 */
const CHECKUP_FLAGS: ReadonlySet<string> = new Set(["--no-open", "--no-save", "--rescan"]);

const printJson = (value: unknown): void => {
```

`src/cli.ts`(찾을 곳 3/3):

```ts
  }
  return null;
```

`src/cli.ts`(바꾼 뒤 3/3):

```ts
  }
  if (command === "checkup" && rest.every((flag) => CHECKUP_FLAGS.has(flag))) {
    const outcome = await runCheckup({
      env: context.env,
      homedir: context.homedir,
      tmpdir: context.tmpdir ?? tmpdir(),
      platform: context.platform ?? process.platform,
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      stateDir: stateDir(context.homedir),
      save: !rest.includes("--no-save"),
      rescan: rest.includes("--rescan"),
      entryFile: context.entryFile ?? process.argv[1] ?? "",
      ...(context.managedDir === undefined ? {} : { managedDir: context.managedDir }),
    });
    // 평가 결과 전체(이름 목록이 든 것)는 파일로만 두고 표준 출력에는 요약과 실행 기록만 낸다(설계 12.3, 19.1)
    printJson({ summary: outcome.summary, run: outcome.run });
    return 0;
  }
  return null;
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/commands test/core test/cli.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 34개, 시험 583개.

- [ ] **Step 5: 묶은 실행 파일을 다시 만들고 묶음 검사를 돌린다**

Run: `npm run build && node scripts/check-bundle.mjs`
Expected: `묶음 완료: skills/aq/scripts/aq.mjs`와 `묶음 검사 통과`. 묶은 파일에 네트워크를 부르는 곳이 없다. 이 단계의 묶은 파일은 아래 커밋에 함께 넣는다.

- [ ] **Step 6: 커밋한다**

```bash
git add test/commands/checkup-cli.test.ts test/core/result-determinism.test.ts skills/aq/scripts/aq.mjs src/cli.ts
git commit -m "feat: aq checkup 명령 입구 추가"
```

---

### Task 17: 전체 검사, 이 PC의 기록으로 돌려 보기, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~16의 결과물 전부.
- Produces: `develop`에 병합된 2단계 3부. 4부 계획이 기대는 것은 `CheckupResult`, `CheckupSummary`, `Notice`, `DeepHint`, `runCheckup`과 명령 입구다.

- [ ] **Step 1: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 파일 68개·시험 1,001개 통과(2단계 2부까지의 50개·882개에 이 계획이 더한 것), 마지막 줄이 `묶음 검사 통과`. Windows 밖에서는 1부의 시험 1개를 건너뛴다.

- [ ] **Step 2: 묶음을 다시 만들어도 그대로인지 확인한다**

과제 16에서 묶어 커밋한 실행 파일이 원본과 맞는지 본다.

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 3: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS. 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 4: 이 PC의 기록으로 저장 없이 돌려 본다**

묶은 실행 파일로 이 PC의 실제 기록과 셋팅을 점검한다. 상태 폴더에는 쓰지 않는다.

Run: `node skills/aq/scripts/aq.mjs checkup --no-save --no-open`
Expected: 종료 코드 0. 표준 출력의 JSON에 `summary`와 `run` 둘만 있고, `run.saved`가 거짓이고 `run.notices`가 `not_saved` 하나이고, `run.resultPath`의 파일이 OS 임시 폴더에 있다. 그 파일의 최상위 필드가 과제 12의 차례이고 규칙이 스물둘, 달력이 서른다섯 칸이다. 표준 출력에 이 PC의 스킬·서버·프로젝트 이름이 없다(결과 파일의 경로에는 계정의 폴더 이름이 든다. 경로를 알려 주는 것은 설계 12.3이 정한 것이다). 숫자와 이름은 저장소 밖 작업 기록에만 적고, 결과 파일은 확인한 뒤 지운다.

- [ ] **Step 5: 원장을 고치고 커밋한다**

원장의 2단계 3부 구현 과제를 끝남으로 적고 커밋 해시와 확인한 것을 세부에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 2단계 3부 구현 결과를 적음"
```

- [ ] **Step 6: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage2-3.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~16의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 이 PC의 기록으로 돌린 점검의 모양, 결정성 시험이 실제로 잡는지 본 것), 「확인하지 못한 것」이다. 확인하지 못한 것에는 아래를 적는다. macOS와 Linux의 실제 기기에서 돌려 보지 않았다. 도구가 하나라서 도구를 넘는 이름의 차례와 도구 둘의 사용 기록은 시험으로 가르지 못했다. 결과 파일을 결과 화면이 그려 보는 것은 3단계에서 한다. 문장과 단위는 4부가 더한다. 정리 진입 시험은 고른 직후의 한 때에만 끼어든다. 실제 권한 오류는 만들지 않았다. 이 PC의 숫자, 경로, 이름은 넣지 않는다.

```bash
git push -u origin 2단계-3-점검결과
gh pr create --base develop --head 2단계-3-점검결과 --title "feat: 2단계 3부 점검 결과의 조립과 저장" --body-file "$TEMP/aq-pr-stage2-3.md"
```

- [ ] **Step 7: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(2단계 3부 구현 전용, 검증량이 많으므로 둘) 다음을 나눠 맡긴다. 한 짝은 코드 정독이다. 설계 7.4, 9.7, 9.8, 12.2, 12.3, 13.1, 17, 18.1, 19.1, 19.2, 20.1, 20.2와 「2단계 3부 계획에서 보완」을 이 계획의 코드와 대조하고, 알림마다 조건의 경계와 반례를 따로 지어 본다. 다른 짝은 실행이다. `npm run check`를 다시 돌리고, 이 PC의 기록을 **구조만**(종류, 열쇠 이름, 개수) 따로 세어 이 PC에서 돌린 점검의 결과 파일과 대조한다. 대조할 것은 도구 목록의 숫자(주 세션 수, 하위 세션 수, 사람 요청 수, 응답 수, 볼 수 있는 날짜 범위의 시작), 읽은 양(목록의 파일 수, 읽지 못한 것, 깨진 줄), 사용 기록(사용한 날, 출력 토큰, 달력의 날마다 응답 수), 알림(확인한 범위 밖 버전, 없는 프로젝트)이다. 그리고 임시 홈 폴더에서 저장하는 점검을 연달아 돌려 결과 폴더·이력·상태·캐시가 설계대로 바뀌는지, 상태 폴더에 쓰지 못하는 경우와 저장하지 않는 실행을 직접 재현한다. 두 짝에게 서로의 결론을 미리 알려 주지 않는다. 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 2단계-3-점검결과 --body-file "$TEMP/aq-pr-stage2-3.md"`).

- [ ] **Step 8: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 사용자가 병합을 주 세션에 맡겼지만, 그것은 묻지 않고 병합할 권한이지 검증을 미룰 근거가 아니어서 Step 7 뒤에 둔다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 2단계-3-점검결과 --merge --subject "feat: 2단계 3부 점검 결과의 조립과 저장을 develop에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 4부에 넘기는 것

3부가 만들지 않고 4부 계획이 다룰 것이다.

| 무엇 | 3부가 남긴 재료 |
|---|---|
| 규칙 스물둘의 문장(제목, 설명, 처방, 어떻게 쟀나)을 영어와 한국어로. 잘하고 있을 때와 정비할 때, 못 잰 때의 문장이 다르다(설계 11.5) | `CheckupResult.findings`의 상태, 이유, 분류, 잰 값, 근거 숫자, 도구별 값과 관측 범위, 후보 |
| 잰 값의 단위(설계 12.2) | `kind`(몫, 횟수, 개수, 양)와 규칙 ID |
| 못 잰 이유의 낱말(일곱), E5와 E6의 `too_little`·`watching` 설명과 다른 도구로 잰 경우의 덧붙임(설계 11.5) | 도구별 값의 이유와 후보, E5·E6의 근거 숫자(판정할 수 있는 대상의 수) |
| E4에서 표본으로 쓰지 않은 세션을 "지침 크기가 기록에 남지 않은 세션"이라 부르고, `no_data`에서 지침이 없다고 단정하지 않는 문구(「2단계 3부 계획 전 확인」의 2번) | E4의 근거 숫자(`sampledSessions`, `skippedSessions`) |
| 알림 열셋의 문장 | `Notice`의 종류와 싣는 것 |
| 진단 한 줄(등급마다), 등급의 별명(설계 11.6), 빈 목록의 두 문장, 덧붙이는 말("{기준} 최대 +{N}", "정리할 것 {N}개 · 비율은 잴 수 없음", "정리할 것 {N}개 · {도구}의 비율은 잴 수 없음") | `CheckupSummary`의 단계와 먼저 고칠 것의 재료 |
| E6 항목의 정보 문장과 claude.ai에 연결한 서버를 직접 막는 방법(설계 13.1) | `details.unjudgedServers`의 까닭 |
| `--lang`과 언어의 차례(설계 13.2) | 명령 입구가 모르는 옵션으로 거절하고 있다 |
| 터미널에 전하는 말투와 글자 얼굴(설계 15)은 스킬(4단계)이 정한다 | 요약 |

그 뒤의 단계에서 다시 정할 것은 이렇다. 결과 화면(3단계)에서 E6의 "며칠 뒤부터 판정하는지"(2부 판정이 까닭을 더 자세히 내야 한다)와 결과 파일의 이름 목록을 실제로 그려 보는 것. Codex(5단계)에서 두 도구의 전역 지침을 견주는 단서, 건너뛴 사본·정체 모름 세션 같은 Codex의 알림, 실린 이름의 관측 범위. 정비(6단계) 전에 같은 설치가 사실 둘로 남는 것을 스캐너에서 합칠지. 세션 시작 알림(7단계) 전에 알림용 이름 목록.

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 7.2 | core는 순수하다. 평가 결과의 조립도 core 안에 둔다 | 5~13(지키는 검사는 2부 과제 20의 것) |
| 7.4 | `aq checkup [--no-open] [--no-save] [--rescan]`(`--lang`은 4부) | 15, 16 |
| 9.7, 12.2 | 도구별 값의 관측 범위 | 8, 12 |
| 9.8 | 읽은 양, 읽지 못한 비율과 아래 경계, 지표마다의 관측, 볼 수 있는 날짜 범위 | 5, 6 |
| 12.2 | 평가 결과의 필드(문장과 단위 빼고), 값이 없는 자리는 null, 차례 | 5~12 |
| 12.3 | 실행 기록과 요약, 표준 출력에는 요약과 실행 기록만, 저장하지 않는 실행의 결과 파일 | 13, 15, 16 |
| 13.1 | 달력의 세 상태, E6 항목의 정보 | 7, 12 |
| 17 | 정밀 점검 단서(Claude Code 하나로 셀 수 있는 셋) | 11 |
| 18.1 | 점수 이력의 한 줄, 관측 기록의 저장(읽지 못한 곳의 기록은 남긴다) | 2, 4, 15 |
| 19.1 | 이름과 경로는 결과 파일에만 | 12, 13, 16 |
| 19.2 | 결과 폴더는 최근 20번(이번 점검의 결과는 늘 남긴다), 원본이 없어진 캐시의 정리(읽지 못한 항목은 남긴다), 점검 때의 지우기는 보통 파일만, 지우기 전의 경계와 위 폴더의 자리 확인 | 1, 3, 15 |
| 20.1 | 알림, 확인한 범위 밖 버전, 상태 파일이 깨졌을 때 | 4, 9, 10 |
| 20.2 | 상태 폴더에 쓰다가 막히면(결과 파일, 상태, 이력의 단계마다) 저장 없는 실행으로, 쓰다 남은 임시 파일은 지운다, 임시 폴더에도 못 쓰면 요약만 | 1, 15 |
| 21.1 | 결정성(연달아 두 번, 차례를 섞은 경우, 캐시를 켜고 끈 경우) | 15, 16 |

3부에 넣지 않은 것은 「4부에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드는 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`f743e14`)에서 과제 1부터 16까지 차례대로 만들었다(Windows 11, Node.js 24). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제마다 시험만 놓고 돌리면 실패하고(실패의 까닭과 개수는 시험 커밋마다 따로 세어 과제의 Expected와 맞는지 봤다), 구현을 놓으면 그 과제의 확인 명령(타입 검사와 관계있는 시험 폴더)이 통과했다. 과제 16의 묶은 실행 파일 다시 만들기와 묶음 검사도 통과했다. 과제 16 뒤의 `npm run check`는 시험 파일 68개·시험 1,001개가 통과했고 `묶음 검사 통과`였다. 다시 묶어도 묶은 실행 파일은 달라지지 않았다. 다 만든 복제본의 파일 175개는 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다.

연습 작업 폴더에서 따로 확인한 것은 이렇다. 결정성 시험이 정렬을 하나씩 뺀 변이 다섯 가운데 넷(읽지 못한 파일, 읽지 못한 셋팅의 대상, 세지 않은 플러그인, 되풀이 줄의 프로젝트)을 잡았다. 도구별 값의 관측 범위 시험이 표를 틀리게 바꾼 변이 셋(S5를 비우기, F2에서 지표 하나 빼기, E5에 실린 이름 더하기)을 모두 잡았다. 계획 리뷰 1차·2차·3차의 지적과 주 세션의 자기 검토마다 고치기 전의 잘못을 되살린 변이 스물(훅 알림의 범위, 꺼진 플러그인의 스킬 폴더, 놓인 곳이 없는 플러그인을 구성 모름에서 뺌, 읽지 못한 캐시 항목을 지움, 파일 지우기가 폴더 안으로 내려감, 이번 결과를 지키지 않음(명령과 고르기 두 곳), 결과가 없는 이번 시각이 자리를 맡음, 위 폴더의 자리를 다시 보지 않음, 바로 위 폴더가 링크인지만 봄, 결과 정리와 캐시 정리가 재귀 지우기를 부름, 위 폴더가 바뀌어 지우지 않은 것을 세거나 알리지 않음(지우기 함수, 결과 정리, 캐시 정리, 점검 실행 네 곳), 요약에 프로젝트 경로를 실음, 이력을 상태보다 먼저 씀, 상태와 결과의 임시 파일을 남김)을 시험이 모두 잡았다. 묶은 실행 파일로 이 PC의 기록과 셋팅을 저장 없이 점검했고, 종료 코드 0으로 끝나 결과 파일이 과제 12의 모양으로 나왔다(숫자는 저장소 밖 기록에만 둔다).

확인하지 못한 것은 이렇다. 서로 다른 프로세스의 두 점검이 거의 같은 때에 돌면 상태 파일은 깨지지 않지만(프로세스마다 다른 임시 파일에 쓰고 이름을 바꾼다) 나중에 쓴 쪽의 관측 기록만 남는다. 앞 점검만 본 설치의 첫날이 늦춰지는 쪽(끄자는 제안을 미루는 쪽)으로 틀린다. 설계에 동시 실행의 약속이 없어 막지 않았고 시험하지 않았다. 도구가 하나라서 도구를 넘는 이름의 차례(E6의 정보)와 도구 둘의 사용 기록, 단서는 시험으로 가르지 못했다. E6 정보의 이름 정렬을 뺀 변이는 2부의 서버 판정 목록이 이미 같은 차례라서 지금의 시험이 잡지 못한다. 정리 진입 시험은 정리 함수가 쓰는 파일 함수를 감싸 고른 직후의 한 때에 그 자리를 바꾼다. 다른 프로그램이 아무 때나 바꾸는 모든 경우를 재현한 것은 아니고, 지우기 직전의 마지막 확인 뒤에 바꾸는 틈은 남는다. 캐시 항목을 읽지 못하는 경우는 없는 파일을 읽어 만들었고 실제 권한 오류는 만들지 않았다. 한 프로세스 안에서 저장 함수를 동시에 부르는 것은 명령이 하지 않아 다루지 않았다(임시 파일 이름이 같아진다). 임시 파일을 지우는 것마저 막히면 그 파일은 남는다. macOS와 Linux, 기본 로캘이 다른 실행 환경에서는 돌려 보지 않았다. 이 PC의 결과가 실제 기록과 맞는지를 따로 세어 대조하는 일은 구현 단계의 짝 검증(과제 17의 Step 7)이 한다.
