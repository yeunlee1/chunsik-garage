// 설정 층 읽기를 시험한다. 층의 상태, 관리 정책의 드롭인 합치기, 쓰는 열쇠만 뽑기(설계 10 「관리 정책은 파일로 둔 것만 읽는다」)
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { managedSettingsDir, mergeSettings, readLayer, readManagedLayer, sanitizeManagedPart, unparsableParts, viewOf } from "../../src/scan/settings.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => removeTemp(root));

describe("readLayer", () => {
  it("없음, 풀리지 않음, 객체가 아님, 읽지 못함을 가른다", async () => {
    expect(await readLayer(join(root, "none.json"))).toEqual({ parts: [{ path: join(root, "none.json"), status: "missing" }], value: null, hookSources: [] });
    await put(join(root, "bad.json"), "{");
    expect((await readLayer(join(root, "bad.json"))).parts[0]!.status).toBe("unparsable");
    await put(join(root, "array.json"), "[1,2]");
    expect((await readLayer(join(root, "array.json"))).parts[0]!.status).toBe("unparsable");
    await mkdir(join(root, "dir.json"));
    expect((await readLayer(join(root, "dir.json"))).parts[0]!.status).toBe("unreadable");
    await put(join(root, "ok.json"), JSON.stringify({ model: "x" }));
    expect(await readLayer(join(root, "ok.json"))).toEqual({ parts: [{ path: join(root, "ok.json"), status: "ok" }], value: { model: "x" }, hookSources: [] });
  });
});

describe("관리 정책", () => {
  it("OS마다 공식 문서의 폴더다", () => {
    expect(managedSettingsDir("win32")).toBe("C:\\Program Files\\ClaudeCode");
    expect(managedSettingsDir("darwin")).toBe("/Library/Application Support/ClaudeCode");
    expect(managedSettingsDir("linux")).toBe("/etc/claude-code");
  });

  it("파일을 먼저, 드롭인을 이름 차례로 합친다. 숨긴 파일과 .json이 아닌 것은 뺀다", async () => {
    await put(join(root, "managed-settings.json"), JSON.stringify({ model: "a", permissions: { deny: ["Bash(rm *)"], defaultMode: "default" } }));
    await put(join(root, "managed-settings.d", "20-b.json"), JSON.stringify({ model: "c", permissions: { deny: ["Read(.env)", "Bash(rm *)"] } }));
    await put(join(root, "managed-settings.d", "10-a.json"), JSON.stringify({ model: "b", disableAllHooks: true }));
    await put(join(root, "managed-settings.d", ".hidden.json"), JSON.stringify({ model: "hidden" }));
    await put(join(root, "managed-settings.d", "notes.txt"), "x");
    const layer = await readManagedLayer(root);
    expect(layer.parts.map((p) => p.path)).toEqual([
      join(root, "managed-settings.json"),
      join(root, "managed-settings.d", "10-a.json"),
      join(root, "managed-settings.d", "20-b.json"),
    ]);
    expect(layer.value).toEqual({ model: "c", disableAllHooks: true, permissions: { deny: ["Bash(rm *)", "Read(.env)"], defaultMode: "default" } });
  });

  it("hooks는 합친 값과 따로 파일마다(그 열쇠가 있는 파일만, 파일 차례로) 들고 온다. 모양이 달라도 그대로 든다", async () => {
    await put(join(root, "managed-settings.json"), JSON.stringify({ hooks: { PreToolUse: [] } }));
    await put(join(root, "managed-settings.d", "10-a.json"), JSON.stringify({ model: "b" }));
    await put(join(root, "managed-settings.d", "20-b.json"), JSON.stringify({ hooks: "x" }));
    expect((await readManagedLayer(root)).hookSources).toEqual([
      { path: join(root, "managed-settings.json"), hooks: { PreToolUse: [] } },
      { path: join(root, "managed-settings.d", "20-b.json"), hooks: "x" },
    ]);
    await put(join(root, "user.json"), JSON.stringify({ hooks: null }));
    expect((await readLayer(join(root, "user.json"))).hookSources).toEqual([{ path: join(root, "user.json"), hooks: null }]);
  });

  it("관리 정책은 파일마다 틀린 값을 공식 문서의 규칙으로 고친 뒤 합친다. 뒤 파일의 틀린 값이 앞 파일의 맞는 값을 덮지 않는다", async () => {
    await put(join(root, "managed-settings.json"), JSON.stringify({ disableAllHooks: true, permissions: { defaultMode: "bypassPermissions", deny: ["Read(.env)"] }, enabledPlugins: { "a@m": true }, skillOverrides: { s: "off" }, enableAllProjectMcpServers: true }));
    await put(join(root, "managed-settings.d", "10-bad.json"), JSON.stringify({ disableAllHooks: "true", permissions: { defaultMode: 5, deny: "x" }, enabledPlugins: { "a@m": "yes", "b@m": true }, skillOverrides: { s: "offf", u: "", t: "on" }, allowManagedHooksOnly: "yes", enableAllProjectMcpServers: "maybe" }));
    const view = viewOf((await readManagedLayer(root)).value);
    // disableAllHooks는 틀리면(글자 참거짓도) 버린다. defaultMode가 틀리면 default로 읽는다. 엄한 값이 하나인 열쇠는 틀리면 그 엄한 값이다. 틀린 목록과 항목은 버린다
    expect(view).toMatchObject({ disableAllHooks: true, defaultMode: "other", bypass: false, deny: ["Read(.env)"], allowManagedHooksOnly: true, enableAllProjectMcpServers: false });
    expect({ ...view.enabledPlugins }).toEqual({ "a@m": true, "b@m": true });
    expect({ ...view.skillOverrides }).toEqual({ s: "off", t: "on" });
    // null은 그 열쇠를 지운다(엄한 값으로 읽지 않는다). 글자 "true"·"false"는 그 참거짓이다. hooks가 null인 파일은 훅 출처가 아니다
    await put(join(root, "managed-settings.d", "10-bad.json"), JSON.stringify({ allowManagedHooksOnly: null, disableAllHooks: null, enableAllProjectMcpServers: "true", hooks: null }));
    const second = await readManagedLayer(root);
    expect(viewOf(second.value)).toMatchObject({ allowManagedHooksOnly: false, disableAllHooks: true, enableAllProjectMcpServers: true });
    expect(second.hookSources).toEqual([]);
    await put(join(root, "managed-settings.d", "10-bad.json"), JSON.stringify({ allowManagedHooksOnly: "false" }));
    expect(viewOf((await readManagedLayer(root)).value).allowManagedHooksOnly).toBe(false);
    // deny나 ask를 전혀 읽지 못하면 같은 곳의 allow를 보류한다. 맞는 목록이나 null이면 그대로다
    expect(viewOf(sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], deny: "bad" } })).allow).toEqual([]);
    expect(viewOf(sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], ask: 3 } })).allow).toEqual([]);
    expect(viewOf(sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], deny: ["Read(.env)"] } })).allow).toEqual(["Bash(*)"]);
    expect(viewOf(sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], deny: null } })).allow).toEqual(["Bash(*)"]);
    // additionalDirectories도 함께 보류한다. viewOf는 이 칸을 내지 않으므로 고친 결과를 직접 본다(계획 리뷰 7차 짝 2 X01)
    for (const limit of [{ deny: "bad" }, { ask: 3 }]) {
      const withheld = sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], additionalDirectories: ["/x"], ...limit } }).permissions as Record<string, unknown>;
      expect(Object.hasOwn(withheld, "allow") || Object.hasOwn(withheld, "additionalDirectories")).toBe(false);
    }
    for (const limit of [{ deny: ["Read(.env)"] }, { ask: ["Bash(rm *)"] }, { deny: null }]) {
      const kept = sanitizeManagedPart({ permissions: { allow: ["Bash(*)"], additionalDirectories: ["/x"], ...limit } }).permissions as Record<string, unknown>;
      expect(kept.additionalDirectories).toEqual(["/x"]);
    }
    // 허용 목록이 틀리면 빈 허용 목록이다(사용자가 더한 서버를 모두 막는다)
    await rm(join(root, "managed-settings.d"), { recursive: true, force: true });
    await put(join(root, "managed-settings.json"), JSON.stringify({ allowedMcpServers: "x" }));
    expect(viewOf((await readManagedLayer(root)).value).allowedMcpServers).toEqual([]);
  });

  it("관리 정책이 없으면 파일도 값도 없다. 풀리지 않는 드롭인은 따로 알린다", async () => {
    expect(await readManagedLayer(join(root, "none"))).toEqual({ parts: [], value: null, hookSources: [] });
    await put(join(root, "m", "managed-settings.d", "a.json"), "{oops");
    const layer = await readManagedLayer(join(root, "m"));
    expect(unparsableParts(layer)).toEqual([join(root, "m", "managed-settings.d", "a.json")]);
    expect(layer.value).toBeNull();
  });

  it("합치기: 값 하나는 뒤가 이기고, 목록은 중복 없이 합치고, 묶음은 열쇠마다 합친다", () => {
    expect(mergeSettings({ a: 1, list: [1, 2], env: { X: "1", Y: "1" } }, { a: 2, list: [2, 3], env: { Y: "2" } })).toEqual({
      a: 2,
      list: [1, 2, 3],
      env: { X: "1", Y: "2" },
    });
  });

  it("합치기: 앞 목록 안, 뒤 목록 안, 둘 사이의 중복을 모두 빼고, 같은지는 열쇠를 세운 JSON으로 본다", () => {
    expect(mergeSettings({ list: ["a", "a"] }, { list: ["b", "b", "a"] })).toEqual({ list: ["a", "b"] });
    expect(mergeSettings({ hooks: [{ x: 1, y: 2 }] }, { hooks: [{ y: 2, x: 1 }] })).toEqual({ hooks: [{ x: 1, y: 2 }] });
  });

  it("합치기: 앞에 없던 열쇠의 목록과 새 하위 묶음 안의 목록도 중복을 뺀다", () => {
    expect(mergeSettings({}, { list: ["a", "a"] })).toEqual({ list: ["a"] });
    const hook = { matcher: "Bash", hooks: [{ type: "command", command: "x" }] };
    expect(mergeSettings({}, { hooks: { PreToolUse: [hook, { ...hook }] } })).toEqual({ hooks: { PreToolUse: [hook] } });
  });

  it("합치기 결과는 원형이 없는 묶음이다. __proto__·constructor·prototype 열쇠가 설정 값을 만들지 않는다", () => {
    const merged = mergeSettings({}, JSON.parse('{"__proto__":{"permissions":{"defaultMode":"bypassPermissions"}},"constructor":{"x":1},"prototype":{"y":2}}') as Record<string, unknown>);
    expect(Object.hasOwn(merged, "permissions")).toBe(false);
    expect(viewOf(merged).defaultMode).toBeNull();
  });

  it("관리 정책 파일의 __proto__ 열쇠는 기본 모드를 만들지 않는다", async () => {
    const dir = join(root, "managed");
    await put(join(dir, "managed-settings.json"), '{"__proto__":{"permissions":{"defaultMode":"bypassPermissions"}}}');
    expect(viewOf((await readManagedLayer(dir)).value).defaultMode).toBeNull();
  });

  it("합치기: 아주 깊게 중첩된 목록 항목과 묶음에도 던지지 않는다. 겹침을 볼 수 없는 항목은 그대로 넣는다", () => {
    const deepList = JSON.parse(`${"[".repeat(200_000)}${"]".repeat(200_000)}`) as unknown;
    const deepObject = JSON.parse(`${'{"a":'.repeat(200_000)}1${"}".repeat(200_000)}`) as Record<string, unknown>;
    const merged = mergeSettings({ list: [deepList], env: deepObject }, { list: [deepList, "x"], env: deepObject });
    expect(merged.list).toHaveLength(3);
    expect((merged.list as unknown[])[2]).toBe("x");
    // 묶음은 깊은 곳에서 합치기를 멈추고 뒤의 값을 쓴다. 내용은 끝까지 남는다(재귀 없이 따라가 본다)
    let node: unknown = merged.env;
    let depth = 0;
    while (typeof node === "object" && node !== null && "a" in node) {
      node = (node as { a: unknown }).a;
      depth += 1;
    }
    expect(depth).toBe(200_000);
    expect(node).toBe(1);
  });
});

describe("viewOf", () => {
  it("쓰는 열쇠만 뽑고 모양이 다른 값은 버린다", () => {
    const view = viewOf({
      permissions: { defaultMode: "bypassPermissions", allow: ["Bash(git *)", 3], deny: "nope" },
      skillOverrides: { a: "off", b: 1, c: "offf", d: "", e: "name-only" },
      enabledPlugins: { "p@m": true, "q@m": "yes" },
      deniedMcpServers: [{ serverName: "x" }, { serverUrl: "https://e.example/*" }, { serverCommand: ["npx", "srv"] }, { other: 1 }, "bad"],
      allowedMcpServers: [],
      enabledMcpjsonServers: ["s"],
      enableAllProjectMcpServers: true,
      disableAllHooks: true,
      allowManagedHooksOnly: "true",
    });
    expect(view).toMatchObject({
      bypass: true,
      allow: ["Bash(git *)"],
      deny: [],
      skillOverrides: { a: "off", e: "name-only" },
      enabledPlugins: { "p@m": true },
      deniedMcpServers: [{ serverName: "x" }, { serverUrl: "https://e.example/*" }, { serverCommand: ["npx", "srv"] }],
      allowedMcpServers: [],
      enabledMcpjsonServers: ["s"],
      enableAllProjectMcpServers: true,
      disableAllHooks: true,
      allowManagedHooksOnly: false,
    });
    expect({ ...view.skillOverrides }).toEqual({ a: "off", e: "name-only" });
    // 정하지 않은 일괄 승인은 null이다(맞는 참거짓만 정한 것이다)
    expect(viewOf(null)).toMatchObject({ bypass: false, allowedMcpServers: null, skillOverrides: {}, enableAllProjectMcpServers: null });
    expect(viewOf({ enableAllProjectMcpServers: false }).enableAllProjectMcpServers).toBe(false);
    expect(viewOf({ enableAllProjectMcpServers: "true" }).enableAllProjectMcpServers).toBeNull();
  });

  it("권한 우회가 아닌 기본 모드는 모두 권한 우회가 아니다", () => {
    for (const mode of ["default", "acceptEdits", "plan", "auto", undefined]) expect(viewOf({ permissions: { defaultMode: mode } }).bypass).toBe(false);
  });
});
