// 사용자가 가져온 웹 채팅 내보내기 파일의 자리를 상태 폴더의 web-exports.json에 적고 읽는다. 대화 글은 적지 않고 도구, 파일의 자리, 넣은 때만 둔다. 도구마다 마지막에 넣은 파일 하나다(설계 「0.5.0에서 정한 것」)
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WebToolId } from "../adapters/web/conversation.ts";
import { WEB_TOOLS } from "../adapters/web/observation.ts";

export const WEB_EXPORTS_FILE = "web-exports.json";
export const WEB_EXPORTS_SCHEMA = 1;

export interface WebExportEntry {
  tool: WebToolId;
  /** 넣을 때 받은 경로를 절대 경로로 바꾼 것 */
  path: string;
  /** 넣은 때(ISO) */
  addedAt: string;
}

export type WebExportsLoad = { status: "missing" | "ok"; entries: WebExportEntry[] } | { status: "broken"; entries: [] };

const isTool = (value: unknown): value is WebToolId => (WEB_TOOLS as readonly unknown[]).includes(value);

/** 읽는다. 파일이 없으면 missing, 모양이 어긋나면 broken(점검은 웹 채팅 없이 이어 간다)이다. 같은 도구가 둘이면 broken이다 */
export async function readWebExports(stateDir: string): Promise<WebExportsLoad> {
  let text: string;
  try {
    text = await readFile(join(stateDir, WEB_EXPORTS_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing", entries: [] };
    return { status: "broken", entries: [] };
  }
  try {
    const value = JSON.parse(text) as { schema?: unknown; exports?: unknown };
    if (value === null || typeof value !== "object" || value.schema !== WEB_EXPORTS_SCHEMA || !Array.isArray(value.exports)) return { status: "broken", entries: [] };
    const entries: WebExportEntry[] = [];
    for (const item of value.exports as unknown[]) {
      const entry = item as Partial<WebExportEntry> | null;
      if (entry === null || typeof entry !== "object" || !isTool(entry.tool) || typeof entry.path !== "string" || entry.path === "" || typeof entry.addedAt !== "string") return { status: "broken", entries: [] };
      if (entries.some((other) => other.tool === entry.tool)) return { status: "broken", entries: [] };
      entries.push({ tool: entry.tool, path: entry.path, addedAt: entry.addedAt });
    }
    entries.sort((a, b) => (a.tool < b.tool ? -1 : 1));
    return { status: "ok", entries };
  } catch {
    return { status: "broken", entries: [] };
  }
}

/** 쓴다. 비면 파일을 지운다. 임시 파일에 쓰고 이름을 바꾼다 */
export async function writeWebExports(stateDir: string, entries: readonly WebExportEntry[]): Promise<void> {
  const path = join(stateDir, WEB_EXPORTS_FILE);
  if (entries.length === 0) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(stateDir, { recursive: true });
  const sorted = [...entries].sort((a, b) => (a.tool < b.tool ? -1 : 1));
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ schema: WEB_EXPORTS_SCHEMA, exports: sorted }, null, 2)}\n`);
  await rename(temporary, path);
}

/** 그 도구의 자리를 바꾸거나 더한 목록 */
export function withExport(entries: readonly WebExportEntry[], entry: WebExportEntry): WebExportEntry[] {
  return [...entries.filter((other) => other.tool !== entry.tool), entry];
}
