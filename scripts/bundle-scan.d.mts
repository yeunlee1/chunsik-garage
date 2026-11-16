// bundle-scan.mjs의 타입 선언. 시험(TypeScript)이 가져다 쓴다
import type { Metafile } from "esbuild";

export declare const BANNED_MODULES: readonly string[];
export declare const BANNED_GLOBALS: readonly RegExp[];
export declare function bannedImports(metafile: Metafile): string[];
export declare function bannedGlobals(code: string): string[];
