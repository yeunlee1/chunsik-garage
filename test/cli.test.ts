// 명령 입구의 Node.js 버전 확인과 하위 명령 나누기를 시험한다
import { describe, expect, it } from "vitest";
import { main, nodeMajorOk } from "../src/cli.ts";

describe("nodeMajorOk", () => {
  it("22 이상만 받는다", () => {
    expect(nodeMajorOk("v22.0.0")).toBe(true);
    expect(nodeMajorOk("v24.18.0")).toBe(true);
    expect(nodeMajorOk("v20.11.1")).toBe(false);
    expect(nodeMajorOk("garbage")).toBe(false);
  });
});

describe("main", () => {
  it("--version은 0을 돌려준다", async () => {
    expect(await main(["--version"])).toBe(0);
  });
  it("모르는 명령은 64를 돌려준다", async () => {
    expect(await main(["nope"])).toBe(64);
  });
});
