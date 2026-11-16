// 설정에 그대로 적힌 비밀값의 자리 찾기를 시험한다. 이름과 값의 모양으로 가리고, 참조와 자리표시는 넘기며, 밖으로는 항목 이름만 낸다(설계 「0.2.0에서 정한 것」)
import { describe, expect, it } from "vitest";
import { envSecretKeys, secretSpots } from "../../src/scan/secrets.ts";

const GH = `ghp_${"a1B2".repeat(9)}`;
const ANT = `sk-ant-${"b".repeat(32)}`;
const SLACK = `xoxb-${"1".repeat(12)}-${"c".repeat(12)}`;

describe("secretSpots", () => {
  it("env에서 이름이 키·토큰·비밀번호처럼 보이는 그대로 적힌 값의 이름을 낸다", () => {
    const spots = secretSpots({ command: "x", env: { GITHUB_TOKEN: GH, API_KEY: "abcd1234efgh", DB_PASSWORD: "hunter2hunter2", DEBUG: "true", HOME_DIR: "/usr/local/bin" } });
    expect(spots).toEqual([
      { field: "env", key: "GITHUB_TOKEN" },
      { field: "env", key: "API_KEY" },
      { field: "env", key: "DB_PASSWORD" },
    ]);
  });

  it("참조(${VAR}, $VAR, %VAR%), 자리표시, 짧은 값, 환경 변수 이름을 가리키는 항목은 넘긴다", () => {
    const spots = secretSpots({
      env: {
        OPENAI_API_KEY: "${OPENAI_API_KEY}",
        TOKEN: "$TOKEN",
        SECRET: "%SECRET%",
        AUTH: "Bearer ${TOKEN}",
        PASSWORD: "<your-password>",
        API_KEY: "your_api_key_here",
        CLIENT_SECRET: "xxxxxxxxxxxx",
        SESSION_TOKEN: "aaaaaaaaaaaaaaaa",
        KEY: "short",
        TOKEN_ENV_VAR: "MY_SERVICE_TOKEN",
      },
      bearer_token_env_var: "GITHUB_TOKEN",
      env_http_headers: { Authorization: "AUTH_HEADER_VALUE" },
    });
    expect(spots).toEqual([]);
  });

  it("값이 잘 알려진 키 모양이면 이름과 상관없이 잡는다", () => {
    expect(secretSpots({ env: { FOO: SLACK, BAR: "plain" } })).toEqual([{ field: "env", key: "FOO" }]);
  });

  it("머리말(Claude의 headers, Codex의 http_headers)과 Codex의 bearer_token을 본다", () => {
    expect(secretSpots({ type: "http", url: "https://mcp.example/mcp", headers: { Authorization: "Bearer abcdefghijklmnopqrstuvwx", "X-Trace": "trace-id-12345" } })).toEqual([{ field: "headers", key: "Authorization" }]);
    expect(secretSpots({ url: "https://x.example", http_headers: { "X-API-Key": "k-1234567890abcd" }, bearer_token: "abc123def456ghi789" })).toEqual([
      { field: "headers", key: "X-API-Key" },
      { field: "field", key: "bearer_token" },
    ]);
  });

  it("인자에서 비밀 옵션 다음 값, --옵션=값, 키 모양의 값을 잡는다. 키 모양의 값은 몇 번째 인자인지로 가리킨다", () => {
    const spots = secretSpots({ command: "npx", args: ["-y", "some-mcp", "--api-key", "abcdef123456", "--token=tk_9f8e7d6c5b4a", "--verbose", "--name", "my-server-name", ANT] });
    expect(spots).toEqual([
      { field: "args", key: "--api-key" },
      { field: "args", key: "--token" },
      { field: "args", key: "#9" },
    ]);
  });

  it("주소의 비밀번호와 비밀처럼 보이는 질의 값을 잡는다", () => {
    expect(secretSpots({ url: "https://user:pa55w0rd99@host.example/mcp?api_key=abcdef123456&mode=fast&token=${T}" })).toEqual([
      { field: "url", key: "password" },
      { field: "url", key: "api_key" },
    ]);
    expect(secretSpots({ url: "not a url" })).toEqual([]);
  });

  it("정의가 없거나 모양이 다르면 빈 목록이고, 결과에는 값이 들지 않는다", () => {
    expect(secretSpots(null)).toEqual([]);
    expect(secretSpots({ env: "API_KEY=abc", args: "x", headers: ["a"] })).toEqual([]);
    const spots = secretSpots({ env: { GITHUB_TOKEN: GH }, args: ["--api-key", "abcdef123456"], url: "https://h.example/?token=qwertyuiop123" });
    const text = JSON.stringify(spots);
    for (const value of [GH, "abcdef123456", "qwertyuiop123"]) expect(text).not.toContain(value);
  });
});

describe("envSecretKeys", () => {
  it("설정의 env에서 그대로 적힌 비밀값의 이름만 낸다", () => {
    expect(envSecretKeys({ ANTHROPIC_API_KEY: ANT, EDITOR: "vim", PROXY_TOKEN: "${PROXY}" })).toEqual(["ANTHROPIC_API_KEY"]);
    expect(envSecretKeys(undefined)).toEqual([]);
    expect(envSecretKeys(["x"])).toEqual([]);
  });
});
