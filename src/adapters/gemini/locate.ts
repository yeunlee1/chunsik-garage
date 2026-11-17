// 제미나이 CLI 기록 폴더를 찾고, 수집 구간에 걸리는 세션 파일(주 세션과 하위 에이전트 세션)의 목록을 정규화한 경로 차례로 만든다. 자리는 공개 소스 v0.68.0의 config/storage.ts·services/chatRecordingService.ts다(설계 「0.4.0에서 정한 것」)
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { normalizePath } from "../claude/locate.ts";
import type { SessionKind } from "../types.ts";

export interface GeminiLogFile {
  path: string;
  normPath: string;
  size: number;
  mtimeMs: number;
  /** 파일 이름에서 뺀 식별자. 세션 정보 줄에 sessionId가 없을 때 쓴다 */
  sessionId: string;
  kind: SessionKind;
  parentSessionId: string | null;
  /** 기록 폴더의 .project_root에 적힌 프로젝트 폴더. 옛 해시 폴더처럼 적힌 것이 없으면 null이다 */
  cwd: string | null;
  /** 옛 꼴(메시지 목록이 든 JSON 한 덩어리, .json)이다 */
  legacy: boolean;
}

export interface GeminiFileList {
  /** 기록 폴더(tmp)를 찾았다 */
  tmpFound: boolean;
  files: GeminiLogFile[];
  /** 수정 시각이 아래 경계보다 앞서 열지 않은 파일의 수 */
  olderThanWindow: number;
  /** 목록을 읽지 못해 안을 모르는 폴더(설계 9.8) */
  unreadableDirs: string[];
  /** 목록에는 있지만 크기와 수정 시각을 보지 못한 파일 */
  unreadableFiles: string[];
}

/** 제미나이 CLI의 전역 폴더. GEMINI_CLI_HOME이 있으면 그 아래, 없으면 홈 아래의 .gemini다(소스 utils/paths.ts의 homedir, config/storage.ts의 getGlobalGeminiDir) */
export function geminiHome(env: Record<string, string | undefined>, homedir: string): string {
  const fromEnv = env.GEMINI_CLI_HOME?.trim();
  return join(fromEnv ? resolve(fromEnv) : homedir, ".gemini");
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
const MAIN_FILE = /^session-.*\.(jsonl|json)$/;
const PROJECT_ROOT_FILE = ".project_root";
/** .project_root는 경로 하나다. 터무니없이 크면 읽지 않는다 */
const PROJECT_ROOT_MAX = 4096;

async function projectRootOf(dir: string): Promise<string | null> {
  try {
    const info = await stat(join(dir, PROJECT_ROOT_FILE));
    if (!info.isFile() || info.size > PROJECT_ROOT_MAX) return null;
    const text = (await readFile(join(dir, PROJECT_ROOT_FILE), "utf8")).trim();
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

/**
 * 기록 파일의 목록. tmp/<프로젝트>/chats/session-*.jsonl(옛 꼴은 .json)이 주 세션이고, tmp/<프로젝트>/chats/<부모 세션 ID>/*.jsonl이 하위 에이전트 세션이다.
 * minMtimeMs보다 오래 고치지 않은 파일은 열지 않는다
 */
export async function listGeminiFiles(home: string, minMtimeMs: number | null): Promise<GeminiFileList> {
  const tmp = join(home, "tmp");
  const files: GeminiLogFile[] = [];
  const unreadableDirs: string[] = [];
  const unreadableFiles: string[] = [];
  let olderThanWindow = 0;

  let projectEntries;
  try {
    projectEntries = await readdir(tmp, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return { tmpFound: false, files: [], olderThanWindow: 0, unreadableDirs: [], unreadableFiles: [] };
    return { tmpFound: true, files: [], olderThanWindow: 0, unreadableDirs: [tmp], unreadableFiles: [] };
  }

  const consider = async (path: string, entry: Omit<GeminiLogFile, "path" | "normPath" | "size" | "mtimeMs">): Promise<void> => {
    try {
      const info = await stat(path);
      if (minMtimeMs !== null && info.mtimeMs < minMtimeMs) {
        olderThanWindow++;
        return;
      }
      files.push({ path, normPath: normalizePath(path), size: info.size, mtimeMs: info.mtimeMs, ...entry });
    } catch {
      unreadableFiles.push(path);
    }
  };

  for (const project of projectEntries) {
    if (!project.isDirectory()) continue;
    const projectDir = join(tmp, project.name);
    const chats = join(projectDir, "chats");
    let entries;
    try {
      entries = await readdir(chats, { withFileTypes: true });
    } catch (error) {
      // 기록이 없는 프로젝트 폴더(검사점, 로그만 있는 것)는 chats가 없다
      if (!isMissing(error)) unreadableDirs.push(chats);
      continue;
    }
    const cwd = await projectRootOf(projectDir);
    const names = new Set(entries.map((entry) => entry.name));
    for (const entry of entries) {
      if (entry.isFile() && MAIN_FILE.test(entry.name)) {
        const legacy = entry.name.endsWith(".json");
        // 옛 꼴을 이어서 쓰면 제미나이가 같은 이름의 .jsonl로 모두 옮겨 적고 옛 파일을 남긴다. 둘 다 읽으면 같은 세션을 두 번 센다(소스 chatRecordingService.ts의 initialize)
        if (legacy && names.has(`${entry.name}l`)) continue;
        await consider(join(chats, entry.name), { sessionId: entry.name.slice(0, entry.name.lastIndexOf(".")), kind: "main", parentSessionId: null, cwd, legacy });
        continue;
      }
      if (!entry.isDirectory()) continue;
      const subDir = join(chats, entry.name);
      let subs;
      try {
        subs = await readdir(subDir, { withFileTypes: true });
      } catch {
        unreadableDirs.push(subDir);
        continue;
      }
      for (const sub of subs) {
        if (sub.isFile() && sub.name.endsWith(".jsonl")) {
          await consider(join(subDir, sub.name), { sessionId: sub.name.slice(0, -".jsonl".length), kind: "sub", parentSessionId: entry.name, cwd, legacy: false });
        }
      }
    }
  }

  files.sort((a, b) => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0));
  unreadableDirs.sort();
  unreadableFiles.sort();
  return { tmpFound: true, files, olderThanWindow, unreadableDirs, unreadableFiles };
}
