// 개발용. 이 PC의 기록과 셋팅으로 규칙 스물둘을 재서 값, 점수, 등급을 숫자로 낸다. 이름, 경로, 글은 내지 않고 아무것도 저장하지 않는다
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { gatherCheckupInput } from "../src/commands/checkup-input.ts";
import { evaluate } from "../src/core/evaluate.ts";
import { NO_SELF } from "../src/core/installs/candidates.ts";
import { stateDir } from "../src/state/folder.ts";
import { loadState } from "../src/state/state.ts";

const clock = { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
// 상태 파일은 읽기만 한다. 없으면 이 실행에서만 쓰는 무작위 값으로 첫 점검처럼 본다
const loaded = await loadState(stateDir(homedir()));
const state = loaded.status === "ok" ? loaded.state : { salt: randomBytes(32).toString("hex"), installs: null };

const started = performance.now();
const gathered = await gatherCheckupInput({ env: process.env, homedir: homedir(), tmpdir: tmpdir(), platform: process.platform, clock, cacheDir: null, rescan: false, state, self: NO_SELF });
const gatherSeconds = (performance.now() - started) / 1000;
const evaluateStarted = performance.now();
const result = evaluate(gathered.input);
const evaluateSeconds = (performance.now() - evaluateStarted) / 1000;

const tally = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
const rounded = (value: number | null): number | null => (value === null ? null : Number(value.toFixed(4)));

console.log(
  JSON.stringify(
    {
      seconds: { gather: Number(gatherSeconds.toFixed(2)), evaluate: Number(evaluateSeconds.toFixed(3)) },
      rulesVersion: result.rulesVersion,
      windows: result.windows,
      state: { status: loaded.status, records: state.installs === null ? null : state.installs.length },
      score: result.score,
      axes: result.axes,
      findings: result.findings.map((finding) => ({
        ruleId: finding.ruleId,
        category: finding.category,
        status: finding.status,
        reason: finding.reason,
        value: rounded(finding.value),
        score: rounded(finding.score),
        severity: finding.severity,
        gain: finding.gain,
        evidence: finding.evidence,
        tools: finding.tools.map((tool) => ({ tool: tool.tool, status: tool.status, reason: tool.reason, value: rounded(tool.value), score: rounded(tool.score), evidence: tool.evidence, candidates: tool.candidates.length })),
        candidates: finding.candidates.length,
      })),
      candidates: tally(result.candidates, (candidate) => candidate.unit),
      tools: result.tools.map((tool) => ({
        tool: tool.tool,
        scored: tool.scored,
        inCalendar: tool.inCalendar,
        responses: tool.totals.responses,
        humanRequests: tool.totals.humanRequests,
        mainSessions: tool.totals.mainSessions.length,
        activeDays: tool.totals.activeDates.length,
        skillBundles: { enabled: tally(tool.skills.filter((bundle) => bundle.enabled), (bundle) => bundle.verdict), disabled: tool.skills.filter((bundle) => !bundle.enabled).length, excluded: tally(tool.skills.filter((bundle) => bundle.excluded !== null), (bundle) => bundle.excluded!) },
        servers: { enabled: tally(tool.servers.filter((judged) => judged.server.enabled), (judged) => judged.verdict), disabled: tool.servers.filter((judged) => !judged.server.enabled).length, excluded: tally(tool.servers.filter((judged) => judged.excluded !== null), (judged) => judged.excluded!) },
      })),
      safeguards: result.safeguards,
      projects: { used: result.projects.projects.length, unlinkedSessions: result.projects.unlinkedSessions, withoutInstructions: result.missingInstructions.length, overlapFound: result.worstOverlap !== null },
      complete: gathered.input.tools.map((tool) => tool.complete),
    },
    null,
    2,
  ),
);
