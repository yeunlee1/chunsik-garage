// 점검이 상태를 저장하기 바로 앞에서 알림 칸을 최신으로 맞추는지 시험한다. 점검이 도는 동안 알림을 끄면 그 꺼짐이 남아야 한다(7단계 구현 검증)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withLatestNotify } from "../../src/commands/checkup.ts";
import { newState, saveState, type StateFile } from "../../src/state/state.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let home: string;
let stateDir: string;
beforeEach(async () => {
  home = await makeTemp();
  stateDir = join(home, ".chunsik-garage");
});
afterEach(async () => removeTemp(home));

const withNotify = (notify: StateFile["notify"]): StateFile => ({ ...newState(), notify });

describe("저장 앞의 알림 칸", () => {
  it("점검이 처음 읽은 상태가 켜짐이어도, 그 사이 디스크의 상태가 꺼짐이면 꺼짐으로 저장한다", async () => {
    await saveState(stateDir, withNotify({ on: false, lang: "ko", names: ["skill:a"] }));
    const next = withNotify({ on: true, lang: "ko", names: ["skill:a"] });
    expect((await withLatestNotify(next, stateDir, {}, home)).notify).toEqual({ on: false, lang: "ko", names: ["skill:a"] });
  });

  it("켜져 있으면 알림용 이름 목록을 지금 것으로 새로 짓고, 상태 파일이 없으면 처음 읽은 알림 칸을 쓴다", async () => {
    await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { db: {} } }));
    await saveState(stateDir, withNotify({ on: true, lang: "en", names: [] }));
    expect((await withLatestNotify(withNotify(null), stateDir, {}, home)).notify).toEqual({ on: true, lang: "en", names: ["mcp:db"] });
    const fresh = join(home, "none");
    expect((await withLatestNotify(withNotify({ on: true, lang: "ko", names: null }), fresh, {}, home)).notify).toEqual({ on: true, lang: "ko", names: ["mcp:db"] });
  });
});
