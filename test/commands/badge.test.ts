// aq badge를 임시 상태 폴더로 시험한다. 이력의 가장 최근 AQ로 배지 파일을 만들고, README에 붙일 줄을 주고, AQ가 없거나 쓰지 못하면 오류로 끝낸다(설계 「0.2.0에서 정한 것」)
import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runBadge } from "../../src/commands/badge.ts";
import { badgeSvg } from "../../src/report/badge.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let stateDir: string;
beforeEach(async () => {
  root = await makeTemp();
  stateDir = join(root, ".chunsik-garage");
});
afterEach(async () => removeTemp(root));

const line = (at: string, aq: number | null): string => JSON.stringify({ at, aq, axes: { setup: null, efficiency: null, fit: null, intensity: null }, missingAxes: [], rulesVersion: "1.0.0" });
const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);
const options = (lang: "en" | "ko") => ({ stateDir, lang, timeZone: "Asia/Seoul" });

describe("aq badge", () => {
  it("이력에서 AQ가 있는 가장 최근 점검으로 배지 파일을 만들고 README에 붙일 줄을 준다", async () => {
    await put(join(stateDir, "history.jsonl"), `${[line("2026-11-10T01:00:00.000Z", 70), line("2026-11-12T01:00:00.000Z", 82), line("2026-11-13T01:00:00.000Z", null)].join("\n")}\n`);
    const out = await runBadge(options("ko"));
    expect(out.badge).toEqual({
      path: join(stateDir, "badge.svg"),
      aq: 82,
      grade: "A",
      at: "2026-11-12T01:00:00.000Z",
      markdown: "[![AQ 82 · A](badge.svg)](https://github.com/yeunlee1/chunsik-garage)",
    });
    expect(await readFile(join(stateDir, "badge.svg"), "utf8")).toBe(badgeSvg({ aq: 82, grade: "A" }));
    expect(out.run.text.made).toContain("AQ 82 · A");
    expect(out.run.text.made).toContain("2026-11-12");
    expect(out.run.text.made).toContain(join(stateDir, "badge.svg"));
    expect(out.run.text.howTo).toContain("README");
  });

  it("점검 날짜는 이 PC의 시간대로 쓰고, 영어로도 알린다", async () => {
    // 한국 시간으로는 11월 13일 아침이다
    await put(join(stateDir, "history.jsonl"), `${line("2026-11-12T23:30:00.000Z", 91)}\n`);
    const out = await runBadge(options("en"));
    expect(out.badge.grade).toBe("S");
    expect(out.run.text.made).toContain("2026-11-13");
    expect(out.run.text.made).toContain("badge");
    expect(out.run.text.howTo).toContain("README");
  });

  it("AQ가 있는 점검이 없으면 no-score로 끝내고 파일을 쓰지 않는다", async () => {
    await expect(runBadge(options("ko"))).rejects.toMatchObject({ code: "no-score" });
    await put(join(stateDir, "history.jsonl"), `${line("2026-11-13T01:00:00.000Z", null)}\nnot json\n`);
    await expect(runBadge(options("ko"))).rejects.toMatchObject({ code: "no-score" });
    expect(await exists(join(stateDir, "badge.svg"))).toBe(false);
  });

  it("이력의 AQ가 0~100의 정수가 아니면(깨진 숫자) 그 줄을 건너뛴다(1차 짝 검토의 참고)", async () => {
    const broken = '{"at":"2026-11-11T01:00:00.000Z","aq":1e400}';
    await put(join(stateDir, "history.jsonl"), `${[line("2026-11-10T01:00:00.000Z", 70), broken, line("2026-11-12T01:00:00.000Z", 150), line("2026-11-13T01:00:00.000Z", 82.5), line("2026-11-14T01:00:00.000Z", -3)].join("\n")}\n`);
    const out = await runBadge(options("ko"));
    expect(out.badge).toMatchObject({ aq: 70, grade: "B", at: "2026-11-10T01:00:00.000Z" });
    expect(await readFile(join(stateDir, "badge.svg"), "utf8")).toBe(badgeSvg({ aq: 70, grade: "B" }));
  });

  it("배지 파일을 쓰지 못하면 badge-unwritten으로 끝낸다", async () => {
    await put(join(stateDir, "history.jsonl"), `${line("2026-11-12T01:00:00.000Z", 82)}\n`);
    await mkdir(join(stateDir, "badge.svg"), { recursive: true });
    await expect(runBadge(options("ko"))).rejects.toMatchObject({ code: "badge-unwritten" });
  });
});
