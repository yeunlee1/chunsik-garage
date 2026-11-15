// Codex 설정 파일(TOML) 읽기를 시험한다. TOML 1.1과 큰 정수를 풀고, 스캐너가 읽는 자리의 값의 종류와 MCP 서버의 전송 꼴이 Codex가 시작하지 못하는 꼴이면 풀리지 않는 것으로 보며, 층을 Codex와 같이 합치고, 지문용으로 TOML 값을 JSON 꼴로 바꾸는지(설계 「5단계 2부 계획 전 결정」 1·3·7번)
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexConfigShapeOk, codexServerShapeOk, exceedsLimits, mergeCodexLayers, parseCodexConfig, readCodexConfig, tomlToJson, type TomlTable } from "../../src/scan/codex-config.ts";
import { canonicalJson } from "../../src/scan/json.ts";
import { makeTemp, removeTemp } from "../helpers/temp-fs.ts";

let root: string;
beforeEach(async () => {
  root = await makeTemp();
});
afterEach(async () => {
  await removeTemp(root);
});

const parsed = (text: string): TomlTable => {
  const doc = parseCodexConfig(text);
  if (doc === null) throw new Error("풀리지 않았다");
  return doc;
};

describe("parseCodexConfig", () => {
  it("따옴표가 든 표 이름, 표의 배열, 여러 줄 문자열을 푼다", () => {
    const doc = parsed(
      [
        'developer_instructions = """',
        "첫 줄",
        '둘째 줄"""',
        '[plugins."gmail@openai-curated"]',
        "enabled = false",
        "[[skills.config]]",
        "path = 'C:\\Users\\me\\.agents\\skills\\a\\SKILL.md'",
        "enabled = false",
        "[[skills.config]]",
        'name = "b"',
        "enabled = true",
      ].join("\n"),
    );
    expect(doc.plugins).toEqual({ "gmail@openai-curated": { enabled: false } });
    expect(doc.skills).toEqual({ config: [{ path: "C:\\Users\\me\\.agents\\skills\\a\\SKILL.md", enabled: false }, { name: "b", enabled: true }] });
    expect(doc.developer_instructions).toBe("첫 줄\n둘째 줄");
  });

  it("TOML 1.1의 꼴(여러 줄 인라인 표와 끝 쉼표, \\e 탈출)도 푼다. Codex 0.166.0의 해석기가 TOML 1.1이다", () => {
    const doc = parsed('[mcp_servers.a]\ncommand = "x"\nenv = {\n  K = "v",\n}\nnote = "\\e[0m"\n');
    expect(doc.mcp_servers).toEqual({ a: { command: "x", env: { K: "v" }, note: "\u001b[0m" } });
  });

  it("2^53을 넘는 정수가 있어도 문서 전체를 거부하지 않고 큰 정수로 받는다", () => {
    const doc = parsed("project_doc_max_bytes = 9223372036854775807\nsmall = 5\n");
    expect(doc.project_doc_max_bytes).toBe(9223372036854775807n);
    expect(doc.small).toBe(5);
  });

  it("문법이 틀리거나 같은 열쇠를 두 번 적었으면 풀리지 않는다", () => {
    expect(parseCodexConfig("a = \n")).toBeNull();
    expect(parseCodexConfig('approval_policy = "never"\napproval_policy = "on-request"\n')).toBeNull();
    expect(parseCodexConfig("[t]\na = 1\n[t]\nb = 2\n")).toBeNull();
  });

  it("빈 파일은 빈 묶음이다", () => {
    expect(parsed("")).toEqual({});
  });

  it("Codex의 해석기가 거부하는 64비트 밖의 정수는 풀리지 않는다(계획 리뷰 1차)", () => {
    expect(parseCodexConfig("note = 9223372036854775808\n")).toBeNull();
    expect(parseCodexConfig("note = 0x8000000000000000\n")).toBeNull();
    expect(parseCodexConfig("note = [1, -9223372036854775809]\n")).toBeNull();
    expect(parsed("note = -9223372036854775808\n").note).toBe(-9223372036854775808n);
    expect(parsed("note = 0x7fffffffffffffff\n").note).toBe(9223372036854775807n);
  });

  it("128단보다 깊게 중첩된 문서는 풀리지 않는다", () => {
    const dotted = (n: number): string => `${Array.from({ length: n }, (_, i) => `k${i}`).join(".")} = 1\n`;
    expect(parseCodexConfig(dotted(128))).not.toBeNull();
    expect(parseCodexConfig(dotted(129))).toBeNull();
    expect(parseCodexConfig(`v = ${"[".repeat(2000)}${"]".repeat(2000)}\n`)).toBeNull();
  });
});

describe("exceedsLimits", () => {
  it("아주 깊은 값도 스택을 넘기지 않고 가른다", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 100_000; i++) deep = { x: deep };
    expect(exceedsLimits(deep)).toBe(true);
    expect(exceedsLimits({ a: [{ b: 1 }] })).toBe(false);
    expect(exceedsLimits({ a: 2n ** 63n })).toBe(true);
  });
});

describe("codexConfigShapeOk", () => {
  const ok = (text: string): boolean => codexConfigShapeOk(parsed(text));

  it("읽는 자리가 모두 맞는 종류이면 맞다. 모르는 열쇠와 모르는 글자 값은 틀린 것이 아니다", () => {
    expect(
      ok(
        [
          'approval_policy = "someday-new"',
          'sandbox_mode = "future-mode"',
          'default_permissions = ":workspace"',
          "project_doc_max_bytes = 0",
          'project_doc_fallback_filenames = ["CLAUDE.md"]',
          "unknown_top = { a = 1 }",
          "[features]",
          "plugins = true",
          "other = 3",
          '[projects."C:\\\\dev\\\\x"]',
          'trust_level = "sometimes"',
          "[mcp_servers.s]",
          'command = "npx"',
          'args = ["-y", "x"]',
          "enabled = false",
          "[mcp_servers.h]",
          'url = "https://example.test/mcp"',
          'bearer_token_env_var = "TOKEN"',
          '[plugins."p@m"]',
          "enabled = true",
          '[plugins."p@m".mcp_servers.inner]',
          "enabled = false",
          "[plugins._default]",
          "enabled = false",
          "[[skills.config]]",
          'name = "x"',
          "enabled = false",
        ].join("\n"),
      ),
    ).toBe(true);
  });

  it("approval_policy는 글자이거나 granular 하나를 담은 묶음이어야 한다", () => {
    expect(ok("approval_policy = { granular = { sandbox_approval = true, rules = false, mcp_elicitations = false } }\n")).toBe(true);
    expect(ok("approval_policy = 3\n")).toBe(false);
    expect(ok("approval_policy = { other = {} }\n")).toBe(false);
    expect(ok("approval_policy = { granular = 1 }\n")).toBe(false);
    expect(ok("approval_policy = { granular = {}, extra = {} }\n")).toBe(false);
  });

  it("Codex 0.166.0이 더는 받지 않는 승인 정책 untrusted는 틀린 값이다. 옛 이름 on-failure는 맞다(3부 계획 리뷰 1차)", () => {
    expect(ok('approval_policy = "untrusted"\n')).toBe(false);
    expect(ok('approval_policy = "on-failure"\n')).toBe(true);
    expect(ok('approval_policy = "on-request"\n')).toBe(true);
    expect(ok('approval_policy = "never"\n')).toBe(true);
  });

  it.each([
    ["sandbox_mode = true", "sandbox_mode"],
    ["default_permissions = 1", "default_permissions"],
    ["mcp_servers = 1", "mcp_servers"],
    ["mcp_servers = { a = 1 }", "서버"],
    ['[mcp_servers.a]\ncommand = "x"\nenabled = "yes"', "서버의 enabled"],
    ["plugins = []", "plugins"],
    ['[plugins]\n"p@m" = 1', "플러그인"],
    ['[plugins."p@m"]\nenabled = 1', "플러그인의 enabled"],
    ['[plugins."p@m"]\nmcp_servers = 1', "플러그인의 mcp_servers"],
    ['[plugins."p@m".mcp_servers]\ns = 1', "플러그인 서버"],
    ['[plugins."p@m".mcp_servers.s]\nenabled = "no"', "플러그인 서버의 enabled"],
    ["[plugins._default]\nenabled = 0", "_default의 enabled"],
    ["skills = 1", "skills"],
    ["[skills]\nconfig = {}", "skills.config"],
    ["[skills]\nconfig = [1]", "skills.config의 항목"],
    ['[[skills.config]]\nname = "x"', "enabled가 없는 항목"],
    ['[[skills.config]]\nname = 1\nenabled = true', "name의 종류"],
    ['[[skills.config]]\npath = false\nenabled = true', "path의 종류"],
    ["features = 1", "features"],
    ['[features]\nplugins = "yes"', "features.plugins"],
    ["projects = 1", "projects"],
    ['[projects]\n"C:/x" = 1', "프로젝트"],
    ['[projects."C:/x"]\ntrust_level = true', "trust_level"],
    ['project_doc_fallback_filenames = "CLAUDE.md"', "fallback 목록"],
    ["project_doc_fallback_filenames = [1]", "fallback 항목"],
    ["project_doc_max_bytes = -1", "음수 한도"],
    ["project_doc_max_bytes = 1.5", "정수 아닌 한도"],
    ['project_doc_max_bytes = "1"', "글자 한도"],
  ])("자리의 종류가 틀리면 풀리지 않는다: %s (%s)", (text) => {
    expect(ok(`${text}\n`)).toBe(false);
  });

  it("MCP 서버의 전송을 정할 수 없거나 전송과 맞지 않는 열쇠가 함께 있으면 풀리지 않는다(공개 소스의 전송 검사)", () => {
    expect(ok("[mcp_servers.a]\nenabled = true\n")).toBe(false);
    expect(ok('[mcp_servers.a]\ncommand = "x"\nurl = "https://e.test"\n')).toBe(false);
    for (const key of ["bearer_token_env_var", "bearer_token", "http_headers_helper", "oauth_resource", "auth"]) expect(ok(`[mcp_servers.a]\ncommand = "x"\n${key} = "v"\n`)).toBe(false);
    for (const key of ["http_headers", "env_http_headers", "oauth"]) expect(ok(`[mcp_servers.a]\ncommand = "x"\n${key} = {}\n`)).toBe(false);
    for (const key of ["args", "env_vars"]) expect(ok(`[mcp_servers.a]\nurl = "https://e.test"\n${key} = []\n`)).toBe(false);
    expect(ok('[mcp_servers.a]\nurl = "https://e.test"\nenv = {}\n')).toBe(false);
    expect(ok('[mcp_servers.a]\nurl = "https://e.test"\ncwd = "C:/x"\n')).toBe(false);
    expect(ok('[mcp_servers.a]\nurl = "https://e.test"\nbearer_token = "t"\n')).toBe(false);
    expect(ok("[mcp_servers.a]\ncommand = 1\n")).toBe(false);
    expect(ok("[mcp_servers.a]\nurl = 1\n")).toBe(false);
    // 맞는 꼴
    expect(ok('[mcp_servers.a]\ncommand = "x"\nargs = []\nenv = { K = "v" }\nenv_vars = ["A"]\ncwd = "C:/x"\nstartup_timeout_sec = 5\n')).toBe(true);
    expect(ok('[mcp_servers.a]\nurl = "https://e.test"\nhttp_headers = { H = "v" }\nenv_http_headers = { H = "E" }\noauth = {}\nauth = "oauth"\n')).toBe(true);
  });

  it("플러그인의 JSON 서버 선언에서는 null이 없는 것이다(serde의 Option)", () => {
    expect(codexServerShapeOk({ command: null, url: "https://e.test", enabled: null })).toBe(true);
    expect(codexServerShapeOk({ command: "x", url: null, http_headers: null })).toBe(true);
    expect(codexServerShapeOk({ command: null, url: null })).toBe(false);
    expect(codexServerShapeOk({})).toBe(false);
    expect(codexServerShapeOk([])).toBe(false);
  });

  it("큰 정수의 한도는 0 이상이면 맞다", () => {
    expect(ok("project_doc_max_bytes = 9223372036854775807\n")).toBe(true);
    expect(ok("project_doc_max_bytes = -9223372036854775807\n")).toBe(false);
  });
});

describe("readCodexConfig", () => {
  it("없는 파일, 풀리지 않는 파일, 모양이 틀린 파일, 읽지 못하는 것, 맞는 파일을 가른다", async () => {
    const good = join(root, "good.toml");
    const broken = join(root, "broken.toml");
    const badShape = join(root, "shape.toml");
    const dir = join(root, "dir.toml");
    await writeFile(good, '\ufeffapproval_policy = "never"\n');
    await writeFile(broken, "approval_policy = \n");
    await writeFile(badShape, "[mcp_servers.a]\nenabled = true\n");
    await mkdir(dir);
    expect(await readCodexConfig(join(root, "none.toml"))).toEqual({ status: "missing" });
    expect(await readCodexConfig(broken)).toEqual({ status: "unparsable" });
    expect(await readCodexConfig(badShape)).toEqual({ status: "unparsable" });
    expect(await readCodexConfig(dir)).toEqual({ status: "unreadable" });
    expect(await readCodexConfig(good)).toEqual({ status: "ok", value: { approval_policy: "never" } });
  });
});

describe("mergeCodexLayers", () => {
  it("묶음은 열쇠마다 깊이 합치고, 목록과 종류가 다른 값은 위 층이 통째로 대신한다", () => {
    const user = parsed('approval_policy = "never"\nproject_doc_fallback_filenames = ["A.md", "B.md"]\n[mcp_servers.s]\ncommand = "x"\nargs = ["1", "2"]\nenv = { A = "1", B = "2" }\n[features]\nplugins = true\n');
    const project = parsed('approval_policy = { granular = { sandbox_approval = true, rules = true, mcp_elicitations = true } }\nproject_doc_fallback_filenames = ["C.md"]\n[mcp_servers.s]\nargs = ["3"]\nenv = { B = "9", C = "3" }\nenabled = false\n[features]\nother = false\n');
    const merged = mergeCodexLayers([user, project]);
    expect(merged).toEqual({
      approval_policy: { granular: { sandbox_approval: true, rules: true, mcp_elicitations: true } },
      project_doc_fallback_filenames: ["C.md"],
      mcp_servers: { s: { command: "x", args: ["3"], env: { A: "1", B: "9", C: "3" }, enabled: false } },
      features: { plugins: true, other: false },
    });
    // 아래 층의 묶음은 그대로다
    expect(user.mcp_servers).toEqual({ s: { command: "x", args: ["1", "2"], env: { A: "1", B: "2" } } });
  });

  it("층이 하나면 그 층과 같고, 없으면 빈 묶음이다", () => {
    expect(mergeCodexLayers([parsed("a = 1\n")])).toEqual({ a: 1 });
    expect(mergeCodexLayers([])).toEqual({});
  });

  it("묶음을 글자나 목록으로 덮으면 위 층의 값이다", () => {
    expect(mergeCodexLayers([parsed("[t]\na = 1\n"), parsed('t = "x"\n')])).toEqual({ t: "x" });
    expect(mergeCodexLayers([parsed('t = "x"\n'), parsed("[t]\na = 1\n")])).toEqual({ t: { a: 1 } });
  });
});

describe("tomlToJson", () => {
  it("큰 정수, 무한대와 숫자 아님, 날짜와 시각을 서로 가르는 JSON 꼴로 바꾼다", () => {
    const doc = parsed("big = 9223372036854775807\nsmall = 7\npinf = inf\nninf = -inf\nnot = nan\nwhen = 1979-05-27T07:32:00Z\nlocal = 1979-05-27T07:32:00\nday = 1979-05-27\nclock = 07:32:00\nlist = [1, 9223372036854775807]\n");
    const json = tomlToJson(doc) as Record<string, unknown>;
    expect(json.big).toEqual({ $bigint: "9223372036854775807" });
    expect(json.small).toBe(7);
    expect(json.pinf).toEqual({ $float: "inf" });
    expect(json.ninf).toEqual({ $float: "-inf" });
    expect(json.not).toEqual({ $float: "nan" });
    expect(json.when).toEqual({ $datetime: "1979-05-27T07:32:00.000Z" });
    expect(json.local).toEqual({ $datetime: "1979-05-27T07:32:00.000" });
    expect(json.day).toEqual({ $datetime: "1979-05-27" });
    expect(json.clock).toEqual({ $datetime: "07:32:00.000" });
    expect(json.list).toEqual([1, { $bigint: "9223372036854775807" }]);
    // 정규화한 글이 만들어지고, 값이 다르면 글도 다르다
    const text = canonicalJson(json);
    expect(text).not.toBeNull();
    expect(canonicalJson(tomlToJson(parsed("when = 1979-05-27T07:32:00Z\n")))).not.toBe(canonicalJson(tomlToJson(parsed("when = 1979-05-27T07:32:01Z\n"))));
    expect(canonicalJson(tomlToJson(parsed("x = inf\n")))).not.toBe(canonicalJson(tomlToJson(parsed("x = nan\n"))));
  });

  it("원래 묶음을 바꾸지 않는다", () => {
    const doc = parsed("big = 9223372036854775807\n[t]\nx = inf\n");
    tomlToJson(doc);
    expect(doc.big).toBe(9223372036854775807n);
    expect((doc.t as TomlTable).x).toBe(Infinity);
  });
});
