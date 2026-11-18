// aq import add|remove|list를 시험한다. 넣으면 서비스를 가려 자리를 적고 캐시를 만든다. 같은 서비스는 바꾸고, 읽지 못하는 파일은 넣지 않으며, 목록이 깨졌으면 더하거나 빼지 않는다. 명령 줄도 본다(설계 「0.5.0에서 정한 것」)
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../../src/cli.ts";
import { runImportAdd, runImportList, runImportRemove, webToolOf } from "../../src/commands/import.ts";
import { readWebExports, WEB_EXPORTS_FILE } from "../../src/state/web-exports.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";
import { makeZip } from "../helpers/zip-writer.ts";

let home: string;
let state: string;
const clock = { nowMs: Date.UTC(2026, 10, 13, 3), timeZone: "Asia/Seoul" };

beforeEach(async () => {
  home = await makeTemp("aq-import-");
  state = join(home, ".chunsik-garage");
});

afterEach(async () => {
  await removeTemp(home);
});

const T = Date.UTC(2026, 10, 10, 1) / 1000;
const gpt = (id: string, at = T) => ({
  id,
  create_time: at,
  mapping: {
    u: { id: "u", parent: null, children: ["a"], message: { author: { role: "user" }, create_time: at, content: { content_type: "text", parts: ["비밀"] }, metadata: {} } },
    a: { id: "a", parent: "u", children: [], message: { author: { role: "assistant" }, create_time: at + 5, content: { content_type: "text", parts: ["답"] }, metadata: {} } },
  },
});
const claude = (id: string) => ({ uuid: id, created_at: "2026-11-01T00:00:00Z", chat_messages: [{ sender: "human", created_at: "2026-11-01T00:00:00Z" }] });
const put = async (name: string, data: Buffer | string): Promise<string> => {
  const path = join(home, name);
  await writeFile(path, data);
  return path;
};
const options = (lang: "en" | "ko" = "ko") => ({ stateDir: state, clock, lang, cache: true });

describe("runImportAdd", () => {
  it("넣으면 서비스를 가려 절대 경로를 적고, 대화 수와 기간을 알리고, 캐시를 만든다. 글은 내지 않는다", async () => {
    const path = await put("chatgpt.zip", makeZip([{ name: "conversations.json", data: JSON.stringify([gpt("a", T - 86_400 * 30), gpt("b")]) }]));
    const outcome = await runImportAdd(path, options());
    expect(outcome).toMatchObject({ action: "add", added: { tool: "web-chatgpt", path, conversations: 2, requests: 2, responses: 2, firstDate: "2026-10-11", lastDate: "2026-11-10", skipped: 0, truncated: false, replaced: null } });
    expect(outcome.run.text).toBe("ChatGPT 내보내기를 넣었습니다. 대화 2개, 2026-10-11부터 2026-11-10까지입니다. 다음 점검부터 셉니다.");
    expect(JSON.stringify(outcome)).not.toContain("비밀");
    expect((await readWebExports(state)).entries).toEqual([{ tool: "web-chatgpt", path, addedAt: "2026-11-13T03:00:00.000Z" }]);
    expect(await readdir(join(state, "cache", "web"))).toHaveLength(1);
  });

  it("같은 서비스를 다시 넣으면 앞의 것을 바꾸고, 다른 서비스는 함께 둔다. 영어 문장도 있다", async () => {
    const first = await put("old.zip", makeZip([{ name: "conversations.json", data: JSON.stringify([gpt("a")]) }]));
    const second = await put("new.zip", makeZip([{ name: "conversations.json", data: JSON.stringify([gpt("a"), gpt("b")]) }]));
    const claudePath = await put("conversations.json", JSON.stringify([claude("c")]));
    await runImportAdd(first, options());
    await runImportAdd(claudePath, options());
    const replaced = await runImportAdd(second, options("en"));
    expect(replaced).toMatchObject({ added: { replaced: first } });
    expect(replaced.run.text).toBe("Added the ChatGPT export: 2 conversations from 2026-11-10 to 2026-11-10. The next checkup counts it. It replaces the export added before.");
    expect((await readWebExports(state)).entries.map((entry) => [entry.tool, entry.path])).toEqual([
      ["web-chatgpt", second],
      ["web-claude", claudePath],
    ]);
  });

  it("버린 대화와 끊긴 파일을 알린다. 저장 없는 실행(--no-save)은 캐시를 만들지 않는다", async () => {
    const text = `[${JSON.stringify(gpt("a"))}, {"x": 01}, ${JSON.stringify(gpt("b"))}`;
    const path = await put("conversations.json", text);
    const outcome = await runImportAdd(path, { ...options(), cache: false });
    expect(outcome).toMatchObject({ added: { conversations: 2, skipped: 1, truncated: true } });
    expect(outcome.run.text).toContain("읽지 못한 대화 1개는 뺐습니다.");
    expect(outcome.run.text).toContain("끊기기 전의 대화만 셉니다.");
    await expect(readdir(join(state, "cache"))).rejects.toThrow();
  });

  it("없는 파일과 읽지 못하는 파일은 넣지 않고 까닭의 코드를 낸다", async () => {
    await expect(runImportAdd(join(home, "none.zip"), options())).rejects.toMatchObject({ code: "not-found" });
    await expect(runImportAdd(await put("x.json", '{"a":1}'), options())).rejects.toMatchObject({ code: "not-array" });
    await expect(runImportAdd(await put("y.json", "[1,2]"), options())).rejects.toMatchObject({ code: "unknown-service" });
    await expect(runImportAdd(home, options())).rejects.toMatchObject({ code: "not-file" });
    expect((await readWebExports(state)).status).toBe("missing");
  });

  it("목록이 깨졌으면 넣을 때 새로 만들고 알린다. 뺄 때는 비운다. 내보내기 파일은 건드리지 않는다", async () => {
    await mkdir(state, { recursive: true });
    await writeFile(join(state, WEB_EXPORTS_FILE), "{broken");
    const path = await put("conversations.json", JSON.stringify([gpt("a")]));
    const added = await runImportAdd(path, options());
    expect(added).toMatchObject({ added: { listReset: true } });
    expect(added.run.text).toContain("넣은 목록이 깨져 새로 만들었습니다.");
    expect((await readWebExports(state)).entries.map((entry) => entry.tool)).toEqual(["web-chatgpt"]);
    await writeFile(join(state, WEB_EXPORTS_FILE), "{broken");
    expect((await runImportRemove("chatgpt", options())).run.text).toBe("넣은 목록이 깨져 비웠습니다. 셀 내보내기를 다시 넣어 주세요.");
    expect((await readWebExports(state)).status).toBe("missing");
    expect(await readFile(path, "utf8")).toContain("mapping");
  });
});

describe("runImportRemove와 runImportList", () => {
  it("빼면 그 도구의 자리만 지우고 내보내기 파일은 그대로 둔다. 넣지 않은 것을 빼면 없다고 알린다", async () => {
    const path = await put("conversations.json", JSON.stringify([gpt("a")]));
    await runImportAdd(path, options());
    expect((await runImportList(options())).run.text).toBe("넣은 내보내기는 ChatGPT입니다.");
    const removed = await runImportRemove("ChatGPT", options());
    expect(removed).toMatchObject({ action: "remove", removed: { tool: "web-chatgpt", path } });
    expect(removed.run.text).toBe("ChatGPT 내보내기를 점검에서 뺐습니다. 내보내기 파일은 그대로 두었습니다.");
    expect(await readFile(path, "utf8")).toContain("mapping");
    expect((await runImportRemove("claude", options())).run.text).toBe("넣은 Claude.ai 내보내기가 없습니다.");
    expect((await runImportList(options("en"))).run.text).toBe("No web chat export has been added.");
    await expect(runImportRemove("gemini", options())).rejects.toMatchObject({ code: "unknown-tool" });
  });

  it("도구 이름은 chatgpt, claude, claude.ai와 식별자를 대소문자 없이 받는다", () => {
    expect(["chatgpt", "ChatGPT", "web-chatgpt", "claude", "Claude.ai", "web-claude", "codex", "", null].map((text) => webToolOf(text))).toEqual(["web-chatgpt", "web-chatgpt", "web-chatgpt", "web-claude", "web-claude", "web-claude", null, null, null]);
  });
});

describe("aq import 명령 줄", () => {
  async function cli(args: string[]): Promise<{ code: number; out: unknown }> {
    let out = "";
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      out += chunk;
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await main(args, { env: {}, homedir: home, clock, locale: "ko-KR" });
      return { code, out: out === "" ? null : JSON.parse(out) };
    } finally {
      process.stdout.write = write;
    }
  }

  it("add·list·remove를 받고, 경로나 도구가 없거나 모르는 옵션이면 쓰는 법 오류다", async () => {
    const path = await put("conversations.json", JSON.stringify([gpt("a")]));
    expect(await cli(["import", "add", path, "--no-save"])).toMatchObject({ code: 0, out: { action: "add", added: { tool: "web-chatgpt" } } });
    expect(await cli(["import", "list", "--lang", "en"])).toMatchObject({ code: 0, out: { action: "list", exports: [{ tool: "web-chatgpt" }] } });
    expect(await cli(["import", "remove", "chatgpt"])).toMatchObject({ code: 0, out: { action: "remove" } });
    for (const args of [["import", "add"], ["import", "add", "--no-save"], ["import", "remove"], ["import", "list", "--rescan"], ["import", "remove", "chatgpt", "--no-save"]]) {
      expect((await cli(args)).code).not.toBe(0);
    }
    expect(await cli(["import", "add", join(home, "none.zip")])).toMatchObject({ code: 1, out: { error: { code: "not-found" } } });
  });
});
