# AQ 점검 6단계 1부 — 정비 계획(aq tune plan) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 임시 홈과 이 PC로 정비 계획을 읽기만으로 돌려 보는 것으로 검증한다.

**Goal:** 정비의 첫 부분인 계획을 만든다. 스캐너의 서버 막힘 판정과 정비 후보의 조건을 실측대로 고치고 Codex의 서버 끄기 후보를 연다. 후보를 정확한 변경(파일, 자리, 지금 값, 바꿀 값, 영향 범위, 자동으로 고칠 수 없는 까닭)으로 바꾸고, 바꿀 파일의 지문과 함께 상태 폴더에 저장하는 `aq tune plan`을 더한다. 설정 파일은 읽기만 한다.

**Architecture:** 스캐너(`src/scan/mcp.ts`, `src/scan/claude.ts`)는 플러그인 서버를 등록 이름으로만 견주고 허용 목록을 듣는 층 모두에서 본다. 정비 후보(`src/core/installs/candidates.ts`)는 서버 막기의 플러그인 조건을 빼고 Codex의 서버 끄기를 낸다. 새 모듈 `src/tune/`이 후보를 계획 항목으로 바꾸고(`items.ts`), 계획의 모양과 저장(`plan.ts`), 문장(`copy.ts`)을 맡는다. 명령(`src/commands/tune-plan.ts`)은 점검과 같은 입력으로 평가해 계획을 짓는다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험), smol-toml(이미 묶은 TOML 해석기). 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 끝의 「6단계 계획 전 결정」(1~10번)의 1부 몫, 「6단계 1부 계획 전 결정」(1~10번), 「6단계 1부 계획에서 보완」(1~4번), 「6단계 1부 계획 리뷰 1차에서 보완」(1·2번), 「6단계 1부 계획 리뷰 1차 재확인에서 보완」과, 그것이 기대는 7.4, 10, 11.3, 16.1, 16.2, 16.3, 16.5의 1번을 구현한다.

## 6단계 1부의 범위

| 넣는 것 | 넣지 않는 것(그 부) |
|---|---|
| 서버 막힘 판정(등록 이름, 모든 층의 허용 목록), 서버 막기 후보의 조건, Codex 서버 끄기 후보, 계획 항목(자리·지금 값·바꿀 값·영향 범위·고칠 수 없는 까닭), 바꿀 파일 읽기와 지문, 확인한 버전 범위, 계획의 저장, `aq tune plan`, 계획의 문장, E6의 도구별 처방, 묶은 실행 파일 | 설정 파일의 편집과 바꾸기 전 검사의 나머지, 작업 기록, 잠금, `aq tune apply`(2부). `aq tune verify`, `aq tune undo`, 다음 점검 때의 확인, 스킬 본문의 정비 흐름과 결과 화면의 [정리하기](3부) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- 두 도구의 기록과 셋팅, 홈의 `.agents`, 프로젝트 폴더는 읽기만 한다. 정비 계획은 바꿀 설정 파일도 읽기만 한다. 계획이 쓰는 곳은 상태 폴더(`~/.chunsik-garage`)뿐이고, 저장하지 않는 계획은 아무 데도 쓰지 않는다(설계 19.2, 「6단계 1부 계획 전 결정」 5번).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더의 기록과 셋팅을 읽지 않고 임시 폴더에 만든 홈과 프로젝트만 쓴다(설계 21.1). 파일 링크를 만들 수 없는 Windows에서는 그 시험을 건너뛴다.
- 설정의 값(환경 변수, 머리말, 주소의 질의, 토큰)은 계획과 출력에 싣지 않는다. 계획에 드는 값은 스킬 이름, 설치 ID, 서버 이름, 켜고 끄는 값이다(설계 16.3, 16.5의 2번).
- 새 의존성을 더하지 않는다. 빌드할 때 TOML 해석기 하나를 묶는 것만 허용한다(설계 6.3).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `6단계-1부-정비-계획` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증의 필수는 제품 결함과 수용 조건 미충족뿐이다(사용자 지시 2026-11-16).
- 이 PC의 기록과 셋팅에서 본 이름, 경로, 값, 개수는 저장소와 병합 요청에 넣지 않는다(설계 머리말). 이 PC로 돌린 도구와 결과는 저장소 밖에 둔다. 이 PC에서는 계획을 저장하지 않고(`--no-save`) 돌린다.

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `3D67C817519F0D5F3A86EE6E0AFD0E9542246477151D788FA4E2A175C709D2DA`, 4,590줄)이다. 설계 끝에 「6단계 계획 전 결정」과 「6단계 1부 계획 전 결정」을 더했고(앞 커밋), 27절의 서버 막기 줄에 실측 결과를 덧붙였다. 연습 작업 폴더에서 구현하며 정하거나 고친 것(E6의 도구별 처방, 후보가 없을 때, 출력의 문장, 이 PC에서 돌려 본 것)을 「6단계 1부 계획에서 보완」으로 더했다. 계획 리뷰 1차에서 지금 값의 꼴과 TOML 표 머리 세기를 고치고 「6단계 1부 계획 리뷰 1차에서 보완」을, 그 재확인에서 표 머리 뽑기를 고치고 「6단계 1부 계획 리뷰 1차 재확인에서 보완」을 더했다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `src/scan/mcp.ts`, `src/scan/claude.ts`(고침) | 1 | 서버 막힘 판정의 허용 목록과 플러그인 서버의 이름 |
| `src/core/installs/candidates.ts`(고침) | 2 | 서버 막기의 조건, Codex의 서버 끄기 |
| `src/tune/items.ts`(새 파일) | 3 | 계획 항목, 바꿀 파일 읽기와 지문, 고칠 수 없는 까닭 |
| `src/tune/plan.ts`, `src/commands/tune-plan.ts`(새 파일), `src/state/reports.ts`, `src/cli.ts`(고침) | 4 | 계획의 모양과 저장, 확인한 버전 범위, `aq tune plan` |
| `src/tune/copy.ts`(새 파일), `src/core/copy/rules-efficiency.ts`, `src/core/copy/findings.ts`, `src/tune/plan.ts`, `src/commands/tune-plan.ts`(고침) | 5 | 계획의 문장, E6의 도구별 처방 |
| `skills/aq/scripts/aq.mjs`(다시 만듦) | 6 | 묶은 실행 파일 |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제 1~5는 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다. 과제 6은 시험이 없어 묶음을 다시 만든 뒤 전체 검사를 돌리고 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/2`처럼 차례가 붙고 차례대로 바꾼다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 1부터 원본이 바뀌어 묶음 검사가 어긋나므로, 과제 6의 `npm run build`가 원본에서 다시 만든다.
- 과제 1~5의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 묶은 실행 파일을 다시 만든 뒤 과제 6에서 돌린다.
- 시험은 임시 폴더에 만든 홈과 설정으로 본다. 이 PC의 실제 셋팅에서 계획이 맞는지는 시험으로 보증하지 않으므로 마지막 과제에서 저장하지 않는 계획으로 돌려 본다.

---

### Task 1: 서버 막힘 판정의 허용 목록과 플러그인 서버의 이름

**Files:**
- Modify: `test/scan/claude.test.ts`
- Modify: `test/scan/mcp.test.ts`
- Modify: `src/scan/claude.ts`
- Modify: `src/scan/mcp.ts`

**Interfaces:**
- Consumes: 스캐너의 서버 막힘 판정(`matcherHits`, `mcpAllowed`, `McpContext`, `src/scan/mcp.ts`), 플러그인 서버 사실과 관리 정책 판정(`src/scan/claude.ts`의 플러그인 서버 부분과 `managedHits`), 설정 해석의 허용 목록(`viewOf`의 `allowedMcpServers`, `src/scan/settings.ts`).
- Produces: `matcherHits(matcher, names, definition, byName)`, `mcpAllowed(context, names, definition, plugin)`, 관리 정책 칸이 없는 `McpContext`, 등록 이름으로 견준 플러그인 서버 사실의 `enabled`와 `managedFixed`. 과제 2가 이 판정을 쓴다.

설계 「6단계 계획 전 결정」 2번과 「6단계 1부 계획 전 결정」 2번이다.

- 막는 목록. 플러그인 서버는 등록 이름(`plugin:<플러그인>:<서버>`) 하나로 견준다. 지금은 등록 이름의 두 꼴(도구 이름 꼴 포함)에 플러그인 안의 서버 이름을 더해 견줬다. Claude Code 2.1.325를 빈 임시 설정 폴더에서 돌려 보니 플러그인 안의 서버 이름과 도구 이름 꼴로는 막히지 않았다. 부른 기록과 잇는 이름(`recordNames`)은 그대로다.
- 허용 목록. 그 맥락에서 듣는 층(사용자, 프로젝트, 로컬, 관리 정책) 모두의 허용 목록을 본다. 하나라도 있으면 그 모두에 들어야 허용이다. 플러그인 서버는 이름 항목(`serverName`)으로는 허용되지 않고, 명령과 주소의 항목으로만 견준다(`plugin` 인자). 같은 실측에서 사용자 설정의 허용 목록도 들었다.
- 관리 정책이 정한 것(`managedFixed`)은 관리 정책 층의 목록만 본다. 플러그인 서버는 그 견줌도 등록 이름으로 한다.
- 맥락의 관리 정책 칸(`McpContext.managed`)은 허용 목록을 층에서 읽게 되어 쓰이지 않으므로 지운다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/claude.test.ts`(찾을 곳):

```ts

  it("같은 뿌리를 다르게 적은 열쇠 둘에 정의가 같은 로컬 서버는 열쇠의 차례와 상관없이 하나다", () => {
```

`test/scan/claude.test.ts`(바꾼 뒤):

```ts

  it("플러그인 서버는 막는 목록의 등록 이름으로만 막히고, 사용자 설정의 허용 목록은 일반 서버와 플러그인 서버에 듣는다(「6단계 1부 계획 전 결정」 2번)", async () => {
    const userSettings = join(input.homedir, ".claude", "settings.json");
    const managedSettings = join(root, "managed", "managed-settings.json");
    const userBase = JSON.parse(await readFile(userSettings, "utf8")) as Record<string, unknown>;
    const managedBase = JSON.parse(await readFile(managedSettings, "utf8")) as Record<string, unknown>;
    const scanWith = async (user: Record<string, unknown>, managed: Record<string, unknown> = {}) => {
      await put(userSettings, json({ ...userBase, ...user }));
      await put(managedSettings, json({ ...managedBase, ...managed }));
      return (await scanClaudeSetup(input)).mcpServers;
    };
    // 막는 목록. 플러그인 안의 서버 이름과 도구 이름 꼴로는 막히지 않고 등록 이름으로 막힌다
    for (const name of ["db", "plugin_pa_db"]) expect(find(await scanWith({ deniedMcpServers: [{ serverName: name }] }), "db").enabled).toBe(true);
    expect(find(await scanWith({ deniedMcpServers: [{ serverName: "plugin:pa:db" }] }), "db").enabled).toBe(false);
    // 관리 정책의 막는 목록도 같다. 등록 이름일 때만 관리 정책이 정한 것이다
    expect(find(await scanWith({}, { deniedMcpServers: [{ serverName: "db" }] }), "db")).toMatchObject({ enabled: true, managedFixed: false });
    expect(find(await scanWith({}, { deniedMcpServers: [{ serverName: "plugin:pa:db" }] }), "db")).toMatchObject({ enabled: false, managedFixed: true });
    // 사용자 설정의 허용 목록. 든 서버만 켜지고, 플러그인 서버는 이름 항목으로 허용되지 않는다
    const allowCtx = await scanWith({ allowedMcpServers: [{ serverName: "ctx" }] });
    expect(["ctx", "loc", "db"].map((name) => find(allowCtx, name).enabled)).toEqual([true, false, false]);
    for (const name of ["db", "plugin:pa:db"]) expect(find(await scanWith({ allowedMcpServers: [{ serverName: name }] }), "db").enabled).toBe(false);
  });

  it("같은 뿌리를 다르게 적은 열쇠 둘에 정의가 같은 로컬 서버는 열쇠의 차례와 상관없이 하나다", () => {
```

`test/scan/mcp.test.ts`(찾을 곳):

```ts
    expect(projectServerApproved(context([{ enabledMcpjsonServers: ["s"] }], { enableAllProjectMcpServers: false }), "s")).toBe(true);
  });
});
```

`test/scan/mcp.test.ts`(바꾼 뒤):

```ts
    expect(projectServerApproved(context([{ enabledMcpjsonServers: ["s"] }], { enableAllProjectMcpServers: false }), "s")).toBe(true);
  });

  it("허용 목록은 듣는 층 모두에서 본다. 어느 층의 허용 목록 밖이면 막힌 것이고, 둘 이상이면 그 모두에 들어야 허용이다(「6단계 1부 계획 전 결정」 2번)", () => {
    expect(mcpAllowed(context([{ allowedMcpServers: [{ serverName: "b" }] }]), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{ allowedMcpServers: [{ serverName: "a" }] }]), ["a"], null)).toBe(true);
    expect(mcpAllowed(context([{}, { allowedMcpServers: [{ serverName: "b" }] }, {}]), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{ allowedMcpServers: [{ serverName: "a" }] }, { allowedMcpServers: [{ serverName: "b" }] }]), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{ allowedMcpServers: [{ serverName: "a" }] }], { allowedMcpServers: [{ serverName: "a" }] }), ["a"], null)).toBe(true);
    expect(mcpAllowed(context([{ allowedMcpServers: [] }]), ["a"], null)).toBe(false);
  });

  it("플러그인 서버는 허용 목록의 이름 항목으로는 허용되지 않고 명령과 주소의 항목으로만 견준다. 막는 목록은 등록 이름으로 막는다(「6단계 1부 계획 전 결정」 2번)", () => {
    const names = ["plugin:p:db"];
    const definition = { command: "npx", args: ["srv"] };
    expect(mcpAllowed(context([{ allowedMcpServers: [{ serverName: "plugin:p:db" }] }]), names, definition, true)).toBe(false);
    expect(mcpAllowed(context([{ allowedMcpServers: [{ serverName: "db" }] }]), names, definition, true)).toBe(false);
    expect(mcpAllowed(context([{ allowedMcpServers: [{ serverCommand: ["npx", "srv"] }] }]), names, definition, true)).toBe(true);
    expect(mcpAllowed(context([{}], { allowedMcpServers: [{ serverName: "plugin:p:db" }] }), names, definition, true)).toBe(false);
    expect(mcpAllowed(context([{}]), names, definition, true)).toBe(true);
    expect(mcpAllowed(context([{ deniedMcpServers: [{ serverName: "plugin:p:db" }] }]), names, definition, true)).toBe(false);
    // 일반 서버는 지금처럼 이름 항목으로 허용된다
    expect(mcpAllowed(context([{ allowedMcpServers: [{ serverName: "plugin:p:db" }] }]), names, definition)).toBe(true);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/claude.test.ts test/scan/mcp.test.ts`
Expected: FAIL. 바뀐 시험 파일 둘에서 시험 셋이 실패한다. 사용자 설정의 허용 목록을 보지 않고, 플러그인 서버를 허용 목록의 이름 항목으로 허용하며, 막는 목록에 적힌 플러그인 안의 서버 이름으로 플러그인 서버를 막는다.

- [ ] **Step 3: 구현한다**

`src/scan/claude.ts`(찾을 곳 1/5):

```ts
  return !mcpAllowed({ layers: [managed], managed: { ...managed, allowedMcpServers: null }, project: null }, names, definition);
```

`src/scan/claude.ts`(바꾼 뒤 1/5):

```ts
  return !mcpAllowed({ layers: [managed], project: null }, names, definition);
```

`src/scan/claude.ts`(찾을 곳 2/5):

```ts
  const global: Context = { ordered: [userView], managed: managedView, mcp: { layers: [userView, managedView], managed: managedView, project: null } };
```

`src/scan/claude.ts`(바꾼 뒤 2/5):

```ts
  const global: Context = { ordered: [userView], managed: managedView, mcp: { layers: [userView, managedView], project: null } };
```

`src/scan/claude.ts`(찾을 곳 3/5):

```ts
      mcp: { layers: [userView, projectView, localView, managedView], managed: managedView, project: entry },
```

`src/scan/claude.ts`(바꾼 뒤 3/5):

```ts
      mcp: { layers: [userView, projectView, localView, managedView], project: entry },
```

`src/scan/claude.ts`(찾을 곳 4/5):

```ts
      // 막는 목록은 서버 열쇠 그대로 적었을 수도 있어서 그 이름도 함께 견준다
      const denyNames = [...new Set([...recordNames, server.name])];
```

`src/scan/claude.ts`(바꾼 뒤 4/5):

```ts
      // 막는 목록과 허용 목록은 플러그인 서버를 등록 이름(plugin:<플러그인>:<서버>)으로만 견준다. 플러그인 안의 서버 이름과 도구 이름 꼴로는 막히지 않는다(Claude Code 2.1.325 실측, 「6단계 1부 계획 전 결정」 2번)
      const denyNames = [...new Set(pluginNames.map((pluginName) => `plugin:${pluginName}:${server.name}`))].sort();
```

`src/scan/claude.ts`(찾을 곳 5/5):

```ts
        enabled: enabledIn.some((context) => mcpAllowed(context.mcp, denyNames, server.definition)),
```

`src/scan/claude.ts`(바꾼 뒤 5/5):

```ts
        enabled: enabledIn.some((context) => mcpAllowed(context.mcp, denyNames, server.definition, true)),
```

`src/scan/mcp.ts`(찾을 곳 1/4):

```ts
/** 막는 목록·허용 목록의 한 항목이 서버에 맞는지. 이름은 기록에 남는 꼴들 가운데 하나와 맞으면 된다. */
export function matcherHits(matcher: McpMatcher, names: readonly string[], definition: Json | null): boolean {
  if (matcher.serverName !== undefined && names.includes(matcher.serverName)) return true;
```

`src/scan/mcp.ts`(바꾼 뒤 1/4):

```ts
/** 막는 목록·허용 목록의 한 항목이 서버에 맞는지. 이름은 기록에 남는 꼴들 가운데 하나와 맞으면 된다. byName이 거짓이면 이름 항목은 보지 않는다(플러그인 서버의 허용 목록) */
export function matcherHits(matcher: McpMatcher, names: readonly string[], definition: Json | null, byName = true): boolean {
  if (byName && matcher.serverName !== undefined && names.includes(matcher.serverName)) return true;
```

`src/scan/mcp.ts`(찾을 곳 2/4):

```ts
  managed: SettingsView;
```

`src/scan/mcp.ts`(바꾼 뒤 2/4): 찾은 줄을 지운다.

`src/scan/mcp.ts`(찾을 곳 3/4):

```ts
/** 이 맥락에서 막히지 않았는지. 어느 층의 deniedMcpServers에 걸리거나, 관리 정책의 허용 목록 밖이거나, 그 프로젝트에서 끈 서버면 막힌 것이다. */
export function mcpAllowed(context: McpContext, names: readonly string[], definition: Json | null): boolean {
```

`src/scan/mcp.ts`(바꾼 뒤 3/4):

```ts
/**
 * 이 맥락에서 막히지 않았는지. 어느 층의 deniedMcpServers에 걸리거나, 어느 층의 허용 목록 밖이거나, 그 프로젝트에서 끈 서버면 막힌 것이다.
 * 허용 목록이 둘 이상이면 그 모두에 들어야 한다. 플러그인 서버(plugin)는 허용 목록의 이름 항목으로는 허용되지 않는다(Claude Code 2.1.325 실측, 「6단계 1부 계획 전 결정」 2번)
 */
export function mcpAllowed(context: McpContext, names: readonly string[], definition: Json | null, plugin = false): boolean {
```

`src/scan/mcp.ts`(찾을 곳 4/4):

```ts
  const allow = context.managed.allowedMcpServers;
  if (allow !== null && !allow.some((m) => matcherHits(m, names, definition))) return false;
```

`src/scan/mcp.ts`(바꾼 뒤 4/4):

```ts
  for (const layer of context.layers) if (layer.allowedMcpServers !== null && !layer.allowedMcpServers.some((m) => matcherHits(m, names, definition, !plugin))) return false;
```

`test/scan/mcp.test.ts`(찾을 곳):

```ts
    const managedView = view(managed);
    return { layers: [...layers.map(view), managedView], managed: managedView, project };
```

`test/scan/mcp.test.ts`(바꾼 뒤):

```ts
    return { layers: [...layers.map(view), view(managed)], project };
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/scan/mcp.test.ts test/scan/claude.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 64개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/scan/claude.test.ts test/scan/mcp.test.ts src/scan/claude.ts src/scan/mcp.ts
git commit -m "feat: 서버 막힘 판정을 실측대로 고침"
```

---

### Task 2: 서버 막기 후보의 조건과 Codex 서버 끄기 후보

**Files:**
- Modify: `test/core/installs-candidates.test.ts`
- Modify: `src/core/installs/candidates.ts`

**Interfaces:**
- Consumes: 과제 1의 서버 판정, 정비 후보(`candidatesOf`, `Candidate`, `src/core/installs/candidates.ts`), 5단계 3부의 Codex 서버 판정(`judgeServers`의 Codex 몫).
- Produces: 후보의 단위 `A4`(`Candidate.unit`), Codex의 서버 끄기 후보(`candidatesOf`의 Codex 몫), 플러그인 서버를 따지지 않는 서버 막기(A3) 조건. 과제 3이 네 단위를 계획 항목으로 바꾼다.

설계 「6단계 계획 전 결정」 2·3·4번과 「6단계 1부 계획 전 결정」 3번이다.

- 서버 막기(A3). 구성을 모르거나 MCP 정의를 읽지 못한 켜진 플러그인이 있어도 후보를 막지 않는다. 같은 이름 견줌에서 플러그인 서버를 뺀다. 막는 목록은 플러그인 서버를 등록 이름으로만 막아 함께 막히지 않는다(과제 1의 실측). 같은 이름의 로컬·프로젝트 범위 서버와 claude.ai 연결은 그대로 견준다.
- 서버 끄기(A4). Codex의 사용자 범위 서버가 켜져 있고 "안 부른 것이 확인됨"이며 판정에서 빼지 않았으면 낸다. 같은 이름을 다시 적은 신뢰한 프로젝트의 서버(프로젝트 범위)가 켜져 있으면 그것도 그래야 한다. 사용자 층에 적은 값이 깊이 합쳐져 그 프로젝트의 서버도 끌 수 있기 때문이다. 같은 이름의 플러그인 서버는 설정의 서버에 져서 원래 쓰이지 않으므로 따지지 않는다.
- Codex에는 서버 끄기만 낸다. 스킬은 사용을 기록하지 않아 "안 쓴 것이 확인됨"이 나오지 않고, 플러그인과 플러그인 서버는 정비하지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/core/installs-candidates.test.ts`(찾을 곳 1/5):

```ts
// 정비 후보(A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기)를 내는 조건을 시험한다. 적용은 하지 않고 후보의 유무와 목록만 본다(설계 16.1, 16.2, 21.1)
import { describe, expect, it } from "vitest";
```

`test/core/installs-candidates.test.ts`(바꾼 뒤 1/5):

```ts
// 정비 후보(A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기, A4 서버 끄기)를 내는 조건을 시험한다. 적용은 하지 않고 후보의 유무와 목록만 본다(설계 16.1, 16.2, 21.1, 「6단계 1부 계획 전 결정」 3번)
import { describe, expect, it } from "vitest";
```

`test/core/installs-candidates.test.ts`(찾을 곳 2/5):

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
```

`test/core/installs-candidates.test.ts`(바꾼 뒤 2/5):

```ts

describe("A4 서버 끄기(Codex, 「6단계 1부 계획 전 결정」 3번)", () => {
  const runCodex = (mcpServers: McpFact[], options: { called?: string[]; watched?: McpFact[] } = {}) => {
    const summaries = [summary({ days: { "2026-11-10": { responses: 1, mcpCalls: Object.fromEntries((options.called ?? []).map((name) => [name, 1])) } } })];
    const records = (options.watched ?? mcpServers).flatMap((fact) => (fact.installKey === null ? [] : [{ key: fact.installKey, firstSeen: "2026-09-01", appeared: false }]));
    const base = { day, windows, records: recordMap(records), complete: true };
    const tool: ToolSetup = { tool: "codex", totals: toolTotals(summaries, windows, []), coverage: CODEX_COVERAGE, setup: codexFacts({ mcpServers }), highestVersion: "0.166.0" };
    const skills = judgeSkills(tool, { ...base, used: usedSkillNames(summaries, windows), listings: sessionListings(summaries, "skill", {}, lookup) });
    const servers = judgeServers(tool, { ...base, used: calledMcpNames(summaries, windows), listings: sessionListings(summaries, "mcp", {}, lookup) });
    return { skills, servers, candidates: candidatesOf(tool, skills, servers, day, NO_SELF) };
  };
  it("사용자 범위 서버가 안 부른 것이 확인됨이면 그 이름으로 서버 끄기 후보를 낸다. Codex에는 스킬 끄기, 플러그인 끄기, 서버 막기를 내지 않는다", () => {
    const result = runCodex([mcpServer("idle"), mcpServer("busy")], { called: ["busy"] });
    expect(result.skills).toEqual({ measurement: expect.objectContaining({ status: "unmeasured", reason: "unsupported" }), bundles: [] });
    expect(result.candidates).toEqual([{ id: "A4:codex:idle", unit: "A4", rule: "E6", tool: "codex", target: "idle" }]);
  });
  it("같은 이름을 다시 적은 신뢰한 프로젝트의 서버가 켜져 있으면 그것도 안 부른 것이 확인됨이어야 한다. 꺼져 있으면 따지지 않는다", () => {
    const own = mcpServer("db");
    const inProject = mcpServer("db", { scope: "project", projectRoot: "/work/app", definitionHash: "other" });
    expect(ids(runCodex([own, inProject]))).toEqual(["A4:codex:db"]);
    expect(ids(runCodex([own, inProject], { watched: [own] }))).toEqual([]);
    expect(ids(runCodex([own, { ...inProject, enabled: false }], { watched: [own] }))).toEqual(["A4:codex:db"]);
  });
  it("같은 이름의 플러그인 서버는 따지지 않는다. 설정의 서버가 이겨 그 서버는 원래 쓰이지 않는다", () => {
    const own = mcpServer("db");
    const fromPlugin = mcpServer("db", { scope: "plugin", pluginId: "p@m", definitionHash: "plugin-def" });
    expect(ids(runCodex([own, fromPlugin], { watched: [own] }))).toEqual(["A4:codex:db"]);
  });
  it("프로젝트 범위와 플러그인의 서버, 꺼 둔 서버, 지켜본 지 14일이 안 된 서버는 서버 끄기 후보가 아니다", () => {
    const mcpServers = [mcpServer("proj", { scope: "project", projectRoot: "/work/app" }), mcpServer("plug", { scope: "plugin", pluginId: "p@m" }), mcpServer("off", { enabled: false }), mcpServer("young")];
    expect(ids(runCodex(mcpServers, { watched: mcpServers.slice(0, 3) }))).toEqual([]);
  });
```

`test/core/installs-candidates.test.ts`(찾을 곳 3/5):

```ts
  });
  it("플러그인이 넣은 같은 이름의 서버가 쓰이고 있으면 내지 않는다. 부른 기록의 이름 꼴이 달라 사용자 범위 서버는 확인됨일 수 있다", () => {
    const own = mcpServer("db");
```

`test/core/installs-candidates.test.ts`(바꾼 뒤 3/5):

```ts
  });
  it("플러그인이 넣은 같은 이름의 서버는 따지지 않는다. 막는 목록은 플러그인 서버를 등록 이름으로만 막아 그 서버가 쓰이고 있어도 막히지 않는다(「6단계 1부 계획 전 결정」 3번)", () => {
    const own = mcpServer("db");
```

`test/core/installs-candidates.test.ts`(찾을 곳 4/5):

```ts
    expect(result.servers.servers.map((s) => s.verdict)).toEqual(["unused", "used"]);
    expect(ids(result)).toEqual([]);
    expect(ids(run(setup))).toEqual(["A3:claude-code:db"]);
  });
```

`test/core/installs-candidates.test.ts`(바꾼 뒤 4/5):

```ts
    expect(result.servers.servers.map((s) => s.verdict)).toEqual(["unused", "used"]);
    expect(ids(result)).toEqual(["A3:claude-code:db"]);
    expect(ids(run(setup, { watched: [own] }))).toEqual(["A3:claude-code:db"]);
  });
```

`test/core/installs-candidates.test.ts`(찾을 곳 5/5):

```ts
    ["설정에 켜 두었는데 설치 기록에 없는 플러그인", { pluginsWithoutInstall: ["ghost@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("같은 이름의 서버가 있는지 알 수 없으면 내지 않는다. E6은 잰다: %s", (_name, setup) => {
    const result = run({ mcpServers: [mcpServer("idle1"), mcpServer("idle2")], ...setup });
    expect(result.servers.measurement).toMatchObject({ status: "scored", value: 1 });
    expect(ids(result)).toEqual([]);
  });
```

`test/core/installs-candidates.test.ts`(바꾼 뒤 5/5):

```ts
    ["설정에 켜 두었는데 설치 기록에 없는 플러그인", { pluginsWithoutInstall: ["ghost@m"] }],
  ] as [string, Partial<ClaudeSetupFacts>][])("구성을 모르거나 MCP 정의를 읽지 못한 켜진 플러그인이 있어도 서버 막기 후보를 낸다. 그 플러그인의 서버는 이름으로 막히지 않는다(「6단계 1부 계획 전 결정」 3번): %s", (_name, setup) => {
    const result = run({ mcpServers: [mcpServer("idle1"), mcpServer("idle2")], ...setup });
    expect(result.servers.measurement).toMatchObject({ status: "scored", value: 1 });
    expect(ids(result)).toEqual(["A3:claude-code:idle1", "A3:claude-code:idle2"]);
  });
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/core/installs-candidates.test.ts`
Expected: FAIL. 바뀐 시험 파일 하나에서 시험 일곱이 실패한다. Codex의 후보가 늘 비어 있고(넷 가운데 셋), 같은 이름의 플러그인 서버가 쓰이면 서버 막기 후보를 내지 않으며, 구성을 모르거나 MCP 정의를 읽지 못한 켜진 플러그인이 있으면 서버 막기 후보를 내지 않는다(셋).

- [ ] **Step 3: 구현한다**

`src/core/installs/candidates.ts`(찾을 곳 1/6):

```ts
// 정비 후보를 낸다. A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기다. 판정만으로 내지 않고 꺼도 되는지를 따로 본다. 적용은 하지 않는다(순수 함수, 설계 16.1, 16.2)
import type { ToolId } from "../../adapters/types.ts";
```

`src/core/installs/candidates.ts`(바꾼 뒤 1/6):

```ts
// 정비 후보를 낸다. A1 스킬 끄기, A2 플러그인 끄기, A3 서버 막기, A4 서버 끄기(Codex)다. 판정만으로 내지 않고 꺼도 되는지를 따로 본다. 적용은 하지 않는다(순수 함수, 설계 16.1, 16.2, 「6단계 1부 계획 전 결정」 3번)
import type { ToolId } from "../../adapters/types.ts";
```

`src/core/installs/candidates.ts`(찾을 곳 2/6):

```ts
  id: string;
  unit: "A1" | "A2" | "A3";
  /** 이 후보가 나온 규칙 */
```

`src/core/installs/candidates.ts`(바꾼 뒤 2/6):

```ts
  id: string;
  unit: "A1" | "A2" | "A3" | "A4";
  /** 이 후보가 나온 규칙 */
```

`src/core/installs/candidates.ts`(찾을 곳 3/6):

```ts
  tool: ToolId;
  /** 바꾸는 열쇠. A1은 스킬 이름(skillOverrides), A2는 설치 ID(enabledPlugins), A3은 서버 이름(deniedMcpServers) */
  target: string;
```

`src/core/installs/candidates.ts`(바꾼 뒤 3/6):

```ts
  tool: ToolId;
  /** 바꾸는 열쇠. A1은 스킬 이름(skillOverrides), A2는 설치 ID(enabledPlugins), A3은 서버 이름(deniedMcpServers), A4는 서버 이름(Codex의 mcp_servers.<이름>.enabled) */
  target: string;
```

`src/core/installs/candidates.ts`(찾을 곳 4/6):

```ts

export function candidatesOf(tool: ToolSetup, skills: SkillJudgement, servers: ServerJudgement, day: EvalDay, self: SelfIdentity): Candidate[] {
  // Codex 설치의 정비는 6단계가 그 조건을 정할 때까지 내지 않는다(설계 「5단계 3부 계획 전 결정」 11번)
  if (tool.tool === "codex") return [];
  const { setup } = tool;
```

`src/core/installs/candidates.ts`(바꾼 뒤 4/6):

```ts

const make = (tool: ToolSetup, unit: Candidate["unit"], rule: Candidate["rule"], targets: ReadonlySet<string>): Candidate[] =>
  [...targets].sort(byText).map((target) => ({ id: `${unit}:${tool.tool}:${target}`, unit, rule, tool: tool.tool, target }));

/**
 * Codex의 서버 끄기(A4). 사용자 층의 그 서버에 enabled = false를 적는다. 신뢰한 프로젝트 층이 같은 이름을 다시 적었으면 깊이 합쳐져 그 프로젝트의 서버도 꺼질 수 있어서,
 * 그 서버도 안 부른 것이 확인됨이어야 한다. 같은 이름의 플러그인 서버는 설정의 서버에 져서 원래 쓰이지 않으므로 따지지 않는다(「6단계 계획 전 결정」 3번)
 */
function codexCandidates(tool: ToolSetup, servers: ServerJudgement): Candidate[] {
  const a4 = new Set<string>();
  for (const judged of servers.servers) {
    const { server } = judged;
    if (server.scope !== "user" || !server.enabled || server.managedFixed || judged.verdict !== "unused" || judged.excluded !== null) continue;
    const sameName = servers.servers.filter((other) => other !== judged && other.server.scope === "project" && other.server.enabled && other.server.name === server.name);
    if (sameName.every((other) => other.verdict === "unused" && other.excluded === null)) a4.add(server.name);
  }
  return make(tool, "A4", "E6", a4);
}

export function candidatesOf(tool: ToolSetup, skills: SkillJudgement, servers: ServerJudgement, day: EvalDay, self: SelfIdentity): Candidate[] {
  // Codex는 서버 끄기만 낸다. 스킬은 사용을 기록하지 않아 안 쓴 것이 확인되지 않고, 플러그인과 플러그인의 서버는 정비하지 않는다(「6단계 계획 전 결정」 4번)
  if (tool.tool === "codex") return codexCandidates(tool, servers);
  const { setup } = tool;
```

`src/core/installs/candidates.ts`(찾을 곳 5/6):

```ts
  const hooksUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.hooksUnreadable);
  // 서버 막기는 이름으로 듣는다. 같은 이름의 서버가 있는지 알 수 없으면 내지 않는다
  const serversUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.mcpUnreadable);
  const selfPaths = new Set(self.skillRealPaths);
```

`src/core/installs/candidates.ts`(바꾼 뒤 5/6):

```ts
  const hooksUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.hooksUnreadable);
  const selfPaths = new Set(self.skillRealPaths);
```

`src/core/installs/candidates.ts`(찾을 곳 6/6):

```ts

  if (!serversUnseen) {
    // A3. 사용자 범위 서버를 이름으로 막는다. 같은 이름의 서버가 다른 범위에 켜져 있으면 그것도 안 부른 것이 확인됨이어야 한다
    for (const judged of servers.servers) {
      const { server } = judged;
      if (server.scope !== "user" || !server.enabled || server.managedFixed || judged.verdict !== "unused" || judged.excluded !== null) continue;
      const sameName = servers.servers.filter((other) => other !== judged && other.server.enabled && other.server.name === server.name);
      if (sameName.every((other) => other.verdict === "unused" && other.excluded === null)) a3.add(server.name);
    }
  }

  const make = (unit: Candidate["unit"], rule: Candidate["rule"], targets: ReadonlySet<string>): Candidate[] =>
    [...targets].sort(byText).map((target) => ({ id: `${unit}:${tool.tool}:${target}`, unit, rule, tool: tool.tool, target }));
  return [...make("A1", "E5", a1), ...make("A2", "E5", a2), ...make("A3", "E6", a3)];
}
```

`src/core/installs/candidates.ts`(바꾼 뒤 6/6):

```ts

  // A3. 사용자 범위 서버를 이름으로 막는다. 같은 이름의 서버가 다른 범위에 켜져 있으면 그것도 안 부른 것이 확인됨이어야 한다.
  // 플러그인 서버는 막는 목록이 등록 이름으로만 막아 같이 막히지 않으므로 따지지 않는다. 구성을 모르는 플러그인도 그래서 막지 않는다(「6단계 계획 전 결정」 2번)
  for (const judged of servers.servers) {
    const { server } = judged;
    if (server.scope !== "user" || !server.enabled || server.managedFixed || judged.verdict !== "unused" || judged.excluded !== null) continue;
    const sameName = servers.servers.filter((other) => other !== judged && other.server.scope !== "plugin" && other.server.enabled && other.server.name === server.name);
    if (sameName.every((other) => other.verdict === "unused" && other.excluded === null)) a3.add(server.name);
  }

  return [...make(tool, "A1", "E5", a1), ...make(tool, "A2", "E5", a2), ...make(tool, "A3", "E6", a3)];
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/installs-candidates.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 39개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/core/installs-candidates.test.ts src/core/installs/candidates.ts
git commit -m "feat: 서버 막기 조건을 고치고 Codex 서버 끄기를 엶"
```

---

### Task 3: 계획 항목과 바꿀 파일 읽기

**Files:**
- Create: `src/tune/items.ts`
- Modify: `src/scan/settings.ts`
- Test: `test/tune/items.test.ts`

**Interfaces:**
- Consumes: 과제 2의 후보(`Candidate`), 스킬 묶음(`SkillBundle`)과 서버 판정(`JudgedServer`), Codex 설정 해석(`parseCodexConfig`, `isTable`, `src/scan/codex-config.ts`), 묶음 판정(`isObject`, `src/scan/json.ts`).
- Produces: `src/tune/items.ts`의 `TuneKey`, `TuneImpact`, `TuneBlock`, `TuneItem`, `ItemContext`, `TargetRead`, `fingerprintOf`, `targetPath`, `readTarget`, `tableHeaderCount`, `tuneItem`. 과제 4가 쓰고, 2부의 적용 검사가 모양 판정과 파일 읽기를 이어 쓴다.

설계 「6단계 1부 계획 전 결정」 4번과 16.3 검사표의 앞 두 줄이다.

- 항목은 바꿀 파일(그 도구의 설정 홈 아래 사용자 설정), 자리(JSON 묶음 안의 열쇠, JSON 목록에 더하는 항목, Codex 서버 표 안의 `enabled`), 지금 값, 바꿀 값, 영향 범위, 자동으로 고칠 수 없는 까닭이다. 지금 값이 없으면 그 칸을 두지 않는다. 2부가 되돌릴 때 "없었다"를 그대로 되살리려는 것이다.
- 바꿀 파일은 원본 바이트로 읽는다(바이트 순서 표시도 남긴다). 스캐너의 글 읽기는 그것을 떼어 쓰지 않는다. 파일과 그 폴더가 링크인지 함께 본다.
- 고칠 수 없는 까닭은 버전, 파일의 상태, 모양의 차례로 본다. JSON은 바이트 순서 표시가 없고 주석이 없는 표준 JSON이며 맨 바깥과 바꿀 열쇠의 부모가 맞는 꼴이어야 한다. TOML은 풀려야 하고 그 서버의 표가 머리 하나로 여러 줄에 적혀 있어야 한다.
- 지금 값은 그 단위가 받는 꼴(스킬 끄기는 네 모드의 글, 플러그인 끄기와 서버 끄기는 참거짓)일 때만 싣는다. 그 밖의 값은 설정의 다른 값일 수 있어 싣지 않고 `value-shape`로 고치지 않는다(계획 리뷰 1차). 스킬 끄기의 네 모드는 스캐너의 것(`SKILL_OVERRIDE_MODES`, `src/scan/settings.ts`)을 공개해 같이 쓴다.
- 표 머리를 셀 때는 줄을 TOML 규칙대로 글자 단위로 훑어 주석, 한 줄 문자열(기본과 리터럴, 이스케이프), 여러 줄 문자열을 건너뛰고 문자열 밖에서 시작하는 줄만 센다. 규칙에 맞지 않거나 문서가 여러 줄 문자열 안에서 끝나면 -1이라 고치지 않는다(계획 리뷰 1차. 줄 단위로만 따라가면 주석의 세 따옴표 때문에 문자열 안의 가짜 머리를 실제 표로 셌다). 표 머리도 같은 규칙으로 뽑는다. 따옴표 이름 안의 `]`와 `#`는 건너뛰고 문자열 밖의 첫 `]`에서 닫으며 그 뒤에는 공백과 주석만 온다(재확인. 정규식으로 뽑으면 머리 뒤 주석의 대괄호까지 머리로 잡아 정상 표를 놓쳤다).
- 영향 범위는 문장이 아니라 수로 둔다. 문장은 과제 5가 짓는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/tune/items.test.ts`(새 파일):

```ts
// 정비 후보를 계획 항목(바꿀 파일, 자리, 지금 값, 바꿀 값, 영향 범위, 자동으로 고칠 수 없는 까닭)으로 바꾸는 것과 바꿀 파일 읽기를 시험한다(설계 16.1, 16.3, 16.5의 1번, 「6단계 1부 계획 전 결정」 4·7번)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Candidate } from "../../src/core/installs/candidates.ts";
import { fingerprintOf, readTarget, tableHeaderCount, targetPath, tuneItem, type ItemContext, type TargetRead } from "../../src/tune/items.ts";
import { CODEX_HOME, HOME, mcpServer, skill } from "../helpers/facts.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const candidate = (unit: Candidate["unit"], target: string): Candidate => ({ id: `${unit}:${unit === "A4" ? "codex" : "claude-code"}:${target}`, unit, rule: unit === "A1" || unit === "A2" ? "E5" : "E6", tool: unit === "A4" ? "codex" : "claude-code", target });
const context = (input: Partial<ItemContext> = {}): ItemContext => ({ home: HOME, bundles: [], servers: [], versionOk: true, ...input });
const ok = (text: string | Buffer): TargetRead => ({ status: "ok", bytes: Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8"), regular: true });
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

describe("계획 항목의 자리와 값", () => {
  it("스킬 끄기는 사용자 설정의 skillOverrides에서 그 이름을 off로 바꾼다. 지금 값이 없으면 칸을 두지 않는다", () => {
    expect(tuneItem(candidate("A1", "idle"), context(), ok(json({ permissions: {} })))).toEqual({
      id: "A1:claude-code:idle",
      unit: "A1",
      rule: "E5",
      tool: "claude-code",
      target: "idle",
      file: join(HOME, "settings.json"),
      layer: "user",
      key: { kind: "json-entry", parent: "skillOverrides", name: "idle" },
      next: "off",
      impact: { unit: "A1", skills: { user: 0, project: 0, plugin: 0 } },
      blocked: null,
    });
    expect(tuneItem(candidate("A1", "idle"), context(), ok(json({ skillOverrides: { idle: "on" } }))).current).toBe("on");
  });

  it("플러그인 끄기는 enabledPlugins의 그 설치 ID를 false로, 서버 막기는 deniedMcpServers에 그 이름의 항목을 더한다", () => {
    const a2 = tuneItem(candidate("A2", "p@m"), context(), ok(json({ enabledPlugins: { "p@m": true } })));
    expect([a2.key, a2.current, a2.next]).toEqual([{ kind: "json-entry", parent: "enabledPlugins", name: "p@m" }, true, false]);
    const a3 = tuneItem(candidate("A3", "db"), context(), ok(json({ deniedMcpServers: [{ serverName: "other" }] })));
    expect([a3.key, "current" in a3, a3.next]).toEqual([{ kind: "json-list-add", parent: "deniedMcpServers", entry: { serverName: "db" } }, false, { serverName: "db" }]);
  });

  it("서버 끄기는 Codex 사용자 설정의 그 서버 표에 enabled = false를 적는다. 지금 값은 그 표의 enabled다", () => {
    const codex = context({ home: CODEX_HOME });
    const item = tuneItem(candidate("A4", "db"), codex, ok('[mcp_servers.db]\ncommand = "x"\n'));
    expect([item.file, item.key, "current" in item, item.next, item.blocked]).toEqual([join(CODEX_HOME, "config.toml"), { kind: "toml-table-key", table: "db", key: "enabled" }, false, false, null]);
    expect(tuneItem(candidate("A4", "db"), codex, ok('[mcp_servers.db]\ncommand = "x"\nenabled = true\n')).current).toBe(true);
  });

  it("바꿀 파일은 도구의 설정 홈 아래 사용자 설정이다", () => {
    expect(targetPath(candidate("A3", "db"), HOME)).toBe(join(HOME, "settings.json"));
    expect(targetPath(candidate("A4", "db"), CODEX_HOME)).toBe(join(CODEX_HOME, "config.toml"));
  });
});

describe("영향 범위", () => {
  it("스킬 끄기는 그 이름으로 같이 꺼지는 스킬 위치를 범위마다 센다(폴더 이름이나 머리말 이름이 그 이름인 것)", () => {
    const bundles = [{ positions: [skill("idle"), skill("idle", { scope: "project", projectRoot: "/work/app" })] }, { positions: [skill("other", { recordNames: ["other", "idle"] })] }, { positions: [skill("busy")] }];
    expect(tuneItem(candidate("A1", "idle"), context({ bundles }), ok("{}\n")).impact).toEqual({ unit: "A1", skills: { user: 2, project: 1, plugin: 0 } });
  });

  it("플러그인 끄기는 그 플러그인의 스킬 묶음 수를 센다", () => {
    const bundles = [{ positions: [skill("p:a", { scope: "plugin", pluginId: "p@m" })] }, { positions: [skill("p:b", { scope: "plugin", pluginId: "p@m" })] }, { positions: [skill("q:a", { scope: "plugin", pluginId: "q@m" })] }];
    expect(tuneItem(candidate("A2", "p@m"), context({ bundles }), ok("{}\n")).impact).toEqual({ unit: "A2", skills: 2 });
  });

  it("서버 막기는 같은 이름으로 함께 막히는 켜진 로컬·프로젝트 범위 서버와 claude.ai 연결을 센다. 플러그인 서버와 꺼 둔 것은 세지 않는다", () => {
    const servers = [mcpServer("db"), mcpServer("db", { scope: "local", projectRoot: "/a" }), mcpServer("db", { scope: "project", projectRoot: "/b" }), mcpServer("db", { scope: "project", projectRoot: "/c", enabled: false }), mcpServer("db", { scope: "plugin", pluginId: "p@m" }), mcpServer("db", { scope: "claude-ai", definitionHash: null }), mcpServer("other", { scope: "local", projectRoot: "/a" })].map((server) => ({ server }));
    expect(tuneItem(candidate("A3", "db"), context({ servers }), ok("{}\n")).impact).toEqual({ unit: "A3", sameName: { local: 1, project: 1, claudeAi: 1 } });
  });

  it("서버 끄기는 같은 이름을 다시 적은 신뢰한 프로젝트의 켜진 서버를 센다", () => {
    const servers = [mcpServer("db"), mcpServer("db", { scope: "project", projectRoot: "/a" }), mcpServer("db", { scope: "project", projectRoot: "/b" }), mcpServer("db", { scope: "plugin", pluginId: "p@m" })].map((server) => ({ server }));
    expect(tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME, servers }), ok('[mcp_servers.db]\ncommand = "x"\n')).impact).toEqual({ unit: "A4", projects: 2 });
  });
});

describe("자동으로 고칠 수 없는 까닭", () => {
  const blockedOf = (unit: Candidate["unit"], read: TargetRead, versionOk = true): string | null => tuneItem(candidate(unit, unit === "A2" ? "p@m" : "db"), context({ home: unit === "A4" ? CODEX_HOME : HOME, versionOk }), read).blocked;

  it("파일이 없거나 읽지 못했거나, 파일이나 그 폴더가 링크면 고치지 않는다", () => {
    expect(blockedOf("A1", { status: "missing" })).toBe("file-missing");
    expect(blockedOf("A1", { status: "unreadable" })).toBe("file-unreadable");
    expect(blockedOf("A1", { status: "ok", bytes: Buffer.from("{}\n"), regular: false })).toBe("not-regular");
  });

  it("확인한 범위 밖 버전이면 파일의 모양보다 먼저 그 까닭으로 막는다", () => {
    expect(blockedOf("A1", ok("{}\n"), false)).toBe("unverified-version");
    expect(blockedOf("A4", { status: "missing" }, false)).toBe("unverified-version");
  });

  it("JSON은 바이트 순서 표시가 없고, 주석이 없는 표준 JSON이며, 맨 바깥과 바꿀 열쇠의 부모가 맞는 꼴이어야 한다", () => {
    expect(blockedOf("A1", ok(Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("{}\n")])))).toBe("byte-order-mark");
    expect(blockedOf("A1", ok('// 메모\n{"skillOverrides": {}}\n'))).toBe("not-json-object");
    expect(blockedOf("A1", ok("[]\n"))).toBe("not-json-object");
    expect(blockedOf("A1", ok('{"skillOverrides": []}\n'))).toBe("parent-shape");
    expect(blockedOf("A3", ok('{"deniedMcpServers": {}}\n'))).toBe("parent-shape");
    expect(blockedOf("A2", ok('{"enabledPlugins": "p@m"}\n'))).toBe("parent-shape");
    expect(blockedOf("A1", ok('{"skillOverrides": {"idle": "on"}}\n'))).toBeNull();
  });

  it("TOML은 풀려야 하고, 그 서버의 표가 머리 하나로 여러 줄에 적혀 있어야 한다. 인라인 표와 점 열쇠로 적은 것은 고치지 않는다", () => {
    expect(blockedOf("A4", ok('[mcp_servers.db\ncommand = "x"\n'))).toBe("not-toml");
    expect(blockedOf("A4", ok('mcp_servers.db = { command = "x" }\n'))).toBe("table-shape");
    expect(blockedOf("A4", ok('[mcp_servers]\ndb = { command = "x" }\n'))).toBe("table-shape");
    expect(blockedOf("A4", ok('[mcp_servers]\ndb.command = "x"\n'))).toBe("table-shape");
    expect(blockedOf("A4", ok(Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('[mcp_servers.db]\ncommand = "x"\n')])))).toBe("byte-order-mark");
    expect(blockedOf("A4", ok('[mcp_servers."db"]\ncommand = "x"\n'))).toBeNull();
    expect(blockedOf("A4", ok("[ mcp_servers . 'db' ] # 메모\ncommand = \"x\"\n"))).toBeNull();
  });

  it("여러 줄 문자열 안에 적힌 표 머리 꼴의 줄은 표 머리로 세지 않는다", () => {
    const text = 'note = """\n[mcp_servers.db]\n"""\n[mcp_servers.db]\ncommand = "x"\n';
    expect(blockedOf("A4", ok(text))).toBeNull();
    expect(blockedOf("A4", ok("note = '''\n[mcp_servers.db]\n'''\n[mcp_servers.db]\ncommand = \"x\"\n"))).toBeNull();
  });
});

describe("지금 값의 꼴과 TOML의 문자열(6단계 1부 계획 리뷰 1차)", () => {
  it("지금 값이 그 단위가 받는 꼴이 아니면 계획에 싣지 않고 고치지 않는다. 스킬 끄기는 네 모드의 글, 플러그인 끄기와 서버 끄기는 참거짓이다", () => {
    const a1 = (value: unknown) => tuneItem(candidate("A1", "idle"), context(), ok(json({ skillOverrides: { idle: value } })));
    const secret = a1({ env: { TOKEN: "SYNTHETIC-SECRET-VALUE" } });
    expect([secret.blocked, "current" in secret, JSON.stringify(secret).includes("SYNTHETIC-SECRET-VALUE")]).toEqual(["value-shape", false, false]);
    expect(["weird", 1, null, ["off"]].map((value) => a1(value).blocked)).toEqual(["value-shape", "value-shape", "value-shape", "value-shape"]);
    expect(["on", "name-only", "user-invocable-only"].map((value) => [a1(value).blocked, a1(value).current])).toEqual([
      [null, "on"],
      [null, "name-only"],
      [null, "user-invocable-only"],
    ]);
    expect(tuneItem(candidate("A2", "p@m"), context(), ok(json({ enabledPlugins: { "p@m": "true" } }))).blocked).toBe("value-shape");
    const a4 = (enabled: string) => tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME }), ok(`[mcp_servers.db]\ncommand = "x"\nenabled = ${enabled}\n`));
    expect([a4('"yes"').blocked, a4("1").blocked, a4("false").blocked, a4("false").current]).toEqual(["value-shape", "value-shape", null, false]);
  });

  it("주석과 한 줄 문자열 안의 세 따옴표는 여러 줄 문자열로 보지 않는다. 문자열 밖에서 시작하는 줄의 표 머리만 센다", () => {
    const tail = '[mcp_servers.db]\ncommand = "x"\n';
    expect(tableHeaderCount('mcp_servers.db = {command="x"}\n# """\nnote = """\n[mcp_servers.db]\n"""\n', "db")).toBe(0);
    expect(tableHeaderCount(`note = "triple marker" # """\n${tail}`, "db")).toBe(1);
    expect(tableHeaderCount(`x = '"""'\n${tail}`, "db")).toBe(1);
    expect(tableHeaderCount(`x = "a\\"\\"\\"b"\n${tail}`, "db")).toBe(1);
    expect(tableHeaderCount(`x = """a""""\n${tail}`, "db")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."d#b"]\ncommand = "x"\n', "d#b")).toBe(1);
    // 머리 뒤의 주석에 대괄호가 있어도, 따옴표 이름 안에 ]나 #가 있어도 그 표의 머리다(6단계 1부 계획 리뷰 1차 재확인)
    expect(tableHeaderCount('[mcp_servers.db] # [example]\ncommand = "x"\n', "db")).toBe(1);
    expect(tableHeaderCount('[mcp_servers.db] # ]\ncommand = "x"\n', "db")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."d#b"] # ]\ncommand = "x"\n', "d#b")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."a]b"]\ncommand = "x"\n', "a]b")).toBe(1);
    expect(tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME }), ok('[mcp_servers.db] # [example]\ncommand = "x"\n')).blocked).toBeNull();
    // 머리 뒤에 주석이 아닌 글이 있으면 머리가 아니다
    expect(tableHeaderCount('[mcp_servers.db] x\ncommand = "x"\n', "db")).toBe(0);
    // 문서가 여러 줄 문자열 안에서 끝나면 모른다
    expect(tableHeaderCount(`${tail}x = """\n`, "db")).toBe(-1);
    // 주석에 세 따옴표가 있는 인라인 표는 계획에서 고치지 않는 표다
    const inline = tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME }), ok('mcp_servers.db = {command="x"}\n# """\nnote = """\n[mcp_servers.db]\n"""\n'));
    expect(inline.blocked).toBe("table-shape");
  });
});

describe("지문과 파일 읽기", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTemp();
  });
  afterEach(async () => removeTemp(root));

  it("지문은 원본 바이트의 SHA-256이다. 한 바이트만 달라도 다르다", () => {
    expect(fingerprintOf(Buffer.from("{}\n"))).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf(Buffer.from("{}\n"))).toBe(fingerprintOf(Buffer.from("{}\n")));
    expect(fingerprintOf(Buffer.from("{}\n"))).not.toBe(fingerprintOf(Buffer.from("{} \n")));
  });

  it("있는 파일은 바이트 그대로 읽고(바이트 순서 표시도 남긴다) 보통 파일인지 적는다. 없으면 없음이다", async () => {
    const path = join(root, "cfg", "settings.json");
    await put(path, "﻿{}\n");
    const read = await readTarget(path);
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect([read.bytes.subarray(0, 3).toString("hex"), read.regular]).toEqual(["efbbbf", true]);
    expect(await readTarget(join(root, "cfg", "none.json"))).toEqual({ status: "missing" });
    expect(await readTarget(join(root, "nodir", "none.json"))).toEqual({ status: "missing" });
  });

  it("그 폴더가 링크면 보통 파일이 아니다", async () => {
    await put(join(root, "real", "settings.json"), "{}\n");
    await linkDir(join(root, "real"), join(root, "linked"));
    const read = await readTarget(join(root, "linked", "settings.json"));
    expect(read.status === "ok" && read.regular).toBe(false);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/tune/items.test.ts`
Expected: FAIL. 새 시험 파일이 그 모듈(`src/tune/items.ts`)이 없어 불러오지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/settings.ts`(찾을 곳):

```ts
/** skillOverrides의 값. 이 밖의 값은 정하지 않은 것으로 본다(공식 문서 settings-reference 「skillOverrides」) */
const SKILL_OVERRIDE_MODES = new Set(["on", "name-only", "user-invocable-only", "off"]);
```

`src/scan/settings.ts`(바꾼 뒤):

```ts
/** skillOverrides의 값. 이 밖의 값은 정하지 않은 것으로 본다(공식 문서 settings-reference 「skillOverrides」). 정비 계획도 지금 값의 꼴을 이것으로 본다 */
export const SKILL_OVERRIDE_MODES: ReadonlySet<string> = new Set(["on", "name-only", "user-invocable-only", "off"]);
```

`src/tune/items.ts`(새 파일):

```ts
// 정비 후보를 계획 항목(바꿀 파일, 자리, 지금 값, 바꿀 값, 영향 범위, 자동으로 고칠 수 없는 까닭)으로 바꾸고, 바꿀 파일을 읽기만 한다(설계 16.1, 16.3, 16.5의 1번, 「6단계 1부 계획 전 결정」 4·7번)
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Candidate } from "../core/installs/candidates.ts";
import type { JudgedServer } from "../core/installs/servers.ts";
import type { SkillBundle } from "../core/installs/skills.ts";
import { isTable, parseCodexConfig } from "../scan/codex-config.ts";
import { isObject } from "../scan/json.ts";
import { SKILL_OVERRIDE_MODES } from "../scan/settings.ts";

/** 바꾸는 자리. JSON 묶음 안의 열쇠, JSON 목록에 더하는 항목, Codex 서버 표(mcp_servers.<table>) 안의 열쇠다 */
export type TuneKey =
  | { kind: "json-entry"; parent: "skillOverrides" | "enabledPlugins"; name: string }
  | { kind: "json-list-add"; parent: "deniedMcpServers"; entry: { serverName: string } }
  | { kind: "toml-table-key"; table: string; key: "enabled" };

/** 영향 범위. 문장은 문구가 짓는다 */
export type TuneImpact =
  | { unit: "A1"; skills: { user: number; project: number; plugin: number } }
  | { unit: "A2"; skills: number }
  | { unit: "A3"; sameName: { local: number; project: number; claudeAi: number } }
  | { unit: "A4"; projects: number };

/** 자동으로 고칠 수 없는 까닭(16.3 검사표의 앞 두 줄과 16.2 끝의 버전). value-shape는 지금 값이 그 단위가 받는 꼴이 아닌 것이고, 그 값은 계획에 싣지 않는다 */
export type TuneBlock = "unverified-version" | "file-missing" | "file-unreadable" | "not-regular" | "byte-order-mark" | "not-json-object" | "parent-shape" | "value-shape" | "not-toml" | "table-shape";

export interface TuneItem {
  id: string;
  unit: Candidate["unit"];
  rule: Candidate["rule"];
  tool: Candidate["tool"];
  target: string;
  /** 바꿀 파일의 절대 경로 */
  file: string;
  layer: "user";
  key: TuneKey;
  /** 지금 값. 그 자리에 값이 없으면 이 칸이 없다(목록에 더하는 것은 늘 없다) */
  current?: unknown;
  next: string | boolean | { serverName: string };
  impact: TuneImpact;
  blocked: TuneBlock | null;
}

/** 계획 항목을 짓는 데 쓰는 것. 묶음은 스킬 판정의 묶음, 서버는 서버 판정의 서버다(위치와 사실만 본다) */
export interface ItemContext {
  /** 그 도구의 설정 홈(Claude Code는 설정 폴더, Codex는 Codex 홈) */
  home: string;
  bundles: readonly Pick<SkillBundle, "positions">[];
  servers: readonly Pick<JudgedServer, "server">[];
  /** 그 도구의 버전이 정비가 바꾸는 열쇠의 뜻을 확인한 범위 안이다(7번) */
  versionOk: boolean;
}

/** 바꿀 파일을 읽은 것. 바이트는 원본 그대로이고(바이트 순서 표시도 남긴다), regular는 파일과 그 폴더가 링크가 아닌 보통 파일과 보통 폴더라는 것이다 */
export type TargetRead = { status: "ok"; bytes: Buffer; regular: boolean } | { status: "missing" } | { status: "unreadable" };

export const fingerprintOf = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** 바꿀 파일. 사용자 층의 설정이다 */
export function targetPath(candidate: Candidate, home: string): string {
  return join(home, candidate.unit === "A4" ? "config.toml" : "settings.json");
}

/** 바꿀 파일을 읽기만 한다. 임시 파일에 쓰고 이름을 바꾸면 링크가 보통 파일로 바뀔 수 있어 링크인지 함께 본다(16.3) */
export async function readTarget(path: string): Promise<TargetRead> {
  let regular: boolean;
  try {
    const [file, folder] = await Promise.all([lstat(path), lstat(dirname(path))]);
    regular = file.isFile() && folder.isDirectory();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return code === "ENOENT" || code === "ENOTDIR" ? { status: "missing" } : { status: "unreadable" };
  }
  try {
    return { status: "ok", bytes: await readFile(path), regular };
  } catch {
    return { status: "unreadable" };
  }
}

const hasBom = (bytes: Buffer): boolean => bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

interface State {
  present: boolean;
  value?: unknown;
  blocked: TuneBlock | null;
}

/** JSON 설정에서 그 자리의 지금 값과 고칠 수 있는 모양인지. 표준 JSON.parse는 주석을 받지 않는다 */
function jsonState(bytes: Buffer, key: Extract<TuneKey, { kind: "json-entry" | "json-list-add" }>): State {
  if (hasBom(bytes)) return { present: false, blocked: "byte-order-mark" };
  let doc: unknown;
  try {
    doc = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { present: false, blocked: "not-json-object" };
  }
  if (!isObject(doc)) return { present: false, blocked: "not-json-object" };
  const parent = doc[key.parent];
  if (parent === undefined) return { present: false, blocked: null };
  if (key.kind === "json-list-add") return { present: false, blocked: Array.isArray(parent) ? null : "parent-shape" };
  if (!isObject(parent)) return { present: false, blocked: "parent-shape" };
  if (!Object.hasOwn(parent, key.name)) return { present: false, blocked: null };
  // 지금 값은 그 단위가 받는 꼴(스킬 끄기는 네 모드의 글, 플러그인 끄기는 참거짓)일 때만 싣는다. 그 밖의 값은 설정의 다른 값일 수 있어 싣지 않고 고치지 않는다(16.3, 16.5의 2번)
  const value = parent[key.name];
  const ok = key.parent === "skillOverrides" ? typeof value === "string" && SKILL_OVERRIDE_MODES.has(value) : typeof value === "boolean";
  return ok ? { present: true, value, blocked: null } : { present: false, blocked: "value-shape" };
}

/** TOML 열쇠 한 조각(맨 열쇠, 큰따옴표 문자열, 작은따옴표 문자열)을 풀어 낸다. 풀지 못하면 null */
function keyPart(text: string): string | null {
  const part = text.trim();
  if (/^[A-Za-z0-9_-]+$/.test(part)) return part;
  if (/^'[^']*'$/.test(part)) return part.slice(1, -1);
  if (/^"(?:[^"\\]|\\.)*"$/.test(part)) {
    try {
      return JSON.parse(part) as string;
    } catch {
      return null;
    }
  }
  return null;
}

/** 점으로 이은 TOML 열쇠를 조각들로 나눈다. 따옴표 안의 점은 나누지 않는다 */
function splitDotted(text: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quote !== null) {
      current += char;
      if (char === "\\" && quote === '"') current += text[++i] ?? "";
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ".") {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (quote !== null) return null;
  parts.push(current);
  const keys = parts.map(keyPart);
  return keys.every((key) => key !== null) ? (keys as string[]) : null;
}

/** 여러 줄 문자열 안이면 그 구분자, 밖이면 null */
type Multiline = '"""' | "'''" | null;

/**
 * 문자열 밖에서 시작하는 줄이 표 머리([...])면 그 안의 열쇠 글을 낸다. 따옴표 이름 안의 ]와 #는 건너뛰고, 문자열 밖의 첫 ]에서 머리를 닫는다.
 * 그 뒤에는 공백과 주석만 올 수 있다(주석 안의 대괄호도 그렇다). 표 머리가 아니면 null이다(배열 표 [[...]]도 아니다)
 */
function headerKey(line: string): string | null {
  const start = line.search(/\S/);
  if (start < 0 || line[start] !== "[" || line[start + 1] === "[") return null;
  let i = start + 1;
  while (i < line.length) {
    const char = line[i]!;
    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== char) j += char === '"' && line[j] === "\\" ? 2 : 1;
      if (j >= line.length) return null;
      i = j + 1;
      continue;
    }
    if (char === "]") return /^\s*(?:#.*)?$/.test(line.slice(i + 1)) ? line.slice(start + 1, i) : null;
    i++;
  }
  return null;
}

/** 한 줄을 TOML 규칙대로 훑어 줄 끝의 상태(여러 줄 문자열 안인지)를 낸다. 주석과 한 줄 문자열은 건너뛴다. 한 줄 문자열이 그 줄에서 닫히지 않으면 undefined다(규칙에 맞지 않는다) */
function scanLine(line: string, start: Multiline): Multiline | undefined {
  let state = start;
  let i = 0;
  while (i < line.length) {
    if (state !== null) {
      // 여러 줄 기본 문자열은 \ 뒤의 글자를 건너뛴다. 끝 구분자 뒤에 같은 따옴표가 두 개까지 더 붙을 수 있다(그것은 내용이다)
      if (state === '"""' && line[i] === "\\") {
        i += 2;
        continue;
      }
      if (line.startsWith(state, i)) {
        let end = i + 3;
        while (end < line.length && end - i < 5 && line[end] === state[0]) end++;
        state = null;
        i = end;
      } else i++;
      continue;
    }
    if (line[i] === "#") return null;
    const triple = line.startsWith('"""', i) ? '"""' : line.startsWith("'''", i) ? "'''" : null;
    if (triple !== null) {
      state = triple;
      i += 3;
      continue;
    }
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i]!;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) j += quote === '"' && line[j] === "\\" ? 2 : 1;
      if (j >= line.length) return undefined;
      i = j + 1;
      continue;
    }
    i++;
  }
  return state;
}

/**
 * 그 서버의 표 머리([mcp_servers.<이름>])가 몇 번 나오는지. 주석과 문자열(한 줄·여러 줄, 기본·리터럴)을 TOML 규칙대로 건너뛰고, 문자열 밖에서 시작하는 줄만 표 머리로 본다.
 * 규칙에 맞지 않는 곳이 있거나 문서가 여러 줄 문자열 안에서 끝나면 -1이다(그 표는 고치지 않는다, 6단계 1부 계획 리뷰 1차)
 */
export function tableHeaderCount(text: string, server: string): number {
  let count = 0;
  let state: Multiline = null;
  for (const line of text.split(/\r?\n/)) {
    if (state === null) {
      const key = headerKey(line);
      const keys = key === null ? null : splitDotted(key);
      if (keys !== null && keys.length === 2 && keys[0] === "mcp_servers" && keys[1] === server) count++;
    }
    const next = scanLine(line, state);
    if (next === undefined) return -1;
    state = next;
  }
  return state === null ? count : -1;
}

/** Codex 설정에서 그 서버 표의 enabled 지금 값과 고칠 수 있는 모양인지. 표가 머리 하나로 여러 줄에 적혀 있어야 한다(16.3) */
function tomlState(bytes: Buffer, server: string): State {
  if (hasBom(bytes)) return { present: false, blocked: "byte-order-mark" };
  const text = bytes.toString("utf8");
  const doc = parseCodexConfig(text);
  if (doc === null) return { present: false, blocked: "not-toml" };
  const servers = doc.mcp_servers;
  const table = isTable(servers) ? servers[server] : undefined;
  if (!isTable(table) || tableHeaderCount(text, server) !== 1) return { present: false, blocked: "table-shape" };
  if (!Object.hasOwn(table, "enabled")) return { present: false, blocked: null };
  // 지금 값은 참거짓일 때만 싣는다
  return typeof table.enabled === "boolean" ? { present: true, value: table.enabled, blocked: null } : { present: false, blocked: "value-shape" };
}

function keyOf(candidate: Candidate): TuneKey {
  switch (candidate.unit) {
    case "A1":
      return { kind: "json-entry", parent: "skillOverrides", name: candidate.target };
    case "A2":
      return { kind: "json-entry", parent: "enabledPlugins", name: candidate.target };
    case "A3":
      return { kind: "json-list-add", parent: "deniedMcpServers", entry: { serverName: candidate.target } };
    case "A4":
      return { kind: "toml-table-key", table: candidate.target, key: "enabled" };
  }
}

function nextOf(candidate: Candidate): TuneItem["next"] {
  switch (candidate.unit) {
    case "A1":
      return "off";
    case "A2":
    case "A4":
      return false;
    case "A3":
      return { serverName: candidate.target };
  }
}

function impactOf(candidate: Candidate, context: ItemContext): TuneImpact {
  const { target } = candidate;
  switch (candidate.unit) {
    case "A1": {
      // 설정은 스킬의 폴더 이름과 머리말 이름 어느 쪽으로도 듣는다. 그 이름 꼴을 가진 위치가 있는 묶음의 위치를 모두 센다(후보 조건과 같은 넓이)
      const skills = { user: 0, project: 0, plugin: 0 };
      for (const bundle of context.bundles) if (bundle.positions.some((position) => position.recordNames.includes(target))) for (const position of bundle.positions) skills[position.scope]++;
      return { unit: "A1", skills };
    }
    case "A2":
      return { unit: "A2", skills: context.bundles.filter((bundle) => bundle.positions.some((position) => position.pluginId === target)).length };
    case "A3": {
      const sameName = { local: 0, project: 0, claudeAi: 0 };
      for (const { server } of context.servers) {
        if (server.name !== target || !server.enabled) continue;
        if (server.scope === "local") sameName.local++;
        else if (server.scope === "project") sameName.project++;
        else if (server.scope === "claude-ai") sameName.claudeAi++;
      }
      return { unit: "A3", sameName };
    }
    case "A4":
      return { unit: "A4", projects: context.servers.filter(({ server }) => server.name === target && server.enabled && server.scope === "project").length };
  }
}

/** 후보 하나를 계획 항목 하나로 바꾼다. 고칠 수 없는 까닭은 버전, 파일의 상태, 모양의 차례로 본다 */
export function tuneItem(candidate: Candidate, context: ItemContext, read: TargetRead): TuneItem {
  const key = keyOf(candidate);
  let state: State;
  if (!context.versionOk) state = { present: false, blocked: "unverified-version" };
  else if (read.status === "missing") state = { present: false, blocked: "file-missing" };
  else if (read.status === "unreadable") state = { present: false, blocked: "file-unreadable" };
  else if (!read.regular) state = { present: false, blocked: "not-regular" };
  else state = key.kind === "toml-table-key" ? tomlState(read.bytes, key.table) : jsonState(read.bytes, key);
  return {
    id: candidate.id,
    unit: candidate.unit,
    rule: candidate.rule,
    tool: candidate.tool,
    target: candidate.target,
    file: targetPath(candidate, context.home),
    layer: "user",
    key,
    ...(state.present ? { current: state.value } : {}),
    next: nextOf(candidate),
    impact: impactOf(candidate, context),
    blocked: state.blocked,
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/tune/items.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 18개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/tune/items.test.ts src/scan/settings.ts src/tune/items.ts
git commit -m "feat: 정비 계획 항목과 바꿀 파일 읽기를 더함"
```

---

### Task 4: 계획의 저장과 aq tune plan 명령

**Files:**
- Create: `src/commands/tune-plan.ts`
- Create: `src/tune/plan.ts`
- Modify: `test/commands/checkup-cli.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/state/reports.ts`
- Test: `test/commands/tune-plan.test.ts`
- Test: `test/tune/plan.test.ts`

**Interfaces:**
- Consumes: 과제 3의 항목, 입력 모으기(`gatherCheckupInput`), 평가(`evaluate`), 상태 열기(`openState`), 가장 높은 기록 버전(`highestMainVersion`), 결과 폴더의 JSON 쓰기(`writeJson`, `src/state/reports.ts`), 명령 입구(`checkupArgs`, `src/cli.ts`).
- Produces: `src/tune/plan.ts`의 `TUNE_VERIFIED`, `versionVerified`, `TunePlan`, `TunePlanFile`, `planIdOf`, `PLANS_DIR`, `writePlan`과 `src/commands/tune-plan.ts`의 `TunePlanOptions`, `TunePlanOutcome`, `runTunePlan`, 명령 `aq tune plan [--lang <언어>] [--rescan] [--no-save]`. 2부의 적용이 저장한 계획을 읽는다.

설계 「6단계 1부 계획 전 결정」 5·6·7번이다.

- 점검과 같은 입력으로 평가해 후보를 얻는다. 판정에 쓰는 지난 상태(무작위 값과 관측 기록)는 읽기만 하고 상태와 관측 기록을 고치지 않는다. 캐시는 저장하는 계획에서만 쓴다.
- 바꿀 파일은 파일마다 한 번 읽고, 파일마다의 지문(원본 바이트의 SHA-256)과 그 파일의 항목 ID를 계획에 싣는다.
- 확인한 버전 범위는 Claude Code 2.1.220~2.1.325, Codex 0.166.0이다. 그 도구의 가장 높은 기록 버전이 범위 밖이거나 버전을 모르면 그 도구의 항목은 자동으로 고치지 않는다.
- 계획은 상태 폴더의 `tune/plans/<계획 ID>.json`에 임시 파일에 쓰고 이름을 바꾸는 방식으로 쓴다. 결과 폴더가 쓰는 함수(`writeJson`)를 공개해 같이 쓴다. 계획 ID는 결과 파일과 같은 시각 꼴에 무작위 여섯 글자다.
- 저장하지 않으면(`--no-save`) 계획 ID가 없고 상태 폴더에 아무것도 쓰지 않는다. 상태 폴더에 쓰지 못해도 목록은 내고 그 까닭(`plan_unsaved`)을 알린다.
- 명령은 점검과 같은 옵션 읽기(`checkupArgs`)에 받는 옵션 묶음만 다르게 넘긴다. 결과 화면이 없어 `--no-open`은 받지 않는다. 표준 출력에는 계획과 실행 기록(`{"plan": ..., "run": ...}`)을 낸다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup-cli.test.ts`(찾을 곳 1/2):

```ts
// 명령 입구의 aq checkup을 시험한다. 받는 옵션, 결과 화면을 여는지, 처음 보일 언어의 차례, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 13.2, 20.1)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 1/2):

```ts
// 명령 입구의 aq checkup과 aq tune plan을 시험한다. 받는 옵션, 결과 화면을 여는지, 처음 보일 언어의 차례, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 13.2, 20.1)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

`test/commands/checkup-cli.test.ts`(찾을 곳 2/2):

```ts
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 2/2):

```ts
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("aq tune plan(「6단계 1부 계획 전 결정」 6번)", () => {
  it("계획과 실행 기록을 JSON으로 내고 0을 돌려준다. --no-save면 계획 ID가 없고 상태 폴더를 만들지 않는다. --lang과 --rescan도 받는다", async () => {
    expect(await main(["tune", "plan", "--no-save", "--rescan", "--lang", "ko"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(Object.keys(output).sort()).toEqual(["plan", "run"]);
    expect(output.plan).toMatchObject({ planId: null, items: [] });
    expect(output.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }] });
    await expect(readdir(join(root, "home", ".chunsik-garage"))).rejects.toThrow();
  });

  it("저장하면 상태 폴더의 tune/plans에 그 계획이 생긴다", async () => {
    expect(await main(["tune", "plan"], context)).toBe(0);
    const output = JSON.parse(printed);
    expect(await readdir(join(root, "home", ".chunsik-garage", "tune", "plans"))).toEqual([`${output.plan.planId}.json`]);
  });

  it("모르는 옵션, 값이 없는 --lang, 결과 화면의 옵션(--no-open), 하위 명령이 없는 tune은 64를 돌려주고 아무것도 쓰지 않는다", async () => {
    for (const args of [["tune", "plan", "--all"], ["tune", "plan", "--lang"], ["tune", "plan", "--no-open"], ["tune"]]) expect(await main(args, context)).toBe(64);
    expect(printed).toBe("");
  });
});
```

`test/commands/tune-plan.test.ts`(새 파일):

```ts
// aq tune plan의 실행(입력 모으기, 평가, 계획 항목, 바꿀 파일의 지문, 저장하거나 저장하지 않음, 실행 알림)을 임시 홈 폴더로 시험한다(설계 16.5의 1번, 「6단계 1부 계획 전 결정」 5·6번)
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheckup, type CheckupOptions } from "../../src/commands/checkup.ts";
import { runTunePlan, type TunePlanOptions } from "../../src/commands/tune-plan.ts";
import { resultStamp } from "../../src/state/reports.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
const DAY = 86_400_000;
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");

let root: string;
let home: string;
let stateDir: string;
let tmp: string;
let proj: string;
let settings: string;

const common = () => ({ env: {}, homedir: home, tmpdir: tmp, platform: process.platform, lang: "en" as const, stateDir, rescan: false, entryFile: join(root, "repo", "src", "entry.ts"), managedDir: join(root, "managed") });
const checkup = (nowMs: number): Promise<unknown> => runCheckup({ ...common(), clock: { nowMs, timeZone: "Asia/Seoul" }, save: true } satisfies CheckupOptions);
const options = (overrides: Partial<TunePlanOptions> = {}): TunePlanOptions => {
  let tick = 1000;
  return { ...common(), clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, save: true, now: () => (tick += 250), random: () => "abc123", ...overrides };
};

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  stateDir = join(home, ".chunsik-garage");
  tmp = join(root, "os-tmp");
  proj = join(root, "work", "proj");
  settings = join(home, ".claude", "settings.json");
  await mkdir(tmp, { recursive: true });
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(settings, '{\n  "permissions": {}\n}\n');
  await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "idle-db": { command: "db-server", env: { TOKEN: "secret-value" } } } }));
  for (const [id, at] of [["s1", "2026-11-11T01:00:00Z"], ["s2", "2026-11-10T01:00:00Z"]] as const) {
    const dir = join(home, ".claude", "projects", "p-proj");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${id}.jsonl`);
    await writeFile(path, `${[user({ at, content: "고쳐 줘", origin: "human", extra: { cwd: proj } }), assistant({ id: `${id}-a`, at, cwd: proj, usage: { input: 10, cacheRead: 80, cacheWrite: 10, output: 5 } })].join("\n")}\n`);
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
  }
});
afterEach(async () => removeTemp(root));

describe("저장하는 계획", () => {
  it("지켜본 지 14일이 넘은 안 부른 사용자 서버는 서버 막기 항목이 되고, 계획을 상태 폴더에 저장한다. 바꿀 파일의 지문을 싣고 상태는 고치지 않는다", async () => {
    // 20일 전의 점검이 그 서버의 관측 기록을 남긴다
    await checkup(NOW - 20 * DAY);
    const stateBefore = await readFile(join(stateDir, "state.json"));
    const outcome = await runTunePlan(options());
    expect(outcome.plan.planId).toBe(`${resultStamp(NOW)}-abc123`);
    expect(outcome.plan.items.map((item) => [item.id, item.file, item.blocked])).toEqual([["A3:claude-code:idle-db", settings, null]]);
    const fingerprint = createHash("sha256").update(await readFile(settings)).digest("hex");
    expect(outcome.plan.files).toEqual([{ path: settings, status: "ok", fingerprint, items: ["A3:claude-code:idle-db"] }]);
    expect(JSON.parse(await readFile(join(stateDir, "tune", "plans", `${outcome.plan.planId}.json`), "utf8"))).toEqual(outcome.plan);
    expect(outcome.run).toMatchObject({ saved: true, notices: [] });
    expect(await readFile(join(stateDir, "state.json"))).toEqual(stateBefore);
    // 계획에는 설정 파일의 다른 내용(서버 정의의 환경 변수 값)이 없다
    expect(JSON.stringify(outcome)).not.toContain("secret-value");
  });

  it("첫 점검 전이면 관측 기록이 없어 항목이 없다. 그래도 계획은 저장한다", async () => {
    const outcome = await runTunePlan(options());
    expect(outcome.plan.items).toEqual([]);
    expect(outcome.plan.files).toEqual([]);
    expect(await readdir(join(stateDir, "tune", "plans"))).toEqual([`${outcome.plan.planId}.json`]);
  });
});

describe("저장하지 않는 계획", () => {
  it("저장하지 않으면 계획 ID가 없고 상태 폴더에 아무것도 쓰지 않는다", async () => {
    await checkup(NOW - 20 * DAY);
    const before = (await readdir(stateDir)).sort();
    const outcome = await runTunePlan(options({ save: false }));
    expect(outcome.plan.planId).toBeNull();
    expect(outcome.plan.items.map((item) => item.id)).toEqual(["A3:claude-code:idle-db"]);
    expect(outcome.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }] });
    expect((await readdir(stateDir)).sort()).toEqual(before);
  });

  it("상태 폴더에 쓰지 못하면 계획 ID 없이 목록을 내고 그 까닭을 알린다", async () => {
    await checkup(NOW - 20 * DAY);
    await put(join(stateDir, "tune"), "막음");
    const outcome = await runTunePlan(options());
    expect(outcome.plan.planId).toBeNull();
    expect(outcome.plan.items.map((item) => item.id)).toEqual(["A3:claude-code:idle-db"]);
    expect(outcome.run.saved).toBe(false);
    expect(outcome.run.notices).toEqual([{ kind: "plan_unsaved", code: expect.stringMatching(/^E[A-Z]+$/) }]);
  });
});
```

`test/tune/plan.test.ts`(새 파일):

```ts
// 정비 계획의 확인한 버전 범위, 계획 ID, 저장을 시험한다(설계 16.2 끝, 16.5의 1번, 「6단계 1부 계획 전 결정」 5·7번)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planIdOf, TUNE_VERIFIED, versionVerified, writePlan, type TunePlan } from "../../src/tune/plan.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

describe("확인한 버전 범위", () => {
  it("Claude Code는 2.1.220부터 2.1.325까지, Codex는 0.166.0이다. 그 밖이거나 버전을 모르면 확인한 범위 밖이다", () => {
    expect(TUNE_VERIFIED).toEqual({ "claude-code": { from: "2.1.220", to: "2.1.325" }, codex: { from: "0.166.0", to: "0.166.0" } });
    expect(["2.1.220", "2.1.300", "2.1.325"].map((version) => versionVerified("claude-code", version))).toEqual([true, true, true]);
    expect(["2.1.219", "2.1.326", "2.2.0", "abc", null].map((version) => versionVerified("claude-code", version))).toEqual([false, false, false, false, false]);
    expect(["0.166.0", "0.165.9", "0.166.1", null].map((version) => versionVerified("codex", version))).toEqual([true, false, false, false]);
  });
});

describe("계획 ID", () => {
  it("결과 파일과 같은 시각 꼴에 무작위 여섯 글자를 붙인다", () => {
    expect(planIdOf(Date.parse("2026-11-12T03:00:00.123Z"), "a1b2c3")).toBe("2026-11-12T03-00-00-123Z-a1b2c3");
  });
});

describe("계획의 저장", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTemp();
  });
  afterEach(async () => removeTemp(root));
  const plan = (planId: string): TunePlan & { planId: string } => ({ planId, createdAt: "2026-11-12T03:00:00.000Z", appVersion: "0.1.0", items: [], files: [] });

  it("상태 폴더의 tune/plans/<계획 ID>.json에 쓰고 그 경로를 돌려준다. 임시 파일은 남지 않는다", async () => {
    const path = await writePlan(root, plan("id-1"));
    expect(path).toBe(join(root, "tune", "plans", "id-1.json"));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(plan("id-1"));
    expect(await readdir(join(root, "tune", "plans"))).toEqual(["id-1.json"]);
  });

  it("쓰지 못하면 던진다", async () => {
    await put(join(root, "tune"), "x");
    await expect(writePlan(root, plan("id-2"))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/checkup-cli.test.ts test/commands/tune-plan.test.ts test/tune/plan.test.ts`
Expected: FAIL. 새 시험 파일 둘이 그 모듈(`src/tune/plan.ts`, `src/commands/tune-plan.ts`)이 없어 불러오지 못하고, 바뀐 명령 시험 파일에서 시험 둘이 실패한다(`aq tune plan`을 모르는 명령으로 보고 64를 낸다).

- [ ] **Step 3: 구현한다**

`src/cli.ts`(찾을 곳 1/4):

```ts
import { runCheckup } from "./commands/checkup.ts";
import { openInBrowser } from "./commands/open.ts";
```

`src/cli.ts`(바꾼 뒤 1/4):

```ts
import { runCheckup } from "./commands/checkup.ts";
import { runTunePlan } from "./commands/tune-plan.ts";
import { openInBrowser } from "./commands/open.ts";
```

`src/cli.ts`(찾을 곳 2/4):

```ts
const CHECKUP_FLAGS: ReadonlySet<string> = new Set(["--no-open", "--no-save", "--rescan"]);

/** aq checkup의 옵션을 읽는다. 모르는 옵션이 있거나 --lang 뒤에 값이 없으면(값 자리에 -로 시작하는 것이 와도) null이다. --lang이 여럿이면 마지막 것이다 */
export function checkupArgs(rest: readonly string[]): { flags: Set<string>; lang: string | null } | null {
  const flags = new Set<string>();
```

`src/cli.ts`(바꾼 뒤 2/4):

```ts
const CHECKUP_FLAGS: ReadonlySet<string> = new Set(["--no-open", "--no-save", "--rescan"]);
/** aq tune plan이 받는 옵션. 결과 화면이 없어 --no-open은 받지 않는다(「6단계 1부 계획 전 결정」 6번) */
const TUNE_PLAN_FLAGS: ReadonlySet<string> = new Set(["--no-save", "--rescan"]);

/** aq checkup과 aq tune plan의 옵션을 읽는다. 받는 옵션은 allowed다. 모르는 옵션이 있거나 --lang 뒤에 값이 없으면(값 자리에 -로 시작하는 것이 와도) null이다. --lang이 여럿이면 마지막 것이다 */
export function checkupArgs(rest: readonly string[], allowed: ReadonlySet<string> = CHECKUP_FLAGS): { flags: Set<string>; lang: string | null } | null {
  const flags = new Set<string>();
```

`src/cli.ts`(찾을 곳 3/4):

```ts
      index++;
    } else if (CHECKUP_FLAGS.has(arg)) {
      flags.add(arg);
```

`src/cli.ts`(바꾼 뒤 3/4):

```ts
      index++;
    } else if (allowed.has(arg)) {
      flags.add(arg);
```

`src/cli.ts`(찾을 곳 4/4):

```ts
  }
  const args = command === "checkup" ? checkupArgs(rest) : null;
```

`src/cli.ts`(바꾼 뒤 4/4):

```ts
  }
  if (command === "tune" && rest[0] === "plan") {
    const args = checkupArgs(rest.slice(1), TUNE_PLAN_FLAGS);
    if (args === null) return null;
    // 계획 전체(경로, 열쇠, 전후 값, 영향 범위)를 낸다. 설정 파일의 다른 내용은 계획에 없다(설계 16.5의 2번)
    printJson(
      await runTunePlan({
        env: context.env,
        homedir: context.homedir,
        tmpdir: context.tmpdir ?? tmpdir(),
        platform: context.platform ?? process.platform,
        clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale),
        stateDir: stateDir(context.homedir),
        save: !args.flags.has("--no-save"),
        rescan: args.flags.has("--rescan"),
        entryFile: context.entryFile ?? process.argv[1] ?? "",
        ...(context.managedDir === undefined ? {} : { managedDir: context.managedDir }),
      }),
    );
    return 0;
  }
  const args = command === "checkup" ? checkupArgs(rest) : null;
```

`src/commands/tune-plan.ts`(새 파일):

```ts
// aq tune plan. 점검과 같은 입력으로 평가해 정비 후보를 계획 항목으로 바꾸고, 바꿀 파일의 지문과 함께 계획을 상태 폴더에 저장한다. 설정과 상태는 읽기만 한다(설계 16.5의 1번, 「6단계 1부 계획 전 결정」 5·6번)
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { EvalClock } from "../collect/claude.ts";
import type { Lang } from "../core/copy/lang.ts";
import { evaluate } from "../core/evaluate.ts";
import { highestMainVersion } from "../core/metrics/setup.ts";
import { openState } from "../state/next-state.ts";
import { fingerprintOf, readTarget, targetPath, tuneItem, type TargetRead, type TuneItem } from "../tune/items.ts";
import { planIdOf, versionVerified, writePlan, type TunePlan } from "../tune/plan.ts";
import { PROGRAM_VERSION } from "../version.ts";
import { gatherCheckupInput } from "./checkup-input.ts";
import { selfIdentity } from "./self.ts";

export interface TunePlanOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  clock: EvalClock;
  lang: Lang;
  stateDir: string;
  /** 계획을 상태 폴더에 저장하고 캐시를 쓴다. 거짓이면 목록만 낸다 */
  save: boolean;
  rescan: boolean;
  entryFile: string;
  managedDir?: string;
  /** 걸린 시간을 재는 시계. 시험이 고정한다 */
  now?: () => number;
  /** 계획 ID의 무작위 여섯 글자. 시험이 고정한다 */
  random?: () => string;
}

/** 계획의 실행 알림. 저장하지 않은 계획과 저장하지 못한 계획은 적용할 수 없다 */
export type TuneRunNotice = { kind: "not_saved" } | { kind: "plan_unsaved"; code: string };

export interface TunePlanOutcome {
  plan: TunePlan;
  run: { durationMs: number; saved: boolean; notices: TuneRunNotice[] };
}

const codeOf = (error: unknown): string => (error as NodeJS.ErrnoException | null)?.code ?? "unknown";

export async function runTunePlan(options: TunePlanOptions): Promise<TunePlanOutcome> {
  const now = options.now ?? Date.now;
  const started = now();
  // 판정에 쓰는 지난 상태(무작위 값과 관측 기록)는 읽기만 한다. 계획은 상태와 관측 기록을 고치지 않는다(1부 결정 5번)
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

  // 파일마다 한 번만 읽는다. 같은 파일의 항목은 같은 바이트로 짓는다
  const reads = new Map<string, TargetRead>();
  const items: TuneItem[] = [];
  for (const candidate of evaluation.candidates) {
    const input = gathered.input.tools.find((tool) => tool.tool === candidate.tool)!;
    const judged = evaluation.tools.find((tool) => tool.tool === candidate.tool)!;
    const home = input.setup.home;
    const path = targetPath(candidate, home);
    if (!reads.has(path)) reads.set(path, await readTarget(path));
    const context = { home, bundles: judged.skills, servers: judged.servers, versionOk: versionVerified(candidate.tool, highestMainVersion(input.summaries)) };
    items.push(tuneItem(candidate, context, reads.get(path)!));
  }
  const files = [...reads].map(([path, read]) => ({ path, status: read.status, fingerprint: read.status === "ok" ? fingerprintOf(read.bytes) : null, items: items.filter((item) => item.file === path).map((item) => item.id) }));
  const base = { createdAt: new Date(options.clock.nowMs).toISOString(), appVersion: PROGRAM_VERSION, items, files };

  const notices: TuneRunNotice[] = [];
  let plan: TunePlan = { planId: null, ...base };
  if (options.save) {
    const planId = planIdOf(options.clock.nowMs, options.random?.() ?? randomBytes(3).toString("hex"));
    try {
      await writePlan(options.stateDir, { planId, ...base });
      plan = { planId, ...base };
    } catch (error) {
      notices.push({ kind: "plan_unsaved", code: codeOf(error) });
    }
  } else {
    notices.push({ kind: "not_saved" });
  }
  return { plan, run: { durationMs: now() - started, saved: plan.planId !== null, notices } };
}
```

`src/state/reports.ts`(찾을 곳):

```ts
async function writeJson(path: string, value: unknown): Promise<void> {
```

`src/state/reports.ts`(바꾼 뒤):

```ts
/** JSON 한 벌을 임시 파일에 쓰고 이름을 바꾼다. 정비 계획(6단계)도 쓴다 */
export async function writeJson(path: string, value: unknown): Promise<void> {
```

`src/tune/plan.ts`(새 파일):

```ts
// 정비 계획의 모양, 정비가 바꾸는 열쇠의 뜻을 확인한 버전 범위, 계획 ID, 상태 폴더에 저장하기(설계 16.2 끝, 16.5의 1번, 「6단계 1부 계획 전 결정」 5·7번)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ToolId } from "../adapters/types.ts";
import { compareVersions, parseVersion } from "../adapters/common/version.ts";
import { resultStamp, writeJson } from "../state/reports.ts";
import type { TargetRead, TuneItem } from "./items.ts";

/** 정비가 바꾸는 열쇠의 뜻을 확인한 범위. Claude Code의 2.1.325는 「6단계 계획 전 결정」 2번의 실측, Codex는 5단계에서 읽은 공개 소스다 */
export const TUNE_VERIFIED: Record<ToolId, { from: string; to: string }> = { "claude-code": { from: "2.1.220", to: "2.1.325" }, codex: { from: "0.166.0", to: "0.166.0" } };

/** 그 도구의 버전(가장 높은 기록 버전)이 확인한 범위 안인지. 버전을 모르면 범위 밖이다 */
export function versionVerified(tool: ToolId, version: string | null): boolean {
  const parsed = parseVersion(version);
  if (parsed === null) return false;
  const range = TUNE_VERIFIED[tool];
  return compareVersions(parsed, parseVersion(range.from)!) >= 0 && compareVersions(parsed, parseVersion(range.to)!) <= 0;
}

/** 바꿀 파일 하나. 지문은 계획 때 읽은 원본 바이트의 SHA-256이고, 읽지 못했으면 null이다 */
export interface TunePlanFile {
  path: string;
  status: TargetRead["status"];
  fingerprint: string | null;
  /** 이 파일의 항목 ID */
  items: string[];
}

export interface TunePlan {
  /** 저장하지 않았거나 저장하지 못했으면 null이다(그 계획은 적용할 수 없다) */
  planId: string | null;
  createdAt: string;
  appVersion: string;
  items: TuneItem[];
  files: TunePlanFile[];
}

/** 계획 ID. 결과 파일과 같은 시각 꼴에 무작위 여섯 글자를 붙인다 */
export function planIdOf(nowMs: number, random: string): string {
  return `${resultStamp(nowMs)}-${random}`;
}

export const PLANS_DIR = join("tune", "plans");

/** 상태 폴더의 tune/plans/<계획 ID>.json에 임시 파일에 쓰고 이름을 바꾸는 방식으로 쓰고 경로를 돌려준다. 쓰지 못하면 던진다 */
export async function writePlan(stateDir: string, plan: TunePlan & { planId: string }): Promise<string> {
  const dir = join(stateDir, PLANS_DIR);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${plan.planId}.json`);
  await writeJson(path, plan);
  return path;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/tune/plan.test.ts test/commands/tune-plan.test.ts test/commands/checkup-cli.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 18개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/commands/checkup-cli.test.ts test/commands/tune-plan.test.ts test/tune/plan.test.ts src/cli.ts src/commands/tune-plan.ts src/state/reports.ts src/tune/plan.ts
git commit -m "feat: 정비 계획을 저장하는 aq tune plan을 더함"
```

---

### Task 5: 계획의 문장과 E6의 도구별 처방

**Files:**
- Create: `src/tune/copy.ts`
- Modify: `test/commands/tune-plan.test.ts`
- Modify: `test/core/copy-findings.test.ts`
- Modify: `src/commands/tune-plan.ts`
- Modify: `src/core/copy/findings.ts`
- Modify: `src/core/copy/rules-efficiency.ts`
- Modify: `src/tune/plan.ts`
- Test: `test/tune/copy.test.ts`

**Interfaces:**
- Consumes: 과제 4의 계획과 실행 기록, 문장 채우기(`fill`, `src/core/copy/format.ts`), 도구 이름(`TOOL_NAMES`), 규칙 문구의 도구별 처방(`RuleCopy.prescriptionByTool`)과 처방 잇기(`src/core/copy/findings.ts`).
- Produces: `src/tune/copy.ts`의 `TUNE_COPY`, `TuneItemText`, `tuneItemText`, `tuneNoticeText`, 실행 기록의 문장(`TunePlanOutcome.run.text`), 자리를 옮긴 실행 알림 타입(`TuneRunNotice`, `src/tune/plan.ts`), E6의 도구별 처방. 3부의 스킬 본문이 이 문장을 전한다.

설계 「6단계 1부 계획 전 결정」 8번과 「6단계 1부 계획에서 보완」 1·3번이다.

- 계획 항목마다 두 언어의 제목, 바꾸는 것(파일, 자리, 바꿀 값, 지금 값), 영향 범위, 자동으로 고칠 수 없는 까닭, 되돌리는 법을 짓는다. 고칠 수 없는 항목에는 되돌리는 법이 없다. 지금 값이 예상한 꼴이 아닌 항목(`value-shape`)은 그 값을 적지 않고 "지금은 예상하지 못한 값"이라고만 적는다(계획 리뷰 1차). 실행 알림 둘에도 문장을 짓는다. 문장은 실행 기록에만 싣고 저장한 계획에는 싣지 않는다.
- 한국어 문장은 영어 이름 뒤의 조사를 피해 "이름 "<이름>"의 값을"처럼 조사를 낱말 뒤에 붙인다.
- E6의 처방은 S2처럼 그 규칙이 가리키는 도구(정비 후보가 나온 도구)마다의 문장을 도구의 차례로 잇는다. 가리키는 도구가 없으면 두 도구의 끄는 법을 함께 말하는 문장이다. Claude Code의 서버 막기만 말하던 처방이 Codex의 서버 끄기 후보에도 맞게 하려는 것이다.
- 실행 알림 타입은 문구가 명령 쪽을 거꾸로 부르지 않게 `src/tune/plan.ts`로 옮긴다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/tune-plan.test.ts`(찾을 곳 1/2):

```ts
    expect(outcome.run).toMatchObject({ saved: true, notices: [] });
```

`test/commands/tune-plan.test.ts`(바꾼 뒤 1/2):

```ts
    expect(outcome.run).toMatchObject({ saved: true, notices: [], text: { notices: [] } });
    // 실행 기록에 항목마다 요청한 언어의 문장이 든다. 저장한 계획에는 문장이 없다
    expect(outcome.run.text.items["A3:claude-code:idle-db"]!.title).toBe("Block an unused MCP server: idle-db");
    expect(JSON.stringify(JSON.parse(await readFile(join(stateDir, "tune", "plans", `${outcome.plan.planId}.json`), "utf8")))).not.toContain("Block an unused");
```

`test/commands/tune-plan.test.ts`(찾을 곳 2/2):

```ts
    expect(outcome.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }] });
```

`test/commands/tune-plan.test.ts`(바꾼 뒤 2/2):

```ts
    expect(outcome.run).toMatchObject({ saved: false, notices: [{ kind: "not_saved" }], text: { notices: ["This plan was not saved, so it cannot be applied. To apply it, run aq tune plan again without --no-save."] } });
```

`test/core/copy-findings.test.ts`(찾을 곳):

```ts

  it("도구별 값을 대신 본 것으로 쟀으면 그 도구마다 어떻게 쟀나에 가까운 값이라는 줄을 더한다. 못 잰 도구에는 더하지 않는다(설계 9.7, 「5단계 4부 계획 전 결정」 7번)", () => {
```

`test/core/copy-findings.test.ts`(바꾼 뒤):

```ts

  it("E6의 처방은 정비 후보가 나온 도구마다 그 도구의 끄는 법을 도구의 차례로 잇는다. 후보가 나온 도구가 없으면 두 도구에 맞는 문장이다(「6단계 1부 계획 전 결정」 8번)", () => {
    const e6 = (tools: ResultToolValue[]) => findingText(finding("E6", { value: 0.5, score: 0.5, category: "repair", tools }), NONE, "ko").prescription;
    const byTool = RULE_COPY.E6.ko.prescriptionByTool!;
    expect(e6([toolValue({ candidates: ["A3:claude-code:db"] }), toolValue({ tool: "codex" })])).toBe(byTool["claude-code"]);
    expect(e6([toolValue({}), toolValue({ tool: "codex", candidates: ["A4:codex:db"] })])).toBe(byTool.codex);
    expect(e6([toolValue({ tool: "codex", candidates: ["A4:codex:db"] }), toolValue({ candidates: ["A3:claude-code:db"] })])).toBe(`${byTool["claude-code"]} ${byTool.codex}`);
    expect(e6([toolValue({}), toolValue({ tool: "codex" })])).toBe(RULE_COPY.E6.ko.prescription);
    expect(byTool["claude-code"]).toBe('Claude Code에서는 부르지 않는 서버를 /mcp에서 끄거나, 사용자 설정(~/.claude/settings.json)의 deniedMcpServers 목록에 { "serverName": "<이름>" }을 더해 막으세요.');
    expect(byTool.codex).toBe("Codex에서는 부르지 않는 서버를 사용자 config.toml의 [mcp_servers.<이름>]에 enabled = false를 적어 끄세요. 바꾼 뒤에는 Codex를 다시 시작해야 합니다.");
    expect(RULE_COPY.E6.ko.prescription).toBe("부르지 않는 서버는 끄세요. Claude Code에서는 /mcp나 사용자 설정의 deniedMcpServers 목록으로, Codex에서는 config.toml에 enabled = false를 적어 끕니다.");
    for (const lang of ["en", "ko"] as const) {
      const texts = RULE_COPY.E6[lang].prescriptionByTool!;
      expect(Object.keys(texts).sort()).toEqual(["claude-code", "codex"]);
      for (const text of [...Object.values(texts), RULE_COPY.E6[lang].prescription]) expect(text, `${lang}: ${text}`).toMatch(/[.!?]$/);
    }
  });

  it("도구별 값을 대신 본 것으로 쟀으면 그 도구마다 어떻게 쟀나에 가까운 값이라는 줄을 더한다. 못 잰 도구에는 더하지 않는다(설계 9.7, 「5단계 4부 계획 전 결정」 7번)", () => {
```

`test/tune/copy.test.ts`(새 파일):

```ts
// 정비 계획의 문장(항목마다 제목·바꾸는 것·영향 범위·되돌리는 법·자동으로 고칠 수 없는 까닭, 실행 알림)을 두 언어로 시험한다(「6단계 1부 계획 전 결정」 8번)
import { describe, expect, it } from "vitest";
import { slots } from "../../src/core/copy/format.ts";
import { TUNE_COPY, tuneItemText, tuneNoticeText } from "../../src/tune/copy.ts";
import type { TuneBlock, TuneItem } from "../../src/tune/items.ts";

const FILE = "/home/u/.claude/settings.json";
const item = (input: Partial<TuneItem> = {}): TuneItem => ({
  id: "A1:claude-code:idle",
  unit: "A1",
  rule: "E5",
  tool: "claude-code",
  target: "idle",
  file: FILE,
  layer: "user",
  key: { kind: "json-entry", parent: "skillOverrides", name: "idle" },
  next: "off",
  impact: { unit: "A1", skills: { user: 1, project: 2, plugin: 0 } },
  blocked: null,
  ...input,
});
const BLOCKS: TuneBlock[] = ["unverified-version", "file-missing", "file-unreadable", "not-regular", "byte-order-mark", "not-json-object", "parent-shape", "value-shape", "not-toml", "table-shape"];

describe("항목의 문장", () => {
  it("스킬 끄기는 무엇을, 어디를, 영향 범위, 되돌리는 법을 말한다. 지금 값이 없으면 정하지 않았다고 적는다", () => {
    expect(tuneItemText(item(), "ko")).toEqual({
      title: "안 쓰는 스킬 끄기: idle",
      change: `${FILE}의 skillOverrides에서 이름 "idle"의 값을 "off"로 바꿉니다(지금은 정하지 않음).`,
      impact: "이 이름으로 사용자 폴더의 스킬 1개, 프로젝트의 스킬 2개, 플러그인의 스킬 0개가 함께 꺼집니다. 이 PC의 모든 프로젝트에 듣습니다.",
      blocked: null,
      undo: "적용한 뒤 aq tune undo로 되돌릴 수 있습니다.",
    });
    expect(tuneItemText(item({ current: "on" }), "ko").change).toBe(`${FILE}의 skillOverrides에서 이름 "idle"의 값을 "off"로 바꿉니다(지금은 "on").`);
    expect(tuneItemText(item({ current: "on" }), "en").change).toBe(`In ${FILE}, set "idle" under skillOverrides to "off" (now "on").`);
  });

  it("플러그인 끄기, 서버 막기, 서버 끄기도 그 단위의 자리와 영향 범위를 말한다", () => {
    const a2 = tuneItemText(item({ unit: "A2", target: "p@m", key: { kind: "json-entry", parent: "enabledPlugins", name: "p@m" }, current: true, next: false, impact: { unit: "A2", skills: 3 } }), "ko");
    expect([a2.title, a2.change, a2.impact]).toEqual(["안 쓰는 플러그인 끄기: p@m", `${FILE}의 enabledPlugins에서 설치 ID "p@m"의 값을 false로 바꿉니다(지금은 true).`, "이 플러그인에는 스킬 3개만 들어 있습니다."]);
    const a3 = tuneItemText(item({ unit: "A3", target: "db", key: { kind: "json-list-add", parent: "deniedMcpServers", entry: { serverName: "db" } }, next: { serverName: "db" }, impact: { unit: "A3", sameName: { local: 1, project: 0, claudeAi: 2 } } }), "ko");
    expect([a3.title, a3.change, a3.impact]).toEqual(["안 쓰는 MCP 서버 막기: db", `${FILE}의 deniedMcpServers 목록에 { "serverName": "db" } 항목을 더합니다.`, "같은 이름의 로컬 범위 서버 1개, 프로젝트 범위 서버 0개, claude.ai 연결 2개도 함께 막힙니다. 이 PC에서 이 이름으로 정의된 서버 모두에 듣습니다."]);
    const codexFile = "/home/u/.codex/config.toml";
    const a4 = tuneItemText(item({ unit: "A4", tool: "codex", target: "db", file: codexFile, key: { kind: "toml-table-key", table: "db", key: "enabled" }, next: false, impact: { unit: "A4", projects: 1 } }), "en");
    expect([a4.title, a4.change, a4.impact]).toEqual(["Turn off an unused Codex MCP server: db", `In ${codexFile}, write enabled = false in the [mcp_servers.db] table (now not set).`, "It applies to all of Codex. 1 trusted project that redefines this server is turned off too unless it sets enabled."]);
  });

  it("자동으로 고칠 수 없는 항목은 그 까닭을 말하고 되돌리는 법은 없다", () => {
    const blocked = tuneItemText(item({ blocked: "not-json-object" }), "ko");
    expect([blocked.blocked, blocked.undo]).toEqual(["설정 파일이 표준 JSON이 아니어서(주석이 든 JSON도 그렇습니다) 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.", null]);
    expect(tuneItemText(item({ blocked: "unverified-version" }), "ko").blocked).toBe("Claude Code의 버전이 이 도구가 확인한 범위 밖이라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.");
    expect(tuneItemText(item({ blocked: "parent-shape" }), "en").blocked).toBe("skillOverrides in the settings file is not in the expected shape, so it is not changed automatically. Change it yourself as described above.");
  });

  it("두 언어 모두 단위마다, 까닭마다 문장이 있고 마침표로 끝나며 채우지 않은 자리가 남지 않는다", () => {
    for (const lang of ["en", "ko"] as const) {
      expect(Object.keys(TUNE_COPY[lang].blocked).sort()).toEqual([...BLOCKS].sort());
      for (const block of BLOCKS) {
        const text = tuneItemText(item({ blocked: block }), lang).blocked!;
        expect(text, `${lang} ${block}`).toMatch(/[.!?]$/);
        expect(slots(text)).toEqual([]);
      }
      for (const unit of ["A1", "A2", "A3", "A4"] as const) expect(TUNE_COPY[lang].title[unit]).toMatch(/: \{name\}$/);
    }
  });
});

describe("예상한 꼴이 아닌 지금 값", () => {
  it("지금 값이 예상한 꼴이 아닌 항목은 지금 값을 적지 않고 그 까닭을 말한다(6단계 1부 계획 리뷰 1차)", () => {
    const text = tuneItemText(item({ blocked: "value-shape" }), "ko");
    expect(text.change).toBe(`${FILE}의 skillOverrides에서 이름 "idle"의 값을 "off"로 바꿉니다(지금은 예상하지 못한 값).`);
    expect([text.blocked, text.undo]).toEqual(["지금 값이 예상한 꼴이 아니라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.", null]);
    expect(tuneItemText(item({ blocked: "value-shape" }), "en").change).toBe(`In ${FILE}, set "idle" under skillOverrides to "off" (now an unexpected value).`);
  });
});

describe("실행 알림의 문장", () => {
  it("저장하지 않은 계획과 저장하지 못한 계획은 적용할 수 없다고 알린다", () => {
    expect(tuneNoticeText({ kind: "not_saved" }, "ko")).toBe("저장하지 않은 계획이라 적용할 수 없습니다. 적용하려면 --no-save 없이 다시 계획하세요.");
    expect(tuneNoticeText({ kind: "plan_unsaved", code: "EACCES" }, "ko")).toBe("상태 폴더에 계획을 쓰지 못해(EACCES) 적용할 수 없습니다.");
    expect(tuneNoticeText({ kind: "plan_unsaved", code: "EACCES" }, "en")).toBe("The plan could not be written to the state folder (EACCES), so it cannot be applied.");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/tune-plan.test.ts test/core/copy-findings.test.ts test/tune/copy.test.ts`
Expected: FAIL. 새 시험 파일이 그 모듈(`src/tune/copy.ts`)이 없어 불러오지 못하고, 바뀐 시험 파일 둘에서 시험 셋이 실패한다. E6의 처방에 도구별 문장이 없고, 실행 기록에 문장(`text`)이 없다.

- [ ] **Step 3: 구현한다**

`src/commands/tune-plan.ts`(찾을 곳 1/4):

```ts
import { planIdOf, versionVerified, writePlan, type TunePlan } from "../tune/plan.ts";
```

`src/commands/tune-plan.ts`(바꾼 뒤 1/4):

```ts
import { tuneItemText, tuneNoticeText, type TuneItemText } from "../tune/copy.ts";
import { planIdOf, versionVerified, writePlan, type TunePlan, type TuneRunNotice } from "../tune/plan.ts";
```

`src/commands/tune-plan.ts`(찾을 곳 2/4):

```ts
/** 계획의 실행 알림. 저장하지 않은 계획과 저장하지 못한 계획은 적용할 수 없다 */
export type TuneRunNotice = { kind: "not_saved" } | { kind: "plan_unsaved"; code: string };

```

`src/commands/tune-plan.ts`(바꾼 뒤 2/4): 찾은 줄을 지운다.

`src/commands/tune-plan.ts`(찾을 곳 3/4):

```ts
  run: { durationMs: number; saved: boolean; notices: TuneRunNotice[] };
```

`src/commands/tune-plan.ts`(바꾼 뒤 3/4):

```ts
  /** 실행 기록. 문장(text)은 요청한 언어이고 저장한 계획에는 들지 않는다 */
  run: { durationMs: number; saved: boolean; notices: TuneRunNotice[]; text: { items: Record<string, TuneItemText>; notices: string[] } };
```

`src/commands/tune-plan.ts`(찾을 곳 4/4):

```ts
  return { plan, run: { durationMs: now() - started, saved: plan.planId !== null, notices } };
```

`src/commands/tune-plan.ts`(바꾼 뒤 4/4):

```ts
  const text = { items: Object.fromEntries(items.map((item) => [item.id, tuneItemText(item, options.lang)])), notices: notices.map((notice) => tuneNoticeText(notice, options.lang)) };
  return { plan, run: { durationMs: now() - started, saved: plan.planId !== null, notices, text } };
```

`src/core/copy/findings.ts`(찾을 곳 1/2):

```ts
/** 처방. 도구마다의 처방이 있는 규칙(S2)은 안전장치가 없는 도구(읽지 못해 뺀 도구는 아니다)마다의 문장을 도구의 차례로 잇는다 */
```

`src/core/copy/findings.ts`(바꾼 뒤 1/2):

```ts
/**
 * 처방. 도구마다의 처방이 있는 규칙은 그 규칙이 가리키는 도구마다의 문장을 도구의 차례로 잇는다. S2는 안전장치가 없는 도구(읽지 못해 뺀 도구는 아니다)이고,
 * E6은 정비 후보가 나온 도구다(「6단계 1부 계획 전 결정」 8번). 가리키는 도구가 없으면 두 도구에 맞는 처방이다
 */
```

`src/core/copy/findings.ts`(찾을 곳 2/2):

```ts
  if (finding.ruleId !== "S2" || byTool === undefined) return copy.prescription;
  const lacking = details.safeguards
    .filter((safeguard) => safeguard.guardHook === false && safeguard.permissionChecks === false)
    .map((safeguard) => safeguard.tool)
    .sort();
  const sentences = lacking.map((tool) => byTool[tool]).filter((sentence): sentence is string => sentence !== undefined);
```

`src/core/copy/findings.ts`(바꾼 뒤 2/2):

```ts
  if (byTool === undefined) return copy.prescription;
  const pointed =
    finding.ruleId === "S2"
      ? details.safeguards.filter((safeguard) => safeguard.guardHook === false && safeguard.permissionChecks === false).map((safeguard) => safeguard.tool)
      : finding.ruleId === "E6"
        ? finding.tools.filter((value) => value.candidates.length > 0).map((value) => value.tool)
        : [];
  const sentences = [...new Set(pointed)]
    .sort()
    .map((tool) => byTool[tool])
    .filter((sentence): sentence is string => sentence !== undefined);
```

`src/core/copy/rules-efficiency.ts`(찾을 곳 1/2):

```ts
      prescription: "Turn off a server you do not call in /mcp, or block it by adding { \"serverName\": \"<name>\" } to the deniedMcpServers list in your user settings (~/.claude/settings.json).",
```

`src/core/copy/rules-efficiency.ts`(바꾼 뒤 1/2):

```ts
      prescription: "Turn off servers you do not call. In Claude Code, use /mcp or the deniedMcpServers list in your user settings; in Codex, set enabled = false in config.toml.",
      prescriptionByTool: {
        "claude-code": "In Claude Code, turn off a server you do not call in /mcp, or block it by adding { \"serverName\": \"<name>\" } to the deniedMcpServers list in your user settings (~/.claude/settings.json).",
        codex: "In Codex, turn off a server you do not call by setting enabled = false in its [mcp_servers.<name>] table in your user config.toml. Restart Codex after the change.",
      },
```

`src/core/copy/rules-efficiency.ts`(찾을 곳 2/2):

```ts
      prescription: "부르지 않는 서버는 /mcp에서 끄거나, 사용자 설정(~/.claude/settings.json)의 deniedMcpServers 목록에 { \"serverName\": \"<이름>\" }을 더해 막으세요.",
```

`src/core/copy/rules-efficiency.ts`(바꾼 뒤 2/2):

```ts
      prescription: "부르지 않는 서버는 끄세요. Claude Code에서는 /mcp나 사용자 설정의 deniedMcpServers 목록으로, Codex에서는 config.toml에 enabled = false를 적어 끕니다.",
      prescriptionByTool: {
        "claude-code": "Claude Code에서는 부르지 않는 서버를 /mcp에서 끄거나, 사용자 설정(~/.claude/settings.json)의 deniedMcpServers 목록에 { \"serverName\": \"<이름>\" }을 더해 막으세요.",
        codex: "Codex에서는 부르지 않는 서버를 사용자 config.toml의 [mcp_servers.<이름>]에 enabled = false를 적어 끄세요. 바꾼 뒤에는 Codex를 다시 시작해야 합니다.",
      },
```

`src/tune/copy.ts`(새 파일):

```ts
// 정비 계획의 문장. 항목마다 제목, 바꾸는 것, 영향 범위, 되돌리는 법, 자동으로 고칠 수 없는 까닭과 실행 알림을 두 언어로 짓는다. 춘식이의 말투는 스킬 본문이 붙인다(「6단계 1부 계획 전 결정」 8번)
import { TOOL_NAMES } from "../core/copy/common.ts";
import { fill } from "../core/copy/format.ts";
import type { Lang, Texts } from "../core/copy/lang.ts";
import type { TuneBlock, TuneItem } from "./items.ts";
import type { TuneRunNotice } from "./plan.ts";

type Unit = TuneItem["unit"];

interface TuneCopy {
  title: Record<Unit, string>;
  change: Record<Unit, string>;
  current: { none: string; value: string; unexpected: string };
  impact: Record<Unit, string>;
  undo: string;
  blocked: Record<TuneBlock, string>;
  notices: { not_saved: string; plan_unsaved: string };
}

export const TUNE_COPY: Texts<TuneCopy> = {
  en: {
    title: { A1: "Turn off an unused skill: {name}", A2: "Turn off an unused plugin: {name}", A3: "Block an unused MCP server: {name}", A4: "Turn off an unused Codex MCP server: {name}" },
    change: {
      A1: 'In {file}, set "{name}" under skillOverrides to "off" ({current}).',
      A2: 'In {file}, set "{name}" under enabledPlugins to false ({current}).',
      A3: 'In {file}, add { "serverName": "{name}" } to the deniedMcpServers list.',
      A4: "In {file}, write enabled = false in the [mcp_servers.{name}] table ({current}).",
    },
    current: { none: "now not set", value: "now {value}", unexpected: "now an unexpected value" },
    impact: {
      A1: "This name also turns off {user} {user:skill|skills} in user folders, {project} in projects and {plugin} in plugins. It applies to every project on this PC.",
      A2: "The plugin contains only {skills} {skills:skill|skills}.",
      A3: "Servers with the same name are blocked too: {local} local, {project} project and {claudeAi} claude.ai. It applies to every server with this name on this PC.",
      A4: "It applies to all of Codex. {projects} trusted {projects:project|projects} that {projects:redefines|redefine} this server {projects:is|are} turned off too unless {projects:it sets|they set} enabled.",
    },
    undo: "After applying, you can undo this with aq tune undo.",
    blocked: {
      "unverified-version": "This {tool} version is outside the range this tool has verified, so it is not changed automatically. Change it yourself as described above.",
      "file-missing": "The settings file does not exist, so it is not changed automatically. Change it yourself as described above.",
      "file-unreadable": "The settings file could not be read, so it is not changed automatically. Change it yourself as described above.",
      "not-regular": "The settings file or its folder is a link, so it is not changed automatically. Change it yourself as described above.",
      "byte-order-mark": "The settings file starts with a byte order mark, so it is not changed automatically. Change it yourself as described above.",
      "not-json-object": "The settings file is not standard JSON (JSON with comments is not), so it is not changed automatically. Change it yourself as described above.",
      "parent-shape": "{parent} in the settings file is not in the expected shape, so it is not changed automatically. Change it yourself as described above.",
      "value-shape": "The current value is not in the expected shape, so it is not changed automatically. Change it yourself as described above.",
      "not-toml": "config.toml could not be parsed, so it is not changed automatically. Change it yourself as described above.",
      "table-shape": "The [mcp_servers.{name}] table is not written as one multi-line table (it uses an inline table or dotted keys), so it is not changed automatically. Change it yourself as described above.",
    },
    notices: {
      not_saved: "This plan was not saved, so it cannot be applied. To apply it, run aq tune plan again without --no-save.",
      plan_unsaved: "The plan could not be written to the state folder ({code}), so it cannot be applied.",
    },
  },
  ko: {
    title: { A1: "안 쓰는 스킬 끄기: {name}", A2: "안 쓰는 플러그인 끄기: {name}", A3: "안 쓰는 MCP 서버 막기: {name}", A4: "Codex의 안 쓰는 MCP 서버 끄기: {name}" },
    change: {
      A1: '{file}의 skillOverrides에서 이름 "{name}"의 값을 "off"로 바꿉니다({current}).',
      A2: '{file}의 enabledPlugins에서 설치 ID "{name}"의 값을 false로 바꿉니다({current}).',
      A3: '{file}의 deniedMcpServers 목록에 { "serverName": "{name}" } 항목을 더합니다.',
      A4: "{file}의 [mcp_servers.{name}] 표에 enabled = false를 적습니다({current}).",
    },
    current: { none: "지금은 정하지 않음", value: "지금은 {value}", unexpected: "지금은 예상하지 못한 값" },
    impact: {
      A1: "이 이름으로 사용자 폴더의 스킬 {user}개, 프로젝트의 스킬 {project}개, 플러그인의 스킬 {plugin}개가 함께 꺼집니다. 이 PC의 모든 프로젝트에 듣습니다.",
      A2: "이 플러그인에는 스킬 {skills}개만 들어 있습니다.",
      A3: "같은 이름의 로컬 범위 서버 {local}개, 프로젝트 범위 서버 {project}개, claude.ai 연결 {claudeAi}개도 함께 막힙니다. 이 PC에서 이 이름으로 정의된 서버 모두에 듣습니다.",
      A4: "Codex 전체에 듣습니다. 이 서버를 다시 적은 신뢰한 프로젝트 {projects}곳도 그 프로젝트가 enabled를 적지 않았으면 함께 꺼집니다.",
    },
    undo: "적용한 뒤 aq tune undo로 되돌릴 수 있습니다.",
    blocked: {
      "unverified-version": "{tool}의 버전이 이 도구가 확인한 범위 밖이라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "file-missing": "설정 파일이 없어 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "file-unreadable": "설정 파일을 읽지 못해 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "not-regular": "설정 파일이나 그 폴더가 링크라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "byte-order-mark": "설정 파일이 바이트 순서 표시로 시작해 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "not-json-object": "설정 파일이 표준 JSON이 아니어서(주석이 든 JSON도 그렇습니다) 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "parent-shape": "설정 파일의 {parent}가 예상한 꼴이 아니라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "value-shape": "지금 값이 예상한 꼴이 아니라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "not-toml": "config.toml을 풀지 못해 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "table-shape": "[mcp_servers.{name}] 표가 머리 하나로 여러 줄에 적혀 있지 않아(인라인 표나 점 열쇠로 적은 것) 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
    },
    notices: {
      not_saved: "저장하지 않은 계획이라 적용할 수 없습니다. 적용하려면 --no-save 없이 다시 계획하세요.",
      plan_unsaved: "상태 폴더에 계획을 쓰지 못해({code}) 적용할 수 없습니다.",
    },
  },
};

export interface TuneItemText {
  title: string;
  change: string;
  impact: string;
  /** 자동으로 고칠 수 없는 까닭. 고칠 수 있으면 null이다 */
  blocked: string | null;
  /** 되돌리는 법. 자동으로 고칠 수 없는 항목은 적용하지 않으므로 null이다 */
  undo: string | null;
}

function impactValues(item: TuneItem): Record<string, number> {
  const impact = item.impact;
  switch (impact.unit) {
    case "A1":
      return impact.skills;
    case "A2":
      return { skills: impact.skills };
    case "A3":
      return impact.sameName;
    case "A4":
      return { projects: impact.projects };
  }
}

export function tuneItemText(item: TuneItem, lang: Lang): TuneItemText {
  const copy = TUNE_COPY[lang];
  // 예상한 꼴이 아닌 지금 값은 적지 않는다(계획에도 없다)
  const current = item.blocked === "value-shape" ? copy.current.unexpected : "current" in item ? fill(copy.current.value, { value: JSON.stringify(item.current) }) : copy.current.none;
  const parent = item.key.kind === "toml-table-key" ? "mcp_servers" : item.key.parent;
  return {
    title: fill(copy.title[item.unit], { name: item.target }),
    change: fill(copy.change[item.unit], { file: item.file, name: item.target, current }),
    impact: fill(copy.impact[item.unit], impactValues(item)),
    blocked: item.blocked === null ? null : fill(copy.blocked[item.blocked], { tool: TOOL_NAMES[item.tool][lang], parent, name: item.target }),
    undo: item.blocked === null ? copy.undo : null,
  };
}

export function tuneNoticeText(notice: TuneRunNotice, lang: Lang): string {
  const lines = TUNE_COPY[lang].notices;
  return notice.kind === "not_saved" ? lines.not_saved : fill(lines.plan_unsaved, { code: notice.code });
}
```

`src/tune/plan.ts`(찾을 곳):

```ts

/** 계획 ID. 결과 파일과 같은 시각 꼴에 무작위 여섯 글자를 붙인다 */
```

`src/tune/plan.ts`(바꾼 뒤):

```ts

/** 계획의 실행 알림. 저장하지 않은 계획과 저장하지 못한 계획은 적용할 수 없다 */
export type TuneRunNotice = { kind: "not_saved" } | { kind: "plan_unsaved"; code: string };

/** 계획 ID. 결과 파일과 같은 시각 꼴에 무작위 여섯 글자를 붙인다 */
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/core/copy-findings.test.ts test/tune/copy.test.ts test/commands/tune-plan.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 3개, 시험 30개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/commands/tune-plan.test.ts test/core/copy-findings.test.ts test/tune/copy.test.ts src/commands/tune-plan.ts src/core/copy/findings.ts src/core/copy/rules-efficiency.ts src/tune/copy.ts src/tune/plan.ts
git commit -m "feat: 정비 계획의 문장과 E6 도구별 처방을 더함"
```

---

### Task 6: 묶은 실행 파일

**Files:**
- Modify: `skills/aq/scripts/aq.mjs`

**Interfaces:**
- Consumes: 과제 1~5의 원본.
- Produces: 다시 만든 `skills/aq/scripts/aq.mjs`(`aq tune plan`이 든다).

- 과제 1부터 원본이 바뀌어 묶음 검사가 어긋나 있다. `npm run build`로 다시 만들고 전체 검사를 돌린다.

- [ ] **Step 1: 구현한다**

묶은 실행 파일은 글로 싣지 않는다. 확인 명령의 `npm run build`가 원본에서 다시 만든다.

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

- [ ] **Step 2: 전체 검사가 통과하는지 확인한다**

Run: `npm run build && npm run check`
Expected: `npm run build`가 `묶음 완료`를 내고, `npm run check`가 타입 검사 통과, 시험 파일 109개·시험 1,835개 통과(파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다), `묶음 검사 통과`, `버전 검사 통과`를 낸다.

- [ ] **Step 3: 커밋한다**

```bash
git add skills/aq/scripts/aq.mjs
git commit -m "build: 정비 계획을 넣어 묶음을 다시 만듦"
```

---

### Task 7: Node.js 22, 이 PC로 정비 계획을 읽기만으로 돌려 보기, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~6의 결과물 전부.
- Produces: `develop`에 병합된 6단계 1부. 2부(적용)가 기대는 것은 저장한 계획(`tune/plans/<계획 ID>.json`), 계획 항목의 자리와 고칠 수 없는 까닭의 판정(`tuneItem`, `readTarget`), 확인한 버전 범위다.

- [ ] **Step 1: 묶음을 다시 만들어도 그대로인지 확인한다**

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 2: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS(시험 파일 109개·시험 1,835개. 파일 링크를 만들 수 없는 Windows에서는 하나를 건너뛴다. 받은 22가 22.15.0보다 낮으면 1부의 압축 기록 시험 묶음 둘을 건너뛴 수만큼 적다). 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 3: 이 PC로 정비 계획을 저장하지 않고 돌려 본다**

두 도구의 기록과 셋팅, 상태 폴더는 읽기만 한다. 저장하지 않는 계획이라 아무 데도 쓰지 않는다. 이 PC의 이름, 경로, 값, 개수는 저장소 밖 작업 기록에만 둔다.

Run: `node skills/aq/scripts/aq.mjs tune plan --no-save --lang ko`

| 확인 | Expected |
|---|---|
| 끝까지 도는지 | 0으로 끝나고 표준 오류가 비어 있으며 몇 분 안에 끝난다. 표준 출력은 `plan`과 `run` 두 열쇠의 JSON 하나다 |
| 저장하지 않음 | `plan.planId`가 `null`이고 실행 알림이 `not_saved` 하나이며 그 문장이 `run.text.notices`에 있다 |
| 항목 | 항목마다 자리(`key`), 바꿀 값, 영향 범위, 고칠 수 없는 까닭(`blocked`)이 있고, `run.text.items`에 같은 ID의 문장이 있다. 바꿀 파일은 두 도구의 설정 홈 아래 사용자 설정이다 |
| 값과 글이 나가지 않는지 | 저장소 밖 스크립트로 사용자 `config.toml`의 MCP 서버 환경 변수, 머리말, 토큰, 주소 질의 값이 출력에 없는지 본다 |
| 쓰지 않는지 | 돌리기 앞뒤로 Codex 홈의 `config.toml`, Claude Code의 사용자 설정, 상태 폴더의 수정 시각과 지문이 그대로다 |

작성자 PC에서 계획을 쓰며 돌린 결과는 위와 같았다(이름, 값, 개수는 저장소 밖 작업 기록에 적었다).

- [ ] **Step 4: 원장을 고치고 커밋한다**

원장의 6단계 1부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 7에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 6단계 1부 구현 결과를 적음"
```

- [ ] **Step 5: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage6-1.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~6의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 이 PC로 돌린 계획의 확인 항목과 맞았는지), 「확인하지 못한 것」이다. 확인하지 못한 것에는 설정 파일의 편집과 적용(2부), 확인과 되돌리기(3부), 실측하지 않은 서버 막힘의 경우(관리 정책 파일, claude.ai 연결, 로컬·프로젝트 범위 서버, 여러 층의 허용 목록을 합치는 규칙), macOS와 Linux를 적는다.

```bash
git push -u origin 6단계-1부-정비-계획
gh pr create --base develop --head 6단계-1부-정비-계획 --title "feat: 6단계 1부 정비 계획" --body-file "$TEMP/aq-pr-stage6-1.md"
```

- [ ] **Step 6: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex 하나를 만들어 맡긴다(필수는 제품 결함과 수용 조건 미충족뿐이다). 짝은 새 복제본에서 계획의 코드 블록을 자기 도구로 뽑아 기준에 적용한 결과가 브랜치의 `src`·`test`·`scripts`·`skills`·`package.json`·`package-lock.json`과 같은지, `npm ci` 뒤 `npm run check`와 Node.js 22의 전체 시험, Step 3의 확인 항목을 자기 방법으로 재현하는지, 제품 코드가 설계(「6단계 1부 계획 전 결정」)와 다른 결과를 내거나 예외로 멈추거나 실제 홈에 쓰거나 설정의 값을 계획과 출력에 싣는지를 본다. 결함이라고 적으려면 합성 자료로 실제로 재현한다. 변이로 틀린 구현을 지어 보는 일은 하지 않는다. 필수 지적은 고치고 지적한 짝이 다시 본다. 오래 끌면 주 세션이 제품 결함만 한 번 찾고, 없으면 넘어간다(메모리 `review-until-no-major-issues`). Fable은 쓰지 않는다(사용자 지시 2026-11-16).

- [ ] **Step 7: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 6단계-1부-정비-계획 --merge --subject "feat: 6단계 1부 정비 계획을 개발 브랜치에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 6단계 1부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 2부와 그 뒤에 넘기는 것

6단계 1부가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 부 | 1부가 남긴 재료 |
|---|---|---|
| 설정 파일의 편집(JSON 최소 편집, TOML 줄 단위), 바꾸기 전 검사의 뒤 두 줄(뜻의 차이, 모양의 차이), 잠금, 작업 기록과 그 상태, 끊긴 작업 맞추기, `aq tune apply`, 적용 때 판정을 다시 하는 것 | 2부 | 저장한 계획, 계획 항목의 자리와 지금 값, 고칠 수 없는 까닭의 판정(`tuneItem`), 바꿀 파일 읽기와 지문(`readTarget`, `fingerprintOf`) |
| `aq tune verify`, `aq tune undo`, 다음 점검 때의 확인, 스킬 본문의 정비 흐름과 결과 화면의 [정리하기], 이 PC의 실제 설정에 적용해 보기(사용자 승인 뒤) | 3부 | 계획과 실행 기록의 문장(`tuneItemText`, `tuneNoticeText`) |
| 사용자가 설치로 받는 브랜치와 README의 정비 안내 | 8단계 | 「6단계 계획 전 결정」 10번 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 「6단계 1부 계획 전 결정」 1번 | 한 계획, 과제 나눔 | 이 문서 |
| 2번, 「6단계 계획 전 결정」 2번 | 막는 목록의 등록 이름, 모든 층의 허용 목록, 플러그인 서버의 이름 항목 | 1 |
| 3번, 「6단계 계획 전 결정」 2·3·4번 | 서버 막기의 조건, Codex 서버 끄기, Codex는 서버 끄기만 | 2 |
| 4번, 16.1, 16.3, 「6단계 1부 계획 리뷰 1차에서 보완」과 그 재확인 | 계획 항목의 칸, 지금 값과 그 꼴, 자동으로 고칠 수 없는 까닭(앞 두 줄), TOML 표 머리 세기 | 3, 5 |
| 5번, 「6단계 계획 전 결정」 6번 | 계획의 저장과 계획 ID, 저장하지 않는 계획, 상태와 관측 기록을 고치지 않음 | 4 |
| 6번, 7.4 | `aq tune plan`의 옵션과 출력 | 4 |
| 7번, 16.2 끝 | 확인한 버전 범위 | 3, 4 |
| 8번, 「6단계 1부 계획에서 보완」 1·3번 | 계획의 문장, E6의 도구별 처방 | 5 |
| 9번, 「6단계 계획 전 결정」 8번 | 이 PC로 저장하지 않는 계획을 돌려 봄 | Task 7 Step 3 |
| 10번 | 남는 것 | 「2부와 그 뒤에 넘기는 것」 |

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 커밋·병합 요청·병합 제목을 전역 규칙(타입 12개, 타입을 뺀 설명 50자 이내, 한글 4자 이상, 영문자가 한글보다 많지 않음)으로 기계로 셌다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드가 없다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`d15589e`)에서 과제 1부터 6까지 차례대로 만들었다(Windows 11, Node.js 24.18). 의존성은 복제본에 `npm ci`로 깔았다. 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨다. 과제 1부터 5까지는 시험만 놓고 돌리면 실패하고, 구현을 놓으면 그 과제의 시험과 타입 검사가 통과했다. 과제 6의 `npm run build && npm run check`는 시험 파일 109개·시험 1,835개(Windows에서 파일 링크 시험 하나를 건너뛰어 1,834개 통과)와 묶음 검사, 버전 검사가 통과했다. 묶음을 다시 만들어도 작업 트리가 그대로였고, 만든 복제본의 파일 272개(문서와 원장 빼고)가 연습 작업 폴더와 바이트까지 같았다.

연습 작업 폴더에서 따로 확인한 것은 이렇다. 시험 커밋 다섯을 하나씩 꺼내 그 커밋이 고친 시험 파일만 돌리면 모두 실패했고(과제 1은 세 시험, 과제 2는 일곱 시험, 과제 3은 새 시험 파일을 불러오지 못함, 과제 4는 두 시험과 불러오지 못한 파일 둘, 과제 5는 세 시험과 불러오지 못한 파일 하나), 구현 커밋 여섯을 하나씩 꺼내 타입 검사와 전체 시험을 돌리면 모두 타입 오류 없이 통과했다. 계획을 쓰는 동안 「6단계 1부 계획에서 보완」의 넷을 정했다. 통합 시험이 기대는 경우(20일 전 점검 뒤에 계획하면 지켜본 지 14일이 넘은 사용자 서버가 서버 막기 후보가 된다)는 임시 시험으로 먼저 돌려 확인했다. 계획 리뷰 1차가 찾은 둘(지금 값이 설정의 다른 값을 싣는 것, TOML 문자열 안의 가짜 표 머리)은 과제 3과 5의 그 자리에서 고쳤고, 고치기 전의 코드에 새 시험을 놓으면 넷이 실패하는 것을 봤다. 그 재확인이 찾은 하나(머리 뒤 주석의 대괄호)도 과제 3에서 고쳤고, 바로 앞 버전의 표 머리 세기에 새 반례를 놓으면 실패하는 것을 봤다.

이 PC의 기록과 셋팅(읽기만)으로 Task 7 Step 3을 미리 돌렸다(고친 뒤에 다시 돌려 항목과 까닭이 같았다). 저장하지 않는 계획이 오류 없이 약 1분에 끝났고, 계획 ID가 없고 실행 알림이 저장하지 않음 하나였다. 나온 항목은 모두 자동으로 고칠 수 있는 모양이었고 항목마다 문장이 있었다. 사용자 `config.toml`의 MCP 서버 값은 출력에 없었고, 돌리기 앞뒤로 두 도구의 설정과 상태 폴더의 수정 시각과 지문이 그대로였다. 값과 개수는 저장소 밖 작업 기록에 두었다.

확인하지 못한 것은 이렇다. Node.js 22에서 돌리는 것은 Task 7 Step 2에서 한다. 설정 파일을 실제로 고치는 것은 2부다. 서버 막힘의 실측은 사용자 설정 층에서 플러그인 서버와 사용자 범위 서버만 봤다(관리 정책 파일, claude.ai에 연결한 서버, 로컬·프로젝트 범위 서버, 여러 층의 허용 목록을 합치는 규칙은 보지 않았다). Codex의 서버 끄기와 자동으로 고칠 수 없는 항목은 시험으로만 봤다. macOS와 Linux는 보지 않았다. Windows의 파일 링크 시험은 이 PC에서 건너뛰었다.
