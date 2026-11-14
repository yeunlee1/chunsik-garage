// 사용자에게 배포할 플러그인 산출물을 받은 폴더에 만든다. 쓰는 법: node scripts/pack-plugin.mjs <담을 폴더>(「4단계 계획에서 보완」)
import { resolve } from "node:path";
import { packPlugin } from "./plugin-files.mjs";

const out = process.argv[2];
if (out === undefined) {
  console.error("쓰는 법: node scripts/pack-plugin.mjs <담을 폴더>");
  process.exit(1);
}
const files = await packPlugin(process.cwd(), resolve(out));
console.log(`플러그인 산출물 ${files.length}개를 ${resolve(out)}에 담았다`);
