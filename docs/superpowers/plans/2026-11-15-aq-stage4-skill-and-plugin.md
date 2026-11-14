# AQ 점검 4단계 — 스킬과 Claude Code 플러그인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 플러그인의 실제 설치와 실행 확인으로 검증한다.

**Goal:** Claude Code에 플러그인을 깔고 "AQ 점검해 줘"라고 말하면, 스킬이 묶은 실행 파일을 묻지 않고 돌려 결과 화면을 열고 터미널에 점수, 등급, 가장 잘하는 것, 먼저 고칠 것을 캐릭터 말투로 짧게 전한다.

**Architecture:** 플러그인 정보와 마켓 목록은 `.claude-plugin/`에, 스킬 본문은 `skills/aq/SKILL.md`에 둔다. 스킬 본문은 실행 명령, 터미널의 틀, 결과 화면 경로와 알림, 실패할 때의 안내를 정하고, 시험이 본문과 프로그램이 맞물리는지(명령과 옵션, 읽는 칸, 알림 종류) 본다. 버전이 쓰이는 곳이 모두 같은지 보는 검사와, 사용자에게 줄 플러그인 산출물(플러그인이 쓰는 파일만)을 모으는 스크립트를 `scripts/`에 둔다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 확인에 Claude Code CLI(`claude plugin validate`, `claude plugin marketplace add`, `claude plugin install`, `claude -p --plugin-dir`)를 쓴다. 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 5(사용자가 겪는 흐름), 7.1(저장소와 매니페스트), 7.4(명령), 12.3(요약), 13.2(언어), 15(터미널 표시), 23(배포와 설치), 6.3(실행 조건)과 끝의 「4단계 계획에서 보완」, 3단계 2부 계획의 「4단계와 그 뒤에 넘기는 것」을 구현한다.

## 4단계의 범위

| 넣는 것 | 넣지 않는 것(그 단계) |
|---|---|
| Claude Code 플러그인 정보와 마켓 목록, 버전 일치 검사, 스킬 본문(실행, 언어, 터미널의 틀과 얼굴, 결과 화면 경로와 알림, 실패), 플러그인 산출물을 모으는 스크립트, 실제 설치와 실행 확인 | Codex 매니페스트와 Codex에서 스킬이 도는지(5단계), 정비 절차와 `aq tune`(6단계), 정밀 점검과 세션 시작 알림(7단계), README 두 벌과 `main`에 산출물을 올리는 배포 절차, 플러그인 아이콘(8단계) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- **사용자는 `npm install`을 하지 않는다**(설계 6.3). 사용자가 설치하는 것은 플러그인 산출물이고, 산출물에는 `package.json`과 잠금 파일이 없다. 묶은 실행 파일은 의존성 없이 돈다.
- **AI는 숫자를 만들지 않는다**(설계 7.2, 15). 스킬은 프로그램이 낸 요약의 숫자와 문장을 그대로 옮기고 예상 효과를 지어 넣지 않는다.
- 스킬이 프로그램을 부를 때는 경로를 큰따옴표로 감싼다. 공백이나 한글이 든 경로에서도 돌아야 한다(설계 6.3).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더와 Claude Code 설정을 읽지도 쓰지도 않고, Claude Code CLI를 부르지 않는다(설계 21.1). CLI로 하는 확인은 마지막 과제의 손으로 하는 단계다.
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침). 마크다운과 JSON 파일은 뺀다.
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `4단계-스킬과-플러그인` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증은 병합 앞의 관문이다.
- 실제 확인은 사용자의 Claude Code 설정을 바꾸지 않는다. 설치는 빈 임시 설정 폴더(`CLAUDE_CONFIG_DIR`)에서, 실행은 그 실행에만 플러그인을 불러오는 `--plugin-dir`로 한다.
- 이 PC의 기록과 셋팅에서 잰 숫자, 경로, 이름은 저장소와 병합 요청에 넣지 않는다(설계 머리말). 실제 실행의 기록과 결과 글은 저장소 밖에 둔다.

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `656A7004459D5107AC88EE4B8FBB7CF5975AC5981F56245D75666BC19FCAA679`, 3,956줄)이다. 설계 끝에 「4단계 계획에서 보완」(여덟 가지)을 더했다. 매니페스트의 열쇠와 값, 스킬의 실행과 허락 규칙, 스킬 본문의 틀과 얼굴, 플러그인 산출물, 버전을 읽는 곳, 말투 표의 자리, 이 PC에서 확인하지 못한 것, 3단계 2부가 넘긴 것의 반영이다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`(새) | 1 | Claude Code 플러그인 정보와, 이 저장소를 마켓으로 쓰는 목록 |
| `scripts/version-scan.mjs`, `scripts/version-scan.d.mts`, `scripts/check-versions.mjs`(새), `package.json`, `src/version.ts`(고침) | 2 | 버전이 쓰이는 네 곳을 읽고 견주는 검사와 `npm run check` 연결 |
| `skills/aq/SKILL.md`(새), `src/cli.ts`, `src/commands/run-notices.ts`(고침), `skills/aq/scripts/aq.mjs`(다시 묶음) | 3 | 스킬 본문. 시험이 쓰도록 옵션 해석 함수와 실행 알림 종류를 내보낸다 |
| `scripts/plugin-files.mjs`, `scripts/plugin-files.d.mts`, `scripts/pack-plugin.mjs`(새) | 4 | 사용자에게 줄 플러그인 산출물을 모은다 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/2`처럼 차례가 붙고 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 3의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 마지막 과제에서 돌린다. 과제 2부터 `npm run check`의 마지막 줄은 `버전 검사 통과`다.
- 스킬 본문의 시험은 본문과 프로그램이 맞물리는지를 본다. 모델이 본문을 따라 실제로 그렇게 말하는지는 시험으로 보증하지 않으므로 마지막 과제에서 Claude Code로 실제로 돌려 본다.

---

### Task 1: Claude Code 플러그인 정보와 마켓 목록

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `.claude-plugin/plugin.json`
- Test: `test/plugin/manifest.test.ts`

**Interfaces:**
- Consumes: 없다. 4단계의 첫 과제다. 3단계까지의 `SELF_PLUGIN_NAMES`(`src/commands/self.ts`, 시험만)와 `package.json`의 `description`, `license`를 쓴다.
- Produces: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`. 과제 2(버전을 읽는 곳)와 과제 4(산출물에 담는 것)가 쓴다.

설계 5, 7.1, 23, 「4단계 계획에서 보완」의 1번이다.

- 플러그인 정보의 열쇠는 설계 7.1이 꼭 넣으라는 여섯(`name`, `version`, `description`, `author`, `repository`, `license`)에 화면 이름(`displayName`), 집(`homepage`), 찾기 낱말(`keywords`)을 더한 아홉이다. 저작자는 이름만 적고 메일을 넣지 않는다. 쓰지 않는 구성 요소(명령, 하위 에이전트, 훅, MCP 서버)의 열쇠를 두지 않는다. 시험이 열쇠의 목록을 그대로 견주고, 찾기 낱말이 빈 글자가 아닌 글자들의 배열인지도 본다(계획 리뷰 1차의 짝 Codex 1).
- 마켓 목록은 이 저장소 뿌리(`./`)를 플러그인 하나로 싣는다(공식 문서의 자기 저장소에서 내는 꼴). 마켓의 이름은 `chunsik-garage`라 설치는 `chunsik-garage@chunsik-garage`다(설계 5). 마켓과 플러그인 항목의 설명은 플러그인 정보와 같다. 마켓 설명이 없으면 `claude plugin validate`가 경고한다.
- 이름은 이 도구가 스스로를 알아보는 플러그인 이름(`SELF_PLUGIN_NAMES`, 정비 후보에서 이 도구를 빼는 데 쓴다)과 같아야 해서 시험이 둘을 견준다.
- 그림 이용 조건(`skills/aq/assets/ART-LICENSE.md`)은 3단계 2부에서 이미 두었고 `test/report/assets.test.ts`가 본다. 이 과제는 고치지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/plugin/manifest.test.ts`(새 파일):

```ts
// Claude Code 플러그인 정보와 마켓 목록이 설계의 약속대로인지 본다(설계 5, 7.1, 23, 「4단계 계획에서 보완」). 그림 이용 조건은 test/report/assets.test.ts가 본다
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SELF_PLUGIN_NAMES } from "../../src/commands/self.ts";

const read = (path: string): string => readFileSync(path, "utf8");
const json = (path: string): Record<string, unknown> => JSON.parse(read(path)) as Record<string, unknown>;
const pkg = json("package.json");

/** 플러그인 정보에 쓰는 열쇠. 설계 7.1의 꼭 넣는 것(name, version, description, author, repository, license)에 화면 이름, 집, 찾기 낱말을 더했다 */
const PLUGIN_KEYS = ["author", "description", "displayName", "homepage", "keywords", "license", "name", "repository", "version"];

describe("Claude Code 플러그인 정보", () => {
  it("이름은 이 도구가 스스로를 알아보는 플러그인 이름이고, 설명·라이선스는 package.json과 같으며 저작자와 저장소는 정한 값이다", () => {
    const plugin = json(".claude-plugin/plugin.json");
    expect(plugin.name).toBe(SELF_PLUGIN_NAMES[0]);
    expect(plugin.displayName).toBe("Chunsik's Garage");
    expect(plugin.description).toBe(pkg.description);
    expect(plugin.license).toBe("MIT");
    expect(plugin.license).toBe(pkg.license);
    expect(plugin.author).toEqual({ name: "yeunlee1" });
    expect(plugin.repository).toBe("https://github.com/yeunlee1/chunsik-garage");
    expect(plugin.homepage).toBe("https://github.com/yeunlee1/chunsik-garage");
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Array.isArray(plugin.keywords) && plugin.keywords.length > 0 && plugin.keywords.every((word) => typeof word === "string" && word !== "")).toBe(true);
  });

  it("정한 열쇠만 쓴다(메일 같은 개인 정보와 쓰지 않는 구성 요소를 넣지 않는다)", () => {
    expect(Object.keys(json(".claude-plugin/plugin.json")).sort()).toEqual(PLUGIN_KEYS);
  });
});

describe("Claude Code 마켓 목록", () => {
  it("이 저장소 뿌리(./)를 플러그인 하나로 싣고, 마켓과 플러그인의 이름·설명·버전이 플러그인 정보와 같다", () => {
    const plugin = json(".claude-plugin/plugin.json");
    const market = json(".claude-plugin/marketplace.json");
    expect(market.name).toBe("chunsik-garage");
    expect(market.description).toBe(plugin.description);
    expect(market.owner).toEqual({ name: "yeunlee1" });
    expect(Object.keys(market).sort()).toEqual(["description", "name", "owner", "plugins"]);
    expect(market.plugins).toEqual([{ name: plugin.name, source: "./", description: plugin.description, version: plugin.version }]);
  });
});

```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/plugin/manifest.test.ts`
Expected: FAIL. 시험 3개가 `.claude-plugin/plugin.json`(과 마켓 목록)을 찾지 못해 실패한다(`ENOENT`).

- [ ] **Step 3: 구현한다**

`.claude-plugin/marketplace.json`(새 파일):

```json
{
  "name": "chunsik-garage",
  "description": "AQ checkup for Claude Code and Codex: scores how well you set up and use your AI coding tools, computed on your own PC.",
  "owner": {
    "name": "yeunlee1"
  },
  "plugins": [
    {
      "name": "chunsik-garage",
      "source": "./",
      "description": "AQ checkup for Claude Code and Codex: scores how well you set up and use your AI coding tools, computed on your own PC.",
      "version": "0.1.0"
    }
  ]
}
```

`.claude-plugin/plugin.json`(새 파일):

```json
{
  "name": "chunsik-garage",
  "displayName": "Chunsik's Garage",
  "version": "0.1.0",
  "description": "AQ checkup for Claude Code and Codex: scores how well you set up and use your AI coding tools, computed on your own PC.",
  "author": {
    "name": "yeunlee1"
  },
  "homepage": "https://github.com/yeunlee1/chunsik-garage",
  "repository": "https://github.com/yeunlee1/chunsik-garage",
  "license": "MIT",
  "keywords": [
    "aq",
    "checkup",
    "claude-code",
    "codex",
    "ai-tools"
  ]
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/plugin/manifest.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 3개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/plugin/manifest.test.ts .claude-plugin/marketplace.json .claude-plugin/plugin.json
git commit -m "feat: Claude Code 플러그인 정보와 마켓 목록을 더함"
```

---

### Task 2: 버전 일치 검사

**Files:**
- Create: `scripts/check-versions.mjs`
- Create: `scripts/version-scan.d.mts`
- Create: `scripts/version-scan.mjs`
- Modify: `package.json`
- Modify: `src/version.ts`
- Test: `test/scripts/version-scan.test.ts`

**Interfaces:**
- Consumes: 과제 1의 `.claude-plugin/plugin.json`과 `.claude-plugin/marketplace.json`, 1단계의 `PROGRAM_VERSION`(`src/version.ts`), `package.json`의 `version`과 `scripts.check`.
- Produces: `VERSION_FILES`, `readVersions(root)`, `versionProblems(entries)`(`scripts/version-scan.mjs`와 타입 선언 `scripts/version-scan.d.mts`), 실행 파일 `scripts/check-versions.mjs`. `npm run check`의 마지막 단계가 된다.

설계 7.1, 「4단계 계획에서 보완」의 5번이다.

- 버전을 읽는 곳은 넷이다. `package.json`, 프로그램 안의 버전(`src/version.ts`의 `PROGRAM_VERSION` 줄. 줄의 맨 앞에서 시작해야 해서 주석에 적힌 꼴은 읽지 않고, 두 번 나오면 찾지 못한 것으로 본다), 플러그인 정보, 마켓 목록의 이 플러그인 항목이다. 버전 꼴은 숫자 셋을 점으로 이은 것이다. Codex 매니페스트 둘은 5단계에서 더한다.
- 읽지 못한 곳은 까닭(읽지 못함과 오류 코드, JSON으로 풀리지 않음, 버전을 찾지 못함)과 함께 한 줄씩 알리고, 읽은 버전이 서로 다르면 어느 파일이 어떤 버전인지 모두 적은 한 줄을 알린다. 알릴 것이 있으면 1로 끝나고 없으면 `버전 검사 통과`를 낸다.
- 시험은 네 곳 가운데 어느 한 곳만 달라도 알리는지를 네 곳마다 본다. 마켓 목록에 이 플러그인 항목이 둘이면 버전이 같아도 찾지 못한 것으로 본다. 실행 파일은 프로그램 안의 버전만 다를 때, `package.json`만 다를 때, 마켓 항목이 둘일 때 1로 끝난다(계획 리뷰 1차에서 짝 Codex 1이 비교에서 한 파일을 빠뜨리거나 중복 항목의 첫 것을 읽는 틀린 구현을 시험이 놓친다고 찾았다).
- 묶음 검사처럼 함수 파일(시험이 가져다 쓴다)과 실행 파일을 나눈다. `npm run check`는 묶음 검사 뒤에 버전 검사를 돌린다. 프로그램 안의 버전의 주석도 이 검사를 가리키게 고친다(묶은 실행 파일에는 주석이 들지 않아 그대로다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scripts/version-scan.test.ts`(새 파일):

```ts
// 버전이 쓰이는 네 곳(package.json, 프로그램 안의 버전, Claude Code 플러그인 정보와 마켓 목록)을 읽어 서로 다르거나 읽지 못하면 알리는 검사를 시험한다(설계 7.1, 「4단계 계획에서 보완」)
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readVersions, VERSION_FILES, versionProblems } from "../../scripts/version-scan.mjs";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

/** 네 곳에 버전을 쓴다. 바꿀 곳만 넘기면 나머지는 기본 꼴이다 */
async function writeAll(version: string, override: Partial<Record<(typeof VERSION_FILES)[number], string>> = {}): Promise<void> {
  const files: Record<(typeof VERSION_FILES)[number], string> = {
    "package.json": JSON.stringify({ name: "chunsik-garage", version }),
    "src/version.ts": `// 프로그램 버전\nexport const PROGRAM_VERSION = "${version}";\n`,
    ".claude-plugin/plugin.json": JSON.stringify({ name: "chunsik-garage", version }),
    ".claude-plugin/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version }] }),
    ...override,
  };
  for (const [file, text] of Object.entries(files)) await put(join(root, file), text);
}

describe("버전 읽기와 견주기", () => {
  it("네 곳의 버전을 정한 차례로 읽고, 모두 같으면 알릴 것이 없다", async () => {
    await writeAll("0.2.0");
    const entries = readVersions(root);
    expect(entries.map((entry) => entry.file)).toEqual([...VERSION_FILES]);
    expect(entries.map((entry) => entry.version)).toEqual(["0.2.0", "0.2.0", "0.2.0", "0.2.0"]);
    expect(versionProblems(entries)).toEqual([]);
  });

  /** 한 곳만 0.2.1로 쓴 글 */
  const bumped: Record<(typeof VERSION_FILES)[number], string> = {
    "package.json": JSON.stringify({ name: "chunsik-garage", version: "0.2.1" }),
    "src/version.ts": 'export const PROGRAM_VERSION = "0.2.1";\n',
    ".claude-plugin/plugin.json": JSON.stringify({ name: "chunsik-garage", version: "0.2.1" }),
    ".claude-plugin/marketplace.json": JSON.stringify({ name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.1" }] }),
  };
  it.each([...VERSION_FILES])("%s 한 곳만 달라도 어느 파일이 어떤 버전인지 모두 적어 알린다", async (file) => {
    await writeAll("0.2.0", { [file]: bumped[file] });
    const listed = VERSION_FILES.map((name) => `${name} ${name === file ? "0.2.1" : "0.2.0"}`).join(", ");
    expect(versionProblems(readVersions(root))).toEqual([`버전이 다르다: ${listed}`]);
  });

  it("마켓 목록에 이 플러그인 항목이 둘이면 버전이 같아도 찾지 못한 것으로 본다", async () => {
    const twice = { name: "chunsik-garage", plugins: [{ name: "chunsik-garage", source: "./", version: "0.2.0" }, { name: "chunsik-garage", source: "./", version: "0.2.0" }] };
    await writeAll("0.2.0", { ".claude-plugin/marketplace.json": JSON.stringify(twice) });
    expect(versionProblems(readVersions(root))).toEqual([".claude-plugin/marketplace.json: 버전을 찾지 못함"]);
  });

  it("파일이 없거나 JSON으로 풀리지 않으면 그 까닭을 알린다", async () => {
    await writeAll("0.2.0", { ".claude-plugin/plugin.json": "{ not json" });
    await removeTemp(join(root, "package.json"));
    expect(versionProblems(readVersions(root))).toEqual(["package.json: 읽지 못함(ENOENT)", ".claude-plugin/plugin.json: JSON으로 풀리지 않음"]);
  });

  it("버전 꼴(숫자.숫자.숫자)이 아니거나, 프로그램 안의 버전이 한 번이 아니거나, 마켓 목록에 이 플러그인이 하나가 아니면 찾지 못한 것으로 본다", async () => {
    await writeAll("0.2.0", {
      "package.json": JSON.stringify({ version: "0.2" }),
      "src/version.ts": 'export const PROGRAM_VERSION = "0.2.0";\nexport const PROGRAM_VERSION = "0.2.0";\n',
      ".claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "other", version: "0.2.0" }] }),
    });
    expect(versionProblems(readVersions(root))).toEqual(["package.json: 버전을 찾지 못함", "src/version.ts: 버전을 찾지 못함", ".claude-plugin/marketplace.json: 버전을 찾지 못함"]);
  });

  it("주석에 적힌 버전 꼴의 글은 프로그램 안의 버전으로 읽지 않는다", async () => {
    await writeAll("0.2.0", { "src/version.ts": '// export const PROGRAM_VERSION = "9.9.9";\nexport const PROGRAM_VERSION = "0.2.0";\n' });
    expect(readVersions(root)[1]!.version).toBe("0.2.0");
  });

  it("이 저장소의 버전은 모두 같다", () => {
    expect(versionProblems(readVersions(resolve(".")))).toEqual([]);
  });
});

describe("버전 검사 실행", () => {
  it("모두 같으면 통과를 알리고 0으로 끝나며, 다르면 까닭을 알리고 1로 끝난다", async () => {
    const script = resolve("scripts/check-versions.mjs");
    const ok = spawnSync(process.execPath, [script], { cwd: resolve("."), encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim()).toBe("버전 검사 통과");
    await writeAll("0.2.0", { "src/version.ts": 'export const PROGRAM_VERSION = "0.3.0";\n' });
    const bad = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("버전이 다르다: package.json 0.2.0, src/version.ts 0.3.0");
    // package.json만 다를 때와 마켓에 이 플러그인 항목이 둘일 때도 1로 끝난다
    await writeAll("0.2.0", { "package.json": JSON.stringify({ name: "chunsik-garage", version: "0.2.1" }) });
    expect(spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" }).status).toBe(1);
    await writeAll("0.2.0", { ".claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "chunsik-garage", version: "0.2.0" }, { name: "chunsik-garage", version: "0.2.0" }] }) });
    const twice = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(twice.status).toBe(1);
    expect(twice.stderr).toContain(".claude-plugin/marketplace.json: 버전을 찾지 못함");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scripts/version-scan.test.ts`
Expected: FAIL. `test/scripts/version-scan.test.ts`가 `../../scripts/version-scan.mjs`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`package.json`(찾을 곳):

```json
    "check": "npm run typecheck && npm test && node scripts/check-bundle.mjs"
```

`package.json`(바꾼 뒤):

```json
    "check": "npm run typecheck && npm test && node scripts/check-bundle.mjs && node scripts/check-versions.mjs"
```

`scripts/check-versions.mjs`(새 파일):

```js
// 버전이 쓰이는 곳이 모두 같은지 본다. npm run check가 마지막에 돌린다(설계 7.1)
import { readVersions, versionProblems } from "./version-scan.mjs";

const problems = versionProblems(readVersions(process.cwd()));
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log("버전 검사 통과");
```

`scripts/version-scan.d.mts`(새 파일):

```ts
// version-scan.mjs의 타입 선언. 시험(TypeScript)이 가져다 쓴다
export declare const VERSION_FILES: readonly ["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"];

export interface VersionEntry {
  file: (typeof VERSION_FILES)[number];
  version: string | null;
  problem: string | null;
}

export declare function readVersions(root: string): VersionEntry[];
export declare function versionProblems(entries: readonly VersionEntry[]): string[];
```

`scripts/version-scan.mjs`(새 파일):

```js
// 버전이 쓰이는 곳을 읽고 서로 견준다. check-versions와 시험이 같이 쓴다(설계 7.1)
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 버전을 읽는 곳(저장소 뿌리에서의 경로)과 차례. Codex 매니페스트 둘은 5단계에서 더한다 */
export const VERSION_FILES = ["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"];

const SEMVER = /^\d+\.\d+\.\d+$/;
/** 프로그램 안의 버전 줄. 줄의 맨 앞에서 시작해야 해서 주석에 적힌 꼴은 읽지 않는다 */
const PROGRAM_VERSION_LINE = /^export const PROGRAM_VERSION = "([^"]*)";\r?$/gm;

/** 파일의 글에서 버전을 뽑는다. 찾지 못하면 undefined이고, JSON이 풀리지 않으면 던진다 */
const READERS = {
  "package.json": (text) => JSON.parse(text).version,
  "src/version.ts": (text) => {
    const found = [...text.matchAll(PROGRAM_VERSION_LINE)];
    return found.length === 1 ? found[0][1] : undefined;
  },
  ".claude-plugin/plugin.json": (text) => JSON.parse(text).version,
  ".claude-plugin/marketplace.json": (text) => {
    const plugins = JSON.parse(text).plugins;
    const own = Array.isArray(plugins) ? plugins.filter((plugin) => plugin?.name === "chunsik-garage") : [];
    return own.length === 1 ? own[0].version : undefined;
  },
};

/** 뿌리 폴더에서 정한 차례로 버전을 읽는다. 읽지 못하면 version이 null이고 problem에 까닭을 적는다 */
export function readVersions(root) {
  return VERSION_FILES.map((file) => {
    let text;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch (error) {
      return { file, version: null, problem: `읽지 못함(${error?.code ?? "unknown"})` };
    }
    let version;
    try {
      version = READERS[file](text);
    } catch {
      return { file, version: null, problem: "JSON으로 풀리지 않음" };
    }
    if (typeof version !== "string" || !SEMVER.test(version)) return { file, version: null, problem: "버전을 찾지 못함" };
    return { file, version, problem: null };
  });
}

/** 알릴 것의 목록. 읽지 못한 곳마다 한 줄, 읽은 버전이 서로 다르면 모두를 적은 한 줄이다. 모두 같으면 빈 목록이다 */
export function versionProblems(entries) {
  const problems = entries.filter((entry) => entry.problem !== null).map((entry) => `${entry.file}: ${entry.problem}`);
  const found = entries.filter((entry) => entry.version !== null);
  if (new Set(found.map((entry) => entry.version)).size > 1) problems.push(`버전이 다르다: ${found.map((entry) => `${entry.file} ${entry.version}`).join(", ")}`);
  return problems;
}
```

`src/version.ts`(찾을 곳):

```ts
// 프로그램 버전. package.json과 같아야 한다(4단계에서 매니페스트까지 맞추는 검사를 붙인다)
```

`src/version.ts`(바꾼 뒤):

```ts
// 프로그램 버전. package.json, Claude Code 플러그인 정보와 마켓 목록의 버전과 같아야 하고 npm run check의 버전 검사가 본다(설계 7.1. Codex 매니페스트는 5단계에서 더한다)
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scripts/version-scan.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 11개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scripts/version-scan.test.ts package.json scripts/check-versions.mjs scripts/version-scan.d.mts scripts/version-scan.mjs src/version.ts
git commit -m "feat: 버전이 쓰이는 곳이 모두 같은지 보는 검사를 더함"
```

---

### Task 3: 스킬 본문

**Files:**
- Create: `skills/aq/SKILL.md`
- Modify: `skills/aq/scripts/aq.mjs`
- Modify: `src/cli.ts`
- Modify: `src/commands/run-notices.ts`
- Test: `test/plugin/skill.test.ts`

**Interfaces:**
- Consumes: 과제 1의 플러그인 이름, 3단계까지의 `checkupArgs`(`src/cli.ts`, 이 과제에서 내보낸다), 실행 알림의 문장 표(`src/commands/run-notices.ts`, 종류의 목록을 이 과제에서 내보낸다), `NOTICE_KINDS`(`src/core/result/notices.ts`), `checkupSummary`(`src/core/result/summary.ts`), `main`(`src/cli.ts`), `SELF_SKILL_NAMES`(`src/commands/self.ts`).
- Produces: `skills/aq/SKILL.md`, `checkupArgs`를 내보냄(`src/cli.ts`), `RUN_NOTICE_KINDS`(`src/commands/run-notices.ts`). 과제 4가 스킬 본문을 산출물에 담는다.

설계 7.1, 7.4, 12.3, 13.2, 15, 「4단계 계획에서 보완」의 2·3·4·6번, 3단계 2부 계획의 「4단계와 그 뒤에 넘기는 것」의 첫 줄이다.

- 스킬 이름은 `aq`이고 머리말은 이름, 설명, 허락 규칙 셋뿐이다. 설명은 영어로 쓰고 한국어로 부르는 말("AQ 점검해 줘")을 담으며, 목록에 다 실리는 1,536자 안이고 꺾쇠가 없다(공식 문서. 꺾쇠는 목록에서 다른 글자로 보인다).
- 허락 규칙 `Bash(node "${CLAUDE_SKILL_DIR}/scripts/aq.mjs" *)`과 본문의 명령 `node "${CLAUDE_SKILL_DIR}/scripts/aq.mjs" checkup --lang <lang>`은 같은 꼴로 시작한다. Claude Code는 두 곳의 `${CLAUDE_SKILL_DIR}`를 같은 실제 경로로 바꾸므로 묶은 실행 파일 명령은 사용자에게 묻지 않고 돈다. 경로는 큰따옴표로 감싸 공백과 한글이 든 경로에서도 돈다(설계 6.3). 이 둘은 주 세션이 기본 권한 모드와 공백·한글이 든 경로로 실제로 돌려 확인했다(「4단계 계획에서 보완」의 2번).
- 본문은 모델이 읽는 지시라 영어로 쓰고, 터미널에 쓰는 틀은 두 언어로 둔다. 언어는 사용자와 나누는 대화의 언어를 `--lang`으로 넘기고(설계 13.2), 결과는 `summary.lang`의 언어로 쓴다. 시작 줄은 프로그램을 돌리기 전이라 `summary.lang`을 모르므로 `--lang ko`를 넘길 때만 한국어 줄, 그 밖에는 영어 줄이다(계획 리뷰 1차의 짝 Codex 1). 숫자와 문장은 요약에 있는 것을 그대로 옮기고 셈하거나 지어내지 않는다(설계 15). 결과는 여섯 줄 안이고 코드 블록으로 감싸지 않는다.
- 말하는 쪽과 얼굴은 설계 15의 표를 따른다. 결과의 얼굴은 등급 단계 3~5(S, A, B)이면 `(^o^)`, 1~2(C, D)이면 `(O_O)!`, AQ가 없으면 `(o_o)`다. 먼저 고칠 것은 춘식이의 `(-_-)9`이고 첫 항목 하나만 쓴다. 고칠 것이 없다는 문장은 춘삼이의 칭찬 `(^_^)b`다. 말투 표는 짧아 본문에 두고 `references/`는 정비(6단계)와 정밀 점검(7단계) 절차가 생길 때 만든다.
- 결과 화면의 줄과 알림(3단계 2부가 넘긴 것)은 본문 4절의 표 둘로 적는다. 결과 화면 줄의 표는 맞는 첫 행을 쓴다. 결과 화면이 없으면 `report_unwritten`의 문장, 열지 못했으면 `report_unopened`의 문장과 경로, `--no-open`이면 경로, 그 밖에는 열었다는 말이다. 알림 줄의 표는 실행 알림 여덟을 한 행씩 두고 차례가 우선순위다. 알림에 든 첫 종류의 행대로 하고 다른 알림은 쓰지 않는다. `report_failed`, `save_failed`, `result_unwritten`, `not_saved`(사용자가 저장하지 말라고 하지 않았을 때)는 그 종류의 문장을 쓰고, 결과 화면 줄이 이미 말하는 `report_unwritten`과 `report_unopened`, 정리의 `prune_failed`와 `prune_skipped`는 쓰지 않는다. 표로 적은 것은 계획 리뷰 1차에서 짝 Codex 1이 조건과 그때 쓸 문장의 짝을 바꿔도 시험이 놓친다고 찾아서다. AQ를 내지 않았으면 먼저 고칠 것의 줄이 비므로 쓰지 않고, 결과 줄에 `score_withheld` 알림의 문장을 쓴다.
- 실패는 셋이다. `node`가 없거나 Node.js 22보다 낮으면(종료 코드 2) Node.js 22 이상이 필요하다고 알리고 멈춘다. 오류로 멈추면(종료 코드 1, `{"error": {...}}`) 춘식이의 `(;_;)` 한 줄로 `error.code`를 알리고 까닭을 짐작하지 않는다.
- `${CLAUDE_SKILL_DIR}`를 바꾸지 않는 도구(Codex)에서는 이 SKILL.md가 있는 폴더의 `scripts/aq.mjs`를 쓰라고 적는다. Codex에서 실제로 도는지는 5단계가 본다.
- 시험은 본문과 프로그램이 맞물리는지 본다. 머리말 셋, 명령과 허락 규칙의 꼴, `checkup`이 받는 인자와 옵션과 넘긴 언어(`checkupArgs`를 내보내 쓴다), 본문이 읽으라는 `summary`와 `run`의 칸이 끝까지 바른 꼴이고 실제 출력에 있는지(AQ가 없는 빈 홈의 출력과, AQ와 먼저 고칠 것이 있는 요약), 두 언어 틀에서 AQ·등급·별명과 제목·덧붙이는 말의 자리 짝, 본문이 말하는 알림 종류가 실제 종류인지, 결과 화면 줄의 표에서 조건과 문장의 종류가 같은지, 알림 줄의 표가 실행 알림 여덟을 우선순위대로 한 번씩 두고 행마다 그 종류의 문장을 쓰거나 쓰지 않는지(`RUN_NOTICE_KINDS`를 내보내 쓴다), 상황 표의 일곱 행과 틀의 줄마다의 말하는 쪽과 얼굴, 실패할 때의 안내다.
- 칸의 경로는 처음 이름(`summary`, `run`) 뒤에 칸 이름(숫자와 밑줄을 품을 수 있다)과 배열 자리가 끝까지 이어진 꼴만 받는다. 계획 리뷰 1차에서 짝 Codex 2가 경로의 앞부분만 읽어 없는 칸(`detail2`)과 잘못된 배열 자리(`[0x]`)를 통과시킨다고 찾았다. 시험은 이 두 반례를 확인 함수가 받지 않는 것도 본다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/plugin/skill.test.ts`(새 파일):

```ts
// 스킬 본문(skills/aq/SKILL.md)이 프로그램과 약속대로 맞물리는지 본다. 머리말, 실행 명령과 허락 규칙, 옵션, 본문이 읽으라는 요약과 실행 기록의 칸, 틀의 칸 짝, 알림 표, 말하는 쪽과 얼굴, 실패할 때다(설계 7.1, 7.4, 12.3, 15, 「4단계 계획에서 보완」)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkupArgs, main, type CliContext } from "../../src/cli.ts";
import { RUN_NOTICE_KINDS } from "../../src/commands/run-notices.ts";
import { SELF_SKILL_NAMES } from "../../src/commands/self.ts";
import { findingText, type FindingInput } from "../../src/core/copy/findings.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type ResultFinding } from "../../src/core/result/assemble.ts";
import { NOTICE_KINDS } from "../../src/core/result/notices.ts";
import { checkupSummary } from "../../src/core/result/summary.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const source = readFileSync("skills/aq/SKILL.md", "utf8").replace(/\r\n/g, "\n");
const parts = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
if (parts === null) throw new Error("SKILL.md의 머리말을 찾지 못했다");
const head: Record<string, string> = Object.fromEntries(
  parts[1]!.split("\n").map((line) => {
    const at = line.indexOf(": ");
    return [line.slice(0, at), line.slice(at + 2)];
  }),
);
const body = parts[2]!;
/** 실행 파일을 부르는 꼴. 허락 규칙과 본문의 명령이 같은 꼴로 시작해야 묻지 않고 돈다 */
const COMMAND = 'node "${CLAUDE_SKILL_DIR}/scripts/aq.mjs"';
/** 본문의 한 절(제목부터 다음 같은 단계의 제목 앞까지) */
const section = (title: string): string => {
  const start = body.indexOf(title);
  if (start < 0) throw new Error(`절이 없다: ${title}`);
  const next = body.indexOf("\n## ", start + title.length);
  return body.slice(start, next < 0 ? body.length : next);
};
/** 마크다운 표의 몸 줄을 칸으로 나눈다. 머리 줄과 구분 줄은 뺀다 */
const tableRows = (text: string, header: string): string[][] => {
  const lines = text.split("\n");
  const at = lines.indexOf(header);
  if (at < 0) throw new Error(`표가 없다: ${header}`);
  const rows: string[][] = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(line.slice(1, -1).split(" | ").map((cell) => cell.trim()));
  }
  return rows;
};

describe("머리말", () => {
  it("이름, 설명, 허락 규칙 셋만 두고, 이름은 이 도구가 스스로를 알아보는 스킬 이름이다", () => {
    expect(Object.keys(head)).toEqual(["name", "description", "allowed-tools"]);
    expect(head.name).toBe(SELF_SKILL_NAMES[0]);
  });

  it("설명은 목록에 다 실리는 1,536자 안이고 꺾쇠가 없으며, 영어와 한국어로 부르는 말을 담는다", () => {
    expect(head.description!.length).toBeLessThanOrEqual(1536);
    expect(head.description).not.toMatch(/[<>]/);
    expect(head.description).toContain("AQ checkup");
    expect(head.description).toContain("AQ 점검해 줘");
  });

  it("허락 규칙은 실행 파일 명령 하나만 묻지 않고 돌게 한다", () => {
    expect(head["allowed-tools"]).toBe(`Bash(${COMMAND} *)`);
  });
});

describe("실행 명령", () => {
  it("본문의 명령은 모두 허락 규칙과 같은 꼴로 시작하고, checkup 뒤의 인자를 프로그램이 받으며 넘긴 언어가 그대로 읽힌다", () => {
    const commands = [...body.matchAll(/^\s*(node .*)$/gm)].map((match) => match[1]!.trim());
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command.startsWith(`${COMMAND} checkup `)).toBe(true);
      const args = command.slice(`${COMMAND} checkup `.length).replace("<lang>", "ko").split(" ");
      expect(checkupArgs(args)).toEqual({ flags: new Set(), lang: "ko" });
    }
  });

  it("본문이 붙이라고 하는 옵션은 checkup이 받는 셋이다", () => {
    const options = [...new Set([...body.matchAll(/`(--[a-z-]+)`/g)].map((match) => match[1]!))].sort();
    expect(options).toEqual(["--no-open", "--no-save", "--rescan"]);
    for (const option of options) expect(checkupArgs(["--lang", "ko", option])).not.toBeNull();
  });
});

const collected: CollectedTool = {
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
};
const finding = (ruleId: ResultFinding["ruleId"], input: Partial<FindingInput>): ResultFinding => {
  const base: FindingInput = { ruleId, axis: "efficiency", kind: "share", weight: 2, status: "scored", reason: null, value: 0.5, score: 0.5, category: "average", severity: null, gain: null, evidence: {}, tools: [], candidates: [], ...input };
  const details = { safeguards: [], unjudgedServers: [] };
  return { ...base, text: { en: findingText(base, details, "en"), ko: findingText(base, details, "ko") } };
};
/** AQ와 가장 잘하는 것과 먼저 고칠 것이 있는 요약 */
function scoredSummary(): unknown {
  const sessions = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
  const input = evaluationInput([claudeTool({ sessions })]);
  const result = checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
  return checkupSummary({ ...result, findings: [finding("E1", { category: "strength", value: 0.95, score: 1 }), finding("E3", { category: "repair", gain: 6, severity: "critical" })] }, "C:/report.html");
}

/** 칸의 경로 하나. 처음 이름(summary, run) 뒤에 칸 이름(.이름)이나 배열 자리([숫자] 또는 모든 원소 [])가 이어지고 끝까지 그 꼴이어야 한다 */
const PATH = /^(summary|run)((?:\.[A-Za-z][A-Za-z0-9_]*|\[\d*\])+)$/;
/** 경로를 조각으로 나눈다. 끝까지 바른 꼴이 아니면 null이다 */
function pathSteps(path: string): string[] | null {
  const match = PATH.exec(path);
  return match === null ? null : [match[1]!, ...match[2]!.match(/\.[A-Za-z][A-Za-z0-9_]*|\[\d*\]/g)!];
}
/** 경로를 따라가 끝까지 닿는 값이 하나라도 있는지 본다. 값이 null이어도 칸이 있으면 닿은 것이다. 바른 꼴이 아니면 닿지 않는다 */
function reaches(output: Record<string, unknown>, path: string): boolean {
  const steps = pathSteps(path);
  if (steps === null) return false;
  const [first, ...rest] = steps;
  let values: unknown[] = first! in output ? [output[first!]] : [];
  for (const step of rest) {
    if (step.startsWith(".")) {
      const key = step.slice(1);
      values = values.filter((value) => value !== null && typeof value === "object" && key in value).map((value) => (value as Record<string, unknown>)[key]);
    } else if (step === "[]") values = values.flatMap((value) => (Array.isArray(value) ? value : []));
    else values = values.flatMap((value) => (Array.isArray(value) && Number(step.slice(1, -1)) < value.length ? [value[Number(step.slice(1, -1))]] : []));
  }
  return values.length > 0;
}

describe("본문이 읽으라는 칸", () => {
  let root: string;
  let unscored: Record<string, unknown>;
  beforeAll(async () => {
    root = await makeTemp();
    await put(join(root, "tmp", ".keep"), "");
    const context: CliContext = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed"), locale: "en-US", open: async () => true };
    let printed = "";
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      printed += String(chunk);
      return true;
    });
    await main(["checkup", "--no-save", "--lang", "ko"], context);
    write.mockRestore();
    unscored = JSON.parse(printed) as Record<string, unknown>;
  });
  afterAll(async () => removeTemp(root));

  it("본문에 적힌 summary와 run의 칸은 모두 끝까지 바른 꼴이고, 프로그램이 내는 칸이다(AQ가 없는 빈 홈의 출력이나, AQ와 먼저 고칠 것이 있는 요약 가운데 하나에 있다)", () => {
    // 처음 이름 바로 뒤가 점이나 대괄호인 것만 경로다(running 같은 낱말은 아니다). 칸 이름에 붙은 숫자·밑줄과 대괄호 안의 글까지 한 덩어리로 잡고, 문장 끝의 마침표만 뗀다
    const paths = [...new Set([...body.matchAll(/(?<![\w.])((?:summary|run)(?=[.[])(?:[\w.]|\[[^\]\s]*\])*)/g)].map((match) => match[1]!.replace(/\.+$/, "")))].filter((path) => path !== "summary" && path !== "run");
    expect(paths.length).toBeGreaterThan(10);
    const scored = { summary: scoredSummary(), run: unscored.run };
    for (const path of paths) expect([path, pathSteps(path) !== null && (reaches(unscored, path) || reaches(scored, path))]).toEqual([path, true]);
  });

  it("경로를 따라가는 확인은 없는 칸, 끝에 글자가 붙은 칸, 잘못된 배열 자리를 받지 않는다", () => {
    const scored = { summary: scoredSummary(), run: unscored.run };
    expect(reaches(scored, "summary.text.best.detail")).toBe(true);
    expect(reaches(scored, "summary.text.fixFirst[0].title")).toBe(true);
    expect(reaches(unscored, "run.notices[].kind")).toBe(true);
    expect(reaches(scored, "summary.text.best.detail2")).toBe(false);
    expect(reaches(scored, "summary.text.fixFirst[0x].title")).toBe(false);
    expect(reaches(scored, "summary.text.fixFirst[5].title")).toBe(false);
    expect(pathSteps("summary.text..best")).toBeNull();
  });
});

describe("틀의 칸 짝", () => {
  const count = (fragment: string): number => body.split(fragment).length - 1;

  it("두 언어의 틀마다 결과 줄은 AQ와 등급과 별명의 자리를, 가장 잘하는 것과 먼저 고칠 것은 제목과 덧붙이는 말의 자리를 바르게 짝짓는다", () => {
    expect(count("AQ <summary.aq> · <summary.grade>등급 「<summary.text.grade>」")).toBe(1);
    expect(count('AQ <summary.aq> · Grade <summary.grade> "<summary.text.grade>"')).toBe(1);
    expect(count("<summary.text.best.title> (<summary.text.best.detail>)")).toBe(2);
    expect(count("<summary.text.fixFirst[0].title> (<summary.text.fixFirst[0].detail>)")).toBe(2);
    expect(count("(^_^)b <summary.text.noFixFirst>")).toBe(2);
  });
});

describe("알림 표", () => {
  /** 알림 종류는 두 글자 넘는 소문자 마디를 밑줄로 이은 낱말이다(얼굴 (o_o)의 o_o 같은 한 글자 마디는 아니다) */
  const kindsIn = (text: string): string[] => [...new Set([...text.matchAll(/\b([a-z]{2,}(?:_[a-z]{2,})+)\b/g)].map((match) => match[1]!))];
  const notices = section("## 4. The report page and notices");

  it("본문이 말하는 알림 종류는 프로그램이 내는 종류다", () => {
    const known = new Set<string>([...RUN_NOTICE_KINDS, ...NOTICE_KINDS]);
    for (const kind of kindsIn(body)) expect([kind, known.has(kind)]).toEqual([kind, true]);
    expect(kindsIn(section("## 3. What to tell the user"))).toEqual(["score_withheld"]);
  });

  it("결과 화면 줄의 표는 맞는 첫 행을 쓰고, 알림 종류가 조건인 행은 그 종류의 문장을 쓴다", () => {
    const rows = tableRows(notices, "| When | Write |");
    expect(rows.map((row) => row[0])).toEqual(["`summary.reportPath` is null", "`report_unopened` is in the notices", "You ran with `--no-open`", "Otherwise"]);
    expect(rows[0]![1]).toMatch(/^the sentence of `report_unwritten`\./);
    expect(rows[1]![1]).toBe("the sentence of `report_unopened`, then `summary.reportPath`");
    for (const [when, write] of rows) {
      const conditions = kindsIn(when!);
      if (conditions.length > 0) expect([when, kindsIn(write!)]).toEqual([when, conditions]);
    }
  });

  it("알림 줄의 표는 실행 알림 여덟을 한 번씩 우선순위대로 두고, 행마다 그 종류의 문장을 쓰거나 아무것도 쓰지 않는다", () => {
    const rows = tableRows(notices, "| Kind | Notice line |");
    expect(RUN_NOTICE_KINDS).toHaveLength(8);
    expect(rows.map((row) => row[0])).toEqual(["`report_failed`", "`save_failed`", "`result_unwritten`", "`not_saved`", "`report_unwritten`", "`report_unopened`", "`prune_failed`", "`prune_skipped`"]);
    expect(new Set(rows.map((row) => row[0]!.slice(1, -1)))).toEqual(new Set(RUN_NOTICE_KINDS));
    for (const [kindCell, line] of rows) {
      const kind = kindCell!.slice(1, -1);
      const writes = ["report_failed", "save_failed", "result_unwritten", "not_saved"].includes(kind);
      expect([kind, writes ? line!.startsWith(`the sentence of \`${kind}\``) : line!.startsWith("none")]).toEqual([kind, true]);
      expect([kind, kindsIn(line!)]).toEqual([kind, writes ? [kind] : []]);
    }
  });
});

describe("말하는 쪽과 얼굴", () => {
  const CHUNSAM_FACES = ["(o_o)", "(^o^)", "(^_^)b", "(O_O)!"];
  const CHUNSIK_FACES = ["(-_-)9", "(>_<)", "(^_^)v", "(;_;)"];

  it("상황 표는 설계 15와 「4단계 계획에서 보완」 3번의 화자와 얼굴 그대로다", () => {
    expect(tableRows(body, "| Situation | Speaker | Face |")).toEqual([
      ["Starting the checkup", "Chunsam", "`(o_o)`"],
      ["Result with `summary.tier` 3 to 5", "Chunsam", "`(^o^)`"],
      ["Result with `summary.tier` 1 or 2", "Chunsam", "`(O_O)!`"],
      ["Result without an AQ (`summary.aq` is null)", "Chunsam", "`(o_o)`"],
      ["Nothing to fix (`summary.text.noFixFirst`)", "Chunsam", "`(^_^)b`"],
      ["Fix first", "Chunsik", "`(-_-)9`"],
      ["Error", "Chunsik", "`(;_;)`"],
    ]);
  });

  it("틀의 줄마다 춘삼이(📋)는 점검 쪽 얼굴, 춘식이(🔧)는 정비 쪽 얼굴만 쓰고, 시작·칭찬·먼저 고칠 것의 줄은 그 상황의 얼굴이다(결과 줄의 얼굴을 고르는 자리는 <face>다)", () => {
    // 틀은 백틱 안의 글이다. 백틱 밖의 소개 문장(📋 Chunsam (춘삼이) …)은 틀이 아니다
    const frames = [...body.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]!).filter((frame) => /(📋|🔧) (춘삼이|Chunsam|춘식이|Chunsik) /.test(frame));
    expect(frames.length).toBeGreaterThan(5);
    for (const frame of frames) {
      const [, icon, name, face] = /(📋|🔧) (춘삼이|Chunsam|춘식이|Chunsik) (\S+)/.exec(frame)!;
      const chunsam = name === "춘삼이" || name === "Chunsam";
      expect([frame, icon]).toEqual([frame, chunsam ? "📋" : "🔧"]);
      expect([frame, (chunsam ? [...CHUNSAM_FACES, "<face>"] : CHUNSIK_FACES).includes(face!)]).toEqual([frame, true]);
      const expected = /기록을 읽고|Reading your records/.test(frame) ? "(o_o)" : frame.includes("summary.text.noFixFirst") ? "(^_^)b" : frame.includes("summary.text.fixFirst[0]") ? "(-_-)9" : null;
      if (expected !== null) expect([frame, face]).toEqual([frame, expected]);
    }
  });
});

describe("실패할 때", () => {
  it("node가 없거나 Node.js 22 미만(종료 코드 2)이면 22 이상이 필요하다고 알리고, 오류로 멈추면(종료 코드 1) error.code를 알린다", () => {
    // 실패의 절 안에서, 조건(종료 코드)과 같은 줄의 "tell the user" 뒤에 알릴 말이 와야 한다. 조건을 설명하는 앞부분의 같은 낱말로는 통과하지 않는다
    const failing = section("## 2. When the program fails");
    expect(failing).toMatch(/exit code 2[^\n]*tell the user[^\n]*Node\.js 22 or later/);
    expect(failing).toMatch(/exit code 1[^\n]*tell the user[^\n]*`error\.code`/);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/plugin/skill.test.ts`
Expected: FAIL. `test/plugin/skill.test.ts`가 `skills/aq/SKILL.md`를 찾지 못해 불러오기에서 실패한다(`ENOENT`).

- [ ] **Step 3: 구현한다**

`skills/aq/SKILL.md`(새 파일):

```markdown
---
name: aq
description: Run an AQ checkup with Chunsik's Garage. A program on this PC reads the local Claude Code and Codex records, scores how well the user sets up and uses these AI coding tools, writes a one-page report and opens it in the browser, and returns a short summary to relay in the terminal. Use when the user asks for an AQ checkup, their AQ score, or how well they use their AI coding tools. Korean requests such as "AQ 점검해 줘", "AQ 지수", or "춘식이 정비소" mean the same.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/aq.mjs" *)
---

# AQ checkup

A program on this PC computes the AQ score. Run it and relay its summary. The program does all the reading and scoring. Never compute, guess, round, or change a number, and never add an expected gain the summary does not give.

## 1. Run the checkup

1. Pick the language you are using with the user: `ko` for Korean, `en` for English. For any other language pass its two-letter code. The program then falls back to the OS language or English.
2. Write the start line from section 3 before you run the program: the Korean line if you pass `--lang ko`, otherwise the English line.
3. Run this one command, keeping the double quotes around the path:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/aq.mjs" checkup --lang <lang>
   ```

   - Add `--no-save` only if the user asked not to save anything. Add `--no-open` only if the user asked not to open the browser. Add `--rescan` only if the user asked to read every record again.
   - If `${CLAUDE_SKILL_DIR}` was not replaced with a real path, use the absolute path of `scripts/aq.mjs` in the folder that holds this SKILL.md, still in double quotes.
   - Do not run any other command for the checkup. Do not open, list, move, or delete the report or result files yourself.
4. The program prints one JSON object, `{"summary": {...}, "run": {...}}`. Use only the fields named below.

## 2. When the program fails

- The shell cannot find `node`, or the program stops with exit code 2 and says Node.js 22 or later is required: tell the user the checkup needs Node.js 22 or later, then stop.
- The program stops with exit code 1 and prints `{"error": {"code": ..., "message": ...}}`: tell the user the checkup stopped with an error and give `error.code`. Do not retry with other options unless the user asks.
- Write one line as Chunsik with the error face `(;_;)`. Do not guess the cause or add anything the program did not print.

## 3. What to tell the user

Write the result in the language of `summary.lang`, as plain lines, not inside a code block. Use at most six lines. The report page has the details.

Speakers: 📋 Chunsam (춘삼이) checks and reports. 🔧 Chunsik (춘식이) talks about fixing. Put the face right after the name.

| Situation | Speaker | Face |
|---|---|---|
| Starting the checkup | Chunsam | `(o_o)` |
| Result with `summary.tier` 3 to 5 | Chunsam | `(^o^)` |
| Result with `summary.tier` 1 or 2 | Chunsam | `(O_O)!` |
| Result without an AQ (`summary.aq` is null) | Chunsam | `(o_o)` |
| Nothing to fix (`summary.text.noFixFirst`) | Chunsam | `(^_^)b` |
| Fix first | Chunsik | `(-_-)9` |
| Error | Chunsik | `(;_;)` |

Lines, in this order. Copy every `summary.*` and `run.*` value exactly. Indent a line that continues the same speaker.

1. Start, before running: `📋 춘삼이 (o_o)  기록을 읽고 있습니다. 많으면 1~2분 걸립니다.` or `📋 Chunsam (o_o)  Reading your records. This can take a minute or two.`
2. Result.
   - With an AQ: `📋 춘삼이 <face>  점검 끝! AQ <summary.aq> · <summary.grade>등급 「<summary.text.grade>」` or `📋 Chunsam <face>  Checkup done! AQ <summary.aq> · Grade <summary.grade> "<summary.text.grade>"`.
   - Without an AQ: `📋 춘삼이 (o_o)  점검 끝! <the summary.text.notices sentence whose summary.notices kind is score_withheld>` or the same with `Chunsam` and `Checkup done!`. Then, indented, `summary.text.diagnosis`.
3. Best, indented: `가장 잘하는 것  <summary.text.best.title> (<summary.text.best.detail>)` or `Best at  <summary.text.best.title> (<summary.text.best.detail>)`. If `summary.text.best` is null, write `summary.text.noBest` instead, or nothing if that is null too.
4. Fix first: only the first item of `summary.text.fixFirst`, as `🔧 춘식이 (-_-)9 먼저 고칠 것  <summary.text.fixFirst[0].title> (<summary.text.fixFirst[0].detail>)` or `🔧 Chunsik (-_-)9 Fix first  <summary.text.fixFirst[0].title> (<summary.text.fixFirst[0].detail>)`. If `summary.text.fixFirst` is empty and `summary.text.noFixFirst` is not null, write `📋 춘삼이 (^_^)b <summary.text.noFixFirst>` or `📋 Chunsam (^_^)b <summary.text.noFixFirst>`. If both are empty, skip this line.
5. Report line, indented, from section 4.
6. Notice line, indented, from section 4. At most one.

## 4. The report page and notices

`summary.reportPath` is the report page. `run.notices[].kind` names each thing that happened while saving and opening it, and `run.text.notices` has the sentence for each notice in the same order. "The sentence of a kind" below means the `run.text.notices` sentence at the position of that kind.

Report line. Use the first row that applies.

| When | Write |
|---|---|
| `summary.reportPath` is null | the sentence of `report_unwritten`. There is no report page this time |
| `report_unopened` is in the notices | the sentence of `report_unopened`, then `summary.reportPath` |
| You ran with `--no-open` | `결과 화면: <summary.reportPath>` or `Report page: <summary.reportPath>` |
| Otherwise | `결과 화면을 열었습니다.` or `Opened the report page.` |

Notice line. Find the first kind in this table that is in the notices and do what its row says. Write no other notice.

| Kind | Notice line |
|---|---|
| `report_failed` | the sentence of `report_failed` |
| `save_failed` | the sentence of `save_failed` |
| `result_unwritten` | the sentence of `result_unwritten` |
| `not_saved` | the sentence of `not_saved`, unless the user asked not to save |
| `report_unwritten` | none (the report line already says it) |
| `report_unopened` | none (the report line already says it) |
| `prune_failed` | none |
| `prune_skipped` | none |
```

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

`src/cli.ts`(찾을 곳):

```ts
function checkupArgs(rest: readonly string[]): { flags: Set<string>; lang: string | null } | null {
```

`src/cli.ts`(바꾼 뒤):

```ts
export function checkupArgs(rest: readonly string[]): { flags: Set<string>; lang: string | null } | null {
```

`src/commands/run-notices.ts`(찾을 곳):

```ts

export function runNoticeText(notice: RunNotice, lang: Lang): string {
```

`src/commands/run-notices.ts`(바꾼 뒤):

```ts

/** 실행 알림의 종류(문장 표의 차례). 스킬 본문이 종류마다 어떻게 전할지 적었는지 시험이 본다 */
export const RUN_NOTICE_KINDS = Object.keys(LINES.en) as RunNotice["kind"][];

export function runNoticeText(notice: RunNotice, lang: Lang): string {
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/plugin/skill.test.ts test/commands/run-notices.test.ts test/cli.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 26개.

- [ ] **Step 5: 묶은 실행 파일을 다시 만든다**

실행 알림의 종류 목록을 내보내 묶은 실행 파일에 한 줄이 더해진다. 원본에서 다시 만들고 손으로 고치지 않는다.

Run: `npm run build`
Expected: `묶음 완료: skills/aq/scripts/aq.mjs`.

- [ ] **Step 6: 커밋한다**

```bash
git add test/plugin/skill.test.ts skills/aq/SKILL.md skills/aq/scripts/aq.mjs src/cli.ts src/commands/run-notices.ts
git commit -m "feat: AQ 점검 스킬 본문을 더함"
```

---

### Task 4: 플러그인 산출물

**Files:**
- Create: `scripts/pack-plugin.mjs`
- Create: `scripts/plugin-files.d.mts`
- Create: `scripts/plugin-files.mjs`
- Test: `test/scripts/plugin-files.test.ts`

**Interfaces:**
- Consumes: 과제 1의 매니페스트 둘, 과제 3의 스킬 본문, 3단계까지의 묶은 실행 파일과 그림 폴더(`ART_FILES`, `src/report/assets.ts`, 시험만), 저장소 뿌리의 `LICENSE`.
- Produces: `PLUGIN_PATHS`, `packPlugin(root, out)`(`scripts/plugin-files.mjs`와 타입 선언 `scripts/plugin-files.d.mts`), 실행 파일 `scripts/pack-plugin.mjs`(쓰는 법. `node scripts/pack-plugin.mjs <담을 폴더>`). 과제 5의 실제 설치 확인과 8단계의 배포가 쓴다.

설계 6.3, 23, 「4단계 계획에서 보완」의 4번이다.

- Claude Code는 플러그인 뿌리에 `package.json`과 잠금 파일이 함께 있으면 설치할 때마다 의존성을 설치한다(공식 문서). 이 저장소의 뿌리를 그대로 설치하면 개발 의존성(esbuild, Vitest, TypeScript)이 사용자의 PC에 깔린다. 주 세션이 실제로 설치해 86MB가 깔리는 것을 봤다. 사용자는 `npm install`을 하지 않는다는 설계 6.3과 어긋나므로, 사용자에게는 플러그인이 쓰는 파일만 모은 산출물을 준다.
- 산출물에 담는 것은 매니페스트 둘, 스킬 본문, 묶은 실행 파일, 그림 폴더(그림 11장과 그림 이용 조건), 라이선스다. 같은 자리에 같은 내용으로 담는다. 묶은 실행 파일은 자기 위치(`<스킬>/scripts/aq.mjs`)에서 그림 폴더와 자기 정체를 찾으므로 그대로 돈다. Codex 매니페스트(5단계), 세션 시작 훅(7단계), README 두 벌(8단계)은 그 단계에서 더한다.
- 담을 곳이 비어 있지 않거나 담을 것 가운데 하나라도 없으면 아무것도 쓰기 전에 거절한다.
- 사용자가 받는 `main`에 산출물을 올리는 방법(배포 절차와 설치 명령의 브랜치)은 8단계가 정한다(설계 23).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scripts/plugin-files.test.ts`(새 파일):

```ts
// 사용자에게 배포할 플러그인 산출물을 모으는 것을 시험한다. 플러그인이 쓰는 파일만 같은 자리에 같은 내용으로 담고, 개발 도구(package.json, 잠금 파일)와 소스·시험·문서는 담지 않는다(「4단계 계획에서 보완」)
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { packPlugin, PLUGIN_PATHS } from "../../scripts/plugin-files.mjs";
import { ART_FILES } from "../../src/report/assets.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

/** 폴더 안의 파일을 모두 뿌리에서의 경로(빗금)로 늘어놓는다 */
async function filesUnder(dir: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await filesUnder(join(dir, entry.name), path)));
    else found.push(path);
  }
  return found.sort();
}

/** 이 저장소의 산출물에 들어야 할 파일 */
const EXPECTED = [
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  "LICENSE",
  "skills/aq/SKILL.md",
  "skills/aq/assets/ART-LICENSE.md",
  ...Object.values(ART_FILES).map((file) => `skills/aq/assets/${file}`),
  "skills/aq/scripts/aq.mjs",
].sort();

describe("플러그인 산출물", () => {
  it("담는 곳은 매니페스트 둘, 스킬 본문, 묶은 실행 파일, 그림 폴더, 라이선스다", () => {
    expect([...PLUGIN_PATHS]).toEqual([".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/aq/SKILL.md", "skills/aq/scripts/aq.mjs", "skills/aq/assets", "LICENSE"]);
  });

  it("이 저장소에서 모으면 그 파일만 같은 자리에 같은 내용으로 담고, 담은 파일의 목록을 돌려준다", async () => {
    const out = join(root, "out");
    const files = await packPlugin(resolve("."), out);
    expect([...files].sort()).toEqual(EXPECTED);
    expect(await filesUnder(out)).toEqual(EXPECTED);
    for (const file of EXPECTED) expect(await readFile(join(out, file))).toEqual(await readFile(file));
  });

  it("담을 곳이 비어 있지 않으면 아무것도 쓰지 않고 거절한다", async () => {
    const out = join(root, "out");
    await put(join(out, "keep.txt"), "x");
    await expect(packPlugin(resolve("."), out)).rejects.toThrow("담을 곳이 비어 있지 않다");
    expect(await filesUnder(out)).toEqual(["keep.txt"]);
  });

  it("담을 것 가운데 하나라도 없으면 아무것도 쓰지 않고 거절한다", async () => {
    const source = join(root, "src");
    for (const file of EXPECTED.filter((path) => path !== "LICENSE")) await put(join(source, file), "x");
    const out = join(root, "out");
    await expect(packPlugin(source, out)).rejects.toThrow("LICENSE");
    await expect(readdir(out)).rejects.toThrow();
  });
});

describe("산출물 만들기 실행", () => {
  it("담을 곳을 받아 산출물을 만들고 담은 파일 수를 알린다. 담을 곳이 없으면 쓰는 법을 알리고 1로 끝난다", async () => {
    const script = resolve("scripts/pack-plugin.mjs");
    const out = join(root, "out");
    const ok = spawnSync(process.execPath, [script, out], { cwd: resolve("."), encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim()).toBe(`플러그인 산출물 ${EXPECTED.length}개를 ${out}에 담았다`);
    expect(await filesUnder(out)).toEqual(EXPECTED);
    const usage = spawnSync(process.execPath, [script], { cwd: resolve("."), encoding: "utf8" });
    expect(usage.status).toBe(1);
    expect(usage.stderr).toContain("쓰는 법: node scripts/pack-plugin.mjs <담을 폴더>");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scripts/plugin-files.test.ts`
Expected: FAIL. `test/scripts/plugin-files.test.ts`가 `../../scripts/plugin-files.mjs`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`scripts/pack-plugin.mjs`(새 파일):

```js
// 사용자에게 배포할 플러그인 산출물을 받은 폴더에 만든다. 쓰는 법: node scripts/pack-plugin.mjs <담을 폴더>(「4단계 계획에서 보완」)
import { resolve } from "node:path";
import { packPlugin } from "./plugin-files.mjs";

const out = process.argv[2];
if (out === undefined) {
  console.error("쓰는 법: node scripts/pack-plugin.mjs <담을 폴더>");
  process.exit(1);
}
const files = await packPlugin(process.cwd(), resolve(out));
console.log(`플러그인 산출물 ${files.length}개를 ${resolve(out)}에 담았다`);
```

`scripts/plugin-files.d.mts`(새 파일):

```ts
// plugin-files.mjs의 타입 선언. 시험(TypeScript)이 가져다 쓴다
export declare const PLUGIN_PATHS: readonly string[];
export declare function packPlugin(root: string, out: string): Promise<string[]>;
```

`scripts/plugin-files.mjs`(새 파일):

```js
// 사용자에게 배포할 플러그인 산출물(플러그인이 쓰는 파일만)을 한 폴더에 모은다. 저장소 뿌리에는 개발 도구의 package.json과 잠금 파일이 함께 있어, 그대로 설치하면 Claude Code가 개발 의존성을 설치하기 때문이다(「4단계 계획에서 보완」)
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

/** 산출물에 담는 것(저장소 뿌리에서의 경로). 폴더는 안의 파일을 모두 담는다. Codex 매니페스트(5단계), 세션 시작 훅(7단계), README 두 벌(8단계)은 그 단계에서 더한다 */
export const PLUGIN_PATHS = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/aq/SKILL.md", "skills/aq/scripts/aq.mjs", "skills/aq/assets", "LICENSE"];

/** 한 경로 아래의 파일을 이름 차례로 늘어놓는다. 없으면 stat이 던진다 */
async function listFiles(root, path) {
  const info = await stat(join(root, path));
  if (!info.isDirectory()) return [path];
  const names = (await readdir(join(root, path))).sort();
  return (await Promise.all(names.map((name) => listFiles(root, `${path}/${name}`)))).flat();
}

/**
 * root의 산출물을 out에 담고 담은 파일(out에서의 경로)을 돌려준다.
 * out이 비어 있지 않거나 담을 것 가운데 하나라도 없으면, 아무것도 쓰기 전에 던진다
 */
export async function packPlugin(root, out) {
  let existing = [];
  try {
    existing = await readdir(out);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (existing.length > 0) throw new Error(`담을 곳이 비어 있지 않다: ${out}`);
  const files = [];
  for (const path of PLUGIN_PATHS) {
    try {
      files.push(...(await listFiles(root, path)));
    } catch (error) {
      throw new Error(`담을 것을 읽지 못했다: ${path} (${error?.code ?? "unknown"})`);
    }
  }
  for (const file of files) {
    await mkdir(dirname(join(out, file)), { recursive: true });
    await copyFile(join(root, file), join(out, file));
  }
  return files;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scripts/plugin-files.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 5개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scripts/plugin-files.test.ts scripts/pack-plugin.mjs scripts/plugin-files.d.mts scripts/plugin-files.mjs
git commit -m "feat: 배포할 플러그인 산출물을 모으는 스크립트를 더함"
```

---

### Task 5: 전체 검사, 플러그인의 실제 설치와 실행, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~4의 결과물 전부.
- Produces: `develop`에 병합된 4단계. 플러그인 산출물을 깔고 "AQ 점검해 줘"로 처음부터 끝까지 돈다. 5단계(Codex)가 기대는 것은 `VERSION_FILES`, `PLUGIN_PATHS`, 스킬 본문 1절의 `${CLAUDE_SKILL_DIR}`를 바꾸지 않는 도구에 대한 문장이다.

- [ ] **Step 1: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 파일 88개·시험 1,284개 통과(3단계까지의 84개·1,251개에 이 계획이 더한 것), `묶음 검사 통과` 다음 마지막 줄이 `버전 검사 통과`. Windows 밖에서는 2단계 1부의 시험 1개를 건너뛴다.

- [ ] **Step 2: 묶음을 다시 만들어도 그대로인지 확인한다**

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 3: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS. 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 4: 산출물을 만들어 공식 검증을 돌린다**

산출물은 공백과 한글이 든 경로에 만든다(설계 6.3). 아래 `<산출물>`은 OS 임시 폴더 아래의 `aq 플러그인 산출물` 같은 빈 폴더다.

Run: `node scripts/pack-plugin.mjs "<산출물>"`
Expected: `플러그인 산출물 17개를 <산출물>에 담았다`.

Run: `claude plugin validate "<산출물>"`
Expected: `✔ Validation passed`. README가 없다는 것(플러그인 목록에 제출할 때 거절 사유)과 아이콘이 없다는 경고는 8단계의 몫이라 남는다. 다른 경고와 오류는 없다.

- [ ] **Step 5: 빈 임시 설정 폴더에 설치해 본다**

사용자의 Claude Code 설정을 바꾸지 않도록 이 단계의 명령에만 `CLAUDE_CONFIG_DIR`을 빈 임시 폴더로 준다. 부모 셸의 환경은 바꾸지 않는다.

Run: `claude plugin marketplace add "<산출물>"`, `claude plugin install chunsik-garage@chunsik-garage`, `claude plugin details chunsik-garage@chunsik-garage`
Expected: 마켓 추가와 설치가 성공하고, 세부에 `Chunsik's Garage (chunsik-garage)`와 스킬 `aq` 하나가 있다. 설치 기록(`<임시 설정>/plugins/installed_plugins.json`의 `installPath`)이 가리키는 폴더에 `node_modules`가 없고 크기가 1MB 안쪽이며, 파일이 산출물과 같다. 공식 문서는 로컬 경로로 더한 마켓의 플러그인을 제자리에서 불러온다고 적지만, 2.1.325에서는 `<임시 설정>/plugins/cache/chunsik-garage/chunsik-garage/<버전>/`에 복사했다(주 세션과 짝이 실제로 봤다). 그래서 위치는 설치 기록으로 확인한다. 확인한 뒤 임시 설정 폴더를 지운다.

- [ ] **Step 6: Claude Code로 "AQ 점검해 줘"를 실제로 돌린다**

사용자의 설정을 바꾸지 않도록 그 실행에만 산출물을 불러온다(`--plugin-dir`). 빈 작업 폴더에서 돌리고, 기본 권한 모드에서 스킬을 부르는 것만 허락해 묶은 실행 파일 명령이 스킬의 허락 규칙으로 도는지 본다.

Run: `claude -p "AQ 점검해 줘. 저장하지 말고 브라우저도 열지 마." --plugin-dir "<산출물>" --permission-mode default --allowedTools "Skill(chunsik-garage:aq)" --max-turns 6 --output-format stream-json --verbose < /dev/null`
Expected: 도구 호출은 스킬(`chunsik-garage:aq`) 하나와 묶은 실행 파일 명령 하나(`node "<산출물의 스킬 폴더>/scripts/aq.mjs" checkup --lang <대화의 언어> --no-save --no-open`)이고 권한 거부가 없다. 시작 줄이 명령 앞에 있다. 결과 글은 여섯 줄 안이고 코드 블록이 아니며, 결과 줄의 AQ·등급·별명, 가장 잘하는 것, 먼저 고칠 것(춘식이의 `(-_-)9`)이 묶은 실행 파일이 낸 요약과 글자 그대로 같고, 결과 줄의 얼굴이 등급 단계에 맞으며, 결과 화면의 경로가 있다. 도구 결과의 요약은 기록의 `tool_use_result.stdout`에서 읽는다(대화에 보이는 도구 결과는 길면 잘린다).

이 PC의 기록은 그때의 등급 하나의 길만 지난다. 나머지 경우는 산출물을 복사한 사본에서 `skills/aq/scripts/aq.mjs`를 정한 출력을 그대로 내고 정한 종료 코드로 끝나는 작은 스크립트로 바꿔 돌려 본다. 가짜의 문장은 프로그램의 문구 함수(`resultText`, `runNoticeText`, `fixDetail`)로 만들어 실제 출력과 같은 꼴이 되게 한다. 요청은 위와 같고, 열지 못함만 "AQ 점검해 줘. 저장하지 말고."로 브라우저 열기를 막지 않는다(가짜는 브라우저를 열지 않는다).

| 사본 | 가짜가 내는 것 | Expected |
|---|---|---|
| AQ 없음 | 빈 홈에서 `checkup --no-save --no-open --lang ko`가 낸 출력 | 결과 줄이 `(o_o)`와 `score_withheld` 알림의 문장, 그 아래에 진단, 가장 잘하는 것, 결과 화면 경로. 먼저 고칠 것의 줄이 없다 |
| 결과 화면 없음 | 위 출력에서 결과 화면과 결과 파일의 경로를 `null`로, 실행 알림을 `save_failed`, `result_unwritten`, `report_unwritten`과 그 문장으로 바꾼 것 | 결과 화면의 줄이 `report_unwritten`의 문장이고 알림 줄이 하나(우선순위가 앞인 `save_failed`의 문장)다 |
| 오류 | `{"error": {"code": "EACCES", "message": "permission denied"}}`를 내고 1로 끝남 | 춘식이의 `(;_;)` 줄이 `EACCES`를 알리고, 프로그램이 내지 않은 까닭을 짐작하지 않는다 |
| 열지 못함 | AQ 없음의 출력에서 실행 알림을 `not_saved`와 `report_unopened`, 그 문장으로 바꾼 것 | 결과 화면의 줄이 `report_unopened`의 문장과 결과 화면의 경로다. `not_saved`의 문장은 쓰지 않는다(저장하지 말라고 했다) |
| 고칠 것 없음 | AQ 72, B등급(단계 3), 먼저 고칠 것이 비고 고칠 것이 없다는 문장이 있는 요약 | 결과 줄의 얼굴이 `(^o^)`이고, 춘삼이의 `(^_^)b` 줄이 고칠 것이 없다는 문장 그대로다. 춘식이의 줄이 없다 |
| C등급 | AQ 55, C등급(단계 2), 먼저 고칠 것이 하나 있는 요약 | 결과 줄의 얼굴이 `(O_O)!`이고, 먼저 고칠 것이 춘식이의 `(-_-)9` 줄로 제목과 덧붙이는 말 그대로다 |

이 PC의 숫자와 결과 글, 실행 기록은 저장소 밖 작업 기록에만 둔다. 이 단계의 실행이 OS 임시 폴더에 만든 결과 파일과 결과 화면 파일, 산출물과 사본을 지운다.

- [ ] **Step 7: 원장을 고치고 커밋한다**

원장의 4단계 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 10에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 4단계 구현 결과를 적음"
```

- [ ] **Step 8: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage4.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~4의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 산출물과 공식 검증, 빈 설정 폴더의 설치, Claude Code로 돌린 일곱 경우), 「확인하지 못한 것」이다. 확인하지 못한 것에는 아래를 적는다. Codex에서 스킬이 도는 것(5단계), macOS와 Linux, GitHub의 저장소를 마켓으로 더해 설치하는 것과 사용자가 받을 브랜치(8단계), 영어로 쓰는 틀과 오류 한 줄(작성자 PC의 사용자 지침이 모든 글을 한국어로 쓰고 보고의 꼴을 정해, 모델 실행으로는 그 지침이 없는 사용자의 화면을 볼 수 없었다). 이 PC의 숫자, 경로, 이름과 결과 글은 넣지 않는다.

```bash
git push -u origin 4단계-스킬과-플러그인
gh pr create --base develop --head 4단계-스킬과-플러그인 --title "feat: 4단계 AQ 점검 스킬과 Claude Code 플러그인" --body-file "$TEMP/aq-pr-stage4.md"
```

- [ ] **Step 9: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(4단계 구현 전용, 정독과 실행이 다 무거우므로 둘) 다음을 나눠 맡긴다. 한 짝은 정독이다. 설계 5, 7.1, 7.4, 12.3, 13.2, 15, 23과 「4단계 계획에서 보완」을 이 계획의 코드와 대조하고, 스킬 본문의 지시가 모델을 헷갈리게 하거나 숫자를 지어내게 할 곳, 시험이 놓치는 그럴듯한 본문 변이(칸 이름 오타, 옵션 오타, 허락 규칙과 명령의 어긋남, 얼굴과 화자의 어긋남)를 반례로 찾는다. 다른 짝은 실행이다. `npm run check`와 Node.js 22를 다시 돌리고, 산출물과 빈 설정 폴더의 설치, Claude Code로 돌리는 Step 6의 일곱 경우를 자기 방법으로 재현한다. 두 짝에게 서로의 결론을 미리 알려 주지 않는다. 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 4단계-스킬과-플러그인 --body-file "$TEMP/aq-pr-stage4.md"`).

- [ ] **Step 10: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 4단계-스킬과-플러그인 --merge --subject "feat: 4단계 스킬과 플러그인을 develop에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 4단계 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 5단계와 그 뒤에 넘기는 것

4단계가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 단계 | 4단계가 남긴 재료 |
|---|---|---|
| Codex 매니페스트(`.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`)와 그 둘의 버전 검사, 산출물에 담기, Codex에서 스킬이 도는지 | 5단계 | `VERSION_FILES`, `PLUGIN_PATHS`, 스킬 본문 1절의 `${CLAUDE_SKILL_DIR}`를 바꾸지 않는 도구에 대한 문장 |
| 정비 절차(`skills/aq/references/`)와 스킬의 정비 흐름, 먼저 고칠 것 뒤에 "정리할 것 n개를 지금 볼까요?"를 묻는 줄 | 6단계 | 스킬 본문 3절의 틀, 설계 15의 "꼭 고칠 것" `(>_<)`과 "다 고쳤다" `(^_^)v` |
| 정밀 점검 절차, 세션 시작 훅(`hooks/`)과 산출물에 담기 | 7단계 | `PLUGIN_PATHS` |
| README 두 벌, 플러그인 아이콘, `main`에 산출물을 올리는 배포 절차와 설치 명령의 브랜치, 정식 배포 전 확인(KIPRIS, macOS와 Linux에서 열기) | 8단계 | `scripts/pack-plugin.mjs`, `claude plugin validate`의 README와 아이콘 경고 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 5 | 설치(`chunsik-garage@chunsik-garage`)와 부르는 법("AQ 점검해 줘", `/chunsik-garage:aq`) | 1, 3, 5 |
| 7.1 | 매니페스트의 꼭 넣는 것과 저장소 주소, 스킬 이름 `aq`, 실행 파일과 그림을 스킬 폴더 안에, 버전이 모두 같음을 `npm run check`가 봄 | 1, 2, 3 |
| 7.4 | `checkup`의 옵션(`--lang`, `--no-open`, `--no-save`, `--rescan`) | 3 |
| 6.3 | 경로를 따옴표로 감쌈, 사용자는 `npm install`을 하지 않음 | 3, 4, 5 |
| 12.3, 15 | 요약의 숫자와 문장을 그대로, 머리표와 얼굴과 맡은 말, 여섯 줄, AQ가 없으면 먼저 고칠 것을 옮기지 않음 | 3, 5 |
| 13.2 | 대화의 언어를 `--lang`으로 넘김 | 3 |
| 23 | 저장소가 플러그인이자 마켓, 사용자가 받는 것은 산출물(`main`에 올리는 것은 8단계) | 1, 4 |
| 「4단계 계획에서 보완」 1~8번 | 매니페스트(1), 실행과 허락 규칙(2), 본문의 틀과 얼굴(3), 산출물(4), 버전을 읽는 곳(5), 말투 표의 자리(6), 확인하지 못한 것(7), 3단계 2부가 넘긴 것(8) | 1(1), 3(2·3·6·8), 4(4), 2(5), 5(7) |
| 3단계 2부의 「4단계와 그 뒤에 넘기는 것」 첫 줄 | 결과 화면 경로를 알리는 틀, 열지 못했을 때와 쓰지 못했을 때의 안내, AQ가 없을 때 먼저 고칠 것의 줄을 옮기지 않음 | 3, 5 |

4단계에 넣지 않은 것은 「5단계와 그 뒤에 넘기는 것」에 적었다. 3단계 2부가 넘긴 것 가운데 macOS와 Linux에서 기본 브라우저로 여는 것을 실제 기기에서 확인하는 것은 이 PC에 그 기기가 없어 8단계의 정식 배포 전 확인으로 넘긴다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드가 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`a683597`. 코드는 `a721023`과 같다)에서 과제 1부터 4까지 차례대로 만들었다(Windows 11, Node.js 24). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1~4는 시험만 놓고 돌리면 실패하고(실패한 시험의 수와 파일을 시험 커밋마다 따로 세어 과제의 Expected와 맞는지 봤다), 구현을 놓으면 그 과제의 확인 명령(타입 검사와 관계있는 시험)이 통과했다. 과제 3의 묶은 실행 파일 다시 만들기도 통과했다. 과제 4 뒤의 `npm run check`는 시험 파일 88개·시험 1,284개가 통과했고 `묶음 검사 통과`와 `버전 검사 통과`였다. 다시 묶어도 묶은 실행 파일은 달라지지 않았다. 다 만든 복제본의 코드, 시험, 그림 파일 230개는 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다(문서와 원장은 견주지 않았다).

연습 작업 폴더에서 따로 확인한 것은 이렇다. 그럴듯한 틀린 구현 42개를 하나씩 넣어 모두 시험이 잡았다. 처음 29개(허락 규칙과 본문 명령의 따옴표 뺌, 하위 명령과 옵션의 오타, 본문이 읽으라는 칸의 오타와 잘못된 자리, 알림 종류의 오타, 실행 알림 하나를 다루지 않음, AQ를 내지 않은 까닭의 알림을 쓰지 않음, 화자와 얼굴의 어긋남 둘, 설명에서 한국어로 부르는 말을 뺌, 설명의 꺾쇠, 머리말의 쓰지 않는 열쇠, Node.js 22 안내와 오류 코드 안내를 뺌, 플러그인 이름 오타, 플러그인 정보의 메일, 마켓의 `source`를 점 하나로, 마켓 설명을 뺌, 버전 하나만 올림, 프로그램 안의 버전을 주석에서도 읽음, 버전이 달라도 알리지 않음, 버전 검사가 실패해도 0으로 끝남, 산출물에서 라이선스를 뺌, 산출물에 `package.json`을 넣음, 담을 곳이 비어 있지 않아도 담음, 담을 것이 없는데 먼저 씀)에, 계획 리뷰 1차에서 두 짝이 든 것과 그 권장에서 지은 13개(칸 끝에 숫자, 잘못된 배열 자리, 버전 비교에서 첫 파일을 빠뜨림, 마켓 중복 항목의 첫 것을 읽음, 열지 못함 행에 다른 알림의 문장, 칭찬 얼굴을 바꿈 둘, 덧붙이는 말 자리에 제목 둘, 명령에서 언어를 뺌, 찾기 낱말을 배열이 아닌 것으로, 알림 줄 표에서 다른 알림의 문장, 건너뛸 알림을 씀)를 더했다. 실패 안내의 시험은 처음에 같은 낱말이 조건을 설명하는 앞부분에도 있어 Node.js 22 안내를 뺀 변이를 놓쳤고, 조건과 같은 줄의 "tell the user" 뒤를 보게 고쳤다. 플러그인 산출물(17개)을 공백과 한글이 든 경로에 만들어 `claude plugin validate`가 통과했다(README와 아이콘의 경고만 남았다). 빈 임시 설정 폴더에 마켓을 더하고 설치하니 스킬 `aq` 하나가 잡혔고 설치 폴더는 1MB 안쪽에 `node_modules`가 없었다. 같은 확인을 저장소 뿌리로 하면 설치 폴더에 개발 의존성 86MB가 깔렸다(산출물을 만든 까닭이다). 그 실행에만 산출물을 불러오는 `claude -p`(기본 권한 모드, 스킬을 부르는 것만 허락)로 "AQ 점검해 줘. 저장하지 말고 브라우저도 열지 마."를 이 PC의 기록으로 돌리니, 스킬 하나와 묶은 실행 파일 명령 하나(`checkup --lang ko --no-save --no-open`)가 권한 거부 없이 돌았고, 결과 글은 네 줄로 결과 줄의 AQ·등급·별명, 가장 잘하는 것, 먼저 고칠 것이 요약과 글자 그대로 같았으며, 얼굴이 등급 단계에 맞았고, 결과 화면의 경로가 있었다. 묶은 실행 파일 자리에 정한 출력을 내는 가짜를 둔 사본 여섯(AQ 없음, 결과 화면 없음, 오류, 열지 못함, 고칠 것 없음의 B등급, C등급)도 모두 Step 6의 Expected대로였다. 처음 실행에서 결과를 코드 블록으로 감싸는 것과 오류의 까닭을 짐작하는 것을 보고 스킬 본문에 막는 말을 더했고, 고친 본문으로 일곱을 다시 돌렸다.

확인하지 못한 것은 이렇다. 작성자 PC의 사용자 지침이 모든 글을 한국어로 쓰고 보고의 꼴을 정해, 영어로 요청해도 모델이 한국어로 답했다. 그래서 영어의 틀은 그 지침이 없는 사용자의 화면을 모델 실행으로 볼 수 없었다. 오류는 처음 실행에서 앞뒤에 결론과 설명이 붙었고 고친 본문의 실행에서는 한 줄이었다. 모델의 출력은 실행마다 달라질 수 있어 모든 실행을 보증하지 않는다. Codex에서 스킬이 도는 것(5단계), macOS와 Linux, GitHub의 저장소를 마켓으로 더해 설치하는 것과 사용자가 받을 브랜치(8단계)는 보지 않았다.
