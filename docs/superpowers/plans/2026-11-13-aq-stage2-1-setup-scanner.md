# AQ 점검 2단계 1부 — 셋팅 스캐너(Claude Code)와 상태 폴더 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독·시험 재실행·이 PC 셋팅에 대한 구조 대조로 검증한다.

**Goal:** Claude Code의 지금 셋팅(지침, 설정 층, 스킬, 플러그인, MCP 서버, 권한과 훅의 겉모양)을 읽어 숫자·이름·경로·참거짓·지문만 담은 셋팅 사실로 내고, 상태 폴더에 설치마다의 관측 기록을 둘 자리를 만들고, `aq where`와 `aq clean`으로 상태 폴더를 다룬다.

**Architecture:** 파일을 여는 부분(`src/scan/fs.ts`, `projects.ts`, `instructions.ts`, `settings.ts`, `skills.ts`, `plugins.ts`, `claude-json.ts`, `claude.ts`)과 순수 판정(`json.ts`, `hooks.ts`, `permissions.ts`, `names.ts`, `mcp.ts`, `identity.ts`)을 나눈다(설계 7.2). `scanClaudeSetup`이 맥락(전역과 프로젝트마다)별로 설정 층을 합쳐 켜짐을 계산하고, 설정의 값·지침의 글·훅 명령·권한 규칙의 글·MCP 정의의 값은 메모리에서 쓰고 버린다. 상태 폴더는 `src/state/folder.ts`가 한 곳에 적고, 상태 파일(`state.json`)의 무작위 값과 관측 기록은 `src/state/state.ts`·`observations.ts`가 다룬다.

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 1단계와 같다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계의 7.4(`aq where`, `aq clean`), 10, 11.3에서 스캐너가 낼 사실, 12.1(셋팅 사실과 설치마다의 관측 기록), 18.1(관측 기록의 자리와 고치는 규칙), 19(값을 싣지 않기, 상태 폴더), 20.1(읽기 쪽), 21.1(스캐너 시험)을 구현한다. 로드맵은 `docs/superpowers/plans/2026-11-12-aq-roadmap.md`, 1단계 계획은 `docs/superpowers/plans/2026-11-12-aq-stage1-claude-code-reader.md`다.

## 2단계를 둘로 나눈 까닭

로드맵의 2단계(셋팅 스캐너, 지표, 규칙 22개, 점수, 등급, 평가 결과, 문구, 상태 폴더 다루기)는 1단계보다 크다. 한 계획으로 쓰면 리뷰가 길어지고, 스캐너가 실제 셋팅에서 무엇을 읽게 되는지 모른 채 규칙을 계획하게 된다. 그래서 둘로 나눈다. 로드맵의 원칙("앞 단계에서 배운 것이 다음 계획에 들어가야 한다")을 2단계 안에서도 따르는 것이다.

| 부분 | 내용 | 끝나면 돌려 볼 수 있는 것 |
|---|---|---|
| 1부(이 계획) | 셋팅 스캐너(Claude Code), 상태 파일과 설치마다의 관측 기록, `aq where`·`aq clean` | `aq where`, `aq clean [--all]`, 이 PC의 셋팅을 읽어 종류별 개수를 내는 개발용 스크립트 |
| 2부(1부 뒤에 쓴다) | 지표, 규칙 22개, 점수·등급·분류, 문구, 평가 결과, 정밀 점검 단서, `aq checkup --no-open` | 로드맵 2단계의 "끝나면 돌려 볼 수 있는 것" 전부 |

1부의 셋팅 사실(`ClaudeSetupFacts`)과 1단계의 세션 요약이 2부 규칙의 입력 전부다. 1부는 명령 입구에 `aq where`와 `aq clean`만 더하고, 스캐너는 2부의 `aq checkup`이 부를 때까지 묶음에 들어가지 않는다.

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)을 저장소에 같이 올리고 줄이지 않는다. 묶음에 네트워크를 부르는 곳이 없어야 한다(설계 6.3, 21.1).
- 순수 판정 파일(`src/scan/json.ts`, `hooks.ts`, `permissions.ts`, `names.ts`, `mcp.ts`, `identity.ts`, `src/state/observations.ts`)은 파일을 열지 않고 시계를 읽지 않는다(설계 7.2).
- **스캐너는 읽기만 한다.** 설정 파일, 지침, 스킬, 플러그인 폴더, `.claude.json`에 쓰지 않는다(설계 8). 상태 폴더 밖에 쓰지 않는다.
- **셋팅 사실에는 값과 글을 싣지 않는다.** 설정의 값(토큰, 환경 변수, 머리말, 주소의 질의 문자열), 지침과 스킬의 글, 훅 명령, 권한 규칙의 글, 계정 정보는 메모리에서 쓰고 버린다. MCP 서버 정의는 상태 파일의 무작위 값을 섞은 HMAC으로만 남는다(설계 10, 19.1).
- **링크를 따라가 지우지 않는다.** `aq clean`은 상태 폴더 안에서 이 도구가 두는 것(`STATE_ENTRIES`)만 지우고, 링크는 링크 자체만 지운다(설계 19.2).
- 경로는 `normalizePath`(구분 기호를 `/`로, Windows는 소문자)로 견준다(설계 10).
- 같은 입력이면 같은 셋팅 사실이다. 목록은 정해진 차례로 낸다(설계 11.5, 12.2).
- 시험은 기여자의 PC에서도 돈다. 폴더 링크는 Windows에서 관리자 권한 없이 만들 수 있는 정션으로, 그 밖에서는 심볼릭 링크로 만든다. 시험은 OS의 관리 정책 폴더나 실제 홈 폴더에 쓰지 않는다(설계 21.1).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다. 설정 파일은 뺀다(사용자 전역 지침).
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이다(사용자 전역 지침).
- 깃. `develop`에서 `2단계-1-셋팅스캐너` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증은 병합 앞의 관문이다.
- 이 PC의 셋팅과 기록에서 잰 숫자, 경로, 이름은 저장소와 병합 요청에 넣지 않는다(설계 머리말).

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 커밋 `3963b9b`의 것(SHA256 `B046A295E339A43BE7A9FAD478574D215F402AF30F0B13DC23BDFD8BB0B40156`, 2,781줄)이다. 2단계 계획을 쓰기 전에 설계 세션이 「리뷰 반영 기록」의 「2단계 전 설계 결정(2026-11-13)」을 더했고, 이 계획의 1차 리뷰에서 나온 지적 가운데 설계가 정할 것 열세 가지를 「2단계 1부 계획 리뷰 1차에서 보완(2026-11-13)」으로 더했다. 2차 리뷰에서 나온 것 가운데 공식 문서의 사실과 이미 정한 원칙을 옮기면 되는 것은 주 세션이 「2단계 1부 계획 리뷰 2차에서 보완」으로 더했다. 3차 리뷰에서 나온 것과 주 세션이 공식 문서를 다시 읽다가 찾은 것(훅 파일의 감싸개와 형식)은 「2단계 1부 계획 리뷰 3차에서 보완」으로, 4차 리뷰에서 나온 것(관리 정책 훅의 출처째 버림, 플러그인 뿌리 밖으로 풀리는 경로)은 「2단계 1부 계획 리뷰 4차에서 보완」으로, 5차 리뷰에서 나온 것(선언 경로의 꼴, 기본 훅 파일의 뿌리 안 검사, 관리 정책의 틀린 값과 훅 명령)은 「2단계 1부 계획 리뷰 5차에서 보완」으로, 6차 리뷰에서 나온 것(스킬 값, 일괄 승인의 층 우선순위, 읽지 못한 제한 곁의 허용 보류)은 「2단계 1부 계획 리뷰 6차에서 보완」으로 더했다. 일곱 다 아직 설계 리뷰어의 확인을 받지 않았고, 이 계획의 리뷰에서 함께 확인받는다. 1부가 따르는 것은 아래다.

1. **지침 파일의 범위**(설계 10 「지침 파일의 범위」). 전역 지침은 `<홈>/CLAUDE.md`와 `<홈>/rules/` 아래의 `.md`다. 프로젝트 지침은 프로젝트 뿌리의 `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`와 `.claude/rules/` 아래의 `.md`이고, 앞의 셋이 하나도 없으면 `AGENTS.md`와 `.claude/AGENTS.md`도 든다. `AGENTS.md`를 고르는 설정(`pluginConfigs`의 `instructionFiles`)과 도구의 버전은 보지 않고 기본 동작으로 본다. 조직의 관리 정책 `CLAUDE.md`는 넣지 않는다. 프로젝트 지침은 뿌리에서만 찾는다.
2. **관리 정책은 파일로 둔 것만 읽는다**(설계 10). OS의 자리의 `managed-settings.json`과 `managed-settings.d/`의 숨기지 않은 `.json`을 이름 차례로 합친다(값 하나는 뒤가 이기고, 목록은 합치고 중복을 빼고, 묶음은 열쇠마다). 합치기 전에 파일마다 틀린 값을 도구의 규칙대로 고친다(`null`은 지움, `disableAllHooks`는 버림, 엄한 값이 하나인 열쇠는 그 값, 틀린 `defaultMode`는 `default`, 틀린 허용 목록은 빈 목록, 틀린 항목은 버림, `deny`·`ask`를 읽지 못하면 그 파일의 `allow`는 보류). 훅은 파일마다 본다. 서버가 내려 주는 설정과 MDM은 읽지 않는다. `permissions.disableBypassPermissionsMode`와 `allowManagedPermissionRulesOnly`는 보지 않는다.
3. **`~/.claude.json`**(설계 10). `CLAUDE_CONFIG_DIR`이 있으면 그 폴더 안의 `.claude.json`이다. 맨 위의 `mcpServers`, `skillUsage`, `pluginUsage`, `claudeAiMcpEverConnected`와, `projects[<경로>]`의 `mcpServers`, `disabledMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`만 읽는다. 프로젝트 열쇠는 구분 기호와 (Windows의) 대소문자를 맞춰 견준다. 프로젝트마다의 값은 그 프로젝트에서의 켜짐에만 쓴다. 풀리지 않으면 한 번 다시 읽고, 그래도 읽지 못하면 그 점검의 집계와 거기서 얻는 서버·값은 없는 것이 아니라 모르는 것이다.
4. **플러그인의 구성**(설계 10, 16.2). 구성은 매니페스트, 마켓 항목, 폴더를 합친 것이다. 마켓 항목은 `known_marketplaces.json`의 `installLocation`(폴더면 그 아래 `.claude-plugin/marketplace.json`, 파일이면 그 파일)에서 이름이 같은 항목이다. 이름은 둘이다. 마켓 항목의 이름은 깔고 켜는 열쇠이고, 매니페스트의 `name`(없으면 마켓 항목의 이름)이 구성 요소의 이름이다. 알아보는 구성 요소는 공식 문서의 표이고, 소개 쪽(소개 파일과 소개 열쇠, 뿌리의 `.md` 문서, 보조 폴더 일곱)이 아닌 나머지는 알아보지 못한 것이다. 놓인 곳을 찾지 못했거나 읽지 못했거나, 매니페스트가 풀리지 않거나 `name`이 없거나, 마켓 항목을 읽지 못했거나, 뜨지 않는 조합이면 구성을 모르는 플러그인이고 그 스킬은 설치로 세지 않는다. 도구에 든 플러그인(`@builtin`)은 세지 않는다. 기대는 플러그인은 두 곳의 `dependencies`를 합친 이름이고 마켓과 버전 조건은 보지 않는다. MCP 서버와 훅은 기본 파일을 먼저 읽고 매니페스트의 선언(경로, 인라인, 둘을 섞은 목록)을 차례대로 더하며, 같은 이름의 MCP 서버는 나중 선언이 통째로 대신한다. 주소나 MCP 묶음으로 적은 MCP는 이 스캐너가 내려받거나 풀지 않으므로 정의를 읽지 못한 것으로 둔다. 선언한 파일이 없으면 그 종류를 읽지 못한 것이고 기본 파일이 없는 것은 정상이다. 훅 파일은 맨 위 `hooks` 감싸개 안에 사건 묶음을 두고 인라인은 사건 묶음 그대로이며, 뼈대(사건마다 매처 묶음의 목록, 묶음마다 `hooks` 목록, 그 안이 모두 처리기)가 맞지 않는 파일이나 묶음은 도구가 싣지 않으므로 그 훅을 넣지 않고 읽지 못한 것으로 둔다. 선언한 구성 요소 경로는 `./`로 시작하고 `..` 부분이 없는 꼴만 쓰고(MCP 파일은 도구가 절대 경로와 `..` 부분을 읽지 않는다. 훅과 스킬은 엄한 쪽), 실제 경로가 뿌리 밖이면(링크) 도구가 버리므로 읽지 않는다. 기본 `hooks/hooks.json`도 실제 경로가 뿌리 밖이면 읽지 않는다. 훅과 MCP는 읽지 못한 것, 스킬 경로는 알아보지 못한 것(`skills=..`)이다.
5. **스킬 폴더에 둔 플러그인**(설계 10). 사용자·프로젝트 스킬 폴더 바로 아래의 폴더(링크면 가리키는 곳)에 `.claude-plugin/plugin.json`이 있으면 스킬이 아니라 `<name>@skills-dir` 플러그인이다. 마켓 항목 없이 매니페스트와 폴더로 구성을 알고, 설치 기록이 없어도 켜져 있을 수 있다. 사용자 스킬 폴더의 것은 모든 맥락에서, 프로젝트의 것은 그 프로젝트에서만 켜진다. 뿌리의 `SKILL.md`는 다른 플러그인처럼 알아보지 못한 것이다. 관리 정책 등이 막는 경우는 보지 않는다.
6. **설치로 세는 스킬은 스킬 폴더(`<이름>/SKILL.md`)뿐이다**(설계 10). 명령 파일, 저장소 안쪽 폴더의 `.claude/skills/`, 추가로 연 폴더의 스킬, 계정에서 동기화된 스킬, 관리 정책 폴더의 스킬은 보지 않는다. 플러그인의 `skills` 경로는 스킬 하나를 바로 가리킬 수 있고, 플러그인 뿌리 자신(링크를 풀어 본다)을 가리키면 알아보지 못한 것이다. 한 플러그인 안에서 같은 위치는 한 번만 세고, 같은 원본을 가리키는 다른 이름의 링크는 위치마다 사실을 내며, 실제 경로가 다르면 이름이 같아도 따로 센다. 묶음으로 세는 일은 2부가 한다. 마켓 항목이 `skills`를 적었고 `source`가 마켓의 뿌리이면 기본 `skills/`는 찾지 않는다.
7. **설치와 기록의 이름을 잇는 법**(설계 10의 표). 스캐너는 설치마다 기록에 남을 수 있는 꼴을 만든다. 사용자·프로젝트 스킬은 폴더 이름과 머리말 `name`, 플러그인 스킬은 `<플러그인>:<폴더 이름>`과 `<플러그인>:<name>`(이미 접두가 있으면 다시 붙이지 않는다), MCP 서버는 설정 이름 그대로와 호출 꼴(영문자·숫자·`_`·`-` 밖의 글자를 `_`로 바꾸고 첫 `__` 앞까지), 플러그인 서버는 `plugin:<플러그인>:<서버>`와 `plugin_<플러그인>_<서버>`의 호출 꼴이다. `<플러그인>`은 구성 요소의 이름이고, 마켓 항목의 이름이 다르면 그 이름의 꼴도 넣는다. 플러그인의 집계(`pluginUsage`)도 두 이름으로 찾는다. 기록의 이름과 맞추는 판정(여러 설치와 이어지면 모두의 것)은 2부가 한다.
8. **위치와 설치의 정체**(설계 10, 11.3). 스킬을 찾은 폴더 하나가 위치이고, 스캐너는 위치마다 사실을 낸다. 실제 경로가 같은 위치를 스킬 하나로 묶어 세는 일은 2부가 한다. 스킬의 정체는 (도구, 범위, 프로젝트, 이름, 실제 경로)이고, 두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다.
9. **S3이 세는 범위**(설계 11.3). 사용자가 직접 고치는 셋팅만 센다(사용자·프로젝트·로컬 설정, 목록의 프로젝트의 `.mcp.json`, 사용자·프로젝트 스킬 폴더 바로 아래의 스킬과 링크). 플러그인 안의 것, 관리 정책 파일, `~/.claude.json`, 플러그인과 마켓의 기록 파일은 세지 않고 알린다. 같은 실제 파일은 한 번만 센다. 스캐너는 문제마다 주인과 실제 경로를 붙여 내고, 고르는 일은 2부가 한다.
10. **프로젝트 목록**(설계 10). 수집 구간에 응답이 있는 주 세션의 작업 폴더로 만든다. 세션의 작업 폴더는 기록에 처음 적힌 것 하나다(설계 9.3, 1단계 요약의 `cwd`). 하위 세션과 작업 폴더가 없음인 세션을 빼는 일은 부르는 쪽(2부의 `aq checkup`)이 한다. 지금 PC에 없는 작업 폴더는 그 폴더 자체를 프로젝트로 보고 `exists: false`로 적는다. 워크트리에서 연 세션도 본 저장소의 셋팅만 본다. `~/.claude.json`의 프로젝트 값도 본 저장소 뿌리의 열쇠로만 찾는다.
11. **`aq clean`**(설계 7.4, 19.2). 캐시 폴더 전체와, 결과 폴더에서 가장 최근 점검의 결과 한 쌍을 뺀 나머지를 지운다. `--all`은 상태 폴더 안의 이 도구가 남기는 것 전부를 지운다. 상태 폴더 안의 항목이 링크이면 링크만 지우고, 상태 폴더 자체가 링크이면 지우지 않고 알린다. 지우는 걸음마다 다시 보고 벗어나면 멈추지만, 다시 본 바로 뒤의 바꿔치기는 막지 못한다(한계).
12. **㉠의 처리기**(설계 11.3). 처리기는 `type`이 공식 문서의 다섯 종류(`command`, `http`, `mcp_tool`, `prompt`, `agent`) 가운데 하나이고 그 종류의 필수 값이 빈 글자가 아닌 글자인 것이다. 훅은 출처마다 본다. 관리 정책 파일 하나(드롭인 파일 하나하나), 사용자 설정, 플러그인의 훅 파일이나 인라인 묶음 하나가 출처다. 출처의 훅이 뼈대나 처리기 검사에 맞지 않으면 그 출처의 확인 훅은 하나도 세지 않고 훅을 읽지 못한 출처로 낸다(설정 파일은 `hooks.unreadableSettings`, 플러그인은 `unreadablePlugins`). 도구가 틀린 항목만 버리는지 출처째 버리는지 가릴 수 없기 때문이다. 그 밖의 형식 검사는 하지 않는다(설계 27).

설계 세션이 함께 알린 것 가운데 1부와 관계있는 것은 이렇게 다룬다.

- 결정 3(세션 사이의 빠짐을 차례 없이 보는 풀이)에는 끄자는 쪽으로 틀리는 반례가 하나 있다(MCP 서버를 지웠다가 같은 정의로 다시 등록했는데, 지워져 있던 동안에 시작한 세션이 모두 14일보다 전인 경우). 설계 세션의 추천대로 한계로 두었다(설계 11.3, 21.1, 26, 27). 판정은 2부의 일이다.
- ㉮를 세는 법과 14일의 날짜 경계는 정해졌다(설계 11.3). 판정은 2부의 일이고, 1부의 셋팅 사실은 만든 시각을 밀리초 그대로 낸다.
- 2부 계획 전에 정할 것이 셋 남았다(원장 과제 15). 읽지 못한 곳의 설치를 관측 기록에서 어떻게 다룰지, "30일보다 오래됐다"의 날짜 경계, F3이 도구를 합칠 때 어느 지침을 볼지다. 1부의 셋팅 사실은 어디를 읽지 못했는지(`claudeJson`, 프로젝트의 `mcpJsonStatus`, 플러그인의 `mcpUnreadable`)를 이미 낸다.
- S2의 ㉠ 출처를 넓히지 않는 것과 스킬 폴더 플러그인의 뿌리 스킬을 세지 않는 것은 설계 세션의 추천대로 엄한 쪽으로 두었다. 둘 다 실험 없이는 근거를 얻을 수 없다(설계 27, 다음 버전 후보).

계획을 쓰며 정한 세부(설계가 정하지 않은 것)는 이렇다.

- **켜짐의 맥락.** 전역(사용자 설정)과 목록의 프로젝트마다(사용자 → 프로젝트 → 로컬, 관리 정책이 맨 위) 계산하고, 어느 맥락에서든 켜져 있으면 켜진 것으로 낸다(과제 12의 표). 없어진 폴더와 프로젝트로 보지 않는 폴더는 맥락을 만들지 않는다.
- **켜짐의 층.** 1부의 셋팅 사실은 층을 합친 켜짐과 관리 정책이 정했는지(`managedFixed`)만 낸다. 설계 10의 "스캐너는 층마다의 값과 합친 결과를 같이 낸다" 가운데 층마다의 값은, 끄는 열쇠를 어느 층에 쓸지 정하는 정비(6단계)가 쓸 때 더한다. 2부의 규칙은 합친 값으로 계산한다.
- **실린 목록에 실릴 수 있는가(`listed`).** 머리말의 `disable-model-invocation`이나 모든 맥락의 `skillOverrides`(`off`, `user-invocable-only`)가 막으면 거짓이다. 2부가 "목록에 실리지 않는 설치"를 다룰 때 기록과 함께 쓸 보조 사실이다.
- **훅이 내용을 넣어 주는 스킬**(설계 11.3 E5 ⑤의 "훅 명령이 그 스킬의 경로를 가리킨다"). 훅 명령의 글에 스킬 폴더의 경로, 실제 경로, `/skills/<폴더 이름>` 조각 가운데 하나가 나오면(구분 기호와 대소문자를 맞춘다) 가리키는 것으로 본다. 관리 정책의 훅 명령은 파일마다 모으고, 검사에 걸린 파일의 명령도 넣는다. 조각까지 보는 것은 `~`나 환경 변수로 적은 경로도 잡으려는 것이고, "쓰는지 모름"이 늘어나는 쪽으로 틀린다. 그래서 다른 도구의 스킬 폴더(예. `~/.agents/skills/<이름>/`)를 돌리는 훅도 같은 이름의 Claude Code 스킬을 가리키는 것으로 본다.
- **켜져 있는데 설치 기록이 없는 플러그인.** 어느 맥락에서 `enabledPlugins`가 참인데 설치 기록에도 스킬 폴더에도 없는 것을 따로 낸다(`pluginsWithoutInstall`, `@builtin`은 빼고). 설계 21.1의 반례("켜져 있는 플러그인 하나의 놓인 곳을 찾지 못한다 → 플러그인 끄기 후보가 나오지 않는다")를 2부가 판정할 재료다.
- **설치의 정체 열쇠의 모양.** 스킬은 `["skill", "claude-code", 범위, 프로젝트, 이름, 실제 경로]`, MCP 서버는 `["mcp", "claude-code", 범위, 프로젝트, 플러그인, 이름, 정의의 지문]`의 JSON이다. 상태 파일의 무작위 값은 `state.json`의 `salt`에 둔다.
- **같은 경로의 훅 파일.** 매니페스트가 같은 경로(정규화한 표기)의 훅 파일을 두 번 적으면(기본 파일을 다시 가리킨 경우도) 한 번만 읽고 그 결과를 다시 쓴다. 공식 문서에 없는 경우이고, ㉠과 훅이 가리키는 스킬은 몇 번 읽어도 같으므로 두 번 넣지 않는 쪽을 골랐다. 선언한 파일이 없다는 것은 다시 쓴 결과로도 알린다.
- **프로젝트 MCP 서버의 일괄 승인.** `enableAllProjectMcpServers`는 우선순위가 가장 높은 층(사용자 → 프로젝트 → 로컬 → 관리 정책)이 정한 값을 쓰고, 정하지 않은 층은 덮지 않는다. 신뢰한 폴더의 규칙이다. 스캐너는 신뢰 기록을 읽지 않으므로 목록의 프로젝트(주 세션이 돈 폴더)를 신뢰한 폴더로 본다(설계 27).
- **명령의 오류.** `aq clean`·`aq where`는 한 항목의 오류에 멈추지 않고 그 항목을 알린 뒤 나머지를 한다. 하위 명령이 던지면 이유를 담은 JSON과 종료 코드 1을 낸다(설계 20.1). 1단계의 명령 입구에는 없던 것이다.
- **상한.** 스킬의 내용 지문은 폴더 합이 32MiB를 넘으면 견줄 수 없는 사본으로 두고, 규칙 폴더는 깊이 8까지 본다. JSON 정규화는 깊이 64, 설정 묶음 합치기는 깊이 32까지다. 그보다 깊은 값 하나가 스캐너 전체를 멈추지 않게 하려는 것이다. 정규화하지 못한 MCP 정의는 정의를 읽지 못한 서버(지문 없음, 정체 없음)로 다룬다.
- **머리말의 값.** YAML의 한 줄 값(따옴표, 인용 밖 주석)만 읽는다. 블록 값·흐름 값·닫히지 않은 인용 같은 것은 읽지 못한 값이다. 읽지 못한 `name`은 쓰지 않고 표시하며(기록의 이름 꼴에는 폴더 이름만 든다), 읽지 못한 제어 값은 기본값(모델이 부를 수 있음, 사람이 부를 수 있음)으로 둔다. "목록에 실리지 않음"이나 "사람만 부름"을 잘못 붙이지 않는 쪽이다.
- **프로젝트 파일의 읽기 상태.** 목록의 프로젝트마다 프로젝트 설정·로컬 설정·`.mcp.json`의 상태(`ok`·`missing`·`unparsable`·`unreadable`)를 낸다. 권한 충돌(F6)은 읽은 층만으로 센다. 읽지 못한 것을 없는 것이나 충돌 없음으로 바꾸지 않으려고 상태를 함께 낸다.
- **플러그인 뿌리 항목의 꼴.** 뿌리의 `.md`는 확장자의 대소문자를 가리지 않고 문서로 보되, 뿌리의 `SKILL.md`는 대소문자와 상관없이 알아보지 못한 것으로 둔다. 소개 이름(README 등)이나 `.md`로 끝나는 폴더, 보조 폴더 이름의 파일은 알아보지 못한 것이다. 매니페스트의 빈 `name`도 풀리지 않는 것으로 본다. 모두 엄한 쪽이다.

## 파일 구조

| 파일 | 맡는 일 |
|---|---|
| `src/state/folder.ts` | 상태 폴더의 위치, 그 안에 두는 것의 목록(`STATE_ENTRIES`), 링크를 따라가지 않는 크기 재기와 지우기 |
| `src/commands/where.ts`, `src/commands/clean.ts` | `aq where`, `aq clean [--all]` |
| `src/cli.ts`, `src/commands/doctor.ts` | 명령 입구에 `where`·`clean`을 더한다. 상태 폴더 위치는 `folder.ts`로 옮긴다 |
| `src/state/state.ts` | 상태 파일(`state.json`)의 모양, 무작위 값 만들기, 읽기·쓰기(임시 파일 뒤 이름 바꾸기) |
| `src/state/observations.ts` | 설치의 정체 열쇠, 설치마다의 관측 기록 고치기(순수) |
| `src/scan/fs.ts` | 읽기 도구(JSON·글·폴더 목록, 항목 정보와 링크·만든 시각·실제 경로) |
| `src/scan/projects.ts` | 작업 폴더 → 프로젝트(깃 뿌리, 워크트리, 하위 모듈, 없어진 폴더, 프로젝트로 보지 않는 폴더) |
| `src/scan/instructions.ts` | 지침 파일의 크기·글자 종류별 수·줄 지문, 전역 지침에 프로젝트가 나온 횟수 |
| `src/scan/json.ts` | 열쇠를 세운 JSON 글(같은 내용이면 같은 글), 깊이 묶기(순수) |
| `src/scan/settings.ts` | 설정 층과 관리 정책(파일과 드롭인) 읽기, 쓰는 열쇠만 뽑기 |
| `src/scan/hooks.ts` | 도구 실행 전 확인 훅의 겉모양(매처, if, async), 훅 명령의 글 모으기(순수) |
| `src/scan/permissions.ts` | 전역과 프로젝트의 권한 규칙 충돌 쌍(순수) |
| `src/scan/skills.ts` | 스킬 폴더 훑기(스킬 폴더에 둔 플러그인 가르기, 스킬 하나를 바로 가리키는 경로), 머리말의 한 줄 값, 내용 지문 |
| `src/scan/plugins.ts` | 설치된 플러그인과 스킬 폴더에 둔 플러그인, 마켓 항목과 두 이름, 구성 요소와 알아보지 못한 것, 기대는 플러그인, 훅·MCP 정의(선언을 합치는 차례) |
| `src/scan/claude-json.ts` | `.claude.json`에서 MCP 정의·프로젝트마다의 승인과 끄기·사용 집계·claude.ai 이름 |
| `src/scan/names.ts` | 설치를 기록의 이름과 맞출 꼴(순수) |
| `src/scan/mcp.ts` | MCP 정의의 지문(HMAC), 막음과 `.mcp.json` 승인(순수) |
| `src/scan/types.ts` | 셋팅 사실의 모양 |
| `src/scan/claude.ts` | 스캐너 묶기(맥락별 켜짐, 기록의 이름 꼴과 집계, 훅이 내용을 넣어 주는 스킬, ㉠의 훅, 문제의 주인과 실제 경로, 차례) |
| `src/scan/identity.ts` | 셋팅 사실에서 설치의 정체 열쇠 만들기 |
| `scripts/dev-setup.ts` | 개발용. 이 PC의 셋팅을 읽어 종류별 개수와 걸린 시간만 낸다 |
| `test/helpers/temp-fs.ts` | 시험용 임시 폴더, 폴더 링크, 파일 쓰기 |
| `test/commands/where-clean.test.ts`, `test/commands/clean-failure.test.ts`, `test/state/state.test.ts`, `test/scan/*.test.ts` | 시험(`clean-failure`는 파일 시스템 오류와 바꿔치기를 꾸민다) |

설계 7.1의 `scan/`과 `state/`에 둔다. 설계 7.3의 어댑터 공통 모양(`scanSetup(env, projects)`)은 두 번째 도구가 들어오는 5단계에서 묶고, 1부는 `scanClaudeSetup`으로 낸다.

---

### Task 1: 상태 폴더와 aq where·aq clean

**Files:**
- Create: `src/state/folder.ts`
- Create: `src/commands/where.ts`
- Create: `src/commands/clean.ts`
- Create: `test/helpers/temp-fs.ts`
- Modify: `src/cli.ts`
- Modify: `src/commands/doctor.ts`
- Modify: `test/commands/doctor.test.ts`
- Modify: `skills/aq/scripts/aq.mjs`
- Test: `test/commands/where-clean.test.ts`
- Test: `test/commands/clean-failure.test.ts`

**Interfaces:**
- Consumes: 1단계의 `main(argv, context)`(`src/cli.ts`), `doctor(input)`(`src/commands/doctor.ts`), `normalizePath(path, platform?)`(`src/adapters/claude/locate.ts`).
- Produces: `stateDir(homedir: string): string`, `STATE_ENTRIES: readonly StateEntrySpec[]`, `treeSize(path): Promise<TreeSize>`, `expectedRealDir(dir): Promise<string>`, `removeTree(path, boundary): Promise<TreeSize>`(`src/state/folder.ts`), `where(dir): Promise<WhereReport>`(항목마다 `unreadable`), `clean(dir, level: "clean" | "all"): Promise<CleanReport>`(`removed`, `kept`, `unlinked`, `skipped`, `failed`), 명령 `aq where`, `aq clean [--all]`. `main`은 하위 명령이 던지면 `{ "error": { "code", "message" } }`를 표준 출력에 내고 1을 돌려준다. 시험 도우미 `makeTemp`, `removeTemp`, `linkDir(target, path)`(Windows는 정션), `put(path, content)`(`test/helpers/temp-fs.ts`). `doctor.ts`의 `defaultStateDir`는 `stateDir`로 옮겨 지운다.

설계 7.4와 19.2의 상태 폴더를 다룬다. 로드맵의 약속("상태 폴더에 새 종류의 파일을 두는 단계는 `aq where`와 `aq clean`이 그 파일을 다루게 같은 단계에서 고친다")에 따라 `STATE_ENTRIES` 한 곳에 상태 폴더에 두는 것을 모두 적는다. 2단계 1부에서 실제로 생기는 것은 `cache/`(1단계)와 `state.json`(과제 2)이고, 뒤 단계가 만들 것(`reports/`, `history.jsonl`, `notified/`, `tune/`)도 미리 적어 두어 `aq clean --all`이 빠뜨리지 않게 한다.

- `aq clean`은 캐시 폴더 전체와, 결과 폴더에서 가장 최근 점검의 결과 한 쌍(이름의 끝 확장자를 뗀 것이 가장 큰 보통 파일들. 하나만 있으면 그것만)을 뺀 나머지를 지운다. `--all`은 `STATE_ENTRIES`를 모두 지운다. 이 도구가 두지 않는 이름은 지우지 않는다(설계 7.4, 19.2).
- **링크를 따라가 지우지 않는다(설계 19.2).** 상태 폴더 안의 항목이 링크이면 링크 자체만 지우고 가리키는 곳은 지우지 않는다(`unlinked`에 적는다). 상태 폴더 자체가 링크이면 아무것도 지우지 않고 알린다. `aq clean`에서 결과 폴더 자체가 링크이면 가장 최근 결과를 남기며 지울 수 없으므로 건드리지 않는다(`skipped`). Windows의 폴더 링크(정션)는 `unlink`가 막히면 `rmdir`로 링크만 지운다.
- **지우는 도중의 바꿔치기(설계 19.2).** 상태 폴더 자체가 링크인지는 시작할 때 `realpath(dir)`와 `expectedRealDir(dir)`(위 폴더의 실제 경로에 이름을 붙인 것)를 견줘 안다. `removeTree`는 걸음마다(폴더를 읽기 전과 지우기 전, 파일과 링크를 지우기 전) 실제 경로가 상태 폴더의 실제 경로 안인지 다시 보고, 벗어나면 그 항목을 멈추고 `failed`에 `EOUTSIDE`로 적는다. 다시 본 바로 뒤에 바꿔치는 틈은 Node.js로 막지 못한다(설계 19.2의 한계). 시험은 그 한계를 그대로 드러낸다. 다시 본 바로 뒤에 바꿔치면 바깥의 합성 파일이 지워지는 것을 확인한다(설계 21.1).
- **오류(설계 20.1).** `aq clean`은 한 항목을 지우다 오류가 나면 그 항목과 오류 코드를 `failed`에 적고 다음 항목을 계속 지운다(그 항목의 일부는 지워졌을 수 있다). `aq where`도 한 항목을 세지 못하면 그 항목에 `unreadable`을 적고 나머지를 센다. 그 밖에 하위 명령이 던지면 `main`이 이유를 담은 JSON을 표준 출력에 내고 1을 돌려준다(쓸 수 없는 환경 2, 예상하지 못한 오류 1).
- 시험의 폴더 링크는 Windows에서 관리자 권한 없이 만들 수 있는 정션으로, 그 밖에서는 심볼릭 링크로 만든다. 기여자의 PC에서도 돈다(설계 21.1). 지우지 못하는 파일, 세지 못하는 항목, 지우는 도중의 바꿔치기는 OS마다 만드는 법이 달라(Windows의 Node.js는 읽기 전용 파일도 지운다) `node:fs/promises`의 `unlink`·`lstat`를 꾸며 낸다(`clean-failure.test.ts`).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/helpers/temp-fs.ts`(시험 도우미. 시험보다 먼저 만든다):

```ts
// 시험용 임시 폴더와 파일·폴더 링크를 만든다. Windows에서는 관리자 권한 없이 만들 수 있는 정션을 쓴다
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function makeTemp(prefix = "aq-test-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTemp(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/** 폴더를 가리키는 링크를 만든다(Windows는 정션, 그 밖은 심볼릭 링크). */
export async function linkDir(target: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
}

/** 상위 폴더를 만들며 파일을 쓴다. */
export async function put(path: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
```

`test/commands/where-clean.test.ts`:

```ts
// aq where와 aq clean을 임시 상태 폴더로 시험한다. 링크를 따라가지 않는지, clean이 가장 최근 결과를 남기는지, --all이 이 도구의 것만 지우는지 본다
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli.ts";
import { clean } from "../../src/commands/clean.ts";
import { where } from "../../src/commands/where.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

async function fill(): Promise<void> {
  await put(join(dir, "cache", "claude-code", "a.json"), "12345");
  await put(join(dir, "reports", "20261101-090000.json"), "old");
  await put(join(dir, "reports", "20261101-090000.html"), "old-html");
  await put(join(dir, "reports", "20261113-010203.json"), "newest");
  await put(join(dir, "reports", "20261113-010203.html"), "newest-html");
  await put(join(dir, "history.jsonl"), "{}\n");
  await put(join(dir, "state.json"), "{}");
  await put(join(dir, "notified", "2026-11-13"), "");
  await put(join(dir, "tune", "job-1.json"), "{}");
  await put(join(dir, "someone-else.txt"), "keep me");
}

describe("aq where", () => {
  it("상태 폴더가 없으면 있는 것이 없다고 알린다", async () => {
    const report = await where(dir);
    expect(report.exists).toBe(false);
    expect(report.entries.every((e) => !e.exists && e.files === 0 && e.bytes === 0)).toBe(true);
    expect(report.entries.map((e) => e.name)).toEqual(["cache", "reports", "history.jsonl", "state.json", "notified", "tune"]);
    expect(report.noSaveResultsInOsTemp).toBe(true);
  });

  it("둔 것마다 파일 수와 바이트를 세고, 이 도구의 것이 아닌 이름을 따로 보인다", async () => {
    await fill();
    const report = await where(dir);
    const cache = report.entries.find((e) => e.name === "cache")!;
    expect(cache).toMatchObject({ exists: true, link: false, files: 1, bytes: 5, removedBy: "clean" });
    expect(report.entries.find((e) => e.name === "reports")).toMatchObject({ files: 4, bytes: 3 + 8 + 6 + 11 });
    expect(report.entries.find((e) => e.name === "state.json")).toMatchObject({ kind: "file", files: 1, bytes: 2, removedBy: "all" });
    expect(report.others).toEqual(["someone-else.txt"]);
    expect(report.files).toBe(1 + 4 + 1 + 1 + 1 + 1);
  });

  it("링크는 따라가지 않는다", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "big.bin"), "x".repeat(1000));
    await linkDir(outside, join(dir, "cache"));
    const report = await where(dir);
    expect(report.entries.find((e) => e.name === "cache")).toMatchObject({ exists: true, link: true, files: 0, bytes: 0 });
  });
});

describe("aq clean", () => {
  it("clean은 캐시를 지우고 결과 폴더에서 가장 최근 점검의 결과만 남긴다. 이력과 상태는 남긴다", async () => {
    await fill();
    const report = await clean(dir, "clean");
    expect(await exists(join(dir, "cache"))).toBe(false);
    expect((await readdir(join(dir, "reports"))).sort()).toEqual(["20261113-010203.html", "20261113-010203.json"]);
    expect(await exists(join(dir, "state.json"))).toBe(true);
    expect(await exists(join(dir, "history.jsonl"))).toBe(true);
    expect(await exists(join(dir, "tune", "job-1.json"))).toBe(true);
    expect(report.removed).toEqual([
      { name: "cache", files: 1, bytes: 5 },
      { name: "reports", files: 2, bytes: 3 + 8 },
    ]);
    expect(report.kept.find((k) => k.name === "reports")).toEqual({ name: "reports", files: 2, bytes: 6 + 11 });
  });

  it("--all은 이 도구가 두는 것을 모두 지우고 다른 이름은 남긴다", async () => {
    await fill();
    const report = await clean(dir, "all");
    expect((await readdir(dir)).sort()).toEqual(["someone-else.txt"]);
    expect(report.removed.map((r) => r.name)).toEqual(["cache", "reports", "history.jsonl", "state.json", "notified", "tune"]);
  });

  it("폴더 안의 링크는 링크만 지우고 대상은 남긴다", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "precious.txt"), "do not delete");
    await put(join(dir, "cache", "real.json"), "1");
    await linkDir(outside, join(dir, "cache", "linked"));
    await clean(dir, "clean");
    expect(await exists(join(dir, "cache"))).toBe(false);
    expect(await exists(join(outside, "precious.txt"))).toBe(true);
  });

  it("이 도구가 두는 것 자체가 링크면 링크만 지우고 가리키는 곳은 남긴다", async () => {
    const outside = join(root, "outside-tune");
    await put(join(outside, "job.json"), "{}");
    await put(join(dir, "state.json"), "{}");
    await linkDir(outside, join(dir, "tune"));
    const report = await clean(dir, "all");
    expect(report.unlinked).toEqual(["tune"]);
    expect(await exists(join(outside, "job.json"))).toBe(true);
    expect(await exists(join(dir, "tune"))).toBe(false);
  });

  it("clean에서 결과 폴더가 링크면 가장 최근 결과를 남길 수 없으므로 건드리지 않는다", async () => {
    const outside = join(root, "outside-reports");
    await put(join(outside, "20261101-090000.json"), "old");
    await linkDir(outside, join(dir, "reports"));
    const report = await clean(dir, "clean");
    expect(report.skipped).toEqual(["reports"]);
    expect(await exists(join(outside, "20261101-090000.json"))).toBe(true);
  });

  it("결과 폴더 안에 바깥 폴더를 가리키는 링크가 있을 때 --all은 링크만 지운다", async () => {
    const outside = join(root, "outside-shared");
    await put(join(outside, "keep.txt"), "keep");
    await put(join(dir, "reports", "20261113-010203.json"), "x");
    await linkDir(outside, join(dir, "reports", "shared"));
    await clean(dir, "all");
    expect(await exists(join(dir, "reports"))).toBe(false);
    expect(await exists(join(outside, "keep.txt"))).toBe(true);
  });

  it("상태 폴더 자체가 링크면 아무것도 지우지 않는다", async () => {
    const outside = join(root, "elsewhere");
    await put(join(outside, "cache", "a.json"), "1");
    await linkDir(outside, dir);
    const report = await clean(dir, "all");
    expect(report.link).toBe(true);
    expect(report.removed).toEqual([]);
    expect(await exists(join(outside, "cache", "a.json"))).toBe(true);
  });

  it("상태 폴더가 없으면 지운 것이 없다", async () => {
    expect(await clean(dir, "all")).toEqual({ dir, level: "all", link: false, removed: [], kept: [], unlinked: [], skipped: [], failed: [] });
  });
});

describe("명령 입구", () => {
  it("aq where와 aq clean --all은 JSON을 내고 0을 돌려준다. 모르는 선택지는 64다", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const errors = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await put(join(dir, "cache", "a.json"), "1");
      expect(await main(["where"], { env: {}, homedir: root })).toBe(0);
      expect(JSON.parse(String(write.mock.calls[0]![0])).dir).toBe(dir);
      expect(await main(["clean", "--bogus"], { env: {}, homedir: root })).toBe(64);
      expect(await exists(join(dir, "cache", "a.json"))).toBe(true);
      expect(await main(["clean", "--all"], { env: {}, homedir: root })).toBe(0);
      expect(await exists(join(dir, "cache"))).toBe(false);
    } finally {
      write.mockRestore();
      errors.mockRestore();
    }
  });
});
```

`test/commands/clean-failure.test.ts`:

```ts
// aq clean이 지우지 못하는 항목을 만나도 다른 항목은 계속 지우고 알리는지, aq where가 세지 못한 항목을 표시하고 나머지를 세는지, 명령이 던지면 이유를 담은 JSON과 종료 코드 1을 내는지, 지우는 도중의 바꿔치기에 멈추는지 시험한다(설계 19.2, 20.1). 파일 시스템 오류는 꾸며서 낸다
import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli.ts";
import { clean } from "../../src/commands/clean.ts";
import { where } from "../../src/commands/where.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, unlink: vi.fn(real.unlink), lstat: vi.fn(real.lstat) };
});
const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const busy = (message: string): NodeJS.ErrnoException => Object.assign(new Error(message), { code: "EBUSY" });

let root: string;
let dir: string;
beforeEach(async () => {
  root = await makeTemp();
  dir = join(root, ".chunsik-garage");
});
afterEach(async () => {
  vi.mocked(fsp.unlink).mockImplementation(actual.unlink);
  vi.mocked(fsp.lstat).mockImplementation(actual.lstat);
  vi.restoreAllMocks();
  await removeTemp(root);
});

describe("지우다가 오류가 날 때", () => {
  it("한 항목에서 지우지 못해도 다른 항목은 지우고, 오류 난 항목과 코드를 알린다", async () => {
    await put(join(dir, "cache", "locked.json"), "1");
    await put(join(dir, "tune", "job.json"), "{}");
    vi.mocked(fsp.unlink).mockImplementation(async (path) => {
      if (String(path).endsWith("locked.json")) throw busy("EBUSY: resource busy or locked");
      return actual.unlink(path);
    });
    const report = await clean(dir, "all");
    expect(report.failed).toEqual([{ name: "cache", code: "EBUSY" }]);
    expect(report.removed.map((r) => r.name)).toEqual(["tune"]);
    await expect(actual.access(join(dir, "tune"))).rejects.toThrow();
  });

  it("명령이 던지면 표준 출력에 이유를 담은 JSON을 내고 1을 돌려준다", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.mocked(fsp.lstat).mockImplementationOnce(async () => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    });
    expect(await main(["where"], { env: {}, homedir: root })).toBe(1);
    expect(JSON.parse(String(write.mock.calls[0]![0]))).toEqual({ error: { code: "EACCES", message: "EACCES: permission denied" } });
  });
});

describe("세다가 오류가 날 때", () => {
  it("aq where는 한 항목을 세지 못해도 그 항목에 표시하고 나머지를 센다", async () => {
    await put(join(dir, "cache", "a.json"), "12");
    await put(join(dir, "state.json"), "{}");
    vi.mocked(fsp.lstat).mockImplementation(async (path) => {
      if (String(path) === join(dir, "cache")) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return actual.lstat(path);
    });
    const report = await where(dir);
    expect(report.entries.find((e) => e.name === "cache")).toMatchObject({ unreadable: true, files: 0, bytes: 0 });
    expect(report.entries.find((e) => e.name === "state.json")).toMatchObject({ exists: true, unreadable: false, files: 1, bytes: 2 });
  });
});

describe("지우는 도중의 바꿔치기", () => {
  const linkType = process.platform === "win32" ? "junction" : "dir";
  const exists = (path: string): Promise<boolean> => actual.access(path).then(() => true, () => false);

  it("검사한 바로 뒤에 상태 폴더가 바깥을 가리키는 링크로 바뀌면 아무것도 지우지 않는다", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "cache", "protected.txt"), "keep");
    await put(join(dir, "cache", "a.json"), "1");
    vi.mocked(fsp.lstat).mockImplementationOnce(async (path) => {
      const stats = await actual.lstat(path);
      await actual.rename(dir, `${dir}.moved`);
      await actual.symlink(outside, dir, linkType);
      return stats;
    });
    const report = await clean(dir, "all");
    expect(report.link).toBe(true);
    expect(await exists(join(outside, "cache", "protected.txt"))).toBe(true);
  });

  it("한 항목을 지우기 직전에 바뀌면 그 항목을 EOUTSIDE로 멈추고 바깥 파일을 지우지 않는다", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "cache", "protected.txt"), "keep");
    await put(join(dir, "cache", "a.json"), "1");
    vi.mocked(fsp.lstat).mockImplementation(async (path) => {
      if (String(path) === join(dir, "cache") && !(await exists(`${dir}.moved`))) {
        const stats = await actual.lstat(path);
        await actual.rename(dir, `${dir}.moved`);
        await actual.symlink(outside, dir, linkType);
        return stats;
      }
      return actual.lstat(path);
    });
    const report = await clean(dir, "all");
    expect(report.failed).toContainEqual({ name: "cache", code: "EOUTSIDE" });
    expect(await exists(join(outside, "cache", "protected.txt"))).toBe(true);
  });

  it("다시 본 바로 뒤, 지우기 전에 바꿔치면 이 도구는 알지 못하고 바깥 파일이 지워진다(설계 19.2의 한계를 드러내는 시험)", async () => {
    const outside = join(root, "outside");
    await put(join(outside, "cache", "victim.txt"), "x");
    await put(join(dir, "cache", "victim.txt"), "1");
    let swapped = false;
    vi.mocked(fsp.unlink).mockImplementation(async (path) => {
      if (!swapped && String(path).endsWith("victim.txt")) {
        swapped = true;
        await actual.rename(dir, `${dir}.moved`);
        await actual.symlink(outside, dir, linkType);
      }
      return actual.unlink(path);
    });
    await clean(dir, "all");
    expect(swapped).toBe(true);
    expect(await exists(join(outside, "cache", "victim.txt"))).toBe(false);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/where-clean.test.ts test/commands/clean-failure.test.ts`
Expected: FAIL. `../../src/commands/clean.ts`를 찾지 못한다(파일이 아직 없다).

- [ ] **Step 3: 구현한다**

`src/cli.ts`는 아래 내용으로 바꾼다. `src/commands/doctor.ts`에서는 `defaultStateDir`를 지우고(`stateDir`로 옮겼다), doctor 시험은 `stateDir`를 가져다 쓴다.

`src/state/folder.ts`:

```ts
// 상태 폴더(~/.chunsik-garage)의 위치와 그 안에 두는 것, 크기 재기와 지우기. 링크(심볼릭 링크·정션)는 따라가지 않는다(설계 7.4, 19.2)
import { lstat, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";

export const STATE_DIR_NAME = ".chunsik-garage";

export function stateDir(homedir: string): string {
  return join(homedir, STATE_DIR_NAME);
}

export type CleanLevel = "clean" | "all";

export interface StateEntrySpec {
  name: string;
  kind: "dir" | "file";
  /** 이 수준의 지우기부터 지운다. reports는 clean에서 가장 최근 점검의 결과만 남긴다 */
  removedBy: CleanLevel;
}

/** 상태 폴더에 두는 것(설계 19.2). 차례는 aq where가 보이는 차례다. 새 종류를 두는 단계는 여기에 더한다(로드맵). */
export const STATE_ENTRIES: readonly StateEntrySpec[] = [
  { name: "cache", kind: "dir", removedBy: "clean" },
  { name: "reports", kind: "dir", removedBy: "clean" },
  { name: "history.jsonl", kind: "file", removedBy: "all" },
  { name: "state.json", kind: "file", removedBy: "all" },
  { name: "notified", kind: "dir", removedBy: "all" },
  { name: "tune", kind: "dir", removedBy: "all" },
];

export interface TreeSize {
  files: number;
  bytes: number;
  /** 따라가지 않은 링크의 수 */
  links: number;
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

/** 경로 아래의 파일 수와 바이트를 센다. 링크는 따라가지 않고 수만 센다. 없으면 0이다. */
export async function treeSize(path: string): Promise<TreeSize> {
  const total: TreeSize = { files: 0, bytes: 0, links: 0 };
  const walk = async (current: string): Promise<void> => {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      total.links++;
      return;
    }
    if (info.isDirectory()) {
      for (const name of (await readdir(current)).sort()) await walk(join(current, name));
      return;
    }
    total.files++;
    total.bytes += info.size;
  };
  await walk(path);
  return total;
}

/** 링크 자체를 지운다. 대상은 건드리지 않는다. Windows의 폴더 링크(정션)는 unlink가 막히면 rmdir로 지운다. */
async function removeLink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EISDIR") {
      await rmdir(path);
      return;
    }
    throw error;
  }
}

/**
 * 상태 폴더가 있어야 할 실제 경로(정규화). 위 폴더의 실제 경로에 폴더 이름을 붙인 것이다.
 * 상태 폴더 자체가 링크로 바뀌면 그 폴더의 실제 경로가 이것과 달라지므로 알아볼 수 있다.
 */
export async function expectedRealDir(dir: string): Promise<string> {
  return normalizePath(join(await realpath(dirname(dir)), basename(dir)));
}

const outside = (path: string): NodeJS.ErrnoException => Object.assign(new Error(`outside of the state folder: ${path}`), { code: "EOUTSIDE" });

/** 경로의 실제 경로가 boundary 안인지 본다. allowEqual이면 boundary 자체도 된다. 벗어나면 EOUTSIDE로 던진다. */
async function assertInside(path: string, boundary: string, allowEqual: boolean): Promise<void> {
  const real = normalizePath(await realpath(path));
  if (real === boundary ? allowEqual : real.startsWith(`${boundary}/`)) return;
  throw outside(path);
}

/**
 * 경로를 지운다. 폴더 안의 링크는 링크 자체만 지우고 따라가지 않는다. 지운 파일 수와 바이트를 돌려준다.
 * 걸음마다(폴더를 읽기 전과 지우기 전, 파일과 링크를 지우기 전) 실제 경로가 boundary(상태 폴더의 실제 경로) 안인지 다시 본다.
 * 다른 프로그램이 지우는 도중에 폴더를 바깥을 가리키는 링크로 바꿔치면 그 걸음에서 EOUTSIDE로 멈춘다.
 * 다시 본 바로 뒤에 바꿔치는 틈은 막지 못한다(Node.js는 폴더 핸들을 기준으로 지우는 수단을 주지 않는다).
 */
export async function removeTree(path: string, boundary: string): Promise<TreeSize> {
  const removed: TreeSize = { files: 0, bytes: 0, links: 0 };
  const walk = async (current: string): Promise<void> => {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      await assertInside(dirname(current), boundary, true);
      await removeLink(current);
      removed.links++;
      return;
    }
    if (info.isDirectory()) {
      await assertInside(current, boundary, false);
      for (const name of await readdir(current)) await walk(join(current, name));
      await assertInside(current, boundary, false);
      await rmdir(current);
      return;
    }
    await assertInside(dirname(current), boundary, true);
    await unlink(current);
    removed.files++;
    removed.bytes += info.size;
  };
  await walk(path);
  return removed;
}
```

`src/commands/where.ts`:

```ts
// aq where. 상태 폴더의 위치와, 그 안에 둔 것마다 있는지·파일 수·바이트를 알린다. 링크는 따라가지 않는다(설계 7.4, 19.2)
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { STATE_ENTRIES, treeSize, type CleanLevel } from "../state/folder.ts";

export interface WhereEntry {
  name: string;
  kind: "dir" | "file";
  exists: boolean;
  /** 링크이면 참이다. 링크의 대상은 세지 않는다 */
  link: boolean;
  files: number;
  bytes: number;
  removedBy: CleanLevel;
  /** 세다가 오류가 나서 수가 모자랄 수 있다 */
  unreadable: boolean;
}

export interface WhereReport {
  dir: string;
  exists: boolean;
  /** 상태 폴더 자체가 링크이면 참이다. 그때는 안을 세지 않는다 */
  link: boolean;
  entries: WhereEntry[];
  files: number;
  bytes: number;
  /** 이 도구가 두는 것이 아닌 이름(이름 차례). aq clean은 이것을 지우지 않는다 */
  others: string[];
  /** 저장하지 않고 돌린 실행의 결과 파일은 OS 임시 폴더에 있고 이 도구가 위치를 기억하지 않는다(설계 19.2) */
  noSaveResultsInOsTemp: true;
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

export async function where(dir: string): Promise<WhereReport> {
  const report: WhereReport = { dir, exists: false, link: false, entries: [], files: 0, bytes: 0, others: [], noSaveResultsInOsTemp: true };
  let dirInfo;
  try {
    dirInfo = await lstat(dir);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  report.exists = dirInfo !== undefined;
  report.link = dirInfo?.isSymbolicLink() ?? false;
  const inside = report.exists && !report.link;
  for (const spec of STATE_ENTRIES) {
    const entry: WhereEntry = { name: spec.name, kind: spec.kind, exists: false, link: false, files: 0, bytes: 0, removedBy: spec.removedBy, unreadable: false };
    if (inside) {
      try {
        const info = await lstat(join(dir, spec.name));
        entry.exists = true;
        entry.link = info.isSymbolicLink();
        if (!entry.link) {
          const size = await treeSize(join(dir, spec.name));
          entry.files = size.files;
          entry.bytes = size.bytes;
        }
      } catch (error) {
        // 하나를 세지 못해도 나머지는 센다(설계 20.1)
        if (!isMissing(error)) entry.unreadable = true;
      }
    }
    report.files += entry.files;
    report.bytes += entry.bytes;
    report.entries.push(entry);
  }
  if (inside) {
    const known = new Set(STATE_ENTRIES.map((spec) => spec.name));
    report.others = (await readdir(dir)).filter((name) => !known.has(name)).sort();
  }
  return report;
}
```

`src/commands/clean.ts`:

```ts
// aq clean [--all]. 캐시와 오래된 결과를 지우고, --all이면 이력·상태·알림 표식·정비 작업 기록까지 지운다. 상태 폴더 밖과 링크의 대상은 건드리지 않는다(설계 7.4, 19.2)
import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { expectedRealDir, removeTree, STATE_ENTRIES, treeSize, type CleanLevel, type StateEntrySpec } from "../state/folder.ts";

export interface CleanItem {
  name: string;
  files: number;
  bytes: number;
}

export interface CleanReport {
  dir: string;
  level: CleanLevel;
  /** 상태 폴더 자체가 링크이거나 실제 경로가 있어야 할 곳과 다르면 참이고 아무것도 지우지 않는다 */
  link: boolean;
  removed: CleanItem[];
  /** 지우지 않고 남긴 것. clean에서는 가장 최근 점검의 결과가 남는다 */
  kept: CleanItem[];
  /** 링크라서 링크 자체만 지운 것. 링크가 가리키는 곳은 그대로다 */
  unlinked: string[];
  /** 링크라서 건드리지 않은 것. clean에서 결과 폴더가 링크면 가장 최근 결과를 남기며 지울 수 없어 그대로 둔다 */
  skipped: string[];
  /** 지우다가 오류가 난 항목과 오류 코드. 그 항목의 일부는 지워졌을 수 있다. 다른 항목은 계속 지운다(설계 20.1). EOUTSIDE는 지우는 도중에 상태 폴더 밖을 가리키게 된 것이다 */
  failed: { name: string; code: string }[];
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

async function lstatOrNull(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** 결과 폴더에서 이름의 끝 확장자를 뗀 것이 가장 큰(가장 최근 시각) 보통 파일들만 남기고 나머지를 지운다. */
async function cleanReports(path: string, boundary: string): Promise<{ removed: CleanItem; kept: CleanItem }> {
  const names = (await readdir(path)).sort();
  const base = (name: string): string => name.replace(/\.[^.]*$/, "");
  let latest: string | null = null;
  for (const name of names) {
    const info = await lstat(join(path, name));
    if (info.isFile() && (latest === null || base(name) > latest)) latest = base(name);
  }
  const removed: CleanItem = { name: "reports", files: 0, bytes: 0 };
  const kept: CleanItem = { name: "reports", files: 0, bytes: 0 };
  for (const name of names) {
    const full = join(path, name);
    const info = await lstat(full);
    if (info.isFile() && base(name) === latest) {
      kept.files++;
      kept.bytes += info.size;
      continue;
    }
    const size = await removeTree(full, boundary);
    removed.files += size.files;
    removed.bytes += size.bytes;
  }
  return { removed, kept };
}

/** 상태 폴더에 두는 것 하나를 수준에 따라 지우거나 남긴다. */
async function cleanEntry(dir: string, boundary: string, spec: StateEntrySpec, level: CleanLevel, report: CleanReport): Promise<void> {
  const path = join(dir, spec.name);
  const info = await lstatOrNull(path);
  if (info === null) return;
  if (spec.name === "reports" && level === "clean") {
    // 가장 최근 점검의 결과를 남기며 지운다. 결과 폴더가 링크면 안을 지우지 않는다
    if (info.isSymbolicLink()) {
      report.skipped.push(spec.name);
    } else if (info.isDirectory()) {
      const { removed, kept } = await cleanReports(path, boundary);
      if (removed.files > 0) report.removed.push(removed);
      if (kept.files > 0) report.kept.push(kept);
    }
    return;
  }
  if (spec.removedBy === "clean" || level === "all") {
    const size = await removeTree(path, boundary);
    // 항목이 링크면 removeTree는 링크 자체만 지운다
    if (info.isSymbolicLink()) report.unlinked.push(spec.name);
    else report.removed.push({ name: spec.name, files: size.files, bytes: size.bytes });
    return;
  }
  const size = await treeSize(path);
  report.kept.push({ name: spec.name, files: size.files, bytes: size.bytes });
}

export async function clean(dir: string, level: CleanLevel): Promise<CleanReport> {
  const report: CleanReport = { dir, level, link: false, removed: [], kept: [], unlinked: [], skipped: [], failed: [] };
  const dirInfo = await lstatOrNull(dir);
  if (dirInfo === null) return report;
  // 상태 폴더가 있어야 할 실제 경로. 검사한 뒤에 링크로 바뀌었어도 실제 경로가 달라져 알아본다
  const boundary = await expectedRealDir(dir);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath(dir)) !== boundary) {
    report.link = true;
    return report;
  }
  for (const spec of STATE_ENTRIES) {
    try {
      await cleanEntry(dir, boundary, spec, level, report);
    } catch (error) {
      report.failed.push({ name: spec.name, code: (error as NodeJS.ErrnoException).code ?? "unknown" });
    }
  }
  return report;
}
```

`src/cli.ts`:

```ts
// aq 명령의 입구. Node.js 버전을 확인하고 하위 명령으로 나눠 보낸다. 예상하지 못한 오류는 이유를 담은 JSON과 종료 코드 1로 낸다(설계 20.1)
import { homedir } from "node:os";
import { clean } from "./commands/clean.ts";
import { doctor } from "./commands/doctor.ts";
import { where } from "./commands/where.ts";
import { stateDir } from "./state/folder.ts";
import { PROGRAM_VERSION } from "./version.ts";

export function nodeMajorOk(version: string): boolean {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}

export interface CliContext {
  env: Record<string, string | undefined>;
  homedir: string;
}

const printJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

/** 하위 명령을 돌린다. 모르는 명령이면 null이다. */
async function run(command: string | undefined, rest: string[], context: CliContext): Promise<number | null> {
  if (command === "doctor") {
    printJson(
      await doctor({
        env: context.env,
        homedir: context.homedir,
        nodeVersion: process.version,
        nodeOk: nodeMajorOk(process.version),
        stateDir: stateDir(context.homedir),
      }),
    );
    return 0;
  }
  if (command === "where" && rest.length === 0) {
    printJson(await where(stateDir(context.homedir)));
    return 0;
  }
  if (command === "clean" && (rest.length === 0 || (rest.length === 1 && rest[0] === "--all"))) {
    printJson(await clean(stateDir(context.homedir), rest[0] === "--all" ? "all" : "clean"));
    return 0;
  }
  return null;
}

export async function main(argv: string[], context: CliContext = { env: process.env, homedir: homedir() }): Promise<number> {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).\n`);
    return 2;
  }
  const [command, ...rest] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}\n`);
    return 0;
  }
  let code: number | null;
  try {
    code = await run(command, rest, context);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    printJson({ error: { code: err.code ?? "unexpected", message: err instanceof Error ? err.message : String(error) } });
    return 1;
  }
  if (code !== null) return code;
  process.stderr.write(`Unknown command: ${[command ?? "(none)", ...rest].join(" ")}\n`);
  return 64;
}
```

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

`test/commands/doctor.test.ts`:

```ts
// aq doctor의 보고(기록 폴더, 세션 파일 수, 상태 폴더에 쓸 수 있는지, 압축 풀기 기능)를 시험한다(설계 6.3, 7.4)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli.ts";
import { doctor } from "../../src/commands/doctor.ts";
import { stateDir } from "../../src/state/folder.ts";

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
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
    expect(report.claudeCode).toEqual({ home: join(root, ".claude"), projectsFound: true, sessionFiles: 1, unreadable: 0 });
    expect(report.state).toEqual({ dir: join(root, ".chunsik-garage"), writable: true });
    expect(typeof report.zstd).toBe("boolean");
    expect(report.node).toEqual({ version: "v24.0.0", ok: true });
  });
  it("기록 폴더를 읽지 못하면 찾았지만 읽지 못한 폴더의 수를 낸다", async () => {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "projects"), "x");
    const report = await doctor({ env: {}, homedir: root, nodeVersion: "v24.0.0", nodeOk: true, stateDir: stateDir(root) });
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

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/commands && npx tsc --noEmit`
Expected: PASS. 시험 파일 3개, 시험 22개(where-clean 12, clean-failure 6, doctor 4). 타입 검사 오류 없음.

- [ ] **Step 5: 묶은 실행 파일을 다시 만들고 전체 검사를 돌린다**

명령 입구가 바뀌었으므로 묶음을 다시 만든다.

Run: `npm run build && npm run check`
Expected: 타입 검사 통과, 시험 파일 19개·시험 185개 통과(1단계 17개·167개에 where-clean·clean-failure 2개·18개), 마지막 줄이 `묶음 검사 통과`.

- [ ] **Step 6: 커밋한다**

```bash
git add src/state/folder.ts src/commands/where.ts src/commands/clean.ts src/cli.ts src/commands/doctor.ts test/helpers/temp-fs.ts test/commands/where-clean.test.ts test/commands/clean-failure.test.ts test/commands/doctor.test.ts skills/aq/scripts/aq.mjs
git commit -m "feat: 상태 폴더를 알리고 지우는 aq where와 aq clean 추가"
```

---

### Task 2: 상태 파일과 설치마다의 관측 기록

**Files:**
- Create: `src/state/state.ts`
- Create: `src/state/observations.ts`
- Test: `test/state/state.test.ts`

**Interfaces:**
- Consumes: `LocalDate`(`src/adapters/common/dates.ts`).
- Produces: `STATE_SCHEMA = 1`, `interface InstallRecord { key: string; firstSeen: LocalDate; appeared: boolean }`, `interface StateFile { schema: 1; salt: string; lastCheckupAt: string | null; installs: InstallRecord[] | null }`, `newState(): StateFile`, `reviveState(value: unknown): StateFile | null`, `loadState(dir): Promise<StateLoad>`(`missing`·`broken`·`ok`), `saveState(dir, state): Promise<void>`(`src/state/state.ts`), `installKey(parts: readonly string[]): string`, `updateInstalls(previous: readonly InstallRecord[] | null, currentKeys: readonly string[], today: LocalDate): InstallRecord[]`(`src/state/observations.ts`).

설계 18.1의 상태 파일 가운데 2단계가 쓰는 것만 둔다. 알림을 켰는지와 알림용 이름 목록은 7단계가 더한다(그때 `STATE_SCHEMA`를 올린다).

- **무작위 값.** MCP 서버 정의의 지문에 섞는 값(설계 11.3, 19.1)이다. `crypto.randomBytes(32)`의 16진 64자다. 상태 파일을 지우면 새 값이 생기고, 그러면 모든 서버의 지문이 바뀌어 새 설치로 보인다. 설계 19.2의 "상태를 지운 뒤에는 MCP 서버가 모두 쓰는지 모름"과 같은 결과다.
- **첫 점검.** `installs`가 `null`이면 이 도구가 아직 관측을 적은 적이 없다. 첫 점검에서 본 설치는 오늘 날짜로 적되 "새로 나타남"이 아니다(설계 18.1). 빈 목록(`[]`)은 첫 점검이 아니다.
- **관측 기록 고치기**는 설계 18.1의 표를 그대로 따른다. 같은 열쇠가 있으면 그대로 둔다. 없으면 오늘 날짜로 새로 적는다. 이번에 보이지 않은 열쇠는 지운다. 다시 나타나면 옛 날짜를 잇지 않는다. 정체가 달라진 설치는 열쇠가 다르므로 새 설치다.
- 상태 파일이 풀리지 않거나 모양이 다르면 `broken`이다. 부르는 쪽(2부의 `aq checkup`)이 새 상태로 바꾸고 알린다.
- 쓰기는 임시 파일에 쓰고 이름을 바꾼다(설계 16.4와 같은 방식).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/state/state.test.ts`:

```ts
// 상태 파일 읽기·쓰기와 설치마다의 관측 기록 고치기를 시험한다(설계 18.1, 21.1의 다시 깐 것·상태를 지운 것)
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installKey, updateInstalls } from "../../src/state/observations.ts";
import { loadState, newState, reviveState, saveState, type StateFile } from "../../src/state/state.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let dir: string;
beforeEach(async () => {
  dir = join(await makeTemp(), ".chunsik-garage");
});
afterEach(async () => removeTemp(join(dir, "..")));

describe("상태 파일", () => {
  it("새 상태는 무작위 값을 가지고 관측 기록이 아직 없다", () => {
    const a = newState();
    const b = newState();
    expect(a.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(a.salt).not.toBe(b.salt);
    expect(a).toMatchObject({ schema: 1, lastCheckupAt: null, installs: null });
  });

  it("쓰고 다시 읽으면 같다. 임시 파일이 남지 않는다", async () => {
    const state: StateFile = {
      ...newState(),
      lastCheckupAt: "2026-11-13T01:00:00.000Z",
      installs: [
        { key: installKey(["b"]), firstSeen: "2026-10-01", appeared: false },
        { key: installKey(["a"]), firstSeen: "2026-11-10", appeared: true },
      ],
    };
    await saveState(dir, state);
    const loaded = await loadState(dir);
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.state.salt).toBe(state.salt);
      expect(loaded.state.installs!.map((r) => r.key)).toEqual([installKey(["a"]), installKey(["b"])]);
    }
    expect(await readdir(dir)).toEqual(["state.json"]);
  });

  it("없으면 missing, 풀리지 않거나 모양이 다르면 broken이다", async () => {
    expect(await loadState(dir)).toEqual({ status: "missing" });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "state.json"), "{not json");
    expect(await loadState(dir)).toEqual({ status: "broken" });
    await writeFile(join(dir, "state.json"), JSON.stringify({ schema: 1, salt: "xyz", lastCheckupAt: null, installs: null }));
    expect(await loadState(dir)).toEqual({ status: "broken" });
  });

  it("관측 기록의 날짜가 날짜 꼴이 아니면 모양이 다른 것이다", () => {
    const base = { schema: 1, salt: "0".repeat(64), lastCheckupAt: null };
    expect(reviveState({ ...base, installs: [{ key: "k", firstSeen: "11/13", appeared: true }] })).toBeNull();
    expect(reviveState({ ...base, installs: [{ key: "k", firstSeen: "2026-11-13", appeared: "yes" }] })).toBeNull();
    expect(reviveState({ ...base, installs: null })).toEqual({ ...base, installs: null });
  });

  it("저장한 파일에 무작위 값 말고 MCP 정의 원문이 들어갈 자리가 없다", async () => {
    await saveState(dir, newState());
    const text = await readFile(join(dir, "state.json"), "utf8");
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["installs", "lastCheckupAt", "salt", "schema"]);
  });
});

describe("관측 기록 고치기", () => {
  const A = installKey(["skill", "claude-code", "user", "a", "c:/h/.claude/skills/a"]);
  const B = installKey(["mcp", "claude-code", "user", "", "srv", "h1"]);

  it("첫 점검에서 이미 있던 설치는 오늘 날짜로 적되 새로 나타난 것이 아니다", () => {
    // 열쇠 차례로 낸다(B의 열쇠가 A의 열쇠보다 앞선다)
    expect(updateInstalls(null, [A, B, A], "2026-11-13")).toEqual([
      { key: B, firstSeen: "2026-11-13", appeared: false },
      { key: A, firstSeen: "2026-11-13", appeared: false },
    ]);
  });

  it("지난 점검에도 같은 정체로 있던 설치는 첫날이 그대로 남는다", () => {
    const previous = [{ key: A, firstSeen: "2026-10-01", appeared: false }];
    expect(updateInstalls(previous, [A], "2026-11-13")).toEqual(previous);
  });

  it("지난 점검에 없던 설치는 오늘 새로 나타난 것으로 적는다", () => {
    const previous = [{ key: A, firstSeen: "2026-10-01", appeared: false }];
    expect(updateInstalls(previous, [A, B], "2026-11-13")).toEqual([
      { key: B, firstSeen: "2026-11-13", appeared: true },
      { key: A, firstSeen: "2026-10-01", appeared: false },
    ]);
  });

  it("보이지 않은 설치는 지우고, 다시 나타나면 옛 날짜를 잇지 않고 새로 적는다", () => {
    const previous = [{ key: A, firstSeen: "2026-08-01", appeared: false }];
    const gone = updateInstalls(previous, [], "2026-11-01");
    expect(gone).toEqual([]);
    expect(updateInstalls(gone, [A], "2026-11-10")).toEqual([{ key: A, firstSeen: "2026-11-10", appeared: true }]);
  });

  it("관측 기록이 빈 목록이면 첫 점검이 아니다", () => {
    expect(updateInstalls([], [A], "2026-11-13")).toEqual([{ key: A, firstSeen: "2026-11-13", appeared: true }]);
  });

  it("정체의 한 부분이라도 다르면 다른 설치다", () => {
    const old = installKey(["mcp", "claude-code", "user", "", "srv", "h1"]);
    const changed = installKey(["mcp", "claude-code", "user", "", "srv", "h2"]);
    expect(updateInstalls([{ key: old, firstSeen: "2026-09-01", appeared: false }], [changed], "2026-11-13")).toEqual([
      { key: changed, firstSeen: "2026-11-13", appeared: true },
    ]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/state/state.test.ts`
Expected: FAIL. `../../src/state/observations.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/state/state.ts`:

```ts
// 상태 파일(state.json)을 읽고 쓴다. 이 PC에서 만든 무작위 값, 마지막 점검 시각, 설치마다의 관측 기록을 둔다. 임시 파일에 쓰고 이름을 바꾼다(설계 18.1, 19.1)
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocalDate } from "../adapters/common/dates.ts";

export const STATE_SCHEMA = 1;
export const STATE_FILE = "state.json";

export interface InstallRecord {
  /** 설치의 정체(installKey로 만든다) */
  key: string;
  /** 이 설치를 계속 봐 온 첫 점검의 날짜 */
  firstSeen: LocalDate;
  /** 그 점검에서 새로 나타난 것인지. 이 도구의 첫 점검에서 이미 있던 것은 거짓이다 */
  appeared: boolean;
}

export interface StateFile {
  schema: typeof STATE_SCHEMA;
  /** 이 PC에서 만든 무작위 값(16진 64자). MCP 서버 정의의 지문에 섞는다. 이 값으로 정의의 원문을 되살릴 수 없다 */
  salt: string;
  /** 마지막 점검을 시작한 시각(ISO). 저장한 점검이 없으면 null */
  lastCheckupAt: string | null;
  /** 설치마다의 관측 기록(열쇠 차례). null이면 이 도구가 아직 관측을 적은 적이 없다(첫 점검) */
  installs: InstallRecord[] | null;
}

export type StateLoad = { status: "missing" } | { status: "broken" } | { status: "ok"; state: StateFile };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SALT = /^[0-9a-f]{64}$/;

export function newState(): StateFile {
  return { schema: STATE_SCHEMA, salt: randomBytes(32).toString("hex"), lastCheckupAt: null, installs: null };
}

function reviveRecord(value: unknown): InstallRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.key !== "string" || typeof v.firstSeen !== "string" || !DATE.test(v.firstSeen) || typeof v.appeared !== "boolean") return null;
  return { key: v.key, firstSeen: v.firstSeen, appeared: v.appeared };
}

/** 풀어 낸 값이 상태 파일의 모양이면 같은 모양으로 되살린다. 하나라도 어긋나면 null이다. */
export function reviveState(value: unknown): StateFile | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.schema !== STATE_SCHEMA || typeof v.salt !== "string" || !SALT.test(v.salt)) return null;
  if (v.lastCheckupAt !== null && (typeof v.lastCheckupAt !== "string" || !Number.isFinite(Date.parse(v.lastCheckupAt)))) return null;
  let installs: InstallRecord[] | null = null;
  if (v.installs !== null) {
    if (!Array.isArray(v.installs)) return null;
    installs = [];
    for (const item of v.installs) {
      const record = reviveRecord(item);
      if (record === null) return null;
      installs.push(record);
    }
    installs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  return { schema: STATE_SCHEMA, salt: v.salt, lastCheckupAt: v.lastCheckupAt, installs };
}

export async function loadState(dir: string): Promise<StateLoad> {
  let text: string;
  try {
    text = await readFile(join(dir, STATE_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return { status: "broken" };
  }
  try {
    const state = reviveState(JSON.parse(text));
    return state === null ? { status: "broken" } : { status: "ok", state };
  } catch {
    return { status: "broken" };
  }
}

export async function saveState(dir: string, state: StateFile): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = join(dir, STATE_FILE);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, target);
}
```

`src/state/observations.ts`:

```ts
// 설치마다의 관측 기록을 점검마다 고친다(순수 함수, 설계 18.1). 이름이 아니라 설치의 정체를 따라간다
import type { LocalDate } from "../adapters/common/dates.ts";
import type { InstallRecord } from "./state.ts";

/** 설치의 정체를 한 줄의 열쇠로 만든다. 같은 부분들이면 늘 같은 열쇠다. */
export function installKey(parts: readonly string[]): string {
  return JSON.stringify(parts);
}

/**
 * 이번 점검에서 본 설치들로 관측 기록을 고친다.
 * - 지난 기록에 같은 열쇠가 있으면 그대로 둔다(계속 봐 온 첫날이 남는다).
 * - 없으면 오늘 날짜로 새로 적는다. 첫 점검(previous가 null)이면 "새로 나타남"이 아니고, 그 뒤에는 "새로 나타남"이다.
 * - 이번에 보이지 않은 설치의 기록은 지운다. 다시 나타나면 새로 적는다(옛 날짜를 이어 붙이지 않는다).
 * 정의를 읽지 못해 정체를 만들 수 없는 서버는 부르는 쪽이 넣지 않는다.
 */
export function updateInstalls(previous: readonly InstallRecord[] | null, currentKeys: readonly string[], today: LocalDate): InstallRecord[] {
  const before = new Map((previous ?? []).map((record) => [record.key, record]));
  const firstCheckup = previous === null;
  return [...new Set(currentKeys)]
    .sort()
    .map((key) => before.get(key) ?? { key, firstSeen: today, appeared: !firstCheckup });
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/state/state.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 11개(상태 파일 5, 관측 기록 6). 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/state/state.ts src/state/observations.ts test/state/state.test.ts
git commit -m "feat: 상태 파일과 설치마다의 관측 기록 추가"
```

---

### Task 3: 스캐너의 파일 읽기 도구

**Files:**
- Create: `src/scan/fs.ts`
- Test: `test/scan/fs.test.ts`

**Interfaces:**
- Consumes: `normalizePath(path, platform?)`(`src/adapters/claude/locate.ts`), 시험 도우미(과제 1).
- Produces: `readText(path): Promise<TextRead>`, `readJson(path): Promise<JsonRead>`(`ok`·`missing`·`unparsable`·`unreadable`, 맨 앞 BOM을 뗀다), `listDir(path): Promise<DirRead>`(이름 차례), `createdMsOf(stats): number | null`, `entryInfo(path): Promise<EntryInfo>`(`exists`, `isLink`, `isDir`, `isFile`, `createdMs`, `targetCreatedMs`, `dangling`, `realPath`).

스캐너는 읽기만 한다(설계 8, 10). 이 파일의 도구는 아무것도 쓰지 않는다.

- **없음과 읽지 못함을 가른다.** 없는 파일(`ENOENT`, 위 폴더가 파일인 `ENOTDIR`)은 `missing`, 권한이나 폴더라서 못 읽은 것은 `unreadable`, JSON으로 풀리지 않으면 `unparsable`이다. S3("풀리지 않는 설정 파일")는 `unparsable`만 센다.
- **만든 시각.** `birthtimeMs`가 유한한 양수가 아니면(0, 음수, NaN, 무한) 그 파일 시스템이 시각을 주지 않는 것으로 보고 `null`이다. 시험은 꾸민 `Stats`로 네 값과 정상 값을 본다. 설계 11.3의 "그 시각을 알 수 없는 파일 시스템에서는 스킬도 ㉮를 쓰지 못한다"가 이것을 쓴다.
- **링크.** 링크면 링크 자체의 시각(`createdMs`)과 대상의 시각(`targetCreatedMs`)을 따로 낸다(설계 11.3 ㉮·㉰). 대상이 없으면 `dangling`이다(S3 "가리키는 곳이 없는 링크"). 실제 경로는 `realpath`를 `normalizePath`로 맞춘 것이다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/fs.test.ts`:

```ts
// 스캐너의 파일 읽기 도구를 시험한다. 없음·풀리지 않음·읽지 못함을 가르는지, 링크와 가리키는 곳이 없는 링크를 알아보는지 본다
import type { Stats } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { createdMsOf, entryInfo, listDir, readJson, readText } from "../../src/scan/fs.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

describe("readJson과 readText", () => {
  it("없는 파일, 풀리지 않는 파일, 폴더를 가른다", async () => {
    expect(await readJson(join(root, "none.json"))).toEqual({ status: "missing" });
    await put(join(root, "bad.json"), "{ nope");
    expect(await readJson(join(root, "bad.json"))).toEqual({ status: "unparsable" });
    await mkdir(join(root, "dir.json"));
    expect(await readJson(join(root, "dir.json"))).toEqual({ status: "unreadable" });
  });
  it("맨 앞의 BOM을 떼고 푼다", async () => {
    await put(join(root, "bom.json"), "﻿{\"a\":1}");
    expect(await readJson(join(root, "bom.json"))).toEqual({ status: "ok", value: { a: 1 } });
    expect(await readText(join(root, "bom.json"))).toEqual({ status: "ok", text: "{\"a\":1}" });
  });
});

describe("listDir", () => {
  it("이름 차례로 내고, 없는 폴더는 missing이다", async () => {
    await put(join(root, "d", "b.txt"), "");
    await put(join(root, "d", "a.txt"), "");
    expect(await listDir(join(root, "d"))).toEqual({ status: "ok", names: ["a.txt", "b.txt"] });
    expect(await listDir(join(root, "nope"))).toEqual({ status: "missing" });
  });
});

describe("entryInfo", () => {
  it("보통 폴더와 파일", async () => {
    await put(join(root, "skill", "SKILL.md"), "x");
    const dir = await entryInfo(join(root, "skill"));
    expect(dir).toMatchObject({ exists: true, isLink: false, isDir: true, dangling: false, targetCreatedMs: null });
    expect(dir.realPath).toBe(normalizePath(join(root, "skill")));
    expect((await entryInfo(join(root, "skill", "SKILL.md"))).isFile).toBe(true);
    expect((await entryInfo(join(root, "nothing"))).exists).toBe(false);
  });
  it("폴더 링크는 링크로 알아보고 실제 경로는 대상이다", async () => {
    await put(join(root, "real", "SKILL.md"), "x");
    await linkDir(join(root, "real"), join(root, "linked"));
    const info = await entryInfo(join(root, "linked"));
    expect(info).toMatchObject({ exists: true, isLink: true, isDir: true, dangling: false });
    expect(info.realPath).toBe(normalizePath(join(root, "real")));
  });
  it("가리키는 곳이 없는 링크는 dangling이다", async () => {
    await put(join(root, "gone", "SKILL.md"), "x");
    await linkDir(join(root, "gone"), join(root, "broken"));
    await rm(join(root, "gone"), { recursive: true, force: true });
    const info = await entryInfo(join(root, "broken"));
    expect(info).toMatchObject({ exists: true, isLink: true, isDir: false, dangling: true, targetCreatedMs: null });
  });
});

describe("createdMsOf", () => {
  const stats = (birthtimeMs: number): Stats => ({ birthtimeMs }) as Stats;
  it("0, 음수, NaN, 무한은 파일 시스템이 시각을 주지 않은 것이다", () => {
    for (const ms of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(createdMsOf(stats(ms))).toBeNull();
  });
  it("정상 시각은 그대로 낸다", () => {
    expect(createdMsOf(stats(1_760_000_000_000))).toBe(1_760_000_000_000);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/fs.test.ts`
Expected: FAIL. `../../src/scan/fs.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/fs.ts`:

```ts
// 스캐너가 파일 시스템을 읽는 도구. JSON과 글 읽기(없음·풀리지 않음·읽지 못함을 가른다), 항목 정보(링크인지, 만든 시각, 실제 경로), 폴더 목록. 아무것도 쓰지 않는다(설계 10)
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import { normalizePath } from "../adapters/claude/locate.ts";

export type JsonRead = { status: "ok"; value: unknown } | { status: "missing" } | { status: "unparsable" } | { status: "unreadable" };
export type TextRead = { status: "ok"; text: string } | { status: "missing" } | { status: "unreadable" };
export type DirRead = { status: "ok"; names: string[] } | { status: "missing" } | { status: "unreadable" };

const isMissing = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};

const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export async function readText(path: string): Promise<TextRead> {
  try {
    return { status: "ok", text: stripBom(await readFile(path, "utf8")) };
  } catch (error) {
    return isMissing(error) ? { status: "missing" } : { status: "unreadable" };
  }
}

/** JSON 파일을 읽는다. 맨 앞의 BOM은 떼고 푼다. */
export async function readJson(path: string): Promise<JsonRead> {
  const text = await readText(path);
  if (text.status !== "ok") return text;
  try {
    return { status: "ok", value: JSON.parse(text.text) };
  } catch {
    return { status: "unparsable" };
  }
}

/** 폴더의 이름 목록을 이름 차례로 낸다. */
export async function listDir(path: string): Promise<DirRead> {
  try {
    return { status: "ok", names: (await readdir(path)).sort() };
  } catch (error) {
    return isMissing(error) ? { status: "missing" } : { status: "unreadable" };
  }
}

/** 만든 시각(epoch 밀리초). 파일 시스템이 주지 않으면(0이거나 숫자가 아님) null이다. */
export function createdMsOf(info: Stats): number | null {
  const ms = info.birthtimeMs;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export interface EntryInfo {
  exists: boolean;
  isLink: boolean;
  /** 링크면 대상이 폴더인지, 아니면 그 자체가 폴더인지 */
  isDir: boolean;
  isFile: boolean;
  /** 항목 자체(링크면 링크)를 만든 시각 */
  createdMs: number | null;
  /** 링크의 대상을 만든 시각. 링크가 아니거나 대상이 없으면 null */
  targetCreatedMs: number | null;
  /** 링크가 가리키는 곳이 없다 */
  dangling: boolean;
  /** 링크를 푼 실제 경로(정규화). 풀지 못하면 null */
  realPath: string | null;
}

const MISSING: EntryInfo = { exists: false, isLink: false, isDir: false, isFile: false, createdMs: null, targetCreatedMs: null, dangling: false, realPath: null };

export async function entryInfo(path: string): Promise<EntryInfo> {
  let own: Stats;
  try {
    own = await lstat(path);
  } catch {
    return MISSING;
  }
  const isLink = own.isSymbolicLink();
  let target: Stats | null = own;
  if (isLink) {
    try {
      target = await stat(path);
    } catch {
      target = null;
    }
  }
  let real: string | null = null;
  try {
    real = normalizePath(await realpath(path));
  } catch {
    real = null;
  }
  return {
    exists: true,
    isLink,
    isDir: target?.isDirectory() ?? false,
    isFile: target?.isFile() ?? false,
    createdMs: createdMsOf(own),
    targetCreatedMs: isLink && target !== null ? createdMsOf(target) : null,
    dangling: isLink && target === null,
    realPath: real,
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/fs.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 8개. 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/fs.ts test/scan/fs.test.ts
git commit -m "feat: 셋팅 스캐너의 파일 읽기 도구 추가"
```

---

### Task 4: 작업 폴더에서 프로젝트 정하기

**Files:**
- Create: `src/scan/projects.ts`
- Test: `test/scan/projects.test.ts`

**Interfaces:**
- Consumes: `entryInfo`, `readText`(과제 3), `normalizePath`.
- Produces: `interface ProjectContext { homedir; tmpdir; platform }`, `interface ProjectRef { root; normRoot; kind: "git" | "folder"; exists; excluded; cwds: string[] }`, `isExcludedFolder(normRoot, normCwd, context): boolean`, `resolveProject(cwd, context): Promise<ProjectRef>`, `groupProjects(cwds, context): Promise<ProjectRef[]>`(정규화한 뿌리 차례).

설계 10의 「프로젝트의 정체」, 「프로젝트로 보지 않는 폴더」, 「지금 PC에 없는 작업 폴더」를 구현한다.

- 작업 폴더에서 위로 올라가며 처음 만나는 `.git`이 폴더면 그 위치가 뿌리다. `.git`이 파일이면(따로 떼어 낸 작업 폴더나 하위 모듈) `gitdir:`이 가리키는 깃 폴더의 `commondir`를 따라가, 본 저장소의 깃 폴더가 `<뿌리>/.git`이면 그 위를 뿌리로 본다. `commondir`가 없으면(하위 모듈) `.git` 파일이 있는 폴더가 뿌리다.
- 깃 저장소가 아니면 작업 폴더 자체가 프로젝트다. 작업 폴더가 지금 PC에 없으면 깃을 볼 수 없으므로 작업 폴더 자체를 프로젝트로 보고 `exists: false`로 적는다. 2부의 규칙이 F3·F6·S2(프로젝트 쪽)에서 이런 프로젝트를 빼고 I4에는 넣는다(설계 10 「지금 PC에 없는 작업 폴더」).
- 프로젝트로 보지 않는 폴더는 홈 자체, 홈 아래의 `Desktop`·`Documents`·`Downloads` 자체, OS 임시 폴더와 그 아래, 드라이브의 뿌리다. 뿌리나 작업 폴더가 임시 폴더 아래에 있으면 뺀다. 그 아래의 폴더(예. 바탕화면 안의 폴더)는 프로젝트다.
- 견주기는 `normalizePath`(구분 기호를 `/`로, Windows는 소문자)로 한다.
- **대소문자 별칭(Windows).** 같은 폴더를 대소문자만 달리 적은 작업 폴더들은 정규화하면 하나다. 결과에 남기는 원문 표기는 그 별칭들 가운데 글자 차례로 가장 앞선 것이다. 작업 폴더를 주는 차례가 결과를 바꾸지 않게 하려는 것이다(과제 12의 작업 폴더 차례를 뒤집는 시험과 같은 약속). 이 시험은 Windows에서만 돈다.
- 시험은 OS 임시 폴더 아래에서 돌므로 `ProjectContext.tmpdir`를 시험 폴더 안의 다른 폴더로 준다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/projects.test.ts`:

```ts
// 작업 폴더에서 프로젝트를 정하는 규칙을 시험한다. 깃 뿌리, 따로 떼어 낸 작업 폴더, 하위 모듈, 깃이 아닌 폴더, 없어진 폴더, 프로젝트로 보지 않는 폴더(설계 10)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { groupProjects, isExcludedFolder, resolveProject, type ProjectContext } from "../../src/scan/projects.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let context: ProjectContext;
beforeEach(async () => {
  root = await makeTemp();
  // 시험 폴더가 OS 임시 폴더 아래에 있으므로 임시 폴더를 따로 정해 준다
  context = { homedir: join(root, "home"), tmpdir: join(root, "os-tmp"), platform: process.platform };
});
afterEach(async () => removeTemp(root));

describe("resolveProject", () => {
  it("위로 올라가며 처음 만나는 깃 저장소의 뿌리다", async () => {
    await mkdir(join(root, "repo", ".git"), { recursive: true });
    await mkdir(join(root, "repo", "src", "deep"), { recursive: true });
    const ref = await resolveProject(join(root, "repo", "src", "deep"), context);
    expect(ref).toMatchObject({ root: join(root, "repo"), kind: "git", exists: true, excluded: false });
    expect(ref.normRoot).toBe(normalizePath(join(root, "repo")));
  });

  it("따로 떼어 낸 작업 폴더는 본 저장소로 묶는다", async () => {
    const worktreeGit = join(root, "main", ".git", "worktrees", "wt1");
    await put(join(worktreeGit, "commondir"), "../..\n");
    await put(join(root, "wt1", ".git"), `gitdir: ${worktreeGit}\n`);
    const ref = await resolveProject(join(root, "wt1"), context);
    expect(ref).toMatchObject({ root: join(root, "main"), kind: "git" });
  });

  it("commondir가 없는 .git 파일(하위 모듈)은 그 폴더가 뿌리다", async () => {
    await mkdir(join(root, "super", ".git", "modules", "lib"), { recursive: true });
    await put(join(root, "super", "lib", ".git"), "gitdir: ../.git/modules/lib\n");
    const ref = await resolveProject(join(root, "super", "lib"), context);
    expect(ref).toMatchObject({ root: join(root, "super", "lib"), kind: "git" });
  });

  it("깃이 아니면 작업 폴더 자체가 프로젝트다", async () => {
    await mkdir(join(root, "plain"), { recursive: true });
    expect(await resolveProject(join(root, "plain"), context)).toMatchObject({ root: join(root, "plain"), kind: "folder", exists: true });
  });

  it("없어진 작업 폴더는 작업 폴더 자체를 프로젝트로 보고 없다고 적는다", async () => {
    expect(await resolveProject(join(root, "deleted"), context)).toMatchObject({ root: join(root, "deleted"), kind: "folder", exists: false });
  });
});

describe("프로젝트로 보지 않는 폴더", () => {
  const norm = (path: string): string => normalizePath(path);
  it("홈 자체, 바탕화면·문서·내려받기 자체, 임시 폴더 아래, 드라이브 뿌리", () => {
    const home = context.homedir;
    expect(isExcludedFolder(norm(home), norm(home), context)).toBe(true);
    expect(isExcludedFolder(norm(join(home, "Desktop")), norm(join(home, "Desktop")), context)).toBe(true);
    expect(isExcludedFolder(norm(join(home, "Downloads")), norm(join(home, "Downloads")), context)).toBe(true);
    expect(isExcludedFolder(norm(join(context.tmpdir, "x", "y")), norm(join(context.tmpdir, "x", "y")), context)).toBe(true);
    expect(isExcludedFolder("c:/", "c:/", context)).toBe(true);
    expect(isExcludedFolder("/", "/", context)).toBe(true);
  });
  it("그 아래의 폴더는 프로젝트다", () => {
    const desktopProject = norm(join(context.homedir, "Desktop", "notes"));
    expect(isExcludedFolder(desktopProject, desktopProject, context)).toBe(false);
    const work = norm(join(context.homedir, "dev", "app"));
    expect(isExcludedFolder(work, work, context)).toBe(false);
  });
});

describe("groupProjects", () => {
  it("같은 뿌리의 작업 폴더를 묶고 뿌리 차례로 낸다", async () => {
    await mkdir(join(root, "b-repo", ".git"), { recursive: true });
    await mkdir(join(root, "b-repo", "x"), { recursive: true });
    await mkdir(join(root, "a-plain"), { recursive: true });
    const projects = await groupProjects([join(root, "b-repo", "x"), join(root, "a-plain"), join(root, "b-repo"), join(root, "b-repo", "x")], context);
    expect(projects.map((p) => p.root)).toEqual([join(root, "a-plain"), join(root, "b-repo")]);
    expect(projects[1]!.cwds).toEqual([normalizePath(join(root, "b-repo")), normalizePath(join(root, "b-repo", "x"))].sort());
  });
  it.runIf(process.platform === "win32")("Windows에서 같은 폴더를 대소문자만 달리 적어도 원문 뿌리가 입력 차례와 상관없이 같다", async () => {
    await mkdir(join(root, "Repo", ".git"), { recursive: true });
    const upper = join(root, "Repo");
    const lower = join(root, "repo");
    const a = await groupProjects([upper, lower], context);
    const b = await groupProjects([lower, upper], context);
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/projects.test.ts`
Expected: FAIL. `../../src/scan/projects.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/projects.ts`:

```ts
// 작업 폴더에서 프로젝트를 정한다. 위로 올라가며 처음 만나는 깃 저장소의 뿌리이고, 따로 떼어 낸 작업 폴더(워크트리)는 본 저장소로 묶으며, 깃이 아니면 작업 폴더 자체다. 프로젝트로 보지 않는 폴더를 가른다(설계 10)
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, readText } from "./fs.ts";

export interface ProjectContext {
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
}

export interface ProjectRef {
  /** 프로젝트 뿌리(정규화하지 않은 절대 경로) */
  root: string;
  normRoot: string;
  kind: "git" | "folder";
  /** 작업 폴더가 지금 PC에 있는지. 없으면 깃 뿌리를 찾지 못해 작업 폴더 자체가 프로젝트다 */
  exists: boolean;
  /** 프로젝트로 보지 않는 폴더(홈 자체, 바탕화면·문서·내려받기 자체, OS 임시 폴더 아래, 드라이브의 뿌리) */
  excluded: boolean;
  /** 이 프로젝트로 묶인 작업 폴더(정규화, 차례대로) */
  cwds: string[];
}

/** .git 파일이 가리키는 깃 폴더의 commondir를 따라가 본 저장소의 뿌리를 찾는다. 하위 모듈처럼 commondir가 없으면 null이다. */
async function mainRootFromGitFile(dir: string, dotGit: string): Promise<string | null> {
  const text = await readText(dotGit);
  if (text.status !== "ok") return null;
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(text.text);
  if (match === null) return null;
  const gitDir = isAbsolute(match[1]!) ? match[1]! : resolve(dir, match[1]!);
  const common = await readText(join(gitDir, "commondir"));
  if (common.status !== "ok") return null;
  const commonDir = resolve(gitDir, common.text.trim());
  return parse(commonDir).base.toLowerCase() === ".git" ? dirname(commonDir) : null;
}

async function gitRootFrom(start: string): Promise<string | null> {
  let dir = start;
  for (;;) {
    const dotGit = join(dir, ".git");
    const info = await entryInfo(dotGit);
    if (info.exists && info.isDir) return dir;
    if (info.exists && info.isFile) return (await mainRootFromGitFile(dir, dotGit)) ?? dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const under = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);

/** 프로젝트로 보지 않는 폴더인지 본다. 경로는 정규화한 것이다. */
export function isExcludedFolder(normRoot: string, normCwd: string, context: ProjectContext): boolean {
  const norm = (path: string): string => normalizePath(path, context.platform);
  const specials = [context.homedir, join(context.homedir, "Desktop"), join(context.homedir, "Documents"), join(context.homedir, "Downloads")].map(norm);
  const tmp = norm(context.tmpdir);
  const driveRoot = /^[a-z]:\/?$/i.test(normRoot) || normRoot === "/";
  return specials.includes(normRoot) || driveRoot || under(normRoot, tmp) || under(normCwd, tmp);
}

export async function resolveProject(cwd: string, context: ProjectContext): Promise<ProjectRef> {
  const absolute = resolve(cwd);
  const info = await entryInfo(absolute);
  const exists = info.exists && info.isDir;
  const gitRoot = exists ? await gitRootFrom(absolute) : null;
  const root = gitRoot ?? absolute;
  const normRoot = normalizePath(root, context.platform);
  const normCwd = normalizePath(absolute, context.platform);
  return { root, normRoot, kind: gitRoot === null ? "folder" : "git", exists, excluded: isExcludedFolder(normRoot, normCwd, context), cwds: [normCwd] };
}

/** 작업 폴더들을 프로젝트로 묶는다. 정규화한 뿌리 차례로 낸다. 같은 뿌리로 묶인 작업 폴더는 cwds에 모이고, 원문 뿌리는 표기 가운데 글자 차례로 가장 앞선 것이다. */
export async function groupProjects(cwds: readonly string[], context: ProjectContext): Promise<ProjectRef[]> {
  // 같은 곳을 다른 표기(Windows의 대소문자 등)로 적은 작업 폴더는 글자 차례로 가장 앞선 표기 하나로 본다. 입력의 차례와 상관없이 같다
  const byNormCwd = new Map<string, string>();
  for (const cwd of cwds) {
    const normCwd = normalizePath(cwd, context.platform);
    const previous = byNormCwd.get(normCwd);
    if (previous === undefined || cwd < previous) byNormCwd.set(normCwd, cwd);
  }
  const byRoot = new Map<string, ProjectRef>();
  for (const normCwd of [...byNormCwd.keys()].sort()) {
    const ref = await resolveProject(byNormCwd.get(normCwd)!, context);
    const existing = byRoot.get(ref.normRoot);
    if (existing === undefined) {
      byRoot.set(ref.normRoot, ref);
      continue;
    }
    existing.cwds.push(normCwd);
    existing.exists ||= ref.exists;
    existing.excluded ||= ref.excluded;
    if (ref.root < existing.root) existing.root = ref.root;
  }
  const out = [...byRoot.values()].sort((x, y) => (x.normRoot < y.normRoot ? -1 : x.normRoot > y.normRoot ? 1 : 0));
  for (const ref of out) ref.cwds.sort();
  return out;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/projects.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 9개(Windows 밖에서는 대소문자 별칭 시험 1개를 건너뛴다). 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/projects.ts test/scan/projects.test.ts
git commit -m "feat: 작업 폴더에서 프로젝트를 정하는 규칙 추가"
```

---

### Task 5: 지침 파일 읽기

**Files:**
- Create: `src/scan/instructions.ts`
- Test: `test/scan/instructions.test.ts`

**Interfaces:**
- Consumes: `entryInfo`, `listDir`, `readText`(과제 3), `normalizePath`.
- Produces: `interface InstructionFile { path; realPath; bytes; sameAsGlobal: boolean }`, `interface InstructionSet { files: InstructionFile[]; bytes; chars: { ascii; other }; lineHashes: string[]; unreadable: string[]; unreadableDirs: string[] }`, `MIN_LINE_CHARS = 20`, `emptyInstructionSet()`, `lineHash(line)`, `countChars(text)`, `linesForOverlap(text)`, `interface FoundFiles { paths: string[]; unreadableDirs: string[] }`, `markdownFilesUnder(dir): Promise<FoundFiles>`, `interface MentionTarget`, `countMentions(text, targets)`, `readInstructionSet(paths, mentionTargets?, sameAsGlobal?): Promise<{ set; mentions }>`, `globalInstructionPaths(claudeHome): Promise<FoundFiles>`, `projectInstructionPaths(root): Promise<FoundFiles>`, `readGlobalInstructions(claudeHome, mentionTargets): Promise<{ set; mentions }>`, `readProjectInstructions(root, global): Promise<InstructionSet>`, `realPaths(set): Set<string>`.

설계 10("지침 파일은 크기, 글자 종류별 글자 수, 줄마다의 해시만 쓴다")과 11.3(S1, F3, F4의 줄), 17절 단서 1(전역 지침에 프로젝트가 나온 횟수), 10 「지침 파일의 범위」를 구현한다.

- **읽는 파일.** 전역은 `<홈>/CLAUDE.md`와 `<홈>/rules` 아래의 `.md`(사용자 규칙)다. 프로젝트는 뿌리의 `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules` 아래의 `.md`다. 앞의 셋이 하나도 없으면 Claude Code가 기본 설정에서 대신 읽는 `AGENTS.md`와 `.claude/AGENTS.md`를 넣는다. 규칙 폴더는 폴더 링크를 따라가지 않고 깊이 8까지 본다.
- **줄.** LF로 가르고 끝의 CR과 앞뒤 공백을 뗀 뒤 20자(코드 포인트) 이상인 줄만 SHA-256 앞 16바이트로 지문을 만든다. 같은 줄은 한 번만 센다(설계 11.3 F4).
- **전역과 같은 파일.** 프로젝트 지침 파일의 실제 경로가 전역 지침 파일의 실제 경로와 같으면(링크이거나 같은 파일) 목록과 크기에는 넣고 `sameAsGlobal`을 참으로 적되, 줄 지문에서만 뺀다. F4가 그 파일을 견주지 않을 뿐이고 F3에는 프로젝트 지침으로 든다(설계 11.3 F4).
- **읽지 못한 규칙 폴더.** 규칙 폴더나 그 아래 폴더의 목록을 읽지 못하면 `unreadableDirs`에 적는다. 없는 폴더는 적지 않는다. 그 안의 지침은 보지 못한 것이고 없는 것으로 치지 않는다(설계 20.1). 읽지 못한 폴더는 시험에서 NUL이 든 경로로 만든다.
- **프로젝트가 나온 횟수.** 전역 지침 글에서 프로젝트 뿌리의 경로(구분 기호와 대소문자를 맞춘다)와 폴더 이름(3자 이상, 앞뒤가 글자·숫자·`_`가 아닌 낱말)을 센다. 경로로 센 자리는 이름으로 다시 세지 않는다. 약한 단서다(설계 17).
- 글은 메모리에서 세고 버린다. 묶음에는 숫자와 지문과 경로만 남는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/instructions.test.ts`:

```ts
// 지침 파일 읽기를 시험한다. 글자 종류별 수, 겹침 비교의 줄, 전역과 같은 파일, 규칙 폴더와 AGENTS.md, 읽지 못한 폴더, 프로젝트가 나온 횟수(설계 10, 11.3, 17)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import {
  countChars,
  countMentions,
  globalInstructionPaths,
  lineHash,
  linesForOverlap,
  markdownFilesUnder,
  projectInstructionPaths,
  readGlobalInstructions,
  readInstructionSet,
  readProjectInstructions,
  realPaths,
} from "../../src/scan/instructions.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

describe("글자와 줄", () => {
  it("ASCII와 그 밖의 글자를 코드 포인트로 나눠 센다", () => {
    expect(countChars("abc 한글😀")).toEqual({ ascii: 4, other: 3 });
  });
  it("앞뒤 공백을 뗀 20자 이상 줄만 지문을 만든다. CRLF도 같은 줄이다", () => {
    const long = "이 줄은 스무 글자를 넘는 한국어 지침 줄입니다";
    expect(linesForOverlap(`짧은 줄\r\n   ${long}   \r\n${"x".repeat(19)}\n`)).toEqual([lineHash(long)]);
    expect(linesForOverlap("a".repeat(20))).toEqual([lineHash("a".repeat(20))]);
  });
});

describe("readInstructionSet", () => {
  it("파일들의 크기·글자·줄 지문을 합치고 글은 남기지 않는다", async () => {
    const line = "Always run the tests before you say the work is done.";
    await put(join(root, "a.md"), `${line}\n짧다\n`);
    await put(join(root, "b.md"), `${line}\r\n`);
    const { set } = await readInstructionSet([join(root, "b.md"), join(root, "a.md"), join(root, "none.md")]);
    expect(set.files.map((f) => f.path)).toEqual([join(root, "a.md"), join(root, "b.md")]);
    expect(set.bytes).toBe(Buffer.byteLength(`${line}\n짧다\n`) + Buffer.byteLength(`${line}\r\n`));
    expect(set.lineHashes).toEqual([lineHash(line)]);
    expect(JSON.stringify(set)).not.toContain("Always run");
  });

  it("실제 경로가 전역 지침과 같은 파일은 목록과 크기에는 남기고 줄 지문에서만 뺀다(F3에는 있고 F4에서 견주지 않는다)", async () => {
    const line = "global rules line that is long enough to compare";
    await put(join(root, "global", "CLAUDE.md"), line);
    await linkDir(join(root, "global"), join(root, "proj", ".claude"));
    const global = await readInstructionSet([join(root, "global", "CLAUDE.md")]);
    const project = await readInstructionSet([join(root, "proj", ".claude", "CLAUDE.md")], [], realPaths(global.set));
    expect(project.set.files).toEqual([{ path: join(root, "proj", ".claude", "CLAUDE.md"), realPath: normalizePath(join(root, "global", "CLAUDE.md")), bytes: Buffer.byteLength(line), sameAsGlobal: true }]);
    expect(project.set.lineHashes).toEqual([]);
    expect(global.set.lineHashes).toEqual([lineHash(line)]);
  });

  it("폴더처럼 읽을 수 없는 경로는 읽지 못한 것으로 적는다", async () => {
    await put(join(root, "CLAUDE.md", "inside.txt"), "x");
    const { set } = await readInstructionSet([join(root, "CLAUDE.md")]);
    expect(set.unreadable).toEqual([join(root, "CLAUDE.md")]);
  });
});

describe("지침 파일의 위치", () => {
  it("전역 지침은 CLAUDE.md와 rules 아래의 .md다. 폴더 링크는 따라가지 않는다", async () => {
    const home = join(root, ".claude");
    await put(join(home, "rules", "a.md"), "x");
    await put(join(home, "rules", "deep", "b.md"), "x");
    await put(join(home, "rules", "notes.txt"), "x");
    await put(join(root, "elsewhere", "c.md"), "x");
    await linkDir(join(root, "elsewhere"), join(home, "rules", "linked"));
    expect(await globalInstructionPaths(home)).toEqual({ paths: [join(home, "CLAUDE.md"), join(home, "rules", "a.md"), join(home, "rules", "deep", "b.md")], unreadableDirs: [] });
  });

  it("CLAUDE 파일이 있으면 AGENTS.md를 넣지 않고, 없으면 넣는다. 규칙 파일만 있어도 지침이다", async () => {
    const withClaude = join(root, "p1");
    await put(join(withClaude, "CLAUDE.local.md"), "x");
    await put(join(withClaude, "AGENTS.md"), "x");
    await put(join(withClaude, ".claude", "rules", "r.md"), "x");
    expect((await projectInstructionPaths(withClaude)).paths).toEqual([join(withClaude, "CLAUDE.local.md"), join(withClaude, ".claude", "rules", "r.md")]);
    const agentsOnly = join(root, "p2");
    await put(join(agentsOnly, "AGENTS.md"), "x");
    expect((await projectInstructionPaths(agentsOnly)).paths).toEqual([join(agentsOnly, "AGENTS.md"), join(agentsOnly, ".claude", "AGENTS.md")]);
    const rulesOnly = join(root, "p3");
    await put(join(rulesOnly, ".claude", "rules", "sub", "deep.md"), "x");
    const global = await readGlobalInstructions(join(root, "no-home"), []);
    const set = await readProjectInstructions(rulesOnly, global.set);
    expect(set.files.map((f) => f.path)).toEqual([join(rulesOnly, ".claude", "rules", "sub", "deep.md")]);
  });

  it("목록을 읽지 못한 규칙 폴더는 따로 적는다(없는 폴더는 적지 않는다)", async () => {
    // 경로에 NUL이 들면 Node.js가 목록 읽기를 거절한다. 어느 OS에서나 "읽지 못함"을 만드는 방법이다
    const bad = join(root, "bad\u0000dir");
    expect(await markdownFilesUnder(bad)).toEqual({ paths: [], unreadableDirs: [bad] });
    expect(await markdownFilesUnder(join(root, "none"))).toEqual({ paths: [], unreadableDirs: [] });
  });
});

describe("countMentions", () => {
  const target = (path: string) => ({ root: path, normRoot: normalizePath(path) });
  it("경로는 구분 기호와 대소문자를 맞춰, 폴더 이름은 낱말로 센다", () => {
    const app = target(join(root, "dev", "billing-app"));
    const text = `Use ${join(root, "dev", "billing-app").toUpperCase()} for invoices. billing-app owns payments. my-billing-apps is different.`;
    expect(countMentions(text, [app])).toEqual({ [app.normRoot]: 2 });
  });
  it("세 글자보다 짧은 폴더 이름은 낱말로 세지 않는다", () => {
    const short = target(join(root, "ui"));
    expect(countMentions("the ui is fine", [short])).toEqual({});
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/instructions.test.ts`
Expected: FAIL. `../../src/scan/instructions.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/instructions.ts`:

```ts
// 지침 파일을 읽어 크기, 글자 종류별 글자 수, 줄마다의 지문만 남기고 글은 버린다. 전역 지침에 프로젝트의 경로나 이름이 몇 번 나오는지도 센다(설계 10 「지침 파일의 범위」, 11.3 S1·F3·F4, 17)
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { basename, join } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, listDir, readText } from "./fs.ts";

export interface InstructionFile {
  path: string;
  /** 링크를 푼 실제 경로(정규화). 전역과 프로젝트가 같은 파일인지 견줄 때 쓴다 */
  realPath: string | null;
  bytes: number;
  /** 전역 지침과 같은 파일(링크이거나 실제 경로가 같음)이다. F4에서 견주지 않으므로 줄 지문에 넣지 않는다(설계 11.3 F4) */
  sameAsGlobal: boolean;
}

export interface InstructionSet {
  /** 읽은 파일(경로 차례). 전역과 같은 파일도 든다(F3과 정밀 점검의 파일 목록에 쓴다) */
  files: InstructionFile[];
  bytes: number;
  chars: { ascii: number; other: number };
  /** 전역과 같은 파일을 뺀 파일들에서, 앞뒤 공백을 뗀 20자 이상 줄의 지문(SHA-256 앞 16바이트, 16진). 중복 없이 차례대로 */
  lineHashes: string[];
  /** 있지만 읽지 못한 파일 */
  unreadable: string[];
  /** 목록을 읽지 못한 규칙 폴더. 그 안의 지침은 보지 못했다 */
  unreadableDirs: string[];
}

export const MIN_LINE_CHARS = 20;
const RULES_MAX_DEPTH = 8;

export function emptyInstructionSet(): InstructionSet {
  return { files: [], bytes: 0, chars: { ascii: 0, other: 0 }, lineHashes: [], unreadable: [], unreadableDirs: [] };
}

export function lineHash(line: string): string {
  return createHash("sha256").update(line).digest("hex").slice(0, 32);
}

/** 글자 종류별 글자 수. ASCII와 그 밖의 글자(코드 포인트 단위)를 나눈다. */
export function countChars(text: string): { ascii: number; other: number } {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.codePointAt(0)! < 0x80) ascii++;
    else other++;
  }
  return { ascii, other };
}

/** 겹침 비교에 쓰는 줄의 지문들. 줄은 LF로 가르고 끝의 CR과 앞뒤 공백을 뗀다. */
export function linesForOverlap(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if ([...line].length >= MIN_LINE_CHARS) out.push(lineHash(line));
  }
  return out;
}

export interface FoundFiles {
  /** 찾은 파일(경로 차례) */
  paths: string[];
  /** 목록을 읽지 못한 폴더(경로 차례) */
  unreadableDirs: string[];
}

/** 폴더 아래의 .md 파일을 찾는다. 폴더 링크는 따라가지 않고 깊이를 묶는다. 목록을 읽지 못한 폴더를 함께 낸다. */
export async function markdownFilesUnder(dir: string): Promise<FoundFiles> {
  const paths: string[] = [];
  const unreadableDirs: string[] = [];
  const walk = async (current: string, depth: number): Promise<void> => {
    const listing = await listDir(current);
    if (listing.status === "unreadable") unreadableDirs.push(current);
    if (listing.status !== "ok") return;
    for (const name of listing.names) {
      const path = join(current, name);
      let info;
      try {
        info = await lstat(path);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        if (depth < RULES_MAX_DEPTH) await walk(path, depth + 1);
        continue;
      }
      if (name.toLowerCase().endsWith(".md") && (info.isFile() || info.isSymbolicLink())) paths.push(path);
    }
  };
  await walk(dir, 0);
  return { paths: paths.sort(), unreadableDirs: unreadableDirs.sort() };
}

export interface MentionTarget {
  normRoot: string;
  root: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 글 안에 프로젝트의 경로(구분 기호를 맞춰 대소문자 없이)나 폴더 이름(앞뒤가 글자·숫자가 아닌 낱말, 3자 이상)이 나온 횟수. */
export function countMentions(text: string, targets: readonly MentionTarget[]): Record<string, number> {
  const unified = text.replace(/\\/g, "/").toLowerCase();
  const out: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const target of targets) {
    const path = target.normRoot.toLowerCase();
    let count = unified.split(path).length - 1;
    const name = basename(target.root).toLowerCase();
    if ([...name].length >= 3) {
      const word = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "gu");
      const withoutPaths = path.length > 0 ? unified.split(path).join(" ") : unified;
      count += (withoutPaths.match(word) ?? []).length;
    }
    if (count > 0) out[target.normRoot] = count;
  }
  return out;
}

/**
 * 파일 목록을 읽어 지침 묶음을 만든다. 없는 파일은 건너뛴다. 글은 메모리에서 세고 버린다.
 * mentionTargets가 있으면 그 횟수도 센다. 실제 경로가 sameAsGlobal에 든 파일은 목록과 크기에는 넣고 줄 지문에서만 뺀다.
 */
export async function readInstructionSet(
  paths: readonly string[],
  mentionTargets: readonly MentionTarget[] = [],
  sameAsGlobal: ReadonlySet<string> = new Set(),
): Promise<{ set: InstructionSet; mentions: Record<string, number> }> {
  const set = emptyInstructionSet();
  const hashes = new Set<string>();
  const mentions: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const path of [...new Set(paths)].sort()) {
    const read = await readText(path);
    if (read.status === "missing") continue;
    if (read.status === "unreadable") {
      set.unreadable.push(path);
      continue;
    }
    const info = await entryInfo(path);
    const same = info.realPath !== null && sameAsGlobal.has(info.realPath);
    const bytes = Buffer.byteLength(read.text, "utf8");
    set.files.push({ path, realPath: info.realPath, bytes, sameAsGlobal: same });
    set.bytes += bytes;
    const chars = countChars(read.text);
    set.chars.ascii += chars.ascii;
    set.chars.other += chars.other;
    if (!same) for (const hash of linesForOverlap(read.text)) hashes.add(hash);
    for (const [key, count] of Object.entries(countMentions(read.text, mentionTargets))) mentions[key] = (mentions[key] ?? 0) + count;
  }
  set.lineHashes = [...hashes].sort();
  return { set, mentions };
}

/** Claude Code의 전역 지침 파일: <홈>/CLAUDE.md와 <홈>/rules 아래의 .md(설계 10 「지침 파일의 범위」). */
export async function globalInstructionPaths(claudeHome: string): Promise<FoundFiles> {
  const rules = await markdownFilesUnder(join(claudeHome, "rules"));
  return { paths: [join(claudeHome, "CLAUDE.md"), ...rules.paths], unreadableDirs: rules.unreadableDirs };
}

/**
 * 프로젝트 뿌리의 지침 파일: CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md, .claude/rules 아래의 .md.
 * 앞의 셋이 하나도 없으면 Claude Code가 대신 읽는 AGENTS.md와 .claude/AGENTS.md를 넣는다(기본 설정, 설계 10 「지침 파일의 범위」).
 */
export async function projectInstructionPaths(root: string): Promise<FoundFiles> {
  const claudeFiles = [join(root, "CLAUDE.md"), join(root, ".claude", "CLAUDE.md"), join(root, "CLAUDE.local.md")];
  const present: string[] = [];
  for (const path of claudeFiles) if ((await entryInfo(path)).isFile) present.push(path);
  const rules = await markdownFilesUnder(join(root, ".claude", "rules"));
  const paths = present.length > 0 ? [...present, ...rules.paths] : [join(root, "AGENTS.md"), join(root, ".claude", "AGENTS.md"), ...rules.paths];
  return { paths, unreadableDirs: rules.unreadableDirs };
}

/** 전역 지침을 읽는다. 전역 지침에 목록의 프로젝트가 나온 횟수도 센다. */
export async function readGlobalInstructions(claudeHome: string, mentionTargets: readonly MentionTarget[]): Promise<{ set: InstructionSet; mentions: Record<string, number> }> {
  const found = await globalInstructionPaths(claudeHome);
  const read = await readInstructionSet(found.paths, mentionTargets);
  read.set.unreadableDirs = found.unreadableDirs;
  return read;
}

/** 프로젝트 지침을 읽는다. 전역 지침과 같은 파일은 표시하고 줄 지문에서만 뺀다. */
export async function readProjectInstructions(root: string, global: InstructionSet): Promise<InstructionSet> {
  const found = await projectInstructionPaths(root);
  const { set } = await readInstructionSet(found.paths, [], realPaths(global));
  set.unreadableDirs = found.unreadableDirs;
  return set;
}

/** 정규화한 실제 경로들의 집합(같은 파일인지 견줄 때 쓴다). */
export function realPaths(set: InstructionSet): Set<string> {
  return new Set(set.files.map((file) => file.realPath ?? normalizePath(file.path)));
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/instructions.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 10개. 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/instructions.ts test/scan/instructions.test.ts
git commit -m "feat: 지침 파일의 크기·글자·줄 지문 읽기 추가"
```

---

### Task 6: 설정 층과 관리 정책

**Files:**
- Create: `src/scan/json.ts`
- Create: `src/scan/settings.ts`
- Test: `test/scan/json.test.ts`
- Test: `test/scan/settings.test.ts`

**Interfaces:**
- Consumes: `readJson`, `listDir`(과제 3).
- Produces: `MAX_JSON_DEPTH = 64`, `isObject(value)`, `canonicalJson(value, depth?): string | null`(`src/scan/json.ts`), `type LayerStatus`, `interface SettingsLayer { parts: SettingsPart[]; value: Record<string, unknown> | null; hookSources: { path: string; hooks: unknown }[] }`, `managedSettingsDir(platform)`, `readLayer(path)`, `mergeSettings(base, next, depth?)`, `readManagedLayer(dir)`, `sanitizeManagedPart(value)`, `interface McpMatcher`, `type ModeFact = "bypass" | "other" | null`, `interface SettingsView`(`defaultMode: ModeFact`, `bypass`, `allow`, `deny`, `skillOverrides`, `enabledPlugins`, `deniedMcpServers`, `allowedMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`, `enableAllProjectMcpServers`, `hooks`, `disableAllHooks`, `allowManagedHooksOnly`), `viewOf(value)`, `unparsableParts(layer)`.

설계 10의 설정 층(사용자 `<홈>/settings.json` → 프로젝트 `.claude/settings.json` → 로컬 `.claude/settings.local.json`, 관리 정책이 맨 위)과 10 「관리 정책은 파일로 둔 것만 읽는다」를 구현한다.

- **관리 정책.** OS의 자리(Windows `C:\Program Files\ClaudeCode`, macOS `/Library/Application Support/ClaudeCode`, 그 밖 `/etc/claude-code`)의 `managed-settings.json`을 먼저, 그 옆 `managed-settings.d`의 숨기지 않은 `.json`을 이름 차례로 합친다. 합치기는 공식 문서의 규칙이다(값 하나는 뒤가 이기고, 목록은 합치고 중복을 빼고, 묶음은 열쇠마다 같은 규칙). 서버가 내려 주는 설정과 MDM은 읽지 않는다(한계).
- **목록 합치기.** 같은지는 열쇠를 세운 JSON(`canonicalJson`)으로 보고, 앞 목록 안·뒤 목록 안·둘 사이의 중복을 모두 뺀다. 훅처럼 객체가 든 목록도 열쇠 차례만 다르면 같은 항목이다. 앞에 없던 열쇠의 목록과 새 하위 묶음도 같은 규칙으로 정리한다.
- **원형 없는 결과.** 합친 결과는 원형이 없는 묶음이고 열쇠는 모두 자기 데이터 속성이다. 관리 정책 파일의 `__proto__` 같은 열쇠가 원형을 바꿔 `permissions` 같은 값을 꾸며 내지 못한다.
- **깊은 값(설계 20.1).** `canonicalJson`은 깊이 64를 넘으면 `null`이다. 재귀로 스택이 넘쳐 스캐너 전체가 멈추지 않게 하려는 것이다. 그런 목록 항목은 견주지 않고 그대로 넣는다. 묶음 합치기는 깊이 32에서 멈추고 뒤의 값을 통째로 쓴다. 시험은 깊이 20만의 값으로 던지지 않는 것을 본다(`JSON.stringify`도 이 깊이에서는 던지므로 대신 쓰지 않는다).
- **기본 모드.** 층마다 `permissions.defaultMode`가 `bypassPermissions`이면 `bypass`, 다른 글자면 `other`, 글자가 아니거나 없으면 그 층이 정하지 않은 것(`null`)이다. 관리 정책이 정하지 않은 것과 다른 모드로 정한 것을 가르려는 것이다(설계 11.3 S2 ㉡). `bypass`(참거짓)는 프로젝트 쪽 판정에 그대로 쓴다.
- **쓰는 열쇠만 뽑는다.** `permissions.defaultMode`(위의 세 값), `permissions.allow`·`deny`, `skillOverrides`, `enabledPlugins`, `deniedMcpServers`, 관리 정책의 `allowedMcpServers`, `.mcp.json` 승인 열쇠 셋, `hooks`, `disableAllHooks`, `allowManagedHooksOnly`다. 모양이 다른 값은 버린다. `skillOverrides`는 네 값(`on`, `name-only`, `user-invocable-only`, `off`)만 받고 그 밖은 그 층이 정하지 않은 것이다. `enableAllProjectMcpServers`는 그 층이 정하지 않았으면 `null`이다(층의 우선순위로 고르려는 것이다). `hooks`와 권한 규칙의 글은 메모리에서만 쓰고 셋팅 사실에 싣지 않는다(과제 7, 8, 12가 겉모양과 수만 만든다).
- **파일마다의 훅.** 합친 값과 따로, `hooks` 열쇠가 있는 파일마다 그 값을 파일 차례로 든다(`hookSources`). 도구는 훅을 출처(파일)마다 싣거나 버리므로(관리 정책은 틀린 항목만 버리기도 하고 그 출처의 `hooks`를 통째로 버리기도 한다. 공식 문서 errors 「Managed settings contain invalid entries」) 과제 12가 ㉠의 확인 훅과 훅 명령을 파일마다 센다.
- **관리 정책의 틀린 값.** 합치기 전에 파일마다 스캐너가 읽는 열쇠의 틀린 값을 도구의 규칙대로 고친다(`sanitizeManagedPart`, 공식 문서 managed-settings 「Find entries Claude Code dropped」·「Keys that fail closed」). `null`은 그 열쇠를 지운다. `disableAllHooks`는 틀리면(글자 참거짓도) 버린다. 엄한 값이 하나인 열쇠는 틀리면 그 엄한 값으로 읽고 글자 `"true"`·`"false"`는 그 참거짓으로 읽는다(`allowManagedHooksOnly`는 참, `enableAllProjectMcpServers`는 거짓. 두 열쇠가 이 규칙에 드는지는 추정이다). `permissions`는 칸마다 고치고 `defaultMode`가 틀리면 `default`로 읽는다. `deny`나 `ask`를 전혀 읽지 못하면 그 파일의 `allow`와 `additionalDirectories`를 보류한다. `allowedMcpServers`가 틀리면 빈 허용 목록이다. `enabledPlugins`와 `skillOverrides`는 틀린 항목을 버린다(`skillOverrides`는 네 값만 맞는 값이다). 고치지 않고 합치면 뒤 파일의 틀린 값이 앞 파일의 맞는 값을 덮는다. 파일마다 고친 뒤 합치는 차례는 문서에 없어 이 스캐너가 고른 것이다(설계 27). `hooks`가 `null`인 파일은 훅의 출처가 아니다.
- 풀렸지만 객체가 아닌 설정 파일(배열 등)은 풀리지 않는 파일로 본다.
- 시험은 OS의 관리 정책 폴더에 쓰지 않는다. `readManagedLayer`에 시험 폴더를 준다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/json.test.ts`:

```ts
// 설정·정의 JSON의 정규화를 시험한다. 열쇠 차례와 상관없이 같은 글, 목록 차례는 지킴, 깊이의 경계(설계 11.3 정의의 지문, 20.1)
import { describe, expect, it } from "vitest";
import { canonicalJson, isObject } from "../../src/scan/json.ts";

const nest = (n: number): unknown => JSON.parse(`${"[".repeat(n)}${"]".repeat(n)}`);

describe("canonicalJson", () => {
  it("열쇠의 차례와 상관없이 같은 내용은 같은 글이다. 목록의 차례는 지킨다", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe('{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}');
    expect(canonicalJson([2, 1])).toBe("[2,1]");
  });
  it("65겹까지는 정규화하고 더 깊으면 null이다. 아주 깊어도 던지지 않는다", () => {
    expect(canonicalJson(nest(65))).not.toBeNull();
    expect(canonicalJson(nest(66))).toBeNull();
    expect(canonicalJson(nest(200_000))).toBeNull();
  });
  it("isObject는 배열과 null을 객체로 보지 않는다", () => {
    expect([isObject({}), isObject([]), isObject(null), isObject("x")]).toEqual([true, false, false, false]);
  });
});
```

`test/scan/settings.test.ts`:

```ts
// 설정 층 읽기를 시험한다. 층의 상태, 관리 정책의 드롭인 합치기, 쓰는 열쇠만 뽑기(설계 10 「관리 정책은 파일로 둔 것만 읽는다」)
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { managedSettingsDir, mergeSettings, readLayer, readManagedLayer, sanitizeManagedPart, unparsableParts, viewOf } from "../../src/scan/settings.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

describe("readLayer", () => {
  it("없음, 풀리지 않음, 객체가 아님, 읽지 못함을 가른다", async () => {
    expect(await readLayer(join(root, "none.json"))).toEqual({ parts: [{ path: join(root, "none.json"), status: "missing" }], value: null, hookSources: [] });
    await put(join(root, "bad.json"), "{");
    expect((await readLayer(join(root, "bad.json"))).parts[0]!.status).toBe("unparsable");
    await put(join(root, "array.json"), "[1,2]");
    expect((await readLayer(join(root, "array.json"))).parts[0]!.status).toBe("unparsable");
    await mkdir(join(root, "dir.json"));
    expect((await readLayer(join(root, "dir.json"))).parts[0]!.status).toBe("unreadable");
    await put(join(root, "ok.json"), JSON.stringify({ model: "x" }));
    expect(await readLayer(join(root, "ok.json"))).toEqual({ parts: [{ path: join(root, "ok.json"), status: "ok" }], value: { model: "x" }, hookSources: [] });
  });
});

describe("관리 정책", () => {
  it("OS마다 공식 문서의 폴더다", () => {
    expect(managedSettingsDir("win32")).toBe("C:\\Program Files\\ClaudeCode");
    expect(managedSettingsDir("darwin")).toBe("/Library/Application Support/ClaudeCode");
    expect(managedSettingsDir("linux")).toBe("/etc/claude-code");
  });

  it("파일을 먼저, 드롭인을 이름 차례로 합친다. 숨긴 파일과 .json이 아닌 것은 뺀다", async () => {
    await put(join(root, "managed-settings.json"), JSON.stringify({ model: "a", permissions: { deny: ["Bash(rm *)"], defaultMode: "default" } }));
    await put(join(root, "managed-settings.d", "20-b.json"), JSON.stringify({ model: "c", permissions: { deny: ["Read(.env)", "Bash(rm *)"] } }));
    await put(join(root, "managed-settings.d", "10-a.json"), JSON.stringify({ model: "b", disableAllHooks: true }));
    await put(join(root, "managed-settings.d", ".hidden.json"), JSON.stringify({ model: "hidden" }));
    await put(join(root, "managed-settings.d", "notes.txt"), "x");
    const layer = await readManagedLayer(root);
    expect(layer.parts.map((p) => p.path)).toEqual([
      join(root, "managed-settings.json"),
      join(root, "managed-settings.d", "10-a.json"),
      join(root, "managed-settings.d", "20-b.json"),
    ]);
    expect(layer.value).toEqual({ model: "c", disableAllHooks: true, permissions: { deny: ["Bash(rm *)", "Read(.env)"], defaultMode: "default" } });
  });

  it("hooks는 합친 값과 따로 파일마다(그 열쇠가 있는 파일만, 파일 차례로) 들고 온다. 모양이 달라도 그대로 든다", async () => {
    await put(join(root, "managed-settings.json"), JSON.stringify({ hooks: { PreToolUse: [] } }));
    await put(join(root, "managed-settings.d", "10-a.json"), JSON.stringify({ model: "b" }));
    await put(join(root, "managed-settings.d", "20-b.json"), JSON.stringify({ hooks: "x" }));
    expect((await readManagedLayer(root)).hookSources).toEqual([
      { path: join(root, "managed-settings.json"), hooks: { PreToolUse: [] } },
      { path: join(root, "managed-settings.d", "20-b.json"), hooks: "x" },
    ]);
    await put(join(root, "user.json"), JSON.stringify({ hooks: null }));
    expect((await readLayer(join(root, "user.json"))).hookSources).toEqual([{ path: join(root, "user.json"), hooks: null }]);
  });

  it("관리 정책은 파일마다 틀린 값을 공식 문서의 규칙으로 고친 뒤 합친다. 뒤 파일의 틀린 값이 앞 파일의 맞는 값을 덮지 않는다", async () => {
    await put(join(root, "managed-settings.json"), JSON.stringify({ disableAllHooks: true, permissions: { defaultMode: "bypassPermissions", deny: ["Read(.env)"] }, enabledPlugins: { "a@m": true }, skillOverrides: { s: "off" }, enableAllProjectMcpServers: true }));
    await put(join(root, "managed-settings.d", "10-bad.json"), JSON.stringify({ disableAllHooks: "true", permissions: { defaultMode: 5, deny: "x" }, enabledPlugins: { "a@m": "yes", "b@m": true }, skillOverrides: { s: "offf", u: "", t: "on" }, allowManagedHooksOnly: "yes", enableAllProjectMcpServers: "maybe" }));
    const view = viewOf((await readManagedLayer(root)).value);
    // disableAllHooks는 틀리면(글자 참거짓도) 버린다. defaultMode가 틀리면 default로 읽는다. 엄한 값이 하나인 열쇠는 틀리면 그 엄한 값이다. 틀린 목록과 항목은 버린다
    expect(view).toMatchObject({ disableAllHooks: true, defaultMode: "other", bypass: false, deny: ["Read(.env)"], allowManagedHooksOnly: true, enableAllProjectMcpServers: false });
    expect({ ...view.enabledPlugins }).toEqual({ "a@m": true, "b@m": true });
    expect({ ...view.skillOverrides }).toEqual({ s: "off", t: "on" });
    // null은 그 열쇠를 지운다(엄한 값으로 읽지 않는다). 글자 "true"·"false"는 그 참거짓이다. hooks가 null인 파일은 훅 출처가 아니다
    await put(join(root, "managed-settings.d", "10-bad.json"), JSON.stringify({ allowManagedHooksOnly: null, disableAllHooks: null, enableAllProjectMcpServers: "true", hooks: null }));
    const second = await readManagedLayer(root);
    expect(viewOf(second.value)).toMatchObject({ allowManagedHooksOnly: false, disableAllHooks: true, enableAllProjectMcpServers: true });
    expect(second.hookSources).toEqual([]);
    await put(join(root, "managed-settings.d", "10-bad.json"), JSON.stringify({ allowManagedHooksOnly: "false" }));
    expect(viewOf((await readManagedLayer(root)).value).allowManagedHooksOnly).toBe(false);
    // deny나 ask를 전혀 읽지 못하면 같은 곳의 allow를 보류한다. 맞는 목록이나 null이면 그대로다
    expect(viewOf(sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], deny: "bad" } })).allow).toEqual([]);
    expect(viewOf(sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], ask: 3 } })).allow).toEqual([]);
    expect(viewOf(sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], deny: ["Read(.env)"] } })).allow).toEqual(["Bash(*)"]);
    expect(viewOf(sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], deny: null } })).allow).toEqual(["Bash(*)"]);
    // 허용 목록이 틀리면 빈 허용 목록이다(사용자가 더한 서버를 모두 막는다)
    await rm(join(root, "managed-settings.d"), { recursive: true, force: true });
    await put(join(root, "managed-settings.json"), JSON.stringify({ allowedMcpServers: "x" }));
    expect(viewOf((await readManagedLayer(root)).value).allowedMcpServers).toEqual([]);
  });

  it("관리 정책이 없으면 파일도 값도 없다. 풀리지 않는 드롭인은 따로 알린다", async () => {
    expect(await readManagedLayer(join(root, "none"))).toEqual({ parts: [], value: null, hookSources: [] });
    await put(join(root, "m", "managed-settings.d", "a.json"), "{oops");
    const layer = await readManagedLayer(join(root, "m"));
    expect(unparsableParts(layer)).toEqual([join(root, "m", "managed-settings.d", "a.json")]);
    expect(layer.value).toBeNull();
  });

  it("합치기: 값 하나는 뒤가 이기고, 목록은 중복 없이 합치고, 묶음은 열쇠마다 합친다", () => {
    expect(mergeSettings({ a: 1, list: [1, 2], env: { X: "1", Y: "1" } }, { a: 2, list: [2, 3], env: { Y: "2" } })).toEqual({
      a: 2,
      list: [1, 2, 3],
      env: { X: "1", Y: "2" },
    });
  });

  it("합치기: 앞 목록 안, 뒤 목록 안, 둘 사이의 중복을 모두 빼고, 같은지는 열쇠를 세운 JSON으로 본다", () => {
    expect(mergeSettings({ list: ["a", "a"] }, { list: ["b", "b", "a"] })).toEqual({ list: ["a", "b"] });
    expect(mergeSettings({ hooks: [{ x: 1, y: 2 }] }, { hooks: [{ y: 2, x: 1 }] })).toEqual({ hooks: [{ x: 1, y: 2 }] });
  });

  it("합치기: 앞에 없던 열쇠의 목록과 새 하위 묶음 안의 목록도 중복을 뺀다", () => {
    expect(mergeSettings({}, { list: ["a", "a"] })).toEqual({ list: ["a"] });
    const hook = { matcher: "Bash", hooks: [{ type: "command", command: "x" }] };
    expect(mergeSettings({}, { hooks: { PreToolUse: [hook, { ...hook }] } })).toEqual({ hooks: { PreToolUse: [hook] } });
  });

  it("합치기 결과는 원형이 없는 묶음이다. __proto__·constructor·prototype 열쇠가 설정 값을 만들지 않는다", () => {
    const merged = mergeSettings({}, JSON.parse('{"__proto__":{"permissions":{"defaultMode":"bypassPermissions"}},"constructor":{"x":1},"prototype":{"y":2}}') as Record<string, unknown>);
    expect(Object.hasOwn(merged, "permissions")).toBe(false);
    expect(viewOf(merged).defaultMode).toBeNull();
  });

  it("관리 정책 파일의 __proto__ 열쇠는 기본 모드를 만들지 않는다", async () => {
    const dir = join(root, "managed");
    await put(join(dir, "managed-settings.json"), '{"__proto__":{"permissions":{"defaultMode":"bypassPermissions"}}}');
    expect(viewOf((await readManagedLayer(dir)).value).defaultMode).toBeNull();
  });

  it("합치기: 아주 깊게 중첩된 목록 항목과 묶음에도 던지지 않는다. 겹침을 볼 수 없는 항목은 그대로 넣는다", () => {
    const deepList = JSON.parse(`${"[".repeat(200_000)}${"]".repeat(200_000)}`) as unknown;
    const deepObject = JSON.parse(`${'{"a":'.repeat(200_000)}1${"}".repeat(200_000)}`) as Record<string, unknown>;
    const merged = mergeSettings({ list: [deepList], env: deepObject }, { list: [deepList, "x"], env: deepObject });
    expect(merged.list).toHaveLength(3);
    expect((merged.list as unknown[])[2]).toBe("x");
    // 묶음은 깊은 곳에서 합치기를 멈추고 뒤의 값을 쓴다. 내용은 끝까지 남는다(재귀 없이 따라가 본다)
    let node: unknown = merged.env;
    let depth = 0;
    while (typeof node === "object" && node !== null && "a" in node) {
      node = (node as { a: unknown }).a;
      depth += 1;
    }
    expect(depth).toBe(200_000);
    expect(node).toBe(1);
  });
});

describe("viewOf", () => {
  it("쓰는 열쇠만 뽑고 모양이 다른 값은 버린다", () => {
    const view = viewOf({
      permissions: { defaultMode: "bypassPermissions", allow: ["Bash(git *)", 3], deny: "nope" },
      skillOverrides: { a: "off", b: 1, c: "offf", d: "", e: "name-only" },
      enabledPlugins: { "p@m": true, "q@m": "yes" },
      deniedMcpServers: [{ serverName: "x" }, { serverUrl: "https://e.example/*" }, { serverCommand: ["npx", "srv"] }, { other: 1 }, "bad"],
      allowedMcpServers: [],
      enabledMcpjsonServers: ["s"],
      enableAllProjectMcpServers: true,
      disableAllHooks: true,
      allowManagedHooksOnly: "true",
    });
    expect(view).toMatchObject({
      bypass: true,
      allow: ["Bash(git *)"],
      deny: [],
      skillOverrides: { a: "off", e: "name-only" },
      enabledPlugins: { "p@m": true },
      deniedMcpServers: [{ serverName: "x" }, { serverUrl: "https://e.example/*" }, { serverCommand: ["npx", "srv"] }],
      allowedMcpServers: [],
      enabledMcpjsonServers: ["s"],
      enableAllProjectMcpServers: true,
      disableAllHooks: true,
      allowManagedHooksOnly: false,
    });
    expect({ ...view.skillOverrides }).toEqual({ a: "off", e: "name-only" });
    // 정하지 않은 일괄 승인은 null이다(맞는 참거짓만 정한 것이다)
    expect(viewOf(null)).toMatchObject({ bypass: false, allowedMcpServers: null, skillOverrides: {}, enableAllProjectMcpServers: null });
    expect(viewOf({ enableAllProjectMcpServers: false }).enableAllProjectMcpServers).toBe(false);
    expect(viewOf({ enableAllProjectMcpServers: "true" }).enableAllProjectMcpServers).toBeNull();
  });

  it("권한 우회가 아닌 기본 모드는 모두 권한 우회가 아니다", () => {
    for (const mode of ["default", "acceptEdits", "plan", "auto", undefined]) expect(viewOf({ permissions: { defaultMode: mode } }).bypass).toBe(false);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/json.test.ts test/scan/settings.test.ts`
Expected: FAIL. `../../src/scan/json.ts`와 `../../src/scan/settings.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/json.ts`:

```ts
// 설정·정의 JSON을 다루는 순수 도구. 열쇠를 차례대로 세운 글(같은 내용이면 같은 글)을 만들고, 너무 깊게 중첩된 값은 읽지 못한 것으로 돌려준다(설계 11.3 정의의 지문, 20.1)

/** 이보다 깊게 중첩된 값은 정규화하지 않는다. 깊은 재귀로 스캐너 전체가 멈추지 않게 하려는 것이다. */
export const MAX_JSON_DEPTH = 64;

type Json = Record<string, unknown>;
export const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** 열쇠를 차례대로 세운 JSON 글. 같은 내용이면 열쇠의 차례와 상관없이 같은 글이다. 깊이가 MAX_JSON_DEPTH를 넘으면 null이다. */
export function canonicalJson(value: unknown, depth = 0): string | null {
  if (depth > MAX_JSON_DEPTH) return null;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const part = canonicalJson(item, depth + 1);
      if (part === null) return null;
      parts.push(part);
    }
    return `[${parts.join(",")}]`;
  }
  if (isObject(value)) {
    const parts: string[] = [];
    for (const key of Object.keys(value).sort()) {
      const part = canonicalJson(value[key], depth + 1);
      if (part === null) return null;
      parts.push(`${JSON.stringify(key)}:${part}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
```

`src/scan/settings.ts`:

```ts
// Claude Code 설정 층(사용자, 프로젝트, 로컬, 관리 정책)을 읽고 스캐너가 쓰는 열쇠만 뽑는다. 관리 정책은 파일과 드롭인 폴더만 읽는다(설계 10 「관리 정책은 파일로 둔 것만 읽는다」)
import { join } from "node:path";
import { listDir, readJson } from "./fs.ts";
import { canonicalJson, isObject } from "./json.ts";

export type LayerStatus = "ok" | "missing" | "unparsable" | "unreadable";

export interface SettingsPart {
  path: string;
  status: LayerStatus;
}

export interface SettingsLayer {
  /** 이 층을 이룬 파일들. 관리 정책은 managed-settings.json 다음에 드롭인 파일이 이름 차례로 온다 */
  parts: SettingsPart[];
  /** 합친 값. 읽은 파일이 하나도 없으면 null */
  value: Record<string, unknown> | null;
  /**
   * 파일마다의 hooks 값(그 열쇠가 있는 파일만, 층의 파일 차례). 도구는 훅을 출처(파일)마다 싣거나 버리므로 합친 값과 따로 둔다
   * (공식 문서 errors 「Managed settings contain invalid entries」, 설계 11.3). 메모리에서만 쓰고 결과에 싣지 않는다
   */
  hookSources: { path: string; hooks: unknown }[];
}

type Json = Record<string, unknown>;

/** 묶음을 열쇠마다 합치는 깊이의 상한. 그보다 깊으면 뒤의 값을 통째로 쓴다(깊은 재귀로 멈추지 않게) */
const MERGE_MAX_DEPTH = 32;

/** 관리 정책 파일이 놓이는 폴더(공식 문서 managed-settings, 설계 10). */
export function managedSettingsDir(platform: NodeJS.Platform): string {
  if (platform === "win32") return "C:\\Program Files\\ClaudeCode";
  if (platform === "darwin") return "/Library/Application Support/ClaudeCode";
  return "/etc/claude-code";
}

async function readPart(path: string): Promise<{ part: SettingsPart; value: Json | null }> {
  const read = await readJson(path);
  if (read.status !== "ok") return { part: { path, status: read.status }, value: null };
  if (!isObject(read.value)) return { part: { path, status: "unparsable" }, value: null };
  return { part: { path, status: "ok" }, value: read.value };
}

/** 설정 파일 하나로 된 층(사용자, 프로젝트, 로컬). */
export async function readLayer(path: string): Promise<SettingsLayer> {
  const { part, value } = await readPart(path);
  return { parts: [part], value, hookSources: value !== null && Object.hasOwn(value, "hooks") ? [{ path, hooks: value.hooks }] : [] };
}

/** 두 목록을 차례대로 합치고 중복을 뺀다. 같은지는 열쇠를 세운 JSON으로 본다(앞 목록 안, 뒤 목록 안, 둘 사이 모두). 너무 깊어 정규화하지 못한 항목은 견주지 않고 그대로 넣는다 */
function unionList(before: readonly unknown[], next: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of [...before, ...next]) {
    const key = canonicalJson(item);
    if (key === null) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * 드롭인 합치기 규칙(공식 문서): 값 하나는 뒤가 이기고, 목록은 합치고 중복을 빼며, 묶음은 열쇠마다 같은 규칙을 따른다.
 * 앞에 없던 열쇠의 목록과 새 하위 묶음도 같은 규칙으로 정리한다. 결과는 원형이 없는 묶음이고 열쇠는 모두 자기 데이터 속성이라,
 * __proto__ 같은 열쇠가 원형을 바꿔 다른 열쇠를 꾸며 내지 못한다.
 */
export function mergeSettings(base: Json, next: Json, depth = 0): Json {
  const out: Json = Object.create(null) as Json;
  for (const key of Object.keys(base)) out[key] = base[key];
  for (const [key, value] of Object.entries(next)) {
    const before = Object.hasOwn(out, key) ? out[key] : undefined;
    if (Array.isArray(value)) {
      out[key] = unionList(Array.isArray(before) ? before : [], value);
    } else if (isObject(value) && depth < MERGE_MAX_DEPTH) {
      out[key] = mergeSettings(isObject(before) ? before : {}, value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** 엄한 값이 하나인 참거짓 열쇠가 틀린 꼴일 때 읽는 값. "true"·"false" 글자는 그 참거짓이고, 그 밖은 엄한 값이다(공식 문서 managed-settings 「Keys that fail closed」) */
function failClosedBoolean(value: unknown, restrictive: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return restrictive;
}

/** skillOverrides의 값. 이 밖의 값은 정하지 않은 것으로 본다(공식 문서 settings-reference 「skillOverrides」) */
const SKILL_OVERRIDE_MODES = new Set(["on", "name-only", "user-invocable-only", "off"]);
const PERMISSION_LISTS = new Set(["allow", "deny", "ask"]);
/** 곁의 제한 목록(deny·ask)을 전혀 읽지 못하면 보류하는 허용 칸(공식 문서 managed-settings 「Keys that fail closed」) */
const PERMISSION_GRANTS = ["allow", "additionalDirectories"];
const MANAGED_LISTS = new Set(["deniedMcpServers", "enabledMcpjsonServers", "disabledMcpjsonServers"]);

/**
 * 관리 정책 파일 하나에서 스캐너가 읽는 열쇠의 틀린 값을 도구처럼 고친다. 도구는 관리 정책의 틀린 값을 버리거나 엄한 값으로 읽고 나머지를 지킨다
 * (공식 문서 managed-settings 「Find entries Claude Code dropped」). 고치지 않고 합치면 뒤 파일의 틀린 값이 앞 파일의 맞는 값을 덮는다.
 * null은 그 열쇠를 지운다. disableAllHooks는 틀리면(글자 참거짓도) 버리고, allowManagedHooksOnly(엄한 값 참)와 enableAllProjectMcpServers(엄한 값 거짓)는 틀리면 엄한 값이다.
 * permissions는 칸마다 고치고 defaultMode가 틀리면 default로 읽는다. allowedMcpServers가 틀리면 빈 허용 목록이다. enabledPlugins와 skillOverrides는 틀린 항목을 버리고, 다 틀리면 열쇠를 버린다.
 * 파일마다 고친 뒤 합치는 차례는 이 스캐너가 고른 것이다(문서는 차례를 적지 않았다, 설계 27)
 */
export function sanitizeManagedPart(value: Json): Json {
  const out: Json = Object.create(null) as Json;
  for (const [key, v] of Object.entries(value)) {
    if (v === null) continue;
    if (key === "disableAllHooks") {
      if (typeof v === "boolean") out[key] = v;
    } else if (key === "allowManagedHooksOnly") {
      out[key] = failClosedBoolean(v, true);
    } else if (key === "enableAllProjectMcpServers") {
      out[key] = failClosedBoolean(v, false);
    } else if (key === "permissions") {
      if (!isObject(v)) continue;
      const permissions: Json = Object.create(null) as Json;
      for (const [field, fv] of Object.entries(v)) {
        if (fv === null) continue;
        if (field === "defaultMode") permissions[field] = typeof fv === "string" ? fv : "default";
        else if (!PERMISSION_LISTS.has(field) || Array.isArray(fv)) permissions[field] = fv;
      }
      // deny나 ask를 전혀 읽지 못하면 allow와 additionalDirectories를 보류한다. 곁에 적힌 제한 없이 허용만 듣지 않게 하려는 도구의 규칙이다
      if (["deny", "ask"].some((field) => Object.hasOwn(v, field) && v[field] !== null && !Array.isArray(v[field]))) for (const grant of PERMISSION_GRANTS) delete permissions[grant];
      out[key] = permissions;
    } else if (key === "allowedMcpServers") {
      out[key] = Array.isArray(v) ? v : [];
    } else if (MANAGED_LISTS.has(key)) {
      if (Array.isArray(v)) out[key] = v;
    } else if (key === "enabledPlugins" || key === "skillOverrides") {
      if (!isObject(v)) continue;
      const kept = Object.entries(v).filter(([, entry]) => (key === "enabledPlugins" ? typeof entry === "boolean" : typeof entry === "string" && SKILL_OVERRIDE_MODES.has(entry)));
      if (kept.length > 0) out[key] = Object.fromEntries(kept);
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** 관리 정책 층. managed-settings.json을 먼저, 그 옆 managed-settings.d의 숨기지 않은 .json을 이름 차례로 합친다. 파일마다 틀린 값을 고친 뒤 합친다 */
export async function readManagedLayer(dir: string): Promise<SettingsLayer> {
  const parts: SettingsPart[] = [];
  const hookSources: SettingsLayer["hookSources"] = [];
  let merged: Json | null = null;
  const take = async (path: string): Promise<void> => {
    const { part, value } = await readPart(path);
    if (part.status === "missing") return;
    parts.push(part);
    if (value !== null) merged = mergeSettings(merged ?? {}, sanitizeManagedPart(value));
    // null은 그 열쇠를 지우므로 그 파일은 훅의 출처가 아니다
    if (value !== null && Object.hasOwn(value, "hooks") && value.hooks !== null) hookSources.push({ path, hooks: value.hooks });
  };
  await take(join(dir, "managed-settings.json"));
  const dropIns = await listDir(join(dir, "managed-settings.d"));
  if (dropIns.status === "ok") {
    for (const name of dropIns.names) if (!name.startsWith(".") && name.toLowerCase().endsWith(".json")) await take(join(dir, "managed-settings.d", name));
  } else if (dropIns.status === "unreadable") {
    parts.push({ path: join(dir, "managed-settings.d"), status: "unreadable" });
  }
  return { parts, value: merged, hookSources };
}

export interface McpMatcher {
  serverName?: string;
  serverUrl?: string;
  serverCommand?: string[];
}

/** 기본 모드의 값. 권한 우회(bypassPermissions)인지, 그 밖의 값인지, 이 층이 정하지 않았는지(null)다 */
export type ModeFact = "bypass" | "other" | null;

/** 스캐너가 쓰는 열쇠만 뽑은 설정. hooks는 메모리에서만 쓰고 결과에 싣지 않는다. */
export interface SettingsView {
  /** permissions.defaultMode. 문자열이 아니면 정하지 않은 것(null)으로 본다 */
  defaultMode: ModeFact;
  bypass: boolean;
  allow: string[];
  deny: string[];
  skillOverrides: Record<string, string>;
  enabledPlugins: Record<string, boolean>;
  deniedMcpServers: McpMatcher[];
  /** 관리 정책의 허용 목록. 없으면 null(제한 없음) */
  allowedMcpServers: McpMatcher[] | null;
  enabledMcpjsonServers: string[];
  disabledMcpjsonServers: string[];
  /** 프로젝트 .mcp.json의 서버를 모두 승인하는지. 이 층이 정하지 않았으면 null이다(층의 우선순위로 고르려고 정하지 않은 것과 거짓을 가른다) */
  enableAllProjectMcpServers: boolean | null;
  hooks: unknown;
  disableAllHooks: boolean;
  allowManagedHooksOnly: boolean;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function matchers(v: unknown): McpMatcher[] {
  if (!Array.isArray(v)) return [];
  const out: McpMatcher[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const m: McpMatcher = {};
    if (typeof item.serverName === "string") m.serverName = item.serverName;
    if (typeof item.serverUrl === "string") m.serverUrl = item.serverUrl;
    if (Array.isArray(item.serverCommand) && item.serverCommand.every((x) => typeof x === "string")) m.serverCommand = [...(item.serverCommand as string[])];
    if (Object.keys(m).length > 0) out.push(m);
  }
  return out;
}

export function viewOf(value: Record<string, unknown> | null): SettingsView {
  const v = value ?? {};
  const permissions = isObject(v.permissions) ? v.permissions : {};
  const overrides: Record<string, string> = Object.create(null) as Record<string, string>;
  if (isObject(v.skillOverrides)) for (const [name, mode] of Object.entries(v.skillOverrides)) if (typeof mode === "string" && SKILL_OVERRIDE_MODES.has(mode)) overrides[name] = mode;
  const plugins: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
  if (isObject(v.enabledPlugins)) for (const [id, on] of Object.entries(v.enabledPlugins)) if (typeof on === "boolean") plugins[id] = on;
  const mode = permissions.defaultMode;
  const defaultMode: ModeFact = typeof mode !== "string" ? null : mode === "bypassPermissions" ? "bypass" : "other";
  return {
    defaultMode,
    bypass: defaultMode === "bypass",
    allow: strings(permissions.allow),
    deny: strings(permissions.deny),
    skillOverrides: overrides,
    enabledPlugins: plugins,
    deniedMcpServers: matchers(v.deniedMcpServers),
    allowedMcpServers: Array.isArray(v.allowedMcpServers) ? matchers(v.allowedMcpServers) : null,
    enabledMcpjsonServers: strings(v.enabledMcpjsonServers),
    disabledMcpjsonServers: strings(v.disabledMcpjsonServers),
    enableAllProjectMcpServers: typeof v.enableAllProjectMcpServers === "boolean" ? v.enableAllProjectMcpServers : null,
    hooks: v.hooks,
    disableAllHooks: v.disableAllHooks === true,
    allowManagedHooksOnly: v.allowManagedHooksOnly === true,
  };
}

/** 층의 파일 가운데 풀리지 않은 것(S3). 읽지 못한 것은 넣지 않는다(읽지 못한 것은 깨졌다고 할 수 없다). */
export function unparsableParts(layer: SettingsLayer): string[] {
  return layer.parts.filter((part) => part.status === "unparsable").map((part) => part.path);
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/json.test.ts test/scan/settings.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 파일 2개, 시험 17개(json 3, settings 14). 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/json.ts src/scan/settings.ts test/scan/json.test.ts test/scan/settings.test.ts
git commit -m "feat: Claude Code 설정 층과 관리 정책 읽기 추가"
```

---

### Task 7: 도구 실행 전 확인 훅의 겉모양

**Files:**
- Create: `src/scan/hooks.ts`
- Test: `test/scan/hooks.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces: `SHELL_TOOLS = ["Bash", "PowerShell"]`, `type HookSource = "managed" | "managed-plugin" | "user" | "user-plugin"`, `interface ShellGuard { source; pluginId; coversShell; canBlock }`, `matcherMatches(matcher, tool)`, `ifTool(rule)`, `coversShell(matcher, rule)`, `isHandler(handler)`, `hookMapValid(events)`, `hookFileEvents(file): Json | null`, `inlineHookEvents(inline): Json | null`, `preToolUseGuards(events, source, pluginId): ShellGuard[]`, `hookCommandTexts(events): string[]`.

설계 11.3 S2의 "셸 명령을 덮는 도구 실행 전 확인 훅"을 겉으로 확인할 수 있는 조건으로 가른다. 훅을 제한하는 설정(`disableAllHooks`, `allowManagedHooksOnly`)을 출처마다 적용하는 일은 2부의 S2가 한다. 이 과제는 처리기마다 출처, 셸 명령 도구에 걸리는지, 실행을 막을 수 있는지만 낸다.

- **매처.** 없거나 빈 문자열이거나 `*`이면 모두에 맞는다. 글자·숫자·`_`·`-`·공백·`,`·`|`만 있으면 `|`나 `,`로 나눈 이름과 글자 그대로 견준다. 그 밖은 정규식이고 풀리지 않으면 맞지 않는다.
- **if.** 권한 규칙 하나에서 도구 이름만 읽는다(인자 부분은 보지 않는다). 읽지 못하면 그 처리기는 셸 명령을 덮지 않는다(설계 20.1).
- **셸 명령을 덮는가.** 매처와 if를 함께 통과하는 셸 명령 도구(`Bash`, `PowerShell`)가 하나라도 있으면 덮는다.
- **막을 수 있는가.** `async`와 `asyncRewake`를 둘 다 켜지 않았으면 막을 수 있다.
- **처리기.** `type`이 공식 문서의 다섯 종류(`command`, `http`, `mcp_tool`, `prompt`, `agent`) 가운데 하나이고 그 종류의 필수 값(`command`는 `command`, `http`는 `url`, `mcp_tool`은 `server`와 `tool`, `prompt`와 `agent`는 `prompt`)이 빈 글자가 아닌 글자여야 처리기다(`isHandler`). `preToolUseGuards`는 처리기가 아닌 것을 빼고 센다. 과제 12는 설정 파일의 훅을 `hookMapValid`로 먼저 보고, 맞지 않는 파일은 통째로 세지 않는다(설계 11.3 ㉠의 「등록돼 있다」).
- **훅 파일과 인라인.** 훅 파일은 맨 위 `hooks` 감싸개 안에 사건 묶음을 두고(`hookFileEvents`), 매니페스트와 마켓 항목의 인라인은 사건 묶음 그대로다(`inlineHookEvents`). 뼈대(사건마다 매처 묶음의 목록, 묶음마다 `hooks` 목록, 그 안이 모두 처리기)가 맞지 않으면 null이다. 도구가 그 파일이나 묶음을 통째로 싣지 않기 때문이다(공식 문서 plugins-reference 「hooks」, plugins troubleshooting 「Hooks fail to load」, 설계 10). 뼈대 밖의 형식(값의 종류, 사건 이름)은 보지 않는다(설계 27).
- **명령의 글.** `hookCommandTexts`는 처리기의 `command`와 `args`를 모은다. 스킬 경로가 나오는지 보는 데에만 쓰고 버린다(과제 12, 설계 11.3 E5 ⑤). 처리기 판정은 거치지 않는다. 내용을 넣어 줄 수 있는 명령을 넓게 보아야 "안 쓴 것이 확인됨"을 잘못 내지 않는다.
- 시험은 설계 21.1의 매처·if·async 반례를 그대로 넣는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/hooks.test.ts`:

```ts
// 도구 실행 전 확인 훅의 겉모양 판정을 시험한다. 설계 21.1의 매처·if·async 반례를 그대로 넣는다(설계 11.3 S2)
import { describe, expect, it } from "vitest";
import { coversShell, hookCommandTexts, hookFileEvents, ifTool, inlineHookEvents, matcherMatches, preToolUseGuards } from "../../src/scan/hooks.ts";

describe("매처", () => {
  it("Bash|PowerShell, ^(Bash|PowerShell)$, 매처 없음은 셋 다 셸 명령 도구에 맞는다", () => {
    for (const matcher of ["Bash|PowerShell", "^(Bash|PowerShell)$", undefined, "", "*"]) {
      expect(matcherMatches(matcher, "Bash")).toBe(true);
      expect(matcherMatches(matcher, "PowerShell")).toBe(true);
    }
  });
  it("mcp__.*와 풀리지 않는 정규식은 맞지 않는다", () => {
    expect(matcherMatches("mcp__.*", "Bash")).toBe(false);
    expect(matcherMatches("(Bash", "Bash")).toBe(false);
  });
  it("이름 목록은 글자 그대로 견준다. 쉼표도 나눈다", () => {
    expect(matcherMatches("Edit, Bash", "Bash")).toBe(true);
    expect(matcherMatches("Bashful", "Bash")).toBe(false);
    expect(matcherMatches(3, "Bash")).toBe(false);
  });
});

describe("if", () => {
  it("권한 규칙 하나에서 도구 이름만 읽는다", () => {
    expect(ifTool(undefined)).toBeNull();
    expect(ifTool("Bash(git push *)")).toBe("Bash");
    expect(ifTool("PowerShell")).toBe("PowerShell");
    expect(ifTool("Bash(unclosed")).toBe("unreadable");
    expect(ifTool(7)).toBe("unreadable");
  });
});

describe("셸 명령을 덮는가", () => {
  it("매처는 *인데 if가 파일 고치기 도구를 가리키면 덮지 않는다", () => {
    expect(coversShell("*", "Edit(src/**)")).toBe(false);
  });
  it("매처가 Bash이고 if가 PowerShell이면(반대도) 덮지 않는다", () => {
    expect(coversShell("Bash", "PowerShell(Remove-Item *)")).toBe(false);
    expect(coversShell("PowerShell", "Bash(rm *)")).toBe(false);
  });
  it("매처가 Bash이고 if도 Bash면 덮는다. 매처가 Bash|PowerShell이고 if가 Bash여도 덮는다", () => {
    expect(coversShell("Bash", "Bash(rm *)")).toBe(true);
    expect(coversShell("Bash|PowerShell", "Bash(rm *)")).toBe(true);
  });
  it("if를 권한 규칙으로 읽지 못하면 덮지 않는다", () => {
    expect(coversShell("Bash", "Bash(rm")).toBe(false);
  });
});

describe("preToolUseGuards", () => {
  const events = {
    PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command: "guard.sh" }, { type: "command", command: "log.sh", async: true }] },
      { matcher: "Write|Edit", hooks: [{ type: "command", command: "fmt.sh" }] },
      { hooks: [{ type: "command", command: "x", asyncRewake: true }] },
      "bad",
    ],
    PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "after.sh" }] }],
  };
  it("PreToolUse 처리기마다 덮는지와 막을 수 있는지를 낸다. 명령은 싣지 않는다", () => {
    const guards = preToolUseGuards(events, "user", null);
    expect(guards).toEqual([
      { source: "user", pluginId: null, coversShell: true, canBlock: true },
      { source: "user", pluginId: null, coversShell: true, canBlock: false },
      { source: "user", pluginId: null, coversShell: false, canBlock: true },
      { source: "user", pluginId: null, coversShell: true, canBlock: false },
    ]);
    expect(JSON.stringify(guards)).not.toContain("guard.sh");
  });
  it("모양이 다른 설정은 처리기가 없는 것이다", () => {
    expect(preToolUseGuards(undefined, "managed", null)).toEqual([]);
    expect(preToolUseGuards({ PreToolUse: "x" }, "managed", null)).toEqual([]);
  });
  it("처리기는 공식 문서의 다섯 종류 가운데 하나이고 그 종류의 필수 값이 있어야 한다. 아니면 확인 훅으로 보지 않는다", () => {
    const at = (handler: unknown) => preToolUseGuards({ PreToolUse: [{ matcher: "Bash", hooks: [handler] }] }, "user", null);
    const bad = [{}, { type: "unknown", command: "x" }, { type: "command" }, { type: "command", command: "" }, { type: "http" }, { type: "mcp_tool", server: "s" }, { type: "prompt" }, { type: "agent", prompt: 3 }];
    for (const handler of bad) expect(at(handler)).toEqual([]);
    const good = [{ type: "command", command: "x" }, { type: "http", url: "http://localhost/hook" }, { type: "mcp_tool", server: "s", tool: "t" }, { type: "prompt", prompt: "p" }, { type: "agent", prompt: "p" }];
    for (const handler of good) expect(at(handler)).toEqual([{ source: "user", pluginId: null, coversShell: true, canBlock: true }]);
  });
  it("훅 파일은 맨 위 hooks 감싸개 안에 사건 묶음을 둔다. 감싸개가 없거나 뼈대가 형식에 맞지 않으면 파일째 읽히지 않는다", () => {
    const valid = { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }], SessionStart: [] };
    expect(hookFileEvents({ description: "d", hooks: valid })).toBe(valid);
    expect(preToolUseGuards(hookFileEvents({ hooks: valid }), "user-plugin", "p@m")).toHaveLength(1);
    expect(hookFileEvents({ hooks: {} })).toEqual({});
    const broken = [valid, {}, "x", { hooks: [] }, { hooks: { PreToolUse: "x" } }, { hooks: { PreToolUse: ["bad"] } }, { hooks: { PreToolUse: [{ matcher: "Bash" }] } }, { hooks: { SessionStart: [{ hooks: [{ type: "command" }] }] } }];
    for (const file of broken) expect(hookFileEvents(file)).toBeNull();
  });
  it("인라인 훅은 감싸개 없이 사건 묶음 그대로다. 감싸개를 씌웠거나 뼈대가 형식에 맞지 않으면 읽히지 않는다", () => {
    const valid = { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] };
    expect(inlineHookEvents(valid)).toBe(valid);
    for (const inline of [{ hooks: valid }, "x", [], { PreToolUse: [{ hooks: [{}] }] }]) expect(inlineHookEvents(inline)).toBeNull();
  });
  it("모든 사건의 명령 글을 모은다", () => {
    expect(hookCommandTexts({ SessionStart: [{ hooks: [{ command: "node", args: ["a.mjs", "--x"] }] }] })).toEqual(["node a.mjs --x"]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/hooks.test.ts`
Expected: FAIL. `../../src/scan/hooks.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/hooks.ts`:

```ts
// 훅 설정에서 도구 실행 전 확인 훅의 겉모양(셸 명령 도구에 걸리는지, 실행을 막을 수 있는지)만 본다. 명령과 권한 규칙의 글은 메모리에서만 쓰고 싣지 않는다(설계 11.3 S2, E5 ⑤)
export const SHELL_TOOLS = ["Bash", "PowerShell"] as const;

/** ㉠의 훅을 찾는 네 출처(설계 11.3). 프로젝트 설정·로컬 설정·스킬과 에이전트의 머리말에 적은 훅은 넣지 않는다 */
export type HookSource = "managed" | "managed-plugin" | "user" | "user-plugin";

export interface ShellGuard {
  source: HookSource;
  /** 플러그인의 훅이면 '<이름>@<마켓>' */
  pluginId: string | null;
  /** 매처와 if를 함께 통과하는 셸 명령 도구가 있다 */
  coversShell: boolean;
  /** 기다렸다가 받는 방식이다(async와 asyncRewake를 둘 다 켜지 않았다) */
  canBlock: boolean;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** 공식 문서의 매처 규약. 없거나 빈 문자열이나 *이면 모두에 맞고, 이름 글자만 있으면 |나 ,로 나눈 이름과 글자 그대로 견주며, 그 밖은 정규식이다. 풀리지 않는 정규식은 맞지 않는다. */
export function matcherMatches(matcher: unknown, tool: string): boolean {
  if (matcher === undefined || matcher === null || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  if (/^[A-Za-z0-9_\- ,|]+$/.test(matcher)) {
    return matcher
      .split(/[|,]/)
      .map((name) => name.trim())
      .includes(tool);
  }
  try {
    return new RegExp(matcher).test(tool);
  } catch {
    return false;
  }
}

/** 처리기의 if(권한 규칙 하나)가 가리키는 도구. if가 없으면 null, 권한 규칙으로 읽지 못하면 "unreadable"이다. 인자 부분은 보지 않는다. */
export function ifTool(rule: unknown): string | null | "unreadable" {
  if (rule === undefined) return null;
  if (typeof rule !== "string") return "unreadable";
  const match = /^\s*([A-Za-z0-9_]+)\s*(?:\(.*\))?\s*$/s.exec(rule);
  return match === null ? "unreadable" : match[1]!;
}

export function coversShell(matcher: unknown, rule: unknown): boolean {
  const tool = ifTool(rule);
  if (tool === "unreadable") return false;
  return SHELL_TOOLS.some((shell) => matcherMatches(matcher, shell) && (tool === null || tool === shell));
}

/** 공식 문서의 처리기 종류와 종류마다 꼭 있어야 하는 값(hooks 문서의 처리기 필드). type이 없거나 이 밖이면 처리기가 아니다 */
const REQUIRED_FIELDS = new Map<string, readonly string[]>([
  ["command", ["command"]],
  ["http", ["url"]],
  ["mcp_tool", ["server", "tool"]],
  ["prompt", ["prompt"]],
  ["agent", ["prompt"]],
]);

/** 처리기로 읽히는가. type이 다섯 종류 가운데 하나이고 그 종류의 필수 값이 모두 빈 글자가 아닌 글자다 */
export function isHandler(handler: unknown): handler is Json {
  if (!isObject(handler) || typeof handler.type !== "string") return false;
  const required = REQUIRED_FIELDS.get(handler.type);
  return required !== undefined && required.every((field) => typeof handler[field] === "string" && handler[field] !== "");
}

/** 사건 묶음이 훅 형식의 뼈대를 갖췄는가. 사건마다 매처 묶음의 목록이고, 묶음마다 hooks 목록이 있고, 처리기가 모두 처리기로 읽힌다. 형식 검사의 전부는 아니다(그 밖의 값의 종류나 사건 이름은 보지 않는다) */
export function hookMapValid(events: unknown): events is Json {
  if (!isObject(events)) return false;
  for (const groups of Object.values(events)) {
    if (!Array.isArray(groups)) return false;
    for (const group of groups) if (!isObject(group) || !Array.isArray(group.hooks) || !group.hooks.every(isHandler)) return false;
  }
  return true;
}

/** 플러그인 훅 파일의 사건 묶음. 맨 위 hooks 감싸개가 없거나 뼈대가 형식에 맞지 않으면 도구가 파일째 싣지 않으므로 null이다(공식 문서 plugins-reference 「hooks」, plugins troubleshooting 「Hooks fail to load」) */
export function hookFileEvents(file: unknown): Json | null {
  return isObject(file) && hookMapValid(file.hooks) ? file.hooks : null;
}

/** 매니페스트나 마켓 항목에 인라인으로 적은 훅. 감싸개 없이 사건 묶음 그대로이고, 뼈대가 형식에 맞지 않으면 null이다(공식 문서 plugins-reference 「hooks」) */
export function inlineHookEvents(inline: unknown): Json | null {
  return hookMapValid(inline) ? inline : null;
}

/** 사건 묶음({ 사건: [ { matcher, hooks: [처리기] } ] })에서 PreToolUse 처리기마다 겉모양을 낸다. 처리기로 읽히지 않는 것은 확인 훅으로 세지 않는다 */
export function preToolUseGuards(events: unknown, source: HookSource, pluginId: string | null): ShellGuard[] {
  if (!isObject(events) || !Array.isArray(events.PreToolUse)) return [];
  const out: ShellGuard[] = [];
  for (const group of events.PreToolUse) {
    if (!isObject(group) || !Array.isArray(group.hooks)) continue;
    for (const handler of group.hooks) {
      if (!isHandler(handler)) continue;
      out.push({ source, pluginId, coversShell: coversShell(group.matcher, handler.if), canBlock: handler.async !== true && handler.asyncRewake !== true });
    }
  }
  return out;
}

/** 사건 묶음의 모든 처리기가 실행하는 명령의 글(command와 args). 스킬 경로가 나오는지 보는 데에만 쓰고 버린다. */
export function hookCommandTexts(events: unknown): string[] {
  if (!isObject(events)) return [];
  const out: string[] = [];
  for (const groups of Object.values(events)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) continue;
      for (const handler of group.hooks) {
        if (!isObject(handler)) continue;
        const parts: string[] = [];
        if (typeof handler.command === "string") parts.push(handler.command);
        if (Array.isArray(handler.args)) for (const arg of handler.args) if (typeof arg === "string") parts.push(arg);
        if (parts.length > 0) out.push(parts.join(" "));
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/hooks.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 14개. 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/hooks.ts test/scan/hooks.test.ts
git commit -m "feat: 도구 실행 전 확인 훅의 겉모양 판정 추가"
```

---

### Task 8: 전역과 프로젝트의 권한 규칙 충돌

**Files:**
- Create: `src/scan/permissions.ts`
- Test: `test/scan/permissions.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces: `interface RuleLists { allow: readonly string[]; deny: readonly string[] }`, `conflictPairs(user: RuleLists, project: RuleLists | null, local: RuleLists | null): number`.

설계 11.3 F6의 쌍 세기다. 전역 쪽은 사용자 설정만이고 관리 정책의 규칙은 견주지 않는다. 프로젝트 쪽은 그 프로젝트의 프로젝트 설정과 로컬 설정을 합친다. 같은 규칙이 둘에 다 있어도 한 쌍이다. 프로젝트 설정과 로컬 설정끼리 부딪히는 것은 세지 않는다. 규칙은 글자 그대로 견준다. 결과에는 쌍의 수만 남는다(규칙의 글은 싣지 않는다. 설계 10). 시험은 설계 21.1의 F6 반례를 넣는다. "프로젝트로 보지 않는 폴더의 설정은 보지 않는다"는 과제 12가 그런 폴더의 설정을 읽지 않는 것으로 지킨다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/permissions.test.ts`:

```ts
// 전역과 프로젝트의 권한 규칙 충돌 세기를 시험한다. 설계 21.1의 F6 반례를 그대로 넣는다(설계 11.3 F6)
import { describe, expect, it } from "vitest";
import { conflictPairs } from "../../src/scan/permissions.ts";

const none = { allow: [], deny: [] };

describe("conflictPairs", () => {
  it("전역이 금지한 규칙과 글자 그대로 같은 규칙이 한 프로젝트의 로컬 설정의 허용에만 있으면 한 쌍이다", () => {
    expect(conflictPairs({ allow: [], deny: ["Bash(rm -rf *)"] }, null, { allow: ["Bash(rm -rf *)"], deny: [] })).toBe(1);
  });
  it("같은 규칙이 프로젝트 설정과 로컬 설정의 허용에 둘 다 있어도 한 쌍이다", () => {
    expect(conflictPairs({ allow: [], deny: ["Bash(curl *)"] }, { allow: ["Bash(curl *)"], deny: [] }, { allow: ["Bash(curl *)"], deny: [] })).toBe(1);
  });
  it("프로젝트 설정이 허용하고 같은 프로젝트의 로컬 설정이 금지한 규칙은, 전역에 없으면 세지 않는다", () => {
    expect(conflictPairs(none, { allow: ["Read(.env)"], deny: [] }, { allow: [], deny: ["Read(.env)"] })).toBe(0);
  });
  it("전역 허용과 프로젝트 금지, 전역 금지와 프로젝트 허용을 모두 센다", () => {
    expect(conflictPairs({ allow: ["A", "B"], deny: ["C"] }, { allow: ["C"], deny: ["A"] }, { allow: [], deny: ["B", "B"] })).toBe(3);
  });
  it("글자가 조금이라도 다르면 부딪힌 것이 아니다", () => {
    expect(conflictPairs({ allow: [], deny: ["Bash(rm *)"] }, { allow: ["Bash(rm  *)", "bash(rm *)"], deny: [] }, null)).toBe(0);
  });
  it("프로젝트 쪽이 없으면 0이다", () => {
    expect(conflictPairs({ allow: ["A"], deny: ["B"] }, null, null)).toBe(0);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/permissions.test.ts`
Expected: FAIL. `../../src/scan/permissions.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/permissions.ts`:

```ts
// 전역(사용자 설정)과 한 프로젝트(프로젝트 설정과 로컬 설정)의 권한 규칙이 글자 그대로 부딪히는 쌍의 수를 센다. 규칙의 글은 세고 버린다(순수 함수, 설계 11.3 F6)
export interface RuleLists {
  allow: readonly string[];
  deny: readonly string[];
}

/**
 * 같은 규칙 문자열을 한쪽은 허용에, 다른 쪽은 금지에 둔 쌍의 수.
 * - 전역 쪽은 사용자 설정만이다. 관리 정책의 규칙은 견주지 않는다.
 * - 프로젝트 쪽은 프로젝트 설정과 로컬 설정을 합친다. 같은 규칙이 둘에 다 있어도 한 쌍이다.
 * - 프로젝트 설정과 로컬 설정끼리 부딪히는 것은 세지 않는다.
 */
export function conflictPairs(user: RuleLists, project: RuleLists | null, local: RuleLists | null): number {
  const projectAllow = new Set([...(project?.allow ?? []), ...(local?.allow ?? [])]);
  const projectDeny = new Set([...(project?.deny ?? []), ...(local?.deny ?? [])]);
  let pairs = 0;
  for (const rule of new Set(user.allow)) if (projectDeny.has(rule)) pairs++;
  for (const rule of new Set(user.deny)) if (projectAllow.has(rule)) pairs++;
  return pairs;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/permissions.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 6개. 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/permissions.ts test/scan/permissions.test.ts
git commit -m "feat: 전역과 프로젝트의 권한 규칙 충돌 세기 추가"
```

---

### Task 9: 스킬 폴더 훑기와 내용 지문

**Files:**
- Create: `src/scan/skills.ts`
- Test: `test/scan/skills.test.ts`

**Interfaces:**
- Consumes: `entryInfo`, `listDir`, `readText`(과제 3), 시험 도우미(과제 1).
- Produces: `interface SkillFolder { dirName; path; realPath; isLink; createdMs; targetCreatedMs; readable; hasFrontmatter; declaredName; nameUnreadable; disableModelInvocation; userInvocable; contentHash }`, `interface SkillRootScan { skills; danglingLinks; unreadableDirs; pluginDirs }`, `interface ScanSkillRootOptions { pluginDirs? }`, `CONTENT_HASH_MAX_BYTES = 32MiB`, `interface Frontmatter { present; fields; unreadable: string[] }`, `readScalar(raw): string | null`, `parseFrontmatter(text): Frontmatter`, `contentHash(dir, maxBytes?): Promise<string | null>`, `readSkillFolder(path, dirName): Promise<SkillFolder | null>`, `scanSkillRoot(dir, options?): Promise<SkillRootScan>`, `scanSkillPath(path): Promise<SkillRootScan>`.

설계 10의 "스킬의 정체"와 "내용 지문", 11.3 E5(만든 시각)·F5(사본)를 구현한다.

- **스킬 폴더.** 스킬을 두는 폴더 바로 아래의 `<이름>/SKILL.md`만 본다. 명령 파일(`commands/`의 평평한 `.md`)은 세지 않는다(설계 10 「설치로 세는 스킬은 스킬 폴더뿐이다」). `SKILL.md`가 없는 폴더와 보통 파일은 스킬이 아니다. 가리키는 곳이 없는 링크는 `danglingLinks`에 적는다(S3).
- **스킬 경로 하나.** `scanSkillPath`는 경로 자체에 `SKILL.md`가 있으면 그 폴더를 스킬 하나로 보고, 없으면 `scanSkillRoot`처럼 그 아래의 `<이름>/SKILL.md`를 훑는다. 플러그인의 `skills` 경로가 두 꼴을 다 받기 때문이다(설계 10 「스킬을 찾는 폴더」, 과제 12가 쓴다).
- **스킬 폴더에 둔 플러그인.** `scanSkillRoot(dir, { pluginDirs: true })`는 바로 아래 폴더(링크면 가리키는 곳)에 `.claude-plugin/plugin.json`이 있으면 스킬로 세지 않고 `pluginDirs`에 낸다. 그런 폴더는 보통 스킬이 아니라 `<name>@skills-dir` 플러그인이다(공식 문서 plugins/loading, 설계 10 「스킬 폴더에 둔 플러그인」). 사용자·프로젝트 스킬 폴더를 훑을 때만 켜고(과제 12), 플러그인 안의 `skills/`를 훑을 때는 가르지 않는다.
- **머리말.** 맨 앞의 `---` 줄과 닫는 `---` 줄 사이에서 들여쓰지 않은 `열쇠: 값` 줄만 읽는다. `name`, `disable-model-invocation`, `user-invocable`만 쓴다. 닫는 줄이 없으면 머리말이 없는 것이다. `SKILL.md`를 읽지 못하면 머리말을 판정하지 않는다(`readable: false`, S3에 넣지 않는다).
- **값 하나 읽기(`readScalar`).** YAML의 한 줄 값으로 읽는다. 큰따옴표와 작은따옴표(`''`는 `'`)를 풀고, 인용 밖의 주석(`#` 앞에 공백)을 뗀다. 큰따옴표의 탈출 글자는 YAML 1.2대로 푼다(한 글자 탈출과 16진 탈출 x·u·U). 모르는 탈출 글자나 16진이 아닌 글자는 읽지 못한 값이고 새 이름을 지어내지 않는다. 블록 값(`|`, `>`), 흐름 값(`[`, `{`), 닻·별칭·꼬리표(`&`, `*`, `!`), 닫히지 않은 인용, 닫는 인용 뒤의 다른 글은 읽지 못한 값이다. 읽지 못한 `name`은 쓰지 않고 `nameUnreadable`로 표시한다(기록의 이름 꼴에는 폴더 이름만 든다). 읽지 못한 제어 값은 기본값으로 둔다(모델이 부를 수 있음, 사람이 부를 수 있음). 참거짓은 YAML의 `true`·`True`·`TRUE`와 `false`·`False`·`FALSE`다.
- **내용 지문.** 링크를 푼 폴더 안 모든 파일의 상대 경로(구분 기호 `/`)와 내용의 SHA-256을 차례로 묶어 다시 SHA-256한다. 폴더 안에 링크가 하나라도 있거나, 읽지 못하거나, 합이 상한(`CONTENT_HASH_MAX_BYTES`, 32MiB)을 넘으면 `null`(견줄 수 없는 사본)이다. 상한은 인자로 받아 시험이 아래·같음·넘음을 작은 수로 본다.
- 스킬의 글은 지문을 만든 뒤 버린다. 결과에는 이름, 경로, 참거짓, 시각, 지문만 남는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/skills.test.ts`:

```ts
// 스킬 폴더 훑기를 시험한다. 머리말 읽기, 내용 지문(같은 사본·다른 사본·견줄 수 없는 사본), 링크와 가리키는 곳이 없는 링크(설계 10, 11.3 F5, 21.1)
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { contentHash, parseFrontmatter, readScalar, readSkillFolder, scanSkillPath, scanSkillRoot } from "../../src/scan/skills.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

const skillMd = (fields: string): string => `---\n${fields}\n---\n\n# 본문\n이 글은 남지 않는다.\n`;

describe("parseFrontmatter", () => {
  it("--- 사이의 열쇠: 값만 읽고 따옴표를 뗀다. CRLF도 읽는다", () => {
    expect(parseFrontmatter("---\r\nname: \"deploy\"\r\ndisable-model-invocation: true\r\n---\r\nbody")).toEqual({
      present: true,
      fields: { name: "deploy", "disable-model-invocation": "true" },
      unreadable: [],
    });
  });
  it("맨 앞이 ---가 아니거나 닫는 줄이 없으면 머리말이 없다", () => {
    expect(parseFrontmatter("# 제목\n---\nname: x\n---\n").present).toBe(false);
    expect(parseFrontmatter("---\nname: x\n").present).toBe(false);
  });
});

describe("contentHash", () => {
  it("상대 경로와 내용이 모두 같아야 같은 지문이다. SKILL.md만 같고 딸린 스크립트가 다르면 다르다", async () => {
    for (const dir of ["a", "b", "c"]) await put(join(root, dir, "SKILL.md"), skillMd("name: s"));
    await put(join(root, "a", "scripts", "run.sh"), "echo 1");
    await put(join(root, "b", "scripts", "run.sh"), "echo 1");
    await put(join(root, "c", "scripts", "run.sh"), "echo 2");
    const [a, b, c] = await Promise.all(["a", "b", "c"].map((dir) => contentHash(join(root, dir))));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("폴더 안에 링크가 있으면 견줄 수 없다(null)", async () => {
    await put(join(root, "s", "SKILL.md"), skillMd("name: s"));
    await put(join(root, "shared", "x.md"), "x");
    await linkDir(join(root, "shared"), join(root, "s", "refs"));
    expect(await contentHash(join(root, "s"))).toBeNull();
  });
});

describe("readSkillFolder", () => {
  it("머리말의 name, disable-model-invocation, user-invocable을 읽는다", async () => {
    await put(join(root, "deploy-staging", "SKILL.md"), skillMd("name: deploy\ndisable-model-invocation: true\nuser-invocable: false"));
    const skill = await readSkillFolder(join(root, "deploy-staging"), "deploy-staging");
    expect(skill).toMatchObject({ dirName: "deploy-staging", declaredName: "deploy", disableModelInvocation: true, userInvocable: false, hasFrontmatter: true, readable: true, isLink: false });
    expect(skill!.realPath).toBe(normalizePath(join(root, "deploy-staging")));
    expect(skill!.createdMs === null || typeof skill!.createdMs === "number").toBe(true);
    expect(JSON.stringify(skill)).not.toContain("남지 않는다");
  });
  it("머리말이 없는 SKILL.md는 hasFrontmatter가 거짓이다. SKILL.md가 없는 폴더는 스킬이 아니다", async () => {
    await put(join(root, "plain", "SKILL.md"), "# 머리말 없음\n");
    expect(await readSkillFolder(join(root, "plain"), "plain")).toMatchObject({ hasFrontmatter: false, declaredName: null, readable: true });
    await put(join(root, "notes", "README.md"), "x");
    expect(await readSkillFolder(join(root, "notes"), "notes")).toBeNull();
  });
});

describe("scanSkillRoot", () => {
  it("스킬 폴더와 링크로 건 스킬을 이름 차례로 내고, 가리키는 곳이 없는 링크를 따로 적는다", async () => {
    const skills = join(root, "skills");
    await put(join(skills, "a", "SKILL.md"), skillMd("name: a"));
    await put(join(root, "store", "b", "SKILL.md"), skillMd("name: b"));
    await linkDir(join(root, "store", "b"), join(skills, "b"));
    await put(join(skills, "c-not-skill", "notes.md"), "x");
    await put(join(root, "store", "d", "SKILL.md"), skillMd("name: d"));
    await linkDir(join(root, "store", "d"), join(skills, "d"));
    await rm(join(root, "store", "d"), { recursive: true, force: true });
    await put(join(skills, "e.txt"), "x");
    const scan = await scanSkillRoot(skills);
    expect(scan.skills.map((s) => [s.dirName, s.isLink])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(scan.skills[1]!.realPath).toBe(normalizePath(join(root, "store", "b")));
    expect(scan.danglingLinks).toEqual([join(skills, "d")]);
  });
  it("폴더가 없으면 아무것도 없다", async () => {
    expect(await scanSkillRoot(join(root, "none"))).toEqual({ skills: [], danglingLinks: [], unreadableDirs: [], pluginDirs: [] });
  });
  it("사용자·프로젝트 스킬 폴더를 훑을 때 .claude-plugin/plugin.json이 든 폴더(링크 포함)는 스킬이 아니라 플러그인 폴더로 따로 낸다", async () => {
    const skills = join(root, "skills");
    await put(join(skills, "plain", "SKILL.md"), skillMd("name: plain"));
    await put(join(skills, "my-tool", ".claude-plugin", "plugin.json"), "{}");
    await put(join(skills, "my-tool", "SKILL.md"), skillMd("name: my-tool"));
    await put(join(root, "store", "linked-tool", ".claude-plugin", "plugin.json"), "{}");
    await linkDir(join(root, "store", "linked-tool"), join(skills, "linked-tool"));
    const scan = await scanSkillRoot(skills, { pluginDirs: true });
    expect(scan.skills.map((s) => s.dirName)).toEqual(["plain"]);
    expect(scan.pluginDirs).toEqual([join(skills, "linked-tool"), join(skills, "my-tool")]);
    // 플러그인 안의 스킬 폴더를 훑을 때(기본)는 가르지 않는다
    const inside = await scanSkillRoot(skills);
    expect(inside.skills.map((s) => s.dirName)).toEqual(["my-tool", "plain"]);
    expect(inside.pluginDirs).toEqual([]);
  });
});

describe("머리말 값 읽기(YAML 한 줄 값)", () => {
  it("큰따옴표의 탈출 글자는 YAML대로 풀고, 모르는 탈출 글자나 모자란 16진은 읽지 못한 것이다", () => {
    expect(readScalar('"\\u0064eploy"')).toBe("deploy");
    expect(readScalar('"\\x41b"')).toBe("Ab");
    expect(readScalar('"\\U00000041"')).toBe("A");
    expect(readScalar('"a\\\\b\\"c\\/d"')).toBe('a\\b"c/d');
    expect(readScalar('"tab\\there"')).toBe("tab\there");
    expect(readScalar('"\\q"')).toBeNull();
    expect(readScalar('"\\u00"')).toBeNull();
    expect(readScalar('"\\u00zz"')).toBeNull();
    expect(parseFrontmatter('---\nname: "\\q"\n---\n')).toMatchObject({ unreadable: ["name"] });
  });
  it("인용 밖의 주석을 떼고, 인용 안의 #은 남기고, 따옴표를 푼다", () => {
    expect(readScalar("sample # PRIVATE-COMMENT-123")).toBe("sample");
    expect(readScalar('"a # b" # note')).toBe("a # b");
    expect(readScalar("'it''s'")).toBe("it's");
    expect(readScalar('"q\\"x"')).toBe('q"x');
    expect(readScalar("a#b")).toBe("a#b");
    expect(readScalar("")).toBe("");
    expect(readScalar("# only comment")).toBe("");
  });
  it("블록 값, 흐름 값, 닫히지 않은 인용, 인용 뒤의 다른 글은 읽지 못한 것이다", () => {
    for (const raw of [">-", "|", "[a, b]", "{a: 1}", '"open', "'open", '"a" b', "&anchor x", "*alias"]) expect(readScalar(raw)).toBeNull();
  });
  it("주석이 붙은 제어 값은 주석을 떼고 읽는다. 블록 값의 name은 읽지 못한 열쇠로 남는다", () => {
    const front = parseFrontmatter("---\nname: >-\n  folded-name\ndisable-model-invocation: true # disabled\nuser-invocable: False\n---\n");
    expect(front.fields["disable-model-invocation"]).toBe("true");
    expect(front.fields["user-invocable"]).toBe("False");
    expect(front.unreadable).toEqual(["name"]);
    expect(front.fields.name).toBeUndefined();
  });
  it("이름에 붙은 주석은 셋팅 사실로 넘어가지 않고, 읽지 못한 name은 표시한다", async () => {
    await put(join(root, "c", "SKILL.md"), "---\nname: sample # PRIVATE-COMMENT-123\ndisable-model-invocation: true # off\n---\n");
    const commented = await readSkillFolder(join(root, "c"), "c");
    expect(commented).toMatchObject({ declaredName: "sample", nameUnreadable: false, disableModelInvocation: true });
    expect(JSON.stringify(commented)).not.toContain("PRIVATE-COMMENT-123");
    await put(join(root, "b", "SKILL.md"), "---\nname: |\n  multi\n---\n");
    expect(await readSkillFolder(join(root, "b"), "b")).toMatchObject({ declaredName: null, nameUnreadable: true });
  });
});

describe("내용 지문의 상한", () => {
  it("합이 상한과 같으면 지문을 내고, 넘으면 견줄 수 없다", async () => {
    await put(join(root, "s", "SKILL.md"), "12345");
    await put(join(root, "s", "data.bin"), "67890");
    expect(await contentHash(join(root, "s"), 10)).toMatch(/^[0-9a-f]{64}$/);
    expect(await contentHash(join(root, "s"), 11)).toMatch(/^[0-9a-f]{64}$/);
    expect(await contentHash(join(root, "s"), 9)).toBeNull();
  });
});

describe("scanSkillPath", () => {
  it("경로 자체에 SKILL.md가 있으면 그 폴더가 스킬 하나다", async () => {
    await put(join(root, "extra", "one", "SKILL.md"), skillMd("name: one"));
    const single = await scanSkillPath(join(root, "extra", "one"));
    expect(single.skills.map((s) => s.dirName)).toEqual(["one"]);
  });
  it("없으면 그 아래의 <이름>/SKILL.md를 훑는다", async () => {
    await put(join(root, "extra", "one", "SKILL.md"), skillMd("name: one"));
    await put(join(root, "extra", "two", "SKILL.md"), skillMd("name: two"));
    expect((await scanSkillPath(join(root, "extra"))).skills.map((s) => s.dirName)).toEqual(["one", "two"]);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/skills.test.ts`
Expected: FAIL. `../../src/scan/skills.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/skills.ts`:

```ts
// 스킬 폴더(<이름>/SKILL.md)를 찾아 폴더마다 실제 경로, 링크인지, 만든 시각, 머리말의 몇 가지, 내용 지문을 낸다. 스킬의 글은 버린다(설계 10, 11.3 E5·F5)
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { entryInfo, listDir, readText } from "./fs.ts";

export interface SkillFolder {
  /** 폴더 이름. 사용자·프로젝트 스킬은 이 이름으로도 불린다 */
  dirName: string;
  /** 스킬 폴더의 경로(링크면 링크 자체) */
  path: string;
  /** 링크를 푼 실제 경로(정규화) */
  realPath: string | null;
  isLink: boolean;
  /** 폴더(링크면 링크 자체)를 만든 시각. 알 수 없으면 null */
  createdMs: number | null;
  /** 링크의 대상 폴더를 만든 시각. 링크가 아니면 null */
  targetCreatedMs: number | null;
  /** SKILL.md를 읽었는지. 읽지 못하면 머리말을 판정하지 않는다 */
  readable: boolean;
  hasFrontmatter: boolean;
  /** 머리말의 name. 없거나 읽지 못하면 null */
  declaredName: string | null;
  /** 머리말에 name이 있는데 값을 읽지 못했다(블록 값, 닫히지 않은 인용 등) */
  nameUnreadable: boolean;
  disableModelInvocation: boolean;
  /** 머리말의 user-invocable이 false가 아니면 참 */
  userInvocable: boolean;
  /** 폴더 안 모든 파일의 상대 경로와 내용으로 만든 지문. 폴더 안에 링크가 있거나, 읽지 못하거나, 너무 크면 null(견줄 수 없는 사본) */
  contentHash: string | null;
}

export interface SkillRootScan {
  skills: SkillFolder[];
  /** 가리키는 곳이 없는 링크(S3) */
  danglingLinks: string[];
  /** 목록을 읽지 못한 스킬 폴더 */
  unreadableDirs: string[];
  /** .claude-plugin/plugin.json이 든 폴더(스킬 폴더에 둔 플러그인). pluginDirs 옵션을 켰을 때만 가른다 */
  pluginDirs: string[];
}

export const CONTENT_HASH_MAX_BYTES = 32 * 1024 * 1024;

export interface Frontmatter {
  present: boolean;
  /** 읽은 값(인용을 풀고 인용 밖 주석을 뗀 것) */
  fields: Record<string, string>;
  /** 열쇠는 있는데 값을 읽지 못한 것(블록 값, 흐름 값, 닫히지 않은 인용) */
  unreadable: string[];
}

/** 큰따옴표 안의 한 글자 탈출(YAML 1.2). */
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "\t",
  "\t": "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\u0085",
  _: " ",
  L: " ",
  P: " ",
};
/** 큰따옴표 안의 16진 탈출과 그 자릿수(YAML 1.2). */
const HEX_ESCAPES: Readonly<Record<string, number>> = { x: 2, u: 4, U: 8 };

/**
 * YAML의 한 줄 값 하나를 읽는다. 큰따옴표(\" 등의 탈출 글자)와 작은따옴표('' 는 ')를 풀고, 인용 밖의 주석(# 앞에 공백)을 뗀다.
 * 블록 값(| >), 흐름 값([ {), 닻·별칭·꼬리표(& * !)와 닫히지 않은 인용은 읽지 못한 것(null)으로 둔다.
 */
export function readScalar(raw: string): string | null {
  const s = raw.trim();
  if (s === "" || s.startsWith("#")) return "";
  const rest = (from: number): boolean => {
    const tail = s.slice(from).trim();
    return tail === "" || tail.startsWith("#");
  };
  if (s[0] === '"') {
    let out = "";
    for (let i = 1; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "\\") {
        // YAML 큰따옴표의 탈출 글자(YAML 1.2 「Escaped Characters」). 모르는 탈출 글자는 읽지 못한 값이다(새 이름을 지어내지 않는다)
        const next = s[i + 1];
        if (next === undefined) return null;
        if (Object.hasOwn(SIMPLE_ESCAPES, next)) {
          out += SIMPLE_ESCAPES[next];
          i++;
          continue;
        }
        if (!Object.hasOwn(HEX_ESCAPES, next)) return null;
        const width = HEX_ESCAPES[next]!;
        // 자릿수가 모자라면 글의 끝이라 닫는 따옴표가 없어 아래에서 읽지 못한 값이 된다
        const hex = s.slice(i + 2, i + 2 + width);
        if (!/^[0-9A-Fa-f]+$/.test(hex)) return null;
        const code = Number.parseInt(hex, 16);
        if (code > 0x10ffff) return null;
        out += String.fromCodePoint(code);
        i += 1 + width;
        continue;
      }
      if (ch === '"') return rest(i + 1) ? out : null;
      out += ch;
    }
    return null;
  }
  if (s[0] === "'") {
    let out = "";
    for (let i = 1; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "'") {
        if (s[i + 1] === "'") {
          out += "'";
          i++;
          continue;
        }
        return rest(i + 1) ? out : null;
      }
      out += ch;
    }
    return null;
  }
  if ("|>[{&*!".includes(s[0]!)) return null;
  const comment = s.search(/\s#/);
  return (comment === -1 ? s : s.slice(0, comment)).trim();
}

const YAML_TRUE = new Set(["true", "True", "TRUE"]);
const YAML_FALSE = new Set(["false", "False", "FALSE"]);

/** 맨 앞의 --- 줄과 닫는 --- 줄 사이에서 들여쓰지 않은 "열쇠: 값" 줄만 읽는다. 들여쓴 줄(묶음의 안쪽)은 보지 않는다. */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const none: Frontmatter = { present: false, fields: Object.create(null) as Record<string, string>, unreadable: [] };
  if (lines[0]?.trim() !== "---") return none;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return none;
  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  const unreadable: string[] = [];
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line);
    if (match === null) continue;
    const value = readScalar(match[2] ?? "");
    if (value === null) unreadable.push(match[1]!);
    else fields[match[1]!] = value;
  }
  return { present: true, fields, unreadable };
}

/** 폴더 안 모든 파일로 지문을 만든다. 링크가 하나라도 있거나 읽지 못하거나 합이 상한을 넘으면 null이다. */
export async function contentHash(dir: string, maxBytes = CONTENT_HASH_MAX_BYTES): Promise<string | null> {
  let base: string;
  try {
    base = await realpath(dir);
  } catch {
    return null;
  }
  const entries: string[] = [];
  let total = 0;
  const walk = async (current: string): Promise<boolean> => {
    let names: string[];
    try {
      names = (await readdir(current)).sort();
    } catch {
      return false;
    }
    for (const name of names) {
      const path = join(current, name);
      let info;
      try {
        info = await lstat(path);
      } catch {
        return false;
      }
      if (info.isSymbolicLink()) return false;
      if (info.isDirectory()) {
        if (!(await walk(path))) return false;
        continue;
      }
      if (!info.isFile()) return false;
      total += info.size;
      if (total > maxBytes) return false;
      let data: Buffer;
      try {
        data = await readFile(path);
      } catch {
        return false;
      }
      const rel = relative(base, path).replace(/\\/g, "/");
      entries.push(`${rel}\u0000${createHash("sha256").update(data).digest("hex")}`);
    }
    return true;
  };
  if (!(await walk(base))) return null;
  return createHash("sha256").update(entries.sort().join("\n")).digest("hex");
}

/** 스킬 하나의 폴더(링크여도 된다)를 본다. SKILL.md가 없으면 null이다. */
export async function readSkillFolder(path: string, dirName: string): Promise<SkillFolder | null> {
  const info = await entryInfo(path);
  if (!info.isDir) return null;
  const skillMd = await readText(join(path, "SKILL.md"));
  if (skillMd.status === "missing") return null;
  const front: Frontmatter =
    skillMd.status === "ok" ? parseFrontmatter(skillMd.text) : { present: false, fields: Object.create(null) as Record<string, string>, unreadable: [] };
  const name = front.fields.name;
  return {
    dirName,
    path,
    realPath: info.realPath,
    isLink: info.isLink,
    createdMs: info.createdMs,
    targetCreatedMs: info.targetCreatedMs,
    readable: skillMd.status === "ok",
    hasFrontmatter: front.present,
    declaredName: name !== undefined && name !== "" ? name : null,
    nameUnreadable: front.unreadable.includes("name"),
    // 읽지 못한 값은 기본값(모델이 부를 수 있음, 사람이 부를 수 있음)으로 둔다
    disableModelInvocation: YAML_TRUE.has(front.fields["disable-model-invocation"] ?? ""),
    userInvocable: !YAML_FALSE.has(front.fields["user-invocable"] ?? ""),
    contentHash: await contentHash(path),
  };
}

export interface ScanSkillRootOptions {
  /** 사용자·프로젝트 스킬 폴더를 훑을 때 참으로 준다. .claude-plugin/plugin.json이 든 폴더를 스킬이 아니라 플러그인 폴더로 가른다(설계 10 「스킬 폴더에 둔 플러그인」) */
  pluginDirs?: boolean;
}

/** 스킬을 두는 폴더 하나(<홈>/skills, <프로젝트>/.claude/skills, 플러그인의 skills)를 훑는다. 이름 차례다. */
export async function scanSkillRoot(dir: string, options: ScanSkillRootOptions = {}): Promise<SkillRootScan> {
  const out: SkillRootScan = { skills: [], danglingLinks: [], unreadableDirs: [], pluginDirs: [] };
  const listing = await listDir(dir);
  if (listing.status === "unreadable") out.unreadableDirs.push(dir);
  if (listing.status !== "ok") return out;
  for (const name of listing.names) {
    const path = join(dir, name);
    const info = await entryInfo(path);
    if (info.dangling) {
      out.danglingLinks.push(path);
      continue;
    }
    // 바로 아래 폴더(링크면 가리키는 곳)에 플러그인 매니페스트가 있으면 보통 스킬이 아니라 스킬 폴더에 둔 플러그인이다(공식 문서 plugins/loading)
    if (options.pluginDirs === true && info.isDir && (await entryInfo(join(path, ".claude-plugin", "plugin.json"))).isFile) {
      out.pluginDirs.push(path);
      continue;
    }
    const skill = await readSkillFolder(path, name);
    if (skill !== null) out.skills.push(skill);
  }
  return out;
}

/** 플러그인의 skills 경로 하나를 본다. 경로 자체에 SKILL.md가 있으면 그 폴더가 스킬 하나이고, 없으면 그 아래의 <이름>/SKILL.md를 훑는다. */
export async function scanSkillPath(path: string): Promise<SkillRootScan> {
  if ((await entryInfo(join(path, "SKILL.md"))).isFile) {
    const single = await readSkillFolder(path, basename(path));
    return { skills: single === null ? [] : [single], danglingLinks: [], unreadableDirs: [], pluginDirs: [] };
  }
  return scanSkillRoot(path);
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/skills.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 17개. 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/skills.ts test/scan/skills.test.ts
git commit -m "feat: 스킬 폴더 훑기와 내용 지문 추가"
```

---

### Task 10: 설치된 플러그인 읽기

**Files:**
- Create: `src/scan/plugins.ts`
- Test: `test/scan/plugins.test.ts`

**Interfaces:**
- Consumes: `entryInfo`, `listDir`, `readJson`(과제 3), `isObject`(과제 6), `hookFileEvents`, `inlineHookEvents`(과제 7), `normalizePath`.
- Produces: `type ComponentKind`(14가지), `interface McpDefinitionEntry { name; definition: Record<string, unknown> | null }`, `interface PluginInstall`(`id`, `entryName`, `marketplace`, `name`, `scopes`, `projectPaths`, `installPath`, `exists`, `manifest`, `marketplaceEntry`, `defaultEnabled`, `components`, `unknownEntries`, `dependencies`, `compositionKnown`, `hookEvents`, `hooksUnreadable`, `mcpServers`, `mcpUnreadable`, `skillRoots`), `interface PluginsScan { file; plugins }`, `mcpMapOf(value): McpDefinitionEntry[] | null`, `interface MarketplaceEntries { file; markets }`, `readMarketplaceEntries(claudeHome): Promise<MarketplaceEntries>`, `interface InstallGroup { id; installPath; scopes; projectPaths }`, `readPluginInstall(group, markets): Promise<PluginInstall>`, `scanPlugins(claudeHome): Promise<PluginsScan>`, `interface SkillsDirPluginRef { path; scope: "user" | "project"; projectRoot }`, `readSkillsDirPlugins(refs): Promise<PluginInstall[]>`. `marketplaceEntry`는 `"ok" | "missing" | "unreadable" | "none"`다.

설계 10의 「플러그인의 구성」(두 이름, 마켓 항목, 구성을 모르는 플러그인, 도구에 든 플러그인, 기대는 플러그인)과 16.2 A2(구성 요소, 알아보지 못한 것, 기대는 플러그인)를 구현한다.

- **설치 기록.** `<홈>/plugins/installed_plugins.json`의 `plugins["<이름>@<마켓>"]`은 설치 기록의 목록이다. 같은 ID·같은 설치 위치(정규화)의 기록은 하나로 묶고 범위(`scope`)와 프로젝트(`projectPath`)를 합친다. 같은 곳을 다른 표기로 적었으면 글자 차례로 가장 앞선 표기를 쓴다. ID가 `@builtin`으로 끝나는 것은 도구에 든 플러그인이라 세지 않는다. 동기화된 플러그인처럼 이 파일에 없는 것은 보지 않는다(한계).
- **두 이름.** ID의 `@` 앞이 마켓 항목의 이름(`entryName`)이다. 깔고 켜는 열쇠와 다른 플러그인의 `dependencies`가 이 이름을 쓴다. 구성 요소의 이름(`name`)은 매니페스트의 `name`이고, 매니페스트가 없으면 마켓 항목의 이름이다. 매니페스트가 있는데 `name`이 없거나 글자가 아니거나 비었으면 도구가 싣지 않으므로 풀리지 않는 매니페스트로 본다(공식 문서 plugins-reference 「Required fields」). 빈 글자도 그렇게 보는 것은 계획이 정한 세부다.
- **마켓 항목.** `<홈>/plugins/known_marketplaces.json`에서 그 마켓의 `installLocation`을 얻는다. 폴더이면 그 아래 `.claude-plugin/marketplace.json`, 파일이면 그 파일이 마켓 파일이다. 항목은 그 파일의 `plugins`에서 `name`이 마켓 항목의 이름과 글자 그대로 같은 것이다. `known_marketplaces.json`이 풀리지 않거나 모양이 틀리면 마켓을 하나도 모르므로, 그 플러그인의 마켓 항목은 없는 것(`missing`)이 아니라 읽지 못한 것(`unreadable`)이다.
- **구성을 합치는 법(설계 10의 표).** 매니페스트가 없으면 항목이 매니페스트다(`mcpServers`, `lspServers`, `userConfig`, `channels`도 든다). 매니페스트가 있고 `strict`가 거짓이 아니면 항목의 `commands`·`agents`·`skills`·`outputStyles`·`themes`가 더해지고, `hooks`는 사건마다 항목의 매처가 대신한다. 항목의 `mcpServers`·`lspServers`·`userConfig`·`channels`는 듣지 않으므로 세지 않는다. 매니페스트가 있고 `strict`가 거짓인데 항목에 그 여섯 가운데 하나라도 있으면 뜨지 않는 플러그인이다.
- **구성 요소.** 플러그인 뿌리의 기본 자리(`skills`, `commands`, `agents`, `workflows`, `output-styles`, `themes`, `monitors`, `hooks`, `bin`, `settings.json`, `.mcp.json`, `.lsp.json`)와 매니페스트·항목의 열쇠(`skills`, `commands`, `agents`, `workflows`, `outputStyles`, `hooks`, `mcpServers`, `lspServers`, `userConfig`, `channels`, `themes`, `experimental.themes`, `experimental.monitors`)로 안다(공식 문서 plugins-reference).
- **알아보지 못한 것(설계 10의 표).** 뿌리 항목 가운데 기본 자리도, 매니페스트·항목이 가리키는 곳도, 소개 쪽도 아닌 것과, 매니페스트·항목의 열쇠 가운데 소개 열쇠도 `dependencies`·`defaultEnabled`도 구성 요소도 아닌 것이다(열쇠는 `manifest:`·`entry:` 접두로 적는다. 매니페스트가 있어도 항목의 열쇠를 본다). 소개 쪽은 점으로 시작하는 항목, README·LICENSE·CHANGELOG로 시작하는 파일과 `package.json`, `SKILL.md`가 아닌 `.md` 파일(문서), `docs/`·`tests/`·`test/`·`examples/`·`assets/`·`images/`·`scripts/` 폴더다. 이름은 대소문자를 가리지 않고 보고, 링크는 대상의 꼴로 본다. 뿌리에 바로 놓인 `SKILL.md`, 다른 도구가 읽는 설정 파일처럼 `.md`가 아닌 파일, 이름을 모르는 폴더는 알아보지 못한 것이고 A2 후보를 막는다. `skills`가 플러그인 뿌리 자신(`.`, `./`)을 가리키면 스킬 경로로 보지 않고 알아보지 못한 것(`manifest:skills=.` 같은 꼴)으로 둔다.
- **구성을 모르는 플러그인.** 놓인 곳이 없거나 그 목록을 읽지 못했거나, 매니페스트가 있는데 풀리지 않거나, 마켓 항목을 읽지 못했거나(마켓이 `known_marketplaces.json`에 없음, 마켓 파일이 없거나 풀리지 않음, 그 이름의 항목이 없음), 뜨지 않는 플러그인이면 `compositionKnown: false`다. 구성과 스킬을 보지 않고, 기대는 플러그인은 `null`, 훅과 MCP 정의는 읽지 못한 것으로 적는다. 매니페스트가 아예 없는 플러그인은 마켓 항목을 읽었으면 구성을 안다.
- **기대는 플러그인.** 매니페스트와 마켓 항목의 `dependencies`를 합친다. 항목은 글자(`"이름"`, `"이름@마켓"`)나 `{ name }` 묶음이고 `@`의 앞이 이름이다. 마켓과 버전 조건은 보지 않는다.
- **기본 켜짐.** 마켓 항목의 `defaultEnabled`가 앞서고, 다음은 매니페스트의 것, 둘 다 없으면 참이다.
- **스킬 경로.** 기본 `skills/`에 매니페스트·항목의 `skills`를 더한다. 항목이 `skills`를 적었고 `source`가 마켓의 뿌리(`.`, `./`)이면 기본 `skills/`는 찾지 않는다(공식 문서 plugins-reference 「Path behavior rules」). 경로가 스킬 하나를 바로 가리킬 수 있어 과제 12가 `scanSkillPath`로 훑는다. 플러그인 뿌리 자신인지는 표기와 링크를 푼 실제 경로로 본다. 기본 `skills/`가 뿌리를 가리키는 링크이면 그것도 알아보지 못한 것(`skills=.`)이고 훑지 않는다. 선언한 `skills` 경로가 꼴이 틀리거나 뿌리 밖으로 풀리면 훑지 않고 알아보지 못한 것(`skills=..`)으로 둔다.
- **훅과 MCP 정의.** 기본 `hooks/hooks.json`·`.mcp.json`을 먼저 읽고 매니페스트의 선언(경로, 인라인 묶음, 둘을 섞은 목록)을 차례대로 더한다. 같은 이름의 MCP 서버는 나중에 선언된 것이 통째로 대신하므로 같은 MCP 파일을 두 번 선언하면 나중 자리에서 다시 읽는다(같은 경로(정규화한 표기)의 훅 파일은 한 번만 읽고 그 결과를 다시 쓴다). `mcpServers`를 주소나 MCP 묶음으로 적은 것은, 도구는 내려받거나 풀어 읽지만 이 스캐너는 그것을 해석하지 않으므로 정의를 읽지 못한 것(`mcpUnreadable`)으로 둔다(공식 문서 plugins-reference 「Hooks」·「MCP servers」, 설계 10). 선언한 파일이 없으면 그 종류를 읽지 못한 것이고(공식 문서 plugins troubleshooting의 `hooks path not found`), 선언하지 않은 기본 파일이 없는 것은 정상이다. 기본 파일을 먼저 없는 것으로 읽었어도 같은 경로를 선언했으면 읽지 못한 것이다. 선언한 경로는 `./`로 시작하고 `..` 부분이 없어야 쓴다(`wellFormedPath`). `./`로 시작하지 않는 경로는 검증에 실패하고, MCP 파일은 절대 경로이거나 `..` 부분이 있으면 안쪽을 가리켜도 도구가 읽지 않는다(공식 문서 plugins-reference 「Path rules」·「Containment and existence」, errors 「Server file path not read」). 훅과 스킬 경로에도 같은 꼴을 요구한다(엄한 쪽). 이름에 `..`이 든 폴더(`a..b`)는 `..` 부분이 아니다. 꼴이 맞아도 있는 경로의 실제 경로가 뿌리의 실제 경로 밖이면(링크) 도구가 그 경로를 버리므로(공식 문서 plugins loading 「Paths that escape the plugin directory」) 읽지 않고 읽지 못한 것이다. 기본 `hooks/hooks.json`도 실제 경로가 뿌리 밖이면 도구가 건너뛰므로 읽지 않고 `hooksUnreadable`이다(공식 문서 errors 「Path escapes plugin directory」). 같은 마켓 안의 다른 플러그인이나 로컬 마켓 안을 가리키는 링크는 도구가 받지만 여기서는 밖으로 본다(엄한 쪽, 설계 27). 뿌리 이름으로 시작하는 옆 폴더(`p`와 `p-shared`)를 안으로 보지 않게 구분 기호까지 견준다. 훅 파일은 `hookFileEvents`, 인라인 묶음(매니페스트와 마켓 항목)은 `inlineHookEvents`로 읽고(과제 7), null이면 그 훅을 넣지 않고 `hooksUnreadable`이다. 목록의 요소가 글자도 묶음도 아니면 그 요소는 읽지 못한 것(`hooksUnreadable`·`mcpUnreadable`)이고 나머지 요소는 읽는다. 마켓 항목의 `hooks`는 사건마다 매처를 적은 묶음일 때만 돈다. 경로나 목록으로 적은 것은 구성 요소(훅이 든 플러그인)로는 세고 훅 묶음에는 넣지 않는다. 돌지 않으므로 ㉠의 확인 훅이 아니고, 읽지 못한 것도 아니다(공식 문서 marketplace-reference 「Hooks in an entry」). 인라인 묶음이 뼈대에 맞지 않으면 읽지 못한 것이고 사건을 대신하지 않는다. 읽지 못한 파일이 있으면 `hooksUnreadable`·`mcpUnreadable`이다. 훅 묶음과 MCP 정의는 메모리에서만 쓴다.
- **스킬 폴더에 둔 플러그인(설계 10).** `readSkillsDirPlugins`는 과제 12가 스킬 폴더에서 찾은 플러그인 폴더를 `<name>@skills-dir` 플러그인으로 읽는다. 이름은 매니페스트의 `name`이고, 풀리지 않거나 `name`이 없으면 폴더 이름이다(그때는 구성을 모른다). 마켓 항목이 없는 것이 정상이라(`marketplaceEntry: "none"`) 매니페스트와 폴더로 구성을 안다. 범위는 사용자 스킬 폴더의 것이면 사용자, 프로젝트의 것이면 그 프로젝트다. 뿌리의 `SKILL.md`(`claude plugin init`이 만드는 꼴)는 다른 플러그인처럼 알아보지 못한 것이다. 문서상 그 스킬은 플러그인 이름 없이 불려서 플러그인 스킬의 꼴로 세면 쓴 것을 안 쓴 것으로 보게 되고, 사용자 스킬로 세는 길은 `skillOverrides`가 듣는지 문서에 없어 고르지 않았다(설계 10).
- 켜져 있는지는 설정 층이 정하므로 과제 12가 계산한다. 시험의 꾸민 `readdir`은 뿌리 목록을 읽지 못하는 경우를 만든다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/plugins.test.ts`:

```ts
// 설치된 플러그인 읽기를 시험한다. 매니페스트와 마켓 항목을 합친 유효 구성, 유효 이름, 알아보지 못한 것, 기대는 플러그인, 훅·MCP 정의, 구성을 모르는 플러그인(설계 10 「플러그인의 구성」, 16.2 A2)
import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcpMapOf, readSkillsDirPlugins, scanPlugins } from "../../src/scan/plugins.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, readdir: vi.fn(real.readdir) };
});
const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

let home: string;
let root: string;
beforeEach(async () => {
  root = await makeTemp();
  home = join(root, ".claude");
});
afterEach(async () => {
  vi.mocked(fsp.readdir).mockImplementation(actual.readdir as never);
  await removeTemp(root);
});

const json = (value: unknown): string => JSON.stringify(value);
const writeInstalled = async (plugins: Record<string, unknown[]>): Promise<void> => put(join(home, "plugins", "installed_plugins.json"), json({ version: 2, plugins }));
/** 마켓 하나의 목록 파일과 known_marketplaces.json을 쓴다. */
const writeMarket = async (market: string, entries: Record<string, unknown>[]): Promise<void> => {
  const location = join(root, "markets", market);
  await put(join(location, ".claude-plugin", "marketplace.json"), json({ name: market, plugins: entries }));
  const knownPath = join(home, "plugins", "known_marketplaces.json");
  let known: Record<string, unknown> = {};
  try {
    known = JSON.parse(await actual.readFile(knownPath, "utf8")) as Record<string, unknown>;
  } catch {
    known = {};
  }
  known[market] = { source: { source: "github" }, installLocation: location };
  await put(knownPath, json(known));
};
const entry = (name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ name, source: `./${name}`, description: "d", ...extra });

describe("scanPlugins", () => {
  it("설치 기록이 없거나 풀리지 않으면 플러그인이 없다", async () => {
    expect(await scanPlugins(home)).toEqual({ file: "missing", plugins: [] });
    await put(join(home, "plugins", "installed_plugins.json"), "{");
    expect((await scanPlugins(home)).file).toBe("unparsable");
  });

  it("구성 요소를 기본 자리와 매니페스트로 알아보고, 나머지 뿌리 항목은 알아보지 못한 것이다", async () => {
    const p1 = join(root, "cache", "m", "p1", "1.0.0");
    await put(join(p1, ".claude-plugin", "plugin.json"), json({ name: "p1", version: "1.0.0", author: { name: "a" }, dependencies: ["p2@m", { name: "p3", version: "~1" }] }));
    await put(join(p1, "skills", "s1", "SKILL.md"), "---\nname: s1\n---\n");
    await put(join(p1, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "x" }] }] } }));
    await put(join(p1, ".mcp.json"), json({ mcpServers: { db: { command: "srv" }, broken: "nope" } }));
    await put(join(p1, "tool.json"), "{}");
    await put(join(p1, "README.md"), "x");
    await put(join(p1, ".orphaned_at"), "x");
    const p2 = join(root, "cache", "m", "p2", "2.0.0");
    await put(join(p2, "skills", "only", "SKILL.md"), "---\nname: only\n---\n");
    await put(join(p2, "LICENSE"), "MIT");
    await writeMarket("m", [entry("p1"), entry("p2"), entry("gone")]);
    await writeInstalled({
      "p2@m": [{ scope: "user", installPath: p2, version: "2.0.0" }],
      "p1@m": [{ scope: "user", installPath: p1, version: "1.0.0" }],
      "gone@m": [{ scope: "project", installPath: join(root, "missing"), projectPath: join(root, "proj") }],
    });
    const scan = await scanPlugins(home);
    expect(scan.plugins.map((p) => p.id)).toEqual(["gone@m", "p1@m", "p2@m"]);
    const [gone, one, two] = scan.plugins;
    expect(gone).toMatchObject({ exists: false, compositionKnown: false, dependencies: null, scopes: ["project"], name: "gone", hooksUnreadable: true });
    expect(one).toMatchObject({ name: "p1", manifest: "ok", marketplaceEntry: "ok", compositionKnown: true, components: ["hooks", "mcpServers", "skills"], unknownEntries: ["tool.json"], dependencies: ["p2", "p3"] });
    expect(one!.mcpServers.map((s) => [s.name, s.definition !== null])).toEqual([
      ["broken", false],
      ["db", true],
    ]);
    // 매니페스트가 없어도 구성을 아는 플러그인이다(마켓 항목이 매니페스트 노릇을 한다)
    expect(two).toMatchObject({ manifest: "missing", compositionKnown: true, components: ["skills"], unknownEntries: [], dependencies: [], defaultEnabled: true });
  });

  it("매니페스트가 가리키는 폴더는 알아보지 못한 것이 아니고, 인라인 훅과 MCP 정의도 읽는다", async () => {
    const p = join(root, "p");
    await put(
      join(p, ".claude-plugin", "plugin.json"),
      json({ name: "p", defaultEnabled: false, skills: "./extra-skills/", commands: ["./cmds/a.md"], hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "y" }] }] }, mcpServers: { inline: { url: "https://e.example/mcp" } }, experimental: { themes: "./my-themes/" } }),
    );
    await put(join(p, "extra-skills", "x", "SKILL.md"), "---\nname: x\n---\n");
    await put(join(p, "cmds", "a.md"), "x");
    await put(join(p, "my-themes", "t.json"), "{}");
    await put(join(p, "workflows", "w.js"), "x");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ defaultEnabled: false, unknownEntries: [], components: ["commands", "hooks", "mcpServers", "skills", "themes", "workflows"] });
    expect(plugin!.skillRoots).toEqual([join(p, "skills"), join(p, "extra-skills")]);
    expect(plugin!.mcpServers.map((s) => s.name)).toEqual(["inline"]);
  });

  it("훅 파일이 풀리지 않으면 훅을 읽지 못했다고 적는다. 구성은 안다", async () => {
    const p = join(root, "p");
    await put(join(p, "hooks", "hooks.json"), "{");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ compositionKnown: true, hooksUnreadable: true, components: ["hooks"] });
  });

  it("매니페스트가 있는데 풀리지 않으면 구성을 모르는 플러그인이다. 구성과 스킬을 보지 않는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), "{");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ manifest: "unparsable", compositionKnown: false, dependencies: null, components: [], skillRoots: [], hooksUnreadable: true, mcpUnreadable: true });
  });

  it("뿌리에 바로 놓인 SKILL.md와 소개도 구성 요소도 아닌 매니페스트 열쇠, 상속된 이름의 뿌리 항목은 알아보지 못한 것이다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", description: "d", keywords: ["k"], futureThing: true, experimental: { themes: "./t/", gadgets: "./g/" } }));
    await put(join(p, "SKILL.md"), "---\nname: single\n---\n");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await put(join(p, "constructor"), "x");
    await put(join(p, "toString"), "x");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.unknownEntries).toEqual(["SKILL.md", "constructor", "manifest:experimental.gadgets", "manifest:futureThing", "toString"]);
    expect(plugin!.components).toEqual(["skills", "themes"]);
    expect(plugin!.components.every((c) => typeof c === "string")).toBe(true);
  });

  it("유효 이름은 plugin.json의 name이고, 설치·켜짐의 이름은 마켓 항목의 이름이다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "runtime-name" }));
    await put(join(p, "skills", "one", "SKILL.md"), "---\nname: one\n---\n");
    await writeMarket("demo", [entry("store-alias")]);
    await writeInstalled({ "store-alias@demo": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ id: "store-alias@demo", entryName: "store-alias", name: "runtime-name" });
  });

  it("plugin.json이 없으면 마켓 항목이 매니페스트다. 구성 요소와 알아보지 못한 열쇠를 거기서 읽는다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p", { category: "dev", lspServers: { ts: { command: "tsls" } }, mcpServers: { live: { command: "srv" } }, dependencies: ["helper@other"], gizmo: 1 })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ manifest: "missing", compositionKnown: true, components: ["lspServers", "mcpServers", "skills"], dependencies: ["helper"], unknownEntries: ["entry:gizmo"] });
    expect(plugin!.mcpServers.map((s) => s.name)).toEqual(["live"]);
  });

  it("plugin.json이 있으면 마켓 항목의 skills·hooks 같은 구성 요소가 더해진다. strict가 거짓이면 뜨지 않는 조합이라 구성을 모른다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await put(join(p, "more", "extra", "SKILL.md"), "---\nname: extra\n---\n");
    await writeMarket("m", [entry("p", { skills: ["./more/extra"], hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "guard" }] }] }, dependencies: ["dep"] })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ compositionKnown: true, components: ["hooks", "skills"], dependencies: ["dep"], unknownEntries: [] });
    expect(plugin!.skillRoots).toEqual([join(p, "skills"), join(p, "more", "extra")]);
    await writeMarket("m", [entry("p", { strict: false, skills: ["./more/extra"] })]);
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ compositionKnown: false });
  });

  it("마켓 항목을 읽지 못하면(마켓 목록이 없음, 그 이름의 항목이 없음) 구성을 모르는 플러그인이다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ marketplaceEntry: "missing", compositionKnown: false });
    await writeMarket("m", [entry("other")]);
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ marketplaceEntry: "missing", compositionKnown: false });
  });

  it("기본 켜짐은 마켓 항목의 값이 매니페스트보다 앞선다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", defaultEnabled: true }));
    await writeMarket("m", [entry("p", { defaultEnabled: false })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]!.defaultEnabled).toBe(false);
  });

  it("같은 id·같은 설치 위치의 기록은 범위를 합쳐 하나로 본다. 기록의 차례와 상관없이 같다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }, { scope: "project", installPath: p, projectPath: join(root, "proj") }] });
    const a = await scanPlugins(home);
    await writeInstalled({ "p@m": [{ scope: "project", installPath: p, projectPath: join(root, "proj") }, { scope: "user", installPath: p }] });
    const b = await scanPlugins(home);
    expect(a.plugins).toHaveLength(1);
    expect(a.plugins[0]!.scopes).toEqual(["project", "user"]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("뿌리의 문서(.md, SKILL.md 제외)와 보조 폴더 일곱(대소문자를 가리지 않음)은 소개 쪽이다. 꼴이 다르면 알아보지 못한 것이다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    for (const doc of ["AGENTS.md", "CLAUDE.md", "CODE_OF_CONDUCT.md", "notes.MD"]) await put(join(p, doc), "x");
    for (const dir of ["Docs", "tests", "test", "examples", "assets", "images", "scripts"]) await put(join(p, dir, "f.txt"), "x");
    // 다른 도구가 읽는 설정 파일, 이름을 모르는 폴더, 뿌리의 스킬 파일, 소개 이름으로 시작하는 폴더, .md로 끝나는 폴더
    await put(join(p, "gemini-extension.json"), "{}");
    await put(join(p, "tools", "f.txt"), "x");
    await put(join(p, "skill.md"), "---\nname: root\n---\n");
    await put(join(p, "readme-dir", "f.txt"), "x");
    await put(join(p, "guide.md", "f.txt"), "x");
    // 보조 폴더의 이름이지만 파일이다
    const q = join(root, "q");
    await put(join(q, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await put(join(q, "scripts"), "x");
    await writeMarket("m", [entry("p"), entry("q")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }], "q@m": [{ scope: "user", installPath: q }] });
    const [plugin, other] = (await scanPlugins(home)).plugins;
    expect(plugin!.unknownEntries).toEqual(["gemini-extension.json", "guide.md", "readme-dir", "skill.md", "tools"]);
    expect(other!.unknownEntries).toEqual(["scripts"]);
  });

  it("매니페스트에 name이 없거나 글자가 아니거나 비었으면 풀리지 않는 매니페스트다. 구성을 모른다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    for (const manifest of [{ description: "d" }, { name: 3 }, { name: "" }]) {
      await put(join(p, ".claude-plugin", "plugin.json"), json(manifest));
      expect((await scanPlugins(home)).plugins[0]).toMatchObject({ manifest: "unparsable", compositionKnown: false, name: "p" });
    }
  });

  it("마켓의 installLocation이 파일이면 그 파일이 마켓 파일이다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    const file = join(root, "markets", "url-market.json");
    await put(file, json({ name: "u", plugins: [entry("p")] }));
    await put(join(home, "plugins", "known_marketplaces.json"), json({ u: { source: { source: "url" }, installLocation: file } }));
    await writeInstalled({ "p@u": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ marketplaceEntry: "ok", compositionKnown: true });
  });

  it("마켓 항목의 source가 마켓의 뿌리이고 skills를 적었으면 기본 skills/는 찾지 않는다. 뿌리가 아니면 더한다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "other", "SKILL.md"), "---\nname: other\n---\n");
    await put(join(p, "a", "SKILL.md"), "---\nname: a\n---\n");
    await put(join(p, "b", "one", "SKILL.md"), "---\nname: one\n---\n");
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    for (const source of [".", "./"]) {
      await writeMarket("m", [{ name: "p", source, skills: ["./a", "./b"] }]);
      expect((await scanPlugins(home)).plugins[0]!.skillRoots).toEqual([join(p, "a"), join(p, "b")]);
    }
    await writeMarket("m", [{ name: "p", source: "./p", skills: ["./a"] }]);
    expect((await scanPlugins(home)).plugins[0]!.skillRoots).toEqual([join(p, "skills"), join(p, "a")]);
  });

  it("skills가 플러그인 뿌리 자신을 가리키면 스킬 경로로 보지 않고 알아보지 못한 것으로 둔다", async () => {
    const p = join(root, "p");
    await put(join(p, "SKILL.md"), "---\nname: root\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    for (const skills of [".", "./", ["./", "./skills"]]) {
      await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", skills }));
      const [plugin] = (await scanPlugins(home)).plugins;
      expect(plugin!.skillRoots).toEqual([join(p, "skills")]);
      expect(plugin!.unknownEntries).toEqual(["SKILL.md", "manifest:skills=."]);
    }
  });

  it("마켓 항목의 hooks를 경로로 적었으면 훅이 든 플러그인이지만 그 훅은 돌지 않는다. 읽지 못한 것이 아니다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await put(join(p, "more-hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await writeMarket("m", [entry("p", { hooks: "./more-hooks.json" })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ compositionKnown: true, hooksUnreadable: false, components: ["hooks", "skills"], unknownEntries: [] });
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
  });

  it("plugin.json이 있어도 마켓 항목의 모르는 열쇠는 알아보지 못한 것이다. 항목의 mcpServers·userConfig는 듣지 않으므로 세지 않는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p", { category: "dev", gizmo: 1, mcpServers: { live: { command: "srv" } }, userConfig: { k: {} } })]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ components: ["skills"], unknownEntries: ["entry:gizmo"] });
    expect(plugin!.mcpServers).toEqual([]);
  });

  it("설치 ID가 @builtin으로 끝나는 것은 플러그인으로 세지 않는다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }], "tool-thing@builtin": [{ scope: "user", installPath: join(root, "builtin") }] });
    expect((await scanPlugins(home)).plugins.map((x) => x.id)).toEqual(["p@m"]);
  });

  it("스킬 폴더에 둔 플러그인(@skills-dir)은 마켓 항목 없이 매니페스트와 폴더로 구성을 안다. 뿌리의 SKILL.md는 알아보지 못한 것이다", async () => {
    const p = join(root, "skills", "tool-folder");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "my-tool" }));
    await put(join(p, "SKILL.md"), "---\nname: my-tool\n---\n");
    await put(join(p, "skills", "inner", "SKILL.md"), "---\nname: inner\n---\n");
    const [plugin] = await readSkillsDirPlugins([{ path: p, scope: "user", projectRoot: null }]);
    expect(plugin).toMatchObject({ id: "my-tool@skills-dir", entryName: "my-tool", name: "my-tool", marketplace: "skills-dir", marketplaceEntry: "none", compositionKnown: true, scopes: ["user"], projectPaths: [], unknownEntries: ["SKILL.md"], components: ["skills"], defaultEnabled: true });
  });

  it("스킬 폴더에 둔 플러그인의 매니페스트가 풀리지 않거나 name이 없으면 구성을 모르고 이름은 폴더 이름이다", async () => {
    const p = join(root, "skills", "broken-tool");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ description: "d" }));
    const [plugin] = await readSkillsDirPlugins([{ path: p, scope: "project", projectRoot: "/proj" }]);
    expect(plugin).toMatchObject({ id: "broken-tool@skills-dir", manifest: "unparsable", compositionKnown: false, scopes: ["project"], projectPaths: ["/proj"] });
  });

  it("MCP 서버는 기본 .mcp.json 다음에 매니페스트의 선언을 차례대로 읽고 같은 이름은 나중 것이 통째로 대신한다. 목록에 경로와 인라인을 섞을 수 있고 주소는 읽지 못한다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", mcpServers: ["./servers.json", { db: { command: "inline-db" }, extra: { command: "e" } }, "https://example.com/mcp.json"] }));
    await put(join(p, ".mcp.json"), json({ mcpServers: { db: { command: "default-db", env: { K: "1" } }, keep: { command: "k" } } }));
    await put(join(p, "servers.json"), json({ mcpServers: { db: { command: "file-db" } } }));
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.mcpServers.map((s) => [s.name, s.definition])).toEqual([
      ["db", { command: "inline-db" }],
      ["extra", { command: "e" }],
      ["keep", { command: "k" }],
    ]);
    expect(plugin!.mcpUnreadable).toBe(true);
    expect(plugin!.unknownEntries).toEqual([]);
  });

  it("같은 MCP 파일을 두 번 선언하면 나중 자리에서 다시 대신한다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", mcpServers: ["./a.json", "./b.json", "./a.json"] }));
    await put(join(p, "a.json"), json({ mcpServers: { db: { command: "from-a" } } }));
    await put(join(p, "b.json"), json({ mcpServers: { db: { command: "from-b" } } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]!.mcpServers).toEqual([{ name: "db", definition: { command: "from-a" } }]);
  });

  it("매니페스트의 hooks 목록은 경로와 인라인 묶음을 섞을 수 있고, 기본 hooks/hooks.json 뒤에 차례대로 더해진다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: ["./extra-hooks.json", { PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "inline" }] }] }] }));
    await put(join(p, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "default" }] }] } }));
    await put(join(p, "extra-hooks.json"), json({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "file" }] }] } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    const events = plugin!.hookEvents[0] as Record<string, { matcher?: string }[]>;
    expect(events.PreToolUse!.map((g) => g.matcher)).toEqual(["Bash", "Write"]);
    expect(Object.keys(events).sort()).toEqual(["PreToolUse", "SessionStart"]);
    expect(plugin).toMatchObject({ hooksUnreadable: false, unknownEntries: [] });
  });

  it("skills가 플러그인 뿌리를 가리키는 링크여도 뿌리 자신으로 보고 스킬 경로에서 뺀다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", skills: ["./alias"] }));
    await put(join(p, "SKILL.md"), "---\nname: root\n---\n");
    await linkDir(p, join(p, "alias"));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.skillRoots).toEqual([join(p, "skills")]);
    expect(plugin!.unknownEntries).toEqual(["SKILL.md", "manifest:skills=."]);
  });

  it("기본 skills/가 플러그인 뿌리를 가리키는 링크면 훑지 않고 알아보지 못한 것(skills=.)으로 둔다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await put(join(p, "SKILL.md"), "---\nname: root\n---\n");
    await linkDir(p, join(p, "skills"));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.skillRoots).toEqual([]);
    expect(plugin!.unknownEntries).toEqual(["SKILL.md", "skills=."]);
  });

  it("매니페스트가 기본 훅 파일을 다시 가리켜도 그 파일은 한 번만 읽는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./hooks/hooks.json" }));
    await put(join(p, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "x" }] }] } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect((plugin!.hookEvents[0] as Record<string, unknown[]>).PreToolUse).toHaveLength(1);
  });

  it("매니페스트가 선언한 훅·MCP 파일이 없으면 그 종류를 읽지 못한 것이다. 기본 파일이 없는 것은 정상이다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./missing-hooks.json", mcpServers: "./missing-mcp.json" }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ hooksUnreadable: true, mcpUnreadable: true, mcpServers: [] });
    // 기본 파일을 다시 가리켰는데 그 파일도 없다(먼저 기본 파일로 읽었어도 선언한 것은 없다고 알린다)
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./hooks/hooks.json", mcpServers: "./.mcp.json" }));
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ hooksUnreadable: true, mcpUnreadable: true });
    // 선언하지 않았고 기본 파일도 없다
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ hooksUnreadable: false, mcpUnreadable: false });
  });

  it("훅 파일에 hooks 감싸개가 없거나 처리기 하나라도 형식에 맞지 않으면 그 파일의 훅은 하나도 넣지 않고 읽지 못한 것이다", async () => {
    const p = join(root, "p");
    const guard = { matcher: "Bash", hooks: [{ type: "command", command: "g" }] };
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./extra.json" }));
    await put(join(p, "hooks", "hooks.json"), json({ PreToolUse: [guard] }));
    await put(join(p, "extra.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }, { type: "command" }] }] } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ compositionKnown: true, hooksUnreadable: true, components: ["hooks"] });
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
  });

  it("매니페스트와 마켓 항목의 인라인 훅은 감싸개 없는 사건 묶음이다. 감싸개를 씌우면 읽지 못한 것이고 그 묶음은 넣지 않는다", async () => {
    const p = join(root, "p");
    const map = { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] };
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: { hooks: map } }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    let [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.hooksUnreadable).toBe(true);
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
    // 매니페스트의 인라인은 맞고 마켓 항목의 것에 감싸개를 씌웠다. 항목의 것은 사건을 대신하지 못한다
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: map }));
    await writeMarket("m", [entry("p", { hooks: { hooks: map } })]);
    [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.hooksUnreadable).toBe(true);
    expect(JSON.stringify(plugin!.hookEvents)).toBe(JSON.stringify([map]));
  });

  it("선언한 구성 요소 경로가 플러그인 뿌리 밖으로 풀리면 도구가 버리므로 읽지 않는다. 훅·MCP는 읽지 못한 것, 스킬 경로는 알아보지 못한 것(skills=..)이다", async () => {
    const p = join(root, "p");
    // 이름이 뿌리 이름으로 시작하는 옆 폴더(p-shared)도 밖이다
    const outside = join(root, "p-shared");
    await put(join(outside, "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await put(join(outside, "mcp.json"), json({ mcpServers: { far: { command: "f" } } }));
    await put(join(outside, "skills", "far", "SKILL.md"), "---\nname: far\n---\n");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "../p-shared/hooks.json", mcpServers: "../p-shared/mcp.json", skills: "../p-shared/skills" }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const check = async (): Promise<void> => {
      const [plugin] = (await scanPlugins(home)).plugins;
      expect(plugin).toMatchObject({ hooksUnreadable: true, mcpUnreadable: true, mcpServers: [], skillRoots: [join(p, "skills")] });
      expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
      expect(plugin!.unknownEntries).toContain("manifest:skills=..");
    };
    await check();
    // 뿌리 안의 링크가 밖을 가리켜도 밖이다
    await linkDir(outside, join(p, "linked"));
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./linked/hooks.json", mcpServers: "./linked/mcp.json", skills: "./linked/skills" }));
    await check();
    // 밖을 가리키는 스킬 경로는 없어도 알아보지 못한 것이다. 안쪽의 없는 경로는 밖이 아니다
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", skills: "../gone" }));
    let [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ hooksUnreadable: false, mcpUnreadable: false, skillRoots: [join(p, "skills")] });
    expect(plugin!.unknownEntries).toContain("manifest:skills=..");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", skills: "./nope" }));
    [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.skillRoots).toEqual([join(p, "skills"), join(p, "nope")]);
    expect(plugin!.unknownEntries).not.toContain("manifest:skills=..");
  });

  it("기본 hooks/hooks.json도 플러그인 뿌리 밖으로 풀리면 도구가 건너뛰므로 읽지 않고 읽지 못한 것이다. 매니페스트가 같은 경로를 다시 적어도 같다", async () => {
    const p = join(root, "p");
    const outside = join(root, "dotfiles");
    await put(join(outside, "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await linkDir(outside, join(p, "hooks"));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    let [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ hooksUnreadable: true, components: ["hooks"] });
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: "./hooks/hooks.json" }));
    [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin!.hooksUnreadable).toBe(true);
    expect(JSON.stringify(plugin!.hookEvents)).toBe("[{}]");
  });

  it("선언한 경로는 ./로 시작하고 .. 부분이 없어야 한다. 안쪽을 가리켜도 절대 경로나 .. 부분이 있는 MCP 파일은 도구가 읽지 않으므로 앞의 정의를 덮지 않는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".mcp.json"), json({ mcpServers: { db: { command: "default-db" } } }));
    await put(join(p, "x.json"), json({ mcpServers: { db: { command: "file-db" } } }));
    await put(join(p, "sub", "keep.txt"), "x");
    await put(join(p, "h.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await put(join(p, "extra", "one", "SKILL.md"), "---\nname: one\n---\n");
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const scan = async (manifest: Record<string, unknown>) => {
      await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", ...manifest }));
      return (await scanPlugins(home)).plugins[0]!;
    };
    for (const bad of ["./sub/../x.json", join(p, "x.json"), "x.json"]) {
      expect(await scan({ mcpServers: bad })).toMatchObject({ mcpUnreadable: true, mcpServers: [{ name: "db", definition: { command: "default-db" } }] });
    }
    for (const bad of ["./sub/../h.json", join(p, "h.json"), "h.json"]) {
      const plugin = await scan({ hooks: bad });
      expect(plugin.hooksUnreadable).toBe(true);
      expect(JSON.stringify(plugin.hookEvents)).toBe("[{}]");
    }
    for (const bad of ["./sub/../extra", join(p, "extra"), "extra"]) {
      const plugin = await scan({ skills: bad });
      expect(plugin.skillRoots).toEqual([join(p, "skills")]);
      expect(plugin.unknownEntries).toContain("manifest:skills=..");
    }
    // 바른 꼴은 읽는다. 이름에 ..이 든 폴더(a..b)는 .. 부분이 아니다
    await put(join(p, "a..b", "y.json"), json({ mcpServers: { more: { command: "m" } } }));
    const ok = await scan({ mcpServers: ["./x.json", "./a..b/y.json"], hooks: "./h.json", skills: "./extra" });
    expect(ok).toMatchObject({ mcpUnreadable: false, hooksUnreadable: false, skillRoots: [join(p, "skills"), join(p, "extra")] });
    expect(ok.mcpServers).toEqual([
      { name: "db", definition: { command: "file-db" } },
      { name: "more", definition: { command: "m" } },
    ]);
  });

  it("hooks·mcpServers 목록의 요소가 글자도 묶음도 아니면 읽지 못한 것이다. 나머지 요소는 읽는다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p", hooks: [3], mcpServers: [true, { db: { command: "d" } }] }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    const [plugin] = (await scanPlugins(home)).plugins;
    expect(plugin).toMatchObject({ hooksUnreadable: true, mcpUnreadable: true });
    expect(plugin!.mcpServers.map((s) => s.name)).toEqual(["db"]);
  });

  it("known_marketplaces.json이 풀리지 않거나 모양이 틀리면 마켓 항목을 읽지 못한 것이다. 파일이 없으면 없는 것이다", async () => {
    const p = join(root, "p");
    await put(join(p, "skills", "s", "SKILL.md"), "---\nname: s\n---\n");
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    expect((await scanPlugins(home)).plugins[0]!.marketplaceEntry).toBe("missing");
    for (const broken of ["{", "[]"]) {
      await put(join(home, "plugins", "known_marketplaces.json"), broken);
      expect((await scanPlugins(home)).plugins[0]).toMatchObject({ marketplaceEntry: "unreadable", compositionKnown: false });
    }
  });

  it("뿌리의 목록을 읽지 못하면 구성을 모르는 플러그인이다", async () => {
    const p = join(root, "p");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "p" }));
    await writeMarket("m", [entry("p")]);
    await writeInstalled({ "p@m": [{ scope: "user", installPath: p }] });
    vi.mocked(fsp.readdir).mockImplementation((async (path: unknown, ...rest: unknown[]) => {
      if (String(path) === p) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return (actual.readdir as (...args: unknown[]) => unknown)(path, ...rest);
    }) as never);
    expect((await scanPlugins(home)).plugins[0]).toMatchObject({ exists: true, compositionKnown: false, unknownEntries: [] });
  });
});

describe("mcpMapOf", () => {
  it("{ mcpServers: … }와 이름 묶음 그대로를 다 받는다", () => {
    expect(mcpMapOf({ mcpServers: { a: { command: "x" } } })!.map((e) => e.name)).toEqual(["a"]);
    expect(mcpMapOf({ b: { url: "u" } })!.map((e) => e.name)).toEqual(["b"]);
  });
  it("mcpServers 열쇠가 있는데 객체가 아니면 풀리지 않은 것이다. 가짜 서버를 만들지 않는다", () => {
    for (const bad of [{ mcpServers: [] }, { mcpServers: null }, { mcpServers: "x" }, "x", null]) expect(mcpMapOf(bad)).toBeNull();
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/plugins.test.ts`
Expected: FAIL. `../../src/scan/plugins.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/plugins.ts`:

```ts
// 설치된 플러그인(installed_plugins.json)마다 설치 위치, 매니페스트와 마켓 항목을 합친 유효 구성(알아보지 못한 것 포함), 유효 이름, 기대는 플러그인, 훅·MCP 서버 정의·스킬 경로를 읽는다(설계 10 「플러그인의 구성」, 16.2 A2)
import { basename, join, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { entryInfo, listDir, readJson } from "./fs.ts";
import { hookFileEvents, inlineHookEvents } from "./hooks.ts";
import { isObject } from "./json.ts";

export type ComponentKind =
  | "skills"
  | "commands"
  | "agents"
  | "workflows"
  | "outputStyles"
  | "themes"
  | "monitors"
  | "hooks"
  | "bin"
  | "settings"
  | "mcpServers"
  | "lspServers"
  | "userConfig"
  | "channels";

/** 플러그인 뿌리의 기본 자리(공식 문서 plugins-reference). 뿌리에 바로 놓인 SKILL.md는 여기에 없어서 알아보지 못한 것이 된다(설계 10) */
const DEFAULT_ENTRIES: Readonly<Record<string, ComponentKind>> = {
  skills: "skills",
  commands: "commands",
  agents: "agents",
  workflows: "workflows",
  "output-styles": "outputStyles",
  themes: "themes",
  monitors: "monitors",
  hooks: "hooks",
  bin: "bin",
  "settings.json": "settings",
  ".mcp.json": "mcpServers",
  ".lsp.json": "lspServers",
};

/** 구성 요소를 정하는 매니페스트 열쇠. */
const MANIFEST_COMPONENTS: readonly [string, ComponentKind][] = [
  ["skills", "skills"],
  ["commands", "commands"],
  ["agents", "agents"],
  ["workflows", "workflows"],
  ["outputStyles", "outputStyles"],
  ["hooks", "hooks"],
  ["mcpServers", "mcpServers"],
  ["lspServers", "lspServers"],
  ["userConfig", "userConfig"],
  ["channels", "channels"],
];
const COMPONENT_KEYS = new Set(MANIFEST_COMPONENTS.map(([key]) => key));

/** plugin.json이 있을 때 마켓 항목에서 더해지는 구성 요소(strict가 참일 때. 공식 문서 manifest-reference 「How entry fields combine with plugin.json」) */
const ENTRY_APPENDED = new Set(["commands", "agents", "skills", "hooks", "outputStyles", "themes"]);

/** 소개 파일. 이름이 README·LICENSE·CHANGELOG로 시작하는 파일과 package.json이다. 점으로 시작하는 것은 따로 뺀다(설계 10 「플러그인의 구성」). */
const INTRO_FILES = /^(readme|license|changelog)|^package\.json$/i;

/** 뿌리의 보조 폴더. 도구가 스스로 싣지 않는 폴더다(설계 10 「플러그인의 구성」, 공식 문서 manifest-reference 「Standard layout」). 이름은 대소문자를 가리지 않고 견준다 */
const HELPER_DIRS = new Set(["docs", "tests", "test", "examples", "assets", "images", "scripts"]);

/** 마켓의 뿌리를 뜻하는 source(설계 10). */
const MARKET_ROOT_SOURCES = new Set([".", "./"]);

/** 파일 경로가 아니라 주소로 적은 것(예. https://…). 도구는 내려받아 읽지만 첫 버전의 스캐너는 내려받지 않으므로 정의를 읽지 못한 것으로 둔다. */
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * 선언한 구성 요소 경로의 꼴. ./로 시작하고 .. 부분이 없어야 한다. ./로 시작하지 않으면 검증에 실패하고(공식 문서 plugins-reference 「Path rules」),
 * MCP 파일은 절대 경로이거나 .. 부분이 있으면 안쪽을 가리켜도 읽지 않는다(errors 「Server file path not read」). 훅과 스킬 경로에도 같은 꼴을 요구한다(엄한 쪽, 설계 10)
 */
const wellFormedPath = (path: string): boolean => path.startsWith("./") && !path.split(/[\\/]/).includes("..");

/**
 * 매니페스트의 hooks·mcpServers 선언을 차례대로 편다(공식 문서 plugins-reference 「Hooks」, 「MCP servers」).
 * 글자는 경로, 묶음은 인라인이고 목록은 둘을 섞을 수 있다. 모양이 다른 요소는 null(읽지 못한 것)이다.
 */
function declarationsOf(value: unknown): (string | Json | null)[] {
  if (value === undefined) return [];
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.map((item) => (typeof item === "string" ? item : isObject(item) ? item : null));
}

/** 스킬 폴더에 둔 플러그인의 ID에서 마켓 자리에 오는 이름(공식 문서 marketplace-reference 「Reserved names」). */
const SKILLS_DIR = "skills-dir";

/**
 * 뿌리 항목 하나가 소개 쪽인지. 소개 파일, SKILL.md가 아닌 .md 파일(문서), 보조 폴더다. 링크는 대상의 꼴로 본다.
 * .md는 대소문자를 가리지 않고 보고, 뿌리의 SKILL.md(대소문자 상관없이)는 알아보지 못한 것으로 남긴다(엄한 쪽).
 */
async function isIntroEntry(root: string, name: string): Promise<boolean> {
  const lower = name.toLowerCase();
  const info = await entryInfo(join(root, name));
  if (info.isFile) return INTRO_FILES.test(name) || (lower.endsWith(".md") && lower !== "skill.md");
  if (info.isDir) return HELPER_DIRS.has(lower);
  return false;
}

/** 매니페스트의 소개 열쇠와 dependencies. 이 밖의 열쇠 가운데 구성 요소가 아닌 것은 알아보지 못한 것이다. */
const INTRO_KEYS = new Set(["$schema", "name", "displayName", "version", "description", "author", "homepage", "repository", "license", "keywords", "metadata", "defaultEnabled", "dependencies"]);

/** 마켓 항목의 열쇠 가운데 구성 요소가 아닌 것(공식 문서 marketplace-reference 「Plugin entries」). 마켓 항목이 매니페스트 노릇을 할 때 이 밖의 열쇠는 알아보지 못한 것이다. */
const ENTRY_INTRO_KEYS = new Set([...INTRO_KEYS, "source", "category", "tags", "strict", "relevance", "headers", "headersHelper"]);

type Json = Record<string, unknown>;

export interface McpDefinitionEntry {
  name: string;
  /** 서버 정의(메모리에서만 쓴다) */
  definition: Json | null;
}

export interface PluginInstall {
  /** '<마켓 항목 이름>@<마켓>'. enabledPlugins·pluginUsage·설치 기록의 열쇠다 */
  id: string;
  /** 마켓 항목의 이름(id의 @ 앞). 다른 플러그인의 dependencies가 가리키는 이름이다 */
  entryName: string;
  marketplace: string;
  /** 구성 요소의 이름 접두로 쓰는 유효 이름. plugin.json의 name, 없으면 마켓 항목의 이름이다(공식 문서 plugins-reference 「Required fields」) */
  name: string;
  /** 이 설치 위치를 쓰는 설치 기록의 범위(중복 없이 차례대로) */
  scopes: string[];
  /** 프로젝트·로컬 범위 기록의 프로젝트(정규화, 차례대로) */
  projectPaths: string[];
  installPath: string;
  exists: boolean;
  manifest: "ok" | "missing" | "unparsable" | "unreadable";
  /** 마켓 항목. missing은 마켓의 목록 파일이나 그 이름의 항목이 없는 것이다. none은 마켓에서 오지 않은 플러그인(스킬 폴더에 둔 것)이라 항목이 없는 것이 정상이다 */
  marketplaceEntry: "ok" | "missing" | "unreadable" | "none";
  /** 어느 설정에도 켜고 끈 기록이 없을 때의 값(마켓 항목의 defaultEnabled가 앞서고, 다음은 매니페스트, 없으면 참) */
  defaultEnabled: boolean;
  components: ComponentKind[];
  /** 알아보지 못한 뿌리 항목과 열쇠(매니페스트 열쇠는 "manifest:", 매니페스트 노릇을 하는 마켓 항목의 열쇠는 "entry:" 접두, 이름 차례) */
  unknownEntries: string[];
  /** plugin.json과 마켓 항목의 dependencies를 합친 플러그인 이름(마켓과 버전 조건은 뗀다). 구성을 모르면 null(기대는지 알 수 없음) */
  dependencies: string[] | null;
  /** 구성을 아는지. 놓인 곳이나 그 목록을 읽지 못함, 매니페스트가 있는데 풀리지 않음, 마켓 항목을 읽지 못함, 뜨지 않는 조합(strict가 거짓인데 마켓 항목에도 구성 요소)이면 거짓이다(설계 10) */
  compositionKnown: boolean;
  /** 사건마다 합친 훅 묶음 하나(메모리에서만 쓴다) */
  hookEvents: unknown[];
  hooksUnreadable: boolean;
  mcpServers: McpDefinitionEntry[];
  mcpUnreadable: boolean;
  /** 스킬 경로(기본 skills와 매니페스트·마켓 항목의 skills). 경로 자체가 스킬 폴더일 수도 있다. 구성을 모르면 비어 있다 */
  skillRoots: string[];
}

export interface PluginsScan {
  file: "ok" | "missing" | "unparsable" | "unreadable";
  plugins: PluginInstall[];
}

const pathsOf = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const firstSegment = (path: string): string => path.replace(/\\/g, "/").replace(/^\.\//, "").split("/")[0] ?? "";
const bareName = (name: string): string => (name.includes("@") ? name.slice(0, name.indexOf("@")) : name);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** MCP 정의 묶음({ mcpServers: { 이름: 정의 } } 또는 { 이름: 정의 })을 펼친다. mcpServers 열쇠가 있는데 객체가 아니거나 모양이 다르면 null이다. */
export function mcpMapOf(value: unknown): McpDefinitionEntry[] | null {
  if (!isObject(value)) return null;
  let map: Json = value;
  if (Object.hasOwn(value, "mcpServers")) {
    if (!isObject(value.mcpServers)) return null;
    map = value.mcpServers;
  }
  return Object.keys(map)
    .sort()
    .map((name) => ({ name, definition: isObject(map[name]) ? (map[name] as Json) : null }));
}

export interface MarketplaceEntries {
  /** known_marketplaces.json의 상태. ok가 아니면 마켓을 하나도 모른다. 없는 것(missing)과 풀리지 않거나 읽지 못한 것(unreadable)을 가른다 */
  file: "ok" | "missing" | "unreadable";
  /** 마켓 이름 → 그 마켓의 항목(이름 → 항목). 마켓의 목록 파일을 읽지 못하면 "unreadable", 없으면 "missing" */
  markets: Map<string, Map<string, Json> | "missing" | "unreadable">;
}

/** <홈>/plugins/known_marketplaces.json의 installLocation 아래 .claude-plugin/marketplace.json에서 마켓 항목을 읽는다. */
export async function readMarketplaceEntries(claudeHome: string): Promise<MarketplaceEntries> {
  const markets = new Map<string, Map<string, Json> | "missing" | "unreadable">();
  const known = await readJson(join(claudeHome, "plugins", "known_marketplaces.json"));
  if (known.status === "missing") return { file: "missing", markets };
  if (known.status !== "ok" || !isObject(known.value)) return { file: "unreadable", markets };
  for (const [market, info] of Object.entries(known.value)) {
    if (!isObject(info) || typeof info.installLocation !== "string") {
      markets.set(market, "unreadable");
      continue;
    }
    // installLocation이 폴더이면 그 아래의 .claude-plugin/marketplace.json, 파일이면 그 파일이다(설계 10 「마켓 항목」. 주소로 더한 마켓은 파일 하나일 수 있다)
    const location = info.installLocation;
    const read = await readJson((await entryInfo(location)).isFile ? location : join(location, ".claude-plugin", "marketplace.json"));
    if (read.status === "missing") {
      markets.set(market, "missing");
      continue;
    }
    if (read.status !== "ok" || !isObject(read.value) || !Array.isArray(read.value.plugins)) {
      markets.set(market, "unreadable");
      continue;
    }
    const entries = new Map<string, Json>();
    for (const entry of read.value.plugins) if (isObject(entry) && typeof entry.name === "string" && !entries.has(entry.name)) entries.set(entry.name, entry);
    markets.set(market, entries);
  }
  return { file: "ok", markets };
}

/** 훅 묶음들을 사건마다 합친다. replace에 든 사건은 앞의 것을 대신한다(마켓 항목의 훅). */
function mergeEvents(base: readonly unknown[], replace: unknown): Json {
  const merged: Json = Object.create(null) as Json;
  for (const events of base) {
    if (!isObject(events)) continue;
    for (const [event, groups] of Object.entries(events)) if (Array.isArray(groups)) merged[event] = [...((merged[event] as unknown[] | undefined) ?? []), ...groups];
  }
  if (isObject(replace)) for (const [event, groups] of Object.entries(replace)) if (Array.isArray(groups)) merged[event] = [...groups];
  return merged;
}

export interface InstallGroup {
  id: string;
  installPath: string;
  scopes: Set<string>;
  projectPaths: Set<string>;
}

export async function readPluginInstall(group: InstallGroup, markets: MarketplaceEntries): Promise<PluginInstall> {
  const { id, installPath } = group;
  const at = id.lastIndexOf("@");
  const entryName = at === -1 ? id : id.slice(0, at);
  const marketplace = at === -1 ? "" : id.slice(at + 1);
  const plugin: PluginInstall = {
    id,
    entryName,
    marketplace,
    name: entryName,
    scopes: [...group.scopes].sort(),
    projectPaths: [...group.projectPaths].sort(),
    installPath,
    exists: false,
    manifest: "missing",
    marketplaceEntry: "missing",
    defaultEnabled: true,
    components: [],
    unknownEntries: [],
    dependencies: null,
    compositionKnown: false,
    hookEvents: [],
    hooksUnreadable: false,
    mcpServers: [],
    mcpUnreadable: false,
    skillRoots: [],
  };
  // 구성을 모르는 플러그인은 구성과 스킬을 보지 않는다. 훅과 MCP 정의도 읽지 못한 것으로 적는다(설계 10, 20.1)
  const unknown = (): PluginInstall => {
    plugin.hooksUnreadable = true;
    plugin.mcpUnreadable = true;
    return plugin;
  };

  // 스킬 폴더에 둔 플러그인은 마켓에서 오지 않는다. 마켓 항목 없이(빈 항목으로) 매니페스트와 폴더로 구성을 안다(설계 10 「스킬 폴더에 둔 플러그인」)
  const market = markets.markets.get(marketplace);
  const fromSkillsDir = marketplace === SKILLS_DIR;
  const entry: Json | undefined = fromSkillsDir ? {} : market instanceof Map ? market.get(entryName) : undefined;
  // 마켓 목록 파일(known_marketplaces.json)이 풀리지 않거나 읽지 못했으면 그 마켓이 없는 것이 아니라 읽지 못한 것이다
  const marketUnreadable = market === "unreadable" || (market === undefined && markets.file === "unreadable");
  plugin.marketplaceEntry = fromSkillsDir ? "none" : entry !== undefined ? "ok" : marketUnreadable ? "unreadable" : "missing";

  plugin.exists = (await entryInfo(installPath)).isDir;
  if (!plugin.exists) return unknown();
  const listing = await listDir(installPath);
  const manifestRead = await readJson(join(installPath, ".claude-plugin", "plugin.json"));
  let manifest: Json | null = null;
  // 매니페스트가 있으면 name이 유일한 필수 열쇠다. 없거나 글자가 아니거나 비었으면 도구가 싣지 않으므로 풀리지 않는 매니페스트로 본다(공식 문서 plugins-reference 「Required fields」, 설계 10)
  if (manifestRead.status === "ok" && isObject(manifestRead.value) && typeof manifestRead.value.name === "string" && manifestRead.value.name !== "") {
    plugin.manifest = "ok";
    manifest = manifestRead.value;
    plugin.name = manifestRead.value.name;
  } else {
    plugin.manifest = manifestRead.status === "ok" ? "unparsable" : manifestRead.status;
  }
  // 기본 켜짐: 마켓 항목의 값이 앞서고, 다음은 매니페스트, 없으면 참(공식 문서 plugins-reference 「Default enablement」)
  if (entry !== undefined && typeof entry.defaultEnabled === "boolean") plugin.defaultEnabled = entry.defaultEnabled;
  else if (manifest !== null) plugin.defaultEnabled = manifest.defaultEnabled !== false;

  if (listing.status !== "ok") return unknown();
  if (plugin.manifest === "unparsable" || plugin.manifest === "unreadable") return unknown();
  if (entry === undefined) return unknown();
  if (manifest !== null && entry.strict === false && Object.keys(entry).some((key) => ENTRY_APPENDED.has(key))) return unknown();

  // 유효 구성: plugin.json이 있으면 그것에 마켓 항목의 여섯 구성 요소를 더하고, 없으면 마켓 항목이 곧 매니페스트다
  const base: Json = manifest ?? entry;
  const appended: Json = manifest !== null ? Object.fromEntries(Object.entries(entry).filter(([key]) => ENTRY_APPENDED.has(key))) : {};
  plugin.compositionKnown = true;

  const deps = [...(Array.isArray(base.dependencies) ? base.dependencies : []), ...(manifest !== null && Array.isArray(entry.dependencies) ? entry.dependencies : [])];
  plugin.dependencies = [...new Set(deps.flatMap((d) => (typeof d === "string" ? [bareName(d)] : isObject(d) && typeof d.name === "string" ? [bareName(d.name)] : [])))].sort();

  const kinds = new Set<ComponentKind>();
  const referenced = new Set<string>();
  const addComponents = (source: Json): void => {
    for (const [key, kind] of MANIFEST_COMPONENTS) {
      if (source[key] === undefined) continue;
      kinds.add(kind);
      for (const path of pathsOf(source[key])) referenced.add(firstSegment(path));
    }
    const experimental = isObject(source.experimental) ? source.experimental : {};
    for (const [key, kind] of [["themes", "themes"], ["monitors", "monitors"]] as const) {
      if (experimental[key] === undefined) continue;
      kinds.add(kind);
      for (const path of pathsOf(experimental[key])) referenced.add(firstSegment(path));
    }
    if (source.themes !== undefined) {
      kinds.add("themes");
      for (const path of pathsOf(source.themes)) referenced.add(firstSegment(path));
    }
  };
  addComponents(base);
  addComponents(appended);

  // 알아보지 못한 열쇠. 매니페스트가 있어도 마켓 항목의 열쇠를 본다(설계 10 표의 셋째 줄). 항목의 mcpServers 같은 구성 요소 열쇠는 듣지 않을 뿐 모르는 것이 아니다
  const prefix = manifest !== null ? "manifest" : "entry";
  const unknownKeys = (source: Json, from: string, known: ReadonlySet<string>): void => {
    for (const key of Object.keys(source)) {
      if (key === "experimental") {
        const experimental = isObject(source.experimental) ? source.experimental : {};
        for (const inner of Object.keys(experimental)) if (inner !== "themes" && inner !== "monitors") plugin.unknownEntries.push(`${from}:experimental.${inner}`);
        continue;
      }
      if (!known.has(key) && !COMPONENT_KEYS.has(key) && key !== "themes") plugin.unknownEntries.push(`${from}:${key}`);
    }
  };
  if (manifest !== null) unknownKeys(manifest, "manifest", INTRO_KEYS);
  unknownKeys(entry, "entry", ENTRY_INTRO_KEYS);
  for (const name of listing.names) {
    const kind = Object.hasOwn(DEFAULT_ENTRIES, name) ? DEFAULT_ENTRIES[name] : undefined;
    if (kind !== undefined) {
      kinds.add(kind);
      continue;
    }
    if (name.startsWith(".") || referenced.has(name) || (await isIntroEntry(installPath, name))) continue;
    plugin.unknownEntries.push(name);
  }
  plugin.components = [...kinds].sort();

  // 훅: 기본 hooks/hooks.json을 먼저 읽고 plugin.json의 hooks 선언(경로, 인라인 묶음, 둘을 섞은 목록)을 차례대로 더한다(공식 문서 plugins-reference 「Hooks」).
  // 구성 요소 경로는 플러그인 뿌리 안이어야 한다. 있는 경로의 실제 경로(링크를 푼 곳)가 뿌리의 실제 경로 밖이면 도구가 그 경로를 버리고 나머지를 싣는다. 선언한 경로뿐 아니라 기본 hooks/hooks.json도 같다
  // (공식 문서 plugins loading 「Paths that escape the plugin directory」, errors 「Path escapes plugin directory」). 같은 마켓 안의 다른 플러그인이나 로컬 마켓 안을 가리키는 링크는 도구가 받지만
  // 여기서는 밖으로 본다(엄한 쪽, 설계 27). 선언한 경로는 꼴(wellFormedPath)도 맞아야 하고, 그 꼴이면 표기로 풀어도 뿌리 밖으로 나가지 않는다
  const root = normalizePath(installPath);
  const rootReal = (await entryInfo(installPath)).realPath;
  const within = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);
  const insideRoot = async (path: string): Promise<boolean> => {
    const real = (await entryInfo(path)).realPath;
    return real === null || rootReal === null || within(real, rootReal);
  };
  /** 도구가 받는 선언 경로면 푼 경로, 아니면 null */
  const declaredPath = async (declared: string): Promise<string | null> => {
    if (!wellFormedPath(declared)) return null;
    const path = resolve(installPath, declared);
    return (await insideRoot(path)) ? path : null;
  };

  // 훅 파일은 맨 위 hooks 감싸개 안에 사건 묶음을 두고, 인라인은 사건 묶음 그대로다. 감싸개가 없거나 뼈대가 형식에 맞지 않는 파일·인라인은 도구가 싣지 않으므로 넣지 않고 읽지 못한 것으로 둔다.
  // 같은 경로(정규화한 표기)의 훅 파일을 두 번 적으면 한 번만 읽고 그 결과를 다시 쓴다. 선언한 파일이 없으면 읽지 못한 것이고, 기본 파일이 없는 것은 정상이다.
  // 마켓 항목의 hooks(인라인만)는 plugin.json이 있으면 사건마다 앞의 것을 대신한다
  const hookSources: Json[] = [];
  const hookFileStatus = new Map<string, "ok" | "missing" | "bad">();
  const addHookFile = async (path: string, declared: boolean): Promise<void> => {
    const key = normalizePath(path);
    let status = hookFileStatus.get(key);
    if (status === undefined) {
      const read = await readJson(path);
      const events = read.status === "ok" ? hookFileEvents(read.value) : null;
      status = read.status === "missing" ? "missing" : events !== null ? "ok" : "bad";
      hookFileStatus.set(key, status);
      if (events !== null) hookSources.push(events);
    }
    if (status === "missing" ? declared : status === "bad") plugin.hooksUnreadable = true;
  };
  const addInlineHooks = (inline: unknown): void => {
    const events = inlineHookEvents(inline);
    if (events === null) plugin.hooksUnreadable = true;
    else hookSources.push(events);
  };
  const defaultHooks = join(installPath, "hooks", "hooks.json");
  if (await insideRoot(defaultHooks)) await addHookFile(defaultHooks, false);
  else plugin.hooksUnreadable = true;
  if (manifest !== null) {
    for (const declaration of declarationsOf(manifest.hooks)) {
      if (declaration === null) plugin.hooksUnreadable = true;
      else if (typeof declaration === "string") {
        const path = await declaredPath(declaration);
        if (path !== null) await addHookFile(path, true);
        else plugin.hooksUnreadable = true;
      } else addInlineHooks(declaration);
    }
  }
  // 마켓 항목의 훅은 사건마다 매처를 적은 묶음일 때만 돈다. 경로나 목록으로 적은 것은 돌지 않으므로 훅 묶음에 넣지 않는다.
  // 읽지 못한 것은 아니다. 구성 요소(hooks)로는 위에서 셌다. 인라인 묶음도 뼈대가 형식에 맞지 않으면 읽지 못한 것이고 사건을 대신하지 않는다(공식 문서 marketplace-reference 「Hooks in an entry」, 설계 10)
  const entryHooks = isObject(entry.hooks) ? inlineHookEvents(entry.hooks) : undefined;
  if (entryHooks === null) plugin.hooksUnreadable = true;
  plugin.hookEvents = [manifest !== null ? mergeEvents(hookSources, entryHooks) : mergeEvents([...hookSources, entryHooks], undefined)];

  // MCP 서버: 기본 .mcp.json을 먼저 읽고 매니페스트(없으면 마켓 항목)의 mcpServers 선언(경로, 인라인 묶음, 둘을 섞은 목록)을 차례대로 읽는다.
  // 같은 이름은 나중에 선언된 것이 통째로 대신한다(공식 문서 plugins-reference 「MCP servers」). 그래서 같은 파일을 두 번 선언하면 나중 자리에서 다시 읽는다.
  // 주소나 MCP 묶음으로 적은 것은 정의를 읽지 못한 것이다. 선언한 파일이 없어도 읽지 못한 것이고, 기본 파일이 없는 것은 정상이다. plugin.json이 있으면 마켓 항목의 것은 듣지 않는다
  const servers = new Map<string, McpDefinitionEntry>();
  const addMap = (entries: McpDefinitionEntry[] | null): void => {
    if (entries === null) {
      plugin.mcpUnreadable = true;
      return;
    }
    for (const e of entries) servers.set(e.name, e);
  };
  const addMcpFile = async (path: string, declared: boolean): Promise<void> => {
    const read = await readJson(path);
    if (read.status === "missing") {
      if (declared) plugin.mcpUnreadable = true;
      return;
    }
    addMap(read.status === "ok" ? mcpMapOf(read.value) : null);
  };
  await addMcpFile(join(installPath, ".mcp.json"), false);
  for (const declaration of declarationsOf(base.mcpServers)) {
    if (declaration === null || (typeof declaration === "string" && URL_LIKE.test(declaration))) plugin.mcpUnreadable = true;
    else if (typeof declaration === "string") {
      const path = await declaredPath(declaration);
      if (path !== null) await addMcpFile(path, true);
      else plugin.mcpUnreadable = true;
    }
    else addMap(mcpMapOf({ mcpServers: declaration }));
  }
  plugin.mcpServers = [...servers.values()].sort((a, b) => cmp(a.name, b.name));

  // 스킬 경로: 기본 skills/에 매니페스트와 마켓 항목의 skills를 더한다. 플러그인 뿌리 자신을 가리키면 스킬 경로로 보지 않고 알아보지 못한 것으로 둔다.
  // 마켓 항목이 skills를 적었고 그 source가 마켓의 뿌리이면 적힌 폴더만 찾는다(공식 문서 plugins-reference 「Path behavior rules」, 설계 10)
  // 뿌리 자신인지는 표기와 링크를 푼 실제 경로로 본다. 풀지 못한 경로는 표기로만 견준다. 도구가 받지 않는 경로(꼴이 틀리거나 뿌리 밖으로 풀림)는 훑지 않고 알아보지 못한 것(skills=..)으로 둔다
  const isPluginRoot = async (path: string): Promise<boolean> => {
    if (normalizePath(path) === root) return true;
    const real = (await entryInfo(path)).realPath;
    return real !== null && rootReal !== null && real === rootReal;
  };
  const declared = [...pathsOf(base.skills).map((path) => ({ path, from: prefix })), ...pathsOf(appended.skills).map((path) => ({ path, from: "entry" }))];
  const skillRoots: string[] = [];
  for (const { path, from } of declared) {
    if (await isPluginRoot(resolve(installPath, path))) {
      plugin.unknownEntries.push(`${from}:skills=.`);
      continue;
    }
    const accepted = await declaredPath(path);
    if (accepted === null) plugin.unknownEntries.push(`${from}:skills=..`);
    else skillRoots.push(accepted);
  }
  const defaultSkills = join(installPath, "skills");
  const defaultIsRoot = await isPluginRoot(defaultSkills);
  if (defaultIsRoot) plugin.unknownEntries.push("skills=.");
  const entrySkillsOnly = entry.skills !== undefined && typeof entry.source === "string" && MARKET_ROOT_SOURCES.has(entry.source);
  plugin.skillRoots = [...new Set([...(entrySkillsOnly || defaultIsRoot ? [] : [defaultSkills]), ...skillRoots])];
  plugin.unknownEntries = [...new Set(plugin.unknownEntries)].sort();
  return plugin;
}

/** 스킬 폴더에 둔 플러그인 하나의 자리. 사용자 스킬 폴더의 것이면 사용자 범위, 프로젝트의 것이면 그 프로젝트(정규화한 뿌리)다. */
export interface SkillsDirPluginRef {
  path: string;
  scope: "user" | "project";
  projectRoot: string | null;
}

/**
 * 스킬 폴더에 둔 플러그인(<name>@skills-dir)을 읽는다(설계 10 「스킬 폴더에 둔 플러그인」).
 * 설치 기록에 없어도 구성을 아는 플러그인이다. 이름은 매니페스트의 name이고, 매니페스트가 풀리지 않거나 name이 없으면 폴더 이름이다(그때는 구성을 모른다).
 */
export async function readSkillsDirPlugins(refs: readonly SkillsDirPluginRef[]): Promise<PluginInstall[]> {
  const out: PluginInstall[] = [];
  for (const ref of refs) {
    const read = await readJson(join(ref.path, ".claude-plugin", "plugin.json"));
    const declared = read.status === "ok" && isObject(read.value) ? read.value.name : undefined;
    const name = typeof declared === "string" && declared !== "" ? declared : basename(ref.path);
    const group: InstallGroup = { id: `${name}@${SKILLS_DIR}`, installPath: ref.path, scopes: new Set([ref.scope]), projectPaths: new Set(ref.projectRoot === null ? [] : [ref.projectRoot]) };
    out.push(await readPluginInstall(group, { file: "ok", markets: new Map() }));
  }
  return out;
}

/** <홈>/plugins/installed_plugins.json의 설치 기록을 (id, 설치 위치)마다 하나로 묶어 읽는다. id와 정규화한 설치 위치 차례다. */
export async function scanPlugins(claudeHome: string): Promise<PluginsScan> {
  const read = await readJson(join(claudeHome, "plugins", "installed_plugins.json"));
  if (read.status !== "ok") return { file: read.status, plugins: [] };
  if (!isObject(read.value) || !isObject(read.value.plugins)) return { file: "unparsable", plugins: [] };
  const groups = new Map<string, InstallGroup>();
  for (const id of Object.keys(read.value.plugins)) {
    // 도구에 든 플러그인(@builtin)은 플러그인으로 세지 않는다(설계 10 「도구에 든 플러그인」)
    if (id.endsWith("@builtin")) continue;
    const entries = read.value.plugins[id];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isObject(entry) || typeof entry.installPath !== "string") continue;
      const key = `${id}\u0000${normalizePath(entry.installPath)}`;
      let group = groups.get(key);
      if (group === undefined) {
        group = { id, installPath: entry.installPath, scopes: new Set(), projectPaths: new Set() };
        groups.set(key, group);
      }
      // 같은 곳을 다른 표기로 적었으면 글자 차례로 가장 앞선 표기를 쓴다
      if (entry.installPath < group.installPath) group.installPath = entry.installPath;
      group.scopes.add(typeof entry.scope === "string" ? entry.scope : "unknown");
      if (typeof entry.projectPath === "string") group.projectPaths.add(normalizePath(entry.projectPath));
    }
  }
  const markets = await readMarketplaceEntries(claudeHome);
  const plugins: PluginInstall[] = [];
  for (const key of [...groups.keys()].sort()) plugins.push(await readPluginInstall(groups.get(key)!, markets));
  return { file: "ok", plugins };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/plugins.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 39개. 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/plugins.ts test/scan/plugins.test.ts
git commit -m "feat: 설치된 플러그인의 구성 요소 읽기 추가"
```

---

### Task 11: .claude.json, 이름 꼴, MCP 정의의 지문과 막음

**Files:**
- Create: `src/scan/claude-json.ts`
- Create: `src/scan/names.ts`
- Create: `src/scan/mcp.ts`
- Test: `test/scan/mcp.test.ts`

**Interfaces:**
- Consumes: `readJson`(과제 3), `mcpMapOf`, `McpDefinitionEntry`(과제 10), `canonicalJson`, `McpMatcher`, `SettingsView`, `viewOf`(과제 6), `normalizePath`.
- Produces: `claudeJsonPath(env, homedir)`, `interface ClaudeJsonProject`, `interface ClaudeJsonFacts { status; userMcpServers; projects; skillUsage; pluginUsage; claudeAiEverConnected }`, `emptyClaudeJson(status)`, `readClaudeJson(path)`(`src/scan/claude-json.ts`), `toolForm(name)`, `callForm(name)`, `mcpRecordNames(name, pluginName)`, `skillRecordNames(dirName, declaredName, pluginName)`(`src/scan/names.ts`), `definitionHash(saltHex, definition): string | null`, `matcherHits(matcher, names, definition)`, `interface McpContext { layers; managed; project }`, `mcpAllowed(context, names, definition)`, `projectServerApproved(context, name)`(`src/scan/mcp.ts`).

설계 10의 MCP 서버·막음·승인 표시, 11.3 E6의 "정의의 지문", 19.1(값은 메모리에서 해시하고 버린다), 10의 「설치와 기록의 이름을 잇는 법」과 「`~/.claude.json`」을 구현한다.

- **`.claude.json`.** `CLAUDE_CONFIG_DIR`이 있으면 그 폴더 안, 없으면 홈의 `.claude.json`이다. 맨 위의 사용자 범위 `mcpServers`, 프로젝트마다(`projects[<경로>]`)의 로컬 범위 `mcpServers`·`enabledMcpjsonServers`·`disabledMcpjsonServers`·`disabledMcpServers`, `skillUsage`·`pluginUsage`의 `lastUsedAt`(밀리초), `claudeAiMcpEverConnected`(이름)만 읽는다. 계정 정보 같은 다른 열쇠는 보지 않는다. 프로젝트 열쇠는 구분 기호가 섞여 적히므로 정규화해서 견준다. 이 파일은 Claude Code가 수시로 다시 쓰므로, 쓰는 순간에 읽혀 풀리지 않으면 한 번 더 읽는다. 그래도 풀리지 않으면 `unparsable`이다. 시험은 `node:fs/promises`의 `readFile`을 꾸며 첫 읽기만 깨진 글을 주고 두 번째에 풀리는 것을 본다(설계 21.1).
- **이름 꼴(설계 10 「설치와 기록의 이름을 잇는 법」).** MCP 서버는 설정 이름 그대로(지침 첨부·귀속)와 호출 꼴(영문자·숫자·`_`·`-` 밖의 글자를 `_`로 바꾸고 첫 `__` 앞까지만 쓴다. 1단계 요약의 `mcpCalls` 열쇠와 같은 꼴), 플러그인 서버는 `plugin:<플러그인>:<서버>`(귀속)와 `plugin_<플러그인>_<서버>`를 같은 규칙으로 바꾼 꼴(도구 이름)이다. 스킬은 폴더 이름과 머리말 `name`, 플러그인 스킬은 그 앞에 `<플러그인>:`를 한 번만 붙인다. 기록의 이름과 맞추는 판정은 2부가 한다.
- **정의의 지문.** 서버 정의 전부(전송 방식, 명령과 인자, 주소 전체, 환경 변수와 머리말의 이름과 값)를 열쇠 차례로 세운 JSON으로 만들어, 상태 파일의 무작위 값을 열쇠로 HMAC-SHA256한다. 원문은 이 함수 밖으로 나가지 않는다. 묶음 안의 열쇠 차례만 바꾼 정의는 같은 지문이고, 전송 방식·명령·인자(차례 포함)·머리말과 환경 변수의 이름과 값·주소(질의 문자열 포함) 가운데 하나만 달라도 다른 지문이다(설계 21.1). 정의가 너무 깊어 정규화하지 못하면(과제 6) `null`이고, 그 서버는 정의를 읽지 못한 서버로 다룬다. 시험은 입력을 하나씩만 바꾼 정의들의 지문이 모두 다른지 본다. 일부 열쇠만 해시하는 구현을 잡으려는 것이다.
- **막음.** 어느 층의 `deniedMcpServers`가 이름(기록의 꼴 가운데 하나)·주소(`*` 와일드카드)·명령 전체로 맞거나, 관리 정책의 `allowedMcpServers`가 있는데 맞지 않거나, 그 프로젝트의 `.claude.json`에서 끈(`disabledMcpServers`) 서버는 그 맥락에서 막힌 것이다. 시험은 앞 층이 비어 있고 프로젝트·로컬·관리 정책 층 하나에서만 막는 경우를 하나씩 본다.
- **`.mcp.json` 승인.** 끈 목록(설정 층과 `.claude.json`의 `disabledMcpjsonServers`)에 있으면 승인이 아니다. 모두 켜기(`enableAllProjectMcpServers`)나 켠 목록에 있으면 승인이다. 모두 켜기는 우선순위가 가장 높은 층(사용자 → 프로젝트 → 로컬 → 관리 정책)이 정한 값이고, 정하지 않은 층은 위 층이라도 덮지 않는다(신뢰한 폴더의 규칙. 공식 문서 settings-reference 「enableAllProjectMcpServers」). 스캐너는 신뢰 기록을 읽지 않으므로 목록의 프로젝트를 신뢰한 폴더로 본다(설계 27). 둘 다 아니면 아직 승인되지 않았다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/mcp.test.ts`:

```ts
// MCP 서버의 이름 꼴, .claude.json 읽기, 정의의 지문, 막음과 승인을 시험한다(설계 10, 11.3 E6, 19.1, 21.1)
import * as fsp from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeJsonPath, readClaudeJson } from "../../src/scan/claude-json.ts";
import { definitionHash, matcherHits, mcpAllowed, projectServerApproved, type McpContext } from "../../src/scan/mcp.ts";
import { callForm, mcpRecordNames, skillRecordNames, toolForm } from "../../src/scan/names.ts";
import { viewOf } from "../../src/scan/settings.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

// .claude.json을 쓰는 도중에 읽힌 경우를 꾸미려고 readFile을 감싼다(기본은 진짜 readFile)
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, readFile: vi.fn(real.readFile) };
});

let root: string;
beforeEach(async () => {
  root = await makeTemp();
  vi.mocked(fsp.readFile).mockClear();
});
afterEach(async () => removeTemp(root));

describe("이름 꼴", () => {
  it("도구 이름 꼴은 영문자·숫자·_·- 밖의 글자를 _로 바꾼다", () => {
    expect(toolForm("claude.ai Gmail")).toBe("claude_ai_Gmail");
    expect(toolForm("my.server")).toBe("my_server");
    expect(toolForm("a-b_c9")).toBe("a-b_c9");
  });
  it("MCP 서버는 설정 이름과 도구 이름 꼴, 플러그인 서버는 귀속 꼴과 도구 이름 꼴이다", () => {
    expect(mcpRecordNames("context7", null)).toEqual(["context7"]);
    expect(mcpRecordNames("claude.ai Gmail", null)).toEqual(["claude.ai Gmail", "claude_ai_Gmail"]);
    expect(mcpRecordNames("db", "my-plugin")).toEqual(["plugin:my-plugin:db", "plugin_my-plugin_db"]);
  });
  it("호출의 서버 자리는 도구 이름 꼴의 첫 __ 앞까지다(1단계 요약과 같다)", () => {
    expect(callForm("reports__v2")).toBe("reports");
    expect(mcpRecordNames("reports__v2", null)).toEqual(["reports", "reports__v2"]);
    expect(callForm("a.b c")).toBe("a_b_c");
  });
  it("스킬은 폴더 이름과 머리말 이름이고 플러그인 스킬은 접두를 한 번만 붙인다", () => {
    expect(skillRecordNames("deploy-staging", "deploy", null)).toEqual(["deploy", "deploy-staging"]);
    expect(skillRecordNames("review", "fancy", "my-plugin")).toEqual(["my-plugin:fancy", "my-plugin:review"]);
    expect(skillRecordNames("review", "my-plugin:fancy", "my-plugin")).toEqual(["my-plugin:fancy", "my-plugin:review"]);
  });
});

describe(".claude.json", () => {
  it("CLAUDE_CONFIG_DIR가 있으면 그 폴더 안의 .claude.json이다", () => {
    expect(claudeJsonPath({ CLAUDE_CONFIG_DIR: join(root, "cfg") }, join(root, "home"))).toBe(join(resolve(root, "cfg"), ".claude.json"));
    expect(claudeJsonPath({}, join(root, "home"))).toBe(join(root, "home", ".claude.json"));
  });

  it("MCP 정의, 프로젝트마다의 승인·끄기, 사용 집계, claude.ai 이름만 읽는다", async () => {
    const path = join(root, ".claude.json");
    await put(
      path,
      JSON.stringify({
        oauthAccount: { emailAddress: "someone@example.com" },
        mcpServers: { ctx: { type: "stdio", command: "npx", args: ["ctx"], env: { TOKEN: "secret-value" } } },
        projects: {
          "C:/dev/app": { mcpServers: { local1: { command: "x" } }, enabledMcpjsonServers: ["p1"], disabledMcpjsonServers: [], disabledMcpServers: ["ctx"] },
          broken: "nope",
        },
        skillUsage: { a: { usageCount: 3, lastUsedAt: 1_700_000_000_000 }, "p:b": { usageCount: 1, lastUsedAt: 1_700_000_100_000 }, bad: { lastUsedAt: "x" } },
        pluginUsage: { "p@m": { usageCount: 1, lastUsedAt: 1_700_000_200_000, lastUsedNumStartups: 4 } },
        claudeAiMcpEverConnected: ["claude.ai Gmail", "claude.ai Gmail", 5],
      }),
    );
    const facts = await readClaudeJson(path);
    expect(facts.status).toBe("ok");
    expect(facts.userMcpServers.map((s) => s.name)).toEqual(["ctx"]);
    expect(facts.projects).toHaveLength(1);
    expect(facts.projects[0]).toMatchObject({ key: "C:/dev/app", enabledMcpjsonServers: ["p1"], disabledMcpServers: ["ctx"] });
    expect(facts.projects[0]!.mcpServers.map((s) => s.name)).toEqual(["local1"]);
    expect({ ...facts.skillUsage }).toEqual({ a: 1_700_000_000_000, "p:b": 1_700_000_100_000 });
    expect({ ...facts.pluginUsage }).toEqual({ "p@m": 1_700_000_200_000 });
    expect(facts.claudeAiEverConnected).toEqual(["claude.ai Gmail"]);
    expect(JSON.stringify({ ...facts, userMcpServers: [], projects: [] })).not.toContain("someone@example.com");
  });

  it("없거나 객체가 아니면 비어 있다", async () => {
    expect((await readClaudeJson(join(root, "none.json"))).status).toBe("missing");
    await put(join(root, "arr.json"), "[]");
    expect((await readClaudeJson(join(root, "arr.json"))).status).toBe("unparsable");
  });

  it("쓰는 도중에 읽혀 풀리지 않았으면 한 번 더 읽고, 두 번째에 풀리면 문제도 알림도 없다(설계 21.1)", async () => {
    const path = join(root, ".claude.json");
    await put(path, JSON.stringify({ mcpServers: { a: { command: "x" } } }));
    vi.mocked(fsp.readFile).mockImplementationOnce((async () => '{"mcpServers": {') as never);
    const facts = await readClaudeJson(path);
    expect(facts.status).toBe("ok");
    expect(facts.userMcpServers.map((s) => s.name)).toEqual(["a"]);
    expect(vi.mocked(fsp.readFile)).toHaveBeenCalledTimes(2);
  });
});

describe("정의의 지문", () => {
  const salt = "ab".repeat(32);
  it("열쇠의 차례와 상관없이 같은 정의는 같은 지문이다", () => {
    expect(definitionHash(salt, { command: "npx", args: ["a"] })).toBe(definitionHash(salt, { args: ["a"], command: "npx" }));
  });
  it("주소의 질의 문자열만 달라도, 환경 변수의 값만 달라도 다른 설치다", () => {
    expect(definitionHash(salt, { url: "https://e.example/mcp?project=a" })).not.toBe(definitionHash(salt, { url: "https://e.example/mcp?project=b" }));
    expect(definitionHash(salt, { command: "x", env: { TOKEN: "1" } })).not.toBe(definitionHash(salt, { command: "x", env: { TOKEN: "2" } }));
  });
  it("무작위 값이 다르면 지문이 다르고, 지문에 원문이 없다", () => {
    const hash = definitionHash(salt, { command: "x", env: { TOKEN: "secret-value" } });
    expect(hash).not.toBe(definitionHash("cd".repeat(32), { command: "x", env: { TOKEN: "secret-value" } }));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("secret");
  });
  it("전송 방식, 명령, 인자, 머리말과 환경 변수의 이름과 값, 주소 가운데 하나만 달라도 지문이 다르다. 인자의 차례도 정의다", () => {
    const base = { type: "stdio", command: "npx", args: ["a", "b"], env: { K: "1" }, headers: { H: "v" }, url: "https://e.example/mcp" };
    const variants: Record<string, unknown>[] = [
      base,
      { ...base, type: "http" },
      { ...base, command: "node" },
      { ...base, args: ["a", "c"] },
      { ...base, args: ["b", "a"] },
      { ...base, env: { K2: "1" } },
      { ...base, env: { K: "2" } },
      { ...base, headers: { H2: "v" } },
      { ...base, headers: { H: "w" } },
      { ...base, url: "https://e.example/mcp2" },
    ];
    expect(new Set(variants.map((d) => definitionHash(salt, d))).size).toBe(variants.length);
  });
  it("묶음 안의 열쇠 차례까지 바꾼 같은 정의는 같은 지문이다", () => {
    expect(definitionHash(salt, { command: "x", env: { A: "1", B: "2" }, headers: { X: "1", Y: "2" } })).toBe(
      definitionHash(salt, { headers: { Y: "2", X: "1" }, env: { B: "2", A: "1" }, command: "x" }),
    );
  });
  it("너무 깊게 중첩된 정의는 지문이 null이다(정의를 읽지 못한 서버). 던지지 않는다", () => {
    const deep = JSON.parse(`${"[".repeat(200_000)}${"]".repeat(200_000)}`) as unknown;
    expect(definitionHash(salt, { command: "x", args: deep })).toBeNull();
    expect(definitionHash(salt, { command: "x", args: [] })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("막음과 승인", () => {
  const view = (value: Record<string, unknown> | null) => viewOf(value);
  const context = (layers: Record<string, unknown>[], managed: Record<string, unknown> | null = null, project: McpContext["project"] = null): McpContext => {
    const managedView = view(managed);
    return { layers: [...layers.map(view), managedView], managed: managedView, project };
  };

  it("이름(기록의 꼴 가운데 하나), 주소의 와일드카드, 명령 전체로 맞춘다", () => {
    expect(matcherHits({ serverName: "plugin:p:db" }, ["plugin:p:db", "plugin_p_db"], null)).toBe(true);
    expect(matcherHits({ serverUrl: "https://*.example.com/*" }, ["x"], { url: "https://api.example.com/mcp" })).toBe(true);
    expect(matcherHits({ serverUrl: "https://*.example.com/*" }, ["x"], { url: "https://example.org/mcp" })).toBe(false);
    expect(matcherHits({ serverCommand: ["npx", "srv"] }, ["x"], { command: "npx", args: ["srv"] })).toBe(true);
    expect(matcherHits({ serverCommand: ["npx"] }, ["x"], { command: "npx", args: ["srv"] })).toBe(false);
  });

  it("어느 층에서 막았거나, 관리 정책의 허용 목록 밖이거나, 그 프로젝트에서 끈 서버는 막힌 것이다", () => {
    expect(mcpAllowed(context([{ deniedMcpServers: [{ serverName: "a" }] }]), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{}], { allowedMcpServers: [{ serverName: "b" }] }), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{}], { allowedMcpServers: [{ serverName: "a" }] }), ["a"], null)).toBe(true);
    const project = { key: "k", normKey: "k", mcpServers: [], enabledMcpjsonServers: [], disabledMcpjsonServers: [], disabledMcpServers: ["a"] };
    expect(mcpAllowed(context([{}], null, project), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{}]), ["a"], null)).toBe(true);
  });

  it("막는 목록은 모든 층을 본다. 앞 층이 비어 있고 프로젝트·로컬·관리 정책 층 하나에서만 막아도 막힌 것이다", () => {
    const deny = { deniedMcpServers: [{ serverName: "s" }] };
    expect(mcpAllowed(context([{}, deny, {}]), ["s"], null)).toBe(false);
    expect(mcpAllowed(context([{}, {}, deny]), ["s"], null)).toBe(false);
    expect(mcpAllowed(context([{}, {}, {}], deny), ["s"], null)).toBe(false);
    expect(mcpAllowed(context([{}, {}, {}]), ["s"], null)).toBe(true);
  });

  it(".mcp.json의 서버는 모두 켜기나 켠 목록에 있어야 승인이고, 끈 목록이 먼저다", () => {
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true }]), "s")).toBe(true);
    expect(projectServerApproved(context([{ enabledMcpjsonServers: ["s"] }]), "s")).toBe(true);
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true, disabledMcpjsonServers: ["s"] }]), "s")).toBe(false);
    expect(projectServerApproved(context([{}]), "s")).toBe(false);
    const project = { key: "k", normKey: "k", mcpServers: [], enabledMcpjsonServers: ["s"], disabledMcpjsonServers: [], disabledMcpServers: [] };
    expect(projectServerApproved(context([{}], null, project), "s")).toBe(true);
  });

  it("일괄 승인은 우선순위가 가장 높은 층이 정한 값이다(신뢰한 폴더). 위 층의 거짓이 아래 층의 참을 덮고, 정하지 않은 층은 덮지 않는다", () => {
    // 층은 사용자, 프로젝트, 로컬 차례이고 관리 정책이 맨 위다
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true }], { enableAllProjectMcpServers: false }), "s")).toBe(false);
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true }, { enableAllProjectMcpServers: false }]), "s")).toBe(false);
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: false }, { enableAllProjectMcpServers: true }]), "s")).toBe(true);
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true }, {}, {}], {}), "s")).toBe(true);
    // 일괄 승인이 꺼져도 켠 목록에 있으면 승인이다
    expect(projectServerApproved(context([{ enabledMcpjsonServers: ["s"] }], { enableAllProjectMcpServers: false }), "s")).toBe(true);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/mcp.test.ts`
Expected: FAIL. `../../src/scan/claude-json.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/claude-json.ts`:

```ts
// Claude Code의 .claude.json(CLAUDE_CONFIG_DIR가 있으면 그 폴더 안, 없으면 홈)에서 MCP 서버 정의, 프로젝트마다의 MCP 승인·끄기, 도구가 세는 사용 집계, 연결한 적 있는 claude.ai 서버의 이름만 읽는다(설계 10 「~/.claude.json」)
import { join, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { readJson } from "./fs.ts";
import { mcpMapOf, type McpDefinitionEntry } from "./plugins.ts";

export function claudeJsonPath(env: Record<string, string | undefined>, homedir: string): string {
  const fromEnv = env.CLAUDE_CONFIG_DIR?.trim();
  return fromEnv ? join(resolve(fromEnv), ".claude.json") : join(homedir, ".claude.json");
}

export interface ClaudeJsonProject {
  /** .claude.json에 적힌 그대로의 열쇠 */
  key: string;
  normKey: string;
  mcpServers: McpDefinitionEntry[];
  enabledMcpjsonServers: string[];
  disabledMcpjsonServers: string[];
  disabledMcpServers: string[];
}

export interface ClaudeJsonFacts {
  status: "ok" | "missing" | "unparsable" | "unreadable";
  userMcpServers: McpDefinitionEntry[];
  /** 정규화한 열쇠 차례. 같은 곳을 가리키는 열쇠가 여럿이면 따로 둔다 */
  projects: ClaudeJsonProject[];
  /** 스킬 이름(사용자 스킬은 맨이름, 플러그인 스킬은 '<플러그인>:<스킬>') → 마지막 사용 시각(밀리초) */
  skillUsage: Record<string, number>;
  /** '<이름>@<마켓>' → 마지막 사용 시각(밀리초) */
  pluginUsage: Record<string, number>;
  claudeAiEverConnected: string[];
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function lastUsed(v: unknown): Record<string, number> {
  const out: Record<string, number> = Object.create(null) as Record<string, number>;
  if (!isObject(v)) return out;
  for (const [name, entry] of Object.entries(v)) {
    if (isObject(entry) && typeof entry.lastUsedAt === "number" && Number.isFinite(entry.lastUsedAt)) out[name] = entry.lastUsedAt;
  }
  return out;
}

export function emptyClaudeJson(status: ClaudeJsonFacts["status"]): ClaudeJsonFacts {
  return {
    status,
    userMcpServers: [],
    projects: [],
    skillUsage: Object.create(null) as Record<string, number>,
    pluginUsage: Object.create(null) as Record<string, number>,
    claudeAiEverConnected: [],
  };
}

/**
 * .claude.json은 Claude Code가 수시로 다시 쓰는 파일이라, 쓰는 순간에 읽으면 덜 쓴 글이 풀리지 않을 수 있다.
 * 풀리지 않으면 한 번 더 읽는다. 그래도 풀리지 않으면 unparsable로 알린다(S3의 문제로는 세지 않는다).
 */
export async function readClaudeJson(path: string): Promise<ClaudeJsonFacts> {
  let read = await readJson(path);
  if (read.status === "unparsable") read = await readJson(path);
  if (read.status !== "ok") return emptyClaudeJson(read.status);
  if (!isObject(read.value)) return emptyClaudeJson("unparsable");
  const v = read.value;
  const facts = emptyClaudeJson("ok");
  facts.userMcpServers = isObject(v.mcpServers) ? (mcpMapOf({ mcpServers: v.mcpServers }) ?? []) : [];
  if (isObject(v.projects)) {
    for (const key of Object.keys(v.projects)) {
      const entry = v.projects[key];
      if (!isObject(entry)) continue;
      facts.projects.push({
        key,
        normKey: normalizePath(key),
        mcpServers: isObject(entry.mcpServers) ? (mcpMapOf({ mcpServers: entry.mcpServers }) ?? []) : [],
        enabledMcpjsonServers: strings(entry.enabledMcpjsonServers),
        disabledMcpjsonServers: strings(entry.disabledMcpjsonServers),
        disabledMcpServers: strings(entry.disabledMcpServers),
      });
    }
    facts.projects.sort((a, b) => (a.normKey !== b.normKey ? (a.normKey < b.normKey ? -1 : 1) : a.key < b.key ? -1 : 1));
  }
  facts.skillUsage = lastUsed(v.skillUsage);
  facts.pluginUsage = lastUsed(v.pluginUsage);
  facts.claudeAiEverConnected = [...new Set(strings(v.claudeAiMcpEverConnected))].sort();
  return facts;
}
```

`src/scan/names.ts`:

```ts
// 설치(스캐너가 본 것)를 세션 기록의 이름과 맞출 때 쓰는 꼴을 만든다. MCP 서버는 설정 이름·도구 이름 꼴·플러그인 꼴, 스킬은 폴더 이름·머리말 이름(플러그인은 '<플러그인>:<스킬>')이다(순수 함수, 설계 10 「설치와 기록의 이름을 잇는 법」)

/** 도구 이름 꼴. 영문자·숫자·_·- 밖의 글자를 _로 바꾼다(공식 문서 mcp, permissions). */
export function toolForm(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** 호출한 도구 이름(mcp__<서버>__<도구>)에서 얻는 서버 자리의 꼴. 1단계 요약처럼 첫 __ 앞까지만 쓴다(설계 9.5, 10). */
export function callForm(name: string): string {
  return toolForm(name).split("__")[0]!;
}

/** MCP 서버 설치가 기록에 남을 수 있는 이름들(설계 10 「설치와 기록의 이름을 잇는 법」). 중복 없이 차례대로 낸다. */
export function mcpRecordNames(name: string, pluginName: string | null): string[] {
  const forms = pluginName === null ? [name, callForm(name)] : [`plugin:${pluginName}:${name}`, callForm(`plugin_${pluginName}_${name}`)];
  return [...new Set(forms)].sort();
}

/** 스킬 설치가 기록에 남을 수 있는 이름들. 사용자·프로젝트 스킬은 폴더 이름과 머리말 이름, 플러그인 스킬은 그 앞에 '<플러그인>:'을 붙인다. */
export function skillRecordNames(dirName: string, declaredName: string | null, pluginName: string | null): string[] {
  const bare = [dirName, ...(declaredName === null ? [] : [declaredName])];
  if (pluginName === null) return [...new Set(bare)].sort();
  const prefix = `${pluginName}:`;
  return [...new Set(bare.map((name) => (name.startsWith(prefix) ? name : `${prefix}${name}`)))].sort();
}
```

`src/scan/mcp.ts`:

```ts
// MCP 서버 정의의 지문(이 PC의 무작위 값을 섞은 HMAC, 원문은 버린다)과, 한 맥락(전역이나 프로젝트 하나)에서 서버가 막혔는지·승인됐는지를 가른다(순수 함수, 설계 10, 11.3 E6, 19.1)
import { createHmac } from "node:crypto";
import type { ClaudeJsonProject } from "./claude-json.ts";
import { canonicalJson } from "./json.ts";
import type { McpMatcher, SettingsView } from "./settings.ts";

type Json = Record<string, unknown>;

/**
 * 서버 정의의 전부(전송 방식, 명령과 인자, 주소 전체, 환경 변수와 머리말의 이름과 값)를 이 PC의 무작위 값을 열쇠로 HMAC-SHA256한다.
 * 정의의 원문은 이 함수 밖으로 나가지 않는다. 지문으로 원문을 되살릴 수 없다.
 * 정의가 너무 깊게 중첩돼 정규화하지 못하면 null이다(정의를 읽지 못한 서버로 다룬다).
 */
export function definitionHash(saltHex: string, definition: Json): string | null {
  const text = canonicalJson(definition);
  return text === null ? null : createHmac("sha256", Buffer.from(saltHex, "hex")).update(text).digest("hex");
}

const wildcard = (pattern: string): RegExp => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

/** 막는 목록·허용 목록의 한 항목이 서버에 맞는지. 이름은 기록에 남는 꼴들 가운데 하나와 맞으면 된다. */
export function matcherHits(matcher: McpMatcher, names: readonly string[], definition: Json | null): boolean {
  if (matcher.serverName !== undefined && names.includes(matcher.serverName)) return true;
  if (matcher.serverUrl !== undefined && definition !== null && typeof definition.url === "string" && wildcard(matcher.serverUrl).test(definition.url)) return true;
  if (matcher.serverCommand !== undefined && definition !== null && typeof definition.command === "string") {
    const args = Array.isArray(definition.args) ? definition.args : [];
    const command = [definition.command, ...args];
    if (command.length === matcher.serverCommand.length && command.every((part, i) => part === matcher.serverCommand![i])) return true;
  }
  return false;
}

/** 한 맥락의 설정 층들과 그 프로젝트의 .claude.json 기록. */
export interface McpContext {
  /** 이 맥락에서 듣는 설정 층(사용자, 프로젝트, 로컬, 관리 정책) */
  layers: readonly SettingsView[];
  managed: SettingsView;
  project: ClaudeJsonProject | null;
}

/** 이 맥락에서 막히지 않았는지. 어느 층의 deniedMcpServers에 걸리거나, 관리 정책의 허용 목록 밖이거나, 그 프로젝트에서 끈 서버면 막힌 것이다. */
export function mcpAllowed(context: McpContext, names: readonly string[], definition: Json | null): boolean {
  for (const layer of context.layers) if (layer.deniedMcpServers.some((m) => matcherHits(m, names, definition))) return false;
  const allow = context.managed.allowedMcpServers;
  if (allow !== null && !allow.some((m) => matcherHits(m, names, definition))) return false;
  if (context.project !== null && names.some((name) => context.project!.disabledMcpServers.includes(name))) return false;
  return true;
}

/** 프로젝트의 .mcp.json에 든 서버가 승인됐는지. 끈 목록에 있으면 아니고, 모두 켜기나 켠 목록에 있으면 승인이다. */
export function projectServerApproved(context: McpContext, name: string): boolean {
  const disabled = new Set([...context.layers.flatMap((l) => l.disabledMcpjsonServers), ...(context.project?.disabledMcpjsonServers ?? [])]);
  if (disabled.has(name)) return false;
  // 일괄 승인은 우선순위가 가장 높은 층이 정한 값이다. 층은 낮은 것부터(사용자, 프로젝트, 로컬, 관리 정책) 온다. 신뢰한 폴더의 규칙이고,
  // 스캐너는 신뢰 기록을 읽지 않으므로 목록의 프로젝트(주 세션이 돈 폴더)를 신뢰한 폴더로 본다(공식 문서 settings-reference 「enableAllProjectMcpServers」, 설계 27)
  let approveAll: boolean | null = null;
  for (const layer of context.layers) if (layer.enableAllProjectMcpServers !== null) approveAll = layer.enableAllProjectMcpServers;
  if (approveAll === true) return true;
  const enabled = new Set([...context.layers.flatMap((l) => l.enabledMcpjsonServers), ...(context.project?.enabledMcpjsonServers ?? [])]);
  return enabled.has(name);
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan/mcp.test.ts && npx tsc --noEmit`
Expected: PASS. 시험 19개. 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/claude-json.ts src/scan/names.ts src/scan/mcp.ts test/scan/mcp.test.ts
git commit -m "feat: MCP 서버의 이름 꼴과 정의 지문, 막음 판정 추가"
```

---

### Task 12: 셋팅 스캐너 묶기와 설치의 정체

**Files:**
- Create: `src/scan/types.ts`
- Create: `src/scan/claude.ts`
- Create: `src/scan/identity.ts`
- Test: `test/scan/claude.test.ts`
- Test: `test/scan/identity.test.ts`

**Interfaces:**
- Consumes: 과제 3~11의 모든 것(`scanSkillRoot`·`scanSkillPath`·`SkillRootScan`, `scanPlugins`·`readSkillsDirPlugins`·`SkillsDirPluginRef`, `readClaudeJson`, `definitionHash`·`mcpAllowed`·`projectServerApproved` 등), `claudeHome`·`normalizePath`(`src/adapters/claude/locate.ts`), `installKey`(과제 2).
- Produces: `type FileStatus`, `interface SkillFact`, `interface McpFact`, `interface PluginFact`(`id`, `entryName`, `name`, `scopes`, `projectRoots`, `marketplaceEntry`, `compositionKnown`, `hasHooks`, `usageLastUsedMs` 등), `interface ProjectFact`(파일 상태 셋 포함), `interface ClaudeHooksFacts`, `interface SetupProblem { kind; owner; path; realPath }`, `interface ClaudeSetupFacts`(`settings.defaultMode`, `pluginsWithoutInstall`, `problems` 포함, `src/scan/types.ts`), `interface ScanInput { env; homedir; tmpdir; platform; cwds; claudeAiNames; salt; managedDir? }`, `scanClaudeSetup(input): Promise<ClaudeSetupFacts>`(`src/scan/claude.ts`), `skillInstallKey(skill)`, `mcpInstallKey(server): string | null`, `installKeysOf(facts): string[]`(`src/scan/identity.ts`). 2부의 규칙은 이 사실과 1단계의 세션 요약만으로 계산한다.

설계 7.2의 "셋팅 스캐너"를 묶는다. 셋팅 사실(`ClaudeSetupFacts`)은 설계 12.1 입력 묶음의 "셋팅 사실"이다. 숫자, 이름, 경로, 참거짓, 지문만 담는다.

**맥락.** 켜짐은 맥락마다 설정 층을 합쳐 계산한다(설계 10 "켜짐 상태는 설정 층을 합쳐서 계산한다"). 맥락은 전역(사용자 설정)과 목록의 프로젝트마다(사용자 → 프로젝트 → 로컬, 뒤가 앞을 이긴다)이고 관리 정책은 늘 맨 위다. 프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더로 만든다(설계 10 「프로젝트 목록」). 없어진 폴더와 프로젝트로 보지 않는 폴더는 맥락을 만들지 않는다. 그런 폴더의 설정은 읽지 않는다(설계 10, F6).

| 대상 | 켜져 있다 |
|---|---|
| 사용자 스킬 | 어느 맥락에서든 `skillOverrides`(폴더 이름이나 머리말 이름의 값)가 `off`가 아니다 |
| 프로젝트 스킬 | 그 프로젝트의 맥락에서 `off`가 아니다 |
| 플러그인 | 관리 정책의 `enabledPlugins`가 정하면 그 값, 아니면 층의 마지막 값, 아무 데도 없으면 기본 켜짐(마켓 항목의 `defaultEnabled`, 매니페스트의 것, 참 차례)이다. 사용자 범위로 깐 것과 사용자 스킬 폴더에 둔 것은 모든 맥락을, 프로젝트·로컬 범위로 깐 것과 프로젝트 스킬 폴더에 둔 것은 그 프로젝트의 맥락만 본다 |
| 플러그인 스킬 | 플러그인이 켜진 맥락이 있다(`skillOverrides`는 플러그인 스킬에 듣지 않는다). 구성을 모르는 플러그인의 스킬은 설치로 세지 않는다. 한 플러그인 안에서 같은 위치(경로)는 한 번만 센다. 다른 이름의 링크처럼 위치가 다르면 실제 경로가 같아도 위치마다 사실(이름 꼴, 만든 시각, 링크인지, 훅이 그 경로를 가리키는지)을 내고, 실제 경로로 묶어 스킬 하나로 세는 일은 2부가 한다 |
| 사용자 범위 MCP 서버 | 막히지 않은 맥락이 있다 |
| 로컬 범위 서버 | 그 프로젝트의 맥락에서 막히지 않았다 |
| `.mcp.json` 서버 | 그 프로젝트의 맥락에서 승인됐고 막히지 않았다 |
| 플러그인 서버 | 플러그인이 켜진 맥락에서 막히지 않았다. 막는 목록은 서버 열쇠 그대로의 이름도 견준다 |
| claude.ai 서버 | 전역에서 막히지 않았다. 이름은 `claudeAiMcpEverConnected`와 세션 기록의 `claude.ai `로 시작하는 이름이다. 정의가 없으므로 지문은 `null`이다 |

**스킬 폴더에 둔 플러그인(설계 10).** 사용자·프로젝트 스킬 폴더를 먼저 훑어(`pluginDirs`) 그 안의 플러그인 폴더를 `readSkillsDirPlugins`로 읽고, 설치된 플러그인과 한 목록(ID와 설치 위치 차례)으로 다룬다. 그 폴더는 스킬로 세지 않는다. 설치 기록이 없어도 구성을 아는 플러그인이라 아래의 `pluginsWithoutInstall`에 넣지 않는다. 그 안의 것은 주인이 `plugin`이라 S3에 들지 않는다. 스킬 폴더를 먼저 훑는 까닭은 그 플러그인의 훅 명령까지 모은 뒤에 사용자·프로젝트 스킬의 "훅이 내용을 넣어 주는가"를 판정하기 위해서다. 관리 정책이나 신뢰하지 않은 폴더가 그 플러그인을 막는 경우는 보지 않고 켜진 것으로 본다(설계 27의 한계).

**기록의 이름 꼴과 집계(설계 10 「설치와 기록의 이름을 잇는 법」, 「`~/.claude.json`」).** 플러그인 스킬과 플러그인 서버의 꼴은 구성 요소의 이름으로 만들고, 마켓 항목의 이름이 다르면 그 이름의 꼴도 넣는다. 플러그인의 집계(`pluginUsage`)는 두 이름(`<이름>@<마켓>`)으로 모두 찾아 늦은 것을 낸다. `.claude.json`을 읽지 못하면(사실의 `claudeJson`이 `ok`가 아니면) 집계는 없는 것이 아니라 모르는 것이다. 사실에 그 상태가 있으므로 2부가 가린다.

**켜져 있는데 설치 기록이 없는 플러그인.** 어느 맥락에서 `enabledPlugins`가 참인데(관리 정책이 정하면 그 값) 설치 기록에도 스킬 폴더에도 없는 `<이름>@<마켓>`을 `pluginsWithoutInstall`에 적는다. `@builtin`으로 끝나는 것(도구에 든 플러그인)은 넣지 않는다. 구성을 모르는 플러그인이라서 2부의 A2가 플러그인 끄기 후보를 막는 데 쓴다(설계 10, 16.2, 21.1).

**실린 목록에 실릴 수 있는가(`listed`).** 머리말의 `disable-model-invocation`이 참이거나, 모든 맥락에서 `skillOverrides`가 `off`나 `user-invocable-only`이면 거짓이다. 2부가 설계 11.3의 "목록에 실리지 않는 설치"를 가를 때 기록과 함께 쓴다.

**훅이 내용을 넣어 주는 스킬(설계 11.3 E5 ⑤).** 훅을 가진 플러그인(구성에 훅이 있는 것. 돌지 않는 꼴로 적은 마켓 항목의 훅도 든다)의 스킬이거나, 어느 훅 명령(사용자·관리 정책·목록의 프로젝트 설정과 로컬 설정·설치된 플러그인과 스킬 폴더에 둔 플러그인의 모든 사건)에 그 스킬의 경로, 실제 경로, 또는 `/skills/<폴더 이름>` 조각이 나오면 참이다(대소문자와 구분 기호를 맞춘다). 조각으로도 보는 까닭은 `~`나 환경 변수로 적은 경로도 잡으려는 것이다. 더 많이 "쓰는지 모름"이 되는 쪽으로 틀린다.

**㉠의 훅(설계 11.3 「㉠의 훅을 찾는 곳」).** 관리 정책의 훅, 관리 정책이 강제로 켠 플러그인의 훅, 사용자 설정의 훅, 사용자 설정에서 켠 플러그인의 훅을 이 차례로 낸다. "사용자 설정에서 켠 플러그인"은 사용자 설정의 `enabledPlugins`에 참으로 적혔고 관리 정책이 막지 않은 사용자 범위 플러그인(사용자 스킬 폴더에 둔 것 포함)이다. 관리 정책이 강제로 켠 플러그인도 사용자 범위로 깐 것만 넣는다. 프로젝트 범위로 깔았거나 프로젝트의 스킬 폴더에 둔 것은 관리 정책이 켜도 그 프로젝트에서만 돈다(설계 11.3). 기본 켜짐으로 켜진 것은 넣지 않는다(엄한 쪽). 마켓 항목이 대신한 매처는 대신한 것으로 보고, 구성을 모르는 플러그인의 훅은 없는 것으로 본다. 프로젝트 설정·로컬 설정의 훅은 넣지 않는다. 훅을 제한하는 설정의 값(`disableAllHooks`, `allowManagedHooksOnly`)은 따로 낸다. 관리 정책과 사용자 설정의 훅은 파일마다(`SettingsLayer.hookSources`) 본다. 한 파일의 `hooks`가 뼈대나 처리기 검사(`hookMapValid`)에 맞지 않으면 도구가 그 항목만 버리는지 그 파일의 훅을 통째로 버리는지 가릴 수 없으므로, 그 파일의 확인 훅은 세지 않고 경로를 `hooks.unreadableSettings`로 낸다. 훅이 스킬 경로를 가리키는지 볼 명령도 관리 정책은 파일마다 모은다. 합친 값에서는 뒤 파일의 틀린 `hooks`가 앞 파일의 명령을 덮는다. 이 명령에는 검사에 걸린 파일의 것도 넣는다(넓게 보아야 "안 쓴 것이 확인됨"을 잘못 내지 않는다)(공식 문서 errors 「Managed settings contain invalid entries」·settings 「Fix a broken settings file」, 설계 11.3 ㉠의 「등록돼 있다」).

**문제(S3의 재료).** 풀리지 않는 파일, 머리말이 없는 스킬, 가리키는 곳이 없는 링크를 주인과 실제 경로와 함께 낸다. 주인은 사용자가 고치는 셋팅(사용자·프로젝트·로컬 설정, 목록의 프로젝트의 `.mcp.json`, 사용자·프로젝트 스킬 폴더 바로 아래의 스킬과 링크)이 `user`, 관리 정책 파일이 `managed`, 플러그인 안의 것(매니페스트, 그 스킬과 링크)이 `plugin`, 도구가 쓰는 `.claude.json`이 `tool`이다. 설계 11.3의 S3은 `user`만 세고 같은 실제 파일은 한 번만 센다. 고르는 일은 2부가 하고 스캐너는 고를 재료를 모두 낸다. `.claude.json`은 풀리지 않으면 한 번 더 읽는다(과제 11). `.mcp.json`은 맨 바깥이나 `mcpServers`가 묶음이 아니어도 풀리지 않는 것이다. 읽지 못한 파일은 문제가 아니라 상태(`unreadable`)로 낸다. `SKILL.md`를 읽지 못한 스킬은 머리말 없음으로 세지 않고 위치의 사실(`readable: false`)로 알린다. 같은 문제(종류·주인·경로)는 하나로 줄인다.

**프로젝트.** 목록의 프로젝트마다 프로젝트 설정·로컬 설정·`.mcp.json`의 상태, 설정이 있는지, 지침, 권한 우회 여부, 권한 충돌 쌍(읽은 층만으로 센다)을 낸다. `~/.claude.json`의 프로젝트 값은 본 저장소 뿌리의 열쇠로만 찾는다. 같은 뿌리를 다르게 적은 열쇠(구분 기호, Windows의 대소문자, 끝의 `/.`)는 값을 합치고 같은 정의의 로컬 서버는 열쇠 차례만 달라도 하나로 세며, 하위 폴더와 워크트리의 열쇠는 보지 않는다(설계 10 「프로젝트를 세는 단위와 셋팅을 읽는 곳은 같다」).

**기본 모드.** 사용자 설정과 관리 정책의 기본 모드를 `bypass`·`other`·`null`(그 층이 정하지 않음)로 낸다. 관리 정책이 정하지 않은 것과 다른 모드로 정한 것을 가른다(설계 11.3 S2 ㉡).

**차례.** 스킬은 이름, 범위(사용자, 프로젝트, 플러그인), 정규화한 경로 차례다. MCP 서버는 이름, 범위(사용자, 로컬, 프로젝트, 플러그인, claude.ai), 프로젝트, 플러그인 차례다(설계 11.5의 이름 목록 차례). 플러그인은 ID와 정규화한 설치 위치 차례, 문제는 경로·종류·주인 차례다. 같은 입력이면 작업 폴더를 주는 차례와 상관없이 같은 사실이다.

**설치의 정체(설계 11.3, 18.1).** 스킬은 `["skill", "claude-code", 범위, 프로젝트, 이름, 실제 경로]`, MCP 서버는 `["mcp", "claude-code", 범위, 프로젝트, 플러그인, 이름, 정의의 지문]`이다. 범위가 프로젝트인 스킬은 어느 프로젝트의 것인지도 정체다. 두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다. 정의의 지문이 없는 서버(claude.ai 서버, 정의를 읽지 못했거나 너무 깊은 서버)는 정체를 만들 수 없어 관측 기록에 넣지 않는다. 켜졌는지와 상관없이 본 설치를 모두 넣는다. 시험은 정체의 부분을 하나씩만 바꿔도 열쇠가 달라지는지 본다.

값이 결과에 남지 않는 시험과 작업 폴더의 차례를 뒤집는 시험은 설계 19.1과 12.2를 지킨다. 셋팅 사실 전체를 글로 바꿔도 설정의 값(토큰, 질의 문자열), 훅 명령, 권한 규칙의 글, 지침과 스킬의 글, 계정 메일이 나오지 않아야 하고, 작업 폴더의 차례를 뒤집어도 글자 하나 다르지 않아야 한다. 깊이 20만으로 중첩된 값을 설정·관리 정책 드롭인·`.claude.json`·플러그인 정의에 넣어도 끝까지 읽는지도 본다(설계 20.1). 관리 정책의 `skillOverrides`가 다른 층을 이기는 것, 플러그인 스킬의 같은 위치와 같은 이름, 같은 원본을 가리키는 링크 위치(만든 시각과 링크 경로를 가리키는 훅이 그 위치에 남는다), 관리 정책이 켠 프로젝트 플러그인의 훅도 본다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/scan/claude.test.ts`:

```ts
// 셋팅 스캐너를 임시 홈 폴더로 처음부터 끝까지 시험한다. 설정 층 합치기, 스킬·플러그인·MCP 서버의 켜짐, 훅의 겉모양, 프로젝트와 파일의 읽기 상태, 문제와 그 주인, 그리고 값과 글이 결과에 남지 않는지(설계 10, 11.3, 19.1, 21.1)
import { mkdir, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { scanClaudeSetup, type ScanInput } from "../../src/scan/claude.ts";
import type { ClaudeSetupFacts } from "../../src/scan/types.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let input: ScanInput;
const SALT = "5a".repeat(32);
const skill = (name: string, extra = ""): string => `---\nname: ${name}\ndescription: 시험용 스킬\n${extra}---\n\n본문 글은 남지 않는다.\n`;
const json = (value: unknown): string => JSON.stringify(value, null, 2);

beforeEach(async () => {
  root = await makeTemp();
  const home = join(root, "home");
  const claude = join(home, ".claude");
  const proj = join(root, "work", "proj");
  input = {
    env: {},
    homedir: home,
    tmpdir: join(root, "os-tmp"),
    platform: process.platform,
    cwds: [join(proj, "sub"), proj, home, join(root, "work", "deleted")],
    claudeAiNames: ["claude.ai Drive", "not-claude-ai"],
    salt: SALT,
    managedDir: join(root, "managed"),
  };
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(proj, "sub", "x.txt"), "x");

  // 전역 지침과 사용자 설정
  await put(join(claude, "CLAUDE.md"), `# 전역 지침\n${"모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다. ".repeat(8)}\n${proj} 에서는 따로 정한 규칙을 따른다.\n`);
  await put(join(claude, "rules", "style.md"), "Keep replies short and in Korean every time.\n");
  await put(
    join(claude, "settings.json"),
    json({
      permissions: { defaultMode: "bypassPermissions", deny: ["Bash(rm -rf *)"], allow: [] },
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node C:/secret/guard-secret.mjs" }] }],
        SessionStart: [{ hooks: [{ type: "command", command: `node ${join(claude, "skills", "hooked", "inject.mjs")}` }] }],
      },
      skillOverrides: { "old-skill": "off", "quiet-skill": "user-invocable-only" },
      enabledPlugins: { "pa@m": true, "ghost@m": true, "off@m": false },
      deniedMcpServers: [{ serverName: "blocked" }],
    }),
  );
  // 사용자 스킬
  await put(join(claude, "skills", "active-skill", "SKILL.md"), skill("active-skill"));
  await put(join(claude, "skills", "old-skill", "SKILL.md"), skill("old-skill"));
  await put(join(claude, "skills", "quiet-skill", "SKILL.md"), skill("quiet-skill"));
  await put(join(claude, "skills", "manual", "SKILL.md"), skill("manual", "disable-model-invocation: true\n"));
  await put(join(claude, "skills", "hooked", "SKILL.md"), skill("hooked"));
  await put(join(claude, "skills", "nofront", "SKILL.md"), "# 머리말 없음\n");
  await put(join(root, "store", "gone", "SKILL.md"), skill("gone"));
  await linkDir(join(root, "store", "gone"), join(claude, "skills", "gone"));
  await rm(join(root, "store", "gone"), { recursive: true, force: true });

  // .claude.json. 같은 뿌리를 다르게 적은 열쇠 둘(구분 기호만 다름, 끝에 /. 를 붙임)에 같은 정의를 열쇠 차례만 바꿔 둔다.
  // 하위 폴더의 열쇠는 본 저장소의 뿌리가 아니므로 보지 않는다(설계 10 「프로젝트를 세는 단위와 셋팅을 읽는 곳은 같다」)
  await put(
    join(home, ".claude.json"),
    json({
      oauthAccount: { emailAddress: "someone@example.com" },
      mcpServers: {
        ctx: { type: "stdio", command: "npx", args: ["ctx"], env: { API_TOKEN: "TOKEN-VALUE-123" } },
        blocked: { type: "http", url: "https://blocked.example/mcp?key=QUERY-SECRET" },
      },
      projects: {
        [proj.replace(/\\/g, "/")]: { mcpServers: { loc: { command: "loc-server" }, twin: { command: "x", args: ["a"] } }, enabledMcpjsonServers: ["pj"], disabledMcpjsonServers: [], disabledMcpServers: ["ctx"] },
        [`${proj}/.`]: { mcpServers: { twin: { args: ["a"], command: "x" } } },
        [join(proj, "sub")]: { mcpServers: { "sub-only": { command: "s" } }, disabledMcpjsonServers: ["pj"] },
      },
      skillUsage: { "active-skill": { usageCount: 2, lastUsedAt: 1_760_000_000_000 }, "pa:s1": { usageCount: 1, lastUsedAt: 1_760_000_500_000 } },
      pluginUsage: { "pa@m": { usageCount: 1, lastUsedAt: 1_760_000_600_000 } },
      claudeAiMcpEverConnected: ["claude.ai Gmail"],
    }),
  );

  // 플러그인 둘(사용자가 켠 것, 관리 정책이 강제로 켠 것)과 그 마켓
  const pa = join(claude, "plugins", "cache", "m", "pa", "1.0.0");
  await put(join(pa, ".claude-plugin", "plugin.json"), json({ name: "pa", dependencies: ["helper"] }));
  await put(join(pa, "skills", "s1", "SKILL.md"), skill("s1"));
  await put(join(pa, "hooks", "hooks.json"), json({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }));
  await put(join(pa, ".mcp.json"), json({ mcpServers: { db: { command: "${CLAUDE_PLUGIN_ROOT}/db" } } }));
  const forced = join(claude, "plugins", "cache", "m", "forced", "2.0.0");
  await put(join(forced, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [{ type: "command", command: "check.sh" }] }] } }));
  await put(
    join(claude, "plugins", "installed_plugins.json"),
    json({ version: 2, plugins: { "pa@m": [{ scope: "user", installPath: pa, version: "1.0.0" }], "forced@m": [{ scope: "user", installPath: forced, version: "2.0.0" }] } }),
  );
  const market = join(root, "market-m");
  await put(join(market, ".claude-plugin", "marketplace.json"), json({ name: "m", plugins: [{ name: "pa", source: "./pa" }, { name: "forced", source: "./forced" }] }));
  await put(join(claude, "plugins", "known_marketplaces.json"), json({ m: { source: { source: "github" }, installLocation: market } }));
  await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true } }));

  // 프로젝트
  await put(join(proj, "CLAUDE.md"), "프로젝트 지침입니다. 이 저장소에서는 계획 문서를 먼저 읽는다.\n");
  await put(join(proj, ".claude", "settings.json"), json({ permissions: { allow: ["Bash(rm -rf *)"] } }));
  await put(join(proj, ".claude", "settings.local.json"), json({ permissions: { defaultMode: "bypassPermissions" } }));
  await put(join(proj, ".mcp.json"), json({ mcpServers: { pj: { command: "pj" }, unapproved: { command: "u" } } }));
  await put(join(proj, ".claude", "skills", "ps", "SKILL.md"), skill("ps"));
});
afterEach(async () => removeTemp(root));

const find = <T extends { name: string }>(list: T[], name: string, scope?: string): T => {
  const hit = list.find((x) => x.name === name && (scope === undefined || (x as unknown as { scope: string }).scope === scope));
  if (hit === undefined) throw new Error(`없음: ${name}`);
  return hit;
};

describe("scanClaudeSetup", () => {
  let facts: ClaudeSetupFacts;
  beforeEach(async () => {
    facts = await scanClaudeSetup(input);
  });

  it("전역 지침은 CLAUDE.md와 규칙 파일이고 프로젝트가 나온 횟수를 센다", () => {
    expect(facts.globalInstructions.files.map((f) => f.path)).toEqual([join(input.homedir, ".claude", "CLAUDE.md"), join(input.homedir, ".claude", "rules", "style.md")]);
    expect(facts.globalInstructions.bytes).toBeGreaterThan(200);
    expect(facts.globalInstructions.unreadableDirs).toEqual([]);
    const proj = normalizePath(join(root, "work", "proj"));
    expect(facts.globalMentions[proj]).toBeGreaterThanOrEqual(1);
  });

  it("프로젝트: 깃 뿌리로 묶고, 홈은 프로젝트로 보지 않고, 없어진 폴더는 없다고 적고 읽지 않는다", () => {
    const byRoot = Object.fromEntries(facts.projects.map((p) => [p.root, p]));
    const proj = byRoot[join(root, "work", "proj")]!;
    expect(proj).toMatchObject({ kind: "git", exists: true, excluded: false, settingsStatus: "ok", localSettingsStatus: "ok", mcpJsonStatus: "ok", hasSettings: true, hasLocalSettings: true, bypassInProject: false, bypassInLocal: true, permissionConflicts: 1 });
    expect(proj.cwds).toHaveLength(2);
    expect(proj.instructions.files.map((f) => f.path)).toEqual([join(root, "work", "proj", "CLAUDE.md")]);
    expect(byRoot[input.homedir]).toMatchObject({ excluded: true, settingsStatus: null });
    expect(byRoot[join(root, "work", "deleted")]).toMatchObject({ exists: false, kind: "folder", settingsStatus: null, localSettingsStatus: null, mcpJsonStatus: null });
  });

  it("스킬: skillOverrides의 off는 꺼짐, user-invocable-only와 disable-model-invocation은 켜져 있지만 목록에 실리지 않는다", () => {
    expect(find(facts.skills, "active-skill")).toMatchObject({ scope: "user", enabled: true, listed: true, hookProvided: false, nameUnreadable: false, usageLastUsedMs: 1_760_000_000_000 });
    expect(find(facts.skills, "old-skill")).toMatchObject({ enabled: false, listed: false });
    expect(find(facts.skills, "quiet-skill")).toMatchObject({ enabled: true, listed: false });
    expect(find(facts.skills, "manual")).toMatchObject({ enabled: true, listed: false });
    expect(find(facts.skills, "ps")).toMatchObject({ scope: "project", projectRoot: normalizePath(join(root, "work", "proj")), enabled: true });
  });

  it("스킬: 훅 명령에 경로가 나오는 스킬과 훅을 가진 플러그인의 스킬은 훅이 내용을 넣어 주는 스킬이다", () => {
    expect(find(facts.skills, "hooked").hookProvided).toBe(true);
    expect(find(facts.skills, "pa:s1")).toMatchObject({ scope: "plugin", pluginId: "pa@m", enabled: true, hookProvided: true, recordNames: ["pa:s1"], usageLastUsedMs: 1_760_000_500_000 });
  });

  it("문제: 머리말이 없는 스킬과 가리키는 곳이 없는 링크를 주인과 실제 경로와 함께 낸다", async () => {
    const nofront = join(input.homedir, ".claude", "skills", "nofront");
    expect(facts.problems).toEqual([
      { kind: "danglingLink", owner: "user", path: join(input.homedir, ".claude", "skills", "gone"), realPath: null },
      { kind: "noFrontmatter", owner: "user", path: nofront, realPath: normalizePath(await realpath(nofront)) },
    ]);
  });

  it("같은 원본을 두 곳에서 링크로 걸었으면 문제의 경로는 둘이고 실제 경로는 하나다(S3은 한 번만 센다)", async () => {
    const store = join(root, "store", "bare");
    await put(join(store, "SKILL.md"), "# 머리말 없음\n");
    await linkDir(store, join(input.homedir, ".claude", "skills", "bare"));
    await linkDir(store, join(root, "work", "proj", ".claude", "skills", "bare"));
    const bare = (await scanClaudeSetup(input)).problems.filter((p) => p.kind === "noFrontmatter" && p.path.endsWith("bare"));
    expect(bare).toHaveLength(2);
    expect([...new Set(bare.map((p) => p.realPath))]).toEqual([normalizePath(await realpath(store))]);
  });

  it("MCP 서버: 막은 것, 승인하지 않은 .mcp.json 서버는 꺼져 있고, claude.ai 서버는 정의가 없다", () => {
    expect(find(facts.mcpServers, "ctx")).toMatchObject({ scope: "user", enabled: true, recordNames: ["ctx"] });
    expect(find(facts.mcpServers, "blocked")).toMatchObject({ enabled: false });
    expect(find(facts.mcpServers, "loc")).toMatchObject({ scope: "local", enabled: true });
    expect(find(facts.mcpServers, "pj")).toMatchObject({ scope: "project", enabled: true });
    expect(find(facts.mcpServers, "unapproved")).toMatchObject({ scope: "project", enabled: false });
    expect(find(facts.mcpServers, "db")).toMatchObject({ scope: "plugin", pluginId: "pa@m", enabled: true, recordNames: ["plugin:pa:db", "plugin_pa_db"] });
    expect(find(facts.mcpServers, "claude.ai Gmail")).toMatchObject({ scope: "claude-ai", definitionHash: null, enabled: true });
    expect(find(facts.mcpServers, "claude.ai Drive").scope).toBe("claude-ai");
    expect(facts.mcpServers.some((s) => s.name === "not-claude-ai")).toBe(false);
    expect(find(facts.mcpServers, "ctx").definitionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("같은 뿌리를 다르게 적은 열쇠 둘에 정의가 같은 로컬 서버는 열쇠의 차례와 상관없이 하나다", () => {
    expect(facts.mcpServers.filter((s) => s.name === "twin")).toHaveLength(1);
  });

  it("~/.claude.json의 프로젝트 값은 본 저장소 뿌리의 열쇠로만 찾는다. 하위 폴더나 워크트리의 열쇠는 보지 않는다", () => {
    expect(facts.mcpServers.some((s) => s.name === "sub-only")).toBe(false);
    // 하위 폴더 열쇠의 거절 표시도 듣지 않는다
    expect(find(facts.mcpServers, "pj").enabled).toBe(true);
  });

  it("SKILL.md를 읽지 못한 스킬은 머리말이 없는 문제로 세지 않고, 읽지 못했다는 것을 위치의 사실로 낸다", async () => {
    // SKILL.md가 폴더라 글로 읽지 못한다
    await mkdir(join(input.homedir, ".claude", "skills", "unreadable-skill", "SKILL.md"), { recursive: true });
    await mkdir(join(input.homedir, ".claude", "plugins", "cache", "m", "pa", "1.0.0", "skills", "s-bad", "SKILL.md"), { recursive: true });
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.skills, "unreadable-skill")).toMatchObject({ scope: "user", readable: false });
    expect(find(scanned.skills, "pa:s-bad")).toMatchObject({ scope: "plugin", readable: false });
    expect(find(scanned.skills, "active-skill").readable).toBe(true);
    expect(scanned.problems.some((p) => p.path.endsWith("unreadable-skill") || p.path.endsWith("s-bad"))).toBe(false);
  });

  it("켜져 있는데 설치 기록이 없는 플러그인은 따로 적는다(꺼 둔 것은 넣지 않는다)", () => {
    expect(facts.pluginsWithoutInstall).toEqual(["ghost@m"]);
  });

  it("사용자 범위 서버를 한 프로젝트에서만 껐으면 사용자 범위에서는 켜져 있다", () => {
    expect(find(facts.mcpServers, "ctx").enabled).toBe(true);
  });

  it("플러그인: 켜짐, 관리 정책이 강제로 켬, 구성 요소, 사용 집계", () => {
    expect(find(facts.plugins, "pa")).toMatchObject({ id: "pa@m", entryName: "pa", scopes: ["user"], marketplaceEntry: "ok", enabled: true, compositionKnown: true, managedForced: false, hasHooks: true, components: ["hooks", "mcpServers", "skills"], dependencies: ["helper"], skills: ["pa:s1"], usageLastUsedMs: 1_760_000_600_000 });
    expect(find(facts.plugins, "forced")).toMatchObject({ enabled: true, managedForced: true, managedFixed: true });
  });

  it("훅의 겉모양: 관리 정책이 강제로 켠 플러그인과 사용자 설정의 셸 훅을 출처와 함께 낸다", () => {
    expect(facts.hooks.guards).toEqual([
      { source: "managed-plugin", pluginId: "forced@m", coversShell: true, canBlock: true },
      { source: "user", pluginId: null, coversShell: true, canBlock: true },
    ]);
    expect(facts.settings).toMatchObject({ user: "ok", defaultMode: { user: "bypass", managed: null } });
    expect(facts.settings.managedParts).toEqual([{ path: join(root, "managed", "managed-settings.json"), status: "ok" }]);
    expect(facts.hooks.unreadableSettings).toEqual([]);
  });

  it("설정 파일의 훅은 파일마다 본다. 뼈대나 처리기 검사에 걸린 파일의 확인 훅은 세지 않고 훅을 읽지 못한 설정 파일로 낸다(관리 정책은 그 출처의 hooks를 통째로 버리기도 한다)", async () => {
    const guard = { matcher: "Bash", hooks: [{ type: "command", command: "g" }] };
    const managedFile = join(root, "managed", "managed-settings.json");
    const userFile = join(input.homedir, ".claude", "settings.json");
    // 관리 정책 파일에는 맞는 확인 훅과 type이 없는 처리기가 함께 있고, 드롭인 파일에는 맞는 확인 훅만 있다
    await put(managedFile, json({ enabledPlugins: { "forced@m": true }, hooks: { PreToolUse: [guard, { matcher: "Bash", hooks: [{ command: "x" }] }] } }));
    await put(join(root, "managed", "managed-settings.d", "20-guard.json"), json({ hooks: { PreToolUse: [guard] } }));
    // 사용자 설정에는 맞는 확인 훅과, 다른 사건의 command가 없는 처리기가 함께 있다
    await put(userFile, json({ permissions: { defaultMode: "bypassPermissions" }, enabledPlugins: { "pa@m": true }, hooks: { PreToolUse: [guard], SessionStart: [{ hooks: [{ type: "command" }] }] } }));
    const scanned = await scanClaudeSetup(input);
    expect(scanned.hooks.guards).toEqual([
      { source: "managed", pluginId: null, coversShell: true, canBlock: true },
      { source: "managed-plugin", pluginId: "forced@m", coversShell: true, canBlock: true },
    ]);
    expect(scanned.hooks.unreadableSettings).toEqual([managedFile, userFile]);
    // 사용자 설정의 hooks가 묶음이 아니어도 그 파일의 훅을 읽지 못한 것이다
    await put(userFile, json({ hooks: "x" }));
    expect((await scanClaudeSetup(input)).hooks.unreadableSettings).toEqual([managedFile, userFile]);
  });

  it("훅 명령이 스킬 경로를 가리키는지는 관리 정책 파일마다 본다. 뒤 드롭인의 틀린 hooks가 앞 파일의 명령을 지우지 않는다(설계 11.3 E5 ⑤)", async () => {
    const skillDir = join(input.homedir, ".claude", "skills", "managed-hooked");
    await put(join(skillDir, "SKILL.md"), skill("managed-hooked"));
    await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true }, hooks: { SessionStart: [{ hooks: [{ type: "command", command: `node ${join(skillDir, "inject.mjs")}` }] }] } }));
    for (const bad of ["x", [], { SessionStart: false }]) {
      await put(join(root, "managed", "managed-settings.d", "20-bad.json"), json({ hooks: bad }));
      expect(find((await scanClaudeSetup(input)).skills, "managed-hooked")).toMatchObject({ hookProvided: true });
    }
  });

  it("결과에는 설정의 값, 훅 명령, 권한 규칙, 지침과 스킬의 글, 메일이 남지 않는다", () => {
    const text = JSON.stringify(facts);
    for (const secret of ["TOKEN-VALUE-123", "QUERY-SECRET", "guard-secret", "check.sh", "Bash(rm -rf *)", "시험을 먼저 돌린", "본문 글은", "someone@example.com", "echo hi"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("같은 입력이면 같은 사실이다", async () => {
    const again = await scanClaudeSetup({ ...input, cwds: [...input.cwds].reverse() });
    expect(JSON.stringify(again)).toBe(JSON.stringify(facts));
  });

  it(".claude.json이 풀리지 않으면 주인을 도구(tool)로 적고, 사용자 셋팅의 문제로 적지 않는다", async () => {
    await put(join(input.homedir, ".claude.json"), "{\"mcpServers\": {");
    const broken = await scanClaudeSetup(input);
    expect(broken.claudeJson).toBe("unparsable");
    expect(broken.problems.filter((p) => p.kind === "unparsable")).toEqual([
      { kind: "unparsable", owner: "tool", path: join(input.homedir, ".claude.json"), realPath: normalizePath(await realpath(join(input.homedir, ".claude.json"))) },
    ]);
    expect(broken.mcpServers.some((s) => s.scope === "user")).toBe(false);
  });

  it("관리 정책이 기본 모드를 정하지 않은 것과 다른 모드로 정한 것을 가른다(설계 11.3 S2 ㉡)", async () => {
    await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true }, permissions: { defaultMode: "default" } }));
    const overridden = await scanClaudeSetup(input);
    expect(facts.settings.defaultMode).toEqual({ user: "bypass", managed: null });
    expect(overridden.settings.defaultMode).toEqual({ user: "bypass", managed: "other" });
  });

  it("프로젝트 설정·로컬 설정·.mcp.json을 읽지 못하면 그 상태를 적는다. 깨진 것으로 세지 않는다", async () => {
    const proj = join(root, "work", "proj");
    for (const file of [join(proj, ".claude", "settings.json"), join(proj, ".claude", "settings.local.json"), join(proj, ".mcp.json")]) {
      await rm(file, { force: true });
      await mkdir(file, { recursive: true });
    }
    const unreadable = await scanClaudeSetup(input);
    expect(unreadable.projects.find((p) => p.root === proj)).toMatchObject({ settingsStatus: "unreadable", localSettingsStatus: "unreadable", mcpJsonStatus: "unreadable", hasSettings: true, permissionConflicts: 0 });
    expect(unreadable.problems.some((p) => p.path.startsWith(proj))).toBe(false);
  });

  it("아주 깊게 중첩된 값이 설정·관리 정책 드롭인·.claude.json·플러그인 정의에 있어도 끝까지 읽고, 그 정의의 지문만 null이다", async () => {
    const deepList = `${"[".repeat(200_000)}${"]".repeat(200_000)}`;
    const deepObject = `${'{"a":'.repeat(200_000)}1${"}".repeat(200_000)}`;
    await put(join(input.homedir, ".claude", "settings.json"), `{"permissions":{"deny":[${deepList}]},"env":${deepObject},"hooks":{"PreToolUse":[${deepList}]}}`);
    await put(join(root, "managed", "managed-settings.d", "10-deep.json"), `{"permissions":{"deny":[${deepList}]},"env":${deepObject}}`);
    await put(join(root, "managed", "managed-settings.d", "20-deep.json"), `{"permissions":{"deny":[${deepList},"x"]},"env":${deepObject}}`);
    await put(join(input.homedir, ".claude.json"), `{"mcpServers":{"deep":{"command":"x","args":${deepList}},"plain":{"command":"y"}}}`);
    await put(join(input.homedir, ".claude", "plugins", "cache", "m", "pa", "1.0.0", ".mcp.json"), `{"mcpServers":{"db":{"command":"z","env":${deepObject}}}}`);
    const deep = await scanClaudeSetup(input);
    expect(deep.settings.user).toBe("ok");
    expect(deep.settings.managedParts.map((p) => p.status)).toEqual(["ok", "ok", "ok"]);
    expect(find(deep.mcpServers, "deep").definitionHash).toBeNull();
    expect(find(deep.mcpServers, "plain").definitionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(find(deep.mcpServers, "db").definitionHash).toBeNull();
  });
});

describe("scanClaudeSetup의 플러그인", () => {
  const readJsonFile = async (path: string): Promise<Record<string, any>> => JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
  /** 설치 기록과 마켓 항목을 더한다. 마켓이 없으면 known_marketplaces.json에도 더한다 */
  const addPlugin = async (id: string, path: string, marketEntry: Record<string, unknown>): Promise<void> => {
    const plugins = join(input.homedir, ".claude", "plugins");
    const installed = await readJsonFile(join(plugins, "installed_plugins.json"));
    installed.plugins[id] = [{ scope: "user", installPath: path }];
    await put(join(plugins, "installed_plugins.json"), json(installed));
    const market = id.slice(id.indexOf("@") + 1);
    const location = join(root, `market-${market}`);
    const marketFile = join(location, ".claude-plugin", "marketplace.json");
    let file: Record<string, any> = { name: market, plugins: [] };
    try {
      file = await readJsonFile(marketFile);
    } catch {
      const known = await readJsonFile(join(plugins, "known_marketplaces.json"));
      known[market] = { source: { source: "github" }, installLocation: location };
      await put(join(plugins, "known_marketplaces.json"), json(known));
    }
    file.plugins.push(marketEntry);
    await put(marketFile, json(file));
  };
  const setEnabled = async (id: string, value: boolean): Promise<void> => {
    const path = join(input.homedir, ".claude", "settings.json");
    const settings = await readJsonFile(path);
    settings.enabledPlugins[id] = value;
    await put(path, json(settings));
  };

  it("두 이름이 다르면 기록의 이름 꼴을 두 이름으로 만들고 집계도 두 이름으로 찾는다. 열쇠는 마켓 항목의 이름이다", async () => {
    const p = join(root, "plugins", "store-alias");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "runtime-name" }));
    await put(join(p, "skills", "one", "SKILL.md"), skill("one"));
    await put(join(p, ".mcp.json"), json({ mcpServers: { db2: { command: "d" } } }));
    await addPlugin("store-alias@demo", p, { name: "store-alias", source: "./store-alias" });
    const claudeJson = await readJsonFile(join(input.homedir, ".claude.json"));
    claudeJson.pluginUsage["runtime-name@demo"] = { usageCount: 1, lastUsedAt: 1_760_000_900_000 };
    claudeJson.skillUsage["store-alias:one"] = { usageCount: 1, lastUsedAt: 1_760_000_800_000 };
    await put(join(input.homedir, ".claude.json"), json(claudeJson));
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.skills, "runtime-name:one")).toMatchObject({ pluginId: "store-alias@demo", recordNames: ["runtime-name:one", "store-alias:one"], usageLastUsedMs: 1_760_000_800_000 });
    expect(find(scanned.mcpServers, "db2").recordNames).toEqual(["plugin:runtime-name:db2", "plugin:store-alias:db2", "plugin_runtime-name_db2", "plugin_store-alias_db2"]);
    expect(find(scanned.plugins, "runtime-name")).toMatchObject({ id: "store-alias@demo", entryName: "store-alias", usageLastUsedMs: 1_760_000_900_000 });
  });

  it("enabledPlugins에 @builtin으로 끝나는 ID가 켜져 있어도 설치 기록이 없는 플러그인으로 세지 않는다", async () => {
    await setEnabled("cc-plugin-agents-md@builtin", true);
    expect((await scanClaudeSetup(input)).pluginsWithoutInstall).toEqual(["ghost@m"]);
  });

  it("마켓 항목의 hooks가 경로로 적힌 플러그인은 훅이 든 플러그인이다. 그 훅은 셸 명령을 덮는 확인 훅이 아니다", async () => {
    const p = join(root, "plugins", "ph");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "ph" }));
    await put(join(p, "skills", "s2", "SKILL.md"), skill("s2"));
    await put(join(p, "h.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await addPlugin("ph@m", p, { name: "ph", source: "./ph", hooks: "./h.json" });
    await setEnabled("ph@m", true);
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.plugins, "ph")).toMatchObject({ hasHooks: true, hooksUnreadable: false, components: ["hooks", "skills"] });
    expect(find(scanned.skills, "ph:s2").hookProvided).toBe(true);
    expect(scanned.hooks.guards.some((g) => g.pluginId === "ph@m")).toBe(false);
  });

  it("㉠의 플러그인 훅은 사용자 설정에서 켠 플러그인만 본다. 기본 켜짐으로 켜진 플러그인의 훅은 넣지 않는다", async () => {
    const p = join(root, "plugins", "dg");
    await put(join(p, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await addPlugin("dg@m", p, { name: "dg", source: "./dg" });
    const byDefault = await scanClaudeSetup(input);
    expect(find(byDefault.plugins, "dg").enabled).toBe(true);
    expect(byDefault.hooks.guards.some((g) => g.pluginId === "dg@m")).toBe(false);
    await setEnabled("dg@m", true);
    expect((await scanClaudeSetup(input)).hooks.guards).toContainEqual({ source: "user-plugin", pluginId: "dg@m", coversShell: true, canBlock: true });
  });

  it("스킬 폴더에 둔 플러그인(@skills-dir)은 스킬로 세지 않고 플러그인으로 낸다. 설치 기록이 없어도 구성을 안다", async () => {
    const userTool = join(input.homedir, ".claude", "skills", "my-tool");
    await put(join(userTool, ".claude-plugin", "plugin.json"), json({ name: "my-tool" }));
    await put(join(userTool, "SKILL.md"), skill("my-tool"));
    await put(join(userTool, "skills", "inner", "SKILL.md"), skill("inner"));
    // 그 플러그인의 훅 명령이 사용자 스킬의 경로를 가리킨다
    await put(join(userTool, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `node ${join(input.homedir, ".claude", "skills", "active-skill", "x.mjs")}` }] }] } }));
    const projTool = join(root, "work", "proj", ".claude", "skills", "proj-tool");
    await put(join(projTool, ".claude-plugin", "plugin.json"), json({ name: "proj-tool", defaultEnabled: false }));
    await setEnabled("my-tool@skills-dir", false);
    const off = await scanClaudeSetup(input);
    expect(off.skills.some((s) => s.name === "my-tool")).toBe(false);
    expect(find(off.plugins, "my-tool")).toMatchObject({ id: "my-tool@skills-dir", scopes: ["user"], compositionKnown: true, enabled: false, unknownEntries: ["SKILL.md"], skills: ["my-tool:inner"] });
    expect(find(off.skills, "my-tool:inner")).toMatchObject({ scope: "plugin", pluginId: "my-tool@skills-dir", hookProvided: true });
    expect(find(off.skills, "active-skill").hookProvided).toBe(true);
    expect(find(off.plugins, "proj-tool")).toMatchObject({ scopes: ["project"], projectRoots: [normalizePath(join(root, "work", "proj"))], enabled: false });
    expect(off.pluginsWithoutInstall).toEqual(["ghost@m"]);
    // ㉠: 사용자 스킬 폴더의 것이 사용자 설정에 참으로 적혀 있을 때만 넣는다
    expect(off.hooks.guards.some((g) => g.pluginId === "my-tool@skills-dir")).toBe(false);
    await setEnabled("my-tool@skills-dir", true);
    const on = await scanClaudeSetup(input);
    expect(find(on.plugins, "my-tool").enabled).toBe(true);
    expect(on.pluginsWithoutInstall).toEqual(["ghost@m"]);
    expect(on.hooks.guards).toContainEqual({ source: "user-plugin", pluginId: "my-tool@skills-dir", coversShell: true, canBlock: true });
  });

  it("플러그인 스킬은 위치마다 사실을 낸다. 실제 경로가 다르면 이름이 같아도 따로, 같은 원본을 다른 이름의 링크로 찾으면 그 링크도 위치 하나다", async () => {
    const p = join(root, "plugins", "dup");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "dup", skills: ["./extra", "./alias"] }));
    await put(join(p, "skills", "s", "SKILL.md"), skill("s"));
    await put(join(p, "extra", "s", "SKILL.md"), skill("other-s"));
    await put(join(p, "skills", "real", "SKILL.md"), skill("real"));
    await linkDir(join(p, "skills", "real"), join(p, "alias"));
    await addPlugin("dup@m", p, { name: "dup", source: "./dup" });
    // 집계에는 링크의 이름 꼴로만 남았고, 사용자 설정의 훅 명령은 링크 경로만 가리킨다
    const claudeJson = await readJsonFile(join(input.homedir, ".claude.json"));
    claudeJson.skillUsage["dup:alias"] = { usageCount: 1, lastUsedAt: 1_760_000_700_000 };
    await put(join(input.homedir, ".claude.json"), json(claudeJson));
    const settingsPath = join(input.homedir, ".claude", "settings.json");
    const settings = await readJsonFile(settingsPath);
    settings.hooks.SessionStart.push({ hooks: [{ type: "command", command: `node ${join(p, "alias", "SKILL.md")}` }] });
    await put(settingsPath, json(settings));
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.plugins, "dup").skills).toEqual(["dup:alias", "dup:real", "dup:s", "dup:s"]);
    expect(scanned.skills.filter((s) => s.name === "dup:s").map((s) => s.recordNames)).toContainEqual(["dup:other-s", "dup:s"]);
    const real = find(scanned.skills, "dup:real");
    const alias = find(scanned.skills, "dup:alias");
    // 두 위치의 실제 경로는 같고(2부가 스킬 하나로 묶는다), 링크 위치는 자기 이름 꼴·집계·링크 시각·훅 표시를 따로 갖는다
    expect(alias.realPath).toBe(real.realPath);
    expect(real).toMatchObject({ isLink: false, recordNames: ["dup:real"], usageLastUsedMs: null, hookProvided: false });
    expect(alias).toMatchObject({ isLink: true, recordNames: ["dup:alias", "dup:real"], usageLastUsedMs: 1_760_000_700_000, hookProvided: true });
    expect(alias.targetCreatedMs).not.toBeNull();
  });

  it("관리 정책이 강제로 켰어도 한 프로젝트에서만 도는 플러그인(프로젝트 스킬 폴더에 둔 것)의 훅은 ㉠으로 내지 않는다", async () => {
    const projGuard = join(root, "work", "proj", ".claude", "skills", "proj-guard");
    await put(join(projGuard, ".claude-plugin", "plugin.json"), json({ name: "proj-guard" }));
    await put(join(projGuard, "hooks", "hooks.json"), json({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "g" }] }] } }));
    await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true, "proj-guard@skills-dir": true } }));
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.plugins, "proj-guard")).toMatchObject({ enabled: true, managedForced: true, scopes: ["project"] });
    expect(scanned.hooks.guards.some((g) => g.pluginId === "proj-guard@skills-dir")).toBe(false);
    expect(scanned.hooks.guards.some((g) => g.pluginId === "forced@m")).toBe(true);
  });

  it("관리 정책의 skillOverrides가 정하면 다른 층과 상관없이 그 값이다", async () => {
    await put(join(root, "managed", "managed-settings.json"), json({ enabledPlugins: { "forced@m": true }, skillOverrides: { "active-skill": "off", "old-skill": "on" } }));
    const scanned = await scanClaudeSetup(input);
    expect(find(scanned.skills, "active-skill")).toMatchObject({ enabled: false, managedFixed: true });
    expect(find(scanned.skills, "old-skill")).toMatchObject({ enabled: true, managedFixed: true });
  });

  it("플러그인의 skills 경로가 스킬 하나를 바로 가리키면 그것이 위치 하나다. 이미 찾은 위치를 다시 가리키면 한 번만 센다", async () => {
    const p = join(root, "plugins", "sk");
    await put(join(p, ".claude-plugin", "plugin.json"), json({ name: "sk", skills: ["./extra/uno", "./skills/one", "./alias"] }));
    await put(join(p, "skills", "one", "SKILL.md"), skill("one"));
    await put(join(p, "skills", "two", "SKILL.md"), skill("two"));
    await put(join(p, "extra", "uno", "SKILL.md"), skill("uno"));
    await linkDir(join(p, "skills", "one"), join(p, "alias"));
    await addPlugin("sk@m", p, { name: "sk", source: "./sk" });
    expect(find((await scanClaudeSetup(input)).plugins, "sk")).toMatchObject({ skills: ["sk:alias", "sk:one", "sk:two", "sk:uno"], unknownEntries: [] });
  });
});
```

`test/scan/identity.test.ts`:

```ts
// 설치의 정체 열쇠를 시험한다. 같은 이름이라도 범위·실제 경로·정의가 다르면 다른 설치이고, 정의가 없는 서버는 정체가 없다(설계 11.3, 18.1, 21.1)
import { describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { installKeysOf, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { ClaudeSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";

const skill = (over: Partial<SkillFact>): SkillFact => ({
  scope: "user",
  name: "a",
  recordNames: ["a"],
  path: "/h/.claude/skills/a",
  realPath: "/h/.claude/skills/a",
  isLink: false,
  contentHash: null,
  createdMs: null,
  targetCreatedMs: null,
  projectRoot: null,
  pluginId: null,
  enabled: true,
  listed: true,
  readable: true,
  nameUnreadable: false,
  managedFixed: false,
  hookProvided: false,
  usageLastUsedMs: null,
  ...over,
});
const server = (over: Partial<McpFact>): McpFact => ({
  scope: "user",
  name: "s",
  recordNames: ["s"],
  projectRoot: null,
  pluginId: null,
  definitionHash: "h1",
  enabled: true,
  managedFixed: false,
  ...over,
});

describe("설치의 정체", () => {
  it("같은 이름의 스킬이 사용자 범위와 프로젝트 범위에 따로 있으면 다른 설치다", () => {
    expect(skillInstallKey(skill({}))).not.toBe(skillInstallKey(skill({ scope: "project", realPath: "/p/.claude/skills/a" })));
  });
  it("링크의 대상을 바꾸면(이름은 그대로) 다른 설치다", () => {
    expect(skillInstallKey(skill({ isLink: true, realPath: "/store/v1/a" }))).not.toBe(skillInstallKey(skill({ isLink: true, realPath: "/store/v2/a" })));
  });
  it("MCP 서버의 정의가 달라지면 다른 설치이고, 정의가 없는 서버는 정체가 없다", () => {
    expect(mcpInstallKey(server({}))).not.toBe(mcpInstallKey(server({ definitionHash: "h2" })));
    expect(mcpInstallKey(server({ scope: "claude-ai", definitionHash: null }))).toBeNull();
  });
  it("스킬은 범위, 이름, 실제 경로 가운데 하나만 달라도 다른 설치다", () => {
    const keys = [skill({}), skill({ scope: "project" }), skill({ name: "b" }), skill({ realPath: "/h/.claude/skills/other" })].map(skillInstallKey);
    expect(new Set(keys).size).toBe(4);
  });
  it("두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다(프로젝트 스킬의 정체에는 프로젝트가 든다)", () => {
    const a = skill({ scope: "project", projectRoot: "/p1", path: "/p1/.claude/skills/a", realPath: "/store/a", isLink: true });
    const b = skill({ scope: "project", projectRoot: "/p2", path: "/p2/.claude/skills/a", realPath: "/store/a", isLink: true });
    expect(skillInstallKey(a)).not.toBe(skillInstallKey(b));
  });
  it("실제 경로를 모르면 정규화한 경로로 정체를 만든다", () => {
    expect(skillInstallKey(skill({ realPath: null }))).toBe(skillInstallKey(skill({ realPath: normalizePath("/h/.claude/skills/a") })));
    expect(skillInstallKey(skill({ realPath: null }))).not.toBe(skillInstallKey(skill({ realPath: null, path: "/h/.claude/skills/b" })));
  });
  it("MCP 서버는 범위, 프로젝트, 플러그인, 이름, 정의의 지문 가운데 하나만 달라도 다른 설치다", () => {
    const keys = [server({}), server({ scope: "local" }), server({ projectRoot: "/p" }), server({ pluginId: "x@m" }), server({ name: "t" }), server({ definitionHash: "h2" })].map(mcpInstallKey);
    expect(new Set(keys).size).toBe(6);
  });
  it("모든 스킬과 정의가 있는 서버의 열쇠를 차례대로 낸다", () => {
    const facts = { skills: [skill({}), skill({ name: "b", realPath: "/h/.claude/skills/b" })], mcpServers: [server({}), server({ name: "c", scope: "claude-ai", definitionHash: null })] } as ClaudeSetupFacts;
    const keys = installKeysOf(facts);
    expect(keys).toHaveLength(3);
    expect([...keys].sort()).toEqual(keys);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/scan/claude.test.ts test/scan/identity.test.ts`
Expected: FAIL. `../../src/scan/claude.ts`와 `../../src/scan/identity.ts`를 찾지 못한다.

- [ ] **Step 3: 구현한다**

`src/scan/types.ts`:

```ts
// 셋팅 스캐너가 내는 Claude Code의 셋팅 사실. 숫자, 이름, 경로, 참거짓, 지문만 담고 설정의 값·지침의 글·훅 명령·권한 규칙의 글은 담지 않는다(설계 10, 12.1, 19.1)
import type { ShellGuard } from "./hooks.ts";
import type { InstructionSet } from "./instructions.ts";
import type { ComponentKind } from "./plugins.ts";
import type { ModeFact } from "./settings.ts";

export type FileStatus = "ok" | "missing" | "unparsable" | "unreadable";

export interface SkillFact {
  scope: "user" | "project" | "plugin";
  /** 설치의 이름. 사용자·프로젝트 스킬은 폴더 이름, 플러그인 스킬은 '<플러그인의 유효 이름>:<폴더 이름>' */
  name: string;
  /** 세션 기록의 이름과 맞출 꼴(names.ts의 skillRecordNames) */
  recordNames: string[];
  path: string;
  realPath: string | null;
  isLink: boolean;
  /** 폴더 안 모든 파일의 지문. 견줄 수 없으면 null */
  contentHash: string | null;
  createdMs: number | null;
  targetCreatedMs: number | null;
  /** project 범위면 그 프로젝트의 정규화한 뿌리 */
  projectRoot: string | null;
  /** plugin 범위면 '<마켓 항목 이름>@<마켓>' */
  pluginId: string | null;
  /** 어느 맥락(전역이나 목록의 프로젝트 하나)에서든 켜져 있다 */
  enabled: boolean;
  /** 실린 목록(skill_listing)에 실릴 수 있다. 머리말의 disable-model-invocation이나 skillOverrides의 off·user-invocable-only가 막으면 거짓이다 */
  listed: boolean;
  /** SKILL.md를 글로 읽었는지. 읽지 못했으면 머리말을 판정하지 않았고(머리말 없음 문제로 세지 않는다) 알림의 재료다(설계 11.3 S3, 20.1) */
  readable: boolean;
  /** 머리말에 name이 있는데 값을 읽지 못했다. 기록의 이름 꼴에는 폴더 이름만 들었다 */
  nameUnreadable: boolean;
  /** 관리 정책의 skillOverrides가 이 이름을 정한다(바꿀 수 없음) */
  managedFixed: boolean;
  /** 훅을 가진 플러그인에 들었거나, 어느 훅 명령에 이 스킬의 경로가 나온다(E5 ⑤) */
  hookProvided: boolean;
  /** 도구가 세는 집계(skillUsage)에서 이 스킬의 이름 꼴 가운데 가장 늦은 마지막 사용 시각. 없으면 null. .claude.json을 읽지 못했으면(ClaudeSetupFacts.claudeJson이 ok가 아님) 없는 것이 아니라 모르는 것이다(설계 10) */
  usageLastUsedMs: number | null;
}

export interface McpFact {
  scope: "user" | "local" | "project" | "plugin" | "claude-ai";
  name: string;
  /** 세션 기록의 이름과 맞출 꼴(names.ts의 mcpRecordNames) */
  recordNames: string[];
  projectRoot: string | null;
  pluginId: string | null;
  /** 정의의 지문(이 PC의 무작위 값을 섞은 HMAC). 정의가 PC에 없거나, 읽지 못하거나, 너무 깊게 중첩돼 정규화하지 못하면 null */
  definitionHash: string | null;
  /** 어느 맥락에서든 켜져 있다(막히지 않았고, .mcp.json의 것은 승인됐고, 플러그인의 것은 플러그인이 켜져 있다) */
  enabled: boolean;
  /** 관리 정책이 막거나 허용 목록으로 정한다(바꿀 수 없음) */
  managedFixed: boolean;
}

export interface PluginFact {
  /** '<마켓 항목 이름>@<마켓>'. enabledPlugins·pluginUsage의 열쇠다 */
  id: string;
  /** 마켓 항목의 이름. 다른 플러그인의 dependencies가 가리키는 이름이다 */
  entryName: string;
  /** 구성 요소의 이름 접두로 쓰는 유효 이름(plugin.json의 name, 없으면 마켓 항목의 이름) */
  name: string;
  /** 설치 기록의 범위들 */
  scopes: string[];
  /** 프로젝트·로컬 범위 기록의 프로젝트(정규화) */
  projectRoots: string[];
  installPath: string;
  exists: boolean;
  manifest: FileStatus;
  /** none은 스킬 폴더에 둔 플러그인(<name>@skills-dir)이라 마켓 항목이 없는 것이 정상이다 */
  marketplaceEntry: "ok" | "missing" | "unreadable" | "none";
  /** 구성을 아는지. 거짓이면 구성 요소와 스킬을 보지 않았다(설계 10 「구성을 모르는 플러그인」) */
  compositionKnown: boolean;
  enabled: boolean;
  /** 관리 정책의 enabledPlugins가 정한다(참이면 강제로 켬, 거짓이면 막음) */
  managedFixed: boolean;
  managedForced: boolean;
  components: ComponentKind[];
  unknownEntries: string[];
  dependencies: string[] | null;
  hasHooks: boolean;
  hooksUnreadable: boolean;
  mcpUnreadable: boolean;
  /** 이 플러그인의 스킬 위치의 설치 이름(SkillFact.name, 이름 차례). 같은 위치는 한 번만 들고, 같은 원본을 가리키는 다른 링크는 위치마다 든다 */
  skills: string[];
  /** 도구의 집계(pluginUsage)에서 두 이름(마켓 항목의 이름, 구성 요소의 이름)으로 찾은 마지막 사용 시각 가운데 늦은 것. 없으면 null. .claude.json을 읽지 못했으면 claudeJson의 상태로 가린다 */
  usageLastUsedMs: number | null;
}

export interface ProjectFact {
  root: string;
  normRoot: string;
  kind: "git" | "folder";
  exists: boolean;
  excluded: boolean;
  cwds: string[];
  /** .claude/settings.json, .claude/settings.local.json, .mcp.json의 읽기 상태. 없어진 폴더와 프로젝트로 보지 않는 폴더는 읽지 않아 null이다 */
  settingsStatus: FileStatus | null;
  localSettingsStatus: FileStatus | null;
  mcpJsonStatus: FileStatus | null;
  /** 설정 파일이 있는지(읽혔는지와 상관없다) */
  hasSettings: boolean;
  hasLocalSettings: boolean;
  /** 프로젝트 지침(전역과 같은 파일은 표시하고 줄 지문에서만 뺀다). 읽지 않은 폴더는 빈 묶음이다 */
  instructions: InstructionSet;
  /** 프로젝트 설정·로컬 설정의 기본 모드가 권한 우회다(S2의 옛 버전 판정에 쓴다) */
  bypassInProject: boolean;
  bypassInLocal: boolean;
  /** 사용자 설정과 이 프로젝트(프로젝트 설정과 로컬 설정)의 권한 규칙이 부딪히는 쌍의 수(F6). 읽은 설정만으로 센다 */
  permissionConflicts: number;
}

export interface ClaudeHooksFacts {
  /** ㉠의 네 출처에서 찾은 PreToolUse 처리기의 겉모양 */
  guards: ShellGuard[];
  userDisableAll: boolean;
  managedDisableAll: boolean;
  managedAllowManagedOnly: boolean;
  /** 훅 정의를 읽지 못한 켜진 플러그인('<이름>@<마켓>'). 그 플러그인의 훅은 읽은 만큼만 있다 */
  unreadablePlugins: string[];
  /**
   * hooks가 뼈대나 처리기 검사에 걸린 설정 파일(관리 정책 파일과 드롭인 파일, 사용자 설정)의 경로. 도구가 그 항목만 버리는지 그 파일의 훅을 통째로 버리는지
   * 가릴 수 없어서 그 파일의 확인 훅은 guards에 넣지 않았다(설계 11.3 ㉠의 「등록돼 있다」)
   */
  unreadableSettings: string[];
}

/** S3의 재료. 누구의 파일인지를 붙인다. 규칙이 어느 것을 셀지는 설계 11.3 S3가 정한다 */
export interface SetupProblem {
  kind: "unparsable" | "noFrontmatter" | "danglingLink";
  /** user는 사용자가 고치는 셋팅(설정 층·.mcp.json·사용자와 프로젝트 스킬), managed는 관리 정책, plugin은 플러그인 안, tool은 도구가 쓰는 상태 파일(.claude.json) */
  owner: "user" | "managed" | "plugin" | "tool";
  path: string;
  /** 링크를 푼 실제 경로(정규화). 가리키는 곳이 없는 링크처럼 풀지 못하면 null이다. 같은 실제 파일을 한 번만 세는 데 쓴다(설계 11.3 S3) */
  realPath: string | null;
}

export interface ClaudeSetupFacts {
  tool: "claude-code";
  home: string;
  claudeJson: FileStatus;
  globalInstructions: InstructionSet;
  /** 전역 지침에 목록의 프로젝트 경로나 이름이 나온 횟수(정규화한 뿌리 → 횟수, 17절 단서) */
  globalMentions: Record<string, number>;
  settings: {
    user: FileStatus;
    /** 관리 정책을 이룬 파일과 상태. 비어 있으면 관리 정책 파일이 없다 */
    managedParts: { path: string; status: FileStatus }[];
    /** 사용자 설정과 관리 정책의 기본 모드. 그 층이 정하지 않았으면 null이다(설계 11.3 S2 ㉡: 둘 다 정했으면 관리 정책의 값) */
    defaultMode: { user: ModeFact; managed: ModeFact };
  };
  hooks: ClaudeHooksFacts;
  pluginsFile: FileStatus;
  plugins: PluginFact[];
  /** 어느 맥락에서 켜져 있는데 설치 기록이 없는 플러그인("<이름>@<마켓>", 구성을 모르는 플러그인) */
  pluginsWithoutInstall: string[];
  skills: SkillFact[];
  mcpServers: McpFact[];
  projects: ProjectFact[];
  /** S3의 재료(종류, 주인, 경로 차례) */
  problems: SetupProblem[];
  /** 목록을 읽지 못한 스킬 폴더 */
  unreadableDirs: string[];
}
```

`src/scan/claude.ts`:

```ts
// Claude Code의 지금 셋팅을 읽어 셋팅 사실로 낸다. 설정 층·지침·스킬·플러그인·MCP 서버·권한과 훅의 겉모양을 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 7.2, 10, 11.3, 19.1)
import { join } from "node:path";
import { claudeHome, normalizePath } from "../adapters/claude/locate.ts";
import { claudeJsonPath, readClaudeJson, type ClaudeJsonProject } from "./claude-json.ts";
import { entryInfo, readJson } from "./fs.ts";
import { hookCommandTexts, hookMapValid, preToolUseGuards, type ShellGuard } from "./hooks.ts";
import { emptyInstructionSet, readGlobalInstructions, readProjectInstructions } from "./instructions.ts";
import { definitionHash, mcpAllowed, projectServerApproved, type McpContext } from "./mcp.ts";
import { mcpRecordNames, skillRecordNames } from "./names.ts";
import { conflictPairs } from "./permissions.ts";
import { mcpMapOf, readSkillsDirPlugins, scanPlugins, type McpDefinitionEntry, type PluginInstall, type SkillsDirPluginRef } from "./plugins.ts";
import { groupProjects } from "./projects.ts";
import { managedSettingsDir, readLayer, readManagedLayer, viewOf, type SettingsLayer, type SettingsView } from "./settings.ts";
import { scanSkillPath, scanSkillRoot, type SkillFolder, type SkillRootScan } from "./skills.ts";
import type { ClaudeSetupFacts, FileStatus, McpFact, PluginFact, ProjectFact, SetupProblem, SkillFact } from "./types.ts";

export interface ScanInput {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 수집 구간에 응답이 있는 주 세션의 작업 폴더(세션마다 처음 적힌 것, 설계 10 「프로젝트 목록」) */
  cwds: readonly string[];
  /** 세션 기록에 나온 claude.ai 서버의 이름('claude.ai '로 시작하는 것) */
  claudeAiNames: readonly string[];
  /** 상태 파일의 무작위 값(16진 64자) */
  salt: string;
  /** 관리 정책 폴더. 주지 않으면 OS의 자리다(시험에서 바꾼다) */
  managedDir?: string;
}

/** 설정을 합쳐 볼 맥락 하나. 전역(사용자 설정만)이거나 목록의 프로젝트 하나(사용자, 프로젝트, 로컬)다. 관리 정책은 늘 맨 위다. */
interface Context {
  /** 관리 정책을 뺀 층(뒤가 앞을 이긴다) */
  ordered: SettingsView[];
  managed: SettingsView;
  mcp: McpContext;
}

const SKILL_SCOPE_ORDER = { user: 0, project: 1, plugin: 2 } as const;
const MCP_SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 } as const;
const OWNER_ORDER = { user: 0, managed: 1, plugin: 2, tool: 3 } as const;
const cmp = (a: string | null, b: string | null): number => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);
const layerStatus = (layer: SettingsLayer): FileStatus => layer.parts[0]?.status ?? "missing";

function mergeClaudeJsonEntries(entries: readonly ClaudeJsonProject[]): ClaudeJsonProject | null {
  if (entries.length === 0) return null;
  const union = (pick: (e: ClaudeJsonProject) => string[]): string[] => [...new Set(entries.flatMap(pick))].sort();
  return {
    key: entries[0]!.key,
    normKey: entries[0]!.normKey,
    mcpServers: entries.flatMap((e) => e.mcpServers),
    enabledMcpjsonServers: union((e) => e.enabledMcpjsonServers),
    disabledMcpjsonServers: union((e) => e.disabledMcpjsonServers),
    disabledMcpServers: union((e) => e.disabledMcpServers),
  };
}

/** 플러그인이 이 맥락에서 켜져 있는지. 관리 정책이 정하면 그 값, 아니면 층의 마지막 값, 아무 데도 없으면 기본값이다. */
function pluginEnabledIn(context: Context, id: string, defaultEnabled: boolean): boolean {
  if (Object.hasOwn(context.managed.enabledPlugins, id)) return context.managed.enabledPlugins[id]!;
  let value: boolean | undefined;
  for (const layer of context.ordered) if (Object.hasOwn(layer.enabledPlugins, id)) value = layer.enabledPlugins[id];
  return value ?? defaultEnabled;
}

/** 이 맥락에서 그 이름들의 skillOverrides 값. 관리 정책이 먼저이고, 아니면 층의 마지막 값이다. 없으면 null이다(플러그인 스킬에는 듣지 않는다). */
function overrideIn(context: Context, names: readonly string[]): string | null {
  for (const name of names) if (Object.hasOwn(context.managed.skillOverrides, name)) return context.managed.skillOverrides[name]!;
  let value: string | null = null;
  for (const layer of context.ordered) for (const name of names) if (Object.hasOwn(layer.skillOverrides, name)) value = layer.skillOverrides[name]!;
  return value;
}

/** 관리 정책이 그 서버를 막거나 허용 목록으로 정하는지(사용자가 바꿀 수 없다). */
function managedHits(managed: SettingsView, names: readonly string[], definition: Record<string, unknown> | null): boolean {
  if (managed.allowedMcpServers !== null) return true;
  return !mcpAllowed({ layers: [managed], managed: { ...managed, allowedMcpServers: null }, project: null }, names, definition);
}

const normalizedCommand = (text: string): string => text.replace(/\\/g, "/").toLowerCase();

/** 시각들 가운데 가장 늦은 것. 하나도 없으면 null이다. */
const latest = (times: readonly (number | undefined)[]): number | null => times.reduce<number | null>((max, t) => (t === undefined || (max !== null && max >= t) ? max : t), null);

export async function scanClaudeSetup(input: ScanInput): Promise<ClaudeSetupFacts> {
  const home = claudeHome(input.env, input.homedir);
  const claudeJsonFile = claudeJsonPath(input.env, input.homedir);
  const claudeJson = await readClaudeJson(claudeJsonFile);
  const userLayer = await readLayer(join(home, "settings.json"));
  const managedLayer = await readManagedLayer(input.managedDir ?? managedSettingsDir(input.platform));
  const userView = viewOf(userLayer.value);
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
  const refs = await groupProjects(input.cwds, { homedir: input.homedir, tmpdir: input.tmpdir, platform: input.platform });
  const global: Context = { ordered: [userView], managed: managedView, mcp: { layers: [userView, managedView], managed: managedView, project: null } };
  const projectLayers = new Map<string, { project: SettingsLayer; local: SettingsLayer }>();
  const contexts = new Map<string, Context>();
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  for (const ref of active) {
    const project = await readLayer(join(ref.root, ".claude", "settings.json"));
    const local = await readLayer(join(ref.root, ".claude", "settings.local.json"));
    unparsable(project, "user");
    unparsable(local, "user");
    projectLayers.set(ref.normRoot, { project, local });
    const projectView = viewOf(project.value);
    const localView = viewOf(local.value);
    // 프로젝트마다의 값은 본 저장소 뿌리의 열쇠로만 찾는다. 같은 뿌리를 다르게 적은 열쇠는 합치고, 하위 폴더와 워크트리의 열쇠는 보지 않는다(설계 10 「프로젝트를 세는 단위와 셋팅을 읽는 곳은 같다」)
    const entry = mergeClaudeJsonEntries(claudeJson.projects.filter((p) => p.normKey === ref.normRoot));
    contexts.set(ref.normRoot, {
      ordered: [userView, projectView, localView],
      managed: managedView,
      mcp: { layers: [userView, projectView, localView, managedView], managed: managedView, project: entry },
    });
  }
  const everyContext = [global, ...contexts.values()];

  // 전역 지침과 프로젝트가 나온 횟수
  const globalRead = await readGlobalInstructions(home, active);

  // 사용자·프로젝트 스킬 폴더를 먼저 훑는다. 그 안에 둔 플러그인(@skills-dir)의 훅 명령까지 모은 뒤에 스킬마다 훅을 견주기 위해서다
  const userSkillScan = await scanSkillRoot(join(home, "skills"), { pluginDirs: true });
  const projectSkillScans = new Map<string, SkillRootScan>();
  for (const ref of active) projectSkillScans.set(ref.normRoot, await scanSkillRoot(join(ref.root, ".claude", "skills"), { pluginDirs: true }));
  const skillsDirRefs: SkillsDirPluginRef[] = [
    ...userSkillScan.pluginDirs.map((path) => ({ path, scope: "user" as const, projectRoot: null })),
    ...active.flatMap((ref) => projectSkillScans.get(ref.normRoot)!.pluginDirs.map((path) => ({ path, scope: "project" as const, projectRoot: ref.normRoot }))),
  ];

  // 플러그인. 사용자 범위(또는 범위를 모르는) 기록이 있으면 모든 맥락을, 프로젝트·로컬 범위만 있으면 그 프로젝트의 맥락만 본다.
  // 스킬 폴더에 둔 플러그인은 설치 기록에 없어도 구성을 아는 플러그인이다(설계 10 「스킬 폴더에 둔 플러그인」)
  const pluginsScan = await scanPlugins(home);
  const allPlugins = [...pluginsScan.plugins, ...(await readSkillsDirPlugins(skillsDirRefs))].sort(
    (a, b) => cmp(a.id, b.id) || cmp(normalizePath(a.installPath), normalizePath(b.installPath)),
  );
  const contextsOfPaths = (paths: readonly string[]): Context[] => {
    const out: Context[] = [];
    for (const ref of active) if (paths.some((path) => ref.normRoot === path || ref.cwds.includes(path))) out.push(contexts.get(ref.normRoot)!);
    return out;
  };
  const userScoped = (plugin: PluginInstall): boolean => plugin.scopes.some((scope) => scope !== "project" && scope !== "local");
  const pluginContexts = (plugin: PluginInstall): Context[] => (userScoped(plugin) ? everyContext : contextsOfPaths(plugin.projectPaths));

  // 훅 명령의 글(메모리에서만 쓴다): 스킬 경로가 나오는지 보는 데 쓴다
  // 관리 정책의 훅 명령은 파일마다 모은다. 합친 값에서는 뒤 파일의 틀린 hooks가 앞 파일의 명령을 덮는다. ㉠과 달리 검사에 걸린 파일의 명령도 넣는다.
  // 도구가 그 파일의 나머지 훅을 돌릴 수 있고, 넓게 보아야 "안 쓴 것이 확인됨"을 잘못 내지 않는다(설계 11.3 E5 ⑤)
  const commandTexts: string[] = [
    ...hookCommandTexts(userView.hooks),
    ...managedLayer.hookSources.flatMap(({ hooks }) => hookCommandTexts(hooks)),
    ...[...contexts.values()].flatMap((c) => c.ordered.slice(1).flatMap((view) => hookCommandTexts(view.hooks))),
    ...allPlugins.flatMap((p) => p.hookEvents.flatMap(hookCommandTexts)),
  ].map(normalizedCommand);
  const mentionedByHook = (skill: SkillFolder): boolean => {
    const fragments = [normalizePath(skill.path), skill.realPath ?? "", `/skills/${skill.dirName}`].filter((f) => f !== "").map((f) => f.toLowerCase());
    return commandTexts.some((text) => fragments.some((fragment) => text.includes(fragment)));
  };
  const usageOf = (names: readonly string[]): number | null => {
    let latest: number | null = null;
    for (const name of names) {
      const at = claudeJson.skillUsage[name];
      if (at !== undefined && (latest === null || at > latest)) latest = at;
    }
    return latest;
  };

  // 스킬
  const skills: SkillFact[] = [];
  const unreadableDirs: string[] = [];
  const addSkill = (folder: SkillFolder, fields: Pick<SkillFact, "scope" | "name" | "recordNames" | "projectRoot" | "pluginId" | "enabled" | "listed" | "managedFixed" | "hookProvided">): void => {
    skills.push({
      ...fields,
      path: folder.path,
      realPath: folder.realPath,
      isLink: folder.isLink,
      contentHash: folder.contentHash,
      createdMs: folder.createdMs,
      targetCreatedMs: folder.targetCreatedMs,
      readable: folder.readable,
      nameUnreadable: folder.nameUnreadable,
      usageLastUsedMs: usageOf(fields.recordNames),
    });
  };
  const addOwnSkills = (scan: SkillRootScan, scope: "user" | "project", projectRoot: string | null, scopeContexts: readonly Context[]): void => {
    for (const path of scan.danglingLinks) problems.push({ kind: "danglingLink", owner: "user", path });
    unreadableDirs.push(...scan.unreadableDirs);
    for (const folder of scan.skills) {
      const recordNames = skillRecordNames(folder.dirName, folder.declaredName, null);
      const modes = scopeContexts.map((context) => overrideIn(context, recordNames));
      if (folder.readable && !folder.hasFrontmatter) problems.push({ kind: "noFrontmatter", owner: "user", path: folder.path });
      addSkill(folder, {
        scope,
        name: folder.dirName,
        recordNames,
        projectRoot,
        pluginId: null,
        enabled: modes.some((mode) => mode !== "off"),
        listed: !folder.disableModelInvocation && modes.some((mode) => mode !== "off" && mode !== "user-invocable-only"),
        managedFixed: recordNames.some((name) => Object.hasOwn(managedView.skillOverrides, name)),
        hookProvided: mentionedByHook(folder),
      });
    }
  };
  addOwnSkills(userSkillScan, "user", null, everyContext);
  for (const ref of active) addOwnSkills(projectSkillScans.get(ref.normRoot)!, "project", ref.normRoot, [contexts.get(ref.normRoot)!]);

  const plugins: PluginFact[] = [];
  const mcpServers: McpFact[] = [];
  for (const plugin of allPlugins) {
    if (plugin.manifest === "unparsable") problems.push({ kind: "unparsable", owner: "plugin", path: join(plugin.installPath, ".claude-plugin", "plugin.json") });
    const enabledIn = pluginContexts(plugin).filter((context) => pluginEnabledIn(context, plugin.id, plugin.defaultEnabled));
    // 훅이 든 플러그인: 구성에 훅이 있다. 돌지 않는 꼴(경로로 적은 마켓 항목의 훅)도 든다(설계 10 「마켓 항목」, 11.3 E5 ⑤)
    const hasHooks = plugin.components.includes("hooks");
    // 기록에 남는 꼴은 구성 요소의 이름으로 만들고, 마켓 항목의 이름이 다르면 그 꼴도 넣는다(설계 10 「설치와 기록의 이름을 잇는 법」)
    const pluginNames = [...new Set([plugin.name, plugin.entryName])];
    // 구성을 모르는 플러그인의 스킬은 설치로 세지 않는다(설계 10 「플러그인의 구성」). 경로 자체가 스킬 폴더일 수 있다
    const skillNames: string[] = [];
    // 같은 위치(경로)를 두 번 찾으면 한 번만 센다(매니페스트가 기본 skills/ 안의 스킬을 다시 가리킨 경우).
    // 다른 이름의 링크처럼 위치가 다르면 실제 경로가 같아도 위치마다 사실을 낸다. 스킬 묶음으로 세는 일은 2부가 한다(설계 10 「위치와 스킬 묶음」·「스킬을 찾는 폴더」)
    const seenPaths = new Set<string>();
    if (plugin.compositionKnown) {
      for (const root of plugin.skillRoots) {
        const scan = await scanSkillPath(root);
        for (const path of scan.danglingLinks) problems.push({ kind: "danglingLink", owner: "plugin", path });
        unreadableDirs.push(...scan.unreadableDirs);
        for (const folder of scan.skills) {
          const at = normalizePath(folder.path);
          if (seenPaths.has(at)) continue;
          seenPaths.add(at);
          const recordNames = [...new Set(pluginNames.flatMap((pluginName) => skillRecordNames(folder.dirName, folder.declaredName, pluginName)))].sort();
          const name = `${plugin.name}:${folder.dirName}`;
          skillNames.push(name);
          if (folder.readable && !folder.hasFrontmatter) problems.push({ kind: "noFrontmatter", owner: "plugin", path: folder.path });
          addSkill(folder, {
            scope: "plugin",
            name,
            recordNames,
            projectRoot: null,
            pluginId: plugin.id,
            enabled: enabledIn.length > 0,
            listed: enabledIn.length > 0 && !folder.disableModelInvocation,
            managedFixed: Object.hasOwn(managedView.enabledPlugins, plugin.id),
            hookProvided: hasHooks || mentionedByHook(folder),
          });
        }
      }
    }
    for (const server of plugin.mcpServers) {
      const recordNames = [...new Set(pluginNames.flatMap((pluginName) => mcpRecordNames(server.name, pluginName)))].sort();
      // 막는 목록은 서버 열쇠 그대로 적었을 수도 있어서 그 이름도 함께 견준다
      const denyNames = [...new Set([...recordNames, server.name])];
      mcpServers.push({
        scope: "plugin",
        name: server.name,
        recordNames,
        projectRoot: null,
        pluginId: plugin.id,
        definitionHash: server.definition === null ? null : definitionHash(input.salt, server.definition),
        enabled: enabledIn.some((context) => mcpAllowed(context.mcp, denyNames, server.definition)),
        managedFixed: managedHits(managedView, denyNames, server.definition),
      });
    }
    plugins.push({
      id: plugin.id,
      entryName: plugin.entryName,
      name: plugin.name,
      scopes: plugin.scopes,
      projectRoots: plugin.projectPaths,
      installPath: plugin.installPath,
      exists: plugin.exists,
      manifest: plugin.manifest,
      marketplaceEntry: plugin.marketplaceEntry,
      compositionKnown: plugin.compositionKnown,
      enabled: enabledIn.length > 0,
      managedFixed: Object.hasOwn(managedView.enabledPlugins, plugin.id),
      managedForced: managedView.enabledPlugins[plugin.id] === true,
      components: plugin.components,
      unknownEntries: plugin.unknownEntries,
      dependencies: plugin.dependencies,
      hasHooks,
      hooksUnreadable: plugin.hooksUnreadable,
      mcpUnreadable: plugin.mcpUnreadable,
      skills: skillNames.sort(),
      // 집계의 열쇠가 어느 이름인지 확인하지 못해 두 이름으로 모두 찾는다(설계 10 「~/.claude.json」)
      usageLastUsedMs: latest(pluginNames.map((pluginName) => claudeJson.pluginUsage[`${pluginName}@${plugin.marketplace}`])),
    });
  }

  // 켜져 있는데 installed_plugins.json에 설치 기록이 없는 플러그인. 구성을 모르는 플러그인이다(설계 10, 16.2 A2)
  const installedIds = new Set(allPlugins.map((p) => p.id));
  const mentionedIds = new Set<string>(Object.keys(managedView.enabledPlugins));
  for (const context of everyContext) for (const layer of context.ordered) for (const id of Object.keys(layer.enabledPlugins)) mentionedIds.add(id);
  // 도구에 든 플러그인(@builtin)은 플러그인으로 세지 않는다(설계 10 「도구에 든 플러그인」)
  const pluginsWithoutInstall = [...mentionedIds]
    .filter((id) => !installedIds.has(id) && !id.endsWith("@builtin"))
    .filter((id) => everyContext.some((context) => pluginEnabledIn(context, id, false)))
    .sort();

  // MCP 서버(플러그인 것은 위에서 넣었다)
  const addServer = (scope: "user" | "local" | "project", entry: McpDefinitionEntry, projectRoot: string | null, enabled: boolean): void => {
    const names = mcpRecordNames(entry.name, null);
    mcpServers.push({
      scope,
      name: entry.name,
      recordNames: names,
      projectRoot,
      pluginId: null,
      definitionHash: entry.definition === null ? null : definitionHash(input.salt, entry.definition),
      enabled,
      managedFixed: managedHits(managedView, names, entry.definition),
    });
  };
  for (const entry of claudeJson.userMcpServers) {
    const names = mcpRecordNames(entry.name, null);
    addServer("user", entry, null, everyContext.some((context) => mcpAllowed(context.mcp, names, entry.definition)));
  }
  const mcpJsonStatus = new Map<string, FileStatus>();
  for (const ref of active) {
    const context = contexts.get(ref.normRoot)!;
    // 같은 프로젝트로 묶인 열쇠 여럿에 같은 서버가 있으면(정의가 같으면 열쇠의 차례와 상관없이) 하나로 센다
    const seen = new Set<string>();
    for (const entry of context.mcp.project?.mcpServers ?? []) {
      const identity = `${entry.name}\u0000${entry.definition === null ? "" : (definitionHash(input.salt, entry.definition) ?? "deep")}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      addServer("local", entry, ref.normRoot, mcpAllowed(context.mcp, mcpRecordNames(entry.name, null), entry.definition));
    }
    const file = join(ref.root, ".mcp.json");
    const read = await readJson(file);
    const entries = read.status === "ok" ? mcpMapOf(read.value) : null;
    const status: FileStatus = read.status !== "ok" ? read.status : entries === null ? "unparsable" : "ok";
    mcpJsonStatus.set(ref.normRoot, status);
    if (status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: file });
    for (const entry of entries ?? []) {
      const approved = projectServerApproved(context.mcp, entry.name) && mcpAllowed(context.mcp, mcpRecordNames(entry.name, null), entry.definition);
      addServer("project", entry, ref.normRoot, approved);
    }
  }
  const claudeAiNames = [...new Set([...claudeJson.claudeAiEverConnected, ...input.claudeAiNames.filter((n) => n.startsWith("claude.ai "))])].sort();
  for (const name of claudeAiNames) {
    const names = mcpRecordNames(name, null);
    mcpServers.push({ scope: "claude-ai", name, recordNames: names, projectRoot: null, pluginId: null, definitionHash: null, enabled: mcpAllowed(global.mcp, names, null), managedFixed: managedHits(managedView, names, null) });
  }

  // 프로젝트
  const projects: ProjectFact[] = [];
  for (const ref of refs) {
    const layers = projectLayers.get(ref.normRoot);
    const projectView = viewOf(layers?.project.value ?? null);
    const localView = viewOf(layers?.local.value ?? null);
    const settingsStatus = layers === undefined ? null : layerStatus(layers.project);
    const localSettingsStatus = layers === undefined ? null : layerStatus(layers.local);
    const hasSettings = settingsStatus !== null && settingsStatus !== "missing";
    const hasLocalSettings = localSettingsStatus !== null && localSettingsStatus !== "missing";
    projects.push({
      root: ref.root,
      normRoot: ref.normRoot,
      kind: ref.kind,
      exists: ref.exists,
      excluded: ref.excluded,
      cwds: ref.cwds,
      settingsStatus,
      localSettingsStatus,
      mcpJsonStatus: mcpJsonStatus.get(ref.normRoot) ?? null,
      hasSettings,
      hasLocalSettings,
      instructions: layers === undefined ? emptyInstructionSet() : await readProjectInstructions(ref.root, globalRead.set),
      bypassInProject: projectView.bypass,
      bypassInLocal: localView.bypass,
      permissionConflicts: layers === undefined ? 0 : conflictPairs(userView, settingsStatus === "ok" ? projectView : null, localSettingsStatus === "ok" ? localView : null),
    });
  }

  // 훅의 겉모양(㉠의 네 출처): 관리 정책, 관리 정책이 강제로 켠 플러그인, 사용자 설정, 사용자 설정에서 켠 플러그인(설계 11.3 「㉠의 훅을 찾는 곳」).
  // 사용자 설정에서 켠 것은 사용자 설정의 enabledPlugins에 참으로 적힌 사용자 범위 플러그인이다. 기본 켜짐으로 켜진 것은 넣지 않는다(엄한 쪽)
  const managedPluginGuards: ShellGuard[] = [];
  const userPluginGuards: ShellGuard[] = [];
  const unreadablePlugins: string[] = [];
  for (const plugin of allPlugins) {
    // ㉠은 어느 프로젝트에서든 도는 훅만 본다. 관리 정책이 강제로 켰어도 프로젝트 범위로 깔았거나 프로젝트의 스킬 폴더에 둔 것은 그 프로젝트에서만 돈다
    if (!userScoped(plugin)) continue;
    const forced = managedView.enabledPlugins[plugin.id] === true;
    const userEnabled = !forced && userView.enabledPlugins[plugin.id] === true && pluginEnabledIn(global, plugin.id, plugin.defaultEnabled);
    if (!forced && !userEnabled) continue;
    // 구성을 모르는 플러그인도 훅을 읽지 못한 것으로 적힌다. 그 훅은 없는 것으로 본다(설계 20.1)
    if (plugin.hooksUnreadable) unreadablePlugins.push(plugin.id);
    for (const events of plugin.hookEvents) (forced ? managedPluginGuards : userPluginGuards).push(...preToolUseGuards(events, forced ? "managed-plugin" : "user-plugin", plugin.id));
  }
  // 설정 파일의 훅은 파일(출처)마다 본다. 한 파일의 hooks가 뼈대나 처리기 검사에 걸리면, 도구가 그 항목만 버리는지(관리 정책의 개별 항목, 사용자 설정의 Settings Warning)
  // 그 파일의 훅을 통째로 버리는지(관리 정책의 hooks 필드 무시, 사용자 설정의 Settings Error) 가릴 수 없다. 그 파일의 확인 훅은 세지 않고 훅을 읽지 못한 설정 파일로 낸다
  // (공식 문서 errors 「Managed settings contain invalid entries」·settings 「Fix a broken settings file」, 설계 11.3 ㉠의 「등록돼 있다」)
  const unreadableSettings: string[] = [];
  const settingsGuards = (layer: SettingsLayer, source: "managed" | "user"): ShellGuard[] =>
    layer.hookSources.flatMap(({ path, hooks }) => {
      if (hookMapValid(hooks)) return preToolUseGuards(hooks, source, null);
      unreadableSettings.push(path);
      return [];
    });
  const guards: ShellGuard[] = [...settingsGuards(managedLayer, "managed"), ...managedPluginGuards, ...settingsGuards(userLayer, "user"), ...userPluginGuards];

  skills.sort((a, b) => cmp(a.name, b.name) || SKILL_SCOPE_ORDER[a.scope] - SKILL_SCOPE_ORDER[b.scope] || cmp(normalizePath(a.path), normalizePath(b.path)) || cmp(a.pluginId, b.pluginId));
  mcpServers.sort((a, b) => cmp(a.name, b.name) || MCP_SCOPE_ORDER[a.scope] - MCP_SCOPE_ORDER[b.scope] || cmp(a.projectRoot, b.projectRoot) || cmp(a.pluginId, b.pluginId) || cmp(a.definitionHash, b.definitionHash));
  const uniqueProblems: SetupProblem[] = [];
  for (const problem of new Map(problems.map((p) => [`${p.kind}\u0000${p.owner}\u0000${p.path}`, p])).values()) {
    uniqueProblems.push({ ...problem, realPath: (await entryInfo(problem.path)).realPath });
  }
  uniqueProblems.sort((a, b) => cmp(a.path, b.path) || cmp(a.kind, b.kind) || OWNER_ORDER[a.owner] - OWNER_ORDER[b.owner]);
  return {
    tool: "claude-code",
    home,
    claudeJson: claudeJson.status,
    globalInstructions: globalRead.set,
    globalMentions: globalRead.mentions,
    settings: {
      user: layerStatus(userLayer),
      managedParts: managedLayer.parts.map((part) => ({ path: part.path, status: part.status })),
      defaultMode: { user: userView.defaultMode, managed: managedView.defaultMode },
    },
    hooks: {
      guards,
      userDisableAll: userView.disableAllHooks,
      managedDisableAll: managedView.disableAllHooks,
      managedAllowManagedOnly: managedView.allowManagedHooksOnly,
      unreadablePlugins: unreadablePlugins.sort(),
      unreadableSettings,
    },
    pluginsFile: pluginsScan.file,
    plugins,
    pluginsWithoutInstall,
    skills,
    mcpServers,
    projects,
    problems: uniqueProblems,
    unreadableDirs: [...new Set(unreadableDirs)].sort(),
  };
}
```

`src/scan/identity.ts`:

```ts
// 셋팅 사실에서 설치마다의 정체 열쇠를 만든다. 스킬은 (도구, 범위, 프로젝트, 이름, 링크를 푼 실제 경로), MCP 서버는 (도구, 범위, 프로젝트, 플러그인, 이름, 정의의 지문)이다. 정의의 지문이 없는 서버는 정체를 만들 수 없어 넣지 않는다(설계 11.3, 18.1)
import { normalizePath } from "../adapters/claude/locate.ts";
import { installKey } from "../state/observations.ts";
import type { ClaudeSetupFacts, McpFact, SkillFact } from "./types.ts";

export function skillInstallKey(skill: SkillFact): string {
  // 범위가 프로젝트이면 어느 프로젝트의 것인지도 정체다. 두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다(설계 11.3 「설치의 정체」)
  return installKey(["skill", "claude-code", skill.scope, skill.projectRoot ?? "", skill.name, skill.realPath ?? normalizePath(skill.path)]);
}

/** 정의를 읽지 못했거나 PC에 없는 서버(claude.ai에 연결한 서버 포함)는 null이다. */
export function mcpInstallKey(server: McpFact): string | null {
  if (server.definitionHash === null) return null;
  return installKey(["mcp", "claude-code", server.scope, server.projectRoot ?? "", server.pluginId ?? "", server.name, server.definitionHash]);
}

/** 이번 점검에서 본 모든 스킬과 MCP 서버의 설치 열쇠(켜졌는지와 상관없다). */
export function installKeysOf(facts: ClaudeSetupFacts): string[] {
  const keys = facts.skills.map(skillInstallKey);
  for (const server of facts.mcpServers) {
    const key = mcpInstallKey(server);
    if (key !== null) keys.push(key);
  }
  return [...new Set(keys)].sort();
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx vitest run test/scan && npx tsc --noEmit`
Expected: PASS. 시험 파일 12개, 시험 178개(과제 3~12. claude 31, identity 8). 타입 검사 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add src/scan/types.ts src/scan/claude.ts src/scan/identity.ts test/scan/claude.test.ts test/scan/identity.test.ts
git commit -m "feat: Claude Code 셋팅 스캐너와 설치의 정체 추가"
```

---

### Task 13: 개발용 셋팅 스크립트, 전체 검사, 병합

**Files:**
- Create: `scripts/dev-setup.ts`
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: `collectClaude`(1단계), `scanClaudeSetup`, `installKeysOf`(과제 12).
- Produces: 개발용 명령 `node scripts/run-ts.mjs scripts/dev-setup.ts`. 묶음에는 들어가지 않는다.

1단계의 `dev-summary.ts`처럼 이 PC의 실제 셋팅으로 스캐너를 한 번 돌려 본다. 이름, 경로, 값, 글은 내지 않고 종류별 개수와 걸린 시간만 낸다. 결과는 저장소에 넣지 않는다.

- [ ] **Step 1: 개발용 스크립트를 쓴다**

`scripts/dev-setup.ts`:

```ts
// 개발용. 이 PC의 Claude Code 셋팅을 스캐너로 읽어 종류별 개수와 걸린 시간만 낸다. 이름, 경로, 값, 글은 내지 않는다
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { makeWindows } from "../src/adapters/common/dates.ts";
import { collectClaude } from "../src/collect/claude.ts";
import { scanClaudeSetup } from "../src/scan/claude.ts";
import { installKeysOf } from "../src/scan/identity.ts";

const clock = { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
const collected = await collectClaude({ env: process.env, homedir: homedir(), clock, cacheDir: null, rescan: false });
// 프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더(첫 cwd)로 만든다(설계 10)
const collectDates = new Set(makeWindows(clock.nowMs, clock.timeZone).collectDates);
const mains = collected.summaries.filter((s) => s.kind === "main" && Object.entries(s.days).some(([date, day]) => collectDates.has(date) && day.responses > 0));
const cwds = mains.flatMap((s) => (s.cwd === null ? [] : [s.cwd]));
const claudeAiNames = new Set<string>();
for (const s of collected.summaries) {
  for (const day of Object.values(s.days)) {
    for (const name of [...day.loadedMcpServers, ...Object.keys(day.mcpAttributions)]) if (name.startsWith("claude.ai ")) claudeAiNames.add(name);
  }
}

const started = performance.now();
const facts = await scanClaudeSetup({ env: process.env, homedir: homedir(), tmpdir: tmpdir(), platform: process.platform, cwds, claudeAiNames: [...claudeAiNames], salt: randomBytes(32).toString("hex") });
const seconds = (performance.now() - started) / 1000;

const tally = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
console.log(
  JSON.stringify(
    {
      seconds: Number(seconds.toFixed(2)),
      mainSessions: mains.length,
      claudeJson: facts.claudeJson,
      settings: { user: facts.settings.user, managedParts: tally(facts.settings.managedParts, (p) => p.status), defaultMode: facts.settings.defaultMode },
      globalInstructions: { files: facts.globalInstructions.files.length, overBytes200: facts.globalInstructions.bytes >= 200, lines: facts.globalInstructions.lineHashes.length, unreadableDirs: facts.globalInstructions.unreadableDirs.length, projectsMentioned: Object.keys(facts.globalMentions).length },
      skills: {
        byScope: tally(facts.skills, (s) => s.scope),
        enabled: tally(facts.skills, (s) => `${s.scope}:${s.enabled}`),
        listed: tally(facts.skills, (s) => `${s.scope}:${s.listed}`),
        links: facts.skills.filter((s) => s.isLink).length,
        incomparable: facts.skills.filter((s) => s.contentHash === null).length,
        withoutCreatedTime: facts.skills.filter((s) => s.createdMs === null).length,
        hookProvided: tally(facts.skills, (s) => `${s.scope}:${s.hookProvided}`),
        withUsage: facts.skills.filter((s) => s.usageLastUsedMs !== null).length,
        managedFixed: facts.skills.filter((s) => s.managedFixed).length,
        unreadableSkillMd: facts.skills.filter((s) => !s.readable).length,
      },
      mcpServers: { byScope: tally(facts.mcpServers, (s) => s.scope), enabled: tally(facts.mcpServers, (s) => `${s.scope}:${s.enabled}`), withoutDefinition: facts.mcpServers.filter((s) => s.definitionHash === null).length },
      plugins: {
        count: facts.plugins.length,
        file: facts.pluginsFile,
        enabled: facts.plugins.filter((p) => p.enabled).length,
        missing: facts.plugins.filter((p) => !p.exists).length,
        compositionUnknown: facts.plugins.filter((p) => !p.compositionKnown).length,
        withoutInstall: facts.pluginsWithoutInstall.length,
        manifest: tally(facts.plugins, (p) => p.manifest),
        marketplaceEntry: tally(facts.plugins, (p) => p.marketplaceEntry),
        scopes: tally(facts.plugins.flatMap((p) => p.scopes), (scope) => scope),
        withUnknownEntries: facts.plugins.filter((p) => p.unknownEntries.length > 0).length,
        withHooks: facts.plugins.filter((p) => p.hasHooks).length,
        dependenciesUnknown: facts.plugins.filter((p) => p.dependencies === null).length,
        components: tally(facts.plugins.flatMap((p) => p.components), (c) => c),
      },
      projects: {
        count: facts.projects.length,
        kind: tally(facts.projects, (p) => p.kind),
        excluded: facts.projects.filter((p) => p.excluded).length,
        missing: facts.projects.filter((p) => !p.exists).length,
        withSettings: facts.projects.filter((p) => p.hasSettings).length,
        withLocalSettings: facts.projects.filter((p) => p.hasLocalSettings).length,
        fileStatus: tally(facts.projects.flatMap((p) => [`settings:${p.settingsStatus}`, `local:${p.localSettingsStatus}`, `mcpJson:${p.mcpJsonStatus}`]), (x) => x),
        instructionUnreadableDirs: facts.projects.reduce((n, p) => n + p.instructions.unreadableDirs.length, 0),
        withInstructions: facts.projects.filter((p) => p.instructions.files.length > 0).length,
        sameAsGlobalFiles: facts.projects.reduce((n, p) => n + p.instructions.files.filter((f) => f.sameAsGlobal).length, 0),
        bypass: facts.projects.filter((p) => p.bypassInProject || p.bypassInLocal).length,
        permissionConflicts: facts.projects.reduce((n, p) => n + p.permissionConflicts, 0),
      },
      hooks: { guards: tally(facts.hooks.guards, (g) => `${g.source}:${g.coversShell ? "shell" : "other"}:${g.canBlock ? "block" : "async"}`), userDisableAll: facts.hooks.userDisableAll, unreadablePlugins: facts.hooks.unreadablePlugins.length, unreadableSettings: facts.hooks.unreadableSettings.length },
      problems: tally(facts.problems, (p) => `${p.kind}:${p.owner}`),
      unreadableDirs: facts.unreadableDirs.length,
      installKeys: installKeysOf(facts).length,
    },
    null,
    2,
  ),
);
```

- [ ] **Step 2: 이 PC에서 돌려 본다**

Run: `node scripts/run-ts.mjs scripts/dev-setup.ts`
Expected: JSON 하나. `seconds`, `mainSessions`, 설정·지침·스킬·MCP 서버·플러그인·프로젝트·훅·문제의 종류별 개수, `installKeys`. 이름과 경로가 하나도 없다. 개수를 저장소 밖 작업 기록(`%LOCALAPPDATA%\짝작업\chunsik-garage\<날짜-작업>\실측.md`)에 적는다. 걸린 시간에는 목표가 없다(설계 22의 목표는 기록 읽기와 점검 전체에 있다). 다만 몇 초를 넘으면 원인을 적어 둔다.

- [ ] **Step 3: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 파일 32개·시험 374개 통과(1단계 167에 과제마다 더한 것. 1: 18, 2: 11, 3: 8, 4: 9, 5: 10, 6: 17, 7: 14, 8: 6, 9: 17, 10: 39, 11: 19, 12: 39), `묶음 검사 통과`. Windows 밖에서는 과제 4의 시험 1개를 건너뛴다.

- [ ] **Step 4: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS. 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 5: 원장을 고치고 커밋한다**

원장에 2단계 1부 구현 과제를 끝남으로 적고 커밋 해시와 확인한 것을 세부에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add scripts/dev-setup.ts .taskmaster/tasks/tasks.json
git commit -m "chore: 셋팅 개수를 재는 개발용 스크립트와 원장 갱신"
```

- [ ] **Step 6: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage2-1.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~13의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과), 「확인하지 못한 것」(macOS·Linux 실제 기기, 관리 정책의 서버·MDM 출처, 두 이름이 다른 플러그인과 스킬 폴더에 둔 플러그인을 실제 Claude Code로 깔아 본 적이 없음, 지우는 도중의 바꿔치기 틈(설계 19.2), 관리 정책이 스킬 폴더 플러그인을 막는 경우와 `AGENTS.md`를 고르는 설정을 보지 않음, 실측 숫자는 저장소 밖에 있음, 훅 형식 검사는 뼈대와 처리기의 종류·필수 값만 보고 실제 Claude Code에 틀린 훅 설정을 넣어 본 적이 없음, 같은 마켓 안의 다른 플러그인을 가리키는 링크를 밖으로 봄, `./`로 시작하지 않는 구성 요소 경로와 기본 자리의 링크를 도구가 어떻게 다루는지 모름, 관리 정책의 틀린 값을 도구가 파일마다 고치는지와 추정한 열쇠, 프로젝트 MCP 승인에서 목록의 프로젝트를 신뢰한 폴더로 봄(설계 27))이다. 이 PC의 숫자, 경로, 이름은 넣지 않는다.

```bash
git push -u origin 2단계-1-셋팅스캐너
gh pr create --base develop --head 2단계-1-셋팅스캐너 --title "feat: 2단계 1부 셋팅 스캐너와 상태 폴더" --body-file "$TEMP/aq-pr-stage2-1.md"
```

- [ ] **Step 7: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(2단계 1부 전용) 다음을 맡긴다. 코드 정독(설계 10·11.3·18.1·19와 이 계획 대조), `npm run check` 재실행, 이 PC의 셋팅을 **구조만**(열쇠 이름·개수) 따로 세어 `dev-setup`의 개수와 대조(스킬 범위별 수, 링크 수, `skillOverrides`로 끈 수, MCP 서버 범위별 수, 막힌 수, 플러그인 수와 구성 요소, 프로젝트의 깃·폴더·없어진 수, PreToolUse 처리기 수, 플러그인의 마켓 항목 상태별 수, 알아보지 못한 것이 있는 플러그인 수, 스킬 폴더에 둔 플러그인 수, 문제의 종류·주인별 수). 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과(돌린 검사와 남은 선택 지적)를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 2단계-1-셋팅스캐너 --body-file "$TEMP/aq-pr-stage2-1.md"`).

- [ ] **Step 8: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 사용자가 병합을 주 세션에 맡겼지만, 그것은 묻지 않고 병합할 권한이지 검증을 미룰 근거가 아니어서 Step 7 뒤에 둔다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 2단계-1-셋팅스캐너 --merge --subject "feat: 2단계 1부 셋팅 스캐너와 상태 폴더를 develop에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다).

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 7.2 | 스캐너는 홈 폴더와 프로젝트 목록을 받아 셋팅 사실을 낸다. 판정은 순수 함수로 나눈다 | 3~12 |
| 7.4, 19.2 | `aq where`(위치와 크기), `aq clean [--all]`(캐시와 오래된 결과, --all은 이력·상태·알림 표식·정비 작업 기록까지), 링크를 따라가 지우지 않음, 지우는 도중의 바꿔치기에 멈춤 | 1 |
| 8, 19.1 | 기록과 설정은 읽기만. 값과 글은 메모리에서 쓰고 버림. MCP 정의는 무작위 값을 섞은 해시만 | 3, 5, 6, 9~12(값이 사실에 남지 않는 시험은 12) |
| 10 | 전역·프로젝트 지침(규칙 파일과 AGENTS.md 포함), 설정 층과 관리 정책, 스킬을 찾는 곳, `skillOverrides`, MCP 서버와 막음·승인, 플러그인과 구성(두 이름, 마켓 항목, 스킬 폴더에 둔 플러그인, 도구에 든 플러그인, 선언한 파일이 없을 때, 뿌리 밖으로 풀리는 경로와 선언 경로의 꼴, 훅 파일의 감싸개와 뼈대), 관리 정책의 틀린 값, 일괄 승인의 층 우선순위, 권한과 훅(S2·F6), 사용 집계(플러그인은 두 이름), 스킬의 정체·내용 지문, 켜짐을 층을 합쳐 계산, 프로젝트의 정체와 프로젝트로 보지 않는 폴더 | 4~12 |
| 11.3 S1 | 전역 지침의 크기 | 5, 12 |
| 11.3 S2 | 기본 모드(사용자·관리 정책은 정했는지까지 가름, 프로젝트·로컬), ㉠의 네 출처, 처리기의 종류와 필수 값, 출처(설정 파일과 플러그인 훅 파일)마다의 훅, 매처·if·async, 훅을 제한하는 설정의 값 | 6, 7, 12 |
| 11.3 S3 | 풀리지 않는 설정 파일, 머리말이 없는 스킬, 가리키는 곳이 없는 링크. 주인과 실제 경로를 붙여 2부가 S3의 범위(사용자가 고치는 것, 같은 실제 파일은 한 번)로 거른다 | 3, 6, 9, 11, 12 |
| 11.3 E5 | 스킬의 만든 시각(링크와 대상), 사용 집계(신호 5), 훅이 내용을 넣어 주는 스킬, 켜짐, 실린 목록에 실릴 수 있는지, 기록과 맞출 이름(플러그인은 두 이름), `SKILL.md`의 읽기 상태 | 3, 9, 11, 12 |
| 11.3 E6 | 서버의 정체(범위·이름·정의의 지문), 정의를 읽지 못하는 서버(claude.ai), 켜짐, 기록과 맞출 이름 | 11, 12 |
| 11.3 F3·F4 | 프로젝트 지침이 있는지, 줄의 지문, 전역과 같은 파일 빼기 | 5, 12 |
| 11.3 F5 | 사본의 내용 지문, 링크와 플러그인 사본 구분 | 9, 12 |
| 11.3 F6 | 전역(사용자 설정)과 프로젝트(프로젝트·로컬)의 충돌 쌍 | 8, 12 |
| 16.2 A2 | 플러그인의 구성 요소(마켓 항목 포함), 알아보지 못한 것(문서와 보조 폴더는 소개 쪽), 기대는 플러그인, 사용 집계(두 이름), 스킬 폴더에 둔 플러그인, 설치 기록이 없는 켜진 플러그인 | 9, 10, 12 |
| 17 | 단서 1(전역 지침에 프로젝트가 나온 횟수)의 재료 | 5, 12 |
| 18.1 | 설치마다의 관측 기록(정체, 첫날, 새로 나타났는지), 무작위 값. 스킬의 정체에는 프로젝트가 든다 | 2, 12 |
| 20.1 | 못 읽은 것을 숨기지 않음(읽지 못한 스킬 폴더와 규칙 폴더, 풀리지 않는 파일, 프로젝트 파일의 읽기 상태, 세지 못한 상태 폴더 항목), 깊은 값 하나에 멈추지 않음, 정의를 읽지 못한 서버는 정체 없음, 명령이 던지면 이유를 담은 JSON | 1, 3, 5, 6, 9~12 |
| 21.1 | 스캐너 시험(링크와 사본, 설정 층 합치기, 환경 변수로 옮긴 홈의 `.claude.json`, 풀리지 않는 설정, 기본 모드와 훅의 겉모양), S2·F6 반례, 정의 지문의 반례, 플러그인 반례(두 이름, 마켓 항목, 스킬 폴더에 둔 플러그인, `@builtin`, MCP·훅 선언을 합치는 차례, 뿌리를 가리키는 링크, 처리기가 아닌 것, 감싸개 없는 훅 파일, 선언한 파일이 없을 때, 뿌리 밖의 경로, 틀린 처리기가 섞인 설정 파일, 밖을 가리키는 기본 훅 폴더, `..` 부분이 있는 MCP 경로, 관리 정책의 틀린 값과 드롭인, 오타 스킬 값, 위 층의 일괄 승인 거짓), S3의 범위, 같은 위치와 링크 위치, `.claude.json`을 다시 읽기, 지우는 도중의 바꿔치기 | 1~12 |

1부에 넣지 않은 것(2부에서 한다). 지표와 규칙 22개, 점수·등급·분류·심각도·예상 효과, 문구, 평가 결과와 요약, 정밀 점검 단서의 판정, 정비 후보(A1~A3)의 판정, 설치마다의 관측 기록을 실제로 고치고 저장하는 일(`aq checkup`), 원본이 없어진 캐시 정리, `aq checkup --no-open`. 5단계에서 한다. Codex 스캐너.

### 빈칸과 이름

- "TBD", "나중에", "비슷하게" 같은 빈칸 표현을 찾았고 없다.
- 과제마다 시험 파일과 구현 파일은 연습 작업 폴더에서 시험을 통과한 파일을 그대로 옮겼다(이 문서를 만드는 도구가 파일을 읽어 넣었다).

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본에서 과제 1부터 13까지 차례대로 만들었다(Windows 11, Node.js 24). 과제마다 시험 파일만 놓고 돌리면 실패하고(가져올 파일이 아직 없다), 구현 파일을 놓으면 그 과제의 시험과 타입 검사가 통과했다. 과제 1의 묶음 다시 만들기 뒤 `npm run check`는 시험 파일 19개·시험 185개, 과제 13의 `npm run check`는 시험 파일 32개·시험 374개가 통과했고 `묶음 검사 통과`였다. 뽑은 파일 40개는 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다. 개발용 스크립트는 이 PC의 셋팅에서 끝까지 돌았다(개수와 걸린 시간은 저장소 밖 기록에만 둔다).

연습 작업 폴더에서는 틀린 구현을 하나씩 넣어(변이 119개) 시험이 실패하는지 확인했다. 정체 열쇠의 부분, 정의 지문의 입력, 목록 중복, 깊이 경계, `aq where`의 항목 오류, 플러그인의 소개 쪽 항목·이름 검증·마켓 위치·마켓 뿌리의 `skills`·뿌리를 가리키는 `skills`·`@builtin`·항목의 모르는 열쇠, 두 이름의 꼴과 집계, 경로로 적은 항목 훅, ㉠의 범위, 같은 위치의 플러그인 스킬, 문제의 실제 경로, 스킬 폴더에 둔 플러그인, 2차 리뷰가 짚은 곳(목록 합치기와 원형, 탈출 글자, MCP·훅 선언의 차례와 섞은 목록, 주소, 뿌리 링크, 마켓 목록 파일, 링크 위치의 사실, ㉠의 범위, 읽지 못한 `SKILL.md`, 뿌리 열쇠, 관리 정책의 `skillOverrides`, 층마다의 막음, `.claude.json` 다시 읽기), 3차 리뷰가 짚은 곳(처리기의 종류와 필수 값, 선언한 파일이 없을 때, 같은 경로의 훅 파일, 훅 파일의 감싸개와 뼈대, 인라인 훅), 4차 리뷰가 짚은 곳(플러그인 뿌리 밖으로 풀리는 구성 요소 경로와 이름 앞부분이 같은 옆 폴더, 설정 파일마다의 훅), 5차 리뷰가 짚은 곳(기본 훅 파일의 뿌리 안 검사, 선언 경로의 꼴과 이름에 ..이 든 폴더, 관리 정책의 훅 명령을 파일마다 모음, 관리 정책의 틀린 값), 6차 리뷰가 짚은 곳(skillOverrides의 허용 값, 일괄 승인의 층 우선순위, 읽지 못한 제한 곁의 허용 보류)이다. 모두 실패했다. 4차의 「표기를 보지 않음」 변이는 5차에 표기 검사를 꼴 검사가 대신하면서 그 코드가 없어져 뺐다. 2차의 「주소로 적은 MCP」 변이 하나는 선언한 파일이 없으면 읽지 못한 것이라는 3차 규칙 뒤로 결과가 같아져 뺐다(주소를 파일 경로로 풀면 없는 파일이 된다). Node.js 22와 macOS·Linux에서는 돌려 보지 않았다(과제 13의 Step 4와 21.2절의 사람 점검).
