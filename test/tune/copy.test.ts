// 정비 계획의 문장(항목마다 제목·바꾸는 것·영향 범위·되돌리는 법·자동으로 고칠 수 없는 까닭, 실행 알림)을 두 언어로 시험한다(「6단계 1부 계획 전 결정」 8번)
import { describe, expect, it } from "vitest";
import { slots } from "../../src/core/copy/format.ts";
import { parseCodexConfig } from "../../src/scan/codex-config.ts";
import { TUNE_COPY, tuneItemText, tuneNoticeText } from "../../src/tune/copy.ts";
import type { TuneBlock, TuneItem } from "../../src/tune/items.ts";

const FILE = "/home/u/.claude/settings.json";
const item = (input: Partial<TuneItem> = {}): TuneItem => ({
  id: "A1:claude-code:idle",
  unit: "A1",
  rule: "E5",
  tool: "claude-code",
  target: "idle",
  file: FILE,
  layer: "user",
  key: { kind: "json-entry", parent: "skillOverrides", name: "idle" },
  next: "off",
  impact: { unit: "A1", skills: { user: 1, project: 2, plugin: 0 } },
  blocked: null,
  ...input,
});
const BLOCKS: TuneBlock[] = ["unverified-version", "file-missing", "file-unreadable", "not-regular", "byte-order-mark", "not-json-object", "parent-shape", "value-shape", "not-toml", "table-shape"];

describe("항목의 문장", () => {
  it("스킬 끄기는 무엇을, 어디를, 영향 범위, 되돌리는 법을 말한다. 지금 값이 없으면 정하지 않았다고 적는다", () => {
    expect(tuneItemText(item(), "ko")).toEqual({
      title: "안 쓰는 스킬 끄기: idle",
      change: `${FILE}의 skillOverrides에서 이름 "idle"의 값을 "off"로 바꿉니다(지금은 정하지 않음).`,
      impact: "이 이름으로 사용자 폴더의 스킬 1개, 프로젝트의 스킬 2개, 플러그인의 스킬 0개가 함께 꺼집니다. 이 PC의 모든 프로젝트에 듣습니다.",
      blocked: null,
      undo: "적용한 뒤 aq tune undo로 되돌릴 수 있습니다.",
    });
    expect(tuneItemText(item({ current: "on" }), "ko").change).toBe(`${FILE}의 skillOverrides에서 이름 "idle"의 값을 "off"로 바꿉니다(지금은 "on").`);
    expect(tuneItemText(item({ current: "on" }), "en").change).toBe(`In ${FILE}, set "idle" under skillOverrides to "off" (now "on").`);
  });

  it("플러그인 끄기, 서버 막기, 서버 끄기도 그 단위의 자리와 영향 범위를 말한다", () => {
    const a2 = tuneItemText(item({ unit: "A2", target: "p@m", key: { kind: "json-entry", parent: "enabledPlugins", name: "p@m" }, current: true, next: false, impact: { unit: "A2", skills: 3 } }), "ko");
    expect([a2.title, a2.change, a2.impact]).toEqual(["안 쓰는 플러그인 끄기: p@m", `${FILE}의 enabledPlugins에서 설치 ID "p@m"의 값을 false로 바꿉니다(지금은 true).`, "이 플러그인에는 스킬 3개만 들어 있습니다."]);
    const a3 = tuneItemText(item({ unit: "A3", target: "db", key: { kind: "json-list-add", parent: "deniedMcpServers", entry: { serverName: "db" } }, next: { serverName: "db" }, impact: { unit: "A3", sameName: { local: 1, project: 0, claudeAi: 2 } } }), "ko");
    expect([a3.title, a3.change, a3.impact]).toEqual(["안 쓰는 MCP 서버 막기: db", `${FILE}의 deniedMcpServers 목록에 { "serverName": "db" } 항목을 더합니다.`, "같은 이름의 로컬 범위 서버 1개, 프로젝트 범위 서버 0개, claude.ai 연결 2개도 함께 막힙니다. 이 PC에서 이 이름으로 정의된 서버 모두에 듣습니다."]);
    const codexFile = "/home/u/.codex/config.toml";
    const a4 = tuneItemText(item({ unit: "A4", tool: "codex", target: "db", file: codexFile, key: { kind: "toml-table-key", table: "db", key: "enabled" }, next: false, impact: { unit: "A4", projects: 1 } }), "en");
    expect([a4.title, a4.change, a4.impact]).toEqual(["Turn off an unused Codex MCP server: db", `In ${codexFile}, write enabled = false in the [mcp_servers.db] table (now not set).`, "It applies to all of Codex. 1 trusted project that redefines this server is turned off too unless it sets enabled."]);
  });

  it("자동으로 고칠 수 없는 항목은 그 까닭을 말하고 되돌리는 법은 없다", () => {
    const blocked = tuneItemText(item({ blocked: "not-json-object" }), "ko");
    expect([blocked.blocked, blocked.undo]).toEqual(["설정 파일이 표준 JSON이 아니어서(주석이 든 JSON도 그렇습니다) 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.", null]);
    expect(tuneItemText(item({ blocked: "unverified-version" }), "ko").blocked).toBe("Claude Code의 버전이 이 도구가 확인한 범위 밖이라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.");
    expect(tuneItemText(item({ blocked: "parent-shape" }), "en").blocked).toBe("skillOverrides in the settings file is not in the expected shape, so it is not changed automatically. Change it yourself as described above.");
  });

  it("두 언어 모두 단위마다, 까닭마다 문장이 있고 마침표로 끝나며 채우지 않은 자리가 남지 않는다", () => {
    for (const lang of ["en", "ko"] as const) {
      expect(Object.keys(TUNE_COPY[lang].blocked).sort()).toEqual([...BLOCKS].sort());
      for (const block of BLOCKS) {
        const text = tuneItemText(item({ blocked: block }), lang).blocked!;
        expect(text, `${lang} ${block}`).toMatch(/[.!?]$/);
        expect(slots(text)).toEqual([]);
      }
      for (const unit of ["A1", "A2", "A3", "A4"] as const) expect(TUNE_COPY[lang].title[unit]).toMatch(/: \{name\}$/);
    }
  });
});

describe("예상한 꼴이 아닌 지금 값", () => {
  it("지금 값이 예상한 꼴이 아닌 항목은 지금 값을 적지 않고 그 까닭을 말한다(6단계 1부 계획 리뷰 1차)", () => {
    const text = tuneItemText(item({ blocked: "value-shape" }), "ko");
    expect(text.change).toBe(`${FILE}의 skillOverrides에서 이름 "idle"의 값을 "off"로 바꿉니다(지금은 예상하지 못한 값).`);
    expect([text.blocked, text.undo]).toEqual(["지금 값이 예상한 꼴이 아니라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.", null]);
    expect(tuneItemText(item({ blocked: "value-shape" }), "en").change).toBe(`In ${FILE}, set "idle" under skillOverrides to "off" (now an unexpected value).`);
  });
});

describe("설정 글의 이름(6단계 1부 구현 검증)", () => {
  const codexFile = "/home/u/.codex/config.toml";
  const a4 = (table: string, input: Partial<TuneItem> = {}) =>
    item({ unit: "A4", tool: "codex", target: table, file: codexFile, key: { kind: "toml-table-key", table, key: "enabled" }, next: false, impact: { unit: "A4", projects: 0 }, ...input });

  it("TOML 표 이름은 맨 열쇠로 쓸 수 있으면 그대로 적고, 아니면 큰따옴표로 싸서 이스케이프한다. 적은 머리를 해석기에 넣으면 그 이름 하나가 나온다", () => {
    expect(tuneItemText(a4("db.prod"), "ko").change).toBe(`${codexFile}의 [mcp_servers."db.prod"] 표에 enabled = false를 적습니다(지금은 정하지 않음).`);
    expect(tuneItemText(a4("db.prod", { blocked: "table-shape" }), "en").blocked).toBe(
      'The [mcp_servers."db.prod"] table is not written as one multi-line table (it uses an inline table or dotted keys), so it is not changed automatically. Change it yourself as described above.',
    );
    expect(tuneItemText(a4("my_db-1"), "en").change).toBe(`In ${codexFile}, write enabled = false in the [mcp_servers.my_db-1] table (now not set).`);
    for (const name of ["db.prod", 'd"b', "a\\b", "d\tb", "데이터", "a b", "x\u007fy"]) {
      const header = /\[mcp_servers\.(.+)\] 표에/.exec(tuneItemText(a4(name), "ko").change)![1];
      const servers = parseCodexConfig(`[mcp_servers.${header}]\ncommand = "x"\n`)?.mcp_servers as Record<string, unknown> | undefined;
      expect(Object.keys(servers ?? {}), name).toEqual([name]);
    }
  });

  it("JSON의 이름은 JSON 문자열로 적는다. 보통 이름의 문장은 그대로다", () => {
    const a1 = item({ target: 'a"b', key: { kind: "json-entry", parent: "skillOverrides", name: 'a"b' } });
    expect(tuneItemText(a1, "ko").change).toBe(`${FILE}의 skillOverrides에서 이름 "a\\"b"의 값을 "off"로 바꿉니다(지금은 정하지 않음).`);
    const a3 = item({ unit: "A3", target: "a\\b", key: { kind: "json-list-add", parent: "deniedMcpServers", entry: { serverName: "a\\b" } }, next: { serverName: "a\\b" }, impact: { unit: "A3", sameName: { local: 0, project: 0, claudeAi: 0 } } });
    const entry = /목록에 (\{ .+ \}) 항목을/.exec(tuneItemText(a3, "ko").change)![1]!;
    expect(JSON.parse(entry)).toEqual({ serverName: "a\\b" });
    expect(tuneItemText(item(), "en").change).toBe(`In ${FILE}, set "idle" under skillOverrides to "off" (now not set).`);
  });
});

describe("실행 알림의 문장", () => {
  it("저장하지 않은 계획과 저장하지 못한 계획은 적용할 수 없다고 알린다", () => {
    expect(tuneNoticeText({ kind: "not_saved" }, "ko")).toBe("저장하지 않은 계획이라 적용할 수 없습니다. 적용하려면 --no-save 없이 다시 계획하세요.");
    expect(tuneNoticeText({ kind: "plan_unsaved", code: "EACCES" }, "ko")).toBe("상태 폴더에 계획을 쓰지 못해(EACCES) 적용할 수 없습니다.");
    expect(tuneNoticeText({ kind: "plan_unsaved", code: "EACCES" }, "en")).toBe("The plan could not be written to the state folder (EACCES), so it cannot be applied.");
  });
});
