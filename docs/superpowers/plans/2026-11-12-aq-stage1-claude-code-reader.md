# AQ 점검 1단계 — Claude Code 기록 읽기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 짝 Codex가 단계 끝에 코드 정독·시험 재실행·실제 기록 대조로 검증한다.

**Goal:** Claude Code의 로컬 기록을 한 줄씩 읽어 세션마다·날짜마다의 요약(숫자와 스킬·MCP 이름만)으로 바꾸고, 파일마다 캐시해서 같은 기록이면 캐시를 쓰든 안 쓰든 같은 요약을 낸다.

**Architecture:** 줄을 해석하는 부분(순수 함수)과 파일을 여는 부분을 나눈다(설계 7.2). `src/adapters/common/`에 날짜·버전·지문·줄 읽기·깨진 줄의 바깥 종류 읽기를, `src/adapters/claude/`에 사람 요청 판별·줄 해석·파일 찾기·관측 범위를, `src/state/cache.ts`에 캐시를, `src/collect/claude.ts`에 모으기를 둔다. 묶은 실행 파일 `skills/aq/scripts/aq.mjs`는 esbuild로 만든다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험).

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계의 6.3, 7.1~7.4, 8, 9.1~9.5, 9.7~9.8, 12.1, 20.1(읽기 쪽), 21.1(어댑터 반례), 22절을 구현한다. 로드맵은 `docs/superpowers/plans/2026-11-12-aq-roadmap.md`.

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)을 저장소에 같이 올린다. 사용자는 `npm install`을 하지 않는다. 묶은 파일은 사람이 읽을 수 있게 줄이지 않는다(설계 6.3).
- 실행할 때 내려받는 패키지는 없다. 묶은 파일에 네트워크를 부르는 곳이 없어야 한다(설계 2, 21.1).
- 해석하는 부분(`src/adapters/common/` 가운데 `lines.ts`를 뺀 것, `src/adapters/claude/classify.ts`, `parser.ts`, `observation.ts`)은 순수하다. 파일을 열지 않고 시계를 직접 읽지 않는다(설계 7.2).
- 기록 파일은 읽기만 한다. 대화 본문, 도구에 넣은 값과 받은 값, 지침의 글은 메모리에서 세고 버린다. 캐시에는 숫자와 스킬·MCP 이름(그리고 작업 폴더 경로)만 들어간다(설계 8, 9.4).
- 한 줄의 상한은 16MB다. 한 줄씩 흘려 읽고, 파일 하나가 끝나면 그 파일의 응답 ID 집합을 버린다(설계 22).
- 사건의 날짜는 평가 시계의 시간대로 바꾼 현지 날짜다. 점수 구간은 오늘을 포함한 최근 30개 날짜, 수집 구간은 35개 날짜다(설계 9.3).
- 기록하지 않는 것은 0이 아니다. 못 보는 지표는 "못 봄"으로 낸다(설계 7.3).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다. 설정 파일(`package.json`, `*.config.ts` 등)은 뺀다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이다(사용자 전역 지침).
- 깃. `develop`에서 `1단계-클로드코드-기록읽기` 브랜치를 따서 작업한다. 단계가 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다(로드맵).
- 이 PC의 기록에서 잰 숫자는 저장소와 병합 요청에 넣지 않는다(설계 머리말).

## 이 계획이 기대는 설계 보완

계획을 쓰며 이 PC의 Claude Code 기록 구조(종류 이름·열쇠 이름·열거값만)를 조사했고, 설계가 정하지 않았거나 그대로 만들면 틀리는 곳을 설계 세션이 설계 문서에 보완했다. 1~5는 설계 「리뷰 반영 기록」의 「구현 계획 중 보완」(설계 리뷰 11차까지 통과)이고, 6~11은 「구현 계획 리뷰 1차에서 보완」, 12·13은 「구현 계획 리뷰 2차에서 보완」이다. 이 계획이 기준으로 삼는 설계는 SHA256 `31D66040EBEFE9A96F47B93EA2AD8425367A31106593340BEA58DAF651945B1D`(2,280줄)이다. 이 계획이 따르는 규약은 아래다(모두 설계 9.2~9.5·9.8·20.1에 있다).

1. **끊은 턴.** `origin`이 없고 글이 `[Request interrupted by user`로 시작하는 `user` 줄. 사람 요청 판별표의 10번이고, 전의 10번(그 밖의 평문)은 11번이 됐다.
2. **거절과 끊김.** `toolDenialKind`가 있거나 `permissionDecision.decision`이 `reject`인 줄만 아래 차례로 가르고, 둘 다 아니면 보통의 도구 결과다(허락만 표시된 결과와 두 필드가 다 없는 결과). ① `toolDenialKind`가 `user-rejected` → 사람이 거절함(`decision`이 무엇이든) ② `permissionDecision.decision`이 `reject`이고 `source`가 `hook` → 훅이 막음 ③ `toolDenialKind`가 `interrupted` → 끊겨서 끝남(거절 아님) ④ `toolDenialKind`가 `permission-rule`이거나 `decision`이 `reject` → 권한 검사가 막음(무엇이 막았는지 모르는 것도 든다) ⑤ `toolDenialKind`가 그 밖의 값 → 모르는 표시(종류별 수만). 다섯 모두 도구 결과와 오류에서 뺀다. 거절 표시가 붙은 줄 하나가 한 건이다.
3. **끊은 표지를 두 번 세지 않기.** 표지 줄 바로 앞의 `user` 줄이 사람이 거절한 도구 결과이고 그 사이에 응답(`assistant`) 줄이 없으면 그 표지는 끊은 턴으로 세지 않는다.
4. **훅.** `hook_success`는 실행, `hook_non_blocking_error`는 실행이면서 실패다. `hook_blocking_error`는 오류 글(`attachment.blockingError`가 문자열이면 그 글, 객체면 그 안의 `blockingError` 문자열. 명령(`command`)은 보지 않는다)에 실패 표지(`blocking because onFailure is`, `blocking because Git Bash wasn't found`)가 있으면 실행이면서 실패이고, 없으면 일부러 막은 것인지 실패해서 막힌 것인지 가릴 수 없는 막음으로 따로 세며 실행에도 실패에도 넣지 않는다. 오류 글은 표지만 보고 버린다. `hook_additional_context`와 `system`의 `stop_hook_summary`는 세지 않는다(설계 리뷰 10차).
5. **MCP 연결 실패.** `deferred_tools_delta`의 `failedMcpServers`가 비어 있지 않은 줄. 세션의 어느 줄에서든 보고 그 줄의 날짜 칸에 적는다. `needsAuthMcpServers`, `pendingMcpServers`는 실패가 아니다.
6. **모든 줄을 풀어 본다.** 종류와 상관없이 모든 줄을 JSON으로 풀어 보고, 풀리지 않으면 깨진 줄로 센다(설계 9.4, 20.1). 숫자를 세는 해석은 `assistant`, `user`, `attachment`, `system` 줄에만 한다. `{`로 시작하고 `}`로 끝나는 겉모양은 온전하다는 근거가 아니다.
7. **판별표와 따로 세는 것.** 하위 세션과 `isSidechain` 줄은 사람 요청으로 세지 않지만(판별표 1번), 도구 결과·오류·거절, 끊은 표지, 슬래시 명령(스킬 신호 3)은 판별표와 따로 센다. 끊은 턴은 주 세션과 하위 세션을 합쳐 센다(설계 9.2, 9.5).
8. **명령 줄.** 글의 앞머리가 `<command-name>` 꼬리표이거나, 앞머리의 `<command-message>…</command-message>` 바로 다음이 `<command-name>` 꼬리표인 줄이다. 사람이 친 스킬 명령은 `<command-message>`가 먼저이고 `origin`이 `human`이다. 판별표 7·8번은 `origin`이 없는 명령 줄이고, 스킬 신호 3은 `origin`과 상관없이 명령 줄(판별표 2·3번에 걸리는 줄은 뺀다)의 이름으로 본다(설계 9.5).
9. **다시 실린 이름.** 세션 안에서 실린 목록에서 빠졌다가 다시 실린 스킬(`isInitial`이 참인 새 목록에 없던 이름)과 MCP 서버(`removedNames`에 든 이름. 그 전에 더해진 것을 봤는지와 상관없다)를 다시 실린 날짜의 칸에 적는다. E5·E6의 ㉱를 2단계가 요약만으로 판정하려는 것이다(설계 9.3, 11.3).
10. **절반 넘게 깨진 파일.** 빈 줄을 뺀 줄의 수(너무 긴 줄과 끝 조각을 넣는다)의 절반을 깨진 줄이 넘으면 그 파일을 읽지 못한 파일로 센다. 풀린 줄의 숫자는 그대로 쓴다(설계 20.1, 9.8).
11. **기록이 있는 가장 이른 날짜.** 세션마다, 종류와 상관없이 맨 바깥 `timestamp`가 읽히는 줄 가운데 가장 이른 날짜를 둔다. 달력의 볼 수 있는 날짜 범위에만 쓴다(설계 9.3, 9.8).
12. **세션의 처음 목록.** 세션마다 스킬은 첫 `isInitial` 목록의 이름, MCP 서버는 첫 응답 줄을 읽기 바로 앞에 실려 있던 이름을 둔다. 없으면 `null`이다. 세션 사이의 빠짐(앞 세션에 실렸고 다음 세션의 처음 목록에 없음)을 2단계가 보려는 것이다. 날짜별 이름은 그날의 합집합이라 처음 목록이 지워진다(설계 9.3, 11.3 ㉱).
13. **읽지 못한 것은 파일과 폴더로 나눈다.** 파일 수 기준 비율의 분모는 목록에 있는 파일(크기를 보지 못한 것도 넣는다), 바이트 기준의 분모는 크기를 아는 파일이다. 그래서 비율이 1을 넘지 않는다. 목록을 읽지 못한 폴더나 크기를 모르는 파일이 있으면 그 비율은 아래 경계다(설계 9.8, 20.1).

계획 리뷰 1차에서 설계와 상관없이 고친 것도 있다. 이름(스킬·서버·모델 등)을 열쇠로 쓰는 기록은 원형 없는 객체(`nameRecord`)로 만들어 `constructor`, `__proto__` 같은 이름이 숫자를 깨지 않게 했다. 캐시에서 꺼낸 요약은 모양을 검사해(`reviveSummary`) 모양이 다르면 원본을 다시 읽는다. 응답 상태는 숫자 배열에 담고(`ResponseTable`), 여러 조각에 걸친 줄은 한 버퍼를 다시 써서 모아 메모리를 묶었다. 묶음의 네트워크 검사는 esbuild의 metafile로 가져오기를 본다.

## 파일 구조

| 파일 | 맡는 일 |
|---|---|
| `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitattributes`, `LICENSE` | 저장소 뼈대 |
| `scripts/bundle-options.mjs` | 묶기 설정(빌드와 묶음 검사가 같이 씀) |
| `scripts/build.mjs` | `skills/aq/scripts/aq.mjs`를 만든다 |
| `scripts/check-bundle.mjs` | 다시 묶은 결과가 저장소의 묶음과 같은지, 네트워크를 부르는 곳이 없는지 본다 |
| `scripts/bundle-scan.mjs`, `scripts/bundle-scan.d.mts` | 네트워크 검사의 몸통(가져오기는 metafile로, 전역 호출은 글자로)과 그 타입 선언 |
| `scripts/run-ts.mjs`, `scripts/dev-summary.ts` | 개발용. 이 PC의 기록으로 합계와 속도를 잰다(저장소에 결과를 남기지 않음) |
| `src/version.ts` | 프로그램 버전 |
| `src/cli.ts`, `src/entry.ts` | 명령 입구(Node.js 버전 확인, 하위 명령 나누기), 묶음의 시작점 |
| `src/commands/doctor.ts` | `aq doctor` |
| `src/adapters/types.ts` | 날짜별 세션 요약의 모양, 캐시에서 꺼낸 값을 그 모양으로 되살리는 검사 |
| `src/adapters/common/dates.ts` | 현지 날짜, 점수 구간과 수집 구간 |
| `src/adapters/common/version.ts` | 버전 읽기·견주기·가장 높은 것 |
| `src/adapters/common/hash.ts` | 64비트 FNV-1a 지문 |
| `src/adapters/common/canonical.ts` | 이름 기록(원형 없는 객체)과 열쇠 차례 고정 |
| `src/adapters/common/outer-type.ts` | 깨진 줄의 맨 바깥 `type` 읽기 |
| `src/adapters/common/lines.ts` | 파일을 한 줄씩 흘려 읽기(파일을 여는 부분) |
| `src/adapters/claude/classify.ts` | `user` 줄 판별, 끊은 표지와 슬래시 명령 알아보기, 거절 가르기 |
| `src/adapters/claude/responses.ts` | 응답 ID마다의 상태를 숫자 배열에 담는 표 |
| `src/adapters/claude/parser.ts` | 줄 해석 → 날짜별 세션 요약 |
| `src/adapters/claude/locate.ts` | 기록 폴더와 세션 파일 목록(파일을 여는 부분) |
| `src/adapters/claude/observation.ts` | 관측 범위(9.7), 관측이 빠짐없는지(9.8), 절반 넘게 깨진 파일인지(20.1) |
| `src/state/cache.ts` | 캐시 열쇠, 꺼내기, 넣기 |
| `src/collect/claude.ts` | 목록 → 캐시 또는 읽기 → 요약 목록과 읽은 양 |
| `scripts/measure-collect.ts` | 시험용. 큰 합성 기록을 읽고 최대 상주 메모리를 잰다 |
| `test/**` | 시험. `test/helpers/claude-lines.ts`가 합성 기록 줄을 만든다 |

설계 7.1의 원본 폴더 목록(`core/`, `adapters/`, `scan/`, `report/`, `state/`, `text/`)에 둘을 더했다. `collect/`는 어댑터와 캐시를 묶어 부르는 곳이고(파일을 열므로 `core/`에 둘 수 없다), `commands/`는 하위 명령의 몸통이다. 설계 7.3의 어댑터 공통 모양(`id`, `detect`, `listFiles`, `parse`, `coverage`, `scanSetup`을 가진 객체)은 두 번째 도구가 들어오는 5단계에서 묶는다. 1단계는 같은 일을 하는 함수들(`claudeHome`, `listClaudeFiles`, `ClaudeSessionParser`, `CLAUDE_COVERAGE`)로 낸다.

---

### Task 1: 저장소 뼈대와 명령 입구

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitattributes`, `LICENSE`, `scripts/bundle-options.mjs`, `scripts/build.mjs`, `scripts/bundle-scan.mjs`, `scripts/bundle-scan.d.mts`, `scripts/check-bundle.mjs`, `src/version.ts`, `src/cli.ts`, `src/entry.ts`, `skills/aq/scripts/aq.mjs`(빌드 결과)
- Test: `test/cli.test.ts`, `test/scripts/bundle-scan.test.ts`

**Interfaces:**
- Produces: `main(argv: string[]): Promise<number>`(종료 코드), `nodeMajorOk(version: string): boolean`, `PROGRAM_VERSION: string`, `bannedImports(metafile): string[]`, `bannedGlobals(code: string): string[]`
- 네트워크 검사가 보장하는 것. 가져오기(정적 `import`, 문자열로 정한 동적 `import()`, `require`)는 `node:` 접두와 하위 경로에 상관없이 esbuild의 metafile로 본다. 전역 이름(`fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource`)은 호출이 아니어도(선택적 호출 `fetch?.(`, 다른 이름으로 받아 두기, `globalThis["fetch"]`) 묶은 글에 그 낱말이 보이면 건다. 경로를 글자로 정하지 않은 동적 가져오기(`import(이름)`)도 `import(` 글자로 건다. 그래서 묶음에는 동적 가져오기를 두지 않는다. 글자 검사는 보수적이어서 문자열이나 주석 속의 같은 낱말도 걸린다. 걸리면 그 문구를 바꾼다. 보지 않는 것은 글자를 이어 붙여 만든 이름(예. `"fe" + "tch"`)과 다른 프로그램을 띄워 통신하는 길(예. 자식 프로세스)이다.

- [ ] **Step 1: 작업 브랜치를 딴다**

```bash
cd C:/dev/chunsik-garage
git switch develop
git pull --ff-only
git switch -c 1단계-클로드코드-기록읽기
```

- [ ] **Step 2: `package.json`을 만들고 개발 의존성을 깐다**

```json
{
  "name": "chunsik-garage",
  "version": "0.1.0",
  "description": "AQ checkup for Claude Code and Codex: scores how well you set up and use your AI coding tools, computed on your own PC.",
  "license": "MIT",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "repository": { "type": "git", "url": "https://github.com/yeunlee1/chunsik-garage.git" },
  "scripts": {
    "build": "node scripts/build.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check": "npm run typecheck && npm test && node scripts/check-bundle.mjs"
  }
}
```

```bash
npm install --save-dev typescript esbuild vitest @types/node@22
```

Expected: `package-lock.json`이 생기고 `devDependencies`에 네 개가 들어간다. 버전은 설치할 때의 최신으로 둔다.

- [ ] **Step 3: 설정 파일과 라이선스를 만든다**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test", "scripts/**/*.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], pool: "forks" },
});
```

`.gitattributes`:

```
* text=auto eol=lf
*.png binary
*.webp binary
```

`LICENSE`(코드의 라이선스. 그림의 이용 조건은 3단계에서 `ART-LICENSE.md`로 따로 둔다, 설계 7.1):

```
MIT License

Copyright (c) 2026 yeunlee1

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: 실패하는 시험을 쓴다**

`test/cli.test.ts`:

```ts
// 명령 입구의 Node.js 버전 확인과 하위 명령 나누기를 시험한다
import { describe, expect, it } from "vitest";
import { main, nodeMajorOk } from "../src/cli.ts";

describe("nodeMajorOk", () => {
  it("22 이상만 받는다", () => {
    expect(nodeMajorOk("v22.0.0")).toBe(true);
    expect(nodeMajorOk("v24.18.0")).toBe(true);
    expect(nodeMajorOk("v20.11.1")).toBe(false);
    expect(nodeMajorOk("garbage")).toBe(false);
  });
});

describe("main", () => {
  it("--version은 0을 돌려준다", async () => {
    expect(await main(["--version"])).toBe(0);
  });
  it("모르는 명령은 64를 돌려준다", async () => {
    expect(await main(["nope"])).toBe(64);
  });
});
```

- [ ] **Step 5: 시험이 실패하는지 본다**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL. `../src/cli.ts`를 찾지 못한다는 오류(Vitest 버전에 따라 `Cannot find module` 또는 `Failed to resolve import`).

- [ ] **Step 6: 명령 입구를 만든다**

`src/version.ts`:

```ts
// 프로그램 버전. package.json과 같아야 한다(4단계에서 매니페스트까지 맞추는 검사를 붙인다)
export const PROGRAM_VERSION = "0.1.0";
```

`src/cli.ts`:

```ts
// aq 명령의 입구. Node.js 버전을 확인하고 하위 명령으로 나눠 보낸다
import { PROGRAM_VERSION } from "./version.ts";

export function nodeMajorOk(version: string): boolean {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}

export async function main(argv: string[]): Promise<number> {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).\n`);
    return 2;
  }
  const [command] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}\n`);
    return 0;
  }
  process.stderr.write(`Unknown command: ${command ?? "(none)"}\n`);
  return 64;
}
```

`src/entry.ts`:

```ts
// 묶은 실행 파일의 시작점. 명령 입구를 돌리고 종료 코드를 넘긴다
import { main } from "./cli.ts";

process.exitCode = await main(process.argv.slice(2));
```

- [ ] **Step 7: 시험과 타입 검사가 통과하는지 본다**

Run: `npx vitest run test/cli.test.ts` → PASS(3개).
Run: `npx tsc --noEmit` → 출력 없음.

- [ ] **Step 8: 네트워크 검사의 시험을 쓴다**

`test/scripts/bundle-scan.test.ts`:

```ts
// 묶음의 네트워크 검사가 node: 접두 없는 가져오기, 동적 가져오기, require, 전역 호출을 잡는지와 보수적인 한계를 시험한다(설계 2, 21.1)
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { bannedGlobals, bannedImports } from "../../scripts/bundle-scan.mjs";

async function scan(contents: string): Promise<{ imports: string[]; globals: string[] }> {
  const result = await build({
    stdin: { contents, loader: "ts", resolveDir: process.cwd() },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  return { imports: bannedImports(result.metafile), globals: bannedGlobals(result.outputFiles[0]!.text) };
}

describe("묶음의 네트워크 검사", () => {
  it("node: 접두가 없는 가져오기와 하위 경로도 잡는다", async () => {
    expect((await scan('import https from "https"; console.log(typeof https);')).imports).toEqual(["import-statement:https"]);
    expect((await scan('import { lookup } from "node:dns/promises"; console.log(typeof lookup);')).imports).toEqual(["import-statement:node:dns/promises"]);
  });
  it("문자열로 정한 동적 가져오기와 require도 잡는다", async () => {
    expect((await scan('const m = await import("node:https"); console.log(typeof m);')).imports).toEqual(["dynamic-import:node:https"]);
    expect((await scan('const h = require("http2"); console.log(typeof h);')).imports).toEqual(["require-call:http2"]);
  });
  it("전역 fetch를 호출하는 여러 꼴과 경로를 글자로 정하지 않은 동적 가져오기를 잡고, 파일을 읽는 내장 모듈은 통과시킨다", async () => {
    for (const code of ['await fetch("x");', 'await fetch?.("x");', "const f = fetch; await f(\"x\");", 'await globalThis["fetch"]("x");']) {
      expect((await scan(code)).globals).toEqual([String(/\bfetch\b/)]);
    }
    expect((await scan('const name = "node:https"; const m = await import(name); console.log(typeof m);')).globals).toEqual([String(/\bimport\s*\(/)]);
    expect(await scan('import { readFile } from "node:fs/promises"; console.log(typeof readFile);')).toEqual({ imports: [], globals: [] });
  });
  it("글자 검사는 보수적이다. 문자열 속의 같은 글자도 걸리므로 그런 문구는 쓰지 않는다", async () => {
    expect((await scan('console.log("docs fetch(");')).globals).toHaveLength(1);
  });
});
```

- [ ] **Step 9: 시험이 실패하는지 본다**

Run: `npx vitest run test/scripts/bundle-scan.test.ts`
Expected: FAIL. `../../scripts/bundle-scan.mjs`를 찾지 못한다는 오류.

- [ ] **Step 10: 네트워크 검사, 묶기 설정, 묶음 검사를 만든다**

`scripts/bundle-scan.mjs`:

```js
// 묶은 결과에 네트워크를 부르는 곳이 있는지 본다. 가져오기는 esbuild의 metafile로(정적·동적·require, node: 접두와 상관없이), 전역 이름과 경로를 글자로 정하지 않은 동적 가져오기는 글자로 본다(글자 검사는 보수적이라 문자열 속 같은 글자도 걸린다)
export const BANNED_MODULES = ["dgram", "dns", "http", "http2", "https", "net", "tls"];
/** fetch는 호출이 아니어도(선택적 호출, 다른 이름으로 받아 두기, globalThis["fetch"]) 이름이 보이면 건다. 묶음에는 동적 가져오기를 두지 않는다. */
export const BANNED_GLOBALS = [/\bfetch\b/, /\bWebSocket\b/, /\bXMLHttpRequest\b/, /\bEventSource\b/, /\bimport\s*\(/];

/** metafile의 출력이 가져오는 것 가운데 금지한 내장 모듈. "종류:경로"의 목록이다. */
export function bannedImports(metafile) {
  const found = new Set();
  for (const output of Object.values(metafile.outputs)) {
    for (const item of output.imports) {
      const name = item.path.replace(/^node:/, "").split("/")[0];
      if (BANNED_MODULES.includes(name)) found.add(`${item.kind}:${item.path}`);
    }
  }
  return [...found].sort();
}

/** 묶은 글에서 걸리는 전역 이름의 정규식 목록. */
export function bannedGlobals(code) {
  return BANNED_GLOBALS.filter((pattern) => pattern.test(code)).map(String);
}
```

`scripts/bundle-scan.d.mts`(시험이 TypeScript에서 가져다 쓰려고 둔다. `scripts/**/*.ts`에 들지 않지만 가져올 때 TypeScript가 찾는다):

```ts
// bundle-scan.mjs의 타입 선언. 시험(TypeScript)이 가져다 쓴다
import type { Metafile } from "esbuild";

export declare const BANNED_MODULES: readonly string[];
export declare const BANNED_GLOBALS: readonly RegExp[];
export declare function bannedImports(metafile: Metafile): string[];
export declare function bannedGlobals(code: string): string[];
```

`scripts/bundle-options.mjs`:

```js
// 묶은 실행 파일을 만드는 esbuild 설정. build와 check-bundle이 같이 쓴다
export const BUNDLE_PATH = "skills/aq/scripts/aq.mjs";

export const bundleOptions = {
  entryPoints: ["src/entry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  legalComments: "inline",
  banner: { js: "// 춘식이 정비소 AQ 점검 실행 파일. src/를 묶은 빌드 결과라 직접 고치지 않는다." },
  logLevel: "warning",
};
```

`scripts/build.mjs`:

```js
// 원본(src)을 묶어 skills/aq/scripts/aq.mjs를 만든다
import { build } from "esbuild";
import { BUNDLE_PATH, bundleOptions } from "./bundle-options.mjs";

await build({ ...bundleOptions, outfile: BUNDLE_PATH });
console.log(`묶음 완료: ${BUNDLE_PATH}`);
```

`scripts/check-bundle.mjs`:

```js
// 원본으로 다시 묶은 결과가 저장소의 aq.mjs와 같은지, 묶은 파일이 네트워크를 부르지 않는지 본다
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { BUNDLE_PATH, bundleOptions } from "./bundle-options.mjs";
import { bannedGlobals, bannedImports } from "./bundle-scan.mjs";

const result = await build({ ...bundleOptions, outfile: BUNDLE_PATH, write: false, metafile: true });
const fresh = result.outputFiles[0].text;
const committed = readFileSync(BUNDLE_PATH, "utf8").replace(/\r\n/g, "\n");
let failed = false;
if (fresh !== committed) {
  console.error("aq.mjs가 원본으로 다시 묶은 결과와 다르다. npm run build 뒤에 커밋한다.");
  failed = true;
}
for (const found of [...bannedImports(result.metafile), ...bannedGlobals(fresh)]) {
  console.error(`묶은 파일에 네트워크를 부르는 곳이 있다: ${found}`);
  failed = true;
}
if (failed) process.exit(1);
console.log("묶음 검사 통과");
```

- [ ] **Step 11: 묶고 돌려 본다**

Run: `npx vitest run test/scripts/bundle-scan.test.ts` → PASS(4개).
Run: `npm run build` → `묶음 완료: skills/aq/scripts/aq.mjs`
Run: `node skills/aq/scripts/aq.mjs --version` → `0.1.0`
Run: `npm run check` → 타입 검사 통과, 시험 7개 통과(명령 입구 3, 네트워크 검사 4), `묶음 검사 통과`

- [ ] **Step 12: 커밋한다**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitattributes LICENSE scripts/bundle-options.mjs scripts/build.mjs scripts/bundle-scan.mjs scripts/bundle-scan.d.mts scripts/check-bundle.mjs src/version.ts src/cli.ts src/entry.ts test/cli.test.ts test/scripts/bundle-scan.test.ts skills/aq/scripts/aq.mjs
git commit -m "chore: 저장소 뼈대와 명령 입구 추가"
```

---

### Task 2: 현지 날짜와 구간

**Files:**
- Create: `src/adapters/common/dates.ts`
- Test: `test/adapters/common/dates.test.ts`

**Interfaces:**
- Produces: `type LocalDate = string`(`YYYY-MM-DD`), `SCORE_WINDOW_DAYS = 30`, `COLLECT_WINDOW_DAYS = 35`, `localDateOf(epochMs: number, timeZone: string): LocalDate`, `localDateOfIso(iso: unknown, timeZone: string): LocalDate | null`, `interface Windows { today; scoreDates; collectDates; collectStartLowerBoundMs }`, `makeWindows(nowMs: number, timeZone: string): Windows`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/common/dates.test.ts`:

```ts
// 현지 날짜 바꾸기와 점수·수집 구간 계산을 시험한다
import { describe, expect, it } from "vitest";
import { localDateOf, localDateOfIso, makeWindows } from "../../../src/adapters/common/dates.ts";

const ms = (iso: string): number => Date.parse(iso);

describe("localDateOf", () => {
  it("서울(+9)의 자정 경계", () => {
    expect(localDateOf(ms("2026-11-11T14:59:59Z"), "Asia/Seoul")).toBe("2026-11-11");
    expect(localDateOf(ms("2026-11-11T15:00:00Z"), "Asia/Seoul")).toBe("2026-11-12");
  });
  it("카트만두(+5:45)처럼 15분 단위의 시차도 맞다", () => {
    expect(localDateOf(ms("2026-11-11T18:14:59Z"), "Asia/Kathmandu")).toBe("2026-11-11");
    expect(localDateOf(ms("2026-11-11T18:15:00Z"), "Asia/Kathmandu")).toBe("2026-11-12");
  });
  it("뉴욕의 서머타임이 끝나는 날 앞뒤", () => {
    expect(localDateOf(ms("2026-11-01T03:59:59Z"), "America/New_York")).toBe("2026-10-31");
    expect(localDateOf(ms("2026-11-01T04:00:00Z"), "America/New_York")).toBe("2026-11-01");
    expect(localDateOf(ms("2026-11-02T04:59:59Z"), "America/New_York")).toBe("2026-11-01");
    expect(localDateOf(ms("2026-11-02T05:00:00Z"), "America/New_York")).toBe("2026-11-02");
  });
  it("읽지 못하는 시각은 null", () => {
    expect(localDateOfIso("nope", "UTC")).toBeNull();
    expect(localDateOfIso(undefined, "UTC")).toBeNull();
    expect(localDateOfIso("2026-11-12T00:00:00Z", "UTC")).toBe("2026-11-12");
  });
});

describe("makeWindows", () => {
  it("수집 35개, 점수 30개이고 마지막 날이 오늘이다", () => {
    const w = makeWindows(ms("2026-11-12T03:00:00Z"), "Asia/Seoul");
    expect(w.today).toBe("2026-11-12");
    expect(w.collectDates).toHaveLength(35);
    expect(w.scoreDates).toHaveLength(30);
    expect(w.collectDates[0]).toBe("2026-10-09");
    expect(w.collectDates[34]).toBe("2026-11-12");
    expect(w.scoreDates[0]).toBe("2026-10-14");
  });
  it("수정 시각으로 거르는 아래 경계는 첫날 UTC 자정보다 14시간 앞이다", () => {
    const w = makeWindows(ms("2026-11-12T03:00:00Z"), "Asia/Seoul");
    expect(w.collectStartLowerBoundMs).toBe(Date.UTC(2026, 9, 9) - 14 * 3600 * 1000);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/common/dates.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/common/dates.ts`:

```ts
// 시각을 평가 시간대의 현지 날짜로 바꾸고, 점수 구간(30개 날짜)과 수집 구간(35개 날짜)을 만든다(순수 함수, 설계 9.3)
export type LocalDate = string;

export const SCORE_WINDOW_DAYS = 30;
export const COLLECT_WINDOW_DAYS = 35;

const QUARTER_MS = 15 * 60 * 1000;
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;
const formatters = new Map<string, Intl.DateTimeFormat>();
const quarterDates = new Map<string, LocalDate>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** epoch 밀리초를 그 시간대의 YYYY-MM-DD로 바꾼다. 실제 시간대의 차이는 모두 15분의 배수라서 15분 칸마다 한 번만 계산한다. */
export function localDateOf(epochMs: number, timeZone: string): LocalDate {
  const quarter = Math.floor(epochMs / QUARTER_MS);
  const key = `${timeZone}|${quarter}`;
  const cached = quarterDates.get(key);
  if (cached !== undefined) return cached;
  const parts = formatterFor(timeZone).formatToParts(new Date(quarter * QUARTER_MS));
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  quarterDates.set(key, date);
  return date;
}

/** ISO 시각 문자열을 현지 날짜로 바꾼다. 읽지 못하면 null이다. */
export function localDateOfIso(iso: unknown, timeZone: string): LocalDate | null {
  if (typeof iso !== "string") return null;
  const epochMs = Date.parse(iso);
  return Number.isFinite(epochMs) ? localDateOf(epochMs, timeZone) : null;
}

function shiftDate(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface Windows {
  today: LocalDate;
  /** 오래된 날짜부터. 마지막이 오늘이다. */
  scoreDates: LocalDate[];
  /** 오래된 날짜부터. 마지막이 오늘이다. */
  collectDates: LocalDate[];
  /** 수집 구간 첫날이 시작하는 순간보다 늦지 않은 epoch 밀리초. 파일 수정 시각으로 거를 때 쓰고, 넉넉하게 14시간 앞으로 잡는다. */
  collectStartLowerBoundMs: number;
}

export function makeWindows(nowMs: number, timeZone: string): Windows {
  const today = localDateOf(nowMs, timeZone);
  const span = (count: number): LocalDate[] => Array.from({ length: count }, (_, i) => shiftDate(today, i - (count - 1)));
  const collectDates = span(COLLECT_WINDOW_DAYS);
  const [y, m, d] = collectDates[0]!.split("-").map(Number) as [number, number, number];
  return {
    today,
    scoreDates: span(SCORE_WINDOW_DAYS),
    collectDates,
    collectStartLowerBoundMs: Date.UTC(y, m - 1, d) - MAX_UTC_OFFSET_MS,
  };
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/adapters/common/dates.test.ts` → PASS(6개).

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/common/dates.ts test/adapters/common/dates.test.ts
git commit -m "feat: 현지 날짜와 점수·수집 구간 계산 추가"
```

---

### Task 3: 버전 읽기와 견주기

**Files:**
- Create: `src/adapters/common/version.ts`
- Test: `test/adapters/common/version.test.ts`

**Interfaces:**
- Produces: `type Version = readonly [number, number, number]`, `parseVersion(text: unknown): Version | null`, `compareVersions(a: Version, b: Version): number`, `formatVersion(v: Version): string`, `maxVersion(values: Iterable<unknown>): string | null`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/common/version.test.ts`:

```ts
// 도구 버전 읽기와 견주기, 가장 높은 버전 고르기를 시험한다(설계 9.3)
import { describe, expect, it } from "vitest";
import { compareVersions, maxVersion, parseVersion } from "../../../src/adapters/common/version.ts";

describe("version", () => {
  it("글자가 아니라 숫자로 견준다", () => {
    expect(compareVersions(parseVersion("2.1.99")!, parseVersion("2.1.257")!)).toBeLessThan(0);
  });
  it("세 숫자 꼴이 아니면 읽지 못한 것이다", () => {
    expect(parseVersion("2.1")).toBeNull();
    expect(parseVersion("2.1.3-beta")).toBeNull();
    expect(parseVersion(5)).toBeNull();
  });
  it("가장 높은 것을 고르고 읽지 못한 것은 뺀다", () => {
    expect(maxVersion(["2.1.250", null, "x", "2.1.300"])).toBe("2.1.300");
  });
  it("앞자리가 큰 쪽이 높다", () => {
    expect(maxVersion(["9.9.9", "10.0.0"])).toBe("10.0.0");
  });
  it("읽을 수 있는 것이 하나도 없으면 null(버전 모름)", () => {
    expect(maxVersion(["", undefined])).toBeNull();
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/common/version.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/common/version.ts`:

```ts
// 도구 버전 문자열을 세 숫자로 읽어 견주고, 여럿 가운데 가장 높은 것을 고른다(순수 함수, 설계 9.3)
export type Version = readonly [number, number, number];

export function parseVersion(text: unknown): Version | null {
  if (typeof text !== "string") return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    const diff = a[i]! - b[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

export function formatVersion(version: Version): string {
  return `${version[0]}.${version[1]}.${version[2]}`;
}

/** 읽을 수 있는 버전 가운데 가장 높은 것. 하나도 없으면 null(버전 모름)이다. */
export function maxVersion(values: Iterable<unknown>): string | null {
  let best: Version | null = null;
  for (const value of values) {
    const version = parseVersion(value);
    if (version !== null && (best === null || compareVersions(version, best) > 0)) best = version;
  }
  return best === null ? null : formatVersion(best);
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/adapters/common/version.test.ts` → PASS(5개).

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/common/version.ts test/adapters/common/version.test.ts
git commit -m "feat: 도구 버전 읽기와 견주기 추가"
```

---

### Task 4: 깨진 줄의 맨 바깥 종류 읽기

**Files:**
- Create: `src/adapters/common/outer-type.ts`
- Test: `test/adapters/common/outer-type.test.ts`

**Interfaces:**
- Produces: `outerTypeOf(text: string): string | null`. 줄의 처음부터 중첩을 따라가며 맨 바깥 객체의 `type` 값이 온전히 읽힐 때만 돌려준다. 줄 어딘가의 `"type"` 글자를 찾는 것이 아니다(설계 9.8).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/common/outer-type.test.ts`:

```ts
// 깨졌거나 잘린 JSON 줄에서 맨 바깥 type을 읽는 것을 시험한다(설계 9.8)
import { describe, expect, it } from "vitest";
import { outerTypeOf } from "../../../src/adapters/common/outer-type.ts";

describe("outerTypeOf", () => {
  it("앞에 type이 있으면 뒤가 잘려도 읽는다", () => {
    expect(outerTypeOf('{"type":"system","subtype":"compa')).toBe("system");
  });
  it("중첩된 type은 맨 바깥 type이 아니다", () => {
    expect(outerTypeOf('{"message":{"type":"user"},"type":"assistant","x":')).toBe("assistant");
  });
  it("맨 바깥 type이 나오기 전에 잘리면 null", () => {
    expect(outerTypeOf('{"message":{"content":[{"type":"tool_use","name":"Sk')).toBeNull();
  });
  it("문자열 안의 type 글자에 속지 않는다", () => {
    expect(outerTypeOf('{"a":"\\"type\\":\\"system\\"","type":"user"}')).toBe("user");
  });
  it("type 값이 잘리면 null", () => {
    expect(outerTypeOf('{"type":"sys')).toBeNull();
  });
  it("객체가 아니면 null", () => {
    expect(outerTypeOf('["type","system"]')).toBeNull();
  });
  it("type이 문자열이 아니면 null", () => {
    expect(outerTypeOf('{"type":5}')).toBeNull();
  });
  it("숫자 값 바로 뒤에서 잘리면 null", () => {
    expect(outerTypeOf('{"n":12')).toBeNull();
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/common/outer-type.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/common/outer-type.ts`:

```ts
// 깨졌거나 잘린 JSON 줄에서 맨 바깥 객체의 type 값을, 처음부터 중첩을 따라가며 온전히 읽힐 때만 꺼낸다(순수 함수, 설계 9.8)
const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
const LITERAL = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/;

export function outerTypeOf(text: string): string | null {
  const n = text.length;
  let i = 0;

  const skipWhitespace = (): void => {
    while (i < n) {
      const code = text.charCodeAt(i);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) i++;
      else break;
    }
  };

  // i가 여는 따옴표에 있을 때 문자열 하나를 읽는다. 닫는 따옴표까지 읽히지 않으면 null이다.
  const readString = (keep: boolean): string | null => {
    i++;
    let out = "";
    while (i < n) {
      const ch = text[i]!;
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\\") {
        if (i + 1 >= n) return null;
        const escape = text[i + 1]!;
        if (escape === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
          if (keep) out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          continue;
        }
        const simple = SIMPLE_ESCAPES[escape];
        if (simple === undefined) return null;
        if (keep) out += simple;
        i += 2;
        continue;
      }
      if (keep) out += ch;
      i++;
    }
    return null;
  };

  // 값 하나를 건너뛴다. 잘렸거나 모양이 틀리면 false다.
  const skipValue = (): boolean => {
    skipWhitespace();
    if (i >= n) return false;
    const ch = text[i]!;
    if (ch === '"') return readString(false) !== null;
    if (ch === "{" || ch === "[") {
      let depth = 0;
      while (i < n) {
        const c = text[i]!;
        if (c === '"') {
          if (readString(false) === null) return false;
          continue;
        }
        if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            i++;
            return true;
          }
        }
        i++;
      }
      return false;
    }
    const literal = LITERAL.exec(text.slice(i, i + 400));
    if (literal === null) return false;
    i += literal[0].length;
    skipWhitespace();
    return i < n; // 값 뒤에 무엇이 더 와야 잘리지 않은 값이다
  };

  skipWhitespace();
  if (text[i] !== "{") return null;
  i++;
  for (;;) {
    skipWhitespace();
    if (i >= n || text[i] !== '"') return null;
    const key = readString(true);
    if (key === null) return null;
    skipWhitespace();
    if (text[i] !== ":") return null;
    i++;
    skipWhitespace();
    if (key === "type") return text[i] === '"' ? readString(true) : null;
    if (!skipValue()) return null;
    skipWhitespace();
    if (text[i] === ",") {
      i++;
      continue;
    }
    return null; // type 없이 끝났거나 모양이 틀렸다
  }
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/adapters/common/outer-type.test.ts` → PASS(8개).

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/common/outer-type.ts test/adapters/common/outer-type.test.ts
git commit -m "feat: 깨진 줄의 맨 바깥 종류 읽기 추가"
```

---

### Task 5: 기록 파일을 한 줄씩 흘려 읽기

**Files:**
- Create: `src/adapters/common/lines.ts`
- Test: `test/adapters/common/lines.test.ts`

**Interfaces:**
- Produces: `MAX_LINE_BYTES = 16 * 1024 * 1024`, `IN_PROGRESS_WINDOW_MS = 2000`, `interface LineSink { line(text: string): void; tooLong(): void }`, `interface ReadOutcome { sizeAtOpen; mtimeMsAtOpen; bytesRead; tail: string | null; inProgress: boolean }`, `interface ReadOptions { maxLineBytes?; chunkBytes?; afterOpen?: () => Promise<void> }`, `readLines(path: string, nowMs: number, sink: LineSink, options?: ReadOptions): Promise<ReadOutcome>`
- 줄은 바이트로, 줄바꿈 글자(LF, 0x0A) 하나로만 가른다(설계 9.4). 본문 안의 U+2028·U+2029나 홀로 있는 `\r`에서는 가르지 않는다. Node.js의 `readline`은 U+2028·U+2029에서도 줄을 쪼개므로 쓰지 않는다. 여러 바이트 글자가 조각 경계에 걸려도 깨지지 않는다. 조각 하나 안에서 끝난 줄은 복사하지 않고 바로 풀고, 조각을 넘는 줄만 모으는 버퍼 하나(필요할 때 두 배씩, 상한까지만 키운다)에 모은다. 너무 긴 줄을 버릴 때도 그 버퍼를 다시 써서 메모리가 줄마다 쌓이지 않는다(설계 22). 줄 끝의 `\r`은 뗀다. 줄바꿈 없는 끝 조각은 `sink`로 보내지 않고 `tail`로 돌려준다. 끝 조각을 어떻게 셀지는 진행 중인지에 따라 해석부가 정한다(설계 9.4의 줄 표).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/common/lines.test.ts`:

```ts
// 줄 읽기(줄 가르기, 끝 조각, 너무 긴 줄, 연 크기까지만 읽기, 진행 중 판정)를 시험한다(설계 9.4)
import { appendFile, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLines, type ReadOptions } from "../../../src/adapters/common/lines.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aq-lines-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const OLD = Date.parse("2026-01-01T00:00:00Z");

async function fileWith(name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content);
  await utimes(path, OLD / 1000, OLD / 1000);
  return path;
}

async function read(path: string, nowMs: number, options: ReadOptions = {}) {
  const lines: string[] = [];
  let tooLong = 0;
  const outcome = await readLines(path, nowMs, { line: (t) => lines.push(t), tooLong: () => { tooLong++; } }, options);
  return { lines, tooLong, outcome };
}

describe("readLines", () => {
  it("줄을 가르고 끝의 \\r을 뗀다. 빈 줄도 넘긴다", async () => {
    const r = await read(await fileWith("a.jsonl", "a\r\nb\n\nc\n"), Date.now());
    expect(r.lines).toEqual(["a", "b", "", "c"]);
    expect(r.outcome.tail).toBeNull();
    expect(r.outcome.inProgress).toBe(false);
  });
  it("줄바꿈 없는 끝 조각은 tail로 돌려준다", async () => {
    const r = await read(await fileWith("b.jsonl", 'a\n{"x":1}'), Date.now());
    expect(r.lines).toEqual(["a"]);
    expect(r.outcome.tail).toBe('{"x":1}');
  });
  it("상한을 넘는 줄은 tooLong으로 세고 다음 줄은 읽는다", async () => {
    const path = await fileWith("c.jsonl", `${"x".repeat(50)}\nok\n${"y".repeat(50)}`);
    const r = await read(path, Date.now(), { maxLineBytes: 10, chunkBytes: 16 });
    expect(r.lines).toEqual(["ok"]);
    expect(r.tooLong).toBe(2);
    expect(r.outcome.tail).toBeNull();
  });
  it("줄은 LF로만 가른다. 본문 안의 U+2028, U+2029, 홀로 있는 \\r에서는 가르지 않는다", async () => {
    const one = '{"type":"user","message":{"content":"a\u2028b\u2029c\rd"}}';
    const r = await read(await fileWith("u.jsonl", `${one}\nnext\n`), Date.now(), { chunkBytes: 8 });
    expect(r.lines).toEqual([one, "next"]);
  });
  it("여러 바이트 글자가 조각 경계에 걸려도 깨지지 않는다", async () => {
    const r = await read(await fileWith("d.jsonl", "가나다라마바사\n"), Date.now(), { chunkBytes: 4 });
    expect(r.lines).toEqual(["가나다라마바사"]);
  });
  it("조각보다 훨씬 긴 줄도 온전히 읽고, 너무 긴 줄 뒤의 줄도 바르게 읽는다", async () => {
    const long = "가".repeat(70_000);
    const path = await fileWith("g.jsonl", `${long}\n${"z".repeat(400_000)}\nok\n`);
    const r = await read(path, Date.now(), { chunkBytes: 4096, maxLineBytes: 300_000 });
    expect(r.lines).toEqual([long, "ok"]);
    expect(r.tooLong).toBe(1);
  });
  it("연 뒤에 커진 파일은 연 크기까지만 읽고 진행 중이다", async () => {
    const path = await fileWith("e.jsonl", "a\n");
    const r = await read(path, Date.now(), { afterOpen: () => appendFile(path, "b\n") });
    expect(r.lines).toEqual(["a"]);
    expect(r.outcome.inProgress).toBe(true);
  });
  it("수정 시각이 평가 시각에서 2초 안쪽이면 진행 중이다", async () => {
    const r = await read(await fileWith("f.jsonl", "a\n"), OLD + 1000);
    expect(r.outcome.inProgress).toBe(true);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/common/lines.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/common/lines.ts`:

```ts
// 기록 파일을 한 줄씩 흘려 읽는다. 연 순간의 크기까지만 읽고, 너무 긴 줄을 가르고, 줄바꿈 없는 끝 조각을 따로 돌려주며, 진행 중인 파일을 알아낸다(설계 9.4)
import { open, stat } from "node:fs/promises";

export const MAX_LINE_BYTES = 16 * 1024 * 1024;
export const IN_PROGRESS_WINDOW_MS = 2000;

export interface LineSink {
  /** 줄바꿈으로 끝난 줄. 끝의 \r은 뗐다. */
  line(text: string): void;
  /** 상한을 넘은 줄 하나. 풀지 않고 센다. */
  tooLong(): void;
}

export interface ReadOutcome {
  sizeAtOpen: number;
  mtimeMsAtOpen: number;
  bytesRead: number;
  /** 파일 끝의 줄바꿈 없는 조각. 없거나 상한을 넘었으면 null이다. */
  tail: string | null;
  /** 읽는 동안 크기나 수정 시각이 바뀌었거나, 수정 시각이 평가 시각에서 2초 안쪽이다. */
  inProgress: boolean;
}

export interface ReadOptions {
  maxLineBytes?: number;
  chunkBytes?: number;
  /** 시험용. 파일을 연 직후에 부른다. */
  afterOpen?: () => Promise<void>;
}

/** 버퍼의 [start, end)를 UTF-8로 푼다. 끝의 \r은 뗀다. */
function decode(buffer: Buffer, start: number, end: number): string {
  return buffer.toString("utf8", start, end > start && buffer[end - 1] === 0x0d ? end - 1 : end);
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
      for (;;) {
        const newline = view.indexOf(0x0a, start);
        const end = newline === -1 ? view.length : newline;
        if (!skipping) {
          const length = end - start;
          if (carryBytes + length > maxLine) {
            skipping = true;
            carryBytes = 0;
          } else if (newline !== -1 && carryBytes === 0) {
            sink.line(decode(view, start, end)); // 조각 하나 안에서 끝난 줄은 복사하지 않고 바로 푼다
            start = newline + 1;
            continue;
          } else if (length > 0) {
            if (carry.length < carryBytes + length) {
              const grown = Buffer.allocUnsafe(Math.min(maxLine, Math.max(carryBytes + length, carry.length * 2)));
              carry.copy(grown, 0, 0, carryBytes);
              carry = grown;
            }
            view.copy(carry, carryBytes, start, end);
            carryBytes += length;
          }
        }
        if (newline === -1) break;
        if (skipping) {
          sink.tooLong();
          skipping = false;
        } else {
          sink.line(decode(carry, 0, carryBytes));
        }
        carryBytes = 0;
        start = newline + 1;
      }
    }

    let tail: string | null = null;
    if (skipping) sink.tooLong();
    else if (carryBytes > 0) tail = decode(carry, 0, carryBytes);

    const after = await stat(path);
    const inProgress =
      after.size !== sizeAtOpen || after.mtimeMs !== mtimeMsAtOpen || nowMs - mtimeMsAtOpen < IN_PROGRESS_WINDOW_MS;
    return { sizeAtOpen, mtimeMsAtOpen, bytesRead: position, tail, inProgress };
  } finally {
    await handle.close();
  }
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/adapters/common/lines.test.ts` → PASS(8개).

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/common/lines.ts test/adapters/common/lines.test.ts
git commit -m "feat: 기록 파일을 한 줄씩 흘려 읽기 추가"
```

---

### Task 6: 날짜별 세션 요약의 모양, 지문, 열쇠 차례

**Files:**
- Create: `src/adapters/types.ts`, `src/adapters/common/hash.ts`, `src/adapters/common/canonical.ts`
- Test: `test/adapters/types.test.ts`

**Interfaces:**
- Produces:
  - `type ToolId = "claude-code"`(5단계에서 `"codex"`를 더한다), `type SessionKind = "main" | "sub"`
  - `interface TokenCounts { input; cacheRead; cacheWrite; output; thinking }`
  - `interface ToolCounts { calls; results; errors; deniedByUser; deniedByPermission; deniedByHook; interrupted; unknownDenial }`. 도구 이름마다 하나다. MCP 도구는 `mcp__<서버>`로 묶는다. `results`와 `errors`에는 거절·끊김·모르는 표시가 붙은 결과가 들어가지 않는다(설계 9.5 「거절과 끊김」). 셸 도구(`Bash`, `PowerShell`)의 `errors`는 0이 아닌 종료 코드다.
  - `interface SkillSignalCounts { tool; attribution; slash; injected }`(설계 9.5의 신호 1~4)
  - `interface HookCounts { runs; failures; unclassifiedBlocks }`. `unclassifiedBlocks`는 실패 표지가 없어 일부러 막은 것인지 실패해서 막힌 것인지 가릴 수 없는 막음이고, S4의 실행과 실패 어디에도 들지 않는다(설계 9.5 「훅」)
  - `interface DayCell`(아래 코드), `emptyDay(): DayCell`, `canonicalDay(day: DayCell): DayCell`, `emptyToolCounts()`, `emptySkillSignalCounts()`, `emptyHookCounts()`. `DayCell`의 `reloadedSkills`, `reloadedMcpServers`는 세션 안에서 실린 목록에서 빠졌다가 그날 다시 실린 이름이다(설계 9.3, 11.3 ㉱)
  - `interface MissingCounts { lines; brokenLines; tailFragments; tooLongLines; unconfirmedTypes: Record<string, number> }`. `lines`는 빈 줄을 뺀 줄의 수(너무 긴 줄과 끝 조각을 넣는다)이고 설계 20.1 「절반 넘게 풀리지 않으면」의 분모다. `unconfirmedTypes`는 깨진 줄과 끝 조각의 맨 바깥 `type`별 수이고 읽지 못한 것은 `"?"`다.
  - `interface SessionSummary`(아래 코드). `firstDate`는 종류와 상관없이 맨 바깥 `timestamp`가 읽히는 줄 가운데 가장 이른 현지 날짜이고, 달력의 볼 수 있는 범위에만 쓴다(설계 9.8). `initialSkills`, `initialMcpServers`는 세션의 처음 목록이다(과제 10에서 채운다. 그 전에는 `null`)
  - `reviveSummary(value: unknown): SessionSummary | null`. 캐시에서 꺼낸 값이 요약의 모양이면 같은 모양(열쇠 차례와 원형 없는 기록까지)으로 되살리고, 아니면 `null`이다. `DayCell`에 열쇠를 더하면 `DAY_SHAPE`도 더해야 타입 검사를 통과한다
  - `fnv1a64(text: string): string`(16자리 16진수), `nameRecord<T>(): Record<string, T>`(원형 없는 빈 기록), `sortedRecord<T>(record: Record<string, T>): Record<string, T>`(원형 없는 기록을 열쇠 차례로)
- 이름(스킬·서버·도구·모델·종류)을 열쇠로 쓰는 기록은 모두 `nameRecord`로 만든다. 기록이 `{}`로 시작하면 `constructor`, `toString` 같은 이름이 상속된 속성을 읽어 숫자가 글자로 바뀌고, `__proto__`는 아예 저장되지 않는다(계획 리뷰 1차 짝 Codex 2 재현).
- `humanRequests`는 근거가 약한 사람 요청을 포함한 전체이고, `weakHumanRequests`는 그 가운데 근거가 약한 것이다(설계 9.5 판별표 11번 "사람 요청으로 세되 따로 센다").

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/types.test.ts`:

```ts
// 세션 요약의 빈 칸 만들기, 이름 기록, 열쇠 차례 고정, 지문, 캐시에서 꺼낸 값 되살리기를 시험한다
import { describe, expect, it } from "vitest";
import { nameRecord, sortedRecord } from "../../src/adapters/common/canonical.ts";
import { fnv1a64 } from "../../src/adapters/common/hash.ts";
import {
  canonicalDay,
  emptyDay,
  emptyHookCounts,
  emptySkillSignalCounts,
  emptyToolCounts,
  reviveSummary,
  type SessionSummary,
} from "../../src/adapters/types.ts";

const PROTO_NAMES: string[] = ["constructor", "__proto__", "toString"];

describe("fnv1a64", () => {
  it("같은 글은 같은 지문, 다른 글은 다른 지문이고 16자리다", () => {
    expect(fnv1a64("msg_1")).toBe(fnv1a64("msg_1"));
    expect(fnv1a64("msg_1")).not.toBe(fnv1a64("msg_2"));
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("한글")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("nameRecord, sortedRecord, canonicalDay", () => {
  it("열쇠를 사전순으로 세운다", () => {
    expect(Object.keys(sortedRecord({ b: 1, a: 2, c: 3 }))).toEqual(["a", "b", "c"]);
  });
  it("기본 속성과 같은 이름도 보통 열쇠이고 JSON에 그대로 남는다", () => {
    const record = nameRecord<number>();
    PROTO_NAMES.forEach((name, i) => {
      record[name] = (record[name] ?? 0) + i + 1;
    });
    expect(Object.keys(sortedRecord(record))).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.keys(JSON.parse(JSON.stringify(record)) as object).sort()).toEqual(["__proto__", "constructor", "toString"]);
  });
  it("넣은 차례가 달라도 같은 JSON이 나온다", () => {
    const one = emptyDay();
    one.models.zeta = 1;
    one.models.alpha = 2;
    const two = emptyDay();
    two.models.alpha = 2;
    two.models.zeta = 1;
    expect(JSON.stringify(canonicalDay(one))).toBe(JSON.stringify(canonicalDay(two)));
  });
  it("빈 칸은 모두 0이고 목록은 비어 있으며 연결 실패는 거짓이다", () => {
    const day = emptyDay();
    expect(day.humanRequests).toBe(0);
    expect(day.tokens).toEqual({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 });
    expect(day.loadedSkills).toEqual([]);
    expect(day.reloadedMcpServers).toEqual([]);
    expect(day.mcpConnectionFailure).toBe(false);
  });
});

/** 모든 칸에 기본값이 아닌 값을 넣은 요약. 되살리기가 칸 하나라도 빠뜨리면 시험이 잡는다. */
function fullSummary(): SessionSummary {
  const day = emptyDay();
  day.humanRequests = 2;
  day.weakHumanRequests = 1;
  day.nonHumanInputs.meta = 1;
  day.permissionModes.plan = 2;
  day.responses = 3;
  day.tokens = { input: 1, cacheRead: 2, cacheWrite: 3, output: 4, thinking: 5 };
  day.models["claude-a"] = 3;
  day.efforts.high = 2;
  day.unknownEffort = 1;
  day.tools.Bash = { ...emptyToolCounts(), calls: 2, results: 1, errors: 1, deniedByUser: 1 };
  day.unknownDenialKinds["brand-new"] = 1;
  day.autoCompactions = 1;
  day.unknownCompactions = 1;
  day.lengthStops = 1;
  day.interruptedTurns = 1;
  day.subagentCalls = 1;
  day.mcpConnectionFailure = true;
  day.skillSignals.review = { ...emptySkillSignalCounts(), tool: 1, slash: 1 };
  day.mcpCalls.srv = 2;
  day.mcpAttributions.srv = 1;
  day.hooks.PreToolUse = { ...emptyHookCounts(), runs: 2, failures: 1, unclassifiedBlocks: 1 };
  day.loadedSkills = ["review"];
  day.loadedMcpServers = ["srv"];
  day.reloadedSkills = ["review"];
  day.reloadedMcpServers = ["srv"];
  for (const name of PROTO_NAMES) day.models[name] = 1;
  return {
    tool: "claude-code",
    sessionId: "s1",
    kind: "main",
    parentSessionId: null,
    cwd: "C:/work",
    version: "2.1.300",
    firstDate: "2026-11-10",
    days: { "2026-11-11": canonicalDay(day) },
    instructionChars: { ascii: 3, other: 1 },
    initialSkills: ["review"],
    initialMcpServers: [],
    missing: { lines: 9, brokenLines: 1, tailFragments: 1, tooLongLines: 1, unconfirmedTypes: sortedRecord({ system: 1 }) },
    firstResponseIdHashes: ["0123456789abcdef"],
    notes: { syntheticResponses: 1, responsesWithoutId: 1, undatedLines: 1, unknownHookKinds: sortedRecord({ hook_new: 1 }) },
  };
}

describe("reviveSummary", () => {
  it("JSON으로 갔다 온 요약을 글자 하나 다르지 않게 되살린다", () => {
    const summary = fullSummary();
    const back = reviveSummary(JSON.parse(JSON.stringify(summary)));
    expect(JSON.stringify(back)).toBe(JSON.stringify(summary));
    expect(back).toEqual(summary);
  });
  it("날짜 칸의 열쇠를 하나도 빠뜨리지 않고, 기본 속성과 같은 이름도 숫자로 되살린다", () => {
    const back = reviveSummary(JSON.parse(JSON.stringify(fullSummary())))!;
    const day = back.days["2026-11-11"]!;
    expect(Object.keys(day)).toEqual(Object.keys(emptyDay()));
    for (const name of PROTO_NAMES) expect(day.models[name]).toBe(1);
  });
  it("모양이 다르면 null이다", () => {
    const base = JSON.parse(JSON.stringify(fullSummary())) as Record<string, any>;
    const cell = base.days["2026-11-11"];
    const broken: unknown[] = [
      {},
      null,
      [],
      { ...base, kind: "other" },
      { ...base, days: null },
      { ...base, days: { "11-11": cell } },
      { ...base, days: { "2026-11-11": { ...cell, tools: { Bash: { ...cell.tools.Bash, calls: "2" } } } } },
      { ...base, days: { "2026-11-11": { ...cell, loadedSkills: [1] } } },
      { ...base, days: { "2026-11-11": { ...cell, humanRequests: undefined } } },
      { ...base, missing: { ...base.missing, lines: undefined } },
      { ...base, notes: { ...base.notes, unknownHookKinds: null } },
      { ...base, firstDate: "yesterday" },
      { ...base, initialSkills: [1] },
      { ...base, initialMcpServers: undefined },
    ];
    for (const value of broken) expect(reviveSummary(value)).toBeNull();
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/types.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/common/hash.ts`:

```ts
// 문자열의 64비트 FNV-1a 지문(16자리 16진수)을 만든다. 같은 값인지 견주는 데만 쓰고 원문은 되살릴 수 없다(순수 함수)
const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;
const encoder = new TextEncoder();

export function fnv1a64(text: string): string {
  let hash = OFFSET;
  for (const byte of encoder.encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}
```

`src/adapters/common/canonical.ts`:

```ts
// 이름을 열쇠로 쓰는 기록을 원형 없는 객체로 만들고, 열쇠를 사전순으로 다시 세워 같은 내용이면 늘 같은 JSON이 나오게 한다(순수 함수)

/** 이름(스킬·서버·도구·모델 등)을 열쇠로 쓰는 빈 기록. 원형이 없어서 `constructor`, `toString`, `__proto__` 같은 이름도 보통 열쇠다. */
export function nameRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  const out = nameRecord<T>();
  for (const key of Object.keys(record).sort()) out[key] = record[key]!;
  return out;
}
```

`src/adapters/types.ts`:

```ts
// 기록 어댑터가 내는 날짜별 세션 요약의 모양(설계 9.3)과, 캐시에서 꺼낸 값을 그 모양으로 되살리는 검사. 숫자와 스킬·MCP 이름만 담고 본문은 담지 않는다
import { nameRecord, sortedRecord } from "./common/canonical.ts";
import type { LocalDate } from "./common/dates.ts";

export type ToolId = "claude-code";
export type SessionKind = "main" | "sub";

export interface TokenCounts {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  thinking: number;
}

export interface ToolCounts {
  calls: number;
  /** 거절·끊김·모르는 표시가 붙지 않은 결과 */
  results: number;
  /** results 가운데 is_error가 참인 것. 셸 도구는 0이 아닌 종료 코드다 */
  errors: number;
  deniedByUser: number;
  deniedByPermission: number;
  deniedByHook: number;
  interrupted: number;
  unknownDenial: number;
}

export interface SkillSignalCounts {
  tool: number;
  attribution: number;
  slash: number;
  injected: number;
}

export interface HookCounts {
  runs: number;
  failures: number;
  /** 실패 표지가 없는 hook_blocking_error. S4의 실행과 실패 어디에도 넣지 않는다 */
  unclassifiedBlocks: number;
}

export interface DayCell {
  humanRequests: number;
  weakHumanRequests: number;
  nonHumanInputs: Record<string, number>;
  permissionModes: Record<string, number>;
  responses: number;
  tokens: TokenCounts;
  models: Record<string, number>;
  efforts: Record<string, number>;
  unknownEffort: number;
  tools: Record<string, ToolCounts>;
  unknownDenialKinds: Record<string, number>;
  autoCompactions: number;
  unknownCompactions: number;
  lengthStops: number;
  interruptedTurns: number;
  subagentCalls: number;
  mcpConnectionFailure: boolean;
  skillSignals: Record<string, SkillSignalCounts>;
  mcpCalls: Record<string, number>;
  mcpAttributions: Record<string, number>;
  hooks: Record<string, HookCounts>;
  loadedSkills: string[];
  loadedMcpServers: string[];
  /** 세션 안에서 실린 목록에서 빠졌다가 이날 다시 실린 이름(설계 9.3, 11.3 ㉱) */
  reloadedSkills: string[];
  reloadedMcpServers: string[];
}

export interface MissingCounts {
  /** 빈 줄을 뺀 줄의 수. 너무 긴 줄과 끝 조각을 넣는다(설계 20.1 「절반 넘게 풀리지 않으면」의 분모) */
  lines: number;
  brokenLines: number;
  tailFragments: number;
  tooLongLines: number;
  unconfirmedTypes: Record<string, number>;
}

export interface SessionSummary {
  tool: ToolId;
  sessionId: string;
  kind: SessionKind;
  parentSessionId: string | null;
  cwd: string | null;
  /** 세션 기록에 적힌 버전 가운데 가장 높은 것. 읽을 수 있는 것이 없으면 null(버전 모름) */
  version: string | null;
  /** 종류와 상관없이 맨 바깥 timestamp가 읽히는 줄 가운데 가장 이른 현지 날짜. 달력의 볼 수 있는 범위에만 쓴다(설계 9.8) */
  firstDate: LocalDate | null;
  days: Record<LocalDate, DayCell>;
  /** 세션에서 처음 실린 지침의 글자 수. ASCII와 그 밖의 글자를 나눈다 */
  instructionChars: { ascii: number; other: number } | null;
  /** 세션의 처음 목록. 스킬은 첫 isInitial 목록, MCP 서버는 첫 응답 줄 바로 앞에 실려 있던 이름이다. 없으면 null(설계 9.3, 11.3 ㉱) */
  initialSkills: string[] | null;
  initialMcpServers: string[] | null;
  missing: MissingCounts;
  firstResponseIdHashes: string[];
  /** 알림에 쓰는 수. 모르는 종류의 훅 첨부는 세지 않고 종류별 수만 낸다(설계 9.5 「훅」) */
  notes: { syntheticResponses: number; responsesWithoutId: number; undatedLines: number; unknownHookKinds: Record<string, number> };
}

export function emptyToolCounts(): ToolCounts {
  return { calls: 0, results: 0, errors: 0, deniedByUser: 0, deniedByPermission: 0, deniedByHook: 0, interrupted: 0, unknownDenial: 0 };
}

export function emptySkillSignalCounts(): SkillSignalCounts {
  return { tool: 0, attribution: 0, slash: 0, injected: 0 };
}

export function emptyHookCounts(): HookCounts {
  return { runs: 0, failures: 0, unclassifiedBlocks: 0 };
}

export function emptyDay(): DayCell {
  return {
    humanRequests: 0,
    weakHumanRequests: 0,
    nonHumanInputs: nameRecord(),
    permissionModes: nameRecord(),
    responses: 0,
    tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 },
    models: nameRecord(),
    efforts: nameRecord(),
    unknownEffort: 0,
    tools: nameRecord(),
    unknownDenialKinds: nameRecord(),
    autoCompactions: 0,
    unknownCompactions: 0,
    lengthStops: 0,
    interruptedTurns: 0,
    subagentCalls: 0,
    mcpConnectionFailure: false,
    skillSignals: nameRecord(),
    mcpCalls: nameRecord(),
    mcpAttributions: nameRecord(),
    hooks: nameRecord(),
    loadedSkills: [],
    loadedMcpServers: [],
    reloadedSkills: [],
    reloadedMcpServers: [],
  };
}

/** 칸 안의 모든 기록을 열쇠 차례로 세운다. 같은 내용이면 늘 같은 JSON이다. */
export function canonicalDay(day: DayCell): DayCell {
  return {
    ...day,
    nonHumanInputs: sortedRecord(day.nonHumanInputs),
    permissionModes: sortedRecord(day.permissionModes),
    models: sortedRecord(day.models),
    efforts: sortedRecord(day.efforts),
    tools: sortedRecord(day.tools),
    unknownDenialKinds: sortedRecord(day.unknownDenialKinds),
    skillSignals: sortedRecord(day.skillSignals),
    mcpCalls: sortedRecord(day.mcpCalls),
    mcpAttributions: sortedRecord(day.mcpAttributions),
    hooks: sortedRecord(day.hooks),
  };
}

// ── 캐시에서 꺼낸 값 되살리기(설계 9.4: 캐시가 있을 때와 없을 때 결과가 같다) ──

type Json = Record<string, unknown>;
type Shape = "number" | "boolean" | "names" | "numbers" | "tokens" | "tools" | "skills" | "hooks";

/** 날짜 칸의 열쇠마다 값의 모양. DayCell에 열쇠를 더하면 여기도 더해야 타입 검사를 통과한다. */
const DAY_SHAPE: Record<keyof DayCell, Shape> = {
  humanRequests: "number",
  weakHumanRequests: "number",
  nonHumanInputs: "numbers",
  permissionModes: "numbers",
  responses: "number",
  tokens: "tokens",
  models: "numbers",
  efforts: "numbers",
  unknownEffort: "number",
  tools: "tools",
  unknownDenialKinds: "numbers",
  autoCompactions: "number",
  unknownCompactions: "number",
  lengthStops: "number",
  interruptedTurns: "number",
  subagentCalls: "number",
  mcpConnectionFailure: "boolean",
  skillSignals: "skills",
  mcpCalls: "numbers",
  mcpAttributions: "numbers",
  hooks: "hooks",
  loadedSkills: "names",
  loadedMcpServers: "names",
  reloadedSkills: "names",
  reloadedMcpServers: "names",
};
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === "string";

/** 정해진 열쇠만 가진 숫자 묶음을 그 차례로 만든다. 하나라도 숫자가 아니면 null이다. */
function fixed(v: unknown, fields: readonly string[]): Record<string, number> | null {
  if (!isObject(v)) return null;
  const out: Record<string, number> = {};
  for (const field of fields) {
    const x = v[field];
    if (!isNumber(x)) return null;
    out[field] = x;
  }
  return out;
}

/** 이름을 열쇠로 쓰는 기록을 원형 없는 객체로, 열쇠 차례로 만든다. 값 하나라도 모양이 다르면 null이다. */
function named<T>(v: unknown, each: (x: unknown) => T | null): Record<string, T> | null {
  if (!isObject(v)) return null;
  const out = nameRecord<T>();
  for (const key of Object.keys(v).sort()) {
    const x = each(v[key]);
    if (x === null) return null;
    out[key] = x;
  }
  return out;
}

function names(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? [...v] : null;
}

function reviveValue(v: unknown, shape: Shape): unknown {
  switch (shape) {
    case "number":
      return isNumber(v) ? v : null;
    case "boolean":
      return typeof v === "boolean" ? v : null;
    case "names":
      return names(v);
    case "numbers":
      return named(v, (x) => (isNumber(x) ? x : null));
    case "tokens":
      return fixed(v, Object.keys(emptyDay().tokens));
    case "tools":
      return named(v, (x) => fixed(x, Object.keys(emptyToolCounts())));
    case "skills":
      return named(v, (x) => fixed(x, Object.keys(emptySkillSignalCounts())));
    case "hooks":
      return named(v, (x) => fixed(x, Object.keys(emptyHookCounts())));
  }
}

function reviveDay(v: unknown): DayCell | null {
  if (!isObject(v)) return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(emptyDay()) as (keyof DayCell)[]) {
    const value = reviveValue(v[key], DAY_SHAPE[key]);
    if (value === null) return null;
    out[key] = value;
  }
  return out as unknown as DayCell;
}

/** 캐시에서 꺼낸 값이 세션 요약의 모양이면 같은 모양(열쇠 차례와 원형 없는 기록까지)으로 되살린다. 모양이 다르면 null이다. */
export function reviveSummary(value: unknown): SessionSummary | null {
  if (!isObject(value)) return null;
  const v = value;
  if (v.tool !== "claude-code" || typeof v.sessionId !== "string" || (v.kind !== "main" && v.kind !== "sub")) return null;
  if (!isNullableString(v.parentSessionId) || !isNullableString(v.cwd) || !isNullableString(v.version)) return null;
  if (!isNullableString(v.firstDate) || (v.firstDate !== null && !DATE_KEY.test(v.firstDate))) return null;
  if (!isObject(v.days)) return null;
  const days: Record<LocalDate, DayCell> = {};
  for (const date of Object.keys(v.days).sort()) {
    const day = DATE_KEY.test(date) ? reviveDay(v.days[date]) : null;
    if (day === null) return null;
    days[date] = day;
  }
  const instructionChars = v.instructionChars === null ? null : fixed(v.instructionChars, ["ascii", "other"]);
  if (v.instructionChars !== null && instructionChars === null) return null;
  const missing = fixed(v.missing, ["lines", "brokenLines", "tailFragments", "tooLongLines"]);
  const unconfirmedTypes = isObject(v.missing) ? named(v.missing.unconfirmedTypes, (x) => (isNumber(x) ? x : null)) : null;
  const notes = fixed(v.notes, ["syntheticResponses", "responsesWithoutId", "undatedLines"]);
  const unknownHookKinds = isObject(v.notes) ? named(v.notes.unknownHookKinds, (x) => (isNumber(x) ? x : null)) : null;
  const hashes = names(v.firstResponseIdHashes);
  const initialSkills = v.initialSkills === null ? null : names(v.initialSkills);
  const initialMcpServers = v.initialMcpServers === null ? null : names(v.initialMcpServers);
  if (missing === null || unconfirmedTypes === null || notes === null || unknownHookKinds === null || hashes === null) return null;
  if ((v.initialSkills !== null && initialSkills === null) || (v.initialMcpServers !== null && initialMcpServers === null)) return null;
  return {
    tool: v.tool,
    sessionId: v.sessionId,
    kind: v.kind,
    parentSessionId: v.parentSessionId,
    cwd: v.cwd,
    version: v.version,
    firstDate: v.firstDate,
    days,
    instructionChars: instructionChars === null ? null : { ascii: instructionChars.ascii!, other: instructionChars.other! },
    initialSkills,
    initialMcpServers,
    missing: {
      lines: missing.lines!,
      brokenLines: missing.brokenLines!,
      tailFragments: missing.tailFragments!,
      tooLongLines: missing.tooLongLines!,
      unconfirmedTypes,
    },
    firstResponseIdHashes: hashes,
    notes: {
      syntheticResponses: notes.syntheticResponses!,
      responsesWithoutId: notes.responsesWithoutId!,
      undatedLines: notes.undatedLines!,
      unknownHookKinds,
    },
  };
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/adapters/types.test.ts` → PASS(8개).
Run: `npx tsc --noEmit` → 출력 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/types.ts src/adapters/common/hash.ts src/adapters/common/canonical.ts test/adapters/types.test.ts
git commit -m "feat: 날짜별 세션 요약의 모양과 지문 추가"
```

---

### Task 7: user 줄 판별과 거절 가르기

**Files:**
- Create: `src/adapters/claude/classify.ts`
- Test: `test/adapters/claude/classify.test.ts`

**Interfaces:**
- Produces:
  - `type UserVerdict = { kind: "tool-result" } | { kind: "human"; weak: boolean } | { kind: "command"; name: string } | { kind: "skip"; reason: string }`
  - `classifyUser(line: Record<string, unknown>, isSubSession: boolean): UserVerdict`
  - `type DenialKind = "user" | "hook" | "interrupted" | "permission" | "unknown"`, `denialOf(line: Record<string, unknown>): { kind: DenialKind; raw: string | null } | null`
  - `userText(content: unknown): string`(문자열이면 그대로, 블록 목록이면 첫 `text` 블록의 글)
  - `commandNameOf(text: string): string | null`(명령 줄이면 명령의 이름), `isInterruptMarker(line): boolean`(판별표 10번의 표지인지. 하위 세션의 줄이어도 본다), `slashCommandOf(line): string | null`(스킬 신호 3을 볼 명령의 이름. 판별표 2·3번에 걸리는 줄은 빼고 `origin`과 하위 세션인지는 따지지 않는다)
- 판별 차례는 설계 9.5의 표 그대로다(1~11번). `command`는 해석부가 "다음 사람 입력 전에 응답이 뒤따랐는지"로 7번(사람 요청)과 8번(세지 않음)을 가른다.
- 명령 줄은 글의 앞머리가 `<command-name>` 꼬리표이거나, 앞머리의 `<command-message>…</command-message>` 바로 다음(공백만 사이에 둔다)이 `<command-name>` 꼬리표인 줄이다. 이 PC의 기록에서 도구에 든 명령은 `<command-name>`이 먼저였고, 사람이 친 스킬 명령은 `<command-message>`가 먼저이고 `origin`이 `human`이었다(설계 9.5).
- 판별표 1번(하위 세션·`isSidechain`)은 사람 요청을 세지 않는 규칙이다. 끊은 표지와 도구 결과는 하위 세션에서도 센다(설계 9.2). 그래서 표지는 1번을 건너뛰고 2~11번으로 따로 본다(`isInterruptMarker`).
- `skip`의 `reason`은 `subagent-input`, `meta`, `origin:<종류>`, `turn:<sdk|scheduled>`, `tag:<꼬리표>`, `interrupt` 가운데 하나다.
- 거절의 차례는 설계 9.5 「거절과 끊김」 표 그대로다. 훅이 막은 줄에도 `toolDenialKind`가 `permission-rule`로 적히므로 훅을 권한 검사보다 먼저 본다. `raw`는 모르는 표시일 때의 `toolDenialKind` 값이고 그 밖에는 null이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/claude/classify.test.ts`:

```ts
// user 줄의 판별 차례와 거절 가르기(설계 9.5)를 시험한다
import { describe, expect, it } from "vitest";
import { classifyUser, denialOf, isInterruptMarker, slashCommandOf, userText } from "../../../src/adapters/claude/classify.ts";

const line = (fields: Record<string, unknown>, content: unknown = "hello") => ({ type: "user", message: { role: "user", content }, ...fields });

describe("classifyUser", () => {
  it("1. 하위 세션이거나 isSidechain이면 세지 않는다", () => {
    expect(classifyUser(line({ origin: { kind: "human" } }), true)).toEqual({ kind: "skip", reason: "subagent-input" });
    expect(classifyUser(line({ isSidechain: true }), false)).toEqual({ kind: "skip", reason: "subagent-input" });
  });
  it("2. tool_result 블록이 있으면 도구 결과다", () => {
    expect(classifyUser(line({}, [{ type: "tool_result", tool_use_id: "t1" }]), false)).toEqual({ kind: "tool-result" });
  });
  it("3. isMeta, isCompactSummary, isVisibleInTranscriptOnly는 세지 않는다", () => {
    for (const flag of ["isMeta", "isCompactSummary", "isVisibleInTranscriptOnly"]) {
      expect(classifyUser(line({ [flag]: true, origin: { kind: "human" } }), false)).toEqual({ kind: "skip", reason: "meta" });
    }
  });
  it("4. origin.kind가 human이면 사람 요청이다", () => {
    expect(classifyUser(line({ origin: { kind: "human" }, promptSource: "queued" }), false)).toEqual({ kind: "human", weak: false });
  });
  it("5. origin.kind가 다른 값이면 종류별로 세지 않는다", () => {
    expect(classifyUser(line({ origin: { kind: "task-notification" } }), false)).toEqual({ kind: "skip", reason: "origin:task-notification" });
  });
  it("6. origin이 없고 turnOrigin이 sdk나 scheduled면 세지 않는다", () => {
    expect(classifyUser(line({ turnOrigin: "scheduled" }), false)).toEqual({ kind: "skip", reason: "turn:scheduled" });
  });
  it("7·8. origin이 없고 명령 줄이면 명령이다", () => {
    const text = "<command-name>/superpowers:brainstorming</command-name>\n<command-args></command-args>";
    expect(classifyUser(line({}, text), false)).toEqual({ kind: "command", name: "superpowers:brainstorming" });
  });
  it("7·8. <command-message> 바로 다음에 <command-name>이 오는 줄도 명령 줄이다", () => {
    const text = "<command-message>review is running</command-message>\n<command-name>/review</command-name>";
    expect(classifyUser(line({}, text), false)).toEqual({ kind: "command", name: "review" });
  });
  it("9. origin이 없고 명령 줄이 아닌 꼬리표로 시작하면 꼬리표별로 세지 않는다", () => {
    expect(classifyUser(line({}, "<local-command-stdout>x</local-command-stdout>"), false)).toEqual({ kind: "skip", reason: "tag:local-command-stdout" });
    expect(classifyUser(line({}, "<command-message>x</command-message>\nplain"), false)).toEqual({ kind: "skip", reason: "tag:command-message" });
  });
  it("10. 끊은 턴의 표지는 사람 요청이 아니다", () => {
    expect(classifyUser(line({ interruptedMessageId: "m1" }, [{ type: "text", text: "[Request interrupted by user]" }]), false)).toEqual({ kind: "skip", reason: "interrupt" });
    expect(classifyUser(line({}, "[Request interrupted by user for tool use]"), false)).toEqual({ kind: "skip", reason: "interrupt" });
  });
  it("11. 그 밖의 평문은 근거가 약한 사람 요청이다", () => {
    expect(classifyUser(line({}, "please fix the bug"), false)).toEqual({ kind: "human", weak: true });
  });
});

describe("isInterruptMarker, slashCommandOf", () => {
  it("끊은 표지는 하위 세션의 줄이어도 표지다. 도구 결과나 출처가 있는 줄은 표지가 아니다", () => {
    expect(isInterruptMarker(line({ isSidechain: true }, "[Request interrupted by user]"))).toBe(true);
    expect(isInterruptMarker(line({}, [{ type: "tool_result", tool_use_id: "t1" }]))).toBe(false);
    expect(isInterruptMarker(line({ origin: { kind: "human" } }, "[Request interrupted by user]"))).toBe(false);
  });
  it("슬래시 명령의 이름은 origin과 상관없이 낸다", () => {
    const skill = "<command-message>review is running</command-message>\n<command-name>/review</command-name>";
    expect(slashCommandOf(line({ origin: { kind: "human" } }, skill))).toBe("review");
    expect(slashCommandOf(line({}, "<command-name>/clear</command-name>"))).toBe("clear");
  });
  it("도구가 넣은 글과 도구 결과, 명령 줄이 아닌 글에서는 이름을 내지 않는다", () => {
    expect(slashCommandOf(line({ isMeta: true }, "<command-message>x</command-message>\n<command-name>/review</command-name>"))).toBeNull();
    expect(slashCommandOf(line({}, [{ type: "tool_result", tool_use_id: "t1" }]))).toBeNull();
    expect(slashCommandOf(line({}, "see <command-name>/review</command-name>"))).toBeNull();
  });
});

describe("denialOf", () => {
  it("1. user-rejected는 사람이 거절한 것이다", () => {
    expect(denialOf({ toolDenialKind: "user-rejected" })).toEqual({ kind: "user", raw: null });
  });
  it("2. decision이 reject이고 source가 hook이면 훅이 막은 것이다(permission-rule이 같이 적혀도)", () => {
    expect(denialOf({ toolDenialKind: "permission-rule", permissionDecision: { decision: "reject", source: "hook" } })).toEqual({ kind: "hook", raw: null });
  });
  it("3. interrupted는 끊겨서 끝난 것이다", () => {
    expect(denialOf({ toolDenialKind: "interrupted" })).toEqual({ kind: "interrupted", raw: null });
  });
  it("4. 위의 셋이 아니고 permission-rule이거나 decision이 reject면 권한 검사가 막은 것이다", () => {
    expect(denialOf({ toolDenialKind: "permission-rule" })).toEqual({ kind: "permission", raw: null });
    expect(denialOf({ permissionDecision: { decision: "reject", source: "config" } })).toEqual({ kind: "permission", raw: null });
    expect(denialOf({ permissionDecision: { decision: "reject", source: "something-new" } })).toEqual({ kind: "permission", raw: null });
  });
  it("5. 모르는 toolDenialKind는 모르는 표시다", () => {
    expect(denialOf({ toolDenialKind: "brand-new" })).toEqual({ kind: "unknown", raw: "brand-new" });
  });
  it("허락(accept)만 있거나 표시가 없으면 거절이 아니다(보통 결과)", () => {
    expect(denialOf({ permissionDecision: { decision: "accept", source: "config" } })).toBeNull();
    expect(denialOf({})).toBeNull();
  });
  it("user-rejected는 decision이 accept여도 사람이 거절한 것이다(차례의 1번이 먼저)", () => {
    expect(denialOf({ toolDenialKind: "user-rejected", permissionDecision: { decision: "accept", source: "config" } })).toEqual({ kind: "user", raw: null });
  });
});

describe("userText", () => {
  it("문자열은 그대로, 블록 목록은 첫 text 블록", () => {
    expect(userText("a")).toBe("a");
    expect(userText([{ type: "image" }, { type: "text", text: "b" }])).toBe("b");
    expect(userText(null)).toBe("");
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/claude/classify.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/claude/classify.ts`:

```ts
// Claude Code의 user 줄이 사람 요청인지, 도구 결과인지, 세지 않을 입력인지 가르고(판별표), 끊은 표지와 슬래시 명령을 판별표와 따로 알아보며, 도구 결과의 거절 종류를 가른다(순수 함수, 설계 9.5)
export type UserVerdict =
  | { kind: "tool-result" }
  | { kind: "human"; weak: boolean }
  | { kind: "command"; name: string }
  | { kind: "skip"; reason: string };

export type DenialKind = "user" | "hook" | "interrupted" | "permission" | "unknown";

const INTERRUPT_PREFIX = "[Request interrupted by user";
/** 명령 줄. 앞머리가 <command-name> 꼬리표이거나, 앞머리의 <command-message> 꼬리표 바로 다음이 <command-name> 꼬리표다(설계 9.5) */
const COMMAND = /^(?:<command-message>[\s\S]*?<\/command-message>\s*)?<command-name>\/?([^<]*)<\/command-name>/;
const TAG = /^<([A-Za-z][\w-]*)>/;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);

export function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (isObject(block) && block.type === "text") return typeof block.text === "string" ? block.text : "";
    }
  }
  return "";
}

function hasToolResult(content: unknown): boolean {
  return Array.isArray(content) && content.some((block) => isObject(block) && block.type === "tool_result");
}

const toolInserted = (line: Json): boolean =>
  line.isMeta === true || line.isCompactSummary === true || line.isVisibleInTranscriptOnly === true;

/** 글이 명령 줄이면 명령의 이름을 낸다. */
export function commandNameOf(text: string): string | null {
  const command = COMMAND.exec(text.trimStart());
  return command === null ? null : command[1]!.trim();
}

/** 판별표의 2번부터 11번. 하위 세션인지(1번)는 보지 않는다. */
function classifyOwnUser(line: Json): UserVerdict {
  const message = isObject(line.message) ? line.message : {};
  if (hasToolResult(message.content)) return { kind: "tool-result" };
  if (toolInserted(line)) return { kind: "skip", reason: "meta" };
  if (isObject(line.origin)) {
    const kind = line.origin.kind;
    if (kind === "human") return { kind: "human", weak: false };
    return { kind: "skip", reason: `origin:${typeof kind === "string" ? kind : "?"}` };
  }
  if (line.turnOrigin === "sdk" || line.turnOrigin === "scheduled") return { kind: "skip", reason: `turn:${line.turnOrigin}` };
  const text = userText(message.content).trimStart();
  const command = commandNameOf(text);
  if (command !== null) return { kind: "command", name: command };
  const tag = TAG.exec(text);
  if (tag !== null) return { kind: "skip", reason: `tag:${tag[1]}` };
  if (text.startsWith(INTERRUPT_PREFIX)) return { kind: "skip", reason: "interrupt" };
  return { kind: "human", weak: true };
}

/** 사람 요청 판별표(설계 9.5)의 1번부터 11번. */
export function classifyUser(line: Json, isSubSession: boolean): UserVerdict {
  if (isSubSession || line.isSidechain === true) return { kind: "skip", reason: "subagent-input" };
  return classifyOwnUser(line);
}

/** 끊은 턴의 표지 줄(판별표 10번)인지. 하위 세션의 줄이어도 본다. 끊은 턴은 주 세션과 하위 세션을 합쳐 센다(설계 9.2). */
export function isInterruptMarker(line: Json): boolean {
  const verdict = classifyOwnUser(line);
  return verdict.kind === "skip" && verdict.reason === "interrupt";
}

/** 스킬 신호 3을 볼 명령의 이름. 도구 결과와 도구가 넣은 글(판별표 2·3번)이 아닌 명령 줄이면 낸다. origin과 하위 세션인지는 따지지 않는다(설계 9.2, 9.5). */
export function slashCommandOf(line: Json): string | null {
  const message = isObject(line.message) ? line.message : {};
  if (hasToolResult(message.content) || toolInserted(line)) return null;
  return commandNameOf(userText(message.content));
}

export function denialOf(line: Json): { kind: DenialKind; raw: string | null } | null {
  const kind = line.toolDenialKind;
  const decision = isObject(line.permissionDecision) ? line.permissionDecision : null;
  const rejected = decision !== null && decision.decision === "reject";
  if (kind === "user-rejected") return { kind: "user", raw: null };
  if (rejected && decision.source === "hook") return { kind: "hook", raw: null };
  if (kind === "interrupted") return { kind: "interrupted", raw: null };
  if (kind === "permission-rule" || rejected) return { kind: "permission", raw: null };
  if (typeof kind === "string" && kind !== "") return { kind: "unknown", raw: kind };
  return null;
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/adapters/claude/classify.test.ts` → PASS(22개).

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/claude/classify.ts test/adapters/claude/classify.test.ts
git commit -m "feat: Claude Code user 줄 판별과 거절 가르기 추가"
```

---

### Task 8: 줄 해석 1 — 응답, 토큰, 깨진 줄

**Files:**
- Create: `src/adapters/claude/responses.ts`, `src/adapters/claude/parser.ts`, `test/helpers/claude-lines.ts`
- Test: `test/adapters/claude/parser-responses.test.ts`

**Interfaces:**
- Consumes: `localDateOfIso`(Task 2), `maxVersion`(Task 3), `outerTypeOf`(Task 4), `emptyDay`·`canonicalDay`·`emptySkillSignalCounts`·`SessionSummary`·`fnv1a64`·`nameRecord`·`sortedRecord`(Task 6)
- Produces:
  - `CLAUDE_PARSER_VERSION = 1`(해석 규약을 바꾸면 올린다. 캐시 열쇠에 들어간다)
  - `interface ParserContext { sessionId: string; kind: SessionKind; parentSessionId: string | null; timeZone: string }`
  - `class ClaudeSessionParser { constructor(ctx: ParserContext); line(text: string): void; tooLong(): void; finish(tail: string | null, inProgress: boolean): SessionSummary }`. `finish`는 한 번만 부른다.
  - `class ResponseTable`(`responses.ts`). 응답 ID마다 첫 줄의 날짜, 처음 모델과 강도, 마지막 사용량·끊긴 까닭·귀속을 숫자 배열 셋(이름 번호 `Int32Array`, 표시 `Uint8Array`, 사용량 `Float64Array`)에 담는다. 이름은 표 안의 사전 하나에 한 번만 둔다. 배열은 1.5배씩 키운다. 응답 ID마다 객체 두 개와 문자열을 두던 첫 계획은 응답 100만 개에서 과제 17의 메모리 목표(500MB)를 넘었다(계획 리뷰 1차 재현).
  - 시험 도우미 `test/helpers/claude-lines.ts`: `assistant(...)`, `user(...)`, `toolUse(...)`, `toolResult(...)`, `attachment(...)`, `system(...)`, `parseLines(lines, options)`
- 규약.
  - 모든 줄을 JSON으로 풀어 본다. 풀리지 않으면 종류와 상관없이 깨진 줄이고 맨 바깥 종류를 `unconfirmedTypes`에 센다. 숫자는 `assistant`, `user`, `attachment`, `system` 줄에서만 센다(설계 9.4, 20.1).
  - 빈 줄(공백만 있는 줄 포함)은 줄로 세지 않고 깨진 줄도 아니다. 줄 수(`missing.lines`)는 빈 줄을 뺀 줄에 너무 긴 줄과 끝 조각을 더한 것이다(설계 9.4, 20.1의 분모).
  - 가장 이른 날짜(`firstDate`)는 종류와 상관없이 맨 바깥 `timestamp`가 읽히는 줄에서 본다. 세지 않는 종류의 줄로 날짜 칸을 만들지는 않는다(설계 9.8).
  - 응답은 `message.id`로 한 번 센다. 사용량과 끝난 까닭은 나중 줄의 값으로 갱신하고, 날짜는 처음 나온 줄의 시각이다. 모델과 강도는 처음 적힌 값이다. `<synthetic>` 응답은 뺀다(설계 9.5).
  - 스킬 귀속(`attributionSkill`)과 MCP 귀속(`attributionMcpServer`)은 응답마다 한 번 센다.
  - 끝 조각은 풀리면 쓰고, 풀리지 않으면 진행 중일 때 덜 쓴 끝 조각, 아닐 때 깨진 줄이다(설계 9.4 줄 표).
  - 시각이 없는 줄은 앞 줄의 날짜를 쓴다. 앞 줄은 종류와 상관없이 시각이 읽힌 줄이다(세지 않는 종류의 줄도 풀어 보므로 그 시각도 쓴다). 앞 줄도 없으면 날짜 없는 줄로 센다. 세지 않는 종류의 줄 자체로는 날짜 칸을 만들지 않는다.

- [ ] **Step 1: 시험 도우미를 만든다**

`test/helpers/claude-lines.ts`:

```ts
// 시험에 쓰는 합성 Claude Code 기록 줄을 만든다. 필드 이름만 실제 기록(설계 부록 A)을 따르고 값은 지어낸 것이다
import { ClaudeSessionParser } from "../../src/adapters/claude/parser.ts";
import type { SessionKind, SessionSummary } from "../../src/adapters/types.ts";

export interface UsageInput {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  thinking?: number;
}

export function assistant(o: {
  id: string;
  at: string;
  model?: string;
  effort?: string;
  stop?: string | null;
  usage?: UsageInput;
  content?: unknown[];
  version?: string;
  cwd?: string;
  skill?: string;
  mcpServer?: string;
}): string {
  const usage =
    o.usage === undefined
      ? undefined
      : {
          input_tokens: o.usage.input ?? 0,
          output_tokens: o.usage.output ?? 0,
          cache_read_input_tokens: o.usage.cacheRead ?? 0,
          cache_creation_input_tokens: o.usage.cacheWrite ?? 0,
          output_tokens_details: { thinking_tokens: o.usage.thinking ?? 0 },
        };
  // 실제 기록처럼 맨 바깥 type을 본문 뒤에 둔다
  return JSON.stringify({
    parentUuid: null,
    cwd: o.cwd ?? "C:/work/proj",
    sessionId: "s1",
    version: o.version ?? "2.1.300",
    message: { id: o.id, type: "message", role: "assistant", model: o.model ?? "claude-test", content: o.content ?? [], stop_reason: o.stop ?? null, usage },
    ...(o.effort === undefined ? {} : { effort: o.effort }),
    ...(o.skill === undefined ? {} : { attributionSkill: o.skill }),
    ...(o.mcpServer === undefined ? {} : { attributionMcpServer: o.mcpServer }),
    type: "assistant",
    timestamp: o.at,
  });
}

export function user(o: { at: string; content: unknown; origin?: string; extra?: Record<string, unknown> }): string {
  return JSON.stringify({
    type: "user",
    ...(o.origin === undefined ? {} : { origin: { kind: o.origin } }),
    message: { role: "user", content: o.content },
    timestamp: o.at,
    ...o.extra,
  });
}

export function toolUse(id: string, name: string, input: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: "tool_use", id, name, input };
}

export function toolResult(toolUseId: string, isError = false): Record<string, unknown> {
  return { type: "tool_result", tool_use_id: toolUseId, is_error: isError, content: "result" };
}

export function attachment(at: string, body: Record<string, unknown>): string {
  return JSON.stringify({ type: "attachment", attachment: body, timestamp: at });
}

export function system(at: string, subtype: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: "system", subtype, timestamp: at, ...extra });
}

export function parseLines(
  lines: string[],
  options: { kind?: SessionKind; tail?: string | null; inProgress?: boolean; timeZone?: string } = {},
): SessionSummary {
  const kind = options.kind ?? "main";
  const parser = new ClaudeSessionParser({
    sessionId: "s1",
    kind,
    parentSessionId: kind === "sub" ? "parent" : null,
    timeZone: options.timeZone ?? "UTC",
  });
  for (const text of lines) parser.line(text);
  return parser.finish(options.tail ?? null, options.inProgress ?? false);
}
```

- [ ] **Step 2: 실패하는 시험을 쓴다**

`test/adapters/claude/parser-responses.test.ts`:

```ts
// 줄 해석의 응답·토큰·날짜·깨진 줄 규약을 시험한다(설계 9.4, 9.5, 21.1 반례)
import { describe, expect, it } from "vitest";
import { ClaudeSessionParser } from "../../../src/adapters/claude/parser.ts";
import { assistant, parseLines } from "../../helpers/claude-lines.ts";

const D1 = "2026-11-11";

describe("응답과 토큰", () => {
  it("같은 응답 ID의 뒤 줄에서 사용량이 커지면 마지막 값으로 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, usage: { input: 3, output: 10, cacheRead: 100 } }),
      assistant({ id: "m1", at: `${D1}T10:00:01Z`, usage: { input: 3, output: 50, cacheRead: 100, thinking: 20 } }),
    ]);
    const day = s.days[D1]!;
    expect(day.responses).toBe(1);
    expect(day.tokens).toEqual({ input: 3, cacheRead: 100, cacheWrite: 0, output: 50, thinking: 20 });
  });
  it("응답의 날짜는 그 응답 ID가 처음 나온 줄의 시각이다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: "2026-11-11T23:59:59Z", usage: { output: 1 } }),
      assistant({ id: "m1", at: "2026-11-12T00:00:01Z", usage: { output: 2 } }),
    ]);
    expect(s.days["2026-11-11"]!.responses).toBe(1);
    expect(s.days["2026-11-12"]?.responses ?? 0).toBe(0);
    expect(s.days["2026-11-11"]!.tokens.output).toBe(2);
  });
  it("<synthetic> 응답은 응답과 토큰에서 빼고 따로 센다", () => {
    const s = parseLines([assistant({ id: "m1", at: `${D1}T10:00:00Z`, model: "<synthetic>", usage: { output: 5 } })]);
    expect(s.days[D1]?.responses ?? 0).toBe(0);
    expect(s.notes.syntheticResponses).toBe(1);
  });
  it("추론 강도, 모델, 길이 제한으로 끊긴 응답을 응답마다 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, effort: "xhigh", model: "claude-a", stop: "max_tokens" }),
      assistant({ id: "m2", at: `${D1}T10:00:01Z`, model: "claude-a" }),
    ]);
    const day = s.days[D1]!;
    expect(day.efforts).toEqual({ xhigh: 1 });
    expect(day.unknownEffort).toBe(1);
    expect(day.models).toEqual({ "claude-a": 2 });
    expect(day.lengthStops).toBe(1);
  });
  it("스킬 귀속과 MCP 귀속은 응답마다 한 번 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, skill: "s-x", mcpServer: "srv" }),
      assistant({ id: "m1", at: `${D1}T10:00:01Z`, skill: "s-x", mcpServer: "srv" }),
    ]);
    expect(s.days[D1]!.skillSignals["s-x"]).toEqual({ tool: 0, attribution: 1, slash: 0, injected: 0 });
    expect(s.days[D1]!.mcpAttributions).toEqual({ srv: 1 });
  });
  it("기본 속성과 같은 이름도 숫자로 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, model: "constructor", skill: "toString", mcpServer: "__proto__" }),
      assistant({ id: "m2", at: `${D1}T10:00:01Z`, model: "constructor" }),
    ]);
    const day = s.days[D1]!;
    expect(day.models["constructor"]).toBe(2);
    expect(day.skillSignals["toString"]!.attribution).toBe(1);
    expect(day.mcpAttributions["__proto__"]).toBe(1);
    const back = JSON.parse(JSON.stringify(s)) as typeof s;
    expect(Object.keys(back.days[D1]!.mcpAttributions)).toEqual(["__proto__"]);
  });
  it("버전은 날짜와 상관없이 기록 전체에서 가장 높은 것이다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: "2026-09-01T10:00:00Z", version: "2.1.300" }),
      assistant({ id: "m2", at: `${D1}T10:00:00Z`, version: "2.1.99" }),
    ]);
    expect(s.version).toBe("2.1.300");
  });
  it("가장 이른 날짜는 세지 않는 종류의 줄도 보고, 그 줄로 날짜 칸을 만들지는 않는다", () => {
    const s = parseLines([
      '{"type":"api-request","timestamp":"2026-10-20T05:00:00Z"}',
      '{"type":"ai-title","title":"x"}',
      assistant({ id: "m1", at: `${D1}T10:00:00Z` }),
    ]);
    expect(s.firstDate).toBe("2026-10-20");
    expect(Object.keys(s.days)).toEqual([D1]);
  });
  it("시각이 없는 줄은 종류와 상관없이 앞 줄의 날짜를 쓴다. 세지 않는 줄로 날짜 칸을 만들지는 않는다", () => {
    const undated = (id: string): string => JSON.stringify({ type: "assistant", message: { id, model: "claude-test", content: [] } });
    const first = parseLines(['{"type":"api-request","timestamp":"2026-11-11T05:00:00Z"}', undated("m1")]);
    expect(first.days[D1]!.responses).toBe(1);
    expect(first.notes.undatedLines).toBe(0);
    const second = parseLines([
      assistant({ id: "m0", at: `${D1}T10:00:00Z` }),
      '{"type":"api-request","timestamp":"2026-11-12T05:00:00Z"}',
      undated("m1"),
    ]);
    expect(second.days[D1]!.responses).toBe(1);
    expect(second.days["2026-11-12"]!.responses).toBe(1);
    const alone = parseLines(['{"type":"api-request","timestamp":"2026-11-12T05:00:00Z"}']);
    expect(Object.keys(alone.days)).toEqual([]);
    const none = parseLines([undated("m1")]);
    expect(none.notes.undatedLines).toBe(1);
  });
  it("버전은 가장 높은 것, 작업 폴더는 처음 것이다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: `${D1}T10:00:00Z`, version: "2.1.250", cwd: "C:/a" }),
      assistant({ id: "m2", at: `${D1}T10:00:01Z`, version: "2.1.300", cwd: "C:/b" }),
    ]);
    expect(s.version).toBe("2.1.300");
    expect(s.cwd).toBe("C:/a");
  });
  it("처음 응답 ID 스무 개의 지문만 남긴다", () => {
    const lines = Array.from({ length: 25 }, (_, i) => assistant({ id: `m${i}`, at: `${D1}T10:00:00Z` }));
    const s = parseLines(lines);
    expect(s.firstResponseIdHashes).toHaveLength(20);
    expect(s.firstResponseIdHashes[0]).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("깨진 줄과 끝 조각", () => {
  it("맨 바깥 type을 읽을 수 있는 깨진 줄은 그 종류로 센다", () => {
    const s = parseLines(['{"type":"system","subtype":"compact_boun']);
    expect(s.missing.brokenLines).toBe(1);
    expect(s.missing.unconfirmedTypes).toEqual({ system: 1 });
  });
  it("모든 줄을 풀어 본다. 중괄호로 시작하고 끝나도 풀리지 않으면 깨진 줄이다", () => {
    const s = parseLines(['{"message":{"content":[{"type":"tool_use","name":"Skill"}]}', '{"type":"brand-new-type","payload":}']);
    expect(s.missing.brokenLines).toBe(2);
    expect(s.missing.unconfirmedTypes).toEqual({ "?": 1, "brand-new-type": 1 });
  });
  it("줄 수는 빈 줄(공백만 있는 줄 포함)을 뺀 줄에 너무 긴 줄과 끝 조각을 더한 것이다. 빈 줄은 깨진 줄도 아니다", () => {
    const parser = new ClaudeSessionParser({ sessionId: "s", kind: "main", parentSessionId: null, timeZone: "UTC" });
    parser.line("");
    parser.line("   ");
    parser.line(assistant({ id: "m1", at: `${D1}T10:00:00Z` }));
    parser.line("{broken");
    parser.tooLong();
    const s = parser.finish('{"type":"user"', true);
    expect(s.missing).toMatchObject({ lines: 4, brokenLines: 1, tooLongLines: 1, tailFragments: 1 });
  });
  it("종류를 읽지 못하는 깨진 줄은 종류가 ?다", () => {
    const s = parseLines(['{"parentUuid":null,"message":{"content":"tex']);
    expect(s.missing.brokenLines).toBe(1);
    expect(s.missing.unconfirmedTypes).toEqual({ "?": 1 });
  });
  it("관계없는 종류의 온전한 줄은 세지 않는다", () => {
    const s = parseLines(['{"type":"ai-title","title":"x"}']);
    expect(s.missing.brokenLines).toBe(0);
    expect(Object.keys(s.days)).toEqual([]);
  });
  it("진행 중인 파일의 풀리지 않는 끝 조각은 덜 쓴 끝 조각이다", () => {
    const fragment = assistant({ id: "m9", at: `${D1}T10:00:00Z` }).slice(0, 40);
    const s = parseLines([], { tail: fragment, inProgress: true });
    expect(s.missing.tailFragments).toBe(1);
    expect(s.missing.brokenLines).toBe(0);
    expect(s.missing.unconfirmedTypes).toEqual({ "?": 1 });
  });
  it("진행 중이 아닌 파일의 풀리지 않는 끝 조각은 깨진 줄이다", () => {
    const s = parseLines([], { tail: '{"type":"user","mess', inProgress: false });
    expect(s.missing.brokenLines).toBe(1);
    expect(s.missing.unconfirmedTypes).toEqual({ user: 1 });
  });
  it("줄바꿈 없이 끝났어도 풀리는 끝 조각은 쓴다", () => {
    const s = parseLines([], { tail: assistant({ id: "m1", at: `${D1}T10:00:00Z`, usage: { output: 7 } }) });
    expect(s.days[D1]!.responses).toBe(1);
    expect(s.days[D1]!.tokens.output).toBe(7);
  });
  it("너무 긴 줄은 따로 센다", () => {
    const parser = new ClaudeSessionParser({ sessionId: "s", kind: "main", parentSessionId: null, timeZone: "UTC" });
    parser.tooLong();
    expect(parser.finish(null, false).missing.tooLongLines).toBe(1);
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/claude/parser-responses.test.ts`
Expected: FAIL. `parser.ts`를 찾지 못한다.

- [ ] **Step 4: 구현한다**

`src/adapters/claude/responses.ts`:

```ts
// 응답 ID마다 남길 상태(첫 줄의 날짜, 처음 모델과 강도, 마지막 사용량·끊긴 까닭·귀속)를 숫자 배열 셋에 담는다. 응답이 100만 개여도 메모리를 묶으려는 것이다(설계 9.5, 22)
import type { LocalDate } from "../common/dates.ts";

const DATE = 0;
const MODEL = 1;
const EFFORT = 2;
const SKILL = 3;
const SERVER = 4;
const NAME_WIDTH = 5;
const USAGE_WIDTH = 5; // 입력, 캐시 읽기, 캐시 쓰기, 출력, 생각
const NONE = -1;
const SYNTHETIC = 1;
const HAS_USAGE = 2;
const LENGTH_STOP = 4;
const FIRST_CAPACITY = 1024;

export interface ResponseUsage {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  thinking: number;
}

export interface FoldedResponse {
  date: LocalDate | null;
  synthetic: boolean;
  model: string | null;
  effort: string | null;
  lengthStop: boolean;
  usage: ResponseUsage | null;
  skill: string | null;
  mcpServer: string | null;
}

export class ResponseTable {
  private readonly rows = new Map<string, number>();
  private readonly names: string[] = [];
  private readonly nameIds = new Map<string, number>();
  private capacity = FIRST_CAPACITY;
  private nameCells = new Int32Array(NAME_WIDTH * FIRST_CAPACITY);
  private flagCells = new Uint8Array(FIRST_CAPACITY);
  private usageCells = new Float64Array(USAGE_WIDTH * FIRST_CAPACITY);

  get size(): number {
    return this.rows.size;
  }

  /** 응답 ID의 줄 번호. 처음 보는 ID면 줄을 더하고 isNew를 참으로 돌려준다. */
  row(id: string, date: LocalDate | null, synthetic: boolean): { row: number; isNew: boolean } {
    const known = this.rows.get(id);
    if (known !== undefined) return { row: known, isNew: false };
    const row = this.rows.size;
    if (row === this.capacity) this.grow();
    const base = row * NAME_WIDTH;
    this.nameCells[base + DATE] = this.nameId(date);
    this.nameCells.fill(NONE, base + MODEL, base + NAME_WIDTH);
    this.flagCells[row] = synthetic ? SYNTHETIC : 0;
    this.usageCells.fill(0, row * USAGE_WIDTH, (row + 1) * USAGE_WIDTH);
    this.rows.set(id, row);
    return { row, isNew: true };
  }

  private grow(): void {
    const capacity = Math.ceil(this.capacity * 1.5);
    const names = new Int32Array(NAME_WIDTH * capacity);
    names.set(this.nameCells);
    this.nameCells = names;
    const flags = new Uint8Array(capacity);
    flags.set(this.flagCells);
    this.flagCells = flags;
    const usage = new Float64Array(USAGE_WIDTH * capacity);
    usage.set(this.usageCells);
    this.usageCells = usage;
    this.capacity = capacity;
  }

  isSynthetic(row: number): boolean {
    return (this.flagCells[row]! & SYNTHETIC) !== 0;
  }

  /** 아직 값이 없을 때만 채운다(모델·강도는 처음 값을 쓴다). */
  fillFirst(row: number, column: "model" | "effort", value: string | null): void {
    const at = row * NAME_WIDTH + (column === "model" ? MODEL : EFFORT);
    if (value !== null && this.nameCells[at] === NONE) this.nameCells[at] = this.nameId(value);
  }

  /** 마지막 값으로 바꾼다(귀속). */
  setLast(row: number, column: "skill" | "mcpServer", value: string | null): void {
    if (value !== null) this.nameCells[row * NAME_WIDTH + (column === "skill" ? SKILL : SERVER)] = this.nameId(value);
  }

  setUsage(row: number, usage: ResponseUsage): void {
    const base = row * USAGE_WIDTH;
    this.usageCells[base] = usage.input;
    this.usageCells[base + 1] = usage.cacheRead;
    this.usageCells[base + 2] = usage.cacheWrite;
    this.usageCells[base + 3] = usage.output;
    this.usageCells[base + 4] = usage.thinking;
    this.flagCells[row] = this.flagCells[row]! | HAS_USAGE;
  }

  /** 마지막으로 적힌 끊긴 까닭이 길이 제한인지 적는다. */
  setStop(row: number, stop: string): void {
    const flags = this.flagCells[row]!;
    this.flagCells[row] = stop === "max_tokens" ? flags | LENGTH_STOP : flags & ~LENGTH_STOP;
  }

  /** 들어온 차례로 응답을 하나씩 돌려준다. */
  *fold(): Generator<FoldedResponse> {
    for (let row = 0; row < this.rows.size; row++) {
      const names = row * NAME_WIDTH;
      const usage = row * USAGE_WIDTH;
      const flags = this.flagCells[row]!;
      yield {
        date: this.name(this.nameCells[names + DATE]!),
        synthetic: (flags & SYNTHETIC) !== 0,
        model: this.name(this.nameCells[names + MODEL]!),
        effort: this.name(this.nameCells[names + EFFORT]!),
        lengthStop: (flags & LENGTH_STOP) !== 0,
        usage:
          (flags & HAS_USAGE) === 0
            ? null
            : {
                input: this.usageCells[usage]!,
                cacheRead: this.usageCells[usage + 1]!,
                cacheWrite: this.usageCells[usage + 2]!,
                output: this.usageCells[usage + 3]!,
                thinking: this.usageCells[usage + 4]!,
              },
        skill: this.name(this.nameCells[names + SKILL]!),
        mcpServer: this.name(this.nameCells[names + SERVER]!),
      };
    }
  }

  private nameId(value: string | null): number {
    if (value === null) return NONE;
    let id = this.nameIds.get(value);
    if (id === undefined) {
      id = this.names.length;
      this.names.push(value);
      this.nameIds.set(value, id);
    }
    return id;
  }

  private name(id: number): string | null {
    return id === NONE ? null : this.names[id]!;
  }
}
```

`src/adapters/claude/parser.ts`:

```ts
// Claude Code 세션 파일의 줄을 받아 날짜별 세션 요약으로 바꾼다. 파일을 열지 않는 순수 해석부다(설계 9.3, 9.5, 9.8)
import { nameRecord, sortedRecord } from "../common/canonical.ts";
import { localDateOfIso, type LocalDate } from "../common/dates.ts";
import { fnv1a64 } from "../common/hash.ts";
import { outerTypeOf } from "../common/outer-type.ts";
import { maxVersion } from "../common/version.ts";
import {
  canonicalDay,
  emptyDay,
  emptySkillSignalCounts,
  type DayCell,
  type SessionKind,
  type SessionSummary,
  type SkillSignalCounts,
} from "../types.ts";
import { ResponseTable } from "./responses.ts";

export const CLAUDE_PARSER_VERSION = 1;

/** 숫자를 세는 종류. 그 밖의 종류는 풀리는지와 날짜만 본다(설계 9.4) */
const COUNTED_TYPES: ReadonlySet<string> = new Set(["assistant", "user", "attachment", "system"]);
const FIRST_RESPONSE_IDS = 20;

type Json = Record<string, unknown>;

export interface ParserContext {
  sessionId: string;
  kind: SessionKind;
  parentSessionId: string | null;
  timeZone: string;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const obj = (value: unknown): Json | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
const bump = (record: Record<string, number>, key: string, by = 1): void => {
  record[key] = (Object.hasOwn(record, key) ? record[key]! : 0) + by;
};

function parseObject(text: string): Json | null {
  try {
    return obj(JSON.parse(text));
  } catch {
    return null;
  }
}

export class ClaudeSessionParser {
  private readonly days = new Map<LocalDate, DayCell>();
  private readonly responses = new ResponseTable();
  private readonly firstIds: string[] = [];
  private lastDate: LocalDate | null = null;
  private firstDate: LocalDate | null = null;
  private version: string | null = null;
  private cwd: string | null = null;
  private lines = 0;
  private brokenLines = 0;
  private tailFragments = 0;
  private tooLongLines = 0;
  private readonly unconfirmedTypes = nameRecord<number>();
  private responsesWithoutId = 0;
  private undatedLines = 0;
  private readonly unknownHookKinds = nameRecord<number>();

  constructor(private readonly ctx: ParserContext) {}

  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다. 모든 줄을 JSON으로 풀어 보고, 숫자는 세는 종류의 줄에서만 센다. */
  line(text: string): void {
    if (text.trim() === "") return;
    this.lines++;
    const parsed = parseObject(text);
    if (parsed === null) this.missing(text, "broken");
    else this.accept(parsed);
  }

  /** 상한을 넘은 줄 하나를 받는다. */
  tooLong(): void {
    this.lines++;
    this.tooLongLines++;
  }

  /** 끝 조각을 정리하고 요약을 낸다. 한 번만 부른다. */
  finish(tail: string | null, inProgress: boolean): SessionSummary {
    if (tail !== null && tail.trim() !== "") {
      this.lines++;
      const parsed = parseObject(tail);
      if (parsed !== null) this.accept(parsed);
      else this.missing(tail, inProgress ? "tail" : "broken");
    }
    const syntheticResponses = this.foldResponses();
    const days: Record<LocalDate, DayCell> = {};
    for (const date of [...this.days.keys()].sort()) days[date] = canonicalDay(this.days.get(date)!);
    return {
      tool: "claude-code",
      sessionId: this.ctx.sessionId,
      kind: this.ctx.kind,
      parentSessionId: this.ctx.parentSessionId,
      cwd: this.cwd,
      version: this.version,
      firstDate: this.firstDate,
      days,
      instructionChars: null,
      initialSkills: null,
      initialMcpServers: null,
      missing: {
        lines: this.lines,
        brokenLines: this.brokenLines,
        tailFragments: this.tailFragments,
        tooLongLines: this.tooLongLines,
        unconfirmedTypes: sortedRecord(this.unconfirmedTypes),
      },
      firstResponseIdHashes: this.firstIds.map(fnv1a64),
      notes: {
        syntheticResponses,
        responsesWithoutId: this.responsesWithoutId,
        undatedLines: this.undatedLines,
        unknownHookKinds: sortedRecord(this.unknownHookKinds),
      },
    };
  }

  /** 응답마다 마지막 사용량을 날짜 칸에 더한다. 합성 응답의 수를 돌려준다. */
  private foldResponses(): number {
    let synthetic = 0;
    for (const response of this.responses.fold()) {
      if (response.synthetic) {
        synthetic++;
        continue;
      }
      if (response.date === null) continue;
      const day = this.day(response.date);
      day.responses++;
      if (response.usage !== null) {
        day.tokens.input += response.usage.input;
        day.tokens.cacheRead += response.usage.cacheRead;
        day.tokens.cacheWrite += response.usage.cacheWrite;
        day.tokens.output += response.usage.output;
        day.tokens.thinking += response.usage.thinking;
      }
      if (response.model !== null) bump(day.models, response.model);
      if (response.effort !== null) bump(day.efforts, response.effort);
      else day.unknownEffort++;
      if (response.lengthStop) day.lengthStops++;
      if (response.skill !== null) this.skillSignal(day, response.skill).attribution++;
      if (response.mcpServer !== null) bump(day.mcpAttributions, response.mcpServer);
    }
    return synthetic;
  }

  private missing(text: string, kind: "broken" | "tail"): void {
    if (kind === "broken") this.brokenLines++;
    else this.tailFragments++;
    bump(this.unconfirmedTypes, outerTypeOf(text) ?? "?");
  }

  /** 풀린 줄 하나. 종류와 상관없이 그 줄의 시각을 앞 줄의 날짜와 가장 이른 날짜에 쓰고, 세는 종류면 해석한다. */
  private accept(line: Json): void {
    const own = localDateOfIso(line.timestamp, this.ctx.timeZone);
    if (own !== null) {
      this.lastDate = own;
      if (this.firstDate === null || own < this.firstDate) this.firstDate = own;
    }
    if (typeof line.type === "string" && COUNTED_TYPES.has(line.type)) this.handle(line, this.dateOf(own));
  }

  /** 세는 줄의 날짜. 시각이 없으면 앞 줄(종류와 상관없이)의 날짜를 쓰고, 앞 줄도 없으면 날짜 없는 줄로 센다. */
  private dateOf(own: LocalDate | null): LocalDate | null {
    if (own !== null) return own;
    if (this.lastDate === null) this.undatedLines++;
    return this.lastDate;
  }

  private day(date: LocalDate): DayCell {
    let day = this.days.get(date);
    if (day === undefined) {
      day = emptyDay();
      this.days.set(date, day);
    }
    return day;
  }

  private skillSignal(day: DayCell, name: string): SkillSignalCounts {
    let counts = day.skillSignals[name];
    if (counts === undefined) {
      counts = emptySkillSignalCounts();
      day.skillSignals[name] = counts;
    }
    return counts;
  }

  private handle(line: Json, date: LocalDate | null): void {
    if (this.cwd === null) this.cwd = str(line.cwd);
    if (line.type === "assistant") this.onAssistant(line, date);
  }

  private onAssistant(line: Json, date: LocalDate | null): void {
    const version = str(line.version);
    if (version !== null) this.version = maxVersion([this.version, version]);
    const message = obj(line.message) ?? {};
    const id = str(message.id);
    if (id === null) {
      this.responsesWithoutId++;
      return;
    }
    const { row, isNew } = this.responses.row(id, date, message.model === "<synthetic>");
    if (isNew && !this.responses.isSynthetic(row) && this.firstIds.length < FIRST_RESPONSE_IDS) this.firstIds.push(id);
    this.responses.fillFirst(row, "model", str(message.model));
    this.responses.fillFirst(row, "effort", str(line.effort));
    const usage = obj(message.usage);
    if (usage !== null) {
      this.responses.setUsage(row, {
        input: num(usage.input_tokens),
        cacheRead: num(usage.cache_read_input_tokens),
        cacheWrite: num(usage.cache_creation_input_tokens),
        output: num(usage.output_tokens),
        thinking: num(obj(usage.output_tokens_details)?.thinking_tokens),
      });
    }
    const stop = str(message.stop_reason);
    if (stop !== null) this.responses.setStop(row, stop);
    this.responses.setLast(row, "skill", str(line.attributionSkill));
    this.responses.setLast(row, "mcpServer", str(line.attributionMcpServer));
  }
}
```

- [ ] **Step 5: 시험과 타입 검사가 통과하는지 본다**

Run: `npx vitest run test/adapters/claude/parser-responses.test.ts` → PASS(20개).
Run: `npx tsc --noEmit` → 출력 없음.

- [ ] **Step 6: 커밋한다**

```bash
git add src/adapters/claude/responses.ts src/adapters/claude/parser.ts test/helpers/claude-lines.ts test/adapters/claude/parser-responses.test.ts
git commit -m "feat: Claude Code 응답·토큰·깨진 줄 해석 추가"
```

---

### Task 9: 줄 해석 2 — 도구, 거절, 사람 요청

**Files:**
- Modify: `src/adapters/claude/parser.ts`
- Test: `test/adapters/claude/parser-tools-requests.test.ts`

**Interfaces:**
- Consumes: `classifyUser`, `denialOf`, `isInterruptMarker`, `slashCommandOf`, `DenialKind`(Task 7), `ToolCounts`·`emptyToolCounts`(Task 6)
- Produces: `SHELL_TOOLS`, `SUBAGENT_TOOLS`, `UNKNOWN_TOOL = "?"`, `toolKey(name: string): string`(MCP 도구는 `mcp__<서버>`)
- 규약.
  - 도구 호출은 `tool_use` 블록 ID로 한 번 센다. 결과는 `tool_use_id`로 호출의 도구 이름을 찾아 센다. 찾지 못하면 `"?"`다.
  - 거절 표시가 붙은 `user` 줄 하나가 한 건이고, 그 줄의 첫 도구 결과의 도구에 적는다. 그 줄의 결과는 `results`와 `errors`에 넣지 않는다(설계 9.5 「거절과 끊김」).
  - 도구 결과·거절·끊은 표지·슬래시 명령은 사람 요청 판별과 따로 본다. 판별표 1번은 사람 요청을 세지 않는 규칙일 뿐이라서, 하위 세션과 `isSidechain` 줄의 도구 결과·오류·거절과 끊은 표지도 센다(설계 9.2). 결과 블록도 거절 표시도 없는 줄에서는 아무것도 세지 않는다.
  - 사람 요청 판별은 Task 7의 `classifyUser`다. `origin`이 없는 명령 줄은 다음 사람 입력(사람 요청·근거가 약한 사람 요청·다른 명령) 전에 새 응답(합성 아님)이 나오면 그 명령의 날짜에 사람 요청으로 세고, 아니면 세지 않는다.
  - 끊은 표지는 바로 앞의 `user` 줄이 사람이 거절한 도구 결과이고 그 사이에 `assistant` 줄이 없으면 끊은 턴으로 세지 않는다.
  - 슬래시 명령의 이름(`slashCommandOf`, `origin`과 상관없음)은 주 세션과 하위 세션, `isSidechain` 줄에서 모두 모아 두고 신호 3(Task 10)에 쓴다. 스킬 사용 신호는 주 세션과 하위 세션을 합친다(설계 9.2).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/claude/parser-tools-requests.test.ts`:

```ts
// 도구 호출·결과·오류·거절과 사람 요청 판별을 줄 해석에서 시험한다(설계 9.5, 21.1 반례)
import { describe, expect, it } from "vitest";
import { assistant, parseLines, toolResult, toolUse, user } from "../../helpers/claude-lines.ts";

const D1 = "2026-11-11";
const at = (second: number): string => `${D1}T10:00:${String(second).padStart(2, "0")}Z`;

describe("도구", () => {
  it("도구 호출은 블록 ID로 한 번만 센다", () => {
    const call = toolUse("t1", "Read");
    const s = parseLines([assistant({ id: "m1", at: at(0), content: [call] }), assistant({ id: "m1", at: at(1), content: [call] })]);
    expect(s.days[D1]!.tools.Read!.calls).toBe(1);
  });
  it("결과와 오류는 호출의 도구 이름으로 센다. 셸 도구의 오류는 셸 도구에 따로 쌓인다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Bash"), toolUse("t2", "Read")] }),
      user({ at: at(1), content: [toolResult("t1", true)] }),
      user({ at: at(2), content: [toolResult("t2", true)] }),
    ]);
    expect(s.days[D1]!.tools.Bash).toMatchObject({ calls: 1, results: 1, errors: 1 });
    expect(s.days[D1]!.tools.Read).toMatchObject({ calls: 1, results: 1, errors: 1 });
  });
  it("거절 다섯 종류는 결과와 오류에서 빼고 종류별로 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("a", "Bash"), toolUse("b", "Bash"), toolUse("c", "Edit"), toolUse("d", "Bash"), toolUse("e", "Read")] }),
      user({ at: at(1), content: [toolResult("a", true)], extra: { toolDenialKind: "user-rejected" } }),
      user({ at: at(2), content: [toolResult("b", true)], extra: { toolDenialKind: "permission-rule", permissionDecision: { decision: "reject", source: "hook" } } }),
      user({ at: at(3), content: [toolResult("c", true)], extra: { toolDenialKind: "interrupted" } }),
      user({ at: at(4), content: [toolResult("d", true)], extra: { toolDenialKind: "permission-rule" } }),
      user({ at: at(5), content: [toolResult("e", true)], extra: { toolDenialKind: "brand-new" } }),
    ]);
    const day = s.days[D1]!;
    expect(day.tools.Bash).toMatchObject({ results: 0, errors: 0, deniedByUser: 1, deniedByHook: 1, deniedByPermission: 1 });
    expect(day.tools.Edit).toMatchObject({ results: 0, errors: 0, interrupted: 1 });
    expect(day.tools.Read).toMatchObject({ results: 0, errors: 0, unknownDenial: 1 });
    expect(day.unknownDenialKinds).toEqual({ "brand-new": 1 });
  });
  it("허락(accept) 표시가 붙은 결과는 보통 결과다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Read")] }),
      user({ at: at(1), content: [toolResult("t1", false)], extra: { permissionDecision: { decision: "accept", source: "config" } } }),
    ]);
    expect(s.days[D1]!.tools.Read).toMatchObject({ results: 1, errors: 0, deniedByPermission: 0 });
  });
  it("MCP 도구는 서버로 묶어 세고, 하위 에이전트와 스킬 도구 호출을 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "mcp__srv_a__do_thing"), toolUse("t2", "Agent"), toolUse("t3", "Skill", { skill: "review" })] }),
    ]);
    const day = s.days[D1]!;
    expect(day.mcpCalls).toEqual({ srv_a: 1 });
    expect(day.tools["mcp__srv_a"]!.calls).toBe(1);
    expect(day.subagentCalls).toBe(1);
    expect(day.skillSignals.review!.tool).toBe(1);
  });
});

describe("사람 요청", () => {
  it("origin이 human이면 사람 요청이고 권한 모드를 센다", () => {
    const s = parseLines([user({ at: at(0), content: "do it", origin: "human", extra: { permissionMode: "bypassPermissions" } })]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    expect(s.days[D1]!.permissionModes).toEqual({ bypassPermissions: 1 });
  });
  it("작업 알림은 사람 요청이 아니고 종류별로 센다", () => {
    const s = parseLines([user({ at: at(0), content: "<task-notification>x</task-notification>", origin: "task-notification" })]);
    expect(s.days[D1]!.humanRequests).toBe(0);
    expect(s.days[D1]!.nonHumanInputs).toEqual({ "origin:task-notification": 1 });
  });
  it("origin 없는 평문은 근거가 약한 사람 요청으로도 센다", () => {
    const s = parseLines([user({ at: at(0), content: "old version prompt" })]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    expect(s.days[D1]!.weakHumanRequests).toBe(1);
  });
  it("끊은 턴의 표지는 사람 요청이 아니고 끊은 턴으로 센다", () => {
    const s = parseLines([user({ at: at(0), content: "[Request interrupted by user]" })]);
    expect(s.days[D1]!.humanRequests).toBe(0);
    expect(s.days[D1]!.weakHumanRequests).toBe(0);
    expect(s.days[D1]!.interruptedTurns).toBe(1);
  });
  it("사람이 거절한 결과 바로 뒤의 끊은 표지는 다시 세지 않는다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Bash")] }),
      user({ at: at(1), content: [toolResult("t1", true)], extra: { toolDenialKind: "user-rejected" } }),
      user({ at: at(2), content: "[Request interrupted by user for tool use]" }),
    ]);
    expect(s.days[D1]!.tools.Bash!.deniedByUser).toBe(1);
    expect(s.days[D1]!.interruptedTurns).toBe(0);
  });
  it("표지 앞의 user 줄이 보통의 도구 결과면 끊은 턴으로 센다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Read")] }),
      user({ at: at(1), content: [toolResult("t1", false)] }),
      user({ at: at(2), content: "[Request interrupted by user]" }),
    ]);
    expect(s.days[D1]!.interruptedTurns).toBe(1);
  });
  it("거절 뒤에 응답이 있었으면 그 뒤의 표지는 끊은 턴이다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Bash")] }),
      user({ at: at(1), content: [toolResult("t1", true)], extra: { toolDenialKind: "user-rejected" } }),
      assistant({ id: "m2", at: at(2) }),
      user({ at: at(3), content: "[Request interrupted by user]" }),
    ]);
    expect(s.days[D1]!.tools.Bash!.deniedByUser).toBe(1);
    expect(s.days[D1]!.interruptedTurns).toBe(1);
  });
  it("응답이 뒤따른 슬래시 명령은 사람 요청이다. <command-message>가 먼저인 명령 줄도 같다", () => {
    const s = parseLines([user({ at: at(0), content: "<command-name>/review</command-name>" }), assistant({ id: "m1", at: at(1) })]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    const t = parseLines([
      user({ at: at(0), content: "<command-message>review is running</command-message>\n<command-name>/review</command-name>" }),
      assistant({ id: "m1", at: at(1) }),
    ]);
    expect(t.days[D1]!.humanRequests).toBe(1);
    expect(t.days[D1]!.nonHumanInputs).toEqual({});
  });
  it("응답이 뒤따르지 않은 슬래시 명령은 사람 요청이 아니다", () => {
    const s = parseLines([
      user({ at: at(0), content: "<command-name>/clear</command-name>" }),
      user({ at: at(1), content: "next", origin: "human" }),
      assistant({ id: "m1", at: at(2) }),
      user({ at: at(3), content: "<command-name>/model</command-name>" }),
    ]);
    expect(s.days[D1]!.humanRequests).toBe(1);
  });
  it("하위 세션에서도 도구 결과·오류·허락 표시 결과·거절을 센다. 사람 요청은 아니다", () => {
    const s = parseLines(
      [
        user({ at: at(0), content: "task", origin: "human" }),
        assistant({ id: "m1", at: at(1), content: [toolUse("t1", "Read"), toolUse("t2", "Read"), toolUse("t3", "Bash")] }),
        user({ at: at(2), content: [toolResult("t1", true)] }),
        user({ at: at(3), content: [toolResult("t2", false)], extra: { permissionDecision: { decision: "accept", source: "config" } } }),
        user({ at: at(4), content: [toolResult("t3", true)], extra: { toolDenialKind: "user-rejected" } }),
      ],
      { kind: "sub" },
    );
    const day = s.days[D1]!;
    expect(day.tools.Read).toMatchObject({ calls: 2, results: 2, errors: 1 });
    expect(day.tools.Bash).toMatchObject({ calls: 1, results: 0, errors: 0, deniedByUser: 1 });
    expect(day.humanRequests).toBe(0);
  });
  it("주 세션 파일의 isSidechain 줄도 도구 결과는 세고 사람 요청은 세지 않는다", () => {
    const s = parseLines([
      assistant({ id: "m1", at: at(0), content: [toolUse("t1", "Read")] }),
      user({ at: at(1), content: [toolResult("t1", true)], extra: { isSidechain: true } }),
      user({ at: at(2), content: "sub task", origin: "human", extra: { isSidechain: true } }),
    ]);
    expect(s.days[D1]!.tools.Read).toMatchObject({ results: 1, errors: 1 });
    expect(s.days[D1]!.humanRequests).toBe(0);
  });
  it("하위 세션의 끊은 표지도 끊은 턴으로 센다", () => {
    const s = parseLines([user({ at: at(0), content: "[Request interrupted by user]" })], { kind: "sub" });
    expect(s.days[D1]!.interruptedTurns).toBe(1);
    expect(s.days[D1]!.humanRequests).toBe(0);
  });
  it("하위 세션의 user 줄은 사람 요청이 아니다", () => {
    const s = parseLines([user({ at: at(0), content: "task", origin: "human" })], { kind: "sub" });
    expect(s.days[D1]!.humanRequests).toBe(0);
    expect(s.days[D1]!.nonHumanInputs).toEqual({ "subagent-input": 1 });
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/claude/parser-tools-requests.test.ts`
Expected: FAIL. 도구 칸(`tools.Read` 등)이 `undefined`이고 사람 요청이 0이다.

- [ ] **Step 3: `parser.ts`에 도구와 user 줄을 더한다**

`../types.ts`에서 가져오는 부분을 아래로 바꾼다(`emptyToolCounts`와 `type ToolCounts`를 더했다).

```ts
import {
  canonicalDay,
  emptyDay,
  emptySkillSignalCounts,
  emptyToolCounts,
  type DayCell,
  type SessionKind,
  type SessionSummary,
  type SkillSignalCounts,
  type ToolCounts,
} from "../types.ts";
```

`./responses.ts`를 가져오는 줄 바로 위에 더한다.

```ts
import { classifyUser, denialOf, isInterruptMarker, slashCommandOf, type DenialKind } from "./classify.ts";
```

`FIRST_RESPONSE_IDS` 상수 아래에 더한다.

```ts
export const SHELL_TOOLS: ReadonlySet<string> = new Set(["Bash", "PowerShell"]);
export const SUBAGENT_TOOLS: ReadonlySet<string> = new Set(["Agent", "Task"]);
export const UNKNOWN_TOOL = "?";

/** 도구 이름을 세는 열쇠로 바꾼다. MCP 도구(mcp__<서버>__<도구>)는 서버로 묶는다. */
export function toolKey(name: string): string {
  if (!name.startsWith("mcp__")) return name;
  const parts = name.split("__");
  return `mcp__${parts[1] !== undefined && parts[1] !== "" ? parts[1] : UNKNOWN_TOOL}`;
}
```

`ClaudeSessionParser`의 필드 목록 끝(`unknownHookKinds` 아래)에 더한다.

```ts
  private readonly toolNames = new Map<string, string>();
  private pendingCommand: { date: LocalDate; mode: string | null } | null = null;
  private readonly slashCommands: Array<{ name: string; date: LocalDate }> = [];
  private lastUserWasUserRejection = false;
```

`handle()`을 아래로 바꾼다.

```ts
  private handle(line: Json, date: LocalDate | null): void {
    if (this.cwd === null) this.cwd = str(line.cwd);
    if (line.type === "assistant") this.onAssistant(line, date);
    else if (line.type === "user") this.onUser(line, date);
  }
```

`onAssistant()`를 아래로 바꾼다(앞 과제의 내용에 도구 호출, 명령 해결, 거절 뒤 응답 표시를 더했다).

```ts
  private onAssistant(line: Json, date: LocalDate | null): void {
    this.lastUserWasUserRejection = false;
    const version = str(line.version);
    if (version !== null) this.version = maxVersion([this.version, version]);
    const message = obj(line.message) ?? {};
    const id = str(message.id);
    if (id === null) {
      this.responsesWithoutId++;
    } else {
      const { row, isNew } = this.responses.row(id, date, message.model === "<synthetic>");
      if (isNew && !this.responses.isSynthetic(row)) {
        if (this.firstIds.length < FIRST_RESPONSE_IDS) this.firstIds.push(id);
        this.resolvePending(true);
      }
      this.responses.fillFirst(row, "model", str(message.model));
      this.responses.fillFirst(row, "effort", str(line.effort));
      const usage = obj(message.usage);
      if (usage !== null) {
        this.responses.setUsage(row, {
          input: num(usage.input_tokens),
          cacheRead: num(usage.cache_read_input_tokens),
          cacheWrite: num(usage.cache_creation_input_tokens),
          output: num(usage.output_tokens),
          thinking: num(obj(usage.output_tokens_details)?.thinking_tokens),
        });
      }
      const stop = str(message.stop_reason);
      if (stop !== null) this.responses.setStop(row, stop);
      this.responses.setLast(row, "skill", str(line.attributionSkill));
      this.responses.setLast(row, "mcpServer", str(line.attributionMcpServer));
    }
    if (date === null || !Array.isArray(message.content)) return;
    for (const raw of message.content) {
      const block = obj(raw);
      if (block === null || block.type !== "tool_use") continue;
      const blockId = str(block.id);
      if (blockId === null || this.toolNames.has(blockId)) continue;
      const name = str(block.name) ?? UNKNOWN_TOOL;
      const key = toolKey(name);
      this.toolNames.set(blockId, key);
      const day = this.day(date);
      this.tool(day, key).calls++;
      if (key.startsWith("mcp__")) bump(day.mcpCalls, key.slice("mcp__".length));
      if (SUBAGENT_TOOLS.has(name)) day.subagentCalls++;
      if (name === "Skill") {
        const skill = str(obj(block.input)?.skill);
        if (skill !== null) this.skillSignal(day, skill).tool++;
      }
    }
  }
```

클래스 끝에 새 메서드를 더한다.

```ts
  /**
   * user 줄. 사람 요청은 판별표로 가르고(하위 세션은 세지 않는다), 도구 결과·거절·끊은 표지·슬래시 명령은
   * 판별표와 따로 본다. 하위 세션의 도구 결과, 끊은 표지, 슬래시 명령도 센다(설계 9.2, 9.5).
   */
  private onUser(line: Json, date: LocalDate | null): void {
    const verdict = classifyUser(line, this.ctx.kind === "sub");
    const denial = denialOf(line);
    const afterUserRejection = this.lastUserWasUserRejection;
    this.lastUserWasUserRejection = denial !== null && denial.kind === "user";
    if (date === null) return;
    const day = this.day(date);
    this.toolResults(line, day, denial);
    if (isInterruptMarker(line) && !afterUserRejection) day.interruptedTurns++;
    const slash = slashCommandOf(line);
    if (slash !== null) this.slashCommands.push({ name: slash, date });
    switch (verdict.kind) {
      case "human":
        this.resolvePending(false);
        day.humanRequests++;
        if (verdict.weak) day.weakHumanRequests++;
        this.countMode(day, line);
        break;
      case "command":
        this.resolvePending(false);
        this.pendingCommand = { date, mode: str(line.permissionMode) };
        break;
      case "skip":
        bump(day.nonHumanInputs, verdict.reason);
        break;
      case "tool-result":
        break;
    }
  }

  /** 도구 결과를 센다. 거절 표시가 붙은 줄은 한 건으로, 첫 결과의 도구에 종류별로 적는다. 결과도 거절 표시도 없으면 아무것도 세지 않는다. */
  private toolResults(line: Json, day: DayCell, denial: { kind: DenialKind; raw: string | null } | null): void {
    const message = obj(line.message) ?? {};
    const results: Json[] = [];
    if (Array.isArray(message.content)) {
      for (const raw of message.content) {
        const block = obj(raw);
        if (block !== null && block.type === "tool_result") results.push(block);
      }
    }
    if (denial !== null) {
      const first = results[0];
      const counts = this.tool(day, first === undefined ? UNKNOWN_TOOL : this.toolNameOf(first));
      if (denial.kind === "user") counts.deniedByUser++;
      else if (denial.kind === "hook") counts.deniedByHook++;
      else if (denial.kind === "permission") counts.deniedByPermission++;
      else if (denial.kind === "interrupted") counts.interrupted++;
      else {
        counts.unknownDenial++;
        bump(day.unknownDenialKinds, denial.raw ?? UNKNOWN_TOOL);
      }
      return;
    }
    for (const block of results) {
      const counts = this.tool(day, this.toolNameOf(block));
      counts.results++;
      if (block.is_error === true) counts.errors++;
    }
  }

  private toolNameOf(block: Json): string {
    const id = str(block.tool_use_id);
    return (id === null ? undefined : this.toolNames.get(id)) ?? UNKNOWN_TOOL;
  }

  private tool(day: DayCell, name: string): ToolCounts {
    let counts = day.tools[name];
    if (counts === undefined) {
      counts = emptyToolCounts();
      day.tools[name] = counts;
    }
    return counts;
  }

  private countMode(day: DayCell, line: Json): void {
    const mode = str(line.permissionMode);
    if (mode !== null) bump(day.permissionModes, mode);
  }

  /** 기다리는 명령을 정리한다. 응답이 뒤따랐으면 명령의 날짜에 사람 요청으로 센다. */
  private resolvePending(responded: boolean): void {
    if (this.pendingCommand === null) return;
    if (responded) {
      const day = this.day(this.pendingCommand.date);
      day.humanRequests++;
      if (this.pendingCommand.mode !== null) bump(day.permissionModes, this.pendingCommand.mode);
    }
    this.pendingCommand = null;
  }
```

`finish()`는 바꾸지 않는다. 끝까지 응답이 뒤따르지 않은 명령은 셀 것이 없다.

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 본다**

Run: `npx vitest run test/adapters/claude` → 이 과제의 18개와 앞 과제의 시험이 모두 PASS.
Run: `npx tsc --noEmit` → 출력 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/claude/parser.ts test/adapters/claude/parser-tools-requests.test.ts
git commit -m "feat: Claude Code 도구·거절·사람 요청 해석 추가"
```

---

### Task 10: 줄 해석 3 — 첨부, system, 실린 이름, 슬래시 명령 신호

**Files:**
- Modify: `src/adapters/claude/parser.ts`
- Test: `test/adapters/claude/parser-attachments.test.ts`

**Interfaces:**
- Produces: `KNOWN_HOOK_ATTACHMENTS`(`hook_success`, `hook_non_blocking_error`, `hook_blocking_error`, `hook_additional_context`), `HOOK_FAILURE_MARKERS`(`blocking because onFailure is`, `blocking because Git Bash wasn't found`)
- 규약(설계 9.5).
  - 실린 스킬은 `skill_listing`의 `names`다. `isInitial`이 참이면 갈아 치우고 아니면 더한다. 실린 MCP 서버는 `mcp_instructions_delta`의 `addedNames`와 `removedNames`를 따른다. 세는 종류의 줄을 하나 읽을 때마다 그 줄의 날짜 칸에 그때 실려 있던 이름을 더한다. 그래서 응답의 이어지는 줄만 있는 날에도 날짜 칸이 생긴다(과제 8의 날짜 시험은 칸이 있는지가 아니라 응답과 토큰이 어느 날에 들어가는지를 본다).
  - 다시 실린 이름. 갈아 치운 새 목록에 없는 스킬과 `removedNames`에 든 서버(그 전에 더해진 것을 봤는지와 상관없다)는 "빠진 이름"으로 두고, 그 이름이 세션 안에서 다시 실리면 그 줄의 날짜 칸의 `reloadedSkills`, `reloadedMcpServers`에 적는다(설계 9.3, 11.3 ㉱). 처음 목록과 같은 목록이 다시 오는 것은 빠짐이 아니다.
  - 세션의 처음 목록. `initialSkills`는 세션의 첫 `isInitial` 목록의 이름(사전순)이고, 그런 목록이 없으면 `null`이다. `initialMcpServers`는 세션의 첫 `assistant` 줄을 해석하기 바로 앞에 실려 있던 MCP 서버의 이름(사전순)이다. 그때까지 MCP 목록 첨부가 없었으면 빈 목록이고, 응답이 없는 세션이면 `null`이다. 빈 목록은 시작할 때 실린 것이 없었다는 뜻이고 `null`은 알 수 없다는 뜻이다(설계 9.3). 처음 목록에 없다가 뒤에 실린 이름은 2단계가 날짜별 이름에서 처음 목록을 빼서 안다(설계 9.3). 이 PC의 기록에서는 첫 응답 뒤에 늦게 실리는 MCP 서버가 적지 않았다.
  - 슬래시 명령 신호는 명령의 이름이 그 세션에서 한 번이라도 실린 스킬의 이름일 때만 센다. 응답이 뒤따랐는지와 `origin`은 따지지 않는다. 사람이 친 스킬 명령(`<command-message>`가 먼저, `origin`이 `human`)은 사람 요청이자 신호 3이다.
  - 스킬 주입은 `invoked_skills`의 `skills[].name`이다.
  - MCP 연결 실패는 `deferred_tools_delta`의 `failedMcpServers`가 비어 있지 않은 줄의 날짜 칸에 적는다.
  - 훅은 `hook_success`를 실행, `hook_non_blocking_error`를 실행이면서 실패로 센다. `hook_blocking_error`는 `attachment.blockingError`가 문자열이면 그 글, 객체면 그 안의 `blockingError` 문자열에 `HOOK_FAILURE_MARKERS` 가운데 하나가 있으면 실행이면서 실패이고, 없으면(표지가 `command`에만 있거나 글이 없어도) `unclassifiedBlocks`로만 센다. 글은 표지만 보고 버리고 요약에 남지 않는다. `hook_additional_context`는 세지 않는다. `hook_`으로 시작하는 그 밖의 첨부는 종류별 수만 낸다. `system`의 `stop_hook_summary`는 세지 않는다.
  - 지침 크기는 세션에서 처음 실린 `instructions`의 `files[].content` 글자를 ASCII와 그 밖으로 나눠 센다. 글은 버린다.
  - 자동 압축은 `compact_boundary`의 `compactMetadata.trigger`가 `auto`인 것, 계기가 없으면 자동인지 모르는 압축, `manual`은 세지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/claude/parser-attachments.test.ts`:

```ts
// 첨부와 system 줄(실린 이름, 스킬 신호, MCP 연결 실패, 훅, 지침 크기, 압축)을 줄 해석에서 시험한다(설계 9.5, 21.1 반례)
import { describe, expect, it } from "vitest";
import { assistant, attachment, parseLines, system, user } from "../../helpers/claude-lines.ts";

const D1 = "2026-11-11";
const D2 = "2026-11-12";
const t = (date: string, second = 0): string => `${date}T10:00:${String(second).padStart(2, "0")}Z`;

describe("실린 이름", () => {
  it("처음 목록에 변경분을 더하고, 날짜마다 그날 실려 있던 이름을 적는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a", "b"] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: false, names: ["c"] }),
      assistant({ id: "m1", at: t(D2) }),
    ]);
    expect(s.days[D1]!.loadedSkills).toEqual(["a", "b", "c"]);
    expect(s.days[D2]!.loadedSkills).toEqual(["a", "b", "c"]);
  });
  it("새 처음 목록은 앞 목록을 갈아 치운다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a"] }),
      attachment(t(D2), { type: "skill_listing", isInitial: true, names: ["b"] }),
    ]);
    expect(s.days[D1]!.loadedSkills).toEqual(["a"]);
    expect(s.days[D2]!.loadedSkills).toEqual(["b"]);
  });
  it("MCP 서버 이름은 더한 것과 뺀 것을 따른다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "mcp_instructions_delta", addedNames: ["x", "y"], removedNames: [] }),
      attachment(t(D2), { type: "mcp_instructions_delta", addedNames: [], removedNames: ["x"] }),
    ]);
    expect(s.days[D1]!.loadedMcpServers).toEqual(["x", "y"]);
    expect(s.days[D2]!.loadedMcpServers).toEqual(["y"]);
  });
});

describe("다시 실린 이름", () => {
  it("같은 날 목록에서 빠졌다가 다시 실린 스킬과 MCP 서버를 그날 다시 실린 이름으로 적는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a", "b"] }),
      attachment(t(D1), { type: "mcp_instructions_delta", addedNames: ["x"], removedNames: [] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: true, names: ["b"] }),
      attachment(t(D1, 2), { type: "skill_listing", isInitial: false, names: ["a"] }),
      attachment(t(D1, 3), { type: "mcp_instructions_delta", addedNames: [], removedNames: ["x"] }),
      attachment(t(D1, 4), { type: "mcp_instructions_delta", addedNames: ["x"], removedNames: [] }),
    ]);
    expect(s.days[D1]!.reloadedSkills).toEqual(["a"]);
    expect(s.days[D1]!.reloadedMcpServers).toEqual(["x"]);
    expect(s.days[D1]!.loadedSkills).toEqual(["a", "b"]);
  });
  it("다른 날 다시 실리면 그 날짜에 적고, 계속 실려 있던 이름은 적지 않는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a", "b"] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: true, names: ["b"] }),
      attachment(t(D2), { type: "skill_listing", isInitial: true, names: ["a", "b"] }),
    ]);
    expect(s.days[D1]!.reloadedSkills).toEqual([]);
    expect(s.days[D2]!.reloadedSkills).toEqual(["a"]);
  });
  it("제거 표시만 먼저 있던 서버가 뒤에 더해져도 다시 실린 이름이다. 더하기만 있으면 아니다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "mcp_instructions_delta", addedNames: [], removedNames: ["srv", "srv"] }),
      attachment(t(D1, 1), { type: "mcp_instructions_delta", addedNames: ["srv", "other"], removedNames: [] }),
    ]);
    expect(s.days[D1]!.loadedMcpServers).toEqual(["other", "srv"]);
    expect(s.days[D1]!.reloadedMcpServers).toEqual(["srv"]);
  });
  it("세션의 처음 목록을 남긴다. 스킬은 첫 isInitial 목록, MCP 서버는 첫 응답 줄 바로 앞에 실려 있던 이름이다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["b", "a"] }),
      attachment(t(D1), { type: "mcp_instructions_delta", addedNames: ["x"], removedNames: [] }),
      assistant({ id: "m1", at: t(D1, 1) }),
      attachment(t(D1, 2), { type: "mcp_instructions_delta", addedNames: ["late"], removedNames: [] }),
      attachment(t(D1, 3), { type: "skill_listing", isInitial: true, names: ["c"] }),
    ]);
    expect(s.initialSkills).toEqual(["a", "b"]);
    expect(s.initialMcpServers).toEqual(["x"]);
    expect(s.days[D1]!.loadedMcpServers).toEqual(["late", "x"]);
    expect(parseLines([attachment(t(D1), { type: "mcp_instructions_delta", addedNames: ["x"], removedNames: [] })]).initialMcpServers).toBeNull();
    const bare = parseLines([assistant({ id: "m1", at: t(D1) })]);
    expect(bare.initialSkills).toBeNull();
    expect(bare.initialMcpServers).toEqual([]);
  });
  it("처음 목록에 없다가 뒤에 실린 이름과 처음부터 있던 이름은 요약이 다르다", () => {
    const fromStart = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: false, names: [] }),
    ]);
    const later = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: [] }),
      attachment(t(D1, 1), { type: "skill_listing", isInitial: false, names: ["review"] }),
    ]);
    expect(fromStart.days[D1]!.loadedSkills).toEqual(later.days[D1]!.loadedSkills);
    expect(fromStart.initialSkills).toEqual(["review"]);
    expect(later.initialSkills).toEqual([]);
  });
  it("처음 목록과 같은 목록이 다시 와도 다시 실린 것이 아니다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["a"] }),
      attachment(t(D2), { type: "skill_listing", isInitial: true, names: ["a"] }),
    ]);
    expect(s.days[D1]!.reloadedSkills).toEqual([]);
    expect(s.days[D2]!.reloadedSkills).toEqual([]);
  });
});

describe("스킬 신호", () => {
  it("스킬 주입은 injected로 센다", () => {
    const s = parseLines([attachment(t(D1), { type: "invoked_skills", skills: [{ name: "a", path: "/x", content: "..." }] })]);
    expect(s.days[D1]!.skillSignals.a!.injected).toBe(1);
  });
  it("출처가 사람인 스킬 명령 줄(<command-message>가 먼저)도 사람 요청이자 슬래시 명령 신호다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      user({ at: t(D1, 1), content: "<command-message>review is running</command-message>\n<command-name>/review</command-name>", origin: "human" }),
    ]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    expect(s.days[D1]!.skillSignals.review!.slash).toBe(1);
  });
  it("슬래시 명령 신호는 실린 스킬의 명령 줄에서만 센다. 실린 목록에 없는 이름과 스킬 내용을 넣은 isMeta 줄은 세지 않는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      user({ at: t(D1, 1), content: "<command-message>other is running</command-message>\n<command-name>/other</command-name>", origin: "human" }),
      user({ at: t(D1, 2), content: "<command-name>/review</command-name>" }),
      user({ at: t(D1, 3), content: "<command-message>review</command-message>\n<command-name>review</command-name>\n<skill-format>true</skill-format>", extra: { isMeta: true } }),
    ]);
    expect(s.days[D1]!.humanRequests).toBe(1);
    expect(s.days[D1]!.skillSignals).toEqual({ review: { tool: 0, attribution: 0, slash: 1, injected: 0 } });
  });
  it("하위 세션과 isSidechain 줄의 슬래시 명령도 신호 3이다. 사람 요청은 아니다", () => {
    const lines = (extra: Record<string, unknown>) => [
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      user({ at: t(D1, 1), content: "<command-name>/review</command-name>", extra }),
    ];
    const sub = parseLines(lines({}), { kind: "sub" });
    const sidechain = parseLines(lines({ isSidechain: true }));
    for (const s of [sub, sidechain]) {
      expect(s.days[D1]!.skillSignals.review!.slash).toBe(1);
      expect(s.days[D1]!.humanRequests).toBe(0);
    }
  });
  it("슬래시 명령은 그 세션에 실린 스킬의 이름일 때만 신호다(응답이 뒤따랐는지는 따지지 않는다)", () => {
    const s = parseLines([
      attachment(t(D1), { type: "skill_listing", isInitial: true, names: ["review"] }),
      user({ at: t(D1, 1), content: "<command-name>/review</command-name>" }),
      user({ at: t(D1, 2), content: "<command-name>/clear</command-name>" }),
    ]);
    expect(s.days[D1]!.skillSignals.review!.slash).toBe(1);
    expect(s.days[D1]!.skillSignals.clear).toBeUndefined();
  });
});

describe("MCP 연결 실패와 훅", () => {
  it("뒤쪽 첨부에만 실패가 있어도 그 날짜에 연결 실패로 적고, 인증 대기와 연결 중은 실패가 아니다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "deferred_tools_delta", failedMcpServers: [], needsAuthMcpServers: ["g"], pendingMcpServers: ["p"] }),
      attachment(t(D2), { type: "deferred_tools_delta", failedMcpServers: ["srv"] }),
    ]);
    expect(s.days[D1]!.mcpConnectionFailure).toBe(false);
    expect(s.days[D2]!.mcpConnectionFailure).toBe(true);
  });
  it("훅은 실행과 실패를 사건별로 세고, 실패 표지가 없는 막음은 따로 세며, 딸린 첨부와 stop_hook_summary는 세지 않는다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "hook_success", hookEvent: "PreToolUse", exitCode: 0 }),
      attachment(t(D1), { type: "hook_additional_context", hookEvent: "PreToolUse" }),
      attachment(t(D1), { type: "hook_non_blocking_error", hookEvent: "PreToolUse" }),
      attachment(t(D1), { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: { blockingError: "policy says no; timed out waiting", command: "x" } }),
      attachment(t(D1), { type: "hook_brand_new", hookEvent: "Stop" }),
      system(t(D1), "stop_hook_summary"),
    ]);
    expect(s.days[D1]!.hooks).toEqual({ PreToolUse: { runs: 2, failures: 1, unclassifiedBlocks: 1 } });
    expect(s.notes.unknownHookKinds).toEqual({ hook_brand_new: 1 });
  });
  it("실패 표지가 명령에만 있거나 오류 글이 없는 막음은 가릴 수 없는 막음이고, 오류 글은 요약에 남지 않는다", () => {
    const secret = "unique-hook-text-7f3a9";
    const s = parseLines([
      attachment(t(D1), { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: { blockingError: `denied ${secret}`, command: "echo blocking because onFailure is" } }),
      attachment(t(D1), { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: { command: "x" } }),
      attachment(t(D1), { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: 42 }),
    ]);
    expect(s.days[D1]!.hooks).toEqual({ PreToolUse: { runs: 0, failures: 0, unclassifiedBlocks: 3 } });
    expect(JSON.stringify(s)).not.toContain(secret);
  });
  it("실패 표지가 있는 막음은 실행이면서 실패다", () => {
    const s = parseLines([
      attachment(t(D1), {
        type: "hook_blocking_error",
        hookEvent: "PreToolUse",
        blockingError: { blockingError: 'PreToolUse:Bash hook error: [cmd]: failed; blocking because onFailure is "block"', command: "cmd" },
      }),
      attachment(t(D1), {
        type: "hook_blocking_error",
        hookEvent: "PreToolUse",
        blockingError: "blocking because Git Bash wasn't found, so only exit code 0 or 2 counts as this hook's verdict.",
      }),
    ]);
    expect(s.days[D1]!.hooks).toEqual({ PreToolUse: { runs: 2, failures: 2, unclassifiedBlocks: 0 } });
  });
});

describe("지침 크기와 압축", () => {
  it("처음 실린 지침의 글자를 ASCII와 그 밖으로 나눠 센다", () => {
    const s = parseLines([
      attachment(t(D1), { type: "instructions", files: [{ path: "/a", type: "user", content: "ab가" }, { path: "/b", type: "project", content: "c" }] }),
      attachment(t(D1, 1), { type: "instructions", files: [{ path: "/a", type: "user", content: "zzzz" }] }),
    ]);
    expect(s.instructionChars).toEqual({ ascii: 3, other: 1 });
  });
  it("자동 압축만 세고, 손으로 시킨 압축은 세지 않으며, 계기를 모르면 따로 센다", () => {
    const s = parseLines([
      system(t(D1), "compact_boundary", { compactMetadata: { trigger: "auto" } }),
      system(t(D1, 1), "compact_boundary", { compactMetadata: { trigger: "manual" } }),
      system(t(D1, 2), "compact_boundary", {}),
    ]);
    expect(s.days[D1]!.autoCompactions).toBe(1);
    expect(s.days[D1]!.unknownCompactions).toBe(1);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/claude/parser-attachments.test.ts`
Expected: FAIL. 첨부 줄의 날짜 칸이 없어서 `s.days[D1]`이 `undefined`다.

- [ ] **Step 3: `parser.ts`에 첨부와 system을 더한다**

`../types.ts`에서 가져오는 부분을 아래로 바꾼다(`emptyHookCounts`와 `type HookCounts`를 더했다).

```ts
import {
  canonicalDay,
  emptyDay,
  emptyHookCounts,
  emptySkillSignalCounts,
  emptyToolCounts,
  type DayCell,
  type HookCounts,
  type SessionKind,
  type SessionSummary,
  type SkillSignalCounts,
  type ToolCounts,
} from "../types.ts";
```

`toolKey` 함수 아래에 더한다.

```ts
export const KNOWN_HOOK_ATTACHMENTS: ReadonlySet<string> = new Set([
  "hook_success",
  "hook_non_blocking_error",
  "hook_blocking_error",
  "hook_additional_context",
]);

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** 훅이 실패해서 동작이 막혔을 때 도구가 오류 글에 붙이는 문구(설계 9.5 「훅」). `timed out` 하나만으로는 표지로 삼지 않는다. */
export const HOOK_FAILURE_MARKERS: readonly string[] = ["blocking because onFailure is", "blocking because Git Bash wasn't found"];

/** 막음 첨부의 오류 글에 실패 표지가 있는지만 본다. 글은 어디에도 남기지 않는다. */
function hasFailureMarker(blockingError: unknown): boolean {
  const text = typeof blockingError === "string" ? blockingError : (str(obj(blockingError)?.blockingError) ?? "");
  return HOOK_FAILURE_MARKERS.some((marker) => text.includes(marker));
}
```

`ParserContext` 인터페이스 아래에 더한다.

```ts
interface LoadedNames {
  skills: Set<string>;
  mcp: Set<string>;
  reloadedSkills: Set<string>;
  reloadedMcp: Set<string>;
}
```

필드 목록 끝(`lastUserWasUserRejection` 아래)에 더한다.

```ts
  private loadedSkills = new Set<string>();
  private readonly everLoadedSkills = new Set<string>();
  private readonly droppedSkills = new Set<string>();
  private readonly loadedMcp = new Set<string>();
  private readonly droppedMcp = new Set<string>();
  private readonly dayLoaded = new Map<LocalDate, LoadedNames>();
  private loadedMarkDate: LocalDate | null = null;
  private loadedDirty = false;
  private instructionChars: { ascii: number; other: number } | null = null;
  private initialSkills: string[] | null = null;
  private initialMcp: string[] | null = null;
```

`handle()`을 아래로 바꾼다.

```ts
  private handle(line: Json, date: LocalDate | null): void {
    if (this.cwd === null) this.cwd = str(line.cwd);
    if (line.type === "assistant") {
      if (this.initialMcp === null) this.initialMcp = [...this.loadedMcp].sort();
      this.onAssistant(line, date);
    } else if (line.type === "user") this.onUser(line, date);
    else if (line.type === "attachment") this.onAttachment(line, date);
    else if (line.type === "system") this.onSystem(line, date);
    this.markLoaded(date);
  }
```

`finish()`를 아래로 바꾼다(슬래시 명령 신호, 날짜별로 실린 이름과 다시 실린 이름, 지침 크기를 더했다).

```ts
  finish(tail: string | null, inProgress: boolean): SessionSummary {
    if (tail !== null && tail.trim() !== "") {
      this.lines++;
      const parsed = parseObject(tail);
      if (parsed !== null) this.accept(parsed);
      else this.missing(tail, inProgress ? "tail" : "broken");
    }
    const syntheticResponses = this.foldResponses();
    for (const command of this.slashCommands) {
      if (this.everLoadedSkills.has(command.name)) this.skillSignal(this.day(command.date), command.name).slash++;
    }
    for (const [date, loaded] of this.dayLoaded) {
      const day = this.day(date);
      day.loadedSkills = [...loaded.skills].sort();
      day.loadedMcpServers = [...loaded.mcp].sort();
      day.reloadedSkills = [...loaded.reloadedSkills].sort();
      day.reloadedMcpServers = [...loaded.reloadedMcp].sort();
    }
    const days: Record<LocalDate, DayCell> = {};
    for (const date of [...this.days.keys()].sort()) days[date] = canonicalDay(this.days.get(date)!);
    return {
      tool: "claude-code",
      sessionId: this.ctx.sessionId,
      kind: this.ctx.kind,
      parentSessionId: this.ctx.parentSessionId,
      cwd: this.cwd,
      version: this.version,
      firstDate: this.firstDate,
      days,
      instructionChars: this.instructionChars,
      initialSkills: this.initialSkills,
      initialMcpServers: this.initialMcp,
      missing: {
        lines: this.lines,
        brokenLines: this.brokenLines,
        tailFragments: this.tailFragments,
        tooLongLines: this.tooLongLines,
        unconfirmedTypes: sortedRecord(this.unconfirmedTypes),
      },
      firstResponseIdHashes: this.firstIds.map(fnv1a64),
      notes: {
        syntheticResponses,
        responsesWithoutId: this.responsesWithoutId,
        undatedLines: this.undatedLines,
        unknownHookKinds: sortedRecord(this.unknownHookKinds),
      },
    };
  }
```

클래스 끝에 새 메서드를 더한다.

```ts
  private onAttachment(line: Json, date: LocalDate | null): void {
    const body = obj(line.attachment);
    const type = body === null ? null : str(body.type);
    if (body === null || type === null) return;
    if (type === "skill_listing") {
      const names = strings(body.names);
      if (body.isInitial === true) {
        const next = new Set(names);
        if (this.initialSkills === null) this.initialSkills = [...next].sort();
        for (const name of this.loadedSkills) if (!next.has(name)) this.droppedSkills.add(name);
        this.loadedSkills = next;
      } else {
        for (const name of names) this.loadedSkills.add(name);
      }
      for (const name of names) {
        this.everLoadedSkills.add(name);
        if (this.droppedSkills.delete(name) && date !== null) this.loadedOn(date).reloadedSkills.add(name);
      }
      this.loadedDirty = true;
      return;
    }
    if (type === "mcp_instructions_delta") {
      for (const name of strings(body.removedNames)) {
        this.loadedMcp.delete(name);
        this.droppedMcp.add(name);
      }
      for (const name of strings(body.addedNames)) {
        this.loadedMcp.add(name);
        if (this.droppedMcp.delete(name) && date !== null) this.loadedOn(date).reloadedMcp.add(name);
      }
      this.loadedDirty = true;
      return;
    }
    if (type === "instructions") {
      if (this.instructionChars !== null || !Array.isArray(body.files)) return;
      let ascii = 0;
      let other = 0;
      for (const file of body.files) {
        const content = obj(file)?.content;
        if (typeof content !== "string") continue;
        for (const ch of content) {
          if (ch.codePointAt(0)! < 0x80) ascii++;
          else other++;
        }
      }
      this.instructionChars = { ascii, other };
      return;
    }
    if (date === null) return;
    const day = this.day(date);
    if (type === "invoked_skills") {
      for (const skill of Array.isArray(body.skills) ? body.skills : []) {
        const name = str(obj(skill)?.name);
        if (name !== null) this.skillSignal(day, name).injected++;
      }
      return;
    }
    if (type === "deferred_tools_delta") {
      if (Array.isArray(body.failedMcpServers) && body.failedMcpServers.length > 0) day.mcpConnectionFailure = true;
      return;
    }
    if (type === "hook_success" || type === "hook_non_blocking_error") {
      const counts = this.hook(day, str(body.hookEvent) ?? UNKNOWN_TOOL);
      counts.runs++;
      if (type === "hook_non_blocking_error") counts.failures++;
      return;
    }
    if (type === "hook_blocking_error") {
      const counts = this.hook(day, str(body.hookEvent) ?? UNKNOWN_TOOL);
      if (hasFailureMarker(body.blockingError)) {
        counts.runs++;
        counts.failures++;
      } else {
        counts.unclassifiedBlocks++;
      }
      return;
    }
    if (type.startsWith("hook_") && !KNOWN_HOOK_ATTACHMENTS.has(type)) bump(this.unknownHookKinds, type);
  }

  private onSystem(line: Json, date: LocalDate | null): void {
    if (line.subtype !== "compact_boundary" || date === null) return;
    const trigger = obj(line.compactMetadata)?.trigger;
    if (trigger === "auto") this.day(date).autoCompactions++;
    else if (trigger !== "manual") this.day(date).unknownCompactions++;
  }

  private loadedOn(date: LocalDate): LoadedNames {
    let loaded = this.dayLoaded.get(date);
    if (loaded === undefined) {
      loaded = { skills: new Set(), mcp: new Set(), reloadedSkills: new Set(), reloadedMcp: new Set() };
      this.dayLoaded.set(date, loaded);
    }
    return loaded;
  }

  /** 그 날짜 칸에 지금 실려 있는 스킬과 MCP 서버의 이름을 더한다. 날짜나 실린 것이 바뀔 때만 계산한다. */
  private markLoaded(date: LocalDate | null): void {
    if (date === null || (date === this.loadedMarkDate && !this.loadedDirty)) return;
    const loaded = this.loadedOn(date);
    for (const name of this.loadedSkills) loaded.skills.add(name);
    for (const name of this.loadedMcp) loaded.mcp.add(name);
    this.loadedMarkDate = date;
    this.loadedDirty = false;
  }

  private hook(day: DayCell, event: string): HookCounts {
    let counts = day.hooks[event];
    if (counts === undefined) {
      counts = emptyHookCounts();
      day.hooks[event] = counts;
    }
    return counts;
  }
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 본다**

Run: `npx vitest run test/adapters` → 이 과제의 20개와 지금까지의 시험이 모두 PASS(과제 8의 날짜 시험도 통과해야 한다).
Run: `npx tsc --noEmit` → 출력 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/claude/parser.ts test/adapters/claude/parser-attachments.test.ts
git commit -m "feat: Claude Code 첨부·실린 이름·훅·압축 해석 추가"
```

---

### Task 11: 기록 폴더와 세션 파일 목록

**Files:**
- Create: `src/adapters/claude/locate.ts`
- Test: `test/adapters/claude/locate.test.ts`

**Interfaces:**
- Produces:
  - `interface LogFile { path; normPath; size; mtimeMs; sessionId; kind: SessionKind; parentSessionId: string | null }`
  - `interface FileList { projectsFound: boolean; files: LogFile[]; olderThanWindow: number; unreadableDirs: string[]; unreadableFiles: string[] }`. `unreadableDirs`는 목록을 읽지 못해 안을 모르는 폴더, `unreadableFiles`는 목록에는 있지만 크기와 수정 시각을 보지 못한 파일이다
  - `claudeHome(env: Record<string, string | undefined>, homedir: string): string`(`CLAUDE_CONFIG_DIR`가 있으면 그것, 없으면 `<homedir>/.claude`)
  - `normalizePath(path: string, platform?: NodeJS.Platform): string`(절대 경로, `/` 구분, Windows에서는 소문자)
  - `listClaudeFiles(home: string, minMtimeMs: number | null): Promise<FileList>`. `minMtimeMs`보다 수정 시각이 앞선 파일은 열지 않고 센다. null이면 거르지 않는다(`--rescan`). 결과는 `normPath` 차례다.
- 주 세션은 `projects/<프로젝트>/<세션>.jsonl`, 하위 세션은 `projects/<프로젝트>/<세션>/subagents/<이름>.jsonl`이고 부모는 그 폴더의 `<세션>`이다(설계 9.2).
- `projects`가 없으면(`ENOENT`) 기록이 없는 것이다(`projectsFound: false`). 그 밖의 이유로 읽지 못하면(권한, 폴더가 아님 등) `projectsFound: true`이고 그 경로를 `unreadableDirs`에 넣는다. 못 읽은 것을 기록이 없는 것으로 숨기지 않는다(설계 20.1). 프로젝트 폴더와 `subagents` 폴더를 읽지 못한 것도 `unreadableDirs`에 넣는다(`subagents`가 없는 것은 빼고). 크기를 보지 못한 파일은 `unreadableFiles`에 넣는다. 시험은 `stat`을 감싸(`vi.mock`) 파일 하나의 `stat`만 실패하게 한다. 실제 파일 권한은 바꾸지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/claude/locate.test.ts`:

```ts
// Claude Code 기록 폴더 찾기와 세션 파일 목록(주 세션·하위 세션·수정 시각 거르기·경로 차례)을 시험한다(설계 9.1, 9.2)
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 파일 하나의 stat만 실패하게 하려고 stat을 감싼다. 평소에는 실제 stat을 그대로 부른다.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, stat: vi.fn(actual.stat) };
});
import { claudeHome, listClaudeFiles, normalizePath } from "../../../src/adapters/claude/locate.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 로케이트 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const OLD = Date.parse("2026-01-01T00:00:00Z");
const NEW = Date.parse("2026-11-10T00:00:00Z");

async function touch(path: string, mtimeMs: number): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "{}\n");
  await utimes(path, mtimeMs / 1000, mtimeMs / 1000);
}

describe("claudeHome", () => {
  it("CLAUDE_CONFIG_DIR가 있으면 그 폴더, 없으면 홈의 .claude", () => {
    expect(claudeHome({ CLAUDE_CONFIG_DIR: join(root, "custom") }, "/h")).toBe(join(root, "custom"));
    expect(claudeHome({}, root)).toBe(join(root, ".claude"));
  });
});

describe("normalizePath", () => {
  it("Windows에서는 소문자와 / 구분으로 맞춘다", () => {
    expect(normalizePath("C:\\Work\\A.jsonl", "win32")).toBe(normalizePath("c:/work/a.jsonl", "win32"));
  });
});

describe("listClaudeFiles", () => {
  it("주 세션과 하위 세션을 찾고 경로 차례로 낸다. 프로젝트 폴더 밖의 파일은 보지 않는다", async () => {
    const projects = join(root, "projects");
    await touch(join(projects, "z-proj", "s2.jsonl"), NEW);
    await touch(join(projects, "a-proj", "s1.jsonl"), NEW);
    await touch(join(projects, "a-proj", "s1", "subagents", "agent-x.jsonl"), NEW);
    await touch(join(projects, "한글 프로젝트", "s3.jsonl"), NEW);
    await writeFile(join(projects, "notes.txt"), "x");
    const list = await listClaudeFiles(root, null);
    expect(list.projectsFound).toBe(true);
    expect(list.unreadableDirs).toEqual([]);
    expect(list.unreadableFiles).toEqual([]);
    const paths = list.files.map((f) => f.normPath);
    expect(paths).toEqual([...paths].sort());
    expect(list.files).toHaveLength(4);
    const byId = Object.fromEntries(list.files.map((f) => [f.sessionId, f]));
    expect(byId["s1"]!.kind).toBe("main");
    expect(byId["agent-x"]!.kind).toBe("sub");
    expect(byId["agent-x"]!.parentSessionId).toBe("s1");
    expect(byId["s3"]).toBeDefined();
  });
  it("수정 시각이 아래 경계보다 앞선 파일은 열지 않고 센다", async () => {
    const projects = join(root, "projects");
    await touch(join(projects, "p", "old.jsonl"), OLD);
    await touch(join(projects, "p", "new.jsonl"), NEW);
    const list = await listClaudeFiles(root, Date.parse("2026-10-01T00:00:00Z"));
    expect(list.files.map((f) => f.sessionId)).toEqual(["new"]);
    expect(list.olderThanWindow).toBe(1);
  });
  it("projects를 읽지 못하면(폴더가 아니면) 찾았지만 읽지 못한 폴더로 낸다", async () => {
    await writeFile(join(root, "projects"), "not a folder");
    const list = await listClaudeFiles(root, null);
    expect(list.projectsFound).toBe(true);
    expect(list.files).toEqual([]);
    expect(list.unreadableDirs).toEqual([join(root, "projects")]);
    expect(list.unreadableFiles).toEqual([]);
  });
  it("subagents 자리가 폴더가 아니면 읽지 못한 폴더이고, 없으면 아무것도 아니다", async () => {
    const projects = join(root, "projects");
    await touch(join(projects, "p", "s1.jsonl"), NEW);
    await mkdir(join(projects, "p", "s1"), { recursive: true });
    await writeFile(join(projects, "p", "s1", "subagents"), "not a folder");
    await mkdir(join(projects, "p", "s2"), { recursive: true });
    const list = await listClaudeFiles(root, null);
    expect(list.unreadableDirs).toEqual([join(projects, "p", "s1", "subagents")]);
    expect(list.files.map((f) => f.sessionId)).toEqual(["s1"]);
  });
  it("크기와 수정 시각을 보지 못한 파일은 목록에서 빼지 않고 읽지 못한 파일로 낸다. 읽지 못한 폴더와 섞지 않는다", async () => {
    const projects = join(root, "projects");
    await touch(join(projects, "p", "s1.jsonl"), NEW);
    await touch(join(projects, "p", "s2.jsonl"), NEW);
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const denied = join(projects, "p", "s2.jsonl");
    vi.mocked(stat).mockImplementation((async (path: Parameters<typeof actual.stat>[0]) => {
      if (String(path) === denied) throw Object.assign(new Error("denied"), { code: "EACCES" });
      return actual.stat(path);
    }) as unknown as typeof stat);
    try {
      const list = await listClaudeFiles(root, null);
      expect(list.files.map((f) => f.sessionId)).toEqual(["s1"]);
      expect(list.unreadableFiles).toEqual([denied]);
      expect(list.unreadableDirs).toEqual([]);
    } finally {
      vi.mocked(stat).mockImplementation(actual.stat as unknown as typeof stat);
    }
  });
  it("projects 폴더가 없으면 찾지 못한 것이다", async () => {
    const list = await listClaudeFiles(root, null);
    expect(list.projectsFound).toBe(false);
    expect(list.files).toEqual([]);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/claude/locate.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/claude/locate.ts`:

```ts
// Claude Code 기록 폴더를 찾고, 수집 구간에 걸리는 세션 파일(주 세션과 하위 세션)의 목록을 정규화한 경로 차례로 만든다(설계 9.1, 9.2)
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SessionKind } from "../types.ts";

export interface LogFile {
  path: string;
  normPath: string;
  size: number;
  mtimeMs: number;
  sessionId: string;
  kind: SessionKind;
  parentSessionId: string | null;
}

export interface FileList {
  projectsFound: boolean;
  files: LogFile[];
  /** 수정 시각이 아래 경계보다 앞서 열지 않은 파일의 수 */
  olderThanWindow: number;
  /** 목록을 읽지 못해 안을 모르는 폴더(설계 9.8) */
  unreadableDirs: string[];
  /** 목록에는 있지만 크기와 수정 시각을 보지 못한 파일 */
  unreadableFiles: string[];
}

export function claudeHome(env: Record<string, string | undefined>, homedir: string): string {
  const fromEnv = env.CLAUDE_CONFIG_DIR?.trim();
  return fromEnv ? resolve(fromEnv) : join(homedir, ".claude");
}

export function normalizePath(path: string, platform: NodeJS.Platform = process.platform): string {
  const absolute = resolve(path).replace(/\\/g, "/");
  return platform === "win32" ? absolute.toLowerCase() : absolute;
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

export async function listClaudeFiles(home: string, minMtimeMs: number | null): Promise<FileList> {
  const projects = join(home, "projects");
  const files: LogFile[] = [];
  const unreadableDirs: string[] = [];
  const unreadableFiles: string[] = [];
  let olderThanWindow = 0;

  let projectEntries;
  try {
    projectEntries = await readdir(projects, { withFileTypes: true });
  } catch (error) {
    // 폴더가 없으면 기록이 없는 것이다. 그 밖의 오류(권한, 폴더가 아님 등)는 읽지 못한 것으로 알린다(설계 20.1).
    if (isMissing(error)) return { projectsFound: false, files: [], olderThanWindow: 0, unreadableDirs: [], unreadableFiles: [] };
    return { projectsFound: true, files: [], olderThanWindow: 0, unreadableDirs: [projects], unreadableFiles: [] };
  }

  const consider = async (path: string, sessionId: string, kind: SessionKind, parentSessionId: string | null): Promise<void> => {
    try {
      const info = await stat(path);
      if (minMtimeMs !== null && info.mtimeMs < minMtimeMs) {
        olderThanWindow++;
        return;
      }
      files.push({ path, normPath: normalizePath(path), size: info.size, mtimeMs: info.mtimeMs, sessionId, kind, parentSessionId });
    } catch {
      unreadableFiles.push(path);
    }
  };

  for (const project of projectEntries) {
    if (!project.isDirectory()) continue;
    const projectDir = join(projects, project.name);
    let entries;
    try {
      entries = await readdir(projectDir, { withFileTypes: true });
    } catch {
      unreadableDirs.push(projectDir);
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        await consider(join(projectDir, entry.name), entry.name.slice(0, -".jsonl".length), "main", null);
        continue;
      }
      if (!entry.isDirectory()) continue;
      const subDir = join(projectDir, entry.name, "subagents");
      let subs;
      try {
        subs = await readdir(subDir, { withFileTypes: true });
      } catch (error) {
        if (!isMissing(error)) unreadableDirs.push(subDir);
        continue;
      }
      for (const sub of subs) {
        if (sub.isFile() && sub.name.endsWith(".jsonl")) {
          await consider(join(subDir, sub.name), sub.name.slice(0, -".jsonl".length), "sub", entry.name);
        }
      }
    }
  }

  files.sort((a, b) => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0));
  unreadableDirs.sort();
  unreadableFiles.sort();
  return { projectsFound: true, files, olderThanWindow, unreadableDirs, unreadableFiles };
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/adapters/claude/locate.test.ts` → PASS(8개).

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/claude/locate.ts test/adapters/claude/locate.test.ts
git commit -m "feat: Claude Code 기록 폴더와 세션 파일 목록 추가"
```

---

### Task 12: 관측 범위와 관측이 빠짐없는지

**Files:**
- Create: `src/adapters/claude/observation.ts`
- Test: `test/adapters/claude/observation.test.ts`

**Interfaces:**
- Produces:
  - `type Coverage = "measured" | "proxy" | "unsupported"`, `CLAUDE_COVERAGE`(설계 9.7의 Claude Code 열. 모두 `measured`)
  - `SKILL_NON_SIGNAL_TYPES`, `MCP_NON_SIGNAL_TYPES`(설계 9.8 표)
  - `type ObservationReason = "unreadable-files" | "too-long-lines" | "unconfirmed-pieces"`, `interface Observation { complete: boolean; reasons: ObservationReason[] }`
  - `claudeObservation(summaries: readonly SessionSummary[], unreadableCount: number, metric: "skill" | "mcp"): Observation`
  - `mostlyBroken(summary: SessionSummary): boolean`. 깨진 줄이 `missing.lines`의 절반을 넘으면 참이다(정확히 절반은 거짓). 모으기(과제 14)가 그런 파일을 읽지 못한 파일로 센다(설계 20.1)
- 관측이 빠짐없다는 것은 읽지 못한 파일이 없고, 너무 긴 줄이 없고, 깨진 줄과 끝 조각이 모두 그 지표의 "사용 신호가 될 수 없는 종류"로 온전히 읽힌 것이다(설계 9.8). 시험은 누락 정보를 손으로 만든 요약에 더해, 실제 깨진 줄을 해석기부터 넣은 요약으로도 본다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/adapters/claude/observation.test.ts`:

```ts
// 스킬 사용과 MCP 호출의 관측이 빠짐없는지 가르는 것을 시험한다(설계 9.8, 21.1 반례)
import { describe, expect, it } from "vitest";
import { claudeObservation, mostlyBroken } from "../../../src/adapters/claude/observation.ts";
import type { SessionSummary } from "../../../src/adapters/types.ts";
import { parseLines } from "../../helpers/claude-lines.ts";

function withMissing(unconfirmedTypes: Record<string, number>, tooLongLines = 0): SessionSummary {
  const summary = parseLines([]);
  return { ...summary, missing: { lines: 10, brokenLines: 1, tailFragments: 0, tooLongLines, unconfirmedTypes } };
}

describe("claudeObservation", () => {
  it("빠진 것이 없으면 빠짐없다", () => {
    expect(claudeObservation([parseLines([])], 0, "skill")).toEqual({ complete: true, reasons: [] });
  });
  it("읽지 못한 파일이 있으면 미확인이다", () => {
    expect(claudeObservation([parseLines([])], 1, "mcp")).toEqual({ complete: false, reasons: ["unreadable-files"] });
  });
  it("너무 긴 줄이 있으면 두 지표 모두 미확인이다", () => {
    const s = withMissing({}, 1);
    expect(claudeObservation([s], 0, "skill").complete).toBe(false);
    expect(claudeObservation([s], 0, "mcp").reasons).toEqual(["too-long-lines"]);
  });
  it("깨진 줄이 system으로 온전히 읽히면 상관없는 줄이다", () => {
    const s = withMissing({ system: 1 });
    expect(claudeObservation([s], 0, "skill").complete).toBe(true);
    expect(claudeObservation([s], 0, "mcp").complete).toBe(true);
  });
  it("깨진 user 줄은 스킬에는 미확인, MCP에는 상관없는 줄이다", () => {
    const s = withMissing({ user: 1 });
    expect(claudeObservation([s], 0, "skill")).toEqual({ complete: false, reasons: ["unconfirmed-pieces"] });
    expect(claudeObservation([s], 0, "mcp").complete).toBe(true);
  });
  it("실제 깨진 줄을 해석기부터 넣어도, 종류를 읽지 못하거나 목록에 없으면 미확인이다", () => {
    const unknown = parseLines(['{"message":{"content":[{"type":"tool_use","name":"Skill"}]}']);
    const brandNew = parseLines(['{"type":"brand-new-type","payload":}']);
    const harmless = parseLines(['{"type":"system","subtype":"x",']);
    expect(claudeObservation([unknown], 0, "skill").complete).toBe(false);
    expect(claudeObservation([brandNew], 0, "mcp").complete).toBe(false);
    expect(claudeObservation([harmless], 0, "skill").complete).toBe(true);
  });
  it("종류를 읽지 못했거나 목록에 없는 종류면 미확인이다", () => {
    expect(claudeObservation([withMissing({ "?": 1 })], 0, "mcp").complete).toBe(false);
    expect(claudeObservation([withMissing({ "brand-new-type": 1 })], 0, "skill").complete).toBe(false);
    expect(claudeObservation([withMissing({ assistant: 1 })], 0, "mcp").complete).toBe(false);
  });
});

describe("mostlyBroken", () => {
  it("깨진 줄이 줄 수의 절반을 넘을 때만 참이다", () => {
    const at = (lines: number, brokenLines: number): SessionSummary => {
      const summary = parseLines([]);
      return { ...summary, missing: { ...summary.missing, lines, brokenLines } };
    };
    expect(mostlyBroken(at(10, 5))).toBe(false);
    expect(mostlyBroken(at(10, 6))).toBe(true);
    expect(mostlyBroken(at(0, 0))).toBe(false);
    expect(mostlyBroken(parseLines(["{broken", "{broken", '{"type":"ai-title","title":"x"}']))).toBe(true);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/adapters/claude/observation.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/adapters/claude/observation.ts`:

```ts
// Claude Code가 지표마다 무엇을 기록하는지(설계 9.7)와, 스킬 사용·MCP 호출의 관측이 빠짐없는지(설계 9.8), 절반 넘게 깨진 파일인지(설계 20.1)를 가른다(순수 함수)
import type { SessionSummary } from "../types.ts";

export type Coverage = "measured" | "proxy" | "unsupported";

/** 설계 9.7의 Claude Code 열. Claude Code는 모든 지표를 기록한다. */
export const CLAUDE_COVERAGE = {
  responsesAndTokens: "measured",
  humanRequests: "measured",
  toolCalls: "measured",
  toolErrors: "measured",
  shellExitCodes: "measured",
  deniedAndLengthStops: "measured",
  interruptedTurns: "measured",
  autoCompaction: "measured",
  effort: "measured",
  loadedNames: "measured",
  skillUsage: "measured",
  mcpCalls: "measured",
  mcpFailuresAndHooks: "measured",
  instructionSize: "measured",
  subagents: "measured",
} as const satisfies Record<string, Coverage>;

/** 깨진 줄이나 끝 조각이 이 종류로 온전히 읽히면 그 지표의 사용 신호가 실릴 수 없다(설계 9.8 표). */
export const SKILL_NON_SIGNAL_TYPES: ReadonlySet<string> = new Set([
  "system",
  "api-request",
  "api-request-blob",
  "mode",
  "permission-mode",
  "ai-title",
  "session-owner",
  "pr-link",
  "last-prompt",
  "cost-state",
]);
export const MCP_NON_SIGNAL_TYPES: ReadonlySet<string> = new Set([...SKILL_NON_SIGNAL_TYPES, "user", "attachment"]);

export type ObservationReason = "unreadable-files" | "too-long-lines" | "unconfirmed-pieces";

export interface Observation {
  complete: boolean;
  reasons: ObservationReason[];
}

const REASON_ORDER: readonly ObservationReason[] = ["unreadable-files", "too-long-lines", "unconfirmed-pieces"];

/** 깨진 줄이 줄 수의 절반을 넘으면 그 파일은 읽지 못한 파일로 센다(설계 20.1). 정확히 절반은 넘지 않은 것이다. */
export function mostlyBroken(summary: SessionSummary): boolean {
  return summary.missing.brokenLines * 2 > summary.missing.lines;
}

export function claudeObservation(summaries: readonly SessionSummary[], unreadableCount: number, metric: "skill" | "mcp"): Observation {
  const harmless = metric === "skill" ? SKILL_NON_SIGNAL_TYPES : MCP_NON_SIGNAL_TYPES;
  const found = new Set<ObservationReason>();
  if (unreadableCount > 0) found.add("unreadable-files");
  for (const summary of summaries) {
    if (summary.missing.tooLongLines > 0) found.add("too-long-lines");
    for (const [type, count] of Object.entries(summary.missing.unconfirmedTypes)) {
      if (count > 0 && !harmless.has(type)) found.add("unconfirmed-pieces");
    }
  }
  const reasons = REASON_ORDER.filter((reason) => found.has(reason));
  return { complete: reasons.length === 0, reasons };
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/adapters/claude/observation.test.ts` → PASS(8개).

- [ ] **Step 5: 커밋한다**

```bash
git add src/adapters/claude/observation.ts test/adapters/claude/observation.test.ts
git commit -m "feat: Claude Code 관측 범위와 빠짐없음 판정 추가"
```

---

### Task 13: 파일마다의 캐시

**Files:**
- Create: `src/state/cache.ts`
- Test: `test/state/cache.test.ts`

**Interfaces:**
- Produces:
  - `CACHE_FORMAT_VERSION = 1`(캐시 모양을 바꾸면 올린다)
  - `interface CacheKey { normPath; size; mtimeMs; head; tail; cacheFormat; parser; timeZone }`(설계 9.4의 열쇠. `head`·`tail`은 앞뒤 4KB의 SHA-256)
  - `interface CacheEntry { key: CacheKey; summary: SessionSummary; bytesRead: number }`
  - `interface KeySource { path; normPath; size; mtimeMs }`(`LogFile`이 이 모양을 채운다)
  - `cacheKeyFor(file: KeySource, parser: string, timeZone: string): Promise<CacheKey>`, `sameKey(a, b): boolean`, `loadCached(dir: string, key: CacheKey): Promise<CacheEntry | null>`, `storeCached(dir: string, entry: CacheEntry): Promise<void>`
- 캐시 파일 이름은 `normPath`의 SHA-256 앞 32자리다. 쓸 때는 임시 파일에 쓰고 이름을 바꾼다. 깨진 캐시는 없는 것으로 본다(설계 20.1 "캐시가 깨졌다"). JSON으로 풀려도 요약의 모양이 다르면(`reviveSummary`가 `null`) 없는 것으로 보고 원본을 다시 읽는다. 꺼낸 요약은 되살린 것(원형 없는 기록, 열쇠 차례)이라 새로 읽은 요약과 글자 하나 다르지 않다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/state/cache.test.ts`:

```ts
// 캐시 열쇠 만들기, 넣고 꺼내기, 열쇠가 하나라도 다르면 꺼내지 않기를 시험한다(설계 9.4, 21.1 반례)
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheKeyFor, loadCached, storeCached } from "../../src/state/cache.ts";
import { parseLines } from "../helpers/claude-lines.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aq-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const MTIME = Date.parse("2026-11-10T00:00:00Z");

async function logFile(name: string, content: string) {
  const path = join(dir, name);
  await writeFile(path, content);
  await utimes(path, MTIME / 1000, MTIME / 1000);
  return { path, normPath: path.toLowerCase(), size: Buffer.byteLength(content), mtimeMs: MTIME };
}

describe("cache", () => {
  it("넣은 것을 같은 열쇠로 꺼낸다", async () => {
    const file = await logFile("a.jsonl", "line\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    const entry = { key, summary: parseLines([]), bytesRead: 5 };
    await storeCached(join(dir, "cache"), entry);
    expect(await loadCached(join(dir, "cache"), key)).toEqual(entry);
  });
  it("크기와 수정 시각이 같은데 앞부분이 다르면 꺼내지 않는다", async () => {
    const file = await logFile("b.jsonl", "AAAA\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 5 });
    const changed = await logFile("b.jsonl", "BBBB\n");
    const newKey = await cacheKeyFor(changed, "claude-code@1", "UTC");
    expect(newKey.head).not.toBe(key.head);
    expect(await loadCached(join(dir, "cache"), newKey)).toBeNull();
  });
  it("해석 버전이나 시간대가 다르면 꺼내지 않는다", async () => {
    const file = await logFile("c.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
    expect(await loadCached(join(dir, "cache"), { ...key, parser: "claude-code@2" })).toBeNull();
    expect(await loadCached(join(dir, "cache"), { ...key, timeZone: "Asia/Seoul" })).toBeNull();
  });
  it("깨진 캐시 파일은 없는 것으로 본다", async () => {
    const file = await logFile("d.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
    const [name] = await readdir(join(dir, "cache"));
    await writeFile(join(dir, "cache", name!), "{broken");
    expect(await loadCached(join(dir, "cache"), key)).toBeNull();
  });
  it("열쇠가 같아도 요약의 모양이 다르면 꺼내지 않는다", async () => {
    const file = await logFile("f.jsonl", "x\n");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    await storeCached(join(dir, "cache"), { key, summary: parseLines([]), bytesRead: 2 });
    const [name] = await readdir(join(dir, "cache"));
    const path = join(dir, "cache", name!);
    const good = JSON.parse(await readFile(path, "utf8")) as { summary: Record<string, unknown> };
    for (const summary of [{}, null, { ...good.summary, days: null }, { ...good.summary, days: { "2026-11-11": { humanRequests: "1" } } }]) {
      await writeFile(path, JSON.stringify({ ...good, summary }));
      expect(await loadCached(join(dir, "cache"), key)).toBeNull();
    }
  });
  it("빈 파일도 열쇠를 만든다", async () => {
    const file = await logFile("e.jsonl", "");
    const key = await cacheKeyFor(file, "claude-code@1", "UTC");
    expect(key.size).toBe(0);
    expect(key.head).toBe(key.tail);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/state/cache.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/state/cache.ts`:

```ts
// 파일마다의 세션 요약을 상태 폴더에 저장하고, 열쇠(경로·크기·수정 시각·앞뒤 4KB 지문·캐시 형식·해석 버전·시간대)가 모두 같고 요약의 모양이 맞을 때만 꺼낸다(설계 9.4)
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reviveSummary, type SessionSummary } from "../adapters/types.ts";

export const CACHE_FORMAT_VERSION = 1;
const EDGE_BYTES = 4096;

export interface CacheKey {
  normPath: string;
  size: number;
  mtimeMs: number;
  head: string;
  tail: string;
  cacheFormat: number;
  parser: string;
  timeZone: string;
}

export interface CacheEntry {
  key: CacheKey;
  summary: SessionSummary;
  bytesRead: number;
}

export interface KeySource {
  path: string;
  normPath: string;
  size: number;
  mtimeMs: number;
}

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

export async function cacheKeyFor(file: KeySource, parser: string, timeZone: string): Promise<CacheKey> {
  const handle = await open(file.path, "r");
  try {
    const length = Math.min(EDGE_BYTES, file.size);
    const head = Buffer.alloc(length);
    const tail = Buffer.alloc(length);
    if (length > 0) {
      await handle.read(head, 0, length, 0);
      await handle.read(tail, 0, length, file.size - length);
    }
    return {
      normPath: file.normPath,
      size: file.size,
      mtimeMs: file.mtimeMs,
      head: sha256(head),
      tail: sha256(tail),
      cacheFormat: CACHE_FORMAT_VERSION,
      parser,
      timeZone,
    };
  } finally {
    await handle.close();
  }
}

export function sameKey(a: CacheKey, b: CacheKey): boolean {
  return (
    a.normPath === b.normPath &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.head === b.head &&
    a.tail === b.tail &&
    a.cacheFormat === b.cacheFormat &&
    a.parser === b.parser &&
    a.timeZone === b.timeZone
  );
}

function entryPath(dir: string, normPath: string): string {
  return join(dir, `${sha256(normPath).slice(0, 32)}.json`);
}

export async function loadCached(dir: string, key: CacheKey): Promise<CacheEntry | null> {
  try {
    const entry = JSON.parse(await readFile(entryPath(dir, key.normPath), "utf8")) as Partial<CacheEntry>;
    if (entry.key === undefined || typeof entry.bytesRead !== "number" || !sameKey(entry.key, key)) return null;
    // JSON으로 풀려도 요약의 모양이 다르면(손으로 고쳤거나 옛 형식) 없는 것으로 보고 원본을 다시 읽는다
    const summary = reviveSummary(entry.summary);
    return summary === null ? null : { key: entry.key, summary, bytesRead: entry.bytesRead };
  } catch {
    return null;
  }
}

export async function storeCached(dir: string, entry: CacheEntry): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = entryPath(dir, entry.key.normPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(entry));
  await rename(temporary, target);
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/state/cache.test.ts` → PASS(6개).

- [ ] **Step 5: 커밋한다**

```bash
git add src/state/cache.ts test/state/cache.test.ts
git commit -m "feat: 파일마다의 세션 요약 캐시 추가"
```

---

### Task 14: Claude Code 기록 모으기

**Files:**
- Create: `src/collect/claude.ts`
- Test: `test/collect/claude.test.ts`

**Interfaces:**
- Consumes: `makeWindows`(Task 2), `readLines`(Task 5), `ClaudeSessionParser`·`CLAUDE_PARSER_VERSION`(Task 8), `claudeHome`·`listClaudeFiles`(Task 11), `mostlyBroken`(Task 12), `cacheKeyFor`·`loadCached`·`storeCached`(Task 13)
- Produces(2단계가 쓴다):
  - `interface EvalClock { nowMs: number; timeZone: string }`
  - `interface CollectOptions { env; homedir; clock: EvalClock; cacheDir: string | null; rescan: boolean }`
  - `interface ClaudeReadStats { files; listedBytes; bytes; fromCache; inProgress; olderThanWindow; unreadableFiles: string[]; unreadableFileBytes; unknownSizeFiles; unreadableDirs: string[] }`. 읽지 못한 것은 파일과 폴더로 나눈다(설계 9.8). `files`는 목록에 있는 세션 파일의 수(크기를 보지 못한 파일도 넣는다), `listedBytes`는 크기를 아는 파일의 바이트다. `unreadableFiles`는 크기를 보지 못했거나, 열거나 읽지 못했거나, 절반 넘게 깨진 파일이고 `unreadableFileBytes`는 그 가운데 크기를 아는 것의 바이트다. 2단계는 읽지 못한 비율을 `unreadableFiles`의 수 ÷ `files`와 `unreadableFileBytes` ÷ `listedBytes` 가운데 큰 쪽으로 낸다. 읽지 못한 파일은 분모에도 들어 있으므로 1을 넘지 않는다. `unreadableDirs`나 `unknownSizeFiles`가 있으면 그 비율은 아래 경계다(안의 파일 수와 크기를 모른다)
  - `interface ClaudeCollectResult { tool: "claude-code"; home; detected; summaries: SessionSummary[]; read: ClaudeReadStats; visibleFrom: LocalDate | null; overlappingSessions: number }`
  - `CLAUDE_PARSER_ID = "claude-code@<CLAUDE_PARSER_VERSION>"`, `collectClaude(options: CollectOptions): Promise<ClaudeCollectResult>`
  - `visibleFrom(summaries, olderThanWindow, collectStart): LocalDate | null`, `overlappingSessions(summaries): number`. 둘 다 요약의 차례와 상관없다(시험이 차례를 섞어 본다)
  - `collectFromList(home: string, list: FileList, options: CollectOptions): Promise<ClaudeCollectResult>`(`collectClaude`가 목록을 만든 뒤 부른다. 시험이 목록의 차례를 바꿔 넣는다), `unreadableCount(read: ClaudeReadStats): number`(관측에 넘기는 읽지 못한 것의 수. 파일과 폴더를 더한다)
- 규약.
  - `summaries`는 원본 파일의 `normPath` 차례다. 받은 목록의 차례와 상관없이 `normPath`로 다시 세워 읽는다. 같은 평가 시계에서 캐시를 켜고 끈 결과가 글자 하나 다르지 않아야 하고, 날짜가 바뀐 뒤에도 그 시계로 캐시를 쓴 결과와 새로 읽은 결과가 같아야 한다(설계 2, 12.1, 21.1). 날짜가 바뀌면 구간이 달라지므로 전날의 결과와 같을 필요는 없다.
  - 절반 넘게 깨진 파일(`mostlyBroken`)은 캐시에서 꺼냈든 새로 읽었든 `unreadableFiles`와 `unreadableFileBytes`에 넣고, 요약은 그대로 낸다(설계 20.1).
  - 훅의 오류 글은 요약에 들지 않으므로 캐시 파일에도 남지 않는다. 시험이 실제 캐시 파일의 글을 본다(설계 21.1).
  - 볼 수 있는 날짜 범위(`visibleFrom`)는 수정 시각으로 거른 파일이 있으면 수집 구간 첫날, 없으면 요약마다의 `firstDate` 가운데 가장 이른 날짜다(설계 9.8).
  - 캐시는 `cacheDir`가 있을 때만 읽고 쓴다. `rescan`이면 캐시와 수정 시각 거르기를 믿지 않고 다시 읽은 뒤 캐시를 새로 쓴다.
  - 진행 중인 파일, 그리고 열 때의 크기·수정 시각이 목록과 다른 파일은 캐시에 넣지 않는다(설계 9.4). 캐시를 쓰다 실패해도 점검은 이어 간다.
  - 열거나 읽지 못한 파일은 `unreadableFiles`(그리고 크기를 알면 `unreadableFileBytes`)에 넣고 이어 간다.
  - `visibleFrom`은 수정 시각이 수집 구간 시작보다 앞선 파일이 하나라도 있으면 수집 구간 첫날이고, 없으면 요약에 나온 가장 이른 날짜(수집 구간 첫날보다 앞서면 첫날)다(설계 9.8).
  - `overlappingSessions`는 처음 응답 ID 지문이 다른 세션과 겹치는 세션의 수다(설계 9.5).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/collect/claude.test.ts`:

```ts
// Claude Code 기록 모으기(캐시를 켜고 끈 결과의 같음, 날짜가 바뀐 경우, 진행 중인 파일, 볼 수 있는 날짜 범위, 겹친 응답)를 시험한다(설계 9.4, 9.8, 21.1 반례)
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeObservation } from "../../src/adapters/claude/observation.ts";
import { claudeHome, listClaudeFiles } from "../../src/adapters/claude/locate.ts";
import { collectClaude, collectFromList, overlappingSessions, unreadableCount, visibleFrom, type CollectOptions } from "../../src/collect/claude.ts";
import { assistant, attachment, user } from "../helpers/claude-lines.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 모으기 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");

async function session(project: string, id: string, lines: string[], mtimeMs = FILE_TIME): Promise<string> {
  const dir = join(root, ".claude", "projects", project);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  await writeFile(path, `${lines.join("\n")}\n`);
  await utimes(path, mtimeMs / 1000, mtimeMs / 1000);
  return path;
}

function options(overrides: Partial<CollectOptions> = {}): CollectOptions {
  return { env: {}, homedir: root, clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, cacheDir: null, rescan: false, ...overrides };
}

const sampleLines = (prefix: string): string[] => [
  user({ at: "2026-11-11T01:00:00Z", content: "hi", origin: "human" }),
  assistant({ id: `${prefix}-1`, at: "2026-11-11T01:00:05Z", usage: { input: 1, output: 2 } }),
];

describe("collectClaude", () => {
  it("캐시를 켜고 끈 결과가 글자 하나 다르지 않다", async () => {
    await session("p-b", "s2", sampleLines("b"));
    await session("p-a", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    const plain = await collectClaude(options());
    const first = await collectClaude(options({ cacheDir }));
    const second = await collectClaude(options({ cacheDir }));
    expect(second.read.fromCache).toBe(2);
    expect(JSON.stringify(second.summaries)).toBe(JSON.stringify(plain.summaries));
    expect(JSON.stringify(first.summaries)).toBe(JSON.stringify(plain.summaries));
    expect(plain.summaries.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
  });
  it("날짜가 하루 지나도, 같은 시계로 캐시를 쓴 결과와 캐시 없이 읽은 결과가 같다", async () => {
    await session("p", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    await collectClaude(options({ cacheDir }));
    const tomorrow = { nowMs: NOW + 24 * 3600 * 1000, timeZone: "Asia/Seoul" };
    const cached = await collectClaude(options({ cacheDir, clock: tomorrow }));
    const fresh = await collectClaude(options({ clock: tomorrow }));
    expect(cached.read.fromCache).toBe(1);
    expect(JSON.stringify(cached.summaries)).toBe(JSON.stringify(fresh.summaries));
  });
  it("수정 시각이 평가 시각에서 2초 안쪽인 파일은 쓰되 캐시에 넣지 않는다", async () => {
    await session("p", "s1", sampleLines("a"), NOW - 1000);
    const cacheDir = join(root, "state", "cache");
    const first = await collectClaude(options({ cacheDir }));
    const second = await collectClaude(options({ cacheDir }));
    expect(first.read.inProgress).toBe(1);
    expect(second.read.fromCache).toBe(0);
    expect(second.summaries).toHaveLength(1);
  });
  it("수집 구간보다 오래된 파일이 있으면 수집 구간 전체를 볼 수 있다. 없으면 가장 이른 기록의 날짜부터다", async () => {
    await session("p", "s1", sampleLines("a"));
    const without = await collectClaude(options());
    expect(without.visibleFrom).toBe("2026-11-11");
    await session("p", "old", sampleLines("o"), Date.parse("2026-01-01T00:00:00Z"));
    const withOld = await collectClaude(options());
    expect(withOld.read.olderThanWindow).toBe(1);
    expect(withOld.visibleFrom).toBe("2026-10-09");
  });
  it("rescan은 수정 시각으로 거르지 않는다", async () => {
    await session("p", "s1", sampleLines("a"));
    await session("p", "old", sampleLines("o"), Date.parse("2026-01-01T00:00:00Z"));
    const result = await collectClaude(options({ rescan: true }));
    expect(result.summaries.map((s) => s.sessionId)).toEqual(["old", "s1"]);
  });
  it("같은 응답이 다른 세션 파일에 복사돼 있으면 겹친 세션 수를 센다", async () => {
    await session("p", "s1", sampleLines("same"));
    await session("p", "s2", sampleLines("same"));
    await session("p", "s3", sampleLines("other"));
    const result = await collectClaude(options());
    expect(result.overlappingSessions).toBe(2);
  });
  it("절반 넘게 깨진 파일은 읽지 못한 파일로 세고, 캐시를 써도 같다", async () => {
    await session("p", "bad", ["{broken", "{broken", ...sampleLines("x").slice(0, 1)]);
    await session("p", "good", sampleLines("g"));
    const cacheDir = join(root, "state", "cache");
    const first = await collectClaude(options({ cacheDir }));
    const second = await collectClaude(options({ cacheDir }));
    for (const result of [first, second]) {
      expect(result.read.unreadableFiles.map((path) => path.endsWith("bad.jsonl"))).toEqual([true]);
      expect(result.read.unreadableFileBytes).toBeGreaterThan(0);
      expect(result.read.listedBytes).toBeGreaterThan(result.read.unreadableFileBytes);
      expect(result.read.unreadableFiles.length).toBeLessThanOrEqual(result.read.files);
      expect(claudeObservation(result.summaries, unreadableCount(result.read), "skill").complete).toBe(false);
    }
    expect(second.read.fromCache).toBe(2);
  });
  it("projects를 읽지 못하면 찾았지만 읽지 못한 것으로 내고 관측은 미확인이다", async () => {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "projects"), "not a folder");
    const result = await collectClaude(options());
    expect(result.detected).toBe(true);
    expect(result.read.unreadableDirs).toEqual([join(root, ".claude", "projects")]);
    expect(result.read.unreadableFiles).toEqual([]);
    expect(claudeObservation(result.summaries, unreadableCount(result.read), "mcp").complete).toBe(false);
  });
  it("읽지 못한 폴더는 파일과 따로 넘겨, 파일 수 기준 비율이 1을 넘지 않는다", async () => {
    await session("good", "s1", sampleLines("a"));
    for (const project of ["bad-1", "bad-2"]) {
      await mkdir(join(root, ".claude", "projects", project, "s9"), { recursive: true });
      await writeFile(join(root, ".claude", "projects", project, "s9", "subagents"), "not a folder");
    }
    const result = await collectClaude(options());
    expect(result.read.files).toBe(1);
    expect(result.read.unreadableFiles).toEqual([]);
    expect(result.read.unreadableDirs).toHaveLength(2);
    expect(result.read.unreadableFiles.length / result.read.files).toBe(0);
    expect(claudeObservation(result.summaries, unreadableCount(result.read), "skill").complete).toBe(false);
  });
  it("볼 수 있는 날짜 범위는 세지 않는 종류의 줄 날짜도 본다", async () => {
    await session("p", "s1", ['{"type":"api-request","timestamp":"2026-10-20T05:00:00Z"}', ...sampleLines("a")]);
    const result = await collectClaude(options());
    expect(result.visibleFrom).toBe("2026-10-20");
  });
  it("요약의 차례를 섞어도 볼 수 있는 날짜 범위와 겹친 세션 수가 같다", async () => {
    await session("p", "s1", sampleLines("same"));
    await session("p", "s2", sampleLines("same"));
    await session("q", "s3", ['{"type":"api-request","timestamp":"2026-10-25T05:00:00Z"}', ...sampleLines("other")]);
    const result = await collectClaude(options());
    const reversed = [...result.summaries].reverse();
    const rotated = [...result.summaries.slice(1), result.summaries[0]!];
    for (const order of [reversed, rotated]) {
      expect(visibleFrom(order, 0, "2026-10-09")).toBe(result.visibleFrom);
      expect(overlappingSessions(order)).toBe(result.overlappingSessions);
    }
    expect(result.overlappingSessions).toBe(2);
  });
  it("수집 구간 밖의 줄에 더 높은 버전이 있으면 그것이 세션 버전이고, 캐시를 써도 같다", async () => {
    await session("p", "s1", [assistant({ id: "old", at: "2026-09-01T00:00:00Z", version: "2.1.300" }), ...sampleLines("a").map((line) => line.replace('"2.1.300"', '"2.1.99"'))]);
    const cacheDir = join(root, "state", "cache");
    const plain = await collectClaude(options());
    await collectClaude(options({ cacheDir }));
    const cached = await collectClaude(options({ cacheDir }));
    expect(plain.summaries[0]!.version).toBe("2.1.300");
    expect(cached.read.fromCache).toBe(1);
    expect(JSON.stringify(cached.summaries)).toBe(JSON.stringify(plain.summaries));
  });
  it("모양이 깨진 캐시는 다시 읽어 캐시 없이 읽은 결과와 같다", async () => {
    await session("p", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    await collectClaude(options({ cacheDir }));
    const folder = join(cacheDir, "claude-code");
    const [name] = await readdir(folder);
    const entry = JSON.parse(await readFile(join(folder, name!), "utf8")) as Record<string, unknown>;
    await writeFile(join(folder, name!), JSON.stringify({ ...entry, summary: {} }));
    const again = await collectClaude(options({ cacheDir }));
    const plain = await collectClaude(options());
    expect(again.read.fromCache).toBe(0);
    expect(JSON.stringify(again.summaries)).toBe(JSON.stringify(plain.summaries));
  });
  it("크기를 보지 못한 파일은 파일 수 분모와 읽지 못한 파일에 넣고, 바이트에는 넣지 않으며, 관측은 미확인이다", async () => {
    for (const id of ["s1", "s2", "s3"]) await session("p", id, sampleLines(id));
    const home = claudeHome({}, root);
    const list = await listClaudeFiles(home, null);
    const unknown = join(home, "projects", "p", "s4.jsonl");
    const result = await collectFromList(home, { ...list, unreadableFiles: [unknown] }, options());
    expect(result.read.files).toBe(4);
    expect(result.read.unreadableFiles).toEqual([unknown]);
    expect(result.read.unknownSizeFiles).toBe(1);
    expect(result.read.unreadableFileBytes).toBe(0);
    expect(result.read.unreadableDirs).toEqual([]);
    expect(result.read.listedBytes).toBe(list.files.reduce((sum, file) => sum + file.size, 0));
    expect(result.read.unreadableFiles.length / result.read.files).toBe(0.25);
    expect(claudeObservation(result.summaries, unreadableCount(result.read), "mcp").complete).toBe(false);
  });
  it("훅의 오류 글은 실제 캐시 파일에도 남지 않는다", async () => {
    const secret = "unique-hook-cache-text-9b2c";
    await session("p", "s1", [
      ...sampleLines("a"),
      attachment("2026-11-11T01:00:06Z", { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: { blockingError: `denied ${secret}`, command: "x" } }),
    ]);
    const cacheDir = join(root, "state", "cache");
    const result = await collectClaude(options({ cacheDir }));
    expect(result.summaries[0]!.days["2026-11-11"]!.hooks).toEqual({ PreToolUse: { runs: 0, failures: 0, unclassifiedBlocks: 1 } });
    const folder = join(cacheDir, "claude-code");
    const names = await readdir(folder);
    expect(names.length).toBe(1);
    for (const name of names) expect(await readFile(join(folder, name), "utf8")).not.toContain(secret);
  });
  it("파일 목록의 차례가 달라도 요약·관측·버전·읽은 양이 같다", async () => {
    await session("p-b", "s2", sampleLines("b"));
    await session("p-a", "s1", sampleLines("a"));
    await session("p-c", "s3", ['{"type":"api-request","timestamp":"2026-10-25T05:00:00Z"}', ...sampleLines("c")]);
    const home = claudeHome({}, root);
    const list = await listClaudeFiles(home, null);
    const normal = await collectFromList(home, list, options());
    const reversed = await collectFromList(home, { ...list, files: [...list.files].reverse() }, options());
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(normal));
    expect(normal.summaries.map((s) => s.sessionId)).toEqual(["s1", "s2", "s3"]);
  });
  it("다른 작업 폴더에서 연 다음 세션의 처음 목록에 앞 세션의 스킬이 없어도 세션 안에서 다시 실린 것으로 적지 않는다", async () => {
    await session("p-1", "s1", [
      attachment("2026-11-11T00:00:00Z", { type: "skill_listing", isInitial: true, names: ["review"] }),
      ...sampleLines("a").map((line) => line.replace('"C:/work/proj"', '"C:/work/one"')),
    ]);
    await session("p-2", "s2", [
      attachment("2026-11-11T02:00:00Z", { type: "skill_listing", isInitial: true, names: [] }),
      ...sampleLines("b").map((line) => line.replace('"C:/work/proj"', '"C:/work/two"')),
    ]);
    const result = await collectClaude(options());
    const [one, two] = result.summaries;
    expect(one!.cwd).toBe("C:/work/one");
    expect(two!.cwd).toBe("C:/work/two");
    expect(one!.initialSkills).toEqual(["review"]);
    expect(two!.initialSkills).toEqual([]);
    for (const day of Object.values(two!.days)) expect(day.reloadedSkills).toEqual([]);
  });
  it("기록 폴더가 없으면 찾지 못한 것이고 요약이 비어 있다", async () => {
    const result = await collectClaude(options());
    expect(result.detected).toBe(false);
    expect(result.summaries).toEqual([]);
    expect(result.visibleFrom).toBeNull();
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/collect/claude.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/collect/claude.ts`:

```ts
// Claude Code 기록을 모아 세션 요약 목록과 읽은 양을 낸다. 바뀐 파일만 다시 읽고, 결과는 정규화한 경로 차례다(설계 8, 9.2~9.4, 9.8, 20.1)
import { join } from "node:path";
import { makeWindows, type LocalDate } from "../adapters/common/dates.ts";
import { readLines } from "../adapters/common/lines.ts";
import { claudeHome, listClaudeFiles, type FileList } from "../adapters/claude/locate.ts";
import { mostlyBroken } from "../adapters/claude/observation.ts";
import { CLAUDE_PARSER_VERSION, ClaudeSessionParser } from "../adapters/claude/parser.ts";
import type { SessionSummary } from "../adapters/types.ts";
import { cacheKeyFor, loadCached, storeCached, type CacheKey } from "../state/cache.ts";

export interface EvalClock {
  nowMs: number;
  timeZone: string;
}

export interface CollectOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  clock: EvalClock;
  /** 캐시 폴더. null이면 캐시를 읽지도 쓰지도 않는다(--no-save). */
  cacheDir: string | null;
  /** 캐시와 수정 시각 거르기를 믿지 않고 모두 다시 읽는다(--rescan). 읽은 결과는 캐시에 다시 쓴다. */
  rescan: boolean;
}

/** 읽은 양(설계 9.8). 읽지 못한 것은 파일과 폴더로 나눈다. 파일 수 기준 비율은 unreadableFiles ÷ files, 바이트 기준은 unreadableFileBytes ÷ listedBytes이고 1을 넘지 않는다. unreadableDirs나 unknownSizeFiles가 있으면 그 비율은 아래 경계다. */
export interface ClaudeReadStats {
  /** 목록에 있는 세션 파일의 수. 크기를 보지 못한 파일도 넣는다 */
  files: number;
  /** 크기를 아는 파일의 바이트를 더한 것 */
  listedBytes: number;
  bytes: number;
  fromCache: number;
  inProgress: number;
  olderThanWindow: number;
  /** 크기를 보지 못했거나, 열거나 읽지 못했거나, 절반 넘게 깨진 파일. 경로 차례다 */
  unreadableFiles: string[];
  /** unreadableFiles 가운데 크기를 아는 것의 바이트 */
  unreadableFileBytes: number;
  /** 크기를 보지 못한 파일의 수(unreadableFiles에도 들어 있다) */
  unknownSizeFiles: number;
  /** 목록을 읽지 못해 안을 모르는 폴더. 경로 차례다 */
  unreadableDirs: string[];
}

export interface ClaudeCollectResult {
  tool: "claude-code";
  home: string;
  detected: boolean;
  summaries: SessionSummary[];
  read: ClaudeReadStats;
  visibleFrom: LocalDate | null;
  overlappingSessions: number;
}

export const CLAUDE_PARSER_ID = `claude-code@${CLAUDE_PARSER_VERSION}`;

/** 관측(설계 9.8)에 넘기는 읽지 못한 것의 수. 파일과 폴더를 더한다. */
export function unreadableCount(read: ClaudeReadStats): number {
  return read.unreadableFiles.length + read.unreadableDirs.length;
}

export async function collectClaude(options: CollectOptions): Promise<ClaudeCollectResult> {
  const home = claudeHome(options.env, options.homedir);
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const list = await listClaudeFiles(home, options.rescan ? null : windows.collectStartLowerBoundMs);
  return collectFromList(home, list, options);
}

/** 파일 목록을 받아 모은다. 목록의 차례와 상관없이 정규화한 경로 차례로 읽고 낸다. */
export async function collectFromList(home: string, list: FileList, options: CollectOptions): Promise<ClaudeCollectResult> {
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const cacheDir = options.cacheDir === null ? null : join(options.cacheDir, "claude-code");
  const files = [...list.files].sort((a, b) => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0));
  const summaries: SessionSummary[] = [];
  const unreadableFiles = [...list.unreadableFiles];
  let unreadableFileBytes = 0;
  let bytes = 0;
  let fromCache = 0;
  let inProgress = 0;
  const markUnreadable = (path: string, size: number): void => {
    unreadableFiles.push(path);
    unreadableFileBytes += size;
  };

  for (const file of files) {
    let key: CacheKey | null = null;
    try {
      if (cacheDir !== null) {
        key = await cacheKeyFor(file, CLAUDE_PARSER_ID, options.clock.timeZone);
        if (!options.rescan) {
          const hit = await loadCached(cacheDir, key);
          if (hit !== null) {
            summaries.push(hit.summary);
            bytes += hit.bytesRead;
            fromCache++;
            if (mostlyBroken(hit.summary)) markUnreadable(file.path, file.size);
            continue;
          }
        }
      }
      const parser = new ClaudeSessionParser({
        sessionId: file.sessionId,
        kind: file.kind,
        parentSessionId: file.parentSessionId,
        timeZone: options.clock.timeZone,
      });
      const outcome = await readLines(file.path, options.clock.nowMs, {
        line: (text) => parser.line(text),
        tooLong: () => parser.tooLong(),
      });
      const summary = parser.finish(outcome.tail, outcome.inProgress);
      summaries.push(summary);
      bytes += outcome.bytesRead;
      if (mostlyBroken(summary)) markUnreadable(file.path, file.size);
      if (outcome.inProgress) {
        inProgress++;
        continue;
      }
      if (key !== null && cacheDir !== null && outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs) {
        try {
          await storeCached(cacheDir, { key, summary, bytesRead: outcome.bytesRead });
        } catch {
          // 캐시를 쓰지 못해도 점검은 이어 간다. 다음 점검이 다시 읽는다.
        }
      }
    } catch {
      markUnreadable(file.path, file.size);
    }
  }

  unreadableFiles.sort();
  return {
    tool: "claude-code",
    home,
    detected: list.projectsFound,
    summaries,
    read: {
      files: files.length + list.unreadableFiles.length,
      listedBytes: files.reduce((sum, file) => sum + file.size, 0),
      bytes,
      fromCache,
      inProgress,
      olderThanWindow: list.olderThanWindow,
      unreadableFiles,
      unreadableFileBytes,
      unknownSizeFiles: list.unreadableFiles.length,
      unreadableDirs: [...list.unreadableDirs].sort(),
    },
    visibleFrom: visibleFrom(summaries, list.olderThanWindow, windows.collectDates[0]!),
    overlappingSessions: overlappingSessions(summaries),
  };
}

/** 볼 수 있는 날짜 범위의 시작(설계 9.8). 수집 구간보다 오래된 파일이 있으면 구간 첫날, 없으면 세션마다 가장 이른 기록 날짜 가운데 가장 이른 것이다. 요약의 차례와 상관없다. */
export function visibleFrom(summaries: readonly SessionSummary[], olderThanWindow: number, collectStart: LocalDate): LocalDate | null {
  if (olderThanWindow > 0) return collectStart;
  let earliest: LocalDate | null = null;
  for (const summary of summaries) {
    if (summary.firstDate !== null && (earliest === null || summary.firstDate < earliest)) earliest = summary.firstDate;
  }
  if (earliest === null) return null;
  return earliest < collectStart ? collectStart : earliest;
}

/** 처음 응답 ID의 지문이 다른 세션과 겹치는 세션의 수(설계 9.5). 요약의 차례와 상관없다. */
export function overlappingSessions(summaries: readonly SessionSummary[]): number {
  const owners = new Map<string, Set<number>>();
  summaries.forEach((summary, index) => {
    for (const hash of summary.firstResponseIdHashes) {
      let set = owners.get(hash);
      if (set === undefined) {
        set = new Set();
        owners.set(hash, set);
      }
      set.add(index);
    }
  });
  const overlapping = new Set<number>();
  for (const set of owners.values()) {
    if (set.size > 1) for (const index of set) overlapping.add(index);
  }
  return overlapping.size;
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run test/collect/claude.test.ts` → PASS(18개).
Run: `npm test` → 지금까지의 시험이 모두 PASS.

- [ ] **Step 5: 커밋한다**

```bash
git add src/collect/claude.ts test/collect/claude.test.ts
git commit -m "feat: Claude Code 기록 모으기와 캐시 적용 추가"
```

---

### Task 15: `aq doctor`와 묶음 다시 만들기

**Files:**
- Create: `src/commands/doctor.ts`
- Modify: `src/cli.ts`
- Test: `test/commands/doctor.test.ts`
- Rebuild: `skills/aq/scripts/aq.mjs`

**Interfaces:**
- Produces:
  - `interface DoctorReport { node: { version; ok }; zstd: boolean; claudeCode: { home; projectsFound; sessionFiles; unreadable }; state: { dir; writable } }`. `unreadable`은 목록을 읽지 못한 폴더와 크기를 보지 못한 파일의 수다. `projects`를 읽지 못하면 `projectsFound`가 참이고 `unreadable`이 1 이상이다(과제 11)
  - `defaultStateDir(homedir: string): string`(`<homedir>/.chunsik-garage`, 설계 4절 저장 위치)
  - `hasZstd(): boolean`(설계 6.3. 버전 숫자가 아니라 기능이 있는지 본다)
  - `doctor(input: { env; homedir; nodeVersion; nodeOk; stateDir }): Promise<DoctorReport>`
  - `main(argv: string[], context?: { env: Record<string, string | undefined>; homedir: string }): Promise<number>`(시험이 임시 홈 폴더를 넘길 수 있게 바꾼다)
- `aq doctor`는 JSON을 표준 출력에 낸다. 상태 폴더에 시험 파일을 하나 썼다가 지워서 쓸 수 있는지 본다. Codex 몫은 5단계에서 더한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/doctor.test.ts`:

```ts
// aq doctor의 보고(기록 폴더, 세션 파일 수, 상태 폴더에 쓸 수 있는지, 압축 풀기 기능)를 시험한다(설계 6.3, 7.4)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli.ts";
import { defaultStateDir, doctor } from "../../src/commands/doctor.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 닥터 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("doctor", () => {
  it("기록 폴더와 세션 파일 수, 상태 폴더에 쓸 수 있는지를 낸다", async () => {
    await mkdir(join(root, ".claude", "projects", "p"), { recursive: true });
    await writeFile(join(root, ".claude", "projects", "p", "s.jsonl"), "{}\n");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: defaultStateDir(root) });
    expect(report.claudeCode).toEqual({ home: join(root, ".claude"), projectsFound: true, sessionFiles: 1, unreadable: 0 });
    expect(report.state).toEqual({ dir: join(root, ".chunsik-garage"), writable: true });
    expect(typeof report.zstd).toBe("boolean");
    expect(report.node).toEqual({ version: "v24.0.0", ok: true });
  });
  it("기록 폴더를 읽지 못하면 찾았지만 읽지 못한 폴더의 수를 낸다", async () => {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "projects"), "x");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: defaultStateDir(root) });
    expect(report.claudeCode).toMatchObject({ projectsFound: true, sessionFiles: 0, unreadable: 1 });
  });
  it("상태 폴더를 만들 수 없으면 쓸 수 없다고 낸다", async () => {
    const blocker = join(root, "file");
    await writeFile(blocker, "x");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: join(blocker, "state") });
    expect(report.state.writable).toBe(false);
  });
  it("aq doctor는 JSON을 내고 0을 돌려준다", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await main(["doctor"], { env: {}, homedir: root });
    expect(code).toBe(0);
    const printed = JSON.parse(String(write.mock.calls[0]![0]));
    expect(printed.claudeCode.projectsFound).toBe(false);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run test/commands/doctor.test.ts`
Expected: FAIL. `doctor.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/commands/doctor.ts`:

```ts
// aq doctor. Node.js 버전, 압축 기록을 풀 수 있는지, Claude Code 기록 폴더, 상태 폴더에 쓸 수 있는지를 JSON으로 알린다(설계 6.3, 7.4)
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { claudeHome, listClaudeFiles } from "../adapters/claude/locate.ts";

export interface DoctorReport {
  node: { version: string; ok: boolean };
  zstd: boolean;
  claudeCode: { home: string; projectsFound: boolean; sessionFiles: number; unreadable: number };
  state: { dir: string; writable: boolean };
}

export function defaultStateDir(homedir: string): string {
  return join(homedir, ".chunsik-garage");
}

export function hasZstd(): boolean {
  return typeof (zlib as unknown as Record<string, unknown>).createZstdDecompress === "function";
}

async function canWrite(dir: string): Promise<boolean> {
  const probe = join(dir, `.write-probe-${process.pid}`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(probe, "ok");
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function doctor(input: {
  env: Record<string, string | undefined>;
  homedir: string;
  nodeVersion: string;
  nodeOk: boolean;
  stateDir: string;
}): Promise<DoctorReport> {
  const home = claudeHome(input.env, input.homedir);
  const list = await listClaudeFiles(home, null);
  return {
    node: { version: input.nodeVersion, ok: input.nodeOk },
    zstd: hasZstd(),
    claudeCode: { home, projectsFound: list.projectsFound, sessionFiles: list.files.length, unreadable: list.unreadableDirs.length + list.unreadableFiles.length },
    state: { dir: input.stateDir, writable: await canWrite(input.stateDir) },
  };
}
```

`src/cli.ts`를 아래로 바꾼다.

```ts
// aq 명령의 입구. Node.js 버전을 확인하고 하위 명령으로 나눠 보낸다
import { homedir } from "node:os";
import { defaultStateDir, doctor } from "./commands/doctor.ts";
import { PROGRAM_VERSION } from "./version.ts";

export function nodeMajorOk(version: string): boolean {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}

export interface CliContext {
  env: Record<string, string | undefined>;
  homedir: string;
}

export async function main(argv: string[], context: CliContext = { env: process.env, homedir: homedir() }): Promise<number> {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).\n`);
    return 2;
  }
  const [command] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}\n`);
    return 0;
  }
  if (command === "doctor") {
    const report = await doctor({
      env: context.env,
      homedir: context.homedir,
      nodeVersion: process.version,
      nodeOk: nodeMajorOk(process.version),
      stateDir: defaultStateDir(context.homedir),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  process.stderr.write(`Unknown command: ${command ?? "(none)"}\n`);
  return 64;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 본다**

Run: `npx vitest run test/commands/doctor.test.ts test/cli.test.ts` → PASS(7개).
Run: `npx tsc --noEmit` → 출력 없음.

- [ ] **Step 5: 묶음을 다시 만들고 이 PC에서 돌려 본다**

Run: `npm run build`
Run: `node skills/aq/scripts/aq.mjs doctor`
Expected: JSON이 나온다. `node.ok`가 `true`, `claudeCode.projectsFound`가 `true`, `state.writable`이 `true`다. `sessionFiles`는 이 PC의 수라서 저장소나 병합 요청에 옮기지 않는다.
Run: `npm run check` → 타입 검사, 모든 시험, `묶음 검사 통과`

- [ ] **Step 6: 커밋한다**

```bash
git add src/commands/doctor.ts src/cli.ts test/commands/doctor.test.ts skills/aq/scripts/aq.mjs
git commit -m "feat: aq doctor 명령 추가"
```

---

### Task 16: 이 PC의 기록으로 실측하기

**Files:**
- Create: `scripts/run-ts.mjs`, `scripts/dev-summary.ts`

**Interfaces:**
- Consumes: `collectClaude`(Task 14), `claudeObservation`(Task 12)
- 개발용이다. 묶은 실행 파일에 들어가지 않는다. 결과는 합계만 화면에 내고 저장소에 남기지 않는다. 스킬·서버·프로젝트 이름과 경로는 내지 않는다.
- `run-ts.mjs`는 묶기가 실패해도 임시 폴더를 지운다(묶기와 실행을 모두 `try` 안에 둔다).

- [ ] **Step 1: 개발용 실행기와 합계 스크립트를 만든다**

`scripts/run-ts.mjs`:

```js
// 개발용. TypeScript 파일 하나를 임시 폴더에 묶어 바로 실행한다(저장소에 묶음을 남기지 않는다)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const entry = process.argv[2];
if (entry === undefined) {
  console.error("쓰는 법: node scripts/run-ts.mjs <파일.ts> [인자…]");
  process.exit(64);
}
const dir = mkdtempSync(join(tmpdir(), "aq-dev-"));
try {
  const outfile = join(dir, "run.mjs");
  await build({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "warning" });
  process.argv.splice(2, 1);
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
```

`scripts/dev-summary.ts`:

```ts
// 개발용. 이 PC의 Claude Code 기록을 읽어 합계·걸린 시간·메모리만 낸다. 이름, 경로, 본문은 내지 않는다
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { claudeObservation } from "../src/adapters/claude/observation.ts";
import { collectClaude, unreadableCount } from "../src/collect/claude.ts";

const useCache = process.argv.includes("--cache-twice");
const cacheDir = useCache ? mkdtempSync(join(tmpdir(), "aq-dev-cache-")) : null;
const clock = { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };

async function once(label: string) {
  const started = performance.now();
  const result = await collectClaude({ env: process.env, homedir: homedir(), clock, cacheDir, rescan: false });
  const seconds = (performance.now() - started) / 1000;
  const totals = { main: 0, sub: 0, responses: 0, humanRequests: 0, weakHumanRequests: 0, output: 0, interruptedTurns: 0, brokenLines: 0, tailFragments: 0, tooLongLines: 0 };
  for (const s of result.summaries) {
    if (s.kind === "main") totals.main++;
    else totals.sub++;
    totals.brokenLines += s.missing.brokenLines;
    totals.tailFragments += s.missing.tailFragments;
    totals.tooLongLines += s.missing.tooLongLines;
    for (const day of Object.values(s.days)) {
      totals.responses += day.responses;
      totals.humanRequests += day.humanRequests;
      totals.weakHumanRequests += day.weakHumanRequests;
      totals.output += day.tokens.output;
      totals.interruptedTurns += day.interruptedTurns;
    }
  }
  const gigabytes = result.read.bytes / 1024 ** 3;
  console.log(
    JSON.stringify(
      {
        label,
        seconds: Number(seconds.toFixed(2)),
        secondsPerGb: gigabytes > 0 ? Number((seconds / gigabytes).toFixed(2)) : null,
        peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
        read: { ...result.read, unreadableFiles: result.read.unreadableFiles.length, unreadableDirs: result.read.unreadableDirs.length },
        totals,
        overlappingSessions: result.overlappingSessions,
        observation: {
          skill: claudeObservation(result.summaries, unreadableCount(result.read), "skill"),
          mcp: claudeObservation(result.summaries, unreadableCount(result.read), "mcp"),
        },
      },
      null,
      2,
    ),
  );
}

try {
  await once(useCache ? "first (writes cache)" : "no cache");
  if (useCache) await once("second (reads cache)");
} finally {
  if (cacheDir !== null) rmSync(cacheDir, { recursive: true, force: true });
}
```

- [ ] **Step 2: 캐시 없이 한 번 잰다**

Run: `node scripts/run-ts.mjs scripts/dev-summary.ts`
Expected: JSON 한 덩어리. 설계 22절의 목표와 견준다. `secondsPerGb`가 8 이하, `peakRssMb`가 500 이하인지 본다. `read.unreadable`이 0이고 `totals.weakHumanRequests`가 `humanRequests`의 10% 아래인지 본다(설계 9.5의 알림 기준).

- [ ] **Step 3: 캐시를 써서 두 번 잰다**

Run: `node scripts/run-ts.mjs scripts/dev-summary.ts --cache-twice`
Expected: 두 번째 덩어리의 `read.fromCache`가 첫 번째에서 진행 중이던 파일을 뺀 수와 같고, 두 번째의 `totals`가 첫 번째와 같다(진행 중인 파일이 그 사이 자랐으면 그 파일의 몫만 다를 수 있다).

- [ ] **Step 4: 결과를 저장소 밖에 적는다**

두 결과를 `%LOCALAPPDATA%\짝작업\chunsik-garage\<날짜>-1단계\실측.md`에 붙인다. 목표를 넘은 값이 있으면 그 사실과 숫자를 같은 파일에 적고, 2단계 계획을 쓰기 전에 개선 과제(작업자를 써서 나눠 읽기, 설계 22절)를 원장에 올린다. 저장소와 병합 요청에는 숫자를 넣지 않는다.

- [ ] **Step 5: 커밋한다**

```bash
git add scripts/run-ts.mjs scripts/dev-summary.ts
git commit -m "chore: 이 PC 기록으로 합계와 속도를 재는 개발용 스크립트 추가"
```

---

### Task 17: 큰 자료로 크기와 메모리 시험

**Files:**
- Create: `scripts/measure-collect.ts`
- Test: `test/big/size-memory.test.ts`

**Interfaces:**
- Consumes: `collectClaude`(Task 14), `scripts/run-ts.mjs`(Task 16)
- 설계 21.1의 「크기와 메모리」 시험이다. 시험이 그 자리에서 600MB가 넘는 합성 기록(16MB가 넘는 줄 24개, 실제와 같은 길이(28자)의 응답 ID 100만 종)을 만들고, 모으기를 따로 띄운 프로세스에서 돌려 그 프로세스의 최대 상주 메모리를 잰다. 목표는 500MB 안쪽이다(설계 22). 작업자를 쓰는 나눠 읽기는 1단계에 없으므로 "작업자 수 1과 상한의 결과가 같다"는 시험은 나눠 읽기를 넣을 때 더한다.
- 메모리는 과제 5(줄을 모으는 버퍼 하나를 다시 쓰기)와 과제 8(응답 상태를 숫자 배열에 담기)에서 이미 묶었다. 계획 리뷰 1차에서 응답마다 객체를 두던 첫 구조로는 이 시험이 실패했고, 지금 구조로 Windows 11·Node.js 24에서 재 보니 목표 안쪽이었다(값은 저장소 밖 기록에 있다).
- 그래도 이 시험이 실패하면(메모리가 500MB를 넘으면) 다음 과제로 넘어가지 않는다. 고친 파일(`responses.ts`, `parser.ts`, `lines.ts` 등)과 그 회귀 시험을 이 과제의 커밋에 함께 넣고, 과제 8~10의 시험과 과제 14의 캐시 동일성 시험을 다시 돌린다. 시험의 상한을 올리거나 응답 수를 줄여서 통과시키지 않는다.

- [ ] **Step 1: 잴 스크립트를 만든다**

`scripts/measure-collect.ts`:

```ts
// 시험용. 주어진 홈 폴더의 Claude Code 기록을 모아 응답 수, 너무 긴 줄 수, 읽은 바이트, 걸린 시간, 최대 상주 메모리만 JSON 한 줄로 낸다
import { collectClaude } from "../src/collect/claude.ts";

const home = process.argv[2];
if (home === undefined) {
  console.error("쓰는 법: node scripts/run-ts.mjs scripts/measure-collect.ts <홈 폴더>");
  process.exit(64);
}
const started = performance.now();
const result = await collectClaude({
  env: {},
  homedir: home,
  clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "UTC" },
  cacheDir: null,
  rescan: true,
});
let responses = 0;
let tooLongLines = 0;
for (const summary of result.summaries) {
  tooLongLines += summary.missing.tooLongLines;
  for (const day of Object.values(summary.days)) responses += day.responses;
}
console.log(
  JSON.stringify({
    responses,
    tooLongLines,
    bytes: result.read.bytes,
    seconds: (performance.now() - started) / 1000,
    peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
  }),
);
```

- [ ] **Step 2: 시험을 쓴다**

`test/big/size-memory.test.ts`:

```ts
// 큰 합성 기록(600MB가 넘는 파일, 16MB가 넘는 줄, 실제와 같은 길이의 응답 ID 100만 종)으로 크기와 최대 상주 메모리를 시험한다(설계 21.1, 22)
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const RESPONSES = 1_000_000;
const LONG_LINES = 24;
const LONG_LINE_BYTES = 16 * 1024 * 1024 + 1024;
let root: string;
let logPath: string;

/** 실제 응답 ID와 같은 28자(msg_01 + 22자). */
const responseId = (i: number): string => `msg_01${i.toString(36).padStart(22, "0")}`;

async function writeBigLog(path: string): Promise<void> {
  const stream = createWriteStream(path);
  // 쓰기 오류가 나면 drain을 기다리던 once가 거부되어 시험이 그 오류로 실패한다
  const push = async (text: string): Promise<void> => {
    if (!stream.write(text)) await once(stream, "drain");
  };
  let batch = "";
  for (let i = 0; i < RESPONSES; i++) {
    batch +=
      `{"parentUuid":null,"message":{"id":"${responseId(i)}","model":"claude-test","content":[],"stop_reason":"end_turn",` +
      `"usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}},` +
      `"effort":"medium","type":"assistant","timestamp":"2026-11-11T10:00:00Z"}\n`;
    if (batch.length > 1 << 20) {
      await push(batch);
      batch = "";
    }
  }
  await push(batch);
  const filler = "x".repeat(LONG_LINE_BYTES);
  for (let i = 0; i < LONG_LINES; i++) await push(`{"type":"api-request-blob","blob":"${filler}"}\n`);
  stream.end();
  await once(stream, "finish");
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "aq-big-"));
  await mkdir(join(root, ".claude", "projects", "p"), { recursive: true });
  logPath = join(root, ".claude", "projects", "p", "big.jsonl");
  await writeBigLog(logPath);
}, 300_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("크기와 메모리", () => {
  it("600MB가 넘는 파일, 16MB가 넘는 줄, 응답 ID 100만 종을 500MB 안쪽 메모리로 읽는다", async () => {
    expect((await stat(logPath)).size).toBeGreaterThan(600 * 1024 * 1024);
    const { stdout } = await run(process.execPath, ["scripts/run-ts.mjs", "scripts/measure-collect.ts", root], { maxBuffer: 1 << 20 });
    const measured = JSON.parse(stdout.trim().split("\n").pop()!);
    expect(measured.responses).toBe(RESPONSES);
    expect(measured.tooLongLines).toBe(LONG_LINES);
    expect(measured.peakRssMb).toBeLessThanOrEqual(500);
  }, 300_000);
});
```

- [ ] **Step 3: 시험을 돌린다**

Run: `npx vitest run test/big/size-memory.test.ts`
Expected: PASS. 실패하면 `measured`를 출력해 어느 조건이 틀렸는지 보고, 메모리라면 위 과제 설명대로 고친 뒤 다시 돌린다. 걸린 시간과 메모리 값은 저장소 밖 실측 파일에 적는다(합성 자료의 값이라 이 PC의 사용량이 아니지만, 저장소에는 넣지 않는다).

- [ ] **Step 4: 커밋한다**

```bash
git add scripts/measure-collect.ts test/big/size-memory.test.ts
# 이 과제에서 메모리를 고쳤다면 고친 파일과 회귀 시험도 여기에 더한다
git commit -m "test: 큰 합성 기록으로 크기와 메모리 시험 추가"
```

---

### Task 18: 1단계 마무리

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

- [ ] **Step 1: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 167개 통과(과제마다의 수를 더한 것. 1: 7, 2: 6, 3: 5, 4: 8, 5: 8, 6: 8, 7: 22, 8: 20, 9: 18, 10: 20, 11: 8, 12: 8, 13: 6, 14: 18, 15: 4, 17: 1), `묶음 검사 통과`.

- [ ] **Step 2: Node.js 22에서도 돌린다**

이 PC의 Node.js가 24라면 22를 설치하지 않고 npm의 `node` 꾸러미로 한 번 돌린다.

Run: `npx -y -p node@22 -- node --version` → `v22.`으로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS. 이 방법이 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 3: 원장을 고치고 커밋한다**

원장에 「1단계 Claude Code 기록 읽기」 과제를 끝남으로 적고(구현 착수 때 진행 중으로 올린 과제), 커밋 해시와 확인한 것을 세부에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 1단계 끝남 표시"
```

- [ ] **Step 4: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage1.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~17의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과), 「확인하지 못한 것」(macOS·Linux 실제 기기, 실측 숫자는 저장소 밖에 있음)이다. 이 PC의 숫자, 경로, 이름은 넣지 않는다.

```bash
git push -u origin 1단계-클로드코드-기록읽기
gh pr create --base develop --head 1단계-클로드코드-기록읽기 --title "feat: 1단계 Claude Code 기록 읽기와 캐시" --body-file "$TEMP/aq-pr-stage1.md"
```

- [ ] **Step 5: 짝 검증을 받는다**

새 짝 Codex를 만들어(1단계 전용) 다음을 맡긴다. 코드 정독(설계 9.3~9.5·9.8과 이 계획 대조), `npm run check` 재실행, 이 PC의 Claude Code 기록에서 **구조만** 따로 세어 `dev-summary`의 합계와 대조(응답 ID 수, `origin.kind`별 수, 끊은 표지 수, 거절 종류별 수). 짝의 필수 지적이 0건일 때 병합한다.

---

## 자기 점검(계획 리뷰 3차를 반영한 뒤)

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 2, 21.1 | 묶은 파일에 네트워크를 부르는 곳이 없음(가져오기는 metafile로, 전역 호출은 글자로) | 1 |
| 6.3 | Node.js 22 이상, 미달이면 알리고 멈춤 | 1, 15 |
| 6.3 | 압축 풀기 기능이 있는지 직접 확인 | 15(`hasZstd`). 압축 기록 읽기 자체는 5단계(Codex) |
| 6.3, 21.1 | 묶은 파일을 저장소에 올림, 줄이지 않음, 원본과 같은지 | 1, 15 |
| 7.2 | 해석부는 순수, 파일을 여는 부분과 나눔 | 2~4, 6~10, 12(순수) / 5, 11, 13, 14(파일) |
| 7.3 | 못 보는 지표는 0이 아님, 관측 범위 | 12(`CLAUDE_COVERAGE`). 공통 어댑터 모양은 5단계 |
| 7.4 | `aq doctor` | 15(Codex 몫은 5단계) |
| 8 | 기록은 읽기만, 본문은 세고 버림 | 5, 8~10(훅 오류 글이 요약에 남지 않는 시험은 10) |
| 9.1 | 읽는 곳과 `CLAUDE_CONFIG_DIR` | 11 |
| 9.2 | 주 세션과 하위 세션, 부모. 숫자마다 넣는 세션(하위 세션의 도구 결과와 끊은 표지도 센다) | 7, 9, 11 |
| 9.3 | 세션마다·날짜마다 요약, 세션 버전은 가장 높은 것, 실린 이름과 다시 실린 이름, 기록이 있는 가장 이른 날짜, 구간 | 2, 3, 6, 8~10 |
| 9.4 | 캐시와 열쇠, 날짜로 자르지 않음, 진행 중인 파일, 줄 표, 수정 시각 거르기, 16MB, 모든 줄을 풀어 보고 세는 해석은 필요한 종류에만 | 5, 8, 13, 14 |
| 9.5 | 응답·토큰(마지막 값, 합성 제외), 사람 요청 판별 1~11과 명령 줄, 도구·결과·오류·셸, 거절과 끊김, 끊은 표지를 두 번 세지 않기, 압축, 끊긴 응답, 강도, 권한 모드, 하위 에이전트, 훅(실패 표지와 가릴 수 없는 막음), MCP 호출·연결 실패·실린 이름, 지침 크기, 스킬 신호 1~4, 다른 파일에 복사된 응답 알림 | 7~10, 14. 신호 5(`skillUsage`)는 2단계 스캐너 |
| 9.7 | Claude Code 관측 범위 | 12 |
| 9.8 | 읽은 양(파일 수·바이트·읽지 못한 것과 그 바이트), 관측이 빠짐없는지, 볼 수 있는 날짜 범위 | 8, 12, 14 |
| 12.1 | 입력 묶음 가운데 세션 요약과 읽은 양 | 14 |
| 20.1 | 못 읽은 것을 숨기지 않음(최상위 폴더의 읽기 오류), 절반 넘게 깨진 파일, 깨진 캐시와 모양이 다른 캐시는 다시 읽음 | 6, 8, 11~15 |
| 21.1 | 어댑터 반례(Claude Code 몫), 결정성(캐시 켜고 끔, 날짜 바뀜, 요약의 차례), 경로(공백·한글), 크기와 메모리 | 5, 6, 8~11, 13, 14, 17 |
| 22 | 속도와 메모리 목표를 잼 | 5, 8(메모리를 묶는 구조), 16, 17 |

1단계에 넣지 않은 것(뒤 단계에서 한다). 셋팅 스캐너와 신호 5(2단계), 지표·규칙·점수·평가 결과(2단계), Codex 어댑터와 압축 기록(5단계), 작업자를 쓰는 나눠 읽기(실측에서 목표를 넘을 때 원장에 올림), 공통 어댑터 모양(5단계).

뒤 단계 계획 전에 정할 설계 결정은 원장에 올렸다. 2단계 전에 사용자만 부르는 스킬의 사용 신호(과제 8), 세션 사이의 빠짐을 주 세션끼리만 볼지·차례가 필요 없는 풀이·작업 폴더가 둘 이상인 세션(과제 9), 5단계 전에 건너뛴 압축 파일을 읽지 못한 비율에 넣는지(과제 10)다. 1단계 요약에는 세션의 종류, 처음 목록, 날짜별 이름, 작업 폴더(처음 것)가 있어서 과제 9의 앞의 둘(주 세션끼리만 볼지, 차례가 필요 없는 풀이)은 1단계를 다시 만들지 않고 정할 수 있다. 과제 8에서 신호 3의 대상을 실린 목록 밖까지 넓히기로 하거나(지금 요약은 실린 목록에 없는 명령의 이름을 남기지 않는다), 과제 9에서 작업 폴더를 모두 써야 한다고 정하면 해석을 바꾸고 해석 버전을 올려 원본을 다시 읽는다.

### 빈칸과 이름

- "TBD", "나중에", "비슷하게" 같은 빈칸 표현을 찾았고 없다.
- `src/`, `test/helpers/`, `scripts/bundle-scan.mjs`, `scripts/bundle-options.mjs`가 내보내는 이름을 마지막 코드에서 기계로 세었다. 108개이고 파일끼리 겹치는 이름은 없다(`bundle-scan.d.mts`는 같은 이름의 타입 선언이라 뺐다).
- `parser.ts`는 과제 8에서 만들고 과제 9·10에서 바꾼다. 과제 8의 파일에 과제 9·10의 조각을 이 계획이 말한 자리와 차례대로 적용한 결과가 마지막 코드와 글자 하나 다르지 않음을 기계로 확인했다.

### 이 계획을 돌려 본 것

계획 리뷰 3차를 반영한 뒤, 이 문서에서 코드 블록을 기계로 뽑아 저장소 밖 빈 폴더에서 과제 1부터 17까지 차례대로 만들었다(Windows 11, Node.js 24, 그때의 최신 개발 의존성).

- 과제마다 새 시험은 구현 전에 실패했다. 과제 1~8과 11~15는 가져올 모듈이 없어서, 과제 9는 18개 모두, 과제 10은 20개 모두 앞 과제의 코드에서 실패했다.
- 과제마다 구현 뒤 그 과제의 시험과 그때까지의 전체 시험, 타입 검사(`tsc --noEmit`)가 통과했다. 시험 수는 과제마다 적은 수와 같았고 합은 167개다.
- 과제 1, 15, 17 뒤의 `npm run check`(타입 검사, 시험, 묶음 검사)가 통과했다.
- 계획 리뷰 1차에서 더한 반례 시험을 고치기 전 계획의 코드에 돌렸다. 지적마다 그 결함을 보이는 시험이 실패했다(하위 세션의 도구 결과와 끊은 표지, 출처가 있는 스킬 명령, 겉모양만 온전한 깨진 줄, 절반 넘게 깨진 파일, 다시 실린 이름, 최상위 폴더의 읽기 오류, 세지 않는 줄의 날짜, 모양이 다른 캐시, 기본 속성과 같은 이름). 새로 더한 칸이나 함수가 없어서 실패한 시험도 섞여 있다. 버전 반례와 요약의 차례를 섞는 시험 가운데 겹친 세션 수는 고치기 전에도 맞았던 것을 지키는 시험이다.
- 큰 자료 시험(과제 17)이 통과했다. 이 PC의 기록으로 잰 과제 16의 속도와 메모리도 설계 22의 목표 안쪽이었다. 값은 저장소 밖 기록에 있다.
- `npx -p node@22`로 받은 Node.js 22에서도 큰 자료 시험을 포함한 시험이 모두 통과했다.

### 확인하지 못한 것

- macOS와 Linux 실제 기기. 경로와 수정 시각의 정밀도가 다를 수 있다.
- 실패해서 막힌 훅의 실제 첨부는 이 PC 기록에 없어서, 실패 표지 판정은 공식 문서의 문구로만 짰다(설계 27절).
- 세션 안에서 실린 목록에서 빠졌다가 다시 실린 실제 기록은 보지 못했다. 다시 실린 이름은 합성 기록으로만 시험했다.
- 사람이 친 스킬 명령 줄의 모양(`<command-message>`가 먼저, `origin`이 `human`)은 이 PC 기록의 한 줄로 봤다. 다른 버전의 모양은 확인하지 못했다.
- 하위 세션 파일의 끊은 표지는 이 PC 기록에 없었다. 하위 세션의 표지를 세는 것은 합성 기록으로만 시험했다.
- 메모리 값은 기기와 실행 조건에 따라 달라진다. 목표와의 여유가 다른 기기에서도 남는지는 재 보지 않았다.
