// Codex 기록 모으기(정본과 다음 사본, 압축 기록과 건너뛴 압축, 끊긴 압축, 읽지 못한 파일, 이어받은 앞부분 빼기, 구간 밖의 부모와 같은 세션 기록, 같은 세션의 기록 합치기, 캐시와 그 무효화, 쓰는 중인 파일, 목록의 차례)를 시험한다(설계 9.1~9.4, 9.8, 20.1, 「5단계 계획 전 결정」 2·3·7번)
import { appendFile, mkdir, mkdtemp, open, readdir, readFile, rm, stat, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { createHash } from "node:crypto";
import { appendFileSync, ReadStream, rmSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listCodexFiles, type StatFile } from "../../src/adapters/codex/locate.ts";
import { codexMcpObservation } from "../../src/adapters/codex/observation.ts";
import { CodexSessionParser } from "../../src/adapters/codex/parser.ts";
import * as linesModule from "../../src/adapters/common/lines.ts";
import * as zstdModule from "../../src/adapters/codex/zstd.ts";
import { zstdAvailable } from "../../src/adapters/codex/zstd.ts";
import { codexUnreadableCount, collectCodex, collectCodexFromList, type CodexCollectOptions } from "../../src/collect/codex.ts";
import { makeWindows } from "../../src/adapters/common/dates.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 코덱스 모으기 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");
const OLD_TIME = Date.parse("2026-01-01T00:00:00Z");
const T = "2026-11-11T03:00:00Z";
const ID = (n: number) => `019a0000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const compress = (data: Buffer): Buffer => (zlib as unknown as { zstdCompressSync(data: Buffer): Buffer }).zstdCompressSync(data);
/** 날것 블록 하나의 자료 프레임이다(창 1KB, 내용 크기 칸 없음). 잘린 것도 디코더가 오류 없이 받은 만큼 내준다 */
const rawFrame = (data: Buffer): Buffer => {
  const block = Buffer.alloc(3);
  block.writeUIntLE((data.length << 3) | 1, 0, 3);
  return Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x00]), block, data]);
};

const line = (type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp: T, type, payload });
const meta = (id: string, extra: Record<string, unknown> = {}) => line("session_meta", { id, cwd: "C:/work", cli_version: "0.166.0", thread_source: "user", ...extra });
const sub = (id: string, parent: string) => meta(id, { thread_source: "subagent", parent_thread_id: parent });
const item = (it: Record<string, unknown>) => line("event_msg", { type: "item_completed", item: it });
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: n + 1 });
const record = (id: string, n: number) => line("token_usage_record", { response_id: id, usage: usage(n), thread_token_usage: usage(n) });

const dir = () => join(root, ".codex", "sessions", "2026", "11", "11");
async function rollout(n: number, lines: string[], options: { mtimeMs?: number; compressed?: boolean; bytes?: (raw: Buffer) => Buffer; nameTime?: string } = {}): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const path = join(dir(), `rollout-2026-11-11T${options.nameTime ?? "12-00-00"}-${ID(n)}.jsonl${options.compressed ? ".zst" : ""}`);
  const raw = Buffer.from(`${lines.join("\n")}\n`);
  const content = options.compressed ? compress(raw) : raw;
  await writeFile(path, options.bytes ? options.bytes(content) : content);
  const mtime = options.mtimeMs ?? FILE_TIME;
  await utimes(path, mtime / 1000, mtime / 1000);
  return path;
}
/** 대화를 되돌려 생긴 기록. 이름은 rollout-<시각>-<원래 세션>_<새 기록>이다 */
async function reverted(base: number, n: number, lines: string[], options: { mtimeMs?: number; nameTime?: string; compressed?: boolean } = {}): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const path = join(dir(), `rollout-2026-11-11T${options.nameTime ?? "13-00-00"}-${ID(base)}_${ID(n)}.jsonl${options.compressed ? ".zst" : ""}`);
  const raw = Buffer.from(`${lines.join("\n")}\n`);
  await writeFile(path, options.compressed ? compress(raw) : raw);
  const mtime = options.mtimeMs ?? FILE_TIME;
  await utimes(path, mtime / 1000, mtime / 1000);
  return path;
}
const HISTORY = { history_mode: "paginated", history_base: { thread_id: ID(1) } };
/** 시험 파일은 utimes가 변경 시각을 지금으로 바꾸므로, 수정 시각으로 시각을 꾸민 시험은 변경 시각을 수정 시각과 같게 읽는다 */
const sameTimes: StatFile = async (path) => {
  const info = await stat(path);
  return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.mtimeMs };
};
const options = (overrides: Partial<CodexCollectOptions> = {}): CodexCollectOptions => ({ env: {}, homedir: root, clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, cacheDir: join(root, "state", "cache"), rescan: false, statFile: sameTimes, ...overrides });
const responses = (summary: { days: Record<string, { responses: number }> }) => Object.values(summary.days).reduce((sum, day) => sum + day.responses, 0);
const bySession = (result: Awaited<ReturnType<typeof collectCodex>>, id: string) => result.summaries.find((summary) => summary.sessionId === id)!;
/** 보통 기록을 nth번째로 읽을 때 연 직후 keep바이트로 줄인다. restore를 주면 그 읽기가 끝난 뒤 원래 내용과 수정 시각으로 되돌린다. 읽은 횟수와 감시 해제를 돌려준다 */
function shortenRead(path: string, keep: number, nth = 1, restore: Buffer | null = null): { count: () => number; done: () => void } {
  const real = linesModule.readLines;
  let count = 0;
  const spy = vi.spyOn(linesModule, "readLines").mockImplementation(async (file, nowMs, sink, readOptions) => {
    if (file !== path || ++count !== nth) return real(file, nowMs, sink, readOptions);
    const outcome = await real(file, nowMs, sink, {
      ...readOptions,
      afterOpen: async () => {
        await truncate(file, keep);
        await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
      },
    });
    if (restore !== null) {
      await writeFile(file, restore);
      await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
    }
    return outcome;
  });
  return { count: () => count, done: () => spy.mockRestore() };
}

describe("기록 폴더와 읽은 양", () => {
  it("기록 폴더가 없으면 찾지 못한 것이고 요약이 없다", async () => {
    const result = await collectCodex(options());
    expect(result).toMatchObject({ tool: "codex", detected: false, summaries: [], parentRecordMissing: 0, mergedSessions: 0 });
    expect(result.read).toMatchObject({ files: 0, bytes: 0, skippedFiles: [], partialFiles: [] });
  });

  it("세션마다 요약 하나를 내고, 목록에 있는 기록과 바이트, 읽은 바이트를 센다", async () => {
    const a = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await rollout(2, [meta(ID(2)), record("r2", 20), record("r3", 30)]);
    const result = await collectCodex(options());
    expect(result.detected).toBe(true);
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1), ID(2)]);
    expect(responses(bySession(result, ID(2)))).toBe(2);
    const size = (await readFile(a)).length + (await readFile(join(dir(), `rollout-2026-11-11T12-00-00-${ID(2)}.jsonl`))).length;
    expect(result.read).toMatchObject({ files: 2, listedBytes: size, bytes: size, unreadableFiles: [], skippedCopies: 0 });
    expect(codexUnreadableCount(result.read)).toBe(0);
  });

  it("수집 구간보다 오래된 기록은 열지 않고 센다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: OLD_TIME });
    const result = await collectCodex(options());
    expect(result.summaries).toEqual([]);
    expect(result.read.olderThanWindow).toBe(1);
  });

  it("수정 시각과 변경 시각 가운데 늦은 것이 수집 구간의 아래 경계와 같으면 넣고, 그보다 앞서면 열지 않는다", async () => {
    const bound = makeWindows(NOW, "Asia/Seoul").collectStartLowerBoundMs;
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: bound });
    await rollout(2, [meta(ID(2)), record("r2", 10)], { mtimeMs: bound - 1 });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(result.read).toMatchObject({ files: 1, olderThanWindow: 1 });
  });

  it("늦은 시각이 평가 시각에서 정확히 2초 전이면 쓰는 중이 아니다(2초 안쪽만 쓰는 중이다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const at = (ms: number): StatFile => async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: ms };
    };
    expect((await collectCodex(options({ cacheDir: null, statFile: at(NOW - 2000) }))).read.inProgress).toBe(0);
    expect((await collectCodex(options({ cacheDir: null, statFile: at(NOW - 1999) }))).read.inProgress).toBe(1);
  });

  it("수정 시각이 수집 구간보다 앞서도 변경 시각이 구간 안이면(쓰는 동안 수정 시각이 만든 시각에 머문 기록) 구간에 넣어 읽는다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: OLD_TIME });
    // 진짜 stat을 쓴다. utimes가 수정 시각만 옛날로 돌리고 변경 시각은 지금으로 바꿨다
    const result = await collectCodex(options({ statFile: undefined, cacheDir: null }));
    expect(result.read).toMatchObject({ files: 1, olderThanWindow: 0 });
    expect(responses(result.summaries[0]!)).toBe(1);
  });

  it("절반 넘게 깨진 기록은 읽지 못한 파일로 세고 풀린 줄의 숫자는 쓴다. 그런 기록이 여럿이면 바이트를 더한다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10), "{x", "{y", "{z"]);
    const second = await rollout(2, [meta(ID(2)), "{x", "{y"]);
    const result = await collectCodex(options());
    expect(result.read.unreadableFiles).toEqual([path, second].sort());
    expect(responses(bySession(result, ID(1)))).toBe(1);
    expect(result.read.unreadableFileBytes).toBe((await readFile(path)).length + (await readFile(second)).length);
    expect(codexUnreadableCount(result.read)).toBe(2);
  });

  it("크기를 보지 못한 사본은 정본을 읽은 기록의 것이어도 크기를 모르는 사본으로 세고, 수정 시각을 보지 못한 사본이 있던 세션을 센다. 목록 바이트는 읽은 사본의 것이다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const listed = await listCodexFiles(join(root, ".codex"), null, sameTimes);
    const ghost = `${path}.zst`;
    const list = { ...listed, files: [...listed.files, { path: ghost, normPath: ghost.toLowerCase(), size: null, mtimeMs: null, changedMs: null, recordId: ID(1), baseId: null, compressed: true }] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.read).toMatchObject({ files: 1, listedBytes: (await readFile(path)).length, unknownSizeFiles: 1, unreadableFiles: [], skippedCopies: 1 });
    expect(result.unknownMtimeSessions).toBe(1);
  });

  it("세션 ID를 기록 파일의 식별자로 대신 쓴 기록을 까닭별로 센다. 깨진 첫 줄 뒤의 session_meta로 정체를 정하지 않는다", async () => {
    await rollout(1, ["{broken", meta(ID(9)), record("r1", 10), record("r2", 10), record("r3", 10)]);
    await rollout(2, [record("r9", 5)]);
    await rollout(3, [record("r8", 5)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.idFallbacks).toEqual({ "first-line-not-meta": 2, "first-line-unreadable": 1 });
    expect(result.summaries.map((summary) => summary.sessionId).sort()).toEqual([ID(1), ID(2), ID(3)]);
  });

  it("크기를 모르는 사본은 하나하나 세고, 수정 시각을 모르는 사본은 논리 세션마다 한 번 센다. 크기는 알고 수정 시각만 모르는 사본은 크기를 모르는 사본이 아니다", async () => {
    const original = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const later = await reverted(1, 3, [meta(ID(1), HISTORY), record("r3", 30)]);
    const listed = await listCodexFiles(join(root, ".codex"), null, sameTimes);
    const ghost = (path: string, recordId: string, baseId: string | null, size: number | null) => ({ path, normPath: path.toLowerCase(), size, mtimeMs: null, changedMs: null, recordId, baseId, compressed: true });
    const list = { ...listed, files: [...listed.files, ghost(`${original}.zst`, ID(1), null, null), ghost(`${original}.old.zst`, ID(1), null, null), ghost(`${later}.zst`, ID(3), ID(1), 100)] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result.read.unknownSizeFiles).toBe(2);
    expect(result.unknownMtimeSessions).toBe(1);
  });

  it("정본을 열지 못하고 다른 사본도 없으면 읽지 못한 파일이고, 크기를 모르면 크기를 모르는 파일로도 센다", async () => {
    await mkdir(dir(), { recursive: true });
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const unknown = join(dir(), `rollout-2026-11-11T12-00-00-${ID(2)}.jsonl`);
    const list = {
      sessionsFound: true,
      files: [
        { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false },
        { path: unknown, normPath: unknown.toLowerCase(), size: null, mtimeMs: null, changedMs: null, recordId: ID(2), baseId: null, compressed: false },
      ],
      olderThanWindow: 0,
      unreadableDirs: [],
      unnamedFiles: 0,
    };
    const result = await collectCodexFromList(join(root, ".codex"), list, options());
    expect(result.read).toMatchObject({ files: 2, listedBytes: 10, unreadableFiles: [missing, unknown].sort(), unreadableFileBytes: 10, unknownSizeFiles: 1 });
  });
});

describe.skipIf(!zstdAvailable())("사본과 압축 기록", () => {
  it("같은 기록 파일의 사본 가운데 압축하지 않은 정본 하나만 읽고, 읽지 않은 사본을 센다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await rollout(1, [meta(ID(1)), record("r1", 10), record("r2", 20)], { compressed: true });
    const result = await collectCodex(options());
    expect(result.summaries).toHaveLength(1);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.read).toMatchObject({ files: 1, skippedCopies: 1 });
  });

  it("정본을 열지 못하면 다음 사본을 읽는다", async () => {
    const zst = await rollout(1, [meta(ID(1)), record("r1", 10), record("r2", 20)], { compressed: true });
    const listed = await listCodexFiles(join(root, ".codex"), null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 99, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options());
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result.read).toMatchObject({ unreadableFiles: [], skippedCopies: 1 });
    expect(result.read.bytes).toBe((await readFile(zst)).length);
    expect(result.read.listedBytes).toBe((await readFile(zst)).length);
  });

  it("다음 사본을 읽은 기록이 절반 넘게 깨졌으면 읽지 못한 파일과 그 바이트는 읽은 사본의 것이다(읽지 못한 비율이 1을 넘지 않는다)", async () => {
    const zst = await rollout(1, [meta(ID(1)), record("r1", 10), "{x", "{y", "{z"], { compressed: true });
    const listed = await listCodexFiles(join(root, ".codex"), null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 100_000, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(join(root, ".codex"), list, options());
    const size = (await readFile(zst)).length;
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.read).toMatchObject({ unreadableFiles: [zst], listedBytes: size, unreadableFileBytes: size });
  });

  it("압축 기록만 있으면 풀어 읽는다. 풀 수 없는 Node.js에서는 건너뛴 압축 파일로 세고 그 바이트를 센다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true });
    expect(responses((await collectCodex(options())).summaries[0]!)).toBe(1);
    const skipped = await collectCodex(options({ zstd: false, cacheDir: null }));
    expect(skipped.summaries).toEqual([]);
    expect(skipped.read).toMatchObject({ files: 1, skippedFiles: [path], skippedFileBytes: (await readFile(path)).length, unreadableFiles: [] });
    expect(codexUnreadableCount(skipped.read)).toBe(1);
  });

  it("목록 바이트는 디코더가 읽은 양이 아니라 읽은 사본 파일의 크기다(앞의 건너뛸 수 있는 프레임도 든다)", async () => {
    const skippable = Buffer.alloc(24);
    skippable.writeUInt32LE(0x184d2a50, 0);
    skippable.writeUInt32LE(16, 4);
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true, bytes: (content) => Buffer.concat([skippable, content]) });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.read.listedBytes).toBe((await readFile(path)).length);
  });

  it("앞에 건너뛸 수 있는 프레임이 있어 읽은 바이트가 파일 크기보다 작은 정상 압축 기록도 쓰는 중이 아니고 캐시에 넣는다(목록 뒤 변경은 파일 크기로 견준다)", async () => {
    const skippable = Buffer.alloc(24);
    skippable.writeUInt32LE(0x184d2a50, 0);
    skippable.writeUInt32LE(16, 4);
    await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true, bytes: (content) => Buffer.concat([skippable, content]) });
    const first = await collectCodex(options());
    const second = await collectCodex(options());
    expect(first.read.bytes).toBeLessThan(first.read.listedBytes);
    expect(first.read).toMatchObject({ inProgress: 0, unreadableFiles: [], partialFiles: [] });
    expect(second.read.fromCache).toBe(1);
    expect(second.summaries).toEqual(first.summaries);
  });

  it("연 뒤에 마지막 바이트가 붙어 하나뿐인 압축 프레임이 완성돼도 연 크기 안에서 풀리던 응답을 잃지 않는다", async () => {
    const noise = Array.from({ length: 6000 }, (_, index) => JSON.stringify({ noise: createHash("sha256").update(`codex${index}`).digest("hex") }));
    const full = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10), ...noise].join("\n")}\n`));
    const prefix = full.subarray(0, full.length - 1);
    const path = await rollout(1, [], { compressed: true, bytes: () => prefix });
    const control = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(control, ID(1)))).toBe(1);
    expect(control.read.partialFiles).toEqual([path]);
    const read = zstdModule.readZstdLines;
    let appended = false;
    // 압축 읽기가 크기를 잡은 직후에 마지막 바이트를 붙인다
    const spy = vi.spyOn(zstdModule, "readZstdLines").mockImplementation(async (file, nowMs, sink, readOptions) =>
      read(file, nowMs, sink, {
        ...readOptions,
        afterOpen: async () => {
          if (!appended) {
            appended = true;
            await appendFile(path, full.subarray(prefix.length));
          }
        },
      }),
    );
    try {
      const raced = await collectCodex(options({ cacheDir: null }));
      expect(appended).toBe(true);
      expect(responses(bySession(raced, ID(1)))).toBe(1);
      expect(raced.read.partialFiles).toEqual([path]);
    } finally {
      spy.mockRestore();
    }
  });

  it("압축 기록을 훑는 동안 파일이 줄어 둘째 프레임의 매직을 다 읽지 못해도 앞 프레임의 응답을 지키고 일부만 읽은 파일로 센다(매직 두 바이트가 남을 때와 하나도 남지 않을 때)", async () => {
    const first = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`));
    const bytes = Buffer.concat([first, compress(Buffer.from(`${record("r2", 20)}\n`))]);
    const path = await rollout(1, [], { compressed: true, bytes: () => bytes });
    const probe = await open(path, "r");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    for (const keep of [2, 0]) {
      writeFileSync(path, bytes);
      utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
      let cut = false;
      // 압축 훑기가 둘째 프레임의 매직을 읽을 때 파일을 첫 프레임과 매직의 앞부분으로 줄인다(수정 시각은 그대로)
      const spy = vi.spyOn(proto, "read").mockImplementation(function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
        if (!cut && position === first.length && length === 4) {
          cut = true;
          truncateSync(path, first.length + keep);
          utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
        }
        return read.call(this, buffer, offset, length, position);
      });
      try {
        const result = await collectCodex(options({ cacheDir: null }));
        expect(cut, `${keep}`).toBe(true);
        expect(responses(bySession(result, ID(1))), `${keep}`).toBe(1);
        expect(result.read, `${keep}`).toMatchObject({ partialFiles: [path], unreadableFiles: [], inProgress: 1 });
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("오래되고 바뀌지 않은 압축 기록의 잘린 끝·틀린 매직·체크섬 오류는 쓰는 중이 아니어서, 닫히지 않은 끝 줄을 덜 쓴 끝 조각으로 미루지 않고 깨진 줄로 센다", async () => {
    const first = compress(Buffer.from('{"type":"session_meta"'));
    const badChecksum = Buffer.from(zlib.zstdCompressSync(Buffer.from(" "), { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } }));
    badChecksum[badChecksum.length - 1] = badChecksum[badChecksum.length - 1]! ^ 0xff;
    // [이름, 첫 프레임 뒤의 바이트]. 읽는 동안 파일은 바뀌지 않는다
    const cases: Array<[string, Buffer]> = [
      ["매직 앞부분", Buffer.from([0x28, 0xb5])],
      ["틀린 매직", Buffer.from([0x99])],
      ["체크섬 오류", badChecksum],
    ];
    for (const [name, rest] of cases) {
      const path = await rollout(1, [], { compressed: true, bytes: () => Buffer.concat([first, rest]) });
      const result = await collectCodex(options({ cacheDir: null }));
      expect(result.read, name).toMatchObject({ inProgress: 0, unreadableFiles: [path], partialFiles: [] });
      expect(result.summaries, name).toMatchObject([{ missing: { lines: 1, brokenLines: 1, tailFragments: 0 } }]);
    }
  });

  it("훑은 뒤 풀며 읽는 동안 압축 기록이 줄면 디코더가 조용히 끝나도 그 기록을 일부만 읽은 파일로 세고, 그 기록이 부모인 하위 세션은 이어받은 것을 확인하지 못한 세션이다", async () => {
    const first = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`));
    const body = Buffer.from(`${record("r2", 20)}\n`);
    const path = await rollout(1, [], { compressed: true, bytes: () => Buffer.concat([first, rawFrame(body)]) });
    await rollout(2, [sub(ID(2), ID(1)), record("r1", 10), record("s1", 30)]);
    const probe = await open(path, "r");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    let cut = false;
    // 훑기가 둘째 프레임의 블록 머리를 읽은 뒤 파일을 그 내용의 가운데까지로 줄인다(수정 시각은 그대로)
    const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      const result = await read.call(this, buffer, offset, length, position);
      if (!cut && position === first.length + 6 && length === 3) {
        cut = true;
        truncateSync(path, first.length + 9 + Math.floor(body.length / 2));
        utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
      }
      return result;
    });
    try {
      const result = await collectCodex(options({ cacheDir: null }));
      expect(cut).toBe(true);
      expect(responses(bySession(result, ID(1)))).toBe(1);
      expect(result.read).toMatchObject({ partialFiles: [path], unreadableFiles: [], inProgress: 1 });
      expect(responses(bySession(result, ID(2)))).toBe(1);
      expect(result.unverifiedInheritance).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("훑은 뒤 풀며 읽는 동안 줄었던 압축 기록은 그 뒤 크기와 수정 시각이 되돌아와도 캐시에 넣지 않아, 다음 모으기가 끝까지 다시 읽는다(내용 가운데까지 줄 때와 둘째 프레임을 하나도 받지 못할 때)", async () => {
    const first = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`));
    const body = Buffer.from(`${record("r2", 20)}\n`);
    const bytes = Buffer.concat([first, rawFrame(body)]);
    const path = await rollout(1, [], { compressed: true, bytes: () => bytes });
    const probe = await open(path, "r");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    const emit = ReadStream.prototype.emit;
    // [이름, 줄인 뒤 남는 둘째 프레임의 바이트]
    const cases: Array<[string, number]> = [
      ["내용 가운데", 9 + Math.floor(body.length / 2)],
      ["하나도 받지 못함", 0],
    ];
    for (const [name, keep] of cases) {
      writeFileSync(path, bytes);
      utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
      const cacheDir = join(root, "state", `cache-${keep}`);
      let cut = false;
      let restored = false;
      // 훑기가 둘째 프레임의 블록 머리를 읽은 뒤 파일을 줄이고, 둘째 프레임을 읽은 스트림이 끝날 때 크기와 수정 시각까지 되돌린다
      const readSpy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
        const result = await read.call(this, buffer, offset, length, position);
        if (!cut && position === first.length + 6 && length === 3) {
          cut = true;
          truncateSync(path, first.length + keep);
        }
        return result;
      });
      const emitSpy = vi.spyOn(ReadStream.prototype, "emit").mockImplementation(function (this: ReadStream, event: string | symbol, ...args: unknown[]) {
        if (event === "end" && cut && !restored && (this as unknown as { start?: number }).start === first.length) {
          restored = true;
          writeFileSync(path, bytes);
          utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
        }
        return emit.call(this, event, ...args);
      });
      let firstRun: Awaited<ReturnType<typeof collectCodex>>;
      try {
        firstRun = await collectCodex(options({ cacheDir }));
      } finally {
        emitSpy.mockRestore();
        readSpy.mockRestore();
      }
      expect(cut && restored, name).toBe(true);
      expect(responses(bySession(firstRun, ID(1))), name).toBe(1);
      expect(firstRun.read, name).toMatchObject({ partialFiles: [path], inProgress: 1 });
      const again = await collectCodex(options({ cacheDir }));
      expect(again.read, name).toMatchObject({ fromCache: 0, partialFiles: [], inProgress: 0 });
      expect(responses(bySession(again, ID(1))), name).toBe(2);
    }
  });

  it("보통 기록의 첫 읽기에서 파일이 끝났으면 그 뒤 되돌아와도 쓰는 중이어서, 빈 요약을 온전한 파일의 열쇠로 캐시에 넣지 않는다", async () => {
    const body = `${[meta(ID(1)), record("r1", 10)].join("\n")}\n`;
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const realReadLines = linesModule.readLines;
    // 줄 읽기의 첫 읽기만 가려내려고 한 번에 17바이트씩 읽게 한다(캐시 열쇠의 지문 읽기와 길이가 다르다)
    const linesSpy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realReadLines(file, nowMs, sink, { ...readOptions, chunkBytes: 17 }));
    const probe = await open(path, "r");
    const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    let ended = false;
    const readSpy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
      if (!ended && position === 0 && length === 17) {
        ended = true;
        await truncate(path, 0);
        const result = await read.call(this, buffer, offset, length, position);
        expect(result.bytesRead).toBe(0);
        await writeFile(path, body);
        await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
        return result;
      }
      return read.call(this, buffer, offset, length, position);
    });
    let firstRun: Awaited<ReturnType<typeof collectCodex>>;
    try {
      firstRun = await collectCodex(options());
    } finally {
      readSpy.mockRestore();
      linesSpy.mockRestore();
    }
    expect(ended).toBe(true);
    expect(firstRun.read.inProgress).toBe(1);
    expect(firstRun.summaries.flatMap((summary) => Object.values(summary.days)).reduce((sum, day) => sum + day.responses, 0)).toBe(0);
    const again = await collectCodex(options());
    expect(again.read.fromCache).toBe(0);
    expect(responses(bySession(again, ID(1)))).toBe(1);
  });

  it("연 뒤 훑기 전에 프레임 경계까지 줄었다가 되돌아온 압축 기록은 캐시에 넣지 않아, 다음 모으기가 끝까지 다시 읽는다", async () => {
    const first = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`));
    const bytes = Buffer.concat([first, compress(Buffer.from(`${record("r2", 20)}\n`))]);
    const path = await rollout(1, [], { compressed: true, bytes: () => bytes });
    const cacheDir = join(root, "state", "cache");
    const realRead = zstdModule.readZstdLines;
    // 압축 읽기가 연 직후 파일을 첫 프레임 끝까지 줄이고, 첫 프레임을 읽은 스트림이 끝날 때 크기와 수정 시각까지 되돌린다
    const readSpy = vi.spyOn(zstdModule, "readZstdLines").mockImplementation((file, nowMs, sink, readOptions) => realRead(file, nowMs, sink, { ...readOptions, afterOpen: () => truncate(path, first.length) }));
    const emit = ReadStream.prototype.emit;
    let restored = false;
    const emitSpy = vi.spyOn(ReadStream.prototype, "emit").mockImplementation(function (this: ReadStream, event: string | symbol, ...args: unknown[]) {
      if (event === "end" && !restored && (this as unknown as { start?: number }).start === 0) {
        restored = true;
        writeFileSync(path, bytes);
        utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
      }
      return emit.call(this, event, ...args);
    });
    let firstRun: Awaited<ReturnType<typeof collectCodex>>;
    try {
      firstRun = await collectCodex(options({ cacheDir }));
    } finally {
      emitSpy.mockRestore();
      readSpy.mockRestore();
    }
    expect(restored).toBe(true);
    expect(responses(bySession(firstRun, ID(1)))).toBe(1);
    expect(firstRun.read.inProgress).toBe(1);
    const again = await collectCodex(options({ cacheDir }));
    expect(again.read).toMatchObject({ fromCache: 0, inProgress: 0 });
    expect(responses(bySession(again, ID(1)))).toBe(2);
  });

  it("변경 시각의 밀리초 아래도 2초 안쪽 판정에 들어 캐시를 꺼내지 않는다(평가 시각에서 1999.75밀리초 전)", async () => {
    const body = `${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"unfinished":`;
    const path = await rollout(1, [], { bytes: () => Buffer.from(body) });
    const s = await stat(path);
    const cacheDir = join(root, "state", "cache");
    const warm = await collectCodex(options({ cacheDir, statFile: async () => ({ size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.mtimeMs }) }));
    expect(warm.read).toMatchObject({ fromCache: 0, inProgress: 0 });
    expect(warm.summaries[0]!.missing).toMatchObject({ brokenLines: 1, tailFragments: 0 });
    const recent = await collectCodex(options({ cacheDir, statFile: async () => ({ size: s.size, mtimeMs: s.mtimeMs, ctimeMs: NOW - 1999.75 }) }));
    expect(recent.read).toMatchObject({ fromCache: 0, inProgress: 1 });
    expect(recent.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
  });

  it("캐시의 읽은 바이트나 개수 칸이 성립하지 않는 수면 다시 읽어 캐시 없이 읽은 결과와 같다(음수 바이트, 파일보다 큰 바이트, 음수 응답, 음수 이어받아 뺀 수, 소수 모델별 수, 안전하지 않은 토큰, 소수와 안전하지 않은 모르는 종류 수. 빈 파일의 1바이트도)", async () => {
    await rollout(1, [meta(ID(1)), line("turn_context", { model: "m", effort: "high" }), record("r1", 10), item({ type: "NewTool", id: "x" })]);
    const cacheDir = join(root, "state", "cache");
    await collectCodex(options({ cacheDir }));
    const folder = join(cacheDir, "codex");
    const names = (await readdir(folder)).filter((name) => name.endsWith(".json"));
    expect(names).toHaveLength(1);
    const file = join(folder, names[0]!);
    const entry = JSON.parse(await readFile(file, "utf8")) as { key: { size: number }; bytesRead: number; summary: Record<string, any> };
    const direct = await collectCodex(options({ cacheDir: null }));
    const date = Object.keys(entry.summary.days)[0]!;
    const broken = [
      { ...entry, bytesRead: -1 },
      { ...entry, bytesRead: entry.key.size + 1 },
      { ...entry, summary: { ...entry.summary, days: { ...entry.summary.days, [date]: { ...entry.summary.days[date], responses: -1 } } } },
      { ...entry, summary: { ...entry.summary, codex: { ...entry.summary.codex, inheritedSkipped: { ...entry.summary.codex.inheritedSkipped, items: -1 } } } },
      { ...entry, summary: { ...entry.summary, days: { ...entry.summary.days, [date]: { ...entry.summary.days[date], models: { ...entry.summary.days[date].models, m: 0.5 } } } } },
      { ...entry, summary: { ...entry.summary, days: { ...entry.summary.days, [date]: { ...entry.summary.days[date], tokens: { ...entry.summary.days[date].tokens, input: 2 ** 53 } } } } },
      { ...entry, summary: { ...entry.summary, codex: { ...entry.summary.codex, unknownItemTypes: { ...entry.summary.codex.unknownItemTypes, NewTool: 0.5 } } } },
      { ...entry, summary: { ...entry.summary, codex: { ...entry.summary.codex, unknownItemTypes: { ...entry.summary.codex.unknownItemTypes, NewTool: 2 ** 53 } } } },
    ];
    for (const [index, value] of broken.entries()) {
      await writeFile(file, JSON.stringify(value));
      const again = await collectCodex(options({ cacheDir }));
      expect(again.read.fromCache, `${index}`).toBe(0);
      expect(again.read.bytes, `${index}`).toBe(direct.read.bytes);
      expect(JSON.stringify(again.summaries), `${index}`).toBe(JSON.stringify(direct.summaries));
    }
    // 빈 파일의 캐시에 1바이트를 적어도 꺼내지 않는다
    rmSync(join(root, ".codex"), { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
    await rollout(3, [], { bytes: () => Buffer.alloc(0) });
    await collectCodex(options({ cacheDir }));
    const [emptyName] = (await readdir(folder)).filter((name) => name.endsWith(".json"));
    const emptyFile = join(folder, emptyName!);
    const emptyEntry = JSON.parse(await readFile(emptyFile, "utf8")) as { bytesRead: number };
    expect(emptyEntry.bytesRead).toBe(0);
    await writeFile(emptyFile, JSON.stringify({ ...emptyEntry, bytesRead: 1 }));
    const emptyAgain = await collectCodex(options({ cacheDir }));
    expect(emptyAgain.read).toMatchObject({ fromCache: 0, bytes: 0 });
  });

  it("부모 기록을 읽는 동안 줄었다 되돌아왔으면 앞부분만 읽은 것이라, 일부만 읽은 파일로 세고 하위 세션은 이어받은 것을 확인하지 못하며 MCP 관측은 빠짐없지 않다(압축과 보통 기록. 최근에 고쳤을 뿐 다 읽은 기록은 그렇지 않다)", async () => {
    const mcp = item({ type: "McpToolCall", id: "hidden-call", server: "hidden-server", status: "completed" });
    const calls = (summary: { days: Record<string, { mcpCalls: Record<string, number> }> }) => Object.values(summary.days).reduce((sum, day) => sum + (day.mcpCalls["hidden-server"] ?? 0), 0);
    for (const compressed of [true, false]) {
      const label = compressed ? "압축" : "보통";
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      rmSync(join(root, "state"), { recursive: true, force: true });
      const front = Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`);
      const back = Buffer.from(`${[record("r2", 10), mcp].join("\n")}\n`);
      const first = compressed ? compress(front) : front;
      const full = compressed ? Buffer.concat([first, compress(back)]) : Buffer.concat([front, back]);
      const parent = await rollout(1, [], { compressed, bytes: () => full });
      await rollout(2, [sub(ID(2), ID(1)), record("r1", 10), record("r2", 10), record("s1", 10)]);
      const direct = await collectCodex(options({ cacheDir: null }));
      expect(direct.read.inProgress, label).toBe(0);
      expect(direct.unverifiedInheritance, label).toBe(0);
      expect(responses(bySession(direct, ID(2))), label).toBe(1);
      expect(calls(bySession(direct, ID(1))), label).toBe(1);
      // 최근에 고쳤을 뿐 연 크기까지 다 읽은 기록은 쓰는 중이어도 일부만 읽은 것이 아니다
      const recent = await collectCodex(options({ cacheDir: null, clock: { nowMs: FILE_TIME + 1000, timeZone: "Asia/Seoul" } }));
      expect(recent.read, label).toMatchObject({ inProgress: 2, partialFiles: [] });
      expect(recent.unverifiedInheritance, label).toBe(0);
      expect(codexMcpObservation(recent.summaries, codexUnreadableCount(recent.read)).complete, label).toBe(true);
      // 부모를 연 직후 앞부분 끝까지 줄이고, 앞부분을 다 읽은 때 내용과 수정 시각을 되돌린다
      let cut = false;
      let restored = false;
      const restore = (): void => {
        if (restored) return;
        restored = true;
        writeFileSync(parent, full);
        utimesSync(parent, FILE_TIME / 1000, FILE_TIME / 1000);
      };
      const shrink = async (): Promise<void> => {
        cut = true;
        await truncate(parent, first.length);
      };
      const probe = await open(parent, "r");
      const proto: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> } = Object.getPrototypeOf(probe);
      await probe.close();
      const realRead = proto.read;
      const emit = ReadStream.prototype.emit;
      const realZstd = zstdModule.readZstdLines;
      const realLines = linesModule.readLines;
      const spies: Array<{ mockRestore(): void }> = [];
      if (compressed) {
        spies.push(vi.spyOn(ReadStream.prototype, "emit").mockImplementation(function (this: ReadStream, event: string | symbol, ...args: unknown[]) {
          if (cut && event === "end" && (this as unknown as { start?: number }).start === 0) restore();
          return emit.call(this, event, ...args);
        }));
        spies.push(vi.spyOn(zstdModule, "readZstdLines").mockImplementation((file, nowMs, sink, readOptions) => realZstd(file, nowMs, sink, file === parent && !cut ? { ...readOptions, afterOpen: shrink } : readOptions)));
      } else {
        spies.push(vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, buffer: Buffer, offset: number, length: number, position: number) {
          const result = await realRead.call(this, buffer, offset, length, position);
          if (cut && result.bytesRead === 0) restore();
          return result;
        }));
        spies.push(vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realLines(file, nowMs, sink, file === parent && !cut ? { ...readOptions, afterOpen: shrink } : readOptions)));
      }
      let shrunk: Awaited<ReturnType<typeof collectCodex>>;
      try {
        shrunk = await collectCodex(options());
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
      expect(cut && restored, label).toBe(true);
      expect(shrunk.read, label).toMatchObject({ inProgress: 1, partialFiles: [parent] });
      expect(shrunk.unverifiedInheritance, label).toBe(1);
      expect(codexMcpObservation(shrunk.summaries, codexUnreadableCount(shrunk.read)).complete, label).toBe(false);
      // 되돌아온 기록을 다시 모으면 끝까지 읽어 온전하다
      const again = await collectCodex(options());
      expect(again.read, label).toMatchObject({ inProgress: 0, partialFiles: [] });
      expect(again.unverifiedInheritance, label).toBe(0);
      expect(responses(bySession(again, ID(2))), label).toBe(1);
    }
  });

  it("연 뒤에 덧붙은 기록은 연 크기까지 다 읽었으니 쓰는 중일 뿐, 일부만 읽은 파일이 아니고 MCP 관측도 빠짐없다(압축과 보통 기록. 덧붙은 것은 다음 모으기에서 읽는다)", async () => {
    const mcp = item({ type: "McpToolCall", id: "call-1", server: "s", status: "completed" });
    for (const compressed of [true, false]) {
      const label = compressed ? "압축" : "보통";
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      rmSync(join(root, "state"), { recursive: true, force: true });
      const front = Buffer.from(`${[meta(ID(1)), record("r1", 10), mcp].join("\n")}\n`);
      const back = Buffer.from(`${record("r2", 10)}\n`);
      const path = await rollout(1, [], { compressed, bytes: () => (compressed ? compress(front) : front) });
      let appended = false;
      // 기록을 연 직후 뒤에 덧붙이고 수정 시각을 되돌린다(읽은 뒤의 크기가 연 크기보다 크다)
      const grow = async (): Promise<void> => {
        appended = true;
        appendFileSync(path, compressed ? compress(back) : back);
        utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
      };
      const realZstd = zstdModule.readZstdLines;
      const realLines = linesModule.readLines;
      const spy = compressed
        ? vi.spyOn(zstdModule, "readZstdLines").mockImplementation((file, nowMs, sink, readOptions) => realZstd(file, nowMs, sink, file === path && !appended ? { ...readOptions, afterOpen: grow } : readOptions))
        : vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realLines(file, nowMs, sink, file === path && !appended ? { ...readOptions, afterOpen: grow } : readOptions));
      let grown: Awaited<ReturnType<typeof collectCodex>>;
      try {
        grown = await collectCodex(options());
      } finally {
        spy.mockRestore();
      }
      expect(appended, label).toBe(true);
      expect(grown.read, label).toMatchObject({ inProgress: 1, partialFiles: [], unreadableFiles: [] });
      expect(responses(bySession(grown, ID(1))), label).toBe(1);
      expect(codexMcpObservation(grown.summaries, codexUnreadableCount(grown.read)).complete, label).toBe(true);
      const again = await collectCodex(options());
      expect(again.read, label).toMatchObject({ fromCache: 0, inProgress: 0, partialFiles: [] });
      expect(responses(bySession(again, ID(1))), label).toBe(2);
    }
  });

  it("읽는 동안 줄어 덜 읽은 기록은 줄어든 채 남거나, 첫 읽기에서 끝나 읽은 줄이 없거나, 변경 시각이나 수정 시각이 최근이거나 평가 시각보다 뒤여도 일부만 읽은 파일이다(압축과 보통 기록. 그 기록이 부모인 하위 세션은 이어받은 것을 확인하지 못한다)", async () => {
    const mcp = item({ type: "McpToolCall", id: "hidden-call", server: "hidden-server", status: "completed" });
    const front = Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`);
    const back = Buffer.from(`${[record("r2", 10), mcp].join("\n")}\n`);
    // 변경 시각만 평가 시각의 1초 전으로 읽는다(크기와 수정 시각은 그대로)
    const recentChange: StatFile = async (path) => ({ ...(await sameTimes(path)), ctimeMs: NOW - 1000 });
    // 연 직후 남길 바이트(앞부분 그대로, 0바이트, 앞부분의 마지막 줄바꿈만 없앰, 다음 줄의 닫는 괄호만 없앰)
    const whole = (first: Buffer): number => first.length;
    const none = (): number => 0;
    const noNewline = (first: Buffer): number => first.length - 1;
    const cutLine = (first: Buffer): number => first.length + Buffer.byteLength(record("r2", 10)) - 1;
    // 이름, 압축인지, 연 직후 남길 바이트, 기록의 수정 시각, 시각을 읽는 법
    const cases: Array<[string, boolean, (first: Buffer) => number, number, StatFile]> = [
      ["보통, 줄어든 채 남음", false, whole, FILE_TIME, sameTimes],
      ["보통, 첫 읽기에서 끝남", false, none, FILE_TIME, sameTimes],
      ["보통, 끝이 줄바꿈 없는 완전한 줄", false, noNewline, FILE_TIME, sameTimes],
      ["보통, 끝이 잘린 줄", false, cutLine, FILE_TIME, sameTimes],
      ["보통, 변경 시각이 최근", false, whole, FILE_TIME, recentChange],
      ["보통, 수정 시각이 1초 전", false, whole, NOW - 1000, sameTimes],
      ["보통, 수정 시각이 평가 시각보다 1초 뒤", false, whole, NOW + 1000, sameTimes],
      ["압축, 줄어든 채 남음", true, whole, FILE_TIME, sameTimes],
      ["압축, 수정 시각이 1초 전", true, whole, NOW - 1000, sameTimes],
      ["압축, 수정 시각이 평가 시각보다 1초 뒤", true, whole, NOW + 1000, sameTimes],
    ];
    for (const [name, compressed, keep, mtime, statFile] of cases) {
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      const first = compressed ? compress(front) : front;
      const full = Buffer.concat([first, compressed ? compress(back) : back]);
      const parent = await rollout(1, [], { compressed, mtimeMs: mtime, bytes: () => full });
      await rollout(2, [sub(ID(2), ID(1)), record("r1", 10), record("r2", 10), record("s1", 10)], { mtimeMs: mtime });
      let cut = false;
      const shrink = async (): Promise<void> => {
        cut = true;
        await truncate(parent, keep(first));
        await utimes(parent, mtime / 1000, mtime / 1000);
      };
      const realLines = linesModule.readLines;
      const realZstd = zstdModule.readZstdLines;
      const spy = compressed
        ? vi.spyOn(zstdModule, "readZstdLines").mockImplementation((file, nowMs, sink, readOptions) => realZstd(file, nowMs, sink, file === parent && !cut ? { ...readOptions, afterOpen: shrink } : readOptions))
        : vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realLines(file, nowMs, sink, file === parent && !cut ? { ...readOptions, afterOpen: shrink } : readOptions));
      let result: Awaited<ReturnType<typeof collectCodex>>;
      try {
        result = await collectCodex(options({ cacheDir: null, statFile }));
      } finally {
        spy.mockRestore();
      }
      expect(cut, name).toBe(true);
      expect(result.read.partialFiles, name).toEqual([parent]);
      expect(result.read.unreadableFiles, name).toEqual([]);
      expect(result.unverifiedInheritance, name).toBe(1);
      expect(codexMcpObservation(result.summaries, codexUnreadableCount(result.read)).complete, name).toBe(false);
    }
  });

  it("깨진 줄이 몇 개 있어도 연 크기까지 읽기 전에 끝난 기록은 일부만 읽은 파일이고, 끝까지 읽은 기록은 일부만 읽은 파일이 아니다(깨진 줄과 덜 읽음은 따로 안다)", async () => {
    // 세션 정보로 보이는 깨진 줄이라 MCP 관측을 막지 않는다
    const broken = '{"type":"session_meta"';
    const mcp = item({ type: "McpToolCall", id: "hidden-call", server: "hidden-server", status: "completed" });
    const keep = `${[meta(ID(1)), record("r1", 10), broken].join("\n")}\n`;
    const full = `${keep}${[record("r2", 10), mcp].join("\n")}\n`;
    await rollout(1, [], { bytes: () => Buffer.from(full) });
    const complete = await collectCodex(options({ cacheDir: null }));
    expect(complete.summaries[0]!.missing.brokenLines).toBe(1);
    expect(complete.read).toMatchObject({ partialFiles: [], unreadableFiles: [] });
    expect(codexMcpObservation(complete.summaries, codexUnreadableCount(complete.read)).complete).toBe(true);
    rmSync(join(root, ".codex"), { recursive: true, force: true });
    const parent = await rollout(1, [], { bytes: () => Buffer.from(full) });
    await rollout(2, [sub(ID(2), ID(1)), record("r1", 10), record("r2", 10), record("s1", 10)]);
    const realLines = linesModule.readLines;
    let cut = false;
    const shrink = async (): Promise<void> => {
      cut = true;
      await truncate(parent, Buffer.byteLength(keep));
      await utimes(parent, FILE_TIME / 1000, FILE_TIME / 1000);
    };
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realLines(file, nowMs, sink, file === parent && !cut ? { ...readOptions, afterOpen: shrink } : readOptions));
    let short: Awaited<ReturnType<typeof collectCodex>>;
    try {
      short = await collectCodex(options({ cacheDir: null }));
    } finally {
      spy.mockRestore();
    }
    expect(cut).toBe(true);
    expect(bySession(short, ID(1)).missing.brokenLines).toBe(1);
    expect(short.read).toMatchObject({ partialFiles: [parent], unreadableFiles: [] });
    expect(short.unverifiedInheritance).toBe(1);
    expect(codexMcpObservation(short.summaries, codexUnreadableCount(short.read)).complete).toBe(false);
  });

  it("읽는 동안 줄어 덜 읽은 기록이 절반 넘게 깨졌으면 일부만 읽은 파일이 아니라 읽지 못한 파일 하나로 세고, 읽지 못한 바이트는 읽은 바이트가 아니라 그 파일의 크기다", async () => {
    const keep = "{x\n{y\n";
    const full = `${keep}${[meta(ID(1)), record("r1", 10)].join("\n")}\n`;
    const path = await rollout(1, [], { bytes: () => Buffer.from(full) });
    const realLines = linesModule.readLines;
    let cut = false;
    const shrink = async (): Promise<void> => {
      cut = true;
      await truncate(path, Buffer.byteLength(keep));
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    };
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realLines(file, nowMs, sink, file === path && !cut ? { ...readOptions, afterOpen: shrink } : readOptions));
    let result: Awaited<ReturnType<typeof collectCodex>>;
    try {
      result = await collectCodex(options({ cacheDir: null }));
    } finally {
      spy.mockRestore();
    }
    expect(cut).toBe(true);
    // 읽지 못한 것과 쓰는 중은 따로 센다
    expect(result.read).toMatchObject({ unreadableFiles: [path], partialFiles: [], unreadableFileBytes: Buffer.byteLength(full), listedBytes: Buffer.byteLength(full), bytes: Buffer.byteLength(keep), inProgress: 1 });
  });

  it("덜 읽은 기록은 깨진 줄이 정확히 절반이어도, 하위 세션이어도, 너무 긴 줄이 있어도 일부만 읽은 파일이다(절반 넘게 깨진 것만 읽지 못한 파일이다)", async () => {
    const long = `{"x":"${"x".repeat(5000)}"}`;
    // 이름, 하위 세션인지, 연 직후 남길 앞부분의 줄, 그 뒤의 줄, 너무 긴 줄의 상한
    const cases: Array<[string, boolean, string[], string[], number | undefined]> = [
      ["깨진 줄이 정확히 절반", false, [meta(ID(1)), record("a", 10), "{bad", "{bad"], [record("b", 10)], undefined],
      ["하위 세션", true, [sub(ID(2), ID(1)), record("own", 10)], [record("later", 10)], undefined],
      ["너무 긴 줄", false, [meta(ID(1)), long, record("a", 10)], [record("b", 10)], 2000],
    ];
    for (const [name, isSub, front, back, maxLineBytes] of cases) {
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      const keep = `${front.join("\n")}\n`;
      const full = `${keep}${back.join("\n")}\n`;
      if (isSub) await rollout(1, [meta(ID(1)), record("a", 10)]);
      const path = await rollout(isSub ? 2 : 1, [], { bytes: () => Buffer.from(full) });
      const real = linesModule.readLines;
      let cut = false;
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) =>
        real(file, nowMs, sink, {
          ...readOptions,
          ...(maxLineBytes === undefined ? {} : { maxLineBytes }),
          ...(file === path && !cut
            ? {
                afterOpen: async () => {
                  cut = true;
                  await truncate(file, Buffer.byteLength(keep));
                  await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
                },
              }
            : {}),
        }),
      );
      let result: Awaited<ReturnType<typeof collectCodex>>;
      try {
        result = await collectCodex(options({ cacheDir: null }));
      } finally {
        spy.mockRestore();
      }
      const summary = bySession(result, ID(isSub ? 2 : 1));
      expect(cut, name).toBe(true);
      expect(summary.kind, name).toBe(isSub ? "sub" : "main");
      if (name === "깨진 줄이 정확히 절반") expect(summary.missing, name).toMatchObject({ lines: 4, brokenLines: 2 });
      if (maxLineBytes !== undefined) expect(summary.missing.tooLongLines, name).toBe(1);
      expect(result.read, name).toMatchObject({ partialFiles: [path], unreadableFiles: [], inProgress: 1 });
      expect(codexMcpObservation(result.summaries, codexUnreadableCount(result.read)).complete, name).toBe(false);
    }
  });

  it("너무 긴 줄이 든 압축 기록도 연 크기까지 읽기 전에 끝났으면 일부만 읽은 파일이다", async () => {
    const long = `{"x":"${"x".repeat(5000)}"}`;
    const first = compress(Buffer.from(`${[meta(ID(1)), long, record("a", 10)].join("\n")}\n`));
    const path = await rollout(1, [], { compressed: true, bytes: () => Buffer.concat([first, compress(Buffer.from(`${record("b", 10)}\n`))]) });
    const real = zstdModule.readZstdLines;
    let cut = false;
    const spy = vi.spyOn(zstdModule, "readZstdLines").mockImplementation((file, nowMs, sink, readOptions) =>
      real(file, nowMs, sink, {
        ...readOptions,
        maxLineBytes: 2000,
        afterOpen: async () => {
          cut = true;
          await truncate(file, first.length);
          await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
        },
      }),
    );
    let result: Awaited<ReturnType<typeof collectCodex>>;
    try {
      result = await collectCodex(options({ cacheDir: null }));
    } finally {
      spy.mockRestore();
    }
    expect(cut).toBe(true);
    expect(result.summaries[0]!.missing.tooLongLines).toBe(1);
    expect(result.read).toMatchObject({ partialFiles: [path], unreadableFiles: [], inProgress: 1 });
  });

  it("뺄 지문을 넣어 다시 읽을 때만 덜 읽었으면, 그 다시 읽은 것이 마지막 상태다(일부만 읽은 파일, 쓰는 중, 읽은 바이트, 그 기록이 부모인 하위 세션의 이어받기, 관측)", async () => {
    const parent = `${[meta(ID(1)), record("a", 10)].join("\n")}\n`;
    const keep = `${[sub(ID(2), ID(1)), record("a", 10)].join("\n")}\n`;
    const grandchild = `${[sub(ID(3), ID(2)), record("a", 10), record("b", 10), record("c", 10)].join("\n")}\n`;
    await rollout(1, [], { bytes: () => Buffer.from(parent) });
    const child = await rollout(2, [], { bytes: () => Buffer.from(`${keep}${record("b", 10)}\n`) });
    await rollout(3, [], { bytes: () => Buffer.from(grandchild) });
    // 첫 읽기는 끝까지 읽고, 부모 지문을 넣어 다시 읽을 때만 줄인다
    const shrink = shortenRead(child, Buffer.byteLength(keep), 2);
    let result: Awaited<ReturnType<typeof collectCodex>>;
    try {
      result = await collectCodex(options({ cacheDir: null }));
    } finally {
      shrink.done();
    }
    expect(shrink.count()).toBe(2);
    expect(result.read).toMatchObject({ partialFiles: [child], unreadableFiles: [], inProgress: 1, bytes: Buffer.byteLength(parent) + Buffer.byteLength(keep) + Buffer.byteLength(grandchild) });
    expect(result.unverifiedInheritance).toBe(1);
    expect(codexMcpObservation(result.summaries, codexUnreadableCount(result.read)).complete).toBe(false);
  });

  it("첫 읽기만 덜 읽고 다시 읽을 때 끝까지 읽었으면, 다시 읽은 것이 마지막 상태다(일부만 읽은 파일도 쓰는 중도 아니고 읽은 바이트는 끝까지 읽은 양이다)", async () => {
    const parent = `${[meta(ID(1)), record("a", 10)].join("\n")}\n`;
    const keep = `${[sub(ID(2), ID(1)), record("a", 10)].join("\n")}\n`;
    const full = Buffer.from(`${keep}${record("b", 10)}\n`);
    await rollout(1, [], { bytes: () => Buffer.from(parent) });
    const child = await rollout(2, [], { bytes: () => full });
    const shrink = shortenRead(child, Buffer.byteLength(keep), 1, full);
    let result: Awaited<ReturnType<typeof collectCodex>>;
    try {
      result = await collectCodex(options({ cacheDir: null }));
    } finally {
      shrink.done();
    }
    expect(shrink.count()).toBe(2);
    expect(result.read).toMatchObject({ partialFiles: [], unreadableFiles: [], inProgress: 0, bytes: Buffer.byteLength(parent) + full.length });
    expect(responses(bySession(result, ID(2)))).toBe(1);
  });

  it("다시 읽을 때만 덜 읽었다 되돌아온 기록은 캐시에 넣지 않아, 다음 모으기는 끝까지 읽는다(첫 읽기의 캐시 가능 표지를 쓰지 않는다)", async () => {
    await rollout(1, [meta(ID(1)), record("a", 10)]);
    const keep = `${[sub(ID(2), ID(1)), record("a", 10), record("b", 10)].join("\n")}\n`;
    const full = Buffer.from(`${keep}${record("c", 10)}\n`);
    const child = await rollout(2, [], { bytes: () => full });
    const cacheDir = join(root, "state", "cache");
    const shrink = shortenRead(child, Buffer.byteLength(keep), 2, full);
    let first: Awaited<ReturnType<typeof collectCodex>>;
    try {
      first = await collectCodex(options({ cacheDir }));
    } finally {
      shrink.done();
    }
    expect(shrink.count()).toBe(2);
    expect(first.read.partialFiles).toEqual([child]);
    expect(responses(bySession(first, ID(2)))).toBe(1);
    const again = await collectCodex(options({ cacheDir }));
    expect(again.read.partialFiles).toEqual([]);
    expect(responses(bySession(again, ID(2)))).toBe(2);
  });

  it("첫 읽기에서 덜 읽은 기록은 다시 읽을 때 끝까지 읽었어도, 그 첫 지문으로 뺄 것을 정한 하위 세션과 같은 세션의 이어받기를 확인하지 못한 것으로 센다(압축과 보통, 하위 세션의 부모와 같은 세션의 앞 기록)", async () => {
    // 이름, 압축인지, 덜 읽을 기록이 같은 세션의 되돌린 기록인지
    const cases: Array<[string, boolean, boolean]> = [
      ["보통 부모", false, false],
      ["압축 부모", true, false],
      ["같은 주 세션의 되돌린 기록", false, true],
    ];
    for (const [name, compressed, revertedRecord] of cases) {
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      await rollout(1, [meta(ID(1)), record("a", 10)]);
      const head = revertedRecord ? meta(ID(1)) : sub(ID(2), ID(1));
      const keep = Buffer.from(`${[head, record("a", 10)].join("\n")}\n`);
      const tail = Buffer.from(`${record("b", 10)}\n`);
      const front = compressed ? compress(keep) : keep;
      const full = Buffer.concat([front, compressed ? compress(tail) : tail]);
      const target = revertedRecord ? await reverted(1, 2, [], { compressed }) : await rollout(2, [], { compressed, bytes: () => full });
      if (revertedRecord) {
        await writeFile(target, full);
        await utimes(target, FILE_TIME / 1000, FILE_TIME / 1000);
      }
      // 덜 읽을 기록이 부모인 하위 세션(되돌린 기록이면 원래 세션의 하위 세션)
      await rollout(3, [sub(ID(3), revertedRecord ? ID(1) : ID(2)), record("a", 10), record("b", 10), record("c", 10)]);
      let count = 0;
      const restoreAfterFirst = async <T>(file: string, read: () => Promise<T>): Promise<T> => {
        const outcome = await read();
        await writeFile(file, full);
        await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
        return outcome;
      };
      const shrinkOnFirst = async (file: string): Promise<void> => {
        await truncate(file, front.length);
        await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
      };
      const realLines = linesModule.readLines;
      const realZstd = zstdModule.readZstdLines;
      const spy = compressed
        ? vi.spyOn(zstdModule, "readZstdLines").mockImplementation((file, nowMs, sink, readOptions) =>
            file !== target || ++count !== 1 ? realZstd(file, nowMs, sink, readOptions) : restoreAfterFirst(file, () => realZstd(file, nowMs, sink, { ...readOptions, afterOpen: () => shrinkOnFirst(file) })),
          )
        : vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) =>
            file !== target || ++count !== 1 ? realLines(file, nowMs, sink, readOptions) : restoreAfterFirst(file, () => realLines(file, nowMs, sink, { ...readOptions, afterOpen: () => shrinkOnFirst(file) })),
          );
      let result: Awaited<ReturnType<typeof collectCodex>>;
      try {
        result = await collectCodex(options({ cacheDir: null }));
      } finally {
        spy.mockRestore();
      }
      expect(count, name).toBe(2);
      expect(result.read.partialFiles, name).toEqual([]);
      if (revertedRecord) expect(result.mergedSessions, name).toBe(1);
      expect(result.unverifiedInheritance, name).toBe(revertedRecord ? 2 : 1);
    }
  });

  it("첫 읽기만 덜 읽고 다시 읽어 회복한 기록은 다시 읽은 지문으로 겹침 값을 캐시에 넣어, 부모가 그대로면 다음 모으기가 캐시를 쓰고 부모의 겹침이 바뀌면 다시 읽는다", async () => {
    const parent = await rollout(1, [meta(ID(1)), record("a", 10), record("b", 20)]);
    const keep = `${[sub(ID(2), ID(1)), record("a", 10)].join("\n")}\n`;
    const full = Buffer.from(`${keep}${[record("b", 20), record("c", 30)].join("\n")}\n`);
    const child = await rollout(2, [], { bytes: () => full });
    const cacheDir = join(root, "state", "cache");
    const shrink = shortenRead(child, Buffer.byteLength(keep), 1, full);
    let first: Awaited<ReturnType<typeof collectCodex>>;
    try {
      first = await collectCodex(options({ cacheDir }));
    } finally {
      shrink.done();
    }
    expect(shrink.count()).toBe(2);
    expect(responses(bySession(first, ID(2)))).toBe(1);
    const same = await collectCodex(options({ cacheDir }));
    expect(same.read.fromCache).toBe(2);
    expect(responses(bySession(same, ID(2)))).toBe(1);
    await writeFile(parent, `${[meta(ID(1)), record("a", 10)].join("\n")}\n`);
    await utimes(parent, FILE_TIME / 1000, FILE_TIME / 1000);
    const cached = await collectCodex(options({ cacheDir }));
    const plain = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(plain, ID(2)))).toBe(2);
    expect(responses(bySession(cached, ID(2)))).toBe(2);
    expect(cached.summaries).toEqual(plain.summaries);
  });

  it("다시 읽은 기록은 다시 읽은 요약을 쓴다(첫 읽기만 덜 읽고 회복했으면 끝까지 읽은 숫자를, 두 번 다 덜 읽었으면 두 번째 숫자를)", async () => {
    const input = (result: Awaited<ReturnType<typeof collectCodex>>) => Object.values(bySession(result, ID(2)).days).reduce((sum, day) => sum + day.tokens.input, 0);
    // 이름, 첫 읽기에 남길 앞부분, 다시 읽기에 남길 앞부분(없으면 끝까지), 자기 응답 수, 입력 토큰
    const front = [sub(ID(2), ID(1)), record("a", 100)];
    const cases: Array<[string, string[], string[] | null, number, number]> = [
      ["회복", front, null, 2, 50],
      ["두 번 다 덜 읽음", [...front, record("b", 20)], front, 0, 0],
    ];
    for (const [name, firstKeep, secondKeep, count, tokens] of cases) {
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      await rollout(1, [meta(ID(1)), record("a", 100)]);
      const full = Buffer.from(`${[...front, record("b", 20), record("c", 30)].join("\n")}\n`);
      const child = await rollout(2, [], { bytes: () => full });
      const real = linesModule.readLines;
      let reads = 0;
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation(async (file, nowMs, sink, readOptions) => {
        if (file !== child) return real(file, nowMs, sink, readOptions);
        reads++;
        const keep = reads === 1 ? firstKeep : secondKeep;
        if (keep === null) return real(file, nowMs, sink, readOptions);
        const outcome = await real(file, nowMs, sink, {
          ...readOptions,
          afterOpen: async () => {
            await truncate(file, Buffer.byteLength(`${keep.join("\n")}\n`));
            await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
          },
        });
        await writeFile(file, full);
        await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
        return outcome;
      });
      let result: Awaited<ReturnType<typeof collectCodex>>;
      try {
        result = await collectCodex(options({ cacheDir: null }));
      } finally {
        spy.mockRestore();
      }
      expect(reads, name).toBe(2);
      expect(responses(bySession(result, ID(2))), name).toBe(count);
      expect(input(result), name).toBe(tokens);
      expect(result.read.partialFiles, name).toEqual(secondKeep === null ? [] : [child]);
    }
  });

  it("첫 읽기만 덜 읽고 다시 읽어 회복한 기록은 다시 읽은 지문을 캐시에 넣어, 다음 모으기에서 그 기록이 부모인 하위 세션을 그 지문으로 다시 읽는다", async () => {
    await rollout(1, [meta(ID(1)), record("a", 100)]);
    const keep = `${[sub(ID(2), ID(1)), record("a", 100)].join("\n")}\n`;
    const full = Buffer.from(`${keep}${[record("b", 20), record("c", 30)].join("\n")}\n`);
    const child = await rollout(2, [], { bytes: () => full });
    await rollout(3, [sub(ID(3), ID(2)), record("a", 100), record("b", 20), record("c", 30), record("d", 40)]);
    const cacheDir = join(root, "state", "cache");
    const shrink = shortenRead(child, Buffer.byteLength(keep), 1, full);
    try {
      await collectCodex(options({ cacheDir }));
    } finally {
      shrink.done();
    }
    const cached = await collectCodex(options({ cacheDir }));
    const plain = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(cached, ID(3)))).toBe(1);
    expect(cached.summaries).toEqual(plain.summaries);
    expect(cached.unverifiedInheritance).toBe(0);
  });

  it("첫 읽기에서 덜 읽은 것은 쓰는 중인지, 깨진 줄이나 너무 긴 줄이 있는지와 상관없이 그 첫 지문으로 뺄 것을 정한 하위 세션의 이어받기 확인을 막는다(원래 잘렸다 고쳐진 압축 기록, 깨진 줄, 너무 긴 줄)", async () => {
    const long = `{"x":"${"x".repeat(5000)}"}`;
    for (const kind of ["원래 잘린 압축", "깨진 줄", "너무 긴 줄"] as const) {
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      await rollout(1, [meta(ID(1)), record("a", 100)]);
      const extra = kind === "깨진 줄" ? ["{bad"] : kind === "너무 긴 줄" ? [long] : [];
      const keep = Buffer.from(`${[sub(ID(2), ID(1)), record("a", 100), ...extra].join("\n")}\n`);
      const tail = Buffer.from(`${record("b", 20)}\n`);
      let reads = 0;
      let spy: { mockRestore(): void };
      if (kind === "원래 잘린 압축") {
        // 첫 읽기 때는 둘째 프레임이 매직 앞 두 바이트만 있어 원래 잘린 기록이고(쓰는 중도 덜 읽음도 아니다), 그 뒤 온전한 기록으로 고쳐진다
        const head = compress(keep);
        const whole = Buffer.concat([head, compress(tail)]);
        const child = await rollout(2, [], { compressed: true, bytes: () => Buffer.concat([head, Buffer.from([0x28, 0xb5])]) });
        const real = zstdModule.readZstdLines;
        spy = vi.spyOn(zstdModule, "readZstdLines").mockImplementation(async (file, nowMs, sink, readOptions) => {
          const outcome = await real(file, nowMs, sink, readOptions);
          if (file === child && ++reads === 1) {
            expect(outcome.inProgress, kind).toBe(false);
            expect(outcome.endedEarly, kind).toBe(false);
            await writeFile(file, whole);
            await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
          }
          return outcome;
        });
      } else {
        const full = Buffer.concat([keep, tail]);
        const child = await rollout(2, [], { bytes: () => full });
        const real = linesModule.readLines;
        spy = vi.spyOn(linesModule, "readLines").mockImplementation(async (file, nowMs, sink, readOptions) => {
          if (file !== child) return real(file, nowMs, sink, readOptions);
          const firstRead = ++reads === 1;
          const outcome = await real(file, nowMs, sink, {
            ...readOptions,
            ...(kind === "너무 긴 줄" ? { maxLineBytes: 2000 } : {}),
            ...(firstRead
              ? {
                  afterOpen: async () => {
                    await truncate(file, keep.length);
                    await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
                  },
                }
              : {}),
          });
          if (firstRead) {
            await writeFile(file, full);
            await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
          }
          return outcome;
        });
      }
      await rollout(3, [sub(ID(3), ID(2)), record("a", 100), record("b", 20), record("c", 30)]);
      let result: Awaited<ReturnType<typeof collectCodex>>;
      try {
        result = await collectCodex(options({ cacheDir: null }));
      } finally {
        spy.mockRestore();
      }
      expect(reads, kind).toBe(2);
      expect(result.read.partialFiles, kind).toEqual([]);
      expect(result.unverifiedInheritance, kind).toBe(1);
    }
  });

  it("뺄 지문을 넣어 다시 읽는 사이에 되돌려 생긴 기록이 줄어 첫 줄을 읽지 못해 세션 ID가 달라져도, 모으기는 멈추지 않고 그 기록을 다시 읽다가 읽지 못한 것으로 센다(다시 읽기 직전, 연 직후 0바이트, 첫 줄 가운데)", async () => {
    // 이름, 연 직후 줄일지(아니면 다시 읽기 직전에 줄인다), 남길 바이트
    const cases: Array<[string, boolean, number]> = [
      ["다시 읽기 직전에 0바이트", false, 0],
      ["연 직후 0바이트", true, 0],
      ["다시 읽기 직전에 첫 줄 가운데", false, 20],
    ];
    for (const [name, afterOpen, keep] of cases) {
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      await rollout(1, [meta(ID(1)), record("a", 10)]);
      // 같은 세션의 되돌려 생긴 기록이 원래 기록의 응답 a를 다시 담아, 뺄 지문을 넣어 다시 읽힌다
      const again = await reverted(1, 2, [meta(ID(1), HISTORY), record("a", 10), record("b", 10)]);
      const real = linesModule.readLines;
      let reads = 0;
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation(async (file, nowMs, sink, readOptions) => {
        if (file !== again || ++reads !== 2) return real(file, nowMs, sink, readOptions);
        const shrink = async (): Promise<void> => {
          await truncate(file, keep);
          await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
        };
        if (!afterOpen) await shrink();
        return real(file, nowMs, sink, afterOpen ? { ...readOptions, afterOpen: shrink } : readOptions);
      });
      let result: Awaited<ReturnType<typeof collectCodex>>;
      try {
        result = await collectCodex(options({ cacheDir: null }));
      } finally {
        spy.mockRestore();
      }
      expect(reads, name).toBe(2);
      expect(result.summaries.map((summary) => summary.sessionId), name).toEqual([ID(1)]);
      expect(result.read.unreadableFiles, name).toEqual([again]);
      expect(result.unverifiedInheritance, name).toBe(1);
    }
  });

  it("절반 넘게 깨진 기록은 캐시에서 꺼내도 읽지 못한 파일이고 그 바이트는 파일 크기다", async () => {
    const body = `${[meta(ID(1)), record("a", 10), "{bad", "{bad", "{bad"].join("\n")}\n`;
    const path = await rollout(1, [], { bytes: () => Buffer.from(body) });
    const cacheDir = join(root, "state", "cache");
    const first = await collectCodex(options({ cacheDir }));
    expect(first.read).toMatchObject({ fromCache: 0, unreadableFiles: [path], unreadableFileBytes: Buffer.byteLength(body) });
    const next = await collectCodex(options({ cacheDir }));
    expect(next.read).toMatchObject({ fromCache: 1, unreadableFiles: [path], unreadableFileBytes: Buffer.byteLength(body) });
  });

  it("정본을 읽지 못해 읽은 다음 사본이 여럿이면, 일부만 읽었거나 깨진 파일은 실제로 읽은 사본의 경로 차례로 내고, 목록 바이트는 그 사본들의 크기를, 읽은 바이트는 실제로 읽은 양을 더한다", async () => {
    // 정본은 날짜 01·02 폴더에, 실제로 읽을 다음 사본은 20·03 폴더에 둔다(정본 차례와 사본 경로 차례가 다르다)
    const at = async (day: string, n: number, text: string): Promise<string> => {
      const folder = join(root, ".codex", "sessions", "2026", "11", day);
      await mkdir(folder, { recursive: true });
      const path = join(folder, `rollout-2026-11-11T12-00-00-${ID(n)}.jsonl`);
      await writeFile(path, text);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      return path;
    };
    const front = (n: number): string => `${[meta(ID(n)), record(`r${n}`, 10)].join("\n")}\n`;
    const body = (n: number): string => `${front(n)}${record(`q${n}`, 20)}\n`;
    const junk = "{x\n{y\n{z\n";
    for (const broken of [false, true]) {
      const label = broken ? "깨짐" : "덜 읽음";
      rmSync(join(root, ".codex"), { recursive: true, force: true });
      const canonical = new Set([await at("01", 1, body(1)), await at("02", 2, body(2))]);
      const first = await at("20", 1, broken ? junk : body(1));
      const second = await at("03", 2, broken ? junk : body(2));
      const read = linesModule.readLines;
      const cut = new Set<string>();
      // 정본만 읽기를 거절해 다음 사본을 읽게 하고, 덜 읽는 경우에는 다음 사본을 연 직후 앞부분까지 줄인다
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation(async (path, nowMs, sink, readOptions) => {
        if (canonical.has(path)) throw Object.assign(new Error("정본 읽기 거절"), { code: "EACCES" });
        if (broken || cut.has(path)) return read(path, nowMs, sink, readOptions);
        const keep = Buffer.byteLength(front(path === first ? 1 : 2));
        return read(path, nowMs, sink, {
          ...readOptions,
          afterOpen: async () => {
            cut.add(path);
            await truncate(path, keep);
            await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
          },
        });
      });
      let result: Awaited<ReturnType<typeof collectCodex>>;
      try {
        result = await collectCodex(options({ cacheDir: null }));
      } finally {
        spy.mockRestore();
      }
      if (broken) {
        const size = 2 * Buffer.byteLength(junk);
        expect(result.read, label).toMatchObject({ unreadableFiles: [second, first], partialFiles: [], listedBytes: size, unreadableFileBytes: size });
      } else {
        expect(cut.size, label).toBe(2);
        expect(result.read, label).toMatchObject({
          partialFiles: [second, first],
          unreadableFiles: [],
          listedBytes: Buffer.byteLength(body(1)) + Buffer.byteLength(body(2)),
          bytes: Buffer.byteLength(front(1)) + Buffer.byteLength(front(2)),
        });
      }
    }
  });

  it("정본을 읽지 못해 읽은 다음 사본을 덜 읽었으면, 일부만 읽은 파일은 정본이 아니라 그 사본의 경로다", async () => {
    const front = `${[meta(ID(1)), record("r1", 10)].join("\n")}\n`;
    const body = `${front}${record("r2", 20)}\n`;
    const fallback = await rollout(1, [], { bytes: () => Buffer.from(body) });
    const canonicalDir = join(root, ".codex", "sessions", "2026", "11", "10");
    await mkdir(canonicalDir, { recursive: true });
    const canonical = join(canonicalDir, fallback.split(/[\\/]/).at(-1)!);
    await writeFile(canonical, body);
    await utimes(canonical, FILE_TIME / 1000, FILE_TIME / 1000);
    const read = linesModule.readLines;
    let cut = false;
    const shrink = async (): Promise<void> => {
      cut = true;
      await truncate(fallback, Buffer.byteLength(front));
      await utimes(fallback, FILE_TIME / 1000, FILE_TIME / 1000);
    };
    // 정본만 읽기를 거절해 다음 사본을 읽게 하고, 다음 사본은 연 직후 줄인다
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation(async (path, nowMs, sink, readOptions) => {
      if (path === canonical) throw Object.assign(new Error("정본 읽기 거절"), { code: "EACCES" });
      return read(path, nowMs, sink, path === fallback && !cut ? { ...readOptions, afterOpen: shrink } : readOptions);
    });
    let result: Awaited<ReturnType<typeof collectCodex>>;
    try {
      result = await collectCodex(options({ cacheDir: null }));
    } finally {
      spy.mockRestore();
    }
    expect(cut).toBe(true);
    expect(result.read).toMatchObject({ partialFiles: [fallback], unreadableFiles: [] });
    expect(responses(bySession(result, ID(1)))).toBe(1);
  });

  it("절반 넘게 깨진 압축 기록의 읽지 못한 바이트는 파일의 크기다(앞의 건너뛸 수 있는 프레임도 든다)", async () => {
    const skippable = Buffer.alloc(24);
    skippable.writeUInt32LE(0x184d2a50, 0);
    skippable.writeUInt32LE(16, 4);
    const path = await rollout(1, [meta(ID(1)), "{x", "{y"], { compressed: true, bytes: (content) => Buffer.concat([skippable, content]) });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.read.unreadableFiles).toEqual([path]);
    expect(result.read.unreadableFileBytes).toBe((await readFile(path)).length);
  });

  it("자기 원래 기록이 압축본만 있어도 원래 기록을 찾은 것이다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.unverifiedInheritance).toBe(0);
  });

  it("부모의 원래 기록을 압축본으로 읽어도 원래 기록을 찾은 것이다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)], { compressed: true });
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10), record("r2", 20)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 0 });
  });

  it("구간 밖 같은 세션의 원래 기록이 압축본만 있어도 풀어 지문을 얻고 뒤 기록에서 뺀다", async () => {
    await rollout(1, [meta(ID(1)), record("shared", 10)], { compressed: true, mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), HISTORY), record("shared", 10), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.unverifiedInheritance).toBe(0);
  });

  it("구간 밖 같은 세션의 다른 기록이 그 Node.js가 풀 수 없는 압축이면 이어받은 것을 확인하지 못한 세션으로 센다(구간 밖이라 건너뛴 압축 파일로는 세지 않는다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), HISTORY), record("r2", 20)], { compressed: true, mtimeMs: OLD_TIME, nameTime: "13-00-00" });
    await reverted(1, 4, [meta(ID(1), HISTORY), record("r4", 40)], { nameTime: "14-00-00" });
    const result = await collectCodex(options({ cacheDir: null, zstd: false }));
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result.unverifiedInheritance).toBe(1);
    expect(result.read).toMatchObject({ skippedFiles: [], olderThanWindow: 1 });
  });

  it("압축 기록도 늦은 시각이 평가 시각에서 2초 안쪽이면 쓰는 중이다(줄바꿈 없는 끝을 끝 조각으로 세고 캐시에 넣지 않는다)", async () => {
    await rollout(1, [], { compressed: true, bytes: () => compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`)) });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1000 };
    };
    const first = await collectCodex(options({ statFile: fresh }));
    expect(first.summaries[0]!.missing).toMatchObject({ tailFragments: 1, brokenLines: 0 });
    expect(first.read.inProgress).toBe(1);
    // 1분 뒤에는 쓰는 중이 아니라 캐시를 꺼내 본다. 넣었다면 꺼낸다
    expect((await collectCodex(options({ statFile: fresh, clock: { nowMs: NOW + 60_000, timeZone: "Asia/Seoul" } }))).read.fromCache).toBe(0);
  });

  it("캐시에 넣은 압축 기록도 변경 시각만 1999밀리초 전으로 바뀌면 캐시를 쓰지 않고 다시 읽는다(캐시 없는 읽기와 같다)", async () => {
    await rollout(1, [], { compressed: true, bytes: () => compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`)) });
    expect((await collectCodex(options())).read).toMatchObject({ fromCache: 0, inProgress: 0 });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1999 };
    };
    const cached = await collectCodex(options({ statFile: fresh }));
    const uncached = await collectCodex(options({ statFile: fresh, cacheDir: null }));
    expect(cached.summaries).toEqual(uncached.summaries);
    expect(cached.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
    expect(cached.read).toMatchObject({ inProgress: 1, fromCache: 0 });
  });

  it("정본을 읽지 못해 다음 사본의 캐시를 볼 때는 그 사본의 변경 시각으로 쓰는 중을 가른다", async () => {
    const plain = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    const packed = await rollout(1, [], { compressed: true, bytes: () => compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`)) });
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    await rm(plain);
    expect((await collectCodexFromList(home, list, options())).read).toMatchObject({ fromCache: 0, inProgress: 0 });
    const newer = { ...list, files: list.files.map((file) => (file.path === packed ? { ...file, changedMs: NOW - 1000 } : file)) };
    const cached = await collectCodexFromList(home, newer, options());
    const uncached = await collectCodexFromList(home, newer, options({ cacheDir: null }));
    expect(cached.summaries).toEqual(uncached.summaries);
    expect(cached.read).toMatchObject({ inProgress: 1, fromCache: 0 });
  });

  it("목록을 얻은 뒤 다시 쓰인 압축 기록은 캐시를 꺼내지 않고 쓰는 중으로 센다(캐시 없는 읽기와 같다)", async () => {
    const packed = await rollout(1, [meta(ID(1)), record("r1", 10)], { compressed: true });
    expect((await collectCodex(options())).read.fromCache).toBe(0);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    await writeFile(packed, compress(Buffer.from(`${[meta(ID(1)), record("r1", 10), record("r2", 20)].join("\n")}\n`)));
    await utimes(packed, FILE_TIME / 1000, FILE_TIME / 1000);
    const cached = await collectCodexFromList(home, list, options());
    const direct = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(responses(bySession(direct, ID(1)))).toBe(2);
    expect(cached.summaries).toEqual(direct.summaries);
    // 목록과 다르게 열었어도 연 크기까지 다 읽었으니 일부만 읽은 파일이 아니다
    expect(cached.read).toMatchObject({ fromCache: 0, inProgress: 1, partialFiles: [], unreadableFiles: [] });
    expect(direct.read).toMatchObject({ inProgress: 1, partialFiles: [], unreadableFiles: [] });
  });

  it("뺄 지문을 넣어 다시 읽은 압축 부모 기록이 그새 일부만 읽히게 됐으면 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10)]);
    const lines = [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10), record("p1", 20)];
    const parent = await rollout(2, lines, { compressed: true });
    await rollout(3, [sub(ID(3), ID(2)), record("p1", 20), record("c1", 30)]);
    const finish = CodexSessionParser.prototype.finish;
    let done = false;
    // 부모 기록을 처음 다 읽은 뒤 끝에 잘린 다음 프레임의 머리를 붙여, 다시 읽은 것만 일부만 읽히게 한다
    const spy = vi.spyOn(CodexSessionParser.prototype, "finish").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["finish"]>) {
      const summary = finish.apply(this, args);
      if (!done && summary.sessionId === ID(2)) {
        done = true;
        writeFileSync(parent, Buffer.concat([compress(Buffer.from(`${lines.join("\n")}\n`)), Buffer.from([0x28, 0xb5])]));
      }
      return summary;
    });
    try {
      const result = await collectCodex(options({ cacheDir: null }));
      expect(result.read.partialFiles).toEqual([parent]);
      expect(responses(bySession(result, ID(3)))).toBe(1);
      expect(result.unverifiedInheritance).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("끝 프레임이 잘린 압축 기록은 일부만 읽은 파일로 세고 풀린 줄의 숫자를 쓰며 캐시에 넣지 않는다", async () => {
    const first = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`));
    const second = compress(Buffer.from(`${record("r2", 20)}\n`));
    const path = await rollout(1, [], { compressed: true, bytes: () => Buffer.concat([first, second.subarray(0, second.length - 3)]) });
    const result = await collectCodex(options());
    expect(result.read.partialFiles).toEqual([path]);
    expect(result.read.unreadableFiles).toEqual([]);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect((await collectCodex(options())).read.fromCache).toBe(0);
  });

  it("빈 내용을 담은 완결된 압축 프레임은 빈 기록으로 읽는다(빈 .jsonl과 같다). 읽지 못한 파일이나 일부만 읽은 파일이 아니다", async () => {
    await rollout(1, [], { compressed: true, bytes: () => compress(Buffer.alloc(0)) });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.read).toMatchObject({ files: 1, unreadableFiles: [], partialFiles: [] });
    expect(result.summaries[0]).toMatchObject({ sessionId: ID(1), missing: { lines: 0 }, codex: { idFallback: "no-lines" } });
    expect(result.idFallbacks).toEqual({ "no-lines": 1 });
  });

  it("구조가 완결된 압축 기록이라도 풀다가 체크섬이 틀리면 일부만 읽은 파일이다", async () => {
    const one = compress(Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n`));
    const two = zlib.zstdCompressSync(Buffer.from(`${record("r2", 20)}\n`), { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } });
    two.writeUInt8(two.readUInt8(two.length - 1) ^ 1, two.length - 1);
    const path = await rollout(1, [], { compressed: true, bytes: () => Buffer.concat([one, two]) });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.read.partialFiles).toEqual([path]);
    expect(codexUnreadableCount(result.read)).toBe(1);
  });
});

describe("이어받은 앞부분", () => {
  const MOM = () => [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)];
  const CHILD = () => [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10), item({ type: "UserMessage", id: "u2" }), record("r2", 20)];

  it("하위 세션은 부모 기록에도 있는 항목과 응답을 다시 세지 않는다", async () => {
    await rollout(1, MOM());
    await rollout(2, CHILD());
    const result = await collectCodex(options());
    const child = bySession(result, ID(2));
    expect(child).toMatchObject({ kind: "sub", parentSessionId: ID(1) });
    expect(Object.values(child.days)[0]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 20 } });
    expect(child.codex?.inheritedSkipped).toEqual({ items: 1, totals: 0, responses: 1 });
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 0 });
  });

  it("부모 기록이 없으면 다 세고 부모 기록이 없는 하위 세션으로 센다", async () => {
    await rollout(2, CHILD());
    const result = await collectCodex(options());
    expect(responses(bySession(result, ID(2)))).toBe(2);
    expect(result).toMatchObject({ parentRecordMissing: 1, unverifiedInheritance: 1 });
  });

  it("부모를 모르는 하위 세션(부모 값이 없거나, 글자가 아니거나, 자기 자신)은 다 세고 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(2, [meta(ID(2), { thread_source: "subagent" }), record("r1", 10)]);
    await rollout(3, [meta(ID(3), { thread_source: "subagent", parent_thread_id: 7 }), record("r2", 20)]);
    await rollout(4, [sub(ID(4), ID(4)), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(bySession(result, ID(2))).toMatchObject({ kind: "sub", parentSessionId: null });
    expect(bySession(result, ID(3))).toMatchObject({ kind: "sub", parentSessionId: null });
    expect(bySession(result, ID(4))).toMatchObject({ kind: "sub", parentSessionId: ID(4) });
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 3 });
  });

  it("부모 기록을 일부 읽지 못했으면(절반 넘게 깨진 부모) 그 지문으로 빼되 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [...MOM(), "{x", "{y", "{z", "{w"]);
    await rollout(2, CHILD());
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1 });
  });

  it("복사된 앞부분 안에서 부모 지문에 없는 누적값을 센 하위 세션은 기준을 찾지 못한 것으로 센다", async () => {
    const count = (n: number) => line("event_msg", { type: "token_count", info: { total_token_usage: usage(n) } });
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), count(100)]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), count(150), item({ type: "CommandExecution", id: "x1", exit_code: 0 }), count(300)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(bySession(result, ID(2)).codex?.baselineMissing).toBe(true);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1 });
  });

  it("같은 세션의 뒤 기록이 앞 기록의 앞부분을 다시 담았으면 그 부분을 다시 세지 않는다. 목록의 차례와 상관없다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u1" }), record("r1", 10), item({ type: "UserMessage", id: "u3" }), record("r3", 30)]);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    for (const files of [list.files, [...list.files].reverse()]) {
      const result = await collectCodexFromList(home, { ...list, files }, options({ cacheDir: null }));
      expect(result.summaries).toHaveLength(1);
      expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 2, humanRequests: 2, tokens: { input: 40 } });
      expect(result.summaries[0]!.codex?.inheritedSkipped).toMatchObject({ items: 1, responses: 1 });
      expect(result.unverifiedInheritance).toBe(0);
    }
  });

  it("같은 세션의 다른 기록을 읽지 못했으면 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r3", 30)]);
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [missing] } });
  });

  it("같은 세션의 앞 기록이 수집 구간보다 오래됐어도 지문을 얻으려고 읽어 뒤 기록에서 빼고, 그 기록의 수는 요약에 넣지 않는다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)], { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u1" }), record("r1", 10), item({ type: "UserMessage", id: "u3" }), record("r3", 30)]);
    const result = await collectCodex(options());
    expect(result.summaries).toHaveLength(1);
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 30 } });
    expect(result.summaries[0]!.codex?.inheritedSkipped).toMatchObject({ items: 1, responses: 1 });
    expect(result).toMatchObject({ unverifiedInheritance: 0, read: { olderThanWindow: 1, files: 1 } });
  });

  it("구간 밖이라 지문을 얻으려고 읽은 같은 세션의 원래 기록은 정체·지침·버전·가장 이른 날짜와 기록 파일 식별자에 쓰고 수에는 넣지 않는다", async () => {
    const old = (text: string) => JSON.stringify({ ...JSON.parse(text), timestamp: "2026-01-01T00:00:00Z" });
    const world = (text: string) => line("world_state", { state: { agents_md: { text } } });
    await rollout(1, [meta(ID(1), { cwd: "C:/original", cli_version: "0.166.0" }), world("abc"), item({ type: "UserMessage", id: "u1" }), record("r1", 10)].map(old), { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), { ...HISTORY, cwd: "C:/changed", cli_version: "0.165.0" }), world("abcdefg"), item({ type: "UserMessage", id: "u1" }), record("r1", 10), item({ type: "UserMessage", id: "u3" }), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.summaries).toHaveLength(1);
    const summary = result.summaries[0]!;
    expect(summary).toMatchObject({ sessionId: ID(1), cwd: "C:/original", version: "0.166.0", firstDate: "2026-01-01", instructionChars: { ascii: 3, other: 0 }, codex: { recordId: ID(1) } });
    expect(Object.keys(summary.days)).toEqual(["2026-11-11"]);
    expect(summary.days["2026-11-11"]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 30 } });
    expect(result).toMatchObject({ mergedSessions: 1, unverifiedInheritance: 0 });
  });

  it("원래 기록이 있어도 같은 세션의 다른 기록을 읽지 못했으면 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r3", 30)]);
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T13-30-00-${ID(1)}_${ID(4)}.jsonl`);
    const list = { ...listed, files: [...listed.files, { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(4), baseId: ID(1), compressed: false }] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [missing] } });
  });

  it("구간 밖의 같은 세션 기록이 여럿이면 모두 지문을 얻으려고 읽어 뒤 기록에서 뺀다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), HISTORY), record("r2", 20)], { mtimeMs: OLD_TIME, nameTime: "13-00-00" });
    await reverted(1, 4, [meta(ID(1), HISTORY), record("r1", 10), record("r2", 20), record("r4", 40)], { nameTime: "14-00-00" });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result).toMatchObject({ unverifiedInheritance: 0, read: { olderThanWindow: 2, files: 1 } });
  });

  it("하위 세션도 자기 원래 기록을 찾지 못하면(되돌려 생긴 기록만 있음) 부모를 찾았어도 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, MOM());
    await reverted(2, 9, [sub(ID(2), ID(1)), record("r2", 20)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(bySession(result, ID(2))).toMatchObject({ kind: "sub", parentSessionId: ID(1) });
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1 });
  });

  it("같은 세션의 구간 밖 기록을 읽지 못했으면 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r3", 30)]);
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T12-00-00-${ID(1)}.jsonl`);
    const list = { ...listed, files: [{ path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: OLD_TIME, changedMs: OLD_TIME, recordId: ID(1), baseId: null, compressed: false }, ...listed.files] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [], olderThanWindow: 1, files: 1 } });
  });

  it("원래 기록이 있어도 같은 세션의 구간 밖 다른 기록을 읽지 못했으면 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 4, [meta(ID(1), HISTORY), record("r4", 40)], { nameTime: "14-00-00" });
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T13-00-00-${ID(1)}_${ID(3)}.jsonl`);
    const list = { ...listed, files: [...listed.files, { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: OLD_TIME, changedMs: OLD_TIME, recordId: ID(3), baseId: ID(1), compressed: false }] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [], olderThanWindow: 1, files: 2 } });
  });

  it("같은 세션의 구간 밖 기록이 절반 넘게 깨졌으면 그 지문으로 빼되 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10), "{x", "{y", "{z", "{w"], { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u1" }), record("r1", 10), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { unreadableFiles: [], olderThanWindow: 1 } });
  });

  it("같은 세션의 구간 밖 기록을 읽는 동안 줄어 덜 읽었으면 이어받은 것을 확인하지 못한 세션으로 센다(구간 밖이라 일부만 읽은 파일로는 세지 않는다)", async () => {
    const front = `${[meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)].join("\n")}\n`;
    const full = `${front}${[item({ type: "UserMessage", id: "u2" }), record("r2", 20)].join("\n")}\n`;
    const original = await rollout(1, [], { mtimeMs: OLD_TIME, bytes: () => Buffer.from(full) });
    await reverted(1, 3, [meta(ID(1), HISTORY), item({ type: "UserMessage", id: "u1" }), record("r1", 10), record("r3", 30)]);
    const direct = await collectCodex(options({ cacheDir: null }));
    expect(direct).toMatchObject({ unverifiedInheritance: 0, read: { olderThanWindow: 1 } });
    const realLines = linesModule.readLines;
    let cut = false;
    const shrink = async (): Promise<void> => {
      cut = true;
      await truncate(original, Buffer.byteLength(front));
      await utimes(original, OLD_TIME / 1000, OLD_TIME / 1000);
    };
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realLines(file, nowMs, sink, file === original && !cut ? { ...readOptions, afterOpen: shrink } : readOptions));
    let result: Awaited<ReturnType<typeof collectCodex>>;
    try {
      result = await collectCodex(options({ cacheDir: null }));
    } finally {
      spy.mockRestore();
    }
    expect(cut).toBe(true);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result).toMatchObject({ unverifiedInheritance: 1, read: { olderThanWindow: 1, partialFiles: [], unreadableFiles: [] } });
  });

  it("같은 세션으로 이름이 붙은 구간 밖 기록은 읽어서 세션 ID가 맞을 때만 뺄 지문에 넣는다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)]);
    await reverted(1, 2, [meta(ID(7)), item({ type: "UserMessage", id: "u5" }), record("r5", 50)], { mtimeMs: OLD_TIME });
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u5" }), record("r5", 50)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 2, humanRequests: 2, tokens: { input: 60 } });
    expect(result).toMatchObject({ unverifiedInheritance: 0, mergedSessions: 1, read: { olderThanWindow: 1 } });
  });

  it("대화를 되돌려 생긴 기록만 있고 원래 기록을 찾지 못한 세션은 다 세고 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r3", 30)]);
    const result = await collectCodex(options({ cacheDir: null }));
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1)]);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result.unverifiedInheritance).toBe(1);
  });

  it("부모 세션의 원래 기록을 찾지 못했으면(되돌려 생긴 기록만 있음) 그 지문으로 빼되 하위 세션도 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await reverted(1, 9, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), ...MOM().slice(1)]);
    await rollout(2, CHILD());
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 2 });
  });

  it("뺄 지문을 넣어 다시 읽다가 읽지 못한 부모 기록은 읽지 못한 파일로 세고, 그 부모의 지문으로 뺀 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10)]);
    const parent = await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10), record("p1", 20)]);
    await rollout(3, [sub(ID(3), ID(2)), record("p1", 20), record("c1", 30)]);
    const finish = CodexSessionParser.prototype.finish;
    let done = false;
    // 부모 기록을 처음 다 읽은 뒤에 지워서, 뺄 지문을 넣어 다시 읽을 때만 실패하게 한다
    const spy = vi.spyOn(CodexSessionParser.prototype, "finish").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["finish"]>) {
      const summary = finish.apply(this, args);
      if (!done && summary.sessionId === ID(2)) {
        done = true;
        rmSync(parent);
      }
      return summary;
    });
    try {
      const result = await collectCodex(options({ cacheDir: null }));
      expect(result.read.unreadableFiles).toEqual([parent]);
      expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(1), ID(3)]);
      expect(responses(bySession(result, ID(3)))).toBe(1);
      expect(result.unverifiedInheritance).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("뺄 지문을 넣어 다시 읽은 부모 기록이 그새 절반 넘게 깨졌으면 그 부모의 지문으로 뺀 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10)]);
    const parent = await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "g1" }), record("g1", 10), record("p1", 20)]);
    await rollout(3, [sub(ID(3), ID(2)), record("p1", 20), record("c1", 30)]);
    const finish = CodexSessionParser.prototype.finish;
    let done = false;
    // 부모 기록을 처음 다 읽은 뒤에 절반 넘게 깨진 내용으로 바꿔, 다시 읽은 것만 손상되게 한다
    const spy = vi.spyOn(CodexSessionParser.prototype, "finish").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["finish"]>) {
      const summary = finish.apply(this, args);
      if (!done && summary.sessionId === ID(2)) {
        done = true;
        writeFileSync(parent, `${[sub(ID(2), ID(1)), "{x", "{y", "{z"].join("\n")}\n`);
      }
      return summary;
    });
    try {
      const result = await collectCodex(options({ cacheDir: null }));
      expect(result.read.unreadableFiles).toEqual([parent]);
      expect(responses(bySession(result, ID(3)))).toBe(1);
      expect(result.unverifiedInheritance).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("부모 기록이 수집 구간보다 오래됐어도 지문을 얻으려고 읽고, 그 부모는 요약에 넣지 않는다", async () => {
    await rollout(1, MOM(), { mtimeMs: OLD_TIME });
    await rollout(2, CHILD());
    const result = await collectCodex(options());
    expect(result.summaries.map((summary) => summary.sessionId)).toEqual([ID(2)]);
    expect(responses(result.summaries[0]!)).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, read: { olderThanWindow: 1, files: 1 } });
  });

  it("구간 밖 부모 세션에 대화를 되돌려 생긴 기록이 있으면 그 기록도 지문을 얻으려고 읽는다. 이름으로 찾은 기록은 읽어서 세션 ID가 맞을 때만 쓴다", async () => {
    await rollout(1, MOM(), { mtimeMs: OLD_TIME });
    await reverted(1, 9, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), item({ type: "UserMessage", id: "u5" }), record("r5", 50)], { mtimeMs: OLD_TIME });
    await reverted(1, 8, [meta(ID(7)), item({ type: "UserMessage", id: "u2" })], { mtimeMs: OLD_TIME });
    await rollout(2, [...CHILD(), item({ type: "UserMessage", id: "u5" }), record("r5", 50)]);
    const result = await collectCodex(options());
    const child = bySession(result, ID(2));
    expect(Object.values(child.days)[0]).toMatchObject({ responses: 1, humanRequests: 1, tokens: { input: 20 } });
    expect(child.codex?.inheritedSkipped).toEqual({ items: 2, totals: 0, responses: 2 });
    expect(result).toMatchObject({ parentRecordMissing: 0, read: { olderThanWindow: 3, files: 1 } });
  });

  it("구간 밖 부모 기록이 절반 넘게 깨졌으면 그 지문으로 빼되 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, [...MOM(), "{x", "{y", "{z", "{w"], { mtimeMs: OLD_TIME });
    await rollout(2, CHILD());
    const result = await collectCodex(options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1, read: { olderThanWindow: 1 } });
  });

  it("구간 밖 부모 기록을 읽는 동안 줄어 덜 읽었으면 하위 세션을 이어받은 것을 확인하지 못한 세션으로 센다(구간 밖이라 일부만 읽은 파일로는 세지 않는다)", async () => {
    const front = `${MOM().join("\n")}\n`;
    const full = `${front}${[item({ type: "UserMessage", id: "u9" }), record("r9", 90)].join("\n")}\n`;
    const parent = await rollout(1, [], { mtimeMs: OLD_TIME, bytes: () => Buffer.from(full) });
    await rollout(2, CHILD());
    const direct = await collectCodex(options({ cacheDir: null }));
    expect(direct).toMatchObject({ unverifiedInheritance: 0, read: { olderThanWindow: 1 } });
    const realLines = linesModule.readLines;
    let cut = false;
    const shrink = async (): Promise<void> => {
      cut = true;
      await truncate(parent, Buffer.byteLength(front));
      await utimes(parent, OLD_TIME / 1000, OLD_TIME / 1000);
    };
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realLines(file, nowMs, sink, file === parent && !cut ? { ...readOptions, afterOpen: shrink } : readOptions));
    let result: Awaited<ReturnType<typeof collectCodex>>;
    try {
      result = await collectCodex(options({ cacheDir: null }));
    } finally {
      spy.mockRestore();
    }
    expect(cut).toBe(true);
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 1, read: { olderThanWindow: 1, partialFiles: [], unreadableFiles: [] } });
  });

  it("부모 세션의 다른 기록을 읽지 못했으면 부모 세션과 하위 세션을 모두 이어받은 것을 확인하지 못한 세션으로 센다", async () => {
    await rollout(1, MOM());
    await rollout(2, CHILD());
    const home = join(root, ".codex");
    const listed = await listCodexFiles(home, null, sameTimes);
    const missing = join(dir(), `rollout-2026-11-11T13-30-00-${ID(1)}_${ID(9)}.jsonl`);
    const list = { ...listed, files: [...listed.files, { path: missing, normPath: missing.toLowerCase(), size: 10, mtimeMs: FILE_TIME, changedMs: FILE_TIME, recordId: ID(9), baseId: ID(1), compressed: false }] };
    const result = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(responses(bySession(result, ID(2)))).toBe(1);
    expect(result).toMatchObject({ parentRecordMissing: 0, unverifiedInheritance: 2 });
  });

  it("같은 세션의 기록 차례는 원래 기록이 먼저다. 파일 이름이 원래 기록보다 앞선 되돌려 생긴 기록도 원래 기록 뒤에 센다", async () => {
    await rollout(1, [meta(ID(1)), record("shared", 10)], { nameTime: "23-00-00" });
    await reverted(1, 3, [meta(ID(1), HISTORY), record("shared", 99)], { nameTime: "01-00-00" });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 1, tokens: { input: 10 } });
  });

  it("원래 기록 다음은 기록 파일 식별자가 아니라 파일 이름(만든 차례) 차례다", async () => {
    await rollout(1, [meta(ID(1))]);
    await reverted(1, 9, [meta(ID(1), HISTORY), record("shared", 10)], { nameTime: "13-00-00" });
    await reverted(1, 2, [meta(ID(1), HISTORY), record("shared", 99)], { nameTime: "14-00-00" });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 1, tokens: { input: 10 } });
  });

  it("같은 세션의 뒤 기록은 바로 앞 기록만이 아니라 앞선 기록 모두의 지문을 뺀다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), HISTORY), record("r2", 20)], { nameTime: "13-00-00" });
    await reverted(1, 4, [meta(ID(1), HISTORY), record("r1", 10), record("r3", 30)], { nameTime: "14-00-00" });
    const result = await collectCodex(options({ cacheDir: null }));
    expect(Object.values(result.summaries[0]!.days)[0]).toMatchObject({ responses: 3, tokens: { input: 60 } });
  });

  it("같은 세션의 기록 파일 여럿(대화를 되돌려 생긴 기록)은 하나로 합친다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await reverted(1, 3, [meta(ID(1), { history_mode: "paginated", history_base: { thread_id: ID(1) } }), record("r9", 5)]);
    const result = await collectCodex(options());
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toMatchObject({ sessionId: ID(1), codex: { recordId: ID(1) } });
    expect(responses(result.summaries[0]!)).toBe(2);
    expect(result).toMatchObject({ mergedSessions: 1, read: { files: 2 } });
  });
});

describe("캐시", () => {
  it("다시 모으면 바뀌지 않은 기록은 캐시에서 꺼내고 캐시 없이 모은 것과 같다", async () => {
    await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), record("r1", 10)]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "Zeta", id: "z" }), item({ type: "Alpha", id: "a" }), record("r2", 20)]);
    const first = await collectCodex(options());
    const second = await collectCodex(options());
    const none = await collectCodex(options({ cacheDir: null }));
    expect(first.read.fromCache).toBe(0);
    expect(second.read.fromCache).toBe(2);
    expect(JSON.stringify(second.summaries)).toBe(JSON.stringify(first.summaries));
    expect(JSON.stringify(none.summaries)).toBe(JSON.stringify(first.summaries));
  });

  it("부모가 하위와 상관없는 줄을 덧붙이면 하위는 캐시에서 꺼내고, 하위의 지문과 겹치는 줄을 덧붙이면 하위를 다시 읽어 그만큼 빼고 센다", async () => {
    const mom = await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" })]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "UserMessage", id: "u2" }), record("r2", 20)]);
    await collectCodex(options());
    const touch = async () => utimes(mom, (FILE_TIME + 60_000) / 1000, (FILE_TIME + 60_000) / 1000);

    await appendFile(mom, `${item({ type: "UserMessage", id: "u7" })}\n`);
    await touch();
    const unrelated = await collectCodex(options());
    expect(unrelated.read.fromCache).toBe(1);
    expect(Object.values(bySession(unrelated, ID(2)).days)[0]).toMatchObject({ humanRequests: 1 });

    await appendFile(mom, `${item({ type: "UserMessage", id: "u2" })}\n`);
    await utimes(mom, (FILE_TIME + 120_000) / 1000, (FILE_TIME + 120_000) / 1000);
    const shared = await collectCodex(options());
    expect(shared.read.fromCache).toBe(0);
    const child = bySession(shared, ID(2));
    expect(Object.values(child.days)[0]).toMatchObject({ humanRequests: 0, responses: 1 });
    expect(child.codex?.inheritedSkipped.items).toBe(2);
    expect(JSON.stringify(shared.summaries)).toBe(JSON.stringify((await collectCodex(options({ cacheDir: null }))).summaries));
  });

  it("부모의 옛 누적값 겹침만 바뀌어도 하위 기록을 캐시에서 꺼내지 않고 다시 읽는다", async () => {
    const count = (n: number) => line("event_msg", { type: "token_count", info: { total_token_usage: usage(n) } });
    const parent = await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" }), count(100)]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), count(100), count(160), count(200)]);
    const first = await collectCodex(options());
    expect(Object.values(bySession(first, ID(2)).days)[0]!.tokens.input).toBe(100);
    expect((await collectCodex(options())).read.fromCache).toBe(2);
    await appendFile(parent, `${count(160)}\n`);
    await utimes(parent, (FILE_TIME + 60_000) / 1000, (FILE_TIME + 60_000) / 1000);
    const changed = await collectCodex(options());
    expect(Object.values(bySession(changed, ID(2)).days)[0]!.tokens.input).toBe(40);
    expect(responses(bySession(changed, ID(2)))).toBe(1);
    expect(changed.read.fromCache).toBe(0);
  });

  it("부모 기록이 없어지면 캐시의 하위 요약을 쓰지 않고 다시 다 센다", async () => {
    const mom = await rollout(1, [meta(ID(1)), item({ type: "UserMessage", id: "u1" })]);
    await rollout(2, [sub(ID(2), ID(1)), item({ type: "UserMessage", id: "u1" }), item({ type: "UserMessage", id: "u2" })]);
    await collectCodex(options());
    await rm(mom);
    const result = await collectCodex(options());
    expect(Object.values(bySession(result, ID(2)).days)[0]).toMatchObject({ humanRequests: 2 });
    expect(result.parentRecordMissing).toBe(1);
  });

  it("--rescan은 크기와 수정 시각과 앞뒤 4KB가 같은 가운데가 바뀐 기록도 다시 읽는다(캐시가 알아보지 못하는 한계를 되돌리는 길이다)", async () => {
    const pad = line("padding", { text: "x".repeat(9000) });
    const path = await rollout(1, [meta(ID(1)), pad, record("r1", 10), pad]);
    await collectCodex(options());
    await writeFile(path, `${[meta(ID(1)), pad, record("r1", 20), pad].join("\n")}\n`);
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    expect(Object.values((await collectCodex(options())).summaries[0]!.days)[0]!.tokens.input).toBe(10);
    expect(Object.values((await collectCodex(options({ rescan: true }))).summaries[0]!.days)[0]!.tokens.input).toBe(20);
  });

  it("수정 시각과 변경 시각 가운데 늦은 것이 평가 시각에서 2초 안쪽이면 쓰는 중인 기록이다(줄바꿈 없는 끝을 끝 조각으로 세고 캐시에 넣지 않는다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { bytes: (raw) => Buffer.concat([raw, Buffer.from('{"timestamp":"2026-11-11T03:00:00Z","type":"event_msg"')]) });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1000 };
    };
    const first = await collectCodex(options({ statFile: fresh }));
    expect(first.summaries[0]!.missing).toMatchObject({ tailFragments: 1, brokenLines: 0 });
    expect(first.read.inProgress).toBe(1);
    // 1분 뒤에는 쓰는 중이 아니라 캐시를 꺼내 본다. 넣었다면 꺼낸다
    expect((await collectCodex(options({ statFile: fresh, clock: { nowMs: NOW + 60_000, timeZone: "Asia/Seoul" } }))).read.fromCache).toBe(0);
  });

  it("캐시에 넣은 기록이라도 변경 시각만 최근으로 바뀌면 캐시를 쓰지 않고 다시 읽는다(캐시 없는 읽기와 같다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { bytes: (raw) => Buffer.concat([raw, Buffer.from('{"type":"event_msg"')]) });
    const stored = await collectCodex(options());
    expect(stored.summaries[0]!.missing).toMatchObject({ brokenLines: 1, tailFragments: 0 });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1000 };
    };
    const cached = await collectCodex(options({ statFile: fresh }));
    const uncached = await collectCodex(options({ statFile: fresh, cacheDir: null }));
    expect(cached.summaries).toEqual(uncached.summaries);
    expect(cached.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
    expect(cached.read).toMatchObject({ inProgress: 1, fromCache: 0 });
  });

  it("캐시에 넣은 되돌려 생긴 기록과 보통 기록도 변경 시각이 1999밀리초 전으로 바뀌면 캐시를 쓰지 않고 다시 읽는다(캐시 없는 읽기와 같다)", async () => {
    const tail = '{"type":"event_msg"';
    const back = await reverted(5, 6, [meta(ID(5)), record("r5", 10)]);
    await appendFile(back, tail);
    await utimes(back, FILE_TIME / 1000, FILE_TIME / 1000);
    await rollout(7, [meta(ID(7)), record("r7", 10)], { bytes: (raw) => Buffer.concat([raw, Buffer.from(tail)]) });
    expect((await collectCodex(options())).read).toMatchObject({ fromCache: 0, inProgress: 0 });
    const fresh: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 1999 };
    };
    const cached = await collectCodex(options({ statFile: fresh }));
    const uncached = await collectCodex(options({ statFile: fresh, cacheDir: null }));
    expect(cached.summaries).toEqual(uncached.summaries);
    expect(cached.read).toMatchObject({ inProgress: 2, fromCache: 0 });
  });

  it("목록을 얻은 뒤 덧쓴 기록은 캐시를 꺼내지 않고 쓰는 중으로 세어 캐시를 켜고 끈 결과가 같다(쓰는 동안 수정 시각이 머물러도 크기로 안다)", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    expect((await collectCodex(options())).read.fromCache).toBe(0);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    await appendFile(path, `${record("r2", 20)}\n`);
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    const cached = await collectCodexFromList(home, list, options());
    const direct = await collectCodexFromList(home, list, options({ cacheDir: null }));
    expect(responses(bySession(direct, ID(1)))).toBe(2);
    expect(cached.summaries).toEqual(direct.summaries);
    // 목록과 다르게 열었어도 연 크기까지 다 읽었으니 일부만 읽은 파일이 아니다
    expect(cached.read).toMatchObject({ fromCache: 0, inProgress: 1, partialFiles: [], unreadableFiles: [] });
    expect(direct.read).toMatchObject({ inProgress: 1, partialFiles: [], unreadableFiles: [] });
  });

  for (const compressed of [false, true]) {
    it.skipIf(compressed && !zstdAvailable())(`목록을 얻은 뒤 크기는 그대로이고 수정 시각만 늦어지거나 앞당겨진 ${compressed ? "압축" : "보통"} 기록도 쓰는 중으로 센다(줄바꿈 없는 끝은 끝 조각이고 읽지 못한 파일이 아니다)`, async () => {
      const raw = Buffer.from('{"type":"session_meta"');
      const path = await rollout(1, [], { compressed, bytes: () => (compressed ? compress(raw) : raw) });
      await collectCodex(options());
      const home = join(root, ".codex");
      for (const shift of [60_000, -60_000]) {
        const list = await listCodexFiles(home, null, sameTimes);
        await utimes(path, (FILE_TIME + shift) / 1000, (FILE_TIME + shift) / 1000);
        const cached = await collectCodexFromList(home, list, options());
        const direct = await collectCodexFromList(home, list, options({ cacheDir: null }));
        expect(cached.read).toMatchObject({ fromCache: 0, inProgress: 1, unreadableFiles: [], partialFiles: [] });
        expect(cached.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
        expect(cached.summaries).toEqual(direct.summaries);
        expect(direct.read.inProgress).toBe(1);
        await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      }
    });
  }

  for (const compressed of [false, true]) {
    it.skipIf(compressed && !zstdAvailable())(`목록을 얻은 뒤 크기만 줄어든(수정 시각은 그대로인) ${compressed ? "압축" : "보통"} 기록도 쓰는 중으로 센다(줄바꿈 없는 끝은 끝 조각이고 읽지 못한 파일이 아니다)`, async () => {
      const raw = Buffer.from('{"type":"session_meta"');
      const first = compressed ? compress(raw) : raw;
      const extra = compressed ? compress(Buffer.from(" ".repeat(9000))) : Buffer.from(" ".repeat(9000));
      const path = await rollout(1, [], { compressed, bytes: () => Buffer.concat([first, extra]) });
      await collectCodex(options());
      const home = join(root, ".codex");
      const list = await listCodexFiles(home, null, sameTimes);
      await truncate(path, first.length);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      const cached = await collectCodexFromList(home, list, options());
      const direct = await collectCodexFromList(home, list, options({ cacheDir: null }));
      expect(cached.read).toMatchObject({ fromCache: 0, inProgress: 1, unreadableFiles: [], partialFiles: [] });
      expect(cached.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
      expect(cached.summaries).toEqual(direct.summaries);
      expect(direct.read.inProgress).toBe(1);
    });
  }

  for (const compressed of [false, true]) {
    it.skipIf(compressed && !zstdAvailable())(`수정 시각과 변경 시각이 다르지만 둘 다 오래된 ${compressed ? "압축" : "보통"} 기록은 쓰는 중이 아니고 캐시에 넣는다(목록 뒤 변경은 늦은 쪽이 아니라 원래 수정 시각으로 견준다)`, async () => {
      const raw = Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`);
      await rollout(1, [], { compressed, bytes: () => (compressed ? compress(raw) : raw) });
      const later: StatFile = async (path) => {
        const info = await stat(path);
        return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.mtimeMs + 60_000 };
      };
      const first = await collectCodex(options({ statFile: later }));
      const second = await collectCodex(options({ statFile: later }));
      expect([first.read.inProgress, second.read.fromCache]).toEqual([0, 1]);
      expect(first.summaries[0]!.missing).toMatchObject({ brokenLines: 1, tailFragments: 0 });
      expect(second.summaries).toEqual(first.summaries);
    });
  }

  for (const compressed of [false, true]) {
    it.skipIf(compressed && !zstdAvailable())(`읽는 동안 커진 ${compressed ? "압축" : "보통"} 기록은 목록과 같고 오래됐어도 쓰는 중으로 센다(읽기 함수가 본 변화를 따르고 연 크기까지만 센다)`, async () => {
      const raw = Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`);
      const path = await rollout(1, [], { compressed, bytes: () => (compressed ? compress(raw) : raw) });
      const line = CodexSessionParser.prototype.line;
      let done = false;
      // 해석기가 첫 줄을 받을 때 파일 끝에 덧붙여, 목록과 연 순간은 같고 읽는 동안만 바뀌게 한다
      const spy = vi.spyOn(CodexSessionParser.prototype, "line").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["line"]>) {
        if (!done) {
          done = true;
          const more = Buffer.from(`${record("r2", 20)}\n`);
          appendFileSync(path, compressed ? compress(more) : more);
        }
        return line.apply(this, args);
      });
      try {
        const result = await collectCodex(options({ cacheDir: null }));
        expect(done).toBe(true);
        expect(result.read.inProgress).toBe(1);
        expect(result.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 1 });
        expect(responses(result.summaries[0]!)).toBe(1);
      } finally {
        spy.mockRestore();
      }
    });
  }

  it("캐시 열쇠의 앞 지문을 읽는 동안 덧쓴 기록은 예전 캐시를 쓰지 않고 쓰는 중으로 센다(수정 시각을 되돌려도 크기로 안다)", async () => {
    const unfinished = `{"timestamp":"${T}","type":"session_meta","payload":{"id":"${ID(1)}","cwd":"${"x".repeat(16000)}"`;
    const path = await rollout(1, [], { bytes: () => Buffer.from(unfinished) });
    expect((await collectCodex(options())).read).toMatchObject({ inProgress: 0, unreadableFiles: [path] });
    const probe = await open(path, "r");
    const proto: { read(...args: unknown[]): Promise<unknown> } = Object.getPrototypeOf(probe);
    await probe.close();
    const read = proto.read;
    let reads = 0;
    // 캐시 열쇠가 앞 지문을 읽은 직후에 줄을 마저 써서, 목록과 연 순간은 같고 지문을 읽는 동안만 바뀌게 한다
    const spy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, ...args: unknown[]) {
      const result = await read.apply(this, args);
      if (++reads === 1) {
        await appendFile(path, "}}\n");
        await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      }
      return result;
    });
    try {
      const result = await collectCodex(options());
      expect(result.read).toMatchObject({ fromCache: 0, inProgress: 1, unreadableFiles: [] });
      expect(result.summaries[0]!.missing).toMatchObject({ brokenLines: 0, tailFragments: 0 });
    } finally {
      spy.mockRestore();
    }
  });

  for (const compressed of [false, true]) {
    it.skipIf(compressed && !zstdAvailable())(`해석하는 사이 같은 크기와 수정 시각으로 바뀐 ${compressed ? "압축" : "보통"} 기록의 요약은 예전 열쇠로 캐시에 넣지 않는다(넣기 직전에 열쇠를 다시 만든다)`, async () => {
      const pad = line("event_msg", { type: "padding", text: "x".repeat(1_200_000) });
      const plainOf = (n: number) => Buffer.from(`${[meta(ID(1)), pad, record("r1", n)].join("\n")}\n`);
      // 압축 기록은 머리 프레임과, 끝의 공백으로 길이를 맞춘 자료 프레임으로 같은 크기의 둘을 만든다
      const packedPair = (): [Buffer, Buffer] => {
        const head = compress(Buffer.from(`${meta(ID(1))}\n`));
        const byLength = new Map<number, Buffer>();
        for (let k = 0; k < 257; k++) {
          const frame = compress(Buffer.from(`${record("r1", 10)}\n${" ".repeat(k)}`));
          byLength.set(frame.length, frame);
        }
        for (let k = 0; k < 257; k++) {
          const frame = compress(Buffer.from(`${record("r1", 20)}\n${" ".repeat(k)}`));
          const same = byLength.get(frame.length);
          if (same) return [Buffer.concat([head, same]), Buffer.concat([head, frame])];
        }
        throw new Error("같은 길이의 자료 프레임을 만들지 못했다");
      };
      const [a, b] = compressed ? packedPair() : [plainOf(10), plainOf(20)];
      expect(a.length).toBe(b.length);
      const path = await rollout(1, [], { compressed, bytes: () => a });
      const parse = CodexSessionParser.prototype.line;
      let changed = false;
      // 첫 줄을 해석할 때 같은 크기의 다른 내용으로 바꾸고 수정 시각을 되돌린다. 뒤쪽 응답은 바뀐 내용에서 읽힌다
      const spy = vi.spyOn(CodexSessionParser.prototype, "line").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["line"]>) {
        if (!changed) {
          changed = true;
          writeFileSync(path, b);
          utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
        }
        return parse.apply(this, args);
      });
      let first: Awaited<ReturnType<typeof collectCodex>>;
      try {
        first = await collectCodex(options());
      } finally {
        spy.mockRestore();
      }
      expect(changed).toBe(true);
      expect(Object.values(bySession(first, ID(1)).days)[0]!.tokens.input).toBe(20);
      await writeFile(path, a);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      const cached = await collectCodex(options());
      const direct = await collectCodex(options({ cacheDir: null }));
      expect(Object.values(bySession(direct, ID(1)).days)[0]!.tokens.input).toBe(10);
      expect(cached.summaries).toEqual(direct.summaries);
    });
  }

  it("캐시가 있고 늦은 쪽 시각이 정확히 2초 전인 기록은 쓰는 중이 아니라 캐시에서 꺼낸다(캐시를 꺼낼 때도 2초 안쪽만 쓰는 중이다)", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await collectCodex(options());
    const twoSeconds: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW - 2000 };
    };
    expect((await collectCodex(options({ statFile: twoSeconds }))).read).toMatchObject({ inProgress: 0, fromCache: 1 });
  });

  for (const compressed of [false, true]) {
    it.skipIf(compressed && !zstdAvailable())(`캐시가 있어도 늦은 쪽 시각이 평가 시각보다 뒤인 ${compressed ? "압축" : "보통"} 기록은 그 실행 중에 쓰인 것이라 쓰는 중이다`, async () => {
      const raw = Buffer.from(`${[meta(ID(1)), record("r1", 10)].join("\n")}\n{"type":"event_msg"`);
      await rollout(1, [], { compressed, bytes: () => (compressed ? compress(raw) : raw) });
      await collectCodex(options());
      const afterNow: StatFile = async (path) => {
        const info = await stat(path);
        return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: NOW + 5000 };
      };
      const result = await collectCodex(options({ statFile: afterNow }));
      expect([result.read.inProgress, result.read.fromCache]).toEqual([1, 0]);
    });
  }

  for (const appendAfterRead of [false, true]) {
    it(`넣기 직전 재확인은 열쇠를 만든 뒤 앞 4KB만 바뀐 기록${appendAfterRead ? "이 읽은 뒤 덧쓰여 열쇠가 없어진 때" : ""}의 요약을 예전 열쇠로 넣지 않는다`, async () => {
      const filler = line("event_msg", { type: "padding", text: "x".repeat(10_000) });
      const contentOf = (version: string) => Buffer.from(`${[meta(ID(1), { cli_version: version }), filler, record("r1", 10)].join("\n")}\n`);
      const a = contentOf("0.166.0");
      const b = contentOf("0.167.0");
      expect(a.length).toBe(b.length);
      expect(a.subarray(0, 4096).equals(b.subarray(0, 4096))).toBe(false);
      expect(a.subarray(-4096).equals(b.subarray(-4096))).toBe(true);
      const path = await rollout(1, [], { bytes: () => a });
      const probe = await open(path, "r");
      const proto: { read(...args: unknown[]): Promise<unknown> } = Object.getPrototypeOf(probe);
      await probe.close();
      const read = proto.read;
      let reads = 0;
      // 캐시 열쇠가 앞뒤 지문을 다 읽은 직후에 같은 크기의 B로 바꾸고 수정 시각을 되돌려, 해석은 B를 읽게 한다
      const readSpy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, ...args: unknown[]) {
        const result = await read.apply(this, args);
        if (++reads === 2) {
          writeFileSync(path, b);
          utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
        }
        return result;
      });
      const finish = CodexSessionParser.prototype.finish;
      // 해석을 마친 뒤 넣기 직전 재확인보다 앞에서 두 바이트를 덧붙이면 다시 만든 열쇠가 없다
      const finishSpy = vi.spyOn(CodexSessionParser.prototype, "finish").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["finish"]>) {
        const summary = finish.apply(this, args);
        if (appendAfterRead) {
          appendFileSync(path, "\n\n");
          utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
        }
        return summary;
      });
      try {
        const first = await collectCodex(options());
        expect(bySession(first, ID(1)).version).toBe("0.167.0");
      } finally {
        readSpy.mockRestore();
        finishSpy.mockRestore();
      }
      await writeFile(path, a);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      const cached = await collectCodex(options());
      const direct = await collectCodex(options({ cacheDir: null }));
      expect(bySession(direct, ID(1)).version).toBe("0.166.0");
      expect(cached.summaries).toEqual(direct.summaries);
    });
  }

  for (const [name, rescan, removeAfterRead] of [["--rescan으로 다시 읽을 때", true, false], ["재확인 때 파일이 없어졌을 때", false, true]] as const) {
    it(`넣기 직전 재확인은 ${name}도 해석한 내용과 다른 열쇠로 넣지 않는다`, async () => {
      const filler = line("event_msg", { type: "padding", text: "x".repeat(10_000) });
      const contentOf = (n: number) => Buffer.from(`${[meta(ID(1)), filler, record("r1", n)].join("\n")}\n`);
      const a = contentOf(10);
      const b = contentOf(20);
      expect(a.length).toBe(b.length);
      const path = await rollout(1, [], { bytes: () => a });
      const probe = await open(path, "r");
      const proto: { read(...args: unknown[]): Promise<unknown> } = Object.getPrototypeOf(probe);
      await probe.close();
      const read = proto.read;
      let reads = 0;
      // 캐시 열쇠가 앞뒤 지문을 다 읽은 직후에 같은 크기의 B로 바꾸고 수정 시각을 되돌려, 해석은 B를 읽게 한다
      const readSpy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, ...args: unknown[]) {
        const result = await read.apply(this, args);
        if (++reads === 2) {
          writeFileSync(path, b);
          utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
        }
        return result;
      });
      const finish = CodexSessionParser.prototype.finish;
      const finishSpy = vi.spyOn(CodexSessionParser.prototype, "finish").mockImplementation(function (this: CodexSessionParser, ...args: Parameters<CodexSessionParser["finish"]>) {
        const summary = finish.apply(this, args);
        if (removeAfterRead) rmSync(path);
        return summary;
      });
      try {
        const first = await collectCodex(options({ rescan }));
        expect(Object.values(bySession(first, ID(1)).days)[0]!.tokens.input).toBe(20);
      } finally {
        readSpy.mockRestore();
        finishSpy.mockRestore();
      }
      await writeFile(path, a);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      const cached = await collectCodex(options());
      const direct = await collectCodex(options({ cacheDir: null }));
      expect(Object.values(bySession(direct, ID(1)).days)[0]!.tokens.input).toBe(10);
      expect(cached.summaries).toEqual(direct.summaries);
    });
  }

  it("정본을 읽지 못해 다음 사본을 읽었으면 그 사본의 경로로 재확인해 다음 실행이 캐시에서 꺼낸다", async () => {
    const fallback = await rollout(1, [meta(ID(1)), record("r1", 20)]);
    const canonicalDir = join(root, ".codex", "sessions", "2026", "11", "10");
    await mkdir(canonicalDir, { recursive: true });
    const canonical = join(canonicalDir, fallback.split(/[\\/]/).at(-1)!);
    await writeFile(canonical, `${[meta(ID(1)), record("r1", 10)].join("\n")}\n`);
    await utimes(canonical, FILE_TIME / 1000, FILE_TIME / 1000);
    const read = linesModule.readLines;
    // 정본만 읽기를 거절해 다음 사본을 읽게 한다
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation(async (path, ...args) => {
      if (path === canonical) throw Object.assign(new Error("정본 읽기 거절"), { code: "EACCES" });
      return read(path, ...args);
    });
    try {
      const first = await collectCodex(options());
      const second = await collectCodex(options());
      expect(Object.values(bySession(first, ID(1)).days)[0]!.tokens.input).toBe(20);
      expect(second.summaries).toEqual(first.summaries);
      expect(second.read.fromCache).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("실제 모으기에서 목록을 만드는 사이에 덧쓴 기록도 새 응답을 놓치지 않는다", async () => {
    const path = await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await collectCodex(options());
    let added = false;
    const racing: StatFile = async (file) => {
      const info = await sameTimes(file);
      if (file === path && !added) {
        added = true;
        await appendFile(path, `${record("r2", 20)}\n`);
      }
      return info;
    };
    const result = await collectCodex(options({ statFile: racing }));
    expect(added).toBe(true);
    expect(responses(bySession(result, ID(1)))).toBe(2);
    expect(result.read).toMatchObject({ fromCache: 0, inProgress: 1 });
  });

  it("쓰는 중인 기록은 캐시에 넣지 않는다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)], { mtimeMs: NOW - 1000 });
    const first = await collectCodex(options());
    expect(first.read.inProgress).toBe(1);
    // 1분 뒤에는 쓰는 중이 아니라 캐시를 꺼내 본다. 넣었다면 꺼낸다
    expect((await collectCodex(options({ clock: { nowMs: NOW + 60_000, timeZone: "Asia/Seoul" } }))).read.fromCache).toBe(0);
  });

  it("목록의 차례와 상관없이 같은 결과다", async () => {
    await rollout(1, [meta(ID(1)), record("r1", 10)]);
    await rollout(2, [sub(ID(2), ID(1)), record("r1", 10), record("r2", 20)]);
    await rollout(3, [meta(ID(1), { history_base: {} }), record("r9", 5)]);
    const home = join(root, ".codex");
    const list = await listCodexFiles(home, null, sameTimes);
    const forward = await collectCodexFromList(home, list, options({ cacheDir: null }));
    const backward = await collectCodexFromList(home, { ...list, files: [...list.files].reverse() }, options({ cacheDir: null }));
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });
});
