// 합성 사용자를 짓는 도구. 규칙마다 바라는 값을 적으면 그 값이 나오는 세션 요약과 셋팅 사실을 만든다(설계 21.1 「점수」)
import type { EvaluationInput } from "../../src/core/evaluate.ts";
import type { SetupProblem } from "../../src/scan/types.ts";
import { claudeTool, evaluationInput, watched } from "./evaluation.ts";
import { instructionFile, instructions, mcpServer, project, skill } from "./facts.ts";
import type { DayInput, SummaryInput } from "./summaries.ts";

/** 규칙마다 바라는 값. 세션은 열둘, 스킬은 열, MCP 서버는 넷으로 고정한다 */
export interface Persona {
  /** I1 사용한 날(1에서 30) */
  activeDays: number;
  /** I2 하루의 사람 요청 */
  requestsPerDay: number;
  /** I3 요청 하나의 도구 호출 */
  callsPerRequest: number;
  /** I4 프로젝트 수(1, 2, 3, 4, 6, 12 가운데 하나. 세션 열둘을 고르게 나눈다) */
  projects: number;
  /** S1 전역 지침이 있다 */
  globalInstructions: boolean;
  /** S2 기본 모드가 권한 우회가 아니다 */
  safeguard: boolean;
  /** S3 문제 수 */
  problems: number;
  /** S4 훅 1,000번 가운데 실패 */
  hookFailures: number;
  /** S5 주 세션 열둘 가운데 MCP 연결 실패가 있었던 세션 */
  mcpFailedSessions: number;
  /** E1 입력 토큰 1,000 가운데 캐시에서 읽은 것 */
  cacheRead: number;
  /** E2 도구 결과 1,000 가운데 오류 */
  toolErrors: number;
  /** E3 주 세션 열둘의 자동 압축 횟수의 합 */
  compactions: number;
  /** E4 세션에 실리는 지침의 어림 토큰 */
  instructionTokens: number;
  /** E5 스킬 열 가운데 안 쓴 것이 확인된 것(나머지는 쓴 것) */
  unusedSkills: number;
  /** E6 서버 넷 가운데 안 부른 것이 확인된 것(나머지는 부른 것) */
  unusedServers: number;
  /** E7 사람 요청 1,000 가운데 멈춘 일(거절한 도구 실행) */
  stoppedPerThousand: number;
  /** F1 응답 1,000 가운데 xhigh로 돈 것(나머지는 high) */
  highEffort: number;
  /** F2 자동 압축이 있었던 세션 가운데 하위 에이전트를 쓴 세션 */
  delegatedSessions: number;
  /** F3 프로젝트 가운데 지침이 있는 것 */
  guidedProjects: number;
  /** F4 전역 지침 스무 줄 가운데 프로젝트 지침에 다시 나오는 줄 */
  overlappingLines: number;
  /** F5 스킬 열 가운데 내용이 같은 사본이 프로젝트에 하나 더 있는 것 */
  copiedSkills: number;
  /** F6 부딪히는 설정 쌍 */
  conflicts: number;
}

const SESSIONS = 12;
const pad = (n: number): string => String(n).padStart(2, "0");
/** 오늘(2026-11-13)에서 거꾸로 센 날짜들. 모두 점수 구간 안이다 */
const dateBefore = (daysAgo: number): string => new Date(Date.UTC(2026, 10, 13 - daysAgo)).toISOString().slice(0, 10);

export function personaInput(p: Persona): EvaluationInput {
  const roots = Array.from({ length: p.projects }, (_, i) => `/work/p${pad(i + 1)}`);
  const dates = Array.from({ length: p.activeDays }, (_, i) => dateBefore(i));
  const requests = p.requestsPerDay * p.activeDays;
  const skills = Array.from({ length: 10 }, (_, i) => skill(`skill${pad(i + 1)}`));
  const servers = Array.from({ length: 4 }, (_, i) => mcpServer(`server${i + 1}`));
  const usedSkills = skills.slice(p.unusedSkills).map((fact) => fact.name);
  const calledServers = servers.slice(p.unusedServers).map((fact) => fact.name);

  // 양으로 재는 것은 첫 세션의 첫날에 몰아 둔다. 나머지 칸은 응답 하나씩이다
  const bulk: DayInput = {
    responses: 1000,
    humanRequests: requests,
    tokens: { input: 1000 - p.cacheRead, cacheRead: p.cacheRead, cacheWrite: 0, output: 100 },
    tools: { Read: { calls: requests * p.callsPerRequest, results: 1000, errors: p.toolErrors, deniedByUser: Math.round((requests * p.stoppedPerThousand) / 1000) } },
    hooks: { PreToolUse: { runs: 1000, failures: p.hookFailures } },
    efforts: { high: 1000 - p.highEffort, xhigh: p.highEffort },
    skillSignals: Object.fromEntries(usedSkills.map((name) => [name, { tool: 1 }])),
    mcpCalls: Object.fromEntries(calledServers.map((name) => [name, 1])),
  };
  const sessions: SummaryInput[] = Array.from({ length: SESSIONS }, (_, i) => {
    // 날짜를 세션에 돌아가며 나눈다. 사용한 날이 세션보다 많으면 남는 날은 첫 세션이 쓴다
    const own = dates.filter((_, d) => d % SESSIONS === i || (i === 0 && d >= SESSIONS)).concat(i < dates.length ? [] : [dates[i % dates.length]!]);
    const days: Record<string, DayInput> = Object.fromEntries(own.map((date) => [date, { responses: 1 }]));
    const first = own[0]!;
    days[first] = {
      ...(i === 0 ? bulk : { responses: 1 }),
      autoCompactions: Math.floor(p.compactions / SESSIONS) + (i < p.compactions % SESSIONS ? 1 : 0),
      subagentCalls: i < p.delegatedSessions ? 1 : 0,
      mcpConnectionFailure: i < p.mcpFailedSessions,
    };
    return { sessionId: `session${pad(i + 1)}`, cwd: roots[i % roots.length]!, instructionChars: { ascii: 0, other: p.instructionTokens }, days };
  });

  const globalLines = Array.from({ length: 20 }, (_, i) => `global${pad(i + 1)}`);
  const problems: SetupProblem[] = Array.from({ length: p.problems }, (_, i) => ({ kind: "noFrontmatter", owner: "user", path: `/home/u/.claude/skills/broken${i + 1}`, realPath: `/home/u/.claude/skills/broken${i + 1}` }));
  const copies = skills.slice(0, p.copiedSkills).map((fact) => skill(fact.name, { scope: "project", projectRoot: roots[0]!, path: `${roots[0]}/.claude/skills/${fact.name}`, enabled: false }));
  const setup = {
    globalInstructions: p.globalInstructions ? instructions({ files: [instructionFile("/home/u/.claude/CLAUDE.md", { bytes: 2000 })], lineHashes: globalLines }) : instructions(),
    settings: { user: "ok" as const, managedParts: [], defaultMode: { user: p.safeguard ? null : ("bypass" as const), managed: null } },
    projects: roots.map((root, i) =>
      project(root, {
        instructions: i < p.guidedProjects ? instructions({ files: [instructionFile(`${root}/CLAUDE.md`)], lineHashes: i === 0 ? [...globalLines.slice(0, p.overlappingLines), "own-line"] : ["own-line"] }) : instructions(),
        hasSettings: i === 0,
        settingsStatus: i === 0 ? ("ok" as const) : ("missing" as const),
        permissionConflicts: i === 0 ? p.conflicts : 0,
      }),
    ),
    skills: [...skills, ...copies],
    mcpServers: servers,
    problems,
  };
  return evaluationInput([claudeTool({ sessions, setup })], { installs: watched(...skills, ...copies, ...servers) });
}

const BEST: Persona = {
  activeDays: 22,
  requestsPerDay: 40,
  callsPerRequest: 8,
  projects: 4,
  globalInstructions: true,
  safeguard: true,
  problems: 0,
  hookFailures: 5,
  mcpFailedSessions: 0,
  cacheRead: 930,
  toolErrors: 15,
  compactions: 3,
  instructionTokens: 3500,
  unusedSkills: 1,
  unusedServers: 0,
  stoppedPerThousand: 10,
  highEffort: 500,
  delegatedSessions: 3,
  guidedProjects: 4,
  overlappingLines: 0,
  copiedSkills: 0,
  conflicts: 0,
};

/** 등급 D부터 S까지의 합성 사용자 다섯. 위에서 아래로 갈수록 덜 쓰고, 셋팅이 덜 멀쩡하고, 낭비가 많다 */
export const PERSONAS: Record<"S" | "A" | "B" | "C" | "D", Persona> = {
  S: BEST,
  A: { ...BEST, activeDays: 16, requestsPerDay: 28, callsPerRequest: 6, cacheRead: 850, toolErrors: 35, compactions: 6, unusedSkills: 3, unusedServers: 1, highEffort: 800, guidedProjects: 3, overlappingLines: 1, hookFailures: 20 },
  B: { ...BEST, activeDays: 14, requestsPerDay: 24, callsPerRequest: 5, projects: 3, cacheRead: 800, toolErrors: 50, compactions: 10, instructionTokens: 7000, unusedSkills: 4, unusedServers: 2, stoppedPerThousand: 50, highEffort: 800, delegatedSessions: 4, guidedProjects: 2, overlappingLines: 2, copiedSkills: 1, conflicts: 1, problems: 1, hookFailures: 30, mcpFailedSessions: 1 },
  C: { ...BEST, activeDays: 10, requestsPerDay: 17, callsPerRequest: 4, projects: 2, cacheRead: 740, toolErrors: 65, compactions: 15, instructionTokens: 9000, unusedSkills: 5, unusedServers: 2, stoppedPerThousand: 70, highEffort: 850, delegatedSessions: 3, guidedProjects: 1, overlappingLines: 3, copiedSkills: 2, conflicts: 1, problems: 1, hookFailures: 45, mcpFailedSessions: 2 },
  D: { ...BEST, activeDays: 5, requestsPerDay: 9, callsPerRequest: 2, projects: 1, cacheRead: 600, toolErrors: 100, compactions: 26, instructionTokens: 14000, unusedSkills: 7, unusedServers: 3, stoppedPerThousand: 130, highEffort: 930, delegatedSessions: 2, guidedProjects: 0, overlappingLines: 5, copiedSkills: 3, conflicts: 3, problems: 3, hookFailures: 80, mcpFailedSessions: 3, safeguard: false, globalInstructions: false },
};
