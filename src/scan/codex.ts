// Codex의 지금 셋팅을 읽어 셋팅 사실로 낸다. 사용자 설정과 신뢰한 프로젝트 층, 승인과 샌드박스, 지침, 스킬, 플러그인, MCP 서버를 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 10, 「5단계 2부 계획 전 결정」)
import { isAbsolute, join, relative, resolve } from "node:path";
import { normalizePath } from "../adapters/claude/locate.ts";
import { codexHome } from "../adapters/codex/locate.ts";
import { projectNamesOf } from "./claude.ts";
import { codexConfigShapeOk, isTable, mergeCodexLayers, parseCodexConfig, readCodexConfig, type TomlTable } from "./codex-config.ts";
import { readCodexGlobalInstructions, readCodexProjectInstructions } from "./codex-instructions.ts";
import { codexMcpFacts, codexMcpSecrets, type CodexMcpContext } from "./codex-mcp.ts";
import { readCodexPlugin, type CodexPluginRead } from "./codex-plugins.ts";
import { fallbackNames, pluginsFeatureOn, projectDocDisabled, safetyOf, trustOf, type CodexSafetyFact } from "./codex-settings.ts";
import { scanCodexSkillRoot, type CodexSkillRootScan } from "./codex-skills.ts";
import { entryInfo, readText } from "./fs.ts";
import { codexMcpInstallKey, codexSkillInstallKey } from "./identity.ts";
import { emptyInstructionSet } from "./instructions.ts";
import { groupProjects, type ProjectRef } from "./projects.ts";
import type { CodexPluginFact, CodexProjectFact, CodexSetupFacts, FileStatus, SecretFact, SetupProblem, SkillFact } from "./types.ts";

export interface CodexScanInput {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 수집 구간에 응답이 있는 주 세션의 작업 폴더(두 도구를 합친 것, 설계 10 「프로젝트 목록」) */
  cwds: readonly string[];
  /** 상태 파일의 무작위 값(16진 64자) */
  salt: string;
}

/** 실제 경로를 붙이기 전의 문제. 주인에 따라 위치가 있거나 없다 */
type ProblemDraft = SetupProblem extends infer P ? (P extends SetupProblem ? Omit<P, "realPath"> : never) : never;
const slashed = (path: string): string => path.replace(/\\/g, "/");
const cmp = (a: string | null, b: string | null): number => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);
const SKILL_SCOPE_ORDER = { user: 0, project: 1, plugin: 2 } as const;
const OWNER_ORDER = { user: 0, managed: 1, plugin: 2, tool: 3 } as const;

interface SkillRule {
  /** SKILL.md의 실제 경로(정규화) */
  path: string | null;
  name: string | null;
  enabled: boolean;
}

/** [[skills.config]]의 path. ~, ~/, ~\로 시작하면 홈으로 풀고, 상대 경로면 설정 파일의 폴더(Codex 홈)에서 풀며, 링크를 풀어 견준다(공개 소스 utils/absolute-path) */
async function rulePath(raw: string, home: string, homedir: string): Promise<string> {
  const expanded = raw === "~" ? homedir : raw.startsWith("~/") || raw.startsWith("~\\") ? join(homedir, raw.slice(2)) : raw;
  const absolute = isAbsolute(expanded) ? expanded : resolve(home, expanded);
  return (await entryInfo(absolute)).realPath ?? normalizePath(absolute);
}

/** 사용자 층의 [[skills.config]] 규칙(차례대로). path와 name 가운데 정확히 하나가 있고 name이 비지 않은 항목만 쓴다(공개 소스 config/src/skills_config.rs) */
async function skillRules(user: TomlTable, home: string, homedir: string): Promise<SkillRule[]> {
  const skills = isTable(user.skills) ? user.skills : {};
  const list = Array.isArray(skills.config) ? skills.config : [];
  const rules: SkillRule[] = [];
  for (const entry of list) {
    if (!isTable(entry) || typeof entry.enabled !== "boolean") continue;
    const path = typeof entry.path === "string" ? entry.path : null;
    const name = typeof entry.name === "string" ? entry.name.trim() : null;
    if ((path === null) === (name === null) || name === "") continue;
    rules.push({ path: path === null ? null : await rulePath(path, home, homedir), name, enabled: entry.enabled });
  }
  return rules;
}

/** 규칙을 차례대로 보아 그 스킬에 맞는 마지막 규칙의 값이다. 맞는 것이 없으면 켜져 있다 */
function enabledByRules(rules: readonly SkillRule[], skillFile: string | null, name: string): boolean {
  let enabled = true;
  for (const rule of rules) if ((rule.path !== null && rule.path === skillFile) || (rule.name !== null && rule.name === name)) enabled = rule.enabled;
  return enabled;
}

/** 그 맥락의 설정으로 플러그인이 켜져 있는지. [features]의 plugins가 거짓이면 모두 꺼지고, 항목의 enabled(없으면 [plugins._default]의 enabled, 그것도 없으면 참)다 */
function configuredIn(merged: TomlTable, id: string): boolean {
  if (!pluginsFeatureOn(merged)) return false;
  const plugins = isTable(merged.plugins) ? merged.plugins : {};
  const entry = plugins[id];
  if (!isTable(entry) || entry.enabled === false) return false;
  const fallback = plugins._default;
  return entry.enabled !== undefined || !isTable(fallback) || fallback.enabled !== false;
}

const loadable = (plugin: CodexPluginRead): boolean => plugin.idValid && plugin.install === "ok" && plugin.manifest === "ok";

/** CODEX_HOME으로 옮겨 쓰면 기본 위치(~/.codex/config.toml)의 서버 정의도 비밀값의 자리만 본다. 점수에는 넣지 않는다(0.3.0) */
async function codexDefaultCopySecrets(input: CodexScanInput): Promise<SecretFact[]> {
  const defaultHome = join(input.homedir, ".codex");
  if (!input.env.CODEX_HOME?.trim() || normalizePath(codexHome(input.env, input.homedir)) === normalizePath(defaultHome)) return [];
  const read = await readCodexConfig(join(defaultHome, "config.toml"));
  if (read.status !== "ok") return [];
  return codexMcpSecrets(read.value, []).map((secret) => ({ ...secret, copy: "default" as const }));
}

export async function scanCodexSetup(input: CodexScanInput): Promise<CodexSetupFacts> {
  const home = codexHome(input.env, input.homedir);
  const userFile = join(home, "config.toml");
  const userRead = await readCodexConfig(userFile);
  const user: TomlTable = userRead.status === "ok" ? userRead.value : {};
  const problems: ProblemDraft[] = [];
  const codexPlace = (path: string): string => `${input.env.CODEX_HOME?.trim() ? "$CODEX_HOME" : "~/.codex"}/${slashed(relative(home, path))}`;
  const homePlace = (path: string): string => `~/${slashed(relative(input.homedir, path))}`;
  if (userRead.status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: userFile, place: codexPlace(userFile) });

  // 프로젝트와 맥락. 신뢰한 프로젝트의 층만 사용자 층 위에 얹는다(「5단계 2부 계획 전 결정」 1·2번)
  const refs = await groupProjects(input.cwds, { homedir: input.homedir, tmpdir: input.tmpdir, platform: input.platform });
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  const projectNames = projectNamesOf(refs);
  const projectPlace = (ref: ProjectRef, path: string): string => `${projectNames.get(ref.normRoot)!}/${slashed(relative(ref.root, path))}`;
  const homeReal = (await entryInfo(home)).realPath ?? normalizePath(home);
  const sameAsHome = async (dir: string): Promise<boolean> => normalizePath(dir) === normalizePath(home) || (await entryInfo(dir)).realPath === homeReal;
  const contexts: CodexMcpContext[] = [{ projectRoot: null, merged: user, plugins: [] }];
  const trustedLayers: { normRoot: string; layer: TomlTable }[] = [];
  const perProject = new Map<string, { status: FileStatus | null; merged: TomlTable; safety: CodexSafetyFact | null }>();
  for (const ref of active) {
    const trust = trustOf(user, ref.root, input.platform);
    if (trust !== "trusted" || (await sameAsHome(join(ref.root, ".codex")))) {
      perProject.set(ref.normRoot, { status: null, merged: user, safety: null });
      continue;
    }
    // 프로젝트 층은 TOML로 풀리는지만 보고, 값의 종류와 전송은 사용자 층과 합친 것으로 본다. 프로젝트 층은 사용자 층의 서버를 일부만 다시 적을 수 있고(예. args만), Codex도 합친 설정을 검사한다
    const file = join(ref.root, ".codex", "config.toml");
    const text = await readText(file);
    const layer = text.status === "ok" ? parseCodexConfig(text.text) : null;
    let status: FileStatus = text.status === "ok" ? (layer === null ? "unparsable" : "ok") : text.status;
    let merged = user;
    if (layer !== null) {
      merged = mergeCodexLayers([user, layer]);
      // 합친 것이 Codex가 시작하지 못하는 꼴이면(예. 사용자 층의 command 위에 url) 그 프로젝트의 설정을 풀리지 않는 것으로 본다
      if (!codexConfigShapeOk(merged)) {
        status = "unparsable";
        merged = user;
      }
    }
    if (status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: file, place: projectPlace(ref, file) });
    const readable = status === "ok" || status === "missing";
    // 승인과 샌드박스는 층의 차례로 본다(어느 층이 샌드박스 방식을 정했는지가 판정을 바꾼다. 계획 리뷰 1차)
    perProject.set(ref.normRoot, { status, merged, safety: readable ? safetyOf(status === "ok" && layer !== null ? [user, layer] : [user]) : null });
    if (!readable) continue;
    contexts.push({ projectRoot: ref.normRoot, merged, plugins: [] });
    if (status === "ok" && layer !== null) trustedLayers.push({ normRoot: ref.normRoot, layer });
  }

  // 플러그인. 후보는 사용자 층과 신뢰한 프로젝트 층의 항목이다. 맥락마다 설정으로 켜져 있고 Codex가 싣는 것이 그 맥락의 켜진 플러그인이다
  const ids = new Set<string>();
  for (const layer of [user, ...trustedLayers.map((p) => p.layer)]) if (isTable(layer.plugins)) for (const id of Object.keys(layer.plugins)) if (id !== "_default") ids.add(id);
  const reads: CodexPluginRead[] = [];
  for (const id of [...ids].sort()) reads.push(await readCodexPlugin(home, id));
  for (const context of contexts) context.plugins = reads.filter((plugin) => loadable(plugin) && configuredIn(context.merged, plugin.id)).map((plugin) => plugin.id);
  const enabledIds = new Set(contexts.flatMap((context) => context.plugins));

  // 스킬. 사용자 범위(Codex 홈의 옛 위치, 홈의 .agents), 저장소 범위(프로젝트 뿌리의 .agents와 .codex. 신뢰와 상관없다), 켜진 플러그인(「5단계 2부 계획 전 결정」 6번)
  const rules = await skillRules(user, home, input.homedir);
  const skills: Omit<SkillFact, "installKey">[] = [];
  const unreadableDirs: string[] = [];
  const unreadableSkillPlaces: CodexSetupFacts["unreadableSkillPlaces"] = { user: false, projects: [], plugins: [] };
  const pluginSkillNames = new Map<string, string[]>();
  const addScan = (where: string, scan: CodexSkillRootScan, place: ((path: string) => string) | null, owner: { scope: "user" } | { scope: "project"; projectRoot: string } | { scope: "plugin"; pluginId: string }): void => {
    const blocked = [...scan.unreadableDirs, ...(scan.truncated ? [where] : [])];
    unreadableDirs.push(...blocked);
    if (blocked.length > 0) {
      if (owner.scope === "user") unreadableSkillPlaces.user = true;
      else if (owner.scope === "project") unreadableSkillPlaces.projects.push(owner.projectRoot);
      else unreadableSkillPlaces.plugins.push(owner.pluginId);
    }
    const problem = (kind: "noFrontmatter" | "danglingLink", path: string): void => {
      problems.push(place === null ? { kind, owner: "plugin", path, place: null } : { kind, owner: "user", path, place: place(path) });
    };
    for (const path of scan.danglingLinks) problem("danglingLink", path);
    for (const found of scan.skills) {
      if (found.folder.readable && !found.frontmatterOk) problem("noFrontmatter", found.folder.path);
      const enabled = enabledByRules(rules, found.skillFileRealPath, found.name);
      skills.push({
        scope: owner.scope,
        name: found.name,
        recordNames: [found.name],
        path: found.folder.path,
        realPath: found.folder.realPath,
        isLink: found.viaLink,
        contentHash: found.folder.contentHash,
        createdMs: found.folder.createdMs,
        targetCreatedMs: found.folder.targetCreatedMs,
        projectRoot: owner.scope === "project" ? owner.projectRoot : null,
        pluginId: owner.scope === "plugin" ? owner.pluginId : null,
        enabled,
        listed: enabled,
        readable: found.folder.readable,
        nameUnreadable: found.folder.nameUnreadable,
        managedFixed: false,
        hookProvided: false,
        usageLastUsedMs: null,
        usageUndated: false,
      });
      if (owner.scope === "plugin") pluginSkillNames.set(owner.pluginId, [...(pluginSkillNames.get(owner.pluginId) ?? []), found.name]);
    }
  };
  const userRoots = [
    { dir: join(home, "skills"), place: codexPlace },
    { dir: join(input.homedir, ".agents", "skills"), place: homePlace },
  ].filter((root, index, all) => all.findIndex((other) => normalizePath(other.dir) === normalizePath(root.dir)) === index);
  for (const root of userRoots) addScan(root.dir, await scanCodexSkillRoot(root.dir), root.place, { scope: "user" });
  for (const ref of active) {
    const dirs = [join(ref.root, ".agents", "skills")];
    if (!(await sameAsHome(join(ref.root, ".codex")))) dirs.push(join(ref.root, ".codex", "skills"));
    for (const dir of dirs) addScan(dir, await scanCodexSkillRoot(dir), (path) => projectPlace(ref, path), { scope: "project", projectRoot: ref.normRoot });
  }
  for (const plugin of reads) {
    if (!enabledIds.has(plugin.id)) continue;
    for (const dir of plugin.skillRoots) addScan(dir, await scanCodexSkillRoot(dir, undefined, plugin.namespace), null, { scope: "plugin", pluginId: plugin.id });
  }

  // MCP 서버(「5단계 2부 계획 전 결정」 7번). MCP 정의를 읽지 못한 플러그인의 서버는 세지 않는다
  const pluginServers = new Map(reads.filter((plugin) => enabledIds.has(plugin.id) && !plugin.mcpUnreadable).map((plugin) => [plugin.id, plugin.mcpServers] as const));
  const mcpServers = codexMcpFacts({ user, projects: trustedLayers, contexts, pluginServers, salt: input.salt });

  const plugins: CodexPluginFact[] = reads.map((plugin) => ({
    id: plugin.id,
    configured: contexts.some((context) => configuredIn(context.merged, plugin.id)),
    enabled: enabledIds.has(plugin.id),
    idValid: plugin.idValid,
    install: plugin.install,
    manifest: plugin.manifest,
    namespace: plugin.namespace,
    compositionKnown: plugin.compositionKnown,
    mcpUnreadable: plugin.mcpUnreadable,
    skills: (pluginSkillNames.get(plugin.id) ?? []).sort(),
  }));

  // 지침(「5단계 2부 계획 전 결정」 5번)
  const globalRead = await readCodexGlobalInstructions(home, active);
  const projects: CodexProjectFact[] = [];
  for (const ref of refs) {
    const trust = trustOf(user, ref.root, input.platform);
    const known = perProject.get(ref.normRoot);
    if (known === undefined) {
      projects.push({ normRoot: ref.normRoot, scanned: false, trust, configStatus: null, instructions: emptyInstructionSet(), safety: null });
      continue;
    }
    const skip = trust === "untrusted" || projectDocDisabled(known.merged);
    const instructions = skip ? emptyInstructionSet() : await readCodexProjectInstructions(ref.root, fallbackNames(known.merged, input.platform));
    projects.push({ normRoot: ref.normRoot, scanned: true, trust, configStatus: known.status, instructions, safety: known.safety });
  }

  skills.sort((a, b) => cmp(a.name, b.name) || SKILL_SCOPE_ORDER[a.scope] - SKILL_SCOPE_ORDER[b.scope] || cmp(normalizePath(a.path), normalizePath(b.path)) || cmp(a.pluginId, b.pluginId));
  const uniqueProblems: SetupProblem[] = [];
  for (const problem of new Map(problems.map((p) => [`${p.kind}\u0000${p.owner}\u0000${p.path}`, p])).values()) {
    uniqueProblems.push({ ...problem, realPath: (await entryInfo(problem.path)).realPath });
  }
  uniqueProblems.sort((a, b) => cmp(a.path, b.path) || cmp(a.kind, b.kind) || OWNER_ORDER[a.owner] - OWNER_ORDER[b.owner]);
  return {
    tool: "codex",
    home,
    config: userRead.status,
    globalInstructions: globalRead.set,
    globalMentions: globalRead.mentions,
    safety: safetyOf([user]),
    skills: skills.map((skill) => ({ ...skill, installKey: codexSkillInstallKey(skill) })),
    mcpServers: mcpServers.map((server) => ({ ...server, installKey: codexMcpInstallKey(server) })),
    plugins,
    projects,
    problems: uniqueProblems,
    secrets: [...codexMcpSecrets(user, trustedLayers), ...(await codexDefaultCopySecrets(input))],
    unreadableDirs: [...new Set(unreadableDirs)].sort(),
    unreadableSkillPlaces: { user: unreadableSkillPlaces.user, projects: [...new Set(unreadableSkillPlaces.projects)].sort(), plugins: [...new Set(unreadableSkillPlaces.plugins)].sort() },
  };
}
