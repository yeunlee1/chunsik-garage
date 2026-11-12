// Claude Code 기록 모으기(캐시를 켜고 끈 결과의 같음, 날짜가 바뀐 경우, 진행 중인 파일, 볼 수 있는 날짜 범위, 겹친 응답)를 시험한다(설계 9.4, 9.8, 21.1 반례)
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeObservation } from "../../src/adapters/claude/observation.ts";
import { claudeHome, listClaudeFiles } from "../../src/adapters/claude/locate.ts";
import { collectClaude, collectFromList, overlappingSessions, unreadableCount, visibleFrom, type CollectOptions } from "../../src/collect/claude.ts";
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
    expect(second.read.fromCache).toBe(0);
    expect(second.summaries).toHaveLength(1);
  });
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
