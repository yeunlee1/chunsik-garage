// 점검의 입력 묶음을 모으는 것을 임시 홈 폴더로 시험한다. 기록 읽기와 셋팅 스캔에서 평가까지 이어 보고, 캐시를 켜고 끈 경우와 연달아 두 번 돌린 경우의 결과가 같은지 본다(설계 8, 12.1, 21.1 「결정성」)
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { gatherCheckupInput, type CheckupInputOptions } from "../../src/commands/checkup-input.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { NO_SELF } from "../../src/core/installs/candidates.ts";
import { assistant, user } from "../helpers/claude-lines.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const NOW = Date.parse("2026-11-12T03:00:00Z");
const FILE_TIME = Date.parse("2026-11-11T12:00:00Z");
const SALT = "5a".repeat(32);

let root: string;
let home: string;
let proj: string;
let other: string;

async function session(folder: string, id: string, lines: string[]): Promise<string> {
  const dir = join(home, ".claude", "projects", folder);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  await writeFile(path, `${lines.join("\n")}\n`);
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
  return path;
}
const turn = (id: string, cwd: string, extra: { mcpServer?: string } = {}): string[] => [
  user({ at: "2026-11-11T01:00:00Z", content: "고쳐 줘", origin: "human", extra: { cwd } }),
  assistant({ id, at: "2026-11-11T01:00:05Z", cwd, usage: { input: 10, cacheRead: 80, cacheWrite: 10, output: 5 }, ...extra }),
];
const options = (overrides: Partial<CheckupInputOptions> = {}): CheckupInputOptions => ({
  env: {},
  homedir: home,
  tmpdir: join(root, "os-tmp"),
  platform: process.platform,
  clock: { nowMs: NOW, timeZone: "Asia/Seoul" },
  cacheDir: null,
  rescan: false,
  state: { salt: SALT, installs: null },
  self: NO_SELF,
  managedDir: join(root, "managed"),
  ...overrides,
});

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  proj = join(root, "work", "proj");
  other = join(root, "work", "other");
  const claude = join(home, ".claude");
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(proj, "sub", "x.txt"), "x");
  await put(join(proj, "CLAUDE.md"), "이 저장소에서는 계획 문서를 먼저 읽고 시험을 돌린다.\n");
  await put(join(other, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(claude, "CLAUDE.md"), `${"모든 일은 시험을 먼저 돌린 뒤에 끝났다고 말한다. ".repeat(12)}\n`);
  await put(join(claude, "settings.json"), JSON.stringify({ permissions: { defaultMode: "acceptEdits" } }));
  await put(join(claude, "skills", "review", "SKILL.md"), "---\nname: review\ndescription: 시험용 스킬\n---\n");
  await put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { db: { command: "db-server" } } }));
  await session("p-proj", "s1", turn("a-1", proj));
  await session("p-proj", "s2", turn("b-1", join(proj, "sub"), { mcpServer: "claude.ai Mail" }));
  // 응답이 없는 세션의 작업 폴더는 프로젝트 목록에 넣지 않는다
  await session("p-other", "s3", [user({ at: "2026-11-11T02:00:00Z", content: "열어만 봤다", origin: "human", extra: { cwd: other } })]);
});
afterEach(async () => removeTemp(root));

describe("gatherCheckupInput", () => {
  it("기록을 읽고 셋팅을 스캔해 평가의 입력 묶음을 만든다", async () => {
    const records = [{ key: "k", firstSeen: "2026-10-01", appeared: false }];
    const self = { skillNames: ["aq"], pluginNames: ["chunsik-garage"], skillRealPaths: [] };
    const gathered = await gatherCheckupInput(options({ state: { salt: SALT, installs: records }, self }));
    const { input } = gathered;
    expect(input.clock).toEqual({ nowMs: NOW, timeZone: "Asia/Seoul" });
    expect(input.tools).toHaveLength(1);
    const tool = input.tools[0]!;
    expect(tool).toMatchObject({ tool: "claude-code", coverage: CLAUDE_COVERAGE, shellTools: ["Bash", "PowerShell"], complete: { skills: true, mcp: true } });
    expect(tool.summaries.map((summary) => summary.sessionId).sort()).toEqual(["s1", "s2", "s3"]);
    expect(tool.setup).toBe(gathered.facts);
    expect(tool.setup.skills.map((skill) => skill.name)).toEqual(["review"]);
    expect(input.installs).toBe(records);
    expect(input.self).toBe(self);
    expect(gathered.collected.summaries).toBe(tool.summaries);
  });
  it("프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더로 만든다. 하위 폴더에서 연 세션은 같은 프로젝트로 묶인다", async () => {
    const { input } = await gatherCheckupInput(options());
    expect(input.projects).toBe(input.tools[0]!.setup.projects);
    expect(input.projects.map((project) => [project.normRoot, project.kind, project.cwds])).toEqual([[normalizePath(proj), "git", [normalizePath(proj), normalizePath(join(proj, "sub"))]]]);
  });
  it("세션의 작업 폴더마다 정규화한 경로를 붙인다. 프로젝트 목록에 들지 않은 세션의 것도 붙인다", async () => {
    const { input } = await gatherCheckupInput(options());
    expect(input.normalizedCwds).toEqual({ [proj]: normalizePath(proj), [join(proj, "sub")]: normalizePath(join(proj, "sub")), [other]: normalizePath(other) });
  });
  it("기록에 남은 claude.ai 연결의 이름을 스캐너에 넘긴다. 그 서버는 정의가 없는 서버로 든다", async () => {
    const { facts } = await gatherCheckupInput(options());
    expect(facts.mcpServers.map((server) => [server.name, server.scope, server.installKey === null])).toEqual([["claude.ai Mail", "claude-ai", true], ["db", "user", false]]);
  });
  it("읽지 못한 파일이 있으면 스킬 사용과 MCP 호출의 관측이 빠짐없지 않다", async () => {
    await session("p-proj", "broken", ["{깨진 줄", "{또 깨진 줄", user({ at: "2026-11-11T03:00:00Z", content: "x", origin: "human" })]);
    const { input, collected } = await gatherCheckupInput(options());
    expect(collected.read.unreadableFiles).toHaveLength(1);
    expect(input.tools[0]!.complete).toEqual({ skills: false, mcp: false });
  });
  it("기록 폴더가 없어도 입력 묶음을 만든다. 평가는 점수 없이 나온다", async () => {
    const { input, collected } = await gatherCheckupInput(options({ homedir: join(root, "nobody") }));
    expect(collected.detected).toBe(false);
    expect(input.tools[0]!.summaries).toEqual([]);
    expect(evaluate(input).score).toMatchObject({ aq: null, grade: null });
  });
});

describe("모은 입력으로 평가한 결과", () => {
  it("기록과 셋팅이 규칙에 이어진다", async () => {
    const result = evaluate((await gatherCheckupInput(options())).input);
    const finding = (id: string) => result.findings.find((f) => f.ruleId === id)!;
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses, tool.totals.humanRequests])).toEqual([["claude-code", true, 2, 3]]);
    expect(finding("E1")).toMatchObject({ status: "scored", value: 0.8 });
    expect(finding("S1")).toMatchObject({ status: "scored", value: 1 });
    expect(finding("S2")).toMatchObject({ status: "scored", value: 1 });
    expect(finding("I1")).toMatchObject({ value: 1 });
    expect(finding("I4")).toMatchObject({ value: 1, evidence: { projects: 1, unlinkedSessions: 0 } });
    expect(finding("F3")).toMatchObject({ status: "unmeasured", reason: "not_applicable" });
    expect(result.score).toMatchObject({ aq: null, withheld: ["too_few_requests", "too_few_days"] });
  });
  it("캐시를 켜고 끈 경우와 연달아 두 번 돌린 경우에 글자 하나 다르지 않다", async () => {
    const cacheDir = join(root, "state", "cache");
    const run = async (overrides: Partial<CheckupInputOptions>) => {
      const gathered = await gatherCheckupInput(options(overrides));
      return { text: JSON.stringify(evaluate(gathered.input)), fromCache: gathered.collected.read.fromCache };
    };
    const plain = await run({});
    const first = await run({ cacheDir });
    const second = await run({ cacheDir });
    const rescanned = await run({ cacheDir, rescan: true });
    expect([plain.fromCache, first.fromCache, second.fromCache, rescanned.fromCache]).toEqual([0, 0, 3, 0]);
    expect(first.text).toBe(plain.text);
    expect(second.text).toBe(plain.text);
    expect(rescanned.text).toBe(plain.text);
  });
});
