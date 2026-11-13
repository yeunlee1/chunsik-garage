// Claude Code의 지금 셋팅을 읽어 셋팅 사실로 낸다. 설정 층·지침·스킬·플러그인·MCP 서버·권한과 훅의 겉모양을 프로젝트 목록과 함께 본다. 값과 글은 메모리에서 쓰고 버린다(설계 7.2, 10, 11.3, 19.1)
import { join } from "node:path";
import { claudeHome, normalizePath } from "../adapters/claude/locate.ts";
import { claudeJsonPath, readClaudeJson, type ClaudeJsonProject } from "./claude-json.ts";
import { entryInfo, readJson } from "./fs.ts";
import { hookCommandTexts, hookMapValid, preToolUseGuards, type ShellGuard } from "./hooks.ts";
import { emptyInstructionSet, readGlobalInstructions, readProjectInstructions } from "./instructions.ts";
import { definitionHash, mcpAllowed, projectServerApproved, type McpContext } from "./mcp.ts";
import { mcpRecordNames, skillRecordNames } from "./names.ts";
import { conflictPairs } from "./permissions.ts";
import { mcpMapOf, readSkillsDirPlugins, scanPlugins, type McpDefinitionEntry, type PluginInstall, type SkillsDirPluginRef } from "./plugins.ts";
import { groupProjects } from "./projects.ts";
import { managedSettingsDir, readLayer, readManagedLayer, viewOf, type SettingsLayer, type SettingsView } from "./settings.ts";
import { scanSkillPath, scanSkillRoot, type SkillFolder, type SkillRootScan } from "./skills.ts";
import type { ClaudeSetupFacts, FileStatus, McpFact, PluginFact, ProjectFact, SetupProblem, SkillFact } from "./types.ts";

export interface ScanInput {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  /** 수집 구간에 응답이 있는 주 세션의 작업 폴더(세션마다 처음 적힌 것, 설계 10 「프로젝트 목록」) */
  cwds: readonly string[];
  /** 세션 기록에 나온 claude.ai 서버의 이름('claude.ai '로 시작하는 것) */
  claudeAiNames: readonly string[];
  /** 상태 파일의 무작위 값(16진 64자) */
  salt: string;
  /** 관리 정책 폴더. 주지 않으면 OS의 자리다(시험에서 바꾼다) */
  managedDir?: string;
}

/** 설정을 합쳐 볼 맥락 하나. 전역(사용자 설정만)이거나 목록의 프로젝트 하나(사용자, 프로젝트, 로컬)다. 관리 정책은 늘 맨 위다. */
interface Context {
  /** 관리 정책을 뺀 층(뒤가 앞을 이긴다) */
  ordered: SettingsView[];
  managed: SettingsView;
  mcp: McpContext;
}

const SKILL_SCOPE_ORDER = { user: 0, project: 1, plugin: 2 } as const;
const MCP_SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 } as const;
const OWNER_ORDER = { user: 0, managed: 1, plugin: 2, tool: 3 } as const;
const cmp = (a: string | null, b: string | null): number => ((a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0);
const layerStatus = (layer: SettingsLayer): FileStatus => layer.parts[0]?.status ?? "missing";

function mergeClaudeJsonEntries(entries: readonly ClaudeJsonProject[]): ClaudeJsonProject | null {
  if (entries.length === 0) return null;
  const union = (pick: (e: ClaudeJsonProject) => string[]): string[] => [...new Set(entries.flatMap(pick))].sort();
  return {
    key: entries[0]!.key,
    normKey: entries[0]!.normKey,
    mcpServers: entries.flatMap((e) => e.mcpServers),
    enabledMcpjsonServers: union((e) => e.enabledMcpjsonServers),
    disabledMcpjsonServers: union((e) => e.disabledMcpjsonServers),
    disabledMcpServers: union((e) => e.disabledMcpServers),
  };
}

/** 플러그인이 이 맥락에서 켜져 있는지. 관리 정책이 정하면 그 값, 아니면 층의 마지막 값, 아무 데도 없으면 기본값이다. */
function pluginEnabledIn(context: Context, id: string, defaultEnabled: boolean): boolean {
  if (Object.hasOwn(context.managed.enabledPlugins, id)) return context.managed.enabledPlugins[id]!;
  let value: boolean | undefined;
  for (const layer of context.ordered) if (Object.hasOwn(layer.enabledPlugins, id)) value = layer.enabledPlugins[id];
  return value ?? defaultEnabled;
}

/** 이 맥락에서 그 이름들의 skillOverrides 값. 관리 정책이 먼저이고, 아니면 층의 마지막 값이다. 없으면 null이다(플러그인 스킬에는 듣지 않는다). */
function overrideIn(context: Context, names: readonly string[]): string | null {
  for (const name of names) if (Object.hasOwn(context.managed.skillOverrides, name)) return context.managed.skillOverrides[name]!;
  let value: string | null = null;
  for (const layer of context.ordered) for (const name of names) if (Object.hasOwn(layer.skillOverrides, name)) value = layer.skillOverrides[name]!;
  return value;
}

/** 관리 정책이 그 서버를 막거나 허용 목록으로 정하는지(사용자가 바꿀 수 없다). */
function managedHits(managed: SettingsView, names: readonly string[], definition: Record<string, unknown> | null): boolean {
  if (managed.allowedMcpServers !== null) return true;
  return !mcpAllowed({ layers: [managed], managed: { ...managed, allowedMcpServers: null }, project: null }, names, definition);
}

const normalizedCommand = (text: string): string => text.replace(/\\/g, "/").toLowerCase();

/**
 * 이름들의 집계를 합친다. 시각이 읽힌 것 가운데 가장 늦은 것과, 항목은 있는데 시각을 읽을 수 없는 것(null)이 하나라도 있었는지를 낸다.
 * 집계에 없는 이름(undefined)은 어느 쪽에도 들지 않는다(설계 11.3 「30일의 경계」).
 */
function usageOf(times: readonly (number | null | undefined)[]): { usageLastUsedMs: number | null; usageUndated: boolean } {
  let usageLastUsedMs: number | null = null;
  let usageUndated = false;
  for (const at of times) {
    if (at === undefined) continue;
    if (at === null) usageUndated = true;
    else if (usageLastUsedMs === null || at > usageLastUsedMs) usageLastUsedMs = at;
  }
  return { usageLastUsedMs, usageUndated };
}

export async function scanClaudeSetup(input: ScanInput): Promise<ClaudeSetupFacts> {
  const home = claudeHome(input.env, input.homedir);
  const claudeJsonFile = claudeJsonPath(input.env, input.homedir);
  const claudeJson = await readClaudeJson(claudeJsonFile);
  const userLayer = await readLayer(join(home, "settings.json"));
  const managedLayer = await readManagedLayer(input.managedDir ?? managedSettingsDir(input.platform));
  const userView = viewOf(userLayer.value);
  const managedView = viewOf(managedLayer.value);
  // 실제 경로는 마지막에 한 번에 붙인다
  const problems: Omit<SetupProblem, "realPath">[] = [];
  const unparsable = (layer: SettingsLayer, owner: SetupProblem["owner"]): void => {
    for (const part of layer.parts) if (part.status === "unparsable") problems.push({ kind: "unparsable", owner, path: part.path });
  };
  unparsable(userLayer, "user");
  unparsable(managedLayer, "managed");
  // .claude.json은 도구가 수시로 다시 쓰는 상태 파일이다. 주인을 tool로 적어 사용자의 셋팅과 가른다
  if (claudeJson.status === "unparsable") problems.push({ kind: "unparsable", owner: "tool", path: claudeJsonFile });

  // 프로젝트와 맥락
  const refs = await groupProjects(input.cwds, { homedir: input.homedir, tmpdir: input.tmpdir, platform: input.platform });
  const global: Context = { ordered: [userView], managed: managedView, mcp: { layers: [userView, managedView], managed: managedView, project: null } };
  const projectLayers = new Map<string, { project: SettingsLayer; local: SettingsLayer }>();
  const contexts = new Map<string, Context>();
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  for (const ref of active) {
    const project = await readLayer(join(ref.root, ".claude", "settings.json"));
    const local = await readLayer(join(ref.root, ".claude", "settings.local.json"));
    unparsable(project, "user");
    unparsable(local, "user");
    projectLayers.set(ref.normRoot, { project, local });
    const projectView = viewOf(project.value);
    const localView = viewOf(local.value);
    // 프로젝트마다의 값은 본 저장소 뿌리의 열쇠로만 찾는다. 같은 뿌리를 다르게 적은 열쇠는 합치고, 하위 폴더와 워크트리의 열쇠는 보지 않는다(설계 10 「프로젝트를 세는 단위와 셋팅을 읽는 곳은 같다」)
    const entry = mergeClaudeJsonEntries(claudeJson.projects.filter((p) => p.normKey === ref.normRoot));
    contexts.set(ref.normRoot, {
      ordered: [userView, projectView, localView],
      managed: managedView,
      mcp: { layers: [userView, projectView, localView, managedView], managed: managedView, project: entry },
    });
  }
  const everyContext = [global, ...contexts.values()];

  // 전역 지침과 프로젝트가 나온 횟수
  const globalRead = await readGlobalInstructions(home, active);

  // 사용자·프로젝트 스킬 폴더를 먼저 훑는다. 그 안에 둔 플러그인(@skills-dir)의 훅 명령까지 모은 뒤에 스킬마다 훅을 견주기 위해서다
  const userSkillScan = await scanSkillRoot(join(home, "skills"), { pluginDirs: true });
  const projectSkillScans = new Map<string, SkillRootScan>();
  for (const ref of active) projectSkillScans.set(ref.normRoot, await scanSkillRoot(join(ref.root, ".claude", "skills"), { pluginDirs: true }));
  const skillsDirRefs: SkillsDirPluginRef[] = [
    ...userSkillScan.pluginDirs.map((path) => ({ path, scope: "user" as const, projectRoot: null })),
    ...active.flatMap((ref) => projectSkillScans.get(ref.normRoot)!.pluginDirs.map((path) => ({ path, scope: "project" as const, projectRoot: ref.normRoot }))),
  ];

  // 플러그인. 사용자 범위(또는 범위를 모르는) 기록이 있으면 모든 맥락을, 프로젝트·로컬 범위만 있으면 그 프로젝트의 맥락만 본다.
  // 스킬 폴더에 둔 플러그인은 설치 기록에 없어도 구성을 아는 플러그인이다(설계 10 「스킬 폴더에 둔 플러그인」)
  const pluginsScan = await scanPlugins(home);
  const allPlugins = [...pluginsScan.plugins, ...(await readSkillsDirPlugins(skillsDirRefs))].sort(
    (a, b) => cmp(a.id, b.id) || cmp(normalizePath(a.installPath), normalizePath(b.installPath)),
  );
  const contextsOfPaths = (paths: readonly string[]): Context[] => {
    const out: Context[] = [];
    for (const ref of active) if (paths.some((path) => ref.normRoot === path || ref.cwds.includes(path))) out.push(contexts.get(ref.normRoot)!);
    return out;
  };
  const userScoped = (plugin: PluginInstall): boolean => plugin.scopes.some((scope) => scope !== "project" && scope !== "local");
  const pluginContexts = (plugin: PluginInstall): Context[] => (userScoped(plugin) ? everyContext : contextsOfPaths(plugin.projectPaths));

  // 훅 명령의 글(메모리에서만 쓴다): 스킬 경로가 나오는지 보는 데 쓴다
  // 관리 정책의 훅 명령은 파일마다 모은다. 합친 값에서는 뒤 파일의 틀린 hooks가 앞 파일의 명령을 덮는다. ㉠과 달리 검사에 걸린 파일의 명령도 넣는다.
  // 도구가 그 파일의 나머지 훅을 돌릴 수 있고, 넓게 보아야 "안 쓴 것이 확인됨"을 잘못 내지 않는다(설계 11.3 E5 ⑤)
  const commandTexts: string[] = [
    ...hookCommandTexts(userView.hooks),
    ...managedLayer.hookSources.flatMap(({ hooks }) => hookCommandTexts(hooks)),
    ...[...contexts.values()].flatMap((c) => c.ordered.slice(1).flatMap((view) => hookCommandTexts(view.hooks))),
    ...allPlugins.flatMap((p) => p.hookEvents.flatMap(hookCommandTexts)),
  ].map(normalizedCommand);
  const mentionedByHook = (skill: SkillFolder): boolean => {
    const fragments = [normalizePath(skill.path), skill.realPath ?? "", `/skills/${skill.dirName}`].filter((f) => f !== "").map((f) => f.toLowerCase());
    return commandTexts.some((text) => fragments.some((fragment) => text.includes(fragment)));
  };
  // 스킬
  const skills: SkillFact[] = [];
  const unreadableDirs: string[] = [];
  const unreadableSkillPlaces: ClaudeSetupFacts["unreadableSkillPlaces"] = { user: false, projects: [], plugins: [] };
  const addSkill = (folder: SkillFolder, fields: Pick<SkillFact, "scope" | "name" | "recordNames" | "projectRoot" | "pluginId" | "enabled" | "listed" | "managedFixed" | "hookProvided">): void => {
    skills.push({
      ...fields,
      path: folder.path,
      realPath: folder.realPath,
      isLink: folder.isLink,
      contentHash: folder.contentHash,
      createdMs: folder.createdMs,
      targetCreatedMs: folder.targetCreatedMs,
      readable: folder.readable,
      nameUnreadable: folder.nameUnreadable,
      ...usageOf(fields.recordNames.map((name) => claudeJson.skillUsage[name])),
    });
  };
  const addOwnSkills = (scan: SkillRootScan, scope: "user" | "project", projectRoot: string | null, scopeContexts: readonly Context[]): void => {
    for (const path of scan.danglingLinks) problems.push({ kind: "danglingLink", owner: "user", path });
    unreadableDirs.push(...scan.unreadableDirs);
    if (scan.unreadableDirs.length > 0) {
      if (projectRoot === null) unreadableSkillPlaces.user = true;
      else unreadableSkillPlaces.projects.push(projectRoot);
    }
    for (const folder of scan.skills) {
      const recordNames = skillRecordNames(folder.dirName, folder.declaredName, null);
      const modes = scopeContexts.map((context) => overrideIn(context, recordNames));
      if (folder.readable && !folder.hasFrontmatter) problems.push({ kind: "noFrontmatter", owner: "user", path: folder.path });
      addSkill(folder, {
        scope,
        name: folder.dirName,
        recordNames,
        projectRoot,
        pluginId: null,
        enabled: modes.some((mode) => mode !== "off"),
        listed: !folder.disableModelInvocation && modes.some((mode) => mode !== "off" && mode !== "user-invocable-only"),
        managedFixed: recordNames.some((name) => Object.hasOwn(managedView.skillOverrides, name)),
        hookProvided: mentionedByHook(folder),
      });
    }
  };
  addOwnSkills(userSkillScan, "user", null, everyContext);
  for (const ref of active) addOwnSkills(projectSkillScans.get(ref.normRoot)!, "project", ref.normRoot, [contexts.get(ref.normRoot)!]);

  const plugins: PluginFact[] = [];
  const mcpServers: McpFact[] = [];
  for (const plugin of allPlugins) {
    if (plugin.manifest === "unparsable") problems.push({ kind: "unparsable", owner: "plugin", path: join(plugin.installPath, ".claude-plugin", "plugin.json") });
    const enabledIn = pluginContexts(plugin).filter((context) => pluginEnabledIn(context, plugin.id, plugin.defaultEnabled));
    // 훅이 든 플러그인: 구성에 훅이 있다. 돌지 않는 꼴(경로로 적은 마켓 항목의 훅)도 든다(설계 10 「마켓 항목」, 11.3 E5 ⑤)
    const hasHooks = plugin.components.includes("hooks");
    // 기록에 남는 꼴은 구성 요소의 이름으로 만들고, 마켓 항목의 이름이 다르면 그 꼴도 넣는다(설계 10 「설치와 기록의 이름을 잇는 법」)
    const pluginNames = [...new Set([plugin.name, plugin.entryName])];
    // 구성을 모르는 플러그인의 스킬은 설치로 세지 않는다(설계 10 「플러그인의 구성」). 경로 자체가 스킬 폴더일 수 있다
    const skillNames: string[] = [];
    // 같은 위치(경로)를 두 번 찾으면 한 번만 센다(매니페스트가 기본 skills/ 안의 스킬을 다시 가리킨 경우).
    // 다른 이름의 링크처럼 위치가 다르면 실제 경로가 같아도 위치마다 사실을 낸다. 스킬 묶음으로 세는 일은 2부가 한다(설계 10 「위치와 스킬 묶음」·「스킬을 찾는 폴더」)
    const seenPaths = new Set<string>();
    if (plugin.compositionKnown) {
      for (const root of plugin.skillRoots) {
        const scan = await scanSkillPath(root);
        for (const path of scan.danglingLinks) problems.push({ kind: "danglingLink", owner: "plugin", path });
        unreadableDirs.push(...scan.unreadableDirs);
        if (scan.unreadableDirs.length > 0) unreadableSkillPlaces.plugins.push(plugin.id);
        for (const folder of scan.skills) {
          const at = normalizePath(folder.path);
          if (seenPaths.has(at)) continue;
          seenPaths.add(at);
          const recordNames = [...new Set(pluginNames.flatMap((pluginName) => skillRecordNames(folder.dirName, folder.declaredName, pluginName)))].sort();
          const name = `${plugin.name}:${folder.dirName}`;
          skillNames.push(name);
          if (folder.readable && !folder.hasFrontmatter) problems.push({ kind: "noFrontmatter", owner: "plugin", path: folder.path });
          addSkill(folder, {
            scope: "plugin",
            name,
            recordNames,
            projectRoot: null,
            pluginId: plugin.id,
            enabled: enabledIn.length > 0,
            listed: enabledIn.length > 0 && !folder.disableModelInvocation,
            managedFixed: Object.hasOwn(managedView.enabledPlugins, plugin.id),
            hookProvided: hasHooks || mentionedByHook(folder),
          });
        }
      }
    }
    for (const server of plugin.mcpServers) {
      const recordNames = [...new Set(pluginNames.flatMap((pluginName) => mcpRecordNames(server.name, pluginName)))].sort();
      // 막는 목록은 서버 열쇠 그대로 적었을 수도 있어서 그 이름도 함께 견준다
      const denyNames = [...new Set([...recordNames, server.name])];
      mcpServers.push({
        scope: "plugin",
        name: server.name,
        recordNames,
        projectRoot: null,
        pluginId: plugin.id,
        definitionHash: server.definition === null ? null : definitionHash(input.salt, server.definition),
        enabled: enabledIn.some((context) => mcpAllowed(context.mcp, denyNames, server.definition)),
        managedFixed: managedHits(managedView, denyNames, server.definition),
      });
    }
    plugins.push({
      id: plugin.id,
      entryName: plugin.entryName,
      name: plugin.name,
      scopes: plugin.scopes,
      projectRoots: plugin.projectPaths,
      installPath: plugin.installPath,
      installRealPath: plugin.installRealPath,
      exists: plugin.exists,
      manifest: plugin.manifest,
      marketplaceEntry: plugin.marketplaceEntry,
      compositionKnown: plugin.compositionKnown,
      enabled: enabledIn.length > 0,
      managedFixed: Object.hasOwn(managedView.enabledPlugins, plugin.id),
      managedForced: managedView.enabledPlugins[plugin.id] === true,
      components: plugin.components,
      unknownEntries: plugin.unknownEntries,
      dependencies: plugin.dependencies,
      hasHooks,
      hooksUnreadable: plugin.hooksUnreadable,
      mcpUnreadable: plugin.mcpUnreadable,
      skills: skillNames.sort(),
      // 집계의 열쇠가 어느 이름인지 확인하지 못해 두 이름으로 모두 찾는다(설계 10 「~/.claude.json」)
      ...usageOf(pluginNames.map((pluginName) => claudeJson.pluginUsage[`${pluginName}@${plugin.marketplace}`])),
    });
  }

  // 켜져 있는데 installed_plugins.json에 설치 기록이 없는 플러그인. 구성을 모르는 플러그인이다(설계 10, 16.2 A2)
  const installedIds = new Set(allPlugins.map((p) => p.id));
  const mentionedIds = new Set<string>(Object.keys(managedView.enabledPlugins));
  for (const context of everyContext) for (const layer of context.ordered) for (const id of Object.keys(layer.enabledPlugins)) mentionedIds.add(id);
  // 도구에 든 플러그인(@builtin)은 플러그인으로 세지 않는다(설계 10 「도구에 든 플러그인」)
  const pluginsWithoutInstall = [...mentionedIds]
    .filter((id) => !installedIds.has(id) && !id.endsWith("@builtin"))
    .filter((id) => everyContext.some((context) => pluginEnabledIn(context, id, false)))
    .sort();

  // MCP 서버(플러그인 것은 위에서 넣었다)
  const addServer = (scope: "user" | "local" | "project", entry: McpDefinitionEntry, projectRoot: string | null, enabled: boolean): void => {
    const names = mcpRecordNames(entry.name, null);
    mcpServers.push({
      scope,
      name: entry.name,
      recordNames: names,
      projectRoot,
      pluginId: null,
      definitionHash: entry.definition === null ? null : definitionHash(input.salt, entry.definition),
      enabled,
      managedFixed: managedHits(managedView, names, entry.definition),
    });
  };
  for (const entry of claudeJson.userMcpServers) {
    const names = mcpRecordNames(entry.name, null);
    addServer("user", entry, null, everyContext.some((context) => mcpAllowed(context.mcp, names, entry.definition)));
  }
  const mcpJsonStatus = new Map<string, FileStatus>();
  for (const ref of active) {
    const context = contexts.get(ref.normRoot)!;
    // 같은 프로젝트로 묶인 열쇠 여럿에 같은 서버가 있으면(정의가 같으면 열쇠의 차례와 상관없이) 하나로 센다
    const seen = new Set<string>();
    for (const entry of context.mcp.project?.mcpServers ?? []) {
      const identity = `${entry.name}\u0000${entry.definition === null ? "" : (definitionHash(input.salt, entry.definition) ?? "deep")}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      addServer("local", entry, ref.normRoot, mcpAllowed(context.mcp, mcpRecordNames(entry.name, null), entry.definition));
    }
    const file = join(ref.root, ".mcp.json");
    const read = await readJson(file);
    const entries = read.status === "ok" ? mcpMapOf(read.value) : null;
    const status: FileStatus = read.status !== "ok" ? read.status : entries === null ? "unparsable" : "ok";
    mcpJsonStatus.set(ref.normRoot, status);
    if (status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: file });
    for (const entry of entries ?? []) {
      const approved = projectServerApproved(context.mcp, entry.name) && mcpAllowed(context.mcp, mcpRecordNames(entry.name, null), entry.definition);
      addServer("project", entry, ref.normRoot, approved);
    }
  }
  const claudeAiNames = [...new Set([...claudeJson.claudeAiEverConnected, ...input.claudeAiNames.filter((n) => n.startsWith("claude.ai "))])].sort();
  for (const name of claudeAiNames) {
    const names = mcpRecordNames(name, null);
    mcpServers.push({ scope: "claude-ai", name, recordNames: names, projectRoot: null, pluginId: null, definitionHash: null, enabled: mcpAllowed(global.mcp, names, null), managedFixed: managedHits(managedView, names, null) });
  }

  // 프로젝트
  const projects: ProjectFact[] = [];
  for (const ref of refs) {
    const layers = projectLayers.get(ref.normRoot);
    const projectView = viewOf(layers?.project.value ?? null);
    const localView = viewOf(layers?.local.value ?? null);
    const settingsStatus = layers === undefined ? null : layerStatus(layers.project);
    const localSettingsStatus = layers === undefined ? null : layerStatus(layers.local);
    const hasSettings = settingsStatus !== null && settingsStatus !== "missing";
    const hasLocalSettings = localSettingsStatus !== null && localSettingsStatus !== "missing";
    projects.push({
      root: ref.root,
      normRoot: ref.normRoot,
      kind: ref.kind,
      exists: ref.exists,
      excluded: ref.excluded,
      cwds: ref.cwds,
      settingsStatus,
      localSettingsStatus,
      mcpJsonStatus: mcpJsonStatus.get(ref.normRoot) ?? null,
      hasSettings,
      hasLocalSettings,
      instructions: layers === undefined ? emptyInstructionSet() : await readProjectInstructions(ref.root, globalRead.set),
      bypassInProject: projectView.bypass,
      bypassInLocal: localView.bypass,
      permissionConflicts: layers === undefined ? 0 : conflictPairs(userView, settingsStatus === "ok" ? projectView : null, localSettingsStatus === "ok" ? localView : null),
    });
  }

  // 훅의 겉모양(㉠의 네 출처): 관리 정책, 관리 정책이 강제로 켠 플러그인, 사용자 설정, 사용자 설정에서 켠 플러그인(설계 11.3 「㉠의 훅을 찾는 곳」).
  // 사용자 설정에서 켠 것은 사용자 설정의 enabledPlugins에 참으로 적힌 사용자 범위 플러그인이다. 기본 켜짐으로 켜진 것은 넣지 않는다(엄한 쪽)
  const managedPluginGuards: ShellGuard[] = [];
  const userPluginGuards: ShellGuard[] = [];
  const unreadablePlugins: string[] = [];
  for (const plugin of allPlugins) {
    // ㉠은 어느 프로젝트에서든 도는 훅만 본다. 관리 정책이 강제로 켰어도 프로젝트 범위로 깔았거나 프로젝트의 스킬 폴더에 둔 것은 그 프로젝트에서만 돈다
    if (!userScoped(plugin)) continue;
    const forced = managedView.enabledPlugins[plugin.id] === true;
    const userEnabled = !forced && userView.enabledPlugins[plugin.id] === true && pluginEnabledIn(global, plugin.id, plugin.defaultEnabled);
    if (!forced && !userEnabled) continue;
    // 구성을 모르는 플러그인도 훅을 읽지 못한 것으로 적힌다. 그 훅은 없는 것으로 본다(설계 20.1)
    if (plugin.hooksUnreadable) unreadablePlugins.push(plugin.id);
    for (const events of plugin.hookEvents) (forced ? managedPluginGuards : userPluginGuards).push(...preToolUseGuards(events, forced ? "managed-plugin" : "user-plugin", plugin.id));
  }
  // 설정 파일의 훅은 파일(출처)마다 본다. 한 파일의 hooks가 뼈대나 처리기 검사에 걸리면, 도구가 그 항목만 버리는지(관리 정책의 개별 항목, 사용자 설정의 Settings Warning)
  // 그 파일의 훅을 통째로 버리는지(관리 정책의 hooks 필드 무시, 사용자 설정의 Settings Error) 가릴 수 없다. 그 파일의 확인 훅은 세지 않고 훅을 읽지 못한 설정 파일로 낸다
  // (공식 문서 errors 「Managed settings contain invalid entries」·settings 「Fix a broken settings file」, 설계 11.3 ㉠의 「등록돼 있다」)
  const unreadableSettings: string[] = [];
  const settingsGuards = (layer: SettingsLayer, source: "managed" | "user"): ShellGuard[] =>
    layer.hookSources.flatMap(({ path, hooks }) => {
      if (hookMapValid(hooks)) return preToolUseGuards(hooks, source, null);
      unreadableSettings.push(path);
      return [];
    });
  const guards: ShellGuard[] = [...settingsGuards(managedLayer, "managed"), ...managedPluginGuards, ...settingsGuards(userLayer, "user"), ...userPluginGuards];

  skills.sort((a, b) => cmp(a.name, b.name) || SKILL_SCOPE_ORDER[a.scope] - SKILL_SCOPE_ORDER[b.scope] || cmp(normalizePath(a.path), normalizePath(b.path)) || cmp(a.pluginId, b.pluginId));
  mcpServers.sort((a, b) => cmp(a.name, b.name) || MCP_SCOPE_ORDER[a.scope] - MCP_SCOPE_ORDER[b.scope] || cmp(a.projectRoot, b.projectRoot) || cmp(a.pluginId, b.pluginId) || cmp(a.definitionHash, b.definitionHash));
  const uniqueProblems: SetupProblem[] = [];
  for (const problem of new Map(problems.map((p) => [`${p.kind}\u0000${p.owner}\u0000${p.path}`, p])).values()) {
    uniqueProblems.push({ ...problem, realPath: (await entryInfo(problem.path)).realPath });
  }
  uniqueProblems.sort((a, b) => cmp(a.path, b.path) || cmp(a.kind, b.kind) || OWNER_ORDER[a.owner] - OWNER_ORDER[b.owner]);
  return {
    tool: "claude-code",
    home,
    claudeJson: claudeJson.status,
    globalInstructions: globalRead.set,
    globalMentions: globalRead.mentions,
    settings: {
      user: layerStatus(userLayer),
      managedParts: managedLayer.parts.map((part) => ({ path: part.path, status: part.status })),
      defaultMode: { user: userView.defaultMode, managed: managedView.defaultMode },
    },
    hooks: {
      guards,
      userDisableAll: userView.disableAllHooks,
      managedDisableAll: managedView.disableAllHooks,
      managedAllowManagedOnly: managedView.allowManagedHooksOnly,
      unreadablePlugins: unreadablePlugins.sort(),
      unreadableSettings,
    },
    pluginsFile: pluginsScan.file,
    plugins,
    pluginsWithoutInstall,
    skills,
    mcpServers,
    projects,
    problems: uniqueProblems,
    unreadableDirs: [...new Set(unreadableDirs)].sort(),
    unreadableSkillPlaces: { user: unreadableSkillPlaces.user, projects: [...new Set(unreadableSkillPlaces.projects)].sort(), plugins: [...new Set(unreadableSkillPlaces.plugins)].sort() },
  };
}
