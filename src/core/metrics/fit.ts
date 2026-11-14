// 셋팅으로 재는 상황 적합 규칙 넷을 잰다. 도구를 합치는 F3, F4, F6과 도구별 규칙 F5(순수 함수, 설계 11.3 「상황 적합」, 11.4 「규칙마다의 이유」)
import type { ToolId } from "../../adapters/types.ts";
import type { InstructionSet } from "../../scan/instructions.ts";
import type { ProjectFact } from "../../scan/types.ts";
import { scored, unmeasured, type Measurement } from "../measure.ts";
import type { ProjectUsage, ProjectUse } from "../projects.ts";
import { projectSettingsUnread, unread } from "../readability.ts";
import type { ToolSetup } from "./setup.ts";

/** 점수 구간에 주 세션이 이만큼이면 자주 쓰는 프로젝트이고, 그 프로젝트에서 주로 쓴 도구다(설계 11.3 F3) */
export const FREQUENT_SESSIONS = 3;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 스캐너가 셋팅을 읽은 프로젝트. 지금 PC에 없는 작업 폴더와 프로젝트로 보지 않는 폴더는 읽지 않았다(설계 10) */
const scanned = (project: ProjectFact): boolean => project.exists && !project.excluded;
const scannedProjects = (tool: ToolSetup): ProjectFact[] => tool.setup.projects.filter(scanned).sort((a, b) => byText(a.normRoot, b.normRoot));
const projectIn = (tool: ToolSetup | undefined, normRoot: string): ProjectFact | undefined => tool?.setup.projects.find((project) => project.normRoot === normRoot);

/** 지침이 없다고 센 프로젝트와, 주로 쓴 도구 가운데 그 도구가 읽는 지침이 없는 도구(도구 식별자 차례) */
export interface MissingInstructions {
  normRoot: string;
  /** 프로젝트 폴더의 이름(ProjectFact.name) */
  name: string;
  tools: string[];
}

/** 전역 지침과 가장 많이 겹치는 프로젝트 지침 */
export interface WorstOverlap {
  tool: ToolId;
  normRoot: string;
  /** 프로젝트 폴더의 이름(ProjectFact.name) */
  name: string;
}

const hasInstructionFiles = (set: InstructionSet): boolean => set.files.length > 0 || set.unreadable.length > 0 || set.unreadableDirs.length > 0;
/** 깃 저장소가 아니어도 프로젝트 지침이나 프로젝트 쪽 설정이 이미 있는 폴더는 프로젝트로 다루는 폴더다 */
const treatedAsProject = (project: ProjectFact | undefined): boolean => project !== undefined && (hasInstructionFiles(project.instructions) || project.hasSettings || project.hasLocalSettings);
/** 내용이 있는 지침 파일이 하나라도 있다. 빈 파일과 읽지 못한 파일은 세지 않는다 */
const hasInstructions = (project: ProjectFact | undefined): boolean => project?.instructions.files.some((file) => file.hasContent) ?? false;

/** 그 프로젝트에서 주 세션이 3개 이상인 도구와, 주 세션이 가장 많은 도구(수가 같으면 그 도구들 모두) */
function mainTools(use: ProjectUse): string[] {
  const most = Math.max(...Object.values(use.sessions));
  return Object.keys(use.sessions).filter((tool) => use.sessions[tool]! >= FREQUENT_SESSIONS || use.sessions[tool] === most);
}

function f3(tools: readonly ToolSetup[], usage: ProjectUsage): { measurement: Measurement; missing: MissingInstructions[] } {
  const byId = new Map<string, ToolSetup>(tools.map((tool) => [tool.tool, tool]));
  const missing: MissingInstructions[] = [];
  let targets = 0;
  for (const use of usage.projects) {
    const { project } = use;
    if (use.total < FREQUENT_SESSIONS || !scanned(project)) continue;
    if (project.kind !== "git" && !treatedAsProject(project) && !tools.some((tool) => treatedAsProject(projectIn(tool, project.normRoot)))) continue;
    targets++;
    const without = mainTools(use).filter((tool) => !hasInstructions(projectIn(byId.get(tool), project.normRoot)));
    if (without.length > 0) missing.push({ normRoot: project.normRoot, name: project.name, tools: without });
  }
  const withInstructions = targets - missing.length;
  const evidence = { targets, withInstructions };
  // 대상이 없는 것은 기록이 모자란 것이 아니라 해당하지 않는 것이다(설계 11.4 「F3과 I4」)
  return { measurement: targets === 0 ? unmeasured("not_applicable", evidence) : scored(withInstructions / targets, evidence), missing };
}

const instructionsUnread = (set: InstructionSet): boolean => set.unreadable.length > 0 || set.unreadableDirs.length > 0;

function f4(tools: readonly ToolSetup[]): { measurement: Measurement; worst: WorstOverlap | null } {
  let unreadable = false;
  let globalLines = 0;
  let comparedProjects = 0;
  let worst: (WorstOverlap & { overlapping: number; globalLines: number }) | null = null;
  for (const tool of [...tools].sort((a, b) => byText(a.tool, b.tool))) {
    const global = tool.setup.globalInstructions;
    const projects = scannedProjects(tool);
    if (instructionsUnread(global) || projects.some((project) => instructionsUnread(project.instructions))) unreadable = true;
    const lines = new Set(global.lineHashes);
    globalLines += lines.size;
    // 전역 지침이 없거나 견줄 줄(20자 이상)이 없으면 이 도구에서는 견줄 것이 없다
    if (global.files.length === 0 || lines.size === 0) continue;
    for (const project of projects) {
      // 프로젝트 지침이 없거나 전역 지침과 같은 파일뿐이면 견주지 않는다
      if (!project.instructions.files.some((file) => !file.sameAsGlobal)) continue;
      comparedProjects++;
      const overlapping = new Set(project.instructions.lineHashes.filter((hash) => lines.has(hash))).size;
      if (worst === null || overlapping * worst.globalLines > worst.overlapping * lines.size) worst = { tool: tool.tool, normRoot: project.normRoot, name: project.name, overlapping, globalLines: lines.size };
    }
  }
  // 읽지 못한 곳에 겹치는 줄이 있을 수 있다. 보이는 것만으로 재면 좋게 틀린다(설계 11.3)
  if (unreadable) return { measurement: unmeasured("unreadable", { comparedProjects: null, globalLines: null, overlappingLines: null }), worst: null };
  if (worst === null) return { measurement: unmeasured("not_applicable", { comparedProjects: 0, globalLines, overlappingLines: 0 }), worst: null };
  const evidence = { comparedProjects, globalLines: worst.globalLines, overlappingLines: worst.overlapping };
  return { measurement: scored(worst.overlapping / worst.globalLines, evidence), worst: { tool: worst.tool, normRoot: worst.normRoot, name: worst.name } };
}

function f5(tool: ToolSetup): Measurement {
  const places = tool.setup.unreadableSkillPlaces;
  if (places.user || places.projects.length > 0) return unmeasured("unreadable", { differingCopies: null, identicalCopies: null, skillKinds: null });
  // 같은 도구 안에서만 센다. 플러그인이 넣은 스킬은 사본으로도 종으로도 세지 않는다
  const hashesByName = new Map<string, Map<string, string | null>>();
  for (const skill of tool.setup.skills) {
    if (skill.scope === "plugin") continue;
    let copies = hashesByName.get(skill.name);
    if (copies === undefined) hashesByName.set(skill.name, (copies = new Map()));
    // 링크는 사본이 아니다. 실제 경로가 같은 위치는 한 번만 센다
    if (!skill.isLink) copies.set(skill.realPath ?? skill.path, skill.contentHash);
  }
  let identicalCopies = 0;
  let differingCopies = 0;
  for (const copies of hashesByName.values()) {
    const spare = copies.size - 1;
    if (spare <= 0) continue;
    const hashes = [...copies.values()];
    if (hashes.every((hash) => hash !== null && hash === hashes[0])) identicalCopies += spare;
    else differingCopies += spare;
  }
  const evidence = { differingCopies, identicalCopies, skillKinds: hashesByName.size };
  if (hashesByName.size === 0) return unmeasured("not_applicable", evidence);
  return scored((identicalCopies + 2 * differingCopies) / hashesByName.size, evidence);
}

function f6(tools: readonly ToolSetup[]): Measurement {
  let unreadable = false;
  let conflicts = 0;
  let projectsWithSettings = 0;
  for (const tool of tools) {
    // 전역 쪽은 사용자 설정만이다. 관리 정책 파일은 처음부터 견주지 않는다
    if (unread(tool.setup.settings.user) || projectSettingsUnread(tool.setup)) unreadable = true;
    for (const project of scannedProjects(tool)) {
      if (!project.hasSettings && !project.hasLocalSettings) continue;
      projectsWithSettings++;
      conflicts += project.permissionConflicts;
    }
  }
  if (unreadable) return unmeasured("unreadable", { conflicts: null, projectsWithSettings: null });
  const evidence = { conflicts, projectsWithSettings };
  return projectsWithSettings === 0 ? unmeasured("not_applicable", evidence) : scored(conflicts, evidence);
}

/** 도구를 합쳐서 재는 상황 적합 규칙. tools는 점수에 넣는 도구이고 usage는 같은 도구들로 만든 것이다. */
export function mergedFitRules(tools: readonly ToolSetup[], usage: ProjectUsage): Record<"F3" | "F4" | "F6", Measurement> & { missingInstructions: MissingInstructions[]; worstOverlap: WorstOverlap | null } {
  const guides = f3(tools, usage);
  const overlap = f4(tools);
  return { F3: guides.measurement, F4: overlap.measurement, F6: f6(tools), missingInstructions: guides.missing, worstOverlap: overlap.worst };
}

/** 도구 하나에서 셋팅으로 재는 상황 적합 규칙 */
export function fitToolRules(tool: ToolSetup): Record<"F5", Measurement> {
  return { F5: f5(tool) };
}
