# AQ 점검 5단계 1부 — Codex 기록 읽기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 실제 기록으로 돌려 보기로 검증한다.

**Goal:** Codex의 기록 폴더를 찾아 수집 구간에 걸리는 기록 파일(압축본 포함)을 같은 기록의 사본 가운데 정본 하나씩 읽고, 논리 세션마다 날짜별 요약(응답, 토큰, 도구, 사람 요청, 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기)과 읽은 양을 낸다. 하위 세션이 부모의 앞부분을 이어받은 것은 다시 세지 않고, 캐시가 있을 때와 없을 때 결과가 같다. `aq doctor`가 Codex 기록 폴더를 알린다.

**Architecture:** 어댑터는 `src/adapters/codex/`에 둔다. 목록과 사본 묶기(`locate.ts`), 압축 기록을 프레임마다 풀기(`zstd.ts`), 줄 해석(`parser.ts`. 세션의 정체, 토큰 구간, 도구 두 층, 그 밖의 지표, 이어받은 것 빼기와 자기 지문), 관측 범위(`observation.ts`), 지문 목록과 부모와의 겹침(`fingerprints.ts`), 같은 세션의 기록 합치기(`merge.ts`)다. 모으기(`src/collect/codex.ts`)는 두 번에 나눠 읽는다. 먼저 정본마다 캐시에서 꺼내거나 부모 지문 없이 읽고, 그다음 하위 기록마다 부모와의 겹침이 해석 때와 다르면 부모 지문을 넣어 다시 읽는다. 1단계의 공통(줄 나누기, 요약 모양, 캐시, 관측의 까닭)을 넓혀 함께 쓴다. 평가 입력과 결과 화면에 Codex를 잇는 것은 3부다.

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

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `ED97D8D0EEAC2251B40F4C71A8D1472F841C733D159939ECA91EF209B30A5E07`, 4,027줄)이다. 설계 끝에 「5단계 1부 계획에서 보완」(열 가지)을 더하고 9.6, 9.7, 9.8과 부록 A의 해당 줄을 고쳤다. 압축 기록의 여러 프레임, 옛 형식의 관측(9.6·9.7의 옛 형식 열), MCP 관측의 사용 신호가 될 수 없는 종류, 새로 본 종류와 열쇠, 시각 없는 줄의 날짜, 이어받은 것의 방법과 캐시, 되돌려 생긴 기록의 이름과 같은 세션 합치기, 정본을 읽지 못할 때와 압축 기록의 판정, 너무 긴 줄, 실측 도구의 줄 나누기다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/adapters/codex/locate.ts`(새) | 1 | Codex 기록 폴더(`CODEX_HOME` 또는 `~/.codex`), `sessions/<연>/<월>/<일>/` 아래 기록 파일 목록, 같은 기록의 사본을 정본 차례로 묶기 |
| `src/adapters/codex/zstd.ts`(새), `src/adapters/common/lines.ts`(고침) | 2 | 압축 기록의 프레임 자리 훑기와 프레임마다 흘려 풀기. 1단계 줄 나누기를 조각 공급원에서도 쓰게 떼어 낸다 |
| `src/adapters/codex/parser.ts`(새), `src/adapters/types.ts`, `src/core/copy/common.ts`, `src/core/result/notices.ts`, `src/core/result/tools.ts`, `src/report/html.ts`(고침) | 3 | 세션의 정체와 토큰 구간, 날짜 칸. 도구 이름 `codex`를 더하고 그 이름이 쓰이는 표 넷을 채운다 |
| `src/adapters/codex/parser.ts`, `src/adapters/types.ts`(고침) | 4 | 도구 두 층, 정체 모를 항목 종류, 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기 |
| `src/adapters/codex/parser.ts`, `src/adapters/types.ts`(고침) | 5 | 부모 지문으로 이어받은 앞부분 빼기, 자기 지문 내기 |
| `src/adapters/codex/observation.ts`(새), `src/adapters/codex/parser.ts`, `src/adapters/claude/observation.ts`(고침) | 6 | 덮는 범위, MCP 관측, 깨진 줄과 끝 조각의 맨 바깥 종류 |
| `src/adapters/codex/fingerprints.ts`(새), `src/adapters/types.ts`, `src/state/cache.ts`, `src/adapters/codex/parser.ts`(고침) | 7 | Codex 요약 되살리기, 캐시의 지문 칸과 부모와의 겹침 |
| `src/adapters/codex/merge.ts`, `src/collect/codex.ts`(새), `src/adapters/types.ts`(고침) | 8 | 같은 세션의 기록 합치기, Codex 기록 모으기와 읽은 양 |
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
- Produces: `CodexLogFile`(`path`, `normPath`, `size`, `mtimeMs`, `recordId`, `baseId`, `compressed`), `CodexFileList`(`sessionsFound`, `files`, `olderThanWindow`, `unreadableDirs`, `unnamedFiles`), `CodexCopyGroup`(`recordId`, `copies`), `codexHome(env, homedir)`, `listCodexFiles(home, minMtimeMs)`, `groupCopies(files)`(`src/adapters/codex/locate.ts`). 과제 8(모으기)과 과제 9(doctor)가 쓴다.

설계 9.1, 9.2, 「5단계 계획 전 결정」 3·7번, 「5단계 1부 계획에서 보완」의 7번이다.

- 기록 폴더는 `CODEX_HOME`(빈칸뿐이면 없는 것으로 본다)이고 없으면 홈의 `.codex`다. 그 아래 `sessions/<연>/<월>/<일>/`의 날짜 폴더 셋(이름이 숫자인 폴더)만 따라 내려가 `rollout-*.jsonl`과 `rollout-*.jsonl.zst`를 찾는다. 다른 자리와 다른 이름은 보지 않는다. 날짜 폴더 자리에 파일이 있거나 목록을 읽지 못한 폴더는 읽지 못한 폴더로 센다.
- 기록 파일의 식별자는 이름 끝의 UUID다. 대화를 되돌려 같은 세션의 기록 파일이 하나 더 생긴 기록(결정 7)은 작성자 PC에서 이름이 `rollout-<시각>-<UUID1>_<UUID2>` 꼴이었고(첫 줄 `session_meta`에 `history_base`와 `history_mode`가 있었다), 끝의 UUID2가 기록 파일의 식별자, 앞의 UUID1이 원래 세션의 ID다. UUID1을 `baseId`로 따로 적는다(구간 밖의 부모를 찾을 때 쓴다. 과제 8). 보통 이름은 `baseId`가 `null`이다. 이름에서 식별자를 읽지 못한 rollout 파일은 목록에 넣지 않고 수만 센다. 계획 전 실측에서 첫 이름 꼴(끝 UUID 앞이 `-`만)이 되돌려 생긴 기록을 이름 없는 파일로 빼서, 그 기록이 읽히지도 합쳐지지도 않았다(「5단계 1부 계획에서 보완」의 7번).
- 수정 시각으로 거르는 아래 경계(`minMtimeMs`)를 받으면 그보다 앞선 파일은 열지 않고 센다. 같은 기록의 사본도 하나씩 따로 거른다. 모으기(과제 8)는 하위 세션의 부모가 구간보다 오래됐을 수 있어 `null`로 받고 정본마다 가른다.
- 크기나 수정 시각을 보지 못한 파일은 둘을 `null`로 두고 목록에 남긴다. 수집 구간에 걸리는 것으로 보고 정본 후보로 둔다(설계 9.8, 결정 3).
- 사본 묶기는 같은 식별자끼리이고 정본 차례는 압축하지 않은 것, 수정 시각이 늦은 것(모르는 것은 아는 것 뒤), 정규화한 경로 사전순이다(설계 9.2, 결정 3). 정본을 읽지 못하면 다음 사본을 읽는 것은 모으기가 한다.

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
import { codexHome, groupCopies, listCodexFiles, type CodexLogFile } from "../../../src/adapters/codex/locate.ts";

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
    const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"));
    expect(list.files.map((file) => [file.recordId, file.compressed])).toEqual([[ID_A, true]]);
    expect(list.olderThanWindow).toBe(2);
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
  const file = (recordId: string, compressed: boolean, mtimeMs: number | null, normPath: string): CodexLogFile => ({ path: normPath, normPath, size: mtimeMs === null ? null : 1, mtimeMs, recordId, baseId: null, compressed });

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
  /** 크기와 수정 시각을 보지 못했으면 null이다. 그런 파일도 정본 후보로 남긴다 */
  size: number | null;
  mtimeMs: number | null;
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
  /** 수정 시각이 아래 경계보다 앞서 열지 않은 파일의 수 */
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

export async function listCodexFiles(home: string, minMtimeMs: number | null): Promise<CodexFileList> {
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
        const info = await stat(path);
        if (minMtimeMs !== null && info.mtimeMs < minMtimeMs) {
          olderThanWindow++;
          continue;
        }
        files.push({ path, normPath: normalizePath(path), size: info.size, mtimeMs: info.mtimeMs, recordId, baseId, compressed });
      } catch {
        // 크기와 수정 시각을 모르면 수집 구간에 걸리는 것으로 본다(설계 9.8). 정본 후보로 남긴다(결정 3)
        files.push({ path, normPath: normalizePath(path), size: null, mtimeMs: null, recordId, baseId, compressed });
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

/** 정본 차례. 압축하지 않은 것, 수정 시각이 늦은 것(모르는 것은 아는 것 뒤), 경로 사전순이다(설계 9.2, 결정 3) */
function canonicalOrder(a: CodexLogFile, b: CodexLogFile): number {
  if (a.compressed !== b.compressed) return a.compressed ? 1 : -1;
  if (a.mtimeMs !== b.mtimeMs) {
    if (a.mtimeMs === null) return 1;
    if (b.mtimeMs === null) return -1;
    return b.mtimeMs - a.mtimeMs;
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
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 10개.

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
- 프레임 훑기의 결과는 `complete`(모든 프레임이 끝까지 있음), `truncated`(끝 프레임이 잘림. 남은 4바이트 미만이 매직의 앞부분인 것도 든다), `invalid`(매직이 틀림, 예약 비트, 블록 종류 3, 완결된 프레임 뒤의 다른 것, 빈 파일)다. 끝까지 있는 프레임을 차례로 풀고, 잘렸거나 깨진 프레임은 나오는 만큼 푼다. 풀다가 오류가 나면 그 앞까지의 줄만 내고 오류를 돌려준다. 작성자 PC의 압축 기록은 모두 완결된 한 프레임이었다.
- 쓰는 중인지는 1단계와 같다(열 때와 다 읽은 뒤의 크기와 수정 시각이 다르거나, 수정 시각이 평가 시각에서 2초 안쪽).
- 시험은 `zlib.zstdCompressSync`로 만든 합성 자료다(정상 하나, 두 프레임, 끝 프레임 3바이트 자름, 프레임 가운데 자름, 매직 틀림, 정상 뒤 쓰레기, 체크섬 있음, 건너뛸 수 있는 프레임). 그 Node.js에 zstd가 없으면 건너뛴다.

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
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 16개.

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
- Produces: `CodexSessionParser`(`line(text)`, `tooLong()`, `finish(tail, inProgress)`), `CodexParserContext`(`recordId`, `timeZone`), `SUB_THREAD_SOURCES`, `CODEX_PARSER_VERSION`(`src/adapters/codex/parser.ts`). `ToolId`에 `"codex"`, `SessionSummary.codex`(`recordId`, `unknownThreadSource`, `idFromRecord`)(`src/adapters/types.ts`). 과제 4~8이 쓴다.

설계 9.2, 9.3, 9.6, 「5단계 계획 전 결정」 1·7번, 「5단계 1부 계획에서 보완」의 5번이다.

- 해석기는 1단계의 `ClaudeSessionParser`와 같은 꼴이다(`line`, `tooLong`, 끝 조각을 받는 `finish`). 빈 줄은 세지 않고, 풀리지 않는 줄은 깨진 줄, 쓰는 중인 파일의 풀리지 않는 끝은 끝 조각이다.
- 세션의 정체는 첫 줄 `session_meta`에서 정한다. 세션 ID는 `id`, 작업 폴더는 `cwd`, 버전은 `cli_version`의 앞선 버전 꼬리를 뗀 `x.y.z`(`0.140.0-alpha.19`는 `0.140.0`. 1단계의 버전 읽기는 `x.y.z`만 받는다)다. `thread_source`가 `subagent`·`guardian_review`·`memory_consolidation`이면 하위 세션이고 부모는 `parent_thread_id`다. `user`는 주 세션이고, 그 밖의 값과 열쇠 없음은 정체 모름이라 주 세션으로 세고 그 값(열쇠가 없으면 `(없음)`)을 따로 적는다(결정 1). 첫 줄이 `session_meta`가 아니거나 `id`가 없으면 기록 파일의 식별자를 세션 ID로 대신 쓰고 그렇다고 적는다(결정 7).
- 토큰은 구간으로 가른다(설계 9.6). `token_usage_record`가 처음 나오기 전은 옛 구간이다. `token_count`의 `info.total_token_usage`가 직전과 모두 같으면 세지 않고, 하나라도 줄었으면 새로 시작된 것으로 그 값을, 그 밖에는 칸마다의 차분을 응답 하나로 센다. 새 구간은 `token_usage_record`의 `response_id`마다 한 번 `usage`를 센다. 넘어가는 자리는 새 구간 첫 기록의 `thread_token_usage`가 옛 구간에서 마지막으로 본 누적값과 같을 때만 세지 않는다.
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
    expect(summary.codex).toMatchObject({ recordId: RECORD, unknownThreadSource: null, idFromRecord: false });
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

  it("첫 줄이 session_meta가 아니면 기록 파일 식별자를 세션 ID로 대신 쓰고 그렇게 했다고 적는다", () => {
    const summary = run([count(usage(10, 0, 5, 0))]);
    expect(summary).toMatchObject({ sessionId: RECORD, kind: "main", codex: { idFromRecord: true } });
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
  private sawFirst = false;
  private idFromRecord = false;
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
    if (parsed === null) this.brokenLines++;
    else this.accept(parsed);
  }

  /** 상한을 넘은 줄 하나를 받는다 */
  tooLong(): void {
    this.lines++;
    this.tooLongLines++;
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
    if (!this.sawFirst) {
      this.sawFirst = true;
      if (row.type === "session_meta") {
        this.meta(payload);
        return;
      }
      this.idFromRecord = true;
    }
    if (row.type === "event_msg" && payload.type === "token_count") {
      if (!this.inNew) this.oldCount(usageOf(obj(payload.info)?.total_token_usage));
      return;
    }
    if (row.type === "token_usage_record") this.newRecord(payload);
  }

  private meta(payload: Json): void {
    this.sessionId = str(payload.id);
    if (this.sessionId === null) this.idFromRecord = true;
    this.cwd = str(payload.cwd);
    this.version = normalizeVersion(payload.cli_version);
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
      if (parsed !== null) this.accept(parsed);
      else if (inProgress) this.tailFragments++;
      else this.brokenLines++;
    }
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
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFromRecord: this.idFromRecord },
    };
  }
}
```

`src/adapters/types.ts`(찾을 곳 1/2):

```ts

export type ToolId = "claude-code";
export type SessionKind = "main" | "sub";
```

`src/adapters/types.ts`(바꾼 뒤 1/2):

```ts

export type ToolId = "claude-code" | "codex";
export type SessionKind = "main" | "sub";
```

`src/adapters/types.ts`(찾을 곳 2/2):

```ts
  notes: { syntheticResponses: number; responsesWithoutId: number; undatedLines: number; unknownHookKinds: Record<string, number> };
}
```

`src/adapters/types.ts`(바꾼 뒤 2/2):

```ts
  notes: { syntheticResponses: number; responsesWithoutId: number; undatedLines: number; unknownHookKinds: Record<string, number> };
  /** Codex만. 기록 파일의 식별자, 정체 모름인 thread_source의 값(열쇠가 없으면 "(없음)"), 세션 ID를 기록 파일의 식별자로 대신 썼는지(설계 「5단계 계획 전 결정」 1·7번) */
  codex?: { recordId: string; unknownThreadSource: string | null; idFromRecord: boolean };
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
Expected: PASS. 타입 검사 오류 없음, 시험 파일 42개, 시험 769개.

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

설계 9.6, 9.7, 「5단계 1부 계획에서 보완」의 2·4번이다.

- 도구는 두 층이다. 호출 층은 `response_item`의 `function_call`·`custom_tool_call`·`web_search_call`이고, 실행 층은 `event_msg`의 `item_completed`다. 이름별 호출·결과·오류는 늘 실행 층에서 센다. 셸 명령(CommandExecution)은 `shell`, 파일 고치기(FileChange)는 `file_change`, MCP 호출(McpToolCall)은 `mcp__<server>`, 그림 보기는 `image_view`, 확장 도구는 `extension`, 검색은 `web_search`다. 결과와 오류는 상태를 보는 종류만이다(셸은 종료 코드가 0이 아니면 오류, 파일 고치기와 MCP 호출은 `status`가 `failed`이면 오류).
- 턴(`task_started`부터 `task_complete`·`turn_aborted`까지, 턴 밖은 한 묶음)마다 호출 층이 실행 층보다 많으면 그 차이를 이름 모름(`?`)의 호출로 그 묶음의 마지막 날짜에 더한다. 그러면 호출 수의 합은 9.6의 "수가 큰 층"이 되고 오류율은 실행 층 그대로다. 호출 층 줄에는 `turn_id`가 없어(작성자 PC 실측) 턴은 줄 차례로 묶는다.
- 사람 요청은 `UserMessage`, 도구가 아닌 종류(`AgentMessage`, `Reasoning`, `ContextCompaction`)는 세지 않는다. 그 밖의 종류는 정체 모름이라 도구 수에 넣지 않고 종류별로 센다. 작성자 PC에서 본 새 종류(`SubAgentActivity`, `CollabAgentToolCall`, `Plan`)도 지금은 정체 모름이다. 도구로 볼지는 규칙 표와 함께 3부에서 정한다(「5단계 1부 계획에서 보완」의 4번).
- 모델과 추론 강도는 `turn_context`의 `model`·`effort`를 그 뒤의 응답에 붙인다(강도가 없으면 모르는 강도). 압축은 `compacted`, 끊은 턴은 `turn_aborted`, MCP 호출은 McpToolCall의 `server`, 지침 크기는 첫 `world_state`의 `state.agents_md.text` 글자 수(아스키와 그 밖으로 나눔)다.
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
const call = (name: string) => line("response_item", { type: "custom_tool_call", name, call_id: `c-${name}` });
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

  it("turn_context의 모델과 추론 강도를 그 뒤의 응답에 붙이고, 강도가 없으면 모르는 강도로 센다", () => {
    const cell = day([meta(), record("r0", 5), line("turn_context", { model: "gpt-6.1-sol", effort: "xhigh" }), record("r1", 10), record("r2", 20), line("turn_context", { model: "gpt-6.1-sol" }), record("r3", 30)]);
    expect(cell.models).toEqual({ "gpt-6.1-sol": 3 });
    expect(cell.efforts).toEqual({ xhigh: 2 });
    expect(cell.unknownEffort).toBe(2);
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
Expected: FAIL. 시험 11개가 모두 실패한다. 과제 3의 해석기는 실행 층과 호출 층, 사람 요청, `turn_context`, `compacted`, `turn_aborted`, `world_state`를 세지 않는다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/parser.ts`(찾을 곳 1/8):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가른다(설계 9.2, 9.6, 「5단계 계획 전 결정」 1·7번)
import { nameRecord } from "../common/canonical.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { canonicalDay, emptyDay, type DayCell, type SessionKind, type SessionSummary, type TokenCounts } from "../types.ts";

```

`src/adapters/codex/parser.ts`(바꾼 뒤 1/8):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가르고, 도구는 실행 층에서 이름별로 세되 턴마다 호출 층이 더 많으면 그 차이를 이름 모름으로 더한다. 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기도 센다(설계 9.2, 9.6, 9.7, 「5단계 계획 전 결정」 1·7번)
import { UNKNOWN_TOOL } from "../claude/parser.ts";
import { nameRecord } from "../common/canonical.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
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

`src/adapters/codex/parser.ts`(찾을 곳 2/8):

```ts
  private readonly seenResponses = new Set<string>();

```

`src/adapters/codex/parser.ts`(바꾼 뒤 2/8):

```ts
  private readonly seenResponses = new Set<string>();
  /** 지금 듣는 turn_context의 모델과 추론 강도. 그 뒤의 응답에 붙인다 */
  private model: string | null = null;
  private effort: string | null = null;
  /** 지금 묶음(턴, 또는 턴 밖)에서 센 호출 층과 실행 층의 도구 수, 그리고 묶음에서 마지막으로 본 날짜 */
  private groupCalls = 0;
  private groupExec = 0;
  private groupDate: LocalDate | null = null;
  private readonly unknownItemTypes = nameRecord<number>();
  private instructionChars: { ascii: number; other: number } | null = null;

```

`src/adapters/codex/parser.ts`(찾을 곳 3/8):

```ts

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다 */
```

`src/adapters/codex/parser.ts`(바꾼 뒤 3/8):

```ts

  private tool(cell: DayCell, name: string): ToolCounts {
    let counts = cell.tools[name];
    if (!counts) {
      counts = emptyToolCounts();
      cell.tools[name] = counts;
    }
    return counts;
  }

  /** 묶음을 닫는다. 호출 층이 실행 층보다 많으면 그 차이를 이름 모름의 호출로 묶음의 마지막 날짜에 더한다(설계 9.6) */
  private closeGroup(): void {
    const extra = this.groupCalls - this.groupExec;
    if (extra > 0 && this.groupDate !== null) this.tool(this.day(this.groupDate), UNKNOWN_TOOL).calls += extra;
    this.groupCalls = 0;
    this.groupExec = 0;
    this.groupDate = null;
  }

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다 */
```

`src/adapters/codex/parser.ts`(찾을 곳 4/8):

```ts
    }
    if (row.type === "token_usage_record") this.newRecord(payload);
  }
```

`src/adapters/codex/parser.ts`(바꾼 뒤 4/8):

```ts
    }
    if (row.type === "token_usage_record") return this.newRecord(payload);
    if (row.type === "turn_context") {
      this.model = str(payload.model);
      this.effort = str(payload.effort);
      return;
    }
    if (row.type === "event_msg" && (payload.type === "task_started" || payload.type === "task_complete" || payload.type === "turn_aborted")) {
      this.closeGroup();
      if (payload.type === "turn_aborted") {
        const date = this.dateOf();
        if (date !== null) this.day(date).interruptedTurns++;
      }
      return;
    }
    if (row.type === "response_item" && typeof payload.type === "string" && CALL_TYPES.has(payload.type)) {
      this.groupCalls++;
      const date = this.dateOf();
      if (date !== null) this.groupDate = date;
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
    this.groupExec++;
    const date = this.dateOf();
    if (date === null) return;
    this.groupDate = date;
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

`src/adapters/codex/parser.ts`(찾을 곳 5/8):

```ts
    for (const key of KEYS) cell.tokens[key] += add[key];
  }
```

`src/adapters/codex/parser.ts`(바꾼 뒤 5/8):

```ts
    for (const key of KEYS) cell.tokens[key] += add[key];
    if (this.model !== null) cell.models[this.model] = (Object.hasOwn(cell.models, this.model) ? cell.models[this.model]! : 0) + 1;
    if (this.effort !== null) cell.efforts[this.effort] = (Object.hasOwn(cell.efforts, this.effort) ? cell.efforts[this.effort]! : 0) + 1;
    else cell.unknownEffort++;
  }
```

`src/adapters/codex/parser.ts`(찾을 곳 6/8):

```ts
    }
    const days: Record<LocalDate, DayCell> = {};
```

`src/adapters/codex/parser.ts`(바꾼 뒤 6/8):

```ts
    }
    this.closeGroup();
    const days: Record<LocalDate, DayCell> = {};
```

`src/adapters/codex/parser.ts`(찾을 곳 7/8):

```ts
      days,
      instructionChars: null,
      initialSkills: null,
```

`src/adapters/codex/parser.ts`(바꾼 뒤 7/8):

```ts
      days,
      instructionChars: this.instructionChars,
      initialSkills: null,
```

`src/adapters/codex/parser.ts`(찾을 곳 8/8):

```ts
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFromRecord: this.idFromRecord },
    };
```

`src/adapters/codex/parser.ts`(바꾼 뒤 8/8):

```ts
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFromRecord: this.idFromRecord, unknownItemTypes: this.unknownItemTypes },
    };
```

`src/adapters/types.ts`(찾을 곳):

```ts
  codex?: { recordId: string; unknownThreadSource: string | null; idFromRecord: boolean };
```

`src/adapters/types.ts`(바꾼 뒤):

```ts
  codex?: { recordId: string; unknownThreadSource: string | null; idFromRecord: boolean; unknownItemTypes: Record<string, number> };
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex/parser-tools.test.ts test/adapters/codex/parser.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 24개.

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
- Produces: `CodexFingerprints`(`itemIds`, `callIds`, `totals`, `responseIds`), `CodexParserContext.inherited`, `CodexSessionParser.fingerprints()`, `SessionSummary.codex.inheritedSkipped`(`items`, `totals`, `responses`)(`src/adapters/codex/parser.ts`, `src/adapters/types.ts`). 과제 7·8이 쓴다.

설계 9.2, 9.6, 「5단계 계획 전 결정」 7번과 「7번의 세부」, 「5단계 1부 계획에서 보완」의 6번이다.

- 하위 세션은 자기를 띄운 때까지의 부모 대화를 복사해 담고 그 뒤에 자기 일을 이어 쓴다. 작성자 PC의 하위 세션 항목은 대부분이 부모와 같은 `item.id`였고, 복사된 항목도 하위 자신의 `thread_id`와 하위가 쓴 시각을 달고 있어 줄 하나로는 가를 수 없었다. 그래서 자리로 가르지 않고 부모 기록의 지문과 견준다.
- 지문은 항목의 `item.id`, 호출 층의 `call_id`, 옛 구간의 누적값(칸 다섯을 차례로 이은 것), 새 구간의 `response_id`를 64비트 FNV-1a로 해시한 것이다. 원문은 되살릴 수 없다.
- 문맥으로 부모의 지문(`inherited`)을 받으면, 그 안에 있는 항목과 호출은 세지 않고, 부모에도 있는 누적값은 기준만 옮기고 늘어난 몫을 세지 않으며, 부모에도 있는 응답은 세지 않는다. 뺀 수를 종류별로 센다. 지문을 받지 않으면 다 센다(부모가 없거나 부모 기록을 읽지 못한 세션. 결정 7의 "대신 봄").
- 해석기는 자기 기록의 지문을 낸다. 이어받아 뺀 것도 넣는다(손자 세션이 같은 앞부분을 다시 이어받을 수 있다). 자기 지문은 부모 지문과 상관없이 기록만으로 정해진다(과제 7의 캐시와 과제 8의 모으기가 기댄다).

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
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/parser-inherit.test.ts`
Expected: FAIL. 시험 7개가 모두 실패한다. 과제 4의 해석기는 부모 지문을 받지 않아 다 세고, `codex.inheritedSkipped`와 `fingerprints()`가 없다.

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
  /** 이 세션이 앞부분을 이어받은 기록(부모)의 지문. 그 안에 있는 것은 이 세션의 것으로 세지 않는다. 없으면 다 센다(「5단계 계획 전 결정」 7번) */
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

```

`src/adapters/codex/parser.ts`(찾을 곳 6/11):

```ts
    if (row.type === "response_item" && typeof payload.type === "string" && CALL_TYPES.has(payload.type)) {
      this.groupCalls++;
```

`src/adapters/codex/parser.ts`(바꾼 뒤 6/11):

```ts
    if (row.type === "response_item" && typeof payload.type === "string" && CALL_TYPES.has(payload.type)) {
      const callId = str(payload.call_id);
      if (callId !== null) {
        const print = fnv1a64(callId);
        this.myCallIds.add(print);
        if (this.ctx.inherited?.callIds.has(print)) return;
      }
      this.groupCalls++;
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
      return;
    }
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
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFromRecord: this.idFromRecord, unknownItemTypes: this.unknownItemTypes },
    };
```

`src/adapters/codex/parser.ts`(바꾼 뒤 11/11):

```ts
      notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: this.undatedLines, unknownHookKinds: nameRecord<number>() },
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFromRecord: this.idFromRecord, unknownItemTypes: this.unknownItemTypes, inheritedSkipped: { ...this.inheritedSkipped } },
    };
```

`src/adapters/types.ts`(찾을 곳):

```ts
  codex?: { recordId: string; unknownThreadSource: string | null; idFromRecord: boolean; unknownItemTypes: Record<string, number> };
```

`src/adapters/types.ts`(바꾼 뒤):

```ts
  codex?: { recordId: string; unknownThreadSource: string | null; idFromRecord: boolean; unknownItemTypes: Record<string, number>; inheritedSkipped: { items: number; totals: number; responses: number } };
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 5개, 시험 49개.

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
- MCP 호출의 관측은 1단계와 같은 방법이다. 읽지 못한 것(과제 8이 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더해 넘긴다), 너무 긴 줄, 사용 신호가 될 수 없는 종류로 확인되지 않은 깨진 줄과 끝 조각이 하나라도 있으면 빠짐없지 않다. 사용 신호가 될 수 없는 종류는 9.8 표의 Codex 칸(`session_meta`, `turn_context`, `token_usage_record`, `world_state`, `compacted`)에 `response_item`을 더한 것이다. 해석기는 MCP 호출을 McpToolCall(`event_msg`)에서만 세고, 작성자 PC의 기록에서는 옛 형식을 넣어 호출 층의 MCP 호출마다 McpToolCall이 남아 있었다(「5단계 1부 계획에서 보완」의 2·3번).
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
  it("사용 신호가 될 수 없는 종류는 설계 9.8 표의 Codex 칸에 response_item을 더한 것이다. MCP 호출은 event_msg의 McpToolCall에만 실린다(「5단계 1부 계획에서 보완」)", () => {
    expect([...CODEX_MCP_NON_SIGNAL_TYPES].sort()).toEqual(["compacted", "response_item", "session_meta", "token_usage_record", "turn_context", "world_state"]);
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
 * 깨진 줄이나 끝 조각이 이 종류로 온전히 읽히면 MCP 호출이 실릴 수 없다(설계 9.8 표의 Codex 칸). MCP 호출은 event_msg의 item_completed(McpToolCall)에만 실린다.
 * response_item(호출 층)은 9.8 표에서 사용 신호가 될 수 있는 종류였지만, 해석기는 호출 층에서 MCP 호출을 세지 않고, 작성자 PC의 기록에서는 옛 형식을 넣어
 * 호출 층의 MCP 호출마다 McpToolCall이 남아 있었다(「5단계 1부 계획에서 보완」)
 */
export const CODEX_MCP_NON_SIGNAL_TYPES: ReadonlySet<string> = new Set(["session_meta", "turn_context", "token_usage_record", "world_state", "compacted", "response_item"]);

/** MCP 호출의 관측. unreadableCount는 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더한 수다(설계 9.8 표의 첫 줄) */
export function codexMcpObservation(summaries: readonly SessionSummary[], unreadableCount: number): Observation {
  return observeRecords(summaries, unreadableCount, CODEX_MCP_NON_SIGNAL_TYPES);
}
```

`src/adapters/codex/parser.ts`(찾을 곳 1/6):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가르고, 도구는 실행 층에서 이름별로 세되 턴마다 호출 층이 더 많으면 그 차이를 이름 모름으로 더한다. 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기도 센다(설계 9.2, 9.6, 9.7, 「5단계 계획 전 결정」 1·7번)
import { UNKNOWN_TOOL } from "../claude/parser.ts";
import { nameRecord } from "../common/canonical.ts";
import { fnv1a64 } from "../common/hash.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { canonicalDay, emptyDay, emptyToolCounts, type DayCell, type SessionKind, type SessionSummary, type TokenCounts, type ToolCounts } from "../types.ts";
```

`src/adapters/codex/parser.ts`(바꾼 뒤 1/6):

```ts
// Codex 세션 파일 하나를 줄마다 해석해 세션 요약을 만든다. 세션의 정체는 첫 줄 session_meta에서, 토큰은 옛 구간(token_count의 누적값 차분)과 새 구간(token_usage_record의 response_id)으로 가르고, 도구는 실행 층에서 이름별로 세되 턴마다 호출 층이 더 많으면 그 차이를 이름 모름으로 더한다. 사람 요청, 모델과 추론 강도, 압축, 끊은 턴, MCP 호출, 지침 크기, 깨진 줄과 끝 조각의 맨 바깥 종류도 센다(설계 9.2, 9.6, 9.7, 9.8, 「5단계 계획 전 결정」 1·7번)
import { UNKNOWN_TOOL } from "../claude/parser.ts";
import { nameRecord, sortedRecord } from "../common/canonical.ts";
import { fnv1a64 } from "../common/hash.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { outerTypeOf } from "../common/outer-type.ts";
import { canonicalDay, emptyDay, emptyToolCounts, type DayCell, type SessionKind, type SessionSummary, type TokenCounts, type ToolCounts } from "../types.ts";
```

`src/adapters/codex/parser.ts`(찾을 곳 2/6):

```ts
  private undatedLines = 0;
  /** 새 구간에 들어섰는지(token_usage_record를 한 번이라도 봤는지) */
```

`src/adapters/codex/parser.ts`(바꾼 뒤 2/6):

```ts
  private undatedLines = 0;
  /** 깨진 줄과 끝 조각의 맨 바깥 종류(온전히 읽히지 않으면 ?)별 수. MCP 호출의 관측이 빠짐없는지 가른다(설계 9.8) */
  private readonly unconfirmedTypes = nameRecord<number>();
  /** 새 구간에 들어섰는지(token_usage_record를 한 번이라도 봤는지) */
```

`src/adapters/codex/parser.ts`(찾을 곳 3/6):

```ts
    const parsed = parseObject(text);
    if (parsed === null) this.brokenLines++;
    else this.accept(parsed);
```

`src/adapters/codex/parser.ts`(바꾼 뒤 3/6):

```ts
    const parsed = parseObject(text);
    if (parsed === null) this.missing(text, "broken");
    else this.accept(parsed);
```

`src/adapters/codex/parser.ts`(찾을 곳 4/6):

```ts

  /** 상한을 넘은 줄 하나를 받는다 */
```

`src/adapters/codex/parser.ts`(바꾼 뒤 4/6):

```ts

  /** 풀리지 않는 줄이나 끝 조각 하나. 맨 바깥 종류를 센다(1단계와 같다) */
  private missing(text: string, kind: "broken" | "tail"): void {
    if (kind === "broken") this.brokenLines++;
    else this.tailFragments++;
    const type = outerTypeOf(text) ?? "?";
    this.unconfirmedTypes[type] = (Object.hasOwn(this.unconfirmedTypes, type) ? this.unconfirmedTypes[type]! : 0) + 1;
  }

  /** 상한을 넘은 줄 하나를 받는다 */
```

`src/adapters/codex/parser.ts`(찾을 곳 5/6):

```ts
      if (parsed !== null) this.accept(parsed);
      else if (inProgress) this.tailFragments++;
      else this.brokenLines++;
    }
```

`src/adapters/codex/parser.ts`(바꾼 뒤 5/6):

```ts
      if (parsed !== null) this.accept(parsed);
      else this.missing(tail, inProgress ? "tail" : "broken");
    }
```

`src/adapters/codex/parser.ts`(찾을 곳 6/6):

```ts
      initialMcpServers: null,
      missing: { lines: this.lines, brokenLines: this.brokenLines, tailFragments: this.tailFragments, tooLongLines: this.tooLongLines, unconfirmedTypes: nameRecord<number>() },
      firstResponseIdHashes: [],
```

`src/adapters/codex/parser.ts`(바꾼 뒤 6/6):

```ts
      initialMcpServers: null,
      missing: { lines: this.lines, brokenLines: this.brokenLines, tailFragments: this.tailFragments, tooLongLines: this.tooLongLines, unconfirmedTypes: sortedRecord(this.unconfirmedTypes) },
      firstResponseIdHashes: [],
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex test/adapters/claude/observation.test.ts test/collect/claude.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 8개, 시험 88개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/observation.test.ts src/adapters/claude/observation.ts src/adapters/codex/observation.ts src/adapters/codex/parser.ts
git commit -m "feat: Codex 관측 범위와 MCP 호출 관측을 더함"
```

---

### Task 7: 캐시

**Files:**
- Create: `src/adapters/codex/fingerprints.ts`
- Modify: `src/adapters/codex/parser.ts`
- Modify: `src/adapters/types.ts`
- Modify: `src/state/cache.ts`
- Test: `test/adapters/codex/cache.test.ts`

**Interfaces:**
- Consumes: 과제 5의 `CodexFingerprints`와 `fingerprints()`, 1단계의 캐시(`cacheKeyFor`, `loadCached`, `storeCached`, `CacheEntry`)와 `reviveSummary`.
- Produces: `FingerprintLists`, `CodexCacheExtra`(`fingerprints`, `sharedDigest`), `toLists`, `fromLists`, `unionOf`, `sharedDigest(own, parent)`, `reviveCodexExtra`(`src/adapters/codex/fingerprints.ts`), `CacheEntry.codex`(`src/state/cache.ts`), Codex 요약을 받는 `reviveSummary`(`src/adapters/types.ts`). 과제 8이 쓴다.

설계 9.4, 12.2, 「5단계 계획 전 결정」 7번, 「5단계 1부 계획에서 보완」의 6번이다.

- 요약 되살리기는 Codex 요약을 받는다. Codex 요약은 `codex` 칸이 있어야 하고 Claude Code 요약에는 없어야 한다. 모양이 다르면 없는 것으로 보고 원본을 다시 읽는다. 되살린 요약은 새로 해석한 요약과 JSON 글까지 같아야 해서 해석기는 정체 모를 종류의 기록을 열쇠 차례로 낸다.
- 하위 요약은 기록 파일뿐 아니라 부모 지문에도 기댄다. 해석기는 자기 지문이 부모 지문에 드는지만 보므로, 기록이 그대로이고 "부모 지문 가운데 자기 지문에도 있는 것"이 같으면 요약도 같다. 그래서 캐시 항목에 요약과 함께 자기 지문 목록과 그 겹침을 종류마다 차례로 이어 SHA-256한 값(`sharedDigest`)을 넣는다. 부모가 없으면 겹침이 없는 것과 같다. 부모가 하위와 관계없는 줄을 덧붙여도 하위를 다시 읽지 않는다. 겹침이 같은지는 모으기(과제 8)가 꺼낸 뒤 견준다.
- 캐시 열쇠(경로, 크기, 수정 시각, 앞뒤 4KB 지문, 캐시 형식, 해석 버전, 시간대)는 1단계 그대로다. Codex 항목에 지문 칸이 없거나 모양이 다르면 꺼내지 않고, Claude Code 항목에 지문 칸이 있어도 꺼내지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/codex/cache.test.ts`(새 파일):

```ts
// Codex 세션 요약과 지문을 캐시에 넣고 꺼내는 것을 시험한다. 되살린 요약은 새로 해석한 요약과 JSON 글까지 같고, 하위 요약은 부모 지문 가운데 자기 기록에도 있는 것의 지문(sharedDigest)이 같을 때만 다시 쓴다(설계 9.4, 12.2, 「5단계 계획 전 결정」 7번)
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
    for (const bad of [{ recordId: 1 }, { unknownThreadSource: 5 }, { idFromRecord: "no" }, { unknownItemTypes: { X: "1" } }, { inheritedSkipped: { items: 0, totals: 0 } }]) {
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

  it("sharedDigest는 부모 지문 가운데 자기 지문에도 있는 것에만 기댄다. 부모가 관계없는 지문을 더해도 같고, 겹치는 지문이 바뀌면 다르며, 부모가 없으면 겹침이 없는 것과 같다", () => {
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
    const key = await cacheKeyFor({ path, normPath: path.toLowerCase(), size: Buffer.byteLength(content), mtimeMs: mtime }, "codex@1", "Asia/Seoul");
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

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/adapters/codex/cache.test.ts`
Expected: FAIL. `test/adapters/codex/cache.test.ts`가 `../../../src/adapters/codex/fingerprints.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/adapters/codex/fingerprints.ts`(새 파일):

```ts
// Codex 기록의 지문을 캐시에 넣는 목록으로 바꾸고 되돌리며, 같은 세션의 기록 파일 여럿의 지문을 합치고, 하위 요약이 기대는 부모와의 겹침을 지문 하나(sharedDigest)로 줄인다(설계 9.4, 12.2, 「5단계 계획 전 결정」 7번)
import { createHash } from "node:crypto";
import type { CodexFingerprints } from "./parser.ts";

const KINDS = ["itemIds", "callIds", "totals", "responseIds"] as const;
const PRINT = /^[0-9a-f]{16}$/;
const DIGEST = /^[0-9a-f]{64}$/;

/** 지문을 종류마다 차례로 늘어놓은 목록. 캐시 파일에 그대로 쓴다 */
export type FingerprintLists = Record<(typeof KINDS)[number], string[]>;

/** 캐시의 Codex 칸. 자기 기록의 지문 목록과, 해석할 때 부모 지문 가운데 이 기록에도 있던 것의 지문이다 */
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

/** 한 세션의 기록 파일 여럿의 지문을 합친다. 하위 세션에 부모의 지문으로 넘긴다 */
export function unionOf(list: readonly CodexFingerprints[]): CodexFingerprints {
  const merge = (kind: (typeof KINDS)[number]): Set<string> => new Set(list.flatMap((prints) => [...prints[kind]]));
  return { itemIds: merge("itemIds"), callIds: merge("callIds"), totals: merge("totals"), responseIds: merge("responseIds") };
}

/**
 * 부모 지문 가운데 이 기록의 지문에도 있는 것을 종류마다 차례로 이어 해시한다. 해석기는 자기 지문이 부모 지문에 드는지만 보므로,
 * 기록이 그대로이고 이 값이 같으면 요약도 같다. 부모가 없으면 겹침이 없는 것과 같다
 */
export function sharedDigest(own: CodexFingerprints, parent: CodexFingerprints | null): string {
  const hash = createHash("sha256");
  for (const kind of KINDS) {
    const shared = parent === null ? [] : [...own[kind]].filter((print) => parent[kind].has(print)).sort();
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
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFromRecord: this.idFromRecord, unknownItemTypes: this.unknownItemTypes, inheritedSkipped: { ...this.inheritedSkipped } },
```

`src/adapters/codex/parser.ts`(바꾼 뒤):

```ts
      codex: { recordId: this.ctx.recordId, unknownThreadSource: this.unknownThreadSource, idFromRecord: this.idFromRecord, unknownItemTypes: sortedRecord(this.unknownItemTypes), inheritedSkipped: { ...this.inheritedSkipped } },
```

`src/adapters/types.ts`(찾을 곳 1/4):

```ts

/** 캐시에서 꺼낸 값이 세션 요약의 모양이면 같은 모양(열쇠 차례와 원형 없는 기록까지)으로 되살린다. 모양이 다르면 null이다. */
export function reviveSummary(value: unknown): SessionSummary | null {
```

`src/adapters/types.ts`(바꾼 뒤 1/4):

```ts

/** Codex 요약의 codex 칸을 같은 모양으로 되살린다. 모양이 다르면 null이다 */
function reviveCodex(v: unknown): NonNullable<SessionSummary["codex"]> | null {
  if (!isObject(v) || typeof v.recordId !== "string" || !isNullableString(v.unknownThreadSource) || typeof v.idFromRecord !== "boolean") return null;
  const unknownItemTypes = named(v.unknownItemTypes, (x) => (isNumber(x) ? x : null));
  const skipped = fixed(v.inheritedSkipped, ["items", "totals", "responses"]);
  if (unknownItemTypes === null || skipped === null) return null;
  return { recordId: v.recordId, unknownThreadSource: v.unknownThreadSource, idFromRecord: v.idFromRecord, unknownItemTypes, inheritedSkipped: { items: skipped.items!, totals: skipped.totals!, responses: skipped.responses! } };
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

`src/state/cache.ts`(찾을 곳 1/4):

```ts
// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다(설계 9.4)
import { createHash } from "node:crypto";
```

`src/state/cache.ts`(바꾼 뒤 1/4):

```ts
// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다. Codex 항목은 지문 목록과 부모와의 겹침도 함께 넣고 꺼낸다(설계 9.4, 「5단계 계획 전 결정」 7번)
import { createHash } from "node:crypto";
```

`src/state/cache.ts`(찾을 곳 2/4):

```ts
import { normalizePath } from "../adapters/claude/locate.ts";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";
```

`src/state/cache.ts`(바꾼 뒤 2/4):

```ts
import { normalizePath } from "../adapters/claude/locate.ts";
import { reviveCodexExtra, type CodexCacheExtra } from "../adapters/codex/fingerprints.ts";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";
```

`src/state/cache.ts`(찾을 곳 3/4):

```ts
  bytesRead: number;
}
```

`src/state/cache.ts`(바꾼 뒤 3/4):

```ts
  bytesRead: number;
  /** Codex 항목만. 자기 기록의 지문 목록과, 해석할 때 부모 지문 가운데 이 기록에도 있던 것의 지문 */
  codex?: CodexCacheExtra;
}
```

`src/state/cache.ts`(찾을 곳 4/4):

```ts
    const summary = reviveSummary(entry.summary);
    return summary === null ? null : { key: entry.key, summary, bytesRead: entry.bytesRead };
  } catch {
```

`src/state/cache.ts`(바꾼 뒤 4/4):

```ts
    const summary = reviveSummary(entry.summary);
    if (summary === null) return null;
    if (summary.tool !== "codex") return entry.codex === undefined ? { key: entry.key, summary, bytesRead: entry.bytesRead } : null;
    const codex = reviveCodexExtra(entry.codex);
    return codex === null ? null : { key: entry.key, summary, bytesRead: entry.bytesRead, codex };
  } catch {
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex test/state test/adapters/types.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 15개, 시험 144개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/adapters/codex/cache.test.ts src/adapters/codex/fingerprints.ts src/adapters/codex/parser.ts src/adapters/types.ts src/state/cache.ts
git commit -m "feat: Codex 요약과 지문을 캐시에 넣고 꺼냄"
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
- Consumes: 과제 1의 목록과 사본 묶기, 과제 2의 `readZstdLines`·`zstdAvailable`, 과제 3~5의 해석기와 지문, 과제 7의 캐시와 `sharedDigest`, 1단계의 `readLines`, `mostlyBroken`, `visibleFrom`, `CollectOptions`, `makeWindows`, `maxVersion`.
- Produces: `addDayInto(into, from)`(`src/adapters/types.ts`), `mergeRecords(records)`(`src/adapters/codex/merge.ts`), `CODEX_PARSER_ID`, `CodexCollectOptions`(`zstd`는 시험용), `CodexReadStats`, `CodexCollectResult`, `codexUnreadableCount(read)`, `collectCodex(options)`, `collectCodexFromList(home, list, options)`(`src/collect/codex.ts`). 3부가 평가 입력에 잇는다.

설계 9.2, 9.4, 9.8, 20.1, 「5단계 계획 전 결정」 2·3·7번, 「5단계 1부 계획에서 보완」의 6·7·8번이다.

- 목록은 거르지 않고 받아 정본마다 수집 구간을 가른다(정본의 수정 시각을 모르면 구간에 넣는다. `--rescan`이면 모두 넣는다). 구간 밖의 기록은 열지 않고 센다. 다만 하위 세션의 부모일 때는 지문을 얻으려고 읽고 요약에는 넣지 않는다. 부모는 기록 파일의 식별자와, 대화를 되돌려 생긴 기록이면 이름 앞의 원래 세션 ID(`baseId`)로 찾고, 이름으로 찾은 기록은 읽어서 세션 ID가 맞을 때만 쓴다.
- 기록마다 정본부터 사본 차례로 읽는다. 크기를 보지 못한 사본, 그 Node.js가 풀지 못하는 압축 사본, 열거나 읽지 못한 사본은 다음 사본으로 넘어간다. 어느 사본도 읽지 못하면 정본의 까닭으로 센다(크기를 모름은 읽지 못한 파일과 크기를 모르는 파일, 압축을 풀지 못함은 건너뛴 압축 파일, 그 밖은 읽지 못한 파일). 읽지 않은 사본의 수를 센다(설계 9.2).
- 압축 기록에서 아무것도 풀지 못하면(빈 파일 포함) 읽지 못한 것이고, 일부를 풀었는데 프레임이 잘렸거나 깨졌거나 풀다가 오류가 났으면 일부만 읽은 파일이다. 절반 넘게 깨진 기록은 일부만 읽은 것보다 읽지 못한 파일이 앞선다. 절반 넘게 깨진 기록도 풀린 줄의 숫자는 쓴다(설계 9.8, 20.1, 결정 2).
- 두 번에 나눠 읽는다. 먼저 정본마다 캐시에서 꺼내거나(캐시 열쇠가 맞고 지문 칸이 있을 때) 부모 지문 없이 해석한다. 자기 지문은 부모와 상관없이 정해진다. 그다음 기록마다 부모 지문(부모 세션의 기록 파일들의 지문을 합친 것. 하위가 아니거나 부모 기록이 없으면 없음)과의 `sharedDigest`를 다시 셈해, 해석 때와 다르면 부모 지문을 넣어 다시 읽는다. 부모 기록이 없어진 하위 요약도 다시 읽어 다 센다. 그러면 처음 실행에서 부모와 겹치는 하위 기록만 두 번 읽고, 그다음부터는 캐시를 쓴다. 부모 값은 있는데 부모 기록을 하나도 읽지 못한 하위 세션의 수를 센다.
- 캐시에는 쓰는 중이 아니고 연 동안 바뀌지 않았고 끝까지 읽은 기록만 넣는다(끊긴 압축과 쓰는 중인 파일은 넣지 않는다). 다시 읽다가 읽지 못한 기록은 읽지 못한 파일로 센다.
- 같은 세션 ID의 기록 파일은 하나로 합친다(결정 7). 정체(세션 ID, 주·하위, 부모, 작업 폴더, 지침)와 기록 파일 식별자는 식별자가 세션 ID와 같은 원래 기록에서, 없으면 식별자 차례로 첫 기록에서 가져온다. 날짜 칸(칸 모양 표대로 더하는 `addDayInto`), 빠진 것, 알림의 수, 정체 모를 종류, 이어받아 뺀 수는 더하고, 버전은 가장 높은 것, 가장 이른 날짜는 가장 이른 것이다. 합친 세션의 수를 센다. 작성자 PC에서는 대화를 되돌려 생긴 기록이 원래 기록과 응답·요청·항목 ID가 겹치지 않았다(결정 7의 까닭).
- 결과는 세션마다 가장 앞선 정본의 정규화한 경로 차례이고, 목록의 차례와 상관없이 같다. 읽은 양은 정본의 수와 바이트, 읽은 바이트, 캐시에서 꺼낸 수, 쓰는 중이었던 수, 구간 밖의 수, 읽지 못한 파일(과 그 바이트, 크기를 모르는 수), 읽지 못한 폴더, 건너뛴 압축 파일(과 그 바이트), 일부만 읽은 파일, 읽지 않은 사본, 이름 없는 파일이다. 관측에 넘기는 읽지 못한 것의 수는 읽지 못한 파일과 폴더, 건너뛴 압축 파일, 일부만 읽은 파일을 더한 것이다.

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
    expect(merged.codex).toMatchObject({ recordId: "s1", unknownThreadSource: null, idFromRecord: false });
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

  it("넣은 차례와 상관없이 같은 요약이고, 캐시에서 되살린 것과 JSON 글이 같다(열쇠 차례가 정해져 있다)", () => {
    const a = mergeRecords([ORIGINAL, REVERTED]);
    const b = mergeRecords([REVERTED, ORIGINAL]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(reviveSummary(JSON.parse(JSON.stringify(a))))).toBe(JSON.stringify(a));
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
// Codex 기록 모으기(정본과 다음 사본, 압축 기록과 건너뛴 압축, 끊긴 압축, 읽지 못한 파일, 이어받은 앞부분 빼기, 구간 밖의 부모, 같은 세션의 기록 합치기, 캐시와 그 무효화, 쓰는 중인 파일, 목록의 차례)를 시험한다(설계 9.1~9.4, 9.8, 20.1, 「5단계 계획 전 결정」 2·3·7번)
import { appendFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listCodexFiles } from "../../src/adapters/codex/locate.ts";
import { zstdAvailable } from "../../src/adapters/codex/zstd.ts";
import { codexUnreadableCount, collectCodex, collectCodexFromList, type CodexCollectOptions } from "../../src/collect/codex.ts";

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
async function rollout(n: number, lines: string[], options: { mtimeMs?: number; compressed?: boolean; bytes?: (raw: Buffer) => Buffer } = {}): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const path = join(dir(), `rollout-2026-11-11T12-00-00-${ID(n)}.jsonl${options.compressed ? ".zst" : ""}`);
  const raw = Buffer.from(`${lines.join("\n")}\n`);
  const content = options.compressed ? compress(raw) : raw;
  await writeFile(path, options.bytes ? options.bytes(content) : content);
  const mtime = options.mtimeMs ?? FILE_TIME;
  await utimes(path, mtime / 1000, mtime / 1000);
  return path;
}
/** 대화를 되돌려 생긴 기록. 이름은 rollout-<시각>-<원래 세션>_<새 기록>이다 */
async function reverted(base: number, n: number, lines: string[], options: { mtimeMs?: number } = {}): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const path = join(dir(), `rollout-2026-11-11T13-00-00-${ID(base)}_${ID(n)}.jsonl`);
  await writeFile(path, `${lines.join("\n")}\n`);
  const mtime = options.mtimeMs ?? FILE_TIME;
  await utimes(path, mtime / 1000, mtime / 1000);
  return path;
}
const options = (overrides: Partial<CodexCollectOptions> = {}): CodexCollectOptions => ({ env: {}, homedir: root, clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, cacheDir: join(root, "state", "cache"), rescan: false, ...overrides });
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

  it("절반 넘게 깨진 기록은 읽지 못한 파일로 세고 풀린 줄의 숫자는 쓴다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10), "{x", "{y", "{z"]);
    const result = await collectCodex(options());
    expect(result.read.unreadableFiles).toEqual([path]);
    expect(responses(bySession(result, ID(1)))).toBe(1);
    expect(codexUnreadableCount(result.read)).toBe(1);
  });

  it("정본을 열지 못하고 다른 사본도 없으면 읽지 못한 파일이고, 크기를 모르면 크기를 모르는 파일로도 센다", async () => {
    await mkdir(dir(), { recursive: true });
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const unknown = join(dir(), `rollout-2026-11-11T12-00-00-${ID(2)}.jsonl`);
    const list = {
      sessionsFound: true,
      files: [
        { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false },
        { path: unknown, normPath: unknown.toLowerCase(), size: null, mtimeMs: null, recordId: ID(2), baseId: null, compressed: false },
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
    const listed = await listCodexFiles(join(root, ".codex"), null);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 99, mtimeMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options());
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result.read).toMatchObject({ unreadableFiles: [], skippedCopies: 1 });
    expect(result.read.bytes).toBe((await readFile(zst)).length);
  });

  it("압축 기록만 있으면 풀어 읽는다. 풀 수 없는 Node.js에서는 건너뛴 압축 파일로 세고 그 바이트를 센다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true });
    expect(responses((await collectCodex(options())).summaries[0]!)).toBe(1);
    const skipped = await collectCodex(options({ zstd: false, cacheDir: null }));
    expect(skipped.summaries).toEqual([]);
    expect(skipped.read).toMatchObject({ files: 1, skippedFiles: [path], skippedFileBytes: (await readFile(path)).length, unreadableFiles: [] });
    expect(codexUnreadableCount(skipped.read)).toBe(1);
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
    expect(result.parentRecordMissing).toBe(0);
  });

  it("부모 기록이 없으면 다 세고 부모 기록이 없는 하위 세션으로 센다", async () => {
    await rollout(2, CHILD());
    const result = await collectCodex(options());
    expect(responses(bySession(result, ID(2)))).toBe(2);
    expect(result.parentRecordMissing).toBe(1);
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

  it("부모 기록이 없어지면 캐시의 하위 요약을 쓰지 않고 다시 다 센다", async () => {
    const mom = await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" })]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "UserMessage", id: "u2" })]);
    await collectCodex(options());
    await rm(mom);
    const result = await collectCodex(options());
    expect(Object.values(bySession(result, ID(2)).days)[0]).toMatchObject({ humanRequests: 2 });
    expect(result.parentRecordMissing).toBe(1);
  });

  it("쓰는 중인 기록은 캐시에 넣지 않는다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: NOW - 1000 });
    const first = await collectCodex(options());
    expect(first.read.inProgress).toBe(1);
    expect((await collectCodex(options())).read.fromCache).toBe(0);
  });

  it("목록의 차례와 상관없이 같은 결과다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await rollout(2, [sub(ID(2), ID(1)), record("r1", 10), record("r2", 20)]);
    await rollout(3, [meta(ID(1), { history_base: {} }), record("r9", 5)]);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null);
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
 * 정체(세션 ID, 주·하위, 부모, 작업 폴더, 지침, 처음 목록)와 기록 파일 식별자는 식별자가 세션 ID와 같은 원래 기록에서, 없으면 식별자 차례로 첫 기록에서 가져온다
 * (작업 폴더와 지침은 그 기록에 없으면 식별자 차례로 처음 있는 것). 날짜 칸, 빠진 것, 알림의 수, 정체 모를 종류, 이어받아 뺀 수는 더하고,
 * 버전은 가장 높은 것, 가장 이른 날짜는 가장 이른 것이다. 넣은 요약은 바꾸지 않는다
 */
export function mergeRecords(records: readonly SessionSummary[]): SessionSummary {
  if (records.length === 1) return records[0]!;
  const sorted = [...records].sort(byRecordId);
  const base = sorted.find((summary) => recordIdOf(summary) === summary.sessionId) ?? sorted[0]!;
  const first = <T>(pick: (summary: SessionSummary) => T | null): T | null => pick(base) ?? sorted.map(pick).find((value) => value !== null) ?? null;

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
    if (summary.firstDate !== null && (firstDate === null || summary.firstDate < firstDate)) firstDate = summary.firstDate;
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
    version: maxVersion(sorted.map((summary) => summary.version)),
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
            idFromRecord: sorted.some((summary) => summary.codex?.idFromRecord === true),
            unknownItemTypes: sortedRecord(unknownItemTypes),
            inheritedSkipped,
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
// Codex 기록을 모아 논리 세션마다의 요약과 읽은 양을 낸다. 같은 기록 파일의 사본 가운데 정본 하나를 읽고(읽지 못하면 다음 사본), 압축 기록은 그 Node.js가 풀 수 있을 때만 읽는다. 하위 세션은 부모 기록의 지문으로 이어받은 앞부분을 빼고, 같은 세션의 기록 파일은 합친다. 바뀐 파일만 다시 읽고, 결과는 세션마다 가장 앞선 정본의 정규화한 경로 차례다(설계 8, 9.1~9.4, 9.8, 20.1, 「5단계 계획 전 결정」 2·3·7번)
import { join } from "node:path";
import { makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import { readLines } from "../adapters/common/lines.ts";
import { mostlyBroken } from "../adapters/claude/observation.ts";
import { fromLists, sharedDigest, toLists, unionOf } from "../adapters/codex/fingerprints.ts";
import { codexHome, groupCopies, listCodexFiles, type CodexCopyGroup, type CodexFileList, type CodexLogFile } from "../adapters/codex/locate.ts";
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
}

/** 읽은 양(설계 9.8). 분모는 수집 구간에 걸리는 정본이다. 건너뛴 압축 파일은 읽지 못한 파일과 함께 분자에 넣고, 일부만 읽은 파일이 있으면 비율은 아래 경계다(「5단계 계획 전 결정」 2번) */
export interface CodexReadStats {
  /** 수집 구간에 걸리는 기록 파일(정본)의 수. 크기를 보지 못한 정본도 넣는다 */
  files: number;
  /** 크기를 아는 정본의 바이트를 더한 것 */
  listedBytes: number;
  bytes: number;
  fromCache: number;
  inProgress: number;
  /** 정본의 수정 시각이 수집 구간보다 앞서 열지 않은 기록 파일. 하위 세션의 부모라서 지문만 읽은 것도 든다 */
  olderThanWindow: number;
  /** 크기를 보지 못했거나, 어느 사본도 열거나 읽지 못했거나, 절반 넘게 깨진 기록 파일. 경로 차례다 */
  unreadableFiles: string[];
  /** unreadableFiles 가운데 크기를 아는 정본의 바이트 */
  unreadableFileBytes: number;
  /** 크기를 보지 못한 정본의 수(unreadableFiles에도 들어 있다) */
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
  /** 기록 파일이 둘 이상이라 합친 세션의 수 */
  mergedSessions: number;
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
  /** 이 요약을 낸 해석에서 부모 지문 가운데 이 기록에도 있던 것의 지문 */
  digest: string;
  bytesRead: number;
  fromCache: boolean;
  /** 캐시에 넣어도 되는 읽기다(쓰는 중이 아니고, 연 동안 바뀌지 않았고, 끝까지 읽었다) */
  storable: boolean;
  inProgress: boolean;
  partial: boolean;
  /** 부모 지문으로 다시 읽다가 읽지 못했다 */
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

/** 사본 하나를 해석한다. 열거나 읽지 못하거나, 압축 기록에서 아무것도 풀지 못하면 던진다 */
async function parseCopy(file: CodexLogFile, inherited: CodexFingerprints | null, options: CodexCollectOptions): Promise<Parsed> {
  const parser = new CodexSessionParser({ recordId: file.recordId, timeZone: options.clock.timeZone, inherited });
  const sink = { line: (text: string) => parser.line(text), tooLong: () => parser.tooLong() };
  if (!file.compressed) {
    const outcome = await readLines(file.path, options.clock.nowMs, sink);
    const summary = parser.finish(outcome.tail, outcome.inProgress);
    const stable = outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs;
    return { summary, prints: parser.fingerprints(), bytesRead: outcome.bytesRead, inProgress: outcome.inProgress, partial: false, storable: stable && !outcome.inProgress };
  }
  const outcome = await readZstdLines(file.path, options.clock.nowMs, sink);
  const incomplete = outcome.frames.status !== "complete" || outcome.decodeError !== null;
  if (incomplete && outcome.decodedBytes === 0) throw new Error(outcome.decodeError ?? outcome.frames.status);
  const summary = parser.finish(outcome.tail, outcome.inProgress);
  const stable = outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs;
  return { summary, prints: parser.fingerprints(), bytesRead: outcome.bytesRead, inProgress: outcome.inProgress, partial: incomplete, storable: stable && !outcome.inProgress && !incomplete };
}

/** 기록 파일 하나를 정본부터 차례로 읽는다. 캐시가 맞으면 꺼내고, 아니면 부모 지문 없이 해석한다. 어느 사본도 읽지 못하면 정본의 까닭을 돌려준다 */
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
        if (!options.rescan) {
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
  return collectCodexFromList(home, await listCodexFiles(home, null), options);
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
  const inWindow = groups.filter((group) => lowerBound === null || group.copies[0]!.mtimeMs === null || group.copies[0]!.mtimeMs >= lowerBound);
  // 구간 밖의 기록은 하위 세션의 부모일 때만 지문을 얻으려고 읽는다. 기록 파일 식별자와, 대화를 되돌려 생긴 기록이면 이름 앞의 원래 세션 ID로 찾는다
  const inside = new Set(inWindow);
  const outside = new Map<string, CodexCopyGroup[]>();
  for (const group of groups) {
    if (inside.has(group)) continue;
    for (const key of new Set([group.recordId, ...group.copies.flatMap((copy) => (copy.baseId === null ? [] : [copy.baseId]))])) {
      const found = outside.get(key);
      if (found === undefined) outside.set(key, [group]);
      else found.push(group);
    }
  }

  const read: CodexReadStats = {
    files: inWindow.length,
    listedBytes: inWindow.reduce((sum, group) => sum + (group.copies[0]!.size ?? 0), 0),
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

  // 1. 정본마다 캐시에서 꺼내거나 부모 지문 없이 읽는다. 자기 지문은 부모와 상관없이 정해진다
  const reads: RecordRead[] = [];
  for (const group of inWindow) {
    const result = await readGroup(group, options, zstd, cacheDir);
    if (typeof result !== "string") {
      reads.push(result);
      continue;
    }
    const canonical = group.copies[0]!;
    if (result === "skipped") {
      read.skippedFiles.push(canonical.path);
      read.skippedFileBytes += canonical.size ?? 0;
      continue;
    }
    read.unreadableFiles.push(canonical.path);
    read.unreadableFileBytes += canonical.size ?? 0;
    if (result === "unknown-size") read.unknownSizeFiles++;
  }

  // 2. 하위 세션은 부모 지문 가운데 자기 기록에도 있는 것이 해석 때와 다르면 부모 지문을 넣어 다시 읽는다(「5단계 계획 전 결정」 7번)
  const extra = new Map<CodexCopyGroup, RecordRead | Failure>();
  const parentPrints = new Map<string, CodexFingerprints | null>();
  const printsOf = async (parentId: string): Promise<CodexFingerprints | null> => {
    if (parentPrints.has(parentId)) return parentPrints.get(parentId)!;
    const found = reads.filter((record) => record.summary.sessionId === parentId).map((record) => record.prints);
    for (const old of outside.get(parentId) ?? []) {
      if (!extra.has(old)) extra.set(old, await readGroup(old, options, zstd, cacheDir));
      const result = extra.get(old)!;
      // 이름으로 찾은 기록이라 읽어서 세션 ID가 맞을 때만 쓴다
      if (typeof result !== "string" && result.summary.sessionId === parentId) found.push(result.prints);
    }
    const prints = found.length === 0 ? null : unionOf(found);
    parentPrints.set(parentId, prints);
    return prints;
  };
  const orphans = new Set<string>();
  for (const record of reads) {
    const { summary } = record;
    const parentId = summary.kind === "sub" && summary.parentSessionId !== null && summary.parentSessionId !== summary.sessionId ? summary.parentSessionId : null;
    const parent = parentId === null ? null : await printsOf(parentId);
    if (parentId !== null && parent === null) orphans.add(summary.sessionId);
    const digest = sharedDigest(record.prints, parent);
    if (digest === record.digest) continue;
    try {
      const parsed = await parseCopy(record.file, parent, options);
      Object.assign(record, parsed, { digest, fromCache: false });
    } catch {
      record.failed = true;
    }
  }

  // 3. 읽은 양을 세고 캐시에 넣는다
  const kept: RecordRead[] = [];
  for (const record of reads) {
    if (record.failed) {
      read.unreadableFiles.push(record.canonical.path);
      read.unreadableFileBytes += record.canonical.size ?? 0;
      continue;
    }
    kept.push(record);
    read.bytes += record.bytesRead;
    if (record.fromCache) read.fromCache++;
    if (record.inProgress) read.inProgress++;
    if (mostlyBroken(record.summary)) {
      read.unreadableFiles.push(record.file.path);
      read.unreadableFileBytes += record.canonical.size ?? 0;
    } else if (record.partial) read.partialFiles.push(record.file.path);
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
  const summaries = ordered.map((records) => mergeRecords(records.map((record) => record.summary)));
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
    mergedSessions: ordered.filter((records) => records.length > 1).length,
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/adapters/codex test/collect`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 10개, 시험 113개.

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

`test/commands/doctor.test.ts`(찾을 곳 1/3):

```ts
// aq doctor의 보고(기록 폴더, 세션 파일 수, 상태 폴더에 쓸 수 있는지, 압축 풀기 기능)를 시험한다(설계 6.3, 7.4)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
```

`test/commands/doctor.test.ts`(바꾼 뒤 1/3):

```ts
// aq doctor의 보고(Claude Code와 Codex의 기록 폴더, 세션 파일 수, 상태 폴더에 쓸 수 있는지, 압축 풀기 기능)를 시험한다(설계 6.3, 7.4, 9.1, 9.2)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
```

`test/commands/doctor.test.ts`(찾을 곳 2/3):

```ts
  });
  it("aq doctor는 JSON을 내고 0을 돌려준다", async () => {
```

`test/commands/doctor.test.ts`(바꾼 뒤 2/3):

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
  it("aq doctor는 JSON을 내고 0을 돌려준다", async () => {
```

`test/commands/doctor.test.ts`(찾을 곳 3/3):

```ts
    expect(printed.claudeCode.projectsFound).toBe(false);
  });
```

`test/commands/doctor.test.ts`(바꾼 뒤 3/3):

```ts
    expect(printed.claudeCode.projectsFound).toBe(false);
    expect(printed.codex.sessionsFound).toBe(false);
    expect(Object.keys(printed)).toEqual(["node", "zstd", "claudeCode", "codex", "state"]);
  });
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/doctor.test.ts`
Expected: FAIL. 시험 3개가 실패한다(새 시험 둘과, 보고의 열쇠 차례를 보는 고친 시험 하나). 과제 8까지의 doctor 보고에는 `codex` 칸이 없다. 나머지 셋은 통과한다.

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
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 6개.

- [ ] **Step 5: 묶은 실행 파일을 다시 만든다**

과제 2부터 바뀐 원본을 묶은 실행 파일에 담는다. 원본에서 다시 만들고 손으로 고치지 않는다.

Run: `npm run build`
Expected: `묶음 완료: skills/aq/scripts/aq.mjs`.

- [ ] **Step 6: 커밋한다**

```bash
git add test/commands/doctor.test.ts skills/aq/scripts/aq.mjs src/commands/doctor.ts
git commit -m "feat: aq doctor에 Codex 기록 폴더를 더함"
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
Expected: 타입 검사 통과, 시험 파일 97개·시험 1,387개 통과(4단계까지의 88개·1,290개에 이 계획이 더한 것), `묶음 검사 통과` 다음 마지막 줄이 `버전 검사 통과`. Windows 밖에서는 2단계 1부의 시험 1개를 건너뛴다. 그 Node.js에 zstd가 없으면 압축 기록을 만드는 시험 묶음 둘을 건너뛴다.

- [ ] **Step 2: 묶음을 다시 만들어도 그대로인지 확인한다**

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 3: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS(받은 22가 22.15.0보다 낮으면 압축 기록 시험 묶음 둘을 건너뛴 수만큼 적다). 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 4: 이 PC의 Codex 기록으로 실제로 돌려 본다**

Codex 기록 폴더는 읽기만 한다. 측정 도구는 저장소 밖에 두고, `collectCodex`를 불러 돌리는 작은 스크립트를 esbuild로 묶어 돌린다. 캐시는 OS 임시 폴더의 빈 폴더에 두고 끝나면 지운다. 이 PC의 숫자, 경로, 세션 ID는 저장소 밖 작업 기록에만 둔다.

| 확인 | Expected |
|---|---|
| 수집 구간을 캐시 없이, 같은 캐시로 두 번, 모든 기록을 `--rescan`으로 | 네 번 모두 오류 없이 끝나고 음수 칸이 없다. 풀면 512MB를 넘는 압축 기록도 끝까지 흘려 읽는다. 최대 메모리가 Node.js 기본 한도 안이다 |
| 캐시가 있을 때와 없을 때 | 세션마다의 요약이 모두 같다. 둘째 실행은 모두 캐시에서 꺼낸다. 측정 중에 쓰이고 있던 기록이 있으면 그 세션만 다를 수 있고, 그 수를 센다 |
| 하위 세션과 이어받은 앞부분 | 하위 세션마다 부모 기록을 찾고(부모 기록이 없는 하위 세션의 수를 센다), 이어받아 뺀 항목과 누적값이 있다 |
| 대화를 되돌려 생긴 기록 | 이름 없는 파일이 0이고, 되돌려 생긴 기록이 원래 세션과 합쳐진다 |
| 원본에서 따로 센 값 | 압축하지 않은 기록만 있는 세션 가운데 새 형식(첫 토큰 줄이 `token_usage_record`)인 것은 응답 수(`response_id` 종류), 주 세션의 사람 요청(`UserMessage`), 셸 실행(CommandExecution)이, 하위 세션은 부모 기록에도 있는 ID를 뺀 수가 모으기의 결과와 모두 같다. 순수 옛 형식(`token_usage_record`가 없는) 주 세션은 응답 수(누적값이 직전과 다른 줄)와 입력 토큰 합이 같다. 원본은 줄바꿈(`\n`)에서만 잘라 읽는다. Node.js의 `readline`은 U+2028과 U+2029에서도 줄을 잘라 그런 글자가 든 줄을 깨진 줄로 만든다(「5단계 1부 계획에서 보완」의 10번) |
| `aq doctor` | 홈을 빈 임시 폴더로 주고(`USERPROFILE`과 `HOME`) `CODEX_HOME`만 실제 Codex 기록 폴더로 주어 묶은 실행 파일로 돌리면, 열쇠가 `node`, `zstd`, `claudeCode`, `codex`, `state` 차례이고 `codex.sessionsFound`가 참, 기록 파일이 있으며 읽지 못한 것이 0이다. 상태 폴더는 임시 홈 아래다. 끝나면 임시 홈을 지운다 |

작성자 PC에서 계획 전에 돌린 결과는 위와 같았고, 수집 구간에 16MB를 넘는 도구 결과 줄이 있어 Codex MCP 관측이 「너무 긴 줄」로 빠짐없지 않았다. 이것은 1부의 결함이 아니라 설계 9.8 그대로이고, 3부의 일로 넘긴다(「5단계 1부 계획에서 보완」의 10번).

- [ ] **Step 5: 원장을 고치고 커밋한다**

원장의 5단계 1부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 8에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 1부 구현 결과를 적음"
```

- [ ] **Step 6: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage5-1.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~9의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 이 PC 기록으로 돌린 것의 확인 항목과 맞았는지), 「확인하지 못한 것」이다. 확인하지 못한 것에는 아래를 적는다. 평가 입력·점수·결과 화면에 Codex가 들어가는 것(3부), Codex 셋팅(2부), macOS와 Linux의 Codex 기록 폴더, Node.js 22.15.0보다 낮은 Node.js에서 건너뛴 압축 파일이 실제로 분자에 드는 것(이 PC에 그 버전이 없으면), 작성자 PC에 없던 Codex 버전과 형식. 이 PC의 숫자, 경로, 이름은 넣지 않는다.

```bash
git push -u origin 5단계-1부-Codex-기록-읽기
gh pr create --base develop --head 5단계-1부-Codex-기록-읽기 --title "feat: 5단계 1부 Codex 기록 읽기" --body-file "$TEMP/aq-pr-stage5-1.md"
```

- [ ] **Step 7: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(5단계 1부 구현 전용, 정독과 실행이 다 무거우므로 둘) 다음을 나눠 맡긴다. 한 짝은 정독이다. 설계 9.1~9.4, 9.6~9.8, 20.1, 「5단계 계획 전 결정」과 「5단계 1부 계획에서 보완」을 이 계획의 코드와 대조하고, 시험이 놓치는 그럴듯한 틀린 구현(넘어가는 자리의 견줌, 누적값이 줄 때, 턴의 층 고르기, 이어받은 것의 기준 옮기기, 다음 사본, 압축의 판정, 캐시의 겹침 지문, 합치기의 정체)을 반례로 찾는다. 다른 짝은 실행이다. `npm run check`와 Node.js 22를 다시 돌리고, 임시 폴더에 만든 합성 기록과 이 PC의 Codex 기록(읽기만)으로 Step 4를 자기 방법으로 재현한다. 두 짝에게 서로의 결론을 미리 알려 주지 않는다. 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 5단계-1부-Codex-기록-읽기 --body-file "$TEMP/aq-pr-stage5-1.md"`).

- [ ] **Step 8: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 5단계-1부-Codex-기록-읽기 --merge --subject "feat: 5단계 1부 Codex 기록 읽기를 develop에 병합"
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
| Codex 알림. 정체 모를 `thread_source`(값별), 정체 모를 실행 층 종류(종류별), 부모 기록이 없는 하위 세션, 합친 세션, 읽지 않은 사본, 이름 없는 파일, 건너뛴 압축 파일(22.15.0과 23.8.0 안내), 일부만 읽은 파일, 확인하지 않은 Codex 버전 | 3부 | `parentRecordMissing`, `mergedSessions`, `skippedCopies`, `unnamedFiles`, `codex.unknownThreadSource`, `codex.unknownItemTypes`, `VERIFIED_VERSIONS.codex` |
| 너무 긴 줄의 앞부분에서 맨 바깥 종류를 읽어 상관없는 줄을 가르는 것. 작성자 PC에서 Codex 도구 결과 줄이 16MB를 넘은 적이 있어 그 기록이 수집 구간에 있는 동안 Codex MCP 관측이 막혔다. 줄 나누기와 1단계의 관측에도 걸리는 일이다 | 3부 | 「5단계 1부 계획에서 보완」의 10번 |
| 정체 모를 실행 층 종류(`SubAgentActivity`, `CollabAgentToolCall`, `Plan`)와 호출 층의 `tool_search_call`을 도구로 볼지. Codex 규칙의 셈(E1의 토큰 식, I3의 굵기, 옛 형식의 셸이 이름 모름으로 드는 것) | 3부 | 「5단계 1부 계획에서 보완」의 2·4번 |
| 결과 화면의 Codex 색 확정 | 3부 | `TOOL_COLORS.codex`(임시) |
| Codex 매니페스트 둘, 버전 검사, 산출물, Codex에서 스킬이 도는지 | 4부 | 없음 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 9.1 | `CODEX_HOME` 또는 `~/.codex`, `sessions/<연>/<월>/<일>/`의 `rollout-*.jsonl`과 `.jsonl.zst` | 1 |
| 9.2 | 기록 파일의 식별자와 세션 ID를 나눔, 정본 하나(압축하지 않은 것, 늦은 수정 시각, 경로), 읽지 못하면 다음 사본, 건너뛴 사본의 수, 주·하위·정체 모름, 부모 기록이 없는 세션 | 1, 3, 8 |
| 9.3 | 날짜별 요약, 가장 이른 날짜, 날짜를 몰라 세지 못한 줄 | 3, 4 |
| 9.4 | 파일마다의 캐시, 쓰는 중인 파일, 캐시가 있을 때와 없을 때 같음 | 7, 8 |
| 9.6 | 토큰 구간과 넘어가는 자리, 도구 두 층과 턴마다 큰 층, 실행 층 종류 표, 그 밖의 것 | 3, 4 |
| 9.7 | Codex의 관측 범위 | 6 |
| 9.8, 20.1 | 읽은 양(분모는 정본, 읽지 못한 파일과 폴더, 건너뛴 압축, 일부만 읽은 파일, 깨진 줄, 너무 긴 줄, 끝 조각), 절반 넘게 깨진 파일, MCP 관측의 사용 신호가 될 수 없는 종류 | 6, 8 |
| 「5단계 계획 전 결정」 1번 | `thread_source`로 주·하위·정체 모름 | 3 |
| 2번 | zstd를 풀 수 있는지로 가림, 건너뛴 압축은 분자, 일부만 읽은 파일은 아래 경계(결과에 잇는 것은 3부) | 2, 8 |
| 3번 | 수정 시각을 모르는 사본은 뒤에 | 1 |
| 4~6번 | S2, F4·F6, F5 | 2부·3부 |
| 7번 | 기록 파일 ID와 세션 ID, 같은 세션 합치기, 이어받은 앞부분을 다시 세지 않음(지문, 캐시, 기억 양) | 3, 5, 7, 8, Task 10 Step 4 |
| 「5단계 1부 계획에서 보완」 1~10번 | 여러 프레임(1), 옛 형식의 관측(2), MCP 관측의 종류(3), 새 종류(4), 시각 없는 줄(5), 이어받은 것과 캐시(6), 되돌려 생긴 기록과 합치기(7), 다음 사본과 압축 판정(8), 1부의 범위(9), 너무 긴 줄과 실측 도구(10) | 2(1·8), 6(2·3·9), 4(4), 3·4(5), 5·7·8(6), 1·8(7), 8(8), Task 10(10) |

1부에 넣지 않은 것은 「2부, 3부와 그 뒤에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드가 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`2d0de19`)에서 과제 1부터 9까지 차례대로 만들었다(Windows 11, Node.js 24.18). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1~9는 시험만 놓고 돌리면 실패하고(실패한 시험의 수와 파일을 시험 커밋마다 따로 세어 과제의 Expected와 맞는지 봤다), 구현을 놓으면 그 과제의 확인 명령(타입 검사와 관계있는 시험)이 통과했다. 과제 9의 묶은 실행 파일 다시 만들기도 통과했다. 과제 9 뒤의 `npm run check`는 시험 파일 97개·시험 1,387개가 통과했고 `묶음 검사 통과`와 `버전 검사 통과`였다. 다시 묶어도 묶은 실행 파일은 달라지지 않았다. 다 만든 복제본의 코드와 시험 파일 246개는 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다(문서와 원장은 견주지 않았다).

연습 작업 폴더에서 따로 확인한 것은 이렇다. 그럴듯한 틀린 구현 60개를 하나씩 넣어 모두 시험이 잡았다. 목록 여섯(두 UUID 이름에서 앞 UUID를 식별자로, 끝 UUID 앞의 밑줄을 받지 않음, 크기를 보지 못한 파일을 버림, 압축본을 정본으로 앞세움, 수정 시각을 모르는 사본을 앞세움, 날짜 폴더 자리의 파일을 세지 않음), 압축 넷(프레임을 나누지 않고 한 번에 풂, 블록 머리 앞에서 잘린 끝 프레임을 완결로, 건너뛸 수 있는 프레임을 깨짐으로, 체크섬을 세지 않음), 해석 스물(넘어가는 자리를 견주지 않음, 누적값이 줄면 차분으로, 같아도 셈, 하위 세션 값 하나를 빠뜨림, 정체 모름을 하위로, 앞선 버전 꼬리를 떼지 않음, 셸 종료 코드 0을 오류로, 상태를 보지 않는 종류도 결과로, 이름 모름의 호출을 더하지 않음, 도구가 아닌 종류를 정체 모름으로, 정체 모를 종류를 세지 않음, 이어받은 항목·누적값·응답·호출 층 호출을 셈, 뺀 항목을 자기 지문에 넣지 않음, 시각 없는 줄이 앞 줄의 날짜를 쓰지 않음, 강도 없음을 세지 않음, 지침 크기를 마지막 것으로, 깨진 줄의 종류를 읽지 않음), 관측 다섯(사용 신호의 종류를 상관없는 것으로 둘, `response_item`을 사용 신호로 되돌림, 너무 긴 줄을 까닭으로 보지 않음, 덮는 범위의 칸 하나를 바꿈), 캐시와 되살리기 여섯(겹침 지문을 부모 지문 전부로, 지문 꼴을 보지 않음, 지문 칸이 없어도 꺼냄, Claude Code 요약의 `codex` 칸을 받음, 되살린 요약에서 `codex` 칸을 뺌, 정체 모를 종류를 들어온 차례로 냄), 합치기 넷(같은 날의 수를 덮어씀, 원래 기록 대신 첫 기록의 정체, 버전과 가장 이른 날짜를 원래 기록의 것으로), 모으기 열셋(부모 지문으로 다시 읽지 않음, 다음 사본을 읽지 않음, 같은 세션을 합치지 않음, 끊긴 압축과 쓰는 중인 파일을 캐시에 넣음, 구간 밖의 부모를 읽지 않음, 이름으로 찾은 부모의 세션 ID를 견주지 않음, 건너뛴 압축을 읽지 못한 파일로, 일부만 읽은 파일을 읽지 못한 파일로, 절반 넘게 깨진 기록을 세지 않음, 읽지 않은 사본을 세지 않음, 부모 기록이 없어도 캐시의 하위 요약을 씀, 관측에 건너뛴 압축을 넣지 않음), doctor 둘(기록 파일을 사본까지 셈, 사본 하나라도 압축이면 압축본만으로)이다. 처음에는 57개를 잡았다. 블록 머리 3바이트 가운데서 잘린 끝 프레임, 이어받은 호출 층 호출, 원래 기록보다 다른 기록이 이른 합치기를 시험이 지나지 않아 시험 셋(어느 자리에서 잘라도 잘림, 이어받은 호출로 이름 모름이 생기지 않음, 가장 이른 날짜는 다른 기록의 것이어도 가장 이른 것)을 더했다.

이 PC의 Codex 기록(읽기만, 캐시는 임시 폴더)으로 Task 10 Step 4를 미리 돌렸다. 수집 구간과 모든 기록(`--rescan`) 모두 오류 없이 끝났고 음수 칸이 없었다. 풀면 512MB를 넘는 압축 기록도 끝까지 흘려 읽었고 최대 메모리는 Node.js 기본 한도 안이었다. 캐시가 있을 때와 없을 때 세션마다의 요약이 모두 같았고(측정 중에 바뀐 기록은 없었다), 둘째 실행은 모두 캐시에서 꺼냈다. 하위 세션마다 부모 기록을 찾았고 이어받아 뺀 항목과 누적값이 있었다. 대화를 되돌려 생긴 기록이 원래 세션과 합쳐졌고 이름 없는 파일이 없었다. 원본에서 따로 센 값(압축하지 않은 새 형식 세션의 응답, 주 세션의 사람 요청, 셸 실행과, 순수 옛 형식 주 세션의 응답과 입력 토큰)이 모두 같았다. 묶은 실행 파일의 `aq doctor`도 임시 홈에서 Expected대로였고 상태 폴더는 임시 홈 아래에만 생겼다.

미리 돌리며 찾아 고친 것은 둘이다. 되돌려 생긴 기록의 이름(`rollout-<시각>-<UUID1>_<UUID2>`)을 처음 이름 꼴이 받지 않아 그 기록이 이름 없는 파일로 빠졌다(「5단계 1부 계획에서 보완」 7번. 과제 1과 8을 고쳤다). 원본에서 따로 센 값과 셸 실행이 어긋나 보인 것은 대조 도구가 Node.js의 `readline`으로 읽어 U+2028·U+2029에서 줄이 잘린 탓이었다(10번. 제품의 줄 나누기는 맞았고, 대조 도구를 줄바꿈에서만 자르게 고쳤다).

확인하지 못한 것은 이렇다. Node.js 22에서 돌리는 것은 Task 10 Step 3에서 한다. zstd가 없는 Node.js의 실제 실행은 시험용 선택(`zstd: false`)으로만 봤다. macOS와 Linux의 Codex 기록 폴더, 작성자 PC에 없던 Codex 버전(0.148~0.153, 0.166보다 새 것)과 형식, 작성자 PC에 하나뿐이던 되돌려 생긴 기록 밖의 꼴은 보지 않았다. 원본에서 따로 센 값은 압축하지 않은 기록만 있는 세션이었다(압축본만 있는 세션은 대조 도구가 풀지 않았다).
