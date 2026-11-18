// 웹 채팅 내보내기를 넣은 aq checkup을 임시 홈 폴더로 처음부터 끝까지 시험한다. 결과의 도구·사용량·알림·결과 화면에 웹 채팅이 나오고, 대화 글은 어디에도 남지 않으며, 파일을 지우면 빠진다고 알린다(설계 「0.5.0에서 정한 것」)
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheckup, type CheckupOptions } from "../../src/commands/checkup.ts";
import { runImportAdd } from "../../src/commands/import.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";
import { makeZip } from "../helpers/zip-writer.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");
const clock = { nowMs: NOW, timeZone: "Asia/Seoul" };

let root: string;
let home: string;
let stateDir: string;
let proj: string;
let exportPath: string;

const turn = (id: string, at: string): string[] => [
  user({ at, content: "고쳐 줘", origin: "human", extra: { cwd: proj } }),
  assistant({ id, at, cwd: proj, usage: { input: 10, cacheRead: 80, cacheWrite: 10, output: 5 } }),
];
const T = Date.parse("2026-11-08T01:00:00Z") / 1000;
const gpt = (id: string, at: number) => ({
  id,
  title: "비밀 제목",
  create_time: at,
  mapping: {
    u: { id: "u", parent: null, children: ["a"], message: { author: { role: "user" }, create_time: at, content: { content_type: "text", parts: ["비밀 질문"] }, metadata: {} } },
    a: { id: "a", parent: "u", children: [], message: { author: { role: "assistant" }, create_time: at + 5, content: { content_type: "text", parts: ["비밀 답"] }, metadata: { model_slug: "gpt-5" } } },
  },
});

const options = (overrides: Partial<CheckupOptions> = {}): CheckupOptions => ({
  env: {},
  homedir: home,
  tmpdir: join(root, "os-tmp"),
  platform: process.platform,
  clock,
  lang: "ko",
  stateDir,
  save: true,
  rescan: false,
  entryFile: join(root, "repo", "src", "entry.ts"),
  managedDir: join(root, "managed"),
  ...overrides,
});

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  stateDir = join(home, ".chunsik-garage");
  proj = join(root, "work", "proj");
  await mkdir(join(root, "os-tmp"), { recursive: true });
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  const dir = join(home, ".claude", "projects", "p-proj");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "s1.jsonl");
  await writeFile(path, `${[...turn("a-1", "2026-11-11T01:00:00Z"), ...turn("a-2", "2026-11-11T02:00:00Z")].join("\n")}\n`);
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
  exportPath = join(root, "downloads", "chatgpt-export.zip");
  await put(exportPath, makeZip([{ name: "conversations.json", data: JSON.stringify([gpt("c1", T), gpt("c2", T + 86_400)]) }, { name: "user.json", data: '{"email":"secret@example.com"}' }]));
});

afterEach(async () => {
  await removeTemp(root);
});

describe("웹 채팅을 넣은 aq checkup", () => {
  it("결과의 도구·사용량·알림에 ChatGPT가 나오고, 출력 토큰은 0이 아니라 기록 없음이다", async () => {
    await runImportAdd(exportPath, { stateDir, clock, lang: "ko", cache: true });
    const { result } = await runCheckup(options());
    expect(result.tools.find((tool) => tool.tool === "web-chatgpt")).toMatchObject({ detected: true, scored: true, formats: ["chatgpt-export"], mainSessions: 2, humanRequests: 2, responses: 2 });
    expect(result.tools.find((tool) => tool.tool === "web-claude")).toMatchObject({ detected: false, scored: false });
    expect(result.usage.byTool.map((tool) => [tool.tool, tool.outputTokens])).toEqual([
      ["claude-code", 10],
      ["web-chatgpt", null],
    ]);
    expect(result.usage.outputTokens).toBe(10);
    // 볼 수 있는 날짜 범위의 끝은 오늘이 아니라 내보내기의 마지막 날이다(짝 검토 3 참고)
    expect(result.tools.find((tool) => tool.tool === "web-chatgpt")!.visible).toEqual({ from: "2026-11-08", to: "2026-11-09" });
    expect(result.tools.find((tool) => tool.tool === "claude-code")!.visible!.to).toBe("2026-11-12");
    const until = result.notices.find((notice) => notice.kind === "web_export_until");
    expect(until).toMatchObject({ tool: "web-chatgpt", lastDate: "2026-11-09" });
    expect(until!.text.ko).toContain("2026-11-09까지의 대화");
  });

  it("대화 글과 제목과 메일은 결과 파일과 결과 화면 어디에도 없다", async () => {
    await runImportAdd(exportPath, { stateDir, clock, lang: "ko", cache: true });
    const outcome = await runCheckup(options());
    const json = JSON.stringify(outcome);
    expect(json).not.toContain("비밀");
    expect(json).not.toContain("secret@example.com");
    const html = await readFile(outcome.summary.reportPath!, "utf8");
    expect(html).not.toContain("비밀");
    // 도구별 띠의 주 세션에는 ChatGPT가 분홍으로 들고, 출력 토큰 띠에는 들지 않는다
    expect(html).toContain("background:#e87ba4");
    const legend = (label: string): string => html.match(new RegExp(`class="t"><span>${label}</span>.*?<div class="lg">(.*?)</div></div>`, "s"))?.[1] ?? "(없음)";
    expect(legend("Main sessions")).toContain("ChatGPT");
    expect(legend("Output tokens")).toContain("Claude Code");
    expect(legend("Output tokens")).not.toContain("ChatGPT");
  });

  it("넣은 파일을 지우면 다음 점검에서 빠지고 없다고 알린다. 읽지 못한 기록의 띠는 띄우지 않는다", async () => {
    await runImportAdd(exportPath, { stateDir, clock, lang: "ko", cache: true });
    await rm(exportPath);
    const { result } = await runCheckup(options());
    expect(result.tools.find((tool) => tool.tool === "web-chatgpt")).toMatchObject({ detected: true, scored: false });
    expect(result.notices.filter((notice) => "tool" in notice && notice.tool === "web-chatgpt").map((notice) => notice.kind)).toEqual(["web_export_missing"]);
    expect(result.coverage.find((coverage) => coverage.tool === "web-chatgpt")).toMatchObject({ partial: false, unreadableFiles: 0 });
  });

  it("넣은 목록이 깨졌으면 웹 채팅 없이 세고 알린다", async () => {
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "web-exports.json"), "{broken");
    const { result } = await runCheckup(options());
    expect(result.notices.map((notice) => notice.kind)).toContain("web_exports_reset");
    expect(result.tools.find((tool) => tool.tool === "web-chatgpt")).toMatchObject({ detected: false });
  });

  it("웹 채팅을 넣지 않으면 웹 채팅은 찾지 못한 도구로만 나오고 알림이 없다", async () => {
    const { result } = await runCheckup(options());
    expect(result.tools.filter((tool) => tool.tool.startsWith("web-")).map((tool) => [tool.tool, tool.detected, tool.scored])).toEqual([
      ["web-chatgpt", false, false],
      ["web-claude", false, false],
    ]);
    expect(result.notices.some((notice) => notice.kind.startsWith("web_"))).toBe(false);
  });
});
