// 결과 화면을 기본 브라우저로 여는 것을 시험한다. 운영체제마다의 열기 프로그램, 셸 없이 경로 하나만 넘기는 것, 띄우지 못하면 거짓을 돌려주는 것이다(설계 13.2, 20.1)
import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { openerFor, openInBrowser } from "../../src/commands/open.ts";

const PATH = "C:\\Users\\a b & c\\.chunsik-garage\\reports\\2026-11-14T00-00-00-000Z.html";

/** spawn 대신 쓰는 것. 부른 인자를 모으고, 다음 차례에 spawn이나 error 사건을 낸다. throws면 부르자마자 던진다 */
function fakeSpawn(outcome: "spawn" | "error" | "throws") {
  const calls: unknown[][] = [];
  const unref = vi.fn();
  const start = (...args: unknown[]) => {
    calls.push(args);
    if (outcome === "throws") throw new Error("bad arguments");
    const child = Object.assign(new EventEmitter(), { unref });
    queueMicrotask(() => (outcome === "spawn" ? child.emit("spawn") : child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))));
    return child;
  };
  return { start: start as unknown as typeof spawn, calls, unref };
}

describe("결과 화면 열기", () => {
  it("운영체제마다 파일을 기본 프로그램으로 여는 프로그램에 경로 하나만 넘긴다. 모르는 운영체제면 null이다", () => {
    expect(openerFor("win32", PATH)).toEqual({ command: "explorer.exe", args: [PATH] });
    expect(openerFor("darwin", PATH)).toEqual({ command: "open", args: [PATH] });
    expect(openerFor("linux", PATH)).toEqual({ command: "xdg-open", args: [PATH] });
    expect(openerFor("aix", PATH)).toBeNull();
  });

  it("셸 없이, 창 없이, 끝나기를 기다리지 않고 띄운다. 띄우면 참이다", async () => {
    const fake = fakeSpawn("spawn");
    expect(await openInBrowser(PATH, "win32", fake.start)).toBe(true);
    expect(fake.calls).toEqual([["explorer.exe", [PATH], { detached: true, stdio: "ignore", windowsHide: true, shell: false }]]);
    expect(fake.unref).toHaveBeenCalledTimes(1);
  });

  it("열기 프로그램을 띄우지 못하면(없다, 인자를 거절했다) 거짓이다. 모르는 운영체제면 띄우지 않고 거짓이다", async () => {
    expect(await openInBrowser(PATH, "linux", fakeSpawn("error").start)).toBe(false);
    expect(await openInBrowser(PATH, "darwin", fakeSpawn("throws").start)).toBe(false);
    const unknown = fakeSpawn("spawn");
    expect(await openInBrowser(PATH, "aix", unknown.start)).toBe(false);
    expect(unknown.calls).toEqual([]);
  });
});
