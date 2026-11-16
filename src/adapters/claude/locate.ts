// Claude Code 기록 폴더를 찾고, 수집 구간에 걸리는 세션 파일(주 세션과 하위 세션)의 목록을 정규화한 경로 차례로 만든다(설계 9.1, 9.2)
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SessionKind } from "../types.ts";

export interface LogFile {
  path: string;
  normPath: string;
  size: number;
  mtimeMs: number;
  sessionId: string;
  kind: SessionKind;
  parentSessionId: string | null;
}

export interface FileList {
  projectsFound: boolean;
  files: LogFile[];
  /** 수정 시각이 아래 경계보다 앞서 열지 않은 파일의 수 */
  olderThanWindow: number;
  /** 목록을 읽지 못해 안을 모르는 폴더(설계 9.8) */
  unreadableDirs: string[];
  /** 목록에는 있지만 크기와 수정 시각을 보지 못한 파일 */
  unreadableFiles: string[];
}

export function claudeHome(env: Record<string, string | undefined>, homedir: string): string {
  const fromEnv = env.CLAUDE_CONFIG_DIR?.trim();
  return fromEnv ? resolve(fromEnv) : join(homedir, ".claude");
}

export function normalizePath(path: string, platform: NodeJS.Platform = process.platform): string {
  const absolute = resolve(path).replace(/\\/g, "/");
  return platform === "win32" ? absolute.toLowerCase() : absolute;
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

export async function listClaudeFiles(home: string, minMtimeMs: number | null): Promise<FileList> {
  const projects = join(home, "projects");
  const files: LogFile[] = [];
  const unreadableDirs: string[] = [];
  const unreadableFiles: string[] = [];
  let olderThanWindow = 0;

  let projectEntries;
  try {
    projectEntries = await readdir(projects, { withFileTypes: true });
  } catch (error) {
    // 폴더가 없으면 기록이 없는 것이다. 그 밖의 오류(권한, 폴더가 아님 등)는 읽지 못한 것으로 알린다(설계 20.1).
    if (isMissing(error)) return { projectsFound: false, files: [], olderThanWindow: 0, unreadableDirs: [], unreadableFiles: [] };
    return { projectsFound: true, files: [], olderThanWindow: 0, unreadableDirs: [projects], unreadableFiles: [] };
  }

  const consider = async (path: string, sessionId: string, kind: SessionKind, parentSessionId: string | null): Promise<void> => {
    try {
      const info = await stat(path);
      if (minMtimeMs !== null && info.mtimeMs < minMtimeMs) {
        olderThanWindow++;
        return;
      }
      files.push({ path, normPath: normalizePath(path), size: info.size, mtimeMs: info.mtimeMs, sessionId, kind, parentSessionId });
    } catch {
      unreadableFiles.push(path);
    }
  };

  for (const project of projectEntries) {
    if (!project.isDirectory()) continue;
    const projectDir = join(projects, project.name);
    let entries;
    try {
      entries = await readdir(projectDir, { withFileTypes: true });
    } catch {
      unreadableDirs.push(projectDir);
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        await consider(join(projectDir, entry.name), entry.name.slice(0, -".jsonl".length), "main", null);
        continue;
      }
      if (!entry.isDirectory()) continue;
      const subDir = join(projectDir, entry.name, "subagents");
      let subs;
      try {
        subs = await readdir(subDir, { withFileTypes: true });
      } catch (error) {
        if (!isMissing(error)) unreadableDirs.push(subDir);
        continue;
      }
      for (const sub of subs) {
        if (sub.isFile() && sub.name.endsWith(".jsonl")) {
          await consider(join(subDir, sub.name), sub.name.slice(0, -".jsonl".length), "sub", entry.name);
        }
      }
    }
  }

  files.sort((a, b) => (a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0));
  unreadableDirs.sort();
  unreadableFiles.sort();
  return { projectsFound: true, files, olderThanWindow, unreadableDirs, unreadableFiles };
}
