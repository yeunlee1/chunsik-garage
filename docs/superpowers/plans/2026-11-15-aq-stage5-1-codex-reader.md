# AQ 점검 5단계 1부 — Codex 기록 읽기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 실제 기록으로 돌려 보기로 검증한다.

**Goal:** Codex의 기록 폴더를 찾아 수집 구간에 걸리는 기록 파일(압축본 포함)을 같은 기록의 사본 가운데 정본 하나씩 읽고, 논리 세션마다 날짜별 요약(응답, 토큰, 도구, 사람 요청, 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기)과 읽은 양을 낸다. 하위 세션이 부모의 앞부분을, 같은 세션의 뒤 기록이 앞 기록을 이어받은 것은 다시 세지 않고, 그것을 확인하지 못한 세션을 센다. 캐시가 있을 때와 없을 때 결과가 같다. `aq doctor`가 Codex 기록 폴더를 알린다.

**Architecture:** 어댑터는 `src/adapters/codex/`에 둔다. 목록과 사본 묶기(`locate.ts`), 압축 기록을 프레임마다 풀기(`zstd.ts`), 줄 해석(`parser.ts`. 세션의 정체, 토큰 구간, 도구 두 층, 그 밖의 지표, 이어받은 것 빼기와 자기 지문), 관측 범위(`observation.ts`), 지문 목록과 뺄 지문과의 겹침(`fingerprints.ts`), 같은 세션의 기록 합치기(`merge.ts`)다. 모으기(`src/collect/codex.ts`)는 두 번에 나눠 읽는다. 먼저 정본마다 캐시에서 꺼내거나 뺄 지문 없이 읽고, 그다음 기록마다 뺄 지문(부모 세션의 기록과 같은 세션의 앞 기록의 지문)과의 겹침이 해석 때와 다르면 뺄 지문을 넣어 다시 읽는다. 1단계의 공통(줄 나누기, 요약 모양, 캐시, 관측의 까닭)을 넓혀 함께 쓴다. 공통 캐시 열쇠는 목록을 본 뒤 바뀐 파일이면 만들지 않게 고치고, 1단계의 Claude Code 모으기도 그것을 따른다. 평가 입력과 결과 화면에 Codex를 잇는 것은 3부다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). Node.js 내장 `zlib`(zstd)과 `crypto`를 쓴다. 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 9.1(읽는 곳), 9.2(논리 세션, 사본, 주 세션과 하위 세션), 9.3(날짜별 요약), 9.4(캐시), 9.6(Codex 기록을 해석하는 규약), 9.7(관측 범위), 9.8(읽은 양), 20.1과 끝의 「5단계 계획 전 결정」(1~7번과 「7번의 세부」), 「5단계 1부 계획에서 보완」을 구현한다.

## 5단계 1부의 범위

| 넣는 것 | 넣지 않는 것(그 부) |
|---|---|
| Codex 기록 목록과 정본 차례, 압축 기록 풀기, 세션의 정체·토큰·도구·그 밖의 지표·날짜 해석, 이어받은 앞부분 빼기, 관측 범위와 MCP 관측, 캐시, 모으기(사본, 다음 사본, 압축, 구간 밖의 부모, 같은 세션 합치기, 읽은 양), `aq doctor`의 Codex 몫, 이 PC 기록으로 실제로 돌려 보기 | Codex 셋팅 읽기(2부). 평가 입력·규칙·점수·결과 화면·스킬 본문에 Codex를 넣는 것(3부. `CODEX_COVERAGE`·`codexMcpObservation`·`CODEX_SHELL_TOOLS`를 평가 입력에 잇기, Codex 스킬 관측이 늘 빠짐없지 않다는 것과 그 알림 문장, 결과의 읽은 양에 건너뛴 압축과 일부만 읽은 파일 잇기, Codex 알림들, Codex 색 확정). Codex 매니페스트와 Codex에서 스킬이 도는지(4부) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3). 압축 기록은 실행 중인 Node.js에 zstd 풀기(`zlib.createZstdDecompress`)가 있을 때만 읽는다. 22 계열은 22.15.0, 23 계열은 23.8.0부터 있다. 없으면 압축본만 있는 기록은 건너뛴 압축 파일로 센다. 최소 버전은 22 그대로다(「5단계 계획 전 결정」 2번).
- Codex의 기록 폴더는 읽기만 한다. 쓰는 곳은 이 도구의 상태 폴더(캐시)뿐이다(설계 6.3, 9.4).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더와 Codex 기록을 읽지 않고 임시 폴더에 만든 기록만 쓴다(설계 21.1). 압축 기록을 만드는 시험은 그 Node.js에 zstd가 있을 때만 돈다(`describe.skipIf`).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `5단계-1부-Codex-기록-읽기` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증은 병합 앞의 관문이다.
- 이 PC의 기록에서 잰 숫자, 경로, 이름, 세션 ID는 저장소와 병합 요청에 넣지 않는다(설계 머리말). 실제 기록으로 돌린 도구와 결과는 저장소 밖에 둔다.

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `FB22403400776609CFFACC940F658813D4155C41E918C9EA142FCBB9171F24F7`, 4,092줄)이다. 설계 끝에 「5단계 1부 계획에서 보완」(열네 가지)과 「5단계 1부 계획 리뷰 1차에서 보완」~「…리뷰 6차에서 보완」을 더하고 9.2, 9.4, 9.6, 9.7, 9.8과 부록 A의 해당 줄을 고쳤다. 압축 기록의 여러 프레임, 옛 형식의 관측(9.6·9.7의 옛 형식 열), MCP 관측의 사용 신호가 될 수 없는 종류(9.8 표는 그대로), 새로 본 종류와 열쇠, 시각 없는 줄의 날짜, 이어받은 것의 방법과 캐시(같은 세션의 앞 기록과 구간 밖의 것, 기준을 찾지 못한 기록, 이어받은 것을 확인하지 못한 세션과 원래 기록을 찾지 못한 세션), 되돌려 생긴 기록의 이름과 같은 세션 합치기, 정본을 읽지 못할 때와 압축 기록의 판정, 크기와 수정 시각을 모르는 사본, 너무 긴 줄과 실측 도구, 첫 줄과 버전, 날짜를 넘는 턴의 도구 호출 수, 추론 강도와 모델을 붙이는 창, Codex 기록의 수정 시각(수정 시각과 변경 시각 가운데 늦은 것), 목록을 본 뒤 바뀐 파일의 캐시 열쇠(9.4. 1단계의 Claude Code 모으기도 따른다)다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/adapters/codex/locate.ts`(새) | 1 | Codex 기록 폴더(`CODEX_HOME` 또는 `~/.codex`), `sessions/<연>/<월>/<일>/` 아래 기록 파일 목록, 같은 기록의 사본을 정본 차례로 묶기 |
| `src/adapters/codex/zstd.ts`(새), `src/adapters/common/lines.ts`(고침) | 2 | 압축 기록의 프레임 자리 훑기와 프레임마다 흘려 풀기. 1단계 줄 나누기를 조각 공급원에서도 쓰게 떼어 낸다 |
| `src/adapters/codex/parser.ts`(새), `src/adapters/types.ts`, `src/core/copy/common.ts`, `src/core/result/notices.ts`, `src/core/result/tools.ts`, `src/report/html.ts`(고침) | 3 | 세션의 정체와 토큰 구간, 날짜 칸. 도구 이름 `codex`를 더하고 그 이름이 쓰이는 표 넷을 채운다 |
| `src/adapters/codex/parser.ts`, `src/adapters/types.ts`(고침) | 4 | 도구 두 층, 정체 모를 항목 종류, 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기 |
| `src/adapters/codex/parser.ts`, `src/adapters/types.ts`(고침) | 5 | 뺄 지문으로 이어받은 앞부분 빼기, 기준을 찾지 못한 기록 가리기, 자기 지문 내기 |
| `src/adapters/codex/observation.ts`(새), `src/adapters/codex/parser.ts`, `src/adapters/claude/observation.ts`(고침) | 6 | 덮는 범위, MCP 관측, 깨진 줄과 끝 조각의 맨 바깥 종류 |
| `src/adapters/codex/fingerprints.ts`(새), `src/adapters/types.ts`, `src/state/cache.ts`, `src/collect/claude.ts`, `src/adapters/codex/parser.ts`(고침) | 7 | Codex 요약 되살리기, 캐시의 지문 칸과 뺄 지문과의 겹침, 목록을 본 뒤 바뀐 파일은 캐시 열쇠를 만들지 않음(1단계 모으기도) |
| `src/adapters/codex/merge.ts`, `src/collect/codex.ts`(새), `src/adapters/types.ts`(고침) | 8 | 같은 세션의 기록 합치기, Codex 기록 모으기(뺄 지문 모으기, 이어받은 것을 확인하지 못한 세션, 세션 ID를 대신 쓴 기록)와 읽은 양 |
| `src/commands/doctor.ts`(고침) | 9 | `aq doctor`의 Codex 기록 폴더 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/2`처럼 차례가 붙고 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 2부터 원본이 바뀌어 묶음 검사가 어긋나므로, 마지막 과제의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 묶은 실행 파일을 다시 만든 뒤 마지막 과제에서 돌린다.
- 시험은 임시 폴더에 만든 기록으로 해석과 모으기를 본다. 이 PC의 실제 기록에서 숫자가 맞는지는 시험으로 보증하지 않으므로 마지막 과제에서 실제 기록으로 돌리고 원본에서 따로 센 값과 견준다.

---

### Task 1: Codex 기록 파일 목록과 정본 차례

**Files:**
- Create: `src/adapters/codex/locate.ts`
- Test: `test/adapters/codex/locate.test.ts`

**Interfaces:**
- Consumes: 없다. 5단계 1부의 첫 과제다. 1단계의 `normalizePath`(`src/adapters/claude/locate.ts`)를 쓴다.
- Produces: `CodexLogFile`(`path`, `normPath`, `size`, `mtimeMs`, `changedMs`, `recordId`, `baseId`, `compressed`), `CodexFileList`(`sessionsFound`, `files`, `olderThanWindow`, `unreadableDirs`, `unnamedFiles`), `CodexCopyGroup`(`recordId`, `copies`), `StatFile`, `codexHome(env, homedir)`, `listCodexFiles(home, minChangedMs, statFile)`, `groupCopies(files)`(`src/adapters/codex/locate.ts`). 과제 8(모으기)과 과제 9(doctor)가 쓴다.

설계 9.1, 9.2, 「5단계 계획 전 결정」 3·7번, 「5단계 1부 계획에서 보완」의 7·14번이다.

- 기록 폴더는 `CODEX_HOME`(빈칸뿐이면 없는 것으로 본다)이고 없으면 홈의 `.codex`다. 그 아래 `sessions/<연>/<월>/<일>/`의 날짜 폴더 셋(이름이 숫자인 폴더)만 따라 내려가 `rollout-*.jsonl`과 `rollout-*.jsonl.zst`를 찾는다. 다른 자리와 다른 이름은 보지 않는다. 날짜 폴더 자리에 파일이 있거나 목록을 읽지 못한 폴더는 읽지 못한 폴더로 센다.
- 기록 파일의 식별자는 이름 끝의 UUID다. 대화를 되돌려 같은 세션의 기록 파일이 하나 더 생긴 기록(결정 7)은 작성자 PC에서 이름이 `rollout-<시각>-<UUID1>_<UUID2>` 꼴이었고(첫 줄 `session_meta`에 `history_base`와 `history_mode`가 있었다), 끝의 UUID2가 기록 파일의 식별자, 앞의 UUID1이 원래 세션의 ID다. UUID1을 `baseId`로 따로 적는다(구간 밖의 부모를 찾을 때 쓴다. 과제 8). 보통 이름은 `baseId`가 `null`이다. 이름에서 식별자를 읽지 못한 rollout 파일은 목록에 넣지 않고 수만 센다. 계획 전 실측에서 첫 이름 꼴(끝 UUID 앞이 `-`만)이 되돌려 생긴 기록을 이름 없는 파일로 빼서, 그 기록이 읽히지도 합쳐지지도 않았다(「5단계 1부 계획에서 보완」의 7번).
- Codex 기록의 수정 시각은 수정 시각과 변경 시각 가운데 늦은 것(`changedMs`)으로 본다. 작성자 PC(Windows)의 Codex 기록은 쓰는 동안 수정 시각이 만든 시각에 머물고 마지막으로 쓴 시각은 변경 시각에만 남았다(「5단계 1부 계획에서 보완」의 14번. 계획 리뷰 3차 뒤 실측에서 찾았다). 원래의 수정 시각(`mtimeMs`)도 남긴다(캐시 열쇠와 연 동안 바뀌었는지에 쓴다). 크기와 시각을 읽는 함수(`statFile`)는 시험이 바꿔 끼운다. utimes는 변경 시각을 지금으로 바꾸므로, 수정 시각으로 시각을 꾸민 시험은 변경 시각을 수정 시각과 같게 읽는다.
- 그 늦은 시각으로 거르는 아래 경계(`minChangedMs`)를 받으면 그보다 앞선 파일은 열지 않고 센다. 같은 기록의 사본도 하나씩 따로 거른다. 모으기(과제 8)는 하위 세션의 부모가 구간보다 오래됐을 수 있어 `null`로 받고 정본마다 가른다.
- 크기나 수정 시각을 보지 못한 파일은 둘을 `null`로 두고 목록에 남긴다. 수집 구간에 걸리는 것으로 보고 정본 후보로 둔다(설계 9.8, 결정 3).
- 사본 묶기는 같은 식별자끼리이고 정본 차례는 압축하지 않은 것, 수정 시각(변경 시각과 견줘 늦은 것)이 늦은 것(모르는 것은 아는 것 뒤), 정규화한 경로 사전순이다(설계 9.2, 결정 3). 정본을 읽지 못하면 다음 사본을 읽는 것은 모으기가 한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/locate.test.ts`(새 파일):

```ts
// Codex 기록 폴더 찾기, 세션 파일 목록(날짜 폴더, 압축본, 기록 파일 식별자, 수정 시각 거르기), 같은 기록 파일의 사본을 정본 차례로 묶기를 시험한다(설계 9.1, 9.2, 「5단계 계획 전 결정」 3·7번)
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 파일 하나의 stat만 실패하게 하려고 stat을 감싼다. 평소에는 실제 stat을 그대로 부른다.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, stat: vi.fn(actual.stat) };
});
import { codexHome, groupCopies, listCodexFiles, type CodexLogFile, type StatFile } from "../../../src/adapters/codex/locate.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 코덱스 로케이트 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const OLD = Date.parse("2026-01-01T00:00:00Z");
const NEW = Date.parse("2026-11-10T00:00:00Z");
const ID_A = "019a0000-0000-7000-8000-00000000000a";
const ID_B = "019a0000-0000-7000-8000-00000000000b";
const name = (id: string, ext = ".jsonl"): string => `rollout-2026-11-10T09-00-00-${id}${ext}`;

/** 시험 파일은 utimes가 변경 시각을 지금으로 바꾸므로, 수정 시각으로 시각을 꾸민 시험은 변경 시각을 수정 시각과 같게 읽는다 */
const sameTimes: StatFile = async (path) => {
  const info = await stat(path);
  return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.mtimeMs };
};

async function touch(path: string, mtimeMs: number): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "{}\n");
  await utimes(path, mtimeMs / 1000, mtimeMs / 1000);
}

describe("codexHome", () => {
  it("CODEX_HOME이 있으면 그 폴더, 없으면 홈의 .codex", () => {
    expect(codexHome({ CODEX_HOME: join(root, "c") }, root)).toBe(join(root, "c"));
    expect(codexHome({ CODEX_HOME: "  " }, root)).toBe(join(root, ".codex"));
    expect(codexHome({}, root)).toBe(join(root, ".codex"));
  });
});

describe("listCodexFiles", () => {
  it("sessions/연/월/일 아래의 rollout 파일과 압축본을 찾아 기록 파일 식별자와 압축 여부를 적고 경로 차례로 낸다. 다른 자리와 다른 이름은 보지 않는다", async () => {
    const day = join(root, "sessions", "2026", "11", "10");
    await touch(join(day, name(ID_B)), NEW);
    await touch(join(day, name(ID_A, ".jsonl.zst")), NEW);
    await touch(join(day, name(ID_A)), NEW);
    await touch(join(day, "notes.jsonl"), NEW);
    await touch(join(root, "sessions", name(ID_A)), NEW);
    await touch(join(root, "sessions", "2026", name(ID_A)), NEW);
    await touch(join(root, "archived_sessions", name(ID_A)), NEW);
    const list = await listCodexFiles(root, null);
    expect(list.sessionsFound).toBe(true);
    expect(list.files.map((file) => [file.recordId, file.compressed])).toEqual([
      [ID_A, false],
      [ID_A, true],
      [ID_B, false],
    ]);
    expect(list.files.every((file) => file.size !== null && file.mtimeMs !== null)).toBe(true);
    expect(list.unnamedFiles).toBe(0);
  });

  it("대화를 되돌려 생긴 기록(rollout-<시각>-<UUID1>_<UUID2>)은 끝의 UUID2가 기록 파일 식별자이고 앞의 UUID1을 따로 적는다. 보통 이름은 그 칸이 null이다", async () => {
    const day = join(root, "sessions", "2026", "11", "10");
    await touch(join(day, `rollout-2026-11-10T09-00-00-${ID_A}_${ID_B}.jsonl.zst`), NEW);
    await touch(join(day, name(ID_A)), NEW);
    const list = await listCodexFiles(root, null);
    expect(list.files.map((file) => [file.recordId, file.baseId, file.compressed])).toEqual([
      [ID_A, null, false],
      [ID_B, ID_A, true],
    ]);
    expect(list.unnamedFiles).toBe(0);
  });

  it("rollout 파일인데 이름에서 기록 파일 식별자를 읽지 못하면 세지 않고 수만 센다", async () => {
    const day = join(root, "sessions", "2026", "11", "10");
    await touch(join(day, "rollout-2026-11-10T09-00-00-not-an-id.jsonl"), NEW);
    await touch(join(day, name(ID_A)), NEW);
    const list = await listCodexFiles(root, null);
    expect(list.files.map((file) => file.recordId)).toEqual([ID_A]);
    expect(list.unnamedFiles).toBe(1);
  });

  it("수정 시각이 아래 경계보다 앞선 파일은 열지 않고 센다. 같은 기록 파일의 사본도 하나씩 따로 거른다", async () => {
    const day = join(root, "sessions", "2026", "01", "01");
    await touch(join(day, name(ID_A)), OLD);
    await touch(join(day, name(ID_A, ".jsonl.zst")), NEW);
    await touch(join(day, name(ID_B)), OLD);
    const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"), sameTimes);
    expect(list.files.map((file) => [file.recordId, file.compressed])).toEqual([[ID_A, true]]);
    expect(list.olderThanWindow).toBe(2);
  });

  it("변경 시각보다 수정 시각이 늦으면 수정 시각이 늦은 쪽이다(경계 안이면 거르지 않는다)", async () => {
    const day = join(root, "sessions", "2026", "01", "01");
    await touch(join(day, name(ID_A)), NEW);
    const mtimeLater: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: NEW, ctimeMs: OLD };
    };
    const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"), mtimeLater);
    expect(list.files.map((file) => file.changedMs)).toEqual([NEW]);
    expect(list.olderThanWindow).toBe(0);
  });

  it("수정 시각이 아래 경계보다 앞서도 변경 시각이 늦으면(쓰는 동안 수정 시각이 만든 시각에 머문 기록) 거르지 않고, 늦은 쪽을 changedMs로 낸다", async () => {
    const day = join(root, "sessions", "2026", "01", "01");
    await touch(join(day, name(ID_A)), OLD);
    const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"));
    expect(list.files).toHaveLength(1);
    expect(list.files[0]!.mtimeMs).toBe(OLD);
    expect(list.files[0]!.changedMs).toBe((await stat(join(day, name(ID_A)))).ctimeMs);
    expect(list.files[0]!.changedMs! > OLD).toBe(true);
    expect(list.olderThanWindow).toBe(0);
  });

  it("sessions 폴더가 없으면 찾지 못한 것이고, 폴더가 아니면 찾았지만 읽지 못한 폴더다", async () => {
    expect((await listCodexFiles(root, null)).sessionsFound).toBe(false);
    await writeFile(join(root, "sessions"), "x");
    const list = await listCodexFiles(root, null);
    expect(list.sessionsFound).toBe(true);
    expect(list.unreadableDirs).toEqual([join(root, "sessions")]);
    expect(list.files).toEqual([]);
  });

  it("날짜 폴더를 읽지 못하면 그 폴더만 읽지 못한 폴더로 내고 나머지는 찾는다", async () => {
    await touch(join(root, "sessions", "2026", "11", "10", name(ID_A)), NEW);
    await writeFile(join(root, "sessions", "2026", "12"), "x");
    const list = await listCodexFiles(root, null);
    expect(list.files.map((file) => file.recordId)).toEqual([ID_A]);
    expect(list.unreadableDirs).toEqual([join(root, "sessions", "2026", "12")]);
  });

  it("크기와 수정 시각을 보지 못한 파일은 빼지 않고 둘을 비워 목록에 넣는다(정본 후보로 남기려고). 수집 구간에 걸리는 것으로 본다", async () => {
    const day = join(root, "sessions", "2026", "11", "10");
    await touch(join(day, name(ID_A)), NEW);
    await touch(join(day, name(ID_B)), NEW);
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const denied = join(day, name(ID_B));
    vi.mocked(stat).mockImplementation((async (path: Parameters<typeof actual.stat>[0]) => {
      if (String(path) === denied) throw Object.assign(new Error("denied"), { code: "EACCES" });
      return actual.stat(path);
    }) as unknown as typeof stat);
    try {
      const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"));
      expect(list.files.map((file) => [file.recordId, file.size, file.mtimeMs])).toEqual([
        [ID_A, 3, NEW],
        [ID_B, null, null],
      ]);
      expect(list.unreadableDirs).toEqual([]);
    } finally {
      vi.mocked(stat).mockImplementation(actual.stat as unknown as typeof stat);
    }
  });
});

describe("groupCopies", () => {
  const file = (recordId: string, compressed: boolean, mtimeMs: number | null, normPath: string, changedMs = mtimeMs): CodexLogFile => ({ path: normPath, normPath, size: mtimeMs === null ? null : 1, mtimeMs, changedMs, recordId, baseId: null, compressed });

  it("같은 기록 파일 식별자끼리 묶고, 압축하지 않은 것, 수정 시각이 늦은 것, 경로 사전순으로 정본 차례를 낸다. 묶음은 식별자 차례다", () => {
    const groups = groupCopies([
      file(ID_B, false, 5, "b/2.jsonl"),
      file(ID_A, true, 9, "a/1.jsonl.zst"),
      file(ID_A, false, 3, "a/2.jsonl"),
      file(ID_A, false, 7, "a/3.jsonl"),
      file(ID_A, false, 7, "a/0.jsonl"),
    ]);
    expect(groups.map((group) => [group.recordId, group.copies.map((copy) => copy.normPath)])).toEqual([
      [ID_A, ["a/0.jsonl", "a/3.jsonl", "a/2.jsonl", "a/1.jsonl.zst"]],
      [ID_B, ["b/2.jsonl"]],
    ]);
  });

  it("정본 차례의 수정 시각은 수정 시각과 변경 시각 가운데 늦은 것이다", () => {
    const groups = groupCopies([file(ID_A, false, 9, "a/0.jsonl", 9), file(ID_A, false, 3, "a/1.jsonl", 20)]);
    expect(groups[0]!.copies.map((copy) => copy.normPath)).toEqual(["a/1.jsonl", "a/0.jsonl"]);
  });

  it("수정 시각을 보지 못한 사본은 같은 종류 가운데 아는 사본 뒤에 두고, 모르는 것끼리는 경로 차례다(가장 늦다고 지어내지 않는다)", () => {
    const groups = groupCopies([file(ID_A, false, null, "a/0.jsonl"), file(ID_A, false, 1, "a/9.jsonl"), file(ID_A, false, null, "a/1.jsonl"), file(ID_A, true, 5, "a/z.jsonl.zst")]);
    expect(groups[0]!.copies.map((copy) => copy.normPath)).toEqual(["a/9.jsonl", "a/0.jsonl", "a/1.jsonl", "a/z.jsonl.zst"]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/locate.test.ts`
Expected: FAIL. `test/adapters/codex/locate.test.ts`가 `src/adapters/codex/locate.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/locate.ts`(새 파일):

```ts
// Codex 기록 폴더를 찾고, 수집 구간에 걸리는 세션 파일(압축본 포함)의 목록과 같은 기록 파일의 사본을 정본 차례로 묶는다(설계 9.1, 9.2, 「5단계 계획 전 결정」 3·7번)
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { normalizePath } from "../claude/locate.ts";

/** 세션 파일 하나. 세션 ID와 주·하위 세션은 첫 줄(session_meta)을 읽어야 알아서 여기에는 없다 */
export interface CodexLogFile {
  path: string;
  normPath: string;
  /** 크기와 수정 시각을 보지 못했으면 null이다. 그런 파일도 정본 후보로 남긴다. 캐시 열쇠와 연 동안 바뀌었는지는 크기와 이 수정 시각으로 본다 */
  size: number | null;
  mtimeMs: number | null;
  /**
   * 수정 시각과 변경 시각 가운데 늦은 것. 작성자 PC(Windows)의 Codex 기록은 쓰는 동안 수정 시각이 만든 시각에 머물고 마지막으로 쓴 시각은 변경 시각에만 남았다.
   * 수집 구간, 정본 차례, 쓰는 중인지는 이것으로 가른다. 크기와 수정 시각을 보지 못했으면 null이다
   */
  changedMs: number | null;
  /** 파일 이름 끝의 식별자. 기록 파일의 식별자다(세션 ID는 session_meta의 id) */
  recordId: string;
  /** 이름이 rollout-<시각>-<UUID1>_<UUID2> 꼴이면 앞의 UUID1. 대화를 되돌려 같은 세션의 기록 파일이 하나 더 생긴 기록에서 원래 세션의 ID였다(이 PC 실측). 아니면 null */
  baseId: string | null;
  /** `.jsonl.zst`이면 참 */
  compressed: boolean;
}

export interface CodexFileList {
  sessionsFound: boolean;
  files: CodexLogFile[];
  /** 수정 시각과 변경 시각 가운데 늦은 것이 아래 경계보다 앞서 열지 않은 파일의 수 */
  olderThanWindow: number;
  /** 목록을 읽지 못해 안을 모르는 폴더(설계 9.8) */
  unreadableDirs: string[];
  /** rollout 파일인데 이름에서 기록 파일 식별자를 읽지 못해 세지 않은 수 */
  unnamedFiles: number;
}

/** 같은 기록 파일의 사본 묶음. copies는 정본 차례다(앞의 것을 먼저 읽고, 읽지 못하면 다음 것) */
export interface CodexCopyGroup {
  recordId: string;
  copies: CodexLogFile[];
}

export function codexHome(env: Record<string, string | undefined>, homedir: string): string {
  const fromEnv = env.CODEX_HOME?.trim();
  return fromEnv ? resolve(fromEnv) : join(homedir, ".codex");
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
const DIGITS = /^\d+$/;
const ROLLOUT = /^rollout-.*?-(?:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(\.zst)?$/i;

/** 파일의 크기와 시각을 읽는다. 시험이 바꿔 끼운다(utimes는 변경 시각을 지금으로 바꾼다) */
export type StatFile = (path: string) => Promise<{ size: number; mtimeMs: number; ctimeMs: number }>;

export async function listCodexFiles(home: string, minChangedMs: number | null, statFile: StatFile = stat): Promise<CodexFileList> {
  const sessions = join(home, "sessions");
  const files: CodexLogFile[] = [];
  const unreadableDirs: string[] = [];
  let olderThanWindow = 0;
  let unnamedFiles = 0;

  // 날짜 폴더(연, 월, 일)만 따라 내려간다. 숫자가 아닌 폴더와 날짜 폴더가 아닌 깊이의 파일은 보지 않는다(설계 9.1)
  const walk = async (dir: string, depth: number): Promise<boolean> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (depth === 0 && isMissing(error)) return false;
      if (!isMissing(error)) unreadableDirs.push(dir);
      return true;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (depth < 3) {
        if (DIGITS.test(entry.name) && !entry.isFile()) await walk(path, depth + 1);
        else if (DIGITS.test(entry.name) && entry.isFile()) unreadableDirs.push(path);
        continue;
      }
      if (!entry.isFile() || !/^rollout-.*\.jsonl(\.zst)?$/i.test(entry.name)) continue;
      const match = ROLLOUT.exec(entry.name);
      if (match === null) {
        unnamedFiles++;
        continue;
      }
      const baseId = match[1]?.toLowerCase() ?? null;
      const recordId = match[2]!.toLowerCase();
      const compressed = match[3] !== undefined;
      try {
        const info = await statFile(path);
        const changedMs = Math.max(info.mtimeMs, info.ctimeMs);
        if (minChangedMs !== null && changedMs < minChangedMs) {
          olderThanWindow++;
          continue;
        }
        files.push({ path, normPath: normalizePath(path), size: info.size, mtimeMs: info.mtimeMs, changedMs, recordId, baseId, compressed });
      } catch {
        // 크기와 수정 시각을 모르면 수집 구간에 걸리는 것으로 본다(설계 9.8). 정본 후보로 남긴다(결정 3)
        files.push({ path, normPath: normalizePath(path), size: null, mtimeMs: null, changedMs: null, recordId, baseId, compressed });
      }
    }
    return true;
  };

  const found = await walk(sessions, 0);
  if (!found) return { sessionsFound: false, files: [], olderThanWindow: 0, unreadableDirs: [], unnamedFiles: 0 };
  files.sort((a, b) => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0));
  unreadableDirs.sort();
  return { sessionsFound: true, files, olderThanWindow, unreadableDirs, unnamedFiles };
}

/** 정본 차례. 압축하지 않은 것, 수정 시각(변경 시각과 견줘 늦은 것)이 늦은 것(모르는 것은 아는 것 뒤), 경로 사전순이다(설계 9.2, 결정 3) */
function canonicalOrder(a: CodexLogFile, b: CodexLogFile): number {
  if (a.compressed !== b.compressed) return a.compressed ? 1 : -1;
  if (a.changedMs !== b.changedMs) {
    if (a.changedMs === null) return 1;
    if (b.changedMs === null) return -1;
    return b.changedMs - a.changedMs;
  }
  return a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0;
}

export function groupCopies(files: readonly CodexLogFile[]): CodexCopyGroup[] {
  const groups = new Map<string, CodexLogFile[]>();
  for (const file of files) {
    const list = groups.get(file.recordId);
    if (list) list.push(file);
    else groups.set(file.recordId, [file]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([recordId, copies]) => ({ recordId, copies: [...copies].sort(canonicalOrder) }));
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex/locate.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 13개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/locate.test.ts src/adapters/codex/locate.ts
git commit -m "feat: Codex 기록 파일 목록과 정본 차례를 더함"
```

---

### Task 2: 압축 기록을 프레임마다 풀기

**Files:**
- Create: `src/adapters/codex/zstd.ts`
- Modify: `src/adapters/common/lines.ts`
- Test: `test/adapters/codex/zstd.test.ts`

**Interfaces:**
- Consumes: 1단계의 줄 읽기(`src/adapters/common/lines.ts`의 `readLines`, `LineSink`, `MAX_LINE_BYTES`, `IN_PROGRESS_WINDOW_MS`).
- Produces: `LineSplitter`, `lineSplitter(sink, maxLine)`(`src/adapters/common/lines.ts`. `readLines`가 이것을 쓴다), `zstdAvailable()`, `ZstdFrameStatus`, `ZstdFrames`(`status`, `frames`, `ranges`, `brokenFrameStart`), `scanZstdFrames(path)`, `ZstdReadOutcome`, `readZstdLines(path, nowMs, sink, options)`(`src/adapters/codex/zstd.ts`). 과제 8이 쓴다.

설계 9.8, 「5단계 계획 전 결정」 2번, 「5단계 1부 계획에서 보완」의 1·8번이다.

- 1단계의 줄 나누기(줄바꿈에서만 자르고 끝의 `\r`을 떼며, 상한 16MB를 넘은 줄은 풀지 않고 세고, 줄바꿈 없는 끝 조각을 따로 돌려준다)를 조각을 받는 `lineSplitter`로 떼어 내고 `readLines`가 그것을 쓴다. 1단계의 줄 읽기 시험이 그대로 통과해야 한다. 압축 기록도 푼 조각을 같은 나누기에 넣는다.
- 실행 중인 Node.js에 `zlib.createZstdDecompress`가 있는지로 풀 수 있는지를 가린다(결정 2).
- **Node.js의 zstd 풀기는 여러 프레임 가운데 첫 프레임만 푼다.** 동기(`zstdDecompressSync`)와 흘려 풀기 모두 그렇고 오류를 내지 않는다(Node.js 24.18에서 확인). 그래서 RFC 8878의 프레임 머리(매직, 프레임 머리 바이트, 창과 사전과 크기 칸)와 블록 머리(3바이트, 마지막 블록 표지, 블록 종류와 크기), 체크섬(4바이트)을 따라가며 프레임마다 바이트 자리를 알고, 프레임마다 디코더를 새로 만들어 차례로 푼다. 건너뛸 수 있는 프레임(매직 `0x184D2A50`~`0x184D2A5F`)은 건너뛴다.
- 프레임 훑기의 결과는 `complete`(모든 프레임이 끝까지 있음), `truncated`(끝 프레임이 잘림. 남은 4바이트 미만이 매직의 앞부분인 것도 든다), `invalid`(매직이 틀림, 예약 비트, 블록 종류 3, 완결된 프레임 뒤의 다른 것, 빈 파일)다. 끝까지 있는 프레임을 차례로 풀고, 잘렸거나 깨진 프레임은 나오는 만큼 푼다. 풀다가 오류가 나면 그 앞까지의 줄만 내고 오류를 돌려준다. 구조가 완결된 프레임이라도 체크섬이 틀리면 Node.js가 풀기 오류를 낸다(과제 8이 일부만 읽은 파일로 가르는 근거). 줄 나누기는 프레임 사이에서 새로 시작하지 않는다(두 프레임에 걸친 너무 긴 줄은 한 번만 센다). 작성자 PC의 압축 기록은 모두 완결된 한 프레임이었다.
- 쓰는 중인지는 1단계와 같다(열 때와 다 읽은 뒤의 크기와 수정 시각이 다르거나, 수정 시각이 평가 시각에서 2초 안쪽).
- 시험은 `zlib.zstdCompressSync`로 만든 합성 자료다(정상 하나, 두 프레임, 끝 프레임 3바이트 자름, 프레임 가운데 자름, 둘째 프레임을 매직 뒤 어느 자리에서 자름, RLE 블록, 매직 틀림, 정상 뒤 쓰레기, 빈 파일, 체크섬 있음과 틀린 체크섬, 건너뛸 수 있는 프레임, 두 프레임에 걸친 너무 긴 줄). 그 Node.js에 zstd가 없으면 건너뛴다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/zstd.test.ts`(새 파일):

```ts
// Codex 압축 기록(.jsonl.zst)의 프레임 훑기(완결·잘림·깨짐)와 흘려 풀어 한 줄씩 읽기를 시험한다. Node.js는 끝 프레임이 잘린 파일을 오류 없이 앞 프레임까지만 풀어 주므로 프레임 훑기가 잘림을 잡아야 한다(설계 9.8, 「5단계 계획 전 결정」 2번)
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lineSplitter, type LineSink } from "../../../src/adapters/common/lines.ts";
import { readZstdLines, scanZstdFrames, zstdAvailable } from "../../../src/adapters/codex/zstd.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 코덱스 zstd "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const has = zstdAvailable();
const compress = (text: string, checksum = false): Buffer =>
  zlib.zstdCompressSync(Buffer.from(text), checksum ? { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } } : undefined);
const skippable = (content: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(0x184d2a53, 0);
  head.writeUInt32LE(content.length, 4);
  return Buffer.concat([head, content]);
};
async function put(name: string, bytes: Buffer): Promise<string> {
  const path = join(root, name);
  await writeFile(path, bytes);
  return path;
}
function collect(): { sink: LineSink; lines: string[]; tooLong: () => number } {
  const lines: string[] = [];
  let tooLong = 0;
  return { sink: { line: (text) => lines.push(text), tooLong: () => tooLong++ }, lines, tooLong: () => tooLong };
}
const ONE = '{"a":1}\n{"a":2}\n';
const TWO = '{"b":1}\n';

describe("lineSplitter", () => {
  it("조각에 걸친 줄을 잇고, 끝의 \\r을 떼며, 상한을 넘은 줄은 풀지 않고 세고, 줄바꿈 없는 끝 조각을 돌려준다", () => {
    const { sink, lines, tooLong } = collect();
    const splitter = lineSplitter(sink, 8);
    splitter.push(Buffer.from('{"x"'));
    splitter.push(Buffer.from(':1}\r\n0123456789abc\nend'));
    expect(splitter.finish()).toBe("end");
    expect(lines).toEqual(['{"x":1}']);
    expect(tooLong()).toBe(1);
  });
});

describe.skipIf(!has)("scanZstdFrames", () => {
  it("프레임 하나, 둘, 체크섬이 있는 프레임, 건너뛸 수 있는 프레임 뒤의 프레임은 완결이고 자료 프레임 수와 프레임마다의 자리를 낸다", async () => {
    const one = compress(ONE);
    const two = compress(TWO);
    expect(await scanZstdFrames(await put("1.zst", one))).toEqual({ status: "complete", frames: 1, ranges: [[0, one.length]], brokenFrameStart: null });
    expect(await scanZstdFrames(await put("2.zst", Buffer.concat([one, two])))).toEqual({ status: "complete", frames: 2, ranges: [[0, one.length], [one.length, one.length + two.length]], brokenFrameStart: null });
    expect(await scanZstdFrames(await put("c.zst", compress(ONE, true)))).toMatchObject({ status: "complete", frames: 1 });
    const meta = skippable(Buffer.from("meta"));
    expect(await scanZstdFrames(await put("s.zst", Buffer.concat([meta, one])))).toEqual({ status: "complete", frames: 1, ranges: [[meta.length, meta.length + one.length]], brokenFrameStart: null });
  });

  it("끝 프레임이 잘렸거나 프레임 중간이 잘렸으면 잘림이다. 잘린 매직도 잘림이다. 잘린 자료 프레임의 시작 자리를 낸다", async () => {
    const first = compress(ONE);
    const both = Buffer.concat([first, compress(TWO, true)]);
    expect(await scanZstdFrames(await put("t1.zst", both.subarray(0, both.length - 3)))).toEqual({ status: "truncated", frames: 1, ranges: [[0, first.length]], brokenFrameStart: first.length });
    const one = compress(ONE);
    expect((await scanZstdFrames(await put("t2.zst", one.subarray(0, Math.floor(one.length / 2))))).status).toBe("truncated");
    expect((await scanZstdFrames(await put("t3.zst", Buffer.concat([one, Buffer.from([0x28, 0xb5])])))).status).toBe("truncated");
  });

  it("완결된 두 프레임의 둘째를 매직 뒤 어느 자리에서 잘라도 잘림이고 잘린 프레임의 시작 자리를 낸다. 블록 머리 3바이트 가운데서 잘린 것도 든다", async () => {
    const first = compress(ONE);
    const both = Buffer.concat([first, compress(TWO.repeat(30))]);
    for (let cut = first.length + 4; cut < both.length; cut++) {
      expect(await scanZstdFrames(await put(`cut-${cut}.zst`, both.subarray(0, cut))), `${cut}바이트`).toEqual({ status: "truncated", frames: 1, ranges: [[0, first.length]], brokenFrameStart: first.length });
    }
  });

  it("RLE 블록은 풀린 크기와 상관없이 압축 자료가 한 바이트다", async () => {
    const rle = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 0x40, 0x03, 0x02, 0x00, 0x61]);
    expect(zlib.zstdDecompressSync(rle).toString()).toBe("a".repeat(64));
    expect(await scanZstdFrames(await put("rle.zst", rle))).toEqual({ status: "complete", frames: 1, ranges: [[0, rle.length]], brokenFrameStart: null });
  });

  it("매직이 틀렸거나, 완결된 프레임 뒤에 다른 것이 붙었거나, 빈 파일이면 깨짐이다", async () => {
    expect((await scanZstdFrames(await put("m.zst", Buffer.from("not zstd at all")))).status).toBe("invalid");
    expect((await scanZstdFrames(await put("g.zst", Buffer.concat([compress(ONE), Buffer.from("junk!")])))).status).toBe("invalid");
    expect((await scanZstdFrames(await put("e.zst", Buffer.alloc(0)))).status).toBe("invalid");
  });
});

describe.skipIf(!has)("readZstdLines", () => {
  it("흘려 풀어 줄을 내고, 프레임 둘의 줄을 모두 낸다", async () => {
    const one = collect();
    const outcome = await readZstdLines(await put("1.zst", compress(ONE)), Date.now() + 60_000, one.sink);
    expect(one.lines).toEqual(['{"a":1}', '{"a":2}']);
    expect(outcome).toMatchObject({ tail: null, decodeError: null, inProgress: false });
    expect(outcome.decodedBytes).toBe(Buffer.byteLength(ONE));
    const two = collect();
    await readZstdLines(await put("2.zst", Buffer.concat([compress(ONE), compress(TWO)])), Date.now() + 60_000, two.sink);
    expect(two.lines).toEqual(['{"a":1}', '{"a":2}', '{"b":1}']);
  });

  it("끝 프레임이 잘린 파일은 앞 프레임까지의 줄을 낸다. 오류가 나지 않을 수 있어 잘림은 프레임 훑기로 가린다", async () => {
    const both = Buffer.concat([compress(ONE), compress(TWO, true)]);
    const path = await put("t.zst", both.subarray(0, both.length - 3));
    const seen = collect();
    await readZstdLines(path, Date.now() + 60_000, seen.sink);
    expect(seen.lines.slice(0, 2)).toEqual(['{"a":1}', '{"a":2}']);
    expect((await scanZstdFrames(path)).status).toBe("truncated");
  });

  it("상한을 넘는 줄이 두 프레임에 걸쳐도 한 번만 센다. 프레임 사이에서 줄 나누기를 새로 시작하지 않는다", async () => {
    const seen = collect();
    await readZstdLines(await put("long.zst", Buffer.concat([compress("123456789"), compress("x\n")])), Date.now() + 60_000, seen.sink, { maxLineBytes: 8 });
    expect(seen.tooLong()).toBe(1);
    expect(seen.lines).toEqual([]);
  });

  it("구조가 완결된 프레임이라도 체크섬이 틀리면 풀기 오류를 돌려준다(일부만 읽은 파일로 가리는 근거)", async () => {
    const bad = compress(TWO, true);
    bad.writeUInt8(bad.readUInt8(bad.length - 1) ^ 1, bad.length - 1);
    const path = await put("bad.zst", Buffer.concat([compress(ONE), bad]));
    expect((await scanZstdFrames(path)).status).toBe("complete");
    const seen = collect();
    const outcome = await readZstdLines(path, Date.now() + 60_000, seen.sink);
    expect(outcome.decodeError).not.toBeNull();
    expect(seen.lines.slice(0, 2)).toEqual(['{"a":1}', '{"a":2}']);
  });

  it("풀지 못하면 그 오류를 돌려주고 그때까지의 줄만 낸다", async () => {
    const seen = collect();
    const outcome = await readZstdLines(await put("m.zst", Buffer.from("not zstd at all")), Date.now() + 60_000, seen.sink);
    expect(outcome.decodeError).not.toBeNull();
    expect(seen.lines).toEqual([]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/zstd.test.ts`
Expected: FAIL. `test/adapters/codex/zstd.test.ts`가 `../../../src/adapters/codex/zstd.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/zstd.ts`(새 파일):

```ts
// Codex 압축 기록(.jsonl.zst)을 다룬다. 실행 중인 Node.js가 zstd를 풀 수 있는지, 프레임이 끝까지 있는지(RFC 8878의 프레임 머리와 블록 머리만 따라감), 흘려 풀어 한 줄씩 읽기다. Node.js의 zstd 풀기는 여러 프레임 가운데 첫 프레임만 풀고 오류를 내지 않으므로, 프레임 훑기로 자리를 알아 프레임마다 따로 풀어 잇는다(설계 9.8, 「5단계 계획 전 결정」 2번)
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import type { Transform } from "node:stream";
import * as zlib from "node:zlib";
import { IN_PROGRESS_WINDOW_MS, lineSplitter, MAX_LINE_BYTES, type LineSink } from "../common/lines.ts";

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MASK = 0xfffffff0;
const SKIPPABLE_MAGIC = 0x184d2a50;
/** 매직의 앞 바이트(리틀 엔디언). 파일 끝에 이것만 남았으면 잘린 것이다 */
const MAGIC_BYTES = [0x28, 0xb5, 0x2f, 0xfd];

/** 실행 중인 Node.js에 zstd 풀기가 있는지. 22 계열은 22.15.0, 23 계열은 23.8.0부터 있다. 버전 글자가 아니라 기능으로 가린다 */
export function zstdAvailable(): boolean {
  return typeof (zlib as { createZstdDecompress?: unknown }).createZstdDecompress === "function";
}

export type ZstdFrameStatus = "complete" | "truncated" | "invalid";

/** 압축 파일의 프레임을 처음부터 끝까지 따라간다. 자료 프레임의 수와, 끝까지 맞으면 완결, 프레임 도중에 파일이 끝나면 잘림, 꼴이 틀리면 깨짐이다 */
export interface ZstdFrames {
  status: ZstdFrameStatus;
  /** 끝까지 있는 자료 프레임의 수 */
  frames: number;
  /** 끝까지 있는 자료 프레임마다의 [시작, 끝) 바이트 자리. 건너뛸 수 있는 프레임은 넣지 않는다 */
  ranges: Array<[number, number]>;
  /** 잘렸거나 깨진 곳이 자료 프레임 안이면 그 프레임의 시작 자리, 아니면 null이다 */
  brokenFrameStart: number | null;
}

export async function scanZstdFrames(path: string): Promise<ZstdFrames> {
  const handle = await open(path, "r");
  try {
    const size = (await handle.stat()).size;
    const small = Buffer.alloc(18);
    const readAt = async (position: number, length: number): Promise<Buffer> => {
      const { bytesRead } = await handle.read(small, 0, length, position);
      return small.subarray(0, bytesRead);
    };
    let position = 0;
    let frames = 0;
    const ranges: Array<[number, number]> = [];
    let frameStart: number | null = null;
    if (size === 0) return { status: "invalid", frames: 0, ranges, brokenFrameStart: null };
    while (position < size) {
      const left = size - position;
      if (left < 4) {
        const rest = await readAt(position, left);
        return { status: rest.every((byte, index) => byte === MAGIC_BYTES[index]) ? "truncated" : "invalid", frames, ranges, brokenFrameStart: null };
      }
      const magic = (await readAt(position, 4)).readUInt32LE(0);
      frameStart = null;
      if ((magic & SKIPPABLE_MASK) >>> 0 === SKIPPABLE_MAGIC) {
        if (left < 8) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        const length = (await readAt(position + 4, 4)).readUInt32LE(0);
        position += 8 + length;
        if (position > size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        continue;
      }
      if (magic !== ZSTD_MAGIC) return { status: "invalid", frames, ranges, brokenFrameStart: null };
      frameStart = position;
      position += 4;
      if (position >= size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
      const descriptor = (await readAt(position, 1))[0]!;
      const fcsFlag = descriptor >> 6;
      const singleSegment = (descriptor >> 5) & 1;
      const reserved = (descriptor >> 3) & 1;
      const checksum = (descriptor >> 2) & 1;
      const dictFlag = descriptor & 3;
      if (reserved !== 0) return { status: "invalid", frames, ranges, brokenFrameStart: frameStart };
      const headerBytes = 1 + (singleSegment ? 0 : 1) + [0, 1, 2, 4][dictFlag]! + [singleSegment ? 1 : 0, 2, 4, 8][fcsFlag]!;
      position += headerBytes;
      if (position > size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
      for (;;) {
        if (size - position < 3) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        const head = await readAt(position, 3);
        const value = head[0]! | (head[1]! << 8) | (head[2]! << 16);
        const last = value & 1;
        const type = (value >> 1) & 3;
        const blockSize = value >>> 3;
        if (type === 3) return { status: "invalid", frames, ranges, brokenFrameStart: frameStart };
        position += 3 + (type === 1 ? 1 : blockSize);
        if (position > size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
        if (last) break;
      }
      if (checksum) {
        position += 4;
        if (position > size) return { status: "truncated", frames, ranges, brokenFrameStart: frameStart };
      }
      frames++;
      ranges.push([frameStart, position]);
      frameStart = null;
    }
    return { status: frames > 0 ? "complete" : "invalid", frames, ranges, brokenFrameStart: null };
  } finally {
    await handle.close();
  }
}

export interface ZstdReadOutcome {
  sizeAtOpen: number;
  mtimeMsAtOpen: number;
  /** 압축 파일에서 읽은 바이트와 풀린 바이트 */
  bytesRead: number;
  decodedBytes: number;
  /** 파일 끝의 줄바꿈 없는 조각. 없거나 상한을 넘었으면 null이다 */
  tail: string | null;
  /** 읽는 동안 크기나 수정 시각이 바뀌었거나, 수정 시각이 평가 시각에서 2초 안쪽이다 */
  inProgress: boolean;
  /** 풀다가 난 오류의 코드나 글. 없으면 null이다. 오류가 없어도 끝까지 풀렸다는 보증은 아니다(frames.status로 가린다) */
  decodeError: string | null;
  /** 프레임 훑기의 결과. 잘렸거나 깨졌으면 일부만 읽은 파일이다 */
  frames: ZstdFrames;
}

/** 바이트 자리 [start, end)의 프레임 하나를 따로 풀어 줄 나누기에 잇는다 */
async function decodeRange(path: string, start: number, end: number, push: (chunk: Buffer) => void): Promise<{ bytesRead: number; decodedBytes: number; error: string | null }> {
  const source = createReadStream(path, { start, end: end - 1 });
  let bytesRead = 0;
  let decodedBytes = 0;
  source.on("data", (chunk: Buffer | string) => {
    bytesRead += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
  });
  const decoder = (zlib as unknown as { createZstdDecompress(): Transform }).createZstdDecompress();
  source.on("error", (error) => decoder.destroy(error));
  source.pipe(decoder);
  try {
    for await (const chunk of decoder as AsyncIterable<Buffer>) {
      decodedBytes += chunk.length;
      push(chunk);
    }
    return { bytesRead, decodedBytes, error: null };
  } catch (error) {
    source.destroy();
    return { bytesRead, decodedBytes, error: (error as NodeJS.ErrnoException).code ?? String((error as Error).message ?? error) };
  }
}

/** 연 순간의 크기까지만, 프레임마다 따로 흘려 풀어 한 줄씩 낸다. 끝까지 있는 프레임을 차례로 풀고, 잘렸거나 깨진 프레임은 나오는 만큼 푼다. 풀다가 오류가 나면 그 앞까지의 줄만 내고 오류를 돌려준다 */
export async function readZstdLines(path: string, nowMs: number, sink: LineSink, options: { maxLineBytes?: number } = {}): Promise<ZstdReadOutcome> {
  const opened = await stat(path);
  const sizeAtOpen = opened.size;
  const mtimeMsAtOpen = opened.mtimeMs;
  const frames = await scanZstdFrames(path);
  const splitter = lineSplitter(sink, options.maxLineBytes ?? MAX_LINE_BYTES);
  let bytesRead = 0;
  let decodedBytes = 0;
  let decodeError: string | null = sizeAtOpen === 0 ? "EMPTY" : null;
  const targets: Array<[number, number]> = frames.ranges.filter(([, end]) => end <= sizeAtOpen);
  if (frames.brokenFrameStart !== null) targets.push([frames.brokenFrameStart, sizeAtOpen]);
  for (const [start, end] of targets) {
    if (end <= start) continue;
    const result = await decodeRange(path, start, end, (chunk) => splitter.push(chunk));
    bytesRead += result.bytesRead;
    decodedBytes += result.decodedBytes;
    if (result.error !== null) {
      decodeError = result.error;
      break;
    }
  }
  // 자료 프레임이 하나도 없는 깨진 파일은 풀 것이 없다
  if (decodeError === null && frames.status === "invalid" && targets.length === 0) decodeError = "INVALID";
  const tail = splitter.finish();
  const after = await stat(path);
  const inProgress = after.size !== sizeAtOpen || after.mtimeMs !== mtimeMsAtOpen || nowMs - mtimeMsAtOpen < IN_PROGRESS_WINDOW_MS;
  return { sizeAtOpen, mtimeMsAtOpen, bytesRead, decodedBytes, tail, inProgress, decodeError, frames };
}
```

`src/adapters/common/lines.ts`(찾을 곳 1/2):

```ts

export async function readLines(path: string, nowMs: number, sink: LineSink, options: ReadOptions = {}): Promise<ReadOutcome> {
  const maxLine = options.maxLineBytes ?? MAX_LINE_BYTES;
  const chunkSize = options.chunkBytes ?? 1024 * 1024;
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat();
    const sizeAtOpen = opened.size;
    const mtimeMsAtOpen = opened.mtimeMs;
    if (options.afterOpen) await options.afterOpen();

    const buffer = Buffer.allocUnsafe(chunkSize);
    // 읽은 조각을 넘는 줄만 여기에 모은다. 필요할 때 두 배씩, 상한까지만 키우고 파일 하나 동안 다시 쓴다.
    let carry = Buffer.allocUnsafe(Math.min(maxLine, 64 * 1024));
    let carryBytes = 0;
    let skipping = false; // 상한을 넘은 줄의 나머지를 줄바꿈까지 버리는 중이다
    let position = 0;

    while (position < sizeAtOpen) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(chunkSize, sizeAtOpen - position), position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const view = buffer.subarray(0, bytesRead);
      let start = 0;
```

`src/adapters/common/lines.ts`(바꾼 뒤 1/2):

```ts

/** 조각을 차례로 받아 줄로 나눈다. 파일에서 읽은 조각과 압축을 푼 조각이 같이 쓴다 */
export interface LineSplitter {
  push(view: Buffer): void;
  /** 끝의 줄바꿈 없는 조각. 없거나 상한을 넘었으면 null이다. 상한을 넘은 끝 줄은 여기서 센다 */
  finish(): string | null;
}

export function lineSplitter(sink: LineSink, maxLine: number = MAX_LINE_BYTES): LineSplitter {
  // 읽은 조각을 넘는 줄만 여기에 모은다. 필요할 때 두 배씩, 상한까지만 키우고 파일 하나 동안 다시 쓴다.
  let carry = Buffer.allocUnsafe(Math.min(maxLine, 64 * 1024));
  let carryBytes = 0;
  let skipping = false; // 상한을 넘은 줄의 나머지를 줄바꿈까지 버리는 중이다
  return {
    push(view: Buffer): void {
      let start = 0;
```

`src/adapters/common/lines.ts`(찾을 곳 2/2):

```ts
      }
    }

    let tail: string | null = null;
    if (skipping) sink.tooLong();
    else if (carryBytes > 0) tail = decode(carry, 0, carryBytes);

```

`src/adapters/common/lines.ts`(바꾼 뒤 2/2):

```ts
      }
    },
    finish(): string | null {
      if (skipping) {
        sink.tooLong();
        return null;
      }
      return carryBytes > 0 ? decode(carry, 0, carryBytes) : null;
    },
  };
}

export async function readLines(path: string, nowMs: number, sink: LineSink, options: ReadOptions = {}): Promise<ReadOutcome> {
  const maxLine = options.maxLineBytes ?? MAX_LINE_BYTES;
  const chunkSize = options.chunkBytes ?? 1024 * 1024;
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat();
    const sizeAtOpen = opened.size;
    const mtimeMsAtOpen = opened.mtimeMs;
    if (options.afterOpen) await options.afterOpen();

    const buffer = Buffer.allocUnsafe(chunkSize);
    const splitter = lineSplitter(sink, maxLine);
    let position = 0;

    while (position < sizeAtOpen) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(chunkSize, sizeAtOpen - position), position);
      if (bytesRead === 0) break;
      position += bytesRead;
      splitter.push(buffer.subarray(0, bytesRead));
    }

    const tail = splitter.finish();

```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex/zstd.test.ts test/adapters/common/lines.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 19개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/zstd.test.ts src/adapters/codex/zstd.ts src/adapters/common/lines.ts
git commit -m "feat: 압축된 Codex 기록을 프레임마다 풀어 읽음"
```

---

### Task 3: 세션의 정체와 토큰 구간

**Files:**
- Create: `src/adapters/codex/parser.ts`
- Modify: `src/adapters/types.ts`
- Modify: `src/core/copy/common.ts`
- Modify: `src/core/result/notices.ts`
- Modify: `src/core/result/tools.ts`
- Modify: `src/report/html.ts`
- Test: `test/adapters/codex/parser.test.ts`

**Interfaces:**
- Consumes: 1단계의 요약 모양(`SessionSummary`, `DayCell`, `emptyDay`, `canonicalDay`, `nameRecord`), 날짜(`localDateOfIso`), `fnv1a64`, `UNKNOWN_TOOL`. 도구 이름이 쓰이는 표 넷(`TOOL_NAMES`, `VERIFIED_VERSIONS`, `FORMATS`, `TOOL_COLORS`).
- Produces: `CodexSessionParser`(`line(text)`, `tooLong()`, `finish(tail, inProgress)`), `CodexParserContext`(`recordId`, `timeZone`), `SUB_THREAD_SOURCES`, `CODEX_PARSER_VERSION`(`src/adapters/codex/parser.ts`). `ToolId`에 `"codex"`, `CodexIdFallback`, `SessionSummary.codex`(`recordId`, `unknownThreadSource`, `idFallback`)(`src/adapters/types.ts`). 과제 4~8이 쓴다.

설계 9.2, 9.3, 9.6, 「5단계 계획 전 결정」 1·7번, 「5단계 1부 계획에서 보완」의 5·11번이다.

- 해석기는 1단계의 `ClaudeSessionParser`와 같은 꼴이다(`line`, `tooLong`, 끝 조각을 받는 `finish`). 빈 줄은 세지 않고, 풀리지 않는 줄은 깨진 줄, 쓰는 중인 파일의 풀리지 않는 끝은 끝 조각이다.
- 세션의 정체(세션 ID, 작업 폴더, 주·하위, 부모)는 빈 줄이 아닌 첫 물리적 줄의 `session_meta` 하나로만 정한다. 세션 ID는 `id`, 작업 폴더는 `cwd`다. `thread_source`가 `subagent`·`guardian_review`·`memory_consolidation`이면 하위 세션이고 부모는 `parent_thread_id`다. `user`는 주 세션이고, 그 밖의 값과 열쇠 없음은 정체 모름이라 주 세션으로 세고 그 값(열쇠가 없으면 `(없음)`)을 따로 적는다(결정 1).
- 첫 줄이 깨졌거나 너무 길면(`first-line-unreadable`), 풀렸는데 `session_meta`가 아니면(`first-line-not-meta`), 첫 줄의 `session_meta`에 `id`가 없으면(`meta-without-id`. 나머지 정체는 그 줄에서 정한다), 줄이 하나도 없으면(`no-lines`) 기록 파일의 식별자를 세션 ID로 대신 쓰고 그 까닭을 `codex.idFallback`에 남긴다(결정 7. 모으기가 까닭별로 센다). 앞의 둘은 뒤의 `session_meta`로 정체를 정하지 않는다. 계획 초안은 뒤의 `session_meta`로 정체를 정했다(계획 리뷰 1차가 찾았다).
- 버전은 기록에 적힌 모든 `session_meta`의 `cli_version` 가운데 가장 높은 것이다(설계 9.3). 자리마다 숫자로 견준다(`0.100.0`이 `0.99.0`보다 높다). 앞선 버전 꼬리를 뗀 `x.y.z`로 읽는다(`0.140.0-alpha.19`는 `0.140.0`. 1단계의 버전 읽기는 `x.y.z`만 받는다). 낮아지거나 읽지 못하는 버전은 남은 값을 바꾸지 않는다.
- 토큰은 구간으로 가른다(설계 9.6). `token_usage_record`가 처음 나오기 전은 옛 구간이다. `token_count`의 `info.total_token_usage`가 직전과 다섯 칸 모두 같으면 세지 않고, 한 칸이라도 줄었으면(캐시 읽기만 줄어도) 새로 시작된 것으로 그 값을, 그 밖에는 칸마다의 차분을 응답 하나로 센다. 새 구간은 `token_usage_record`의 `response_id`(글자 그대로 가른다)마다 한 번 `usage`를 센다. 넘어가는 자리는 새 구간 첫 기록의 `thread_token_usage`가 옛 구간에서 마지막으로 본 누적값과 같을 때만 세지 않는다.
- 토큰 칸은 원래 값 그대로다(입력 `input_tokens`은 캐시를 품고 출력 `output_tokens`는 추론을 품는다. 캐시 읽기 `cached_input_tokens`, 캐시 쓰기 `cache_write_input_tokens`, 추론 `reasoning_output_tokens`). 도구마다 다른 식은 규칙이 쓴다(설계 9.6, 3부).
- 날짜는 줄의 `timestamp`를 평가 시간대의 날짜로 바꾼 것이다. 시각이 없는 세는 줄은 종류와 상관없이 바로 앞 줄의 날짜를 쓰고, 앞의 줄이 모두 시각이 없을 때만 날짜를 몰라 세지 못한 줄로 센다. 가장 이른 날짜도 종류와 상관없이 모든 줄에서 고른다. 1단계 구현의 규칙이다(「5단계 1부 계획에서 보완」의 5번). 하위 세션이 복사해 온 줄도 하위가 쓴 시각을 달고 있어 하위의 가장 이른 날짜가 부모 쪽으로 당겨지지 않는다(작성자 PC 실측).
- `ToolId`에 `"codex"`를 더하면 타입 검사가 도구 이름이 쓰이는 표 넷을 막는다. 화면 이름(`Codex`), 확인한 버전 범위(`0.140.0`~`0.166.0`. 작성자 PC 기록의 가장 낮은 것과 가장 높은 것이고 9.6이 확인한 범위다), 형식(`codex-jsonl`. 두 형식이 한 파일에 섞이므로 하나로 본다), 결과 화면의 색(주황 `#c8660a`. 임시이고, 결과 화면에 Codex를 넣는 3부에서 색 검증과 함께 정한다)을 채운다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/parser.test.ts`(새 파일):

```ts
// Codex 세션 해석 1. 세션의 정체(session_meta의 id, cwd, 버전, thread_source, parent_thread_id), 토큰 구간(옛 구간의 누적값 차분, 새 구간의 response_id, 넘어가는 자리), 날짜 칸, 깨진 줄을 시험한다(설계 9.2, 9.6, 「5단계 계획 전 결정」 1·7번)
import { describe, expect, it } from "vitest";
import { CodexSessionParser } from "../../../src/adapters/codex/parser.ts";

const TZ = "Asia/Seoul";
const RECORD = "019a0000-0000-7000-8000-0000000000aa";
const usage = (input: number, cached: number, output: number, reasoning: number, write = 0) => ({ input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: write, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output });
const meta = (payload: Record<string, unknown>, timestamp = "2026-11-10T00:00:00Z") => JSON.stringify({ timestamp, type: "session_meta", payload });
const count = (total: ReturnType<typeof usage>, timestamp = "2026-11-10T01:00:00Z") => JSON.stringify({ timestamp, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: total, last_token_usage: total } } });
const record = (responseId: string, use: ReturnType<typeof usage>, thread: ReturnType<typeof usage>, timestamp = "2026-11-10T02:00:00Z") => JSON.stringify({ timestamp, type: "token_usage_record", ordinal: 1, payload: { response_id: responseId, usage: use, thread_token_usage: thread } });
function run(lines: string[]) {
  const parser = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
  for (const line of lines) parser.line(line);
  return parser.finish(null, false);
}
const day = (summary: ReturnType<typeof run>, date: string) => summary.days[date]!;

describe("세션의 정체", () => {
  it("session_meta에서 세션 ID, 작업 폴더, 버전(앞선 버전 꼬리를 뗌)을 정하고 user는 주 세션이다", () => {
    const summary = run([meta({ id: "sess-1", cwd: "C:/work", cli_version: "0.140.0-alpha.19", thread_source: "user" })]);
    expect(summary).toMatchObject({ tool: "codex", sessionId: "sess-1", kind: "main", parentSessionId: null, cwd: "C:/work", version: "0.140.0" });
    expect(summary.codex).toMatchObject({ recordId: RECORD, unknownThreadSource: null, idFallback: null });
  });

  it("subagent, guardian_review, memory_consolidation은 하위 세션이고 부모는 parent_thread_id다. 부모 열쇠가 글자가 아니면 부모를 모른다", () => {
    for (const source of ["subagent", "guardian_review", "memory_consolidation"]) {
      expect(run([meta({ id: "s", thread_source: source, parent_thread_id: "parent-1" })])).toMatchObject({ kind: "sub", parentSessionId: "parent-1" });
    }
    expect(run([meta({ id: "s", thread_source: "subagent", parent_thread_id: 7 })])).toMatchObject({ kind: "sub", parentSessionId: null });
  });

  it("그 밖의 값과 열쇠가 없는 옛 기록은 정체 모름이라 주 세션으로 세고 그 값을 남긴다. 부모는 null이다", () => {
    expect(run([meta({ id: "s", thread_source: "vscode", parent_thread_id: "p" })])).toMatchObject({ kind: "main", parentSessionId: null, codex: { unknownThreadSource: "vscode" } });
    expect(run([meta({ id: "s" })])).toMatchObject({ kind: "main", codex: { unknownThreadSource: "(없음)" } });
  });

  it("첫 물리적 줄로만 정체를 정한다. 첫 줄이 session_meta가 아니거나, 깨졌거나, 너무 길면 뒤의 session_meta를 쓰지 않고 기록 파일 식별자를 세션 ID로 대신 쓰며 까닭을 적는다", () => {
    expect(run([count(usage(10, 0, 5, 0)), meta({ id: "late" })])).toMatchObject({ sessionId: RECORD, kind: "main", codex: { idFallback: "first-line-not-meta" } });
    expect(run(["{broken", meta({ id: "late", thread_source: "subagent", parent_thread_id: "p" })])).toMatchObject({ sessionId: RECORD, kind: "main", parentSessionId: null, codex: { idFallback: "first-line-unreadable" } });
    const long = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
    long.tooLong();
    long.line(meta({ id: "late" }));
    expect(long.finish(null, false)).toMatchObject({ sessionId: RECORD, codex: { idFallback: "first-line-unreadable" } });
  });

  it("첫 줄의 session_meta에 id가 없으면 기록 파일 식별자를 대신 쓰되 나머지 정체는 그 줄에서 정한다. 줄이 하나도 없으면 그렇다고 적는다. 줄바꿈 없는 끝 조각도 첫 줄이 될 수 있다", () => {
    expect(run([meta({ cwd: "C:/w", thread_source: "subagent", parent_thread_id: "p" })])).toMatchObject({ sessionId: RECORD, cwd: "C:/w", kind: "sub", parentSessionId: "p", codex: { idFallback: "meta-without-id" } });
    expect(run([])).toMatchObject({ sessionId: RECORD, codex: { idFallback: "no-lines" } });
    const tailOnly = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
    expect(tailOnly.finish(meta({ id: "t" }), false)).toMatchObject({ sessionId: "t", codex: { idFallback: null } });
  });

  it("버전은 기록에 적힌 session_meta 가운데 가장 높은 것이다. 낮아지거나 읽지 못하는 버전은 바꾸지 않고, 정체는 첫 줄의 것 그대로다", () => {
    expect(run([meta({ id: "s", cli_version: "0.160.0" }), meta({ id: "s", cli_version: "0.166.0-alpha.2" })]).version).toBe("0.166.0");
    expect(run([meta({ id: "s", cli_version: "0.99.0" }), meta({ id: "s", cli_version: "0.100.0" })]).version).toBe("0.100.0");
    expect(run([meta({ id: "s", cli_version: "0.166.0" }), meta({ id: "s", cli_version: "0.150.0" }), meta({ id: "s", cli_version: "nightly" })]).version).toBe("0.166.0");
    expect(run([meta({ id: "s", cwd: "C:/first" }), meta({ id: "other", cwd: "C:/second" })])).toMatchObject({ sessionId: "s", cwd: "C:/first" });
  });
});

describe("토큰 구간", () => {
  it("옛 구간은 누적값이 직전보다 커진 만큼 칸마다 더하고, 커진 것 하나를 응답 하나로 센다. 같으면 0이다", () => {
    const summary = run([meta({ id: "s", thread_source: "user" }), count(usage(100, 40, 10, 4)), count(usage(100, 40, 10, 4)), count(usage(160, 70, 25, 9, 3))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 160, cacheRead: 70, cacheWrite: 3, output: 25, thinking: 9 } });
  });

  it("옛 구간에서 누적값이 줄면 새로 시작된 것으로 보고 그 값을 더한다", () => {
    const summary = run([meta({ id: "s" }), count(usage(100, 0, 10, 0)), count(usage(30, 0, 3, 0))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 130, output: 13 } });
  });

  it("누적값의 칸 하나만 줄어도(캐시 읽기만 줄어도) 새로 시작된 것으로 보고 그 값을 더한다", () => {
    const summary = run([meta({ id: "s" }), count(usage(100, 40, 10, 0)), count(usage(120, 10, 12, 0))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 220, cacheRead: 50 } });
  });

  it("응답 ID는 글자 그대로 가른다. 대소문자가 다르면 다른 응답이다", () => {
    const summary = run([meta({ id: "s" }), record("rA", usage(5, 0, 1, 0), usage(5, 0, 1, 0)), record("ra", usage(7, 0, 1, 0), usage(12, 0, 2, 0))]);
    expect(day(summary, "2026-11-10").responses).toBe(2);
  });

  it("새 구간은 token_usage_record를 response_id로 한 번씩 센다. 그 뒤의 token_count는 쓰지 않는다", () => {
    const summary = run([meta({ id: "s" }), record("r1", usage(50, 20, 5, 1), usage(50, 20, 5, 1)), record("r1", usage(50, 20, 5, 1), usage(50, 20, 5, 1)), count(usage(999, 0, 999, 0)), record("r2", usage(30, 10, 4, 2), usage(80, 30, 9, 3))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 80, cacheRead: 30, output: 9, thinking: 3 } });
  });

  it("넘어가는 자리. 새 구간 첫 기록의 누적값이 옛 구간에서 마지막으로 센 것보다 크면 센다", () => {
    const summary = run([meta({ id: "s" }), count(usage(100, 0, 10, 0)), record("r1", usage(20, 0, 2, 0), usage(120, 0, 12, 0))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 120, output: 12 } });
  });

  it("넘어가는 자리. 같으면 옛 구간에서 이미 센 응답이라 세지 않는다", () => {
    const summary = run([meta({ id: "s" }), count(usage(100, 0, 10, 0)), record("r1", usage(100, 0, 10, 0), usage(100, 0, 10, 0)), record("r2", usage(5, 0, 1, 0), usage(105, 0, 11, 0))]);
    expect(day(summary, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 105, output: 11 } });
  });

  it("넘어가는 자리. 작으면 누적이 새로 시작된 것이라 센다. 옛 구간이 없으면 견주지 않고 센다", () => {
    const smaller = run([meta({ id: "s" }), count(usage(100, 0, 10, 0)), record("r1", usage(7, 0, 1, 0), usage(7, 0, 1, 0))]);
    expect(day(smaller, "2026-11-10")).toMatchObject({ responses: 2, tokens: { input: 107, output: 11 } });
    const fresh = run([meta({ id: "s" }), record("r1", usage(7, 0, 1, 0), usage(500, 0, 50, 0))]);
    expect(day(fresh, "2026-11-10")).toMatchObject({ responses: 1, tokens: { input: 7, output: 1 } });
  });
});

describe("날짜 칸과 깨진 줄", () => {
  it("응답은 줄의 시각을 현지 날짜로 바꾼 칸에 든다. 시각이 없는 줄은 종류와 상관없이 바로 앞 줄의 날짜를 쓰고, 가장 이른 날짜도 종류와 상관없이 모든 줄에서 고른다(1단계와 같다)", () => {
    const untimed = (n: number) => JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage(n, 0, n / 10, 0) } } });
    const summary = run([
      meta({ id: "s" }),
      count(usage(10, 0, 1, 0), "2026-11-10T14:59:00Z"),
      count(usage(20, 0, 2, 0), "2026-11-10T15:01:00Z"),
      JSON.stringify({ timestamp: "2026-11-12T01:00:00Z", type: "turn_context", payload: { model: "m" } }),
      untimed(30),
      JSON.stringify({ timestamp: "2026-11-09T10:00:00Z", type: "world_state", payload: {} }),
      untimed(40),
    ]);
    expect(Object.fromEntries(Object.entries(summary.days).map(([date, cell]) => [date, cell.responses]))).toEqual({ "2026-11-09": 1, "2026-11-10": 1, "2026-11-11": 1, "2026-11-12": 1 });
    expect(summary.notes.undatedLines).toBe(0);
    expect(summary.firstDate).toBe("2026-11-09");
  });

  it("앞의 줄이 모두 시각이 없을 때만 날짜를 몰라 세지 못한 줄로 센다. 세는 줄(응답)만 그렇게 세고, 그 밖의 줄은 시각이 없어도 세지 않는다", () => {
    const raw = (type: string, payload: Record<string, unknown>) => JSON.stringify({ type, payload });
    const summary = run([
      raw("session_meta", { id: "s", thread_source: "user" }),
      raw("turn_context", { model: "m" }),
      raw("world_state", {}),
      raw("event_msg", { type: "token_count", info: { total_token_usage: usage(10, 0, 1, 0) } }),
      raw("token_usage_record", { response_id: "r1", usage: usage(5, 0, 1, 0), thread_token_usage: usage(15, 0, 2, 0) }),
      record("r2", usage(7, 0, 1, 0), usage(22, 0, 3, 0)),
    ]);
    expect(summary.notes.undatedLines).toBe(2);
    expect(summary.firstDate).toBe("2026-11-10");
    expect(summary.days).toEqual({ "2026-11-10": expect.objectContaining({ responses: 1, tokens: expect.objectContaining({ input: 7, output: 1 }) }) });
  });

  it("풀리지 않는 줄과 상한을 넘은 줄을 센다. 쓰는 중인 파일의 풀리지 않는 끝은 끝 조각이고, 아니면 깨진 줄이다(1단계와 같다). 빈 줄은 세지 않는다", () => {
    const parser = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
    parser.line(meta({ id: "s" }));
    parser.line("{not json");
    parser.line("   ");
    parser.tooLong();
    expect(parser.finish('{"type":"event_msg"', true).missing).toMatchObject({ lines: 4, brokenLines: 1, tooLongLines: 1, tailFragments: 1 });
    const done = new CodexSessionParser({ recordId: RECORD, timeZone: TZ });
    done.line(meta({ id: "s" }));
    expect(done.finish('{"type":"event_msg"', false).missing).toMatchObject({ lines: 2, brokenLines: 1, tailFragments: 0 });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/parser.test.ts`
Expected: FAIL. `test/adapters/codex/parser.test.ts`가 `../../../src/adapters/codex/parser.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/parser.ts`(새 파일):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가른다(설계 9.2, 9.6, 「5단계 계획 전 결정」 1·7번)
import { nameRecord } from "../common/canonical.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { maxVersion } from "../common/version.ts";
import type { CodexIdFallback } from "../types.ts";
import { canonicalDay, emptyDay, type DayCell, type SessionKind, type SessionSummary, type TokenCounts } from "../types.ts";

export const CODEX_PARSER_VERSION = 1;

export interface CodexParserContext {
  /** 파일 이름 끝의 식별자. 첫 줄을 읽지 못하면 세션 ID로 대신 쓴다 */
  recordId: string;
  timeZone: string;
}

/** 사람이 연 것이 아니라고 Codex가 밝힌 thread_source(공개 소스의 ThreadSource). 하위 세션이다 */
export const SUB_THREAD_SOURCES: ReadonlySet<string> = new Set(["subagent", "guardian_review", "memory_consolidation"]);

type Json = Record<string, unknown>;
type Usage = TokenCounts;

const obj = (value: unknown): Json | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

function parseObject(text: string): Json | null {
  try {
    return obj(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Codex의 토큰 여섯 칸을 요약의 칸으로 옮긴다. 값은 원래대로 둔다(입력에 캐시가, 출력에 추론이 들어 있다. E1이 도구마다 식을 달리 쓴다) */
function usageOf(value: unknown): Usage | null {
  const raw = obj(value);
  if (raw === null) return null;
  return { input: num(raw.input_tokens), cacheRead: num(raw.cached_input_tokens), cacheWrite: num(raw.cache_write_input_tokens), output: num(raw.output_tokens), thinking: num(raw.reasoning_output_tokens) };
}

const KEYS = ["input", "cacheRead", "cacheWrite", "output", "thinking"] as const;
type Compare = "greater" | "equal" | "smaller";
/** 누적값끼리 견준다. 하나라도 줄었으면 줄어든 것, 모두 같으면 같은 것, 그 밖은 커진 것이다 */
function compareUsage(current: Usage, previous: Usage): Compare {
  if (KEYS.some((key) => current[key] < previous[key])) return "smaller";
  return KEYS.every((key) => current[key] === previous[key]) ? "equal" : "greater";
}

/** 앞선 버전의 꼬리를 떼어 x.y.z로 맞춘다(0.140.0-alpha.19는 0.140.0). 꼴이 다르면 null이다 */
function normalizeVersion(value: unknown): string | null {
  const text = str(value);
  const match = text === null ? null : /^(\d+\.\d+\.\d+)(?:[-+].*)?$/.exec(text.trim());
  return match === null ? null : match[1]!;
}

export class CodexSessionParser {
  private readonly days = new Map<LocalDate, DayCell>();
  private firstDate: LocalDate | null = null;
  /** 시각이 있는 마지막 줄(종류와 상관없이)의 날짜 */
  private lastDate: LocalDate | null = null;
  private sessionId: string | null = null;
  private kind: SessionKind = "main";
  private parentSessionId: string | null = null;
  private cwd: string | null = null;
  private version: string | null = null;
  private unknownThreadSource: string | null = null;
  /** 빈 줄이 아닌 첫 물리적 줄을 받았는지, 그 줄이 session_meta라서 그 줄로 정체를 정하는 중인지, 세션 ID를 기록 파일의 식별자로 대신 쓴 까닭(「5단계 계획 전 결정」 7번) */
  private firstLineSeen = false;
  private identityPending = false;
  private idFallback: CodexIdFallback | null = null;
  private lines = 0;
  private brokenLines = 0;
  private tailFragments = 0;
  private tooLongLines = 0;
  private undatedLines = 0;
  /** 새 구간에 들어섰는지(token_usage_record를 한 번이라도 봤는지) */
  private inNew = false;
  /** 옛 구간에서 마지막으로 본 누적값. 새 구간의 첫 기록과 견준다 */
  private lastOldTotal: Usage | null = null;
  private readonly seenResponses = new Set<string>();

  constructor(private readonly ctx: CodexParserContext) {}

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다 */
  line(text: string): void {
    if (text.trim() === "") return;
    this.lines++;
    const parsed = parseObject(text);
    this.firstLine(parsed);
    if (parsed === null) this.brokenLines++;
    else this.accept(parsed);
  }

  /** 빈 줄이 아닌 첫 물리적 줄 하나만 본다. 풀리지 않거나 너무 길면 첫 줄을 읽지 못한 것이고, 풀렸는데 session_meta가 아니면 정체를 모르는 것이다. 그 뒤의 session_meta로 정체를 정하지 않는다(「5단계 계획 전 결정」 7번) */
  private firstLine(parsed: Json | null): void {
    if (this.firstLineSeen) return;
    this.firstLineSeen = true;
    if (parsed === null) this.idFallback = "first-line-unreadable";
    else if (parsed.type !== "session_meta") this.idFallback = "first-line-not-meta";
    else this.identityPending = true;
  }

  /** 상한을 넘은 줄 하나를 받는다 */
  tooLong(): void {
    this.lines++;
    this.tooLongLines++;
    this.firstLine(null);
  }

  private day(date: LocalDate): DayCell {
    let cell = this.days.get(date);
    if (!cell) {
      cell = emptyDay();
      this.days.set(date, cell);
    }
    return cell;
  }

  /** 세는 줄의 날짜. 시각이 없으면 앞 줄(종류와 상관없이)의 날짜를 쓰고, 앞 줄도 없으면 날짜 없는 줄로 센다(1단계와 같다). 세는 줄마다 한 번만 부른다 */
  private dateOf(): LocalDate | null {
    if (this.lastDate === null) this.undatedLines++;
    return this.lastDate;
  }

  /** 풀린 줄 하나. 종류와 상관없이 그 줄의 시각을 앞 줄의 날짜와 가장 이른 날짜에 쓰고, 종류에 따라 해석한다 */
  private accept(row: Json): void {
    const own = localDateOfIso(row.timestamp, this.ctx.timeZone);
    if (own !== null) {
      this.lastDate = own;
      if (this.firstDate === null || own < this.firstDate) this.firstDate = own;
    }
    const payload = obj(row.payload) ?? {};
    if (row.type === "session_meta") {
      this.meta(payload, this.identityPending);
      this.identityPending = false;
      return;
    }
    if (row.type === "event_msg" && payload.type === "token_count") {
      if (!this.inNew) this.oldCount(usageOf(obj(payload.info)?.total_token_usage));
      return;
    }
    if (row.type === "token_usage_record") this.newRecord(payload);
  }

  /** session_meta 하나. 버전은 모든 session_meta에서 가장 높은 것을 남기고(설계 9.3), 정체(세션 ID, 작업 폴더, 주·하위, 부모)는 첫 줄의 것에서만 정한다 */
  private meta(payload: Json, first: boolean): void {
    this.version = maxVersion([this.version, normalizeVersion(payload.cli_version)]);
    if (!first) return;
    this.sessionId = str(payload.id);
    if (this.sessionId === null) this.idFallback = "meta-without-id";
    this.cwd = str(payload.cwd);
    const source = payload.thread_source;
    if (source === "user") this.kind = "main";
    else if (typeof source === "string" && SUB_THREAD_SOURCES.has(source)) {
      this.kind = "sub";
      this.parentSessionId = str(payload.parent_thread_id);
    } else {
      // 정체 모름. 사람이 연 세션일 수 있어 주 세션으로 센다(설계 9.2)
      this.kind = "main";
      this.unknownThreadSource = typeof source === "string" ? source : "(없음)";
    }
  }

  /** 응답 하나를 그 날의 칸에 더한다. 날짜를 얻지 못하면 세지 않는다(날짜 없는 줄로는 dateOf가 센다) */
  private count(add: Usage): void {
    const date = this.dateOf();
    if (date === null) return;
    const cell = this.day(date);
    cell.responses++;
    for (const key of KEYS) cell.tokens[key] += add[key];
  }

  private oldCount(total: Usage | null): void {
    if (total === null) return;
    const previous = this.lastOldTotal;
    this.lastOldTotal = total;
    if (previous === null) return this.count(total);
    const relation = compareUsage(total, previous);
    if (relation === "equal") return;
    if (relation === "smaller") return this.count(total);
    const diff = { ...total };
    for (const key of KEYS) diff[key] = total[key] - previous[key];
    this.count(diff);
  }

  private newRecord(payload: Json): void {
    const responseId = str(payload.response_id);
    const use = usageOf(payload.usage);
    const first = !this.inNew;
    this.inNew = true;
    if (responseId !== null) {
      if (this.seenResponses.has(responseId)) return;
      this.seenResponses.add(responseId);
    }
    if (use === null) return;
    // 넘어가는 자리. 새 구간 첫 기록의 누적값이 옛 구간에서 마지막으로 센 것과 같으면 이미 센 응답이다(설계 9.6)
    if (first && this.lastOldTotal !== null) {
      const thread = usageOf(payload.thread_token_usage);
      if (thread !== null && compareUsage(thread, this.lastOldTotal) === "equal") return;
    }
    this.count(use);
  }

  /** 파일 끝의 줄바꿈 없는 조각을 받고 요약을 낸다. 조각이 풀리면 받아들이고, 안 풀리면 쓰는 중일 때만 끝 조각이고 아니면 깨진 줄이다(1단계와 같다) */
  finish(tail: string | null, inProgress: boolean): SessionSummary {
    if (tail !== null && tail.trim() !== "") {
      this.lines++;
      const parsed = parseObject(tail);
      this.firstLine(parsed);
      if (parsed !== null) this.accept(parsed);
      else if (inProgress) this.tailFragments++;
      else this.brokenLines++;
    }
    if (!this.firstLineSeen) this.idFallback = "no-lines";
    const days: Record<LocalDate, DayCell> = {};
    for (const date of [...this.days.keys()].sort()) days[date] = canonicalDay(this.days.get(date)!);
    return {
      tool: "codex",
      sessionId: this.sessionId ?? this.ctx.recordId,
      kind: this.kind,
      parentSessionId: this.kind === "sub" ? this.parentSessionId : null,
      cwd: this.cwd,
      version: this.version,
      firstDate: this.firstDate,
      days,
      instructionChars: null,
      initialSkills: null,
      initialMcpServers: null,
      missing: { lines: this.lines, brokenLines: this.brokenLines, tailFragments: this.tailFragments, tooLongLines: this.tooLongLines, unconfirmedTypes: nameRecord<number>() },
      firstResponseIdHashes: [],
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback },
    };
  }
}
```

`src/adapters/types.ts`(찾을 곳 1/3):

```ts

export type ToolId = "claude-code";
export type SessionKind = "main" | "sub";
```

`src/adapters/types.ts`(바꾼 뒤 1/3):

```ts

export type ToolId = "claude-code" | "codex";
export type SessionKind = "main" | "sub";
```

`src/adapters/types.ts`(찾을 곳 2/3):

```ts

export interface SessionSummary {
```

`src/adapters/types.ts`(바꾼 뒤 2/3):

```ts

/** Codex 요약에서 세션 ID를 기록 파일의 식별자로 대신 쓴 까닭. 첫 줄을 읽지 못함(깨짐, 너무 김), 첫 줄이 session_meta가 아님, session_meta에 id가 없음, 줄이 하나도 없음(「5단계 계획 전 결정」 7번) */
export type CodexIdFallback = "first-line-unreadable" | "first-line-not-meta" | "meta-without-id" | "no-lines";

export interface SessionSummary {
```

`src/adapters/types.ts`(찾을 곳 3/3):

```ts
  notes: { syntheticResponses: number; responsesWithoutId: number; undatedLines: number; unknownHookKinds: Record<string, number> };
}
```

`src/adapters/types.ts`(바꾼 뒤 3/3):

```ts
  notes: { syntheticResponses: number; responsesWithoutId: number; undatedLines: number; unknownHookKinds: Record<string, number> };
  /** Codex만. 기록 파일의 식별자, 정체 모름인 thread_source의 값(열쇠가 없으면 "(없음)"), 세션 ID를 기록 파일의 식별자로 대신 쓴 까닭(대신 쓰지 않았으면 null)(설계 「5단계 계획 전 결정」 1·7번) */
  codex?: { recordId: string; unknownThreadSource: string | null; idFallback: CodexIdFallback | null };
}
```

`src/core/copy/common.ts`(찾을 곳):

```ts
  "claude-code": { en: "Claude Code", ko: "Claude Code" },
};
```

`src/core/copy/common.ts`(바꾼 뒤):

```ts
  "claude-code": { en: "Claude Code", ko: "Claude Code" },
  codex: { en: "Codex", ko: "Codex" },
};
```

`src/core/result/notices.ts`(찾을 곳):

```ts
export const VERIFIED_VERSIONS: Record<ToolId, { from: string; to: string }> = { "claude-code": { from: "2.1.220", to: "2.1.322" } };
```

`src/core/result/notices.ts`(바꾼 뒤):

```ts
export const VERIFIED_VERSIONS: Record<ToolId, { from: string; to: string }> = { "claude-code": { from: "2.1.220", to: "2.1.322" }, codex: { from: "0.140.0", to: "0.166.0" } };
```

`src/core/result/tools.ts`(찾을 곳):

```ts
/** 도구마다의 기록 형식. Claude Code는 한 형식이다 */
const FORMATS: Record<ToolId, readonly string[]> = { "claude-code": ["claude-code-jsonl"] };
```

`src/core/result/tools.ts`(바꾼 뒤):

```ts
/** 도구마다의 기록 형식. Claude Code는 한 형식이다. Codex는 새 형식과 옛 형식이 한 파일에 이어질 수 있어 하나로 본다(설계 9.6) */
const FORMATS: Record<ToolId, readonly string[]> = { "claude-code": ["claude-code-jsonl"], codex: ["codex-jsonl"] };
```

`src/report/html.ts`(찾을 곳):

```ts
const TOOL_COLORS: Record<ToolId, string> = { "claude-code": "#2a78d6" };
```

`src/report/html.ts`(바꾼 뒤):

```ts
// Codex 색은 결과 화면에 Codex를 넣는 5단계 3부에서 색 검증과 함께 확정한다(파랑과 색각 이상에서도 구분되는 주황을 임시로 둔다)
const TOOL_COLORS: Record<ToolId, string> = { "claude-code": "#2a78d6", codex: "#c8660a" };
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex/parser.test.ts test/core test/report test/adapters/types.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 42개, 시험 773개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/parser.test.ts src/adapters/codex/parser.ts src/adapters/types.ts src/core/copy/common.ts src/core/result/notices.ts src/core/result/tools.ts src/report/html.ts
git commit -m "feat: Codex 세션의 정체와 토큰을 해석함"
```

---

### Task 4: 도구와 그 밖의 지표

**Files:**
- Modify: `src/adapters/codex/parser.ts`
- Modify: `src/adapters/types.ts`
- Test: `test/adapters/codex/parser-tools.test.ts`

**Interfaces:**
- Consumes: 과제 3의 `CodexSessionParser`.
- Produces: `EXEC_TOOLS`, `CODEX_SHELL_TOOLS`(`["shell"]`), 해석기가 채우는 날짜 칸의 `tools`, `humanRequests`, `models`, `efforts`, `unknownEffort`, `autoCompactions`, `interruptedTurns`, `mcpCalls`, 세션의 `instructionChars`, `SessionSummary.codex.unknownItemTypes`(`src/adapters/codex/parser.ts`, `src/adapters/types.ts`). `CODEX_SHELL_TOOLS`는 3부가 평가 입력의 셸 도구로 넘긴다.

설계 9.6, 9.7, 「5단계 1부 계획에서 보완」의 2·4·12·13번이다.

- 도구는 두 층이다. 호출 층은 `response_item`의 `function_call`·`custom_tool_call`·`web_search_call` 셋이고, 실행 층은 `event_msg`의 `item_completed`다. 이름별 호출·결과·오류는 늘 실행 층에서 센다. 셸 명령(CommandExecution)은 `shell`, 파일 고치기(FileChange)는 `file_change`, MCP 호출(McpToolCall)은 `mcp__<server>`, 그림 보기는 `image_view`, 확장 도구는 `extension`, 검색은 `web_search`다. 결과와 오류는 상태를 보는 종류만이다(셸은 종료 코드가 0이 아니면 오류, 파일 고치기와 MCP 호출은 `status`가 `failed`이면 오류).
- 턴(`task_started`부터 `task_complete`·`turn_aborted`까지. 턴 밖은 한 묶음이고, 턴 시작도 앞 묶음을 닫는다)마다 호출 층이 실행 층보다 많으면 그 차이를 이름 모름(`?`)의 호출로 더한다. 날짜마다 두 층을 따로 세어 차이를 이른 날짜부터, 그날 호출 층이 실행 층보다 많은 만큼까지 그날에 나눈다. 나눈 것의 합은 턴 전체의 차이다(호출 층이 많은 날과 실행 층이 많은 날이 따로 있어도 넘지 않는다). 날짜를 몰라 세지 못한 호출과 실행은 어느 층에도 넣지 않는다(「5단계 1부 계획에서 보완」의 12번. 계획 초안은 차이를 묶음의 마지막 날짜에 다 넣었고 날짜 없는 호출을 뒤 날짜에 다시 셌다). 그러면 호출 수의 합은 9.6의 "수가 큰 층"이 되고 오류율은 실행 층 그대로다. 호출 층 줄에는 `turn_id`가 없어(작성자 PC 실측) 턴은 줄 차례로 묶는다.
- 사람 요청은 `UserMessage`, 도구가 아닌 종류(`AgentMessage`, `Reasoning`, `ContextCompaction`)는 세지 않는다. 그 밖의 종류는 정체 모름이라 도구 수에 넣지 않고 종류별로 센다. 작성자 PC에서 본 새 종류(`SubAgentActivity`, `CollabAgentToolCall`, `Plan`)도 지금은 정체 모름이다. 도구로 볼지는 규칙 표와 함께 3부에서 정한다(「5단계 1부 계획에서 보완」의 4번).
- 모델과 추론 강도는 창마다 `turn_context`의 `model`·`effort`를 붙인다. 창은 앞 턴이 끝난 뒤(`task_complete`, `turn_aborted`)부터 이 턴이 끝날 때까지이고, 턴 시작은 창을 나누지 않는다. 창에서 문맥보다 앞에 온 응답에도 하나하나 그 창의 문맥을 붙인다(같은 날에 여럿이어도 하나하나다). 같은 창의 새 문맥에 모델이나 강도가 없으면 앞 문맥의 것을 이어 쓰지 않는다. 창에 문맥이 없으면 앞 턴의 것을 쓰지 않고 모델을 모르고(`models`에 넣지 않는다) 강도를 모르는 것(`unknownEffort`)으로 센다. 문맥에 강도가 없어도 모르는 강도다(「5단계 1부 계획에서 보완」의 13번. 계획 초안은 앞 턴의 강도를 이어 썼다).
- 압축은 `compacted`, 끊은 턴은 `turn_aborted`, MCP 호출은 McpToolCall의 `server`, 지침 크기는 첫 `world_state`의 `state.agents_md.text` 글자 수(아스키와 그 밖으로 나눔)다.
- 시각이 없는 세는 줄(사람 요청, 도구, 호출 층, 끊은 턴, 압축)도 과제 3의 날짜 규칙을 따른다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/parser-tools.test.ts`(새 파일):

```ts
// Codex 세션 해석 2. 도구(실행 층의 이름별 호출·결과·오류, 턴마다 호출 층과 실행 층 가운데 큰 쪽), 정체 모를 항목 종류, 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기, 시각이 없는 세는 줄을 시험한다(설계 9.6, 9.7)
import { describe, expect, it } from "vitest";
import { CodexSessionParser } from "../../../src/adapters/codex/parser.ts";

const TZ = "Asia/Seoul";
const T = "2026-11-10T01:00:00Z";
const line = (type: string, payload: Record<string, unknown>, timestamp = T) => JSON.stringify({ timestamp, type, payload });
const meta = () => line("session_meta", { id: "s", thread_source: "user" });
const item = (item: Record<string, unknown>, timestamp = T) => line("event_msg", { type: "item_completed", item }, timestamp);
const started = () => line("event_msg", { type: "task_started", turn_id: "t" });
const completed = () => line("event_msg", { type: "task_complete", turn_id: "t" });
const call = (name: string, timestamp = T) => line("response_item", { type: "custom_tool_call", name, call_id: `c-${name}` }, timestamp);
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: n + 1 });
const record = (id: string, n: number) => line("token_usage_record", { response_id: id, usage: usage(n), thread_token_usage: usage(n) });
function run(lines: string[]) {
  const parser = new CodexSessionParser({ recordId: "r", timeZone: TZ });
  for (const text of lines) parser.line(text);
  return parser.finish(null, false);
}
const day = (lines: string[]) => run(lines).days["2026-11-10"]!;

describe("도구", () => {
  it("실행 층의 종류를 공통 이름으로 세고, 상태를 보는 종류만 결과와 오류를 낸다(셸은 0이 아닌 종료 코드, 파일 고치기와 MCP 호출은 failed)", () => {
    const tools = day([
      meta(),
      item({ type: "CommandExecution", id: "1", exit_code: 0, status: "completed" }),
      item({ type: "CommandExecution", id: "2", exit_code: 2, status: "failed" }),
      item({ type: "FileChange", id: "3", status: "completed" }),
      item({ type: "FileChange", id: "4", status: "failed" }),
      item({ type: "McpToolCall", id: "5", server: "github", status: "completed" }),
      item({ type: "ImageView", id: "6" }),
      item({ type: "WebSearch", id: "7" }),
      item({ type: "Extension", id: "8" }),
    ]).tools;
    expect(tools.shell).toMatchObject({ calls: 2, results: 2, errors: 1 });
    expect(tools.file_change).toMatchObject({ calls: 2, results: 2, errors: 1 });
    expect(tools.mcp__github).toMatchObject({ calls: 1, results: 1, errors: 0 });
    expect(tools.image_view).toMatchObject({ calls: 1, results: 0, errors: 0 });
    expect(tools.web_search).toMatchObject({ calls: 1, results: 0 });
    expect(tools.extension).toMatchObject({ calls: 1, results: 0 });
  });

  it("턴마다 호출 층이 실행 층보다 많으면 그 차이를 이름 모름(?)의 호출로 더한다. 실행 층이 많거나 같으면 실행 층만이다", () => {
    const more = day([meta(), started(), call("apply_patch"), call("shell"), call("shell"), item({ type: "CommandExecution", id: "1", exit_code: 0 }), item({ type: "FileChange", id: "2", status: "completed" }), completed()]).tools;
    expect(more.shell!.calls + more.file_change!.calls + (more["?"]?.calls ?? 0)).toBe(3);
    expect(more["?"]).toMatchObject({ calls: 1, results: 0 });
    const fewer = day([meta(), started(), call("shell"), item({ type: "CommandExecution", id: "1", exit_code: 0 }), item({ type: "CommandExecution", id: "2", exit_code: 0 }), completed()]).tools;
    expect(fewer.shell!.calls).toBe(2);
    expect(fewer["?"]).toBeUndefined();
  });

  it("턴 밖의 사건은 한 묶음으로 같은 방법을 쓴다", () => {
    const tools = day([meta(), call("a"), call("b"), item({ type: "CommandExecution", id: "1", exit_code: 0 })]).tools;
    expect(tools.shell!.calls + (tools["?"]?.calls ?? 0)).toBe(2);
  });

  it("정체 모를 항목 종류는 도구 수에 넣지 않고 종류별로 센다. 도구가 아닌 종류는 세지 않는다", () => {
    const summary = run([meta(), item({ type: "Teleport", id: "1" }), item({ type: "Teleport", id: "2" }), item({ type: "AgentMessage", id: "3" }), item({ type: "Reasoning", id: "4" }), item({ type: "ContextCompaction", id: "5" })]);
    expect(summary.days["2026-11-10"]?.tools ?? {}).toEqual({});
    expect(summary.codex?.unknownItemTypes).toEqual({ Teleport: 2 });
  });
});

describe("도구 묶음의 날짜와 경계", () => {
  it("날짜를 넘는 턴은 이름 모름의 호출을 날짜 차례로, 그날 호출 층이 실행 층보다 많은 만큼까지 그날에 나눈다", () => {
    const summary = run([meta(), started(), call("a", "2026-11-11T14:59:00Z"), call("b", "2026-11-11T15:01:00Z"), completed()]);
    expect(summary.days["2026-11-11"]?.tools["?"]).toMatchObject({ calls: 1 });
    expect(summary.days["2026-11-12"]?.tools["?"]).toMatchObject({ calls: 1 });
    const mixed = run([meta(), started(), call("a", "2026-11-11T14:59:00Z"), item({ type: "CommandExecution", id: "1", exit_code: 0 }, "2026-11-11T14:59:30Z"), call("b", "2026-11-11T15:01:00Z"), call("c", "2026-11-11T15:02:00Z"), completed()]);
    expect(mixed.days["2026-11-11"]?.tools["?"]).toBeUndefined();
    expect(mixed.days["2026-11-12"]?.tools["?"]).toMatchObject({ calls: 2 });
  });

  it("날짜마다 나눈 이름 모름의 합은 턴 전체에서 호출 층이 실행 층보다 많은 만큼이다. 호출 층이 많은 날과 실행 층이 많은 날이 따로 있어도 넘지 않는다", () => {
    const summary = run([meta(), started(), call("a", "2026-11-11T14:58:00Z"), call("b", "2026-11-11T14:59:00Z"), item({ type: "CommandExecution", id: "1", exit_code: 0 }, "2026-11-11T15:01:00Z"), completed()]);
    expect(summary.days["2026-11-11"]?.tools["?"]).toMatchObject({ calls: 1 });
    expect(summary.days["2026-11-12"]?.tools["?"]).toBeUndefined();
    expect(summary.days["2026-11-12"]?.tools.shell).toMatchObject({ calls: 1 });
    const calls = Object.values(summary.days).reduce((sum, cell) => sum + Object.values(cell.tools).reduce((inner, tool) => inner + tool.calls, 0), 0);
    expect(calls).toBe(2);
  });

  it("턴이 세 날짜를 넘으면 남은 차이를 이른 날짜부터 나눈다", () => {
    const summary = run([meta(), started(), call("a", "2026-11-10T01:00:00Z"), call("b", "2026-11-11T01:00:00Z"), item({ type: "CommandExecution", id: "1", exit_code: 0 }, "2026-11-12T01:00:00Z"), completed()]);
    expect(summary.days["2026-11-10"]?.tools["?"]).toMatchObject({ calls: 1 });
    expect(summary.days["2026-11-11"]?.tools["?"]).toBeUndefined();
    expect(summary.days["2026-11-12"]?.tools.shell).toMatchObject({ calls: 1 });
  });

  it("날짜를 몰라 세지 못한 호출은 이름 모름의 호출로 다시 세지 않는다", () => {
    const raw = (type: string, payload: Record<string, unknown>) => JSON.stringify({ type, payload });
    const summary = run([raw("session_meta", { id: "s", thread_source: "user" }), raw("response_item", { type: "custom_tool_call", name: "x", call_id: "u1" }), call("y")]);
    expect(summary.notes.undatedLines).toBe(1);
    expect(summary.days["2026-11-10"]?.tools["?"]).toMatchObject({ calls: 1 });
  });

  it("호출 층은 function_call, custom_tool_call, web_search_call 셋이다", () => {
    for (const type of ["function_call", "custom_tool_call", "web_search_call"]) {
      const tools = day([meta(), line("response_item", { type, name: "x", call_id: `c-${type}` })]).tools;
      expect(tools["?"], type).toMatchObject({ calls: 1 });
    }
  });

  it("턴 시작은 도구 묶음을 닫는다. 턴 밖의 호출과 다음 턴의 실행을 한 묶음으로 상쇄하지 않는다", () => {
    const tools = day([meta(), call("a"), started(), item({ type: "CommandExecution", id: "1", exit_code: 0 }), completed()]).tools;
    expect(tools["?"]).toMatchObject({ calls: 1 });
    expect(tools.shell).toMatchObject({ calls: 1 });
  });
});

describe("시각이 없는 줄", () => {
  const raw = (type: string, payload: Record<string, unknown>) => JSON.stringify({ type, payload });
  const bare = (item: Record<string, unknown>) => raw("event_msg", { type: "item_completed", item });

  it("시각이 없는 사람 요청, 도구, 끊은 턴, 압축은 바로 앞 줄의 날짜 칸에 든다(1단계와 같다)", () => {
    const cell = day([meta(), bare({ type: "UserMessage", id: "u1" }), bare({ type: "CommandExecution", id: "x1", exit_code: 1 }), raw("event_msg", { type: "turn_aborted", turn_id: "t" }), raw("compacted", {})]);
    expect(cell).toMatchObject({ humanRequests: 1, interruptedTurns: 1, autoCompactions: 1 });
    expect(cell.tools.shell).toMatchObject({ calls: 1, results: 1, errors: 1 });
  });

  it("앞의 줄이 모두 시각이 없으면 사람 요청, 도구, 호출 층, 끊은 턴, 압축의 줄을 날짜를 몰라 세지 못한 줄로 센다. 도구가 아닌 종류와 정체 모를 종류는 세지 않는다", () => {
    const summary = run([
      raw("session_meta", { id: "s", thread_source: "user" }),
      bare({ type: "AgentMessage", id: "a1" }),
      bare({ type: "Teleport", id: "t1" }),
      bare({ type: "UserMessage", id: "u1" }),
      raw("response_item", { type: "custom_tool_call", name: "shell", call_id: "c1" }),
      bare({ type: "CommandExecution", id: "x1", exit_code: 0 }),
      raw("event_msg", { type: "turn_aborted", turn_id: "t" }),
      raw("compacted", {}),
      item({ type: "UserMessage", id: "u2" }),
    ]);
    expect(summary.notes.undatedLines).toBe(5);
    expect(summary.days).toEqual({ "2026-11-10": expect.objectContaining({ humanRequests: 1, tools: {}, interruptedTurns: 0, autoCompactions: 0 }) });
  });
});

describe("그 밖의 지표", () => {
  it("사람 요청은 UserMessage다", () => {
    expect(day([meta(), item({ type: "UserMessage", id: "u1" }), item({ type: "UserMessage", id: "u2" })]).humanRequests).toBe(2);
  });

  it("turn_context의 모델과 추론 강도를 그 창(앞 턴이 끝난 뒤부터 이 턴이 끝날 때까지)의 응답에 붙인다. 창에서 문맥보다 앞에 온 응답에도 붙이고, 강도가 없으면 모르는 강도로 센다", () => {
    const cell = day([meta(), record("r0", 5), line("turn_context", { model: "gpt-6.1-sol", effort: "xhigh" }), record("r1", 10), record("r2", 20), line("turn_context", { model: "gpt-6.1-sol" }), record("r3", 30)]);
    expect(cell.models).toEqual({ "gpt-6.1-sol": 4 });
    expect(cell.efforts).toEqual({ xhigh: 3 });
    expect(cell.unknownEffort).toBe(1);
  });

  it("문맥은 턴이 끝나면 닫힌다. 다음 창에 문맥이 없으면 앞 턴의 모델과 강도를 쓰지 않고 모르는 것으로 센다. 턴 시작 앞에 온 문맥은 그 턴의 것이다", () => {
    const cell = day([
      meta(),
      started(),
      line("turn_context", { model: "m", effort: "high" }),
      record("r1", 10),
      completed(),
      started(),
      record("r2", 20),
      completed(),
      line("turn_context", { model: "m", effort: "low" }),
      started(),
      record("r3", 30),
      completed(),
    ]);
    expect(cell.efforts).toEqual({ high: 1, low: 1 });
    expect(cell.unknownEffort).toBe(1);
    expect(cell.models).toEqual({ m: 2 });
  });
  it("창에서 문맥보다 앞에 온 응답이 같은 날에 여럿이면 하나하나 그 창의 문맥을 붙인다", () => {
    const cell = day([meta(), record("r1", 10), record("r2", 10), line("turn_context", { model: "m", effort: "high" })]);
    expect(cell.models).toEqual({ m: 2 });
    expect(cell.efforts).toEqual({ high: 2 });
    expect(cell.unknownEffort).toBe(0);
  });

  it("같은 창의 새 문맥에 모델이 없으면 앞 문맥의 모델을 이어 쓰지 않는다", () => {
    const cell = day([meta(), line("turn_context", { model: "m", effort: "high" }), record("r1", 10), line("turn_context", { effort: "low" }), record("r2", 10)]);
    expect(cell.models).toEqual({ m: 1 });
    expect(cell.efforts).toEqual({ high: 1, low: 1 });
  });

  it("compacted는 압축으로, turn_aborted는 끊은 턴으로 센다", () => {
    const cell = day([meta(), line("compacted", {}), line("event_msg", { type: "turn_aborted", turn_id: "t" })]);
    expect(cell).toMatchObject({ autoCompactions: 1, interruptedTurns: 1 });
  });

  it("MCP 호출은 McpToolCall의 server로 센다", () => {
    expect(day([meta(), item({ type: "McpToolCall", id: "1", server: "github", status: "completed" }), item({ type: "McpToolCall", id: "2", server: "github", status: "completed" })]).mcpCalls).toEqual({ github: 2 });
  });

  it("지침 크기는 world_state의 agents_md 글자 수다(아스키와 그 밖으로 나눠 센다). 처음 것만 쓴다", () => {
    const summary = run([meta(), line("world_state", { state: { agents_md: { text: "ab가" } } }), line("world_state", { state: { agents_md: { text: "zzzz" } } })]);
    expect(summary.instructionChars).toEqual({ ascii: 2, other: 1 });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/parser-tools.test.ts`
Expected: FAIL. 시험 20개가 모두 실패한다. 과제 3의 해석기는 실행 층과 호출 층, 사람 요청, `turn_context`, `compacted`, `turn_aborted`, `world_state`를 세지 않는다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/parser.ts`(찾을 곳 1/9):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가른다(설계 9.2, 9.6, 「5단계 계획 전 결정」 1·7번)
import { nameRecord } from "../common/canonical.ts";
```

`src/adapters/codex/parser.ts`(바꾼 뒤 1/9):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가르고, 도구는 실행 층에서 이름별로 세되 턴마다 호출 층이 더 많으면 그 차이를 이름 모름으로 더한다. 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기도 센다(설계 9.2, 9.6, 9.7, 「5단계 계획 전 결정」 1·7번)
import { UNKNOWN_TOOL } from "../claude/parser.ts";
import { nameRecord } from "../common/canonical.ts";
```

`src/adapters/codex/parser.ts`(찾을 곳 2/9):

```ts
import type { CodexIdFallback } from "../types.ts";
import { canonicalDay, emptyDay, type DayCell, type SessionKind, type SessionSummary, type TokenCounts } from "../types.ts";

```

`src/adapters/codex/parser.ts`(바꾼 뒤 2/9):

```ts
import type { CodexIdFallback } from "../types.ts";
import { canonicalDay, emptyDay, emptyToolCounts, type DayCell, type SessionKind, type SessionSummary, type TokenCounts, type ToolCounts } from "../types.ts";

/** 실행 층(item_completed)의 도구 종류와 그 공통 이름. 상태를 보는 종류는 결과와 오류를 낸다(설계 9.6) */
export const EXEC_TOOLS: ReadonlyMap<string, { name: string; status: boolean }> = new Map([
  ["CommandExecution", { name: "shell", status: true }],
  ["FileChange", { name: "file_change", status: true }],
  ["McpToolCall", { name: "mcp", status: true }],
  ["ImageView", { name: "image_view", status: false }],
  ["Extension", { name: "extension", status: false }],
  ["WebSearch", { name: "web_search", status: false }],
]);
/** Codex의 셸 명령 이름. 평가 입력의 shellTools로 넘긴다 */
export const CODEX_SHELL_TOOLS: readonly string[] = ["shell"];
/** 도구가 아닌 실행 층 종류(설계 9.6) */
const NON_TOOL_ITEMS: ReadonlySet<string> = new Set(["UserMessage", "AgentMessage", "Reasoning", "ContextCompaction"]);
/** 호출 층(response_item)의 도구 호출 종류 */
const CALL_TYPES: ReadonlySet<string> = new Set(["function_call", "custom_tool_call", "web_search_call"]);

```

`src/adapters/codex/parser.ts`(찾을 곳 3/9):

```ts
  private readonly seenResponses = new Set<string>();

```

`src/adapters/codex/parser.ts`(바꾼 뒤 3/9):

```ts
  private readonly seenResponses = new Set<string>();
  /** 지금 창(앞 턴이 끝난 뒤부터 이 턴이 끝날 때까지)의 turn_context의 모델과 추론 강도, 그 창에서 문맥을 봤는지, 문맥보다 앞에 와서 아직 문맥을 붙이지 못한 응답의 칸 */
  private model: string | null = null;
  private effort: string | null = null;
  private contextSeen = false;
  private readonly pendingCells: DayCell[] = [];
  /** 지금 묶음(턴, 또는 턴 밖)에서 날짜마다 센 호출 층과 실행 층의 도구 수. 날짜를 몰라 세지 못한 줄은 넣지 않는다 */
  private readonly groupCalls = new Map<LocalDate, number>();
  private readonly groupExec = new Map<LocalDate, number>();
  private readonly unknownItemTypes = nameRecord<number>();
  private instructionChars: { ascii: number; other: number } | null = null;

```

`src/adapters/codex/parser.ts`(찾을 곳 4/9):

```ts

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다 */
```

`src/adapters/codex/parser.ts`(바꾼 뒤 4/9):

```ts

  private tool(cell: DayCell, name: string): ToolCounts {
    let counts = cell.tools[name];
    if (!counts) {
      counts = emptyToolCounts();
      cell.tools[name] = counts;
    }
    return counts;
  }

  /**
   * 묶음을 닫는다. 호출 층이 실행 층보다 많으면 그 차이를 이름 모름의 호출로 더한다(설계 9.6). 차이는 날짜 차례로, 그날 호출 층이 실행 층보다 많은 만큼까지
   * 그날에 나눈다. 날짜를 몰라 세지 못한 줄은 어느 층에도 넣지 않았다(「5단계 1부 계획에서 보완」)
   */
  private closeGroup(): void {
    const sum = (counts: Map<LocalDate, number>): number => [...counts.values()].reduce((total, n) => total + n, 0);
    let extra = sum(this.groupCalls) - sum(this.groupExec);
    for (const date of [...this.groupCalls.keys()].sort()) {
      if (extra <= 0) break;
      const give = Math.min(extra, this.groupCalls.get(date)! - (this.groupExec.get(date) ?? 0));
      if (give <= 0) continue;
      this.tool(this.day(date), UNKNOWN_TOOL).calls += give;
      extra -= give;
    }
    this.groupCalls.clear();
    this.groupExec.clear();
  }

  /** 문맥의 창을 닫는다. 창에서 문맥을 보지 못한 응답은 모델을 모르고 추론 강도를 모르는 것으로 센다(설계 9.6 「그 턴의 응답들에 적용」) */
  private closeContext(): void {
    for (const cell of this.pendingCells.splice(0)) cell.unknownEffort++;
    this.model = null;
    this.effort = null;
    this.contextSeen = false;
  }

  /** 응답 하나의 칸에 지금 창의 모델과 추론 강도를 붙인다 */
  private attribute(cell: DayCell): void {
    if (this.model !== null) cell.models[this.model] = (Object.hasOwn(cell.models, this.model) ? cell.models[this.model]! : 0) + 1;
    if (this.effort !== null) cell.efforts[this.effort] = (Object.hasOwn(cell.efforts, this.effort) ? cell.efforts[this.effort]! : 0) + 1;
    else cell.unknownEffort++;
  }

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다 */
```

`src/adapters/codex/parser.ts`(찾을 곳 5/9):

```ts
    }
    if (row.type === "token_usage_record") this.newRecord(payload);
  }
```

`src/adapters/codex/parser.ts`(바꾼 뒤 5/9):

```ts
    }
    if (row.type === "token_usage_record") return this.newRecord(payload);
    if (row.type === "turn_context") {
      this.model = str(payload.model);
      this.effort = str(payload.effort);
      // 창에서 문맥보다 앞에 온 응답에도 이 문맥을 붙인다
      if (!this.contextSeen) {
        this.contextSeen = true;
        for (const cell of this.pendingCells.splice(0)) this.attribute(cell);
      }
      return;
    }
    if (row.type === "event_msg" && (payload.type === "task_started" || payload.type === "task_complete" || payload.type === "turn_aborted")) {
      this.closeGroup();
      // 턴 시작은 도구 묶음만 닫는다. 문맥은 시작 앞에 오기도 해서 턴이 끝날 때 닫는다
      if (payload.type !== "task_started") this.closeContext();
      if (payload.type === "turn_aborted") {
        const date = this.dateOf();
        if (date !== null) this.day(date).interruptedTurns++;
      }
      return;
    }
    if (row.type === "response_item" && typeof payload.type === "string" && CALL_TYPES.has(payload.type)) {
      const date = this.dateOf();
      if (date !== null) this.groupCalls.set(date, (this.groupCalls.get(date) ?? 0) + 1);
      return;
    }
    if (row.type === "event_msg" && payload.type === "item_completed") return this.item(obj(payload.item));
    if (row.type === "compacted") {
      const date = this.dateOf();
      if (date !== null) this.day(date).autoCompactions++;
      return;
    }
    if (row.type === "world_state" && this.instructionChars === null) {
      const text = obj(obj(obj(payload.state)?.agents_md))?.text;
      if (typeof text === "string") {
        let ascii = 0;
        let other = 0;
        for (const char of text) {
          if (char.codePointAt(0)! < 128) ascii++;
          else other++;
        }
        this.instructionChars = { ascii, other };
      }
    }
  }

  /** 실행 층의 사건 하나. 도구면 이름별로 세고, 사람 요청이면 세고, 도구가 아닌 종류는 넘기며, 모르는 종류는 따로 센다 */
  private item(item: Json | null): void {
    if (item === null) return;
    const type = str(item.type);
    if (type === null) return;
    if (type === "UserMessage") {
      const date = this.dateOf();
      if (date !== null) this.day(date).humanRequests++;
      return;
    }
    if (NON_TOOL_ITEMS.has(type)) return;
    const kind = EXEC_TOOLS.get(type);
    if (kind === undefined) {
      this.unknownItemTypes[type] = (Object.hasOwn(this.unknownItemTypes, type) ? this.unknownItemTypes[type]! : 0) + 1;
      return;
    }
    const date = this.dateOf();
    if (date === null) return;
    this.groupExec.set(date, (this.groupExec.get(date) ?? 0) + 1);
    const cell = this.day(date);
    const server = type === "McpToolCall" ? str(item.server) : null;
    const name = type === "McpToolCall" ? `mcp__${server ?? UNKNOWN_TOOL}` : kind.name;
    const counts = this.tool(cell, name);
    counts.calls++;
    if (type === "McpToolCall" && server !== null) cell.mcpCalls[server] = (Object.hasOwn(cell.mcpCalls, server) ? cell.mcpCalls[server]! : 0) + 1;
    if (!kind.status) return;
    counts.results++;
    const failed = type === "CommandExecution" ? typeof item.exit_code === "number" && item.exit_code !== 0 : item.status === "failed";
    if (failed) counts.errors++;
  }
```

`src/adapters/codex/parser.ts`(찾을 곳 6/9):

```ts
    for (const key of KEYS) cell.tokens[key] += add[key];
  }
```

`src/adapters/codex/parser.ts`(바꾼 뒤 6/9):

```ts
    for (const key of KEYS) cell.tokens[key] += add[key];
    if (this.contextSeen) this.attribute(cell);
    else this.pendingCells.push(cell);
  }
```

`src/adapters/codex/parser.ts`(찾을 곳 7/9):

```ts
    }
    if (!this.firstLineSeen) this.idFallback = "no-lines";
```

`src/adapters/codex/parser.ts`(바꾼 뒤 7/9):

```ts
    }
    this.closeGroup();
    this.closeContext();
    if (!this.firstLineSeen) this.idFallback = "no-lines";
```

`src/adapters/codex/parser.ts`(찾을 곳 8/9):

```ts
      days,
      instructionChars: null,
      initialSkills: null,
```

`src/adapters/codex/parser.ts`(바꾼 뒤 8/9):

```ts
      days,
      instructionChars: this.instructionChars,
      initialSkills: null,
```

`src/adapters/codex/parser.ts`(찾을 곳 9/9):

```ts
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback },
    };
```

`src/adapters/codex/parser.ts`(바꾼 뒤 9/9):

```ts
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback, unknownItemTypes: this.unknownItemTypes },
    };
```

`src/adapters/types.ts`(찾을 곳):

```ts
  codex?: { recordId: string; unknownThreadSource: string | null; idFallback: CodexIdFallback | null };
```

`src/adapters/types.ts`(바꾼 뒤):

```ts
  codex?: { recordId: string; unknownThreadSource: string | null; idFallback: CodexIdFallback | null; unknownItemTypes: Record<string, number> };
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex/parser-tools.test.ts test/adapters/codex/parser.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 37개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/parser-tools.test.ts src/adapters/codex/parser.ts src/adapters/types.ts
git commit -m "feat: Codex 기록의 도구와 그 밖의 지표를 셈"
```

---

### Task 5: 이어받은 앞부분 빼기

**Files:**
- Modify: `src/adapters/codex/parser.ts`
- Modify: `src/adapters/types.ts`
- Test: `test/adapters/codex/parser-inherit.test.ts`

**Interfaces:**
- Consumes: 과제 3·4의 `CodexSessionParser`, 1단계의 `fnv1a64`.
- Produces: `CodexFingerprints`(`itemIds`, `callIds`, `totals`, `responseIds`), `CodexParserContext.inherited`, `CodexSessionParser.fingerprints()`, `SessionSummary.codex.inheritedSkipped`(`items`, `totals`, `responses`), `SessionSummary.codex.baselineMissing`(`src/adapters/codex/parser.ts`, `src/adapters/types.ts`). 과제 7·8이 쓴다.

설계 9.2, 9.6, 「5단계 계획 전 결정」 7번과 「7번의 세부」, 「5단계 1부 계획에서 보완」의 6번이다.

- 하위 세션은 자기를 띄운 때까지의 부모 대화를 복사해 담고 그 뒤에 자기 일을 이어 쓴다. 작성자 PC의 하위 세션 항목은 대부분이 부모와 같은 `item.id`였고, 복사된 항목도 하위 자신의 `thread_id`와 하위가 쓴 시각을 달고 있어 줄 하나로는 가를 수 없었다. 그래서 자리로 가르지 않고 이어받았을 수 있는 기록의 지문과 견준다.
- 지문은 항목의 `item.id`, 호출 층의 `call_id`, 옛 구간의 누적값(칸 다섯을 차례로 이은 것), 새 구간의 `response_id`를 64비트 FNV-1a로 해시한 것이다. 원문은 되살릴 수 없다.
- 문맥으로 뺄 지문(`inherited`)을 받으면, 그 안에 있는 항목과 호출은 세지 않고, 그 안에 있는 누적값은 기준만 옮기고 늘어난 몫을 세지 않으며, 그 안에 있는 응답은 세지 않는다. 뺀 수를 종류별로 센다. 뺄 지문은 하위 세션이면 부모 세션의 기록들의 지문이고, 같은 세션에 기록이 여럿이면 그보다 앞선 기록들의 지문도 든다. 무엇을 넘길지는 모으기(과제 8)가 정한다. 지문을 받지 않으면 다 센다.
- 이어받아 뺀 도구·사람 요청·호출·누적값·응답의 마지막 줄보다 앞에서 뺄 지문에 없는 누적값을 세면(복사된 앞부분 안에서 기준을 찾지 못한 것이다) `codex.baselineMissing`을 참으로 한다. 끝 표지는 이어받은 호출과 응답도 되고, 부모 누적값으로 기준을 옮긴 뒤 처음 센 자기 누적값도 센 것이다. 숫자는 그대로 두고, 모으기가 이어받은 것을 확인하지 못한 세션으로 센다(결정 7의 "대신 봄"). 작성자 PC의 부모를 가진 하위 기록 가운데 스무 개에 하나꼴이었다.
- 해석기는 자기 기록의 지문을 낸다. 이어받아 뺀 것(응답 ID와 누적값도)도 넣는다(손자 세션이 같은 앞부분을 다시 이어받을 수 있다). 자기 지문은 뺄 지문과 상관없이 기록만으로 정해진다(과제 7의 캐시와 과제 8의 모으기가 기댄다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/parser-inherit.test.ts`(새 파일):

```ts
// Codex 세션 해석 3. 다른 기록(부모)의 앞부분을 이어받은 하위 세션에서 부모에도 있는 항목, 누적값, 응답을 다시 세지 않는 것과, 해석기가 자기 지문을 내는 것을 시험한다(설계 「5단계 계획 전 결정」 7번)
import { describe, expect, it } from "vitest";
import { CodexSessionParser, type CodexFingerprints } from "../../../src/adapters/codex/parser.ts";

const TZ = "Asia/Seoul";
const T = "2026-11-10T01:00:00Z";
const line = (type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp: T, type, payload });
const sub = () => line("session_meta", { id: "child", thread_source: "subagent", parent_thread_id: "mom" });
const item = (item: Record<string, unknown>) => line("event_msg", { type: "item_completed", item });
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: n / 10, reasoning_output_tokens: 0, total_tokens: n + n / 10 });
const count = (n: number) => line("event_msg", { type: "token_count", info: { total_token_usage: usage(n) } });
const record = (id: string, n: number, thread = n) => line("token_usage_record", { response_id: id, usage: usage(n), thread_token_usage: usage(thread) });

/** 부모 기록을 해석기에 먹여 지문을 얻는다 */
function fingerprintsOf(lines: string[]): CodexFingerprints {
  const parser = new CodexSessionParser({ recordId: "mom-record", timeZone: TZ });
  for (const text of lines) parser.line(text);
  parser.finish(null, false);
  return parser.fingerprints();
}
function run(lines: string[], inherited: CodexFingerprints | null) {
  const parser = new CodexSessionParser({ recordId: "child-record", timeZone: TZ, inherited });
  for (const text of lines) parser.line(text);
  return parser.finish(null, false);
}

const MOM = [
  line("session_meta", { id: "mom", thread_source: "user" }),
  item({ type: "UserMessage", id: "u1" }),
  item({ type: "CommandExecution", id: "x1", exit_code: 0 }),
  count(100),
  count(200),
  record("r1", 50, 250),
];

describe("이어받은 것을 다시 세지 않는다", () => {
  it("부모 기록에도 같은 item.id가 있는 항목은 하위 세션의 도구와 사람 요청에서 뺀다. 자기 항목은 센다", () => {
    const summary = run([sub(), item({ type: "UserMessage", id: "u1" }), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), item({ type: "CommandExecution", id: "x2", exit_code: 1 })], fingerprintsOf(MOM));
    const cell = summary.days["2026-11-10"]!;
    expect(cell.humanRequests).toBe(0);
    expect(cell.tools.shell).toMatchObject({ calls: 1, results: 1, errors: 1 });
    expect(summary.codex?.inheritedSkipped).toMatchObject({ items: 2 });
  });

  it("옛 구간에서 부모 기록에도 있는 누적값으로 늘어난 몫은 세지 않고, 그 뒤 부모에 없는 누적값으로 늘어난 몫만 센다", () => {
    const summary = run([sub(), count(100), count(200), count(260)], fingerprintsOf(MOM));
    expect(summary.days["2026-11-10"]).toMatchObject({ responses: 1, tokens: { input: 60, output: 6 } });
    expect(summary.codex?.inheritedSkipped).toMatchObject({ totals: 2 });
  });

  it("새 구간에서 부모 기록에도 있는 response_id의 응답은 세지 않는다", () => {
    const summary = run([sub(), record("r1", 50, 250), record("r9", 20, 270)], fingerprintsOf(MOM));
    expect(summary.days["2026-11-10"]).toMatchObject({ responses: 1, tokens: { input: 20 } });
    expect(summary.codex?.inheritedSkipped).toMatchObject({ responses: 1 });
  });

  it("부모 기록에도 있는 호출 층 호출은 턴의 층 고르기에 넣지 않는다. 이어받은 호출 때문에 이름 모름의 호출이 생기지 않는다", () => {
    const call = (id: string) => line("response_item", { type: "custom_tool_call", name: "exec", call_id: id });
    const mom = fingerprintsOf([line("session_meta", { id: "mom", thread_source: "user" }), call("c1"), item({ type: "CommandExecution", id: "x1", exit_code: 0 })]);
    const summary = run([sub(), call("c1"), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), call("c2"), item({ type: "CommandExecution", id: "x2", exit_code: 0 })], mom);
    expect(summary.days["2026-11-10"]?.tools).toEqual({ shell: expect.objectContaining({ calls: 1 }) });
  });

  it("부모의 누적값이 자기 누적값 사이에 끼면 그 값으로 기준만 옮기고 앞뒤의 자기 몫은 센다", () => {
    const mom = fingerprintsOf([line("session_meta", { id: "mom", thread_source: "user" }), count(200)]);
    const summary = run([sub(), count(100), count(200), count(300)], mom);
    expect(summary.days["2026-11-10"]).toMatchObject({ responses: 2, tokens: { input: 200 } });
  });

  it("부모의 누적값 뒤에 자기 누적값이 줄면 새로 시작된 것으로 그 값을 세고, 뒤에 새 구간이 이어지면 응답 ID로 센다", () => {
    const mom = fingerprintsOf([line("session_meta", { id: "mom", thread_source: "user" }), count(500)]);
    const summary = run([sub(), count(500), count(40), record("r7", 9, 49)], mom);
    expect(summary.days["2026-11-10"]).toMatchObject({ responses: 2, tokens: { input: 49 } });
  });

  it("누적값은 다섯 칸을 모두 견준다. 캐시 쓰기만 다른 누적값은 부모의 것이 아니다", () => {
    const total = (write: number) => line("event_msg", { type: "token_count", info: { total_token_usage: { ...usage(100), cache_write_input_tokens: write } } });
    const mom = fingerprintsOf([line("session_meta", { id: "mom", thread_source: "user" }), total(0)]);
    expect(run([sub(), total(1)], mom).days["2026-11-10"]).toMatchObject({ responses: 1, tokens: { cacheWrite: 1 } });
  });

  it("복사된 앞부분(이어받아 뺀 도구·사람 요청·호출·누적값·응답의 마지막 줄까지) 안에서 뺄 지문에 없는 누적값을 세면 기준을 찾지 못한 기록이다", () => {
    const missing = run([sub(), item({ type: "UserMessage", id: "u1" }), count(150), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), count(400)], fingerprintsOf(MOM));
    expect(missing.codex?.baselineMissing).toBe(true);
    const found = run([sub(), item({ type: "UserMessage", id: "u1" }), count(100), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), count(400)], fingerprintsOf(MOM));
    expect(found.codex?.baselineMissing).toBe(false);
    const weakOnly = run([sub(), count(150), item({ type: "AgentMessage", id: "a1" }), count(400)], fingerprintsOf([...MOM, item({ type: "AgentMessage", id: "a1" })]));
    expect(weakOnly.codex?.baselineMissing).toBe(false);
    expect(run([sub(), count(150)], null).codex?.baselineMissing).toBe(false);
  });

  it("이어받아 뺀 호출 층 호출과 응답도 복사된 앞부분의 끝이다. 그보다 앞에서 뺄 지문에 없는 누적값을 세면 기준을 찾지 못한 기록이다", () => {
    const call = line("response_item", { type: "function_call", name: "x", call_id: "c1" });
    expect(run([sub(), count(150), call], fingerprintsOf([...MOM, call])).codex?.baselineMissing).toBe(true);
    expect(run([sub(), count(150), record("r1", 50, 250)], fingerprintsOf(MOM)).codex?.baselineMissing).toBe(true);
  });

  it("부모 누적값으로 기준을 옮긴 뒤 처음 센 자기 누적값도, 그 뒤에 이어받은 항목이 있으면 기준을 찾지 못한 기록이다", () => {
    const summary = run([sub(), count(100), count(150), item({ type: "CommandExecution", id: "x1", exit_code: 0 })], fingerprintsOf(MOM));
    expect(summary.codex?.baselineMissing).toBe(true);
  });

  it("지문을 받지 않으면 다 센다(부모가 없거나 부모 기록을 읽지 못한 세션)", () => {
    const summary = run([sub(), item({ type: "UserMessage", id: "u1" }), count(100), count(200)], null);
    expect(summary.days["2026-11-10"]).toMatchObject({ humanRequests: 1, responses: 2, tokens: { input: 200 } });
    expect(summary.codex?.inheritedSkipped).toEqual({ items: 0, totals: 0, responses: 0 });
  });
});

describe("지문", () => {
  it("해석기는 자기 기록의 item.id, 누적값, response_id의 지문을 낸다. 원문이 아니라 해시다", () => {
    const prints = fingerprintsOf(MOM);
    expect(prints.itemIds.size).toBe(2);
    expect(prints.totals.size).toBe(2);
    expect(prints.responseIds.size).toBe(1);
    for (const value of [...prints.itemIds, ...prints.totals, ...prints.responseIds]) expect(value).toMatch(/^[0-9a-f]{16}$/);
  });

  it("이어받아 뺀 것은 자기 지문에도 넣는다(손자 세션이 같은 앞부분을 다시 이어받을 수 있다)", () => {
    const parser = new CodexSessionParser({ recordId: "child-record", timeZone: TZ, inherited: fingerprintsOf(MOM) });
    for (const text of [sub(), item({ type: "UserMessage", id: "u1" }), item({ type: "CommandExecution", id: "x2", exit_code: 0 })]) parser.line(text);
    parser.finish(null, false);
    expect(parser.fingerprints().itemIds.size).toBe(2);
  });

  it("이어받아 뺀 응답 ID와 누적값도 자기 지문에 넣는다", () => {
    const parser = new CodexSessionParser({ recordId: "child-record", timeZone: TZ, inherited: fingerprintsOf(MOM) });
    for (const text of [sub(), count(100), record("r1", 50, 250)]) parser.line(text);
    parser.finish(null, false);
    expect(parser.fingerprints().responseIds.size).toBe(1);
    expect(parser.fingerprints().totals.size).toBe(1);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/parser-inherit.test.ts`
Expected: FAIL. 시험 14개가 모두 실패한다. 과제 4의 해석기는 뺄 지문을 받지 않아 다 세고, `codex.inheritedSkipped`, `codex.baselineMissing`, `fingerprints()`가 없다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/parser.ts`(찾을 곳 1/11):

```ts
import { nameRecord } from "../common/canonical.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
```

`src/adapters/codex/parser.ts`(바꾼 뒤 1/11):

```ts
import { nameRecord } from "../common/canonical.ts";
import { fnv1a64 } from "../common/hash.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
```

`src/adapters/codex/parser.ts`(찾을 곳 2/11):

```ts

export interface CodexParserContext {
```

`src/adapters/codex/parser.ts`(바꾼 뒤 2/11):

```ts

/** 기록 하나의 지문. 항목의 item.id, 호출 층의 call_id, 옛 구간의 누적값, 새 구간의 response_id를 해시로 둔다(원문은 되살릴 수 없다) */
export interface CodexFingerprints {
  itemIds: ReadonlySet<string>;
  callIds: ReadonlySet<string>;
  totals: ReadonlySet<string>;
  responseIds: ReadonlySet<string>;
}

export interface CodexParserContext {
```

`src/adapters/codex/parser.ts`(찾을 곳 3/11):

```ts
  timeZone: string;
}
```

`src/adapters/codex/parser.ts`(바꾼 뒤 3/11):

```ts
  timeZone: string;
  /** 뺄 지문. 이 기록이 앞부분을 이어받았을 수 있는 기록(하위 세션이면 부모 세션의 기록들, 같은 세션에 기록이 여럿이면 그보다 앞선 기록들)의 지문이다. 그 안에 있는 것은 이 기록의 것으로 세지 않는다. 없으면 다 센다(「5단계 계획 전 결정」 7번) */
  inherited?: CodexFingerprints | null;
}
```

`src/adapters/codex/parser.ts`(찾을 곳 4/11):

```ts

/** 앞선 버전의 꼬리를 떼어 x.y.z로 맞춘다(0.140.0-alpha.19는 0.140.0). 꼴이 다르면 null이다 */
```

`src/adapters/codex/parser.ts`(바꾼 뒤 4/11):

```ts

/** 누적값의 지문. 칸의 차례를 고정해 해시한다 */
const totalPrint = (total: Usage): string => fnv1a64(KEYS.map((key) => total[key]).join("|"));

/** 앞선 버전의 꼬리를 떼어 x.y.z로 맞춘다(0.140.0-alpha.19는 0.140.0). 꼴이 다르면 null이다 */
```

`src/adapters/codex/parser.ts`(찾을 곳 5/11):

```ts
  private instructionChars: { ascii: number; other: number } | null = null;

```

`src/adapters/codex/parser.ts`(바꾼 뒤 5/11):

```ts
  private instructionChars: { ascii: number; other: number } | null = null;
  /** 자기 기록의 지문(이어받아 뺀 것도 넣는다. 손자 세션이 같은 앞부분을 다시 이어받을 수 있다) */
  private readonly myItemIds = new Set<string>();
  private readonly myCallIds = new Set<string>();
  private readonly myTotals = new Set<string>();
  private readonly myResponseIds = new Set<string>();
  private readonly inheritedSkipped = { items: 0, totals: 0, responses: 0 };
  /**
   * 이어받아 뺀 강한 것(도구와 사람 요청의 항목, 호출, 누적값, 응답)의 마지막 줄 자리와, 뺄 지문을 받고 처음 센 옛 구간 누적값의 줄 자리. 뒤의 것이 앞의 것보다 앞이면
   * 복사된 앞부분 안에서 뺄 지문에 없는 누적값을 센 것이라 기준을 찾지 못한 기록이다(「5단계 계획 전 결정」 7번)
   */
  private lastInheritedLine = -1;
  private firstCountedOldLine = -1;

```

`src/adapters/codex/parser.ts`(찾을 곳 6/11):

```ts
    if (row.type === "response_item" && typeof payload.type === "string" && CALL_TYPES.has(payload.type)) {
      const date = this.dateOf();
```

`src/adapters/codex/parser.ts`(바꾼 뒤 6/11):

```ts
    if (row.type === "response_item" && typeof payload.type === "string" && CALL_TYPES.has(payload.type)) {
      const callId = str(payload.call_id);
      if (callId !== null) {
        const print = fnv1a64(callId);
        this.myCallIds.add(print);
        if (this.ctx.inherited?.callIds.has(print)) {
          this.lastInheritedLine = this.lines;
          return;
        }
      }
      const date = this.dateOf();
```

`src/adapters/codex/parser.ts`(찾을 곳 7/11):

```ts
    if (type === null) return;
    if (type === "UserMessage") {
```

`src/adapters/codex/parser.ts`(바꾼 뒤 7/11):

```ts
    if (type === null) return;
    const itemId = str(item.id);
    if (itemId !== null) {
      const print = fnv1a64(itemId);
      this.myItemIds.add(print);
      if (this.ctx.inherited?.itemIds.has(print)) {
        this.inheritedSkipped.items++;
        if (type === "UserMessage" || EXEC_TOOLS.has(type)) this.lastInheritedLine = this.lines;
        return;
      }
    }
    if (type === "UserMessage") {
```

`src/adapters/codex/parser.ts`(찾을 곳 8/11):

```ts
    this.lastOldTotal = total;
    if (previous === null) return this.count(total);
```

`src/adapters/codex/parser.ts`(바꾼 뒤 8/11):

```ts
    this.lastOldTotal = total;
    const print = totalPrint(total);
    this.myTotals.add(print);
    if (this.ctx.inherited?.totals.has(print)) {
      this.inheritedSkipped.totals++;
      this.lastInheritedLine = this.lines;
      return;
    }
    if (this.ctx.inherited && this.firstCountedOldLine < 0 && (previous === null || compareUsage(total, previous) !== "equal")) this.firstCountedOldLine = this.lines;
    if (previous === null) return this.count(total);
```

`src/adapters/codex/parser.ts`(찾을 곳 9/11):

```ts
      this.seenResponses.add(responseId);
    }
```

`src/adapters/codex/parser.ts`(바꾼 뒤 9/11):

```ts
      this.seenResponses.add(responseId);
      const print = fnv1a64(responseId);
      this.myResponseIds.add(print);
      if (this.ctx.inherited?.responseIds.has(print)) {
        this.inheritedSkipped.responses++;
        this.lastInheritedLine = this.lines;
        return;
      }
    }
```

`src/adapters/codex/parser.ts`(찾을 곳 10/11):

```ts

  /** 파일 끝의 줄바꿈 없는 조각을 받고 요약을 낸다. 조각이 풀리면 받아들이고, 안 풀리면 쓰는 중일 때만 끝 조각이고 아니면 깨진 줄이다(1단계와 같다) */
```

`src/adapters/codex/parser.ts`(바꾼 뒤 10/11):

```ts

  /** 자기 기록의 지문. finish 뒤에 부른다 */
  fingerprints(): CodexFingerprints {
    return { itemIds: this.myItemIds, callIds: this.myCallIds, totals: this.myTotals, responseIds: this.myResponseIds };
  }

  /** 파일 끝의 줄바꿈 없는 조각을 받고 요약을 낸다. 조각이 풀리면 받아들이고, 안 풀리면 쓰는 중일 때만 끝 조각이고 아니면 깨진 줄이다(1단계와 같다) */
```

`src/adapters/codex/parser.ts`(찾을 곳 11/11):

```ts
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback, unknownItemTypes: this.unknownItemTypes },
    };
```

`src/adapters/codex/parser.ts`(바꾼 뒤 11/11):

```ts
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback, unknownItemTypes: this.unknownItemTypes, inheritedSkipped: { ...this.inheritedSkipped }, baselineMissing: this.firstCountedOldLine >= 0 && this.firstCountedOldLine < this.lastInheritedLine },
    };
```

`src/adapters/types.ts`(찾을 곳):

```ts
  codex?: { recordId: string; unknownThreadSource: string | null; idFallback: CodexIdFallback | null; unknownItemTypes: Record<string, number> };
```

`src/adapters/types.ts`(바꾼 뒤):

```ts
  codex?: { recordId: string; unknownThreadSource: string | null; idFallback: CodexIdFallback | null; unknownItemTypes: Record<string, number>; inheritedSkipped: { items: number; totals: number; responses: number }; baselineMissing: boolean };
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 5개, 시험 75개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/parser-inherit.test.ts src/adapters/codex/parser.ts src/adapters/types.ts
git commit -m "feat: 하위 세션이 이어받은 앞부분을 다시 세지 않음"
```

---

### Task 6: 관측 범위와 MCP 관측

**Files:**
- Create: `src/adapters/codex/observation.ts`
- Modify: `src/adapters/claude/observation.ts`
- Modify: `src/adapters/codex/parser.ts`
- Test: `test/adapters/codex/observation.test.ts`

**Interfaces:**
- Consumes: 과제 3의 해석기, 1단계의 `outerTypeOf`(`src/adapters/common/outer-type.ts`), `sortedRecord`, `claudeObservation`(`src/adapters/claude/observation.ts`), `ToolCoverage`.
- Produces: `CODEX_COVERAGE`, `CODEX_MCP_NON_SIGNAL_TYPES`, `codexMcpObservation(summaries, unreadableCount)`(`src/adapters/codex/observation.ts`), `observeRecords(summaries, unreadableCount, harmless)`(`src/adapters/claude/observation.ts`. `claudeObservation`이 이것을 쓴다), 해석기의 `missing.unconfirmedTypes`. 3부가 평가 입력에 잇는다.

설계 9.7, 9.8, 「5단계 1부 계획에서 보완」의 2·3·9번이다.

- 덮는 범위는 9.7의 Codex 새 형식 열이다. 응답과 토큰, 도구 오류(파일 고치기와 MCP 호출), 셸 종료 코드, 끊은 턴, 추론 강도, MCP 호출, 지침 크기는 봄, 사람 요청, 도구 호출 수, 자동 압축은 대신 봄, 거절과 길이 끊김, 실린 이름, 스킬 사용, MCP 연결 실패와 훅, 하위 에이전트는 못 봄이다. 옛 형식에서 셸 명령의 종료 코드처럼 남지 않는 것은 실행 층에 그 사건이 없어 분자와 분모에 함께 들지 않는다.
- 해석기는 깨진 줄과 끝 조각의 맨 바깥 `type`을, 줄의 처음부터 중첩을 따라가 온전히 읽힐 때만 그 값으로, 아니면 `?`로 센다(1단계와 같다). 상한을 넘은 줄은 종류를 세지 않는다.
- MCP 호출의 관측은 1단계와 같은 방법이다. 읽지 못한 것(과제 8이 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더해 넘긴다), 너무 긴 줄, 사용 신호가 될 수 없는 종류로 확인되지 않은 깨진 줄과 끝 조각이 하나라도 있으면 빠짐없지 않다. 사용 신호가 될 수 없는 종류는 9.8 표의 Codex 칸 그대로(`session_meta`, `turn_context`, `token_usage_record`, `world_state`, `compacted`)다. 해석기는 MCP 호출을 McpToolCall(`event_msg`)에서만 세지만, 호출 층(`response_item`)에만 남고 McpToolCall이 남지 않는 MCP 호출이 없다는 것은 확인하지 못해 `response_item`은 사용 신호가 될 수 있는 종류로 둔다(「5단계 1부 계획에서 보완」의 2·3번. 계획 초안은 `response_item`을 넣었다가 계획 리뷰 1차에서 되돌렸다).
- 옛 형식의 턴을 따로 세는 칸은 두지 않는다. 계획 초안은 실행 층이 없는 턴을 MCP 관측을 막는 것으로 세려 했지만, 작성자 PC의 옛 형식 기록도 MCP 호출을 McpToolCall로 남겼다(9.7의 옛 형식 열을 고친다).
- 스킬 사용은 Codex가 기록하지 않는다(9.7). Codex 스킬의 관측이 늘 빠짐없지 않아야 쓰지 않는 스킬을 판정하지 않는다. 이것은 평가 입력에 Codex를 넣는 3부가 그 알림 문장과 함께 한다. 지금의 알림 문장(「기록을 빠짐없이 읽지 못해(…)」)이 맞지 않아 1부에서 관측의 까닭 값을 늘리지 않았다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/observation.test.ts`(새 파일):

```ts
// Codex가 지표마다 무엇을 기록하는지(설계 9.7)와, 깨진 줄·끝 조각의 맨 바깥 종류를 세는 것, MCP 호출의 관측이 빠짐없는지(설계 9.8)를 시험한다
import { describe, expect, it } from "vitest";
import { CODEX_COVERAGE, CODEX_MCP_NON_SIGNAL_TYPES, codexMcpObservation } from "../../../src/adapters/codex/observation.ts";
import { CodexSessionParser } from "../../../src/adapters/codex/parser.ts";

const META = JSON.stringify({ timestamp: "2026-11-10T01:00:00Z", type: "session_meta", payload: { id: "s", thread_source: "user" } });
function summaryOf(lines: string[], options: { tail?: string; inProgress?: boolean; tooLong?: number } = {}) {
  const parser = new CodexSessionParser({ recordId: "r", timeZone: "Asia/Seoul" });
  for (const text of lines) parser.line(text);
  for (let i = 0; i < (options.tooLong ?? 0); i++) parser.tooLong();
  return parser.finish(options.tail ?? null, options.inProgress ?? false);
}

describe("관측 범위", () => {
  it("설계 9.7의 Codex 새 형식 열이다. 사람 요청, 도구 호출 수, 자동 압축은 대신 보고, 거절과 길이 끊김, 실린 이름, 스킬 사용, MCP 연결 실패와 훅, 하위 에이전트는 못 본다", () => {
    expect(CODEX_COVERAGE).toEqual({
      responsesAndTokens: "measured",
      humanRequests: "proxy",
      toolCalls: "proxy",
      toolErrors: "measured",
      shellExitCodes: "measured",
      deniedAndLengthStops: "unsupported",
      interruptedTurns: "measured",
      autoCompaction: "proxy",
      effort: "measured",
      loadedNames: "unsupported",
      skillUsage: "unsupported",
      mcpCalls: "measured",
      mcpFailuresAndHooks: "unsupported",
      instructionSize: "measured",
      subagents: "unsupported",
    });
  });
});

describe("깨진 줄과 끝 조각의 맨 바깥 종류", () => {
  it("해석기는 풀리지 않는 줄과 끝 조각의 맨 바깥 type을, 처음부터 온전히 읽히면 그 값으로, 아니면 ?로 센다(1단계와 같다)", () => {
    const summary = summaryOf([META, '{"type":"world_state","payload":{"state":', '{"payload":{"type":"item_completed"', '{"type":"event_msg","pay'], { tail: '{"type":"compacted","payl', inProgress: true });
    expect(summary.missing).toMatchObject({ brokenLines: 3, tailFragments: 1, unconfirmedTypes: { world_state: 1, "?": 1, event_msg: 1, compacted: 1 } });
  });

  it("쓰는 중이 아닌 파일의 풀리지 않는 끝도 깨진 줄로 종류를 센다. 상한을 넘은 줄은 종류를 세지 않는다", () => {
    const summary = summaryOf([META], { tail: '{"type":"response_item","pay', tooLong: 2 });
    expect(summary.missing).toMatchObject({ brokenLines: 1, tailFragments: 0, tooLongLines: 2, unconfirmedTypes: { response_item: 1 } });
  });
});

describe("MCP 호출의 관측", () => {
  it("사용 신호가 될 수 없는 종류는 설계 9.8 표의 Codex 칸 그대로다. 호출 층(response_item)은 사용 신호가 될 수 있는 종류다", () => {
    expect([...CODEX_MCP_NON_SIGNAL_TYPES].sort()).toEqual(["compacted", "session_meta", "token_usage_record", "turn_context", "world_state"]);
  });

  it("빠진 것이 없으면 빠짐없다", () => {
    expect(codexMcpObservation([summaryOf([META])], 0)).toEqual({ complete: true, reasons: [] });
    expect(codexMcpObservation([], 0)).toEqual({ complete: true, reasons: [] });
  });

  it("읽지 못한 것이 하나라도 있으면 빠짐없지 않다", () => {
    expect(codexMcpObservation([summaryOf([META])], 1)).toEqual({ complete: false, reasons: ["unreadable-files"] });
  });

  it("너무 긴 줄이 있으면 빠짐없지 않다", () => {
    expect(codexMcpObservation([summaryOf([META], { tooLong: 1 })], 0)).toEqual({ complete: false, reasons: ["too-long-lines"] });
  });

  it("깨진 줄과 끝 조각이 사용 신호가 될 수 없는 종류로 온전히 읽히면 상관없는 줄이다", () => {
    const pieces = [...CODEX_MCP_NON_SIGNAL_TYPES].map((type) => `{"type":"${type}","payload":{`);
    expect(codexMcpObservation([summaryOf([META, ...pieces], { tail: '{"type":"compacted"', inProgress: true })], 0)).toEqual({ complete: true, reasons: [] });
  });

  it.each([
    ["사용 신호가 실리는 event_msg", '{"type":"event_msg","payload":{"type":"item_completed"'],
    ["사용 신호가 실리는 response_item", '{"type":"response_item","pay'],
    ["목록에 없는 종류", '{"type":"inter_agent_communication_metadata","pay'],
    ["안쪽의 type만 읽히는 것", '{"payload":{"type":"compacted"'],
    ["종류를 읽지 못한 것", '{"ty'],
  ])("깨진 줄의 종류가 %s이면 빠짐없지 않다", (_name, piece) => {
    expect(codexMcpObservation([summaryOf([META, piece])], 0)).toEqual({ complete: false, reasons: ["unconfirmed-pieces"] });
  });

  it("까닭은 읽지 못한 것, 너무 긴 줄, 확인하지 못한 조각의 차례로 한 번씩 낸다", () => {
    const summaries = [summaryOf([META, '{"ty'], { tooLong: 1 }), summaryOf([META, '{"type":"event_msg"'])];
    expect(codexMcpObservation(summaries, 3)).toEqual({ complete: false, reasons: ["unreadable-files", "too-long-lines", "unconfirmed-pieces"] });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/observation.test.ts`
Expected: FAIL. `test/adapters/codex/observation.test.ts`가 `../../../src/adapters/codex/observation.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/adapters/claude/observation.ts`(찾을 곳 1/3):

```ts
// Claude Code가 지표마다 무엇을 기록하는지(설계 9.7)와, 스킬 사용·MCP 호출의 관측이 빠짐없는지(설계 9.8), 절반 넘게 깨진 파일인지(설계 20.1)를 가른다(순수 함수)
import type { SessionSummary, ToolCoverage } from "../types.ts";

```

`src/adapters/claude/observation.ts`(바꾼 뒤 1/3):

```ts
// Claude Code가 지표마다 무엇을 기록하는지(설계 9.7)와, 스킬 사용·MCP 호출의 관측이 빠짐없는지(설계 9.8), 절반 넘게 깨진 파일인지(설계 20.1)를 가른다. 관측의 까닭과 기록에서 까닭을 찾는 observeRecords는 Codex도 쓴다(순수 함수)
import type { SessionSummary, ToolCoverage } from "../types.ts";

```

`src/adapters/claude/observation.ts`(찾을 곳 2/3):

```ts
}

export function claudeObservation(summaries: readonly SessionSummary[], unreadableCount: number, metric: "skill" | "mcp"): Observation {
  const harmless = metric === "skill" ? SKILL_NON_SIGNAL_TYPES : MCP_NON_SIGNAL_TYPES;
  const found = new Set<ObservationReason>();
  if (unreadableCount > 0) found.add("unreadable-files");
```

`src/adapters/claude/observation.ts`(바꾼 뒤 2/3):

```ts
}

/** 기록에서 관측을 막는 것을 찾는다. 읽지 못한 것, 너무 긴 줄, 사용 신호가 될 수 없는 종류(harmless)로 확인되지 않은 깨진 줄과 끝 조각이다(설계 9.8) */
export function observeRecords(summaries: readonly SessionSummary[], unreadableCount: number, harmless: ReadonlySet<string>): Observation {
  const found = new Set<ObservationReason>();
  if (unreadableCount > 0) found.add("unreadable-files");
```

`src/adapters/claude/observation.ts`(찾을 곳 3/3):

```ts
  return { complete: reasons.length === 0, reasons };
}
```

`src/adapters/claude/observation.ts`(바꾼 뒤 3/3):

```ts
  return { complete: reasons.length === 0, reasons };
}

export function claudeObservation(summaries: readonly SessionSummary[], unreadableCount: number, metric: "skill" | "mcp"): Observation {
  return observeRecords(summaries, unreadableCount, metric === "skill" ? SKILL_NON_SIGNAL_TYPES : MCP_NON_SIGNAL_TYPES);
}
```

`src/adapters/codex/observation.ts`(새 파일):

```ts
// Codex가 지표마다 무엇을 기록하는지(설계 9.7의 Codex 새 형식 열)와, MCP 호출의 관측이 빠짐없는지(설계 9.8)를 가른다. 스킬 사용은 Codex가 기록하지 않아 늘 빠짐없지 않다(평가 입력에 넣는 것은 5단계 3부, 순수 함수)
import { observeRecords, type Observation } from "../claude/observation.ts";
import type { SessionSummary, ToolCoverage } from "../types.ts";

/** 설계 9.7의 Codex 새 형식 열. 옛 형식에서 셸 명령의 종료 코드처럼 남지 않는 것은 실행 층에 그 사건이 없어 분자와 분모에 함께 들지 않는다 */
export const CODEX_COVERAGE = {
  responsesAndTokens: "measured",
  humanRequests: "proxy",
  toolCalls: "proxy",
  toolErrors: "measured",
  shellExitCodes: "measured",
  deniedAndLengthStops: "unsupported",
  interruptedTurns: "measured",
  autoCompaction: "proxy",
  effort: "measured",
  loadedNames: "unsupported",
  skillUsage: "unsupported",
  mcpCalls: "measured",
  mcpFailuresAndHooks: "unsupported",
  instructionSize: "measured",
  subagents: "unsupported",
} as const satisfies ToolCoverage;

/**
 * 깨진 줄이나 끝 조각이 이 종류로 온전히 읽히면 MCP 호출이 실릴 수 없다(설계 9.8 표의 Codex 칸). 해석기는 MCP 호출을 event_msg의 McpToolCall에서만 세지만,
 * response_item(호출 층)은 사용 신호가 될 수 있는 종류로 둔다. 호출 층에만 남고 McpToolCall이 남지 않는 MCP 호출이 없다는 것을 확인하지 못했다(「5단계 1부 계획에서 보완」)
 */
export const CODEX_MCP_NON_SIGNAL_TYPES: ReadonlySet<string> = new Set(["session_meta", "turn_context", "token_usage_record", "world_state", "compacted"]);

/** MCP 호출의 관측. unreadableCount는 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더한 수다(설계 9.8 표의 첫 줄) */
export function codexMcpObservation(summaries: readonly SessionSummary[], unreadableCount: number): Observation {
  return observeRecords(summaries, unreadableCount, CODEX_MCP_NON_SIGNAL_TYPES);
}
```

`src/adapters/codex/parser.ts`(찾을 곳 1/7):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가르고, 도구는 실행 층에서 이름별로 세되 턴마다 호출 층이 더 많으면 그 차이를 이름 모름으로 더한다. 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기도 센다(설계 9.2, 9.6, 9.7, 「5단계 계획 전 결정」 1·7번)
import { UNKNOWN_TOOL } from "../claude/parser.ts";
import { nameRecord } from "../common/canonical.ts";
import { fnv1a64 } from "../common/hash.ts";
```

`src/adapters/codex/parser.ts`(바꾼 뒤 1/7):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가르고, 도구는 실행 층에서 이름별로 세되 턴마다 호출 층이 더 많으면 그 차이를 이름 모름으로 더한다. 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기, 깨진 줄과 끝 조각의 맨 바깥 종류도 센다(설계 9.2, 9.6, 9.7, 9.8, 「5단계 계획 전 결정」 1·7번)
import { UNKNOWN_TOOL } from "../claude/parser.ts";
import { nameRecord, sortedRecord } from "../common/canonical.ts";
import { fnv1a64 } from "../common/hash.ts";
```

`src/adapters/codex/parser.ts`(찾을 곳 2/7):

```ts
import type { CodexIdFallback } from "../types.ts";
import { canonicalDay, emptyDay, emptyToolCounts, type DayCell, type SessionKind, type SessionSummary, type TokenCounts, type ToolCounts } from "../types.ts";
```

`src/adapters/codex/parser.ts`(바꾼 뒤 2/7):

```ts
import type { CodexIdFallback } from "../types.ts";
import { outerTypeOf } from "../common/outer-type.ts";
import { canonicalDay, emptyDay, emptyToolCounts, type DayCell, type SessionKind, type SessionSummary, type TokenCounts, type ToolCounts } from "../types.ts";
```

`src/adapters/codex/parser.ts`(찾을 곳 3/7):

```ts
  private undatedLines = 0;
  /** 새 구간에 들어섰는지(token_usage_record를 한 번이라도 봤는지) */
```

`src/adapters/codex/parser.ts`(바꾼 뒤 3/7):

```ts
  private undatedLines = 0;
  /** 깨진 줄과 끝 조각의 맨 바깥 종류(온전히 읽히지 않으면 ?)별 수. MCP 호출의 관측이 빠짐없는지 가른다(설계 9.8) */
  private readonly unconfirmedTypes = nameRecord<number>();
  /** 새 구간에 들어섰는지(token_usage_record를 한 번이라도 봤는지) */
```

`src/adapters/codex/parser.ts`(찾을 곳 4/7):

```ts
    this.firstLine(parsed);
    if (parsed === null) this.brokenLines++;
    else this.accept(parsed);
```

`src/adapters/codex/parser.ts`(바꾼 뒤 4/7):

```ts
    this.firstLine(parsed);
    if (parsed === null) this.missing(text, "broken");
    else this.accept(parsed);
```

`src/adapters/codex/parser.ts`(찾을 곳 5/7):

```ts

  /** 빈 줄이 아닌 첫 물리적 줄 하나만 본다. 풀리지 않거나 너무 길면 첫 줄을 읽지 못한 것이고, 풀렸는데 session_meta가 아니면 정체를 모르는 것이다. 그 뒤의 session_meta로 정체를 정하지 않는다(「5단계 계획 전 결정」 7번) */
```

`src/adapters/codex/parser.ts`(바꾼 뒤 5/7):

```ts

  /** 풀리지 않는 줄이나 끝 조각 하나. 맨 바깥 종류를 센다(1단계와 같다) */
  private missing(text: string, kind: "broken" | "tail"): void {
    if (kind === "broken") this.brokenLines++;
    else this.tailFragments++;
    const type = outerTypeOf(text) ?? "?";
    this.unconfirmedTypes[type] = (Object.hasOwn(this.unconfirmedTypes, type) ? this.unconfirmedTypes[type]! : 0) + 1;
  }

  /** 빈 줄이 아닌 첫 물리적 줄 하나만 본다. 풀리지 않거나 너무 길면 첫 줄을 읽지 못한 것이고, 풀렸는데 session_meta가 아니면 정체를 모르는 것이다. 그 뒤의 session_meta로 정체를 정하지 않는다(「5단계 계획 전 결정」 7번) */
```

`src/adapters/codex/parser.ts`(찾을 곳 6/7):

```ts
      if (parsed !== null) this.accept(parsed);
      else if (inProgress) this.tailFragments++;
      else this.brokenLines++;
    }
```

`src/adapters/codex/parser.ts`(바꾼 뒤 6/7):

```ts
      if (parsed !== null) this.accept(parsed);
      else this.missing(tail, inProgress ? "tail" : "broken");
    }
```

`src/adapters/codex/parser.ts`(찾을 곳 7/7):

```ts
      initialMcpServers: null,
      missing: { lines: this.lines, brokenLines: this.brokenLines, tailFragments: this.tailFragments, tooLongLines: this.tooLongLines, unconfirmedTypes: nameRecord<number>() },
      firstResponseIdHashes: [],
```

`src/adapters/codex/parser.ts`(바꾼 뒤 7/7):

```ts
      initialMcpServers: null,
      missing: { lines: this.lines, brokenLines: this.brokenLines, tailFragments: this.tailFragments, tooLongLines: this.tooLongLines, unconfirmedTypes: sortedRecord(this.unconfirmedTypes) },
      firstResponseIdHashes: [],
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex test/adapters/claude/observation.test.ts test/collect/claude.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 8개, 시험 115개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/observation.test.ts src/adapters/claude/observation.ts src/adapters/codex/observation.ts src/adapters/codex/parser.ts
git commit -m "feat: Codex 관측 범위와 MCP 호출 관측을 더함"
```

---

### Task 7: 캐시

**Files:**
- Create: `src/adapters/codex/fingerprints.ts`
- Modify: `test/collect/claude.test.ts`
- Modify: `test/state/cache-prune.test.ts`
- Modify: `test/state/cache.test.ts`
- Modify: `src/adapters/codex/parser.ts`
- Modify: `src/adapters/types.ts`
- Modify: `src/collect/claude.ts`
- Modify: `src/state/cache.ts`
- Test: `test/adapters/codex/cache.test.ts`

**Interfaces:**
- Consumes: 과제 5의 `CodexFingerprints`와 `fingerprints()`, 1단계의 캐시(`cacheKeyFor`, `loadCached`, `storeCached`, `CacheEntry`)와 `reviveSummary`, 1단계의 Claude Code 모으기(`collectFromList`).
- Produces: `FingerprintLists`, `CodexCacheExtra`(`fingerprints`, `sharedDigest`), `toLists`, `fromLists`, `unionOf`, `sharedDigest(own, inherited)`, `reviveCodexExtra`(`src/adapters/codex/fingerprints.ts`), `CacheEntry.codex`와 목록을 본 뒤 바뀐 파일에는 `null`을 돌려주는 `cacheKeyFor(file, parser, timeZone): Promise<CacheKey | null>`(`src/state/cache.ts`), Codex 요약을 받는 `reviveSummary`(`src/adapters/types.ts`). 과제 8이 쓴다.

설계 9.4, 12.2, 「5단계 계획 전 결정」 7번, 「5단계 1부 계획에서 보완」의 6·14번이다.

- 요약 되살리기는 Codex 요약을 받는다. Codex 요약은 `codex` 칸이 있어야 하고 Claude Code 요약에는 없어야 한다. `codex` 칸의 값도 본다(세션 ID를 대신 쓴 까닭은 정해진 넷 가운데 하나나 `null`, 기준을 찾지 못했는지는 참거짓). 모양이 다르면 없는 것으로 보고 원본을 다시 읽는다. 되살린 요약은 새로 해석한 요약과 JSON 글까지 같아야 해서 해석기는 정체 모를 종류의 기록을 열쇠 차례로 낸다.
- 요약은 기록 파일뿐 아니라 뺄 지문(부모 세션의 기록과 같은 세션의 앞 기록의 지문. 과제 5·8)에도 기댄다. 해석기는 자기 지문이 뺄 지문에 드는지만 보므로, 기록이 그대로이고 "뺄 지문 가운데 자기 지문에도 있는 것"이 같으면 요약도 같다. 그래서 캐시 항목에 요약과 함께 자기 지문 목록과 그 겹침을 종류마다 차례로 이어 SHA-256한 값(`sharedDigest`)을 넣는다. 뺄 지문이 없으면 겹침이 없는 것과 같다. 부모가 하위와 관계없는 줄을 덧붙여도 하위를 다시 읽지 않는다. 겹침이 같은지는 모으기(과제 8)가 꺼낸 뒤 견준다.
- 캐시 열쇠의 칸(경로, 크기, 수정 시각, 앞뒤 4KB 지문, 캐시 형식, 해석 버전, 시간대)은 1단계 그대로다. Codex 항목에 지문 칸이 없거나 모양이 다르면 꺼내지 않고, Claude Code 항목에 지문 칸이 있어도 꺼내지 않는다.
- 열쇠를 만들려고 연 파일의 크기나 수정 시각이 목록에서 받은 것과 다르면(목록을 본 뒤 덧쓰였거나 줄었거나 수정 시각이 바뀌었으면. 늘었는지가 아니라 다른지를 본다) 열쇠를 만들지 않고(`null`), 부르는 쪽은 그 파일의 캐시를 꺼내지도 넣지도 않는다(설계 9.4). 1단계는 목록의 크기까지의 앞뒤 지문과 목록의 크기·수정 시각으로 열쇠를 만들어, 목록을 본 뒤 덧쓴 기록이 예전 열쇠와 같아져 예전 요약을 돌려줬다(캐시 없이 읽으면 덧쓴 줄까지 센다. 계획 리뷰 5차가 찾았다). 1단계의 Claude Code 모으기도 이 함수를 쓰므로 함께 고치고, 쓰는 동안 수정 시각이 머물러 크기만 바뀐 경우와, 줄어든 파일과 수정 시각이 앞당겨진 파일을 시험한다(계획 리뷰 6차). 가짜 수정 시각으로 열쇠를 만들던 캐시 정리 시험은 만든 파일의 실제 크기와 수정 시각을 쓴다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/cache.test.ts`(새 파일):

```ts
// Codex 세션 요약과 지문을 캐시에 넣고 꺼내는 것을 시험한다. 되살린 요약은 새로 해석한 요약과 JSON 글까지 같고, 요약은 뺄 지문(부모 세션의 기록과 같은 세션의 앞 기록) 가운데 자기 기록에도 있는 것의 지문(sharedDigest)이 같을 때만 다시 쓴다(설계 9.4, 12.2, 「5단계 계획 전 결정」 7번)
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fromLists, sharedDigest, toLists, unionOf } from "../../../src/adapters/codex/fingerprints.ts";
import { CodexSessionParser, type CodexFingerprints } from "../../../src/adapters/codex/parser.ts";
import { reviveSummary } from "../../../src/adapters/types.ts";
import { cacheKeyFor, loadCached, storeCached, type CacheEntry } from "../../../src/state/cache.ts";
import { parseLines } from "../../helpers/claude-lines.ts";

const T = "2026-11-10T01:00:00Z";
const line = (type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp: T, type, payload });
const item = (it: Record<string, unknown>) => line("event_msg", { type: "item_completed", item: it });
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: n + 1 });
const CHILD = [
  line("session_meta", { id: "child", cwd: "C:/w", cli_version: "0.166.0", thread_source: "subagent", parent_thread_id: "mom" }),
  line("turn_context", { model: "m", effort: "high" }),
  item({ type: "Zeta", id: "z1" }),
  item({ type: "Alpha", id: "a1" }),
  item({ type: "UserMessage", id: "u1" }),
  item({ type: "McpToolCall", id: "m1", server: "github", status: "completed" }),
  line("event_msg", { type: "token_count", info: { total_token_usage: usage(100) } }),
  line("token_usage_record", { response_id: "r1", usage: usage(5), thread_token_usage: usage(105) }),
  line("world_state", { state: { agents_md: { text: "ab가" } } }),
  '{"type":"event_msg","pay',
];
function parse(lines: string[], inherited: CodexFingerprints | null = null) {
  const parser = new CodexSessionParser({ recordId: "rec-1", timeZone: "Asia/Seoul", inherited });
  for (const text of lines) parser.line(text);
  const summary = parser.finish(null, false);
  return { summary, prints: parser.fingerprints() };
}
const momOf = (...ids: string[]) => parse([line("session_meta", { id: "mom", thread_source: "user" }), ...ids.map((id) => item({ type: "UserMessage", id }))]).prints;

describe("요약 되살리기", () => {
  it("Codex 요약은 JSON으로 저장했다가 되살려도 새로 해석한 것과 JSON 글까지 같다(정체 모를 종류의 열쇠 차례를 포함한다)", () => {
    const { summary } = parse(CHILD, momOf("u1"));
    const revived = reviveSummary(JSON.parse(JSON.stringify(summary)));
    expect(revived).toEqual(summary);
    expect(JSON.stringify(revived)).toBe(JSON.stringify(summary));
  });

  it("codex 칸이 없거나 모양이 다른 Codex 요약, codex 칸이 있는 Claude Code 요약, 모르는 도구의 요약은 되살리지 않는다", () => {
    const json = JSON.parse(JSON.stringify(parse(CHILD).summary)) as Record<string, unknown> & { codex: Record<string, unknown> };
    const { codex, ...withoutCodex } = json;
    expect(reviveSummary(withoutCodex)).toBeNull();
    for (const bad of [{ recordId: 1 }, { unknownThreadSource: 5 }, { idFallback: "bogus" }, { baselineMissing: "no" }, { unknownItemTypes: { X: "1" } }, { inheritedSkipped: { items: 0, totals: 0 } }]) {
      expect(reviveSummary({ ...json, codex: { ...codex, ...bad } }), JSON.stringify(bad)).toBeNull();
    }
    expect(reviveSummary({ ...JSON.parse(JSON.stringify(parseLines([]))), codex })).toBeNull();
    expect(reviveSummary({ ...json, tool: "cursor" })).toBeNull();
  });
});

describe("지문 목록", () => {
  it("지문을 차례로 늘어놓은 목록으로 바꾸고 되돌린다. 열쇠가 모자라거나 목록이 아니거나 지문 꼴이 아닌 값이 있으면 되돌리지 않는다", () => {
    const { prints } = parse(CHILD);
    const lists = toLists(prints);
    for (const key of ["itemIds", "callIds", "totals", "responseIds"] as const) expect(lists[key]).toEqual([...prints[key]].sort());
    expect(fromLists(JSON.parse(JSON.stringify(lists)))).toEqual(prints);
    expect(fromLists({ ...lists, totals: ["xyz"] })).toBeNull();
    expect(fromLists({ ...lists, itemIds: "a" })).toBeNull();
    expect(fromLists({ itemIds: [], callIds: [], totals: [] })).toBeNull();
  });

  it("같은 세션의 기록 파일 여럿의 지문은 합친다", () => {
    const merged = unionOf([momOf("u1", "u2"), momOf("u2", "u3")]);
    expect(merged.itemIds).toEqual(momOf("u1", "u2", "u3").itemIds);
  });

  it("sharedDigest는 네 종류(항목, 호출, 누적값, 응답)마다 겹침을 따로 담는다. 어느 한 종류의 겹침만 달라도 다르다", () => {
    const none = () => new Set<string>();
    for (const kind of ["itemIds", "callIds", "totals", "responseIds"] as const) {
      const only = (prints: string[]): CodexFingerprints => ({ itemIds: none(), callIds: none(), totals: none(), responseIds: none(), [kind]: new Set(prints) });
      const own = only(["0000000000000001", "0000000000000002"]);
      expect(sharedDigest(own, only(["0000000000000001"])), kind).not.toBe(sharedDigest(own, only(["0000000000000002"])));
    }
  });

  it("sharedDigest는 뺄 지문 가운데 자기 지문에도 있는 것에만 기댄다. 뺄 지문에 관계없는 지문을 더해도 같고, 겹치는 지문이 바뀌면 다르며, 뺄 지문이 없으면 겹침이 없는 것과 같다", () => {
    const own = parse(CHILD).prints;
    const digest = sharedDigest(own, momOf("u1", "a1"));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(sharedDigest(own, momOf("u1", "a1", "unrelated"))).toBe(digest);
    expect(sharedDigest(own, momOf("u1"))).not.toBe(digest);
    expect(sharedDigest(own, null)).toBe(sharedDigest(own, momOf("unrelated")));
    expect(sharedDigest(own, null)).not.toBe(digest);
  });
});

describe("캐시에 넣고 꺼내기", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aq-codex-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  async function entryFor(): Promise<CacheEntry> {
    const path = join(dir, "rollout-x.jsonl");
    const content = `${CHILD.join("\n")}\n`;
    await writeFile(path, content);
    const mtime = Date.parse(T);
    await utimes(path, mtime / 1000, mtime / 1000);
    const key = (await cacheKeyFor({ path, normPath: path.toLowerCase(), size: Buffer.byteLength(content), mtimeMs: mtime }, "codex@1", "Asia/Seoul"))!;
    const { summary, prints } = parse(CHILD);
    return { key, summary, bytesRead: Buffer.byteLength(content), codex: { fingerprints: toLists(prints), sharedDigest: sharedDigest(prints, null) } };
  }

  it("Codex 항목은 요약과 함께 자기 지문 목록과 sharedDigest를 넣고 같은 열쇠로 그대로 꺼낸다", async () => {
    const entry = await entryFor();
    await storeCached(join(dir, "cache"), entry);
    expect(await loadCached(join(dir, "cache"), entry.key)).toEqual(entry);
  });

  it("Codex 항목에 지문 칸이 없거나 모양이 다르면 꺼내지 않는다. Claude Code 항목에 지문 칸이 있어도 꺼내지 않는다", async () => {
    const entry = await entryFor();
    const cases: unknown[] = [
      { ...entry, codex: undefined },
      { ...entry, codex: { ...entry.codex, sharedDigest: 5 } },
      { ...entry, codex: { ...entry.codex, fingerprints: { ...entry.codex!.fingerprints, totals: [1] } } },
      { ...entry, summary: parseLines([]) },
    ];
    for (const bad of cases) {
      await rm(join(dir, "cache"), { recursive: true, force: true });
      await storeCached(join(dir, "cache"), bad as CacheEntry);
      expect(await readdir(join(dir, "cache"))).toHaveLength(1);
      expect(await loadCached(join(dir, "cache"), entry.key)).toBeNull();
    }
  });
});
```

`test/collect/claude.test.ts`(찾을 곳 1/2):

```ts
// Claude Code 기록 모으기(캐시를 켜고 끈 결과의 같음, 날짜가 바뀐 경우, 진행 중인 파일, 볼 수 있는 날짜 범위, 겹친 응답)를 시험한다(설계 9.4, 9.8, 21.1 반례)
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
```

`test/collect/claude.test.ts`(바꾼 뒤 1/2):

```ts
// Claude Code 기록 모으기(캐시를 켜고 끈 결과의 같음, 날짜가 바뀐 경우, 진행 중인 파일, 볼 수 있는 날짜 범위, 겹친 응답)를 시험한다(설계 9.4, 9.8, 21.1 반례)
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
```

`test/collect/claude.test.ts`(찾을 곳 2/2):

```ts
  });
  it("수집 구간보다 오래된 파일이 있으면 수집 구간 전체를 볼 수 있다. 없으면 가장 이른 기록의 날짜부터다", async () => {
```

`test/collect/claude.test.ts`(바꾼 뒤 2/2):

```ts
  });
  it("목록을 얻은 뒤 덧쓴 파일은 캐시를 꺼내지 않아 캐시를 켜고 끈 결과가 같다(쓰는 동안 수정 시각이 머물러도 크기로 안다)", async () => {
    const path = await session("p", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    const before = await collectClaude(options({ cacheDir }));
    const home = claudeHome({}, root);
    const list = await listClaudeFiles(home, null);
    await appendFile(path, `${assistant({ id: "a-2", at: "2026-11-11T01:00:09Z", usage: { input: 3, output: 4 } })}\n`);
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    const cached = await collectFromList(home, list, options({ cacheDir }));
    const plain = await collectFromList(home, list, options());
    expect(cached.read.fromCache).toBe(0);
    expect(JSON.stringify(plain.summaries)).not.toBe(JSON.stringify(before.summaries));
    expect(JSON.stringify(cached.summaries)).toBe(JSON.stringify(plain.summaries));
  });
  it("수집 구간보다 오래된 파일이 있으면 수집 구간 전체를 볼 수 있다. 없으면 가장 이른 기록의 날짜부터다", async () => {
```

`test/state/cache-prune.test.ts`(찾을 곳 1/2):

```ts
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
```

`test/state/cache-prune.test.ts`(바꾼 뒤 1/2):

```ts
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
```

`test/state/cache-prune.test.ts`(찾을 곳 2/2):

```ts
  const key = await cacheKeyFor({ path: log, normPath: normalizePath(log), size: 5, mtimeMs: 0 }, "claude-code@1", "UTC");
```

`test/state/cache-prune.test.ts`(바꾼 뒤 2/2):

```ts
  const info = await stat(log);
  const key = (await cacheKeyFor({ path: log, normPath: normalizePath(log), size: info.size, mtimeMs: info.mtimeMs }, "claude-code@1", "UTC"))!;
```

`test/state/cache.test.ts`(찾을 곳 1/8):

```ts
// 캐시 열쇠 만들기, 넣고 꺼내기, 열쇠가 하나라도 다르면 꺼내지 않기를 시험한다(설계 9.4, 21.1 반례)
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
```

`test/state/cache.test.ts`(바꾼 뒤 1/8):

```ts
// 캐시 열쇠 만들기, 넣고 꺼내기, 열쇠가 하나라도 다르면 꺼내지 않기를 시험한다(설계 9.4, 21.1 반례)
import { appendFile, mkdtemp, readdir, readFile, rm, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
```

`test/state/cache.test.ts`(찾을 곳 2/8):

```ts
    const file = await logFile("a.jsonl", "line\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    const entry = { key, summary: parseLines([]), bytesRead: 5 };
```

`test/state/cache.test.ts`(바꾼 뒤 2/8):

```ts
    const file = await logFile("a.jsonl", "line\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    const entry = { key, summary: parseLines([]), bytesRead: 5 };
```

`test/state/cache.test.ts`(찾을 곳 3/8):

```ts
    const file = await logFile("b.jsonl", "AAAA\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 5 });
    const changed = await logFile("b.jsonl", "BBBB\n");
    const newKey = await cacheKeyFor(changed, "claude-code@1", "UTC");
    expect(newKey.head).not.toBe(key.head);
```

`test/state/cache.test.ts`(바꾼 뒤 3/8):

```ts
    const file = await logFile("b.jsonl", "AAAA\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 5 });
    const changed = await logFile("b.jsonl", "BBBB\n");
    const newKey = (await cacheKeyFor(changed, "claude-code@1", "UTC"))!;
    expect(newKey.head).not.toBe(key.head);
```

`test/state/cache.test.ts`(찾을 곳 4/8):

```ts
    const file = await logFile("c.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
```

`test/state/cache.test.ts`(바꾼 뒤 4/8):

```ts
    const file = await logFile("c.jsonl", "x\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
```

`test/state/cache.test.ts`(찾을 곳 5/8):

```ts
    const file = await logFile("d.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
```

`test/state/cache.test.ts`(바꾼 뒤 5/8):

```ts
    const file = await logFile("d.jsonl", "x\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
```

`test/state/cache.test.ts`(찾을 곳 6/8):

```ts
    const file = await logFile("f.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
```

`test/state/cache.test.ts`(바꾼 뒤 6/8):

```ts
    const file = await logFile("f.jsonl", "x\n");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
```

`test/state/cache.test.ts`(찾을 곳 7/8):

```ts
    const file = await logFile("e.jsonl", "");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    expect(key.size).toBe(0);
```

`test/state/cache.test.ts`(바꾼 뒤 7/8):

```ts
    const file = await logFile("e.jsonl", "");
    const key = (await cacheKeyFor(file, "claude-code@1", "UTC"))!;
    expect(key.size).toBe(0);
```

`test/state/cache.test.ts`(찾을 곳 8/8):

```ts
  });
});
```

`test/state/cache.test.ts`(바꾼 뒤 8/8):

```ts
  });
  it("목록에서 본 뒤 크기나 수정 시각이 바뀐 파일은 열쇠를 만들지 않는다(쓰는 동안 수정 시각이 머물러도 크기로 안다)", async () => {
    const grown = await logFile("g.jsonl", "line\n");
    await appendFile(grown.path, "more\n");
    await utimes(grown.path, MTIME / 1000, MTIME / 1000);
    expect(await cacheKeyFor(grown, "claude-code@1", "UTC")).toBeNull();
    const touched = await logFile("h.jsonl", "line\n");
    await utimes(touched.path, (MTIME + 1000) / 1000, (MTIME + 1000) / 1000);
    expect(await cacheKeyFor(touched, "claude-code@1", "UTC")).toBeNull();
    expect(await cacheKeyFor({ ...touched, mtimeMs: MTIME + 1000 }, "claude-code@1", "UTC")).not.toBeNull();
  });
  it("목록에서 본 뒤 줄어든 파일과 수정 시각이 앞당겨진 파일도 열쇠를 만들지 않는다(늘었는지가 아니라 다른지를 본다)", async () => {
    const shrunk = await logFile("i.jsonl", "line\nmore\n");
    await truncate(shrunk.path, 5);
    await utimes(shrunk.path, MTIME / 1000, MTIME / 1000);
    expect(await cacheKeyFor(shrunk, "claude-code@1", "UTC")).toBeNull();
    const older = await logFile("j.jsonl", "line\n");
    await utimes(older.path, (MTIME - 1000) / 1000, (MTIME - 1000) / 1000);
    expect(await cacheKeyFor(older, "claude-code@1", "UTC")).toBeNull();
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/cache.test.ts test/collect/claude.test.ts test/state/cache-prune.test.ts test/state/cache.test.ts`
Expected: FAIL. `test/adapters/codex/cache.test.ts`가 `../../../src/adapters/codex/fingerprints.ts`를 찾지 못해 불러오기에서 실패한다. `test/state/cache.test.ts`는 새 시험 둘(목록에서 본 뒤 커진 파일과 수정 시각이 늦어진 파일의 열쇠, 줄어든 파일과 수정 시각이 앞당겨진 파일의 열쇠)이, `test/collect/claude.test.ts`는 새 시험 하나(목록을 얻은 뒤 덧쓴 파일)가 실패한다. 그 밖의 시험 34개는 통과한다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/fingerprints.ts`(새 파일):

```ts
// Codex 기록의 지문을 캐시에 넣는 목록으로 바꾸고 되돌리며, 기록 파일 여럿의 지문을 합치고, 요약이 기대는 뺄 지문(부모 세션의 기록과 같은 세션의 앞 기록)과의 겹침을 지문 하나(sharedDigest)로 줄인다(설계 9.4, 12.2, 「5단계 계획 전 결정」 7번)
import { createHash } from "node:crypto";
import type { CodexFingerprints } from "./parser.ts";

const KINDS = ["itemIds", "callIds", "totals", "responseIds"] as const;
const PRINT = /^[0-9a-f]{16}$/;
const DIGEST = /^[0-9a-f]{64}$/;

/** 지문을 종류마다 차례로 늘어놓은 목록. 캐시 파일에 그대로 쓴다 */
export type FingerprintLists = Record<(typeof KINDS)[number], string[]>;

/** 캐시의 Codex 칸. 자기 기록의 지문 목록과, 해석할 때 뺀 지문 가운데 이 기록에도 있던 것의 지문이다 */
export interface CodexCacheExtra {
  fingerprints: FingerprintLists;
  sharedDigest: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function toLists(prints: CodexFingerprints): FingerprintLists {
  return { itemIds: [...prints.itemIds].sort(), callIds: [...prints.callIds].sort(), totals: [...prints.totals].sort(), responseIds: [...prints.responseIds].sort() };
}

/** 캐시에서 꺼낸 목록을 지문으로 되돌린다. 네 종류가 다 있고 모두 지문 꼴의 글자 목록일 때만 되돌린다 */
export function fromLists(value: unknown): CodexFingerprints | null {
  if (!isObject(value)) return null;
  const out: Record<string, Set<string>> = {};
  for (const kind of KINDS) {
    const list = value[kind];
    if (!Array.isArray(list) || !list.every((print) => typeof print === "string" && PRINT.test(print))) return null;
    out[kind] = new Set(list as string[]);
  }
  return { itemIds: out.itemIds!, callIds: out.callIds!, totals: out.totals!, responseIds: out.responseIds! };
}

/** 기록 파일 여럿의 지문을 합친다. 해석기에 뺄 지문(부모 세션의 기록들과 같은 세션의 앞 기록들)으로 넘긴다 */
export function unionOf(list: readonly CodexFingerprints[]): CodexFingerprints {
  const merge = (kind: (typeof KINDS)[number]): Set<string> => new Set(list.flatMap((prints) => [...prints[kind]]));
  return { itemIds: merge("itemIds"), callIds: merge("callIds"), totals: merge("totals"), responseIds: merge("responseIds") };
}

/**
 * 뺄 지문 가운데 이 기록의 지문에도 있는 것을 종류마다 차례로 이어 해시한다. 해석기는 자기 지문이 뺄 지문에 드는지만 보므로,
 * 기록이 그대로이고 이 값이 같으면 요약도 같다. 뺄 지문이 없으면 겹침이 없는 것과 같다
 */
export function sharedDigest(own: CodexFingerprints, inherited: CodexFingerprints | null): string {
  const hash = createHash("sha256");
  for (const kind of KINDS) {
    const shared = inherited === null ? [] : [...own[kind]].filter((print) => inherited[kind].has(print)).sort();
    hash.update(`${kind}:${shared.join(",")};`);
  }
  return hash.digest("hex");
}

/** 캐시에서 꺼낸 Codex 칸을 되살린다. 모양이 다르면 null이다 */
export function reviveCodexExtra(value: unknown): CodexCacheExtra | null {
  if (!isObject(value) || typeof value.sharedDigest !== "string" || !DIGEST.test(value.sharedDigest)) return null;
  const prints = fromLists(value.fingerprints);
  return prints === null ? null : { fingerprints: toLists(prints), sharedDigest: value.sharedDigest };
}
```

`src/adapters/codex/parser.ts`(찾을 곳):

```ts
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback, unknownItemTypes: this.unknownItemTypes, inheritedSkipped: { ...this.inheritedSkipped }, baselineMissing: this.firstCountedOldLine >= 0 && this.firstCountedOldLine < this.lastInheritedLine },
```

`src/adapters/codex/parser.ts`(바꾼 뒤):

```ts
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFallback: this.idFallback, unknownItemTypes: sortedRecord(this.unknownItemTypes), inheritedSkipped: { ...this.inheritedSkipped }, baselineMissing: this.firstCountedOldLine >= 0 && this.firstCountedOldLine < this.lastInheritedLine },
```

`src/adapters/types.ts`(찾을 곳 1/4):

```ts

/** 캐시에서 꺼낸 값이 세션 요약의 모양이면 같은 모양(열쇠 차례와 원형 없는 기록까지)으로 되살린다. 모양이 다르면 null이다. */
export function reviveSummary(value: unknown): SessionSummary | null {
```

`src/adapters/types.ts`(바꾼 뒤 1/4):

```ts

const ID_FALLBACKS: ReadonlySet<string> = new Set(["first-line-unreadable", "first-line-not-meta", "meta-without-id", "no-lines"]);

/** Codex 요약의 codex 칸을 같은 모양으로 되살린다. 모양이 다르면 null이다 */
function reviveCodex(v: unknown): NonNullable<SessionSummary["codex"]> | null {
  if (!isObject(v) || typeof v.recordId !== "string" || !isNullableString(v.unknownThreadSource) || typeof v.baselineMissing !== "boolean") return null;
  if (v.idFallback !== null && !ID_FALLBACKS.has(v.idFallback as string)) return null;
  const unknownItemTypes = named(v.unknownItemTypes, (x) => (isNumber(x) ? x : null));
  const skipped = fixed(v.inheritedSkipped, ["items", "totals", "responses"]);
  if (unknownItemTypes === null || skipped === null) return null;
  return {
    recordId: v.recordId,
    unknownThreadSource: v.unknownThreadSource,
    idFallback: v.idFallback as CodexIdFallback | null,
    unknownItemTypes,
    inheritedSkipped: { items: skipped.items!, totals: skipped.totals!, responses: skipped.responses! },
    baselineMissing: v.baselineMissing,
  };
}

/** 캐시에서 꺼낸 값이 세션 요약의 모양이면 같은 모양(열쇠 차례와 원형 없는 기록까지)으로 되살린다. Codex 요약은 codex 칸이 있어야 하고 Claude Code 요약에는 없어야 한다. 모양이 다르면 null이다. */
export function reviveSummary(value: unknown): SessionSummary | null {
```

`src/adapters/types.ts`(찾을 곳 2/4):

```ts
  const v = value;
  if (v.tool !== "claude-code" || typeof v.sessionId !== "string" || (v.kind !== "main" && v.kind !== "sub")) return null;
  if (!isNullableString(v.parentSessionId) || !isNullableString(v.cwd) || !isNullableString(v.version)) return null;
```

`src/adapters/types.ts`(바꾼 뒤 2/4):

```ts
  const v = value;
  if ((v.tool !== "claude-code" && v.tool !== "codex") || typeof v.sessionId !== "string" || (v.kind !== "main" && v.kind !== "sub")) return null;
  if (!isNullableString(v.parentSessionId) || !isNullableString(v.cwd) || !isNullableString(v.version)) return null;
```

`src/adapters/types.ts`(찾을 곳 3/4):

```ts
  if ((v.initialSkills !== null && initialSkills === null) || (v.initialMcpServers !== null && initialMcpServers === null)) return null;
  return {
```

`src/adapters/types.ts`(바꾼 뒤 3/4):

```ts
  if ((v.initialSkills !== null && initialSkills === null) || (v.initialMcpServers !== null && initialMcpServers === null)) return null;
  const codex = v.tool === "codex" ? reviveCodex(v.codex) : undefined;
  if (codex === null || (v.tool !== "codex" && v.codex !== undefined)) return null;
  return {
```

`src/adapters/types.ts`(찾을 곳 4/4):

```ts
    },
  };
```

`src/adapters/types.ts`(바꾼 뒤 4/4):

```ts
    },
    ...(codex === undefined ? {} : { codex }),
  };
```

`src/collect/claude.ts`(찾을 곳):

```ts
        if (!options.rescan) {
```

`src/collect/claude.ts`(바꾼 뒤):

```ts
        if (!options.rescan && key !== null) {
```

`src/state/cache.ts`(찾을 곳 1/5):

```ts
// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다(설계 9.4)
import { createHash } from "node:crypto";
```

`src/state/cache.ts`(바꾼 뒤 1/5):

```ts
// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다. Codex 항목은 지문 목록과 뺄 지문과의 겹침도 함께 넣고 꺼낸다(설계 9.4, 「5단계 계획 전 결정」 7번)
import { createHash } from "node:crypto";
```

`src/state/cache.ts`(찾을 곳 2/5):

```ts
import { normalizePath } from "../adapters/claude/locate.ts";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";
```

`src/state/cache.ts`(바꾼 뒤 2/5):

```ts
import { normalizePath } from "../adapters/claude/locate.ts";
import { reviveCodexExtra, type CodexCacheExtra } from "../adapters/codex/fingerprints.ts";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";
```

`src/state/cache.ts`(찾을 곳 3/5):

```ts
  bytesRead: number;
}
```

`src/state/cache.ts`(바꾼 뒤 3/5):

```ts
  bytesRead: number;
  /** Codex 항목만. 자기 기록의 지문 목록과, 해석할 때 뺀 지문 가운데 이 기록에도 있던 것의 지문 */
  codex?: CodexCacheExtra;
}
```

`src/state/cache.ts`(찾을 곳 4/5):

```ts

export async function cacheKeyFor(file: KeySource, parser: string, timeZone: string): Promise<CacheKey> {
  const handle = await open(file.path, "r");
  try {
    const length = Math.min(EDGE_BYTES, file.size);
```

`src/state/cache.ts`(바꾼 뒤 4/5):

```ts

/** 열쇠를 만든다. 연 파일의 크기나 수정 시각이 목록에서 받은 것과 다르면(목록을 본 뒤 바뀌었으면) null이다. 부르는 쪽은 그 파일의 캐시를 꺼내지도 넣지도 않는다 */
export async function cacheKeyFor(file: KeySource, parser: string, timeZone: string): Promise<CacheKey | null> {
  const handle = await open(file.path, "r");
  try {
    const opened = await handle.stat();
    if (opened.size !== file.size || opened.mtimeMs !== file.mtimeMs) return null;
    const length = Math.min(EDGE_BYTES, file.size);
```

`src/state/cache.ts`(찾을 곳 5/5):

```ts
    const summary = reviveSummary(entry.summary);
    return summary === null ? null : { key: entry.key, summary, bytesRead: entry.bytesRead };
  } catch {
```

`src/state/cache.ts`(바꾼 뒤 5/5):

```ts
    const summary = reviveSummary(entry.summary);
    if (summary === null) return null;
    if (summary.tool !== "codex") return entry.codex === undefined ? { key: entry.key, summary, bytesRead: entry.bytesRead } : null;
    const codex = reviveCodexExtra(entry.codex);
    return codex === null ? null : { key: entry.key, summary, bytesRead: entry.bytesRead, codex };
  } catch {
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex test/state test/adapters/types.test.ts test/collect/claude.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 16개, 시험 193개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/cache.test.ts test/collect/claude.test.ts test/state/cache-prune.test.ts test/state/cache.test.ts src/adapters/codex/fingerprints.ts src/adapters/codex/parser.ts src/adapters/types.ts src/collect/claude.ts src/state/cache.ts
git commit -m "feat: Codex 요약과 지문을 캐시에 넣고 목록 뒤 바뀐 파일은 다시 읽음"
```

---

### Task 8: 모으기

**Files:**
- Create: `src/adapters/codex/merge.ts`
- Create: `src/collect/codex.ts`
- Modify: `src/adapters/types.ts`
- Test: `test/adapters/codex/merge.test.ts`
- Test: `test/collect/codex.test.ts`

**Interfaces:**
- Consumes: 과제 1의 목록과 사본 묶기, 과제 2의 `readZstdLines`·`zstdAvailable`, 과제 3~5의 해석기와 지문, 과제 7의 캐시(목록을 본 뒤 바뀐 파일이면 열쇠가 `null`)와 `sharedDigest`, 1단계의 `readLines`, `mostlyBroken`, `visibleFrom`, `CollectOptions`, `makeWindows`, `maxVersion`.
- Produces: `addDayInto(into, from)`(`src/adapters/types.ts`), `mergeRecords(records, outside)`(`src/adapters/codex/merge.ts`), `CODEX_PARSER_ID`, `CodexCollectOptions`(`zstd`와 `statFile`은 시험용), `CodexReadStats`, `CodexCollectResult`(`summaries`, `read`, `visibleFrom`, `parentRecordMissing`, `mergedSessions`, `unknownMtimeSessions`, `unverifiedInheritance`, `idFallbacks` 등), `codexUnreadableCount(read)`, `collectCodex(options)`, `collectCodexFromList(home, list, options)`(`src/collect/codex.ts`). 3부가 평가 입력과 알림에 잇는다.

설계 9.2, 9.4, 9.8, 20.1, 「5단계 계획 전 결정」 2·3·7번, 「5단계 1부 계획에서 보완」의 6·7·8·11·14번이다.

- 목록은 거르지 않고 받아 정본마다 수집 구간을 가른다. 가르는 시각은 수정 시각과 변경 시각 가운데 늦은 것이다(과제 1. 모르면 구간에 넣는다. `--rescan`이면 모두 넣는다). 쓰는 중인지도 1단계의 판정에 더해, 그 늦은 시각이 평가 시각에서 2초 안쪽이면 쓰는 중으로 본다. 그런 기록은 캐시 열쇠가 맞아도 캐시를 꺼내지 않고 다시 읽는다(바이트가 그대로여도 끝 조각의 판정이 달라진다. 계획 리뷰 4차가 찾았다). 가르는 시각은 읽는 사본의 것이다(정본을 읽지 못해 다음 사본을 읽으면 그 사본의 것). 목록을 본 뒤 크기나 수정 시각이 바뀐 기록(크기는 그대로이고 수정 시각만 바뀐 것도)도 이번 실행 중에 바뀐 것이라 쓰는 중으로 보고, 캐시 열쇠가 없어(과제 7) 캐시를 꺼내지 않는다(쓰는 동안 수정 시각이 머무는 기록은 크기로만 드러난다. 계획 리뷰 5차·6차가 찾았다). 크기와 시각을 읽는 함수(`statFile`)는 시험용 선택이다. 구간 밖의 기록은 열지 않고 센다. 다만 하위 세션의 부모이거나 구간 안 기록과 같은 세션일 때는 지문을 얻으려고 읽고 요약에는 넣지 않는다. 부모는 기록 파일의 식별자와, 대화를 되돌려 생긴 기록이면 이름 앞의 원래 세션 ID(`baseId`)로 찾고, 이름으로 찾은 기록은 읽어서 세션 ID가 맞을 때만 쓴다.
- 기록마다 정본부터 사본 차례로 읽는다. 크기를 보지 못한 사본, 그 Node.js가 풀지 못하는 압축 사본, 열거나 읽지 못한 사본은 다음 사본으로 넘어간다. 어느 사본도 읽지 못하면 정본의 까닭으로 센다(크기를 모름은 읽지 못한 파일, 압축을 풀지 못함은 건너뛴 압축 파일, 그 밖은 읽지 못한 파일). 읽지 않은 사본의 수를 센다(설계 9.2).
- 크기를 보지 못한 사본은 다른 사본을 읽은 기록의 것이어도 크기를 모르는 파일로 센다(그래서 읽지 못한 비율은 아래 경계다). 수정 시각을 보지 못한 사본이 있던 세션을 센다(그 기록을 읽지 못했으면 기록 파일 하나를 하나로 센다. 결정 3). 목록의 바이트는 기록마다 읽은 사본의 파일 크기다(어느 사본도 읽지 못하면 정본의 것. 디코더가 읽은 양이 아니라 건너뛸 수 있는 프레임도 든다). 크기는 알고 수정 시각만 모르는 사본은 크기를 모르는 사본이 아니다. 계획 초안은 정본의 크기만 보고, 수정 시각을 모르는 사본을 세지 않았다(계획 리뷰 1차가 찾았다).
- 압축 기록에서 아무것도 풀지 못하면(크기 0인 파일처럼 프레임이 없거나 깨진 것) 읽지 못한 것이고, 일부를 풀었는데 프레임이 잘렸거나 깨졌거나 풀다가 오류가 났으면(체크섬이 틀린 것도 든다) 일부만 읽은 파일이다. 빈 내용을 담은 완결된 프레임은 빈 `.jsonl`처럼 빈 기록이다(줄이 없어 세션 ID를 대신 쓴다). 절반 넘게 깨진 기록은 일부만 읽은 것보다 읽지 못한 파일이 앞선다. 절반 넘게 깨진 기록도 풀린 줄의 숫자는 쓴다(설계 9.8, 20.1, 결정 2).
- 두 번에 나눠 읽는다. 먼저 정본마다 캐시에서 꺼내거나(캐시 열쇠가 맞고 지문 칸이 있을 때) 뺄 지문 없이 해석한다. 자기 지문은 뺄 지문과 상관없이 정해진다. 그다음 기록마다 뺄 지문을 모은다. 하위 세션이면 부모 세션의 기록 파일들의 지문이고, 같은 세션에 기록 파일이 여럿이면 그보다 앞선 기록들의 지문도 넣는다. 같은 세션의 기록이 수집 구간 밖에 있어도 지문을 얻으려고 읽어 차례에 넣는다(요약에는 넣지 않고, 이름으로 찾은 기록은 읽어서 세션 ID가 맞을 때만 쓴다. 계획 리뷰 2차가 찾았다). 같은 세션의 기록 차례는 식별자가 세션 ID와 같은 원래 기록이 먼저이고, 그다음은 파일 이름(`rollout-<시각>-…`이라 만든 차례), 그다음은 정규화한 경로 차례다(목록의 차례와 상관없다). 계획 초안은 같은 세션의 기록끼리 빼지 않았다(계획 리뷰 1차가 찾았다). 뺄 지문은 처음 읽은 지문으로 모든 기록의 것을 먼저 정한 뒤 다시 읽는다(다시 읽기의 차례나 그새 바뀐 파일에 따라 달라지지 않는다). 뺄 지문과의 `sharedDigest`가 해석 때와 다르면 뺄 지문을 넣어 다시 읽는다. 부모 기록이 없어진 하위 요약도 다시 읽어 다 센다. 그러면 처음 실행에서 겹치는 기록만 두 번 읽고, 그다음부터는 캐시를 쓴다. 부모 값은 있는데 부모 기록을 하나도 읽지 못한 하위 세션의 수를 센다.
- 이어받은 것을 확인하지 못한 세션의 수는 다시 읽기가 모두 끝난 뒤에 센다(결정 7의 "대신 봄". 알림은 3부). 다시 읽다가 읽지 못했거나 다시 읽은 것이 일부만 읽혔으면(절반 넘게 깨짐 포함) 그 세션의 기록이 모자란 것이다(계획 리뷰 3차가 찾았다). 기준을 찾지 못한 기록(과제 5)이 있는 세션, 부모를 모르는(부모 값이 없거나 글자가 아니거나 자기 자신) 하위 세션, 부모 기록을 하나도 읽지 못했거나 일부를 읽지 못한(읽지 못함, 건너뜀, 일부만 읽음, 절반 넘게 깨짐, 부모 세션의 원래 기록을 찾지 못함. 구간 밖의 부모 기록을 읽지 못한 것도 든다) 하위 세션, 같은 세션의 다른 기록(구간 밖의 것도. 그 Node.js가 풀 수 없는 압축이라 건너뛴 것도 든다)을 읽지 못했거나 일부만 읽은 세션, 원래 기록(식별자가 세션 ID와 같은 기록. 압축본으로 읽었어도 원래 기록이다)을 찾지 못한 세션이다. 원래 기록 규칙은 주 세션과 하위 세션에 모두 쓴다(대화를 되돌려 생긴 기록만 남은 세션은 무엇을 이어받았는지 확인할 수 없다). 읽지 못한 기록이 어느 세션의 것인지는 이름의 식별자와 `baseId`로만 안다. 세션 ID를 대신 쓴 기록(과제 3)의 수를 까닭별로 센다.
- 캐시에는 쓰는 중이 아니고(목록을 본 뒤나 연 동안 바뀐 기록도 쓰는 중이다) 끝까지 읽은 기록만 넣는다(끊긴 압축과 쓰는 중인 파일은 넣지 않는다). 다시 읽다가 읽지 못한 기록은 읽지 못한 파일로 센다.
- 같은 세션 ID의 기록 파일은 하나로 합친다(결정 7). 정체(세션 ID, 주·하위, 부모, 작업 폴더, 지침)와 기록 파일 식별자, 세션 ID를 대신 쓴 까닭은 식별자가 세션 ID와 같은 원래 기록에서, 없으면 식별자 차례로 첫 기록에서 가져온다. 날짜 칸(칸 모양 표대로 더하는 `addDayInto`), 빠진 것, 알림의 수, 정체 모를 종류, 이어받아 뺀 수는 더하고, 버전은 가장 높은 것, 가장 이른 날짜는 가장 이른 것이며, 기준을 찾지 못한 기록이 하나라도 있으면 그렇다고 남긴다. 수집 구간 밖이라 지문을 얻으려고 읽은 같은 세션의 기록도 정체, 기록 파일 식별자, 대신 쓴 까닭, 버전, 가장 이른 날짜에는 쓰고 수에는 넣지 않는다(`mergeRecords`의 `outside`. 계획 리뷰 3차가 찾았다). 합친 세션의 수를 센다(구간 밖의 그런 기록도 센다). 작성자 PC에서는 대화를 되돌려 생긴 기록이 원래 기록과 응답·요청·항목 ID가 겹치지 않았다(결정 7의 까닭).
- 결과는 세션마다 가장 앞선 정본의 정규화한 경로 차례이고, 목록의 차례와 상관없이 같다. 읽은 양은 정본의 수, 목록의 바이트, 읽은 바이트, 캐시에서 꺼낸 수, 쓰는 중이었던 수, 구간 밖의 수, 읽지 못한 파일(과 그 바이트), 크기를 모르는 사본의 수, 읽지 못한 폴더, 건너뛴 압축 파일(과 그 바이트), 일부만 읽은 파일, 읽지 않은 사본, 이름 없는 파일이다. 읽지 못한 파일의 경로와 바이트는 목록의 바이트에 넣은 사본(읽은 사본. 어느 사본도 읽지 못했으면 정본)의 것이라 읽지 못한 비율이 1을 넘지 않는다(계획 리뷰 2차가 찾았다). 관측에 넘기는 읽지 못한 것의 수는 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더한 것이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/merge.test.ts`(새 파일):

```ts
// 한 논리 세션의 기록 파일 여럿(대화를 되돌려 생긴 기록 등)의 요약을 하나로 합치는 것을 시험한다(설계 9.2, 「5단계 계획 전 결정」 7번)
import { describe, expect, it } from "vitest";
import { mergeRecords } from "../../../src/adapters/codex/merge.ts";
import { CodexSessionParser } from "../../../src/adapters/codex/parser.ts";
import { reviveSummary } from "../../../src/adapters/types.ts";

const line = (timestamp: string, type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp, type, payload });
const item = (timestamp: string, it: Record<string, unknown>) => line(timestamp, "event_msg", { type: "item_completed", item: it });
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: n + 1 });
const record = (timestamp: string, id: string, n: number) => line(timestamp, "token_usage_record", { response_id: id, usage: usage(n), thread_token_usage: usage(n) });
function parse(recordId: string, lines: string[]) {
  const parser = new CodexSessionParser({ recordId, timeZone: "Asia/Seoul" });
  for (const text of lines) parser.line(text);
  return parser.finish(null, false);
}

const D1 = "2026-11-09T01:00:00Z";
const D2 = "2026-11-10T01:00:00Z";
const ORIGINAL = parse("s1", [
  line(D1, "session_meta", { id: "s1", cwd: "C:/work", cli_version: "0.150.0", thread_source: "user" }),
  line(D1, "world_state", { state: { agents_md: { text: "abcd" } } }),
  line(D1, "turn_context", { model: "m1", effort: "high" }),
  record(D1, "r1", 10),
  item(D1, { type: "UserMessage", id: "u1" }),
  item(D1, { type: "Zeta", id: "z1" }),
  item(D2, { type: "CommandExecution", id: "x1", exit_code: 1 }),
  record(D2, "r2", 20),
  "{broken",
]);
const REVERTED = parse("r-2", [
  line(D2, "session_meta", { id: "s1", cwd: "C:/elsewhere", cli_version: "0.166.0", thread_source: "user", history_base: {} }),
  line(D2, "world_state", { state: { agents_md: { text: "zz" } } }),
  line(D2, "turn_context", { model: "m2" }),
  record(D2, "r9", 7),
  item(D2, { type: "UserMessage", id: "u9" }),
  item(D2, { type: "Alpha", id: "a9" }),
  item(D2, { type: "McpToolCall", id: "m9", server: "github", status: "failed" }),
  item(D2, { type: "CommandExecution", id: "x9", exit_code: 0 }),
]);

describe("같은 세션의 기록 파일 합치기", () => {
  it("기록이 하나면 그대로다", () => {
    expect(mergeRecords([ORIGINAL])).toBe(ORIGINAL);
  });

  it("정체(세션 ID, 주·하위, 작업 폴더, 지침)와 기록 파일 식별자는 식별자가 세션 ID와 같은 원래 기록의 것이다. 버전은 가장 높은 것, 가장 이른 날짜는 가장 이른 것이다", () => {
    const merged = mergeRecords([REVERTED, ORIGINAL]);
    expect(merged).toMatchObject({ tool: "codex", sessionId: "s1", kind: "main", parentSessionId: null, cwd: "C:/work", version: "0.166.0", firstDate: "2026-11-09", instructionChars: { ascii: 4, other: 0 } });
    expect(merged.codex).toMatchObject({ recordId: "s1", unknownThreadSource: null, idFallback: null });
  });

  it("가장 이른 날짜는 원래 기록보다 다른 기록이 더 일러도 가장 이른 것이다", () => {
    const later = parse("s1", [line(D2, "session_meta", { id: "s1", cli_version: "0.150.0", thread_source: "user" }), record(D2, "r1", 10)]);
    const earlier = parse("r-0", [line(D1, "session_meta", { id: "s1", cli_version: "0.140.0", thread_source: "user" })]);
    expect(mergeRecords([later, earlier])).toMatchObject({ firstDate: "2026-11-09", version: "0.150.0", codex: { recordId: "s1" } });
  });

  it("날짜 칸의 수는 더한다(응답, 토큰, 사람 요청, 도구, 모델, 추론 강도, MCP 호출)", () => {
    const merged = mergeRecords([ORIGINAL, REVERTED]);
    expect(merged.days["2026-11-09"]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 10 }, models: { m1: 1 }, efforts: { high: 1 } });
    const later = merged.days["2026-11-10"]!;
    expect(later).toMatchObject({ responses: 2, humanRequests: 1, tokens: { input: 27, output: 2 }, models: { m1: 1, m2: 1 }, efforts: { high: 1 }, unknownEffort: 1, mcpCalls: { github: 1 } });
    expect(later.tools.shell).toMatchObject({ calls: 2, results: 2, errors: 1 });
    expect(later.tools.mcp__github).toMatchObject({ calls: 1, results: 1, errors: 1 });
  });

  it("빠진 것, 알림의 수, 정체 모를 종류, 이어받아 뺀 수를 더한다", () => {
    const merged = mergeRecords([ORIGINAL, REVERTED]);
    expect(merged.missing).toEqual({ lines: ORIGINAL.missing.lines + REVERTED.missing.lines, brokenLines: 1, tailFragments: 0, tooLongLines: 0, unconfirmedTypes: { "?": 1 } });
    expect(merged.codex?.unknownItemTypes).toEqual({ Alpha: 1, Zeta: 1 });
    expect(merged.codex?.inheritedSkipped).toEqual({ items: 0, totals: 0, responses: 0 });
  });

  it("날짜를 몰라 세지 못한 줄의 수와 캐시 쓰기 토큰도 더한다. 기준을 찾지 못한 기록이 하나라도 있으면 그렇다고 남긴다", () => {
    const untimed = (id: string) => JSON.stringify({ type: "token_usage_record", payload: { response_id: id, usage: usage(1), thread_token_usage: usage(1) } });
    const written = (id: string, n: number) => line(D1, "token_usage_record", { response_id: id, usage: { ...usage(1), cache_write_input_tokens: n }, thread_token_usage: usage(1) });
    const head = JSON.stringify({ type: "session_meta", payload: { id: "s1", thread_source: "user" } });
    const a = parse("s1", [head, untimed("u1"), written("w1", 2)]);
    const b = parse("r-9", [head, untimed("u2"), written("w2", 3)]);
    const merged = mergeRecords([a, b]);
    expect(merged.notes.undatedLines).toBe(2);
    expect(merged.days["2026-11-09"]?.tokens.cacheWrite).toBe(5);
    expect(merged.codex?.baselineMissing).toBe(false);
    expect(mergeRecords([a, { ...b, codex: { ...b.codex!, baselineMissing: true } }]).codex?.baselineMissing).toBe(true);
  });

  it("넣은 차례와 상관없이 같은 요약이고, 캐시에서 되살린 것과 JSON 글이 같다(열쇠 차례가 정해져 있다)", () => {
    const a = mergeRecords([ORIGINAL, REVERTED]);
    const b = mergeRecords([REVERTED, ORIGINAL]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(reviveSummary(JSON.parse(JSON.stringify(a))))).toBe(JSON.stringify(a));
  });

  it("구간 밖의 기록(outside)은 정체·기록 파일 식별자·버전·가장 이른 날짜에만 쓰고 수는 더하지 않는다", () => {
    const merged = mergeRecords([REVERTED], [ORIGINAL]);
    expect(merged).toMatchObject({ sessionId: "s1", cwd: "C:/work", instructionChars: { ascii: 4, other: 0 }, codex: { recordId: "s1" } });
    expect(mergeRecords([ORIGINAL], [REVERTED]).version).toBe("0.166.0");
    expect(merged.firstDate).toBe("2026-11-09");
    expect(merged.days).toEqual(mergeRecords([REVERTED]).days);
    expect(merged.missing.brokenLines).toBe(REVERTED.missing.brokenLines);
    expect(mergeRecords([REVERTED], [])).toBe(REVERTED);
  });

  it("구간 밖 원래 기록의 정체 모를 출처, 주·하위, 부모도 합친 정체에 쓴다", () => {
    const original = parse("s1", [line(D1, "session_meta", { id: "s1", thread_source: "future-source" })]);
    const inside = parse("r-9", [line(D2, "session_meta", { id: "s1", thread_source: "user" }), record(D2, "r9", 7)]);
    expect(mergeRecords([inside], [original]).codex?.unknownThreadSource).toBe("future-source");
    const subOriginal = parse("s1", [line(D1, "session_meta", { id: "s1", thread_source: "subagent", parent_thread_id: "mom" })]);
    expect(mergeRecords([inside], [subOriginal])).toMatchObject({ kind: "sub", parentSessionId: "mom" });
  });

  it("원래 기록이 없으면 기록 파일 식별자 차례로 첫 기록의 정체를 쓴다. 합친 요약은 넣은 요약을 바꾸지 않는다", () => {
    const other = parse("r-1", [line(D1, "session_meta", { id: "s1", cwd: "C:/first", cli_version: "0.140.0", thread_source: "user" })]);
    const before = JSON.stringify(REVERTED);
    const merged = mergeRecords([REVERTED, other]);
    expect(merged).toMatchObject({ cwd: "C:/first", version: "0.166.0", codex: { recordId: "r-1" } });
    expect(JSON.stringify(REVERTED)).toBe(before);
  });
});
```

`test/collect/codex.test.ts`(새 파일):

```ts
// Codex 기록 모으기(정본과 다음 사본, 압축 기록과 건너뛴 압축, 끊긴 압축, 읽지 못한 파일, 이어받은 앞부분 빼기, 구간 밖의 부모와 같은 세션 기록, 같은 세션의 기록 합치기, 캐시와 그 무효화, 쓰는 중인 파일, 목록의 차례)를 시험한다(설계 9.1~9.4, 9.8, 20.1, 「5단계 계획 전 결정」 2·3·7번)
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { rmSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listCodexFiles, type StatFile } from "../../src/adapters/codex/locate.ts";
import { CodexSessionParser } from "../../src/adapters/codex/parser.ts";
import { zstdAvailable } from "../../src/adapters/codex/zstd.ts";
import { codexUnreadableCount, collectCodex, collectCodexFromList, type CodexCollectOptions } from "../../src/collect/codex.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 코덱스 모으기 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");
const OLD_TIME = Date.parse("2026-01-01T00:00:00Z");
const T = "2026-11-11T03:00:00Z";
const ID = (n: number) => `019a0000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const compress = (data: Buffer): Buffer => (zlib as unknown as { zstdCompressSync(data: Buffer): Buffer }).zstdCompressSync(data);

const line = (type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp: T, type, payload });
const meta = (id: string, extra: Record<string, unknown> = {}) => line("session_meta", { id, cwd: "C:/work", cli_version: "0.166.0", thread_source: "user", ...extra });
const sub = (id: string, parent: string) => meta(id, { thread_source: "subagent", parent_thread_id: parent });
const item = (it: Record<string, unknown>) => line("event_msg", { type: "item_completed", item: it });
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: n + 1 });
const record = (id: string, n: number) => line("token_usage_record", { response_id: id, usage: usage(n), thread_token_usage: usage(n) });

const dir = () => join(root, ".codex", "sessions", "2026", "11", "11");
async function rollout(n: number, lines: string[], options: { mtimeMs?: number; compressed?: boolean; bytes?: (raw: Buffer) => Buffer; nameTime?: string } = {}): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const path = join(dir(), `rollout-2026-11-11T${options.nameTime ?? "12-00-00"}-${ID(n)}.jsonl${options.compressed ? ".zst" : ""}`);
  const raw = Buffer.from(`${lines.join("\n")}\n`);
  const content = options.compressed ? compress(raw) : raw;
  await writeFile(path, options.bytes ? options.bytes(content) : content);
  const mtime = options.mtimeMs ?? FILE_TIME;
  await utimes(path, mtime / 1000, mtime / 1000);
  return path;
}
/** 대화를 되돌려 생긴 기록. 이름은 rollout-<시각>-<원래 세션>_<새 기록>이다 */
async function reverted(base: number, n: number, lines: string[], options: { mtimeMs?: number; nameTime?: string; compressed?: boolean } = {}): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const path = join(dir(), `rollout-2026-11-11T${options.nameTime ?? "13-00-00"}-${ID(base)}_${ID(n)}.jsonl${options.compressed ? ".zst" : ""}`);
  const raw = Buffer.from(`${lines.join("\n")}\n`);
  await writeFile(path, options.compressed ? compress(raw) : raw);
  const mtime = options.mtimeMs ?? FILE_TIME;
  await utimes(path, mtime / 1000, mtime / 1000);
  return path;
}
const HISTORY = { history_mode: "paginated", history_base: { thread_id: ID(1) } };
/** 시험 파일은 utimes가 변경 시각을 지금으로 바꾸므로, 수정 시각으로 시각을 꾸민 시험은 변경 시각을 수정 시각과 같게 읽는다 */
const sameTimes: StatFile = async (path) => {
  const info = await stat(path);
  return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.mtimeMs };
};
const options = (overrides: Partial<CodexCollectOptions> = {}): CodexCollectOptions => ({ env: {}, homedir: root, clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, cacheDir: join(root, "state", "cache"), rescan: false, statFile: sameTimes, ...overrides });
const responses = (summary: { days: Record<string, { responses: number }> }) => Object.values(summary.days).reduce((sum, day) => sum + day.responses, 0);
const bySession = (result: Awaited<ReturnType<typeof collectCodex>>, id: string) => result.summaries.find((summary) => summary.sessionId === id)!;

describe("기록 폴더와 읽은 양", () => {
  it("기록 폴더가 없으면 찾지 못한 것이고 요약이 없다", async () => {
    const result = await collectCodex(options());
    expect(result).toMatchObject({ tool: "codex", detected: false, summaries: [], parentRecordMissing: 0, mergedSessions: 0 });
    expect(result.read).toMatchObject({ files: 0, bytes: 0, skippedFiles: [], partialFiles: [] });
  });

  it("세션마다 요약 하나를 내고, 목록에 있는 기록과 바이트, 읽은 바이트를 센다", async () => {
    const a = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await rollout(2, [meta(ID(2)), record("r2", 20), record("r3", 30)]);
    const result = await collectCodex(options());
    expect(result.detected).toBe(true);
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1), ID(2)]);
    expect(responses(bySession(result, ID(2)))).toBe(2);
    const size = (await readFile(a)).length + (await readFile(join(dir(), `rollout-2026-11-11T12-00-00-${ID(2)}.jsonl`))).length;
    expect(result.read).toMatchObject({ files: 2, listedBytes: size, bytes: size, unreadableFiles: [], skippedCopies: 0 });
    expect(codexUnreadableCount(result.read)).toBe(0);
  });

  it("수집 구간보다 오래된 기록은 열지 않고 센다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: OLD_TIME });
    const result = await collectCodex(options());
    expect(result.summaries).toEqual([]);
    expect(result.read.olderThanWindow).toBe(1);
  });

  it("수정 시각과 변경 시각 가운데 늦은 것이 수집 구간의 아래 경계와 같으면 넣고, 그보다 앞서면 열지 않는다", async () => {
    const bound = makeWindows(NOW, "Asia/Seoul").collectStartLowerBoundMs;
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: bound });
    await rollout(2, [meta(ID(2)), record("r2", 10)], { mtimeMs: bound - 1 });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(result.read).toMatchObject({ files: 1, olderThanWindow: 1 });
  });

  it("늦은 시각이 평가 시각에서 정확히 2초 전이면 쓰는 중이 아니다(2초 안쪽만 쓰는 중이다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const at = (ms: number): StatFile => async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: ms };
    };
    expect((await collectCodex(options({ cacheDir: null, statFile: at(NOW - 2000) }))).read.inProgress).toBe(0);
    expect((await collectCodex(options({ cacheDir: null, statFile: at(NOW - 1999) }))).read.inProgress).toBe(1);
  });

  it("수정 시각이 수집 구간보다 앞서도 변경 시각이 구간 안이면(쓰는 동안 수정 시각이 만든 시각에 머문 기록) 구간에 넣어 읽는다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: OLD_TIME });
    // 진짜 stat을 쓴다. utimes가 수정 시각만 옛날로 돌리고 변경 시각은 지금으로 바꿨다
    const result = await collectCodex(options({ statFile: undefined, cacheDir: null }));
    expect(result.read).toMatchObject({ files: 1, olderThanWindow: 0 });
    expect(responses(result.summaries[0]!)).toBe(1);
  });

  it("절반 넘게 깨진 기록은 읽지 못한 파일로 세고 풀린 줄의 숫자는 쓴다. 그런 기록이 여럿이면 바이트를 더한다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10), "{x", "{y", "{z"]);
    const second = await rollout(2, [meta(ID(2)), "{x", "{y"]);
    const result = await collectCodex(options());
    expect(result.read.unreadableFiles).toEqual([path, second].sort());
    expect(responses(bySession(result, ID(1)))).toBe(1);
    expect(result.read.unreadableFileBytes).toBe((await readFile(path)).length + (await readFile(second)).length);
    expect(codexUnreadableCount(result.read)).toBe(2);
  });

  it("크기를 보지 못한 사본은 정본을 읽은 기록의 것이어도 크기를 모르는 사본으로 세고, 수정 시각을 보지 못한 사본이 있던 세션을 센다. 목록 바이트는 읽은 사본의 것이다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const listed = await listCodexFiles(join(root, ".codex"), null, sameTimes);
    const ghost = `${path}.zst`;
    const list = { ...listed, files: [...listed.files, { path: ghost, normPath: ghost.toLowerCase(), size: null, mtimeMs: null, changedMs: null, recordId: ID(1), baseId: null, compressed: true }] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.read).toMatchObject({ files: 1, listedBytes: (await readFile(path)).length, unknownSizeFiles: 1, unreadableFiles: [], skippedCopies: 1 });
    expect(result.unknownMtimeSessions).toBe(1);
  });

  it("세션 ID를 기록 파일의 식별자로 대신 쓴 기록을 까닭별로 센다. 깨진 첫 줄 뒤의 session_meta로 정체를 정하지 않는다", async () => {
    await rollout(1, ["{broken", meta(ID(9)), record("r1", 10), record("r2", 10), record("r3", 10)]);
    await rollout(2, [record("r9", 5)]);
    await rollout(3, [record("r8", 5)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.idFallbacks).toEqual({ "first-line-not-meta": 2, "first-line-unreadable": 1 });
    expect(result.summaries.map((summary) => summary.sessionId).sort()).toEqual([ID(1), ID(2), ID(3)]);
  });

  it("크기를 모르는 사본은 하나하나 세고, 수정 시각을 모르는 사본은 논리 세션마다 한 번 센다. 크기는 알고 수정 시각만 모르는 사본은 크기를 모르는 사본이 아니다", async () => {
    const original = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const later = await reverted(1, 3, [meta(ID(1), HISTORY), record("r3", 30)]);
    const listed = await listCodexFiles(join(root, ".codex"), null, sameTimes);
    const ghost = (path: string, recordId: string, baseId: string | null, size: number | null) => ({ path, normPath: path.toLowerCase(), size, mtimeMs: null, changedMs: null, recordId, baseId, compressed: true });
    const list = { ...listed, files: [...listed.files, ghost(`${original}.zst`, ID(1), null, null), ghost(`${original}.old.zst`, ID(1), null, null), ghost(`${later}.zst`, ID(3), ID(1), 100)] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result.read.unknownSizeFiles).toBe(2);
    expect(result.unknownMtimeSessions).toBe(1);
  });

  it("정본을 열지 못하고 다른 사본도 없으면 읽지 못한 파일이고, 크기를 모르면 크기를 모르는 파일로도 센다", async () => {
    await mkdir(dir(), { recursive: true });
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const unknown = join(dir(), `rollout-2026-11-11T12-00-00-${ID(2)}.jsonl`);
    const list = {
      sessionsFound: true,
      files: [
        { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false },
        { path: unknown, normPath: unknown.toLowerCase(), size: null, mtimeMs: null, changedMs: null, recordId: ID(2), baseId: null, compressed: false },
      ],
      olderThanWindow: 0,
      unreadableDirs: [],
      unnamedFiles: 0,
    };
    const result = await collectCodexFromList(join(root, ".codex"), list, options());
    expect(result.read).toMatchObject({ files: 2, listedBytes: 10, unreadableFiles: [missing, unknown].sort(), unreadableFileBytes: 10, unknownSizeFiles: 1 });
  });
});

describe.skipIf(!zstdAvailable())("사본과 압축 기록", () => {
  it("같은 기록 파일의 사본 가운데 압축하지 않은 정본 하나만 읽고, 읽지 않은 사본을 센다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await rollout(1, [meta(ID(1)), record("r1", 10), record("r2", 20)], { compressed: true });
    const result = await collectCodex(options());
    expect(result.summaries).toHaveLength(1);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.read).toMatchObject({ files: 1, skippedCopies: 1 });
  });

  it("정본을 열지 못하면 다음 사본을 읽는다", async () => {
    const zst = await rollout(1, [meta(ID(1)), record("r1", 10), record("r2", 20)], { compressed: true });
    const listed = await listCodexFiles(join(root, ".codex"), null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 99, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options());
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result.read).toMatchObject({ unreadableFiles: [], skippedCopies: 1 });
    expect(result.read.bytes).toBe((await readFile(zst)).length);
    expect(result.read.listedBytes).toBe((await readFile(zst)).length);
  });

  it("다음 사본을 읽은 기록이 절반 넘게 깨졌으면 읽지 못한 파일과 그 바이트는 읽은 사본의 것이다(읽지 못한 비율이 1을 넘지 않는다)", async () => {
    const zst = await rollout(1, [meta(ID(1)), record("r1", 10), "{x", "{y", "{z"], { compressed: true });
    const listed = await listCodexFiles(join(root, ".codex"), null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 100_000, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options());
    const size = (await readFile(zst)).length;
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.read).toMatchObject({ unreadableFiles: [zst], listedBytes: size, unreadableFileBytes: size });
  });

  it("압축 기록만 있으면 풀어 읽는다. 풀 수 없는 Node.js에서는 건너뛴 압축 파일로 세고 그 바이트를 센다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true });
    expect(responses((await collectCodex(options())).summaries[0]!)).toBe(1);
    const skipped = await collectCodex(options({ zstd: false, cacheDir: null }));
    expect(skipped.summaries).toEqual([]);
    expect(skipped.read).toMatchObject({ files: 1, skippedFiles: [path], skippedFileBytes: (await readFile(path)).length, unreadableFiles: [] });
    expect(codexUnreadableCount(skipped.read)).toBe(1);
  });

  it("목록 바이트는 디코더가 읽은 양이 아니라 읽은 사본 파일의 크기다(앞의 건너뛸 수 있는 프레임도 든다)", async () => {
    const skippable = Buffer.alloc(24);
    skippable.writeUInt32LE(0x184d2a50, 0);
    skippable.writeUInt32LE(16, 4);
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true, bytes: (content) => Buffer.concat([skippable, content]) });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.read.listedBytes).toBe((await readFile(path)).length);
  });

  it("절반 넘게 깨진 압축 기록의 읽지 못한 바이트는 파일의 크기다(앞의 건너뛸 수 있는 프레임도 든다)", async () => {
    const skippable = Buffer.alloc(24);
    skippable.writeUInt32LE(0x184d2a50, 0);
    skippable.writeUInt32LE(16, 4);
    const path = await rollout(1, [meta(ID(1)), "{x", "{y"], { compressed: true, bytes: (content) => Buffer.concat([skippable, content]) });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.read.unreadableFiles).toEqual([path]);
    expect(result.read.unreadableFileBytes).toBe((await readFile(path)).length);
  });

  it("자기 원래 기록이 압축본만 있어도 원래 기록을 찾은 것이다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.unverifiedInheritance).toBe(0);
  });

  it("부모의 원래 기록을 압축본으로 읽어도 원래 기록을 찾은 것이다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)], { compressed: true });
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10), record("r2", 20)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 0 });
  });

  it("구간 밖 같은 세션의 원래 기록이 압축본만 있어도 풀어 지문을 얻고 뒤 기록에서 뺀다", async () => {
    await rollout(1, [meta(ID(1)), record("shared", 10)], { compressed: true, mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), HISTORY), record("shared", 10), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.unverifiedInheritance).toBe(0);
  });

  it("구간 밖 같은 세션의 다른 기록이 그 Node.js가 풀 수 없는 압축이면 이어받은 것을 확인하지 못한 세션으로 센다(구간 밖이라 건너뛴 압축 파일로는 세지 않는다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), HISTORY), record("r2", 20)], { compressed: true, mtimeMs: OLD_TIME, nameTime: "13-00-00" });
    await reverted(1, 4, [meta(ID(1), HISTORY), record("r4", 40)], { nameTime: "14-00-00" });
    const result = await collectCodex(options({ cacheDir: null, zstd: false }));
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result.unverifiedInheritance).toBe(1);
    expect(result.read).toMatchObject({ skippedFiles: [], olderThanWindow: 1 });
  });

  it("압축 기록도 늦은 시각이 평가 시각에서 2초 안쪽이면 쓰는 중이다(줄바꿈 없는 끝을 끝 조각으로 세고 캐시에 넣지 않는다)", async () => {
    await rollout(1, [], { compressed: true, bytes: () => compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`)) });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1000 };
    };
    const first = await collectCodex(options({ statFile: fresh }));
    expect(first.summaries[0]!.missing).toMatchObject({ tailFragments: 1, brokenLines: 0 });
    expect(first.read.inProgress).toBe(1);
    // 1분 뒤에는 쓰는 중이 아니라 캐시를 꺼내 본다. 넣었다면 꺼낸다
    expect((await collectCodex(options({ statFile: fresh, clock: { nowMs: NOW + 60_000, timeZone: "Asia/Seoul" } }))).read.fromCache).toBe(0);
  });

  it("캐시에 넣은 압축 기록도 변경 시각만 1999밀리초 전으로 바뀌면 캐시를 쓰지 않고 다시 읽는다(캐시 없는 읽기와 같다)", async () => {
    await rollout(1, [], { compressed: true, bytes: () => compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`)) });
    expect((await collectCodex(options())).read).toMatchObject({ fromCache: 0, inProgress: 0 });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1999 };
    };
    const cached = await collectCodex(options({ statFile: fresh }));
    const uncached = await collectCodex(options({ statFile: fresh, cacheDir: null }));
    expect(cached.summaries).toEqual(uncached.summaries);
    expect(cached.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
    expect(cached.read).toMatchObject({ inProgress: 1, fromCache: 0 });
  });

  it("정본을 읽지 못해 다음 사본의 캐시를 볼 때는 그 사본의 변경 시각으로 쓰는 중을 가른다", async () => {
    const plain = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const packed = await rollout(1, [], { compressed: true, bytes: () => compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`)) });
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    await rm(plain);
    expect((await collectCodexFromList(home, list, options())).read).toMatchObject({ fromCache: 0, inProgress: 0 });
    const newer = { ...list, files: list.files.map((file) => (file.path === packed ? { ...file, changedMs: NOW - 1000 } : file)) };
    const cached = await collectCodexFromList(home, newer, options());
    const uncached = await collectCodexFromList(home, newer, options({ cacheDir: null }));
    expect(cached.summaries).toEqual(uncached.summaries);
    expect(cached.read).toMatchObject({ inProgress: 1, fromCache: 0 });
  });

  it("목록을 얻은 뒤 다시 쓰인 압축 기록은 캐시를 꺼내지 않고 쓰는 중으로 센다(캐시 없는 읽기와 같다)", async () => {
    const packed = await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true });
    expect((await collectCodex(options())).read.fromCache).toBe(0);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    await writeFile(packed, compress(Buffer.from(`${[meta(ID(1)), record("r1", 10), record("r2", 20)].join("\n")}\n`)));
    await utimes(packed, FILE_TIME / 1000, FILE_TIME / 1000);
    const cached = await collectCodexFromList(home, list, options());
    const direct = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(responses(bySession(direct, ID(1)))).toBe(2);
    expect(cached.summaries).toEqual(direct.summaries);
    expect(cached.read).toMatchObject({ fromCache: 0, inProgress: 1 });
    expect(direct.read.inProgress).toBe(1);
  });

  it("뺄 지문을 넣어 다시 읽은 압축 부모 기록이 그새 일부만 읽히게 됐으면 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10)]);
    const lines = [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10), record("p1", 20)];
    const parent = await rollout(2, lines, { compressed: true });
    await rollout(3, [sub(ID(3), ID(2)), record("p1", 20), record("c1", 30)]);
    const finish = CodexSessionParser.prototype.finish;
    let done = false;
    // 부모 기록을 처음 다 읽은 뒤 끝에 잘린 다음 프레임의 머리를 붙여, 다시 읽은 것만 일부만 읽히게 한다
    const spy = vi.spyOn(CodexSessionParser.prototype, "finish").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["finish"]>) {
      const summary = finish.apply(this, args);
      if (!done && summary.sessionId === ID(2)) {
        done = true;
        writeFileSync(parent, Buffer.concat([compress(Buffer.from(`${lines.join("\n")}\n`)), Buffer.from([0x28, 0xb5])]));
      }
      return summary;
    });
    try {
      const result = await collectCodex(options({ cacheDir: null }));
      expect(result.read.partialFiles).toEqual([parent]);
      expect(responses(bySession(result, ID(3)))).toBe(1);
      expect(result.unverifiedInheritance).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("끝 프레임이 잘린 압축 기록은 일부만 읽은 파일로 세고 풀린 줄의 숫자를 쓰며 캐시에 넣지 않는다", async () => {
    const first = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`));
    const second = compress(Buffer.from(`${record("r2", 20)}\n`));
    const path = await rollout(1, [], { compressed: true, bytes: () => Buffer.concat([first, second.subarray(0, second.length - 3)]) });
    const result = await collectCodex(options());
    expect(result.read.partialFiles).toEqual([path]);
    expect(result.read.unreadableFiles).toEqual([]);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect((await collectCodex(options())).read.fromCache).toBe(0);
  });

  it("빈 내용을 담은 완결된 압축 프레임은 빈 기록으로 읽는다(빈 .jsonl과 같다). 읽지 못한 파일이나 일부만 읽은 파일이 아니다", async () => {
    await rollout(1, [], { compressed: true, bytes: () => compress(Buffer.alloc(0)) });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.read).toMatchObject({ files: 1, unreadableFiles: [], partialFiles: [] });
    expect(result.summaries[0]).toMatchObject({ sessionId: ID(1), missing: { lines: 0 }, codex: { idFallback: "no-lines" } });
    expect(result.idFallbacks).toEqual({ "no-lines": 1 });
  });

  it("구조가 완결된 압축 기록이라도 풀다가 체크섬이 틀리면 일부만 읽은 파일이다", async () => {
    const one = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`));
    const two = zlib.zstdCompressSync(Buffer.from(`${record("r2", 20)}\n`), { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } });
    two.writeUInt8(two.readUInt8(two.length - 1) ^ 1, two.length - 1);
    const path = await rollout(1, [], { compressed: true, bytes: () => Buffer.concat([one, two]) });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.read.partialFiles).toEqual([path]);
    expect(codexUnreadableCount(result.read)).toBe(1);
  });
});

describe("이어받은 앞부분", () => {
  const MOM = () => [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)];
  const CHILD = () => [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10), item({ type: "UserMessage", id: "u2" }), record("r2", 20)];

  it("하위 세션은 부모 기록에도 있는 항목과 응답을 다시 세지 않는다", async () => {
    await rollout(1, MOM());
    await rollout(2, CHILD());
    const result = await collectCodex(options());
    const child = bySession(result, ID(2));
    expect(child).toMatchObject({ kind: "sub", parentSessionId: ID(1) });
    expect(Object.values(child.days)[0]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 20 } });
    expect(child.codex?.inheritedSkipped).toEqual({ items: 1, totals: 0, responses: 1 });
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 0 });
  });

  it("부모 기록이 없으면 다 세고 부모 기록이 없는 하위 세션으로 센다", async () => {
    await rollout(2, CHILD());
    const result = await collectCodex(options());
    expect(responses(bySession(result, ID(2)))).toBe(2);
    expect(result).toMatchObject({ parentRecordMissing: 1, unverifiedInheritance: 1 });
  });

  it("부모를 모르는 하위 세션(부모 값이 없거나, 글자가 아니거나, 자기 자신)은 다 세고 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(2, [meta(ID(2), { thread_source: "subagent" }), record("r1", 10)]);
    await rollout(3, [meta(ID(3), { thread_source: "subagent", parent_thread_id: 7 }), record("r2", 20)]);
    await rollout(4, [sub(ID(4), ID(4)), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(bySession(result, ID(2))).toMatchObject({ kind: "sub", parentSessionId: null });
    expect(bySession(result, ID(3))).toMatchObject({ kind: "sub", parentSessionId: null });
    expect(bySession(result, ID(4))).toMatchObject({ kind: "sub", parentSessionId: ID(4) });
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 3 });
  });

  it("부모 기록을 일부 읽지 못했으면(절반 넘게 깨진 부모) 그 지문으로 빼되 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [...MOM(), "{x", "{y", "{z", "{w"]);
    await rollout(2, CHILD());
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1 });
  });

  it("복사된 앞부분 안에서 부모 지문에 없는 누적값을 센 하위 세션은 기준을 찾지 못한 것으로 센다", async () => {
    const count = (n: number) => line("event_msg", { type: "token_count", info: { total_token_usage: usage(n) } });
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), count(100)]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), count(150), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), count(300)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(bySession(result, ID(2)).codex?.baselineMissing).toBe(true);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1 });
  });

  it("같은 세션의 뒤 기록이 앞 기록의 앞부분을 다시 담았으면 그 부분을 다시 세지 않는다. 목록의 차례와 상관없다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u1" }), record("r1", 10), item({ type: "UserMessage", id: "u3" }), record("r3", 30)]);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    for (const files of [list.files, [...list.files].reverse()]) {
      const result = await collectCodexFromList(home, { ...list, files }, options({ cacheDir: null }));
      expect(result.summaries).toHaveLength(1);
      expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 2, humanRequests: 2, tokens: { input: 40 } });
      expect(result.summaries[0]!.codex?.inheritedSkipped).toMatchObject({ items: 1, responses: 1 });
      expect(result.unverifiedInheritance).toBe(0);
    }
  });

  it("같은 세션의 다른 기록을 읽지 못했으면 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r3", 30)]);
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [missing] } });
  });

  it("같은 세션의 앞 기록이 수집 구간보다 오래됐어도 지문을 얻으려고 읽어 뒤 기록에서 빼고, 그 기록의 수는 요약에 넣지 않는다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)], { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u1" }), record("r1", 10), item({ type: "UserMessage", id: "u3" }), record("r3", 30)]);
    const result = await collectCodex(options());
    expect(result.summaries).toHaveLength(1);
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 30 } });
    expect(result.summaries[0]!.codex?.inheritedSkipped).toMatchObject({ items: 1, responses: 1 });
    expect(result).toMatchObject({ unverifiedInheritance: 0, read: { olderThanWindow: 1, files: 1 } });
  });

  it("구간 밖이라 지문을 얻으려고 읽은 같은 세션의 원래 기록은 정체·지침·버전·가장 이른 날짜와 기록 파일 식별자에 쓰고 수에는 넣지 않는다", async () => {
    const old = (text: string) => JSON.stringify({ ...JSON.parse(text), timestamp: "2026-01-01T00:00:00Z" });
    const world = (text: string) => line("world_state", { state: { agents_md: { text } } });
    await rollout(1, [meta(ID(1), { cwd: "C:/original", cli_version: "0.166.0" }), world("abc"), item({ type: "UserMessage", id: "u1" }), record("r1", 10)].map(old), { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), { ...HISTORY, cwd: "C:/changed", cli_version: "0.165.0" }), world("abcdefg"), item({ type: "UserMessage", id: "u1" }), record("r1", 10), item({ type: "UserMessage", id: "u3" }), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.summaries).toHaveLength(1);
    const summary = result.summaries[0]!;
    expect(summary).toMatchObject({ sessionId: ID(1), cwd: "C:/original", version: "0.166.0", firstDate: "2026-01-01", instructionChars: { ascii: 3, other: 0 }, codex: { recordId: ID(1) } });
    expect(Object.keys(summary.days)).toEqual(["2026-11-11"]);
    expect(summary.days["2026-11-11"]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 30 } });
    expect(result).toMatchObject({ mergedSessions: 1, unverifiedInheritance: 0 });
  });

  it("원래 기록이 있어도 같은 세션의 다른 기록을 읽지 못했으면 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r3", 30)]);
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T13-30-00-${ID(1)}_${ID(4)}.jsonl`);
    const list = { ...listed, files: [...listed.files, { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(4), baseId: ID(1), compressed: false }] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [missing] } });
  });

  it("구간 밖의 같은 세션 기록이 여럿이면 모두 지문을 얻으려고 읽어 뒤 기록에서 뺀다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), HISTORY), record("r2", 20)], { mtimeMs: OLD_TIME, nameTime: "13-00-00" });
    await reverted(1, 4, [meta(ID(1), HISTORY), record("r1", 10), record("r2", 20), record("r4", 40)], { nameTime: "14-00-00" });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result).toMatchObject({ unverifiedInheritance: 0, read: { olderThanWindow: 2, files: 1 } });
  });

  it("하위 세션도 자기 원래 기록을 찾지 못하면(되돌려 생긴 기록만 있음) 부모를 찾았어도 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, MOM());
    await reverted(2, 9, [sub(ID(2), ID(1)), record("r2", 20)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(bySession(result, ID(2))).toMatchObject({ kind: "sub", parentSessionId: ID(1) });
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1 });
  });

  it("같은 세션의 구간 밖 기록을 읽지 못했으면 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r3", 30)]);
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: OLD_TIME, changedMs: OLD_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [], olderThanWindow: 1, files: 1 } });
  });

  it("원래 기록이 있어도 같은 세션의 구간 밖 다른 기록을 읽지 못했으면 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 4, [meta(ID(1), HISTORY), record("r4", 40)], { nameTime: "14-00-00" });
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T13-00-00-${ID(1)}_${ID(3)}.jsonl`);
    const list = { ...listed, files: [...listed.files, { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: OLD_TIME, changedMs: OLD_TIME, recordId: ID(3), baseId: ID(1), compressed: false }] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [], olderThanWindow: 1, files: 2 } });
  });

  it("같은 세션의 구간 밖 기록이 절반 넘게 깨졌으면 그 지문으로 빼되 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10), "{x", "{y", "{z", "{w"], { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u1" }), record("r1", 10), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [], olderThanWindow: 1 } });
  });

  it("같은 세션으로 이름이 붙은 구간 밖 기록은 읽어서 세션 ID가 맞을 때만 뺄 지문에 넣는다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)]);
    await reverted(1, 2, [meta(ID(7)), item({ type: "UserMessage", id: "u5" }), record("r5", 50)], { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u5" }), record("r5", 50)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 2, humanRequests: 2, tokens: { input: 60 } });
    expect(result).toMatchObject({ unverifiedInheritance: 0, mergedSessions: 1, read: { olderThanWindow: 1 } });
  });

  it("대화를 되돌려 생긴 기록만 있고 원래 기록을 찾지 못한 세션은 다 세고 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.unverifiedInheritance).toBe(1);
  });

  it("부모 세션의 원래 기록을 찾지 못했으면(되돌려 생긴 기록만 있음) 그 지문으로 빼되 하위 세션도 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await reverted(1, 9, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), ...MOM().slice(1)]);
    await rollout(2, CHILD());
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 2 });
  });

  it("뺄 지문을 넣어 다시 읽다가 읽지 못한 부모 기록은 읽지 못한 파일로 세고, 그 부모의 지문으로 뺀 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10)]);
    const parent = await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10), record("p1", 20)]);
    await rollout(3, [sub(ID(3), ID(2)), record("p1", 20), record("c1", 30)]);
    const finish = CodexSessionParser.prototype.finish;
    let done = false;
    // 부모 기록을 처음 다 읽은 뒤에 지워서, 뺄 지문을 넣어 다시 읽을 때만 실패하게 한다
    const spy = vi.spyOn(CodexSessionParser.prototype, "finish").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["finish"]>) {
      const summary = finish.apply(this, args);
      if (!done && summary.sessionId === ID(2)) {
        done = true;
        rmSync(parent);
      }
      return summary;
    });
    try {
      const result = await collectCodex(options({ cacheDir: null }));
      expect(result.read.unreadableFiles).toEqual([parent]);
      expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1), ID(3)]);
      expect(responses(bySession(result, ID(3)))).toBe(1);
      expect(result.unverifiedInheritance).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("뺄 지문을 넣어 다시 읽은 부모 기록이 그새 절반 넘게 깨졌으면 그 부모의 지문으로 뺀 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10)]);
    const parent = await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10), record("p1", 20)]);
    await rollout(3, [sub(ID(3), ID(2)), record("p1", 20), record("c1", 30)]);
    const finish = CodexSessionParser.prototype.finish;
    let done = false;
    // 부모 기록을 처음 다 읽은 뒤에 절반 넘게 깨진 내용으로 바꿔, 다시 읽은 것만 손상되게 한다
    const spy = vi.spyOn(CodexSessionParser.prototype, "finish").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["finish"]>) {
      const summary = finish.apply(this, args);
      if (!done && summary.sessionId === ID(2)) {
        done = true;
        writeFileSync(parent, `${[sub(ID(2), ID(1)), "{x", "{y", "{z"].join("\n")}\n`);
      }
      return summary;
    });
    try {
      const result = await collectCodex(options({ cacheDir: null }));
      expect(result.read.unreadableFiles).toEqual([parent]);
      expect(responses(bySession(result, ID(3)))).toBe(1);
      expect(result.unverifiedInheritance).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("부모 기록이 수집 구간보다 오래됐어도 지문을 얻으려고 읽고, 그 부모는 요약에 넣지 않는다", async () => {
    await rollout(1, MOM(), { mtimeMs: OLD_TIME });
    await rollout(2, CHILD());
    const result = await collectCodex(options());
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(2)]);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, read: { olderThanWindow: 1, files: 1 } });
  });

  it("구간 밖 부모 세션에 대화를 되돌려 생긴 기록이 있으면 그 기록도 지문을 얻으려고 읽는다. 이름으로 찾은 기록은 읽어서 세션 ID가 맞을 때만 쓴다", async () => {
    await rollout(1, MOM(), { mtimeMs: OLD_TIME });
    await reverted(1, 9, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u5" }), record("r5", 50)], { mtimeMs: OLD_TIME });
    await reverted(1, 8, [meta(ID(7)), item({ type: "UserMessage", id: "u2" })], { mtimeMs: OLD_TIME });
    await rollout(2, [...CHILD(), item({ type: "UserMessage", id: "u5" }), record("r5", 50)]);
    const result = await collectCodex(options());
    const child = bySession(result, ID(2));
    expect(Object.values(child.days)[0]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 20 } });
    expect(child.codex?.inheritedSkipped).toEqual({ items: 2, totals: 0, responses: 2 });
    expect(result).toMatchObject({ parentRecordMissing: 0, read: { olderThanWindow: 3, files: 1 } });
  });

  it("구간 밖 부모 기록이 절반 넘게 깨졌으면 그 지문으로 빼되 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [...MOM(), "{x", "{y", "{z", "{w"], { mtimeMs: OLD_TIME });
    await rollout(2, CHILD());
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1, read: { olderThanWindow: 1 } });
  });

  it("부모 세션의 다른 기록을 읽지 못했으면 부모 세션과 하위 세션을 모두 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, MOM());
    await rollout(2, CHILD());
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T13-30-00-${ID(1)}_${ID(9)}.jsonl`);
    const list = { ...listed, files: [...listed.files, { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(9), baseId: ID(1), compressed: false }] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 2 });
  });

  it("같은 세션의 기록 차례는 원래 기록이 먼저다. 파일 이름이 원래 기록보다 앞선 되돌려 생긴 기록도 원래 기록 뒤에 센다", async () => {
    await rollout(1, [meta(ID(1)), record("shared", 10)], { nameTime: "23-00-00" });
    await reverted(1, 3, [meta(ID(1), HISTORY), record("shared", 99)], { nameTime: "01-00-00" });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 1, tokens: { input: 10 } });
  });

  it("원래 기록 다음은 기록 파일 식별자가 아니라 파일 이름(만든 차례) 차례다", async () => {
    await rollout(1, [meta(ID(1))]);
    await reverted(1, 9, [meta(ID(1), HISTORY), record("shared", 10)], { nameTime: "13-00-00" });
    await reverted(1, 2, [meta(ID(1), HISTORY), record("shared", 99)], { nameTime: "14-00-00" });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 1, tokens: { input: 10 } });
  });

  it("같은 세션의 뒤 기록은 바로 앞 기록만이 아니라 앞선 기록 모두의 지문을 뺀다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), HISTORY), record("r2", 20)], { nameTime: "13-00-00" });
    await reverted(1, 4, [meta(ID(1), HISTORY), record("r1", 10), record("r3", 30)], { nameTime: "14-00-00" });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 3, tokens: { input: 60 } });
  });

  it("같은 세션의 기록 파일 여럿(대화를 되돌려 생긴 기록)은 하나로 합친다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r9", 5)]);
    const result = await collectCodex(options());
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toMatchObject({ sessionId: ID(1), codex: { recordId: ID(1) } });
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result).toMatchObject({ mergedSessions: 1, read: { files: 2 } });
  });
});

describe("캐시", () => {
  it("다시 모으면 바뀌지 않은 기록은 캐시에서 꺼내고 캐시 없이 모은 것과 같다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "Zeta", id: "z" }), item({ type: "Alpha", id: "a" }), record("r2", 20)]);
    const first = await collectCodex(options());
    const second = await collectCodex(options());
    const none = await collectCodex(options({ cacheDir: null }));
    expect(first.read.fromCache).toBe(0);
    expect(second.read.fromCache).toBe(2);
    expect(JSON.stringify(second.summaries)).toBe(JSON.stringify(first.summaries));
    expect(JSON.stringify(none.summaries)).toBe(JSON.stringify(first.summaries));
  });

  it("부모가 하위와 상관없는 줄을 덧붙이면 하위는 캐시에서 꺼내고, 하위의 지문과 겹치는 줄을 덧붙이면 하위를 다시 읽어 그만큼 빼고 센다", async () => {
    const mom = await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" })]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "UserMessage", id: "u2" }), record("r2", 20)]);
    await collectCodex(options());
    const touch = async () => utimes(mom, (FILE_TIME + 60_000) / 1000, (FILE_TIME + 60_000) / 1000);

    await appendFile(mom, `${item({ type: "UserMessage", id: "u7" })}\n`);
    await touch();
    const unrelated = await collectCodex(options());
    expect(unrelated.read.fromCache).toBe(1);
    expect(Object.values(bySession(unrelated, ID(2)).days)[0]).toMatchObject({ humanRequests: 1 });

    await appendFile(mom, `${item({ type: "UserMessage", id: "u2" })}\n`);
    await utimes(mom, (FILE_TIME + 120_000) / 1000, (FILE_TIME + 120_000) / 1000);
    const shared = await collectCodex(options());
    expect(shared.read.fromCache).toBe(0);
    const child = bySession(shared, ID(2));
    expect(Object.values(child.days)[0]).toMatchObject({ humanRequests: 0, responses: 1 });
    expect(child.codex?.inheritedSkipped.items).toBe(2);
    expect(JSON.stringify(shared.summaries)).toBe(JSON.stringify((await collectCodex(options({ cacheDir: null }))).summaries));
  });

  it("부모의 옛 누적값 겹침만 바뀌어도 하위 기록을 캐시에서 꺼내지 않고 다시 읽는다", async () => {
    const count = (n: number) => line("event_msg", { type: "token_count", info: { total_token_usage: usage(n) } });
    const parent = await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), count(100)]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), count(100), count(160), count(200)]);
    const first = await collectCodex(options());
    expect(Object.values(bySession(first, ID(2)).days)[0]!.tokens.input).toBe(100);
    expect((await collectCodex(options())).read.fromCache).toBe(2);
    await appendFile(parent, `${count(160)}\n`);
    await utimes(parent, (FILE_TIME + 60_000) / 1000, (FILE_TIME + 60_000) / 1000);
    const changed = await collectCodex(options());
    expect(Object.values(bySession(changed, ID(2)).days)[0]!.tokens.input).toBe(40);
    expect(responses(bySession(changed, ID(2)))).toBe(1);
    expect(changed.read.fromCache).toBe(0);
  });

  it("부모 기록이 없어지면 캐시의 하위 요약을 쓰지 않고 다시 다 센다", async () => {
    const mom = await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" })]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "UserMessage", id: "u2" })]);
    await collectCodex(options());
    await rm(mom);
    const result = await collectCodex(options());
    expect(Object.values(bySession(result, ID(2)).days)[0]).toMatchObject({ humanRequests: 2 });
    expect(result.parentRecordMissing).toBe(1);
  });

  it("--rescan은 크기와 수정 시각과 앞뒤 4KB가 같은 가운데가 바뀐 기록도 다시 읽는다(캐시가 알아보지 못하는 한계를 되돌리는 길이다)", async () => {
    const pad = line("padding", { text: "x".repeat(9000) });
    const path = await rollout(1, [meta(ID(1)), pad, record("r1", 10), pad]);
    await collectCodex(options());
    await writeFile(path, `${[meta(ID(1)), pad, record("r1", 20), pad].join("\n")}\n`);
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    expect(Object.values((await collectCodex(options())).summaries[0]!.days)[0]!.tokens.input).toBe(10);
    expect(Object.values((await collectCodex(options({ rescan: true }))).summaries[0]!.days)[0]!.tokens.input).toBe(20);
  });

  it("수정 시각과 변경 시각 가운데 늦은 것이 평가 시각에서 2초 안쪽이면 쓰는 중인 기록이다(줄바꿈 없는 끝을 끝 조각으로 세고 캐시에 넣지 않는다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { bytes: (raw) => Buffer.concat([raw, Buffer.from('{"timestamp":"2026-11-11T03:00:00Z","type":"event_msg"')]) });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1000 };
    };
    const first = await collectCodex(options({ statFile: fresh }));
    expect(first.summaries[0]!.missing).toMatchObject({ tailFragments: 1, brokenLines: 0 });
    expect(first.read.inProgress).toBe(1);
    // 1분 뒤에는 쓰는 중이 아니라 캐시를 꺼내 본다. 넣었다면 꺼낸다
    expect((await collectCodex(options({ statFile: fresh, clock: { nowMs: NOW + 60_000, timeZone: "Asia/Seoul" } }))).read.fromCache).toBe(0);
  });

  it("캐시에 넣은 기록이라도 변경 시각만 최근으로 바뀌면 캐시를 쓰지 않고 다시 읽는다(캐시 없는 읽기와 같다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { bytes: (raw) => Buffer.concat([raw, Buffer.from('{"type":"event_msg"')]) });
    const stored = await collectCodex(options());
    expect(stored.summaries[0]!.missing).toMatchObject({ brokenLines: 1, tailFragments: 0 });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1000 };
    };
    const cached = await collectCodex(options({ statFile: fresh }));
    const uncached = await collectCodex(options({ statFile: fresh, cacheDir: null }));
    expect(cached.summaries).toEqual(uncached.summaries);
    expect(cached.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
    expect(cached.read).toMatchObject({ inProgress: 1, fromCache: 0 });
  });

  it("캐시에 넣은 되돌려 생긴 기록과 보통 기록도 변경 시각이 1999밀리초 전으로 바뀌면 캐시를 쓰지 않고 다시 읽는다(캐시 없는 읽기와 같다)", async () => {
    const tail = '{"type":"event_msg"';
    const back = await reverted(5, 6, [meta(ID(5)), record("r5", 10)]);
    await appendFile(back, tail);
    await utimes(back, FILE_TIME / 1000, FILE_TIME / 1000);
    await rollout(7, [meta(ID(7)), record("r7", 10)], { bytes: (raw) => Buffer.concat([raw, Buffer.from(tail)]) });
    expect((await collectCodex(options())).read).toMatchObject({ fromCache: 0, inProgress: 0 });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1999 };
    };
    const cached = await collectCodex(options({ statFile: fresh }));
    const uncached = await collectCodex(options({ statFile: fresh, cacheDir: null }));
    expect(cached.summaries).toEqual(uncached.summaries);
    expect(cached.read).toMatchObject({ inProgress: 2, fromCache: 0 });
  });

  it("목록을 얻은 뒤 덧쓴 기록은 캐시를 꺼내지 않고 쓰는 중으로 세어 캐시를 켜고 끈 결과가 같다(쓰는 동안 수정 시각이 머물러도 크기로 안다)", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    expect((await collectCodex(options())).read.fromCache).toBe(0);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    await appendFile(path, `${record("r2", 20)}\n`);
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    const cached = await collectCodexFromList(home, list, options());
    const direct = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(responses(bySession(direct, ID(1)))).toBe(2);
    expect(cached.summaries).toEqual(direct.summaries);
    expect(cached.read).toMatchObject({ fromCache: 0, inProgress: 1 });
    expect(direct.read.inProgress).toBe(1);
  });

  for (const compressed of [false, true]) {
    it.skipIf(compressed && !zstdAvailable())(`목록을 얻은 뒤 크기는 그대로이고 수정 시각만 늦어지거나 앞당겨진 ${compressed ? "압축" : "보통"} 기록도 쓰는 중으로 센다(줄바꿈 없는 끝은 끝 조각이고 읽지 못한 파일이 아니다)`, async () => {
      const raw = Buffer.from('{"type":"session_meta"');
      const path = await rollout(1, [], { compressed, bytes: () => (compressed ? compress(raw) : raw) });
      await collectCodex(options());
      const home = join(root, ".codex");
      for (const shift of [60_000, -60_000]) {
        const list = await listCodexFiles(home, null, sameTimes);
        await utimes(path, (FILE_TIME + shift) / 1000, (FILE_TIME + shift) / 1000);
        const cached = await collectCodexFromList(home, list, options());
        const direct = await collectCodexFromList(home, list, options({ cacheDir: null }));
        expect(cached.read).toMatchObject({ fromCache: 0, inProgress: 1, unreadableFiles: [] });
        expect(cached.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
        expect(cached.summaries).toEqual(direct.summaries);
        expect(direct.read.inProgress).toBe(1);
        await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      }
    });
  }

  it("실제 모으기에서 목록을 만드는 사이에 덧쓴 기록도 새 응답을 놓치지 않는다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await collectCodex(options());
    let added = false;
    const racing: StatFile = async (file) => {
      const info = await sameTimes(file);
      if (file === path && !added) {
        added = true;
        await appendFile(path, `${record("r2", 20)}\n`);
      }
      return info;
    };
    const result = await collectCodex(options({ statFile: racing }));
    expect(added).toBe(true);
    expect(responses(bySession(result, ID(1)))).toBe(2);
    expect(result.read).toMatchObject({ fromCache: 0, inProgress: 1 });
  });

  it("쓰는 중인 기록은 캐시에 넣지 않는다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: NOW - 1000 });
    const first = await collectCodex(options());
    expect(first.read.inProgress).toBe(1);
    // 1분 뒤에는 쓰는 중이 아니라 캐시를 꺼내 본다. 넣었다면 꺼낸다
    expect((await collectCodex(options({ clock: { nowMs: NOW + 60_000, timeZone: "Asia/Seoul" } }))).read.fromCache).toBe(0);
  });

  it("목록의 차례와 상관없이 같은 결과다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await rollout(2, [sub(ID(2), ID(1)), record("r1", 10), record("r2", 20)]);
    await rollout(3, [meta(ID(1), { history_base: {} }), record("r9", 5)]);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    const forward = await collectCodexFromList(home, list, options({ cacheDir: null }));
    const backward = await collectCodexFromList(home, { ...list, files: [...list.files].reverse() }, options({ cacheDir: null }));
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/merge.test.ts test/collect/codex.test.ts`
Expected: FAIL. `test/adapters/codex/merge.test.ts`와 `test/collect/codex.test.ts`가 `src/adapters/codex/merge.ts`와 `src/collect/codex.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/merge.ts`(새 파일):

```ts
// 한 논리 세션의 기록 파일 여럿(대화를 되돌려 생긴 기록 등)의 요약을 하나로 합친다(순수 함수, 설계 9.2, 「5단계 계획 전 결정」 7번)
import { nameRecord, sortedRecord } from "../common/canonical.ts";
import type { LocalDate } from "../common/dates.ts";
import { maxVersion } from "../common/version.ts";
import { addDayInto, canonicalDay, emptyDay, type DayCell, type SessionSummary } from "../types.ts";

const recordIdOf = (summary: SessionSummary): string => summary.codex?.recordId ?? summary.sessionId;
const byRecordId = (a: SessionSummary, b: SessionSummary): number => (recordIdOf(a) < recordIdOf(b) ? -1 : recordIdOf(a) > recordIdOf(b) ? 1 : 0);

function addNumbers(into: Record<string, number>, from: Record<string, number>): void {
  for (const [key, value] of Object.entries(from)) into[key] = (Object.hasOwn(into, key) ? into[key]! : 0) + value;
}

/**
 * 정체(세션 ID, 주·하위, 부모, 작업 폴더, 지침, 처음 목록)와 기록 파일 식별자, 세션 ID를 대신 쓴 까닭은 식별자가 세션 ID와 같은 원래 기록에서, 없으면 식별자 차례로 첫 기록에서 가져온다
 * (작업 폴더와 지침은 그 기록에 없으면 식별자 차례로 처음 있는 것). 날짜 칸, 빠진 것, 알림의 수, 정체 모를 종류, 이어받아 뺀 수는 더하고,
 * 버전은 가장 높은 것, 가장 이른 날짜는 가장 이른 것이며, 기준을 찾지 못한 기록이 하나라도 있으면 그렇다고 남긴다. 넣은 요약은 바꾸지 않는다.
 * outside는 수집 구간 밖이라 지문을 얻으려고만 읽은 같은 세션의 기록이다. 정체와 기록 파일 식별자, 대신 쓴 까닭, 버전, 가장 이른 날짜에는 쓰고 수에는 넣지 않는다
 */
export function mergeRecords(records: readonly SessionSummary[], outside: readonly SessionSummary[] = []): SessionSummary {
  if (records.length === 1 && outside.length === 0) return records[0]!;
  const sorted = [...records].sort(byRecordId);
  const all = [...records, ...outside].sort(byRecordId);
  const base = all.find((summary) => recordIdOf(summary) === summary.sessionId) ?? all[0]!;
  const first = <T>(pick: (summary: SessionSummary) => T | null): T | null => pick(base) ?? all.map(pick).find((value) => value !== null) ?? null;

  const cells = new Map<LocalDate, DayCell>();
  const unconfirmedTypes = nameRecord<number>();
  const unknownHookKinds = nameRecord<number>();
  const unknownItemTypes = nameRecord<number>();
  const missing = { lines: 0, brokenLines: 0, tailFragments: 0, tooLongLines: 0 };
  const notes = { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: 0 };
  const inheritedSkipped = { items: 0, totals: 0, responses: 0 };
  let firstDate: LocalDate | null = null;
  for (const summary of sorted) {
    for (const [date, cell] of Object.entries(summary.days)) {
      let into = cells.get(date);
      if (into === undefined) {
        into = emptyDay();
        cells.set(date, into);
      }
      addDayInto(into, cell);
    }
    missing.lines += summary.missing.lines;
    missing.brokenLines += summary.missing.brokenLines;
    missing.tailFragments += summary.missing.tailFragments;
    missing.tooLongLines += summary.missing.tooLongLines;
    addNumbers(unconfirmedTypes, summary.missing.unconfirmedTypes);
    notes.syntheticResponses += summary.notes.syntheticResponses;
    notes.responsesWithoutId += summary.notes.responsesWithoutId;
    notes.undatedLines += summary.notes.undatedLines;
    addNumbers(unknownHookKinds, summary.notes.unknownHookKinds);
    if (summary.codex !== undefined) {
      addNumbers(unknownItemTypes, summary.codex.unknownItemTypes);
      inheritedSkipped.items += summary.codex.inheritedSkipped.items;
      inheritedSkipped.totals += summary.codex.inheritedSkipped.totals;
      inheritedSkipped.responses += summary.codex.inheritedSkipped.responses;
    }
  }
  for (const summary of all) {
    if (summary.firstDate !== null && (firstDate === null || summary.firstDate < firstDate)) firstDate = summary.firstDate;
  }
  const days: Record<LocalDate, DayCell> = {};
  for (const date of [...cells.keys()].sort()) days[date] = canonicalDay(cells.get(date)!);
  const instructionChars = first((summary) => summary.instructionChars);
  const codex = base.codex;
  return {
    tool: base.tool,
    sessionId: base.sessionId,
    kind: base.kind,
    parentSessionId: base.parentSessionId,
    cwd: first((summary) => summary.cwd),
    version: maxVersion(all.map((summary) => summary.version)),
    firstDate,
    days,
    instructionChars: instructionChars === null ? null : { ascii: instructionChars.ascii, other: instructionChars.other },
    initialSkills: base.initialSkills === null ? null : [...base.initialSkills],
    initialMcpServers: base.initialMcpServers === null ? null : [...base.initialMcpServers],
    missing: { ...missing, unconfirmedTypes: sortedRecord(unconfirmedTypes) },
    firstResponseIdHashes: [...base.firstResponseIdHashes],
    notes: { ...notes, unknownHookKinds: sortedRecord(unknownHookKinds) },
    ...(codex === undefined
      ? {}
      : {
          codex: {
            recordId: codex.recordId,
            unknownThreadSource: first((summary) => summary.codex?.unknownThreadSource ?? null),
            idFallback: codex.idFallback,
            unknownItemTypes: sortedRecord(unknownItemTypes),
            inheritedSkipped,
            baselineMissing: sorted.some((summary) => summary.codex?.baselineMissing === true),
          },
        }),
  };
}
```

`src/adapters/types.ts`(찾을 곳):

```ts

const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
```

`src/adapters/types.ts`(바꾼 뒤):

```ts

/** 날짜 칸 from의 수를 into에 더한다. 수는 더하고, 참거짓은 하나라도 참이면 참이며, 이름 목록은 합쳐 사전순으로 세운다. 안쪽 묶음은 새로 만들어 from과 나누지 않는다(같은 세션의 기록 파일을 합칠 때 쓴다) */
export function addDayInto(into: DayCell, from: DayCell): void {
  const target = into as unknown as Record<string, unknown>;
  const source = from as unknown as Record<string, unknown>;
  const addNumbers = (a: Record<string, number>, b: Record<string, number>): void => {
    for (const [key, value] of Object.entries(b)) a[key] = (Object.hasOwn(a, key) ? a[key]! : 0) + value;
  };
  for (const key of Object.keys(DAY_SHAPE) as (keyof DayCell)[]) {
    const a = target[key];
    const b = source[key];
    switch (DAY_SHAPE[key]) {
      case "number":
        target[key] = (a as number) + (b as number);
        break;
      case "boolean":
        target[key] = (a as boolean) || (b as boolean);
        break;
      case "names":
        target[key] = [...new Set([...(a as string[]), ...(b as string[])])].sort();
        break;
      case "numbers":
      case "tokens":
        addNumbers(a as Record<string, number>, b as Record<string, number>);
        break;
      case "tools":
      case "skills":
      case "hooks": {
        const outer = a as Record<string, Record<string, number>>;
        for (const [name, counts] of Object.entries(b as Record<string, Record<string, number>>)) {
          if (Object.hasOwn(outer, name)) addNumbers(outer[name]!, counts);
          else outer[name] = { ...counts };
        }
        break;
      }
    }
  }
}

const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
```

`src/collect/codex.ts`(새 파일):

```ts
// Codex 기록을 모아 논리 세션마다의 요약과 읽은 양을 낸다. 같은 기록 파일의 사본 가운데 정본 하나를 읽고(읽지 못하면 다음 사본), 압축 기록은 그 Node.js가 풀 수 있을 때만 읽는다. 하위 세션은 부모 기록의 지문으로, 같은 세션의 뒤 기록은 앞 기록의 지문으로 이어받은 앞부분을 빼고, 같은 세션의 기록 파일은 합친다. 바뀐 파일만 다시 읽고, 결과는 세션마다 가장 앞선 정본의 정규화한 경로 차례다(설계 8, 9.1~9.4, 9.8, 20.1, 「5단계 계획 전 결정」 2·3·7번)
import { join } from "node:path";
import { nameRecord, sortedRecord } from "../adapters/common/canonical.ts";
import { makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import { IN_PROGRESS_WINDOW_MS, readLines } from "../adapters/common/lines.ts";
import { mostlyBroken } from "../adapters/claude/observation.ts";
import { fromLists, sharedDigest, toLists, unionOf } from "../adapters/codex/fingerprints.ts";
import { codexHome, groupCopies, listCodexFiles, type CodexCopyGroup, type CodexFileList, type CodexLogFile, type StatFile } from "../adapters/codex/locate.ts";
import { mergeRecords } from "../adapters/codex/merge.ts";
import { CODEX_PARSER_VERSION, CodexSessionParser, type CodexFingerprints } from "../adapters/codex/parser.ts";
import { readZstdLines, zstdAvailable } from "../adapters/codex/zstd.ts";
import type { SessionSummary } from "../adapters/types.ts";
import { cacheKeyFor, loadCached, storeCached, type CacheKey } from "../state/cache.ts";
import { visibleFrom, type CollectOptions } from "./claude.ts";

export const CODEX_PARSER_ID = `codex@${CODEX_PARSER_VERSION}`;

export interface CodexCollectOptions extends CollectOptions {
  /** 시험용. 압축 기록을 풀 수 있는지. 주지 않으면 실행 중인 Node.js로 가린다(「5단계 계획 전 결정」 2번) */
  zstd?: boolean;
  /** 시험용. 파일의 크기와 시각을 읽는다. 주지 않으면 node:fs의 stat이다 */
  statFile?: StatFile;
}

/** 읽은 양(설계 9.8). 분모는 수집 구간에 걸리는 정본이다. 건너뛴 압축 파일은 읽지 못한 파일과 함께 분자에 넣고, 일부만 읽은 파일이 있으면 비율은 아래 경계다(「5단계 계획 전 결정」 2번) */
export interface CodexReadStats {
  /** 수집 구간에 걸리는 기록 파일(정본)의 수. 크기를 보지 못한 정본도 넣는다 */
  files: number;
  /** 기록 파일마다 읽은 사본의 바이트(읽지 못한 기록은 정본의 바이트. 크기를 모르면 넣지 않는다)를 더한 것 */
  listedBytes: number;
  bytes: number;
  fromCache: number;
  inProgress: number;
  /** 정본의 수정 시각이 수집 구간보다 앞서 열지 않은 기록 파일. 하위 세션의 부모이거나 같은 세션의 다른 기록이라서 지문만 읽은 것도 든다 */
  olderThanWindow: number;
  /** 크기를 보지 못했거나, 어느 사본도 열거나 읽지 못했거나, 절반 넘게 깨진 기록 파일. 읽은 사본이 있으면 그 사본의 경로이고 없으면 정본의 경로다. 경로 차례다 */
  unreadableFiles: string[];
  /** unreadableFiles 가운데 크기를 아는 것의 바이트. listedBytes와 같은 사본의 것이라 읽지 못한 비율이 1을 넘지 않는다 */
  unreadableFileBytes: number;
  /** 크기를 보지 못한 사본의 수. 다른 사본을 읽은 기록의 것도 센다(「5단계 계획 전 결정」 3번). 하나라도 있으면 읽지 못한 비율은 아래 경계다 */
  unknownSizeFiles: number;
  unreadableDirs: string[];
  /** 그 Node.js가 zstd를 풀지 못해 열지 않은 정본. 경로 차례다 */
  skippedFiles: string[];
  skippedFileBytes: number;
  /** 끊긴 압축이라 앞부분만 읽은 파일. 절반 넘게 깨졌으면 여기가 아니라 unreadableFiles에 든다. 경로 차례다 */
  partialFiles: string[];
  /** 정본이 아니라 읽지 않은 사본의 수(설계 9.2) */
  skippedCopies: number;
  /** 이름에서 기록 파일의 식별자를 읽지 못해 보지 않은 파일 */
  unnamedFiles: number;
}

export interface CodexCollectResult {
  tool: "codex";
  home: string;
  detected: boolean;
  summaries: SessionSummary[];
  read: CodexReadStats;
  visibleFrom: LocalDate | null;
  /** 부모 값은 있는데 부모 기록을 하나도 읽지 못해 이어받은 앞부분을 가리지 못한 하위 세션의 수(설계 9.2, 「5단계 계획 전 결정」 7번) */
  parentRecordMissing: number;
  /** 기록 파일이 둘 이상이라 합친 세션의 수. 수집 구간 밖이라 정체에만 쓴 같은 세션의 기록도 센다 */
  mergedSessions: number;
  /** 수정 시각을 보지 못한 사본이 있던 세션의 수. 그 기록을 읽지 못했으면 기록 파일 하나를 하나로 센다(「5단계 계획 전 결정」 3번) */
  unknownMtimeSessions: number;
  /**
   * 이어받은 앞부분을 확인하지 못한 세션의 수. 부모를 모르거나 부모 기록을 하나도 읽지 못했거나 일부를 읽지 못한(부모의 원래 기록을 찾지 못한 것도) 하위 세션,
   * 같은 세션의 다른 기록(수집 구간 밖의 것도)을 읽지 못했거나 일부만 읽은 세션, 원래 기록(식별자가 세션 ID와 같은 기록)을 찾지 못한 세션, 복사된 앞부분 안에서 기준을 찾지 못한 기록이 있는 세션이다. 이 세션들의 숫자는 대신 본 것이다(「5단계 계획 전 결정」 7번)
   */
  unverifiedInheritance: number;
  /** 세션 ID를 기록 파일의 식별자로 대신 쓴 기록의 까닭별 수(「5단계 계획 전 결정」 7번) */
  idFallbacks: Record<string, number>;
}

/** 관측(설계 9.8 표의 첫 줄)에 넘기는 읽지 못한 것의 수. 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더한다 */
export function codexUnreadableCount(read: CodexReadStats): number {
  return read.unreadableFiles.length + read.unreadableDirs.length + read.skippedFiles.length + read.partialFiles.length;
}

/** 기록 파일 하나를 읽은 것 */
interface RecordRead {
  canonical: CodexLogFile;
  /** 실제로 읽은 사본 */
  file: CodexLogFile;
  key: CacheKey | null;
  summary: SessionSummary;
  prints: CodexFingerprints;
  /** 이 요약을 낸 해석에서 뺀 지문 가운데 이 기록에도 있던 것의 지문 */
  digest: string;
  bytesRead: number;
  fromCache: boolean;
  /** 캐시에 넣어도 되는 읽기다(쓰는 중이 아니고, 연 동안 바뀌지 않았고, 끝까지 읽었다) */
  storable: boolean;
  inProgress: boolean;
  partial: boolean;
  /** 뺄 지문을 넣어 다시 읽다가 읽지 못했다 */
  failed: boolean;
}

type Failure = "unknown-size" | "skipped" | "failed";

interface Parsed {
  summary: SessionSummary;
  prints: CodexFingerprints;
  bytesRead: number;
  inProgress: boolean;
  partial: boolean;
  storable: boolean;
}

const byPath = (a: { normPath: string }, b: { normPath: string }): number => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0);
const baseName = (path: string): string => path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
/** 같은 세션의 기록 차례. 식별자가 세션 ID와 같은 원래 기록이 먼저이고, 그다음은 파일 이름(rollout-<시각>-…이라 만든 차례) 차례, 그다음은 경로 차례다 */
const siblingOrder = (a: RecordRead, b: RecordRead): number => {
  const original = (record: RecordRead): number => (record.canonical.recordId === record.summary.sessionId ? 0 : 1);
  if (original(a) !== original(b)) return original(a) - original(b);
  const an = baseName(a.canonical.path);
  const bn = baseName(b.canonical.path);
  return an < bn ? -1 : an > bn ? 1 : byPath(a.canonical, b.canonical);
};
/** 읽지 못한 기록이 어느 세션의 것일 수 있는지. 이름의 식별자와, 대화를 되돌려 생긴 기록이면 이름 앞의 원래 세션 ID다 */
const keysOf = (group: CodexCopyGroup): string[] => [...new Set([group.recordId, ...group.copies.flatMap((copy) => (copy.baseId === null ? [] : [copy.baseId]))])];

/** 수정 시각과 변경 시각 가운데 늦은 것이 평가 시각에서 2초 안쪽이면 쓰는 중이다(쓰는 동안 수정 시각이 머무는 Codex 기록이 있다) */
const recentlyChanged = (file: CodexLogFile, options: CodexCollectOptions): boolean => file.changedMs !== null && options.clock.nowMs - file.changedMs < IN_PROGRESS_WINDOW_MS;

/** 사본 하나를 해석한다. 열거나 읽지 못하거나, 압축 기록에서 아무것도 풀지 못하면 던진다 */
async function parseCopy(file: CodexLogFile, inherited: CodexFingerprints | null, options: CodexCollectOptions): Promise<Parsed> {
  const parser = new CodexSessionParser({ recordId: file.recordId, timeZone: options.clock.timeZone, inherited });
  const sink = { line: (text: string) => parser.line(text), tooLong: () => parser.tooLong() };
  if (!file.compressed) {
    const outcome = await readLines(file.path, options.clock.nowMs, sink);
    // 목록을 본 뒤 크기나 수정 시각이 바뀌었으면 이번 실행 중에 쓰인 것이라 쓰는 중이다(쓰는 동안 수정 시각이 머무는 기록은 크기로만 드러난다)
    const stable = outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs;
    const inProgress = outcome.inProgress || !stable || recentlyChanged(file, options);
    const summary = parser.finish(outcome.tail, inProgress);
    return { summary, prints: parser.fingerprints(), bytesRead: outcome.bytesRead, inProgress, partial: false, storable: !inProgress };
  }
  const outcome = await readZstdLines(file.path, options.clock.nowMs, sink);
  const incomplete = outcome.frames.status !== "complete" || outcome.decodeError !== null;
  if (incomplete && outcome.decodedBytes === 0) throw new Error(outcome.decodeError ?? outcome.frames.status);
  const stable = outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs;
  const inProgress = outcome.inProgress || !stable || recentlyChanged(file, options);
  const summary = parser.finish(outcome.tail, inProgress);
  return { summary, prints: parser.fingerprints(), bytesRead: outcome.bytesRead, inProgress, partial: incomplete, storable: !inProgress && !incomplete };
}

/** 기록 파일 하나를 정본부터 차례로 읽는다. 캐시가 맞으면 꺼내고, 아니면 뺄 지문 없이 해석한다. 어느 사본도 읽지 못하면 정본의 까닭을 돌려준다 */
async function readGroup(group: CodexCopyGroup, options: CodexCollectOptions, zstd: boolean, cacheDir: string | null): Promise<RecordRead | Failure> {
  const canonical = group.copies[0]!;
  let failure: Failure | null = null;
  for (const file of group.copies) {
    if (file.size === null || file.mtimeMs === null) {
      failure ??= "unknown-size";
      continue;
    }
    if (file.compressed && !zstd) {
      failure ??= "skipped";
      continue;
    }
    try {
      let key: CacheKey | null = null;
      if (cacheDir !== null) {
        key = await cacheKeyFor({ path: file.path, normPath: file.normPath, size: file.size, mtimeMs: file.mtimeMs }, CODEX_PARSER_ID, options.clock.timeZone);
        // 목록을 본 뒤 바뀌어 열쇠가 없거나, 수정 시각과 변경 시각 가운데 늦은 것이 최근이면 쓰는 중일 수 있어 캐시를 꺼내지 않고 다시 읽는다(캐시 열쇠는 그대로여도 끝 조각의 판정이 달라진다)
        if (key !== null && !options.rescan && !recentlyChanged(file, options)) {
          const hit = await loadCached(cacheDir, key);
          const prints = hit?.codex === undefined ? null : fromLists(hit.codex.fingerprints);
          if (hit !== null && hit.codex !== undefined && prints !== null) {
            return { canonical, file, key, summary: hit.summary, prints, digest: hit.codex.sharedDigest, bytesRead: hit.bytesRead, fromCache: true, storable: false, inProgress: false, partial: false, failed: false };
          }
        }
      }
      const parsed = await parseCopy(file, null, options);
      return { canonical, file, key, ...parsed, digest: sharedDigest(parsed.prints, null), fromCache: false, failed: false };
    } catch {
      failure ??= "failed";
    }
  }
  return failure ?? "failed";
}

export async function collectCodex(options: CodexCollectOptions): Promise<CodexCollectResult> {
  const home = codexHome(options.env, options.homedir);
  // 하위 세션의 부모가 수집 구간보다 오래됐을 수 있어 목록은 거르지 않고 받고, 구간은 정본마다 가른다
  return collectCodexFromList(home, await listCodexFiles(home, null, options.statFile), options);
}

/** 파일 목록을 받아 모은다. 목록의 차례와 상관없이 같은 결과를 낸다 */
export async function collectCodexFromList(home: string, list: CodexFileList, options: CodexCollectOptions): Promise<CodexCollectResult> {
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const lowerBound = options.rescan ? null : windows.collectStartLowerBoundMs;
  const cacheDir = options.cacheDir === null ? null : join(options.cacheDir, "codex");
  const zstd = options.zstd ?? zstdAvailable();
  const groups = groupCopies(list.files)
    .map((group) => ({ ...group, copies: [...group.copies] }))
    .sort((a, b) => byPath(a.copies[0]!, b.copies[0]!));
  const inWindow = groups.filter((group) => lowerBound === null || group.copies[0]!.changedMs === null || group.copies[0]!.changedMs >= lowerBound);
  // 구간 밖의 기록은 하위 세션의 부모이거나 구간 안 기록과 같은 세션일 때만 지문을 얻으려고 읽는다. 기록 파일 식별자와, 대화를 되돌려 생긴 기록이면 이름 앞의 원래 세션 ID로 찾는다
  const inside = new Set(inWindow);
  const outside = new Map<string, CodexCopyGroup[]>();
  for (const group of groups) {
    if (inside.has(group)) continue;
    for (const key of keysOf(group)) {
      const found = outside.get(key);
      if (found === undefined) outside.set(key, [group]);
      else found.push(group);
    }
  }

  const read: CodexReadStats = {
    files: inWindow.length,
    listedBytes: 0,
    bytes: 0,
    fromCache: 0,
    inProgress: 0,
    olderThanWindow: list.olderThanWindow + groups.length - inWindow.length,
    unreadableFiles: [],
    unreadableFileBytes: 0,
    unknownSizeFiles: 0,
    unreadableDirs: [...list.unreadableDirs].sort(),
    skippedFiles: [],
    skippedFileBytes: 0,
    partialFiles: [],
    skippedCopies: inWindow.reduce((sum, group) => sum + group.copies.length - 1, 0),
    unnamedFiles: list.unnamedFiles,
  };

  // 1. 정본마다 캐시에서 꺼내거나 뺄 지문 없이 읽는다. 자기 지문은 뺄 지문과 상관없이 정해진다
  const reads: RecordRead[] = [];
  const failedGroups: CodexCopyGroup[] = [];
  const readOf = new Map<CodexCopyGroup, RecordRead>();
  for (const group of inWindow) {
    const result = await readGroup(group, options, zstd, cacheDir);
    read.unknownSizeFiles += group.copies.filter((copy) => copy.size === null).length;
    if (typeof result !== "string") {
      reads.push(result);
      readOf.set(group, result);
      read.listedBytes += result.file.size ?? 0;
      continue;
    }
    failedGroups.push(group);
    const canonical = group.copies[0]!;
    read.listedBytes += canonical.size ?? 0;
    if (result === "skipped") {
      read.skippedFiles.push(canonical.path);
      read.skippedFileBytes += canonical.size ?? 0;
      continue;
    }
    read.unreadableFiles.push(canonical.path);
    read.unreadableFileBytes += canonical.size ?? 0;
  }
  const unknownMtime = new Set<string>();
  for (const group of inWindow) {
    if (!group.copies.some((copy) => copy.mtimeMs === null)) continue;
    const record = readOf.get(group);
    unknownMtime.add(record === undefined ? `record:${group.recordId}` : `session:${record.summary.sessionId}`);
  }

  // 2. 이어받은 앞부분을 뺀다(「5단계 계획 전 결정」 7번). 기록마다 뺄 지문은 하위 세션이면 부모 세션의 기록들과, 같은 세션에 기록이 여럿이면 그보다 앞선 기록들(수집 구간 밖의 것도)의 것이다.
  //    그 지문 가운데 자기 기록에도 있는 것이 해석 때와 다르면 그 지문을 넣어 다시 읽는다
  // 이어받은 것을 확인할 수 없게 하는 것: 읽지 못했거나 건너뛴 기록(어느 세션의 것인지는 이름으로만 안다), 일부만 읽었거나 절반 넘게 깨진 기록의 세션, 원래 기록을 찾지 못한 세션, 부모를 모르는 하위 세션
  const failedKeys = new Set(failedGroups.flatMap(keysOf));
  const damaged = new Set(reads.filter((record) => record.partial || mostlyBroken(record.summary)).map((record) => record.summary.sessionId));
  const extra = new Map<CodexCopyGroup, RecordRead | Failure>();
  const parentPrints = new Map<string, CodexFingerprints | null>();
  /** 부모 세션의 원래 기록(식별자가 세션 ID와 같은 기록)을 찾았는지 */
  const parentOriginal = new Map<string, boolean>();
  const printsOf = async (parentId: string): Promise<CodexFingerprints | null> => {
    if (parentPrints.has(parentId)) return parentPrints.get(parentId)!;
    const found = reads.filter((record) => record.summary.sessionId === parentId);
    for (const old of outside.get(parentId) ?? []) {
      if (!extra.has(old)) extra.set(old, await readGroup(old, options, zstd, cacheDir));
      const result = extra.get(old)!;
      // 이름으로 찾은 기록이라 읽어서 세션 ID가 맞을 때만 쓴다. 읽지 못했으면 부모 기록이 모자란 것이다
      if (typeof result === "string") failedKeys.add(parentId);
      else if (result.summary.sessionId === parentId) {
        found.push(result);
        if (result.partial || mostlyBroken(result.summary)) damaged.add(parentId);
      }
    }
    const prints = found.length === 0 ? null : unionOf(found.map((record) => record.prints));
    parentPrints.set(parentId, prints);
    parentOriginal.set(parentId, found.some((record) => record.canonical.recordId === parentId));
    return prints;
  };
  const siblings = new Map<string, RecordRead[]>();
  for (const record of reads) {
    const list = siblings.get(record.summary.sessionId);
    if (list === undefined) siblings.set(record.summary.sessionId, [record]);
    else list.push(record);
  }
  // 같은 세션의 기록이 수집 구간 밖에도 있으면 지문을 얻으려고 읽고 차례에 넣는다. 그 기록의 수는 요약에 넣지 않고 정체에만 쓴다(4). 이름으로 찾은 기록은 읽어서 세션 ID가 맞을 때만 쓴다
  const outsideOf = new Map<string, SessionSummary[]>();
  for (const [sessionId, list] of siblings) {
    for (const old of outside.get(sessionId) ?? []) {
      if (!extra.has(old)) extra.set(old, await readGroup(old, options, zstd, cacheDir));
      const result = extra.get(old)!;
      if (typeof result === "string") failedKeys.add(sessionId);
      else if (result.summary.sessionId === sessionId) {
        list.push(result);
        outsideOf.set(sessionId, [...(outsideOf.get(sessionId) ?? []), result.summary]);
        if (result.partial || mostlyBroken(result.summary)) damaged.add(sessionId);
      }
    }
  }
  for (const list of siblings.values()) list.sort(siblingOrder);
  const parentOf = (record: RecordRead): string | null =>
    record.summary.kind === "sub" && record.summary.parentSessionId !== null && record.summary.parentSessionId !== record.summary.sessionId ? record.summary.parentSessionId : null;
  // 뺄 지문은 처음 읽은 지문으로 모두 먼저 정한다. 다시 읽기의 차례나 그새 바뀐 파일에 따라 달라지지 않는다
  const plans: Array<{ record: RecordRead; inherited: CodexFingerprints | null }> = [];
  for (const record of reads) {
    const parentId = parentOf(record);
    const parent = parentId === null ? null : await printsOf(parentId);
    const list = siblings.get(record.summary.sessionId)!;
    const sources = [...(parent === null ? [] : [parent]), ...list.slice(0, list.indexOf(record)).map((sibling) => sibling.prints)];
    plans.push({ record, inherited: sources.length === 0 ? null : unionOf(sources) });
  }
  for (const { record, inherited } of plans) {
    const digest = sharedDigest(record.prints, inherited);
    if (digest === record.digest) continue;
    try {
      const parsed = await parseCopy(record.file, inherited, options);
      Object.assign(record, parsed, { digest, fromCache: false });
    } catch {
      record.failed = true;
    }
  }
  // 다시 읽다가 읽지 못했거나 다시 읽은 것이 일부만 읽혔으면 그 세션의 기록도 모자란 것이다. 이어받은 것의 확인은 다시 읽기가 모두 끝난 뒤에 한다
  for (const record of reads) {
    if (record.failed) failedKeys.add(record.summary.sessionId);
    else if (record.partial || mostlyBroken(record.summary)) damaged.add(record.summary.sessionId);
  }
  const orphans = new Set<string>();
  const unverified = new Set<string>();
  for (const record of reads) {
    if (record.failed) continue;
    const { sessionId } = record.summary;
    const parentId = parentOf(record);
    const parent = parentId === null ? null : await printsOf(parentId);
    if (parentId !== null && parent === null) orphans.add(sessionId);
    // 하위 세션인데 부모를 모르면(부모 값이 없거나 자기 자신) 뺄 부모 지문을 찾을 수 없다
    if (record.summary.kind === "sub" && parentId === null) unverified.add(sessionId);
    if (parentId !== null && (parent === null || parentOriginal.get(parentId) !== true || failedKeys.has(parentId) || damaged.has(parentId))) unverified.add(sessionId);
    const list = siblings.get(sessionId)!;
    // 원래 기록(식별자가 세션 ID와 같은 기록)을 찾지 못했으면 대화를 되돌려 생긴 기록이 무엇을 이어받았는지 확인할 수 없다
    if (failedKeys.has(sessionId) || (list.length > 1 && damaged.has(sessionId)) || !list.some((sibling) => sibling.canonical.recordId === sessionId)) unverified.add(sessionId);
    if (record.summary.codex?.baselineMissing === true) unverified.add(sessionId);
  }

  // 3. 읽은 양을 세고 캐시에 넣는다
  const kept: RecordRead[] = [];
  const idFallbacks = nameRecord<number>();
  // 읽지 못한 기록은 읽은 사본(목록의 바이트에 넣은 것)의 경로와 바이트로 센다
  const unreadable = (record: RecordRead): void => {
    read.unreadableFiles.push(record.file.path);
    read.unreadableFileBytes += record.file.size ?? 0;
  };
  for (const record of reads) {
    if (record.failed) {
      unreadable(record);
      continue;
    }
    kept.push(record);
    const fallback = record.summary.codex?.idFallback ?? null;
    if (fallback !== null) idFallbacks[fallback] = (Object.hasOwn(idFallbacks, fallback) ? idFallbacks[fallback]! : 0) + 1;
    read.bytes += record.bytesRead;
    if (record.fromCache) read.fromCache++;
    if (record.inProgress) read.inProgress++;
    if (mostlyBroken(record.summary)) unreadable(record);
    else if (record.partial) read.partialFiles.push(record.file.path);
  }
  if (cacheDir !== null) {
    for (const record of [...kept, ...[...extra.values()].filter((result): result is RecordRead => typeof result !== "string")]) {
      if (record.fromCache || !record.storable || record.key === null) continue;
      try {
        await storeCached(cacheDir, { key: record.key, summary: record.summary, bytesRead: record.bytesRead, codex: { fingerprints: toLists(record.prints), sharedDigest: record.digest } });
      } catch {
        // 캐시를 쓰지 못해도 점검은 이어 간다. 다음 점검이 다시 읽는다
      }
    }
  }

  // 4. 같은 세션의 기록 파일을 합친다. 세션마다 가장 앞선 정본의 경로 차례로 낸다
  const sessions = new Map<string, RecordRead[]>();
  for (const record of kept) {
    const list = sessions.get(record.summary.sessionId);
    if (list === undefined) sessions.set(record.summary.sessionId, [record]);
    else list.push(record);
  }
  const ordered = [...sessions.values()].sort((a, b) => byPath(a[0]!.canonical, b[0]!.canonical));
  const outsideFor = (records: RecordRead[]): SessionSummary[] => outsideOf.get(records[0]!.summary.sessionId) ?? [];
  const summaries = ordered.map((records) => mergeRecords(records.map((record) => record.summary), outsideFor(records)));
  read.unreadableFiles.sort();
  read.skippedFiles.sort();
  read.partialFiles.sort();
  return {
    tool: "codex",
    home,
    detected: list.sessionsFound,
    summaries,
    read,
    visibleFrom: visibleFrom(summaries, read.olderThanWindow, windows.collectDates[0]!),
    parentRecordMissing: orphans.size,
    mergedSessions: ordered.filter((records) => records.length + outsideFor(records).length > 1).length,
    unknownMtimeSessions: unknownMtime.size,
    unverifiedInheritance: unverified.size,
    idFallbacks: sortedRecord(idFallbacks),
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex test/collect`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 10개, 시험 197개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/merge.test.ts test/collect/codex.test.ts src/adapters/codex/merge.ts src/adapters/types.ts src/collect/codex.ts
git commit -m "feat: Codex 기록을 세션마다 모으고 읽은 양을 셈"
```

---

### Task 9: aq doctor의 Codex 몫

**Files:**
- Modify: `test/commands/doctor.test.ts`
- Modify: `skills/aq/scripts/aq.mjs`
- Modify: `src/commands/doctor.ts`

**Interfaces:**
- Consumes: 과제 1의 `codexHome`, `listCodexFiles`, `groupCopies`.
- Produces: `DoctorReport.codex`(`home`, `sessionsFound`, `recordFiles`, `compressedOnly`, `unreadable`)(`src/commands/doctor.ts`).

설계 7.4, 9.1, 9.2, 「5단계 계획 전 결정」 2번이다.

- `aq doctor`의 보고에 Codex 기록 폴더를 더한다. 기록 폴더의 경로, `sessions` 폴더가 있는지, 기록 파일의 수(같은 식별자의 사본을 하나로 센다), 압축본만 있는 기록의 수(zstd를 풀 수 있어야 읽는다. 풀 수 있는지는 이미 있는 `zstd` 칸이다), 읽지 못한 것의 수(목록을 읽지 못한 폴더와 크기를 보지 못한 파일)다. 열쇠의 차례는 `node`, `zstd`, `claudeCode`, `codex`, `state`다.
- 기록 파일의 안은 열지 않는다(목록만 본다).
- 묶은 실행 파일은 과제 2부터 원본과 어긋났다(줄 나누기, 도구 이름 표, 요약 되살리기, 관측, doctor가 묶음에 든다). 이 과제의 마지막 단계에서 원본으로 다시 만들어 함께 커밋한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/doctor.test.ts`(찾을 곳 1/5):

```ts
// aq doctor의 보고(기록 폴더, 세션 파일 수, 상태 폴더에 쓸 수 있는지, 압축 풀기 기능)를 시험한다(설계 6.3, 7.4)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
```

`test/commands/doctor.test.ts`(바꾼 뒤 1/5):

```ts
// aq doctor의 보고(Claude Code와 Codex의 기록 폴더, 세션 파일 수, 상태 폴더에 쓸 수 있는지, 압축 풀기 기능)를 시험한다(설계 6.3, 7.4, 9.1, 9.2)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
```

`test/commands/doctor.test.ts`(찾을 곳 2/5):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli.ts";
```

`test/commands/doctor.test.ts`(바꾼 뒤 2/5):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 파일 하나의 stat만 실패하게 하려고 stat을 감싼다. 평소에는 실제 stat을 그대로 부른다
const failPaths = vi.hoisted(() => new Set<string>());
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: async (...args: Parameters<typeof actual.stat>) => {
      if (failPaths.has(String(args[0]))) throw new Error("stat 실패");
      return actual.stat(...args);
    },
  };
});
import { main } from "../../src/cli.ts";
```

`test/commands/doctor.test.ts`(찾을 곳 3/5):

```ts
  vi.restoreAllMocks();
});
```

`test/commands/doctor.test.ts`(바꾼 뒤 3/5):

```ts
  vi.restoreAllMocks();
  failPaths.clear();
});
```

`test/commands/doctor.test.ts`(찾을 곳 4/5):

```ts
  });
  it("aq doctor는 JSON을 내고 0을 돌려준다", async () => {
```

`test/commands/doctor.test.ts`(바꾼 뒤 4/5):

```ts
  });
  it("Codex 기록 폴더, 같은 식별자의 사본을 하나로 센 기록 파일 수, 압축본만 있는 기록의 수, 읽지 못한 것의 수를 낸다", async () => {
    const day = join(root, ".codex", "sessions", "2026", "11", "10");
    await mkdir(day, { recursive: true });
    const name = (n: number) => `rollout-2026-11-10T01-00-00-019a0000-0000-7000-8000-${String(n).padStart(12, "0")}.jsonl`;
    await writeFile(join(day, name(1)), "{}\n");
    await writeFile(join(day, `${name(1)}.zst`), "x");
    await writeFile(join(day, `${name(2)}.zst`), "x");
    await writeFile(join(day, "rollout-이름없음.jsonl"), "{}\n");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(report.codex).toEqual({ home: join(root, ".codex"), sessionsFound: true, recordFiles: 2, compressedOnly: 1, unreadable: 0 });
  });
  it("Codex 기록 폴더는 CODEX_HOME을 따르고, 없으면 찾지 못한 것이며, 날짜 폴더 자리에 파일이 있으면 읽지 못한 것으로 센다", async () => {
    const elsewhere = join(root, "codex 다른 곳");
    const missing = await doctor({ env: { CODEX_HOME: elsewhere }, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(missing.codex).toEqual({ home: elsewhere, sessionsFound: false, recordFiles: 0, compressedOnly: 0, unreadable: 0 });
    await mkdir(join(elsewhere, "sessions"), { recursive: true });
    await writeFile(join(elsewhere, "sessions", "2026"), "x");
    const blocked = await doctor({ env: { CODEX_HOME: elsewhere }, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(blocked.codex).toMatchObject({ sessionsFound: true, recordFiles: 0, unreadable: 1 });
  });
  it("Codex 기록 파일의 크기와 수정 시각을 보지 못하면 읽지 못한 것으로 센다", async () => {
    const day = join(root, ".codex", "sessions", "2026", "11", "10");
    await mkdir(day, { recursive: true });
    const path = join(day, "rollout-2026-11-10T01-00-00-019a0000-0000-7000-8000-000000000001.jsonl");
    await writeFile(path, "{}\n");
    failPaths.add(path);
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(report.codex).toMatchObject({ recordFiles: 1, unreadable: 1 });
  });
  it("aq doctor는 JSON을 내고 0을 돌려준다", async () => {
```

`test/commands/doctor.test.ts`(찾을 곳 5/5):

```ts
    expect(printed.claudeCode.projectsFound).toBe(false);
  });
```

`test/commands/doctor.test.ts`(바꾼 뒤 5/5):

```ts
    expect(printed.claudeCode.projectsFound).toBe(false);
    expect(printed.codex.sessionsFound).toBe(false);
    expect(Object.keys(printed)).toEqual(["node", "zstd", "claudeCode", "codex", "state"]);
  });
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/doctor.test.ts`
Expected: FAIL. 시험 4개가 실패한다(새 시험 셋과, 보고의 열쇠 차례를 보는 고친 시험 하나). 과제 8까지의 doctor 보고에는 `codex` 칸이 없다. 나머지 셋은 통과한다.

- [ ] **Step 3: 구현한다**

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

`src/commands/doctor.ts`(찾을 곳 1/5):

```ts
// aq doctor. Node.js 버전, 압축 기록을 풀 수 있는지, Claude Code 기록 폴더, 상태 폴더에 쓸 수 있는지를 JSON으로 알린다(설계 6.3, 7.4)
import { mkdir, rm, writeFile } from "node:fs/promises";
```

`src/commands/doctor.ts`(바꾼 뒤 1/5):

```ts
// aq doctor. Node.js 버전, 압축 기록을 풀 수 있는지, Claude Code와 Codex의 기록 폴더, 상태 폴더에 쓸 수 있는지를 JSON으로 알린다(설계 6.3, 7.4, 9.1, 9.2)
import { mkdir, rm, writeFile } from "node:fs/promises";
```

`src/commands/doctor.ts`(찾을 곳 2/5):

```ts
import { claudeHome, listClaudeFiles } from "../adapters/claude/locate.ts";

```

`src/commands/doctor.ts`(바꾼 뒤 2/5):

```ts
import { claudeHome, listClaudeFiles } from "../adapters/claude/locate.ts";
import { codexHome, groupCopies, listCodexFiles } from "../adapters/codex/locate.ts";

```

`src/commands/doctor.ts`(찾을 곳 3/5):

```ts
  claudeCode: { home: string; projectsFound: boolean; sessionFiles: number; unreadable: number };
  state: { dir: string; writable: boolean };
```

`src/commands/doctor.ts`(바꾼 뒤 3/5):

```ts
  claudeCode: { home: string; projectsFound: boolean; sessionFiles: number; unreadable: number };
  /** 기록 파일은 같은 식별자의 사본을 하나로 센다. 압축본만 있는 기록은 zstd를 풀 수 있어야 읽는다. 읽지 못한 것은 목록을 읽지 못한 폴더와 크기를 보지 못한 파일이다(설계 9.1, 9.2, 「5단계 계획 전 결정」 2번) */
  codex: { home: string; sessionsFound: boolean; recordFiles: number; compressedOnly: number; unreadable: number };
  state: { dir: string; writable: boolean };
```

`src/commands/doctor.ts`(찾을 곳 4/5):

```ts
  const list = await listClaudeFiles(home, null);
  return {
```

`src/commands/doctor.ts`(바꾼 뒤 4/5):

```ts
  const list = await listClaudeFiles(home, null);
  const codex = codexHome(input.env, input.homedir);
  const records = await listCodexFiles(codex, null);
  const groups = groupCopies(records.files);
  return {
```

`src/commands/doctor.ts`(찾을 곳 5/5):

```ts
    claudeCode: { home, projectsFound: list.projectsFound, sessionFiles: list.files.length, unreadable: list.unreadableDirs.length + list.unreadableFiles.length },
    state: { dir: input.stateDir, writable: await canWrite(input.stateDir) },
```

`src/commands/doctor.ts`(바꾼 뒤 5/5):

```ts
    claudeCode: { home, projectsFound: list.projectsFound, sessionFiles: list.files.length, unreadable: list.unreadableDirs.length + list.unreadableFiles.length },
    codex: {
      home: codex,
      sessionsFound: records.sessionsFound,
      recordFiles: groups.length,
      compressedOnly: groups.filter((group) => group.copies.every((copy) => copy.compressed)).length,
      unreadable: records.unreadableDirs.length + records.files.filter((file) => file.size === null).length,
    },
    state: { dir: input.stateDir, writable: await canWrite(input.stateDir) },
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/commands/doctor.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 7개.

- [ ] **Step 5: 묶은 실행 파일을 다시 만든다**

과제 2부터 바뀐 원본을 묶은 실행 파일에 담는다. 원본에서 다시 만들고 손으로 고치지 않는다.

Run: `npm run build`
Expected: `묶음 완료: skills/aq/scripts/aq.mjs`.

- [ ] **Step 6: 커밋한다**

```bash
git add test/commands/doctor.test.ts skills/aq/scripts/aq.mjs src/commands/doctor.ts
git commit -m "feat: 진단 명령에 Codex 기록 폴더 정보를 더함"
```

---

### Task 10: 전체 검사, 실제 기록으로 돌려 보기, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~9의 결과물 전부.
- Produces: `develop`에 병합된 5단계 1부. 2부(Codex 셋팅 읽기)와 3부(평가 입력·규칙·결과에 Codex)가 기대는 것은 `collectCodex`, `CodexReadStats`, `codexUnreadableCount`, `CODEX_COVERAGE`, `codexMcpObservation`, `CODEX_SHELL_TOOLS`, `codexHome`이다.

- [ ] **Step 1: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 파일 97개·시험 1,474개 통과(4단계까지의 88개·1,290개에 이 계획이 더한 것), `묶음 검사 통과` 다음 마지막 줄이 `버전 검사 통과`. Windows 밖에서는 2단계 1부의 시험 1개를 건너뛴다. 그 Node.js에 zstd가 없으면 압축 기록을 만드는 시험 묶음 둘을 건너뛴다.

- [ ] **Step 2: 묶음을 다시 만들어도 그대로인지 확인한다**

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 3: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS(받은 22가 22.15.0보다 낮으면 압축 기록 시험 묶음 둘을 건너뛴 수만큼 적다). 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 4: 이 PC의 Codex 기록으로 실제로 돌려 본다**

Codex와 Claude Code의 기록 폴더는 읽기만 한다. 측정 도구는 저장소 밖에 두고, `collectCodex`(와 1단계의 `collectClaude`)를 불러 돌리는 작은 스크립트를 esbuild로 묶어 돌린다. 캐시는 OS 임시 폴더의 빈 폴더에 두고 끝나면 지운다. 이 PC의 숫자, 경로, 세션 ID는 저장소 밖 작업 기록에만 둔다.

| 확인 | Expected |
|---|---|
| 수집 구간을 캐시 없이, 같은 캐시로 두 번, 모든 기록을 `--rescan`으로 | 네 번 모두 오류 없이 끝나고 음수 칸이 없다. 큰 압축 기록도 한꺼번에 풀어 두지 않고 끝까지 흘려 읽는다. 최대 메모리가 Node.js 기본 한도 안이다 |
| 캐시가 있을 때와 없을 때 | 세션마다의 요약이 모두 같다. 둘째 실행은 모두 캐시에서 꺼낸다. 측정 중에 쓰이고 있던 기록이 있으면 그 세션만 다를 수 있고, 그 수를 센다 |
| 하위 세션과 이어받은 앞부분 | 하위 세션마다 부모 기록을 찾고(부모 기록이 없는 하위 세션의 수를 센다), 이어받아 뺀 항목과 누적값이 있다. 이어받은 것을 확인하지 못한 세션, 기준을 찾지 못한 기록, 세션 ID를 대신 쓴 기록(까닭별), 수정 시각을 모르는 사본의 세션을 센다 |
| 대화를 되돌려 생긴 기록 | 이름 없는 파일이 0이고, 되돌려 생긴 기록이 원래 세션과 합쳐진다 |
| 원본에서 따로 센 값 | 압축하지 않은 기록만 있는 세션 가운데 새 형식(첫 토큰 줄이 `token_usage_record`)인 것은 응답 수(`response_id` 종류), 주 세션의 사람 요청(`UserMessage`), 셸 실행(CommandExecution)이, 하위 세션은 부모 기록에도 있는 ID를 뺀 수가 모으기의 결과와 모두 같다. 순수 옛 형식(`token_usage_record`가 없는) 주 세션은 응답 수(누적값이 직전과 다른 줄)와 입력 토큰 합이 같다. 원본은 줄바꿈(`\n`)에서만 잘라 읽는다. Node.js의 `readline`은 U+2028과 U+2029에서도 줄을 잘라 그런 글자가 든 줄을 깨진 줄로 만든다(「5단계 1부 계획에서 보완」의 10번) |
| Claude Code 기록의 캐시(1단계) | 1단계 모으기를 캐시 없이 한 번, 같은 임시 캐시로 두 번 돌리면 세션마다의 요약이 같고, 둘째 실행은 쓰는 중으로 본 파일(수정 시각이 평가 시각에서 2초 안쪽이거나 측정 중에 바뀐 것) 말고는 모두 캐시에서 꺼낸다(과제 7이 공통 캐시 열쇠를 고쳤다). 측정 앞뒤로 크기나 수정 시각이 달라진 파일의 세션은 견주지 않고 그 수를 센다 |
| `aq doctor` | 홈을 빈 임시 폴더로 주고(`USERPROFILE`과 `HOME`) `CODEX_HOME`만 실제 Codex 기록 폴더로 주어 묶은 실행 파일로 돌리면, 열쇠가 `node`, `zstd`, `claudeCode`, `codex`, `state` 차례이고 `codex.sessionsFound`가 참, 기록 파일이 있으며 읽지 못한 것이 0이다. 상태 폴더는 임시 홈 아래다. 끝나면 임시 홈을 지운다 |

작성자 PC에서 계획 전과 계획 리뷰 1차~5차 뒤에 돌린 결과는 위와 같았다(1단계 Claude Code 기록의 캐시는 리뷰 5차 뒤에 처음 쟀다). 이어받은 것을 확인하지 못한 세션은 모두 기준을 찾지 못한 기록이 있는 세션이었고(부모를 가진 하위 기록 가운데 스무 개에 하나꼴), 부모 기록이 모자란 하위 세션, 같은 세션의 다른 기록을 읽지 못한 세션, 세션 ID를 대신 쓴 기록, 수정 시각을 모르는 사본은 없었다. 수집 구간에 16MB를 넘는 도구 결과 줄이 있어 Codex MCP 관측이 「너무 긴 줄」로 빠짐없지 않았다. 이것은 1부의 결함이 아니라 설계 9.8 그대로이고, 3부의 일로 넘긴다(「5단계 1부 계획에서 보완」의 10번).

- [ ] **Step 5: 원장을 고치고 커밋한다**

원장의 5단계 1부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 8에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 1부 구현 결과를 적음"
```

- [ ] **Step 6: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage5-1.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~9의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 이 PC 기록으로 돌린 것의 확인 항목과 맞았는지), 「확인하지 못한 것」이다. 확인하지 못한 것에는 아래를 적는다. 평가 입력·점수·결과 화면에 Codex가 들어가는 것(3부), Codex 셋팅(2부), macOS와 Linux의 Codex 기록 폴더, Node.js 22.15.0보다 낮은 Node.js에서 건너뛴 압축 파일이 실제로 분자에 드는 것(이 PC에 그 버전이 없으면), 작성자 PC에 없던 Codex 버전과 형식, 호출 층에만 남고 McpToolCall이 남지 않는 Codex MCP 호출이 있는지(그래서 `response_item`을 사용 신호가 될 수 있는 종류로 둔다). 이 PC의 숫자, 경로, 이름은 넣지 않는다.

```bash
git push -u origin 5단계-1부-Codex-기록-읽기
gh pr create --base develop --head 5단계-1부-Codex-기록-읽기 --title "feat: 5단계 1부 Codex 기록 읽기" --body-file "$TEMP/aq-pr-stage5-1.md"
```

- [ ] **Step 7: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(5단계 1부 구현 전용, 정독과 실행이 다 무거우므로 둘) 다음을 나눠 맡긴다. 한 짝은 정독이다. 설계 9.1~9.4, 9.6~9.8, 20.1, 「5단계 계획 전 결정」과 「5단계 1부 계획에서 보완」을 이 계획의 코드와 대조하고, 시험이 놓치는 그럴듯한 틀린 구현(첫 물리적 줄과 세션 ID를 대신 쓴 까닭, 버전, 넘어가는 자리의 견줌, 누적값이 줄 때, 턴의 층 고르기와 날짜를 넘는 턴, 문맥의 창, 이어받은 것의 기준 옮기기와 기준을 찾지 못한 기록, 같은 세션의 앞 기록 빼기(구간 밖의 것과 기록 차례), 이어받은 것을 확인하지 못한 세션(부모를 모름, 원래 기록을 찾지 못함), 다음 사본과 읽지 못한 바이트, 크기와 수정 시각을 모르는 사본, 압축의 판정, 캐시의 겹침 지문, 합치기의 정체)을 반례로 찾는다. 다른 짝은 실행이다. `npm run check`와 Node.js 22를 다시 돌리고, 임시 폴더에 만든 합성 기록과 이 PC의 Codex 기록(읽기만)으로 Step 4를 자기 방법으로 재현한다. 두 짝에게 서로의 결론을 미리 알려 주지 않는다. 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 5단계-1부-Codex-기록-읽기 --body-file "$TEMP/aq-pr-stage5-1.md"`).

- [ ] **Step 8: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 5단계-1부-Codex-기록-읽기 --merge --subject "feat: 5단계 1부 Codex 기록 읽기를 개발 브랜치에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 1부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 2부, 3부와 그 뒤에 넘기는 것

5단계 1부가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 부 | 1부가 남긴 재료 |
|---|---|---|
| Codex 셋팅 읽기(스캐너의 Codex 몫, 결정 4~6의 재료) | 2부 | `codexHome` |
| 평가 입력에 Codex 도구를 넣기. 요약, 덮는 범위, 셸 도구, 관측(스킬은 Codex가 기록하지 않아 늘 빠짐없지 않다. MCP는 `codexMcpObservation`). 결과의 읽은 양에 건너뛴 압축 파일(분자)과 일부만 읽은 파일(아래 경계)을 잇기 | 3부 | `collectCodex`, `CodexReadStats`, `codexUnreadableCount`, `CODEX_COVERAGE`, `codexMcpObservation`, `CODEX_SHELL_TOOLS` |
| Codex 스킬 관측의 알림 문장(지금의 「기록을 빠짐없이 읽지 못해(…)」은 맞지 않는다) | 3부 | 「5단계 1부 계획에서 보완」의 9번 |
| Codex 알림. 정체 모를 `thread_source`(값별), 정체 모를 실행 층 종류(종류별), 부모 기록이 없는 하위 세션, 이어받은 것을 확인하지 못한 세션, 세션 ID를 대신 쓴 기록(까닭별), 수정 시각을 모르는 사본의 세션, 크기를 모르는 사본, 합친 세션, 읽지 않은 사본, 이름 없는 파일, 건너뛴 압축 파일(22.15.0과 23.8.0 안내), 일부만 읽은 파일, 확인하지 않은 Codex 버전 | 3부 | `parentRecordMissing`, `unverifiedInheritance`, `idFallbacks`, `unknownMtimeSessions`, `unknownSizeFiles`, `mergedSessions`, `skippedCopies`, `unnamedFiles`, `codex.unknownThreadSource`, `codex.unknownItemTypes`, `VERIFIED_VERSIONS.codex` |
| 이어받은 것을 확인하지 못한 세션이 있을 때 그 숫자를 대신 봄으로 보이는 것(결정 7). 1부는 숫자를 그대로 두고 세션 수와 기록마다의 기준을 찾지 못함을 남긴다 | 3부 | `unverifiedInheritance`, `codex.baselineMissing` |
| 너무 긴 줄의 앞부분에서 맨 바깥 종류를 읽어 상관없는 줄을 가르는 것. 작성자 PC에서 Codex 도구 결과 줄이 16MB를 넘은 적이 있어 그 기록이 수집 구간에 있는 동안 Codex MCP 관측이 막혔다. 줄 나누기와 1단계의 관측에도 걸리는 일이다 | 3부 | 「5단계 1부 계획에서 보완」의 10번 |
| 정체 모를 실행 층 종류(`SubAgentActivity`, `CollabAgentToolCall`, `Plan`)와 호출 층의 `tool_search_call`을 도구로 볼지. 도구로 넣으면 해석기를 고치고 `CODEX_PARSER_VERSION`을 올려 캐시를 버리고 원본을 다시 읽는 것까지 그 일이다(캐시 열쇠에 해석 버전이 든다). Codex 규칙의 셈(E1의 토큰 식, I3의 굵기, 옛 형식의 셸이 이름 모름으로 드는 것) | 3부 | 「5단계 1부 계획에서 보완」의 2·4번 |
| 결과 화면의 Codex 색 확정 | 3부 | `TOOL_COLORS.codex`(임시) |
| Codex 매니페스트 둘, 버전 검사, 산출물, Codex에서 스킬이 도는지 | 4부 | 없음 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 9.1 | `CODEX_HOME` 또는 `~/.codex`, `sessions/<연>/<월>/<일>/`의 `rollout-*.jsonl`과 `.jsonl.zst` | 1 |
| 9.2 | 기록 파일의 식별자와 세션 ID를 나눔, 정본 하나(압축하지 않은 것, 늦은 수정 시각, 경로), 읽지 못하면 다음 사본, 건너뛴 사본의 수, 주·하위·정체 모름, 부모 기록이 없는 세션 | 1, 3, 8 |
| 9.3 | 날짜별 요약, 가장 이른 날짜, 날짜를 몰라 세지 못한 줄, 세션마다 가장 높은 버전 | 3, 4, 8 |
| 9.4 | 파일마다의 캐시, 목록을 본 뒤 바뀐 파일의 열쇠(1단계 모으기도), 쓰는 중인 파일, 캐시가 있을 때와 없을 때 같음 | 7, 8, Task 10 Step 4 |
| 9.6 | 토큰 구간과 넘어가는 자리, 도구 두 층과 턴마다 큰 층, 실행 층 종류 표, 그 밖의 것 | 3, 4 |
| 9.7 | Codex의 관측 범위 | 6 |
| 9.8, 20.1 | 읽은 양(분모는 정본, 읽지 못한 파일과 폴더, 건너뛴 압축, 일부만 읽은 파일, 깨진 줄, 너무 긴 줄, 끝 조각), 절반 넘게 깨진 파일, MCP 관측의 사용 신호가 될 수 없는 종류 | 6, 8 |
| 「5단계 계획 전 결정」 1번 | `thread_source`로 주·하위·정체 모름 | 3 |
| 2번 | zstd를 풀 수 있는지로 가림, 건너뛴 압축은 분자, 일부만 읽은 파일은 아래 경계(결과에 잇는 것은 3부) | 2, 8 |
| 3번 | 수정 시각을 모르는 사본은 뒤에, 크기를 모르는 사본과 수정 시각을 모르는 사본의 세션을 셈 | 1, 8 |
| 4~6번 | S2, F4·F6, F5 | 2부·3부 |
| 7번 | 기록 파일 ID와 세션 ID(첫 줄을 읽지 못하면 대신 쓰고 까닭을 셈), 같은 세션 합치기, 이어받은 앞부분을 다시 세지 않음(부모와 같은 세션의 앞 기록, 지문, 캐시, 기억 양), 확인하지 못했거나 기준을 찾지 못한 것을 셈 | 3, 5, 7, 8, Task 10 Step 4 |
| 「5단계 1부 계획에서 보완」 1~14번 | 여러 프레임(1), 옛 형식의 관측(2), MCP 관측의 종류(3), 새 종류(4), 시각 없는 줄(5), 이어받은 것과 캐시(6), 되돌려 생긴 기록과 합치기(7), 다음 사본과 압축 판정과 모르는 사본(8), 1부의 범위(9), 너무 긴 줄과 실측 도구(10), 첫 줄과 버전(11), 날짜를 넘는 턴(12), 문맥의 창(13), Codex 기록의 수정 시각(14) | 2(1·8), 6(2·3·9), 4(4·12·13), 3·4(5), 5·7·8(6), 1·8(7), 8(8), Task 10(10), 3·8(11), 1·8(14) |

1부에 넣지 않은 것은 「2부, 3부와 그 뒤에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 커밋·병합 요청·병합 제목 13개를 전역 규칙(타입 12개, 타입을 뺀 설명 50자 이내, 한글 4자 이상, 영문자가 한글보다 많지 않음)으로 기계로 셌다(계획 리뷰 3차가 두 제목을 찾아 고쳤다).
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드가 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`2d0de19`)에서 과제 1부터 9까지 차례대로 만들었다(Windows 11, Node.js 24.18). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1~9는 시험만 놓고 돌리면 실패하고(실패한 시험의 수와 파일을 시험 커밋마다 따로 세어 과제의 Expected와 맞는지 봤다), 구현을 놓으면 그 과제의 확인 명령(타입 검사와 관계있는 시험)이 통과했다. 과제 9의 묶은 실행 파일 다시 만들기도 통과했다. 과제 9 뒤의 `npm run check`는 시험 파일 97개·시험 1,474개가 통과했고 `묶음 검사 통과`와 `버전 검사 통과`였다. 다시 묶어도 묶은 실행 파일은 달라지지 않았다. 다 만든 복제본의 코드와 시험 파일 246개는 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다(문서와 원장은 견주지 않았다).

연습 작업 폴더에서 따로 확인한 것은 이렇다. 그럴듯한 틀린 구현 181개를 하나씩 넣어 모두 시험이 잡았다(리뷰 6차에 더한 9개 말고는 리뷰 5차 뒤에 같은 원본으로 돌린 결과다. 6차는 시험만 더했다). 계획 초안 때 넣은 60개(처음에는 57개를 잡아 시험 셋을 더했다)에, 계획 리뷰 1차~6차와 3차 뒤 실측에서 바뀐 동작의 것과 짝이 찾은 것을 더했다.

- 목록 아홉. 두 UUID 이름에서 앞 UUID를 식별자로, 끝 UUID 앞의 밑줄을 받지 않음, 크기를 보지 못한 파일을 버림, 압축본을 정본으로 앞세움, 수정 시각을 모르는 사본을 앞세움, 날짜 폴더 자리의 파일을 세지 않음, 변경 시각을 보지 않음, 늦은 쪽 대신 변경 시각만 씀, 정본 차례를 수정 시각만으로.
- 압축 여섯. 프레임을 나누지 않고 한 번에 풂, 블록 머리 앞에서 잘린 끝 프레임을 완결로, 건너뛸 수 있는 프레임을 깨짐으로, 체크섬을 세지 않음, RLE 블록의 길이를 압축 길이로, 프레임 사이에서 줄 나누기를 새로 시작.
- 해석 마흔일곱. 정체와 토큰 열넷(넘어가는 자리를 견주지 않음, 누적값이 줄면 차분으로, 같아도 셈, 누적값 견주기에서 캐시 칸을 뺌, 응답 ID를 소문자로 견줌, 하위 세션 값 하나를 빠뜨림, 정체 모름을 하위로, 앞선 버전 꼬리를 떼지 않음, 버전을 첫 `session_meta`에서만, 버전을 글자 차례로 견줌, 뒤의 `session_meta`로도 정체를 정함, 깨진 첫 줄을 첫 줄로 보지 않음, 첫 줄이 `session_meta`가 아닌 것과 줄이 없는 것을 적지 않음), 도구와 지표 스물(셸 종료 코드 0을 오류로, 상태를 보지 않는 종류도 결과로, 이름 모름의 호출을 더하지 않음, 이름 모름을 첫 날짜에 모두 넣음, 날짜마다 차이를 턴 전체 차이로 자르지 않음, 늦은 날짜부터 나눔, 호출 층에서 `function_call`이나 `web_search_call`을 뺌, 턴 시작에서 묶음을 닫지 않음, 도구가 아닌 종류를 정체 모름으로, 정체 모를 종류를 세지 않음, 시각 없는 줄이 앞 줄의 날짜를 쓰지 않음, 강도 없음을 세지 않음, 턴 시작에서 문맥을 닫음, 턴이 끝나도 문맥을 닫지 않음, 문맥보다 앞에 온 응답에 붙이지 않음, 그런 응답을 같은 날 하나로 합침, 모델이 없는 새 문맥에 앞 모델을 이어 씀, 지침 크기를 마지막 것으로, 깨진 줄의 종류를 읽지 않음), 이어받은 것 열셋(이어받은 항목·누적값·응답·호출 층 호출을 셈, 직전 값도 부모 것일 때만 누적값을 뺌, 누적값 지문에서 캐시 쓰기 칸을 뺌, 뺀 항목과 뺀 응답을 자기 지문에 넣지 않음, 기준을 찾지 못한 기록을 늘 아니라고 함, 약한 항목도 복사된 앞부분의 끝으로 봄, 이어받은 호출이나 응답을 끝으로 보지 않음, 직전 누적값이 있으면 처음 센 자기 누적값을 적지 않음).
- 관측 다섯. 사용 신호의 종류를 상관없는 것으로(`event_msg`, `response_item`), 종류를 읽지 못한 조각을 상관없는 것으로, 너무 긴 줄을 까닭으로 보지 않음, 덮는 범위의 칸 하나를 바꿈.
- 캐시와 되살리기 열일곱. 겹침 지문을 뺄 지문 전부로, 겹침 지문에서 호출 종류나 누적값 종류를 뺌, 열쇠를 만들 때 연 파일을 목록과 견주지 않음·크기만 견줌·수정 시각만 견줌·둘 다 달라야 거절함·늘어난 크기나 늦어진 수정 시각만 거절함·연 파일의 값으로 만들고 목록과 달라도 만듦·목록 뒤 바뀐 파일에서 던짐, 지문 꼴을 보지 않음, 지문 칸이 없어도 꺼냄, Claude Code 요약의 `codex` 칸을 받음, 되살린 요약에서 `codex` 칸을 뺌, 대신 쓴 까닭을 보지 않고 되살림, 정체 모를 종류를 들어온 차례로 냄.
- 합치기 열넷. 같은 날의 수를 덮어씀, 원래 기록 대신 식별자 차례 첫 기록의 정체, 버전과 가장 이른 날짜를 원래 기록의 것으로, 날짜 없는 줄의 수와 캐시 쓰기 토큰과 기준을 찾지 못함을 버림, 구간 밖 기록을 정체·버전·가장 이른 날짜에 쓰지 않음, 구간 밖 기록의 수를 더함, 기록이 하나면 구간 밖 기록이 있어도 그대로 냄, 구간 밖 원래 기록의 출처와 주·하위·부모를 보지 않음.
- 모으기 여든. 다시 읽어야 할 때 다시 읽지 않음, 다시 읽기에서도 캐시를 씀, 다음 사본을 읽지 않음, 같은 세션을 합치지 않음, 같은 세션의 앞 기록 지문을 빼지 않음, 바로 앞 기록의 지문만 뺌, 기록 차례에서 원래 기록을 앞세우지 않음, 뒤 기록을 파일 이름 대신 식별자 차례로, 끊긴 압축과 쓰는 중인 파일을 캐시에 넣음, 체크섬 오류를 일부 읽기로 보지 않음, 구간 밖의 부모를 읽지 않음, 이름으로 찾은 부모의 세션 ID를 견주지 않음, 구간 밖 부모가 깨져도 세지 않음, 구간 밖의 같은 세션 기록을 읽지 않음·읽지 못해도 세지 않음·세션 ID를 견주지 않음·깨져도 세지 않음, 건너뛴 압축과 일부만 읽은 파일을 읽지 못한 파일로, 절반 넘게 깨진 기록과 그 바이트를 세지 않음, 읽지 못한 바이트를 정본의 크기로, 읽지 않은 사본을 세지 않음, 부모 기록이 없어도 캐시의 하위 요약을 씀, 관측에 건너뛴 압축과 일부만 읽은 파일을 넣지 않음, 크기 모르는 사본을 정본만이나 기록마다 하나까지만 셈, 수정 시각만 모르는 사본도 크기 모름으로, 수정 시각 모르는 사본의 세션을 세지 않거나 기록마다 셈, 목록 바이트를 정본의 것이나 디코더가 읽은 양으로, 부모를 모르는 하위 세션·부모 기록이 모자란 하위 세션·부모의 원래 기록을 찾지 못한 하위 세션·같은 세션의 다른 기록을 읽지 못했거나 깨진 세션·원래 기록을 찾지 못한 세션·기준을 찾지 못한 기록의 세션을 세지 않음, 부모 기록 실패를 자식 세션 ID로 찾음, 대신 쓴 세션 ID를 세지 않거나 같은 까닭을 하나만 셈, 구간 밖 같은 세션 기록을 합치기에 넘기지 않음·합친 세션에 세지 않음·첫 하나만 읽음·압축 기록을 빼고 읽음·건너뛴 압축을 확인 못 함에 넣지 않음, 다시 읽다가 실패하거나 깨진 기록의 세션을 모자란 것으로 보지 않음, 그런 기록을 요약에 남기거나 그 세션도 셈, 압축본으로 읽은 원래 기록(자기와 부모)을 원래 기록으로 보지 않음, 자기 자신을 부모로 적은 하위 세션과 원래 기록이 없는 하위 세션을 세지 않음, 읽지 못한 바이트를 디코더가 읽은 양으로 세거나 덮어씀, 수집 구간을 수정 시각만으로 가름, 쓰는 중인지를 변경 시각으로 보지 않음(압축 기록만 그런 것도), 캐시를 꺼낼 때 쓰는 중인지를 보지 않음, 쓰는 중의 2초 경계를 넣음, 수집 구간의 아래 경계와 같은 기록을 뺌, 다시 읽은 것이 일부만 읽혀도 손상으로 보지 않음, 목록을 본 뒤 바뀐 기록(보통과 압축)을 쓰는 중으로 보지 않음, 캐시를 꺼낼 때 압축본과 되돌려 생긴 기록은 최근 변경을 보지 않음, 다음 사본의 캐시를 정본의 시각으로 가림, 캐시를 꺼낼 때만 변경 시각을 1밀리초 앞당김, `--rescan`이 아니면 최근 변경이어도 캐시를 꺼냄, 압축 기록이 쓰는 중이어도 캐시에 넣음, 넣지 말라고 한 기록도 캐시에 넣음, 크기는 그대로이고 수정 시각만 바뀐 기록(보통과 압축)을 쓰는 중으로 보지 않음, 열쇠가 없으면 읽기 실패로 셈, 1단계 모으기가 열쇠가 없으면 그 파일을 버림·`--rescan`에서도 캐시를 꺼냄.
- doctor 셋. 기록 파일을 사본까지 셈, 사본 하나라도 압축이면 압축본만으로, 크기 모르는 파일을 세지 않음.

이 PC의 Codex 기록(읽기만, 캐시는 임시 폴더)으로 Task 10 Step 4를 미리 돌렸다(계획 리뷰 5차의 고침을 넣은 코드로 다시 돌렸다. 리뷰 6차는 시험만 더해 다시 돌리지 않았다). 수집 구간과 모든 기록(`--rescan`) 모두 오류 없이 끝났고 음수 칸이 없었다. 큰 압축 기록도 끝까지 흘려 읽었고 최대 메모리는 Node.js 기본 한도 안이었다. 수정 시각과 변경 시각 가운데 늦은 것으로 수집 구간을 가르니 구간에 드는 기록이 두 배쯤 됐고(작성자 PC는 변경 시각이 새로 찍힌 기록이 많았다), 그래서 첫 실행은 더 걸렸고 캐시를 쓰는 둘째 실행은 짧았다. 캐시가 있을 때와 없을 때 세션마다의 요약이 모두 같았고 둘째 실행은 모두 캐시에서 꺼냈다(이번에는 측정 중에 쓰이던 기록이 없었다. 리뷰 3차 뒤에는 쓰이던 기록 하나의 세션만 달랐고, 측정 도구가 그 기록을 늦은 쪽 시각으로 가려냈으며 모으기도 그 기록을 쓰는 중으로 보아 캐시에 넣지 않았다). 하위 세션마다 부모 기록을 찾았고 이어받아 뺀 항목과 누적값이 있었다. 이어받은 것을 확인하지 못한 세션은 모두 기준을 찾지 못한 기록이 있는 세션이었고(부모를 가진 하위 기록 가운데 스무 개에 하나꼴. 짝 2가 리뷰 2차·3차에서 그 가운데 다섯을 원본에서 직접 열어 맞는 판정임을 확인했다), 리뷰 2차에서 새로 센 까닭(부모를 모름, 원래 기록을 찾지 못함, 부모의 원래 기록을 찾지 못함)으로 늘어난 세션은 없었다(짝 2가 리뷰 3차에서 원본의 첫 줄로 따로 확인했다). 세션 ID를 대신 쓴 기록과 수정 시각을 모르는 사본은 없었다. 대화를 되돌려 생긴 기록이 원래 세션과 합쳐졌고 이름 없는 파일이 없었다. 원본에서 따로 센 값(압축하지 않은 새 형식 세션의 응답, 주 세션의 사람 요청, 셸 실행과, 순수 옛 형식 주 세션의 응답과 입력 토큰)이 모두 같았다. Claude Code 기록(1단계)도 캐시 없이 한 번, 같은 임시 캐시로 두 번 모으니 세션마다의 요약이 모두 같았고, 둘째 실행은 측정 직전에 쓰여 쓰는 중으로 본 파일 하나 말고는 모두 캐시에서 꺼냈다. 묶은 실행 파일의 `aq doctor`도 임시 홈에서 Expected대로였고 상태 폴더는 임시 홈 아래에만 생겼다.

미리 돌리며 찾아 고친 것은 둘이다. 되돌려 생긴 기록의 이름(`rollout-<시각>-<UUID1>_<UUID2>`)을 처음 이름 꼴이 받지 않아 그 기록이 이름 없는 파일로 빠졌다(「5단계 1부 계획에서 보완」 7번. 과제 1과 8을 고쳤다). 원본에서 따로 센 값과 셸 실행이 어긋나 보인 것은 대조 도구가 Node.js의 `readline`으로 읽어 U+2028·U+2029에서 줄이 잘린 탓이었다(10번. 제품의 줄 나누기는 맞았고, 대조 도구를 줄바꿈에서만 자르게 고쳤다). 계획 리뷰 1차~6차가 찾아 고친 것은 설계의 「5단계 1부 계획 리뷰 1차에서 보완」~「…리뷰 6차에서 보완」에 적었다.

확인하지 못한 것은 이렇다. Node.js 22에서 돌리는 것은 Task 10 Step 3에서 한다. zstd가 없는 Node.js의 실제 실행은 시험용 선택(`zstd: false`)으로만 봤다. macOS와 Linux의 Codex 기록 폴더, 작성자 PC에 없던 Codex 버전(0.148~0.153, 0.166보다 새 것)과 형식, 작성자 PC에 하나뿐이던 되돌려 생긴 기록 밖의 꼴은 보지 않았다. 원본에서 따로 센 값은 압축하지 않은 기록만 있는 세션이었다(압축본만 있는 세션은 대조 도구가 풀지 않았다). 호출 층에만 남고 McpToolCall이 남지 않는 MCP 호출이 있는지는 가리지 못했다(「5단계 1부 계획에서 보완」 3번). 작성자 PC에는 부모를 모르거나 부모 기록이 모자란 하위 세션, 같은 세션의 다른 기록을 읽지 못한 세션, 원래 기록을 찾지 못한 세션, 세션 ID를 대신 쓴 기록이 없어 그 셈은 시험으로만 봤다. 수집 구간 밖의 같은 세션 기록을 읽는 길도 작성자 PC의 수집 구간에 그런 세션이 없어 시험으로만 봤다.
