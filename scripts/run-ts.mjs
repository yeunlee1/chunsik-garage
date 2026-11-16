// 개발용. TypeScript 파일 하나를 임시 폴더에 묶어 바로 실행한다(저장소에 묶음을 남기지 않는다)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const entry = process.argv[2];
if (entry === undefined) {
  console.error("쓰는 법: node scripts/run-ts.mjs <파일.ts> [인자…]");
  process.exit(64);
}
const dir = mkdtempSync(join(tmpdir(), "aq-dev-"));
try {
  const outfile = join(dir, "run.mjs");
  await build({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "warning" });
  process.argv.splice(2, 1);
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
