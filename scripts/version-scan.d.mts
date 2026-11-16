// version-scan.mjs의 타입 선언. 시험(TypeScript)이 가져다 쓴다
export declare const VERSION_FILES: readonly ["package.json", "src/version.ts", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".agents/plugins/marketplace.json"];

export interface VersionEntry {
  file: (typeof VERSION_FILES)[number];
  version: string | null;
  problem: string | null;
}

export declare function readVersions(root: string): VersionEntry[];
export declare function versionProblems(entries: readonly VersionEntry[]): string[];
