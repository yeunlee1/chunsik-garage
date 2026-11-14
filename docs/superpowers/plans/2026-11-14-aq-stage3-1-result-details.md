# AQ 점검 3단계 1부 — 결과 화면이 쓸 평가 결과 보완 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 이 PC의 기록으로 돌린 점검의 새 칸 읽기로 검증한다.

**Goal:** 결과 화면(3단계 2부)을 그리기 전에, 평가 결과와 요약에 「3단계 계획 전 결정」이 정한 것을 더한다. 지켜보는 중인 MCP 서버마다 판정을 시작할 수 있는 날, 프로젝트의 폴더 이름(같은 이름이면 차례 번호), S3가 센 설정 문제의 위치(절대 경로가 아닌 꼴), AQ를 내지 않았을 때 비운 요약의 먼저 고칠 것이다.

**Architecture:** 날의 계산은 판정 쪽 순수 함수(`src/core/installs/`)에 두고 `serverEstablished`와 같은 조건을 날로 바꿔 셈한다. 폴더 이름과 문제의 위치는 경로를 아는 스캐너(`src/scan/claude.ts`)가 만들어 셋팅 사실에 싣고, core는 그 글을 옮기기만 한다. 평가 결과의 따로 둔 자리(`details`)에 칸을 더하고, 요약은 AQ가 없으면 먼저 고칠 것을 비운다. 결과 화면과 그림은 2부다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 1단계와 2단계와 같다. 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 끝 「3단계 계획 전 결정(2026-11-14, 주 세션)」의 4번(S3의 위치), 5번(판정을 시작할 수 있는 날), 6번(요약의 먼저 고칠 것), 10번(폴더 이름과 차례 번호)과, 그것이 고친 12.1(관측 날짜의 예외), 12.2(`details`), 12.3(요약), 19.1(결과 화면에 넣는 것)을 구현한다. 로드맵은 `docs/superpowers/plans/2026-11-12-aq-roadmap.md`, 앞 계획은 `2026-11-14-aq-stage2-4-copy-and-lang.md`다.

## 3단계를 나누는 것

로드맵의 3단계(결과 화면, 공유 카드, 그림 6장)를 둘로 나눈다. 2단계를 나눈 까닭과 같다. 1부는 결과 화면이 그릴 자료를 평가 결과에 더하는 작은 일이고, 2부(결과 화면 HTML, 공유 카드, 그림, `aq checkup`이 화면을 여는 것)는 1부가 병합되고 검증된 뒤에 계획한다. 1부가 바꾸는 것은 평가 결과의 모양이라서, 화면을 만들기 전에 실제 기록으로 돌려 보고 짝 검증을 받아 두면 2부의 자료가 굳는다. 로드맵 문서를 이 계획과 같은 커밋에서 고쳤다.

## 1부의 범위

| 넣는 것 | 넣지 않는 것(그 단계) |
|---|---|
| 판정을 시작할 수 있는 날의 계산과 결과의 칸, 프로젝트 폴더 이름(차례 번호)과 결과의 칸, S3 문제의 위치와 결과의 칸, AQ를 내지 않았을 때 요약의 먼저 고칠 것 | 결과 화면 HTML과 고정 글, 공유 카드, 그림 6장과 장면 고르기, `aq checkup`이 결과 화면을 쓰고 여는 것(3단계 2부), 터미널에서 먼저 고칠 것의 줄을 옮기지 않는 스킬의 틀(4단계), Codex의 설정 폴더 이름(5단계) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- **`src/core/`는 순수하다**(설계 7.2). 파일을 열지 않고, 시계를 읽지 않고, Node.js 모듈과 바깥 패키지를 값으로 가져오지 않는다. 경로를 다루는 일(폴더 이름 떼기, 상대 경로)은 스캐너가 하고 core는 그 글을 옮긴다. 2부 과제 20의 순수성 검사가 그대로 본다.
- **같은 입력 묶음이면 평가 결과는 글자 하나 다르지 않다**(설계 12.1, 12.2). 판정을 시작할 수 있는 날도 입력 묶음(관측 기록, 세션 요약, 평가 시계)만으로 정한다. 저장하는지는 입력이 아니어서 날의 뜻에 "이 점검의 관측을 남긴다고 볼 때"라는 전제로 넣는다(「3단계 계획 전 결정」의 5번).
- **평가 결과와 요약에 절대 경로를 새로 싣지 않는다.** 새 칸의 위치는 도구의 설정 폴더(`~/.claude`, 옮겼으면 `$CLAUDE_CONFIG_DIR`)나 프로젝트 폴더 이름부터 적고 나눔표는 `/`다. 폴더 이름은 정규화하기 전 뿌리 경로의 마지막 이름이다(설계 19.1, 「3단계 계획 전 결정」의 4번과 10번). 문장(`text`)에는 이름과 경로를 넣지 않는다(설계 19.1, 4부).
- **2단계의 칸은 지우지 않는다.** 칸을 더하고, 요약의 먼저 고칠 것은 칸을 두고 비운다(설계 12.3).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더와 OS의 관리 정책 폴더를 읽지도 쓰지도 않는다(설계 21.1).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `3단계-1-결과보완` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증은 병합 앞의 관문이다.
- 이 PC의 기록과 셋팅에서 잰 숫자, 경로, 이름은 저장소와 병합 요청에 넣지 않는다(설계 머리말).

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `2565353D340B393CE1C586CA610A5D01769CDFAE49C5015D5742C8FC9789411F`, 3,855줄)이다. 정한 것은 「3단계 계획 전 결정」의 번호로 과제마다 적었다. 계획은 저장소 밖의 연습 작업 폴더에서 과제마다 시험과 구현을 실제로 쓰고 돌려서 만들었다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/core/installs/age.ts`(고침) | 1 | 날에서 며칠 뒤의 날 |
| `src/core/installs/listing.ts`(고침) | 1 | ㉱의 근거가 든 날 |
| `src/core/installs/verdict.ts`(고침) | 1 | 서버 하나의 판정을 시작할 수 있는 날 |
| `src/scan/types.ts`(고침) | 2, 4 | 프로젝트 사실의 폴더 이름, 설정 문제의 위치 |
| `src/scan/claude.ts`(고침) | 2, 4 | 폴더 이름과 차례 번호, 문제의 위치 |
| `src/core/metrics/fit.ts`(고침) | 2 | F3과 F4의 프로젝트 자리에 폴더 이름 |
| `src/core/installs/servers.ts`(고침) | 3 | 판정한 서버에 판정을 시작할 수 있는 날 |
| `src/core/metrics/setup.ts`(고침) | 4 | S3가 센 문제의 목록 |
| `src/core/evaluate.ts`(고침) | 4 | 평가에 S3가 센 문제 |
| `src/core/result/assemble.ts`(고침) | 2, 3, 4 | 판정에서 뺀 서버의 폴더 이름과 날, 따로 둔 자리의 문제 목록 |
| `src/core/result/summary.ts`(고침), `skills/aq/scripts/aq.mjs`(다시 묶음) | 5 | AQ가 없을 때 비운 먼저 고칠 것 |
| `docs/superpowers/plans/2026-11-12-aq-roadmap.md`(고침) | 이 계획의 커밋 | 3단계를 1부와 2부로 나눔 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/3`처럼 차례를 적었고 적힌 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 5의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 마지막 과제에서 돌린다. 과제 1~4 사이에는 묶은 실행 파일이 원본과 달라 `npm run check`의 묶음 검사가 실패한다. 과제 5가 다시 묶는다.

---

### Task 1: 지켜보는 서버를 판정할 수 있게 되는 날의 계산

**Files:**
- Modify: `src/core/installs/age.ts`
- Modify: `src/core/installs/listing.ts`
- Modify: `src/core/installs/verdict.ts`
- Test: `test/core/installs-judge-from.test.ts`

**Interfaces:**
- Consumes: 2부의 `ESTABLISHED_DAYS`, `olderThan`(`src/core/installs/age.ts`), `SessionListing`, `restartedRecently`(`src/core/installs/listing.ts`), `VerdictContext`, `serverEstablished`(`src/core/installs/verdict.ts`), 1부의 `updateInstalls`(`src/state/observations.ts`, 시험만).
- Produces: `daysAfter(date: LocalDate, days: number): LocalDate`(`age.ts`), `restartDates(listings: readonly SessionListing[], recordNames: readonly string[], today: LocalDate): LocalDate[] | null`(`listing.ts`), `serverJudgeableFrom(server: McpFact, context: VerdictContext): LocalDate | null`(`verdict.ts`). 과제 3이 쓴다.

설계 「3단계 계획 전 결정」의 5번과 12.1의 예외다.

- 날은 "이 점검의 관측을 상태 파일에 남긴다고 볼 때" 서버 하나가 조건 ④(`serverEstablished`)를 처음 채울 수 있는 날이다. 관측 기록의 첫날(이 정체의 기록이 없으면 평가 시계의 오늘. 첫 점검, 정체가 바뀐 서버, 지난 관측이 빈 목록인 경우)의 15일 뒤와, ㉱의 근거로 든 날마다의 15일 뒤 가운데 가장 늦은 날이다. "14일 넘게 전"은 15일 이상 앞선 날이라서(`olderThan`) 15일 뒤다.
- ㉱의 근거는 `restartedRecently`가 보는 두 몫 그대로다. 한 세션 안에서 다시 실린 날과, 그 이름이 실리던 작업 폴더에서 처음 목록에 없이 시작한 최근 세션의 시작한 날이다. 지금 최근 14일 안인 근거만 날을 낸다. 시작한 날을 모르는 세션이 근거이면 그 근거는 날이 지나도 최근으로 남으므로 `null`이다.
- 시험은 식을 다시 적지 않고 실제 판정 함수와 견준다. 장면마다 오늘 점검을 저장했다고 보고(`updateInstalls`) 날을 하루씩 넘겨 `serverEstablished`가 처음 참이 되는 날을 찾아 계산한 날과 같은지 본다. 하루 어긋난 식(`ESTABLISHED_DAYS` 뒤)과 ㉱를 빼먹은 식은 이 시험에서 실패한다(연습 작업 폴더에서 변이로 확인).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/installs-judge-from.test.ts`(새 파일):

```ts
// 지켜보는 중인 MCP 서버를 판정할 수 있게 되는 날을 시험한다. 입력을 그대로 두고 이 점검을 저장한 뒤 날만 지날 때, serverEstablished가 처음 참이 되는 날과 같아야 한다(설계 11.3 E6의 ④, 12.1, 13.1)
import { describe, expect, it } from "vitest";
import { makeWindows, type LocalDate } from "../../src/adapters/common/dates.ts";
import { daysAfter } from "../../src/core/installs/age.ts";
import { restartDates, sessionListings } from "../../src/core/installs/listing.ts";
import { calledMcpNames } from "../../src/core/installs/signals.ts";
import { recordMap, serverEstablished, serverJudgeableFrom, type VerdictContext } from "../../src/core/installs/verdict.ts";
import { projectLookup } from "../../src/core/projects.ts";
import type { McpFact } from "../../src/scan/types.ts";
import { updateInstalls } from "../../src/state/observations.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { mcpServer, project } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

// 2026-11-13(서울)
const NOW = Date.UTC(2026, 10, 13, 3, 0);
const windows = makeWindows(NOW, "Asia/Seoul");
const TODAY = windows.today;
const lookup = projectLookup([project("/work/app")], { "/work/app": "/work/app" });
const DB = mcpServer("db");

interface Scene {
  records?: InstallRecord[] | null;
  sessions?: SummaryInput[];
}
const contextOn = (today: LocalDate, scene: Scene, records: InstallRecord[] | null): VerdictContext => {
  const summaries = (scene.sessions ?? []).map((input) => summary(input));
  return {
    day: { today, timeZone: "Asia/Seoul" },
    windows,
    records: recordMap(records),
    used: calledMcpNames(summaries, windows),
    listings: sessionListings(summaries, "mcp", { "/work/app": "/work/app" }, lookup),
    complete: true,
  };
};
const judgeFrom = (scene: Scene, server: McpFact = DB) => serverJudgeableFrom(server, contextOn(TODAY, scene, scene.records ?? null));
/**
 * 오늘 점검을 저장했다고 보고(관측 기록을 updateInstalls로 고친다) 날을 하루씩 넘기며 serverEstablished가 참이 되는 첫날을 찾는다.
 * 오늘은 고치기 전의 기록으로 본다. limit일 안에 참이 되지 않으면 null이다.
 */
const firstEstablished = (scene: Scene, server: McpFact = DB, limit = 60): LocalDate | null => {
  const before = scene.records ?? null;
  if (serverEstablished(server, contextOn(TODAY, scene, before))) return TODAY;
  const after = updateInstalls(before, [server.installKey!], TODAY);
  for (let n = 1; n <= limit; n++) {
    const day = daysAfter(TODAY, n);
    if (serverEstablished(server, contextOn(day, scene, after))) return day;
  }
  return null;
};
const record = (firstSeen: LocalDate, appeared = false, server: McpFact = DB): InstallRecord => ({ key: server.installKey!, firstSeen, appeared });
const reloadedOn = (date: LocalDate): SummaryInput => ({ initialMcpServers: ["db"], days: { "2026-10-01": { responses: 1, loadedMcpServers: ["db"] }, [date]: { responses: 1, loadedMcpServers: ["db"], reloadedMcpServers: ["db"] } } });
const startedWithout = (date: LocalDate | null): SummaryInput => ({ initialMcpServers: [], firstDate: date, days: date === null ? {} : { [date]: { responses: 1, loadedMcpServers: [] } } });
const loadedBefore: SummaryInput = { initialMcpServers: ["db"], days: { "2026-10-01": { responses: 1, loadedMcpServers: ["db"] } } };

describe("daysAfter", () => {
  it("날을 더하고 뺀다. 달과 해를 넘긴다", () => {
    expect(daysAfter("2026-11-13", 15)).toBe("2026-11-28");
    expect(daysAfter("2026-12-25", 10)).toBe("2027-01-04");
    expect(daysAfter("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysAfter("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("restartDates: ㉱의 근거가 든 날", () => {
  const dates = (sessions: SummaryInput[]) => restartDates(contextOn(TODAY, { sessions }, null).listings, ["db"], TODAY);
  it("한 세션 안에서 다시 실린 날 가운데 최근 14일 안의 것만 낸다", () => {
    expect(dates([reloadedOn("2026-11-05")])).toEqual(["2026-11-05"]);
    expect(dates([reloadedOn("2026-10-30")])).toEqual(["2026-10-30"]);
    expect(dates([reloadedOn("2026-10-29")])).toEqual([]);
  });
  it("그 이름이 실리던 작업 폴더에서 처음 목록에 없이 시작한 최근 세션의 시작한 날을 낸다. 시작한 날을 모르면 null이다", () => {
    expect(dates([loadedBefore, startedWithout("2026-11-08")])).toEqual(["2026-11-08"]);
    expect(dates([loadedBefore, startedWithout("2026-10-29")])).toEqual([]);
    expect(dates([loadedBefore, startedWithout(null)])).toBeNull();
  });
  it("근거가 없으면 빈 목록이다", () => {
    expect(dates([])).toEqual([]);
    expect(dates([loadedBefore])).toEqual([]);
  });
});

describe("serverJudgeableFrom: 판정을 시작할 수 있는 날", () => {
  const scenes: [string, Scene][] = [
    ["첫 점검(관측 기록이 아직 없다)", { records: null }],
    ["관측 기록의 첫날이 사흘 전", { records: [record("2026-11-10")] }],
    ["첫날이 14일 전(아직 14일 넘게 전이 아니다)", { records: [record("2026-10-30")] }],
    ["14일 안의 점검에 새로 나타났다", { records: [record("2026-11-08", true)] }],
    ["정체가 바뀌었다(관측 기록에 이 정체가 없다)", { records: [record("2026-09-01", false, mcpServer("db", { definitionHash: "old" }))] }],
    ["오래전부터 봤지만 최근에 다시 실렸다", { records: [record("2026-09-01")], sessions: [reloadedOn("2026-11-11")] }],
    ["다시 실린 날이 14일 전 경계", { records: [record("2026-09-01")], sessions: [reloadedOn("2026-10-30")] }],
    ["처음 목록에 없이 시작한 최근 세션", { records: [record("2026-09-01")], sessions: [loadedBefore, startedWithout("2026-11-12")] }],
    ["근거가 여럿이면 가장 늦은 날", { records: [record("2026-11-03")], sessions: [reloadedOn("2026-11-01"), loadedBefore, startedWithout("2026-11-09")] }],
    ["시계가 뒤로 가서 첫날이 오늘보다 뒤", { records: [record("2026-11-20")] }],
  ];
  for (const [name, scene] of scenes) {
    it(`${name}: 날을 지나 보며 처음 판정할 수 있게 되는 날과 같다`, () => {
      const expected = firstEstablished(scene);
      expect(expected).not.toBeNull();
      expect(judgeFrom(scene)).toBe(expected);
    });
  }
  it("관측 기록의 첫날이 14일 넘게 전이고 근거가 없으면 오늘이 이미 지났다(지켜보는 중이 아니다)", () => {
    const scene = { records: [record("2026-10-29")] };
    expect(firstEstablished(scene)).toBe(TODAY);
    expect(judgeFrom(scene)! <= TODAY).toBe(true);
  });
  it("시작한 날을 모르는 세션이 근거이면 null이고, 날이 지나도 판정하지 못한다", () => {
    const scene = { records: [record("2026-09-01")], sessions: [loadedBefore, startedWithout(null)] };
    expect(judgeFrom(scene)).toBeNull();
    expect(firstEstablished(scene)).toBeNull();
  });
  it("정체가 없는 서버는 null이다", () => {
    expect(judgeFrom({ records: [] }, mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null }))).toBeNull();
  });
  it("첫 점검을 저장한 뒤 같은 날 다시 점검해도 날이 같다", () => {
    const saved = updateInstalls(null, [DB.installKey!], TODAY);
    expect(judgeFrom({ records: saved })).toBe(judgeFrom({ records: null }));
    const changed = [record("2026-09-01", false, mcpServer("db", { definitionHash: "old" }))];
    expect(judgeFrom({ records: updateInstalls(changed, [DB.installKey!], TODAY) })).toBe(judgeFrom({ records: changed }));
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/installs-judge-from.test.ts`
Expected: FAIL. `test/core/installs-judge-from.test.ts`의 시험 18개가 모두 실패한다. `daysAfter`, `restartDates`, `serverJudgeableFrom`이 아직 없다.

- [ ] **Step 3: 구현한다**

`src/core/installs/age.ts`(찾을 곳):

```ts

/** "days일 넘게 전"이다. 오늘보다 days+1일 이상 앞선 날이다. 오늘과 그 앞 days일, 오늘보다 뒤의 날은 "days일 안"이다. */
```

`src/core/installs/age.ts`(바꾼 뒤):

```ts

/** 그 날에서 days일 뒤의 날. days가 음수이면 앞의 날이다 */
export function daysAfter(date: LocalDate, days: number): LocalDate {
  return new Date((epochDay(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** "days일 넘게 전"이다. 오늘보다 days+1일 이상 앞선 날이다. 오늘과 그 앞 days일, 오늘보다 뒤의 날은 "days일 안"이다. */
```

`src/core/installs/listing.ts`(찾을 곳):

```ts
  return listings.some((listing) => listing.cwdKey !== null && loadedIn.has(listing.cwdKey) && listing.initial !== null && recent(listing.firstDate) && !anyIn(recordNames, listing.initial));
}
```

`src/core/installs/listing.ts`(바꾼 뒤):

```ts
  return listings.some((listing) => listing.cwdKey !== null && loadedIn.has(listing.cwdKey) && listing.initial !== null && recent(listing.firstDate) && !anyIn(recordNames, listing.initial));
}

/**
 * ㉱의 근거가 든 날. restartedRecently가 보는 두 몫에서 지금 최근 14일 안인 근거마다 그 날을 낸다(다시 실린 날, 처음 목록에 없던 세션이 시작한 날).
 * 시작한 날을 모르는 세션이 근거이면 null이다. 그 근거는 날이 지나도 최근으로 남는다. 근거가 없으면 빈 목록이다.
 */
export function restartDates(listings: readonly SessionListing[], recordNames: readonly string[], today: LocalDate): LocalDate[] | null {
  const recent = (date: LocalDate): boolean => !olderThan(today, date, ESTABLISHED_DAYS);
  const dates: LocalDate[] = [];
  const loadedIn = new Set<string>();
  for (const listing of listings) {
    for (const day of listing.days) if (recent(day.date) && anyIn(recordNames, day.reloaded)) dates.push(day.date);
    if (listing.cwdKey !== null && anyIn(recordNames, listing.everLoaded)) loadedIn.add(listing.cwdKey);
  }
  for (const listing of listings) {
    if (listing.cwdKey === null || !loadedIn.has(listing.cwdKey) || listing.initial === null || anyIn(recordNames, listing.initial)) continue;
    if (listing.firstDate === null) return null;
    if (recent(listing.firstDate)) dates.push(listing.firstDate);
  }
  return dates;
}
```

`src/core/installs/verdict.ts`(찾을 곳 1/2):

```ts
// 설치 하나를 「썼다, 안 쓴 것이 확인됨, 쓰는지 모름」으로 가른다. 스킬은 위치마다, MCP 서버는 서버마다 본다. 이름이 아니라 지금의 설치를 본다(순수 함수, 설계 11.3 E5·E6)
import type { Windows } from "../../adapters/common/dates.ts";
import type { FileStatus, McpFact, SkillFact } from "../../scan/types.ts";
import type { InstallRecord } from "../../state/state.ts";
import { ESTABLISHED_DAYS, RECENT_USE_DAYS, msOlderThan, olderThan, type EvalDay } from "./age.ts";
import { loadedSince, restartedRecently, type SessionListing } from "./listing.ts";
import { anyIn, type UsedNames } from "./signals.ts";
```

`src/core/installs/verdict.ts`(바꾼 뒤 1/2):

```ts
// 설치 하나를 「썼다, 안 쓴 것이 확인됨, 쓰는지 모름」으로 가른다. 스킬은 위치마다, MCP 서버는 서버마다 본다. 이름이 아니라 지금의 설치를 본다(순수 함수, 설계 11.3 E5·E6)
import type { LocalDate, Windows } from "../../adapters/common/dates.ts";
import type { FileStatus, McpFact, SkillFact } from "../../scan/types.ts";
import type { InstallRecord } from "../../state/state.ts";
import { ESTABLISHED_DAYS, RECENT_USE_DAYS, daysAfter, msOlderThan, olderThan, type EvalDay } from "./age.ts";
import { loadedSince, restartDates, restartedRecently, type SessionListing } from "./listing.ts";
import { anyIn, type UsedNames } from "./signals.ts";
```

`src/core/installs/verdict.ts`(찾을 곳 2/2):

```ts

/** 조건 ②. 도구의 집계가 없거나 그 마지막 사용이 30일 넘게 전이다. 집계가 든 파일을 읽지 못했거나 그 파일이 없으면 모르는 것이라 채우지 못한다 */
```

`src/core/installs/verdict.ts`(바꾼 뒤 2/2):

```ts

/**
 * 조건 ④(MCP 서버)를 처음 채울 수 있는 날(설계 12.1, 13.1). 입력(관측 기록과 세션 기록)이 그대로이고 평가 시계의 날만 지날 때 serverEstablished가 처음 참이 되는 날이다.
 * 관측 기록의 첫날(기록이 없거나 정체가 바뀌었으면 오늘. 이 점검을 저장하면 오늘이 첫날이 된다)과 ㉱의 근거가 든 날마다 15일 뒤 가운데 가장 늦은 날이다.
 * 정체가 없는 서버와 날짜를 모르는 근거가 있는 서버는 null이다.
 */
export function serverJudgeableFrom(server: McpFact, context: VerdictContext): LocalDate | null {
  if (server.installKey === null) return null;
  const first = context.records?.get(server.installKey)?.firstSeen ?? context.day.today;
  const restarts = restartDates(context.listings, server.recordNames, context.day.today);
  if (restarts === null) return null;
  return [first, ...restarts].map((date) => daysAfter(date, ESTABLISHED_DAYS + 1)).reduce((a, b) => (a > b ? a : b));
}

/** 조건 ②. 도구의 집계가 없거나 그 마지막 사용이 30일 넘게 전이다. 집계가 든 파일을 읽지 못했거나 그 파일이 없으면 모르는 것이라 채우지 못한다 */
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/installs-judge-from.test.ts test/core/installs-basics.test.ts test/core/installs-verdict.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 72개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/installs-judge-from.test.ts src/core/installs/age.ts src/core/installs/listing.ts src/core/installs/verdict.ts
git commit -m "feat: 지켜보는 서버를 판정할 수 있는 날을 계산"
```

---

### Task 2: 평가 결과에 프로젝트 폴더 이름을 싣기

**Files:**
- Modify: `test/core/copy-findings.test.ts`
- Modify: `test/core/evaluate.test.ts`
- Modify: `test/core/metrics-fit.test.ts`
- Modify: `test/core/result-assemble.test.ts`
- Modify: `test/helpers/facts.ts`
- Modify: `test/scan/claude.test.ts`
- Modify: `test/scan/identity.test.ts`
- Modify: `src/core/metrics/fit.ts`
- Modify: `src/core/result/assemble.ts`
- Modify: `src/scan/claude.ts`
- Modify: `src/scan/types.ts`

**Interfaces:**
- Consumes: 1부의 `groupProjects`가 낸 `root`와 `normRoot`(`src/scan/projects.ts`), 2부의 `MissingInstructions`, `WorstOverlap`(`src/core/metrics/fit.ts`), 3부의 `UnjudgedServer`(`src/core/result/assemble.ts`).
- Produces: `ProjectFact.name: string`(`src/scan/types.ts`), `MissingInstructions.name`, `WorstOverlap.name`, `UnjudgedServer.projectName: string | null`. 스캐너 안의 `projectNamesOf(refs)`와 그 지도 `projectNames`(정규화한 뿌리 → 이름)는 과제 4가 S3 위치의 앞머리에 쓴다.

설계 「3단계 계획 전 결정」의 10번과 19.1이다.

- 이름은 정규화하기 전 뿌리 경로의 마지막 이름이다. 정규화한 경로는 Windows에서 소문자라서 거기서 떼면 대소문자가 달라진다. 경로를 다루는 일이라 스캐너가 하고 core는 옮긴다(설계 7.2).
- 읽는 프로젝트(있고 프로젝트로 보지 않는 폴더가 아닌 것)는 이름이 서로 다르게 정한다. 읽는 프로젝트의 원래 이름을 모두 먼저 잡아 두고 정규화한 뿌리 차례로 보며, 원래 이름을 아직 아무도 받지 않았으면 그 이름이고, 이미 받았으면 ` (2)`, ` (3)`… 가운데 잡아 둔 원래 이름과도 이미 정한 이름과도 겹치지 않는 가장 작은 번호를 붙인다. 겹치는지는 대소문자를 가리지 않는다. 원래 이름에 ` (2)`가 든 폴더가 있어도 겹치지 않는다(짝 검증 6차의 반례를 시험에 넣었다).
- 읽지 않는 프로젝트(없어진 폴더, 홈 같은 폴더)는 원래 이름 그대로이고 번호를 쓰지 않는다. 결과 화면에 보이지 않는다.
- 판정에서 뺀 서버의 프로젝트 자리는 입력의 프로젝트 목록에서 정규화한 뿌리로 이름을 찾는다. 프로젝트의 것이 아니면 `null`이다. 정규화한 경로(`normRoot`, `projectRoot`)는 결과 파일에 그대로 남는다. 결과 화면에 넣지 않는 것은 2부가 한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-findings.test.ts`(찾을 곳):

```ts
    const server = (name: string, why: UnjudgedServer["why"], scope: UnjudgedServer["scope"] = "user"): UnjudgedServer => ({ tool: "claude-code", name, scope, projectRoot: null, pluginId: null, why });
```

`test/core/copy-findings.test.ts`(바꾼 뒤):

```ts
    const server = (name: string, why: UnjudgedServer["why"], scope: UnjudgedServer["scope"] = "user"): UnjudgedServer => ({ tool: "claude-code", name, scope, projectRoot: null, projectName: null, pluginId: null, why });
```

`test/core/evaluate.test.ts`(찾을 곳):

```ts
    expect(result.worstOverlap).toEqual({ tool: "claude-code", normRoot: APP });
```

`test/core/evaluate.test.ts`(바꾼 뒤):

```ts
    expect(result.worstOverlap).toEqual({ tool: "claude-code", normRoot: APP, name: "app" });
```

`test/core/metrics-fit.test.ts`(찾을 곳 1/7):

```ts
    expect(result.F3).toEqual({ status: "scored", value: 2 / 3, evidence: { targets: 3, withInstructions: 2 } });
    expect(result.missingInstructions).toEqual([{ normRoot: "/work/b", tools: ["claude-code"] }]);
  });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 1/7):

```ts
    expect(result.F3).toEqual({ status: "scored", value: 2 / 3, evidence: { targets: 3, withInstructions: 2 } });
    expect(result.missingInstructions).toEqual([{ normRoot: "/work/b", name: "b", tools: ["claude-code"] }]);
  });
  it("지침이 없는 프로젝트에는 폴더 이름을 함께 싣는다. 정규화하기 전 뿌리의 마지막 이름이라 대소문자가 그대로다", () => {
    const mixed = project("C:/Work/MyApp", { normRoot: "c:/work/myapp", cwds: ["c:/work/myapp"] });
    const result = merged(tool({ projects: [mixed] }, at("c:/work/myapp", 3)));
    expect(result.missingInstructions).toEqual([{ normRoot: "c:/work/myapp", name: "MyApp", tools: ["claude-code"] }]);
  });
```

`test/core/metrics-fit.test.ts`(찾을 곳 2/7):

```ts
      expect(result.F3).toMatchObject({ status: "scored", value: 0, evidence: { targets: 1, withInstructions: 0 } });
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 2/7):

```ts
      expect(result.F3).toMatchObject({ status: "scored", value: 0, evidence: { targets: 1, withInstructions: 0 } });
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", name: "a", tools: ["codex"] }]);
    });
```

`test/core/metrics-fit.test.ts`(찾을 곳 3/7):

```ts
      expect(tie.F3).toMatchObject({ status: "scored", value: 0 });
      expect(tie.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 3/7):

```ts
      expect(tie.F3).toMatchObject({ status: "scored", value: 0 });
      expect(tie.missingInstructions).toEqual([{ normRoot: "/work/a", name: "a", tools: ["codex"] }]);
    });
```

`test/core/metrics-fit.test.ts`(찾을 곳 4/7):

```ts
      const result = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3)), tool({ projects: [] }, at("/work/a", 3), "codex"));
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", tools: ["codex"] }]);
    });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 4/7):

```ts
      const result = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3)), tool({ projects: [] }, at("/work/a", 3), "codex"));
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", name: "a", tools: ["codex"] }]);
    });
```

`test/core/metrics-fit.test.ts`(찾을 곳 5/7):

```ts
    expect(result.F4).toEqual({ status: "scored", value: 0.75, evidence: { comparedProjects: 3, globalLines: 4, overlappingLines: 3 } });
    expect(result.worstOverlap).toEqual({ tool: "claude-code", normRoot: "/work/b" });
  });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 5/7):

```ts
    expect(result.F4).toEqual({ status: "scored", value: 0.75, evidence: { comparedProjects: 3, globalLines: 4, overlappingLines: 3 } });
    expect(result.worstOverlap).toEqual({ tool: "claude-code", normRoot: "/work/b", name: "b" });
  });
  it("가장 많이 겹치는 프로젝트에도 폴더 이름을 함께 싣는다", () => {
    const mixed = withLines("C:/Work/MyApp", ["g1"], { normRoot: "c:/work/myapp", cwds: ["c:/work/myapp"] });
    expect(merged(tool({ globalInstructions: GLOBAL, projects: [mixed] })).worstOverlap).toEqual({ tool: "claude-code", normRoot: "c:/work/myapp", name: "MyApp" });
  });
```

`test/core/metrics-fit.test.ts`(찾을 곳 6/7):

```ts
    const projects = [withLines("/work/b", ["g1", "g2"]), withLines("/work/a", ["g3", "g4"])];
    expect(merged(tool({ globalInstructions: GLOBAL, projects })).worstOverlap).toEqual({ tool: "claude-code", normRoot: "/work/a" });
  });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 6/7):

```ts
    const projects = [withLines("/work/b", ["g1", "g2"]), withLines("/work/a", ["g3", "g4"])];
    expect(merged(tool({ globalInstructions: GLOBAL, projects })).worstOverlap).toEqual({ tool: "claude-code", normRoot: "/work/a", name: "a" });
  });
```

`test/core/metrics-fit.test.ts`(찾을 곳 7/7):

```ts
    expect(result.F4).toEqual({ status: "scored", value: 1, evidence: { comparedProjects: 2, globalLines: 2, overlappingLines: 2 } });
    expect(result.worstOverlap).toEqual({ tool: "codex", normRoot: "/work/a" });
    expect(merged(claude, tool({}, [], "codex")).F4).toMatchObject({ status: "scored", value: 0.25 });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 7/7):

```ts
    expect(result.F4).toEqual({ status: "scored", value: 1, evidence: { comparedProjects: 2, globalLines: 2, overlappingLines: 2 } });
    expect(result.worstOverlap).toEqual({ tool: "codex", normRoot: "/work/a", name: "a" });
    expect(merged(claude, tool({}, [], "codex")).F4).toMatchObject({ status: "scored", value: 0.25 });
```

`test/core/result-assemble.test.ts`(찾을 곳 1/3):

```ts
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { mcpServer } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";
```

`test/core/result-assemble.test.ts`(바꾼 뒤 1/3):

```ts
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";
```

`test/core/result-assemble.test.ts`(찾을 곳 2/3):

```ts
    expect(result.details.unjudgedServers).toEqual([
      { tool: "claude-code", name: "alpha", scope: "user", projectRoot: null, pluginId: null, why: "not_established" },
      { tool: "claude-code", name: "zeta", scope: "user", projectRoot: null, pluginId: null, why: "no_definition" },
    ]);
```

`test/core/result-assemble.test.ts`(바꾼 뒤 2/3):

```ts
    expect(result.details.unjudgedServers).toEqual([
      { tool: "claude-code", name: "alpha", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "not_established" },
      { tool: "claude-code", name: "zeta", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "no_definition" },
    ]);
```

`test/core/result-assemble.test.ts`(찾을 곳 3/3):

```ts

  it("JSON으로 바꿨다가 되살려도 같다. 값이 없는 자리는 null이다", () => {
```

`test/core/result-assemble.test.ts`(바꾼 뒤 3/3):

```ts

  it("프로젝트 범위의 판정에서 뺀 서버에는 그 프로젝트의 폴더 이름을 함께 싣는다. 경로는 정규화한 것 그대로 둔다", () => {
    const local = mcpServer("local-db", { scope: "local", projectRoot: "c:/work/myapp" });
    const result = checkupResult(resultInput({ setup: { mcpServers: [local], projects: [project("C:/Work/MyApp", { normRoot: "c:/work/myapp", cwds: ["c:/work/myapp"] })] } }));
    expect(result.details.unjudgedServers).toEqual([{ tool: "claude-code", name: "local-db", scope: "local", projectRoot: "c:/work/myapp", projectName: "MyApp", pluginId: null, why: "not_established" }]);
  });

  it("JSON으로 바꿨다가 되살려도 같다. 값이 없는 자리는 null이다", () => {
```

`test/helpers/facts.ts`(찾을 곳):

```ts
    root,
    normRoot: root,
```

`test/helpers/facts.ts`(바꾼 뒤):

```ts
    root,
    name: root.split(/[\/]/).filter(Boolean).pop() ?? root,
    normRoot: root,
```

`test/scan/claude.test.ts`(찾을 곳):

```ts

  it("스킬: skillOverrides의 off는 꺼짐, user-invocable-only와 disable-model-invocation은 켜져 있지만 목록에 실리지 않는다", () => {
```

`test/scan/claude.test.ts`(바꾼 뒤):

```ts

  it("프로젝트 폴더 이름은 정규화하기 전 뿌리 경로의 마지막 이름이다. 하위 폴더에서 연 세션도 깃 뿌리의 이름이고 대소문자가 그대로다", async () => {
    expect(facts.projects.find((p) => p.root === join(root, "work", "proj"))!.name).toBe("proj");
    const mixed = join(root, "work", "MyApp");
    await put(join(mixed, ".git", "HEAD"), "ref: refs/heads/main\n");
    await put(join(mixed, "src", "x.txt"), "x");
    const scanned = await scanClaudeSetup({ ...input, cwds: [join(mixed, "src")] });
    expect(scanned.projects.map((p) => p.name)).toEqual(["MyApp"]);
  });

  it("읽는 프로젝트 가운데 폴더 이름이 같은 것(대소문자를 가리지 않는다)은 정규화한 뿌리 차례로 둘째부터 차례 번호를 붙인다. 읽지 않는 폴더는 세지 않는다", async () => {
    const first = join(root, "a", "app");
    const second = join(root, "b", "App");
    const third = join(root, "c", "app");
    for (const dir of [first, second, third]) await put(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    const gone = join(root, "0", "app");
    const scanned = await scanClaudeSetup({ ...input, cwds: [third, gone, first, second] });
    const nameOf = (dir: string) => scanned.projects.find((p) => p.root === dir)!.name;
    expect([nameOf(first), nameOf(second), nameOf(third)]).toEqual(["app", "App (2)", "app (3)"]);
    expect(nameOf(gone)).toBe("app");
  });

  it("붙인 번호는 다른 읽는 프로젝트의 원래 이름과도 겹치지 않는다. 원래 이름을 먼저 잡아 두고 비어 있는 가장 작은 번호를 고른다", async () => {
    const first = join(root, "a", "app");
    const second = join(root, "b", "app");
    const numbered = join(root, "c", "app (2)");
    const twice = join(root, "d", "App (2)");
    for (const dir of [first, second, numbered, twice]) await put(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    const scanned = await scanClaudeSetup({ ...input, cwds: [twice, numbered, second, first] });
    const names = [first, second, numbered, twice].map((dir) => scanned.projects.find((p) => p.root === dir)!.name);
    expect(names).toEqual(["app", "app (3)", "app (2)", "App (2) (2)"]);
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
  });

  it("스킬: skillOverrides의 off는 꺼짐, user-invocable-only와 disable-model-invocation은 켜져 있지만 목록에 실리지 않는다", () => {
```

`test/scan/identity.test.ts`(찾을 곳):

```ts
    root: app,
    normRoot: norm(app),
```

`test/scan/identity.test.ts`(바꾼 뒤):

```ts
    root: app,
    name: "app",
    normRoot: norm(app),
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-findings.test.ts test/core/evaluate.test.ts test/core/metrics-fit.test.ts test/core/result-assemble.test.ts test/scan/claude.test.ts test/scan/identity.test.ts`
Expected: FAIL. 기대에 `name`과 `projectName`을 더한 시험 15개가 실패한다(`metrics-fit` 9, `claude`(스캐너의 이름과 차례 번호) 3, `result-assemble` 2, `evaluate` 1). 구현 전에는 그 칸이 없다. `copy-findings`와 `identity`는 시험의 자료 모양만 맞춘 것이라 통과한다.

- [ ] **Step 3: 구현한다**

`src/core/metrics/fit.ts`(찾을 곳 1/5):

```ts
  normRoot: string;
  tools: string[];
```

`src/core/metrics/fit.ts`(바꾼 뒤 1/5):

```ts
  normRoot: string;
  /** 프로젝트 폴더의 이름(ProjectFact.name) */
  name: string;
  tools: string[];
```

`src/core/metrics/fit.ts`(찾을 곳 2/5):

```ts
  normRoot: string;
}
```

`src/core/metrics/fit.ts`(바꾼 뒤 2/5):

```ts
  normRoot: string;
  /** 프로젝트 폴더의 이름(ProjectFact.name) */
  name: string;
}
```

`src/core/metrics/fit.ts`(찾을 곳 3/5):

```ts
    const without = mainTools(use).filter((tool) => !hasInstructions(projectIn(byId.get(tool), project.normRoot)));
    if (without.length > 0) missing.push({ normRoot: project.normRoot, tools: without });
  }
```

`src/core/metrics/fit.ts`(바꾼 뒤 3/5):

```ts
    const without = mainTools(use).filter((tool) => !hasInstructions(projectIn(byId.get(tool), project.normRoot)));
    if (without.length > 0) missing.push({ normRoot: project.normRoot, name: project.name, tools: without });
  }
```

`src/core/metrics/fit.ts`(찾을 곳 4/5):

```ts
      const overlapping = new Set(project.instructions.lineHashes.filter((hash) => lines.has(hash))).size;
      if (worst === null || overlapping * worst.globalLines > worst.overlapping * lines.size) worst = { tool: tool.tool, normRoot: project.normRoot, overlapping, globalLines: lines.size };
    }
```

`src/core/metrics/fit.ts`(바꾼 뒤 4/5):

```ts
      const overlapping = new Set(project.instructions.lineHashes.filter((hash) => lines.has(hash))).size;
      if (worst === null || overlapping * worst.globalLines > worst.overlapping * lines.size) worst = { tool: tool.tool, normRoot: project.normRoot, name: project.name, overlapping, globalLines: lines.size };
    }
```

`src/core/metrics/fit.ts`(찾을 곳 5/5):

```ts
  const evidence = { comparedProjects, globalLines: worst.globalLines, overlappingLines: worst.overlapping };
  return { measurement: scored(worst.overlapping / worst.globalLines, evidence), worst: { tool: worst.tool, normRoot: worst.normRoot } };
}
```

`src/core/metrics/fit.ts`(바꾼 뒤 5/5):

```ts
  const evidence = { comparedProjects, globalLines: worst.globalLines, overlappingLines: worst.overlapping };
  return { measurement: scored(worst.overlapping / worst.globalLines, evidence), worst: { tool: worst.tool, normRoot: worst.normRoot, name: worst.name } };
}
```

`src/core/result/assemble.ts`(찾을 곳 1/3):

```ts
  projectRoot: string | null;
  pluginId: string | null;
```

`src/core/result/assemble.ts`(바꾼 뒤 1/3):

```ts
  projectRoot: string | null;
  /** projectRoot의 프로젝트 폴더 이름(ProjectFact.name). 프로젝트의 것이 아니면 null이다. 결과 화면은 경로 대신 이것을 보인다(설계 19.1) */
  projectName: string | null;
  pluginId: string | null;
```

`src/core/result/assemble.ts`(찾을 곳 2/3):

```ts
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const servers: UnjudgedServer[] = [];
```

`src/core/result/assemble.ts`(바꾼 뒤 2/3):

```ts
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const names = new Map(input.projects.map((project) => [project.normRoot, project.name]));
  const servers: UnjudgedServer[] = [];
```

`src/core/result/assemble.ts`(찾을 곳 3/3):

```ts
      const why = judged.excluded ?? (source.complete.mcp ? "not_established" : "observation_incomplete");
      servers.push({ tool: tool.tool, name: server.name, scope: server.scope, projectRoot: server.projectRoot, pluginId: server.pluginId, why });
    }
```

`src/core/result/assemble.ts`(바꾼 뒤 3/3):

```ts
      const why = judged.excluded ?? (source.complete.mcp ? "not_established" : "observation_incomplete");
      servers.push({ tool: tool.tool, name: server.name, scope: server.scope, projectRoot: server.projectRoot, projectName: server.projectRoot === null ? null : (names.get(server.projectRoot) ?? null), pluginId: server.pluginId, why });
    }
```

`src/scan/claude.ts`(찾을 곳 1/4):

```ts
// Claude Code의 지금 셋팅을 읽어 셋팅 사실로 낸다. 설정 층·지침·스킬·플러그인·MCP 서버·권한과 훅의 겉모양을 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 7.2, 10, 11.3, 19.1)
import { join } from "node:path";
import { claudeHome, normalizePath } from "../adapters/claude/locate.ts";
```

`src/scan/claude.ts`(바꾼 뒤 1/4):

```ts
// Claude Code의 지금 셋팅을 읽어 셋팅 사실로 낸다. 설정 층·지침·스킬·플러그인·MCP 서버·권한과 훅의 겉모양을 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 7.2, 10, 11.3, 19.1)
import { basename, join } from "node:path";
import { claudeHome, normalizePath } from "../adapters/claude/locate.ts";
```

`src/scan/claude.ts`(찾을 곳 2/4):

```ts

export async function scanClaudeSetup(input: ScanInput): Promise<ClaudeSetupFacts> {
```

`src/scan/claude.ts`(바꾼 뒤 2/4):

```ts

/**
 * 프로젝트마다 결과 화면에 보일 폴더 이름(정규화하기 전 뿌리 경로의 마지막 이름). 읽는 프로젝트(있고 프로젝트로 보지 않는 폴더가 아닌 것)는 이름이 서로 다르게 정한다.
 * 읽는 프로젝트의 원래 이름을 모두 먼저 잡아 두고 정규화한 뿌리 차례로 보며, 원래 이름을 아직 아무도 받지 않았으면 그 이름이고, 이미 받았으면
 * " (2)", " (3)"… 가운데 잡아 둔 원래 이름과도 이미 정한 이름과도 겹치지 않는 가장 작은 번호를 붙인다. 겹치는지는 대소문자를 가리지 않는다.
 * 위 폴더 이름을 보이지 않고도 두 프로젝트를 가른다(설계 「3단계 계획 전 결정」의 10번)
 */
function projectNamesOf(refs: readonly { root: string; normRoot: string; exists: boolean; excluded: boolean }[]): Map<string, string> {
  const sorted = [...refs].sort((x, y) => (x.normRoot < y.normRoot ? -1 : x.normRoot > y.normRoot ? 1 : 0));
  const original = (ref: { root: string }): string => basename(ref.root) || ref.root;
  const reading = (ref: { exists: boolean; excluded: boolean }): boolean => ref.exists && !ref.excluded;
  const reserved = new Set(sorted.filter(reading).map((ref) => original(ref).toLowerCase()));
  const taken = new Set<string>();
  const names = new Map<string, string>();
  for (const ref of sorted) {
    const name = original(ref);
    if (!reading(ref)) {
      names.set(ref.normRoot, name);
      continue;
    }
    let label = name;
    for (let n = 2; taken.has(label.toLowerCase()) || (label !== name && reserved.has(label.toLowerCase())); n++) label = `${name} (${n})`;
    taken.add(label.toLowerCase());
    names.set(ref.normRoot, label);
  }
  return names;
}

export async function scanClaudeSetup(input: ScanInput): Promise<ClaudeSetupFacts> {
```

`src/scan/claude.ts`(찾을 곳 3/4):

```ts
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  for (const ref of active) {
```

`src/scan/claude.ts`(바꾼 뒤 3/4):

```ts
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  const projectNames = projectNamesOf(refs);
  for (const ref of active) {
```

`src/scan/claude.ts`(찾을 곳 4/4):

```ts
      root: ref.root,
      normRoot: ref.normRoot,
```

`src/scan/claude.ts`(바꾼 뒤 4/4):

```ts
      root: ref.root,
      name: projectNames.get(ref.normRoot)!,
      normRoot: ref.normRoot,
```

`src/scan/types.ts`(찾을 곳):

```ts
  root: string;
  normRoot: string;
```

`src/scan/types.ts`(바꾼 뒤):

```ts
  root: string;
  /** 프로젝트 폴더의 이름. 정규화하기 전 뿌리 경로의 마지막 이름이다. 결과 화면이 경로 대신 보인다(설계 19.1, 「3단계 계획 전 결정」의 10번) */
  name: string;
  normRoot: string;
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/claude.test.ts test/scan/identity.test.ts test/core/metrics-fit.test.ts test/core/evaluate.test.ts test/core/result-assemble.test.ts test/core/copy-findings.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 6개, 시험 141개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-findings.test.ts test/core/evaluate.test.ts test/core/metrics-fit.test.ts test/core/result-assemble.test.ts test/helpers/facts.ts test/scan/claude.test.ts test/scan/identity.test.ts src/core/metrics/fit.ts src/core/result/assemble.ts src/scan/claude.ts src/scan/types.ts
git commit -m "feat: 평가 결과에 프로젝트 폴더 이름을 실음"
```

---

### Task 3: 판정에서 뺀 서버에 판정을 시작할 수 있는 날 싣기

**Files:**
- Modify: `test/core/copy-findings.test.ts`
- Modify: `test/core/installs-servers.test.ts`
- Modify: `test/core/result-assemble.test.ts`
- Modify: `src/core/installs/servers.ts`
- Modify: `src/core/result/assemble.ts`

**Interfaces:**
- Consumes: 과제 1의 `serverJudgeableFrom`, 2부의 `judgeServers`와 `JudgedServer`(`src/core/installs/servers.ts`), 과제 2의 `UnjudgedServer`.
- Produces: `JudgedServer.judgeFrom: LocalDate | null`, `UnjudgedServer.judgeFrom: LocalDate | null`. 결과 화면(2부)이 "다른 조건이 같으면 N일 뒤의 점검부터 판정할 수 있습니다"를 그린다.

설계 「3단계 계획 전 결정」의 5번과 13.1이다.

- 판정한 서버 가운데 쓰는지 모름이고 구조상 빼지 않은 것만 날을 셈한다. 결과의 판정에서 뺀 서버에는 까닭이 지켜보는 중(`not_established`)일 때만 날을 싣고, 정의가 없음, 정의를 읽지 못한 플러그인의 것, 관측이 빠짐없지 않음은 `null`이다.
- 같은 날 저장한 점검 뒤 다시 점검해도 날이 같다. 결과 조립의 시험이 관측 기록이 없는 입력과 오늘 첫날로 적은 입력에서 같은 날을 확인한다.
- 날은 평가 결과에 싣지만 관측 기록의 첫날은 싣지 않는다(12.1의 예외). 문장(`text`)은 바꾸지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-findings.test.ts`(찾을 곳):

```ts
    const server = (name: string, why: UnjudgedServer["why"], scope: UnjudgedServer["scope"] = "user"): UnjudgedServer => ({ tool: "claude-code", name, scope, projectRoot: null, projectName: null, pluginId: null, why });
```

`test/core/copy-findings.test.ts`(바꾼 뒤):

```ts
    const server = (name: string, why: UnjudgedServer["why"], scope: UnjudgedServer["scope"] = "user"): UnjudgedServer => ({ tool: "claude-code", name, scope, projectRoot: null, projectName: null, pluginId: null, why, judgeFrom: null });
```

`test/core/installs-servers.test.ts`(찾을 곳):

```ts

describe("E6 안 쓰는 MCP 서버", () => {
```

`test/core/installs-servers.test.ts`(바꾼 뒤):

```ts

describe("판정한 서버의 판정을 시작할 수 있는 날", () => {
  it("쓰는지 모름이고 구조상 빼지 않은 서버만 날을 셈한다. 첫 점검이면 오늘의 15일 뒤다", () => {
    const servers = [mcpServer("called"), mcpServer("fresh"), mcpServer("idle"), remote("claude.ai Mail")];
    const judgement = judge({ mcpServers: servers }, { called: ["called"], watched: [servers[2]!] });
    expect(judgement.servers.map((s) => [s.server.name, s.verdict, s.excluded, s.judgeFrom])).toEqual([
      ["called", "used", null, null],
      ["claude.ai Mail", "unknown", "no_definition", null],
      ["fresh", "unknown", null, "2026-11-28"],
      ["idle", "unused", null, null],
    ]);
  });
});

describe("E6 안 쓰는 MCP 서버", () => {
```

`test/core/result-assemble.test.ts`(찾을 곳 1/3):

```ts
      { tool: "claude-code", name: "alpha", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "not_established" },
      { tool: "claude-code", name: "zeta", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "no_definition" },
```

`test/core/result-assemble.test.ts`(바꾼 뒤 1/3):

```ts
      { tool: "claude-code", name: "alpha", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "not_established", judgeFrom: "2026-11-28" },
      { tool: "claude-code", name: "zeta", scope: "user", projectRoot: null, projectName: null, pluginId: null, why: "no_definition", judgeFrom: null },
```

`test/core/result-assemble.test.ts`(찾을 곳 2/3):

```ts
    expect(incomplete.details.unjudgedServers.map((server) => server.why)).toEqual(["observation_incomplete", "no_definition"]);
```

`test/core/result-assemble.test.ts`(바꾼 뒤 2/3):

```ts
    expect(incomplete.details.unjudgedServers.map((server) => [server.why, server.judgeFrom])).toEqual([["observation_incomplete", null], ["no_definition", null]]);
```

`test/core/result-assemble.test.ts`(찾을 곳 3/3):

```ts
    expect(result.details.unjudgedServers).toEqual([{ tool: "claude-code", name: "local-db", scope: "local", projectRoot: "c:/work/myapp", projectName: "MyApp", pluginId: null, why: "not_established" }]);
```

`test/core/result-assemble.test.ts`(바꾼 뒤 3/3):

```ts
    expect(result.details.unjudgedServers).toEqual([{ tool: "claude-code", name: "local-db", scope: "local", projectRoot: "c:/work/myapp", projectName: "MyApp", pluginId: null, why: "not_established", judgeFrom: "2026-11-28" }]);
  });

  it("지켜보는 중인 서버를 판정할 수 있게 되는 날은 관측 기록의 첫날로 셈하고, 첫 점검을 저장한 뒤 같은 날 다시 점검해도 같다(설계 12.1의 예외)", () => {
    const watching = mcpServer("watching");
    const seen = (firstSeen: string) => [{ key: watching.installKey!, firstSeen, appeared: false }];
    const judgeFromWith = (installs: { key: string; firstSeen: string; appeared: boolean }[] | null) => {
      const input = evaluationInput([claudeTool({ sessions: enough, setup: { mcpServers: [watching] } })], { installs });
      return checkupResult({ input, evaluation: evaluate(input), collected: [collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } }).details.unjudgedServers.map((server) => server.judgeFrom);
    };
    expect(judgeFromWith(seen("2026-11-03"))).toEqual(["2026-11-18"]);
    expect(judgeFromWith(null)).toEqual(["2026-11-28"]);
    expect(judgeFromWith(seen("2026-11-13"))).toEqual(judgeFromWith(null));
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-findings.test.ts test/core/installs-servers.test.ts test/core/result-assemble.test.ts`
Expected: FAIL. 판정한 서버와 판정에서 뺀 서버에 `judgeFrom`을 기대하는 시험 4개가 실패한다(`result-assemble` 3, `installs-servers` 1). `copy-findings`는 자료 모양만 맞춘 것이라 통과한다.

- [ ] **Step 3: 구현한다**

`src/core/installs/servers.ts`(찾을 곳 1/4):

```ts
// E6(안 쓰는 MCP 서버)을 도구 하나에서 잰다. 서버 하나가 설치 하나이고, 설정 층을 합쳐 켜져 있는 서버만 센다(순수 함수, 설계 11.3 E6)
import type { McpFact } from "../../scan/types.ts";
```

`src/core/installs/servers.ts`(바꾼 뒤 1/4):

```ts
// E6(안 쓰는 MCP 서버)을 도구 하나에서 잰다. 서버 하나가 설치 하나이고, 설정 층을 합쳐 켜져 있는 서버만 센다(순수 함수, 설계 11.3 E6)
import type { LocalDate } from "../../adapters/common/dates.ts";
import type { McpFact } from "../../scan/types.ts";
```

`src/core/installs/servers.ts`(찾을 곳 2/4):

```ts
import { sameInstall } from "./same.ts";
import { serverVerdict, type Verdict, type VerdictContext } from "./verdict.ts";

```

`src/core/installs/servers.ts`(바꾼 뒤 2/4):

```ts
import { sameInstall } from "./same.ts";
import { serverJudgeableFrom, serverVerdict, type Verdict, type VerdictContext } from "./verdict.ts";

```

`src/core/installs/servers.ts`(찾을 곳 3/4):

```ts
  excluded: "no_definition" | "plugin_unread" | null;
}
```

`src/core/installs/servers.ts`(바꾼 뒤 3/4):

```ts
  excluded: "no_definition" | "plugin_unread" | null;
  /** 판정을 시작할 수 있는 날(serverJudgeableFrom). 쓰는지 모름이고 구조상 빼지 않은 서버만 날을 셈하고, 그 밖은 null이다(설계 12.1, 13.1) */
  judgeFrom: LocalDate | null;
}
```

`src/core/installs/servers.ts`(찾을 곳 4/4):

```ts
  const servers = [...setup.mcpServers].sort(byServer).map((server): JudgedServer => {
    if (server.installKey === null) return { server, verdict: "unknown", excluded: "no_definition" };
    if (server.pluginId !== null && unreadPlugins.has(server.pluginId)) return { server, verdict: "unknown", excluded: "plugin_unread" };
    return { server, verdict: serverVerdict(server, context), excluded: null };
  });
```

`src/core/installs/servers.ts`(바꾼 뒤 4/4):

```ts
  const servers = [...setup.mcpServers].sort(byServer).map((server): JudgedServer => {
    if (server.installKey === null) return { server, verdict: "unknown", excluded: "no_definition", judgeFrom: null };
    if (server.pluginId !== null && unreadPlugins.has(server.pluginId)) return { server, verdict: "unknown", excluded: "plugin_unread", judgeFrom: null };
    const verdict = serverVerdict(server, context);
    return { server, verdict, excluded: null, judgeFrom: verdict === "unknown" ? serverJudgeableFrom(server, context) : null };
  });
```

`src/core/result/assemble.ts`(찾을 곳 1/3):

```ts
// 평가와 수집 결과에서 평가 결과(결과 파일에 저장하는 것)를 조립한다. 입력 묶음이 같으면 글자 하나 다르지 않다. 규칙, 알림, 결과 전체에 두 언어의 문장을 싣는다(순수 함수, 설계 12.1, 12.2, 13.1, 13.2)
import { makeWindows } from "../../adapters/common/dates.ts";
import type { Coverage, ToolId } from "../../adapters/types.ts";
```

`src/core/result/assemble.ts`(바꾼 뒤 1/3):

```ts
// 평가와 수집 결과에서 평가 결과(결과 파일에 저장하는 것)를 조립한다. 입력 묶음이 같으면 글자 하나 다르지 않다. 규칙, 알림, 결과 전체에 두 언어의 문장을 싣는다(순수 함수, 설계 12.1, 12.2, 13.1, 13.2)
import { makeWindows, type LocalDate } from "../../adapters/common/dates.ts";
import type { Coverage, ToolId } from "../../adapters/types.ts";
```

`src/core/result/assemble.ts`(찾을 곳 2/3):

```ts
  why: "no_definition" | "plugin_unread" | "not_established" | "observation_incomplete";
}
```

`src/core/result/assemble.ts`(바꾼 뒤 2/3):

```ts
  why: "no_definition" | "plugin_unread" | "not_established" | "observation_incomplete";
  /** 지켜보는 중인 서버(not_established)를 판정할 수 있게 되는 날. 그날의 점검부터 판정한다. 날을 모르거나 다른 까닭이면 null이다(설계 12.1의 예외, 13.1) */
  judgeFrom: LocalDate | null;
}
```

`src/core/result/assemble.ts`(찾을 곳 3/3):

```ts
      const why = judged.excluded ?? (source.complete.mcp ? "not_established" : "observation_incomplete");
      servers.push({ tool: tool.tool, name: server.name, scope: server.scope, projectRoot: server.projectRoot, projectName: server.projectRoot === null ? null : (names.get(server.projectRoot) ?? null), pluginId: server.pluginId, why });
    }
```

`src/core/result/assemble.ts`(바꾼 뒤 3/3):

```ts
      const why = judged.excluded ?? (source.complete.mcp ? "not_established" : "observation_incomplete");
      const projectName = server.projectRoot === null ? null : (names.get(server.projectRoot) ?? null);
      servers.push({ tool: tool.tool, name: server.name, scope: server.scope, projectRoot: server.projectRoot, projectName, pluginId: server.pluginId, why, judgeFrom: why === "not_established" ? judged.judgeFrom : null });
    }
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/installs-servers.test.ts test/core/result-assemble.test.ts test/core/copy-findings.test.ts test/core/result-determinism.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 4개, 시험 57개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-findings.test.ts test/core/installs-servers.test.ts test/core/result-assemble.test.ts src/core/installs/servers.ts src/core/result/assemble.ts
git commit -m "feat: 판정에서 뺀 서버에 판정을 시작할 날을 실음"
```

---

### Task 4: S3가 센 설정 문제의 위치를 평가 결과에 싣기

**Files:**
- Modify: `test/core/metrics-setup.test.ts`
- Modify: `test/core/result-assemble.test.ts`
- Modify: `test/core/result-notices-setup.test.ts`
- Modify: `test/helpers/personas.ts`
- Modify: `test/scan/claude.test.ts`
- Modify: `src/core/evaluate.ts`
- Modify: `src/core/metrics/setup.ts`
- Modify: `src/core/result/assemble.ts`
- Modify: `src/scan/claude.ts`
- Modify: `src/scan/types.ts`

**Interfaces:**
- Consumes: 과제 2의 `projectNames`, 1부의 `SetupProblem`과 스캐너의 문제 수집(`src/scan/claude.ts`), 2부의 S3(`src/core/metrics/setup.ts`), 3부의 `details`.
- Produces: `SetupProblem.place`(사용자 문제는 글, 그 밖의 주인은 `null`), `CountedProblem`(`{tool, kind, place}`), `countedProblems(tools)`, `mergedSetupRules(...).setupProblems`, `Evaluation.setupProblems`, `CheckupResult.details.setupProblems`. 결과 화면(2부)이 S3 항목에 위치를 이름 칩처럼 그린다.

설계 「3단계 계획 전 결정」의 4번과 12.2, 19.1이다.

- 위치는 절대 경로가 아니다. 사용자 범위의 것은 도구의 설정 폴더부터(`~/.claude/settings.json`, 설정 폴더를 `CLAUDE_CONFIG_DIR`로 옮겼으면 `$CLAUDE_CONFIG_DIR/settings.json`), 프로젝트의 것은 과제 2의 프로젝트 이름부터(`app/.claude/settings.json`) 적고 나눔표는 `/`다. 링크를 푼 실제 경로가 아니라 스캐너가 찾은 경로로 만든다. 실제 경로는 두 뿌리 밖일 수 있다.
- `SetupProblem`은 주인에 따라 위치가 있거나 없는 꼴로 바꾼다. 사용자 문제가 위치 없이 만들어지면 타입 검사가 잡는다.
- S3가 세는 것과 목록은 한 함수(`countedProblems`)에서 나온다. 범위(사용자가 고치는 셋팅만)와 같은 실제 파일을 한 번 세는 것, 차례(도구, 그 안에서 스캐너의 차례)가 S3 그대로이고 위치로 다시 정렬하지 않는다. S3의 값과 근거 숫자는 바뀌지 않는다.
- 요약에는 싣지 않는다(설계 12.3, 19.1).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/metrics-setup.test.ts`(찾을 곳 1/2):

```ts
describe("S3 설정이 깨지지 않았다", () => {
  const problem = (kind: SetupProblem["kind"], path: string, input: Partial<SetupProblem> = {}): SetupProblem => ({ kind, owner: "user", path, realPath: path, ...input });
  it("사용자가 직접 고치는 셋팅의 문제만 센다", () => {
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 1/2):

```ts
describe("S3 설정이 깨지지 않았다", () => {
  /** 사용자의 문제는 위치를 경로에서 만들고, 그 밖의 주인은 위치가 없다 */
  const problem = (kind: SetupProblem["kind"], path: string, input: { owner?: SetupProblem["owner"]; realPath?: string | null } = {}): SetupProblem => {
    const base = { kind, path, realPath: input.realPath === undefined ? path : input.realPath };
    return input.owner === undefined || input.owner === "user" ? { ...base, owner: "user", place: `~/${path.split("/").slice(-2).join("/")}` } : { ...base, owner: input.owner, place: null };
  };
  it("사용자가 직접 고치는 셋팅의 문제만 센다", () => {
```

`test/core/metrics-setup.test.ts`(찾을 곳 2/2):

```ts
  });
  it("같은 실제 파일이나 폴더는 한 번만 센다", () => {
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 2/2):

```ts
  });
  it("센 문제의 목록은 도구의 차례, 그 안에서는 스캐너의 차례이고 같은 실제 파일은 처음 본 것 하나다. 위치는 문제의 위치 그대로다", () => {
    const claude = tool({ problems: [problem("unparsable", "/work/a/.mcp.json"), problem("noFrontmatter", "/home/u/.claude/skills/x", { realPath: "/shared/x" }), problem("noFrontmatter", "/home/u/.claude/plugins/p/skills/y", { owner: "plugin" })] });
    const codex = tool({ problems: [problem("noFrontmatter", "/home/u/.codex/skills/x", { realPath: "/shared/x" }), problem("unparsable", "/home/u/.codex/config.toml")] }, { id: "codex" });
    expect(mergedSetupRules([claude, codex]).setupProblems).toEqual([
      { tool: "claude-code", kind: "unparsable", place: "~/a/.mcp.json" },
      { tool: "claude-code", kind: "noFrontmatter", place: "~/skills/x" },
      { tool: "codex", kind: "unparsable", place: "~/.codex/config.toml" },
    ]);
    expect(mergedSetupRules([claude, codex]).S3).toMatchObject({ value: 3, evidence: { problems: 3 } });
  });
  it("같은 실제 파일이나 폴더는 한 번만 센다", () => {
```

`test/core/result-assemble.test.ts`(찾을 곳 1/3):

```ts
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { mcpServer, project } from "../helpers/facts.ts";
```

`test/core/result-assemble.test.ts`(바꾼 뒤 1/3):

```ts
import type { CollectedTool } from "../../src/core/result/tools.ts";
import type { SetupProblem } from "../../src/scan/types.ts";
import { mcpServer, project } from "../helpers/facts.ts";
```

`test/core/result-assemble.test.ts`(찾을 곳 2/3):

```ts
    const result = checkupResult(input);
    expect(Object.keys(result.details)).toEqual(["safeguards", "missingInstructions", "worstOverlap", "unjudgedServers"]);
    expect(result.details.safeguards).toEqual(input.evaluation.safeguards);
```

`test/core/result-assemble.test.ts`(바꾼 뒤 2/3):

```ts
    const result = checkupResult(input);
    expect(Object.keys(result.details)).toEqual(["safeguards", "missingInstructions", "worstOverlap", "unjudgedServers", "setupProblems"]);
    expect(result.details.safeguards).toEqual(input.evaluation.safeguards);
```

`test/core/result-assemble.test.ts`(찾을 곳 3/3):

```ts

  it("JSON으로 바꿨다가 되살려도 같다. 값이 없는 자리는 null이다", () => {
```

`test/core/result-assemble.test.ts`(바꾼 뒤 3/3):

```ts

  it("따로 둔 자리에 S3가 센 문제의 도구, 종류, 위치를 S3가 센 차례대로 싣는다. 절대 경로는 싣지 않는다", () => {
    const problems: SetupProblem[] = [
      { kind: "unparsable", owner: "user", path: "/home/u/.claude/settings.json", realPath: "/home/u/.claude/settings.json", place: "~/.claude/settings.json" },
      { kind: "noFrontmatter", owner: "user", path: "/work/app/.claude/skills/x", realPath: "/shared/x", place: "app/.claude/skills/x" },
      { kind: "noFrontmatter", owner: "user", path: "/home/u/.claude/skills/x", realPath: "/shared/x", place: "~/.claude/skills/x" },
      { kind: "noFrontmatter", owner: "plugin", path: "/home/u/.claude/plugins/p/skills/y", realPath: null, place: null },
    ];
    const result = checkupResult(resultInput({ setup: { problems } }));
    expect(result.details.setupProblems).toEqual([
      { tool: "claude-code", kind: "unparsable", place: "~/.claude/settings.json" },
      { tool: "claude-code", kind: "noFrontmatter", place: "app/.claude/skills/x" },
    ]);
    expect(result.findings.find((finding) => finding.ruleId === "S3")!.evidence).toMatchObject({ problems: 2 });
    expect(JSON.stringify(result.details.setupProblems)).not.toMatch(/\/home|\/work|\/shared/);
  });

  it("JSON으로 바꿨다가 되살려도 같다. 값이 없는 자리는 null이다", () => {
```

`test/core/result-notices-setup.test.ts`(찾을 곳):

```ts
          { kind: "unparsable", owner: "tool", path: `${HOME}/../.claude.json`, realPath: null },
          { kind: "noFrontmatter", owner: "plugin", path: "/p/b/skills/x", realPath: null },
          { kind: "danglingLink", owner: "plugin", path: "/p/a/skills/y", realPath: null },
          { kind: "noFrontmatter", owner: "user", path: `${HOME}/skills/z`, realPath: null },
```

`test/core/result-notices-setup.test.ts`(바꾼 뒤):

```ts
          { kind: "unparsable", owner: "tool", path: `${HOME}/../.claude.json`, realPath: null, place: null },
          { kind: "noFrontmatter", owner: "plugin", path: "/p/b/skills/x", realPath: null, place: null },
          { kind: "danglingLink", owner: "plugin", path: "/p/a/skills/y", realPath: null, place: null },
          { kind: "noFrontmatter", owner: "user", path: `${HOME}/skills/z`, realPath: null, place: "~/.claude/skills/z" },
```

`test/helpers/personas.ts`(찾을 곳):

```ts
  const problems: SetupProblem[] = Array.from({ length: p.problems }, (_, i) => ({ kind: "noFrontmatter", owner: "user", path: `/home/u/.claude/skills/broken${i + 1}`, realPath: `/home/u/.claude/skills/broken${i + 1}` }));
```

`test/helpers/personas.ts`(바꾼 뒤):

```ts
  const problems: SetupProblem[] = Array.from({ length: p.problems }, (_, i) => ({ kind: "noFrontmatter", owner: "user", path: `/home/u/.claude/skills/broken${i + 1}`, realPath: `/home/u/.claude/skills/broken${i + 1}`, place: `~/.claude/skills/broken${i + 1}` }));
```

`test/scan/claude.test.ts`(찾을 곳 1/3):

```ts
    expect(facts.problems).toEqual([
      { kind: "danglingLink", owner: "user", path: join(input.homedir, ".claude", "skills", "gone"), realPath: null },
      { kind: "noFrontmatter", owner: "user", path: nofront, realPath: normalizePath(await realpath(nofront)) },
    ]);
```

`test/scan/claude.test.ts`(바꾼 뒤 1/3):

```ts
    expect(facts.problems).toEqual([
      { kind: "danglingLink", owner: "user", path: join(input.homedir, ".claude", "skills", "gone"), realPath: null, place: "~/.claude/skills/gone" },
      { kind: "noFrontmatter", owner: "user", path: nofront, realPath: normalizePath(await realpath(nofront)), place: "~/.claude/skills/nofront" },
    ]);
```

`test/scan/claude.test.ts`(찾을 곳 2/3):

```ts

  it("같은 원본을 두 곳에서 링크로 걸었으면 문제의 경로는 둘이고 실제 경로는 하나다(S3은 한 번만 센다)", async () => {
```

`test/scan/claude.test.ts`(바꾼 뒤 2/3):

```ts

  it("사용자의 문제에는 결과 화면에 보일 위치를 붙인다. 프로젝트의 것은 프로젝트 폴더 이름부터, 사용자 범위의 것은 설정 폴더부터이고 그 밖의 주인은 위치가 없다", async () => {
    const proj = join(root, "work", "proj");
    await put(join(proj, ".claude", "settings.json"), "{ 깨짐");
    await put(join(proj, ".claude", "settings.local.json"), "{ 깨짐");
    await put(join(proj, ".mcp.json"), "{ 깨짐");
    await put(join(proj, ".claude", "skills", "bare", "SKILL.md"), "# 머리말 없음\n");
    await put(join(root, "managed", "managed-settings.json"), "{ 깨짐");
    const scanned = await scanClaudeSetup(input);
    const places = scanned.problems.map((p) => [p.owner, p.place]);
    expect(places).toEqual(expect.arrayContaining([
      ["user", "proj/.claude/settings.json"],
      ["user", "proj/.claude/settings.local.json"],
      ["user", "proj/.mcp.json"],
      ["user", "proj/.claude/skills/bare"],
      ["user", "~/.claude/skills/nofront"],
      ["managed", null],
    ]));
    // 위치에는 사용자 이름이 든 홈 경로나 프로젝트의 위 폴더가 없다
    for (const problem of scanned.problems) if (problem.place !== null) expect(problem.place).not.toContain(root.replace(/\\/g, "/"));
  });

  it("설정 폴더를 CLAUDE_CONFIG_DIR로 옮겼으면 사용자 범위의 위치를 그 이름부터 적는다. 이름이 같은 프로젝트는 차례 번호가 붙은 이름부터 적는다", async () => {
    const config = join(root, "elsewhere", "claude-config");
    await put(join(config, "settings.json"), "{ 깨짐");
    const first = join(root, "a", "app");
    const second = join(root, "b", "app");
    for (const dir of [first, second]) {
      await put(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
      await put(join(dir, ".mcp.json"), "{ 깨짐");
    }
    const scanned = await scanClaudeSetup({ ...input, env: { CLAUDE_CONFIG_DIR: config }, cwds: [first, second] });
    expect(scanned.problems.filter((p) => p.owner === "user").map((p) => p.place).sort()).toEqual(["$CLAUDE_CONFIG_DIR/settings.json", "app (2)/.mcp.json", "app/.mcp.json"]);
  });

  it("같은 원본을 두 곳에서 링크로 걸었으면 문제의 경로는 둘이고 실제 경로는 하나다(S3은 한 번만 센다)", async () => {
```

`test/scan/claude.test.ts`(찾을 곳 3/3):

```ts
    expect(broken.problems.filter((p) => p.kind === "unparsable")).toEqual([
      { kind: "unparsable", owner: "tool", path: join(input.homedir, ".claude.json"), realPath: normalizePath(await realpath(join(input.homedir, ".claude.json"))) },
    ]);
```

`test/scan/claude.test.ts`(바꾼 뒤 3/3):

```ts
    expect(broken.problems.filter((p) => p.kind === "unparsable")).toEqual([
      { kind: "unparsable", owner: "tool", path: join(input.homedir, ".claude.json"), realPath: normalizePath(await realpath(join(input.homedir, ".claude.json"))), place: null },
    ]);
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/metrics-setup.test.ts test/core/result-assemble.test.ts test/core/result-notices-setup.test.ts test/scan/claude.test.ts`
Expected: FAIL. 시험 7개가 실패한다. 문제의 위치(`place`)를 기대하는 스캐너 시험 4개, 센 문제 목록을 기대하는 S3 시험 1개와 결과 조립 시험 2개다. `result-notices-setup`은 자료 모양만 맞춘 것이라 통과한다.

- [ ] **Step 3: 구현한다**

`src/core/evaluate.ts`(찾을 곳 1/4):

```ts
import { intensityRules } from "./metrics/intensity.ts";
import { highestMainVersion, mergedSetupRules, setupToolRules, type ToolSafeguard, type ToolSetup } from "./metrics/setup.ts";
import { usageRules } from "./metrics/usage.ts";
```

`src/core/evaluate.ts`(바꾼 뒤 1/4):

```ts
import { intensityRules } from "./metrics/intensity.ts";
import { highestMainVersion, mergedSetupRules, setupToolRules, type CountedProblem, type ToolSafeguard, type ToolSetup } from "./metrics/setup.ts";
import { usageRules } from "./metrics/usage.ts";
```

`src/core/evaluate.ts`(찾을 곳 2/4):

```ts
  worstOverlap: WorstOverlap | null;
  /** 점수 구간에 주 세션이 있었던 프로젝트 */
```

`src/core/evaluate.ts`(바꾼 뒤 2/4):

```ts
  worstOverlap: WorstOverlap | null;
  /** S3가 센 문제(위치와 종류) */
  setupProblems: CountedProblem[];
  /** 점수 구간에 주 세션이 있었던 프로젝트 */
```

`src/core/evaluate.ts`(찾을 곳 3/4):

```ts

  const { S1, S2, S3, safeguards } = mergedSetupRules(setups);
  const { F3, F4, F6, missingInstructions, worstOverlap } = mergedFitRules(setups, usage);
```

`src/core/evaluate.ts`(바꾼 뒤 3/4):

```ts

  const { S1, S2, S3, safeguards, setupProblems } = mergedSetupRules(setups);
  const { F3, F4, F6, missingInstructions, worstOverlap } = mergedFitRules(setups, usage);
```

`src/core/evaluate.ts`(찾을 곳 4/4):

```ts
    worstOverlap,
    projects: usage,
```

`src/core/evaluate.ts`(바꾼 뒤 4/4):

```ts
    worstOverlap,
    setupProblems,
    projects: usage,
```

`src/core/metrics/setup.ts`(찾을 곳 1/6):

```ts
function s3(tools: readonly ToolSetup[]): Measurement {
  const counts = { danglingLinks: 0, noFrontmatter: 0, unparsable: 0 };
```

`src/core/metrics/setup.ts`(바꾼 뒤 1/6):

```ts
/** S3가 센 문제 하나. 결과 화면이 그 위치를 보인다(설계 「3단계 계획 전 결정」의 4번) */
export interface CountedProblem {
  tool: ToolId;
  kind: SetupProblem["kind"];
  /** 도구의 설정 폴더나 프로젝트 폴더 이름부터의 위치(SetupProblem.place). 절대 경로가 아니다 */
  place: string;
}

/**
 * S3가 세는 문제. 사용자가 직접 고치는 셋팅만 세고(플러그인 안의 것, 관리 정책 파일, 도구가 쓰는 상태 파일은 세지 않는다), 같은 실제 파일은 처음 본 것 하나다.
 * 차례는 도구의 차례, 그 안에서는 스캐너의 차례(경로, 종류, 주인)이고 위치로 다시 정렬하지 않는다
 */
export function countedProblems(tools: readonly ToolSetup[]): CountedProblem[] {
  const counted: CountedProblem[] = [];
```

`src/core/metrics/setup.ts`(찾을 곳 2/6):

```ts
      // 사용자가 직접 고치는 셋팅만 센다. 플러그인 안의 것, 관리 정책 파일, 도구가 쓰는 상태 파일은 세지 않는다
```

`src/core/metrics/setup.ts`(바꾼 뒤 2/6): 찾은 줄을 지운다.

`src/core/metrics/setup.ts`(찾을 곳 3/6):

```ts
      const place = problem.realPath ?? problem.path;
      if (seen.has(place)) continue;
      seen.add(place);
      counts[PROBLEM_COUNTERS[problem.kind]]++;
```

`src/core/metrics/setup.ts`(바꾼 뒤 3/6):

```ts
      const at = problem.realPath ?? problem.path;
      if (seen.has(at)) continue;
      seen.add(at);
      counted.push({ tool: tool.tool, kind: problem.kind, place: problem.place });
```

`src/core/metrics/setup.ts`(찾을 곳 4/6):

```ts
  return scored(seen.size, { danglingLinks: counts.danglingLinks, noFrontmatter: counts.noFrontmatter, problems: seen.size, unparsable: counts.unparsable });
```

`src/core/metrics/setup.ts`(바꾼 뒤 4/6):

```ts
  return counted;
}

function s3(problems: readonly CountedProblem[]): Measurement {
  const counts = { danglingLinks: 0, noFrontmatter: 0, unparsable: 0 };
  for (const problem of problems) counts[PROBLEM_COUNTERS[problem.kind]]++;
  return scored(problems.length, { danglingLinks: counts.danglingLinks, noFrontmatter: counts.noFrontmatter, problems: problems.length, unparsable: counts.unparsable });
```

`src/core/metrics/setup.ts`(찾을 곳 5/6):

```ts
/** 도구를 합쳐서 재는 셋팅 규칙. tools는 점수에 넣는 도구다. safeguards는 S2의 근거이고 도구의 차례 그대로다. */
export function mergedSetupRules(tools: readonly ToolSetup[]): Record<"S1" | "S2" | "S3", Measurement> & { safeguards: ToolSafeguard[] } {
```

`src/core/metrics/setup.ts`(바꾼 뒤 5/6):

```ts
/** 도구를 합쳐서 재는 셋팅 규칙. tools는 점수에 넣는 도구다. safeguards는 S2의 근거이고 도구의 차례 그대로다. setupProblems는 S3가 센 문제다 */
export function mergedSetupRules(tools: readonly ToolSetup[]): Record<"S1" | "S2" | "S3", Measurement> & { safeguards: ToolSafeguard[]; setupProblems: CountedProblem[] } {
```

`src/core/metrics/setup.ts`(찾을 곳 6/6):

```ts
  return { S1: s1(tools), S2: s2(tools, safeguards), S3: s3(tools), safeguards };
```

`src/core/metrics/setup.ts`(바꾼 뒤 6/6):

```ts
  const setupProblems = countedProblems(tools);
  return { S1: s1(tools), S2: s2(tools, safeguards), S3: s3(setupProblems), safeguards, setupProblems };
```

`src/core/result/assemble.ts`(찾을 곳 1/3):

```ts
import type { MissingInstructions, WorstOverlap } from "../metrics/fit.ts";
import type { ToolSafeguard } from "../metrics/setup.ts";
import type { AxisScore, Finding, Overall, ToolRuleId, ToolValue } from "../scoreboard.ts";
```

`src/core/result/assemble.ts`(바꾼 뒤 1/3):

```ts
import type { MissingInstructions, WorstOverlap } from "../metrics/fit.ts";
import type { CountedProblem, ToolSafeguard } from "../metrics/setup.ts";
import type { AxisScore, Finding, Overall, ToolRuleId, ToolValue } from "../scoreboard.ts";
```

`src/core/result/assemble.ts`(찾을 곳 2/3):

```ts
    unjudgedServers: UnjudgedServer[];
  };
```

`src/core/result/assemble.ts`(바꾼 뒤 2/3):

```ts
    unjudgedServers: UnjudgedServer[];
    /** S3가 센 문제의 도구, 종류, 위치(절대 경로가 아니다). 결과 화면이 S3 항목에 보인다 */
    setupProblems: CountedProblem[];
  };
```

`src/core/result/assemble.ts`(찾을 곳 3/3):

```ts
  const coverageByTool = new Map(input.tools.map((tool) => [tool.tool, tool.coverage]));
  const details = { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation) };
  const findings = evaluation.findings.map((finding): ResultFinding => {
```

`src/core/result/assemble.ts`(바꾼 뒤 3/3):

```ts
  const coverageByTool = new Map(input.tools.map((tool) => [tool.tool, tool.coverage]));
  const details = { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation), setupProblems: evaluation.setupProblems };
  const findings = evaluation.findings.map((finding): ResultFinding => {
```

`src/scan/claude.ts`(찾을 곳 1/10):

```ts
// Claude Code의 지금 셋팅을 읽어 셋팅 사실로 낸다. 설정 층·지침·스킬·플러그인·MCP 서버·권한과 훅의 겉모양을 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 7.2, 10, 11.3, 19.1)
import { basename, join } from "node:path";
import { claudeHome, normalizePath } from "../adapters/claude/locate.ts";
import { claudeJsonPath, readClaudeJson, type ClaudeJsonProject } from "./claude-json.ts";
```

`src/scan/claude.ts`(바꾼 뒤 1/10):

```ts
// Claude Code의 지금 셋팅을 읽어 셋팅 사실로 낸다. 설정 층·지침·스킬·플러그인·MCP 서버·권한과 훅의 겉모양을 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 7.2, 10, 11.3, 19.1)
import { basename, join, relative } from "node:path";
import { claudeHome, normalizePath } from "../adapters/claude/locate.ts";
import { claudeJsonPath, readClaudeJson, type ClaudeJsonProject } from "./claude-json.ts";
```

`src/scan/claude.ts`(찾을 곳 2/10):

```ts
  return names;
}

export async function scanClaudeSetup(input: ScanInput): Promise<ClaudeSetupFacts> {
```

`src/scan/claude.ts`(바꾼 뒤 2/10):

```ts
  return names;
}
/** 실제 경로를 붙이기 전의 문제. 주인에 따라 위치가 있거나 없다 */
type ProblemDraft = SetupProblem extends infer P ? (P extends SetupProblem ? Omit<P, "realPath"> : never) : never;
/** 경로의 나눔표를 /로 바꾼다 */
const slashed = (path: string): string => path.replace(/\\/g, "/");

export async function scanClaudeSetup(input: ScanInput): Promise<ClaudeSetupFacts> {
```

`src/scan/claude.ts`(찾을 곳 3/10):

```ts
  const managedView = viewOf(managedLayer.value);
  // 실제 경로는 마지막에 한 번에 붙인다
  const problems: Omit<SetupProblem, "realPath">[] = [];
  const unparsable = (layer: SettingsLayer, owner: SetupProblem["owner"]): void => {
    for (const part of layer.parts) if (part.status === "unparsable") problems.push({ kind: "unparsable", owner, path: part.path });
  };
  unparsable(userLayer, "user");
  unparsable(managedLayer, "managed");
  // .claude.json은 도구가 수시로 다시 쓰는 상태 파일이다. 주인을 tool로 적어 사용자의 셋팅과 가른다
  if (claudeJson.status === "unparsable") problems.push({ kind: "unparsable", owner: "tool", path: claudeJsonFile });

  // 프로젝트와 맥락
```

`src/scan/claude.ts`(바꾼 뒤 3/10):

```ts
  const managedView = viewOf(managedLayer.value);
  // 실제 경로는 마지막에 한 번에 붙인다
  const problems: ProblemDraft[] = [];
  /** 사용자 범위의 셋팅이 있는 곳(도구의 설정 폴더)부터의 위치. 설정 폴더를 환경 변수로 옮겼으면 그 이름으로 적는다 */
  const configPlace = (path: string): string => `${input.env.CLAUDE_CONFIG_DIR?.trim() ? "$CLAUDE_CONFIG_DIR" : "~/.claude"}/${slashed(relative(home, path))}`;
  const unparsable = (layer: SettingsLayer, owner: Exclude<SetupProblem["owner"], "user">): void => {
    for (const part of layer.parts) if (part.status === "unparsable") problems.push({ kind: "unparsable", owner, path: part.path, place: null });
  };
  const unparsableUser = (layer: SettingsLayer, placeOf: (path: string) => string): void => {
    for (const part of layer.parts) if (part.status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: part.path, place: placeOf(part.path) });
  };
  unparsableUser(userLayer, configPlace);
  unparsable(managedLayer, "managed");
  // .claude.json은 도구가 수시로 다시 쓰는 상태 파일이다. 주인을 tool로 적어 사용자의 셋팅과 가른다
  if (claudeJson.status === "unparsable") problems.push({ kind: "unparsable", owner: "tool", path: claudeJsonFile, place: null });

  // 프로젝트와 맥락
```

`src/scan/claude.ts`(찾을 곳 4/10):

```ts
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  const projectNames = projectNamesOf(refs);
  for (const ref of active) {
    const project = await readLayer(join(ref.root, ".claude", "settings.json"));
    const local = await readLayer(join(ref.root, ".claude", "settings.local.json"));
    unparsable(project, "user");
    unparsable(local, "user");
    projectLayers.set(ref.normRoot, { project, local });
    const projectView = viewOf(project.value);
```

`src/scan/claude.ts`(바꾼 뒤 4/10):

```ts
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  const projectNames = projectNamesOf(refs);
  /** 프로젝트 폴더 이름(차례 번호가 붙은 것)부터의 위치. 결과 화면이 절대 경로 대신 보인다(설계 19.1) */
  const projectPlace = (ref: { root: string; normRoot: string }, path: string): string => `${projectNames.get(ref.normRoot)!}/${slashed(relative(ref.root, path))}`;
  for (const ref of active) {
    const project = await readLayer(join(ref.root, ".claude", "settings.json"));
    const local = await readLayer(join(ref.root, ".claude", "settings.local.json"));
    unparsableUser(project, (path) => projectPlace(ref, path));
    unparsableUser(local, (path) => projectPlace(ref, path));
    projectLayers.set(ref.normRoot, { project, local });
    const projectView = viewOf(project.value);
```

`src/scan/claude.ts`(찾을 곳 5/10):

```ts
    });
  };
  const addOwnSkills = (scan: SkillRootScan, scope: "user" | "project", projectRoot: string | null, scopeContexts: readonly Context[]): void => {
    for (const path of scan.danglingLinks) problems.push({ kind: "danglingLink", owner: "user", path });
    unreadableDirs.push(...scan.unreadableDirs);
    if (scan.unreadableDirs.length > 0) {
```

`src/scan/claude.ts`(바꾼 뒤 5/10):

```ts
    });
  };
  const addOwnSkills = (scan: SkillRootScan, scope: "user" | "project", projectRoot: string | null, scopeContexts: readonly Context[], placeOf: (path: string) => string): void => {
    for (const path of scan.danglingLinks) problems.push({ kind: "danglingLink", owner: "user", path, place: placeOf(path) });
    unreadableDirs.push(...scan.unreadableDirs);
    if (scan.unreadableDirs.length > 0) {
```

`src/scan/claude.ts`(찾을 곳 6/10):

```ts
      const recordNames = skillRecordNames(folder.dirName, folder.declaredName, null);
      const modes = scopeContexts.map((context) => overrideIn(context, recordNames));
      if (folder.readable && !folder.hasFrontmatter) problems.push({ kind: "noFrontmatter", owner: "user", path: folder.path });
      addSkill(folder, {
        scope,
```

`src/scan/claude.ts`(바꾼 뒤 6/10):

```ts
      const recordNames = skillRecordNames(folder.dirName, folder.declaredName, null);
      const modes = scopeContexts.map((context) => overrideIn(context, recordNames));
      if (folder.readable && !folder.hasFrontmatter) problems.push({ kind: "noFrontmatter", owner: "user", path: folder.path, place: placeOf(folder.path) });
      addSkill(folder, {
        scope,
```

`src/scan/claude.ts`(찾을 곳 7/10):

```ts
    }
  };
  addOwnSkills(userSkillScan, "user", null, everyContext);
  for (const ref of active) addOwnSkills(projectSkillScans.get(ref.normRoot)!, "project", ref.normRoot, [contexts.get(ref.normRoot)!]);

  const plugins: PluginFact[] = [];
  const mcpServers: Omit<McpFact, "installKey">[] = [];
  for (const plugin of allPlugins) {
    if (plugin.manifest === "unparsable") problems.push({ kind: "unparsable", owner: "plugin", path: join(plugin.installPath, ".claude-plugin", "plugin.json") });
    const enabledIn = pluginContexts(plugin).filter((context) => pluginEnabledIn(context, plugin.id, plugin.defaultEnabled));
    // 훅이 든 플러그인: 구성에 훅이 있다. 돌지 않는 꼴(경로로 적은 마켓 항목의 훅)도 든다(설계 10 「마켓 항목」, 11.3 E5 ⑤)
```

`src/scan/claude.ts`(바꾼 뒤 7/10):

```ts
    }
  };
  addOwnSkills(userSkillScan, "user", null, everyContext, configPlace);
  for (const ref of active) addOwnSkills(projectSkillScans.get(ref.normRoot)!, "project", ref.normRoot, [contexts.get(ref.normRoot)!], (path) => projectPlace(ref, path));

  const plugins: PluginFact[] = [];
  const mcpServers: Omit<McpFact, "installKey">[] = [];
  for (const plugin of allPlugins) {
    if (plugin.manifest === "unparsable") problems.push({ kind: "unparsable", owner: "plugin", path: join(plugin.installPath, ".claude-plugin", "plugin.json"), place: null });
    const enabledIn = pluginContexts(plugin).filter((context) => pluginEnabledIn(context, plugin.id, plugin.defaultEnabled));
    // 훅이 든 플러그인: 구성에 훅이 있다. 돌지 않는 꼴(경로로 적은 마켓 항목의 훅)도 든다(설계 10 「마켓 항목」, 11.3 E5 ⑤)
```

`src/scan/claude.ts`(찾을 곳 8/10):

```ts
      for (const root of plugin.skillRoots) {
        const scan = await scanSkillPath(root);
        for (const path of scan.danglingLinks) problems.push({ kind: "danglingLink", owner: "plugin", path });
        unreadableDirs.push(...scan.unreadableDirs);
        if (scan.unreadableDirs.length > 0) unreadableSkillPlaces.plugins.push(plugin.id);
```

`src/scan/claude.ts`(바꾼 뒤 8/10):

```ts
      for (const root of plugin.skillRoots) {
        const scan = await scanSkillPath(root);
        for (const path of scan.danglingLinks) problems.push({ kind: "danglingLink", owner: "plugin", path, place: null });
        unreadableDirs.push(...scan.unreadableDirs);
        if (scan.unreadableDirs.length > 0) unreadableSkillPlaces.plugins.push(plugin.id);
```

`src/scan/claude.ts`(찾을 곳 9/10):

```ts
          const name = `${plugin.name}:${folder.dirName}`;
          skillNames.push(name);
          if (folder.readable && !folder.hasFrontmatter) problems.push({ kind: "noFrontmatter", owner: "plugin", path: folder.path });
          addSkill(folder, {
            scope: "plugin",
```

`src/scan/claude.ts`(바꾼 뒤 9/10):

```ts
          const name = `${plugin.name}:${folder.dirName}`;
          skillNames.push(name);
          if (folder.readable && !folder.hasFrontmatter) problems.push({ kind: "noFrontmatter", owner: "plugin", path: folder.path, place: null });
          addSkill(folder, {
            scope: "plugin",
```

`src/scan/claude.ts`(찾을 곳 10/10):

```ts
    const status: FileStatus = read.status !== "ok" ? read.status : entries === null ? "unparsable" : "ok";
    mcpJsonStatus.set(ref.normRoot, status);
    if (status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: file });
    for (const entry of entries ?? []) {
      const approved = projectServerApproved(context.mcp, entry.name) && mcpAllowed(context.mcp, mcpRecordNames(entry.name, null), entry.definition);
```

`src/scan/claude.ts`(바꾼 뒤 10/10):

```ts
    const status: FileStatus = read.status !== "ok" ? read.status : entries === null ? "unparsable" : "ok";
    mcpJsonStatus.set(ref.normRoot, status);
    if (status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: file, place: projectPlace(ref, file) });
    for (const entry of entries ?? []) {
      const approved = projectServerApproved(context.mcp, entry.name) && mcpAllowed(context.mcp, mcpRecordNames(entry.name, null), entry.definition);
```

`src/scan/types.ts`(찾을 곳 1/2):

```ts
/** S3의 재료. 누구의 파일인지를 붙인다. 규칙이 어느 것을 셀지는 설계 11.3 S3가 정한다 */
export interface SetupProblem {
  kind: "unparsable" | "noFrontmatter" | "danglingLink";
  /** user는 사용자가 고치는 셋팅(설정 층·.mcp.json·사용자와 프로젝트 스킬), managed는 관리 정책, plugin은 플러그인 안, tool은 도구가 쓰는 상태 파일(.claude.json) */
  owner: "user" | "managed" | "plugin" | "tool";
  path: string;
```

`src/scan/types.ts`(바꾼 뒤 1/2):

```ts
/** S3의 재료. 누구의 파일인지를 붙인다. 규칙이 어느 것을 셀지는 설계 11.3 S3가 정한다 */
export type SetupProblem = {
  kind: "unparsable" | "noFrontmatter" | "danglingLink";
  path: string;
```

`src/scan/types.ts`(찾을 곳 2/2):

```ts
  realPath: string | null;
}

```

`src/scan/types.ts`(바꾼 뒤 2/2):

```ts
  realPath: string | null;
} & (
  | {
      /** 사용자가 고치는 셋팅(설정 층·.mcp.json·사용자와 프로젝트 스킬) */
      owner: "user";
      /**
       * 결과 화면에 보일 위치. 절대 경로 대신, 사용자 범위의 것은 도구의 설정 폴더부터(~/.claude/… 또는 $CLAUDE_CONFIG_DIR/…), 프로젝트의 것은 프로젝트 폴더 이름부터 적고 나눔표는 /다
       * (설계 19.1, 「3단계 계획 전 결정」의 4번)
       */
      place: string;
    }
  | {
      /** managed는 관리 정책, plugin은 플러그인 안, tool은 도구가 쓰는 상태 파일(.claude.json)이다. S3가 세지 않아 위치를 적지 않는다 */
      owner: "managed" | "plugin" | "tool";
      place: null;
    }
);

```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/claude.test.ts test/core/metrics-setup.test.ts test/core/result-notices-setup.test.ts test/core/result-assemble.test.ts test/core/personas.test.ts test/core/purity.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 6개, 시험 218개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/metrics-setup.test.ts test/core/result-assemble.test.ts test/core/result-notices-setup.test.ts test/helpers/personas.ts test/scan/claude.test.ts src/core/evaluate.ts src/core/metrics/setup.ts src/core/result/assemble.ts src/scan/claude.ts src/scan/types.ts
git commit -m "feat: S3가 센 설정 문제의 위치를 평가 결과에 실음"
```

---

### Task 5: AQ를 내지 않았으면 요약의 먼저 고칠 것을 비우기

**Files:**
- Modify: `test/core/result-summary.test.ts`
- Modify: `skills/aq/scripts/aq.mjs`
- Modify: `src/core/result/summary.ts`

**Interfaces:**
- Consumes: 3부의 `checkupSummary`(`src/core/result/summary.ts`), 4부의 `resultText`의 빈 목록 문장(`src/core/copy/grades.ts`).
- Produces: AQ가 `null`이면 `CheckupSummary.fixFirst`와 `text.fixFirst`가 빈 목록인 요약. 칸은 그대로다. `text.noFixFirst`는 결과의 `noRepairs` 그대로다. 묶은 실행 파일 `skills/aq/scripts/aq.mjs`를 원본에서 다시 만든다.

설계 「3단계 계획 전 결정」의 6번과 11.5, 12.3, 15다.

- AQ가 없는데 예상 효과를 앞세우지 않는다. 기록이 없는 빈 홈에서 "쓰는 날 늘리기 · 강도 최대 +100"이 먼저 고칠 것으로 나오던 것이다. 결과 화면(2부)도 같이 숨긴다.
- 칸을 지우지 않고 비운다(2단계 3부 결정 18번의 요약 모양을 지킨다). 빈 목록의 문장은 결과의 것 그대로라서 정비할 것이 실제로 있으면 `null`이다. 정비할 것을 숨긴 것을 "지금은 고칠 것이 없습니다"로 바꾸지 않는다.
- 터미널에서 그 줄을 옮기지 않는 것은 4단계의 스킬 틀이 따른다(설계 15).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/result-summary.test.ts`(찾을 곳):

```ts

  it("가장 잘하는 것이나 먼저 고칠 것이 없으면 빈 목록의 문장을 싣는다", () => {
```

`test/core/result-summary.test.ts`(바꾼 뒤):

```ts

  it("AQ를 내지 않았으면 먼저 고칠 것의 칸은 두고 숫자 자료와 문장을 비운다. 정비할 것이 있으므로 빈 목록의 문장도 없다(설계 12.3)", () => {
    const input = evaluationInput([claudeTool({ sessions: [{ days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }] })]);
    const result = checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    expect(result.score.aq).toBeNull();
    expect(result.findings.some((finding) => finding.category === "repair")).toBe(true);
    const summary = checkupSummary(result, null);
    expect(Object.keys(summary)).toContain("fixFirst");
    expect(summary.fixFirst).toEqual([]);
    expect(summary.text.fixFirst).toEqual([]);
    expect(summary.text.noFixFirst).toBeNull();
    // 같은 결과에서 AQ만 냈다고 바꾸면 먼저 고칠 것이 나온다
    const scored = { ...result, score: { ...result.score, aq: 70, grade: "B", tier: 3, withheld: [] } as CheckupResult["score"] };
    expect(checkupSummary(scored, null).fixFirst.length).toBeGreaterThan(0);
  });

  it("AQ를 내지 않았고 정비할 것도 없으면 빈 목록의 문장을 그대로 싣는다", () => {
    const base = baseResult();
    const result = { ...base, lang: "ko" as const, score: { ...base.score, aq: null, grade: null, tier: null, withheld: ["too_few_days"] } as CheckupResult["score"], findings: [finding("E1", { category: "average" })] };
    const text = { ...result.text, ko: { ...result.text.ko, noRepairs: "지금은 고칠 것이 없습니다." } };
    expect(checkupSummary({ ...result, text }, null).text).toMatchObject({ fixFirst: [], noFixFirst: "지금은 고칠 것이 없습니다." });
  });

  it("가장 잘하는 것이나 먼저 고칠 것이 없으면 빈 목록의 문장을 싣는다", () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/result-summary.test.ts`
Expected: FAIL. AQ가 없고 정비할 것이 있는 결과에서 먼저 고칠 것이 비어 있기를 기대하는 시험 1개가 실패한다. 정비할 것도 없는 경우의 시험은 지금도 통과한다(빈 목록 문장을 그대로 싣는지 지키는 시험이다).

- [ ] **Step 3: 구현한다**

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

`src/core/result/summary.ts`(찾을 곳):

```ts
  const repairs = result.findings.filter((finding) => finding.category === "repair").slice(0, FIX_FIRST_LIMIT);
```

`src/core/result/summary.ts`(바꾼 뒤):

```ts
  // AQ를 내지 않았으면 먼저 고칠 것을 보이지 않는다. 칸은 그대로 두고 비운다. 빈 목록의 문장(noFixFirst)은 결과의 것 그대로라 정비할 것이 실제로 없을 때만 있다(설계 12.3, 「3단계 계획 전 결정」의 6번)
  const repairs = result.score.aq === null ? [] : result.findings.filter((finding) => finding.category === "repair").slice(0, FIX_FIRST_LIMIT);
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/result-summary.test.ts test/commands/checkup.test.ts test/cli.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 28개.

- [ ] **Step 5: 묶은 실행 파일을 다시 만든다**

원본(`src/`)을 묶어 `skills/aq/scripts/aq.mjs`를 다시 만든다. 과제 1~4의 변경도 함께 묶인다.

Run: `npm run build`
Expected: `묶음 완료: skills/aq/scripts/aq.mjs`.

- [ ] **Step 6: 커밋한다**

```bash
git add test/core/result-summary.test.ts skills/aq/scripts/aq.mjs src/core/result/summary.ts
git commit -m "feat: AQ가 없으면 요약의 먼저 고칠 것을 비움"
```

---

### Task 6: 전체 검사, 이 PC의 기록으로 돌려 보기, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~5의 결과물 전부.
- Produces: `develop`에 병합된 3단계 1부. 3단계 2부(결과 화면)가 기대는 것은 `CheckupResult.details`의 `missingInstructions[].name`, `worstOverlap.name`, `unjudgedServers[].projectName`과 `judgeFrom`, `setupProblems[]`와 AQ가 없을 때 비운 요약이다.

- [ ] **Step 1: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 파일 75개·시험 1,165개 통과(2단계까지의 74개·1,133개에 이 계획이 더한 것), 마지막 줄이 `묶음 검사 통과`. Windows 밖에서는 1부의 시험 1개를 건너뛴다.

- [ ] **Step 2: 묶음을 다시 만들어도 그대로인지 확인한다**

과제 5에서 묶어 커밋한 실행 파일이 원본과 맞는지 본다.

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 3: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS. 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 4: 빈 홈과 이 PC의 기록으로 저장 없이 돌려 본다**

묶은 실행 파일로 점검한다. 상태 폴더에는 쓰지 않는다. 빈 홈은 `USERPROFILE`과 `HOME`을 빈 임시 폴더로 바꿔 돌린다.

Run: `node skills/aq/scripts/aq.mjs checkup --no-save --no-open --lang ko`(빈 홈)
Expected: 종료 코드 0. `summary.aq`가 `null`이고 `summary.fixFirst`와 `summary.text.fixFirst`가 빈 목록이며 칸은 있다. `run.resultPath`의 파일의 `details`가 `safeguards`, `missingInstructions`, `worstOverlap`, `unjudgedServers`, `setupProblems`의 차례다.

Run: `node skills/aq/scripts/aq.mjs checkup --no-save --no-open --lang ko`(이 PC의 홈)
Expected: 종료 코드 0. 결과 파일의 `details`에서 F3과 F4의 프로젝트 자리에 폴더 이름(대소문자 그대로)이 있고, 판정에서 뺀 서버가 있으면 `projectName`과 `judgeFrom`이 있으며, `setupProblems`의 위치에 절대 경로가 없다(`~/.claude`, `$CLAUDE_CONFIG_DIR`, 프로젝트 이름으로 시작한다). 표준 출력에 이 PC의 스킬·서버·프로젝트 이름이 없다. 숫자와 이름은 저장소 밖 작업 기록에만 적고, 결과 파일은 확인한 뒤 지운다.

- [ ] **Step 5: 원장을 고치고 커밋한다**

원장의 3단계 1부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 8에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 3단계 1부 구현 결과를 적음"
```

- [ ] **Step 6: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage3-1.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~5의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 빈 홈과 이 PC의 기록으로 돌린 점검의 모양), 「확인하지 못한 것」이다. 확인하지 못한 것에는 아래를 적는다. macOS와 Linux의 실제 기기에서 돌려 보지 않았다. 실제 claude.ai에서 이름이 겹친 연결과 실제 PC에서 설정 폴더를 옮긴 채 처음부터 끝까지 돈 점검은 보지 않았다. 판정을 시작할 수 있는 날은 지어낸 관측 기록과 세션 기록으로만 확인했다(이 PC에는 지켜보는 중인 서버가 없을 수 있다). 결과 화면이 새 칸을 그려 보는 것은 2부에서 한다. 이 PC의 숫자, 경로, 이름은 넣지 않는다.

```bash
git push -u origin 3단계-1-결과보완
gh pr create --base develop --head 3단계-1-결과보완 --title "feat: 3단계 1부 결과 화면이 쓸 평가 결과 보완" --body-file "$TEMP/aq-pr-stage3-1.md"
```

- [ ] **Step 7: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(3단계 1부 구현 전용, 정독과 실행이 다 무거우므로 둘) 다음을 나눠 맡긴다. 한 짝은 코드 정독이다. 설계 12.1, 12.2, 12.3, 13.1, 19.1과 「3단계 계획 전 결정」의 4·5·6·10번을 이 계획의 코드와 대조하고, 날의 계산과 이름의 차례 번호와 위치 만들기의 경우마다 반례를 따로 지어 본다. 다른 짝은 실행이다. `npm run check`를 다시 돌리고, 지어낸 홈(이름이 같은 프로젝트, 원래 이름에 번호가 든 폴더, 옮긴 설정 폴더, 깨진 설정과 스킬)과 지어낸 관측 기록으로 묶은 실행 파일을 돌려 새 칸을 읽고, 빈 홈의 요약을 본다. 두 짝에게 서로의 결론을 미리 알려 주지 않는다. 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 3단계-1-결과보완 --body-file "$TEMP/aq-pr-stage3-1.md"`).

- [ ] **Step 8: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 사용자가 병합을 주 세션에 맡겼지만, 그것은 묻지 않고 병합할 권한이지 검증을 미룰 근거가 아니어서 Step 7 뒤에 둔다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 3단계-1-결과보완 --merge --subject "feat: 3단계 1부 결과 보완을 develop에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 3단계 1부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 3단계 2부와 그 뒤에 넘기는 것

1부가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 단계 | 1부가 남긴 재료 |
|---|---|---|
| 결과 화면 HTML 한 파일(후보 가의 모양, 고정 글의 두 언어, 접어 둔 "어떻게 쟀나"와 「판정에서 뺀 서버 N개」, 이름 칩, AQ가 없을 때의 화면, 달력과 표, 언어 바꾸기, [정리하기]의 복사), 공유 카드(카드 1), 그림 6장과 장면 고르기, `aq checkup`이 결과 화면을 쓰고 여는 것(`run.reportPath`), 결과 화면에 그리는 칸만 넣는 것(경로 열 가지를 넣지 않음) | 3단계 2부 | `details`의 새 칸, AQ가 없을 때 비운 요약, 4부의 두 언어 문장 |
| "다른 조건이 같으면 N일 뒤의 점검부터 판정할 수 있습니다"와 저장하지 않은 점검의 안내, 날을 정하지 못한 서버의 글 | 3단계 2부 | `unjudgedServers[].judgeFrom`, `run.saved` |
| claude.ai에 연결한 서버를 막는 설정 예(`{ "serverName": "claude.ai …" }`)와 이름이 바뀌거나 ` (N)`이 붙는다는 한 줄 | 3단계 2부 | `unjudgedServers[].name`과 `scope` |
| 터미널에서 AQ가 없을 때 먼저 고칠 것의 줄을 옮기지 않는 것 | 4단계 | 비운 `fixFirst`와 `text.fixFirst` |
| Codex의 설정 폴더 이름(`~/.codex`, 옮겼으면 그 환경 변수)과 Codex 설정 문제의 위치 | 5단계 | `CountedProblem`의 `tool`, 스캐너가 위치를 만드는 꼴 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 12.1, 「3단계 계획 전 결정」 5번 | 지켜보는 중인 서버마다 판정을 시작할 수 있는 날(저장 전제, ㉱의 근거, 날을 모르면 null, 같은 날 다시 점검해도 같음) | 1, 3 |
| 12.2, 13.1, 「3단계 계획 전 결정」 10번 | F3, F4, 판정에서 뺀 서버의 프로젝트 자리에 폴더 이름(대소문자 그대로, 읽는 프로젝트끼리 서로 다르게, 원래 이름을 먼저 잡아 두는 차례 번호) | 2 |
| 12.2, 19.1, 「3단계 계획 전 결정」 4번 | S3가 센 문제마다 도구, 종류, 위치(설정 폴더나 프로젝트 이름부터, 스캐너가 찾은 경로로, S3의 차례 그대로) | 4 |
| 11.5, 12.3, 15, 「3단계 계획 전 결정」 6번 | AQ가 없으면 요약의 먼저 고칠 것을 칸은 두고 비움. 빈 목록 문장은 결과의 것 그대로 | 5 |
| 7.2 | core는 순수하다(경로는 스캐너가 다룬다) | 2, 4(순수성 검사가 그대로 본다) |
| 12.1 | 같은 입력이면 같은 결과 | 1, 3(같은 날 다시 점검), 기존 결정성 시험 |

1부에 넣지 않은 것은 「3단계 2부와 그 뒤에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드는 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`765f967`)에서 과제 1부터 5까지 차례대로 만들었다(Windows 11, Node.js 24). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1~5는 시험만 놓고 돌리면 실패하고(실패한 시험의 수와 파일은 시험 커밋마다 따로 세어 과제의 Expected와 맞는지 봤다), 구현을 놓으면 그 과제의 확인 명령(타입 검사와 관계있는 시험)이 통과했다. 과제 5의 묶은 실행 파일 다시 만들기도 통과했다. 과제 5 뒤의 `npm run check`는 시험 파일 75개·시험 1,165개가 통과했고 `묶음 검사 통과`였다. 다시 묶어도 묶은 실행 파일은 달라지지 않았다. 다 만든 복제본의 코드와 시험 파일 186개는 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다(문서와 원장은 연습 작업 폴더가 앞 버전을 들고 있어 견주지 않았다).

연습 작업 폴더에서 따로 확인한 것은 이렇다. 과제 1의 변이 둘(15일 대신 14일 뒤로 셈, ㉱의 근거를 빼먹음)을 시험이 잡았다(실패 10개, 5개). 묶은 실행 파일로 빈 홈과 이 PC의 기록을 저장 없이 점검했고 둘 다 종료 코드 0으로 끝났다. 빈 홈에서는 AQ가 없고 요약의 먼저 고칠 것이 칸만 있고 비어 있었으며 빈 목록의 문장도 없었다(정비할 것이 있어서다). 이 PC의 결과 파일에는 F3과 F4의 프로젝트 자리에 대소문자가 그대로인 폴더 이름이 있었다(숫자와 이름은 저장소 밖 기록에만 둔다). 설계 보완(「3단계 계획 전 결정」)은 짝 Codex 둘이 7차까지 검증했다.

확인하지 못한 것은 이렇다. macOS와 Linux에서는 돌려 보지 않았다. 이 PC에는 판정에서 뺀 서버와 S3의 문제가 없어 그 칸은 지어낸 입력의 시험으로만 확인했다. 실제 claude.ai에서 이름이 겹친 연결과 실제 PC에서 설정 폴더를 옮긴 채 처음부터 끝까지 돈 점검은 보지 않았다.
