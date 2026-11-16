// 정비 후보를 계획 항목(바꿀 파일, 자리, 지금 값, 바꿀 값, 영향 범위, 자동으로 고칠 수 없는 까닭)으로 바꾸는 것과 바꿀 파일 읽기를 시험한다(설계 16.1, 16.3, 16.5의 1번, 「6단계 1부 계획 전 결정」 4·7번)
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Candidate } from "../../src/core/installs/candidates.ts";
import { fingerprintOf, readTarget, tableHeaderCount, targetPath, tuneItem, type ItemContext, type TargetRead } from "../../src/tune/items.ts";
import { CODEX_HOME, HOME, mcpServer, skill } from "../helpers/facts.ts";
import { linkDir, makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const candidate = (unit: Candidate["unit"], target: string): Candidate => ({ id: `${unit}:${unit === "A4" ? "codex" : "claude-code"}:${target}`, unit, rule: unit === "A1" || unit === "A2" ? "E5" : "E6", tool: unit === "A4" ? "codex" : "claude-code", target });
const context = (input: Partial<ItemContext> = {}): ItemContext => ({ home: HOME, bundles: [], servers: [], versionOk: true, ...input });
const ok = (text: string | Buffer): TargetRead => ({ status: "ok", bytes: Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8"), regular: true });
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

describe("계획 항목의 자리와 값", () => {
  it("스킬 끄기는 사용자 설정의 skillOverrides에서 그 이름을 off로 바꾼다. 지금 값이 없으면 칸을 두지 않는다", () => {
    expect(tuneItem(candidate("A1", "idle"), context(), ok(json({ permissions: {} })))).toEqual({
      id: "A1:claude-code:idle",
      unit: "A1",
      rule: "E5",
      tool: "claude-code",
      target: "idle",
      file: join(HOME, "settings.json"),
      layer: "user",
      key: { kind: "json-entry", parent: "skillOverrides", name: "idle" },
      next: "off",
      impact: { unit: "A1", skills: { user: 0, project: 0, plugin: 0 } },
      blocked: null,
    });
    expect(tuneItem(candidate("A1", "idle"), context(), ok(json({ skillOverrides: { idle: "on" } }))).current).toBe("on");
  });

  it("플러그인 끄기는 enabledPlugins의 그 설치 ID를 false로, 서버 막기는 deniedMcpServers에 그 이름의 항목을 더한다", () => {
    const a2 = tuneItem(candidate("A2", "p@m"), context(), ok(json({ enabledPlugins: { "p@m": true } })));
    expect([a2.key, a2.current, a2.next]).toEqual([{ kind: "json-entry", parent: "enabledPlugins", name: "p@m" }, true, false]);
    const a3 = tuneItem(candidate("A3", "db"), context(), ok(json({ deniedMcpServers: [{ serverName: "other" }] })));
    expect([a3.key, "current" in a3, a3.next]).toEqual([{ kind: "json-list-add", parent: "deniedMcpServers", entry: { serverName: "db" } }, false, { serverName: "db" }]);
  });

  it("서버 끄기는 Codex 사용자 설정의 그 서버 표에 enabled = false를 적는다. 지금 값은 그 표의 enabled다", () => {
    const codex = context({ home: CODEX_HOME });
    const item = tuneItem(candidate("A4", "db"), codex, ok('[mcp_servers.db]\ncommand = "x"\n'));
    expect([item.file, item.key, "current" in item, item.next, item.blocked]).toEqual([join(CODEX_HOME, "config.toml"), { kind: "toml-table-key", table: "db", key: "enabled" }, false, false, null]);
    expect(tuneItem(candidate("A4", "db"), codex, ok('[mcp_servers.db]\ncommand = "x"\nenabled = true\n')).current).toBe(true);
  });

  it("바꿀 파일은 도구의 설정 홈 아래 사용자 설정이다", () => {
    expect(targetPath(candidate("A3", "db"), HOME)).toBe(join(HOME, "settings.json"));
    expect(targetPath(candidate("A4", "db"), CODEX_HOME)).toBe(join(CODEX_HOME, "config.toml"));
  });
});

describe("영향 범위", () => {
  it("스킬 끄기는 그 이름으로 같이 꺼지는 스킬 위치를 범위마다 센다(폴더 이름이나 머리말 이름이 그 이름인 것)", () => {
    const bundles = [{ positions: [skill("idle"), skill("idle", { scope: "project", projectRoot: "/work/app" })] }, { positions: [skill("other", { recordNames: ["other", "idle"] })] }, { positions: [skill("busy")] }];
    expect(tuneItem(candidate("A1", "idle"), context({ bundles }), ok("{}\n")).impact).toEqual({ unit: "A1", skills: { user: 2, project: 1, plugin: 0 } });
  });

  it("플러그인 끄기는 그 플러그인의 스킬 묶음 수를 센다", () => {
    const bundles = [{ positions: [skill("p:a", { scope: "plugin", pluginId: "p@m" })] }, { positions: [skill("p:b", { scope: "plugin", pluginId: "p@m" })] }, { positions: [skill("q:a", { scope: "plugin", pluginId: "q@m" })] }];
    expect(tuneItem(candidate("A2", "p@m"), context({ bundles }), ok("{}\n")).impact).toEqual({ unit: "A2", skills: 2 });
  });

  it("서버 막기는 같은 이름으로 함께 막히는 켜진 로컬·프로젝트 범위 서버와 claude.ai 연결을 센다. 플러그인 서버와 꺼 둔 것은 세지 않는다", () => {
    const servers = [mcpServer("db"), mcpServer("db", { scope: "local", projectRoot: "/a" }), mcpServer("db", { scope: "project", projectRoot: "/b" }), mcpServer("db", { scope: "project", projectRoot: "/c", enabled: false }), mcpServer("db", { scope: "plugin", pluginId: "p@m" }), mcpServer("db", { scope: "claude-ai", definitionHash: null }), mcpServer("other", { scope: "local", projectRoot: "/a" })].map((server) => ({ server }));
    expect(tuneItem(candidate("A3", "db"), context({ servers }), ok("{}\n")).impact).toEqual({ unit: "A3", sameName: { local: 1, project: 1, claudeAi: 1 } });
  });

  it("서버 끄기는 같은 이름을 다시 적은 신뢰한 프로젝트의 켜진 서버를 센다", () => {
    const servers = [mcpServer("db"), mcpServer("db", { scope: "project", projectRoot: "/a" }), mcpServer("db", { scope: "project", projectRoot: "/b" }), mcpServer("db", { scope: "plugin", pluginId: "p@m" })].map((server) => ({ server }));
    expect(tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME, servers }), ok('[mcp_servers.db]\ncommand = "x"\n')).impact).toEqual({ unit: "A4", projects: 2 });
  });
});

describe("자동으로 고칠 수 없는 까닭", () => {
  const blockedOf = (unit: Candidate["unit"], read: TargetRead, versionOk = true): string | null => tuneItem(candidate(unit, unit === "A2" ? "p@m" : "db"), context({ home: unit === "A4" ? CODEX_HOME : HOME, versionOk }), read).blocked;

  it("파일이 없거나 읽지 못했거나, 파일이나 그 폴더가 링크면 고치지 않는다", () => {
    expect(blockedOf("A1", { status: "missing" })).toBe("file-missing");
    expect(blockedOf("A1", { status: "unreadable" })).toBe("file-unreadable");
    expect(blockedOf("A1", { status: "ok", bytes: Buffer.from("{}\n"), regular: false })).toBe("not-regular");
  });

  it("확인한 범위 밖 버전이면 파일의 모양보다 먼저 그 까닭으로 막는다", () => {
    expect(blockedOf("A1", ok("{}\n"), false)).toBe("unverified-version");
    expect(blockedOf("A4", { status: "missing" }, false)).toBe("unverified-version");
  });

  it("JSON은 바이트 순서 표시가 없고, 주석이 없는 표준 JSON이며, 맨 바깥과 바꿀 열쇠의 부모가 맞는 꼴이어야 한다", () => {
    expect(blockedOf("A1", ok(Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("{}\n")])))).toBe("byte-order-mark");
    expect(blockedOf("A1", ok('// 메모\n{"skillOverrides": {}}\n'))).toBe("not-json-object");
    expect(blockedOf("A1", ok("[]\n"))).toBe("not-json-object");
    expect(blockedOf("A1", ok('{"skillOverrides": []}\n'))).toBe("parent-shape");
    expect(blockedOf("A3", ok('{"deniedMcpServers": {}}\n'))).toBe("parent-shape");
    expect(blockedOf("A2", ok('{"enabledPlugins": "p@m"}\n'))).toBe("parent-shape");
    expect(blockedOf("A1", ok('{"skillOverrides": {"idle": "on"}}\n'))).toBeNull();
  });

  it("TOML은 풀려야 하고, 그 서버의 표가 머리 하나로 여러 줄에 적혀 있어야 한다. 인라인 표와 점 열쇠로 적은 것은 고치지 않는다", () => {
    expect(blockedOf("A4", ok('[mcp_servers.db\ncommand = "x"\n'))).toBe("not-toml");
    expect(blockedOf("A4", ok('mcp_servers.db = { command = "x" }\n'))).toBe("table-shape");
    expect(blockedOf("A4", ok('[mcp_servers]\ndb = { command = "x" }\n'))).toBe("table-shape");
    expect(blockedOf("A4", ok('[mcp_servers]\ndb.command = "x"\n'))).toBe("table-shape");
    expect(blockedOf("A4", ok(Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('[mcp_servers.db]\ncommand = "x"\n')])))).toBe("byte-order-mark");
    expect(blockedOf("A4", ok('[mcp_servers."db"]\ncommand = "x"\n'))).toBeNull();
    expect(blockedOf("A4", ok("[ mcp_servers . 'db' ] # 메모\ncommand = \"x\"\n"))).toBeNull();
  });

  it("여러 줄 문자열 안에 적힌 표 머리 꼴의 줄은 표 머리로 세지 않는다", () => {
    const text = 'note = """\n[mcp_servers.db]\n"""\n[mcp_servers.db]\ncommand = "x"\n';
    expect(blockedOf("A4", ok(text))).toBeNull();
    expect(blockedOf("A4", ok("note = '''\n[mcp_servers.db]\n'''\n[mcp_servers.db]\ncommand = \"x\"\n"))).toBeNull();
  });
});

describe("지금 값의 꼴과 TOML의 문자열(6단계 1부 계획 리뷰 1차)", () => {
  it("지금 값이 그 단위가 받는 꼴이 아니면 계획에 싣지 않고 고치지 않는다. 스킬 끄기는 네 모드의 글, 플러그인 끄기와 서버 끄기는 참거짓이다", () => {
    const a1 = (value: unknown) => tuneItem(candidate("A1", "idle"), context(), ok(json({ skillOverrides: { idle: value } })));
    const secret = a1({ env: { TOKEN: "SYNTHETIC-SECRET-VALUE" } });
    expect([secret.blocked, "current" in secret, JSON.stringify(secret).includes("SYNTHETIC-SECRET-VALUE")]).toEqual(["value-shape", false, false]);
    expect(["weird", 1, null, ["off"]].map((value) => a1(value).blocked)).toEqual(["value-shape", "value-shape", "value-shape", "value-shape"]);
    expect(["on", "name-only", "user-invocable-only"].map((value) => [a1(value).blocked, a1(value).current])).toEqual([
      [null, "on"],
      [null, "name-only"],
      [null, "user-invocable-only"],
    ]);
    expect(tuneItem(candidate("A2", "p@m"), context(), ok(json({ enabledPlugins: { "p@m": "true" } }))).blocked).toBe("value-shape");
    const a4 = (enabled: string) => tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME }), ok(`[mcp_servers.db]\ncommand = "x"\nenabled = ${enabled}\n`));
    expect([a4('"yes"').blocked, a4("1").blocked, a4("false").blocked, a4("false").current]).toEqual(["value-shape", "value-shape", null, false]);
  });

  it("주석과 한 줄 문자열 안의 세 따옴표는 여러 줄 문자열로 보지 않는다. 문자열 밖에서 시작하는 줄의 표 머리만 센다", () => {
    const tail = '[mcp_servers.db]\ncommand = "x"\n';
    expect(tableHeaderCount('mcp_servers.db = {command="x"}\n# """\nnote = """\n[mcp_servers.db]\n"""\n', "db")).toBe(0);
    expect(tableHeaderCount(`note = "triple marker" # """\n${tail}`, "db")).toBe(1);
    expect(tableHeaderCount(`x = '"""'\n${tail}`, "db")).toBe(1);
    expect(tableHeaderCount(`x = "a\\"\\"\\"b"\n${tail}`, "db")).toBe(1);
    expect(tableHeaderCount(`x = """a""""\n${tail}`, "db")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."d#b"]\ncommand = "x"\n', "d#b")).toBe(1);
    // 머리 뒤의 주석에 대괄호가 있어도, 따옴표 이름 안에 ]나 #가 있어도 그 표의 머리다(6단계 1부 계획 리뷰 1차 재확인)
    expect(tableHeaderCount('[mcp_servers.db] # [example]\ncommand = "x"\n', "db")).toBe(1);
    expect(tableHeaderCount('[mcp_servers.db] # ]\ncommand = "x"\n', "db")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."d#b"] # ]\ncommand = "x"\n', "d#b")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."a]b"]\ncommand = "x"\n', "a]b")).toBe(1);
    expect(tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME }), ok('[mcp_servers.db] # [example]\ncommand = "x"\n')).blocked).toBeNull();
    // 머리 뒤에 주석이 아닌 글이 있으면 머리가 아니다
    expect(tableHeaderCount('[mcp_servers.db] x\ncommand = "x"\n', "db")).toBe(0);
    // 문서가 여러 줄 문자열 안에서 끝나면 모른다
    expect(tableHeaderCount(`${tail}x = """\n`, "db")).toBe(-1);
    // 주석에 세 따옴표가 있는 인라인 표는 계획에서 고치지 않는 표다
    const inline = tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME }), ok('mcp_servers.db = {command="x"}\n# """\nnote = """\n[mcp_servers.db]\n"""\n'));
    expect(inline.blocked).toBe("table-shape");
  });
});

describe("표 이름의 따옴표와 이스케이프(6단계 1부 구현 검증)", () => {
  it("큰따옴표 이름은 문서를 읽는 해석기와 같게 푼다. 8자리 유니코드 이스케이프와 따옴표 안의 탭도 그 이름이고, 따옴표 밖의 점은 열쇠를 나눈다", () => {
    expect(tableHeaderCount('[mcp_servers."\\U00000064b"]\ncommand = "x"\n', "db")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."\\u0064b"]\ncommand = "x"\n', "db")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."d\tb"]\ncommand = "x"\n', "d\tb")).toBe(1);
    expect(tableHeaderCount('[mcp_servers."db.prod"]\ncommand = "x"\n', "db.prod")).toBe(1);
    expect(tableHeaderCount('[mcp_servers.db.prod]\ncommand = "x"\n', "db.prod")).toBe(0);
    expect(tuneItem(candidate("A4", "db"), context({ home: CODEX_HOME }), ok('[mcp_servers."\\U00000064b"]\ncommand = "x"\n')).blocked).toBeNull();
  });
});

describe("지문과 파일 읽기", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTemp();
  });
  afterEach(async () => removeTemp(root));

  it("지문은 원본 바이트의 SHA-256이다. 한 바이트만 달라도 다르다", () => {
    expect(fingerprintOf(Buffer.from("{}\n"))).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf(Buffer.from("{}\n"))).toBe(fingerprintOf(Buffer.from("{}\n")));
    expect(fingerprintOf(Buffer.from("{}\n"))).not.toBe(fingerprintOf(Buffer.from("{} \n")));
  });

  it("있는 파일은 바이트 그대로 읽고(바이트 순서 표시도 남긴다) 보통 파일인지 적는다. 없으면 없음이다", async () => {
    const path = join(root, "cfg", "settings.json");
    await put(path, "﻿{}\n");
    const read = await readTarget(path);
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect([read.bytes.subarray(0, 3).toString("hex"), read.regular]).toEqual(["efbbbf", true]);
    expect(await readTarget(join(root, "cfg", "none.json"))).toEqual({ status: "missing" });
    expect(await readTarget(join(root, "nodir", "none.json"))).toEqual({ status: "missing" });
  });

  it("그 폴더가 링크면 보통 파일이 아니다", async () => {
    await put(join(root, "real", "settings.json"), "{}\n");
    await linkDir(join(root, "real"), join(root, "linked"));
    const read = await readTarget(join(root, "linked", "settings.json"));
    expect(read.status === "ok" && read.regular).toBe(false);
  });
});
