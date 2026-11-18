// 넣은 웹 채팅 내보내기의 목록(web-exports.json)을 읽고 쓰는 것을 시험한다. 없음, 깨짐, 같은 도구 둘, 바꾸기, 빈 목록이면 파일을 지우기(설계 「0.5.0에서 정한 것」)
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readWebExports, WEB_EXPORTS_FILE, withExport, writeWebExports } from "../../src/state/web-exports.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let dir: string;

beforeEach(async () => {
  dir = await makeTemp("aq-web-exports-");
});

afterEach(async () => {
  await removeTemp(dir);
});

const chatgpt = { tool: "web-chatgpt" as const, path: "C:/exports/chatgpt.zip", addedAt: "2026-11-18T01:00:00.000Z" };
const claude = { tool: "web-claude" as const, path: "C:/exports/claude.zip", addedAt: "2026-11-18T02:00:00.000Z" };

describe("web-exports.json", () => {
  it("없으면 missing이고 빈 목록이다", async () => {
    expect(await readWebExports(dir)).toEqual({ status: "missing", entries: [] });
  });

  it("쓰고 읽으면 도구 차례로 같은 목록이다. 대화 글이 아니라 도구·자리·넣은 때만 둔다", async () => {
    await writeWebExports(dir, [claude, chatgpt]);
    expect(await readWebExports(dir)).toEqual({ status: "ok", entries: [chatgpt, claude] });
    expect(JSON.parse(await readFile(join(dir, WEB_EXPORTS_FILE), "utf8"))).toEqual({ schema: 1, exports: [chatgpt, claude] });
  });

  it("빈 목록을 쓰면 파일을 지운다", async () => {
    await writeWebExports(dir, [chatgpt]);
    await writeWebExports(dir, []);
    expect(await readWebExports(dir)).toEqual({ status: "missing", entries: [] });
  });

  it("풀리지 않거나, 형식 번호가 다르거나, 모르는 도구·빈 경로·같은 도구 둘이 있으면 깨진 것이다", async () => {
    const broken = async (text: string) => {
      await writeFile(join(dir, WEB_EXPORTS_FILE), text);
      return (await readWebExports(dir)).status;
    };
    expect(await broken("{")).toBe("broken");
    expect(await broken(JSON.stringify({ schema: 2, exports: [] }))).toBe("broken");
    expect(await broken(JSON.stringify({ schema: 1, exports: [{ ...chatgpt, tool: "gemini" }] }))).toBe("broken");
    expect(await broken(JSON.stringify({ schema: 1, exports: [{ ...chatgpt, path: "" }] }))).toBe("broken");
    expect(await broken(JSON.stringify({ schema: 1, exports: [chatgpt, { ...chatgpt, path: "C:/other.zip" }] }))).toBe("broken");
    expect(await broken(JSON.stringify({ schema: 1, exports: [chatgpt] }))).toBe("ok");
  });

  it("withExport는 같은 도구의 자리를 바꾸고 다른 도구는 둔다", () => {
    const next = withExport([chatgpt, claude], { ...chatgpt, path: "C:/new.zip" });
    expect(next.map((entry) => [entry.tool, entry.path])).toEqual([
      ["web-claude", "C:/exports/claude.zip"],
      ["web-chatgpt", "C:/new.zip"],
    ]);
  });
});
