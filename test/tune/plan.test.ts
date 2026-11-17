// 정비 계획의 확인한 버전 범위, 계획 ID, 저장을 시험한다(설계 16.2 끝, 16.5의 1번, 「6단계 1부 계획 전 결정」 5·7번)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planIdOf, TUNE_VERIFIED, versionVerified, writePlan, type TunePlan } from "../../src/tune/plan.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

describe("확인한 버전 범위", () => {
  it("Claude Code는 2.1.220부터 2.1.325까지, Codex는 0.166.0이다. 그 밖이거나 버전을 모르면 확인한 범위 밖이다. 제미나이는 기록에 버전이 없어 늘 범위 밖이다", () => {
    expect(TUNE_VERIFIED).toEqual({ "claude-code": { from: "2.1.220", to: "2.1.325" }, codex: { from: "0.166.0", to: "0.166.0" }, gemini: { from: "0.68.0", to: "0.68.0" } });
    expect(versionVerified("gemini", null)).toBe(false);
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
