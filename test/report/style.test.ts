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
