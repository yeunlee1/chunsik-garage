// aq deep-hints를 임시 홈 폴더로 시험한다. 단서와 읽을 수 있는 지침 파일 목록을 내고, 저장하지 않으면 상태 폴더에 아무것도 쓰지 않는다(설계 7.4, 17)
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDeepHints } from "../../src/commands/deep-hints.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
let root: string;
let home: string;
let proj: string;

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  proj = join(root, "work", "proj");
  await mkdir(join(root, "os-tmp"), { recursive: true });
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(proj, "CLAUDE.md"), "# 프로젝트 지침\n시험을 먼저 쓴다.\n");
  await put(join(home, ".claude", "CLAUDE.md"), "# 전역 지침\n한국어로 답한다.\n");
  const dir = join(home, ".claude", "projects", "p-proj");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "s1.jsonl");
  const at = "2026-11-11T01:00:00Z";
  await writeFile(path, `${[user({ at, content: "고쳐 줘", origin: "human", extra: { cwd: proj } }), assistant({ id: "s1-a", at, cwd: proj, usage: { input: 10, cacheRead: 80, cacheWrite: 10, output: 5 } })].join("\n")}\n`);
  const fileTime = Date.parse("2026-11-11T12:00:00Z") / 1000;
  await utimes(path, fileTime, fileTime);
});
afterEach(async () => removeTemp(root));

describe("aq deep-hints", () => {
  it("전역 지침은 골라 두고 프로젝트 지침은 고르지 않은 목록을 낸다. 저장하지 않으면 상태 폴더를 만들지 않는다", async () => {
    const stateDir = join(home, ".chunsik-garage");
    const outcome = await runDeepHints({ env: {}, homedir: home, tmpdir: join(root, "os-tmp"), platform: process.platform, clock: { nowMs: NOW, timeZone: "Asia/Seoul" }, lang: "ko", stateDir, save: false, rescan: false, entryFile: join(root, "repo", "src", "entry.ts"), managedDir: join(root, "managed") });
    const picked = outcome.files.map((file) => [file.tool, file.scope, file.path.replace(/\\/g, "/").endsWith(file.scope === "global" ? ".claude/CLAUDE.md" : "proj/CLAUDE.md"), file.selected]);
    expect(picked).toEqual([
      ["claude-code", "global", true, true],
      ["claude-code", "project", true, false],
    ]);
    expect(outcome.run.text.hints).toHaveLength(outcome.hints.length);
    expect(existsSync(stateDir)).toBe(false);
  });
});
