// 설치의 정체 열쇠를 시험한다. 같은 이름이라도 범위·실제 경로·정의가 다르면 다른 설치이고, 정의가 없는 서버는 정체가 없다(설계 11.3, 18.1, 21.1)
import { describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { installKeysOf, mcpInstallKey, skillInstallKey } from "../../src/scan/identity.ts";
import type { ClaudeSetupFacts, McpFact, SkillFact } from "../../src/scan/types.ts";

const skill = (over: Partial<SkillFact>): SkillFact => ({
  scope: "user",
  name: "a",
  recordNames: ["a"],
  path: "/h/.claude/skills/a",
  realPath: "/h/.claude/skills/a",
  isLink: false,
  contentHash: null,
  createdMs: null,
  targetCreatedMs: null,
  projectRoot: null,
  pluginId: null,
  enabled: true,
  listed: true,
  readable: true,
  nameUnreadable: false,
  managedFixed: false,
  hookProvided: false,
  usageLastUsedMs: null,
  ...over,
});
const server = (over: Partial<McpFact>): McpFact => ({
  scope: "user",
  name: "s",
  recordNames: ["s"],
  projectRoot: null,
  pluginId: null,
  definitionHash: "h1",
  enabled: true,
  managedFixed: false,
  ...over,
});

describe("설치의 정체", () => {
  it("같은 이름의 스킬이 사용자 범위와 프로젝트 범위에 따로 있으면 다른 설치다", () => {
    expect(skillInstallKey(skill({}))).not.toBe(skillInstallKey(skill({ scope: "project", realPath: "/p/.claude/skills/a" })));
  });
  it("링크의 대상을 바꾸면(이름은 그대로) 다른 설치다", () => {
    expect(skillInstallKey(skill({ isLink: true, realPath: "/store/v1/a" }))).not.toBe(skillInstallKey(skill({ isLink: true, realPath: "/store/v2/a" })));
  });
  it("MCP 서버의 정의가 달라지면 다른 설치이고, 정의가 없는 서버는 정체가 없다", () => {
    expect(mcpInstallKey(server({}))).not.toBe(mcpInstallKey(server({ definitionHash: "h2" })));
    expect(mcpInstallKey(server({ scope: "claude-ai", definitionHash: null }))).toBeNull();
  });
  it("스킬은 범위, 이름, 실제 경로 가운데 하나만 달라도 다른 설치다", () => {
    const keys = [skill({}), skill({ scope: "project" }), skill({ name: "b" }), skill({ realPath: "/h/.claude/skills/other" })].map(skillInstallKey);
    expect(new Set(keys).size).toBe(4);
  });
  it("두 프로젝트가 같은 원본을 같은 이름의 링크로 걸면 설치는 둘이다(프로젝트 스킬의 정체에는 프로젝트가 든다)", () => {
    const a = skill({ scope: "project", projectRoot: "/p1", path: "/p1/.claude/skills/a", realPath: "/store/a", isLink: true });
    const b = skill({ scope: "project", projectRoot: "/p2", path: "/p2/.claude/skills/a", realPath: "/store/a", isLink: true });
    expect(skillInstallKey(a)).not.toBe(skillInstallKey(b));
  });
  it("실제 경로를 모르면 정규화한 경로로 정체를 만든다", () => {
    expect(skillInstallKey(skill({ realPath: null }))).toBe(skillInstallKey(skill({ realPath: normalizePath("/h/.claude/skills/a") })));
    expect(skillInstallKey(skill({ realPath: null }))).not.toBe(skillInstallKey(skill({ realPath: null, path: "/h/.claude/skills/b" })));
  });
  it("MCP 서버는 범위, 프로젝트, 플러그인, 이름, 정의의 지문 가운데 하나만 달라도 다른 설치다", () => {
    const keys = [server({}), server({ scope: "local" }), server({ projectRoot: "/p" }), server({ pluginId: "x@m" }), server({ name: "t" }), server({ definitionHash: "h2" })].map(mcpInstallKey);
    expect(new Set(keys).size).toBe(6);
  });
  it("모든 스킬과 정의가 있는 서버의 열쇠를 차례대로 낸다", () => {
    const facts = { skills: [skill({}), skill({ name: "b", realPath: "/h/.claude/skills/b" })], mcpServers: [server({}), server({ name: "c", scope: "claude-ai", definitionHash: null })] } as ClaudeSetupFacts;
    const keys = installKeysOf(facts);
    expect(keys).toHaveLength(3);
    expect([...keys].sort()).toEqual(keys);
  });
});
