# AQ 점검 5단계 3부 — 평가 엔진에 Codex 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 이 PC의 기록과 셋팅으로 돌려 보기로 검증한다.

**Goal:** 5단계 1·2부가 읽은 Codex의 기록과 셋팅을 평가 엔진에 넣는다. 점검의 입력 묶음이 두 도구의 기록을 모으고 두 스캐너에 같은 프로젝트 목록을 주며, 규칙과 설치 판정이 Codex를 그 도구의 셋팅 사실로 재고, 관측 기록에 Codex 설치를 잇는다. Codex의 알림, 읽은 양의 Codex 몫, 문구, 결과 화면, 스킬 본문은 4부다.

**Architecture:** 평가 입력의 도구 하나를 도구로 가르는 꼴로 바꾼다(`src/core/evaluate.ts`의 `ToolInput`, `src/core/metrics/setup.ts`의 `ToolSetup`). 같은 하위 꼴을 읽는 규칙은 그대로 두 도구에 쓰고, 도구마다 다른 판정(S2의 안전장치와 읽지 못한 도구 빼기, 읽지 못한 설정, F3·F4의 프로젝트 몫, E1의 식, E6의 읽지 못한 곳)은 도구를 가려 낸다(`metrics/setup.ts`, `metrics/fit.ts`, `metrics/usage.ts`, `installs/*.ts`, `readability.ts`). 입력 묶음(`src/commands/checkup-input.ts`)이 Codex의 기록과 셋팅을 모으고, 관측 기록(`src/state/next-state.ts`)이 두 도구의 설치를 고친다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 새 의존성은 없다. 2부의 smol-toml이 이번에 처음 묶은 실행 파일에 든다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 끝의 「5단계 3부 계획 전 결정」(1~14번)과, 그것이 기대는 「5단계 계획 전 결정」 4~6번, 「5단계 2부 계획 전 결정」 4·6·7·9번, 11.3의 Codex 칸, 12.1, 18.1을 구현한다.

## 5단계 3부의 범위

| 넣는 것 | 넣지 않는 것(그 부) |
|---|---|
| 평가 입력의 Codex 도구(기록, 관측 범위, 셸 명령 도구, 관측이 빠짐없는지, 셋팅 사실), 두 도구로 만든 프로젝트 목록, 규칙의 Codex 몫(S2의 안전장치와 읽지 못한 도구 빼기, S5, E1의 식, F3·F4·F5·F6, E5·E6), Codex 정비 후보 없음, 관측 기록의 Codex 설치, 묶은 실행 파일 다시 만들기 | Codex의 알림(셋팅 쪽, 읽지 못한 기록, 관측이 빠진 것)과 그 문구, 읽은 양의 Codex 몫(건너뛴 압축 파일, 일부만 읽은 파일), 관측 알림 문장, S2의 Codex 처방, 정밀 점검 단서의 Codex 몫, 결과 화면의 Codex 색, 스킬 본문(4부). Codex 플러그인(5부). Codex 정비(6단계) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- 두 도구의 기록과 셋팅, 홈의 `.agents`, 프로젝트 폴더는 읽기만 한다. 점검이 쓰는 곳은 상태 폴더(`~/.chunsik-garage`)와 OS의 임시 폴더뿐이다(설계 19.2).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더의 기록과 셋팅을 읽지 않고 임시 폴더에 만든 홈과 프로젝트만 쓴다(설계 21.1). 파일 링크를 만들 수 없는 Windows에서는 그 시험을 건너뛴다.
- 설정의 값(환경 변수, 머리말, 주소의 질의, 토큰)과 지침·스킬의 글은 결과에 싣지 않는다(설계 10, 19.1).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `5단계-3부-평가-엔진에-Codex` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증의 필수는 제품 결함과 수용 조건 미충족뿐이다(사용자 지시 2026-11-16).
- 이 PC의 기록과 셋팅에서 본 이름, 경로, 값, 개수는 저장소와 병합 요청에 넣지 않는다(설계 머리말). 이 PC로 돌린 도구와 결과는 저장소 밖에 둔다.

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `40B4DDA66F59A4EFA54124004033D03C6D93D536F2CCBBAD42371A6E266984EE`, 4,371줄)이다. 설계 끝에 「5단계 3부 계획 전 결정」(열네 가지)을 더하고, 로드맵 문서의 5단계를 다섯 부로 나눴으며(3부 평가 엔진, 4부 결과 조립·문구·화면·스킬 본문, 5부 Codex 플러그인), 27절에 「Codex 평가의 한계」를 더했다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/core/evaluate.ts`, `src/core/metrics/setup.ts`, `src/core/metrics/fit.ts`, `src/core/metrics/usage.ts`, `src/core/readability.ts`, `src/core/installs/skills.ts`, `src/core/installs/servers.ts`, `src/core/installs/candidates.ts`, `src/core/result/notices.ts`, `src/core/result/hints.ts`, `src/core/copy/rules-setup.ts`(고침) | 1 | 도구로 가르는 셋팅 사실의 꼴, 규칙과 설치 판정의 Codex 몫, S2의 근거와 그 문구, 셋팅 쪽 알림과 단서는 Claude Code만 |
| `test/helpers/facts.ts`, `test/helpers/evaluation.ts`(고침) | 1 | Codex의 셋팅 사실과 도구 입력을 짓는 시험 도우미 |
| `src/commands/checkup-input.ts`, `src/commands/checkup.ts`, `src/state/next-state.ts`, `src/core/result/notices.ts`(고침) | 2 | 입력 묶음과 프로젝트 목록에 Codex, 결과에 싣는 Codex의 수집 결과, 관측 기록의 Codex 설치, 기록 쪽 알림의 Codex 몫은 4부로 |
| `skills/aq/scripts/aq.mjs`(다시 만듦) | 3 | 묶은 실행 파일 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다. 과제 3은 시험이 없어 묶음을 다시 만들고 전체 검사를 돌린 뒤 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/2`처럼 차례가 붙고 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 1부터 원본이 바뀌어 묶음 검사가 어긋나므로, 과제 3의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 묶은 실행 파일을 다시 만든 뒤 과제 3에서 돌린다.
- 시험은 임시 폴더에 만든 홈과 프로젝트로 본다. 이 PC의 실제 기록과 셋팅에서 맞는지는 시험으로 보증하지 않으므로 마지막 과제에서 돌려 본다.

---

### Task 1: 평가 엔진의 규칙과 판정에 Codex

**Files:**
- Modify: `test/core/copy-rules.test.ts`
- Modify: `test/core/evaluate.test.ts`
- Modify: `test/core/installs-candidates.test.ts`
- Modify: `test/core/installs-servers.test.ts`
- Modify: `test/core/metrics-fit.test.ts`
- Modify: `test/core/metrics-setup.test.ts`
- Modify: `test/core/metrics-usage.test.ts`
- Modify: `test/core/result-hints.test.ts`
- Modify: `test/core/result-notices-setup.test.ts`
- Modify: `test/helpers/evaluation.ts`
- Modify: `test/helpers/facts.ts`
- Modify: `src/core/copy/rules-setup.ts`
- Modify: `src/core/evaluate.ts`
- Modify: `src/core/installs/candidates.ts`
- Modify: `src/core/installs/servers.ts`
- Modify: `src/core/installs/skills.ts`
- Modify: `src/core/metrics/fit.ts`
- Modify: `src/core/metrics/setup.ts`
- Modify: `src/core/metrics/usage.ts`
- Modify: `src/core/readability.ts`
- Modify: `src/core/result/hints.ts`
- Modify: `src/core/result/notices.ts`

**Interfaces:**
- Consumes: 5단계 2부의 `CodexSetupFacts`, `CodexProjectFact`, `CodexPluginFact`(`src/scan/types.ts`), `CodexSafetyFact`(`src/scan/codex-settings.ts`). 5단계 1부의 `CODEX_COVERAGE`(`src/adapters/codex/observation.ts`)와 `CODEX_SHELL_TOOLS`(`src/adapters/codex/parser.ts`)는 시험 도우미가 쓴다. 2단계의 평가 엔진(`evaluate`, 규칙, 설치 판정).
- Produces: `ToolInput`(도구로 가르는 꼴. Codex는 `setup: CodexSetupFacts`, `src/core/evaluate.ts`), `ToolSetup`과 `ClaudeToolSetup`(`src/core/metrics/setup.ts`), `codexSettingsUnread(facts)`(`src/core/readability.ts`), `usageRules(totals, coverage, tool)`(`src/core/metrics/usage.ts`), `mergedFitRules(tools, usage, projects)`(`src/core/metrics/fit.ts`). S2의 근거에 `unreadTools`가 든다. 시험 도우미 `codexFacts`, `codexProject`, `codexPlugin`, `codexSafety`(`test/helpers/facts.ts`), `codexTool`(`test/helpers/evaluation.ts`). 과제 2가 입력 묶음에 Codex를 넣는다.

설계 「5단계 3부 계획 전 결정」 4~11·13번이다.

- 평가 입력의 도구 하나는 도구에 따라 셋팅 사실의 꼴이 다르다(`tool`로 가르는 꼴). 같은 하위 꼴(지침 묶음, 스킬 사실, MCP 서버 사실, 문제, 읽기 상태)을 읽는 S1, S3, F5와 서버의 판정은 두 도구에 같은 코드이고, 도구마다 다른 것은 도구를 가려 판정한다.
- S2(결정 5, 「5단계 계획 전 결정」 4번). 안전장치를 정하는 설정을 읽지 못한 도구만 분자와 분모에서 빼고, 남은 도구가 없으면 `unreadable`이다. 근거는 `guarded`, `tools`(남은 도구), `unreadTools`(뺀 도구)다. 근거 숫자는 모두 문구에 보여야 하므로(문구 표의 시험) S2의 근거 문구에 뺀 도구를 더한다. Codex의 안전장치는 맥락(전역, 신뢰한 프로젝트마다) 가운데 승인 없음과 전면 해제(`fullAccess`)를 함께 쓰는 것이 없는 것이고, `guardHook`은 늘 거짓이다. 사용자 `config.toml`이나 신뢰한 프로젝트의 `.codex/config.toml`을 읽지 못했으면(풀리지 않는 것도) Codex를 뺀다(`codexSettingsUnread`).
- S5. Codex는 관측 범위에 연결 실패가 없어 `unsupported`다. 관측 범위가 있다고 해도 켜짐과 서버를 정하는 곳은 위의 두 설정 파일이다.
- E1(결정 6). Codex는 입력 칸에 캐시가 들어 있어 `캐시 입력 ÷ 입력`이다. 도구를 가르려고 `usageRules`에 도구 인자를 더한다.
- F3(결정 7). 주로 쓴 도구가 Codex이면 Codex가 읽는 프로젝트 지침(`CodexProjectFact.instructions`)을 본다. 깃 저장소가 아닌 폴더를 프로젝트로 다루는지의 Codex 몫은 Codex 지침 파일이 있거나 신뢰한 프로젝트의 `.codex/config.toml`이 있는 것이다. 스캐너가 읽은 프로젝트(`scanned`)만 본다.
- F4(결정 8). 도구마다 제 전역과 제 프로젝트 지침을 견준 값 가운데 가장 큰 것이고, 한 도구라도 견주는 것을 읽지 못하면 `unreadable`이다. Codex의 프로젝트 사실에는 이름이 없어 입력 묶음의 프로젝트 목록에서 얻는다(`mergedFitRules`에 프로젝트 목록을 넘긴다. 목록에 없으면 정규화한 뿌리다). Codex의 지침에는 같은 파일 표시가 없어 같은 파일도 견준다.
- F5와 F6(결정 9). F5는 같은 꼴이다. F6은 Claude Code만 센다.
- E5와 E6(결정 10). Codex 스킬은 판정하지 않는다(`unsupported`. 판정한 스킬 묶음에도 들지 않는다). Codex 서버는 Claude Code와 같은 규칙으로 판정하고, 위의 두 설정 파일을 읽지 못하면 `unreadable`, 구성을 모르거나 MCP 정의를 읽지 못한 플러그인의 서버는 그 서버만 세지 않는다(`plugin_unread`).
- 정비 후보(결정 11). Codex 설치의 후보는 내지 않는다.
- 결과 조립(결정 13). 셋팅 쪽 알림과 정밀 점검 단서는 Claude Code 몫만 낸다. Codex 몫은 4부다.
- 지금까지 도구 칸만 `codex`로 바꾸고 Claude Code의 셋팅 사실을 넣던 시험은 Codex의 셋팅 사실로 고친다(꼴이 갈라져 타입 검사가 잡는다). F6의 여러 도구 시험은 Codex를 세지 않는 것으로 바뀐다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/copy-rules.test.ts`(찾을 곳):

```ts
  S2: ["guarded", "tools"],
```

`test/core/copy-rules.test.ts`(바꾼 뒤):

```ts
  S2: ["guarded", "tools", "unreadTools"],
```

`test/core/evaluate.test.ts`(찾을 곳 1/3):

```ts
// 입력 묶음에서 평가까지를 시험한다. 규칙 스물둘이 제 입력에 이어졌는지, 점수에 넣는 도구에서만 재는지, 같은 입력이면 글자 하나 다르지 않은지(설계 9.3, 12.1, 12.2, 21.1 「결정성」)
import { describe, expect, it } from "vitest";
import type { ToolId } from "../../src/adapters/types.ts";
import { evaluate, type EvaluationInput } from "../../src/core/evaluate.ts";
import { RULES } from "../../src/core/rules.ts";
import { instructionFile, instructions, mcpServer, plugin, project, skill } from "../helpers/facts.ts";
import { CLOCK, claudeTool, evaluationInput, watched } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

```

`test/core/evaluate.test.ts`(바꾼 뒤 1/3):

```ts
// 입력 묶음에서 평가까지를 시험한다. 규칙 스물둘이 제 입력에 이어졌는지, 점수에 넣는 도구에서만 재는지, 같은 입력이면 글자 하나 다르지 않은지(설계 9.3, 12.1, 12.2, 21.1 「결정성」)
import { describe, expect, it } from "vitest";
import { evaluate, type EvaluationInput } from "../../src/core/evaluate.ts";
import { RULES } from "../../src/core/rules.ts";
import { codexSafety, instructionFile, instructions, mcpServer, plugin, project, skill } from "../helpers/facts.ts";
import { CLOCK, claudeTool, codexTool, evaluationInput, watched } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

```

`test/core/evaluate.test.ts`(찾을 곳 2/3):

```ts
  });
  it("도구는 식별자의 차례로 낸다. 점수에 넣는 도구만 도구별 값에 싣는다", () => {
    const codex = { ...claudeTool({ sessions: [before] }), tool: "codex" as ToolId };
    const result = evaluate(evaluationInput([codex, claudeTool({ sessions: SESSIONS, setup: SETUP })], { projects: SETUP.projects }));
    expect(result.tools.map((tool) => [tool.tool, tool.scored])).toEqual([["claude-code", true], ["codex", false]]);
```

`test/core/evaluate.test.ts`(바꾼 뒤 2/3):

```ts
  });
  it("도구는 식별자의 차례로 낸다. 점수에 넣는 도구만 도구별 값에 싣는다", () => {
    const codex = codexTool({ sessions: [before] });
    const result = evaluate(evaluationInput([codex, claudeTool({ sessions: SESSIONS, setup: SETUP })], { projects: SETUP.projects }));
    expect(result.tools.map((tool) => [tool.tool, tool.scored])).toEqual([["claude-code", true], ["codex", false]]);
```

`test/core/evaluate.test.ts`(찾을 곳 3/3):

```ts
    expect(finding(result, "S1")).toMatchObject({ evidence: { tools: 1 } });
  });
});

```

`test/core/evaluate.test.ts`(바꾼 뒤 3/3):

```ts
    expect(finding(result, "S1")).toMatchObject({ evidence: { tools: 1 } });
  });
  it("Codex를 함께 넣으면 Codex의 규칙을 그 도구의 셋팅 사실로 잰다(설계 「5단계 3부 계획 전 결정」 2~11번)", () => {
    const codexSessions: SummaryInput[] = [{ sessionId: "x", cwd: APP, days: { "2026-11-10": { responses: 10, humanRequests: 5, tokens: { input: 1000, cacheRead: 600, output: 10 } } } }];
    const unsafe = codexSafety({ approval: "never", sandbox: "danger-full-access", fullAccess: true });
    const codex = codexTool({ sessions: codexSessions, setup: { safety: unsafe, skills: [skill("c-skill", { path: "/home/u/.agents/skills/c-skill" })] } });
    const result = evaluate(evaluationInput([codex, claudeTool({ sessions: SESSIONS, setup: SETUP })], { installs: watched(IDLE_SKILL, DB) }));
    expect(result.tools.map((tool) => [tool.tool, tool.scored])).toEqual([["claude-code", true], ["codex", true]]);
    // E1은 도구마다의 식이다. Codex는 입력 칸에 캐시가 들어 있다
    expect(finding(result, "E1").tools.find((value) => value.tool === "codex")).toMatchObject({ status: "scored", value: 0.6 });
    // S2는 두 도구로 잰다. Codex는 승인 없음과 전면 해제를 함께 써 안전장치가 없다
    expect(result.safeguards).toEqual([
      { tool: "claude-code", guardHook: false, permissionChecks: true },
      { tool: "codex", guardHook: false, permissionChecks: false },
    ]);
    expect(finding(result, "S2")).toMatchObject({ evidence: { guarded: 1, tools: 2, unreadTools: 0 } });
    // Codex 스킬은 판정하지 않고 Codex의 정비 후보는 없다
    expect(finding(result, "E5").tools.find((value) => value.tool === "codex")).toMatchObject({ status: "unmeasured", reason: "unsupported" });
    expect(result.tools.find((tool) => tool.tool === "codex")?.skills).toEqual([]);
    expect(result.candidates.filter((candidate) => candidate.tool === "codex")).toEqual([]);
  });
});

```

`test/core/installs-candidates.test.ts`(찾을 곳 1/3):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
```

`test/core/installs-candidates.test.ts`(바꾼 뒤 1/3):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
```

`test/core/installs-candidates.test.ts`(찾을 곳 2/3):

```ts
import type { InstallRecord } from "../../src/state/state.ts";
import { facts, mcpServer, plugin, skill } from "../helpers/facts.ts";
import { summary } from "../helpers/summaries.ts";
```

`test/core/installs-candidates.test.ts`(바꾼 뒤 2/3):

```ts
import type { InstallRecord } from "../../src/state/state.ts";
import { codexFacts, facts, mcpServer, plugin, skill } from "../helpers/facts.ts";
import { summary } from "../helpers/summaries.ts";
```

`test/core/installs-candidates.test.ts`(찾을 곳 3/3):

```ts

describe("A3 서버 막기", () => {
```

`test/core/installs-candidates.test.ts`(바꾼 뒤 3/3):

```ts

describe("Codex(설계 「5단계 3부 계획 전 결정」 11번)", () => {
  it("Codex 설치의 정비 후보는 6단계가 조건을 정할 때까지 내지 않는다. 안 부른 것이 확인된 서버가 있어도 없다", () => {
    const idle = mcpServer("idle");
    const summaries = [summary({ days: { "2026-11-10": { responses: 1 } } })];
    const base = { day, windows, records: recordMap([{ key: idle.installKey!, firstSeen: "2026-09-01", appeared: false }]), complete: true };
    const tool: ToolSetup = { tool: "codex", totals: toolTotals(summaries, windows, []), coverage: CODEX_COVERAGE, setup: codexFacts({ mcpServers: [idle] }), highestVersion: "0.166.0" };
    const skills = judgeSkills(tool, { ...base, used: usedSkillNames(summaries, windows), listings: sessionListings(summaries, "skill", {}, lookup) });
    const servers = judgeServers(tool, { ...base, used: calledMcpNames(summaries, windows), listings: sessionListings(summaries, "mcp", {}, lookup) });
    expect(servers.servers.map((judged) => judged.verdict)).toEqual(["unused"]);
    expect(skills).toEqual({ measurement: expect.objectContaining({ status: "unmeasured", reason: "unsupported" }), bundles: [] });
    expect(candidatesOf(tool, skills, servers, day, NO_SELF)).toEqual([]);
  });
});

describe("A3 서버 막기", () => {
```

`test/core/installs-servers.test.ts`(찾을 곳 1/4):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
```

`test/core/installs-servers.test.ts`(바꾼 뒤 1/4):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
```

`test/core/installs-servers.test.ts`(찾을 곳 2/4):

```ts
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, McpFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts, mcpServer, plugin, project } from "../helpers/facts.ts";
import { summary } from "../helpers/summaries.ts";
```

`test/core/installs-servers.test.ts`(바꾼 뒤 2/4):

```ts
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, CodexSetupFacts, McpFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { codexFacts, codexPlugin, codexProject, facts, mcpServer, plugin, project } from "../helpers/facts.ts";
import { summary } from "../helpers/summaries.ts";
```

`test/core/installs-servers.test.ts`(찾을 곳 3/4):

```ts
}
const judge = (setup: Partial<ClaudeSetupFacts>, options: Options = {}) => {
```

`test/core/installs-servers.test.ts`(바꾼 뒤 3/4):

```ts
}
/** 주는 도구(구간 합계와 관측 범위를 받아 셋팅 사실을 붙인다)로 판정한다. 관측 범위를 주지 않으면 Codex의 것이다 */
const judgeWith = (tool: (totals: ToolSetup["totals"], coverage: ToolCoverage) => ToolSetup, options: Options = {}) => {
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
  return judgeServers(tool(toolTotals(summaries, windows, []), options.coverage ?? CODEX_COVERAGE), context);
};
const judgeCodex = (setup: Partial<CodexSetupFacts>, options: Options = {}) =>
  judgeWith((totals, coverage) => ({ tool: "codex", totals, coverage, setup: codexFacts(setup), highestVersion: "0.166.0" }), options);
const judge = (setup: Partial<ClaudeSetupFacts>, options: Options = {}) => {
```

`test/core/installs-servers.test.ts`(찾을 곳 4/4):

```ts

describe("판정한 서버의 판정을 시작할 수 있는 날", () => {
```

`test/core/installs-servers.test.ts`(바꾼 뒤 4/4):

```ts

describe("E6의 Codex 서버(설계 「5단계 3부 계획 전 결정」 10번)", () => {
  it("Claude Code와 같은 규칙으로 판정한다. 부른 것은 쓴 것이고 지켜봤는데 부르지 않은 것은 안 쓴 것이다", () => {
    const servers = [mcpServer("db"), mcpServer("search"), mcpServer("idle")];
    const result = judgeCodex({ mcpServers: servers }, { called: ["db"], watched: servers });
    expect(result.servers.map((judged) => [judged.server.name, judged.verdict])).toEqual([
      ["db", "used"],
      ["idle", "unused"],
      ["search", "unused"],
    ]);
    expect(result.measurement).toMatchObject({ status: "scored", value: 2 / 3 });
  });
  it("사용자 config.toml이나 신뢰한 프로젝트의 .codex/config.toml을 읽지 못했으면(풀리지 않는 것도) 판정하지 않는다", () => {
    const db = [mcpServer("db")];
    for (const config of ["unreadable", "unparsable"] as const) expect(judgeCodex({ config, mcpServers: db }, { watched: db })).toMatchObject({ measurement: { status: "unmeasured", reason: "unreadable" }, servers: [] });
    const broken = codexProject("/work/a", { configStatus: "unparsable", safety: null });
    expect(judgeCodex({ projects: [broken], mcpServers: db }, { watched: db }).measurement).toMatchObject({ status: "unmeasured", reason: "unreadable" });
    // 신뢰하지 않은 프로젝트의 설정은 Codex가 쓰지 않는다. 없는 설정은 읽지 못한 것이 아니다
    const untrusted = codexProject("/work/a", { trust: "untrusted", configStatus: null, safety: null });
    expect(judgeCodex({ projects: [untrusted], config: "missing", mcpServers: db }, { watched: db }).servers.map((judged) => judged.verdict)).toEqual(["unused"]);
  });
  it("구성을 모르거나 MCP 정의를 읽지 못한 플러그인이 넣은 서버는 그 서버만 세지 않는다", () => {
    const fromUnread = mcpServer("p-srv", { scope: "plugin", pluginId: "p@m" });
    const fromUnknown = mcpServer("q-srv", { scope: "plugin", pluginId: "q@m" });
    const db = mcpServer("db");
    const plugins = [codexPlugin("p@m", { mcpUnreadable: true }), codexPlugin("q@m", { compositionKnown: false })];
    const result = judgeCodex({ plugins, mcpServers: [fromUnread, fromUnknown, db] }, { watched: [fromUnread, fromUnknown, db] });
    expect(result.servers.map((judged) => [judged.server.name, judged.verdict, judged.excluded])).toEqual([
      ["db", "unused", null],
      ["p-srv", "unknown", "plugin_unread"],
      ["q-srv", "unknown", "plugin_unread"],
    ]);
  });
});

describe("판정한 서버의 판정을 시작할 수 있는 날", () => {
```

`test/core/metrics-fit.test.ts`(찾을 곳 1/10):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolId } from "../../src/adapters/types.ts";
import { fitToolRules, mergedFitRules } from "../../src/core/metrics/fit.ts";
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 1/10):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import { fitToolRules, mergedFitRules } from "../../src/core/metrics/fit.ts";
```

`test/core/metrics-fit.test.ts`(찾을 곳 2/10):

```ts
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, ProjectFact } from "../../src/scan/types.ts";
import { facts, instructionFile, instructions, project, skill } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 2/10):

```ts
import { toolTotals } from "../../src/core/totals.ts";
import type { ClaudeSetupFacts, CodexProjectFact, CodexSetupFacts, ProjectFact } from "../../src/scan/types.ts";
import { codexFacts, codexProject, facts, instructionFile, instructions, project, skill } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";
```

`test/core/metrics-fit.test.ts`(찾을 곳 3/10):

```ts
const at = (cwd: string, count = 1): SummaryInput[] => Array.from({ length: count }, () => ({ cwd, days: { "2026-11-10": { responses: 1 } } }));
const tool = (setup: Partial<ClaudeSetupFacts> = {}, sessions: SummaryInput[] = [], id = "claude-code"): ToolSetup => ({
  tool: id as ToolId,
  totals: toolTotals(sessions.map((s) => summary(s)), windows, ["Bash"]),
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 3/10):

```ts
const at = (cwd: string, count = 1): SummaryInput[] => Array.from({ length: count }, () => ({ cwd, days: { "2026-11-10": { responses: 1 } } }));
const tool = (setup: Partial<ClaudeSetupFacts> = {}, sessions: SummaryInput[] = []): ToolSetup => ({
  tool: "claude-code",
  totals: toolTotals(sessions.map((s) => summary(s)), windows, ["Bash"]),
```

`test/core/metrics-fit.test.ts`(찾을 곳 4/10):

```ts
});
/** 프로젝트 목록은 첫 도구의 것이다. 세션의 작업 폴더는 이미 정규화한 꼴로 적는다 */
const merged = (...tools: ToolSetup[]) => {
  const projects = tools[0]?.setup.projects ?? [];
  const normalized = Object.fromEntries(projects.flatMap((p) => p.cwds.map((cwd) => [cwd, cwd])));
  return mergedFitRules(tools, projectUsage(tools, projectLookup(projects, normalized)));
};
const written = (path: string, lineHashes: string[] = []) => instructions({ files: [instructionFile(path)], lineHashes });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 4/10):

```ts
});
const codexTool = (setup: Partial<CodexSetupFacts> = {}, sessions: SummaryInput[] = []): ToolSetup => ({
  tool: "codex",
  totals: toolTotals(sessions.map((s) => summary(s)), windows, ["shell"]),
  coverage: CODEX_COVERAGE,
  setup: codexFacts(setup),
  highestVersion: "0.166.0",
});
/** 주는 프로젝트 목록으로 잰다. 세션의 작업 폴더는 이미 정규화한 꼴로 적는다 */
const mergedWith = (projects: ProjectFact[], ...tools: ToolSetup[]) => {
  const normalized = Object.fromEntries(projects.flatMap((p) => p.cwds.map((cwd) => [cwd, cwd])));
  return mergedFitRules(tools, projectUsage(tools, projectLookup(projects, normalized)), projects);
};
/** 프로젝트 목록은 Claude Code 도구의 것이다 */
const merged = (...tools: ToolSetup[]) => {
  const claude = tools.find((item) => item.tool === "claude-code");
  return mergedWith(claude?.tool === "claude-code" ? claude.setup.projects : [], ...tools);
};
/** 내용이 있는 Codex 프로젝트 지침(AGENTS.md)이 있는 신뢰한 프로젝트 */
const codexGuide = (root: string, lineHashes: string[] = [], input: Partial<CodexProjectFact> = {}): CodexProjectFact => codexProject(root, { instructions: written(root + "/AGENTS.md", lineHashes), ...input });
const written = (path: string, lineHashes: string[] = []) => instructions({ files: [instructionFile(path)], lineHashes });
```

`test/core/metrics-fit.test.ts`(찾을 곳 5/10):

```ts
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3));
      const codex = tool({ projects: [project("/work/a")] }, at("/work/a", 3), "codex");
      const result = merged(claude, codex);
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 5/10):

```ts
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3));
      const codex = codexTool({ projects: [codexProject("/work/a")] }, at("/work/a", 3));
      const result = merged(claude, codex);
```

`test/core/metrics-fit.test.ts`(찾을 곳 6/10):

```ts
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 20));
      const codex = tool({ projects: [project("/work/a")] }, at("/work/a", 1), "codex");
      expect(merged(claude, codex).F3).toMatchObject({ status: "scored", value: 1 });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 6/10):

```ts
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 20));
      const codex = codexTool({ projects: [codexProject("/work/a")] }, at("/work/a", 1));
      expect(merged(claude, codex).F3).toMatchObject({ status: "scored", value: 1 });
```

`test/core/metrics-fit.test.ts`(찾을 곳 7/10):

```ts
    it("어느 도구도 3개에 못 미치면 주 세션이 가장 많은 도구를 본다. 수가 같으면 그 도구들 모두다", () => {
      const more = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 2)), tool({ projects: [project("/work/a")] }, at("/work/a", 1), "codex"));
      expect(more.F3).toMatchObject({ status: "scored", value: 1 });
      const tie = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 2)), tool({ projects: [project("/work/a")] }, at("/work/a", 2), "codex"));
      expect(tie.F3).toMatchObject({ status: "scored", value: 0 });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 7/10):

```ts
    it("어느 도구도 3개에 못 미치면 주 세션이 가장 많은 도구를 본다. 수가 같으면 그 도구들 모두다", () => {
      const more = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 2)), codexTool({ projects: [codexProject("/work/a")] }, at("/work/a", 1)));
      expect(more.F3).toMatchObject({ status: "scored", value: 1 });
      const tie = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 2)), codexTool({ projects: [codexProject("/work/a")] }, at("/work/a", 2)));
      expect(tie.F3).toMatchObject({ status: "scored", value: 0 });
```

`test/core/metrics-fit.test.ts`(찾을 곳 8/10):

```ts
    it("그 도구의 셋팅 사실에 그 프로젝트가 없으면 그 도구의 지침은 없는 것이다", () => {
      const result = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3)), tool({ projects: [] }, at("/work/a", 3), "codex"));
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", name: "a", tools: ["codex"] }]);
    });
  });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 8/10):

```ts
    it("그 도구의 셋팅 사실에 그 프로젝트가 없으면 그 도구의 지침은 없는 것이다", () => {
      const result = merged(tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3)), codexTool({ projects: [] }, at("/work/a", 3)));
      expect(result.missingInstructions).toEqual([{ normRoot: "/work/a", name: "a", tools: ["codex"] }]);
    });
    it("Codex가 주로 쓴 도구이면 Codex가 읽는 프로젝트 지침을 본다. 읽지 않은 프로젝트의 것은 없는 것이다(설계 「5단계 3부 계획 전 결정」 7번)", () => {
      const claude = tool({ projects: claudeOnly("/work/a") }, at("/work/a", 3));
      expect(merged(claude, codexTool({ projects: [codexGuide("/work/a")] }, at("/work/a", 3))).F3).toMatchObject({ status: "scored", value: 1 });
      const unscanned = codexGuide("/work/a", [], { scanned: false });
      expect(merged(claude, codexTool({ projects: [unscanned] }, at("/work/a", 3))).missingInstructions).toEqual([{ normRoot: "/work/a", name: "a", tools: ["codex"] }]);
      // 내용이 없는 지침 파일은 지침이 아니다
      const empty = codexProject("/work/a", { instructions: instructions({ files: [instructionFile("/work/a/AGENTS.md", { hasContent: false })] }) });
      expect(merged(claude, codexTool({ projects: [empty] }, at("/work/a", 3))).F3).toMatchObject({ status: "scored", value: 0 });
    });
    it("깃 저장소가 아닌 폴더는 Codex의 지침 파일이나 신뢰한 프로젝트의 .codex/config.toml이 있어도 프로젝트로 다룬다", () => {
      const folder = [project("/work/f", { kind: "folder" })];
      const codexOnly = (input: Partial<CodexProjectFact>) => mergedWith(folder, codexTool({ projects: [codexProject("/work/f", input)] }, at("/work/f", 3)));
      expect(codexOnly({ configStatus: "missing" }).F3).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
      for (const configStatus of ["ok", "unparsable", "unreadable"] as const) expect(codexOnly({ configStatus }).F3).toMatchObject({ status: "scored", value: 0, evidence: { targets: 1 } });
      expect(codexOnly({ configStatus: null, trust: "untrusted", instructions: instructions({ unreadable: ["/work/f/AGENTS.md"] }) }).F3).toMatchObject({ status: "scored", value: 0 });
    });
  });
```

`test/core/metrics-fit.test.ts`(찾을 곳 9/10):

```ts
    const claude = tool({ globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"])] });
    const codex = tool({ globalInstructions: written("/home/u/.codex/AGENTS.md", ["c1", "c2"]), projects: [withLines("/work/a", ["c1", "c2"])] }, [], "codex");
    const result = merged(claude, codex);
    expect(result.F4).toEqual({ status: "scored", value: 1, evidence: { comparedProjects: 2, globalLines: 2, overlappingLines: 2 } });
    expect(result.worstOverlap).toEqual({ tool: "codex", normRoot: "/work/a", name: "a" });
    expect(merged(claude, tool({}, [], "codex")).F4).toMatchObject({ status: "scored", value: 0.25 });
  });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 9/10):

```ts
    const claude = tool({ globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"])] });
    const codex = codexTool({ globalInstructions: written("/home/u/.codex/AGENTS.md", ["c1", "c2"]), projects: [codexGuide("/work/a", ["c1", "c2"])] });
    const result = merged(claude, codex);
    expect(result.F4).toEqual({ status: "scored", value: 1, evidence: { comparedProjects: 2, globalLines: 2, overlappingLines: 2 } });
    // Codex의 프로젝트 사실에는 이름이 없어 프로젝트 목록의 이름을 쓴다
    expect(result.worstOverlap).toEqual({ tool: "codex", normRoot: "/work/a", name: "a" });
    expect(merged(claude, codexTool()).F4).toMatchObject({ status: "scored", value: 0.25 });
  });
  it("Codex는 전역과 같은 파일도 견준다. 목록에 없는 Codex 프로젝트의 이름은 정규화한 뿌리다(설계 「5단계 3부 계획 전 결정」 8번)", () => {
    const global = written("/home/u/.codex/AGENTS.md", ["c1", "c2"]);
    const same = codexProject("/work/z", { instructions: instructions({ files: [instructionFile("/home/u/.codex/AGENTS.md")], lineHashes: ["c1"] }) });
    expect(mergedWith([], codexTool({ globalInstructions: global, projects: [same] }))).toMatchObject({ F4: { status: "scored", value: 0.5 }, worstOverlap: { tool: "codex", normRoot: "/work/z", name: "/work/z" } });
  });
  it("Codex의 지침을 하나라도 읽지 못하면 Claude Code의 것이 다 보여도 unreadable이다", () => {
    const claude = tool({ globalInstructions: GLOBAL, projects: [withLines("/work/a", ["g1"])] });
    expect(merged(claude, codexTool({ globalInstructions: instructions({ unreadable: ["/home/u/.codex/AGENTS.md"] }) })).F4).toMatchObject({ status: "unmeasured", reason: "unreadable" });
    expect(merged(claude, codexTool({ projects: [codexProject("/work/a", { instructions: instructions({ unreadableDirs: ["/work/a"] }) })] })).F4).toMatchObject({ status: "unmeasured", reason: "unreadable" });
  });
```

`test/core/metrics-fit.test.ts`(찾을 곳 10/10):

```ts
  });
  it("도구가 여럿이면 부딪히는 쌍을 더하고, 한 도구의 설정만 읽지 못해도 규칙 전체가 unreadable이다", () => {
    const claude = tool({ projects: [withSettings("/work/a", 2)] });
    expect(merged(claude, tool({ projects: [withSettings("/work/a", 1)] }, [], "codex")).F6).toEqual({ status: "scored", value: 3, evidence: { conflicts: 3, projectsWithSettings: 2 } });
    expect(merged(claude, tool({}, [], "codex")).F6).toMatchObject({ status: "scored", value: 2 });
    expect(merged(claude, tool({ settings: { ...facts().settings, user: "unreadable" } }, [], "codex")).F6).toMatchObject({ status: "unmeasured", reason: "unreadable" });
  });
```

`test/core/metrics-fit.test.ts`(바꾼 뒤 10/10):

```ts
  });
  it("Codex는 견줄 권한 규칙이 없어 Claude Code만 센다. Codex의 설정을 읽지 못해도 잰다(설계 「5단계 계획 전 결정」 5번)", () => {
    const claude = tool({ projects: [withSettings("/work/a", 2)] });
    expect(merged(claude, codexTool({ projects: [codexProject("/work/a", { configStatus: "ok" })] })).F6).toEqual({ status: "scored", value: 2, evidence: { conflicts: 2, projectsWithSettings: 1 } });
    expect(merged(claude, codexTool({ config: "unreadable" })).F6).toMatchObject({ status: "scored", value: 2 });
    expect(merged(codexTool({ config: "unreadable" })).F6).toEqual({ status: "unmeasured", reason: "not_applicable", evidence: { conflicts: 0, projectsWithSettings: 0 } });
  });
```

`test/core/metrics-setup.test.ts`(찾을 곳 1/13):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolCoverage, ToolId } from "../../src/adapters/types.ts";
import { highestMainVersion, mergedSetupRules, setupToolRules, type ToolSetup } from "../../src/core/metrics/setup.ts";
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 1/13):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
import { highestMainVersion, mergedSetupRules, setupToolRules, type ToolSetup } from "../../src/core/metrics/setup.ts";
```

`test/core/metrics-setup.test.ts`(찾을 곳 2/13):

```ts
import type { HookSource, ShellGuard } from "../../src/scan/hooks.ts";
import type { ClaudeSetupFacts, FileStatus, SetupProblem } from "../../src/scan/types.ts";
import { facts, instructionFile, instructions, mcpServer, plugin, project } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 2/13):

```ts
import type { HookSource, ShellGuard } from "../../src/scan/hooks.ts";
import type { ClaudeSetupFacts, CodexSetupFacts, FileStatus, SetupProblem } from "../../src/scan/types.ts";
import { codexFacts, codexProject, codexSafety, facts, instructionFile, instructions, mcpServer, plugin, project } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";
```

`test/core/metrics-setup.test.ts`(찾을 곳 3/13):

```ts
interface ToolOptions {
  id?: string;
  sessions?: SummaryInput[];
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 3/13):

```ts
interface ToolOptions {
  sessions?: SummaryInput[];
```

`test/core/metrics-setup.test.ts`(찾을 곳 4/13):

```ts
const tool = (setup: Partial<ClaudeSetupFacts> = {}, options: ToolOptions = {}): ToolSetup => ({
  tool: (options.id ?? "claude-code") as ToolId,
  totals: toolTotals((options.sessions ?? []).map((s) => summary(s)), windows, ["Bash"]),
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 4/13):

```ts
const tool = (setup: Partial<ClaudeSetupFacts> = {}, options: ToolOptions = {}): ToolSetup => ({
  tool: "claude-code",
  totals: toolTotals((options.sessions ?? []).map((s) => summary(s)), windows, ["Bash"]),
```

`test/core/metrics-setup.test.ts`(찾을 곳 5/13):

```ts
});
const hooks = (input: Partial<ClaudeSetupFacts["hooks"]> = {}): ClaudeSetupFacts["hooks"] => ({ ...facts().hooks, ...input });
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 5/13):

```ts
});
/** Codex 하나. 셸 명령 도구는 Codex의 것이다 */
const codexTool = (setup: Partial<CodexSetupFacts> = {}, options: Omit<ToolOptions, "version"> = {}): ToolSetup => ({
  tool: "codex",
  totals: toolTotals((options.sessions ?? []).map((s) => summary(s)), windows, ["shell"]),
  coverage: options.coverage ?? CODEX_COVERAGE,
  setup: codexFacts(setup),
  highestVersion: "0.166.0",
});
const hooks = (input: Partial<ClaudeSetupFacts["hooks"]> = {}): ClaudeSetupFacts["hooks"] => ({ ...facts().hooks, ...input });
```

`test/core/metrics-setup.test.ts`(찾을 곳 6/13):

```ts
    expect(mergedSetupRules([tool(withBytes(199))]).S1).toEqual({ status: "scored", value: 0, evidence: { tools: 1, withInstructions: 0 } });
    expect(mergedSetupRules([tool(withBytes(5000)), tool({}, { id: "codex" })]).S1).toMatchObject({ status: "scored", value: 0.5 });
  });
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 6/13):

```ts
    expect(mergedSetupRules([tool(withBytes(199))]).S1).toEqual({ status: "scored", value: 0, evidence: { tools: 1, withInstructions: 0 } });
    expect(mergedSetupRules([tool(withBytes(5000)), codexTool()]).S1).toMatchObject({ status: "scored", value: 0.5 });
    // Codex의 전역 지침도 같은 꼴로 잰다(설계 「5단계 3부 계획 전 결정」 4번)
    const codexGuide = instructions({ files: [instructionFile("/home/u/.codex/AGENTS.md", { bytes: 300 })] });
    expect(mergedSetupRules([tool(withBytes(5000)), codexTool({ globalInstructions: codexGuide })]).S1).toEqual({ status: "scored", value: 1, evidence: { tools: 2, withInstructions: 2 } });
  });
```

`test/core/metrics-setup.test.ts`(찾을 곳 7/13):

```ts
      const result = s2({ settings });
      expect(result.S2).toEqual({ status: "scored", value: 1, evidence: { guarded: 1, tools: 1 } });
      expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: true }]);
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 7/13):

```ts
      const result = s2({ settings });
      expect(result.S2).toEqual({ status: "scored", value: 1, evidence: { guarded: 1, tools: 1, unreadTools: 0 } });
      expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: true }]);
```

`test/core/metrics-setup.test.ts`(찾을 곳 8/13):

```ts
    const result = s2({ settings: BYPASS });
    expect(result.S2).toEqual({ status: "scored", value: 0, evidence: { guarded: 0, tools: 1 } });
    expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: false }]);
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 8/13):

```ts
    const result = s2({ settings: BYPASS });
    expect(result.S2).toEqual({ status: "scored", value: 0, evidence: { guarded: 0, tools: 1, unreadTools: 0 } });
    expect(result.safeguards).toEqual([{ tool: "claude-code", guardHook: false, permissionChecks: false }]);
```

`test/core/metrics-setup.test.ts`(찾을 곳 9/13):

```ts
  describe("안전장치를 정하는 설정 파일 가운데 있는데 읽지 못한 것이 있으면 unreadable이다", () => {
    const unread = { status: "unmeasured", reason: "unreadable", evidence: { guarded: null, tools: 1 } };
    it("사용자 설정이 풀리지 않거나 열리지 않는다", () => {
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 9/13):

```ts
  describe("안전장치를 정하는 설정 파일 가운데 있는데 읽지 못한 것이 있으면 unreadable이다", () => {
    const unread = { status: "unmeasured", reason: "unreadable", evidence: { guarded: null, tools: 0, unreadTools: 1 } };
    it("사용자 설정이 풀리지 않거나 열리지 않는다", () => {
```

`test/core/metrics-setup.test.ts`(찾을 곳 10/13):

```ts
  it("안전장치가 있는 도구 수를 쓰는 도구 수로 나눈다. 쓰는 도구가 없으면 no_data다", () => {
    const result = mergedSetupRules([tool({ settings: BYPASS }), tool({ settings: mode("other") }, { id: "codex" })]);
    expect(result.S2).toEqual({ status: "scored", value: 0.5, evidence: { guarded: 1, tools: 2 } });
    expect(result.safeguards.map((s) => s.tool)).toEqual(["claude-code", "codex"]);
    expect(mergedSetupRules([]).S2).toEqual({ status: "unmeasured", reason: "no_data", evidence: { guarded: 0, tools: 0 } });
    expect(mergedSetupRules([]).safeguards).toEqual([]);
  });
});
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 10/13):

```ts
  it("안전장치가 있는 도구 수를 쓰는 도구 수로 나눈다. 쓰는 도구가 없으면 no_data다", () => {
    const result = mergedSetupRules([tool({ settings: BYPASS }), codexTool()]);
    expect(result.S2).toEqual({ status: "scored", value: 0.5, evidence: { guarded: 1, tools: 2, unreadTools: 0 } });
    expect(result.safeguards.map((s) => s.tool)).toEqual(["claude-code", "codex"]);
    expect(mergedSetupRules([]).S2).toEqual({ status: "unmeasured", reason: "no_data", evidence: { guarded: 0, tools: 0, unreadTools: 0 } });
    expect(mergedSetupRules([]).safeguards).toEqual([]);
  });

  describe("Codex는 승인 없음과 전면 해제를 함께 쓰는 맥락이 없을 때 안전장치가 있다(설계 「5단계 3부 계획 전 결정」 5번)", () => {
    const codexS2 = (setup: Partial<CodexSetupFacts>) => mergedSetupRules([codexTool(setup)]);
    const NEVER_FULL = codexSafety({ approval: "never", sandbox: "danger-full-access", fullAccess: true });
    it("전역 맥락이 둘을 함께 쓰면 안전장치가 없다. 하나만으로는 있다. 훅은 안전장치로 치지 않는다", () => {
      expect(codexS2({ safety: NEVER_FULL }).safeguards).toEqual([{ tool: "codex", guardHook: false, permissionChecks: false }]);
      expect(codexS2({ safety: NEVER_FULL }).S2).toEqual({ status: "scored", value: 0, evidence: { guarded: 0, tools: 1, unreadTools: 0 } });
      expect(codexS2({ safety: codexSafety({ approval: "never" }) }).S2).toMatchObject({ status: "scored", value: 1 });
      expect(codexS2({ safety: codexSafety({ sandbox: "danger-full-access", fullAccess: true }) }).S2).toMatchObject({ status: "scored", value: 1 });
      expect(codexS2({}).safeguards).toEqual([{ tool: "codex", guardHook: false, permissionChecks: true }]);
    });
    it("신뢰한 프로젝트 맥락 하나라도 둘을 함께 쓰면 안전장치가 없다. 전면 해제는 그 맥락의 판정(fullAccess)으로 본다", () => {
      expect(codexS2({ projects: [codexProject("/work/a"), codexProject("/work/b", { safety: NEVER_FULL })] }).S2).toMatchObject({ status: "scored", value: 0 });
      // 합친 값에 전면 해제가 남아 있어도 그 맥락이 정한 방식이 전면 해제가 아니면 안전장치가 있다
      const readOnly = codexSafety({ approval: "never", sandbox: "danger-full-access", permissions: "other", fullAccess: false });
      expect(codexS2({ projects: [codexProject("/work/a", { safety: readOnly })] }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("신뢰하지 않은 프로젝트와 신뢰 기록이 없는 프로젝트의 맥락은 보지 않는다", () => {
      const untrusted = codexProject("/work/a", { trust: "untrusted", configStatus: null, safety: NEVER_FULL });
      const unknown = codexProject("/work/b", { trust: null, configStatus: null, safety: null });
      expect(codexS2({ projects: [untrusted, unknown] }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("사용자 config.toml이나 신뢰한 프로젝트의 .codex/config.toml을 읽지 못했으면(풀리지 않는 것도) Codex만 빼고 남은 도구로 잰다", () => {
      for (const config of ["unreadable", "unparsable"] as const) {
        const result = mergedSetupRules([tool({ settings: mode("other") }), codexTool({ config })]);
        expect(result.S2).toEqual({ status: "scored", value: 1, evidence: { guarded: 1, tools: 1, unreadTools: 1 } });
        expect(result.safeguards).toEqual([
          { tool: "claude-code", guardHook: false, permissionChecks: true },
          { tool: "codex", guardHook: null, permissionChecks: null },
        ]);
      }
      const broken = codexProject("/work/a", { configStatus: "unparsable", safety: null });
      expect(mergedSetupRules([tool({ settings: BYPASS }), codexTool({ projects: [broken] })]).S2).toEqual({ status: "scored", value: 0, evidence: { guarded: 0, tools: 1, unreadTools: 1 } });
      // 신뢰하지 않은 프로젝트의 설정은 Codex가 쓰지 않는다. 없는 설정은 읽지 못한 것이 아니다
      expect(codexS2({ projects: [codexProject("/work/a", { trust: "untrusted", configStatus: null, safety: null })] }).S2).toMatchObject({ status: "scored", value: 1 });
      expect(codexS2({ config: "missing" }).S2).toMatchObject({ status: "scored", value: 1 });
    });
    it("한 도구만 읽지 못해 빠지면 근거에 그 수가 남고, 모든 도구를 읽지 못했으면 unreadable이다", () => {
      const claudeUnread = mergedSetupRules([tool({ settings: mode(null, null, "unparsable") }), codexTool()]);
      expect(claudeUnread.S2).toEqual({ status: "scored", value: 1, evidence: { guarded: 1, tools: 1, unreadTools: 1 } });
      const both = mergedSetupRules([tool({ settings: mode(null, null, "unparsable") }), codexTool({ config: "unreadable" })]);
      expect(both.S2).toEqual({ status: "unmeasured", reason: "unreadable", evidence: { guarded: null, tools: 0, unreadTools: 2 } });
    });
  });
});
```

`test/core/metrics-setup.test.ts`(찾을 곳 11/13):

```ts
    const claude = tool({ problems: [problem("unparsable", "/work/a/.mcp.json"), problem("noFrontmatter", "/home/u/.claude/skills/x", { realPath: "/shared/x" }), problem("noFrontmatter", "/home/u/.claude/plugins/p/skills/y", { owner: "plugin" })] });
    const codex = tool({ problems: [problem("noFrontmatter", "/home/u/.codex/skills/x", { realPath: "/shared/x" }), problem("unparsable", "/home/u/.codex/config.toml")] }, { id: "codex" });
    expect(mergedSetupRules([claude, codex]).setupProblems).toEqual([
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 11/13):

```ts
    const claude = tool({ problems: [problem("unparsable", "/work/a/.mcp.json"), problem("noFrontmatter", "/home/u/.claude/skills/x", { realPath: "/shared/x" }), problem("noFrontmatter", "/home/u/.claude/plugins/p/skills/y", { owner: "plugin" })] });
    const codex = codexTool({ problems: [problem("noFrontmatter", "/home/u/.codex/skills/x", { realPath: "/shared/x" }), problem("unparsable", "/home/u/.codex/config.toml")] });
    expect(mergedSetupRules([claude, codex]).setupProblems).toEqual([
```

`test/core/metrics-setup.test.ts`(찾을 곳 12/13):

```ts
    expect(mergedSetupRules([tool({ problems: linked })]).S3).toMatchObject({ status: "scored", value: 1 });
    const twoTools = [tool({ problems: [problem("unparsable", "/work/a/.mcp.json")] }), tool({ problems: [problem("unparsable", "/work/a/.mcp.json")] }, { id: "codex" })];
    expect(mergedSetupRules(twoTools).S3).toMatchObject({ status: "scored", value: 1 });
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 12/13):

```ts
    expect(mergedSetupRules([tool({ problems: linked })]).S3).toMatchObject({ status: "scored", value: 1 });
    const twoTools = [tool({ problems: [problem("unparsable", "/work/a/.mcp.json")] }), codexTool({ problems: [problem("unparsable", "/work/a/.mcp.json")] })];
    expect(mergedSetupRules(twoTools).S3).toMatchObject({ status: "scored", value: 1 });
```

`test/core/metrics-setup.test.ts`(찾을 곳 13/13):

```ts
  });
  it("연결 실패를 못 보는 도구는 unsupported이고, 그것이 다른 까닭보다 앞선다", () => {
```

`test/core/metrics-setup.test.ts`(바꾼 뒤 13/13):

```ts
  });
  it("Codex는 연결 실패를 기록하지 않아 unsupported다(관측 범위)", () => {
    expect(setupToolRules(codexTool({ mcpServers: [mcpServer("db")] }, { sessions: [session(true)] })).S5).toMatchObject({ status: "unmeasured", reason: "unsupported" });
  });
  it("관측 범위가 있다면 Codex의 켜짐과 서버를 정하는 곳은 사용자 config.toml과 신뢰한 프로젝트의 .codex/config.toml이다", () => {
    const measured: ToolCoverage = { ...CODEX_COVERAGE, mcpFailuresAndHooks: "measured" };
    const db = [mcpServer("db")];
    expect(setupToolRules(codexTool({ config: "unparsable", mcpServers: db }, { coverage: measured, sessions: [session(true)] })).S5).toMatchObject({ status: "unmeasured", reason: "unreadable" });
    expect(setupToolRules(codexTool({ projects: [codexProject("/work/a", { configStatus: "unreadable", safety: null })] }, { coverage: measured, sessions: [session(true)] })).S5).toMatchObject({ status: "unmeasured", reason: "unreadable" });
    expect(setupToolRules(codexTool({ mcpServers: db }, { coverage: measured, sessions: [session(true)] })).S5).toMatchObject({ status: "scored", value: 1 });
    expect(setupToolRules(codexTool({}, { coverage: measured, sessions: [session(true)] })).S5).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
  });
  it("연결 실패를 못 보는 도구는 unsupported이고, 그것이 다른 까닭보다 앞선다", () => {
```

`test/core/metrics-usage.test.ts`(찾을 곳 1/3):

```ts
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { CoverageKey, ToolCoverage } from "../../src/adapters/types.ts";
import { usageRules } from "../../src/core/metrics/usage.ts";
import { toolTotals } from "../../src/core/totals.ts";
```

`test/core/metrics-usage.test.ts`(바꾼 뒤 1/3):

```ts
import { describe, expect, it } from "vitest";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { CoverageKey, ToolCoverage, ToolId } from "../../src/adapters/types.ts";
import { usageRules } from "../../src/core/metrics/usage.ts";
import { toolTotals } from "../../src/core/totals.ts";
```

`test/core/metrics-usage.test.ts`(찾을 곳 2/3):

```ts
const one = (cell: DayInput) => totalsOf({ days: { [D]: { responses: 1, ...cell } } });
const without = (...keys: CoverageKey[]): ToolCoverage => ({ ...CLAUDE_COVERAGE, ...Object.fromEntries(keys.map((key) => [key, "unsupported"])) });
const rules = (totals: ReturnType<typeof totalsOf>, coverage: ToolCoverage = CLAUDE_COVERAGE) => usageRules(totals, coverage);

describe("S4 훅이 안정적으로 돈다", () => {
```

`test/core/metrics-usage.test.ts`(바꾼 뒤 2/3):

```ts
const one = (cell: DayInput) => totalsOf({ days: { [D]: { responses: 1, ...cell } } });
const without = (...keys: CoverageKey[]): ToolCoverage => ({ ...CLAUDE_COVERAGE, ...Object.fromEntries(keys.map((key) => [key, "unsupported"])) });
const rules = (totals: ReturnType<typeof totalsOf>, coverage: ToolCoverage = CLAUDE_COVERAGE, tool: ToolId = "claude-code") => usageRules(totals, coverage, tool);

describe("S4 훅이 안정적으로 돈다", () => {
```

`test/core/metrics-usage.test.ts`(찾을 곳 3/3):

```ts
    expect(rules(one({ tokens: { output: 5 } })).E1).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
});

```

`test/core/metrics-usage.test.ts`(바꾼 뒤 3/3):

```ts
    expect(rules(one({ tokens: { output: 5 } })).E1).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
  it("Codex는 입력 칸에 캐시가 들어 있어 캐시 입력을 입력으로 나눈다(설계 11.3 「E1의 식」, 「5단계 3부 계획 전 결정」 6번)", () => {
    const tokens = one({ tokens: { input: 1000, cacheRead: 700, cacheWrite: 50, output: 9 } });
    expect(rules(tokens, CODEX_COVERAGE, "codex").E1).toEqual({ status: "scored", value: 0.7, evidence: { cacheRead: 700, cacheWrite: 50, input: 1000 } });
    expect(rules(one({ tokens: { cacheRead: 3, output: 5 } }), CODEX_COVERAGE, "codex").E1).toMatchObject({ status: "unmeasured", reason: "no_data" });
  });
});

```

`test/core/result-hints.test.ts`(찾을 곳 1/2):

```ts
import { deepHints, LARGE_GLOBAL_TOKENS, MENTION_HINT_MIN, REPEATED_LINES_HINT_MIN } from "../../src/core/result/hints.ts";
import { instructions, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/core/result-hints.test.ts`(바꾼 뒤 1/2):

```ts
import { deepHints, LARGE_GLOBAL_TOKENS, MENTION_HINT_MIN, REPEATED_LINES_HINT_MIN } from "../../src/core/result/hints.ts";
import { codexProject, instructions, project } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/core/result-hints.test.ts`(찾을 곳 2/2):

```ts

  it("셋팅에 단서가 없으면 빈 목록이다", () => {
```

`test/core/result-hints.test.ts`(바꾼 뒤 2/2):

```ts

  it("Codex의 단서는 아직 내지 않는다. 4부가 넣는다(설계 「5단계 3부 계획 전 결정」 13번)", () => {
    const big = instructions({ chars: { ascii: 0, other: LARGE_GLOBAL_TOKENS + 1 }, lineHashes: ["a", "b", "c"] });
    const lines = instructions({ lineHashes: ["x", "y", "z"] });
    const codex = codexTool({ setup: { globalInstructions: big, globalMentions: { "/work/a": MENTION_HINT_MIN }, projects: [codexProject("/work/a", { instructions: lines }), codexProject("/work/b", { instructions: lines })] } });
    expect(deepHints(evaluationInput([codex]))).toEqual([]);
  });
  it("셋팅에 단서가 없으면 빈 목록이다", () => {
```

`test/core/result-notices-setup.test.ts`(찾을 곳 1/2):

```ts
import { HOME, instructions, plugin, project, skill } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/core/result-notices-setup.test.ts`(바꾼 뒤 1/2):

```ts
import { HOME, instructions, plugin, project, skill } from "../helpers/facts.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/core/result-notices-setup.test.ts`(찾을 곳 2/2):

```ts
describe("셋팅 쪽 알림", () => {
  it("빠진 것이 없으면 알림이 없다", () => {
```

`test/core/result-notices-setup.test.ts`(바꾼 뒤 2/2):

```ts
describe("셋팅 쪽 알림", () => {
  it("Codex의 셋팅 쪽 알림은 아직 내지 않는다. 4부가 넣는다(설계 「5단계 3부 계획 전 결정」 13번)", () => {
    const codex = codexTool({ sessions: enough, setup: { config: "unparsable", unreadableDirs: ["/home/u/.agents/skills"] } });
    const input = evaluationInput([codex, claudeTool({ sessions: enough })]);
    expect(setupNotices(input, evaluate(input), { stateBroken: false }).filter((notice) => "tool" in notice)).toEqual([]);
  });
  it("빠진 것이 없으면 알림이 없다", () => {
```

`test/helpers/evaluation.ts`(찾을 곳 1/4):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
```

`test/helpers/evaluation.ts`(바꾼 뒤 1/4):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { CODEX_SHELL_TOOLS } from "../../src/adapters/codex/parser.ts";
import type { ToolCoverage } from "../../src/adapters/types.ts";
```

`test/helpers/evaluation.ts`(찾을 곳 2/4):

```ts
import { NO_SELF } from "../../src/core/installs/candidates.ts";
import type { ClaudeSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { facts } from "./facts.ts";
import { summary, type SummaryInput } from "./summaries.ts";
```

`test/helpers/evaluation.ts`(바꾼 뒤 2/4):

```ts
import { NO_SELF } from "../../src/core/installs/candidates.ts";
import type { ClaudeSetupFacts, CodexSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";
import type { InstallRecord } from "../../src/state/state.ts";
import { codexFacts, facts } from "./facts.ts";
import { summary, type SummaryInput } from "./summaries.ts";
```

`test/helpers/evaluation.ts`(찾을 곳 3/4):

```ts

/** 같은 정체로 9월 1일부터 지켜본 관측 기록. 정체가 없는 서버는 적지 않는다 */
```

`test/helpers/evaluation.ts`(바꾼 뒤 3/4):

```ts

export interface CodexToolInput {
  sessions?: SummaryInput[];
  setup?: Partial<CodexSetupFacts>;
  coverage?: ToolCoverage;
  complete?: Partial<ToolInput["complete"]>;
}

/** Codex 하나의 입력. 스킬 관측은 늘 빠짐없지 않고(Codex는 스킬 사용을 기록하지 않는다) MCP 관측은 빠짐없다. 셸 명령 도구는 Codex의 것이다 */
export function codexTool(input: CodexToolInput = {}): ToolInput {
  return {
    tool: "codex",
    summaries: (input.sessions ?? []).map((session) => summary(session)),
    coverage: input.coverage ?? CODEX_COVERAGE,
    shellTools: [...CODEX_SHELL_TOOLS],
    complete: { skills: false, mcp: true, ...input.complete },
    setup: codexFacts(input.setup),
  };
}

/** 같은 정체로 9월 1일부터 지켜본 관측 기록. 정체가 없는 서버는 적지 않는다 */
```

`test/helpers/evaluation.ts`(찾을 곳 4/4):

```ts

/** 입력 묶음. 프로젝트 목록은 첫 도구의 셋팅 사실의 것이고, 세션의 작업 폴더는 이미 정규화한 꼴로 적은 것으로 본다. 관측 기록을 주지 않으면 첫 점검이다 */
export function evaluationInput(tools: ToolInput[], input: Partial<Omit<EvaluationInput, "tools">> = {}): EvaluationInput {
  const projects = input.projects ?? tools[0]?.setup.projects ?? [];
  return {
```

`test/helpers/evaluation.ts`(바꾼 뒤 4/4):

```ts

/** 입력 묶음. 프로젝트 목록은 Claude Code 도구의 셋팅 사실의 것이고(그 도구가 없으면 비었다), 세션의 작업 폴더는 이미 정규화한 꼴로 적은 것으로 본다. 관측 기록을 주지 않으면 첫 점검이다 */
export function evaluationInput(tools: ToolInput[], input: Partial<Omit<EvaluationInput, "tools">> = {}): EvaluationInput {
  const claude = tools.find((tool) => tool.tool === "claude-code");
  const projects = input.projects ?? (claude?.tool === "claude-code" ? claude.setup.projects : []);
  return {
```

`test/helpers/facts.ts`(찾을 곳 1/2):

```ts
// 시험에서 셋팅 사실을 손으로 짓는 도구. 적지 않은 것은 "다 읽었고 아무것도 없다"의 값이다
import { emptyInstructionSet, type InstructionFile, type InstructionSet } from "../../src/scan/instructions.ts";
import type { ClaudeSetupFacts, McpFact, PluginFact, ProjectFact, SkillFact } from "../../src/scan/types.ts";

export const HOME = "/home/u/.claude";

/** 내용이 있는 지침 파일 하나 */
```

`test/helpers/facts.ts`(바꾼 뒤 1/2):

```ts
// 시험에서 셋팅 사실을 손으로 짓는 도구. 적지 않은 것은 "다 읽었고 아무것도 없다"의 값이다
import { emptyInstructionSet, type InstructionFile, type InstructionSet } from "../../src/scan/instructions.ts";
import type { CodexSafetyFact } from "../../src/scan/codex-settings.ts";
import type { ClaudeSetupFacts, CodexPluginFact, CodexProjectFact, CodexSetupFacts, McpFact, PluginFact, ProjectFact, SkillFact } from "../../src/scan/types.ts";

export const HOME = "/home/u/.claude";

/** 내용이 있는 지침 파일 하나 */
```

`test/helpers/facts.ts`(찾을 곳 2/2):

```ts
    unreadableSkillPlaces: { user: false, projects: [], plugins: [] },
    ...input,
  };
}
```

`test/helpers/facts.ts`(바꾼 뒤 2/2):

```ts
    unreadableSkillPlaces: { user: false, projects: [], plugins: [] },
    ...input,
  };
}

export const CODEX_HOME = "/home/u/.codex";

/** 승인과 샌드박스를 적지 않은 맥락(Codex의 기본, 묻는 승인과 샌드박스) */
export function codexSafety(input: Partial<CodexSafetyFact> = {}): CodexSafetyFact {
  return { approval: null, sandbox: null, permissions: null, fullAccess: false, ...input };
}

/** 신뢰한 Codex 프로젝트. 설정 파일이 없고 지침이 없으며 그 맥락의 승인과 샌드박스는 기본이다 */
export function codexProject(normRoot: string, input: Partial<CodexProjectFact> = {}): CodexProjectFact {
  return { normRoot, scanned: true, trust: "trusted", configStatus: "missing", instructions: emptyInstructionSet(), safety: codexSafety(), ...input };
}

/** 설정에서 켜 두었고 Codex가 싣는 플러그인. 구성을 알고 MCP 정의를 읽었다 */
export function codexPlugin(id: string, input: Partial<CodexPluginFact> = {}): CodexPluginFact {
  return { id, configured: true, enabled: true, idValid: true, install: "ok", manifest: "ok", namespace: id.split("@")[0] ?? id, compositionKnown: true, mcpUnreadable: false, skills: [], ...input };
}

/** Codex의 셋팅 사실. 모든 파일을 읽었고 설치, 프로젝트, 지침이 하나도 없으며 전역 맥락은 기본이다 */
export function codexFacts(input: Partial<CodexSetupFacts> = {}): CodexSetupFacts {
  return {
    tool: "codex",
    home: CODEX_HOME,
    config: "ok",
    globalInstructions: emptyInstructionSet(),
    globalMentions: {},
    safety: codexSafety(),
    skills: [],
    mcpServers: [],
    plugins: [],
    projects: [],
    problems: [],
    unreadableDirs: [],
    unreadableSkillPlaces: { user: false, projects: [], plugins: [] },
    ...input,
  };
}
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/copy-rules.test.ts test/core/evaluate.test.ts test/core/installs-candidates.test.ts test/core/installs-servers.test.ts test/core/metrics-fit.test.ts test/core/metrics-setup.test.ts test/core/metrics-usage.test.ts test/core/result-hints.test.ts test/core/result-notices-setup.test.ts`
Expected: FAIL. 바뀐 시험 파일 아홉이 실패한다. Codex의 셋팅 사실을 도구마다 가르는 판정이 없어(Codex 도구의 셋팅에서 Claude Code의 칸을 읽다 멈추는 것도 든다) Codex의 S2·S5·F3~F6·E6과 두 도구 평가의 시험이 실패하고, `usageRules`와 `mergedFitRules`가 새 인자를 받지 않으며, S2의 근거와 그 문구에 `unreadTools`가 없다.

- [ ] **Step 3: 구현한다**

`src/core/copy/rules-setup.ts`(찾을 곳 1/2):

```ts
      evidence: "Tools with a safeguard {guarded} · tools in use {tools}",
```

`src/core/copy/rules-setup.ts`(바꾼 뒤 1/2):

```ts
      evidence: "Tools with a safeguard {guarded} · tools measured {tools} · tools left out with unreadable settings {unreadTools}",
```

`src/core/copy/rules-setup.ts`(찾을 곳 2/2):

```ts
      evidence: "안전장치가 있는 도구 {guarded} · 쓰는 도구 {tools}",
```

`src/core/copy/rules-setup.ts`(바꾼 뒤 2/2):

```ts
      evidence: "안전장치가 있는 도구 {guarded} · 잰 도구 {tools} · 설정을 읽지 못해 뺀 도구 {unreadTools}",
```

`src/core/evaluate.ts`(찾을 곳 1/6):

```ts
import type { SessionSummary, ToolCoverage, ToolId } from "../adapters/types.ts";
import type { ClaudeSetupFacts, ProjectFact } from "../scan/types.ts";
import type { InstallRecord } from "../state/state.ts";
```

`src/core/evaluate.ts`(바꾼 뒤 1/6):

```ts
import type { SessionSummary, ToolCoverage, ToolId } from "../adapters/types.ts";
import type { ClaudeSetupFacts, CodexSetupFacts, ProjectFact } from "../scan/types.ts";
import type { InstallRecord } from "../state/state.ts";
```

`src/core/evaluate.ts`(찾을 곳 2/6):

```ts

/** 도구 하나의 입력. 어댑터와 스캐너가 낸 것이다 */
export interface ToolInput {
  tool: ToolId;
  /** 날짜별 세션 요약(주 세션과 하위 세션) */
```

`src/core/evaluate.ts`(바꾼 뒤 2/6):

```ts

interface ToolInputCommon {
  /** 날짜별 세션 요약(주 세션과 하위 세션) */
```

`src/core/evaluate.ts`(찾을 곳 3/6):

```ts
  complete: { skills: boolean; mcp: boolean };
  setup: ClaudeSetupFacts;
}

/** 입력 묶음(설계 12.1). 평가 시계와 경로의 정규화처럼 순수하지 않은 것은 조립하는 쪽이 미리 해서 넣는다 */
```

`src/core/evaluate.ts`(바꾼 뒤 3/6):

```ts
  complete: { skills: boolean; mcp: boolean };
}

/** 도구 하나의 입력. 어댑터와 스캐너가 낸 것이다. 셋팅 사실의 꼴은 도구마다 다르다(설계 「5단계 3부 계획 전 결정」 4번) */
export type ToolInput = ToolInputCommon & ({ tool: "claude-code"; setup: ClaudeSetupFacts } | { tool: "codex"; setup: CodexSetupFacts });

/** 입력 묶음(설계 12.1). 평가 시계와 경로의 정규화처럼 순수하지 않은 것은 조립하는 쪽이 미리 해서 넣는다 */
```

`src/core/evaluate.ts`(찾을 곳 4/6):

```ts
  const scored = all.filter((tool) => tool.totals.responses > 0);
  const setups = scored.map((tool): ToolSetup => ({ tool: tool.input.tool, totals: tool.totals, coverage: tool.input.coverage, setup: tool.input.setup, highestVersion: highestMainVersion(tool.input.summaries) }));
  const usage = projectUsage(setups, lookup);
```

`src/core/evaluate.ts`(바꾼 뒤 4/6):

```ts
  const scored = all.filter((tool) => tool.totals.responses > 0);
  const setups = scored.map(({ input: tool, totals }): ToolSetup => {
    const common = { totals, coverage: tool.coverage, highestVersion: highestMainVersion(tool.summaries) };
    return tool.tool === "codex" ? { ...common, tool: "codex", setup: tool.setup } : { ...common, tool: "claude-code", setup: tool.setup };
  });
  const usage = projectUsage(setups, lookup);
```

`src/core/evaluate.ts`(찾을 곳 5/6):

```ts
      responses: setup.totals.responses,
      rules: { ...usageRules(setup.totals, setup.coverage), ...setupToolRules(setup), ...fitToolRules(setup), E5: skills.measurement, E6: servers.measurement },
      candidates,
```

`src/core/evaluate.ts`(바꾼 뒤 5/6):

```ts
      responses: setup.totals.responses,
      rules: { ...usageRules(setup.totals, setup.coverage, setup.tool), ...setupToolRules(setup), ...fitToolRules(setup), E5: skills.measurement, E6: servers.measurement },
      candidates,
```

`src/core/evaluate.ts`(찾을 곳 6/6):

```ts
  const { S1, S2, S3, safeguards, setupProblems } = mergedSetupRules(setups);
  const { F3, F4, F6, missingInstructions, worstOverlap } = mergedFitRules(setups, usage);
  const board = scoreboard({ merged: { S1, S2, S3, F3, F4, F6, ...intensityRules(setups, usage) }, tools: judged.map((tool) => tool.measured) });
```

`src/core/evaluate.ts`(바꾼 뒤 6/6):

```ts
  const { S1, S2, S3, safeguards, setupProblems } = mergedSetupRules(setups);
  const { F3, F4, F6, missingInstructions, worstOverlap } = mergedFitRules(setups, usage, input.projects);
  const board = scoreboard({ merged: { S1, S2, S3, F3, F4, F6, ...intensityRules(setups, usage) }, tools: judged.map((tool) => tool.measured) });
```

`src/core/installs/candidates.ts`(찾을 곳):

```ts
export function candidatesOf(tool: ToolSetup, skills: SkillJudgement, servers: ServerJudgement, day: EvalDay, self: SelfIdentity): Candidate[] {
  const { setup } = tool;
```

`src/core/installs/candidates.ts`(바꾼 뒤):

```ts
export function candidatesOf(tool: ToolSetup, skills: SkillJudgement, servers: ServerJudgement, day: EvalDay, self: SelfIdentity): Candidate[] {
  // Codex 설치의 정비는 6단계가 그 조건을 정할 때까지 내지 않는다(설계 「5단계 3부 계획 전 결정」 11번)
  if (tool.tool === "codex") return [];
  const { setup } = tool;
```

`src/core/installs/servers.ts`(찾을 곳 1/2):

```ts
import { byContent } from "../order.ts";
import { enablementUnread, unread } from "../readability.ts";
import { BLANK_INSTALL_EVIDENCE, measureInstalls, type Counted } from "./gate.ts";
```

`src/core/installs/servers.ts`(바꾼 뒤 1/2):

```ts
import { byContent } from "../order.ts";
import { codexSettingsUnread, enablementUnread, unread } from "../readability.ts";
import { BLANK_INSTALL_EVIDENCE, measureInstalls, type Counted } from "./gate.ts";
```

`src/core/installs/servers.ts`(찾을 곳 2/2):

```ts
function serversUnread(tool: ToolSetup): boolean {
  const { setup } = tool;
```

`src/core/installs/servers.ts`(바꾼 뒤 2/2):

```ts
function serversUnread(tool: ToolSetup): boolean {
  // Codex는 사용자 config.toml과 신뢰한 프로젝트의 .codex/config.toml이 서버와 켜짐을 정한다. 플러그인의 것은 그 서버만 세지 않는다(설계 「5단계 2부 계획 전 결정」 7번)
  if (tool.tool === "codex") return codexSettingsUnread(tool.setup);
  const { setup } = tool;
```

`src/core/installs/skills.ts`(찾을 곳 1/3):

```ts
import { blank, unmeasured, type Measurement } from "../measure.ts";
import type { ToolSetup } from "../metrics/setup.ts";
import { byContent } from "../order.ts";
```

`src/core/installs/skills.ts`(바꾼 뒤 1/3):

```ts
import { blank, unmeasured, type Measurement } from "../measure.ts";
import type { ClaudeToolSetup, ToolSetup } from "../metrics/setup.ts";
import { byContent } from "../order.ts";
```

`src/core/installs/skills.ts`(찾을 곳 2/3):

```ts
/** 설치를 찾는 곳, 설정 파일, 도구의 집계 가운데 읽지 못한 것이 있다. 집계가 든 파일은 없을 때도 모르는 것이다(설계 11.3 「설치를 찾는 곳을 읽지 못했을 때」) */
function skillsUnread(tool: ToolSetup): boolean {
  const { setup } = tool;
```

`src/core/installs/skills.ts`(바꾼 뒤 2/3):

```ts
/** 설치를 찾는 곳, 설정 파일, 도구의 집계 가운데 읽지 못한 것이 있다. 집계가 든 파일은 없을 때도 모르는 것이다(설계 11.3 「설치를 찾는 곳을 읽지 못했을 때」) */
function skillsUnread(tool: ClaudeToolSetup): boolean {
  const { setup } = tool;
```

`src/core/installs/skills.ts`(찾을 곳 3/3):

```ts
export function judgeSkills(tool: ToolSetup, context: VerdictContext): SkillJudgement {
  const { setup } = tool;
  if (tool.coverage.skillUsage === "unsupported") return { measurement: unmeasured("unsupported", blank(BLANK_INSTALL_EVIDENCE)), bundles: [] };
  // 대상을 모르면 분모가 몇인지도 따질 수 없다. 판정하지 않으므로 안 쓴 것이 확인됨도 정비 후보도 나오지 않는다
```

`src/core/installs/skills.ts`(바꾼 뒤 3/3):

```ts
export function judgeSkills(tool: ToolSetup, context: VerdictContext): SkillJudgement {
  // Codex는 스킬 사용을 기록하지 않는다. 판정하지 않아 판정한 스킬 묶음에도 들지 않는다(설계 「5단계 3부 계획 전 결정」 10번)
  if (tool.coverage.skillUsage === "unsupported" || tool.tool === "codex") return { measurement: unmeasured("unsupported", blank(BLANK_INSTALL_EVIDENCE)), bundles: [] };
  const { setup } = tool;
  // 대상을 모르면 분모가 몇인지도 따질 수 없다. 판정하지 않으므로 안 쓴 것이 확인됨도 정비 후보도 나오지 않는다
```

`src/core/metrics/fit.ts`(찾을 곳 1/10):

```ts
const scanned = (project: ProjectFact): boolean => project.exists && !project.excluded;
const scannedProjects = (tool: ToolSetup): ProjectFact[] => tool.setup.projects.filter(scanned).sort((a, b) => byText(a.normRoot, b.normRoot));
const projectIn = (tool: ToolSetup | undefined, normRoot: string): ProjectFact | undefined => tool?.setup.projects.find((project) => project.normRoot === normRoot);

```

`src/core/metrics/fit.ts`(바꾼 뒤 1/10):

```ts
const scanned = (project: ProjectFact): boolean => project.exists && !project.excluded;

/** 도구가 프로젝트 하나에서 본 것. 스캐너가 셋팅을 읽은 프로젝트만 든다 */
interface ToolProject {
  normRoot: string;
  /** 프로젝트 폴더의 이름. Codex의 프로젝트 사실에는 없어 프로젝트 목록에서 얻는다 */
  name: string | null;
  /** 그 도구가 읽는 프로젝트 지침 */
  instructions: InstructionSet;
  /** 깃 저장소가 아니어도 그 도구의 지침 파일이나 프로젝트 쪽 설정이 이미 있어 프로젝트로 다루는 폴더다 */
  treated: boolean;
}

/**
 * 도구의 프로젝트 사실을 같은 꼴로 본다. Codex는 Codex가 읽는 프로젝트 지침(신뢰하지 않은 프로젝트와 한도가 0인 프로젝트에는 없다)이고,
 * 프로젝트 쪽 설정은 신뢰한 프로젝트의 .codex/config.toml이 있는 것이다(설계 「5단계 3부 계획 전 결정」 7번)
 */
function toolProjects(tool: ToolSetup): ToolProject[] {
  const projects: ToolProject[] =
    tool.tool === "codex"
      ? tool.setup.projects
          .filter((project) => project.scanned)
          .map((project) => ({ normRoot: project.normRoot, name: null, instructions: project.instructions, treated: hasInstructionFiles(project.instructions) || (project.configStatus !== null && project.configStatus !== "missing") }))
      : tool.setup.projects
          .filter(scanned)
          .map((project) => ({ normRoot: project.normRoot, name: project.name, instructions: project.instructions, treated: hasInstructionFiles(project.instructions) || project.hasSettings || project.hasLocalSettings }));
  return projects.sort((a, b) => byText(a.normRoot, b.normRoot));
}

```

`src/core/metrics/fit.ts`(찾을 곳 2/10):

```ts

const hasInstructionFiles = (set: InstructionSet): boolean => set.files.length > 0 || set.unreadable.length > 0 || set.unreadableDirs.length > 0;
/** 깃 저장소가 아니어도 프로젝트 지침이나 프로젝트 쪽 설정이 이미 있는 폴더는 프로젝트로 다루는 폴더다 */
const treatedAsProject = (project: ProjectFact | undefined): boolean => project !== undefined && (hasInstructionFiles(project.instructions) || project.hasSettings || project.hasLocalSettings);
/** 내용이 있는 지침 파일이 하나라도 있다. 빈 파일과 읽지 못한 파일은 세지 않는다 */
const hasInstructions = (project: ProjectFact | undefined): boolean => project?.instructions.files.some((file) => file.hasContent) ?? false;

```

`src/core/metrics/fit.ts`(바꾼 뒤 2/10):

```ts

function hasInstructionFiles(set: InstructionSet): boolean {
  return set.files.length > 0 || set.unreadable.length > 0 || set.unreadableDirs.length > 0;
}
/** 깃 저장소가 아니어도 프로젝트 지침이나 프로젝트 쪽 설정이 이미 있는 폴더는 프로젝트로 다루는 폴더다 */
const treatedAsProject = (project: ProjectFact): boolean => hasInstructionFiles(project.instructions) || project.hasSettings || project.hasLocalSettings;
/** 내용이 있는 지침 파일이 하나라도 있다. 빈 파일과 읽지 못한 파일은 세지 않는다 */
const hasInstructions = (project: ToolProject | undefined): boolean => project?.instructions.files.some((file) => file.hasContent) ?? false;

```

`src/core/metrics/fit.ts`(찾을 곳 3/10):

```ts
function f3(tools: readonly ToolSetup[], usage: ProjectUsage): { measurement: Measurement; missing: MissingInstructions[] } {
  const byId = new Map<string, ToolSetup>(tools.map((tool) => [tool.tool, tool]));
  const missing: MissingInstructions[] = [];
```

`src/core/metrics/fit.ts`(바꾼 뒤 3/10):

```ts
function f3(tools: readonly ToolSetup[], usage: ProjectUsage): { measurement: Measurement; missing: MissingInstructions[] } {
  const byId = new Map<string, Map<string, ToolProject>>(tools.map((tool) => [tool.tool, new Map(toolProjects(tool).map((project) => [project.normRoot, project]))]));
  const missing: MissingInstructions[] = [];
```

`src/core/metrics/fit.ts`(찾을 곳 4/10):

```ts
    if (use.total < FREQUENT_SESSIONS || !scanned(project)) continue;
    if (project.kind !== "git" && !treatedAsProject(project) && !tools.some((tool) => treatedAsProject(projectIn(tool, project.normRoot)))) continue;
    targets++;
    const without = mainTools(use).filter((tool) => !hasInstructions(projectIn(byId.get(tool), project.normRoot)));
    if (without.length > 0) missing.push({ normRoot: project.normRoot, name: project.name, tools: without });
```

`src/core/metrics/fit.ts`(바꾼 뒤 4/10):

```ts
    if (use.total < FREQUENT_SESSIONS || !scanned(project)) continue;
    if (project.kind !== "git" && !treatedAsProject(project) && ![...byId.values()].some((projects) => projects.get(project.normRoot)?.treated === true)) continue;
    targets++;
    const without = mainTools(use).filter((tool) => !hasInstructions(byId.get(tool)?.get(project.normRoot)));
    if (without.length > 0) missing.push({ normRoot: project.normRoot, name: project.name, tools: without });
```

`src/core/metrics/fit.ts`(찾을 곳 5/10):

```ts

function f4(tools: readonly ToolSetup[]): { measurement: Measurement; worst: WorstOverlap | null } {
  let unreadable = false;
```

`src/core/metrics/fit.ts`(바꾼 뒤 5/10):

```ts

function f4(tools: readonly ToolSetup[], names: ReadonlyMap<string, string>): { measurement: Measurement; worst: WorstOverlap | null } {
  let unreadable = false;
```

`src/core/metrics/fit.ts`(찾을 곳 6/10):

```ts
    const global = tool.setup.globalInstructions;
    const projects = scannedProjects(tool);
    if (instructionsUnread(global) || projects.some((project) => instructionsUnread(project.instructions))) unreadable = true;
```

`src/core/metrics/fit.ts`(바꾼 뒤 6/10):

```ts
    const global = tool.setup.globalInstructions;
    const projects = toolProjects(tool);
    if (instructionsUnread(global) || projects.some((project) => instructionsUnread(project.instructions))) unreadable = true;
```

`src/core/metrics/fit.ts`(찾을 곳 7/10):

```ts
    for (const project of projects) {
      // 프로젝트 지침이 없거나 전역 지침과 같은 파일뿐이면 견주지 않는다
      if (!project.instructions.files.some((file) => !file.sameAsGlobal)) continue;
```

`src/core/metrics/fit.ts`(바꾼 뒤 7/10):

```ts
    for (const project of projects) {
      // 프로젝트 지침이 없거나 전역 지침과 같은 파일뿐이면 견주지 않는다. Codex의 프로젝트 지침에는 같은 파일 표시가 없어 같은 파일도 견준다(설계 「5단계 2부 계획 전 결정」 5번)
      if (!project.instructions.files.some((file) => !file.sameAsGlobal)) continue;
```

`src/core/metrics/fit.ts`(찾을 곳 8/10):

```ts
      const overlapping = new Set(project.instructions.lineHashes.filter((hash) => lines.has(hash))).size;
      if (worst === null || overlapping * worst.globalLines > worst.overlapping * lines.size) worst = { tool: tool.tool, normRoot: project.normRoot, name: project.name, overlapping, globalLines: lines.size };
    }
```

`src/core/metrics/fit.ts`(바꾼 뒤 8/10):

```ts
      const overlapping = new Set(project.instructions.lineHashes.filter((hash) => lines.has(hash))).size;
      const name = project.name ?? names.get(project.normRoot) ?? project.normRoot;
      if (worst === null || overlapping * worst.globalLines > worst.overlapping * lines.size) worst = { tool: tool.tool, normRoot: project.normRoot, name, overlapping, globalLines: lines.size };
    }
```

`src/core/metrics/fit.ts`(찾을 곳 9/10):

```ts
  for (const tool of tools) {
    // 전역 쪽은 사용자 설정만이다. 관리 정책 파일은 처음부터 견주지 않는다
    if (unread(tool.setup.settings.user) || projectSettingsUnread(tool.setup)) unreadable = true;
    for (const project of scannedProjects(tool)) {
      if (!project.hasSettings && !project.hasLocalSettings) continue;
```

`src/core/metrics/fit.ts`(바꾼 뒤 9/10):

```ts
  for (const tool of tools) {
    // Codex는 견줄 권한 규칙이 없어 Claude Code만 센다(설계 「5단계 계획 전 결정」 5번)
    if (tool.tool !== "claude-code") continue;
    // 전역 쪽은 사용자 설정만이다. 관리 정책 파일은 처음부터 견주지 않는다
    if (unread(tool.setup.settings.user) || projectSettingsUnread(tool.setup)) unreadable = true;
    for (const project of tool.setup.projects.filter(scanned)) {
      if (!project.hasSettings && !project.hasLocalSettings) continue;
```

`src/core/metrics/fit.ts`(찾을 곳 10/10):

```ts

/** 도구를 합쳐서 재는 상황 적합 규칙. tools는 점수에 넣는 도구이고 usage는 같은 도구들로 만든 것이다. */
export function mergedFitRules(tools: readonly ToolSetup[], usage: ProjectUsage): Record<"F3" | "F4" | "F6", Measurement> & { missingInstructions: MissingInstructions[]; worstOverlap: WorstOverlap | null } {
  const guides = f3(tools, usage);
  const overlap = f4(tools);
  return { F3: guides.measurement, F4: overlap.measurement, F6: f6(tools), missingInstructions: guides.missing, worstOverlap: overlap.worst };
```

`src/core/metrics/fit.ts`(바꾼 뒤 10/10):

```ts

/** 도구를 합쳐서 재는 상황 적합 규칙. tools는 점수에 넣는 도구이고 usage는 같은 도구들로 만든 것이다. projects는 입력 묶음의 프로젝트 목록이다(Codex 프로젝트의 이름을 얻는다) */
export function mergedFitRules(
  tools: readonly ToolSetup[],
  usage: ProjectUsage,
  projects: readonly ProjectFact[],
): Record<"F3" | "F4" | "F6", Measurement> & { missingInstructions: MissingInstructions[]; worstOverlap: WorstOverlap | null } {
  const guides = f3(tools, usage);
  const overlap = f4(tools, new Map(projects.map((project) => [project.normRoot, project.name])));
  return { F3: guides.measurement, F4: overlap.measurement, F6: f6(tools), missingInstructions: guides.missing, worstOverlap: overlap.worst };
```

`src/core/metrics/setup.ts`(찾을 곳 1/8):

```ts
import type { ShellGuard } from "../../scan/hooks.ts";
import type { ClaudeHooksFacts, ClaudeSetupFacts, SetupProblem } from "../../scan/types.ts";
import { blank, countGate, scored, unmeasured, type Measurement } from "../measure.ts";
import { sameInstall } from "../installs/same.ts";
import { enablementUnread, globalSettingsUnread, mcpPlacesUnread, projectSettingsUnread } from "../readability.ts";
import type { ToolUsage } from "../totals.ts";

/** 점수에 넣는 도구 하나의 구간 합계, 관측 범위, 셋팅 사실 */
export interface ToolSetup extends ToolUsage {
  setup: ClaudeSetupFacts;
  /** 읽은 주 세션의 버전 가운데 가장 높은 것(highestMainVersion). 버전을 아는 주 세션이 없으면 null */
```

`src/core/metrics/setup.ts`(바꾼 뒤 1/8):

```ts
import type { ShellGuard } from "../../scan/hooks.ts";
import type { ClaudeHooksFacts, ClaudeSetupFacts, CodexSetupFacts, SetupProblem } from "../../scan/types.ts";
import { blank, countGate, scored, unmeasured, type Measurement } from "../measure.ts";
import { sameInstall } from "../installs/same.ts";
import { codexSettingsUnread, enablementUnread, globalSettingsUnread, mcpPlacesUnread, projectSettingsUnread } from "../readability.ts";
import type { ToolUsage } from "../totals.ts";

interface ToolSetupCommon extends Omit<ToolUsage, "tool"> {
  /** 읽은 주 세션의 버전 가운데 가장 높은 것(highestMainVersion). 버전을 아는 주 세션이 없으면 null */
```

`src/core/metrics/setup.ts`(찾을 곳 2/8):

```ts

/** 전역 지침 파일들의 크기를 합쳐 이만큼이면 전역 지침이 있는 것이다(설계 11.3 S1) */
```

`src/core/metrics/setup.ts`(바꾼 뒤 2/8):

```ts

/** 점수에 넣는 도구 하나의 구간 합계, 관측 범위, 셋팅 사실. 셋팅 사실의 꼴은 도구마다 다르다(설계 「5단계 3부 계획 전 결정」 4번) */
export type ToolSetup = ToolSetupCommon & ({ tool: "claude-code"; setup: ClaudeSetupFacts } | { tool: "codex"; setup: CodexSetupFacts });
export type ClaudeToolSetup = Extract<ToolSetup, { tool: "claude-code" }>;

/** 전역 지침 파일들의 크기를 합쳐 이만큼이면 전역 지침이 있는 것이다(설계 11.3 S1) */
```

`src/core/metrics/setup.ts`(찾을 곳 3/8):

```ts
  tool: ToolId;
  /** ㉠ 셸 명령을 덮는 도구 실행 전 확인 훅이 있고 꺼져 있지 않다 */
  guardHook: boolean | null;
  /** ㉡ 기본 모드가 권한 우회가 아니다(도구의 권한 확인이 돈다) */
  permissionChecks: boolean | null;
```

`src/core/metrics/setup.ts`(바꾼 뒤 3/8):

```ts
  tool: ToolId;
  /** ㉠ 셸 명령을 덮는 도구 실행 전 확인 훅이 있고 꺼져 있지 않다. Codex는 훅을 안전장치로 치지 않아 늘 거짓이다(설계 11.3) */
  guardHook: boolean | null;
  /** ㉡ 기본 모드가 권한 우회가 아니다(도구의 권한 확인이 돈다). Codex는 승인 없음과 전면 해제를 함께 쓰는 맥락이 없다는 것이다 */
  permissionChecks: boolean | null;
```

`src/core/metrics/setup.ts`(찾을 곳 4/8):

```ts

function safeguardOf(tool: ToolSetup): ToolSafeguard {
  const { setup } = tool;
```

`src/core/metrics/setup.ts`(바꾼 뒤 4/8):

```ts

/**
 * Codex의 안전장치. 맥락(전역, 신뢰한 프로젝트마다) 가운데 승인 없음과 전면 해제를 함께 쓰는 것이 하나도 없으면 안전장치가 있다.
 * 신뢰한 프로젝트의 맥락은 그 설정을 읽은 것만 승인과 샌드박스가 있다(설계 「5단계 2부 계획 전 결정」 4번, 「5단계 3부 계획 전 결정」 5번)
 */
function codexSafeguard(setup: CodexSetupFacts): ToolSafeguard {
  if (codexSettingsUnread(setup)) return { tool: "codex", guardHook: null, permissionChecks: null };
  const contexts = [setup.safety, ...setup.projects.flatMap((project) => (project.trust === "trusted" && project.safety !== null ? [project.safety] : []))];
  const unsafe = contexts.some((context) => context.approval === "never" && context.fullAccess);
  return { tool: "codex", guardHook: false, permissionChecks: !unsafe };
}

function safeguardOf(tool: ToolSetup): ToolSafeguard {
  if (tool.tool === "codex") return codexSafeguard(tool.setup);
  const { setup } = tool;
```

`src/core/metrics/setup.ts`(찾을 곳 5/8):

```ts

function s2(tools: readonly ToolSetup[], safeguards: readonly ToolSafeguard[]): Measurement {
  // 한 도구라도 설정을 읽지 못했으면 규칙을 재지 않는다. 읽은 도구만으로 재면 읽지 못한 도구의 몫이 빠진다
  if (safeguards.some((safeguard) => safeguard.guardHook === null)) return unmeasured("unreadable", { guarded: null, tools: tools.length });
  const guarded = safeguards.filter((safeguard) => safeguard.guardHook === true || safeguard.permissionChecks === true).length;
  const evidence = { guarded, tools: tools.length };
  return countGate(true, tools.length, 1, evidence) ?? scored(guarded / tools.length, evidence);
}
```

`src/core/metrics/setup.ts`(바꾼 뒤 5/8):

```ts

function s2(safeguards: readonly ToolSafeguard[]): Measurement {
  // 안전장치를 정하는 설정을 읽지 못한 도구만 분자와 분모에서 빼고 남은 도구로 잰다. 남은 도구가 없으면 못 잰다(설계 「5단계 계획 전 결정」 4번)
  const readable = safeguards.filter((safeguard) => safeguard.permissionChecks !== null);
  const unreadTools = safeguards.length - readable.length;
  if (readable.length === 0 && unreadTools > 0) return unmeasured("unreadable", { guarded: null, tools: 0, unreadTools });
  const guarded = readable.filter((safeguard) => safeguard.guardHook === true || safeguard.permissionChecks === true).length;
  const evidence = { guarded, tools: readable.length, unreadTools };
  return countGate(true, readable.length, 1, evidence) ?? scored(guarded / readable.length, evidence);
}
```

`src/core/metrics/setup.ts`(찾을 곳 6/8):

```ts
function s5(tool: ToolSetup): Measurement {
  const { setup, totals } = tool;
  // 정체가 같은 서버 사실은 설치 하나로 센다(E6과 같다)
  const enabledServers = sameInstall(setup.mcpServers.filter((server) => server.enabled), (server) => server.installKey).length;
  const failedSessions = totals.mainSessions.filter((session) => session.mcpConnectionFailure).length;
```

`src/core/metrics/setup.ts`(바꾼 뒤 6/8):

```ts
function s5(tool: ToolSetup): Measurement {
  const { totals } = tool;
  // 정체가 같은 서버 사실은 설치 하나로 센다(E6과 같다)
  const enabledServers = sameInstall(tool.setup.mcpServers.filter((server) => server.enabled), (server) => server.installKey).length;
  const failedSessions = totals.mainSessions.filter((session) => session.mcpConnectionFailure).length;
```

`src/core/metrics/setup.ts`(찾을 곳 7/8):

```ts
  if (tool.coverage.mcpFailuresAndHooks === "unsupported") return unmeasured("unsupported", blank(evidence));
  // 켜짐을 정하는 설정을 읽지 못한 점검에서는 막아 둔 서버가 켜져 있는 것으로 보인다. 보이는 켜진 서버를 믿을 수 없다
  if (enablementUnread(setup)) return unmeasured("unreadable", { ...evidence, enabledServers: null });
  // 재는지는 지금의 셋팅으로 정한다. 켜져 있는 서버가 없으면 지난 연결 실패가 있어도 재지 않는다. 없다는 것은 다 읽었을 때만 말한다
  if (enabledServers === 0) return mcpPlacesUnread(setup) ? unmeasured("unreadable", { ...evidence, enabledServers: null }) : unmeasured("not_applicable", evidence);
  return countGate(true, totals.mainSessions.length, 1, evidence) ?? scored(failedSessions / totals.mainSessions.length, evidence);
```

`src/core/metrics/setup.ts`(바꾼 뒤 7/8):

```ts
  if (tool.coverage.mcpFailuresAndHooks === "unsupported") return unmeasured("unsupported", blank(evidence));
  // Codex는 켜짐과 서버를 정하는 설정이 같은 파일들이다(설계 「5단계 2부 계획 전 결정」 7번)
  const enablementUnknown = tool.tool === "codex" ? codexSettingsUnread(tool.setup) : enablementUnread(tool.setup);
  const placesUnknown = tool.tool === "codex" ? codexSettingsUnread(tool.setup) : mcpPlacesUnread(tool.setup);
  // 켜짐을 정하는 설정을 읽지 못한 점검에서는 막아 둔 서버가 켜져 있는 것으로 보인다. 보이는 켜진 서버를 믿을 수 없다
  if (enablementUnknown) return unmeasured("unreadable", { ...evidence, enabledServers: null });
  // 재는지는 지금의 셋팅으로 정한다. 켜져 있는 서버가 없으면 지난 연결 실패가 있어도 재지 않는다. 없다는 것은 다 읽었을 때만 말한다
  if (enabledServers === 0) return placesUnknown ? unmeasured("unreadable", { ...evidence, enabledServers: null }) : unmeasured("not_applicable", evidence);
  return countGate(true, totals.mainSessions.length, 1, evidence) ?? scored(failedSessions / totals.mainSessions.length, evidence);
```

`src/core/metrics/setup.ts`(찾을 곳 8/8):

```ts
  const setupProblems = countedProblems(tools);
  return { S1: s1(tools), S2: s2(tools, safeguards), S3: s3(setupProblems), safeguards, setupProblems };
}
```

`src/core/metrics/setup.ts`(바꾼 뒤 8/8):

```ts
  const setupProblems = countedProblems(tools);
  return { S1: s1(tools), S2: s2(safeguards), S3: s3(setupProblems), safeguards, setupProblems };
}
```

`src/core/metrics/usage.ts`(찾을 곳 1/5):

```ts
import type { CoverageKey, ToolCoverage } from "../../adapters/types.ts";
```

`src/core/metrics/usage.ts`(바꾼 뒤 1/5):

```ts
import type { CoverageKey, ToolCoverage, ToolId } from "../../adapters/types.ts";
```

`src/core/metrics/usage.ts`(찾을 곳 2/5):

```ts
function e1(totals: ToolTotals, coverage: ToolCoverage): Measurement {
```

`src/core/metrics/usage.ts`(바꾼 뒤 2/5):

```ts
function e1(totals: ToolTotals, coverage: ToolCoverage, tool: ToolId): Measurement {
```

`src/core/metrics/usage.ts`(찾을 곳 3/5):

```ts
  const all = input + cacheRead + cacheWrite;
```

`src/core/metrics/usage.ts`(바꾼 뒤 3/5):

```ts
  // Claude Code는 입력 칸에 캐시가 들지 않고, Codex는 입력 칸에 캐시가 든다(설계 11.3 「E1의 식」, 「5단계 3부 계획 전 결정」 6번)
  const all = tool === "codex" ? input : input + cacheRead + cacheWrite;
```

`src/core/metrics/usage.ts`(찾을 곳 4/5):

```ts
export function usageRules(totals: ToolTotals, coverage: ToolCoverage): Record<UsageRuleId, Measurement> {
```

`src/core/metrics/usage.ts`(바꾼 뒤 4/5):

```ts
export function usageRules(totals: ToolTotals, coverage: ToolCoverage, tool: ToolId): Record<UsageRuleId, Measurement> {
```

`src/core/metrics/usage.ts`(찾을 곳 5/5):

```ts
    E1: e1(totals, coverage),
```

`src/core/metrics/usage.ts`(바꾼 뒤 5/5):

```ts
    E1: e1(totals, coverage, tool),
```

`src/core/readability.ts`(찾을 곳 1/2):

```ts
// 셋팅 사실에서 "있는데 읽지 못한 것"을 가른다. 없는 파일과 폴더는 읽지 못한 것이 아니다(순수 함수, 설계 11.3, 11.4, 20.1)
import type { ClaudeSetupFacts, FileStatus } from "../scan/types.ts";

```

`src/core/readability.ts`(바꾼 뒤 1/2):

```ts
// 셋팅 사실에서 "있는데 읽지 못한 것"을 가른다. 없는 파일과 폴더는 읽지 못한 것이 아니다(순수 함수, 설계 11.3, 11.4, 20.1)
import type { ClaudeSetupFacts, CodexSetupFacts, FileStatus } from "../scan/types.ts";

```

`src/core/readability.ts`(찾을 곳 2/2):

```ts

/** 사용자 설정이나 관리 정책을 이룬 파일 가운데 읽지 못한 것이 있다 */
```

`src/core/readability.ts`(바꾼 뒤 2/2):

```ts

/**
 * Codex의 안전장치와 서버를 정하는 설정 파일 가운데 있는데 읽지 못한 것(풀리지 않는 것도)이 있다. 사용자 config.toml과 신뢰한 프로젝트의 .codex/config.toml이다.
 * 신뢰하지 않은 프로젝트의 것은 Codex가 쓰지 않으므로 읽지 않는다(설계 「5단계 2부 계획 전 결정」 2·4·7번, 「5단계 3부 계획 전 결정」 5·10번)
 */
export function codexSettingsUnread(facts: CodexSetupFacts): boolean {
  return unread(facts.config) || facts.projects.some((project) => project.trust === "trusted" && unread(project.configStatus));
}

/** 사용자 설정이나 관리 정책을 이룬 파일 가운데 읽지 못한 것이 있다 */
```

`src/core/result/hints.ts`(찾을 곳):

```ts
  for (const tool of [...input.tools].sort((a, b) => byText(a.tool, b.tool))) {
    const setup = tool.setup;
```

`src/core/result/hints.ts`(바꾼 뒤):

```ts
  for (const tool of [...input.tools].sort((a, b) => byText(a.tool, b.tool))) {
    // Codex의 정밀 점검 단서는 4부가 넣는다(설계 「5단계 3부 계획 전 결정」 13번)
    if (tool.tool !== "claude-code") continue;
    const setup = tool.setup;
```

`src/core/result/notices.ts`(찾을 곳):

```ts

  for (const tool of input.tools) {
    const id = tool.tool;
    const setup = tool.setup;
```

`src/core/result/notices.ts`(바꾼 뒤):

```ts

  for (const tool of input.tools) {
    // Codex의 셋팅 쪽 알림은 4부가 넣는다(설계 「5단계 3부 계획 전 결정」 13번)
    if (tool.tool !== "claude-code") continue;
    const id = tool.tool;
    const setup = tool.setup;
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/metrics-setup.test.ts test/core/metrics-fit.test.ts test/core/metrics-usage.test.ts test/core/evaluate.test.ts test/core/installs-servers.test.ts test/core/installs-candidates.test.ts test/core/result-notices-setup.test.ts test/core/result-hints.test.ts test/core/copy-rules.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 9개, 시험 308개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/copy-rules.test.ts test/core/evaluate.test.ts test/core/installs-candidates.test.ts test/core/installs-servers.test.ts test/core/metrics-fit.test.ts test/core/metrics-setup.test.ts test/core/metrics-usage.test.ts test/core/result-hints.test.ts test/core/result-notices-setup.test.ts test/helpers/evaluation.ts test/helpers/facts.ts src/core/copy/rules-setup.ts src/core/evaluate.ts src/core/installs/candidates.ts src/core/installs/servers.ts src/core/installs/skills.ts src/core/metrics/fit.ts src/core/metrics/setup.ts src/core/metrics/usage.ts src/core/readability.ts src/core/result/hints.ts src/core/result/notices.ts
git commit -m "feat: 평가 엔진의 규칙과 판정에 Codex를 넣음"
```

---

### Task 2: 입력 묶음과 관측 기록에 Codex

**Files:**
- Modify: `test/commands/checkup-input.test.ts`
- Modify: `test/core/result-notices-record.test.ts`
- Modify: `test/state/next-state.test.ts`
- Modify: `src/commands/checkup-input.ts`
- Modify: `src/commands/checkup.ts`
- Modify: `src/core/result/notices.ts`
- Modify: `src/state/next-state.ts`

**Interfaces:**
- Consumes: 과제 1의 `ToolInput`. 5단계 1부의 `collectCodex`, `CodexCollectResult`, `CodexReadStats`, `codexUnreadableCount`(`src/collect/codex.ts`), `CODEX_COVERAGE`, `codexMcpObservation`, `CODEX_SHELL_TOOLS`. 5단계 2부의 `scanCodexSetup`(`src/scan/codex.ts`), `codexInstallKeysOf`, `codexUnseenInUnreadablePlace`(`src/scan/identity.ts`).
- Produces: `CheckupInput`(`collected`와 `facts`가 도구마다 `{ claude, codex }`, `src/commands/checkup-input.ts`), `nextState(state, { claude, codex }, today, startedAt)`(`src/state/next-state.ts`). 4부가 Codex의 알림과 읽은 양에 쓴다.

설계 「5단계 3부 계획 전 결정」 2·3·12·13번이다.

- 입력 묶음(결정 2). Codex 기록은 Claude Code와 같은 시계, 캐시 폴더(그 아래 `codex`), 다시 읽기 옵션으로 모은다. 두 도구를 늘 넣는다. Codex의 관측 범위는 `CODEX_COVERAGE`, 셸 명령 도구는 `CODEX_SHELL_TOOLS`이고, 스킬의 관측은 늘 빠짐없지 않으며(까닭은 비워 두고 문장은 4부가 정한다) MCP는 `codexMcpObservation`이다.
- 프로젝트 목록(결정 3). 두 도구의 주 세션 가운데 수집 구간에 응답이 있는 것의 작업 폴더를 합쳐 두 스캐너에 같은 목록으로 준다. 정규화한 작업 폴더의 표도 두 도구의 것이다. claude.ai 연결의 이름은 Claude Code 기록에서만 얻는다.
- 결과에 싣는 Codex의 수집 결과(결정 13). 읽은 양은 Claude Code와 같은 칸만 싣는다(건너뛴 압축 파일과 일부만 읽은 파일은 4부). Codex는 이어받은 앞부분을 빼고 세므로 겹쳐 세는 응답이 없다(0). 기록 쪽 알림 가운데 읽지 못한 기록과 관측이 빠진 것의 Codex 몫은 4부가 넣는다(Codex 스킬의 관측은 늘 빠짐없지 않아 지금의 문장이 맞지 않는다). 확인한 범위 밖 버전의 알림은 두 도구에 같은 꼴로 낸다.
- 관측 기록(결정 12). 두 도구의 설치 열쇠를 함께 고치고, 읽지 못한 곳에 든 것인지는 열쇠의 도구 칸(`installKey`로 만든 목록의 둘째 칸)으로 도구를 가려 그 도구의 판정으로 본다. 실행 기록의 캐시를 쓴 파일 수는 두 도구의 것을 더한다.
- 시험은 임시 홈에 Codex 기록(`session_meta`와 `token_usage_record`)과 `config.toml`을 만든다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup-input.test.ts`(찾을 곳 1/12):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { gatherCheckupInput, type CheckupInputOptions } from "../../src/commands/checkup-input.ts";
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 1/12):

```ts
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { gatherCheckupInput, type CheckupInputOptions } from "../../src/commands/checkup-input.ts";
```

`test/commands/checkup-input.test.ts`(찾을 곳 2/12):

```ts
];
const options = (overrides: Partial<CheckupInputOptions> = {}): CheckupInputOptions => ({
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 2/12):

```ts
];
const CODEX_ID = "019a0000-0000-7000-8000-000000000001";
const codexLine = (type: string, payload: Record<string, unknown>): string => JSON.stringify({ timestamp: "2026-11-11T03:00:00Z", type, payload });
/** Codex 주 세션 하나. 응답 하나의 입력은 100이고 그 가운데 캐시 입력이 60이다 */
async function codexSession(cwd: string): Promise<void> {
  const dir = join(home, ".codex", "sessions", "2026", "11", "11");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "rollout-2026-11-11T12-00-00-" + CODEX_ID + ".jsonl");
  const usage = { input_tokens: 100, cached_input_tokens: 60, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: 101 };
  const lines = [codexLine("session_meta", { id: CODEX_ID, cwd, cli_version: "0.166.0", thread_source: "user" }), codexLine("token_usage_record", { response_id: "r1", usage, thread_token_usage: usage })];
  await writeFile(path, lines.join("\n") + "\n");
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
}
const options = (overrides: Partial<CheckupInputOptions> = {}): CheckupInputOptions => ({
```

`test/commands/checkup-input.test.ts`(찾을 곳 3/12):

```ts
    expect(input.clock).toEqual({ nowMs: NOW, timeZone: "Asia/Seoul" });
    expect(input.tools).toHaveLength(1);
    const tool = input.tools[0]!;
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 3/12):

```ts
    expect(input.clock).toEqual({ nowMs: NOW, timeZone: "Asia/Seoul" });
    expect(input.tools.map((tool) => tool.tool)).toEqual(["claude-code", "codex"]);
    const tool = input.tools[0]!;
```

`test/commands/checkup-input.test.ts`(찾을 곳 4/12):

```ts
    expect(tool.summaries.map((summary) => summary.sessionId).sort()).toEqual(["s1", "s2", "s3"]);
    expect(tool.setup).toBe(gathered.facts);
    expect(tool.setup.skills.map((skill) => skill.name)).toEqual(["review"]);
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 4/12):

```ts
    expect(tool.summaries.map((summary) => summary.sessionId).sort()).toEqual(["s1", "s2", "s3"]);
    expect(tool.setup).toBe(gathered.facts.claude);
    expect(tool.setup.skills.map((skill) => skill.name)).toEqual(["review"]);
```

`test/commands/checkup-input.test.ts`(찾을 곳 5/12):

```ts
    expect(input.self).toBe(self);
    expect(gathered.collected.summaries).toBe(tool.summaries);
  });
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 5/12):

```ts
    expect(input.self).toBe(self);
    expect(gathered.collected.claude.summaries).toBe(tool.summaries);
  });
```

`test/commands/checkup-input.test.ts`(찾을 곳 6/12):

```ts
    expect(input.projects).toBe(input.tools[0]!.setup.projects);
    expect(input.projects.map((project) => [project.normRoot, project.kind, project.cwds])).toEqual([[normalizePath(proj), "git", [normalizePath(proj), normalizePath(join(proj, "sub"))]]]);
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 6/12):

```ts
    expect(input.projects).toBe(input.tools[0]!.setup.projects);
    expect(input.tools[0]!.tool).toBe("claude-code");
    expect(input.projects.map((project) => [project.normRoot, project.kind, project.cwds])).toEqual([[normalizePath(proj), "git", [normalizePath(proj), normalizePath(join(proj, "sub"))]]]);
```

`test/commands/checkup-input.test.ts`(찾을 곳 7/12):

```ts
    const { facts } = await gatherCheckupInput(options());
    expect(facts.mcpServers.map((server) => [server.name, server.scope, server.installKey === null])).toEqual([["claude.ai Mail", "claude-ai", true], ["db", "user", false]]);
  });
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 7/12):

```ts
    const { facts } = await gatherCheckupInput(options());
    expect(facts.claude.mcpServers.map((server) => [server.name, server.scope, server.installKey === null])).toEqual([["claude.ai Mail", "claude-ai", true], ["db", "user", false]]);
  });
```

`test/commands/checkup-input.test.ts`(찾을 곳 8/12):

```ts
    const { input, collected } = await gatherCheckupInput(options());
    expect(collected.read.unreadableFiles).toHaveLength(1);
    expect(input.tools[0]!.complete).toEqual({ skills: false, mcp: false });
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 8/12):

```ts
    const { input, collected } = await gatherCheckupInput(options());
    expect(collected.claude.read.unreadableFiles).toHaveLength(1);
    expect(input.tools[0]!.complete).toEqual({ skills: false, mcp: false });
```

`test/commands/checkup-input.test.ts`(찾을 곳 9/12):

```ts
    const { input, collected } = await gatherCheckupInput(options({ homedir: join(root, "nobody") }));
    expect(collected.detected).toBe(false);
    expect(input.tools[0]!.summaries).toEqual([]);
    expect(evaluate(input).score).toMatchObject({ aq: null, grade: null });
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 9/12):

```ts
    const { input, collected } = await gatherCheckupInput(options({ homedir: join(root, "nobody") }));
    expect([collected.claude.detected, collected.codex.detected]).toEqual([false, false]);
    expect(input.tools.map((tool) => tool.summaries)).toEqual([[], []]);
    expect(evaluate(input).score).toMatchObject({ aq: null, grade: null });
```

`test/commands/checkup-input.test.ts`(찾을 곳 10/12):

```ts

describe("모은 입력으로 평가한 결과", () => {
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 10/12):

```ts

describe("gatherCheckupInput의 Codex(설계 「5단계 3부 계획 전 결정」 2·3·13번)", () => {
  beforeEach(async () => {
    await codexSession(other);
    await put(join(home, ".codex", "config.toml"), "[projects." + JSON.stringify(other) + "]\ntrust_level = \"trusted\"\n[mcp_servers.search]\ncommand = \"search-server\"\n");
  });

  it("Codex의 기록과 셋팅을 함께 넣는다. 관측 범위와 셸 명령 도구는 Codex의 것이고 스킬의 관측은 늘 빠짐없지 않다", async () => {
    const gathered = await gatherCheckupInput(options());
    const codex = gathered.input.tools[1]!;
    expect(codex).toMatchObject({ tool: "codex", coverage: CODEX_COVERAGE, shellTools: ["shell"], complete: { skills: false, mcp: true } });
    expect(codex.setup).toBe(gathered.facts.codex);
    expect(codex.summaries).toBe(gathered.collected.codex.summaries);
    expect(gathered.facts.codex.mcpServers.map((server) => server.name)).toEqual(["search"]);
  });

  it("결과에 싣는 Codex의 수집 결과는 Claude Code와 같은 칸이다. 겹쳐 세는 응답은 없다", async () => {
    const { tools } = await gatherCheckupInput(options());
    expect(tools.map((tool) => tool.tool)).toEqual(["claude-code", "codex"]);
    expect(tools[1]).toMatchObject({ detected: true, overlappingSessions: 0, observation: { skills: { complete: false, reasons: [] }, mcp: { complete: true, reasons: [] } } });
    expect(Object.keys(tools[1]!.read).sort()).toEqual(Object.keys(tools[0]!.read).sort());
    expect(tools[1]!.read).toMatchObject({ files: 1, unreadableFiles: [] });
  });

  it("프로젝트 목록은 두 도구의 주 세션의 작업 폴더로 만들고, 두 스캐너에 같은 목록을 준다", async () => {
    const { input, facts } = await gatherCheckupInput(options());
    const roots = [normalizePath(other), normalizePath(proj)].sort();
    expect(input.projects.map((project) => project.normRoot)).toEqual(roots);
    expect(input.normalizedCwds[other]).toBe(normalizePath(other));
    const trust = new Map(facts.codex.projects.filter((project) => project.scanned).map((project) => [project.normRoot, project.trust]));
    expect([trust.get(normalizePath(other)), trust.get(normalizePath(proj))]).toEqual(["trusted", null]);
  });

  it("Codex의 규칙을 그 도구의 기록과 셋팅으로 잰다", async () => {
    const result = evaluate((await gatherCheckupInput(options())).input);
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses])).toEqual([
      ["claude-code", true, 2],
      ["codex", true, 1],
    ]);
    const e1 = result.findings.find((f) => f.ruleId === "E1")!;
    expect(e1.tools.find((value) => value.tool === "codex")).toMatchObject({ status: "scored", value: 0.6 });
  });
});

describe("모은 입력으로 평가한 결과", () => {
```

`test/commands/checkup-input.test.ts`(찾을 곳 11/12):

```ts
    const finding = (id: string) => result.findings.find((f) => f.ruleId === id)!;
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses, tool.totals.humanRequests])).toEqual([["claude-code", true, 2, 3]]);
    expect(finding("E1")).toMatchObject({ status: "scored", value: 0.8 });
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 11/12):

```ts
    const finding = (id: string) => result.findings.find((f) => f.ruleId === id)!;
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses, tool.totals.humanRequests])).toEqual([
      ["claude-code", true, 2, 3],
      ["codex", false, 0, 0],
    ]);
    expect(finding("E1")).toMatchObject({ status: "scored", value: 0.8 });
```

`test/commands/checkup-input.test.ts`(찾을 곳 12/12):

```ts
      const gathered = await gatherCheckupInput(options(overrides));
      return { text: JSON.stringify(evaluate(gathered.input)), fromCache: gathered.collected.read.fromCache };
    };
```

`test/commands/checkup-input.test.ts`(바꾼 뒤 12/12):

```ts
      const gathered = await gatherCheckupInput(options(overrides));
      return { text: JSON.stringify(evaluate(gathered.input)), fromCache: gathered.collected.claude.read.fromCache };
    };
```

`test/core/result-notices-record.test.ts`(찾을 곳 1/2):

```ts
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/core/result-notices-record.test.ts`(바꾼 뒤 1/2):

```ts
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, codexTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

```

`test/core/result-notices-record.test.ts`(찾을 곳 2/2):

```ts
describe("기록 쪽 알림", () => {
  it("빠진 것이 없으면 알림이 없다", () => {
```

`test/core/result-notices-record.test.ts`(바꾼 뒤 2/2):

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

`test/state/next-state.test.ts`(찾을 곳 1/6):

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import { nextState, openState } from "../../src/state/next-state.ts";
import { newState, saveState, type StateFile } from "../../src/state/state.ts";
import { facts, HOME, mcpServer, skill } from "../helpers/facts.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";
```

`test/state/next-state.test.ts`(바꾼 뒤 1/6):

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexMcpInstallKey, codexSkillInstallKey, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { ClaudeSetupFacts, CodexSetupFacts } from "../../src/scan/types.ts";
import { nextState, openState } from "../../src/state/next-state.ts";
import { newState, saveState, type StateFile } from "../../src/state/state.ts";
import { CODEX_HOME, codexFacts, codexProject, facts, HOME, mcpServer, skill } from "../helpers/facts.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";
```

`test/state/next-state.test.ts`(찾을 곳 2/6):

```ts
  const started = "2026-11-13T09:00:00.000Z";

```

`test/state/next-state.test.ts`(바꾼 뒤 2/6):

```ts
  const started = "2026-11-13T09:00:00.000Z";
  /** Claude Code의 셋팅 사실로 고친다. Codex에는 아무것도 없다 */
  const next = (state: StateFile, claude: ClaudeSetupFacts, today: string, at: string, codex: CodexSetupFacts = codexFacts()) => nextState(state, { claude, codex }, today, at);

```

`test/state/next-state.test.ts`(찾을 곳 3/6):

```ts
    const state = newState();
    const next = nextState(state, facts(), "2026-11-13", started);
    expect(next.salt).toBe(state.salt);
    expect(next.lastCheckupAt).toBe(started);
    expect(next.installs).toEqual([]);
  });
```

`test/state/next-state.test.ts`(바꾼 뒤 3/6):

```ts
    const state = newState();
    const after = next(state, facts(), "2026-11-13", started);
    expect(after.salt).toBe(state.salt);
    expect(after.lastCheckupAt).toBe(started);
    expect(after.installs).toEqual([]);
  });
```

`test/state/next-state.test.ts`(찾을 곳 4/6):

```ts
  it("첫 점검에서 본 설치는 새로 나타난 것이 아니고, 다음 점검에서 처음 본 설치는 새로 나타난 것이다", () => {
    const first = nextState(newState(), facts({ skills: [skill("alpha")], mcpServers: [mcpServer("db")] }), "2026-11-01", started);
    expect(first.installs!.map((record) => record.appeared)).toEqual([false, false]);
    const second = nextState(first, facts({ skills: [skill("alpha"), skill("beta")], mcpServers: [mcpServer("db")] }), "2026-11-13", started);
    const beta = second.installs!.find((record) => record.key === skillInstallKey(skill("beta")))!;
```

`test/state/next-state.test.ts`(바꾼 뒤 4/6):

```ts
  it("첫 점검에서 본 설치는 새로 나타난 것이 아니고, 다음 점검에서 처음 본 설치는 새로 나타난 것이다", () => {
    const first = next(newState(), facts({ skills: [skill("alpha")], mcpServers: [mcpServer("db")] }), "2026-11-01", started);
    expect(first.installs!.map((record) => record.appeared)).toEqual([false, false]);
    const second = next(first, facts({ skills: [skill("alpha"), skill("beta")], mcpServers: [mcpServer("db")] }), "2026-11-13", started);
    const beta = second.installs!.find((record) => record.key === skillInstallKey(skill("beta")))!;
```

`test/state/next-state.test.ts`(찾을 곳 5/6):

```ts
  it("정의를 읽지 못한 서버는 적지 않는다. 켜져 있는지와 상관없이 본 설치를 모두 적는다", () => {
    const next = nextState(newState(), facts({ skills: [skill("off", { enabled: false })], mcpServers: [mcpServer("cloud", { definitionHash: null }), mcpServer("db", { enabled: false })] }), "2026-11-13", started);
    expect(next.installs!.map((record) => record.key).sort()).toEqual([skillInstallKey(skill("off", { enabled: false })), mcpInstallKey(mcpServer("db", { enabled: false }))!].sort());
  });
```

`test/state/next-state.test.ts`(바꾼 뒤 5/6):

```ts
  it("정의를 읽지 못한 서버는 적지 않는다. 켜져 있는지와 상관없이 본 설치를 모두 적는다", () => {
    const after = next(newState(), facts({ skills: [skill("off", { enabled: false })], mcpServers: [mcpServer("cloud", { definitionHash: null }), mcpServer("db", { enabled: false })] }), "2026-11-13", started);
    expect(after.installs!.map((record) => record.key).sort()).toEqual([skillInstallKey(skill("off", { enabled: false })), mcpInstallKey(mcpServer("db", { enabled: false }))!].sort());
  });
```

`test/state/next-state.test.ts`(찾을 곳 6/6):

```ts
  it("이번에 보이지 않은 설치의 기록은 지우되, 읽지 못한 곳에 든 설치의 기록은 남긴다", () => {
    const before = nextState(newState(), facts({ skills: [skill("gone"), skill("hidden")] }), "2026-11-01", started);
    const read = nextState(before, facts({ skills: [skill("hidden")] }), "2026-11-13", started);
    expect(read.installs!.map((record) => record.key)).toEqual([skillInstallKey(skill("hidden"))]);
    const unread = nextState(before, facts({ skills: [], unreadableDirs: [`${HOME}/skills`], unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }), "2026-11-13", started);
    expect(unread.installs).toEqual(before.installs);
  });
});
```

`test/state/next-state.test.ts`(바꾼 뒤 6/6):

```ts
  it("이번에 보이지 않은 설치의 기록은 지우되, 읽지 못한 곳에 든 설치의 기록은 남긴다", () => {
    const before = next(newState(), facts({ skills: [skill("gone"), skill("hidden")] }), "2026-11-01", started);
    const read = next(before, facts({ skills: [skill("hidden")] }), "2026-11-13", started);
    expect(read.installs!.map((record) => record.key)).toEqual([skillInstallKey(skill("hidden"))]);
    const unread = next(before, facts({ skills: [], unreadableDirs: [`${HOME}/skills`], unreadableSkillPlaces: { user: true, projects: [], plugins: [] } }), "2026-11-13", started);
    expect(unread.installs).toEqual(before.installs);
  });

  describe("Codex 설치(설계 「5단계 3부 계획 전 결정」 12번)", () => {
    const codexSkill = (name: string) => {
      const fact = skill(name, { path: `/home/u/.agents/skills/${name}`, realPath: `/home/u/.agents/skills/${name}/SKILL.md` });
      return { ...fact, installKey: codexSkillInstallKey(fact) };
    };
    const codexServer = (name: string) => {
      const fact = mcpServer(name);
      return { ...fact, installKey: codexMcpInstallKey(fact) };
    };

    it("두 도구의 설치를 함께 적는다. Codex의 열쇠는 도구 칸이 codex다", () => {
      const after = nextState(newState(), { claude: facts({ skills: [skill("alpha")] }), codex: codexFacts({ skills: [codexSkill("beta")], mcpServers: [codexServer("db")] }) }, "2026-11-13", started);
      expect(after.installs!.map((record) => JSON.parse(record.key)[1]).sort()).toEqual(["claude-code", "codex", "codex"]);
      expect(after.installs!.every((record) => !record.appeared)).toBe(true);
    });

    it("읽지 못한 곳에 든 것인지는 열쇠의 도구로 가린다. Codex의 설정을 읽지 못하면 Codex 서버의 기록만 남는다", () => {
      const before = nextState(newState(), { claude: facts({ skills: [skill("gone")] }), codex: codexFacts({ mcpServers: [codexServer("db")] }) }, "2026-11-01", started);
      const after = nextState(before, { claude: facts(), codex: codexFacts({ config: "unparsable" }) }, "2026-11-13", started);
      expect(after.installs).toEqual(before.installs!.filter((record) => JSON.parse(record.key)[1] === "codex"));
      // Codex를 다 읽었으면 보이지 않는 Codex 서버의 기록도 지운다
      expect(nextState(before, { claude: facts(), codex: codexFacts() }, "2026-11-13", started).installs).toEqual([]);
    });

    it("Claude Code의 읽지 못한 곳은 Codex 설치의 기록을 남기지 않는다", () => {
      const before = nextState(newState(), { claude: facts(), codex: codexFacts({ skills: [codexSkill("beta")] }) }, "2026-11-01", started);
      const claudeUnread = facts({ unreadableDirs: [`${HOME}/skills`], unreadableSkillPlaces: { user: true, projects: [], plugins: [] } });
      expect(nextState(before, { claude: claudeUnread, codex: codexFacts() }, "2026-11-13", started).installs).toEqual([]);
      // Codex의 사용자 스킬 폴더를 읽지 못하면 남긴다
      const codexUnread = codexFacts({ unreadableDirs: [`${CODEX_HOME}/skills`], unreadableSkillPlaces: { user: true, projects: [], plugins: [] } });
      expect(nextState(before, { claude: facts(), codex: codexUnread }, "2026-11-13", started).installs).toEqual(before.installs);
    });

    it("앞 점검에 Claude Code의 기록만 있었으면 이미 깔려 있던 Codex 설치도 새로 나타난 것으로 적힌다(설계 27절)", () => {
      const before = nextState(newState(), { claude: facts({ skills: [skill("alpha")] }), codex: codexFacts() }, "2026-11-01", started);
      const after = nextState(before, { claude: facts({ skills: [skill("alpha")] }), codex: codexFacts({ projects: [codexProject("/work/a")], mcpServers: [codexServer("db")] }) }, "2026-11-13", started);
      expect(after.installs!.find((record) => record.key === codexServer("db").installKey)).toEqual({ key: codexServer("db").installKey, firstSeen: "2026-11-13", appeared: true });
    });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/checkup-input.test.ts test/core/result-notices-record.test.ts test/state/next-state.test.ts`
Expected: FAIL. 바뀐 시험 파일 셋이 실패한다. 입력 묶음에 Codex 도구가 없고, `collected`와 `facts`가 도구마다 나뉘지 않았으며, `nextState`가 두 도구의 셋팅 사실을 받지 않고, Codex의 읽지 못한 기록과 관측이 빠진 것을 아직 알린다.

- [ ] **Step 3: 구현한다**

`src/commands/checkup-input.ts`(찾을 곳 1/9):

```ts
// 점검의 입력 묶음을 모은다. 기록을 읽고, 셋팅을 스캔하고, 지난 점검까지의 관측 기록을 붙여 core가 받는 모양으로 만든다. 경로의 정규화처럼 순수하지 않은 일은 여기서 끝낸다(설계 7.2, 8, 10 「프로젝트 목록」, 12.1)
import { normalizePath } from "../adapters/claude/locate.ts";
import { claudeObservation, CLAUDE_COVERAGE } from "../adapters/claude/observation.ts";
import { SHELL_TOOLS } from "../adapters/claude/parser.ts";
import { makeWindows } from "../adapters/common/dates.ts";
import { collectClaude, unreadableCount, type ClaudeCollectResult, type EvalClock } from "../collect/claude.ts";
import type { EvaluationInput } from "../core/evaluate.ts";
```

`src/commands/checkup-input.ts`(바꾼 뒤 1/9):

```ts
// 점검의 입력 묶음을 모은다. 두 도구의 기록을 읽고, 셋팅을 스캔하고, 지난 점검까지의 관측 기록을 붙여 core가 받는 모양으로 만든다. 경로의 정규화처럼 순수하지 않은 일은 여기서 끝낸다(설계 7.2, 8, 10 「프로젝트 목록」, 12.1, 「5단계 3부 계획 전 결정」 2·3번)
import { normalizePath } from "../adapters/claude/locate.ts";
import { claudeObservation, CLAUDE_COVERAGE, type Observation } from "../adapters/claude/observation.ts";
import { SHELL_TOOLS } from "../adapters/claude/parser.ts";
import { CODEX_COVERAGE, codexMcpObservation } from "../adapters/codex/observation.ts";
import { CODEX_SHELL_TOOLS } from "../adapters/codex/parser.ts";
import { makeWindows } from "../adapters/common/dates.ts";
import { collectClaude, unreadableCount, type ClaudeCollectResult, type ClaudeReadStats, type EvalClock } from "../collect/claude.ts";
import { codexUnreadableCount, collectCodex, type CodexCollectResult, type CodexReadStats } from "../collect/codex.ts";
import type { EvaluationInput } from "../core/evaluate.ts";
```

`src/commands/checkup-input.ts`(찾을 곳 2/9):

```ts
import { scanClaudeSetup } from "../scan/claude.ts";
import type { ClaudeSetupFacts } from "../scan/types.ts";
import type { StateFile } from "../state/state.ts";
```

`src/commands/checkup-input.ts`(바꾼 뒤 2/9):

```ts
import { scanClaudeSetup } from "../scan/claude.ts";
import { scanCodexSetup } from "../scan/codex.ts";
import type { ClaudeSetupFacts, CodexSetupFacts } from "../scan/types.ts";
import type { StateFile } from "../state/state.ts";
```

`src/commands/checkup-input.ts`(찾을 곳 3/9):

```ts
  input: EvaluationInput;
  collected: ClaudeCollectResult;
  facts: ClaudeSetupFacts;
  /** 평가 결과에 싣는 수집 결과(도구마다). 캐시를 쓴 파일 수처럼 실행마다 다른 것은 뺐다 */
```

`src/commands/checkup-input.ts`(바꾼 뒤 3/9):

```ts
  input: EvaluationInput;
  /** 도구마다 모은 기록 */
  collected: { claude: ClaudeCollectResult; codex: CodexCollectResult };
  /** 도구마다의 셋팅 사실. 관측 기록을 고칠 때 쓴다 */
  facts: { claude: ClaudeSetupFacts; codex: CodexSetupFacts };
  /** 평가 결과에 싣는 수집 결과(도구마다). 캐시를 쓴 파일 수처럼 실행마다 다른 것은 뺐다 */
```

`src/commands/checkup-input.ts`(찾을 곳 4/9):

```ts

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
```

`src/commands/checkup-input.ts`(바꾼 뒤 4/9):

```ts

/** Codex는 스킬 사용을 기록하지 않아 스킬의 관측은 늘 빠짐없지 않다. 그 까닭의 문장은 4부가 정한다(설계 「5단계 2부 계획 전 결정」 6번, 「5단계 3부 계획 전 결정」 2·13번) */
const CODEX_SKILL_OBSERVATION: Observation = { complete: false, reasons: [] };

/** 결과에 싣는 Codex의 읽은 양. Claude Code와 같은 칸만 싣는다. Codex에만 있는 칸(건너뛴 압축 파일, 일부만 읽은 파일)은 4부가 잇는다(「5단계 3부 계획 전 결정」 13번) */
function codexSharedRead(read: CodexReadStats): Omit<ClaudeReadStats, "fromCache"> {
  return {
    files: read.files,
    listedBytes: read.listedBytes,
    bytes: read.bytes,
    inProgress: read.inProgress,
    olderThanWindow: read.olderThanWindow,
    unreadableFiles: read.unreadableFiles,
    unreadableFileBytes: read.unreadableFileBytes,
    unknownSizeFiles: read.unknownSizeFiles,
    unreadableDirs: read.unreadableDirs,
  };
}

export async function gatherCheckupInput(options: CheckupInputOptions): Promise<CheckupInput> {
  const collectOptions = { env: options.env, homedir: options.homedir, clock: options.clock, cacheDir: options.cacheDir, rescan: options.rescan };
  const claude = await collectClaude(collectOptions);
  const codex = await collectCodex(collectOptions);

  // 프로젝트 목록은 두 도구의 주 세션 가운데 수집 구간에 응답이 있는 것의 작업 폴더(세션마다 처음 적힌 것 하나)로 만든다. 하위 세션과 작업 폴더가 없는 세션은 넣지 않는다
  const collectDates = new Set(makeWindows(options.clock.nowMs, options.clock.timeZone).collectDates);
  const cwds = new Set<string>();
  const normalizedCwds: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const summary of [...claude.summaries, ...codex.summaries]) {
    if (summary.cwd !== null) normalizedCwds[summary.cwd] = normalizePath(summary.cwd, options.platform);
    if (summary.kind === "main" && summary.cwd !== null && Object.entries(summary.days).some(([date, day]) => collectDates.has(date) && day.responses > 0)) cwds.add(summary.cwd);
  }
  // 정의가 PC에 없는 claude.ai 연결은 Claude Code 기록에 남은 이름으로만 알 수 있다
  const claudeAiNames = new Set<string>();
  for (const summary of claude.summaries) {
    for (const day of Object.values(summary.days)) {
      for (const name of [...day.loadedMcpServers, ...Object.keys(day.mcpAttributions)]) if (name.startsWith(CLAUDE_AI_PREFIX)) claudeAiNames.add(name);
```

`src/commands/checkup-input.ts`(찾을 곳 5/9):

```ts

  const facts = await scanClaudeSetup({
    env: options.env,
```

`src/commands/checkup-input.ts`(바꾼 뒤 5/9):

```ts

  const sortedCwds = [...cwds].sort();
  const claudeFacts = await scanClaudeSetup({
    env: options.env,
```

`src/commands/checkup-input.ts`(찾을 곳 6/9):

```ts
    platform: options.platform,
    cwds: [...cwds].sort(),
    claudeAiNames: [...claudeAiNames].sort(),
```

`src/commands/checkup-input.ts`(바꾼 뒤 6/9):

```ts
    platform: options.platform,
    cwds: sortedCwds,
    claudeAiNames: [...claudeAiNames].sort(),
```

`src/commands/checkup-input.ts`(찾을 곳 7/9):

```ts
  });

  const unreadable = unreadableCount(collected.read);
  const observation = { skills: claudeObservation(summaries, unreadable, "skill"), mcp: claudeObservation(summaries, unreadable, "mcp") };
  const input: EvaluationInput = {
```

`src/commands/checkup-input.ts`(바꾼 뒤 7/9):

```ts
  });
  const codexFacts = await scanCodexSetup({ env: options.env, homedir: options.homedir, tmpdir: options.tmpdir, platform: options.platform, cwds: sortedCwds, salt: options.state.salt });

  const claudeUnreadable = unreadableCount(claude.read);
  const claudeObserved = { skills: claudeObservation(claude.summaries, claudeUnreadable, "skill"), mcp: claudeObservation(claude.summaries, claudeUnreadable, "mcp") };
  const codexObserved = { skills: CODEX_SKILL_OBSERVATION, mcp: codexMcpObservation(codex.summaries, codexUnreadableCount(codex.read)) };
  const input: EvaluationInput = {
```

`src/commands/checkup-input.ts`(찾을 곳 8/9):

```ts
        tool: "claude-code",
        summaries,
        coverage: CLAUDE_COVERAGE,
        shellTools: [...SHELL_TOOLS].sort(),
        complete: { skills: observation.skills.complete, mcp: observation.mcp.complete },
        setup: facts,
      },
    ],
    projects: facts.projects,
    normalizedCwds: { ...normalizedCwds },
```

`src/commands/checkup-input.ts`(바꾼 뒤 8/9):

```ts
        tool: "claude-code",
        summaries: claude.summaries,
        coverage: CLAUDE_COVERAGE,
        shellTools: [...SHELL_TOOLS].sort(),
        complete: { skills: claudeObserved.skills.complete, mcp: claudeObserved.mcp.complete },
        setup: claudeFacts,
      },
      {
        tool: "codex",
        summaries: codex.summaries,
        coverage: CODEX_COVERAGE,
        shellTools: [...CODEX_SHELL_TOOLS].sort(),
        complete: { skills: codexObserved.skills.complete, mcp: codexObserved.mcp.complete },
        setup: codexFacts,
      },
    ],
    // Codex의 프로젝트 몫은 정규화한 뿌리로 잇는다(「5단계 2부 계획 전 결정」 9번)
    projects: claudeFacts.projects,
    normalizedCwds: { ...normalizedCwds },
```

`src/commands/checkup-input.ts`(찾을 곳 9/9):

```ts
  };
  const { fromCache: _fromCache, ...read } = collected.read;
  const tools: CollectedTool[] = [{ tool: "claude-code", detected: collected.detected, visibleFrom: collected.visibleFrom, overlappingSessions: collected.overlappingSessions, read, observation }];
  return { input, collected, facts, tools };
}
```

`src/commands/checkup-input.ts`(바꾼 뒤 9/9):

```ts
  };
  const { fromCache: _fromCache, ...claudeRead } = claude.read;
  const tools: CollectedTool[] = [
    { tool: "claude-code", detected: claude.detected, visibleFrom: claude.visibleFrom, overlappingSessions: claude.overlappingSessions, read: claudeRead, observation: claudeObserved },
    // Codex는 다른 기록에서 이어받은 앞부분을 빼고 세므로 다른 세션과 겹쳐 세는 응답이 없다(설계 「5단계 계획 전 결정」 7번)
    { tool: "codex", detected: codex.detected, visibleFrom: codex.visibleFrom, overlappingSessions: 0, read: codexSharedRead(codex.read), observation: codexObserved },
  ];
  return { input, collected: { claude, codex }, facts: { claude: claudeFacts, codex: codexFacts }, tools };
}
```

`src/commands/checkup.ts`(찾을 곳):

```ts
  const run: RunRecord = { durationMs: now() - started, cachedFiles: gathered.collected.read.fromCache, saved, reportPath, resultPath, notices, text: { notices: notices.map((notice) => runNoticeText(notice, options.lang)) } };
```

`src/commands/checkup.ts`(바꾼 뒤):

```ts
  const run: RunRecord = { durationMs: now() - started, cachedFiles: gathered.collected.claude.read.fromCache + gathered.collected.codex.read.fromCache, saved, reportPath, resultPath, notices, text: { notices: notices.map((notice) => runNoticeText(notice, options.lang)) } };
```

`src/core/result/notices.ts`(찾을 곳):

```ts
    if (found !== undefined) {
```

`src/core/result/notices.ts`(바꾼 뒤):

```ts
    // 읽지 못한 기록과 관측이 빠진 것의 Codex 몫은 4부가 넣는다. Codex 스킬의 관측은 늘 빠짐없지 않아 지금의 문장이 맞지 않는다(설계 「5단계 3부 계획 전 결정」 13번)
    if (found !== undefined && id === "claude-code") {
```

`src/state/next-state.ts`(찾을 곳 1/2):

```ts
import type { LocalDate } from "../adapters/common/dates.ts";
import { installKeysOf, unseenInUnreadablePlace } from "../scan/identity.ts";
import type { ClaudeSetupFacts } from "../scan/types.ts";
import { updateInstalls } from "./observations.ts";
```

`src/state/next-state.ts`(바꾼 뒤 1/2):

```ts
import type { LocalDate } from "../adapters/common/dates.ts";
import { codexInstallKeysOf, codexUnseenInUnreadablePlace, installKeysOf, unseenInUnreadablePlace } from "../scan/identity.ts";
import type { ClaudeSetupFacts, CodexSetupFacts } from "../scan/types.ts";
import { updateInstalls } from "./observations.ts";
```

`src/state/next-state.ts`(찾을 곳 2/2):

```ts

/**
 * 점검 뒤의 상태(순수). 무작위 값은 그대로 두고, 마지막 점검 시각과 관측 기록을 고친다.
 * 관측 기록은 스캐너가 본 모든 설치로 고친다. 점수에 넣는 도구인지, 켜져 있는지와 상관없다. 읽지 못한 곳에 든 설치의 기록은 남긴다(설계 18.1).
 */
export function nextState(state: StateFile, facts: ClaudeSetupFacts, today: LocalDate, startedAt: string): StateFile {
  return { ...state, lastCheckupAt: startedAt, installs: updateInstalls(state.installs, installKeysOf(facts), today, unseenInUnreadablePlace(facts)) };
}
```

`src/state/next-state.ts`(바꾼 뒤 2/2):

```ts

/** 설치 열쇠의 도구 칸(installKey로 만든 목록의 둘째 칸). 읽지 못하면 null이다 */
function toolOfKey(key: string): string | null {
  try {
    const parts = JSON.parse(key) as unknown;
    return Array.isArray(parts) && typeof parts[1] === "string" ? parts[1] : null;
  } catch {
    return null;
  }
}

/**
 * 점검 뒤의 상태(순수). 무작위 값은 그대로 두고, 마지막 점검 시각과 관측 기록을 고친다.
 * 관측 기록은 두 도구의 스캐너가 본 모든 설치로 고친다. 점수에 넣는 도구인지, 켜져 있는지와 상관없다. 읽지 못한 곳에 든 설치의 기록은 남기고,
 * 읽지 못한 곳에 든 것인지는 열쇠의 도구 칸으로 도구를 가려 그 도구의 판정으로 본다(설계 18.1, 「5단계 3부 계획 전 결정」 12번).
 */
export function nextState(state: StateFile, facts: { claude: ClaudeSetupFacts; codex: CodexSetupFacts }, today: LocalDate, startedAt: string): StateFile {
  const claudeUnseen = unseenInUnreadablePlace(facts.claude);
  const codexUnseen = codexUnseenInUnreadablePlace(facts.codex);
  const keys = [...installKeysOf(facts.claude), ...codexInstallKeysOf(facts.codex)];
  const keepUnseen = (key: string): boolean => (toolOfKey(key) === "codex" ? codexUnseen(key) : claudeUnseen(key));
  return { ...state, lastCheckupAt: startedAt, installs: updateInstalls(state.installs, keys, today, keepUnseen) };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/commands/checkup-input.test.ts test/state/next-state.test.ts test/core/result-notices-record.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 33개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/commands/checkup-input.test.ts test/core/result-notices-record.test.ts test/state/next-state.test.ts src/commands/checkup-input.ts src/commands/checkup.ts src/core/result/notices.ts src/state/next-state.ts
git commit -m "feat: 점검의 입력 묶음과 관측 기록에 Codex를 넣음"
```

---

### Task 3: 묶은 실행 파일과 전체 검사

**Files:**
- Modify: `skills/aq/scripts/aq.mjs`

**Interfaces:**
- Consumes: 과제 1·2의 원본.
- Produces: 다시 만든 `skills/aq/scripts/aq.mjs`. 2부의 smol-toml이 처음 묶음에 든다.

- 과제 1부터 원본이 바뀌어 묶음 검사가 어긋나 있다. `npm run build`로 다시 만들고 전체 검사를 돌린다.
- 과제 2부터 점검 명령이 Codex 스캐너를 불러 smol-toml이 묶음에 든다. 묶기 설정이 라이선스 주석을 남겨(`legalComments: "inline"`) smol-toml의 BSD-3-Clause 고지가 함께 든다(2부 계획이 3부에 넘긴 확인).

- [ ] **Step 1: 구현한다**

묶은 실행 파일은 글로 싣지 않는다. 확인 명령의 `npm run build`가 원본에서 다시 만든다.

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

- [ ] **Step 2: 전체 검사가 통과하는지 확인한다**

Run: `npm run build && npm run check`
Expected: `npm run build`가 `묶음 완료`를 내고, `npm run check`가 타입 검사 통과, 시험 파일 105개·시험 1,753개 통과(파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다), `묶음 검사 통과`, `버전 검사 통과`를 낸다. 묶음에 smol-toml의 `SPDX-License-Identifier: BSD-3-Clause` 고지가 든다.

- [ ] **Step 3: 커밋한다**

```bash
git add skills/aq/scripts/aq.mjs
git commit -m "build: 평가 엔진에 Codex를 넣은 묶음을 다시 만듦"
```

---

### Task 4: Node.js 22, 이 PC의 기록과 셋팅으로 돌려 보기, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~3의 결과물 전부.
- Produces: `develop`에 병합된 5단계 3부. 4부(결과 조립·문구·화면·스킬 본문의 Codex 몫)가 기대는 것은 평가의 Codex 몫(`Evaluation`의 도구별 값과 `safeguards`), `CheckupInput`의 `collected.codex`(1부의 알림 재료와 `CodexReadStats`)와 `facts.codex`, 결과의 `CollectedTool`과 `ResultCoverage`의 `partialFiles`·`skippedFiles` 자리다.

- [ ] **Step 1: 묶음을 다시 만들어도 그대로인지 확인한다**

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 2: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS(시험 파일 105개·시험 1,753개. 파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다. 받은 22가 22.15.0보다 낮으면 1부의 압축 기록 시험 묶음 둘을 건너뛴 수만큼 적다). 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 3: 이 PC의 기록과 셋팅으로 실제로 돌려 본다**

두 도구의 기록과 셋팅, 상태 폴더는 읽기만 한다. 저장하지 않는 점검이라 결과는 OS의 임시 폴더에만 쓴다. 이 PC의 이름, 경로, 값, 개수는 저장소 밖 작업 기록에만 둔다.

Run: `node skills/aq/scripts/aq.mjs checkup --no-open --no-save`

| 확인 | Expected |
|---|---|
| 끝까지 도는지 | 오류 없이 요약 JSON을 내고 몇 분 안에 끝난다. 임시 폴더에 결과 파일이 생긴다 |
| 두 도구 | 결과의 도구 목록에 두 도구가 찾음과 점수에 넣음으로 든다(작성자 PC) |
| Codex의 규칙 | Codex의 도구별 값이 관측 범위대로다. S4, S5, E5, E7, F2는 `unsupported`이고, 그 밖은 재거나 까닭(`incomplete` 같은 것)이 있다 |
| S2 | 근거에 잰 도구와 뺀 도구가 있고, Codex의 안전장치가 그 PC의 승인과 샌드박스대로다 |
| 값과 글이 나가지 않는지 | 저장소 밖 스크립트로 결과 파일 전체를 글로 바꿔, 사용자 `config.toml`에 적힌 환경 변수와 머리말의 값이 경로를 담는 칸 밖에 들어 있지 않은지 본다 |
| 쓰지 않는지 | 돌리기 앞뒤로 Codex 홈의 `config.toml`, Claude Code의 사용자 설정, 상태 폴더의 수정 시각이 그대로다 |

작성자 PC에서 계획을 쓰며 돌린 결과는 위와 같았다(값과 개수는 저장소 밖 작업 기록에 적었다). Codex의 E6은 그 PC에서 MCP 관측이 빠짐없지 않아(너무 긴 줄, 27절) `incomplete`였다.

- [ ] **Step 4: 원장을 고치고 커밋한다**

원장의 5단계 3부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 7에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 3부 구현 결과를 적음"
```

- [ ] **Step 5: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage5-3.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~3의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 이 PC의 기록과 셋팅으로 돌린 것의 확인 항목과 맞았는지), 「확인하지 못한 것」이다. 확인하지 못한 것에는 Codex의 알림·읽은 양·문구·결과 화면·스킬 본문(4부), macOS와 Linux, Codex를 실제로 돌려 판정을 맞춰 본 것, 27절의 「Codex 평가의 한계」를 적는다.

```bash
git push -u origin 5단계-3부-평가-엔진에-Codex
gh pr create --base develop --head 5단계-3부-평가-엔진에-Codex --title "feat: 5단계 3부 평가 엔진에 Codex" --body-file "$TEMP/aq-pr-stage5-3.md"
```

- [ ] **Step 6: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex 하나를 만들어 맡긴다(필수는 제품 결함과 수용 조건 미충족뿐이다). 짝은 새 복제본에서 계획의 코드 블록을 자기 도구로 뽑아 기준에 적용한 결과가 브랜치의 `src`·`test`·`scripts`·`skills`·`package.json`·`package-lock.json`과 같은지, `npm ci` 뒤 `npm run check`와 Node.js 22의 전체 시험, 이 PC의 기록과 셋팅으로 Step 3의 확인 항목을 자기 방법으로 재현하는지, 제품 코드가 설계(「5단계 3부 계획 전 결정」)와 다른 결과를 내거나 예외로 멈추거나 실제 홈에 쓰거나 값을 결과 밖으로 내는지를 본다. 결함이라고 적으려면 합성 자료로 실제로 재현한다. 변이로 틀린 구현을 지어 보는 일은 하지 않는다. 필수 지적은 고치고 지적한 짝이 다시 본다. 오래 끌면 Fable 5.2가 제품 결함만 한 번 더 찾는다(메모리 `review-until-no-major-issues`).

- [ ] **Step 7: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 5단계-3부-평가-엔진에-Codex --merge --subject "feat: 5단계 3부 평가 엔진에 Codex를 개발 브랜치에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 3부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 4부와 그 뒤에 넘기는 것

5단계 3부가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 부 | 3부가 남긴 재료 |
|---|---|---|
| Codex의 셋팅 쪽 알림(읽지 못한 `config.toml`과 프로젝트 설정, 지침, 스킬 폴더, 켜져 있는데 세지 않은 플러그인, 점수에 세지 않는 플러그인 안의 문제)과 그 문구 | 4부 | `CheckupInput.facts.codex`, `setupNotices`가 Codex를 건너뛰는 자리 |
| 기록 쪽 알림의 Codex 몫. 읽지 못한 기록, 건너뛴 압축 파일(22.15.0과 23.8.0 안내), 일부만 읽은 파일, 관측이 빠진 것과 Codex 스킬 관측의 문장, 1부가 넘긴 Codex 알림(정체 모를 `thread_source`와 실행 층 종류, 부모 기록이 없는 하위 세션, 이어받은 것을 확인하지 못한 세션, 세션 ID를 대신 쓴 기록, 수정 시각과 크기를 모르는 사본, 합친 세션, 읽지 않은 사본, 이름 없는 파일) | 4부 | `CheckupInput.collected.codex`, `recordNotices`가 Codex를 건너뛰는 자리 |
| 읽은 양의 Codex 몫. 건너뛴 압축 파일은 읽지 못한 비율의 분자, 일부만 읽은 파일은 아래 경계(「5단계 계획 전 결정」 2번), `ResultCoverage`의 `partialFiles`·`skippedFiles` | 4부 | `CodexReadStats`, 결과에 싣는 Codex 수집 결과(지금은 Claude Code와 같은 칸만) |
| S2의 Codex 처방과 "어떻게 쟀나"(Codex의 조건, 설정을 읽지 못해 뺀 도구). 근거 문구는 3부가 뺀 도구 칸을 더했다 | 4부 | `safeguards`, S2 근거의 `unreadTools` |
| 정밀 점검 단서의 Codex 몫(전역 지침이 부르는 프로젝트, 여러 프로젝트에 겹치는 줄, 큰 전역 지침) | 4부 | `CodexSetupFacts.globalMentions`, `globalInstructions`, `projects`, `deepHints`가 Codex를 건너뛰는 자리 |
| Codex의 사람 요청과 도구 호출이 대신 보는 값이라는 알림, I3의 굵기(9.7) | 4부 | `CODEX_COVERAGE`의 `proxy` |
| 결과 화면의 Codex 색 확정, 스킬 본문의 Codex | 4부 | `TOOL_COLORS.codex`(임시) |
| Codex 매니페스트 둘, 버전 검사, 산출물, Codex에서 스킬이 도는지 | 5부 | 없음 |
| Codex 서버 끄기(A4)의 후보 조건 | 6단계 | 「5단계 2부 계획 전 결정」 7번, 「5단계 3부 계획 전 결정」 11번 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 「5단계 3부 계획 전 결정」 1번 | 나눔(로드맵 문서) | 설계 커밋 |
| 2번, 12.1 | 입력 묶음의 Codex 도구(기록, 관측 범위, 셸 명령 도구, 관측, 셋팅 사실) | 2 |
| 3번, 10절 「프로젝트 목록」 | 두 도구로 만든 프로젝트 목록, 두 스캐너에 같은 목록 | 2 |
| 4번 | 도구로 가르는 셋팅 사실의 꼴 | 1 |
| 5번, 「5단계 계획 전 결정」 4번 | S2의 Codex 안전장치, 읽지 못한 도구만 빼기 | 1 |
| 6번, 11.3 「E1의 식」 | Codex의 E1 | 1 |
| 7·8·9번, 「5단계 계획 전 결정」 5·6번 | F3, F4, F5, F6의 Codex 몫 | 1 |
| 10번 | E5(Codex는 재지 않음), E6(읽지 못한 곳, 플러그인의 서버) | 1 |
| 11번 | Codex 정비 후보 없음 | 1 |
| 12번, 18.1 | 관측 기록의 두 도구, 읽지 못한 곳의 도구 가름 | 2 |
| 13번 | 결과 조립의 3부 몫(알림과 단서는 Claude Code만, 도구 목록과 수집 결과에 Codex) | 1, 2 |
| 14번 | 1부가 넘긴 엔진 몫(도구로 넣지 않는 종류, 너무 긴 줄, 끊은 턴) | 바꾸는 코드 없음(27절) |
| 「5단계 2부 계획 전 결정」의 3부 몫 | smol-toml이 묶음에 들고 라이선스 고지가 함께 듦 | 3 |

3부에 넣지 않은 것은 「4부와 그 뒤에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 커밋·병합 요청·병합 제목을 전역 규칙(타입 12개, 타입을 뺀 설명 50자 이내, 한글 4자 이상, 영문자가 한글보다 많지 않음)으로 기계로 셌다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드가 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`e533d05`)에서 과제 1부터 3까지 차례대로 만들었다(Windows 11, Node.js 24.18). 의존성은 복제본에 `npm ci`로 깔았다. 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1과 2는 시험만 놓고 돌리면 실패하고(과제 1은 바뀐 시험 파일 아홉, 과제 2는 셋), 구현을 놓으면 그 과제의 시험과 타입 검사가 통과했다. 과제 3의 `npm run build && npm run check`는 시험 파일 105개·시험 1,753개(Windows에서 파일 링크 시험 하나를 건너뛰어 1,752개 통과)와 묶음 검사, 버전 검사가 통과했다. 묶음을 다시 만들어도 작업 트리가 그대로였고, 만든 복제본의 파일 262개(문서와 원장 빼고)가 연습 작업 폴더와 바이트까지 같았다. 묶음에 smol-toml의 BSD-3-Clause 고지가 들었다.

연습 작업 폴더에서 따로 확인한 것은 이렇다. 과제의 시험 커밋 둘을 하나씩 꺼내 그 커밋이 고친 시험 파일만 돌리면 모두 실패했고(과제 1은 서른다섯 시험, 과제 2는 열아홉 시험), 구현 커밋 셋을 하나씩 꺼내 타입 검사와 전체 시험을 돌리면 모두 타입 오류 없이 통과했다. 계획을 쓰는 동안 두 가지를 정했다. S2의 근거에 뺀 도구의 수를 더하자 근거 숫자가 모두 문구에 보여야 한다는 문구 표의 시험이 그 칸을 요구해, 근거 문구에 뺀 도구를 더했다. Codex 스킬의 관측은 늘 빠짐없지 않은데 지금의 기록 쪽 알림이 맞지 않는 문장으로 그것을 알리게 되어, 읽지 못한 기록과 관측이 빠진 것의 Codex 몫은 4부로 넘겼다.

이 PC의 기록과 셋팅(읽기만)으로 Task 4 Step 3을 미리 돌렸다. 저장하지 않는 점검이 오류 없이 1분 안에 끝났고, 결과의 도구 목록에 두 도구가 찾음과 점수에 넣음으로 들었다. Codex의 도구별 값은 관측 범위대로였고(S4, S5, E5, E7, F2는 `unsupported`), E6은 MCP 관측이 빠짐없지 않아 `incomplete`였다. S2는 두 도구로 쟀고 뺀 도구가 없었다. 돌리기 앞뒤로 Codex의 `config.toml`과 상태 폴더의 수정 시각이 그대로였다(값과 개수는 저장소 밖 작업 기록에 적었다).

확인하지 못한 것은 이렇다. Node.js 22에서 돌리는 것은 Task 4 Step 2에서 한다. 주 세션은 Codex를 실제로 돌려 판정을 맞춰 보지 않았다. 판정은 설계의 결정(모두 Codex 0.166.0의 공개 소스로 정한 것)대로다. macOS와 Linux는 보지 않았다. Windows의 파일 링크 시험은 이 PC에서 건너뛰었다.
