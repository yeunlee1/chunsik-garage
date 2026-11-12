// 큰 합성 기록(600MB가 넘는 파일, 16MB가 넘는 줄, 실제와 같은 길이의 응답 ID 100만 종)으로 크기와 최대 상주 메모리를 시험한다(설계 21.1, 22)
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const RESPONSES = 1_000_000;
const LONG_LINES = 24;
const LONG_LINE_BYTES = 16 * 1024 * 1024 + 1024;
let root: string;
let logPath: string;

/** 실제 응답 ID와 같은 28자(msg_01 + 22자). */
const responseId = (i: number): string => `msg_01${i.toString(36).padStart(22, "0")}`;

async function writeBigLog(path: string): Promise<void> {
  const stream = createWriteStream(path);
  // 쓰기 오류가 나면 drain을 기다리던 once가 거부되어 시험이 그 오류로 실패한다
  const push = async (text: string): Promise<void> => {
    if (!stream.write(text)) await once(stream, "drain");
  };
  let batch = "";
  for (let i = 0; i < RESPONSES; i++) {
    batch +=
      `{"parentUuid":null,"message":{"id":"${responseId(i)}","model":"claude-test","content":[],"stop_reason":"end_turn",` +
      `"usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}},` +
      `"effort":"medium","type":"assistant","timestamp":"2026-11-11T10:00:00Z"}\n`;
    if (batch.length > 1 << 20) {
      await push(batch);
      batch = "";
    }
  }
  await push(batch);
  const filler = "x".repeat(LONG_LINE_BYTES);
  for (let i = 0; i < LONG_LINES; i++) await push(`{"type":"api-request-blob","blob":"${filler}"}\n`);
  stream.end();
  await once(stream, "finish");
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "aq-big-"));
  await mkdir(join(root, ".claude", "projects", "p"), { recursive: true });
  logPath = join(root, ".claude", "projects", "p", "big.jsonl");
  await writeBigLog(logPath);
}, 300_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("크기와 메모리", () => {
  it("600MB가 넘는 파일, 16MB가 넘는 줄, 응답 ID 100만 종을 500MB 안쪽 메모리로 읽는다", async () => {
    expect((await stat(logPath)).size).toBeGreaterThan(600 * 1024 * 1024);
    const { stdout } = await run(process.execPath, ["scripts/run-ts.mjs", "scripts/measure-collect.ts", root], { maxBuffer: 1 << 20 });
    const measured = JSON.parse(stdout.trim().split("\n").pop()!);
    expect(measured.responses).toBe(RESPONSES);
    expect(measured.tooLongLines).toBe(LONG_LINES);
    expect(measured.peakRssMb).toBeLessThanOrEqual(500);
  }, 300_000);
});
