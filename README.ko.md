# 춘식이 정비소

Claude Code와 Codex의 AQ 점검입니다. 내 PC에서 도는 프로그램이 Claude Code와 Codex의 기록을 읽어, AI 코딩 도구를 얼마나 잘 갖추고 쓰는지 점수를 매기고 한 장짜리 결과 화면을 만듭니다.

![합성 기록으로 만든 AQ 결과 화면](docs/images/report-ko.png)

## 설치

Node.js 22 이상이 있어야 합니다. 명령의 `#main`과 `@main`이 배포한 버전을 받게 합니다. 빼면 개발 중인 브랜치를 받습니다.

| 도구 | 설치 | 부르는 법 |
|---|---|---|
| Claude Code | `claude plugin marketplace add yeunlee1/chunsik-garage#main` 뒤 `claude plugin install chunsik-garage@chunsik-garage` | "AQ 점검해 줘"라고 말하거나 `/chunsik-garage:aq` |
| Codex | `codex plugin marketplace add yeunlee1/chunsik-garage@main` 뒤 `codex plugin add chunsik-garage@chunsik-garage` | "AQ 점검해 줘"라고 말하거나 `/skills`에서 점검 스킬을 고릅니다 |

업데이트는 Claude Code에서 `claude plugin marketplace update chunsik-garage` 뒤 `claude plugin update chunsik-garage@chunsik-garage`를 하고 새 세션을 엽니다. Codex는 `codex plugin marketplace upgrade chunsik-garage`를 하고 다시 켭니다.

## 하는 일

- **점검.** 기록과 셋팅으로 네 기준의 점수를 매기고, 결과 화면을 브라우저로 열고, 터미널에 짧게 알립니다. 항목마다 어떻게 쟀는지 볼 수 있고, 다음 등급까지 무엇을 고치면 되는지도 알려 줍니다.
- **정비.** 한동안 쓰지 않은 스킬, 플러그인, MCP 서버를 끕니다. 승인한 것만 바꾸고, 기록을 먼저 남기고, 하나씩 되돌릴 수 있습니다.
- **정밀 점검.** 고른 지침 파일을 읽고 겹치거나 부딪히거나 옮기면 좋을 줄을 알려 줍니다. 점수는 바뀌지 않습니다.
- **세션 시작 알림(Claude Code).** 마지막 점검 뒤 7일이 지났거나 새로 깐 것이 있으면 세션을 시작할 때 한 줄로 알립니다. 켜 달라고 말하면 켜집니다.
- **AQ 배지.** README나 깃허브 프로필에 붙일 작은 그림입니다. 최근 점검의 AQ와 등급만 넣어 내 PC에서 만듭니다. "AQ 배지 만들어 줘"라고 말하면 됩니다.

## 개인정보

프로그램과 결과 화면은 바깥으로 아무것도 보내지 않습니다. AI에게는 점수와 집계, 정비할 것의 이름이 전해집니다. 대화 내용과 지침의 글은 전해지지 않습니다. 정밀 점검을 시키면 고른 지침 파일을 AI가 읽습니다.

결과 화면 파일에는 스킬과 프로젝트 폴더의 이름이 들어 있습니다. 자랑할 때는 파일 대신 점수 카드를 쓰세요.

## 지원 범위

- Node.js 22 이상. 22와 24에서 시험합니다.
- Windows 11에서 만들고 시험했습니다. macOS와 Linux는 임시 홈 폴더 시험으로만 확인했습니다.
- Claude Code는 2.1.220부터 2.1.325까지의 기록 형식을, Codex는 0.166.0의 기록 형식(그리고 0.140부터 0.142까지의 옛 형식)을 확인했습니다.

## 남기는 것과 지우는 법

모두 `~/.chunsik-garage/`에 있습니다. 캐시, 결과 화면, 점수 이력, 상태, 알림 표식, 정비 작업 기록, 배지입니다. 플러그인을 지워도 이 폴더는 남습니다.

저장하지 않고 돌린 점검만 다릅니다. 그 결과 화면과 평가 결과 파일(`chunsik-garage-report-<시각>.html`, `chunsik-garage-result-<시각>.json`)은 OS의 임시 폴더에 생기고, 이 도구는 그 파일을 지우지 않습니다. 평가 결과 파일에는 스킬, MCP 서버, 프로젝트의 이름이 들어 있으니 다 보셨으면 직접 지우세요.

- "AQ 점검 파일이 어디 있어?"라고 물으면 폴더와 크기를 알려 줍니다.
- 정리해 달라고 하면 캐시와 오래된 결과를 지우고 가장 최근 결과는 남깁니다.
- 모두 지워 달라고 하면 이력, 상태, 정비 작업 기록까지 지웁니다. 그 뒤에는 이 도구로 정비를 되돌릴 수 없습니다.
- 지우기 직전에 경로를 다시 보지만, 바로 그때 다른 프로그램이 `~/.chunsik-garage/` 안의 폴더를 바깥을 가리키는 링크로 바꿔치면 막지 못해 바깥 파일이 지워질 수 있습니다. 지우는 동안에는 그 폴더를 건드리지 마세요.

## Codex 샌드박스에서 쓰기

Codex의 기본 샌드박스(작업 공간 쓰기, 필요할 때 승인 요청)에서는 `~/.chunsik-garage/`에 쓰려면 승인이 필요합니다. 늘 허용하려면 `~/.codex/config.toml`의 `writable_roots`에 그 폴더를 더하세요.

```toml
[sandbox_workspace_write]
writable_roots = ["/내/홈/폴더의/절대경로/.chunsik-garage"]
```

승인하지 않아도 저장하지 않는 점검은 돕니다(캐시와 이력이 없습니다). 정비는 바꿀 설정 파일에 쓸 권한이 늘 필요합니다.

## 정비가 막지 못하는 것

- 잠금은 이 도구끼리만 듣습니다. 정비하는 동안에는 다른 Claude Code나 Codex 세션에서 플러그인을 깔거나 설정을 바꾸지 마세요. 마지막으로 확인한 뒤 파일을 갈아 끼우기 전의 아주 짧은 틈에 다른 프로그램이 쓴 변경은 덮일 수 있습니다. 이 도구가 바꾼 것은 작업 기록으로 되돌릴 수 있습니다.
- 이미 떠 있는 Claude Code 세션에는 바로 적용되지 않을 수 있습니다. 새 세션에서 확인하세요. Codex는 다시 시작해야 합니다.

## 라이선스

코드는 MIT입니다(`LICENSE`). `skills/aq/assets/`의 캐릭터 그림은 MIT가 아닙니다. `skills/aq/assets/ART-LICENSE.md`를 보세요. 이 도구가 만든 카드, 결과 화면, 소개 캡처에 든 그림은 그대로 공유해도 됩니다. 그림만 떼어 다른 데 쓰는 것은 허락하지 않습니다.

[English](README.md)
