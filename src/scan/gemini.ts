// 제미나이 CLI의 지금 셋팅을 읽어 셋팅 사실로 낸다. 시스템 기본값·사용자 설정·신뢰한 프로젝트 층(.gemini/settings.json)·시스템 설정, 승인 방식·샌드박스·셸 자동 허용, 지침(GEMINI.md), MCP 서버를 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 10, 「0.4.0에서 정한 것」)
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { geminiHome } from "../adapters/gemini/locate.ts";
import { entryInfo } from "./fs.ts";
import { boundaryMarkersOf, contextFileNames, folderTrustOn, geminiSafetyOf, geminiSystemPaths, geminiTrustOf, mcpFilterOf, readGeminiSettings, serversOfLayer, trustRuleBases, trustRulesValid, unknownGeminiSafety } from "./gemini-settings.ts";
import { emptyInstructionSet, reachesNetwork, readInstructionSet, realPaths } from "./instructions.ts";
import { isObject } from "./json.ts";
import { definitionHash } from "./mcp.ts";
import { projectNamesOf } from "./claude.ts";
import { groupProjects, type ProjectRef } from "./projects.ts";
import { secretSpots, sortSecrets } from "./secrets.ts";
import type { FileStatus, GeminiProjectFact, GeminiSetupFacts, McpFact, SecretFact, SetupProblem } from "./types.ts";

type Json = Record<string, unknown>;

export interface GeminiScanInput {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 수집 구간에 응답이 있는 주 세션의 작업 폴더(도구를 합친 것, 설계 10 「프로젝트 목록」) */
  cwds: readonly string[];
  /** 상태 파일의 무작위 값(16진 64자) */
  salt: string;
}

type ProblemDraft = SetupProblem extends infer P ? (P extends SetupProblem ? Omit<P, "realPath"> : never) : never;
const slashed = (path: string): string => path.replace(/\\/g, "/");
const cmp = (a: string | null, b: string | null): number => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);
const SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 } as const;
const known = (status: FileStatus): boolean => status === "ok" || status === "missing";

/**
 * 기록의 MCP 서버 마디로 맞출 이름. 제미나이는 도구 이름을 mcp_<서버>_<도구>로 짓고 허용되지 않는 글자를 밑줄로 바꾸며, 기록을 읽는 쪽은 mcp_ 뒤 첫 밑줄까지를 서버로 본다.
 * 그래서 서버 이름을 같은 규칙으로 바꾼 뒤 첫 밑줄 앞만 남긴다(공개 소스 tools/mcp-tool.ts의 generateValidName, parseMcpToolName)
 */
export function geminiServerRecordName(name: string): string {
  const valid = name.replace(/[^a-zA-Z0-9_\-.:]/g, "_");
  const cut = valid.indexOf("_");
  return cut === -1 ? valid : valid.slice(0, cut);
}

/** 연결을 푼 실제 경로. 네트워크를 가리키는 경로는 조회만으로 네트워크에 닿을 수 있어 풀지 않는다. 없는 경로는 그대로다 */
async function realOrSelf(path: string): Promise<string> {
  if (await reachesNetwork(path)) return path;
  return (await entryInfo(path)).realPath ?? path;
}

/**
 * 제미나이 지침의 가져오기 경계. 그 폴더부터 위로 경계 표지(기본 .git)가 있는 폴더를 찾고, 없으면 그 폴더다. 표지 목록이 비면 그 폴더다
 * (공개 소스 utils/memoryImportProcessor.ts의 findProjectRoot)
 */
async function importBoundary(dir: string, markers: readonly string[]): Promise<string> {
  const start = resolve(dir);
  if (markers.length === 0 || (await reachesNetwork(start))) return start;
  for (let current = start; ; ) {
    for (const marker of markers) {
      if (marker === "" || isAbsolute(marker) || marker.includes("..")) continue;
      if ((await entryInfo(join(current, marker))).exists) return current;
    }
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

/** 그 맥락의 거르개로 서버가 켜져 있는지. allowed가 있으면 그 목록에 든 이름만, excluded에 든 이름은 꺼진다 */
function serverOn(filter: { allowed: string[] | null; excluded: string[] }, name: string): boolean {
  if (filter.allowed !== null && !filter.allowed.includes(name)) return false;
  return !filter.excluded.includes(name);
}

export async function scanGeminiSetup(input: GeminiScanInput): Promise<GeminiSetupFacts> {
  const home = geminiHome(input.env, input.homedir);
  const userFile = join(home, "settings.json");
  const userRead = await readGeminiSettings(userFile);
  const user = userRead.value;
  const problems: ProblemDraft[] = [];
  const geminiPlace = (path: string): string => `${input.env.GEMINI_CLI_HOME?.trim() ? "$GEMINI_CLI_HOME/.gemini" : "~/.gemini"}/${slashed(relative(home, path))}`;
  if (userRead.status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: userFile, place: geminiPlace(userFile) });

  // 시스템 기본값은 사용자 층 아래에 깔리고, 시스템 설정은 모든 층 위에서 덮어쓴다(공개 소스 cli/src/config/settings.ts의 loadSettings)
  const systemPaths = geminiSystemPaths(input.env, input.platform);
  const defaultsRead = await readGeminiSettings(systemPaths.defaults);
  const systemRead = await readGeminiSettings(systemPaths.settings);
  const managedParts = [
    { path: systemPaths.defaults, status: defaultsRead.status },
    { path: systemPaths.settings, status: systemRead.status },
  ].filter((part) => part.status !== "missing");
  for (const part of managedParts) if (part.status === "unparsable") problems.push({ kind: "unparsable", owner: "managed", path: part.path, place: null });
  const outerKnown = known(userRead.status) && known(defaultsRead.status) && known(systemRead.status);
  /** 프로젝트 층(없으면 빼고)을 시스템 기본값·사용자 층과 시스템 설정 사이에 끼운 층들 */
  const layersWith = (project: Json | null): Json[] => [defaultsRead.value, user, ...(project === null ? [] : [project]), systemRead.value];

  // 작업 폴더 신뢰. 기능이 꺼져 있으면 모든 폴더를 신뢰하고 규칙 파일을 읽지 않는다(공개 소스 utils/trust.ts의 checkPathTrust)
  const folderTrust = folderTrustOn(layersWith(null));
  const defaultTrustFile = join(home, "trustedFolders.json");
  const trustFile = input.env.GEMINI_CLI_TRUSTED_FOLDERS_PATH?.trim() || defaultTrustFile;
  const trustRead = await readGeminiSettings(trustFile);
  const trustStatus: FileStatus = trustRead.status === "ok" && !trustRulesValid(trustRead.value) ? "unparsable" : trustRead.status;
  if (folderTrust && trustStatus === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: trustFile, place: trustFile === defaultTrustFile ? geminiPlace(trustFile) : "$GEMINI_CLI_TRUSTED_FOLDERS_PATH" });
  // 규칙의 폴더와 프로젝트 폴더는 연결을 푼 실제 경로로 견준다(공개 소스 utils/trust.ts의 getRealPath, isPathTrusted)
  const realBases = new Map<string, string>();
  if (folderTrust && trustStatus === "ok") for (const base of trustRuleBases(trustRead.value)) if (!realBases.has(base)) realBases.set(base, await realOrSelf(base));
  const trustedRoot = async (root: string): Promise<boolean> =>
    !folderTrust || (trustStatus === "ok" && geminiTrustOf(trustRead.value, await realOrSelf(root), input.platform, (base) => realBases.get(base) ?? base) === "trusted");

  const refs = await groupProjects(input.cwds, { homedir: input.homedir, tmpdir: input.tmpdir, platform: input.platform });
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  const projectNames = projectNamesOf(refs);
  const projectPlace = (ref: ProjectRef, path: string): string => `${projectNames.get(ref.normRoot)!}/${slashed(relative(ref.root, path))}`;
  const homeReal = (await entryInfo(home)).realPath ?? normalizePath(home);

  // 전역 지침(<홈>/.gemini/<지침 파일 이름>). 가져오기(@경로)는 제미나이처럼 경계(위로 .git이 있는 폴더, 없으면 지침의 폴더) 안만 따른다
  const markers = boundaryMarkersOf(layersWith(null));
  const globalRead = await readInstructionSet(
    contextFileNames(layersWith(null)).map((name) => join(home, name)),
    active,
    new Set(),
    { homedir: input.homedir, within: await importBoundary(home, markers), style: "gemini" },
  );

  // 신뢰한 프로젝트마다 .gemini/settings.json(프로젝트 층)과 뿌리의 지침. 신뢰하지 않는 폴더의 것은 제미나이가 쓰지 않아 읽지 않는다
  const projects: GeminiProjectFact[] = [];
  const projectLayers: { normRoot: string; layer: Json }[] = [];
  for (const ref of refs) {
    const trusted = ref.exists && !ref.excluded && (await trustedRoot(ref.root));
    if (!ref.exists || ref.excluded || !trusted) {
      projects.push({ normRoot: ref.normRoot, scanned: ref.exists && !ref.excluded, trusted, settingsStatus: null, instructions: emptyInstructionSet(), safety: null });
      continue;
    }
    const dir = join(ref.root, ".gemini");
    // 홈 폴더의 .gemini는 사용자 층이라 프로젝트 층으로 다시 읽지 않는다
    const sameAsHome = normalizePath(dir) === normalizePath(home) || (await entryInfo(dir)).realPath === homeReal;
    const file = join(dir, "settings.json");
    const read = sameAsHome ? { status: "missing" as const, value: {} } : await readGeminiSettings(file);
    if (read.status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: file, place: projectPlace(ref, file) });
    const layers = layersWith(read.value);
    const within = await importBoundary(ref.root, boundaryMarkersOf(layers));
    const instructions = (await readInstructionSet(contextFileNames(layers).map((name) => join(ref.root, name)), [], realPaths(globalRead.set), { homedir: input.homedir, within, style: "gemini" })).set;
    projects.push({ normRoot: ref.normRoot, scanned: true, trusted: true, settingsStatus: read.status, instructions, safety: outerKnown && known(read.status) ? geminiSafetyOf(layers) : null });
    if (read.status === "ok") projectLayers.push({ normRoot: ref.normRoot, layer: read.value });
  }

  // MCP 서버(사용자 층과 신뢰한 프로젝트 층). 확장(extensions)과 시스템 설정이 넣는 서버는 이 버전에서 보지 않는다
  const mcpServers: McpFact[] = [];
  const secrets: SecretFact[] = [];
  const addServers = (scope: "user" | "project", projectRoot: string | null, layer: Json, filter: { allowed: string[] | null; excluded: string[] }): void => {
    for (const [name, definition] of Object.entries(serversOfLayer(layer))) {
      const shaped = isObject(definition) ? definition : null;
      mcpServers.push({
        scope,
        name,
        recordNames: [geminiServerRecordName(name)],
        projectRoot,
        pluginId: null,
        definitionHash: shaped === null ? null : definitionHash(input.salt, shaped),
        enabled: shaped !== null && serverOn(filter, name),
        managedFixed: false,
        // 이 버전은 제미나이 서버의 안 쓰는 것을 판정하지 않아 관측 기록에 넣지 않는다
        installKey: null,
      });
      for (const spot of secretSpots(shaped)) secrets.push({ scope, server: name, projectRoot, ...spot });
    }
  };
  addServers("user", null, user, mcpFilterOf(layersWith(null)));
  for (const project of projectLayers) addServers("project", project.normRoot, project.layer, mcpFilterOf(layersWith(project.layer)));
  mcpServers.sort((a, b) => cmp(a.name, b.name) || SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || cmp(a.projectRoot, b.projectRoot));

  const uniqueProblems: SetupProblem[] = [];
  for (const problem of new Map(problems.map((p) => [`${p.kind}|${p.owner}|${p.path}`, p])).values()) uniqueProblems.push({ ...problem, realPath: (await entryInfo(problem.path)).realPath });
  uniqueProblems.sort((a, b) => cmp(a.path, b.path) || cmp(a.kind, b.kind));

  return {
    tool: "gemini",
    home,
    settings: userRead.status,
    managedParts,
    folderTrust,
    trustedFolders: trustStatus,
    globalInstructions: globalRead.set,
    globalMentions: globalRead.mentions,
    safety: outerKnown ? geminiSafetyOf(layersWith(null)) : unknownGeminiSafety(),
    // 스킬 폴더는 이 버전에서 훑지 않는다. 사용자 스킬 자리를 읽지 못한 것으로 두어 스킬 규칙이 0으로 재지 않게 한다
    skills: [],
    mcpServers,
    projects,
    problems: uniqueProblems,
    secrets: sortSecrets(secrets),
    unreadableDirs: [...new Set(globalRead.set.unreadableDirs)].sort(),
    unreadableSkillPlaces: { user: true, projects: [], plugins: [] },
  };
}
