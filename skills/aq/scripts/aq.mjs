// 춘식이 정비소 AQ 점검 실행 파일. src/를 묶은 빌드 결과라 직접 고치지 않는다.

// src/cli.ts
import { homedir, tmpdir } from "node:os";

// src/commands/checkup.ts
import { join as join16 } from "node:path";

// src/adapters/common/dates.ts
var SCORE_WINDOW_DAYS = 30;
var COLLECT_WINDOW_DAYS = 35;
var QUARTER_MS = 15 * 60 * 1e3;
var MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1e3;
var formatters = /* @__PURE__ */ new Map();
var quarterDates = /* @__PURE__ */ new Map();
function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone);
  if (formatter === void 0) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}
function localDateOf(epochMs, timeZone) {
  const quarter = Math.floor(epochMs / QUARTER_MS);
  const key = `${timeZone}|${quarter}`;
  const cached = quarterDates.get(key);
  if (cached !== void 0) return cached;
  const parts = formatterFor(timeZone).formatToParts(new Date(quarter * QUARTER_MS));
  const part = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  quarterDates.set(key, date);
  return date;
}
function localDateOfIso(iso, timeZone) {
  if (typeof iso !== "string") return null;
  const epochMs = Date.parse(iso);
  return Number.isFinite(epochMs) ? localDateOf(epochMs, timeZone) : null;
}
function shiftDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function makeWindows(nowMs, timeZone) {
  const today = localDateOf(nowMs, timeZone);
  const span2 = (count) => Array.from({ length: count }, (_, i) => shiftDate(today, i - (count - 1)));
  const collectDates = span2(COLLECT_WINDOW_DAYS);
  const [y, m, d] = collectDates[0].split("-").map(Number);
  return {
    today,
    scoreDates: span2(SCORE_WINDOW_DAYS),
    collectDates,
    collectStartLowerBoundMs: Date.UTC(y, m - 1, d) - MAX_UTC_OFFSET_MS
  };
}

// src/core/installs/age.ts
var ESTABLISHED_DAYS = 14;
var RECENT_USE_DAYS = 30;
var DAY_MS = 24 * 60 * 60 * 1e3;
var epochDay = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
function daysBefore(today, date) {
  return epochDay(today) - epochDay(date);
}
function olderThan(today, date, days) {
  return daysBefore(today, date) > days;
}
function msOlderThan(day, epochMs, days) {
  return olderThan(day.today, localDateOf(epochMs, day.timeZone), days);
}

// src/core/installs/candidates.ts
var byText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function candidatesOf(tool, skills, servers, day, self) {
  const { setup } = tool;
  const enabledPlugins = setup.plugins.filter((plugin) => plugin.enabled);
  const unknownPlugin = enabledPlugins.some((plugin) => !plugin.compositionKnown) || setup.pluginsWithoutInstall.length > 0;
  const hooksUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.hooksUnreadable);
  const serversUnseen = unknownPlugin || enabledPlugins.some((plugin) => plugin.mcpUnreadable);
  const selfPaths = new Set(self.skillRealPaths);
  const selfPlugins = new Set(setup.plugins.filter((plugin) => self.pluginNames.includes(plugin.entryName) || self.pluginNames.includes(plugin.name)).map((plugin) => plugin.id));
  const isSelfBundle = (bundle) => bundle.positions.some(
    (skill) => skill.realPath !== null && selfPaths.has(skill.realPath) || skill.recordNames.some((name) => self.skillNames.includes(name)) || skill.pluginId !== null && selfPlugins.has(skill.pluginId)
  );
  const turnedOffBy = (target) => skills.bundles.filter((bundle) => bundle.positions.some((position) => position.recordNames.includes(target)));
  const confirmed = (bundle) => bundle.verdict === "unused" && bundle.excluded === null;
  const namesUnknown = setup.skills.some((skill) => skill.nameUnreadable || !skill.readable);
  const a1 = /* @__PURE__ */ new Set();
  const a2 = /* @__PURE__ */ new Set();
  const a3 = /* @__PURE__ */ new Set();
  if (!hooksUnseen) {
    if (!namesUnknown) {
      for (const bundle of skills.bundles) {
        if (!bundle.enabled || !confirmed(bundle)) continue;
        for (const skill of bundle.positions) {
          if (skill.scope !== "user" || !skill.enabled || skill.managedFixed) continue;
          const affected = turnedOffBy(skill.name);
          if (affected.every(confirmed) && !affected.some(isSelfBundle)) a1.add(skill.name);
        }
      }
    }
    const uncounted = new Set(setup.unreadableSkillPlaces.plugins);
    const usageStale2 = (plugin) => setup.claudeJson === "ok" && !plugin.usageUndated && (plugin.usageLastUsedMs === null || msOlderThan(day, plugin.usageLastUsedMs, RECENT_USE_DAYS));
    for (const plugin of enabledPlugins) {
      const sameId = setup.plugins.filter((other) => other.id === plugin.id);
      if (sameId.length !== 1 || plugin.scopes.length !== 1 || plugin.scopes[0] !== "user") continue;
      if (!plugin.exists || !plugin.compositionKnown || plugin.managedFixed || plugin.mcpUnreadable || uncounted.has(plugin.id)) continue;
      if (self.pluginNames.includes(plugin.entryName) || self.pluginNames.includes(plugin.name)) continue;
      if (plugin.components.some((component) => component !== "skills") || plugin.unknownEntries.length > 0 || !usageStale2(plugin)) continue;
      if (enabledPlugins.some((other) => other.id !== plugin.id && (other.dependencies === null || other.dependencies.includes(plugin.entryName)))) continue;
      const own = skills.bundles.filter((bundle) => bundle.positions.some((skill) => skill.pluginId === plugin.id));
      if (own.length === 0 || !own.every(confirmed) || own.some(isSelfBundle)) continue;
      a2.add(plugin.id);
    }
  }
  if (!serversUnseen) {
    for (const judged of servers.servers) {
      const { server } = judged;
      if (server.scope !== "user" || !server.enabled || server.managedFixed || judged.verdict !== "unused" || judged.excluded !== null) continue;
      const sameName = servers.servers.filter((other) => other !== judged && other.server.enabled && other.server.name === server.name);
      if (sameName.every((other) => other.verdict === "unused" && other.excluded === null)) a3.add(server.name);
    }
  }
  const make = (unit, rule2, targets) => [...targets].sort(byText).map((target) => ({ id: `${unit}:${tool.tool}:${target}`, unit, rule: rule2, tool: tool.tool, target }));
  return [...make("A1", "E5", a1), ...make("A2", "E5", a2), ...make("A3", "E6", a3)];
}

// src/core/installs/signals.ts
function collectNames(summaries, windows, namesOf) {
  const score = new Set(windows.scoreDates);
  const collect = new Set(windows.collectDates);
  const inScore = /* @__PURE__ */ new Set();
  const inCollect = /* @__PURE__ */ new Set();
  for (const summary of summaries) {
    for (const [date, cell] of Object.entries(summary.days)) {
      if (!collect.has(date)) continue;
      for (const name of namesOf(cell)) {
        inCollect.add(name);
        if (score.has(date)) inScore.add(name);
      }
    }
  }
  return { inScore, inCollect };
}
var positive = (record) => Object.keys(record).filter((name) => record[name] > 0);
function usedSkillNames(summaries, windows) {
  return collectNames(
    summaries,
    windows,
    (cell) => Object.keys(cell.skillSignals).filter((name) => {
      const counts = cell.skillSignals[name];
      return counts.tool + counts.attribution + counts.slash + counts.injected > 0;
    })
  );
}
function calledMcpNames(summaries, windows) {
  return collectNames(summaries, windows, (cell) => [...positive(cell.mcpCalls), ...positive(cell.mcpAttributions)]);
}
function anyIn(recordNames, names2) {
  return recordNames.some((name) => names2.has(name));
}

// src/core/installs/listing.ts
function sessionListings(summaries, kind, normalizedCwds, lookup) {
  const normalized = new Map(Object.entries(normalizedCwds));
  const out = [];
  for (const summary of summaries) {
    if (summary.kind !== "main") continue;
    const initialNames = kind === "skill" ? summary.initialSkills : summary.initialMcpServers;
    const everLoaded = new Set(initialNames ?? []);
    const days = [];
    for (const date of Object.keys(summary.days).sort()) {
      const cell = summary.days[date];
      const loaded = new Set(kind === "skill" ? cell.loadedSkills : cell.loadedMcpServers);
      for (const name of loaded) everLoaded.add(name);
      days.push({ date, responses: cell.responses, loaded, reloaded: new Set(kind === "skill" ? cell.reloadedSkills : cell.reloadedMcpServers) });
    }
    out.push({
      cwdKey: summary.cwd === null ? null : normalized.get(summary.cwd) ?? summary.cwd,
      projectRoot: lookup(summary.cwd)?.normRoot ?? null,
      firstDate: summary.firstDate,
      initial: initialNames === null ? null : new Set(initialNames),
      days,
      everLoaded
    });
  }
  return out;
}
function loadedSince(listings, recordNames, projectRoot, windows) {
  const collect = new Set(windows.collectDates);
  const loadedOn = /* @__PURE__ */ new Map();
  for (const listing of listings) {
    if (listing.initial === null || projectRoot !== null && listing.projectRoot !== projectRoot) continue;
    for (const day of listing.days) {
      if (!collect.has(day.date) || day.responses <= 0) continue;
      loadedOn.set(day.date, (loadedOn.get(day.date) ?? true) && anyIn(recordNames, day.loaded));
    }
  }
  let lastMissing = "";
  for (const [date, loaded] of loadedOn) if (!loaded && date > lastMissing) lastMissing = date;
  for (const [date, loaded] of loadedOn) if (loaded && date > lastMissing && olderThan(windows.today, date, ESTABLISHED_DAYS)) return true;
  return false;
}
function restartedRecently(listings, recordNames, today) {
  const recent = (date) => date === null || !olderThan(today, date, ESTABLISHED_DAYS);
  const loadedIn = /* @__PURE__ */ new Set();
  for (const listing of listings) {
    if (listing.days.some((day) => recent(day.date) && anyIn(recordNames, day.reloaded))) return true;
    if (listing.cwdKey !== null && anyIn(recordNames, listing.everLoaded)) loadedIn.add(listing.cwdKey);
  }
  return listings.some((listing) => listing.cwdKey !== null && loadedIn.has(listing.cwdKey) && listing.initial !== null && recent(listing.firstDate) && !anyIn(recordNames, listing.initial));
}

// src/core/measure.ts
var scored = (value, evidence) => ({ status: "scored", value, evidence });
var unmeasured = (reason, evidence) => ({ status: "unmeasured", reason, evidence });
var blank = (evidence) => Object.fromEntries(Object.keys(evidence).map((key) => [key, null]));
function countGate(sees2, denominator, minimum, evidence) {
  if (!sees2) return unmeasured("unsupported", blank(evidence));
  if (denominator <= 0) return unmeasured("no_data", evidence);
  if (denominator < minimum) return unmeasured("too_little", evidence);
  return null;
}

// src/core/order.ts
function byContent(a, b) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

// src/core/readability.ts
var unread = (status) => status === "unparsable" || status === "unreadable";
function globalSettingsUnread(facts) {
  return unread(facts.settings.user) || facts.settings.managedParts.some((part) => unread(part.status));
}
function projectSettingsUnread(facts) {
  return facts.projects.some((project) => unread(project.settingsStatus) || unread(project.localSettingsStatus));
}
function enablementUnread(facts) {
  return globalSettingsUnread(facts) || projectSettingsUnread(facts);
}
function mcpPlacesUnread(facts) {
  return unread(facts.claudeJson) || unread(facts.pluginsFile) || facts.projects.some((project) => unread(project.mcpJsonStatus)) || facts.plugins.some((plugin) => plugin.enabled && (!plugin.compositionKnown || plugin.mcpUnreadable)) || facts.pluginsWithoutInstall.length > 0 || facts.unreadableSkillPlaces.user || facts.unreadableSkillPlaces.projects.length > 0;
}

// src/core/installs/gate.ts
var BLANK_INSTALL_EVIDENCE = { enabled: null, judgeable: null, judged: null, structural: null, unused: null, used: null };
function measureInstalls(enabled, complete, minimum) {
  const structural = enabled.filter((item) => item.structural).length;
  const judgeable = enabled.length - structural;
  const used = enabled.filter((item) => !item.structural && item.verdict === "used").length;
  const unused = enabled.filter((item) => !item.structural && item.verdict === "unused").length;
  const judged = used + unused;
  const evidence = { enabled: enabled.length, judgeable, judged, structural, unused, used };
  if (enabled.length === 0) return unmeasured("not_applicable", evidence);
  if (judgeable === 0) return unmeasured("unsupported", evidence);
  if (!complete) return unmeasured("incomplete", evidence);
  if (judgeable < minimum) return unmeasured("too_little", evidence);
  if (judged * 2 < judgeable || judged < minimum) return unmeasured("watching", evidence);
  return scored(unused / judged, evidence);
}

// src/core/installs/same.ts
function sameInstall(items, keyOf) {
  const byKey = /* @__PURE__ */ new Map();
  const groups = [];
  for (const item of items) {
    const key = keyOf(item);
    const group = key === null ? void 0 : byKey.get(key);
    if (group !== void 0) {
      group.push(item);
      continue;
    }
    const fresh = [item];
    groups.push(fresh);
    if (key !== null) byKey.set(key, fresh);
  }
  return groups;
}

// src/core/installs/verdict.ts
function recordMap(installs) {
  return installs === null ? null : new Map(installs.map((record) => [record.key, record]));
}
function observed(key, context) {
  const record = key === null ? void 0 : context.records?.get(key);
  const long = record !== void 0 && olderThan(context.day.today, record.firstSeen, ESTABLISHED_DAYS);
  return {
    // ㉯ 같은 정체의 설치를 계속 봐 온 첫날이 14일 넘게 앞선다
    seenLong: long,
    // ㉲ 지난 점검에는 없다가 14일 안의 점검에 새로 나타났다
    appearedRecently: record !== void 0 && record.appeared && !long,
    // ㉳ 관측 기록은 있는데 이 정체의 기록이 없다. 지난 점검과 정체가 다르다
    changed: context.records !== null && record === void 0
  };
}
function skillEstablished(skill, context) {
  const created = skill.isLink ? [skill.createdMs, skill.targetCreatedMs] : [skill.createdMs];
  const recent = (ms) => ms !== null && !msOlderThan(context.day, ms, ESTABLISHED_DAYS);
  const state = observed(skill.installKey, context);
  const createdLongAgo = created.every((ms) => ms !== null && !recent(ms));
  const loaded = createdLongAgo && loadedSince(context.listings, skill.recordNames, skill.scope === "project" ? skill.projectRoot : null, context.windows);
  if (!loaded && !state.seenLong) return false;
  return !(created.some(recent) || restartedRecently(context.listings, skill.recordNames, context.day.today) || state.appearedRecently || state.changed);
}
function serverEstablished(server, context) {
  if (server.installKey === null) return false;
  const state = observed(server.installKey, context);
  return state.seenLong && !(restartedRecently(context.listings, server.recordNames, context.day.today) || state.appearedRecently || state.changed);
}
function usageStale(skill, claudeJson, day) {
  if (claudeJson !== "ok" || skill.usageUndated) return false;
  return skill.usageLastUsedMs === null || msOlderThan(day, skill.usageLastUsedMs, RECENT_USE_DAYS);
}
function skillVerdict(skill, claudeJson, context) {
  if (skill.hookProvided) return "unknown";
  if (anyIn(skill.recordNames, context.used.inScore)) return "used";
  if (skill.nameUnreadable || !skill.readable) return "unknown";
  const unused = !anyIn(skill.recordNames, context.used.inCollect) && // ①
  usageStale(skill, claudeJson, context.day) && // ②
  context.complete && // ③
  skillEstablished(skill, context);
  return unused ? "unused" : "unknown";
}
function serverVerdict(server, context) {
  if (server.installKey === null) return "unknown";
  if (anyIn(server.recordNames, context.used.inScore)) return "used";
  return !anyIn(server.recordNames, context.used.inCollect) && context.complete && serverEstablished(server, context) ? "unused" : "unknown";
}

// src/core/installs/servers.ts
var MIN_JUDGED_SERVERS = 2;
var SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 };
var byText2 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var byServer = (a, b) => byText2(a.name, b.name) || SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || byText2(a.projectRoot ?? "", b.projectRoot ?? "") || byText2(a.pluginId ?? "", b.pluginId ?? "") || byText2(a.definitionHash ?? "", b.definitionHash ?? "") || // 같은 플러그인을 두 길로 찾으면 켜짐만 다른 서버 사실 둘이 온다. 내용까지 견줘 차례를 끝까지 정한다
byContent(a, b);
function serversUnread(tool) {
  const { setup } = tool;
  const places = setup.unreadableSkillPlaces;
  return unread(setup.claudeJson) || places.user || places.projects.length > 0 || setup.projects.some((project) => unread(project.mcpJsonStatus)) || unread(setup.pluginsFile) || enablementUnread(setup);
}
function judgeServers(tool, context) {
  const { setup } = tool;
  if (tool.coverage.mcpCalls === "unsupported") return { measurement: unmeasured("unsupported", blank(BLANK_INSTALL_EVIDENCE)), servers: [] };
  if (serversUnread(tool)) return { measurement: unmeasured("unreadable", blank(BLANK_INSTALL_EVIDENCE)), servers: [] };
  const unreadPlugins = new Set(setup.plugins.filter((plugin) => !plugin.compositionKnown || plugin.mcpUnreadable).map((plugin) => plugin.id));
  const servers = [...setup.mcpServers].sort(byServer).map((server) => {
    if (server.installKey === null) return { server, verdict: "unknown", excluded: "no_definition" };
    if (server.pluginId !== null && unreadPlugins.has(server.pluginId)) return { server, verdict: "unknown", excluded: "plugin_unread" };
    return { server, verdict: serverVerdict(server, context), excluded: null };
  });
  const installs = sameInstall(servers.filter((judged) => judged.server.enabled), (judged) => judged.server.installKey);
  const counted = installs.map((facts) => ({
    verdict: facts.some((judged) => judged.verdict === "used") ? "used" : facts.every((judged) => judged.verdict === "unused") ? "unused" : "unknown",
    structural: facts.some((judged) => judged.excluded !== null)
  }));
  return { measurement: measureInstalls(counted, context.complete, MIN_JUDGED_SERVERS), servers };
}

// src/core/installs/skills.ts
var MIN_JUDGED_SKILLS = 5;
var SCOPE_ORDER2 = { user: 0, project: 1, plugin: 2 };
var byText3 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var byPosition = (a, b) => byText3(a.name, b.name) || SCOPE_ORDER2[a.scope] - SCOPE_ORDER2[b.scope] || byText3(a.realPath ?? a.path, b.realPath ?? b.path) || byText3(a.installKey, b.installKey) || byText3(a.pluginId ?? "", b.pluginId ?? "") || byText3(a.path, b.path) || byContent(a, b);
function skillsUnread(tool) {
  const { setup } = tool;
  const places = setup.unreadableSkillPlaces;
  return setup.claudeJson !== "ok" || places.user || places.projects.length > 0 || unread(setup.pluginsFile) || enablementUnread(setup);
}
function judgeSkills(tool, context) {
  const { setup } = tool;
  if (tool.coverage.skillUsage === "unsupported") return { measurement: unmeasured("unsupported", blank(BLANK_INSTALL_EVIDENCE)), bundles: [] };
  if (skillsUnread(tool)) return { measurement: unmeasured("unreadable", blank(BLANK_INSTALL_EVIDENCE)), bundles: [] };
  const uncounted = new Set(setup.unreadableSkillPlaces.plugins);
  const grouped = /* @__PURE__ */ new Map();
  for (const skill of [...setup.skills].sort(byPosition)) {
    const key = skill.realPath ?? `\0${skill.installKey}`;
    const positions = grouped.get(key);
    if (positions === void 0) grouped.set(key, [skill]);
    else positions.push(skill);
  }
  const bundles = [];
  for (const positions of grouped.values()) {
    const fromUnreadPlugin = positions.some((skill) => skill.pluginId !== null && uncounted.has(skill.pluginId));
    const excluded = fromUnreadPlugin ? "plugin_unread" : positions.some((skill) => skill.hookProvided) ? "hook_provided" : null;
    const verdicts = positions.map((skill) => skillVerdict(skill, setup.claudeJson, context));
    const verdict = excluded !== null ? "unknown" : verdicts.includes("used") ? "used" : verdicts.every((v) => v === "unused") ? "unused" : "unknown";
    bundles.push({ positions, enabled: positions.some((skill) => skill.enabled), verdict, excluded });
  }
  const counted = bundles.filter((bundle) => bundle.enabled).map((bundle) => ({ verdict: bundle.verdict, structural: bundle.excluded !== null }));
  return { measurement: measureInstalls(counted, context.complete, MIN_JUDGED_SKILLS), bundles };
}

// src/core/metrics/fit.ts
var FREQUENT_SESSIONS = 3;
var byText4 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var scanned = (project) => project.exists && !project.excluded;
var scannedProjects = (tool) => tool.setup.projects.filter(scanned).sort((a, b) => byText4(a.normRoot, b.normRoot));
var projectIn = (tool, normRoot) => tool?.setup.projects.find((project) => project.normRoot === normRoot);
var hasInstructionFiles = (set) => set.files.length > 0 || set.unreadable.length > 0 || set.unreadableDirs.length > 0;
var treatedAsProject = (project) => project !== void 0 && (hasInstructionFiles(project.instructions) || project.hasSettings || project.hasLocalSettings);
var hasInstructions = (project) => project?.instructions.files.some((file) => file.hasContent) ?? false;
function mainTools(use) {
  const most = Math.max(...Object.values(use.sessions));
  return Object.keys(use.sessions).filter((tool) => use.sessions[tool] >= FREQUENT_SESSIONS || use.sessions[tool] === most);
}
function f3(tools, usage) {
  const byId = new Map(tools.map((tool) => [tool.tool, tool]));
  const missing = [];
  let targets = 0;
  for (const use of usage.projects) {
    const { project } = use;
    if (use.total < FREQUENT_SESSIONS || !scanned(project)) continue;
    if (project.kind !== "git" && !treatedAsProject(project) && !tools.some((tool) => treatedAsProject(projectIn(tool, project.normRoot)))) continue;
    targets++;
    const without = mainTools(use).filter((tool) => !hasInstructions(projectIn(byId.get(tool), project.normRoot)));
    if (without.length > 0) missing.push({ normRoot: project.normRoot, tools: without });
  }
  const withInstructions = targets - missing.length;
  const evidence = { targets, withInstructions };
  return { measurement: targets === 0 ? unmeasured("not_applicable", evidence) : scored(withInstructions / targets, evidence), missing };
}
var instructionsUnread = (set) => set.unreadable.length > 0 || set.unreadableDirs.length > 0;
function f4(tools) {
  let unreadable = false;
  let globalLines = 0;
  let comparedProjects = 0;
  let worst = null;
  for (const tool of [...tools].sort((a, b) => byText4(a.tool, b.tool))) {
    const global = tool.setup.globalInstructions;
    const projects = scannedProjects(tool);
    if (instructionsUnread(global) || projects.some((project) => instructionsUnread(project.instructions))) unreadable = true;
    const lines = new Set(global.lineHashes);
    globalLines += lines.size;
    if (global.files.length === 0 || lines.size === 0) continue;
    for (const project of projects) {
      if (!project.instructions.files.some((file) => !file.sameAsGlobal)) continue;
      comparedProjects++;
      const overlapping = new Set(project.instructions.lineHashes.filter((hash) => lines.has(hash))).size;
      if (worst === null || overlapping * worst.globalLines > worst.overlapping * lines.size) worst = { tool: tool.tool, normRoot: project.normRoot, overlapping, globalLines: lines.size };
    }
  }
  if (unreadable) return { measurement: unmeasured("unreadable", { comparedProjects: null, globalLines: null, overlappingLines: null }), worst: null };
  if (worst === null) return { measurement: unmeasured("not_applicable", { comparedProjects: 0, globalLines, overlappingLines: 0 }), worst: null };
  const evidence = { comparedProjects, globalLines: worst.globalLines, overlappingLines: worst.overlapping };
  return { measurement: scored(worst.overlapping / worst.globalLines, evidence), worst: { tool: worst.tool, normRoot: worst.normRoot } };
}
function f5(tool) {
  const places = tool.setup.unreadableSkillPlaces;
  if (places.user || places.projects.length > 0) return unmeasured("unreadable", { differingCopies: null, identicalCopies: null, skillKinds: null });
  const hashesByName = /* @__PURE__ */ new Map();
  for (const skill of tool.setup.skills) {
    if (skill.scope === "plugin") continue;
    let copies = hashesByName.get(skill.name);
    if (copies === void 0) hashesByName.set(skill.name, copies = /* @__PURE__ */ new Map());
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
function f6(tools) {
  let unreadable = false;
  let conflicts = 0;
  let projectsWithSettings = 0;
  for (const tool of tools) {
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
function mergedFitRules(tools, usage) {
  const guides = f3(tools, usage);
  const overlap = f4(tools);
  return { F3: guides.measurement, F4: overlap.measurement, F6: f6(tools), missingInstructions: guides.missing, worstOverlap: overlap.worst };
}
function fitToolRules(tool) {
  return { F5: f5(tool) };
}

// src/core/metrics/usage.ts
var EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"];
var HIGH_EFFORT = /* @__PURE__ */ new Set(["xhigh", "max"]);
var MIN_HOOK_RUNS = 100;
var MIN_TOOL_RESULTS = 50;
var MIN_MAIN_SESSIONS = 3;
var MIN_HUMAN_REQUESTS = 20;
var MIN_KNOWN_EFFORT = 50;
var MIN_COMPACTED_SESSIONS = 3;
var sees = (coverage, ...keys) => keys.every((key) => coverage[key] !== "unsupported");
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function s4(totals, coverage) {
  const evidence = { failures: totals.hookFailures, runs: totals.hookRuns, unclassifiedBlocks: totals.hookUnclassified };
  return countGate(sees(coverage, "mcpFailuresAndHooks"), totals.hookRuns, MIN_HOOK_RUNS, evidence) ?? scored(totals.hookFailures / totals.hookRuns, evidence);
}
function e1(totals, coverage) {
  const { input, cacheRead, cacheWrite } = totals.tokens;
  const all = input + cacheRead + cacheWrite;
  const evidence = { cacheRead, cacheWrite, input };
  return countGate(sees(coverage, "responsesAndTokens"), all, 1, evidence) ?? scored(cacheRead / all, evidence);
}
function e2(totals, coverage) {
  const evidence = { errors: totals.nonShellErrors, results: totals.nonShellResults };
  return countGate(sees(coverage, "toolErrors"), totals.nonShellResults, MIN_TOOL_RESULTS, evidence) ?? scored(totals.nonShellErrors / totals.nonShellResults, evidence);
}
function e3(totals, coverage) {
  const autoCompactions = totals.mainSessions.reduce((sum2, session) => sum2 + session.autoCompactions, 0);
  const evidence = { autoCompactions, mainSessions: totals.mainSessions.length };
  return countGate(sees(coverage, "autoCompaction"), totals.mainSessions.length, MIN_MAIN_SESSIONS, evidence) ?? scored(autoCompactions / totals.mainSessions.length, evidence);
}
function e4(totals, coverage) {
  const sample = totals.mainSessions.flatMap((session) => session.instructionTokens === null ? [] : [session.instructionTokens]);
  const evidence = { sampledSessions: sample.length, skippedSessions: totals.mainSessions.length - sample.length };
  return countGate(sees(coverage, "instructionSize"), sample.length, 1, evidence) ?? scored(median(sample), evidence);
}
function e7(totals, coverage) {
  const evidence = { denied: totals.denied, humanRequests: totals.humanRequests, interruptedTurns: totals.interruptedTurns, lengthStops: totals.lengthStops };
  const stopped = totals.denied + totals.interruptedTurns + totals.lengthStops;
  return countGate(sees(coverage, "deniedAndLengthStops", "interruptedTurns"), totals.humanRequests, MIN_HUMAN_REQUESTS, evidence) ?? scored(stopped / totals.humanRequests, evidence);
}
function f1(totals, coverage) {
  let knownEffort = 0;
  let highEffort = 0;
  let unknownLevel = 0;
  const levels = new Set(EFFORT_LEVELS);
  for (const [level, count] of Object.entries(totals.efforts)) {
    if (!levels.has(level)) unknownLevel += count;
    else {
      knownEffort += count;
      if (HIGH_EFFORT.has(level)) highEffort += count;
    }
  }
  const evidence = { highEffort, knownEffort, unknownEffort: totals.unknownEffort, unknownLevel };
  return countGate(sees(coverage, "effort"), knownEffort, MIN_KNOWN_EFFORT, evidence) ?? scored(highEffort / knownEffort, evidence);
}
function f2(totals, coverage) {
  const compacted = totals.mainSessions.filter((session) => session.autoCompactions > 0);
  const delegatedSessions = compacted.filter((session) => session.subagentCalls > 0).length;
  const evidence = { compactedSessions: compacted.length, delegatedSessions };
  return countGate(sees(coverage, "subagents", "autoCompaction"), compacted.length, MIN_COMPACTED_SESSIONS, evidence) ?? scored(delegatedSessions / compacted.length, evidence);
}
function usageRules(totals, coverage) {
  return {
    S4: s4(totals, coverage),
    E1: e1(totals, coverage),
    E2: e2(totals, coverage),
    E3: e3(totals, coverage),
    E4: e4(totals, coverage),
    E7: e7(totals, coverage),
    F1: f1(totals, coverage),
    F2: f2(totals, coverage)
  };
}

// src/core/metrics/intensity.ts
var seeing = (tools, ...keys) => tools.filter((tool) => keys.every((key) => tool.coverage[key] !== "unsupported"));
var anySees = (all, seen) => seen.length > 0 || all.length === 0;
var activeDays = (tools) => new Set(tools.flatMap((tool) => tool.totals.activeDates)).size;
var sum = (tools, pick) => tools.reduce((total, tool) => total + pick(tool), 0);
function i1(tools) {
  const days = activeDays(tools);
  return scored(days, { activeDays: days });
}
function i2(tools) {
  const seen = seeing(tools, "humanRequests");
  const days = activeDays(seen);
  const humanRequests = sum(seen, (tool) => tool.totals.humanRequests);
  const evidence = { activeDays: days, humanRequests };
  return countGate(anySees(tools, seen), days, 1, evidence) ?? scored(humanRequests / days, evidence);
}
function i3(tools) {
  const seen = seeing(tools, "humanRequests", "toolCalls");
  const humanRequests = sum(seen, (tool) => tool.totals.humanRequests);
  const toolCalls = sum(seen, (tool) => tool.totals.toolCalls);
  const evidence = { humanRequests, toolCalls };
  return countGate(anySees(tools, seen), humanRequests, MIN_HUMAN_REQUESTS, evidence) ?? scored(toolCalls / humanRequests, evidence);
}
function i4(usage) {
  const excludedFolders = usage.projects.filter((use) => use.project.excluded).length;
  const projects = usage.projects.length - excludedFolders;
  const evidence = { excludedFolders, projects, unlinkedSessions: usage.unlinkedSessions };
  return countGate(true, projects, 1, evidence) ?? scored(projects, evidence);
}
function intensityRules(tools, usage) {
  return { I1: i1(tools), I2: i2(tools), I3: i3(tools), I4: i4(usage) };
}

// src/adapters/common/version.ts
function parseVersion(text) {
  if (typeof text !== "string") return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    const diff = a[i] - b[i];
    if (diff !== 0) return diff;
  }
  return 0;
}
function formatVersion(version) {
  return `${version[0]}.${version[1]}.${version[2]}`;
}
function maxVersion(values) {
  let best = null;
  for (const value of values) {
    const version = parseVersion(value);
    if (version !== null && (best === null || compareVersions(version, best) > 0)) best = version;
  }
  return best === null ? null : formatVersion(best);
}

// src/core/metrics/setup.ts
var MIN_GLOBAL_INSTRUCTION_BYTES = 200;
var PROJECT_BYPASS_IGNORED_FROM = [2, 1, 257];
function highestMainVersion(summaries) {
  return maxVersion(summaries.filter((summary) => summary.kind === "main").map((summary) => summary.version));
}
function guardRuns(guard, hooks) {
  if (hooks.managedDisableAll) return false;
  const fromManaged = guard.source === "managed" || guard.source === "managed-plugin";
  return fromManaged || !(hooks.userDisableAll || hooks.managedAllowManagedOnly);
}
function seesProjectBypass(highestVersion) {
  const version = parseVersion(highestVersion);
  return version === null || compareVersions(version, PROJECT_BYPASS_IGNORED_FROM) < 0;
}
function safeguardOf(tool) {
  const { setup } = tool;
  const old = seesProjectBypass(tool.highestVersion);
  if (globalSettingsUnread(setup) || old && projectSettingsUnread(setup)) return { tool: tool.tool, guardHook: null, permissionChecks: null };
  const guardHook = setup.hooks.guards.some((guard) => guard.coversShell && guard.canBlock && guardRuns(guard, setup.hooks));
  const mode = setup.settings.defaultMode.managed ?? setup.settings.defaultMode.user;
  const bypass = mode === "bypass" || old && setup.projects.some((project) => project.bypassInProject || project.bypassInLocal);
  return { tool: tool.tool, guardHook, permissionChecks: !bypass };
}
function s1(tools) {
  const withInstructions = tools.filter((tool) => tool.setup.globalInstructions.bytes >= MIN_GLOBAL_INSTRUCTION_BYTES).length;
  const evidence = { tools: tools.length, withInstructions };
  return countGate(true, tools.length, 1, evidence) ?? scored(withInstructions / tools.length, evidence);
}
function s2(tools, safeguards) {
  if (safeguards.some((safeguard) => safeguard.guardHook === null)) return unmeasured("unreadable", { guarded: null, tools: tools.length });
  const guarded = safeguards.filter((safeguard) => safeguard.guardHook === true || safeguard.permissionChecks === true).length;
  const evidence = { guarded, tools: tools.length };
  return countGate(true, tools.length, 1, evidence) ?? scored(guarded / tools.length, evidence);
}
var PROBLEM_COUNTERS = { danglingLink: "danglingLinks", noFrontmatter: "noFrontmatter", unparsable: "unparsable" };
function s3(tools) {
  const counts = { danglingLinks: 0, noFrontmatter: 0, unparsable: 0 };
  const seen = /* @__PURE__ */ new Set();
  for (const tool of tools) {
    for (const problem of tool.setup.problems) {
      if (problem.owner !== "user") continue;
      const place = problem.realPath ?? problem.path;
      if (seen.has(place)) continue;
      seen.add(place);
      counts[PROBLEM_COUNTERS[problem.kind]]++;
    }
  }
  return scored(seen.size, { danglingLinks: counts.danglingLinks, noFrontmatter: counts.noFrontmatter, problems: seen.size, unparsable: counts.unparsable });
}
function s5(tool) {
  const { setup, totals } = tool;
  const enabledServers = sameInstall(setup.mcpServers.filter((server) => server.enabled), (server) => server.installKey).length;
  const failedSessions = totals.mainSessions.filter((session) => session.mcpConnectionFailure).length;
  const evidence = { enabledServers, failedSessions, mainSessions: totals.mainSessions.length };
  if (tool.coverage.mcpFailuresAndHooks === "unsupported") return unmeasured("unsupported", blank(evidence));
  if (enablementUnread(setup)) return unmeasured("unreadable", { ...evidence, enabledServers: null });
  if (enabledServers === 0) return mcpPlacesUnread(setup) ? unmeasured("unreadable", { ...evidence, enabledServers: null }) : unmeasured("not_applicable", evidence);
  return countGate(true, totals.mainSessions.length, 1, evidence) ?? scored(failedSessions / totals.mainSessions.length, evidence);
}
function mergedSetupRules(tools) {
  const safeguards = tools.map(safeguardOf);
  return { S1: s1(tools), S2: s2(tools, safeguards), S3: s3(tools), safeguards };
}
function setupToolRules(tool) {
  return { S5: s5(tool) };
}

// src/core/projects.ts
function projectLookup(projects, normalizedCwds) {
  const byNormCwd = /* @__PURE__ */ new Map();
  for (const project of projects) for (const cwd of project.cwds) byNormCwd.set(cwd, project);
  const byRawCwd = /* @__PURE__ */ new Map();
  for (const [raw, normalized] of Object.entries(normalizedCwds)) {
    const project = byNormCwd.get(normalized);
    if (project !== void 0) byRawCwd.set(raw, project);
  }
  return (cwd) => cwd === null ? null : byRawCwd.get(cwd) ?? null;
}
var byText5 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function projectUsage(tools, lookup) {
  const counts = /* @__PURE__ */ new Map();
  let unlinkedSessions = 0;
  for (const { tool, totals } of tools) {
    for (const session of totals.mainSessions) {
      const project = lookup(session.cwd);
      if (project === null) {
        unlinkedSessions++;
        continue;
      }
      let entry = counts.get(project.normRoot);
      if (entry === void 0) counts.set(project.normRoot, entry = { project, byTool: /* @__PURE__ */ new Map() });
      entry.byTool.set(tool, (entry.byTool.get(tool) ?? 0) + 1);
    }
  }
  const projects = [...counts.keys()].sort(byText5).map((normRoot) => {
    const { project, byTool } = counts.get(normRoot);
    const sessions = {};
    let total = 0;
    for (const tool of [...byTool.keys()].sort(byText5)) {
      sessions[tool] = byTool.get(tool);
      total += byTool.get(tool);
    }
    return { project, sessions, total };
  });
  return { projects, unlinkedSessions };
}

// src/core/rules.ts
var RULES_VERSION = "1.0.0";
var rule = (id, axis, kind, zeroAt, fullAt, weight, unit, tunable = false) => ({ id, axis, kind, zeroAt, fullAt, weight, unit, tunable });
var RULES = [
  rule("S1", "setup", "share", 0, 1, 3, "merged"),
  rule("S2", "setup", "share", 0, 1, 3, "merged"),
  rule("S3", "setup", "count", 3, 0, 2, "merged"),
  rule("S4", "setup", "share", 0.1, 0.01, 2, "perTool"),
  rule("S5", "setup", "share", 0.3, 0.02, 2, "perTool"),
  rule("E1", "efficiency", "share", 0.5, 0.9, 3, "perTool"),
  rule("E2", "efficiency", "share", 0.12, 0.02, 3, "perTool"),
  rule("E3", "efficiency", "rate", 3, 0.2, 3, "perTool"),
  rule("E4", "efficiency", "amount", 16e3, 4e3, 2, "perTool"),
  rule("E5", "efficiency", "share", 0.8, 0.2, 2, "perTool", true),
  rule("E6", "efficiency", "share", 0.7, 0.1, 2, "perTool", true),
  rule("E7", "efficiency", "rate", 0.15, 0.02, 1, "perTool"),
  rule("F1", "fit", "share", 0.95, 0.6, 1, "perTool"),
  rule("F2", "fit", "share", 0.1, 0.6, 1, "perTool"),
  rule("F3", "fit", "share", 0.2, 0.8, 3, "merged"),
  rule("F4", "fit", "share", 0.25, 0.02, 2, "merged"),
  rule("F5", "fit", "rate", 0.4, 0, 2, "perTool"),
  rule("F6", "fit", "count", 3, 0, 2, "merged"),
  rule("I1", "intensity", "count", 2, 20, 3, "merged"),
  rule("I2", "intensity", "rate", 3, 40, 3, "merged"),
  rule("I3", "intensity", "rate", 1, 8, 2, "merged"),
  rule("I4", "intensity", "count", 1, 4, 1, "merged")
];
function ruleSpec(id) {
  const found = RULES.find((spec) => spec.id === id);
  if (found === void 0) throw new Error(`unknown rule: ${id}`);
  return found;
}

// src/core/reasons.ts
var REASONS = ["unsupported", "unreadable", "not_applicable", "incomplete", "no_data", "too_little", "watching"];
var RESOLVABLE = /* @__PURE__ */ new Set(["unreadable", "incomplete", "no_data", "too_little", "watching"]);
var rank = (reason) => REASONS.indexOf(reason);
function ruleReason(toolReasons) {
  if (toolReasons.length === 0) return "no_data";
  const resolvable = toolReasons.filter((reason) => RESOLVABLE.has(reason));
  const pool = resolvable.length > 0 ? resolvable : toolReasons;
  return pool.reduce((last, reason) => rank(reason) > rank(last) ? reason : last);
}

// src/core/score.ts
function settleScore(value) {
  return Math.round(value * 1e12) / 1e12;
}
function ruleScore(value, zeroAt, fullAt) {
  const position = (value - zeroAt) / (fullAt - zeroAt);
  return position <= 0 ? 0 : position >= 1 ? 1 : position;
}
function roundHalfUp(value) {
  return Math.floor(Math.round(value * 1e9) / 1e9 + 0.5);
}
function gradeOf(aq) {
  if (aq >= 90) return { grade: "S", tier: 5 };
  if (aq >= 80) return { grade: "A", tier: 4 };
  if (aq >= 65) return { grade: "B", tier: 3 };
  if (aq >= 50) return { grade: "C", tier: 2 };
  return { grade: "D", tier: 1 };
}

// src/core/scoreboard.ts
var isMerged = (id) => RULES.some((spec) => spec.id === id && spec.unit === "merged");
var MERGED_RULES = RULES.map((spec) => spec.id).filter(isMerged);
var TOOL_RULES = RULES.map((spec) => spec.id).filter((id) => !isMerged(id));
var AXES = ["setup", "efficiency", "fit", "intensity"];
var CATEGORY_ORDER = ["strength", "average", "repair", "unmeasured"];
var SEVERITY_ORDER = ["critical", "caution", "info"];
var byText6 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function rateMerged(spec, measurement) {
  if (measurement.status === "unmeasured") return { status: "unmeasured", reason: measurement.reason, value: null, score: null, evidence: measurement.evidence, tools: [] };
  return { status: "scored", reason: null, value: measurement.value, score: ruleScore(measurement.value, spec.zeroAt, spec.fullAt), evidence: measurement.evidence, tools: [] };
}
function rateTools(spec, id, tools) {
  const responses = new Map(tools.map((tool) => [tool.tool, tool.responses]));
  const values = tools.map((tool) => {
    const measurement = tool.rules[id];
    const candidates = tool.candidates.filter((candidate) => candidate.rule === id).map((candidate) => candidate.id);
    if (measurement.status === "unmeasured") return { tool: tool.tool, status: "unmeasured", reason: measurement.reason, value: null, score: null, evidence: measurement.evidence, candidates };
    return { tool: tool.tool, status: "scored", reason: null, value: measurement.value, score: ruleScore(measurement.value, spec.zeroAt, spec.fullAt), evidence: measurement.evidence, candidates };
  });
  const measured2 = values.filter((value) => value.status === "scored");
  if (measured2.length === 0) return { status: "unmeasured", reason: ruleReason(values.map((value) => value.reason)), value: null, score: null, evidence: {}, tools: values };
  const weight = measured2.reduce((sum2, value) => sum2 + responses.get(value.tool), 0);
  const mean = (pick) => measured2.reduce((sum2, value) => sum2 + pick(value) * responses.get(value.tool), 0) / weight;
  return { status: "scored", reason: null, value: mean((value) => value.value), score: mean((value) => value.score), evidence: {}, tools: values };
}
var settled = (score) => score === null ? null : settleScore(score);
function categoryOf(spec, rated, candidates) {
  const score = settled(rated.score);
  const fromUnmeasuredTool = rated.tools.some((tool) => tool.status === "unmeasured" && tool.candidates.length > 0);
  if (spec.tunable && (fromUnmeasuredTool || score !== null && score < 1 && candidates.length > 0)) return "repair";
  if (score === null) return "unmeasured";
  return score >= 0.8 ? "strength" : score >= 0.6 ? "average" : "repair";
}
function severityOf(category, rawScore, weight) {
  const score = settled(rawScore);
  if (category !== "repair") return null;
  if (score === null) return "info";
  if (score < 0.3 && weight === 3) return "critical";
  return score < 0.6 && weight >= 2 ? "caution" : "info";
}
function axisScore(rules) {
  const measured2 = rules.filter((rule2) => rule2.score !== null);
  if (measured2.length === 0) return null;
  const weight = measured2.reduce((sum2, rule2) => sum2 + rule2.weight, 0);
  return roundHalfUp(measured2.reduce((sum2, rule2) => sum2 + rule2.weight * rule2.score, 0) / weight * 100);
}
function compareFindings(a, b, order) {
  const byTable = order.get(a.ruleId) - order.get(b.ruleId);
  const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (byCategory !== 0) return byCategory;
  if (a.category === "strength") return settleScore(b.weight * b.score) - settleScore(a.weight * a.score) || byTable;
  if (a.category === "repair") {
    if (a.gain === null || b.gain === null) return (a.gain === null ? 1 : 0) - (b.gain === null ? 1 : 0) || byTable;
    return b.gain - a.gain || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || byTable;
  }
  return byTable;
}
function scoreboard(measured2) {
  const tools = [...measured2.tools].sort((a, b) => byText6(a.tool, b.tool));
  const rated = new Map(RULES.map((spec) => [spec.id, isMerged(spec.id) ? rateMerged(spec, measured2.merged[spec.id]) : rateTools(spec, spec.id, tools)]));
  const scores = new Map(AXES.map((axis) => [axis, axisScore(RULES.filter((spec) => spec.axis === axis).map((spec) => ({ weight: spec.weight, score: rated.get(spec.id).score })))]));
  const findings = RULES.map((spec) => {
    const rule2 = rated.get(spec.id);
    const candidates = rule2.tools.flatMap((tool) => tool.candidates);
    const category = categoryOf(spec, rule2, candidates);
    const raised = RULES.filter((other) => other.axis === spec.axis).map((other) => ({ weight: other.weight, score: other.id === spec.id ? 1 : rated.get(other.id).score }));
    const gain = rule2.score !== null && settleScore(rule2.score) < 1 ? axisScore(raised) - scores.get(spec.axis) : null;
    return { ruleId: spec.id, axis: spec.axis, kind: spec.kind, weight: spec.weight, status: rule2.status, reason: rule2.reason, value: rule2.value, score: rule2.score, category, severity: severityOf(category, rule2.score, spec.weight), gain, evidence: rule2.evidence, tools: rule2.tools, candidates };
  });
  const axes = AXES.map((axis) => {
    const own = findings.filter((finding) => finding.axis === axis);
    return { axis, score: scores.get(axis), strengths: own.filter((finding) => finding.category === "strength").length, repairs: own.filter((finding) => finding.category === "repair").length };
  });
  const order = new Map(RULES.map((spec, index) => [spec.id, index]));
  return { axes, findings: findings.sort((a, b) => compareFindings(a, b, order)) };
}
var MIN_REQUESTS_FOR_AQ = 20;
var MIN_DAYS_FOR_AQ = 3;
function overall(axes, humanRequests, activeDays2) {
  const measured2 = axes.flatMap((axis) => axis.score === null ? [] : [axis.score]);
  const missingAxes = axes.filter((axis) => axis.score === null).map((axis) => axis.axis);
  const withheld = [];
  if (humanRequests < MIN_REQUESTS_FOR_AQ) withheld.push("too_few_requests");
  if (activeDays2 < MIN_DAYS_FOR_AQ) withheld.push("too_few_days");
  if (measured2.length === 0) withheld.push("no_axes");
  if (withheld.length > 0) return { aq: null, grade: null, tier: null, withheld, missingAxes };
  const aq = roundHalfUp(measured2.reduce((sum2, score) => sum2 + score, 0) / measured2.length);
  return { aq, ...gradeOf(aq), withheld, missingAxes };
}

// src/core/totals.ts
function instructionTokens(chars) {
  if (chars === null || chars.ascii + chars.other <= 0) return null;
  return chars.ascii / 4 + chars.other;
}
function toolTotals(summaries, windows, shellTools) {
  const score = new Set(windows.scoreDates);
  const collect = new Set(windows.collectDates);
  const shell = new Set(shellTools);
  const totals = {
    responses: 0,
    collectResponses: 0,
    tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 },
    humanRequests: 0,
    toolCalls: 0,
    nonShellResults: 0,
    nonShellErrors: 0,
    denied: 0,
    interruptedTurns: 0,
    lengthStops: 0,
    efforts: {},
    unknownEffort: 0,
    hookRuns: 0,
    hookFailures: 0,
    hookUnclassified: 0,
    activeDates: [],
    mainSessions: []
  };
  const efforts = /* @__PURE__ */ new Map();
  const active = /* @__PURE__ */ new Set();
  for (const summary of summaries) {
    const session = {
      sessionId: summary.sessionId,
      cwd: summary.cwd,
      autoCompactions: 0,
      subagentCalls: 0,
      mcpConnectionFailure: false,
      instructionTokens: instructionTokens(summary.instructionChars)
    };
    let sessionResponses = 0;
    for (const [date, cell] of Object.entries(summary.days)) {
      if (collect.has(date)) totals.collectResponses += cell.responses;
      if (!score.has(date)) continue;
      totals.responses += cell.responses;
      sessionResponses += cell.responses;
      if (cell.responses > 0) active.add(date);
      totals.tokens.input += cell.tokens.input;
      totals.tokens.cacheRead += cell.tokens.cacheRead;
      totals.tokens.cacheWrite += cell.tokens.cacheWrite;
      totals.tokens.output += cell.tokens.output;
      totals.tokens.thinking += cell.tokens.thinking;
      if (summary.kind === "main") totals.humanRequests += cell.humanRequests;
      for (const [name, counts] of Object.entries(cell.tools)) {
        totals.toolCalls += counts.calls;
        totals.denied += counts.deniedByUser + counts.deniedByHook + counts.deniedByPermission;
        if (shell.has(name)) continue;
        totals.nonShellResults += counts.results;
        totals.nonShellErrors += counts.errors;
      }
      totals.interruptedTurns += cell.interruptedTurns;
      totals.lengthStops += cell.lengthStops;
      for (const [name, count] of Object.entries(cell.efforts)) efforts.set(name, (efforts.get(name) ?? 0) + count);
      totals.unknownEffort += cell.unknownEffort;
      for (const counts of Object.values(cell.hooks)) {
        totals.hookRuns += counts.runs;
        totals.hookFailures += counts.failures;
        totals.hookUnclassified += counts.unclassifiedBlocks;
      }
      session.autoCompactions += cell.autoCompactions;
      session.subagentCalls += cell.subagentCalls;
      if (cell.mcpConnectionFailure) session.mcpConnectionFailure = true;
    }
    if (summary.kind === "main" && sessionResponses > 0) totals.mainSessions.push(session);
  }
  for (const name of [...efforts.keys()].sort()) totals.efforts[name] = efforts.get(name);
  totals.activeDates = [...active].sort();
  totals.mainSessions.sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0) || byContent(a, b));
  return totals;
}

// src/core/evaluate.ts
var byText7 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var span = (dates) => ({ from: dates[0], to: dates[dates.length - 1] });
function evaluate(input) {
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const day = { today: windows.today, timeZone: input.clock.timeZone };
  const lookup = projectLookup(input.projects, input.normalizedCwds);
  const records = recordMap(input.installs);
  const all = [...input.tools].sort((a, b) => byText7(a.tool, b.tool)).map((tool) => ({ input: tool, totals: toolTotals(tool.summaries, windows, tool.shellTools) }));
  const scored2 = all.filter((tool) => tool.totals.responses > 0);
  const setups = scored2.map((tool) => ({ tool: tool.input.tool, totals: tool.totals, coverage: tool.input.coverage, setup: tool.input.setup, highestVersion: highestMainVersion(tool.input.summaries) }));
  const usage = projectUsage(setups, lookup);
  const judged = scored2.map((tool, index) => {
    const setup = setups[index];
    const { summaries } = tool.input;
    const base = { day, windows, records };
    const skills = judgeSkills(setup, { ...base, used: usedSkillNames(summaries, windows), listings: sessionListings(summaries, "skill", input.normalizedCwds, lookup), complete: tool.input.complete.skills });
    const servers = judgeServers(setup, { ...base, used: calledMcpNames(summaries, windows), listings: sessionListings(summaries, "mcp", input.normalizedCwds, lookup), complete: tool.input.complete.mcp });
    const candidates = candidatesOf(setup, skills, servers, day, input.self);
    const measured2 = {
      tool: setup.tool,
      responses: setup.totals.responses,
      rules: { ...usageRules(setup.totals, setup.coverage), ...setupToolRules(setup), ...fitToolRules(setup), E5: skills.measurement, E6: servers.measurement },
      candidates
    };
    return { tool: setup.tool, skills: skills.bundles, servers: servers.servers, candidates, measured: measured2 };
  });
  const { S1, S2, S3, safeguards } = mergedSetupRules(setups);
  const { F3, F4, F6, missingInstructions, worstOverlap } = mergedFitRules(setups, usage);
  const board = scoreboard({ merged: { S1, S2, S3, F3, F4, F6, ...intensityRules(setups, usage) }, tools: judged.map((tool) => tool.measured) });
  const humanRequests = scored2.reduce((sum2, tool) => sum2 + tool.totals.humanRequests, 0);
  const activeDays2 = new Set(scored2.flatMap((tool) => tool.totals.activeDates)).size;
  const judgedByTool = new Map(judged.map((tool) => [tool.tool, tool]));
  return {
    rulesVersion: RULES_VERSION,
    windows: { today: windows.today, score: span(windows.scoreDates), collect: span(windows.collectDates) },
    tools: all.map((tool) => {
      const own = judgedByTool.get(tool.input.tool);
      return { tool: tool.input.tool, scored: tool.totals.responses > 0, inCalendar: tool.totals.collectResponses > 0, totals: tool.totals, skills: own?.skills ?? [], servers: own?.servers ?? [] };
    }),
    score: overall(board.axes, humanRequests, activeDays2),
    axes: board.axes,
    findings: board.findings,
    candidates: judged.flatMap((tool) => tool.candidates),
    safeguards,
    missingInstructions,
    worstOverlap,
    projects: usage
  };
}

// src/core/copy/common.ts
var TOOL_NAMES = {
  "claude-code": { en: "Claude Code", ko: "Claude Code" }
};
var AXIS_NAMES = {
  setup: { en: "Setup", ko: "\uC14B\uD305" },
  efficiency: { en: "Efficiency", ko: "\uD6A8\uC728" },
  fit: { en: "Fit", ko: "\uC0C1\uD669 \uC801\uD569" },
  intensity: { en: "Intensity", ko: "\uAC15\uB3C4" }
};
var SUMMARY_COPY = {
  en: { best: "{name} {value}", gain: "{axis} up to +{gain}", unmeasured: "{candidates} to clean up \xB7 share not measured", otherTools: "{candidates} to clean up \xB7 share for {tools} not measured", candidates: "{candidates} to clean up" },
  ko: { best: "{name} {value}", gain: "{axis} \uCD5C\uB300 +{gain}", unmeasured: "\uC815\uB9AC\uD560 \uAC83 {candidates}\uAC1C \xB7 \uBE44\uC728\uC740 \uC7B4 \uC218 \uC5C6\uC74C", otherTools: "\uC815\uB9AC\uD560 \uAC83 {candidates}\uAC1C \xB7 {tools}\uC758 \uBE44\uC728\uC740 \uC7B4 \uC218 \uC5C6\uC74C", candidates: "\uC815\uB9AC\uD560 \uAC83 {candidates}\uAC1C" }
};
var REASON_COPY = {
  unsupported: {
    en: { word: "Not recorded", text: "This tool or record format does not record what this rule needs." },
    ko: { word: "\uAE30\uB85D\uB418\uC9C0 \uC54A\uC74C", text: "\uC774 \uB3C4\uAD6C\uB098 \uAE30\uB85D \uD615\uC2DD\uC740 \uC774 \uADDC\uCE59\uC774 \uBCF4\uB294 \uAC83\uC744 \uB0A8\uAE30\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }
  },
  unreadable: {
    en: { word: "Could not read", text: "A file this rule needs could not be read. See the notices as well." },
    ko: { word: "\uC77D\uC9C0 \uBABB\uD568", text: "\uC774 \uADDC\uCE59\uC5D0 \uD544\uC694\uD55C \uD30C\uC77C\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC54C\uB9BC\uB3C4 \uD568\uAED8 \uBCF4\uC138\uC694." }
  },
  not_applicable: {
    en: { word: "Not applicable", text: "There is nothing for this rule to look at." },
    ko: { word: "\uD574\uB2F9 \uC5C6\uC74C", text: "\uC774 \uADDC\uCE59\uC774 \uBCFC \uAC83\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }
  },
  incomplete: {
    en: { word: "Incomplete records", text: "The records could not all be read, so this was not measured." },
    ko: { word: "\uAE30\uB85D\uC774 \uBE60\uC9D0", text: "\uAE30\uB85D\uC744 \uBE60\uC9D0\uC5C6\uC774 \uC77D\uC9C0 \uBABB\uD574 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
  },
  no_data: {
    en: { word: "No records", text: "There is nothing in the records to measure yet." },
    ko: { word: "\uAE30\uB85D \uC5C6\uC74C", text: "\uC7B4 \uAE30\uB85D\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4." }
  },
  too_little: {
    en: { word: "Too few records", text: "Not enough records have built up to measure this." },
    ko: { word: "\uAE30\uB85D\uC774 \uC801\uC74C", text: "\uC7B4 \uB9CC\uD07C \uAE30\uB85D\uC774 \uC313\uC774\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
  },
  watching: {
    en: { word: "Still watching", text: "Still watching before judging." },
    ko: { word: "\uC9C0\uCF1C\uBCF4\uB294 \uC911", text: "\uC544\uC9C1 \uC9C0\uCF1C\uBCF4\uB294 \uC911\uC785\uB2C8\uB2E4." }
  }
};
var TOOL_LINE = {
  en: { measured: "{tool}: {value} \xB7 {evidence}", unmeasured: "{tool}: not measured ({reason}) \xB7 {evidence}" },
  ko: { measured: "{tool}: {value} \xB7 {evidence}", unmeasured: "{tool}: \uC7B4 \uC218 \uC5C6\uC74C({reason}) \xB7 {evidence}" }
};
var OTHER_TOOL_COPY = {
  too_little: {
    en: "Only {judgeable} {judgeable:installation|installations} in {tool} can be assessed for use, so its share was not calculated, but {candidates} can be cleaned up.",
    ko: "{tool}\uB294 \uC4F0\uB294\uC9C0 \uAC00\uB9B4 \uC218 \uC788\uB294 \uAC83\uC774 {judgeable}\uAC1C\uBFD0\uC774\uC5B4\uC11C \uBE44\uC728\uC744 \uB0B4\uC9C0 \uC54A\uC558\uC9C0\uB9CC \uC815\uB9AC\uD560 \uC218 \uC788\uB294 \uAC83\uC774 {candidates}\uAC1C \uC788\uC2B5\uB2C8\uB2E4."
  },
  watching: {
    en: "Some installations in {tool} are still being observed, so its share was not calculated, but {candidates} of those confirmed unused can be cleaned up now.",
    ko: "{tool}\uB294 \uC544\uC9C1 \uC9C0\uCF1C\uBCF4\uB294 \uC911\uC778 \uAC83\uC774 \uC788\uC5B4 \uBE44\uC728\uC744 \uB0B4\uC9C0 \uC54A\uC558\uC9C0\uB9CC \uC548 \uC4F0\uB294 \uAC83\uC73C\uB85C \uD655\uC778\uB41C \uAC83 \uAC00\uC6B4\uB370 {candidates}\uAC1C\uB294 \uC9C0\uAE08 \uC815\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
  }
};
var SAFEGUARD_COPY = {
  en: {
    line: "{tool}: {condition}",
    hook: "a PreToolUse hook that can block covers shell commands",
    permissions: "the default mode does not bypass permissions",
    both: "the default mode does not bypass permissions, and a confirming hook covers shell commands too",
    none: "no safeguard (permissions are bypassed and no confirming hook covers shell commands)",
    unknown: "could not tell, because a settings file could not be read"
  },
  ko: {
    line: "{tool}: {condition}",
    hook: "\uC178 \uBA85\uB839\uC744 \uB36E\uB294 \uB3C4\uAD6C \uC2E4\uD589 \uC804 \uD655\uC778 \uD6C5\uC774 \uC788\uC74C",
    permissions: "\uAE30\uBCF8 \uBAA8\uB4DC\uAC00 \uAD8C\uD55C \uC6B0\uD68C\uAC00 \uC544\uB2D8",
    both: "\uAE30\uBCF8 \uBAA8\uB4DC\uAC00 \uAD8C\uD55C \uC6B0\uD68C\uAC00 \uC544\uB2C8\uACE0 \uC178 \uBA85\uB839\uC744 \uB36E\uB294 \uD655\uC778 \uD6C5\uB3C4 \uC788\uC74C",
    none: "\uC548\uC804\uC7A5\uCE58 \uC5C6\uC74C(\uAD8C\uD55C \uC6B0\uD68C \uBAA8\uB4DC\uC774\uACE0 \uC178 \uBA85\uB839\uC744 \uB36E\uB294 \uD655\uC778 \uD6C5\uC774 \uC5C6\uC74C)",
    unknown: "\uC124\uC815 \uD30C\uC77C\uC744 \uC77D\uC9C0 \uBABB\uD574 \uAC00\uB9AC\uC9C0 \uBABB\uD568"
  }
};
var UNJUDGED_COPY = {
  en: {
    intro: "Servers left out of the judgment that have no record of being called. They are not suggested for turning off.",
    line: "{tool}: {why} ({count})",
    why: {
      no_definition: "definition not on this PC or not fully read",
      plugin_unread: "plugin configuration or MCP definitions could not be read",
      not_established: "still being watched",
      observation_incomplete: "records could not all be read"
    },
    deny: 'To block a claude.ai connector that Claude Code loads itself, add { "serverName": "<name>" } to the deniedMcpServers list in your user settings (~/.claude/settings.json). Connectors that the desktop app passes in directly are not blocked this way. Disconnect those at claude.ai/customize/connectors.'
  },
  ko: {
    intro: "\uD310\uC815\uC5D0\uC11C \uBE80 \uC11C\uBC84 \uAC00\uC6B4\uB370 \uBD80\uB978 \uAE30\uB85D\uC774 \uC5C6\uB294 \uAC83\uC785\uB2C8\uB2E4. \uB044\uC790\uACE0 \uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    line: "{tool}: {why} {count}\uAC1C",
    why: {
      no_definition: "\uC815\uC758\uAC00 \uC774 PC\uC5D0 \uC5C6\uAC70\uB098 \uB2E4 \uC77D\uD788\uC9C0 \uC54A\uC74C",
      plugin_unread: "\uD50C\uB7EC\uADF8\uC778 \uAD6C\uC131\uC774\uB098 MCP \uC815\uC758\uB97C \uC77D\uC9C0 \uBABB\uD568",
      not_established: "\uC544\uC9C1 \uC9C0\uCF1C\uBCF4\uB294 \uC911",
      observation_incomplete: "\uAE30\uB85D\uC744 \uBE60\uC9D0\uC5C6\uC774 \uC77D\uC9C0 \uBABB\uD568"
    },
    deny: 'Claude Code\uAC00 \uC9C1\uC811 \uAC00\uC838\uC624\uB294 claude.ai \uC5F0\uACB0\uC744 \uB9C9\uC73C\uB824\uBA74 \uC0AC\uC6A9\uC790 \uC124\uC815(~/.claude/settings.json)\uC758 deniedMcpServers \uBAA9\uB85D\uC5D0 { "serverName": "<\uC774\uB984>" }\uC744 \uB354\uD558\uC138\uC694. \uB370\uC2A4\uD06C\uD1B1 \uC571\uC774 \uC9C1\uC811 \uB118\uAE30\uB294 \uC5F0\uACB0\uC740 \uC774\uB807\uAC8C \uB9C9\uD788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uADF8\uB7F0 \uC5F0\uACB0\uC740 claude.ai/customize/connectors\uC5D0\uC11C \uB04A\uC73C\uC138\uC694.'
  }
};

// src/core/copy/format.ts
var UNCOUNTED = "\u2014";
function groupDigits(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function oneDecimal(value) {
  const tenths = roundHalfUp(value * 10);
  const whole = groupDigits(Math.floor(tenths / 10));
  const rest = tenths % 10;
  return rest === 0 ? whole : `${whole}.${rest}`;
}
function formatValue(kind, value) {
  if (kind === "share") return oneDecimal(value * 100);
  if (kind === "rate") return oneDecimal(value);
  return groupDigits(roundHalfUp(value));
}
var SLOT = /\{([A-Za-z]+)(?::([^|{}]*)\|([^|{}]*))?\}/g;
function slots(template) {
  return [...new Set([...template.matchAll(SLOT)].map((match) => match[1]))];
}
function fill(template, values) {
  return template.replace(SLOT, (_match, name, one, other) => {
    if (!(name in values)) throw new Error(`no value for {${name}} in "${template}"`);
    const value = values[name];
    if (one !== void 0 && other !== void 0) return value === 1 ? one : other;
    if (value === null) return UNCOUNTED;
    return typeof value === "number" ? groupDigits(value) : value;
  });
}

// src/core/copy/rules-efficiency.ts
var WATCHING = {
  en: { word: "Still watching", text: "Some are still being watched, so the unused share was not given." },
  ko: { word: "\uC9C0\uCF1C\uBCF4\uB294 \uC911", text: "\uC544\uC9C1 \uC9C0\uCF1C\uBCF4\uB294 \uC911\uC778 \uAC83\uC774 \uC788\uC5B4 \uC548 \uC4F0\uB294 \uBE44\uC728\uC740 \uB0B4\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
};
var WATCHING_REPAIR = {
  en: "Some are still being watched, so the unused share was not given. {candidates} of the ones confirmed unused can be cleaned up now.",
  ko: "\uC544\uC9C1 \uC9C0\uCF1C\uBCF4\uB294 \uC911\uC778 \uAC83\uC774 \uC788\uC5B4 \uC548 \uC4F0\uB294 \uBE44\uC728\uC740 \uB0B4\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC548 \uC4F0\uB294 \uAC83\uC73C\uB85C \uD655\uC778\uB41C \uAC83 \uAC00\uC6B4\uB370 {candidates}\uAC1C\uB294 \uC9C0\uAE08 \uC815\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
};
var FEW = { en: "Few eligible for assessment", ko: "\uAC00\uB9B4 \uC218 \uC788\uB294 \uAC83\uC774 \uC801\uC74C" };
var EFFICIENCY_COPY = {
  E1: {
    en: {
      name: "Cache hits",
      good: "Reuses cached context instead of recomputing it",
      why: "Cached conversation prefixes are reused rather than processed again. This rule measures the share of input read from that cache.",
      fix: "Keep the start of sessions stable",
      problem: "{value} of input was read from the cache.",
      prescription: "Keep one task in one session, and avoid turning MCP servers on and off in the middle of a session. After a long pause the cache expires and is built again.",
      method: "Share of input read from the cache. For Claude Code, the whole input is plain input plus cache reads plus cache writes.",
      evidence: "Cache reads {cacheRead} \xB7 input {input} \xB7 cache writes {cacheWrite} (tokens)",
      unit: "%",
      reasons: { no_data: { text: "No input tokens were recorded in the scoring window." } }
    },
    ko: {
      name: "\uCE90\uC2DC \uC801\uC911",
      good: "\uAC19\uC740 \uB0B4\uC6A9\uC744 \uB2E4\uC2DC \uACC4\uC0B0\uC2DC\uD0A4\uC9C0 \uC54A\uC74C",
      why: "\uCE90\uC2DC\uC5D0\uC11C \uC77D\uC740 \uB300\uD654 \uC55E\uBD80\uBD84\uC740 \uB2E4\uC2DC \uACC4\uC0B0\uD558\uC9C0 \uC54A\uACE0 \uC7AC\uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uC774 \uD56D\uBAA9\uC740 \uC785\uB825 \uAC00\uC6B4\uB370 \uADF8\uB807\uAC8C \uCE90\uC2DC\uC5D0\uC11C \uC77D\uC740 \uBAAB\uC744 \uBD05\uB2C8\uB2E4.",
      fix: "\uC138\uC158\uC758 \uC55E\uBD80\uBD84\uC744 \uC790\uC8FC \uBC14\uAFB8\uC9C0 \uC54A\uAE30",
      problem: "\uC785\uB825 \uAC00\uC6B4\uB370 \uCE90\uC2DC\uC5D0\uC11C \uC77D\uC740 \uBAAB\uC774 {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uD55C \uAC00\uC9C0 \uC77C\uC740 \uD55C \uC138\uC158\uC5D0\uC11C \uC774\uC5B4 \uD558\uACE0, \uC138\uC158 \uB3C4\uC911\uC5D0 MCP \uC11C\uBC84\uB97C \uCF1C\uACE0 \uB044\uB294 \uC77C\uC744 \uC904\uC774\uC138\uC694. \uC624\uB798 \uC26C\uBA74 \uCE90\uC2DC\uAC00 \uB9CC\uB8CC\uB418\uC5B4 \uB2E4\uC2DC \uB9CC\uB4E4\uC5B4\uC9D1\uB2C8\uB2E4.",
      method: "\uC785\uB825 \uAC00\uC6B4\uB370 \uCE90\uC2DC\uC5D0\uC11C \uC77D\uC740 \uBAAB\uC785\uB2C8\uB2E4. Claude Code\uB294 \uC785\uB825, \uCE90\uC2DC \uC77D\uAE30, \uCE90\uC2DC \uC4F0\uAE30\uB97C \uB354\uD55C \uAC83\uC774 \uC804\uCCB4 \uC785\uB825\uC785\uB2C8\uB2E4.",
      evidence: "\uCE90\uC2DC \uC77D\uAE30 {cacheRead} \xB7 \uC785\uB825 {input} \xB7 \uCE90\uC2DC \uC4F0\uAE30 {cacheWrite} (\uD1A0\uD070)",
      unit: "%",
      reasons: { no_data: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC785\uB825 \uD1A0\uD070\uC774 \uAE30\uB85D\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." } }
    }
  },
  E2: {
    en: {
      name: "Tool errors",
      good: "Tools rarely end in errors",
      why: "A tool call that ends in an error has to be retried or worked around, which spends turns and tokens. Shell commands are left out, because a non-zero exit is usually the result of the work, such as a failing test.",
      fix: "Reduce tool errors",
      problem: "{value} of tool results ended in an error.",
      prescription: "Look at which tools fail most often. Reading a file that has moved, editing text that has already changed, and an MCP server that does not answer are examples. If the same cause keeps coming back, such as an old path in your instructions, fix that cause.",
      method: "Share of tool results that ended in an error. Shell commands, and results that were denied or interrupted, are left out of both counts.",
      evidence: "Errors {errors} \xB7 tool results {results}",
      unit: "%",
      reasons: {
        no_data: { text: "There were no tool results to count in the scoring window." },
        too_little: { text: "Fewer than 50 tool results, so this was not measured." }
      }
    },
    ko: {
      name: "\uB3C4\uAD6C \uC624\uB958",
      good: "\uB3C4\uAD6C\uAC00 \uC624\uB958\uB85C \uB05D\uB098\uB294 \uC77C\uC774 \uB4DC\uBB3E",
      why: "\uC624\uB958\uB85C \uB05D\uB09C \uB3C4\uAD6C \uD638\uCD9C\uC740 \uB2E4\uC2DC \uD558\uAC70\uB098 \uB3CC\uC544\uAC00\uC57C \uD574\uC11C \uD134\uACFC \uD1A0\uD070\uC774 \uB4ED\uB2C8\uB2E4. \uC178 \uBA85\uB839\uC740 \uBE8D\uB2C8\uB2E4. 0\uC774 \uC544\uB2CC \uAC12\uC73C\uB85C \uB05D\uB098\uB294 \uAC83\uC740 \uC2E4\uD328\uD55C \uC2DC\uD5D8\uCC98\uB7FC \uB300\uAC1C \uC77C\uC758 \uACB0\uACFC\uC774\uAE30 \uB54C\uBB38\uC785\uB2C8\uB2E4.",
      fix: "\uB3C4\uAD6C \uC624\uB958 \uC904\uC774\uAE30",
      problem: "\uB3C4\uAD6C \uACB0\uACFC \uAC00\uC6B4\uB370 {value}\uAC00 \uC624\uB958\uB85C \uB05D\uB0AC\uC2B5\uB2C8\uB2E4.",
      prescription: "\uC5B4\uB290 \uB3C4\uAD6C\uAC00 \uC790\uC8FC \uC2E4\uD328\uD558\uB294\uC9C0 \uBCF4\uC138\uC694. \uC62E\uACA8\uC9C4 \uD30C\uC77C\uC744 \uC77D\uAC70\uB098, \uC774\uBBF8 \uBC14\uB010 \uAE00\uC744 \uACE0\uCE58\uB824 \uD558\uAC70\uB098, MCP \uC11C\uBC84\uAC00 \uC751\uB2F5\uD558\uC9C0 \uC54A\uB294 \uAC83\uC774 \uADF8\uB7F0 \uC608\uC785\uB2C8\uB2E4. \uC9C0\uCE68\uC5D0 \uB0A8\uC740 \uC61B \uACBD\uB85C\uCC98\uB7FC \uAC19\uC740 \uAE4C\uB2ED\uC774 \uB418\uD480\uC774\uB418\uBA74 \uADF8 \uAE4C\uB2ED\uC744 \uACE0\uCE58\uC138\uC694.",
      method: "\uB3C4\uAD6C \uACB0\uACFC \uAC00\uC6B4\uB370 \uC624\uB958\uB85C \uB05D\uB09C \uBAAB\uC785\uB2C8\uB2E4. \uC178 \uBA85\uB839\uACFC, \uAC70\uC808\uB418\uAC70\uB098 \uB04A\uACA8\uC11C \uB05D\uB09C \uACB0\uACFC\uB294 \uB450 \uC218\uC5D0\uC11C \uBAA8\uB450 \uBE8D\uB2C8\uB2E4.",
      evidence: "\uC624\uB958 {errors} \xB7 \uB3C4\uAD6C \uACB0\uACFC {results}",
      unit: "%",
      reasons: {
        no_data: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC140 \uB3C4\uAD6C \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." },
        too_little: { text: "\uB3C4\uAD6C \uACB0\uACFC\uAC00 50\uAC1C\uC5D0 \uBABB \uBBF8\uCCD0 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  E3: {
    en: {
      name: "Context overflow",
      good: "Rarely needs automatic compaction",
      why: "When a conversation fills the context window, Claude Code compacts it automatically and earlier details are shortened.",
      fix: "Split long sessions",
      problem: "Automatic compaction averaged {value}.",
      prescription: "Run /compact yourself before the context fills, or start a new conversation with /clear when the task changes. Hand large file reads and long searches to a subagent, which works in its own context window.",
      method: "Automatic compactions in main sessions divided by main sessions with responses in the scoring window.",
      evidence: "Automatic compactions {autoCompactions} \xB7 main sessions {mainSessions}",
      unit: "{value:compaction|compactions} per session",
      reasons: {
        no_data: { text: "No main session had responses in the scoring window." },
        too_little: { text: "Fewer than 3 main sessions with responses, so this was not measured." }
      }
    },
    ko: {
      name: "\uB300\uD654 \uB118\uCE68",
      good: "\uC790\uB3D9 \uC555\uCD95\uC774 \uB4DC\uBB3E",
      why: "\uB300\uD654\uAC00 \uB300\uD654 \uCC3D\uC744 \uCC44\uC6B0\uBA74 Claude Code\uAC00 \uC790\uB3D9\uC73C\uB85C \uC555\uCD95\uD558\uACE0 \uC55E\uC758 \uC790\uC138\uD55C \uB0B4\uC6A9\uC774 \uC904\uC5B4\uB4ED\uB2C8\uB2E4.",
      fix: "\uAE34 \uC138\uC158 \uB098\uB204\uAE30",
      problem: "\uC8FC \uC138\uC158\uC758 \uC790\uB3D9 \uC555\uCD95\uC774 \uD3C9\uADE0 {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uB300\uD654 \uCC3D\uC774 \uCC28\uAE30 \uC804\uC5D0 /compact\uB85C \uC9C1\uC811 \uC904\uC774\uAC70\uB098, \uC77C\uC774 \uBC14\uB00C\uBA74 /clear\uB85C \uC0C8 \uB300\uD654\uB97C \uC2DC\uC791\uD558\uC138\uC694. \uD070 \uD30C\uC77C \uC77D\uAE30\uB098 \uAE34 \uC870\uC0AC\uB294 \uC790\uAE30 \uB300\uD654 \uCC3D\uC5D0\uC11C \uC77C\uD558\uB294 \uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uC5D0 \uB9E1\uAE30\uC138\uC694.",
      method: "\uC8FC \uC138\uC158\uC758 \uC790\uB3D9 \uC555\uCD95 \uD69F\uC218\uB97C \uC810\uC218 \uAD6C\uAC04\uC5D0 \uC751\uB2F5\uC774 \uC788\uB294 \uC8FC \uC138\uC158 \uC218\uB85C \uB098\uB208 \uAC12\uC785\uB2C8\uB2E4.",
      evidence: "\uC790\uB3D9 \uC555\uCD95 {autoCompactions} \xB7 \uC8FC \uC138\uC158 {mainSessions}",
      unit: "\uD68C/\uC138\uC158",
      reasons: {
        no_data: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC751\uB2F5\uC774 \uC788\uB294 \uC8FC \uC138\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." },
        too_little: { text: "\uC751\uB2F5\uC774 \uC788\uB294 \uC8FC \uC138\uC158\uC774 3\uAC1C\uC5D0 \uBABB \uBBF8\uCCD0 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  E4: {
    en: {
      name: "Always-loaded instructions",
      good: "Keeps always-loaded instructions light",
      why: "Instructions load at the start of every session and take room in the context window for the whole session. Lighter instructions leave that much more room for the work.",
      fix: "Trim always-loaded instructions",
      problem: "Instructions loaded in a main session come to {value} at the median.",
      prescription: "Move instructions you do not need every time into .claude/rules/ files with paths frontmatter, so they load when Claude works on matching files. Importing a file with @ from an always-loaded CLAUDE.md does not make it load on demand.",
      method: "Median size of the instructions loaded in main sessions. One token is estimated per 4 ASCII characters and per other character, such as Korean. Sessions whose instruction size was not left in the records are not in the sample.",
      evidence: "Sessions in the sample {sampledSessions} \xB7 sessions whose instruction size was not recorded {skippedSessions}",
      unit: "{value:token|tokens} (est.)",
      reasons: {
        no_data: {
          word: "Size not recorded",
          text: "The instruction size was not found in the records. Some ways of running Claude Code do not record the input sent at the start of a session, including instructions."
        }
      }
    },
    ko: {
      name: "\uB9E4\uBC88 \uC2E4\uB9AC\uB294 \uC9C0\uCE68",
      good: "\uB9E4\uBC88 \uC2E4\uB9AC\uB294 \uC9C0\uCE68\uC744 \uAC00\uBCCD\uAC8C \uB460",
      why: "\uC9C0\uCE68\uC740 \uC138\uC158\uB9C8\uB2E4 \uCC98\uC74C\uC5D0 \uC2E4\uB824 \uC138\uC158 \uB0B4\uB0B4 \uB300\uD654 \uCC3D\uC758 \uC790\uB9AC\uB97C \uCC28\uC9C0\uD569\uB2C8\uB2E4. \uC9C0\uCE68\uC774 \uAC00\uBCBC\uC6B0\uBA74 \uC77C\uC5D0 \uC4F8 \uC790\uB9AC\uAC00 \uADF8\uB9CC\uD07C \uB0A8\uC2B5\uB2C8\uB2E4.",
      fix: "\uB9E4\uBC88 \uC2E4\uB9AC\uB294 \uC9C0\uCE68 \uC904\uC774\uAE30",
      problem: "\uC8FC \uC138\uC158\uC5D0 \uC2E4\uB9B0 \uC9C0\uCE68\uC774 \uAC00\uC6B4\uB370 \uAC12\uC73C\uB85C {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uB298 \uD544\uC694\uD558\uC9C0\uB294 \uC54A\uC740 \uC9C0\uCE68\uC740 .claude/rules/ \uC544\uB798\uC758 \uADDC\uCE59 \uD30C\uC77C\uB85C \uC62E\uAE30\uACE0 \uBA38\uB9AC\uB9D0\uC758 paths\uB85C \uD574\uB2F9 \uD30C\uC77C\uC744 \uB2E4\uB8F0 \uB54C \uC2E4\uB9AC\uAC8C \uD558\uC138\uC694. \uB9E4\uBC88 \uC2E4\uB9AC\uB294 CLAUDE.md\uC5D0\uC11C @\uB85C \uAC00\uC838\uC624\uB294 \uAC83\uB9CC\uC73C\uB85C\uB294 \uD544\uC694\uD560 \uB54C \uC2E4\uB9AC\uB294 \uADDC\uCE59\uC774 \uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      method: "\uC8FC \uC138\uC158\uC5D0 \uC2E4\uB9B0 \uC9C0\uCE68\uC758 \uC5B4\uB9BC \uD1A0\uD070 \uC218\uC758 \uAC00\uC6B4\uB370 \uAC12\uC785\uB2C8\uB2E4. ASCII \uAE00\uC790\uB294 4\uAE00\uC790\uB97C, \uD55C\uAE00 \uAC19\uC740 \uADF8 \uBC16\uC758 \uAE00\uC790\uB294 1\uAE00\uC790\uB97C 1\uD1A0\uD070\uC73C\uB85C \uC5B4\uB9BC\uD569\uB2C8\uB2E4. \uC9C0\uCE68 \uD06C\uAE30\uAC00 \uAE30\uB85D\uC5D0 \uB0A8\uC9C0 \uC54A\uC740 \uC138\uC158\uC740 \uD45C\uBCF8\uC5D0\uC11C \uBE8D\uB2C8\uB2E4.",
      evidence: "\uD45C\uBCF8\uC5D0 \uB123\uC740 \uC138\uC158 {sampledSessions} \xB7 \uC9C0\uCE68 \uD06C\uAE30\uAC00 \uAE30\uB85D\uC5D0 \uB0A8\uC9C0 \uC54A\uC740 \uC138\uC158 {skippedSessions}",
      unit: "\uD1A0\uD070(\uC5B4\uB9BC)",
      reasons: {
        no_data: {
          word: "\uD06C\uAE30\uAC00 \uAE30\uB85D\uB418\uC9C0 \uC54A\uC74C",
          text: "\uAE30\uB85D\uC5D0\uC11C \uC9C0\uCE68 \uD06C\uAE30\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC138\uC158\uC744 \uC2DC\uC791\uD560 \uB54C\uC758 \uC785\uB825 \uC815\uBCF4(\uC9C0\uCE68 \uD3EC\uD568)\uB97C \uAE30\uB85D\uC5D0 \uB0A8\uAE30\uC9C0 \uC54A\uB294 \uC2E4\uD589 \uBC29\uC2DD\uC774 \uC788\uC2B5\uB2C8\uB2E4."
        }
      }
    }
  },
  E5: {
    en: {
      name: "Unused skills",
      good: "Uses most of the skills whose use was judged",
      why: "Automatically invocable skills can add names and descriptions to the session skill list. Visibility settings and user-only invocation can change what is listed.",
      fix: "Turn off unused skills",
      problem: "{value} of the judged skills went unused.",
      prescription: 'Turn off a skill you do not use by setting its name to "off" under skillOverrides in your user settings (~/.claude/settings.json). Skills inside a plugin are managed with /plugin.',
      method: "Skills confirmed unused, divided by skills used plus skills confirmed unused. A skill is confirmed unused only when it has been installed for more than 14 days with no sign of use. Skills whose use cannot be told are left out.",
      evidence: "Turned on {enabled} \xB7 can be judged {judgeable} \xB7 judged {judged} (used {used}, unused {unused}) \xB7 cannot be judged by design {structural}",
      unit: "%",
      reasons: {
        too_little: { word: FEW.en, text: "Only {judgeable} {judgeable:skill is|skills are} eligible for use assessment, so the unused share was not calculated." },
        watching: WATCHING.en,
        unsupported: { text: "Whether these skills are used cannot be told from the records." },
        unreadable: { text: "A place where skills are found, a settings file, or the tool's usage counts could not be read." },
        not_applicable: { text: "No skill is turned on." },
        incomplete: { text: "The records of skill use could not all be read." }
      },
      repairUnmeasured: {
        too_little: "Only {judgeable} {judgeable:skill is|skills are} eligible for use assessment, so the unused share was not calculated. Found {candidates} that can be cleaned up.",
        watching: WATCHING_REPAIR.en
      }
    },
    ko: {
      name: "\uC548 \uC4F0\uB294 \uC2A4\uD0AC",
      good: "\uD310\uC815\uB41C \uC2A4\uD0AC \uAC00\uC6B4\uB370 \uB300\uBD80\uBD84\uC744 \uC4F0\uACE0 \uC788\uC74C",
      why: "\uC790\uB3D9\uC73C\uB85C \uBD80\uB97C \uC218 \uC788\uB294 \uC2A4\uD0AC\uC740 \uC138\uC158\uC758 \uC2A4\uD0AC \uBAA9\uB85D\uC5D0 \uC774\uB984\uACFC \uC124\uBA85\uC744 \uB354\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uD45C\uC2DC \uC124\uC815\uC774\uB098 \uC0AC\uC6A9\uC790\uB9CC \uBD80\uB974\uB294 \uC124\uC815\uC5D0 \uB530\uB77C \uBAA9\uB85D\uC5D0 \uC2E4\uB9AC\uB294 \uB0B4\uC6A9\uC740 \uB2EC\uB77C\uC9D1\uB2C8\uB2E4.",
      fix: "\uC548 \uC4F0\uB294 \uC2A4\uD0AC \uB044\uAE30",
      problem: "\uC4F0\uB294\uC9C0 \uD310\uC815\uB41C \uC2A4\uD0AC \uAC00\uC6B4\uB370 {value}\uB294 \uC4F0\uC9C0 \uC54A\uC740 \uAC83\uC73C\uB85C \uD655\uC778\uB410\uC2B5\uB2C8\uB2E4.",
      prescription: '\uC4F0\uC9C0 \uC54A\uB294 \uC2A4\uD0AC\uC740 \uC0AC\uC6A9\uC790 \uC124\uC815(~/.claude/settings.json)\uC758 skillOverrides\uC5D0\uC11C \uADF8 \uC774\uB984\uC744 "off"\uB85C \uC801\uC5B4 \uAEBC \uB450\uC138\uC694. \uD50C\uB7EC\uADF8\uC778\uC5D0 \uB4E0 \uC2A4\uD0AC\uC740 /plugin\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4.',
      method: "\uC548 \uC4F4 \uAC83\uC774 \uD655\uC778\uB41C \uC2A4\uD0AC\uC744, \uC4F4 \uC2A4\uD0AC\uACFC \uC548 \uC4F4 \uAC83\uC774 \uD655\uC778\uB41C \uC2A4\uD0AC\uC758 \uD569\uC73C\uB85C \uB098\uB208 \uAC12\uC785\uB2C8\uB2E4. \uAE50 \uC9C0 14\uC77C\uC774 \uB118\uC5C8\uB294\uB370 \uC4F4 \uD754\uC801\uC774 \uC5C6\uC5B4\uC57C \uC548 \uC4F4 \uAC83\uC774 \uD655\uC778\uB418\uACE0, \uC4F0\uB294\uC9C0 \uAC00\uB9B4 \uC218 \uC5C6\uB294 \uC2A4\uD0AC\uC740 \uBE8D\uB2C8\uB2E4.",
      evidence: "\uCF1C\uC838 \uC788\uC74C {enabled} \xB7 \uD310\uC815\uD560 \uC218 \uC788\uC74C {judgeable} \xB7 \uD310\uC815\uB428 {judged}(\uC500 {used}, \uC548 \uC500 {unused}) \xB7 \uAD6C\uC870\uC0C1 \uD310\uC815\uD560 \uC218 \uC5C6\uC74C {structural}",
      unit: "%",
      reasons: {
        too_little: { word: FEW.ko, text: "\uC4F0\uB294\uC9C0 \uAC00\uB9B4 \uC218 \uC788\uB294 \uC2A4\uD0AC\uC774 {judgeable}\uAC1C\uBFD0\uC774\uC5B4\uC11C \uC548 \uC4F0\uB294 \uBE44\uC728\uC740 \uB0B4\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." },
        watching: WATCHING.ko,
        unsupported: { text: "\uAE30\uB85D\uC73C\uB85C\uB294 \uC774 \uC2A4\uD0AC\uB4E4\uC744 \uC4F0\uB294\uC9C0 \uAC00\uB9B4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." },
        unreadable: { text: "\uC2A4\uD0AC\uC744 \uCC3E\uB294 \uACF3, \uC124\uC815 \uD30C\uC77C, \uB3C4\uAD6C\uC758 \uC0AC\uC6A9 \uC9D1\uACC4 \uAC00\uC6B4\uB370 \uC77D\uC9C0 \uBABB\uD55C \uAC83\uC774 \uC788\uC2B5\uB2C8\uB2E4." },
        not_applicable: { text: "\uCF1C\uC838 \uC788\uB294 \uC2A4\uD0AC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." },
        incomplete: { text: "\uC2A4\uD0AC \uC0AC\uC6A9 \uAE30\uB85D\uC744 \uBE60\uC9D0\uC5C6\uC774 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }
      },
      repairUnmeasured: {
        too_little: "\uC4F0\uB294\uC9C0 \uAC00\uB9B4 \uC218 \uC788\uB294 \uC2A4\uD0AC\uC774 {judgeable}\uAC1C\uBFD0\uC774\uC5B4\uC11C \uC548 \uC4F0\uB294 \uBE44\uC728\uC740 \uB0B4\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC815\uB9AC\uD560 \uC218 \uC788\uB294 \uAC83\uC740 {candidates}\uAC1C \uCC3E\uC558\uC2B5\uB2C8\uB2E4.",
        watching: WATCHING_REPAIR.ko
      }
    }
  },
  E6: {
    en: {
      name: "Unused MCP servers",
      good: "Calls most of the servers whose use was judged",
      why: "Enabled MCP servers can be connected to provide tools. Some connect at session start and others on first use.",
      fix: "Turn off unused MCP servers",
      problem: "{value} of the servers whose use was judged were confirmed uncalled.",
      prescription: 'Turn off a server you do not call in /mcp, or block it by adding { "serverName": "<name>" } to the deniedMcpServers list in your user settings (~/.claude/settings.json).',
      method: "Servers confirmed uncalled, divided by the sum of servers called and servers confirmed uncalled. Confirming non-use requires this tool to have watched the same definition for more than 14 days; a call in the scoring window can establish use on the first checkup. Servers whose definition is not on this PC, such as those connected through claude.ai, are left out.",
      evidence: "Turned on {enabled} \xB7 can be judged {judgeable} \xB7 judged {judged} (called {used}, uncalled {unused}) \xB7 cannot be judged by design {structural}",
      unit: "%",
      reasons: {
        too_little: { word: FEW.en, text: "Only {judgeable} MCP {judgeable:server is|servers are} eligible for use assessment, so the unused share was not calculated." },
        watching: WATCHING.en,
        unsupported: { text: "Whether these servers are called cannot be told from the records." },
        unreadable: { text: "A place where servers are defined or a settings file could not be read." },
        not_applicable: { text: "No MCP server is turned on." },
        incomplete: { text: "The records of MCP calls could not all be read." }
      },
      repairUnmeasured: {
        too_little: "Only {judgeable} MCP {judgeable:server is|servers are} eligible for use assessment, so the unused share was not calculated. Found {candidates} that can be cleaned up.",
        watching: WATCHING_REPAIR.en
      }
    },
    ko: {
      name: "\uC548 \uC4F0\uB294 MCP \uC11C\uBC84",
      good: "\uD310\uC815\uB41C \uC11C\uBC84 \uAC00\uC6B4\uB370 \uB300\uBD80\uBD84\uC744 \uBD80\uB974\uACE0 \uC788\uC74C",
      why: "\uCF1C \uB454 MCP \uC11C\uBC84\uB294 \uB3C4\uAD6C\uB97C \uC81C\uACF5\uD558\uAE30 \uC704\uD574 \uC5F0\uACB0\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC138\uC158\uC744 \uC2DC\uC791\uD560 \uB54C \uC5F0\uACB0\uB418\uB294 \uC11C\uBC84\uB3C4 \uC788\uACE0 \uCC98\uC74C \uBD80\uB97C \uB54C \uC5F0\uACB0\uB418\uB294 \uC11C\uBC84\uB3C4 \uC788\uC2B5\uB2C8\uB2E4.",
      fix: "\uC548 \uC4F0\uB294 MCP \uC11C\uBC84 \uB044\uAE30",
      problem: "\uBD80\uB974\uB294\uC9C0 \uD310\uC815\uB41C \uC11C\uBC84 \uAC00\uC6B4\uB370 {value}\uB294 \uBD80\uB974\uC9C0 \uC54A\uC740 \uAC83\uC73C\uB85C \uD655\uC778\uB410\uC2B5\uB2C8\uB2E4.",
      prescription: '\uBD80\uB974\uC9C0 \uC54A\uB294 \uC11C\uBC84\uB294 /mcp\uC5D0\uC11C \uB044\uAC70\uB098, \uC0AC\uC6A9\uC790 \uC124\uC815(~/.claude/settings.json)\uC758 deniedMcpServers \uBAA9\uB85D\uC5D0 { "serverName": "<\uC774\uB984>" }\uC744 \uB354\uD574 \uB9C9\uC73C\uC138\uC694.',
      method: "\uC548 \uBD80\uB978 \uAC83\uC774 \uD655\uC778\uB41C \uC11C\uBC84\uB97C, \uBD80\uB978 \uC11C\uBC84\uC640 \uC548 \uBD80\uB978 \uAC83\uC774 \uD655\uC778\uB41C \uC11C\uBC84\uC758 \uD569\uC73C\uB85C \uB098\uB208 \uAC12\uC785\uB2C8\uB2E4. \uC548 \uBD80\uB978 \uAC83\uC744 \uD655\uC778\uD558\uB824\uBA74 \uC774 \uB3C4\uAD6C\uAC00 \uAC19\uC740 \uC815\uC758\uC758 \uC11C\uBC84\uB97C 14\uC77C \uB118\uAC8C \uC9C0\uCF1C\uBD10\uC57C \uD558\uC9C0\uB9CC, \uC810\uC218 \uAD6C\uAC04\uC5D0 \uBD80\uB978 \uAE30\uB85D\uC774 \uC788\uC73C\uBA74 \uCCAB \uC810\uAC80\uC5D0\uC11C\uB3C4 \uBD80\uB978 \uAC83\uC73C\uB85C \uD310\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. claude.ai\uC5D0 \uC5F0\uACB0\uD55C \uC11C\uBC84\uCC98\uB7FC \uC815\uC758\uAC00 \uC774 PC\uC5D0 \uC5C6\uB294 \uC11C\uBC84\uB294 \uBE8D\uB2C8\uB2E4.",
      evidence: "\uCF1C\uC838 \uC788\uC74C {enabled} \xB7 \uD310\uC815\uD560 \uC218 \uC788\uC74C {judgeable} \xB7 \uD310\uC815\uB428 {judged}(\uBD80\uB984 {used}, \uC548 \uBD80\uB984 {unused}) \xB7 \uAD6C\uC870\uC0C1 \uD310\uC815\uD560 \uC218 \uC5C6\uC74C {structural}",
      unit: "%",
      reasons: {
        too_little: { word: FEW.ko, text: "\uC4F0\uB294\uC9C0 \uAC00\uB9B4 \uC218 \uC788\uB294 MCP \uC11C\uBC84\uAC00 {judgeable}\uAC1C\uBFD0\uC774\uC5B4\uC11C \uC548 \uC4F0\uB294 \uBE44\uC728\uC740 \uB0B4\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." },
        watching: WATCHING.ko,
        unsupported: { text: "\uAE30\uB85D\uC73C\uB85C\uB294 \uC774 \uC11C\uBC84\uB4E4\uC744 \uBD80\uB974\uB294\uC9C0 \uAC00\uB9B4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." },
        unreadable: { text: "\uC11C\uBC84\uB97C \uCC3E\uB294 \uACF3\uC774\uB098 \uC124\uC815 \uD30C\uC77C \uAC00\uC6B4\uB370 \uC77D\uC9C0 \uBABB\uD55C \uAC83\uC774 \uC788\uC2B5\uB2C8\uB2E4." },
        not_applicable: { text: "\uCF1C\uC838 \uC788\uB294 MCP \uC11C\uBC84\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." },
        incomplete: { text: "MCP \uD638\uCD9C \uAE30\uB85D\uC744 \uBE60\uC9D0\uC5C6\uC774 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }
      },
      repairUnmeasured: {
        too_little: "\uC4F0\uB294\uC9C0 \uAC00\uB9B4 \uC218 \uC788\uB294 MCP \uC11C\uBC84\uAC00 {judgeable}\uAC1C\uBFD0\uC774\uC5B4\uC11C \uC548 \uC4F0\uB294 \uBE44\uC728\uC740 \uB0B4\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC815\uB9AC\uD560 \uC218 \uC788\uB294 \uAC83\uC740 {candidates}\uAC1C \uCC3E\uC558\uC2B5\uB2C8\uB2E4.",
        watching: WATCHING_REPAIR.ko
      }
    }
  },
  E7: {
    en: {
      name: "Stopped work",
      good: "Work rarely stops midway",
      why: "A denied tool call, an interrupted turn, or a reply cut off by the length limit stops work that was underway, and it has to be picked up again.",
      fix: "Reduce stopped work",
      problem: "Recorded stops averaged {value}.",
      prescription: "If you often deny the same safe command, allow it with a rule in /permissions, such as Bash(npm run test *). If replies get cut off by the length limit, ask for smaller pieces of work.",
      method: "Denied tool calls, interrupted turns, and replies cut off by the length limit, divided by requests from you. Denials include those by you, by hooks, and by permission checks.",
      evidence: "Denied {denied} \xB7 interrupted turns {interruptedTurns} \xB7 cut off by length {lengthStops} \xB7 requests from you {humanRequests}",
      unit: "{value:stop|stops} per request",
      reasons: {
        no_data: { text: "There were no requests from you in the scoring window." },
        too_little: { text: "Fewer than 20 requests from you, so this was not measured." }
      }
    },
    ko: {
      name: "\uBA48\uCD98 \uC77C",
      good: "\uC77C\uC774 \uC911\uAC04\uC5D0 \uC798 \uBA48\uCD94\uC9C0 \uC54A\uC74C",
      why: "\uAC70\uC808\uD55C \uB3C4\uAD6C \uC2E4\uD589, \uB04A\uC740 \uD134, \uAE38\uC774 \uC81C\uD55C\uC73C\uB85C \uB04A\uAE34 \uC751\uB2F5\uC740 \uD558\uB358 \uC77C\uC744 \uBA48\uCD94\uAC8C \uD558\uACE0 \uB2E4\uC2DC \uC774\uC5B4 \uAC00\uC57C \uD569\uB2C8\uB2E4.",
      fix: "\uBA48\uCD94\uB294 \uC77C \uC904\uC774\uAE30",
      problem: "\uC77C\uC774 \uBA48\uCD98 \uD69F\uC218\uAC00 \uD3C9\uADE0 {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uAC19\uC740 \uC548\uC804\uD55C \uBA85\uB839\uC744 \uC790\uC8FC \uAC70\uC808\uD55C\uB2E4\uBA74 /permissions\uC5D0\uC11C Bash(npm run test *) \uAC19\uC740 \uD5C8\uC6A9 \uADDC\uCE59\uC73C\uB85C \uB354\uD558\uC138\uC694. \uC751\uB2F5\uC774 \uAE38\uC774 \uC81C\uD55C\uC73C\uB85C \uB04A\uAE30\uBA74 \uC77C\uC744 \uC791\uAC8C \uB098\uB220 \uB9E1\uAE30\uC138\uC694.",
      method: "\uAC70\uC808\uD55C \uB3C4\uAD6C \uC2E4\uD589, \uB04A\uC740 \uD134, \uAE38\uC774 \uC81C\uD55C\uC73C\uB85C \uB04A\uAE34 \uC751\uB2F5\uC744 \uB354\uD574 \uC0AC\uB78C \uC694\uCCAD \uC218\uB85C \uB098\uB208 \uAC12\uC785\uB2C8\uB2E4. \uAC70\uC808\uC5D0\uB294 \uC0AC\uB78C\uC774 \uAC70\uC808\uD55C \uAC83, \uD6C5\uC774 \uB9C9\uC740 \uAC83, \uAD8C\uD55C \uAC80\uC0AC\uAC00 \uB9C9\uC740 \uAC83\uC774 \uBAA8\uB450 \uB4ED\uB2C8\uB2E4.",
      evidence: "\uAC70\uC808 {denied} \xB7 \uB04A\uC740 \uD134 {interruptedTurns} \xB7 \uAE38\uC774 \uC81C\uD55C\uC73C\uB85C \uB04A\uAE40 {lengthStops} \xB7 \uC0AC\uB78C \uC694\uCCAD {humanRequests}",
      unit: "\uD68C/\uC694\uCCAD",
      reasons: {
        no_data: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC0AC\uB78C \uC694\uCCAD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." },
        too_little: { text: "\uC0AC\uB78C \uC694\uCCAD\uC774 20\uAC1C\uC5D0 \uBABB \uBBF8\uCCD0 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
      }
    }
  }
};

// src/core/copy/rules-fit.ts
var FIT_COPY = {
  F1: {
    en: {
      name: "Highest effort share",
      good: "Does not lean on the highest effort for everything",
      why: "This shows how often responses use xhigh or max. It does not judge task difficulty, so it carries a low weight.",
      fix: "Lower the everyday effort",
      problem: "{value} of responses with a known effort ran at the highest levels (xhigh, max).",
      prescription: "Set a lower everyday effort with /effort and raise it only for hard tasks.",
      method: "Share of responses with a known effort level that ran at xhigh or max. Responses with no effort recorded and unknown levels are left out.",
      evidence: "Highest effort {highEffort} \xB7 known effort {knownEffort} \xB7 effort not recorded {unknownEffort} \xB7 unknown level {unknownLevel}",
      unit: "%",
      reasons: {
        no_data: { text: "No response had a recognized effort level." },
        too_little: { text: "Fewer than 50 responses with a known effort, so this was not measured." }
      }
    },
    ko: {
      name: "\uAC00\uC7A5 \uB192\uC740 \uCD94\uB860 \uAC15\uB3C4\uC758 \uBAAB",
      good: "\uAC00\uC7A5 \uB192\uC740 \uCD94\uB860 \uAC15\uB3C4\uC5D0 \uC3E0\uB9AC\uC9C0 \uC54A\uC74C",
      why: "\uC751\uB2F5\uC5D0\uC11C xhigh\uB098 max\uB97C \uC5BC\uB9C8\uB098 \uC790\uC8FC \uC37C\uB294\uC9C0 \uBD05\uB2C8\uB2E4. \uC774 \uADDC\uCE59\uC740 \uC77C\uC774 \uC5BC\uB9C8\uB098 \uC5B4\uB824\uC6E0\uB294\uC9C0 \uBAA8\uB974\uBBC0\uB85C \uBB34\uAC8C\uB97C \uB0AE\uAC8C \uB461\uB2C8\uB2E4.",
      fix: "\uD3C9\uC18C \uCD94\uB860 \uAC15\uB3C4 \uB0AE\uCD94\uAE30",
      problem: "\uAC15\uB3C4\uB97C \uC544\uB294 \uC751\uB2F5 \uAC00\uC6B4\uB370 {value}\uAC00 \uAC00\uC7A5 \uB192\uC740 \uAC15\uB3C4(xhigh, max)\uB85C \uB3CC\uC558\uC2B5\uB2C8\uB2E4.",
      prescription: "/effort\uB85C \uD3C9\uC18C \uAC15\uB3C4\uB97C \uB0AE\uCD94\uACE0 \uC5B4\uB824\uC6B4 \uC77C\uC5D0\uC11C\uB9CC \uB192\uC774\uC138\uC694.",
      method: "\uAC15\uB3C4\uB97C \uC544\uB294 \uC751\uB2F5 \uAC00\uC6B4\uB370 xhigh\uB098 max\uB85C \uB3C8 \uBAAB\uC785\uB2C8\uB2E4. \uAC15\uB3C4\uAC00 \uAE30\uB85D\uB418\uC9C0 \uC54A\uC740 \uC751\uB2F5\uACFC \uBAA8\uB974\uB294 \uB2E8\uACC4\uB294 \uBE8D\uB2C8\uB2E4.",
      evidence: "\uAC00\uC7A5 \uB192\uC740 \uAC15\uB3C4 {highEffort} \xB7 \uAC15\uB3C4\uB97C \uC54E {knownEffort} \xB7 \uAC15\uB3C4\uAC00 \uAE30\uB85D\uB418\uC9C0 \uC54A\uC74C {unknownEffort} \xB7 \uBAA8\uB974\uB294 \uB2E8\uACC4 {unknownLevel}",
      unit: "%",
      reasons: {
        no_data: { text: "\uC54C\uC544\uBCFC \uC218 \uC788\uB294 \uCD94\uB860 \uAC15\uB3C4\uAC00 \uAE30\uB85D\uB41C \uC751\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." },
        too_little: { text: "\uAC15\uB3C4\uB97C \uC544\uB294 \uC751\uB2F5\uC774 50\uAC1C\uC5D0 \uBABB \uBBF8\uCCD0 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  F2: {
    en: {
      name: "Delegating long work",
      good: "Hands parts of long work to subagents",
      why: "A subagent works in a separate context window and returns its results. This rule checks whether main sessions with automatic compaction used subagents.",
      fix: "Hand parts of long work to subagents",
      problem: "Subagents were used in {value} of the sessions that were compacted automatically.",
      prescription: "In long sessions, ask Claude to give searches and large file reads to a subagent. You can also write your own subagents as Markdown files in .claude/agents/ or ~/.claude/agents/.",
      method: "Share of main sessions with an automatic compaction that also used a subagent.",
      evidence: "Sessions that used a subagent {delegatedSessions} \xB7 sessions with automatic compaction {compactedSessions}",
      unit: "%",
      reasons: {
        no_data: { text: "No main session was compacted automatically." },
        too_little: { text: "Fewer than 3 main sessions were compacted automatically, so this was not measured." }
      }
    },
    ko: {
      name: "\uAE34 \uC77C \uB098\uB220 \uB9E1\uAE30\uAE30",
      good: "\uAE34 \uC77C\uC744 \uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uC5D0 \uB098\uB220 \uB9E1\uAE40",
      why: "\uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uB294 \uBCC4\uB3C4 \uB300\uD654 \uCC3D\uC5D0\uC11C \uC77C\uD558\uACE0 \uACB0\uACFC\uB97C \uB3CC\uB824\uC90D\uB2C8\uB2E4. \uC774 \uD56D\uBAA9\uC740 \uC790\uB3D9 \uC555\uCD95\uC774 \uC788\uC5C8\uB358 \uC8FC \uC138\uC158\uC5D0\uC11C \uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uB97C \uC37C\uB294\uC9C0 \uBD05\uB2C8\uB2E4.",
      fix: "\uAE34 \uC77C\uC744 \uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uC5D0 \uB098\uB220 \uB9E1\uAE30\uAE30",
      problem: "\uC790\uB3D9 \uC555\uCD95\uC774 \uC788\uC5C8\uB358 \uC138\uC158 \uAC00\uC6B4\uB370 \uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uB97C \uC4F4 \uC138\uC158\uC740 {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uAE34 \uC138\uC158\uC5D0\uC11C\uB294 \uC870\uC0AC\uB098 \uD070 \uD30C\uC77C \uC77D\uAE30\uB97C \uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uC5D0 \uB9E1\uACA8 \uB2EC\uB77C\uACE0 \uD558\uC138\uC694. \uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uB294 .claude/agents/\uB098 ~/.claude/agents/\uC5D0 \uB9C8\uD06C\uB2E4\uC6B4 \uD30C\uC77C\uB85C \uC9C1\uC811 \uB9CC\uB4E4 \uC218\uB3C4 \uC788\uC2B5\uB2C8\uB2E4.",
      method: "\uC790\uB3D9 \uC555\uCD95\uC774 \uC788\uC5C8\uB358 \uC8FC \uC138\uC158 \uAC00\uC6B4\uB370 \uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uB97C \uC4F4 \uC138\uC158\uC758 \uBAAB\uC785\uB2C8\uB2E4.",
      evidence: "\uD558\uC704 \uC5D0\uC774\uC804\uD2B8\uB97C \uC4F4 \uC138\uC158 {delegatedSessions} \xB7 \uC790\uB3D9 \uC555\uCD95\uC774 \uC788\uC5C8\uB358 \uC138\uC158 {compactedSessions}",
      unit: "%",
      reasons: {
        no_data: { text: "\uC790\uB3D9 \uC555\uCD95\uC774 \uC788\uC5C8\uB358 \uC8FC \uC138\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." },
        too_little: { text: "\uC790\uB3D9 \uC555\uCD95\uC774 \uC788\uC5C8\uB358 \uC8FC \uC138\uC158\uC774 3\uAC1C\uC5D0 \uBABB \uBBF8\uCCD0 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  F3: {
    en: {
      name: "Project instructions",
      good: "Projects you use often have their own instructions",
      why: "Project instructions give the tool a reference for how a project is built and run. This rule checks whether often-used projects have those instructions.",
      fix: "Add instructions to projects you use often",
      problem: "{value} of the projects you use often have project instructions.",
      prescription: "In a project you use often, run /init to create a CLAUDE.md, then keep only what that project needs.",
      method: "Among target projects with 3 or more main sessions in the scoring window, the share that have project instructions for each tool mainly used there. Targets are folders on this PC that are Git repositories or have project instructions or settings. Folders not treated as projects, such as the home folder, are left out.",
      evidence: "Projects with instructions {withInstructions} \xB7 projects used often {targets}",
      unit: "%",
      reasons: { not_applicable: { text: "No target project had 3 or more main sessions in the scoring window. Folders that are gone or not treated as projects are not targets." } }
    },
    ko: {
      name: "\uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68",
      good: "\uC790\uC8FC \uC4F0\uB294 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC9C0\uCE68\uC744 \uB460",
      why: "\uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\uC740 \uD504\uB85C\uC81D\uD2B8\uB97C \uC5B4\uB5BB\uAC8C \uBE4C\uB4DC\uD558\uACE0 \uC2E4\uD589\uD558\uB294\uC9C0 \uCC38\uACE0\uD560 \uB0B4\uC6A9\uC744 \uC90D\uB2C8\uB2E4. \uC774 \uD56D\uBAA9\uC740 \uC790\uC8FC \uC4F0\uB294 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uADF8\uB7F0 \uC9C0\uCE68\uC774 \uC788\uB294\uC9C0 \uBD05\uB2C8\uB2E4.",
      fix: "\uC790\uC8FC \uC4F0\uB294 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC9C0\uCE68 \uB450\uAE30",
      problem: "\uC790\uC8FC \uC4F0\uB294 \uD504\uB85C\uC81D\uD2B8 \uAC00\uC6B4\uB370 \uC9C0\uCE68\uC774 \uC788\uB294 \uD504\uB85C\uC81D\uD2B8\uB294 {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uC790\uC8FC \uC4F0\uB294 \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C /init\uC73C\uB85C CLAUDE.md\uB97C \uB9CC\uB4E4\uACE0 \uADF8 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uD544\uC694\uD55C \uAC83\uB9CC \uB0A8\uAE30\uC138\uC694.",
      method: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC8FC \uC138\uC158\uC774 3\uAC1C \uC774\uC0C1\uC778 \uB300\uC0C1 \uD504\uB85C\uC81D\uD2B8 \uAC00\uC6B4\uB370, \uAC70\uAE30\uC11C \uC8FC\uB85C \uC4F4 \uB3C4\uAD6C\uB9C8\uB2E4 \uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\uC774 \uC788\uB294 \uD504\uB85C\uC81D\uD2B8\uC758 \uBAAB\uC785\uB2C8\uB2E4. \uB300\uC0C1\uC740 \uC9C0\uAE08 \uC774 PC\uC5D0 \uC788\uACE0 \uAE43 \uC800\uC7A5\uC18C\uC774\uAC70\uB098 \uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\xB7\uC124\uC815\uC774 \uC788\uB294 \uD3F4\uB354\uC785\uB2C8\uB2E4. \uD648 \uD3F4\uB354\uCC98\uB7FC \uD504\uB85C\uC81D\uD2B8\uB85C \uBCF4\uC9C0 \uC54A\uB294 \uD3F4\uB354\uB294 \uBE8D\uB2C8\uB2E4.",
      evidence: "\uC9C0\uCE68\uC774 \uC788\uB294 \uD504\uB85C\uC81D\uD2B8 {withInstructions} \xB7 \uC790\uC8FC \uC4F0\uB294 \uD504\uB85C\uC81D\uD2B8 {targets}",
      unit: "%",
      reasons: { not_applicable: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC8FC \uC138\uC158\uC774 3\uAC1C \uC774\uC0C1\uC778 \uB300\uC0C1 \uD504\uB85C\uC81D\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC791\uC5C5 \uD3F4\uB354\uAC00 \uC9C0\uAE08 \uC5C6\uAC70\uB098 \uD504\uB85C\uC81D\uD2B8\uB85C \uBCF4\uC9C0 \uC54A\uB294 \uD3F4\uB354\uB294 \uB300\uC0C1\uC5D0\uC11C \uBE8D\uB2C8\uB2E4." } }
    }
  },
  F4: {
    en: {
      name: "Instruction overlap",
      good: "Keeps overlap between global and project instructions low",
      why: "A line that is in both global and project instructions loads twice in that project and has to be kept the same in two places.",
      fix: "Remove repeated instruction lines",
      problem: "In the project with the most overlap, {value} of global instruction lines appear again in its instructions.",
      prescription: "Keep each line in one place. Rules for everywhere go in global instructions, and rules only one project needs go in that project.",
      method: "Share of distinct global instruction lines, at least 20 characters after trimming, that appear word for word in a project's instructions. The project with the highest share is used.",
      evidence: "Repeated lines {overlappingLines} \xB7 global lines {globalLines} \xB7 projects compared {comparedProjects}",
      unit: "%",
      reasons: {
        not_applicable: { text: "There are no global instruction lines or separate project instructions to compare." },
        unreadable: { text: "An instruction file to compare could not be read." }
      }
    },
    ko: {
      name: "\uC9C0\uCE68 \uACB9\uCE68",
      good: "\uC804\uC5ED \uC9C0\uCE68\uACFC \uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\uC758 \uACB9\uCE68\uC774 \uC801\uC74C",
      why: "\uC804\uC5ED \uC9C0\uCE68\uACFC \uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\uC5D0 \uAC19\uC740 \uC904\uC774 \uC788\uC73C\uBA74 \uADF8 \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C \uB450 \uBC88 \uC2E4\uB9AC\uACE0, \uACE0\uCE60 \uB54C\uB3C4 \uB450 \uACF3\uC744 \uB9DE\uCDB0\uC57C \uD569\uB2C8\uB2E4.",
      fix: "\uACB9\uCE58\uB294 \uC9C0\uCE68 \uC904 \uC815\uB9AC\uD558\uAE30",
      problem: "\uAC00\uC7A5 \uB9CE\uC774 \uACB9\uCE58\uB294 \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C \uC804\uC5ED \uC9C0\uCE68 \uC904\uC758 {value}\uAC00 \uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\uC5D0 \uB2E4\uC2DC \uB098\uC635\uB2C8\uB2E4.",
      prescription: "\uD55C \uC904\uC740 \uD55C \uACF3\uC5D0\uB9CC \uB450\uC138\uC694. \uC5B4\uB514\uC11C\uB098 \uD1B5\uD558\uB294 \uADDC\uCE59\uC740 \uC804\uC5ED \uC9C0\uCE68\uC5D0, \uADF8 \uD504\uB85C\uC81D\uD2B8\uC5D0\uB9CC \uD544\uC694\uD55C \uADDC\uCE59\uC740 \uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\uC5D0 \uB461\uB2C8\uB2E4.",
      method: "\uC55E\uB4A4 \uACF5\uBC31\uC744 \uB5BC\uACE0 20\uC790 \uC774\uC0C1\uC778 \uC11C\uB85C \uB2E4\uB978 \uC804\uC5ED \uC9C0\uCE68 \uC904 \uAC00\uC6B4\uB370 \uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\uC5D0 \uAE00\uC790 \uADF8\uB300\uB85C \uB2E4\uC2DC \uB098\uC624\uB294 \uBAAB\uC785\uB2C8\uB2E4. \uBAAB\uC774 \uAC00\uC7A5 \uD070 \uD504\uB85C\uC81D\uD2B8\uC758 \uAC12\uC744 \uC501\uB2C8\uB2E4.",
      evidence: "\uACB9\uCE58\uB294 \uC904 {overlappingLines} \xB7 \uC804\uC5ED \uC9C0\uCE68 \uC904 {globalLines} \xB7 \uACAC\uC900 \uD504\uB85C\uC81D\uD2B8 {comparedProjects}",
      unit: "%",
      reasons: {
        not_applicable: { text: "\uACAC\uC904 \uC804\uC5ED \uC9C0\uCE68 \uC904\uC774\uB098 \uBCC4\uB3C4\uC758 \uD504\uB85C\uC81D\uD2B8 \uC9C0\uCE68\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." },
        unreadable: { text: "\uACAC\uC8FC\uB294 \uC9C0\uCE68 \uD30C\uC77C \uAC00\uC6B4\uB370 \uC77D\uC9C0 \uBABB\uD55C \uAC83\uC774 \uC788\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  F5: {
    en: {
      name: "Duplicate skills",
      good: "Limits extra copies of skills sharing a name",
      why: "Copies of a skill can drift apart across folders, making it harder to track which copy is loaded.",
      fix: "Keep one copy of each skill",
      problem: "Extra copies score {value} on average.",
      prescription: "Keep one original and remove the other copies or replace them with links to the original. Before removing a copy, check that no project sees only that copy. If you use both Claude Code and Codex, one original can be linked from both tools' folders.",
      method: "Within one tool, each extra copy of a skill name scores 1 point if all copies are identical and 2 points if any differ or cannot be compared, divided by the number of skill names. Links and copies placed by plugins are not counted.",
      evidence: "Extra identical copies {identicalCopies} \xB7 extra differing copies {differingCopies} \xB7 skill names {skillKinds}",
      unit: "{value:point|points} per skill",
      reasons: {
        not_applicable: { text: "There are no user or project skills to compare for copies. Skills inside plugins are not counted." },
        unreadable: { text: "A skill folder searched for copies could not be listed." }
      }
    },
    ko: {
      name: "\uAC19\uC740 \uC774\uB984\uC758 \uC2A4\uD0AC \uC0AC\uBCF8",
      good: "\uAC19\uC740 \uC774\uB984\uC758 \uC2A4\uD0AC \uC0AC\uBCF8\uC744 \uC801\uAC8C \uB460",
      why: "\uC2A4\uD0AC\uC744 \uC5EC\uB7EC \uD3F4\uB354\uC5D0 \uBCF5\uC0AC\uD574 \uB450\uBA74 \uB0B4\uC6A9\uC774 \uB2EC\uB77C\uC9C8 \uC218 \uC788\uACE0 \uC5B4\uB290 \uC0AC\uBCF8\uC774 \uC2E4\uB9AC\uB294\uC9C0 \uD30C\uC545\uD558\uAE30 \uC5B4\uB824\uC6B8 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      fix: "\uC2A4\uD0AC \uC0AC\uBCF8\uC744 \uD558\uB098\uB85C \uC815\uB9AC\uD558\uAE30",
      problem: "\uB0A8\uB294 \uC0AC\uBCF8\uC758 \uC810\uC218\uAC00 \uD3C9\uADE0 {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uC6D0\uBCF8 \uD558\uB098\uB9CC \uB0A8\uAE30\uACE0 \uB098\uBA38\uC9C0 \uC0AC\uBCF8\uC740 \uC9C0\uC6B0\uAC70\uB098 \uC6D0\uBCF8\uC744 \uAC00\uB9AC\uD0A4\uB294 \uB9C1\uD06C\uB85C \uBC14\uAFB8\uC138\uC694. \uC0AC\uBCF8\uC744 \uCE58\uC6B0\uAE30 \uC804\uC5D0 \uADF8 \uC0AC\uBCF8\uB9CC \uBCF4\uC774\uB294 \uD504\uB85C\uC81D\uD2B8\uAC00 \uC5C6\uB294\uC9C0 \uBCF4\uC138\uC694. Claude Code\uC640 Codex\uB97C \uD568\uAED8 \uC4F0\uBA74 \uC6D0\uBCF8 \uD558\uB098\uB97C \uB450 \uB3C4\uAD6C\uC758 \uD3F4\uB354\uC5D0\uC11C \uB9C1\uD06C\uB85C \uAC78 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      method: "\uAC19\uC740 \uB3C4\uAD6C \uC548\uC5D0\uC11C \uD55C \uC774\uB984\uC758 \uB0A8\uB294 \uC0AC\uBCF8\uB9C8\uB2E4, \uC0AC\uBCF8\uC774 \uBAA8\uB450 \uAC19\uC73C\uBA74 1\uC810, \uD558\uB098\uB77C\uB3C4 \uB2E4\uB974\uAC70\uB098 \uB0B4\uC6A9\uC744 \uACAC\uC904 \uC218 \uC5C6\uC73C\uBA74 2\uC810\uC73C\uB85C \uCCD0\uC11C \uC2A4\uD0AC \uC885 \uC218\uB85C \uB098\uB208 \uAC12\uC785\uB2C8\uB2E4. \uB9C1\uD06C\uC640 \uD50C\uB7EC\uADF8\uC778\uC774 \uB123\uC740 \uC0AC\uBCF8\uC740 \uC138\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      evidence: "\uAC19\uC740 \uC0AC\uBCF8 {identicalCopies} \xB7 \uB0B4\uC6A9\uC774 \uB2E4\uB978 \uC0AC\uBCF8 {differingCopies} \xB7 \uC2A4\uD0AC \uC885 \uC218 {skillKinds}",
      unit: "\uC810/\uC2A4\uD0AC",
      reasons: {
        not_applicable: { text: "\uC0AC\uBCF8\uC744 \uACAC\uC904 \uC0AC\uC6A9\uC790\xB7\uD504\uB85C\uC81D\uD2B8 \uC2A4\uD0AC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uD50C\uB7EC\uADF8\uC778\uC5D0 \uB4E0 \uC2A4\uD0AC\uC740 \uC138\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." },
        unreadable: { text: "\uC0AC\uBCF8\uC744 \uCC3E\uB294 \uC2A4\uD0AC \uD3F4\uB354 \uAC00\uC6B4\uB370 \uBAA9\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD55C \uAC83\uC774 \uC788\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  F6: {
    en: {
      name: "Settings conflicts",
      good: "Global and project settings do not contradict each other",
      why: "When the same permission rule is allowed on one side and denied on the other, the deny wins. The allow then has no effect, which may not be what you meant.",
      fix: "Resolve conflicting permission rules",
      problem: "Found {value} of conflicting rules.",
      prescription: "Look at each rule that is allowed in one place and denied in another, and keep it on one side only. /permissions shows the rules by scope.",
      method: "Number of pairs where the same rule text is allowed on one side and denied on the other, between your user settings and each project's project and local settings. Managed policy is not compared.",
      evidence: "Conflicting pairs {conflicts} \xB7 projects with settings {projectsWithSettings}",
      unit: "{value:pair|pairs}",
      reasons: {
        not_applicable: { text: "No listed project has project or local settings." },
        unreadable: { text: "A settings file to compare could not be read." }
      }
    },
    ko: {
      name: "\uC124\uC815 \uCDA9\uB3CC",
      good: "\uC804\uC5ED \uC124\uC815\uACFC \uD504\uB85C\uC81D\uD2B8 \uC124\uC815\uC774 \uBD80\uB52A\uD788\uC9C0 \uC54A\uC74C",
      why: "\uAC19\uC740 \uAD8C\uD55C \uADDC\uCE59\uC774 \uD55C\uCABD\uC5D0\uC11C\uB294 \uD5C8\uC6A9, \uB2E4\uB978 \uCABD\uC5D0\uC11C\uB294 \uAE08\uC9C0\uB418\uC5B4 \uC788\uC73C\uBA74 \uAE08\uC9C0\uAC00 \uC774\uAE41\uB2C8\uB2E4. \uD5C8\uC6A9\uD574 \uB454 \uCABD\uC740 \uB4E3\uC9C0 \uC54A\uC73C\uBBC0\uB85C \uB73B\uACFC \uB2E4\uB974\uAC8C \uB3D9\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      fix: "\uBD80\uB52A\uD788\uB294 \uAD8C\uD55C \uADDC\uCE59 \uC815\uB9AC\uD558\uAE30",
      problem: "\uBD80\uB52A\uD788\uB294 \uADDC\uCE59\uC774 {value} \uC788\uC2B5\uB2C8\uB2E4.",
      prescription: "\uD55C\uCABD\uC5D0\uC11C \uD5C8\uC6A9\uD558\uACE0 \uB2E4\uB978 \uCABD\uC5D0\uC11C \uAE08\uC9C0\uD55C \uADDC\uCE59\uC744 \uBCF4\uACE0 \uD55C\uCABD\uC5D0\uB9CC \uB0A8\uAE30\uC138\uC694. /permissions\uC5D0\uC11C \uBC94\uC704\uBCC4\uB85C \uADDC\uCE59\uC744 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      method: "\uC0AC\uC6A9\uC790 \uC124\uC815\uACFC \uAC01 \uD504\uB85C\uC81D\uD2B8\uC758 \uD504\uB85C\uC81D\uD2B8 \uC124\uC815\xB7\uB85C\uCEEC \uC124\uC815 \uC0AC\uC774\uC5D0\uC11C, \uAC19\uC740 \uADDC\uCE59 \uBB38\uC790\uC5F4\uC744 \uD55C\uCABD\uC740 \uD5C8\uC6A9\uC5D0 \uB2E4\uB978 \uCABD\uC740 \uAE08\uC9C0\uC5D0 \uB454 \uC30D\uC758 \uC218\uC785\uB2C8\uB2E4. \uAD00\uB9AC \uC815\uCC45\uC740 \uACAC\uC8FC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      evidence: "\uBD80\uB52A\uD788\uB294 \uC30D {conflicts} \xB7 \uC124\uC815\uC774 \uC788\uB294 \uD504\uB85C\uC81D\uD2B8 {projectsWithSettings}",
      unit: "\uC30D",
      reasons: {
        not_applicable: { text: "\uBAA9\uB85D\uC758 \uD504\uB85C\uC81D\uD2B8 \uC5B4\uB514\uC5D0\uB3C4 \uD504\uB85C\uC81D\uD2B8 \uC124\uC815\uC774\uB098 \uB85C\uCEEC \uC124\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." },
        unreadable: { text: "\uACAC\uC8FC\uB294 \uC124\uC815 \uD30C\uC77C \uAC00\uC6B4\uB370 \uC77D\uC9C0 \uBABB\uD55C \uAC83\uC774 \uC788\uC2B5\uB2C8\uB2E4." }
      }
    }
  }
};

// src/core/copy/rules-intensity.ts
var INTENSITY_COPY = {
  I1: {
    en: {
      name: "Days used",
      good: "Uses the tools regularly",
      why: "This counts days with a response from any tool in the 30-day scoring window. It gives context for reading the other measurements.",
      fix: "Use the tools on more days",
      problem: "Tools were used on {value} in the last 30 days.",
      prescription: "Try handing everyday tasks to the tools too, such as reading logs, drafting messages, or tidying files.",
      method: "Days in the 30-day scoring window on which any tool had a response.",
      evidence: "Days with responses {activeDays}",
      unit: "{value:day|days}"
    },
    ko: {
      name: "\uC0AC\uC6A9\uD55C \uB0A0",
      good: "\uAFB8\uC900\uD788 \uC500",
      why: "\uC810\uC218 \uAD6C\uAC04 30\uC77C \uAC00\uC6B4\uB370 \uC5B4\uB290 \uB3C4\uAD6C\uC5D0\uC11C\uB4E0 \uC751\uB2F5\uC774 \uC788\uC5C8\uB358 \uB0A0\uC744 \uC149\uB2C8\uB2E4. \uB2E4\uB978 \uCE21\uC815\uAC12\uC744 \uD574\uC11D\uD560 \uB54C \uD568\uAED8 \uBCFC \uC815\uBCF4\uC785\uB2C8\uB2E4.",
      fix: "\uC4F0\uB294 \uB0A0 \uB298\uB9AC\uAE30",
      problem: "\uCD5C\uADFC 30\uC77C \uAC00\uC6B4\uB370 \uC4F4 \uB0A0\uC774 {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uAE30\uB85D \uC77D\uAE30, \uAE00 \uCD08\uC548, \uD30C\uC77C \uC815\uB9AC\uCC98\uB7FC \uB0A0\uB9C8\uB2E4 \uD558\uB294 \uC77C\uB3C4 \uB9E1\uACA8 \uBCF4\uC138\uC694.",
      method: "\uC810\uC218 \uAD6C\uAC04 30\uC77C \uAC00\uC6B4\uB370 \uC5B4\uB290 \uB3C4\uAD6C\uC5D0\uC11C\uB4E0 \uC751\uB2F5\uC774 \uC788\uC5C8\uB358 \uB0A0\uC758 \uC218\uC785\uB2C8\uB2E4.",
      evidence: "\uC751\uB2F5\uC774 \uC788\uC5C8\uB358 \uB0A0 {activeDays}",
      unit: "\uC77C"
    }
  },
  I2: {
    en: {
      name: "Requests per day",
      good: "Hands over plenty of work each day",
      why: "This is the average number of requests on days when you used the tools. It shows how often you handed work to them on those days.",
      fix: "Hand over more work on the days you use them",
      problem: "You sent {value} on average.",
      prescription: 'Break your work into pieces you can hand over, such as "write a test for this function" or "summarize this log".',
      method: "Requests from you across all tools, divided by days used.",
      evidence: "Requests from you {humanRequests} \xB7 days used {activeDays}",
      unit: "{value:request|requests} per day",
      reasons: { no_data: { text: "There were no days of use in the scoring window." } }
    },
    ko: {
      name: "\uD558\uB8E8\uC5D0 \uC2DC\uD0A4\uB294 \uC591",
      good: "\uD558\uB8E8\uC5D0 \uB9CE\uC740 \uC77C\uC744 \uB9E1\uAE40",
      why: "\uC4F4 \uB0A0 \uD558\uB8E8\uC5D0 \uBCF4\uB0B8 \uD3C9\uADE0 \uC694\uCCAD \uC218\uC785\uB2C8\uB2E4. \uB3C4\uAD6C\uB97C \uC4F4 \uB0A0\uC5D0 \uC5BC\uB9C8\uB098 \uC790\uC8FC \uC77C\uC744 \uB9E1\uACBC\uB294\uC9C0 \uBCF4\uC5EC \uC90D\uB2C8\uB2E4.",
      fix: "\uC4F0\uB294 \uB0A0 \uB354 \uB9CE\uC740 \uC77C \uB9E1\uAE30\uAE30",
      problem: "\uC4F4 \uB0A0 \uD558\uB8E8\uC5D0 \uBCF4\uB0B8 \uC694\uCCAD\uC774 \uD3C9\uADE0 {value}\uC785\uB2C8\uB2E4.",
      prescription: '"\uC774 \uD568\uC218\uC758 \uC2DC\uD5D8\uC744 \uC368 \uC918", "\uC774 \uAE30\uB85D\uC744 \uC694\uC57D\uD574 \uC918"\uCC98\uB7FC \uB9E1\uAE38 \uC218 \uC788\uB294 \uB2E8\uC704\uB85C \uC77C\uC744 \uB098\uB220 \uBCF4\uC138\uC694.',
      method: "\uBAA8\uB4E0 \uB3C4\uAD6C\uC758 \uC0AC\uB78C \uC694\uCCAD \uC218\uB97C \uC0AC\uC6A9\uD55C \uB0A0\uB85C \uB098\uB208 \uAC12\uC785\uB2C8\uB2E4.",
      evidence: "\uC0AC\uB78C \uC694\uCCAD {humanRequests} \xB7 \uC0AC\uC6A9\uD55C \uB0A0 {activeDays}",
      unit: "\uAC1C/\uC77C",
      reasons: { no_data: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC4F4 \uB0A0\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." } }
    }
  },
  I3: {
    en: {
      name: "Depth per request",
      good: "Lets each request run several steps",
      why: "Tool calls per request show how much one request carries, such as reading, editing, and testing in one go.",
      fix: "Hand over whole tasks",
      problem: "Tool calls averaged {value}.",
      prescription: 'Instead of asking for one small step at a time, describe the whole task and how to check it, such as "fix this bug and run the tests".',
      method: "Tool calls across all tools, divided by requests from you.",
      evidence: "Tool calls {toolCalls} \xB7 requests from you {humanRequests}",
      unit: "{value:call|calls} per request",
      reasons: {
        no_data: { text: "There were no requests from you in the scoring window." },
        too_little: { text: "Fewer than 20 requests from you, so this was not measured." }
      }
    },
    ko: {
      name: "\uD55C \uBC88\uC5D0 \uB9E1\uAE30\uB294 \uAE4A\uC774",
      good: "\uD55C \uBC88\uC5D0 \uC5EC\uB7EC \uB2E8\uACC4\uB97C \uB9E1\uAE40",
      why: "\uC694\uCCAD \uD558\uB098\uC5D0 \uB3C4\uAD6C \uD638\uCD9C\uC774 \uBA87 \uBC88 \uC788\uC5C8\uB294\uC9C0\uB85C, \uC77D\uACE0 \uACE0\uCE58\uACE0 \uC2DC\uD5D8\uD558\uB294 \uC77C\uC744 \uD55C \uBC88\uC5D0 \uC5BC\uB9C8\uB098 \uB9E1\uAE30\uB294\uC9C0 \uBD05\uB2C8\uB2E4.",
      fix: "\uC77C\uC744 \uD1B5\uC9F8\uB85C \uB9E1\uAE30\uAE30",
      problem: "\uC694\uCCAD \uD558\uB098\uC5D0 \uB3C4\uAD6C \uD638\uCD9C\uC774 \uD3C9\uADE0 {value}\uC785\uB2C8\uB2E4.",
      prescription: '\uC791\uC740 \uB2E8\uACC4\uB97C \uD558\uB098\uC529 \uC2DC\uD0A4\uAE30\uBCF4\uB2E4 "\uC774 \uBC84\uADF8\uB97C \uACE0\uCE58\uACE0 \uC2DC\uD5D8\uC744 \uB3CC\uB824 \uC918"\uCC98\uB7FC \uD560 \uC77C\uACFC \uD655\uC778 \uBC29\uBC95\uC744 \uD55C \uBC88\uC5D0 \uC54C\uB824 \uC8FC\uC138\uC694.',
      method: "\uBAA8\uB4E0 \uB3C4\uAD6C\uC758 \uB3C4\uAD6C \uD638\uCD9C \uC218\uB97C \uC0AC\uB78C \uC694\uCCAD \uC218\uB85C \uB098\uB208 \uAC12\uC785\uB2C8\uB2E4.",
      evidence: "\uB3C4\uAD6C \uD638\uCD9C {toolCalls} \xB7 \uC0AC\uB78C \uC694\uCCAD {humanRequests}",
      unit: "\uD68C/\uC694\uCCAD",
      reasons: {
        no_data: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC0AC\uB78C \uC694\uCCAD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." },
        too_little: { text: "\uC0AC\uB78C \uC694\uCCAD\uC774 20\uAC1C\uC5D0 \uBABB \uBBF8\uCCD0 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  I4: {
    en: {
      name: "Projects in use",
      good: "Uses the tools across several projects",
      why: "This counts the projects that had a main session in the scoring window. Using the tools in more places puts the setup you built to wider use.",
      fix: "Try the tools in more projects",
      problem: "Main sessions ran in {value}.",
      prescription: "Try the tools in another project or folder you work in, too.",
      method: "Number of projects with a main session in the scoring window, counted across tools. Folders not treated as projects, such as the home folder, are left out.",
      evidence: "Projects {projects} \xB7 folders left out {excludedFolders} \xB7 sessions not linked to a project {unlinkedSessions}",
      unit: "{value:project|projects}",
      reasons: { no_data: { text: "No project had a main session in the scoring window. Folders not treated as projects, such as the home folder, and sessions not linked to a project are not counted." } }
    },
    ko: {
      name: "\uC4F0\uB294 \uD3ED",
      good: "\uC5EC\uB7EC \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C \uC500",
      why: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC8FC \uC138\uC158\uC774 \uC788\uC5C8\uB358 \uD504\uB85C\uC81D\uD2B8\uC758 \uC218\uC785\uB2C8\uB2E4. \uC5EC\uB7EC \uACF3\uC5D0\uC11C \uC4F0\uBA74 \uAC16\uCDB0 \uB454 \uC14B\uD305\uC744 \uADF8\uB9CC\uD07C \uB113\uAC8C \uC501\uB2C8\uB2E4.",
      fix: "\uB2E4\uB978 \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C\uB3C4 \uC368 \uBCF4\uAE30",
      problem: "\uC8FC \uC138\uC158\uC774 \uC788\uC5C8\uB358 \uD504\uB85C\uC81D\uD2B8\uAC00 {value}\uC785\uB2C8\uB2E4.",
      prescription: "\uC77C\uD558\uB294 \uB2E4\uB978 \uD504\uB85C\uC81D\uD2B8\uB098 \uD3F4\uB354\uC5D0\uC11C\uB3C4 \uC368 \uBCF4\uC138\uC694.",
      method: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC8FC \uC138\uC158\uC774 \uC788\uC5C8\uB358 \uD504\uB85C\uC81D\uD2B8\uC758 \uC218\uC785\uB2C8\uB2E4. \uB3C4\uAD6C\uB97C \uD569\uCCD0 \uC138\uACE0, \uD648 \uD3F4\uB354\uCC98\uB7FC \uD504\uB85C\uC81D\uD2B8\uB85C \uBCF4\uC9C0 \uC54A\uB294 \uD3F4\uB354\uB294 \uBE8D\uB2C8\uB2E4.",
      evidence: "\uD504\uB85C\uC81D\uD2B8 {projects} \xB7 \uBE80 \uD3F4\uB354 {excludedFolders} \xB7 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC787\uC9C0 \uBABB\uD55C \uC138\uC158 {unlinkedSessions}",
      unit: "\uAC1C",
      reasons: { no_data: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC8FC \uC138\uC158\uC774 \uC788\uC5C8\uB358 \uD504\uB85C\uC81D\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uD648 \uD3F4\uB354\uCC98\uB7FC \uD504\uB85C\uC81D\uD2B8\uB85C \uBCF4\uC9C0 \uC54A\uB294 \uD3F4\uB354\uC640 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC787\uC9C0 \uBABB\uD55C \uC138\uC158\uC740 \uC138\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." } }
    }
  }
};

// src/core/copy/rules-setup.ts
var NO_TOOL = {
  en: { text: "No tool was used in the last 30 days, so this was not measured." },
  ko: { text: "\uCD5C\uADFC 30\uC77C \uC548\uC5D0 \uC4F4 \uB3C4\uAD6C\uAC00 \uC5C6\uC5B4 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
};
var SETUP_COPY = {
  S1: {
    en: {
      name: "Global instructions",
      good: "Keeps instructions that load everywhere",
      why: "Global instructions load in every session, in every project. Writing your working style and rules there once means you do not repeat them in each project.",
      fix: "Write global instructions",
      problem: "{value} of the tools you use have global instructions.",
      prescription: "For Claude Code, write at least 200 bytes in CLAUDE.md in its config folder (~/.claude by default). A few lines on how you work and what to avoid are enough.",
      method: "Share of the tools you use that have global instructions (instruction files totaling 200 bytes or more).",
      evidence: "Tools with global instructions {withInstructions} \xB7 tools in use {tools}",
      unit: "%",
      reasons: { no_data: NO_TOOL.en }
    },
    ko: {
      name: "\uC804\uC5ED \uC9C0\uCE68",
      good: "\uC5B4\uB514\uC11C\uB098 \uC2E4\uB9AC\uB294 \uC804\uC5ED \uC9C0\uCE68\uC744 \uB460",
      why: "\uC804\uC5ED \uC9C0\uCE68\uC740 \uC5B4\uB290 \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C\uB4E0 \uC138\uC158\uB9C8\uB2E4 \uC2E4\uB9BD\uB2C8\uB2E4. \uC77C\uD558\uB294 \uBC29\uC2DD\uACFC \uC9C0\uD0AC \uADDC\uCE59\uC744 \uD55C\uACF3\uC5D0 \uC801\uC5B4 \uB450\uBA74 \uD504\uB85C\uC81D\uD2B8\uB9C8\uB2E4 \uB2E4\uC2DC \uC801\uC9C0 \uC54A\uC544\uB3C4 \uB429\uB2C8\uB2E4.",
      fix: "\uC804\uC5ED \uC9C0\uCE68 \uC4F0\uAE30",
      problem: "\uC4F0\uB294 \uB3C4\uAD6C \uAC00\uC6B4\uB370 \uC804\uC5ED \uC9C0\uCE68\uC774 \uC788\uB294 \uB3C4\uAD6C\uB294 {value}\uC785\uB2C8\uB2E4.",
      prescription: "Claude Code\uB294 \uC124\uC815 \uD3F4\uB354(\uAE30\uBCF8\uC740 ~/.claude)\uC758 CLAUDE.md\uC5D0 200\uBC14\uC774\uD2B8 \uC774\uC0C1 \uC801\uC2B5\uB2C8\uB2E4. \uC77C\uD558\uB294 \uBC29\uC2DD\uACFC \uD53C\uD560 \uAC83\uC744 \uBA87 \uC904 \uC801\uC73C\uBA74 \uB429\uB2C8\uB2E4.",
      method: "\uC4F0\uB294 \uB3C4\uAD6C \uAC00\uC6B4\uB370 \uC804\uC5ED \uC9C0\uCE68(\uC9C0\uCE68 \uD30C\uC77C\uC758 \uD06C\uAE30\uB97C \uD569\uCCD0 200\uBC14\uC774\uD2B8 \uC774\uC0C1)\uC774 \uC788\uB294 \uB3C4\uAD6C\uC758 \uBAAB\uC785\uB2C8\uB2E4.",
      evidence: "\uC804\uC5ED \uC9C0\uCE68\uC774 \uC788\uB294 \uB3C4\uAD6C {withInstructions} \xB7 \uC4F0\uB294 \uB3C4\uAD6C {tools}",
      unit: "%",
      reasons: { no_data: NO_TOOL.ko }
    }
  },
  S2: {
    en: {
      name: "Safeguard",
      good: "Has permission checks or a hook for shell commands",
      why: "This looks for permission checks in the default mode, or a confirming hook that can block shell commands. With one of them in place, a command you did not mean to run can be stopped before it runs. What the hook actually filters is not checked.",
      fix: "Add a check before shell commands",
      problem: "{value} of the tools you use have a safeguard. A tool runs with permission checks bypassed and no confirming hook covers shell commands.",
      prescription: "In Claude Code, add an enabled PreToolUse hook in your user settings that can block shell commands (Bash or PowerShell) before they run, or choose a default mode that does not bypass permissions. If you keep bypassing permissions, use the blocking hook.",
      method: "Share of the tools you use that have a safeguard. Claude Code has one if its default mode does not bypass permissions, or if a PreToolUse hook that can block covers shell commands.",
      evidence: "Tools with a safeguard {guarded} \xB7 tools in use {tools}",
      unit: "%",
      reasons: {
        no_data: NO_TOOL.en,
        unreadable: { text: "A settings file that decides the safeguard could not be read, so this was not measured." }
      }
    },
    ko: {
      name: "\uC548\uC804\uC7A5\uCE58",
      good: "\uAD8C\uD55C \uD655\uC778\uC774\uB098 \uC178 \uBA85\uB839 \uD655\uC778 \uD6C5\uC744 \uB460",
      why: "\uAE30\uBCF8 \uBAA8\uB4DC\uC758 \uAD8C\uD55C \uD655\uC778\uC774\uB098, \uC178 \uBA85\uB839\uC758 \uC2E4\uD589\uC744 \uB9C9\uC744 \uC218 \uC788\uB294 \uD655\uC778 \uD6C5\uC774 \uC788\uB294\uC9C0 \uBD05\uB2C8\uB2E4. \uADF8\uB7F0 \uC790\uB9AC\uAC00 \uC788\uC73C\uBA74 \uB73B\uD558\uC9C0 \uC54A\uC740 \uBA85\uB839\uC744 \uC2E4\uD589 \uC804\uC5D0 \uBA48\uCD9C \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uD6C5\uC774 \uBB34\uC5C7\uC744 \uAC78\uB7EC \uB0B4\uB294\uC9C0\uB294 \uBCF4\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      fix: "\uC178 \uBA85\uB839 \uC55E\uC5D0 \uD655\uC778 \uB450\uAE30",
      problem: "\uC4F0\uB294 \uB3C4\uAD6C \uAC00\uC6B4\uB370 \uC548\uC804\uC7A5\uCE58\uAC00 \uC788\uB294 \uB3C4\uAD6C\uB294 {value}\uC785\uB2C8\uB2E4. \uAD8C\uD55C \uD655\uC778\uC744 \uAC74\uB108\uB6F0\uB294\uB370 \uC178 \uBA85\uB839\uC744 \uB36E\uB294 \uD655\uC778 \uD6C5\uC774 \uC5C6\uB294 \uB3C4\uAD6C\uAC00 \uC788\uC2B5\uB2C8\uB2E4.",
      prescription: "Claude Code\uC5D0\uC11C \uC178 \uBA85\uB839(Bash \uB610\uB294 PowerShell)\uC758 \uC2E4\uD589 \uC804\uC5D0 \uACB0\uACFC\uB97C \uAE30\uB2E4\uB9AC\uBA70 \uC2E4\uD589\uC744 \uB9C9\uC744 \uC218 \uC788\uB294 PreToolUse \uD6C5\uC744 \uC0AC\uC6A9\uC790 \uC124\uC815\uC5D0 \uB450\uACE0 \uCF1C\uAC70\uB098, \uAE30\uBCF8 \uBAA8\uB4DC\uB97C \uAD8C\uD55C \uC6B0\uD68C\uAC00 \uC544\uB2CC \uAC83\uC73C\uB85C \uBC14\uAFB8\uC138\uC694. \uAD8C\uD55C \uC6B0\uD68C \uBAA8\uB4DC\uB97C \uACC4\uC18D \uC4F0\uB824\uBA74 \uC2E4\uD589\uC744 \uB9C9\uC744 \uC218 \uC788\uB294 \uD655\uC778 \uD6C5\uC744 \uB450\uC138\uC694.",
      method: "\uC4F0\uB294 \uB3C4\uAD6C \uAC00\uC6B4\uB370 \uC548\uC804\uC7A5\uCE58\uAC00 \uC788\uB294 \uB3C4\uAD6C\uC758 \uBAAB\uC785\uB2C8\uB2E4. Claude Code\uB294 \uAE30\uBCF8 \uBAA8\uB4DC\uAC00 \uAD8C\uD55C \uC6B0\uD68C\uAC00 \uC544\uB2C8\uAC70\uB098, \uC178 \uBA85\uB839\uC5D0 \uAC78\uB9AC\uACE0 \uC2E4\uD589\uC744 \uB9C9\uC744 \uC218 \uC788\uB294 \uB3C4\uAD6C \uC2E4\uD589 \uC804 \uD655\uC778 \uD6C5\uC774 \uC788\uC73C\uBA74 \uC548\uC804\uC7A5\uCE58\uAC00 \uC788\uB294 \uAC83\uC73C\uB85C \uBD05\uB2C8\uB2E4.",
      evidence: "\uC548\uC804\uC7A5\uCE58\uAC00 \uC788\uB294 \uB3C4\uAD6C {guarded} \xB7 \uC4F0\uB294 \uB3C4\uAD6C {tools}",
      unit: "%",
      reasons: {
        no_data: NO_TOOL.ko,
        unreadable: { text: "\uC548\uC804\uC7A5\uCE58\uB97C \uC815\uD558\uB294 \uC124\uC815 \uD30C\uC77C \uAC00\uC6B4\uB370 \uC77D\uC9C0 \uBABB\uD55C \uAC83\uC774 \uC788\uC5B4 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  S3: {
    en: {
      name: "Broken settings",
      good: "No broken user-editable settings found",
      why: "This checks settings-file syntax, skill headers, and link targets in the setup you edit yourself.",
      fix: "Fix broken settings",
      problem: "Found {value} in the settings checked.",
      prescription: "Fix the JSON in settings files that do not parse, add a header with name and description at the top of each SKILL.md, and remove links that point nowhere.",
      method: "Count of unparsable settings files, skills without a header, and links that point nowhere, in the setup you edit yourself. Files inside plugins and managed policy files are not counted.",
      evidence: "Unparsable settings files {unparsable} \xB7 skills without a header {noFrontmatter} \xB7 links that point nowhere {danglingLinks} \xB7 total {problems}",
      unit: "{value:problem|problems}"
    },
    ko: {
      name: "\uAE68\uC9C4 \uC124\uC815",
      good: "\uC9C1\uC811 \uACE0\uCE58\uB294 \uC124\uC815\uC5D0\uC11C \uBB38\uC81C\uB97C \uCC3E\uC9C0 \uBABB\uD568",
      why: "\uC9C1\uC811 \uACE0\uCE58\uB294 \uC124\uC815\uC5D0\uC11C \uC124\uC815 \uD30C\uC77C\uC758 \uD615\uC2DD, \uC2A4\uD0AC \uBA38\uB9AC\uB9D0, \uB9C1\uD06C \uB300\uC0C1\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
      fix: "\uAE68\uC9C4 \uC124\uC815 \uACE0\uCE58\uAE30",
      problem: "\uC810\uAC80\uD55C \uC124\uC815\uC5D0\uC11C \uBB38\uC81C\uB97C {value} \uCC3E\uC558\uC2B5\uB2C8\uB2E4.",
      prescription: "\uD480\uB9AC\uC9C0 \uC54A\uB294 \uC124\uC815 \uD30C\uC77C\uC740 JSON \uAF34\uC744 \uBC14\uB85C\uC7A1\uACE0, \uC2A4\uD0AC\uC740 SKILL.md \uB9E8 \uC704\uC5D0 name\uACFC description\uC774 \uB4E0 \uBA38\uB9AC\uB9D0\uC744 \uB123\uACE0, \uAC00\uB9AC\uD0A4\uB294 \uACF3\uC774 \uC5C6\uB294 \uB9C1\uD06C\uB294 \uC9C0\uC6B0\uC138\uC694.",
      method: "\uC0AC\uC6A9\uC790\uAC00 \uC9C1\uC811 \uACE0\uCE58\uB294 \uC14B\uD305\uC5D0\uC11C \uD480\uB9AC\uC9C0 \uC54A\uB294 \uC124\uC815 \uD30C\uC77C, \uBA38\uB9AC\uB9D0\uC774 \uC5C6\uB294 \uC2A4\uD0AC, \uAC00\uB9AC\uD0A4\uB294 \uACF3\uC774 \uC5C6\uB294 \uB9C1\uD06C\uC758 \uC218\uC785\uB2C8\uB2E4. \uD50C\uB7EC\uADF8\uC778 \uC548\uC758 \uAC83\uACFC \uAD00\uB9AC \uC815\uCC45 \uD30C\uC77C\uC740 \uC138\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      evidence: "\uD480\uB9AC\uC9C0 \uC54A\uB294 \uC124\uC815 \uD30C\uC77C {unparsable} \xB7 \uBA38\uB9AC\uB9D0\uC774 \uC5C6\uB294 \uC2A4\uD0AC {noFrontmatter} \xB7 \uAC00\uB9AC\uD0A4\uB294 \uACF3\uC774 \uC5C6\uB294 \uB9C1\uD06C {danglingLinks} \xB7 \uD569\uACC4 {problems}",
      unit: "\uAC1C"
    }
  },
  S4: {
    en: {
      name: "Hook failures",
      good: "Hooks rarely fail",
      why: "When a hook fails, the check or automation you gave it may not complete. This rule tracks the share of hook runs that failed.",
      fix: "Fix failing hooks",
      problem: "{value} of hook runs failed.",
      prescription: "Open /hooks to see the registered hooks, run the command of a failing hook in a terminal to find why it fails, and remove hooks you no longer use.",
      method: "Share of hook runs in the scoring window that failed. Blocks that could be on purpose or a failure are counted as neither a run nor a failure.",
      evidence: "Failures {failures} \xB7 runs {runs} \xB7 blocks not classified {unclassifiedBlocks}",
      unit: "%",
      reasons: {
        no_data: { text: "There were no hook runs to include in the failure rate. Blocks that may have been on purpose are not included." },
        too_little: { text: "Fewer than 100 hook runs to include in the failure rate, so this was not measured." }
      }
    },
    ko: {
      name: "\uD6C5 \uC2E4\uD328",
      good: "\uD6C5 \uC2E4\uD328\uAC00 \uB4DC\uBB3E",
      why: "\uD6C5\uC774 \uC2E4\uD328\uD558\uBA74 \uADF8 \uD6C5\uC5D0 \uB9E1\uAE34 \uD655\uC778\uC774\uB098 \uC790\uB3D9 \uC791\uC5C5\uC774 \uC81C\uB300\uB85C \uB418\uC9C0 \uC54A\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC774 \uD56D\uBAA9\uC740 \uD6C5 \uC2E4\uD589 \uAC00\uC6B4\uB370 \uC2E4\uD328\uD55C \uBAAB\uC744 \uBD05\uB2C8\uB2E4.",
      fix: "\uC2E4\uD328\uD558\uB294 \uD6C5 \uACE0\uCE58\uAE30",
      problem: "\uD6C5 \uC2E4\uD589 \uAC00\uC6B4\uB370 {value}\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
      prescription: "/hooks\uC5D0\uC11C \uB4F1\uB85D\uB41C \uD6C5\uC744 \uBCF4\uACE0, \uC2E4\uD328\uD558\uB294 \uD6C5\uC758 \uBA85\uB839\uC744 \uD130\uBBF8\uB110\uC5D0\uC11C \uC9C1\uC811 \uB3CC\uB824 \uAE4C\uB2ED\uC744 \uCC3E\uC73C\uC138\uC694. \uB354 \uC4F0\uC9C0 \uC54A\uB294 \uD6C5\uC740 \uC9C0\uC6B0\uC138\uC694.",
      method: "\uC810\uC218 \uAD6C\uAC04\uC758 \uD6C5 \uC2E4\uD589 \uAC00\uC6B4\uB370 \uC2E4\uD328\uD55C \uBAAB\uC785\uB2C8\uB2E4. \uC77C\uBD80\uB7EC \uB9C9\uC740 \uAC83\uC778\uC9C0 \uC2E4\uD328\uD574\uC11C \uB9C9\uD78C \uAC83\uC778\uC9C0 \uAC00\uB9B4 \uC218 \uC5C6\uB294 \uB9C9\uC74C\uC740 \uC2E4\uD589\uC5D0\uB3C4 \uC2E4\uD328\uC5D0\uB3C4 \uB123\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      evidence: "\uC2E4\uD328 {failures} \xB7 \uC2E4\uD589 {runs} \xB7 \uAC00\uB9AC\uC9C0 \uBABB\uD55C \uB9C9\uC74C {unclassifiedBlocks}",
      unit: "%",
      reasons: {
        no_data: { text: "\uC2E4\uD328\uC728\uC5D0 \uB123\uC744 \uD6C5 \uC2E4\uD589\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC77C\uBD80\uB7EC \uB9C9\uC740 \uAC83\uC778\uC9C0 \uAC00\uB9B4 \uC218 \uC5C6\uB294 \uB9C9\uC74C\uC740 \uB123\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." },
        too_little: { text: "\uC2E4\uD328\uC728\uC5D0 \uB123\uC744 \uD6C5 \uC2E4\uD589\uC774 100\uBC88\uC5D0 \uBABB \uBBF8\uCCD0 \uC7AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
      }
    }
  },
  S5: {
    en: {
      name: "MCP connection failures",
      good: "MCP connection failures are uncommon",
      why: "When a server connection fails, calls to its tools may fail until a connection succeeds.",
      fix: "Fix MCP servers that fail to connect",
      problem: "{value} of sessions had an MCP connection failure.",
      prescription: "Open /mcp to find the servers that fail to connect, then fix their settings or turn off the ones you do not use.",
      method: "Share of main sessions with responses in the scoring window that had a connection failure. Servers waiting for sign-in or still connecting are not failures.",
      evidence: "Sessions with a failure {failedSessions} \xB7 main sessions with responses {mainSessions} \xB7 servers turned on {enabledServers}",
      unit: "%",
      reasons: {
        not_applicable: { text: "No MCP server is turned on." },
        unreadable: { text: "A settings file that decides which servers are on, or a place where servers are defined, could not be read." },
        no_data: { text: "No main session had responses in the scoring window." }
      }
    },
    ko: {
      name: "MCP \uC5F0\uACB0 \uC2E4\uD328",
      good: "MCP \uC5F0\uACB0 \uC2E4\uD328\uAC00 \uB4DC\uBB3E",
      why: "\uC11C\uBC84 \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD558\uBA74 \uB2E4\uC2DC \uC5F0\uACB0\uB420 \uB54C\uAE4C\uC9C0 \uADF8 \uC11C\uBC84\uC758 \uB3C4\uAD6C \uD638\uCD9C\uB3C4 \uC2E4\uD328\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      fix: "\uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD558\uB294 MCP \uC11C\uBC84 \uACE0\uCE58\uAE30",
      problem: "\uC751\uB2F5\uC774 \uC788\uB294 \uC138\uC158 \uAC00\uC6B4\uB370 {value}\uC5D0\uC11C MCP \uC5F0\uACB0 \uC2E4\uD328\uAC00 \uC788\uC5C8\uC2B5\uB2C8\uB2E4.",
      prescription: "/mcp\uC5D0\uC11C \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD558\uB294 \uC11C\uBC84\uB97C \uCC3E\uC544 \uC124\uC815\uC744 \uACE0\uCE58\uAC70\uB098, \uC4F0\uC9C0 \uC54A\uB294 \uC11C\uBC84\uB294 \uAEBC \uB450\uC138\uC694.",
      method: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC751\uB2F5\uC774 \uC788\uB294 \uC8FC \uC138\uC158 \uAC00\uC6B4\uB370 \uC5F0\uACB0 \uC2E4\uD328\uAC00 \uC788\uC5C8\uB358 \uC138\uC158\uC758 \uBAAB\uC785\uB2C8\uB2E4. \uC778\uC99D\uC744 \uAE30\uB2E4\uB9AC\uAC70\uB098 \uC5F0\uACB0\uD558\uB294 \uC911\uC778 \uC11C\uBC84\uB294 \uC2E4\uD328\uB85C \uC138\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      evidence: "\uC2E4\uD328\uAC00 \uC788\uC5C8\uB358 \uC138\uC158 {failedSessions} \xB7 \uC751\uB2F5\uC774 \uC788\uB294 \uC8FC \uC138\uC158 {mainSessions} \xB7 \uCF1C\uC838 \uC788\uB294 \uC11C\uBC84 {enabledServers}",
      unit: "%",
      reasons: {
        not_applicable: { text: "\uCF1C\uC838 \uC788\uB294 MCP \uC11C\uBC84\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." },
        unreadable: { text: "\uC11C\uBC84\uC758 \uCF1C\uC9D0\uC744 \uC815\uD558\uB294 \uC124\uC815 \uD30C\uC77C\uC774\uB098 \uC11C\uBC84\uB97C \uCC3E\uB294 \uACF3 \uAC00\uC6B4\uB370 \uC77D\uC9C0 \uBABB\uD55C \uAC83\uC774 \uC788\uC2B5\uB2C8\uB2E4." },
        no_data: { text: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC751\uB2F5\uC774 \uC788\uB294 \uC8FC \uC138\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }
      }
    }
  }
};

// src/core/copy/findings.ts
var RULE_COPY = { ...SETUP_COPY, ...EFFICIENCY_COPY, ...FIT_COPY, ...INTENSITY_COPY };
function joinValue(value, unit, lang) {
  return unit === "%" || lang === "ko" ? `${value}${unit}` : `${value} ${unit}`;
}
function fillEvidence(template, evidence, extra = {}) {
  return fill(template, { ...Object.fromEntries(slots(template).map((slot) => [slot, null])), ...evidence, ...extra });
}
function reasonOf(copy, reason, lang) {
  const own = copy.reasons?.[reason];
  const common = REASON_COPY[reason][lang];
  return { word: own?.word ?? common.word, text: own?.text ?? common.text };
}
function measured(kind, value, copy) {
  const shown = formatValue(kind, value);
  return { value: shown, unit: fill(copy.unit, { value: shown === "1" ? 1 : 0 }) };
}
function toolLine(kind, value, copy, lang) {
  const tool = TOOL_NAMES[value.tool][lang];
  const evidence = fillEvidence(copy.evidence, value.evidence);
  if (value.status === "scored") {
    const shown = measured(kind, value.value, copy);
    return fill(TOOL_LINE[lang].measured, { tool, value: joinValue(shown.value, shown.unit, lang), evidence });
  }
  return fill(TOOL_LINE[lang].unmeasured, { tool, reason: reasonOf(copy, value.reason, lang).word, evidence });
}
function reasonEvidence(finding) {
  if (finding.tools.length === 0) return finding.evidence;
  return finding.tools.find((value) => value.reason === finding.reason)?.evidence ?? {};
}
var candidateSources = (finding) => finding.tools.filter((value) => value.status === "unmeasured" && value.candidates.length > 0 && (value.reason === "too_little" || value.reason === "watching"));
function description(finding, copy, lang, shown) {
  if (finding.category === "strength" || finding.category === "average") return copy.why;
  if (finding.category === "unmeasured") return fillEvidence(reasonOf(copy, finding.reason, lang).text, reasonEvidence(finding));
  const sources = candidateSources(finding);
  if (finding.status === "unmeasured") {
    const sentences = sources.map((value) => {
      const sentence = fillEvidence(copy.repairUnmeasured?.[value.reason] ?? reasonOf(copy, value.reason, lang).text, value.evidence, { candidates: value.candidates.length });
      return sources.length > 1 ? `${TOOL_NAMES[value.tool][lang]}: ${sentence}` : sentence;
    });
    return sentences.length > 0 ? sentences.join(" ") : fillEvidence(reasonOf(copy, finding.reason, lang).text, reasonEvidence(finding));
  }
  const others = sources.map((value) => fillEvidence(OTHER_TOOL_COPY[value.reason][lang], value.evidence, { tool: TOOL_NAMES[value.tool][lang], candidates: value.candidates.length }));
  return [fill(copy.problem, { value: joinValue(shown.value, shown.unit, lang) }), ...others].join(" ");
}
function safeguardLine(safeguard, lang) {
  const copy = SAFEGUARD_COPY[lang];
  const { guardHook, permissionChecks } = safeguard;
  const condition = guardHook === null || permissionChecks === null ? copy.unknown : guardHook && permissionChecks ? copy.both : guardHook ? copy.hook : permissionChecks ? copy.permissions : copy.none;
  return fill(copy.line, { tool: TOOL_NAMES[safeguard.tool][lang], condition });
}
var WHY_ORDER = ["no_definition", "plugin_unread", "not_established", "observation_incomplete"];
function unjudgedNotes(servers, lang) {
  if (servers.length === 0) return [];
  const copy = UNJUDGED_COPY[lang];
  const lines = [copy.intro];
  for (const tool of [...new Set(servers.map((server) => server.tool))].sort()) {
    for (const why of WHY_ORDER) {
      const count = servers.filter((server) => server.tool === tool && server.why === why).length;
      if (count > 0) lines.push(fill(copy.line, { tool: TOOL_NAMES[tool][lang], why: copy.why[why], count }));
    }
  }
  if (servers.some((server) => server.scope === "claude-ai")) lines.push(copy.deny);
  return lines;
}
function findingText(finding, details, lang) {
  const copy = RULE_COPY[finding.ruleId][lang];
  const shown = finding.status === "scored" ? measured(finding.kind, finding.value, copy) : null;
  const method = [copy.method];
  if (ruleSpec(finding.ruleId).unit === "merged") method.push(fillEvidence(copy.evidence, finding.evidence));
  for (const value of finding.tools) method.push(toolLine(finding.kind, value, copy, lang));
  if (finding.ruleId === "S2") for (const safeguard of details.safeguards) method.push(safeguardLine(safeguard, lang));
  return {
    name: copy.name,
    title: finding.category === "strength" ? copy.good : finding.category === "repair" ? copy.fix : copy.name,
    value: shown?.value ?? null,
    unit: shown?.unit ?? null,
    reason: finding.status === "unmeasured" ? reasonOf(copy, finding.reason, lang).word : null,
    description: description(finding, copy, lang, shown),
    prescription: finding.category === "average" || finding.category === "repair" ? copy.prescription : null,
    method,
    notes: finding.ruleId === "E6" ? unjudgedNotes(details.unjudgedServers, lang) : []
  };
}

// src/core/copy/grades.ts
var GRADE_COPY = {
  5: {
    en: { name: "Graduation Day", diagnosis: "Your AQ is in the highest grade band. Check each item's result as well." },
    ko: { name: "\uBA85\uC138\uC11C \uC878\uC5C5\uC2DD", diagnosis: "AQ\uAC00 \uAC00\uC7A5 \uB192\uC740 \uB4F1\uAE09\uC785\uB2C8\uB2E4. \uD56D\uBAA9\uB9C8\uB2E4\uC758 \uACB0\uACFC\uB3C4 \uD568\uAED8 \uBCF4\uC138\uC694." }
  },
  4: {
    en: { name: "Stamp of Approval", diagnosis: "Your AQ is in a high grade band. Check each item's result as well." },
    ko: { name: "\uD569\uACA9 \uB3C4\uC7A5", diagnosis: "AQ\uAC00 \uB192\uC740 \uB4F1\uAE09\uC785\uB2C8\uB2E4. \uD56D\uBAA9\uB9C8\uB2E4\uC758 \uACB0\uACFC\uB3C4 \uD568\uAED8 \uBCF4\uC138\uC694." }
  },
  3: {
    en: { name: "Sleeves Up", diagnosis: "Let's go through the results item by item. If anything needs work, Chunsik will help fix it." },
    ko: { name: "\uD314 \uAC77\uACE0 \uC218\uB9AC", diagnosis: "\uC810\uAC80 \uACB0\uACFC\uB97C \uD56D\uBAA9\uB9C8\uB2E4 \uC0B4\uD3B4\uBD05\uC2DC\uB2E4. \uC190\uBCFC \uACF3\uC774 \uC788\uC73C\uBA74 \uCD98\uC2DD\uC774\uAC00 \uD568\uAED8 \uACE0\uCE69\uB2C8\uB2E4." }
  },
  2: {
    en: { name: "Who did this?", diagnosis: "Let's look at the checked items one by one. Chunsik will go through them with you." },
    ko: { name: "\uB204\uAC00 \uC774\uB7AC\uC5B4?", diagnosis: "\uC810\uAC80\uD55C \uD56D\uBAA9\uC744 \uD558\uB098\uC529 \uC0B4\uD3B4\uBD05\uC2DC\uB2E4. \uCD98\uC2DD\uC774\uAC00 \uD568\uAED8 \uD655\uC778\uD569\uB2C8\uB2E4." }
  },
  1: {
    en: { name: "Lightning Slash", diagnosis: "There is a lot to fix. Chunsik is starting right away." },
    ko: { name: "\uBC88\uAC1C \uBCA0\uAE30", diagnosis: "\uC190\uBCFC \uACF3\uC774 \uB9CE\uC2B5\uB2C8\uB2E4. \uCD98\uC2DD\uC774\uAC00 \uBC14\uB85C \uC2DC\uC791\uD569\uB2C8\uB2E4." }
  }
};
var WITHHELD_COPY = {
  en: { records: "There are not enough records for a score yet. Try another checkup after more use has been recorded.", noAxes: "No criterion could be measured, so there is no score." },
  ko: { records: "\uC810\uC218\uB97C \uB0B4\uB294 \uB370 \uD544\uC694\uD55C \uAE30\uB85D\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4. \uC0AC\uC6A9 \uAE30\uB85D\uC774 \uB354 \uC313\uC778 \uB4A4 \uB2E4\uC2DC \uC810\uAC80\uD574 \uBCF4\uC138\uC694.", noAxes: "\uC7B4 \uC218 \uC788\uB294 \uAE30\uC900\uC774 \uC5C6\uC5B4 \uC810\uC218\uB97C \uB0B4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }
};
var EMPTY_COPY = {
  en: { strengths: "No clear strength was found yet. Let's start with the fixes, one at a time.", repairs: "Nothing needs fixing right now." },
  ko: { strengths: "\uC544\uC9C1 \uB69C\uB837\uD55C \uAC15\uC810\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uACE0\uCE60 \uAC83\uBD80\uD130 \uD558\uB098\uC529 \uD574 \uBD05\uC2DC\uB2E4.", repairs: "\uC9C0\uAE08\uC740 \uACE0\uCE60 \uAC83\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }
};
function resultText(score, categories, lang) {
  const fewRecords = score.withheld.includes("too_few_requests") || score.withheld.includes("too_few_days");
  return {
    grade: score.tier === null ? null : GRADE_COPY[score.tier][lang].name,
    diagnosis: score.tier !== null ? GRADE_COPY[score.tier][lang].diagnosis : fewRecords ? WITHHELD_COPY[lang].records : WITHHELD_COPY[lang].noAxes,
    noStrengths: categories.includes("strength") ? null : EMPTY_COPY[lang].strengths,
    noRepairs: categories.includes("repair") ? null : EMPTY_COPY[lang].repairs
  };
}

// src/core/copy/notices.ts
var WITHHELD_COPY2 = {
  too_few_requests: { en: "There were fewer than 20 requests from you in the scoring window.", ko: "\uC810\uC218 \uAD6C\uAC04\uC758 \uC0AC\uB78C \uC694\uCCAD\uC774 20\uAC1C\uC5D0 \uBABB \uBBF8\uCE69\uB2C8\uB2E4." },
  too_few_days: { en: "The tools were used on fewer than 3 days in the scoring window.", ko: "\uC810\uC218 \uAD6C\uAC04\uC5D0 \uC4F4 \uB0A0\uC774 3\uC77C\uC5D0 \uBABB \uBBF8\uCE69\uB2C8\uB2E4." },
  no_axes: { en: "None of the four criteria could be measured.", ko: "\uC7B4 \uC218 \uC788\uB294 \uAE30\uC900\uC774 \uD558\uB098\uB3C4 \uC5C6\uC2B5\uB2C8\uB2E4." }
};
var METRIC = {
  skills: { en: "skill use", ko: "\uC2A4\uD0AC \uC0AC\uC6A9" },
  mcp: { en: "MCP calls", ko: "MCP \uD638\uCD9C" }
};
var OBSERVATION_REASON = {
  "unreadable-files": { en: "unreadable files", ko: "\uC77D\uC9C0 \uBABB\uD55C \uD30C\uC77C" },
  "too-long-lines": { en: "lines too long", ko: "\uB108\uBB34 \uAE34 \uC904" },
  "unconfirmed-pieces": { en: "unconfirmed pieces", ko: "\uD655\uC778\uD558\uC9C0 \uBABB\uD55C \uC870\uAC01" }
};
var UNREADABLE_SETUP = {
  claude_json: { en: ".claude.json", ko: ".claude.json" },
  user_settings: { en: "user settings", ko: "\uC0AC\uC6A9\uC790 \uC124\uC815" },
  managed_settings: { en: "managed policy", ko: "\uAD00\uB9AC \uC815\uCC45" },
  project_settings: { en: "project settings", ko: "\uD504\uB85C\uC81D\uD2B8 \uC124\uC815" },
  local_settings: { en: "local settings", ko: "\uB85C\uCEEC \uC124\uC815" },
  mcp_json: { en: "project .mcp.json", ko: "\uD504\uB85C\uC81D\uD2B8\uC758 .mcp.json" },
  plugins_file: { en: "plugin install records", ko: "\uD50C\uB7EC\uADF8\uC778 \uC124\uCE58 \uAE30\uB85D" },
  skill_dirs: { en: "skill folders", ko: "\uC2A4\uD0AC \uD3F4\uB354" },
  instructions: { en: "instruction files", ko: "\uC9C0\uCE68 \uD30C\uC77C" },
  hook_settings: { en: "settings with hooks", ko: "\uD6C5\uC744 \uC801\uC740 \uC124\uC815" },
  skill_files: { en: "SKILL.md files", ko: "SKILL.md" }
};
var UNCOUNTED2 = {
  composition_unknown: { en: "contents unknown", ko: "\uAD6C\uC131\uC744 \uBAA8\uB984" },
  not_installed: { en: "not in the install records", ko: "\uC124\uCE58 \uAE30\uB85D\uC5D0 \uC5C6\uC74C" },
  skills_unreadable: { en: "skill folder could not be read", ko: "\uC2A4\uD0AC \uD3F4\uB354\uB97C \uC77D\uC9C0 \uBABB\uD568" },
  mcp_unreadable: { en: "MCP definitions could not be read", ko: "MCP \uC815\uC758\uB97C \uC77D\uC9C0 \uBABB\uD568" },
  hooks_unreadable: { en: "hooks could not be read", ko: "\uD6C5\uC744 \uC77D\uC9C0 \uBABB\uD568" }
};
var UNCLASSIFIED = {
  compaction: { en: "{count} {count:compaction|compactions}", ko: "\uC555\uCD95 {count}\uAC1C" },
  denial: { en: "{count} {count:denial marker|denial markers}", ko: "\uAC70\uC808 \uD45C\uC2DC {count}\uAC1C" },
  hook: { en: "{count} {count:hook attachment|hook attachments}", ko: "\uD6C5 \uCCA8\uBD80 {count}\uAC1C" }
};
var LINES = {
  en: {
    withheld: "No AQ was given. {reasons}",
    state_reset: "The state file was broken, so a new one was started. The record of watched installs builds up again from the start.",
    record_unreadable: "{tool}: {files} {files:file|files} and {dirs} {dirs:folder|folders} of records could not be read. Only what was read is counted.",
    observation_incomplete: "{tool}: the records of {metric} could not all be read ({reasons}), so unused ones were not judged.",
    setup_unreadable: "{tool}: some setup could not be read ({what}). Only what was read is counted.",
    setupCounted: "{tool}: some setup could not be read ({what}, {count} {count:place|places}). Only what was read is counted.",
    plugins_uncounted: "{tool}: {count} enabled {count:plugin has|plugins have} information that could not be fully inspected ({why}).",
    setup_problems_unscored: "{tool}: {count} {count:problem was|problems were} found in places that scores do not count (inside plugins, managed policy, files the tool writes).",
    projects_gone: "{count} {count:project|projects} whose folder is no longer on this PC {count:was|were} left out of the rules that look at instructions and settings.",
    version_unverified: "{tool}: the records include {count} {count:version|versions} outside the verified range ({from} to {to}). Only the fields that could be read are counted.",
    weak_human_requests: "{tool}: {weak} of {total} {total:request|requests} in the scoring window {weak:has|have} weak evidence of coming from a person.",
    overlapping_responses: "{tool}: {sessions} {sessions:session starts|sessions start} with responses that also appear in another session. The overlap was not removed from the counts.",
    unclassified: "{tool}: some records could not be classified ({items}).",
    orphan_subsessions: "{tool}: {sessions} {sessions:subsession has|subsessions have} no known parent session."
  },
  ko: {
    withheld: "AQ\uB97C \uB0B4\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. {reasons}",
    state_reset: "\uC0C1\uD0DC \uD30C\uC77C\uC774 \uAE68\uC838 \uC0C8\uB85C \uC2DC\uC791\uD588\uC2B5\uB2C8\uB2E4. \uC124\uCE58\uB97C \uC9C0\uCF1C\uBCF8 \uAE30\uB85D\uC774 \uCC98\uC74C\uBD80\uD130 \uB2E4\uC2DC \uC313\uC785\uB2C8\uB2E4.",
    record_unreadable: "{tool} \uAE30\uB85D \uAC00\uC6B4\uB370 \uC77D\uC9C0 \uBABB\uD55C \uD30C\uC77C {files}\uAC1C\uC640 \uD3F4\uB354 {dirs}\uAC1C\uAC00 \uC788\uC2B5\uB2C8\uB2E4. \uC77D\uC740 \uAC83\uB9CC\uC73C\uB85C \uACC4\uC0B0\uD588\uC2B5\uB2C8\uB2E4.",
    observation_incomplete: "{tool}\uC758 {metric} \uAE30\uB85D\uC744 \uBE60\uC9D0\uC5C6\uC774 \uC77D\uC9C0 \uBABB\uD574({reasons}) \uC548 \uC4F0\uB294 \uAC83\uC744 \uD310\uC815\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
    setup_unreadable: "{tool}\uC5D0\uC11C \uC77D\uC9C0 \uBABB\uD55C \uC14B\uD305\uC774 \uC788\uC2B5\uB2C8\uB2E4({what}). \uC77D\uC740 \uAC83\uB9CC\uC73C\uB85C \uACC4\uC0B0\uD588\uC2B5\uB2C8\uB2E4.",
    setupCounted: "{tool}\uC5D0\uC11C \uC77D\uC9C0 \uBABB\uD55C \uC14B\uD305\uC774 \uC788\uC2B5\uB2C8\uB2E4({what} {count}\uACF3). \uC77D\uC740 \uAC83\uB9CC\uC73C\uB85C \uACC4\uC0B0\uD588\uC2B5\uB2C8\uB2E4.",
    plugins_uncounted: "{tool}\uC5D0\uC11C \uCF1C\uC838 \uC788\uB294 \uD50C\uB7EC\uADF8\uC778 {count}\uAC1C\uC5D0 \uD655\uC778\uD558\uC9C0 \uBABB\uD55C \uC815\uBCF4\uAC00 \uC788\uC2B5\uB2C8\uB2E4({why}).",
    setup_problems_unscored: "{tool}\uC5D0\uC11C \uC810\uC218\uC5D0 \uC138\uC9C0 \uC54A\uB294 \uACF3(\uD50C\uB7EC\uADF8\uC778 \uC548, \uAD00\uB9AC \uC815\uCC45, \uB3C4\uAD6C\uAC00 \uC4F0\uB294 \uD30C\uC77C)\uC5D0 \uBB38\uC81C\uAC00 {count}\uAC1C \uC788\uC2B5\uB2C8\uB2E4.",
    projects_gone: "\uC791\uC5C5 \uD3F4\uB354\uAC00 \uC9C0\uAE08 PC\uC5D0 \uC5C6\uB294 \uD504\uB85C\uC81D\uD2B8 {count}\uAC1C\uB294 \uC9C0\uCE68\uACFC \uC124\uC815\uC744 \uBCF4\uB294 \uADDC\uCE59\uC5D0\uC11C \uBE90\uC2B5\uB2C8\uB2E4.",
    version_unverified: "{tool} \uAE30\uB85D\uC5D0 \uD655\uC778\uD55C \uBC94\uC704({from}~{to}) \uBC16\uC758 \uBC84\uC804\uC774 {count}\uAC1C \uC788\uC2B5\uB2C8\uB2E4. \uC77D\uC744 \uC218 \uC788\uB294 \uD544\uB4DC\uB9CC\uC73C\uB85C \uACC4\uC0B0\uD588\uC2B5\uB2C8\uB2E4.",
    weak_human_requests: "{tool}\uC758 \uC810\uC218 \uAD6C\uAC04 \uC0AC\uB78C \uC694\uCCAD {total}\uAC1C \uAC00\uC6B4\uB370 {weak}\uAC1C\uB294 \uC0AC\uB78C\uC774 \uBCF4\uB0C8\uB2E4\uB294 \uADFC\uAC70\uAC00 \uC57D\uD569\uB2C8\uB2E4.",
    overlapping_responses: "{tool}\uC5D0\uC11C \uCC98\uC74C \uB098\uC628 \uC751\uB2F5\uC774 \uB2E4\uB978 \uC138\uC158\uACFC \uACB9\uCE58\uB294 \uC138\uC158\uC774 {sessions}\uAC1C \uC788\uC2B5\uB2C8\uB2E4. \uACB9\uCE5C \uC751\uB2F5\uC744 \uBE7C\uC9C0 \uC54A\uACE0 \uC14C\uC2B5\uB2C8\uB2E4.",
    unclassified: "{tool}\uC5D0 \uBD84\uB958\uD558\uC9C0 \uBABB\uD55C \uAE30\uB85D\uC774 \uC788\uC2B5\uB2C8\uB2E4({items}).",
    orphan_subsessions: "{tool}\uC5D0 \uBD80\uBAA8 \uC138\uC158\uC744 \uBAA8\uB974\uB294 \uD558\uC704 \uC138\uC158\uC774 {sessions}\uAC1C \uC788\uC2B5\uB2C8\uB2E4."
  }
};
var LIST_JOIN = ", ";
function unclassifiedItems(counts, lang) {
  const groups = ["compaction", "denial", "hook"].map((group) => ({ group, count: counts.filter((item) => item.what.split(":")[0] === group).reduce((sum2, item) => sum2 + item.count, 0) }));
  return groups.filter((item) => item.count > 0).map((item) => fill(UNCLASSIFIED[item.group][lang], { count: item.count })).join(LIST_JOIN);
}
function noticeText(notice, lang) {
  const lines = LINES[lang];
  const tool = "tool" in notice ? TOOL_NAMES[notice.tool][lang] : "";
  switch (notice.kind) {
    case "score_withheld":
      return fill(lines.withheld, { reasons: notice.reasons.map((reason) => WITHHELD_COPY2[reason][lang]).join(" ") });
    case "state_reset":
      return lines.state_reset;
    case "record_unreadable":
      return fill(lines.record_unreadable, { tool, files: notice.files.length, dirs: notice.dirs.length });
    case "observation_incomplete":
      return fill(lines.observation_incomplete, { tool, metric: METRIC[notice.metric][lang], reasons: notice.reasons.map((reason) => OBSERVATION_REASON[reason][lang]).join(LIST_JOIN) });
    case "setup_unreadable": {
      const what = UNREADABLE_SETUP[notice.what][lang];
      return notice.targets.length > 0 ? fill(lines.setupCounted, { tool, what, count: notice.targets.length }) : fill(lines.setup_unreadable, { tool, what });
    }
    case "plugins_uncounted":
      return fill(lines.plugins_uncounted, { tool, count: notice.plugins.length, why: UNCOUNTED2[notice.why][lang] });
    case "setup_problems_unscored":
      return fill(lines.setup_problems_unscored, { tool, count: notice.problems.length });
    case "projects_gone":
      return fill(lines.projects_gone, { count: notice.projects.length });
    case "version_unverified":
      return fill(lines.version_unverified, { tool, count: notice.versions.length, from: notice.verified.from, to: notice.verified.to });
    case "weak_human_requests":
      return fill(lines.weak_human_requests, { tool, weak: notice.weak, total: notice.total });
    case "overlapping_responses":
      return fill(lines.overlapping_responses, { tool, sessions: notice.sessions });
    case "unclassified":
      return fill(lines.unclassified, { tool, items: unclassifiedItems(notice.counts, lang) });
    case "orphan_subsessions":
      return fill(lines.orphan_subsessions, { tool, sessions: notice.sessions });
  }
}

// src/core/result/coverage.ts
var PARTIAL_READ_SHARE = 0.2;
function resultCoverage(input, collected) {
  const tools = [...input.tools].sort((a, b) => a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0);
  return tools.map((tool) => {
    const found = collected.find((item) => item.tool === tool.tool);
    if (found === void 0) throw new Error(`no collected result for ${tool.tool}`);
    const { read } = found;
    const sum2 = (pick) => tool.summaries.reduce((total, summary) => total + pick(summary.missing), 0);
    const shares = [read.files > 0 ? read.unreadableFiles.length / read.files : null, read.listedBytes > 0 ? read.unreadableFileBytes / read.listedBytes : null].filter((share2) => share2 !== null);
    const unreadableShare = shares.length === 0 ? null : Math.max(...shares);
    const lowerBound = read.unreadableDirs.length > 0 || read.unknownSizeFiles > 0;
    return {
      tool: tool.tool,
      files: read.files,
      listedBytes: read.listedBytes,
      readBytes: read.bytes,
      olderThanWindow: read.olderThanWindow,
      inProgress: read.inProgress,
      unreadableFiles: read.unreadableFiles.length,
      unreadableDirs: read.unreadableDirs.length,
      unknownSizeFiles: read.unknownSizeFiles,
      partialFiles: 0,
      skippedFiles: 0,
      brokenLines: sum2((missing) => missing.brokenLines),
      tooLongLines: sum2((missing) => missing.tooLongLines),
      tailFragments: sum2((missing) => missing.tailFragments),
      unreadableShare,
      lowerBound,
      partial: lowerBound || unreadableShare !== null && unreadableShare > PARTIAL_READ_SHARE,
      observation: found.observation
    };
  });
}

// src/core/result/hints.ts
var MENTION_HINT_MIN = 3;
var REPEATED_LINES_HINT_MIN = 3;
var LARGE_GLOBAL_TOKENS = ruleSpec("E4").fullAt;
var byText8 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function deepHints(input) {
  const hints = [];
  for (const tool of [...input.tools].sort((a, b) => byText8(a.tool, b.tool))) {
    const setup = tool.setup;
    const rootOf = new Map(setup.projects.map((project) => [project.normRoot, project.root]));
    const mentioned = Object.entries(setup.globalMentions).filter(([, count]) => count >= MENTION_HINT_MIN).map(([normRoot, count]) => ({ root: rootOf.get(normRoot) ?? normRoot, mentions: count })).sort((a, b) => byText8(a.root, b.root));
    if (mentioned.length > 0) hints.push({ kind: "global_mentions_project", tool: tool.tool, projects: mentioned });
    const global = new Set(setup.globalInstructions.lineHashes);
    const seen = /* @__PURE__ */ new Map();
    for (const project of setup.projects.filter((item) => item.exists && !item.excluded)) {
      for (const hash of new Set(project.instructions.lineHashes)) {
        if (global.has(hash)) continue;
        seen.set(hash, [...seen.get(hash) ?? [], project.root]);
      }
    }
    const repeated = [...seen.values()].filter((roots) => roots.length >= 2);
    if (repeated.length >= REPEATED_LINES_HINT_MIN) hints.push({ kind: "repeated_project_lines", tool: tool.tool, lines: repeated.length, projects: [...new Set(repeated.flat())].sort(byText8) });
    const { ascii, other } = setup.globalInstructions.chars;
    const tokens = ascii / 4 + other;
    if (tokens > LARGE_GLOBAL_TOKENS) hints.push({ kind: "large_global_instructions", tool: tool.tool, tokens });
  }
  return hints;
}

// src/core/result/notices.ts
var VERIFIED_VERSIONS = { "claude-code": { from: "2.1.220", to: "2.1.322" } };
var WEAK_REQUEST_SHARE = 0.1;
var NOTICE_KINDS = [
  "score_withheld",
  "state_reset",
  "record_unreadable",
  "observation_incomplete",
  "setup_unreadable",
  "plugins_uncounted",
  "setup_problems_unscored",
  "projects_gone",
  "version_unverified",
  "weak_human_requests",
  "overlapping_responses",
  "unclassified",
  "orphan_subsessions"
];
var byText9 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var inRange = (date, range) => date >= range.from && date <= range.to;
var toolOf = (notice) => "tool" in notice ? notice.tool : "";
function sortNotices(notices) {
  return notices.map((notice, index) => ({ notice, index })).sort((a, b) => NOTICE_KINDS.indexOf(a.notice.kind) - NOTICE_KINDS.indexOf(b.notice.kind) || byText9(toolOf(a.notice), toolOf(b.notice)) || a.index - b.index).map((item) => item.notice);
}
var unread2 = (status) => status === "unparsable" || status === "unreadable";
var sortedUnique = (values) => [...new Set(values)].sort(byText9);
function setupNotices(input, evaluation, run2) {
  const notices = [];
  if (evaluation.score.withheld.length > 0) notices.push({ kind: "score_withheld", reasons: [...evaluation.score.withheld] });
  if (run2.stateBroken) notices.push({ kind: "state_reset" });
  for (const tool of input.tools) {
    const id = tool.tool;
    const setup = tool.setup;
    const unreadable = [
      ["claude_json", unread2(setup.claudeJson), []],
      ["user_settings", unread2(setup.settings.user), []],
      ["managed_settings", false, setup.settings.managedParts.filter((part) => unread2(part.status)).map((part) => part.path)],
      ["project_settings", false, setup.projects.filter((project) => unread2(project.settingsStatus)).map((project) => project.root)],
      ["local_settings", false, setup.projects.filter((project) => unread2(project.localSettingsStatus)).map((project) => project.root)],
      ["mcp_json", false, setup.projects.filter((project) => unread2(project.mcpJsonStatus)).map((project) => project.root)],
      ["plugins_file", unread2(setup.pluginsFile), []],
      ["skill_dirs", false, setup.unreadableDirs],
      ["instructions", false, [setup.globalInstructions, ...setup.projects.map((project) => project.instructions)].flatMap((set) => [...set.unreadable, ...set.unreadableDirs])],
      ["hook_settings", false, setup.hooks.unreadableSettings],
      ["skill_files", false, setup.skills.filter((skill) => !skill.readable).map((skill) => skill.path)]
    ];
    for (const [what, whole, targets] of unreadable) {
      if (whole || targets.length > 0) notices.push({ kind: "setup_unreadable", tool: id, what, targets: sortedUnique(targets) });
    }
    const enabled = setup.plugins.filter((plugin) => plugin.enabled);
    const enabledIds = new Set(enabled.map((plugin) => plugin.id));
    const uncounted = [
      // 놓인 곳이 지금 없는 플러그인도 구성을 모른다. 2부는 이런 플러그인이 켜져 있으면 스킬 끄기와 서버 막기 후보를 막는다
      ["composition_unknown", enabled.filter((plugin) => !plugin.compositionKnown).map((plugin) => plugin.id)],
      ["not_installed", setup.pluginsWithoutInstall],
      ["skills_unreadable", setup.unreadableSkillPlaces.plugins.filter((id2) => enabledIds.has(id2))],
      ["mcp_unreadable", enabled.filter((plugin) => plugin.compositionKnown && plugin.mcpUnreadable).map((plugin) => plugin.id)],
      ["hooks_unreadable", enabled.filter((plugin) => plugin.compositionKnown && plugin.hooksUnreadable).map((plugin) => plugin.id)]
    ];
    for (const [why, plugins] of uncounted) {
      if (plugins.length > 0) notices.push({ kind: "plugins_uncounted", tool: id, why, plugins: sortedUnique(plugins) });
    }
    const problems = setup.problems.filter((problem) => problem.owner === "plugin" || problem.owner === "managed").map((problem) => ({ kind: problem.kind, path: problem.path }));
    if (problems.length > 0) notices.push({ kind: "setup_problems_unscored", tool: id, problems: problems.sort((a, b) => byText9(a.path, b.path) || byText9(a.kind, b.kind)) });
  }
  const gone = input.projects.filter((project) => !project.exists).map((project) => project.root);
  if (gone.length > 0) notices.push({ kind: "projects_gone", projects: sortedUnique(gone) });
  return sortNotices(notices);
}
function recordNotices(input, evaluation, collected) {
  const notices = [];
  for (const tool of input.tools) {
    const id = tool.tool;
    const found = collected.find((item) => item.tool === id);
    if (found !== void 0) {
      const { unreadableFiles, unreadableDirs } = found.read;
      if (unreadableFiles.length > 0 || unreadableDirs.length > 0) notices.push({ kind: "record_unreadable", tool: id, files: [...unreadableFiles].sort(byText9), dirs: [...unreadableDirs].sort(byText9) });
      for (const metric of ["skills", "mcp"]) {
        const observation = found.observation[metric];
        if (!observation.complete) notices.push({ kind: "observation_incomplete", tool: id, metric, reasons: [...observation.reasons] });
      }
      if (found.overlappingSessions > 0) notices.push({ kind: "overlapping_responses", tool: id, sessions: found.overlappingSessions });
    }
    const verified = VERIFIED_VERSIONS[id];
    const [from, to] = [parseVersion(verified.from), parseVersion(verified.to)];
    const outside2 = /* @__PURE__ */ new Map();
    for (const summary of tool.summaries) {
      const version = parseVersion(summary.version);
      if (version !== null && (compareVersions(version, from) < 0 || compareVersions(version, to) > 0)) outside2.set(summary.version, version);
    }
    if (outside2.size > 0) notices.push({ kind: "version_unverified", tool: id, versions: [...outside2].sort((a, b) => compareVersions(a[1], b[1])).map(([text]) => text), verified: { ...verified } });
    let total = 0;
    let weak = 0;
    for (const summary of tool.summaries) {
      if (summary.kind !== "main") continue;
      for (const [date, day] of Object.entries(summary.days)) {
        if (!inRange(date, evaluation.windows.score)) continue;
        total += day.humanRequests;
        weak += day.weakHumanRequests;
      }
    }
    if (total > 0 && weak / total > WEAK_REQUEST_SHARE) notices.push({ kind: "weak_human_requests", tool: id, weak, total });
    const counts = /* @__PURE__ */ new Map();
    const add = (what, count) => {
      if (count > 0) counts.set(what, (counts.get(what) ?? 0) + count);
    };
    for (const summary of tool.summaries) {
      for (const [kind, count] of Object.entries(summary.notes.unknownHookKinds)) add(`hook:${kind}`, count);
      for (const day of Object.values(summary.days)) {
        for (const [kind, count] of Object.entries(day.unknownDenialKinds)) add(`denial:${kind}`, count);
        add("compaction", day.unknownCompactions);
      }
    }
    if (counts.size > 0) notices.push({ kind: "unclassified", tool: id, counts: [...counts].sort((a, b) => byText9(a[0], b[0])).map(([what, count]) => ({ what, count })) });
    const orphans = tool.summaries.filter((summary) => summary.kind === "sub" && summary.parentSessionId === null).length;
    if (orphans > 0) notices.push({ kind: "orphan_subsessions", tool: id, sessions: orphans });
  }
  return sortNotices(notices);
}

// src/core/result/observed.ts
var RULE_METRICS = {
  S4: ["mcpFailuresAndHooks"],
  S5: ["mcpFailuresAndHooks"],
  E1: ["responsesAndTokens"],
  E2: ["toolErrors"],
  E3: ["autoCompaction"],
  E4: ["instructionSize"],
  E5: ["skillUsage"],
  E6: ["mcpCalls"],
  E7: ["deniedAndLengthStops", "interruptedTurns"],
  F1: ["effort"],
  F2: ["subagents", "autoCompaction"],
  F5: []
};
var STRENGTH = { unsupported: 0, proxy: 1, measured: 2 };
function observedOf(rule2, coverage) {
  return RULE_METRICS[rule2].reduce((weakest, key) => STRENGTH[coverage[key]] < STRENGTH[weakest] ? coverage[key] : weakest, "measured");
}

// src/core/result/tools.ts
var FORMATS = { "claude-code": ["claude-code-jsonl"] };
var inRange2 = (date, range) => date >= range.from && date <= range.to;
function resultTools(input, evaluation, collected) {
  return evaluation.tools.map((tool) => {
    const found = collected.find((item) => item.tool === tool.tool) ?? null;
    const summaries = input.tools.find((item) => item.tool === tool.tool)?.summaries ?? [];
    const subSessions = summaries.filter((summary) => summary.kind === "sub" && Object.entries(summary.days).some(([date, day]) => inRange2(date, evaluation.windows.score) && day.responses > 0)).length;
    const visibleFrom2 = found?.visibleFrom ?? null;
    return {
      tool: tool.tool,
      detected: found?.detected ?? false,
      scored: tool.scored,
      inCalendar: tool.inCalendar,
      formats: [...FORMATS[tool.tool]],
      mainSessions: tool.totals.mainSessions.length,
      subSessions,
      humanRequests: tool.totals.humanRequests,
      responses: tool.totals.responses,
      visible: visibleFrom2 === null ? null : { from: visibleFrom2, to: evaluation.windows.today }
    };
  });
}

// src/core/result/usage.ts
var inRange3 = (date, range) => date >= range.from && date <= range.to;
function shellCounts(tool, score) {
  if (tool.coverage.shellExitCodes === "unsupported") return null;
  const shell = new Set(tool.shellTools);
  let results = 0;
  let errors = 0;
  for (const summary of tool.summaries) {
    for (const [date, day] of Object.entries(summary.days)) {
      if (!inRange3(date, score)) continue;
      for (const [name, counts] of Object.entries(day.tools)) {
        if (!shell.has(name)) continue;
        results += counts.results;
        errors += counts.errors;
      }
    }
  }
  return { results, errors };
}
var share = (counts) => counts === null || counts.results === 0 ? null : counts.errors / counts.results;
function resultUsage(input, evaluation, collected) {
  const score = evaluation.windows.score;
  const e12 = evaluation.findings.find((finding) => finding.ruleId === "E1") ?? null;
  const scored2 = evaluation.tools.filter((tool) => tool.scored);
  const inputs = new Map(input.tools.map((tool) => [tool.tool, tool]));
  const byTool = scored2.map((tool) => ({
    tool: tool.tool,
    mainSessions: tool.totals.mainSessions.length,
    activeDays: tool.totals.activeDates.length,
    outputTokens: tool.totals.tokens.output,
    cacheHit: e12?.tools.find((value) => value.tool === tool.tool)?.value ?? null,
    shellNonZero: share(shellCounts(inputs.get(tool.tool), score))
  }));
  const shells = scored2.map((tool) => shellCounts(inputs.get(tool.tool), score)).filter((counts) => counts !== null);
  const responsesByDate = /* @__PURE__ */ new Map();
  for (const tool of input.tools) {
    for (const summary of tool.summaries) {
      for (const [date, day] of Object.entries(summary.days)) responsesByDate.set(date, (responsesByDate.get(date) ?? 0) + day.responses);
    }
  }
  const visibleFroms = collected.map((tool) => tool.visibleFrom).filter((date) => date !== null);
  const calendar = makeWindows(input.clock.nowMs, input.clock.timeZone).collectDates.map((date) => {
    const responses = responsesByDate.get(date) ?? 0;
    const state = responses > 0 ? "used" : visibleFroms.some((from) => from <= date) ? "unused" : "unseen";
    return { date, responses, state };
  });
  return {
    mainSessions: byTool.reduce((sum2, tool) => sum2 + tool.mainSessions, 0),
    activeDays: new Set(scored2.flatMap((tool) => tool.totals.activeDates)).size,
    outputTokens: byTool.reduce((sum2, tool) => sum2 + tool.outputTokens, 0),
    cacheHit: e12?.value ?? null,
    shellNonZero: shells.length === 0 ? null : share({ results: shells.reduce((sum2, counts) => sum2 + counts.results, 0), errors: shells.reduce((sum2, counts) => sum2 + counts.errors, 0) }),
    calendar,
    byTool
  };
}

// src/core/result/assemble.ts
var RESULT_SCHEMA = 1;
var byText10 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var textsOf = (make) => ({ en: make("en"), ko: make("ko") });
var SCOPE_ORDER3 = ["user", "local", "project", "plugin", "claude-ai"];
function unjudgedServers(input, evaluation) {
  const windows = makeWindows(input.clock.nowMs, input.clock.timeZone);
  const servers = [];
  for (const tool of evaluation.tools) {
    const source = input.tools.find((item) => item.tool === tool.tool);
    const called = calledMcpNames(source.summaries, windows);
    for (const judged of tool.servers) {
      const { server } = judged;
      if (!server.enabled || judged.verdict !== "unknown" || anyIn(server.recordNames, called.inCollect)) continue;
      const why = judged.excluded ?? (source.complete.mcp ? "not_established" : "observation_incomplete");
      servers.push({ tool: tool.tool, name: server.name, scope: server.scope, projectRoot: server.projectRoot, pluginId: server.pluginId, why });
    }
  }
  return servers.sort((a, b) => byText10(a.name, b.name) || SCOPE_ORDER3.indexOf(a.scope) - SCOPE_ORDER3.indexOf(b.scope) || byText10(a.projectRoot ?? "", b.projectRoot ?? "") || byText10(a.pluginId ?? "", b.pluginId ?? "") || byText10(a.tool, b.tool));
}
function checkupResult(source) {
  const { input, evaluation, collected } = source;
  const coverageByTool = new Map(input.tools.map((tool) => [tool.tool, tool.coverage]));
  const details = { safeguards: evaluation.safeguards, missingInstructions: evaluation.missingInstructions, worstOverlap: evaluation.worstOverlap, unjudgedServers: unjudgedServers(input, evaluation) };
  const findings = evaluation.findings.map((finding) => {
    const source2 = { ...finding, tools: finding.tools.map((value) => ({ ...value, observed: observedOf(finding.ruleId, coverageByTool.get(value.tool)) })) };
    return { ...source2, text: textsOf((lang) => findingText(source2, details, lang)) };
  });
  const notices = sortNotices([...recordNotices(input, evaluation, collected), ...setupNotices(input, evaluation, source.run)]);
  const categories = findings.map((finding) => finding.category);
  return {
    schema: RESULT_SCHEMA,
    rulesVersion: evaluation.rulesVersion,
    appVersion: source.appVersion,
    evaluatedAt: new Date(input.clock.nowMs).toISOString(),
    timezone: input.clock.timeZone,
    lang: source.lang,
    window: evaluation.windows,
    tools: resultTools(input, evaluation, collected),
    coverage: resultCoverage(input, collected),
    score: evaluation.score,
    text: textsOf((lang) => resultText(evaluation.score, categories, lang)),
    axes: evaluation.axes,
    findings,
    candidates: evaluation.candidates,
    usage: resultUsage(input, evaluation, collected),
    deepHints: deepHints(input),
    notices: notices.map((notice) => ({ ...notice, text: textsOf((lang) => noticeText(notice, lang)) })),
    details
  };
}

// src/core/result/summary.ts
var FIX_FIRST_LIMIT = 3;
function summaryNotice(notice) {
  const tool = "tool" in notice ? notice.tool : null;
  switch (notice.kind) {
    case "score_withheld":
    case "state_reset":
      return { kind: notice.kind, tool, detail: null, count: null };
    case "record_unreadable":
      return { kind: notice.kind, tool, detail: null, count: notice.files.length + notice.dirs.length };
    case "observation_incomplete":
      return { kind: notice.kind, tool, detail: notice.metric, count: null };
    case "setup_unreadable":
      return { kind: notice.kind, tool, detail: notice.what, count: notice.targets.length > 0 ? notice.targets.length : null };
    case "plugins_uncounted":
      return { kind: notice.kind, tool, detail: notice.why, count: notice.plugins.length };
    case "setup_problems_unscored":
      return { kind: notice.kind, tool, detail: null, count: notice.problems.length };
    case "projects_gone":
      return { kind: notice.kind, tool, detail: null, count: notice.projects.length };
    case "version_unverified":
      return { kind: notice.kind, tool, detail: null, count: notice.versions.length };
    case "weak_human_requests":
      return { kind: notice.kind, tool, detail: null, count: notice.weak };
    case "overlapping_responses":
    case "orphan_subsessions":
      return { kind: notice.kind, tool, detail: null, count: notice.sessions };
    case "unclassified":
      return { kind: notice.kind, tool, detail: null, count: notice.counts.reduce((sum2, item) => sum2 + item.count, 0) };
  }
}
function fixDetail(fix, lang) {
  const copy = SUMMARY_COPY[lang];
  if (fix.gain !== null) return fill(copy.gain, { axis: AXIS_NAMES[fix.axis][lang], gain: fix.gain });
  if (!fix.measured) return fill(copy.unmeasured, { candidates: fix.candidates });
  if (fix.unmeasuredTools.length > 0) return fill(copy.otherTools, { candidates: fix.candidates, tools: fix.unmeasuredTools.map((tool) => TOOL_NAMES[tool][lang]).join(", ") });
  return fill(copy.candidates, { candidates: fix.candidates });
}
function checkupSummary(result, reportPath) {
  const lang = result.lang;
  const strength = result.findings.find((finding) => finding.category === "strength") ?? null;
  const repairs = result.findings.filter((finding) => finding.category === "repair").slice(0, FIX_FIRST_LIMIT);
  const fixFirst = repairs.map((finding) => ({
    ruleId: finding.ruleId,
    axis: finding.axis,
    gain: finding.gain,
    measured: finding.status === "scored",
    candidates: finding.candidates.length,
    unmeasuredTools: finding.tools.filter((value) => value.status === "unmeasured" && value.candidates.length > 0).map((value) => value.tool)
  }));
  return {
    aq: result.score.aq,
    grade: result.score.grade,
    tier: result.score.tier,
    withheld: [...result.score.withheld],
    axes: result.axes.map((axis) => ({ axis: axis.axis, score: axis.score })),
    best: strength === null ? null : { ruleId: strength.ruleId, axis: strength.axis, kind: strength.kind, value: strength.value },
    fixFirst,
    notices: result.notices.map(summaryNotice),
    reportPath,
    lang,
    text: {
      grade: result.text[lang].grade,
      diagnosis: result.text[lang].diagnosis,
      best: strength === null ? null : { title: strength.text[lang].title, detail: fill(SUMMARY_COPY[lang].best, { name: strength.text[lang].name, value: joinValue(strength.text[lang].value, strength.text[lang].unit, lang) }) },
      noBest: result.text[lang].noStrengths,
      fixFirst: repairs.map((finding, index) => ({ title: finding.text[lang].title, detail: fixDetail(fixFirst[index], lang) })),
      noFixFirst: result.text[lang].noRepairs,
      notices: result.notices.map((notice) => notice.text[lang])
    }
  };
}

// src/state/cache.ts
import { createHash } from "node:crypto";
import { lstat as lstat2, mkdir, open, readdir as readdir3, readFile, realpath as realpath2, rename, writeFile } from "node:fs/promises";
import { join as join3 } from "node:path";

// src/adapters/claude/locate.ts
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
function claudeHome(env, homedir2) {
  const fromEnv = env.CLAUDE_CONFIG_DIR?.trim();
  return fromEnv ? resolve(fromEnv) : join(homedir2, ".claude");
}
function normalizePath(path, platform = process.platform) {
  const absolute = resolve(path).replace(/\\/g, "/");
  return platform === "win32" ? absolute.toLowerCase() : absolute;
}
var isMissing = (error) => error?.code === "ENOENT";
async function listClaudeFiles(home, minMtimeMs) {
  const projects = join(home, "projects");
  const files = [];
  const unreadableDirs = [];
  const unreadableFiles = [];
  let olderThanWindow = 0;
  let projectEntries;
  try {
    projectEntries = await readdir(projects, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return { projectsFound: false, files: [], olderThanWindow: 0, unreadableDirs: [], unreadableFiles: [] };
    return { projectsFound: true, files: [], olderThanWindow: 0, unreadableDirs: [projects], unreadableFiles: [] };
  }
  const consider = async (path, sessionId, kind, parentSessionId) => {
    try {
      const info = await stat(path);
      if (minMtimeMs !== null && info.mtimeMs < minMtimeMs) {
        olderThanWindow++;
        return;
      }
      files.push({ path, normPath: normalizePath(path), size: info.size, mtimeMs: info.mtimeMs, sessionId, kind, parentSessionId });
    } catch {
      unreadableFiles.push(path);
    }
  };
  for (const project of projectEntries) {
    if (!project.isDirectory()) continue;
    const projectDir = join(projects, project.name);
    let entries;
    try {
      entries = await readdir(projectDir, { withFileTypes: true });
    } catch {
      unreadableDirs.push(projectDir);
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        await consider(join(projectDir, entry.name), entry.name.slice(0, -".jsonl".length), "main", null);
        continue;
      }
      if (!entry.isDirectory()) continue;
      const subDir = join(projectDir, entry.name, "subagents");
      let subs;
      try {
        subs = await readdir(subDir, { withFileTypes: true });
      } catch (error) {
        if (!isMissing(error)) unreadableDirs.push(subDir);
        continue;
      }
      for (const sub of subs) {
        if (sub.isFile() && sub.name.endsWith(".jsonl")) {
          await consider(join(subDir, sub.name), sub.name.slice(0, -".jsonl".length), "sub", entry.name);
        }
      }
    }
  }
  files.sort((a, b) => a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0);
  unreadableDirs.sort();
  unreadableFiles.sort();
  return { projectsFound: true, files, olderThanWindow, unreadableDirs, unreadableFiles };
}

// src/adapters/common/canonical.ts
function nameRecord() {
  return /* @__PURE__ */ Object.create(null);
}
function sortedRecord(record) {
  const out = nameRecord();
  for (const key of Object.keys(record).sort()) out[key] = record[key];
  return out;
}

// src/adapters/types.ts
function emptyToolCounts() {
  return { calls: 0, results: 0, errors: 0, deniedByUser: 0, deniedByPermission: 0, deniedByHook: 0, interrupted: 0, unknownDenial: 0 };
}
function emptySkillSignalCounts() {
  return { tool: 0, attribution: 0, slash: 0, injected: 0 };
}
function emptyHookCounts() {
  return { runs: 0, failures: 0, unclassifiedBlocks: 0 };
}
function emptyDay() {
  return {
    humanRequests: 0,
    weakHumanRequests: 0,
    nonHumanInputs: nameRecord(),
    permissionModes: nameRecord(),
    responses: 0,
    tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0 },
    models: nameRecord(),
    efforts: nameRecord(),
    unknownEffort: 0,
    tools: nameRecord(),
    unknownDenialKinds: nameRecord(),
    autoCompactions: 0,
    unknownCompactions: 0,
    lengthStops: 0,
    interruptedTurns: 0,
    subagentCalls: 0,
    mcpConnectionFailure: false,
    skillSignals: nameRecord(),
    mcpCalls: nameRecord(),
    mcpAttributions: nameRecord(),
    hooks: nameRecord(),
    loadedSkills: [],
    loadedMcpServers: [],
    reloadedSkills: [],
    reloadedMcpServers: []
  };
}
function canonicalDay(day) {
  return {
    ...day,
    nonHumanInputs: sortedRecord(day.nonHumanInputs),
    permissionModes: sortedRecord(day.permissionModes),
    models: sortedRecord(day.models),
    efforts: sortedRecord(day.efforts),
    tools: sortedRecord(day.tools),
    unknownDenialKinds: sortedRecord(day.unknownDenialKinds),
    skillSignals: sortedRecord(day.skillSignals),
    mcpCalls: sortedRecord(day.mcpCalls),
    mcpAttributions: sortedRecord(day.mcpAttributions),
    hooks: sortedRecord(day.hooks)
  };
}
var DAY_SHAPE = {
  humanRequests: "number",
  weakHumanRequests: "number",
  nonHumanInputs: "numbers",
  permissionModes: "numbers",
  responses: "number",
  tokens: "tokens",
  models: "numbers",
  efforts: "numbers",
  unknownEffort: "number",
  tools: "tools",
  unknownDenialKinds: "numbers",
  autoCompactions: "number",
  unknownCompactions: "number",
  lengthStops: "number",
  interruptedTurns: "number",
  subagentCalls: "number",
  mcpConnectionFailure: "boolean",
  skillSignals: "skills",
  mcpCalls: "numbers",
  mcpAttributions: "numbers",
  hooks: "hooks",
  loadedSkills: "names",
  loadedMcpServers: "names",
  reloadedSkills: "names",
  reloadedMcpServers: "names"
};
var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
var isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var isNumber = (v) => typeof v === "number" && Number.isFinite(v);
var isNullableString = (v) => v === null || typeof v === "string";
function fixed(v, fields) {
  if (!isObject(v)) return null;
  const out = {};
  for (const field of fields) {
    const x = v[field];
    if (!isNumber(x)) return null;
    out[field] = x;
  }
  return out;
}
function named(v, each) {
  if (!isObject(v)) return null;
  const out = nameRecord();
  for (const key of Object.keys(v).sort()) {
    const x = each(v[key]);
    if (x === null) return null;
    out[key] = x;
  }
  return out;
}
function names(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? [...v] : null;
}
function reviveValue(v, shape) {
  switch (shape) {
    case "number":
      return isNumber(v) ? v : null;
    case "boolean":
      return typeof v === "boolean" ? v : null;
    case "names":
      return names(v);
    case "numbers":
      return named(v, (x) => isNumber(x) ? x : null);
    case "tokens":
      return fixed(v, Object.keys(emptyDay().tokens));
    case "tools":
      return named(v, (x) => fixed(x, Object.keys(emptyToolCounts())));
    case "skills":
      return named(v, (x) => fixed(x, Object.keys(emptySkillSignalCounts())));
    case "hooks":
      return named(v, (x) => fixed(x, Object.keys(emptyHookCounts())));
  }
}
function reviveDay(v) {
  if (!isObject(v)) return null;
  const out = {};
  for (const key of Object.keys(emptyDay())) {
    const value = reviveValue(v[key], DAY_SHAPE[key]);
    if (value === null) return null;
    out[key] = value;
  }
  return out;
}
function reviveSummary(value) {
  if (!isObject(value)) return null;
  const v = value;
  if (v.tool !== "claude-code" || typeof v.sessionId !== "string" || v.kind !== "main" && v.kind !== "sub") return null;
  if (!isNullableString(v.parentSessionId) || !isNullableString(v.cwd) || !isNullableString(v.version)) return null;
  if (!isNullableString(v.firstDate) || v.firstDate !== null && !DATE_KEY.test(v.firstDate)) return null;
  if (!isObject(v.days)) return null;
  const days = {};
  for (const date of Object.keys(v.days).sort()) {
    const day = DATE_KEY.test(date) ? reviveDay(v.days[date]) : null;
    if (day === null) return null;
    days[date] = day;
  }
  const instructionChars = v.instructionChars === null ? null : fixed(v.instructionChars, ["ascii", "other"]);
  if (v.instructionChars !== null && instructionChars === null) return null;
  const missing = fixed(v.missing, ["lines", "brokenLines", "tailFragments", "tooLongLines"]);
  const unconfirmedTypes = isObject(v.missing) ? named(v.missing.unconfirmedTypes, (x) => isNumber(x) ? x : null) : null;
  const notes = fixed(v.notes, ["syntheticResponses", "responsesWithoutId", "undatedLines"]);
  const unknownHookKinds = isObject(v.notes) ? named(v.notes.unknownHookKinds, (x) => isNumber(x) ? x : null) : null;
  const hashes = names(v.firstResponseIdHashes);
  const initialSkills = v.initialSkills === null ? null : names(v.initialSkills);
  const initialMcpServers = v.initialMcpServers === null ? null : names(v.initialMcpServers);
  if (missing === null || unconfirmedTypes === null || notes === null || unknownHookKinds === null || hashes === null) return null;
  if (v.initialSkills !== null && initialSkills === null || v.initialMcpServers !== null && initialMcpServers === null) return null;
  return {
    tool: v.tool,
    sessionId: v.sessionId,
    kind: v.kind,
    parentSessionId: v.parentSessionId,
    cwd: v.cwd,
    version: v.version,
    firstDate: v.firstDate,
    days,
    instructionChars: instructionChars === null ? null : { ascii: instructionChars.ascii, other: instructionChars.other },
    initialSkills,
    initialMcpServers,
    missing: {
      lines: missing.lines,
      brokenLines: missing.brokenLines,
      tailFragments: missing.tailFragments,
      tooLongLines: missing.tooLongLines,
      unconfirmedTypes
    },
    firstResponseIdHashes: hashes,
    notes: {
      syntheticResponses: notes.syntheticResponses,
      responsesWithoutId: notes.responsesWithoutId,
      undatedLines: notes.undatedLines,
      unknownHookKinds
    }
  };
}

// src/state/folder.ts
import { lstat, readdir as readdir2, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join as join2, relative } from "node:path";
var STATE_DIR_NAME = ".chunsik-garage";
function stateDir(homedir2) {
  return join2(homedir2, STATE_DIR_NAME);
}
var STATE_ENTRIES = [
  { name: "cache", kind: "dir", removedBy: "clean" },
  { name: "reports", kind: "dir", removedBy: "clean" },
  { name: "history.jsonl", kind: "file", removedBy: "all" },
  { name: "state.json", kind: "file", removedBy: "all" },
  { name: "notified", kind: "dir", removedBy: "all" },
  { name: "tune", kind: "dir", removedBy: "all" }
];
var isMissing2 = (error) => error?.code === "ENOENT";
async function treeSize(path) {
  const total = { files: 0, bytes: 0, links: 0 };
  const walk = async (current) => {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing2(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      total.links++;
      return;
    }
    if (info.isDirectory()) {
      for (const name of (await readdir2(current)).sort()) await walk(join2(current, name));
      return;
    }
    total.files++;
    total.bytes += info.size;
  };
  await walk(path);
  return total;
}
async function removeLink(path) {
  try {
    await unlink(path);
  } catch (error) {
    const code = error.code;
    if (code === "EPERM" || code === "EISDIR") {
      await rmdir(path);
      return;
    }
    throw error;
  }
}
async function expectedRealDir(dir) {
  return normalizePath(join2(await realpath(dirname(dir)), basename(dir)));
}
var outside = (path) => Object.assign(new Error(`outside of the state folder: ${path}`), { code: "EOUTSIDE" });
async function assertInside(path, boundary, allowEqual) {
  const real = normalizePath(await realpath(path));
  if (real === boundary ? allowEqual : real.startsWith(`${boundary}/`)) return;
  throw outside(path);
}
async function removeFiles(paths, root, boundary) {
  const report = { removed: 0, linked: 0 };
  for (const path of paths) {
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if (isMissing2(error)) continue;
      throw error;
    }
    if (!info.isFile()) continue;
    const parent = dirname(path);
    await assertInside(parent, boundary, true);
    if (normalizePath(await realpath(parent)) !== normalizePath(join2(boundary, relative(root, parent)))) {
      report.linked++;
      continue;
    }
    await unlink(path);
    report.removed++;
  }
  return report;
}
async function removeTree(path, boundary) {
  const removed = { files: 0, bytes: 0, links: 0 };
  const walk = async (current) => {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing2(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      await assertInside(dirname(current), boundary, true);
      await removeLink(current);
      removed.links++;
      return;
    }
    if (info.isDirectory()) {
      await assertInside(current, boundary, false);
      for (const name of await readdir2(current)) await walk(join2(current, name));
      await assertInside(current, boundary, false);
      await rmdir(current);
      return;
    }
    await assertInside(dirname(current), boundary, true);
    await unlink(current);
    removed.files++;
    removed.bytes += info.size;
  };
  await walk(path);
  return removed;
}

// src/state/cache.ts
var CACHE_FORMAT_VERSION = 1;
var EDGE_BYTES = 4096;
var sha256 = (data) => createHash("sha256").update(data).digest("hex");
async function cacheKeyFor(file, parser, timeZone) {
  const handle = await open(file.path, "r");
  try {
    const length = Math.min(EDGE_BYTES, file.size);
    const head = Buffer.alloc(length);
    const tail = Buffer.alloc(length);
    if (length > 0) {
      await handle.read(head, 0, length, 0);
      await handle.read(tail, 0, length, file.size - length);
    }
    return {
      normPath: file.normPath,
      size: file.size,
      mtimeMs: file.mtimeMs,
      head: sha256(head),
      tail: sha256(tail),
      cacheFormat: CACHE_FORMAT_VERSION,
      parser,
      timeZone
    };
  } finally {
    await handle.close();
  }
}
function sameKey(a, b) {
  return a.normPath === b.normPath && a.size === b.size && a.mtimeMs === b.mtimeMs && a.head === b.head && a.tail === b.tail && a.cacheFormat === b.cacheFormat && a.parser === b.parser && a.timeZone === b.timeZone;
}
function entryPath(dir, normPath) {
  return join3(dir, `${sha256(normPath).slice(0, 32)}.json`);
}
async function loadCached(dir, key) {
  try {
    const entry = JSON.parse(await readFile(entryPath(dir, key.normPath), "utf8"));
    if (entry.key === void 0 || typeof entry.bytesRead !== "number" || !sameKey(entry.key, key)) return null;
    const summary = reviveSummary(entry.summary);
    return summary === null ? null : { key: entry.key, summary, bytesRead: entry.bytesRead };
  } catch {
    return null;
  }
}
async function storeCached(dir, entry) {
  await mkdir(dir, { recursive: true });
  const target = entryPath(dir, entry.key.normPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(entry));
  await rename(temporary, target);
}
var ENTRY_NAME = /^[0-9a-f]{32}\.json$/;
async function readCacheEntry(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { status: "unreadable" };
  }
  let normPath;
  try {
    normPath = JSON.parse(text)?.key?.normPath;
  } catch {
    return { status: "broken" };
  }
  return typeof normPath === "string" && normPath !== "" ? { status: "ok", normPath } : { status: "broken" };
}
async function isStaleCacheEntry(path) {
  const entry = await readCacheEntry(path);
  if (entry.status === "unreadable") return false;
  if (entry.status === "broken") return true;
  try {
    await lstat2(entry.normPath);
    return false;
  } catch (error) {
    return error.code === "ENOENT";
  }
}
async function staleCacheEntries(stateDir2) {
  let dirInfo;
  try {
    dirInfo = await lstat2(stateDir2);
  } catch (error) {
    if (error.code === "ENOENT") return { skipped: null, boundary: null, paths: [] };
    throw error;
  }
  const boundary = await expectedRealDir(stateDir2);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath2(stateDir2)) !== boundary) return { skipped: "state", boundary: null, paths: [] };
  const cacheDir = join3(stateDir2, "cache");
  let info;
  try {
    info = await lstat2(cacheDir);
  } catch (error) {
    if (error.code === "ENOENT") return { skipped: null, boundary, paths: [] };
    throw error;
  }
  if (info.isSymbolicLink()) return { skipped: "cache", boundary: null, paths: [] };
  if (!info.isDirectory()) return { skipped: null, boundary, paths: [] };
  const paths = [];
  for (const tool of (await readdir3(cacheDir)).sort()) {
    const toolDir = join3(cacheDir, tool);
    if (!(await lstat2(toolDir)).isDirectory()) continue;
    for (const name of (await readdir3(toolDir)).sort()) {
      if (!ENTRY_NAME.test(name)) continue;
      const path = join3(toolDir, name);
      if (!(await lstat2(path)).isFile()) continue;
      if (await isStaleCacheEntry(path)) paths.push(path);
    }
  }
  return { skipped: null, boundary, paths };
}
async function pruneCache(stateDir2) {
  const stale = await staleCacheEntries(stateDir2);
  if (stale.boundary === null || stale.paths.length === 0) return { removed: 0, skipped: stale.skipped };
  const result = await removeFiles(stale.paths, stateDir2, stale.boundary);
  return { removed: result.removed, skipped: result.linked > 0 ? "cache" : null };
}

// src/state/history.ts
import { appendFile, mkdir as mkdir2, open as open2 } from "node:fs/promises";
import { join as join4 } from "node:path";
var HISTORY_FILE = "history.jsonl";
function historyEntry(evaluation, nowMs) {
  const byAxis = new Map(evaluation.axes.map((axis) => [axis.axis, axis.score]));
  const axes = Object.fromEntries(AXES.map((axis) => [axis, byAxis.get(axis) ?? null]));
  return { at: new Date(nowMs).toISOString(), aq: evaluation.score.aq, axes, missingAxes: [...evaluation.score.missingAxes], rulesVersion: evaluation.rulesVersion };
}
async function endsMidLine(path) {
  let handle;
  try {
    handle = await open2(path, "r");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  try {
    const { size } = await handle.stat();
    if (size === 0) return false;
    const last = Buffer.alloc(1);
    await handle.read(last, 0, 1, size - 1);
    return last[0] !== 10;
  } finally {
    await handle.close();
  }
}
async function appendHistory(stateDir2, entry) {
  await mkdir2(stateDir2, { recursive: true });
  const path = join4(stateDir2, HISTORY_FILE);
  const prefix = await endsMidLine(path) ? "\n" : "";
  await appendFile(path, `${prefix}${JSON.stringify(entry)}
`);
}

// src/scan/identity.ts
import { join as join5 } from "node:path";

// src/state/observations.ts
function installKey(parts) {
  return JSON.stringify(parts);
}
function updateInstalls(previous, currentKeys, today, keepUnseen = () => false) {
  const before = new Map((previous ?? []).map((record) => [record.key, record]));
  const firstCheckup = previous === null;
  const current = new Set(currentKeys);
  const records = [...current].map((key) => before.get(key) ?? { key, firstSeen: today, appeared: !firstCheckup });
  for (const record of previous ?? []) {
    if (!current.has(record.key) && keepUnseen(record.key)) records.push(record);
  }
  return records.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

// src/scan/identity.ts
function skillInstallKey(skill) {
  return installKey(["skill", "claude-code", skill.scope, skill.projectRoot ?? "", skill.name, skill.realPath ?? normalizePath(skill.path)]);
}
function mcpInstallKey(server) {
  if (server.definitionHash === null) return null;
  return installKey(["mcp", "claude-code", server.scope, server.projectRoot ?? "", server.pluginId ?? "", server.name, server.definitionHash]);
}
function installKeysOf(facts) {
  const keys = facts.skills.map(skillInstallKey);
  for (const server of facts.mcpServers) {
    const key = mcpInstallKey(server);
    if (key !== null) keys.push(key);
  }
  return [...new Set(keys)].sort();
}
var unread3 = (status) => status === "unparsable" || status === "unreadable";
var inside = (path, base) => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);
function unseenInUnreadablePlace(facts) {
  const unreadableDirs = facts.unreadableDirs.map((dir) => normalizePath(dir));
  const linkedRoots = facts.plugins.flatMap((plugin) => {
    const shown = normalizePath(plugin.installPath);
    return plugin.installRealPath === null || plugin.installRealPath === shown ? [] : [{ shown, real: plugin.installRealPath }];
  });
  const unreadablePluginDirs = unreadableDirs.flatMap((dir) => [dir, ...linkedRoots.filter((root) => inside(dir, root.shown)).map((root) => `${root.real}${dir.slice(root.shown.length)}`)]);
  const userSkillsDir = normalizePath(join5(facts.home, "skills"));
  const scanned2 = new Map(facts.projects.filter((project) => project.exists && !project.excluded).map((project) => [project.normRoot, project]));
  const claudeJsonUnread = unread3(facts.claudeJson);
  const pluginsFileUnread = unread3(facts.pluginsFile);
  const unknownPluginRoots = facts.plugins.filter((plugin) => plugin.exists && !plugin.compositionKnown).map((plugin) => plugin.installRealPath ?? normalizePath(plugin.installPath));
  const mcpUnreadPlugins = new Set(facts.plugins.filter((plugin) => plugin.exists && plugin.mcpUnreadable).map((plugin) => plugin.id));
  return (key) => {
    let parsed;
    try {
      parsed = JSON.parse(key);
    } catch {
      return false;
    }
    if (!Array.isArray(parsed) || !parsed.every((part) => typeof part === "string") || parsed[1] !== "claude-code") return false;
    const scope = parsed[2] ?? "";
    const projectRoot = parsed[3] ?? "";
    if (parsed[0] === "skill" && parsed.length === 6) {
      const realPath = parsed[5] ?? "";
      if (scope === "user") return unreadableDirs.includes(userSkillsDir);
      if (scope === "project") {
        const project = scanned2.get(projectRoot);
        return project !== void 0 && unreadableDirs.includes(normalizePath(join5(project.root, ".claude", "skills")));
      }
      if (scope === "plugin") return pluginsFileUnread || unknownPluginRoots.some((root) => inside(realPath, root)) || unreadablePluginDirs.some((dir) => inside(realPath, dir));
      return false;
    }
    if (parsed[0] === "mcp" && parsed.length === 7) {
      if (scope === "user") return claudeJsonUnread;
      if (scope === "local") return scanned2.has(projectRoot) && claudeJsonUnread;
      if (scope === "project") return unread3(scanned2.get(projectRoot)?.mcpJsonStatus);
      if (scope === "plugin") return pluginsFileUnread || mcpUnreadPlugins.has(parsed[4] ?? "");
      return false;
    }
    return false;
  };
}

// src/state/state.ts
import { randomBytes } from "node:crypto";
import { mkdir as mkdir3, readFile as readFile2, rename as rename2, rm, writeFile as writeFile2 } from "node:fs/promises";
import { join as join6 } from "node:path";
var STATE_SCHEMA = 1;
var STATE_FILE = "state.json";
var DATE = /^\d{4}-\d{2}-\d{2}$/;
var SALT = /^[0-9a-f]{64}$/;
function newState() {
  return { schema: STATE_SCHEMA, salt: randomBytes(32).toString("hex"), lastCheckupAt: null, installs: null };
}
function reviveRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value;
  if (typeof v.key !== "string" || typeof v.firstSeen !== "string" || !DATE.test(v.firstSeen) || typeof v.appeared !== "boolean") return null;
  return { key: v.key, firstSeen: v.firstSeen, appeared: v.appeared };
}
function reviveState(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value;
  if (v.schema !== STATE_SCHEMA || typeof v.salt !== "string" || !SALT.test(v.salt)) return null;
  if (v.lastCheckupAt !== null && (typeof v.lastCheckupAt !== "string" || !Number.isFinite(Date.parse(v.lastCheckupAt)))) return null;
  let installs = null;
  if (v.installs !== null) {
    if (!Array.isArray(v.installs)) return null;
    installs = [];
    for (const item of v.installs) {
      const record = reviveRecord(item);
      if (record === null) return null;
      installs.push(record);
    }
    installs.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }
  return { schema: STATE_SCHEMA, salt: v.salt, lastCheckupAt: v.lastCheckupAt, installs };
}
async function loadState(dir) {
  let text;
  try {
    text = await readFile2(join6(dir, STATE_FILE), "utf8");
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "missing" };
    return { status: "broken" };
  }
  try {
    const state = reviveState(JSON.parse(text));
    return state === null ? { status: "broken" } : { status: "ok", state };
  } catch {
    return { status: "broken" };
  }
}
async function saveState(dir, state) {
  await mkdir3(dir, { recursive: true });
  const target = join6(dir, STATE_FILE);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile2(temporary, `${JSON.stringify(state, null, 2)}
`);
    await rename2(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => void 0);
    throw error;
  }
}

// src/state/next-state.ts
async function openState(stateDir2) {
  const loaded = await loadState(stateDir2);
  if (loaded.status === "ok") return { state: loaded.state, fresh: false, broken: false };
  return { state: newState(), fresh: loaded.status === "missing", broken: loaded.status === "broken" };
}
function nextState(state, facts, today, startedAt) {
  return { ...state, lastCheckupAt: startedAt, installs: updateInstalls(state.installs, installKeysOf(facts), today, unseenInUnreadablePlace(facts)) };
}

// src/state/reports.ts
import { lstat as lstat3, mkdir as mkdir4, readdir as readdir4, realpath as realpath3, rename as rename3, rm as rm2, writeFile as writeFile3 } from "node:fs/promises";
import { join as join7 } from "node:path";
var REPORTS_DIR = "reports";
var KEEP_REPORTS = 20;
var TEMP_PREFIX = "chunsik-garage-result-";
var STAMPED = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.(json|html)$/;
function resultStamp(nowMs) {
  return new Date(nowMs).toISOString().replace(/[:.]/g, "-");
}
async function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile3(temporary, `${JSON.stringify(value, null, 2)}
`);
    await rename3(temporary, path);
  } catch (error) {
    await rm2(temporary, { force: true }).catch(() => void 0);
    throw error;
  }
}
async function writeResult(stateDir2, stamp, result) {
  const reports = join7(stateDir2, REPORTS_DIR);
  await mkdir4(reports, { recursive: true });
  const path = join7(reports, `${stamp}.json`);
  await writeJson(path, result);
  return path;
}
async function writeTempResult(tmpdir2, stamp, result) {
  const path = join7(tmpdir2, `${TEMP_PREFIX}${stamp}.json`);
  await writeJson(path, result);
  return path;
}
async function staleReports(stateDir2, keep = KEEP_REPORTS, keepStamp = null) {
  let dirInfo;
  try {
    dirInfo = await lstat3(stateDir2);
  } catch (error) {
    if (error.code === "ENOENT") return { skipped: null, boundary: null, paths: [] };
    throw error;
  }
  const boundary = await expectedRealDir(stateDir2);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath3(stateDir2)) !== boundary) return { skipped: "state", boundary: null, paths: [] };
  const reports = join7(stateDir2, REPORTS_DIR);
  let info;
  try {
    info = await lstat3(reports);
  } catch (error) {
    if (error.code === "ENOENT") return { skipped: null, boundary, paths: [] };
    throw error;
  }
  if (info.isSymbolicLink()) return { skipped: "reports", boundary: null, paths: [] };
  if (!info.isDirectory()) return { skipped: null, boundary, paths: [] };
  const files = [];
  for (const name of await readdir4(reports)) {
    const match = STAMPED.exec(name);
    if (match === null) continue;
    if ((await lstat3(join7(reports, name))).isFile()) files.push({ name, stamp: match[1] });
  }
  const stamps = new Set(files.map((file) => file.stamp));
  const others = [...stamps].filter((stamp) => stamp !== keepStamp).sort().reverse();
  const kept = new Set(keepStamp !== null && stamps.has(keepStamp) ? [keepStamp, ...others.slice(0, Math.max(keep - 1, 0))] : others.slice(0, keep));
  const paths = files.filter((file) => !kept.has(file.stamp)).map((file) => join7(reports, file.name)).sort();
  return { skipped: null, boundary, paths };
}
async function pruneReports(stateDir2, keep = KEEP_REPORTS, keepStamp = null) {
  const stale = await staleReports(stateDir2, keep, keepStamp);
  if (stale.boundary === null || stale.paths.length === 0) return { removed: 0, skipped: stale.skipped };
  const result = await removeFiles(stale.paths, stateDir2, stale.boundary);
  return { removed: result.removed, skipped: result.linked > 0 ? "reports" : null };
}

// src/version.ts
var PROGRAM_VERSION = "0.1.0";

// src/adapters/claude/observation.ts
var CLAUDE_COVERAGE = {
  responsesAndTokens: "measured",
  humanRequests: "measured",
  toolCalls: "measured",
  toolErrors: "measured",
  shellExitCodes: "measured",
  deniedAndLengthStops: "measured",
  interruptedTurns: "measured",
  autoCompaction: "measured",
  effort: "measured",
  loadedNames: "measured",
  skillUsage: "measured",
  mcpCalls: "measured",
  mcpFailuresAndHooks: "measured",
  instructionSize: "measured",
  subagents: "measured"
};
var SKILL_NON_SIGNAL_TYPES = /* @__PURE__ */ new Set([
  "system",
  "api-request",
  "api-request-blob",
  "mode",
  "permission-mode",
  "ai-title",
  "session-owner",
  "pr-link",
  "last-prompt",
  "cost-state"
]);
var MCP_NON_SIGNAL_TYPES = /* @__PURE__ */ new Set([...SKILL_NON_SIGNAL_TYPES, "user", "attachment"]);
var REASON_ORDER = ["unreadable-files", "too-long-lines", "unconfirmed-pieces"];
function mostlyBroken(summary) {
  return summary.missing.brokenLines * 2 > summary.missing.lines;
}
function claudeObservation(summaries, unreadableCount2, metric) {
  const harmless = metric === "skill" ? SKILL_NON_SIGNAL_TYPES : MCP_NON_SIGNAL_TYPES;
  const found = /* @__PURE__ */ new Set();
  if (unreadableCount2 > 0) found.add("unreadable-files");
  for (const summary of summaries) {
    if (summary.missing.tooLongLines > 0) found.add("too-long-lines");
    for (const [type, count] of Object.entries(summary.missing.unconfirmedTypes)) {
      if (count > 0 && !harmless.has(type)) found.add("unconfirmed-pieces");
    }
  }
  const reasons = REASON_ORDER.filter((reason) => found.has(reason));
  return { complete: reasons.length === 0, reasons };
}

// src/adapters/common/hash.ts
var OFFSET = 0xcbf29ce484222325n;
var PRIME = 0x100000001b3n;
var MASK = 0xffffffffffffffffn;
var encoder = new TextEncoder();
function fnv1a64(text) {
  let hash = OFFSET;
  for (const byte of encoder.encode(text)) {
    hash ^= BigInt(byte);
    hash = hash * PRIME & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

// src/adapters/common/outer-type.ts
var SIMPLE_ESCAPES = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "	" };
var LITERAL = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/;
function outerTypeOf(text) {
  const n = text.length;
  let i = 0;
  const skipWhitespace = () => {
    while (i < n) {
      const code = text.charCodeAt(i);
      if (code === 32 || code === 9 || code === 10 || code === 13) i++;
      else break;
    }
  };
  const readString = (keep) => {
    i++;
    let out = "";
    while (i < n) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\\") {
        if (i + 1 >= n) return null;
        const escape = text[i + 1];
        if (escape === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
          if (keep) out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          continue;
        }
        const simple = SIMPLE_ESCAPES[escape];
        if (simple === void 0) return null;
        if (keep) out += simple;
        i += 2;
        continue;
      }
      if (keep) out += ch;
      i++;
    }
    return null;
  };
  const skipValue = () => {
    skipWhitespace();
    if (i >= n) return false;
    const ch = text[i];
    if (ch === '"') return readString(false) !== null;
    if (ch === "{" || ch === "[") {
      let depth = 0;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (readString(false) === null) return false;
          continue;
        }
        if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            i++;
            return true;
          }
        }
        i++;
      }
      return false;
    }
    const literal = LITERAL.exec(text.slice(i, i + 400));
    if (literal === null) return false;
    i += literal[0].length;
    skipWhitespace();
    return i < n;
  };
  skipWhitespace();
  if (text[i] !== "{") return null;
  i++;
  for (; ; ) {
    skipWhitespace();
    if (i >= n || text[i] !== '"') return null;
    const key = readString(true);
    if (key === null) return null;
    skipWhitespace();
    if (text[i] !== ":") return null;
    i++;
    skipWhitespace();
    if (key === "type") return text[i] === '"' ? readString(true) : null;
    if (!skipValue()) return null;
    skipWhitespace();
    if (text[i] === ",") {
      i++;
      continue;
    }
    return null;
  }
}

// src/adapters/claude/classify.ts
var INTERRUPT_PREFIX = "[Request interrupted by user";
var COMMAND = /^(?:<command-message>[\s\S]*?<\/command-message>\s*)?<command-name>\/?([^<]*)<\/command-name>/;
var TAG = /^<([A-Za-z][\w-]*)>/;
var isObject2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function userText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (isObject2(block) && block.type === "text") return typeof block.text === "string" ? block.text : "";
    }
  }
  return "";
}
function hasToolResult(content) {
  return Array.isArray(content) && content.some((block) => isObject2(block) && block.type === "tool_result");
}
var toolInserted = (line) => line.isMeta === true || line.isCompactSummary === true || line.isVisibleInTranscriptOnly === true;
function commandNameOf(text) {
  const command = COMMAND.exec(text.trimStart());
  return command === null ? null : command[1].trim();
}
function classifyOwnUser(line) {
  const message = isObject2(line.message) ? line.message : {};
  if (hasToolResult(message.content)) return { kind: "tool-result" };
  if (toolInserted(line)) return { kind: "skip", reason: "meta" };
  if (isObject2(line.origin)) {
    const kind = line.origin.kind;
    if (kind === "human") return { kind: "human", weak: false };
    return { kind: "skip", reason: `origin:${typeof kind === "string" ? kind : "?"}` };
  }
  if (line.turnOrigin === "sdk" || line.turnOrigin === "scheduled") return { kind: "skip", reason: `turn:${line.turnOrigin}` };
  const text = userText(message.content).trimStart();
  const command = commandNameOf(text);
  if (command !== null) return { kind: "command", name: command };
  const tag = TAG.exec(text);
  if (tag !== null) return { kind: "skip", reason: `tag:${tag[1]}` };
  if (text.startsWith(INTERRUPT_PREFIX)) return { kind: "skip", reason: "interrupt" };
  return { kind: "human", weak: true };
}
function classifyUser(line, isSubSession) {
  if (isSubSession || line.isSidechain === true) return { kind: "skip", reason: "subagent-input" };
  return classifyOwnUser(line);
}
function isInterruptMarker(line) {
  const verdict = classifyOwnUser(line);
  return verdict.kind === "skip" && verdict.reason === "interrupt";
}
function slashCommandOf(line) {
  const message = isObject2(line.message) ? line.message : {};
  if (hasToolResult(message.content) || toolInserted(line)) return null;
  return commandNameOf(userText(message.content));
}
function denialOf(line) {
  const kind = line.toolDenialKind;
  const decision = isObject2(line.permissionDecision) ? line.permissionDecision : null;
  const rejected = decision !== null && decision.decision === "reject";
  if (kind === "user-rejected") return { kind: "user", raw: null };
  if (rejected && decision.source === "hook") return { kind: "hook", raw: null };
  if (kind === "interrupted") return { kind: "interrupted", raw: null };
  if (kind === "permission-rule" || rejected) return { kind: "permission", raw: null };
  if (typeof kind === "string" && kind !== "") return { kind: "unknown", raw: kind };
  return null;
}

// src/adapters/claude/responses.ts
var DATE2 = 0;
var MODEL = 1;
var EFFORT = 2;
var SKILL = 3;
var SERVER = 4;
var NAME_WIDTH = 5;
var USAGE_WIDTH = 5;
var NONE = -1;
var SYNTHETIC = 1;
var HAS_USAGE = 2;
var LENGTH_STOP = 4;
var FIRST_CAPACITY = 1024;
var ResponseTable = class {
  rows = /* @__PURE__ */ new Map();
  names = [];
  nameIds = /* @__PURE__ */ new Map();
  capacity = FIRST_CAPACITY;
  nameCells = new Int32Array(NAME_WIDTH * FIRST_CAPACITY);
  flagCells = new Uint8Array(FIRST_CAPACITY);
  usageCells = new Float64Array(USAGE_WIDTH * FIRST_CAPACITY);
  get size() {
    return this.rows.size;
  }
  /** 응답 ID의 줄 번호. 처음 보는 ID면 줄을 더하고 isNew를 참으로 돌려준다. */
  row(id, date, synthetic) {
    const known = this.rows.get(id);
    if (known !== void 0) return { row: known, isNew: false };
    const row = this.rows.size;
    if (row === this.capacity) this.grow();
    const base = row * NAME_WIDTH;
    this.nameCells[base + DATE2] = this.nameId(date);
    this.nameCells.fill(NONE, base + MODEL, base + NAME_WIDTH);
    this.flagCells[row] = synthetic ? SYNTHETIC : 0;
    this.usageCells.fill(0, row * USAGE_WIDTH, (row + 1) * USAGE_WIDTH);
    this.rows.set(id, row);
    return { row, isNew: true };
  }
  grow() {
    const capacity = Math.ceil(this.capacity * 1.5);
    const names2 = new Int32Array(NAME_WIDTH * capacity);
    names2.set(this.nameCells);
    this.nameCells = names2;
    const flags = new Uint8Array(capacity);
    flags.set(this.flagCells);
    this.flagCells = flags;
    const usage = new Float64Array(USAGE_WIDTH * capacity);
    usage.set(this.usageCells);
    this.usageCells = usage;
    this.capacity = capacity;
  }
  isSynthetic(row) {
    return (this.flagCells[row] & SYNTHETIC) !== 0;
  }
  /** 아직 값이 없을 때만 채운다(모델·강도는 처음 값을 쓴다). */
  fillFirst(row, column, value) {
    const at = row * NAME_WIDTH + (column === "model" ? MODEL : EFFORT);
    if (value !== null && this.nameCells[at] === NONE) this.nameCells[at] = this.nameId(value);
  }
  /** 마지막 값으로 바꾼다(귀속). */
  setLast(row, column, value) {
    if (value !== null) this.nameCells[row * NAME_WIDTH + (column === "skill" ? SKILL : SERVER)] = this.nameId(value);
  }
  setUsage(row, usage) {
    const base = row * USAGE_WIDTH;
    this.usageCells[base] = usage.input;
    this.usageCells[base + 1] = usage.cacheRead;
    this.usageCells[base + 2] = usage.cacheWrite;
    this.usageCells[base + 3] = usage.output;
    this.usageCells[base + 4] = usage.thinking;
    this.flagCells[row] = this.flagCells[row] | HAS_USAGE;
  }
  /** 마지막으로 적힌 끊긴 까닭이 길이 제한인지 적는다. */
  setStop(row, stop) {
    const flags = this.flagCells[row];
    this.flagCells[row] = stop === "max_tokens" ? flags | LENGTH_STOP : flags & ~LENGTH_STOP;
  }
  /** 들어온 차례로 응답을 하나씩 돌려준다. */
  *fold() {
    for (let row = 0; row < this.rows.size; row++) {
      const names2 = row * NAME_WIDTH;
      const usage = row * USAGE_WIDTH;
      const flags = this.flagCells[row];
      yield {
        date: this.name(this.nameCells[names2 + DATE2]),
        synthetic: (flags & SYNTHETIC) !== 0,
        model: this.name(this.nameCells[names2 + MODEL]),
        effort: this.name(this.nameCells[names2 + EFFORT]),
        lengthStop: (flags & LENGTH_STOP) !== 0,
        usage: (flags & HAS_USAGE) === 0 ? null : {
          input: this.usageCells[usage],
          cacheRead: this.usageCells[usage + 1],
          cacheWrite: this.usageCells[usage + 2],
          output: this.usageCells[usage + 3],
          thinking: this.usageCells[usage + 4]
        },
        skill: this.name(this.nameCells[names2 + SKILL]),
        mcpServer: this.name(this.nameCells[names2 + SERVER])
      };
    }
  }
  nameId(value) {
    if (value === null) return NONE;
    let id = this.nameIds.get(value);
    if (id === void 0) {
      id = this.names.length;
      this.names.push(value);
      this.nameIds.set(value, id);
    }
    return id;
  }
  name(id) {
    return id === NONE ? null : this.names[id];
  }
};

// src/adapters/claude/parser.ts
var CLAUDE_PARSER_VERSION = 1;
var COUNTED_TYPES = /* @__PURE__ */ new Set(["assistant", "user", "attachment", "system"]);
var FIRST_RESPONSE_IDS = 20;
var SHELL_TOOLS = /* @__PURE__ */ new Set(["Bash", "PowerShell"]);
var SUBAGENT_TOOLS = /* @__PURE__ */ new Set(["Agent", "Task"]);
var UNKNOWN_TOOL = "?";
function toolKey(name) {
  if (!name.startsWith("mcp__")) return name;
  const parts = name.split("__");
  return `mcp__${parts[1] !== void 0 && parts[1] !== "" ? parts[1] : UNKNOWN_TOOL}`;
}
var KNOWN_HOOK_ATTACHMENTS = /* @__PURE__ */ new Set([
  "hook_success",
  "hook_non_blocking_error",
  "hook_blocking_error",
  "hook_additional_context"
]);
var strings = (value) => Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
var HOOK_FAILURE_MARKERS = ["blocking because onFailure is", "blocking because Git Bash wasn't found"];
function hasFailureMarker(blockingError) {
  const text = typeof blockingError === "string" ? blockingError : str(obj(blockingError)?.blockingError) ?? "";
  return HOOK_FAILURE_MARKERS.some((marker) => text.includes(marker));
}
var num = (value) => typeof value === "number" && Number.isFinite(value) ? value : 0;
var str = (value) => typeof value === "string" && value !== "" ? value : null;
var obj = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
var bump = (record, key, by = 1) => {
  record[key] = (Object.hasOwn(record, key) ? record[key] : 0) + by;
};
function parseObject(text) {
  try {
    return obj(JSON.parse(text));
  } catch {
    return null;
  }
}
var ClaudeSessionParser = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  ctx;
  days = /* @__PURE__ */ new Map();
  responses = new ResponseTable();
  firstIds = [];
  lastDate = null;
  firstDate = null;
  version = null;
  cwd = null;
  lines = 0;
  brokenLines = 0;
  tailFragments = 0;
  tooLongLines = 0;
  unconfirmedTypes = nameRecord();
  responsesWithoutId = 0;
  undatedLines = 0;
  unknownHookKinds = nameRecord();
  toolNames = /* @__PURE__ */ new Map();
  pendingCommand = null;
  slashCommands = [];
  lastUserWasUserRejection = false;
  loadedSkills = /* @__PURE__ */ new Set();
  everLoadedSkills = /* @__PURE__ */ new Set();
  droppedSkills = /* @__PURE__ */ new Set();
  loadedMcp = /* @__PURE__ */ new Set();
  droppedMcp = /* @__PURE__ */ new Set();
  dayLoaded = /* @__PURE__ */ new Map();
  loadedMarkDate = null;
  loadedDirty = false;
  instructionChars = null;
  initialSkills = null;
  initialMcp = null;
  /** 줄바꿈으로 끝난 줄 하나를 받는다. 빈 줄(공백만 있는 줄)은 세지 않는다. 모든 줄을 JSON으로 풀어 보고, 숫자는 세는 종류의 줄에서만 센다. */
  line(text) {
    if (text.trim() === "") return;
    this.lines++;
    const parsed = parseObject(text);
    if (parsed === null) this.missing(text, "broken");
    else this.accept(parsed);
  }
  /** 상한을 넘은 줄 하나를 받는다. */
  tooLong() {
    this.lines++;
    this.tooLongLines++;
  }
  /** 끝 조각을 정리하고 요약을 낸다. 한 번만 부른다. */
  finish(tail, inProgress) {
    if (tail !== null && tail.trim() !== "") {
      this.lines++;
      const parsed = parseObject(tail);
      if (parsed !== null) this.accept(parsed);
      else this.missing(tail, inProgress ? "tail" : "broken");
    }
    const syntheticResponses = this.foldResponses();
    for (const command of this.slashCommands) {
      if (this.everLoadedSkills.has(command.name)) this.skillSignal(this.day(command.date), command.name).slash++;
    }
    for (const [date, loaded] of this.dayLoaded) {
      const day = this.day(date);
      day.loadedSkills = [...loaded.skills].sort();
      day.loadedMcpServers = [...loaded.mcp].sort();
      day.reloadedSkills = [...loaded.reloadedSkills].sort();
      day.reloadedMcpServers = [...loaded.reloadedMcp].sort();
    }
    const days = {};
    for (const date of [...this.days.keys()].sort()) days[date] = canonicalDay(this.days.get(date));
    return {
      tool: "claude-code",
      sessionId: this.ctx.sessionId,
      kind: this.ctx.kind,
      parentSessionId: this.ctx.parentSessionId,
      cwd: this.cwd,
      version: this.version,
      firstDate: this.firstDate,
      days,
      instructionChars: this.instructionChars,
      initialSkills: this.initialSkills,
      initialMcpServers: this.initialMcp,
      missing: {
        lines: this.lines,
        brokenLines: this.brokenLines,
        tailFragments: this.tailFragments,
        tooLongLines: this.tooLongLines,
        unconfirmedTypes: sortedRecord(this.unconfirmedTypes)
      },
      firstResponseIdHashes: this.firstIds.map(fnv1a64),
      notes: {
        syntheticResponses,
        responsesWithoutId: this.responsesWithoutId,
        undatedLines: this.undatedLines,
        unknownHookKinds: sortedRecord(this.unknownHookKinds)
      }
    };
  }
  /** 응답마다 마지막 사용량을 날짜 칸에 더한다. 합성 응답의 수를 돌려준다. */
  foldResponses() {
    let synthetic = 0;
    for (const response of this.responses.fold()) {
      if (response.synthetic) {
        synthetic++;
        continue;
      }
      if (response.date === null) continue;
      const day = this.day(response.date);
      day.responses++;
      if (response.usage !== null) {
        day.tokens.input += response.usage.input;
        day.tokens.cacheRead += response.usage.cacheRead;
        day.tokens.cacheWrite += response.usage.cacheWrite;
        day.tokens.output += response.usage.output;
        day.tokens.thinking += response.usage.thinking;
      }
      if (response.model !== null) bump(day.models, response.model);
      if (response.effort !== null) bump(day.efforts, response.effort);
      else day.unknownEffort++;
      if (response.lengthStop) day.lengthStops++;
      if (response.skill !== null) this.skillSignal(day, response.skill).attribution++;
      if (response.mcpServer !== null) bump(day.mcpAttributions, response.mcpServer);
    }
    return synthetic;
  }
  missing(text, kind) {
    if (kind === "broken") this.brokenLines++;
    else this.tailFragments++;
    bump(this.unconfirmedTypes, outerTypeOf(text) ?? "?");
  }
  /** 풀린 줄 하나. 종류와 상관없이 그 줄의 시각을 앞 줄의 날짜와 가장 이른 날짜에 쓰고, 세는 종류면 해석한다. */
  accept(line) {
    const own = localDateOfIso(line.timestamp, this.ctx.timeZone);
    if (own !== null) {
      this.lastDate = own;
      if (this.firstDate === null || own < this.firstDate) this.firstDate = own;
    }
    if (typeof line.type === "string" && COUNTED_TYPES.has(line.type)) this.handle(line, this.dateOf(own));
  }
  /** 세는 줄의 날짜. 시각이 없으면 앞 줄(종류와 상관없이)의 날짜를 쓰고, 앞 줄도 없으면 날짜 없는 줄로 센다. */
  dateOf(own) {
    if (own !== null) return own;
    if (this.lastDate === null) this.undatedLines++;
    return this.lastDate;
  }
  day(date) {
    let day = this.days.get(date);
    if (day === void 0) {
      day = emptyDay();
      this.days.set(date, day);
    }
    return day;
  }
  skillSignal(day, name) {
    let counts = day.skillSignals[name];
    if (counts === void 0) {
      counts = emptySkillSignalCounts();
      day.skillSignals[name] = counts;
    }
    return counts;
  }
  handle(line, date) {
    if (this.cwd === null) this.cwd = str(line.cwd);
    if (line.type === "assistant") {
      if (this.initialMcp === null) this.initialMcp = [...this.loadedMcp].sort();
      this.onAssistant(line, date);
    } else if (line.type === "user") this.onUser(line, date);
    else if (line.type === "attachment") this.onAttachment(line, date);
    else if (line.type === "system") this.onSystem(line, date);
    this.markLoaded(date);
  }
  onAssistant(line, date) {
    this.lastUserWasUserRejection = false;
    const version = str(line.version);
    if (version !== null) this.version = maxVersion([this.version, version]);
    const message = obj(line.message) ?? {};
    const id = str(message.id);
    if (id === null) {
      this.responsesWithoutId++;
    } else {
      const { row, isNew } = this.responses.row(id, date, message.model === "<synthetic>");
      if (isNew && !this.responses.isSynthetic(row)) {
        if (this.firstIds.length < FIRST_RESPONSE_IDS) this.firstIds.push(id);
        this.resolvePending(true);
      }
      this.responses.fillFirst(row, "model", str(message.model));
      this.responses.fillFirst(row, "effort", str(line.effort));
      const usage = obj(message.usage);
      if (usage !== null) {
        this.responses.setUsage(row, {
          input: num(usage.input_tokens),
          cacheRead: num(usage.cache_read_input_tokens),
          cacheWrite: num(usage.cache_creation_input_tokens),
          output: num(usage.output_tokens),
          thinking: num(obj(usage.output_tokens_details)?.thinking_tokens)
        });
      }
      const stop = str(message.stop_reason);
      if (stop !== null) this.responses.setStop(row, stop);
      this.responses.setLast(row, "skill", str(line.attributionSkill));
      this.responses.setLast(row, "mcpServer", str(line.attributionMcpServer));
    }
    if (date === null || !Array.isArray(message.content)) return;
    for (const raw of message.content) {
      const block = obj(raw);
      if (block === null || block.type !== "tool_use") continue;
      const blockId = str(block.id);
      if (blockId === null || this.toolNames.has(blockId)) continue;
      const name = str(block.name) ?? UNKNOWN_TOOL;
      const key = toolKey(name);
      this.toolNames.set(blockId, key);
      const day = this.day(date);
      this.tool(day, key).calls++;
      if (key.startsWith("mcp__")) bump(day.mcpCalls, key.slice("mcp__".length));
      if (SUBAGENT_TOOLS.has(name)) day.subagentCalls++;
      if (name === "Skill") {
        const skill = str(obj(block.input)?.skill);
        if (skill !== null) this.skillSignal(day, skill).tool++;
      }
    }
  }
  /**
   * user 줄. 사람 요청은 판별표로 가르고(하위 세션은 세지 않는다), 도구 결과·거절·끊은 표지·슬래시 명령은
   * 판별표와 따로 본다. 하위 세션의 도구 결과, 끊은 표지, 슬래시 명령도 센다(설계 9.2, 9.5).
   */
  onUser(line, date) {
    const verdict = classifyUser(line, this.ctx.kind === "sub");
    const denial = denialOf(line);
    const afterUserRejection = this.lastUserWasUserRejection;
    this.lastUserWasUserRejection = denial !== null && denial.kind === "user";
    if (date === null) return;
    const day = this.day(date);
    this.toolResults(line, day, denial);
    if (isInterruptMarker(line) && !afterUserRejection) day.interruptedTurns++;
    const slash = slashCommandOf(line);
    if (slash !== null) this.slashCommands.push({ name: slash, date });
    switch (verdict.kind) {
      case "human":
        this.resolvePending(false);
        day.humanRequests++;
        if (verdict.weak) day.weakHumanRequests++;
        this.countMode(day, line);
        break;
      case "command":
        this.resolvePending(false);
        this.pendingCommand = { date, mode: str(line.permissionMode) };
        break;
      case "skip":
        bump(day.nonHumanInputs, verdict.reason);
        break;
      case "tool-result":
        break;
    }
  }
  /** 도구 결과를 센다. 거절 표시가 붙은 줄은 한 건으로, 첫 결과의 도구에 종류별로 적는다. 결과도 거절 표시도 없으면 아무것도 세지 않는다. */
  toolResults(line, day, denial) {
    const message = obj(line.message) ?? {};
    const results = [];
    if (Array.isArray(message.content)) {
      for (const raw of message.content) {
        const block = obj(raw);
        if (block !== null && block.type === "tool_result") results.push(block);
      }
    }
    if (denial !== null) {
      const first = results[0];
      const counts = this.tool(day, first === void 0 ? UNKNOWN_TOOL : this.toolNameOf(first));
      if (denial.kind === "user") counts.deniedByUser++;
      else if (denial.kind === "hook") counts.deniedByHook++;
      else if (denial.kind === "permission") counts.deniedByPermission++;
      else if (denial.kind === "interrupted") counts.interrupted++;
      else {
        counts.unknownDenial++;
        bump(day.unknownDenialKinds, denial.raw ?? UNKNOWN_TOOL);
      }
      return;
    }
    for (const block of results) {
      const counts = this.tool(day, this.toolNameOf(block));
      counts.results++;
      if (block.is_error === true) counts.errors++;
    }
  }
  toolNameOf(block) {
    const id = str(block.tool_use_id);
    return (id === null ? void 0 : this.toolNames.get(id)) ?? UNKNOWN_TOOL;
  }
  tool(day, name) {
    let counts = day.tools[name];
    if (counts === void 0) {
      counts = emptyToolCounts();
      day.tools[name] = counts;
    }
    return counts;
  }
  countMode(day, line) {
    const mode = str(line.permissionMode);
    if (mode !== null) bump(day.permissionModes, mode);
  }
  /** 기다리는 명령을 정리한다. 응답이 뒤따랐으면 명령의 날짜에 사람 요청으로 센다. */
  resolvePending(responded) {
    if (this.pendingCommand === null) return;
    if (responded) {
      const day = this.day(this.pendingCommand.date);
      day.humanRequests++;
      if (this.pendingCommand.mode !== null) bump(day.permissionModes, this.pendingCommand.mode);
    }
    this.pendingCommand = null;
  }
  onAttachment(line, date) {
    const body = obj(line.attachment);
    const type = body === null ? null : str(body.type);
    if (body === null || type === null) return;
    if (type === "skill_listing") {
      const names2 = strings(body.names);
      if (body.isInitial === true) {
        const next = new Set(names2);
        if (this.initialSkills === null) this.initialSkills = [...next].sort();
        for (const name of this.loadedSkills) if (!next.has(name)) this.droppedSkills.add(name);
        this.loadedSkills = next;
      } else {
        for (const name of names2) this.loadedSkills.add(name);
      }
      for (const name of names2) {
        this.everLoadedSkills.add(name);
        if (this.droppedSkills.delete(name) && date !== null) this.loadedOn(date).reloadedSkills.add(name);
      }
      this.loadedDirty = true;
      return;
    }
    if (type === "mcp_instructions_delta") {
      for (const name of strings(body.removedNames)) {
        this.loadedMcp.delete(name);
        this.droppedMcp.add(name);
      }
      for (const name of strings(body.addedNames)) {
        this.loadedMcp.add(name);
        if (this.droppedMcp.delete(name) && date !== null) this.loadedOn(date).reloadedMcp.add(name);
      }
      this.loadedDirty = true;
      return;
    }
    if (type === "instructions") {
      if (this.instructionChars !== null || !Array.isArray(body.files)) return;
      let ascii = 0;
      let other = 0;
      for (const file of body.files) {
        const content = obj(file)?.content;
        if (typeof content !== "string") continue;
        for (const ch of content) {
          if (ch.codePointAt(0) < 128) ascii++;
          else other++;
        }
      }
      this.instructionChars = { ascii, other };
      return;
    }
    if (date === null) return;
    const day = this.day(date);
    if (type === "invoked_skills") {
      for (const skill of Array.isArray(body.skills) ? body.skills : []) {
        const name = str(obj(skill)?.name);
        if (name !== null) this.skillSignal(day, name).injected++;
      }
      return;
    }
    if (type === "deferred_tools_delta") {
      if (Array.isArray(body.failedMcpServers) && body.failedMcpServers.length > 0) day.mcpConnectionFailure = true;
      return;
    }
    if (type === "hook_success" || type === "hook_non_blocking_error") {
      const counts = this.hook(day, str(body.hookEvent) ?? UNKNOWN_TOOL);
      counts.runs++;
      if (type === "hook_non_blocking_error") counts.failures++;
      return;
    }
    if (type === "hook_blocking_error") {
      const counts = this.hook(day, str(body.hookEvent) ?? UNKNOWN_TOOL);
      if (hasFailureMarker(body.blockingError)) {
        counts.runs++;
        counts.failures++;
      } else {
        counts.unclassifiedBlocks++;
      }
      return;
    }
    if (type.startsWith("hook_") && !KNOWN_HOOK_ATTACHMENTS.has(type)) bump(this.unknownHookKinds, type);
  }
  onSystem(line, date) {
    if (line.subtype !== "compact_boundary" || date === null) return;
    const trigger = obj(line.compactMetadata)?.trigger;
    if (trigger === "auto") this.day(date).autoCompactions++;
    else if (trigger !== "manual") this.day(date).unknownCompactions++;
  }
  loadedOn(date) {
    let loaded = this.dayLoaded.get(date);
    if (loaded === void 0) {
      loaded = { skills: /* @__PURE__ */ new Set(), mcp: /* @__PURE__ */ new Set(), reloadedSkills: /* @__PURE__ */ new Set(), reloadedMcp: /* @__PURE__ */ new Set() };
      this.dayLoaded.set(date, loaded);
    }
    return loaded;
  }
  /** 그 날짜 칸에 지금 실려 있는 스킬과 MCP 서버의 이름을 더한다. 날짜나 실린 것이 바뀔 때만 계산한다. */
  markLoaded(date) {
    if (date === null || date === this.loadedMarkDate && !this.loadedDirty) return;
    const loaded = this.loadedOn(date);
    for (const name of this.loadedSkills) loaded.skills.add(name);
    for (const name of this.loadedMcp) loaded.mcp.add(name);
    this.loadedMarkDate = date;
    this.loadedDirty = false;
  }
  hook(day, event) {
    let counts = day.hooks[event];
    if (counts === void 0) {
      counts = emptyHookCounts();
      day.hooks[event] = counts;
    }
    return counts;
  }
};

// src/collect/claude.ts
import { join as join8 } from "node:path";

// src/adapters/common/lines.ts
import { open as open3, stat as stat2 } from "node:fs/promises";
var MAX_LINE_BYTES = 16 * 1024 * 1024;
var IN_PROGRESS_WINDOW_MS = 2e3;
function decode(buffer, start, end) {
  return buffer.toString("utf8", start, end > start && buffer[end - 1] === 13 ? end - 1 : end);
}
async function readLines(path, nowMs, sink, options = {}) {
  const maxLine = options.maxLineBytes ?? MAX_LINE_BYTES;
  const chunkSize = options.chunkBytes ?? 1024 * 1024;
  const handle = await open3(path, "r");
  try {
    const opened = await handle.stat();
    const sizeAtOpen = opened.size;
    const mtimeMsAtOpen = opened.mtimeMs;
    if (options.afterOpen) await options.afterOpen();
    const buffer = Buffer.allocUnsafe(chunkSize);
    let carry = Buffer.allocUnsafe(Math.min(maxLine, 64 * 1024));
    let carryBytes = 0;
    let skipping = false;
    let position = 0;
    while (position < sizeAtOpen) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(chunkSize, sizeAtOpen - position), position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const view = buffer.subarray(0, bytesRead);
      let start = 0;
      for (; ; ) {
        const newline = view.indexOf(10, start);
        const end = newline === -1 ? view.length : newline;
        if (!skipping) {
          const length = end - start;
          if (carryBytes + length > maxLine) {
            skipping = true;
            carryBytes = 0;
          } else if (newline !== -1 && carryBytes === 0) {
            sink.line(decode(view, start, end));
            start = newline + 1;
            continue;
          } else if (length > 0) {
            if (carry.length < carryBytes + length) {
              const grown = Buffer.allocUnsafe(Math.min(maxLine, Math.max(carryBytes + length, carry.length * 2)));
              carry.copy(grown, 0, 0, carryBytes);
              carry = grown;
            }
            view.copy(carry, carryBytes, start, end);
            carryBytes += length;
          }
        }
        if (newline === -1) break;
        if (skipping) {
          sink.tooLong();
          skipping = false;
        } else {
          sink.line(decode(carry, 0, carryBytes));
        }
        carryBytes = 0;
        start = newline + 1;
      }
    }
    let tail = null;
    if (skipping) sink.tooLong();
    else if (carryBytes > 0) tail = decode(carry, 0, carryBytes);
    const after = await stat2(path);
    const inProgress = after.size !== sizeAtOpen || after.mtimeMs !== mtimeMsAtOpen || nowMs - mtimeMsAtOpen < IN_PROGRESS_WINDOW_MS;
    return { sizeAtOpen, mtimeMsAtOpen, bytesRead: position, tail, inProgress };
  } finally {
    await handle.close();
  }
}

// src/collect/claude.ts
var CLAUDE_PARSER_ID = `claude-code@${CLAUDE_PARSER_VERSION}`;
function unreadableCount(read) {
  return read.unreadableFiles.length + read.unreadableDirs.length;
}
async function collectClaude(options) {
  const home = claudeHome(options.env, options.homedir);
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const list = await listClaudeFiles(home, options.rescan ? null : windows.collectStartLowerBoundMs);
  return collectFromList(home, list, options);
}
async function collectFromList(home, list, options) {
  const windows = makeWindows(options.clock.nowMs, options.clock.timeZone);
  const cacheDir = options.cacheDir === null ? null : join8(options.cacheDir, "claude-code");
  const files = [...list.files].sort((a, b) => a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0);
  const summaries = [];
  const unreadableFiles = [...list.unreadableFiles];
  let unreadableFileBytes = 0;
  let bytes = 0;
  let fromCache = 0;
  let inProgress = 0;
  const markUnreadable = (path, size) => {
    unreadableFiles.push(path);
    unreadableFileBytes += size;
  };
  for (const file of files) {
    let key = null;
    try {
      if (cacheDir !== null) {
        key = await cacheKeyFor(file, CLAUDE_PARSER_ID, options.clock.timeZone);
        if (!options.rescan) {
          const hit = await loadCached(cacheDir, key);
          if (hit !== null) {
            summaries.push(hit.summary);
            bytes += hit.bytesRead;
            fromCache++;
            if (mostlyBroken(hit.summary)) markUnreadable(file.path, file.size);
            continue;
          }
        }
      }
      const parser = new ClaudeSessionParser({
        sessionId: file.sessionId,
        kind: file.kind,
        parentSessionId: file.parentSessionId,
        timeZone: options.clock.timeZone
      });
      const outcome = await readLines(file.path, options.clock.nowMs, {
        line: (text) => parser.line(text),
        tooLong: () => parser.tooLong()
      });
      const summary = parser.finish(outcome.tail, outcome.inProgress);
      summaries.push(summary);
      bytes += outcome.bytesRead;
      if (mostlyBroken(summary)) markUnreadable(file.path, file.size);
      if (outcome.inProgress) {
        inProgress++;
        continue;
      }
      if (key !== null && cacheDir !== null && outcome.sizeAtOpen === file.size && outcome.mtimeMsAtOpen === file.mtimeMs) {
        try {
          await storeCached(cacheDir, { key, summary, bytesRead: outcome.bytesRead });
        } catch {
        }
      }
    } catch {
      markUnreadable(file.path, file.size);
    }
  }
  unreadableFiles.sort();
  return {
    tool: "claude-code",
    home,
    detected: list.projectsFound,
    summaries,
    read: {
      files: files.length + list.unreadableFiles.length,
      listedBytes: files.reduce((sum2, file) => sum2 + file.size, 0),
      bytes,
      fromCache,
      inProgress,
      olderThanWindow: list.olderThanWindow,
      unreadableFiles,
      unreadableFileBytes,
      unknownSizeFiles: list.unreadableFiles.length,
      unreadableDirs: [...list.unreadableDirs].sort()
    },
    visibleFrom: visibleFrom(summaries, list.olderThanWindow, windows.collectDates[0]),
    overlappingSessions: overlappingSessions(summaries)
  };
}
function visibleFrom(summaries, olderThanWindow, collectStart) {
  if (olderThanWindow > 0) return collectStart;
  let earliest = null;
  for (const summary of summaries) {
    if (summary.firstDate !== null && (earliest === null || summary.firstDate < earliest)) earliest = summary.firstDate;
  }
  if (earliest === null) return null;
  return earliest < collectStart ? collectStart : earliest;
}
function overlappingSessions(summaries) {
  const owners = /* @__PURE__ */ new Map();
  summaries.forEach((summary, index) => {
    for (const hash of summary.firstResponseIdHashes) {
      let set = owners.get(hash);
      if (set === void 0) {
        set = /* @__PURE__ */ new Set();
        owners.set(hash, set);
      }
      set.add(index);
    }
  });
  const overlapping = /* @__PURE__ */ new Set();
  for (const set of owners.values()) {
    if (set.size > 1) for (const index of set) overlapping.add(index);
  }
  return overlapping.size;
}

// src/scan/claude.ts
import { join as join15 } from "node:path";

// src/scan/claude-json.ts
import { join as join10, resolve as resolve3 } from "node:path";

// src/scan/fs.ts
import { lstat as lstat4, readdir as readdir5, readFile as readFile3, realpath as realpath4, stat as stat3 } from "node:fs/promises";
var isMissing3 = (error) => {
  const code = error?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};
var stripBom = (text) => text.charCodeAt(0) === 65279 ? text.slice(1) : text;
async function readText(path) {
  try {
    return { status: "ok", text: stripBom(await readFile3(path, "utf8")) };
  } catch (error) {
    return isMissing3(error) ? { status: "missing" } : { status: "unreadable" };
  }
}
async function readJson(path) {
  const text = await readText(path);
  if (text.status !== "ok") return text;
  try {
    return { status: "ok", value: JSON.parse(text.text) };
  } catch {
    return { status: "unparsable" };
  }
}
async function listDir(path) {
  try {
    return { status: "ok", names: (await readdir5(path)).sort() };
  } catch (error) {
    return isMissing3(error) ? { status: "missing" } : { status: "unreadable" };
  }
}
function createdMsOf(info) {
  const ms = info.birthtimeMs;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
var MISSING = { exists: false, isLink: false, isDir: false, isFile: false, createdMs: null, targetCreatedMs: null, dangling: false, realPath: null };
async function entryInfo(path) {
  let own;
  try {
    own = await lstat4(path);
  } catch {
    return MISSING;
  }
  const isLink = own.isSymbolicLink();
  let target = own;
  if (isLink) {
    try {
      target = await stat3(path);
    } catch {
      target = null;
    }
  }
  let real = null;
  try {
    real = normalizePath(await realpath4(path));
  } catch {
    real = null;
  }
  return {
    exists: true,
    isLink,
    isDir: target?.isDirectory() ?? false,
    isFile: target?.isFile() ?? false,
    createdMs: createdMsOf(own),
    targetCreatedMs: isLink && target !== null ? createdMsOf(target) : null,
    dangling: isLink && target === null,
    realPath: real
  };
}

// src/scan/plugins.ts
import { basename as basename2, join as join9, resolve as resolve2 } from "node:path";

// src/scan/hooks.ts
var SHELL_TOOLS2 = ["Bash", "PowerShell"];
var isObject3 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function matcherMatches(matcher, tool) {
  if (matcher === void 0 || matcher === null || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  if (/^[A-Za-z0-9_\- ,|]+$/.test(matcher)) {
    return matcher.split(/[|,]/).map((name) => name.trim()).includes(tool);
  }
  try {
    return new RegExp(matcher).test(tool);
  } catch {
    return false;
  }
}
function ifTool(rule2) {
  if (rule2 === void 0) return null;
  if (typeof rule2 !== "string") return "unreadable";
  const match = /^\s*([A-Za-z0-9_]+)\s*(?:\(.*\))?\s*$/s.exec(rule2);
  return match === null ? "unreadable" : match[1];
}
function coversShell(matcher, rule2) {
  const tool = ifTool(rule2);
  if (tool === "unreadable") return false;
  return SHELL_TOOLS2.some((shell) => matcherMatches(matcher, shell) && (tool === null || tool === shell));
}
var REQUIRED_FIELDS = /* @__PURE__ */ new Map([
  ["command", ["command"]],
  ["http", ["url"]],
  ["mcp_tool", ["server", "tool"]],
  ["prompt", ["prompt"]],
  ["agent", ["prompt"]]
]);
function isHandler(handler) {
  if (!isObject3(handler) || typeof handler.type !== "string") return false;
  const required = REQUIRED_FIELDS.get(handler.type);
  return required !== void 0 && required.every((field) => typeof handler[field] === "string" && handler[field] !== "");
}
function hookMapValid(events) {
  if (!isObject3(events)) return false;
  for (const groups of Object.values(events)) {
    if (!Array.isArray(groups)) return false;
    for (const group of groups) if (!isObject3(group) || !Array.isArray(group.hooks) || !group.hooks.every(isHandler)) return false;
  }
  return true;
}
function hookFileEvents(file) {
  return isObject3(file) && hookMapValid(file.hooks) ? file.hooks : null;
}
function inlineHookEvents(inline) {
  return hookMapValid(inline) ? inline : null;
}
function preToolUseGuards(events, source, pluginId) {
  if (!isObject3(events) || !Array.isArray(events.PreToolUse)) return [];
  const out = [];
  for (const group of events.PreToolUse) {
    if (!isObject3(group) || !Array.isArray(group.hooks)) continue;
    for (const handler of group.hooks) {
      if (!isHandler(handler)) continue;
      out.push({ source, pluginId, coversShell: coversShell(group.matcher, handler.if), canBlock: handler.async !== true && handler.asyncRewake !== true });
    }
  }
  return out;
}
function hookCommandTexts(events) {
  if (!isObject3(events)) return [];
  const out = [];
  for (const groups of Object.values(events)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isObject3(group) || !Array.isArray(group.hooks)) continue;
      for (const handler of group.hooks) {
        if (!isObject3(handler)) continue;
        const parts = [];
        if (typeof handler.command === "string") parts.push(handler.command);
        if (Array.isArray(handler.args)) {
          for (const arg of handler.args) if (typeof arg === "string") parts.push(arg);
        }
        if (parts.length > 0) out.push(parts.join(" "));
      }
    }
  }
  return out;
}

// src/scan/json.ts
var MAX_JSON_DEPTH = 64;
var isObject4 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function canonicalJson(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) return null;
  if (Array.isArray(value)) {
    const parts = [];
    for (const item of value) {
      const part = canonicalJson(item, depth + 1);
      if (part === null) return null;
      parts.push(part);
    }
    return `[${parts.join(",")}]`;
  }
  if (isObject4(value)) {
    const parts = [];
    for (const key of Object.keys(value).sort()) {
      const part = canonicalJson(value[key], depth + 1);
      if (part === null) return null;
      parts.push(`${JSON.stringify(key)}:${part}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// src/scan/plugins.ts
var DEFAULT_ENTRIES = {
  skills: "skills",
  commands: "commands",
  agents: "agents",
  workflows: "workflows",
  "output-styles": "outputStyles",
  themes: "themes",
  monitors: "monitors",
  hooks: "hooks",
  bin: "bin",
  "settings.json": "settings",
  ".mcp.json": "mcpServers",
  ".lsp.json": "lspServers"
};
var MANIFEST_COMPONENTS = [
  ["skills", "skills"],
  ["commands", "commands"],
  ["agents", "agents"],
  ["workflows", "workflows"],
  ["outputStyles", "outputStyles"],
  ["hooks", "hooks"],
  ["mcpServers", "mcpServers"],
  ["lspServers", "lspServers"],
  ["userConfig", "userConfig"],
  ["channels", "channels"]
];
var COMPONENT_KEYS = new Set(MANIFEST_COMPONENTS.map(([key]) => key));
var ENTRY_APPENDED = /* @__PURE__ */ new Set(["commands", "agents", "skills", "hooks", "outputStyles", "themes"]);
var INTRO_FILES = /^(readme|license|changelog)|^package\.json$/i;
var HELPER_DIRS = /* @__PURE__ */ new Set(["docs", "tests", "test", "examples", "assets", "images", "scripts"]);
var MARKET_ROOT_SOURCES = /* @__PURE__ */ new Set([".", "./"]);
var URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;
var wellFormedPath = (path) => path.startsWith("./") && !path.split(/[\\/]/).includes("..");
function declarationsOf(value) {
  if (value === void 0) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => typeof item === "string" ? item : isObject4(item) ? item : null);
}
var SKILLS_DIR = "skills-dir";
async function isIntroEntry(root, name) {
  const lower = name.toLowerCase();
  const info = await entryInfo(join9(root, name));
  if (info.isFile) return INTRO_FILES.test(name) || lower.endsWith(".md") && lower !== "skill.md";
  if (info.isDir) return HELPER_DIRS.has(lower);
  return false;
}
var INTRO_KEYS = /* @__PURE__ */ new Set(["$schema", "name", "displayName", "version", "description", "author", "homepage", "repository", "license", "keywords", "metadata", "defaultEnabled", "dependencies"]);
var ENTRY_INTRO_KEYS = /* @__PURE__ */ new Set([...INTRO_KEYS, "source", "category", "tags", "strict", "relevance", "headers", "headersHelper"]);
var pathsOf = (v) => typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
var firstSegment = (path) => path.replace(/\\/g, "/").replace(/^\.\//, "").split("/")[0] ?? "";
var bareName = (name) => name.includes("@") ? name.slice(0, name.indexOf("@")) : name;
var cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function mcpMapOf(value) {
  if (!isObject4(value)) return null;
  let map = value;
  if (Object.hasOwn(value, "mcpServers")) {
    if (!isObject4(value.mcpServers)) return null;
    map = value.mcpServers;
  }
  return Object.keys(map).sort().map((name) => ({ name, definition: isObject4(map[name]) ? map[name] : null }));
}
async function readMarketplaceEntries(claudeHome2) {
  const markets = /* @__PURE__ */ new Map();
  const known = await readJson(join9(claudeHome2, "plugins", "known_marketplaces.json"));
  if (known.status === "missing") return { file: "missing", markets };
  if (known.status !== "ok" || !isObject4(known.value)) return { file: "unreadable", markets };
  for (const [market, info] of Object.entries(known.value)) {
    if (!isObject4(info) || typeof info.installLocation !== "string") {
      markets.set(market, "unreadable");
      continue;
    }
    const location = info.installLocation;
    const read = await readJson((await entryInfo(location)).isFile ? location : join9(location, ".claude-plugin", "marketplace.json"));
    if (read.status === "missing") {
      markets.set(market, "missing");
      continue;
    }
    if (read.status !== "ok" || !isObject4(read.value) || !Array.isArray(read.value.plugins)) {
      markets.set(market, "unreadable");
      continue;
    }
    const entries = /* @__PURE__ */ new Map();
    for (const entry of read.value.plugins) if (isObject4(entry) && typeof entry.name === "string" && !entries.has(entry.name)) entries.set(entry.name, entry);
    markets.set(market, entries);
  }
  return { file: "ok", markets };
}
function mergeEvents(base, replace) {
  const merged = /* @__PURE__ */ Object.create(null);
  for (const events of base) {
    if (!isObject4(events)) continue;
    for (const [event, groups] of Object.entries(events)) if (Array.isArray(groups)) merged[event] = [...merged[event] ?? [], ...groups];
  }
  if (isObject4(replace)) {
    for (const [event, groups] of Object.entries(replace)) if (Array.isArray(groups)) merged[event] = [...groups];
  }
  return merged;
}
async function readPluginInstall(group, markets) {
  const { id, installPath } = group;
  const at = id.lastIndexOf("@");
  const entryName = at === -1 ? id : id.slice(0, at);
  const marketplace = at === -1 ? "" : id.slice(at + 1);
  const plugin = {
    id,
    entryName,
    marketplace,
    name: entryName,
    scopes: [...group.scopes].sort(),
    projectPaths: [...group.projectPaths].sort(),
    installPath,
    installRealPath: null,
    exists: false,
    manifest: "missing",
    marketplaceEntry: "missing",
    defaultEnabled: true,
    components: [],
    unknownEntries: [],
    dependencies: null,
    compositionKnown: false,
    hookEvents: [],
    hooksUnreadable: false,
    mcpServers: [],
    mcpUnreadable: false,
    skillRoots: []
  };
  const unknown = () => {
    plugin.hooksUnreadable = true;
    plugin.mcpUnreadable = true;
    return plugin;
  };
  const market = markets.markets.get(marketplace);
  const fromSkillsDir = marketplace === SKILLS_DIR;
  const entry = fromSkillsDir ? {} : market instanceof Map ? market.get(entryName) : void 0;
  const marketUnreadable = market === "unreadable" || market === void 0 && markets.file === "unreadable";
  plugin.marketplaceEntry = fromSkillsDir ? "none" : entry !== void 0 ? "ok" : marketUnreadable ? "unreadable" : "missing";
  const installInfo = await entryInfo(installPath);
  plugin.exists = installInfo.isDir;
  if (!plugin.exists) return unknown();
  plugin.installRealPath = installInfo.realPath;
  const listing = await listDir(installPath);
  const manifestRead = await readJson(join9(installPath, ".claude-plugin", "plugin.json"));
  let manifest = null;
  if (manifestRead.status === "ok" && isObject4(manifestRead.value) && typeof manifestRead.value.name === "string" && manifestRead.value.name !== "") {
    plugin.manifest = "ok";
    manifest = manifestRead.value;
    plugin.name = manifestRead.value.name;
  } else {
    plugin.manifest = manifestRead.status === "ok" ? "unparsable" : manifestRead.status;
  }
  if (entry !== void 0 && typeof entry.defaultEnabled === "boolean") plugin.defaultEnabled = entry.defaultEnabled;
  else if (manifest !== null) plugin.defaultEnabled = manifest.defaultEnabled !== false;
  if (listing.status !== "ok") return unknown();
  if (plugin.manifest === "unparsable" || plugin.manifest === "unreadable") return unknown();
  if (entry === void 0) return unknown();
  if (manifest !== null && entry.strict === false && Object.keys(entry).some((key) => ENTRY_APPENDED.has(key))) return unknown();
  const base = manifest ?? entry;
  const appended = manifest !== null ? Object.fromEntries(Object.entries(entry).filter(([key]) => ENTRY_APPENDED.has(key))) : {};
  plugin.compositionKnown = true;
  const deps = [...Array.isArray(base.dependencies) ? base.dependencies : [], ...manifest !== null && Array.isArray(entry.dependencies) ? entry.dependencies : []];
  plugin.dependencies = [...new Set(deps.flatMap((d) => typeof d === "string" ? [bareName(d)] : isObject4(d) && typeof d.name === "string" ? [bareName(d.name)] : []))].sort();
  const kinds = /* @__PURE__ */ new Set();
  const referenced = /* @__PURE__ */ new Set();
  const addComponents = (source) => {
    for (const [key, kind] of MANIFEST_COMPONENTS) {
      if (source[key] === void 0) continue;
      kinds.add(kind);
      for (const path of pathsOf(source[key])) referenced.add(firstSegment(path));
    }
    const experimental = isObject4(source.experimental) ? source.experimental : {};
    for (const [key, kind] of [["themes", "themes"], ["monitors", "monitors"]]) {
      if (experimental[key] === void 0) continue;
      kinds.add(kind);
      for (const path of pathsOf(experimental[key])) referenced.add(firstSegment(path));
    }
    if (source.themes !== void 0) {
      kinds.add("themes");
      for (const path of pathsOf(source.themes)) referenced.add(firstSegment(path));
    }
  };
  addComponents(base);
  addComponents(appended);
  const prefix = manifest !== null ? "manifest" : "entry";
  const unknownKeys = (source, from, known) => {
    for (const key of Object.keys(source)) {
      if (key === "experimental") {
        const experimental = isObject4(source.experimental) ? source.experimental : {};
        for (const inner of Object.keys(experimental)) if (inner !== "themes" && inner !== "monitors") plugin.unknownEntries.push(`${from}:experimental.${inner}`);
        continue;
      }
      if (!known.has(key) && !COMPONENT_KEYS.has(key) && key !== "themes") plugin.unknownEntries.push(`${from}:${key}`);
    }
  };
  if (manifest !== null) unknownKeys(manifest, "manifest", INTRO_KEYS);
  unknownKeys(entry, "entry", ENTRY_INTRO_KEYS);
  for (const name of listing.names) {
    const kind = Object.hasOwn(DEFAULT_ENTRIES, name) ? DEFAULT_ENTRIES[name] : void 0;
    if (kind !== void 0) {
      kinds.add(kind);
      continue;
    }
    if (name.startsWith(".") || referenced.has(name) || await isIntroEntry(installPath, name)) continue;
    plugin.unknownEntries.push(name);
  }
  plugin.components = [...kinds].sort();
  const root = normalizePath(installPath);
  const rootReal = plugin.installRealPath;
  const within = (path, base2) => path === base2 || path.startsWith(base2.endsWith("/") ? base2 : `${base2}/`);
  const insideRoot = async (path) => {
    const real = (await entryInfo(path)).realPath;
    return real === null || rootReal === null || within(real, rootReal);
  };
  const declaredPath = async (declared2) => {
    if (!wellFormedPath(declared2)) return null;
    const path = resolve2(installPath, declared2);
    return await insideRoot(path) ? path : null;
  };
  const hookSources = [];
  const hookFileStatus = /* @__PURE__ */ new Map();
  const addHookFile = async (path, declared2) => {
    const key = normalizePath(path);
    let status = hookFileStatus.get(key);
    if (status === void 0) {
      const read = await readJson(path);
      const events = read.status === "ok" ? hookFileEvents(read.value) : null;
      status = read.status === "missing" ? "missing" : events !== null ? "ok" : "bad";
      hookFileStatus.set(key, status);
      if (events !== null) hookSources.push(events);
    }
    if (status === "missing" ? declared2 : status === "bad") plugin.hooksUnreadable = true;
  };
  const addInlineHooks = (inline) => {
    const events = inlineHookEvents(inline);
    if (events === null) plugin.hooksUnreadable = true;
    else hookSources.push(events);
  };
  const defaultHooks = join9(installPath, "hooks", "hooks.json");
  if (await insideRoot(defaultHooks)) await addHookFile(defaultHooks, false);
  else plugin.hooksUnreadable = true;
  if (manifest !== null) {
    for (const declaration of declarationsOf(manifest.hooks)) {
      if (declaration === null) plugin.hooksUnreadable = true;
      else if (typeof declaration === "string") {
        const path = await declaredPath(declaration);
        if (path !== null) await addHookFile(path, true);
        else plugin.hooksUnreadable = true;
      } else addInlineHooks(declaration);
    }
  }
  const entryHooks = isObject4(entry.hooks) ? inlineHookEvents(entry.hooks) : void 0;
  if (entryHooks === null) plugin.hooksUnreadable = true;
  plugin.hookEvents = [manifest !== null ? mergeEvents(hookSources, entryHooks) : mergeEvents([...hookSources, entryHooks], void 0)];
  const servers = /* @__PURE__ */ new Map();
  const addMap = (entries) => {
    if (entries === null) {
      plugin.mcpUnreadable = true;
      return;
    }
    for (const e of entries) servers.set(e.name, e);
  };
  const addMcpFile = async (path, declared2) => {
    const read = await readJson(path);
    if (read.status === "missing") {
      if (declared2) plugin.mcpUnreadable = true;
      return;
    }
    addMap(read.status === "ok" ? mcpMapOf(read.value) : null);
  };
  await addMcpFile(join9(installPath, ".mcp.json"), false);
  for (const declaration of declarationsOf(base.mcpServers)) {
    if (declaration === null || typeof declaration === "string" && URL_LIKE.test(declaration)) plugin.mcpUnreadable = true;
    else if (typeof declaration === "string") {
      const path = await declaredPath(declaration);
      if (path !== null) await addMcpFile(path, true);
      else plugin.mcpUnreadable = true;
    } else addMap(mcpMapOf({ mcpServers: declaration }));
  }
  plugin.mcpServers = [...servers.values()].sort((a, b) => cmp(a.name, b.name));
  const isPluginRoot = async (path) => {
    if (normalizePath(path) === root) return true;
    const real = (await entryInfo(path)).realPath;
    return real !== null && rootReal !== null && real === rootReal;
  };
  const declared = [...pathsOf(base.skills).map((path) => ({ path, from: prefix })), ...pathsOf(appended.skills).map((path) => ({ path, from: "entry" }))];
  const skillRoots = [];
  for (const { path, from } of declared) {
    if (await isPluginRoot(resolve2(installPath, path))) {
      plugin.unknownEntries.push(`${from}:skills=.`);
      continue;
    }
    const accepted = await declaredPath(path);
    if (accepted === null) plugin.unknownEntries.push(`${from}:skills=..`);
    else skillRoots.push(accepted);
  }
  const defaultSkills = join9(installPath, "skills");
  const defaultIsRoot = await isPluginRoot(defaultSkills);
  if (defaultIsRoot) plugin.unknownEntries.push("skills=.");
  const entrySkillsOnly = entry.skills !== void 0 && typeof entry.source === "string" && MARKET_ROOT_SOURCES.has(entry.source);
  plugin.skillRoots = [.../* @__PURE__ */ new Set([...entrySkillsOnly || defaultIsRoot ? [] : [defaultSkills], ...skillRoots])];
  plugin.unknownEntries = [...new Set(plugin.unknownEntries)].sort();
  return plugin;
}
async function readSkillsDirPlugins(refs) {
  const out = [];
  for (const ref of refs) {
    const read = await readJson(join9(ref.path, ".claude-plugin", "plugin.json"));
    const declared = read.status === "ok" && isObject4(read.value) ? read.value.name : void 0;
    const name = typeof declared === "string" && declared !== "" ? declared : basename2(ref.path);
    const group = { id: `${name}@${SKILLS_DIR}`, installPath: ref.path, scopes: /* @__PURE__ */ new Set([ref.scope]), projectPaths: new Set(ref.projectRoot === null ? [] : [ref.projectRoot]) };
    out.push(await readPluginInstall(group, { file: "ok", markets: /* @__PURE__ */ new Map() }));
  }
  return out;
}
async function scanPlugins(claudeHome2) {
  const read = await readJson(join9(claudeHome2, "plugins", "installed_plugins.json"));
  if (read.status !== "ok") return { file: read.status, plugins: [] };
  if (!isObject4(read.value) || !isObject4(read.value.plugins)) return { file: "unparsable", plugins: [] };
  const groups = /* @__PURE__ */ new Map();
  for (const id of Object.keys(read.value.plugins)) {
    if (id.endsWith("@builtin")) continue;
    const entries = read.value.plugins[id];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isObject4(entry) || typeof entry.installPath !== "string") continue;
      const key = `${id}\0${normalizePath(entry.installPath)}`;
      let group = groups.get(key);
      if (group === void 0) {
        group = { id, installPath: entry.installPath, scopes: /* @__PURE__ */ new Set(), projectPaths: /* @__PURE__ */ new Set() };
        groups.set(key, group);
      }
      if (entry.installPath < group.installPath) group.installPath = entry.installPath;
      group.scopes.add(typeof entry.scope === "string" ? entry.scope : "unknown");
      if (typeof entry.projectPath === "string") group.projectPaths.add(normalizePath(entry.projectPath));
    }
  }
  const markets = await readMarketplaceEntries(claudeHome2);
  const plugins = [];
  for (const key of [...groups.keys()].sort()) plugins.push(await readPluginInstall(groups.get(key), markets));
  return { file: "ok", plugins };
}

// src/scan/claude-json.ts
function claudeJsonPath(env, homedir2) {
  const fromEnv = env.CLAUDE_CONFIG_DIR?.trim();
  return fromEnv ? join10(resolve3(fromEnv), ".claude.json") : join10(homedir2, ".claude.json");
}
var MAX_DATE_MS = 864e13;
var isObject5 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var strings2 = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
function isDateMs(v) {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_DATE_MS;
}
function lastUsed(v) {
  const out = /* @__PURE__ */ Object.create(null);
  if (!isObject5(v)) return out;
  for (const [name, entry] of Object.entries(v)) {
    out[name] = isObject5(entry) && isDateMs(entry.lastUsedAt) ? entry.lastUsedAt : null;
  }
  return out;
}
function emptyClaudeJson(status) {
  return {
    status,
    userMcpServers: [],
    projects: [],
    skillUsage: /* @__PURE__ */ Object.create(null),
    pluginUsage: /* @__PURE__ */ Object.create(null),
    claudeAiEverConnected: []
  };
}
async function readClaudeJson(path) {
  let read = await readJson(path);
  if (read.status === "unparsable") read = await readJson(path);
  if (read.status !== "ok") return emptyClaudeJson(read.status);
  if (!isObject5(read.value)) return emptyClaudeJson("unparsable");
  const v = read.value;
  const facts = emptyClaudeJson("ok");
  facts.userMcpServers = isObject5(v.mcpServers) ? mcpMapOf({ mcpServers: v.mcpServers }) ?? [] : [];
  if (isObject5(v.projects)) {
    for (const key of Object.keys(v.projects)) {
      const entry = v.projects[key];
      if (!isObject5(entry)) continue;
      facts.projects.push({
        key,
        normKey: normalizePath(key),
        mcpServers: isObject5(entry.mcpServers) ? mcpMapOf({ mcpServers: entry.mcpServers }) ?? [] : [],
        enabledMcpjsonServers: strings2(entry.enabledMcpjsonServers),
        disabledMcpjsonServers: strings2(entry.disabledMcpjsonServers),
        disabledMcpServers: strings2(entry.disabledMcpServers)
      });
    }
    facts.projects.sort((a, b) => a.normKey !== b.normKey ? a.normKey < b.normKey ? -1 : 1 : a.key < b.key ? -1 : 1);
  }
  facts.skillUsage = lastUsed(v.skillUsage);
  facts.pluginUsage = lastUsed(v.pluginUsage);
  facts.claudeAiEverConnected = [...new Set(strings2(v.claudeAiMcpEverConnected))].sort();
  return facts;
}

// src/scan/instructions.ts
import { createHash as createHash2 } from "node:crypto";
import { lstat as lstat5 } from "node:fs/promises";
import { basename as basename3, join as join11 } from "node:path";
var MIN_LINE_CHARS = 20;
var RULES_MAX_DEPTH = 8;
function emptyInstructionSet() {
  return { files: [], bytes: 0, chars: { ascii: 0, other: 0 }, lineHashes: [], unreadable: [], unreadableDirs: [] };
}
function lineHash(line) {
  return createHash2("sha256").update(line).digest("hex").slice(0, 32);
}
function countChars(text) {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.codePointAt(0) < 128) ascii++;
    else other++;
  }
  return { ascii, other };
}
function linesForOverlap(text) {
  const out = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if ([...line].length >= MIN_LINE_CHARS) out.push(lineHash(line));
  }
  return out;
}
async function markdownFilesUnder(dir) {
  const paths = [];
  const unreadableDirs = [];
  const walk = async (current, depth) => {
    const listing = await listDir(current);
    if (listing.status === "unreadable") unreadableDirs.push(current);
    if (listing.status !== "ok") return;
    for (const name of listing.names) {
      const path = join11(current, name);
      let info;
      try {
        info = await lstat5(path);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        if (depth < RULES_MAX_DEPTH) await walk(path, depth + 1);
        continue;
      }
      if (name.toLowerCase().endsWith(".md") && (info.isFile() || info.isSymbolicLink())) paths.push(path);
    }
  };
  await walk(dir, 0);
  return { paths: paths.sort(), unreadableDirs: unreadableDirs.sort() };
}
var escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function countMentions(text, targets) {
  const unified = text.replace(/\\/g, "/").toLowerCase();
  const out = /* @__PURE__ */ Object.create(null);
  for (const target of targets) {
    const path = target.normRoot.toLowerCase();
    let count = unified.split(path).length - 1;
    const name = basename3(target.root).toLowerCase();
    if ([...name].length >= 3) {
      const word = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "gu");
      const withoutPaths = path.length > 0 ? unified.split(path).join(" ") : unified;
      count += (withoutPaths.match(word) ?? []).length;
    }
    if (count > 0) out[target.normRoot] = count;
  }
  return out;
}
async function readInstructionSet(paths, mentionTargets = [], sameAsGlobal = /* @__PURE__ */ new Set()) {
  const set = emptyInstructionSet();
  const hashes = /* @__PURE__ */ new Set();
  const mentions = /* @__PURE__ */ Object.create(null);
  for (const path of [...new Set(paths)].sort()) {
    const read = await readText(path);
    if (read.status === "missing") continue;
    if (read.status === "unreadable") {
      set.unreadable.push(path);
      continue;
    }
    const info = await entryInfo(path);
    const same = info.realPath !== null && sameAsGlobal.has(info.realPath);
    const bytes = Buffer.byteLength(read.text, "utf8");
    set.files.push({ path, realPath: info.realPath, bytes, hasContent: /\S/u.test(read.text), sameAsGlobal: same });
    set.bytes += bytes;
    const chars = countChars(read.text);
    set.chars.ascii += chars.ascii;
    set.chars.other += chars.other;
    if (!same) for (const hash of linesForOverlap(read.text)) hashes.add(hash);
    for (const [key, count] of Object.entries(countMentions(read.text, mentionTargets))) mentions[key] = (mentions[key] ?? 0) + count;
  }
  set.lineHashes = [...hashes].sort();
  return { set, mentions };
}
async function globalInstructionPaths(claudeHome2) {
  const rules = await markdownFilesUnder(join11(claudeHome2, "rules"));
  return { paths: [join11(claudeHome2, "CLAUDE.md"), ...rules.paths], unreadableDirs: rules.unreadableDirs };
}
async function projectInstructionPaths(root) {
  const claudeFiles = [join11(root, "CLAUDE.md"), join11(root, ".claude", "CLAUDE.md"), join11(root, "CLAUDE.local.md")];
  const present = [];
  for (const path of claudeFiles) if ((await entryInfo(path)).isFile) present.push(path);
  const rules = await markdownFilesUnder(join11(root, ".claude", "rules"));
  const paths = present.length > 0 ? [...present, ...rules.paths] : [join11(root, "AGENTS.md"), join11(root, ".claude", "AGENTS.md"), ...rules.paths];
  return { paths, unreadableDirs: rules.unreadableDirs };
}
async function readGlobalInstructions(claudeHome2, mentionTargets) {
  const found = await globalInstructionPaths(claudeHome2);
  const read = await readInstructionSet(found.paths, mentionTargets);
  read.set.unreadableDirs = found.unreadableDirs;
  return read;
}
async function readProjectInstructions(root, global) {
  const found = await projectInstructionPaths(root);
  const { set } = await readInstructionSet(found.paths, [], realPaths(global));
  set.unreadableDirs = found.unreadableDirs;
  return set;
}
function realPaths(set) {
  return new Set(set.files.map((file) => file.realPath ?? normalizePath(file.path)));
}

// src/scan/mcp.ts
import { createHmac } from "node:crypto";
function definitionHash(saltHex, definition) {
  const text = canonicalJson(definition);
  return text === null ? null : createHmac("sha256", Buffer.from(saltHex, "hex")).update(text).digest("hex");
}
var wildcard = (pattern) => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
function matcherHits(matcher, names2, definition) {
  if (matcher.serverName !== void 0 && names2.includes(matcher.serverName)) return true;
  if (matcher.serverUrl !== void 0 && definition !== null && typeof definition.url === "string" && wildcard(matcher.serverUrl).test(definition.url)) return true;
  if (matcher.serverCommand !== void 0 && definition !== null && typeof definition.command === "string") {
    const args = Array.isArray(definition.args) ? definition.args : [];
    const command = [definition.command, ...args];
    if (command.length === matcher.serverCommand.length && command.every((part, i) => part === matcher.serverCommand[i])) return true;
  }
  return false;
}
function mcpAllowed(context, names2, definition) {
  for (const layer of context.layers) if (layer.deniedMcpServers.some((m) => matcherHits(m, names2, definition))) return false;
  const allow = context.managed.allowedMcpServers;
  if (allow !== null && !allow.some((m) => matcherHits(m, names2, definition))) return false;
  if (context.project !== null && names2.some((name) => context.project.disabledMcpServers.includes(name))) return false;
  return true;
}
function projectServerApproved(context, name) {
  const disabled = /* @__PURE__ */ new Set([...context.layers.flatMap((l) => l.disabledMcpjsonServers), ...context.project?.disabledMcpjsonServers ?? []]);
  if (disabled.has(name)) return false;
  let approveAll = null;
  for (const layer of context.layers) if (layer.enableAllProjectMcpServers !== null) approveAll = layer.enableAllProjectMcpServers;
  if (approveAll === true) return true;
  const enabled = /* @__PURE__ */ new Set([...context.layers.flatMap((l) => l.enabledMcpjsonServers), ...context.project?.enabledMcpjsonServers ?? []]);
  return enabled.has(name);
}

// src/scan/names.ts
function toolForm(name) {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}
function callForm(name) {
  return toolForm(name).split("__")[0];
}
function mcpRecordNames(name, pluginName) {
  const forms = pluginName === null ? [name, callForm(name)] : [`plugin:${pluginName}:${name}`, callForm(`plugin_${pluginName}_${name}`)];
  return [...new Set(forms)].sort();
}
function skillRecordNames(dirName, declaredName, pluginName) {
  const bare = [dirName, ...declaredName === null ? [] : [declaredName]];
  if (pluginName === null) return [...new Set(bare)].sort();
  const prefix = `${pluginName}:`;
  return [...new Set(bare.map((name) => name.startsWith(prefix) ? name : `${prefix}${name}`))].sort();
}

// src/scan/permissions.ts
function conflictPairs(user, project, local) {
  const projectAllow = /* @__PURE__ */ new Set([...project?.allow ?? [], ...local?.allow ?? []]);
  const projectDeny = /* @__PURE__ */ new Set([...project?.deny ?? [], ...local?.deny ?? []]);
  let pairs = 0;
  for (const rule2 of new Set(user.allow)) if (projectDeny.has(rule2)) pairs++;
  for (const rule2 of new Set(user.deny)) if (projectAllow.has(rule2)) pairs++;
  return pairs;
}

// src/scan/projects.ts
import { dirname as dirname2, isAbsolute, join as join12, parse, resolve as resolve4 } from "node:path";
async function mainRootFromGitFile(dir, dotGit) {
  const text = await readText(dotGit);
  if (text.status !== "ok") return null;
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(text.text);
  if (match === null) return null;
  const gitDir = isAbsolute(match[1]) ? match[1] : resolve4(dir, match[1]);
  const common = await readText(join12(gitDir, "commondir"));
  if (common.status !== "ok") return null;
  const commonDir = resolve4(gitDir, common.text.trim());
  return parse(commonDir).base.toLowerCase() === ".git" ? dirname2(commonDir) : null;
}
async function gitRootFrom(start) {
  let dir = start;
  for (; ; ) {
    const dotGit = join12(dir, ".git");
    const info = await entryInfo(dotGit);
    if (info.exists && info.isDir) return dir;
    if (info.exists && info.isFile) return await mainRootFromGitFile(dir, dotGit) ?? dir;
    const parent = dirname2(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
var under = (path, base) => path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);
function isExcludedFolder(normRoot, normCwd, context) {
  const norm = (path) => normalizePath(path, context.platform);
  const specials = [context.homedir, join12(context.homedir, "Desktop"), join12(context.homedir, "Documents"), join12(context.homedir, "Downloads")].map(norm);
  const tmp = norm(context.tmpdir);
  const driveRoot = /^[a-z]:\/?$/i.test(normRoot) || normRoot === "/";
  return specials.includes(normRoot) || driveRoot || under(normRoot, tmp) || under(normCwd, tmp);
}
async function resolveProject(cwd, context) {
  const absolute = resolve4(cwd);
  const info = await entryInfo(absolute);
  const exists = info.exists && info.isDir;
  const gitRoot = exists ? await gitRootFrom(absolute) : null;
  const root = gitRoot ?? absolute;
  const normRoot = normalizePath(root, context.platform);
  const normCwd = normalizePath(absolute, context.platform);
  return { root, normRoot, kind: gitRoot === null ? "folder" : "git", exists, excluded: isExcludedFolder(normRoot, normCwd, context), cwds: [normCwd] };
}
async function groupProjects(cwds, context) {
  const byNormCwd = /* @__PURE__ */ new Map();
  for (const cwd of cwds) {
    const normCwd = normalizePath(cwd, context.platform);
    const previous = byNormCwd.get(normCwd);
    if (previous === void 0 || cwd < previous) byNormCwd.set(normCwd, cwd);
  }
  const byRoot = /* @__PURE__ */ new Map();
  for (const normCwd of [...byNormCwd.keys()].sort()) {
    const ref = await resolveProject(byNormCwd.get(normCwd), context);
    const existing = byRoot.get(ref.normRoot);
    if (existing === void 0) {
      byRoot.set(ref.normRoot, ref);
      continue;
    }
    existing.cwds.push(normCwd);
    existing.exists ||= ref.exists;
    existing.excluded ||= ref.excluded;
    if (ref.root < existing.root) existing.root = ref.root;
  }
  const out = [...byRoot.values()].sort((x, y) => x.normRoot < y.normRoot ? -1 : x.normRoot > y.normRoot ? 1 : 0);
  for (const ref of out) ref.cwds.sort();
  return out;
}

// src/scan/settings.ts
import { join as join13 } from "node:path";
var MERGE_MAX_DEPTH = 32;
function managedSettingsDir(platform) {
  if (platform === "win32") return "C:\\Program Files\\ClaudeCode";
  if (platform === "darwin") return "/Library/Application Support/ClaudeCode";
  return "/etc/claude-code";
}
async function readPart(path) {
  const read = await readJson(path);
  if (read.status !== "ok") return { part: { path, status: read.status }, value: null };
  if (!isObject4(read.value)) return { part: { path, status: "unparsable" }, value: null };
  return { part: { path, status: "ok" }, value: read.value };
}
async function readLayer(path) {
  const { part, value } = await readPart(path);
  return { parts: [part], value, hookSources: value !== null && Object.hasOwn(value, "hooks") ? [{ path, hooks: value.hooks }] : [] };
}
function unionList(before, next) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of [...before, ...next]) {
    const key = canonicalJson(item);
    if (key === null) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function mergeSettings(base, next, depth = 0) {
  const out = /* @__PURE__ */ Object.create(null);
  for (const key of Object.keys(base)) out[key] = base[key];
  for (const [key, value] of Object.entries(next)) {
    const before = Object.hasOwn(out, key) ? out[key] : void 0;
    if (Array.isArray(value)) {
      out[key] = unionList(Array.isArray(before) ? before : [], value);
    } else if (isObject4(value) && depth < MERGE_MAX_DEPTH) {
      out[key] = mergeSettings(isObject4(before) ? before : {}, value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}
function failClosedBoolean(value, restrictive) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return restrictive;
}
var SKILL_OVERRIDE_MODES = /* @__PURE__ */ new Set(["on", "name-only", "user-invocable-only", "off"]);
var PERMISSION_LISTS = /* @__PURE__ */ new Set(["allow", "deny", "ask"]);
var PERMISSION_GRANTS = ["allow", "additionalDirectories"];
var MANAGED_LISTS = /* @__PURE__ */ new Set(["deniedMcpServers", "enabledMcpjsonServers", "disabledMcpjsonServers"]);
function sanitizeManagedPart(value) {
  const out = /* @__PURE__ */ Object.create(null);
  for (const [key, v] of Object.entries(value)) {
    if (v === null) continue;
    if (key === "disableAllHooks") {
      if (typeof v === "boolean") out[key] = v;
    } else if (key === "allowManagedHooksOnly") {
      out[key] = failClosedBoolean(v, true);
    } else if (key === "enableAllProjectMcpServers") {
      out[key] = failClosedBoolean(v, false);
    } else if (key === "permissions") {
      if (!isObject4(v)) continue;
      const permissions = /* @__PURE__ */ Object.create(null);
      for (const [field, fv] of Object.entries(v)) {
        if (fv === null) continue;
        if (field === "defaultMode") permissions[field] = typeof fv === "string" ? fv : "default";
        else if (!PERMISSION_LISTS.has(field) || Array.isArray(fv)) permissions[field] = fv;
      }
      if (["deny", "ask"].some((field) => Object.hasOwn(v, field) && v[field] !== null && !Array.isArray(v[field]))) for (const grant of PERMISSION_GRANTS) delete permissions[grant];
      out[key] = permissions;
    } else if (key === "allowedMcpServers") {
      out[key] = Array.isArray(v) ? v : [];
    } else if (MANAGED_LISTS.has(key)) {
      if (Array.isArray(v)) out[key] = v;
    } else if (key === "enabledPlugins" || key === "skillOverrides") {
      if (!isObject4(v)) continue;
      const kept = Object.entries(v).filter(([, entry]) => key === "enabledPlugins" ? typeof entry === "boolean" : typeof entry === "string" && SKILL_OVERRIDE_MODES.has(entry));
      if (kept.length > 0) out[key] = Object.fromEntries(kept);
    } else {
      out[key] = v;
    }
  }
  return out;
}
async function readManagedLayer(dir) {
  const parts = [];
  const hookSources = [];
  let merged = null;
  const take = async (path) => {
    const { part, value } = await readPart(path);
    if (part.status === "missing") return;
    parts.push(part);
    if (value !== null) merged = mergeSettings(merged ?? {}, sanitizeManagedPart(value));
    if (value !== null && Object.hasOwn(value, "hooks") && value.hooks !== null) hookSources.push({ path, hooks: value.hooks });
  };
  await take(join13(dir, "managed-settings.json"));
  const dropIns = await listDir(join13(dir, "managed-settings.d"));
  if (dropIns.status === "ok") {
    for (const name of dropIns.names) if (!name.startsWith(".") && name.toLowerCase().endsWith(".json")) await take(join13(dir, "managed-settings.d", name));
  } else if (dropIns.status === "unreadable") {
    parts.push({ path: join13(dir, "managed-settings.d"), status: "unreadable" });
  }
  return { parts, value: merged, hookSources };
}
var strings3 = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
function matchers(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    if (!isObject4(item)) continue;
    const m = {};
    if (typeof item.serverName === "string") m.serverName = item.serverName;
    if (typeof item.serverUrl === "string") m.serverUrl = item.serverUrl;
    if (Array.isArray(item.serverCommand) && item.serverCommand.every((x) => typeof x === "string")) m.serverCommand = [...item.serverCommand];
    if (Object.keys(m).length > 0) out.push(m);
  }
  return out;
}
function viewOf(value) {
  const v = value ?? {};
  const permissions = isObject4(v.permissions) ? v.permissions : {};
  const overrides = /* @__PURE__ */ Object.create(null);
  if (isObject4(v.skillOverrides)) {
    for (const [name, mode2] of Object.entries(v.skillOverrides)) if (typeof mode2 === "string" && SKILL_OVERRIDE_MODES.has(mode2)) overrides[name] = mode2;
  }
  const plugins = /* @__PURE__ */ Object.create(null);
  if (isObject4(v.enabledPlugins)) {
    for (const [id, on] of Object.entries(v.enabledPlugins)) if (typeof on === "boolean") plugins[id] = on;
  }
  const mode = permissions.defaultMode;
  const defaultMode = typeof mode !== "string" ? null : mode === "bypassPermissions" ? "bypass" : "other";
  return {
    defaultMode,
    bypass: defaultMode === "bypass",
    allow: strings3(permissions.allow),
    deny: strings3(permissions.deny),
    skillOverrides: overrides,
    enabledPlugins: plugins,
    deniedMcpServers: matchers(v.deniedMcpServers),
    allowedMcpServers: Array.isArray(v.allowedMcpServers) ? matchers(v.allowedMcpServers) : null,
    enabledMcpjsonServers: strings3(v.enabledMcpjsonServers),
    disabledMcpjsonServers: strings3(v.disabledMcpjsonServers),
    enableAllProjectMcpServers: typeof v.enableAllProjectMcpServers === "boolean" ? v.enableAllProjectMcpServers : null,
    hooks: v.hooks,
    disableAllHooks: v.disableAllHooks === true,
    allowManagedHooksOnly: v.allowManagedHooksOnly === true
  };
}

// src/scan/skills.ts
import { createHash as createHash3 } from "node:crypto";
import { lstat as lstat6, readdir as readdir6, readFile as readFile4, realpath as realpath5 } from "node:fs/promises";
import { basename as basename4, join as join14, relative as relative2 } from "node:path";
var CONTENT_HASH_MAX_BYTES = 32 * 1024 * 1024;
var SIMPLE_ESCAPES2 = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "	",
  "	": "	",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1B",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\x85",
  _: "\xA0",
  L: "\u2028",
  P: "\u2029"
};
var HEX_ESCAPES = { x: 2, u: 4, U: 8 };
function readScalar(raw) {
  const s = raw.trim();
  if (s === "" || s.startsWith("#")) return "";
  const rest = (from) => {
    const tail = s.slice(from).trim();
    return tail === "" || tail.startsWith("#");
  };
  if (s[0] === '"') {
    let out = "";
    for (let i = 1; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\\") {
        const next = s[i + 1];
        if (next === void 0) return null;
        if (Object.hasOwn(SIMPLE_ESCAPES2, next)) {
          out += SIMPLE_ESCAPES2[next];
          i++;
          continue;
        }
        if (!Object.hasOwn(HEX_ESCAPES, next)) return null;
        const width = HEX_ESCAPES[next];
        const hex = s.slice(i + 2, i + 2 + width);
        if (!/^[0-9A-Fa-f]+$/.test(hex)) return null;
        const code = Number.parseInt(hex, 16);
        if (code > 1114111) return null;
        out += String.fromCodePoint(code);
        i += 1 + width;
        continue;
      }
      if (ch === '"') return rest(i + 1) ? out : null;
      out += ch;
    }
    return null;
  }
  if (s[0] === "'") {
    let out = "";
    for (let i = 1; i < s.length; i++) {
      const ch = s[i];
      if (ch === "'") {
        if (s[i + 1] === "'") {
          out += "'";
          i++;
          continue;
        }
        return rest(i + 1) ? out : null;
      }
      out += ch;
    }
    return null;
  }
  if ("|>[{&*!".includes(s[0])) return null;
  const comment = s.search(/\s#/);
  return (comment === -1 ? s : s.slice(0, comment)).trim();
}
var YAML_TRUE = /* @__PURE__ */ new Set(["true", "True", "TRUE"]);
var YAML_FALSE = /* @__PURE__ */ new Set(["false", "False", "FALSE"]);
function parseFrontmatter(text) {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const none = { present: false, fields: /* @__PURE__ */ Object.create(null), unreadable: [] };
  if (lines[0]?.trim() !== "---") return none;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return none;
  const fields = /* @__PURE__ */ Object.create(null);
  const unreadable = [];
  const mark = (key) => {
    if (!unreadable.includes(key)) unreadable.push(key);
  };
  if (lines[end] !== lines[end].trimStart()) mark("name");
  let previous = null;
  let nameSeen = false;
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    if (/^\s/.test(line)) {
      if (line.trimStart().startsWith("#")) continue;
      if (previous === null) mark("name");
      if (previous === "name") {
        mark("name");
        delete fields.name;
      }
      continue;
    }
    if (line.startsWith("#")) continue;
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line);
    if (match === null) {
      mark("name");
      previous = null;
      continue;
    }
    previous = match[1];
    if (previous === "name") {
      if (nameSeen) {
        mark("name");
        delete fields.name;
        continue;
      }
      nameSeen = true;
    }
    const value = readScalar(match[2] ?? "");
    if (value === null) mark(match[1]);
    else fields[match[1]] = value;
  }
  return { present: true, fields, unreadable };
}
async function contentHash(dir, maxBytes = CONTENT_HASH_MAX_BYTES) {
  let base;
  try {
    base = await realpath5(dir);
  } catch {
    return null;
  }
  const entries = [];
  let total = 0;
  const walk = async (current) => {
    let names2;
    try {
      names2 = (await readdir6(current)).sort();
    } catch {
      return false;
    }
    for (const name of names2) {
      const path = join14(current, name);
      let info;
      try {
        info = await lstat6(path);
      } catch {
        return false;
      }
      if (info.isSymbolicLink()) return false;
      if (info.isDirectory()) {
        if (!await walk(path)) return false;
        continue;
      }
      if (!info.isFile()) return false;
      total += info.size;
      if (total > maxBytes) return false;
      let data;
      try {
        data = await readFile4(path);
      } catch {
        return false;
      }
      const rel = relative2(base, path).replace(/\\/g, "/");
      entries.push(`${rel}\0${createHash3("sha256").update(data).digest("hex")}`);
    }
    return true;
  };
  if (!await walk(base)) return null;
  return createHash3("sha256").update(entries.sort().join("\n")).digest("hex");
}
async function readSkillFolder(path, dirName) {
  const info = await entryInfo(path);
  if (!info.isDir) return null;
  const skillMd = await readText(join14(path, "SKILL.md"));
  if (skillMd.status === "missing") return null;
  const front = skillMd.status === "ok" ? parseFrontmatter(skillMd.text) : { present: false, fields: /* @__PURE__ */ Object.create(null), unreadable: [] };
  const name = front.fields.name;
  return {
    dirName,
    path,
    realPath: info.realPath,
    isLink: info.isLink,
    createdMs: info.createdMs,
    targetCreatedMs: info.targetCreatedMs,
    readable: skillMd.status === "ok",
    hasFrontmatter: front.present,
    declaredName: name !== void 0 && name !== "" ? name : null,
    nameUnreadable: front.unreadable.includes("name"),
    // 읽지 못한 값은 기본값(모델이 부를 수 있음, 사람이 부를 수 있음)으로 둔다
    disableModelInvocation: YAML_TRUE.has(front.fields["disable-model-invocation"] ?? ""),
    userInvocable: !YAML_FALSE.has(front.fields["user-invocable"] ?? ""),
    contentHash: await contentHash(path)
  };
}
async function scanSkillRoot(dir, options = {}) {
  const out = { skills: [], danglingLinks: [], unreadableDirs: [], pluginDirs: [] };
  const listing = await listDir(dir);
  if (listing.status === "unreadable") out.unreadableDirs.push(dir);
  if (listing.status !== "ok") return out;
  for (const name of listing.names) {
    const path = join14(dir, name);
    const info = await entryInfo(path);
    if (info.dangling) {
      out.danglingLinks.push(path);
      continue;
    }
    if (options.pluginDirs === true && info.isDir && (await entryInfo(join14(path, ".claude-plugin", "plugin.json"))).isFile) {
      out.pluginDirs.push(path);
      continue;
    }
    const skill = await readSkillFolder(path, name);
    if (skill !== null) out.skills.push(skill);
  }
  return out;
}
async function scanSkillPath(path) {
  if ((await entryInfo(join14(path, "SKILL.md"))).isFile) {
    const single = await readSkillFolder(path, basename4(path));
    return { skills: single === null ? [] : [single], danglingLinks: [], unreadableDirs: [], pluginDirs: [] };
  }
  return scanSkillRoot(path);
}

// src/scan/claude.ts
var SKILL_SCOPE_ORDER = { user: 0, project: 1, plugin: 2 };
var MCP_SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 };
var OWNER_ORDER = { user: 0, managed: 1, plugin: 2, tool: 3 };
var cmp2 = (a, b) => (a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0;
var layerStatus = (layer) => layer.parts[0]?.status ?? "missing";
function mergeClaudeJsonEntries(entries) {
  if (entries.length === 0) return null;
  const union = (pick) => [...new Set(entries.flatMap(pick))].sort();
  return {
    key: entries[0].key,
    normKey: entries[0].normKey,
    mcpServers: entries.flatMap((e) => e.mcpServers),
    enabledMcpjsonServers: union((e) => e.enabledMcpjsonServers),
    disabledMcpjsonServers: union((e) => e.disabledMcpjsonServers),
    disabledMcpServers: union((e) => e.disabledMcpServers)
  };
}
function pluginEnabledIn(context, id, defaultEnabled) {
  if (Object.hasOwn(context.managed.enabledPlugins, id)) return context.managed.enabledPlugins[id];
  let value;
  for (const layer of context.ordered) if (Object.hasOwn(layer.enabledPlugins, id)) value = layer.enabledPlugins[id];
  return value ?? defaultEnabled;
}
function overrideIn(context, names2) {
  for (const name of names2) if (Object.hasOwn(context.managed.skillOverrides, name)) return context.managed.skillOverrides[name];
  let value = null;
  for (const layer of context.ordered) for (const name of names2) if (Object.hasOwn(layer.skillOverrides, name)) value = layer.skillOverrides[name];
  return value;
}
function managedHits(managed, names2, definition) {
  if (managed.allowedMcpServers !== null) return true;
  return !mcpAllowed({ layers: [managed], managed: { ...managed, allowedMcpServers: null }, project: null }, names2, definition);
}
var normalizedCommand = (text) => text.replace(/\\/g, "/").toLowerCase();
function usageOf(times) {
  let usageLastUsedMs = null;
  let usageUndated = false;
  for (const at of times) {
    if (at === void 0) continue;
    if (at === null) usageUndated = true;
    else if (usageLastUsedMs === null || at > usageLastUsedMs) usageLastUsedMs = at;
  }
  return { usageLastUsedMs, usageUndated };
}
async function scanClaudeSetup(input) {
  const home = claudeHome(input.env, input.homedir);
  const claudeJsonFile = claudeJsonPath(input.env, input.homedir);
  const claudeJson = await readClaudeJson(claudeJsonFile);
  const userLayer = await readLayer(join15(home, "settings.json"));
  const managedLayer = await readManagedLayer(input.managedDir ?? managedSettingsDir(input.platform));
  const userView = viewOf(userLayer.value);
  const managedView = viewOf(managedLayer.value);
  const problems = [];
  const unparsable = (layer, owner) => {
    for (const part of layer.parts) if (part.status === "unparsable") problems.push({ kind: "unparsable", owner, path: part.path });
  };
  unparsable(userLayer, "user");
  unparsable(managedLayer, "managed");
  if (claudeJson.status === "unparsable") problems.push({ kind: "unparsable", owner: "tool", path: claudeJsonFile });
  const refs = await groupProjects(input.cwds, { homedir: input.homedir, tmpdir: input.tmpdir, platform: input.platform });
  const global = { ordered: [userView], managed: managedView, mcp: { layers: [userView, managedView], managed: managedView, project: null } };
  const projectLayers = /* @__PURE__ */ new Map();
  const contexts = /* @__PURE__ */ new Map();
  const active = refs.filter((ref) => ref.exists && !ref.excluded);
  for (const ref of active) {
    const project = await readLayer(join15(ref.root, ".claude", "settings.json"));
    const local = await readLayer(join15(ref.root, ".claude", "settings.local.json"));
    unparsable(project, "user");
    unparsable(local, "user");
    projectLayers.set(ref.normRoot, { project, local });
    const projectView = viewOf(project.value);
    const localView = viewOf(local.value);
    const entry = mergeClaudeJsonEntries(claudeJson.projects.filter((p) => p.normKey === ref.normRoot));
    contexts.set(ref.normRoot, {
      ordered: [userView, projectView, localView],
      managed: managedView,
      mcp: { layers: [userView, projectView, localView, managedView], managed: managedView, project: entry }
    });
  }
  const everyContext = [global, ...contexts.values()];
  const globalRead = await readGlobalInstructions(home, active);
  const userSkillScan = await scanSkillRoot(join15(home, "skills"), { pluginDirs: true });
  const projectSkillScans = /* @__PURE__ */ new Map();
  for (const ref of active) projectSkillScans.set(ref.normRoot, await scanSkillRoot(join15(ref.root, ".claude", "skills"), { pluginDirs: true }));
  const skillsDirRefs = [
    ...userSkillScan.pluginDirs.map((path) => ({ path, scope: "user", projectRoot: null })),
    ...active.flatMap((ref) => projectSkillScans.get(ref.normRoot).pluginDirs.map((path) => ({ path, scope: "project", projectRoot: ref.normRoot })))
  ];
  const pluginsScan = await scanPlugins(home);
  const allPlugins = [...pluginsScan.plugins, ...await readSkillsDirPlugins(skillsDirRefs)].sort(
    (a, b) => cmp2(a.id, b.id) || cmp2(normalizePath(a.installPath), normalizePath(b.installPath))
  );
  const contextsOfPaths = (paths) => {
    const out = [];
    for (const ref of active) if (paths.some((path) => ref.normRoot === path || ref.cwds.includes(path))) out.push(contexts.get(ref.normRoot));
    return out;
  };
  const userScoped = (plugin) => plugin.scopes.some((scope) => scope !== "project" && scope !== "local");
  const pluginContexts = (plugin) => userScoped(plugin) ? everyContext : contextsOfPaths(plugin.projectPaths);
  const commandTexts = [
    ...hookCommandTexts(userView.hooks),
    ...managedLayer.hookSources.flatMap(({ hooks }) => hookCommandTexts(hooks)),
    ...[...contexts.values()].flatMap((c) => c.ordered.slice(1).flatMap((view) => hookCommandTexts(view.hooks))),
    ...allPlugins.flatMap((p) => p.hookEvents.flatMap(hookCommandTexts))
  ].map(normalizedCommand);
  const mentionedByHook = (skill) => {
    const fragments = [normalizePath(skill.path), skill.realPath ?? "", `/skills/${skill.dirName}`].filter((f) => f !== "").map((f) => f.toLowerCase());
    return commandTexts.some((text) => fragments.some((fragment) => text.includes(fragment)));
  };
  const skills = [];
  const unreadableDirs = [];
  const unreadableSkillPlaces = { user: false, projects: [], plugins: [] };
  const addSkill = (folder, fields) => {
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
      ...usageOf(fields.recordNames.map((name) => claudeJson.skillUsage[name]))
    });
  };
  const addOwnSkills = (scan, scope, projectRoot, scopeContexts) => {
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
        hookProvided: mentionedByHook(folder)
      });
    }
  };
  addOwnSkills(userSkillScan, "user", null, everyContext);
  for (const ref of active) addOwnSkills(projectSkillScans.get(ref.normRoot), "project", ref.normRoot, [contexts.get(ref.normRoot)]);
  const plugins = [];
  const mcpServers = [];
  for (const plugin of allPlugins) {
    if (plugin.manifest === "unparsable") problems.push({ kind: "unparsable", owner: "plugin", path: join15(plugin.installPath, ".claude-plugin", "plugin.json") });
    const enabledIn = pluginContexts(plugin).filter((context) => pluginEnabledIn(context, plugin.id, plugin.defaultEnabled));
    const hasHooks = plugin.components.includes("hooks");
    const pluginNames = [.../* @__PURE__ */ new Set([plugin.name, plugin.entryName])];
    const skillNames = [];
    const seenPaths = /* @__PURE__ */ new Set();
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
            hookProvided: hasHooks || mentionedByHook(folder)
          });
        }
      }
    }
    for (const server of plugin.mcpServers) {
      const recordNames = [...new Set(pluginNames.flatMap((pluginName) => mcpRecordNames(server.name, pluginName)))].sort();
      const denyNames = [.../* @__PURE__ */ new Set([...recordNames, server.name])];
      mcpServers.push({
        scope: "plugin",
        name: server.name,
        recordNames,
        projectRoot: null,
        pluginId: plugin.id,
        definitionHash: server.definition === null ? null : definitionHash(input.salt, server.definition),
        enabled: enabledIn.some((context) => mcpAllowed(context.mcp, denyNames, server.definition)),
        managedFixed: managedHits(managedView, denyNames, server.definition)
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
      ...usageOf(pluginNames.map((pluginName) => claudeJson.pluginUsage[`${pluginName}@${plugin.marketplace}`]))
    });
  }
  const installedIds = new Set(allPlugins.map((p) => p.id));
  const mentionedIds = new Set(Object.keys(managedView.enabledPlugins));
  for (const context of everyContext) for (const layer of context.ordered) for (const id of Object.keys(layer.enabledPlugins)) mentionedIds.add(id);
  const pluginsWithoutInstall = [...mentionedIds].filter((id) => !installedIds.has(id) && !id.endsWith("@builtin")).filter((id) => everyContext.some((context) => pluginEnabledIn(context, id, false))).sort();
  const addServer = (scope, entry, projectRoot, enabled) => {
    const names2 = mcpRecordNames(entry.name, null);
    mcpServers.push({
      scope,
      name: entry.name,
      recordNames: names2,
      projectRoot,
      pluginId: null,
      definitionHash: entry.definition === null ? null : definitionHash(input.salt, entry.definition),
      enabled,
      managedFixed: managedHits(managedView, names2, entry.definition)
    });
  };
  for (const entry of claudeJson.userMcpServers) {
    const names2 = mcpRecordNames(entry.name, null);
    addServer("user", entry, null, everyContext.some((context) => mcpAllowed(context.mcp, names2, entry.definition)));
  }
  const mcpJsonStatus = /* @__PURE__ */ new Map();
  for (const ref of active) {
    const context = contexts.get(ref.normRoot);
    const seen = /* @__PURE__ */ new Set();
    for (const entry of context.mcp.project?.mcpServers ?? []) {
      const identity = `${entry.name}\0${entry.definition === null ? "" : definitionHash(input.salt, entry.definition) ?? "deep"}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      addServer("local", entry, ref.normRoot, mcpAllowed(context.mcp, mcpRecordNames(entry.name, null), entry.definition));
    }
    const file = join15(ref.root, ".mcp.json");
    const read = await readJson(file);
    const entries = read.status === "ok" ? mcpMapOf(read.value) : null;
    const status = read.status !== "ok" ? read.status : entries === null ? "unparsable" : "ok";
    mcpJsonStatus.set(ref.normRoot, status);
    if (status === "unparsable") problems.push({ kind: "unparsable", owner: "user", path: file });
    for (const entry of entries ?? []) {
      const approved = projectServerApproved(context.mcp, entry.name) && mcpAllowed(context.mcp, mcpRecordNames(entry.name, null), entry.definition);
      addServer("project", entry, ref.normRoot, approved);
    }
  }
  const claudeAiNames = [.../* @__PURE__ */ new Set([...claudeJson.claudeAiEverConnected, ...input.claudeAiNames.filter((n) => n.startsWith("claude.ai "))])].sort();
  for (const name of claudeAiNames) {
    const names2 = mcpRecordNames(name, null);
    mcpServers.push({ scope: "claude-ai", name, recordNames: names2, projectRoot: null, pluginId: null, definitionHash: null, enabled: mcpAllowed(global.mcp, names2, null), managedFixed: managedHits(managedView, names2, null) });
  }
  const projects = [];
  for (const ref of refs) {
    const layers = projectLayers.get(ref.normRoot);
    const projectView = viewOf(layers?.project.value ?? null);
    const localView = viewOf(layers?.local.value ?? null);
    const settingsStatus = layers === void 0 ? null : layerStatus(layers.project);
    const localSettingsStatus = layers === void 0 ? null : layerStatus(layers.local);
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
      instructions: layers === void 0 ? emptyInstructionSet() : await readProjectInstructions(ref.root, globalRead.set),
      bypassInProject: projectView.bypass,
      bypassInLocal: localView.bypass,
      permissionConflicts: layers === void 0 ? 0 : conflictPairs(userView, settingsStatus === "ok" ? projectView : null, localSettingsStatus === "ok" ? localView : null)
    });
  }
  const managedPluginGuards = [];
  const userPluginGuards = [];
  const unreadablePlugins = [];
  for (const plugin of allPlugins) {
    if (!userScoped(plugin)) continue;
    const forced = managedView.enabledPlugins[plugin.id] === true;
    const userEnabled = !forced && userView.enabledPlugins[plugin.id] === true && pluginEnabledIn(global, plugin.id, plugin.defaultEnabled);
    if (!forced && !userEnabled) continue;
    if (plugin.hooksUnreadable) unreadablePlugins.push(plugin.id);
    for (const events of plugin.hookEvents) (forced ? managedPluginGuards : userPluginGuards).push(...preToolUseGuards(events, forced ? "managed-plugin" : "user-plugin", plugin.id));
  }
  const unreadableSettings = [];
  const settingsGuards = (layer, source) => layer.hookSources.flatMap(({ path, hooks }) => {
    if (hookMapValid(hooks)) return preToolUseGuards(hooks, source, null);
    unreadableSettings.push(path);
    return [];
  });
  const guards = [...settingsGuards(managedLayer, "managed"), ...managedPluginGuards, ...settingsGuards(userLayer, "user"), ...userPluginGuards];
  skills.sort((a, b) => cmp2(a.name, b.name) || SKILL_SCOPE_ORDER[a.scope] - SKILL_SCOPE_ORDER[b.scope] || cmp2(normalizePath(a.path), normalizePath(b.path)) || cmp2(a.pluginId, b.pluginId));
  mcpServers.sort((a, b) => cmp2(a.name, b.name) || MCP_SCOPE_ORDER[a.scope] - MCP_SCOPE_ORDER[b.scope] || cmp2(a.projectRoot, b.projectRoot) || cmp2(a.pluginId, b.pluginId) || cmp2(a.definitionHash, b.definitionHash));
  const uniqueProblems = [];
  for (const problem of new Map(problems.map((p) => [`${p.kind}\0${p.owner}\0${p.path}`, p])).values()) {
    uniqueProblems.push({ ...problem, realPath: (await entryInfo(problem.path)).realPath });
  }
  uniqueProblems.sort((a, b) => cmp2(a.path, b.path) || cmp2(a.kind, b.kind) || OWNER_ORDER[a.owner] - OWNER_ORDER[b.owner]);
  return {
    tool: "claude-code",
    home,
    claudeJson: claudeJson.status,
    globalInstructions: globalRead.set,
    globalMentions: globalRead.mentions,
    settings: {
      user: layerStatus(userLayer),
      managedParts: managedLayer.parts.map((part) => ({ path: part.path, status: part.status })),
      defaultMode: { user: userView.defaultMode, managed: managedView.defaultMode }
    },
    hooks: {
      guards,
      userDisableAll: userView.disableAllHooks,
      managedDisableAll: managedView.disableAllHooks,
      managedAllowManagedOnly: managedView.allowManagedHooksOnly,
      unreadablePlugins: unreadablePlugins.sort(),
      unreadableSettings
    },
    pluginsFile: pluginsScan.file,
    plugins,
    pluginsWithoutInstall,
    skills: skills.map((skill) => ({ ...skill, installKey: skillInstallKey(skill) })),
    mcpServers: mcpServers.map((server) => ({ ...server, installKey: mcpInstallKey(server) })),
    projects,
    problems: uniqueProblems,
    unreadableDirs: [...new Set(unreadableDirs)].sort(),
    unreadableSkillPlaces: { user: unreadableSkillPlaces.user, projects: [...new Set(unreadableSkillPlaces.projects)].sort(), plugins: [...new Set(unreadableSkillPlaces.plugins)].sort() }
  };
}

// src/commands/checkup-input.ts
var CLAUDE_AI_PREFIX = "claude.ai ";
async function gatherCheckupInput(options) {
  const collected = await collectClaude({ env: options.env, homedir: options.homedir, clock: options.clock, cacheDir: options.cacheDir, rescan: options.rescan });
  const { summaries } = collected;
  const collectDates = new Set(makeWindows(options.clock.nowMs, options.clock.timeZone).collectDates);
  const cwds = /* @__PURE__ */ new Set();
  const claudeAiNames = /* @__PURE__ */ new Set();
  const normalizedCwds = /* @__PURE__ */ Object.create(null);
  for (const summary of summaries) {
    if (summary.cwd !== null) normalizedCwds[summary.cwd] = normalizePath(summary.cwd, options.platform);
    const days = Object.entries(summary.days);
    if (summary.kind === "main" && summary.cwd !== null && days.some(([date, day]) => collectDates.has(date) && day.responses > 0)) cwds.add(summary.cwd);
    for (const [, day] of days) {
      for (const name of [...day.loadedMcpServers, ...Object.keys(day.mcpAttributions)]) if (name.startsWith(CLAUDE_AI_PREFIX)) claudeAiNames.add(name);
    }
  }
  const facts = await scanClaudeSetup({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    cwds: [...cwds].sort(),
    claudeAiNames: [...claudeAiNames].sort(),
    salt: options.state.salt,
    ...options.managedDir === void 0 ? {} : { managedDir: options.managedDir }
  });
  const unreadable = unreadableCount(collected.read);
  const observation = { skills: claudeObservation(summaries, unreadable, "skill"), mcp: claudeObservation(summaries, unreadable, "mcp") };
  const input = {
    clock: options.clock,
    tools: [
      {
        tool: "claude-code",
        summaries,
        coverage: CLAUDE_COVERAGE,
        shellTools: [...SHELL_TOOLS].sort(),
        complete: { skills: observation.skills.complete, mcp: observation.mcp.complete },
        setup: facts
      }
    ],
    projects: facts.projects,
    normalizedCwds: { ...normalizedCwds },
    installs: options.state.installs,
    self: options.self
  };
  const { fromCache: _fromCache, ...read } = collected.read;
  const tools = [{ tool: "claude-code", detected: collected.detected, visibleFrom: collected.visibleFrom, overlappingSessions: collected.overlappingSessions, read, observation }];
  return { input, collected, facts, tools };
}

// src/commands/run-notices.ts
var STEP = {
  result: { en: "the result file", ko: "\uD3C9\uAC00 \uACB0\uACFC \uD30C\uC77C\uC744" },
  state: { en: "the state file", ko: "\uC0C1\uD0DC \uD30C\uC77C\uC744" },
  history: { en: "the score history", ko: "\uC810\uC218 \uC774\uB825\uC744" }
};
var PRUNED = {
  reports: { en: "old result files", ko: "\uC624\uB798\uB41C \uACB0\uACFC \uD30C\uC77C\uC744" },
  cache: { en: "cache entries whose source is gone", ko: "\uC6D0\uBCF8\uC774 \uC5C6\uC5B4\uC9C4 \uCE90\uC2DC \uD56D\uBAA9\uC744" }
};
var FOLDER = {
  state: { en: "state", ko: "\uC0C1\uD0DC" },
  reports: { en: "results", ko: "\uACB0\uACFC" },
  cache: { en: "cache", ko: "\uCE90\uC2DC" }
};
var LINES2 = {
  en: {
    save_failed: "Could not write {step} to the state folder ({code}), so the rest was not saved.",
    prune_failed: "Could not clean up {what} ({code}). Saving itself finished.",
    prune_skipped: "The {link} folder is a link, so {what} were not cleaned up.",
    not_saved: "This run does not save, so nothing was written to the state folder. It did not use the cache and is not added to the score history.",
    result_unwritten: "Could not write the result file to the OS temp folder ({code}), so only the summary is given."
  },
  ko: {
    save_failed: "\uC0C1\uD0DC \uD3F4\uB354\uC5D0 {step} \uC4F0\uC9C0 \uBABB\uD574({code}) \uB0A8\uC740 \uC800\uC7A5\uC744 \uBA48\uCDC4\uC2B5\uB2C8\uB2E4.",
    prune_failed: "{what} \uC815\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4({code}). \uC800\uC7A5\uC740 \uB05D\uB0AC\uC2B5\uB2C8\uB2E4.",
    prune_skipped: "{link} \uD3F4\uB354\uAC00 \uB9C1\uD06C\uB77C\uC11C {what} \uC815\uB9AC\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
    not_saved: "\uC800\uC7A5\uD558\uC9C0 \uC54A\uB294 \uC2E4\uD589\uC774\uB77C \uC0C1\uD0DC \uD3F4\uB354\uC5D0 \uC544\uBB34\uAC83\uB3C4 \uC4F0\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC774 \uC810\uAC80\uC740 \uCE90\uC2DC\uB97C \uC4F0\uC9C0 \uC54A\uC558\uACE0 \uC810\uC218 \uC774\uB825\uC5D0\uB3C4 \uB0A8\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    result_unwritten: "\uD3C9\uAC00 \uACB0\uACFC \uD30C\uC77C\uC744 \uC6B4\uC601\uCCB4\uC81C \uC784\uC2DC \uD3F4\uB354\uC5D0 \uC4F0\uC9C0 \uBABB\uD574({code}) \uC694\uC57D\uB9CC \uB0C5\uB2C8\uB2E4."
  }
};
function runNoticeText(notice, lang) {
  const lines = LINES2[lang];
  switch (notice.kind) {
    case "save_failed":
      return fill(lines.save_failed, { step: STEP[notice.step][lang], code: notice.code });
    case "prune_failed":
      return fill(lines.prune_failed, { what: PRUNED[notice.what][lang], code: notice.code });
    case "prune_skipped":
      return fill(lines.prune_skipped, { link: FOLDER[notice.link][lang], what: PRUNED[notice.what][lang] });
    case "not_saved":
      return lines.not_saved;
    case "result_unwritten":
      return fill(lines.result_unwritten, { code: notice.code });
  }
}

// src/commands/self.ts
import { realpath as realpath6 } from "node:fs/promises";
import { basename as basename5, dirname as dirname3 } from "node:path";
var SELF_SKILL_NAMES = ["aq"];
var SELF_PLUGIN_NAMES = ["chunsik-garage"];
var BUNDLE_FILE = "aq.mjs";
async function selfIdentity(entryFile) {
  const skillRealPaths = [];
  if (basename5(entryFile) === BUNDLE_FILE && basename5(dirname3(entryFile)) === "scripts") {
    try {
      skillRealPaths.push(normalizePath(await realpath6(dirname3(dirname3(entryFile)))));
    } catch {
    }
  }
  return { skillNames: [...SELF_SKILL_NAMES], pluginNames: [...SELF_PLUGIN_NAMES], skillRealPaths };
}

// src/commands/checkup.ts
var codeOf = (error) => error?.code ?? "unknown";
async function runCheckup(options) {
  const now = options.now ?? Date.now;
  const started = now();
  const opened = await openState(options.stateDir);
  const gathered = await gatherCheckupInput({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    clock: options.clock,
    cacheDir: options.save ? join16(options.stateDir, "cache") : null,
    rescan: options.rescan,
    state: opened.state,
    self: await selfIdentity(options.entryFile),
    ...options.managedDir === void 0 ? {} : { managedDir: options.managedDir }
  });
  const evaluation = evaluate(gathered.input);
  const result = checkupResult({ input: gathered.input, evaluation, collected: gathered.tools, appVersion: PROGRAM_VERSION, lang: options.lang, run: { stateBroken: opened.broken } });
  const stamp = resultStamp(options.clock.nowMs);
  const notices = [];
  let saved = false;
  let resultPath = null;
  if (options.save) {
    let step = "result";
    try {
      resultPath = await writeResult(options.stateDir, stamp, result);
      step = "state";
      await saveState(options.stateDir, nextState(opened.state, gathered.facts, evaluation.windows.today, new Date(options.clock.nowMs).toISOString()));
      step = "history";
      await appendHistory(options.stateDir, historyEntry(evaluation, options.clock.nowMs));
      saved = true;
    } catch (error) {
      notices.push({ kind: "save_failed", step, code: codeOf(error) });
    }
    if (saved) {
      for (const [what, prune] of [["reports", () => pruneReports(options.stateDir, KEEP_REPORTS, stamp)], ["cache", () => pruneCache(options.stateDir)]]) {
        try {
          const report = await prune();
          if (report.skipped !== null) notices.push({ kind: "prune_skipped", what, link: report.skipped });
        } catch (error) {
          notices.push({ kind: "prune_failed", what, code: codeOf(error) });
        }
      }
    }
  } else {
    notices.push({ kind: "not_saved" });
  }
  if (resultPath === null) {
    try {
      resultPath = await writeTempResult(options.tmpdir, stamp, result);
    } catch (error) {
      notices.push({ kind: "result_unwritten", code: codeOf(error) });
    }
  }
  const run2 = { durationMs: now() - started, cachedFiles: gathered.collected.read.fromCache, saved, reportPath: null, resultPath, notices, text: { notices: notices.map((notice) => runNoticeText(notice, options.lang)) } };
  return { summary: checkupSummary(result, null), run: run2, result };
}

// src/core/copy/lang.ts
var LANGS = ["en", "ko"];
function supportedLang(tag) {
  if (typeof tag !== "string") return null;
  const primary = tag.trim().toLowerCase().split(/[-_.@]/)[0];
  return LANGS.find((lang) => lang === primary) ?? null;
}
function pickLang(flag, osLocale) {
  return supportedLang(flag) ?? supportedLang(osLocale) ?? "en";
}

// src/commands/clean.ts
import { lstat as lstat7, readdir as readdir7, realpath as realpath7 } from "node:fs/promises";
import { join as join17 } from "node:path";
var isMissing4 = (error) => error?.code === "ENOENT";
async function lstatOrNull(path) {
  try {
    return await lstat7(path);
  } catch (error) {
    if (isMissing4(error)) return null;
    throw error;
  }
}
async function cleanReports(path, boundary) {
  const names2 = (await readdir7(path)).sort();
  const base = (name) => name.replace(/\.[^.]*$/, "");
  let latest = null;
  for (const name of names2) {
    const info = await lstat7(join17(path, name));
    if (info.isFile() && (latest === null || base(name) > latest)) latest = base(name);
  }
  const removed = { name: "reports", files: 0, bytes: 0 };
  const kept = { name: "reports", files: 0, bytes: 0 };
  for (const name of names2) {
    const full = join17(path, name);
    const info = await lstat7(full);
    if (info.isFile() && base(name) === latest) {
      kept.files++;
      kept.bytes += info.size;
      continue;
    }
    const size = await removeTree(full, boundary);
    removed.files += size.files;
    removed.bytes += size.bytes;
  }
  return { removed, kept };
}
async function cleanEntry(dir, boundary, spec, level, report) {
  const path = join17(dir, spec.name);
  const info = await lstatOrNull(path);
  if (info === null) return;
  if (spec.name === "reports" && level === "clean") {
    if (info.isSymbolicLink()) {
      report.skipped.push(spec.name);
    } else if (info.isDirectory()) {
      const { removed, kept } = await cleanReports(path, boundary);
      if (removed.files > 0) report.removed.push(removed);
      if (kept.files > 0) report.kept.push(kept);
    }
    return;
  }
  if (spec.removedBy === "clean" || level === "all") {
    const size2 = await removeTree(path, boundary);
    if (info.isSymbolicLink()) report.unlinked.push(spec.name);
    else report.removed.push({ name: spec.name, files: size2.files, bytes: size2.bytes });
    return;
  }
  const size = await treeSize(path);
  report.kept.push({ name: spec.name, files: size.files, bytes: size.bytes });
}
async function clean(dir, level) {
  const report = { dir, level, link: false, removed: [], kept: [], unlinked: [], skipped: [], failed: [] };
  const dirInfo = await lstatOrNull(dir);
  if (dirInfo === null) return report;
  const boundary = await expectedRealDir(dir);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath7(dir)) !== boundary) {
    report.link = true;
    return report;
  }
  for (const spec of STATE_ENTRIES) {
    try {
      await cleanEntry(dir, boundary, spec, level, report);
    } catch (error) {
      report.failed.push({ name: spec.name, code: error.code ?? "unknown" });
    }
  }
  return report;
}

// src/commands/doctor.ts
import { mkdir as mkdir5, rm as rm3, writeFile as writeFile4 } from "node:fs/promises";
import { join as join18 } from "node:path";
import * as zlib from "node:zlib";
function hasZstd() {
  return typeof zlib.createZstdDecompress === "function";
}
async function canWrite(dir) {
  const probe = join18(dir, `.write-probe-${process.pid}`);
  try {
    await mkdir5(dir, { recursive: true });
    await writeFile4(probe, "ok");
    await rm3(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
async function doctor(input) {
  const home = claudeHome(input.env, input.homedir);
  const list = await listClaudeFiles(home, null);
  return {
    node: { version: input.nodeVersion, ok: input.nodeOk },
    zstd: hasZstd(),
    claudeCode: { home, projectsFound: list.projectsFound, sessionFiles: list.files.length, unreadable: list.unreadableDirs.length + list.unreadableFiles.length },
    state: { dir: input.stateDir, writable: await canWrite(input.stateDir) }
  };
}

// src/commands/where.ts
import { lstat as lstat8, readdir as readdir8 } from "node:fs/promises";
import { join as join19 } from "node:path";
var isMissing5 = (error) => error?.code === "ENOENT";
async function where(dir) {
  const report = { dir, exists: false, link: false, entries: [], files: 0, bytes: 0, others: [], noSaveResultsInOsTemp: true };
  let dirInfo;
  try {
    dirInfo = await lstat8(dir);
  } catch (error) {
    if (!isMissing5(error)) throw error;
  }
  report.exists = dirInfo !== void 0;
  report.link = dirInfo?.isSymbolicLink() ?? false;
  const inside2 = report.exists && !report.link;
  for (const spec of STATE_ENTRIES) {
    const entry = { name: spec.name, kind: spec.kind, exists: false, link: false, files: 0, bytes: 0, removedBy: spec.removedBy, unreadable: false };
    if (inside2) {
      try {
        const info = await lstat8(join19(dir, spec.name));
        entry.exists = true;
        entry.link = info.isSymbolicLink();
        if (!entry.link) {
          const size = await treeSize(join19(dir, spec.name));
          entry.files = size.files;
          entry.bytes = size.bytes;
        }
      } catch (error) {
        if (!isMissing5(error)) entry.unreadable = true;
      }
    }
    report.files += entry.files;
    report.bytes += entry.bytes;
    report.entries.push(entry);
  }
  if (inside2) {
    const known = new Set(STATE_ENTRIES.map((spec) => spec.name));
    report.others = (await readdir8(dir)).filter((name) => !known.has(name)).sort();
  }
  return report;
}

// src/cli.ts
function nodeMajorOk(version) {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}
var CHECKUP_FLAGS = /* @__PURE__ */ new Set(["--no-open", "--no-save", "--rescan"]);
function checkupArgs(rest) {
  const flags = /* @__PURE__ */ new Set();
  let lang = null;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg === "--lang") {
      const value = rest[index + 1];
      if (value === void 0 || value.startsWith("-")) return null;
      lang = value;
      index++;
    } else if (CHECKUP_FLAGS.has(arg)) {
      flags.add(arg);
    } else {
      return null;
    }
  }
  return { flags, lang };
}
var printJson = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
};
async function run(command, rest, context) {
  if (command === "doctor") {
    printJson(
      await doctor({
        env: context.env,
        homedir: context.homedir,
        nodeVersion: process.version,
        nodeOk: nodeMajorOk(process.version),
        stateDir: stateDir(context.homedir)
      })
    );
    return 0;
  }
  if (command === "where" && rest.length === 0) {
    printJson(await where(stateDir(context.homedir)));
    return 0;
  }
  if (command === "clean" && (rest.length === 0 || rest.length === 1 && rest[0] === "--all")) {
    printJson(await clean(stateDir(context.homedir), rest[0] === "--all" ? "all" : "clean"));
    return 0;
  }
  const args = command === "checkup" ? checkupArgs(rest) : null;
  if (args !== null) {
    const outcome = await runCheckup({
      env: context.env,
      homedir: context.homedir,
      tmpdir: context.tmpdir ?? tmpdir(),
      platform: context.platform ?? process.platform,
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale),
      stateDir: stateDir(context.homedir),
      save: !args.flags.has("--no-save"),
      rescan: args.flags.has("--rescan"),
      entryFile: context.entryFile ?? process.argv[1] ?? "",
      ...context.managedDir === void 0 ? {} : { managedDir: context.managedDir }
    });
    printJson({ summary: outcome.summary, run: outcome.run });
    return 0;
  }
  return null;
}
async function main(argv, context = { env: process.env, homedir: homedir() }) {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).
`);
    return 2;
  }
  const [command, ...rest] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}
`);
    return 0;
  }
  let code;
  try {
    code = await run(command, rest, context);
  } catch (error) {
    const err = error;
    printJson({ error: { code: err.code ?? "unexpected", message: err instanceof Error ? err.message : String(error) } });
    return 1;
  }
  if (code !== null) return code;
  process.stderr.write(`Unknown command: ${[command ?? "(none)", ...rest].join(" ")}
`);
  return 64;
}

// src/entry.ts
process.exitCode = await main(process.argv.slice(2));
