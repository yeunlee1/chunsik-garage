// 점검의 입력 묶음을 모으는 것을 임시 홈 폴더로 시험한다. 기록 읽기와 셋팅 스캔에서 평가까지 이어 보고, 캐시를 켜고 끈 경우와 연달아 두 번 돌린 경우의 결과가 같은지 본다(설계 8, 12.1, 21.1 「결정성」)
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { CLAUDE_COVERAGE } from "../../src/adapters/claude/observation.ts";
import { CODEX_COVERAGE } from "../../src/adapters/codex/observation.ts";
import { GEMINI_COVERAGE } from "../../src/adapters/gemini/observation.ts";
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
const CODEX_ID = "019a0000-0000-7000-8000-000000000001";
const codexLine = (type: string, payload: Record<string, unknown>): string => JSON.stringify({ timestamp: "2026-11-11T03:00:00Z", type, payload });
/** Codex 주 세션 하나. 응답 하나의 입력은 100이고 그 가운데 캐시 입력이 60이다 */
async function codexSession(cwd: string): Promise<void> {
  const dir = join(home, ".codex", "sessions", "2026", "11", "11");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "rollout-2026-11-11T12-00-00-" + CODEX_ID + ".jsonl");
  const usage = { input_tokens: 100, cached_input_tokens: 60, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: 101 };
  const lines = [codexLine("session_meta", { id: CODEX_ID, cwd, cli_version: "0.166.0", thread_source: "user" }), codexLine("token_usage_record", { response_id: "r1", usage, thread_token_usage: usage })];
  await writeFile(path, lines.join("\n") + "\n");
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
}
/** 부모 기록이 없는 Codex 하위 세션 하나 */
async function codexSubSession(cwd: string, parent: string): Promise<void> {
  const dir = join(home, ".codex", "sessions", "2026", "11", "11");
  await mkdir(dir, { recursive: true });
  const id = "019a0000-0000-7000-8000-000000000002";
  const path = join(dir, "rollout-2026-11-11T13-00-00-" + id + ".jsonl");
  const usage = { input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: 11 };
  const lines = [codexLine("session_meta", { id, cwd, cli_version: "0.166.0", thread_source: "subagent", parent_thread_id: parent }), codexLine("token_usage_record", { response_id: "r2", usage, thread_token_usage: usage })];
  await writeFile(path, lines.join("\n") + "\n");
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
}
/** 제미나이 주 세션 하나. 응답 하나의 입력은 100이고 그 가운데 캐시가 40이다. 셸 명령 하나는 0이 아닌 종료 코드로 끝났다 */
async function geminiSession(cwd: string, base = join(home, ".gemini"), sessionId = "g-1"): Promise<void> {
  const dir = join(base, "tmp", "proj");
  await put(join(dir, ".project_root"), cwd);
  const shell = { id: "t1", name: "run_shell_command", args: { command: "npm test" }, status: "success", timestamp: "2026-11-11T04:00:04.000Z", result: [{ functionResponse: { id: "t1", name: "run_shell_command", response: { output: "Output: 1 failed\nExit Code: 1" } } }] };
  const lines = [
    { sessionId, projectHash: "proj", startTime: "2026-11-11T04:00:00.000Z", lastUpdated: "2026-11-11T04:01:00.000Z", kind: "main" },
    { id: "u1", timestamp: "2026-11-11T04:00:01.000Z", type: "user", content: [{ text: "고쳐 줘" }] },
    { id: "g1", timestamp: "2026-11-11T04:00:05.000Z", type: "gemini", content: "", model: "gemini-3-pro", tokens: { input: 100, output: 5, cached: 40, thoughts: 0, tool: 0, total: 105 }, toolCalls: [shell] },
  ];
  const path = join(dir, "chats", "session-2026-11-11T04-00-g1000000.jsonl");
  await put(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  await utimes(path, FILE_TIME / 1000, FILE_TIME / 1000);
}
const options =(overrides: Partial<CheckupInputOptions> = {}): CheckupInputOptions => ({
  // 이 PC의 제미나이 시스템 설정이 끼어들지 않게 시험 폴더 안의 없는 자리를 가리킨다
  env: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(root, "gemini-system", "settings.json"), GEMINI_CLI_SYSTEM_DEFAULTS_PATH: join(root, "gemini-system", "system-defaults.json") },
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
    expect(input.tools.map((tool) => tool.tool)).toEqual(["claude-code", "codex", "gemini", "web-chatgpt", "web-claude"]);
    const tool = input.tools[0]!;
    expect(tool).toMatchObject({ tool: "claude-code", coverage: CLAUDE_COVERAGE, shellTools: ["Bash", "PowerShell"], complete: { skills: true, mcp: true } });
    expect(tool.summaries.map((summary) => summary.sessionId).sort()).toEqual(["s1", "s2", "s3"]);
    expect(tool.setup).toBe(gathered.facts.claude);
    expect(tool.setup!.skills.map((skill) => skill.name)).toEqual(["review"]);
    expect(input.installs).toBe(records);
    expect(input.self).toBe(self);
    expect(gathered.collected.claude.summaries).toBe(tool.summaries);
  });
  it("프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더로 만든다. 하위 폴더에서 연 세션은 같은 프로젝트로 묶인다", async () => {
    const { input } = await gatherCheckupInput(options());
    expect(input.projects).toBe(input.tools[0]!.setup!.projects);
    expect(input.tools[0]!.tool).toBe("claude-code");
    expect(input.projects.map((project) => [project.normRoot, project.kind, project.cwds])).toEqual([[normalizePath(proj), "git", [normalizePath(proj), normalizePath(join(proj, "sub"))]]]);
  });
  it("세션의 작업 폴더마다 정규화한 경로를 붙인다. 프로젝트 목록에 들지 않은 세션의 것도 붙인다", async () => {
    const { input } = await gatherCheckupInput(options());
    expect(input.normalizedCwds).toEqual({ [proj]: normalizePath(proj), [join(proj, "sub")]: normalizePath(join(proj, "sub")), [other]: normalizePath(other) });
  });
  it("기록에 남은 claude.ai 연결의 이름을 스캐너에 넘긴다. 그 서버는 정의가 없는 서버로 든다", async () => {
    const { facts } = await gatherCheckupInput(options());
    expect(facts.claude.mcpServers.map((server) => [server.name, server.scope, server.installKey === null])).toEqual([["claude.ai Mail", "claude-ai", true], ["db", "user", false]]);
  });
  it("읽지 못한 파일이 있으면 스킬 사용과 MCP 호출의 관측이 빠짐없지 않다", async () => {
    await session("p-proj", "broken", ["{깨진 줄", "{또 깨진 줄", user({ at: "2026-11-11T03:00:00Z", content: "x", origin: "human" })]);
    const { input, collected } = await gatherCheckupInput(options());
    expect(collected.claude.read.unreadableFiles).toHaveLength(1);
    expect(input.tools[0]!.complete).toEqual({ skills: false, mcp: false });
  });
  it("기록 폴더가 없어도 입력 묶음을 만든다. 평가는 점수 없이 나온다", async () => {
    const { input, collected } = await gatherCheckupInput(options({ homedir: join(root, "nobody") }));
    expect([collected.claude.detected, collected.codex.detected, collected.gemini.detected]).toEqual([false, false, false]);
    expect(input.tools.map((tool) => tool.summaries)).toEqual([[], [], [], [], []]);
    expect(evaluate(input).score).toMatchObject({ aq: null, grade: null });
  });
});

describe("gatherCheckupInput의 Codex(설계 「5단계 3부 계획 전 결정」 2·3·13번)", () => {
  beforeEach(async () => {
    await codexSession(other);
    await put(join(home, ".codex", "config.toml"), "[projects." + JSON.stringify(other) + "]\ntrust_level = \"trusted\"\n[mcp_servers.search]\ncommand = \"search-server\"\n");
  });

  it("Codex의 기록과 셋팅을 함께 넣는다. 관측 범위와 셸 명령 도구는 Codex의 것이고 스킬의 관측은 늘 빠짐없지 않다", async () => {
    const gathered = await gatherCheckupInput(options());
    const codex = gathered.input.tools[1]!;
    expect(codex).toMatchObject({ tool: "codex", coverage: CODEX_COVERAGE, shellTools: ["shell"], complete: { skills: false, mcp: true } });
    expect(codex.setup).toBe(gathered.facts.codex);
    expect(codex.summaries).toBe(gathered.collected.codex.summaries);
    expect(gathered.facts.codex.mcpServers.map((server) => server.name)).toEqual(["search"]);
  });

  it("결과에 싣는 Codex의 수집 결과는 Claude Code와 같은 칸이다. 겹쳐 세는 응답은 없다", async () => {
    const { tools } = await gatherCheckupInput(options());
    expect(tools.map((tool) => tool.tool)).toEqual(["claude-code", "codex", "gemini", "web-chatgpt", "web-claude"]);
    expect(tools[1]).toMatchObject({ detected: true, overlappingSessions: 0, observation: { skills: { complete: false, reasons: ["not-recorded"] }, mcp: { complete: true, reasons: [] } } });
    expect(Object.keys(tools[1]!.read).sort()).toEqual(Object.keys(tools[0]!.read).sort());
    expect(tools[1]!.read).toMatchObject({ files: 1, unreadableFiles: [] });
  });

  it("Codex만 내는 수집 결과(건너뛴 압축 파일, 일부만 읽은 파일, 기록을 묶으며 센 것)를 따로 싣는다. Claude Code에는 없다(설계 「5단계 4부 계획 전 결정」 2·3번)", async () => {
    const { tools, collected } = await gatherCheckupInput(options());
    expect(tools[0]!.codex).toBeUndefined();
    expect(tools[1]!.codex).toEqual({
      skippedFiles: collected.codex.read.skippedFiles,
      skippedFileBytes: collected.codex.read.skippedFileBytes,
      partialFiles: collected.codex.read.partialFiles,
      skippedCopies: 0,
      unnamedFiles: 0,
      parentRecordMissing: 0,
      mergedSessions: 0,
      unknownMtimeSessions: 0,
      unverifiedInheritance: 0,
      idFallbacks: {},
    });
  });

  it("이어받은 것을 확인하지 못한 세션이 있으면 그 점검의 Codex 응답과 토큰, 도구 오류, 셸 명령의 종료 코드를 대신 봄으로 낮춘다(설계 「5단계 4부 계획 전 결정」 4번)", async () => {
    expect((await gatherCheckupInput(options())).input.tools[1]!.coverage).toEqual(CODEX_COVERAGE);
    await codexSubSession(other, "019a0000-0000-7000-8000-0000000000ff");
    const { input, tools } = await gatherCheckupInput(options());
    expect(tools[1]!.codex).toMatchObject({ parentRecordMissing: 1, unverifiedInheritance: 1 });
    expect(input.tools[1]!.coverage).toEqual({ ...CODEX_COVERAGE, responsesAndTokens: "proxy", toolCalls: "proxy", toolErrors: "proxy", shellExitCodes: "proxy" });
  });

  it("프로젝트 목록은 두 도구의 주 세션의 작업 폴더로 만들고, 두 스캐너에 같은 목록을 준다", async () => {
    const { input, facts } = await gatherCheckupInput(options());
    const roots = [normalizePath(other), normalizePath(proj)].sort();
    expect(input.projects.map((project) => project.normRoot)).toEqual(roots);
    expect(input.normalizedCwds[other]).toBe(normalizePath(other));
    const trust = new Map(facts.codex.projects.filter((project) => project.scanned).map((project) => [project.normRoot, project.trust]));
    expect([trust.get(normalizePath(other)), trust.get(normalizePath(proj))]).toEqual(["trusted", null]);
  });

  it("Codex의 규칙을 그 도구의 기록과 셋팅으로 잰다", async () => {
    const result = evaluate((await gatherCheckupInput(options())).input);
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses])).toEqual([
      ["claude-code", true, 2],
      ["codex", true, 1],
      ["gemini", false, 0],
      ["web-chatgpt", false, 0],
      ["web-claude", false, 0],
    ]);
    const e1 = result.findings.find((f) => f.ruleId === "E1")!;
    expect(e1.tools.find((value) => value.tool === "codex")).toMatchObject({ status: "scored", value: 0.6 });
  });

  it("Codex 0.166.0이 거부하는 승인 정책 untrusted를 적은 설정은 풀리지 않는 설정이다. S3이 세고 S2는 Codex를 빼고 잰다(3부 계획 리뷰 1차)", async () => {
    await put(join(home, ".codex", "config.toml"), 'approval_policy = "untrusted"\nsandbox_mode = "workspace-write"\n');
    const gathered = await gatherCheckupInput(options());
    expect(gathered.facts.codex.config).toBe("unparsable");
    const result = evaluate(gathered.input);
    expect(result.findings.find((f) => f.ruleId === "S3")!.evidence).toMatchObject({ unparsable: 1 });
    expect(result.findings.find((f) => f.ruleId === "S2")!.evidence).toMatchObject({ tools: 1, unreadTools: 1 });
  });

  it("신뢰한 프로젝트의 설정이 그 승인 정책을 적어도 그 프로젝트의 설정이 풀리지 않는다(3부 계획 리뷰 1차)", async () => {
    await put(join(other, ".codex", "config.toml"), 'approval_policy = "untrusted"\n');
    const gathered = await gatherCheckupInput(options());
    expect(gathered.facts.codex.config).toBe("ok");
    expect(gathered.facts.codex.projects.find((project) => project.normRoot === normalizePath(other))).toMatchObject({ trust: "trusted", configStatus: "unparsable", safety: null });
    const result = evaluate(gathered.input);
    expect(result.findings.find((f) => f.ruleId === "S3")!.evidence).toMatchObject({ unparsable: 1 });
    expect(result.findings.find((f) => f.ruleId === "S2")!.evidence).toMatchObject({ tools: 1, unreadTools: 1 });
  });
});

describe("gatherCheckupInput의 Gemini CLI(설계 「0.4.0에서 정한 것」)", () => {
  // 제미나이는 Windows에서 .project_root에 소문자로 바꾼 경로를 적는다. Claude Code 기록의 같은 폴더와 한 프로젝트로 이어져야 한다
  const geminiRoot = (): string => (process.platform === "win32" ? proj.toLowerCase() : proj);
  beforeEach(async () => {
    await geminiSession(geminiRoot());
  });

  it("제미나이의 기록과 셋팅을 함께 넣는다. 관측 범위와 셸 명령 도구는 제미나이의 것이고 스킬의 관측은 늘 빠짐없지 않다", async () => {
    const gathered = await gatherCheckupInput(options());
    const gemini = gathered.input.tools[2]!;
    expect(gemini).toMatchObject({ tool: "gemini", coverage: GEMINI_COVERAGE, shellTools: ["run_shell_command"], complete: { skills: false, mcp: true } });
    expect(gemini.setup).toBe(gathered.facts.gemini);
    expect(gemini.summaries).toBe(gathered.collected.gemini.summaries);
    expect(gemini.summaries.map((summary) => [summary.sessionId, summary.cwd])).toEqual([["g-1", geminiRoot()]]);
  });

  it("결과에 싣는 제미나이의 수집 결과는 Claude Code와 같은 칸이다", async () => {
    const { tools } = await gatherCheckupInput(options());
    expect(tools[2]).toMatchObject({ tool: "gemini", detected: true, overlappingSessions: 0, observation: { skills: { complete: false, reasons: ["not-recorded"] }, mcp: { complete: true, reasons: [] } } });
    expect(Object.keys(tools[2]!.read).sort()).toEqual(Object.keys(tools[0]!.read).sort());
    expect(tools[2]!.codex).toBeUndefined();
  });

  it("제미나이 세션의 작업 폴더는 Claude Code의 같은 프로젝트로 묶이고, 신뢰 규칙이 정한 프로젝트만 제미나이의 프로젝트 층을 읽는다", async () => {
    let { input, facts } = await gatherCheckupInput(options());
    expect(input.projects.map((project) => project.normRoot)).toEqual([normalizePath(proj)]);
    expect(facts.gemini.projects.map((project) => [project.normRoot, project.trusted])).toEqual([[normalizePath(proj), false]]);
    await put(join(home, ".gemini", "trustedFolders.json"), JSON.stringify({ [proj]: "TRUST_FOLDER" }));
    ({ input, facts } = await gatherCheckupInput(options()));
    expect(facts.gemini.projects.map((project) => [project.normRoot, project.trusted])).toEqual([[normalizePath(proj), true]]);
  });

  it("제미나이의 규칙을 그 도구의 기록과 셋팅으로 잰다. 입력 토큰에는 캐시가 들어 있고, 셸 도구를 확인 없이 허용하면서 샌드박스가 없으면 안전장치가 없다", async () => {
    await put(join(home, ".gemini", "settings.json"), JSON.stringify({ tools: { allowed: ["run_shell_command"] } }));
    let result = evaluate((await gatherCheckupInput(options())).input);
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses, tool.totals.humanRequests])).toEqual([
      ["claude-code", true, 2, 3],
      ["codex", false, 0, 0],
      ["gemini", true, 1, 1],
      ["web-chatgpt", false, 0, 0],
      ["web-claude", false, 0, 0],
    ]);
    const finding = (id: string) => result.findings.find((f) => f.ruleId === id)!;
    expect(finding("E1").tools.find((value) => value.tool === "gemini")).toMatchObject({ status: "scored", value: 0.4 });
    expect(finding("S2")).toMatchObject({ status: "scored", value: 0.5, evidence: { guarded: 1, tools: 2, unreadTools: 0 } });
    // 스킬 폴더를 훑지 않는 제미나이의 F5는 읽지 못함이 아니라 잴 수 없음이다(짝 검토 2차 참고 3)
    expect(finding("F5").tools.find((value) => value.tool === "gemini")).toMatchObject({ status: "unmeasured", reason: "unsupported" });

    await put(join(home, ".gemini", "settings.json"), JSON.stringify({ tools: { allowed: ["run_shell_command"], sandbox: true } }));
    result = evaluate((await gatherCheckupInput(options())).input);
    expect(result.findings.find((f) => f.ruleId === "S2")).toMatchObject({ status: "scored", value: 1 });

    // 제미나이가 시작하지 못하는 샌드박스 값은 안전장치로 치지 않고 제미나이를 빼고 잰다(짝 검토 3차 필수 4)
    await put(join(home, ".gemini", "settings.json"), JSON.stringify({ tools: { allowed: ["run_shell_command"], sandbox: "not-a-sandbox" } }));
    result = evaluate((await gatherCheckupInput(options())).input);
    expect(result.findings.find((f) => f.ruleId === "S2")).toMatchObject({ status: "scored", value: 1, evidence: { guarded: 1, tools: 1, unreadTools: 1 } });
  });

  it("제미나이의 사용자 설정이 풀리지 않으면 S3이 세고 S2는 제미나이를 빼고 잰다", async () => {
    await put(join(home, ".gemini", "settings.json"), "{ 깨진 설정");
    const result = evaluate((await gatherCheckupInput(options())).input);
    expect(result.findings.find((f) => f.ruleId === "S3")!.evidence).toMatchObject({ unparsable: 1 });
    expect(result.findings.find((f) => f.ruleId === "S2")!.evidence).toMatchObject({ tools: 1, unreadTools: 1 });
  });

  it("셸 명령의 0이 아닌 종료 코드는 도구 상태가 success여도 셸 명령 실패로 센다", async () => {
    const { input } = await gatherCheckupInput(options());
    const day = input.tools[2]!.summaries[0]!.days["2026-11-11"]!;
    expect(day.tools["run_shell_command"]).toMatchObject({ calls: 1, results: 1, errors: 1 });
  });

  it("macOS sandbox-exec 샌드박스가 남긴 기록(<홈>/.cache/.gemini/tmp)도 모은다(짝 검토 2차 필수 8)", async () => {
    await geminiSession(geminiRoot(), join(home, ".cache", ".gemini"), "g-2");
    const { input } = await gatherCheckupInput(options());
    expect(input.tools[2]!.summaries.map((summary) => summary.sessionId).sort()).toEqual(["g-1", "g-2"]);
  });

  it("캐시를 켜고 끈 경우와 연달아 두 번 돌린 경우에 글자 하나 다르지 않다", async () => {
    const cacheDir = join(root, "state", "cache");
    const run = async (overrides: Partial<CheckupInputOptions>) => {
      const gathered = await gatherCheckupInput(options(overrides));
      return { text: JSON.stringify(evaluate(gathered.input)), fromCache: gathered.collected.gemini.read.fromCache };
    };
    const plain = await run({});
    const first = await run({ cacheDir });
    const second = await run({ cacheDir });
    const rescanned = await run({ cacheDir, rescan: true });
    expect([plain.fromCache, first.fromCache, second.fromCache, rescanned.fromCache]).toEqual([0, 0, 1, 0]);
    expect([first.text, second.text, rescanned.text]).toEqual([plain.text, plain.text, plain.text]);
  });
});

describe("모은 입력으로 평가한 결과", () => {
  it("기록과 셋팅이 규칙에 이어진다", async () => {
    const result = evaluate((await gatherCheckupInput(options())).input);
    const finding = (id: string) => result.findings.find((f) => f.ruleId === id)!;
    expect(result.tools.map((tool) => [tool.tool, tool.scored, tool.totals.responses, tool.totals.humanRequests])).toEqual([
      ["claude-code", true, 2, 3],
      ["codex", false, 0, 0],
      ["gemini", false, 0, 0],
      ["web-chatgpt", false, 0, 0],
      ["web-claude", false, 0, 0],
    ]);
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
      return { text: JSON.stringify(evaluate(gathered.input)), fromCache: gathered.collected.claude.read.fromCache };
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
