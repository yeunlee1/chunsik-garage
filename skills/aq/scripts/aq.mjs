// 춘식이 정비소 AQ 점검 실행 파일. src/를 묶은 빌드 결과라 직접 고치지 않는다.

// src/cli.ts
import { homedir } from "node:os";

// src/commands/doctor.ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join as join2 } from "node:path";
import * as zlib from "node:zlib";

// src/adapters/claude/locate.ts
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
function claudeHome(env, homedir2) {
  const fromEnv = env.CLAUDE_CONFIG_DIR?.trim();
  return fromEnv ? resolve(fromEnv) : join(homedir2, ".claude");
}
function normalizePath(path, platform = process.platform) {
  const absolute = resolve(path).replace(/\\/g, "/");
  return platform === "win32" ? absolute.toLowerCase() : absolute;
}
var isMissing = (error) => error?.code === "ENOENT";
async function listClaudeFiles(home, minMtimeMs) {
  const projects = join(home, "projects");
  const files = [];
  const unreadableDirs = [];
  const unreadableFiles = [];
  let olderThanWindow = 0;
  let projectEntries;
  try {
    projectEntries = await readdir(projects, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return { projectsFound: false, files: [], olderThanWindow: 0, unreadableDirs: [], unreadableFiles: [] };
    return { projectsFound: true, files: [], olderThanWindow: 0, unreadableDirs: [projects], unreadableFiles: [] };
  }
  const consider = async (path, sessionId, kind, parentSessionId) => {
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
  files.sort((a, b) => a.normPath < b.normPath ? -1 : a.normPath > b.normPath ? 1 : 0);
  unreadableDirs.sort();
  unreadableFiles.sort();
  return { projectsFound: true, files, olderThanWindow, unreadableDirs, unreadableFiles };
}

// src/commands/doctor.ts
function defaultStateDir(homedir2) {
  return join2(homedir2, ".chunsik-garage");
}
function hasZstd() {
  return typeof zlib.createZstdDecompress === "function";
}
async function canWrite(dir) {
  const probe = join2(dir, `.write-probe-${process.pid}`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(probe, "ok");
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
async function doctor(input) {
  const home = claudeHome(input.env, input.homedir);
  const list = await listClaudeFiles(home, null);
  return {
    node: { version: input.nodeVersion, ok: input.nodeOk },
    zstd: hasZstd(),
    claudeCode: { home, projectsFound: list.projectsFound, sessionFiles: list.files.length, unreadable: list.unreadableDirs.length + list.unreadableFiles.length },
    state: { dir: input.stateDir, writable: await canWrite(input.stateDir) }
  };
}

// src/version.ts
var PROGRAM_VERSION = "0.1.0";

// src/cli.ts
function nodeMajorOk(version) {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}
async function main(argv, context = { env: process.env, homedir: homedir() }) {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).
`);
    return 2;
  }
  const [command] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}
`);
    return 0;
  }
  if (command === "doctor") {
    const report = await doctor({
      env: context.env,
      homedir: context.homedir,
      nodeVersion: process.version,
      nodeOk: nodeMajorOk(process.version),
      stateDir: defaultStateDir(context.homedir)
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
    return 0;
  }
  process.stderr.write(`Unknown command: ${command ?? "(none)"}
`);
  return 64;
}

// src/entry.ts
process.exitCode = await main(process.argv.slice(2));
