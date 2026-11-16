// 확인(aq tune verify)이 다시 한 판정에서 대상의 실제 켜짐을 보는지 시험한다. 사용자 층을 꺼도 다른 층이 다시 켜면 켜진 것이다(설계 16.7, 6단계 나머지 구현 검증)
import { describe, expect, it } from "vitest";
import { stillOn } from "../../src/commands/tune-run.ts";

type JudgedArg = Parameters<typeof stillOn>[1];
const judged = (tool: "claude-code" | "codex", parts: { servers?: unknown[]; skills?: unknown[]; plugins?: unknown[] }): JudgedArg =>
  ({
    evaluation: { tools: [{ tool, skills: parts.skills ?? [], servers: parts.servers ?? [] }] },
    input: { tools: [{ tool, setup: { plugins: parts.plugins ?? [] } }] },
  }) as unknown as JudgedArg;
const server = (name: string, scope: string, enabled: boolean) => ({ server: { name, scope, enabled } });

describe("확인의 켜짐 판단", () => {
  it("Codex 서버는 사용자 층에서 꺼도 신뢰한 프로젝트 층이 다시 켜면 켜진 것이다", () => {
    const item = { unit: "A4", tool: "codex", target: "idle_codex" } as const;
    expect(stillOn(item, judged("codex", { servers: [server("idle_codex", "user", false), server("idle_codex", "project", true)] }))).toBe(true);
    expect(stillOn(item, judged("codex", { servers: [server("idle_codex", "user", false)] }))).toBe(false);
  });

  it("스킬은 그 이름의 묶음이 하나라도 켜져 있으면, 플러그인은 그 설치 ID가 켜져 있으면, 막은 서버는 같은 이름이 하나라도 켜져 있으면 켜진 것이다", () => {
    const bundle = (enabled: boolean) => ({ enabled, positions: [{ recordNames: ["idle"] }] });
    expect(stillOn({ unit: "A1", tool: "claude-code", target: "idle" }, judged("claude-code", { skills: [bundle(false), bundle(true)] }))).toBe(true);
    expect(stillOn({ unit: "A1", tool: "claude-code", target: "idle" }, judged("claude-code", { skills: [bundle(false)] }))).toBe(false);
    expect(stillOn({ unit: "A2", tool: "claude-code", target: "p@m" }, judged("claude-code", { plugins: [{ id: "p@m", enabled: true }] }))).toBe(true);
    expect(stillOn({ unit: "A2", tool: "claude-code", target: "p@m" }, judged("claude-code", { plugins: [{ id: "p@m", enabled: false }] }))).toBe(false);
    expect(stillOn({ unit: "A3", tool: "claude-code", target: "db" }, judged("claude-code", { servers: [server("db", "user", false), server("db", "local", true)] }))).toBe(true);
  });
});
