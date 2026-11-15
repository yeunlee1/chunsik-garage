# AQ 점검 5단계 2부 — Codex 셋팅 읽기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 이 PC의 셋팅으로 돌려 보기로 검증한다.

**Goal:** Codex의 지금 셋팅을 읽어 셋팅 사실(`CodexSetupFacts`)로 낸다. 사용자 `config.toml`과 신뢰한 프로젝트의 `.codex/config.toml`을 TOML 1.1로 읽어 Codex와 같은 규칙으로 합치고, 맥락마다의 승인과 샌드박스, Codex가 싣는 지침 파일, 스킬을 찾는 곳과 켜짐, 플러그인과 그 스킬과 MCP 서버, 설정의 MCP 서버, S3의 문제와 그 위치, 설치의 정체 열쇠와 읽지 못한 곳을 낸다. 설정의 값과 지침·스킬의 글은 결과에 싣지 않는다. 평가와 결과 화면에 잇는 것은 3부다.

**Architecture:** `src/scan/`에 Codex 몫을 더한다. 설정 파일 읽기와 층 합치기(`codex-config.ts`. smol-toml), 설정 값 꺼내기(`codex-settings.ts`. 신뢰, 승인과 샌드박스, 플러그인 기능, 지침 설정), 지침 고르기(`codex-instructions.ts`), 스킬을 찾는 곳 훑기(`codex-skills.ts`. 여섯 단, 숨김 폴더, 링크, 상한, 이름 접두, Codex의 머리말), 플러그인 읽기(`codex-plugins.ts`), MCP 서버를 맥락마다 합치기(`codex-mcp.ts`), 묶기(`codex.ts`의 `scanCodexSetup`)다. 사실의 꼴은 `types.ts`에 더하고, 스킬·서버·문제·지침은 Claude Code의 것과 같은 꼴을 쓴다. 정체 열쇠와 읽지 못한 곳의 판정은 `identity.ts`에 더한다. 판정의 근거는 모두 Codex 0.166.0의 공개 소스다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 새 의존성은 `smol-toml` 1.9.1 하나다(TOML 1.1, 의존성 없음, BSD-3-Clause. `devDependencies`에 정확한 버전으로 넣고 묶은 실행 파일에 든다).

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 10절(셋팅 읽기의 Codex 칸과 TOML 문단), 11.3의 해당 줄(S3의 Codex 칸, E6의 「Codex도 같은 원칙이다」), 18.1(읽지 못한 곳), 19.1, 21.1, 27절과 끝의 「5단계 2부 계획 전 결정」(1~10번)을 구현한다.

## 5단계 2부의 범위

| 넣는 것 | 넣지 않는 것(그 부) |
|---|---|
| Codex 설정 파일 읽기와 층 합치기, 신뢰, 맥락마다의 승인과 샌드박스, 지침 고르기, 스킬을 찾는 곳 훑기와 켜짐, 플러그인 읽기, MCP 서버 합치기와 정의의 지문, 문제와 그 위치, 정체 열쇠와 읽지 못한 곳의 판정, 이 PC의 셋팅으로 돌려 보는 개발용 스크립트 | 평가 입력·규칙(S1, S2, S3, S5, E6, F3, F4, F5)·점수·결과 화면·상태 파일에 Codex 셋팅을 잇는 것(3부. 점검의 입력 묶음이 `scanCodexSetup`을 부르는 것, 두 도구의 프로젝트 목록 합치기, 관측 기록에 Codex 설치 잇기, S2의 판정, Codex의 F4가 같은 파일도 견주는 것). Codex 매니페스트와 Codex에서 스킬이 도는지(4부). Codex 서버 끄기(6단계) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- Codex 홈, 홈의 `.agents`, 프로젝트 폴더는 읽기만 한다. 스캐너는 아무것도 쓰지 않는다(설계 10, 19.2).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더와 Codex 셋팅을 읽지 않고 임시 폴더에 만든 홈과 프로젝트만 쓴다(설계 21.1). 파일 링크를 만들 수 없는 Windows에서는 그 시험을 건너뛴다.
- 설정의 값(환경 변수, 머리말, 주소의 질의, 토큰)과 지침·스킬의 글은 결과에 싣지 않는다. MCP 서버의 정의는 지문을 만들 때만 메모리에서 읽고 버린다(설계 10, 19.1).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `5단계-2부-Codex-셋팅-읽기` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증의 필수는 제품 결함과 수용 조건 미충족뿐이다(사용자 지시 2026-11-16).
- 이 PC의 Codex 셋팅에서 본 이름, 경로, 값, 개수는 저장소와 병합 요청에 넣지 않는다(설계 머리말). 실제 셋팅으로 돌린 도구와 결과는 저장소 밖에 둔다.

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `A6F1C859E8E698C0284523C9DA02DF9FA6808C47269B4CA5DCD729929D8624E2`, 4,287줄)이다. 설계 끝에 「5단계 2부 계획 전 결정」(열 가지)을 더하고, 9.6과 9.7의 Codex 스킬 관측 문장(0.166.0은 실린 목록과 명시적으로 부른 스킬을 남기지만 빠짐없이 보지 못한다), 10절 표의 Codex 칸(`AGENTS.override.md`, 신뢰, `.codex/skills`, 사용자 층만 듣는 `[[skills.config]]`, 플러그인의 놓인 곳)과 TOML 문단, 11.3·16.2·18.1의 "Codex의 스캐너를 만들 때 정한다"는 문장(16.2의 "이름으로 다른 곳의 서버를 막지 않는다"는 틀려 고쳤다), 「5단계 계획 전 결정」 6번(`.codex/skills`), 25절과 27절(「Codex 셋팅 읽기의 한계」)을 고쳤다. 근거는 Codex 0.166.0의 공개 소스(`openai/codex`의 태그 `rust-v0.166.0`, 커밋 `6ff1e1c`)이고, 결정마다 소스의 파일을 적었다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/scan/codex-config.ts`(새), `package.json`, `package-lock.json`(고침) | 1 | TOML 1.1로 풀기(큰 정수), 스캐너가 읽는 자리의 값의 종류와 MCP 전송 검사, 층 합치기, 지문용 TOML 값 바꾸기. smol-toml을 더한다 |
| `src/scan/codex-settings.ts`(새) | 2 | 신뢰, 승인과 샌드박스의 값, 플러그인 기능, 지침의 fallback 이름과 한도 |
| `src/scan/codex-instructions.ts`(새) | 3 | 전역 지침 하나와 프로젝트 지침 하나 고르기 |
| `src/scan/codex-skills.ts`(새) | 4 | 스킬을 찾는 곳을 Codex와 같은 꼴로 훑기, 이름과 접두, Codex의 머리말 |
| `src/scan/codex-plugins.ts`(새) | 5 | 설치 ID, 놓인 곳(버전 폴더), 매니페스트, 스킬을 찾는 폴더, MCP 정의 |
| `src/scan/codex-mcp.ts`(새) | 6 | MCP 서버를 맥락마다 합치기(범위, 우선순위, 켜짐, 지문) |
| `src/scan/codex.ts`(새), `src/scan/types.ts`, `src/scan/identity.ts`, `src/scan/codex-skills.ts`, `src/scan/claude.ts`(고침) | 7 | `scanCodexSetup`. Codex 사실의 꼴, Codex용 정체 열쇠, 플러그인 스킬의 이름, 프로젝트 이름 함수 내보내기 |
| `src/scan/identity.ts`, `src/scan/types.ts`, `src/scan/codex.ts`(고침) | 8 | Codex 설치 열쇠 모으기와 읽지 못한 곳의 판정, 읽은 프로젝트인지 |
| `scripts/dev-codex-setup.ts`(새), `skills/aq/scripts/aq.mjs`(다시 만듦) | 9 | 이 PC의 Codex 셋팅을 돌려 보는 개발용 스크립트, 묶은 실행 파일 다시 만들기 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다. 과제 9는 시험이 없어 구현하고 전체 검사를 돌린 뒤 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/2`처럼 차례가 붙고 차례대로 바꾼다.
- `package-lock.json`의 바뀐 곳도 같은 꼴로 실었다(`npm install --save-dev --save-exact smol-toml@1.9.1`과 같은 결과다). 과제 1의 확인 명령이 `npm ci`로 설치한다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 7부터 원본이 바뀌어 묶음 검사가 어긋나므로, 과제 9의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 묶은 실행 파일을 다시 만든 뒤 과제 9에서 돌린다.
- 시험은 임시 폴더에 만든 홈과 프로젝트로 본다. 이 PC의 실제 셋팅에서 맞는지는 시험으로 보증하지 않으므로 마지막 과제에서 돌리고 따로 센 수와 견준다.

---

### Task 1: Codex 설정 파일 읽기

**Files:**
- Create: `src/scan/codex-config.ts`
- Modify: `package-lock.json`
- Modify: `package.json`
- Test: `test/scan/codex-config.test.ts`

**Interfaces:**
- Consumes: 없다. 5단계 2부의 첫 과제다. 2단계의 `readText`(`src/scan/fs.ts`), `isObject`, `canonicalJson`(`src/scan/json.ts`)을 쓴다.
- Produces: `TomlTable`, `CodexConfigRead`, `isTable(value)`, `parseCodexConfig(text)`, `codexConfigShapeOk(doc)`, `readCodexConfig(path)`, `mergeCodexLayers(layers)`, `tomlToJson(value)`(`src/scan/codex-config.ts`). 과제 2·6·7이 쓴다.

설계 10절의 TOML 문단, 「5단계 2부 계획 전 결정」 1·3·7번이다.

- 해석기는 `smol-toml` 1.9.1이다. TOML 1.1을 받고(Codex 0.166.0의 `toml` 0.9.11+spec-1.1.0과 같다) 의존성이 없다. 정확한 버전으로 `devDependencies`에 넣는다(`npm install --save-dev --save-exact smol-toml@1.9.1`과 같은 결과다). 묶은 실행 파일에는 3부에서 스캐너를 점검에 이을 때 들어가고, 그 파일들의 `/*!` 라이선스 주석이 함께 든다(묶기 설정이 `legalComments: "inline"`이다).
- 2^53을 넘는 정수가 있으면 smol-toml은 기본으로 문서 전체를 거부한다. Codex는 i64까지 받으므로 `integersAsBigInt: "asNeeded"`로 그런 정수만 큰 정수로 받는다.
- S3의 "풀리지 않는" 설정 파일은 셋이다(결정 3). TOML로 풀리지 않는 것, 스캐너가 읽는 자리(결정 3의 표)의 값의 종류가 틀린 것, `[mcp_servers.<이름>]`의 전송을 정할 수 없거나 전송과 맞지 않는 열쇠가 함께 있는 것이다(공개 소스 `config/src/mcp_types.rs`의 전송 검사). 모르는 열쇠와 모르는 글자 값은 풀리지 않는 것이 아니다. `readCodexConfig`는 사용자 층처럼 한 파일이 곧 맥락인 것에 쓰고, 프로젝트 층은 사용자 층과 합친 것을 `codexConfigShapeOk`로 본다(과제 7).
- 층 합치기는 Codex와 같다. 묶음은 열쇠마다 깊이 합치고, 목록과 종류가 다른 값은 위 층이 통째로 대신한다(공개 소스 `merge_toml_values`). 결과는 프로토타입 없는 묶음이고 아래 층은 바꾸지 않는다.
- `tomlToJson`은 정의의 지문(결정 7)을 만들 때만 쓴다. 기존 `canonicalJson`은 큰 정수에서 멈추고(JSON으로 적을 수 없다) 날짜를 빈 묶음으로 만들어, 큰 정수는 `{ "$bigint": "<숫자>" }`, 날짜와 시각은 `{ "$datetime": "<그 꼴을 지킨 글>" }`, 무한대와 숫자 아님은 `{ "$float": "inf" | "-inf" | "nan" }`으로 바꾼다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/codex-config.test.ts`(새 파일):

```ts
// Codex 설정 파일(TOML) 읽기를 시험한다. TOML 1.1과 큰 정수를 풀고, 스캐너가 읽는 자리의 값의 종류와 MCP 서버의 전송 꼴이 Codex가 시작하지 못하는 꼴이면 풀리지 않는 것으로 보며, 층을 Codex와 같이 합치고, 지문용으로 TOML 값을 JSON 꼴로 바꾸는지(설계 「5단계 2부 계획 전 결정」 1·3·7번)
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexConfigShapeOk, mergeCodexLayers, parseCodexConfig, readCodexConfig, tomlToJson, type TomlTable } from "../../src/scan/codex-config.ts";
import { canonicalJson } from "../../src/scan/json.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => {
  await removeTemp(root);
});

const parsed = (text: string): TomlTable => {
  const doc = parseCodexConfig(text);
  if (doc === null) throw new Error("풀리지 않았다");
  return doc;
};

describe("parseCodexConfig", () => {
  it("따옴표가 든 표 이름, 표의 배열, 여러 줄 문자열을 푼다", () => {
    const doc = parsed(
      [
        'developer_instructions = """',
        "첫 줄",
        '둘째 줄"""',
        '[plugins."gmail@openai-curated"]',
        "enabled = false",
        "[[skills.config]]",
        "path = 'C:\\Users\\me\\.agents\\skills\\a\\SKILL.md'",
        "enabled = false",
        "[[skills.config]]",
        'name = "b"',
        "enabled = true",
      ].join("\n"),
    );
    expect(doc.plugins).toEqual({ "gmail@openai-curated": { enabled: false } });
    expect(doc.skills).toEqual({ config: [{ path: "C:\\Users\\me\\.agents\\skills\\a\\SKILL.md", enabled: false }, { name: "b", enabled: true }] });
    expect(doc.developer_instructions).toBe("첫 줄\n둘째 줄");
  });

  it("TOML 1.1의 꼴(여러 줄 인라인 표와 끝 쉼표, \\e 탈출)도 푼다. Codex 0.166.0의 해석기가 TOML 1.1이다", () => {
    const doc = parsed('[mcp_servers.a]\ncommand = "x"\nenv = {\n  K = "v",\n}\nnote = "\\e[0m"\n');
    expect(doc.mcp_servers).toEqual({ a: { command: "x", env: { K: "v" }, note: "\u001b[0m" } });
  });

  it("2^53을 넘는 정수가 있어도 문서 전체를 거부하지 않고 큰 정수로 받는다", () => {
    const doc = parsed("project_doc_max_bytes = 9223372036854775807\nsmall = 5\n");
    expect(doc.project_doc_max_bytes).toBe(9223372036854775807n);
    expect(doc.small).toBe(5);
  });

  it("문법이 틀리거나 같은 열쇠를 두 번 적었으면 풀리지 않는다", () => {
    expect(parseCodexConfig("a = \n")).toBeNull();
    expect(parseCodexConfig('approval_policy = "never"\napproval_policy = "on-request"\n')).toBeNull();
    expect(parseCodexConfig("[t]\na = 1\n[t]\nb = 2\n")).toBeNull();
  });

  it("빈 파일은 빈 묶음이다", () => {
    expect(parsed("")).toEqual({});
  });
});

describe("codexConfigShapeOk", () => {
  const ok = (text: string): boolean => codexConfigShapeOk(parsed(text));

  it("읽는 자리가 모두 맞는 종류이면 맞다. 모르는 열쇠와 모르는 글자 값은 틀린 것이 아니다", () => {
    expect(
      ok(
        [
          'approval_policy = "someday-new"',
          'sandbox_mode = "future-mode"',
          'default_permissions = ":workspace"',
          "project_doc_max_bytes = 0",
          'project_doc_fallback_filenames = ["CLAUDE.md"]',
          "unknown_top = { a = 1 }",
          "[features]",
          "plugins = true",
          "other = 3",
          '[projects."C:\\\\dev\\\\x"]',
          'trust_level = "sometimes"',
          "[mcp_servers.s]",
          'command = "npx"',
          'args = ["-y", "x"]',
          "enabled = false",
          "[mcp_servers.h]",
          'url = "https://example.test/mcp"',
          'bearer_token_env_var = "TOKEN"',
          '[plugins."p@m"]',
          "enabled = true",
          '[plugins."p@m".mcp_servers.inner]',
          "enabled = false",
          "[plugins._default]",
          "enabled = false",
          "[[skills.config]]",
          'name = "x"',
          "enabled = false",
        ].join("\n"),
      ),
    ).toBe(true);
  });

  it("approval_policy는 글자이거나 granular 하나를 담은 묶음이어야 한다", () => {
    expect(ok("approval_policy = { granular = { sandbox_approval = true, rules = false, mcp_elicitations = false } }\n")).toBe(true);
    expect(ok("approval_policy = 3\n")).toBe(false);
    expect(ok("approval_policy = { other = {} }\n")).toBe(false);
    expect(ok("approval_policy = { granular = 1 }\n")).toBe(false);
    expect(ok("approval_policy = { granular = {}, extra = {} }\n")).toBe(false);
  });

  it.each([
    ["sandbox_mode = true", "sandbox_mode"],
    ["default_permissions = 1", "default_permissions"],
    ["mcp_servers = 1", "mcp_servers"],
    ["mcp_servers = { a = 1 }", "서버"],
    ['[mcp_servers.a]\ncommand = "x"\nenabled = "yes"', "서버의 enabled"],
    ["plugins = []", "plugins"],
    ['[plugins]\n"p@m" = 1', "플러그인"],
    ['[plugins."p@m"]\nenabled = 1', "플러그인의 enabled"],
    ['[plugins."p@m"]\nmcp_servers = 1', "플러그인의 mcp_servers"],
    ['[plugins."p@m".mcp_servers]\ns = 1', "플러그인 서버"],
    ['[plugins."p@m".mcp_servers.s]\nenabled = "no"', "플러그인 서버의 enabled"],
    ["[plugins._default]\nenabled = 0", "_default의 enabled"],
    ["skills = 1", "skills"],
    ["[skills]\nconfig = {}", "skills.config"],
    ["[skills]\nconfig = [1]", "skills.config의 항목"],
    ['[[skills.config]]\nname = "x"', "enabled가 없는 항목"],
    ['[[skills.config]]\nname = 1\nenabled = true', "name의 종류"],
    ['[[skills.config]]\npath = false\nenabled = true', "path의 종류"],
    ["features = 1", "features"],
    ['[features]\nplugins = "yes"', "features.plugins"],
    ["projects = 1", "projects"],
    ['[projects]\n"C:/x" = 1', "프로젝트"],
    ['[projects."C:/x"]\ntrust_level = true', "trust_level"],
    ['project_doc_fallback_filenames = "CLAUDE.md"', "fallback 목록"],
    ["project_doc_fallback_filenames = [1]", "fallback 항목"],
    ["project_doc_max_bytes = -1", "음수 한도"],
    ["project_doc_max_bytes = 1.5", "정수 아닌 한도"],
    ['project_doc_max_bytes = "1"', "글자 한도"],
  ])("자리의 종류가 틀리면 풀리지 않는다: %s (%s)", (text) => {
    expect(ok(`${text}\n`)).toBe(false);
  });

  it("MCP 서버의 전송을 정할 수 없거나 전송과 맞지 않는 열쇠가 함께 있으면 풀리지 않는다(공개 소스의 전송 검사)", () => {
    expect(ok("[mcp_servers.a]\nenabled = true\n")).toBe(false);
    expect(ok('[mcp_servers.a]\ncommand = "x"\nurl = "https://e.test"\n')).toBe(false);
    for (const key of ["bearer_token_env_var", "bearer_token", "http_headers_helper", "oauth_resource", "auth"]) expect(ok(`[mcp_servers.a]\ncommand = "x"\n${key} = "v"\n`)).toBe(false);
    for (const key of ["http_headers", "env_http_headers", "oauth"]) expect(ok(`[mcp_servers.a]\ncommand = "x"\n${key} = {}\n`)).toBe(false);
    for (const key of ["args", "env_vars"]) expect(ok(`[mcp_servers.a]\nurl = "https://e.test"\n${key} = []\n`)).toBe(false);
    expect(ok('[mcp_servers.a]\nurl = "https://e.test"\nenv = {}\n')).toBe(false);
    expect(ok('[mcp_servers.a]\nurl = "https://e.test"\ncwd = "C:/x"\n')).toBe(false);
    expect(ok('[mcp_servers.a]\nurl = "https://e.test"\nbearer_token = "t"\n')).toBe(false);
    expect(ok("[mcp_servers.a]\ncommand = 1\n")).toBe(false);
    expect(ok("[mcp_servers.a]\nurl = 1\n")).toBe(false);
    // 맞는 꼴
    expect(ok('[mcp_servers.a]\ncommand = "x"\nargs = []\nenv = { K = "v" }\nenv_vars = ["A"]\ncwd = "C:/x"\nstartup_timeout_sec = 5\n')).toBe(true);
    expect(ok('[mcp_servers.a]\nurl = "https://e.test"\nhttp_headers = { H = "v" }\nenv_http_headers = { H = "E" }\noauth = {}\nauth = "oauth"\n')).toBe(true);
  });

  it("큰 정수의 한도는 0 이상이면 맞다", () => {
    expect(ok("project_doc_max_bytes = 9223372036854775807\n")).toBe(true);
    expect(ok("project_doc_max_bytes = -9223372036854775807\n")).toBe(false);
  });
});

describe("readCodexConfig", () => {
  it("없는 파일, 풀리지 않는 파일, 모양이 틀린 파일, 읽지 못하는 것, 맞는 파일을 가른다", async () => {
    const good = join(root, "good.toml");
    const broken = join(root, "broken.toml");
    const badShape = join(root, "shape.toml");
    const dir = join(root, "dir.toml");
    await writeFile(good, '\ufeffapproval_policy = "never"\n');
    await writeFile(broken, "approval_policy = \n");
    await writeFile(badShape, "[mcp_servers.a]\nenabled = true\n");
    await mkdir(dir);
    expect(await readCodexConfig(join(root, "none.toml"))).toEqual({ status: "missing" });
    expect(await readCodexConfig(broken)).toEqual({ status: "unparsable" });
    expect(await readCodexConfig(badShape)).toEqual({ status: "unparsable" });
    expect(await readCodexConfig(dir)).toEqual({ status: "unreadable" });
    expect(await readCodexConfig(good)).toEqual({ status: "ok", value: { approval_policy: "never" } });
  });
});

describe("mergeCodexLayers", () => {
  it("묶음은 열쇠마다 깊이 합치고, 목록과 종류가 다른 값은 위 층이 통째로 대신한다", () => {
    const user = parsed('approval_policy = "never"\nproject_doc_fallback_filenames = ["A.md", "B.md"]\n[mcp_servers.s]\ncommand = "x"\nargs = ["1", "2"]\nenv = { A = "1", B = "2" }\n[features]\nplugins = true\n');
    const project = parsed('approval_policy = { granular = { sandbox_approval = true, rules = true, mcp_elicitations = true } }\nproject_doc_fallback_filenames = ["C.md"]\n[mcp_servers.s]\nargs = ["3"]\nenv = { B = "9", C = "3" }\nenabled = false\n[features]\nother = false\n');
    const merged = mergeCodexLayers([user, project]);
    expect(merged).toEqual({
      approval_policy: { granular: { sandbox_approval: true, rules: true, mcp_elicitations: true } },
      project_doc_fallback_filenames: ["C.md"],
      mcp_servers: { s: { command: "x", args: ["3"], env: { A: "1", B: "9", C: "3" }, enabled: false } },
      features: { plugins: true, other: false },
    });
    // 아래 층의 묶음은 그대로다
    expect(user.mcp_servers).toEqual({ s: { command: "x", args: ["1", "2"], env: { A: "1", B: "2" } } });
  });

  it("층이 하나면 그 층과 같고, 없으면 빈 묶음이다", () => {
    expect(mergeCodexLayers([parsed("a = 1\n")])).toEqual({ a: 1 });
    expect(mergeCodexLayers([])).toEqual({});
  });

  it("묶음을 글자나 목록으로 덮으면 위 층의 값이다", () => {
    expect(mergeCodexLayers([parsed("[t]\na = 1\n"), parsed('t = "x"\n')])).toEqual({ t: "x" });
    expect(mergeCodexLayers([parsed('t = "x"\n'), parsed("[t]\na = 1\n")])).toEqual({ t: { a: 1 } });
  });
});

describe("tomlToJson", () => {
  it("큰 정수, 무한대와 숫자 아님, 날짜와 시각을 서로 가르는 JSON 꼴로 바꾼다", () => {
    const doc = parsed("big = 9223372036854775807\nsmall = 7\npinf = inf\nninf = -inf\nnot = nan\nwhen = 1979-05-27T07:32:00Z\nlocal = 1979-05-27T07:32:00\nday = 1979-05-27\nclock = 07:32:00\nlist = [1, 9223372036854775807]\n");
    const json = tomlToJson(doc) as Record<string, unknown>;
    expect(json.big).toEqual({ $bigint: "9223372036854775807" });
    expect(json.small).toBe(7);
    expect(json.pinf).toEqual({ $float: "inf" });
    expect(json.ninf).toEqual({ $float: "-inf" });
    expect(json.not).toEqual({ $float: "nan" });
    expect(json.when).toEqual({ $datetime: "1979-05-27T07:32:00.000Z" });
    expect(json.local).toEqual({ $datetime: "1979-05-27T07:32:00.000" });
    expect(json.day).toEqual({ $datetime: "1979-05-27" });
    expect(json.clock).toEqual({ $datetime: "07:32:00.000" });
    expect(json.list).toEqual([1, { $bigint: "9223372036854775807" }]);
    // 정규화한 글이 만들어지고, 값이 다르면 글도 다르다
    const text = canonicalJson(json);
    expect(text).not.toBeNull();
    expect(canonicalJson(tomlToJson(parsed("when = 1979-05-27T07:32:00Z\n")))).not.toBe(canonicalJson(tomlToJson(parsed("when = 1979-05-27T07:32:01Z\n"))));
    expect(canonicalJson(tomlToJson(parsed("x = inf\n")))).not.toBe(canonicalJson(tomlToJson(parsed("x = nan\n"))));
  });

  it("원래 묶음을 바꾸지 않는다", () => {
    const doc = parsed("big = 9223372036854775807\n[t]\nx = inf\n");
    tomlToJson(doc);
    expect(doc.big).toBe(9223372036854775807n);
    expect((doc.t as TomlTable).x).toBe(Infinity);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/codex-config.test.ts`
Expected: FAIL. `test/scan/codex-config.test.ts`가 `src/scan/codex-config.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`package.json`과 `package-lock.json`을 바꾼 뒤 확인 명령의 `npm ci`가 `smol-toml`을 설치한다.

`package-lock.json`(찾을 곳 1/2):

```json
        "esbuild": "^0.28.2",
        "typescript": "^7.0.2",
```

`package-lock.json`(바꾼 뒤 1/2):

```json
        "esbuild": "^0.28.2",
        "smol-toml": "1.9.1",
        "typescript": "^7.0.2",
```

`package-lock.json`(찾을 곳 2/2):

```json
    },
    "node_modules/source-map-js": {
```

`package-lock.json`(바꾼 뒤 2/2):

```json
    },
    "node_modules/smol-toml": {
      "version": "1.9.1",
      "resolved": "https://registry.npmjs.org/smol-toml/-/smol-toml-1.9.1.tgz",
      "integrity": "sha512-j7WyPdf0CJoutMzMoPLF/bVXHtKZIT9Rb4eGeEbWw8X2t5oirjPgpL+OpaENZrILYaXqYwnVH+qgUwVbl+pUJQ==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "url": "https://github.com/sponsors/cyyynthia"
      }
    },
    "node_modules/source-map-js": {
```

`package.json`(찾을 곳):

```json
    "esbuild": "^0.28.2",
    "typescript": "^7.0.2",
```

`package.json`(바꾼 뒤):

```json
    "esbuild": "^0.28.2",
    "smol-toml": "1.9.1",
    "typescript": "^7.0.2",
```

`src/scan/codex-config.ts`(새 파일):

```ts
// Codex 설정 파일(TOML)을 읽어 묶음으로 푼다. 스캐너가 읽는 자리의 값의 종류와 MCP 서버의 전송 꼴이 Codex가 시작하지 못하는 꼴이면 풀리지 않는 것으로 보고, 층을 Codex와 같이 합치며, 지문용으로 TOML 값을 JSON 꼴로 바꾼다. 값은 메모리에서만 쓴다(설계 10, 「5단계 2부 계획 전 결정」 1·3·7번)
import { parse } from "smol-toml";
import { readText } from "./fs.ts";
import { isObject } from "./json.ts";

export type TomlTable = Record<string, unknown>;
export type CodexConfigRead = { status: "ok"; value: TomlTable } | { status: "missing" } | { status: "unparsable" } | { status: "unreadable" };

/** TOML의 묶음(표)인지. 해석기는 날짜와 시각도 객체(Date)로 주므로 뺀다 */
export const isTable = (value: unknown): value is TomlTable => isObject(value) && !(value instanceof Date);
const isBool = (value: unknown): boolean => typeof value === "boolean";
const isText = (value: unknown): boolean => typeof value === "string";
const optional = (value: unknown, check: (value: unknown) => boolean): boolean => value === undefined || check(value);
const tableOf = (value: unknown, each: (value: unknown) => boolean): boolean => isTable(value) && Object.values(value).every(each);
const isNonNegativeInteger = (value: unknown): boolean => (typeof value === "number" && Number.isInteger(value) && value >= 0) || (typeof value === "bigint" && value >= 0n);

/** TOML 1.1로 푼다. 2^53을 넘는 정수는 큰 정수(bigint)로 받아 문서 전체를 거부하지 않는다. 풀리지 않으면 null이다 */
export function parseCodexConfig(text: string): TomlTable | null {
  try {
    return parse(text, { integersAsBigInt: "asNeeded" }) as TomlTable;
  } catch {
    return null;
  }
}

/** stdio 전송과 함께 둘 수 없는 열쇠와 HTTP 전송과 함께 둘 수 없는 열쇠(공개 소스 config/src/mcp_types.rs의 전송 검사) */
const HTTP_KEYS = ["url", "bearer_token_env_var", "bearer_token", "http_headers_helper", "http_headers", "env_http_headers", "oauth", "oauth_resource", "auth"];
const STDIO_KEYS = ["args", "env", "env_vars", "cwd", "bearer_token"];

/** MCP 서버 정의 하나가 Codex가 받는 꼴인지. enabled의 종류와 전송만 본다(oauth의 세부 조건은 보지 않는다) */
function serverShapeOk(server: unknown): boolean {
  if (!isTable(server) || !optional(server.enabled, isBool)) return false;
  const has = (key: string): boolean => server[key] !== undefined;
  if (has("command")) return isText(server.command) && !HTTP_KEYS.some(has);
  if (has("url")) return isText(server.url) && !STDIO_KEYS.some(has);
  return false;
}

/** 글자이거나 granular 하나를 담은 묶음이다 */
const approvalShapeOk = (value: unknown): boolean => value === undefined || isText(value) || (isTable(value) && Object.keys(value).length === 1 && isTable(value.granular));
const pluginShapeOk = (plugin: unknown): boolean =>
  isTable(plugin) && optional(plugin.enabled, isBool) && optional(plugin.mcp_servers, (servers) => tableOf(servers, (server) => isTable(server) && optional(server.enabled, isBool)));
const skillsShapeOk = (skills: unknown): boolean =>
  optional(skills, (value) => isTable(value) && optional(value.config, (list) => Array.isArray(list) && list.every((entry) => isTable(entry) && isBool(entry.enabled) && optional(entry.path, isText) && optional(entry.name, isText))));

/** 스캐너가 읽는 자리의 값의 종류가 맞는지. 모르는 열쇠와 모르는 글자 값은 틀린 것이 아니다(「5단계 2부 계획 전 결정」 3번) */
export function codexConfigShapeOk(doc: TomlTable): boolean {
  return (
    approvalShapeOk(doc.approval_policy) &&
    optional(doc.sandbox_mode, isText) &&
    optional(doc.default_permissions, isText) &&
    optional(doc.mcp_servers, (servers) => tableOf(servers, serverShapeOk)) &&
    optional(doc.plugins, (plugins) => tableOf(plugins, pluginShapeOk)) &&
    skillsShapeOk(doc.skills) &&
    optional(doc.features, (features) => isTable(features) && optional(features.plugins, isBool)) &&
    optional(doc.projects, (projects) => tableOf(projects, (project) => isTable(project) && optional(project.trust_level, isText))) &&
    optional(doc.project_doc_fallback_filenames, (names) => Array.isArray(names) && names.every(isText)) &&
    optional(doc.project_doc_max_bytes, isNonNegativeInteger)
  );
}

/** 설정 파일 하나를 읽는다. 맨 앞의 BOM은 뗀다. 풀리지 않거나 읽는 자리의 모양이 틀리면 unparsable이다 */
export async function readCodexConfig(path: string): Promise<CodexConfigRead> {
  const read = await readText(path);
  if (read.status !== "ok") return read;
  const value = parseCodexConfig(read.text);
  return value !== null && codexConfigShapeOk(value) ? { status: "ok", value } : { status: "unparsable" };
}

/** 위 층을 아래 층에 얹는다. 묶음은 열쇠마다 깊이 합치고, 목록과 종류가 다른 값은 위 층이 통째로 대신한다. 아래 층의 묶음은 바꾸지 않는다 */
function mergeInto(base: TomlTable, top: TomlTable): TomlTable {
  const out = Object.create(null) as TomlTable;
  for (const [key, value] of Object.entries(base)) out[key] = value;
  for (const [key, value] of Object.entries(top)) {
    const below = out[key];
    out[key] = isTable(below) && isTable(value) ? mergeInto(below, value) : value;
  }
  return out;
}

/** 층을 아래에서 위의 차례로 합친다(공개 소스의 merge_toml_values와 같은 규칙) */
export function mergeCodexLayers(layers: readonly TomlTable[]): TomlTable {
  return layers.reduce<TomlTable>((merged, layer) => mergeInto(merged, layer), Object.create(null) as TomlTable);
}

/** 지문용으로 TOML 값을 JSON의 꼴로 바꾼다. 큰 정수, 무한대와 숫자 아님, 날짜와 시각을 서로 가르는 묶음으로 적는다. 원래 묶음은 바꾸지 않는다 */
export function tomlToJson(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (typeof value === "number" && !Number.isFinite(value)) return { $float: Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf" };
  if (value instanceof Date) return { $datetime: value.toISOString() };
  if (Array.isArray(value)) return value.map(tomlToJson);
  if (isTable(value)) {
    const out = Object.create(null) as TomlTable;
    for (const [key, item] of Object.entries(value)) out[key] = tomlToJson(item);
    return out;
  }
  return value;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npm ci --no-audit --no-fund && npx tsc --noEmit && npx vitest run test/scan/codex-config.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 43개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/codex-config.test.ts package-lock.json package.json src/scan/codex-config.ts
git commit -m "feat: Codex 설정 파일을 TOML로 읽고 검사함"
```

---

### Task 2: Codex 설정 값 꺼내기

**Files:**
- Create: `src/scan/codex-settings.ts`
- Test: `test/scan/codex-settings.test.ts`

**Interfaces:**
- Consumes: 과제 1의 `TomlTable`, `isTable`. 1단계의 `normalizePath`(`src/adapters/claude/locate.ts`).
- Produces: `CodexTrust`, `trustOf(user, normRoot, platform)`, `ApprovalFact`, `SandboxFact`, `CodexSafetyFact`(`approval`, `sandbox`, `permissions`), `safetyOf(merged)`, `pluginsFeatureOn(merged)`, `fallbackNames(merged, platform)`, `projectDocDisabled(merged)`(`src/scan/codex-settings.ts`). 과제 7이 쓴다.

「5단계 2부 계획 전 결정」 2·4·5·8번이다.

- 신뢰는 사용자 층의 `[projects."<경로>"]` 가운데 프로젝트 뿌리(정규화한 것)와 같은 경로의 `trust_level`이다. `trusted`와 `untrusted`만 기록이고 그 밖은 기록이 없다. 맞는 열쇠가 여럿이면 원래 열쇠의 사전순으로 첫째인 것의 값이다(공개 소스 `config/src/loader/mod.rs`의 `decision_for_dir`). 하위 폴더나 위 폴더의 열쇠는 보지 않는다(결정 2, 27절).
- 승인 값은 `never`, `on-request`(옛 이름 `on-failure`도), `untrusted`, `granular`(묶음), `other`, 적히지 않음(`null`)으로 가른다. 샌드박스는 `danger-full-access`, `workspace-write`, `read-only`, `other`, `null`이고, `default_permissions`가 `":danger-full-access"`이면 전면 접근이다(공개 소스 `protocol/src/protocol.rs`의 `AskForApproval`과 `SandboxMode`). 승인 없음과 전면 해제를 함께 쓰는지의 판정은 3부의 S2가 한다(결정 4).
- `[features]`의 `plugins`는 기본이 켜짐이다(공개 소스 `features/src/lib.rs`).
- fallback 이름은 앞뒤 공백을 떼고 빈 것을 버린 뒤(공개 소스 `core/src/config/mod.rs`), 파일 이름이 아닌 것과 이미 든 이름을 뺀다(공개 소스 `core/src/agents_md.rs`의 `candidate_filenames`). Windows에서는 `\`와 `:`가 든 이름도 버린다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/codex-settings.test.ts`(새 파일):

```ts
// Codex 설정 층에서 스캐너가 쓰는 값을 꺼내는지 시험한다. 프로젝트의 신뢰, 승인과 샌드박스의 값, 플러그인 기능, 지침의 fallback 이름과 한도(설계 「5단계 2부 계획 전 결정」 2·4·5·8번)
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { parseCodexConfig, type TomlTable } from "../../src/scan/codex-config.ts";
import { fallbackNames, pluginsFeatureOn, projectDocDisabled, safetyOf, trustOf } from "../../src/scan/codex-settings.ts";

const doc = (text: string): TomlTable => {
  const value = parseCodexConfig(text);
  if (value === null) throw new Error("풀리지 않았다");
  return value;
};
/** 경로를 TOML 기본 문자열로 적는다 */
const quoted = (path: string): string => JSON.stringify(path);

describe("trustOf", () => {
  const root = join(process.cwd(), "work", "proj");
  const norm = normalizePath(root);

  it("뿌리와 같은 경로의 trust_level을 본다. trusted와 untrusted만 기록이고 그 밖은 기록이 없다", () => {
    expect(trustOf(doc(`[projects.${quoted(root)}]\ntrust_level = "trusted"\n`), norm)).toBe("trusted");
    expect(trustOf(doc(`[projects.${quoted(root)}]\ntrust_level = "untrusted"\n`), norm)).toBe("untrusted");
    expect(trustOf(doc(`[projects.${quoted(root)}]\ntrust_level = "sometimes"\n`), norm)).toBeNull();
    expect(trustOf(doc(`[projects.${quoted(root)}]\nother = 1\n`), norm)).toBeNull();
    expect(trustOf(doc(""), norm)).toBeNull();
  });

  it("구분 기호와 끝의 /. 를 맞춰 견주고, 하위 폴더나 위 폴더의 열쇠는 보지 않는다", () => {
    expect(trustOf(doc(`[projects.${quoted(`${root.replace(/\\/g, "/")}/.`)}]\ntrust_level = "trusted"\n`), norm)).toBe("trusted");
    expect(trustOf(doc(`[projects.${quoted(join(root, "sub"))}]\ntrust_level = "trusted"\n`), norm)).toBeNull();
    expect(trustOf(doc(`[projects.${quoted(join(root, ".."))}]\ntrust_level = "trusted"\n`), norm)).toBeNull();
  });

  it.runIf(process.platform === "win32")("Windows에서는 대소문자를 가리지 않는다", () => {
    expect(trustOf(doc(`[projects.${quoted(root.toUpperCase())}]\ntrust_level = "trusted"\n`), norm)).toBe("trusted");
  });

  it("맞는 열쇠가 여럿이면 원래 열쇠의 사전순으로 첫째인 것의 값이다. 기록이 아닌 값의 열쇠는 후보가 아니다", () => {
    const slashed = `${root.replace(/\\/g, "/")}/.`;
    const [first, second] = [root, slashed].sort();
    const text = `[projects.${quoted(first!)}]\ntrust_level = "untrusted"\n[projects.${quoted(second!)}]\ntrust_level = "trusted"\n`;
    expect(trustOf(doc(text), norm)).toBe("untrusted");
    // 적은 차례가 거꾸로여도 사전순으로 고른다
    const reversed = `[projects.${quoted(second!)}]\ntrust_level = "trusted"\n[projects.${quoted(first!)}]\ntrust_level = "untrusted"\n`;
    expect(trustOf(doc(reversed), norm)).toBe("untrusted");
    const skipped = `[projects.${quoted(first!)}]\ntrust_level = "maybe"\n[projects.${quoted(second!)}]\ntrust_level = "trusted"\n`;
    expect(trustOf(doc(skipped), norm)).toBe("trusted");
  });
});

describe("safetyOf", () => {
  it("승인 값을 가른다. on-failure는 on-request의 옛 이름이고, 묶음은 granular다", () => {
    expect(safetyOf(doc('approval_policy = "never"\n')).approval).toBe("never");
    expect(safetyOf(doc('approval_policy = "on-request"\n')).approval).toBe("on-request");
    expect(safetyOf(doc('approval_policy = "on-failure"\n')).approval).toBe("on-request");
    expect(safetyOf(doc('approval_policy = "untrusted"\n')).approval).toBe("untrusted");
    expect(safetyOf(doc("approval_policy = { granular = { sandbox_approval = false, rules = false, mcp_elicitations = false } }\n")).approval).toBe("granular");
    expect(safetyOf(doc('approval_policy = "someday"\n')).approval).toBe("other");
    expect(safetyOf(doc("")).approval).toBeNull();
  });

  it("샌드박스 값과 권한 프로필의 전면 접근을 가른다", () => {
    expect(safetyOf(doc('sandbox_mode = "danger-full-access"\n')).sandbox).toBe("danger-full-access");
    expect(safetyOf(doc('sandbox_mode = "workspace-write"\n')).sandbox).toBe("workspace-write");
    expect(safetyOf(doc('sandbox_mode = "read-only"\n')).sandbox).toBe("read-only");
    expect(safetyOf(doc('sandbox_mode = "elsewhere"\n')).sandbox).toBe("other");
    expect(safetyOf(doc("")).sandbox).toBeNull();
    expect(safetyOf(doc('default_permissions = ":danger-full-access"\n')).permissions).toBe("danger-full-access");
    expect(safetyOf(doc('default_permissions = ":workspace"\n')).permissions).toBe("other");
    expect(safetyOf(doc("")).permissions).toBeNull();
  });
});

describe("pluginsFeatureOn", () => {
  it("features.plugins가 거짓일 때만 꺼진다(기본은 켜짐)", () => {
    expect(pluginsFeatureOn(doc(""))).toBe(true);
    expect(pluginsFeatureOn(doc("[features]\nplugins = true\n"))).toBe(true);
    expect(pluginsFeatureOn(doc("[features]\nplugins = false\n"))).toBe(false);
    expect(pluginsFeatureOn(doc("[features]\nother = false\n"))).toBe(true);
  });
});

describe("fallbackNames", () => {
  it("앞뒤 공백을 떼고, Codex가 버리는 이름과 겹치는 이름을 뺀다", () => {
    const names = doc('project_doc_fallback_filenames = [" CLAUDE.md ", "", "   ", ".", "..", "a/b", "nul\\u0000x", "AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "GUIDE.md"]\n');
    expect(fallbackNames(names, "linux")).toEqual(["CLAUDE.md", "GUIDE.md"]);
  });

  it("Windows에서는 \\와 :가 든 이름도 버린다", () => {
    const names = doc('project_doc_fallback_filenames = ["a\\\\b.md", "c:d.md", "ok.md"]\n');
    expect(fallbackNames(names, "win32")).toEqual(["ok.md"]);
    expect(fallbackNames(names, "linux")).toEqual(["a\\b.md", "c:d.md", "ok.md"]);
  });

  it("적지 않았으면 없다", () => {
    expect(fallbackNames(doc(""), "linux")).toEqual([]);
  });
});

describe("projectDocDisabled", () => {
  it("project_doc_max_bytes가 0이면 프로젝트 지침을 끈다", () => {
    expect(projectDocDisabled(doc("project_doc_max_bytes = 0\n"))).toBe(true);
    expect(projectDocDisabled(doc("project_doc_max_bytes = 1\n"))).toBe(false);
    expect(projectDocDisabled(doc("project_doc_max_bytes = 9223372036854775807\n"))).toBe(false);
    expect(projectDocDisabled(doc(""))).toBe(false);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/codex-settings.test.ts`
Expected: FAIL. `test/scan/codex-settings.test.ts`가 `src/scan/codex-settings.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/scan/codex-settings.ts`(새 파일):

```ts
// Codex 설정 층에서 스캐너가 쓰는 값을 꺼낸다. 프로젝트의 신뢰, 승인과 샌드박스의 값, 플러그인 기능, 지침의 fallback 이름과 한도다. 값은 정해진 꼴로만 내고 원문은 내지 않는다(설계 「5단계 2부 계획 전 결정」 2·4·5·8번)
import { normalizePath } from "../adapters/claude/locate.ts";
import { isTable, type TomlTable } from "./codex-config.ts";

/** trusted는 신뢰한 프로젝트, untrusted는 신뢰하지 않는다고 적힌 프로젝트, null은 신뢰 기록이 없는 프로젝트다 */
export type CodexTrust = "trusted" | "untrusted" | null;

/**
 * 사용자 층의 projects에서 그 프로젝트의 뿌리(정규화한 것)와 같은 경로의 trust_level을 찾는다. 열쇠는 구분 기호를 맞추고 Windows에서는 대소문자를 가리지 않고 견준다.
 * trusted와 untrusted만 기록이다. 맞는 열쇠가 여럿이면 원래 열쇠의 사전순으로 첫째인 것의 값이다(공개 소스 config/src/loader/mod.rs의 decision_for_dir)
 */
export function trustOf(user: TomlTable, normRoot: string, platform: NodeJS.Platform = process.platform): CodexTrust {
  const projects = isTable(user.projects) ? user.projects : {};
  const found: { key: string; trust: "trusted" | "untrusted" }[] = [];
  for (const [key, entry] of Object.entries(projects)) {
    if (!isTable(entry) || (entry.trust_level !== "trusted" && entry.trust_level !== "untrusted")) continue;
    if (normalizePath(key, platform) === normRoot) found.push({ key, trust: entry.trust_level });
  }
  found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return found[0]?.trust ?? null;
}

export type ApprovalFact = "never" | "on-request" | "untrusted" | "granular" | "other" | null;
export type SandboxFact = "danger-full-access" | "workspace-write" | "read-only" | "other" | null;

/** 한 맥락(합친 설정)의 승인과 샌드박스. 적히지 않은 값은 null이다(Codex의 기본은 묻는 승인과 샌드박스다) */
export interface CodexSafetyFact {
  approval: ApprovalFact;
  sandbox: SandboxFact;
  /** default_permissions가 전면 접근(":danger-full-access")인지 */
  permissions: "danger-full-access" | "other" | null;
}

function approvalOf(value: unknown): ApprovalFact {
  if (value === undefined) return null;
  if (isTable(value)) return "granular";
  if (value === "never" || value === "untrusted") return value;
  // on-failure는 on-request의 옛 이름이다(공개 소스 protocol/src/protocol.rs의 AskForApproval)
  if (value === "on-request" || value === "on-failure") return "on-request";
  return "other";
}

function sandboxOf(value: unknown): SandboxFact {
  if (value === undefined) return null;
  return value === "danger-full-access" || value === "workspace-write" || value === "read-only" ? value : "other";
}

export function safetyOf(merged: TomlTable): CodexSafetyFact {
  const permissions = merged.default_permissions;
  return {
    approval: approvalOf(merged.approval_policy),
    sandbox: sandboxOf(merged.sandbox_mode),
    permissions: permissions === undefined ? null : permissions === ":danger-full-access" ? "danger-full-access" : "other",
  };
}

/** [features]의 plugins가 거짓이면 플러그인을 하나도 쓰지 않는다(기본은 켜짐) */
export const pluginsFeatureOn = (merged: TomlTable): boolean => !(isTable(merged.features) && merged.features.plugins === false);

const DEFAULT_NAMES = ["AGENTS.override.md", "AGENTS.md"];

/**
 * 프로젝트 지침으로 더 찾는 파일 이름. 앞뒤 공백을 떼고 빈 것을 버린 뒤(core/src/config/mod.rs), 파일 이름이 아닌 것(".", "..", "/"나 NUL이 든 것,
 * Windows에서 "\"나 ":"가 든 것)과 이미 든 이름을 뺀다(core/src/agents_md.rs의 candidate_filenames)
 */
export function fallbackNames(merged: TomlTable, platform: NodeJS.Platform = process.platform): string[] {
  const listed = Array.isArray(merged.project_doc_fallback_filenames) ? merged.project_doc_fallback_filenames : [];
  const names: string[] = [];
  for (const raw of listed) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\0")) continue;
    if (platform === "win32" && (name.includes("\\") || name.includes(":"))) continue;
    if (!DEFAULT_NAMES.includes(name) && !names.includes(name)) names.push(name);
  }
  return names;
}

/** project_doc_max_bytes가 0이면 Codex가 프로젝트 지침을 싣지 않는다 */
export const projectDocDisabled = (merged: TomlTable): boolean => merged.project_doc_max_bytes === 0 || merged.project_doc_max_bytes === 0n;
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/codex-settings.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 11개. Windows에서만 도는 대소문자 시험이 있어 Windows 밖에서는 하나를 건너뛴다.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/codex-settings.test.ts src/scan/codex-settings.ts
git commit -m "feat: Codex 설정에서 신뢰와 안전 설정을 꺼냄"
```

---

### Task 3: Codex 지침 파일 고르기

**Files:**
- Create: `src/scan/codex-instructions.ts`
- Test: `test/scan/codex-instructions.test.ts`

**Interfaces:**
- Consumes: 2단계의 `readInstructionSet`, `emptyInstructionSet`, `InstructionSet`, `MentionTarget`(`src/scan/instructions.ts`), `entryInfo`, `readText`(`src/scan/fs.ts`).
- Produces: `readCodexGlobalInstructions(codexHome, mentionTargets)`(`{ set, mentions }`), `readCodexProjectInstructions(root, fallback)`(`src/scan/codex-instructions.ts`). 과제 7이 쓴다.

「5단계 2부 계획 전 결정」 5번이다.

- 전역 지침은 Codex 홈의 `AGENTS.override.md`, `AGENTS.md` 차례로 일반 파일이고 앞뒤 공백을 뗀 내용이 있는 첫 파일 하나다. Codex는 둘 가운데 하나만 싣는다(공개 소스 `codex-home/src/instructions/mod.rs`). 비었거나 폴더인 것은 건너뛰고, 있는데 읽지 못한 파일은 읽지 못한 것으로 적고 다음 후보를 본다.
- 프로젝트 지침은 뿌리에서 `AGENTS.override.md`, `AGENTS.md`, fallback 이름의 차례로 일반 파일인 첫 파일 하나다. 그 파일이 비었으면 지침이 없고 같은 폴더의 다음 이름은 보지 않는다(빈 `AGENTS.override.md`가 옆의 `AGENTS.md`를 가린다. 공개 소스 `core/src/agents_md.rs`). 신뢰하지 않는다고 적힌 프로젝트와 한도가 0인 프로젝트를 빼는 것은 과제 7이 한다.
- Codex는 전역과 프로젝트가 같은 실제 파일이어도 두 번 싣는다. 그래서 프로젝트 지침에 전역과 같은 파일이라는 표시를 붙이지 않고 줄 지문을 낸다(Codex의 F4는 같은 파일도 견준다. 3부).
- 시험은 읽지 못하는 파일을 만들려고 `src/scan/fs.ts`의 `readText`를 그 경로에서만 바꿔 끼운다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/codex-instructions.test.ts`(새 파일):

```ts
// Codex의 지침 파일 고르기를 시험한다. 전역은 Codex 홈의 AGENTS.override.md와 AGENTS.md 가운데 Codex가 싣는 하나, 프로젝트는 뿌리에서 Codex가 고르는 하나이고, 같은 파일이어도 줄 지문을 낸다(설계 「5단계 2부 계획 전 결정」 5번)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fsModule from "../../src/scan/fs.ts";
import { readCodexGlobalInstructions, readCodexProjectInstructions } from "../../src/scan/codex-instructions.ts";
import { linesForOverlap } from "../../src/scan/instructions.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let home: string;
beforeEach(async () => {
  root = await makeTemp();
  home = join(root, ".codex");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

const LONG = "모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다.";

describe("readCodexGlobalInstructions", () => {
  it("AGENTS.override.md에 내용이 있으면 그것 하나만 싣는다", async () => {
    await put(join(home, "AGENTS.override.md"), `${LONG}\n`);
    await put(join(home, "AGENTS.md"), "다른 지침 파일의 글은 이번에 실리지 않는다.\n");
    const { set } = await readCodexGlobalInstructions(home, []);
    expect(set.files.map((f) => f.path)).toEqual([join(home, "AGENTS.override.md")]);
    expect(set.bytes).toBe(Buffer.byteLength(`${LONG}\n`));
    expect(set.lineHashes).toEqual(linesForOverlap(LONG));
  });

  it("비었거나 공백만 있는 override와 폴더인 override는 건너뛰고 AGENTS.md를 싣는다", async () => {
    await put(join(home, "AGENTS.override.md"), " \n\t\n");
    await put(join(home, "AGENTS.md"), `${LONG}\n`);
    expect((await readCodexGlobalInstructions(home, [])).set.files.map((f) => f.path)).toEqual([join(home, "AGENTS.md")]);
    const other = join(root, "other");
    await mkdir(join(other, "AGENTS.override.md"), { recursive: true });
    await put(join(other, "AGENTS.md"), `${LONG}\n`);
    expect((await readCodexGlobalInstructions(other, [])).set.files.map((f) => f.path)).toEqual([join(other, "AGENTS.md")]);
  });

  it("둘 다 없거나 비었으면 전역 지침이 없다", async () => {
    expect((await readCodexGlobalInstructions(home, [])).set).toEqual({ files: [], bytes: 0, chars: { ascii: 0, other: 0 }, lineHashes: [], unreadable: [], unreadableDirs: [] });
    await put(join(home, "AGENTS.md"), "\n");
    expect((await readCodexGlobalInstructions(home, [])).set.files).toEqual([]);
  });

  it("있는데 읽지 못한 파일은 읽지 못한 것으로 적고 다음 후보를 본다(Codex도 경고하고 다음으로 간다)", async () => {
    await put(join(home, "AGENTS.override.md"), `${LONG}\n`);
    await put(join(home, "AGENTS.md"), `${LONG} 둘째\n`);
    const original = fsModule.readText;
    vi.spyOn(fsModule, "readText").mockImplementation(async (path) => (path === join(home, "AGENTS.override.md") ? { status: "unreadable" } : original(path)));
    const { set } = await readCodexGlobalInstructions(home, []);
    expect(set.files.map((f) => f.path)).toEqual([join(home, "AGENTS.md")]);
    expect(set.unreadable).toEqual([join(home, "AGENTS.override.md")]);
  });

  it("전역 지침에 목록의 프로젝트가 나온 횟수를 센다", async () => {
    const project = join(root, "work", "garage-app");
    await put(join(home, "AGENTS.md"), `garage-app 에서는 따로 정한 규칙을 따른다.\n${project}\n`);
    const { mentions } = await readCodexGlobalInstructions(home, [{ root: project, normRoot: project.replace(/\\/g, "/").toLowerCase() }]);
    expect(Object.values(mentions)).toEqual([2]);
  });
});

describe("readCodexProjectInstructions", () => {
  it("뿌리에서 AGENTS.override.md, AGENTS.md, fallback 이름의 차례로 일반 파일인 첫 하나를 고른다", async () => {
    const p = join(root, "p");
    await put(join(p, "AGENTS.md"), `${LONG}\n`);
    await put(join(p, "CLAUDE.md"), "fallback은 앞의 이름이 없을 때만 본다.\n");
    expect((await readCodexProjectInstructions(p, ["CLAUDE.md"])).files.map((f) => f.path)).toEqual([join(p, "AGENTS.md")]);
    const q = join(root, "q");
    await put(join(q, "CLAUDE.md"), `${LONG}\n`);
    expect((await readCodexProjectInstructions(q, ["CLAUDE.md"])).files.map((f) => f.path)).toEqual([join(q, "CLAUDE.md")]);
    expect((await readCodexProjectInstructions(q, [])).files).toEqual([]);
  });

  it("빈 AGENTS.override.md가 옆의 AGENTS.md를 가린다. 고른 파일이 비었으면 지침이 없다(내용 없음으로 든다)", async () => {
    const p = join(root, "p");
    await put(join(p, "AGENTS.override.md"), "");
    await put(join(p, "AGENTS.md"), `${LONG}\n`);
    const set = await readCodexProjectInstructions(p, []);
    expect(set.files.map((f) => [f.path, f.hasContent])).toEqual([[join(p, "AGENTS.override.md"), false]]);
    expect(set.lineHashes).toEqual([]);
  });

  it("폴더인 이름은 건너뛴다", async () => {
    const p = join(root, "p");
    await mkdir(join(p, "AGENTS.override.md"), { recursive: true });
    await put(join(p, "AGENTS.md"), `${LONG}\n`);
    expect((await readCodexProjectInstructions(p, [])).files.map((f) => f.path)).toEqual([join(p, "AGENTS.md")]);
  });

  it("전역 지침과 같은 파일이어도 같은 파일 표시를 붙이지 않고 줄 지문을 낸다(Codex는 두 번 싣는다)", async () => {
    await put(join(home, "AGENTS.md"), `${LONG}\n`);
    const set = await readCodexProjectInstructions(home, []);
    expect(set.files.map((f) => f.sameAsGlobal)).toEqual([false]);
    expect(set.lineHashes).toEqual(linesForOverlap(LONG));
  });

  it("고른 파일을 읽지 못하면 읽지 못한 것으로 적는다", async () => {
    const p = join(root, "p");
    await put(join(p, "AGENTS.md"), `${LONG}\n`);
    const original = fsModule.readText;
    vi.spyOn(fsModule, "readText").mockImplementation(async (path) => (path === join(p, "AGENTS.md") ? { status: "unreadable" } : original(path)));
    const set = await readCodexProjectInstructions(p, []);
    expect(set.files).toEqual([]);
    expect(set.unreadable).toEqual([join(p, "AGENTS.md")]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/codex-instructions.test.ts`
Expected: FAIL. `test/scan/codex-instructions.test.ts`가 `src/scan/codex-instructions.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/scan/codex-instructions.ts`(새 파일):

```ts
// Codex의 지침 파일을 고른다. 전역은 Codex 홈의 AGENTS.override.md와 AGENTS.md 가운데 Codex가 싣는 하나, 프로젝트는 뿌리에서 Codex가 고르는 하나다. 크기, 글자 수, 줄 지문만 남기고 글은 버린다(설계 「5단계 2부 계획 전 결정」 5번)
import { join } from "node:path";
import { entryInfo, readText } from "./fs.ts";
import { emptyInstructionSet, readInstructionSet, type InstructionSet, type MentionTarget } from "./instructions.ts";

const NAMES = ["AGENTS.override.md", "AGENTS.md"];

/**
 * 전역 지침. 차례대로 일반 파일이고 앞뒤 공백을 뗀 내용이 있는 첫 파일 하나다. 비었거나 폴더인 것은 건너뛰고, 있는데 읽지 못한 파일은 읽지 못한 것으로 적고
 * 다음 후보를 본다(공개 소스 codex-home/src/instructions/mod.rs). 전역 지침에 목록의 프로젝트가 나온 횟수도 센다
 */
export async function readCodexGlobalInstructions(codexHome: string, mentionTargets: readonly MentionTarget[]): Promise<{ set: InstructionSet; mentions: Record<string, number> }> {
  const unreadable: string[] = [];
  for (const name of NAMES) {
    const path = join(codexHome, name);
    if (!(await entryInfo(path)).isFile) continue;
    const read = await readText(path);
    if (read.status === "unreadable") unreadable.push(path);
    if (read.status !== "ok" || !/\S/u.test(read.text)) continue;
    const found = await readInstructionSet([path], mentionTargets);
    found.set.unreadable.unshift(...unreadable);
    return found;
  }
  const set = emptyInstructionSet();
  set.unreadable.push(...unreadable);
  return { set, mentions: Object.create(null) as Record<string, number> };
}

/**
 * 프로젝트 지침. 뿌리에서 AGENTS.override.md, AGENTS.md, fallback 이름의 차례로 일반 파일인 첫 파일 하나다. 그 파일이 비었으면 지침이 없고, 같은 폴더의 다음 이름은
 * 보지 않는다(공개 소스 core/src/agents_md.rs). Codex는 전역과 같은 파일이어도 두 번 싣으므로 같은 파일 표시를 붙이지 않는다
 */
export async function readCodexProjectInstructions(root: string, fallback: readonly string[]): Promise<InstructionSet> {
  for (const name of [...NAMES, ...fallback]) {
    const path = join(root, name);
    if ((await entryInfo(path)).isFile) return (await readInstructionSet([path])).set;
  }
  return emptyInstructionSet();
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/codex-instructions.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 10개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/codex-instructions.test.ts src/scan/codex-instructions.ts
git commit -m "feat: Codex가 싣는 지침 파일을 고름"
```

---

### Task 4: Codex 스킬을 찾는 곳 훑기

**Files:**
- Create: `src/scan/codex-skills.ts`
- Test: `test/scan/codex-skills.test.ts`

**Interfaces:**
- Consumes: 2단계의 `readSkillFolder`, `parseFrontmatter`, `SkillFolder`(`src/scan/skills.ts`), `entryInfo`, `listDir`, `readText`(`src/scan/fs.ts`), `normalizePath`.
- Produces: `CodexSkillFolder`(`folder`, `viaLink`, `frontmatterOk`, `name`, `skillFileRealPath`), `CodexSkillRootScan`(`skills`, `danglingLinks`, `unreadableDirs`, `truncated`), `CodexSkillScanLimits`, `CODEX_MANIFEST_PATHS`, `codexFrontmatterOk(bytes)`, `scanCodexSkillRoot(root, limits)`(`src/scan/codex-skills.ts`). 과제 5·7이 쓴다.

「5단계 2부 계획 전 결정」 6번이다. 찾는 꼴은 공개 소스 `ext/skills/src/loader/discovery.rs`와 `exec-server/src/local_file_system.rs`의 `walk`를 따른다.

- 찾는 곳에서 폴더를 넓이 차례로(폴더 안은 이름 차례로) 내려가며 여섯 단의 폴더까지 있는 `SKILL.md`(이름의 대소문자 그대로인 일반 파일)를 스킬로 본다. 찾는 곳 자신의 `SKILL.md`와 스킬 폴더 안의 `SKILL.md`도 따로 스킬이다.
- 찾는 곳 아래에서 `.`으로 시작하는 폴더에는 들어가지 않는다(그래서 `<Codex 홈>/skills/.system`의 기본 스킬은 사용자 범위에 들지 않는다). 폴더 링크는 따라가고 같은 실제 폴더는 한 번만 본다. 파일 링크(`SKILL.md`도)는 따라가지 않는다. 가리키는 곳이 없는 링크는 S3의 재료로 낸다.
- 폴더 2,000개나 항목 20,000개에 닿으면 Codex처럼 거기서 멈추고 다 보지 못한 것으로 적는다. 시험은 상한을 작게 넘긴다.
- 이름은 머리말의 `name`(공백을 한 칸으로 줄인 것)이고 없으면 폴더 이름이다. 스킬 폴더에서 찾는 곳까지 위로 가며 가장 가까운 유효한 플러그인 매니페스트(`.codex-plugin`, `.claude-plugin`, `.cursor-plugin`의 차례로 첫 `plugin.json`)의 `name`(비면 그 폴더 이름)이 앞에 붙는다. 풀리지 않는 매니페스트는 건너뛰고 바깥 것을 쓴다(공개 소스 `loader/namespace.rs`, `utils/plugins/src/plugin_namespace.rs`). 찾는 곳보다 위는 보지 않는다(27절).
- Codex가 싣는 머리말인지(S3)는 첫 줄이 `---`이고 닫는 `---`가 있으며 `description`이 비지 않은 것이다. Codex는 BOM을 벗기지 않아(공개 소스 `file-system/src/lib.rs`의 `read_file_text`) BOM으로 시작하는 `SKILL.md`는 머리말을 찾지 못한다. `description`을 이 해석기가 읽지 못하는 꼴이면 있는 것으로 본다(공개 소스 `skills/src/parser.rs`는 YAML로 읽는다).
- 파일 링크 시험은 Windows에서 관리자 권한이나 개발자 모드 없이 만들 수 없어 그때 건너뛴다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/codex-skills.test.ts`(새 파일):

```ts
// Codex의 스킬을 찾는 곳 하나를 Codex와 같은 꼴로 훑는지 시험한다. 여섯 단의 폴더까지의 SKILL.md, 숨김 폴더, 폴더 링크와 파일 링크, 깨진 링크, 상한, 플러그인 이름 접두, Codex가 싣는 머리말인지(설계 「5단계 2부 계획 전 결정」 6번)
import { mkdir, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { codexFrontmatterOk, scanCodexSkillRoot } from "../../src/scan/codex-skills.ts";
import * as fsModule from "../../src/scan/fs.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let skills: string;
beforeEach(async () => {
  root = await makeTemp();
  skills = join(root, ".agents", "skills");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

const skill = (name: string | null, description = "시험용 스킬"): string => `---\n${name === null ? "" : `name: ${name}\n`}description: ${description}\n---\n\n본문 글은 남지 않는다.\n`;
const names = async (dir: string): Promise<string[]> => (await scanCodexSkillRoot(dir)).skills.map((s) => s.name).sort();

describe("scanCodexSkillRoot의 찾는 꼴", () => {
  it("찾는 곳 아래 여섯 단의 폴더까지 있는 SKILL.md를 스킬로 보고, 일곱째 단은 보지 않는다", async () => {
    const six = join(skills, "d0", "d1", "d2", "d3", "d4", "d5");
    await put(join(six, "SKILL.md"), skill("six"));
    await put(join(six, "d6", "SKILL.md"), skill("seven"));
    expect(await names(skills)).toEqual(["six"]);
  });

  it("찾는 곳 자신의 SKILL.md와 스킬 폴더 안의 SKILL.md도 따로 스킬이다", async () => {
    await put(join(skills, "SKILL.md"), skill("top"));
    await put(join(skills, "a", "SKILL.md"), skill("outer"));
    await put(join(skills, "a", "inner", "SKILL.md"), skill("inner"));
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => [s.name, s.folder.path]).sort()).toEqual([
      ["inner", join(skills, "a", "inner")],
      ["outer", join(skills, "a")],
      ["top", skills],
    ]);
  });

  it("찾는 곳 아래의 .으로 시작하는 폴더에는 들어가지 않는다. 찾는 곳 자신의 이름은 상관없다", async () => {
    await put(join(skills, ".system", "builtin", "SKILL.md"), skill("builtin"));
    await put(join(skills, "ok", ".git", "SKILL.md"), skill("hidden"));
    await put(join(skills, "ok", "SKILL.md"), skill("ok"));
    expect(await names(skills)).toEqual(["ok"]);
    const dotted = join(root, ".dotted-root");
    await put(join(dotted, "x", "SKILL.md"), skill("x"));
    expect(await names(dotted)).toEqual(["x"]);
  });

  it("이름이 SKILL.md 그대로인 일반 파일만 스킬이다", async () => {
    await put(join(skills, "lower", "skill.md"), skill("lower"));
    await mkdir(join(skills, "dir", "SKILL.md"), { recursive: true });
    expect(await names(skills)).toEqual([]);
  });

  it("폴더 링크는 따라가고, 같은 실제 폴더는 이름 차례로 먼저 만난 한 곳으로만 본다", async () => {
    const store = join(root, "store");
    await put(join(store, "shared", "SKILL.md"), skill("shared"));
    await linkDir(join(store, "shared"), join(skills, "a-link"));
    await linkDir(join(store, "shared"), join(skills, "b-link"));
    await put(join(skills, "plain", "SKILL.md"), skill("plain"));
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => [s.name, s.folder.path, s.viaLink])).toEqual([
      ["shared", join(skills, "a-link"), true],
      ["plain", join(skills, "plain"), false],
    ]);
    expect(scan.skills[0]!.folder.realPath).toBe(normalizePath(await realpath(join(store, "shared"))));
  });

  it("링크로 들어간 폴더 아래의 스킬도 링크로 건 것이다", async () => {
    const store = join(root, "store");
    await put(join(store, "pack", "inner", "SKILL.md"), skill("inner"));
    await linkDir(join(store, "pack"), join(skills, "pack"));
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => [s.name, s.viaLink, s.folder.isLink])).toEqual([["inner", true, false]]);
  });

  it("가리키는 곳이 없는 링크를 낸다", async () => {
    const gone = join(root, "gone");
    await put(join(gone, "SKILL.md"), skill("gone"));
    await linkDir(gone, join(skills, "broken"));
    await removeTemp(gone);
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills).toEqual([]);
    expect(scan.danglingLinks).toEqual([join(skills, "broken")]);
  });

  it("파일 링크인 SKILL.md는 스킬이 아니다", async (ctx) => {
    await put(join(root, "real", "SKILL.md"), skill("real"));
    await mkdir(join(skills, "linked"), { recursive: true });
    try {
      await symlink(join(root, "real", "SKILL.md"), join(skills, "linked", "SKILL.md"), "file");
    } catch {
      // Windows에서 관리자 권한이나 개발자 모드 없이는 파일 링크를 만들 수 없다
      ctx.skip();
    }
    expect(await names(skills)).toEqual([]);
  });

  it("목록을 읽지 못한 폴더를 낸다. 없는 찾는 곳은 빈 결과다", async () => {
    await put(join(skills, "a", "SKILL.md"), skill("a"));
    await put(join(skills, "b", "SKILL.md"), skill("b"));
    const original = fsModule.listDir;
    vi.spyOn(fsModule, "listDir").mockImplementation(async (path) => (path === join(skills, "a") ? { status: "unreadable" } : original(path)));
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => s.name)).toEqual(["b"]);
    expect(scan.unreadableDirs).toEqual([join(skills, "a")]);
    vi.restoreAllMocks();
    expect(await scanCodexSkillRoot(join(root, "none"))).toEqual({ skills: [], danglingLinks: [], unreadableDirs: [], truncated: false });
  });

  it("폴더 수나 항목 수가 상한에 닿으면 다 보지 못한 것으로 적는다(Codex는 거기서 자른다)", async () => {
    await put(join(skills, "a", "SKILL.md"), skill("a"));
    await put(join(skills, "b", "SKILL.md"), skill("b"));
    await put(join(skills, "c", "SKILL.md"), skill("c"));
    // 찾는 곳 자신이 폴더 하나다. 둘까지면 하위 폴더 하나만 내려간다
    const byDirs = await scanCodexSkillRoot(skills, { maxDirectories: 2, maxEntries: 20_000 });
    expect(byDirs.truncated).toBe(true);
    expect(byDirs.skills.map((s) => s.name)).toEqual(["a"]);
    // 항목은 a, b, c와 a/SKILL.md의 차례로 센다
    const byEntries = await scanCodexSkillRoot(skills, { maxDirectories: 2_000, maxEntries: 4 });
    expect(byEntries.truncated).toBe(true);
    expect(byEntries.skills.map((s) => s.name)).toEqual(["a"]);
    const enough = await scanCodexSkillRoot(skills, { maxDirectories: 4, maxEntries: 6 });
    expect(enough.truncated).toBe(false);
    expect(enough.skills.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });
});

describe("scanCodexSkillRoot의 이름", () => {
  it("머리말의 name(공백을 한 칸으로 줄인 것)이고, 없으면 SKILL.md가 든 폴더의 이름이다", async () => {
    await put(join(skills, "folder-a", "SKILL.md"), skill("  spaced   name  "));
    await put(join(skills, "folder-b", "SKILL.md"), skill(null));
    expect(await names(skills)).toEqual(["folder-b", "spaced name"]);
  });

  it("스킬 폴더에서 찾는 곳까지 가장 가까운 플러그인 매니페스트의 이름이 앞에 붙는다", async () => {
    await put(join(skills, "plug", ".codex-plugin", "plugin.json"), JSON.stringify({ name: "sample" }));
    await put(join(skills, "plug", "skills", "search", "SKILL.md"), skill(null));
    await put(join(skills, "plug", "nested", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "deeper" }));
    await put(join(skills, "plug", "nested", "s2", "SKILL.md"), skill(null));
    await put(join(skills, "noname", ".cursor-plugin", "plugin.json"), JSON.stringify({ name: "  " }));
    await put(join(skills, "noname", "x", "SKILL.md"), skill(null));
    await put(join(skills, "broken", ".codex-plugin", "plugin.json"), "{ 깨진 JSON");
    await put(join(skills, "broken", "y", "SKILL.md"), skill(null));
    await put(join(skills, "plain", "SKILL.md"), skill(null));
    expect(await names(skills)).toEqual(["deeper:s2", "noname:x", "plain", "sample:search", "y"]);
  });

  it("같은 폴더에 매니페스트가 여럿이면 .codex-plugin, .claude-plugin, .cursor-plugin의 차례로 첫 파일이다. 깨진 깊은 매니페스트는 건너뛰고 바깥 것을 쓴다", async () => {
    await put(join(skills, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "outer" }));
    await put(join(skills, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "second" }));
    await put(join(skills, "inner", ".claude-plugin", "plugin.json"), "{");
    await put(join(skills, "inner", "s", "SKILL.md"), skill(null));
    expect(await names(skills)).toEqual(["outer:s"]);
  });

  it("SKILL.md 파일의 실제 경로를 낸다([[skills.config]]의 path와 견준다)", async () => {
    await put(join(skills, "a", "SKILL.md"), skill("a"));
    const [found] = (await scanCodexSkillRoot(skills)).skills;
    expect(found!.skillFileRealPath).toBe(normalizePath(await realpath(join(skills, "a", "SKILL.md"))));
  });
});

describe("codexFrontmatterOk", () => {
  it("머리말이 있고 description이 비지 않아야 Codex가 싣는다", () => {
    expect(codexFrontmatterOk(Buffer.from(skill("a")))).toBe(true);
    expect(codexFrontmatterOk(Buffer.from("---\nname: a\n---\n본문\n"))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from("---\nname: a\ndescription:   \n---\n"))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from('---\nname: a\ndescription: ""\n---\n'))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from("---\n---\n"))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from("# 머리말 없음\n"))).toBe(false);
    expect(codexFrontmatterOk(Buffer.from("---\ndescription: 닫는 줄이 없다\n"))).toBe(false);
  });

  it("BOM으로 시작하면 Codex가 머리말을 찾지 못한다", () => {
    expect(codexFrontmatterOk(Buffer.from(`﻿${skill("a")}`))).toBe(false);
  });

  it("description을 스캐너가 읽지 못하는 꼴이면 있는 것으로 본다", () => {
    expect(codexFrontmatterOk(Buffer.from("---\nname: a\ndescription: |\n  여러 줄\n---\n"))).toBe(true);
    expect(codexFrontmatterOk(Buffer.from('---\nname: a\n"description": 따옴표 열쇠\n---\n'))).toBe(true);
  });
});

describe("스킬 위치의 머리말 사실", () => {
  it("읽은 SKILL.md마다 Codex가 싣는 머리말인지를 낸다", async () => {
    await put(join(skills, "good", "SKILL.md"), skill("good"));
    await put(join(skills, "nodesc", "SKILL.md"), "---\nname: nodesc\n---\n");
    await put(join(skills, "bom", "SKILL.md"), `﻿${skill("bom")}`);
    const scan = await scanCodexSkillRoot(skills);
    expect(scan.skills.map((s) => [s.folder.dirName, s.frontmatterOk, s.folder.readable]).sort()).toEqual([
      ["bom", false, true],
      ["good", true, true],
      ["nodesc", false, true],
    ]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/codex-skills.test.ts`
Expected: FAIL. `test/scan/codex-skills.test.ts`가 `src/scan/codex-skills.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/scan/codex-skills.ts`(새 파일):

```ts
// Codex의 스킬을 찾는 곳 하나를 Codex와 같은 꼴로 훑는다. 여섯 단의 폴더까지의 SKILL.md, 숨김 폴더 건너뛰기, 폴더 링크 따라가기(같은 실제 폴더는 한 번), 파일 링크 무시, 상한, 플러그인 이름 접두, Codex가 싣는 머리말인지를 본다. 스킬의 글은 버린다(설계 「5단계 2부 계획 전 결정」 6번)
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, listDir, readText } from "./fs.ts";
import { parseFrontmatter, readSkillFolder, type SkillFolder } from "./skills.ts";

export interface CodexSkillFolder {
  /** 스킬 폴더(SKILL.md가 든 폴더)의 사실. isLink는 그 폴더 자체가 링크인지다 */
  folder: SkillFolder;
  /** 찾는 곳에서 이 스킬 폴더까지 링크를 지나왔다(스킬 폴더 자체가 링크인 것도 든다). 링크로 건 위치는 사본으로 세지 않는다 */
  viaLink: boolean;
  /** Codex가 싣는 머리말이다(codexFrontmatterOk). 거짓이고 읽은 SKILL.md면 S3의 "머리말이 없는 스킬"이다 */
  frontmatterOk: boolean;
  /** Codex가 부르는 이름. 가장 가까운 플러그인 매니페스트의 이름이 있으면 '<그 이름>:'이 앞에 붙는다 */
  name: string;
  /** SKILL.md 파일의 실제 경로(정규화). [[skills.config]]의 path와 견준다 */
  skillFileRealPath: string | null;
}

export interface CodexSkillRootScan {
  skills: CodexSkillFolder[];
  /** 가리키는 곳이 없는 링크(S3) */
  danglingLinks: string[];
  /** 목록을 읽지 못한 폴더 */
  unreadableDirs: string[];
  /** 폴더 수나 항목 수가 상한에 닿아 다 보지 못했다 */
  truncated: boolean;
}

export interface CodexSkillScanLimits {
  maxDirectories: number;
  maxEntries: number;
}

/** 공개 소스 ext/skills/src/loader(MAX_SCAN_DEPTH, MAX_SKILLS_DIRS_PER_ROOT, MAX_SKILLS_ENTRIES_PER_ROOT)와 같다 */
const MAX_DEPTH = 6;
const LIMITS: CodexSkillScanLimits = { maxDirectories: 2000, maxEntries: 20_000 };
/** 플러그인 뿌리 아래의 매니페스트 자리(차례대로, 공개 소스 exec-server-protocol의 DISCOVERABLE_PLUGIN_MANIFEST_PATHS) */
export const CODEX_MANIFEST_PATHS = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"] as const;
const MANIFEST_DIRS: readonly string[] = CODEX_MANIFEST_PATHS.map((path) => path.split("/")[0]!);

/**
 * Codex가 싣는 머리말인지. 첫 줄이 ---이고 닫는 ---가 있으며 description이 비지 않아야 한다(공개 소스 skills/src/parser.rs). Codex는 BOM을 벗기지 않아
 * BOM으로 시작하면 머리말을 찾지 못한다. description의 값을 이 해석기가 읽지 못하는 꼴이거나 읽지 못한 최상위 줄이 있으면 Codex가 읽는 description이 있을 수 있어 있는 것으로 본다
 */
export function codexFrontmatterOk(bytes: Buffer): boolean {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return false;
  const front = parseFrontmatter(bytes.toString("utf8"));
  if (!front.present) return false;
  const description = front.fields.description;
  if (description !== undefined) return description.split(/\s+/u).some((part) => part !== "");
  return front.unreadable.includes("description") || front.unreadable.includes("name");
}

/** 플러그인 뿌리의 매니페스트 이름. 차례대로 첫 파일을 읽어 name을 낸다. name이 비면 그 폴더의 이름이고, 읽지 못하거나 풀리지 않으면 null이다(공개 소스 utils/plugins의 plugin_namespace_for_root_uri) */
async function manifestNamespace(pluginRoot: string): Promise<string | null> {
  for (const relative of CODEX_MANIFEST_PATHS) {
    const path = join(pluginRoot, ...relative.split("/"));
    if (!(await entryInfo(path)).isFile) continue;
    const read = await readText(path);
    if (read.status !== "ok") return null;
    try {
      const value = JSON.parse(read.text) as { name?: unknown } | null;
      const name = value?.name === undefined ? "" : value.name;
      if (typeof name !== "string") return null;
      return name.trim() === "" ? basename(pluginRoot) : name;
    } catch {
      return null;
    }
  }
  return null;
}

const squash = (text: string): string => text.split(/\s+/u).filter((part) => part !== "").join(" ");

/** 찾는 곳 하나를 훑는다. 스킬은 찾은 차례(폴더를 넓이 차례로, 폴더 안은 이름 차례)다 */
export async function scanCodexSkillRoot(root: string, limits: CodexSkillScanLimits = LIMITS): Promise<CodexSkillRootScan> {
  const out: CodexSkillRootScan = { skills: [], danglingLinks: [], unreadableDirs: [], truncated: false };
  const rootInfo = await entryInfo(root);
  if (!rootInfo.isDir) return out;
  const visited = new Set<string>([rootInfo.realPath ?? normalizePath(root)]);
  const queue: { dir: string; depth: number; viaLink: boolean }[] = [{ dir: root, depth: 0, viaLink: false }];
  const found: { dir: string; viaLink: boolean }[] = [];
  const pluginRoots = new Set<string>();
  let directories = 1;
  let entries = 0;
  walk: while (queue.length > 0) {
    const { dir, depth, viaLink } = queue.shift()!;
    const listing = await listDir(dir);
    if (listing.status === "unreadable") out.unreadableDirs.push(dir);
    if (listing.status !== "ok") continue;
    for (const name of listing.names) {
      if (entries === limits.maxEntries) {
        out.truncated = true;
        break walk;
      }
      entries++;
      const path = join(dir, name);
      const info = await entryInfo(path);
      if (info.dangling) {
        out.danglingLinks.push(path);
        continue;
      }
      // 파일 링크는 따라가지 않는다(SKILL.md도). 폴더 링크만 따라간다
      if (!info.exists || (info.isLink && !info.isDir)) continue;
      if (info.isDir) {
        // 매니페스트 폴더는 숨김 폴더라 들어가지는 않고 그 부모를 플러그인 뿌리로 적는다
        if (MANIFEST_DIRS.includes(name)) pluginRoots.add(dir);
        if (depth >= MAX_DEPTH || name.startsWith(".")) continue;
        const identity = info.realPath ?? normalizePath(path);
        if (visited.has(identity)) continue;
        visited.add(identity);
        if (directories === limits.maxDirectories) {
          out.truncated = true;
          continue;
        }
        directories++;
        queue.push({ dir: path, depth: depth + 1, viaLink: viaLink || info.isLink });
        continue;
      }
      if (info.isFile && name === "SKILL.md") found.push({ dir, viaLink });
    }
  }

  const namespaces = new Map<string, string | null>();
  const namespaceOf = async (dir: string): Promise<string | null> => {
    // 스킬 폴더에서 찾는 곳까지 위로 가며 가장 가까운 유효한 매니페스트다. 찾는 곳보다 위는 보지 않는다
    for (let current = dir; ; current = dirname(current)) {
      if (pluginRoots.has(current)) {
        if (!namespaces.has(current)) namespaces.set(current, await manifestNamespace(current));
        const namespace = namespaces.get(current)!;
        if (namespace !== null) return namespace;
      }
      if (current === root || dirname(current) === current) return null;
    }
  };
  for (const { dir, viaLink } of found) {
    const folder = await readSkillFolder(dir, basename(dir));
    if (folder === null) continue;
    const skillFile = join(dir, "SKILL.md");
    let bytes: Buffer | null = null;
    try {
      bytes = await readFile(skillFile);
    } catch {
      bytes = null;
    }
    const namespace = await namespaceOf(dir);
    const own = folder.declaredName === null ? "" : squash(folder.declaredName);
    const base = own === "" ? folder.dirName : own;
    out.skills.push({
      folder,
      viaLink: viaLink || folder.isLink,
      frontmatterOk: folder.readable && bytes !== null && codexFrontmatterOk(bytes),
      name: namespace === null ? base : `${namespace}:${base}`,
      skillFileRealPath: (await entryInfo(skillFile)).realPath,
    });
  }
  return out;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/codex-skills.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 18개. 파일 링크를 만들 수 없는 Windows에서는 그 시험 하나를 건너뛴다(`1 skipped`).

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/codex-skills.test.ts src/scan/codex-skills.ts
git commit -m "feat: Codex 스킬을 찾는 곳을 Codex와 같이 훑음"
```

---

### Task 5: Codex 플러그인 읽기

**Files:**
- Create: `src/scan/codex-plugins.ts`
- Test: `test/scan/codex-plugins.test.ts`

**Interfaces:**
- Consumes: 과제 4의 `CODEX_MANIFEST_PATHS`. 2단계의 `entryInfo`, `listDir`, `readText`, `isObject`, `FileStatus`.
- Produces: `CodexPluginRead`(`id`, `idValid`, `root`, `install`, `manifest`, `namespace`, `skillRoots`, `mcpServers`, `mcpUnreadable`), `codexPluginIdValid(id)`, `compareCodexPluginVersions(a, b)`, `readCodexPlugin(codexHome, id)`(`src/scan/codex-plugins.ts`). 과제 7이 쓴다.

「5단계 2부 계획 전 결정」 7·8번이다. Codex에는 설치 기록 파일이 없다. 설정의 항목이 출발점이고, 켜졌는지는 과제 7이 맥락마다 본다.

- 설치 ID는 마지막 `@`로 나눈 이름(ASCII 글자·숫자·`_`·`-`·`.`, 점은 앞뒤와 연달아 금지)과 마켓(ASCII 글자·숫자·`_`·`-`)이다(공개 소스 `core-plugin-common/src/plugin_id.rs`). 꼴이 틀리면 Codex가 싣지 않고 놓인 곳도 찾지 않는다.
- 놓인 곳은 `<Codex 홈>/plugins/cache/<마켓>/<이름>/` 아래의 버전 폴더(이름이 ASCII 글자·숫자·`.`·`+`·`_`·`-`인 일반 폴더. 링크는 버전으로 보지 않는다) 가운데 `local`이 있으면 그것, 없으면 가장 높은 버전이다. 둘 다 SemVer 꼴이면 SemVer의 차례(pre-release 포함)이고 아니면 글자의 차례다(공개 소스 `core-plugin-common/src/installed.rs`).
- 매니페스트는 뿌리의 `plugin.json`(`$schema`가 `https://agent-plugins.org/schemas/`로 시작할 때만), `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`의 차례다. 자리가 링크이거나 일반 파일이 아니면, 또는 매니페스트 폴더 자리가 폴더가 아니면 그 뒤를 보지 않고 없다고 본다(공개 소스 `find_plugin_manifest_path`). 풀리지 않거나 `name`이 글자가 아니면 맞지 않는 매니페스트다. `name`이 비면 뿌리 폴더(버전 폴더)의 이름이다.
- 스킬을 찾는 폴더는 매니페스트의 `skills`(글자나 글자의 목록) 가운데 맞는 경로(`./`로 시작하고 그것만이 아니며 `..`와 절대 경로가 없고 뿌리 안)이고, 없으면 `skills/`(폴더일 때)다. 매니페스트 폴더를 쓰는 형식이면 `.codex-plugin/migrated-command-skills`(폴더일 때)를 더한다(공개 소스 `core-plugins/src/loader.rs`의 `plugin_skill_roots`, `manifest.rs`의 `resolve_manifest_path`).
- MCP 정의는 매니페스트의 `mcpServers`가 묶음이면 그것만이고, 아니면 그것이 가리키는 파일이나 기본 `.mcp.json`이다. 파일은 `{"mcpServers": {...}}`이거나 그 안쪽 꼴이고, 정의가 묶음이 아닌 서버는 버린다. 파일이 풀리지 않거나 읽지 못하면 MCP 정의를 읽지 못한 것이다. 선언한 파일이 없으면 서버가 없다(공개 소스 `load_plugin_mcp_servers_from_manifest_with_format`, `codex-mcp/src/plugin_config.rs`).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/codex-plugins.test.ts`(새 파일):

```ts
// Codex 플러그인 읽기를 시험한다. 설치 ID의 꼴, 버전 폴더 고르기, 매니페스트를 찾는 차례와 실패하는 꼴, 구성 요소의 이름, 스킬을 찾는 폴더, MCP 정의(인라인, 파일, 기본 .mcp.json)(설계 「5단계 2부 계획 전 결정」 7·8번)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codexPluginIdValid, compareCodexPluginVersions, readCodexPlugin } from "../../src/scan/codex-plugins.ts";
import * as fsModule from "../../src/scan/fs.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let home: string;
beforeEach(async () => {
  root = await makeTemp();
  home = join(root, ".codex");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

const cache = (market: string, name: string, version: string): string => join(home, "plugins", "cache", market, name, version);
const manifest = (dir: string, value: unknown, place = ".codex-plugin"): Promise<void> => put(join(dir, place, "plugin.json"), typeof value === "string" ? value : JSON.stringify(value));

describe("codexPluginIdValid", () => {
  it("마지막 @로 나눈 이름과 마켓이 Codex의 꼴이어야 한다", () => {
    for (const id of ["a@m", "my-plugin_1.v2@open-ai_x"]) expect(codexPluginIdValid(id)).toBe(true);
    for (const id of ["am", "@m", "a@", "a..b@m", ".a@m", "a.@m", "a@m.x", "x@y@m", "한글@m", "a b@m"]) expect(codexPluginIdValid(id)).toBe(false);
  });
});

describe("compareCodexPluginVersions", () => {
  it("둘 다 SemVer 꼴이면 SemVer의 차례이고, 아니면 글자의 차례다", () => {
    expect(compareCodexPluginVersions("2.0.0", "10.0.0")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0-alpha.2", "1.0.0-alpha.10")).toBeLessThan(0);
    expect(compareCodexPluginVersions("1.0.0-alpha", "1.0.0-1")).toBeGreaterThan(0);
    expect(compareCodexPluginVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareCodexPluginVersions("v2", "v10")).toBeGreaterThan(0);
    expect(compareCodexPluginVersions("10.0.0", "1x")).toBeLessThan(0);
  });
});

describe("readCodexPlugin의 놓인 곳", () => {
  it("버전 폴더 가운데 local이 있으면 그것이고, 없으면 가장 높은 버전이다", async () => {
    for (const version of ["1.0.0", "local", "2.0.0"]) await manifest(cache("m", "p", version), { name: "p" });
    expect((await readCodexPlugin(home, "p@m")).root).toBe(cache("m", "p", "local"));
    for (const version of ["2.0.0", "10.0.0", "9.9.9"]) await manifest(cache("m", "q", version), { name: "q" });
    expect((await readCodexPlugin(home, "q@m")).root).toBe(cache("m", "q", "10.0.0"));
  });

  it("이름이 맞지 않는 폴더, 파일, 폴더 링크는 버전으로 보지 않는다", async () => {
    await manifest(cache("m", "p", "1.0.0"), { name: "p" });
    await mkdir(cache("m", "p", "9 9"), { recursive: true });
    await put(cache("m", "p", "9.0.0"), "파일이다");
    await manifest(join(root, "elsewhere"), { name: "p" });
    await linkDir(join(root, "elsewhere"), cache("m", "p", "8.0.0"));
    expect((await readCodexPlugin(home, "p@m")).root).toBe(cache("m", "p", "1.0.0"));
  });

  it("그 이름의 폴더나 버전 폴더가 없으면 깔리지 않은 것이고, 목록을 읽지 못하면 읽지 못한 것이다", async () => {
    expect((await readCodexPlugin(home, "none@m")).install).toBe("missing");
    await mkdir(join(home, "plugins", "cache", "m", "empty"), { recursive: true });
    expect((await readCodexPlugin(home, "empty@m")).install).toBe("missing");
    await manifest(cache("m", "p", "1.0.0"), { name: "p" });
    const original = fsModule.listDir;
    vi.spyOn(fsModule, "listDir").mockImplementation(async (path) => (path === join(home, "plugins", "cache", "m", "p") ? { status: "unreadable" } : original(path)));
    const read = await readCodexPlugin(home, "p@m");
    expect([read.install, read.root, read.manifest]).toEqual(["unreadable", null, "missing"]);
  });

  it("설치 ID가 Codex의 꼴이 아니면 놓인 곳을 찾지 않는다", async () => {
    const read = await readCodexPlugin(home, "bad id");
    expect([read.idValid, read.install, read.root]).toEqual([false, "missing", null]);
  });
});

describe("readCodexPlugin의 매니페스트", () => {
  it(".codex-plugin, .claude-plugin, .cursor-plugin의 차례로 첫 파일이다", async () => {
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, { name: "from-claude" }, ".claude-plugin");
    await manifest(dir, { name: "from-cursor" }, ".cursor-plugin");
    expect((await readCodexPlugin(home, "p@m")).namespace).toBe("from-claude");
    await manifest(dir, { name: "from-codex" });
    expect((await readCodexPlugin(home, "p@m")).namespace).toBe("from-codex");
  });

  it("뿌리의 plugin.json은 $schema가 agent-plugins.org를 가리킬 때만 쓰고 맨 먼저다", async () => {
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, { name: "from-codex" });
    await put(join(dir, "plugin.json"), JSON.stringify({ name: "unrelated" }));
    expect((await readCodexPlugin(home, "p@m")).namespace).toBe("from-codex");
    await put(join(dir, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "agent" }));
    expect((await readCodexPlugin(home, "p@m")).namespace).toBe("agent");
  });

  it("매니페스트 자리가 폴더이거나 매니페스트 폴더가 파일이면 Codex는 매니페스트가 없다고 본다", async () => {
    const a = cache("m", "a", "1.0.0");
    await mkdir(join(a, "plugin.json"), { recursive: true });
    await manifest(a, { name: "a" });
    expect((await readCodexPlugin(home, "a@m")).manifest).toBe("missing");
    const b = cache("m", "b", "1.0.0");
    await put(join(b, ".codex-plugin"), "파일이다");
    await manifest(b, { name: "b" }, ".claude-plugin");
    expect((await readCodexPlugin(home, "b@m")).manifest).toBe("missing");
  });

  it("풀리지 않거나 name이 글자가 아니면 맞지 않는 매니페스트다. name이 비면 뿌리 폴더의 이름이다", async () => {
    await manifest(cache("m", "a", "1.0.0"), "{ 깨진");
    expect((await readCodexPlugin(home, "a@m")).manifest).toBe("unparsable");
    await manifest(cache("m", "b", "1.0.0"), { name: 3 });
    expect((await readCodexPlugin(home, "b@m")).manifest).toBe("unparsable");
    await manifest(cache("m", "c", "2.1.0"), { name: "  " });
    const read = await readCodexPlugin(home, "c@m");
    expect([read.manifest, read.namespace]).toEqual(["ok", "2.1.0"]);
  });
});

describe("readCodexPlugin의 구성", () => {
  it("스킬을 찾는 폴더는 매니페스트의 skills 가운데 맞는 경로이고, 없으면 skills/다. 옮겨 둔 명령 스킬 폴더를 더한다", async () => {
    const a = cache("m", "a", "1.0.0");
    await manifest(a, { name: "a", skills: ["./custom", "../out", "/abs", "./", "./more"] });
    await mkdir(join(a, "skills"), { recursive: true });
    await mkdir(join(a, ".codex-plugin", "migrated-command-skills"), { recursive: true });
    expect((await readCodexPlugin(home, "a@m")).skillRoots).toEqual([join(a, ".codex-plugin", "migrated-command-skills"), join(a, "custom"), join(a, "more")].sort());
    const b = cache("m", "b", "1.0.0");
    await manifest(b, { name: "b", skills: 3 });
    await mkdir(join(b, "skills"), { recursive: true });
    expect((await readCodexPlugin(home, "b@m")).skillRoots).toEqual([join(b, "skills")]);
    const c = cache("m", "c", "1.0.0");
    await manifest(c, { name: "c", skills: "./only" });
    expect((await readCodexPlugin(home, "c@m")).skillRoots).toEqual([join(c, "only")]);
    const d = cache("m", "d", "1.0.0");
    await manifest(d, { name: "d" });
    expect((await readCodexPlugin(home, "d@m")).skillRoots).toEqual([]);
  });

  it("MCP 정의는 인라인 묶음이거나, 매니페스트가 가리키는 파일이거나, 기본 .mcp.json이다", async () => {
    const inline = cache("m", "inline", "1.0.0");
    await manifest(inline, { name: "inline", mcpServers: { s: { command: "x" }, bad: 3 } });
    await put(join(inline, ".mcp.json"), JSON.stringify({ mcpServers: { ignored: { command: "y" } } }));
    expect((await readCodexPlugin(home, "inline@m")).mcpServers).toEqual([{ name: "s", definition: { command: "x" } }]);
    const file = cache("m", "file", "1.0.0");
    await manifest(file, { name: "file", mcpServers: "./conf/mcp.json" });
    await put(join(file, "conf", "mcp.json"), JSON.stringify({ a: { url: "https://e.test" } }));
    expect((await readCodexPlugin(home, "file@m")).mcpServers).toEqual([{ name: "a", definition: { url: "https://e.test" } }]);
    const def = cache("m", "def", "1.0.0");
    await manifest(def, { name: "def" });
    await put(join(def, ".mcp.json"), JSON.stringify({ mcpServers: { b: { command: "z", args: ["1"] } } }));
    const read = await readCodexPlugin(home, "def@m");
    expect([read.mcpServers, read.mcpUnreadable]).toEqual([[{ name: "b", definition: { command: "z", args: ["1"] } }], false]);
  });

  it("MCP 파일이 풀리지 않거나 읽지 못하면 MCP 정의를 읽지 못한 것이다. 선언한 파일이 없으면 서버가 없다", async () => {
    const broken = cache("m", "broken", "1.0.0");
    await manifest(broken, { name: "broken" });
    await put(join(broken, ".mcp.json"), "{ 깨진");
    expect((await readCodexPlugin(home, "broken@m")).mcpUnreadable).toBe(true);
    const list = cache("m", "list", "1.0.0");
    await manifest(list, { name: "list" });
    await put(join(list, ".mcp.json"), "[1, 2]");
    expect((await readCodexPlugin(home, "list@m")).mcpUnreadable).toBe(true);
    const gone = cache("m", "gone", "1.0.0");
    await manifest(gone, { name: "gone", mcpServers: "./none.json" });
    const read = await readCodexPlugin(home, "gone@m");
    expect([read.mcpServers, read.mcpUnreadable]).toEqual([[], false]);
    const locked = cache("m", "locked", "1.0.0");
    await manifest(locked, { name: "locked" });
    await put(join(locked, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
    const original = fsModule.readText;
    vi.spyOn(fsModule, "readText").mockImplementation(async (path) => (path === join(locked, ".mcp.json") ? { status: "unreadable" } : original(path)));
    expect((await readCodexPlugin(home, "locked@m")).mcpUnreadable).toBe(true);
  });

  it("매니페스트가 맞지 않으면 구성을 읽지 않는다", async () => {
    const dir = cache("m", "p", "1.0.0");
    await manifest(dir, "{");
    await mkdir(join(dir, "skills"), { recursive: true });
    await put(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { s: { command: "x" } } }));
    const read = await readCodexPlugin(home, "p@m");
    expect([read.skillRoots, read.mcpServers, read.namespace]).toEqual([[], [], null]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/codex-plugins.test.ts`
Expected: FAIL. `test/scan/codex-plugins.test.ts`가 `src/scan/codex-plugins.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/scan/codex-plugins.ts`(새 파일):

```ts
// Codex 플러그인 하나를 읽는다. 설치 ID의 꼴, 놓인 곳(버전 폴더), 매니페스트, 구성 요소의 이름, 스킬을 찾는 폴더, MCP 정의를 Codex와 같은 규칙으로 본다. 설정에서 켜졌는지는 스캐너가 따로 본다(설계 「5단계 2부 계획 전 결정」 7·8번)
import { join, relative, resolve, sep } from "node:path";
import { lstat } from "node:fs/promises";
import { CODEX_MANIFEST_PATHS } from "./codex-skills.ts";
import { entryInfo, listDir, readText } from "./fs.ts";
import { isObject } from "./json.ts";
import type { FileStatus } from "./types.ts";

type Json = Record<string, unknown>;

export interface CodexPluginRead {
  /** '<이름>@<마켓>' */
  id: string;
  /** 설치 ID가 Codex의 꼴이다. 아니면 Codex가 싣지 않고 놓인 곳도 찾지 않는다 */
  idValid: boolean;
  /** 놓인 곳(고른 버전 폴더). 찾지 못했으면 null */
  root: string | null;
  /** ok는 놓인 곳을 찾음, missing은 그 이름의 폴더나 버전 폴더가 없음, unreadable은 버전 폴더의 목록을 읽지 못함 */
  install: "ok" | "missing" | "unreadable";
  /** missing은 매니페스트가 없음(자리가 폴더이거나 매니페스트 폴더가 파일이면 Codex도 없다고 본다), unparsable은 풀리지 않음, unreadable은 읽지 못함. 놓인 곳을 찾지 못했으면 missing이다 */
  manifest: FileStatus;
  /** 구성 요소의 이름(매니페스트의 name, 비면 뿌리 폴더의 이름). 매니페스트가 맞지 않으면 null */
  namespace: string | null;
  /** 스킬을 찾는 폴더(경로 차례) */
  skillRoots: string[];
  /** MCP 서버의 선언(이름 차례). 정의는 메모리에서만 쓴다 */
  mcpServers: { name: string; definition: Json }[];
  /** MCP 정의가 든 파일이 있는데 읽지 못했거나 풀리지 않았다 */
  mcpUnreadable: boolean;
}

const PLUGIN_NAME = /^[A-Za-z0-9_.-]+$/;
const MARKET_NAME = /^[A-Za-z0-9_-]+$/;

/** 설치 ID의 꼴(공개 소스 core-plugin-common/src/plugin_id.rs). 마지막 @로 나누고, 이름은 ASCII 글자·숫자·_·-·.(점은 앞뒤와 연달아 금지), 마켓은 ASCII 글자·숫자·_·-다 */
export function codexPluginIdValid(id: string): boolean {
  const at = id.lastIndexOf("@");
  if (at <= 0 || at === id.length - 1) return false;
  const name = id.slice(0, at);
  const market = id.slice(at + 1);
  if (!PLUGIN_NAME.test(name) || name.startsWith(".") || name.endsWith(".") || name.includes("..")) return false;
  return MARKET_NAME.test(market);
}

const VERSION_SEGMENT = /^[A-Za-z0-9_.+-]+$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const cmpText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpBig = (a: string, b: string): number => {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

/** SemVer의 pre-release 차례. 없는 쪽이 높고, 식별자마다 숫자끼리는 수로, 숫자는 글자보다 낮고, 글자끼리는 글자로, 앞이 같으면 짧은 쪽이 낮다 */
function cmpPre(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
  const xs = a.split(".");
  const ys = b.split(".");
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    const order = xn && yn ? cmpBig(x, y) : xn ? -1 : yn ? 1 : cmpText(x, y);
    if (order !== 0) return order;
  }
  return xs.length - ys.length;
}

/** 버전 폴더의 차례(공개 소스 installed.rs의 compare_plugin_versions). 둘 다 SemVer 꼴이면 SemVer의 차례이고(빌드 꼬리는 글자로), 아니면 글자의 차례다 */
export function compareCodexPluginVersions(a: string, b: string): number {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (x === null || y === null) return cmpText(a, b);
  for (let i = 1; i <= 3; i++) {
    const order = cmpBig(x[i]!, y[i]!);
    if (order !== 0) return order;
  }
  return cmpPre(x[4], y[4]) || cmpText(x[5] ?? "", y[5] ?? "");
}

/** 놓인 곳. 버전 폴더는 이름이 맞는 일반 폴더(링크 아님)이고, local이 있으면 그것, 없으면 가장 높은 버전이다(공개 소스 active_plugin_version) */
async function installRoot(base: string): Promise<{ install: CodexPluginRead["install"]; root: string | null }> {
  const listing = await listDir(base);
  if (listing.status === "unreadable") return { install: "unreadable", root: null };
  if (listing.status !== "ok") return { install: "missing", root: null };
  const versions: string[] = [];
  for (const name of listing.names) {
    if (name === "." || name === ".." || !VERSION_SEGMENT.test(name)) continue;
    const info = await entryInfo(join(base, name));
    if (info.isDir && !info.isLink) versions.push(name);
  }
  if (versions.length === 0) return { install: "missing", root: null };
  const chosen = versions.includes("local") ? "local" : versions.reduce((best, version) => (compareCodexPluginVersions(version, best) > 0 ? version : best));
  return { install: "ok", root: join(base, chosen) };
}

type ManifestFind = { status: "missing" | "unreadable" } | { status: "found"; path: string; agent: boolean };

/** 매니페스트 자리(공개 소스 utils/plugins의 find_plugin_manifest_path). 자리가 링크이거나 일반 파일이 아니면 그 뒤를 보지 않고 없다고 본다 */
async function findManifest(root: string): Promise<ManifestFind> {
  const own = async (path: string): Promise<{ kind: "none" | "file" | "dir" | "other" } | null> => {
    try {
      const info = await lstat(path);
      return { kind: info.isSymbolicLink() ? "other" : info.isFile() ? "file" : info.isDirectory() ? "dir" : "other" };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "none" } : null;
    }
  };
  const agentPath = join(root, "plugin.json");
  const agent = await own(agentPath);
  if (agent === null) return { status: "unreadable" };
  if (agent.kind === "dir" || agent.kind === "other") return { status: "missing" };
  if (agent.kind === "file") {
    const read = await readText(agentPath);
    if (read.status === "unreadable") return { status: "unreadable" };
    if (read.status === "ok") {
      try {
        const value = JSON.parse(read.text) as unknown;
        if (isObject(value) && typeof value.$schema === "string" && value.$schema.startsWith("https://agent-plugins.org/schemas/")) return { status: "found", path: agentPath, agent: true };
      } catch {
        // 풀리지 않는 뿌리의 plugin.json은 다른 도구의 파일로 보고 다음 자리를 본다
      }
    }
  }
  for (const relativePath of CODEX_MANIFEST_PATHS) {
    const [dir, file] = relativePath.split("/") as [string, string];
    const parent = await own(join(root, dir));
    if (parent === null) return { status: "unreadable" };
    if (parent.kind === "none") continue;
    if (parent.kind !== "dir") return { status: "missing" };
    const path = join(root, dir, file);
    const manifest = await own(path);
    if (manifest === null) return { status: "unreadable" };
    if (manifest.kind === "none") continue;
    return manifest.kind === "file" ? { status: "found", path, agent: false } : { status: "missing" };
  }
  return { status: "missing" };
}

/** 매니페스트의 경로 하나를 플러그인 뿌리 아래로 푼다. ./로 시작하고 그것만이 아니며 ..와 절대 경로가 없어야 한다(공개 소스 manifest.rs의 resolve_manifest_path) */
function manifestPath(root: string, raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("./")) return null;
  const rest = raw.slice(2);
  if (rest === "" || rest.split(/[\\/]/).includes("..") || rest.startsWith("/") || rest.startsWith("\\") || /^[A-Za-z]:/.test(rest)) return null;
  const resolved = resolve(root, rest);
  const inside = relative(root, resolved);
  return inside !== "" && !inside.startsWith("..") && !inside.startsWith(sep) ? resolved : null;
}

/** MCP 정의 묶음에서 서버를 꺼낸다. mcpServers가 묶음이면 그 안이고, 아니면 묶음 전체가 서버 이름의 묶음이다. 정의가 묶음이 아닌 서버는 버린다 */
function serversOf(value: Json): { name: string; definition: Json }[] {
  const map = isObject(value.mcpServers) ? value.mcpServers : value;
  return Object.entries(map)
    .filter((entry): entry is [string, Json] => isObject(entry[1]))
    .map(([name, definition]) => ({ name, definition }))
    .sort((a, b) => cmpText(a.name, b.name));
}

export async function readCodexPlugin(codexHome: string, id: string): Promise<CodexPluginRead> {
  const out: CodexPluginRead = { id, idValid: codexPluginIdValid(id), root: null, install: "missing", manifest: "missing", namespace: null, skillRoots: [], mcpServers: [], mcpUnreadable: false };
  if (!out.idValid) return out;
  const at = id.lastIndexOf("@");
  const located = await installRoot(join(codexHome, "plugins", "cache", id.slice(at + 1), id.slice(0, at)));
  out.install = located.install;
  out.root = located.root;
  if (located.root === null) return out;
  const root = located.root;
  const found = await findManifest(root);
  if (found.status !== "found") {
    out.manifest = found.status;
    return out;
  }
  const read = await readText(found.path);
  if (read.status !== "ok") {
    out.manifest = read.status;
    return out;
  }
  let manifest: Json;
  try {
    const value = JSON.parse(read.text) as unknown;
    if (!isObject(value)) throw new Error("묶음이 아니다");
    manifest = value;
  } catch {
    out.manifest = "unparsable";
    return out;
  }
  const rawName = manifest.name ?? "";
  if (typeof rawName !== "string") {
    out.manifest = "unparsable";
    return out;
  }
  out.manifest = "ok";
  out.namespace = rawName.trim() === "" ? (root.split(/[\\/]/).pop() ?? rawName) : rawName;

  // 스킬을 찾는 폴더. 매니페스트의 skills 가운데 맞는 경로이고, 없으면 skills/(폴더일 때)다. 매니페스트 폴더를 쓰는 형식이면 옮겨 둔 명령 스킬 폴더를 더한다(공개 소스 loader.rs의 plugin_skill_roots)
  const listed = typeof manifest.skills === "string" ? [manifest.skills] : Array.isArray(manifest.skills) ? manifest.skills : [];
  const declared = listed.map((raw) => manifestPath(root, raw)).filter((path): path is string => path !== null);
  const roots = declared.length > 0 ? declared : (await entryInfo(join(root, "skills"))).isDir ? [join(root, "skills")] : [];
  if (!found.agent && (await entryInfo(join(root, ".codex-plugin", "migrated-command-skills"))).isDir) roots.push(join(root, ".codex-plugin", "migrated-command-skills"));
  out.skillRoots = [...new Set(roots)].sort();

  // MCP 정의. 인라인 묶음이면 그것만 쓰고, 아니면 매니페스트가 가리키는 파일이나 기본 .mcp.json이다(공개 소스 loader.rs의 load_plugin_mcp_servers_from_manifest_with_format)
  if (isObject(manifest.mcpServers)) {
    out.mcpServers = serversOf({ mcpServers: manifest.mcpServers });
    return out;
  }
  const declaredFile = manifestPath(root, manifest.mcpServers);
  const file = declaredFile ?? ((await entryInfo(join(root, ".mcp.json"))).isFile ? join(root, ".mcp.json") : null);
  if (file === null) return out;
  const text = await readText(file);
  if (text.status === "missing") return out;
  if (text.status === "unreadable") {
    out.mcpUnreadable = true;
    return out;
  }
  try {
    const value = JSON.parse(text.text) as unknown;
    if (!isObject(value)) throw new Error("묶음이 아니다");
    out.mcpServers = serversOf(value);
  } catch {
    out.mcpUnreadable = true;
  }
  return out;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/codex-plugins.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 14개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/codex-plugins.test.ts src/scan/codex-plugins.ts
git commit -m "feat: Codex 플러그인의 놓인 곳과 구성을 읽음"
```

---

### Task 6: Codex MCP 서버 합치기

**Files:**
- Create: `src/scan/codex-mcp.ts`
- Test: `test/scan/codex-mcp.test.ts`

**Interfaces:**
- Consumes: 과제 1의 `isTable`, `tomlToJson`, `mergeCodexLayers`(시험), `parseCodexConfig`(시험). 2단계의 `definitionHash`(`src/scan/mcp.ts`), `McpFact`(`src/scan/types.ts`).
- Produces: `CodexMcpContext`(`projectRoot`, `merged`, `plugins`), `CodexMcpInput`(`user`, `projects`, `contexts`, `pluginServers`, `salt`), `codexMcpFacts(input)`(정체 열쇠를 붙이기 전의 서버 사실)(`src/scan/codex-mcp.ts`). 과제 7이 쓴다.

「5단계 2부 계획 전 결정」 7번이다.

- 사용자 층에만 있는 이름은 사용자 범위이고, 신뢰한 프로젝트 층에 있는 이름은 그 프로젝트의 범위다(사용자 층의 같은 이름을 덮은 것도 든다). 프로젝트 범위의 정의는 그 프로젝트 맥락에서 합친 것이다.
- 한 맥락에서 같은 이름의 서버는 하나만 쓰인다. 설정의 서버가 플러그인의 서버를 이기고(꺼져 있어도 이긴다), 플러그인끼리는 ID의 사전순으로 앞선 것이 이기며, 이긴 등록이 꺼져 있으면 그 이름이 꺼진다(공개 소스 `codex-mcp/src/catalog.rs`의 `RegistrationPrecedence`). 플러그인 서버는 그 맥락의 `[plugins."<ID>".mcp_servers.<서버>]` 묶음이 있으면 그 `enabled`(없으면 참)가 선언을 대신한다(공개 소스 `apply_plugin_mcp_server_policy`). 서버 사실 하나는 어느 맥락에서든 이기고 켜져 있으면 켜진 것이다.
- 정의의 지문은 정의에서 `enabled`를 뺀 전부를 `tomlToJson`으로 바꿔 2단계의 `definitionHash`(이 PC의 무작위 값을 섞은 HMAC)로 만든다. 켜고 끈 것은 정의가 아니라서 서버 끄기를 되돌려도 같은 설치로 이어진다. 기록의 이름 꼴은 이름 하나다(`McpToolCall`의 `server`는 설정의 이름이나 플러그인의 선언 이름 그대로다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/codex-mcp.test.ts`(새 파일):

```ts
// Codex MCP 서버를 맥락마다 합쳐 서버 사실로 내는지 시험한다. 설정의 서버가 플러그인의 서버를 이기고, 플러그인끼리는 ID의 사전순으로 앞선 것이 이기며, 이긴 등록이 꺼지면 그 이름이 꺼지고, 지문은 enabled를 뺀 정의로 만든다(설계 「5단계 2부 계획 전 결정」 7번)
import { describe, expect, it } from "vitest";
import { mergeCodexLayers, parseCodexConfig, type TomlTable } from "../../src/scan/codex-config.ts";
import { codexMcpFacts, type CodexMcpInput } from "../../src/scan/codex-mcp.ts";

const SALT = "3c".repeat(32);
const doc = (text: string): TomlTable => {
  const value = parseCodexConfig(text);
  if (value === null) throw new Error("풀리지 않았다");
  return value;
};

/** 사용자 층과 신뢰한 프로젝트 층으로 입력을 만든다. 플러그인은 맥락마다 켜진 것을 준다 */
function input(user: TomlTable, projects: { normRoot: string; layer: TomlTable; plugins?: string[] }[], globalPlugins: string[], pluginServers: Record<string, { name: string; definition: Record<string, unknown> }[]>): CodexMcpInput {
  return {
    user,
    projects: projects.map(({ normRoot, layer }) => ({ normRoot, layer })),
    contexts: [
      { projectRoot: null, merged: user, plugins: globalPlugins },
      ...projects.map(({ normRoot, layer, plugins }) => ({ projectRoot: normRoot, merged: mergeCodexLayers([user, layer]), plugins: plugins ?? globalPlugins })),
    ],
    pluginServers: new Map(Object.entries(pluginServers)),
    salt: SALT,
  };
}

const view = (facts: ReturnType<typeof codexMcpFacts>): [string, string, string | null, string | null, boolean][] => facts.map((f) => [f.scope, f.name, f.projectRoot, f.pluginId, f.enabled]);

describe("codexMcpFacts의 설정 서버", () => {
  it("사용자 층의 서버는 사용자 범위이고, enabled가 거짓일 때만 꺼져 있다", () => {
    const facts = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\n[mcp_servers.b]\ncommand = "y"\nenabled = false\n'), [], [], {}));
    expect(view(facts)).toEqual([
      ["user", "a", null, null, true],
      ["user", "b", null, null, false],
    ]);
    expect(facts.map((f) => f.recordNames)).toEqual([["a"], ["b"]]);
    expect(facts.every((f) => f.definitionHash !== null && !f.managedFixed)).toBe(true);
  });

  it("신뢰한 프로젝트 층에 있는 이름은 그 프로젝트 범위이고 정의는 사용자 층 위에 합친 것이다", () => {
    const user = doc('[mcp_servers.a]\ncommand = "x"\nargs = ["1"]\n');
    const facts = codexMcpFacts(input(user, [{ normRoot: "c:/work/p", layer: doc('[mcp_servers.a]\nargs = ["2"]\n[mcp_servers.only]\nurl = "https://e.test"\nenabled = false\n') }], [], {}));
    expect(view(facts)).toEqual([
      ["user", "a", null, null, true],
      ["project", "a", "c:/work/p", null, true],
      ["project", "only", "c:/work/p", null, false],
    ]);
    // 합친 정의의 지문은 사용자 층의 것과 다르고, 같은 정의를 따로 적은 것과 같다
    const merged = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nargs = ["2"]\n'), [], [], {}));
    expect(facts[1]!.definitionHash).not.toBe(facts[0]!.definitionHash);
    expect(facts[1]!.definitionHash).toBe(merged[0]!.definitionHash);
  });

  it("지문은 enabled를 뺀 정의로 만든다. 다른 열쇠가 다르면 지문도 다르다", () => {
    const on = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nenv = { TOKEN = "secret-1" }\n'), [], [], {}))[0]!;
    const off = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nenv = { TOKEN = "secret-1" }\nenabled = false\n'), [], [], {}))[0]!;
    const other = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nenv = { TOKEN = "secret-2" }\n'), [], [], {}))[0]!;
    const timeout = codexMcpFacts(input(doc('[mcp_servers.a]\ncommand = "x"\nenv = { TOKEN = "secret-1" }\nstartup_timeout_sec = 9223372036854775807\n'), [], [], {}))[0]!;
    expect(on.definitionHash).toBe(off.definitionHash);
    expect(on.definitionHash).not.toBe(other.definitionHash);
    expect(timeout.definitionHash).not.toBeNull();
    expect(timeout.definitionHash).not.toBe(on.definitionHash);
    expect(JSON.stringify([on, off, other, timeout])).not.toContain("secret");
  });
});

describe("codexMcpFacts의 플러그인 서버", () => {
  const server = (name: string, definition: Record<string, unknown> = { command: name }): { name: string; definition: Record<string, unknown> } => ({ name, definition });

  it("같은 이름의 설정 서버가 있으면 꺼져 있어도 플러그인의 서버를 이긴다", () => {
    const facts = codexMcpFacts(input(doc('[mcp_servers.shared]\ncommand = "x"\nenabled = false\n'), [], ["p@m"], { "p@m": [server("shared"), server("own")] }));
    expect(view(facts)).toEqual([
      ["plugin", "own", null, "p@m", true],
      ["user", "shared", null, null, false],
      ["plugin", "shared", null, "p@m", false],
    ]);
  });

  it("플러그인끼리는 ID의 사전순으로 앞선 것이 이기고, 이긴 등록이 꺼지면 그 이름이 꺼진다", () => {
    const wins = codexMcpFacts(input(doc(""), [], ["b@m", "a@m"], { "a@m": [server("s")], "b@m": [server("s")] }));
    expect(view(wins)).toEqual([
      ["plugin", "s", null, "a@m", true],
      ["plugin", "s", null, "b@m", false],
    ]);
    const vetoed = codexMcpFacts(input(doc(""), [], ["a@m", "b@m"], { "a@m": [server("s", { command: "s", enabled: false })], "b@m": [server("s")] }));
    expect(view(vetoed).map((row) => row[4])).toEqual([false, false]);
  });

  it("맥락의 [plugins.\"<ID>\".mcp_servers.<서버>] 묶음이 있으면 그 enabled(없으면 참)가 선언을 대신한다", () => {
    const user = doc('[plugins."p@m".mcp_servers.off]\ndefault_tools_approval_mode = "prompt"\n[plugins."p@m".mcp_servers.on]\nenabled = false\n');
    const facts = codexMcpFacts(input(user, [], ["p@m"], { "p@m": [server("off", { command: "x", enabled: false }), server("on", { command: "y" }), server("plain", { command: "z", enabled: false })] }));
    expect(view(facts)).toEqual([
      ["plugin", "off", null, "p@m", true],
      ["plugin", "on", null, "p@m", false],
      ["plugin", "plain", null, "p@m", false],
    ]);
  });

  it("플러그인이 켜진 맥락에서만 그 서버가 켜지고, 어느 맥락에서든 켜지면 켜진 것이다", () => {
    const user = doc("");
    const project = { normRoot: "c:/work/p", layer: doc('[mcp_servers.s]\ncommand = "local"\n'), plugins: ["p@m"] };
    // 전역에서는 플러그인이 꺼져 있고, 켜진 프로젝트에서는 설정 서버가 그 이름을 가졌다
    const shadowed = codexMcpFacts(input(user, [project], [], { "p@m": [server("s")] }));
    expect(view(shadowed)).toEqual([
      ["project", "s", "c:/work/p", null, true],
      ["plugin", "s", null, "p@m", false],
    ]);
    const other = { normRoot: "c:/work/q", layer: doc(""), plugins: ["p@m"] };
    const lit = codexMcpFacts(input(user, [project, other], [], { "p@m": [server("s")] }));
    expect(view(lit).find((row) => row[0] === "plugin")![4]).toBe(true);
  });

  it("플러그인 서버의 지문도 enabled를 뺀 선언으로 만든다", () => {
    const a = codexMcpFacts(input(doc(""), [], ["p@m"], { "p@m": [server("s", { command: "x", enabled: false })] }))[0]!;
    const b = codexMcpFacts(input(doc(""), [], ["p@m"], { "p@m": [server("s", { command: "x" })] }))[0]!;
    expect(a.definitionHash).toBe(b.definitionHash);
    expect(a.definitionHash).not.toBeNull();
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/codex-mcp.test.ts`
Expected: FAIL. `test/scan/codex-mcp.test.ts`가 `src/scan/codex-mcp.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/scan/codex-mcp.ts`(새 파일):

```ts
// Codex의 MCP 서버를 맥락마다 합쳐 서버 사실로 낸다. 설정의 서버(사용자 층과 신뢰한 프로젝트 층을 깊이 합친 것)가 플러그인의 서버를 이기고, 플러그인끼리는 ID의 사전순으로 앞선 것이 이기며, 이긴 등록이 꺼져 있으면 그 이름이 꺼진다. 정의는 enabled를 뺀 전부를 지문으로만 남긴다(설계 「5단계 2부 계획 전 결정」 7번)
import { isTable, tomlToJson, type TomlTable } from "./codex-config.ts";
import { definitionHash } from "./mcp.ts";
import type { McpFact } from "./types.ts";

type Json = Record<string, unknown>;

export interface CodexMcpContext {
  /** 전역 맥락이면 null, 신뢰한 프로젝트의 맥락이면 그 정규화한 뿌리 */
  projectRoot: string | null;
  /** 이 맥락의 합친 설정 */
  merged: TomlTable;
  /** 이 맥락에서 켜져 있고 Codex가 싣는 플러그인의 ID */
  plugins: readonly string[];
}

export interface CodexMcpInput {
  /** 사용자 층(없거나 읽지 못했으면 빈 묶음) */
  user: TomlTable;
  /** 신뢰한 프로젝트의 층 */
  projects: readonly { normRoot: string; layer: TomlTable }[];
  /** 전역 맥락과 신뢰한 프로젝트마다의 맥락 */
  contexts: readonly CodexMcpContext[];
  /** 플러그인마다 선언한 서버(구성을 아는 플러그인만) */
  pluginServers: ReadonlyMap<string, readonly { name: string; definition: Json }[]>;
  /** 상태 파일의 무작위 값(16진 64자) */
  salt: string;
}

const serversOf = (layer: TomlTable): TomlTable => (isTable(layer.mcp_servers) ? layer.mcp_servers : {});
const cmp = (a: string | null, b: string | null): number => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);
const SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 } as const;

/** enabled를 뺀 정의의 지문. 켜고 끈 것은 정의가 아니다 */
function hashOf(salt: string, definition: unknown): string | null {
  if (!isTable(definition)) return null;
  const copy = Object.create(null) as Json;
  for (const [key, value] of Object.entries(definition)) if (key !== "enabled") copy[key] = value;
  return definitionHash(salt, tomlToJson(copy) as Json);
}

/** 그 맥락에서 그 플러그인 서버가 켜져 있는지. [plugins."<ID>".mcp_servers.<서버>] 묶음이 있으면 그 enabled(없으면 참)가 선언을 대신한다(공개 소스 loader.rs의 apply_plugin_mcp_server_policy) */
function pluginServerOn(context: CodexMcpContext, id: string, name: string, declared: Json): boolean {
  const plugins = isTable(context.merged.plugins) ? context.merged.plugins : {};
  const entry = plugins[id];
  const policies = isTable(entry) && isTable(entry.mcp_servers) ? entry.mcp_servers : {};
  const policy = policies[name];
  return isTable(policy) ? policy.enabled !== false : declared.enabled !== false;
}

export function codexMcpFacts(input: CodexMcpInput): Omit<McpFact, "installKey">[] {
  const facts: Omit<McpFact, "installKey">[] = [];
  const base = { managedFixed: false } as const;
  for (const [name, definition] of Object.entries(serversOf(input.user))) {
    facts.push({ ...base, scope: "user", name, recordNames: [name], projectRoot: null, pluginId: null, definitionHash: hashOf(input.salt, definition), enabled: isTable(definition) && definition.enabled !== false });
  }
  for (const project of input.projects) {
    const context = input.contexts.find((c) => c.projectRoot === project.normRoot);
    const merged = context === undefined ? {} : serversOf(context.merged);
    for (const name of Object.keys(serversOf(project.layer))) {
      const definition = merged[name];
      facts.push({ ...base, scope: "project", name, recordNames: [name], projectRoot: project.normRoot, pluginId: null, definitionHash: hashOf(input.salt, definition), enabled: isTable(definition) && definition.enabled !== false });
    }
  }
  for (const [id, servers] of input.pluginServers) {
    for (const server of servers) {
      const enabled = input.contexts.some((context) => {
        if (!context.plugins.includes(id) || Object.hasOwn(serversOf(context.merged), server.name)) return false;
        // 그 이름을 가진 플러그인 가운데 ID의 사전순으로 앞선 것이 이긴 등록이다. 이긴 등록이 꺼져 있으면 그 이름이 꺼진다
        const winner = [...context.plugins].sort().find((other) => (input.pluginServers.get(other) ?? []).some((s) => s.name === server.name));
        return winner === id && pluginServerOn(context, id, server.name, server.definition);
      });
      facts.push({ ...base, scope: "plugin", name: server.name, recordNames: [server.name], projectRoot: null, pluginId: id, definitionHash: hashOf(input.salt, server.definition), enabled });
    }
  }
  return facts.sort((a, b) => cmp(a.name, b.name) || SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || cmp(a.projectRoot, b.projectRoot) || cmp(a.pluginId, b.pluginId) || cmp(a.definitionHash, b.definitionHash));
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/codex-mcp.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 8개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/codex-mcp.test.ts src/scan/codex-mcp.ts
git commit -m "feat: Codex MCP 서버를 맥락마다 합침"
```

---

### Task 7: Codex 셋팅 스캐너 묶기

**Files:**
- Create: `src/scan/codex.ts`
- Modify: `src/scan/claude.ts`
- Modify: `src/scan/codex-skills.ts`
- Modify: `src/scan/identity.ts`
- Modify: `src/scan/types.ts`
- Test: `test/scan/codex.test.ts`

**Interfaces:**
- Consumes: 과제 1~6의 모든 것. 2단계의 `groupProjects`, `ProjectRef`(`src/scan/projects.ts`), `emptyInstructionSet`, `SkillFact`, `McpFact`, `SetupProblem`, `FileStatus`. 1부의 `codexHome`(`src/adapters/codex/locate.ts`).
- Produces: `CodexScanInput`(`env`, `homedir`, `tmpdir`, `platform`, `cwds`, `salt`), `scanCodexSetup(input)`(`src/scan/codex.ts`). `CodexPluginFact`, `CodexProjectFact`, `CodexSetupFacts`(`src/scan/types.ts`). `codexSkillInstallKey(skill)`, `codexMcpInstallKey(server)`(`src/scan/identity.ts`). `projectNamesOf(refs)`를 내보낸다(`src/scan/claude.ts`). `scanCodexSkillRoot`가 셋째 인자로 플러그인의 이름(`namespace`)을 받는다. 과제 8·9와 3부가 쓴다.

「5단계 2부 계획 전 결정」 1·2·5~9번이다.

- 맥락은 전역(사용자 층)과, 신뢰한 프로젝트마다(사용자 층 위에 그 프로젝트의 `.codex/config.toml`)다. 프로젝트 층은 TOML로 풀리는지만 보고, 값의 종류와 전송은 사용자 층과 합친 것으로 본다. 프로젝트 층은 사용자 층의 서버를 일부만 다시 적을 수 있고(`args`만), Codex도 합친 설정을 검사하기 때문이다. 합친 것이 맞지 않으면 그 프로젝트의 설정을 풀리지 않는 것으로 본다. `.codex`가 Codex 홈과 같은 폴더면 프로젝트 층이 아니다.
- 지침은 과제 3이고, 신뢰하지 않는다고 적힌 프로젝트와 합친 한도가 0인 프로젝트는 프로젝트 지침을 읽지 않는다. fallback 이름은 그 맥락의 합친 설정의 것이다.
- 스킬을 찾는 곳은 사용자 범위가 `<Codex 홈>/skills`(옛 위치)와 `<홈>/.agents/skills`이고, 저장소 범위가 프로젝트 뿌리의 `.agents/skills`와 `.codex/skills`(신뢰와 상관없다)이며, 플러그인 범위가 켜진 플러그인의 스킬 폴더다. 플러그인의 스킬은 안쪽의 매니페스트를 보지 않고 그 플러그인의 이름을 붙인다(공개 소스 `loader/namespace.rs`의 `with_provided_namespace`). 켜짐은 사용자 층의 `[[skills.config]]`만 차례대로 보아 맞는 마지막 항목의 값이다(`path`는 `SKILL.md`의 실제 경로로, `name`은 최종 이름 그대로 견준다. 공개 소스 `config/src/skills_config.rs`).
- 플러그인은 사용자 층과 신뢰한 프로젝트 층의 항목마다 낸다. 맥락마다 설정으로 켜져 있고(`enabled`, 없으면 `[plugins._default]`의 `enabled`, 그것도 없으면 참. `[features]`의 `plugins`가 거짓이면 모두 꺼짐) Codex가 싣는 것(과제 5)이 그 맥락의 켜진 플러그인이다.
- 문제(S3의 재료)의 위치는 Codex 홈 아래가 `~/.codex/…`(홈을 `CODEX_HOME`으로 옮겼으면 `$CODEX_HOME/…`), 홈의 `.agents` 아래가 `~/.agents/…`, 프로젝트의 것이 `<프로젝트 이름>/…`이다. 프로젝트 이름은 2단계 스캐너의 것(`projectNamesOf`)을 그대로 써서 두 도구의 위치가 같은 이름이 되게 한다. 그 함수가 이름을 겹치지 않게 잡아 두는 앞머리에 `$CODEX_HOME`을 더한다. 플러그인 안의 것은 주인이 플러그인이고 위치가 없다(S3에 세지 않는다).
- 정체 열쇠는 도구 칸이 `codex`다. 2단계의 `skillInstallKey`와 `mcpInstallKey`는 꼴을 그대로 두고 Codex용 함수를 따로 둔다. 기존 함수에 도구 인자를 덧붙이면 `map(skillInstallKey)`처럼 넘긴 곳에서 배열 번호가 그 인자에 들어간다(이 계획을 쓰며 타입 검사가 찾았다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/codex.test.ts`(새 파일):

```ts
// Codex 셋팅 스캐너를 임시 홈 폴더로 처음부터 끝까지 시험한다. 사용자 설정과 신뢰한 프로젝트 층, 승인과 샌드박스, 지침, 스킬을 찾는 곳과 켜짐, 플러그인과 그 스킬과 서버, MCP 서버, 문제와 그 위치, 그리고 값과 글이 결과에 남지 않는지(설계 10, 「5단계 2부 계획 전 결정」)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { scanCodexSetup, type CodexScanInput } from "../../src/scan/codex.ts";
import * as fsModule from "../../src/scan/fs.ts";
import type { CodexSetupFacts } from "../../src/scan/types.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let home: string;
let codex: string;
let proj: string;
let other: string;
let input: CodexScanInput;
const SALT = "7d".repeat(32);
const skill = (name: string, extra = "description: 시험용 스킬\n"): string => `---\nname: ${name}\n${extra}---\n\n본문 글은 남지 않는다.\n`;
const quoted = (path: string): string => JSON.stringify(path);
const LONG = "모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다. ".repeat(10);

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  codex = join(home, ".codex");
  proj = join(root, "work", "proj");
  other = join(root, "work", "other");
  input = {
    env: {},
    homedir: home,
    tmpdir: join(root, "os-tmp"),
    platform: process.platform,
    cwds: [join(proj, "sub"), proj, other, home, join(root, "work", "deleted")],
    salt: SALT,
  };
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(proj, "sub", "x.txt"), "x");
  await put(join(other, ".git", "HEAD"), "ref: refs/heads/main\n");

  // 사용자 설정
  await put(
    join(codex, "config.toml"),
    [
      'approval_policy = "on-request"',
      'sandbox_mode = "workspace-write"',
      `[projects.${quoted(proj)}]`,
      'trust_level = "trusted"',
      `[projects.${quoted(other)}]`,
      'trust_level = "untrusted"',
      "[mcp_servers.ctx]",
      'command = "npx"',
      'args = ["ctx"]',
      'env = { API_TOKEN = "TOKEN-VALUE-123" }',
      "[mcp_servers.off]",
      'url = "https://off.example/mcp?key=QUERY-SECRET"',
      "enabled = false",
      '[plugins."pa@m"]',
      "enabled = true",
      '[plugins."ghost@m"]',
      "enabled = true",
      '[plugins."off@m"]',
      "enabled = false",
      "[[skills.config]]",
      'name = "old-skill"',
      "enabled = false",
      "[[skills.config]]",
      `path = ${quoted(join(home, ".agents", "skills", "legacy-path", "SKILL.md"))}`,
      "enabled = false",
    ].join("\n"),
  );
  await put(join(codex, "AGENTS.md"), `${LONG}\n${proj} 에서는 따로 정한 규칙을 따른다.\n`);

  // 사용자 스킬(새 위치와 옛 위치). .system은 보지 않는다
  const userSkills = join(home, ".agents", "skills");
  await put(join(userSkills, "active", "SKILL.md"), skill("active"));
  await put(join(userSkills, "old", "SKILL.md"), skill("old-skill"));
  await put(join(userSkills, "legacy-path", "SKILL.md"), skill("legacy-path"));
  await put(join(userSkills, "nofront", "SKILL.md"), "---\nname: nofront\n---\n");
  await put(join(root, "store", "gone", "SKILL.md"), skill("gone"));
  await linkDir(join(root, "store", "gone"), join(userSkills, "gone"));
  await removeTemp(join(root, "store", "gone"));
  await put(join(codex, "skills", "legacy", "SKILL.md"), skill("legacy"));
  await put(join(codex, "skills", ".system", "builtin", "SKILL.md"), skill("builtin"));

  // 플러그인: pa@m은 깔려 있고 켜져 있다. ghost@m은 켜져 있지만 깔려 있지 않다. off@m은 깔려 있지만 꺼져 있다
  const pa = join(codex, "plugins", "cache", "m", "pa", "1.0.0");
  await put(join(pa, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "pa" }));
  await put(join(pa, "skills", "s1", "SKILL.md"), skill("s1"));
  await put(join(pa, "skills", "broken", "SKILL.md"), "# 머리말 없음\n");
  await put(join(pa, ".mcp.json"), JSON.stringify({ mcpServers: { "pa-srv": { command: "pa", env: { SECRET: "PLUGIN-SECRET" } } } }));
  const off = join(codex, "plugins", "cache", "m", "off", "1.0.0");
  await put(join(off, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "off" }));
  await put(join(off, "skills", "hidden", "SKILL.md"), skill("hidden"));

  // 신뢰한 프로젝트: 승인 없음과 전면 해제를 함께 쓰고, ctx를 다시 적는다
  await put(join(proj, ".codex", "config.toml"), 'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n[mcp_servers.ctx]\nargs = ["ctx", "--project"]\n');
  await put(join(proj, "AGENTS.md"), "이 저장소는 npm test로 시험한다.\n");
  await put(join(proj, ".agents", "skills", "repo-skill", "SKILL.md"), skill("repo-skill"));
  await put(join(proj, ".codex", "skills", "codex-dir", "SKILL.md"), skill("codex-dir"));

  // 신뢰하지 않는다고 적힌 프로젝트: 설정은 쓰이지 않고(깨져 있어도 문제가 아니다), 지침은 실리지 않으며, .codex/skills는 실린다
  await put(join(other, ".codex", "config.toml"), "approval_policy = \n");
  await put(join(other, "AGENTS.md"), "실리지 않는 지침이다.\n");
  await put(join(other, ".codex", "skills", "x", "SKILL.md"), skill("other-skill"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await removeTemp(root);
});

const scan =(): Promise<CodexSetupFacts> => scanCodexSetup(input);
const projectFact = (facts: CodexSetupFacts, path: string) => facts.projects.find((p) => p.normRoot === normalizePath(path))!;

describe("scanCodexSetup", () => {
  it("사용자 설정, 전역 지침, 전역 맥락의 승인과 샌드박스를 낸다", async () => {
    const facts = await scan();
    expect(facts.tool).toBe("codex");
    expect(facts.home).toBe(codex);
    expect(facts.config).toBe("ok");
    expect(facts.globalInstructions.files.map((f) => f.path)).toEqual([join(codex, "AGENTS.md")]);
    expect(facts.globalInstructions.bytes).toBeGreaterThanOrEqual(200);
    expect(Object.keys(facts.globalMentions)).toEqual([normalizePath(proj)]);
    expect(facts.safety).toEqual({ approval: "on-request", sandbox: "workspace-write", permissions: null });
  });

  it("프로젝트마다 신뢰, 설정 파일의 상태, 지침, 그 맥락의 승인과 샌드박스를 낸다", async () => {
    const facts = await scan();
    const p = projectFact(facts, proj);
    expect([p.trust, p.configStatus]).toEqual(["trusted", "ok"]);
    expect(p.instructions.files.map((f) => f.path)).toEqual([join(proj, "AGENTS.md")]);
    expect(p.safety).toEqual({ approval: "never", sandbox: "danger-full-access", permissions: null });
    const o = projectFact(facts, other);
    expect([o.trust, o.configStatus, o.safety, o.instructions.files]).toEqual(["untrusted", null, null, []]);
    // 홈 폴더와 없어진 폴더는 읽지 않는다
    expect(facts.projects.map((x) => x.normRoot).sort()).toEqual([normalizePath(home), normalizePath(other), normalizePath(proj), normalizePath(join(root, "work", "deleted"))].sort());
    for (const path of [home, join(root, "work", "deleted")]) expect(projectFact(facts, path).configStatus).toBeNull();
  });

  it("스킬을 찾는 곳과 켜짐을 Codex와 같게 본다", async () => {
    const facts = await scan();
    const view = facts.skills.map((s) => [s.scope, s.name, s.enabled]);
    expect(view).toEqual(
      expect.arrayContaining([
        ["user", "active", true],
        ["user", "old-skill", false],
        ["user", "legacy-path", false],
        ["user", "legacy", true],
        ["project", "repo-skill", true],
        ["project", "codex-dir", true],
        ["project", "other-skill", true],
        ["plugin", "pa:s1", true],
      ]),
    );
    expect(facts.skills.map((s) => s.name)).not.toContain("builtin");
    expect(facts.skills.map((s) => s.name)).not.toContain("off:hidden");
    const repo = facts.skills.find((s) => s.name === "repo-skill")!;
    expect([repo.projectRoot, repo.pluginId, repo.recordNames, repo.listed, repo.hookProvided, repo.managedFixed, repo.usageLastUsedMs]).toEqual([normalizePath(proj), null, ["repo-skill"], true, false, false, null]);
    expect(facts.skills.find((s) => s.name === "pa:s1")!.pluginId).toBe("pa@m");
    expect(facts.skills.every((s) => s.installKey.includes("codex"))).toBe(true);
  });

  it("플러그인은 설정의 항목마다 내고, 켜져 있고 Codex가 싣는 것만 켜진 플러그인이다", async () => {
    const facts = await scan();
    const view = facts.plugins.map((p) => [p.id, p.configured, p.enabled, p.install, p.manifest, p.compositionKnown]);
    expect(view).toEqual([
      ["ghost@m", true, false, "missing", "missing", true],
      ["off@m", false, false, "ok", "ok", true],
      ["pa@m", true, true, "ok", "ok", true],
    ]);
    expect(facts.plugins.find((p) => p.id === "pa@m")!.skills).toEqual(["pa:broken", "pa:s1"]);
  });

  it("MCP 서버를 범위마다 내고 켜짐과 정의의 지문을 붙인다", async () => {
    const facts = await scan();
    expect(facts.mcpServers.map((s) => [s.scope, s.name, s.projectRoot, s.pluginId, s.enabled])).toEqual([
      ["user", "ctx", null, null, true],
      ["project", "ctx", normalizePath(proj), null, true],
      ["user", "off", null, null, false],
      ["plugin", "pa-srv", null, "pa@m", true],
    ]);
    expect(facts.mcpServers.every((s) => s.definitionHash !== null && s.installKey !== null && s.installKey.includes("codex"))).toBe(true);
  });

  it("사용자가 고치는 셋팅의 문제와 플러그인 안의 문제를 주인과 위치와 함께 낸다", async () => {
    const facts = await scan();
    const view = facts.problems.map((p) => [p.kind, p.owner, p.place]);
    expect(view).toEqual(
      expect.arrayContaining([
        ["noFrontmatter", "user", "~/.agents/skills/nofront"],
        ["danglingLink", "user", "~/.agents/skills/gone"],
        ["noFrontmatter", "plugin", null],
      ]),
    );
    expect(view).toHaveLength(3);
  });

  it("값과 글은 결과에 남지 않는다", async () => {
    const text = JSON.stringify(await scan());
    for (const secret of ["TOKEN-VALUE-123", "QUERY-SECRET", "PLUGIN-SECRET", "본문 글은", "모든 일은 시험을", "npm test로"]) expect(text).not.toContain(secret);
  });

  it("사용자 설정이 풀리지 않으면 문제로 내고, 그 설정에 기대는 것(신뢰, 승인, 서버, 플러그인, 스킬 끔)은 없는 것으로 본다", async () => {
    await put(join(codex, "config.toml"), "[mcp_servers.a]\nenabled = true\n");
    const facts = await scan();
    expect(facts.config).toBe("unparsable");
    expect(facts.problems.map((p) => [p.kind, p.owner, p.place])).toContainEqual(["unparsable", "user", "~/.codex/config.toml"]);
    expect(facts.safety).toEqual({ approval: null, sandbox: null, permissions: null });
    expect(projectFact(facts, proj).trust).toBeNull();
    expect(facts.mcpServers).toEqual([]);
    expect(facts.plugins).toEqual([]);
    expect(facts.skills.find((s) => s.name === "old-skill")!.enabled).toBe(true);
  });

  it("CODEX_HOME으로 옮긴 홈의 문제 위치는 그 이름으로 적는다", async () => {
    const moved = join(root, "moved-codex");
    await put(join(moved, "config.toml"), "approval_policy = \n");
    input = { ...input, env: { CODEX_HOME: moved } };
    const facts = await scan();
    expect(facts.home).toBe(moved);
    expect(facts.problems.map((p) => p.place)).toContain("$CODEX_HOME/config.toml");
  });

  it("신뢰한 프로젝트의 설정이 풀리지 않거나, 사용자 층과 합친 것이 Codex가 시작하지 못하는 꼴이면 그 프로젝트의 설정을 풀리지 않는 것으로 본다", async () => {
    await put(join(proj, ".codex", "config.toml"), '[mcp_servers.ctx]\nurl = "https://e.test"\n');
    const facts = await scan();
    const p = projectFact(facts, proj);
    expect([p.configStatus, p.safety]).toEqual(["unparsable", null]);
    expect(facts.problems.map((x) => [x.kind, x.place])).toContainEqual(["unparsable", "proj/.codex/config.toml"]);
    expect(facts.mcpServers.filter((s) => s.scope === "project")).toEqual([]);
  });

  it("[features]의 plugins가 거짓이면 플러그인을 쓰지 않는다", async () => {
    await put(join(codex, "config.toml"), '[features]\nplugins = false\n[plugins."pa@m"]\nenabled = true\n');
    const facts = await scan();
    expect(facts.plugins.map((p) => [p.id, p.configured, p.enabled])).toEqual([["pa@m", false, false]]);
    expect(facts.skills.filter((s) => s.scope === "plugin")).toEqual([]);
    expect(facts.mcpServers).toEqual([]);
  });

  it("목록을 읽지 못한 스킬 폴더가 누구의 것인지 낸다", async () => {
    expect((await scan()).unreadableSkillPlaces).toEqual({ user: false, projects: [], plugins: [] });
    const blocked = [join(codex, "skills"), join(proj, ".codex", "skills"), join(codex, "plugins", "cache", "m", "pa", "1.0.0", "skills")];
    const original = fsModule.listDir;
    vi.spyOn(fsModule, "listDir").mockImplementation(async (path) => (blocked.includes(path) ? { status: "unreadable" } : original(path)));
    const facts = await scan();
    expect(facts.unreadableSkillPlaces).toEqual({ user: true, projects: [normalizePath(proj)], plugins: ["pa@m"] });
    expect(facts.unreadableDirs).toEqual([...blocked].sort());
    expect(facts.skills.map((s) => s.name)).not.toContain("legacy");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/codex.test.ts`
Expected: FAIL. `test/scan/codex.test.ts`가 `src/scan/codex.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/scan/claude.ts`(찾을 곳 1/2):

```ts
/** 사용자 범위 설정 문제의 위치가 시작하는 앞머리. 설정 폴더를 옮기지 않았으면 ~(~/.claude/…), 옮겼으면 환경 변수의 이름이다 */
const USER_PLACE_HEADS = ["~", "$CLAUDE_CONFIG_DIR"];
```

`src/scan/claude.ts`(바꾼 뒤 1/2):

```ts
/** 사용자 범위 설정 문제의 위치가 시작하는 앞머리. 설정 폴더를 옮기지 않았으면 ~(~/.claude/…, ~/.codex/…), 옮겼으면 환경 변수의 이름이다. Codex 스캐너도 같은 이름 함수를 쓴다 */
const USER_PLACE_HEADS = ["~", "$CLAUDE_CONFIG_DIR", "$CODEX_HOME"];
```

`src/scan/claude.ts`(찾을 곳 2/2):

```ts
function projectNamesOf(refs: readonly { root: string; normRoot: string; exists: boolean; excluded: boolean }[]): Map<string, string> {
```

`src/scan/claude.ts`(바꾼 뒤 2/2):

```ts
export function projectNamesOf(refs: readonly { root: string; normRoot: string; exists: boolean; excluded: boolean }[]): Map<string, string> {
```

`src/scan/codex-skills.ts`(찾을 곳 1/3):

```ts
/** 찾는 곳 하나를 훑는다. 스킬은 찾은 차례(폴더를 넓이 차례로, 폴더 안은 이름 차례)다 */
export async function scanCodexSkillRoot(root: string, limits: CodexSkillScanLimits = LIMITS): Promise<CodexSkillRootScan> {
```

`src/scan/codex-skills.ts`(바꾼 뒤 1/3):

```ts
/**
 * 찾는 곳 하나를 훑는다. 스킬은 찾은 차례(폴더를 넓이 차례로, 폴더 안은 이름 차례)다. 플러그인의 스킬을 찾는 폴더는 그 플러그인의 이름(namespace)을 주고,
 * 그때는 안쪽의 매니페스트를 보지 않고 그 이름을 붙인다(공개 소스 loader/namespace.rs의 with_provided_namespace)
 */
export async function scanCodexSkillRoot(root: string, limits: CodexSkillScanLimits = LIMITS, namespace: string | null = null): Promise<CodexSkillRootScan> {
```

`src/scan/codex-skills.ts`(찾을 곳 2/3):

```ts
    const namespace = await namespaceOf(dir);
```

`src/scan/codex-skills.ts`(바꾼 뒤 2/3):

```ts
    const prefix = namespace ?? (await namespaceOf(dir));
```

`src/scan/codex-skills.ts`(찾을 곳 3/3):

```ts
      name: namespace === null ? base : `${namespace}:${base}`,
```

`src/scan/codex-skills.ts`(바꾼 뒤 3/3):

```ts
      name: prefix === null ? base : `${prefix}:${base}`,
```

`src/scan/codex.ts`(새 파일):

```ts
// Codex의 지금 셋팅을 읽어 셋팅 사실로 낸다. 사용자 설정과 신뢰한 프로젝트 층, 승인과 샌드박스, 지침, 스킬, 플러그인, MCP 서버를 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 10, 「5단계 2부 계획 전 결정」)
import { isAbsolute, join, relative, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { codexHome } from "../adapters/codex/locate.ts";
import { projectNamesOf } from "./claude.ts";
import { codexConfigShapeOk, isTable, mergeCodexLayers, parseCodexConfig, readCodexConfig, type TomlTable } from "./codex-config.ts";
import { readCodexGlobalInstructions, readCodexProjectInstructions } from "./codex-instructions.ts";
import { codexMcpFacts, type CodexMcpContext } from "./codex-mcp.ts";
import { readCodexPlugin, type CodexPluginRead } from "./codex-plugins.ts";
import { fallbackNames, pluginsFeatureOn, projectDocDisabled, safetyOf, trustOf, type CodexSafetyFact } from "./codex-settings.ts";
import { scanCodexSkillRoot, type CodexSkillRootScan } from "./codex-skills.ts";
import { entryInfo, readText } from "./fs.ts";
import { codexMcpInstallKey, codexSkillInstallKey } from "./identity.ts";
import { emptyInstructionSet } from "./instructions.ts";
import { groupProjects, type ProjectRef } from "./projects.ts";
import type { CodexPluginFact, CodexProjectFact, CodexSetupFacts, FileStatus, SetupProblem, SkillFact } from "./types.ts";

export interface CodexScanInput {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 수집 구간에 응답이 있는 주 세션의 작업 폴더(두 도구를 합친 것, 설계 10 「프로젝트 목록」) */
  cwds: readonly string[];
  /** 상태 파일의 무작위 값(16진 64자) */
  salt: string;
}

/** 실제 경로를 붙이기 전의 문제. 주인에 따라 위치가 있거나 없다 */
type ProblemDraft = SetupProblem extends infer P ? (P extends SetupProblem ? Omit<P, "realPath"> : never) : never;
const slashed = (path: string): string => path.replace(/\\/g, "/");
const cmp = (a: string | null, b: string | null): number => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);
const SKILL_SCOPE_ORDER = { user: 0, project: 1, plugin: 2 } as const;
const OWNER_ORDER = { user: 0, managed: 1, plugin: 2, tool: 3 } as const;

interface SkillRule {
  /** SKILL.md의 실제 경로(정규화) */
  path: string | null;
  name: string | null;
  enabled: boolean;
}

/** [[skills.config]]의 path. ~, ~/, ~\로 시작하면 홈으로 풀고, 상대 경로면 설정 파일의 폴더(Codex 홈)에서 풀며, 링크를 풀어 견준다(공개 소스 utils/absolute-path) */
async function rulePath(raw: string, home: string, homedir: string): Promise<string> {
  const expanded = raw === "~" ? homedir : raw.startsWith("~/") || raw.startsWith("~\\") ? join(homedir, raw.slice(2)) : raw;
  const absolute = isAbsolute(expanded) ? expanded : resolve(home, expanded);
  return (await entryInfo(absolute)).realPath ?? normalizePath(absolute);
}

/** 사용자 층의 [[skills.config]] 규칙(차례대로). path와 name 가운데 정확히 하나가 있고 name이 비지 않은 항목만 쓴다(공개 소스 config/src/skills_config.rs) */
async function skillRules(user: TomlTable, home: string, homedir: string): Promise<SkillRule[]> {
  const skills = isTable(user.skills) ? user.skills : {};
  const list = Array.isArray(skills.config) ? skills.config : [];
  const rules: SkillRule[] = [];
  for (const entry of list) {
    if (!isTable(entry) || typeof entry.enabled !== "boolean") continue;
    const path = typeof entry.path === "string" ? entry.path : null;
    const name = typeof entry.name === "string" ? entry.name.trim() : null;
    if ((path === null) === (name === null) || name === "") continue;
    rules.push({ path: path === null ? null : await rulePath(path, home, homedir), name, enabled: entry.enabled });
  }
  return rules;
}

/** 규칙을 차례대로 보아 그 스킬에 맞는 마지막 규칙의 값이다. 맞는 것이 없으면 켜져 있다 */
function enabledByRules(rules: readonly SkillRule[], skillFile: string | null, name: string): boolean {
  let enabled = true;
  for (const rule of rules) if ((rule.path !== null && rule.path === skillFile) || (rule.name !== null && rule.name === name)) enabled = rule.enabled;
  return enabled;
}

/** 그 맥락의 설정으로 플러그인이 켜져 있는지. [features]의 plugins가 거짓이면 모두 꺼지고, 항목의 enabled(없으면 [plugins._default]의 enabled, 그것도 없으면 참)다 */
function configuredIn(merged: TomlTable, id: string): boolean {
  if (!pluginsFeatureOn(merged)) return false;
  const plugins = isTable(merged.plugins) ? merged.plugins : {};
  const entry = plugins[id];
  if (!isTable(entry) || entry.enabled === false) return false;
  const fallback = plugins._default;
  return entry.enabled !== undefined || !isTable(fallback) || fallback.enabled !== false;
}

const loadable = (plugin: CodexPluginRead): boolean => plugin.idValid && plugin.install === "ok" && plugin.manifest === "ok";

export async function scanCodexSetup(input: CodexScanInput): Promise<CodexSetupFacts> {
  const home = codexHome(input.env, input.homedir);
  const userFile = join(home, "config.toml");
  const userRead = await readCodexConfig(userFile);
  const user: TomlTable = userRead.status === "ok" ? userRead.value : {};
  const problems: ProblemDraft[] = [];
  const codexPlace = (path: string): string => `${input.env.CODEX_HOME?.trim() ? "$CODEX_HOME" : "~/.codex"}/${slashed(relative(home, path))}`;
  const homePlace = (path: string): string => `~/${slashed(relative(input.homedir, path))}`;
  if (userRead.status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: userFile, place: codexPlace(userFile) });

  // 프로젝트와 맥락. 신뢰한 프로젝트의 층만 사용자 층 위에 얹는다(「5단계 2부 계획 전 결정」 1·2번)
  const refs = await groupProjects(input.cwds, { homedir: input.homedir, tmpdir: input.tmpdir, platform: input.platform });
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  const projectNames = projectNamesOf(refs);
  const projectPlace = (ref: ProjectRef, path: string): string => `${projectNames.get(ref.normRoot)!}/${slashed(relative(ref.root, path))}`;
  const homeReal = (await entryInfo(home)).realPath ?? normalizePath(home);
  const sameAsHome = async (dir: string): Promise<boolean> => normalizePath(dir) === normalizePath(home) || (await entryInfo(dir)).realPath === homeReal;
  const contexts: CodexMcpContext[] = [{ projectRoot: null, merged: user, plugins: [] }];
  const trustedLayers: { normRoot: string; layer: TomlTable }[] = [];
  const perProject = new Map<string, { status: FileStatus | null; merged: TomlTable; safety: CodexSafetyFact | null }>();
  for (const ref of active) {
    const trust = trustOf(user, ref.normRoot, input.platform);
    if (trust !== "trusted" || (await sameAsHome(join(ref.root, ".codex")))) {
      perProject.set(ref.normRoot, { status: null, merged: user, safety: null });
      continue;
    }
    // 프로젝트 층은 TOML로 풀리는지만 보고, 값의 종류와 전송은 사용자 층과 합친 것으로 본다. 프로젝트 층은 사용자 층의 서버를 일부만 다시 적을 수 있고(예. args만), Codex도 합친 설정을 검사한다
    const file = join(ref.root, ".codex", "config.toml");
    const text = await readText(file);
    const layer = text.status === "ok" ? parseCodexConfig(text.text) : null;
    let status: FileStatus = text.status === "ok" ? (layer === null ? "unparsable" : "ok") : text.status;
    let merged = user;
    if (layer !== null) {
      merged = mergeCodexLayers([user, layer]);
      // 합친 것이 Codex가 시작하지 못하는 꼴이면(예. 사용자 층의 command 위에 url) 그 프로젝트의 설정을 풀리지 않는 것으로 본다
      if (!codexConfigShapeOk(merged)) {
        status = "unparsable";
        merged = user;
      }
    }
    if (status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: file, place: projectPlace(ref, file) });
    const readable = status === "ok" || status === "missing";
    perProject.set(ref.normRoot, { status, merged, safety: readable ? safetyOf(merged) : null });
    if (!readable) continue;
    contexts.push({ projectRoot: ref.normRoot, merged, plugins: [] });
    if (status === "ok" && layer !== null) trustedLayers.push({ normRoot: ref.normRoot, layer });
  }

  // 플러그인. 후보는 사용자 층과 신뢰한 프로젝트 층의 항목이다. 맥락마다 설정으로 켜져 있고 Codex가 싣는 것이 그 맥락의 켜진 플러그인이다
  const ids = new Set<string>();
  for (const layer of [user, ...trustedLayers.map((p) => p.layer)]) if (isTable(layer.plugins)) for (const id of Object.keys(layer.plugins)) if (id !== "_default") ids.add(id);
  const reads: CodexPluginRead[] = [];
  for (const id of [...ids].sort()) reads.push(await readCodexPlugin(home, id));
  for (const context of contexts) context.plugins = reads.filter((plugin) => loadable(plugin) && configuredIn(context.merged, plugin.id)).map((plugin) => plugin.id);
  const enabledIds = new Set(contexts.flatMap((context) => context.plugins));

  // 스킬. 사용자 범위(Codex 홈의 옛 위치, 홈의 .agents), 저장소 범위(프로젝트 뿌리의 .agents와 .codex. 신뢰와 상관없다), 켜진 플러그인(「5단계 2부 계획 전 결정」 6번)
  const rules = await skillRules(user, home, input.homedir);
  const skills: Omit<SkillFact, "installKey">[] = [];
  const unreadableDirs: string[] = [];
  const unreadableSkillPlaces: CodexSetupFacts["unreadableSkillPlaces"] = { user: false, projects: [], plugins: [] };
  const pluginSkillNames = new Map<string, string[]>();
  const addScan = (where: string, scan: CodexSkillRootScan, place: ((path: string) => string) | null, owner: { scope: "user" } | { scope: "project"; projectRoot: string } | { scope: "plugin"; pluginId: string }): void => {
    const blocked = [...scan.unreadableDirs, ...(scan.truncated ? [where] : [])];
    unreadableDirs.push(...blocked);
    if (blocked.length > 0) {
      if (owner.scope === "user") unreadableSkillPlaces.user = true;
      else if (owner.scope === "project") unreadableSkillPlaces.projects.push(owner.projectRoot);
      else unreadableSkillPlaces.plugins.push(owner.pluginId);
    }
    const problem = (kind: "noFrontmatter" | "danglingLink", path: string): void => {
      problems.push(place === null ? { kind, owner: "plugin", path, place: null } : { kind, owner: "user", path, place: place(path) });
    };
    for (const path of scan.danglingLinks) problem("danglingLink", path);
    for (const found of scan.skills) {
      if (found.folder.readable && !found.frontmatterOk) problem("noFrontmatter", found.folder.path);
      const enabled = enabledByRules(rules, found.skillFileRealPath, found.name);
      skills.push({
        scope: owner.scope,
        name: found.name,
        recordNames: [found.name],
        path: found.folder.path,
        realPath: found.folder.realPath,
        isLink: found.viaLink,
        contentHash: found.folder.contentHash,
        createdMs: found.folder.createdMs,
        targetCreatedMs: found.folder.targetCreatedMs,
        projectRoot: owner.scope === "project" ? owner.projectRoot : null,
        pluginId: owner.scope === "plugin" ? owner.pluginId : null,
        enabled,
        listed: enabled,
        readable: found.folder.readable,
        nameUnreadable: found.folder.nameUnreadable,
        managedFixed: false,
        hookProvided: false,
        usageLastUsedMs: null,
        usageUndated: false,
      });
      if (owner.scope === "plugin") pluginSkillNames.set(owner.pluginId, [...(pluginSkillNames.get(owner.pluginId) ?? []), found.name]);
    }
  };
  const userRoots = [
    { dir: join(home, "skills"), place: codexPlace },
    { dir: join(input.homedir, ".agents", "skills"), place: homePlace },
  ].filter((root, index, all) => all.findIndex((other) => normalizePath(other.dir) === normalizePath(root.dir)) === index);
  for (const root of userRoots) addScan(root.dir, await scanCodexSkillRoot(root.dir), root.place, { scope: "user" });
  for (const ref of active) {
    const dirs = [join(ref.root, ".agents", "skills")];
    if (!(await sameAsHome(join(ref.root, ".codex")))) dirs.push(join(ref.root, ".codex", "skills"));
    for (const dir of dirs) addScan(dir, await scanCodexSkillRoot(dir), (path) => projectPlace(ref, path), { scope: "project", projectRoot: ref.normRoot });
  }
  for (const plugin of reads) {
    if (!enabledIds.has(plugin.id)) continue;
    for (const dir of plugin.skillRoots) addScan(dir, await scanCodexSkillRoot(dir, undefined, plugin.namespace), null, { scope: "plugin", pluginId: plugin.id });
  }

  // MCP 서버(「5단계 2부 계획 전 결정」 7번). MCP 정의를 읽지 못한 플러그인의 서버는 세지 않는다
  const pluginServers = new Map(reads.filter((plugin) => enabledIds.has(plugin.id) && !plugin.mcpUnreadable).map((plugin) => [plugin.id, plugin.mcpServers] as const));
  const mcpServers = codexMcpFacts({ user, projects: trustedLayers, contexts, pluginServers, salt: input.salt });

  const plugins: CodexPluginFact[] = reads.map((plugin) => ({
    id: plugin.id,
    configured: contexts.some((context) => configuredIn(context.merged, plugin.id)),
    enabled: enabledIds.has(plugin.id),
    idValid: plugin.idValid,
    install: plugin.install,
    manifest: plugin.manifest,
    namespace: plugin.namespace,
    compositionKnown: plugin.install !== "unreadable" && plugin.manifest !== "unreadable",
    mcpUnreadable: plugin.mcpUnreadable,
    skills: (pluginSkillNames.get(plugin.id) ?? []).sort(),
  }));

  // 지침(「5단계 2부 계획 전 결정」 5번)
  const globalRead = await readCodexGlobalInstructions(home, active);
  const projects: CodexProjectFact[] = [];
  for (const ref of refs) {
    const trust = trustOf(user, ref.normRoot, input.platform);
    const known = perProject.get(ref.normRoot);
    if (known === undefined) {
      projects.push({ normRoot: ref.normRoot, trust, configStatus: null, instructions: emptyInstructionSet(), safety: null });
      continue;
    }
    const skip = trust === "untrusted" || projectDocDisabled(known.merged);
    const instructions = skip ? emptyInstructionSet() : await readCodexProjectInstructions(ref.root, fallbackNames(known.merged, input.platform));
    projects.push({ normRoot: ref.normRoot, trust, configStatus: known.status, instructions, safety: known.safety });
  }

  skills.sort((a, b) => cmp(a.name, b.name) || SKILL_SCOPE_ORDER[a.scope] - SKILL_SCOPE_ORDER[b.scope] || cmp(normalizePath(a.path), normalizePath(b.path)) || cmp(a.pluginId, b.pluginId));
  const uniqueProblems: SetupProblem[] = [];
  for (const problem of new Map(problems.map((p) => [`${p.kind}\u0000${p.owner}\u0000${p.path}`, p])).values()) {
    uniqueProblems.push({ ...problem, realPath: (await entryInfo(problem.path)).realPath });
  }
  uniqueProblems.sort((a, b) => cmp(a.path, b.path) || cmp(a.kind, b.kind) || OWNER_ORDER[a.owner] - OWNER_ORDER[b.owner]);
  return {
    tool: "codex",
    home,
    config: userRead.status,
    globalInstructions: globalRead.set,
    globalMentions: globalRead.mentions,
    safety: safetyOf(user),
    skills: skills.map((skill) => ({ ...skill, installKey: codexSkillInstallKey(skill) })),
    mcpServers: mcpServers.map((server) => ({ ...server, installKey: codexMcpInstallKey(server) })),
    plugins,
    projects,
    problems: uniqueProblems,
    unreadableDirs: [...new Set(unreadableDirs)].sort(),
    unreadableSkillPlaces: { user: unreadableSkillPlaces.user, projects: [...new Set(unreadableSkillPlaces.projects)].sort(), plugins: [...new Set(unreadableSkillPlaces.plugins)].sort() },
  };
}
```

`src/scan/identity.ts`(찾을 곳 1/3):

```ts
// 셋팅 사실에서 설치마다의 정체 열쇠를 만든다. 스킬은 (도구, 범위, 프로젝트, 이름, 링크를 푼 실제 경로), MCP 서버는 (도구, 범위, 프로젝트, 플러그인, 이름, 정의의 지문)이다. 정의의 지문이 없는 서버는 정체를 만들 수 없어 넣지 않는다(설계 11.3, 18.1)
import { join } from "node:path";
```

`src/scan/identity.ts`(바꾼 뒤 1/3):

```ts
// 셋팅 사실에서 설치마다의 정체 열쇠를 만든다. 스킬은 (도구, 범위, 프로젝트, 이름, 링크를 푼 실제 경로), MCP 서버는 (도구, 범위, 프로젝트, 플러그인, 이름, 정의의 지문)이다. 정의의 지문이 없는 서버는 정체를 만들 수 없어 넣지 않는다(설계 11.3, 18.1, 「5단계 2부 계획 전 결정」 9번)
import { join } from "node:path";
```

`src/scan/identity.ts`(찾을 곳 2/3):

```ts

export function skillInstallKey(skill: Omit<SkillFact, "installKey">): string {
  // 범위가 프로젝트이면 어느 프로젝트의 것인지도 정체다. 두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다(설계 11.3 「설치의 정체」)
  return installKey(["skill", "claude-code", skill.scope, skill.projectRoot ?? "", skill.name, skill.realPath ?? normalizePath(skill.path)]);
}
```

`src/scan/identity.ts`(바꾼 뒤 2/3):

```ts

type Tool = "claude-code" | "codex";

// 범위가 프로젝트이면 어느 프로젝트의 것인지도 정체다. 두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다(설계 11.3 「설치의 정체」)
const skillKey = (skill: Omit<SkillFact, "installKey">, tool: Tool): string => installKey(["skill", tool, skill.scope, skill.projectRoot ?? "", skill.name, skill.realPath ?? normalizePath(skill.path)]);
const mcpKey = (server: Omit<McpFact, "installKey">, tool: Tool): string | null =>
  server.definitionHash === null ? null : installKey(["mcp", tool, server.scope, server.projectRoot ?? "", server.pluginId ?? "", server.name, server.definitionHash]);

export function skillInstallKey(skill: Omit<SkillFact, "installKey">): string {
  return skillKey(skill, "claude-code");
}
```

`src/scan/identity.ts`(찾을 곳 3/3):

```ts
export function mcpInstallKey(server: Omit<McpFact, "installKey">): string | null {
  if (server.definitionHash === null) return null;
  return installKey(["mcp", "claude-code", server.scope, server.projectRoot ?? "", server.pluginId ?? "", server.name, server.definitionHash]);
}
```

`src/scan/identity.ts`(바꾼 뒤 3/3):

```ts
export function mcpInstallKey(server: Omit<McpFact, "installKey">): string | null {
  return mcpKey(server, "claude-code");
}

/** Codex 스킬의 정체 열쇠. 도구 칸이 codex다 */
export function codexSkillInstallKey(skill: Omit<SkillFact, "installKey">): string {
  return skillKey(skill, "codex");
}

/** Codex MCP 서버의 정체 열쇠. 정의의 지문이 없으면 null이다 */
export function codexMcpInstallKey(server: Omit<McpFact, "installKey">): string | null {
  return mcpKey(server, "codex");
}
```

`src/scan/types.ts`(찾을 곳 1/2):

```ts
// 셋팅 스캐너가 내는 Claude Code의 셋팅 사실. 숫자, 이름, 경로, 참거짓, 지문만 담고 설정의 값·지침의 글·훅 명령·권한 규칙의 글은 담지 않는다(설계 10, 12.1, 19.1)
import type { ShellGuard } from "./hooks.ts";
import type { InstructionSet } from "./instructions.ts";
```

`src/scan/types.ts`(바꾼 뒤 1/2):

```ts
// 셋팅 스캐너가 내는 Claude Code와 Codex의 셋팅 사실. 숫자, 이름, 경로, 참거짓, 지문만 담고 설정의 값·지침의 글·훅 명령·권한 규칙의 글은 담지 않는다(설계 10, 12.1, 19.1, 「5단계 2부 계획 전 결정」 9번)
import type { CodexSafetyFact, CodexTrust } from "./codex-settings.ts";
import type { ShellGuard } from "./hooks.ts";
import type { InstructionSet } from "./instructions.ts";
```

`src/scan/types.ts`(찾을 곳 2/2):

```ts
  unreadableSkillPlaces: { user: boolean; projects: string[]; plugins: string[] };
}
```

`src/scan/types.ts`(바꾼 뒤 2/2):

```ts
  unreadableSkillPlaces: { user: boolean; projects: string[]; plugins: string[] };
}

/** Codex 플러그인 하나. 설정(사용자 층과 신뢰한 프로젝트 층)에 항목이 있는 것마다 낸다(「5단계 2부 계획 전 결정」 8번) */
export interface CodexPluginFact {
  /** '<이름>@<마켓>' */
  id: string;
  /** 어느 맥락에서든 설정으로 켜져 있다(놓인 곳이나 매니페스트가 없어 Codex가 싣지 않아도) */
  configured: boolean;
  /** 어느 맥락에서든 설정으로 켜져 있고 Codex가 싣는다(설치 ID가 맞고, 놓인 곳과 맞는 매니페스트가 있다) */
  enabled: boolean;
  idValid: boolean;
  install: "ok" | "missing" | "unreadable";
  manifest: FileStatus;
  /** 구성 요소의 이름. 매니페스트가 맞지 않으면 null */
  namespace: string | null;
  /** 놓인 곳과 매니페스트를 읽었다(없는 것을 확인한 것도 든다). 거짓이고 configured이면 구성을 모르는 켜진 플러그인이다 */
  compositionKnown: boolean;
  /** MCP 정의가 든 파일이 있는데 읽지 못했거나 풀리지 않았다. 그 플러그인의 서버는 세지 않았다 */
  mcpUnreadable: boolean;
  /** 이 플러그인의 스킬 위치의 이름(이름 차례). 켜진 플러그인만 훑는다 */
  skills: string[];
}

/** Codex 프로젝트마다의 셋팅 사실. 프로젝트 목록과 이름은 Claude Code의 ProjectFact와 같고 정규화한 뿌리로 잇는다 */
export interface CodexProjectFact {
  normRoot: string;
  /** 사용자 설정에 적힌 신뢰(「5단계 2부 계획 전 결정」 2번) */
  trust: CodexTrust;
  /** 신뢰한 프로젝트의 .codex/config.toml의 읽기 상태. 사용자 층과 합친 것이 Codex가 시작하지 못하는 꼴이어도 unparsable이다. 신뢰한 프로젝트가 아니거나 읽지 않는 폴더면 null */
  configStatus: FileStatus | null;
  /** Codex의 프로젝트 지침. 신뢰하지 않는다고 적혔거나, 합친 한도가 0이거나, 읽지 않는 폴더면 빈 묶음이다 */
  instructions: InstructionSet;
  /** 신뢰한 프로젝트 맥락(사용자 층 위에 그 프로젝트 층)의 승인과 샌드박스. 신뢰한 프로젝트가 아니거나 그 설정을 읽지 못했으면 null */
  safety: CodexSafetyFact | null;
}

/** 셋팅 스캐너가 내는 Codex의 셋팅 사실(「5단계 2부 계획 전 결정」 9번). 스킬·서버·문제·지침의 꼴은 Claude Code와 같다 */
export interface CodexSetupFacts {
  tool: "codex";
  home: string;
  /** 사용자 config.toml의 읽기 상태 */
  config: FileStatus;
  globalInstructions: InstructionSet;
  /** 전역 지침에 목록의 프로젝트 경로나 이름이 나온 횟수(정규화한 뿌리 → 횟수) */
  globalMentions: Record<string, number>;
  /** 전역 맥락(사용자 층)의 승인과 샌드박스. 사용자 설정을 읽지 못했으면 모두 null이다 */
  safety: CodexSafetyFact;
  skills: SkillFact[];
  mcpServers: McpFact[];
  plugins: CodexPluginFact[];
  projects: CodexProjectFact[];
  problems: SetupProblem[];
  /** 목록을 읽지 못했거나 상한에 닿아 다 보지 못한 스킬 폴더 */
  unreadableDirs: string[];
  unreadableSkillPlaces: { user: boolean; projects: string[]; plugins: string[] };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/codex.test.ts test/scan/identity.test.ts test/scan/claude.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 74개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/codex.test.ts src/scan/claude.ts src/scan/codex-skills.ts src/scan/codex.ts src/scan/identity.ts src/scan/types.ts
git commit -m "feat: Codex 셋팅 스캐너를 묶음"
```

---

### Task 8: Codex 설치의 정체 열쇠와 읽지 못한 곳

**Files:**
- Modify: `test/scan/codex.test.ts`
- Modify: `src/scan/codex.ts`
- Modify: `src/scan/identity.ts`
- Modify: `src/scan/types.ts`
- Test: `test/scan/codex-identity.test.ts`

**Interfaces:**
- Consumes: 과제 7의 `CodexSetupFacts`, `codexSkillInstallKey`, `codexMcpInstallKey`, `scanCodexSetup`.
- Produces: `CodexProjectFact.scanned`(`src/scan/types.ts`), `codexInstallKeysOf(facts)`, `codexUnseenInUnreadablePlace(facts)`(`src/scan/identity.ts`). 3부가 상태 파일의 관측 기록(18.1)에 잇는다.

설계 18.1, 「5단계 2부 계획 전 결정」 9번이다.

- 관측 기록에만 있고 이번 점검에 보이지 않는 Codex 설치가 읽지 못한 곳에 든 것인지 가른다. 참이면 3부가 그 기록을 고치지 않는다. 사용자 `config.toml`을 읽지 못하면 모든 서버(신뢰와 플러그인의 항목도 그 파일에서 얻는다)와 플러그인의 스킬이다. 그 밖에는 그 프로젝트의 `.codex/config.toml`을 읽지 못한 프로젝트 범위의 서버, 구성을 모르거나 MCP 정의를 읽지 못한 플러그인의 서버, 목록을 다 읽지 못한 찾는 곳의 스킬이다. 플러그인의 스킬은 열쇠에 플러그인이 적히지 않아, 구성을 모르는 켜진 플러그인이나 스킬을 찾는 폴더를 다 읽지 못한 플러그인이 하나라도 있으면 모두로 본다.
- 스캐너가 셋팅을 읽지 않는 프로젝트(지금 PC에 없는 폴더, 프로젝트로 보지 않는 폴더)의 것은 없어진 것이다. 그래서 Codex 프로젝트 사실에 읽은 프로젝트인지(`scanned`)를 더한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/codex-identity.test.ts`(새 파일):

```ts
// Codex 셋팅 사실의 설치 열쇠 모으기와, 관측 기록에만 있고 이번 점검에 보이지 않는 Codex 설치가 읽지 못한 곳에 든 것인지 가르는 함수를 시험한다(설계 18.1, 「5단계 2부 계획 전 결정」 9번)
import { describe, expect, it } from "vitest";
import { emptyInstructionSet } from "../../src/scan/instructions.ts";
import { codexInstallKeysOf, codexMcpInstallKey, codexSkillInstallKey, codexUnseenInUnreadablePlace, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { CodexPluginFact, CodexProjectFact, CodexSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";

const P = "c:/work/p";
const Q = "c:/work/q";
const GONE = "c:/work/gone";

const skill = (scope: SkillFact["scope"], name: string, projectRoot: string | null = null, pluginId: string | null = null): Omit<SkillFact, "installKey"> => ({
  scope,
  name,
  recordNames: [name],
  path: `c:/x/${name}`,
  realPath: `c:/x/${name}`,
  isLink: false,
  contentHash: null,
  createdMs: null,
  targetCreatedMs: null,
  projectRoot,
  pluginId,
  enabled: true,
  listed: true,
  readable: true,
  nameUnreadable: false,
  managedFixed: false,
  hookProvided: false,
  usageLastUsedMs: null,
  usageUndated: false,
});
const server = (scope: McpFact["scope"], name: string, projectRoot: string | null = null, pluginId: string | null = null, definitionHash: string | null = "h"): Omit<McpFact, "installKey"> => ({
  scope,
  name,
  recordNames: [name],
  projectRoot,
  pluginId,
  definitionHash,
  enabled: true,
  managedFixed: false,
});
const plugin = (id: string, extra: Partial<CodexPluginFact> = {}): CodexPluginFact => ({ id, configured: true, enabled: true, idValid: true, install: "ok", manifest: "ok", namespace: id.split("@")[0]!, compositionKnown: true, mcpUnreadable: false, skills: [], ...extra });
const project = (normRoot: string, configStatus: CodexProjectFact["configStatus"] = "ok"): CodexProjectFact => ({ normRoot, scanned: true, trust: "trusted", configStatus, instructions: emptyInstructionSet(), safety: null });

function facts(extra: Partial<CodexSetupFacts> = {}): CodexSetupFacts {
  return {
    tool: "codex",
    home: "c:/home/.codex",
    config: "ok",
    globalInstructions: emptyInstructionSet(),
    globalMentions: {},
    safety: { approval: null, sandbox: null, permissions: null },
    skills: [],
    mcpServers: [],
    plugins: [plugin("a@m"), plugin("b@m")],
    projects: [project(P), project(Q), { ...project(GONE), scanned: false, configStatus: null }],
    problems: [],
    unreadableDirs: [],
    unreadableSkillPlaces: { user: false, projects: [], plugins: [] },
    ...extra,
  };
}

const keys = {
  userSkill: codexSkillInstallKey(skill("user", "u")),
  pSkill: codexSkillInstallKey(skill("project", "ps", P)),
  qSkill: codexSkillInstallKey(skill("project", "qs", Q)),
  pluginSkill: codexSkillInstallKey(skill("plugin", "a:s", null, "a@m")),
  userServer: codexMcpInstallKey(server("user", "us"))!,
  pServer: codexMcpInstallKey(server("project", "psrv", P))!,
  qServer: codexMcpInstallKey(server("project", "qsrv", Q))!,
  goneServer: codexMcpInstallKey(server("project", "gsrv", GONE))!,
  aServer: codexMcpInstallKey(server("plugin", "as", null, "a@m"))!,
  bServer: codexMcpInstallKey(server("plugin", "bs", null, "b@m"))!,
};
const unseen = (f: CodexSetupFacts): Record<keyof typeof keys, boolean> => {
  const check = codexUnseenInUnreadablePlace(f);
  return Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, check(key)])) as Record<keyof typeof keys, boolean>;
};

describe("Codex 설치의 정체 열쇠", () => {
  it("도구 칸이 codex이고 Claude Code의 열쇠와 다르다", () => {
    expect(JSON.parse(keys.userSkill)[1]).toBe("codex");
    expect(keys.userSkill).not.toBe(skillInstallKey(skill("user", "u")));
    expect(keys.userServer).not.toBe(mcpInstallKey(server("user", "us")));
    expect(codexMcpInstallKey(server("user", "x", null, null, null))).toBeNull();
  });

  it("codexInstallKeysOf는 사실에 붙은 열쇠를 중복 없이 차례대로 모으고 정의가 없는 서버는 뺀다", () => {
    const withKeys = facts({
      skills: [skill("user", "b"), skill("user", "a"), skill("user", "a")].map((s) => ({ ...s, installKey: codexSkillInstallKey(s) })),
      mcpServers: [server("user", "s"), server("user", "n", null, null, null)].map((s) => ({ ...s, installKey: codexMcpInstallKey(s) })),
    });
    expect(codexInstallKeysOf(withKeys)).toEqual([codexSkillInstallKey(skill("user", "a")), codexSkillInstallKey(skill("user", "b")), codexMcpInstallKey(server("user", "s"))!].sort());
  });
});

describe("codexUnseenInUnreadablePlace", () => {
  it("모두 읽었으면 어느 것도 읽지 못한 곳에 든 것이 아니다", () => {
    expect(Object.values(unseen(facts())).every((value) => !value)).toBe(true);
  });

  it("사용자 설정을 읽지 못하면 서버(신뢰와 플러그인 항목도 그 파일에서 얻는다)와 플러그인 스킬이 읽지 못한 곳에 든 것이다. 찾는 곳의 스킬은 상관없다", () => {
    for (const config of ["unparsable", "unreadable"] as const) {
      const result = unseen(facts({ config }));
      expect([result.userServer, result.pServer, result.qServer, result.aServer, result.bServer, result.pluginSkill]).toEqual([true, true, true, true, true, true]);
      expect([result.userSkill, result.pSkill, result.goneServer]).toEqual([false, false, false]);
    }
    expect(unseen(facts({ config: "missing" })).userServer).toBe(false);
  });

  it("신뢰한 프로젝트의 설정을 읽지 못하면 그 프로젝트의 서버만 읽지 못한 곳에 든 것이다. 읽지 않는 프로젝트의 것은 없어진 것이다", () => {
    const result = unseen(facts({ projects: [project(P, "unreadable"), project(Q), { ...project(GONE), scanned: false, configStatus: null }] }));
    expect([result.pServer, result.qServer, result.goneServer, result.userServer]).toEqual([true, false, false, false]);
    expect(unseen(facts({ projects: [project(P, "unparsable"), project(Q)] })).pServer).toBe(true);
  });

  it("구성을 모르거나 MCP 정의를 읽지 못한 플러그인의 서버, 스킬 폴더를 다 읽지 못한 플러그인과 구성을 모르는 플러그인이 있으면 플러그인 스킬이 읽지 못한 곳에 든 것이다", () => {
    const unknown = unseen(facts({ plugins: [plugin("a@m", { compositionKnown: false }), plugin("b@m")] }));
    expect([unknown.aServer, unknown.bServer, unknown.pluginSkill]).toEqual([true, false, true]);
    const noMcp = unseen(facts({ plugins: [plugin("a@m"), plugin("b@m", { mcpUnreadable: true })] }));
    expect([noMcp.aServer, noMcp.bServer, noMcp.pluginSkill]).toEqual([false, true, false]);
    expect(unseen(facts({ unreadableSkillPlaces: { user: false, projects: [], plugins: ["a@m"] } })).pluginSkill).toBe(true);
    // 꺼진 플러그인의 구성을 모르는 것은 상관없다
    expect(unseen(facts({ plugins: [plugin("a@m", { compositionKnown: false, configured: false, enabled: false }), plugin("b@m")] })).pluginSkill).toBe(false);
  });

  it("목록을 다 읽지 못한 찾는 곳의 스킬이 읽지 못한 곳에 든 것이다", () => {
    const result = unseen(facts({ unreadableSkillPlaces: { user: true, projects: [P], plugins: [] } }));
    expect([result.userSkill, result.pSkill, result.qSkill, result.pluginSkill]).toEqual([true, true, false, false]);
  });

  it("Claude Code의 열쇠와 깨진 열쇠는 상관없다", () => {
    const check = codexUnseenInUnreadablePlace(facts({ config: "unreadable" }));
    expect(check(mcpInstallKey(server("user", "us"))!)).toBe(false);
    expect(check("{깨진")).toBe(false);
    expect(check(JSON.stringify(["mcp", "codex"]))).toBe(false);
  });
});
```

`test/scan/codex.test.ts`(찾을 곳):

```ts
    for (const path of [home, join(root, "work", "deleted")]) expect(projectFact(facts, path).configStatus).toBeNull();
```

`test/scan/codex.test.ts`(바꾼 뒤):

```ts
    for (const path of [home, join(root, "work", "deleted")]) expect([projectFact(facts, path).configStatus, projectFact(facts, path).scanned]).toEqual([null, false]);
    expect([p.scanned, o.scanned]).toEqual([true, true]);
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/codex-identity.test.ts test/scan/codex.test.ts`
Expected: FAIL. `test/scan/codex-identity.test.ts`가 `codexInstallKeysOf`와 `codexUnseenInUnreadablePlace`를 찾지 못해 일곱 시험이 실패하고, `test/scan/codex.test.ts`의 프로젝트 시험 하나가 `scanned`가 없어 실패한다. 나머지는 통과한다.

- [ ] **Step 3: 구현한다**

`src/scan/codex.ts`(찾을 곳 1/2):

```ts
      projects.push({ normRoot: ref.normRoot, trust, configStatus: null, instructions: emptyInstructionSet(), safety: null });
```

`src/scan/codex.ts`(바꾼 뒤 1/2):

```ts
      projects.push({ normRoot: ref.normRoot, scanned: false, trust, configStatus: null, instructions: emptyInstructionSet(), safety: null });
```

`src/scan/codex.ts`(찾을 곳 2/2):

```ts
    projects.push({ normRoot: ref.normRoot, trust, configStatus: known.status, instructions, safety: known.safety });
```

`src/scan/codex.ts`(바꾼 뒤 2/2):

```ts
    projects.push({ normRoot: ref.normRoot, scanned: true, trust, configStatus: known.status, instructions, safety: known.safety });
```

`src/scan/identity.ts`(찾을 곳 1/2):

```ts
import { normalizePath } from "../adapters/claude/locate.ts";
import { installKey } from "../state/observations.ts";
import type { ClaudeSetupFacts, FileStatus, McpFact, SkillFact } from "./types.ts";

type Tool = "claude-code" | "codex";
```

`src/scan/identity.ts`(바꾼 뒤 1/2):

```ts
import { normalizePath } from "../adapters/claude/locate.ts";
import { installKey } from "../state/observations.ts";
import type { ClaudeSetupFacts, CodexSetupFacts, FileStatus, McpFact, SkillFact } from "./types.ts";

type Tool = "claude-code" | "codex";
```

`src/scan/identity.ts`(찾을 곳 2/2):

```ts
  };
}
```

`src/scan/identity.ts`(바꾼 뒤 2/2):

```ts
  };
}

/** 이번 점검에서 본 Codex의 모든 스킬과 MCP 서버의 설치 열쇠(켜졌는지와 상관없다). 정의의 지문이 없는 서버는 뺀다 */
export function codexInstallKeysOf(facts: CodexSetupFacts): string[] {
  const keys: string[] = facts.skills.map((skill) => skill.installKey);
  for (const server of facts.mcpServers) if (server.installKey !== null) keys.push(server.installKey);
  return [...new Set(keys)].sort();
}

/**
 * 관측 기록에만 있고 이번 점검에 보이지 않는 Codex 설치가 "읽지 못한 곳에 든 것"인지 가르는 함수를 만든다(설계 18.1, 「5단계 2부 계획 전 결정」 9번).
 * - 서버: 사용자 config.toml을 읽지 못했으면 모두다(신뢰와 플러그인 항목도 그 파일에서 얻는다). 그 밖에는 프로젝트 범위는 그 프로젝트의 .codex/config.toml을 읽지 못했을 때,
 *   플러그인 범위는 그 플러그인의 구성을 모르거나 MCP 정의를 읽지 못했을 때다.
 * - 스킬: 사용자와 프로젝트 범위는 그 찾는 곳의 목록을 다 읽지 못했을 때다. 플러그인 범위는 사용자 config.toml을 읽지 못했거나, 구성을 모르는 켜진 플러그인이 있거나,
 *   스킬을 찾는 폴더를 다 읽지 못한 플러그인이 있을 때다(스킬의 열쇠에는 플러그인이 적히지 않아 넓게 본다).
 * 스캐너가 셋팅을 읽지 않는 프로젝트의 것은 없어진 것이라 거짓이다. 읽지 못했다고 확인되지 않으면 거짓이다
 */
export function codexUnseenInUnreadablePlace(facts: CodexSetupFacts): (key: string) => boolean {
  const configUnread = unread(facts.config);
  const scanned = new Map(facts.projects.filter((project) => project.scanned).map((project) => [project.normRoot, project]));
  const unknownPlugins = new Set(facts.plugins.filter((plugin) => !plugin.compositionKnown || plugin.mcpUnreadable).map((plugin) => plugin.id));
  const pluginSkillsUnseen = configUnread || facts.plugins.some((plugin) => plugin.configured && !plugin.compositionKnown) || facts.unreadableSkillPlaces.plugins.length > 0;
  return (key) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(key);
    } catch {
      return false;
    }
    if (!Array.isArray(parsed) || !parsed.every((part): part is string => typeof part === "string") || parsed[1] !== "codex") return false;
    const scope = parsed[2] ?? "";
    const projectRoot = parsed[3] ?? "";
    if (parsed[0] === "skill" && parsed.length === 6) {
      if (scope === "user") return facts.unreadableSkillPlaces.user;
      if (scope === "project") return scanned.has(projectRoot) && facts.unreadableSkillPlaces.projects.includes(projectRoot);
      if (scope === "plugin") return pluginSkillsUnseen;
      return false;
    }
    if (parsed[0] === "mcp" && parsed.length === 7) {
      if (scope === "project" && !scanned.has(projectRoot)) return false;
      if (configUnread) return scope === "user" || scope === "project" || scope === "plugin";
      if (scope === "project") return unread(scanned.get(projectRoot)?.configStatus);
      if (scope === "plugin") return unknownPlugins.has(parsed[4] ?? "");
      return false;
    }
    return false;
  };
}
```

`src/scan/types.ts`(찾을 곳):

```ts
  normRoot: string;
  /** 사용자 설정에 적힌 신뢰(「5단계 2부 계획 전 결정」 2번) */
```

`src/scan/types.ts`(바꾼 뒤):

```ts
  normRoot: string;
  /** 스캐너가 셋팅을 읽은 프로젝트다(지금 PC에 있고 프로젝트로 보지 않는 폴더가 아니다). 거짓이면 그 프로젝트의 설치는 없어진 것이다 */
  scanned: boolean;
  /** 사용자 설정에 적힌 신뢰(「5단계 2부 계획 전 결정」 2번) */
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/codex-identity.test.ts test/scan/codex.test.ts test/scan/identity.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 40개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/codex-identity.test.ts test/scan/codex.test.ts src/scan/codex.ts src/scan/identity.ts src/scan/types.ts
git commit -m "feat: Codex 설치의 열쇠와 읽지 못한 곳을 가름"
```

---

### Task 9: 개발용 스크립트와 전체 검사

**Files:**
- Create: `scripts/dev-codex-setup.ts`
- Modify: `skills/aq/scripts/aq.mjs`

**Interfaces:**
- Consumes: 과제 7·8의 `scanCodexSetup`, `codexInstallKeysOf`, `codexUnseenInUnreadablePlace`. 1단계와 1부의 `collectClaude`, `collectCodex`, `makeWindows`.
- Produces: 개발용 명령 `node scripts/run-ts.mjs scripts/dev-codex-setup.ts`. 묶음에는 들어가지 않는다. 묶은 실행 파일을 원본에서 다시 만든다.

- 이 PC의 Codex 셋팅을 스캐너로 읽어 종류별 개수와 걸린 시간만 낸다. 이름, 경로, 값, 글은 내지 않는다. 프로젝트 목록은 두 도구의 기록에서 수집 구간에 응답이 있는 주 세션의 작업 폴더로 만든다(설계 10 「프로젝트 목록」).
- 과제 7이 2단계 스캐너(`src/scan/claude.ts`)를 고쳐 묶은 실행 파일이 원본과 어긋나 있다. `npm run build`로 다시 만들고 전체 검사를 돌린다. Codex 스캐너는 아직 점검에 잇지 않아(3부) 묶음에 들지 않는다.

- [ ] **Step 1: 구현한다**

묶은 실행 파일은 글로 싣지 않는다. 확인 명령의 `npm run build`가 원본에서 다시 만든다.

`scripts/dev-codex-setup.ts`(새 파일):

```ts
// 개발용. 이 PC의 Codex 셋팅을 스캐너로 읽어 종류별 개수와 걸린 시간만 낸다. 프로젝트 목록은 두 도구의 기록에서 얻는다. 이름, 경로, 값, 글은 내지 않는다
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { makeWindows } from "../src/adapters/common/dates.ts";
import { collectClaude } from "../src/collect/claude.ts";
import { collectCodex } from "../src/collect/codex.ts";
import { scanCodexSetup } from "../src/scan/codex.ts";
import { codexInstallKeysOf, codexUnseenInUnreadablePlace } from "../src/scan/identity.ts";

const clock = { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
const options = { env: process.env, homedir: homedir(), clock, cacheDir: null, rescan: false };
// 프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더(첫 cwd)로 만들고 도구를 합친다(설계 10)
const collectDates = new Set(makeWindows(clock.nowMs, clock.timeZone).collectDates);
const summaries = [...(await collectClaude(options)).summaries, ...(await collectCodex(options)).summaries];
const mains = summaries.filter((s) => s.kind === "main" && Object.entries(s.days).some(([date, day]) => collectDates.has(date) && day.responses > 0));
const cwds = [...new Set(mains.flatMap((s) => (s.cwd === null ? [] : [s.cwd])))];

const started = performance.now();
const facts = await scanCodexSetup({ env: process.env, homedir: homedir(), tmpdir: tmpdir(), platform: process.platform, cwds, salt: randomBytes(32).toString("hex") });
const seconds = (performance.now() - started) / 1000;

const tally = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
const unseen = codexUnseenInUnreadablePlace(facts);
const keys = codexInstallKeysOf(facts);
console.log(
  JSON.stringify(
    {
      seconds: Number(seconds.toFixed(2)),
      mainSessions: mains.length,
      config: facts.config,
      safety: facts.safety,
      globalInstructions: { files: facts.globalInstructions.files.length, overBytes200: facts.globalInstructions.bytes >= 200, lines: facts.globalInstructions.lineHashes.length, unreadable: facts.globalInstructions.unreadable.length, projectsMentioned: Object.keys(facts.globalMentions).length },
      skills: {
        byScope: tally(facts.skills, (s) => s.scope),
        enabled: tally(facts.skills, (s) => `${s.scope}:${s.enabled}`),
        links: facts.skills.filter((s) => s.isLink).length,
        incomparable: facts.skills.filter((s) => s.contentHash === null).length,
        withoutCreatedTime: facts.skills.filter((s) => s.createdMs === null).length,
        unreadableSkillMd: facts.skills.filter((s) => !s.readable).length,
        nameUnreadable: facts.skills.filter((s) => s.nameUnreadable).length,
        sameNameCopies: Object.values(tally(facts.skills.filter((s) => s.scope !== "plugin" && !s.isLink), (s) => s.name)).filter((n) => n > 1).length,
      },
      mcpServers: { byScope: tally(facts.mcpServers, (s) => s.scope), enabled: tally(facts.mcpServers, (s) => `${s.scope}:${s.enabled}`), withoutDefinition: facts.mcpServers.filter((s) => s.definitionHash === null).length },
      plugins: {
        count: facts.plugins.length,
        configured: facts.plugins.filter((p) => p.configured).length,
        enabled: facts.plugins.filter((p) => p.enabled).length,
        install: tally(facts.plugins, (p) => p.install),
        manifest: tally(facts.plugins, (p) => p.manifest),
        idInvalid: facts.plugins.filter((p) => !p.idValid).length,
        compositionUnknown: facts.plugins.filter((p) => !p.compositionKnown).length,
        mcpUnreadable: facts.plugins.filter((p) => p.mcpUnreadable).length,
        withSkills: facts.plugins.filter((p) => p.skills.length > 0).length,
      },
      projects: {
        count: facts.projects.length,
        scanned: facts.projects.filter((p) => p.scanned).length,
        trust: tally(facts.projects, (p) => String(p.trust)),
        configStatus: tally(facts.projects, (p) => String(p.configStatus)),
        withInstructions: facts.projects.filter((p) => p.instructions.files.some((f) => f.hasContent)).length,
        unsafeContexts: facts.projects.filter((p) => p.safety !== null && p.safety.approval === "never" && (p.safety.sandbox === "danger-full-access" || p.safety.permissions === "danger-full-access")).length,
      },
      problems: tally(facts.problems, (p) => `${p.kind}:${p.owner}`),
      unreadableDirs: facts.unreadableDirs.length,
      unreadableSkillPlaces: { user: facts.unreadableSkillPlaces.user, projects: facts.unreadableSkillPlaces.projects.length, plugins: facts.unreadableSkillPlaces.plugins.length },
      installKeys: keys.length,
      installKeysInUnreadablePlace: keys.filter(unseen).length,
    },
    null,
    2,
  ),
);
```

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

- [ ] **Step 2: 전체 검사가 통과하는지 확인한다**

Run: `npm run build && npm run check`
Expected: `npm run build`가 `묶음 완료`를 내고, `npm run check`가 타입 검사 통과, 시험 파일 105개·시험 1,707개 통과(파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다), `묶음 검사 통과`, `버전 검사 통과`를 낸다.

- [ ] **Step 3: 커밋한다**

```bash
git add scripts/dev-codex-setup.ts skills/aq/scripts/aq.mjs
git commit -m "chore: Codex 셋팅을 돌려 보는 개발용 스크립트를 더함"
```

---

### Task 10: Node.js 22, 이 PC의 셋팅으로 돌려 보기, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~9의 결과물 전부.
- Produces: `develop`에 병합된 5단계 2부. 3부(평가 입력·규칙·결과에 Codex)가 기대는 것은 `scanCodexSetup`, `CodexScanInput`, `CodexSetupFacts`, `CodexProjectFact`, `CodexPluginFact`, `CodexSafetyFact`, `codexInstallKeysOf`, `codexUnseenInUnreadablePlace`, `projectNamesOf`다.

- [ ] **Step 1: 묶음을 다시 만들어도 그대로인지 확인한다**

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 2: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS(시험 파일 105개·시험 1,707개. 파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다. 받은 22가 22.15.0보다 낮으면 1부의 압축 기록 시험 묶음 둘을 건너뛴 수만큼 적다). 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 3: 이 PC의 Codex 셋팅으로 실제로 돌려 본다**

Codex 홈, 홈의 `.agents`, 프로젝트 폴더는 읽기만 한다. 이 PC의 이름, 경로, 값, 개수는 저장소 밖 작업 기록에만 둔다.

Run: `node scripts/run-ts.mjs scripts/dev-codex-setup.ts`

| 확인 | Expected |
|---|---|
| 끝까지 도는지 | 예외 없이 끝나고 JSON 하나를 낸다. 스캐너가 걸린 시간(`seconds`)이 몇 초 안이다 |
| 사용자 설정 | `config`가 `ok`이고(작성자 PC), 문제(`problems`)에 사용자 설정이 없다 |
| 따로 센 수와 견주기 | 저장소 밖의 작은 스크립트가 같은 `config.toml`을 smol-toml로 풀어 센 `[mcp_servers]`의 이름 수가 사용자 범위 서버 수와 같고, `[plugins]`의 열쇠 수(`_default` 빼고)가 플러그인 수와 같다. 두 사용자 찾는 곳에서 따로 센 `SKILL.md`(숨김 폴더와 일곱째 단을 빼고, 폴더 링크를 따라간 것)의 수가 사용자 범위 스킬 위치의 수와 같다 |
| 값과 글이 나가지 않는지 | 개발용 스크립트의 출력에 이름, 경로, 설정의 값이 없다. 저장소 밖 스크립트로 `scanCodexSetup`의 결과 전체를 글로 바꿔 사용자 `config.toml`에 적힌 환경 변수와 머리말의 값이 들어 있지 않은지 본다 |
| 쓰지 않는지 | 돌리기 앞뒤로 Codex 홈의 `config.toml`과 사용자 스킬 폴더의 수정 시각이 그대로다 |

작성자 PC에서 계획을 쓰며 돌린 결과는 위와 같았다(개수는 저장소 밖 작업 기록에 적었다). 이 PC의 `[[skills.config]]` 항목 하나는 `SKILL.md`가 아니라 스킬 폴더의 경로를 적고 있어, Codex와 같이 어느 스킬에도 맞지 않았다.

- [ ] **Step 4: 원장을 고치고 커밋한다**

원장의 5단계 2부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 7에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 2부 구현 결과를 적음"
```

- [ ] **Step 5: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage5-2.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~9의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 이 PC의 셋팅으로 돌린 것의 확인 항목과 맞았는지), 「확인하지 못한 것」이다. 확인하지 못한 것에는 평가 입력·점수·결과 화면에 Codex 셋팅이 들어가는 것(3부), macOS와 Linux의 Codex 홈과 시스템 설정, Codex를 실제로 돌려 판정을 맞춰 본 것(모두 0.166.0의 공개 소스로 정했다), Windows의 파일 링크(시험을 건너뛰었다), 27절의 「Codex 셋팅 읽기의 한계」를 적는다.

```bash
git push -u origin 5단계-2부-Codex-셋팅-읽기
gh pr create --base develop --head 5단계-2부-Codex-셋팅-읽기 --title "feat: 5단계 2부 Codex 셋팅 읽기" --body-file "$TEMP/aq-pr-stage5-2.md"
```

- [ ] **Step 6: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex 하나를 만들어 맡긴다(사용자 결정 2026-11-16 「중요한게 아니면 일단 넘어가거나」로 필수는 제품 결함과 수용 조건 미충족뿐이다). 짝은 새 복제본에서 계획의 코드 블록을 자기 도구로 뽑아 기준에 적용한 결과가 브랜치의 `src`·`test`·`scripts`·`skills`·`package.json`·`package-lock.json`과 같은지, `npm ci` 뒤 `npm run check`와 Node.js 22의 전체 시험, 이 PC의 Codex 셋팅으로 Step 3의 확인 항목을 자기 방법으로 재현하는지, 제품 코드가 설계(10절의 Codex 칸, 「5단계 2부 계획 전 결정」)와 다른 결과를 내거나 예외로 멈추거나 실제 홈에 쓰거나 값을 결과 밖으로 내는지를 본다. 결함이라고 적으려면 합성 셋팅으로 실제로 재현한다. 변이로 틀린 구현을 지어 보는 일은 하지 않는다. 필수 지적은 고치고 지적한 짝이 다시 본다. 오래 끌면 Fable 5.2가 제품 결함만 한 번 더 찾는다(메모리 `review-until-no-major-issues`).

- [ ] **Step 7: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 5단계-2부-Codex-셋팅-읽기 --merge --subject "feat: 5단계 2부 Codex 셋팅 읽기를 개발 브랜치에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 5단계 2부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 3부와 그 뒤에 넘기는 것

5단계 2부가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 부 | 2부가 남긴 재료 |
|---|---|---|
| 점검의 입력 묶음에서 `scanCodexSetup`을 부르고 평가 입력의 Codex 도구에 셋팅 사실을 넣기. 두 도구의 작업 폴더를 합친 프로젝트 목록으로 두 스캐너를 부르기(이름은 `projectNamesOf`로 같다). 묶은 실행 파일에 smol-toml이 들어가는 것과 그 라이선스 고지 확인 | 3부 | `scanCodexSetup`, `CodexScanInput`, `CodexSetupFacts`, `projectNamesOf` |
| S1(전역 지침 하나의 크기), S2(맥락마다 승인 없음과 전면 해제를 함께 쓰는지. 사용자 설정이나 신뢰한 프로젝트의 설정을 읽지 못하면 Codex만 뺌), S3(Codex의 문제), S5·E6(설정 파일을 읽지 못하면 못 잼), F3(Codex가 읽는 프로젝트 지침), F4(같은 파일도 견줌), F5(`.codex/skills`도) | 3부 | `CodexSetupFacts`의 `safety`, `config`, `problems`, `projects`, `skills`, `mcpServers`, `globalInstructions` |
| 상태 파일의 관측 기록에 Codex 설치를 잇기(18.1) | 3부 | `codexInstallKeysOf`, `codexUnseenInUnreadablePlace` |
| Codex의 E5(스킬 사용 관측이 빠짐없지 않아 못 잼)와 그 알림 문장, 명시적으로 부른 스킬과 실린 목록을 기록에서 읽는 것(뒤 버전 후보) | 3부, 뒤 버전 | 「5단계 2부 계획 전 결정」 6번 |
| Codex 서버 끄기(A4)의 후보 조건(같은 이름의 플러그인 서버도 꺼진다) | 6단계 | 「5단계 2부 계획 전 결정」 7번 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 10절 표, 「5단계 2부 계획 전 결정」 1번 | 사용자 `config.toml`과 신뢰한 프로젝트의 `.codex/config.toml`, 층 합치기 | 1, 7 |
| 10절 TOML 문단, 3번 | 검증된 TOML 1.1 해석기를 묶음에 넣음, 풀리지 않는 것의 셋(문법, 자리의 종류, 전송) | 1, 7 |
| 2번 | 신뢰(사용자 층의 `projects`, 본 저장소 뿌리의 열쇠) | 2, 7 |
| 4번 | 맥락마다의 승인과 샌드박스(판정은 3부) | 2, 7 |
| 5번 | 전역 지침 하나, 프로젝트 지침 하나(빈 override, fallback, 신뢰하지 않음, 한도 0), 같은 파일 표시를 붙이지 않음 | 3, 7 |
| 6번 | 스킬을 찾는 곳(사용자 둘, 저장소 둘, 플러그인), 찾는 꼴(여섯 단, 숨김, 링크, 상한), 이름과 접두, Codex의 머리말, `[[skills.config]]`의 켜짐 | 4, 7 |
| 7번 | 설정의 서버(범위, 합친 정의), 플러그인의 서버(정책 묶음), 같은 이름의 우선순위, 정의의 지문(enabled 뺌), 기록의 이름 | 5, 6, 7 |
| 8번 | 플러그인 후보와 켜짐(`_default`, `[features]`), 놓인 곳과 버전, 매니페스트의 차례와 실패, 구성 | 5, 7 |
| 9번 | 같은 하위 꼴의 사실, 정체 열쇠의 도구 칸, 관측 기록의 읽지 못한 곳 | 7, 8 |
| 10번, 21.1 | 이 PC로 돌려 보기(값을 내지 않음, 쓰지 않음) | 9, Task 10 Step 3 |
| 19.1 | 설정의 값과 글을 결과에 싣지 않음 | 6, 7(시험), Task 10 Step 3 |

2부에 넣지 않은 것은 「3부와 그 뒤에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 커밋·병합 요청·병합 제목을 전역 규칙(타입 12개, 타입을 뺀 설명 50자 이내, 한글 4자 이상, 영문자가 한글보다 많지 않음)으로 기계로 셌다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드가 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`e64ee41`)에서 과제 1부터 9까지 차례대로 만들었다(Windows 11, Node.js 24.18). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1~8은 시험만 놓고 돌리면 실패하고(과제 1~7은 새 모듈을 찾지 못해 불러오기에서, 과제 8은 정체 열쇠 시험 일곱과 스캐너 시험 하나가), 구현을 놓으면 그 과제의 시험과 타입 검사가 통과했다. 과제 9의 `npm run build && npm run check`는 시험 파일 105개·시험 1,707개(Windows에서 파일 링크 시험 하나를 건너뛰어 1,706개 통과)와 묶음 검사, 버전 검사가 통과했다. 묶음을 다시 만들어도 작업 트리가 그대로였고, 만든 복제본의 파일 262개(문서와 원장 빼고)가 연습 작업 폴더와 바이트까지 같았다. 이 복제본은 의존성을 연습 작업 폴더의 것에 이었으므로 과제 1의 `npm ci`는 건너뛰었다(실제 적용에서는 돌린다).

연습 작업 폴더에서 따로 확인한 것은 이렇다. 과제의 시험 커밋 여덟을 하나씩 꺼내 그 커밋이 더하거나 고친 시험 파일만 돌리면 모두 실패했고, 구현 커밋 아홉을 하나씩 꺼내 타입 검사와 전체 시험을 돌리면 모두 타입 오류 없이 통과했다. 계획을 쓰는 동안 시험이 두 가지 결함을 먼저 잡았다. 정체 열쇠 함수에 도구 인자를 덧붙이자 `map(skillInstallKey)`처럼 넘긴 곳에서 배열 번호가 그 인자에 들어가 Claude Code 설치의 열쇠가 바뀌었다(타입 검사가 잡았다. 기존 함수는 그대로 두고 Codex용 함수를 따로 뒀다). 프로젝트 층마다 값의 종류와 전송을 검사하자 사용자 층의 서버를 `args`만 다시 적은 신뢰한 프로젝트의 설정을 풀리지 않는 것으로 봤다(Codex는 합친 설정을 검사한다. 프로젝트 층은 사용자 층과 합친 것으로 보게 고쳤다).

이 PC의 Codex 셋팅(읽기만)으로 Task 10 Step 3을 미리 돌렸다. 예외 없이 끝났고 스캐너가 걸린 시간은 1초 안이었다. 사용자 설정이 풀렸고 문제와 읽지 못한 곳이 없었으며, 사용자·저장소·플러그인 범위의 스킬, 세 범위의 MCP 서버, 설정의 플러그인 항목이 모두 사실로 나왔다(개수는 저장소 밖 작업 기록에 적었다). 이 PC의 `[[skills.config]]` 항목 하나는 `SKILL.md`가 아니라 스킬 폴더의 경로를 적고 있어, Codex와 같이 어느 스킬에도 맞지 않았다.

확인하지 못한 것은 이렇다. Node.js 22에서 돌리는 것은 Task 10 Step 2에서 한다. Codex를 실제로 돌려 판정(신뢰, 스킬을 찾는 꼴, 플러그인과 서버의 켜짐)을 맞춰 보지 않았다. 모두 Codex 0.166.0의 공개 소스로 정했다. macOS와 Linux의 Codex 홈, 시스템 설정, 관리 요구는 보지 않았다. Windows의 파일 링크 시험은 이 PC에서 건너뛰었다.
