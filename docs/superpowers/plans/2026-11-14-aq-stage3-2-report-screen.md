# AQ 점검 3단계 2부 — 결과 화면, 공유 카드, 그림 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 저장소에서는 사용자 지침에 따라 하위 에이전트가 파일을 고치지 않는다. 주 세션(Claude)이 superpowers:executing-plans로 과제를 차례대로 구현하고, 병합 전에 짝 Codex가 코드 정독, 시험 재실행, 실제 결과 화면의 확인으로 검증한다.

**Goal:** `aq checkup`이 결과 화면 HTML 한 파일(두 언어, 그림, 단추, 달력, 공유 카드)을 만들어 상태 폴더나 OS 임시 폴더에 쓰고 기본 브라우저로 연다.

**Architecture:** 결과 화면은 새 폴더 `src/report/`에 둔다. 평가 결과에서 그리는 칸만 고르는 자료(`view.ts`), 고정 글(`copy.ts`), 숫자 서식(`format.ts`), 그림 고르기와 읽기(`assets.ts`), 스타일(`style.ts`), 화면 안의 스크립트(`script.ts`), HTML을 만드는 함수(`html.ts`)다. 프로그램이 두 언어의 글을 모두 그리고 화면 안의 스크립트는 보이는 언어와 정해 둔 속성만 바꾼다. 파일 쓰기는 상태 폴더 모듈(`src/state/reports.ts`, `history.ts`), 여는 것은 `src/commands/open.ts`, 연결은 `src/commands/checkup.ts`와 `src/cli.ts`다. `src/core/`는 바꾸지 않는다(요약의 덧붙이는 말 함수 하나를 내보내기만 한다).

**Tech Stack:** TypeScript, Node.js 22 이상(시험은 22와 24), esbuild(묶기), Vitest(시험). 그림을 줄이는 개발용 도구는 Python과 Pillow다(저장소의 그림을 다시 만들 때만 쓴다). 새 의존성은 없다.

**Spec:** `docs/superpowers/specs/2026-11-12-aq-checkup-design.md`(이하 설계). 이 계획은 설계 13(결과 화면), 14(공유 카드), 13.3(그림), 12.3(실행 기록과 요약), 19.1(결과 화면에 넣는 것), 20.2(쓸 수 없는 곳)와 끝의 「3단계 계획 전 결정」, 「3단계 2부 계획에서 보완」을 구현한다. 로드맵은 `docs/superpowers/plans/2026-11-12-aq-roadmap.md`, 앞 계획은 `2026-11-14-aq-stage3-1-result-details.md`(1부, develop `5b9bdd6`에 병합)다.

## 2부의 범위

| 넣는 것 | 넣지 않는 것(그 단계) |
|---|---|
| 결과 화면 HTML 한 파일(머리, 점수 띠, 진단 띠, 두 단, 보통과 잴 수 없음 목록, 사용 기록, 알림, 꼬리), 두 언어 바꾸기, [정리하기] 복사와 막힐 때의 글상자, 표로 보기, 달력의 말풍선, 공유 카드 1, 그림 11장과 화면마다 고르기, 결과 화면 파일 쓰기와 회차, 기본 브라우저로 열기와 `--no-open`, 실행 알림 셋 | 점검 이력 그래프와 [정밀 점검] 단추(7단계), 터미널의 말투와 스킬 문서(4단계), Codex(5단계), 정비(6단계) |

## Global Constraints

- Node.js 22 이상이다. 시험도 22와 24에서 한다(설계 6.3).
- **`src/core/`는 순수하다**(설계 7.2). 2부는 core에 새 일을 넣지 않는다. 결과 화면의 코드는 `src/report/`에 두고 core의 문구와 서식 함수를 가져다 쓴다.
- **결과 화면은 바깥으로 아무것도 보내지 않는다**(설계 13.2). CSP로 막고, 스크립트는 해시가 맞는 것 하나만 돌며, 화면 안의 스크립트에 네트워크를 부르는 이름(`fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource`, 동적 가져오기)이 없다. 묶음 검사(`scripts/check-bundle.mjs`)가 묶은 파일 전체를 본다(「3단계 2부 계획에서 보완」의 3번).
- **결과 화면에 절대 경로를 넣지 않는다.** 그리는 칸만 골라 담고 프로젝트는 폴더 이름이다(설계 19.1, 「3단계 계획 전 결정」의 10번). 공유 카드에는 스킬, 서버, 프로젝트의 이름도 넣지 않는다(설계 14).
- **이름은 글로 넣는다.** 스킬, 서버, 프로젝트의 이름은 HTML로 풀리지 않게 바꿔 넣고, 화면 안의 스크립트는 글과 속성으로만 넣는다.
- **화면 품질.** 폭 1100px 위는 석 단, 760px 아래는 한 줄로 쌓이고 1440, 1024, 840, 390에서 넘침이 없다. 단추는 44px 이상이고 초점이 보인다. 언어를 바꿔도 펼친 항목과 초점이 그대로다. 상태는 색과 함께 아이콘과 낱말로 알린다. 움직임을 줄이는 설정을 따른다(설계 13.4).
- 시험은 기여자의 PC에서도 돈다. 실제 홈 폴더와 OS의 관리 정책 폴더를 읽지도 쓰지도 않고, 브라우저를 열지 않는다(시험은 여는 함수를 바꿔 넣는다, 설계 21.1).
- 새 소스 파일(시험 파일 포함)의 첫 줄에 역할을 한국어 한 줄로 적는다(사용자 전역 지침). 마크다운과 그림 파일은 뺀다.
- 커밋 제목은 `<타입>: <한국어 설명>`이고 타입을 뺀 설명이 50자 안쪽이며, 설명에서 영문자가 한글보다 많지 않다(사용자 전역 지침).
- 깃. `develop`에서 `3단계-2-결과화면` 브랜치를 따서 작업한다. 끝나면 병합 요청으로 `develop`에 합친다. 올리기 전에 `npm run check`가 통과해야 한다. 깃허브 액션을 쓰지 않는다. 짝 검증에서 필수 지적이 0건이 되면 주 세션이 묻지 않고 병합한다(로드맵, 사용자 지시 2026-11-13). 짝 검증은 병합 앞의 관문이다.
- 이 PC의 기록과 셋팅에서 잰 숫자, 경로, 이름은 저장소와 병합 요청에 넣지 않는다(설계 머리말). 결과 화면을 확인한 화면 사진도 저장소 밖에 둔다.
- 그림에 카카오 춘식이(고양이)나 닮은 그림, 고양이와 카카오·니니즈 동물을 쓰지 않는다(사용자 지시). 그림은 사용자가 확인한 2차 그림과 점수별 장면이다.

## 이 계획이 기대는 설계 보완

이 계획이 기준으로 삼는 설계는 이 계획과 같은 커밋에 든 것(SHA256 `3065D75FD88B0AE6A3E163BD8FD489320D0DBEB87CCC317CB58F542EBAEE6764`, 3,923줄)이다. 설계 끝에 「3단계 2부 계획에서 보완」(열한 가지)을 더하고 12.3에 결과 화면 파일의 줄을 더했다. 정한 것은 그 번호로 과제마다 적었다. 계획은 저장소 밖의 연습 작업 폴더에서 과제마다 시험과 구현을 실제로 쓰고 돌려서 만들었고, 만든 결과 화면을 브라우저에서 확인했다.

## 파일 구조

| 파일 | 과제 | 하는 일 |
|---|---|---|
| `scripts/make-assets.py`(새) | 1 | 저장소 밖 원본 그림(PNG)을 WebP로 줄이는 개발용 도구 |
| `skills/aq/assets/`(새, 그림 11장과 `ART-LICENSE.md`) | 1 | 결과 화면과 카드의 그림, 그림 이용 조건 |
| `src/report/assets.ts`(새, 6에서 고침) | 1, 6 | 그림의 이름, 화면마다 고르기, 그림 폴더 찾기, data URI로 읽기 |
| `src/report/view.ts`(새) | 2 | 평가 결과와 실행 기록에서 결과 화면이 그리는 칸만 고르기 |
| `src/report/copy.ts`(새, 6에서 고침) | 3, 6 | 결과 화면의 고정 글(두 언어), 상태 낱말, 장면의 대체 글 |
| `src/report/format.ts`(새) | 4 | 토큰 줄임(만·억, K·M·B)과 백분율 |
| `src/report/style.ts`(새, 6에서 고침) | 5, 6 | 결과 화면의 스타일 |
| `src/report/script.ts`(새) | 5 | 화면 안의 스크립트(언어, 복사, 표, 말풍선, 카드)와 그 자료의 꼴 |
| `src/report/html.ts`(새) | 6 | 결과 화면 HTML 한 파일 |
| `test/helpers/fake-dom.ts`(새) | 6 | 시험 전용 문서 대역. 만든 HTML을 읽어 화면 안의 스크립트를 Node에서 돌린다 |
| `src/core/result/summary.ts`(고침) | 6 | 먼저 고칠 것의 덧붙이는 말 함수를 내보냄 |
| `src/state/reports.ts`, `src/state/history.ts`(고침) | 7 | 결과 화면 파일 쓰기, 이력의 줄 수 |
| `src/commands/open.ts`(새) | 7 | 기본 브라우저로 열기 |
| `src/commands/checkup.ts`, `src/commands/run-notices.ts`, `src/cli.ts`(고침), `skills/aq/scripts/aq.mjs`(다시 묶음) | 7 | 점검이 결과 화면을 쓰고 열기, 실행 알림 셋, `--no-open` |

## 과제를 읽는 법

과제의 코드는 연습 작업 폴더의 커밋에서 기계로 뽑았다. 과제마다 시험을 먼저 쓰고(Step 1), 실패를 확인하고(Step 2), 구현하고(Step 3), 통과를 확인하고(Step 4), 커밋한다.

- `` `경로`(새 파일): `` 뒤의 코드 블록은 그 파일의 전체다.
- `` `경로`(찾을 곳): ``과 `` `경로`(바꾼 뒤): ``는 쌍이다. 그 파일에서 찾을 곳의 줄들을 찾아 바꾼 뒤의 줄들로 바꾼다. 찾을 곳은 그때의 파일에 한 번만 나온다. 한 파일에 쌍이 여럿이면 `1/3`처럼 차례를 적었고 적힌 차례대로 바꾼다.
- `` `경로`(그림 파일): `` 줄은 글로 싣지 않은 그림이다. 저장소 밖의 원본(사용자가 확인한 그림)을 `scripts/make-assets.py`로 줄인 WebP이고, 적힌 크기와 SHA-256이 같아야 한다. 원본은 공개하지 않으므로 이 계획을 적용할 때는 연습 작업 폴더의 같은 파일을 쓰고 지문을 견준다.
- 묶은 실행 파일(`skills/aq/scripts/aq.mjs`)은 글로 싣지 않는다. 과제 7의 `npm run build`가 원본에서 다시 만든다.
- 과제의 확인 명령은 그 과제와 관계있는 시험과 타입 검사다. 전체 검사(`npm run check`)는 마지막 과제에서 돌린다. 과제 6까지는 묶은 실행 파일이 원본과 같아 묶음 검사도 통과하지만, 과제 7에서 점검이 결과 화면을 부르면 다시 묶어야 한다.
- 화면 안의 스크립트 동작은 과제 6의 문서 대역 시험이 실제로 만든 HTML 위에서 본다. 모양, 넘침, 초점 테두리는 시험만으로 보증하지 않으므로 마지막 과제에서 실제 결과 화면을 브라우저로 확인한다.

---

### Task 1: 그림 11장과 화면마다 그림 고르기

**Files:**
- Create: `scripts/make-assets.py`
- Create: `skills/aq/assets/ART-LICENSE.md`
- Create: `skills/aq/assets/face.webp`
- Create: `skills/aq/assets/scene-1.webp`
- Create: `skills/aq/assets/scene-2.webp`
- Create: `skills/aq/assets/scene-3.webp`
- Create: `skills/aq/assets/scene-4.webp`
- Create: `skills/aq/assets/scene-5.webp`
- Create: `skills/aq/assets/scene-few-records.webp`
- Create: `skills/aq/assets/scene-unreadable.webp`
- Create: `skills/aq/assets/sticker-done.webp`
- Create: `skills/aq/assets/sticker-fix.webp`
- Create: `skills/aq/assets/sticker-good.webp`
- Create: `src/report/assets.ts`
- Test: `test/report/assets.test.ts`

**Interfaces:**
- Consumes: 없다. 2부의 첫 과제다. 설계 13.3, 7.1, 「3단계 계획 전 결정」의 12번, 「3단계 2부 계획에서 보완」의 7번을 따른다.
- Produces: `ART_FILES`, `ArtName`, `ReportArt`(`{scene, face, good, fix}`, 읽지 못한 그림은 `null`), `sceneFor(tier, unreadable)`, `stickerFor(repairs)`, `assetsDirOf(entryFile)`, `loadArt(dir, {tier, unreadable, repairs})`(`src/report/assets.ts`). 과제 6과 7이 쓴다. 과제 6이 `SceneName`을 더한다.

- 그림은 사용자가 확인한 2차 그림 6장(얼굴, 춘삼이 스티커, 춘식이 스티커 둘, 점수를 못 낸 화면의 장면 둘)과 점수별 장면 5장이다. 원본 PNG는 저장소 밖에 있고 `scripts/make-assets.py`가 Pillow로 줄인다(장면 512px, 그 밖 128px, 품질 82). 저장소에는 WebP만 넣는다. 그림 몫(설계 13.3의 50KB)은 WebP 파일의 바이트로 세고, 시험이 가장 큰 조합(가장 큰 장면, 얼굴, 춘삼이 스티커, 춘식이 스티커 둘 가운데 큰 것)이 50,000바이트를 넘지 않는 것을 본다. HTML에는 base64로 들어가 약 3분의 1이 늘어난다(「3단계 2부 계획에서 보완」의 7번).
- `ART-LICENSE.md`는 설계 7.1의 그림 이용 조건을 영어와 한국어로 적는다. 결과 화면과 카드에 든 그림은 그대로 공유해도 되고, 그림만 떼어 다른 데 쓰는 것은 허락하지 않는다.
- 장면은 AQ를 냈으면 등급 단계의 장면, 내지 않았으면 기록을 읽지 못했다는 알림(`record_unreadable`)이 있을 때 "읽지 못함", 없으면 "모자람"이다. 스티커는 정비할 것이 있으면 고칠 것, 없으면 다 고침이다.
- 그림 폴더는 묶은 실행 파일(`<스킬>/scripts/aq.mjs`) 옆의 `<스킬>/assets`다. 원본으로 돌릴 때(시험과 개발)는 `null`이고 그림 없이 그린다. 읽지 못한 그림 하나는 `null`이 되고 다른 그림은 그대로 읽는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/report/assets.test.ts`(새 파일):

```ts
// 결과 화면에 넣을 그림을 시험한다. 그림 폴더의 파일, 장면 고르기, 그림 폴더 찾기, data URI로 읽기와 읽지 못할 때(설계 13.3, 「3단계 계획 전 결정」의 12번)
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ART_FILES, assetsDirOf, loadArt, sceneFor, stickerFor } from "../../src/report/assets.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const ASSETS = join(ROOT, "skills", "aq", "assets");
/** WebP 파일의 머리(RIFF ... WEBP)와 그림 크기(VP8 손실 압축의 가로·세로) */
const webpSize = (path: string): { width: number; height: number } => {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
  expect(bytes.subarray(12, 16).toString("latin1")).toBe("VP8 ");
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
};

describe("그림 폴더", () => {
  it("장면 일곱 장은 512px, 얼굴과 스티커 넉 장은 128px의 WebP다", () => {
    expect(Object.keys(ART_FILES).sort()).toEqual(["face", "scene-1", "scene-2", "scene-3", "scene-4", "scene-5", "scene-few-records", "scene-unreadable", "sticker-done", "sticker-fix", "sticker-good"]);
    for (const [name, file] of Object.entries(ART_FILES)) {
      const size = name.startsWith("scene") ? 512 : 128;
      expect(webpSize(join(ASSETS, file)), name).toEqual({ width: size, height: size });
    }
  });
  it("한 화면에 넣는 그림(장면 하나, 얼굴, 스티커 둘)의 WebP는 가장 큰 조합도 50,000바이트를 넘지 않는다", () => {
    const sizeOf = (name: keyof typeof ART_FILES): number => statSync(join(ASSETS, ART_FILES[name])).size;
    const scenes = (Object.keys(ART_FILES) as (keyof typeof ART_FILES)[]).filter((name) => name.startsWith("scene"));
    const largest = Math.max(...scenes.map(sizeOf)) + sizeOf("face") + sizeOf("sticker-good") + Math.max(sizeOf("sticker-fix"), sizeOf("sticker-done"));
    expect(largest).toBeLessThanOrEqual(50_000);
  });
  it("그림 이용 조건 파일에 설계의 문장이 그대로 있다(설계 7.1)", () => {
    const terms = readFileSync(join(ASSETS, "ART-LICENSE.md"), "utf8");
    expect(terms).toContain("이 도구가 만든 카드, 결과 화면, 소개 캡처에 든 그림은 그대로 공유해도 된다. 그림만 떼어 다른 데 쓰는 것은 허락하지 않는다.");
    for (const file of Object.values(ART_FILES)) expect(terms).toContain(file.replace(/-\d\.webp$/, ""));
  });
});

describe("장면과 스티커 고르기", () => {
  it("AQ를 냈으면 등급 단계의 장면이다", () => {
    for (const tier of [1, 2, 3, 4, 5]) expect(sceneFor(tier, false)).toBe(`scene-${tier}`);
    expect(sceneFor(4, true)).toBe("scene-4");
  });
  it("AQ를 내지 않았으면 기록을 읽지 못했다는 알림이 있을 때 읽지 못함, 없으면 모자람이다", () => {
    expect(sceneFor(null, true)).toBe("scene-unreadable");
    expect(sceneFor(null, false)).toBe("scene-few-records");
  });
  it("정비할 것이 있으면 고칠 것 스티커, 없으면 다 고침 스티커다", () => {
    expect(stickerFor(1)).toBe("sticker-fix");
    expect(stickerFor(0)).toBe("sticker-done");
  });
});

describe("그림 폴더 찾기와 읽기", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTemp();
  });
  afterEach(async () => removeTemp(root));

  it("묶은 실행 파일(<스킬 폴더>/scripts/aq.mjs)이면 그 스킬 폴더의 assets다. 원본으로 돌리면 없다", () => {
    expect(assetsDirOf(join(root, "aq", "scripts", "aq.mjs"))).toBe(join(root, "aq", "assets"));
    expect(assetsDirOf(join(root, "src", "entry.ts"))).toBeNull();
    expect(assetsDirOf("")).toBeNull();
  });
  it("고른 그림만 data URI로 읽는다", async () => {
    await put(join(root, "scene-4.webp"), "S4");
    await put(join(root, "face.webp"), "F");
    await put(join(root, "sticker-good.webp"), "G");
    await put(join(root, "sticker-done.webp"), "D");
    await put(join(root, "scene-1.webp"), "S1");
    const art = await loadArt(root, { tier: 4, unreadable: false, repairs: 0 });
    expect(art).toEqual({
      scene: `data:image/webp;base64,${Buffer.from("S4").toString("base64")}`,
      face: `data:image/webp;base64,${Buffer.from("F").toString("base64")}`,
      good: `data:image/webp;base64,${Buffer.from("G").toString("base64")}`,
      fix: `data:image/webp;base64,${Buffer.from("D").toString("base64")}`,
    });
  });
  it("그림 폴더가 없거나 파일을 읽지 못하면 그 그림만 null이다. 점검은 멈추지 않는다", async () => {
    await put(join(root, "face.webp"), "F");
    expect(await loadArt(root, { tier: null, unreadable: true, repairs: 2 })).toEqual({ scene: null, face: `data:image/webp;base64,${Buffer.from("F").toString("base64")}`, good: null, fix: null });
    expect(await loadArt(null, { tier: 3, unreadable: false, repairs: 0 })).toEqual({ scene: null, face: null, good: null, fix: null });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/report/assets.test.ts`
Expected: FAIL. `test/report/assets.test.ts`가 `../../src/report/assets.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`scripts/make-assets.py`(새 파일):

```python
# 캐릭터 원본 그림(PNG)을 결과 화면에 넣을 WebP로 줄여 skills/aq/assets에 쓴다. 원본은 저장소에 넣지 않으므로 원본 폴더 두 곳을 인자로 받는다. Pillow(WebP 지원)가 필요하다(설계 13.3)
# 쓰는 법: python scripts/make-assets.py <1차 점수별 장면 폴더> <2차 그림 폴더>
import sys
from pathlib import Path

from PIL import Image

if len(sys.argv) != 3:
    sys.exit("쓰는 법: python scripts/make-assets.py <1차 점수별 장면 폴더> <2차 그림 폴더>")
first, second = Path(sys.argv[1]), Path(sys.argv[2])
out = Path(__file__).resolve().parent.parent / "skills" / "aq" / "assets"

# 장면은 264px 타일에 꽉 채우므로 512px, 얼굴과 스티커는 32~56px 원형이라 128px로 줄인다(설계 13.3)
PLAN = [
    ("scene-1.webp", first / "1-번개베기.png", 512),
    ("scene-2.webp", first / "2-누가이랬어.png", 512),
    ("scene-3.webp", first / "3-팔걷고수리.png", 512),
    ("scene-4.webp", first / "4-합격도장.png", 512),
    ("scene-5.webp", first / "5-명세서졸업식.png", 512),
    ("scene-few-records.webp", second / "5-장면-기록모자람.png", 512),
    ("scene-unreadable.webp", second / "6-장면-기록못읽음.png", 512),
    ("face.webp", second / "1-춘식이-얼굴.png", 128),
    ("sticker-good.webp", second / "2-춘삼이-스티커.png", 128),
    ("sticker-fix.webp", second / "3-춘식이-스티커-고칠것.png", 128),
    ("sticker-done.webp", second / "4-춘식이-스티커-다고침.png", 128),
]

for name, source, size in PLAN:
    image = Image.open(source).convert("RGB")
    if image.size[0] != image.size[1]:
        sys.exit(f"정사각형이 아니다: {source}")
    image.resize((size, size), Image.LANCZOS).save(out / name, "WEBP", quality=82, method=6)
    print(name, size, (out / name).stat().st_size)
```

`skills/aq/assets/ART-LICENSE.md`(새 파일):

```markdown
# Character art terms / 캐릭터 그림 이용 조건

The code in this repository is MIT licensed (see `LICENSE`). The character art in this folder is **not** covered by the MIT license.

You may share the art as it appears in the cards, result pages, and screenshots that this tool makes. You may not take the art out of them and use it elsewhere.

이 저장소의 코드는 MIT다(`LICENSE`). 이 폴더의 캐릭터 그림은 MIT가 아니다.

이 도구가 만든 카드, 결과 화면, 소개 캡처에 든 그림은 그대로 공유해도 된다. 그림만 떼어 다른 데 쓰는 것은 허락하지 않는다.

| File | Size | Used for |
|---|---|---|
| `scene-1.webp` … `scene-5.webp` | 512×512 | The scene next to the AQ score, one per grade tier (1 lowest to 5 highest), and the share card |
| `scene-few-records.webp` | 512×512 | The scene when no AQ was given (not enough records yet) |
| `scene-unreadable.webp` | 512×512 | The scene when no AQ was given and some records could not be read |
| `face.webp` | 128×128 | Chunsik's face next to the brand name and on the share card |
| `sticker-good.webp` | 128×128 | Chunsam's sticker next to "Doing well" |
| `sticker-fix.webp` | 128×128 | Chunsik's sticker next to "To fix" when there is something to fix |
| `sticker-done.webp` | 128×128 | Chunsik's sticker next to "To fix" when there is nothing to fix |

`scripts/make-assets.py` makes these files from the original drawings, which are not in this repository.
```

`skills/aq/assets/face.webp`(그림 파일): 3,356바이트, SHA-256 `9c3065e759b06638367fd26a5f5f9e8518d5d20be79449108be042d65149dd47`

`skills/aq/assets/scene-1.webp`(그림 파일): 25,970바이트, SHA-256 `77362ea088b3dd18ca879952e6f421605237d2f4cb867bb338913c382d07dca9`

`skills/aq/assets/scene-2.webp`(그림 파일): 24,386바이트, SHA-256 `8065311834d440874358c51ba50c2d235520e12084a27fe32cc2f52b8ced72ed`

`skills/aq/assets/scene-3.webp`(그림 파일): 26,496바이트, SHA-256 `40d5242c46383f56d0ecaf8ecc28c9a5847168cbda0d963003f3be78d0902e9b`

`skills/aq/assets/scene-4.webp`(그림 파일): 26,240바이트, SHA-256 `d5c871aef7e69421dc8f807c928046f76bc5e6fd077eccd5ab9957b5e626f070`

`skills/aq/assets/scene-5.webp`(그림 파일): 29,806바이트, SHA-256 `2c5f2f6413ad182d231eb4d1931ac2593bc23595a63c454de47e074e7ea284b6`

`skills/aq/assets/scene-few-records.webp`(그림 파일): 23,260바이트, SHA-256 `a15c04fc79f48303b9a7fe432a8fc5dc80c04d971336f3aff6458b0b8b3d76f6`

`skills/aq/assets/scene-unreadable.webp`(그림 파일): 23,542바이트, SHA-256 `ddbf37c6a8cfb89b3c24b705dbbe603e0eaf8ae788028a7118cbe247007e5020`

`skills/aq/assets/sticker-done.webp`(그림 파일): 2,970바이트, SHA-256 `c4839c6516f8ca6314d65fdf52e887f120806898e153b670093f67b283220399`

`skills/aq/assets/sticker-fix.webp`(그림 파일): 2,876바이트, SHA-256 `053ff1173469eb856460bc57635b53aa5664d4593333c2b2d5d35d9581d90ee3`

`skills/aq/assets/sticker-good.webp`(그림 파일): 2,808바이트, SHA-256 `12b1ada145e627df4a886fc3e5add142bb4d059e25cc996e43d9826427e4b0cd`

`src/report/assets.ts`(새 파일):

```ts
// 결과 화면에 넣을 그림(WebP)을 그림 폴더에서 골라 data URI로 읽는다. 화면마다 필요한 그림만 넣는다(설계 13.3, 「3단계 계획 전 결정」의 12번)
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** 그림의 이름과 그림 폴더의 파일 이름(skills/aq/assets) */
export const ART_FILES = {
  "scene-1": "scene-1.webp",
  "scene-2": "scene-2.webp",
  "scene-3": "scene-3.webp",
  "scene-4": "scene-4.webp",
  "scene-5": "scene-5.webp",
  "scene-few-records": "scene-few-records.webp",
  "scene-unreadable": "scene-unreadable.webp",
  face: "face.webp",
  "sticker-good": "sticker-good.webp",
  "sticker-fix": "sticker-fix.webp",
  "sticker-done": "sticker-done.webp",
} as const;
export type ArtName = keyof typeof ART_FILES;

/** 한 화면에 넣는 그림. 읽지 못한 그림은 null이고 화면은 그 자리를 대체 글로 그린다 */
export interface ReportArt {
  scene: string | null;
  face: string | null;
  /** 「잘하고 있는 것」 옆의 춘삼이 스티커 */
  good: string | null;
  /** 「정비할 것」 옆의 춘식이 스티커(고칠 것이 있을 때와 없을 때) */
  fix: string | null;
}

/** AQ를 냈으면 등급 단계의 장면, 내지 않았으면 기록을 읽지 못했다는 알림이 있을 때 읽지 못함, 없으면 모자람이다 */
export function sceneFor(tier: number | null, unreadable: boolean): ArtName {
  if (tier !== null) return `scene-${tier}` as ArtName;
  return unreadable ? "scene-unreadable" : "scene-few-records";
}

/** 정비할 것이 있으면 고칠 것 스티커, 없으면 다 고침 스티커다 */
export function stickerFor(repairs: number): ArtName {
  return repairs > 0 ? "sticker-fix" : "sticker-done";
}

/** 묶은 실행 파일(<스킬 폴더>/scripts/aq.mjs)이면 그 스킬 폴더의 assets 폴더, 아니면(원본으로 돌릴 때) null이다 */
export function assetsDirOf(entryFile: string): string | null {
  if (basename(entryFile) !== "aq.mjs" || basename(dirname(entryFile)) !== "scripts") return null;
  return join(dirname(dirname(entryFile)), "assets");
}

async function dataUri(dir: string | null, name: ArtName): Promise<string | null> {
  if (dir === null) return null;
  try {
    return `data:image/webp;base64,${(await readFile(join(dir, ART_FILES[name]))).toString("base64")}`;
  } catch {
    return null;
  }
}

/** 화면 하나에 넣을 그림 넷을 읽는다. tier는 등급 단계(AQ가 없으면 null), unreadable은 기록을 읽지 못했다는 알림이 있는지, repairs는 정비할 것의 수다 */
export async function loadArt(dir: string | null, pick: { tier: number | null; unreadable: boolean; repairs: number }): Promise<ReportArt> {
  const [scene, face, good, fix] = await Promise.all([
    dataUri(dir, sceneFor(pick.tier, pick.unreadable)),
    dataUri(dir, "face"),
    dataUri(dir, "sticker-good"),
    dataUri(dir, stickerFor(pick.repairs)),
  ]);
  return { scene, face, good, fix };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/report/assets.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 9개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/report/assets.test.ts scripts/make-assets.py skills/aq/assets/ART-LICENSE.md skills/aq/assets/face.webp skills/aq/assets/scene-1.webp skills/aq/assets/scene-2.webp skills/aq/assets/scene-3.webp skills/aq/assets/scene-4.webp skills/aq/assets/scene-5.webp skills/aq/assets/scene-few-records.webp skills/aq/assets/scene-unreadable.webp skills/aq/assets/sticker-done.webp skills/aq/assets/sticker-fix.webp skills/aq/assets/sticker-good.webp src/report/assets.ts
git commit -m "feat: 결과 화면 그림 11장과 고르는 함수를 더함"
```

---

### Task 2: 결과 화면이 그리는 칸만 고르기

**Files:**
- Create: `src/report/view.ts`
- Test: `test/report/view.test.ts`

**Interfaces:**
- Consumes: 1부의 `CheckupResult.details`(`missingInstructions[].name`, `worstOverlap.name`, `unjudgedServers[].projectName`과 `judgeFrom`, `setupProblems`), 2부의 `daysBefore`(`src/core/installs/age.ts`), 3부의 결과 조립(`src/core/result/assemble.ts`).
- Produces: `ReportView`(`partialReads` 칸 포함), `ViewFinding`, `ViewServer`, `ReportRun`(`{saved, round}`), `reportView(result, run)`(`src/report/view.ts`). 과제 6과 7이 쓴다.

설계 13.1, 19.1, 「3단계 계획 전 결정」의 5·6·10번이다.

- 평가 결과를 통째로 복사한 뒤 아는 경로를 지우지 않고, 그리는 칸만 골라 담는다. 평가 결과에 있는 절대 경로 열 가지(따로 둔 자리의 프로젝트 경로 셋, 알림의 경로 다섯, 정밀 점검 단서의 프로젝트 경로 둘)는 옮기지 않는다. 시험이 위 폴더 이름(`SECRET-PARENT`)이 결과에는 있고 고른 자료에는 없는 것을 본다.
- AQ를 내지 않았으면 그 알림의 문장을 점수 띠로 옮기고 알림 목록에서는 뺀다. 회차는 저장한 점검만 있다.
- 판정에서 뺀 서버는 판정을 시작할 수 있는 날을 평가 시계의 오늘에서 센 날 수로 바꾼다. 날을 모르면 `null`이다.
- 정리할 것의 이름은 후보의 대상 그대로이고, 규칙은 결과의 차례 그대로다.
- 「일부만 읽었다」 띠의 자료(설계 9.8, 20.1)는 평가 결과의 읽은 양(`coverage`)에서 띠를 띄울 도구(`partial`)만 골라 도구, 읽지 못한 비율, 아래 경계인지만 옮긴다. 읽지 못한 파일과 폴더의 경로는 옮기지 않는다. 시험이 20% 정확히(띄우지 않음), 33.3%(띄움), 읽지 못한 폴더가 있어 아래 경계인 경우(비율이 있음과 없음)를 본다(계획 리뷰 2차의 짝 Codex 1).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/report/view.test.ts`(새 파일):

```ts
// 결과 화면이 그리는 칸 고르기를 시험한다. 절대 경로를 옮기지 않는지, AQ를 내지 않았을 때, 판정을 시작할 수 있는 날까지의 날 수, 회차, 정리할 것의 이름(설계 13.1, 19.1, 「3단계 계획 전 결정」의 5·6·10번)
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { reportView } from "../../src/report/view.ts";
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const collected = (input: Partial<CollectedTool> = {}): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
  ...input,
});
const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
const result = (tool: ClaudeToolInput = {}, extra: { collected?: CollectedTool } = {}): CheckupResult => {
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [extra.collected ?? collected()], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
};

describe("결과 화면 자료", () => {
  it("절대 경로를 옮기지 않는다. 프로젝트는 폴더 이름으로, 서버는 이름과 프로젝트 이름으로 옮긴다", () => {
    const root = "C:/SECRET-PARENT/MyApp";
    const projects = [project(root, { normRoot: "c:/secret-parent/myapp", cwds: ["c:/secret-parent/myapp"] })];
    const local = mcpServer("local-db", { scope: "local", projectRoot: "c:/secret-parent/myapp" });
    const sessions = [...enough, ...Array.from({ length: 3 }, () => ({ cwd: "c:/secret-parent/myapp", days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }))];
    const checked = result({ sessions, setup: { projects, mcpServers: [local] } }, { collected: collected({ read: { ...collected().read, unreadableFiles: ["C:/SECRET-PARENT/logs/s.jsonl"], unreadableDirs: ["C:/SECRET-PARENT/logs"] } }) });
    // 결과 파일에는 정규화한 경로와 알림의 경로가 있다
    expect(JSON.stringify(checked).toLowerCase()).toContain("secret-parent");
    const view = reportView(checked, { saved: true, round: 2 });
    expect(JSON.stringify(view).toLowerCase()).not.toContain("secret-parent");
    expect(view.missingInstructions).toEqual(["MyApp"]);
    expect(view.servers).toEqual([{ tool: "claude-code", name: "local-db", scope: "local", projectName: "MyApp", why: "not_established", daysUntil: 15 }]);
    expect(view.unreadable).toBe(true);
  });

  it("AQ를 내지 않았으면 그 알림의 문장을 점수 띠에 쓰고 알림 목록에서는 뺀다", () => {
    const thin = result({ sessions: [{ days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }] });
    expect(thin.score.aq).toBeNull();
    const view = reportView(thin, { saved: false, round: null });
    const notice = thin.notices.find((item) => item.kind === "score_withheld")!;
    expect(view.withheldText).toEqual(notice.text);
    expect(view.notices.map((item) => item.kind)).not.toContain("score_withheld");
    expect(view.score).toEqual({ aq: null, grade: null, tier: null, withheld: thin.score.withheld });
    expect(view.unreadable).toBe(false);
    const scored = reportView(result(), { saved: true, round: 1 });
    expect(scored.withheldText).toBeNull();
  });

  it("회차는 저장한 점검만 있다", () => {
    expect(reportView(result(), { saved: true, round: 3 }).round).toBe(3);
    expect(reportView(result(), { saved: false, round: 3 }).round).toBeNull();
  });

  it("읽지 못한 비율이 20%를 넘거나 아래 경계인 도구만 「일부만 읽었다」 띠의 자료로 옮긴다(경로는 옮기지 않는다)", () => {
    const read = collected().read;
    const bands = (input: Partial<CollectedTool["read"]>) => reportView(result({}, { collected: collected({ read: { ...read, ...input } }) }), { saved: true, round: 1 }).partialReads;
    expect(bands({})).toEqual([]);
    // 파일 5개 가운데 1개(20%)는 넘지 않은 것이다
    expect(bands({ files: 5, listedBytes: 500, unreadableFiles: ["C:/SECRET-PARENT/a.jsonl"], unreadableFileBytes: 100 })).toEqual([]);
    expect(bands({ files: 3, listedBytes: 300, unreadableFiles: ["C:/SECRET-PARENT/a.jsonl"], unreadableFileBytes: 100 })).toEqual([{ tool: "claude-code", share: 1 / 3, lowerBound: false }]);
    // 읽지 못한 폴더가 있으면 비율이 작아도 아래 경계로 띄우고, 목록에 파일이 없으면 비율을 내지 않는다
    expect(bands({ unreadableDirs: ["C:/SECRET-PARENT/logs"] })).toEqual([{ tool: "claude-code", share: 0, lowerBound: true }]);
    expect(bands({ files: 0, listedBytes: 0, bytes: 0, unreadableDirs: ["C:/SECRET-PARENT/logs"] })).toEqual([{ tool: "claude-code", share: null, lowerBound: true }]);
  });

  it("판정을 시작할 수 있는 날까지 남은 날 수를 평가 시계의 오늘에서 센다. 날을 모르면 null이다", () => {
    const checked = result({ setup: { mcpServers: [mcpServer("watching"), mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null })] } });
    const view = reportView(checked, { saved: true, round: 1 });
    expect(view.servers.map((server) => [server.name, server.why, server.daysUntil])).toEqual([
      ["claude.ai Mail", "no_definition", null],
      ["watching", "not_established", 15],
    ]);
  });

  it("규칙은 결과의 차례 그대로이고, 정리할 것은 후보의 대상 이름, 문장은 두 언어 그대로다", () => {
    const checked = result();
    const view = reportView(checked, { saved: true, round: 1 });
    expect(view.findings.map((finding) => finding.ruleId)).toEqual(checked.findings.map((finding) => finding.ruleId));
    for (const [index, finding] of view.findings.entries()) {
      const source = checked.findings[index]!;
      expect(finding.text).toEqual(source.text);
      expect(finding.targets).toEqual(source.candidates.map((id) => checked.candidates.find((candidate) => candidate.id === id)!.target));
      expect(finding.measured).toBe(source.status === "scored");
    }
    expect(view.tools).toEqual(["claude-code"]);
    expect(view.window).toEqual({ from: checked.window.score.from, to: checked.window.score.to });
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/report/view.test.ts`
Expected: FAIL. `test/report/view.test.ts`가 `../../src/report/view.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/report/view.ts`(새 파일):

```ts
// 평가 결과와 실행 기록에서 결과 화면이 그리는 칸만 고른다. 평가 결과에 있는 절대 경로(따로 둔 자리의 프로젝트 경로, 알림의 경로, 정밀 점검 단서)는 옮기지 않고, 프로젝트는 폴더 이름으로 옮긴다(순수 함수, 설계 13.1, 19.1, 「3단계 계획 전 결정」의 10번)
import type { LocalDate } from "../adapters/common/dates.ts";
import type { ToolId } from "../adapters/types.ts";
import type { FindingText } from "../core/copy/findings.ts";
import type { ResultText } from "../core/copy/grades.ts";
import type { Lang, Texts } from "../core/copy/lang.ts";
import { daysBefore } from "../core/installs/age.ts";
import type { CountedProblem } from "../core/metrics/setup.ts";
import type { CheckupResult, ResultFinding, UnjudgedServer } from "../core/result/assemble.ts";
import type { ResultUsage } from "../core/result/usage.ts";
import type { AxisScore, Withheld } from "../core/scoreboard.ts";

/** 화면에 그리는 규칙 하나. 문장은 결과 파일의 두 언어 문장 그대로다 */
export interface ViewFinding {
  ruleId: ResultFinding["ruleId"];
  axis: ResultFinding["axis"];
  category: ResultFinding["category"];
  severity: ResultFinding["severity"];
  /** 규칙을 쟀다(점수가 있다) */
  measured: boolean;
  /** 예상 효과. 없으면 null이다 */
  gain: number | null;
  /** 정리할 것의 이름(정비 후보의 대상). 후보의 차례 그대로다 */
  targets: string[];
  /** 규칙은 쟀지만 비율을 못 잰 도구 가운데 후보가 나온 도구(먼저 고칠 것의 덧붙이는 말) */
  unmeasuredTools: ToolId[];
  text: Texts<FindingText>;
}

/** 판정에서 뺀 서버 하나. 프로젝트는 폴더 이름만 옮긴다 */
export interface ViewServer {
  tool: ToolId;
  name: string;
  scope: UnjudgedServer["scope"];
  projectName: string | null;
  why: UnjudgedServer["why"];
  /** 판정을 시작할 수 있는 날까지 남은 날 수(평가 시계의 오늘에서). 날을 모르면 null이다 */
  daysUntil: number | null;
}

export interface ReportView {
  /** 처음 보일 언어 */
  lang: Lang;
  today: LocalDate;
  /** 점수 구간 */
  window: { from: LocalDate; to: LocalDate };
  /** 기록을 찾은 도구 */
  tools: ToolId[];
  /** 이 점검을 상태 폴더에 저장했다 */
  saved: boolean;
  /** 저장한 점검의 회차(이력의 줄 수). 저장하지 않았거나 이력을 세지 못했으면 null이다 */
  round: number | null;
  score: { aq: number | null; grade: string | null; tier: number | null; withheld: Withheld[] };
  /** AQ를 내지 않았다는 알림의 문장. AQ를 냈으면 null이다 */
  withheldText: Texts<string> | null;
  /** 기록을 읽지 못했다는 알림이 있다(점수를 못 낸 화면의 장면 고르기) */
  unreadable: boolean;
  text: Texts<ResultText>;
  axes: AxisScore[];
  /** 결과의 차례 그대로(설계 11.5) */
  findings: ViewFinding[];
  usage: ResultUsage;
  /** 알림의 종류와 문장. AQ를 내지 않았다는 알림은 점수 띠에 따로 보이므로 뺀다 */
  notices: { kind: string; text: Texts<string> }[];
  servers: ViewServer[];
  setupProblems: CountedProblem[];
  /** F3에서 지침이 없다고 센 프로젝트의 폴더 이름 */
  missingInstructions: string[];
  /** F4에서 전역 지침과 가장 많이 겹친 프로젝트의 폴더 이름 */
  worstOverlap: string | null;
  /** 「일부만 읽었다」 띠를 띄울 도구마다 읽지 못한 비율(낼 수 없으면 null)과 그 비율이 아래 경계인지다(설계 9.8, 20.1) */
  partialReads: { tool: ToolId; share: number | null; lowerBound: boolean }[];
}

/** 화면이 결과 파일 밖에서 받는 것. 실행 기록의 저장 여부와 이력의 회차다 */
export interface ReportRun {
  saved: boolean;
  round: number | null;
}

export function reportView(result: CheckupResult, run: ReportRun): ReportView {
  const targetsOf = (finding: ResultFinding): string[] => finding.candidates.map((id) => result.candidates.find((candidate) => candidate.id === id)?.target ?? id);
  const withheld = result.score.aq === null ? (result.notices.find((notice) => notice.kind === "score_withheld")?.text ?? null) : null;
  return {
    lang: result.lang,
    today: result.window.today,
    window: { from: result.window.score.from, to: result.window.score.to },
    tools: result.tools.filter((tool) => tool.detected).map((tool) => tool.tool),
    saved: run.saved,
    round: run.saved ? run.round : null,
    score: { aq: result.score.aq, grade: result.score.grade, tier: result.score.tier, withheld: [...result.score.withheld] },
    withheldText: withheld,
    unreadable: result.notices.some((notice) => notice.kind === "record_unreadable"),
    text: result.text,
    axes: result.axes,
    findings: result.findings.map((finding) => ({
      ruleId: finding.ruleId,
      axis: finding.axis,
      category: finding.category,
      severity: finding.severity,
      measured: finding.status === "scored",
      gain: finding.gain,
      targets: targetsOf(finding),
      unmeasuredTools: finding.tools.filter((value) => value.status === "unmeasured" && value.candidates.length > 0).map((value) => value.tool),
      text: finding.text,
    })),
    usage: result.usage,
    notices: result.notices.filter((notice) => !(notice.kind === "score_withheld" && result.score.aq === null)).map((notice) => ({ kind: notice.kind, text: notice.text })),
    servers: result.details.unjudgedServers.map((server) => ({
      tool: server.tool,
      name: server.name,
      scope: server.scope,
      projectName: server.projectName,
      why: server.why,
      daysUntil: server.judgeFrom === null ? null : daysBefore(server.judgeFrom, result.window.today),
    })),
    setupProblems: result.details.setupProblems,
    missingInstructions: result.details.missingInstructions.map((project) => project.name),
    worstOverlap: result.details.worstOverlap?.name ?? null,
    partialReads: result.coverage.filter((coverage) => coverage.partial).map((coverage) => ({ tool: coverage.tool, share: coverage.unreadableShare, lowerBound: coverage.lowerBound })),
  };
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/report/view.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 6개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/report/view.test.ts src/report/view.ts
git commit -m "feat: 결과 화면이 그리는 칸만 고르는 자료를 더함"
```

---

### Task 3: 결과 화면의 고정 글 두 언어

**Files:**
- Create: `src/report/copy.ts`
- Test: `test/report/copy.test.ts`

**Interfaces:**
- Consumes: 2부와 4부의 `Lang`, `Texts`(`src/core/copy/lang.ts`), `slots`(`src/core/copy/format.ts`, 시험만).
- Produces: `REPORT_COPY`, `CopyKey`, `WEEKDAYS`, `STATUS_COPY`, `PROBLEM_KIND_COPY`, `SCENE_ALT`, `copyOf(key, lang)`(`src/report/copy.ts`). 과제 6이 쓰고 `cardFail` 한 칸을 더한다.

설계 13.1, 13.2, 14, 19.1, 「3단계 계획 전 결정」의 11번이다.

- 3단계 시안에서 짝이 칸마다 판정한 고정 글 표를 출발점으로 하고, 시안에만 있던 글(후보 띠, 합성 예시, 임시 그림, 각주)은 뺐다. 끼우는 자리는 `{이름}`, 단수와 복수는 `{이름:하나|여럿}`이고 core의 `fill`이 채운다.
- 꼬리의 약속 문장은 설계 19.1의 통일 문장 그대로다. 시험이 글자 그대로 견준다.
- 장면의 대체 글은 그림이 무엇을 하는지만 적는다. 점수를 못 낸 까닭은 장면 아래 글(알림의 문장)이 말한다.
- 「일부만 읽었다」 띠의 문장은 셋이다. 비율이 있을 때, 아래 경계일 때("적어도"), 비율을 낼 수 없을 때(숫자 없음)다(설계 20.1). 시험이 아래 경계 문장에만 두 언어의 「적어도」가 있고 다른 문장에는 없는지를 문구 자체로 본다. 결과 화면 시험은 기대값을 같은 문구에서 만들므로 문구의 뜻은 이 시험이 지킨다(계획 리뷰 3차의 짝 Codex 2).
- 시험은 칸마다 두 언어가 다 있고 자리가 같은지, 한국어에 버전을 뜻하는 "판"이나 콜론으로 끝나는 문장이 없는지 본다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/report/copy.test.ts`(새 파일):

```ts
// 결과 화면의 고정 글을 시험한다. 두 언어가 다 있고 끼우는 자리가 같은지, 버전을 뜻하는 "판"이나 콜론으로 끝나는 한국어 문장이 없는지, 꼬리의 약속 문장이 설계와 글자 그대로인지(설계 13.2, 19.1, 「3단계 계획 전 결정」의 11번)
import { describe, expect, it } from "vitest";
import { slots } from "../../src/core/copy/format.ts";
import { PROBLEM_KIND_COPY, REPORT_COPY, SCENE_ALT, STATUS_COPY, WEEKDAYS, copyOf } from "../../src/report/copy.ts";

const TABLES = { REPORT_COPY, STATUS_COPY, PROBLEM_KIND_COPY, SCENE_ALT } as const;
const cells = Object.entries(TABLES).flatMap(([table, entries]) => Object.entries(entries).map(([key, texts]) => ({ id: `${table}.${key}`, en: texts.en as string, ko: texts.ko as string })));

describe("결과 화면의 고정 글", () => {
  it("칸마다 두 언어가 다 있고 끼우는 자리가 같다", () => {
    expect(cells.length).toBeGreaterThan(90);
    for (const cell of cells) {
      expect(cell.en.trim(), cell.id).not.toBe("");
      expect(cell.ko.trim(), cell.id).not.toBe("");
      expect(slots(cell.ko).sort(), cell.id).toEqual(slots(cell.en).sort());
    }
    expect(WEEKDAYS.en).toHaveLength(7);
    expect(WEEKDAYS.ko).toHaveLength(7);
  });
  it("한국어에 버전을 뜻하는 \"판\"이 없고, 한국어 문장이 콜론으로 끝나지 않는다", () => {
    for (const cell of cells) {
      expect(cell.ko, cell.id).not.toMatch(/판(?!정|단)/);
      expect(cell.ko, cell.id).not.toMatch(/[:：]\s*$/);
    }
  });
  it("꼬리의 약속 문장은 설계 19.1의 통일 문장 그대로다", () => {
    expect(copyOf("footPromise", "ko")).toBe("프로그램과 결과 화면은 바깥으로 아무것도 보내지 않습니다. AI에게는 점수와 집계, 정비할 것의 이름이 전해집니다. 대화 내용과 지침의 글은 전해지지 않습니다. 정밀 점검을 시키면 고른 지침 파일을 AI가 읽습니다.");
  });
  it("시안에만 있던 글(합성 예시, 임시 그림, 후보 띠, 각주)은 없다", () => {
    const all = cells.map((cell) => `${cell.en} ${cell.ko}`).join("\n");
    for (const word of ["합성 예시", "임시 그림", "Synthetic", "Temporary art", "후보", "각주"]) expect(all).not.toContain(word);
  });
  it("장면 일곱 장마다 그림이 무엇을 하는지 적은 대체 글이 있다", () => {
    expect(Object.keys(SCENE_ALT).sort()).toEqual(["scene-1", "scene-2", "scene-3", "scene-4", "scene-5", "scene-few-records", "scene-unreadable"]);
  });
  it("「일부만 읽었다」 띠는 아래 경계 문장에만 「적어도」를 달고, 비율을 낼 수 없는 문장에는 숫자 자리가 없다(설계 20.1)", () => {
    expect(REPORT_COPY.partialReadAtLeast.ko).toContain("적어도 {share}");
    expect(REPORT_COPY.partialReadAtLeast.en).toContain("At least {share}");
    for (const lang of ["en", "ko"] as const) {
      expect(REPORT_COPY.partialRead[lang], lang).not.toMatch(/적어도|at least/i);
      expect(slots(REPORT_COPY.partialRead[lang]).sort(), lang).toEqual(["share", "tool"]);
      expect(slots(REPORT_COPY.partialReadUnknown[lang]), lang).toEqual(["tool"]);
    }
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/report/copy.test.ts`
Expected: FAIL. `test/report/copy.test.ts`가 `../../src/report/copy.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/report/copy.ts`(새 파일):

```ts
// 결과 화면의 고정 글(단의 제목, 단추, 화면 낱말, 꼬리, 공유 카드)의 두 언어. 3단계 시안에서 짝이 칸마다 판정한 표를 출발점으로 하고, 시안에만 있던 글은 뺐다(설계 13.1, 13.2, 14, 19.1, 「3단계 계획 전 결정」의 11번)
import type { Lang, Texts } from "../core/copy/lang.ts";

/** 화면의 고정 글. {이름}은 숫자나 글을 끼우는 자리이고 {이름:하나|여럿}은 값이 1이면 앞의 것이다 */
export const REPORT_COPY = {
  brand: { en: "Chunsik's Garage", ko: "춘식이 정비소" },
  title: { en: "AQ Inspection Sheet", ko: "AQ 점검 명세서" },
  pageTitle: { en: "AQ Inspection Sheet · {date}", ko: "AQ 점검 명세서 · {date}" },
  langGroup: { en: "Language", ko: "화면 언어" },
  date: { en: "Date", ko: "점검일" },
  tools: { en: "Tools", ko: "대상" },
  period: { en: "Score window", ko: "점수 구간" },
  round: { en: "Check-up", ko: "회차" },
  roundValue: { en: "#{n}", ko: "{n}회" },
  notSaved: { en: "Not saved", ko: "저장 안 함" },
  noTools: { en: "None found", ko: "찾지 못함" },
  scoreAria: { en: "Overall score", ko: "종합 점수" },
  aqLabel: { en: "AQ SCORE", ko: "AQ 지수" },
  grade: { en: "GRADE", ko: "등급" },
  gradeAria: { en: "Grade {g}", ko: "등급 {g}" },
  noScore: { en: "No score", ko: "점수 없음" },
  axisCounts: { en: "Good {g} · Fix {f}", ko: "잘함 {g} · 정비 {f}" },
  axisAria: { en: "{axis} {v} out of 100", ko: "{axis} {v}점, 100점 만점" },
  axisNone: { en: "{axis} not measured", ko: "{axis} 잴 수 없음" },
  axesTable: { en: "Scores on the four axes", ko: "네 기준의 점수" },
  thAxis: { en: "Axis", ko: "기준" },
  thScore: { en: "Score", ko: "점수" },
  thGood: { en: "Good", ko: "잘함" },
  thFix: { en: "Fix", ko: "정비" },
  unmeasured: { en: "Not measured", ko: "잴 수 없음" },
  verdict: { en: "Verdict", ko: "진단" },
  best: { en: "Best at", ko: "가장 잘하는 것" },
  fixFirst: { en: "Fix first", ko: "먼저 고칠 것" },
  colGood: { en: "What you do well", ko: "잘하고 있는 것" },
  colFix: { en: "What to tune up", ko: "정비할 것" },
  how: { en: "How it was measured", ko: "어떻게 쟀나" },
  clean: { en: "Clean up", ko: "정리하기" },
  copied: { en: "Copied. Paste it into Claude Code or Codex.", ko: "복사했습니다. Claude Code나 Codex에 붙여 넣으세요." },
  copyFail: { en: "Copying was blocked. Copy the text below and paste it into Claude Code or Codex.", ko: "복사가 막혔습니다. 아래 글을 직접 복사해 Claude Code나 Codex에 붙여 넣으세요." },
  copyLabel: { en: "Text to paste", ko: "붙여 넣을 말" },
  phrase: { en: "Chunsik's Garage tune-up: {name}", ko: "춘식이 정비소 정비: {name}" },
  targets: { en: "To clean up", ko: "정리할 것" },
  places: { en: "Where", ko: "고칠 곳" },
  missingProjects: { en: "Projects without instructions", ko: "지침이 없는 프로젝트" },
  overlapProject: { en: "Project with the most overlap", ko: "가장 많이 겹치는 프로젝트" },
  serversOut: { en: "{n} {n:server|servers} left out of the judgment", ko: "판정에서 뺀 서버 {n}개" },
  judgeFrom: { en: "If nothing else changes, it can be judged from the check-up {n} {n:day|days} from now.", ko: "다른 조건이 같으면 {n}일 뒤의 점검부터 판정할 수 있습니다." },
  judgeUnknown: { en: "The day judging can start could not be worked out.", ko: "판정을 시작할 날을 정하지 못했습니다." },
  judgeChange: { en: "The day moves if the server is called or its definition changes in the meantime.", ko: "그 사이에 부르거나 정의가 바뀌면 날이 달라집니다." },
  judgeNotSaved: { en: "This check-up was not saved, so for servers seen for the first time the day may move later.", ko: "이번 점검은 저장하지 않아, 이번에 처음 본 서버는 날이 뒤로 밀릴 수 있습니다." },
  blockWith: { en: "Setting to block it", ko: "막을 때 쓸 설정" },
  blockNote: { en: "This is the display name set by claude.ai. It can change, and a name that clashes gets \" (N)\" added.", ko: "이 이름은 claude.ai가 정하는 표시 이름이라 바뀔 수 있고, 이름이 겹치면 뒤에 \" (N)\"이 붙습니다." },
  avgList: { en: "Doing okay", ko: "보통" },
  unmList: { en: "Not measured", ko: "잴 수 없음" },
  none: { en: "None", ko: "없음" },
  use: { en: "Mileage", ko: "사용 기록" },
  kMain: { en: "Main sessions", ko: "주 세션" },
  kDays: { en: "Active days", ko: "사용한 날" },
  kOut: { en: "Output tokens", ko: "출력 토큰" },
  kCache: { en: "Cache hits", ko: "캐시 적중" },
  cal: { en: "Replies per day", ko: "날짜별 응답 수" },
  calAria: { en: "Replies per day from {from} to {to}. {u} {u:day|days} used, {n} not used, {x} with no records kept. Busiest day: {max} {max:reply|replies}.", ko: "{from}부터 {to}까지 날짜별 응답 수. 쓴 날 {u}일, 안 쓴 날 {n}일, 기록이 남아 있지 않은 날 {x}일, 가장 많은 날 {max}개" },
  toolsTable: { en: "Main sessions and output tokens by tool", ko: "도구별 주 세션과 출력 토큰" },
  thTool: { en: "Tool", ko: "도구" },
  less: { en: "Less", ko: "적음" },
  more: { en: "More", ko: "많음" },
  lgUnused: { en: "Not used", ko: "안 쓴 날" },
  lgUnseen: { en: "No records kept", ko: "기록이 남아 있지 않은 날" },
  asTable: { en: "Show tables", ko: "표로 보기" },
  asChart: { en: "Show charts", ko: "그림으로 보기" },
  thDate: { en: "Date", ko: "날짜" },
  thReplies: { en: "Replies", ko: "응답 수" },
  thState: { en: "State", ko: "상태" },
  stUsed: { en: "Used", ko: "쓴 날" },
  byTool: { en: "By tool", ko: "도구별" },
  shell: { en: "Shell commands that ended with a non-zero code: {v} · not scored", ko: "셸 명령이 0이 아닌 값으로 끝난 몫 {v} · 점수에 넣지 않음" },
  notices: { en: "Notices", ko: "알림" },
  partialRead: { en: "Only part of the {tool} records could be read. {share} of them could not be read.", ko: "{tool} 기록을 일부만 읽었습니다. 읽지 못한 비율은 {share}입니다." },
  partialReadAtLeast: { en: "Only part of the {tool} records could be read. At least {share} of them could not be read.", ko: "{tool} 기록을 일부만 읽었습니다. 읽지 못한 비율은 적어도 {share}입니다." },
  partialReadUnknown: { en: "Only part of the {tool} records could be read. How much could not be read is unknown.", ko: "{tool} 기록을 일부만 읽었습니다. 얼마나 읽지 못했는지는 알 수 없습니다." },
  footCalc: { en: "Computed on this PC.", ko: "이 PC에서 계산했습니다." },
  footPromise: {
    en: "The program and this page send nothing anywhere. The AI receives your scores, totals and the names of things to tune up. Your conversations and the text of your instructions are not sent. If you ask for a deep check, the AI reads the instruction files you pick.",
    ko: "프로그램과 결과 화면은 바깥으로 아무것도 보내지 않습니다. AI에게는 점수와 집계, 정비할 것의 이름이 전해집니다. 대화 내용과 지침의 글은 전해지지 않습니다. 정밀 점검을 시키면 고른 지침 파일을 AI가 읽습니다.",
  },
  footNames: { en: "This file contains the names of your skills and project folders. Anyone you send the file to can see them. To share your result, use the card.", ko: "이 파일에는 스킬과 프로젝트 폴더의 이름이 들어 있습니다. 파일째 보내면 그 이름도 보입니다. 결과를 나눌 때는 카드를 쓰세요." },
  cardBtn: { en: "Save as card", ko: "카드로 저장" },
  cardTitle: { en: "Share card", ko: "공유 카드" },
  download: { en: "Download", ko: "내려받기" },
  close: { en: "Close", ko: "닫기" },
  cardNote: { en: "If the download is blocked, right-click the image, or press and hold it on a phone, to save it.", ko: "내려받기가 막히면 그림을 오른쪽 단추로 누르거나, 휴대폰에서는 길게 눌러 저장하세요." },
  cardAlt: { en: "Share card: AQ {aq}, grade {grade}, {name}, with the four axis scores", ko: "공유 카드. AQ {aq}, {grade}등급 {name}, 네 기준 점수" },
  cardRepo: { en: "github.com/yeunlee1/chunsik-garage", ko: "github.com/yeunlee1/chunsik-garage" },
} as const satisfies Record<string, Texts<string>>;

export type CopyKey = keyof typeof REPORT_COPY;

/** 요일 머리(월요일부터) */
export const WEEKDAYS: Texts<readonly string[]> = { en: ["M", "T", "W", "T", "F", "S", "S"], ko: ["월", "화", "수", "목", "금", "토", "일"] };

/** 상태 표시의 낱말. 색과 아이콘과 함께 보인다(설계 13.4) */
export const STATUS_COPY = {
  critical: { en: "Serious", ko: "심각" },
  caution: { en: "Caution", ko: "주의" },
  info: { en: "Note", ko: "참고" },
  good: { en: "Good", ko: "양호" },
  average: { en: "Okay", ko: "보통" },
  unmeasured: { en: "Not measured", ko: "잴 수 없음" },
} as const satisfies Record<string, Texts<string>>;

/** 설정 문제의 종류(S3의 근거 숫자와 같은 낱말) */
export const PROBLEM_KIND_COPY = {
  unparsable: { en: "unparsable settings file", ko: "풀리지 않는 설정 파일" },
  noFrontmatter: { en: "skill without a header", ko: "머리말이 없는 스킬" },
  danglingLink: { en: "link that points nowhere", ko: "가리키는 곳이 없는 링크" },
} as const satisfies Record<string, Texts<string>>;

/** 장면 그림의 대체 글. 그림이 무엇을 하는지만 적는다(설계 13.3, 「3단계 계획 전 결정」의 12번) */
export const SCENE_ALT = {
  "scene-1": { en: "An angry Chunsik slashes a messy sheet with a pipe wrench like lightning while Chunsam looks on, startled", ko: "화난 춘식이가 파이프렌치로 엉망인 명세서를 번개처럼 베고, 춘삼이가 뒤에서 놀라는 그림" },
  "scene-2": { en: "Chunsik glares at a crumpled sheet while Chunsam waits with a toolbox", ko: "춘식이가 구겨진 명세서를 노려보고, 춘삼이가 공구함을 들고 기다리는 그림" },
  "scene-3": { en: "Chunsik fixes a car while Chunsam hands over a screwdriver", ko: "춘식이가 손님 차를 고치고, 춘삼이가 드라이버를 건네는 그림" },
  "scene-4": { en: "Chunsik stamps a clean sheet while Chunsam gives a thumbs-up", ko: "춘식이가 깨끗한 명세서에 합격 도장을 찍고, 춘삼이가 엄지를 든 그림" },
  "scene-5": { en: "Chunsik and Chunsam jump and toss sheets into the air", ko: "춘식이와 춘삼이가 뛰어오르며 명세서를 하늘로 던지는 그림" },
  "scene-few-records": { en: "Chunsam holds a checklist with only a couple of lines while Chunsik sits on a toolbox watching an hourglass", ko: "춘삼이가 줄이 두어 개뿐인 점검표를 들고, 춘식이가 공구함에 앉아 모래시계를 보는 그림" },
  "scene-unreadable": { en: "Chunsik cannot open a folder with a lock on it while Chunsam peers at it through a magnifying glass", ko: "춘식이가 자물쇠가 그려진 서류철을 열지 못해 머쓱하고, 춘삼이가 돋보기로 들여다보는 그림" },
} as const satisfies Record<string, Texts<string>>;

/** 고정 글 하나를 고른다 */
export function copyOf(key: CopyKey, lang: Lang): string {
  return REPORT_COPY[key][lang];
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/report/copy.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 6개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/report/copy.test.ts src/report/copy.ts
git commit -m "feat: 결과 화면의 고정 글을 두 언어로 더함"
```

---

### Task 4: 토큰 줄임과 백분율 서식

**Files:**
- Create: `src/report/format.ts`
- Test: `test/report/format.test.ts`

**Interfaces:**
- Consumes: 4부의 `groupDigits`, `oneDecimal`(`src/core/copy/format.ts`), 2부의 `roundHalfUp`(`src/core/score.ts`).
- Produces: `percent(share)`, `shortTokens(value, lang)`(`src/report/format.ts`). 과제 6이 쓴다.

- 실행 환경의 로캘에 기대지 않고 core의 반올림과 자리 끊기를 쓴다(「2단계 4부 계획에서 보완」의 6번).
- 한국어는 만 단위로 반올림한 뒤 1만 만이 차면 억으로 올린다(1억 10,000만으로 쓰지 않는다). 영어는 원래 값이 속한 단위(K, M, B)를 먼저 고르고 소수 한 자리로 반올림하며, 반올림한 값이 1,000이 될 때만 한 단계 올린다(950,000은 950K, 999,950은 1M). 시험이 경계마다 본다. 표에는 줄이지 않은 정수를 쓴다(설계 13.4).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/report/format.test.ts`(새 파일):

```ts
// 결과 화면의 숫자 서식을 시험한다. 출력 토큰의 줄임(한국어는 만·억, 영어는 K·M·B)과 자리 올림의 경계, 백분율(설계 13.1, 3단계 시안 짝 검증의 경계 표)
import { describe, expect, it } from "vitest";
import { percent, shortTokens } from "../../src/report/format.ts";

describe("출력 토큰의 줄임", () => {
  it("영어는 원래 값이 속한 단위를 먼저 고르고 소수 한 자리로 반올림한다. 반올림한 값이 1,000이 될 때만 한 단계 올린다", () => {
    const cases: [number, string][] = [
      [0, "0"], [999, "999"], [1_000, "1K"], [1_500, "1.5K"], [949_999, "950K"], [950_000, "950K"], [999_499, "999.5K"], [999_949, "999.9K"], [999_950, "1M"],
      [123_456_789, "123.5M"], [950_000_000, "950M"], [999_949_999, "999.9M"], [999_950_000, "1B"], [1_500_000_000, "1.5B"], [1_234_567_890_123, "1,234.6B"],
    ];
    for (const [value, text] of cases) expect(shortTokens(value, "en"), String(value)).toBe(text);
  });
  it("한국어는 만 단위로 반올림한 뒤 억으로 올린다. 1억 10,000만이나 9,999만 5천처럼 쓰지 않는다", () => {
    const cases: [number, string][] = [
      [0, "0"], [9_999, "9,999"], [10_000, "1만"], [14_999, "1만"], [15_000, "2만"], [99_994_999, "9,999만"], [99_995_000, "1억"], [100_000_000, "1억"], [123_456_789, "1억 2,346만"], [200_004_999, "2억"], [1_234_567_890_123, "12,345억 6,789만"],
    ];
    for (const [value, text] of cases) expect(shortTokens(value, "ko"), String(value)).toBe(text);
  });
});

describe("백분율", () => {
  it("몫을 소수 한 자리 백분율로 적는다. 반올림은 설계 11.4의 절차다", () => {
    expect(percent(0)).toBe("0%");
    expect(percent(1)).toBe("100%");
    expect(percent(0.0145)).toBe("1.5%");
    expect(percent(0.9666)).toBe("96.7%");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/report/format.test.ts`
Expected: FAIL. `test/report/format.test.ts`가 `../../src/report/format.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/report/format.ts`(새 파일):

```ts
// 결과 화면의 숫자 서식. 출력 토큰의 줄임과 백분율이다. 실행 환경의 로캘에 기대지 않고 core의 반올림과 자리 끊기를 쓴다(순수 함수, 설계 11.4, 13.1)
import { groupDigits, oneDecimal } from "../core/copy/format.ts";
import type { Lang } from "../core/copy/lang.ts";
import { roundHalfUp } from "../core/score.ts";

/** 몫(0~1)을 소수 한 자리 백분율로 적는다 */
export function percent(share: number): string {
  return `${oneDecimal(share * 100)}%`;
}

/**
 * 출력 토큰을 줄여 적는다. 한국어는 만 단위로 반올림한 뒤 1만 만이 차면 억으로 올린다(1억 10,000만으로 쓰지 않는다).
 * 영어는 원래 값이 속한 단위(K·M·B)를 먼저 고르고 소수 한 자리로 반올림하며, 반올림한 값이 1,000이 될 때만 한 단계 올린다(950,000은 950K, 999,950은 1M).
 * 표에는 줄이지 않은 정수를 쓴다
 */
export function shortTokens(value: number, lang: Lang): string {
  if (lang === "ko") {
    if (value < 1e4) return groupDigits(value);
    const man = roundHalfUp(value / 1e4);
    if (man < 1e4) return `${groupDigits(man)}만`;
    const eok = Math.floor(man / 1e4);
    const rest = man % 1e4;
    return `${groupDigits(eok)}억${rest ? ` ${groupDigits(rest)}만` : ""}`;
  }
  if (value < 1e3) return groupDigits(value);
  const units: [number, string][] = [
    [1e3, "K"],
    [1e6, "M"],
    [1e9, "B"],
  ];
  let index = value >= 1e9 ? 2 : value >= 1e6 ? 1 : 0;
  let tenths = roundHalfUp((value / units[index]![0]) * 10);
  if (tenths >= 10_000 && index < units.length - 1) {
    index += 1;
    tenths = roundHalfUp((value / units[index]![0]) * 10);
  }
  return `${groupDigits(Math.floor(tenths / 10))}${tenths % 10 ? `.${tenths % 10}` : ""}${units[index]![1]}`;
}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/report/format.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 1개, 시험 3개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/report/format.test.ts src/report/format.ts
git commit -m "feat: 결과 화면의 토큰 줄임과 백분율 서식을 더함"
```

---

### Task 5: 결과 화면의 스타일과 화면 안의 스크립트

**Files:**
- Create: `src/report/script.ts`
- Create: `src/report/style.ts`
- Test: `test/report/script.test.ts`
- Test: `test/report/style.test.ts`

**Interfaces:**
- Consumes: 1단계의 묶음 검사 규칙 `bannedGlobals`(`scripts/bundle-scan.mjs`, 시험만), 4부의 `Texts`.
- Produces: `REPORT_CSS`(`src/report/style.ts`), `REPORT_SCRIPT`, `SCRIPT_IDS`, `SWAP_TARGETS`, `ClientData`, `ClientCard`(`src/report/script.ts`). 과제 6이 쓴다.

설계 13.1, 13.2, 13.4, 14, 「3단계 계획 전 결정」의 1번과 2번, 「3단계 2부 계획에서 보완」의 2·3·9·10번이다.

- 스타일은 확정 시안(`sheet-wide-v4`)과 3단계 시안 후보 가의 배치를 옮겼다. 지금 언어가 아닌 쪽(`data-l`)을 숨기는 규칙, `hidden` 속성이 단추의 `display`보다 앞서는 규칙, 표로 보기의 전환, 폭 1100·920·760의 배치, 움직임을 줄이는 설정이 있다. 바깥 자원(그림 주소, 글꼴, 다른 스타일 파일)을 부르지 않는다.
- 화면 안의 스크립트는 언어 바꾸기(문서의 `data-ui`와 `lang`, 단추의 눌림, `data-tr`이 붙은 요소의 정해 둔 속성), [정리하기]의 복사(성공하면 알림, 막히면 글상자를 골라 둔 채 보이고 초점을 옮긴다), 표로 보기, 달력의 말풍선, 공유 카드 1의 그리기(1200×630, 그리지 못하면 그 글을 보임)와 창을 닫으면 단추로 초점을 돌리는 것만 맡는다. 문장을 만들지 않고 화면에 이미 있는 두 언어의 글과 넘겨받은 자료를 쓴다.
- 언어를 바꾸면 떠 있는 복사 알림, 화면 읽기 프로그램용 알림 글(늦게 들어올 글까지), 달력의 말풍선을 닫는다. 지난 언어의 글이 남지 않게 한다(계획 리뷰 1차의 짝 Codex 1).
- 언어 단추 묶음은 잘라내기 없이 양 끝 단추에 둥근 모서리를 준다. 묶음이 잘라내면 단추의 키보드 초점 테두리가 가려진다(계획 리뷰 1차의 짝 Codex 2가 실제 화면에서 찾았다).
- 단추 하나에 복사 글상자는 하나다. 복사 요청이 겹쳐 늦게 거절돼도 글상자를 넣기 직전에 앞의 것을 지운다(계획 리뷰 2차의 짝 Codex 1).
- 스크립트는 템플릿 글자와 역슬래시를 쓰지 않는 글로 두고(`String.raw`), 찾는 요소의 id는 `SCRIPT_IDS`에서 끼운다. 이 과제의 시험은 문법, 네트워크를 부르는 이름이 없음(묶음 검사와 같은 규칙), 글을 HTML로 넣거나 코드로 돌리지 않음, 브라우저 저장소와 쿠키를 쓰지 않음, 찾는 요소가 정해 둔 것뿐임, 바꾸는 속성이 정해 둔 다섯뿐임을 본다. 스크립트를 실제로 돌려 동작을 보는 시험은 결과 화면 HTML이 생기는 과제 6에 있다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/report/script.test.ts`(새 파일):

```ts
// 결과 화면 안에서 도는 스크립트를 시험한다. 문법이 맞는지, 바깥으로 요청을 보내는 이름과 글을 HTML로 넣는 곳이 없는지, 찾는 요소가 정해 둔 것뿐인지 본다. 실제 동작은 브라우저에서 따로 본다(설계 13.2, 13.4, 14)
import { describe, expect, it } from "vitest";
import { bannedGlobals } from "../../scripts/bundle-scan.mjs";
import { REPORT_SCRIPT, SCRIPT_IDS, SWAP_TARGETS } from "../../src/report/script.ts";

describe("REPORT_SCRIPT", () => {
  it("문법이 맞다(실행하지 않고 읽기만 한다)", () => {
    expect(() => new Function(REPORT_SCRIPT)).not.toThrow();
  });

  it("바깥으로 요청을 보내는 이름이 없다(묶음 검사와 같은 규칙)", () => {
    expect(bannedGlobals(REPORT_SCRIPT)).toEqual([]);
  });

  it("글을 HTML로 넣거나 글을 코드로 돌리지 않는다", () => {
    for (const word of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "Function(", "setAttribute(\"on"]) expect(REPORT_SCRIPT, word).not.toContain(word);
  });

  it("브라우저 저장소와 쿠키를 쓰지 않는다", () => {
    for (const word of ["localStorage", "sessionStorage", "cookie", "indexedDB"]) expect(REPORT_SCRIPT, word).not.toContain(word);
  });

  it("찾는 요소는 SCRIPT_IDS에 정한 것뿐이고, 정한 것은 모두 쓴다", () => {
    const used = new Set([...REPORT_SCRIPT.matchAll(/(?:getElementById|imageFrom)\("([^"]+)"\)/g)].map((match) => match[1]));
    expect([...used].sort()).toEqual(Object.values(SCRIPT_IDS).sort());
  });

  it("언어를 바꿀 때 바꾸는 속성은 정해 둔 것뿐이다(on으로 시작하는 속성이나 주소를 바꾸지 않는다)", () => {
    expect(SWAP_TARGETS).toEqual(["text", "value", "aria-label", "alt", "title"]);
    expect(REPORT_SCRIPT).toContain(JSON.stringify(SWAP_TARGETS));
  });
});
```

`test/report/style.test.ts`(새 파일):

```ts
// 결과 화면의 스타일을 시험한다. 지금 언어가 아닌 쪽을 숨기는 규칙, hidden 속성이 이기는 규칙, 표로 보기의 전환, 움직임을 줄이는 설정, 바깥 자원이 없는지 본다(설계 13.2, 13.4)
import { describe, expect, it } from "vitest";
import { REPORT_CSS } from "../../src/report/style.ts";

describe("REPORT_CSS", () => {
  it("지금 언어가 아닌 쪽의 글을 숨긴다", () => {
    expect(REPORT_CSS).toContain('html[data-ui="en"] [data-l="ko"],html[data-ui="ko"] [data-l="en"]{display:none!important}');
  });

  it("hidden 속성이 단추와 그림의 display보다 앞선다", () => {
    expect(REPORT_CSS).toContain("[hidden]{display:none!important}");
  });

  it("표로 보기를 켜면 그림을 숨기고 표를 보이며, 단추의 글도 바뀐다", () => {
    expect(REPORT_CSS).toContain(".use.as-table .chart,.use:not(.as-table) .table,.use.as-table .when-chart,.use:not(.as-table) .when-table{display:none}");
  });

  it("바깥 자원(그림 주소, 글꼴, 다른 스타일 파일)을 부르지 않는다", () => {
    expect(REPORT_CSS).not.toMatch(/url\(|@import|@font-face/);
  });

  it("움직임은 줄이는 설정이 없을 때만 넣는다", () => {
    const motion = /@media \(prefers-reduced-motion:no-preference\)\{[^{}]*\{[^{}]*\}\}/;
    expect(REPORT_CSS).toMatch(motion);
    expect(REPORT_CSS.replace(motion, "")).not.toMatch(/transition|animation/);
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/report/script.test.ts test/report/style.test.ts`
Expected: FAIL. `test/report/style.test.ts`와 `test/report/script.test.ts`가 `../../src/report/style.ts`, `../../src/report/script.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/report/script.ts`(새 파일):

```ts
// 결과 화면 안에서 도는 스크립트. 언어 바꾸기, 붙여 넣을 말 복사, 표로 보기, 달력의 말풍선, 공유 카드 그리기만 맡는다. 화면의 글은 Node가 두 언어로 다 그려 두고 여기서는 보이는 언어와 정해 둔 속성만 바꾼다. 바깥으로 요청을 보내지 않고, 글은 textContent와 속성으로만 넣는다(설계 13.2, 13.4, 14, 「3단계 계획 전 결정」의 2번)
import type { Texts } from "../core/copy/lang.ts";

/** 스크립트가 찾는 요소의 id. 화면(html.ts)도 이 이름으로 그린다 */
export const SCRIPT_IDS = {
  /** 스크립트에 넘기는 자료(JSON) */
  data: "aq-data",
  /** 눈에 보이는 알림(화면 읽기 프로그램에는 숨긴다) */
  toast: "toast",
  /** 화면 읽기 프로그램에 알리는 자리 */
  live: "live",
  /** 공유 카드 창과 그 안의 그림, 내려받기, 그리지 못했다는 글, 닫기 */
  dialog: "card-dlg",
  cardImage: "card-img",
  cardLink: "card-dl",
  cardFail: "card-fail",
  cardClose: "card-close",
  /** 카드에 다시 그리는 화면의 장면과 얼굴 그림 */
  scene: "art-scene",
  face: "art-face",
} as const;

/** 언어를 바꿀 때 data-en-<이름>, data-ko-<이름>에서 옮기는 것. text는 글, value는 글상자의 값, 나머지는 같은 이름의 속성이다 */
export const SWAP_TARGETS = ["text", "value", "aria-label", "alt", "title"] as const;

/** 화면이 스크립트에 넘기는 자료. 글은 두 언어를 다 넣고 끼울 값은 미리 채운다 */
export interface ClientData {
  ui: { copied: Texts<string>; copyFail: Texts<string>; copyLabel: Texts<string> };
  /** 공유 카드. AQ를 내지 않았으면 null이고 카드 단추도 없다(설계 14) */
  card: ClientCard | null;
}

/** 공유 카드 1(명세서 꼴)에 그리는 것. 프로젝트·스킬·서버 이름과 경로는 넣지 않는다(설계 14) */
export interface ClientCard {
  aq: number;
  grade: string;
  /** 점검일(YYYY-MM-DD) */
  today: string;
  /** 내려받을 파일 이름 */
  file: string;
  brand: Texts<string>;
  title: Texts<string>;
  aqLabel: Texts<string>;
  gradeLabel: Texts<string>;
  /** 등급의 별명 */
  nick: Texts<string>;
  repo: Texts<string>;
  alt: Texts<string>;
  axes: { name: Texts<string>; score: number | null }[];
}

const ID = SCRIPT_IDS;

/** 결과 화면의 <script>에 그대로 넣는 글. 템플릿 글자와 역슬래시를 쓰지 않는다 */
export const REPORT_SCRIPT = String.raw`(() => {
"use strict";
const root = document.documentElement;
const dataNode = document.getElementById("${ID.data}");
const data = dataNode ? JSON.parse(dataNode.textContent || "{}") : {};
const ui = data.ui || {};
const card = data.card || null;
const SWAP = ${JSON.stringify(SWAP_TARGETS)};
const FONT = 'system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif';
const MONO = 'ui-monospace,"Cascadia Mono",Consolas,monospace';
const lang = () => (root.getAttribute("data-ui") === "en" ? "en" : "ko");
const pick = (texts) => (texts ? texts[lang()] || "" : "");

/* 알림. 눈에 보이는 알림과 화면 읽기 프로그램용 자리를 따로 둔다 */
const toast = document.getElementById("${ID.toast}");
const live = document.getElementById("${ID.live}");
let toastTimer = 0;
let liveTimer = 0;
const hideToast = () => {
  clearTimeout(toastTimer);
  if (toast) toast.style.display = "none";
};
const announce = (message) => {
  if (live) {
    clearTimeout(liveTimer);
    live.textContent = "";
    liveTimer = setTimeout(() => { live.textContent = message; }, 60);
  }
  if (toast) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.style.display = "block";
    toastTimer = setTimeout(hideToast, 2600);
  }
};

/* 언어 바꾸기. 다시 그리지 않으므로 펼친 항목과 초점이 그대로다. 떠 있는 알림과 말풍선은 지난 언어의 글이라 닫는다 */
const setLang = (next) => {
  if (next !== "en" && next !== "ko") return;
  hideToast();
  clearTimeout(liveTimer);
  if (live) live.textContent = "";
  document.querySelectorAll(".tip").forEach((tip) => { tip.style.display = "none"; });
  root.setAttribute("data-ui", next);
  root.setAttribute("lang", next);
  document.querySelectorAll("[data-set-lang]").forEach((button) => button.setAttribute("aria-pressed", String(button.getAttribute("data-set-lang") === next)));
  const prefix = "data-" + next + "-";
  document.querySelectorAll("[data-tr]").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (!attr.name.startsWith(prefix)) return;
      const target = attr.name.slice(prefix.length);
      if (!SWAP.includes(target)) return;
      if (target === "text") el.textContent = attr.value;
      else if (target === "value") el.value = attr.value;
      else el.setAttribute(target, attr.value);
    });
  });
};

/* 두 언어의 글을 담은 요소 */
const both = (texts, tag) => {
  const holder = document.createElement(tag);
  ["en", "ko"].forEach((code) => {
    const span = document.createElement("span");
    span.setAttribute("lang", code);
    span.setAttribute("data-l", code);
    span.textContent = texts ? texts[code] || "" : "";
    holder.appendChild(span);
  });
  return holder;
};

/* 붙여 넣을 말 복사. 막히면 글상자에 골라 놓고 보인다(설계 13.2). 단추 하나에 글상자는 하나다 */
let boxCount = 0;
const removeCopyBox = (button) => {
  const old = button.nextElementSibling;
  if (old && old.classList.contains("copybox")) old.remove();
};
const showCopyBox = (button, phrases) => {
  hideToast();
  /* 앞선 복사 요청이 늦게 거절돼도 글상자가 겹치지 않게 넣기 직전에 다시 지운다 */
  removeCopyBox(button);
  const box = document.createElement("div");
  box.className = "copybox";
  const note = both(ui.copyFail, "p");
  boxCount += 1;
  note.id = "copy-note-" + boxCount;
  const area = document.createElement("textarea");
  area.readOnly = true;
  area.rows = 2;
  area.setAttribute("data-tr", "");
  ["en", "ko"].forEach((code) => {
    area.setAttribute("data-" + code + "-value", phrases[code]);
    area.setAttribute("data-" + code + "-aria-label", ui.copyLabel ? ui.copyLabel[code] || "" : "");
  });
  area.value = phrases[lang()];
  area.setAttribute("aria-label", pick(ui.copyLabel));
  area.setAttribute("aria-describedby", note.id);
  box.appendChild(note);
  box.appendChild(area);
  button.insertAdjacentElement("afterend", box);
  area.focus();
  area.select();
};
const copy = (button) => {
  const phrases = { en: button.getAttribute("data-phrase-en") || "", ko: button.getAttribute("data-phrase-ko") || "" };
  removeCopyBox(button);
  const clip = navigator.clipboard;
  if (!clip || !window.isSecureContext) {
    showCopyBox(button, phrases);
    return;
  }
  clip.writeText(phrases[lang()]).then(() => announce(pick(ui.copied)), () => showCopyBox(button, phrases));
};

/* 표로 보기와 그림으로 보기 */
const toggleTable = (button) => {
  const section = button.closest(".use");
  if (section) section.classList.toggle("as-table");
};

/* 달력의 말풍선(마우스). 키보드와 화면 읽기 프로그램은 표로 보기를 쓴다 */
const isCell = (node) => node instanceof Element && node.closest("[data-tip-en]") !== null;
document.addEventListener("mouseover", (event) => {
  if (!isCell(event.target)) return;
  const cell = event.target.closest("[data-tip-en]");
  const wrap = cell.closest(".heatwrap");
  const tip = wrap ? wrap.querySelector(".tip") : null;
  if (!tip) return;
  const box = cell.getBoundingClientRect();
  const frame = wrap.getBoundingClientRect();
  tip.textContent = cell.getAttribute("data-tip-" + lang()) || "";
  tip.style.left = box.left - frame.left + box.width / 2 + "px";
  tip.style.top = box.top - frame.top + "px";
  tip.style.display = "block";
});
document.addEventListener("mouseout", (event) => {
  if (!isCell(event.target) || isCell(event.relatedTarget)) return;
  const wrap = event.target.closest(".heatwrap");
  const tip = wrap ? wrap.querySelector(".tip") : null;
  if (tip) tip.style.display = "none";
});

/* 공유 카드 1(명세서 꼴). 브라우저 안에서 1200x630 PNG를 그린다(설계 14) */
const dialog = document.getElementById("${ID.dialog}");
let opener = null;
const imageFrom = (id) => new Promise((resolve) => {
  const source = document.getElementById(id);
  const src = source ? source.getAttribute("src") : null;
  if (!src) {
    resolve(null);
    return;
  }
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});
const roundRect = (g, x, y, w, h, r) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};
const drawCard = async () => {
  const [scene, face] = await Promise.all([imageFrom("${ID.scene}"), imageFrom("${ID.face}")]);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas");
  const ink = "#0b0b0b";
  const ink2 = "#52514e";
  const navy = "#2e3566";
  g.fillStyle = "#fcfcfb";
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = "#3ab4aa";
  g.fillRect(0, 0, 1200, 12);
  g.save();
  g.beginPath();
  g.arc(82, 62, 22, 0, Math.PI * 2);
  g.clip();
  if (face) g.drawImage(face, 60, 40, 44, 44);
  else {
    g.fillStyle = "#f3f2ee";
    g.fillRect(60, 40, 44, 44);
  }
  g.restore();
  g.textAlign = "left";
  g.fillStyle = ink2;
  g.font = "800 20px " + FONT;
  g.fillText(pick(card.brand), 118, 62, 560);
  g.fillStyle = ink;
  g.font = "800 26px " + FONT;
  g.fillText(pick(card.title), 118, 90, 560);
  g.save();
  roundRect(g, 60, 130, 400, 400, 28);
  g.clip();
  if (scene) g.drawImage(scene, 60, 130, 400, 400);
  else {
    g.fillStyle = "#f3f2ee";
    g.fillRect(60, 130, 400, 400);
  }
  g.restore();
  g.fillStyle = ink;
  g.font = "800 210px " + FONT;
  g.fillText(String(card.aq), 500, 330, 400);
  g.fillStyle = ink2;
  g.font = "700 20px " + FONT;
  g.fillText(pick(card.aqLabel), 508, 366, 400);
  g.save();
  g.translate(1010, 220);
  g.rotate((-13 * Math.PI) / 180);
  g.strokeStyle = navy;
  g.fillStyle = "rgba(252,252,251,.8)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(0, 0, 78, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, 70, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = navy;
  g.textAlign = "center";
  g.font = "800 70px " + FONT;
  g.fillText(card.grade, 0, 22, 120);
  g.font = "800 12px " + FONT;
  g.fillText(pick(card.gradeLabel), 0, 48, 110);
  g.restore();
  g.textAlign = "left";
  g.fillStyle = ink;
  g.font = "800 34px " + FONT;
  g.fillText(pick(card.nick), 508, 412, 632);
  card.axes.forEach((axis, index) => {
    const y = 456 + index * 34;
    g.textAlign = "left";
    g.fillStyle = ink;
    g.font = "700 22px " + FONT;
    g.fillText(pick(axis.name), 508, y + 9, 140);
    g.fillStyle = "#cde2fb";
    roundRect(g, 658, y - 4, 340, 14, 7);
    g.fill();
    if (axis.score !== null && axis.score > 0) {
      g.fillStyle = "#2a78d6";
      roundRect(g, 658, y - 4, Math.max(14, (340 * axis.score) / 100), 14, 7);
      g.fill();
    }
    g.textAlign = "right";
    g.fillStyle = ink;
    g.font = "700 24px " + MONO;
    g.fillText(axis.score === null ? "—" : String(axis.score), 1058, y + 10);
  });
  g.fillStyle = ink2;
  g.font = "700 20px " + MONO;
  g.textAlign = "left";
  g.fillText(card.today, 60, 600);
  g.textAlign = "right";
  g.fillText(pick(card.repo), 1140, 600);
  return canvas;
};
const openCard = (button) => {
  if (!card || !dialog) return;
  const image = document.getElementById("${ID.cardImage}");
  const link = document.getElementById("${ID.cardLink}");
  const fail = document.getElementById("${ID.cardFail}");
  if (!image || !link || !fail) return;
  opener = button;
  image.hidden = true;
  link.hidden = true;
  fail.hidden = true;
  dialog.showModal();
  drawCard()
    .then((canvas) => {
      const url = canvas.toDataURL("image/png");
      image.src = url;
      image.alt = pick(card.alt);
      image.hidden = false;
      link.href = url;
      link.download = card.file;
      link.hidden = false;
    })
    .catch(() => {
      fail.hidden = false;
    });
};
if (dialog) {
  const close = document.getElementById("${ID.cardClose}");
  if (close) close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (opener) opener.focus();
  });
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const langButton = target.closest("[data-set-lang]");
  if (langButton) {
    setLang(langButton.getAttribute("data-set-lang"));
    return;
  }
  const action = target.closest("[data-act]");
  if (!action) return;
  const kind = action.getAttribute("data-act");
  if (kind === "copy") copy(action);
  else if (kind === "table") toggleTable(action);
  else if (kind === "card") openCard(action);
});
})();`;
```

`src/report/style.ts`(새 파일):

```ts
// 결과 화면의 스타일. 확정 시안(sheet-wide-v4)과 3단계 시안 후보 가의 배치를 옮겼다. 두 언어를 함께 그리고 지금 언어가 아닌 쪽을 숨긴다(설계 13.1, 13.2, 13.4, 「3단계 계획 전 결정」의 1번)
export const REPORT_CSS = `
:root{--font:system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;--mono:ui-monospace,"Cascadia Mono",Consolas,monospace;--paper:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--mute:#898781;--hair:#e1e0d9;--wash:#f3f2ee;--track:#cde2fb;--fill:#2a78d6;--stamp:#2e3566;--up:#006300;--teal:#3ab4aa;--navy:#2e3566}
*{box-sizing:border-box}
html[data-ui="en"] [data-l="ko"],html[data-ui="ko"] [data-l="en"]{display:none!important}
[hidden]{display:none!important}
html{scroll-padding-top:12px}
body{margin:0;font-family:var(--font);font-size:16px;line-height:1.5;background:#dedcd5;color:var(--ink);word-break:keep-all;overflow-wrap:anywhere}
button{font:inherit;cursor:pointer;color:inherit}
a{color:inherit}
button:focus-visible,summary:focus-visible,a:focus-visible,[tabindex]:focus-visible,textarea:focus-visible{outline:3px solid #2a78d6;outline-offset:2px;border-radius:4px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100% - 32px));padding:10px 16px;border-radius:8px;background:#0b0b0b;color:#fff;font-size:14px;display:none;z-index:40}
.sheet{max-width:1240px;margin:32px auto 80px;background:var(--paper);padding:40px 52px 30px;position:relative;box-shadow:0 1px 0 rgba(11,11,11,.05),0 18px 44px rgba(11,11,11,.12)}
.sheet::before{content:"";position:absolute;inset:0 0 auto 0;height:10px;background:var(--teal)}
.sheet::after{content:"";position:absolute;left:0;right:0;bottom:-11px;height:12px;background:radial-gradient(circle at 12px -1px,var(--paper) 11px,transparent 12px) repeat-x;background-size:24px 12px}
.hd{display:grid;grid-template-columns:1fr auto;gap:16px 24px;align-items:end;padding-bottom:18px;border-bottom:2px solid var(--ink)}
.brandrow{display:flex;align-items:center;gap:10px}
.brandrow img,.brandrow .noart{width:32px;height:32px;border-radius:50%;display:block;flex:none}
.brandrow .noart{background:var(--wash);border:1px solid var(--hair)}
.brand{font-weight:800;letter-spacing:.14em;font-size:12px;text-transform:uppercase;color:var(--ink2)}
.title{font-size:32px;font-weight:800;letter-spacing:-.02em;margin:2px 0 0;line-height:1.15}
.hdr{display:grid;gap:10px;justify-items:end}
.langsw{display:inline-flex;border:1px solid var(--ink);border-radius:8px}
.langsw button{min-height:44px;min-width:44px;padding:0 14px;border:0;border-radius:0;background:var(--paper);font-size:14px;color:var(--ink2)}
.langsw button:first-child{border-radius:7px 0 0 7px}
.langsw button:last-child{border-radius:0 7px 7px 0}
.langsw button+button{border-left:1px solid var(--ink)}
.langsw button[aria-pressed="true"]{background:var(--ink);color:#fff;font-weight:700}
.langsw button:focus-visible{position:relative;z-index:1}
.info{display:grid;grid-auto-flow:column;gap:0;margin:0;border:1px solid var(--ink);border-radius:2px}
.info div{padding:7px 16px;border-left:1px solid var(--ink)}
.info div:first-child{border-left:0}
.info dt{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2)}
.info dd{margin:0;font-family:var(--mono);font-size:13px;font-weight:700;white-space:nowrap}
.hero{display:grid;grid-template-columns:264px 330px 1fr;gap:26px 40px;align-items:center;padding:28px 0 26px}
.scene{margin:0}
.scene .pic{width:264px;height:264px;border-radius:20px;overflow:hidden}
.scene img{width:100%;height:100%;object-fit:cover;display:block}
.scene .ph{width:100%;height:100%;display:grid;place-items:center;text-align:center;padding:20px;border:2px dashed var(--mute);border-radius:20px;background:repeating-linear-gradient(135deg,#f3f2ee 0 10px,#ecebe5 10px 20px);color:var(--ink2);font-size:14px;font-weight:700}
.scene figcaption{margin-top:8px;font-size:13px;font-weight:700;color:var(--ink2);text-align:center;line-height:1.4}
.score{position:relative;height:170px}
.score .n{font-size:176px;line-height:.86;font-weight:800;letter-spacing:-.06em}
.score .n.none{color:var(--ink2);font-size:52px;letter-spacing:-.02em;line-height:1.1;padding-top:44px}
.score .lb{position:absolute;left:4px;bottom:-6px;font-size:12px;font-weight:700;letter-spacing:.14em;color:var(--ink2)}
.stamp{position:absolute;right:0;top:-2px;width:124px;height:124px;border-radius:50%;border:3px solid var(--stamp);color:var(--stamp);display:grid;place-items:center;text-align:center;transform:rotate(-13deg);font-weight:800;background:rgba(252,252,251,.72)}
.stamp::before{content:"";position:absolute;inset:6px;border:1px solid var(--stamp);border-radius:50%}
.stamp b{display:block;font-size:58px;line-height:1}
.stamp em{font-style:normal;font-size:10px;letter-spacing:.2em}
.axes{display:grid;gap:12px}
.ax{display:grid;grid-template-columns:112px 1fr 48px;gap:16px;align-items:center}
.ax .nm{font-size:15px;font-weight:700;line-height:1.25}
.ax .tr{height:12px;border-radius:6px;background:var(--track);position:relative;overflow:hidden}
.ax .tr.none{background:repeating-linear-gradient(135deg,#ecebe5 0 6px,#f6f5f1 6px 12px)}
.ax .tr i{position:absolute;inset:0 auto 0 0;border-radius:0 4px 4px 0;background:var(--fill)}
.ax .v{font-family:var(--mono);font-size:20px;font-weight:700;text-align:right}
.ax .v.none{font-size:12px;font-family:var(--font);color:var(--ink2);line-height:1.2}
.ax .ct{display:block;font-size:12px;font-weight:400;color:var(--ink2);white-space:nowrap}
.ax .ct b{color:var(--ink)}
.verdict{grid-column:1/-1;display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:32px;align-items:start;border-top:1px dashed var(--mute);padding-top:20px}
.verdict h2{margin:0 0 4px;font-size:12px;letter-spacing:.14em;color:var(--ink2);font-weight:700}
.verdict p{margin:0;font-size:17px;line-height:1.5;font-weight:700;letter-spacing:-.01em}
.verdict .pt{display:grid;grid-template-columns:20px 1fr;gap:8px;align-items:start;font-size:14px;line-height:1.45}
.verdict .pt b{display:block;font-size:12px;letter-spacing:.04em;color:var(--ink2);font-weight:700}
.verdict .pt svg{margin-top:2px}
.withheld{grid-column:2/-1;margin:0;font-size:14px;color:var(--ink2)}
h2{font-size:14px;letter-spacing:.06em;text-transform:uppercase;margin:0;color:var(--ink);font-weight:800}
h2 .no{font-family:var(--mono);color:var(--ink2);margin-right:10px;font-weight:700}
h2 .cnt{font-family:var(--mono);margin-left:10px;color:var(--ink2);font-weight:700}
.cols{display:grid;grid-template-columns:1fr 1fr;border-top:1px dashed var(--mute)}
.col{padding:22px 0 8px;min-width:0}
.col:first-child{padding-right:36px;border-right:1px dashed var(--mute)}
.col:last-child{padding-left:36px}
.col>h2{display:flex;align-items:center;padding-bottom:6px;min-height:62px}
.stk{width:56px;height:56px;border-radius:50%;flex:none;margin-left:auto;display:block;object-fit:cover}
.it{display:grid;grid-template-columns:108px minmax(0,1fr);gap:18px;padding:16px 0;border-top:1px solid var(--hair);scroll-margin-top:16px}
.col>.it:first-of-type,.lists .it:first-of-type{border-top:0}
.fig{font-family:var(--mono);font-weight:700;font-size:30px;line-height:1.1;letter-spacing:-.03em;overflow-wrap:normal}
.good .fig{color:var(--up)}
.fig small{display:block;font-family:var(--font);font-size:12px;font-weight:700;letter-spacing:.01em;color:var(--ink2);margin-top:3px;line-height:1.3}
.fig .u{display:block;font-family:var(--font);font-size:13px;font-weight:700;letter-spacing:0;color:var(--ink);margin-top:2px}
.fig.lg{font-size:26px}
.fig.nv{font-family:var(--font);font-size:16px;letter-spacing:0;line-height:1.3;color:var(--ink)}
.sev{display:inline-flex;align-items:flex-start;gap:6px;font-size:12px;font-weight:700;line-height:18px;margin-top:8px}
.sev svg{flex:none}
.it h3{margin:0;font-size:17px;line-height:1.35;letter-spacing:-.01em}
.it .top{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;align-items:baseline}
.it .top h3{flex:1 1 12em;min-width:0}
.it .top .tags{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;justify-content:flex-end}
.it p{margin:4px 0 0;font-size:14px;color:var(--ink2)}
.it p.fix{color:var(--ink)}
.tag{font-size:12px;font-weight:700;white-space:nowrap;color:var(--ink2)}
.tag.up{font-family:var(--mono);color:var(--up)}
.chips{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px;font-size:12px}
.chips li{font-family:var(--mono);padding:2px 8px;border:1px solid var(--hair);border-radius:12px;background:#fff}
.chips li.k{font-family:var(--font);font-weight:700;color:var(--ink2);border:0;background:none;padding:2px 0}
.chips li small{font-family:var(--font);color:var(--ink2);margin-left:4px}
details{margin-top:2px}
summary{font-size:13px;color:var(--ink2);cursor:pointer;width:max-content;max-width:100%;min-height:44px;padding:12px 0;line-height:20px}
.how p{font-size:13px;background:var(--wash);border-radius:4px;padding:8px 10px;margin-top:4px;color:var(--ink)}
.how p.ln{font-size:12.5px;font-variant-numeric:tabular-nums}
.act{margin-top:10px;min-height:44px;padding:0 14px;border-radius:6px;border:1px solid var(--ink);background:var(--paper);font-size:14px;font-weight:700}
.copybox{margin-top:8px;display:grid;gap:4px;font-size:13px;color:var(--ink)}
.copybox textarea{font-family:var(--mono);font-size:13px;padding:8px;border:1px solid var(--ink);border-radius:4px;resize:vertical;min-height:44px;width:100%}
.names{margin:4px 0 0;padding:0;list-style:none;display:grid;gap:6px}
.names li{font-size:12px;color:var(--ink)}
.names li>b{display:block;font-weight:700;color:var(--ink2);margin-bottom:2px}
.names code{font-family:var(--mono);font-size:12px;background:#fff;border:1px solid var(--hair);border-radius:10px;padding:1px 7px;margin:0 4px 2px 0;display:inline-block}
.names .when{display:block;margin:2px 0 4px;color:var(--ink2)}
.names pre{margin:4px 0;padding:6px 8px;background:#fff;border:1px solid var(--hair);border-radius:4px;font-family:var(--mono);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.lists{border-top:1px dashed var(--mute);padding:6px 0 10px;display:grid;grid-template-columns:1fr 1fr;gap:0 36px}
.lists>details{margin:0;padding:12px 0;min-width:0}
.lists>details>summary{font-size:14px;font-weight:800;color:var(--ink);letter-spacing:.04em}
.lists>details>summary .cnt{font-family:var(--mono);color:var(--ink2)}
.empty{font-size:14px;color:var(--ink2);margin:6px 0 0}
.use{border-top:1px dashed var(--mute);padding:22px 0 20px}
.usehd{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.use.as-table .chart,.use:not(.as-table) .table,.use.as-table .when-chart,.use:not(.as-table) .when-table{display:none}
.grid2{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:48px;margin-top:22px;align-items:start}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px;border:1px solid var(--hair);border-radius:4px}
.kpi{padding:14px 18px;border-left:1px solid var(--hair)}
.kpi:first-child{border-left:0}
.kpi b{display:block;font-size:30px;letter-spacing:-.03em;line-height:1.15;white-space:nowrap}
.kpi span{font-size:12px;color:var(--ink2)}
.sub{font-size:12px;font-weight:700;color:var(--ink2);margin:0 0 8px}
.mini-btn{min-height:44px;padding:0 10px;border:1px solid var(--hair);border-radius:6px;background:#fff;font-size:12px;font-weight:700;color:var(--ink)}
.heat{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.heat span{aspect-ratio:1;border-radius:3px}
.heat .wd{aspect-ratio:auto;font-size:11px;color:var(--ink2);text-align:center}
.heat .pad{visibility:hidden}
.heat .unused{background:#fff;box-shadow:inset 0 0 0 1px var(--hair)}
.heat .unseen{background:repeating-linear-gradient(135deg,#d9d7cf 0 2px,#fff 2px 5px)}
.heatwrap{position:relative}
.tip{position:absolute;z-index:5;pointer-events:none;padding:4px 8px;border-radius:6px;font-size:12px;white-space:nowrap;background:#0b0b0b;color:#fff;transform:translate(-50%,-130%);display:none}
.legend{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12px;margin-top:8px;color:var(--ink2)}
.legend .ramp{display:inline-flex;gap:3px;align-items:center}
.legend i{width:11px;height:11px;border-radius:3px;display:inline-block}
.legend .k{display:inline-flex;gap:5px;align-items:center}
table.tv{border-collapse:collapse;font-size:12px;width:100%}
table.tv th,table.tv td{border-bottom:1px solid var(--hair);padding:4px 6px;text-align:left}
table.tv td.n{font-family:var(--mono);text-align:right}
.tvwrap{max-height:280px;overflow:auto;border:1px solid var(--hair);border-radius:4px}
.tools{display:grid;gap:14px}
.tools .t{display:grid;grid-template-columns:1fr auto;font-size:14px;gap:4px 12px}
.tools .t>b{font-family:var(--mono)}
.splitbar{grid-column:1/-1;display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;background:var(--track)}
.splitbar i{display:block;height:100%}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.tools small{font-size:12px;color:var(--ink2)}
.shell{margin:16px 0 0;font-size:13px;color:var(--ink2)}
.notices{border-top:1px dashed var(--mute);padding:18px 0 16px}
.notices ul{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:8px}
.notices li{display:grid;grid-template-columns:20px 1fr;gap:8px;font-size:14px;color:var(--ink)}
.ft{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px 24px;border-top:2px solid var(--ink);padding-top:16px;font-size:13px;color:var(--ink2)}
.ft .lock{display:grid;grid-template-columns:16px 1fr;gap:8px;align-items:start}
.ft .lock svg{margin-top:2px}
.ft .names-note{grid-column:1/-1;margin:0;font-size:13px;color:var(--ink)}
.share{min-height:44px;padding:0 20px;border-radius:6px;border:0;background:var(--ink);color:#fff;font-size:14px;font-weight:700}
dialog.card{width:min(1040px,calc(100% - 24px));max-height:calc(100% - 24px);border:0;border-radius:10px;padding:20px;background:var(--paper)}
dialog.card::backdrop{background:rgba(11,11,11,.55)}
dialog.card h2{font-size:16px;text-transform:none;letter-spacing:0;margin:0 0 12px}
.cardimg{display:block;width:100%;height:auto;border:1px solid var(--hair);border-radius:6px;background:#fff}
.cardft{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--ink2)}
.cardft .btns{display:flex;gap:8px}
.cardft a,.cardft button{min-height:44px;display:inline-flex;align-items:center;padding:0 16px;border-radius:6px;font-size:14px;font-weight:700;text-decoration:none}
.cardft a{background:var(--ink);color:#fff}
.cardft button{border:1px solid var(--ink);background:var(--paper)}
@media (max-width:1100px){
.sheet{padding:32px 28px 24px}
.hero{grid-template-columns:208px 300px 1fr;gap:22px 28px}
.scene .pic{width:208px;height:208px}
.score{height:146px}.score .n{font-size:150px}
.stamp{width:104px;height:104px}.stamp b{font-size:48px}
.verdict{gap:22px}
.grid2{gap:32px}
}
@media (max-width:920px){
.hero{grid-template-columns:208px 1fr}.axes{grid-column:1/-1}.score{max-width:300px}
.withheld{grid-column:1/-1}
.kpis{grid-template-columns:1fr 1fr}.kpi:nth-child(odd){border-left:0}.kpi:nth-child(n+3){border-top:1px solid var(--hair)}
.grid2{grid-template-columns:1fr}
}
@media (max-width:760px){
.scene{justify-self:center}.verdict{grid-template-columns:1fr;gap:14px}
.sheet{margin:0 0 40px;padding:28px 18px 22px}
.hd{grid-template-columns:1fr}.hdr{justify-items:start}
.info{grid-auto-flow:row;grid-template-columns:1fr 1fr}.info div:nth-child(odd){border-left:0}.info div:nth-child(n+3){border-top:1px solid var(--ink)}
.title{font-size:26px}
.hero{grid-template-columns:1fr}.score{height:150px;max-width:330px}.score .n{font-size:150px}
.ax{grid-template-columns:100px 1fr 44px;gap:12px}
.kpi b{font-size:24px}
.cols,.lists{grid-template-columns:1fr}.col:first-child{padding-right:0;border-right:0;border-bottom:1px dashed var(--mute)}.col:last-child{padding-left:0}
.it{grid-template-columns:84px minmax(0,1fr);gap:12px}.fig{font-size:24px}.fig.lg{font-size:21px}
.it .top{flex-direction:column;gap:2px}.it .top h3{flex:none}.it .top .tags{justify-content:flex-start}
.ft{grid-template-columns:1fr}.share{width:100%}
}
@media (prefers-reduced-motion:no-preference){.ax .tr i{transition:width .5s ease-out}}
`;
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/report/style.test.ts test/report/script.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 2개, 시험 11개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/report/script.test.ts test/report/style.test.ts src/report/script.ts src/report/style.ts
git commit -m "feat: 결과 화면의 스타일과 화면 스크립트를 더함"
```

---

### Task 6: 결과 화면 HTML 한 파일

**Files:**
- Create: `src/report/html.ts`
- Modify: `src/core/result/summary.ts`
- Modify: `src/report/assets.ts`
- Modify: `src/report/copy.ts`
- Modify: `src/report/style.ts`
- Test: `test/helpers/fake-dom.ts`
- Test: `test/report/html.test.ts`
- Test: `test/report/script-run.test.ts`

**Interfaces:**
- Consumes: 과제 1의 `sceneFor`와 `ReportArt`, 과제 2의 `ReportView`와 `reportView`, 과제 3의 고정 글, 과제 4의 서식, 과제 5의 `REPORT_CSS`, `REPORT_SCRIPT`, `SCRIPT_IDS`, `ClientData`, 4부의 `AXIS_NAMES`, `SUMMARY_COPY`, `TOOL_NAMES`, `UNJUDGED_COPY`, `joinValue`, `fill`, `groupDigits`, 1부의 요약 `fixDetail`(`src/core/result/summary.ts`, 이 과제가 내보낸다).
- Produces: `reportHtml(view, art): string`, `esc(value)`(`src/report/html.ts`), `SceneName`(`src/report/assets.ts`), `REPORT_COPY.cardFail`, 내보낸 `fixDetail`, 시험 전용 `parseHtml`, `runScript`, `settle`(`test/helpers/fake-dom.ts`). 과제 7이 `reportHtml`을 쓴다.

설계 9.8, 13, 14, 19.1, 20.1, 「3단계 계획 전 결정」의 1·2·3·5·6·10·12번, 「3단계 2부 계획에서 보완」의 2·3·6·8·9·11번이다.

- 「일부만 읽었다」 띠는 머리 아래, 점수 띠 위에 둔다. 도구마다 한 줄이고, 아래 경계이면 "적어도", 비율을 낼 수 없으면 숫자 없이 적는다. 평가 결과에서 실제로 띠가 나오는 경우(파일 3개 가운데 1개를 읽지 못함)와 세 문장을 시험이 본다(계획 리뷰 2차의 짝 Codex 1이 찾은 빠짐).

- 두 언어의 글을 언어 표시가 붙은 짝(`<span lang data-l>`)으로 모두 그리고, 언어마다 모양이 다른 요소(큰 숫자 자리, 어떻게 쟀나, 도구별 나눔)는 언어마다 따로 그린다. 시험이 두 언어의 칸 수가 같은지 본다. 언어를 바꿀 때 옮길 속성은 처음 언어의 값으로 채워 두고 두 언어의 값을 함께 둔다(스크립트가 돌지 않아도 처음 언어로 읽힌다).
- CSP는 `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-<스크립트의 해시>'; base-uri 'none'; form-action 'none'`이다. 스크립트는 둘(실행하지 않는 JSON 자료와 해시가 맞는 본문)뿐이고, 주소(`http`), 링크, 틀(iframe, object, embed)이 없다.
- 큰 숫자 자리는 규칙을 못 쟀으면 "잴 수 없음"과 이유의 낱말, 쟀으면 잰 값과 단위다(예상 효과만 없으면 잰 값 그대로). AQ를 내지 않았으면 예상 효과 꼬리표, 먼저 고칠 것, 카드 단추, 카드 창과 카드 자료가 없고, 장면 아래 글이 AQ를 내지 않은 까닭이다(그 글을 다른 자리에 또 쓰지 않는다). 시험이 정비 항목에 예상 효과를 억지로 넣어도 꼬리표가 없는 것을 본다. 카드 단추와 창은 카드 자료(AQ와 등급)가 있을 때만 둔다.
- 바깥에서 오는 글이 들어가는 자리마다(정리할 것, 서버와 그 프로젝트, claude.ai 연결, S3 위치, F3·F4 프로젝트, 규칙 문장과 어떻게 쟀나, E6 정보 줄, 알림, 별명과 진단) 표시가 다른 공격 글을 넣어, 그 자리가 그려졌는지와 HTML로 풀리지 않았는지, JSON 자료가 `</script>`로 끊기지 않고 원래 글로 읽히는지를 시험이 본다(계획 리뷰 1차에서 두 짝이 찾은 빈틈).
- 화면 안의 스크립트는 시험 전용 문서 대역(`test/helpers/fake-dom.ts`. 이 저장소가 만드는 HTML을 읽고 스크립트가 쓰는 만큼의 요소, 사건, 그림, 캔버스만 흉내 낸다) 위에서 실제로 만든 결과 화면에 돌린다. 언어 바꾸기(문서 언어, 단추의 눌림, 옮길 속성 전부, 정해 둔 다섯 밖은 옮기지 않음, 펼친 항목), 복사가 막힐 때와 거절될 때의 글상자(골라 둠, 초점, 언어를 바꾸면 말이 바뀜, 하나만, 겹친 요청이 늦게 거절돼도 하나), 복사 성공 알림과 언어를 바꿀 때 닫기, 표로 보기, 말풍선, 카드(모달로 열려 초점이 닫기 단추로 감, 점수·등급·점검일을 실제로 그림, 1200×630, 내려받기 이름, 창을 닫으면 초점이 돌아옴, 그림이 없을 때, 그리지 못할 때), AQ가 없는 화면을 본다. 대역의 캔버스는 화면 스크립트가 쓰는 그리기 함수와 속성만 주고 봉해 두어, 없는 함수를 부르거나 없는 속성을 넣으면 실제 브라우저처럼 오류가 난다. 속성 값(글꼴, 색, 정렬, 선 굵기)은 화면 스크립트가 쓰는 꼴만 받고 그 밖은 브라우저처럼 무시하되 기록해 두며, 시험이 카드를 그리는 동안 무시된 값이 하나도 없는지 본다. 글꼴은 굵기, px 크기, 쉼표로 이은 글꼴 이름 목록이 끝까지 그 꼴일 때만 받는다. 글을 그릴 때의 글꼴도 남겨 큰 AQ 숫자, 등급, 별명이 정한 크기로 그려졌는지 본다(계획 리뷰 3·4차에서 두 짝이 찾은 빈틈). 대역은 닫을 때 브라우저가 초점을 되돌리는 것과 close 사건의 늦은 시점을 흉내 내지 않고, 읽지 못하는 글을 만나면 그 자리를 알리고 멈춘다. 연습 작업 폴더에서 그럴듯한 틀린 구현 38개(이름을 바꾸는 곳 하나씩 뺌, JSON 보호 뺌, 언어 표시·속성·목록 확인 뺌, 글상자·초점·알림 닫기·말풍선 닫기·표 전환·카드 크기·초점 돌리기·못 그림 알림 뺌, 장면 아래 까닭 뺌, 등급 없는 카드 단추, 모달 없이 엶, 캔버스 함수 이름 오타, 늦은 거절의 글상자 겹침, 띠 없음, 아래 경계의 "적어도" 뺌, 띠 자료를 모든 도구로, 카드 큰 숫자 글꼴의 px 뺌, 띠 문장에서 「적어도」 뺌, 등급·이름표·기준 이름 글꼴의 px 뺌, 색 오타, 정렬 오타, 선 굵기를 글로, 글꼴 크기 뒤에 빗금, 글꼴 이름을 숫자로)를 하나씩 넣어 모두 실패하는 것을 확인했다(계획 리뷰 1~4차에서 두 짝이 찾은 빈틈).
- 판정에서 뺀 서버는 까닭마다 이름(프로젝트 범위면 폴더 이름을 곁에)을 적고, 지켜보는 중이면 "다른 조건이 같으면 N일 뒤의 점검부터 판정할 수 있습니다", 날을 모르면 정하지 못했다고 적는다. claude.ai 연결은 `deniedMcpServers`에 더할 항목을 JSON 목록으로 보인다. S3의 위치, F3과 F4의 프로젝트는 이름 칩이다.
- 그림을 읽지 못하면 장면 자리에 대체 글을 그리고 카드가 쓸 그림 요소를 두지 않는다. 카드 자료에는 점수, 등급, 별명, 기준, 점검일, 고정 글만 싣고 JSON의 `<`를 `\u003c`로 적는다.
- 연습 작업 폴더의 화면 확인에서 고친 것이 이 과제에 들었다. 영어의 "Not measured"가 기준 값 칸에서 글자 중간에 끊겨 칸을 64px로 넓히고 낱말로만 끊었다. 정보 표의 낱말 값(찾지 못함, 저장 안 함)은 고정폭 글꼴에서 한글 사이가 벌어져 본문 글꼴로 썼다. 두 언어의 짝이 든 숫자 칸의 글자가 작아지지 않게 자손 선택자를 바로 아래로 좁혔다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/helpers/fake-dom.ts`(새 파일):

```ts
// 결과 화면 HTML을 읽어 화면 안의 스크립트를 Node에서 돌려 보는 작은 문서 대역. 이 저장소가 만드는 HTML과 그 스크립트가 쓰는 만큼의 요소, 속성, 사건, 그림, 캔버스만 흉내 낸다(시험 전용)
const VOID = new Set(["meta", "img", "link", "br", "hr", "input"]);
const RAW = new Set(["script", "style"]);
const decode = (text: string): string => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

type Listener = (event: FakeEvent) => void;
export interface FakeEvent {
  type: string;
  target: FakeElement;
  relatedTarget: FakeElement | null;
}

class FakeText {
  constructor(public text: string) {}
}

export class FakeElement {
  attributes: { name: string; value: string }[] = [];
  childNodes: (FakeElement | FakeText)[] = [];
  parent: FakeElement | null = null;
  style: Record<string, string> = {};
  value = "";
  readOnly = false;
  rows = 0;
  open = false;
  selected = false;
  listeners = new Map<string, Listener[]>();
  constructor(
    public tagName: string,
    public ownerDocument: FakeDocument,
  ) {}

  getAttribute(name: string): string | null {
    return this.attributes.find((attr) => attr.name === name)?.value ?? null;
  }
  setAttribute(name: string, value: string): void {
    const found = this.attributes.find((attr) => attr.name === name);
    if (found) found.value = String(value);
    else this.attributes.push({ name, value: String(value) });
  }
  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }
  removeAttribute(name: string): void {
    this.attributes = this.attributes.filter((attr) => attr.name !== name);
  }
  get id(): string {
    return this.getAttribute("id") ?? "";
  }
  set id(value: string) {
    this.setAttribute("id", value);
  }
  set className(value: string) {
    this.setAttribute("class", value);
  }
  get classList() {
    const list = () => (this.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    return {
      contains: (name: string) => list().includes(name),
      toggle: (name: string) => {
        const has = list().includes(name);
        this.setAttribute("class", (has ? list().filter((item) => item !== name) : [...list(), name]).join(" "));
        return !has;
      },
    };
  }
  get hidden(): boolean {
    return this.hasAttribute("hidden");
  }
  set hidden(value: boolean) {
    if (value) this.setAttribute("hidden", "");
    else this.removeAttribute("hidden");
  }
  get src(): string {
    return this.getAttribute("src") ?? "";
  }
  set src(value: string) {
    this.setAttribute("src", value);
  }
  get alt(): string {
    return this.getAttribute("alt") ?? "";
  }
  set alt(value: string) {
    this.setAttribute("alt", value);
  }
  get href(): string {
    return this.getAttribute("href") ?? "";
  }
  set href(value: string) {
    this.setAttribute("href", value);
  }
  get download(): string {
    return this.getAttribute("download") ?? "";
  }
  set download(value: string) {
    this.setAttribute("download", value);
  }
  get textContent(): string {
    return this.childNodes.map((node) => (node instanceof FakeText ? node.text : node.textContent)).join("");
  }
  set textContent(value: string) {
    this.childNodes = value === "" ? [] : [new FakeText(String(value))];
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement);
  }
  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parent = this;
    this.childNodes.push(child);
    return child;
  }
  insertAdjacentElement(where: "afterend", element: FakeElement): FakeElement {
    if (where !== "afterend" || this.parent === null) throw new Error(`대역이 다루지 않는 자리: ${where}`);
    element.remove();
    const siblings = this.parent.childNodes;
    siblings.splice(siblings.indexOf(this) + 1, 0, element);
    element.parent = this.parent;
    return element;
  }
  remove(): void {
    if (this.parent === null) return;
    this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1);
    this.parent = null;
  }
  get nextElementSibling(): FakeElement | null {
    if (this.parent === null) return null;
    const siblings = this.parent.children;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  /** 이 대역은 단순 선택자(`[이름]`, `.이름`, `태그`)만 다룬다 */
  matches(selector: string): boolean {
    const attr = /^\[([\w-]+)\]$/.exec(selector);
    if (attr) return this.hasAttribute(attr[1]!);
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (/^[a-z]+$/.test(selector)) return this.tagName === selector;
    throw new Error(`대역이 다루지 않는 선택자: ${selector}`);
  }
  closest(selector: string): FakeElement | null {
    for (let node: FakeElement | null = this; node !== null; node = node.parent) if (node.matches(selector)) return node;
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = [];
    const walk = (node: FakeElement) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  select(): void {
    this.selected = true;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 10, height: 10 };
  }
  /**
   * 모달 창으로 열고 창 안의 첫 단추로 초점을 옮긴다(이 저장소의 카드 창은 내려받기 고리가 숨어 있어 첫 단추가 닫기다).
   * 닫을 때 브라우저가 이전 초점으로 돌리는 것과 close 사건의 늦은 시점은 흉내 내지 않는다. 화면 스크립트가 직접 단추로 초점을 돌리는지만 본다
   */
  showModal(): void {
    this.open = true;
    this.modal = true;
    this.querySelector("button")?.focus();
  }
  modal = false;
  close(): void {
    this.open = false;
    this.modal = false;
    for (const listener of this.listeners.get("close") ?? []) listener({ type: "close", target: this, relatedTarget: null });
  }
}

/** 화면 스크립트가 쓰는 2D 그리기 함수. 여기 없는 이름을 부르면 실제 브라우저처럼 오류가 난다 */
const CANVAS_METHODS = ["arc", "arcTo", "beginPath", "clip", "closePath", "drawImage", "fill", "fillRect", "fillText", "moveTo", "restore", "rotate", "save", "stroke", "translate"] as const;
const CANVAS_COLOR = /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\))$/i;
/** 글꼴 이름 하나. 따옴표로 묶은 이름이거나, 숫자로 시작하지 않는 낱말(사이에 빈칸 가능)이다 */
const FONT_FAMILY = String.raw`(?:"[^"]+"|-?[A-Za-z][\w-]*(?:\s+-?[A-Za-z][\w-]*)*)`;
/** 글꼴 값으로 받는 꼴. 굵기(선택), px 크기, 쉼표로 이은 글꼴 이름 목록이 끝까지 이 꼴이어야 한다 */
const CANVAS_FONT = new RegExp(String.raw`^(?:(?:normal|bold|[1-9]00)\s+)?\d+(?:\.\d+)?px\s+${FONT_FAMILY}(?:\s*,\s*${FONT_FAMILY})*$`);
/**
 * 화면 스크립트가 쓰는 2D 속성과 받는 값, 처음 값. 받지 않는 값은 브라우저처럼 무시하고 앞의 값을 그대로 두되, 시험이 볼 수 있게 문서의 기록에 남긴다.
 * 글꼴은 위 꼴만 받는다(줄 높이, 기울임, 다른 단위 같은 CSS 글꼴 문법의 나머지는 화면 스크립트가 쓰지 않아 다루지 않고, 받지 않는 값으로 본다)
 */
const CANVAS_PROPERTIES: Record<string, { accepts: (value: unknown) => boolean; initial: unknown }> = {
  font: { accepts: (value) => CANVAS_FONT.test(String(value)), initial: "10px sans-serif" },
  fillStyle: { accepts: (value) => CANVAS_COLOR.test(String(value)), initial: "#000000" },
  strokeStyle: { accepts: (value) => CANVAS_COLOR.test(String(value)), initial: "#000000" },
  textAlign: { accepts: (value) => ["left", "right", "center", "start", "end"].includes(String(value)), initial: "start" },
  textBaseline: { accepts: (value) => ["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"].includes(String(value)), initial: "alphabetic" },
  lineWidth: { accepts: (value) => typeof value === "number" && Number.isFinite(value) && value > 0, initial: 1 },
};

/** 캔버스. 그리기 함수는 부른 것을 문서의 기록에 남기고, 글을 그릴 때의 글꼴도 남기며, 그림 주소에 크기를 적는다 */
export class FakeCanvas extends FakeElement {
  width = 300;
  height = 150;
  getContext(kind: string): unknown {
    if (kind !== "2d" || this.ownerDocument.canvasBroken) return null;
    const doc = this.ownerDocument;
    const context: Record<string, unknown> = {};
    const values: Record<string, unknown> = {};
    for (const name of CANVAS_METHODS) context[name] = (...args: unknown[]) => void doc.canvasCalls.push([name, ...args]);
    context.fillText = (...args: unknown[]) => {
      doc.canvasCalls.push(["fillText", ...args]);
      doc.canvasTexts.push({ text: String(args[0]), font: String(values.font) });
    };
    for (const [name, rule] of Object.entries(CANVAS_PROPERTIES)) {
      values[name] = rule.initial;
      Object.defineProperty(context, name, {
        get: () => values[name],
        set: (value: unknown) => {
          if (rule.accepts(value)) values[name] = value;
          else doc.canvasRejected.push([name, value]);
        },
        enumerable: true,
      });
    }
    return Object.seal(context);
  }
  toDataURL(type: string): string {
    return `data:${type};base64,FAKE-${this.width}x${this.height}`;
  }
}

export class FakeDocument {
  root = new FakeElement("#document", this);
  activeElement: FakeElement | null = null;
  /** 참이면 캔버스가 그리기 문맥을 주지 않는다(카드를 그리지 못하는 브라우저) */
  canvasBroken = false;
  /** 캔버스에서 부른 그리기 함수와 인자 */
  canvasCalls: unknown[][] = [];
  /** 캔버스에 그린 글과 그때의 글꼴 */
  canvasTexts: { text: string; font: string }[] = [];
  /** 캔버스가 받지 않아 무시한 속성 값(브라우저는 알리지 않고 앞의 값을 쓴다) */
  canvasRejected: unknown[][] = [];
  get documentElement(): FakeElement {
    return this.root.children[0]!;
  }
  getElementById(id: string): FakeElement | null {
    return this.root.querySelectorAll(`[id]`).find((element) => element.id === id) ?? null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    return this.root.querySelectorAll(selector);
  }
  createElement(tag: string): FakeElement {
    return tag === "canvas" ? new FakeCanvas(tag, this) : new FakeElement(tag, this);
  }
  addEventListener(type: string, listener: Listener): void {
    this.root.addEventListener(type, listener);
  }
  /** 사건을 대상에서 문서까지 올려 보낸다 */
  dispatch(type: string, target: FakeElement, relatedTarget: FakeElement | null = null): void {
    for (let node: FakeElement | null = target; node !== null; node = node.parent) for (const listener of node.listeners.get(type) ?? []) listener({ type, target, relatedTarget });
  }
}

/** 이 저장소가 만드는 HTML을 읽는다. 큰따옴표 속성, 빈 속성, 닫는 빗금, 원문 그대로인 script와 style만 다룬다 */
export function parseHtml(html: string): FakeDocument {
  const doc = new FakeDocument();
  const stack: FakeElement[] = [doc.root];
  let index = 0;
  while (index < html.length) {
    if (html.startsWith("<!", index)) {
      index = html.indexOf(">", index) + 1;
      continue;
    }
    if (html.startsWith("</", index)) {
      const end = html.indexOf(">", index);
      const name = html.slice(index + 2, end).trim().toLowerCase();
      while (stack.length > 1 && stack.pop()!.tagName !== name);
      index = end + 1;
      continue;
    }
    if (html[index] === "<" && /[a-zA-Z]/.test(html[index + 1] ?? "")) {
      const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(index))!;
      const element = doc.createElement(tag[1]!.toLowerCase());
      let cursor = index + tag[0].length;
      const attribute = /\s*([^\s=/>]+)(?:="([^"]*)")?/y;
      for (;;) {
        const rest = html.slice(cursor);
        if (/^\s*\/?>/.test(rest)) break;
        attribute.lastIndex = cursor;
        const match = attribute.exec(html);
        if (match === null) throw new Error(`속성을 읽지 못했다: ${html.slice(cursor, cursor + 40)}`);
        element.setAttribute(match[1]!, decode(match[2] ?? ""));
        cursor = attribute.lastIndex;
      }
      const close = html.indexOf(">", cursor);
      const selfClosing = html[close - 1] === "/";
      stack[stack.length - 1]!.appendChild(element);
      index = close + 1;
      if (RAW.has(element.tagName)) {
        const end = html.indexOf(`</${element.tagName}>`, index);
        element.textContent = html.slice(index, end);
        index = end + element.tagName.length + 3;
      } else if (!VOID.has(element.tagName) && !selfClosing) stack.push(element);
      continue;
    }
    const next = html.indexOf("<", index);
    // 태그로 읽지 못한 `<`에서 멈춰 같은 자리를 끝없이 돌지 않게, 읽지 못하는 글이면 그 자리를 알리고 멈춘다
    if (next === index) throw new Error(`대역이 읽지 못하는 글: ${html.slice(index, index + 40)}`);
    const text = html.slice(index, next === -1 ? html.length : next);
    if (text !== "") stack[stack.length - 1]!.childNodes.push(new FakeText(decode(text)));
    index = next === -1 ? html.length : next;
  }
  return doc;
}

/** 그림. 주소를 넣으면 다음 차례에 불러온 것으로 알린다. 빈 주소는 불러오지 못한 것이다 */
export class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    queueMicrotask(() => (value ? this.onload?.() : this.onerror?.()));
  }
}

export interface ScriptWorld {
  doc: FakeDocument;
  clipboard: { writeText: (text: string) => Promise<void> } | undefined;
}

/** 문서 대역 위에서 스크립트를 돌린다. 시계는 지금 전역의 setTimeout이다(시험이 가짜 시계로 바꿀 수 있다) */
export function runScript(script: string, world: ScriptWorld): void {
  const navigator = world.clipboard === undefined ? {} : { clipboard: world.clipboard };
  const window = { isSecureContext: true };
  new Function("document", "window", "navigator", "Image", "Element", "setTimeout", "clearTimeout", script)(world.doc, window, navigator, FakeImage, FakeElement, setTimeout, clearTimeout);
}

/** 기다리고 있는 약속을 모두 풀어 준다 */
export async function settle(): Promise<void> {
  for (let round = 0; round < 20; round++) await Promise.resolve();
}
```

`test/report/html.test.ts`(새 파일):

```ts
// 결과 화면 HTML을 시험한다. 두 언어를 함께 그리는지, 바깥으로 나가는 요청을 CSP로 막는지, 스크립트가 찾는 요소가 있는지, 경로와 이름을 어떻게 그리는지, AQ가 없을 때 무엇을 숨기는지 본다(설계 13, 14, 19.1, 「3단계 계획 전 결정」의 1·2·5·6·10·12번)
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Lang } from "../../src/core/copy/lang.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import type { ReportArt } from "../../src/report/assets.ts";
import { REPORT_COPY, SCENE_ALT } from "../../src/report/copy.ts";
import { reportHtml } from "../../src/report/html.ts";
import { REPORT_SCRIPT, SCRIPT_IDS, type ClientData } from "../../src/report/script.ts";
import { reportView, type ReportRun, type ReportView } from "../../src/report/view.ts";
import { mcpServer, project } from "../helpers/facts.ts";
import { claudeTool, evaluationInput, type ClaudeToolInput } from "../helpers/evaluation.ts";

const collected = (input: Partial<CollectedTool> = {}): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
  ...input,
});
const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
const thinSessions = [{ days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }];
const result = (tool: ClaudeToolInput = {}, extra: { collected?: CollectedTool; lang?: Lang } = {}): CheckupResult => {
  const input = evaluationInput([claudeTool({ sessions: enough, ...tool })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [extra.collected ?? collected()], appVersion: "0.1.0", lang: extra.lang ?? "ko", run: { stateBroken: false } });
};
const art: ReportArt = { scene: "data:image/webp;base64,U0NFTkU=", face: "data:image/webp;base64,RkFDRQ==", good: "data:image/webp;base64,R09PRA==", fix: "data:image/webp;base64,RklY" };
const noArt: ReportArt = { scene: null, face: null, good: null, fix: null };
const viewOf = (checked: CheckupResult, run: ReportRun = { saved: true, round: 2 }): ReportView => reportView(checked, run);
const between = (html: string, start: string, end: string): string => {
  const from = html.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  return html.slice(from + start.length, html.indexOf(end, from + start.length));
};
const dataOf = (html: string): ClientData => JSON.parse(between(html, `<script type="application/json" id="${SCRIPT_IDS.data}">`, "</script>")) as ClientData;
const count = (html: string, needle: string): number => html.split(needle).length - 1;
const esc = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

describe("reportHtml", () => {
  it("한 파일에 두 언어를 함께 그린다. 처음 보이는 언어는 결과의 언어이고 두 언어의 칸 수가 같다", () => {
    const ko = reportHtml(viewOf(result()), art);
    expect(ko.startsWith("<!doctype html>")).toBe(true);
    expect(ko).toContain('<html lang="ko" data-ui="ko">');
    expect(count(ko, 'data-l="en"')).toBe(count(ko, 'data-l="ko"'));
    expect(count(ko, 'data-l="ko"')).toBeGreaterThan(50);
    expect(ko).toContain('<button type="button" data-set-lang="ko" aria-pressed="true" lang="ko">');
    const en = reportHtml(viewOf(result({}, { lang: "en" })), art);
    expect(en).toContain('<html lang="en" data-ui="en">');
    expect(en).toContain('<button type="button" data-set-lang="en" aria-pressed="true" lang="en">');
  });

  it("언어를 바꿀 때 옮길 속성은 처음 언어의 값으로 채워 두고 두 언어의 값을 함께 둔다", () => {
    const html = reportHtml(viewOf(result()), art);
    expect(html).toContain(`aria-label="${REPORT_COPY.langGroup.ko}" data-en-aria-label="${REPORT_COPY.langGroup.en}" data-ko-aria-label="${REPORT_COPY.langGroup.ko}"`);
    const title = between(html, "<title", "</title>");
    expect(title).toContain(`data-en-text="${esc(REPORT_COPY.pageTitle.en.replace("{date}", "2026-11-13"))}"`);
    expect(title.endsWith(`>${REPORT_COPY.pageTitle.ko.replace("{date}", "2026-11-13")}`)).toBe(true);
  });

  it("바깥으로 나가는 요청을 CSP로 막고, 스크립트는 그 해시가 맞는 것 하나만 돈다", () => {
    const html = reportHtml(viewOf(result()), art);
    const hash = createHash("sha256").update(REPORT_SCRIPT, "utf8").digest("base64");
    const csp = between(html, '<meta http-equiv="Content-Security-Policy" content="', '">');
    expect(csp).toBe(`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'`);
    expect(count(html, "<script")).toBe(2);
    expect(html).toContain(`<script>${REPORT_SCRIPT}</script>`);
    expect(html).not.toMatch(/https?:\/\/|<link|<iframe|<object|<embed/i);
  });

  it("스크립트가 찾는 요소가 하나씩 있다. 카드 요소와 카드 자료는 AQ를 냈을 때만 있다", () => {
    const scored = reportHtml(viewOf(result()), art);
    for (const id of Object.values(SCRIPT_IDS)) expect(count(scored, `id="${id}"`), id).toBe(1);
    expect(count(scored, 'data-act="card"')).toBe(1);
    expect(dataOf(scored).card).not.toBeNull();
    const thin = reportHtml(viewOf(result({ sessions: thinSessions })), art);
    for (const id of [SCRIPT_IDS.dialog, SCRIPT_IDS.cardImage, SCRIPT_IDS.cardLink, SCRIPT_IDS.cardFail, SCRIPT_IDS.cardClose]) expect(thin).not.toContain(`id="${id}"`);
    expect(thin).not.toContain('data-act="card"');
    expect(dataOf(thin).card).toBeNull();
  });

  it("JSON 자료는 </script>로 끊기지 않게 적고, 카드에는 점수와 기준과 고정 글만 싣는다", () => {
    const checked = result();
    const view = viewOf(checked);
    const html = reportHtml(view, art);
    expect(between(html, `id="${SCRIPT_IDS.data}">`, "</script>")).not.toContain("<");
    const card = dataOf(html).card!;
    expect(card.aq).toBe(checked.score.aq);
    expect(card.grade).toBe(checked.score.grade);
    expect(card.today).toBe("2026-11-13");
    expect(card.file).toBe("chunsik-garage-aq-2026-11-13.png");
    expect(card.nick).toEqual({ en: checked.text.en.grade, ko: checked.text.ko.grade });
    expect(card.axes).toEqual(checked.axes.map((axis) => ({ name: expect.any(Object), score: axis.score })));
    expect(Object.keys(card).sort()).toEqual(["alt", "aqLabel", "aq", "axes", "brand", "file", "grade", "gradeLabel", "nick", "repo", "title", "today"].sort());
  });

  it("경로를 그리지 않고 프로젝트는 폴더 이름으로 그린다", () => {
    const root = "C:/SECRET-PARENT/MyApp";
    const projects = [project(root, { normRoot: "c:/secret-parent/myapp", cwds: ["c:/secret-parent/myapp"] })];
    const local = mcpServer("local-db", { scope: "local", projectRoot: "c:/secret-parent/myapp" });
    const sessions = [...enough, ...Array.from({ length: 3 }, () => ({ cwd: "c:/secret-parent/myapp", days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }))];
    const checked = result({ sessions, setup: { projects, mcpServers: [local] } }, { collected: collected({ read: { ...collected().read, unreadableFiles: ["C:/SECRET-PARENT/logs/s.jsonl"], unreadableDirs: ["C:/SECRET-PARENT/logs"] } }) });
    const html = reportHtml(viewOf(checked), art);
    expect(html.toLowerCase()).not.toContain("secret-parent");
    expect(html).toContain("<li>MyApp</li>");
    expect(html).toContain("<code>local-db</code><small>MyApp</small>");
  });

  it("이름은 글로 넣는다(HTML로 풀리지 않는다)", () => {
    const evil = 'x"><img src=x onerror=alert(1)>';
    const html = reportHtml(viewOf(result({ setup: { mcpServers: [mcpServer(evil)] } })), art);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain(`<code>${esc(evil)}</code>`);
  });

  it("바깥에서 온 이름과 글은 어느 자리에서도 HTML로 풀리지 않고, JSON 자료는 </script>로 끊기지 않는다", () => {
    // 자리마다 다른 표시를 붙여, 그 자리가 실제로 그려졌는지와 HTML로 풀리지 않았는지를 함께 본다
    const evil = (mark: string): string => `${mark}"><img src=x onerror=alert(1)></script><b>&'`;
    const base = viewOf(result({ setup: { mcpServers: [mcpServer("watching")] } }));
    const hostile = (mark: string) => ({ en: evil(`${mark}-en`), ko: evil(`${mark}-ko`) });
    const findings = base.findings.map((finding) => {
      // E6의 정보 줄은 판정에서 뺀 서버 칸에만 그린다
      if (finding.ruleId === "E6") return { ...finding, text: { en: { ...finding.text.en, notes: [evil("note-en")] }, ko: { ...finding.text.ko, notes: [evil("note-ko")] } } };
      if (finding.ruleId !== "E5") return finding;
      const text = (lang: "en" | "ko") => ({ ...finding.text[lang], title: evil(`title-${lang}`), name: evil(`name-${lang}`), description: evil(`description-${lang}`), prescription: evil(`prescription-${lang}`), method: [evil(`method-${lang}`)] });
      return { ...finding, category: "repair" as const, severity: "caution" as const, gain: 3, targets: [evil("target")], text: { en: text("en"), ko: text("ko") } };
    });
    const view: ReportView = {
      ...base,
      findings,
      servers: [
        { tool: "claude-code", name: evil("server"), scope: "local", projectName: evil("server-project"), why: "not_established", daysUntil: 3 },
        { tool: "claude-code", name: evil("connector"), scope: "claude-ai", projectName: null, why: "no_definition", daysUntil: null },
      ],
      setupProblems: [{ tool: "claude-code", kind: "unparsable", place: evil("place") }],
      missingInstructions: [evil("missing")],
      worstOverlap: evil("overlap"),
      notices: [{ kind: "record_unreadable", text: hostile("notice") }],
      text: { en: { ...base.text.en, grade: evil("grade-en"), diagnosis: evil("diagnosis-en") }, ko: { ...base.text.ko, grade: evil("grade-ko"), diagnosis: evil("diagnosis-ko") } },
    };
    const html = reportHtml(view, art);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>&");
    expect(count(html, "<script")).toBe(2);
    expect(count(html, "</script>")).toBe(2);
    const marks = ["target", "server", "server-project", "connector", "place", "missing", "overlap", "notice-en", "notice-ko", "grade-en", "grade-ko", "diagnosis-en", "diagnosis-ko", "title-ko", "name-ko", "description-ko", "prescription-ko", "method-ko", "note-ko"];
    for (const mark of marks) expect(html, mark).toContain(esc(evil(mark)));
    expect(html).toContain(`data-phrase-ko="${esc(REPORT_COPY.phrase.ko.replace("{name}", evil("name-ko")))}"`);
    expect(html).toContain(esc(JSON.stringify(evil("connector"))));
    expect(dataOf(html).card!.nick).toEqual({ en: evil("grade-en"), ko: evil("grade-ko") });
  });

  it("AQ가 있는데 등급이 없으면(평가가 내지 않는 조합) 카드 단추와 창과 자료를 모두 두지 않는다", () => {
    const view = viewOf(result());
    const html = reportHtml({ ...view, score: { ...view.score, grade: null } }, art);
    expect(html).not.toContain('data-act="card"');
    expect(html).not.toContain(`id="${SCRIPT_IDS.dialog}"`);
    expect(dataOf(html).card).toBeNull();
  });

  it("AQ를 냈으면 등급 단계의 장면과 별명, 도장, 먼저 고칠 것을 그린다", () => {
    const checked = result();
    const view = viewOf(checked);
    const html = reportHtml(view, art);
    const alt = SCENE_ALT[`scene-${checked.score.tier}` as keyof typeof SCENE_ALT];
    expect(html).toContain(`<img id="${SCRIPT_IDS.scene}" src="${art.scene}" width="264" height="264" data-tr alt="${esc(alt.ko)}" data-en-alt="${esc(alt.en)}" data-ko-alt="${esc(alt.ko)}">`);
    expect(html).toContain(`<figcaption><span lang="en" data-l="en">${esc(checked.text.en.grade!)}</span><span lang="ko" data-l="ko">${esc(checked.text.ko.grade!)}</span></figcaption>`);
    expect(html).toContain(`<b>${checked.score.grade}</b>`);
    const repairs = view.findings.filter((finding) => finding.category === "repair");
    expect(html.includes(REPORT_COPY.fixFirst.ko)).toBe(repairs.length > 0);
  });

  it("AQ를 내지 않았으면 점수 없음과 장면 아래의 까닭을 보이고, 먼저 고칠 것과 예상 효과 꼬리표와 카드 단추를 그리지 않는다", () => {
    const thin = result({ sessions: thinSessions });
    const view = viewOf(thin, { saved: false, round: null });
    // 정비 항목에 예상 효과가 있다고 해도 꼬리표를 그리지 않는다
    const forced: ReportView = { ...view, findings: [...view.findings, { ...view.findings[0]!, ruleId: "E5", category: "repair", gain: 7, targets: ["old-skill"] }] };
    const html = reportHtml(forced, art);
    expect(html).toContain(`<div class="n none"><span lang="en" data-l="en">${REPORT_COPY.noScore.en}</span>`);
    // 장면 아래의 글이 AQ를 내지 않은 까닭이다(「3단계 계획 전 결정」의 12번). 같은 글을 다른 자리에 또 쓰지 않는다
    expect(between(html, '<figure class="scene">', "</figure>")).toContain(`<figcaption class="why">${pairOf(view.withheldText!)}</figcaption>`);
    expect(count(html, esc(view.withheldText!.ko))).toBe(1);
    expect(html).not.toContain('class="tag up"');
    expect(html).not.toContain(REPORT_COPY.fixFirst.ko);
    expect(html).toContain(`data-ko-alt="${esc(SCENE_ALT["scene-few-records"].ko)}"`);
    const unreadable = result({ sessions: thinSessions }, { collected: collected({ read: { ...collected().read, unreadableFiles: ["C:/x/a.jsonl"] } }) });
    expect(reportHtml(viewOf(unreadable), art)).toContain(`data-ko-alt="${esc(SCENE_ALT["scene-unreadable"].ko)}"`);
  });

  it("그림을 읽지 못하면 그 자리를 대체 글로 그리고, 카드가 쓸 그림 요소를 두지 않는다", () => {
    const html = reportHtml(viewOf(result()), noArt);
    // 카드 창의 그림 자리는 스크립트가 그린 뒤에 채운다
    expect(html).not.toMatch(/<img[^>]*\ssrc=/);
    expect(html).toContain('<div class="ph" role="img" data-tr aria-label=');
    expect(html).not.toContain(`id="${SCRIPT_IDS.scene}"`);
    expect(html).not.toContain(`id="${SCRIPT_IDS.face}"`);
  });

  it("판정에서 뺀 서버는 까닭마다 이름을 적고, 지켜보는 중이면 며칠 뒤부터 판정하는지와 조건을, claude.ai 연결은 막을 때 쓸 설정을 적는다", () => {
    const checked = result({ setup: { mcpServers: [mcpServer("watching"), mcpServer("claude.ai Mail", { scope: "claude-ai", definitionHash: null })] } });
    const saved = reportHtml(viewOf(checked, { saved: true, round: 1 }), art);
    expect(saved).toContain(REPORT_COPY.judgeFrom.ko.replace("{n}", "15"));
    expect(saved).toContain(REPORT_COPY.judgeFrom.en.replace("{n} {n:day|days}", "15 days"));
    expect(saved).toContain(REPORT_COPY.judgeChange.ko);
    expect(saved).not.toContain(REPORT_COPY.judgeNotSaved.ko);
    expect(saved).toContain("<code>claude.ai Mail</code>");
    expect(saved).toContain(`<pre>${esc('[\n  { "serverName": "claude.ai Mail" }\n]')}</pre>`);
    expect(saved).toContain(REPORT_COPY.serversOut.ko.replace("{n}", "2"));
    const unsaved = reportHtml(viewOf(checked, { saved: false, round: null }), art);
    expect(unsaved).toContain(REPORT_COPY.judgeNotSaved.ko);
    // 날을 모르면 0일이나 "곧"으로 바꾸지 않고 정하지 못했다고 적는다
    const view = viewOf(checked);
    const unknown = reportHtml({ ...view, servers: view.servers.map((server) => ({ ...server, daysUntil: null })) }, art);
    expect(unknown).toContain(REPORT_COPY.judgeUnknown.ko);
    expect(unknown).not.toContain(REPORT_COPY.judgeFrom.ko.slice(0, 10));
  });

  it("S3의 위치, F3의 프로젝트, F4의 프로젝트를 이름 칩으로 그린다", () => {
    const view = viewOf(result());
    const html = reportHtml({ ...view, setupProblems: [{ tool: "claude-code", kind: "unparsable", place: "~/.claude/settings.json" }], missingInstructions: ["web", "web (2)"], worstOverlap: "api" }, art);
    expect(html).toContain('<li>~/.claude/settings.json<small><span lang="en" data-l="en">unparsable settings file</span><span lang="ko" data-l="ko">풀리지 않는 설정 파일</span></small></li>');
    expect(html).toContain("<li>web</li><li>web (2)</li>");
    expect(html).toContain("<li>api</li>");
  });

  it("정리하기 단추는 두 언어의 붙여 넣을 말을 가진다", () => {
    const view = viewOf(result());
    const repair = { ...view.findings[0]!, category: "repair" as const, targets: ["old-skill"] };
    const html = reportHtml({ ...view, findings: [repair] }, art);
    expect(html).toContain(`data-act="copy" data-phrase-en="${esc(REPORT_COPY.phrase.en.replace("{name}", repair.text.en.name))}" data-phrase-ko="${esc(REPORT_COPY.phrase.ko.replace("{name}", repair.text.ko.name))}"`);
    expect(html).toContain("<li>old-skill</li>");
  });

  it("달력은 수집 구간의 날마다 한 칸이고 두 언어의 말풍선을 가지며, 표로 보기에도 같은 날이 있다", () => {
    const view = viewOf(result());
    const html = reportHtml(view, art);
    expect(count(html, "data-tip-en=")).toBe(view.usage.calendar.length);
    expect(count(html, "data-tip-ko=")).toBe(view.usage.calendar.length);
    for (const cell of view.usage.calendar) expect(html).toContain(`<td>${cell.date}</td>`);
    expect(html).toContain('<button type="button" class="mini-btn" data-act="table">');
  });

  it("일부만 읽었으면 점수 띠 위에 그 띠를 두 언어로 그린다. 아래 경계면 「적어도」, 비율을 낼 수 없으면 숫자 없이 적는다(설계 9.8, 20.1)", () => {
    const line = (key: "partialRead" | "partialReadAtLeast" | "partialReadUnknown", lang: "en" | "ko", share: string) => esc(REPORT_COPY[key][lang].replace("{tool}", "Claude Code").replace("{share}", share));
    expect(reportHtml(viewOf(result()), art)).not.toContain('class="partial"');
    // 평가 결과에서 실제로 띠의 자료가 나오는 경우(파일 3개 가운데 1개를 읽지 못함)
    const read = collected().read;
    const html = reportHtml(viewOf(result({}, { collected: collected({ read: { ...read, files: 3, listedBytes: 300, unreadableFiles: ["C:/x/a.jsonl"], unreadableFileBytes: 100 } }) })), art);
    expect(html.indexOf('<div class="partial" role="note">')).toBeGreaterThan(html.indexOf("</header>"));
    expect(html.indexOf('<div class="partial" role="note">')).toBeLessThan(html.indexOf('<section class="hero"'));
    expect(html).toContain(line("partialRead", "ko", "33.3%"));
    expect(html).toContain(line("partialRead", "en", "33.3%"));
    const view = viewOf(result());
    expect(reportHtml({ ...view, partialReads: [{ tool: "claude-code", share: 0.05, lowerBound: true }] }, art)).toContain(line("partialReadAtLeast", "ko", "5%"));
    const unknown = reportHtml({ ...view, partialReads: [{ tool: "claude-code", share: null, lowerBound: true }] }, art);
    expect(unknown).toContain(line("partialReadUnknown", "ko", ""));
    expect(unknown).toContain(line("partialReadUnknown", "en", ""));
  });
});

const pairOf = (texts: { en: string; ko: string }): string => `<span lang="en" data-l="en">${esc(texts.en)}</span><span lang="ko" data-l="ko">${esc(texts.ko)}</span>`;
```

`test/report/script-run.test.ts`(새 파일):

```ts
// 결과 화면 안의 스크립트를 실제로 만든 HTML 위에서 돌려 본다. 언어 바꾸기, 복사와 막힐 때의 글상자, 떠 있는 알림과 말풍선 닫기, 표로 보기, 공유 카드 그리기와 초점을 문서 대역에서 본다(설계 13.2, 13.4, 14, 「3단계 2부 계획에서 보완」의 2·9·10번)
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type CheckupResult } from "../../src/core/result/assemble.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import type { ReportArt } from "../../src/report/assets.ts";
import { REPORT_COPY } from "../../src/report/copy.ts";
import { reportHtml } from "../../src/report/html.ts";
import { REPORT_SCRIPT, SCRIPT_IDS, SWAP_TARGETS } from "../../src/report/script.ts";
import { reportView, type ReportView } from "../../src/report/view.ts";
import { parseHtml, runScript, settle, type FakeDocument, type FakeElement, type ScriptWorld } from "../helpers/fake-dom.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";

const collected: CollectedTool = {
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
};
const enough = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
const result = (sessions = enough): CheckupResult => {
  const input = evaluationInput([claudeTool({ sessions })]);
  return checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
};
const art: ReportArt = { scene: "data:image/webp;base64,U0NFTkU=", face: "data:image/webp;base64,RkFDRQ==", good: "data:image/webp;base64,R09PRA==", fix: "data:image/webp;base64,RklY" };
const scoredView = (): ReportView => reportView(result(), { saved: true, round: 1 });
/** 정리할 것이 있는 정비 항목을 하나 넣은 자료(작성자 PC에 없는 경우라 지어낸다) */
const withRepair = (view: ReportView): ReportView => ({
  ...view,
  findings: view.findings.map((finding) => (finding.ruleId === "E5" ? { ...finding, category: "repair" as const, severity: "caution" as const, gain: 4, targets: ["old-skill"] } : finding)),
});

function open(view: ReportView, clipboard?: ScriptWorld["clipboard"], pictures: ReportArt = art): FakeDocument {
  const doc = parseHtml(reportHtml(view, pictures));
  runScript(REPORT_SCRIPT, { doc, clipboard });
  return doc;
}
const byId = (doc: FakeDocument, id: string): FakeElement => {
  const element = doc.getElementById(id);
  if (element === null) throw new Error(`요소가 없다: ${id}`);
  return element;
};
const action = (doc: FakeDocument, kind: string): FakeElement => doc.querySelectorAll("[data-act]").find((element) => element.getAttribute("data-act") === kind)!;
const langButton = (doc: FakeDocument, code: "en" | "ko"): FakeElement => doc.querySelectorAll("[data-set-lang]").find((element) => element.getAttribute("data-set-lang") === code)!;
const click = (doc: FakeDocument, element: FakeElement): void => doc.dispatch("click", element);

afterEach(() => {
  vi.useRealTimers();
});

describe("언어 바꾸기", () => {
  it("언어 단추를 누르면 문서의 언어, 단추의 눌림, 정해 둔 속성이 모두 그 언어로 바뀌고 펼친 항목은 그대로다", () => {
    const doc = open(scoredView());
    const details = doc.querySelectorAll("details")[0]!;
    details.setAttribute("open", "");
    for (const code of ["en", "ko"] as const) {
      click(doc, langButton(doc, code));
      expect(doc.documentElement.getAttribute("data-ui")).toBe(code);
      expect(doc.documentElement.getAttribute("lang")).toBe(code);
      expect(langButton(doc, code).getAttribute("aria-pressed")).toBe("true");
      expect(langButton(doc, code === "en" ? "ko" : "en").getAttribute("aria-pressed")).toBe("false");
      let swapped = 0;
      for (const element of doc.querySelectorAll("[data-tr]")) {
        for (const target of SWAP_TARGETS) {
          const want = element.getAttribute(`data-${code}-${target}`);
          if (want === null) continue;
          swapped++;
          const now = target === "text" ? element.textContent : target === "value" ? element.value : element.getAttribute(target);
          expect(now, `${element.tagName} ${target}`).toBe(want);
        }
      }
      // 옮길 속성을 단 요소마다 적어도 하나를 옮겼다
      expect(swapped).toBeGreaterThanOrEqual(doc.querySelectorAll("[data-tr]").length);
      expect(swapped).toBeGreaterThan(0);
      expect(details.hasAttribute("open")).toBe(true);
    }
  });

  it("정해 둔 다섯 밖의 속성은 옮기지 않는다", () => {
    const doc = open(scoredView());
    const element = doc.querySelectorAll("[data-tr]")[0]!;
    element.setAttribute("data-en-onclick", "alert(1)");
    click(doc, langButton(doc, "en"));
    expect(element.hasAttribute("onclick")).toBe(false);
  });
});

describe("붙여 넣을 말 복사", () => {
  it("복사가 막히면(클립보드가 없다) 단추 아래 글상자에 붙여 넣을 말을 골라 두고 초점을 옮긴다. 언어를 바꾸면 그 말도 바뀌고, 다시 누르면 글상자는 하나다", () => {
    const doc = open(withRepair(scoredView()));
    const button = action(doc, "copy");
    click(doc, button);
    const box = button.nextElementSibling!;
    expect(box.classList.contains("copybox")).toBe(true);
    const area = box.querySelector("textarea")!;
    expect(area.value).toBe(button.getAttribute("data-phrase-ko"));
    expect(area.readOnly).toBe(true);
    expect(area.selected).toBe(true);
    expect(doc.activeElement).toBe(area);
    expect(area.getAttribute("aria-label")).toBe(REPORT_COPY.copyLabel.ko);
    click(doc, langButton(doc, "en"));
    expect(area.value).toBe(button.getAttribute("data-phrase-en"));
    expect(area.getAttribute("aria-label")).toBe(REPORT_COPY.copyLabel.en);
    click(doc, button);
    expect(doc.querySelectorAll(".copybox")).toHaveLength(1);
  });

  it("브라우저가 복사를 거절해도 글상자를 보인다", async () => {
    const doc = open(withRepair(scoredView()), { writeText: () => Promise.reject(new Error("denied")) });
    click(doc, action(doc, "copy"));
    await settle();
    expect(doc.querySelectorAll(".copybox")).toHaveLength(1);
  });

  it("복사 요청이 겹쳐 서로 다른 때에 늦게 거절돼도 글상자는 하나다", async () => {
    const rejects: (() => void)[] = [];
    const doc = open(withRepair(scoredView()), { writeText: () => new Promise<void>((_, reject) => void rejects.push(() => reject(new Error("denied")))) });
    const button = action(doc, "copy");
    click(doc, button);
    click(doc, button);
    expect(rejects).toHaveLength(2);
    rejects[0]!();
    await settle();
    rejects[1]!();
    await settle();
    expect(doc.querySelectorAll(".copybox")).toHaveLength(1);
  });

  it("복사에 성공하면 지금 언어로 알리고, 언어를 바꾸면 떠 있는 알림과 화면 읽기 프로그램용 글을 비운다", async () => {
    vi.useFakeTimers();
    const written: string[] = [];
    const doc = open(withRepair(scoredView()), { writeText: async (text) => void written.push(text) });
    const button = action(doc, "copy");
    const toast = byId(doc, SCRIPT_IDS.toast);
    const live = byId(doc, SCRIPT_IDS.live);
    click(doc, button);
    await settle();
    expect(written).toEqual([button.getAttribute("data-phrase-ko")]);
    expect(toast.style.display).toBe("block");
    expect(toast.textContent).toBe(REPORT_COPY.copied.ko);
    vi.advanceTimersByTime(60);
    expect(live.textContent).toBe(REPORT_COPY.copied.ko);
    click(doc, langButton(doc, "en"));
    expect(toast.style.display).toBe("none");
    expect(live.textContent).toBe("");
    // 알린 바로 뒤에 언어를 바꿔도 지난 언어의 글이 나중에 들어오지 않는다
    click(doc, button);
    await settle();
    click(doc, langButton(doc, "ko"));
    vi.advanceTimersByTime(3000);
    expect(live.textContent).toBe("");
    expect(written).toEqual([button.getAttribute("data-phrase-ko"), button.getAttribute("data-phrase-en")]);
  });
});

describe("표로 보기와 달력의 말풍선", () => {
  it("표로 보기 단추는 사용 기록 칸을 표로 바꾸고 다시 누르면 되돌린다", () => {
    const doc = open(scoredView());
    const use = doc.querySelectorAll(".use")[0]!;
    click(doc, action(doc, "table"));
    expect(use.classList.contains("as-table")).toBe(true);
    click(doc, action(doc, "table"));
    expect(use.classList.contains("as-table")).toBe(false);
  });

  it("달력 칸에 마우스를 올리면 지금 언어의 말풍선이 뜨고, 칸 밖으로 나가거나 언어를 바꾸면 닫힌다", () => {
    const doc = open(scoredView());
    const cell = doc.querySelectorAll("[data-tip-en]")[0]!;
    const tip = doc.querySelectorAll(".tip")[0]!;
    doc.dispatch("mouseover", cell);
    expect(tip.style.display).toBe("block");
    expect(tip.textContent).toBe(cell.getAttribute("data-tip-ko"));
    doc.dispatch("mouseout", cell, cell.parent);
    expect(tip.style.display).toBe("none");
    doc.dispatch("mouseover", cell);
    click(doc, langButton(doc, "en"));
    expect(tip.style.display).toBe("none");
    doc.dispatch("mouseover", cell);
    expect(tip.textContent).toBe(cell.getAttribute("data-tip-en"));
  });
});

describe("공유 카드", () => {
  it("카드 단추는 1200×630 그림을 그려 창에 넣고 내려받기 이름을 단다. 창을 닫으면 단추로 초점이 돌아온다", async () => {
    const view = scoredView();
    const doc = open(view);
    const share = action(doc, "card");
    share.focus();
    click(doc, share);
    // 모달 창으로 열어 초점이 창 안(닫기 단추)으로 간다. 그냥 열면 창이 화면 밖에 붙고 초점도 남는다
    expect(byId(doc, SCRIPT_IDS.dialog).open).toBe(true);
    expect(byId(doc, SCRIPT_IDS.dialog).modal).toBe(true);
    expect(doc.activeElement).toBe(byId(doc, SCRIPT_IDS.cardClose));
    await settle();
    // 카드에 점수, 등급, 점검일을 실제로 그렸다(대역은 화면 스크립트가 쓰는 그리기 함수만 받는다)
    const drawn = doc.canvasCalls.filter((call) => call[0] === "fillText").map((call) => call[1]);
    expect(drawn).toEqual(expect.arrayContaining([String(view.score.aq), view.score.grade, view.today]));
    // 그리는 동안 넣은 속성 값(글꼴, 색, 정렬, 선 굵기)이 모두 받는 값이었다. 브라우저는 받지 않는 값을 알리지 않고 앞의 값을 쓰므로 어느 하나만 틀려도 카드가 어긋난다
    expect(doc.canvasRejected).toEqual([]);
    // 큰 AQ 숫자, 등급, 별명은 정한 글꼴 크기로 그렸다
    const fontOf = (text: string): string | undefined => doc.canvasTexts.find((item) => item.text === text)?.font;
    expect(fontOf(String(view.score.aq))).toMatch(/^800 210px /);
    expect(fontOf(view.score.grade!)).toMatch(/^800 70px /);
    expect(fontOf(view.text.ko.grade!)).toMatch(/^800 34px /);
    const image = byId(doc, SCRIPT_IDS.cardImage);
    const link = byId(doc, SCRIPT_IDS.cardLink);
    expect(image.src).toBe("data:image/png;base64,FAKE-1200x630");
    expect(image.hidden).toBe(false);
    expect(image.alt).toContain(`AQ ${view.score.aq}`);
    expect(link.href).toBe(image.src);
    expect(link.download).toBe(`chunsik-garage-aq-${view.today}.png`);
    expect(link.hidden).toBe(false);
    expect(byId(doc, SCRIPT_IDS.cardFail).hidden).toBe(true);
    click(doc, byId(doc, SCRIPT_IDS.cardClose));
    expect(byId(doc, SCRIPT_IDS.dialog).open).toBe(false);
    expect(doc.activeElement).toBe(share);
  });

  it("그림이 없어도 카드를 그리고, 그리기 문맥이 없으면 그림 대신 그리지 못했다는 글을 보인다", async () => {
    const plain = open(scoredView(), undefined, { scene: null, face: null, good: null, fix: null });
    click(plain, action(plain, "card"));
    await settle();
    expect(byId(plain, SCRIPT_IDS.cardImage).src).toBe("data:image/png;base64,FAKE-1200x630");
    const broken = open(scoredView());
    broken.canvasBroken = true;
    click(broken, action(broken, "card"));
    await settle();
    expect(byId(broken, SCRIPT_IDS.cardFail).hidden).toBe(false);
    expect(byId(broken, SCRIPT_IDS.cardImage).hidden).toBe(true);
    expect(byId(broken, SCRIPT_IDS.cardLink).hidden).toBe(true);
  });

  it("AQ가 없는 화면에도 스크립트가 돌고 카드 요소가 없다", () => {
    const doc = open(reportView(result([{ days: { "2026-11-12": { responses: 1, humanRequests: 1 } } }]), { saved: false, round: null }));
    expect(doc.getElementById(SCRIPT_IDS.dialog)).toBeNull();
    expect(doc.querySelectorAll("[data-act]").some((element) => element.getAttribute("data-act") === "card")).toBe(false);
    click(doc, langButton(doc, "en"));
    expect(doc.documentElement.getAttribute("data-ui")).toBe("en");
  });
});
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/report/html.test.ts test/report/script-run.test.ts`
Expected: FAIL. `test/report/html.test.ts`와 `test/report/script-run.test.ts`가 `../../src/report/html.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`src/core/result/summary.ts`(찾을 곳):

```ts
function fixDetail(fix: SummaryFix, lang: Lang): string {
```

`src/core/result/summary.ts`(바꾼 뒤):

```ts
/** 먼저 고칠 것의 덧붙이는 말. 결과 화면의 진단 띠도 같은 말을 쓴다 */
export function fixDetail(fix: SummaryFix, lang: Lang): string {
```

`src/report/assets.ts`(찾을 곳):

```ts

/** AQ를 냈으면 등급 단계의 장면, 내지 않았으면 기록을 읽지 못했다는 알림이 있을 때 읽지 못함, 없으면 모자람이다 */
export function sceneFor(tier: number | null, unreadable: boolean): ArtName {
  if (tier !== null) return `scene-${tier}` as ArtName;
  return unreadable ? "scene-unreadable" : "scene-few-records";
```

`src/report/assets.ts`(바꾼 뒤):

```ts

/** 장면 그림의 이름 */
export type SceneName = Extract<ArtName, `scene-${string}`>;

/** AQ를 냈으면 등급 단계의 장면, 내지 않았으면 기록을 읽지 못했다는 알림이 있을 때 읽지 못함, 없으면 모자람이다 */
export function sceneFor(tier: number | null, unreadable: boolean): SceneName {
  if (tier !== null) return `scene-${tier}` as SceneName;
  return unreadable ? "scene-unreadable" : "scene-few-records";
```

`src/report/copy.ts`(찾을 곳):

```ts
  cardNote: { en: "If the download is blocked, right-click the image, or press and hold it on a phone, to save it.", ko: "내려받기가 막히면 그림을 오른쪽 단추로 누르거나, 휴대폰에서는 길게 눌러 저장하세요." },
  cardAlt: { en: "Share card: AQ {aq}, grade {grade}, {name}, with the four axis scores", ko: "공유 카드. AQ {aq}, {grade}등급 {name}, 네 기준 점수" },
```

`src/report/copy.ts`(바꾼 뒤):

```ts
  cardNote: { en: "If the download is blocked, right-click the image, or press and hold it on a phone, to save it.", ko: "내려받기가 막히면 그림을 오른쪽 단추로 누르거나, 휴대폰에서는 길게 눌러 저장하세요." },
  cardFail: { en: "The card could not be drawn in this browser.", ko: "이 브라우저에서 카드를 그리지 못했습니다." },
  cardAlt: { en: "Share card: AQ {aq}, grade {grade}, {name}, with the four axis scores", ko: "공유 카드. AQ {aq}, {grade}등급 {name}, 네 기준 점수" },
```

`src/report/html.ts`(새 파일):

```ts
// 결과 화면 HTML 한 파일을 만든다. 두 언어의 글을 함께 그리고 지금 언어가 아닌 쪽은 스타일이 숨긴다. 스타일, 스크립트, 자료, 그림이 모두 파일 안에 있고 바깥으로 나가는 요청은 CSP로 막는다. 경로는 그리지 않는다(순수 함수, 설계 13, 14, 19.1, 「3단계 계획 전 결정」의 1·2·5·6·10·12번)
import { createHash } from "node:crypto";
import type { LocalDate } from "../adapters/common/dates.ts";
import type { ToolId } from "../adapters/types.ts";
import { AXIS_NAMES, SUMMARY_COPY, TOOL_NAMES, UNJUDGED_COPY } from "../core/copy/common.ts";
import { joinValue } from "../core/copy/findings.ts";
import { fill, groupDigits } from "../core/copy/format.ts";
import { LANGS, type Lang, type Texts } from "../core/copy/lang.ts";
import { fixDetail } from "../core/result/summary.ts";
import type { CalendarCell } from "../core/result/usage.ts";
import { sceneFor, type ReportArt } from "./assets.ts";
import { PROBLEM_KIND_COPY, REPORT_COPY, SCENE_ALT, STATUS_COPY, WEEKDAYS, type CopyKey } from "./copy.ts";
import { percent, shortTokens } from "./format.ts";
import { REPORT_SCRIPT, SCRIPT_IDS, type ClientData, type SWAP_TARGETS } from "./script.ts";
import { REPORT_CSS } from "./style.ts";
import type { ReportView, ViewFinding, ViewServer } from "./view.ts";

type Values = Readonly<Record<string, string | number | null>>;
type Status = keyof typeof STATUS_COPY;
/** 언어를 바꿀 때 스크립트가 옮기는 속성 가운데 같은 이름의 속성인 것 */
type SwapAttr = Exclude<(typeof SWAP_TARGETS)[number], "text" | "value">;

/** 날짜별 응답 수의 진하기(적음에서 많음). 색각 이상 검증을 통과한 자료 색이다(설계 13.2) */
const RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#184f95"] as const;
const TOOL_COLORS: Record<ToolId, string> = { "claude-code": "#2a78d6" };
const REPO = "chunsik-garage";

/** 글과 속성 값을 HTML에 그대로 넣을 수 있게 바꾼다 */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

const textsOf = (make: (lang: Lang) => string): Texts<string> => ({ en: make("en"), ko: make("ko") });
const copy = (key: CopyKey, values?: Values): Texts<string> => textsOf((lang) => (values === undefined ? REPORT_COPY[key][lang] : fill(REPORT_COPY[key][lang], values)));
/** 이미 바꾼 두 언어의 HTML 조각을 언어마다의 span으로 감싼다 */
const pairHtml = (html: Texts<string>): string => LANGS.map((lang) => `<span lang="${lang}" data-l="${lang}">${html[lang]}</span>`).join("");
/** 두 언어의 글 */
const both = (texts: Texts<string>): string => pairHtml(textsOf((lang) => esc(texts[lang])));
/** 언어마다 따로 그리는 요소. 첫 태그에 lang과 data-l을 붙인다 */
const perLang = (make: (lang: Lang) => string): string => LANGS.map((lang) => make(lang).replace(/^<([a-z0-9]+)/, `<$1 lang="${lang}" data-l="${lang}"`)).join("");
/** 언어를 바꿀 때 옮길 속성. 처음 언어의 값을 넣고 두 언어의 값을 함께 둔다 */
const swap = (lang: Lang, attrs: Partial<Record<SwapAttr, Texts<string>>>): string =>
  ` data-tr${Object.entries(attrs)
    .map(([name, texts]) => ` ${name}="${esc(texts[lang])}" data-en-${name}="${esc(texts.en)}" data-ko-${name}="${esc(texts.ko)}"`)
    .join("")}`;
/** 문구 틀을 바꾼 뒤 자리에 HTML 조각을 끼운다 */
const fillHtml = (template: string, values: Readonly<Record<string, string>>): string => fill(esc(template), values);

const dayNumber = (date: LocalDate): number => {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

const ICONS: Record<Status, string> = {
  critical: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.5 17 16H1z" fill="#ec835a"/><rect x="8.1" y="6.2" width="1.8" height="5" fill="#0b0b0b"/><rect x="8.1" y="12.4" width="1.8" height="1.8" fill="#0b0b0b"/></svg>',
  caution: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.5 17 16H1z" fill="#fab219"/><rect x="8.1" y="6.2" width="1.8" height="5" fill="#0b0b0b"/><rect x="8.1" y="12.4" width="1.8" height="1.8" fill="#0b0b0b"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="#898781"/><rect x="8.1" y="7.6" width="1.8" height="5.4" fill="#fff"/><rect x="8.1" y="4.6" width="1.8" height="1.8" fill="#fff"/></svg>',
  good: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="#0ca30c"/><path d="M5 9.2 8 12l5-6" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  average: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="#898781" stroke-width="2"/><rect x="5" y="8.1" width="8" height="1.8" fill="#898781"/></svg>',
  unmeasured: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="#898781" stroke-width="2" stroke-dasharray="3 2.2"/><rect x="8.1" y="12.2" width="1.8" height="1.8" fill="#52514e"/><path d="M6.6 6.8a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1 .8-1 1.6" stroke="#52514e" stroke-width="1.8" fill="none"/></svg>',
};
const LOCK = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="7" width="11" height="7.5" rx="1.5" fill="#52514e"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#52514e" stroke-width="1.8" fill="none"/></svg>';

function statusOf(finding: ViewFinding): Status {
  if (finding.category === "strength") return "good";
  if (finding.category === "average") return "average";
  if (finding.category === "unmeasured") return "unmeasured";
  return finding.severity === "critical" ? "critical" : finding.severity === "caution" ? "caution" : "info";
}

/** 이름 칩. 칸 이름은 화면 읽기 프로그램에 목록의 이름으로 알린다 */
function chips(lang: Lang, label: Texts<string>, items: string[]): string {
  if (items.length === 0) return "";
  return `<ul class="chips"${swap(lang, { "aria-label": label })}><li class="k" aria-hidden="true">${both(label)}</li>${items.join("")}</ul>`;
}

/** 큰 숫자 자리. 못 쟀으면 "잴 수 없음"과 이유의 낱말, 쟀으면 잰 값과 단위다(「3단계 계획 전 결정」의 1번) */
function figure(finding: ViewFinding): string {
  return perLang((lang) => {
    const text = finding.text[lang];
    if (text.value === null) return `<div class="fig nv">${esc(REPORT_COPY.unmeasured[lang])}<small>${esc(text.reason ?? "")}</small></div>`;
    const unit = text.unit === null ? "" : text.unit === "%" ? "%" : `<span class="u">${esc(text.unit)}</span>`;
    const long = `${text.value}${text.unit === "%" ? "%" : ""}`.length >= 6 ? " lg" : "";
    return `<div class="fig${long}">${esc(text.value)}${unit}<small>${esc(text.name)}</small></div>`;
  });
}

/** 판정에서 뺀 서버 한 줄. 지켜보는 중이면 며칠 뒤의 점검부터 판정할 수 있는지 적고, 날을 모르면 정하지 못했다고 적는다(설계 13.1) */
function serverLine(server: ViewServer): string {
  const project = server.projectName === null ? "" : `<small>${esc(server.projectName)}</small>`;
  if (server.why !== "not_established") return `<code>${esc(server.name)}</code>${project}`;
  // 지켜보는 중인 서버의 날은 늘 오늘 뒤다(1부의 serverJudgeableFrom). 그렇지 않은 값은 날을 정하지 못한 것으로 다룬다
  const day = server.daysUntil !== null && server.daysUntil >= 1 ? copy("judgeFrom", { n: server.daysUntil }) : copy("judgeUnknown");
  return `<span class="srv"><code>${esc(server.name)}</code>${project}<span class="when">${both(day)}</span></span>`;
}

/** E6 항목의 「판정에서 뺀 서버 N개」. 정보 줄, 까닭마다의 이름, claude.ai 연결을 막을 때 쓸 설정이다 */
function serversBlock(finding: ViewFinding, view: ReportView): string {
  if (finding.ruleId !== "E6" || view.servers.length === 0) return "";
  const notes = perLang((lang) => `<div>${finding.text[lang].notes.map((line) => `<p>${esc(line)}</p>`).join("")}</div>`);
  const order = Object.keys(UNJUDGED_COPY.en.why) as ViewServer["why"][];
  const groups = order.map((why) => ({ why, servers: view.servers.filter((server) => server.why === why) })).filter((group) => group.servers.length > 0);
  const items = groups
    .map((group) => {
      const watch = group.why === "not_established" ? `<span class="when">${both(copy("judgeChange"))}</span>${view.saved ? "" : `<span class="when">${both(copy("judgeNotSaved"))}</span>`}` : "";
      return `<li><b>${both(textsOf((lang) => UNJUDGED_COPY[lang].why[group.why]))}</b>${group.servers.map(serverLine).join("")}${watch}</li>`;
    })
    .join("");
  const connectors = view.servers.filter((server) => server.scope === "claude-ai");
  const deny = connectors.length === 0 ? "" : `<li><b>${both(copy("blockWith"))}</b><pre>${esc(`[\n${connectors.map((server) => `  { "serverName": ${JSON.stringify(server.name)} }`).join(",\n")}\n]`)}</pre><span class="when">${both(copy("blockNote"))}</span></li>`;
  return `<details class="how"><summary>${both(copy("serversOut", { n: view.servers.length }))}</summary>${notes}<ul class="names">${items}${deny}</ul></details>`;
}

/** 항목 하나. 큰 숫자와 상태, 제목, 설명, 처방, 정리할 것, 위치와 이름, 단추, 어떻게 쟀나다(설계 13.1) */
function item(finding: ViewFinding, view: ReportView, lang: Lang): string {
  const status = statusOf(finding);
  const repair = finding.category === "repair";
  const gain = repair && view.score.aq !== null && finding.gain !== null ? finding.gain : null;
  const tag =
    gain === null
      ? `<span class="tag">${both(AXIS_NAMES[finding.axis])}</span>`
      : `<span class="tag up">${both(textsOf((l) => fill(SUMMARY_COPY[l].gain, { axis: AXIS_NAMES[finding.axis][l], gain })))}</span>`;
  const description = finding.text.en.description || finding.text.ko.description ? `<p>${both(textsOf((l) => finding.text[l].description))}</p>` : "";
  const prescription = finding.category !== "strength" && finding.text.en.prescription !== null ? `<p class="fix">→ ${both(textsOf((l) => finding.text[l].prescription ?? ""))}</p>` : "";
  const targets = repair ? chips(lang, REPORT_COPY.targets, finding.targets.map((name) => `<li>${esc(name)}</li>`)) : "";
  const places = finding.ruleId === "S3" ? chips(lang, REPORT_COPY.places, view.setupProblems.map((problem) => `<li>${esc(problem.place)}<small>${both(PROBLEM_KIND_COPY[problem.kind])}</small></li>`)) : "";
  const missing = finding.ruleId === "F3" ? chips(lang, REPORT_COPY.missingProjects, view.missingInstructions.map((name) => `<li>${esc(name)}</li>`)) : "";
  const overlap = finding.ruleId === "F4" && view.worstOverlap !== null ? chips(lang, REPORT_COPY.overlapProject, [`<li>${esc(view.worstOverlap)}</li>`]) : "";
  const phrase = textsOf((l) => fill(REPORT_COPY.phrase[l], { name: finding.text[l].name }));
  const button = repair && finding.targets.length > 0 ? `<button type="button" class="act" data-act="copy" data-phrase-en="${esc(phrase.en)}" data-phrase-ko="${esc(phrase.ko)}">${both(REPORT_COPY.clean)}</button>` : "";
  const how =
    finding.text.en.method.length + finding.text.ko.method.length === 0
      ? ""
      : `<details class="how"><summary>${both(REPORT_COPY.how)}</summary>${perLang((l) => `<div>${finding.text[l].method.map((line, index) => `<p${index > 0 ? ' class="ln"' : ""}>${esc(line)}</p>`).join("")}</div>`)}</details>`;
  return `<div class="it" id="it-${finding.ruleId}"><div>${figure(finding)}<span class="sev">${ICONS[status]}${both(STATUS_COPY[status])}</span></div><div><div class="top"><h3>${both(textsOf((l) => finding.text[l].title))}</h3><span class="tags">${tag}</span></div>${description}${prescription}${targets}${places}${missing}${overlap}${button}${how}${serversBlock(finding, view)}</div></div>`;
}

function header(view: ReportView, art: ReportArt, lang: Lang): string {
  const face = art.face === null ? '<span class="noart" aria-hidden="true"></span>' : `<img id="${SCRIPT_IDS.face}" src="${esc(art.face)}" alt="" width="32" height="32">`;
  // 낱말 값(찾지 못함, 저장 안 함)은 고정폭 글꼴로 쓰면 한글 사이가 벌어져 본문 글꼴로 쓴다
  const tools = view.tools.length === 0 ? `<dd class="tx">${both(REPORT_COPY.noTools)}</dd>` : `<dd>${both(textsOf((l) => view.tools.map((tool) => TOOL_NAMES[tool][l]).join(" · ")))}</dd>`;
  const round = !view.saved ? `<dd class="tx">${both(REPORT_COPY.notSaved)}</dd>` : `<dd>${view.round === null ? "—" : both(copy("roundValue", { n: view.round }))}</dd>`;
  const langButton = (code: Lang, label: string): string => `<button type="button" data-set-lang="${code}" aria-pressed="${code === lang}" lang="${code}">${label}</button>`;
  return `<header class="hd"><div><div class="brandrow">${face}<div class="brand">${both(REPORT_COPY.brand)}</div></div><h1 class="title" id="h-title">${both(REPORT_COPY.title)}</h1></div><div class="hdr"><div class="langsw" role="group"${swap(lang, { "aria-label": REPORT_COPY.langGroup })}>${langButton("en", "English")}${langButton("ko", "한국어")}</div><dl class="info"><div><dt>${both(REPORT_COPY.date)}</dt><dd>${esc(view.today)}</dd></div><div><dt>${both(REPORT_COPY.tools)}</dt>${tools}</div><div><dt>${both(REPORT_COPY.period)}</dt><dd>${esc(view.window.from.slice(5))} ~ ${esc(view.window.to.slice(5))}</dd></div><div><dt>${both(REPORT_COPY.round)}</dt>${round}</div></dl></div></header>`;
}

/** 점수 띠와 진단 띠. AQ를 내지 않았으면 점수를 못 낸 화면의 그림, "점수 없음"과 까닭이고 먼저 고칠 것은 없다(설계 13.1, 「3단계 계획 전 결정」의 6·12번) */
function hero(view: ReportView, art: ReportArt, lang: Lang): string {
  const scored = view.score.aq !== null;
  const alt = SCENE_ALT[sceneFor(view.score.tier, view.unreadable)];
  const picture = art.scene === null ? `<div class="ph" role="img"${swap(lang, { "aria-label": alt })}>${both(alt)}</div>` : `<img id="${SCRIPT_IDS.scene}" src="${esc(art.scene)}" width="264" height="264"${swap(lang, { alt })}>`;
  // 장면 아래는 AQ를 냈으면 별명, 내지 않았으면 그 까닭이다(「3단계 계획 전 결정」의 12번)
  const caption = scored
    ? `<figcaption>${both(textsOf((l) => view.text[l].grade ?? ""))}</figcaption>`
    : view.withheldText === null
      ? ""
      : `<figcaption class="why">${both(view.withheldText)}</figcaption>`;
  const score = scored
    ? `<div class="score"><div class="n">${view.score.aq}</div><div class="lb">${both(REPORT_COPY.aqLabel)}</div><div class="stamp" role="img"${swap(lang, { "aria-label": copy("gradeAria", { g: view.score.grade }) })}><div><b>${esc(view.score.grade ?? "")}</b><em>${both(REPORT_COPY.grade)}</em></div></div></div>`
    : `<div class="score"><div class="n none">${both(REPORT_COPY.noScore)}</div><div class="lb">${both(REPORT_COPY.aqLabel)}</div></div>`;
  const axes = view.axes
    .map((axis) => {
      const name = AXIS_NAMES[axis.axis];
      const counts = pairHtml(textsOf((l) => fillHtml(REPORT_COPY.axisCounts[l], { g: `<b>${groupDigits(axis.strengths)}</b>`, f: `<b>${groupDigits(axis.repairs)}</b>` })));
      if (axis.score === null) return `<div class="ax"><span class="nm">${both(name)}<span class="ct">${counts}</span></span><span class="tr none" role="img"${swap(lang, { "aria-label": textsOf((l) => fill(REPORT_COPY.axisNone[l], { axis: name[l] })) })}></span><span class="v none">${both(REPORT_COPY.unmeasured)}</span></div>`;
      return `<div class="ax"><span class="nm">${both(name)}<span class="ct">${counts}</span></span><span class="tr" role="img"${swap(lang, { "aria-label": textsOf((l) => fill(REPORT_COPY.axisAria[l], { axis: name[l], v: axis.score })) })}><i style="width:${axis.score}%"></i></span><span class="v">${axis.score}</span></div>`;
    })
    .join("");
  const rows = view.axes.map((axis) => `<tr><th scope="row">${both(AXIS_NAMES[axis.axis])}</th><td>${axis.score === null ? both(REPORT_COPY.unmeasured) : axis.score}</td><td>${axis.strengths}</td><td>${axis.repairs}</td></tr>`).join("");
  const table = `<table class="sr"><caption>${both(REPORT_COPY.axesTable)}</caption><thead><tr><th scope="col">${both(REPORT_COPY.thAxis)}</th><th scope="col">${both(REPORT_COPY.thScore)}</th><th scope="col">${both(REPORT_COPY.thGood)}</th><th scope="col">${both(REPORT_COPY.thFix)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  const best = view.findings.find((finding) => finding.category === "strength") ?? null;
  const first = scored ? (view.findings.find((finding) => finding.category === "repair") ?? null) : null;
  const bestLine =
    best === null
      ? "<div></div>"
      : `<div class="pt">${ICONS.good}<span><b>${both(REPORT_COPY.best)}</b>${both(
          textsOf((l) => {
            const text = best.text[l];
            const value = text.value === null ? REPORT_COPY.unmeasured[l] : text.unit === null ? text.value : joinValue(text.value, text.unit, l);
            return `${text.title} · ${fill(SUMMARY_COPY[l].best, { name: text.name, value })}`;
          }),
        )}</span></div>`;
  const fixLine =
    first === null
      ? ""
      : `<div class="pt">${ICONS[statusOf(first)]}<span><b>${both(REPORT_COPY.fixFirst)}</b>${both(
          textsOf((l) => `${first.text[l].title} · ${fixDetail({ ruleId: first.ruleId, axis: first.axis, gain: first.gain, measured: first.measured, candidates: first.targets.length, unmeasuredTools: first.unmeasuredTools }, l)}`),
        )}</span></div>`;
  return `<section class="hero"${swap(lang, { "aria-label": REPORT_COPY.scoreAria })}><figure class="scene"><div class="pic">${picture}</div>${caption}</figure>${score}<div class="axes">${axes}${table}</div><div class="verdict"><div><h2>${both(REPORT_COPY.verdict)}</h2><p>${both(textsOf((l) => view.text[l].diagnosis))}</p></div>${bestLine}${fixLine}</div></section>`;
}

function columns(view: ReportView, art: ReportArt, lang: Lang): string {
  const strengths = view.findings.filter((finding) => finding.category === "strength");
  const repairs = view.findings.filter((finding) => finding.category === "repair");
  const sticker = (src: string | null): string => (src === null ? "" : `<img class="stk" src="${esc(src)}" alt="" width="56" height="56">`);
  const good = strengths.length > 0 ? strengths.map((finding) => item(finding, view, lang)).join("") : `<p class="empty">${both(textsOf((l) => view.text[l].noStrengths ?? ""))}</p>`;
  const fix = repairs.length > 0 ? repairs.map((finding) => item(finding, view, lang)).join("") : `<p class="empty">${both(textsOf((l) => view.text[l].noRepairs ?? ""))}</p>`;
  return `<div class="cols"><section class="col good" aria-labelledby="h-good"><h2 id="h-good"><span class="no">01</span>${both(REPORT_COPY.colGood)}<span class="cnt">${strengths.length}</span>${sticker(art.good)}</h2>${good}</section><section class="col" aria-labelledby="h-fix"><h2 id="h-fix"><span class="no">02</span>${both(REPORT_COPY.colFix)}<span class="cnt">${repairs.length}</span>${sticker(art.fix)}</h2>${fix}</section></div>`;
}

function lists(view: ReportView, lang: Lang): string {
  const block = (key: "avgList" | "unmList", category: "average" | "unmeasured"): string => {
    const found = view.findings.filter((finding) => finding.category === category);
    const body = found.length > 0 ? found.map((finding) => item(finding, view, lang)).join("") : `<p class="empty">${both(REPORT_COPY.none)}</p>`;
    return `<details><summary>${both(REPORT_COPY[key])} <span class="cnt">${found.length}</span></summary>${body}</details>`;
  };
  return `<div class="lists">${block("avgList", "average")}${block("unmList", "unmeasured")}</div>`;
}

const stateWord = (state: CalendarCell["state"]): Texts<string> => (state === "used" ? REPORT_COPY.stUsed : state === "unused" ? REPORT_COPY.lgUnused : REPORT_COPY.lgUnseen);
const tip = (date: string, texts: Texts<string>): string => ` data-tip-en="${esc(`${date} · ${texts.en}`)}" data-tip-ko="${esc(`${date} · ${texts.ko}`)}"`;

/** 날짜별 응답 수의 달력과 그 표(설계 13.1, 13.4) */
function calendar(view: ReportView, lang: Lang): { chart: string; table: string } {
  const cells = view.usage.calendar;
  if (cells.length === 0) return { chart: `<p class="empty">${both(REPORT_COPY.none)}</p>`, table: `<p class="empty">${both(REPORT_COPY.none)}</p>` };
  const used = cells.filter((cell) => cell.state === "used");
  const busiest = used.length > 0 ? Math.max(...used.map((cell) => cell.responses)) : 0;
  const scale = Math.max(1, busiest);
  const aria = copy("calAria", { from: cells[0]!.date, to: cells.at(-1)!.date, u: used.length, n: cells.filter((cell) => cell.state === "unused").length, x: cells.filter((cell) => cell.state === "unseen").length, max: busiest });
  const pad = (new Date(dayNumber(cells[0]!.date) * 86_400_000).getUTCDay() + 6) % 7;
  const heads = WEEKDAYS.en.map((_, index) => `<span class="wd" aria-hidden="true">${both({ en: WEEKDAYS.en[index]!, ko: WEEKDAYS.ko[index]! })}</span>`).join("");
  const days = cells
    .map((cell) => {
      if (cell.state === "unseen") return `<span class="unseen"${tip(cell.date, REPORT_COPY.lgUnseen)}></span>`;
      if (cell.state === "unused" || cell.responses === 0) return `<span class="unused"${tip(cell.date, REPORT_COPY.lgUnused)}></span>`;
      const level = Math.max(0, Math.min(3, Math.floor((cell.responses / scale) * 4 - 1e-9)));
      const count = groupDigits(cell.responses);
      return `<span style="background:${RAMP[level]}"${tip(cell.date, { en: count, ko: count })}></span>`;
    })
    .join("");
  const legend = `<div class="legend"><span class="k">${both(REPORT_COPY.less)}<span class="ramp">${RAMP.map((color) => `<i style="background:${color}"></i>`).join("")}</span>${both(REPORT_COPY.more)}</span><span class="k"><i class="unused"></i>${both(REPORT_COPY.lgUnused)}</span><span class="k"><i class="unseen"></i>${both(REPORT_COPY.lgUnseen)}</span></div>`;
  const chart = `<div class="heatwrap"><div class="heat" role="img"${swap(lang, { "aria-label": aria })}>${heads}${'<span class="pad" aria-hidden="true"></span>'.repeat(pad)}${days}</div><div class="tip" aria-hidden="true"></div></div>${legend}`;
  const rows = cells.map((cell) => `<tr><td>${cell.date}</td><td class="n">${cell.state === "unseen" ? "—" : groupDigits(cell.responses)}</td><td>${both(stateWord(cell.state))}</td></tr>`).join("");
  const table = `<table class="tv"><caption class="sr">${both(aria)}</caption><thead><tr><th scope="col">${both(REPORT_COPY.thDate)}</th><th scope="col">${both(REPORT_COPY.thReplies)}</th><th scope="col">${both(REPORT_COPY.thState)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  return { chart, table };
}

/** 도구별 나눔과 그 표. 표에는 줄이지 않은 정수를 쓴다(설계 13.4) */
function tools(view: ReportView): { chart: string; table: string } {
  const list = view.usage.byTool;
  if (list.length === 0) return { chart: `<p class="empty">${both(REPORT_COPY.noTools)}</p>`, table: `<p class="empty">${both(REPORT_COPY.noTools)}</p>` };
  const width = (part: number, total: number): number => Math.round((part / (total || 1)) * 10_000) / 100;
  const row = (label: Texts<string>, value: (tool: (typeof list)[number]) => number, format: (count: number, lang: Lang) => string): string => {
    const total = list.reduce((sum, tool) => sum + value(tool), 0);
    return perLang(
      (lang) =>
        `<div class="t"><span>${esc(label[lang])}</span><b>${esc(format(total, lang))}</b><div class="splitbar" role="img" aria-label="${esc(list.map((tool) => `${TOOL_NAMES[tool.tool][lang]} ${format(value(tool), lang)}`).join(", "))}">${list.map((tool) => `<i style="width:${width(value(tool), total)}%;background:${TOOL_COLORS[tool.tool]}"></i>`).join("")}</div>${list.map((tool) => `<small><i class="sw" style="background:${TOOL_COLORS[tool.tool]}"></i>${esc(TOOL_NAMES[tool.tool][lang])} ${esc(format(value(tool), lang))}</small>`).join("")}</div>`,
    );
  };
  const chart = `<div class="tools">${row(REPORT_COPY.kMain, (tool) => tool.mainSessions, (count) => groupDigits(count))}${row(REPORT_COPY.kOut, (tool) => tool.outputTokens, shortTokens)}</div>`;
  const rows = list.map((tool) => `<tr><th scope="row">${both(TOOL_NAMES[tool.tool])}</th><td class="n">${groupDigits(tool.mainSessions)}</td><td class="n">${groupDigits(tool.outputTokens)}</td></tr>`).join("");
  const table = `<table class="tv"><caption class="sr">${both(REPORT_COPY.toolsTable)}</caption><thead><tr><th scope="col">${both(REPORT_COPY.thTool)}</th><th scope="col">${both(REPORT_COPY.kMain)}</th><th scope="col">${both(REPORT_COPY.kOut)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  return { chart, table };
}

/** 03 사용 기록. 숫자 넷, 달력, 도구별 나눔, 셸 명령 몫이다. 점검 이력 그래프는 7단계에서 넣는다(설계 13.1) */
function usage(view: ReportView, lang: Lang): string {
  const days = dayNumber(view.window.to) - dayNumber(view.window.from) + 1;
  const kpi = (value: string, label: Texts<string>): string => `<div class="kpi"><b>${value}</b><span>${both(label)}</span></div>`;
  const kpis = [
    kpi(groupDigits(view.usage.mainSessions), REPORT_COPY.kMain),
    kpi(`${view.usage.activeDays}/${days}`, REPORT_COPY.kDays),
    kpi(both(textsOf((l) => shortTokens(view.usage.outputTokens, l))), REPORT_COPY.kOut),
    kpi(view.usage.cacheHit === null ? "—" : percent(view.usage.cacheHit), REPORT_COPY.kCache),
  ].join("");
  const cal = calendar(view, lang);
  const byTool = tools(view);
  const shell = view.usage.shellNonZero === null ? "" : `<p class="shell">${both(copy("shell", { v: percent(view.usage.shellNonZero) }))}</p>`;
  return `<section class="use" aria-labelledby="h-use"><div class="usehd"><h2 id="h-use"><span class="no">03</span>${both(REPORT_COPY.use)}</h2><button type="button" class="mini-btn" data-act="table"><span class="when-chart">${both(REPORT_COPY.asTable)}</span><span class="when-table">${both(REPORT_COPY.asChart)}</span></button></div><div class="kpis">${kpis}</div><div class="grid2"><div><p class="sub">${both(REPORT_COPY.cal)}</p><div class="chart">${cal.chart}</div><div class="table tvwrap">${cal.table}</div></div><div><p class="sub">${both(REPORT_COPY.byTool)}</p><div class="chart">${byTool.chart}</div><div class="table tvwrap">${byTool.table}</div></div></div>${shell}</section>`;
}

/** 「일부만 읽었다」 띠. 점수 띠 위에 둔다. 아래 경계이면 "적어도", 비율을 낼 수 없으면 숫자 없이 적는다(설계 9.8, 20.1) */
function partialBand(view: ReportView): string {
  if (view.partialReads.length === 0) return "";
  const lines = view.partialReads.map((read) => {
    const key = read.share === null ? "partialReadUnknown" : read.lowerBound ? "partialReadAtLeast" : "partialRead";
    return `<p>${both(textsOf((l) => fill(REPORT_COPY[key][l], { tool: TOOL_NAMES[read.tool][l], share: read.share === null ? null : percent(read.share) })))}</p>`;
  });
  return `<div class="partial" role="note">${ICONS.caution}<div>${lines.join("")}</div></div>`;
}

function notices(view: ReportView): string {
  if (view.notices.length === 0) return "";
  return `<section class="notices" aria-labelledby="h-notice"><h2 id="h-notice">${both(REPORT_COPY.notices)}</h2><ul>${view.notices.map((notice) => `<li>${ICONS.info}<span>${both(notice.text)}</span></li>`).join("")}</ul></section>`;
}

/** hasCard는 카드 자료가 있는지다. 카드 단추와 창은 자료가 있을 때만 둔다 */
function footer(hasCard: boolean): string {
  const share = hasCard ? `<button type="button" class="share" data-act="card" aria-haspopup="dialog">${both(REPORT_COPY.cardBtn)}</button>` : "<span></span>";
  return `<footer class="ft"><span class="lock">${LOCK}<span>${both(textsOf((l) => `${REPORT_COPY.footCalc[l]} ${REPORT_COPY.footPromise[l]}`))}</span></span>${share}<p class="names-note">${both(REPORT_COPY.footNames)}</p></footer>`;
}

/** 공유 카드 창(설계 14). 그림은 스크립트가 그린다. 내려받기가 막히면 창의 그림을 직접 저장한다 */
function cardDialog(hasCard: boolean): string {
  if (!hasCard) return "";
  return `<dialog class="card" id="${SCRIPT_IDS.dialog}" aria-labelledby="card-title"><h2 id="card-title">${both(REPORT_COPY.cardTitle)}</h2><img class="cardimg" id="${SCRIPT_IDS.cardImage}" alt="" width="1200" height="630" hidden><p class="empty" id="${SCRIPT_IDS.cardFail}" hidden>${both(REPORT_COPY.cardFail)}</p><div class="cardft"><span>${both(REPORT_COPY.cardNote)}</span><div class="btns"><a id="${SCRIPT_IDS.cardLink}" href="#" hidden>${both(REPORT_COPY.download)}</a><button type="button" id="${SCRIPT_IDS.cardClose}">${both(REPORT_COPY.close)}</button></div></div></dialog>`;
}

/** 스크립트에 넘기는 자료. 카드에는 점수와 기준, 고정 글만 싣는다(설계 14) */
function clientData(view: ReportView): ClientData {
  const aq = view.score.aq;
  const grade = view.score.grade;
  return {
    ui: { copied: REPORT_COPY.copied, copyFail: REPORT_COPY.copyFail, copyLabel: REPORT_COPY.copyLabel },
    card:
      aq === null || grade === null
        ? null
        : {
            aq,
            grade,
            today: view.today,
            file: `${REPO}-aq-${view.today}.png`,
            brand: textsOf((l) => REPORT_COPY.brand[l].toUpperCase()),
            title: REPORT_COPY.title,
            aqLabel: REPORT_COPY.aqLabel,
            gradeLabel: REPORT_COPY.grade,
            nick: textsOf((l) => view.text[l].grade ?? ""),
            repo: REPORT_COPY.cardRepo,
            alt: textsOf((l) => fill(REPORT_COPY.cardAlt[l], { aq, grade, name: view.text[l].grade ?? "" })),
            axes: view.axes.map((axis) => ({ name: AXIS_NAMES[axis.axis], score: axis.score })),
          },
  };
}

/** 결과 화면 HTML 한 파일 */
export function reportHtml(view: ReportView, art: ReportArt): string {
  const lang = view.lang;
  const hash = createHash("sha256").update(REPORT_SCRIPT, "utf8").digest("base64");
  const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'`;
  const title = copy("pageTitle", { date: view.today });
  const client = clientData(view);
  const data = JSON.stringify(client).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="${lang}" data-ui="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title data-tr data-en-text="${esc(title.en)}" data-ko-text="${esc(title.ko)}">${esc(title[lang])}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="sr" id="${SCRIPT_IDS.live}" role="status" aria-live="polite"></div>
<main><article class="sheet" aria-labelledby="h-title">${header(view, art, lang)}${partialBand(view)}${hero(view, art, lang)}${columns(view, art, lang)}${lists(view, lang)}${usage(view, lang)}${notices(view)}${footer(client.card !== null)}</article></main>
${cardDialog(client.card !== null)}
<div class="toast" id="${SCRIPT_IDS.toast}" aria-hidden="true"></div>
<script type="application/json" id="${SCRIPT_IDS.data}">${data}</script>
<script>${REPORT_SCRIPT}</script>
</body>
</html>
`;
}
```

`src/report/style.ts`(찾을 곳 1/11):

```ts
.info dd{margin:0;font-family:var(--mono);font-size:13px;font-weight:700;white-space:nowrap}
.hero{display:grid;grid-template-columns:264px 330px 1fr;gap:26px 40px;align-items:center;padding:28px 0 26px}
```

`src/report/style.ts`(바꾼 뒤 1/11):

```ts
.info dd{margin:0;font-family:var(--mono);font-size:13px;font-weight:700;white-space:nowrap}
.info dd.tx{font-family:var(--font)}
.hero{display:grid;grid-template-columns:264px 330px 1fr;gap:26px 40px;align-items:center;padding:28px 0 26px}
```

`src/report/style.ts`(찾을 곳 2/11):

```ts
.scene figcaption{margin-top:8px;font-size:13px;font-weight:700;color:var(--ink2);text-align:center;line-height:1.4}
.score{position:relative;height:170px}
```

`src/report/style.ts`(바꾼 뒤 2/11):

```ts
.scene figcaption{margin-top:8px;font-size:13px;font-weight:700;color:var(--ink2);text-align:center;line-height:1.4}
.scene figcaption.why{text-align:left;font-weight:400;width:0;min-width:100%}
.score{position:relative;height:170px}
```

`src/report/style.ts`(찾을 곳 3/11):

```ts
.axes{display:grid;gap:12px}
.ax{display:grid;grid-template-columns:112px 1fr 48px;gap:16px;align-items:center}
.ax .nm{font-size:15px;font-weight:700;line-height:1.25}
```

`src/report/style.ts`(바꾼 뒤 3/11):

```ts
.axes{display:grid;gap:12px}
.ax{display:grid;grid-template-columns:112px 1fr 64px;gap:16px;align-items:center}
.ax .nm{font-size:15px;font-weight:700;line-height:1.25}
```

`src/report/style.ts`(찾을 곳 4/11):

```ts
.ax .v{font-family:var(--mono);font-size:20px;font-weight:700;text-align:right}
.ax .v.none{font-size:12px;font-family:var(--font);color:var(--ink2);line-height:1.2}
.ax .ct{display:block;font-size:12px;font-weight:400;color:var(--ink2);white-space:nowrap}
```

`src/report/style.ts`(바꾼 뒤 4/11):

```ts
.ax .v{font-family:var(--mono);font-size:20px;font-weight:700;text-align:right}
.ax .v.none{font-size:12px;font-family:var(--font);color:var(--ink2);line-height:1.2;overflow-wrap:normal}
.ax .ct{display:block;font-size:12px;font-weight:400;color:var(--ink2);white-space:nowrap}
```

`src/report/style.ts`(찾을 곳 5/11):

```ts
.verdict .pt svg{margin-top:2px}
.withheld{grid-column:2/-1;margin:0;font-size:14px;color:var(--ink2)}
h2{font-size:14px;letter-spacing:.06em;text-transform:uppercase;margin:0;color:var(--ink);font-weight:800}
```

`src/report/style.ts`(바꾼 뒤 5/11):

```ts
.verdict .pt svg{margin-top:2px}
h2{font-size:14px;letter-spacing:.06em;text-transform:uppercase;margin:0;color:var(--ink);font-weight:800}
```

`src/report/style.ts`(찾을 곳 6/11):

```ts
.names code{font-family:var(--mono);font-size:12px;background:#fff;border:1px solid var(--hair);border-radius:10px;padding:1px 7px;margin:0 4px 2px 0;display:inline-block}
.names .when{display:block;margin:2px 0 4px;color:var(--ink2)}
```

`src/report/style.ts`(바꾼 뒤 6/11):

```ts
.names code{font-family:var(--mono);font-size:12px;background:#fff;border:1px solid var(--hair);border-radius:10px;padding:1px 7px;margin:0 4px 2px 0;display:inline-block}
.names small{font-size:12px;color:var(--ink2);margin:0 8px 2px -2px}
.names .when{display:block;margin:2px 0 4px;color:var(--ink2)}
```

`src/report/style.ts`(찾을 곳 7/11):

```ts
.kpi b{display:block;font-size:30px;letter-spacing:-.03em;line-height:1.15;white-space:nowrap}
.kpi span{font-size:12px;color:var(--ink2)}
.sub{font-size:12px;font-weight:700;color:var(--ink2);margin:0 0 8px}
```

`src/report/style.ts`(바꾼 뒤 7/11):

```ts
.kpi b{display:block;font-size:30px;letter-spacing:-.03em;line-height:1.15;white-space:nowrap}
.kpi>span{font-size:12px;color:var(--ink2)}
.sub{font-size:12px;font-weight:700;color:var(--ink2);margin:0 0 8px}
```

`src/report/style.ts`(찾을 곳 8/11):

```ts
.heat{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.heat span{aspect-ratio:1;border-radius:3px}
.heat .wd{aspect-ratio:auto;font-size:11px;color:var(--ink2);text-align:center}
.heat .pad{visibility:hidden}
.heat .unused{background:#fff;box-shadow:inset 0 0 0 1px var(--hair)}
.heat .unseen{background:repeating-linear-gradient(135deg,#d9d7cf 0 2px,#fff 2px 5px)}
.heatwrap{position:relative}
```

`src/report/style.ts`(바꾼 뒤 8/11):

```ts
.heat{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.heat>span{aspect-ratio:1;border-radius:3px}
.heat .wd{aspect-ratio:auto;font-size:11px;color:var(--ink2);text-align:center}
.heat .pad{visibility:hidden}
.heat .unused,.legend .unused{background:#fff;box-shadow:inset 0 0 0 1px var(--hair)}
.heat .unseen,.legend .unseen{background:repeating-linear-gradient(135deg,#d9d7cf 0 2px,#fff 2px 5px)}
.heatwrap{position:relative}
```

`src/report/style.ts`(찾을 곳 9/11):

```ts
.shell{margin:16px 0 0;font-size:13px;color:var(--ink2)}
.notices{border-top:1px dashed var(--mute);padding:18px 0 16px}
```

`src/report/style.ts`(바꾼 뒤 9/11):

```ts
.shell{margin:16px 0 0;font-size:13px;color:var(--ink2)}
.partial{display:grid;grid-template-columns:20px 1fr;gap:8px;align-items:start;margin:18px 0 0;padding:10px 14px;border:1px solid #fab219;border-radius:6px;background:#fff7e0}
.partial svg{margin-top:2px}
.partial p{margin:0;font-size:14px;color:var(--ink)}
.partial p+p{margin-top:4px}
.notices{border-top:1px dashed var(--mute);padding:18px 0 16px}
```

`src/report/style.ts`(찾을 곳 10/11):

```ts
.hero{grid-template-columns:208px 1fr}.axes{grid-column:1/-1}.score{max-width:300px}
.withheld{grid-column:1/-1}
.kpis{grid-template-columns:1fr 1fr}.kpi:nth-child(odd){border-left:0}.kpi:nth-child(n+3){border-top:1px solid var(--hair)}
```

`src/report/style.ts`(바꾼 뒤 10/11):

```ts
.hero{grid-template-columns:208px 1fr}.axes{grid-column:1/-1}.score{max-width:300px}
.kpis{grid-template-columns:1fr 1fr}.kpi:nth-child(odd){border-left:0}.kpi:nth-child(n+3){border-top:1px solid var(--hair)}
```

`src/report/style.ts`(찾을 곳 11/11):

```ts
.hero{grid-template-columns:1fr}.score{height:150px;max-width:330px}.score .n{font-size:150px}
.ax{grid-template-columns:100px 1fr 44px;gap:12px}
.kpi b{font-size:24px}
```

`src/report/style.ts`(바꾼 뒤 11/11):

```ts
.hero{grid-template-columns:1fr}.score{height:150px;max-width:330px}.score .n{font-size:150px}
.ax{grid-template-columns:100px 1fr 60px;gap:12px}
.kpi b{font-size:24px}
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/report/html.test.ts test/report/script-run.test.ts test/report/assets.test.ts test/report/copy.test.ts test/report/style.test.ts test/core/result-summary.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 6개, 시험 59개.

- [ ] **Step 5: 커밋한다**

```bash
git add test/helpers/fake-dom.ts test/report/html.test.ts test/report/script-run.test.ts src/core/result/summary.ts src/report/assets.ts src/report/copy.ts src/report/html.ts src/report/style.ts
git commit -m "feat: 결과 화면 HTML 한 파일을 만드는 함수를 더함"
```

---

### Task 7: 점검이 결과 화면을 쓰고 기본 브라우저로 열기

**Files:**
- Create: `src/commands/open.ts`
- Modify: `test/commands/checkup-cli.test.ts`
- Modify: `test/commands/checkup.test.ts`
- Modify: `test/commands/run-notices.test.ts`
- Modify: `test/state/history.test.ts`
- Modify: `test/state/reports.test.ts`
- Modify: `skills/aq/scripts/aq.mjs`
- Modify: `src/cli.ts`
- Modify: `src/commands/checkup.ts`
- Modify: `src/commands/run-notices.ts`
- Modify: `src/state/history.ts`
- Modify: `src/state/reports.ts`
- Test: `test/commands/open.test.ts`

**Interfaces:**
- Consumes: 과제 1의 `assetsDirOf`와 `loadArt`, 과제 2의 `reportView`, 과제 6의 `reportHtml`, 3부의 `runCheckup`, `RunNotice`, `RunRecord`(`src/commands/checkup.ts`), `writeResult`와 `writeTempResult`(`src/state/reports.ts`), `appendHistory`(`src/state/history.ts`), 4부의 `runNoticeText`(`src/commands/run-notices.ts`), 3부의 `checkupArgs`(`src/cli.ts`).
- Produces: `writeReport(stateDir, stamp, html)`, `writeTempReport(tmpdir, stamp, html)`(`src/state/reports.ts`), `historyCount(stateDir)`(`src/state/history.ts`), `openerFor(platform, path)`, `openInBrowser(path, platform?, start?)`(`src/commands/open.ts`), `CheckupOptions.open`, `CliContext.open`, 실행 알림 `report_failed`, `report_unwritten`, `report_unopened`. `run.reportPath`와 `summary.reportPath`가 결과 화면의 경로가 된다.

설계 12.3, 13.2, 20.2, 「3단계 2부 계획에서 보완」의 4·5·6번이다.

- 결과 화면은 저장한 점검이면 결과 폴더의 `<시각>.html`(평가 결과 파일과 같은 시각이라 한 점검으로 세어 20번을 남긴다), 저장하지 않았거나 결과 폴더에 쓰지 못하면 OS 임시 폴더의 `chunsik-garage-report-<시각>.html`이다(설계 19.2의 보관 표와 같은 이름). 쓰기는 평가 결과 파일과 같이 임시 파일에 쓰고 이름을 바꾸며 실패하면 임시 파일을 남기지 않는다. 결과 화면은 결과 폴더 정리 뒤에 쓰고, 정리는 이번 점검의 시각을 늘 남긴다.
- 회차는 저장한 점검일 때 이력의 줄 수(빈 줄은 세지 않는다)이고, 이력을 읽지 못하면 줄표다. 저장하지 않은 점검은 "저장 안 함"이다.
- 여는 것은 `--no-open`이 없을 때만이다. 운영체제의 열기 프로그램에 경로 하나만 넘기고(셸 없음, 창 없음, 기다리지 않음) 띄우지 못하면 실행 알림에 적는다. 결과 화면을 쓰지 못했으면 열지 않는다. 시험은 여는 함수를 바꿔 넣어 브라우저를 열지 않는다(명령줄 시험의 기본 문맥에도 넣었다).
- 3부와 4부의 시험 가운데 결과 화면의 경로가 `null`이라고 본 것과 결과 폴더의 파일 수를 센 것을 새 동작에 맞게 고쳤다(결과 폴더에 이번 점검의 `.html`이 하나 더 있다. 상태 폴더에 쓰지 못한 점검은 결과 화면이 임시 폴더로 간다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`test/commands/checkup-cli.test.ts`(찾을 곳 1/4):

```ts
// 명령 입구의 aq checkup을 시험한다. 받는 옵션, 처음 보일 언어의 차례, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 13.2, 20.1)
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 1/4):

```ts
// 명령 입구의 aq checkup을 시험한다. 받는 옵션, 결과 화면을 여는지, 처음 보일 언어의 차례, 표준 출력에는 요약과 실행 기록만 내는 것, 모르는 옵션을 거절하는 것이다(설계 7.4, 12.3, 13.2, 20.1)
```

`test/commands/checkup-cli.test.ts`(찾을 곳 2/4):

```ts
  context = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed"), locale: "en-US" };
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 2/4):

```ts
  context = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed"), locale: "en-US", open: async () => true };
```

`test/commands/checkup-cli.test.ts`(찾을 곳 3/4):

```ts
  it("요약과 실행 기록만 JSON으로 내고 0을 돌려준다. 평가 결과는 결과 폴더에 쓴다", async () => {
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 3/4):

```ts
  it("--no-open이 없으면 쓴 결과 화면을 열고, 있으면 열지 않는다", async () => {
    const open = vi.fn(async () => true);
    expect(await main(["checkup", "--no-save"], { ...context, open })).toBe(0);
    expect(open).toHaveBeenCalledWith(JSON.parse(printed).run.reportPath);
    printed = "";
    open.mockClear();
    expect(await main(["checkup", "--no-save", "--no-open"], { ...context, open })).toBe(0);
    expect(open).not.toHaveBeenCalled();
    expect(JSON.parse(printed).run.reportPath).toMatch(/[.]html$/);
  });

  it("요약과 실행 기록만 JSON으로 내고 0을 돌려준다. 평가 결과와 결과 화면은 결과 폴더에 쓴다", async () => {
```

`test/commands/checkup-cli.test.ts`(찾을 곳 4/4):

```ts
    expect(output.run).toMatchObject({ saved: true, reportPath: null, notices: [] });
    expect(await readdir(join(root, "home", ".chunsik-garage", "reports"))).toEqual([output.run.resultPath.split(/[\\/]/).pop()]);
```

`test/commands/checkup-cli.test.ts`(바꾼 뒤 4/4):

```ts
    expect(output.run).toMatchObject({ saved: true, reportPath: join(root, "home", ".chunsik-garage", "reports", "2026-11-12T03-00-00-000Z.html"), notices: [] });
    expect((await readdir(join(root, "home", ".chunsik-garage", "reports"))).sort()).toEqual([output.run.reportPath, output.run.resultPath].map((path: string) => path.split(/[\\/]/).pop()));
```

`test/commands/checkup.test.ts`(찾을 곳 1/10):

```ts
import { appendHistory } from "../../src/state/history.ts";
import { resultStamp, writeResult } from "../../src/state/reports.ts";
import { newState, saveState } from "../../src/state/state.ts";
```

`test/commands/checkup.test.ts`(바꾼 뒤 1/10):

```ts
import { appendHistory } from "../../src/state/history.ts";
import { resultStamp, writeReport, writeResult } from "../../src/state/reports.ts";
import { newState, saveState } from "../../src/state/state.ts";
```

`test/commands/checkup.test.ts`(찾을 곳 2/10):

```ts
describe("저장하는 점검", () => {
  it("결과 파일, 이력 한 줄, 상태(마지막 점검 시각과 관측 기록), 캐시를 남기고 요약과 실행 기록을 낸다", async () => {
    const outcome = await runCheckup(options());
    const resultPath = join(stateDir, "reports", `${STAMP}.json`);
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: true, reportPath: null, resultPath, notices: [], text: { notices: [] } });
    expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual(outcome.result);
    const history = (await readFile(join(stateDir, "history.jsonl"), "utf8")).trim().split("\n");
```

`test/commands/checkup.test.ts`(바꾼 뒤 2/10):

```ts
describe("저장하는 점검", () => {
  it("결과 파일, 결과 화면, 이력 한 줄, 상태(마지막 점검 시각과 관측 기록), 캐시를 남기고 요약과 실행 기록을 낸다", async () => {
    const outcome = await runCheckup(options());
    const resultPath = join(stateDir, "reports", `${STAMP}.json`);
    const reportPath = join(stateDir, "reports", `${STAMP}.html`);
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: true, reportPath, resultPath, notices: [], text: { notices: [] } });
    expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual(outcome.result);
    // 결과 화면은 HTML 한 파일이고 경로를 담지 않는다(이 시험의 홈은 임시 폴더 아래다)
    const html = await readFile(reportPath, "utf8");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    for (const form of [root, root.replaceAll("\\", "/")]) expect(html).not.toContain(form);
    const history = (await readFile(join(stateDir, "history.jsonl"), "utf8")).trim().split("\n");
```

`test/commands/checkup.test.ts`(찾을 곳 3/10):

```ts
    expect((await readdir(join(stateDir, "cache", "claude-code"))).length).toBe(2);
    expect(outcome.summary).toMatchObject({ aq: outcome.result.score.aq, reportPath: null });
  });
```

`test/commands/checkup.test.ts`(바꾼 뒤 3/10):

```ts
    expect((await readdir(join(stateDir, "cache", "claude-code"))).length).toBe(2);
    expect(outcome.summary).toMatchObject({ aq: outcome.result.score.aq, reportPath });
  });
```

`test/commands/checkup.test.ts`(찾을 곳 4/10):

```ts
    expect(state.salt).toBe(salt);
    expect(await readdir(join(stateDir, "reports"))).toEqual([`${STAMP}.json`]);
  });
```

`test/commands/checkup.test.ts`(바꾼 뒤 4/10):

```ts
    expect(state.salt).toBe(salt);
    expect((await readdir(join(stateDir, "reports"))).sort()).toEqual([`${STAMP}.html`, `${STAMP}.json`]);
  });
```

`test/commands/checkup.test.ts`(찾을 곳 5/10):

```ts
    const reports = await readdir(join(stateDir, "reports"));
    expect(reports).toHaveLength(20);
    expect(reports).toContain(`${STAMP}.json`);
    await rm(join(home, ".claude", "projects", "p-proj", "s2.jsonl"));
```

`test/commands/checkup.test.ts`(바꾼 뒤 5/10):

```ts
    const reports = await readdir(join(stateDir, "reports"));
    // 한 점검의 결과 화면과 평가 결과 파일은 한 번으로 센다. 이번 점검의 두 파일과 앞선 19번이 남는다
    expect(reports).toHaveLength(21);
    expect(reports).toContain(`${STAMP}.json`);
    expect(reports).toContain(`${STAMP}.html`);
    await rm(join(home, ".claude", "projects", "p-proj", "s2.jsonl"));
```

`test/commands/checkup.test.ts`(찾을 곳 6/10):

```ts
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
    expect(await readdir(join(stateDir, "reports"))).toHaveLength(20);
  });
```

`test/commands/checkup.test.ts`(바꾼 뒤 6/10):

```ts
    expect(JSON.parse(await readFile(outcome.run.resultPath!, "utf8"))).toEqual(outcome.result);
    expect(await readdir(join(stateDir, "reports"))).toHaveLength(21);
  });
```

`test/commands/checkup.test.ts`(찾을 곳 7/10):

```ts
    expect(outcome.run.notices).toEqual([{ kind: "prune_skipped", what: "reports", link: "reports" }]);
    expect(await readdir(elsewhere)).toHaveLength(22);
  });
```

`test/commands/checkup.test.ts`(바꾼 뒤 7/10):

```ts
    expect(outcome.run.notices).toEqual([{ kind: "prune_skipped", what: "reports", link: "reports" }]);
    expect(await readdir(elsewhere)).toHaveLength(23);
  });
});

describe("결과 화면", () => {
  it("결과 폴더에 쓰지 못하면 OS 임시 폴더에 쓰고 알린다. 저장은 끝난다", async () => {
    await mkdir(join(stateDir, "reports", `${STAMP}.html`), { recursive: true });
    const expected = await blockedCode(
      (dir) => mkdir(join(dir, "reports", `${STAMP}.html`), { recursive: true }),
      (dir) => writeReport(dir, STAMP, "<p>"),
    );
    const outcome = await runCheckup(options());
    expect(outcome.run.saved).toBe(true);
    expect(outcome.run.notices).toEqual([{ kind: "report_failed", code: expected }]);
    expect(outcome.run.reportPath).toBe(join(tmp, `chunsik-garage-report-${STAMP}.html`));
    expect(outcome.summary.reportPath).toBe(outcome.run.reportPath);
  });

  it("회차는 이력의 줄 수이고, 저장하지 않은 점검은 저장 안 함이다", async () => {
    await runCheckup(options());
    const second = await runCheckup(options({ lang: "ko" }));
    expect(await readFile(second.run.reportPath!, "utf8")).toContain('<span lang="ko" data-l="ko">2회</span>');
    const unsaved = await runCheckup(options({ save: false }));
    expect(await readFile(unsaved.run.reportPath!, "utf8")).toContain('<dd class="tx"><span lang="en" data-l="en">Not saved</span>');
  });

  it("여는 함수를 주면 쓴 결과 화면을 열고, 열지 못하면 알린다", async () => {
    const opened: string[] = [];
    const ok = await runCheckup(options({ open: async (path) => (opened.push(path), true) }));
    expect(opened).toEqual([ok.run.reportPath]);
    expect(ok.run.notices).toEqual([]);
    const failed = await runCheckup(options({ open: async () => false }));
    expect(failed.run.notices).toEqual([{ kind: "report_unopened" }]);
    expect(failed.run.text.notices).toEqual(["Could not open the report page in a browser. Open the file at the report path."]);
  });

  it("결과 화면을 쓰지 못했으면 열지 않는다", async () => {
    const opened: string[] = [];
    const outcome = await runCheckup(options({ save: false, tmpdir: join(root, "missing", "tmp"), open: async (path) => (opened.push(path), true) }));
    expect(outcome.run.reportPath).toBeNull();
    expect(opened).toEqual([]);
  });
```

`test/commands/checkup.test.ts`(찾을 곳 8/10):

```ts
    const outcome = await runCheckup(options({ save: false }));
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: false, reportPath: null, resultPath: join(tmp, `chunsik-garage-result-${STAMP}.json`), notices: [{ kind: "not_saved" }], text: { notices: ["This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history."] } });
    await expect(readdir(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
```

`test/commands/checkup.test.ts`(바꾼 뒤 8/10):

```ts
    const outcome = await runCheckup(options({ save: false }));
    expect(outcome.run).toEqual({ durationMs: 250, cachedFiles: 0, saved: false, reportPath: join(tmp, `chunsik-garage-report-${STAMP}.html`), resultPath: join(tmp, `chunsik-garage-result-${STAMP}.json`), notices: [{ kind: "not_saved" }], text: { notices: ["This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history."] } });
    await expect(readdir(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
```

`test/commands/checkup.test.ts`(찾을 곳 9/10):

```ts
    expect(outcome.run.resultPath).toBeNull();
    expect(outcome.run.notices).toEqual([{ kind: "not_saved" }, { kind: "result_unwritten", code: "ENOENT" }]);
  });
```

`test/commands/checkup.test.ts`(바꾼 뒤 9/10):

```ts
    expect(outcome.run.resultPath).toBeNull();
    expect(outcome.run.reportPath).toBeNull();
    expect(outcome.run.notices).toEqual([{ kind: "not_saved" }, { kind: "result_unwritten", code: "ENOENT" }, { kind: "report_unwritten", code: "ENOENT" }]);
  });
```

`test/commands/checkup.test.ts`(찾을 곳 10/10):

```ts
    const outcome = await runCheckup(options());
    const printed = JSON.stringify({ summary: outcome.summary, run: { ...outcome.run, resultPath: null } });
    expect(printed).not.toContain("secret");
```

`test/commands/checkup.test.ts`(바꾼 뒤 10/10):

```ts
    const outcome = await runCheckup(options());
    const printed = JSON.stringify({ summary: { ...outcome.summary, reportPath: null }, run: { ...outcome.run, resultPath: null, reportPath: null } });
    expect(printed).not.toContain("secret");
```

`test/commands/open.test.ts`(새 파일):

```ts
// 결과 화면을 기본 브라우저로 여는 것을 시험한다. 운영체제마다의 열기 프로그램, 셸 없이 경로 하나만 넘기는 것, 띄우지 못하면 거짓을 돌려주는 것이다(설계 13.2, 20.1)
import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { openerFor, openInBrowser } from "../../src/commands/open.ts";

const PATH = "C:\\Users\\a b & c\\.chunsik-garage\\reports\\2026-11-14T00-00-00-000Z.html";

/** spawn 대신 쓰는 것. 부른 인자를 모으고, 다음 차례에 spawn이나 error 사건을 낸다. throws면 부르자마자 던진다 */
function fakeSpawn(outcome: "spawn" | "error" | "throws") {
  const calls: unknown[][] = [];
  const unref = vi.fn();
  const start = (...args: unknown[]) => {
    calls.push(args);
    if (outcome === "throws") throw new Error("bad arguments");
    const child = Object.assign(new EventEmitter(), { unref });
    queueMicrotask(() => (outcome === "spawn" ? child.emit("spawn") : child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))));
    return child;
  };
  return { start: start as unknown as typeof spawn, calls, unref };
}

describe("결과 화면 열기", () => {
  it("운영체제마다 파일을 기본 프로그램으로 여는 프로그램에 경로 하나만 넘긴다. 모르는 운영체제면 null이다", () => {
    expect(openerFor("win32", PATH)).toEqual({ command: "explorer.exe", args: [PATH] });
    expect(openerFor("darwin", PATH)).toEqual({ command: "open", args: [PATH] });
    expect(openerFor("linux", PATH)).toEqual({ command: "xdg-open", args: [PATH] });
    expect(openerFor("aix", PATH)).toBeNull();
  });

  it("셸 없이, 창 없이, 끝나기를 기다리지 않고 띄운다. 띄우면 참이다", async () => {
    const fake = fakeSpawn("spawn");
    expect(await openInBrowser(PATH, "win32", fake.start)).toBe(true);
    expect(fake.calls).toEqual([["explorer.exe", [PATH], { detached: true, stdio: "ignore", windowsHide: true, shell: false }]]);
    expect(fake.unref).toHaveBeenCalledTimes(1);
  });

  it("열기 프로그램을 띄우지 못하면(없다, 인자를 거절했다) 거짓이다. 모르는 운영체제면 띄우지 않고 거짓이다", async () => {
    expect(await openInBrowser(PATH, "linux", fakeSpawn("error").start)).toBe(false);
    expect(await openInBrowser(PATH, "darwin", fakeSpawn("throws").start)).toBe(false);
    const unknown = fakeSpawn("spawn");
    expect(await openInBrowser(PATH, "aix", unknown.start)).toBe(false);
    expect(unknown.calls).toEqual([]);
  });
});
```

`test/commands/run-notices.test.ts`(찾을 곳 1/2):

```ts
// 실행 기록의 알림 다섯 종류의 문장을 본다. 두 언어로 만들고 오류 코드와 정해진 낱말만 넣는다(설계 12.3, 20.2)
import { describe, expect, it } from "vitest";
```

`test/commands/run-notices.test.ts`(바꾼 뒤 1/2):

```ts
// 실행 기록의 알림 여덟 종류의 문장을 본다. 두 언어로 만들고 오류 코드와 정해진 낱말만 넣는다(설계 12.3, 20.2)
import { describe, expect, it } from "vitest";
```

`test/commands/run-notices.test.ts`(찾을 곳 2/2):

```ts
  { kind: "result_unwritten", code: "ENOENT" },
];
```

`test/commands/run-notices.test.ts`(바꾼 뒤 2/2):

```ts
  { kind: "result_unwritten", code: "ENOENT" },
  { kind: "report_failed", code: "EPERM" },
  { kind: "report_unwritten", code: "ENOENT" },
  { kind: "report_unopened" },
];
```

`test/state/history.test.ts`(찾을 곳 1/2):

```ts
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxisScore, Overall } from "../../src/core/scoreboard.ts";
import { appendHistory, HISTORY_FILE, historyEntry } from "../../src/state/history.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
```

`test/state/history.test.ts`(바꾼 뒤 1/2):

```ts
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxisScore, Overall } from "../../src/core/scoreboard.ts";
import { appendHistory, HISTORY_FILE, historyCount, historyEntry } from "../../src/state/history.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
```

`test/state/history.test.ts`(찾을 곳 2/2):

```ts
    expect(await readFile(join(dir, HISTORY_FILE), "utf8")).toBe(`${JSON.stringify(entry)}\n`);
  });
});
```

`test/state/history.test.ts`(바꾼 뒤 2/2):

```ts
    expect(await readFile(join(dir, HISTORY_FILE), "utf8")).toBe(`${JSON.stringify(entry)}\n`);
  });
});

describe("이력의 줄 수(결과 화면의 회차)", () => {
  it("파일이 없으면 0이고, 덧붙인 줄을 센다. 빈 줄은 세지 않는다", async () => {
    expect(await historyCount(dir)).toBe(0);
    const entry = historyEntry({ rulesVersion: "1.0.0", score: scored, axes: axes(88, 74, 69, 97) }, Date.UTC(2026, 10, 13));
    await appendHistory(dir, entry);
    await appendHistory(dir, entry);
    expect(await historyCount(dir)).toBe(2);
    await writeFile(join(dir, HISTORY_FILE), `${JSON.stringify(entry)}\n\n${JSON.stringify(entry)}\n  \n`);
    expect(await historyCount(dir)).toBe(2);
  });
});
```

`test/state/reports.test.ts`(찾을 곳 1/2):

```ts
import { removeFiles } from "../../src/state/folder.ts";
import { KEEP_REPORTS, pruneReports, resultStamp, staleReports, writeResult, writeTempResult } from "../../src/state/reports.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";
```

`test/state/reports.test.ts`(바꾼 뒤 1/2):

```ts
import { removeFiles } from "../../src/state/folder.ts";
import { KEEP_REPORTS, pruneReports, resultStamp, staleReports, writeReport, writeResult, writeTempReport, writeTempResult } from "../../src/state/reports.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";
```

`test/state/reports.test.ts`(찾을 곳 2/2):

```ts

  it("저장 없는 실행은 임시 폴더에 chunsik-garage-result-<시각>.json으로 쓴다", async () => {
```

`test/state/reports.test.ts`(바꾼 뒤 2/2):

```ts

  it("결과 화면은 같은 시각의 <시각>.html로 결과 폴더에 쓴다. 저장 없는 실행은 임시 폴더에 chunsik-garage-report-<시각>.html로 쓴다", async () => {
    const stamp = stampAt(3);
    const path = await writeReport(dir, stamp, "<!doctype html>\n");
    expect(path).toBe(join(dir, "reports", `${stamp}.html`));
    expect(await readFile(path, "utf8")).toBe("<!doctype html>\n");
    expect(await readdir(join(dir, "reports"))).toEqual([`${stamp}.html`]);
    const temp = await writeTempReport(root, stamp, "<p>");
    expect(temp).toBe(join(root, `chunsik-garage-report-${stamp}.html`));
    expect(await readFile(temp, "utf8")).toBe("<p>");
  });

  it("결과 화면을 쓰지 못하면 임시 파일을 남기지 않는다", async () => {
    const stamp = stampAt(3);
    await mkdir(join(dir, "reports", `${stamp}.html`), { recursive: true });
    await expect(writeReport(dir, stamp, "<p>")).rejects.toBeDefined();
    expect(await readdir(join(dir, "reports"))).toEqual([`${stamp}.html`]);
  });

  it("저장 없는 실행은 임시 폴더에 chunsik-garage-result-<시각>.json으로 쓴다", async () => {
```

- [ ] **Step 2: 시험을 돌려 실패를 확인한다**

Run: `npx vitest run test/commands/checkup-cli.test.ts test/commands/checkup.test.ts test/commands/open.test.ts test/commands/run-notices.test.ts test/state/history.test.ts test/state/reports.test.ts`
Expected: FAIL. 결과 화면 쓰기, 회차, 열기, 새 실행 알림을 기대하는 시험 18개가 실패한다(`checkup` 10, `run-notices` 3, `checkup-cli` 2, `reports` 2, `history` 1). `test/commands/open.test.ts`는 `../../src/commands/open.ts`를 찾지 못해 불러오기에서 실패한다.

- [ ] **Step 3: 구현한다**

`skills/aq/scripts/aq.mjs`: 손으로 고치지 않는다. 아래 단계의 `npm run build`가 원본에서 다시 만든다.

`src/cli.ts`(찾을 곳 1/5):

```ts
import { runCheckup } from "./commands/checkup.ts";
import { pickLang } from "./core/copy/lang.ts";
```

`src/cli.ts`(바꾼 뒤 1/5):

```ts
import { runCheckup } from "./commands/checkup.ts";
import { openInBrowser } from "./commands/open.ts";
import { pickLang } from "./core/copy/lang.ts";
```

`src/cli.ts`(찾을 곳 2/5):

```ts
  locale?: string;
}

/** aq checkup이 받는 옵션. --no-open은 결과 화면(3단계)을 열지 않는 것이라 지금은 할 일이 없다. --lang은 값을 하나 받는다 */
const CHECKUP_FLAGS: ReadonlySet<string> = new Set(["--no-open", "--no-save", "--rescan"]);
```

`src/cli.ts`(바꾼 뒤 2/5):

```ts
  locale?: string;
  /** 결과 화면을 여는 것. 주지 않으면 기본 브라우저로 연다. 시험이 바꾼다 */
  open?: (path: string) => Promise<boolean>;
}

/** aq checkup이 받는 옵션. --no-open은 결과 화면을 열지 않는다. --lang은 값을 하나 받는다 */
const CHECKUP_FLAGS: ReadonlySet<string> = new Set(["--no-open", "--no-save", "--rescan"]);
```

`src/cli.ts`(찾을 곳 3/5):

```ts
  if (args !== null) {
    const outcome = await runCheckup({
```

`src/cli.ts`(바꾼 뒤 3/5):

```ts
  if (args !== null) {
    const platform = context.platform ?? process.platform;
    const open = context.open ?? ((path: string) => openInBrowser(path, platform));
    const outcome = await runCheckup({
```

`src/cli.ts`(찾을 곳 4/5):

```ts
      tmpdir: context.tmpdir ?? tmpdir(),
      platform: context.platform ?? process.platform,
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
```

`src/cli.ts`(바꾼 뒤 4/5):

```ts
      tmpdir: context.tmpdir ?? tmpdir(),
      platform,
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
```

`src/cli.ts`(찾을 곳 5/5):

```ts
      ...(context.managedDir === undefined ? {} : { managedDir: context.managedDir }),
    });
```

`src/cli.ts`(바꾼 뒤 5/5):

```ts
      ...(context.managedDir === undefined ? {} : { managedDir: context.managedDir }),
      ...(args.flags.has("--no-open") ? {} : { open }),
    });
```

`src/commands/checkup.ts`(찾을 곳 1/6):

```ts
// aq checkup을 돌린다. 상태를 열고, 입력 묶음을 모아 평가하고, 평가 결과를 결과 폴더(저장하지 않는 실행이면 OS 임시 폴더)에 쓰고, 상태와 이력을 고치고, 오래된 결과와 원본이 없어진 캐시를 정리한다. 상태 폴더에 쓰다가 막히면 남은 저장을 멈추고 저장 없는 실행으로 바꾼다(설계 7.4, 12.2, 12.3, 18.1, 19.2, 20.1, 20.2)
import { join } from "node:path";
```

`src/commands/checkup.ts`(바꾼 뒤 1/6):

```ts
// aq checkup을 돌린다. 상태를 열고, 입력 묶음을 모아 평가하고, 평가 결과와 결과 화면을 결과 폴더(저장하지 않는 실행이면 OS 임시 폴더)에 쓰고, 상태와 이력을 고치고, 오래된 결과와 원본이 없어진 캐시를 정리하고, 결과 화면을 연다. 상태 폴더에 쓰다가 막히면 남은 저장을 멈추고 저장 없는 실행으로 바꾼다(설계 7.4, 12.2, 12.3, 18.1, 19.2, 20.1, 20.2)
import { join } from "node:path";
```

`src/commands/checkup.ts`(찾을 곳 2/6):

```ts
import { checkupSummary, type CheckupSummary } from "../core/result/summary.ts";
import { pruneCache } from "../state/cache.ts";
import { appendHistory, historyEntry } from "../state/history.ts";
import { nextState, openState } from "../state/next-state.ts";
import { KEEP_REPORTS, pruneReports, resultStamp, writeResult, writeTempResult } from "../state/reports.ts";
import { saveState } from "../state/state.ts";
```

`src/commands/checkup.ts`(바꾼 뒤 2/6):

```ts
import { checkupSummary, type CheckupSummary } from "../core/result/summary.ts";
import { assetsDirOf, loadArt } from "../report/assets.ts";
import { reportHtml } from "../report/html.ts";
import { reportView } from "../report/view.ts";
import { pruneCache } from "../state/cache.ts";
import { appendHistory, historyCount, historyEntry } from "../state/history.ts";
import { nextState, openState } from "../state/next-state.ts";
import { KEEP_REPORTS, pruneReports, resultStamp, writeReport, writeResult, writeTempReport, writeTempResult } from "../state/reports.ts";
import { saveState } from "../state/state.ts";
```

`src/commands/checkup.ts`(찾을 곳 3/6):

```ts
  now?: () => number;
}
```

`src/commands/checkup.ts`(바꾼 뒤 3/6):

```ts
  now?: () => number;
  /** 결과 화면을 여는 것. 주지 않으면(--no-open) 열지 않는다. 열지 못하면 거짓이다 */
  open?: (path: string) => Promise<boolean>;
}
```

`src/commands/checkup.ts`(찾을 곳 4/6):

```ts
  /** OS 임시 폴더에도 평가 결과 파일을 쓰지 못했다 */
  | { kind: "result_unwritten"; code: string };

```

`src/commands/checkup.ts`(바꾼 뒤 4/6):

```ts
  /** OS 임시 폴더에도 평가 결과 파일을 쓰지 못했다 */
  | { kind: "result_unwritten"; code: string }
  /** 저장한 점검의 결과 화면을 결과 폴더에 쓰지 못했다. OS 임시 폴더에 쓴다 */
  | { kind: "report_failed"; code: string }
  /** OS 임시 폴더에도 결과 화면을 쓰지 못했다 */
  | { kind: "report_unwritten"; code: string }
  /** 결과 화면을 브라우저로 열지 못했다. 경로는 실행 기록의 reportPath에 있다 */
  | { kind: "report_unopened" };

```

`src/commands/checkup.ts`(찾을 곳 5/6):

```ts
  saved: boolean;
  /** 결과 화면의 경로. 결과 화면은 3단계에 만든다 */
  reportPath: string | null;
```

`src/commands/checkup.ts`(바꾼 뒤 5/6):

```ts
  saved: boolean;
  /** 결과 화면의 경로. 쓰지 못했으면 null */
  reportPath: string | null;
```

`src/commands/checkup.ts`(찾을 곳 6/6):

```ts

  const run: RunRecord = { durationMs: now() - started, cachedFiles: gathered.collected.read.fromCache, saved, reportPath: null, resultPath, notices, text: { notices: notices.map((notice) => runNoticeText(notice, options.lang)) } };
  return { summary: checkupSummary(result, null), run, result };
}
```

`src/commands/checkup.ts`(바꾼 뒤 6/6):

```ts

  // 결과 화면. 저장한 점검은 결과 폴더에, 저장하지 않았거나 결과 폴더에 쓰지 못하면 OS 임시 폴더에 쓴다. 회차는 이력의 줄 수다(설계 13.1, 13.2, 20.2)
  const round = saved ? await historyCount(options.stateDir).catch(() => null) : null;
  const view = reportView(result, { saved, round });
  const repairs = view.findings.filter((finding) => finding.category === "repair").length;
  const html = reportHtml(view, await loadArt(assetsDirOf(options.entryFile), { tier: result.score.tier, unreadable: view.unreadable, repairs }));
  let reportPath: string | null = null;
  if (saved) {
    try {
      reportPath = await writeReport(options.stateDir, stamp, html);
    } catch (error) {
      notices.push({ kind: "report_failed", code: codeOf(error) });
    }
  }
  if (reportPath === null) {
    try {
      reportPath = await writeTempReport(options.tmpdir, stamp, html);
    } catch (error) {
      notices.push({ kind: "report_unwritten", code: codeOf(error) });
    }
  }
  if (reportPath !== null && options.open !== undefined && !(await options.open(reportPath))) notices.push({ kind: "report_unopened" });

  const run: RunRecord = { durationMs: now() - started, cachedFiles: gathered.collected.read.fromCache, saved, reportPath, resultPath, notices, text: { notices: notices.map((notice) => runNoticeText(notice, options.lang)) } };
  return { summary: checkupSummary(result, reportPath), run, result };
}
```

`src/commands/open.ts`(새 파일):

```ts
// 결과 화면을 운영체제의 기본 브라우저로 연다. 셸을 거치지 않고 열기 프로그램에 경로 하나만 넘기며, 창을 띄우지 않고 끝나기를 기다리지 않는다(설계 13.2, 20.1)
import { spawn } from "node:child_process";

/** 운영체제마다 파일을 기본 프로그램으로 여는 명령. 모르는 운영체제면 null이다 */
export function openerFor(platform: NodeJS.Platform, path: string): { command: string; args: string[] } | null {
  if (platform === "win32") return { command: "explorer.exe", args: [path] };
  if (platform === "darwin") return { command: "open", args: [path] };
  if (platform === "linux" || platform === "freebsd" || platform === "openbsd") return { command: "xdg-open", args: [path] };
  return null;
}

/** 열기 프로그램을 띄운다. 띄우면 참이고, 띄우지 못하면(프로그램이 없다, 인자를 거절했다, 모르는 운영체제다) 거짓이다. 브라우저가 실제로 열렸는지는 알 수 없다 */
export function openInBrowser(path: string, platform: NodeJS.Platform = process.platform, start: typeof spawn = spawn): Promise<boolean> {
  const opener = openerFor(platform, path);
  if (opener === null) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const child = start(opener.command, opener.args, { detached: true, stdio: "ignore", windowsHide: true, shell: false });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
```

`src/commands/run-notices.ts`(찾을 곳 1/4):

```ts
// 실행 기록의 알림 다섯 종류의 문장. 오류 코드와 정해진 낱말만 넣고 경로는 넣지 않는다(순수 함수, 설계 12.3, 20.2)
import type { Lang, Texts } from "../core/copy/lang.ts";
```

`src/commands/run-notices.ts`(바꾼 뒤 1/4):

```ts
// 실행 기록의 알림 여덟 종류의 문장. 오류 코드와 정해진 낱말만 넣고 경로는 넣지 않는다(순수 함수, 설계 12.3, 20.2)
import type { Lang, Texts } from "../core/copy/lang.ts";
```

`src/commands/run-notices.ts`(찾을 곳 2/4):

```ts
    result_unwritten: "Could not write the result file to the OS temp folder ({code}), so only the summary is given.",
  },
```

`src/commands/run-notices.ts`(바꾼 뒤 2/4):

```ts
    result_unwritten: "Could not write the result file to the OS temp folder ({code}), so only the summary is given.",
    report_failed: "Could not write the report page to the state folder ({code}).",
    report_unwritten: "Could not write the report page to the OS temp folder ({code}), so there is no report page this time.",
    report_unopened: "Could not open the report page in a browser. Open the file at the report path.",
  },
```

`src/commands/run-notices.ts`(찾을 곳 3/4):

```ts
    result_unwritten: "평가 결과 파일을 운영체제 임시 폴더에 쓰지 못해({code}) 요약만 냅니다.",
  },
```

`src/commands/run-notices.ts`(바꾼 뒤 3/4):

```ts
    result_unwritten: "평가 결과 파일을 운영체제 임시 폴더에 쓰지 못해({code}) 요약만 냅니다.",
    report_failed: "결과 화면을 상태 폴더에 쓰지 못했습니다({code}).",
    report_unwritten: "결과 화면을 운영체제 임시 폴더에 쓰지 못해({code}) 이번에는 결과 화면이 없습니다.",
    report_unopened: "결과 화면을 브라우저로 열지 못했습니다. 결과 화면의 경로에 있는 파일을 여세요.",
  },
```

`src/commands/run-notices.ts`(찾을 곳 4/4):

```ts
      return fill(lines.result_unwritten, { code: notice.code });
  }
```

`src/commands/run-notices.ts`(바꾼 뒤 4/4):

```ts
      return fill(lines.result_unwritten, { code: notice.code });
    case "report_failed":
      return fill(lines.report_failed, { code: notice.code });
    case "report_unwritten":
      return fill(lines.report_unwritten, { code: notice.code });
    case "report_unopened":
      return lines.report_unopened;
  }
```

`src/state/history.ts`(찾을 곳 1/2):

```ts
// 점수 이력(history.jsonl)에 점검마다 한 줄(시각, AQ, 기준 점수, 빠진 기준, 규칙 버전)을 더한다. 결과 화면의 이력 그래프가 읽는다(설계 12.3, 18.1)
import { appendFile, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { Axis } from "../core/rules.ts";
```

`src/state/history.ts`(바꾼 뒤 1/2):

```ts
// 점수 이력(history.jsonl)에 점검마다 한 줄(시각, AQ, 기준 점수, 빠진 기준, 규칙 버전)을 더하고 줄 수를 센다. 결과 화면의 회차와 이력 그래프가 읽는다(설계 12.3, 13.1, 18.1)
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Axis } from "../core/rules.ts";
```

`src/state/history.ts`(찾을 곳 2/2):

```ts
  await appendFile(path, `${prefix}${JSON.stringify(entry)}\n`);
}
```

`src/state/history.ts`(바꾼 뒤 2/2):

```ts
  await appendFile(path, `${prefix}${JSON.stringify(entry)}\n`);
}

/** 이력의 줄 수(빈 줄은 세지 않는다). 파일이 없으면 0이다. 결과 화면의 회차다(설계 13.1) */
export async function historyCount(stateDir: string): Promise<number> {
  let text;
  try {
    text = await readFile(join(stateDir, HISTORY_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  return text.split("\n").filter((line) => line.trim() !== "").length;
}
```

`src/state/reports.ts`(찾을 곳 1/5):

```ts
// 평가 결과 파일을 결과 폴더(reports/)나 OS 임시 폴더에 쓰고, 결과 폴더에서 최근 20번의 점검만 남긴다. 이름의 시각은 평가 시계를 UTC로 적어 글자 차례가 시각 차례다(설계 12.3, 13.2, 19.2)
import { lstat, mkdir, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
```

`src/state/reports.ts`(바꾼 뒤 1/5):

```ts
// 평가 결과 파일과 결과 화면을 결과 폴더(reports/)나 OS 임시 폴더에 쓰고, 결과 폴더에서 최근 20번의 점검만 남긴다. 이름의 시각은 평가 시계를 UTC로 적어 글자 차례가 시각 차례다(설계 12.3, 13.2, 19.2)
import { lstat, mkdir, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
```

`src/state/reports.ts`(찾을 곳 2/5):

```ts
const TEMP_PREFIX = "chunsik-garage-result-";
/** 이 도구가 결과 폴더에 쓰는 이름. 시각 뒤에 결과 화면(.html)이나 평가 결과 파일(.json)이 붙는다 */
```

`src/state/reports.ts`(바꾼 뒤 2/5):

```ts
const TEMP_PREFIX = "chunsik-garage-result-";
/** 저장 없는 실행의 결과 화면 이름 앞머리(설계 19.2의 보관 표) */
const TEMP_REPORT_PREFIX = "chunsik-garage-report-";
/** 이 도구가 결과 폴더에 쓰는 이름. 시각 뒤에 결과 화면(.html)이나 평가 결과 파일(.json)이 붙는다 */
```

`src/state/reports.ts`(찾을 곳 3/5):

```ts
/** 임시 파일에 쓰고 이름을 바꾼다. 실패하면 임시 파일을 남기지 않는다 */
async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
```

`src/state/reports.ts`(바꾼 뒤 3/5):

```ts
/** 임시 파일에 쓰고 이름을 바꾼다. 실패하면 임시 파일을 남기지 않는다 */
async function writeText(path: string, text: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, text);
    await rename(temporary, path);
```

`src/state/reports.ts`(찾을 곳 4/5):

```ts

/** 결과 폴더에 <시각>.json으로 쓰고 경로를 돌려준다. 같은 이름이 있으면 덮어쓴다 */
```

`src/state/reports.ts`(바꾼 뒤 4/5):

```ts

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** 결과 폴더에 <시각>.json으로 쓰고 경로를 돌려준다. 같은 이름이 있으면 덮어쓴다 */
```

`src/state/reports.ts`(찾을 곳 5/5):

```ts

export interface StaleReports {
```

`src/state/reports.ts`(바꾼 뒤 5/5):

```ts

/** 결과 화면을 결과 폴더에 <시각>.html로 쓰고 경로를 돌려준다. 같은 시각의 평가 결과 파일과 한 점검으로 센다(설계 13.2) */
export async function writeReport(stateDir: string, stamp: string, html: string): Promise<string> {
  const reports = join(stateDir, REPORTS_DIR);
  await mkdir(reports, { recursive: true });
  const path = join(reports, `${stamp}.html`);
  await writeText(path, html);
  return path;
}

/** 저장 없는 실행이나 결과 폴더에 쓰지 못한 점검의 결과 화면. OS 임시 폴더에 쓰고 경로를 돌려준다(설계 20.2) */
export async function writeTempReport(tmpdir: string, stamp: string, html: string): Promise<string> {
  const path = join(tmpdir, `${TEMP_REPORT_PREFIX}${stamp}.html`);
  await writeText(path, html);
  return path;
}

export interface StaleReports {
```

- [ ] **Step 4: 시험과 타입 검사가 통과하는지 확인한다**

Run: `npx tsc --noEmit && npx vitest run test/commands/open.test.ts test/commands/checkup.test.ts test/commands/checkup-cli.test.ts test/commands/run-notices.test.ts test/state/reports.test.ts test/state/history.test.ts test/cli.test.ts`
Expected: PASS. 타입 검사 오류 없음, 시험 파일 7개, 시험 65개.

- [ ] **Step 5: 묶은 실행 파일을 다시 만든다**

점검이 결과 화면을 부르므로 묶은 실행 파일을 원본에서 다시 만든다. 손으로 고치지 않는다.

Run: `npm run build`
Expected: `묶음 완료: skills/aq/scripts/aq.mjs`.

- [ ] **Step 6: 커밋한다**

```bash
git add test/commands/checkup-cli.test.ts test/commands/checkup.test.ts test/commands/open.test.ts test/commands/run-notices.test.ts test/state/history.test.ts test/state/reports.test.ts skills/aq/scripts/aq.mjs src/cli.ts src/commands/checkup.ts src/commands/open.ts src/commands/run-notices.ts src/state/history.ts src/state/reports.ts
git commit -m "feat: 점검이 결과 화면을 쓰고 브라우저로 여는 것을 더함"
```

---

### Task 8: 전체 검사, 실제 결과 화면 확인, 병합 요청, 짝 검증, 병합

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`

**Interfaces:**
- Consumes: 과제 1~7의 결과물 전부.
- Produces: `develop`에 병합된 3단계 2부. `aq checkup`이 결과 화면을 쓰고 연다. 4단계(스킬과 터미널)가 기대는 것은 `summary.reportPath`, `run.reportPath`, 실행 알림 여덟과 그 문장이다.

- [ ] **Step 1: 전체 검사를 돌린다**

Run: `npm run check`
Expected: 타입 검사 통과, 시험 파일 84개·시험 1,251개 통과(3단계 1부까지의 75개·1,174개에 이 계획이 더한 것), 마지막 줄이 `묶음 검사 통과`. Windows 밖에서는 2단계 1부의 시험 1개를 건너뛴다.

- [ ] **Step 2: 묶음을 다시 만들어도 그대로인지 확인한다**

과제 7에서 묶어 커밋한 실행 파일이 원본과 맞는지 본다.

Run: `npm run build && git status --short skills/aq/scripts/aq.mjs`
Expected: 빌드가 `묶음 완료: skills/aq/scripts/aq.mjs`를 내며 성공하고, 뒤의 `git status --short skills/aq/scripts/aq.mjs`는 아무것도 내지 않는다.

- [ ] **Step 3: Node.js 22에서도 돌린다**

Run: `npx -y -p node@22 -- node --version` → `v22.`로 시작하는지 본다.
Run: `npx -y -p node@22 -- node node_modules/vitest/vitest.mjs run`
Expected: 24에서와 같은 수의 시험이 모두 PASS. 막히면 짝 검증에 넘기고 병합 요청 본문에 "22에서는 돌리지 못했다"고 적는다.

- [ ] **Step 4: 빈 홈과 이 PC의 기록으로 저장 없이 돌려 결과 화면 파일을 본다**

묶은 실행 파일로 점검한다. 상태 폴더에는 쓰지 않고 브라우저도 열지 않는다. 빈 홈은 그 실행에서만 `USERPROFILE`과 `HOME`을 빈 임시 폴더로 바꾸고 `CLAUDE_CONFIG_DIR`을 지운다. 부모 셸의 환경은 바꾸지 않는다.

Run: `node skills/aq/scripts/aq.mjs checkup --no-save --no-open --lang ko`(빈 홈)
Expected: 종료 코드 0. `run.reportPath`와 `summary.reportPath`가 같고 OS 임시 폴더의 `chunsik-garage-report-<시각>.html`이다. 파일이 `<!doctype html>`로 시작하고, 그림 넷(`data:image/webp`)이 들었으며, 카드 단추(`data-act="card"`)가 없고, 빈 홈의 경로가 없다.

Run: `node skills/aq/scripts/aq.mjs checkup --no-save --no-open --lang ko`(이 PC의 홈)
Expected: 종료 코드 0. 위와 같은 꼴의 결과 화면 파일이고, 이 PC의 홈 경로(역슬래시 꼴과 빗금 꼴 모두)와 상태 폴더 경로가 파일에 없다. AQ를 냈으면 카드 단추가 하나 있다. 숫자와 이름은 저장소 밖 작업 기록에만 적는다. 두 결과 화면 파일은 Step 5에서 열어 보므로 아직 지우지 않는다.

- [ ] **Step 5: 실제 결과 화면을 이고라이트로 확인한다**

Step 4의 두 결과 화면과, 이 PC에 없는 경우를 보이려고 시험 도우미로 지어낸 결과(정비 후보와 [정리하기], 판정에서 뺀 서버와 claude.ai 연결, 설정 문제, 같은 이름 프로젝트)로 만든 결과 화면을 연다. 이고라이트 창은 시작 전에 올리고 끝나면 내린다(사용자 전역 지침). 화면 사진은 저장소 밖에 두고 직접 열어 본다. CSP 위반은 문서가 시작될 때 수신기를 먼저 달아 모은다(이고라이트에서 `page.cdp("Page.addScriptToEvaluateOnNewDocument", …)`로 `securitypolicyviolation` 수신기를 단 뒤 화면을 연다). 이 방법이 듣는지는 스크립트 해시를 틀리게 한 사본을 먼저 열어 위반이 잡히고 스크립트가 돌지 않는 것으로 확인한다.

- 폭 1440, 1024, 840, 390에서 가로 넘침이 없다(문서의 `scrollWidth`가 `clientWidth`보다 크지 않다). 단추와 펼치기의 높이가 44px 이상이다.
- 언어를 바꾸면 문서의 `data-ui`와 `lang`, 쪽 제목, 언어 묶음의 이름, 단추의 눌림, 장면의 대체 글이 바뀌고, 펼쳐 둔 항목과 초점이 그대로이며, 다른 언어의 글이 하나도 보이지 않는다. 복사 알림이나 말풍선이 떠 있을 때 언어를 바꾸면 닫힌다.
- 두 언어 단추를 키보드로 하나씩 방문하면 고른 단추와 고르지 않은 단추 모두 초점 테두리가 보인다(폭 390과 1440의 화면 사진으로 본다).
- AQ가 없는 화면에서 장면 아래에 AQ를 내지 않은 까닭이 그림 폭 안에 있고, 같은 글이 다른 자리에 없다.
- [정리하기]는 복사에 성공하면 알림을 보이고, 복사가 막히면(`navigator.clipboard.writeText`를 거절하게 바꿔) 글상자에 붙여 넣을 말을 골라 둔 채 초점을 옮기며, 언어를 바꾸면 글상자의 말도 바뀐다.
- 표로 보기는 달력과 도구별 나눔을 표로 바꾸고 단추의 글이 바뀐다. 달력의 칸에 마우스를 올리면 그 날의 말풍선이 지금 언어로 보인다.
- [카드로 저장]은 모달 창으로 열리고(`dialog.matches(":modal")`가 참, 열자마자 초점이 닫기 단추, Escape로 닫힘) 두 언어에서 1200×630 그림을 그리고, 내려받기 이름이 `chunsik-garage-aq-<점검일>.png`이며, 창을 닫으면 단추로 초점이 돌아온다. 카드에 스킬, 서버, 프로젝트의 이름이 없다. AQ가 없는 화면에는 단추가 없다.
- 판정에서 뺀 서버 칸, S3의 위치 칩, F3과 F4의 프로젝트 칩이 두 언어로 보인다.
- 일부만 읽은 결과(지어낸 결과에 읽지 못한 비율을 넣는다)에서 「일부만 읽었다」 띠가 머리 아래, 점수 띠 위에 두 언어로 보이고 넘침이 없다.
- 문서가 시작될 때부터 모은 CSP 위반이 실제 결과 화면마다 0건이다(틀린 사본에서는 잡혀야 한다).

화면 확인이 끝나면 Step 4의 결과 파일, 결과 화면 파일, 지어낸 결과 화면을 지운다.

- [ ] **Step 6: 기본 브라우저로 여는 것을 본다**

Run: `node skills/aq/scripts/aq.mjs checkup --no-save --lang ko`
Expected: 종료 코드 0. 기본 브라우저에 결과 화면이 열리고(창 제목이 「AQ 점검 명세서 · <점검일>」) 실행 알림에 `report_unopened`가 없다. 연 탭을 확인한 뒤 닫고, 이 실행이 OS 임시 폴더에 만든 결과 파일과 결과 화면 파일을 지운다.

- [ ] **Step 7: 원장을 고치고 커밋한다**

원장의 3단계 2부 구현 과제는 진행으로 두고, 커밋 해시와 확인한 것, 짝 검증과 병합을 기다린다는 것을 세부에 적는다. 끝남은 Step 10에서 병합하고 병합한 develop을 검사한 뒤에 적는다. 원장은 node로 고친다(메모리 `task-master-register-every-task`).

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 3단계 2부 구현 결과를 적음"
```

- [ ] **Step 8: 올리고 병합 요청을 만든다**

본문을 `%TEMP%\aq-pr-stage3-2.md`(저장소 밖 임시 폴더)에 한국어로 쓴다. 절은 「바꾼 것」(과제 1~7의 결과물), 「로컬에서 돌린 검사」(`npm run check`의 시험 수와 결과, Node.js 22 결과, 빈 홈과 이 PC의 기록으로 만든 결과 화면 파일의 모양, 이고라이트로 본 화면, 기본 브라우저로 연 것), 「확인하지 못한 것」이다. 확인하지 못한 것에는 아래를 적는다. macOS와 Linux에서 여는 것, 실제 휴대폰, 화면 읽기 프로그램, Chrome 계열이 아닌 브라우저는 보지 않았다. 작성자 PC의 등급 밖의 장면과 진단은 지어낸 결과로만 봤다. 이 PC의 숫자, 경로, 이름과 화면 사진은 넣지 않는다.

```bash
git push -u origin 3단계-2-결과화면
gh pr create --base develop --head 3단계-2-결과화면 --title "feat: 3단계 2부 결과 화면과 공유 카드" --body-file "$TEMP/aq-pr-stage3-2.md"
```

- [ ] **Step 9: 짝 검증을 받는다(병합 앞의 관문)**

새 짝 Codex를 만들어(3단계 2부 구현 전용, 정독과 실행·화면이 다 무거우므로 둘) 다음을 나눠 맡긴다. 한 짝은 코드 정독이다. 설계 13, 14, 12.3, 19.1, 20.2와 「3단계 계획 전 결정」, 「3단계 2부 계획에서 보완」을 이 계획의 코드와 대조하고, 결과 화면에 경로와 HTML로 풀리는 이름이 들어갈 길, CSP를 넘는 길, 언어를 바꿀 때 바뀌지 않는 글이나 속성을 반례로 찾는다. 다른 짝은 실행과 화면이다. `npm run check`와 Node.js 22를 다시 돌리고, 지어낸 홈과 지어낸 결과로 결과 화면을 만들어 Step 5의 목록을 이고라이트로 직접 보고, 결과 화면 쓰기와 열기의 실패(결과 폴더 자리 막힘, 임시 폴더 없음, 여는 프로그램 없음)를 재현한다. 두 짝에게 서로의 결론을 미리 알려 주지 않는다. 필수 지적은 같은 브랜치에서 새 커밋으로 고치고, 지적한 짝이 다시 본다. 고친 뒤에는 그 부분만이 아니라 기능 전체를 다시 본다. 짝과 주 세션 모두 필수 지적이 0건이 될 때까지 돈다. 검증 결과를 병합 요청 본문의 「짝 검증」 절에 더한다(`gh pr edit 3단계-2-결과화면 --body-file "$TEMP/aq-pr-stage3-2.md"`).

- [ ] **Step 10: 병합한다**

필수 지적이 0건이면 주 세션이 묻지 않고 병합한다. 사용자가 병합을 주 세션에 맡겼지만, 그것은 묻지 않고 병합할 권한이지 검증을 미룰 근거가 아니어서 Step 9 뒤에 둔다. 병합 커밋 제목은 한국어다.

```bash
gh pr merge 3단계-2-결과화면 --merge --subject "feat: 3단계 2부 결과 화면을 develop에 병합"
git switch develop && git pull --ff-only
```

병합한 develop에서 `npm run check`를 한 번 더 돌린다(병합 결과는 아무도 시험한 적이 없다). 통과하면 원장의 과제를 끝남으로 바꾸고 병합 커밋과 검사 결과를 세부에 적어 develop에 커밋하고 올린다.

```bash
git add .taskmaster/tasks/tasks.json
git commit -m "chore: 원장에 3단계 2부 병합 결과를 적음"
git push origin develop
```

병합이 끝난 원격 브랜치는 되살리기 스크립트를 남기고 정리한다(메모리 `clean-merged-remote-branches`).

---

## 4단계와 그 뒤에 넘기는 것

2부가 만들지 않고 뒤가 다룰 것이다.

| 무엇 | 단계 | 2부가 남긴 재료 |
|---|---|---|
| 스킬이 결과 화면의 경로를 사용자에게 알리는 틀, 열지 못했을 때(`report_unopened`)와 쓰지 못했을 때의 안내, 터미널에서 AQ가 없을 때 먼저 고칠 것의 줄을 옮기지 않는 것 | 4단계 | `summary.reportPath`, `run.reportPath`, 실행 알림 여덟과 그 문장 |
| macOS와 Linux에서 기본 브라우저로 여는 것을 실제 기기에서 확인 | 4단계(배포 전) | `openerFor`의 `open`, `xdg-open` |
| Codex의 기록과 결과 화면의 Codex 몫(도구 이름, 도구별 나눔의 색) | 5단계 | `TOOL_NAMES`, `TOOL_COLORS`, 두 언어의 고정 글 |
| 점검 이력 그래프, [정밀 점검] 단추와 단서의 문구 | 7단계 | 이력(`history.jsonl`), 결과의 정밀 점검 단서, 사용 기록 칸의 자리 |
| 정비([정리하기]가 복사하는 말을 받아 실제로 고치는 것) | 6단계 | 붙여 넣을 말(「춘식이 정비소 정비: <규칙 이름>」), 결과의 정비 후보 |

---

## 자기 점검

### 설계의 요구가 어느 과제에 있는지

| 설계 | 요구 | 과제 |
|---|---|---|
| 13.1 | 머리(얼굴, 브랜드, 정보 표와 회차), 점수 띠(장면, AQ와 도장, 네 기준과 잘함·정비 수), 진단 띠(진단, 가장 잘하는 것, 먼저 고칠 것), 두 단과 스티커, 항목(큰 숫자, 상태, 제목, 설명, 처방, 예상 효과, 단추, 어떻게 쟀나), 보통과 잴 수 없음 목록, 사용 기록(숫자 넷, 달력, 도구별 나눔, 셸 명령 몫), 알림, 꼬리 | 2, 3, 4, 6, 7(회차) |
| 13.1, 「3단계 계획 전 결정」 1·5·6·10번 | 못 잰 규칙의 큰 숫자 자리, AQ가 없을 때 꼬리표와 먼저 고칠 것과 카드가 없음, 판정에서 뺀 서버의 이름과 날의 줄, 이름 칩(S3, F3, F4) | 2, 6 |
| 13.2 | HTML 한 파일, 바깥 요청 없음, 저장 위치와 20개, 열기와 열지 못하면 경로, 두 언어와 처음 언어, [정리하기]의 복사와 막힐 때의 글상자, 색 | 5, 6, 7 |
| 13.3, 「3단계 계획 전 결정」 12번 | 그림의 자리와 크기, 장면 고르기, 스티커 둘, 대체 글, WebP와 50KB 안쪽 | 1, 3, 6 |
| 13.4 | 폭에 따른 배치, 44px 단추, 키보드와 초점, 언어를 바꿔도 펼침과 초점 유지, 상태의 아이콘과 낱말, 움직임 줄이기, 표로 보기, 긴 이름 | 5, 6(문서 대역 위의 동작 시험), 8(화면 확인) |
| 14, 「3단계 계획 전 결정」 2번 | 카드 1의 배치, 1200×630, 화면의 언어, 이름과 경로 없음, AQ가 없으면 단추 없음, 내려받기가 막히면 그림을 띄움 | 5, 6(문서 대역 위의 동작 시험), 8(화면 확인) |
| 12.3 | 실행 기록과 요약의 결과 화면 경로, 결과 화면 파일의 자리 | 7 |
| 9.8, 20.1 | 읽지 못한 비율이 20%를 넘거나 아래 경계이면 결과 화면 위쪽의 「일부만 읽었다」 띠(아래 경계는 "적어도", 비율을 낼 수 없으면 숫자 없이) | 2, 3, 6 |
| 19.1, 「3단계 계획 전 결정」 10번 | 그리는 칸만 담고 절대 경로를 넣지 않음, 프로젝트는 폴더 이름 | 2, 6 |
| 20.2 | 저장하지 않는 실행과 쓰지 못하는 곳에서 결과 화면을 임시 폴더에, 거기도 못 쓰면 알림 | 7 |
| 「3단계 계획 전 결정」 11번 | 고정 글의 두 언어 | 3 |
| 「3단계 2부 계획에서 보완」 1~11번 | 범위(1), 두 언어(2), CSP(3), 파일과 실패(4), 열기(5), 회차(6), 그림(7), E6 칸(8), 카드 자료(9), 복사와 표(10), 「일부만 읽었다」 띠(11) | 1(7), 2·6(8), 5·6(2·3·9·10), 7(4·5·6), 2·3·6(11) |

2부에 넣지 않은 것은 「4단계와 그 뒤에 넘기는 것」에 적었다.

### 빈칸과 이름

- 빈칸 표현("나중에", "비슷하게", 채우지 않은 자리)을 찾았고 없다.
- 과제마다의 시험과 구현은 연습 작업 폴더에서 시험을 통과한 커밋의 내용을 그대로 옮겼다(이 문서를 만드는 도구가 커밋에서 읽어 넣었다). 손으로 옮겨 적은 코드는 없다. 그림 파일은 크기와 지문만 적었다.
- 과제의 「Produces」에 적은 이름과 모양은 뒤 과제의 「Consumes」와 코드에서 쓰는 것과 같다. 과제마다 타입 검사를 돌려 확인했다.

### 이 계획을 돌려 본 것

이 문서에서 코드 블록을 기계로 뽑아(저장소 밖의 도구) `develop`의 새 복제본(`130d56c`. 코드는 `92e97a3`과 같다)에서 과제 1부터 7까지 차례대로 만들었다(Windows 11, Node.js 24). 새 파일은 통째로 쓰고, 고친 파일은 찾을 곳이 한 번만 나오는지 확인한 뒤 바꿨으며, 그림 파일은 연습 작업 폴더에서 가져와 계획에 적힌 크기와 지문이 같은지 봤다. 과제 1~7은 시험만 놓고 돌리면 실패하고(실패한 시험의 수와 파일은 시험 커밋마다 따로 세어 과제의 Expected와 맞는지 봤다), 구현을 놓으면 그 과제의 확인 명령(타입 검사와 관계있는 시험)이 통과했다. 과제 7의 묶은 실행 파일 다시 만들기도 통과했다. 과제 7 뒤의 `npm run check`는 시험 파일 84개·시험 1,251개가 통과했고 `묶음 검사 통과`였다. 다시 묶어도 묶은 실행 파일은 달라지지 않았다. 다 만든 복제본의 코드, 시험, 그림 파일 217개는 시험을 통과한 연습 작업 폴더의 파일과 글자 하나 다르지 않았다(문서와 원장은 연습 작업 폴더가 앞 버전을 들고 있어 견주지 않았다).

연습 작업 폴더에서 따로 확인한 것은 이렇다. 계획 리뷰 1~4차에서 두 짝이 든 변이와 주 세션의 변이 38개(이름을 글로 바꾸는 곳 하나씩 뺌, JSON 보호 뺌, 언어 표시와 속성 옮기기와 그 목록 확인 뺌, 복사 글상자와 초점, 알림과 말풍선 닫기, 표 전환, 카드 크기, 카드 창을 닫은 뒤 초점, 카드를 못 그린 알림, 점수 없는 장면 아래의 까닭, 등급 없는 카드 단추, 카드 창을 모달 없이 엶, 캔버스 함수 이름 오타, 겹친 복사 요청의 늦은 거절, 「일부만 읽었다」 띠 없음, 아래 경계의 "적어도" 뺌, 띠 자료를 모든 도구로, 카드 큰 숫자 글꼴의 px 뺌, 띠 문장에서 「적어도」 뺌, 등급·이름표·기준 이름 글꼴의 px 뺌, 색 오타, 정렬 오타, 선 굵기를 글로, 글꼴 크기 뒤에 빗금, 글꼴 이름을 숫자로)를 하나씩 넣어 모두 시험이 잡았다. 묶은 실행 파일로 이 PC의 기록을 저장 없이 점검해 OS 임시 폴더에 결과 화면 파일이 생기고 그림 넷이 들어간 것을 봤고, `--no-open` 없이 한 번 돌려 Windows의 기본 브라우저(Chrome)에 결과 화면이 열린 것을 봤다. 이 PC의 기록, 기록이 없는 빈 홈, 시험 도우미로 지어낸 결과(정비 후보와 [정리하기], 판정에서 뺀 서버와 claude.ai 연결 둘, 설정 문제 둘, 같은 이름 프로젝트)로 결과 화면을 만들어 이고라이트로 폭 1440, 1280, 1024, 840, 390에서 열었다. 가로 넘침과 44px보다 작은 누름 대상이 없었고, 두 언어 바꾸기(문서 언어, 쪽 제목, 속성, 펼친 항목과 초점), 언어 단추 둘의 키보드 초점 테두리(폭 390과 1440), 복사 성공과 막힘(글상자, 초점, 언어를 바꾸면 글도 바뀜), 표로 보기, 달력의 말풍선, 공유 카드(두 언어, 1200×630, 내려받기 이름, 창을 닫으면 초점이 돌아옴), AQ가 없는 화면(장면과 그 아래의 까닭, 점수 없음, 먼저 고칠 것과 카드 단추 없음), 일부만 읽은 결과의 「일부만 읽었다」 띠(두 언어, 폭 1440과 390, 머리 아래 점수 띠 위)가 기대대로였다. 문서가 시작될 때 단 수신기로 모은 CSP 위반은 결과 화면 셋에서 0건이었고, 스크립트 해시를 틀리게 한 사본에서는 위반 1건이 잡히고 스크립트가 돌지 않았다.

확인하지 못한 것은 이렇다. macOS와 Linux에서 돌리고 여는 것, 실제 휴대폰, 화면 읽기 프로그램, Chrome 계열이 아닌 브라우저는 보지 않았다. 실제 기록으로는 한 등급의 화면만 볼 수 있어, 다른 등급의 장면과 진단, 판정에서 뺀 서버와 S3 문제의 칸은 지어낸 결과로만 봤다. 문서 대역은 이 저장소가 만드는 HTML과 그 스크립트가 쓰는 만큼만 흉내 내므로 브라우저의 그리기, 초점 이동, 클립보드 권한은 보증하지 않는다(그것은 과제 8의 화면 확인이 본다).
