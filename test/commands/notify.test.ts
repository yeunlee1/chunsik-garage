// aq notify on|off|status를 임시 홈으로 시험한다. 켤 때 알림용 이름 목록을 지어 두고, 깨진 상태 파일은 덮지 않는다(설계 7.4, 18.1, 18.2)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runNotify } from "../../src/commands/notify.ts";
import { loadState } from "../../src/state/state.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let home: string;
let stateDir: string;
beforeEach(async () => {
  home = await makeTemp();
  stateDir = join(home, ".chunsik-garage");
});
afterEach(async () => removeTemp(home));
const options = (lang: "en" | "ko" = "ko") => ({ env: {}, homedir: home, stateDir, lang });

describe("aq notify", () => {
  it("켜면 언어와 알림용 이름 목록을 상태에 두고, 끄면 꺼짐만 적는다. 상태는 읽기만 한다", async () => {
    await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { db: {} } }));
    expect((await runNotify("status", options())).notify.on).toBe(false);
    const on = await runNotify("on", options());
    expect(on.notify).toEqual({ on: true, lang: "ko" });
    expect(on.run.text).toContain("세션 시작 알림을 켰습니다.");
    const loaded = await loadState(stateDir);
    expect(loaded.status === "ok" && loaded.state.notify).toEqual({ on: true, lang: "ko", names: ["mcp:db"] });
    const off = await runNotify("off", options("en"));
    expect([off.notify.on, off.run.text]).toEqual([false, "Session start notices are off."]);
    const after = await loadState(stateDir);
    expect(after.status === "ok" && after.state.notify).toEqual({ on: false, lang: "ko", names: ["mcp:db"] });
  });

  it("상태 파일이 깨졌으면 켜거나 끄지 않고 오류로 끝낸다. 상태를 보는 것은 된다", async () => {
    await put(join(stateDir, "state.json"), "{");
    await expect(runNotify("on", options())).rejects.toMatchObject({ code: "state-broken" });
    expect((await runNotify("status", options())).notify.on).toBe(false);
    expect(await readFile(join(stateDir, "state.json"), "utf8")).toBe("{");
  });
});
