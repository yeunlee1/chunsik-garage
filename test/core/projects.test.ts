// 세션을 프로젝트에 잇고 프로젝트마다 점수 구간의 주 세션을 도구별로 세는 것을 시험한다(설계 10 「프로젝트 목록」, 「프로젝트의 정체」)
import { describe, expect, it } from "vitest";
import { makeWindows } from "../../src/adapters/common/dates.ts";
import type { ToolId } from "../../src/adapters/types.ts";
import { projectLookup, projectUsage } from "../../src/core/projects.ts";
import { toolTotals } from "../../src/core/totals.ts";
import { project } from "../helpers/facts.ts";
import { summary, type SummaryInput } from "../helpers/summaries.ts";

const windows = makeWindows(Date.UTC(2026, 10, 13, 3, 0), "Asia/Seoul");
const D = "2026-11-10";
const session = (cwd: string | null, input: SummaryInput = {}): SummaryInput => ({ cwd, days: { [D]: { responses: 1 } }, ...input });
const tool = (id: string, ...sessions: SummaryInput[]) => ({ tool: id as ToolId, totals: toolTotals(sessions.map((s) => summary(s)), windows, []) });

describe("projectLookup", () => {
  const projects = [project("/work/app", { cwds: ["/work/app", "/work/app/web"] }), project("/work/lib")];
  const lookup = projectLookup(projects, { "C:\\Work\\App\\web": "/work/app/web", "/work/lib": "/work/lib", "/somewhere/else": "/somewhere/else" });

  it("세션의 작업 폴더를 정규화한 경로로 바꿔 그 폴더가 묶인 프로젝트를 찾는다", () => {
    expect(lookup("C:\\Work\\App\\web")?.normRoot).toBe("/work/app");
    expect(lookup("/work/lib")?.normRoot).toBe("/work/lib");
  });
  it("작업 폴더가 없거나, 정규화한 경로를 모르거나, 목록의 어느 프로젝트에도 묶이지 않으면 null이다", () => {
    expect(lookup(null)).toBeNull();
    expect(lookup("/work/app/web")).toBeNull();
    expect(lookup("/somewhere/else")).toBeNull();
  });
  it("정규화 표의 열쇠가 객체의 기본 속성 이름이어도 그 이름의 작업 폴더로만 본다", () => {
    expect(projectLookup(projects, {})("constructor")).toBeNull();
    expect(projectLookup(projects, {})("__proto__")).toBeNull();
  });
});

describe("projectUsage", () => {
  const projects = [project("/work/lib"), project("/work/app", { cwds: ["/work/app", "/work/app/web"] }), project("/work/idle")];
  const lookup = projectLookup(projects, { "/work/app": "/work/app", "/work/app/web": "/work/app/web", "/work/lib": "/work/lib", "/work/idle": "/work/idle", "/gone": "/gone" });

  it("프로젝트마다 점수 구간에 응답이 있는 주 세션을 도구별로 센다. 하위 세션과 점수 구간 밖의 세션은 세지 않는다", () => {
    const usage = projectUsage(
      [
        tool("claude-code", session("/work/app"), session("/work/app/web"), session("/work/lib"), session("/work/lib", { kind: "sub" }), session("/work/idle", { days: { "2026-10-12": { responses: 9 } } })),
        tool("codex", session("/work/app")),
      ],
      lookup,
    );
    expect(usage.projects.map((use) => [use.project.normRoot, use.sessions, use.total])).toEqual([
      ["/work/app", { "claude-code": 2, codex: 1 }, 3],
      ["/work/lib", { "claude-code": 1 }, 1],
    ]);
    expect(usage.unlinkedSessions).toBe(0);
  });
  it("프로젝트는 정규화한 뿌리 차례로 내고 도구는 식별자 차례로 싣는다. 입력의 차례와 상관없다", () => {
    const a = projectUsage([tool("codex", session("/work/lib"), session("/work/app")), tool("claude-code", session("/work/app"))], lookup);
    const b = projectUsage([tool("claude-code", session("/work/app")), tool("codex", session("/work/app"), session("/work/lib"))], lookup);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Object.keys(a.projects[0]!.sessions)).toEqual(["claude-code", "codex"]);
  });
  it("작업 폴더가 없는 주 세션과 목록에 묶이지 않은 주 세션은 프로젝트에 넣지 않고 수를 낸다", () => {
    const usage = projectUsage([tool("claude-code", session(null), session("/gone"), session("/work/app"))], lookup);
    expect(usage.projects.map((use) => use.project.normRoot)).toEqual(["/work/app"]);
    expect(usage.unlinkedSessions).toBe(2);
  });
});
