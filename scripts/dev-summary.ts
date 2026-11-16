// 개발용. 이 PC의 Claude Code 기록을 읽어 합계·걸린 시간·메모리만 낸다. 이름, 경로, 본문은 내지 않는다
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { claudeObservation } from "../src/adapters/claude/observation.ts";
import { collectClaude, unreadableCount } from "../src/collect/claude.ts";

const useCache = process.argv.includes("--cache-twice");
const cacheDir = useCache ? mkdtempSync(join(tmpdir(), "aq-dev-cache-")) : null;
const clock = { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };

async function once(label: string) {
  const started = performance.now();
  const result = await collectClaude({ env: process.env, homedir: homedir(), clock, cacheDir, rescan: false });
  const seconds = (performance.now() - started) / 1000;
  const totals = { main: 0, sub: 0, responses: 0, humanRequests: 0, weakHumanRequests: 0, output: 0, interruptedTurns: 0, brokenLines: 0, tailFragments: 0, tooLongLines: 0 };
  for (const s of result.summaries) {
    if (s.kind === "main") totals.main++;
    else totals.sub++;
    totals.brokenLines += s.missing.brokenLines;
    totals.tailFragments += s.missing.tailFragments;
    totals.tooLongLines += s.missing.tooLongLines;
    for (const day of Object.values(s.days)) {
      totals.responses += day.responses;
      totals.humanRequests += day.humanRequests;
      totals.weakHumanRequests += day.weakHumanRequests;
      totals.output += day.tokens.output;
      totals.interruptedTurns += day.interruptedTurns;
    }
  }
  const gigabytes = result.read.bytes / 1024 ** 3;
  console.log(
    JSON.stringify(
      {
        label,
        seconds: Number(seconds.toFixed(2)),
        secondsPerGb: gigabytes > 0 ? Number((seconds / gigabytes).toFixed(2)) : null,
        peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
        read: { ...result.read, unreadableFiles: result.read.unreadableFiles.length, unreadableDirs: result.read.unreadableDirs.length },
        totals,
        overlappingSessions: result.overlappingSessions,
        observation: {
          skill: claudeObservation(result.summaries, unreadableCount(result.read), "skill"),
          mcp: claudeObservation(result.summaries, unreadableCount(result.read), "mcp"),
        },
      },
      null,
      2,
    ),
  );
}

try {
  await once(useCache ? "first (writes cache)" : "no cache");
  if (useCache) await once("second (reads cache)");
} finally {
  if (cacheDir !== null) rmSync(cacheDir, { recursive: true, force: true });
}
