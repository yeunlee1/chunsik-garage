// Claude Code 기록 폴더 찾기와 세션 파일 목록(주 세션·하위 세션·수정 시각 거르기·경로 차례)을 시험한다(설계 9.1, 9.2)
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 파일 하나의 stat만 실패하게 하려고 stat을 감싼다. 평소에는 실제 stat을 그대로 부른다.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, stat: vi.fn(actual.stat) };
});
import { claudeHome, listClaudeFiles, normalizePath } from "../../../src/adapters/claude/locate.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 로케이트 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const OLD = Date.parse("2026-01-01T00:00:00Z");
const NEW = Date.parse("2026-11-10T00:00:00Z");

async function touch(path: string, mtimeMs: number): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "{}\n");
  await utimes(path, mtimeMs / 1000, mtimeMs / 1000);
}

describe("claudeHome", () => {
  it("CLAUDE_CONFIG_DIR가 있으면 그 폴더, 없으면 홈의 .claude", () => {
    expect(claudeHome({ CLAUDE_CONFIG_DIR: join(root, "custom") }, "/h")).toBe(join(root, "custom"));
    expect(claudeHome({}, root)).toBe(join(root, ".claude"));
  });
});

describe("normalizePath", () => {
  it("Windows에서는 소문자와 / 구분으로 맞춘다", () => {
    expect(normalizePath("C:\\Work\\A.jsonl", "win32")).toBe(normalizePath("c:/work/a.jsonl", "win32"));
  });
});

describe("listClaudeFiles", () => {
  it("주 세션과 하위 세션을 찾고 경로 차례로 낸다. 프로젝트 폴더 밖의 파일은 보지 않는다", async () => {
    const projects = join(root, "projects");
    await touch(join(projects, "z-proj", "s2.jsonl"), NEW);
    await touch(join(projects, "a-proj", "s1.jsonl"), NEW);
    await touch(join(projects, "a-proj", "s1", "subagents", "agent-x.jsonl"), NEW);
    await touch(join(projects, "한글 프로젝트", "s3.jsonl"), NEW);
    await writeFile(join(projects, "notes.txt"), "x");
    const list = await listClaudeFiles(root, null);
    expect(list.projectsFound).toBe(true);
    expect(list.unreadableDirs).toEqual([]);
    expect(list.unreadableFiles).toEqual([]);
    const paths = list.files.map((f) => f.normPath);
    expect(paths).toEqual([...paths].sort());
    expect(list.files).toHaveLength(4);
    const byId = Object.fromEntries(list.files.map((f) => [f.sessionId, f]));
    expect(byId["s1"]!.kind).toBe("main");
    expect(byId["agent-x"]!.kind).toBe("sub");
    expect(byId["agent-x"]!.parentSessionId).toBe("s1");
    expect(byId["s3"]).toBeDefined();
  });
  it("수정 시각이 아래 경계보다 앞선 파일은 열지 않고 센다", async () => {
    const projects = join(root, "projects");
    await touch(join(projects, "p", "old.jsonl"), OLD);
    await touch(join(projects, "p", "new.jsonl"), NEW);
    const list = await listClaudeFiles(root, Date.parse("2026-10-01T00:00:00Z"));
    expect(list.files.map((f) => f.sessionId)).toEqual(["new"]);
    expect(list.olderThanWindow).toBe(1);
  });
  it("projects를 읽지 못하면(폴더가 아니면) 찾았지만 읽지 못한 폴더로 낸다", async () => {
    await writeFile(join(root, "projects"), "not a folder");
    const list = await listClaudeFiles(root, null);
    expect(list.projectsFound).toBe(true);
    expect(list.files).toEqual([]);
    expect(list.unreadableDirs).toEqual([join(root, "projects")]);
    expect(list.unreadableFiles).toEqual([]);
  });
  it("subagents 자리가 폴더가 아니면 읽지 못한 폴더이고, 없으면 아무것도 아니다", async () => {
    const projects = join(root, "projects");
    await touch(join(projects, "p", "s1.jsonl"), NEW);
    await mkdir(join(projects, "p", "s1"), { recursive: true });
    await writeFile(join(projects, "p", "s1", "subagents"), "not a folder");
    await mkdir(join(projects, "p", "s2"), { recursive: true });
    const list = await listClaudeFiles(root, null);
    expect(list.unreadableDirs).toEqual([join(projects, "p", "s1", "subagents")]);
    expect(list.files.map((f) => f.sessionId)).toEqual(["s1"]);
  });
  it("크기와 수정 시각을 보지 못한 파일은 목록에서 빼지 않고 읽지 못한 파일로 낸다. 읽지 못한 폴더와 섞지 않는다", async () => {
    const projects = join(root, "projects");
    await touch(join(projects, "p", "s1.jsonl"), NEW);
    await touch(join(projects, "p", "s2.jsonl"), NEW);
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const denied = join(projects, "p", "s2.jsonl");
    vi.mocked(stat).mockImplementation((async (path: Parameters<typeof actual.stat>[0]) => {
      if (String(path) === denied) throw Object.assign(new Error("denied"), { code: "EACCES" });
      return actual.stat(path);
    }) as unknown as typeof stat);
    try {
      const list = await listClaudeFiles(root, null);
      expect(list.files.map((f) => f.sessionId)).toEqual(["s1"]);
      expect(list.unreadableFiles).toEqual([denied]);
      expect(list.unreadableDirs).toEqual([]);
    } finally {
      vi.mocked(stat).mockImplementation(actual.stat as unknown as typeof stat);
    }
  });
  it("projects 폴더가 없으면 찾지 못한 것이다", async () => {
    const list = await listClaudeFiles(root, null);
    expect(list.projectsFound).toBe(false);
    expect(list.files).toEqual([]);
  });
});
