// plugin-files.mjs의 타입 선언. 시험(TypeScript)이 가져다 쓴다
export declare const PLUGIN_PATHS: readonly string[];
export declare function packPlugin(root: string, out: string): Promise<string[]>;
