// 도구 버전 읽기와 견주기, 가장 높은 버전 고르기를 시험한다(설계 9.3)
import { describe, expect, it } from "vitest";
import { compareVersions, maxVersion, parseVersion } from "../../../src/adapters/common/version.ts";

describe("version", () => {
  it("글자가 아니라 숫자로 견준다", () => {
    expect(compareVersions(parseVersion("2.1.99")!, parseVersion("2.1.257")!)).toBeLessThan(0);
  });
  it("세 숫자 꼴이 아니면 읽지 못한 것이다", () => {
    expect(parseVersion("2.1")).toBeNull();
    expect(parseVersion("2.1.3-beta")).toBeNull();
    expect(parseVersion(5)).toBeNull();
  });
  it("가장 높은 것을 고르고 읽지 못한 것은 뺀다", () => {
    expect(maxVersion(["2.1.250", null, "x", "2.1.300"])).toBe("2.1.300");
  });
  it("앞자리가 큰 쪽이 높다", () => {
    expect(maxVersion(["9.9.9", "10.0.0"])).toBe("10.0.0");
  });
  it("읽을 수 있는 것이 하나도 없으면 null(버전 모름)", () => {
    expect(maxVersion(["", undefined])).toBeNull();
  });
});
