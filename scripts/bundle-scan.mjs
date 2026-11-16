// 묶은 결과에 네트워크를 부르는 곳이 있는지 본다. 가져오기는 esbuild의 metafile로(정적·동적·require, node: 접두와 상관없이), 전역 이름과 경로를 글자로 정하지 않은 동적 가져오기는 글자로 본다(글자 검사는 보수적이라 문자열 속 같은 글자도 걸린다)
export const BANNED_MODULES = ["dgram", "dns", "http", "http2", "https", "net", "tls"];
/** fetch는 호출이 아니어도(선택적 호출, 다른 이름으로 받아 두기, globalThis["fetch"]) 이름이 보이면 건다. 묶음에는 동적 가져오기를 두지 않는다. */
export const BANNED_GLOBALS = [/\bfetch\b/, /\bWebSocket\b/, /\bXMLHttpRequest\b/, /\bEventSource\b/, /\bimport\s*\(/];

/** metafile의 출력이 가져오는 것 가운데 금지한 내장 모듈. "종류:경로"의 목록이다. */
export function bannedImports(metafile) {
  const found = new Set();
  for (const output of Object.values(metafile.outputs)) {
    for (const item of output.imports) {
      const name = item.path.replace(/^node:/, "").split("/")[0];
      if (BANNED_MODULES.includes(name)) found.add(`${item.kind}:${item.path}`);
    }
  }
  return [...found].sort();
}

/** 묶은 글에서 걸리는 전역 이름의 정규식 목록. */
export function bannedGlobals(code) {
  return BANNED_GLOBALS.filter((pattern) => pattern.test(code)).map(String);
}
