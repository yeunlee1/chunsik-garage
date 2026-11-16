// 원본(src)을 묶어 skills/aq/scripts/aq.mjs와 세션 시작 훅(hooks/session-start.mjs)을 만든다
import { build } from "esbuild";
import { BUNDLES } from "./bundle-options.mjs";

for (const { path, options } of BUNDLES) {
  await build({ ...options, outfile: path });
  console.log(`묶음 완료: ${path}`);
}
