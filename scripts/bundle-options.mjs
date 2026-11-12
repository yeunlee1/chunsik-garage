// 묶은 실행 파일을 만드는 esbuild 설정. build와 check-bundle이 같이 쓴다
export const BUNDLE_PATH = "skills/aq/scripts/aq.mjs";

export const bundleOptions = {
  entryPoints: ["src/entry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  legalComments: "inline",
  banner: { js: "// 춘식이 정비소 AQ 점검 실행 파일. src/를 묶은 빌드 결과라 직접 고치지 않는다." },
  logLevel: "warning",
};
