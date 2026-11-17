// aq doctor. Node.js 버전, 압축 기록을 풀 수 있는지, Claude Code와 Codex와 Gemini CLI의 기록 폴더, 상태 폴더에 쓸 수 있는지를 JSON으로 알린다(설계 6.3, 7.4, 9.1, 9.2, 「0.4.0에서 정한 것」)
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { claudeHome, listClaudeFiles } from "../adapters/claude/locate.ts";
import { codexHome, groupCopies, listCodexFiles } from "../adapters/codex/locate.ts";
import { geminiHome, geminiRecordHomes, listGeminiRecordFiles } from "../adapters/gemini/locate.ts";

export interface DoctorReport {
  node: { version: string; ok: boolean };
  zstd: boolean;
  claudeCode: { home: string; projectsFound: boolean; sessionFiles: number; unreadable: number };
  /** 기록 파일은 같은 식별자의 사본을 하나로 센다. 압축본만 있는 기록은 zstd를 풀 수 있어야 읽는다. 읽지 못한 것은 목록을 읽지 못한 폴더와 크기를 보지 못한 파일이다(설계 9.1, 9.2, 「5단계 계획 전 결정」 2번) */
  codex: { home: string; sessionsFound: boolean; recordFiles: number; compressedOnly: number; unreadable: number };
  /** 기록 파일은 주 세션과 하위 에이전트 세션의 파일이다(macOS 샌드박스의 <홈>/.cache/.gemini 것도 든다). 같은 이름의 .jsonl로 옮겨 적은 옛 .json은 세지 않는다 */
  gemini: { home: string; tmpFound: boolean; sessionFiles: number; unreadable: number };
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
  const codex = codexHome(input.env, input.homedir);
  const records = await listCodexFiles(codex, null);
  const groups = groupCopies(records.files);
  const gemini = geminiHome(input.env, input.homedir);
  const geminiList = await listGeminiRecordFiles(geminiRecordHomes(input.env, input.homedir), null);
  return {
    node: { version: input.nodeVersion, ok: input.nodeOk },
    zstd: hasZstd(),
    claudeCode: { home, projectsFound: list.projectsFound, sessionFiles: list.files.length, unreadable: list.unreadableDirs.length + list.unreadableFiles.length },
    codex: {
      home: codex,
      sessionsFound: records.sessionsFound,
      recordFiles: groups.length,
      compressedOnly: groups.filter((group) => group.copies.every((copy) => copy.compressed)).length,
      unreadable: records.unreadableDirs.length + records.files.filter((file) => file.size === null).length,
    },
    gemini: { home: gemini, tmpFound: geminiList.tmpFound, sessionFiles: geminiList.files.length, unreadable: geminiList.unreadableDirs.length + geminiList.unreadableFiles.length },
    state: { dir: input.stateDir, writable: await canWrite(input.stateDir) },
  };
}
