# AQ 점검 5단계 4부 — 결과 조립·문구·결과 화면에 Codex 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 이 PC의 기록과 셋팅으로 돌려 보기, 결과 화면 확인으로 검증한다.

**Goal:** 5단계 3부가 평가에 넣은 Codex를 결과에 잇는다. 결과의 읽은 양이 Codex의 건너뛴 압축 파일과 일부만 읽은 파일을 세고, Codex의 기록 쪽·셋팅 쪽 알림과 정밀 점검 단서를 내며, S2와 대신 본 값의 문장이 두 도구를 말하고, 결과 화면의 Codex 색을 확정한다.

**Architecture:** 수집 결과에 Codex만의 칸(`CollectedTool.codex`)을 두어 읽은 양(`src/core/result/coverage.ts`)과 기록 쪽 알림(`src/core/result/notices.ts`)이 쓴다. 셋팅 쪽 알림과 단서(`src/core/result/hints.ts`)는 Codex의 셋팅 사실로 Claude Code와 같은 꼴을 낸다. 규칙 문장(`src/core/copy/findings.ts`)은 도구별 안전장치와 도구별 값의 관측 범위로 줄을 더한다. 입력 묶음(`src/commands/checkup-input.ts`)은 이어받은 것을 확인하지 못한 세션이 있으면 Codex의 관측 범위를 낮춘다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 끝의 「5단계 4부 계획 전 결정」(1~12번)과, 그것이 기대는 9.2, 9.7, 9.8, 12.2, 13.1, 17, 20.1, 「5단계 계획 전 결정」 1·2·3·7번, 「5단계 3부 계획 전 결정」 5·13번을 구현한다.

## 5단계 4부의 범위

| 넣는 것 | 넣지 않는 것(그 부) |
|---|---|
| 읽은 양의 Codex 몫(건너뛴 압축 파일, 일부만 읽은 파일), Codex의 기록 쪽 알림(읽지 못한 기록, MCP 관측, 분류하지 못한 것, 새 알림 아홉), 이어받은 것을 확인하지 못한 세션의 대신 봄, Codex의 셋팅 쪽 알림, 정밀 점검 단서의 Codex 몫과 두 도구 단서, S2의 두 도구 문장, 대신 본 값과 I3의 굵기의 줄, Codex 색의 확정, 묶은 실행 파일 다시 만들기 | Codex 플러그인(매니페스트 둘, 버전 검사, 산출물, Codex에서 스킬이 도는지)은 5부. Codex 정비(6단계), `aq deep-hints`와 세션 시작 알림(7단계). 스킬 본문은 바꾸지 않는다(결정 10) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- 두 도구의 기록과 셋팅, 홈의 `.agents`, 프로젝트 폴더는 읽기만 한다. 점검이 쓰는 곳은 상태 폴더(`~/.chunsik-garage`)와 OS의 임시 폴더뿐이다(설계 19.2).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더의 기록과 셋팅을 읽지 않고 임시 폴더에 만든 홈과 프로젝트만 쓴다(설계 21.1). 파일 링크를 만들 수 없는 Windows에서는 그 시험을 건너뛴다.
- 설정의 값(환경 변수, 머리말, 주소의 질의, 토큰)과 지침·스킬의 글은 결과에 싣지 않는다. 알림의 문장에는 이름과 경로를 넣지 않는다(설계 10, 12.2, 19.1).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `5단계-4부-결과와-문구에-Codex` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증의 필수는 제품 결함과 수용 조건 미충족뿐이다(사용자 지시 2026-11-16).
- 결과 화면은 데스크톱·태블릿·휴대폰 폭의 실제 화면으로 확인한다. 화면 확인은 이고라이트로 하고 Playwright와 DevTools는 쓰지 않는다(사용자 전역 지침).
- 이 PC의 기록과 셋팅에서 본 이름, 경로, 값, 개수는 저장소와 병합 요청에 넣지 않는다(설계 머리말). 이 PC로 돌린 도구와 결과, 화면 사진은 저장소 밖에 둔다.

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `B2A2A73957A43BFB8F5B6AABB39D82D7359BA8F6B6122632A4A5D121987207F8`, 4,428줄)이다. 설계 끝에 「5단계 4부 계획 전 결정」(열두 가지)을 더하고, 27절의 「Codex 평가의 한계」에 대신 봄의 굵기와 두 도구 단서의 기준을 더했다. 연습 작업 폴더에서 구현하다가 결정 2번에 건너뛴 압축 파일의 그림 고르기를 더했다. 계획 리뷰 1차에서 결정 3·6·7번을 고치고 설계 끝에 「5단계 4부 계획 리뷰 1차에서 보완」을 더했다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/core/result/tools.ts`, `src/core/result/coverage.ts`, `src/core/result/notices.ts`, `src/core/result/summary.ts`, `src/core/copy/notices.ts`, `src/adapters/claude/observation.ts`, `src/commands/checkup-input.ts`, `src/report/view.ts`(고침) | 1 | 수집 결과의 Codex 몫, 읽은 양, 기록 쪽 알림과 그 문장, 요약의 알림, 관측 까닭 `not-recorded`, 대신 봄으로 낮추기, 그림 고르기 |
| `src/core/result/notices.ts`, `src/core/copy/notices.ts`, `src/core/result/hints.ts`(고침) | 2 | 셋팅 쪽 알림의 Codex 몫과 그 문구, 정밀 점검 단서의 Codex 몫과 두 도구 단서 |
| `src/core/copy/types.ts`, `src/core/copy/common.ts`, `src/core/copy/rules-setup.ts`, `src/core/copy/findings.ts`, `src/core/result/observed.ts`, `src/core/result/assemble.ts`(고침) | 3 | S2의 두 도구 문장과 도구별 처방, 안전장치 줄의 Codex 조건, 대신 본 값과 I3의 굵기의 줄, 합침 규칙을 잰 도구 |
| `src/report/html.ts`(고침), `skills/aq/scripts/aq.mjs`(다시 만듦) | 4 | Codex 색을 확정한 까닭, 묶은 실행 파일 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다. 과제 4는 시험이 없어 주석을 고치고 묶음을 다시 만든 뒤 전체 검사를 돌리고 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/2`처럼 차례가 붙고 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 1부터 원본이 바뀌어 묶음 검사가 어긋나므로, 과제 4의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 묶은 실행 파일을 다시 만든 뒤 과제 4에서 돌린다.
- 시험은 임시 폴더에 만든 홈과 프로젝트로 본다. 이 PC의 실제 기록과 셋팅에서 맞는지와 결과 화면은 시험으로 보증하지 않으므로 마지막 과제에서 돌려 보고 실제 화면으로 본다.

---

### Task 1: 읽은 양과 기록 쪽 알림에 Codex

**Files:**
- Modify: `test/commands/checkup-input.test.ts`
- Modify: `test/core/copy-notices.test.ts`
- Modify: `test/core/result-coverage.test.ts`
- Modify: `test/core/result-notices-record.test.ts`
- Modify: `test/core/result-notices-setup.test.ts`
- Modify: `test/core/result-summary.test.ts`
- Modify: `test/report/view.test.ts`
- Modify: `src/adapters/claude/observation.ts`
- Modify: `src/commands/checkup-input.ts`
- Modify: `src/core/copy/notices.ts`
- Modify: `src/core/result/coverage.ts`
- Modify: `src/core/result/notices.ts`
- Modify: `src/core/result/summary.ts`
- Modify: `src/core/result/tools.ts`
- Modify: `src/report/view.ts`

**Interfaces:**
- Consumes: 5단계 1부의 `CodexCollectResult`와 `CodexReadStats`(`src/collect/codex.ts`), 세션 요약의 `codex` 칸(`unknownThreadSource`, `unknownItemTypes`, `src/adapters/types.ts`), `CODEX_COVERAGE`(`src/adapters/codex/observation.ts`). 5단계 3부의 입력 묶음(`gatherCheckupInput`), 결과 조립(`recordNotices`, `resultCoverage`, `checkupSummary`), 결과 화면의 자료(`reportView`).
- Produces: `CollectedCodex`와 `CollectedTool.codex`(Codex만 있다, `src/core/result/tools.ts`), 관측 까닭 `not-recorded`(`src/adapters/claude/observation.ts`), 새 알림 아홉 가지(`record_skipped`, `record_partial`, `unverified_inheritance`, `id_fallbacks`, `parent_record_missing`, `merged_sessions`, `unknown_mtime_sessions`, `skipped_copies`, `unnamed_files`)와 그 문장, 알림의 차례(`NOTICE_KINDS`), 요약의 알림. 과제 2가 셋팅 쪽 알림을 같은 꼴로 더한다.

설계 「5단계 4부 계획 전 결정」 2·3·4번이다.

- 읽은 양(결정 2). 건너뛴 압축 파일은 읽지 못한 파일과 함께 읽지 못한 비율의 분자에 넣고(파일 수와 바이트. 분모에는 이미 있다), 일부만 읽은 파일이 있으면 비율을 아래 경계로 보아 "일부만 읽었다" 띠를 띄운다. `coverage`의 `partialFiles`와 `skippedFiles`에 수를 싣는다. 결과 화면은 건너뛴 압축 파일도 읽지 못한 기록처럼 그림을 고른다.
- 수집 결과의 Codex 몫은 `codex` 칸 하나에 모으고 Claude Code에는 두지 않는다. 시험이 짓는 수집 결과를 모두 고치지 않으려는 것이고, 칸이 없으면 Codex만의 것이 없는 것이다.
- 기록 쪽 알림(결정 3). 읽지 못한 기록과 MCP 관측이 빠진 것을 Codex도 같은 꼴로 낸다. 스킬 사용은 Codex가 기록하지 않아(까닭 `not-recorded`) 알리지 않는다. 분류하지 못한 것에 Codex의 정체 모를 `thread_source`(세션마다)와 실행 층 종류(종류마다)를 더하고 문장에는 수만 넣는다. 새 알림 아홉은 수와 정해진 값만 문장에 넣고, 경로는 건너뛴 압축 파일과 일부만 읽은 파일의 자료에만 싣는다. 세션 ID를 대신 쓴 기록의 문장은 까닭(첫 줄을 읽지 못함, 첫 줄이 세션 머리가 아님, 세션 ID가 없음, 줄이 없음)과 상관없이 맞게 "첫 줄에서 세션 ID를 얻지 못했다"로 쓴다(계획 리뷰 1차).
- 대신 봄(결정 4). 이어받은 것을 확인하지 못한 세션이 하나라도 있으면 입력 묶음이 그 점검의 Codex 관측 범위에서 응답과 토큰, 도구 호출, 도구 오류, 셸 명령의 종료 코드를 대신 봄으로 낮춘다. 점수 계산은 못 봄만 빼므로 바뀌지 않는다.
- 시험은 임시 홈에 부모 기록이 없는 Codex 하위 세션을 만들어 이어받은 것을 확인하지 못한 세션을 짓는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup-input.test.ts`(찾을 곳 1/3):

```ts
}
const options = (overrides: Partial<CheckupInputOptions> = {}): CheckupInputOptions => ({
  env: {},
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 1/3):

```ts
}
/** 부모 기록이 없는 Codex 하위 세션 하나 */
async function codexSubSession(cwd: string, parent: string): Promise<void> {
  const dir = join(home, ".codex", "sessions", "2026", "11", "11");
  await mkdir(dir, { recursive: true });
  const id = "019a0000-0000-7000-8000-000000000002";
  const path = join(dir, "rollout-2026-11-11T13-00-00-" + id + ".jsonl");
  const usage = { input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: 11 };
  const lines = [codexLine("session_meta", { id, cwd, cli_version: "0.166.0", thread_source: "subagent", parent_thread_id: parent }), codexLine("token_usage_record", { response_id: "r2", usage, thread_token_usage: usage })];
  await writeFile(path, lines.join("\n") + "\n");
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
}
const options =(overrides: Partial<CheckupInputOptions> = {}): CheckupInputOptions => ({
  env: {},
```

`test/commands/checkup-input.test.ts`(찾을 곳 2/3):

```ts
    expect(tools.map((tool) => tool.tool)).toEqual(["claude-code", "codex"]);
    expect(tools[1]).toMatchObject({ detected: true, overlappingSessions: 0, observation: { skills: { complete: false, reasons: [] }, mcp: { complete: true, reasons: [] } } });
    expect(Object.keys(tools[1]!.read).sort()).toEqual(Object.keys(tools[0]!.read).sort());
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 2/3):

```ts
    expect(tools.map((tool) => tool.tool)).toEqual(["claude-code", "codex"]);
    expect(tools[1]).toMatchObject({ detected: true, overlappingSessions: 0, observation: { skills: { complete: false, reasons: ["not-recorded"] }, mcp: { complete: true, reasons: [] } } });
    expect(Object.keys(tools[1]!.read).sort()).toEqual(Object.keys(tools[0]!.read).sort());
```

`test/commands/checkup-input.test.ts`(찾을 곳 3/3):

```ts

  it("프로젝트 목록은 두 도구의 주 세션의 작업 폴더로 만들고, 두 스캐너에 같은 목록을 준다", async () => {
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 3/3):

```ts

  it("Codex만 내는 수집 결과(건너뛴 압축 파일, 일부만 읽은 파일, 기록을 묶으며 센 것)를 따로 싣는다. Claude Code에는 없다(설계 「5단계 4부 계획 전 결정」 2·3번)", async () => {
    const { tools, collected } = await gatherCheckupInput(options());
    expect(tools[0]!.codex).toBeUndefined();
    expect(tools[1]!.codex).toEqual({
      skippedFiles: collected.codex.read.skippedFiles,
      skippedFileBytes: collected.codex.read.skippedFileBytes,
      partialFiles: collected.codex.read.partialFiles,
      skippedCopies: 0,
      unnamedFiles: 0,
      parentRecordMissing: 0,
      mergedSessions: 0,
      unknownMtimeSessions: 0,
      unverifiedInheritance: 0,
      idFallbacks: {},
    });
  });

  it("이어받은 것을 확인하지 못한 세션이 있으면 그 점검의 Codex 응답과 토큰, 도구 오류, 셸 명령의 종료 코드를 대신 봄으로 낮춘다(설계 「5단계 4부 계획 전 결정」 4번)", async () => {
    expect((await gatherCheckupInput(options())).input.tools[1]!.coverage).toEqual(CODEX_COVERAGE);
    await codexSubSession(other, "019a0000-0000-7000-8000-0000000000ff");
    const { input, tools } = await gatherCheckupInput(options());
    expect(tools[1]!.codex).toMatchObject({ parentRecordMissing: 1, unverifiedInheritance: 1 });
    expect(input.tools[1]!.coverage).toEqual({ ...CODEX_COVERAGE, responsesAndTokens: "proxy", toolCalls: "proxy", toolErrors: "proxy", shellExitCodes: "proxy" });
  });

  it("프로젝트 목록은 두 도구의 주 세션의 작업 폴더로 만들고, 두 스캐너에 같은 목록을 준다", async () => {
```

`test/core/copy-notices.test.ts`(찾을 곳 1/6):

```ts
// 평가 결과의 알림 열세 종류의 문장을 본다. 두 언어로 만들고, 수와 정해진 값만 넣고 이름과 경로는 넣지 않는다(설계 12.2, 19.1, 20.1)
import { describe, expect, it } from "vitest";
```

`test/core/copy-notices.test.ts`(바꾼 뒤 1/6):

```ts
// 평가 결과의 알림 스물두 종류의 문장을 본다. 두 언어로 만들고, 수와 정해진 값만 넣고 이름과 경로는 넣지 않는다(설계 12.2, 19.1, 20.1)
import { describe, expect, it } from "vitest";
```

`test/core/copy-notices.test.ts`(찾을 곳 2/6):

```ts

/** 알림 열세 종류. 경로와 이름에는 secret을 넣어 문장에 새지 않는지 본다 */
const ALL: Notice[] = [
```

`test/core/copy-notices.test.ts`(바꾼 뒤 2/6):

```ts

/** 알림 스물두 종류. 경로와 이름에는 secret을 넣어 문장에 새지 않는지 본다 */
const ALL: Notice[] = [
```

`test/core/copy-notices.test.ts`(찾을 곳 3/6):

```ts
  { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl", "/secret/b.jsonl"], dirs: ["/secret/dir"] },
  { kind: "observation_incomplete", tool: "claude-code", metric: "skills", reasons: ["unreadable-files", "too-long-lines"] },
```

`test/core/copy-notices.test.ts`(바꾼 뒤 3/6):

```ts
  { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl", "/secret/b.jsonl"], dirs: ["/secret/dir"] },
  { kind: "record_skipped", tool: "codex", files: ["/secret/a.jsonl.zst"] },
  { kind: "record_partial", tool: "codex", files: ["/secret/p.jsonl.zst", "/secret/q.jsonl.zst"] },
  { kind: "observation_incomplete", tool: "claude-code", metric: "skills", reasons: ["unreadable-files", "too-long-lines"] },
```

`test/core/copy-notices.test.ts`(찾을 곳 4/6):

```ts
  { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
  { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:odd", count: 2 }, { what: "denial:other", count: 1 }, { what: "hook:x", count: 4 }] },
  { kind: "orphan_subsessions", tool: "claude-code", sessions: 1 },
];
const numbers = (text: string): string[] => (text.match(/\d+(?:\.\d+)*/g) ?? []).sort();
```

`test/core/copy-notices.test.ts`(바꾼 뒤 4/6):

```ts
  { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
  { kind: "unverified_inheritance", tool: "codex", sessions: 2 },
  { kind: "id_fallbacks", tool: "codex", counts: [{ why: "first-line-unreadable", count: 2 }, { why: "no-lines", count: 1 }] },
  { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:odd", count: 2 }, { what: "denial:other", count: 1 }, { what: "hook:x", count: 4 }] },
  { kind: "orphan_subsessions", tool: "claude-code", sessions: 1 },
  { kind: "parent_record_missing", tool: "codex", sessions: 1 },
  { kind: "merged_sessions", tool: "codex", sessions: 3 },
  { kind: "unknown_mtime_sessions", tool: "codex", sessions: 1 },
  { kind: "skipped_copies", tool: "codex", count: 4 },
  { kind: "unnamed_files", tool: "codex", count: 1 },
];
const of = (kind: Notice["kind"]): Notice => ALL.find((notice) => notice.kind === kind)!;
const numbers = (text: string): string[] => (text.match(/\d+(?:\.\d+)*/g) ?? []).sort();
```

`test/core/copy-notices.test.ts`(찾을 곳 5/6):

```ts
describe("알림의 문장", () => {
  it("열세 종류를 모두 담았다", () => {
    expect(ALL.map((notice) => notice.kind)).toEqual(NOTICE_KINDS);
```

`test/core/copy-notices.test.ts`(바꾼 뒤 5/6):

```ts
describe("알림의 문장", () => {
  it("스물두 종류를 모두 담았다", () => {
    expect(ALL.map((notice) => notice.kind)).toEqual(NOTICE_KINDS);
```

`test/core/copy-notices.test.ts`(찾을 곳 6/6):

```ts
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
```

`test/core/copy-notices.test.ts`(바꾼 뒤 6/6):

```ts
  it("수와 정해진 값을 끼운다", () => {
    expect(noticeText(of("score_withheld"), "ko")).toBe("AQ를 내지 않았습니다. 점수 구간의 사람 요청이 20개에 못 미칩니다. 점수 구간에 쓴 날이 3일에 못 미칩니다.");
    expect(noticeText(of("record_unreadable"), "ko")).toBe("Claude Code 기록 가운데 읽지 못한 파일 2개와 폴더 1개가 있습니다. 읽은 것만으로 계산했습니다.");
    expect(noticeText(of("record_unreadable"), "en")).toBe("Claude Code: 2 files and 1 folder of records could not be read. Only what was read is counted.");
    expect(noticeText(of("observation_incomplete"), "ko")).toBe("Claude Code의 스킬 사용 기록을 빠짐없이 읽지 못해(읽지 못한 파일, 너무 긴 줄) 안 쓰는 것을 판정하지 않았습니다.");
    expect(noticeText(of("setup_unreadable"), "ko")).toBe("Claude Code에서 읽지 못한 셋팅이 있습니다(프로젝트 설정 2곳). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] }, "ko")).toBe("Claude Code에서 읽지 못한 셋팅이 있습니다(.claude.json). 읽은 것만으로 계산했습니다.");
    expect(noticeText(of("version_unverified"), "ko")).toBe("Claude Code 기록에 확인한 범위(2.1.220~2.1.322) 밖의 버전이 1개 있습니다. 읽을 수 있는 필드만으로 계산했습니다.");
    expect(noticeText(of("unclassified"), "ko")).toBe("Claude Code에 분류하지 못한 기록이 있습니다(압축 1개, 거절 표시 3개, 훅 첨부 4개).");
    expect(noticeText(of("unclassified"), "en")).toBe("Claude Code: some records could not be classified (1 compaction, 3 denial markers, 4 hook attachments).");
  });

  it("Codex의 알림. 건너뛴 압축 파일은 zstd를 풀 수 있는 Node.js를 알리고, 세션 ID를 대신 쓴 기록은 까닭별 수를 더한다(설계 「5단계 4부 계획 전 결정」 3번)", () => {
    expect(noticeText(of("record_skipped"), "ko")).toBe("Codex 기록 가운데 이 Node.js가 zstd 압축을 풀지 못해 건너뛴 파일이 1개 있습니다. Node.js 22는 22.15.0 이상, 23은 23.8.0 이상, 24부터는 모든 버전에서 읽힙니다.");
    expect(noticeText(of("record_skipped"), "en")).toBe("Codex: 1 compressed record file was skipped because this Node.js cannot unpack zstd. Node.js 22.15.0 or later on 22, 23.8.0 or later on 23, and any version from 24 read them.");
    expect(noticeText(of("record_partial"), "ko")).toBe("Codex 기록 가운데 앞부분만 읽은 파일이 2개 있습니다. 읽은 부분만 계산해서 읽지 못한 비율은 적어도 보이는 값입니다.");
    expect(noticeText(of("unverified_inheritance"), "ko")).toBe("Codex에서 다른 기록에서 이어받은 앞부분을 확인하지 못한 세션이 2개 있습니다. 그 숫자는 가까운 값입니다.");
    expect(noticeText(of("id_fallbacks"), "ko")).toBe("Codex 기록 가운데 첫 줄에서 세션 ID를 얻지 못해 파일 이름으로 세션을 가른 것이 3개 있습니다. 같은 세션이 둘로 나뉘거나 앞부분을 다시 셌을 수 있습니다.");
    expect(noticeText(of("id_fallbacks"), "en")).toBe("Codex: the session ID could not be taken from the first line of 3 records, so the file name stood in for it. A session may be split in two, or an earlier part counted again.");
    // 첫 줄은 읽었는데 세션 ID만 없는 기록도 같은 문장이다. 첫 줄을 읽지 못했다고 하지 않는다(4부 계획 리뷰 1차)
    const metaWithoutId: Notice = { kind: "id_fallbacks", tool: "codex", counts: [{ why: "meta-without-id", count: 1 }] };
    expect(noticeText(metaWithoutId, "ko")).not.toContain("읽지 못해");
    expect(noticeText(metaWithoutId, "en")).not.toContain("could not be read");
    expect(noticeText(of("parent_record_missing"), "ko")).toBe("Codex에 부모 세션의 기록을 찾지 못한 하위 세션이 1개 있습니다.");
    expect(noticeText(of("merged_sessions"), "ko")).toBe("Codex에서 기록 파일이 둘 이상인 세션 3개는 세션 하나씩으로 합쳐 셌습니다.");
    expect(noticeText(of("unknown_mtime_sessions"), "ko")).toBe("Codex에서 수정 시각을 보지 못한 사본이 있는 세션이 1개 있습니다. 수정 시각을 아는 사본을 먼저 읽었습니다.");
    expect(noticeText(of("skipped_copies"), "ko")).toBe("Codex에서 같은 기록의 다른 사본 4개는 읽지 않았습니다. 기록마다 사본 하나만 읽습니다.");
    expect(noticeText(of("unnamed_files"), "ko")).toBe("Codex 기록 폴더에서 이름으로 기록을 알아볼 수 없는 파일 1개는 읽지 않았습니다.");
    expect(noticeText(of("unnamed_files"), "en")).toBe("Codex: 1 file in the records folder could not be recognized by name and was not read.");
    const unclassified: Notice = { kind: "unclassified", tool: "codex", counts: [{ what: "item:Plan", count: 3 }, { what: "thread_source:secret", count: 2 }] };
    expect(noticeText(unclassified, "ko")).toBe("Codex에 분류하지 못한 기록이 있습니다(주 세션으로 센 출처 모를 세션 2개, 종류를 모르는 실행 항목 3개).");
    expect(noticeText(unclassified, "en")).toBe("Codex: some records could not be classified (2 sessions of unknown origin counted as main, 3 work items of an unknown kind).");
  });
```

`test/core/result-coverage.test.ts`(찾을 곳 1/2):

```ts
import { resultCoverage } from "../../src/core/result/coverage.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

```

`test/core/result-coverage.test.ts`(바꾼 뒤 1/2):

```ts
import { resultCoverage } from "../../src/core/result/coverage.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, codexTool, evaluationInput } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

```

`test/core/result-coverage.test.ts`(찾을 곳 2/2):

```ts
  });
});
```

`test/core/result-coverage.test.ts`(바꾼 뒤 2/2):

```ts
  });
});

describe("Codex의 건너뛴 압축 파일과 일부만 읽은 파일(설계 「5단계 4부 계획 전 결정」 2번)", () => {
  const extra = (input: Partial<NonNullable<CollectedTool["codex"]>> = {}): NonNullable<CollectedTool["codex"]> => ({
    skippedFiles: [],
    skippedFileBytes: 0,
    partialFiles: [],
    skippedCopies: 0,
    unnamedFiles: 0,
    parentRecordMissing: 0,
    mergedSessions: 0,
    unknownMtimeSessions: 0,
    unverifiedInheritance: 0,
    idFallbacks: {},
    ...input,
  });
  const codexCoverageOf = (tool: CollectedTool) => resultCoverage(evaluationInput([codexTool()]), [tool])[0]!;

  it("건너뛴 압축 파일은 읽지 못한 파일과 함께 비율의 분자에 들고 그 수를 싣는다", () => {
    const coverage = codexCoverageOf(collected({ tool: "codex", read: read({ files: 10, listedBytes: 1000, unreadableFiles: ["/c/a.jsonl"], unreadableFileBytes: 50 }), codex: extra({ skippedFiles: ["/c/b.jsonl.zst", "/c/c.jsonl.zst"], skippedFileBytes: 100 }) }));
    expect(coverage).toMatchObject({ tool: "codex", unreadableFiles: 1, skippedFiles: 2, partialFiles: 0, unreadableShare: 0.3, lowerBound: false, partial: true });
  });

  it("바이트 기준에도 건너뛴 압축 파일의 바이트가 든다", () => {
    const coverage = codexCoverageOf(collected({ tool: "codex", read: read({ files: 20, listedBytes: 1000 }), codex: extra({ skippedFiles: ["/c/big.jsonl.zst"], skippedFileBytes: 500 }) }));
    expect(coverage.unreadableShare).toBe(0.5);
  });

  it("일부만 읽은 파일은 분자에 넣지 않고 비율을 아래 경계로 보아 띠를 띄운다", () => {
    const coverage = codexCoverageOf(collected({ tool: "codex", read: read({ files: 10, listedBytes: 1000 }), codex: extra({ partialFiles: ["/c/p.jsonl.zst"] }) }));
    expect(coverage).toMatchObject({ partialFiles: 1, skippedFiles: 0, unreadableShare: 0, lowerBound: true, partial: true });
  });
});
```

`test/core/result-notices-record.test.ts`(찾을 곳 1/2):

```ts
// 기록 쪽 알림(읽지 못한 기록, 관측이 빠짐없지 않음, 확인한 범위 밖 버전, 겹치는 응답, 근거가 약한 사람 요청, 분류하지 못한 표시, 부모를 모르는 하위 세션)을 시험한다(설계 9.2, 9.5, 9.8, 12.2, 20.1)
import { describe, expect, it } from "vitest";
```

`test/core/result-notices-record.test.ts`(바꾼 뒤 1/2):

```ts
// 기록 쪽 알림(읽지 못한 기록, 관측이 빠짐없지 않음, 확인한 범위 밖 버전, 겹치는 응답, 근거가 약한 사람 요청, 분류하지 못한 표시, 부모를 모르는 하위 세션)과 Codex 몫(건너뛴 압축 파일, 일부만 읽은 파일, 기록을 묶으며 센 것)을 시험한다(설계 9.2, 9.5, 9.8, 12.2, 20.1, 「5단계 4부 계획 전 결정」 3번)
import { describe, expect, it } from "vitest";
```

`test/core/result-notices-record.test.ts`(찾을 곳 2/2):

```ts

describe("기록 쪽 알림", () => {
  it("Codex의 읽지 못한 기록과 관측이 빠진 것은 아직 알리지 않는다. 확인한 범위 밖 버전은 같은 꼴로 알린다(설계 「5단계 3부 계획 전 결정」 13번)", () => {
    const codex = codexTool({ sessions: [{ ...fine, version: "0.120.0" }] });
    const input = evaluationInput([codex]);
    const collected: CollectedTool = { ...base(), tool: "codex", read: { ...base().read, unreadableFiles: ["/h/.codex/sessions/x.jsonl"] }, observation: { skills: { complete: false, reasons: [] }, mcp: { complete: false, reasons: ["unreadable-files"] } } };
    expect(recordNotices(input, evaluate(input), [collected])).toEqual([{ kind: "version_unverified", tool: "codex", versions: ["0.120.0"], verified: { ...VERIFIED_VERSIONS.codex } }]);
  });
  it("빠진 것이 없으면 알림이 없다", () => {
```

`test/core/result-notices-record.test.ts`(바꾼 뒤 2/2):

```ts

const codexBase = (): CollectedTool => ({
  ...base(),
  tool: "codex",
  observation: { skills: { complete: false, reasons: ["not-recorded"] }, mcp: { complete: true, reasons: [] } },
  codex: { skippedFiles: [], skippedFileBytes: 0, partialFiles: [], skippedCopies: 0, unnamedFiles: 0, parentRecordMissing: 0, mergedSessions: 0, unknownMtimeSessions: 0, unverifiedInheritance: 0, idFallbacks: {} },
});
const codexFine = { ...fine, version: "0.166.0" };
const codexNoticesOf = (sessions: NonNullable<Parameters<typeof codexTool>[0]>["sessions"], collected: Partial<CollectedTool> = {}) => {
  const input = evaluationInput([codexTool({ sessions })]);
  return recordNotices(input, evaluate(input), [{ ...codexBase(), ...collected }]);
};
const codexMeta = (unknownThreadSource: string | null, unknownItemTypes: Record<string, number>) => ({ recordId: "r", unknownThreadSource, idFallback: null, unknownItemTypes, inheritedSkipped: { items: 0, totals: 0, responses: 0 }, baselineMissing: false });

describe("기록 쪽 알림의 Codex 몫(설계 「5단계 4부 계획 전 결정」 3번)", () => {
  it("빠진 것이 없으면 알림이 없다. 스킬 사용은 Codex가 기록하지 않아 관측이 빠짐없지 않아도 알리지 않는다", () => {
    expect(codexNoticesOf([codexFine])).toEqual([]);
  });

  it("읽지 못한 기록과 MCP 관측이 빠진 것은 Claude Code와 같은 꼴로 알린다. 확인한 범위 밖 버전도 같다", () => {
    const notices = codexNoticesOf([{ ...fine, version: "0.120.0" }], {
      read: { ...base().read, unreadableFiles: ["/h/.codex/sessions/x.jsonl"] },
      observation: { skills: { complete: false, reasons: ["not-recorded"] }, mcp: { complete: false, reasons: ["unreadable-files"] } },
    });
    expect(notices).toEqual([
      { kind: "record_unreadable", tool: "codex", files: ["/h/.codex/sessions/x.jsonl"], dirs: [] },
      { kind: "observation_incomplete", tool: "codex", metric: "mcp", reasons: ["unreadable-files"] },
      { kind: "version_unverified", tool: "codex", versions: ["0.120.0"], verified: { ...VERIFIED_VERSIONS.codex } },
    ]);
  });

  it("건너뛴 압축 파일과 일부만 읽은 파일을 경로 차례로 알린다", () => {
    const notices = codexNoticesOf([codexFine], { codex: { ...codexBase().codex!, skippedFiles: ["/c/b.jsonl.zst", "/c/a.jsonl.zst"], skippedFileBytes: 10, partialFiles: ["/c/p.jsonl.zst"] } });
    expect(notices).toEqual([
      { kind: "record_skipped", tool: "codex", files: ["/c/a.jsonl.zst", "/c/b.jsonl.zst"] },
      { kind: "record_partial", tool: "codex", files: ["/c/p.jsonl.zst"] },
    ]);
  });

  it("기록을 묶으며 센 것을 종류마다 알린다. 세션 ID를 대신 쓴 기록은 까닭의 차례로 까닭별 수를 싣는다", () => {
    const counts = { unverifiedInheritance: 2, idFallbacks: { "no-lines": 1, "first-line-unreadable": 3 }, parentRecordMissing: 1, mergedSessions: 4, unknownMtimeSessions: 1, skippedCopies: 5, unnamedFiles: 2 };
    expect(codexNoticesOf([codexFine], { codex: { ...codexBase().codex!, ...counts } })).toEqual([
      { kind: "unverified_inheritance", tool: "codex", sessions: 2 },
      { kind: "id_fallbacks", tool: "codex", counts: [{ why: "first-line-unreadable", count: 3 }, { why: "no-lines", count: 1 }] },
      { kind: "parent_record_missing", tool: "codex", sessions: 1 },
      { kind: "merged_sessions", tool: "codex", sessions: 4 },
      { kind: "unknown_mtime_sessions", tool: "codex", sessions: 1 },
      { kind: "skipped_copies", tool: "codex", count: 5 },
      { kind: "unnamed_files", tool: "codex", count: 2 },
    ]);
  });

  it("정체 모를 thread_source(세션마다)와 실행 층 종류(종류마다)를 분류하지 못한 것에 더한다", () => {
    const notices = codexNoticesOf([
      { ...codexFine, codex: codexMeta("feature-x", { Plan: 2 }) },
      { ...codexFine, codex: codexMeta("feature-x", {}) },
      { ...codexFine, codex: codexMeta("(없음)", { SubAgentActivity: 1, Plan: 1 }) },
      { ...codexFine, codex: codexMeta(null, {}) },
    ]);
    expect(notices).toEqual([{ kind: "unclassified", tool: "codex", counts: [{ what: "item:Plan", count: 3 }, { what: "item:SubAgentActivity", count: 1 }, { what: "thread_source:(없음)", count: 1 }, { what: "thread_source:feature-x", count: 2 }] }]);
  });

  it("부모를 모르는 하위 세션은 Claude Code와 같은 꼴로 알린다", () => {
    expect(codexNoticesOf([codexFine, { kind: "sub", parentSessionId: null, version: "0.166.0", days: { "2026-11-10": { responses: 1 } } }])).toEqual([{ kind: "orphan_subsessions", tool: "codex", sessions: 1 }]);
  });
});

describe("기록 쪽 알림", () => {
  it("빠진 것이 없으면 알림이 없다", () => {
```

`test/core/result-notices-setup.test.ts`(찾을 곳 1/2):

```ts
      "record_unreadable",
      "observation_incomplete",
```

`test/core/result-notices-setup.test.ts`(바꾼 뒤 1/2):

```ts
      "record_unreadable",
      "record_skipped",
      "record_partial",
      "observation_incomplete",
```

`test/core/result-notices-setup.test.ts`(찾을 곳 2/2):

```ts
      "overlapping_responses",
      "unclassified",
      "orphan_subsessions",
    ]);
```

`test/core/result-notices-setup.test.ts`(바꾼 뒤 2/2):

```ts
      "overlapping_responses",
      "unverified_inheritance",
      "id_fallbacks",
      "unclassified",
      "orphan_subsessions",
      "parent_record_missing",
      "merged_sessions",
      "unknown_mtime_sessions",
      "skipped_copies",
      "unnamed_files",
    ]);
```

`test/core/result-summary.test.ts`(찾을 곳 1/5):

```ts

  it("알림 열세 종류마다 정해진 값과 대상의 수만 싣고, 알림에 든 경로와 이름은 싣지 않는다", () => {
    const notices: Notice[] = [
```

`test/core/result-summary.test.ts`(바꾼 뒤 1/5):

```ts

  it("알림 스물두 종류마다 정해진 값과 대상의 수만 싣고, 알림에 든 경로와 이름은 싣지 않는다", () => {
    const notices: Notice[] = [
```

`test/core/result-summary.test.ts`(찾을 곳 2/5):

```ts
      { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl"], dirs: ["/secret/d"] },
      { kind: "observation_incomplete", tool: "claude-code", metric: "mcp", reasons: ["unreadable-files"] },
```

`test/core/result-summary.test.ts`(바꾼 뒤 2/5):

```ts
      { kind: "record_unreadable", tool: "claude-code", files: ["/secret/a.jsonl"], dirs: ["/secret/d"] },
      { kind: "record_skipped", tool: "codex", files: ["/secret/a.jsonl.zst", "/secret/b.jsonl.zst"] },
      { kind: "record_partial", tool: "codex", files: ["/secret/p.jsonl.zst"] },
      { kind: "observation_incomplete", tool: "claude-code", metric: "mcp", reasons: ["unreadable-files"] },
```

`test/core/result-summary.test.ts`(찾을 곳 3/5):

```ts
      { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
      { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:secret-kind", count: 2 }] },
      { kind: "orphan_subsessions", tool: "claude-code", sessions: 4 },
    ];
```

`test/core/result-summary.test.ts`(바꾼 뒤 3/5):

```ts
      { kind: "overlapping_responses", tool: "claude-code", sessions: 2 },
      { kind: "unverified_inheritance", tool: "codex", sessions: 5 },
      { kind: "id_fallbacks", tool: "codex", counts: [{ why: "no-lines", count: 2 }, { why: "meta-without-id", count: 1 }] },
      { kind: "unclassified", tool: "claude-code", counts: [{ what: "compaction", count: 1 }, { what: "denial:secret-kind", count: 2 }] },
      { kind: "orphan_subsessions", tool: "claude-code", sessions: 4 },
      { kind: "parent_record_missing", tool: "codex", sessions: 6 },
      { kind: "merged_sessions", tool: "codex", sessions: 7 },
      { kind: "unknown_mtime_sessions", tool: "codex", sessions: 8 },
      { kind: "skipped_copies", tool: "codex", count: 9 },
      { kind: "unnamed_files", tool: "codex", count: 10 },
    ];
```

`test/core/result-summary.test.ts`(찾을 곳 4/5):

```ts
      { kind: "record_unreadable", tool: "claude-code", detail: null, count: 2 },
      { kind: "observation_incomplete", tool: "claude-code", detail: "mcp", count: null },
```

`test/core/result-summary.test.ts`(바꾼 뒤 4/5):

```ts
      { kind: "record_unreadable", tool: "claude-code", detail: null, count: 2 },
      { kind: "record_skipped", tool: "codex", detail: null, count: 2 },
      { kind: "record_partial", tool: "codex", detail: null, count: 1 },
      { kind: "observation_incomplete", tool: "claude-code", detail: "mcp", count: null },
```

`test/core/result-summary.test.ts`(찾을 곳 5/5):

```ts
      { kind: "overlapping_responses", tool: "claude-code", detail: null, count: 2 },
      { kind: "unclassified", tool: "claude-code", detail: null, count: 3 },
      { kind: "orphan_subsessions", tool: "claude-code", detail: null, count: 4 },
    ]);
```

`test/core/result-summary.test.ts`(바꾼 뒤 5/5):

```ts
      { kind: "overlapping_responses", tool: "claude-code", detail: null, count: 2 },
      { kind: "unverified_inheritance", tool: "codex", detail: null, count: 5 },
      { kind: "id_fallbacks", tool: "codex", detail: null, count: 3 },
      { kind: "unclassified", tool: "claude-code", detail: null, count: 3 },
      { kind: "orphan_subsessions", tool: "claude-code", detail: null, count: 4 },
      { kind: "parent_record_missing", tool: "codex", detail: null, count: 6 },
      { kind: "merged_sessions", tool: "codex", detail: null, count: 7 },
      { kind: "unknown_mtime_sessions", tool: "codex", detail: null, count: 8 },
      { kind: "skipped_copies", tool: "codex", detail: null, count: 9 },
      { kind: "unnamed_files", tool: "codex", detail: null, count: 10 },
    ]);
```

`test/report/view.test.ts`(찾을 곳 1/2):

```ts
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/report/view.test.ts`(바꾼 뒤 1/2):

```ts
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/report/view.test.ts`(찾을 곳 2/2):

```ts

  it("판정을 시작할 수 있는 날까지 남은 날 수를 평가 시계의 오늘에서 센다. 날을 모르면 null이다", () => {
```

`test/report/view.test.ts`(바꾼 뒤 2/2):

```ts

  it("Codex의 건너뛴 압축 파일도 읽지 못한 기록처럼 그림을 고르고 「일부만 읽었다」 띠에 든다(설계 「5단계 4부 계획 전 결정」 2·3번)", () => {
    const input = evaluationInput([claudeTool({ sessions: enough }), codexTool({ sessions: enough })]);
    const codex = collected({
      tool: "codex",
      observation: { skills: { complete: false, reasons: ["not-recorded"] }, mcp: { complete: true, reasons: [] } },
      codex: { skippedFiles: ["C:/SECRET-PARENT/a.jsonl.zst"], skippedFileBytes: 100, partialFiles: [], skippedCopies: 0, unnamedFiles: 0, parentRecordMissing: 0, mergedSessions: 0, unknownMtimeSessions: 0, unverifiedInheritance: 0, idFallbacks: {} },
    });
    const checked = checkupResult({ input, evaluation: evaluate(input), collected: [collected(), codex], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    const view = reportView(checked, { saved: true, round: 1 });
    expect(view.unreadable).toBe(true);
    expect(view.partialReads).toEqual([{ tool: "codex", share: 1 / 3, lowerBound: false }]);
    expect(JSON.stringify(view)).not.toContain("SECRET-PARENT");
  });

  it("판정을 시작할 수 있는 날까지 남은 날 수를 평가 시계의 오늘에서 센다. 날을 모르면 null이다", () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/checkup-input.test.ts test/core/copy-notices.test.ts test/core/result-coverage.test.ts test/core/result-notices-record.test.ts test/core/result-notices-setup.test.ts test/core/result-summary.test.ts test/report/view.test.ts`
Expected: FAIL. 바뀐 시험 파일 일곱이 실패한다. 수집 결과에 Codex 몫이 없어 읽은 양이 건너뛴 압축 파일과 일부만 읽은 파일을 세지 않고, Codex의 기록 쪽 알림을 내지 않으며, 새 알림의 종류와 문장과 차례가 없고, 이어받은 것을 확인하지 못한 세션이 있어도 관측 범위를 낮추지 않는다.

- [ ] **Step 3: 구현한다**

`src/adapters/claude/observation.ts`(찾을 곳):

```ts
export type ObservationReason = "unreadable-files" | "too-long-lines" | "unconfirmed-pieces";
```

`src/adapters/claude/observation.ts`(바꾼 뒤):

```ts
/** not-recorded는 그 지표를 기록하지 않는 형식이라 빠짐없지 않은 것이다(9.8 표의 셋째 줄. Codex의 스킬 사용, 「5단계 4부 계획 전 결정」 3번). 기록을 읽어 찾는 까닭이 아니라 기록 읽기는 내지 않는다 */
export type ObservationReason = "unreadable-files" | "too-long-lines" | "unconfirmed-pieces" | "not-recorded";
```

`src/commands/checkup-input.ts`(찾을 곳 1/4):

```ts
import { makeWindows } from "../adapters/common/dates.ts";
import { collectClaude, unreadableCount, type ClaudeCollectResult, type ClaudeReadStats, type EvalClock } from "../collect/claude.ts";
```

`src/commands/checkup-input.ts`(바꾼 뒤 1/4):

```ts
import { makeWindows } from "../adapters/common/dates.ts";
import type { ToolCoverage } from "../adapters/types.ts";
import { collectClaude, unreadableCount, type ClaudeCollectResult, type ClaudeReadStats, type EvalClock } from "../collect/claude.ts";
```

`src/commands/checkup-input.ts`(찾을 곳 2/4):

```ts

/** Codex는 스킬 사용을 기록하지 않아 스킬의 관측은 늘 빠짐없지 않다. 그 까닭의 문장은 4부가 정한다(설계 「5단계 2부 계획 전 결정」 6번, 「5단계 3부 계획 전 결정」 2·13번) */
const CODEX_SKILL_OBSERVATION: Observation = { complete: false, reasons: [] };

/** 결과에 싣는 Codex의 읽은 양. Claude Code와 같은 칸만 싣는다. Codex에만 있는 칸(건너뛴 압축 파일, 일부만 읽은 파일)은 4부가 잇는다(「5단계 3부 계획 전 결정」 13번) */
function codexSharedRead(read: CodexReadStats): Omit<ClaudeReadStats, "fromCache"> {
```

`src/commands/checkup-input.ts`(바꾼 뒤 2/4):

```ts

/** Codex는 스킬 사용을 기록하지 않아 스킬의 관측은 늘 빠짐없지 않다(설계 「5단계 2부 계획 전 결정」 6번, 「5단계 4부 계획 전 결정」 3번) */
const CODEX_SKILL_OBSERVATION: Observation = { complete: false, reasons: ["not-recorded"] };

/** 이어받은 것을 확인하지 못한 세션이 있으면 대신 보는 것으로 낮추는 Codex의 관측 범위(「5단계 4부 계획 전 결정」 4번) */
const INHERITED_METRICS = ["responsesAndTokens", "toolCalls", "toolErrors", "shellExitCodes"] as const;

/** 이어받은 것을 확인하지 못한 세션의 숫자는 대신 본 것이다. 그런 세션이 있으면 그 점검의 Codex 관측 범위에서 응답과 토큰, 도구 호출과 그 결과를 낮춘다. 못 봄은 그대로 둔다 */
function codexCoverage(unverifiedInheritance: number): ToolCoverage {
  if (unverifiedInheritance === 0) return CODEX_COVERAGE;
  const coverage: ToolCoverage = { ...CODEX_COVERAGE };
  for (const key of INHERITED_METRICS) if (coverage[key] === "measured") coverage[key] = "proxy";
  return coverage;
}

/** 결과에 싣는 Codex의 읽은 양 가운데 Claude Code와 같은 칸 */
function codexSharedRead(read: CodexReadStats): Omit<ClaudeReadStats, "fromCache"> {
```

`src/commands/checkup-input.ts`(찾을 곳 3/4):

```ts
        summaries: codex.summaries,
        coverage: CODEX_COVERAGE,
        shellTools: [...CODEX_SHELL_TOOLS].sort(),
```

`src/commands/checkup-input.ts`(바꾼 뒤 3/4):

```ts
        summaries: codex.summaries,
        coverage: codexCoverage(codex.unverifiedInheritance),
        shellTools: [...CODEX_SHELL_TOOLS].sort(),
```

`src/commands/checkup-input.ts`(찾을 곳 4/4):

```ts
    // Codex는 다른 기록에서 이어받은 앞부분을 빼고 세므로 다른 세션과 겹쳐 세는 응답이 없다(설계 「5단계 계획 전 결정」 7번)
    { tool: "codex", detected: codex.detected, visibleFrom: codex.visibleFrom, overlappingSessions: 0, read: codexSharedRead(codex.read), observation: codexObserved },
  ];
```

`src/commands/checkup-input.ts`(바꾼 뒤 4/4):

```ts
    // Codex는 다른 기록에서 이어받은 앞부분을 빼고 세므로 다른 세션과 겹쳐 세는 응답이 없다(설계 「5단계 계획 전 결정」 7번)
    {
      tool: "codex",
      detected: codex.detected,
      visibleFrom: codex.visibleFrom,
      overlappingSessions: 0,
      read: codexSharedRead(codex.read),
      observation: codexObserved,
      codex: {
        skippedFiles: codex.read.skippedFiles,
        skippedFileBytes: codex.read.skippedFileBytes,
        partialFiles: codex.read.partialFiles,
        skippedCopies: codex.read.skippedCopies,
        unnamedFiles: codex.read.unnamedFiles,
        parentRecordMissing: codex.parentRecordMissing,
        mergedSessions: codex.mergedSessions,
        unknownMtimeSessions: codex.unknownMtimeSessions,
        unverifiedInheritance: codex.unverifiedInheritance,
        idFallbacks: codex.idFallbacks,
      },
    },
  ];
```

`src/core/copy/notices.ts`(찾을 곳 1/12):

```ts
// 평가 결과의 알림 열세 종류의 문장. 종류, 정해진 값, 수만 넣고 이름과 경로는 넣지 않아 터미널 요약에도 같은 문장이 간다(순수 함수, 설계 12.2, 19.1, 20.1, 「2단계 3부 계획에서 보완」의 알림 표)
import type { ObservationReason } from "../../adapters/claude/observation.ts";
```

`src/core/copy/notices.ts`(바꾼 뒤 1/12):

```ts
// 평가 결과의 알림 스물두 종류의 문장. 종류, 정해진 값, 수만 넣고 이름과 경로는 넣지 않아 터미널 요약에도 같은 문장이 간다(순수 함수, 설계 12.2, 19.1, 20.1, 「2단계 3부 계획에서 보완」의 알림 표)
import type { ObservationReason } from "../../adapters/claude/observation.ts";
```

`src/core/copy/notices.ts`(찾을 곳 2/12):

```ts
  "unconfirmed-pieces": { en: "unconfirmed pieces", ko: "확인하지 못한 조각" },
};
```

`src/core/copy/notices.ts`(바꾼 뒤 2/12):

```ts
  "unconfirmed-pieces": { en: "unconfirmed pieces", ko: "확인하지 못한 조각" },
  "not-recorded": { en: "not recorded by the tool", ko: "도구가 기록하지 않음" },
};
```

`src/core/copy/notices.ts`(찾을 곳 3/12):

```ts

/** 분류하지 못한 기록의 묶음. 알림의 what은 compaction, denial:<종류>, hook:<종류>다 */
const UNCLASSIFIED: Record<"compaction" | "denial" | "hook", Texts<string>> = {
  compaction: { en: "{count} {count:compaction|compactions}", ko: "압축 {count}개" },
```

`src/core/copy/notices.ts`(바꾼 뒤 3/12):

```ts

/** 분류하지 못한 기록의 묶음. 알림의 what은 compaction, denial:<종류>, hook:<종류>, Codex의 thread_source:<값>과 item:<종류>다. 종류와 값은 문장에 넣지 않는다 */
const UNCLASSIFIED_GROUPS = ["compaction", "denial", "hook", "thread_source", "item"] as const;
const UNCLASSIFIED: Record<(typeof UNCLASSIFIED_GROUPS)[number], Texts<string>> = {
  compaction: { en: "{count} {count:compaction|compactions}", ko: "압축 {count}개" },
```

`src/core/copy/notices.ts`(찾을 곳 4/12):

```ts
  hook: { en: "{count} {count:hook attachment|hook attachments}", ko: "훅 첨부 {count}개" },
};
```

`src/core/copy/notices.ts`(바꾼 뒤 4/12):

```ts
  hook: { en: "{count} {count:hook attachment|hook attachments}", ko: "훅 첨부 {count}개" },
  thread_source: { en: "{count} {count:session|sessions} of unknown origin counted as main", ko: "주 세션으로 센 출처 모를 세션 {count}개" },
  item: { en: "{count} {count:work item|work items} of an unknown kind", ko: "종류를 모르는 실행 항목 {count}개" },
};
```

`src/core/copy/notices.ts`(찾을 곳 5/12):

```ts
    record_unreadable: "{tool}: {files} {files:file|files} and {dirs} {dirs:folder|folders} of records could not be read. Only what was read is counted.",
    observation_incomplete: "{tool}: the records of {metric} could not all be read ({reasons}), so unused ones were not judged.",
```

`src/core/copy/notices.ts`(바꾼 뒤 5/12):

```ts
    record_unreadable: "{tool}: {files} {files:file|files} and {dirs} {dirs:folder|folders} of records could not be read. Only what was read is counted.",
    record_skipped: "{tool}: {files} compressed record {files:file was|files were} skipped because this Node.js cannot unpack zstd. Node.js 22.15.0 or later on 22, 23.8.0 or later on 23, and any version from 24 read them.",
    record_partial: "{tool}: only the first part of {files} record {files:file|files} could be read. Only what was read is counted, so the unread share is at least what is shown.",
    observation_incomplete: "{tool}: the records of {metric} could not all be read ({reasons}), so unused ones were not judged.",
```

`src/core/copy/notices.ts`(찾을 곳 6/12):

```ts
    overlapping_responses: "{tool}: {sessions} {sessions:session starts|sessions start} with responses that also appear in another session. The overlap was not removed from the counts.",
    unclassified: "{tool}: some records could not be classified ({items}).",
    orphan_subsessions: "{tool}: {sessions} {sessions:subsession has|subsessions have} no known parent session.",
  },
```

`src/core/copy/notices.ts`(바꾼 뒤 6/12):

```ts
    overlapping_responses: "{tool}: {sessions} {sessions:session starts|sessions start} with responses that also appear in another session. The overlap was not removed from the counts.",
    unverified_inheritance: "{tool}: for {sessions} {sessions:session|sessions}, what was carried over from another record could not be confirmed, so the counts are approximate.",
    id_fallbacks: "{tool}: the session ID could not be taken from the first line of {count} {count:record|records}, so the file name stood in for it. A session may be split in two, or an earlier part counted again.",
    unclassified: "{tool}: some records could not be classified ({items}).",
    orphan_subsessions: "{tool}: {sessions} {sessions:subsession has|subsessions have} no known parent session.",
    parent_record_missing: "{tool}: the parent session's records were not found for {sessions} {sessions:subsession|subsessions}.",
    merged_sessions: "{tool}: {sessions} {sessions:session has|sessions have} more than one record file, counted as one session each.",
    unknown_mtime_sessions: "{tool}: {sessions} {sessions:session has|sessions have} a copy whose modification time could not be read. Copies with a known time were read first.",
    skipped_copies: "{tool}: {count} other {count:copy|copies} of the same records {count:was|were} not read. One copy of each record is read.",
    unnamed_files: "{tool}: {count} {count:file|files} in the records folder could not be recognized by name and {count:was|were} not read.",
  },
```

`src/core/copy/notices.ts`(찾을 곳 7/12):

```ts
    record_unreadable: "{tool} 기록 가운데 읽지 못한 파일 {files}개와 폴더 {dirs}개가 있습니다. 읽은 것만으로 계산했습니다.",
    observation_incomplete: "{tool}의 {metric} 기록을 빠짐없이 읽지 못해({reasons}) 안 쓰는 것을 판정하지 않았습니다.",
```

`src/core/copy/notices.ts`(바꾼 뒤 7/12):

```ts
    record_unreadable: "{tool} 기록 가운데 읽지 못한 파일 {files}개와 폴더 {dirs}개가 있습니다. 읽은 것만으로 계산했습니다.",
    record_skipped: "{tool} 기록 가운데 이 Node.js가 zstd 압축을 풀지 못해 건너뛴 파일이 {files}개 있습니다. Node.js 22는 22.15.0 이상, 23은 23.8.0 이상, 24부터는 모든 버전에서 읽힙니다.",
    record_partial: "{tool} 기록 가운데 앞부분만 읽은 파일이 {files}개 있습니다. 읽은 부분만 계산해서 읽지 못한 비율은 적어도 보이는 값입니다.",
    observation_incomplete: "{tool}의 {metric} 기록을 빠짐없이 읽지 못해({reasons}) 안 쓰는 것을 판정하지 않았습니다.",
```

`src/core/copy/notices.ts`(찾을 곳 8/12):

```ts
    overlapping_responses: "{tool}에서 처음 나온 응답이 다른 세션과 겹치는 세션이 {sessions}개 있습니다. 겹친 응답을 빼지 않고 셌습니다.",
    unclassified: "{tool}에 분류하지 못한 기록이 있습니다({items}).",
    orphan_subsessions: "{tool}에 부모 세션을 모르는 하위 세션이 {sessions}개 있습니다.",
  },
```

`src/core/copy/notices.ts`(바꾼 뒤 8/12):

```ts
    overlapping_responses: "{tool}에서 처음 나온 응답이 다른 세션과 겹치는 세션이 {sessions}개 있습니다. 겹친 응답을 빼지 않고 셌습니다.",
    unverified_inheritance: "{tool}에서 다른 기록에서 이어받은 앞부분을 확인하지 못한 세션이 {sessions}개 있습니다. 그 숫자는 가까운 값입니다.",
    id_fallbacks: "{tool} 기록 가운데 첫 줄에서 세션 ID를 얻지 못해 파일 이름으로 세션을 가른 것이 {count}개 있습니다. 같은 세션이 둘로 나뉘거나 앞부분을 다시 셌을 수 있습니다.",
    unclassified: "{tool}에 분류하지 못한 기록이 있습니다({items}).",
    orphan_subsessions: "{tool}에 부모 세션을 모르는 하위 세션이 {sessions}개 있습니다.",
    parent_record_missing: "{tool}에 부모 세션의 기록을 찾지 못한 하위 세션이 {sessions}개 있습니다.",
    merged_sessions: "{tool}에서 기록 파일이 둘 이상인 세션 {sessions}개는 세션 하나씩으로 합쳐 셌습니다.",
    unknown_mtime_sessions: "{tool}에서 수정 시각을 보지 못한 사본이 있는 세션이 {sessions}개 있습니다. 수정 시각을 아는 사본을 먼저 읽었습니다.",
    skipped_copies: "{tool}에서 같은 기록의 다른 사본 {count}개는 읽지 않았습니다. 기록마다 사본 하나만 읽습니다.",
    unnamed_files: "{tool} 기록 폴더에서 이름으로 기록을 알아볼 수 없는 파일 {count}개는 읽지 않았습니다.",
  },
```

`src/core/copy/notices.ts`(찾을 곳 9/12):

```ts
function unclassifiedItems(counts: readonly { what: string; count: number }[], lang: Lang): string {
  const groups = (["compaction", "denial", "hook"] as const).map((group) => ({ group, count: counts.filter((item) => item.what.split(":")[0] === group).reduce((sum, item) => sum + item.count, 0) }));
  return groups
```

`src/core/copy/notices.ts`(바꾼 뒤 9/12):

```ts
function unclassifiedItems(counts: readonly { what: string; count: number }[], lang: Lang): string {
  const groups = UNCLASSIFIED_GROUPS.map((group) => ({ group, count: counts.filter((item) => item.what.split(":")[0] === group).reduce((sum, item) => sum + item.count, 0) }));
  return groups
```

`src/core/copy/notices.ts`(찾을 곳 10/12):

```ts
      return fill(lines.record_unreadable, { tool, files: notice.files.length, dirs: notice.dirs.length });
    case "observation_incomplete":
```

`src/core/copy/notices.ts`(바꾼 뒤 10/12):

```ts
      return fill(lines.record_unreadable, { tool, files: notice.files.length, dirs: notice.dirs.length });
    case "record_skipped":
    case "record_partial":
      return fill(lines[notice.kind], { tool, files: notice.files.length });
    case "observation_incomplete":
```

`src/core/copy/notices.ts`(찾을 곳 11/12):

```ts
    case "overlapping_responses":
      return fill(lines.overlapping_responses, { tool, sessions: notice.sessions });
    case "unclassified":
```

`src/core/copy/notices.ts`(바꾼 뒤 11/12):

```ts
    case "overlapping_responses":
    case "unverified_inheritance":
    case "parent_record_missing":
    case "merged_sessions":
    case "unknown_mtime_sessions":
      return fill(lines[notice.kind], { tool, sessions: notice.sessions });
    case "id_fallbacks":
      return fill(lines.id_fallbacks, { tool, count: notice.counts.reduce((sum, item) => sum + item.count, 0) });
    case "unclassified":
```

`src/core/copy/notices.ts`(찾을 곳 12/12):

```ts
      return fill(lines.orphan_subsessions, { tool, sessions: notice.sessions });
  }
```

`src/core/copy/notices.ts`(바꾼 뒤 12/12):

```ts
      return fill(lines.orphan_subsessions, { tool, sessions: notice.sessions });
    case "skipped_copies":
    case "unnamed_files":
      return fill(lines[notice.kind], { tool, count: notice.count });
  }
```

`src/core/result/coverage.ts`(찾을 곳 1/3):

```ts
    const shares = [read.files > 0 ? read.unreadableFiles.length / read.files : null, read.listedBytes > 0 ? read.unreadableFileBytes / read.listedBytes : null].filter((share): share is number => share !== null);
```

`src/core/result/coverage.ts`(바꾼 뒤 1/3):

```ts
    // 건너뛴 압축 파일은 읽지 못한 파일과 함께 분자에 넣고(분모에는 이미 있다), 일부만 읽은 파일은 분자에 넣지 않고 아래 경계로 본다(설계 「5단계 계획 전 결정」 2번)
    const skipped = found.codex?.skippedFiles.length ?? 0;
    const skippedBytes = found.codex?.skippedFileBytes ?? 0;
    const partialFiles = found.codex?.partialFiles.length ?? 0;
    const shares = [read.files > 0 ? (read.unreadableFiles.length + skipped) / read.files : null, read.listedBytes > 0 ? (read.unreadableFileBytes + skippedBytes) / read.listedBytes : null].filter(
      (share): share is number => share !== null,
    );
```

`src/core/result/coverage.ts`(찾을 곳 2/3):

```ts
    const lowerBound = read.unreadableDirs.length > 0 || read.unknownSizeFiles > 0;
```

`src/core/result/coverage.ts`(바꾼 뒤 2/3):

```ts
    const lowerBound = read.unreadableDirs.length > 0 || read.unknownSizeFiles > 0 || partialFiles > 0;
```

`src/core/result/coverage.ts`(찾을 곳 3/3):

```ts
      partialFiles: 0,
      skippedFiles: 0,
```

`src/core/result/coverage.ts`(바꾼 뒤 3/3):

```ts
      partialFiles,
      skippedFiles: skipped,
```

`src/core/result/notices.ts`(찾을 곳 1/9):

```ts
import type { Withheld } from "../scoreboard.ts";
import type { CollectedTool } from "./tools.ts";

```

`src/core/result/notices.ts`(바꾼 뒤 1/9):

```ts
import type { Withheld } from "../scoreboard.ts";
import type { CollectedCodex, CollectedTool } from "./tools.ts";

```

`src/core/result/notices.ts`(찾을 곳 2/9):

```ts
  | { kind: "record_unreadable"; tool: ToolId; files: string[]; dirs: string[] }
  | { kind: "observation_incomplete"; tool: ToolId; metric: "skills" | "mcp"; reasons: ObservationReason[] }
```

`src/core/result/notices.ts`(바꾼 뒤 2/9):

```ts
  | { kind: "record_unreadable"; tool: ToolId; files: string[]; dirs: string[] }
  | { kind: "record_skipped"; tool: ToolId; files: string[] }
  | { kind: "record_partial"; tool: ToolId; files: string[] }
  | { kind: "observation_incomplete"; tool: ToolId; metric: "skills" | "mcp"; reasons: ObservationReason[] }
```

`src/core/result/notices.ts`(찾을 곳 3/9):

```ts
  | { kind: "overlapping_responses"; tool: ToolId; sessions: number }
  | { kind: "unclassified"; tool: ToolId; counts: { what: string; count: number }[] }
  | { kind: "orphan_subsessions"; tool: ToolId; sessions: number };

```

`src/core/result/notices.ts`(바꾼 뒤 3/9):

```ts
  | { kind: "overlapping_responses"; tool: ToolId; sessions: number }
  | { kind: "unverified_inheritance"; tool: ToolId; sessions: number }
  | { kind: "id_fallbacks"; tool: ToolId; counts: { why: string; count: number }[] }
  | { kind: "unclassified"; tool: ToolId; counts: { what: string; count: number }[] }
  | { kind: "orphan_subsessions"; tool: ToolId; sessions: number }
  | { kind: "parent_record_missing"; tool: ToolId; sessions: number }
  | { kind: "merged_sessions"; tool: ToolId; sessions: number }
  | { kind: "unknown_mtime_sessions"; tool: ToolId; sessions: number }
  | { kind: "skipped_copies"; tool: ToolId; count: number }
  | { kind: "unnamed_files"; tool: ToolId; count: number };

```

`src/core/result/notices.ts`(찾을 곳 4/9):

```ts
  "record_unreadable",
  "observation_incomplete",
```

`src/core/result/notices.ts`(바꾼 뒤 4/9):

```ts
  "record_unreadable",
  "record_skipped",
  "record_partial",
  "observation_incomplete",
```

`src/core/result/notices.ts`(찾을 곳 5/9):

```ts
  "overlapping_responses",
  "unclassified",
  "orphan_subsessions",
];
```

`src/core/result/notices.ts`(바꾼 뒤 5/9):

```ts
  "overlapping_responses",
  "unverified_inheritance",
  "id_fallbacks",
  "unclassified",
  "orphan_subsessions",
  "parent_record_missing",
  "merged_sessions",
  "unknown_mtime_sessions",
  "skipped_copies",
  "unnamed_files",
];
```

`src/core/result/notices.ts`(찾을 곳 6/9):

```ts

/** 기록 쪽 알림. 읽은 양과 같은 범위(수집 구간에 걸려 읽은 기록)를 보고, 근거가 약한 사람 요청만 점수 구간의 주 세션으로 본다 */
```

`src/core/result/notices.ts`(바꾼 뒤 6/9):

```ts

/** Codex만 내는 기록 쪽 알림. 건너뛴 압축 파일과 일부만 읽은 파일, 기록을 묶으며 센 것이다. 종류의 차례는 sortNotices가 맞춘다(설계 「5단계 4부 계획 전 결정」 3번) */
function codexRecordNotices(tool: ToolId, codex: CollectedCodex): Notice[] {
  const notices: Notice[] = [];
  if (codex.skippedFiles.length > 0) notices.push({ kind: "record_skipped", tool, files: [...codex.skippedFiles].sort(byText) });
  if (codex.partialFiles.length > 0) notices.push({ kind: "record_partial", tool, files: [...codex.partialFiles].sort(byText) });
  if (codex.unverifiedInheritance > 0) notices.push({ kind: "unverified_inheritance", tool, sessions: codex.unverifiedInheritance });
  const fallbacks = Object.entries(codex.idFallbacks)
    .filter(([, count]) => count > 0)
    .sort((a, b) => byText(a[0], b[0]))
    .map(([why, count]) => ({ why, count }));
  if (fallbacks.length > 0) notices.push({ kind: "id_fallbacks", tool, counts: fallbacks });
  if (codex.parentRecordMissing > 0) notices.push({ kind: "parent_record_missing", tool, sessions: codex.parentRecordMissing });
  if (codex.mergedSessions > 0) notices.push({ kind: "merged_sessions", tool, sessions: codex.mergedSessions });
  if (codex.unknownMtimeSessions > 0) notices.push({ kind: "unknown_mtime_sessions", tool, sessions: codex.unknownMtimeSessions });
  if (codex.skippedCopies > 0) notices.push({ kind: "skipped_copies", tool, count: codex.skippedCopies });
  if (codex.unnamedFiles > 0) notices.push({ kind: "unnamed_files", tool, count: codex.unnamedFiles });
  return notices;
}

/** 기록 쪽 알림. 읽은 양과 같은 범위(수집 구간에 걸려 읽은 기록)를 보고, 근거가 약한 사람 요청만 점수 구간의 주 세션으로 본다 */
```

`src/core/result/notices.ts`(찾을 곳 7/9):

```ts
    const found = collected.find((item) => item.tool === id);
    // 읽지 못한 기록과 관측이 빠진 것의 Codex 몫은 4부가 넣는다. Codex 스킬의 관측은 늘 빠짐없지 않아 지금의 문장이 맞지 않는다(설계 「5단계 3부 계획 전 결정」 13번)
    if (found !== undefined && id === "claude-code") {
      const { unreadableFiles, unreadableDirs } = found.read;
```

`src/core/result/notices.ts`(바꾼 뒤 7/9):

```ts
    const found = collected.find((item) => item.tool === id);
    if (found !== undefined) {
      const { unreadableFiles, unreadableDirs } = found.read;
```

`src/core/result/notices.ts`(찾을 곳 8/9):

```ts
        const observation = found.observation[metric];
        if (!observation.complete) notices.push({ kind: "observation_incomplete", tool: id, metric, reasons: [...observation.reasons] });
      }
      if (found.overlappingSessions > 0) notices.push({ kind: "overlapping_responses", tool: id, sessions: found.overlappingSessions });
    }
```

`src/core/result/notices.ts`(바꾼 뒤 8/9):

```ts
        const observation = found.observation[metric];
        // 그 지표를 기록하지 않는 형식(Codex의 스킬 사용)은 늘 빠짐없지 않다. 읽은 것의 문제가 아니라 알리지 않고, 규칙의 못 잰 이유가 알린다(설계 「5단계 4부 계획 전 결정」 3번)
        if (!observation.complete && !observation.reasons.includes("not-recorded")) notices.push({ kind: "observation_incomplete", tool: id, metric, reasons: [...observation.reasons] });
      }
      if (found.overlappingSessions > 0) notices.push({ kind: "overlapping_responses", tool: id, sessions: found.overlappingSessions });
      if (found.codex !== undefined) notices.push(...codexRecordNotices(id, found.codex));
    }
```

`src/core/result/notices.ts`(찾을 곳 9/9):

```ts
    for (const summary of tool.summaries) {
      for (const [kind, count] of Object.entries(summary.notes.unknownHookKinds)) add(`hook:${kind}`, count);
```

`src/core/result/notices.ts`(바꾼 뒤 9/9):

```ts
    for (const summary of tool.summaries) {
      // Codex의 정체 모를 thread_source(세션마다 하나)와 실행 층 종류(종류마다의 수). 그 세션은 주 세션으로 셌다(설계 9.2, 9.6)
      if (summary.codex?.unknownThreadSource != null) add(`thread_source:${summary.codex.unknownThreadSource}`, 1);
      for (const [kind, count] of Object.entries(summary.codex?.unknownItemTypes ?? {})) add(`item:${kind}`, count);
      for (const [kind, count] of Object.entries(summary.notes.unknownHookKinds)) add(`hook:${kind}`, count);
```

`src/core/result/summary.ts`(찾을 곳 1/2):

```ts
      return { kind: notice.kind, tool, detail: null, count: notice.files.length + notice.dirs.length };
    case "observation_incomplete":
```

`src/core/result/summary.ts`(바꾼 뒤 1/2):

```ts
      return { kind: notice.kind, tool, detail: null, count: notice.files.length + notice.dirs.length };
    case "record_skipped":
    case "record_partial":
      return { kind: notice.kind, tool, detail: null, count: notice.files.length };
    case "observation_incomplete":
```

`src/core/result/summary.ts`(찾을 곳 2/2):

```ts
    case "orphan_subsessions":
      return { kind: notice.kind, tool, detail: null, count: notice.sessions };
    case "unclassified":
      return { kind: notice.kind, tool, detail: null, count: notice.counts.reduce((sum, item) => sum + item.count, 0) };
  }
```

`src/core/result/summary.ts`(바꾼 뒤 2/2):

```ts
    case "orphan_subsessions":
    case "unverified_inheritance":
    case "parent_record_missing":
    case "merged_sessions":
    case "unknown_mtime_sessions":
      return { kind: notice.kind, tool, detail: null, count: notice.sessions };
    case "unclassified":
    case "id_fallbacks":
      return { kind: notice.kind, tool, detail: null, count: notice.counts.reduce((sum, item) => sum + item.count, 0) };
    case "skipped_copies":
    case "unnamed_files":
      return { kind: notice.kind, tool, detail: null, count: notice.count };
  }
```

`src/core/result/tools.ts`(찾을 곳 1/2):

```ts

/** 수집이 도구마다 낸 것 가운데 평가 결과에 싣는 것. 캐시를 쓴 파일 수처럼 실행마다 다른 것은 넣지 않는다(설계 12.2, 12.3) */
```

`src/core/result/tools.ts`(바꾼 뒤 1/2):

```ts

/**
 * Codex만 내는 수집 결과. 건너뛴 압축 파일과 일부만 읽은 파일(읽은 양)과, 기록을 묶으며 센 것(알림)이다. Claude Code에는 없다
 * (설계 9.2, 9.8, 「5단계 계획 전 결정」 2·3·7번, 「5단계 4부 계획 전 결정」 2·3번)
 */
export interface CollectedCodex {
  /** 그 Node.js가 zstd를 풀지 못해 열지 않은 정본과 그 바이트. 읽지 못한 비율의 분자에 든다 */
  skippedFiles: string[];
  skippedFileBytes: number;
  /** 앞부분만 읽은 파일. 있으면 읽지 못한 비율은 아래 경계다 */
  partialFiles: string[];
  /** 정본이 아니라 읽지 않은 사본, 이름에서 식별자를 읽지 못한 파일 */
  skippedCopies: number;
  unnamedFiles: number;
  /** 부모 기록을 하나도 읽지 못한 하위 세션, 기록 파일이 둘 이상이라 합친 세션, 수정 시각을 모르는 사본이 있던 세션, 이어받은 것을 확인하지 못한 세션의 수 */
  parentRecordMissing: number;
  mergedSessions: number;
  unknownMtimeSessions: number;
  unverifiedInheritance: number;
  /** 세션 ID를 기록 파일의 식별자로 대신 쓴 기록의 까닭별 수 */
  idFallbacks: Record<string, number>;
}

/** 수집이 도구마다 낸 것 가운데 평가 결과에 싣는 것. 캐시를 쓴 파일 수처럼 실행마다 다른 것은 넣지 않는다(설계 12.2, 12.3) */
```

`src/core/result/tools.ts`(찾을 곳 2/2):

```ts
  observation: { skills: Observation; mcp: Observation };
}
```

`src/core/result/tools.ts`(바꾼 뒤 2/2):

```ts
  observation: { skills: Observation; mcp: Observation };
  /** Codex만 내는 것. Claude Code에는 없다 */
  codex?: CollectedCodex;
}
```

`src/report/view.ts`(찾을 곳):

```ts
    unreadable: result.notices.some((notice) => notice.kind === "record_unreadable"),
```

`src/report/view.ts`(바꾼 뒤):

```ts
    // 건너뛴 압축 파일도 읽지 못한 기록이다(설계 「5단계 계획 전 결정」 2번, 「5단계 4부 계획 전 결정」 2번)
    unreadable: result.notices.some((notice) => notice.kind === "record_unreadable" || notice.kind === "record_skipped"),
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/result-coverage.test.ts test/core/result-notices-record.test.ts test/core/copy-notices.test.ts test/core/result-notices-setup.test.ts test/core/result-summary.test.ts test/commands/checkup-input.test.ts test/report/view.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 7개, 시험 95개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/commands/checkup-input.test.ts test/core/copy-notices.test.ts test/core/result-coverage.test.ts test/core/result-notices-record.test.ts test/core/result-notices-setup.test.ts test/core/result-summary.test.ts test/report/view.test.ts src/adapters/claude/observation.ts src/commands/checkup-input.ts src/core/copy/notices.ts src/core/result/coverage.ts src/core/result/notices.ts src/core/result/summary.ts src/core/result/tools.ts src/report/view.ts
git commit -m "feat: 읽은 양과 기록 쪽 알림에 Codex를 넣음"
```

---

### Task 2: 셋팅 쪽 알림과 정밀 점검 단서에 Codex

**Files:**
- Modify: `test/core/copy-notices.test.ts`
- Modify: `test/core/result-hints.test.ts`
- Modify: `test/core/result-notices-setup.test.ts`
- Modify: `src/core/copy/notices.ts`
- Modify: `src/core/result/hints.ts`
- Modify: `src/core/result/notices.ts`

**Interfaces:**
- Consumes: 5단계 2부의 `CodexSetupFacts`, `CodexPluginFact`, `CodexProjectFact`(`src/scan/types.ts`), 지침 묶음(`InstructionSet`, `src/scan/instructions.ts`). 과제 1의 알림 꼴과 문장.
- Produces: 읽지 못한 셋팅의 Codex 자리 `codex_config`와 `codex_project_config`(`UnreadableSetup`, `src/core/result/notices.ts`)와 그 문구, Codex의 정밀 점검 단서, 두 도구 단서 `tools_instructions_differ`(`DeepHint`, `src/core/result/hints.ts`).

설계 「5단계 4부 계획 전 결정」 5·8번이다.

- 셋팅 쪽 알림(결정 5). 읽지 못한 사용자 `config.toml`, 신뢰한 프로젝트의 설정(대상은 입력 묶음의 프로젝트 목록에서 얻은 경로), 스킬 폴더, 지침, `SKILL.md`를 나눠 알린다. 켜져 있는데 세지 않은 플러그인은 구성을 모르는 것, 스킬 폴더를 읽지 못한 것, MCP 정의를 읽지 못한 것이다. 플러그인 안의 문제는 점수에 세지 않는 문제로 알린다. 점수에 세지 않는 문제를 만드는 코드는 두 도구가 함께 쓴다.
- 문구에는 경로를 넣지 않으므로 Codex의 자리 이름도 `config.toml`과 "프로젝트의 config.toml"로 적는다.
- 단서(결정 8). Codex 몫은 Claude Code와 같은 셋을 Codex의 셋팅 사실로 낸다. 되풀이되는 줄은 스캐너가 읽은 프로젝트의 지침에서 센다. 두 도구 단서는 두 전역 지침의 줄 지문이 모두 있고, 실제 경로가 같은 파일을 나누지 않으며, 나눈 줄이 줄이 적은 쪽의 절반에 못 미칠 때 낸다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-notices.test.ts`(찾을 곳):

```ts
    expect(noticeText({ kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] }, "ko")).toBe("Claude Code에서 읽지 못한 셋팅이 있습니다(.claude.json). 읽은 것만으로 계산했습니다.");
    expect(noticeText(of("version_unverified"), "ko")).toBe("Claude Code 기록에 확인한 범위(2.1.220~2.1.322) 밖의 버전이 1개 있습니다. 읽을 수 있는 필드만으로 계산했습니다.");
```

`test/core/copy-notices.test.ts`(바꾼 뒤):

```ts
    expect(noticeText({ kind: "setup_unreadable", tool: "claude-code", what: "claude_json", targets: [] }, "ko")).toBe("Claude Code에서 읽지 못한 셋팅이 있습니다(.claude.json). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "codex", what: "codex_config", targets: [] }, "ko")).toBe("Codex에서 읽지 못한 셋팅이 있습니다(config.toml). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "codex", what: "codex_project_config", targets: ["/secret/p"] }, "ko")).toBe("Codex에서 읽지 못한 셋팅이 있습니다(프로젝트의 config.toml 1곳). 읽은 것만으로 계산했습니다.");
    expect(noticeText({ kind: "setup_unreadable", tool: "codex", what: "codex_project_config", targets: ["/secret/p"] }, "en")).toBe("Codex: some setup could not be read (project config.toml, 1 place). Only what was read is counted.");
    expect(noticeText(of("version_unverified"), "ko")).toBe("Claude Code 기록에 확인한 범위(2.1.220~2.1.322) 밖의 버전이 1개 있습니다. 읽을 수 있는 필드만으로 계산했습니다.");
```

`test/core/result-hints.test.ts`(찾을 곳 1/2):

```ts
  it("Codex의 단서는 아직 내지 않는다. 4부가 넣는다(설계 「5단계 3부 계획 전 결정」 13번)", () => {
```

`test/core/result-hints.test.ts`(바꾼 뒤 1/2):

```ts
  it("Codex의 단서 셋을 Codex의 셋팅 사실로 낸다. 프로젝트의 경로는 입력 묶음의 프로젝트 목록에서 얻고, 스캐너가 읽지 않은 프로젝트의 지침은 보지 않는다(설계 「5단계 4부 계획 전 결정」 8번)", () => {
```

`test/core/result-hints.test.ts`(찾을 곳 2/2):

```ts
    const lines = instructions({ lineHashes: ["x", "y", "z"] });
    const codex = codexTool({ setup: { globalInstructions: big, globalMentions: { "/work/a": MENTION_HINT_MIN }, projects: [codexProject("/work/a", { instructions: lines }), codexProject("/work/b", { instructions: lines })] } });
    expect(deepHints(evaluationInput([codex]))).toEqual([]);
```

`test/core/result-hints.test.ts`(바꾼 뒤 2/2):

```ts
    const lines = instructions({ lineHashes: ["x", "y", "z", "a"] });
    const codex = codexTool({
      setup: {
        globalInstructions: big,
        globalMentions: { "/work/a": MENTION_HINT_MIN, "/work/b": MENTION_HINT_MIN - 1 },
        projects: [codexProject("/work/a", { instructions: lines }), codexProject("/work/b", { instructions: lines }), codexProject("/work/c", { scanned: false, instructions: lines })],
      },
    });
    const input = evaluationInput([codex], { projects: [project("C:/Work/A", { normRoot: "/work/a" }), project("C:/Work/B", { normRoot: "/work/b" })] });
    expect(deepHints(input)).toEqual([
      { kind: "global_mentions_project", tool: "codex", projects: [{ root: "C:/Work/A", mentions: MENTION_HINT_MIN }] },
      { kind: "repeated_project_lines", tool: "codex", lines: 3, projects: ["C:/Work/A", "C:/Work/B"] },
      { kind: "large_global_instructions", tool: "codex", tokens: LARGE_GLOBAL_TOKENS + 1 },
    ]);
  });

  it("두 도구의 전역 지침이 같은 원본이 아니고 겹치는 줄이 줄이 적은 쪽의 절반에 못 미치면 두 도구 단서를 낸다(설계 17, 「5단계 4부 계획 전 결정」 8번)", () => {
    const file = (realPath: string) => ({ path: realPath, realPath, bytes: 10, hasContent: true, sameAsGlobal: false });
    const both = (claude: Partial<Parameters<typeof instructions>[0]>, codex: Partial<Parameters<typeof instructions>[0]>) =>
      deepHints(evaluationInput([claudeTool({ setup: { globalInstructions: instructions(claude) } }), codexTool({ setup: { globalInstructions: instructions(codex) } })])).filter((hint) => hint.kind === "tools_instructions_differ");
    // 넷 가운데 하나만 겹친다(절반에 못 미친다)
    expect(both({ files: [file("/h/.claude/CLAUDE.md")], lineHashes: ["a", "b", "c", "d"] }, { files: [file("/h/.codex/AGENTS.md")], lineHashes: ["a", "x", "y", "z", "w"] })).toEqual([
      { kind: "tools_instructions_differ", shared: 1, lines: { "claude-code": 4, codex: 5 } },
    ]);
    // 정확히 절반은 못 미친 것이 아니다
    expect(both({ files: [file("/h/.claude/CLAUDE.md")], lineHashes: ["a", "b", "c", "d"] }, { files: [file("/h/.codex/AGENTS.md")], lineHashes: ["a", "b", "x", "y"] })).toEqual([]);
    // 실제 경로가 같은 파일을 나누면 같은 원본이다
    expect(both({ files: [file("/h/.claude/CLAUDE.md")], lineHashes: ["a", "b"] }, { files: [{ ...file("/h/.claude/CLAUDE.md"), path: "/h/.codex/AGENTS.md" }], lineHashes: ["x", "y"] })).toEqual([]);
    // 한 도구라도 줄 지문이 없으면 내지 않는다
    expect(both({ files: [file("/h/.claude/CLAUDE.md")], lineHashes: ["a"] }, { files: [], lineHashes: [] })).toEqual([]);
```

`test/core/result-notices-setup.test.ts`(찾을 곳 1/2):

```ts
import { NOTICE_KINDS, setupNotices } from "../../src/core/result/notices.ts";
import { HOME, instructions, plugin, project, skill } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";
```

`test/core/result-notices-setup.test.ts`(바꾼 뒤 1/2):

```ts
import { NOTICE_KINDS, setupNotices } from "../../src/core/result/notices.ts";
import { codexPlugin, codexProject, HOME, instructions, plugin, project, skill } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";
```

`test/core/result-notices-setup.test.ts`(찾을 곳 2/2):

```ts

describe("셋팅 쪽 알림", () => {
  it("Codex의 셋팅 쪽 알림은 아직 내지 않는다. 4부가 넣는다(설계 「5단계 3부 계획 전 결정」 13번)", () => {
    const codex = codexTool({ sessions: enough, setup: { config: "unparsable", unreadableDirs: ["/home/u/.agents/skills"] } });
    const input = evaluationInput([codex, claudeTool({ sessions: enough })]);
    expect(setupNotices(input, evaluate(input), { stateBroken: false }).filter((notice) => "tool" in notice)).toEqual([]);
  });
  it("빠진 것이 없으면 알림이 없다", () => {
```

`test/core/result-notices-setup.test.ts`(바꾼 뒤 2/2):

```ts

describe("셋팅 쪽 알림의 Codex 몫(설계 「5단계 4부 계획 전 결정」 5번)", () => {
  const codexNoticesOf = (setup: NonNullable<Parameters<typeof codexTool>[0]>["setup"], projects = [project("/work/a")]) => {
    const input = evaluationInput([claudeTool({ sessions: enough, setup: { projects } }), codexTool({ sessions: enough, setup })]);
    return setupNotices(input, evaluate(input), { stateBroken: false }).filter((notice) => "tool" in notice && notice.tool === "codex");
  };

  it("빠진 것이 없으면 알림이 없다", () => {
    expect(codexNoticesOf({})).toEqual([]);
  });

  it("읽지 못한 사용자 config.toml, 신뢰한 프로젝트의 설정, 스킬 폴더, 지침, SKILL.md를 나눠 알린다. 프로젝트의 대상은 그 프로젝트의 경로다", () => {
    const notices = codexNoticesOf(
      {
        config: "unparsable",
        projects: [codexProject("/work/a", { configStatus: "unreadable" }), codexProject("/work/b", { trust: "untrusted", configStatus: null })],
        unreadableDirs: ["/h/.agents/skills/deep"],
        globalInstructions: instructions({ unreadable: ["/h/.codex/AGENTS.md"] }),
        skills: [skill("odd", { readable: false, path: "/h/.agents/skills/odd" })],
      },
      [project("/work/a"), project("/work/b")],
    );
    expect(notices).toEqual([
      { kind: "setup_unreadable", tool: "codex", what: "codex_config", targets: [] },
      { kind: "setup_unreadable", tool: "codex", what: "codex_project_config", targets: ["/work/a"] },
      { kind: "setup_unreadable", tool: "codex", what: "skill_dirs", targets: ["/h/.agents/skills/deep"] },
      { kind: "setup_unreadable", tool: "codex", what: "instructions", targets: ["/h/.codex/AGENTS.md"] },
      { kind: "setup_unreadable", tool: "codex", what: "skill_files", targets: ["/h/.agents/skills/odd"] },
    ]);
  });

  it("구성을 모르는 켜진 플러그인, 스킬 폴더를 읽지 못한 켜진 플러그인, MCP 정의를 읽지 못한 플러그인을 알린다. 설정으로 켜지 않은 것은 세지 않는다", () => {
    const notices = codexNoticesOf({
      plugins: [
        codexPlugin("agent@m", { enabled: false, compositionKnown: false }),
        codexPlugin("broken@m", { mcpUnreadable: true }),
        codexPlugin("skills@m"),
        codexPlugin("off@m", { configured: false, enabled: false, compositionKnown: false }),
      ],
      unreadableSkillPlaces: { user: false, projects: [], plugins: ["skills@m", "off@m"] },
    });
    expect(notices).toEqual([
      { kind: "plugins_uncounted", tool: "codex", why: "composition_unknown", plugins: ["agent@m"] },
      { kind: "plugins_uncounted", tool: "codex", why: "skills_unreadable", plugins: ["skills@m"] },
      { kind: "plugins_uncounted", tool: "codex", why: "mcp_unreadable", plugins: ["broken@m"] },
    ]);
  });

  it("Codex 플러그인 안의 문제는 점수에 세지 않는 문제로 알린다. 사용자가 고치는 문제는 S3이 센다", () => {
    const notices = codexNoticesOf({
      problems: [
        { kind: "noFrontmatter", owner: "plugin", path: "/h/.codex/plugins/cache/m/p/1.0.0/skills/x", realPath: null, place: null },
        { kind: "danglingLink", owner: "user", path: "/h/.agents/skills/y", realPath: null, place: "~/.agents/skills/y" },
      ],
    });
    expect(notices).toEqual([{ kind: "setup_problems_unscored", tool: "codex", problems: [{ kind: "noFrontmatter", path: "/h/.codex/plugins/cache/m/p/1.0.0/skills/x" }] }]);
  });
});

describe("셋팅 쪽 알림", () => {
  it("빠진 것이 없으면 알림이 없다", () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-notices.test.ts test/core/result-hints.test.ts test/core/result-notices-setup.test.ts`
Expected: FAIL. 바뀐 시험 파일 셋이 실패한다. Codex의 셋팅 쪽 알림과 정밀 점검 단서를 내지 않고, Codex 셋팅 자리의 문구와 두 도구 단서가 없다.

- [ ] **Step 3: 구현한다**

`src/core/copy/notices.ts`(찾을 곳):

```ts
  plugins_file: { en: "plugin install records", ko: "플러그인 설치 기록" },
  skill_dirs: { en: "skill folders", ko: "스킬 폴더" },
```

`src/core/copy/notices.ts`(바꾼 뒤):

```ts
  plugins_file: { en: "plugin install records", ko: "플러그인 설치 기록" },
  codex_config: { en: "config.toml", ko: "config.toml" },
  codex_project_config: { en: "project config.toml", ko: "프로젝트의 config.toml" },
  skill_dirs: { en: "skill folders", ko: "스킬 폴더" },
```

`src/core/result/hints.ts`(찾을 곳 1/3):

```ts
// 정밀 점검 단서를 만든다. 규칙으로 찾을 수 있는 약한 신호이고 점수에 넣지 않는다. 두 도구의 전역 지침을 견주는 단서는 Codex를 넣을 때(5단계) 더한다(순수 함수, 설계 17)
import type { ToolId } from "../../adapters/types.ts";
import type { EvaluationInput } from "../evaluate.ts";
import { ruleSpec } from "../rules.ts";
```

`src/core/result/hints.ts`(바꾼 뒤 1/3):

```ts
// 정밀 점검 단서를 만든다. 규칙으로 찾을 수 있는 약한 신호이고 점수에 넣지 않는다. 도구마다의 단서 셋과 두 도구의 전역 지침을 견주는 단서다(순수 함수, 설계 17, 「5단계 4부 계획 전 결정」 8번)
import type { ToolId } from "../../adapters/types.ts";
import type { InstructionSet } from "../../scan/instructions.ts";
import type { EvaluationInput, ToolInput } from "../evaluate.ts";
import { ruleSpec } from "../rules.ts";
```

`src/core/result/hints.ts`(찾을 곳 2/3):

```ts
  | { kind: "repeated_project_lines"; tool: ToolId; lines: number; projects: string[] }
  | { kind: "large_global_instructions"; tool: ToolId; tokens: number };

```

`src/core/result/hints.ts`(바꾼 뒤 2/3):

```ts
  | { kind: "repeated_project_lines"; tool: ToolId; lines: number; projects: string[] }
  | { kind: "large_global_instructions"; tool: ToolId; tokens: number }
  | { kind: "tools_instructions_differ"; shared: number; lines: Record<ToolId, number> };

```

`src/core/result/hints.ts`(찾을 곳 3/3):

```ts

export function deepHints(input: EvaluationInput): DeepHint[] {
  const hints: DeepHint[] = [];
  for (const tool of [...input.tools].sort((a, b) => byText(a.tool, b.tool))) {
    // Codex의 정밀 점검 단서는 4부가 넣는다(설계 「5단계 3부 계획 전 결정」 13번)
    if (tool.tool !== "claude-code") continue;
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
```

`src/core/result/hints.ts`(바꾼 뒤 3/3):

```ts

/** 도구 하나의 단서에 쓰는 셋팅. 프로젝트는 그 도구가 셋팅을 읽은 것만이고 경로는 입력 묶음의 프로젝트 목록과 같다 */
interface HintSetup {
  globalInstructions: InstructionSet;
  globalMentions: Record<string, number>;
  projects: { root: string; instructions: InstructionSet }[];
  rootOf: Map<string, string>;
}

function hintSetup(tool: ToolInput, input: EvaluationInput): HintSetup {
  if (tool.tool === "claude-code") {
    const { setup } = tool;
    return {
      globalInstructions: setup.globalInstructions,
      globalMentions: setup.globalMentions,
      projects: setup.projects.filter((item) => item.exists && !item.excluded).map((project) => ({ root: project.root, instructions: project.instructions })),
      rootOf: new Map(setup.projects.map((project) => [project.normRoot, project.root])),
    };
  }
  // Codex의 프로젝트 사실에는 경로가 없어 입력 묶음의 프로젝트 목록에서 얻는다. 스캐너가 읽지 않은 프로젝트의 지침은 보지 않는다
  const rootOf = new Map(input.projects.map((project) => [project.normRoot, project.root]));
  const { setup } = tool;
  return {
    globalInstructions: setup.globalInstructions,
    globalMentions: setup.globalMentions,
    projects: setup.projects.filter((project) => project.scanned).map((project) => ({ root: rootOf.get(project.normRoot) ?? project.normRoot, instructions: project.instructions })),
    rootOf,
  };
}

function toolHints(tool: ToolId, setup: HintSetup): DeepHint[] {
  const hints: DeepHint[] = [];
  const mentioned = Object.entries(setup.globalMentions)
    .filter(([, count]) => count >= MENTION_HINT_MIN)
    .map(([normRoot, count]) => ({ root: setup.rootOf.get(normRoot) ?? normRoot, mentions: count }))
    .sort((a, b) => byText(a.root, b.root));
  if (mentioned.length > 0) hints.push({ kind: "global_mentions_project", tool, projects: mentioned });

  // 전역 지침에도 있는 줄은 전역과 겹치는 것(F4)이라 세지 않는다
  const global = new Set(setup.globalInstructions.lineHashes);
  const seen = new Map<string, string[]>();
  for (const project of setup.projects) {
    for (const hash of new Set(project.instructions.lineHashes)) {
      if (global.has(hash)) continue;
      seen.set(hash, [...(seen.get(hash) ?? []), project.root]);
    }
  }
  const repeated = [...seen.values()].filter((roots) => roots.length >= 2);
  if (repeated.length >= REPEATED_LINES_HINT_MIN) hints.push({ kind: "repeated_project_lines", tool, lines: repeated.length, projects: [...new Set(repeated.flat())].sort(byText) });

  const { ascii, other } = setup.globalInstructions.chars;
  const tokens = ascii / 4 + other;
  if (tokens > LARGE_GLOBAL_TOKENS) hints.push({ kind: "large_global_instructions", tool, tokens });
  return hints;
}

/**
 * 두 도구의 전역 지침이 같은 원본이 아니고 겹치는 줄이 적다. 같은 원본은 실제 경로가 같은 파일을 하나라도 나누는 것이고, 적다는 것은 두 지침에 모두 있는 줄이
 * 줄이 적은 쪽의 절반에 못 미치는 것이다. 한 도구라도 줄 지문이 없으면 견주지 않는다
 */
function toolsDiffer(claude: InstructionSet, codex: InstructionSet): DeepHint | null {
  if (claude.lineHashes.length === 0 || codex.lineHashes.length === 0) return null;
  const codexReal = new Set(codex.files.map((file) => file.realPath).filter((realPath): realPath is string => realPath !== null));
  if (claude.files.some((file) => file.realPath !== null && codexReal.has(file.realPath))) return null;
  // 줄 지문은 지침마다 중복이 없다
  const codexLines = new Set(codex.lineHashes);
  const shared = claude.lineHashes.filter((hash) => codexLines.has(hash)).length;
  const fewer = Math.min(claude.lineHashes.length, codex.lineHashes.length);
  return shared * 2 < fewer ? { kind: "tools_instructions_differ", shared, lines: { "claude-code": claude.lineHashes.length, codex: codex.lineHashes.length } } : null;
}

export function deepHints(input: EvaluationInput): DeepHint[] {
  const tools = [...input.tools].sort((a, b) => byText(a.tool, b.tool));
  const hints = tools.flatMap((tool) => toolHints(tool.tool, hintSetup(tool, input)));
  const claude = tools.find((tool) => tool.tool === "claude-code");
  const codex = tools.find((tool) => tool.tool === "codex");
  const differ = claude === undefined || codex === undefined ? null : toolsDiffer(claude.setup.globalInstructions, codex.setup.globalInstructions);
  if (differ !== null) hints.push(differ);
  return hints;
```

`src/core/result/notices.ts`(찾을 곳 1/5):

```ts
import { compareVersions, parseVersion } from "../../adapters/common/version.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { FileStatus, SetupProblem } from "../../scan/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { Withheld } from "../scoreboard.ts";
```

`src/core/result/notices.ts`(바꾼 뒤 1/5):

```ts
import { compareVersions, parseVersion } from "../../adapters/common/version.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { CodexSetupFacts, FileStatus, ProjectFact, SetupProblem } from "../../scan/types.ts";
import type { Evaluation, EvaluationInput } from "../evaluate.ts";
import type { Withheld } from "../scoreboard.ts";
```

`src/core/result/notices.ts`(찾을 곳 2/5):

```ts
export const WEAK_REQUEST_SHARE = 0.1;

/** 있는데 읽지 못한 셋팅이 무엇인지. 이 차례로 싣는다 */
export type UnreadableSetup = "claude_json" | "user_settings" | "managed_settings" | "project_settings" | "local_settings" | "mcp_json" | "plugins_file" | "skill_dirs" | "instructions" | "hook_settings" | "skill_files";
/** 켜져 있는 플러그인을 세지 않은 까닭. 이 차례로 싣는다(설계 10 「구성을 모르는 플러그인」, 11.3 E5·E6, 16.2) */
export type UncountedPlugin = "composition_unknown" | "not_installed" | "skills_unreadable" | "mcp_unreadable" | "hooks_unreadable";
```

`src/core/result/notices.ts`(바꾼 뒤 2/5):

```ts
export const WEAK_REQUEST_SHARE = 0.1;

/** 있는데 읽지 못한 셋팅이 무엇인지. 이 차례로 싣는다. codex_config와 codex_project_config는 Codex의 사용자 config.toml과 신뢰한 프로젝트의 .codex/config.toml이다 */
export type UnreadableSetup =
  | "claude_json"
  | "user_settings"
  | "managed_settings"
  | "project_settings"
  | "local_settings"
  | "mcp_json"
  | "plugins_file"
  | "codex_config"
  | "codex_project_config"
  | "skill_dirs"
  | "instructions"
  | "hook_settings"
  | "skill_files";
/** 켜져 있는 플러그인을 세지 않은 까닭. 이 차례로 싣는다(설계 10 「구성을 모르는 플러그인」, 11.3 E5·E6, 16.2) */
export type UncountedPlugin = "composition_unknown" | "not_installed" | "skills_unreadable" | "mcp_unreadable" | "hooks_unreadable";
```

`src/core/result/notices.ts`(찾을 곳 3/5):

```ts
const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(byText);

/**
 * 셋팅 쪽 알림과 실행 입력 알림. 있는데 읽지 못한 셋팅, 켜져 있는데 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제,
```

`src/core/result/notices.ts`(바꾼 뒤 3/5):

```ts
const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(byText);

/** 도구가 쓰는 파일(.claude.json)의 문제는 읽지 못한 셋팅으로 이미 알린다. 사용자가 고치는 셋팅의 문제는 S3이 센다 */
function unscoredProblems(tool: ToolId, problems: readonly SetupProblem[]): Notice[] {
  const unscored = problems.filter((problem) => problem.owner === "plugin" || problem.owner === "managed").map((problem) => ({ kind: problem.kind, path: problem.path }));
  return unscored.length > 0 ? [{ kind: "setup_problems_unscored", tool, problems: unscored.sort((a, b) => byText(a.path, b.path) || byText(a.kind, b.kind)) }] : [];
}

/**
 * Codex의 셋팅 쪽 알림. 읽지 못한 사용자 config.toml과 신뢰한 프로젝트의 설정, 스킬 폴더, 지침, SKILL.md, 켜져 있는데 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제다.
 * Codex에는 설치 기록 파일과 플러그인 훅이 없다. 프로젝트의 경로는 입력 묶음의 프로젝트 목록에서 얻는다(설계 「5단계 4부 계획 전 결정」 5번)
 */
function codexSetupNotices(setup: CodexSetupFacts, projects: readonly ProjectFact[]): Notice[] {
  const notices: Notice[] = [];
  const rootOf = new Map(projects.map((project) => [project.normRoot, project.root]));
  const unreadable: [UnreadableSetup, boolean, string[]][] = [
    ["codex_config", unread(setup.config), []],
    ["codex_project_config", false, setup.projects.filter((project) => project.trust === "trusted" && unread(project.configStatus)).map((project) => rootOf.get(project.normRoot) ?? project.normRoot)],
    ["skill_dirs", false, setup.unreadableDirs],
    ["instructions", false, [setup.globalInstructions, ...setup.projects.map((project) => project.instructions)].flatMap((set) => [...set.unreadable, ...set.unreadableDirs])],
    ["skill_files", false, setup.skills.filter((skill) => !skill.readable).map((skill) => skill.path)],
  ];
  for (const [what, whole, targets] of unreadable) {
    if (whole || targets.length > 0) notices.push({ kind: "setup_unreadable", tool: "codex", what, targets: sortedUnique(targets) });
  }
  const enabledIds = new Set(setup.plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.id));
  const uncounted: [UncountedPlugin, string[]][] = [
    // 설정으로 켰는데 놓인 곳이나 매니페스트를 읽지 못했거나 Agent Plugins 형식이라 구성을 모르는 것(설계 「5단계 2부 계획 전 결정」 8번)
    ["composition_unknown", setup.plugins.filter((plugin) => plugin.configured && !plugin.compositionKnown).map((plugin) => plugin.id)],
    ["skills_unreadable", setup.unreadableSkillPlaces.plugins.filter((id) => enabledIds.has(id))],
    ["mcp_unreadable", setup.plugins.filter((plugin) => plugin.enabled && plugin.mcpUnreadable).map((plugin) => plugin.id)],
  ];
  for (const [why, plugins] of uncounted) {
    if (plugins.length > 0) notices.push({ kind: "plugins_uncounted", tool: "codex", why, plugins: sortedUnique(plugins) });
  }
  notices.push(...unscoredProblems("codex", setup.problems));
  return notices;
}

/**
 * 셋팅 쪽 알림과 실행 입력 알림. 있는데 읽지 못한 셋팅, 켜져 있는데 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제,
```

`src/core/result/notices.ts`(찾을 곳 4/5):

```ts

  for (const tool of input.tools) {
    // Codex의 셋팅 쪽 알림은 4부가 넣는다(설계 「5단계 3부 계획 전 결정」 13번)
    if (tool.tool !== "claude-code") continue;
    const id = tool.tool;
    const setup = tool.setup;
```

`src/core/result/notices.ts`(바꾼 뒤 4/5):

```ts

  for (const tool of input.tools) {
    if (tool.tool === "codex") {
      notices.push(...codexSetupNotices(tool.setup, input.projects));
      continue;
    }
    const id = tool.tool;
    const setup = tool.setup;
```

`src/core/result/notices.ts`(찾을 곳 5/5):

```ts
    }

    // 도구가 쓰는 파일(.claude.json)의 문제는 읽지 못한 셋팅으로 이미 알린다. 사용자가 고치는 셋팅의 문제는 S3이 센다
    const problems = setup.problems.filter((problem) => problem.owner === "plugin" || problem.owner === "managed").map((problem) => ({ kind: problem.kind, path: problem.path }));
    if (problems.length > 0) notices.push({ kind: "setup_problems_unscored", tool: id, problems: problems.sort((a, b) => byText(a.path, b.path) || byText(a.kind, b.kind)) });
  }

```

`src/core/result/notices.ts`(바꾼 뒤 5/5):

```ts
    }

    notices.push(...unscoredProblems(id, setup.problems));
  }

```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/result-notices-setup.test.ts test/core/result-hints.test.ts test/core/copy-notices.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 47개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-notices.test.ts test/core/result-hints.test.ts test/core/result-notices-setup.test.ts src/core/copy/notices.ts src/core/result/hints.ts src/core/result/notices.ts
git commit -m "feat: 셋팅 쪽 알림과 정밀 점검 단서에 Codex를 넣음"
```

---

### Task 3: S2 문장과 대신 본 값의 줄에 Codex

**Files:**
- Modify: `test/core/copy-findings.test.ts`
- Modify: `test/core/result-assemble.test.ts`
- Modify: `src/core/copy/common.ts`
- Modify: `src/core/copy/findings.ts`
- Modify: `src/core/copy/rules-setup.ts`
- Modify: `src/core/copy/types.ts`
- Modify: `src/core/result/assemble.ts`
- Modify: `src/core/result/observed.ts`

**Interfaces:**
- Consumes: 5단계 3부의 도구별 안전장치(`ToolSafeguard`, `src/core/metrics/setup.ts`), 결과의 도구별 값과 그 관측 범위(`ResultToolValue.observed`, `src/core/result/assemble.ts`), 평가의 점수에 넣는 도구(`Evaluation.tools`)와 입력의 관측 범위.
- Produces: `RuleCopy.prescriptionByTool`(`src/core/copy/types.ts`), S2의 두 도구 문장(`src/core/copy/rules-setup.ts`), `SAFEGUARD_COPY`의 Codex 조건과 뺀 도구의 말, `PROXY_LINE`, `TOOL_CALL_GRAIN`(`src/core/copy/common.ts`), 합침 규칙을 잰 도구와 관측 범위(`MERGED_RULE_METRICS`, `mergedObserved`, `src/core/result/observed.ts`. 문장을 지을 때만 `FindingDetails.mergedTools`로 넘기고 결과의 `details`에는 싣지 않는다).

설계 「5단계 4부 계획 전 결정」 6·7번이다.

- S2(결정 6). 잘함 제목과 설명(`good`, `why`), 할 일의 제목(`fix`)은 두 도구에 맞는 말이다(Codex는 확인 훅이 아니라 승인 요청이나 샌드박스 제한으로 인정된다. 계획 리뷰 1차). 정비할 것의 설명은 설정을 읽은 도구 가운데의 몫을 말하고, 어떻게 쟀나는 두 도구의 조건과 읽지 못한 도구를 빼고 잰다는 것을 적는다. 처방은 안전장치가 없는 도구(읽지 못해 뺀 도구는 아니다)마다의 문장을 도구의 차례로 잇는다. 그런 도구가 없을 때의 처방은 두 도구에 맞는 짧은 문장이다.
- 도구별 안전장치 줄. Codex는 승인 없음과 샌드박스 전면 해제를 함께 쓰는 곳이 있는지로 적고, 설정을 읽지 못한 도구는 빼고 쟀다고 적는다.
- 대신 본 값(결정 7). 그 규칙을 잰 도구 가운데 관측 범위가 대신 봄인 도구마다 어떻게 쟀나에 한 줄을 더한다. 도구별 규칙은 잰 도구별 값으로 보고, 도구별 값이 없는 합침 규칙(I2, I3)은 결과 조립이 넘긴 그 규칙을 잰 도구(점수에 넣는 도구 가운데 그 지표를 모두 보는 것)로 본다. I3을 두 도구로 쟀으면 도구 호출을 세는 굵기의 줄을 더한다(계획 리뷰 1차가 합침 규칙에서 줄이 빠지는 것을 찾았다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-findings.test.ts`(찾을 곳 1/2):

```ts
import { findingText, joinValue, RULE_COPY, type FindingInput } from "../../src/core/copy/findings.ts";
import type { ResultToolValue, UnjudgedServer } from "../../src/core/result/assemble.ts";
```

`test/core/copy-findings.test.ts`(바꾼 뒤 1/2):

```ts
import { findingText, joinValue, RULE_COPY, type FindingInput } from "../../src/core/copy/findings.ts";
import type { ToolSafeguard } from "../../src/core/metrics/setup.ts";
import type { ResultToolValue, UnjudgedServer } from "../../src/core/result/assemble.ts";
```

`test/core/copy-findings.test.ts`(찾을 곳 2/2):

```ts
    expect(line(false, false)).toBe("Claude Code: 안전장치 없음(권한 우회 모드이고 셸 명령을 덮는 확인 훅이 없음)");
    expect(line(null, true)).toBe("Claude Code: 설정 파일을 읽지 못해 가리지 못함");
  });
```

`test/core/copy-findings.test.ts`(바꾼 뒤 2/2):

```ts
    expect(line(false, false)).toBe("Claude Code: 안전장치 없음(권한 우회 모드이고 셸 명령을 덮는 확인 훅이 없음)");
    expect(line(null, true)).toBe("Claude Code: 안전장치를 정하는 설정 파일을 읽지 못해 빼고 쟀음");
  });

  it("Codex의 안전장치 줄은 승인 없음과 샌드박스 전면 해제를 함께 쓰는 곳이 있는지로 적는다(설계 「5단계 4부 계획 전 결정」 6번)", () => {
    const s2 = finding("S2", { axis: "setup", value: 0.5, score: 0.5, category: "repair", evidence: { guarded: 1, tools: 2, unreadTools: 0 } });
    const line = (permissionChecks: boolean | null) => findingText(s2, { safeguards: [{ tool: "codex", guardHook: permissionChecks === null ? null : false, permissionChecks }], unjudgedServers: [] }, "ko").method.at(-1);
    expect(line(true)).toBe("Codex: 승인 없음과 샌드박스 전면 해제를 함께 쓰는 곳이 없음");
    expect(line(false)).toBe("Codex: 안전장치 없음(승인 없음과 샌드박스 전면 해제를 함께 쓰는 곳이 있음)");
    expect(line(null)).toBe("Codex: 안전장치를 정하는 설정 파일을 읽지 못해 빼고 쟀음");
  });

  it("S2의 처방은 안전장치가 없는 도구마다의 문장을 도구의 차례로 잇는다", () => {
    const s2 = finding("S2", { axis: "setup", value: 0, score: 0, category: "repair", evidence: { guarded: 0, tools: 2, unreadTools: 0 } });
    const prescription = (safeguards: ToolSafeguard[]) => findingText(s2, { safeguards, unjudgedServers: [] }, "ko").prescription;
    const byTool = RULE_COPY.S2.ko.prescriptionByTool!;
    const none = (tool: ToolSafeguard["tool"]): ToolSafeguard => ({ tool, guardHook: false, permissionChecks: false });
    expect(prescription([none("claude-code"), { tool: "codex", guardHook: false, permissionChecks: true }])).toBe(byTool["claude-code"]);
    expect(prescription([{ tool: "claude-code", guardHook: true, permissionChecks: false }, none("codex")])).toBe(byTool.codex);
    expect(prescription([none("codex"), none("claude-code")])).toBe(`${byTool["claude-code"]} ${byTool.codex}`);
    // 읽지 못해 뺀 도구는 처방에 넣지 않는다
    expect(prescription([none("claude-code"), { tool: "codex", guardHook: null, permissionChecks: null }])).toBe(byTool["claude-code"]);
    expect(byTool.codex).toBe("Codex에서 승인 정책을 never로 두려면 샌드박스를 전면 해제(danger-full-access)하지 마세요. 전면 해제가 필요하면 승인 정책을 on-request로 두세요. 사용자 config.toml과 신뢰한 프로젝트의 설정을 모두 봅니다.");
    for (const lang of ["en", "ko"] as const) {
      const texts = RULE_COPY.S2[lang].prescriptionByTool!;
      expect(Object.keys(texts).sort()).toEqual(["claude-code", "codex"]);
      for (const text of Object.values(texts)) expect(text, `${lang}: ${text}`).toMatch(/[.!?]$/);
    }
  });

  it("도구별 값을 대신 본 것으로 쟀으면 그 도구마다 어떻게 쟀나에 가까운 값이라는 줄을 더한다. 못 잰 도구에는 더하지 않는다(설계 9.7, 「5단계 4부 계획 전 결정」 7번)", () => {
    const tools = [toolValue({ tool: "claude-code" }), toolValue({ tool: "codex", observed: "proxy" })];
    const e3 = finding("E3", { kind: "rate", tools });
    expect(findingText(e3, NONE, "ko").method.at(-1)).toBe("Codex: 기록이 그대로 남기지 않는 값이라 가까운 값으로 쟀습니다.");
    expect(findingText(e3, NONE, "en").method.at(-1)).toBe("Codex: the records do not show this directly, so the value is approximate.");
    const measuredOnly = findingText({ ...e3, tools: [toolValue({ tool: "claude-code" })] }, NONE, "ko").method;
    expect(measuredOnly.some((line) => line.includes("가까운 값"))).toBe(false);
    const unmeasured = findingText({ ...e3, tools: [toolValue({ tool: "codex", status: "unmeasured", reason: "no_data", value: null, score: null, observed: "proxy" })] }, NONE, "ko").method;
    expect(unmeasured.some((line) => line.includes("가까운 값"))).toBe(false);
  });

  it("합침 규칙은 결과 조립이 넘긴 그 규칙을 잰 도구로 본다. I3을 두 도구로 쟀으면 도구 호출을 세는 굵기의 줄을 더한다(4부 계획 리뷰 1차)", () => {
    const i3 = finding("I3", { axis: "intensity", kind: "rate", evidence: { humanRequests: 42, toolCalls: 42 } });
    const both = { ...NONE, mergedTools: { I3: [{ tool: "claude-code" as const, observed: "measured" as const }, { tool: "codex" as const, observed: "proxy" as const }] } };
    const line = "도구 호출을 세는 굵기가 도구마다 다릅니다. Claude Code는 모델이 낸 호출 하나가, Codex는 실제로 실행된 작업 하나가 하나입니다.";
    expect(findingText(i3, both, "ko").method.slice(-2)).toEqual(["Codex: 기록이 그대로 남기지 않는 값이라 가까운 값으로 쟀습니다.", line]);
    expect(findingText(i3, both, "en").method.at(-1)).toBe("Tool calls are counted at a different grain in each tool. In Claude Code one call the model makes is one, and in Codex one action that actually ran is one.");
    const codexOnly = { ...NONE, mergedTools: { I3: [{ tool: "codex" as const, observed: "proxy" as const }] } };
    expect(findingText(i3, codexOnly, "ko").method).not.toContain(line);
    expect(findingText(i3, NONE, "ko").method).not.toContain(line);
    expect(findingText({ ...i3, status: "unmeasured", reason: "too_little", value: null, score: null, category: "unmeasured" }, both, "ko").method).not.toContain(line);
  });

  it("S2의 잘함 제목과 설명, 할 일의 제목은 두 도구에 맞는 말이다. Codex는 승인 요청이나 샌드박스 제한으로 인정된다(4부 계획 리뷰 1차)", () => {
    const s2 = finding("S2", { axis: "setup", value: 1, score: 1, category: "strength", evidence: { guarded: 1, tools: 1, unreadTools: 0 } });
    const text = findingText(s2, { safeguards: [{ tool: "codex", guardHook: false, permissionChecks: true }], unjudgedServers: [] }, "ko");
    expect(text.title).toBe("셸 명령에 안전장치를 둠");
    expect(text.description).toBe("도구마다 뜻하지 않은 셸 명령을 멈출 자리가 있는지 봅니다. Claude Code는 기본 모드의 권한 확인이나 실행을 막을 수 있는 확인 훅이고, Codex는 승인 요청이나 샌드박스 제한입니다. 훅이 무엇을 걸러 내는지는 보지 않습니다.");
    expect(RULE_COPY.S2.en.good).toBe("Has a safeguard on shell commands");
    expect(RULE_COPY.S2.ko.fix).toBe("셸 명령에 안전장치 두기");
  });
```

`test/core/result-assemble.test.ts`(찾을 곳 1/2):

```ts
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/core/result-assemble.test.ts`(바꾼 뒤 1/2):

```ts
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/core/result-assemble.test.ts`(찾을 곳 2/2):

```ts

describe("평가 결과의 조립", () => {
```

`test/core/result-assemble.test.ts`(바꾼 뒤 2/2):

```ts

describe("합침 규칙의 어떻게 쟀나(설계 9.7, 「5단계 4부 계획 전 결정」 7번, 4부 계획 리뷰 1차)", () => {
  it("두 도구로 잰 I3과 I2에는 Codex의 가까운 값 줄이, I3에는 도구 호출을 세는 굵기의 줄이 붙는다. 한 도구만이면 굵기의 줄이 없다", () => {
    const days = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`2026-11-1${index}`, { responses: 3, humanRequests: 10, tools: { Bash: { calls: 10 } } }]));
    const sessions = [{ days: days(3) }];
    const both = evaluationInput([claudeTool({ sessions }), codexTool({ sessions })]);
    const result = checkupResult({ input: both, evaluation: evaluate(both), collected: [collected(), collected({ tool: "codex" })], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    const method = (ruleId: string) => result.findings.find((finding) => finding.ruleId === ruleId)!.text.ko.method;
    const proxy = "Codex: 기록이 그대로 남기지 않는 값이라 가까운 값으로 쟀습니다.";
    const grain = "도구 호출을 세는 굵기가 도구마다 다릅니다. Claude Code는 모델이 낸 호출 하나가, Codex는 실제로 실행된 작업 하나가 하나입니다.";
    expect(result.findings.find((finding) => finding.ruleId === "I3")).toMatchObject({ status: "scored", tools: [] });
    expect(method("I3").slice(-2)).toEqual([proxy, grain]);
    expect(method("I2").at(-1)).toBe(proxy);
    const claudeOnly = evaluationInput([claudeTool({ sessions })]);
    const single = checkupResult({ input: claudeOnly, evaluation: evaluate(claudeOnly), collected: [collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
    const singleMethod = single.findings.find((finding) => finding.ruleId === "I3")!.text.ko.method;
    expect(singleMethod).not.toContain(grain);
    expect(singleMethod.some((line) => line.includes("가까운 값"))).toBe(false);
  });
});

describe("평가 결과의 조립", () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-findings.test.ts test/core/result-assemble.test.ts`
Expected: FAIL. 바뀐 시험 파일 둘이 실패한다. 안전장치 줄과 S2의 잘함 문장이 Codex를 Claude Code의 말로 적고, 처방이 도구를 가리지 않으며, 대신 본 값과 도구 호출의 굵기의 줄이 없다(합침 규칙인 I2와 I3의 실제 결과에서도 없다).

- [ ] **Step 3: 구현한다**

`src/core/copy/common.ts`(찾을 곳 1/5):

```ts
// 규칙 문장과 요약에 함께 쓰는 문구. 도구와 기준의 이름, 못 잰 이유의 낱말과 설명, 도구별 값의 줄, 다른 도구로 쟀을 때의 덧붙임, 안전장치의 조건, E6 항목의 정보, 요약의 덧붙이는 말이다(설계 11.4, 11.5, 12.2, 13.1, 15)
import type { ToolId } from "../../adapters/types.ts";
```

`src/core/copy/common.ts`(바꾼 뒤 1/5):

```ts
// 규칙 문장과 요약에 함께 쓰는 문구. 도구와 기준의 이름, 못 잰 이유의 낱말과 설명, 도구별 값의 줄, 다른 도구로 쟀을 때의 덧붙임, 안전장치의 조건, 대신 본 값과 도구 호출의 굵기, E6 항목의 정보, 요약의 덧붙이는 말이다(설계 9.7, 11.4, 11.5, 12.2, 13.1, 15)
import type { ToolId } from "../../adapters/types.ts";
```

`src/core/copy/common.ts`(찾을 곳 2/5):

```ts

/** 안전장치(S2)가 도구마다 어느 조건으로 인정됐는지(설계 11.3 S2의 근거와 처방). 훅의 명령은 싣지 않는다 */
export const SAFEGUARD_COPY: Texts<{ line: string; hook: string; permissions: string; both: string; none: string; unknown: string }> = {
  en: {
```

`src/core/copy/common.ts`(바꾼 뒤 2/5):

```ts

/**
 * 안전장치(S2)가 도구마다 어느 조건으로 인정됐는지(설계 11.3 S2의 근거와 처방). 훅의 명령은 싣지 않는다. codexGuarded와 codexNone은 Codex의 조건이고,
 * unknown은 안전장치를 정하는 설정을 읽지 못해 뺀 도구다(「5단계 계획 전 결정」 4번, 「5단계 4부 계획 전 결정」 6번)
 */
export const SAFEGUARD_COPY: Texts<{ line: string; hook: string; permissions: string; both: string; none: string; codexGuarded: string; codexNone: string; unknown: string }> = {
  en: {
```

`src/core/copy/common.ts`(찾을 곳 3/5):

```ts
    none: "no safeguard (permissions are bypassed and no confirming hook covers shell commands)",
    unknown: "could not tell, because a settings file could not be read",
  },
```

`src/core/copy/common.ts`(바꾼 뒤 3/5):

```ts
    none: "no safeguard (permissions are bypassed and no confirming hook covers shell commands)",
    codexGuarded: "no place combines no approval with full sandbox access",
    codexNone: "no safeguard (a place combines no approval with full sandbox access)",
    unknown: "left out, because a settings file that decides the safeguard could not be read",
  },
```

`src/core/copy/common.ts`(찾을 곳 4/5):

```ts
    none: "안전장치 없음(권한 우회 모드이고 셸 명령을 덮는 확인 훅이 없음)",
    unknown: "설정 파일을 읽지 못해 가리지 못함",
  },
```

`src/core/copy/common.ts`(바꾼 뒤 4/5):

```ts
    none: "안전장치 없음(권한 우회 모드이고 셸 명령을 덮는 확인 훅이 없음)",
    codexGuarded: "승인 없음과 샌드박스 전면 해제를 함께 쓰는 곳이 없음",
    codexNone: "안전장치 없음(승인 없음과 샌드박스 전면 해제를 함께 쓰는 곳이 있음)",
    unknown: "안전장치를 정하는 설정 파일을 읽지 못해 빼고 쟀음",
  },
```

`src/core/copy/common.ts`(찾을 곳 5/5):

```ts

/** E6 항목의 정보. 판정에서 뺀 켜진 서버 가운데 부른 기록이 없는 것을 까닭마다 센다. 이름은 결과 화면이 따로 그린다(설계 13.1, 16.1) */
```

`src/core/copy/common.ts`(바꾼 뒤 5/5):

```ts

/** 도구별 값을 대신 본 것(9.7의 대신 봄)으로 쟀을 때 어떻게 쟀나에 더하는 줄(설계 「5단계 4부 계획 전 결정」 7번) */
export const PROXY_LINE: Texts<string> = {
  en: "{tool}: the records do not show this directly, so the value is approximate.",
  ko: "{tool}: 기록이 그대로 남기지 않는 값이라 가까운 값으로 쟀습니다.",
};

/** 요청당 도구 호출(I3)을 두 도구에서 쟀을 때 어떻게 쟀나에 더하는 줄. 도구 호출을 세는 굵기가 도구마다 다르다(설계 9.7) */
export const TOOL_CALL_GRAIN: Texts<string> = {
  en: "Tool calls are counted at a different grain in each tool. In Claude Code one call the model makes is one, and in Codex one action that actually ran is one.",
  ko: "도구 호출을 세는 굵기가 도구마다 다릅니다. Claude Code는 모델이 낸 호출 하나가, Codex는 실제로 실행된 작업 하나가 하나입니다.",
};

/** E6 항목의 정보. 판정에서 뺀 켜진 서버 가운데 부른 기록이 없는 것을 까닭마다 센다. 이름은 결과 화면이 따로 그린다(설계 13.1, 16.1) */
```

`src/core/copy/findings.ts`(찾을 곳 1/6):

```ts
// 평가 결과의 규칙 하나에서 문장(제목, 설명, 처방, 어떻게 쟀나)을 만든다. 분류와 상태에 따라 문구 표에서 고르고 숫자를 끼운다. 이름과 경로는 넣지 않는다(순수 함수, 설계 11.5, 12.2, 13.1, 19.1)
import type { Evidence } from "../measure.ts";
```

`src/core/copy/findings.ts`(바꾼 뒤 1/6):

```ts
// 평가 결과의 규칙 하나에서 문장(제목, 설명, 처방, 어떻게 쟀나)을 만든다. 분류와 상태에 따라 문구 표에서 고르고 숫자를 끼운다. 이름과 경로는 넣지 않는다(순수 함수, 설계 11.5, 12.2, 13.1, 19.1)
import type { Coverage, ToolId } from "../../adapters/types.ts";
import type { Evidence } from "../measure.ts";
```

`src/core/copy/findings.ts`(찾을 곳 2/6):

```ts
import { ruleSpec, type RuleId, type ValueKind } from "../rules.ts";
import { OTHER_TOOL_COPY, REASON_COPY, SAFEGUARD_COPY, TOOL_LINE, TOOL_NAMES, UNJUDGED_COPY } from "./common.ts";
import { fill, formatValue, slots } from "./format.ts";
```

`src/core/copy/findings.ts`(바꾼 뒤 2/6):

```ts
import { ruleSpec, type RuleId, type ValueKind } from "../rules.ts";
import { OTHER_TOOL_COPY, PROXY_LINE, REASON_COPY, SAFEGUARD_COPY, TOOL_CALL_GRAIN, TOOL_LINE, TOOL_NAMES, UNJUDGED_COPY } from "./common.ts";
import { fill, formatValue, slots } from "./format.ts";
```

`src/core/copy/findings.ts`(찾을 곳 3/6):

```ts
  unjudgedServers: readonly UnjudgedServer[];
}
```

`src/core/copy/findings.ts`(바꾼 뒤 3/6):

```ts
  unjudgedServers: readonly UnjudgedServer[];
  /** 합침 규칙을 잰 도구와 그 관측 범위(결과 조립이 넘긴다). 없으면 빈 것이다 */
  mergedTools?: Readonly<Partial<Record<RuleId, readonly { tool: ToolId; observed: Coverage }[]>>>;
}
```

`src/core/copy/findings.ts`(찾을 곳 4/6):

```ts

function safeguardLine(safeguard: ToolSafeguard, lang: Lang): string {
  const copy = SAFEGUARD_COPY[lang];
  const { guardHook, permissionChecks } = safeguard;
  const condition = guardHook === null || permissionChecks === null ? copy.unknown : guardHook && permissionChecks ? copy.both : guardHook ? copy.hook : permissionChecks ? copy.permissions : copy.none;
  return fill(copy.line, { tool: TOOL_NAMES[safeguard.tool][lang], condition });
}
```

`src/core/copy/findings.ts`(바꾼 뒤 4/6):

```ts

/** 도구마다 안전장치가 인정된 조건. Codex는 확인 훅을 안전장치로 치지 않고, 승인 없음과 전면 해제를 함께 쓰는 곳이 없는 것으로 본다(설계 「5단계 3부 계획 전 결정」 5번) */
function safeguardCondition(safeguard: ToolSafeguard, copy: (typeof SAFEGUARD_COPY)[Lang]): string {
  const { guardHook, permissionChecks } = safeguard;
  if (guardHook === null || permissionChecks === null) return copy.unknown;
  if (safeguard.tool === "codex") return permissionChecks ? copy.codexGuarded : copy.codexNone;
  return guardHook && permissionChecks ? copy.both : guardHook ? copy.hook : permissionChecks ? copy.permissions : copy.none;
}

function safeguardLine(safeguard: ToolSafeguard, lang: Lang): string {
  const copy = SAFEGUARD_COPY[lang];
  return fill(copy.line, { tool: TOOL_NAMES[safeguard.tool][lang], condition: safeguardCondition(safeguard, copy) });
}

/** 처방. 도구마다의 처방이 있는 규칙(S2)은 안전장치가 없는 도구(읽지 못해 뺀 도구는 아니다)마다의 문장을 도구의 차례로 잇는다 */
function prescriptionOf(finding: FindingInput, copy: RuleCopy, details: FindingDetails): string {
  const byTool = copy.prescriptionByTool;
  if (finding.ruleId !== "S2" || byTool === undefined) return copy.prescription;
  const lacking = details.safeguards
    .filter((safeguard) => safeguard.guardHook === false && safeguard.permissionChecks === false)
    .map((safeguard) => safeguard.tool)
    .sort();
  const sentences = lacking.map((tool) => byTool[tool]).filter((sentence): sentence is string => sentence !== undefined);
  return sentences.length > 0 ? sentences.join(" ") : copy.prescription;
}

/**
 * 어떻게 쟀나에 덧붙는 줄. 그 규칙을 대신 본 값으로 잰 도구마다 가까운 값이라는 줄, I3을 두 도구로 쟀으면 도구 호출을 세는 굵기의 줄이다. 도구별 규칙은 잰 도구별 값으로,
 * 도구별 값이 없는 합침 규칙은 결과 조립이 넘긴 그 규칙을 잰 도구로 본다(설계 9.7, 「5단계 4부 계획 전 결정」 7번)
 */
function measurementNotes(finding: FindingInput, details: FindingDetails, lang: Lang): string[] {
  if (finding.status !== "scored") return [];
  const used =
    ruleSpec(finding.ruleId).unit === "merged"
      ? (details.mergedTools?.[finding.ruleId] ?? [])
      : finding.tools.filter((value) => value.status === "scored").map((value) => ({ tool: value.tool, observed: value.observed }));
  const lines = used.filter((item) => item.observed === "proxy").map((item) => fill(PROXY_LINE[lang], { tool: TOOL_NAMES[item.tool][lang] }));
  if (finding.ruleId === "I3" && new Set(used.map((item) => item.tool)).size > 1) lines.push(TOOL_CALL_GRAIN[lang]);
  return lines;
}
```

`src/core/copy/findings.ts`(찾을 곳 5/6):

```ts
  if (finding.ruleId === "S2") for (const safeguard of details.safeguards) method.push(safeguardLine(safeguard, lang));
  return {
```

`src/core/copy/findings.ts`(바꾼 뒤 5/6):

```ts
  if (finding.ruleId === "S2") for (const safeguard of details.safeguards) method.push(safeguardLine(safeguard, lang));
  method.push(...measurementNotes(finding, details, lang));
  return {
```

`src/core/copy/findings.ts`(찾을 곳 6/6):

```ts
    description: description(finding, copy, lang, shown),
    prescription: finding.category === "average" || finding.category === "repair" ? copy.prescription : null,
    method,
```

`src/core/copy/findings.ts`(바꾼 뒤 6/6):

```ts
    description: description(finding, copy, lang, shown),
    prescription: finding.category === "average" || finding.category === "repair" ? prescriptionOf(finding, copy, details) : null,
    method,
```

`src/core/copy/rules-setup.ts`(찾을 곳 1/2):

```ts
      good: "Has permission checks or a hook for shell commands",
      why: "This looks for permission checks in the default mode, or a confirming hook that can block shell commands. With one of them in place, a command you did not mean to run can be stopped before it runs. What the hook actually filters is not checked.",
      fix: "Add a check before shell commands",
      problem: "{value} of the tools you use have a safeguard. A tool runs with permission checks bypassed and no confirming hook covers shell commands.",
      prescription: "In Claude Code, add an enabled PreToolUse hook in your user settings that can block shell commands (Bash or PowerShell) before they run, or choose a default mode that does not bypass permissions. If you keep bypassing permissions, use the blocking hook.",
      method: "Share of the tools you use that have a safeguard. Claude Code has one if its default mode does not bypass permissions, or if a PreToolUse hook that can block covers shell commands.",
```

`src/core/copy/rules-setup.ts`(바꾼 뒤 1/2):

```ts
      good: "Has a safeguard on shell commands",
      why: "This looks at whether each tool has something that can stop a shell command you did not mean to run. In Claude Code that is permission checks in the default mode or a confirming hook that can block commands, and in Codex it is asking for approval or a sandbox limit. What a hook actually filters is not checked.",
      fix: "Add a safeguard on shell commands",
      problem: "{value} of the tools whose settings were read have a safeguard. A tool can run shell commands without asking first.",
      prescription: "Add a check before shell commands in each tool that has no safeguard.",
      prescriptionByTool: {
        "claude-code":
          "In Claude Code, add an enabled PreToolUse hook in your user settings that can block shell commands (Bash or PowerShell) before they run, or choose a default mode that does not bypass permissions. If you keep bypassing permissions, use the blocking hook.",
        codex:
          "In Codex, if you set the approval policy to never, do not give the sandbox full access (danger-full-access). If you need full access, set the approval policy to on-request. Both your user config.toml and the settings of trusted projects count.",
      },
      method:
        "Share of the tools whose settings were read that have a safeguard. Claude Code has one if its default mode does not bypass permissions, or if a PreToolUse hook that can block covers shell commands. Codex has one if no place (the user settings or a trusted project) combines no approval with full sandbox access. A tool whose deciding settings could not be read is left out.",
```

`src/core/copy/rules-setup.ts`(찾을 곳 2/2):

```ts
      good: "권한 확인이나 셸 명령 확인 훅을 둠",
      why: "기본 모드의 권한 확인이나, 셸 명령의 실행을 막을 수 있는 확인 훅이 있는지 봅니다. 그런 자리가 있으면 뜻하지 않은 명령을 실행 전에 멈출 수 있습니다. 훅이 무엇을 걸러 내는지는 보지 않습니다.",
      fix: "셸 명령 앞에 확인 두기",
      problem: "쓰는 도구 가운데 안전장치가 있는 도구는 {value}입니다. 권한 확인을 건너뛰는데 셸 명령을 덮는 확인 훅이 없는 도구가 있습니다.",
      prescription: "Claude Code에서 셸 명령(Bash 또는 PowerShell)의 실행 전에 결과를 기다리며 실행을 막을 수 있는 PreToolUse 훅을 사용자 설정에 두고 켜거나, 기본 모드를 권한 우회가 아닌 것으로 바꾸세요. 권한 우회 모드를 계속 쓰려면 실행을 막을 수 있는 확인 훅을 두세요.",
      method: "쓰는 도구 가운데 안전장치가 있는 도구의 몫입니다. Claude Code는 기본 모드가 권한 우회가 아니거나, 셸 명령에 걸리고 실행을 막을 수 있는 도구 실행 전 확인 훅이 있으면 안전장치가 있는 것으로 봅니다.",
```

`src/core/copy/rules-setup.ts`(바꾼 뒤 2/2):

```ts
      good: "셸 명령에 안전장치를 둠",
      why: "도구마다 뜻하지 않은 셸 명령을 멈출 자리가 있는지 봅니다. Claude Code는 기본 모드의 권한 확인이나 실행을 막을 수 있는 확인 훅이고, Codex는 승인 요청이나 샌드박스 제한입니다. 훅이 무엇을 걸러 내는지는 보지 않습니다.",
      fix: "셸 명령에 안전장치 두기",
      problem: "설정을 읽은 도구 가운데 안전장치가 있는 도구는 {value}입니다. 묻지 않고 셸 명령을 실행할 수 있는 도구가 있습니다.",
      prescription: "안전장치가 없는 도구마다 셸 명령 앞에 확인을 두세요.",
      prescriptionByTool: {
        "claude-code":
          "Claude Code에서 셸 명령(Bash 또는 PowerShell)의 실행 전에 결과를 기다리며 실행을 막을 수 있는 PreToolUse 훅을 사용자 설정에 두고 켜거나, 기본 모드를 권한 우회가 아닌 것으로 바꾸세요. 권한 우회 모드를 계속 쓰려면 실행을 막을 수 있는 확인 훅을 두세요.",
        codex:
          "Codex에서 승인 정책을 never로 두려면 샌드박스를 전면 해제(danger-full-access)하지 마세요. 전면 해제가 필요하면 승인 정책을 on-request로 두세요. 사용자 config.toml과 신뢰한 프로젝트의 설정을 모두 봅니다.",
      },
      method:
        "설정을 읽은 도구 가운데 안전장치가 있는 도구의 몫입니다. Claude Code는 기본 모드가 권한 우회가 아니거나, 셸 명령에 걸리고 실행을 막을 수 있는 도구 실행 전 확인 훅이 있으면 안전장치가 있는 것으로 봅니다. Codex는 사용자 설정과 신뢰한 프로젝트 가운데 승인 없음과 샌드박스 전면 해제를 함께 쓰는 곳이 없으면 안전장치가 있는 것으로 봅니다. 안전장치를 정하는 설정을 읽지 못한 도구는 빼고 잽니다.",
```

`src/core/copy/types.ts`(찾을 곳 1/2):

```ts
// 규칙 문구 표의 모양. 규칙마다 영어와 한국어의 글을 나란히 둔다. 문장은 프로그램이 이 표에서 골라 숫자를 끼워 만들고 AI가 고쳐 쓰지 않는다(설계 11.5, 12.2)
import type { Reason } from "../reasons.ts";
```

`src/core/copy/types.ts`(바꾼 뒤 1/2):

```ts
// 규칙 문구 표의 모양. 규칙마다 영어와 한국어의 글을 나란히 둔다. 문장은 프로그램이 이 표에서 골라 숫자를 끼워 만들고 AI가 고쳐 쓰지 않는다(설계 11.5, 12.2)
import type { ToolId } from "../../adapters/types.ts";
import type { Reason } from "../reasons.ts";
```

`src/core/copy/types.ts`(찾을 곳 2/2):

```ts
  prescription: string;
  /** 어떻게 쟀나의 첫 줄. 무엇을 무엇으로 나눴는지 적는다 */
```

`src/core/copy/types.ts`(바꾼 뒤 2/2):

```ts
  prescription: string;
  /** 도구마다의 처방(S2). 있으면 그 규칙에 걸린 도구마다의 문장을 도구의 차례로 이어 처방으로 쓴다(설계 「5단계 4부 계획 전 결정」 6번) */
  prescriptionByTool?: Partial<Record<ToolId, string>>;
  /** 어떻게 쟀나의 첫 줄. 무엇을 무엇으로 나눴는지 적는다 */
```

`src/core/result/assemble.ts`(찾을 곳 1/2):

```ts
import { recordNotices, setupNotices, sortNotices, type Notice } from "./notices.ts";
import { observedOf } from "./observed.ts";
import { resultTools, type CollectedTool, type ResultTool } from "./tools.ts";
```

`src/core/result/assemble.ts`(바꾼 뒤 1/2):

```ts
import { recordNotices, setupNotices, sortNotices, type Notice } from "./notices.ts";
import { mergedObserved, observedOf } from "./observed.ts";
import { resultTools, type CollectedTool, type ResultTool } from "./tools.ts";
```

`src/core/result/assemble.ts`(찾을 곳 2/2):

```ts
  const details = { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation), setupProblems: evaluation.setupProblems };
  const findings = evaluation.findings.map((finding): ResultFinding => {
    const source = { ...finding, tools: finding.tools.map((value) => ({ ...value, observed: observedOf(finding.ruleId as ToolRuleId, coverageByTool.get(value.tool)!) })) };
    return { ...source, text: textsOf((lang) => findingText(source, details, lang)) };
  });
```

`src/core/result/assemble.ts`(바꾼 뒤 2/2):

```ts
  const details = { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation), setupProblems: evaluation.setupProblems };
  // 합침 규칙에는 도구별 값이 없어, 그 규칙을 잰 도구와 관측 범위를 문장을 지을 때만 넘긴다. 결과의 details에는 싣지 않는다(설계 「5단계 4부 계획 전 결정」 7번)
  const scoredTools = evaluation.tools.filter((tool) => tool.scored).map((tool) => ({ tool: tool.tool, coverage: coverageByTool.get(tool.tool)! }));
  const textDetails = { ...details, mergedTools: Object.fromEntries(evaluation.findings.map((finding) => [finding.ruleId, mergedObserved(finding.ruleId, scoredTools)])) };
  const findings = evaluation.findings.map((finding): ResultFinding => {
    const source = { ...finding, tools: finding.tools.map((value) => ({ ...value, observed: observedOf(finding.ruleId as ToolRuleId, coverageByTool.get(value.tool)!) })) };
    return { ...source, text: textsOf((lang) => findingText(source, textDetails, lang)) };
  });
```

`src/core/result/observed.ts`(찾을 곳 1/2):

```ts
// 도구별 값의 관측 범위를 정한다. 규칙마다 재는지를 가르는 지표(설계 9.7의 표의 줄)를 두고, 그 도구가 그 지표를 봤는지(봄, 대신 봄, 못 봄) 가운데 가장 약한 것을 낸다(순수 함수, 설계 9.7, 12.2)
import type { Coverage, CoverageKey, ToolCoverage } from "../../adapters/types.ts";
import type { ToolRuleId } from "../scoreboard.ts";
```

`src/core/result/observed.ts`(바꾼 뒤 1/2):

```ts
// 도구별 값의 관측 범위를 정한다. 규칙마다 재는지를 가르는 지표(설계 9.7의 표의 줄)를 두고, 그 도구가 그 지표를 봤는지(봄, 대신 봄, 못 봄) 가운데 가장 약한 것을 낸다. 합침 규칙은 그 규칙을 잰 도구마다 낸다(순수 함수, 설계 9.7, 12.2, 「5단계 4부 계획 전 결정」 7번)
import type { Coverage, CoverageKey, ToolCoverage, ToolId } from "../../adapters/types.ts";
import type { RuleId } from "../rules.ts";
import type { ToolRuleId } from "../scoreboard.ts";
```

`src/core/result/observed.ts`(찾을 곳 2/2):

```ts

/** 그 규칙이 쓰는 지표를 그 도구가 봤는지. 지표가 여럿이면 가장 약한 것이고, 지표를 쓰지 않는 규칙은 봄이다 */
export function observedOf(rule: ToolRuleId, coverage: ToolCoverage): Coverage {
  return RULE_METRICS[rule].reduce<Coverage>((weakest, key) => (STRENGTH[coverage[key]] < STRENGTH[weakest] ? coverage[key] : weakest), "measured");
}
```

`src/core/result/observed.ts`(바꾼 뒤 2/2):

```ts

const weakestOf = (keys: readonly CoverageKey[], coverage: ToolCoverage): Coverage => keys.reduce<Coverage>((weakest, key) => (STRENGTH[coverage[key]] < STRENGTH[weakest] ? coverage[key] : weakest), "measured");

/** 그 규칙이 쓰는 지표를 그 도구가 봤는지. 지표가 여럿이면 가장 약한 것이고, 지표를 쓰지 않는 규칙은 봄이다 */
export function observedOf(rule: ToolRuleId, coverage: ToolCoverage): Coverage {
  return weakestOf(RULE_METRICS[rule], coverage);
}

/** 합침 규칙 가운데 대신 볼 수 있는 기록의 지표로 재는 것과 그 지표. 강도 규칙이 그 지표를 보는 도구만 넣는 것과 같다(metrics/intensity.ts) */
export const MERGED_RULE_METRICS: Partial<Record<RuleId, readonly CoverageKey[]>> = { I2: ["humanRequests"], I3: ["humanRequests", "toolCalls"] };

/** 합침 규칙을 잰 도구(점수에 넣는 도구 가운데 그 지표를 모두 보는 것)와 그 관측 범위. 그런 지표가 없는 합침 규칙은 빈 목록이다 */
export function mergedObserved(rule: RuleId, tools: readonly { tool: ToolId; coverage: ToolCoverage }[]): { tool: ToolId; observed: Coverage }[] {
  const metrics = MERGED_RULE_METRICS[rule] ?? [];
  if (metrics.length === 0) return [];
  return tools.filter((tool) => metrics.every((key) => tool.coverage[key] !== "unsupported")).map((tool) => ({ tool: tool.tool, observed: weakestOf(metrics, tool.coverage) }));
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-findings.test.ts test/core/result-assemble.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 30개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-findings.test.ts test/core/result-assemble.test.ts src/core/copy/common.ts src/core/copy/findings.ts src/core/copy/rules-setup.ts src/core/copy/types.ts src/core/result/assemble.ts src/core/result/observed.ts
git commit -m "feat: S2 문장과 대신 본 값의 줄에 Codex를 넣음"
```

---

### Task 4: Codex 색 확정과 묶은 실행 파일

**Files:**
- Modify: `skills/aq/scripts/aq.mjs`
- Modify: `src/report/html.ts`

**Interfaces:**
- Consumes: 과제 1~3의 원본.
- Produces: 결과 화면의 도구 색 주석(Codex 색을 확정한 까닭), 다시 만든 `skills/aq/scripts/aq.mjs`.

- 설계 「5단계 4부 계획 전 결정」 9번. 색 값은 바꾸지 않고 확정한 까닭(종이 바탕과의 대비 3.82:1, 색각 이상에서도 갈리는 파랑과 주황, 흑백을 위한 글 표시)을 주석에 적는다.
- 과제 1부터 원본이 바뀌어 묶음 검사가 어긋나 있다. `npm run build`로 다시 만들고 전체 검사를 돌린다.

- [ ] **Step 1: 구현한다**

묶은 실행 파일은 글로 싣지 않는다. 확인 명령의 `npm run build`가 원본에서 다시 만든다.

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

`src/report/html.ts`(찾을 곳):

```ts
// Codex 색은 결과 화면에 Codex를 넣는 5단계 3부에서 색 검증과 함께 확정한다(파랑과 색각 이상에서도 구분되는 주황을 임시로 둔다)
```

`src/report/html.ts`(바꾼 뒤):

```ts
// 도구 색. Codex의 주황은 종이 바탕(#fcfcfb)과의 대비가 3.82:1로 비문자 대비 3:1을 넘고, Claude Code의 파랑과는 색각 이상에서도 갈리는 짝이다.
// 두 색의 밝기가 비슷해 흑백으로는 갈리지 않으므로 도구별 띠에는 도구 이름과 값을 글로 함께 둔다(설계 「5단계 4부 계획 전 결정」 9번)
```

- [ ] **Step 2: 전체 검사가 통과하는지 확인한다**

Run: `npm run build && npm run check`
Expected: `npm run build`가 `묶음 완료`를 내고, `npm run check`가 타입 검사 통과, 시험 파일 105개·시험 1,787개 통과(파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다), `묶음 검사 통과`, `버전 검사 통과`를 낸다.

- [ ] **Step 3: 커밋한다**

```bash
git add skills/aq/scripts/aq.mjs src/report/html.ts
git commit -m "build: Codex 색을 확정하고 묶음을 다시 만듦"
```

---

### Task 5: Node.js 22, 이 PC의 기록과 셋팅으로 돌려 보기, 결과 화면 확인, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~4의 결과물 전부.
- Produces: `develop`에 병합된 5단계 4부. 5부(Codex 플러그인)가 기대는 것은 두 도구를 함께 내는 결과와 결과 화면, 도구에 매이지 않는 스킬 본문이다.

- [ ] **Step 1: 묶음을 다시 만들어도 그대로인지 확인한다**

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 2: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS(시험 파일 105개·시험 1,787개. 파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다. 받은 22가 22.15.0보다 낮으면 1부의 압축 기록 시험 묶음 둘을 건너뛴 수만큼 적다). 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 3: 이 PC의 기록과 셋팅으로 실제로 돌려 본다**

두 도구의 기록과 셋팅, 상태 폴더는 읽기만 한다. 저장하지 않는 점검이라 결과는 OS의 임시 폴더에만 쓴다. 이 PC의 이름, 경로, 값, 개수는 저장소 밖 작업 기록에만 둔다.

Run: `node skills/aq/scripts/aq.mjs checkup --no-open --no-save`

| 확인 | Expected |
|---|---|
| 끝까지 도는지 | 오류 없이 요약 JSON을 내고 몇 분 안에 끝난다. 임시 폴더에 결과 파일과 결과 화면이 생긴다 |
| 두 도구 | 결과의 도구 목록에 두 도구가 찾음과 점수에 넣음으로 든다(작성자 PC) |
| Codex의 알림 | 결과의 알림에 Codex 몫이 있으면 그 문장에 이름과 경로가 없고, 스킬 사용의 관측이 빠진 것은 Codex 몫으로 나오지 않는다 |
| 읽은 양 | Codex의 `partialFiles`와 `skippedFiles`가 그 PC의 수집 결과와 같다 |
| 규칙 문장 | S2의 어떻게 쟀나에 두 도구의 조건 줄이 있고, 대신 본 것으로 잰 Codex의 값에 가까운 값이라는 줄이 있다 |
| 값과 글이 나가지 않는지 | 저장소 밖 스크립트로 사용자 `config.toml`의 MCP 서버 환경 변수, 머리말, 토큰, 주소 질의 값이 결과 JSON의 경로 칸 밖과 결과 화면에 없는지 본다 |
| 쓰지 않는지 | 돌리기 앞뒤로 Codex 홈의 `config.toml`, Claude Code의 사용자 설정, 상태 폴더의 수정 시각과 지문이 그대로다 |

작성자 PC에서 계획을 쓰며 돌린 결과는 위와 같았다(값과 개수는 저장소 밖 작업 기록에 적었다).

- [ ] **Step 4: 결과 화면을 실제 화면으로 본다**

Step 3이 만든 결과 화면 파일을 이고라이트(`ego-browser` 스킬)로 연다. 작업 전에 이고라이트 창을 올리고 끝나면 내린다(사용자 전역 지침). 데스크톱(1440), 태블릿(820), 휴대폰(390) 폭에서 전체를 찍어 직접 보고, 가로로 넘치는 요소가 없는지 잰다. 알림 칸(Codex의 알림 문장), S2 칸(처방과 펼친 어떻게 쟀나의 두 도구 줄), 사용 기록의 도구별 띠(두 도구의 색과 이름)를 휴대폰 폭에서 따로 찍어 줄바꿈과 잘림을 본다. 화면 사진은 저장소 밖에 둔다.

Expected: 세 폭 모두 가로로 넘치는 요소가 0개이고, 도구별 띠에 Claude Code의 파랑과 Codex의 주황이 이름과 값과 함께 보이며, 알림과 S2의 문장이 잘리지 않고 줄바꿈된다.

- [ ] **Step 5: 원장을 고치고 커밋한다**

원장의 5단계 4부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 8에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 4부 구현 결과를 적음"
```

- [ ] **Step 6: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage5-4.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~4의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 이 PC의 기록과 셋팅으로 돌린 것과 결과 화면의 확인 항목과 맞았는지), 「확인하지 못한 것」이다. 확인하지 못한 것에는 Codex 플러그인(5부), macOS와 Linux, 실제 기기에서 본 화면(화면 폭을 바꿔 본 것뿐이다), 27절의 「Codex 평가의 한계」를 적는다.

```bash
git push -u origin 5단계-4부-결과와-문구에-Codex
gh pr create --base develop --head 5단계-4부-결과와-문구에-Codex --title "feat: 5단계 4부 결과와 문구에 Codex" --body-file "$TEMP/aq-pr-stage5-4.md"
```

- [ ] **Step 7: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex 하나를 만들어 맡긴다(필수는 제품 결함과 수용 조건 미충족뿐이다). 짝은 새 복제본에서 계획의 코드 블록을 자기 도구로 뽑아 기준에 적용한 결과가 브랜치의 `src`·`test`·`scripts`·`skills`·`package.json`·`package-lock.json`과 같은지, `npm ci` 뒤 `npm run check`와 Node.js 22의 전체 시험, 이 PC의 기록과 셋팅으로 Step 3과 Step 4의 확인 항목을 자기 방법으로 재현하는지, 제품 코드가 설계(「5단계 4부 계획 전 결정」)와 다른 결과를 내거나 예외로 멈추거나 실제 홈에 쓰거나 값과 이름을 문장에 내는지를 본다. 결함이라고 적으려면 합성 자료로 실제로 재현한다. 변이로 틀린 구현을 지어 보는 일은 하지 않는다. 필수 지적은 고치고 지적한 짝이 다시 본다. 오래 끌면 주 세션이 제품 결함만 한 번 찾고, 없으면 넘어간다(메모리 `review-until-no-major-issues`). Fable은 쓰지 않는다(사용자 지시 2026-11-16).

- [ ] **Step 8: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 5단계-4부-결과와-문구에-Codex --merge --subject "feat: 5단계 4부 결과와 문구에 Codex를 개발 브랜치에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 4부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 5부와 그 뒤에 넘기는 것

5단계 4부가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 부 | 4부가 남긴 재료 |
|---|---|---|
| Codex 매니페스트 둘, 버전 검사, 산출물, Codex에서 스킬이 도는지(스킬 폴더를 가리키는 자리, 저장 승인과 저장 없는 실행) | 5부 | 도구에 매이지 않는 스킬 본문(결정 10), 두 도구를 함께 내는 결과와 결과 화면 |
| Codex 서버 끄기(A4)의 후보 조건 | 6단계 | 「5단계 2부 계획 전 결정」 7번, 「5단계 3부 계획 전 결정」 11번 |
| 정밀 점검 단서를 쓰는 `aq deep-hints`(Codex 지침 파일의 목록, 두 도구 단서의 문장) | 7단계 | `DeepHint`의 Codex 몫과 `tools_instructions_differ` |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 「5단계 4부 계획 전 결정」 1번 | 한 계획, 과제 나눔 | 이 문서 |
| 2번, 9.8, 「5단계 계획 전 결정」 2번 | 읽은 양의 Codex 몫(분자, 아래 경계, 수), 그림 고르기 | 1 |
| 3번, 9.2, 9.6, 「5단계 계획 전 결정」 1·3·7번 | 기록 쪽 알림의 Codex 몫, 새 알림 아홉, 스킬 관측을 알리지 않음, 정체 모를 것 | 1 |
| 4번, 「5단계 계획 전 결정」 7번 | 이어받은 것을 확인하지 못한 세션의 대신 봄 | 1 |
| 5번, 12.2, 20.1 | 셋팅 쪽 알림의 Codex 몫 | 2 |
| 6번, 11.3, 「5단계 3부 계획 전 결정」 5번 | S2의 두 도구 문장, 도구별 처방, 안전장치 줄 | 3 |
| 7번, 9.7 | 대신 본 값의 줄, I3의 굵기의 줄 | 3 |
| 8번, 17 | 정밀 점검 단서의 Codex 몫과 두 도구 단서 | 2 |
| 9번, 13.1 | Codex 색의 확정과 실제 화면 확인 | 4, Task 5 Step 4 |
| 10번, 11번 | 스킬 본문은 바꾸지 않음, 터미널 요약은 결과의 알림을 그대로 싣는다 | 바꾸는 코드 없음(요약이 새 알림의 수를 싣는 것은 1) |
| 12번, 27절 | 한계를 적음 | 설계 커밋 |

4부에 넣지 않은 것은 「5부와 그 뒤에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 커밋·병합 요청·병합 제목을 전역 규칙(타입 12개, 타입을 뺀 설명 50자 이내, 한글 4자 이상, 영문자가 한글보다 많지 않음)으로 기계로 셌다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드가 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`946ee4b`)에서 과제 1부터 4까지 차례대로 만들었다(Windows 11, Node.js 24.18). 의존성은 복제본에 `npm ci`로 깔았다. 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1부터 3까지는 시험만 놓고 돌리면 실패하고(과제 1은 바뀐 시험 파일 일곱, 과제 2는 셋, 과제 3은 둘), 구현을 놓으면 그 과제의 시험과 타입 검사가 통과했다. 과제 4의 `npm run build && npm run check`는 시험 파일 105개·시험 1,787개(Windows에서 파일 링크 시험 하나를 건너뛰어 1,786개 통과)와 묶음 검사, 버전 검사가 통과했다. 묶음을 다시 만들어도 작업 트리가 그대로였고, 만든 복제본의 파일 262개(문서와 원장 빼고)가 연습 작업 폴더와 바이트까지 같았다.

연습 작업 폴더에서 따로 확인한 것은 이렇다. 과제의 시험 커밋 셋을 하나씩 꺼내 그 커밋이 고친 시험 파일만 돌리면 모두 실패했고(과제 1은 스물네 시험, 과제 2는 여섯 시험, 과제 3은 일곱 시험), 구현 커밋 넷을 하나씩 꺼내 타입 검사와 전체 시험을 돌리면 모두 타입 오류 없이 통과했다. 계획을 쓰는 동안 셋을 정했다. 수집 결과의 Codex 몫은 시험이 짓는 수집 결과를 모두 고치지 않으려고 `codex` 칸 하나에 모았다. 알림의 문장에 경로가 없어야 한다는 시험이 있어 Codex 설정 자리의 이름을 `config.toml`과 "프로젝트의 config.toml"로 적었다. 건너뛴 압축 파일도 읽지 못한 기록이라 결과 화면의 그림 고르기에 넣고 설계 결정 2번에 더했다. 계획 리뷰 1차가 찾은 셋(합침 규칙 I2·I3의 어떻게 쟀나에서 빠진 줄, Codex를 Claude Code의 말로 설명한 S2의 잘함 문장, 까닭과 맞지 않는 세션 ID 대체 문장)은 과제 1과 3의 그 자리에서 고쳤다.

이 PC의 기록과 셋팅(읽기만)으로 Task 5 Step 3과 Step 4를 미리 돌렸다(계획 리뷰 1차의 고침 앞이다. 고친 것은 문장과 합침 규칙의 줄이라 그 뒤에는 Step 3의 규칙 문장만 다시 봤다). 저장하지 않는 점검이 오류 없이 1분 안에 끝났고 두 도구가 찾음과 점수에 넣음으로 들었다. Codex의 알림이 나왔고 그 문장에 이름과 경로가 없었으며, 스킬 사용의 관측이 빠진 것은 Codex 몫으로 나오지 않았다. 읽은 양과 알림의 Codex 수는 같은 방식(수정 시각 거르기를 켜고 캐시를 끈 것)으로 따로 모은 수집 결과와 같았다. S2에 두 도구의 조건 줄과 Codex 처방이 붙었고, 대신 본 것으로 잰 Codex의 값에 가까운 값이라는 줄이 붙었다. 사용자 `config.toml`의 MCP 서버 값은 결과 JSON의 경로 칸 밖과 결과 화면에 없었고, 돌리기 앞뒤로 두 도구의 설정과 상태 폴더의 수정 시각과 지문이 그대로였다. 결과 화면을 이고라이트로 데스크톱(1440), 태블릿(820), 휴대폰(390) 폭에서 찍어 보니 세 폭 모두 가로로 넘치는 요소가 없었고, 도구별 띠에 두 색이 이름과 값과 함께 보였다. 휴대폰 폭에서 알림 칸과 S2 칸(펼친 어떻게 쟀나 포함)을 따로 찍어 줄바꿈과 잘림이 없는 것을 직접 봤다. 값과 개수, 화면 사진은 저장소 밖 작업 기록에 두었다.

확인하지 못한 것은 이렇다. Node.js 22에서 돌리는 것은 Task 5 Step 2에서 한다. Codex를 실제로 돌려 맞춰 본 것은 없다. 실제 휴대폰과 태블릿 기기에서 본 것이 아니라 데스크톱의 이고라이트에서 화면 폭만 바꿔 본 것이다. 이 PC에는 건너뛴 압축 파일, 일부만 읽은 파일, 이어받은 것을 확인하지 못한 세션이 없어 그 알림과 띠, 대신 봄으로 낮추기는 시험으로만 봤다. macOS와 Linux는 보지 않았다. Windows의 파일 링크 시험은 이 PC에서 건너뛰었다.
