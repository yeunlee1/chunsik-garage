// 개발용. 이 PC의 Codex 셋팅을 스캐너로 읽어 종류별 개수와 걸린 시간만 낸다. 프로젝트 목록은 두 도구의 기록에서 얻는다. 이름, 경로, 값, 글은 내지 않는다
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { makeWindows } from "../src/adapters/common/dates.ts";
import { collectClaude } from "../src/collect/claude.ts";
import { collectCodex } from "../src/collect/codex.ts";
import { scanCodexSetup } from "../src/scan/codex.ts";
import { codexInstallKeysOf, codexUnseenInUnreadablePlace } from "../src/scan/identity.ts";

const clock = { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
const options = { env: process.env, homedir: homedir(), clock, cacheDir: null, rescan: false };
// 프로젝트 목록은 수집 구간에 응답이 있는 주 세션의 작업 폴더(첫 cwd)로 만들고 도구를 합친다(설계 10)
const collectDates = new Set(makeWindows(clock.nowMs, clock.timeZone).collectDates);
const summaries = [...(await collectClaude(options)).summaries, ...(await collectCodex(options)).summaries];
const mains = summaries.filter((s) => s.kind === "main" && Object.entries(s.days).some(([date, day]) => collectDates.has(date) && day.responses > 0));
const cwds = [...new Set(mains.flatMap((s) => (s.cwd === null ? [] : [s.cwd])))];

const started = performance.now();
const facts = await scanCodexSetup({ env: process.env, homedir: homedir(), tmpdir: tmpdir(), platform: process.platform, cwds, salt: randomBytes(32).toString("hex") });
const seconds = (performance.now() - started) / 1000;

const tally = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
const unseen = codexUnseenInUnreadablePlace(facts);
const keys = codexInstallKeysOf(facts);
console.log(
  JSON.stringify(
    {
      seconds: Number(seconds.toFixed(2)),
      mainSessions: mains.length,
      config: facts.config,
      safety: facts.safety,
      globalInstructions: { files: facts.globalInstructions.files.length, overBytes200: facts.globalInstructions.bytes >= 200, lines: facts.globalInstructions.lineHashes.length, unreadable: facts.globalInstructions.unreadable.length, projectsMentioned: Object.keys(facts.globalMentions).length },
      skills: {
        byScope: tally(facts.skills, (s) => s.scope),
        enabled: tally(facts.skills, (s) => `${s.scope}:${s.enabled}`),
        links: facts.skills.filter((s) => s.isLink).length,
        incomparable: facts.skills.filter((s) => s.contentHash === null).length,
        withoutCreatedTime: facts.skills.filter((s) => s.createdMs === null).length,
        unreadableSkillMd: facts.skills.filter((s) => !s.readable).length,
        nameUnreadable: facts.skills.filter((s) => s.nameUnreadable).length,
        sameNameCopies: Object.values(tally(facts.skills.filter((s) => s.scope !== "plugin" && !s.isLink), (s) => s.name)).filter((n) => n > 1).length,
      },
      mcpServers: { byScope: tally(facts.mcpServers, (s) => s.scope), enabled: tally(facts.mcpServers, (s) => `${s.scope}:${s.enabled}`), withoutDefinition: facts.mcpServers.filter((s) => s.definitionHash === null).length },
      plugins: {
        count: facts.plugins.length,
        configured: facts.plugins.filter((p) => p.configured).length,
        enabled: facts.plugins.filter((p) => p.enabled).length,
        install: tally(facts.plugins, (p) => p.install),
        manifest: tally(facts.plugins, (p) => p.manifest),
        idInvalid: facts.plugins.filter((p) => !p.idValid).length,
        compositionUnknown: facts.plugins.filter((p) => !p.compositionKnown).length,
        mcpUnreadable: facts.plugins.filter((p) => p.mcpUnreadable).length,
        withSkills: facts.plugins.filter((p) => p.skills.length > 0).length,
      },
      projects: {
        count: facts.projects.length,
        scanned: facts.projects.filter((p) => p.scanned).length,
        trust: tally(facts.projects, (p) => String(p.trust)),
        configStatus: tally(facts.projects, (p) => String(p.configStatus)),
        withInstructions: facts.projects.filter((p) => p.instructions.files.some((f) => f.hasContent)).length,
        unsafeContexts: facts.projects.filter((p) => p.safety !== null && p.safety.approval === "never" && p.safety.fullAccess).length,
      },
      problems: tally(facts.problems, (p) => `${p.kind}:${p.owner}`),
      unreadableDirs: facts.unreadableDirs.length,
      unreadableSkillPlaces: { user: facts.unreadableSkillPlaces.user, projects: facts.unreadableSkillPlaces.projects.length, plugins: facts.unreadableSkillPlaces.plugins.length },
      installKeys: keys.length,
      installKeysInUnreadablePlace: keys.filter(unseen).length,
    },
    null,
    2,
  ),
);
