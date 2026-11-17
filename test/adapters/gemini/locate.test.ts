// 제미나이 CLI 기록 폴더의 자리와 세션 파일 목록(주 세션, 옛 꼴, 하위 에이전트, 프로젝트 폴더)을 시험한다. 폴더 모양은 공개 소스 v0.68.0을 따른 합성 폴더다(설계 「0.4.0에서 정한 것」)
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { geminiHome, listGeminiFiles } from "../../../src/adapters/gemini/locate.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq-gemini-locate-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = async (path: string, text = "{}\n"): Promise<void> => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
};

describe("geminiHome", () => {
  it("GEMINI_CLI_HOME이 있으면 그 아래 .gemini, 없으면 홈 아래 .gemini다", () => {
    expect(geminiHome({ GEMINI_CLI_HOME: join(root, "other") }, join(root, "home"))).toBe(join(root, "other", ".gemini"));
    expect(geminiHome({ GEMINI_CLI_HOME: "  " }, join(root, "home"))).toBe(join(root, "home", ".gemini"));
    expect(geminiHome({}, join(root, "home"))).toBe(join(root, "home", ".gemini"));
  });
});

describe("listGeminiFiles", () => {
  it("주 세션(.jsonl과 옛 .json), 하위 에이전트 세션, 프로젝트 폴더를 낸다. 같은 이름의 .jsonl이 있는 옛 .json은 건너뛴다", async () => {
    const home = join(root, ".gemini");
    const chats = join(home, "tmp", "app", "chats");
    await put(join(home, "tmp", "app", ".project_root"), "c:\\work\\app\n");
    await put(join(chats, "session-2026-11-10T01-00-aaaa1111.jsonl"));
    await put(join(chats, "session-2026-11-09T01-00-bbbb2222.json"));
    await put(join(chats, "session-2026-11-08T01-00-cccc3333.json"));
    await put(join(chats, "session-2026-11-08T01-00-cccc3333.jsonl"));
    await put(join(chats, "parent-1", "agent-1.jsonl"));
    await put(join(chats, "notes.txt"));
    // 기록이 없는 프로젝트 폴더(로그만 있는 것)는 읽지 못한 폴더가 아니다
    await put(join(home, "tmp", "logs-only", "logs.json"));
    const list = await listGeminiFiles(home, null);
    expect(list.tmpFound).toBe(true);
    expect(list.unreadableDirs).toEqual([]);
    const shapes = list.files.map((file) => [file.sessionId, file.kind, file.parentSessionId, file.legacy, file.cwd]);
    expect(shapes).toEqual([
      ["agent-1", "sub", "parent-1", false, "c:\\work\\app"],
      ["session-2026-11-08T01-00-cccc3333", "main", null, false, "c:\\work\\app"],
      ["session-2026-11-09T01-00-bbbb2222", "main", null, true, "c:\\work\\app"],
      ["session-2026-11-10T01-00-aaaa1111", "main", null, false, "c:\\work\\app"],
    ]);
  });

  it("기록 폴더가 없으면 찾지 못한 것이고, 경계보다 오래 고치지 않은 파일은 열지 않고 센다", async () => {
    const home = join(root, ".gemini");
    expect(await listGeminiFiles(home, null)).toMatchObject({ tmpFound: false, files: [] });
    const old = join(home, "tmp", "hash", "chats", "session-old.jsonl");
    await put(old);
    await utimes(old, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
    const list = await listGeminiFiles(home, Date.parse("2026-11-01T00:00:00Z"));
    expect([list.files.length, list.olderThanWindow]).toEqual([0, 1]);
  });

  it(".project_root가 없는 옛 해시 폴더의 세션은 프로젝트 폴더를 모른다", async () => {
    const home = join(root, ".gemini");
    await put(join(home, "tmp", "0123abcd", "chats", "session-x.jsonl"));
    const list = await listGeminiFiles(home, null);
    expect(list.files.map((file) => file.cwd)).toEqual([null]);
  });
});
