// 세션을 프로젝트에 잇고, 프로젝트마다 점수 구간의 주 세션을 도구별로 센다(순수 함수, 설계 10 「프로젝트 목록」, 「프로젝트의 정체」)
import type { ToolId } from "../adapters/types.ts";
import type { ProjectFact } from "../scan/types.ts";
import type { ToolTotals } from "./totals.ts";

/**
 * 세션의 작업 폴더(기록에 적힌 그대로) → 정규화한 경로. 경로를 다루는 일은 입력을 조립하는 쪽이 한다. core는 경로를 풀지 않는다.
 * 요약에 적힌 작업 폴더는 빠짐없이 이 표에 있어야 한다. 표에 없는 작업 폴더는 적힌 글자 그대로 견주게 되어, 표기만 다른 같은 폴더를 다른 폴더로 본다.
 */
export type NormalizedCwds = Readonly<Record<string, string>>;

/** 세션의 작업 폴더가 묶인 프로젝트. 작업 폴더가 없거나 목록의 어느 프로젝트에도 묶이지 않으면 null이다 */
export type ProjectLookup = (cwd: string | null) => ProjectFact | null;

export function projectLookup(projects: readonly ProjectFact[], normalizedCwds: NormalizedCwds): ProjectLookup {
  const byNormCwd = new Map<string, ProjectFact>();
  for (const project of projects) for (const cwd of project.cwds) byNormCwd.set(cwd, project);
  const byRawCwd = new Map<string, ProjectFact>();
  for (const [raw, normalized] of Object.entries(normalizedCwds)) {
    const project = byNormCwd.get(normalized);
    if (project !== undefined) byRawCwd.set(raw, project);
  }
  return (cwd) => (cwd === null ? null : (byRawCwd.get(cwd) ?? null));
}

export interface ProjectUse {
  project: ProjectFact;
  /** 점수 구간에 응답이 있는 주 세션의 수(도구 식별자 차례). 세션이 없던 도구는 싣지 않는다 */
  sessions: Record<string, number>;
  /** sessions의 합 */
  total: number;
}

export interface ProjectUsage {
  /** 점수 구간에 주 세션이 하나라도 있었던 프로젝트(정규화한 뿌리 차례). 프로젝트로 보지 않는 폴더와 지금 PC에 없는 폴더도 든다 */
  projects: ProjectUse[];
  /** 작업 폴더가 없거나 목록의 어느 프로젝트에도 묶이지 않은 주 세션의 수 */
  unlinkedSessions: number;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function projectUsage(tools: readonly { tool: ToolId; totals: ToolTotals }[], lookup: ProjectLookup): ProjectUsage {
  const counts = new Map<string, { project: ProjectFact; byTool: Map<string, number> }>();
  let unlinkedSessions = 0;
  for (const { tool, totals } of tools) {
    for (const session of totals.mainSessions) {
      const project = lookup(session.cwd);
      if (project === null) {
        unlinkedSessions++;
        continue;
      }
      let entry = counts.get(project.normRoot);
      if (entry === undefined) counts.set(project.normRoot, (entry = { project, byTool: new Map() }));
      entry.byTool.set(tool, (entry.byTool.get(tool) ?? 0) + 1);
    }
  }
  const projects = [...counts.keys()].sort(byText).map((normRoot): ProjectUse => {
    const { project, byTool } = counts.get(normRoot)!;
    const sessions: Record<string, number> = {};
    let total = 0;
    for (const tool of [...byTool.keys()].sort(byText)) {
      sessions[tool] = byTool.get(tool)!;
      total += byTool.get(tool)!;
    }
    return { project, sessions, total };
  });
  return { projects, unlinkedSessions };
}
