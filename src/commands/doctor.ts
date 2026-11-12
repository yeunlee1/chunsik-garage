// aq doctor. Node.js 버전, 압축 기록을 풀 수 있는지, Claude Code 기록 폴더, 상태 폴더에 쓸 수 있는지를 JSON으로 알린다(설계 6.3, 7.4)
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { claudeHome, listClaudeFiles } from "../adapters/claude/locate.ts";

export interface DoctorReport {
  node: { version: string; ok: boolean };
  zstd: boolean;
  claudeCode: { home: string; projectsFound: boolean; sessionFiles: number; unreadable: number };
  state: { dir: string; writable: boolean };
}

export function hasZstd(): boolean {
  return typeof (zlib as unknown as Record<string, unknown>).createZstdDecompress === "function";
}

async function canWrite(dir: string): Promise<boolean> {
  const probe = join(dir, `.write-probe-${process.pid}`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(probe, "ok");
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function doctor(input: {
  env: Record<string, string | undefined>;
  homedir: string;
  nodeVersion: string;
  nodeOk: boolean;
  stateDir: string;
}): Promise<DoctorReport> {
  const home = claudeHome(input.env, input.homedir);
  const list = await listClaudeFiles(home, null);
  return {
    node: { version: input.nodeVersion, ok: input.nodeOk },
    zstd: hasZstd(),
    claudeCode: { home, projectsFound: list.projectsFound, sessionFiles: list.files.length, unreadable: list.unreadableDirs.length + list.unreadableFiles.length },
    state: { dir: input.stateDir, writable: await canWrite(input.stateDir) },
  };
}
