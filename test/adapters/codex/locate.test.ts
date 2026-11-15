// Codex 기록 폴더 찾기, 세션 파일 목록(날짜 폴더, 압축본, 기록 파일 식별자, 수정 시각 거르기), 같은 기록 파일의 사본을 정본 차례로 묶기를 시험한다(설계 9.1, 9.2, 「5단계 계획 전 결정」 3·7번)
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 파일 하나의 stat만 실패하게 하려고 stat을 감싼다. 평소에는 실제 stat을 그대로 부른다.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, stat: vi.fn(actual.stat) };
});
import { codexHome, groupCopies, listCodexFiles, type CodexLogFile, type StatFile } from "../../../src/adapters/codex/locate.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aq 코덱스 로케이트 "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const OLD = Date.parse("2026-01-01T00:00:00Z");
const NEW = Date.parse("2026-11-10T00:00:00Z");
const ID_A = "019a0000-0000-7000-8000-00000000000a";
const ID_B = "019a0000-0000-7000-8000-00000000000b";
const name = (id: string, ext = ".jsonl"): string => `rollout-2026-11-10T09-00-00-${id}${ext}`;

/** 시험 파일은 utimes가 변경 시각을 지금으로 바꾸므로, 수정 시각으로 시각을 꾸민 시험은 변경 시각을 수정 시각과 같게 읽는다 */
const sameTimes: StatFile = async (path) => {
  const info = await stat(path);
  return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.mtimeMs };
};

async function touch(path: string, mtimeMs: number): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "{}\n");
  await utimes(path, mtimeMs / 1000, mtimeMs / 1000);
}

describe("codexHome", () => {
  it("CODEX_HOME이 있으면 그 폴더, 없으면 홈의 .codex", () => {
    expect(codexHome({ CODEX_HOME: join(root, "c") }, root)).toBe(join(root, "c"));
    expect(codexHome({ CODEX_HOME: "  " }, root)).toBe(join(root, ".codex"));
    expect(codexHome({}, root)).toBe(join(root, ".codex"));
  });
});

describe("listCodexFiles", () => {
  it("sessions/연/월/일 아래의 rollout 파일과 압축본을 찾아 기록 파일 식별자와 압축 여부를 적고 경로 차례로 낸다. 다른 자리와 다른 이름은 보지 않는다", async () => {
    const day = join(root, "sessions", "2026", "11", "10");
    await touch(join(day, name(ID_B)), NEW);
    await touch(join(day, name(ID_A, ".jsonl.zst")), NEW);
    await touch(join(day, name(ID_A)), NEW);
    await touch(join(day, "notes.jsonl"), NEW);
    await touch(join(root, "sessions", name(ID_A)), NEW);
    await touch(join(root, "sessions", "2026", name(ID_A)), NEW);
    await touch(join(root, "archived_sessions", name(ID_A)), NEW);
    const list = await listCodexFiles(root, null);
    expect(list.sessionsFound).toBe(true);
    expect(list.files.map((file) => [file.recordId, file.compressed])).toEqual([
      [ID_A, false],
      [ID_A, true],
      [ID_B, false],
    ]);
    expect(list.files.every((file) => file.size !== null && file.mtimeMs !== null)).toBe(true);
    expect(list.unnamedFiles).toBe(0);
  });

  it("대화를 되돌려 생긴 기록(rollout-<시각>-<UUID1>_<UUID2>)은 끝의 UUID2가 기록 파일 식별자이고 앞의 UUID1을 따로 적는다. 보통 이름은 그 칸이 null이다", async () => {
    const day = join(root, "sessions", "2026", "11", "10");
    await touch(join(day, `rollout-2026-11-10T09-00-00-${ID_A}_${ID_B}.jsonl.zst`), NEW);
    await touch(join(day, name(ID_A)), NEW);
    const list = await listCodexFiles(root, null);
    expect(list.files.map((file) => [file.recordId, file.baseId, file.compressed])).toEqual([
      [ID_A, null, false],
      [ID_B, ID_A, true],
    ]);
    expect(list.unnamedFiles).toBe(0);
  });

  it("rollout 파일인데 이름에서 기록 파일 식별자를 읽지 못하면 세지 않고 수만 센다", async () => {
    const day = join(root, "sessions", "2026", "11", "10");
    await touch(join(day, "rollout-2026-11-10T09-00-00-not-an-id.jsonl"), NEW);
    await touch(join(day, name(ID_A)), NEW);
    const list = await listCodexFiles(root, null);
    expect(list.files.map((file) => file.recordId)).toEqual([ID_A]);
    expect(list.unnamedFiles).toBe(1);
  });

  it("수정 시각이 아래 경계보다 앞선 파일은 열지 않고 센다. 같은 기록 파일의 사본도 하나씩 따로 거른다", async () => {
    const day = join(root, "sessions", "2026", "01", "01");
    await touch(join(day, name(ID_A)), OLD);
    await touch(join(day, name(ID_A, ".jsonl.zst")), NEW);
    await touch(join(day, name(ID_B)), OLD);
    const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"), sameTimes);
    expect(list.files.map((file) => [file.recordId, file.compressed])).toEqual([[ID_A, true]]);
    expect(list.olderThanWindow).toBe(2);
  });

  it("변경 시각보다 수정 시각이 늦으면 수정 시각이 늦은 쪽이다(경계 안이면 거르지 않는다)", async () => {
    const day = join(root, "sessions", "2026", "01", "01");
    await touch(join(day, name(ID_A)), NEW);
    const mtimeLater: StatFile = async (path) => {
      const info = await stat(path);
      return { size: info.size, mtimeMs: NEW, ctimeMs: OLD };
    };
    const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"), mtimeLater);
    expect(list.files.map((file) => file.changedMs)).toEqual([NEW]);
    expect(list.olderThanWindow).toBe(0);
  });

  it("수정 시각이 아래 경계보다 앞서도 변경 시각이 늦으면(쓰는 동안 수정 시각이 만든 시각에 머문 기록) 거르지 않고, 늦은 쪽을 changedMs로 낸다", async () => {
    const day = join(root, "sessions", "2026", "01", "01");
    await touch(join(day, name(ID_A)), OLD);
    const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"));
    expect(list.files).toHaveLength(1);
    expect(list.files[0]!.mtimeMs).toBe(OLD);
    expect(list.files[0]!.changedMs).toBe((await stat(join(day, name(ID_A)))).ctimeMs);
    expect(list.files[0]!.changedMs! > OLD).toBe(true);
    expect(list.olderThanWindow).toBe(0);
  });

  it("sessions 폴더가 없으면 찾지 못한 것이고, 폴더가 아니면 찾았지만 읽지 못한 폴더다", async () => {
    expect((await listCodexFiles(root, null)).sessionsFound).toBe(false);
    await writeFile(join(root, "sessions"), "x");
    const list = await listCodexFiles(root, null);
    expect(list.sessionsFound).toBe(true);
    expect(list.unreadableDirs).toEqual([join(root, "sessions")]);
    expect(list.files).toEqual([]);
  });

  it("날짜 폴더를 읽지 못하면 그 폴더만 읽지 못한 폴더로 내고 나머지는 찾는다", async () => {
    await touch(join(root, "sessions", "2026", "11", "10", name(ID_A)), NEW);
    await writeFile(join(root, "sessions", "2026", "12"), "x");
    const list = await listCodexFiles(root, null);
    expect(list.files.map((file) => file.recordId)).toEqual([ID_A]);
    expect(list.unreadableDirs).toEqual([join(root, "sessions", "2026", "12")]);
  });

  it("크기와 수정 시각을 보지 못한 파일은 빼지 않고 둘을 비워 목록에 넣는다(정본 후보로 남기려고). 수집 구간에 걸리는 것으로 본다", async () => {
    const day = join(root, "sessions", "2026", "11", "10");
    await touch(join(day, name(ID_A)), NEW);
    await touch(join(day, name(ID_B)), NEW);
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const denied = join(day, name(ID_B));
    vi.mocked(stat).mockImplementation((async (path: Parameters<typeof actual.stat>[0]) => {
      if (String(path) === denied) throw Object.assign(new Error("denied"), { code: "EACCES" });
      return actual.stat(path);
    }) as unknown as typeof stat);
    try {
      const list = await listCodexFiles(root, Date.parse("2026-06-01T00:00:00Z"));
      expect(list.files.map((file) => [file.recordId, file.size, file.mtimeMs])).toEqual([
        [ID_A, 3, NEW],
        [ID_B, null, null],
      ]);
      expect(list.unreadableDirs).toEqual([]);
    } finally {
      vi.mocked(stat).mockImplementation(actual.stat as unknown as typeof stat);
    }
  });
});

describe("groupCopies", () => {
  const file = (recordId: string, compressed: boolean, mtimeMs: number | null, normPath: string, changedMs = mtimeMs): CodexLogFile => ({ path: normPath, normPath, size: mtimeMs === null ? null : 1, mtimeMs, changedMs, recordId, baseId: null, compressed });

  it("같은 기록 파일 식별자끼리 묶고, 압축하지 않은 것, 수정 시각이 늦은 것, 경로 사전순으로 정본 차례를 낸다. 묶음은 식별자 차례다", () => {
    const groups = groupCopies([
      file(ID_B, false, 5, "b/2.jsonl"),
      file(ID_A, true, 9, "a/1.jsonl.zst"),
      file(ID_A, false, 3, "a/2.jsonl"),
      file(ID_A, false, 7, "a/3.jsonl"),
      file(ID_A, false, 7, "a/0.jsonl"),
    ]);
    expect(groups.map((group) => [group.recordId, group.copies.map((copy) => copy.normPath)])).toEqual([
      [ID_A, ["a/0.jsonl", "a/3.jsonl", "a/2.jsonl", "a/1.jsonl.zst"]],
      [ID_B, ["b/2.jsonl"]],
    ]);
  });

  it("정본 차례의 수정 시각은 수정 시각과 변경 시각 가운데 늦은 것이다", () => {
    const groups = groupCopies([file(ID_A, false, 9, "a/0.jsonl", 9), file(ID_A, false, 3, "a/1.jsonl", 20)]);
    expect(groups[0]!.copies.map((copy) => copy.normPath)).toEqual(["a/1.jsonl", "a/0.jsonl"]);
  });

  it("수정 시각을 보지 못한 사본은 같은 종류 가운데 아는 사본 뒤에 두고, 모르는 것끼리는 경로 차례다(가장 늦다고 지어내지 않는다)", () => {
    const groups = groupCopies([file(ID_A, false, null, "a/0.jsonl"), file(ID_A, false, 1, "a/9.jsonl"), file(ID_A, false, null, "a/1.jsonl"), file(ID_A, true, 5, "a/z.jsonl.zst")]);
    expect(groups[0]!.copies.map((copy) => copy.normPath)).toEqual(["a/9.jsonl", "a/0.jsonl", "a/1.jsonl", "a/z.jsonl.zst"]);
  });
});
