// 시험용 임시 폴더와 파일·폴더 링크를 만든다. Windows에서는 관리자 권한 없이 만들 수 있는 정션을 쓴다
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function makeTemp(prefix = "aq-test-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTemp(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/** 폴더를 가리키는 링크를 만든다(Windows는 정션, 그 밖은 심볼릭 링크). */
export async function linkDir(target: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
}

/** 상위 폴더를 만들며 파일을 쓴다. */
export async function put(path: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
