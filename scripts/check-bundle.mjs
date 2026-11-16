// 원본으로 다시 묶은 결과가 저장소의 묶음(aq.mjs, 세션 시작 훅)과 같은지, 묶은 파일이 네트워크를 부르지 않는지 본다
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { BUNDLES } from "./bundle-options.mjs";
import { bannedGlobals, bannedImports } from "./bundle-scan.mjs";

let failed = false;
for (const { path, options } of BUNDLES) {
  const result = await build({ ...options, outfile: path, write: false, metafile: true });
  const fresh = result.outputFiles[0].text;
  const committed = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  if (fresh !== committed) {
    console.error(`${path}가 원본으로 다시 묶은 결과와 다르다. npm run build 뒤에 커밋한다.`);
    failed = true;
  }
  for (const found of [...bannedImports(result.metafile), ...bannedGlobals(fresh)]) {
    console.error(`${path}에 네트워크를 부르는 곳이 있다: ${found}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("묶음 검사 통과");
