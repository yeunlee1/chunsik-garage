// 사용자 설정(JSON)의 최소 편집과 뜻 비교를 시험한다(설계 16.3, 「6단계 2부 계획 전 결정」 2·4·5번)
import { describe, expect, it } from "vitest";
import { editJson, jsonMeaningOk, type JsonOp } from "../../src/tune/json-edit.ts";

const skill = (name: string, value: string | boolean = "off"): JsonOp => ({ op: "set", parent: "skillOverrides", name, value });
const plugin = (name: string): JsonOp => ({ op: "set", parent: "enabledPlugins", name, value: false });
const deny = (serverName: string): JsonOp => ({ op: "append", parent: "deniedMcpServers", entry: { serverName } });

describe("값 바꾸기와 항목 더하기", () => {
  it("열쇠가 있으면 그 값의 글자만 바꾸고, 같은 열쇠가 둘이면 마지막 것을 바꾼다", () => {
    expect(editJson('{\n  "skillOverrides": {\n    "a": "on",\n    "idle": "on"\n  },\n  "x": 1\n}\n', [skill("idle")])).toBe('{\n  "skillOverrides": {\n    "a": "on",\n    "idle": "off"\n  },\n  "x": 1\n}\n');
    expect(editJson('{\n  "skillOverrides": {\n    "idle": "on",\n    "idle": "name-only"\n  }\n}\n', [skill("idle")])).toBe('{\n  "skillOverrides": {\n    "idle": "on",\n    "idle": "off"\n  }\n}\n');
  });

  it("열쇠가 없으면 그 묶음 끝에 더한다. 여러 줄이면 같은 들여쓰기로, 한 줄이면 같은 줄에, 빈 묶음은 여러 줄로 연다", () => {
    expect(editJson('{\n  "skillOverrides": {\n    "a": "on"\n  }\n}\n', [skill("idle")])).toBe('{\n  "skillOverrides": {\n    "a": "on",\n    "idle": "off"\n  }\n}\n');
    expect(editJson('{"skillOverrides": {"a": "on"}}', [skill("idle")])).toBe('{"skillOverrides": {"a": "on", "idle": "off"}}');
    expect(editJson('{\n  "skillOverrides": { }\n}\n', [skill("idle")])).toBe('{\n  "skillOverrides": {\n    "idle": "off"\n  }\n}\n');
  });

  it("부모가 없으면 맨 바깥 끝에 더한다. 들여쓰기 한 칸과 줄 끝은 그 파일의 것을 따른다", () => {
    expect(editJson('{\n    "x": 1\n}\n', [plugin("p@m")])).toBe('{\n    "x": 1,\n    "enabledPlugins": {\n        "p@m": false\n    }\n}\n');
    expect(editJson('{\n\t"x": 1\n}', [plugin("p@m")])).toBe('{\n\t"x": 1,\n\t"enabledPlugins": {\n\t\t"p@m": false\n\t}\n}');
    expect(editJson('{\r\n  "x": 1\r\n}\r\n', [skill("idle")])).toBe('{\r\n  "x": 1,\r\n  "skillOverrides": {\r\n    "idle": "off"\r\n  }\r\n}\r\n');
    expect(editJson("{}\n", [skill("idle")])).toBe('{"skillOverrides": {"idle": "off"}}\n');
  });

  it("서버 막기는 목록 끝에 항목을 더한다. 빈 목록은 여러 줄로 열고, 목록이 없으면 만든다", () => {
    expect(editJson('{\n  "deniedMcpServers": [\n    {\n      "serverName": "old"\n    }\n  ]\n}\n', [deny("db")])).toBe('{\n  "deniedMcpServers": [\n    {\n      "serverName": "old"\n    },\n    { "serverName": "db" }\n  ]\n}\n');
    expect(editJson('{\n  "deniedMcpServers": []\n}\n', [deny("db")])).toBe('{\n  "deniedMcpServers": [\n    { "serverName": "db" }\n  ]\n}\n');
    expect(editJson('{\n  "x": 1\n}\n', [deny("db")])).toBe('{\n  "x": 1,\n  "deniedMcpServers": [\n    { "serverName": "db" }\n  ]\n}\n');
  });

  it("한 파일의 여러 변경을 한 번에 넣는다. 이름은 JSON 문자열로 쓴다", () => {
    const original = '{\n  "skillOverrides": {\n    "a": "on"\n  },\n  "x": 1\n}\n';
    const ops = [skill("a"), skill('q"\\'), plugin("p@m"), deny("db")];
    const text = editJson(original, ops)!;
    expect(text).toBe('{\n  "skillOverrides": {\n    "a": "off",\n    "q\\"\\\\": "off"\n  },\n  "x": 1,\n  "enabledPlugins": {\n    "p@m": false\n  },\n  "deniedMcpServers": [\n    { "serverName": "db" }\n  ]\n}\n');
    expect(jsonMeaningOk(original, text, ops)).toBe(true);
  });

  it("파일이 없으면 부모와 항목만 든 표준 JSON을 새로 짓는다", () => {
    expect(editJson(null, [skill("idle"), deny("db")])).toBe('{\n  "skillOverrides": {\n    "idle": "off"\n  },\n  "deniedMcpServers": [\n    { "serverName": "db" }\n  ]\n}\n');
  });

  it("맨 바깥이 묶음이 아니거나 부모의 꼴이 다르거나 풀리지 않으면 짓지 않는다", () => {
    expect(editJson("[]", [skill("idle")])).toBeNull();
    expect(editJson('{"skillOverrides": []}', [skill("idle")])).toBeNull();
    expect(editJson('{"a": }', [skill("idle")])).toBeNull();
  });
});

describe("빼기(되돌리기)", () => {
  it("열쇠를 빼면 그 항목과 쉼표를 함께 뺀다. 목록에서는 더했던 항목만 뺀다", () => {
    const del = (name: string): JsonOp => ({ op: "delete", parent: "skillOverrides", name });
    expect(editJson('{\n  "skillOverrides": {\n    "a": "on",\n    "idle": "off"\n  }\n}\n', [del("idle")])).toBe('{\n  "skillOverrides": {\n    "a": "on"\n  }\n}\n');
    expect(editJson('{\n  "skillOverrides": {\n    "idle": "off",\n    "a": "on"\n  }\n}\n', [del("idle")])).toBe('{\n  "skillOverrides": {\n    "a": "on"\n  }\n}\n');
    expect(editJson('{\n  "skillOverrides": {\n    "idle": "off"\n  }\n}\n', [del("idle")])).toBe('{\n  "skillOverrides": {}\n}\n');
    const remove: JsonOp = { op: "remove", parent: "deniedMcpServers", entry: { serverName: "db" } };
    expect(editJson('{\n  "deniedMcpServers": [\n    { "serverName": "old" },\n    { "serverName": "db" }\n  ]\n}\n', [remove])).toBe('{\n  "deniedMcpServers": [\n    { "serverName": "old" }\n  ]\n}\n');
    // 다른 칸이 든 항목은 이 도구가 더한 것이 아니라 빼지 않는다
    expect(editJson('{"deniedMcpServers": [{"serverName": "db", "x": 1}]}', [remove])).toBeNull();
  });
});

describe("뜻 비교(16.3)", () => {
  it("원본에 승인받은 변경만 넣은 것과 후보가 같아야 한다", () => {
    const original = '{\n  "x": 1\n}\n';
    expect(jsonMeaningOk(original, '{\n  "x": 1,\n  "skillOverrides": {"idle": "off"}\n}\n', [skill("idle")])).toBe(true);
    expect(jsonMeaningOk(original, '{\n  "x": 2,\n  "skillOverrides": {"idle": "off"}\n}\n', [skill("idle")])).toBe(false);
    expect(jsonMeaningOk(original, '{\n  "x": 1\n}\n', [skill("idle")])).toBe(false);
    expect(jsonMeaningOk(null, '{"skillOverrides": {"idle": "off"}}', [skill("idle")])).toBe(true);
    expect(jsonMeaningOk(original, "{", [skill("idle")])).toBe(false);
  });
});
