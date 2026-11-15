// Codex 설정 층에서 스캐너가 쓰는 값을 꺼내는지 시험한다. 프로젝트의 신뢰, 승인과 샌드박스의 값, 플러그인 기능, 지침의 fallback 이름과 한도(설계 「5단계 2부 계획 전 결정」 2·4·5·8번)
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePath } from "../../src/adapters/claude/locate.ts";
import { parseCodexConfig, type TomlTable } from "../../src/scan/codex-config.ts";
import { fallbackNames, pluginsFeatureOn, projectDocDisabled, safetyOf, trustOf } from "../../src/scan/codex-settings.ts";

const doc = (text: string): TomlTable => {
  const value = parseCodexConfig(text);
  if (value === null) throw new Error("풀리지 않았다");
  return value;
};
/** 경로를 TOML 기본 문자열로 적는다 */
const quoted = (path: string): string => JSON.stringify(path);

describe("trustOf", () => {
  const root = join(process.cwd(), "work", "proj");
  const norm = normalizePath(root);

  it("뿌리와 같은 경로의 trust_level을 본다. trusted와 untrusted만 기록이고 그 밖은 기록이 없다", () => {
    expect(trustOf(doc(`[projects.${quoted(root)}]\ntrust_level = "trusted"\n`), root)).toBe("trusted");
    expect(trustOf(doc(`[projects.${quoted(root)}]\ntrust_level = "untrusted"\n`), root)).toBe("untrusted");
    expect(trustOf(doc(`[projects.${quoted(root)}]\ntrust_level = "sometimes"\n`), root)).toBeNull();
    expect(trustOf(doc(`[projects.${quoted(root)}]\nother = 1\n`), root)).toBeNull();
    expect(trustOf(doc(""), root)).toBeNull();
  });

  it("구분 기호와 끝의 /. 를 맞춰 견주고, 하위 폴더나 위 폴더의 열쇠는 보지 않는다", () => {
    expect(trustOf(doc(`[projects.${quoted(`${root.replace(/\\/g, "/")}/.`)}]\ntrust_level = "trusted"\n`), root)).toBe("trusted");
    expect(trustOf(doc(`[projects.${quoted(join(root, "sub"))}]\ntrust_level = "trusted"\n`), root)).toBeNull();
    expect(trustOf(doc(`[projects.${quoted(join(root, ".."))}]\ntrust_level = "trusted"\n`), root)).toBeNull();
  });

  it.runIf(process.platform === "win32")("Windows에서는 ASCII 글자의 대소문자만 가리지 않는다. ASCII 밖의 글자는 Codex처럼 대소문자를 가린다(계획 리뷰 1차의 재확인)", () => {
    const asciiUpper = (path: string): string => path.replace(/[a-z]/g, (letter) => letter.toUpperCase());
    expect(trustOf(doc(`[projects.${quoted(asciiUpper(root))}]\ntrust_level = "trusted"\n`), root)).toBe("trusted");
    const accented = join(process.cwd(), "work", "proj-\u00e9");
    expect(trustOf(doc(`[projects.${quoted(asciiUpper(accented))}]\ntrust_level = "trusted"\n`), accented)).toBe("trusted");
    expect(trustOf(doc(`[projects.${quoted(asciiUpper(accented).replace(/\u00e9$/, "\u00c9"))}]\ntrust_level = "trusted"\n`), accented)).toBeNull();
  });

  it("맞는 열쇠가 여럿이면 원래 열쇠의 사전순으로 첫째인 것의 값이다. 기록이 아닌 값의 열쇠는 후보가 아니다", () => {
    const slashed = `${root.replace(/\\/g, "/")}/.`;
    const [first, second] = [root, slashed].sort();
    const text = `[projects.${quoted(first!)}]\ntrust_level = "untrusted"\n[projects.${quoted(second!)}]\ntrust_level = "trusted"\n`;
    expect(trustOf(doc(text), root)).toBe("untrusted");
    // 적은 차례가 거꾸로여도 사전순으로 고른다
    const reversed = `[projects.${quoted(second!)}]\ntrust_level = "trusted"\n[projects.${quoted(first!)}]\ntrust_level = "untrusted"\n`;
    expect(trustOf(doc(reversed), root)).toBe("untrusted");
    const skipped = `[projects.${quoted(first!)}]\ntrust_level = "maybe"\n[projects.${quoted(second!)}]\ntrust_level = "trusted"\n`;
    expect(trustOf(doc(skipped), root)).toBe("trusted");
  });

  it("뿌리를 Codex의 꼴(Windows에서는 ASCII 글자를 소문자로)로 적은 열쇠가 있으면 사전순보다 먼저 그것의 값이다(계획 리뷰 1차)", () => {
    const exact = process.platform === "win32" ? root.replace(/[A-Z]/g, (letter) => letter.toLowerCase()) : root;
    // 같은 뿌리를 가리키면서 사전순으로 앞서는 다른 표기
    const other = process.platform === "win32" ? root.toUpperCase() : root.replace(/\/([^/]+)$/, "//$1");
    expect(normalizePath(other)).toBe(norm);
    expect(other < exact).toBe(true);
    const text = `[projects.${quoted(other)}]\ntrust_level = "untrusted"\n[projects.${quoted(exact)}]\ntrust_level = "trusted"\n`;
    expect(trustOf(doc(text), root)).toBe("trusted");
    // 맞는 꼴이 없으면 사전순이다
    expect(trustOf(doc(`[projects.${quoted(other)}]\ntrust_level = "untrusted"\n`), root)).toBe("untrusted");
  });
});

describe("safetyOf", () => {
  it("승인 값을 가른다. on-failure는 on-request의 옛 이름이고, 묶음은 granular다", () => {
    expect(safetyOf([doc('approval_policy = "never"\n')]).approval).toBe("never");
    expect(safetyOf([doc('approval_policy = "on-request"\n')]).approval).toBe("on-request");
    expect(safetyOf([doc('approval_policy = "on-failure"\n')]).approval).toBe("on-request");
    expect(safetyOf([doc('approval_policy = "untrusted"\n')]).approval).toBe("untrusted");
    expect(safetyOf([doc("approval_policy = { granular = { sandbox_approval = false, rules = false, mcp_elicitations = false } }\n")]).approval).toBe("granular");
    expect(safetyOf([doc('approval_policy = "someday"\n')]).approval).toBe("other");
    expect(safetyOf([doc("")]).approval).toBeNull();
  });

  it("샌드박스 값과 권한 프로필의 전면 접근을 가른다", () => {
    expect(safetyOf([doc('sandbox_mode = "danger-full-access"\n')]).sandbox).toBe("danger-full-access");
    expect(safetyOf([doc('sandbox_mode = "workspace-write"\n')]).sandbox).toBe("workspace-write");
    expect(safetyOf([doc('sandbox_mode = "read-only"\n')]).sandbox).toBe("read-only");
    expect(safetyOf([doc('sandbox_mode = "elsewhere"\n')]).sandbox).toBe("other");
    expect(safetyOf([doc("")]).sandbox).toBeNull();
    expect(safetyOf([doc('default_permissions = ":danger-full-access"\n')]).permissions).toBe("danger-full-access");
    expect(safetyOf([doc('default_permissions = ":workspace"\n')]).permissions).toBe("other");
    expect(safetyOf([doc("")]).permissions).toBeNull();
  });

  it("전면 해제는 마지막으로 sandbox_mode나 default_permissions를 적은 층의 방식으로 본다. 같은 층에 둘 다 있으면 default_permissions다(계획 리뷰 1차)", () => {
    const full = (...layers: string[]): boolean => safetyOf(layers.map(doc)).fullAccess;
    expect(full('sandbox_mode = "danger-full-access"\n')).toBe(true);
    expect(full('default_permissions = ":danger-full-access"\n')).toBe(true);
    expect(full("")).toBe(false);
    // 사용자 층은 전면 해제인데 프로젝트 층이 다른 방식으로 읽기 전용을 고른다
    expect(full('approval_policy = "never"\nsandbox_mode = "danger-full-access"\n', 'default_permissions = ":read-only"\n')).toBe(false);
    expect(full('default_permissions = ":danger-full-access"\n', 'sandbox_mode = "read-only"\n')).toBe(false);
    // 위 층이 방식을 적지 않으면 아래 층의 방식이 이어진다
    expect(full('sandbox_mode = "danger-full-access"\n', 'approval_policy = "never"\n')).toBe(true);
    // 같은 층에 둘 다 있으면 default_permissions의 방식이다
    expect(full('sandbox_mode = "danger-full-access"\ndefault_permissions = ":workspace"\n')).toBe(false);
    expect(full('sandbox_mode = "read-only"\ndefault_permissions = ":danger-full-access"\n')).toBe(true);
    // 아래 층이 프로필 방식이어도 위 층이 sandbox_mode를 적으면 다시 그 방식이다
    expect(full('sandbox_mode = "danger-full-access"\ndefault_permissions = ":workspace"\n', 'sandbox_mode = "danger-full-access"\n')).toBe(true);
    const merged = safetyOf([doc('approval_policy = "never"\n'), doc('approval_policy = "on-request"\n')]);
    expect(merged.approval).toBe("on-request");
  });
});

describe("pluginsFeatureOn", () => {
  it("features.plugins가 거짓일 때만 꺼진다(기본은 켜짐)", () => {
    expect(pluginsFeatureOn(doc(""))).toBe(true);
    expect(pluginsFeatureOn(doc("[features]\nplugins = true\n"))).toBe(true);
    expect(pluginsFeatureOn(doc("[features]\nplugins = false\n"))).toBe(false);
    expect(pluginsFeatureOn(doc("[features]\nother = false\n"))).toBe(true);
  });
});

describe("fallbackNames", () => {
  it("앞뒤 공백을 떼고, Codex가 버리는 이름과 겹치는 이름을 뺀다", () => {
    const names = doc('project_doc_fallback_filenames = [" CLAUDE.md ", "", "   ", ".", "..", "a/b", "nul\\u0000x", "AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "GUIDE.md"]\n');
    expect(fallbackNames(names, "linux")).toEqual(["CLAUDE.md", "GUIDE.md"]);
  });

  it("Windows에서는 \\와 :가 든 이름도 버린다", () => {
    const names = doc('project_doc_fallback_filenames = ["a\\\\b.md", "c:d.md", "ok.md"]\n');
    expect(fallbackNames(names, "win32")).toEqual(["ok.md"]);
    expect(fallbackNames(names, "linux")).toEqual(["a\\b.md", "c:d.md", "ok.md"]);
  });

  it("적지 않았으면 없다", () => {
    expect(fallbackNames(doc(""), "linux")).toEqual([]);
  });
});

describe("projectDocDisabled", () => {
  it("project_doc_max_bytes가 0이면 프로젝트 지침을 끈다", () => {
    expect(projectDocDisabled(doc("project_doc_max_bytes = 0\n"))).toBe(true);
    expect(projectDocDisabled(doc("project_doc_max_bytes = 1\n"))).toBe(false);
    expect(projectDocDisabled(doc("project_doc_max_bytes = 9223372036854775807\n"))).toBe(false);
    expect(projectDocDisabled(doc(""))).toBe(false);
  });
});
