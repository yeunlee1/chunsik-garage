// AQ 배지 그림(SVG)을 시험한다. 점수와 등급만 들어가고, 바깥을 부르는 것이 없고, 등급마다 색이 정해져 있다(설계 「0.2.0에서 정한 것」)
import { describe, expect, it } from "vitest";
import { BADGE_COLORS, badgeSvg } from "../../src/report/badge.ts";

const GRADES = ["S", "A", "B", "C", "D"] as const;
const widthOf = (svg: string): number => Number(/^<svg [^>]*\bwidth="(\d+)"/.exec(svg)![1]);

describe("AQ 배지 그림", () => {
  it("왼쪽은 AQ, 오른쪽은 점수와 등급이고, 화면 읽기 프로그램이 읽을 이름이 있다", () => {
    const svg = badgeSvg({ aq: 82, grade: "A" });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>\n")).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="AQ 82 · A"');
    expect(svg).toContain("<title>AQ 82 · A</title>");
    expect(svg).toContain(">AQ</text>");
    expect(svg).toContain(">82 · A</text>");
    expect(svg).toContain(`fill="${BADGE_COLORS.A}"`);
  });

  it("등급마다 색이 다르고, 그 등급의 배지에는 그 색만 쓴다", () => {
    expect(new Set(GRADES.map((grade) => BADGE_COLORS[grade])).size).toBe(GRADES.length);
    for (const grade of GRADES) {
      const svg = badgeSvg({ aq: 70, grade });
      expect(svg).toContain(`fill="${BADGE_COLORS[grade]}"`);
      for (const other of GRADES) if (other !== grade) expect(svg).not.toContain(BADGE_COLORS[other]);
    }
  });

  it("바깥 주소, 스크립트, 바깥 글꼴을 부르지 않는다", () => {
    for (const grade of GRADES) {
      // 이름 공간 주소는 요청이 아니다. 그것을 빼면 주소가 하나도 없어야 한다
      const svg = badgeSvg({ aq: 100, grade }).replace('xmlns="http://www.w3.org/2000/svg"', "");
      expect(svg).not.toMatch(/https?:|href|<script|url\(|@import|@font-face|<image|<foreignObject/i);
    }
  });

  it("같은 점수는 같은 그림이고, 글자가 길면 폭이 넓다", () => {
    expect(badgeSvg({ aq: 82, grade: "A" })).toBe(badgeSvg({ aq: 82, grade: "A" }));
    expect(widthOf(badgeSvg({ aq: 100, grade: "S" }))).toBeGreaterThan(widthOf(badgeSvg({ aq: 9, grade: "D" })));
  });
});
