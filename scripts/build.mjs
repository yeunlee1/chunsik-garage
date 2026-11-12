// 원본(src)을 묶어 skills/aq/scripts/aq.mjs를 만든다
import { build } from "esbuild";
import { BUNDLE_PATH, bundleOptions } from "./bundle-options.mjs";

await build({ ...bundleOptions, outfile: BUNDLE_PATH });
console.log(`묶음 완료: ${BUNDLE_PATH}`);
