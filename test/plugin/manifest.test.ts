// 두 도구의 플러그인 정보와 마켓 목록이 설계의 약속대로인지 본다(설계 5, 7.1, 23, 「4단계 계획에서 보완」, 「5단계 5부 계획 전 결정」). 그림 이용 조건은 test/report/assets.test.ts가 본다
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SELF_PLUGIN_NAMES } from "../../src/commands/self.ts";

const read = (path: string): string => readFileSync(path, "utf8");
const json = (path: string): Record<string, unknown> => JSON.parse(read(path)) as Record<string, unknown>;
const pkg = json("package.json");

/** 플러그인 정보에 쓰는 열쇠. 설계 7.1의 꼭 넣는 것(name, version, description, author, repository, license)에 화면 이름, 집, 찾기 낱말, 공식 목록의 아이콘(「0.2.1에서 정한 것」)을 더했다 */
const PLUGIN_KEYS = ["author", "description", "displayName", "homepage", "icon", "keywords", "license", "name", "repository", "version"];

describe("Claude Code 플러그인 정보", () => {
  it("이름은 이 도구가 스스로를 알아보는 플러그인 이름이고, 설명·라이선스는 package.json과 같으며 저작자와 저장소는 정한 값이다", () => {
    const plugin = json(".claude-plugin/plugin.json");
    expect(plugin.name).toBe(SELF_PLUGIN_NAMES[0]);
    expect(plugin.displayName).toBe("Chunsik's Garage");
    expect(plugin.description).toBe(pkg.description);
    expect(plugin.license).toBe("MIT");
    expect(plugin.license).toBe(pkg.license);
    expect(plugin.author).toEqual({ name: "yeunlee1" });
    expect(plugin.repository).toBe("https://github.com/yeunlee1/chunsik-garage");
    expect(plugin.homepage).toBe("https://github.com/yeunlee1/chunsik-garage");
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Array.isArray(plugin.keywords) && plugin.keywords.length > 0 && plugin.keywords.every((word) => typeof word === "string" && word !== "")).toBe(true);
  });

  it("정한 열쇠만 쓴다(메일 같은 개인 정보와 쓰지 않는 구성 요소를 넣지 않는다)", () => {
    expect(Object.keys(json(".claude-plugin/plugin.json")).sort()).toEqual(PLUGIN_KEYS);
  });
});

describe("Claude Code 마켓 목록", () => {
  it("이 저장소 뿌리(./)를 플러그인 하나로 싣고, 마켓과 플러그인의 이름·설명·버전이 플러그인 정보와 같다", () => {
    const plugin = json(".claude-plugin/plugin.json");
    const market = json(".claude-plugin/marketplace.json");
    expect(market.name).toBe("chunsik-garage");
    expect(market.description).toBe(plugin.description);
    expect(market.owner).toEqual({ name: "yeunlee1" });
    expect(Object.keys(market).sort()).toEqual(["description", "name", "owner", "plugins"]);
    expect(market.plugins).toEqual([{ name: plugin.name, source: "./", description: plugin.description, version: plugin.version }]);
  });
});

/** Codex 플러그인 정보에 쓰는 열쇠. Codex 매니페스트의 칸만 쓰고 저작자·저장소·라이선스는 넣지 않는다(「5단계 5부 계획 전 결정」 2번) */
const CODEX_PLUGIN_KEYS = ["description", "hooks", "interface", "keywords", "name", "skills", "version"];

describe("Codex 플러그인 정보(설계 7.1, 「5단계 5부 계획 전 결정」 2번)", () => {
  it("이름·버전·설명·찾기 낱말은 Claude Code 플러그인 정보와 같고, 스킬 자리는 ./skills/, 훅은 빈 묶음이다", () => {
    const claude = json(".claude-plugin/plugin.json");
    const codex = json(".codex-plugin/plugin.json");
    expect(Object.keys(codex).sort()).toEqual(CODEX_PLUGIN_KEYS);
    expect([codex.name, codex.version, codex.description, codex.keywords]).toEqual([claude.name, claude.version, claude.description, claude.keywords]);
    expect(codex.skills).toBe("./skills/");
    expect(codex.hooks).toEqual({});
  });

  it("화면에 보일 이름, 짧은 설명, 만든 이, 집 주소를 interface에 둔다", () => {
    expect(json(".codex-plugin/plugin.json").interface).toEqual({
      displayName: "Chunsik's Garage",
      shortDescription: "AQ checkup for your AI coding tools",
      developerName: "yeunlee1",
      websiteURL: "https://github.com/yeunlee1/chunsik-garage",
    });
  });
});

describe("Codex 마켓 목록(설계 7.1, 「5단계 5부 계획 전 결정」 3번)", () => {
  it("이 저장소 뿌리(./)를 플러그인 하나로 싣고, 마켓과 플러그인의 이름·설명·버전이 플러그인 정보와 같다", () => {
    const codex = json(".codex-plugin/plugin.json");
    const market = json(".agents/plugins/marketplace.json");
    expect(Object.keys(market).sort()).toEqual(["interface", "name", "plugins"]);
    expect(market.name).toBe("chunsik-garage");
    expect(market.interface).toEqual({ displayName: "Chunsik's Garage" });
    expect(market.plugins).toEqual([{ name: codex.name, source: "./", version: codex.version, description: codex.description }]);
  });
});

