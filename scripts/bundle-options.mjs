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

/** 세션 시작 훅의 묶음(설계 18.2). 같은 설정에 입구와 머리말만 다르다 */
export const HOOK_BUNDLE_PATH = "hooks/session-start.mjs";
export const hookBundleOptions = { ...bundleOptions, entryPoints: ["src/hook/session-start.ts"], banner: { js: "// 춘식이 정비소 세션 시작 알림. src/hook을 묶은 빌드 결과라 직접 고치지 않는다." } };

/** 묶는 것 둘(실행 파일, 훅) */
export const BUNDLES = [
  { path: BUNDLE_PATH, options: bundleOptions },
  { path: HOOK_BUNDLE_PATH, options: hookBundleOptions },
];
