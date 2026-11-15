// Claude Code 기록 모으기(캐시를 켜고 끈 결과의 같음, 날짜가 바뀐 경우, 진행 중인 파일, 볼 수 있는 날짜 범위, 겹친 응답)를 시험한다(설계 9.4, 9.8, 21.1 반례)
import { appendFile, mkdir, mkdtemp, open, readdir, readFile, rm, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, utimesSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeSessionParser } from "../../src/adapters/claude/parser.ts";
import { claudeObservation } from "../../src/adapters/claude/observation.ts";
import { claudeHome, listClaudeFiles } from "../../src/adapters/claude/locate.ts";
import { CLAUDE_PARSER_ID, collectClaude, collectFromList, overlappingSessions, unreadableCount, visibleFrom, type CollectOptions } from "../../src/collect/claude.ts";
import { cacheKeyFor, storeCached } from "../../src/state/cache.ts";
import * as linesModule from "../../src/adapters/common/lines.ts";
import { assistant, attachment, user } from "../helpers/claude-lines.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 모으기 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");

async function session(project: string, id: string, lines: string[], mtimeMs = FILE_TIME): Promise<string> {
  const dir = join(root, ".claude", "projects", project);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  await writeFile(path, `${lines.join("\n")}\n`);
  await utimes(path, mtimeMs / 1000, mtimeMs / 1000);
  return path;
}

function options(overrides: Partial<CollectOptions> = {}): CollectOptions {
  return { env: {}, homedir: root, clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, cacheDir: null, rescan: false, ...overrides };
}

const sampleLines = (prefix: string): string[] => [
  user({ at: "2026-11-11T01:00:00Z", content: "hi", origin: "human" }),
  assistant({ id: `${prefix}-1`, at: "2026-11-11T01:00:05Z", usage: { input: 1, output: 2 } }),
];

describe("collectClaude", () => {
  it("캐시를 켜고 끈 결과가 글자 하나 다르지 않다", async () => {
    await session("p-b", "s2", sampleLines("b"));
    await session("p-a", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    const plain = await collectClaude(options());
    const first = await collectClaude(options({ cacheDir }));
    const second = await collectClaude(options({ cacheDir }));
    expect(second.read.fromCache).toBe(2);
    expect(JSON.stringify(second.summaries)).toBe(JSON.stringify(plain.summaries));
    expect(JSON.stringify(first.summaries)).toBe(JSON.stringify(plain.summaries));
    expect(plain.summaries.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
  });
  it("첫 읽기에서 파일이 끝났으면 그 뒤 되돌아와도 쓰는 중이어서 빈 요약을 온전한 파일의 열쇠로 캐시에 넣지 않고, 앞부분만 읽은 것이라 읽지 못한 파일로도 세어 관측이 빠짐없지 않다", async () => {
    const lines = sampleLines("a");
    const path = await session("p", "s1", lines);
    const body = `${lines.join("\n")}\n`;
    const cacheDir = join(root, "state", "cache");
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
    let first: Awaited<ReturnType<typeof collectClaude>>;
    try {
      first = await collectClaude(options({ cacheDir }));
    } finally {
      readSpy.mockRestore();
      linesSpy.mockRestore();
    }
    expect(ended).toBe(true);
    expect(first.read.inProgress).toBe(1);
    expect(first.read.unreadableFiles).toEqual([path]);
    // 읽지 못한 바이트는 읽은 바이트(0)가 아니라 목록의 파일 크기다
    expect(first.read).toMatchObject({ bytes: 0, listedBytes: Buffer.byteLength(body), unreadableFileBytes: Buffer.byteLength(body) });
    expect(claudeObservation(first.summaries, unreadableCount(first.read), "mcp").complete).toBe(false);
    const plain = await collectClaude(options());
    const again = await collectClaude(options({ cacheDir }));
    expect(again.read.fromCache).toBe(0);
    expect(JSON.stringify(again.summaries)).toBe(JSON.stringify(plain.summaries));
    expect(plain.summaries.flatMap((summary) => Object.values(summary.days)).reduce((sum, day) => sum + day.tokens.input, 0)).toBe(1);
  });
  it("1~4단계 버전(해석 버전 1)이 넣었을 수 있는 캐시는 꺼내지 않고 다시 읽는다(읽는 동안 줄었다 되돌아온 파일의 앞부분만 읽은 요약이나 첫 읽기에서 끝나 빈 요약을 온전한 파일의 열쇠로 넣은 것. 주 세션과 하위 세션)", async () => {
    expect(CLAUDE_PARSER_ID).not.toBe("claude-code@1");
    const lines = [...sampleLines("a"), assistant({ id: "a-2", at: "2026-11-11T01:00:09Z", usage: { input: 3, output: 4 } })];
    const responses = (result: Awaited<ReturnType<typeof collectClaude>>) => result.summaries.flatMap((summary) => Object.values(summary.days)).reduce((sum, day) => sum + day.responses, 0);
    // 이름, 프로젝트 폴더 아래 경로, 예전 요약이 읽은 줄 수(0이면 첫 읽기에서 끝난 빈 요약)
    const cases: Array<[string, string[], number]> = [
      ["주 세션, 앞부분", ["s1.jsonl"], 2],
      ["주 세션, 빈 요약", ["s1.jsonl"], 0],
      ["하위 세션, 앞부분", ["parent", "subagents", "agent-1.jsonl"], 2],
      ["하위 세션, 빈 요약", ["parent", "subagents", "agent-1.jsonl"], 0],
    ];
    for (const [name, parts, read] of cases) {
      rmSync(join(root, ".claude"), { recursive: true, force: true });
      rmSync(join(root, "state"), { recursive: true, force: true });
      const path = join(root, ".claude", "projects", "p", ...parts);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, `${lines.join("\n")}\n`);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      const [file] = (await listClaudeFiles(claudeHome({}, root), null)).files;
      // 열쇠는 온전한 파일의 것, 요약은 앞 몇 줄만 읽은 것
      const key = (await cacheKeyFor(file!, "claude-code@1", "Asia/Seoul"))!;
      const parser = new ClaudeSessionParser({ sessionId: file!.sessionId, kind: file!.kind, parentSessionId: file!.parentSessionId, timeZone: "Asia/Seoul" });
      for (const text of lines.slice(0, read)) parser.line(text);
      const front = parser.finish(null, false);
      const cacheDir = join(root, "state", "cache");
      await storeCached(join(cacheDir, "claude-code"), { key, summary: front, bytesRead: read === 0 ? 0 : Buffer.byteLength(`${lines.slice(0, read).join("\n")}\n`) });
      const plain = await collectClaude(options());
      const cached = await collectClaude(options({ cacheDir }));
      expect(responses(plain), name).toBe(2);
      expect(cached.read.fromCache, name).toBe(0);
      expect(responses(cached), name).toBe(2);
      expect(JSON.stringify(cached.summaries), name).toBe(JSON.stringify(plain.summaries));
      // 다시 읽은 것을 지금 버전의 열쇠로 넣어, 다음 실행은 캐시에서 꺼낸다
      const again = await collectClaude(options({ cacheDir }));
      expect(again.read.fromCache, name).toBe(1);
      expect(JSON.stringify(again.summaries), name).toBe(JSON.stringify(plain.summaries));
    }
  });
  it("캐시 열쇠를 만든 뒤 열기 전에 바뀌었다가 읽은 뒤 되돌아온 파일은, 그때 읽은 요약을 원래 열쇠로 넣지 않는다(크기가 줄어든 것, 같은 크기로 내용과 수정 시각이 바뀐 것)", async () => {
    const a = assistant({ id: "a", at: "2026-11-11T01:00:01Z", usage: { input: 10, output: 1 } });
    const b = assistant({ id: "b", at: "2026-11-11T01:00:02Z", usage: { input: 20, output: 1 } });
    const input = (result: Awaited<ReturnType<typeof collectClaude>>) => result.summaries.flatMap((summary) => Object.values(summary.days)).reduce((sum, day) => sum + day.tokens.input, 0);
    // 이름, 원래 내용, 열기 직전에 바꿀 내용, 그때의 수정 시각
    const cases: Array<[string, string, string, number]> = [
      ["크기가 줄어듦", `${a}\n${b}\n`, `${a}\n`, FILE_TIME],
      ["같은 크기로 내용과 수정 시각이 바뀜", `${a}\n`, `${b}\n`, FILE_TIME + 10_000],
    ];
    for (const [name, original, changed, changedTime] of cases) {
      rmSync(join(root, ".claude"), { recursive: true, force: true });
      rmSync(join(root, "state"), { recursive: true, force: true });
      const path = join(root, ".claude", "projects", "p", "s1.jsonl");
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, original);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      const real = linesModule.readLines;
      let reads = 0;
      // 열쇠를 만든 뒤 줄 읽기가 열기 직전에 바꾸고, 읽은 뒤 원래 바이트와 수정 시각으로 되돌린다
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation(async (file, nowMs, sink, readOptions) => {
        if (file !== path || ++reads !== 1) return real(file, nowMs, sink, readOptions);
        await writeFile(file, changed);
        await utimes(file, changedTime / 1000, changedTime / 1000);
        const outcome = await real(file, nowMs, sink, readOptions);
        await writeFile(file, original);
        await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
        return outcome;
      });
      const cacheDir = join(root, "state", "cache");
      try {
        await collectClaude(options({ cacheDir }));
      } finally {
        spy.mockRestore();
      }
      expect(reads, name).toBe(1);
      const next = await collectClaude(options({ cacheDir }));
      const plain = await collectClaude(options());
      expect(JSON.stringify(next.summaries), name).toBe(JSON.stringify(plain.summaries));
      expect(input(next), name).toBe(Buffer.byteLength(original) === Buffer.byteLength(`${a}\n`) ? 10 : 30);
    }
  });
  it("날짜가 하루 지나도, 같은 시계로 캐시를 쓴 결과와 캐시 없이 읽은 결과가 같다", async () => {
    await session("p", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    await collectClaude(options({ cacheDir }));
    const tomorrow = { nowMs: NOW + 24 * 3600 * 1000, timeZone: "Asia/Seoul" };
    const cached = await collectClaude(options({ cacheDir, clock: tomorrow }));
    const fresh = await collectClaude(options({ clock: tomorrow }));
    expect(cached.read.fromCache).toBe(1);
    expect(JSON.stringify(cached.summaries)).toBe(JSON.stringify(fresh.summaries));
  });
  it("수정 시각이 평가 시각에서 2초 안쪽인 파일은 쓰되 캐시에 넣지 않는다", async () => {
    await session("p", "s1", sampleLines("a"), NOW - 1000);
    const cacheDir = join(root, "state", "cache");
    const first = await collectClaude(options({ cacheDir }));
    const second = await collectClaude(options({ cacheDir }));
    expect(first.read.inProgress).toBe(1);
    // 쓰는 중이어도 연 크기까지 다 읽었으면 읽지 못한 파일이 아니다
    expect(first.read.unreadableFiles).toEqual([]);
    expect(claudeObservation(first.summaries, unreadableCount(first.read), "mcp").complete).toBe(true);
    expect(second.read.fromCache).toBe(0);
    expect(second.summaries).toHaveLength(1);
  });
  it("목록을 본 뒤 커졌거나 수정 시각이 바뀐 파일도 읽는 동안 줄어 덜 읽었으면 읽지 못한 파일이고, 목록을 본 뒤 줄었어도 연 크기까지 다 읽었으면 읽지 못한 파일이 아니다", async () => {
    const lines = sampleLines("a");
    const first = `${lines.join("\n")}\n`;
    const more = `${assistant({ id: "a-2", at: "2026-11-11T01:00:09Z", usage: { input: 3, output: 4 } })}\n`;
    const home = claudeHome({}, root);
    const realReadLines = linesModule.readLines;
    // 이름, 목록을 본 뒤 열기 전에 바꾸기, 연 직후 앞 사용자 줄 끝까지 줄여 덜 읽게 하는지
    const cases: Array<[string, (path: string) => Promise<void>, boolean]> = [
      ["목록 뒤 커짐", async (path) => {
        await appendFile(path, more);
        await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      }, true],
      ["목록 뒤 수정 시각 바뀜", (path) => utimes(path, (FILE_TIME + 10_000) / 1000, (FILE_TIME + 10_000) / 1000), true],
      ["목록 뒤 줄어듦", async (path) => {
        await truncate(path, Buffer.byteLength(`${lines[0]}\n`));
        await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      }, false],
    ];
    for (const [name, change, cut] of cases) {
      rmSync(join(root, ".claude"), { recursive: true, force: true });
      const path = await session("p", "s1", lines);
      const list = await listClaudeFiles(home, null);
      await change(path);
      let opened = false;
      const shrink = async (): Promise<void> => {
        opened = true;
        await truncate(path, Buffer.byteLength(`${lines[0]}\n`));
        await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      };
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realReadLines(file, nowMs, sink, file === path && cut ? { ...readOptions, afterOpen: shrink } : readOptions));
      let result: Awaited<ReturnType<typeof collectFromList>>;
      try {
        result = await collectFromList(home, list, options());
      } finally {
        spy.mockRestore();
      }
      expect(opened, name).toBe(cut);
      if (cut) expect(result.read.inProgress, name).toBe(1);
      expect(result.read.unreadableFiles, name).toEqual(cut ? [path] : []);
      expect(result.read.unreadableFileBytes, name).toBe(cut ? Buffer.byteLength(first) : 0);
      expect(claudeObservation(result.summaries, unreadableCount(result.read), "mcp").complete, name).toBe(!cut);
    }
  });
  it("읽는 동안 줄어 덜 읽은 파일은 끝이 줄바꿈 없는 완전한 줄이거나, 깨진 줄이 몇 개 있거나, 절반 넘게 깨졌어도 읽지 못한 파일 하나로 한 번만 세고, 그때까지 읽은 숫자는 쓴다", async () => {
    const a = assistant({ id: "a-1", at: "2026-11-11T01:00:01Z", usage: { input: 1, output: 1 } });
    const b = assistant({ id: "a-2", at: "2026-11-11T01:00:02Z", usage: { input: 2, output: 1 } });
    const c = assistant({ id: "a-3", at: "2026-11-11T01:00:03Z", usage: { input: 3, output: 1 } });
    const broken = "{broken";
    const realReadLines = linesModule.readLines;
    // 이름, 파일 내용, 연 직후 남길 앞부분, 그때까지 읽은 응답 수(끝 조각도 완전한 줄이면 센다)
    const cases: Array<[string, string, string, number]> = [
      ["끝이 줄바꿈 없는 완전한 줄", `${a}\n${b}\n${c}\n`, `${a}\n${b}`, 2],
      ["끝이 잘린 줄", `${a}\n${b}\n${c}\n`, `${a}\n${b.slice(0, -1)}`, 1],
      ["깨진 줄이 하나", `${a}\n${b}\n${broken}\n${c}\n`, `${a}\n${b}\n${broken}\n`, 2],
      ["절반 넘게 깨짐", `${broken}\n${broken}\n${a}\n`, `${broken}\n${broken}\n`, 0],
    ];
    for (const [name, text, keep, count] of cases) {
      rmSync(join(root, ".claude"), { recursive: true, force: true });
      const dir = join(root, ".claude", "projects", "p");
      await mkdir(dir, { recursive: true });
      const path = join(dir, "s1.jsonl");
      await writeFile(path, text);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      let cut = false;
      const shrink = async (): Promise<void> => {
        cut = true;
        await truncate(path, Buffer.byteLength(keep));
        await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      };
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realReadLines(file, nowMs, sink, file === path && !cut ? { ...readOptions, afterOpen: shrink } : readOptions));
      let result: Awaited<ReturnType<typeof collectClaude>>;
      try {
        result = await collectClaude(options());
      } finally {
        spy.mockRestore();
      }
      expect(cut, name).toBe(true);
      // 읽지 못한 것과 쓰는 중은 따로 센다
      expect(result.read, name).toMatchObject({ unreadableFiles: [path], unreadableFileBytes: Buffer.byteLength(text), listedBytes: Buffer.byteLength(text), bytes: Buffer.byteLength(keep), inProgress: 1 });
      if (name === "끝이 잘린 줄") expect(result.summaries[0]!.missing.tailFragments, name).toBe(1);
      expect(result.summaries.flatMap((summary) => Object.values(summary.days)).reduce((sum, day) => sum + day.responses, 0), name).toBe(count);
      expect(claudeObservation(result.summaries, unreadableCount(result.read), "mcp").complete, name).toBe(false);
    }
  });
  it("읽는 동안 줄어 덜 읽은 파일은 하위 세션이어도, 너무 긴 줄이 있어도 읽지 못한 파일이다(너무 긴 줄과 덜 읽음은 따로 안다)", async () => {
    const a = assistant({ id: "a-1", at: "2026-11-11T01:00:01Z", usage: { input: 1, output: 1 } });
    const b = assistant({ id: "a-2", at: "2026-11-11T01:00:02Z", usage: { input: 2, output: 1 } });
    const long = `{"x":"${"x".repeat(5000)}"}`;
    // 이름, 프로젝트 폴더 아래 경로, 파일 내용, 연 직후 남길 앞부분, 너무 긴 줄의 상한, 세션 종류
    const cases: Array<[string, string[], string, string, number | undefined, string]> = [
      ["하위 세션", ["parent", "subagents", "agent-1.jsonl"], `${a}\n${b}\n`, `${a}\n`, undefined, "sub"],
      ["너무 긴 줄", ["s1.jsonl"], `${a}\n${long}\n${b}\n`, `${a}\n${long}\n`, 2000, "main"],
    ];
    const realReadLines = linesModule.readLines;
    for (const [name, parts, text, keep, maxLineBytes, kind] of cases) {
      rmSync(join(root, ".claude"), { recursive: true, force: true });
      const path = join(root, ".claude", "projects", "p", ...parts);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, text);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      let cut = false;
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) =>
        realReadLines(file, nowMs, sink, {
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
      let result: Awaited<ReturnType<typeof collectClaude>>;
      try {
        result = await collectClaude(options());
      } finally {
        spy.mockRestore();
      }
      expect(cut, name).toBe(true);
      expect(result.summaries[0]!.kind, name).toBe(kind);
      if (maxLineBytes !== undefined) expect(result.summaries[0]!.missing.tooLongLines, name).toBe(1);
      expect(result.read, name).toMatchObject({ unreadableFiles: [path], inProgress: 1 });
    }
  });
  it("읽는 동안 줄어 덜 읽은 파일이 여럿이면 읽지 못한 바이트는 그 파일들의 크기를, 읽은 바이트는 실제로 읽은 양을 더한다", async () => {
    const a = assistant({ id: "a-1", at: "2026-11-11T01:00:01Z", usage: { input: 1, output: 1 } });
    const b = assistant({ id: "a-2", at: "2026-11-11T01:00:02Z", usage: { input: 2, output: 1 } });
    const c = assistant({ id: "a-3", at: "2026-11-11T01:00:03Z", usage: { input: 3, output: 1 } });
    // 파일마다 내용과 연 직후 남길 앞부분(크기가 서로 다르다)
    const files: Array<[string, string, string]> = [
      ["s1", `${a}\n${b}\n`, `${a}\n`],
      ["s2", `${a}\n${b}\n${c}\n`, `${a}\n${b}\n`],
    ];
    const keepOf = new Map<string, string>();
    for (const [id, text, keep] of files) {
      const dir = join(root, ".claude", "projects", "p");
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${id}.jsonl`);
      await writeFile(path, text);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      keepOf.set(path, keep);
    }
    const realReadLines = linesModule.readLines;
    const cut = new Set<string>();
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => {
      const keep = keepOf.get(file);
      if (keep === undefined || cut.has(file)) return realReadLines(file, nowMs, sink, readOptions);
      return realReadLines(file, nowMs, sink, {
        ...readOptions,
        afterOpen: async () => {
          cut.add(file);
          await truncate(file, Buffer.byteLength(keep));
          await utimes(file, FILE_TIME / 1000, FILE_TIME / 1000);
        },
      });
    });
    let result: Awaited<ReturnType<typeof collectClaude>>;
    try {
      result = await collectClaude(options());
    } finally {
      spy.mockRestore();
    }
    expect(cut.size).toBe(2);
    expect(result.read).toMatchObject({
      inProgress: 2,
      unreadableFiles: [...keepOf.keys()],
      unreadableFileBytes: files.reduce((sum, [, text]) => sum + Buffer.byteLength(text), 0),
      bytes: files.reduce((sum, [, , keep]) => sum + Buffer.byteLength(keep), 0),
    });
  });
  it("목록에서 크기나 수정 시각을 보지 못한 파일과 읽다가 덜 읽은 파일을 합친 읽지 못한 파일은 전체 경로 차례로 낸다", async () => {
    const first = await session("p", "a", sampleLines("a"));
    const last = await session("p", "z", sampleLines("z"));
    const home = claudeHome({}, root);
    const listed = await listClaudeFiles(home, null);
    // z 파일은 목록에서 크기나 수정 시각을 보지 못한 것으로 넘긴다
    const list = { ...listed, files: listed.files.filter((file) => file.path !== last), unreadableFiles: [last] };
    const realReadLines = linesModule.readLines;
    let cut = false;
    const shrink = async (): Promise<void> => {
      cut = true;
      await truncate(first, 0);
      await utimes(first, FILE_TIME / 1000, FILE_TIME / 1000);
    };
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realReadLines(file, nowMs, sink, file === first && !cut ? { ...readOptions, afterOpen: shrink } : readOptions));
    let result: Awaited<ReturnType<typeof collectFromList>>;
    try {
      result = await collectFromList(home, list, options());
    } finally {
      spy.mockRestore();
    }
    expect(cut).toBe(true);
    expect(result.read.unreadableFiles).toEqual([first, last]);
  });
  it("수정 시각이 평가 시각에서 2초 안쪽이거나 평가 시각보다 뒤여도, 읽는 동안 줄어 덜 읽은 파일은 읽지 못한 파일이다(쓰는 중과 덜 읽음은 따로 안다)", async () => {
    const lines = sampleLines("a");
    const body = `${lines.join("\n")}\n`;
    const realReadLines = linesModule.readLines;
    // 이름, 파일의 수정 시각
    const times: Array<[string, number]> = [["1초 전", NOW - 1000], ["평가 시각보다 1초 뒤", NOW + 1000]];
    for (const [name, mtime] of times) {
      rmSync(join(root, ".claude"), { recursive: true, force: true });
      const path = await session("p", "s1", lines, mtime);
      let cut = false;
      // 연 직후 앞 사용자 줄 끝까지 줄인 채 둔다
      const shrink = async (): Promise<void> => {
        cut = true;
        await truncate(path, Buffer.byteLength(`${lines[0]}\n`));
        await utimes(path, mtime / 1000, mtime / 1000);
      };
      const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realReadLines(file, nowMs, sink, file === path && !cut ? { ...readOptions, afterOpen: shrink } : readOptions));
      let result: Awaited<ReturnType<typeof collectClaude>>;
      try {
        result = await collectClaude(options());
      } finally {
        spy.mockRestore();
      }
      expect(cut, name).toBe(true);
      expect(result.read.inProgress, name).toBe(1);
      expect(result.read.unreadableFiles, name).toEqual([path]);
      expect(result.read.unreadableFileBytes, name).toBe(Buffer.byteLength(body));
      expect(claudeObservation(result.summaries, unreadableCount(result.read), "mcp").complete, name).toBe(false);
    }
  });
  it("연 뒤에 덧붙은 파일은 연 크기까지 다 읽었으니 쓰는 중일 뿐, 읽지 못한 파일이 아니고 관측도 빠짐없다(덧붙은 것은 다음 모으기에서 읽는다)", async () => {
    const path = await session("p", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    const realReadLines = linesModule.readLines;
    let appended = false;
    // 파일을 연 직후 뒤에 덧붙이고 수정 시각을 되돌린다(읽은 뒤의 크기가 연 크기보다 크다)
    const grow = async (): Promise<void> => {
      appended = true;
      await appendFile(path, `${assistant({ id: "a-2", at: "2026-11-11T01:00:09Z", usage: { input: 3, output: 4 } })}\n`);
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    };
    const spy = vi.spyOn(linesModule, "readLines").mockImplementation((file, nowMs, sink, readOptions) => realReadLines(file, nowMs, sink, file === path && !appended ? { ...readOptions, afterOpen: grow } : readOptions));
    let grown: Awaited<ReturnType<typeof collectClaude>>;
    try {
      grown = await collectClaude(options({ cacheDir }));
    } finally {
      spy.mockRestore();
    }
    expect(appended).toBe(true);
    expect(grown.read.inProgress).toBe(1);
    expect(grown.read.unreadableFiles).toEqual([]);
    expect(claudeObservation(grown.summaries, unreadableCount(grown.read), "mcp").complete).toBe(true);
    const again = await collectClaude(options({ cacheDir }));
    expect(again.read).toMatchObject({ fromCache: 0, inProgress: 0, unreadableFiles: [] });
    expect(JSON.stringify(again.summaries)).toBe(JSON.stringify((await collectClaude(options())).summaries));
    expect(JSON.stringify(again.summaries)).not.toBe(JSON.stringify(grown.summaries));
  });
  it("목록을 얻은 뒤 덧쓴 파일은 캐시를 꺼내지 않아 캐시를 켜고 끈 결과가 같다(쓰는 동안 수정 시각이 머물러도 크기로 안다)", async () => {
    const path = await session("p", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    const before = await collectClaude(options({ cacheDir }));
    const home = claudeHome({}, root);
    const list = await listClaudeFiles(home, null);
    await appendFile(path, `${assistant({ id: "a-2", at: "2026-11-11T01:00:09Z", usage: { input: 3, output: 4 } })}\n`);
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    const cached = await collectFromList(home, list, options({ cacheDir }));
    const plain = await collectFromList(home, list, options());
    expect(cached.read.fromCache).toBe(0);
    // 목록과 다른 크기로 열었어도 연 크기까지 다 읽었으니 읽지 못한 파일이 아니다
    expect(cached.read.unreadableFiles).toEqual([]);
    expect(plain.read.unreadableFiles).toEqual([]);
    expect(JSON.stringify(plain.summaries)).not.toBe(JSON.stringify(before.summaries));
    expect(JSON.stringify(cached.summaries)).toBe(JSON.stringify(plain.summaries));
  });
  it("해석하는 사이 같은 크기와 수정 시각으로 바뀐 내용은 예전 열쇠로 캐시에 넣지 않는다(넣기 직전에 열쇠를 다시 만든다)", async () => {
    const pad = JSON.stringify({ type: "padding", timestamp: "2026-11-11T01:00:00Z", text: "x".repeat(1_200_000) });
    const linesOf = (n: number) => [user({ at: "2026-11-11T01:00:00Z", content: "hi", origin: "human" }), pad, assistant({ id: "a1", at: "2026-11-11T01:00:05Z", usage: { input: n, output: 1 } })];
    const contentOf = (n: number) => `${linesOf(n).join("\n")}\n`;
    expect(contentOf(10).length).toBe(contentOf(20).length);
    const path = await session("p", "s1", linesOf(10));
    const input = (result: Awaited<ReturnType<typeof collectClaude>>) => result.summaries.reduce((sum, summary) => sum + Object.values(summary.days).reduce((acc, day) => acc + day.tokens.input, 0), 0);
    const cacheDir = join(root, "state", "cache");
    const parse = ClaudeSessionParser.prototype.line;
    let changed = false;
    // 첫 줄을 해석할 때 같은 크기의 다른 내용으로 바꾸고 수정 시각을 되돌린다. 뒤쪽 응답은 바뀐 내용에서 읽힌다
    const spy = vi.spyOn(ClaudeSessionParser.prototype, "line").mockImplementation(function (this: ClaudeSessionParser, ...args: Parameters<ClaudeSessionParser["line"]>) {
      if (!changed) {
        changed = true;
        writeFileSync(path, contentOf(20));
        utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
      }
      return parse.apply(this, args);
    });
    let first: Awaited<ReturnType<typeof collectClaude>>;
    try {
      first = await collectClaude(options({ cacheDir }));
    } finally {
      spy.mockRestore();
    }
    expect(changed).toBe(true);
    expect(input(first)).toBe(20);
    await writeFile(path, contentOf(10));
    await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
    const cached = await collectClaude(options({ cacheDir }));
    const plain = await collectClaude(options());
    expect(input(plain)).toBe(10);
    expect(JSON.stringify(cached.summaries)).toBe(JSON.stringify(plain.summaries));
  });
  for (const [name, rescan, removeAfterRead] of [["--rescan으로 다시 읽을 때", true, false], ["재확인 때 파일이 없어졌을 때", false, true]] as const) {
    it(`넣기 직전 재확인은 ${name}도 해석한 내용과 다른 열쇠로 넣지 않는다`, async () => {
      const filler = JSON.stringify({ type: "padding", timestamp: "2026-11-11T01:00:00Z", text: "x".repeat(10_000) });
      const linesOf = (n: number) => [user({ at: "2026-11-11T01:00:00Z", content: "hi", origin: "human" }), filler, assistant({ id: "a1", at: "2026-11-11T01:00:05Z", usage: { input: n, output: 1 } })];
      const contentOf = (n: number) => `${linesOf(n).join("\n")}\n`;
      expect(contentOf(10).length).toBe(contentOf(20).length);
      const path = await session("p", "s1", linesOf(10));
      const input = (result: Awaited<ReturnType<typeof collectClaude>>) => result.summaries.reduce((sum, summary) => sum + Object.values(summary.days).reduce((acc, day) => acc + day.tokens.input, 0), 0);
      const cacheDir = join(root, "state", "cache");
      const probe = await open(path, "r");
      const proto: { read(...args: unknown[]): Promise<unknown> } = Object.getPrototypeOf(probe);
      await probe.close();
      const read = proto.read;
      let reads = 0;
      // 캐시 열쇠가 앞뒤 지문을 다 읽은 직후에 같은 크기의 B로 바꾸고 수정 시각을 되돌려, 해석은 B를 읽게 한다
      const readSpy = vi.spyOn(proto, "read").mockImplementation(async function (this: unknown, ...args: unknown[]) {
        const result = await read.apply(this, args);
        if (++reads === 2) {
          writeFileSync(path, contentOf(20));
          utimesSync(path, FILE_TIME / 1000, FILE_TIME / 1000);
        }
        return result;
      });
      const finish = ClaudeSessionParser.prototype.finish;
      const finishSpy = vi.spyOn(ClaudeSessionParser.prototype, "finish").mockImplementation(function (this: ClaudeSessionParser, ...args: Parameters<ClaudeSessionParser["finish"]>) {
        const summary = finish.apply(this, args);
        if (removeAfterRead) rmSync(path);
        return summary;
      });
      try {
        expect(input(await collectClaude(options({ cacheDir, rescan })))).toBe(20);
      } finally {
        readSpy.mockRestore();
        finishSpy.mockRestore();
      }
      await writeFile(path, contentOf(10));
      await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
      const cached = await collectClaude(options({ cacheDir }));
      const plain = await collectClaude(options());
      expect(input(plain)).toBe(10);
      expect(JSON.stringify(cached.summaries)).toBe(JSON.stringify(plain.summaries));
    });
  }
  it("수집 구간보다 오래된 파일이 있으면 수집 구간 전체를 볼 수 있다. 없으면 가장 이른 기록의 날짜부터다", async () => {
    await session("p", "s1", sampleLines("a"));
    const without = await collectClaude(options());
    expect(without.visibleFrom).toBe("2026-11-11");
    await session("p", "old", sampleLines("o"), Date.parse("2026-01-01T00:00:00Z"));
    const withOld = await collectClaude(options());
    expect(withOld.read.olderThanWindow).toBe(1);
    expect(withOld.visibleFrom).toBe("2026-10-09");
  });
  it("rescan은 수정 시각으로 거르지 않는다", async () => {
    await session("p", "s1", sampleLines("a"));
    await session("p", "old", sampleLines("o"), Date.parse("2026-01-01T00:00:00Z"));
    const result = await collectClaude(options({ rescan: true }));
    expect(result.summaries.map((s) => s.sessionId)).toEqual(["old", "s1"]);
  });
  it("같은 응답이 다른 세션 파일에 복사돼 있으면 겹친 세션 수를 센다", async () => {
    await session("p", "s1", sampleLines("same"));
    await session("p", "s2", sampleLines("same"));
    await session("p", "s3", sampleLines("other"));
    const result = await collectClaude(options());
    expect(result.overlappingSessions).toBe(2);
  });
  it("절반 넘게 깨진 파일은 읽지 못한 파일로 세고, 캐시를 써도 같다", async () => {
    await session("p", "bad", ["{broken", "{broken", ...sampleLines("x").slice(0, 1)]);
    await session("p", "good", sampleLines("g"));
    const cacheDir = join(root, "state", "cache");
    const first = await collectClaude(options({ cacheDir }));
    const second = await collectClaude(options({ cacheDir }));
    for (const result of [first, second]) {
      expect(result.read.unreadableFiles.map((path) => path.endsWith("bad.jsonl"))).toEqual([true]);
      expect(result.read.unreadableFileBytes).toBeGreaterThan(0);
      expect(result.read.listedBytes).toBeGreaterThan(result.read.unreadableFileBytes);
      expect(result.read.unreadableFiles.length).toBeLessThanOrEqual(result.read.files);
      expect(claudeObservation(result.summaries, unreadableCount(result.read), "skill").complete).toBe(false);
    }
    expect(second.read.fromCache).toBe(2);
  });
  it("projects를 읽지 못하면 찾았지만 읽지 못한 것으로 내고 관측은 미확인이다", async () => {
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "projects"), "not a folder");
    const result = await collectClaude(options());
    expect(result.detected).toBe(true);
    expect(result.read.unreadableDirs).toEqual([join(root, ".claude", "projects")]);
    expect(result.read.unreadableFiles).toEqual([]);
    expect(claudeObservation(result.summaries, unreadableCount(result.read), "mcp").complete).toBe(false);
  });
  it("읽지 못한 폴더는 파일과 따로 넘겨, 파일 수 기준 비율이 1을 넘지 않는다", async () => {
    await session("good", "s1", sampleLines("a"));
    for (const project of ["bad-1", "bad-2"]) {
      await mkdir(join(root, ".claude", "projects", project, "s9"), { recursive: true });
      await writeFile(join(root, ".claude", "projects", project, "s9", "subagents"), "not a folder");
    }
    const result = await collectClaude(options());
    expect(result.read.files).toBe(1);
    expect(result.read.unreadableFiles).toEqual([]);
    expect(result.read.unreadableDirs).toHaveLength(2);
    expect(result.read.unreadableFiles.length / result.read.files).toBe(0);
    expect(claudeObservation(result.summaries, unreadableCount(result.read), "skill").complete).toBe(false);
  });
  it("볼 수 있는 날짜 범위는 세지 않는 종류의 줄 날짜도 본다", async () => {
    await session("p", "s1", ['{"type":"api-request","timestamp":"2026-10-20T05:00:00Z"}', ...sampleLines("a")]);
    const result = await collectClaude(options());
    expect(result.visibleFrom).toBe("2026-10-20");
  });
  it("요약의 차례를 섞어도 볼 수 있는 날짜 범위와 겹친 세션 수가 같다", async () => {
    await session("p", "s1", sampleLines("same"));
    await session("p", "s2", sampleLines("same"));
    await session("q", "s3", ['{"type":"api-request","timestamp":"2026-10-25T05:00:00Z"}', ...sampleLines("other")]);
    const result = await collectClaude(options());
    const reversed = [...result.summaries].reverse();
    const rotated = [...result.summaries.slice(1), result.summaries[0]!];
    for (const order of [reversed, rotated]) {
      expect(visibleFrom(order, 0, "2026-10-09")).toBe(result.visibleFrom);
      expect(overlappingSessions(order)).toBe(result.overlappingSessions);
    }
    expect(result.overlappingSessions).toBe(2);
  });
  it("수집 구간 밖의 줄에 더 높은 버전이 있으면 그것이 세션 버전이고, 캐시를 써도 같다", async () => {
    await session("p", "s1", [assistant({ id: "old", at: "2026-09-01T00:00:00Z", version: "2.1.300" }), ...sampleLines("a").map((line) => line.replace('"2.1.300"', '"2.1.99"'))]);
    const cacheDir = join(root, "state", "cache");
    const plain = await collectClaude(options());
    await collectClaude(options({ cacheDir }));
    const cached = await collectClaude(options({ cacheDir }));
    expect(plain.summaries[0]!.version).toBe("2.1.300");
    expect(cached.read.fromCache).toBe(1);
    expect(JSON.stringify(cached.summaries)).toBe(JSON.stringify(plain.summaries));
  });
  it("모양이 깨진 캐시는 다시 읽어 캐시 없이 읽은 결과와 같다", async () => {
    await session("p", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    await collectClaude(options({ cacheDir }));
    const folder = join(cacheDir, "claude-code");
    const [name] = await readdir(folder);
    const entry = JSON.parse(await readFile(join(folder, name!), "utf8")) as Record<string, unknown>;
    await writeFile(join(folder, name!), JSON.stringify({ ...entry, summary: {} }));
    const again = await collectClaude(options({ cacheDir }));
    const plain = await collectClaude(options());
    expect(again.read.fromCache).toBe(0);
    expect(JSON.stringify(again.summaries)).toBe(JSON.stringify(plain.summaries));
  });
  it("캐시의 읽은 바이트나 개수 칸이 성립하지 않는 수면 다시 읽어 캐시 없이 읽은 결과와 같다(음수 바이트, 음수 응답)", async () => {
    await session("p", "s1", sampleLines("a"));
    const cacheDir = join(root, "state", "cache");
    await collectClaude(options({ cacheDir }));
    const folder = join(cacheDir, "claude-code");
    const [name] = await readdir(folder);
    const file = join(folder, name!);
    const entry = JSON.parse(await readFile(file, "utf8")) as { bytesRead: number; summary: Record<string, any> };
    const plain = await collectClaude(options());
    const date = Object.keys(entry.summary.days)[0]!;
    const broken = [
      { ...entry, bytesRead: -1 },
      { ...entry, summary: { ...entry.summary, days: { ...entry.summary.days, [date]: { ...entry.summary.days[date], responses: -1 } } } },
    ];
    for (const [index, value] of broken.entries()) {
      await writeFile(file, JSON.stringify(value));
      const again = await collectClaude(options({ cacheDir }));
      expect(again.read.fromCache, `${index}`).toBe(0);
      expect(again.read.bytes, `${index}`).toBe(plain.read.bytes);
      expect(JSON.stringify(again.summaries), `${index}`).toBe(JSON.stringify(plain.summaries));
    }
  });
  it("크기를 보지 못한 파일은 파일 수 분모와 읽지 못한 파일에 넣고, 바이트에는 넣지 않으며, 관측은 미확인이다", async () => {
    for (const id of ["s1", "s2", "s3"]) await session("p", id, sampleLines(id));
    const home = claudeHome({}, root);
    const list = await listClaudeFiles(home, null);
    const unknown = join(home, "projects", "p", "s4.jsonl");
    const result = await collectFromList(home, { ...list, unreadableFiles: [unknown] }, options());
    expect(result.read.files).toBe(4);
    expect(result.read.unreadableFiles).toEqual([unknown]);
    expect(result.read.unknownSizeFiles).toBe(1);
    expect(result.read.unreadableFileBytes).toBe(0);
    expect(result.read.unreadableDirs).toEqual([]);
    expect(result.read.listedBytes).toBe(list.files.reduce((sum, file) => sum + file.size, 0));
    expect(result.read.unreadableFiles.length / result.read.files).toBe(0.25);
    expect(claudeObservation(result.summaries, unreadableCount(result.read), "mcp").complete).toBe(false);
  });
  it("훅의 오류 글은 실제 캐시 파일에도 남지 않는다", async () => {
    const secret = "unique-hook-cache-text-9b2c";
    await session("p", "s1", [
      ...sampleLines("a"),
      attachment("2026-11-11T01:00:06Z", { type: "hook_blocking_error", hookEvent: "PreToolUse", blockingError: { blockingError: `denied ${secret}`, command: "x" } }),
    ]);
    const cacheDir = join(root, "state", "cache");
    const result = await collectClaude(options({ cacheDir }));
    expect(result.summaries[0]!.days["2026-11-11"]!.hooks).toEqual({ PreToolUse: { runs: 0, failures: 0, unclassifiedBlocks: 1 } });
    const folder = join(cacheDir, "claude-code");
    const names = await readdir(folder);
    expect(names.length).toBe(1);
    for (const name of names) expect(await readFile(join(folder, name), "utf8")).not.toContain(secret);
  });
  it("파일 목록의 차례가 달라도 요약·관측·버전·읽은 양이 같다", async () => {
    await session("p-b", "s2", sampleLines("b"));
    await session("p-a", "s1", sampleLines("a"));
    await session("p-c", "s3", ['{"type":"api-request","timestamp":"2026-10-25T05:00:00Z"}', ...sampleLines("c")]);
    const home = claudeHome({}, root);
    const list = await listClaudeFiles(home, null);
    const normal = await collectFromList(home, list, options());
    const reversed = await collectFromList(home, { ...list, files: [...list.files].reverse() }, options());
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(normal));
    expect(normal.summaries.map((s) => s.sessionId)).toEqual(["s1", "s2", "s3"]);
  });
  it("다른 작업 폴더에서 연 다음 세션의 처음 목록에 앞 세션의 스킬이 없어도 세션 안에서 다시 실린 것으로 적지 않는다", async () => {
    await session("p-1", "s1", [
      attachment("2026-11-11T00:00:00Z", { type: "skill_listing", isInitial: true, names: ["review"] }),
      ...sampleLines("a").map((line) => line.replace('"C:/work/proj"', '"C:/work/one"')),
    ]);
    await session("p-2", "s2", [
      attachment("2026-11-11T02:00:00Z", { type: "skill_listing", isInitial: true, names: [] }),
      ...sampleLines("b").map((line) => line.replace('"C:/work/proj"', '"C:/work/two"')),
    ]);
    const result = await collectClaude(options());
    const [one, two] = result.summaries;
    expect(one!.cwd).toBe("C:/work/one");
    expect(two!.cwd).toBe("C:/work/two");
    expect(one!.initialSkills).toEqual(["review"]);
    expect(two!.initialSkills).toEqual([]);
    for (const day of Object.values(two!.days)) expect(day.reloadedSkills).toEqual([]);
  });
  it("기록 폴더가 없으면 찾지 못한 것이고 요약이 비어 있다", async () => {
    const result = await collectClaude(options());
    expect(result.detected).toBe(false);
    expect(result.summaries).toEqual([]);
    expect(result.visibleFrom).toBeNull();
  });
});
