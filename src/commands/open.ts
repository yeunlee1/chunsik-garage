// 결과 화면을 운영체제의 기본 브라우저로 연다. 셸을 거치지 않고 열기 프로그램에 경로 하나만 넘기며, 창을 띄우지 않고 끝나기를 기다리지 않는다(설계 13.2, 20.1)
import { spawn } from "node:child_process";

/** 운영체제마다 파일을 기본 프로그램으로 여는 명령. 모르는 운영체제면 null이다 */
export function openerFor(platform: NodeJS.Platform, path: string): { command: string; args: string[] } | null {
  if (platform === "win32") return { command: "explorer.exe", args: [path] };
  if (platform === "darwin") return { command: "open", args: [path] };
  if (platform === "linux" || platform === "freebsd" || platform === "openbsd") return { command: "xdg-open", args: [path] };
  return null;
}

/** 열기 프로그램을 띄운다. 띄우면 참이고, 띄우지 못하면(프로그램이 없다, 인자를 거절했다, 모르는 운영체제다) 거짓이다. 브라우저가 실제로 열렸는지는 알 수 없다 */
export function openInBrowser(path: string, platform: NodeJS.Platform = process.platform, start: typeof spawn = spawn): Promise<boolean> {
  const opener = openerFor(platform, path);
  if (opener === null) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const child = start(opener.command, opener.args, { detached: true, stdio: "ignore", windowsHide: true, shell: false });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
