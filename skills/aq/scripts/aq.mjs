// 춘식이 정비소 AQ 점검 실행 파일. src/를 묶은 빌드 결과라 직접 고치지 않는다.

// src/cli.ts
import { homedir } from "node:os";

// src/commands/clean.ts
import { lstat as lstat2, readdir as readdir3, realpath as realpath2 } from "node:fs/promises";
import { join as join3 } from "node:path";

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

// src/state/folder.ts
import { lstat, readdir as readdir2, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join as join2 } from "node:path";
var STATE_DIR_NAME = ".chunsik-garage";
function stateDir(homedir2) {
  return join2(homedir2, STATE_DIR_NAME);
}
var STATE_ENTRIES = [
  { name: "cache", kind: "dir", removedBy: "clean" },
  { name: "reports", kind: "dir", removedBy: "clean" },
  { name: "history.jsonl", kind: "file", removedBy: "all" },
  { name: "state.json", kind: "file", removedBy: "all" },
  { name: "notified", kind: "dir", removedBy: "all" },
  { name: "tune", kind: "dir", removedBy: "all" }
];
var isMissing2 = (error) => error?.code === "ENOENT";
async function treeSize(path) {
  const total = { files: 0, bytes: 0, links: 0 };
  const walk = async (current) => {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing2(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      total.links++;
      return;
    }
    if (info.isDirectory()) {
      for (const name of (await readdir2(current)).sort()) await walk(join2(current, name));
      return;
    }
    total.files++;
    total.bytes += info.size;
  };
  await walk(path);
  return total;
}
async function removeLink(path) {
  try {
    await unlink(path);
  } catch (error) {
    const code = error.code;
    if (code === "EPERM" || code === "EISDIR") {
      await rmdir(path);
      return;
    }
    throw error;
  }
}
async function expectedRealDir(dir) {
  return normalizePath(join2(await realpath(dirname(dir)), basename(dir)));
}
var outside = (path) => Object.assign(new Error(`outside of the state folder: ${path}`), { code: "EOUTSIDE" });
async function assertInside(path, boundary, allowEqual) {
  const real = normalizePath(await realpath(path));
  if (real === boundary ? allowEqual : real.startsWith(`${boundary}/`)) return;
  throw outside(path);
}
async function removeTree(path, boundary) {
  const removed = { files: 0, bytes: 0, links: 0 };
  const walk = async (current) => {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing2(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      await assertInside(dirname(current), boundary, true);
      await removeLink(current);
      removed.links++;
      return;
    }
    if (info.isDirectory()) {
      await assertInside(current, boundary, false);
      for (const name of await readdir2(current)) await walk(join2(current, name));
      await assertInside(current, boundary, false);
      await rmdir(current);
      return;
    }
    await assertInside(dirname(current), boundary, true);
    await unlink(current);
    removed.files++;
    removed.bytes += info.size;
  };
  await walk(path);
  return removed;
}

// src/commands/clean.ts
var isMissing3 = (error) => error?.code === "ENOENT";
async function lstatOrNull(path) {
  try {
    return await lstat2(path);
  } catch (error) {
    if (isMissing3(error)) return null;
    throw error;
  }
}
async function cleanReports(path, boundary) {
  const names = (await readdir3(path)).sort();
  const base = (name) => name.replace(/\.[^.]*$/, "");
  let latest = null;
  for (const name of names) {
    const info = await lstat2(join3(path, name));
    if (info.isFile() && (latest === null || base(name) > latest)) latest = base(name);
  }
  const removed = { name: "reports", files: 0, bytes: 0 };
  const kept = { name: "reports", files: 0, bytes: 0 };
  for (const name of names) {
    const full = join3(path, name);
    const info = await lstat2(full);
    if (info.isFile() && base(name) === latest) {
      kept.files++;
      kept.bytes += info.size;
      continue;
    }
    const size = await removeTree(full, boundary);
    removed.files += size.files;
    removed.bytes += size.bytes;
  }
  return { removed, kept };
}
async function cleanEntry(dir, boundary, spec, level, report) {
  const path = join3(dir, spec.name);
  const info = await lstatOrNull(path);
  if (info === null) return;
  if (spec.name === "reports" && level === "clean") {
    if (info.isSymbolicLink()) {
      report.skipped.push(spec.name);
    } else if (info.isDirectory()) {
      const { removed, kept } = await cleanReports(path, boundary);
      if (removed.files > 0) report.removed.push(removed);
      if (kept.files > 0) report.kept.push(kept);
    }
    return;
  }
  if (spec.removedBy === "clean" || level === "all") {
    const size2 = await removeTree(path, boundary);
    if (info.isSymbolicLink()) report.unlinked.push(spec.name);
    else report.removed.push({ name: spec.name, files: size2.files, bytes: size2.bytes });
    return;
  }
  const size = await treeSize(path);
  report.kept.push({ name: spec.name, files: size.files, bytes: size.bytes });
}
async function clean(dir, level) {
  const report = { dir, level, link: false, removed: [], kept: [], unlinked: [], skipped: [], failed: [] };
  const dirInfo = await lstatOrNull(dir);
  if (dirInfo === null) return report;
  const boundary = await expectedRealDir(dir);
  if (dirInfo.isSymbolicLink() || normalizePath(await realpath2(dir)) !== boundary) {
    report.link = true;
    return report;
  }
  for (const spec of STATE_ENTRIES) {
    try {
      await cleanEntry(dir, boundary, spec, level, report);
    } catch (error) {
      report.failed.push({ name: spec.name, code: error.code ?? "unknown" });
    }
  }
  return report;
}

// src/commands/doctor.ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join as join4 } from "node:path";
import * as zlib from "node:zlib";
function hasZstd() {
  return typeof zlib.createZstdDecompress === "function";
}
async function canWrite(dir) {
  const probe = join4(dir, `.write-probe-${process.pid}`);
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

// src/commands/where.ts
import { lstat as lstat3, readdir as readdir4 } from "node:fs/promises";
import { join as join5 } from "node:path";
var isMissing4 = (error) => error?.code === "ENOENT";
async function where(dir) {
  const report = { dir, exists: false, link: false, entries: [], files: 0, bytes: 0, others: [], noSaveResultsInOsTemp: true };
  let dirInfo;
  try {
    dirInfo = await lstat3(dir);
  } catch (error) {
    if (!isMissing4(error)) throw error;
  }
  report.exists = dirInfo !== void 0;
  report.link = dirInfo?.isSymbolicLink() ?? false;
  const inside = report.exists && !report.link;
  for (const spec of STATE_ENTRIES) {
    const entry = { name: spec.name, kind: spec.kind, exists: false, link: false, files: 0, bytes: 0, removedBy: spec.removedBy, unreadable: false };
    if (inside) {
      try {
        const info = await lstat3(join5(dir, spec.name));
        entry.exists = true;
        entry.link = info.isSymbolicLink();
        if (!entry.link) {
          const size = await treeSize(join5(dir, spec.name));
          entry.files = size.files;
          entry.bytes = size.bytes;
        }
      } catch (error) {
        if (!isMissing4(error)) entry.unreadable = true;
      }
    }
    report.files += entry.files;
    report.bytes += entry.bytes;
    report.entries.push(entry);
  }
  if (inside) {
    const known = new Set(STATE_ENTRIES.map((spec) => spec.name));
    report.others = (await readdir4(dir)).filter((name) => !known.has(name)).sort();
  }
  return report;
}

// src/version.ts
var PROGRAM_VERSION = "0.1.0";

// src/cli.ts
function nodeMajorOk(version) {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}
var printJson = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
};
async function run(command, rest, context) {
  if (command === "doctor") {
    printJson(
      await doctor({
        env: context.env,
        homedir: context.homedir,
        nodeVersion: process.version,
        nodeOk: nodeMajorOk(process.version),
        stateDir: stateDir(context.homedir)
      })
    );
    return 0;
  }
  if (command === "where" && rest.length === 0) {
    printJson(await where(stateDir(context.homedir)));
    return 0;
  }
  if (command === "clean" && (rest.length === 0 || rest.length === 1 && rest[0] === "--all")) {
    printJson(await clean(stateDir(context.homedir), rest[0] === "--all" ? "all" : "clean"));
    return 0;
  }
  return null;
}
async function main(argv, context = { env: process.env, homedir: homedir() }) {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).
`);
    return 2;
  }
  const [command, ...rest] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}
`);
    return 0;
  }
  let code;
  try {
    code = await run(command, rest, context);
  } catch (error) {
    const err = error;
    printJson({ error: { code: err.code ?? "unexpected", message: err instanceof Error ? err.message : String(error) } });
    return 1;
  }
  if (code !== null) return code;
  process.stderr.write(`Unknown command: ${[command ?? "(none)", ...rest].join(" ")}
`);
  return 64;
}

// src/entry.ts
process.exitCode = await main(process.argv.slice(2));
