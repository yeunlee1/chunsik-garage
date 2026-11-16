# AQ 점검 5단계 5부 — Codex 플러그인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 산출물로 두 도구의 설치를 다시 해 보는 것으로 검증한다.

**Goal:** 이 저장소를 Codex 플러그인으로도 설치할 수 있게 한다. Codex 플러그인 정보와 Codex 마켓 목록을 더하고, 버전 검사와 배포 산출물에 두 파일을 넣는다. 산출물을 Codex에 설치하면 모델 앞의 스킬 목록에 점검 스킬이 실리고, 그 스킬이 가리키는 실행 파일이 설치된 자리에서 돈다.

**Architecture:** Codex는 마켓 목록(`.agents/plugins/marketplace.json`)의 `source: "./"`를 마켓의 뿌리로 풀어 산출물의 뿌리를 플러그인 하나로 설치한다. 플러그인 정보(`.codex-plugin/plugin.json`)의 `skills`(`./skills/`)에서 `skills/aq/SKILL.md`를 찾아 모델 앞의 스킬 목록에 `chunsik-garage:aq`로 싣고, 스킬 파일의 경로를 함께 준다. Claude Code는 `.claude-plugin`만 읽으므로 두 도구가 같은 스킬 폴더와 묶은 실행 파일을 나눠 쓴다. 버전 검사(`scripts/version-scan.mjs`)는 버전을 읽는 곳을 여섯으로 늘리고, 산출물 목록(`scripts/plugin-files.mjs`)은 두 파일을 담는다. 스킬 본문과 묶은 실행 파일은 바꾸지 않는다.

**Tech Stack:** JSON(두 매니페스트), Node.js 스크립트(`scripts/*.mjs`), Vitest(시험). 설치 확인은 Codex CLI 0.166.0과 Claude Code로 한다. 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 끝의 「5단계 5부 계획 전 결정」(1~9번)과, 그것이 기대는 5, 7.1, 15, 18.3, 20.2, 21.1, 23, 27절, 「4단계 계획에서 보완」 4·5번을 구현한다.

## 5단계 5부의 범위

| 넣는 것 | 넣지 않는 것(그 단계) |
|---|---|
| Codex 플러그인 정보와 마켓 목록, 버전 검사의 두 곳, 산출물의 두 파일, 산출물로 두 도구의 설치와 스킬 목록 확인, 설치된 자리에서 실행 파일이 도는지 확인 | 스킬 본문과 묶은 실행 파일은 바꾸지 않는다(결정 6). 저장 승인을 먼저 묻는 흐름은 실제 Codex 실행에서 보고 정한다(결정 8). Codex 정비(6단계), 세션 시작 훅과 그것이 Codex에서 돌지 않는지의 확인(7단계), 사용자가 설치로 받는 브랜치를 가리키는 법과 README 두 벌(8단계) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- 두 도구의 기록과 셋팅, 홈의 `.agents`, 프로젝트 폴더는 읽기만 한다. 설치 확인은 빈 임시 Codex 홈(`CODEX_HOME`)에서 하고, 사용자의 Codex 홈과 Claude Code 설정에 플러그인을 설치하지 않는다. Codex 명령은 모두 임시 홈을 주고 돌린다(`codex sandbox`처럼 이 PC의 Windows 샌드박스 계정을 쓰는 명령은 돌리지 않는다).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더의 기록과 셋팅을 읽지 않고 저장소의 파일과 임시 폴더만 쓴다(설계 21.1). 파일 링크를 만들 수 없는 Windows에서는 그 시험을 건너뛴다.
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다. 주석을 둘 수 없는 설정 파일(JSON)은 뺀다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `5단계-5부-Codex-플러그인` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증의 필수는 제품 결함과 수용 조건 미충족뿐이다(사용자 지시 2026-11-16).
- 모델을 부르는 확인(Codex로 "AQ 점검해 줘"를 실제로 돌리기)은 사용자 계정의 사용량과 로그인 정보를 쓰므로 사용자에게 묻고 승인받은 방법으로만 한다. 승인이 없으면 하지 않고 확인하지 못한 것으로 적는다(결정 7).
- 이 PC의 기록과 셋팅에서 본 이름, 경로, 값, 개수는 저장소와 병합 요청에 넣지 않는다(설계 머리말). 모델 앞 입력처럼 사용자의 스킬 이름이 든 출력과 이 PC로 돌린 도구와 결과는 저장소 밖에 둔다.

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `C7045C12BE7D3A0CAE0902E1368513CADBB4F74CB944B902B4F2C0FBECE3E2BA`, 4,454줄)이다. 설계 끝에 「5단계 5부 계획 전 결정」을 더했고(앞 커밋), 27절에서 확인한 것(Codex 마켓 파일의 필드와 `source` 값)을 결정 3번으로 옮겼다. 계획을 쓰며 설치한 산출물로 확인한 것(설치된 자리에서 실행 파일이 도는 것, 공백과 한글이 든 Codex 홈)을 결정 7번에 더하고, 4부가 5부에 넘긴 저장 승인과 저장 없는 실행(20.2)을 결정 8번으로 더하고 남는 것을 9번으로 밀었다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `.codex-plugin/plugin.json`(새 파일) | 1 | Codex 플러그인 정보 |
| `.agents/plugins/marketplace.json`(새 파일) | 1 | Codex 마켓 목록 |
| `scripts/version-scan.mjs`, `scripts/version-scan.d.mts`(고침) | 1 | 버전을 읽는 곳을 여섯으로 늘림 |
| `scripts/plugin-files.mjs`(고침) | 1 | 산출물에 두 파일을 담음 |
| `src/version.ts`(고침) | 1 | 주석만 고침(묶은 실행 파일은 그대로) |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제 1은 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 전체 검사로 통과를 확인하고(Step 4), 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/2`처럼 차례가 붙고 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 바뀌지 않는다. 바뀌는 원본은 주석 한 줄(`src/version.ts`)뿐이고 묶을 때 주석이 빠진다.
- 시험은 저장소의 파일과 임시 폴더만 본다. 두 도구가 산출물을 실제로 설치하고 스킬을 싣는지, 설치된 자리에서 실행 파일이 도는지는 시험으로 보증하지 않으므로 마지막 과제에서 설치해 본다.

---

### Task 1: Codex 플러그인 정보와 마켓 목록

**Files:**
- Create: `.agents/plugins/marketplace.json`
- Create: `.codex-plugin/plugin.json`
- Modify: `test/plugin/manifest.test.ts`
- Modify: `test/scripts/plugin-files.test.ts`
- Modify: `test/scripts/version-scan.test.ts`
- Modify: `scripts/plugin-files.mjs`
- Modify: `scripts/version-scan.d.mts`
- Modify: `scripts/version-scan.mjs`
- Modify: `src/version.ts`

**Interfaces:**
- Consumes: 4단계의 Claude Code 플러그인 정보(`.claude-plugin/plugin.json`)의 이름·버전·설명·찾기 낱말, 버전 검사(`readVersions`, `versionProblems`, `VERSION_FILES`, `scripts/version-scan.mjs`와 그 타입 선언 `scripts/version-scan.d.mts`), 산출물 목록(`PLUGIN_PATHS`, `packPlugin`, `scripts/plugin-files.mjs`).
- Produces: Codex 플러그인 정보(`.codex-plugin/plugin.json`)와 Codex 마켓 목록(`.agents/plugins/marketplace.json`), 버전을 읽는 여섯 곳(`VERSION_FILES`와 그 타입 선언), 두 파일을 담은 산출물(`PLUGIN_PATHS`, 파일 19개). 마지막 과제가 이 산출물로 두 도구의 설치를 확인한다.

설계 「5단계 5부 계획 전 결정」 2~5번이다.

- 플러그인 정보(결정 2). 열쇠는 일곱(`name`, `version`, `description`, `keywords`, `skills`, `hooks`, `interface`)이고, 이름·버전·설명·찾기 낱말은 Claude Code의 플러그인 정보와 같은 값이다. `skills`는 `./skills/`, `hooks`는 빈 묶음 `{}`다. Codex 0.166.0은 빈 묶음을 매니페스트가 정한 훅으로 읽어 기본 자리의 `hooks/hooks.json`을 읽지 않는다(7단계가 Claude Code용 훅을 더할 때 Codex에서 돌지 않게 하는 자리다). `interface`에는 화면 이름, 짧은 설명, 만든 이, 집 주소를 둔다. `author`, `repository`, `license`는 Codex 매니페스트의 칸이 아니어서 넣지 않는다.
- 마켓 목록(결정 3). 이름(`chunsik-garage`), 화면 이름, 플러그인 하나(`name`, `source`, `version`, `description`)다. `source`의 `"./"`는 Codex가 마켓의 뿌리, 곧 저장소 뿌리(사용자에게는 산출물의 뿌리)로 푼다. 설치 이름은 `chunsik-garage@chunsik-garage`다.
- 버전 검사(결정 4). 두 파일을 버전을 읽는 곳에 더해 여섯 곳이 모두 같아야 한다. 두 도구의 마켓 목록은 같은 함수로 이름이 `chunsik-garage`인 플러그인 항목 하나의 `version`을 읽는다.
- 산출물(결정 5). 두 파일을 산출물 목록에서 Claude Code 매니페스트 둘 뒤에 더한다. 산출물은 17개에서 19개가 된다.
- `src/version.ts`는 주석의 "Codex 매니페스트는 5단계에서 더한다"를 지운다. 묶을 때 주석이 빠져 묶은 실행 파일은 그대로다(확인 명령의 묶음 검사가 본다).
- 두 JSON 파일은 주석을 둘 수 없는 설정 파일이라 첫 줄의 역할 주석을 두지 않는다(사용자 전역 지침의 설정 파일 예외).
- 코드 과제가 이것 하나라서 확인 명령은 전체 검사(`npm run check`)다. 마지막 단계의 버전 검사가 저장소의 여섯 곳을 실제로 견준다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/plugin/manifest.test.ts`(찾을 곳 1/2):

```ts
// Claude Code 플러그인 정보와 마켓 목록이 설계의 약속대로인지 본다(설계 5, 7.1, 23, 「4단계 계획에서 보완」). 그림 이용 조건은 test/report/assets.test.ts가 본다
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SELF_PLUGIN_NAMES } from "../../src/commands/self.ts";

```

`test/plugin/manifest.test.ts`(바꾼 뒤 1/2):

```ts
// 두 도구의 플러그인 정보와 마켓 목록이 설계의 약속대로인지 본다(설계 5, 7.1, 23, 「4단계 계획에서 보완」, 「5단계 5부 계획 전 결정」). 그림 이용 조건은 test/report/assets.test.ts가 본다
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SELF_PLUGIN_NAMES } from "../../src/commands/self.ts";

```

`test/plugin/manifest.test.ts`(찾을 곳 2/2):

```ts
    expect(market.plugins).toEqual([{ name: plugin.name, source: "./", description: plugin.description, version: plugin.version }]);
  });
});

```

`test/plugin/manifest.test.ts`(바꾼 뒤 2/2):

```ts
    expect(market.plugins).toEqual([{ name: plugin.name, source: "./", description: plugin.description, version: plugin.version }]);
  });
});

/** Codex 플러그인 정보에 쓰는 열쇠. Codex 매니페스트의 칸만 쓰고 저작자·저장소·라이선스는 넣지 않는다(「5단계 5부 계획 전 결정」 2번) */
const CODEX_PLUGIN_KEYS = ["description", "hooks", "interface", "keywords", "name", "skills", "version"];

describe("Codex 플러그인 정보(설계 7.1, 「5단계 5부 계획 전 결정」 2번)", () => {
  it("이름·버전·설명·찾기 낱말은 Claude Code 플러그인 정보와 같고, 스킬 자리는 ./skills/, 훅은 빈 묶음이다", () => {
    const claude = json(".claude-plugin/plugin.json");
    const codex = json(".codex-plugin/plugin.json");
    expect(Object.keys(codex).sort()).toEqual(CODEX_PLUGIN_KEYS);
    expect([codex.name, codex.version, codex.description, codex.keywords]).toEqual([claude.name, claude.version, claude.description, claude.keywords]);
    expect(codex.skills).toBe("./skills/");
    expect(codex.hooks).toEqual({});
  });

  it("화면에 보일 이름, 짧은 설명, 만든 이, 집 주소를 interface에 둔다", () => {
    expect(json(".codex-plugin/plugin.json").interface).toEqual({
      displayName: "Chunsik's Garage",
      shortDescription: "AQ checkup for your AI coding tools",
      developerName: "yeunlee1",
      websiteURL: "https://github.com/yeunlee1/chunsik-garage",
    });
  });
});

describe("Codex 마켓 목록(설계 7.1, 「5단계 5부 계획 전 결정」 3번)", () => {
  it("이 저장소 뿌리(./)를 플러그인 하나로 싣고, 마켓과 플러그인의 이름·설명·버전이 플러그인 정보와 같다", () => {
    const codex = json(".codex-plugin/plugin.json");
    const market = json(".agents/plugins/marketplace.json");
    expect(Object.keys(market).sort()).toEqual(["interface", "name", "plugins"]);
    expect(market.name).toBe("chunsik-garage");
    expect(market.interface).toEqual({ displayName: "Chunsik's Garage" });
    expect(market.plugins).toEqual([{ name: codex.name, source: "./", version: codex.version, description: codex.description }]);
  });
});

```

`test/scripts/plugin-files.test.ts`(찾을 곳 1/2):

```ts
const EXPECTED = [
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  "LICENSE",
```

`test/scripts/plugin-files.test.ts`(바꾼 뒤 1/2):

```ts
const EXPECTED = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "LICENSE",
```

`test/scripts/plugin-files.test.ts`(찾을 곳 2/2):

```ts
describe("플러그인 산출물", () => {
  it("담는 곳은 매니페스트 둘, 스킬 본문, 묶은 실행 파일, 그림 폴더, 라이선스다", () => {
    expect([...PLUGIN_PATHS]).toEqual([".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/aq/SKILL.md", "skills/aq/scripts/aq.mjs", "skills/aq/assets", "LICENSE"]);
  });
```

`test/scripts/plugin-files.test.ts`(바꾼 뒤 2/2):

```ts
describe("플러그인 산출물", () => {
  it("담는 곳은 두 도구의 매니페스트와 마켓 목록, 스킬 본문, 묶은 실행 파일, 그림 폴더, 라이선스다(「5단계 5부 계획 전 결정」 5번)", () => {
    expect([...PLUGIN_PATHS]).toEqual([".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json", "skills/aq/SKILL.md", "skills/aq/scripts/aq.mjs", "skills/aq/assets", "LICENSE"]);
  });
```

`test/scripts/version-scan.test.ts`(찾을 곳 1/7):

```ts
// 버전이 쓰이는 네 곳(package.json, 프로그램 안의 버전, Claude Code 플러그인 정보와 마켓 목록)을 읽어 서로 다르거나 읽지 못하면 알리는 검사를 시험한다(설계 7.1, 「4단계 계획에서 보완」)
import { spawnSync } from "node:child_process";
```

`test/scripts/version-scan.test.ts`(바꾼 뒤 1/7):

```ts
// 버전이 쓰이는 여섯 곳(package.json, 프로그램 안의 버전, 두 도구의 플러그인 정보와 마켓 목록)을 읽어 서로 다르거나 읽지 못하면 알리는 검사를 시험한다(설계 7.1, 「4단계 계획에서 보완」, 「5단계 5부 계획 전 결정」 4번)
import { spawnSync } from "node:child_process";
```

`test/scripts/version-scan.test.ts`(찾을 곳 2/7):

```ts

/** 네 곳에 버전을 쓴다. 바꿀 곳만 넘기면 나머지는 기본 꼴이다 */
async function writeAll(version: string, override: Partial<Record<(typeof VERSION_FILES)[number], string>> = {}): Promise<void> {
```

`test/scripts/version-scan.test.ts`(바꾼 뒤 2/7):

```ts

/** 여섯 곳에 버전을 쓴다. 바꿀 곳만 넘기면 나머지는 기본 꼴이다 */
async function writeAll(version: string, override: Partial<Record<(typeof VERSION_FILES)[number], string>> = {}): Promise<void> {
```

`test/scripts/version-scan.test.ts`(찾을 곳 3/7):

```ts
    ".claude-plugin/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version }] }),
    ...override,
```

`test/scripts/version-scan.test.ts`(바꾼 뒤 3/7):

```ts
    ".claude-plugin/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version }] }),
    ".codex-plugin/plugin.json": JSON.stringify({ name: "chunsik-garage", version }),
    ".agents/plugins/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version }] }),
    ...override,
```

`test/scripts/version-scan.test.ts`(찾을 곳 4/7):

```ts
describe("버전 읽기와 견주기", () => {
  it("네 곳의 버전을 정한 차례로 읽고, 모두 같으면 알릴 것이 없다", async () => {
    await writeAll("0.2.0");
```

`test/scripts/version-scan.test.ts`(바꾼 뒤 4/7):

```ts
describe("버전 읽기와 견주기", () => {
  it("여섯 곳의 버전을 정한 차례로 읽고, 모두 같으면 알릴 것이 없다", async () => {
    expect([...VERSION_FILES]).toEqual(["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json"]);
    await writeAll("0.2.0");
```

`test/scripts/version-scan.test.ts`(찾을 곳 5/7):

```ts
    expect(entries.map((entry) => entry.file)).toEqual([...VERSION_FILES]);
    expect(entries.map((entry) => entry.version)).toEqual(["0.2.0", "0.2.0", "0.2.0", "0.2.0"]);
    expect(versionProblems(entries)).toEqual([]);
```

`test/scripts/version-scan.test.ts`(바꾼 뒤 5/7):

```ts
    expect(entries.map((entry) => entry.file)).toEqual([...VERSION_FILES]);
    expect(entries.map((entry) => entry.version)).toEqual(["0.2.0", "0.2.0", "0.2.0", "0.2.0", "0.2.0", "0.2.0"]);
    expect(versionProblems(entries)).toEqual([]);
```

`test/scripts/version-scan.test.ts`(찾을 곳 6/7):

```ts
    ".claude-plugin/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.1" }] }),
  };
```

`test/scripts/version-scan.test.ts`(바꾼 뒤 6/7):

```ts
    ".claude-plugin/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.1" }] }),
    ".codex-plugin/plugin.json": JSON.stringify({ name: "chunsik-garage", version: "0.2.1" }),
    ".agents/plugins/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.1" }] }),
  };
```

`test/scripts/version-scan.test.ts`(찾을 곳 7/7):

```ts

  it("마켓 목록에 이 플러그인 항목이 둘이면 버전이 같아도 찾지 못한 것으로 본다", async () => {
```

`test/scripts/version-scan.test.ts`(바꾼 뒤 7/7):

```ts

  it("Codex 마켓 목록에도 이 플러그인 항목이 하나가 아니면 찾지 못한 것으로 본다", async () => {
    const twice = { name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.0" }, { name: "chunsik-garage", source: "./", version: "0.2.0" }] };
    await writeAll("0.2.0", { ".agents/plugins/marketplace.json": JSON.stringify(twice) });
    expect(versionProblems(readVersions(root))).toEqual([".agents/plugins/marketplace.json: 버전을 찾지 못함"]);
    await writeAll("0.2.0", { ".agents/plugins/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "other", source: "./", version: "0.2.0" }] }) });
    expect(versionProblems(readVersions(root))).toEqual([".agents/plugins/marketplace.json: 버전을 찾지 못함"]);
  });

  it("마켓 목록에 이 플러그인 항목이 둘이면 버전이 같아도 찾지 못한 것으로 본다", async () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/plugin/manifest.test.ts test/scripts/plugin-files.test.ts test/scripts/version-scan.test.ts`
Expected: FAIL. 바뀐 시험 파일 셋이 실패한다(시험 23개 가운데 8개). Codex 플러그인 정보와 마켓 목록이 없어 그 시험이 파일을 열지 못하고(셋), 버전을 읽는 곳이 넷이라 여섯 곳의 차례와 Codex 마켓 목록의 항목 검사가 맞지 않으며(둘), 산출물 목록과 담은 파일에 두 파일이 없다(셋).

- [ ] **Step 3: 구현한다**

`.agents/plugins/marketplace.json`(새 파일):

```json
{
  "name": "chunsik-garage",
  "interface": {
    "displayName": "Chunsik's Garage"
  },
  "plugins": [
    {
      "name": "chunsik-garage",
      "source": "./",
      "version": "0.1.0",
      "description": "AQ checkup for Claude Code and Codex: scores how well you set up and use your AI coding tools, computed on your own PC."
    }
  ]
}
```

`.codex-plugin/plugin.json`(새 파일):

```json
{
  "name": "chunsik-garage",
  "version": "0.1.0",
  "description": "AQ checkup for Claude Code and Codex: scores how well you set up and use your AI coding tools, computed on your own PC.",
  "keywords": [
    "aq",
    "checkup",
    "claude-code",
    "codex",
    "ai-tools"
  ],
  "skills": "./skills/",
  "hooks": {},
  "interface": {
    "displayName": "Chunsik's Garage",
    "shortDescription": "AQ checkup for your AI coding tools",
    "developerName": "yeunlee1",
    "websiteURL": "https://github.com/yeunlee1/chunsik-garage"
  }
}
```

`scripts/plugin-files.mjs`(찾을 곳):

```js
/** 산출물에 담는 것(저장소 뿌리에서의 경로). 폴더는 안의 파일을 모두 담는다. Codex 매니페스트(5단계), 세션 시작 훅(7단계), README 두 벌(8단계)은 그 단계에서 더한다 */
export const PLUGIN_PATHS = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/aq/SKILL.md", "skills/aq/scripts/aq.mjs", "skills/aq/assets", "LICENSE"];
```

`scripts/plugin-files.mjs`(바꾼 뒤):

```js
/** 산출물에 담는 것(저장소 뿌리에서의 경로). 폴더는 안의 파일을 모두 담는다. 세션 시작 훅(7단계), README 두 벌(8단계)은 그 단계에서 더한다 */
export const PLUGIN_PATHS = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json", "skills/aq/SKILL.md", "skills/aq/scripts/aq.mjs", "skills/aq/assets", "LICENSE"];
```

`scripts/version-scan.d.mts`(찾을 곳):

```ts
export declare const VERSION_FILES: readonly ["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"];
```

`scripts/version-scan.d.mts`(바꾼 뒤):

```ts
export declare const VERSION_FILES: readonly ["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json"];
```

`scripts/version-scan.mjs`(찾을 곳 1/3):

```js

/** 버전을 읽는 곳(저장소 뿌리에서의 경로)과 차례. Codex 매니페스트 둘은 5단계에서 더한다 */
export const VERSION_FILES = ["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"];

```

`scripts/version-scan.mjs`(바꾼 뒤 1/3):

```js

/** 버전을 읽는 곳(저장소 뿌리에서의 경로)과 차례 */
export const VERSION_FILES = ["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json"];

```

`scripts/version-scan.mjs`(찾을 곳 2/3):

```js

/** 파일의 글에서 버전을 뽑는다. 찾지 못하면 undefined이고, JSON이 풀리지 않으면 던진다 */
```

`scripts/version-scan.mjs`(바꾼 뒤 2/3):

```js

/** 마켓 목록에서 이름이 chunsik-garage인 플러그인 항목의 버전. 그 항목이 하나가 아니면 undefined다 */
function marketVersion(text) {
  const plugins = JSON.parse(text).plugins;
  const own = Array.isArray(plugins) ? plugins.filter((plugin) => plugin?.name === "chunsik-garage") : [];
  return own.length === 1 ? own[0].version : undefined;
}

/** 파일의 글에서 버전을 뽑는다. 찾지 못하면 undefined이고, JSON이 풀리지 않으면 던진다 */
```

`scripts/version-scan.mjs`(찾을 곳 3/3):

```js
  ".claude-plugin/plugin.json": (text) => JSON.parse(text).version,
  ".claude-plugin/marketplace.json": (text) => {
    const plugins = JSON.parse(text).plugins;
    const own = Array.isArray(plugins) ? plugins.filter((plugin) => plugin?.name === "chunsik-garage") : [];
    return own.length === 1 ? own[0].version : undefined;
  },
};
```

`scripts/version-scan.mjs`(바꾼 뒤 3/3):

```js
  ".claude-plugin/plugin.json": (text) => JSON.parse(text).version,
  ".claude-plugin/marketplace.json": marketVersion,
  ".codex-plugin/plugin.json": (text) => JSON.parse(text).version,
  ".agents/plugins/marketplace.json": marketVersion,
};
```

`src/version.ts`(찾을 곳):

```ts
// 프로그램 버전. package.json, Claude Code 플러그인 정보와 마켓 목록의 버전과 같아야 하고 npm run check의 버전 검사가 본다(설계 7.1. Codex 매니페스트는 5단계에서 더한다)
```

`src/version.ts`(바꾼 뒤):

```ts
// 프로그램 버전. package.json, 두 도구의 플러그인 정보와 마켓 목록의 버전과 같아야 하고 npm run check의 버전 검사가 본다(설계 7.1)
```

- [ ] **Step 4: 전체 검사가 통과하는지 확인한다**

Run: `npm run check`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 105개, 시험 1,793개. `묶음 검사 통과`와 `버전 검사 통과`를 낸다(파일 링크를 만들 수 없는 Windows에서는 시험 하나를 건너뛴다).

- [ ] **Step 5: 커밋한다**

```bash
git add test/plugin/manifest.test.ts test/scripts/plugin-files.test.ts test/scripts/version-scan.test.ts .agents/plugins/marketplace.json .codex-plugin/plugin.json scripts/plugin-files.mjs scripts/version-scan.d.mts scripts/version-scan.mjs src/version.ts
git commit -m "feat: Codex 플러그인 정보와 마켓 목록을 더함"
```

---

### Task 2: Node.js 22, 산출물과 두 도구의 설치 확인, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1의 결과물 전부.
- Produces: `develop`에 병합된 5단계 5부(5단계의 끝). 6단계(Codex 정비)가 기대는 것은 두 도구에 설치되는 플러그인과 두 도구를 함께 내는 결과다.

- [ ] **Step 1: 묶음을 다시 만들어도 그대로인지 확인한다**

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 2: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS(시험 파일 105개·시험 1,793개. 파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다. 받은 22가 22.15.0보다 낮으면 1부의 압축 기록 시험 묶음 둘을 건너뛴 수만큼 적다). 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 3: 산출물을 만들어 Claude Code의 공식 검증을 본다**

산출물은 저장소 밖 OS 임시 폴더의, 공백과 한글이 든 경로에 만든다(결정 7).

Run: `node scripts/pack-plugin.mjs "$TEMP/aq 5부 산출물"`
Expected: `플러그인 산출물 19개를 <그 폴더>에 담았다`를 낸다. 두 도구의 매니페스트와 마켓 목록 넷, 스킬 본문, 묶은 실행 파일, 그림 폴더의 열두 파일, 라이선스다.

Run: `claude plugin validate "$TEMP/aq 5부 산출물"`
Expected: `✔ Validation passed`로 끝나고 0으로 끝난다. 앞에 나오는 플러그인 디렉터리 점검의 README 없음(8단계가 README 두 벌을 더한다)과 아이콘 없음 경고는 결과를 바꾸지 않는다고 그 출력이 적는다. Codex의 두 파일에 대한 문제나 경고는 없다.

- [ ] **Step 4: 빈 임시 Codex 홈에 설치한다**

`CODEX_HOME`을 공백과 한글이 든 빈 임시 폴더로 주고 돌린다. 사용자의 Codex 홈은 쓰지 않는다. 이 단계와 다음 두 단계는 모델을 부르지 않고 로그인도 쓰지 않는다.

```bash
H="$TEMP/aq 5부 코덱스 홈"
mkdir -p "$H"
CODEX_HOME="$H" codex plugin marketplace add "$TEMP/aq 5부 산출물"
CODEX_HOME="$H" codex plugin add chunsik-garage@chunsik-garage --json
CODEX_HOME="$H" codex plugin list --json
diff -r "$TEMP/aq 5부 산출물" "$H/plugins/cache/chunsik-garage/chunsik-garage/0.1.0"
```

| 확인 | Expected |
|---|---|
| 마켓 추가 | ``Added marketplace `chunsik-garage` ``를 내고 0으로 끝난다 |
| 설치 | `pluginId`가 `chunsik-garage@chunsik-garage`, `version`이 `0.1.0`이고, `installedPath`가 임시 홈의 `plugins/cache/chunsik-garage/chunsik-garage/0.1.0`이다 |
| 목록 | `installed` 목록의 이 플러그인이 `installed: true`, `enabled: true`이고 `source`가 산출물 폴더를 가리킨다 |
| 설치된 사본 | `diff -r`가 아무것도 내지 않는다(설치된 사본이 산출물과 같은 바이트다) |

임시 폴더 아래의 Codex 홈이라 `PATH aliases`를 만들지 않는다는 경고가 표준 오류에 나온다. 결과를 바꾸지 않는다.

- [ ] **Step 5: 모델 앞의 스킬 목록을 본다**

`H`는 Step 4의 Codex 홈이다. 빈 작업 폴더에서 돌린다. 출력에는 사용자 전역 스킬의 이름과 경로가 함께 실리므로 저장소 밖에만 둔다.

Run: `mkdir -p "$TEMP/aq 5부 빈 작업 폴더" && cd "$TEMP/aq 5부 빈 작업 폴더" && CODEX_HOME="$H" codex debug prompt-input > "$TEMP/aq-5부-모델앞입력.json"`
Expected: 0으로 끝난다. 스킬 목록에 `chunsik-garage:aq`가 스킬 본문 머리말의 설명과 함께 있고, 그 스킬 파일이 뿌리 약칭 아래의 `chunsik-garage/0.1.0/skills/aq/SKILL.md`다. 같은 입력의 뿌리 표에서 그 약칭은 임시 홈의 `plugins/cache/chunsik-garage`다(결정 6).

- [ ] **Step 6: 설치된 자리에서 실행 파일을 돌려 본다**

스킬 본문 1절의 명령을, Codex가 스킬을 따라 돌릴 자리(설치된 사본)에서 모델 없이 돌린다. 이 PC의 기록과 셋팅은 읽기만 하고, 저장하지 않는 점검이라 결과는 OS의 임시 폴더에만 쓴다. `H`는 Step 4의 Codex 홈이고, 이 명령에는 `CODEX_HOME`을 주지 않는다(Codex 안에서 도는 실제 점검과 같게 사용자의 기록을 읽는다).

Run: `node "$H/plugins/cache/chunsik-garage/chunsik-garage/0.1.0/skills/aq/scripts/aq.mjs" checkup --lang ko --no-open --no-save`

| 확인 | Expected |
|---|---|
| 끝까지 도는지 | 0으로 끝나고 표준 오류가 비어 있으며, 요약 JSON의 실행 알림이 `not_saved` 하나다 |
| 결과 화면 | `summary.reportPath`의 파일이 있고 그림이 실려 있다(설치된 사본의 `assets`를 읽었다) |
| 쓰지 않는지 | 돌리기 앞뒤로 Codex 홈의 `config.toml`, Claude Code의 사용자 설정, 상태 폴더의 수정 시각과 지문이 그대로다 |

작성자 PC에서 계획을 쓰며 Step 3~6을 돌린 결과는 위와 같았다(이름, 경로, 값, 개수는 저장소 밖 작업 기록에 적었다).

- [ ] **Step 7: Codex로 실제로 점검해 본다(사용자 승인 뒤에만)**

모델을 부르는 확인이라 사용자 계정의 사용량을 쓰고 로그인 정보가 있어야 한다. 방법(어느 Codex 홈에 설치하는지, 로그인 정보를 어디에 두고 언제 지우는지, 몇 번 돌리는지)을 사용자에게 알리고 승인을 받은 뒤에만 한다(결정 7).

승인을 받으면 "AQ 점검해 줘"(저장하는 보통 요청)와 "저장하지 말고 AQ 점검해 줘"를 돌려 본다.

| 확인 | Expected |
|---|---|
| 스킬을 고르는지 | 모델이 `chunsik-garage:aq`를 골라 그 스킬 파일을 읽는다 |
| 실행 파일을 부르는지 | 설치된 사본의 `scripts/aq.mjs`를 큰따옴표로 감싼 절대 경로로 부르고, 저장하지 말라는 요청에서만 `--no-save`를 붙인다 |
| 전하는 말 | 스킬 본문 3절의 틀(시작 줄, 결과, 가장 잘하는 것, 먼저 고칠 것, 결과 화면 줄, 알림 줄)대로 여섯 줄 안에 쓰고 숫자를 바꾸지 않는다 |
| 저장(결정 8) | 저장하는 요청에서 상태 폴더 쓰기가 막히는지 본다. 막히면 `save_failed`의 문장을 알림 줄로 전한다. 막히는데 스킬이 먼저 알리지 않으면 결정 8대로 스킬 본문을 고치는 과제를 더한다 |

승인이 없으면 하지 않고 병합 요청의 「확인하지 못한 것」에 적는다.

- [ ] **Step 8: 원장을 고치고 커밋한다**

원장의 5단계 5부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 11에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 5부 구현 결과를 적음"
```

- [ ] **Step 9: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage5-5.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 산출물과 두 도구의 설치 확인 항목과 맞았는지, 실제 Codex 실행을 했으면 그 결과), 「확인하지 못한 것」이다. 확인하지 못한 것에는 승인받지 못했으면 실제 Codex 실행과 저장 승인(결정 8), 빈 `hooks`가 기본 훅 파일을 대신하는 것을 소스로만 본 것(7단계에서 실제로 본다), 사용자가 설치로 받는 브랜치(8단계), macOS와 Linux를 적는다.

```bash
git push -u origin 5단계-5부-Codex-플러그인
gh pr create --base develop --head 5단계-5부-Codex-플러그인 --title "feat: 5단계 5부 Codex 플러그인" --body-file "$TEMP/aq-pr-stage5-5.md"
```

- [ ] **Step 10: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex 하나를 만들어 맡긴다(필수는 제품 결함과 수용 조건 미충족뿐이다). 짝은 새 복제본에서 계획의 코드 블록을 자기 도구로 뽑아 기준에 적용한 결과가 브랜치의 `src`·`test`·`scripts`·`skills`·`package.json`·`package-lock.json`과 두 매니페스트와 같은지, `npm ci` 뒤 `npm run check`와 Node.js 22의 전체 시험, Step 3~6의 확인 항목을 자기 임시 폴더와 자기 빈 Codex 홈으로 재현하는지, 매니페스트와 버전 검사와 산출물이 설계(「5단계 5부 계획 전 결정」)와 다르거나 실제 홈에 쓰는 곳이 있는지를 본다. 결함이라고 적으려면 실제로 재현한다. 변이로 틀린 구현을 지어 보는 일은 하지 않는다. 필수 지적은 고치고 지적한 짝이 다시 본다. 오래 끌면 주 세션이 제품 결함만 한 번 찾고, 없으면 넘어간다(메모리 `review-until-no-major-issues`). Fable은 쓰지 않는다(사용자 지시 2026-11-16).

- [ ] **Step 11: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 5단계-5부-Codex-플러그인 --merge --subject "feat: 5단계 5부 Codex 플러그인을 개발 브랜치에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 5부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 6단계와 그 뒤에 넘기는 것

5단계 5부가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 단계 | 5부가 남긴 재료 |
|---|---|---|
| Codex 정비(서버 끄기 A4의 후보 조건 등) | 6단계 | 두 도구에 설치되는 플러그인, 「5단계 2부 계획 전 결정」 7번 |
| Claude Code의 세션 시작 훅과, 그것이 Codex에서 돌지 않는 것을 실제로 보기 | 7단계 | Codex 플러그인 정보의 빈 `hooks`(결정 2) |
| 사용자가 설치로 받는 브랜치(`main`)를 가리키는 법, README 두 벌(Codex 샌드박스에서 쓰는 법과 `writable_roots` 안내 포함) | 8단계 | 두 도구의 마켓 목록, 산출물 19개, 결정 8 |
| 저장 승인을 먼저 묻는 안내(Step 7의 실제 실행을 승인받지 못했을 때) | 실제 실행을 승인받은 때 | 결정 8 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 「5단계 5부 계획 전 결정」 1번 | 한 계획, 코드 과제 하나 | 이 문서 |
| 2번, 7.1, 18.3 | Codex 플러그인 정보의 일곱 열쇠와 값, 빈 `hooks` | 1 |
| 3번, 5, 7.1 | Codex 마켓 목록, `source: "./"`, 설치 이름 | 1, Task 2 Step 4 |
| 4번, 7.1, 「4단계 계획에서 보완」 5번 | 버전을 읽는 여섯 곳 | 1 |
| 5번, 「4단계 계획에서 보완」 4번 | 산출물 19개, Claude Code의 공식 검증 | 1, Task 2 Step 3 |
| 6번, 15 | 스킬 본문은 바꾸지 않음, 모델 앞 스킬 목록과 스킬 파일의 경로 | 바꾸는 코드 없음, Task 2 Step 5 |
| 7번, 21.1, 21.2 | 모델을 부르지 않는 설치 확인과 설치된 자리의 실행, 실제 실행은 승인 뒤 | Task 2 Step 3~7 |
| 8번, 20.2 | 저장 승인과 저장 없는 실행 | 바꾸는 코드 없음, Task 2 Step 7 |
| 9번, 23, 27 | 남는 것 | 「6단계와 그 뒤에 넘기는 것」 |

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 커밋·병합 요청·병합 제목을 전역 규칙(타입 12개, 타입을 뺀 설명 50자 이내, 한글 4자 이상, 영문자가 한글보다 많지 않음)으로 기계로 셌다.
- 과제 1의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드가 없다.
- 과제 1의 「Produces」에 적은 이름과 모양은 마지막 과제가 쓰는 것(산출물의 파일 수, 설치 이름, 설치된 사본의 자리)과 같다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`288f228`)에서 과제 1을 만들었다(Windows 11, Node.js 24.18). 의존성은 복제본에 `npm ci`로 깔았다. 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 시험만 놓고 돌리면 바뀐 시험 파일 셋이 실패하고, 구현을 놓으면 `npm run check`가 시험 파일 105개·시험 1,793개(Windows에서 파일 링크 시험 하나를 건너뛰어 1,792개 통과)와 묶음 검사, 버전 검사를 통과했다. 묶음을 다시 만들어도 작업 트리가 그대로였고, 만든 복제본의 파일 264개(문서와 원장 빼고)가 연습 작업 폴더와 바이트까지 같았다.

연습 작업 폴더에서 따로 확인한 것은 이렇다. 시험 커밋을 꺼내 그 커밋이 고친 시험 파일만 돌리면 23개 가운데 8개가 실패했고, 구현 커밋을 꺼내 타입 검사와 전체 시험을 돌리면 타입 오류 없이 통과했다. 계획을 쓰는 동안 둘을 정했다. 두 도구의 마켓 목록은 같은 함수로 버전을 읽는다. 4부가 5부에 넘긴 저장 승인과 저장 없는 실행은, 프로그램이 캐시·결과·상태 쓰기가 막혀도 점검을 멈추지 않는 것을 코드로 확인했고, 승인을 먼저 묻는 흐름은 실제 Codex 실행에서 보기로 해 설계 결정 8번에 더했다.

이 PC로 Task 2 Step 3~6을 미리 돌렸다. 산출물(19개)을 공백과 한글이 든 경로에 만들어 Claude Code의 공식 검증이 통과했다(README 없음과 아이콘 없음은 결과를 바꾸지 않는 디렉터리 점검이다). 공백과 한글이 든 빈 임시 Codex 홈에 마켓을 더하고 설치하니 설치와 켜짐이 보였고, 설치된 사본이 산출물과 바이트까지 같았다. 모델 앞 입력의 스킬 목록에 `chunsik-garage:aq`가 실렸고 그 스킬 파일의 뿌리는 임시 홈의 플러그인 캐시였다. 설치된 사본의 실행 파일로 저장하지 않는 점검을 돌리니 약 1분 만에 오류 없이 끝났고, 결과 화면에 그림이 실렸으며, 돌리기 앞뒤로 두 도구의 설정과 상태 폴더의 수정 시각과 지문이 그대로였다. 값과 개수, 모델 앞 입력은 저장소 밖 작업 기록에 두었다.

확인하지 못한 것은 이렇다. Node.js 22에서 돌리는 것은 Task 2 Step 2에서 한다. Codex로 모델을 불러 점검을 돌려 본 것은 없다(Step 7, 사용자 승인 뒤). 그래서 모델이 스킬을 고르고 설치된 실행 파일을 부르는지, Codex의 샌드박스가 저장을 막는지는 보지 않았다. 빈 `hooks`가 기본 훅 파일을 대신하는 것은 소스로만 봤다. macOS와 Linux는 보지 않았다. Windows의 파일 링크 시험은 이 PC에서 건너뛰었다.
