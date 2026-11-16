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
