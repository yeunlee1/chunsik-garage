// 개발용. 이 PC의 Claude Code 셋팅을 스캐너로 읽어 종류별 개수와 걸린 시간만 낸다. 이름, 경로, 값, 글은 내지 않는다
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { makeWindows } from "../src/adapters/common/dates.ts";
import { collectClaude } from "../src/collect/claude.ts";
import { scanClaudeSetup } from "../src/scan/claude.ts";
import { installKeysOf } from "../src/scan/identity.ts";

const clock = { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
const collected = await collectClaude({ env: process.env, homedir: homedir(), clock, cacheDir: null, rescan: false });
// 프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더(첫 cwd)로 만든다(설계 10)
const collectDates = new Set(makeWindows(clock.nowMs, clock.timeZone).collectDates);
const mains = collected.summaries.filter((s) => s.kind === "main" && Object.entries(s.days).some(([date, day]) => collectDates.has(date) && day.responses > 0));
const cwds = mains.flatMap((s) => (s.cwd === null ? [] : [s.cwd]));
const claudeAiNames = new Set<string>();
for (const s of collected.summaries) {
  for (const day of Object.values(s.days)) {
    for (const name of [...day.loadedMcpServers, ...Object.keys(day.mcpAttributions)]) if (name.startsWith("claude.ai ")) claudeAiNames.add(name);
  }
}

const started = performance.now();
const facts = await scanClaudeSetup({ env: process.env, homedir: homedir(), tmpdir: tmpdir(), platform: process.platform, cwds, claudeAiNames: [...claudeAiNames], salt: randomBytes(32).toString("hex") });
const seconds = (performance.now() - started) / 1000;

const tally = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
console.log(
  JSON.stringify(
    {
      seconds: Number(seconds.toFixed(2)),
      mainSessions: mains.length,
      claudeJson: facts.claudeJson,
      settings: { user: facts.settings.user, managedParts: tally(facts.settings.managedParts, (p) => p.status), defaultMode: facts.settings.defaultMode },
      globalInstructions: { files: facts.globalInstructions.files.length, overBytes200: facts.globalInstructions.bytes >= 200, lines: facts.globalInstructions.lineHashes.length, unreadableDirs: facts.globalInstructions.unreadableDirs.length, projectsMentioned: Object.keys(facts.globalMentions).length },
      skills: {
        byScope: tally(facts.skills, (s) => s.scope),
        enabled: tally(facts.skills, (s) => `${s.scope}:${s.enabled}`),
        listed: tally(facts.skills, (s) => `${s.scope}:${s.listed}`),
        links: facts.skills.filter((s) => s.isLink).length,
        incomparable: facts.skills.filter((s) => s.contentHash === null).length,
        withoutCreatedTime: facts.skills.filter((s) => s.createdMs === null).length,
        hookProvided: tally(facts.skills, (s) => `${s.scope}:${s.hookProvided}`),
        withUsage: facts.skills.filter((s) => s.usageLastUsedMs !== null).length,
        managedFixed: facts.skills.filter((s) => s.managedFixed).length,
        unreadableSkillMd: facts.skills.filter((s) => !s.readable).length,
      },
      mcpServers: { byScope: tally(facts.mcpServers, (s) => s.scope), enabled: tally(facts.mcpServers, (s) => `${s.scope}:${s.enabled}`), withoutDefinition: facts.mcpServers.filter((s) => s.definitionHash === null).length },
      plugins: {
        count: facts.plugins.length,
        file: facts.pluginsFile,
        enabled: facts.plugins.filter((p) => p.enabled).length,
        missing: facts.plugins.filter((p) => !p.exists).length,
        compositionUnknown: facts.plugins.filter((p) => !p.compositionKnown).length,
        withoutInstall: facts.pluginsWithoutInstall.length,
        manifest: tally(facts.plugins, (p) => p.manifest),
        marketplaceEntry: tally(facts.plugins, (p) => p.marketplaceEntry),
        scopes: tally(facts.plugins.flatMap((p) => p.scopes), (scope) => scope),
        withUnknownEntries: facts.plugins.filter((p) => p.unknownEntries.length > 0).length,
        withHooks: facts.plugins.filter((p) => p.hasHooks).length,
        dependenciesUnknown: facts.plugins.filter((p) => p.dependencies === null).length,
        components: tally(facts.plugins.flatMap((p) => p.components), (c) => c),
      },
      projects: {
        count: facts.projects.length,
        kind: tally(facts.projects, (p) => p.kind),
        excluded: facts.projects.filter((p) => p.excluded).length,
        missing: facts.projects.filter((p) => !p.exists).length,
        withSettings: facts.projects.filter((p) => p.hasSettings).length,
        withLocalSettings: facts.projects.filter((p) => p.hasLocalSettings).length,
        fileStatus: tally(facts.projects.flatMap((p) => [`settings:${p.settingsStatus}`, `local:${p.localSettingsStatus}`, `mcpJson:${p.mcpJsonStatus}`]), (x) => x),
        instructionUnreadableDirs: facts.projects.reduce((n, p) => n + p.instructions.unreadableDirs.length, 0),
        withInstructions: facts.projects.filter((p) => p.instructions.files.length > 0).length,
        sameAsGlobalFiles: facts.projects.reduce((n, p) => n + p.instructions.files.filter((f) => f.sameAsGlobal).length, 0),
        bypass: facts.projects.filter((p) => p.bypassInProject || p.bypassInLocal).length,
        permissionConflicts: facts.projects.reduce((n, p) => n + p.permissionConflicts, 0),
      },
      hooks: { guards: tally(facts.hooks.guards, (g) => `${g.source}:${g.coversShell ? "shell" : "other"}:${g.canBlock ? "block" : "async"}`), userDisableAll: facts.hooks.userDisableAll, unreadablePlugins: facts.hooks.unreadablePlugins.length, unreadableSettings: facts.hooks.unreadableSettings.length },
      problems: tally(facts.problems, (p) => `${p.kind}:${p.owner}`),
      unreadableDirs: facts.unreadableDirs.length,
      installKeys: installKeysOf(facts).length,
    },
    null,
    2,
  ),
);
