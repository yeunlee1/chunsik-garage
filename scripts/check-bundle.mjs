// 원본으로 다시 묶은 결과가 저장소의 aq.mjs와 같은지, 묶은 파일이 네트워크를 부르지 않는지 본다
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { BUNDLE_PATH, bundleOptions } from "./bundle-options.mjs";
import { bannedGlobals, bannedImports } from "./bundle-scan.mjs";

const result = await build({ ...bundleOptions, outfile: BUNDLE_PATH, write: false, metafile: true });
const fresh = result.outputFiles[0].text;
const committed = readFileSync(BUNDLE_PATH, "utf8").replace(/\r\n/g, "\n");
let failed = false;
if (fresh !== committed) {
  console.error("aq.mjs가 원본으로 다시 묶은 결과와 다르다. npm run build 뒤에 커밋한다.");
  failed = true;
}
for (const found of [...bannedImports(result.metafile), ...bannedGlobals(fresh)]) {
  console.error(`묶은 파일에 네트워크를 부르는 곳이 있다: ${found}`);
  failed = true;
}
if (failed) process.exit(1);
console.log("묶음 검사 통과");
