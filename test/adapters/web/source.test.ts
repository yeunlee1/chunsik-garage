// 내보내기 파일 전체 읽기를 시험한다. zip 안의 conversations.json과 나뉜 파일, 안쪽 zip(저장만·압축), 대화 JSON 파일, 서비스 가리기, 버린 원소, 끊긴 배열, 읽을 수 없는 꼴(설계 「0.5.0에서 정한 것」)
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExportError, exportFolderFiles, readExport } from "../../../src/adapters/web/source.ts";
import { makeZip } from "../../helpers/zip-writer.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq-web-source-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = async (name: string, data: Buffer | string): Promise<string> => {
  const path = join(root, name);
  await writeFile(path, data);
  return path;
};

const T = Date.UTC(2026, 10, 10, 1) / 1000;
const gptConversation = (id: string, at = T) => ({
  id,
  conversation_id: id,
  title: "비밀 제목",
  create_time: at,
  mapping: {
    u: { id: "u", parent: null, children: ["a"], message: { author: { role: "user" }, create_time: at, content: { content_type: "text", parts: ["비밀 글"] }, metadata: {} } },
    a: { id: "a", parent: "u", children: [], message: { author: { role: "assistant" }, create_time: at + 5, content: { content_type: "text", parts: ["비밀 답"] }, metadata: { model_slug: "gpt-5" } } },
  },
});
const claudeConversation = (id: string) => ({
  uuid: id,
  name: "비밀 제목",
  created_at: "2026-11-10T01:00:00Z",
  chat_messages: [
    { uuid: `${id}-1`, sender: "human", text: "비밀 글", created_at: "2026-11-10T01:00:00Z" },
    { uuid: `${id}-2`, sender: "assistant", text: "비밀 답", created_at: "2026-11-10T01:00:09Z" },
  ],
});
const read = (path: string) => readExport(path, "Asia/Seoul", null);
const problemOf = async (path: string): Promise<string> => {
  try {
    await read(path);
    return "ok";
  } catch (error) {
    return error instanceof ExportError ? error.problem : `other:${(error as Error).message}`;
  }
};

describe("readExport", () => {
  it("ChatGPT zip의 conversations.json을 읽어 대화마다 요약을 내고 서비스를 가린다. 다른 파일은 읽지 않는다", async () => {
    const path = await put("chatgpt.zip", makeZip([{ name: "user.json", data: '{"email":"x"}' }, { name: "conversations.json", data: JSON.stringify([gptConversation("a"), gptConversation("b")]) }, { name: "chat.html", data: "<html>" }]));
    const result = await read(path);
    expect(result.tool).toBe("web-chatgpt");
    expect(result.summaries.map((summary) => summary.tool)).toEqual(["web-chatgpt", "web-chatgpt"]);
    expect(result.files).toEqual(["conversations.json"]);
    expect(result.totals).toEqual({ requests: 2, responses: 2, firstMs: T * 1000, lastMs: (T + 5) * 1000 });
    expect(result.complete).toBe(true);
    expect(result.skipped).toEqual({ tooLong: 0, broken: 0, unrecognized: 0 });
    expect(JSON.stringify(result)).not.toContain("비밀");
  });

  it("나뉜 대화 파일(숫자 자리 수와 상관없이)을 이름 차례로 모두 읽는다", async () => {
    const path = await put("split.zip", makeZip([{ name: "conversations-001.json", data: JSON.stringify([gptConversation("b")]) }, { name: "export_manifest.json", data: "{}" }, { name: "conversations-0.json", data: JSON.stringify([gptConversation("a")]) }]));
    const result = await read(path);
    expect(result.files).toEqual(["conversations-0.json", "conversations-001.json"]);
    expect(result.summaries).toHaveLength(2);
  });

  it("대화 파일이 바깥에 없으면 대화를 담은 안쪽 zip을 연다. 저장만 한 것과 압축한 것 모두 읽고, 압축을 푼 임시 파일은 남기지 않는다", async () => {
    const inner1 = makeZip([{ name: "conversations-000.json", data: JSON.stringify([gptConversation("a")]) }]);
    const inner2 = makeZip([{ name: "conversations-001.json", data: JSON.stringify([gptConversation("b")]) }]);
    const path = await put(
      "nested.zip",
      makeZip([
        { name: "Conversations__part-001.zip", data: inner1, method: 0 },
        { name: "Conversations__part-002.zip", data: inner2, method: 8 },
        { name: "Files__files-001.zip", data: makeZip([{ name: "conversations.json", data: "[]" }]), method: 0 },
      ]),
    );
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith("aq-web-")).length;
    const result = await read(path);
    expect(result.files).toEqual(["Conversations__part-001.zip/conversations-000.json", "Conversations__part-002.zip/conversations-001.json"]);
    expect(result.summaries).toHaveLength(2);
    expect((await readdir(tmpdir())).filter((name) => name.startsWith("aq-web-")).length).toBe(before);
  });

  it("Claude.ai 내보내기를 가리고, 대화 JSON 파일 하나를 바로 읽을 수도 있다", async () => {
    const zip = await read(await put("claude.zip", makeZip([{ name: "users.json", data: "[]" }, { name: "conversations.json", data: JSON.stringify([claudeConversation("c1")]) }, { name: "projects.json", data: "[]" }])));
    expect(zip.tool).toBe("web-claude");
    expect(zip.totals.requests + zip.totals.responses).toBe(2);
    const file = await read(await put("conversations.json", JSON.stringify([claudeConversation("c1"), claudeConversation("c2")])));
    expect(file.tool).toBe("web-claude");
    expect(file.files).toEqual(["conversations.json"]);
    expect(file.summaries).toHaveLength(2);
  });

  it("압축을 푼 폴더도 읽는다. 폴더 안(두 겹 아래까지)의 대화 파일과 대화를 담은 안쪽 zip을 자리 차례로 모두 읽는다(짝 검토 3 필수 1)", async () => {
    const { mkdir } = await import("node:fs/promises");
    const folder = join(root, "extracted");
    await mkdir(join(folder, "export-2026", "dalle-generations"), { recursive: true });
    await writeFile(join(folder, "export-2026", "conversations-000.json"), JSON.stringify([gptConversation("a")]));
    await writeFile(join(folder, "export-2026", "conversations-001.json"), JSON.stringify([gptConversation("b")]));
    await writeFile(join(folder, "export-2026", "chat.html"), "<html>");
    await writeFile(join(folder, "Conversations__part-009.zip"), makeZip([{ name: "conversations.json", data: JSON.stringify([gptConversation("c")]) }]));
    const result = await read(folder);
    expect(result.tool).toBe("web-chatgpt");
    expect(result.files).toEqual(["Conversations__part-009.zip/conversations.json", "export-2026/conversations-000.json", "export-2026/conversations-001.json"]);
    expect(result.summaries).toHaveLength(3);
    await mkdir(join(root, "empty-folder"));
    expect(await problemOf(join(root, "empty-folder"))).toBe("no-conversations");
  });

  it("같은 대화가 zip과 푼 파일로 함께 있으면 한 번만 센다(짝 검토 5 필수 3). 다른 대화는 그대로 함께 읽는다", async () => {
    const { mkdir } = await import("node:fs/promises");
    const folder = join(root, "mixed");
    await mkdir(folder, { recursive: true });
    const text = JSON.stringify([gptConversation("same"), gptConversation("only-json")]);
    await writeFile(join(folder, "conversations.json"), text);
    await writeFile(join(folder, "Conversations__part-001.zip"), makeZip([{ name: "conversations.json", data: JSON.stringify([gptConversation("same"), gptConversation("only-zip")]) }]));
    const result = await read(folder);
    expect(result.summaries.map((summary) => summary.sessionId).length).toBe(3);
    expect(new Set(result.summaries.map((summary) => summary.sessionId)).size).toBe(3);
    expect(result.totals).toMatchObject({ requests: 3, responses: 3 });
  });

  it("폴더를 훑는 항목 상한에 걸리면 끝까지 읽지 못한 것으로 알린다(짝 검토 5 필수 5)", async () => {
    const { mkdir } = await import("node:fs/promises");
    const folder = join(root, "limited");
    await mkdir(join(folder, "a", "noise"), { recursive: true });
    await writeFile(join(folder, "a", "conversations-000.json"), JSON.stringify([gptConversation("first")]));
    for (let index = 0; index < 5; index++) await writeFile(join(folder, "a", "noise", `f${index}`), "");
    await writeFile(join(folder, "z-conversations-001.json"), "[]");
    await writeFile(join(folder, "conversations-001.json"), JSON.stringify([gptConversation("second")]));
    const limited = await exportFolderFiles(folder, 4);
    expect(limited.limited).toBe(true);
    const all = await exportFolderFiles(folder);
    expect([all.limited, all.files.map((file) => file.rel)]).toEqual([false, ["a/conversations-000.json", "conversations-001.json"]]);
    const result = await readExport(folder, "Asia/Seoul", null, 4);
    expect(result.complete).toBe(false);
  });

  it("깨진 원소, 다른 서비스의 꼴, 상한을 넘는 원소는 버린 수로 센다", async () => {
    // 괄호는 맞지만 JSON으로 풀리지 않는 원소(앞에 0이 붙은 수)
    const text = `[${JSON.stringify(gptConversation("a"))}, {"broken": 01}, ${JSON.stringify(claudeConversation("c"))}, 7]`;
    const result = await read(await put("conversations.json", text));
    expect(result.tool).toBe("web-chatgpt");
    expect(result.summaries).toHaveLength(1);
    expect(result.skipped).toEqual({ tooLong: 0, broken: 1, unrecognized: 2 });
  });

  it("배열이 끝나기 전에 파일이 끊기면 읽은 대화까지 내고 끝나지 않았다고 알린다", async () => {
    const text = JSON.stringify([gptConversation("a"), gptConversation("b")]);
    const result = await read(await put("conversations.json", text.slice(0, text.length - 40)));
    expect(result.summaries).toHaveLength(1);
    expect(result.complete).toBe(false);
  });

  it("읽을 수 없으면 까닭을 낸다. 대화 파일이 없는 zip, 배열이 아닌 파일, 어느 서비스의 꼴도 아닌 배열, 망가진 zip", async () => {
    expect(await problemOf(await put("empty.zip", makeZip([{ name: "user.json", data: "{}" }])))).toBe("no-conversations");
    expect(await problemOf(await put("object.json", '{"conversations": []}'))).toBe("not-array");
    expect(await problemOf(await put("numbers.json", "[1, 2]"))).toBe("unknown-service");
    expect(await problemOf(await put("empty-array.json", "[]"))).toBe("unknown-service");
    const zip = makeZip([{ name: "conversations.json", data: JSON.stringify([gptConversation("a")]) }]);
    expect(await problemOf(await put("cut.zip", zip.subarray(0, zip.length - 30)))).toBe("zip-not-zip");
  });
});
