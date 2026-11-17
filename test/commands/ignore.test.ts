// aq ignore add|remove|list를 임시 홈으로 시험한다. 사용자가 일부러 둔 규칙을 상태에 적고 빼며, 모르는 규칙과 깨진 상태 파일은 거절한다(설계 「0.3.0에서 정한 것」, 다른 PC 피드백 5번)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runIgnore } from "../../src/commands/ignore.ts";
import { loadState } from "../../src/state/state.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let home: string;
let stateDir: string;
beforeEach(async () => {
  home = await makeTemp();
  stateDir = join(home, ".chunsik-garage");
});
afterEach(async () => removeTemp(home));

const kept = async (): Promise<unknown> => {
  const loaded = await loadState(stateDir);
  return loaded.status === "ok" ? (loaded.state.ignoredRules ?? []) : loaded.status;
};

describe("aq ignore", () => {
  it("더하면 규칙을 상태에 적고, 빼면 지우며, 목록은 지금 둔 규칙을 알린다. 같은 규칙을 두 번 더해도 하나다", async () => {
    expect((await runIgnore("list", null, { stateDir, lang: "ko" })).ignored).toEqual([]);
    const added = await runIgnore("add", "F1", { stateDir, lang: "ko" });
    expect(added.ignored).toEqual(["F1"]);
    expect(added.run.text).toBe("「가장 높은 추론 강도의 몫」 항목은 정한 대로 두고, 고칠 목록과 다음 등급 차례에서 뺐습니다. 점수에는 그대로 들어갑니다.");
    await runIgnore("add", "e4", { stateDir, lang: "ko" });
    await runIgnore("add", "F1", { stateDir, lang: "ko" });
    expect(await kept()).toEqual(["E4", "F1"]);
    const listed = await runIgnore("list", null, { stateDir, lang: "en" });
    expect(listed.run.text).toBe('Kept as you chose: "Always-loaded instructions", "Highest effort share".');
    const removed = await runIgnore("remove", "F1", { stateDir, lang: "ko" });
    expect([removed.ignored, removed.run.text]).toEqual([["E4"], "「가장 높은 추론 강도의 몫」 항목을 다시 고칠 목록에 넣었습니다."]);
    expect(await kept()).toEqual(["E4"]);
  });

  it("모르는 규칙이나 규칙이 없는 더하기·빼기는 unknown-rule로 거절하고 상태를 바꾸지 않는다", async () => {
    await expect(runIgnore("add", "Z9", { stateDir, lang: "ko" })).rejects.toMatchObject({ code: "unknown-rule" });
    await expect(runIgnore("remove", null, { stateDir, lang: "ko" })).rejects.toMatchObject({ code: "unknown-rule" });
    expect(await kept()).toBe("missing");
  });

  it("상태 파일이 깨졌으면 더하거나 빼지 않고 state-broken으로 끝낸다. 목록은 빈 것으로 알린다", async () => {
    await put(join(stateDir, "state.json"), "{");
    await expect(runIgnore("add", "F1", { stateDir, lang: "ko" })).rejects.toMatchObject({ code: "state-broken" });
    expect((await runIgnore("list", null, { stateDir, lang: "ko" })).ignored).toEqual([]);
    expect(await readFile(join(stateDir, "state.json"), "utf8")).toBe("{");
  });
});
