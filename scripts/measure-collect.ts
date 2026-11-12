// 시험용. 주어진 홈 폴더의 Claude Code 기록을 모아 응답 수, 너무 긴 줄 수, 읽은 바이트, 걸린 시간, 최대 상주 메모리만 JSON 한 줄로 낸다
import { collectClaude } from "../src/collect/claude.ts";

const home = process.argv[2];
if (home === undefined) {
  console.error("쓰는 법: node scripts/run-ts.mjs scripts/measure-collect.ts <홈 폴더>");
  process.exit(64);
}
const started = performance.now();
const result = await collectClaude({
  env: {},
  homedir: home,
  clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "UTC" },
  cacheDir: null,
  rescan: true,
});
let responses = 0;
let tooLongLines = 0;
for (const summary of result.summaries) {
  tooLongLines += summary.missing.tooLongLines;
  for (const day of Object.values(summary.days)) responses += day.responses;
}
console.log(
  JSON.stringify({
    responses,
    tooLongLines,
    bytes: result.read.bytes,
    seconds: (performance.now() - started) / 1000,
    peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
  }),
);
