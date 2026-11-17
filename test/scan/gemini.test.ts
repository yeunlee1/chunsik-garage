// 제미나이 셋팅 스캐너를 임시 홈 폴더로 시험한다. 사용자·시스템 층, 작업 폴더 신뢰, 승인·샌드박스·셸 자동 허용, 지침 이름, MCP 서버와 비밀값, 문제와 그 위치(설계 10, 「0.4.0에서 정한 것」)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { geminiServerRecordName, scanGeminiSetup, type GeminiScanInput } from "../../src/scan/gemini.ts";
import type { GeminiSetupFacts } from "../../src/scan/types.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let home: string;
let gemini: string;
let proj: string;
let other: string;
let input: GeminiScanInput;
const SALT = "7d".repeat(32);
const json = (value: unknown): string => JSON.stringify(value, null, 2);
const projectOf = (facts: GeminiSetupFacts, path: string) => facts.projects.find((project) => project.normRoot === normalizePath(path))!;

beforeEach(async () => {
  root = await makeTemp();
  home = join(root, "home");
  gemini = join(home, ".gemini");
  proj = join(root, "work", "proj");
  other = join(root, "work", "other");
  input = {
    // 이 PC의 시스템 설정이 끼어들지 않게 시험 폴더 안의 없는 자리를 가리킨다
    env: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(root, "system", "settings.json"), GEMINI_CLI_SYSTEM_DEFAULTS_PATH: join(root, "system", "system-defaults.json") },
    homedir: home,
    tmpdir: join(root, "os-tmp"),
    platform: process.platform,
    cwds: [proj, other],
    salt: SALT,
  };
  await put(join(proj, ".git", "HEAD"), "ref: refs/heads/main\n");
  await put(join(other, ".git", "HEAD"), "ref: refs/heads/main\n");
});

afterEach(async () => {
  await removeTemp(root);
});

describe("geminiServerRecordName", () => {
  it("서버 이름을 도구 이름 규칙으로 바꾼 뒤 첫 밑줄 앞만 남긴다", () => {
    expect([geminiServerRecordName("github"), geminiServerRecordName("my_srv"), geminiServerRecordName("a b"), geminiServerRecordName("x.y-z")]).toEqual(["github", "my", "a", "x.y-z"]);
  });
});

describe("scanGeminiSetup", () => {
  it("주석이 든 사용자 설정을 읽고, 신뢰한 프로젝트만 프로젝트 층과 지침을 읽는다. 서버와 비밀값의 자리를 내고 값은 남기지 않는다", async () => {
    await put(
      join(gemini, "settings.json"),
      [
        "{",
        "  // 사용자 설정",
        '  "general": { "defaultApprovalMode": "auto_edit" },',
        '  /* 서버 */ "mcpServers": {',
        '    "ctx": { "command": "npx", "env": { "API_TOKEN": "TOKEN-VALUE-123" } },',
        '    "my_srv": { "url": "https://srv.example/mcp" }',
        "  },",
        '  "mcp": { "excluded": ["my_srv"] }',
        "}",
      ].join("\n"),
    );
    await put(join(gemini, "trustedFolders.json"), json({ [proj]: "TRUST_FOLDER" }));
    await put(join(proj, ".gemini", "settings.json"), json({ tools: { allowed: ["run_shell_command"] }, mcpServers: { projsrv: { command: "x" } } }));
    await put(join(proj, "GEMINI.md"), "프로젝트 지침은 시험을 먼저 돌린 뒤에 끝났다고 말한다.\n");
    await put(join(other, ".gemini", "settings.json"), json({ tools: { allowed: ["run_shell_command"] }, mcpServers: { untrusted: { command: "y" } } }));
    await put(join(other, "GEMINI.md"), "신뢰하지 않은 폴더의 지침은 제미나이가 싣지 않는다.\n");

    const facts = await scanGeminiSetup(input);
    expect([facts.settings, facts.folderTrust, facts.trustedFolders, facts.managedParts]).toEqual(["ok", true, "ok", []]);
    expect(facts.safety).toEqual({ approvalMode: "auto_edit", sandbox: false, shellAutoApproved: false });
    expect(projectOf(facts, proj)).toMatchObject({ scanned: true, trusted: true, settingsStatus: "ok", safety: { approvalMode: "auto_edit", sandbox: false, shellAutoApproved: true } });
    expect(projectOf(facts, proj).instructions.files).toHaveLength(1);
    expect(projectOf(facts, other)).toMatchObject({ scanned: true, trusted: false, settingsStatus: null, safety: null });
    expect(projectOf(facts, other).instructions.files).toEqual([]);
    expect(facts.mcpServers.map((server) => [server.name, server.scope, server.enabled, server.recordNames])).toEqual([
      ["ctx", "user", true, ["ctx"]],
      ["my_srv", "user", false, ["my"]],
      ["projsrv", "project", true, ["projsrv"]],
    ]);
    expect(facts.secrets.map((secret) => secret.server)).toEqual(["ctx"]);
    expect(JSON.stringify(facts)).not.toContain("TOKEN-VALUE-123");
    expect(facts.problems).toEqual([]);
  });

  it("신뢰 규칙은 규칙 폴더(TRUST_PARENT는 그 부모) 안의 가장 긴 규칙이 정하고, 신뢰 기능이 꺼져 있으면 모든 폴더를 신뢰한다", async () => {
    await put(join(gemini, "trustedFolders.json"), json({ [join(root, "work")]: "TRUST_FOLDER", [other]: "DO_NOT_TRUST", [join(proj, "child")]: "TRUST_PARENT" }));
    let facts = await scanGeminiSetup(input);
    expect([projectOf(facts, proj).trusted, projectOf(facts, other).trusted]).toEqual([true, false]);

    await put(join(gemini, "trustedFolders.json"), json({ [join(proj, "child")]: "TRUST_PARENT" }));
    facts = await scanGeminiSetup(input);
    expect([projectOf(facts, proj).trusted, projectOf(facts, other).trusted]).toEqual([true, false]);

    await put(join(gemini, "settings.json"), json({ security: { folderTrust: { enabled: false } } }));
    await put(join(gemini, "trustedFolders.json"), "{ 깨진 파일");
    facts = await scanGeminiSetup(input);
    expect([facts.folderTrust, projectOf(facts, proj).trusted, projectOf(facts, other).trusted]).toEqual([false, true, true]);
    // 신뢰 기능이 꺼져 있으면 규칙 파일을 읽지 않으므로 문제가 아니다
    expect(facts.problems).toEqual([]);
  });

  it("시스템 기본값은 사용자 층 아래에, 시스템 설정은 모든 층 위에 얹는다", async () => {
    await put(join(root, "system", "system-defaults.json"), json({ general: { defaultApprovalMode: "plan" }, tools: { sandbox: true } }));
    await put(join(gemini, "settings.json"), json({ tools: { sandbox: false } }));
    let facts = await scanGeminiSetup(input);
    expect(facts.safety).toEqual({ approvalMode: "plan", sandbox: false, shellAutoApproved: false });
    expect(facts.managedParts.map((part) => part.status)).toEqual(["ok"]);

    await put(join(root, "system", "settings.json"), json({ tools: { sandbox: "docker" } }));
    facts = await scanGeminiSetup(input);
    expect(facts.safety.sandbox).toBe(true);
    expect(facts.managedParts.map((part) => part.status)).toEqual(["ok", "ok"]);
  });

  it("지침 파일 이름을 정해도 GEMINI.md를 함께 읽는다", async () => {
    await put(join(gemini, "settings.json"), json({ context: { fileName: "AGENTS.md" } }));
    await put(join(gemini, "AGENTS.md"), "전역 지침 하나는 시험을 먼저 돌린 뒤에 끝났다고 말한다.\n");
    await put(join(gemini, "GEMINI.md"), "전역 지침 둘은 고친 뒤에 다시 확인한다고 말한다.\n");
    const facts = await scanGeminiSetup(input);
    expect(facts.globalInstructions.files).toHaveLength(2);
  });

  it("풀리지 않는 설정과 신뢰 규칙은 문제로 적고, 안전 설정은 모른다고 낸다", async () => {
    await put(join(gemini, "settings.json"), "{ 깨진 설정");
    await put(join(gemini, "trustedFolders.json"), json({ [proj]: "MAYBE" }));
    await put(join(root, "system", "settings.json"), "[1, 2]");
    const facts = await scanGeminiSetup(input);
    expect([facts.settings, facts.trustedFolders]).toEqual(["unparsable", "unparsable"]);
    expect(facts.safety).toEqual({ approvalMode: null, sandbox: null, shellAutoApproved: null });
    expect(projectOf(facts, proj)).toMatchObject({ trusted: false, safety: null });
    expect(facts.problems.map((problem) => [problem.owner, problem.place])).toEqual(
      expect.arrayContaining([
        ["user", "~/.gemini/settings.json"],
        ["user", "~/.gemini/trustedFolders.json"],
        ["managed", null],
      ]),
    );
    expect(facts.problems).toHaveLength(3);
  });
});
