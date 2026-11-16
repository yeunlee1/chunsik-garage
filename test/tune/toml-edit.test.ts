// Codex 사용자 설정(config.toml)의 줄 단위 편집과 뜻 비교를 시험한다(설계 16.3, 「6단계 2부 계획 전 결정」 3·5번)
import { describe, expect, it } from "vitest";
import { editToml, tomlMeaningOk, type TomlOp } from "../../src/tune/toml-edit.ts";

const off = (table: string): TomlOp => ({ op: "set", table, value: false });

describe("enabled 줄", () => {
  it("그 서버 표에 enabled 줄이 있으면 값 글자만 바꾼다. 들여쓰기, 공백, 주석, 다른 표는 그대로다", () => {
    expect(editToml('[mcp_servers.db]\ncommand = "x"\n  enabled   =  true  # keep\n[other]\nenabled = true\n', [off("db")])).toBe('[mcp_servers.db]\ncommand = "x"\n  enabled   =  false  # keep\n[other]\nenabled = true\n');
  });

  it("없으면 머리 줄 바로 뒤에 더한다. 들여쓰기는 몸의 첫 열쇠 줄을, 줄 끝은 머리 줄을 따른다", () => {
    expect(editToml('[mcp_servers.db]\r\n  command = "x"\r\n', [off("db")])).toBe('[mcp_servers.db]\r\n  enabled = false\r\n  command = "x"\r\n');
    expect(editToml('x = 1\n[mcp_servers."db.prod"] # c\ncommand = "x"', [off("db.prod")])).toBe('x = 1\n[mcp_servers."db.prod"] # c\nenabled = false\ncommand = "x"');
    // 머리 줄이 문서 끝이면 줄을 이어 붙인다
    expect(editToml("[mcp_servers.db]", [off("db")])).toBe("[mcp_servers.db]\nenabled = false");
  });

  it("되돌리기는 enabled 줄을 빼거나 값을 되돌린다", () => {
    expect(editToml('[mcp_servers.db]\nenabled = false\ncommand = "x"\n', [{ op: "delete", table: "db" }])).toBe('[mcp_servers.db]\ncommand = "x"\n');
    expect(editToml("[mcp_servers.db]\nenabled = false\n", [{ op: "set", table: "db", value: true }])).toBe("[mcp_servers.db]\nenabled = true\n");
  });

  it("여러 줄 문자열 안의 머리와 enabled는 보지 않는다. 머리가 없거나 둘이거나 enabled 줄이 둘이면 짓지 않는다", () => {
    const text = 'note = """\n[mcp_servers.db]\nenabled = true\n"""\n[mcp_servers.db]\ncommand = "x"\n';
    expect(editToml(text, [off("db")])).toBe('note = """\n[mcp_servers.db]\nenabled = true\n"""\n[mcp_servers.db]\nenabled = false\ncommand = "x"\n');
    expect(editToml('mcp_servers.db = {command="x"}\n', [off("db")])).toBeNull();
    expect(editToml("[mcp_servers.db]\nenabled = true\nenabled = false\n", [off("db")])).toBeNull();
    expect(editToml('[mcp_servers.db]\ncommand = "x"\n', [{ op: "delete", table: "db" }])).toBeNull();
  });
});

describe("뜻 비교(16.3)", () => {
  it("원본에 승인받은 변경만 넣은 것과 후보가 같아야 한다", () => {
    const original = '[mcp_servers.db]\ncommand = "x"\n[mcp_servers.other]\ncommand = "y"\n';
    expect(tomlMeaningOk(original, '[mcp_servers.db]\nenabled = false\ncommand = "x"\n[mcp_servers.other]\ncommand = "y"\n', [off("db")])).toBe(true);
    expect(tomlMeaningOk(original, '[mcp_servers.db]\nenabled = false\ncommand = "x"\n[mcp_servers.other]\ncommand = "z"\n', [off("db")])).toBe(false);
    expect(tomlMeaningOk(original, original, [off("db")])).toBe(false);
    expect(tomlMeaningOk(original, "[mcp_servers.db", [off("db")])).toBe(false);
    expect(tomlMeaningOk('[mcp_servers.db]\nenabled = false\ncommand = "x"\n', '[mcp_servers.db]\ncommand = "x"\n', [{ op: "delete", table: "db" }])).toBe(true);
  });
});
