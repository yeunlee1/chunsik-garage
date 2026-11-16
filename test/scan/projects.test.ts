// 작업 폴더에서 프로젝트를 정하는 규칙을 시험한다. 깃 뿌리, 따로 떼어 낸 작업 폴더, 하위 모듈, 깃이 아닌 폴더, 없어진 폴더, 프로젝트로 보지 않는 폴더(설계 10)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { groupProjects, isExcludedFolder, resolveProject, type ProjectContext } from "../../src/scan/projects.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
let context: ProjectContext;
beforeEach(async () => {
  root = await makeTemp();
  // 시험 폴더가 OS 임시 폴더 아래에 있으므로 임시 폴더를 따로 정해 준다
  context = { homedir: join(root, "home"), tmpdir: join(root, "os-tmp"), platform: process.platform };
});
afterEach(async () => removeTemp(root));

describe("resolveProject", () => {
  it("위로 올라가며 처음 만나는 깃 저장소의 뿌리다", async () => {
    await mkdir(join(root, "repo", ".git"), { recursive: true });
    await mkdir(join(root, "repo", "src", "deep"), { recursive: true });
    const ref = await resolveProject(join(root, "repo", "src", "deep"), context);
    expect(ref).toMatchObject({ root: join(root, "repo"), kind: "git", exists: true, excluded: false });
    expect(ref.normRoot).toBe(normalizePath(join(root, "repo")));
  });

  it("따로 떼어 낸 작업 폴더는 본 저장소로 묶는다", async () => {
    const worktreeGit = join(root, "main", ".git", "worktrees", "wt1");
    await put(join(worktreeGit, "commondir"), "../..\n");
    await put(join(root, "wt1", ".git"), `gitdir: ${worktreeGit}\n`);
    const ref = await resolveProject(join(root, "wt1"), context);
    expect(ref).toMatchObject({ root: join(root, "main"), kind: "git" });
  });

  it("commondir가 없는 .git 파일(하위 모듈)은 그 폴더가 뿌리다", async () => {
    await mkdir(join(root, "super", ".git", "modules", "lib"), { recursive: true });
    await put(join(root, "super", "lib", ".git"), "gitdir: ../.git/modules/lib\n");
    const ref = await resolveProject(join(root, "super", "lib"), context);
    expect(ref).toMatchObject({ root: join(root, "super", "lib"), kind: "git" });
  });

  it("깃이 아니면 작업 폴더 자체가 프로젝트다", async () => {
    await mkdir(join(root, "plain"), { recursive: true });
    expect(await resolveProject(join(root, "plain"), context)).toMatchObject({ root: join(root, "plain"), kind: "folder", exists: true });
  });

  it("없어진 작업 폴더는 작업 폴더 자체를 프로젝트로 보고 없다고 적는다", async () => {
    expect(await resolveProject(join(root, "deleted"), context)).toMatchObject({ root: join(root, "deleted"), kind: "folder", exists: false });
  });
});

describe("프로젝트로 보지 않는 폴더", () => {
  const norm = (path: string): string => normalizePath(path);
  it("홈 자체, 바탕화면·문서·내려받기 자체, 임시 폴더 아래, 드라이브 뿌리", () => {
    const home = context.homedir;
    expect(isExcludedFolder(norm(home), norm(home), context)).toBe(true);
    expect(isExcludedFolder(norm(join(home, "Desktop")), norm(join(home, "Desktop")), context)).toBe(true);
    expect(isExcludedFolder(norm(join(home, "Downloads")), norm(join(home, "Downloads")), context)).toBe(true);
    expect(isExcludedFolder(norm(join(context.tmpdir, "x", "y")), norm(join(context.tmpdir, "x", "y")), context)).toBe(true);
    expect(isExcludedFolder("c:/", "c:/", context)).toBe(true);
    expect(isExcludedFolder("/", "/", context)).toBe(true);
  });
  it("그 아래의 폴더는 프로젝트다", () => {
    const desktopProject = norm(join(context.homedir, "Desktop", "notes"));
    expect(isExcludedFolder(desktopProject, desktopProject, context)).toBe(false);
    const work = norm(join(context.homedir, "dev", "app"));
    expect(isExcludedFolder(work, work, context)).toBe(false);
  });
});

describe("groupProjects", () => {
  it("같은 뿌리의 작업 폴더를 묶고 뿌리 차례로 낸다", async () => {
    await mkdir(join(root, "b-repo", ".git"), { recursive: true });
    await mkdir(join(root, "b-repo", "x"), { recursive: true });
    await mkdir(join(root, "a-plain"), { recursive: true });
    const projects = await groupProjects([join(root, "b-repo", "x"), join(root, "a-plain"), join(root, "b-repo"), join(root, "b-repo", "x")], context);
    expect(projects.map((p) => p.root)).toEqual([join(root, "a-plain"), join(root, "b-repo")]);
    expect(projects[1]!.cwds).toEqual([normalizePath(join(root, "b-repo")), normalizePath(join(root, "b-repo", "x"))].sort());
  });
  it.runIf(process.platform === "win32")("Windows에서 같은 폴더를 대소문자만 달리 적어도 원문 뿌리가 입력 차례와 상관없이 같다", async () => {
    await mkdir(join(root, "Repo", ".git"), { recursive: true });
    const upper = join(root, "Repo");
    const lower = join(root, "repo");
    const a = await groupProjects([upper, lower], context);
    const b = await groupProjects([lower, upper], context);
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
  });
});
