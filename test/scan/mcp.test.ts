// MCP 서버의 이름 꼴, .claude.json 읽기, 정의의 지문, 막음과 승인을 시험한다(설계 10, 11.3 E6, 19.1, 21.1)
import * as fsp from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeJsonPath, readClaudeJson } from "../../src/scan/claude-json.ts";
import { definitionHash, matcherHits, mcpAllowed, projectServerApproved, type McpContext } from "../../src/scan/mcp.ts";
import { callForm, mcpRecordNames, skillRecordNames, toolForm } from "../../src/scan/names.ts";
import { viewOf } from "../../src/scan/settings.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

// .claude.json을 쓰는 도중에 읽힌 경우를 꾸미려고 readFile을 감싼다(기본은 진짜 readFile)
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { ...real, readFile: vi.fn(real.readFile) };
});

let root: string;
beforeEach(async () => {
  root = await makeTemp();
  vi.mocked(fsp.readFile).mockClear();
});
afterEach(async () => removeTemp(root));

describe("이름 꼴", () => {
  it("도구 이름 꼴은 영문자·숫자·_·- 밖의 글자를 _로 바꾼다", () => {
    expect(toolForm("claude.ai Gmail")).toBe("claude_ai_Gmail");
    expect(toolForm("my.server")).toBe("my_server");
    expect(toolForm("a-b_c9")).toBe("a-b_c9");
  });
  it("MCP 서버는 설정 이름과 도구 이름 꼴, 플러그인 서버는 귀속 꼴과 도구 이름 꼴이다", () => {
    expect(mcpRecordNames("context7", null)).toEqual(["context7"]);
    expect(mcpRecordNames("claude.ai Gmail", null)).toEqual(["claude.ai Gmail", "claude_ai_Gmail"]);
    expect(mcpRecordNames("db", "my-plugin")).toEqual(["plugin:my-plugin:db", "plugin_my-plugin_db"]);
  });
  it("호출의 서버 자리는 도구 이름 꼴의 첫 __ 앞까지다(1단계 요약과 같다)", () => {
    expect(callForm("reports__v2")).toBe("reports");
    expect(mcpRecordNames("reports__v2", null)).toEqual(["reports", "reports__v2"]);
    expect(callForm("a.b c")).toBe("a_b_c");
  });
  it("스킬은 폴더 이름과 머리말 이름이고 플러그인 스킬은 접두를 한 번만 붙인다", () => {
    expect(skillRecordNames("deploy-staging", "deploy", null)).toEqual(["deploy", "deploy-staging"]);
    expect(skillRecordNames("review", "fancy", "my-plugin")).toEqual(["my-plugin:fancy", "my-plugin:review"]);
    expect(skillRecordNames("review", "my-plugin:fancy", "my-plugin")).toEqual(["my-plugin:fancy", "my-plugin:review"]);
  });
});

describe(".claude.json", () => {
  it("CLAUDE_CONFIG_DIR가 있으면 그 폴더 안의 .claude.json이다", () => {
    expect(claudeJsonPath({ CLAUDE_CONFIG_DIR: join(root, "cfg") }, join(root, "home"))).toBe(join(resolve(root, "cfg"), ".claude.json"));
    expect(claudeJsonPath({}, join(root, "home"))).toBe(join(root, "home", ".claude.json"));
  });

  it("MCP 정의, 프로젝트마다의 승인·끄기, 사용 집계, claude.ai 이름만 읽는다", async () => {
    const path = join(root, ".claude.json");
    await put(
      path,
      JSON.stringify({
        oauthAccount: { emailAddress: "someone@example.com" },
        mcpServers: { ctx: { type: "stdio", command: "npx", args: ["ctx"], env: { TOKEN: "secret-value" } } },
        projects: {
          "C:/dev/app": { mcpServers: { local1: { command: "x" } }, enabledMcpjsonServers: ["p1"], disabledMcpjsonServers: [], disabledMcpServers: ["ctx"] },
          broken: "nope",
        },
        skillUsage: {
          a: { usageCount: 3, lastUsedAt: 1_700_000_000_000 },
          "p:b": { usageCount: 1, lastUsedAt: 1_700_000_100_000 },
          bad: { lastUsedAt: "x" },
          "no-time": { usageCount: 2 },
          "too-big": { lastUsedAt: 9_000_000_000_000_000 },
          "not-an-entry": 7,
        },
        pluginUsage: { "p@m": { usageCount: 1, lastUsedAt: 1_700_000_200_000, lastUsedNumStartups: 4 }, "q@m": { usageCount: 1 } },
        claudeAiMcpEverConnected: ["claude.ai Gmail", "claude.ai Gmail", 5],
      }),
    );
    const facts = await readClaudeJson(path);
    expect(facts.status).toBe("ok");
    expect(facts.userMcpServers.map((s) => s.name)).toEqual(["ctx"]);
    expect(facts.projects).toHaveLength(1);
    expect(facts.projects[0]).toMatchObject({ key: "C:/dev/app", enabledMcpjsonServers: ["p1"], disabledMcpServers: ["ctx"] });
    expect(facts.projects[0]!.mcpServers.map((s) => s.name)).toEqual(["local1"]);
    // 항목은 있는데 시각을 읽을 수 없으면(없다, 숫자가 아니다, 날짜가 나타낼 수 있는 범위 밖이다) 버리지 않고 null로 남긴다(설계 11.3 「30일의 경계」)
    expect({ ...facts.skillUsage }).toEqual({ a: 1_700_000_000_000, "p:b": 1_700_000_100_000, bad: null, "no-time": null, "too-big": null, "not-an-entry": null });
    expect({ ...facts.pluginUsage }).toEqual({ "p@m": 1_700_000_200_000, "q@m": null });
    expect(facts.claudeAiEverConnected).toEqual(["claude.ai Gmail"]);
    expect(JSON.stringify({ ...facts, userMcpServers: [], projects: [] })).not.toContain("someone@example.com");
  });

  it("없거나 객체가 아니면 비어 있다", async () => {
    expect((await readClaudeJson(join(root, "none.json"))).status).toBe("missing");
    await put(join(root, "arr.json"), "[]");
    expect((await readClaudeJson(join(root, "arr.json"))).status).toBe("unparsable");
  });

  it("쓰는 도중에 읽혀 풀리지 않았으면 한 번 더 읽고, 두 번째에 풀리면 문제도 알림도 없다(설계 21.1)", async () => {
    const path = join(root, ".claude.json");
    await put(path, JSON.stringify({ mcpServers: { a: { command: "x" } } }));
    vi.mocked(fsp.readFile).mockImplementationOnce((async () => '{"mcpServers": {') as never);
    const facts = await readClaudeJson(path);
    expect(facts.status).toBe("ok");
    expect(facts.userMcpServers.map((s) => s.name)).toEqual(["a"]);
    expect(vi.mocked(fsp.readFile)).toHaveBeenCalledTimes(2);
  });
});

describe("정의의 지문", () => {
  const salt = "ab".repeat(32);
  it("열쇠의 차례와 상관없이 같은 정의는 같은 지문이다", () => {
    expect(definitionHash(salt, { command: "npx", args: ["a"] })).toBe(definitionHash(salt, { args: ["a"], command: "npx" }));
  });
  it("주소의 질의 문자열만 달라도, 환경 변수의 값만 달라도 다른 설치다", () => {
    expect(definitionHash(salt, { url: "https://e.example/mcp?project=a" })).not.toBe(definitionHash(salt, { url: "https://e.example/mcp?project=b" }));
    expect(definitionHash(salt, { command: "x", env: { TOKEN: "1" } })).not.toBe(definitionHash(salt, { command: "x", env: { TOKEN: "2" } }));
  });
  it("무작위 값이 다르면 지문이 다르고, 지문에 원문이 없다", () => {
    const hash = definitionHash(salt, { command: "x", env: { TOKEN: "secret-value" } });
    expect(hash).not.toBe(definitionHash("cd".repeat(32), { command: "x", env: { TOKEN: "secret-value" } }));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("secret");
  });
  it("전송 방식, 명령, 인자, 머리말과 환경 변수의 이름과 값, 주소 가운데 하나만 달라도 지문이 다르다. 인자의 차례도 정의다", () => {
    const base = { type: "stdio", command: "npx", args: ["a", "b"], env: { K: "1" }, headers: { H: "v" }, url: "https://e.example/mcp" };
    const variants: Record<string, unknown>[] = [
      base,
      { ...base, type: "http" },
      { ...base, command: "node" },
      { ...base, args: ["a", "c"] },
      { ...base, args: ["b", "a"] },
      { ...base, env: { K2: "1" } },
      { ...base, env: { K: "2" } },
      { ...base, headers: { H2: "v" } },
      { ...base, headers: { H: "w" } },
      { ...base, url: "https://e.example/mcp2" },
    ];
    expect(new Set(variants.map((d) => definitionHash(salt, d))).size).toBe(variants.length);
  });
  it("묶음 안의 열쇠 차례까지 바꾼 같은 정의는 같은 지문이다", () => {
    expect(definitionHash(salt, { command: "x", env: { A: "1", B: "2" }, headers: { X: "1", Y: "2" } })).toBe(
      definitionHash(salt, { headers: { Y: "2", X: "1" }, env: { B: "2", A: "1" }, command: "x" }),
    );
  });
  it("너무 깊게 중첩된 정의는 지문이 null이다(정의를 읽지 못한 서버). 던지지 않는다", () => {
    const deep = JSON.parse(`${"[".repeat(200_000)}${"]".repeat(200_000)}`) as unknown;
    expect(definitionHash(salt, { command: "x", args: deep })).toBeNull();
    expect(definitionHash(salt, { command: "x", args: [] })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("막음과 승인", () => {
  const view = (value: Record<string, unknown> | null) => viewOf(value);
  const context = (layers: Record<string, unknown>[], managed: Record<string, unknown> | null = null, project: McpContext["project"] = null): McpContext => {
    const managedView = view(managed);
    return { layers: [...layers.map(view), managedView], managed: managedView, project };
  };

  it("이름(기록의 꼴 가운데 하나), 주소의 와일드카드, 명령 전체로 맞춘다", () => {
    expect(matcherHits({ serverName: "plugin:p:db" }, ["plugin:p:db", "plugin_p_db"], null)).toBe(true);
    expect(matcherHits({ serverUrl: "https://*.example.com/*" }, ["x"], { url: "https://api.example.com/mcp" })).toBe(true);
    expect(matcherHits({ serverUrl: "https://*.example.com/*" }, ["x"], { url: "https://example.org/mcp" })).toBe(false);
    expect(matcherHits({ serverCommand: ["npx", "srv"] }, ["x"], { command: "npx", args: ["srv"] })).toBe(true);
    expect(matcherHits({ serverCommand: ["npx"] }, ["x"], { command: "npx", args: ["srv"] })).toBe(false);
  });

  it("어느 층에서 막았거나, 관리 정책의 허용 목록 밖이거나, 그 프로젝트에서 끈 서버는 막힌 것이다", () => {
    expect(mcpAllowed(context([{ deniedMcpServers: [{ serverName: "a" }] }]), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{}], { allowedMcpServers: [{ serverName: "b" }] }), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{}], { allowedMcpServers: [{ serverName: "a" }] }), ["a"], null)).toBe(true);
    const project = { key: "k", normKey: "k", mcpServers: [], enabledMcpjsonServers: [], disabledMcpjsonServers: [], disabledMcpServers: ["a"] };
    expect(mcpAllowed(context([{}], null, project), ["a"], null)).toBe(false);
    expect(mcpAllowed(context([{}]), ["a"], null)).toBe(true);
  });

  it("막는 목록은 모든 층을 본다. 앞 층이 비어 있고 프로젝트·로컬·관리 정책 층 하나에서만 막아도 막힌 것이다", () => {
    const deny = { deniedMcpServers: [{ serverName: "s" }] };
    expect(mcpAllowed(context([{}, deny, {}]), ["s"], null)).toBe(false);
    expect(mcpAllowed(context([{}, {}, deny]), ["s"], null)).toBe(false);
    expect(mcpAllowed(context([{}, {}, {}], deny), ["s"], null)).toBe(false);
    expect(mcpAllowed(context([{}, {}, {}]), ["s"], null)).toBe(true);
  });

  it(".mcp.json의 서버는 모두 켜기나 켠 목록에 있어야 승인이고, 끈 목록이 먼저다", () => {
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true }]), "s")).toBe(true);
    expect(projectServerApproved(context([{ enabledMcpjsonServers: ["s"] }]), "s")).toBe(true);
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true, disabledMcpjsonServers: ["s"] }]), "s")).toBe(false);
    expect(projectServerApproved(context([{}]), "s")).toBe(false);
    const project = { key: "k", normKey: "k", mcpServers: [], enabledMcpjsonServers: ["s"], disabledMcpjsonServers: [], disabledMcpServers: [] };
    expect(projectServerApproved(context([{}], null, project), "s")).toBe(true);
  });

  it("일괄 승인은 우선순위가 가장 높은 층이 정한 값이다(신뢰한 폴더). 위 층의 거짓이 아래 층의 참을 덮고, 정하지 않은 층은 덮지 않는다", () => {
    // 층은 사용자, 프로젝트, 로컬 차례이고 관리 정책이 맨 위다
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true }], { enableAllProjectMcpServers: false }), "s")).toBe(false);
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true }, { enableAllProjectMcpServers: false }]), "s")).toBe(false);
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: false }, { enableAllProjectMcpServers: true }]), "s")).toBe(true);
    expect(projectServerApproved(context([{ enableAllProjectMcpServers: true }, {}, {}], {}), "s")).toBe(true);
    // 일괄 승인이 꺼져도 켠 목록에 있으면 승인이다
    expect(projectServerApproved(context([{ enabledMcpjsonServers: ["s"] }], { enableAllProjectMcpServers: false }), "s")).toBe(true);
  });
});
